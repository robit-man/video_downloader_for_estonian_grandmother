# Clip Saver v1.2.0 — Universal media detection (Chrome + Firefox)

One source code tree, two Manifest V3 packages. English is the default UI and debugging language, with a persistent **Русский** button. The **license indicator is informational only** and **never restricts any download buttons**. No server-side extractor, user account, advertising, telemetry, or remote script loader.

## Install and use

1. **Chrome/Chromium/Brave/Edge:** unzip `ok-clip-saver-chrome.zip` to a permanent folder. Go to `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, then choose the extracted folder containing `manifest.json`.
2. **Firefox, temporary development installation:** unzip `ok-clip-saver-firefox.zip`. Go to `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `manifest.json`. The temporary add-on disappears on restart. Regular Firefox installs require signing; the `.xpi` archive supplied here is **unsigned**.
3. Open any page containing a video, audio track, livestream recording, podcast episode or downloadable media. Open the Clip Saver icon. It scans the active page and embedded frames. **Press Play, then Scan again** if the site loads media only after playback begins.
4. Choose an exposed format. Direct files use the browser download manager. Compatible unencrypted HLS playlists open a separate segment-saving tab. DASH playlist links can be copied but are not merged/downloaded as media by this version.
5. Use **Русский / English** to switch interface language. **Diagnostics** displays copyable local debug logs.

## What “supports a site” means

The program detects common media delivery patterns on **arbitrary HTTP(S) websites**; it does **not** maintain an exhaustive per-site download implementation. Recognizing a service's name is not proof that the service exposes a downloadable file. Domains and player APIs change, and some services only stream encrypted or inaccessible media.

### Discovery engines

- Standard HTML5 `<video>`, `<audio>`, nested `<source>`, current playback URLs and media-file links.
- Open Graph and Twitter player metadata; HTML media `contentUrl` and JSON-LD `AudioObject`, `VideoObject`, `MediaObject`, `MusicRecording` and `PodcastEpisode`.
- Podcast RSS `<enclosure>` and Media RSS audio/video links.
- URL hints in the active page's resource timing data.
- Media MIME response inspection (non-blocking `webRequest`), **armed only for the tab being inspected**; request URLs are stored briefly in local browser session storage. Open the popup and scan first, then play/rescan for dynamic sources. No global browsing history is collected.
- Read-only, on-click inspection of known JW Player, Video.js and common embedded-player configuration surfaces.
- Existing OK.ru player/embed parser, YouTube player response parsing and Vimeo player/config inspection.

### Recognized service catalog

The extension identifies these services for the user interface but applies the **same best-effort generic scanner** to most of them:

| Category | Examples | What may be available |
|---|---|---|
| Video/social | OK.ru, YouTube, Vimeo, Dailymotion, Twitch, Kick, TikTok, Instagram, Facebook, X/Twitter, Reddit, Streamable, Rumble, Odysee, BitChute, PeerTube | Public direct files or HLS; many videos use short-lived, signed, split-track, or inaccessible streams |
| Regional and archival | VK Video, RuTube, Telegram, Bilibili, Niconico, Naver TV, Youku, Tencent Video, Douyin, Kuaishou, Internet Archive, Wikimedia Commons | Public files/embedded streams where exposed |
| Music/audio | SoundCloud, Bandcamp, Mixcloud, Audiomack, YouTube Music, TuneIn, iHeartRadio, BBC Sounds, NPR | MP3/M4A/FLAC/OGG/Opus/WAV, or compatible HLS when exposed; continuous radio streams may never end on their own |
| Podcasts | Apple Podcasts, Pocket Casts, Podbean, Buzzsprout, Spreaker, Libsyn, Acast, Audioboom, Simplecast, Castbox and independent RSS-based podcasts | Direct podcast episode enclosures and audio files |
| Embedded players | JW Player, Video.js, Wistia, Brightcove, Kaltura, Vidyard, Panopto, Mux, Cloudflare Stream, Bunny Stream | Direct media or HLS, depending on configuration; merely recognizing the host does not enable extraction |
| Streaming subscriptions | Netflix, Prime Video, Disney+, Hulu, Max, Peacock, Paramount+, Apple TV+, Spotify, Apple Music, Deezer, Tidal, Qobuz | **Usually not downloadable with this extension**; DRM and encrypted delivery are intentionally unsupported |
| Other | Any independent news, school, blog, small radio station, museum, creator website, etc. | HTML5 `<video>/<audio>`, metadata, available player configurations, media response detection |

