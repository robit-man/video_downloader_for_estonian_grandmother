(() => {
  'use strict';
  const T = {
    en: {
      headerTagline:'Save accessible video files',videoPage:'VIDEO PAGE',pageLink:'Video page link',
      scan:'Find video files',videoHint:'Open the video and press Play before scanning for the best results.',
      licenseHeading:'LICENSE INFORMATION',unknown:'Not identified',licenseMissing:"No license declaration detected. Check the video's page or uploader for usage rights.",
      licenseDeclared:'Declaration from',licenseNote:'Informational only. License status never blocks downloads.',
      foundFormats:'AVAILABLE FORMATS',empty:'Open an OK.ru video and scan to find downloadable files.',
      diagnostics:'Diagnostics',localLogs:'Local debug log',copy:'Copy',copied:'Copied',
      footer:'Local-only · No accounts · No tracking',download:'Download',saveStream:'Save stream',streamLabel:'HLS transport stream (TS)',
      playlist:'Playlist',direct:'Direct video file',playback:'Playback URL',scanning:'Scanning…',ready:'Ready',
      missing:'No playable files detected. Start playback, then scan again.',unsupported:'DASH playlist (not downloadable)',
      found:'Ready to download. Choose a format below.',started:'Download started. Check your browser downloads.',
      hlsStarted:'Stream download opened in a new tab.',scanFailed:'Scan failed',downloadFailed:'Download failed',
      viewing:'Current tab',external:'Entered URL',quality:'Quality',source:'Source',invalid:'Enter an OK.ru video page URL.',
      popupError:'Cannot inspect this browser page. Open the OK.ru video tab first.',copyLink:'Copy link',linkCopied:'Playlist link copied.'
    },
    ru: {
      headerTagline:'Сохранение доступных видеофайлов',videoPage:'СТРАНИЦА ВИДЕО',pageLink:'Ссылка на видео',
      scan:'Найти видео',videoHint:'Откройте видео, нажмите «Воспроизвести», затем выполните поиск.',
      licenseHeading:'ИНФОРМАЦИЯ О ЛИЦЕНЗИИ',unknown:'Не определена',licenseMissing:'Лицензия не указана. Проверьте условия использования у автора видео.',
      licenseDeclared:'Указана на странице',licenseNote:'Только для информации. Лицензия не блокирует загрузку.',
      foundFormats:'ДОСТУПНЫЕ ФОРМАТЫ',empty:'Откройте видео на OK.ru и нажмите «Найти видео».',
      diagnostics:'Диагностика',localLogs:'Локальный журнал ошибок',copy:'Копировать',copied:'Скопировано',
      footer:'Локально · Без регистрации · Без слежения',download:'Скачать',saveStream:'Скачать поток',streamLabel:'Поток HLS (файл TS)',
      playlist:'Плейлист',direct:'Видеофайл',playback:'Ссылка на воспроизведение',scanning:'Поиск…',ready:'Готово',
      missing:'Видео не найдено. Запустите воспроизведение и повторите поиск.',unsupported:'Плейлист DASH (без загрузки)',
      found:'Выберите качество видео для скачивания.',started:'Загрузка началась. Проверьте загрузки браузера.',
      hlsStarted:'Загрузка потока открыта в новой вкладке.',scanFailed:'Ошибка поиска',downloadFailed:'Ошибка загрузки',
      viewing:'Текущая вкладка',external:'Указанная ссылка',quality:'Качество',source:'Источник',invalid:'Введите адрес видео OK.ru.',
      popupError:'Не удалось проверить вкладку. Сначала откройте видео на OK.ru.',copyLink:'Копировать',linkCopied:'Ссылка на плейлист скопирована.'
    }
  };
  let language = 'en', tab = null, results = null, logs = [];
  const el = id => document.getElementById(id);
  const tr = key => T[language][key] || key;
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
      const chip = document.createElement('span'); chip.className='chip'; chip.textContent = candidate.format.toUpperCase();
      heading.append(quality, chip);
      const sub = document.createElement('div'); sub.className='format-sub';
      sub.textContent = candidate.format === 'hls' ? tr('streamLabel') : candidate.format === 'dash' ? tr('playlist') : tr('direct');
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
      const response = await api(chrome.runtime.sendMessage, {type:'DOWNLOAD', candidate, title:results?.title || 'OK video', quality:candidate.quality});
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
      // Only inspect the active page when the typed URL is identical.
      if (tab?.id != null && tab.url && url.split('#')[0] === tab.url.split('#')[0]) {
        try {
          const frames = await api(chrome.scripting.executeScript, {target:{tabId: tab.id,allFrames: true}, files:['content.js']});
          const data = frames.map(f => f.result).filter(Boolean);
          page = data[0] || {};
          for (const frame of data.slice(1)) {
            page.media = [...(page.media || []), ...(frame.media || [])];
            page.licenses = [...(page.licenses || []), ...(frame.licenses || [])];
            page.embeds = [...(page.embeds || []), ...(frame.embeds || [])];
          }
          addLog(`Inspected ${data.length} frame(s) on the active page.`);
        } catch (err) { addLog('Page script unavailable: ' + err.message); }
      } else { addLog('Using embedded player metadata for the supplied link.'); }
      const response = await api(chrome.runtime.sendMessage, {type:'SCAN', url, page, tabId: tab?.url === url ? tab.id : -1});
      if (!response?.ok) throw new Error(response?.error || 'Unknown scan error');
      results = response.data;
      for (const line of results.log) addLog(line);
      render(results);
      el('pageState').textContent = tr('ready');
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
        if (/^https?:\/\/(?:[^/]*\.)?ok\.ru\/video/i.test(tab.url)) scan();
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
