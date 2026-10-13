/* OK Clip Saver background: common source, Chrome MV3 SW / Firefox MV3 event page. */
if (typeof MediaTools === 'undefined' && typeof importScripts === 'function') importScripts('media.js');
const M = globalThis.MediaTools;
const requestQueues = new Map();
const CAPTURE_PREFIX = 'captured:';
const SESSION = chrome.storage.session || chrome.storage.local;
const call = (fn, ...args) => new Promise((resolve, reject) => {
  try {
    fn(...args, result => {
      const err = chrome.runtime.lastError;
      err ? reject(new Error(err.message)) : resolve(result);
    });
  } catch (err) { reject(err); }
});

function okSource(url) {
  try { const h = new URL(url).hostname.toLowerCase(); return h === 'ok.ru' || h.endsWith('.ok.ru') || h === 'odnoklassniki.ru' || h.endsWith('.odnoklassniki.ru'); }
  catch { return false; }
}

function rememberMedia(details) {
  if (details.tabId < 0 || !M.isMediaRequest(details.url)) return;
  // Capture only requests initiated by OK.ru. No browsing history or remote telemetry.
  if (!okSource(details.initiator || details.originUrl || details.documentUrl || '')) return;
  const tabId = details.tabId;
  const key = CAPTURE_PREFIX + tabId;
  const next = (requestQueues.get(tabId) || Promise.resolve()).catch(() => {}).then(async () => {
    const stored = await call(SESSION.get.bind(SESSION), key);
    const previous = Array.isArray(stored[key]) ? stored[key] : [];
    if (previous.some(c => c.url === details.url)) return;
    const c = M.makeCandidate ? M.makeCandidate(details.url, 'OK.ru network') : null;
    const candidate = c || {url: details.url, format: M.formatOf(details.url), quality: 'Stream', source: 'OK.ru network', qualityKey: ''};
    await call(SESSION.set.bind(SESSION), {[key]: [...previous.slice(-59), candidate]});
  });
  requestQueues.set(tabId, next);
  next.finally(() => { if (requestQueues.get(tabId) === next) requestQueues.delete(tabId); });
}
chrome.webRequest.onBeforeRequest.addListener(rememberMedia, { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] });
chrome.tabs.onRemoved.addListener(tabId => {
  requestQueues.delete(tabId);
  call(SESSION.remove.bind(SESSION), CAPTURE_PREFIX + tabId).catch(() => {});
});