The catalog is illustrative rather than a test certificate; even a listed site may return **zero usable results**.

### File and playlist handling

- **Direct-download formats:** MP4, WebM, MOV, MP3, M4A, AAC, OGG, Opus, FLAC, WAV, AIFF, WMA, MKV, MKA, AMR, 3GP, OGV, MP2, TS. Actual content depends on the server response.
- **Unencrypted HLS:** basic video VOD with MPEG-TS / one fMP4 initialization map; raw AAC and MP3 audio segments; best variant from simple master playlists. Up to 1,800 segments and a 600 MiB in-memory limit. It does **not** remux codecs or merge separate audio renditions.
- **DASH `.mpd`:** manifest URL displayed and copyable; no DASH segment download/muxing in v1.2.0.
- **Split tracks:** YouTube and other sites may expose **video-only** and **audio-only** files; their download buttons save those tracks separately. There is no automatic audio/video merging.
- **Unknown MIME:** a valid media link without a recognizable extension/type may save as `.bin` and require renaming after verification; it is not assumed to be MP4.
- **Protected sources:** no DRM removal, signature deciphering, subscription bypass, paywall bypass or encrypted HLS decryption. Signed URLs can expire or require a playback session. The browser accepting a download request does **not** guarantee the source will deliver the file.

## Copyright and license indicator

The badge shows metadata explicitly declared by the page/player (such as `rel=license`, license meta tags, JSON-LD, supported player metadata). Otherwise it reads **Not identified**. It is **not** an automated legal determination. A page's title, public accessibility, or presence of a download URL does not itself confer reuse rights. License information **does not gate, hide or disable download buttons**. Users must assess permissions, applicable law and provider terms separately.

## Browser permission and privacy design

- `activeTab`, `scripting`: inspect the current page **when the extension is opened / Scan is used**. MAIN-world extraction is read-only.
- `downloads`: queue exposed media URLs in the browser's native download manager.
- `webRequest`: observe media requests and response media MIME types. Capturing is active only after the user scans the tab (session-scoped), with no blocking or modifications.
- `tabs`: inspect the active tab and open the HLS progress tab.
- `storage`: remember language, tab-scoped detected media URLs, and short-lived HLS jobs; no remote analytics.
- `<all_urls>` host permission: required for cross-origin embedded frames and arbitrary media CDN domains. This is intentionally a broad permission, so **install only from source you trust**. Browsers may ask to grant site permissions.

If Firefox shows a permission prompt or content scan fails, inspect the extension's site access permissions and retry.

## Developer instructions

Rebuild with Python 3 and Pillow:

```bash
node tests/media.test.js
node tests/sites.test.js
node tests/broad.test.js
node tests/background.test.js
python build.py
```

Mocked Chromium popup fixture: `python tests/ui_smoke.py` (requires local Chromium and Playwright); tests English/Russian, license badge, media rows and download click without installing an extension. Optional extension-loaded browser fixture: `python tests/browser_smoke.py`; locked-down Chromium environments may refuse sideloaded extensions. Success on either local fixture cannot verify third-party sites.

Main files: `src/media.js` (formats and general URLs), `src/sites.js` (named service catalog and OK/YouTube/Vimeo parsing), `src/content.js` (DOM and RSS inventory), `src/probe.js` (player configurations), `src/background.js` (opt-in network capture/download routing), `src/popup.*` and `src/styles.css` (bilingual UI), `src/hls.*` (compatible unencrypted HLS saver), `build.py` (Chrome and Firefox ZIPs plus unsigned XPI).

## Distribution notes

The Chrome Web Store imposes platform-specific restrictions, including on YouTube downloader functionality, so the Chrome build is intended for **developer-mode loading**, not assumed to be store-eligible. Firefox release distribution generally requires Mozilla signing. Users should assess local law, site terms, and permission to retain the media. No guarantee is made of downloads from any particular platform.
