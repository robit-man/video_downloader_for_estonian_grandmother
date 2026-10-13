(() => {
  'use strict';
  const translations = {
    en: {title:'Download HLS stream', subtitle:'Saving as a transport-stream file (.ts)', preparing:'Preparing…',
      cancel:'Cancel', done:'Completed. Your download should appear in the browser.', cancelled:'Cancelled.',
      disclaimer:'Only unencrypted HLS streams are supported (MPEG-TS and compatible fMP4). Complex, copy-protected and DRM streams are not supported.',
      logTitle:'Diagnostics', error:'Download could not be completed', fetching:'Fetching playlist', downloading:'Downloading segments', saving:'Saving file',
      offline:'The source does not expose a downloadable stream.'},
    ru: {title:'Скачать поток HLS', subtitle:'Сохранение файла транспортного потока (.ts)', preparing:'Подготовка…',
      cancel:'Отмена', done:'Готово. Файл появится в загрузках браузера.', cancelled:'Отменено.',
      disclaimer:'Поддерживаются незашифрованные потоки HLS (MPEG-TS и совместимые fMP4). Сложные и защищённые DRM-потоки не поддерживаются.',
      logTitle:'Диагностика', error:'Не удалось скачать видео', fetching:'Загрузка плейлиста', downloading:'Загрузка фрагментов', saving:'Сохранение файла',
      offline:'Нет доступного потока для скачивания.'}
  };
  let language='en', controller = new AbortController(), cancelled = false, active = true;
  const $ = id => document.getElementById(id);
  const t = key => translations[language][key];
  const api = (method,...args) => new Promise((resolve,reject) => {
    try { method(...args, res => { const err=chrome.runtime.lastError; err ? reject(new Error(err.message)) : resolve(res); }); }
    catch (e) { reject(e); }
  });
  function localize() {
    document.documentElement.lang=language;
    for (const key of ['title','subtitle','cancel','disclaimer','logTitle']) $(key).textContent=t(key);
    $('lang').textContent=language==='en'?'Русский':'English';
  }
  function log(message) { $('log').textContent += '\n' + message; $('log').scrollTop=$('log').scrollHeight; }
  const setStatus = text => { $('status').textContent=text; };
  async function fetchText(url) {
    const response = await fetch(url, {signal:controller.signal,credentials:'include'});
    if (!response.ok) throw new Error(`HTTP ${response.status} — ${new URL(url).host}`);
    return response.text();
  }
  function resolveChild(item, base) { return new URL(item.trim(),base).href; }
  function hlsLines(s) { return String(s).replace(/\r/g,'').split('\n').map(l=>l.trim()).filter(Boolean); }
  function parseVariants(text, base) {
    const lines=hlsLines(text), output=[];
    for (let i=0;i<lines.length;i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
      const attrs=lines[i];
      const next=lines.slice(i+1).find(l=>!l.startsWith('#'));
      if (!next) continue;
      const bandwidth=Number((/BANDWIDTH=(\d+)/.exec(attrs)||[])[1]||0);
      const width=Number((/RESOLUTION=(\d+)x/.exec(attrs)||[])[1]||0);
      output.push({url:resolveChild(next,base), bandwidth, width});
    }
    return output.sort((a,b)=>(b.width-a.width)||(b.bandwidth-a.bandwidth));
  }
  function parseSegments(text, base) {
    const lines=hlsLines(text);
    if (!lines[0]?.startsWith('#EXTM3U')) throw new Error('Source is not an HLS playlist.');
    const keys=lines.filter(l=>l.startsWith('#EXT-X-KEY:'));
    if (keys.some(l=>!/METHOD=NONE(?:,|$)/i.test(l))) throw new Error('Encrypted HLS is not supported. No decryption or DRM bypass is attempted.');
    if (lines.some(l=>l.startsWith('#EXT-X-BYTERANGE:'))) throw new Error('Byte-range HLS is not supported.');
    const maps=lines.filter(l=>l.startsWith('#EXT-X-MAP:'));
    if (maps.length>1) throw new Error('This playlist changes its MP4 initialization segment; remuxing is required.');
    if (maps.some(l=>/BYTERANGE=/i.test(l))) throw new Error('Byte-range initialization segments are not supported.');
    const init=maps.length ? (/URI="([^"]+)"/.exec(maps[0]) || [])[1] : null;
    if (maps.length && !init) throw new Error('Could not read the MP4 initialization segment.');
    const segments=lines.filter(l=>!l.startsWith('#')).map(u=>resolveChild(u,base));
    if (!segments.length) throw new Error('No media segments in playlist.');
    if (segments.length>1800) throw new Error('Stream has too many segments for an in-browser download.');
    if (!lines.includes('#EXT-X-ENDLIST')) log('Warning: live/unfinished playlist. Only currently listed segments will be saved.');
    if (!init && segments.some(u=>/\.m4s(?:$|[?#])/i.test(u))) throw new Error('Fragmented MP4 stream is missing initialization data.');
    return {segments, initUrl:init ? resolveChild(init,base) : null, ext:init ? 'mp4' : 'ts'};
  }
  async function loadPlaylist(master) {
    let current=master;
    for (let hop=0;hop<4;hop++) {
      const text=await fetchText(current);
      const variants=parseVariants(text,current);
      if (!variants.length) return parseSegments(text,current);
      log(`Master playlist: ${variants.length} variants. Selecting largest resolution: ${variants[0].width || 'auto'}.`);
      if (/#EXT-X-MEDIA:TYPE=AUDIO/i.test(text)) throw new Error('Separate audio rendition detected. Saving this stream without muxing could omit audio; select a direct MP4.');
      current=variants[0].url;
    }
    throw new Error('Nested playlist depth exceeded.');
  }
  async function segment(url, index) {
    for (let attempt=1; attempt<=3; attempt++) {
      try {
        const response=await fetch(url,{credentials:'include',signal:controller.signal});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes=await response.arrayBuffer();
        if (!bytes.byteLength) throw new Error('Empty segment');
        return bytes;
      } catch(e) {
        if (controller.signal.aborted || attempt===3) throw new Error(`Segment ${index+1}: ${e.message}`);
        await new Promise(r=>setTimeout(r, attempt*400));
      }
    }
  }
  async function run() {
    try {
      const jobId=new URL(location.href).searchParams.get('job');
      if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('Invalid job ID.');
      const result=await api(chrome.runtime.sendMessage, {type:'HLS_JOB',jobId});
      if (!result?.ok) throw new Error(result?.error || 'Missing download job');
      const job=result.data;
      setStatus(t('fetching'));
      const playlist=await loadPlaylist(job.url);
      const urls=playlist.initUrl ? [playlist.initUrl, ...playlist.segments] : playlist.segments;
      if (playlist.initUrl) { log('Fragmented MP4 detected; initialization fragment will be included.'); $('subtitle').textContent='Saving a fragmented MP4 file (.mp4)'; }
      log(`${playlist.segments.length} segments identified.`);
      setStatus(t('downloading'));
      const buffers=new Array(urls.length);
      let count=0, bytes=0, nextIndex=0;
      const workers=Array.from({length:Math.min(4,urls.length)},async()=>{
        while (true) {
          if (controller.signal.aborted) throw new Error('Cancelled');
          const i=nextIndex++;
          if (i>=urls.length) break;
          const data=await segment(urls[i],i);
          buffers[i]=data; bytes+=data.byteLength;
          if (bytes>600*1024*1024) throw new Error('Stream exceeds the 600 MB in-browser memory safety limit. Choose direct MP4.');
          count++;
          $('fill').style.width=Math.round(count/urls.length*100)+'%';
          $('progress').textContent=`${count}/${urls.length} · ${Math.round(bytes/1048576)} MiB`;
        }
      });
      await Promise.all(workers);
      if (controller.signal.aborted) return;
      setStatus(t('saving'));
      const blob=new Blob(buffers,{type:playlist.ext==='mp4'?'video/mp4':'video/mp2t'});
      const localUrl=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=localUrl; a.download=MediaTools.sanitizeFilename(job.title||'OK-video')+'.'+playlist.ext;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(localUrl),60000);
      log(`Saved ${Math.round(blob.size/1048576)} MiB as .${playlist.ext}. MPEG-TS can be remuxed without re-encoding (ffmpeg -i input.ts -c copy output.mp4).`);
      setStatus(t('done')); $('fill').style.width='100%';
    } catch (err) {
      if (cancelled || controller.signal.aborted) { setStatus(t('cancelled')); }
      else { setStatus(t('error') + ': ' + err.message); $('status').classList.add('error'); log('ERROR: '+err.message); }
    } finally { active=false; $('cancel').disabled=true; }
  }
  $('lang').addEventListener('click',async()=>{
    language=language==='en'?'ru':'en';
    localize();
    await api(chrome.storage.local.set.bind(chrome.storage.local),{language});
  });
  $('cancel').addEventListener('click',()=>{cancelled=true;controller.abort();setStatus(t('cancelled'));$('cancel').disabled=true;});
  api(chrome.storage.local.get.bind(chrome.storage.local),{language:'en'})
    .then(obj=>{language=obj.language==='ru'?'ru':'en';localize();run();})
    .catch(()=>{localize();run();});
})();
