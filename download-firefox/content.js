/* Executes only on a user-requested scan of the current page. */
(() => {
  'use strict';
  const media = [], licenses = [], embeds = [];
  const mediaRe = /\.(mp4|m4v|webm|mov|m3u8|mpd|ts)(?:$|[?#])/i;
  const put = (raw, source, quality='') => {
    try {
      const u = new URL(raw, location.href);
      if (!/^https?:$/.test(u.protocol)) return;
      if (!mediaRe.test(u.href) && source !== 'video element') return;
      media.push({url: u.href, source, quality});
    } catch { /* ignore malformed URLs */ }
  };
  const license = (raw, source) => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    licenses.push({label: raw.trim().slice(0, 180), source});
  };
  const attrs = (selector, attr, source) => {
    for (const el of document.querySelectorAll(selector)) {
      if (el.getAttribute(attr)) put(el.getAttribute(attr), source, el.getAttribute('label') || '');
    }
  };
  attrs('video[src], video[currentSrc]', 'src', 'video element');
  attrs('video source[src], source[type^="video/"]', 'src', 'video source');
  attrs('a[href$=".mp4"], a[href$=".webm"], a[download]', 'href', 'page link');
  attrs('[itemprop="contentUrl"][content]', 'content', 'page metadata');
  for (const video of document.querySelectorAll('video')) {
    if (video.currentSrc && !video.currentSrc.startsWith('blob:')) put(video.currentSrc, 'video element');
  }
  try {
    for (const entry of performance.getEntriesByType('resource').slice(-1000)) {
      if (mediaRe.test(entry.name)) put(entry.name, 'page network');
    }
  } catch { /* performance data may be restricted */ }
  for (const iframe of document.querySelectorAll('iframe[src]')) {
    try {
      const u = new URL(iframe.src);
      if (/\.ok\.ru$|^ok\.ru$/i.test(u.hostname) && /\/videoembed\//.test(u.pathname)) embeds.push(u.href);
    } catch { /* ignore */ }
  }
  for (const el of document.querySelectorAll('meta[name="license"], meta[property="license"], meta[property="video:license"], link[rel~="license"]')) {
    license(el.getAttribute('content') || el.getAttribute('href'), 'Page license tag');
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const walk = (value, depth = 0) => {
        if (!value || depth > 6 || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.slice(0, 40).forEach(v => walk(v, depth+1)); return; }
        if (value.license && typeof value.license === 'string') license(value.license, 'Structured page data');
        if (value.contentUrl && typeof value.contentUrl === 'string') put(value.contentUrl, 'Structured page data');
        if (value['@graph']) walk(value['@graph'], depth+1);
        if (value.video) walk(value.video, depth+1);
      };
      walk(data);
    } catch { /* invalid JSON-LD */ }
  }
  return { url: location.href, title: document.querySelector('h1')?.textContent?.trim().slice(0,180) || document.title,
    media: media.slice(0, 150), licenses: licenses.slice(0, 12), embeds: [...new Set(embeds)].slice(0, 5),
    hasBlobVideo: !!document.querySelector('video[src^="blob:"]') || [...document.querySelectorAll('video')].some(v => v.currentSrc.startsWith('blob:')) };
})();
