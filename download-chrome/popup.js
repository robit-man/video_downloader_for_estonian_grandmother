(() => {
  'use strict';
  const M=globalThis.MediaTools;
  const T = {
    en: {
      headerTagline:'Save accessible audio and video',videoPage:'MEDIA PAGE',pageLink:'Media page link',
      scan:'Find media files',videoHint:'Open a media page and press Play; scan again if it initially finds nothing.',
      licenseHeading:'LICENSE INFORMATION',unknown:'Not identified',licenseMissing:"No license declaration detected. Check the video's page or uploader for usage rights.",
      licenseDeclared:'Declaration from',licenseNote:'Informational only. License status never blocks downloads.',
      foundFormats:'AVAILABLE MEDIA',empty:'Open a video, music, podcast, or other media page, then scan.',
      diagnostics:'Diagnostics',localLogs:'Local debug log',copy:'Copy',copied:'Copied',
      footer:'Local-only · No accounts · No tracking',download:'Download',saveStream:'Save stream',streamLabel:'HLS stream (TS / fMP4)',directAudio:'Direct audio file',unknownFormat:'Media URL (file type unknown; may save as .bin)',
      playlist:'Playlist',direct:'Direct media file',playback:'Playback URL',scanning:'Scanning…',ready:'Ready',
      missing:'No downloadable media found. Start playback, then scan again. Some providers use inaccessible or encrypted streams.',unsupported:'DASH playlist (not downloadable)',
      found:'Ready to download. Choose a format below.',started:'Download started. Check your browser downloads.',
      hlsStarted:'Stream download opened in a new tab.',scanFailed:'Scan failed',downloadFailed:'Download failed',
      viewing:'Current tab',external:'Entered URL',quality:'Quality',source:'Source',invalid:'Enter a valid HTTP(S) media page URL.',
      popupError:'Cannot inspect this browser page. Open a supported video tab first.',copyLink:'Copy link',linkCopied:'Playlist link copied.',
      audioOnly:'Audio only — separate from video',videoOnly:'Video only — separate from audio',combined:'Video with audio (when included)',limitations:'DETECTION NOTES'
    },
    ru: {
      headerTagline:'Сохранение доступных видео и аудио',videoPage:'СТРАНИЦА МЕДИА',pageLink:'Ссылка на медиа',
      scan:'Найти медиафайлы',videoHint:'Откройте страницу, запустите воспроизведение и повторите поиск при необходимости.',
      licenseHeading:'ИНФОРМАЦИЯ О ЛИЦЕНЗИИ',unknown:'Не определена',licenseMissing:'Лицензия не указана. Проверьте условия использования у автора видео.',
      licenseDeclared:'Указана на странице',licenseNote:'Только для информации. Лицензия не блокирует загрузку.',
      foundFormats:'ДОСТУПНЫЕ МЕДИА',empty:'Откройте страницу с видео, музыкой или подкастом и нажмите кнопку поиска.',
      diagnostics:'Диагностика',localLogs:'Локальный журнал ошибок',copy:'Копировать',copied:'Скопировано',
      footer:'Локально · Без регистрации · Без слежения',download:'Скачать',saveStream:'Скачать поток',streamLabel:'Поток HLS (TS / fMP4)',directAudio:'Аудиофайл',unknownFormat:'Медиафайл (тип неизвестен; возможен .bin)',
      playlist:'Плейлист',direct:'Медиафайл',playback:'Ссылка на воспроизведение',scanning:'Поиск…',ready:'Готово',
      missing:'Доступные медиафайлы не найдены. Запустите воспроизведение и повторите поиск. Некоторые потоки защищены.',unsupported:'Плейлист DASH (без загрузки)',
      found:'Выберите качество видео для скачивания.',started:'Загрузка началась. Проверьте загрузки браузера.',
      hlsStarted:'Загрузка потока открыта в новой вкладке.',scanFailed:'Ошибка поиска',downloadFailed:'Ошибка загрузки',
      viewing:'Текущая вкладка',external:'Указанная ссылка',quality:'Качество',source:'Источник',invalid:'Введите действительную HTTP(S)-ссылку на страницу с медиа.',
      popupError:'Не удалось проверить вкладку. Откройте страницу с видео.',copyLink:'Копировать',linkCopied:'Ссылка на плейлист скопирована.',
      audioOnly:'Только звук — отдельно от видео',videoOnly:'Только видео — без звука',combined:'Видео со звуком (если доступен)',limitations:'ПРИМЕЧАНИЯ'
    }
  };
  let language = 'en', tab = null, results = null, logs = [];
  const el = id => document.getElementById(id);
  const tr = key => T[language][key] || key;
  const displayNote = note => {
    if (language !== 'ru') return note;
    let found=/^(\d+) YouTube formats use an unresolved player signature/.exec(note);
    if (found) return `${found[1]} форматов YouTube требуют обработки подписи плеера. Они не показаны для загрузки.`;
    found=/^(\d+) YouTube formats did not include a usable URL/.exec(note);
    if (found) return `${found[1]} форматов YouTube не содержат доступной ссылки.`;
    if (note.startsWith('YouTube may throttle')) return 'YouTube может ограничивать скорость загрузки прямых ссылок. Скорость не гарантируется.';
    if (note.startsWith('YouTube player metadata unavailable')) return 'Данные плеера YouTube недоступны. Откройте видео, запустите воспроизведение и повторите поиск.';
    if (note.startsWith('Subscription platforms commonly')) return 'Подписные платформы часто используют шифрование или DRM. Обнаружение плеера не гарантирует доступ к файлу. Защищённые потоки не скачиваются.';
    if (note.startsWith('Live streams may lack')) return 'Прямые трансляции могут не иметь готовой записи. Поддерживаются прямые файлы и совместимые незашифрованные HLS-плейлисты.';
    return note;
  };
  const api = (method, ...args) => new Promise((resolve, reject) => {
    try { method(...args, r => { const error = chrome.runtime.lastError; error ? reject(new Error(error.message)) : resolve(r); }); }
    catch (err) { reject(err); }
  });
  const note = (text, error = false) => { const box = el('message'); box.textContent = text; box.hidden = false; box.classList.toggle('error', error); };
  const addLog = text => { logs.push(`[${new Date().toLocaleTimeString('en-GB')}] ${text}`); el('debugText').textContent = logs.join('\n'); };
  const copyLogs = async () => {
    try { await navigator.clipboard.writeText(logs.join('\n')); el('copyButton').textContent = tr('copied'); }
    catch (err) { addLog('Copy failed: ' + err.message); }
  };
  function updateLanguage() {
    document.documentElement.lang = language;
    el('langButton').textContent = language === 'en' ? 'Русский' : 'English';
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = tr(node.dataset.i18n);
    el('headerTagline').textContent = tr('headerTagline');
    if (results) render(results);
    else { el('licenseBadge').textContent = tr('unknown'); el('licenseDetail').textContent = tr('licenseMissing'); }
  }
  function licenseUI(licenses) {
    const first = licenses && licenses[0];
    el('licenseBadge').textContent = first ? first.label : tr('unknown');
    el('licenseBadge').classList.toggle('declared', !!first);
    el('licenseBadge').classList.toggle('unknown', !first);
    el('licenseBadge').title = first?.label || '';
    el('licenseDetail').textContent = first ? tr('licenseDeclared') + ': ' + (first.source || 'metadata') : tr('licenseMissing');
  }
  function render(data) {
    licenseUI(data.licenses);
    el('formatCount').textContent = String(data.candidates.length);
    const notes=el('notes'); notes.replaceChildren();
    for(const detail of data.notes || []) {
      const p=document.createElement('p');p.textContent=displayNote(detail);notes.append(p);
    }
    notes.hidden = !(data.notes || []).length;
    const list = el('resultList'); list.replaceChildren();
    if (!data.candidates.length) {
      const div = document.createElement('div'); div.className='empty';
      const p = document.createElement('p'); p.textContent = tr('missing'); div.append(p); list.append(div);
      return;
    }
    for (const candidate of data.candidates) {
      const format = document.createElement('div'); format.className='format';
      const info = document.createElement('div'); info.className='format-info';
      const heading = document.createElement('div'); heading.className='format-head';
      const quality = document.createElement('span'); quality.textContent = candidate.quality || 'Original';
      const chip = document.createElement('span'); chip.className='chip'; chip.textContent = candidate.format === 'media' ? 'FILE?' : candidate.format.toUpperCase();
      heading.append(quality, chip);
      const sub = document.createElement('div'); sub.className='format-sub';
      sub.textContent = candidate.format === 'hls' ? tr('streamLabel') : candidate.format === 'dash' ? tr('playlist') :
        candidate.format === 'media' ? tr('unknownFormat') : M.isAudio(candidate.format) ? tr('directAudio') :
        candidate.kind === 'audio-only' ? tr('audioOnly') : candidate.kind === 'video-only' ? tr('videoOnly') :
        candidate.kind === 'combined' ? tr('combined') : tr('direct');
      sub.title = candidate.source + ' — ' + candidate.url;
      info.append(heading, sub);
      const btn = document.createElement('button');
      btn.type='button'; btn.className='download' + (candidate.format === 'hls' ? ' secondary' : '');
      btn.textContent = candidate.format === 'hls' ? tr('saveStream') : candidate.format === 'dash' ? tr('copyLink') : tr('download');
      btn.addEventListener('click', () => candidate.format === 'dash' ? copyPlaylist(candidate) : download(candidate, btn));
      format.append(info, btn); list.append(format);
    }
  }
  async function copyPlaylist(candidate) {
    try {
      await navigator.clipboard.writeText(candidate.url);
      note(tr('linkCopied')); addLog('Copied DASH manifest URL.');
    } catch (err) { note('Copy failed: ' + err.message, true); }
  }
  async function download(candidate, btn) {
    btn.disabled = true;
    try {
      const response = await api(chrome.runtime.sendMessage, {type:'DOWNLOAD', candidate, title:results?.title || 'video', quality:candidate.quality});
      if (!response?.ok) throw new Error(response?.error || 'Unknown background error');
      addLog(`Download queued: ${candidate.format.toUpperCase()} ${candidate.quality}; browser ID ${response.data.downloadId ?? 'HLS'}`);
      note(tr(response.data.status === 'hls-opened' ? 'hlsStarted' : 'started'));
    } catch (err) { addLog('DOWNLOAD ERROR: ' + err.message); note(tr('downloadFailed') + ': ' + err.message, true); }
    finally { btn.disabled = false; }
  }
  async function scan() {
    el('scanButton').disabled = true;
    el('pageState').textContent = tr('scanning');
    el('message').hidden = true;
    const input = el('urlInput').value.trim();
    let url = input || tab?.url || '';
    try {
      if (!/^https?:\/\//i.test(url)) throw new Error(tr('invalid'));
      addLog('Starting scan: ' + url);
      let page = {};
      if(tab?.id != null && tab?.url && url.split('#')[0] === tab.url.split('#')[0]) {
        try { await api(chrome.runtime.sendMessage,{type:'ARM_CAPTURE',tabId:tab.id}); }
        catch(err) { addLog('Network observation unavailable: '+err.message); }
      }
      // MAIN-world probing is read-only and occurs only on a user-requested scan.
      if (tab?.id != null && tab.url && url.split('#')[0] === tab.url.split('#')[0]) {
        try {
          const frames = await api(chrome.scripting.executeScript, {target:{tabId: tab.id,allFrames: true}, files:['content.js']});
          const data = frames.map(f => f.result).filter(Boolean);
          page = {url, media:[], generic:[], licenses:[], embeds:[], configUrls:[],youtube:[],vimeo:[]};
          for (const frame of data) {
            if (!page.title && frame.title) page.title=frame.title;
            for (const key of ['media','licenses','embeds','configUrls']) page[key].push(...(frame[key] || []));
            page.hasBlobVideo ||= frame.hasBlobVideo;
          }
          addLog(`Inspected ${data.length} frame(s) on the active page.`);
          try {
            const probes = await api(chrome.scripting.executeScript,{target:{tabId:tab.id,allFrames:true},world:'MAIN',func:probeMainWorld});
            for (const frame of probes) {
              for (const key of ['youtube','vimeo','generic','configUrls']) page[key].push(...(frame.result?.[key] || []));
            }
            addLog(`Read ${probes.length} player frame(s).`);
          } catch(err) {addLog('In-page player metadata unavailable: '+err.message);}
        } catch (err) { addLog('Page script unavailable: ' + err.message); }
      } else { addLog('Entered URL is not the active tab. For arbitrary services, open the media page in a tab, then rescan to inspect its player.'); }
      const response = await api(chrome.runtime.sendMessage, {type:'SCAN', url, page, tabId: tab?.url === url ? tab.id : -1});
      if (!response?.ok) throw new Error(response?.error || 'Unknown scan error');
      results = response.data;
      for (const line of results.log) addLog(line);
      render(results);
      el('pageState').textContent = tr('ready') + (results.siteName ? ' · ' + results.siteName : '');
      note(tr(results.candidates.length ? 'found' : 'missing'), !results.candidates.length);
    } catch (err) { addLog('SCAN ERROR: ' + err.message); note(tr('scanFailed') + ': ' + err.message, true); el('pageState').textContent = 'Error'; }
    finally { el('scanButton').disabled = false; }
  }
  async function init() {
    try {
      const cfg = await api(chrome.storage.local.get.bind(chrome.storage.local), {language:'en'});
      language = cfg.language === 'ru' ? 'ru' : 'en';
    } catch { language='en'; }
    updateLanguage();
    addLog('Extension loaded. Debugging language: English.');
    try {
      const tabs = await api(chrome.tabs.query, {active:true,currentWindow:true});
      tab = tabs[0] || null;
      if (tab?.url?.startsWith('http')) {
        el('urlInput').value = tab.url;
        el('pageState').textContent = tr('viewing');
        scan(); // Every ordinary HTTP(S) page can be inspected, not just named providers.
      } else { el('pageState').textContent = '—'; }
    } catch (err) { addLog('Active tab unavailable: ' + err.message); }
  }
  el('scanButton').addEventListener('click', scan);
  el('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') scan(); });
  el('langButton').addEventListener('click', async () => {
    language = language === 'en' ? 'ru' : 'en';
    await api(chrome.storage.local.set.bind(chrome.storage.local), {language});
    updateLanguage(); addLog('UI language: ' + language);
  });
  el('debugButton').addEventListener('click', () => {
    const hidden = !el('debugPanel').hidden;
    el('debugPanel').hidden = hidden; el('debugArrow').textContent=hidden?'+':'−';
    el('debugButton').setAttribute('aria-expanded',String(!hidden));
  });
  el('copyButton').addEventListener('click', copyLogs);
  init();
})();
