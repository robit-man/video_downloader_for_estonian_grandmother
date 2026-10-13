/* Shared, dependency-free media discovery and normalization. */
(() => {
  'use strict';
  const VALID_MEDIA = /\.(?:mp4|m4v|webm|mov|m3u8|mpd|mp3|m4a|aac|oga|ogg|opus|flac|wav|aif|aiff|wma|weba|3gp|3g2|ogv|mkv|mka|amr|mp2)(?:$|[?#])/i;
  const TYPE_BY_EXT = { mp4:'mp4', m4v:'mp4', webm:'webm', mov:'mov', m3u8:'hls', mpd:'dash', ts:'ts', mp3:'mp3', m4a:'m4a', aac:'aac', oga:'ogg', ogg:'ogg', opus:'opus', flac:'flac', wav:'wav', aif:'aiff', aiff:'aiff', wma:'wma', weba:'webm', '3gp':'3gp', '3g2':'3gp', ogv:'ogv', mkv:'mkv', mka:'mka', amr:'amr', mp2:'mp2' };
  const AUDIO_FORMATS = new Set(['mp3','m4a','aac','ogg','opus','flac','wav','aiff','wma','mka','amr','mp2']);
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
    const h = String(hint || '').toLowerCase().trim().split(';')[0];
    if (h === 'hls' || h.includes('mpegurl') || h.includes('m3u8')) return 'hls';
    if (h === 'dash' || h.includes('dash+xml') || h.includes('mpd')) return 'dash';
    const mimes = {
      'video/mp4':'mp4','audio/mp4':'m4a','audio/x-m4a':'m4a','video/webm':'webm','audio/webm':'webm',
      'video/quicktime':'mov','video/x-matroska':'mkv','audio/x-matroska':'mka',
      'audio/mpeg':'mp3','audio/mp3':'mp3','audio/aac':'aac','audio/x-aac':'aac',
      'audio/ogg':'ogg','video/ogg':'ogv','audio/opus':'opus','audio/flac':'flac','audio/x-flac':'flac',
      'audio/wav':'wav','audio/x-wav':'wav','audio/wave':'wav','audio/aiff':'aiff','audio/x-aiff':'aiff',
      'video/mp2t':'ts','audio/mp2t':'ts','video/3gpp':'3gp','audio/3gpp':'3gp'
    };
    if (mimes[h]) return mimes[h];
    if (TYPE_BY_EXT[h]) return TYPE_BY_EXT[h];
    try {
      const u = new URL(url), ext=(u.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)||[])[1];
      if (TYPE_BY_EXT[ext]) return TYPE_BY_EXT[ext];
      const q=(u.searchParams.get('mime')||u.searchParams.get('content_type')||u.searchParams.get('format')||'').toLowerCase();
      if (mimes[q]) return mimes[q];
      if (/\bm3u8\b|\bhls\b/i.test(u.pathname) || /^(m3u8|hls)$/.test(q)) return 'hls';
      if (/\bmpd\b/i.test(u.pathname) || q==='dash') return 'dash';
      return 'media';
    } catch { return 'media'; }
  }

  function isAudio(format, mime = '') {
    return AUDIO_FORMATS.has(format) || /^audio\//i.test(mime);
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
      if (!/^https?:$/.test(u.protocol)) return false;
      if (/\.(?:m4s|cmfv|cmfa|ts)(?:$|[?#])/i.test(u.pathname)) return false; // HLS/DASH segments are not independent files
      return VALID_MEDIA.test(u.pathname) ||
        /(?:\/videoplayback(?:\?|$)|\/playlist\.m3u8|\/manifest\.mpd)/i.test(u.pathname) ||
        /(?:[?&](?:format|type|mime)=(?:audio%2f|video%2f|mp4|mp3|webm|m3u8|hls|dash))/i.test(u.search);
    } catch { return false; }
  }

  function formatFromResponseHeaders(headers = []) {
    const field = headers.find(h => String(h.name).toLowerCase() === 'content-type');
    const mime = String(field?.value || '').toLowerCase().split(';')[0].trim();
    if (mime.includes('mpegurl')) return {format:'hls',mime};
    if (mime.includes('dash+xml')) return {format:'dash',mime};
    if (!/^audio\/|^video\//.test(mime)) return null;
    if (mime === 'video/mp2t' || mime === 'audio/mp2t') return null; // ignore segment fetches
    return {format:formatOf('',mime),mime};
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
      const typeRank = fmt => ['mp4','mp3','m4a','flac','wav','webm','ogg','opus','mov'].includes(fmt) ? 3 : fmt === 'hls' ? 2 : fmt === 'dash' ? 0 : 1;
      return (typeRank(b.format) - typeRank(a.format)) ||
        ((parseInt(b.qualityKey, 10) || rank[b.qualityKey] || 0) - (parseInt(a.qualityKey, 10) || rank[a.qualityKey] || 0));
    });
  }

  function sanitizeFilename(name, fallback = 'video') {
    const safe = String(name || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ').replace(/^\.+/, '').trim().slice(0, 115);
    return safe || fallback;
  }

  const api = { normalizeUrl, formatOf, isAudio, formatFromResponseHeaders, visibleQuality, isMediaRequest, extractVideoId,
    collectMetadata, extractEmbedHtml, uniqCandidates, sanitizeFilename, decodeEntities, makeCandidate };
  globalThis.MediaTools = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
