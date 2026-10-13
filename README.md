# OK Clip Saver — Chrome + Firefox

A cross-browser, Manifest V3 video download extension with an **English-first** debugging interface and a persistent **Русский / English** language switch. It targets videos that expose standard, accessible media URLs, including OK.ru pages such as `https://ok.ru/video/6809042487964`.

**Copyright/license information is advisory only.** The extension reads machine-readable license declarations if available and otherwise shows **Not identified / Не определена**. A license label never disables a download button. The user is responsible for having whatever permission local law requires. A public video does *not* automatically mean royalty-free.

## Downloads

Choose from detected file qualities; an available direct MP4, WebM, MOV, or TS URL is sent to the browser's native Downloads manager. If OK.ru exposes no direct file, the extension can inspect the embedded player's metadata and its `videoPlayerMetadata` endpoint and can observe media URLs requested during video playback.

**HLS (`.m3u8`) fallback:** Select **Save stream** to open a download tab; it fetches *unencrypted MPEG-TS segments* as `.ts`, or supported fMP4 segments with an initialization fragment as `.mp4`. This is intended for short clips and has a 600 MiB memory guardrail. Complex streams (encrypted/DRM, byte-range playlists, multiple initialization maps, audio on a separate track, DASH) are identified but not converted. The feature does not attempt DRM decryption. You can convert a compatible `.ts` into an MP4 later with `ffmpeg -i input.ts -c copy output.mp4`.

## Install on Chrome / Chromium / Brave / Edge

1. Unzip `ok-clip-saver-chrome.zip` to a folder you want to keep.
2. Open **chrome://extensions** (or the equivalent extensions page).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted folder **containing `manifest.json`**.
5. Open the desired `https://ok.ru/video/...` page, click **Play**, then click the **OK Clip Saver** toolbar icon.
6. Select a quality and click **Download**. Use **Русский** at the top to switch the UI.

## Install on Firefox (development/testing)

1. Unzip `ok-clip-saver-firefox.zip` into a folder.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select `manifest.json` in the extracted folder.
5. Open the OK.ru video, play it, and click **OK Clip Saver**.

**Important:** The temporary Firefox add-on must be loaded again after restarting Firefox. To install permanently in regular Firefox, the XPI must be signed through Mozilla's add-on signing workflow (AMO). The included **unsigned** `ok-clip-saver-firefox-unsigned.xpi` is for signing/developer workflows, not normal permanent installation. Chrome's ZIP is for *Load unpacked*, not Chrome Web Store installation.

## License status semantics

| UI state | Meaning | Download available? |
| --- | --- | --- |
| `Not identified` / `Не определена` | No explicit license element or metadata found; copyright status is **unknown** | **Yes**, if a technically downloadable file exists |
| `CC BY`, URL, or other page label | This exact declaration appears in parsed page/player metadata; it is not independently authenticated | **Yes**, if a technically downloadable file exists |

The extension does not infer permission merely because an uploader made a video public; it does not attempt to decide which copyright rules apply in a particular jurisdiction.

## Privacy and permissions

- `activeTab`, `scripting`: inspect the user's open video page when they scan; the extension does not inject continuously.
- `webRequest`: *observe, not intercept or modify*, OK.ru-initiated media requests while a video plays.
- `downloads`: save direct video files using the browser's own download manager.
- `tabs`: find the active tab and open the HLS progress tab.
- `storage`: persist only language, short-lived media request matches, and an HLS job descriptor.
- `<all_urls>` host access: enables cross-CDN media URL detection and fetching HLS fragments from whichever delivery network hosts them. It is broad access for compatibility; the capture callback intentionally disregards requests that are not initiated from OK.ru. Media URLs are never transmitted to an extension vendor or analytics endpoint.

No remote JavaScript dependencies, tracking, servers, accounts, or external API keys. Diagnostics remain local until the user chooses **Copy**.

## Debugging

Click **Diagnostics** in the popup; copy the log if a video fails. Try playing the clip and then pressing **Find video files** again. Signed player URLs can expire; reload the page and rescan. Some sites block downloads without their usual request context or use protected streams. The extension cannot guarantee every published video can be downloaded.

Test fixture: `tests/media.test.js`. Run `node tests/media.test.js` from the project root. Package rebuild: `python build.py`.

## Project structure

- `src/media.js`: shared OK player/metadata extractor, URL and filename handling.
- `src/content.js`: page DOM, JSON-LD license, HTML media elements, page resource scan.
- `src/background.js`: browser messaging, OK embed/API lookup, passive media detection, native downloads.
- `src/popup.html`, `popup.js`, `styles.css`: English/Russian interface, license state, quality selection, local debugging.
- `src/hls.html`, `hls.js`: progressive HLS TS / supported fMP4 download in a separate tab.
- `build.py`: generates Chrome and Firefox package manifests from the shared source.

## Scope and limitations

Only standard accessible media is supported. Embedded-player layout and video APIs may change, and no working download for the specific example URL has been verified in a running browser. No guarantee is made about the legal status of any particular video, including the example URL.
