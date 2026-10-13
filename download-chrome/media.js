/* Shared, dependency-free media discovery and normalization. */
(() => {
  'use strict';
  const VALID_MEDIA = /\.(?:mp4|m4v|webm|mov|m3u8|mpd|ts)(?:$|[?#])/i;
  const TYPE_BY_EXT = { mp4: 'mp4', m4v: 'mp4', webm: 'webm', mov: 'mov', m3u8: 'hls', mpd: 'dash', ts: 'ts' };
  const QUALITY = { ultra: 'Ultra', quad: 'Quad', full: 'Full HD', hd: 'HD', sd: 'SD', high: 'High', medium: 'Medium', low: 'Low', lowest: 'Lowest', mobile: 'Mobile' };

  function decodeEntities(text) {
    return String(text || '').replace(/&(#x[0-9a-f]+|#\d+|quot|apos|amp|lt|gt);/gi, (_m, entity) => {
      const names = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>' };
      const key = entity.toLowerCase();
      if (names[key]) return names[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
      return _m;
    });
  }

  function normalizeUrl(value, base = 'https://ok.ru/') {
    try {
      if (typeof value !== 'string') return null;
      const unescaped = decodeEntities(value).replace(/\\\//g, '/').trim();
      const url = new URL(unescaped, base);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function formatOf(url, hint = '') {
    const lowerHint = String(hint).toLowerCase();
    if (lowerHint === 'hls' || lowerHint.includes('m3u8')) return 'hls';
    if (lowerHint === 'dash' || lowerHint.includes('mpd')) return 'dash';
    if (lowerHint === 'mp4' || lowerHint === 'webm' || lowerHint === 'mov') return lowerHint;
    try {
      const p = new URL(url).pathname.toLowerCase();
      const ext = (p.match(/\.([a-z0-9]+)$/) || [])[1];
      return TYPE_BY_EXT[ext] || (/(\.m3u8|hls|format=m3u8)/i.test(url) ? 'hls' : 'mp4');
    } catch { return 'mp4'; }
  }

  function visibleQuality(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Original';
    const key = raw.toLowerCase();
    return QUALITY[key] || (/^\d{3,4}p$/i.test(raw) ? raw : raw.slice(0, 36));
  }

  function makeCandidate(value, source = 'page', hint = {}) {
    const url = normalizeUrl(value, hint.base);
    if (!url) return null;
    const format = formatOf(url, hint.format || '');
    return { url, format, quality: visibleQuality(hint.quality), source,
      qualityKey: String(hint.quality || '').toLowerCase() };
  }

  function isMediaRequest(url) {
    try {
      const u = new URL(url);
      return /^https?:$/.test(u.protocol) && (VALID_MEDIA.test(u.pathname) ||
        /(?:\/hls\/|\/dash\/|\/video\/|\bformat=(?:mp4|m3u8)|\btype=video|\/video\.?get)/i.test(u.href));
    } catch { return false; }
  }

  function extractVideoId(url) {
    const text = String(url || '');
    return (/\/(?:video|videoembed)\/(\d{6,22})(?:[/?#]|$)/i.exec(text) ||
       /[?&](?:mid|st\.mvId|videoId)=(\d{6,22})/i.exec(text) || [])[1] || null;
  }

  function collectMetadata(metadata, source = 'OK.ru metadata') {
    const candidates = [], licenses = [];
    const meta = typeof metadata === 'string' ? safeJson(metadata) : metadata;
    if (!meta || typeof meta !== 'object') return { candidates, licenses, title: '' };
    const movie = meta.movie && typeof meta.movie === 'object' ? meta.movie : {};
    const title = String(movie.title || meta.title || movie.name || '').slice(0, 180);
    const declaredLicense = movie.license || meta.license;
    if (typeof declaredLicense === 'string' && declaredLicense.trim()) licenses.push({ label: declaredLicense.trim().slice(0, 180), source });
    const videos = Array.isArray(meta.videos) ? meta.videos : [];
    for (const video of videos) {
      if (!video || typeof video !== 'object') continue;
      const candidate = makeCandidate(video.url || video.src, source,
        { quality: video.name || video.quality || video.type, format: video.format || 'mp4' });
      if (candidate) candidates.push(candidate);
    }
    for (const [key, type] of [['hlsMasterPlaylistUrl','hls'], ['hlsManifestUrl','hls'],
      ['hlsUrl','hls'], ['dashManifestUrl','dash'], ['mpdUrl','dash']]) {
      if (typeof meta[key] === 'string') {
        const c = makeCandidate(meta[key], source, { quality: 'Adaptive', format: type });
        if (c) candidates.push(c);
      }
    }
    if (meta.metadata && meta.metadata !== meta) {
      const inner = collectMetadata(meta.metadata, source);
      candidates.push(...inner.candidates);
      licenses.push(...inner.licenses);
    }
    return { candidates, licenses, title };
  }

  function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

  function extractEmbedHtml(html) {
    const candidates = [], licenses = [], errors = [];
    let title = '';
    const str = String(html || '');
    const matches = str.matchAll(/\bdata-options\s*=\s*(["'])([\s\S]*?)\1/gi);
    let seen = 0;
    for (const match of matches) {
      if (++seen > 25) break;
      const options = safeJson(decodeEntities(match[2]));
      if (!options) continue;
      const flashvars = options.flashvars || options.playerOptions?.flashvars || {};
      for (const data of [flashvars.metadata, options.metadata, options.videoMetadata]) {
        if (!data) continue;
        const extracted = collectMetadata(data, 'OK.ru embed');
        candidates.push(...extracted.candidates);
        licenses.push(...extracted.licenses);
        if (extracted.title) title = extracted.title;
      }
    }
    // Some player versions embed an escaped, JSON-encoded metadata string directly.
    if (!candidates.length) {
      const match = /["']metadata["']\s*:\s*("(?:\\.|[^"\\])*?")/i.exec(decodeEntities(str));
      if (match) {
        const jsonString = safeJson(match[1]);
        if (jsonString) {
          const extracted = collectMetadata(jsonString, 'OK.ru embed');
          candidates.push(...extracted.candidates);
          licenses.push(...extracted.licenses);
          title ||= extracted.title;
        }
      }
    }
    if (!candidates.length) errors.push('No accessible direct media in embedded-player HTML.');
    return { candidates, licenses, title, errors };
  }

  function uniqCandidates(candidates) {
    const seen = new Set();
    return (candidates || []).filter(c => {
      if (!c || !normalizeUrl(c.url) || seen.has(c.url)) return false;
      seen.add(c.url); return true;
    }).sort((a,b) => {
      const rank = { ultra: 8, quad: 7, full: 6, hd: 5, sd: 4, high: 4, medium: 3, low: 2, lowest: 1, mobile: 0 };
      const typeRank = fmt => fmt === 'mp4' ? 3 : fmt === 'webm' ? 2 : fmt === 'hls' ? 1 : 0;
      return (typeRank(b.format) - typeRank(a.format)) ||
        ((rank[b.qualityKey] || 0) - (rank[a.qualityKey] || 0));
    });
  }

  function sanitizeFilename(name, fallback = 'video') {
    const safe = String(name || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ').replace(/^\.+/, '').trim().slice(0, 115);
    return safe || fallback;
  }

  const api = { normalizeUrl, formatOf, visibleQuality, isMediaRequest, extractVideoId,
    collectMetadata, extractEmbedHtml, uniqCandidates, sanitizeFilename, decodeEntities, makeCandidate };
  globalThis.MediaTools = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
