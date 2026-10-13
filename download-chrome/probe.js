/* MAIN-world read-only scan executed only after pressing Scan.
 * No network monkeypatching, DRM access, credentials or script injection. */
function probeMainWorld() {
  'use strict';
  const youtube=[],vimeo=[],configUrls=[],generic=[];
  const seen=new Set();
  const put=(raw,source,format='',quality='')=>{
    if(typeof raw!=='string'||raw.length>8000||generic.length>=150)return;
    try {const u=new URL(raw,location.href);if(!/^https?:$/.test(u.protocol)||seen.has(u.href))return;
      seen.add(u.href);generic.push({url:u.href,source,format,quality});}catch{}
  };
  const parseSources=(data,source,depth=0)=>{
    if(!data||depth>5||generic.length>=150)return;
    if(typeof data==='string'){if(/^https?:\/\//i.test(data))put(data,source);return;}
    if(typeof data!=='object')return;
    if(Array.isArray(data)){for(const item of data.slice(0,50))parseSources(item,source,depth+1);return;}
    const format=String(data.type||data.mime||data.mimeType||data.format||'');
    const quality=String(data.label||data.quality||data.res||'');
    for(const k of ['file','src','url','contentUrl','manifest','playlistUrl']) {
      if(typeof data[k]==='string')put(data[k],source,format,quality);
    }
    for(const k of ['sources','source','tracks','playlist','levels','mediaFiles','renditions','hls','dash','mp4','progressive','assets'])
      if(data[k])parseSources(data[k],source,depth+1);
  };
  const compactYouTube = data => {
    if(typeof data==='string'){try{data=JSON.parse(data)}catch{return}}
    if(!data||typeof data!=='object')return;
    const streaming=data.streamingData||{};
    if(!streaming.formats&&!streaming.adaptiveFormats&&!streaming.hlsManifestUrl&&!streaming.dashManifestUrl)return;
    const fmt=f=>({url:f.url,signatureCipher:f.signatureCipher,cipher:f.cipher,mimeType:f.mimeType,height:f.height,width:f.width,quality:f.quality,qualityLabel:f.qualityLabel,bitrate:f.bitrate,audioQuality:f.audioQuality,audioSampleRate:f.audioSampleRate,itag:f.itag});
    youtube.push({streamingData:{formats:(streaming.formats||[]).slice(0,100).map(fmt),adaptiveFormats:(streaming.adaptiveFormats||[]).slice(0,100).map(fmt),hlsManifestUrl:streaming.hlsManifestUrl,dashManifestUrl:streaming.dashManifestUrl},
      videoDetails:{title:data.videoDetails?.title},microformat:{playerMicroformatRenderer:{license:data.microformat?.playerMicroformatRenderer?.license}}});
  };
  const compactVimeo=data=>{
    if(typeof data==='string'){try{data=JSON.parse(data)}catch{return}}
    if(!data||typeof data!=='object')return;
    const files=data.request?.files||data.files;
    if(!files||typeof files!=='object')return;
    vimeo.push({video:{title:data.video?.title,license:data.video?.license},request:{files:{
      progressive:(Array.isArray(files.progressive)?files.progressive:[]).slice(0,60).map(f=>({url:f.url,mime:f.mime,quality:f.quality,height:f.height})),
      hls:files.hls,dash:files.dash}}});
  };
  try{compactYouTube(window.ytInitialPlayerResponse)}catch{}
  try{compactYouTube(document.getElementById('movie_player')?.getPlayerResponse?.())}catch{}
  try{compactVimeo(window.playerConfig)}catch{}
  try{compactVimeo(window.vimeo?.playerConfig)}catch{}
  try{compactVimeo(window.config)}catch{}
  try{compactVimeo(window.__playerConfig)}catch{}
  try{for(const node of document.querySelectorAll('[data-config]'))compactVimeo(node.getAttribute('data-config'))}catch{}
  try{for(const name of ['vimeo','clip_page_config','playerConfig']){
    const obj=window[name];const value=obj?.clip_page_config?.player?.config_url||obj?.config_url||obj?.player?.config_url;
    if(typeof value==='string'&&value.length<3000)configUrls.push(value);
  }}catch{}
  try{const jp=window.jwplayer;if(typeof jp==='function'){
    const players=[];try{players.push(jp())}catch{}
    for(const p of players){try{parseSources(p?.getPlaylist?.(),'JW Player')}catch{}
      try{parseSources(p?.getConfig?.(),'JW Player')}catch{}}
  }}catch{}
  try{if(window.videojs?.getPlayers){
    for(const p of Object.values(window.videojs.getPlayers()).slice(0,12)){
      try{parseSources(p.currentSources?.()||p.currentSource?.(),'Video.js')}catch{}
      try{const u=p.currentSrc?.();if(u)put(u,'Video.js current source')}catch{}
    }
  }}catch{}
  try{parseSources(window.player?.getPlaylist?.(),'Embedded player')}catch{}
  try{parseSources(window.player?.getSources?.(),'Embedded player')}catch{}
  for(const name of ['playerConfig','__playerConfig','videoConfig','mediaConfig','__INITIAL_MEDIA__','__MEDIA_CONFIG__']){
    try{parseSources(window[name],name)}catch{}
  }
  return {youtube:youtube.slice(0,3),vimeo:vimeo.slice(0,3),configUrls:configUrls.slice(0,10),generic};
}
if(typeof module!=='undefined'&&module.exports)module.exports=probeMainWorld;