async function fetchOkMetadata(id, log) {
  const candidates = [], licenses = [];
  let title = '';
  const embedUrl = `https://ok.ru/videoembed/${id}`;
  try {
    const r = await fetch(embedUrl, {credentials: 'include', redirect: 'follow', signal: AbortSignal.timeout(12000)});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const result = M.extractEmbedHtml(html);
    candidates.push(...result.candidates); licenses.push(...result.licenses);
    title ||= result.title;
    log.push(`Embed metadata: ${result.candidates.length} media URLs found`);
  } catch (err) { log.push('Embed metadata unavailable: ' + String(err.message)); }
  if (!candidates.some(c => c.format === 'mp4' || c.format === 'webm')) {
    try {
      const response = await fetch('https://www.ok.ru/dk?cmd=videoPlayerMetadata', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
        body: new URLSearchParams({mid: id}).toString(),
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const result = M.collectMetadata(data, 'OK.ru player API');
      candidates.push(...result.candidates); licenses.push(...result.licenses);
      title ||= result.title;
      log.push(`Player API: ${result.candidates.length} media URLs found`);
    } catch (err) { log.push('Player API unavailable: ' + String(err.message)); }
  }
  return {candidates, licenses, title};
}

async function scanPage(message) {
  const log = ['Started page scan.'];
  let page = message.page || {};
  let url = M.normalizeUrl(message.url || page.url || '');
  if (!url) throw new Error('Open an OK.ru video page or enter a valid URL.');
  const ids = new Set();
  const main = M.extractVideoId(url);
  if (main) ids.add(main);
  for (const embed of page.embeds || []) {
    const id = M.extractVideoId(embed);
    if (id && ids.size < 2) ids.add(id);
  }
  const candidates = [], licenses = [];
  let title = String(page.title || '').slice(0, 180);
  for (const item of page.media || []) {
    const candidate = M.makeCandidate(item.url, item.source || 'page', {quality: item.quality});
    if (candidate) candidates.push(candidate);
  }
  licenses.push(...(page.licenses || []));
  log.push(`Page inspection: ${candidates.length} media URLs; ${licenses.length} license declarations.`);
  // Include media requests observed since the page started playback.
  if (Number.isInteger(message.tabId) && message.tabId >= 0) {
    try {
      const key = CAPTURE_PREFIX + message.tabId;
      if (requestQueues.get(message.tabId)) await requestQueues.get(message.tabId).catch(() => {});
      const record = await call(SESSION.get.bind(SESSION), key);
      const captured = record[key] || [];
      candidates.push(...captured);
      log.push(`Media traffic: ${captured.length} requests observed.`);
    } catch (err) { log.push('Media traffic unavailable: ' + err.message); }
  }
  for (const id of ids) {
    const result = await fetchOkMetadata(id, log);
    candidates.push(...result.candidates); licenses.push(...result.licenses);
    // Prefer title on the page, except when blank or a generic browser title.
    if ((!title || /^(OK|Odnoklassniki|Одноклассники|Video)$/i.test(title)) && result.title) title = result.title;
  }
  const uniqueLicenses = licenses.filter((entry, i, arr) =>
    entry && entry.label && arr.findIndex(e => e?.label === entry.label) === i).slice(0, 8);
  const results = M.uniqCandidates(candidates);
  log.push(`Finished: ${results.length} unique media URLs.`);
  if (page.hasBlobVideo && !results.length) log.push('Video uses a blob URL. Play the video, then scan again.');
  if (!results.length) log.push('No exposed download URL found. DRM/protected playback is not supported.');
  return {candidates: results, licenses: uniqueLicenses, title: title || 'OK video',
    videoId: main || [...ids][0] || null, log, pageUrl: url};
}

async function beginDownload(message) {
  const c = message.candidate;
  const url = M.normalizeUrl(c?.url);
  if (!url) throw new Error('Invalid download URL.');
  const kind = M.formatOf(url, c.format);
  if (kind === 'dash') throw new Error('DASH manifests are not supported for direct download.');
  const base = M.sanitizeFilename(message.title || 'OK-video');
  if (kind === 'hls') {
    const jobId = crypto.randomUUID();
    await call(SESSION.set.bind(SESSION), {['hlsjob:' + jobId]: {url, title: base, created: Date.now()}});
    await call(chrome.tabs.create.bind(chrome.tabs), {url: chrome.runtime.getURL('hls.html') + '?job=' + encodeURIComponent(jobId)});
    return {status:'hls-opened'};
  }
  const ext = ['mp4','webm','mov','ts'].includes(kind) ? kind : 'mp4';
  const filename = `OK Clip Saver/${base}${message.quality ? ' - ' + M.sanitizeFilename(message.quality) : ''}.${ext}`;
  const id = await call(chrome.downloads.download.bind(chrome.downloads), {url, filename, conflictAction:'uniquify', saveAs:false});
  if (!Number.isInteger(id)) throw new Error('Browser did not accept the download.');
  return {status:'started', downloadId:id};
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'SCAN': return await scanPage(message);
      case 'DOWNLOAD': return await beginDownload(message);
      case 'HLS_JOB': {
        const key = 'hlsjob:' + String(message.jobId || '');
        const record = await call(SESSION.get.bind(SESSION), key);
        const job = record[key];
        if (!job || Date.now() - job.created > 3_600_000) throw new Error('This streaming download link expired. Reopen the popup.');
        await call(SESSION.remove.bind(SESSION), key);
        return job;
      }
      default: throw new Error('Unknown command.');
    }
  })().then(data => sendResponse({ok:true, data}), err => sendResponse({ok:false,error:String(err.message || err)}));
  return true;
});
