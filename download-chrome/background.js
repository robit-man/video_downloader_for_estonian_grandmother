/* OK Clip Saver background: common source, Chrome MV3 SW / Firefox MV3 event page. */
if (typeof MediaTools === 'undefined' && typeof importScripts === 'function') importScripts('media.js');
if (typeof SiteTools === 'undefined' && typeof importScripts === 'function') importScripts('sites.js');
const M = globalThis.MediaTools;
const Sites = globalThis.SiteTools;
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

// Network observation is opt-in per active tab. Nothing is retained until the popup arms it.
const ARMED_PREFIX='armed:';
function rememberMedia(details, typeInfo = null) {
  if (!Number.isInteger(details.tabId) || details.tabId < 0) return;
  // Ignore individual adaptive streaming segments and non-media response bodies.
  if (!typeInfo && !M.isMediaRequest(details.url)) return;
  if (/\.(?:m4s|cmfv|cmfa|ts)(?:$|[?#])/i.test(new URL(details.url).pathname)) return;
  const tabId=details.tabId, key=CAPTURE_PREFIX+tabId;
  const next=(requestQueues.get(tabId)||Promise.resolve()).catch(()=>{}).then(async()=>{
    const arm=await call(SESSION.get.bind(SESSION),ARMED_PREFIX+tabId);
    const record=arm[ARMED_PREFIX+tabId];
    if(!record || Date.now()-record.at>6*60*60*1000)return;
    const stored=await call(SESSION.get.bind(SESSION),key);
    const previous=Array.isArray(stored[key])?stored[key]:[];
    if(previous.some(c=>c.url===details.url))return;
    const format=typeInfo?.format||M.formatOf(details.url);
    const c=M.makeCandidate(details.url,'Observed media traffic', {format,quality:'Original'});
    if(!c)return;
    c.kind=M.isAudio(format,typeInfo?.mime||'')?'audio-only':undefined;
    if(typeInfo?.mime)c.mime=typeInfo.mime;
    await call(SESSION.set.bind(SESSION),{[key]:[...previous.slice(-79),c]});
  });
  requestQueues.set(tabId,next);
  next.finally(()=>{if(requestQueues.get(tabId)===next)requestQueues.delete(tabId)});
}
// Register event listeners synchronously so MV3 service workers can be woken by a media event.
chrome.webRequest.onBeforeRequest.addListener(d=>rememberMedia(d),
  {urls:['<all_urls>'],types:['media','xmlhttprequest','other']});
if(chrome.webRequest.onHeadersReceived)chrome.webRequest.onHeadersReceived.addListener(d=>{
  const type=M.formatFromResponseHeaders(d.responseHeaders||[]);
  if(type)rememberMedia(d,type);
}, {urls:['<all_urls>'],types:['media','xmlhttprequest','other']},['responseHeaders']);
chrome.tabs.onRemoved.addListener(tabId=>{
  requestQueues.delete(tabId);
  call(SESSION.remove.bind(SESSION),[CAPTURE_PREFIX+tabId,ARMED_PREFIX+tabId]).catch(()=>{});
});
if(chrome.tabs.onUpdated)chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.url){
    requestQueues.delete(tabId);
    call(SESSION.remove.bind(SESSION),[CAPTURE_PREFIX+tabId,ARMED_PREFIX+tabId]).catch(()=>{});
  }
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

async function fetchVimeoMetadata(pageUrl, page, log) {
  const collected = {candidates:[],licenses:[],notes:[],title:''};
  const urls=Sites.vimeoConfigUrls(pageUrl,page);
  for (const configUrl of urls) {
    try {
      const response = await fetch(configUrl, {credentials:'include',redirect:'follow',signal:AbortSignal.timeout(11000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result=Sites.parseVimeo(await response.json(), 'Vimeo config');
      collected.candidates.push(...result.candidates);
      collected.licenses.push(...result.licenses);
      collected.notes.push(...result.notes);
      collected.title ||= result.title;
      log.push(`Vimeo config: ${result.candidates.length} files/playlists found.`);
      if (result.candidates.length) break;
    } catch (err) { log.push('Vimeo config unavailable: ' + String(err.message || err)); }
  }
  return collected;
}

async function scanPage(message) {
  const log = ['Started page scan.'];
  const page = message.page || {};
  const url = M.normalizeUrl(message.url || page.url || '');
  if (!url) throw new Error('Enter a valid HTTP(S) video page URL.');
  const site = Sites.platform(url);
  const provider=Sites.recognize ? Sites.recognize(url):{name:site,family:'generic',known:false};
  const candidates=[], licenses=[], notes=[];
  let title = String(page.title || '').slice(0,180);
  for (const item of page.media || []) {
    const candidate = M.makeCandidate(item.url, item.source || 'page', {quality:item.quality,format:item.format});
    if(candidate) candidates.push({...candidate,kind:item.kind||(M.isAudio(candidate.format,item.format)?'audio-only':undefined)});
  }
  for (const item of (page.generic || []).slice(0,150)) {
    const c=M.makeCandidate(item.url,item.source || 'Embedded player',{format:item.format,quality:item.quality});
    if(c)candidates.push({...c,kind:M.isAudio(c.format,item.format)?'audio-only':undefined});
  }
  licenses.push(...(page.licenses || []));
  log.push(`Platform: ${site}; page inspection: ${candidates.length} URLs and ${licenses.length} license declarations.`);
  // Cross-frame player snapshots are collected only when the user presses Scan.
  if (site === 'youtube') {
    for (const snapshot of (page.youtube || []).slice(0,8)) {
      const result=Sites.parseYouTube(snapshot);
      candidates.push(...result.candidates); licenses.push(...result.licenses);
      notes.push(...result.notes); if (result.title) title=result.title;
      log.push(`YouTube player: ${result.candidates.length} formats discovered.`);
    }
    if (!(page.youtube || []).length) notes.push('YouTube player metadata unavailable. Open the video page in the active tab, start playback, and rescan.');
  }
  if (site === 'vimeo') {
    for (const snapshot of (page.vimeo || []).slice(0,8)) {
      const result=Sites.parseVimeo(snapshot);
      candidates.push(...result.candidates); licenses.push(...result.licenses);
      notes.push(...result.notes); if (result.title) title=result.title;
      log.push(`Vimeo page player: ${result.candidates.length} sources discovered.`);
    }
    if (!candidates.some(c=>c.format === 'mp4')) {
      const result=await fetchVimeoMetadata(url,page,log);
      candidates.push(...result.candidates); licenses.push(...result.licenses);
      notes.push(...result.notes); if (result.title) title=result.title;
    }
  }
  if (site === 'ok') {
    const ids=new Set();
    const id=M.extractVideoId(url); if(id) ids.add(id);
    for(const embed of page.embeds || []) {
      const embedId=M.extractVideoId(embed);
      if (embedId && ids.size<2) ids.add(embedId);
    }
    for (const id of ids) {
      const result=await fetchOkMetadata(id,log);
      candidates.push(...result.candidates); licenses.push(...result.licenses);
      if ((!title || /^(OK|Odnoklassniki|Одноклассники|Video)$/i.test(title)) && result.title) title=result.title;
    }
  }
  if (Number.isInteger(message.tabId) && message.tabId >= 0) {
    try {
      const key=CAPTURE_PREFIX+message.tabId;
      if(requestQueues.get(message.tabId)) await requestQueues.get(message.tabId).catch(()=>{});
      const record=await call(SESSION.get.bind(SESSION),key);
      const captured=(record[key] || []).filter(c=>c && c.url);
      candidates.push(...captured);
      log.push(`Media traffic: ${captured.length} requests observed.`);
    } catch (err) {log.push('Media traffic unavailable: '+err.message);}
  }
  if(provider.family==='subscription')notes.push('Subscription platforms commonly use encryption or DRM; detecting a player does not mean an accessible media file exists. Protected streams are not downloaded.');
  if(provider.family==='live')notes.push('Live streams may lack a completed recording; this saver supports available direct files and compatible unencrypted HLS playlists only.');
  const uniqueLicenses=licenses.filter((entry,i,arr)=>entry && entry.label && arr.findIndex(e=>e?.label===entry.label)===i).slice(0,8);
  const results=M.uniqCandidates(candidates).slice(0,75);
  log.push(`Finished: ${results.length} unique media URLs.`);
  if (page.hasBlobVideo && !results.length) log.push('Video uses blob playback. Play the video and scan again.');
  if (!results.length) log.push('No accessible direct download URL found; DRM and protected streams are unsupported.');
  for (const note of [...new Set(notes)]) log.push(note);
  return {candidates:results,licenses:uniqueLicenses,title:title || `${provider.name} media`,siteName:provider.name,
    videoId:site==='youtube'?Sites.youtubeId(url):site==='vimeo'?Sites.vimeoId(url):M.extractVideoId(url),
    platform:site,notes:[...new Set(notes)].slice(0,5),log,pageUrl:url};
}

async function beginDownload(message) {
  const c = message.candidate;
  const url = M.normalizeUrl(c?.url);
  if (!url) throw new Error('Invalid download URL.');
  const kind = M.formatOf(url, c.format);
  if (kind === 'dash') throw new Error('DASH manifests are not supported for direct download.');
  const base = M.sanitizeFilename(message.title || 'media');
  if (kind === 'hls') {
    const jobId = crypto.randomUUID();
    await call(SESSION.set.bind(SESSION), {['hlsjob:' + jobId]: {url, title: base, created: Date.now()}});
    await call(chrome.tabs.create.bind(chrome.tabs), {url: chrome.runtime.getURL('hls.html') + '?job=' + encodeURIComponent(jobId)});
    return {status:'hls-opened'};
  }
  const supported = new Set(['mp4','webm','mov','ts','mp3','m4a','aac','ogg','opus','flac','wav','aiff','wma','3gp','ogv','mkv','mka','amr','mp2']);
  const ext = supported.has(kind) ? kind : 'bin';
  const track = ['audio-only','video-only'].includes(c?.kind) ? ' - ' + c.kind : '';
  const filename = `Clip Saver/${base}${message.quality ? ' - ' + M.sanitizeFilename(message.quality) : ''}${track}.${ext}`;
  const id = await call(chrome.downloads.download.bind(chrome.downloads), {url, filename, conflictAction:'uniquify', saveAs:false});
  if (!Number.isInteger(id)) throw new Error('Browser did not accept the download.');
  return {status:'started', downloadId:id};
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'ARM_CAPTURE': {
        const id=message.tabId;
        if(!Number.isInteger(id)||id<0)throw new Error('Invalid tab ID.');
        await call(SESSION.set.bind(SESSION),{[ARMED_PREFIX+id]:{at:Date.now()}});
        return {status:'armed'};
      }
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
