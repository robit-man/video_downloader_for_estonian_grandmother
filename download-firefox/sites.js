/* Site-specific metadata parsers. No page script execution, network calls, or DRM logic. */
(() => {
  'use strict';
  const M = globalThis.MediaTools || (typeof require === 'function' ? require('./media.js') : null);
  function platform(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      if (h === 'ok.ru' || h.endsWith('.ok.ru') || h === 'odnoklassniki.ru' || h.endsWith('.odnoklassniki.ru')) return 'ok';
      if (h === 'youtu.be' || h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtube-nocookie.com' || h.endsWith('.youtube-nocookie.com')) return 'youtube';
      if (h === 'vimeo.com' || h.endsWith('.vimeo.com')) return 'vimeo';
    } catch { /* invalid URL */ }
    return 'generic';
  }
  function youtubeId(url) {
    try {
      const u = new URL(url);
      if (platform(url) !== 'youtube') return null;
      let id = u.searchParams.get('v');
      if (!id) {
        const parts = u.pathname.split('/').filter(Boolean);
        id = u.hostname === 'youtu.be' ? parts[0] :
          ['shorts','embed','live','v'].includes(parts[0]) ? parts[1] : null;
      }
      return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
    } catch { return null; }
  }
  function vimeoId(url) {
    try {
      if (platform(url) !== 'vimeo') return null;
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const id = parts.findLast(part => /^\d{5,15}$/.test(part));
      return id || null;
    } catch { return null; }
  }
  function licenseLabel(value, source) {
    if (typeof value !== 'string' || !value.trim()) return null;
    return {label: value.trim().slice(0,180), source};
  }
  function safeObject(data) {
    if (typeof data !== 'string') return data;
    try { return JSON.parse(data); } catch { return null; }
  }
  function parseYouTube(data, source='YouTube player') {
    const candidates=[], licenses=[], notes=[];
    const p = safeObject(data);
    if (!p || typeof p !== 'object') return {candidates, licenses, notes, title:''};
    const sd = p.streamingData || {}, details = p.videoDetails || {},
      micro = p.microformat?.playerMicroformatRenderer || {};
    const lic = licenseLabel(micro.license || p.license, source);
    if (lic) licenses.push(lic);
    let signatureProtected = 0, noUrl = 0, nParam = 0;
    for (const f of [...(Array.isArray(sd.formats)?sd.formats:[]), ...(Array.isArray(sd.adaptiveFormats)?sd.adaptiveFormats:[])].slice(0, 120)) {
      if (!f || typeof f !== 'object') continue;
      let url = f.url;
      if (!url && (f.signatureCipher || f.cipher)) {
        const qs = new URLSearchParams(f.signatureCipher || f.cipher);
        if (qs.has('s')) { signatureProtected++; continue; }
        url = qs.get('url');
        const signature = qs.get('sig') || qs.get('signature');
        if (url && signature) {
          try { const u = new URL(url); u.searchParams.set(qs.get('sp') || 'signature',signature); url=u.href; }
          catch { url = null; }
        }
      }
      if (!url) { noUrl++; continue; }
      try { if (new URL(url).searchParams.has('n')) nParam++; } catch {}
      const mime = String(f.mimeType || '').split(';')[0].trim().toLowerCase();
      const ext = /webm/.test(mime) ? 'webm' : /mp4|3gpp/.test(mime) ? 'mp4' : null;
      if (!ext) continue;
      const video = Number(f.height) > 0 || (Number(f.width) > 0);
      const audio = Boolean(f.audioQuality || f.audioSampleRate || (!video && /^audio\//.test(mime)));
      const kind = video && audio ? 'combined' : video ? 'video-only' : audio ? 'audio-only' : 'combined';
      const quality = kind === 'audio-only' ?
        `${Math.round(Number(f.bitrate || 0)/1000) || '?'} kbps` :
        f.qualityLabel || (f.height ? `${f.height}p` : f.quality || 'Original');
      const item = M.makeCandidate(url, source, {format:ext,quality});
      if (item) candidates.push({...item, kind, mime, itag:f.itag, qualityKey:String(f.height || f.quality || '').toLowerCase(), source});
    }
    if (sd.hlsManifestUrl) {
      const c = M.makeCandidate(sd.hlsManifestUrl,source,{format:'hls',quality:'Adaptive'});
      if (c) candidates.push({...c,kind:'combined'});
    }
    if (sd.dashManifestUrl) {
      const c = M.makeCandidate(sd.dashManifestUrl,source,{format:'dash',quality:'Adaptive'});
      if (c) candidates.push({...c,kind:'manifest'});
    }
    if (signatureProtected) notes.push(`${signatureProtected} YouTube formats use an unresolved player signature; those URLs were not offered.`);
    if (noUrl) notes.push(`${noUrl} YouTube formats did not include a usable URL.`);
    if (nParam) notes.push('YouTube may throttle direct media URLs containing the n parameter; download speeds are not guaranteed.');
    return {candidates,licenses,notes,title:String(details.title || micro.title?.simpleText || '').slice(0,180)};
  }
  function parseVimeo(data, source='Vimeo player') {
    const candidates=[], licenses=[], notes=[];
    const config = safeObject(data);
    if (!config || typeof config !== 'object') return {candidates,licenses,notes,title:''};
    const files = config.request?.files || config.files || {};
    const video = config.video || {};
    const lic = licenseLabel(video.license || config.license,source);
    if (lic) licenses.push(lic);
    for (const f of (Array.isArray(files.progressive) ? files.progressive : []).slice(0,60)) {
      if (!f || !f.url) continue;
      const item=M.makeCandidate(f.url,source,{format:f.mime || 'mp4',quality:f.quality || (f.height ? `${f.height}p` : '')});
      if (item) candidates.push({...item,kind:'combined',format:'mp4',qualityKey:String(f.height || f.quality || '').toLowerCase()});
    }
    for (const [key,type] of [['hls','hls'],['dash','dash']]) {
      const data=files[key] || {};
      const cdns=data.cdns && typeof data.cdns === 'object' ? data.cdns : {};
      const url = cdns[data.default_cdn]?.url || data.url || Object.values(cdns).find(c=>c?.url)?.url;
      if (url) {
        const item=M.makeCandidate(url,source,{format:type,quality:'Adaptive'});
        if (item) candidates.push({...item,kind:type==='hls'?'combined':'manifest'});
      }
    }
    return {candidates,licenses,notes,title:String(video.title || config.title || '').slice(0,180)};
  }
  function vimeoConfigUrls(url, page={}) {
    const urls=[];
    const add=raw=>{
      if (typeof raw !== 'string') return;
      try {
        const u=new URL(raw,url);
        if (u.protocol === 'https:' && u.hostname === 'player.vimeo.com' && /^\/video\/\d{5,15}\/config\/?$/.test(u.pathname) && !urls.includes(u.href)) urls.push(u.href);
      } catch { /* ignore */ }
    };
    for (const candidate of page.configUrls || []) add(candidate);
    const id=vimeoId(url);
    if (id) {
      const u=new URL(`https://player.vimeo.com/video/${id}/config`);
      try {
        const input=new URL(url);
        const hash=input.searchParams.get('h');
        if (hash && /^[0-9a-z]{4,64}$/i.test(hash)) u.searchParams.set('h',hash);
      } catch { /* ignore */ }
      add(u.href);
    }
    return urls.slice(0,5);
  }
  // Recognition is NOT a claim that a platform allows downloads. Generic media discovery works independently.
  const SERVICES = [
    ['Dailymotion','video','dailymotion.com','dai.ly'],
    ['Twitch','live','twitch.tv','clips.twitch.tv'], ['Kick','live','kick.com'],
    ['TikTok','social','tiktok.com'], ['Instagram','social','instagram.com'],
    ['Facebook','social','facebook.com','fb.watch'], ['X / Twitter','social','x.com','twitter.com'],
    ['Reddit','social','reddit.com','v.redd.it'], ['Streamable','video','streamable.com'],
    ['Rumble','video','rumble.com'], ['Odysee','video','odysee.com'],
    ['BitChute','video','bitchute.com'], ['PeerTube','video','joinpeertube.org','peertube.tv','tilvids.com'],
    ['Internet Archive','archive','archive.org','ia800000.us.archive.org'],
    ['Wikimedia Commons','archive','commons.wikimedia.org','upload.wikimedia.org'],
    ['VK Video','social','vk.com','vkvideo.ru'], ['RuTube','video','rutube.ru'],
    ['Telegram','social','t.me','web.telegram.org'], ['Bilibili','video','bilibili.com'],
    ['Niconico','video','nicovideo.jp','nico.ms'], ['Naver TV','video','tv.naver.com'],
    ['Youku','video','youku.com'], ['Tencent Video','video','v.qq.com'],
    ['Douyin','social','douyin.com'], ['Kuaishou','social','kuaishou.com'],
    ['SoundCloud','audio','soundcloud.com'], ['Bandcamp','audio','bandcamp.com'],
    ['Mixcloud','audio','mixcloud.com'], ['Audiomack','audio','audiomack.com'],
    ['YouTube Music','audio','music.youtube.com'], ['Spotify','subscription','spotify.com','open.spotify.com'],
    ['Apple Music','subscription','music.apple.com'], ['Deezer','subscription','deezer.com'],
    ['Tidal','subscription','tidal.com'], ['Qobuz','subscription','qobuz.com'],
    ['TuneIn','audio','tunein.com'], ['iHeartRadio','audio','iheart.com'],
    ['Apple Podcasts','audio','podcasts.apple.com'], ['Pocket Casts','audio','pocketcasts.com'],
    ['Podbean','audio','podbean.com'], ['Buzzsprout','audio','buzzsprout.com'],
    ['Spreaker','audio','spreaker.com'], ['Libsyn','audio','libsyn.com','libsyn.org'],
    ['Acast','audio','acast.com','acastcdn.com'], ['Audioboom','audio','audioboom.com'],
    ['Simplecast','audio','simplecast.com','simplecastaudio.com'], ['Castbox','audio','castbox.fm'],
    ['BBC Sounds','audio','bbc.co.uk','bbc.com'], ['NPR','audio','npr.org'],
    ['TED','video','ted.com'], ['Khan Academy','video','khanacademy.org'],
    ['PBS','video','pbs.org'], ['Arte','video','arte.tv'],
    ['JW Player','player','jwplayer.com','jwplatform.com','jwpcdn.com'],
    ['Wistia','player','wistia.com','wistia.net','wi.st'],
    ['Brightcove','player','brightcove.com','brightcove.net'],
    ['Kaltura','player','kaltura.com','kaltura.org'],
    ['Vidyard','player','vidyard.com'], ['Panopto','player','panopto.com'],
    ['Mux','player','mux.com','mux.video','stream.mux.com'],
    ['Cloudflare Stream','player','cloudflarestream.com','videodelivery.net'],
    ['Bunny Stream','player','bunnycdn.com','b-cdn.net'],
    ['Netflix','subscription','netflix.com'], ['Prime Video','subscription','primevideo.com'],
    ['Disney+','subscription','disneyplus.com'], ['Hulu','subscription','hulu.com'],
    ['Max','subscription','max.com','hbomax.com'], ['Peacock','subscription','peacocktv.com'],
    ['Paramount+','subscription','paramountplus.com'], ['Apple TV+','subscription','tv.apple.com']
  ];
  function recognize(url) {
    try{ if(new URL(url).hostname.toLowerCase()==='music.youtube.com')return {name:'YouTube Music',family:'audio',known:true}; }catch{}
    const known = platform(url);
    if (known!=='generic') return {name: {ok:'OK.ru',youtube:'YouTube',vimeo:'Vimeo'}[known],family:'video',known:true};
    try {
      const h = new URL(url).hostname.toLowerCase();
      for (const [name,family,...domains] of SERVICES) {
        if (domains.some(d => h===d || h.endsWith('.'+d))) return {name,family,known:true};
      }
    } catch { /* invalid */ }
    return {name:'Other website',family:'generic',known:false};
  }
  const api={platform,recognize,SERVICES,youtubeId,vimeoId,parseYouTube,parseVimeo,vimeoConfigUrls};
  globalThis.SiteTools=api;
  if(typeof module !== 'undefined' && module.exports) module.exports=api;
})();
