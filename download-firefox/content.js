/* On-demand, read-only media inventory of the active tab and embedded frames. */
(() => {
  'use strict';
  const media=[], licenses=[], embeds=[], configUrls=[];
  const ext=/\.(?:mp4|m4v|webm|mov|m3u8|mpd|mp3|m4a|aac|ogg|oga|opus|flac|wav|aiff?|weba|wma|3gp|ogv|mkv|mka|amr)(?:$|[?#])/i;
  const seen=new Set();
  const put=(raw,source,quality='',format='',explicit=false)=>{
    try {
      if(typeof raw!=='string'||raw.length>8000) return;
      const u=new URL(raw,location.href);
      if(!['http:','https:'].includes(u.protocol) || seen.has(u.href) || media.length>=250) return;
      if(!explicit&&!ext.test(u.pathname)&&!(/\bm3u8\b|\bmpd\b|\/videoplayback/i.test(u.href)))return;
      seen.add(u.href);media.push({url:u.href,source,quality,format});
    } catch { /* ignore malformed URLs */ }
  };
  const license=(raw,source)=>{if(typeof raw==='string' && raw.trim() && licenses.length<30) licenses.push({label:raw.trim().slice(0,180),source});};
  const attrs=(selector,attr,source,explicit=false)=>{
    for(const el of document.querySelectorAll(selector)) {
      const value=el.getAttribute(attr);
      if(value)put(value,source,el.getAttribute('label')||'',el.getAttribute('type')||'',explicit);
    }
  };
  attrs('video[src], audio[src]','src','HTML5 media element',true);
  attrs('video source[src], audio source[src], source[type^="video/"],source[type^="audio/"]','src','HTML5 source',true);
  attrs('a[href][download]','href','Download link',true);
  attrs('a[href$=".mp4"], a[href$=".mp3"], a[href$=".m4a"], a[href$=".wav"], a[href$=".flac"]','href','File link');
  attrs('[itemprop="contentUrl"][content]','content','Page metadata',true);
  attrs('enclosure[url]','url','Podcast feed enclosure',true);
  for(const el of document.getElementsByTagNameNS?.('*','content')||[]) {
    const mime=el.getAttribute('type')||'';
    if(/^audio\/|^video\//i.test(mime))put(el.getAttribute('url'),'Media RSS enclosure','',mime,true);
  }
  for(const el of document.querySelectorAll('video,audio')) {
    if(el.currentSrc && !el.currentSrc.startsWith('blob:')) put(el.currentSrc, 'Playing media', '', el.getAttribute('type')||'',true);
  }
  for(const selector of [
    'meta[property="og:video"]','meta[property="og:video:url"]','meta[property="og:video:secure_url"]',
    'meta[property="og:audio"]','meta[property="og:audio:url"]','meta[property="og:audio:secure_url"]',
    'meta[name="twitter:player:stream"]','meta[itemprop="contentUrl"]'
  ]) {
    for(const el of document.querySelectorAll(selector)) put(el.content,'Social/media metadata','',el.getAttribute('type')||'',true);
  }
  try {
    for(const entry of performance.getEntriesByType('resource').slice(-1500))put(entry.name,'Resource timing');
  } catch { /* blocked by document */ }
  for(const el of document.querySelectorAll('iframe[src]')){
    try { const u=new URL(el.src,location.href); if(/^https?:$/.test(u.protocol))embeds.push(u.href); }
    catch { /* invalid */ }
  }
  for(const el of document.querySelectorAll('[data-config-url], [data-config_url]')){
    const value=el.getAttribute('data-config-url')||el.getAttribute('data-config_url');
    if(value)configUrls.push(value);
  }
  for(const el of document.querySelectorAll('meta[name="license"],meta[property="license"],meta[property="video:license"],link[rel~="license"]'))
    license(el.getAttribute('content')||el.getAttribute('href'),'Page license declaration');
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    if(script.textContent.length>350000)continue;
    try {
      const data=JSON.parse(script.textContent);
      const walk=(v,depth=0,mediaType=false)=>{
        if(!v||depth>6||typeof v!=='object')return;
        if(Array.isArray(v)){v.slice(0,40).forEach(item=>walk(item,depth+1,mediaType));return;}
        const types=Array.isArray(v['@type'])?v['@type'].join(' '):String(v['@type']||'');
        const isMedia=/\b(?:VideoObject|AudioObject|MediaObject|MusicRecording|PodcastEpisode)\b/i.test(types)||mediaType;
        if(typeof v.license==='string')license(v.license,'Structured data');
        if(typeof v.contentUrl==='string')put(v.contentUrl,'Structured media data','',v.encodingFormat||'',isMedia);
        if(typeof v.url==='string' && isMedia && ext.test(v.url))put(v.url,'Structured media link');
        for(const key of ['@graph','video','audio','associatedMedia','encoding','subjectOf']) if(v[key])walk(v[key],depth+1,isMedia);
      };walk(data);
    } catch { /* not valid JSON-LD */ }
  }
  const hasBlobVideo=[...document.querySelectorAll('video,audio')].some(m=>
    (m.currentSrc||'').startsWith('blob:')||(m.getAttribute('src')||'').startsWith('blob:'));
  return {url:location.href,title:(document.querySelector('h1')?.textContent?.trim()||document.title).slice(0,180),
    media,licenses,embeds:[...new Set(embeds)].slice(0,25),configUrls:[...new Set(configUrls)].slice(0,10),hasBlobVideo};
})();
