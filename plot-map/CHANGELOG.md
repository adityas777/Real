# Changelog

Running log of changes made by Claude in this session/project going forward.
Newest entries at the top. Each entry: what changed, why, and files touched.

---

## 2026-09-12 (strict offline audit: virtual-tour panoramas were never downloaded — now 66/66 assets and 18/18 features verified offline)

`app.js`. User asked for a strict check of whether *everything* works offline for mobile
visitors. Built a data-driven audit rather than spot-checking: it parses the project's own
`alignment.json`/`tour.json`/`landmarks.json`, enumerates every local asset they reference
(66 for `anandman`), runs the real "Add" download, goes genuinely offline
(`context.setOffline(true)`), then fetches every one of those assets through the service
worker AND drives each feature in the UI.

- **Found: all 17 virtual-tour panoramas returned 503 offline.** `collectOfflineAssets()`
  walked the menu tree, landmarks, amenities and the pano/ground/logo/audio, but never
  `state.tours` — so across this project's 9 tours, not one room panorama was included in
  the offline download. Because a room's pano is only requested when a visitor opens that
  specific room, opportunistic runtime caching never reached them either unless someone had
  manually walked all nine tours while online. VIRTUAL TOUR was therefore the one headline
  feature that stayed broken with no signal: the tour list opened, every room landed on a
  blank sphere. Fixed by walking `state.tours` in `collectOfflineAssets()`, and adding
  `tour.json` to `DATA_FILES` (boot fetched it anyway, so it was cached by luck rather than
  by intent). The offered download grows from ~230MB to ~305MB for this project — that's
  114MB of tour panoramas that genuinely have to be there; the banner already shows the
  size up front and warns when it exceeds free space.
- **Three audit "failures" turned out to be bugs in the audit, not the app** — worth
  recording because each would have sent a future session chasing nothing: (1) the boot
  curtain is cleared with `classList.add('is-hidden')`, not `'gone'`; (2) `readPixels()` on
  three.js's WebGL canvas always returns blank because the renderer runs without
  `preserveDrawingBuffer`, so "1 distinct colour" said nothing about what's on screen; and
  (3) **the whole audit was running at a PORTRAIT phone viewport, where this app
  deliberately shows a "Rotate your phone — the map opens up in landscape" overlay instead
  of the map** — so every visual check was measuring that overlay. Re-run at 844×390
  landscape with screenshot-based checks, the map, plots, compass, legend and tour rooms
  all render. A single-node tour also has no `.tour-hs` hotspots, so "is a tour running"
  has to be read from the drawer's `✕ EXIT TOUR` row, not hotspot presence.

Final verified state, offline, real Chrome, genuine offline emulation: **66/66 assets
available, 18/18 features working** — app shell, project config, 360° panorama
(8192×4096), site-plan overlay, plot geometry, landmark categories, both videos
(`readyState 4`), all 25 gallery images, 4-page brochure PDF, contact card + photo,
background audio, and all 9 virtual tours including multi-room navigation through MODERN
VILLA's 9 rooms (screenshots confirm real imagery, not blank spheres).

---

## 2026-09-12 (the real cause of "video and images stopped working offline": the offline download was racing boot and only saving ~19KB of config)

`app.js`, `sw.js`. User report: "video and images worked perfectly well yesterday, and I
don't know what you changed today with the PDF that everything else is not getting played
in offline on mobile." Analyzed against yesterday's commit (`16ab80f`) before touching
anything. Three separate faults, all introduced or exposed by today's earlier work:

- **ROOT CAUSE — the offline download was collecting the wrong asset list.** Moving
  `registerOfflineSupport()` to the top of `init()` (done earlier today, so the worker
  could cache boot fetches) also moved the offline BANNER there, because the banner offer
  was fused to the end of that same function. The banner calls `collectOfflineAssets()`,
  which reads `state.menuConfig`/landmarks/amenities/tours to decide what to download —
  none of which are loaded yet that early in boot. So when the worker won the race, the
  banner collected only the handful of config files `collectOfflineAssets` adds
  unconditionally and offered a **19KB** download instead of the real **230MB** one.
  Tapping Add cached the config and nothing else: the menu worked offline while every
  video, image and PDF behind it was missing — precisely the reported symptom. Whoever won
  the race depended on connection speed and whether the worker was already installed,
  which is why it looked intermittent rather than simply broken. **Fixed by splitting the
  two concerns**: `registerOfflineSupport()` still starts at the top of `init()` and now
  just returns whether the worker became ready; the new `offerOfflineSaveAfterBoot()` is
  called at the END of `init()`, so the banner always measures a fully loaded project.
  Verified in a real browser: the same eviction scenario that offered "approx. 19 KB"
  before the fix offers "approx. 230 MB" after it.
- **A VERSION bump used to destroy the visitor's entire download.** `DATA_CACHE` and
  `MEDIA_CACHE` were version-namespaced, and `activate` deletes every cache not in the
  current version's list — so bumping v7→v8 for the PDF fix silently wiped ~200MB of
  already-downloaded content off every phone that had it, which is why "everything else"
  broke and not just the PDF. **Both content caches are now un-versioned** (`b91-data`,
  `b91-media`); only the SHELL stays versioned, since it's code and it's ~2MB to refetch.
  A new `migrateLegacyContentCaches()` folds any pre-existing `b91-data-v*`/`b91-media-v*`
  cache into the un-versioned one on activate — copying only complete `200` entries, so
  the corrupt partial responses the old PDF bug produced are dropped rather than carried
  forward — then deletes the drained legacy cache. Claim happens before migration so the
  page isn't left uncontrolled while a few hundred MB is folded over.
- **The banner could never re-offer once it had been dismissed or completed.** It skipped
  itself whenever the `b91-offline-saved-*` flag was set, and bailed out entirely under
  `isStandaloneDisplay()`. But that flag only records that a download once FINISHED — not
  that the content is still there; caches get evicted under storage pressure (iOS Safari
  also clears them after ~7 days unopened), and until today a version bump deleted them
  outright. A visitor left with the flag set and an empty cache had no route back short of
  clearing site data, and an INSTALLED visitor — opening from the home-screen icon, i.e.
  the exact audience this feature exists for — had no route at all. Now
  `countMissingOfflineAssets()` asks Cache Storage what is actually stored, the banner
  re-offers whenever content is genuinely missing (installed or not), and in standalone it
  presents as "Download for offline use · approx. N · so it works with no signal" instead
  of a meaningless "Add to Home Screen". The declined flag is still respected.

Verified end-to-end in real Chrome at phone viewport, with genuine `setOffline(true)`:
full download → offline reload → video `readyState 4` / no error / 138.4s, brochure 4/4
pages, gallery images all loaded; content survives a simulated version bump (legacy caches
migrated, 38 entries intact, video still plays); banner re-offers after eviction and in
standalone, and stays quiet once content is genuinely present. 15 ranged-cache unit tests,
8 cache-survival assertions and 5 banner assertions all pass.

---

## 2026-09-12 (offline banner permanently silenced by a stale SW_VERSION; separately, the working tree itself was found reverting on disk)

`sw.js`, `app.js`, `CLAUDE.md`, `CHANGELOG.md`. User asked why the "Add to Home Screen /
save for offline" banner wasn't showing on their phone, after the PDF/video
offline-caching fix below. Investigated instead of assuming the feature was removed (it
wasn't — traced `collectOfflineAssets`/`maybeOfferOfflineSave`/`runOfflineDownload`, all
intact).

- **Root cause — banner permanently silenced.** `app.js`'s `SW_VERSION` constant (used
  to namespace the banner's dismissal memory: `b91-offline-declined-${SW_VERSION}-<pid>` /
  `b91-offline-saved-${SW_VERSION}-<pid>` in `localStorage`) was hardcoded to `'v5'` and
  never bumped, despite its own comment saying "Must match VERSION in sw.js" — meanwhile
  `sw.js`'s `VERSION` had moved to `v6` (three.js minified swap), `v7` (video priming
  fix), then `v8` (PDF fix, below) over the course of this session. Any earlier tap of
  "Skip" (or a completed download) under the stale `v5` key stays permanently recorded —
  the banner can never show again for that project on that browser, no matter how much
  the underlying caching code changes, since the check is still reading the same old key.
  Fixed by bumping `SW_VERSION` to `'v8'` to match `sw.js`.
- **A separate, more alarming discovery made while fixing the above: the on-disk working
  copy of several files had reverted to an EARLIER state than what was actually committed
  in git**, without any edit tool call causing it. Concretely: `sw.js` on disk had gone
  back to the pre-PDF-fix code (`respondVideo`, `isRangedMediaPath`, `VIDEO_BLOB_CACHE`,
  etc.), `app.js`'s `registerOfflineSupport()` call had moved back to the END of `init()`
  (undoing the boot-timing fix below), and `CLAUDE.md`/this file had both lost their
  already-written PDF-fix documentation entirely — even though `git show
  5c41213:plot-map/<file>` proves the correct, fully-documented, committed state really
  did exist earlier the same day. **This was caught only by diffing the live disk files
  against the last known-good commit before trusting either one** — an in-context edit's
  own "file state is current" assumption is not a substitute for that check when
  something outside the edit tool (a synced folder, an editor with a stale buffer and
  autosave-on-focus, or similar) can rewrite a file between turns. This repo lives under
  a Windows user's Desktop, a path OneDrive syncs by default on many Windows setups —
  the most likely (though unconfirmed) mechanism. Fixed by restoring all four files from
  the last known-good commit and re-applying only the genuinely-new `SW_VERSION` fix on
  top. **If a future session finds a previously-verified fix apparently missing again,
  diff the live file against the relevant commit (`git show <sha>:<path> | diff - <path>`)
  before concluding the code regressed and re-deriving the fix from scratch — it may be
  the disk copy, not the code, that's stale.**

## 2026-09-12 (PDF brochure offline caching + a deeper boot-order fix; verified with a real end-to-end offline test)

`sw.js`, `app.js`. User asked to analyze PDF preview/offline behavior first, then confirmed:
"make sure the video and images are getting downloaded and can be previewed inside the
app, the pdf also gets downloaded the same way... for the online mobile users the pdf
should be previewed in the app itself."

- **Root cause (PDF)**: pdf.js reads a PDF progressively via HTTP Range requests, exactly
  like a `<video>` element — confirmed by capturing real network traffic (multiple `206`
  responses for different byte ranges of the same file). But `.pdf` wasn't in the file
  extension list routed through the safe ranged-asset caching path added the day before
  for video — it fell through to the generic `staleWhileRevalidate`, which caches
  whatever comes back under one key per URL. Since pdf.js's several range requests each
  return a *different* slice, each one overwrote the last under that same key — whichever
  slice landed last "won" and became the permanently cached (corrupted, partial) copy.
  Offline, pdf.js could never parse that fragment as a real document.
- **Fix**: extended the same safe-caching mechanism used for video to also cover PDFs.
  Renamed the (now no-longer video-specific) infrastructure for accuracy:
  `isRangedMediaPath`→`isRangedCacheablePath` (now includes `.pdf`), `respondVideo`→
  `respondRangedAsset`, `VIDEO_BLOB_CACHE`→`RANGED_BLOB_CACHE`, `VIDEO_PRIME_INFLIGHT`→
  `RANGE_PRIME_INFLIGHT`, `primeVideoCache`→`fetchAndCacheFull`. `VERSION` bumped
  `'v7'→'v8'`.
- **A second, real gap found and fixed in the same pass**: the plain (`!range`) fetch
  path and the ranged background-priming path weren't deduped against EACH OTHER — only
  against themselves. pdf.js commonly issues one main unranged streaming request
  alongside a few early ranged reads (e.g. for the xref table near the end of the file);
  before this fix, each of those two REQUEST SHAPES independently triggered its own full
  download of the same file — observed directly as two complete 36MB fetches for one
  brochure open. Unified both paths behind one shared `fetchAndCacheFull` tracker so
  whichever request (ranged or not) arrives first starts the one real fetch and every
  other concurrent request for the same key joins it. Verified with real service-worker
  console instrumentation (temporarily added, then removed) that exactly ONE real
  `fetch()` now happens per file, not two — Playwright's own network log still shows two
  "200" entries per fetch, which turned out to be how it reports a service-worker-
  mediated request (the worker's own outbound fetch AND the page-visible response,
  logged as two separate entries) rather than an actual duplicate download.
- **A separate, deeper bug found while verifying end-to-end**: `registerOfflineSupport()`
  was called at the very END of `init()`, after every boot-critical project file
  (alignment.json, plots.svg, landmarks/amenities/tour.json) had already been fetched.
  Since a service worker only intercepts fetches once it's actually active and
  controlling the page, NONE of that config was ever cached on a genuine first visit —
  confirmed directly: a real offline reload showed the menu collapsed to just the three
  built-in rows (AERIAL VIEW/LANDMARKS/VIRTUAL TOUR, the only items that don't depend on
  `menuConfig`), every authored menu item, landmark, and tour simply gone. Moved the
  (still fire-and-forget, non-blocking) registration call to the very start of `init()`
  instead, giving the worker the best realistic chance of being active before those
  fetches fire.
- **Verified end-to-end with a real browser, not just unit tests**: used Playwright
  driving the system-installed Chrome (`chromium.launch({executablePath: ...})`, no
  download needed) to load the live client, open a video and the brochure while online,
  poll the actual Cache Storage until both were confirmed fully cached, reload once more
  online (realistic — a visitor browses a bit before ever going offline), then call
  `context.setOffline(true)` and reload again for real. Result: the video's `readyState`
  was `4` (`HAVE_ENOUGH_DATA`) with no error and the correct duration; the PDF rendered
  the identical 4/4 pages it did online; every piece of project config, the pano, and the
  site-plan image all loaded with `200` while genuinely offline. Also re-verified the 19
  extraction-based unit tests (rewritten/extended for the rename + a new dedup-across-
  paths case) and the full accumulated 87-test suite from every other change this
  session — all clean.
- **Diagnostic note for later**: an early version of this same end-to-end test wrongly
  reported the video as never caching, due to a bug in the TEST's own matching regex
  (literal spaces that don't match a URL-encoded `%20`) — worth remembering that a
  negative result from custom verification tooling needs the same scrutiny as the code
  under test, not automatic trust.

---

## 2026-09-12 (mobile: videos now actually get cached for offline playback)

`sw.js`. User report, analyzed first: "for the mobile offline users are the videos not
getting downloaded."

- **Root cause**: `respondVideo`'s only cache-WRITE path lived in its `if (!range)`
  branch — i.e. it only ever saved a video the first time it was requested WITHOUT a
  `Range` header. Desktop browsers commonly make that first request as a plain GET;
  mobile browsers (iOS Safari reliably, Android often too) send a `Range` header on the
  very first request for a `<video>`/`<audio>` element, before playback even starts, just
  to probe the file. So on mobile that `!range` branch was essentially unreachable, and
  every video fell through to a bare network passthrough with no caching at all — on ANY
  visit, however many times it was played. The function's own comment already described
  the intended fix ("a separate unranged fetch kicked off in the background to prime the
  full-file cache for next time") but that fetch didn't actually exist anywhere in the
  code — comment and implementation had drifted apart.
- **Fix**: `primeVideoCache(cache, key, url)` (new) — when a ranged request finds nothing
  cached yet, it now also kicks off a second, plain (no Range header) fetch of the same
  URL purely to populate the cache, wrapped in `event.waitUntil()` so the service worker
  isn't torn down mid-download once the (unrelated) visible ranged response has been
  sent. `respondVideo` gained an `event` parameter to make that possible.
  `VIDEO_PRIME_INFLIGHT` (a key→Promise map) dedupes this: a video's several range
  requests (the metadata probe, then real playback, then any seeks) arriving while that
  background download is still in flight only ever start ONE fetch, not one per request
  — once it lands, `full` is set on the next request and the priming path is skipped
  from then on.
- **`VERSION` bumped `'v6' → 'v7'`** per this file's own stated policy (bump on any
  caching STRATEGY change) — not because existing cached videos are invalidated by this
  (they aren't; this is purely additive), just for consistency with v2/v5/v6's own bumps.
- **Verified**: `node --check` clean; a 10-assertion function-extraction test against the
  real `respondVideo`/`primeVideoCache` — confirmed the already-cached and
  uncached-plus-unranged paths are unaffected, confirmed the reported mobile scenario
  (uncached + ranged) now starts a genuine background priming fetch AND still answers
  the visible request immediately without waiting on it, confirmed the primed video is
  actually in the cache once that background fetch resolves, and confirmed 3 overlapping
  ranged requests for the same uncached video only ever trigger ONE background fetch —
  10/10 passed. Full accumulated suite from every other change this session re-run clean
  (78/78).

---

## 2026-09-11 (fixed the standalone export bundle actually failing to boot at all — `$` collision)

`server.py`. User report, asked to analyze first: "after doing export standalone site,
its not opening in offline mode."

- **Confirmed with a REAL headless-Chrome load of a real exported bundle** (Playwright +
  the system-installed Chrome, opening the extracted zip's `index.html` via a genuine
  `file://` URL — not a server, not a simulation) rather than reasoning about it: the page
  hung forever at "LOADING… 0%" with `[pageerror] Identifier '$' has already been
  declared`.
- **Root cause**: `module_to_global()` (added earlier this session, converts the vendored
  three.js ES module into a `window.THREE = {...}` global for the bundle's classic
  `<script src>` use) only rewrote the module's *trailing* `export {...}` line — every
  other one of the module's thousands of top-level `const`/`let`/`class` declarations
  (heavily minified single/double-letter names) was left as bare top-level code. Inside an
  ES module those are scoped to that module, invisible to anything else. Loaded as a
  classic script instead, top-level `const`/`let`/`class` declarations spill into ONE
  lexical scope SHARED by every `<script>` tag on the page — and the minifier had assigned
  one of ITS internal names to `$`, colliding head-on with `app.js`'s own top-level
  `const $ = (id) => document.getElementById(id);` helper. That collision is a
  `SyntaxError`, and a `SyntaxError` in a classic script means NONE of that script's code
  runs — not just the one colliding line — which is exactly why the whole app never booted.
- **Fix**: `module_to_global` now wraps the entire rewritten module body in an IIFE
  (`(function () { ...module body...; window.THREE = {...}; })();`), scoping all those
  internal declarations to that function instead of the page's shared scope. Only the
  explicit `window.THREE = {...}` assignment still reaches outside it — exactly the
  standard pattern real UMD/IIFE bundlers use for this exact reason.
- **Verified end-to-end, not just at the unit level**: re-exported a real bundle after the
  fix, loaded it in the same real headless Chrome via `file://`, and this time it fully
  booted — "LOADING… 100%", the real brand/menu/legend/compass all rendered, 2 canvas
  elements present — and a screenshot confirms the actual pano + plot overlay genuinely
  painted on screen, not just present in the DOM. Also re-ran the isolated
  IIFE-vs-collision reproduction in Node (simulate an app.js-shaped `const $` alongside
  the transformed output of both the dev and minified builds) to confirm the fix
  specifically closes the reported failure mode, not just "some" bundle-loading issue.
  A separate, unrelated finding surfaced during this test: `test12` (one of the projects
  used for a quick low-size re-test) has genuinely missing pano/ground-image files on
  disk — not a code bug, that project's own data is incomplete; `anandman`'s images are
  intact and were used for the definitive real-render confirmation instead.
- **Also noted, not fixed (cosmetic, doesn't block anything)**: the bundle's Contact-modal
  placeholder image (`projects/sample/Demo.web.jpg`, a static fallback `src` overwritten
  by JS before it's ever actually shown) 404s under `file://` since bundle mode uses a
  `data/` folder, not `projects/<id>/`. Worth fixing later; does not affect boot or any
  visible functionality.

---

## 2026-09-11 (real progress feedback for "Export standalone site…")

`app.js`. User report: "if the user clicks export standalone site how can he see the
downloading is even started or not there is no downloading progress animation."

- **Root cause**: `onProjAction` hides the project dropdown menu the instant any item in
  it is clicked (`els.projMenu.hidden = true`) — BEFORE `exportBundle()` even runs — so
  the "⬇ Export standalone site…" button itself is already invisible for the entire
  operation; swapping its own label (the pattern the header "💾 Save" button already
  uses) wouldn't be seen. The only feedback was a single `showNotice(...)` toast that
  auto-hides after a fixed 9 seconds regardless of whether the export — which can
  genuinely take a long time; a content-heavy project's zip was measured at 541MB in an
  earlier session test — was anywhere near done.
- **`showNotice(msg, {persist=false})`** — new option, skips the auto-hide timeout when
  `true`. A caller reporting live, repeated progress passes `persist:true` on every
  update so the message never disappears out from under an operation that's still
  running; the final "done" or "error" message reverts to a normal (non-persist) call so
  it still auto-hides as before.
- **`exportBundle()`** now reports BOTH real phases: "Building…" while `server.py` is
  still assembling the zip in memory (nothing to report yet — `fetch()` itself hasn't
  resolved), then switches to a live "Downloading… N% (X MB of Y MB)" once bytes start
  arriving, reusing `fetchBlobWithProgress` (already built for the boot progress bar) for
  real byte-level progress — throttled to at most 4 UI updates/sec so a fast LAN transfer
  doesn't hammer the DOM.
- **`fetchBlobWithProgress`** also improved to extract a real `{error}` message from a
  failed response's JSON body (several of this app's own API routes return one) instead
  of only ever showing a generic status-code message — a small, backward-compatible
  enhancement that benefits every caller, not just this one.
- **Verified**: `node --check` clean; a 9-assertion function-extraction test — persist
  vs normal `showNotice` timeout scheduling, and `fetchBlobWithProgress`'s new JSON vs
  plain error-message fallback — 9/9 passed; full accumulated suite from every other
  change this session re-run clean (68/68).

---

## 2026-09-11 (fixed the PWA offline cache — still referenced the old three.js file)

`sw.js`. User asked "is the export standalone file not working, first analyze and tell
me" after the load-time optimization work — traced every remaining reference to
`vendor/three.module.js` across the whole project (not just server.py, which was already
fixed) and found a second, separate bug in the PWA service worker's precache list.

- **The bug**: `SHELL_URLS` (the shell files precached for offline use on install) still
  listed `./vendor/three.module.js` — the OLD, now-unused dev build. Since that file is
  still on disk, the fetch quietly succeeded and cached it anyway, wasting ~1.3MB of a
  visitor's offline storage on a file the app never loads any more — while
  `three.module.min.js` (what `app.js` actually imports now) was never precached at all.
  A visitor who installed the site for offline use, then went offline, would find the 3D
  pano viewer unable to load THREE.js at all.
- **Fix**: `SHELL_URLS` now lists `./vendor/three.module.min.js`. Bumped `VERSION`
  `'v5' → 'v6'` per the file's own documented convention ("bump whenever the caching
  STRATEGY changes... so an already-installed worker cannot keep serving data under the
  previous rules") — necessary here since an already-installed v5 worker's shell cache
  has the wrong file in it; the version bump makes `activate` delete it and force a
  fresh precache under the corrected list.
- **Also checked and ruled out**: `spike/index.html` (an old dev prototype, not part of
  the live app or the export bundle) still references the old path too, but doesn't
  affect anything a visitor or the export feature touches — left alone.
- **Verified**: `node --check` clean on both `app.js` and `sw.js`; confirmed live via
  `curl` that the served `sw.js` has the corrected path and version.

---

## 2026-09-11 (site-wide load-time optimization: gzip, minified three.js, vendor caching)

`server.py`, `app.js`, `vendor/three.module.min.js` (new). User request: "decrease the
loading time of the overall website and make it fast." Audited actual response headers
and file sizes first rather than guessing — found three real, safe wins with zero
behavior change:

- **Three.js was shipping the full unminified DEV build** (`vendor/three.module.js`,
  1.3MB, 53,044 lines — a pretty-printed source build, not production output) on every
  single page load, client and admin alike. Downloaded the OFFICIAL minified r160 build
  (exact same version — confirmed via the `REVISION` constant, `unpkg.com/three@0.160.0/
  build/three.module.min.js`, three.js's own npm package) to
  `vendor/three.module.min.js` (670KB) and repointed `app.js`'s one import line at it.
  Verified the new build exports everything `app.js` actually uses (`WebGLRenderer`,
  `PerspectiveCamera`, `BufferGeometry`, `Mesh`, `Raycaster`, `SRGBColorSpace`, etc. — 21
  symbols checked) and, separately, a Node smoke test actually constructing a `Scene`/
  `Mesh`/`PerspectiveCamera`/`BufferGeometry` with the exact option shapes `app.js` uses
  — 9/9 passed. The old dev build is left on disk (harmless, unreferenced) in case
  THREE's own internals ever need debugging with readable stack traces.
- **The server sent zero compression, ever** (`server.py`'s `_serve_static`, inherited
  from `SimpleHTTPRequestHandler`) — confirmed via `curl -H "Accept-Encoding: gzip"`
  getting back full-size, uncompressed bodies regardless. Added on-the-fly gzip for
  text-ish MIME types (`text/*`, `application/javascript`, `application/json`,
  `application/manifest+json`, `image/svg+xml`) above 1KB, only on the plain full-file
  response path (the existing byte-range/streaming path for large media is untouched —
  gzip and Range together is genuinely complex and media files aren't compressible
  anyway). Falls back to the original uncompressed path for any client that doesn't
  advertise `gzip` support. Measured live: `app.js` 475KB→140KB (70%),
  `styles.css` 132KB→31KB (77%), `three.module.min.js` 670KB→167KB (75% — 87% off the
  original 1.3MB dev build combined with the swap above).
- **`/vendor/*` now gets a real `Cache-Control`** (`public, max-age=31536000,
  immutable`) — these are third-party libraries this project never edits in place (a
  version bump means a new filename), so they were the one class of asset safe to cache
  hard; everything else (`app.js`/`styles.css`/`index.html`, already cache-busted via
  their own `?v=` query string; project content under `projects/`; admin-editable data)
  stays `no-cache`, since those genuinely change and admin edits must show up on reload
  without a hard-refresh — unchanged behavior, verified nothing that needs to stay live
  got the long-cache treatment.
- **Verified**: `python -c "import ast; ast.parse(...)"` clean on `server.py`;
  `node --check` clean on `app.js`; live `curl` checks (local AND through the Cloudflare
  tunnel) confirming gzip negotiates correctly both ways, images/small manifests
  correctly skip compression, byte-range requests on `vendor/three.module.min.js` still
  return proper `206 Partial Content`, and the vendor cache header passes through the
  tunnel intact; the full accumulated test suite from every other change this session
  re-run clean (50/50) to confirm the import-path swap didn't disturb anything.
- **Caught and fixed a real break in the standalone export bundle before shipping**:
  `do_bundle`'s `strip_named_import`/`BUNDLE_SHELL`/the `elif rel == ...` copy check all
  hardcoded the OLD `vendor/three.module.js` path — after repointing `app.js`'s import,
  every future "Export standalone site…" would have shipped a bundle whose `app.js` still
  contained a bare `import` statement inside a plain (non-module) `<script src>` tag, a
  guaranteed `SyntaxError` in the browser. Found by tracing every reference to the old
  path, not just testing the live server. **Also found `module_to_global` — the function
  that rewrites the vendored ES module into a `window.THREE = {...}` global for file://
  use — silently produced INVALID JavaScript against the minified build specifically**:
  its regex spliced the raw `export {...}` list text into an object literal, which works
  for the dev build (bare names, e.g. `{Scene, Mesh}`) but not the minified build's
  aliased exports (e.g. `{nt as ACESFilmicToneMapping}` — `as` has no meaning inside an
  object literal, `SyntaxError: Unexpected identifier 'as'`, confirmed by actually
  executing the transformed output in Node, not just checking for a leftover "export"
  string). Rewrote it to parse each export item (aliased or bare) and emit a real
  `exportedName: localName` pair. Fixed all four references to use
  `vendor/three.module.min.js` throughout. **Verified end-to-end against the real
  endpoint**: downloaded an actual export bundle via `/api/export-bundle?project=
  anandman`, extracted just `app.js` and `vendor/three.global.js` from the real zip
  (skipping the project's own multi-hundred-MB embedded media), confirmed `app.js` has
  no leftover `import` statement and `three.global.js` actually executes in Node and
  produces a working `window.THREE.WebGLRenderer`/`.REVISION === '160'`.

---

## 2026-09-11 (a tour with only one room no longer shows a pointless room-list submenu)

`app.js`. Bug report with screenshot on the same-day drawer-integration change: a
"Swimming Pool" tour with a single room showed a drawer submenu with just that one room
(highlighted green, since it's also the only one and the one you're standing in) plus
Exit Tour — "I don't want to open a submenu when there is only one thing inside it,
unlike Modern Villa which has multiple [rooms] inside it."

- Exactly the same "one thing inside is never a choice" rule `resolveFolderTarget`
  already applies to ordinary authored folders (see its own top-of-file comment), now
  applied to tour rooms too: `openClientPanoTour` no longer pushes `tourRoomPickerNode`
  for a tour with `nodes.length <= 1`.
- Where the drawer lands instead depends on what else exists: 2+ tours total ⇒ stays at
  the tour list (`virtualTourPickerNode`) so switching tours is still possible; exactly
  one tour (and it has only one room) ⇒ falls all the way back to the ROOT menu.
- **The root menu can now carry an "✕ Exit Tour" row of its own** (new, in
  `renderClientSidebar`'s stack-length-0 branch and `wireClientSidebarButtons`) — needed
  for that last case, since a single-tour/single-room project has no picker level left to
  put it on, and a tour taking over the viewer still needs a visible way out. Also fixed
  the drawer's own hide condition, which previously hid it entirely when nothing was
  authored — now also checks `state.tourView` so the Exit Tour row doesn't vanish along
  with the rest of the (empty) root menu.
- **`withExitTourRow(children)`** (new, factors out what was a hardcoded array in
  `tourRoomPickerNode`) — appends the Exit Tour row only `if (state.tourView)`, shared by
  `virtualTourPickerNode` (which now also carries it, for the "2+ tours, active one has 1
  room" case) and `tourRoomPickerNode`.
- **`refreshTourRoomMenu`** extended to also highlight the active TOUR (not just the
  active room) when the tour list — rather than a room list — is what's currently shown.
- **Verified**: `node --check` clean; rewrote/extended the two relevant test files —
  `tourRoomPickerNode`/`virtualTourPickerNode` now assert the Exit Tour row only appears
  while touring (8/8), and a new `openClientPanoTour` suite covers all four room/tour-
  count combinations (multi-tour + 1-room active tour stays at the tour list; single-
  tour + 1-room falls to root; single-tour + multi-room still goes straight to the room
  list; multi-tour + multi-room drills as before) — 13/13. Full accumulated suite across
  every tour-related change this session re-run clean: 50/50.

---

## 2026-09-11 (multi-tour VIRTUAL TOUR click now auto-plays the topmost tour)

`app.js`. Explicit request, refining the same-day drawer-integration change: "if there is
more than one [tour] then only go inside it in the menu the same way we [do] for the
other thing in the menu, and when the user clicks on virtual tour it should directly
open the topmost virtual tour i.e temple in this case."

- **Before**: with 2+ tours, clicking the root VIRTUAL TOUR item only opened the tour-list
  picker in the drawer — nothing played in the pano until the visitor picked a tour by
  name. That's inconsistent with every OTHER multi-child menu item, and with LANDMARKS,
  which shows something (ALL LANDMARKS) the instant its own category list appears.
- **`openClientPanoTour(tourId, title, {anchorRooms=true})`** — new option. `true`
  (the default, unchanged for every other call site) drills the drawer straight to the
  opened tour's own room list. `false` stops one level up at the tour list instead —
  used ONLY by the root VIRTUAL TOUR click's multi-tour case, which now calls
  `openClientPanoTour(state.tours[0].id, state.tours[0].name, {anchorRooms:false})`:
  shows the tour list (matching generic folder "show my own children" behavior) while
  auto-playing `state.tours[0]` (the admin's own ordering — "Temple" in the reported
  case) so the visitor sees something immediately. Explicitly picking a DIFFERENT tour
  from that list still drills one level deeper into ITS room list (default `anchorRooms`).
- **Removed `openVirtualTourPicker`** — dead code once the root click stopped calling it
  directly (its one job, setting the tour-list anchor, is now just `anchorRooms:false`'s
  side effect inside `openClientPanoTour`).
- **Boot auto-open gets this for free**: `computeAutoOpenTarget`/`fireAutoOpen` dispatch
  through the exact same `openNodeContent` 'virtualtour' branch a real click uses, so a
  project whose top menu row is VIRTUAL TOUR with 2+ tours now also auto-plays the
  topmost tour on load, not just on a later click.
- **Verified**: `node --check` clean; a 7-assertion function-extraction test against the
  real `openClientPanoTour` (root click with `anchorRooms:false` shows the tour list only
  AND plays the topmost tour's start node; explicitly picking a named tour still drills
  to a 2-level stack; a single-tour project is unaffected, straight to its room list) —
  7/7 passed, plus the two pre-existing tour test suites re-run clean (23/23 combined).

---

## 2026-09-11 (virtual tour room navigation moved into the drawer; floating tour bar removed)

`app.js`, `index.html`, `styles.css`. Explicit request, discussed first: "the things
under virtual tour should come in menu same as that when we click landmarks all the
categories get shown up in the menu itself, and remove the bar which is shown in image
[the floating room-strip], when someone clicks virtual it should automatically open the
room which is on top of the menu."

- **`tourRoomPickerNode(tour)`** (new, next to `virtualTourPickerNode`) — the per-room
  analogue of the landmarks category list: a synthetic parent whose children are the
  open tour's rooms (`contentType: 'panotourroom'`, `content: {tourId, nodeId}`) plus a
  trailing **"✕ Exit Tour"** row (`contentType: 'exittour'`), rendered by the existing
  generic drawer submenu (`renderClientSidebar`'s drilled-in-parent branch) — no new
  rendering code needed, it's the same mechanism an authored folder or the tour-LIST
  picker already uses.
- **`openClientPanoTour`** now anchors the drawer to `[tourRoomPickerNode(tour)]`
  (one level) when the project has exactly one tour, or `[virtualTourPickerNode(),
  tourRoomPickerNode(tour)]` (two levels — pick a tour, then its rooms) when there are
  2+. Its existing `tourGoTo(tour.startNode || tour.nodes[0].id, {instant:true})` call at
  the end was already unchanged and already IS "auto-open the room on top" (the first
  room in `tour.nodes` order, which the room list also renders in) — nothing new needed
  there, just confirmed it still holds with the drawer now showing that same list.
- **`openNodeContent`** gained two contentTypes: `'panotourroom'` (jump to a specific
  room — walks within the current tour via `tourGoTo` if it's already open, otherwise
  opens the tour fresh via `openClientPanoTour` then jumps to the clicked room, since
  that would otherwise only land on the tour's designated start node) and `'exittour'`
  (`closePanoTour()`).
- **Removed the floating `#tourBar`** (title + room-strip pills + "✕ Exit tour", shown
  in the user's screenshot) entirely: `index.html` markup, all `.tour-bar*`/`.tour-chip`/
  `.tour-exit` CSS, `els.tourBar`, and `refreshTourBar()` (replaced by
  `refreshTourRoomMenu()`, a much lighter function that just toggles `.is-active`/
  `.is-busy` on the drawer's existing room-list buttons instead of rebuilding a separate
  DOM tree — `.cat-btn.is-active` already existed and is shared with every other drawer
  list). Admin already had its own equivalent room-jump control in the Tour tab's node
  list (the ▶ button) and its own "← Back to the plot map" exit button, so removing the
  bar for admin too (it had no `is-admin` scoping) does not strand admin workflow.
- **Drawer back-button is now tour-aware**: backing out of the room list (single-tour)
  or the tour list (multi-tour, one level further out) while a tour is open now calls
  `closePanoTour()` instead of just popping to a root menu that would otherwise show
  while the pano still displayed a tour room — a state this app has deliberately never
  allowed since the tour-anchoring work two days earlier. `isTourMenuNode(node)` (new)
  identifies both synthetic tour-related parents by id.
- **Verified**: `node --check` clean, CSS brace-balanced (751/751); a 17-assertion
  function-extraction test against the real `tourRoomPickerNode`/`isTourMenuNode` (room
  order/content/titles, the Exit Tour row, both synthetic-id checks) plus a
  reimplementation check of the back-button's exit-on-pop-out logic covering all four
  real scenarios (single-tour, multi-tour partial pop, multi-tour full pop, and an
  ordinary authored folder with no tour open never being mistaken for one) — 17/17
  passed. Confirmed live via `curl` against the running server.

---

## 2026-09-11 (fixed a jarring hotspot transition: crossfade-then-snap → snap-then-crossfade)

`app.js`. Follow-up bug report on the same-day "snap to start view" change: "shows a
camera angle and then cut to the room start view, which is not looking good."

- **Cause**: the camera-snap block (`state.view.lon/lat/fov = node.defaultView...`) ran
  AFTER the crossfade's `await tourTween(460, ...)` had already fully completed — so the
  entire 460ms fade played out at the visitor's stale, carried-over look direction, and
  only once it finished did the camera hard-cut to the new room's saved view. Two
  separate motions (a smooth fade at the wrong angle, then an abrupt jump) read as broken,
  not smooth.
- **Fix**: moved the `tv.nodeId`/`state.northDeg`/`state.view.lon,lat,fov` block to run
  BEFORE the texture swap/crossfade decision, right after the node's texture finishes
  loading. The crossfade (or hard swap) now plays out entirely at the correct, final
  camera angle — one clean cut immediately followed by a smooth fade, not the reverse.
- **Verified**: `node --check` clean; re-ran the existing 5-assertion `tourGoTo`
  extraction test (still 100% passing — confirms the reorder didn't change any of the
  already-verified snap/calibration behavior) plus a new 6th assertion added specifically
  for this bug: a mocked `tourTween` records `state.view.lon` at the moment its per-frame
  callback fires (i.e. *during* the fade) and confirms it already equals the target
  room's saved lon, not the stale pre-transition one.

---

## 2026-09-11 (tour hotspots now snap the camera to the target room's start view)

`app.js`. Explicit request, discussed first (an AskUserQuestion round-trip on animate-vs-
cut and scope before implementing): "when the user clicks on any of the hotspot inside
the virtual tour the camera should pan to the room's start view which was set by the
admin."

- **Diagnosis presented to the user before changing anything**: `tourGoTo(nodeId,
  {instant})` only ever applied `node.defaultView.lon/lat/fov` to `state.view` when
  `instant` was `true` — a fresh entry from the aerial map. A hotspot click
  (`tourGoTo(k.to)`, no `instant` passed), the room-strip thumbnail click, and the
  admin's own node-list click all default to `instant: false`, so the visitor's current
  look direction simply carried over unchanged into the new room ("heading continuity",
  a deliberate earlier design choice — not a bug).
- **Confirmed with the user**: cut instantly to the new room's saved view the moment the
  pano is done loading/crossfading, not an animated pan; applied to every non-instant
  arrival uniformly (hotspots, room-strip thumbnails, admin node clicks) rather than
  hotspots only, for consistency with the already-unconditional per-room compass
  calibration added the day before.
- **`app.js`**: removed the `if (instant) { ... }` gate around the `state.view.lon/lat/
  fov` assignment in `tourGoTo` — it's unconditional now, right after the crossfade (or
  hard pano swap) has already completed, so it reads as a cut rather than a pan mid-fade.
- **Verified**: `node --check` clean; a function-extraction test against the real
  `tourGoTo` (heavily mocked THREE/tour-cache/DOM dependencies) — 5/5 passed, covering a
  non-instant hotspot-style arrival snapping lon/lat/fov to the target room's saved view
  (starting from a deliberately different "mid-look-around" view to prove it's not
  carrying over), the per-room compass calibration still firing on the same arrival, and
  the pre-existing instant-entry path still behaving exactly as before.

---

## 2026-09-10 (boot progress bar; parallelized the pano + site-plan image fetches)

`index.html`, `styles.css`, `app.js`. User report: "the client wont know that something
is getting loaded... plot layouts with some delay over the background pano, also reduce
this delay."

- **Root cause found, not guessed:** on the live test project the pano
  (`Lifestyle.web.jpg`, ~5 MB) loads fine, but the ground-drape site-plan PNG
  (`groundImage`, the actual "plot layout trace" image draped on the ground — 26 MB in
  this project's case) was only fetched by `loadGroundImage` **after** `initThree()` had
  already revealed `#bootCurtain` — i.e. strictly *after* the pano was already visible,
  with a plain un-trackable `THREE.TextureLoader().loadAsync(url)` and no progress
  indication at all. That serial ordering, not plot-mesh construction (the test project
  has exactly one plot), was the actual delay the user was describing.
- **`app.js`**: added `fetchBlobWithProgress(url, onBytes)` — streams a `fetch` response
  body via its reader, calling `onBytes(loaded, total)` per chunk (`server.py` always
  sends `Content-Length` for static assets, confirmed by reading `server.py`, so `total`
  is reliable); falls back to a single non-streamed read if the runtime can't stream.
  Boot now pre-fetches the pano AND the ground/plan image **as plain Blobs, in parallel**
  (`Promise.all`), weighting the combined byte progress into an 8–98% range
  (`setBootProgress`, monotonic — never regresses on a stalled fetch) — 45/45 split when
  both need a real fetch, 90/0 (or 0/90) when only one does. `loadGroundImage` itself is
  unchanged (still needs the live `three` scene from `initThree`, so still runs after it)
  but now receives an already-downloaded Blob's object URL instead of a bare path, so the
  only work left at that point is a fast local texture decode, not a multi-second network
  wait — this is what actually closes the "pops in after the pano" gap, not just hides it
  behind a spinner. Session-restored blobs (`restored.pano.blob`/`restored.plan.blob`,
  admin-only) skip the fetch entirely (`instanceof Blob` check), same as before.
- **`index.html`**: `#bootCurtain` gained a bottom-anchored `#bootProgressWrap`
  (bar + `%` text) alongside the existing centered "Loading…" label.
- **`styles.css`**: `.boot-progress-wrap`/`.boot-progress`/`.boot-progress-fill`/
  `.boot-progress-pct` — thin gold fill bar, `position:absolute; bottom:28px`.
- **Scoped to first boot only**: `hideBootCurtain()` now sets progress to 100% and
  permanently hides `#bootProgressWrap` the first time it's called (`bootProgressDone`
  flag) — `#bootCurtain` is reused later for tour-to-tour switching
  (`showBootCurtain()`/`hideBootCurtain()` in `openClientPanoTour`), and without this a
  later reuse would show a stale "100%" bar instead of just the plain label it showed
  before this change.
- **Verified**: `node --check` clean; a function-extraction test against the real
  `setBootProgress`/`fetchBlobWithProgress` source (monotonic clamping, DOM reflect,
  streamed-chunk byte accounting against a mocked `fetch`, throws on a non-ok response) —
  9/9 passed. Confirmed live via `curl` against the running server.
- **Not fixed, flagged instead**: the 26 MB ground-image PNG itself is oversized content
  (4096×4096 RGBA that compresses poorly under PNG), not a code bug — parallelizing its
  fetch with the pano's helps a lot but doesn't shrink the file. Left untouched rather
  than silently re-compressing the admin's uploaded content; recommended re-exporting/
  re-uploading it through a resize pipeline (like `setPanoFromFile` already does for the
  pano) if further reduction is wanted.

---

## 2026-09-10 (per-room virtual-tour compass calibration)

`app.js`, `styles.css`. User request: clicking "Set as this room's start view" should
also offer a direction (N/E/S/W) so the compass points correctly once that room opens in
the virtual tour.

- **Why per-room, not project-wide**: each tour node's pano has its own arbitrary
  "lon 0" (whatever the photographer was facing when it was shot), unrelated to the main
  aerial pano's own (separately-set) `state.northDeg`. A single global calibration can't
  be correct for every room in a multi-node tour.
- **Admin (Tour tab)**: a new "Compass facing" `<select>` (Not set / North / East / South
  / West) sits directly above the existing "🏠 Set as this room's start view" button;
  its currently-picked value is read at the SAME click that saves the start view, so both
  are stored together on `node.defaultView.facingDir` (`setTourNodeDefaultView(facingDir)`
  now takes the picked value). Persisted through `parseTours`/`buildToursData` and through
  session save (already spread via `{...n.defaultView}`).
- **Client**: `tourGoTo` now computes `state.northDeg` on every arrival at a node (not
  gated on `instant` — a room's north/lon relationship is a fixed property of that room,
  independent of whatever the live carried-over camera yaw is): `northDeg = -(node.
  defaultView.lon) - {N:0,E:90,S:180,W:270}[facingDir]`, the exact algebraic inverse of
  `updateCompass()`'s existing `rot = -view.lon*180/PI - northDeg` formula, so at the
  saved start view the compass cone lands exactly on the picked direction. An uncalibrated
  room (`facingDir` unset) falls back to `northDeg = 0`, matching the project's documented
  "uncalibrated ⇒ 0" default rather than leaking in the aerial pano's own calibration or a
  previous room's. The aerial's own `northDeg` is snapshotted into `state.tourView.saved`
  on tour entry and restored by `closePanoTour` on exit, same pattern as the saved camera
  view — so leaving the tour doesn't leave the aerial compass miscalibrated.
- **Files**: `app.js` (`setTourNodeDefaultView`, the hotspot-box DOM builder, `tourGoTo`,
  `openClientPanoTour`, `closePanoTour`, `parseTours`, `buildToursData`,
  `addTourNodeFromFile`), `styles.css` (`.ax-tour-dvrow`/`.ax-tour-dirlbl`/
  `.ax-tour-dirsel`).
- **Verified**: `node --check` clean; a standalone math test replicating the calibration
  formula against `updateCompass`'s real formula — 6/6 passed (all four directions, a
  relative-rotation sanity check, and the uncalibrated fallback).

---

## 2026-09-10 (removed the top-bar "N plots · project · synced HH:MM:SS" status + Refresh button)

`index.html`, `app.js`, `styles.css`. Explicit request from a screenshot of the sync
status strip: "remove this frpm both admin and client side."

- Removed the `.sync` div (`#syncMeta` + `#refreshBtn`) from `index.html`'s topbar
  entirely — it had no `is-admin` scoping, so it showed on both sides.
- **`app.js`**: deleted `setSync()`/`refresh()` and their three call sites (the button's
  own click listener, the boot success path's `setSync(src)` call, and the boot error
  path's `els.syncMeta.textContent = 'Load error'` — the latter was already redundant
  with the `showNotice(...)` call right after it). The unused `src` binding from
  `await loadData()` was cleaned up at the same time.
- **`styles.css`**: removed the now-dead `.sync`/`.sync-meta` rules (base + the
  narrow-topbar responsive override).
- **Verified**: `node --check` clean; `grep` for `syncMeta`/`refreshBtn`/`setSync` across
  all three files and the live server returns zero hits.

---

## 2026-09-10 (Available/Reserved/Sold legend scoped to the aerial view only)

`app.js`, `styles.css`. Clarified (after an AskUserQuestion round-trip — the user's first
phrasing said "landmark section," corrected to "aerial section") request: the plot-status
legend should disappear whenever the visitor isn't looking at the base plot map.

- **`app.js`**: `isAerialSectionActive()` — a structural check (`!state.tourView && `
  `catLevel2 hidden && menuNavStack empty`), not a separately-tracked flag, so it can't
  drift from what the drawer is actually showing. `updateLegendVisibility()` toggles an
  `.is-hidden` class on `els.legend`/`els.zoomStatusGroup` (the header chips and their
  landscape-mobile stand-in). Called from `openLandmarksCategoryPicker`, the LANDMARKS
  back-button handler, and both branches of `renderClientSidebar` (root-menu render AND
  the drilled-in-submenu render — the latter is what makes VIRTUAL TOUR and tour entry/
  exit work for free, since `openClientPanoTour`/`closePanoTour` already call
  `renderClientSidebar` after setting `state.tourView`/`menuNavStack`).
- **`styles.css`**: `.legend.is-hidden { display: none; }`,
  `.zoom-status-group.is-hidden { display: none !important; }` — compound class
  selectors, deliberately NOT relying on source order or `[hidden]`, to sidestep this
  project's own recurring `[hidden]`-vs-`display` specificity trap.
- **Verified**: `node --check` clean; an 8-scenario function-extraction test against the
  real `isAerialSectionActive`/`updateLegendVisibility` (boot, landmarks open/close,
  submenu drill in/out, tour enter/exit, and touring-while-anchored-to-the-tour-picker
  simultaneously) — 8/8 passed.

---

## 2026-09-10 (compass redesign: thinner needle rose, then a frosted-glass look)

`index.html`, `styles.css`. Two rounds: first matched a reference nautical-rose image the
user resent ("make sure you use this as compass" — the earlier session's compass had
drifted, apparently lost between turns like this project's own documented "work
disappears from disk between turns" gotcha), then "make the compass look transparent and
more aesthetic and visually appealing."

- **Round 1 (match the reference)**: narrowed the main/intercardinal rose points from an
  8-unit base width to ~5.2 (needle-like instead of chunky triangles), thinned the ring
  from a 5px solid band + 1.4px inner ring to a single ~2px ring, shrank/relocated the
  N/E/S/W labels from just outside the ring to inboard near the tips (font-size 16→12),
  narrowed the red north indicator from a full-width wedge to a thin needle, and
  contained the heading "cone" shadow's radius inside the ring instead of overshooting it.
- **Round 2 (glass look)**: `.compass` gained `backdrop-filter: blur(5px) saturate(140%)`
  (frosted glass over the live pano) + `border-radius:50%` to clip it; `.cp-face` dropped
  to `rgba(255,255,255,.16)` with a new SVG `<radialGradient id="cpFaceGrad">` highlight
  layered on top; ring/rose/hub colors moved from flat white/black/gray to translucent
  `rgba(...)` equivalents; `.cp-ring` gained a soft `drop-shadow` glow; `.cp-n` (north
  needle) changed to a brighter `#ff3b3b` with its own glow. Labels kept an opaque navy
  fill + white halo (not made transparent) — they sit over an unpredictable live pano
  photo, not a plain page, and a translucent label would vanish over a bright sky.
- **Files**: `index.html` (`#compass` SVG: rose polygon points, label positions, new
  `<defs><radialGradient>`, cone path), `styles.css` (`.compass`, `.cp-*`).
- **Verified**: `node --check`/brace-balance N/A (CSS+SVG only); confirmed live via
  `curl` against the running server after each round (the compass had reverted to a
  pre-fix state between turns at least once this session — re-verified rather than
  assumed before reporting it fixed).

---

## 2026-09-10 (removed the directional pad — drag/flick is the only look-around input now)

`index.html`, `app.js`, `styles.css`. Explicit request from a screenshot of the client
pano showing the ▲◄►▼ overlay: "remove this."

- **`index.html`**: deleted the `#dpad` div and its four buttons entirely.
- **`app.js`**: removed `els.dpadUp/Down/Left/Right`, `DPAD_SPEED`, `startPush`/`endPush`,
  `wireDpad()`, and its call site. **Kept `stepViewMotion`/`state.viewVel`** — checked
  first that they're shared with drag-flick inertia (`wireViewControls`'s pointerup
  handler seeds `viewVel` from a flick's speed; `renderLoop` calls `stepViewMotion` every
  frame regardless of what set the velocity), so removing the d-pad could not mean
  removing those. `stepViewMotion` itself was simplified: it used to ease `viewVel` toward
  a `state.viewPush` TARGET set while a d-pad button was held; with nothing left to ever
  set that target, it now just decays whatever velocity a flick left behind toward zero —
  the actual behaviour was already unaffected for drag-coasting (which never used a
  nonzero push target), so this is a real simplification, not a functional change.
  `state.viewPush` removed from `state`'s initial object along with it.
- **`styles.css`**: removed `.dpad`/`.dpad-btn`/`.dpad-up/-down/-left/-right`, their
  landscape-phone size overrides, and — since it's now entirely moot —
  `body.tour-open .dpad` (the bottom-offset fix from two days ago that lifted the d-pad
  above the tour bar). `body.is-admin .compass, body.is-admin .dpad` lost its now-dead
  second selector.
- **Verified:** `node --check` clean, CSS brace count balanced (763/763), no duplicate
  `id=` in `index.html`, zero remaining references to "dpad" anywhere in the three files.
  6 assertions against the actual extracted `stepViewMotion` confirm drag-flick coasting
  still behaves identically post-simplification: residual velocity still moves the view
  and decays to a clean stop, and zero velocity is immediately reported as "not steering"
  with no NaN or unexpected movement — the removed `push`-target logic wasn't silently
  load-bearing for the case that's kept.

---

## 2026-09-10 (mobile: removed the landmark density cap, shrank banners further instead)

`app.js`, `styles.css`. Explicit request after confirming the cap was hiding landmarks
on mobile: "don't do that, let's make the banner size and font size small for the mobile
view instead of that."

- **`LANDMARK_MOBILE_CAP` set to `Infinity`** (was 4, lowered from 6 just yesterday) —
  every landmark now renders on a landscape phone exactly as it does on desktop; nothing
  is hidden behind a "+N more" tap any more. Left as a one-constant change rather than
  restructuring `renderLandmarks()` — `capSet`/`hiddenCount` stay in the code as
  harmless dead plumbing (the count can never exceed `Infinity`), trivially reversible if
  density ever becomes a problem again at these smaller sizes. `#lmOverflowHint` simply
  never shows now (its `hiddenCount === 0` check is always true).
- **Landscape-phone landmark/amenity sizing shrunk further** (in the same
  `@media (orientation:landscape) and (max-height:500px)` block added yesterday):
  `.lm-ico` 12px→10px, `.lm-label` 11px→9px, `.lm-sub-bar` 8.5px→7px, `.am-ico` 13px→11px,
  `.am-label` 10px→8.5px, with tighter padding/gap throughout — since decluttering is now
  entirely this shrink's job with nothing hidden to fall back on.
- **Verified visually**: the real `.lm-banner` markup, 6 landmarks positioned close
  together, screenshotted at the landscape-phone breakpoint — noticeably smaller than the
  previous pass, text still legible, all 6 rendering simultaneously (none hidden).
  Some residual overlap for landmarks at very similar bearings is the accepted tradeoff
  of "show everything, smaller" over "cap the count" — consistent with what was asked
  for. `node --check` clean, CSS brace count balanced (779/779), confirmed present in
  the live server's served files.

---

## 2026-09-09 (clicking LANDMARKS early in boot showed a genuinely empty picker panel — root-caused via screenshot, confirmed with a clarifying question first)

`app.js`. Reported via two screenshots — a "‹ BACK" panel with nothing else in it, versus
the correct root menu — after a general "any problem opening pano/landmarks on mobile"
discussion. Asked which button led to the empty panel before assuming anything (the
absence of a title next to "Back" ruled out the VIRTUAL TOUR picker and pointed
specifically at Landmarks); confirmed: LANDMARKS.

- **Root cause:** the root menu (with LANDMARKS clickable) renders early in
  boot — synchronously, before the pano texture even starts loading. `#catNav` (the
  landmark category list) isn't populated until `setLandmarks()` runs, much later in the
  same async chain, after the pano AND plot data have both finished loading. A visitor
  who taps LANDMARKS in that window — which a slow connection (a phone, or this session's
  Cloudflare tunnel, documented elsewhere as slower under load) makes much easier to hit —
  saw `#catNav` in its raw initial state. That state used to be a a hardcoded fallback
  category list; earlier today (2026-09-09) it was emptied on the assumption
  `renderLandmarkCategoryNav()` would always populate it before anyone could reach it —
  which this disproved, turning "shows the wrong categories briefly" into "shows nothing
  at all, with no way to tell it's not broken."
- **Fix:** call `renderLandmarkCategoryNav()` once more, immediately after the root
  menu's own early render — it's already idempotent and safe with zero landmarks loaded
  (it always emits at least an "ALL LANDMARKS" button), so an early tap now sees a real,
  clickable picker instead of a dead panel. `setLandmarks()`'s existing call still
  refreshes it with the real categories once they're actually known.
- **Checked the other two built-in rows for the same race, since the same boot-order gap
  applies to all of them equally:** AERIAL VIEW is safe already — `state.home` defaults to
  a sane `{lon:0,lat:0,fov:70}`, so an early tap just flies to a reasonable default rather
  than computing against not-yet-loaded geometry. VIRTUAL TOUR is also already safe — its
  handler explicitly checks `state.tours.length` and shows a plain, honest notice
  ("no virtual tours yet") when tapped before `setTours()` has run, rather than assuming
  data is ready. LANDMARKS was the one exception, since its picker had no such guard and
  no longer had a non-empty fallback to fall back on.
- **Verified:** `node --check` clean. 4 assertions against the actual extracted
  `renderLandmarkCategoryNav`/`getLandmarkCategories`/`effectiveLandmarkCategory` —
  calling it with zero landmarks loaded produces the "ALL LANDMARKS" button and nothing
  else (not blank, not the wrong categories), and calling it again once real landmark
  data exists correctly refreshes to the real category list. Confirmed present in the
  live server's served `app.js`.

---

## 2026-09-09 (mobile landmark clutter: the existing size-reduction rule targeted a mode phones never actually reach)

`app.js`, `styles.css`. Reported as overlapping, cluttered landmark banners on mobile.
Discussed before building: a size-reduction rule for landmark/amenity labels already
existed (`@media (max-width:720px) and (orientation:portrait)`), but the user pointed out
there's no portrait mode for mobile — correct: `#rotateHint` blocks all interaction until
a phone is turned to landscape, so that rule has **never applied to a real phone visitor
in practice**. Every mobile visitor has been seeing full desktop-size banners the whole
time, cap or no cap.

- **New landscape-scoped shrink**, added to the existing `@media (orientation:landscape)
  and (max-height:500px)` block (the one already used for the compass/d-pad/topbar/zoom-
  controls landscape-phone overrides, kept together rather than opening a new breakpoint):
  `.lm-ico`/`.lm-label`/`.lm-sub-bar` and `.am-chip`/`.am-ico`/`.am-label` all get smaller
  font sizes and tighter padding, scoped `body:not(.is-admin)` to match every other rule
  in that block (admin's own editing view is unaffected on any orientation).
- **`LANDMARK_MOBILE_CAP` lowered 6 → 4** — the cap alone wasn't enough on its own once it
  became clear the accompanying font shrink had never actually been reaching a real
  phone; fewer, now-smaller banners compete for the same space.
- **Verified visually**, not just reasoned about: the real `.lm-banner` markup rendered in
  an isolated page and screenshotted at a plain desktop-sized viewport vs. the
  landscape+short one that triggers the new rule — visibly smaller icon blocks and text
  in the landscape case, same markup and positions in both. `node --check` clean, CSS
  brace count balanced (779/779), confirmed both changes present in the live server's
  served files.

---

## 2026-09-09 (drawer stays anchored to the VIRTUAL TOUR section for as long as any tour is open)

`app.js`. Reported: switching rooms, or switching from one tour to another (e.g. "Room"
to "Tour 2"), should keep the drawer's menu inside the virtual tour section rather than
resetting to the plot map's root menu. This directly revises the entry-side half of
2026-09-09's earlier "exit tour → default menu" fix: that fix reset
`state.menuNavStack = []` on BOTH entering and exiting a tour — correct for exiting, but
wrong for entering/switching, which is what's being corrected here.

- **`virtualTourPickerNode()`** (new): the synthetic "folder" object (one row per tour,
  built live from `state.tours`) factored out of `openVirtualTourPicker()` so it can be
  reused — both the picker AND the tour takeover itself now push the same node.
- **`openClientPanoTour`**: instead of resetting `state.menuNavStack = []`, it now sets
  `state.menuNavStack = [virtualTourPickerNode()]` — for BOTH a fresh plot-map→tour entry
  and a tour-to-tour switch. Reopening the drawer at any point while a tour is active
  shows the live list of tours (ready to switch again), never the root menu. Rebuilt
  fresh on every entry/switch rather than left as whatever pushed it, so it can't go
  stale if a tour was added/renamed since it was last shown.
- **`closePanoTour`'s exit-to-root reset is UNCHANGED** — only actually leaving the tour
  (not switching within/between tours) drops the drawer back to the plot map's default
  menu, per the explicit earlier request that this behaviour stay that way.
- Room-to-room switching (`tourGoTo`) still never touches `menuNavStack` at all, so it
  was already consistent with "stay inside the tour" before this fix and needed no change.
- **Verified:** `node --check` clean. 6 assertions against the actual extracted
  `openClientPanoTour`/`closePanoTour`/`virtualTourPickerNode` — a fresh entry anchors the
  menu to the tour section (listing every tour, confirming quick-switch is actually
  possible from there, not just theoretically), switching from tour "Room" to "Tour 2"
  keeps that same anchor rather than resetting, and exiting still drops all the way to a
  genuinely empty root stack.

---

## 2026-09-09 (tour bar stayed visible after exiting a tour — the classic `[hidden]`-vs-`display` specificity trap, again)

`styles.css`. Reported via screenshot right after the previous fix: LANDMARKS correctly
exited the tour and showed the real aerial pano with landmark banners — but the room-strip
bar ("ROOM · 4._Living_Room · ... · ✕ Exit tour") stayed sitting on screen underneath it.

- **Root cause**: `.tour-bar { display: flex; ... }` sets its own `display` unconditionally
  and has no `[hidden]` counterpart, so at equal CSS specificity the author rule (always
  later in the cascade than the browser's own `[hidden]{display:none}`) wins regardless of
  the `hidden` DOM attribute — `els.tourBar.hidden = true` (set correctly by
  `closePanoTour`, confirmed by reading the code) had **zero visual effect**. This is the
  exact same class of bug this file has hit twice before (the install banner, an admin
  modal) — `CLAUDE.md` already documents it as a recurring trap, and this makes three.
- **Fix**: added `.tour-bar[hidden] { display: none; }`. Checked whether the tour's other
  toggled element (`#tourLayer`, the hotspot overlay) has the same issue — it doesn't; it
  carries no `display` override of its own, so the native `[hidden]` behavior already
  applies there untouched.
- **Verified visually**, not just reasoned about: an isolated page with two `.tour-bar`
  elements (one plain, one `hidden`) screenshotted in headless Chrome — before this fix
  both would render; after, only the non-hidden one does. CSS brace count balanced
  (773/773), confirmed present in the live server's served `styles.css`.

---

## 2026-09-09 (AERIAL VIEW / LANDMARKS now exit an active virtual tour first, instead of acting on the room's own pano)

`app.js`. Reported: clicking AERIAL VIEW or LANDMARKS while inside a virtual tour should
return to the real default view / landmark picker, not do something to the tour room
itself; room-to-room switching within a tour should be unaffected. Confirmed the exact
mechanism with the user before building (see the "let's first analyze" exchange).

- **Root cause, for both:** neither `openNodeContent` branch knew a tour could be open.
  **AERIAL VIEW** computed a camera angle from the plot layout's own geometry and
  animated the camera there — but the PANO TEXTURE was still whatever tour room was
  loaded, so the move just re-aimed within the room's own 360° image at a meaningless
  angle; the real aerial pano was never touched. **LANDMARKS** called
  `openLandmarksCategoryPicker()` → `applyCategoryFilter('ALL')` →
  `applyLandmarkVisibility()`, which unconditionally does `els.landmarks.hidden =
  !state.showLandmarks` — force-UN-hiding the landmark banners/pins that the tour
  takeover had explicitly hidden, rendering them on top of the room's pano — plus aiming
  the camera at a landmark cluster computed against plot-map geometry, again while the
  wrong pano was showing.
- **Fix:** both branches now check `if (state.tourView) closePanoTour();` first —
  synchronously exits the tour (restores the real pano/plots/ground/landmarks-per-their-
  own-rules) — before doing their normal action, so "face north" and "open the landmark
  picker" both run against the actual, restored plot map. When no tour is open, this is a
  pure no-op (the `if` simply doesn't fire) — verified NOT to change existing behaviour
  for the already-correct non-touring case.
- **Room-to-room switching needed no change** — `tourGoTo` (used by the tour bar's room
  chips and hotspots) never touched the drawer or `state.tourView` in a way that could
  exit the tour, so staying "inside the tour" while moving between rooms was already
  correct; confirmed by inspection, not just assumed.
- **Verified:** `node --check` clean. 10 assertions against the actual extracted
  `openNodeContent` — with no tour open, `closePanoTour` is never called and both actions
  behave exactly as before; with a tour open, `closePanoTour` fires and is confirmed to
  run BEFORE the camera move / picker open (not after, which would still show the wrong
  pano for one frame), and `state.tourView` is confirmed actually cleared in both cases.

---

## 2026-09-09 (re-applied the d-pad/tour-bar overlap fix + tour-transition curtain — reverted between turns)

`app.js`, `styles.css`. The previous entry's three fixes (d-pad/tour-bar overlap,
exit-resets-menu, tour-switch loading curtain) were reported still broken via a
screenshot identical to the one that triggered them. Checked the live server directly
(`curl .../styles.css`, `curl .../app.js`) before assuming anything about the browser:
`body.tour-open .dpad`, `showBootCurtain`, and `switchingTours` were **entirely absent**
from both the served files AND the on-disk source — the whole previous turn's app.js and
styles.css changes had reverted, while the turn before that (the Tour tab grid fixes) was
still intact. This matches this file's own documented "verified work can disappear from
disk between turns for reasons outside normal editing" gotcha exactly — re-applied
without further forensics, per that entry's own advice, and added a note at the fix's
own location flagging that this specific one has already vanished once, so a next
occurrence isn't mistaken for a fresh regression.

- Re-applied verbatim: `body.tour-open .dpad { bottom: 78px; }` (+ its landscape-media
  counterpart, `body.tour-open:not(.is-admin) .dpad { bottom: 56px; }`, placed after the
  existing landscape block so it wins on the specificity tie), `showBootCurtain()`, and
  the `switchingTours`/`menuNavStack` reset logic in `openClientPanoTour`/`closePanoTour`.
- **Verified twice this time**: 10 assertions against the actual extracted functions (same
  suite as before — recreated after discovering the scratchpad copy of the test script had
  *also* disappeared, a session-local casualty of the same event, not a project file), AND
  a direct `curl` of the LIVE server's served `styles.css`/`app.js` confirming the fix is
  actually reaching a browser this time, not just present in the editor's view of the
  source. `node --check` clean, no duplicate `id=` in `index.html`.

---

## 2026-09-09 (admin Tour tab: fixed the orphaned delete "×" and truncated target dropdowns; clarified the two viewer-exit buttons)

`app.js`, `styles.css`. From a screenshot of the admin Tour tab. Two real layout bugs and
one clarity request.

- **Every node row's delete `×` was rendering on its own line below the row, instead of
  inline at the end** — root cause: `.ax-tour-node` declared a 3-column CSS grid
  (`grid-template-columns: auto 1fr auto`) but the row actually appends FOUR children
  (star, ▶ open, name, ×); the 4th had no column to land in and CSS grid's default
  auto-placement dropped it onto an implicit new row. Fixed: `auto auto 1fr auto`.
- **The hotspot target `<select>` showed truncated text** ("3._Washroom" as "3._Was") in
  both the existing-hotspot row and the "add a hotspot" row — both squeezed a label
  input, an arrow, a select, and (for the first) a delete button onto one `display:flex`
  line in a ~240px-wide sidebar, and the select lost the fight for room. Reflowed
  `.ax-tour-hsrow` into a 2-row grid (label + delete on top, arrow + full-width select
  underneath) and `.ax-tour-hsadd` into a stacked column (select above the button) — the
  same "give it its own line instead of forcing it to share" fix already used earlier
  today for the Align/Landmarks/Amenities/Tour tab strip.
- **The two viewer-exit buttons ("set start view" / "close viewer") were visually
  identical** (same class, same ghost outline) with nothing to tell them apart at a
  glance, and the close button's `✕` icon is the SAME glyph `.ax-lm-del`/the hotspot
  delete buttons use for actual deletion just above it in the same panel — a benign
  navigation action wearing a destructive-looking icon. Now: "🏠 Set as this room's start
  view" is a gold `btn-primary` (this app's confirm/save colour), "← Back to the plot map"
  is a plain ghost button with a left-arrow instead of `✕` and its own tooltip ("Leaves
  this room and returns to the plot map — the tour itself is unaffected") — the previous
  version had no tooltip on this one at all.
- **Verified visually**, not just reasoned about: reproduced the exact real markup/CSS in
  an isolated page and screenshotted it in headless Chrome (the same technique used for
  the compass restyle and the earlier tab-strip fix today) — confirmed every delete `×`
  now sits inline, both dropdowns show full node names, and the two exit buttons read as
  clearly different actions. `node --check` clean, CSS brace count balanced (767/767).

---

## 2026-09-09 (VIRTUAL TOUR becomes a third built-in menu row, matching LANDMARKS exactly)

`app.js`, `styles.css`. Request: "same as landmarks, things that are added in the tour
section should automatically come as virtual tour in the menu and set this also as a
built in and everything like toggle info that other builtin have i.e aerial view and
landmarks should be in virtual tour as well." Fully parallels the LANDMARKS builtin —
same movable/draggable node design (2026-09-09, earlier today), same ON/OFF switch, same
▾ info arrow, same live-data-in-the-expansion pattern, same click-to-jump +
double-click-to-rename on each item inside it.

- **`BUILTIN_DEFS`** (new, `{ aerial, landmarks, tour }` → `{contentType, title}`) replaces
  the two hardcoded strings `ensureBuiltinNodes()` used to loop over — the `tour` builtin's
  own content type is **`'virtualtour'`**, deliberately NOT `'tour'`, since that name is
  already taken by the EXTERNAL 3DVista/Kuula iframe content type; conflating them would
  have broken `openNodeContent`'s existing dispatch for one or the other.
- **Client behaviour (`openNodeContent`'s new `'virtualtour'` branch)** — the exact
  analogue of LANDMARKS' "show whatever exists" pattern, but for `state.tours`: zero tours
  → a plain notice pointing at the admin Tour tab; exactly one → opens it directly (no
  point picking from a list of one, same reasoning `openClientPanoTour`'s own
  single-tour-forgiving fallback already uses); two or more → **`openVirtualTourPicker()`**
  (new), which pushes a SYNTHETIC parent node (children generated live from `state.tours`,
  one row per tour) onto `state.menuNavStack` and reuses the EXISTING generic Level-2/3
  drilled-in submenu UI — the same one an authored folder with 2+ children already uses.
  Since these synthetic children were never authored into `menuConfig.tree`,
  `renderClientSidebar`'s submenu click handler gained a fallback: try `findNodeInfo`
  first (real tree), and if that comes back empty, look the id up in the pushed parent's
  own `children` array instead — this is what lets a fully generic navigation level serve
  both real folders and this one synthetic case with no special-casing at the render layer.
- **Admin menu builder**: `renderBuiltinNodeRow` generalised from two builtins to three
  (`BUILTIN_ICON`/`BUILTIN_INFO` maps, keyed by `node.builtin`) — the 🌐 icon and its own
  info text. **`renderBuiltinTourList()`** (new) is `renderBuiltinLandmarkCategories()`'s
  counterpart: a flat list (tours aren't grouped, unlike landmarks-by-category) of every
  tour with its node count, in the ▾ expansion. **Uses its own CSS classes
  (`.builtin-tour-row`/`.builtin-tour-title`), not the landmark ones** — sharing
  `.builtin-lm-row`/`.builtin-lm-title` would have also caught these rows in the
  LANDMARKS wiring block (a blanket `querySelectorAll('.builtin-lm-row')`), sending a
  tour-row click to the Landmarks tab with an undefined landmark id instead of the Tour
  tab with the right tour selected — wired identically otherwise (click → `setAdminTab
  ('tour')` + `selectTour(id)`; double-click the name → rename via `tour.name` +
  `onToursChanged()`).
- **`computeAutoOpenTarget`**: a builtin `virtualtour` row on top shares the exact same
  fire-timing lane as an authored `panotour` item (`kind: 'panotour'`), since both need
  `state.tours` populated before they can act — no new boot-sequencing needed, the
  existing "fire right after `setTours()`" call site already covers it.
- **`anandman` data cleanup**: the project already had an empty, manually-authored
  "VIRTUAL TOUR" folder anticipating this feature — removed, since the new builtin now
  covers that exact role automatically and the two would otherwise sit side by side as a
  confusing duplicate. `anandman` genuinely has 3 real tours in its `tour.json` (t2: 4
  nodes, t6: 1 node, t8: 4 nodes), so this is a real multi-tour picker test case once
  loaded, not just a synthetic one.
- **Verified** via the same real-function-extraction method used throughout this
  project: 11 assertions against the actual extracted `ensureBuiltinNodes`/
  `BUILTIN_DEFS`/`computeAutoOpenTarget` plus a faithful reimplementation of the
  `openNodeContent`/`openVirtualTourPicker` dispatch — three builtins inject in the
  right order with the right content types, the tour builtin's `contentType` is
  confirmed `'virtualtour'` (not colliding with the external `'tour'` type), zero/one/2+
  tours each produce the right behaviour, a synthetic picker child is confirmed NOT
  findable via `findNodeInfo` (proving the fallback path is actually exercised, not
  accidentally bypassed), activating it opens the right specific tour, the tour builtin
  correctly shares the `panotour` timing lane when it's on top, a fully-disabled set of
  builtins falls through to null, and repeated `getMenuTree()` calls never duplicate the
  tour builtin. `node --check` clean, CSS brace count balanced (765/765), no duplicate
  `id=` in `index.html`.
  ⚠️ Not yet confirmed with a real click-through — dragging the row, watching the switch/
  arrow/expansion render inline, and the actual picker submenu appearing in the drawer are
  all owed a real browser check; this project's headless tooling can't reliably exercise
  either admin drag-and-drop or the client drawer's navigation stack live.

---

## 2026-09-09 (admin Align/Landmarks/Amenities/Tour tab row: fixed the clipped "Tour" label)

`styles.css`. From a screenshot of the admin sidebar header. Root-caused by reproducing
the exact markup+CSS in an isolated page and screenshotting it directly (this project's
live-app headless boot is unreliable, but a static CSS reproduction with no app logic
behind it isn't — same technique used for the compass restyle earlier today): `.ax-tabs`
was `display:flex` with all four tab buttons at `flex:1`, splitting the sidebar's ~240px
usable width four ways (~55px each). "Landmarks"/"Amenities"/"Tour" don't fit in that,
and the rightmost one — "Tour" — was being clipped at the sidebar's edge, rendering as
"Tou" with the last letter cut off entirely. Confirmed with a before/after screenshot of
the isolated reproduction: before shows the clipped "Tou"; after shows all four labels
intact.

- **`.ax-tabs`**: `display:flex` → `display:grid; grid-template-columns: 1fr 1fr` — a 2x2
  grid instead of a 4-across row. Each tab now gets roughly double the horizontal room,
  comfortably fitting every current label on one line, and the layout now echoes the
  Look-around/Move-layout toggle immediately below it (`.ax-mode`, already the same
  `1fr 1fr` grid) instead of mixing two different row patterns in the same panel.
- **`.ax-tab-btn`**: dropped the now-irrelevant `flex: 1` (grid columns handle sizing),
  added `white-space: nowrap` (belt-and-braces against any future longer tab name
  wrapping instead of just getting tight) and an explicit `text-align: center`.
- **Verified**: CSS brace count balanced (765/765), and — since this project's headless
  tooling can't reliably boot the live admin page (see CLAUDE.md's gotchas) — an isolated
  static reproduction of the exact markup/CSS was screenshotted in headless Chrome both
  before and after the fix, showing the clipped "Tour" label and its correction directly,
  not just reasoned about from the CSS.

---

## 2026-09-09 (AERIAL VIEW now faces north — the compass points straight up, not wherever the layout's centroid sits)

`app.js`, `index.html`. Request: "when clicked aerial view the camera should pan to
north, that is compass should pan to north." Previously the AERIAL VIEW action called
`computeHome()` and used its `lon` directly — which is the mean direction of the site
layout's own geometry (a "look at the middle of the plots from above" framing), something
that has no relationship to true north at all; the compass would land wherever that
centroid happened to sit.

- **`northFacingLon()`** (new, right next to `updateCompass()`): the exact algebraic
  inverse of `updateCompass()`'s own heading formula (`rot = -view.lon*180/PI - northDeg`;
  `rot` is 0 — cone at 12 o'clock, i.e. pointing north — when `view.lon = -northDeg` in
  radians). An uncalibrated project (`northDeg` unset, the compass's documented default)
  resolves this to lon 0.
- **AERIAL VIEW's handler** (`openNodeContent`'s `'aerial'` branch — the one live code
  path, used by both a real click and the auto-open-as-default-screen case) still calls
  `computeHome()` for its pitch/FOV (nadir, max zoom out — unchanged, still a sensible
  "full site overview" framing) but now flies to `northFacingLon()` instead of
  `state.home.lon` for the direction. The ⊡ recenter icon and the admin reset button,
  which also use `computeHome()`, were deliberately left untouched — the request was
  specifically about the AERIAL VIEW menu action, and changing an established, separate
  control wasn't asked for.
- **Removed now-genuinely-dead code found while touching this area**: a one-time
  `wireViewControls` block wired `.cat-btn` clicks on `#catNavL1`/`#catNav`'s ORIGINAL
  static placeholder markup, at boot, before `renderClientSidebar()`/
  `renderLandmarkCategoryNav()` ever replace that markup's `innerHTML` — so those
  listeners were attached to DOM nodes thrown away before a visitor could ever click them,
  and the block's own copy of the aerial handler was a second, now-stale place the
  centroid-vs-north bug could have been "fixed" without anyone noticing the live code path
  was untouched. `#catBackBtn`'s wiring (a stable element, never replaced) was kept.
  `index.html`'s static placeholder buttons inside `#catNavL1`/`#catNav` (referencing
  content-type names and category names that no longer even match the current builtin-
  node/live-category-data design) were emptied out to match — both navs are populated
  entirely by their respective render functions.
- **Verified:** `node --check` clean, no duplicate `id=` in `index.html` (258, unchanged
  count — only inner button markup was removed, no ids). 7 assertions against the actual
  extracted `updateCompass`/`northFacingLon` — facing north always reads as rot≈0 on the
  compass across the default and five different calibrated `northDeg` values, and a
  genuinely off-north view is correctly NOT read as zero — confirming the two formulas
  are true inverses of each other, not just "close."
  ⚠️ Not yet confirmed with a live click in a real browser — this project's headless
  tooling can't reliably exercise the animated camera fly-to itself (see CLAUDE.md's
  gotchas on why), so this is verified at the math level, not watched happening on screen.

---

## 2026-09-09 (compass restyled to a classic nautical rose, matching a supplied reference image)

`index.html`, `styles.css`. The user supplied a reference image (a standard nautical
compass rose: white/black split 8-point star, solid red north spike, gray ring, bold navy
N/E/S/W outside it) and asked to use it as the compass. The existing compass already had
the right STRUCTURE (an 8-point rose split light/dark, a separate red north overlay, two
ring circles, N/E/S/W labels) from its 2026-09-07 redesign — this was a palette swap, not
a rebuild, and the fixed-rose/rotating-cone BEHAVIOR (north stays at the top, a shaded
cone sweeps to show heading) is unchanged, since the reference is a static rose image and
says nothing about how a live heading indicator should move.

- `.cp-dk`/`.cp-sm-dk` (the star's dark halves): blue-gray → solid near-black (`#14161a`).
- `.cp-ring`: translucent white → solid gray (`#9aa0a8`), thicker (2px → 5px) to read as
  the reference's donut band. `.cp-ring-2`: a second, thinner light-gray ring.
- `.cp-face`: switched from a radial gradient (`url(#cpFace)`, now-unused `<defs>` removed
  from `index.html`) to a flat translucent white, closer to the reference's plain white
  face while staying an HUD overlay rather than a fully opaque disc.
  `.cp-n` (the north spike) keeps its existing solid red — already correct.
- `.cp-lbl`: white-with-dark-outline → bold navy (`#1b2a6b`) with a white outline instead
  of removing the outline entirely — a flat navy label with no halo would vanish over a
  dark patch of the pano photo, which the reference's plain-white background never has to
  contend with. `.cp-lbl-n`'s separate reddish N styling was removed (the reference shows
  all four letters in the same navy; only the spike is red) — N now shares `.cp-lbl` with
  the others.
- **Verified visually** (not just code-reasoned): built an isolated standalone HTML page
  with the exact compass markup/CSS and screenshotted it in headless Chrome (this project's
  documented live-app headless limitations — async boot timing, WebGL — don't apply to a
  static SVG+CSS page with no app logic behind it) — gray ring, white/black star, red
  north spike, navy labels with a legible halo, and the rotating cone all render as
  intended, closely matching the supplied reference. `node --check` clean, CSS brace count
  balanced (765/765), no duplicate `id=` in `index.html`, no leftover reference to the
  removed gradient/class anywhere in the codebase.

---

## 2026-09-09 (a video default screen now actually autoplays)

`app.js`. Request: "the video should auto play if its on top of the menu as its acting as
a default screen." A video menu item auto-opened by `autoOpenTarget` already went through
`openClientVideoModal` — the exact same function a real click uses, which already calls
`player.play()` / appends YouTube-Vimeo `autoplay=1` — so on paper this should already
have worked. It didn't, for a browser reason specific to firing with no click behind it:
**a real click IS the "user gesture" browser autoplay policies require for unmuted
playback; an automatic boot-time `play()` call has none, so the browser silently rejects
it and the video just sits paused** — invisible in code (the rejection is swallowed by
`.catch(() => {})`) and easy to miss without watching it happen. Autoplay policies exempt
MUTED playback from the gesture requirement, so that's the fix.

- **`autoOpen` threaded through the click path**: `fireAutoOpen` → `activateMenuNode(node,
  {fromRoot, autoOpen: true})` → `openNodeContent(node, info, {autoOpen})` →
  `openClientVideoModal(title, content, {autoOpen})`. A REAL click never sets it (stays
  `false` by default at every level), so manual playback is byte-for-byte unchanged —
  this only ever fires differently for the no-gesture auto-open path.
- **Direct `<video>` (mp4/webm/etc.):** `player.muted = !!autoOpen` set unconditionally
  right before `.play()` — unconditionally because the player element is reused across
  opens, so a later MANUAL open of a different video must not inherit a stale mute left
  over from an earlier auto-opened one. `controls` (already on `#clientVideoPlayer` in
  `index.html`) gives the visitor a one-tap unmute.
- **YouTube/Vimeo:** `getYoutubeEmbedUrl(url, muted)`/`getVimeoEmbedUrl(url, muted)` gained
  a second parameter appending `&mute=1` / `&muted=1` (their respective real param names)
  only when true — the manual-click call sites simply don't pass it, so their output is
  identical to before.
- **Verified:** `node --check` clean; 5 assertions against the actual extracted
  `getYoutubeEmbedUrl`/`getVimeoEmbedUrl` confirming the no-argument and `false` cases
  produce byte-identical output to before the change (manual click unaffected) and the
  `true` case adds exactly the right mute param for each platform.
  ⚠️ Owed a real check: does the target browser actually honor `muted` set via JS on an
  autoplay-attributed `<video>` fired with zero gesture, and do YouTube/Vimeo's players
  accept mute this way from an iframe `src` set with no gesture either — this is standard,
  well-documented autoplay-policy behavior, but "should work per spec" and "confirmed
  working in this exact modal" are different claims, and only the first is established
  here.

---

## 2026-09-09 (AERIAL VIEW / LANDMARKS become ordinary, draggable menu items)

`app.js`, `styles.css`. Request: "even landmark and aerial view should be movable in the
menu section in the admin and whoever is on top of the menu will be default even in
presence of landmark and aerial view." The previous design (`menuConfig.builtins`, two
entries up) deliberately made these two rows fixed-first and non-draggable, to protect
them from being lost — the right call at the time, wrong once "should be movable" became
the actual requirement.

**Redesigned: AERIAL VIEW and LANDMARKS are now ordinary tree nodes**, marked
`builtin: 'aerial'|'landmarks'`, living wherever the admin has dragged them — mixed in
with authored items in the same array, in the same `menuConfig.tree`. This gets every
existing node mechanism for free instead of needing its own: the existing
`dragstart`/`dragover`/`drop` handlers (keyed on `data-node-id`) reorder them exactly like
any authored item; the existing double-click-to-rename (`.tree-title-text[data-node-id]`
→ `updateNode`) renames them; `activateMenuNode`/`openNodeContent` already dispatched on
`contentType === 'aerial'|'landmarks'` from an earlier design and needed no changes at all.
Only two things stay special-cased: an `enabled` flag (the ON/OFF switch — an authored
node has no such concept, but these two have no content to configure, so "off" is a real,
meaningful state) and no delete button.

- **`ensureBuiltinNodes()`/`builtinNodeExists()`** (new, replacing `menuBuiltins()`/
  `setBuiltinEnabled()`/`renameBuiltin()`, all removed): guarantees both builtin nodes
  exist SOMEWHERE in the tree (searched recursively, so one dragged into a folder isn't
  duplicated), injecting a default at the top exactly once if either is missing. Covers a
  brand-new project, migrates an older project's `menuConfig.builtins` values onto the
  newly-injected node (enabled/title carried over, nothing resets), and **self-heals** if
  a builtin is ever lost as a side effect of deleting a folder it had been dragged into —
  rather than guard every deletion path against that, it's simply allowed to happen and
  reappears at the top on the next render. Called from `getMenuTree()`, the existing
  single chokepoint already used everywhere.
- **`cleanNodeForSave`** (the save whitelist) now carries `builtin`/`enabled` through —
  the standing gotcha here (a new field not added to this whitelist is silently dropped on
  every save) applied immediately, since these two fields didn't exist when the whitelist
  was last touched.
- **`renderAdminMenuTree`**: the separate `renderBuiltinMenuRows()` prepend is gone;
  `renderNodeRow` now checks `node.builtin` and delegates to `renderBuiltinNodeRow(node,
  depth)` inline, wherever the node falls in the normal recursive walk — so it renders at
  the right depth/indent whether at root or dragged into a folder, and drags/drops via the
  exact same generic code path with zero node-type-specific handling needed. The row keeps
  its ✓-switch and ▾ info-arrow (unfolding the live landmark category → landmark list for
  LANDMARKS, unchanged from before) instead of the usual overflow (rename/delete) menu —
  rename still works via the ordinary double-click, and there's deliberately no delete
  button. "No menu items created yet" now means no AUTHORED item exists besides the two
  builtins (which always render, never hidden from the admin) rather than an empty tree,
  since the tree is never truly empty any more.
- **`renderClientSidebar`**: the special builtin-prepend + `data-act="aerial"/"landmarks"`
  buttons are gone — the root-level loop just renders every tree node (skipping any with
  `enabled === false`) via the same `data-node-id` buttons as always.
  **`wireClientSidebarButtons`**'s dead `data-act` branches were removed with it —
  `activateMenuNode` already handles everything generically.
- **`computeAutoOpenTarget`** simplified to match: picks `getMenuTree().find(n => n.enabled
  !== false)` — the first item that isn't a switched-off builtin — resolves it once via
  `resolveFolderTarget`, and returns `null` only for the aerial-specific WYSIWYG-preserving
  case (unchanged reasoning: aerial has no content of its own, and firing its camera-reset
  action on every load would fight the admin's saved opening shot). Every other content
  type, including `landmarks` now, fires through the single generic `activateMenuNode`
  path — `fireAutoOpen` no longer special-cases `'landmarks'` separately, since
  `openNodeContent` already calls `openLandmarksCategoryPicker()` for that contentType.
- **Verified** via the same real-function-extraction method used throughout this project:
  14 assertions against the actual extracted `ensureBuiltinNodes`/`builtinNodeExists`/
  `getMenuTree`/`computeAutoOpenTarget`/`fireAutoOpen` — fresh-project injection (aerial
  then landmarks, both enabled), aerial-on-top stays a no-op, an authored item DRAGGED to
  position 0 becomes the target and fires directly (no aerial flash), landmarks dragged
  above aerial becomes the target, a disabled top item is skipped in favour of the next
  one, both builtins disabled falls through to an authored item, repeated `getMenuTree()`
  calls never duplicate an existing builtin, an old project's `menuConfig.builtins`
  enabled/title values migrate onto the newly-injected node, admin mode always decides
  null, and a builtin nested inside a folder is found (not duplicated) by the recursive
  existence check. `node --check` clean, CSS brace count balanced (766/766), no duplicate
  `id=` in `index.html`.
- ⚠️ Not yet confirmed in a live browser — dragging a builtin row by its handle, watching
  the switch/rename/expand-arrow render and behave correctly inline (rather than at the
  old fixed top position), and the real timing behaviour end-to-end are all owed a real
  click-through; this project's headless tooling can't reliably exercise admin drag-and-
  drop or boot timing (see CLAUDE.md's gotchas).

---

## 2026-09-09 (boot curtain: the default-screen switch is never visible happening any more)

`index.html`, `styles.css`, `app.js`. The previous fix (retiming `autoOpenTopMenuItem`'s
three fire points — below) turned out not to be enough: reported again, same symptom,
same wording. Root cause: retiming made each target fire as early as ITS data allowed, but
the pano itself starts rendering the instant its texture decodes — well before any of the
three fire points, even the earliest one. So there was always a window, however short,
where the pano was visibly showing its untouched boot state before the switch happened.
Retiming could shrink that window; it couldn't close it, because the pano and the decision
were on two different clocks.

**The actual fix: don't let the pano be visible until the decision has already been
applied.** A solid full-viewport `#bootCurtain` (new, `index.html`/`styles.css`, `z-index:
999999` — above modals too, so an auto-opened video/PDF doesn't flash into view early
either) covers everything from first paint. `hideBootCurtain()` (app.js, idempotent) is
called at exactly the point each target's fire call already happens:

- No target (aerial on top) or a `'node'` target (already fired pre-pano): revealed right
  after `initThree()` — the earliest point there's anything correct to show.
- A `'landmarks'` target: revealed in the same `if` block as its `fireAutoOpen` call,
  right after `setLandmarks()`.
- A `'panotour'` target: revealed alongside its `fireAutoOpen` call, right after
  `setTours()`.
- An unconditional safety-net call at the very end of the success path, and one in the
  `catch` block — both idempotent — so a gap in the kind-matching logic, or a boot error,
  can never leave a visitor staring at a black screen forever.

The retiming from the previous entry is still there and still correct (each target
firing at its own earliest-possible point rather than waiting for everything) — the
curtain is what turns "as early as possible" into "the visitor never sees anything else,"
which is what "make sure it directly switched" actually required.

- **Verified:** `node --check app.js` clean, CSS brace count balanced (766/766), no
  duplicate `id=` in `index.html`, and the live server confirmed serving `#bootCurtain`'s
  markup and all 5 `hideBootCurtain()` call sites (+ its definition = 6 occurrences) in
  the delivered `app.js`. ⚠️ Still owed: an actual timed browser load to see the curtain
  behavior with a real eye — this project's headless tooling can't reliably exercise
  boot timing (see CLAUDE.md's gotchas), so the fix is verified as logically sound and
  correctly ordered, not yet watched.

---

## 2026-09-09 (default-screen switch now fires as early as its own data allows, not after everything loads)

`app.js`. Reported: "still the aerial view comes for few seconds as a default screen then
it switches to whats so ever is on top of the menu" — the previous implementation
(`autoOpenTopMenuItem`, below) fired exactly once, at the very end of boot, after data,
landmarks, amenities, tours, AND the project-bar probe had all finished loading in
sequence. The pano was already rendering in its normal boot state the whole time (the
render loop starts as soon as the pano texture decodes, long before that point), so the
visitor saw the default view first and only then watched it jump — a real, visible delay,
not the "direct switch" the feature was supposed to be.

- **Split the single function into a decide step and a fire step.**
  `computeAutoOpenTarget()` runs immediately after `renderClientSidebar()` — as soon as
  the menu tree and built-in config are known, well BEFORE the pano even starts loading —
  and returns `null` (aerial-on-top, unchanged reasoning) or `{kind, node?}` where kind is
  `'landmarks'`, `'panotour'`, or plain `'node'`. Resolving whether the top item is a
  `panotour` reuses `resolveFolderTarget` (the same folder-skipping logic a real click
  goes through), so a folder wrapping a single panotour child is still detected correctly.
  `fireAutoOpen(target)` is the actual action — unchanged from before
  (`openLandmarksCategoryPicker()` / `activateMenuNode(node, {fromRoot:true})`).
- **Three fire call sites, each as early as its target's data allows** — replacing the one
  end-of-boot call:
  1. Right after `renderClientSidebar()` — a plain content item (video/pdf/gallery/
     contact/link/external tour) or a folder drill fires HERE, before the pano has even
     started loading, since none of that needs landmarks/tours/amenities/anything.
  2. Right after `setLandmarks(lms)` — a `landmarks` target fires here: the earliest point
     `state.landmarks` actually has data for the "ALL" framing to aim at (and the earliest
     point `three`/the camera exist at all, both prerequisites for `applyCategoryFilter`'s
     camera move).
  3. Right after `setTours(trs)` — a `panotour` target fires here, the earliest point
     `state.tours` (which `openClientPanoTour` reads directly) is populated.
  All three skip waiting for amenities, the project-bar `/api/projects` probe, and offline
  registration, none of which any auto-open target actually needs.
- **Verified** via the same real-function-extraction method: 9 assertions against the
  actual extracted `resolveFolderTarget`/`computeAutoOpenTarget`/`fireAutoOpen` — aerial-
  on-top still decides `null`, a landmarks target is decided before any landmark data
  exists (proving the decide/fire split), a plain video node fires immediately with
  `fromRoot:true`, a `panotour` node (direct AND behind a single-child folder skip) is
  detected as needing tours without touching `state.tours`, a real multi-child folder
  decides a plain `'node'` drill rather than treating it as data-dependent, and admin mode
  always decides `null`. `node --check` clean.
  ⚠️ The actual TIMING improvement (how much sooner the switch now appears) still needs a
  real browser load-and-watch to confirm — this fix is verified logically correct
  (the right thing fires at the right, earlier point) but the visible "few seconds" the
  user described was measured by eye, not by an instrumented clock, so the exact
  before/after delta is not independently confirmed here.

---

## 2026-09-09 (the client's default screen is whatever menu item is on top)

`app.js`. Request: "whatsoever menu is on top of the menu will be set as the default screen
for the client" — confirmed via a follow-up question that this means the top item should
**auto-open on load**, not just render pre-highlighted.

- **`autoOpenTopMenuItem()`** (new, called once at the very end of boot's success path,
  right after `registerOfflineSupport()`, gated `!state.admin`): finds whatever renders as
  the literal first row of the client menu — a built-in row if enabled, else the first
  authored item — and fires the exact same action a real tap on it would
  (`openLandmarksCategoryPicker()` for LANDMARKS, `activateMenuNode(top, {fromRoot:true})`
  for an authored item, which itself dispatches to `openNodeContent` and handles a folder,
  a gallery-of-images, a contact card, or empty-folder identically to a click — see
  `resolveFolderTarget`). Reruns on every fresh load, since a "default screen" is what
  greets the visitor before any interaction, not a one-time flag.
  **AERIAL VIEW is the one deliberate exception:** it has no content of its own to open —
  clicking it resets the camera to a computed full-site overview, which is a DIFFERENT
  view from the admin's saved WYSIWYG opening shot. Since AERIAL VIEW is enabled by
  default on every project, auto-firing that reset on every load would have silently
  broken the "client reproduces the saved view" contract for every existing project the
  moment this shipped. When AERIAL VIEW is on top, `autoOpenTopMenuItem()` does nothing —
  the boot view already **is** the correct default screen in that case. In practice this
  means the feature is dormant for most projects today (aerial ships enabled and first)
  and only activates once an admin turns AERIAL VIEW off or otherwise changes what's on
  top — which is exactly the condition the request describes.
- **Verified** via the same real-function-extraction method used throughout this project:
  5 assertions against the actual extracted `autoOpenTopMenuItem` — aerial-on-top is a
  no-op (preserves WYSIWYG), aerial-off/landmarks-on opens the category picker,
  both-off activates the first authored node with `fromRoot:true`, an empty tree no-ops
  without throwing, and admin mode is always a no-op regardless of config. `node --check`
  clean. ⚠️ Not yet confirmed in a live browser — the WYSIWYG-preservation reasoning and
  the click-parity (reusing `activateMenuNode`/`openLandmarksCategoryPicker` rather than
  new logic) are the safety net, but a real load-and-watch check is still owed, especially
  for how a video/PDF/tour item behaves when it auto-opens the instant the page loads
  (autoplay policies may still block sound/playback even though the modal itself opens).

---

## 2026-09-09 (removed the Landmarks tab's intro/legend text and bulk Show-all/Hide-all controls)

`index.html`, `styles.css`. Follow-up to the switch change above, from a screenshot of the
Landmarks tab: the intro paragraph, the ✓/✕/× legend box (which now described a control
that no longer exists — it explained the old button PAIR, not the switch it was just
replaced with), and the `#axLmCount`/`✓ Show all`/`✕ Hide all` bulk row were all removed
per explicit confirmation of the full scope ("remove everything in the screenshot").

- `index.html`: `#axTabLandmarks` now goes straight from the tab header to
  **＋ Add landmark** and the list — no `.ax-lm-intro` paragraph, no `.ax-lm-legend` box,
  no `.ax-lm-bulk` row.
- No `app.js` changes needed — every reference to the removed elements (`els.axLmCount`,
  `els.axLmShowAll`, `els.axLmHideAll`) was already null-safe (`?.` / an `if` guard in
  `refreshLmList`), so `setAllLandmarksFeatured` simply becomes unreachable from the UI
  rather than erroring; the per-row switch (previous entry) is now the only way to change
  a landmark's default-visibility from the admin.
- `styles.css`: removed the now-fully-orphaned `.ax-lm-bulk`, `.ax-lm-count`, `.ax-lm-legend`
  (+ its `.ax-lm-key*` sub-selectors) rules. Kept `.ax-lm-li.is-hidden-default` — the dashed
  outline on a not-shown-by-default landmark's row — since that's unrelated per-row styling,
  not part of what was asked to go, and `.ax-lm-intro` itself (still used by the Amenities
  and Tour tabs' own intro paragraphs).
- **Verified:** `node --check app.js` clean, CSS brace count balanced (763/763), no
  duplicate `id=` in `index.html` (258 total, same structural integrity check as every
  merge/edit this session).

---

## 2026-09-09 (per-landmark show-by-default control switched from a ✓/✕ pair to an ON/OFF switch)

`app.js`, `styles.css`. Follow-up request, from a screenshot of the admin Landmarks tab
list: "add toggle button here also but keep that x for removing the landmark" — i.e. match
the ON/OFF switch just built for the admin menu builder's built-in rows, replacing the ✓/✕
button pair, while leaving the separate × delete button untouched.

- **Generalised the switch CSS** — renamed `.builtin-switch*` to `.ui-switch*` (kept
  `.builtin-switch-input` as a second class on the same element so the menu builder's
  existing wiring selector needed no change) so the same control now serves both the menu
  builder's built-in rows and this per-landmark toggle without duplicating the styling.
- **`refreshLmList()`**: the `grp`/`mkVis` two-button block is gone, replaced by one
  `<label class="ui-switch ax-lm-vis-switch">` bound to `lm.featured` via the existing
  `setLandmarkFeatured(lm, on)` (unchanged — still idempotent, still fires
  `refreshLmList`/`renderLandmarks`/`onLandmarksChanged`). The delete `×` button is
  untouched, same position, same `deleteLandmark(lm.id)` call.
  **Why this doesn't reopen the 2026-09-04 bug the ✓/✕ pair was built to fix:** that bug
  was a single button whose only signal was "pressed = active," so clicking down a list of
  already-active items looked identical to clicking a list of items you wanted to activate
  — the same gesture, opposite of what happened. A real switch has an unambiguous ON/OFF
  position (thumb side + colour) that reads correctly regardless of prior state, which is
  the same property that made the ✓/✕ pair safe — just expressed as one control instead of
  two. This mirrors the reasoning already used for the menu builder's switch two entries up.
- Removed the now-dead `.ax-lm-vis-grp`/`.ax-lm-vis`/`.ax-lm-vis-yes`/`.ax-lm-vis-no` CSS
  (nothing in the DOM uses them any more).
- **Verified:** `node --check app.js` clean, CSS brace count balanced (770/770),
  `setLandmarkFeatured`'s own idempotency guard is untouched and — since a real checkbox's
  `change` event only fires on an actual state flip — cannot even be called with a
  no-op value from this control the way a repeated button click could.
  ⚠️ Same caveat as the built-in-row switch: the visual on/off rendering itself is
  code-reasoned, not confirmed in a live browser click-through yet.

---

## 2026-09-09 (AERIAL VIEW / LANDMARKS become built-in, togglable admin menu rows; the landmark category picker becomes live data)

`app.js`, `styles.css`. The Virtual Tours merge (below) had exposed that AERIAL VIEW and
LANDMARKS aren't hardcoded client rows any more — a project's admin has to author them as
menu items, or they're simply absent (this is exactly what happened to `anandman`, reported
as "the aerial view and the landmark menu is been removed"). The immediate fix was a
one-off hand-edit of that project's `alignment.json`; this is the real feature: the boss's
follow-up request was to make both rows **built-in** to the admin's menu builder (present
by default, toggle-off rather than delete) and to make the LANDMARKS row's contents track
the actual Landmarks tab data instead of anything authored.

**A discovery that shaped the design:** the client's landmark category picker (`#catNav`,
the HEALTHCARE/EDUCATION/COMMERCIAL/CONNECTIVITY/LIFESTYLE/TEMPLE buttons) turned out to be
static markup in `index.html`, identical across every project, wired ONCE at boot
(`wireViewControls`) and never rebuilt. A landmark whose category wasn't one of those six
names had no button to reach it at all, in every project, silently. Fixing the admin side
properly meant fixing this first, since both now read from the same source.

- **`menuConfig.builtins`** (new, in `alignment.json`, read via `menuBuiltins()`): a config
  block SEPARATE from the authored `tree`, `{ aerial: {enabled, title}, landmarks: {enabled,
  title} }`. Missing on any project ⇒ both default to `enabled:true` with their original
  titles, so nothing changes for a project that never touches this. Deliberately not just
  two more tree nodes — the whole point is they can't be dragged, deleted, or reparented,
  only toggled and renamed. `setBuiltinEnabled`/`renameBuiltin` are the two mutators, both
  idempotent (no-op if the value wouldn't change, same discipline as `setLandmarkFeatured`).
- **`effectiveLandmarkCategory(lm)` / `getLandmarkCategories()`** (new): the single place
  that now decides what category a landmark belongs to — an explicit `category` field if
  set, otherwise the same icon/keyword inference `isLandmarkMatchCategory` already used
  (re-run against each known category name rather than re-deriving the rules), falling back
  to `UNCATEGORIZED` rather than silently dropping a landmark nobody's filed yet.
  `getLandmarkCategories()` groups `state.landmarks` by it, first-seen order. Both the
  client's `#catNav` and the admin's built-in LANDMARKS row read from this one function, so
  they cannot drift apart the way the old static markup already had.
- **`renderLandmarkCategoryNav()`** (new) rebuilds `#catNav` from `getLandmarkCategories()`
  — called from `setLandmarks()` (boot, file/session load) and `onLandmarksChanged()` (any
  admin edit), so the picker a client sees always matches what's actually on the Landmarks
  tab, for every project, not just the ones with the six original category names.
- **`renameLandmarkCategory(oldName, newName)`** (new): renames a category everywhere at
  once — every landmark currently filed under `oldName` (explicit OR inferred) gets an
  EXPLICIT `category = newName`. Confirmed with the user before building: this is a real
  bulk data change, not a cosmetic label swap, and it's what makes a rename "stick" even
  for a landmark that only ever had an inferred category before.
- **Admin menu builder** (`renderAdminMenuTree`) now renders AERIAL VIEW and LANDMARKS as
  the first two rows, always, via `renderBuiltinMenuRows()`: each has a ✓-styled ON/OFF
  switch (green = shown to the client, matching the request that a "crossed" item simply
  stops appearing — chosen as a real switch rather than the ✓/✕ button PAIR used for
  landmark `featured`, at the user's explicit preference for this control) and a ▾ arrow
  that expands a plain-language note on what the row does. The title of each row is
  double-click-to-rename, exactly like an authored menu item's title.
  **LANDMARKS' expansion additionally lists the live category → landmark tree**
  (`renderBuiltinLandmarkCategories()`): each category name is double-click-to-rename
  (→ `renameLandmarkCategory`, confirmed to bulk-update), and each landmark under it is
  both clickable (jumps to it on the Landmarks tab, where the full editor already lives)
  and double-click-to-rename (writes `lm.label` directly, same as the Landmarks tab's own
  edit panel). The landmark name's `click` handler stops its own propagation so a
  double-click doesn't fire the "jump to tab" action on its first click.
- One pre-existing drag-and-drop guard needed a one-line fix: `dragover` on a `.tree-node-row`
  now bails out early when the row has no `data-node-id` (a built-in row), so hovering a
  dragged authored item over AERIAL VIEW/LANDMARKS no longer shows a misleading drop
  highlight (the actual drop already safely no-opped via the existing `!targetId` guard —
  this only fixes the cosmetic false affordance).
- **Verified via the same real-function-extraction method used throughout this project**
  (headless browser automation can't reliably exercise admin UI here — see CLAUDE.md
  gotchas): 19 assertions running the actual `effectiveLandmarkCategory`,
  `getLandmarkCategories`, `renameLandmarkCategory`, `menuBuiltins`, `setBuiltinEnabled`,
  and `renameBuiltin` (brace-matched out of `app.js`, not retyped) against constructed
  state — explicit-category grouping, icon-inferred grouping, uncategorized fallback,
  bulk rename across both explicit and inferred landmarks, no-op safety on an
  empty/unchanged/missing category, builtins' defaults, and idempotency of both setters —
  all passed. `node --check app.js` clean; CSS brace count balanced (776/776); no
  duplicate `id=` introduced (the new UI is all class/data-attribute driven, no new ids).
  ⚠️ The interactive parts specifically — the switch's visual on/off state, the ▾ expand
  animation, and double-click-rename swapping the span for an input — are code-reasoned
  and unit-tested at the logic layer only; a real browser click-through is still owed,
  same caveat as every other admin-UI change this project's gotchas describe.

---

## 2026-09-09 (merged the "Virtual Tours" branch commit dd197ed into this session's work)

The Tour feature (previous entries below) landed on `origin/feature/plot-map-admin-updates`
via a separate push while this session had its own uncommitted changes (settle-and-hold
camera, compass/d-pad, SVG footer icons, audio-extension caching) sitting in the same 7
files. Merged via `git stash push -u` → `git merge --ff-only` → `git stash pop` rather than
a merge commit, since the local branch had no commits of its own yet — only working-tree
edits.

- **Auto-merged cleanly** (no conflict, textually): `app.js`, `index.html`, `server.py`,
  `styles.css`, `CLAUDE.md`.
- **Manually resolved:**
  - `sw.js` — both sides bumped `VERSION` (boss's `v2` for the network-first project-config
    change, this session's `v5` for widening `isRangedMediaPath` to cover audio
    extensions). Kept `v5` (higher, so both cache-invalidation reasons are covered by one
    bump) and folded both change notes into one comment.
  - `CHANGELOG.md` — both sides prepended entries at the top; reordered so the boss's
    2026-09-08 tour entries sit above this session's 2026-09-07 entries, preserving strict
    newest-first order.
- **Verified, not just trusted to text-merge cleanly:** `node --check app.js` / `sw.js`,
  `ast.parse` on `server.py`, brace-balance count on `styles.css` (752/752), no duplicate
  `id=` attributes in `index.html`, every `$('id')` lookup in `app.js` resolves against
  `index.html` (the handful that don't — `axSave`, `nodeChildFields`, `panoHint`, etc. —
  were confirmed pre-existing via `git show` against this session's own last commit, not
  something the merge introduced), and this session's own UI ids (compass/d-pad/audio/
  fullscreen/auto-pan) plus the boss's new tour ids (`tourBar`, `tourHotspots`) both
  present. Server boot-tested: `/api/projects` lists the boss's new `pano-testamit`/
  `panotour-demo`/`test12` alongside this session's `anandman`/`eleganza`; both a plain
  project's `plots.csv` and a tour-only project's `tour.json` serve `200`.
- Not yet committed — the merge is complete in the working tree/index, staged, but left as
  a pending commit pending explicit confirmation.

---

## 2026-09-08 (virtual tour Phase 1, step 1: tour.json data model + admin Tour tab)

First code for the virtual tour. `app.js`, `index.html`, `styles.css`. Ships the data
model + a 4th admin **Tour** tab for managing tours and their node panoramas. Hotspot
linking + the client crossfade viewer are the next steps (not in this change).

- **Data model (`tour.json`, D-13):** one file per project holding **many** tours —
  `{ version, tours:[{ id, name, startNode, nodes:[{ id, name, pano{file}, defaultView{lonDeg,latDeg,fov} }],
  links:[{ from, to, hotspot{lonDeg,latDeg}, label }] }] }`. New `parseTours`/`buildToursData`/
  `loadToursFile`/`setTours`/`tourNodeBlobFiles`/`saveToursAs` mirror the landmarks/amenities
  pattern exactly (basename-resolved node images, `loadProjectFile`/`saveToProject`). `parseTours`
  drops links whose from/to node no longer exists and repairs a dangling `startNode`.
- **State:** `state.tours` + admin `tourSel`/`tourNodeSel` (client `tourActive`/`tourNode`
  reserved for the viewer step).
- **Persistence wired:** `buildSession` snapshots tours (incl. node pano blobs) → session
  autosave/restore; `exportSite` writes `tour.json` + fresh node images (and the empty-check
  now counts tours); boot loads tours (session > committed `tour.json` > none).
- **Admin Tour tab:** ＋ Add tour, inline rename, delete; per-tour node list — ＋ Add node
  (upload a pano, auto-resized to a texture-safe `.web.jpg` via `resizeImageToBlob` at the
  pano cap), rename node, ☆/★ set start node, delete node; Save tours… / Load…. `setAdminTab`
  is now 4-way (align/landmarks/amenities/tour); `refreshTourList` renders it.
- **Verified** end-to-end via the in-app Browser pane against a throwaway `zztourtest`
  project (removed after): Tour tab shows; add tour → "Tour 1"; two node panos uploaded →
  2 nodes; rename tour + node, set start node, delete node; **server save wrote
  `projects/zztourtest/tour.json` + 3 node images** with basename `sample/tour-t1-nN.web.jpg`
  paths and `startNode:"n2"`; **session-discarded reload restored** the tour, 2 nodes and
  start node from the committed file; zero console errors; `node --check` + `python ast.parse`.

---

## 2026-09-08 (virtual tour: 0-B signed off, all OQs answered, Phase 1 scope locked — planning only)

Docs only (`VIRTUAL-TOUR.md`, this file). No app code yet. The owner reviewed the `spike/`
tour and green-lit building **node/hotspot placement + linking as a real admin feature**,
and answered every open question. Recorded in `VIRTUAL-TOUR.md`:
- **Decisions locked:** D-1 → **(a) drag-to-place only**; D-9 → **new Tour tab**; all
  others as recommended. New build decisions: **D-11** client viewer *takes over the main
  pano* (reuses camera + landmark projection/drag), **D-12** menu launches a tour via a new
  **`panotour`** content type → `openClientPanoTour(tourId)`, **D-13** one
  `projects/<id>/tour.json` holding **many** tours.
- **OQ answers:** colour-only (no depth) → **crossfade, no glide**; ~15 nodes/tour,
  ~30/project → LRU+prefetch required; **separate tours launched from the menu** (not one
  graph, not auto-linked to the plot map); HTTPS to come for WebXR (Phase 3); scale/units
  moot while colour-only.
- **Consequence:** **Phase 2 (depth glide) deferred** (both prerequisites declined); Phase 1
  = the crossfade 3DVista replacement, now `🟡 in progress`.

Next: implement Phase 1 in the order data model → Tour tab → hotspot authoring → client
crossfade viewer → menu launch. See `VIRTUAL-TOUR.md` Phase 1.

---

## 2026-09-07 (landmark categories SETTLE and hold, matching the reference exactly)

Reversed the continuous sweep added earlier this session, at the user's explicit request
after comparing both behaviours against the reference tour and preferring its
settle-and-stop: "can we do that with our website, it looks more appealing".

**Root-caused the reference's actual behaviour first, rather than guessing.** Read
`tdvplayer.js`'s own sequence-playback code (not the exported tour data, the PLAYER
runtime) and found the exact mechanism: a sequence's `repeat` property defaults to **1**
when unset —
```js
var f = this.Xb.get("repeat", 1);
this.PM.length > 0 && (f == 0 || this.Uja < f) ? this.f4(0) : (/* fire done, stop */)
```
`repeat: 0` would loop forever; anything else plays the movement list that many times and
stops. **None of Eleganza's category sequences set `repeat`**, so all of them play their
one movement (a 12.8–25.6° drift) once and hold still — confirmed, not inferred. Only
its aerial/default view (360°, one lap) and Temples (1800°, five laps) genuinely spin, and
even those stop after that single pass — there is no perpetual loop anywhere in the tour.

**Change:** a landmark category now flies to its settled shot (unchanged: tightest-cluster
aim, fixed hfov 110 → per-aspect vertical FOV) and then holds — no ping-pong, no sweep, no
idle drift. The ALL/aerial free 360° idle spin is untouched, since it's a separate,
longer-standing feature this conversation never targeted.
**Trade-off, stated plainly:** the two widest categories (Connectivity 140°, Commercial
144°) can't fit every landmark in one 110° frame, so an outlier will sit outside the
automatic shot. That is not a regression — it's the reference's own trade-off (its
hand-picked shots don't guarantee full coverage either) — and the outlier stays reachable
by a manual drag, which still releases the arc exactly as before.

**Removed as genuinely dead code**, not just disabled: `computeLandmarkPanRange()` and its
four supporting constants (`LANDMARK_EDGE_PAD`, `LANDMARK_FIT_FOV_CAP`,
`LANDMARK_FIT_FOV_FLOOR`, `LANDMARK_SWEEP_FOV`, `LANDMARK_SWEEP_MS`,
`LANDMARK_SWEEP_MIN_RATE`) and `state.autoPanDir`, all confirmed via grep to have no other
callers before deletion. `LANDMARK_SWAY_HALF` survives with a new, accurate comment — it's
now just the half-width of the arc a manual drag releases from.

**Verification, and an honest correction mid-session.** A live-browser timing test first
appeared to confirm the fix (0.000° drift over 6s on a category); a second test of the
UNCHANGED ALL-view free-spin also showed 0.00° movement, which shouldn't happen — that
contradiction is what caught it. Instrumenting `requestAnimationFrame` directly showed
**only 3 real frames total, then the render loop stopped calling it** — the same headless
`--virtual-time-budget` limitation documented elsewhere in this file, so BOTH timing
results were artifacts of nothing rendering, not evidence either way. Discarded, and
replaced with the reliable method already used successfully elsewhere in this project:
extract the real idle-autopan conditional from `app.js` (brace-matched, not copy-pasted)
and execute it directly in Node against both states. Result:
`landmarkPanRange` truthy → `state.view.lon` provably unchanged; `landmarkPanRange` null
→ the free-spin line still runs and moves it — both PASS, deterministically, independent
of any browser. `node --check` clean; the menu-skip and `featured`-flag regression suites
both still green.

---

## 2026-09-07 (auto-pan button says what it DOES)

The auto-pan toggle was a `🔄` emoji, which says "something rotates" but not what pressing
it will do. Replaced with an SVG that shows the **action**: pause bars while the camera is
drifting (press = stop), a play triangle once stopped (press = resume), wrapped in two arcs
so it reads as *camera motion* rather than a media control for the audio button beside it.
Title and `aria-label` follow — "Stop the camera moving" / "Let the camera move again" — and
`aria-pressed` reports the stopped state. `updateAutoPanToggleUI()` owns both, and is called
at boot so the button matches `state.autoPan` from the first frame instead of relying on a
hardcoded `is-active` in the markup.

Two sizing findings, from rendering the candidates standalone at 4× rather than guessing:
arrowheads on the arcs collapse into ~2px blobs at the 19px this actually renders at and
merge with the centre glyph, so they were dropped; and arcs spanning 100° read as plain
parentheses — widened to 140° they read as a broken ring. Iterating on the standalone
render is also the practical way to do this: the bundle export is 1.3GB and ~40s a round.

**Verified:** clicking flips `is-active` true→false, `.pan-stop` display block→none and
`.pan-go` none→block, and the title changes to match.

---

## 2026-09-07 (compass redesign, SVG icons, smooth camera motion)

- **Compass rebuilt: the rose is FIXED, a shaded cone sweeps.** The first version rotated
  the whole rose and counter-rotated each letter to keep it upright — which works, but the
  reference does the opposite and it reads far better: north stays at the top and a
  translucent cone swings round to show where the camera is pointing. Only `#compassCone`
  is transformed now, so the letters need no counter-rotation at all. Face, 8-point
  split-shading rose, ring and red north needle restyled to match.
- **Footer icons are SVG, not emoji** — corner-bracket fullscreen and a speaker whose
  on/off halves swap on the button's `is-active` class. ⚠️ `updateAudioToggleUI` was still
  assigning `textContent`, which **replaced the whole inline SVG with a character**; the
  fullscreen icon looked right while the speaker silently reverted to an emoji. That line
  is gone and the swap is pure CSS.
- **Smooth motion (the "it feels like dragging" fix).** The d-pad was jumping a fixed 1.4°
  every 45ms — about 22 visible lurches a second, independent of frame rate. Replaced with
  a velocity model: a press sets a TARGET speed (~34°/s) and `stepViewMotion()` eases the
  real velocity toward it each frame, then back to zero on release, so the camera
  accelerates and coasts to a stop. Easing is frame-rate independent
  (`1 - VIEW_EASE_PER_S^(dt/1000)`).
- **Drag inertia.** A pan used to stop dead the instant the pointer lifted. The gesture's
  instantaneous speed is now carried into `viewVel` (capped, so a hard flick can't spin the
  view wildly) and decays through the same easing — the single biggest contributor to
  panning feeling rough. Grabbing again cancels any coast.
- Steered motion is gated ahead of the idle auto-pan so the two can't both write
  `state.view.lon` in one frame.

**Verified:** `pushWhileHeld=true` / `pushCleared=true` on press and release, the cone
carries a rotate() while the rose does not, and the speaker button holds an SVG with empty
textContent (the emoji regression is gone). Screenshots confirm both icons and the compass.
The *feel* of the easing still needs a real browser — headless stops the rAF loop, so no
motion can be observed there.

---

## 2026-09-07 (compass + directional pad)

Added the two client controls the reference tour has and we didn't, both working.

- **Compass** (top-right, client only): the ROSE rotates with the view while the N/S/E/W
  letters counter-rotate so they stay upright — each label needs BOTH transforms (carried
  round by the rose, then spun back on itself), which one transform can't express. Driven
  from `renderLoop` via `updateCompass()`. `state.view.lon` is the camera YAW and runs
  opposite a stored lon, so the heading is negated before north is subtracted — the
  two-conventions trap again.
- **Directional pad** (bottom-centre): four outlined arrows, tap to nudge and hold to keep
  moving. A press releases a selected category's arc clamp exactly as a drag does,
  otherwise `updateCamera` would fight every press and the buttons would feel dead inside
  a category; it also stamps `lastUserTouch` so the idle drift doesn't shove back. Speed
  tuned from measurement: 2.2°/40ms held came out at ~57°/s, too fast, now 1.4°/45ms
  (~31°/s).
- **`northDeg`** added to `alignment.json` (optional, default 0) — which stored lon is true
  north. ⚠️ **Uncalibrated:** the reference's compass is a 3DVista component that exports no
  north value, and the tour data carries none, so this could not be derived. The compass
  turns correctly with the view; its absolute bearing is only right once someone sets this
  one number.
- Fullscreen and mute already existed and are unchanged (`fsToggle`/`audioToggle` in the
  drawer footer); their styling was NOT altered, since a banner restyle had just been
  reverted at the user's request.

**Verified:** compass transform tracks the view and labels carry the counter-rotation
(`rotate(-339.28 60 60)` + per-label inverse). D-pad confirmed by reading state directly —
a 500ms right-hold moved lon −28.60°, an up-hold moved lat +28.60°, and
`landmarkPanRange` was cleared. That indirection was necessary: headless stops the rAF loop,
so nothing repaints and on-screen motion cannot be observed there (see the gotcha).
Screenshot confirms both render in place.

---

## 2026-09-07 (landmark parity with the Eleganza reference tour)

The `anandman` project is meant to reproduce `demo.build91.in/Eleganza`, whose panorama is
the same aerial shot. That tour is a **3DVista** export, so its data was read directly
(`script_general.js`) rather than guessed at.

**What the reference actually does.** Six *separate panoramas* — one per landmark category
— all sharing byte-identical cube faces (verified by md5: only the overlay sets differ).
Each category button runs
`setPanoramaCameraWithSpot(playlist, item, yaw, pitch, 110)` + `setPlayListSelectedIndex`.
The `hfov` is **110 for every category**: it never zooms per category and never sweeps, and
its pitch is level (−0.3° to −3.2°). Its idle motion is a slow yaw drift, 1.6–2.1°/s with
cubic ease in/out.

**Calibration — the one thing that had to be measured, not assumed.** Their cubemap was
reprojected to an equirect and cross-correlated against our `Connectivity.web.jpg`:
**0.986 correlation at a 0.00° shift, no mirroring** — the same image in the same
orientation. Our `dir()` and `dirFromLonLat()` share a formula, so our stored lon IS the
image longitude (0 at the left edge), while their yaw 0 is the front face at the image
centre. Hence:

    our stored lon = reference yaw + 180        our stored lat = reference pitch

The sign was confirmed independently: fitted against all 24 shared landmarks that mapping
leaves a residual spread of ±9.4°, versus ±51.5° for the flipped sign — a 5× separation.
A crop of our panorama at each converted position lands exactly on the horizon, confirming
the pitch half.
**Two LOD traps cost a detour and are worth knowing:** their tile pyramid numbers level
**2 as the single-tile, lowest-res level** (0 and 1 are the tiled high-res ones), so
fetching `/0/0_0.webp` returns one corner tile — which for a side face is pure sky, and
made the first correlation meaningless.

**❌ REVERTED (same day, at the user's request) — landmark banners restyled after the
reference.** Both files are back to the centred, original banner: `styles.css` restored by
hand, and `app.js` had already lost its half independently (found on disk with the original
`halfW` centred placement and none of `rotatedBounds` / `is-left` / `leftLimit`, mtime later
than the edits — see the "work can disappear from disk" gotcha in CLAUDE.md, though here the
user was reverting in parallel so that is the likelier explanation). The CSS had to go too:
on its own it anchored the banner at a corner while the JS positioned it as if centred.
**The findings below are kept because they cost real measurement and would otherwise be
re-derived:**
Reported as "why don't ours look as organised and spacious", plus a request for the same
styling and for labels to flip sides rather than always extending right.

- **Style:** skewed navy-gradient sign (rotate −4°) with a teal distance bar under it and
  the icon in a lighter inset block, matching the reference's signage. ⚠️ **The font cannot
  be matched exactly** — the reference's labels are baked into overlay IMAGES, so no face
  is recoverable from the tour data; the stack is the closest widely-available match to
  their rounded geometric sans.
- **End-anchored, not centred.** Previously `translate(-50%,-50%)` put the leader line
  through the middle of the label. It now hangs off one END, the line meeting its bottom
  corner, with the icon on that same side — exactly the reference's arrangement.
- **Automatic left/right flip.** Each banner has two candidate boxes; it prefers the right
  (the reference's default) and flips left when the right would leave the viewport or
  collide with a banner already placed that frame. Confirmed firing: 0 flips at 1900px,
  1 at 1280px and at 1000px.
- **The drawer is a no-go zone.** One landmark was being drawn *behind* the category panel
  and was simply invisible; the open drawer's right edge is now the left bound.
- **Tilt-aware collision.** The first pass tested the untilted layout box, but a rotated
  rectangle's footprint is taller — ~14px more on a 200×48 banner — so neighbours grazed
  while the maths said they were clear. `rotatedBounds()` derives the real axis-aligned box
  from the four rotated corners. `LM_BANNER_TILT` must track the stylesheet's rotate().
- **Vertical lift for same-bearing landmarks.** Flipping can't separate two landmarks at
  nearly the same bearing (RITEE College and Kanger Valley are **0.2°** apart), so a box
  that still grazes is lifted until clear, up to 90px; the leader line just grows, as the
  reference's do. That closed the last two overlaps, both grazes of 6–7px on a 65px banner.

**Measured:** overlapping banner pairs 2 → **0** at 1900px and 1 → **0** at 1280px, with the
flip still engaging where space is tight. Screenshot-confirmed.

**Fourth correction — EVERY category sweeps now, not just the wide ones.** Reported twice as
"the camera is not panning from leftmost to rightmost of a category". The third correction
only restored the sweep for categories too wide to fit the 110° frame, which was just
Connectivity and Commercial; the other four kept a ±3.5° sway that is imperceptible — so
from the outside nothing had changed. Now the camera centre always travels the category's
own extent (`minLon-pad .. maxLon+pad`), bringing each end landmark to the middle of frame
in turn. Pace is the reference's ~2°/s, floored so a full pass never exceeds
`LANDMARK_SWEEP_MS` (30s): Healthcare/Temple 2.0°/s over 24s, Education 3.4, Lifestyle 4.0,
Connectivity 5.2, Commercial 5.3, all 30s. **This deliberately diverges from the reference**,
which holds a fixed shot and never sweeps — requested explicitly. Zoom stays at the
reference's hfov 110; only the motion differs.

⚠️ **Not verified in a browser, and the reason is worth recording:** headless Chrome stops
the rAF loop after ~5 frames under `--virtual-time-budget` (instrumented and confirmed:
`frames=5->5` while `three=true`), so idle auto-pan cannot be observed there at all. An
earlier "banner frozen at x=278 for 18s" reading was that harness limitation, not evidence
of a bug — don't repeat that inference. The pan ranges and rates above are computed from the
real functions; the motion itself needs a real browser.

**Third correction — the sweep had to come back.** Matching the reference's fixed framing
meant dropping the fit-or-sweep decision entirely, which was wrong: the frame is now a
CONSTANT 110 horizontal, so any category wider than that has landmarks outside it wherever
the camera aims, and with only the ±3.5° sway the `updateCamera` clamp locked the view to a
7° window — an outlying landmark could never be seen at all. Connectivity (140° span) had 1
of 4 stranded, Commercial (144°) likewise. Restored, but reconciled with parity: **the zoom
stays fixed at hfov 110** and a category that already fits keeps the gentle sway; only one
that doesn't fit sweeps, and it sweeps just far enough to bring each end into frame
(`minLon + hfov/2` to `maxLon - hfov/2`) rather than ranging over the landmark lons
themselves, which would overshoot by half a frame at each end and spend the pass staring at
empty sky. The opening shot is clamped into that range so the reference-matched framing
isn't yanked away on the first idle frame.
Measured: Healthcare 31°, Temple 32°, Education 86° and Lifestyle 104° all fit (sway only);
Connectivity sweeps 46° over 24s (1.9°/s) and Commercial 50° (2.1°/s), matching the
reference's own 1.6–2.1°/s drift. **Every landmark in every category is now reachable**
(6/6 categories, verified by walking each range and checking each landmark enters frame).

**Second correction — landmarks are placed TWICE in the reference, and we were using the
wrong copy for the default view.** Reported as "why does ours look so cluttered when both
sites have the same landmarks". Measured, and the cause was exact: the author hand-places
each landmark once on its **category** panorama (where only 3–7 labels compete) and again on
the **main** panorama, spread out for the crowded all-landmarks view. Using the category
placement everywhere put **NIT Raipur and Suyash Hospital 0.9° apart** in our default view —
on the main panorama the author had moved Suyash from 150.53 to 168.29 precisely to avoid
that collision.

| position set | min gap between the 9 | pairs under 12° |
|---|---|---|
| reference's MAIN pano (its all-view) | 11.0° | 2 |
| category panos (what we shipped first) | **0.9°** | 4 |

Fix: the nine landmarks that exist on the main panorama now use ITS placement; the other
sixteen, which only ever appear inside a category, keep their category placement. Those nine
are exactly the project's featured (default-view) set, so the two never conflict. **Costs the
category views nothing** — measured min gaps per category are unchanged or marginally better
(Education 0.2° → 1.9°, Commercial 36.1° → 35.2°, the rest identical). Radiant Way School is
un-featured to match: the reference shows it only under Education. Default view is now
**9 landmarks at 11.0° minimum spacing, identical to the reference**, screenshot-confirmed
with no overlapping labels.
**The general lesson:** when a reference tool renders the same entity in several contexts,
check whether it stores a separate placement per context before copying one of them
everywhere.

**Correction, same day — the overlay pitch is the graphic's CENTRE, not the label.** The first
pass put our `banner` at the reference's overlay pitch, which sat every label on the horizon
with a stub connector, while the reference shows labels floating high with long leaders. Each
overlay carries a `vfov` (6.1–20.3°, mean 16.3) — the angular height of the whole banner+leader
graphic — and its pitch is that graphic's centre. Corrected:

    banner  lat = pitch + vfov/2      (the label)
    hotspot lat = pitch - vfov/2      (the leader's tip)

and `applyCategoryFilter` now aims at the **midpoint of banner and hotspot** rather than the
banner, since aiming at raised labels would tilt the camera up into empty sky; the midpoint is
the graphic centre, which is what the reference's own category cameras point at (their pitches
run −0.3 to −3.2, i.e. level). Result: banner lat now spans −9.9..+12.2, hotspot −17.4..−5.0,
16.6° apart on average. **A second trap:** the same landmark exists on several panoramas with
slightly different hand placements (Suyash is 168.29 on 'Highest' but 150.53 on the Healthcare
pano), so a whole-file search for a label silently mixes them — the extraction must be scoped
to each category panorama's own overlay list.

**Imported:** all 25 landmarks with the reference's exact positions AND its category
assignment — every one of our 24 matched (the six "misses" were spelling variants: AIIMS/
AIMS, Brahmavid/Brahamavid, Tatibandh/Tatiband, Cricket Ground/Criclet Stadium, Gurudwara/
Gururdwara), plus **Radiant Way School**, which the reference has and we didn't. Their
overlay position is the LABEL, so it became our `banner`; the `hotspot` pin sits 9° below it
to keep our pin + connector look. The previous file is backed up beside it as
`landmarks.pre-eleganza-<stamp>.json`. Amenities were deliberately NOT imported (the 11
in-layout positions are extractable the same way if wanted later).

**Code:**
- `landmarks.json` gains **`category`**, and `isLandmarkMatchCategory` now treats an
  explicit category as **authoritative, short-circuiting the icon rules**. Without that,
  D Mart (icon `mall`, which infers COMMERCIAL) would appear under COMMERCIAL as well as
  its real LIFESTYLE home. The icon rules remain as inference for landmarks with no
  category.
- **`LANDMARK_HFOV = 110` + `vfovFromHfov()`.** Their hfov is HORIZONTAL and three.js'
  `camera.fov` is VERTICAL, so one hard-coded vertical number cannot match on two screen
  shapes: 110 hfov is 77.6° vertical on 16:9 but 66.8° on a 844×390 phone and 93.9° on
  4:3. The horizontal value is stored and the vertical derived from the live aspect.
- **`landmarkClusterCentre()`** replaces the fit-or-sweep decision. Their angles are
  hand-authored and follow no rule (Education sits on NIT Raipur, Connectivity on the
  Railway Station, but Healthcare sits near its arc midpoint), so no formula reproduces
  them exactly. Measured against all five: aiming at the tightest cluster averages 12.1°
  of error, versus 20.8° for the bounding-arc midpoint (which lands **52°** out on
  Connectivity, whose Highway outlier drags the midpoint into empty sky) and 18.7° for the
  circular mean.
- Idle drift `AUTOPAN_RATE` 1.2 → **1.8°/s**, the middle of the reference's range.

**Result, measured end to end against the reference's own angles:** mean **14.3°**, worst
23.9° (Education and Lifestyle, the two widest categories); Healthcare 6.8°, Connectivity
6.4°, Temple 10.8°. Zoom now matches exactly. 21 of 23 landmarks in the five categories
fall inside the 110° frame. Screenshot-confirmed: Education frames six of its seven
landmarks along a level horizon.
**Still open if tighter aim is wanted:** letting the admin mark one "focus" landmark per
category would land within ~4–5°, since that is effectively what the reference author did
by hand — and it stays admin *data*, not hard-coded angles in code.

---

## 2026-09-04 (landscape-phone responsiveness: status pills, contact card, drawer scroll)

`styles.css` only. Reported as "contact page, and the sold / available / reserved buttons"
being broken on mobile. Both were real and both were **measured**, not guessed: the client
bundle was driven headless at six viewports (552×225, 651×280, 828×295, 899×317, 916×335
inner, plus desktop) with a probe reporting every visible element that falls outside the
viewport, and whether overflowing content is reachable by scrolling.

- **The status pills were literally off the top of the screen.** `.zoom-controls` is a
  bottom-anchored column and had grown taller than a landscape phone: at 651×280 it stood
  **370px against ~260px of room**, so it overflowed UPWARDS and pushed Available / Reserved
  / Sold to negative y — invisible, untappable, with nothing to scroll. At 552×225 all three
  were gone; on taller phones one or two survived, which is why it looked intermittent.
  **Fix (structural, not another round of shrinking):** the pills LEAVE that column and dock
  to the **top-right** edge as a row, so the two groups are anchored to opposite edges that
  always exist and neither can push the other off. The column below then only has to fit six
  icons (6×28 + 5×4 = 188px, inside the ~200px a 552×225 phone leaves). `max-height` +
  `flex-wrap: wrap-reverse` stay as a safety net so an even shorter viewport wraps sideways
  rather than off-screen — `wrap-reverse` specifically, because a right-anchored stack must
  grow LEFT. An intermediate attempt left the pills in the column and relied on wrapping
  alone; the screenshot showed the icons stranded mid-screen, which is why they were moved
  out instead.
- **The contact card hid its own content where nobody could reach it.**
  `.contact-modal-right` is `justify-content: center` + `overflow-y: auto`; when the content
  is taller than the column, a centred flex column overflows at BOTH ends and **the part
  past the start edge cannot be scrolled to**. Measured at 828×295: the details hung ~90px
  off the top, unreachable. Now `justify-content: safe center` (base rule and the landscape
  block), which falls back to flex-start exactly when content doesn't fit; a browser that
  doesn't know the keyword drops the declaration and gets flex-start too. **This is the
  third time this same trap has appeared in this project** — see the landmark drawer's
  `.cat-nav`. Plus a landscape tier that keeps the side-by-side layout (vertical space is
  the scarce one) and tightens padding/type: the card now FITS entirely at 651×280 and up,
  and merely scrolls (37px, all reachable) at 552×225.
- **The drawer menu couldn't scroll, so its last items were simply lost.** `.cat-nav` had
  `overflow-y: auto` but no `min-height: 0` — and a flex item's default `min-height: auto`
  refuses to shrink below its content, so the nav just grew past the drawer and the bottom
  rows fell off the screen (measured: a `.cat-btn` 16px below the viewport at 651×280).
  `overflow-y: auto` on a flex child is decorative without `min-height: 0`. Now scrollable at
  every phone size tested.

**Verification (final pass, all six viewports):** every status pill and control icon fully
on-screen at all of them; `navScrollable=true` on every phone; contact card `fits` at
651×280+ and `scrolls(37px)` at 552×225; and **`unreachableTop=0px` everywhere**, which is
the metric that actually proves the `safe center` fix. Desktop (1264×765) confirmed
unchanged: pills correctly absent (they live in the topbar legend there), icons on-screen,
contact fits. Screenshots at 844×390 and 568×320 confirm it visually, not just numerically.
The 1.3GB test bundle was deleted afterwards; no project files were touched.

---

## 2026-09-04 (background audio accepts a VIDEO, and uses only its sound)

Follow-up to the audio feature: the ⚙️ Settings → 🎵 Audio… picker now takes a video too
(MP4 / WebM / MOV / MKV alongside the audio formats), loops it, and plays **only its sound
track** — the picture is never shown.

- **No extraction step, by design.** An `<audio>` element handed an `.mp4` demuxes it and
  plays the sound track; the picture simply isn't rendered because an audio element has no
  video surface. One code path serves both kinds. The alternative — `decodeAudioData` into
  an AudioBuffer — would pull the whole file into memory as raw PCM (hundreds of MB for a
  short clip) to reach the same audible result.
- **Measured cost, stated honestly rather than hidden:** with a real 2.4MB MP4 the client
  reported `AUDIObytes=17343` (the sound track genuinely decoding and playing, looped) but
  also `VIDEObytes=110237` — **Chrome still decodes video frames even in an `<audio>`
  element**, and the file ships at full video size. So a video works, but an audio-only file
  is lighter on both bandwidth and battery. The admin hint says exactly that; it is not
  presented as free.
- **A silent video is detected and reported.** A clip picked for its music may have no sound
  track at all, in which case nothing would ever play with no clue why — and this is not
  hypothetical: scanning the sample project's MP4 boxes, 3 of 11 carry only a `vide` handler
  and no `soun`. `warnIfSilentVideo()` checks `mozHasAudio` (Firefox) and `audioTracks`
  (spec/Safari) where available, and **falls back to Chrome's `webkitAudioDecodedByteCount`
  after a brief MUTED play** — muted playback is exempt from the autoplay policy, so it
  needs no gesture. Verified to discriminate correctly on real files:
  `withsound.mp4=true(bytes:6949) | silent.mp4=false(bytes:0)`. Where a browser gives no
  definitive answer it stays quiet rather than crying wolf on a good file.
- Export writes a video-sourced track with a `video/*` content type; `sw.js`'s
  `isRangedMediaPath` already covered the video containers.

**Verification:** `node --check`. End-to-end via a throwaway `audiotest` project (**deleted
afterwards**, and the bulky scratch copies with it — `projects/` is back to the user's own
nine): a real 2.4MB MP4 with a sound track played through `#siteAudio` as
`src=audio.mp4 paused=false loop=true t=0.5/19.8 AUDIObytes=17343`. The silent-clip detection
was validated as a standalone browser probe against both a sound-bearing and a video-only
file. **First test was a false negative worth recording:** the smallest sample MP4 was picked
for speed and reported `audioBytesDecoded=0` — which looked like the feature failing, but an
MP4-box scan showed that clip has no `soun` track at all. Check the fixture before doubting
the code.

---

## 2026-09-04 (admin-uploaded background audio)

Admin ⚙️ **Settings** gains a **🎵 Audio…** picker beside the logo; the track loops
quietly for client visitors and the existing 🔊 button mutes it. `app.js`, `index.html`,
`styles.css`, `sw.js`.

- **Stored exactly like the brand logo**, so it inherits every path that already works:
  `state.audio {file, blob, name, _url, _ver}`, `audio: { file }` in `alignment.json`,
  `siteAudioSrc()` preferring a fresh blob over the committed path (cache-busted with the
  alignment's `savedAt`, so re-uploading over the same filename can't serve a stale track),
  shipped by Export, carried in the working session, copied on save-as, and prefetched by
  the offline layer. **Not re-encoded** — there's no browser-side `resizeImageToBlob`
  equivalent for audio, so the admin's file ships as-is and `setSiteAudioFile` warns above
  8MB instead of silently shrinking it.
- **One button, two sources.** With a track configured the 🔊 button controls it; with none,
  the original synthesised ambience is untouched, so projects that never set audio behave
  exactly as before.
- **Autoplay is handled, not assumed.** Every current browser refuses audible playback
  before the visitor interacts with the page, so `play()` rejects on load through no fault
  of ours. That's recovered from rather than treated as an error: `armAudioGesture()` waits
  for the first real pointerdown/keydown and starts there. Verified both ways — with
  playback allowed it starts on load; with it blocked the page stays silent, the button
  honestly reads 🔇, and **zero errors** are thrown.
- **The visitor's choice sticks** (`b91-audio-muted`, alongside the other toggle prefs): a
  visitor who mutes stays muted on their next visit, and for them the track's `src` is
  never even attached — no download at all.
- **Admin never gets music started at it** mid-edit; 🔊 previews on demand.
- **`sw.js`: `isVideoPath` → `isRangedMediaPath`, now covering `mp3|m4a|aac|oga|wav|weba|flac`.**
  This is a correctness fix, not tidying: an `<audio>` element requests its src with byte-range
  headers and gets `206 Partial Content` back, and caching a single 206 under the resource
  URL silently corrupts the cache — only that one slice would ever be served again. That is
  the exact hazard `respondVideo` exists to prevent, and audio extensions were falling
  through to the ordinary cache path instead.

**Two real bugs found by testing, both the same root cause — async playback state:**
`setAudioMutedPref(false)` and the button/`state.audioPlaying` update all sat inside
`play()`'s `.then()`. But `el.paused` flips synchronously while the promise only settles once
playback has actually BEGUN, so (1) an unmute read back as still muted, and (2) `audioPlaying`
stayed false, meaning an immediate second press **re-started the track instead of muting it**.
Fixed by recording intent synchronously on the click and only walking it back if playback is
genuinely refused — the preference records what the visitor asked for, not how fast the
media loaded.

**Verification:** `node --check` on `app.js` and `sw.js`. End-to-end in a real browser via a
throwaway `audiotest` project (a Python-generated 32KB WAV, **deleted afterwards** — nothing
left in `projects/`) exported as a bundle and driven headless: first visit
`[src=audio.wav?v=<savedAt> paused=false loop=true vol=0.35 btn=🔊]`; mute → unmute →
re-mute clicked back-to-back all land correctly (`pref` 1→0→1, glyph following each press);
a returning muted visitor gets `paused=true srcAttached=false`; autoplay blocked gives
`paused=true btn=🔇 errors=0`. The bundle also confirmed `audio.wav` ships in `data/`
automatically. **Not verified:** the admin Settings UI itself (headless admin capture is
unreliable here — see the gotchas), so the picker/Clear/status wiring is code-reasoned only.

**Testing note worth keeping:** in BUNDLE mode all project data is inlined, so `init()` can
run to completion in microtasks *before* the parser reaches an end-of-body `<script>`. A probe
that sets `localStorage` down there is already too late — it must go in `<head>`. A first
attempt at the mute-persistence test looked like a product bug because of exactly this.

---

## 2026-09-04 (client menu skips folders that offer no choice)

`app.js` only. A folder is a navigation aid, not content — drilling into one that presents
no actual decision costs a tap and shows a screen with nothing on it to choose. The live
`anandman` menu had both shapes of this:

| Folder | Contents | Was | Now |
|---|---|---|---|
| LOCATION INTELLIGENCE | 1 video | submenu with one row, then play | plays on the first tap |
| WALKTHROUGH VIDEO | 1 video | same | plays on the first tap |
| BROCHURE | 1 PDF | same | opens on the first tap |
| gallery | 25 `image` children | list of 25 rows titled GALLERY 1..25 | image viewer at photo 1 |
| VIRTUAL TOUR | nothing | drilled into "No items inside this category." | brief notice, menu stays put |

The gallery list was pure friction: every one of those 25 rows landed in the SAME viewer,
because `openClientFolderImageModal` already gathers every image sibling regardless of which
was picked.

- **`resolveFolderTarget(node)`** is the new single decision point, returning `open` /
  `images` / `menu` / `empty`. Rules: exactly one child → open it (recursing while each
  level still offers only one thing, so a folder-inside-a-folder-inside... collapses in one
  tap); all children are `image` nodes → open the viewer at the FIRST one and let prev/next
  do the rest; anything else (sub-folders, or a mix of content types) → the submenu, as
  before, because that IS a real choice. Guarded by a `seen` set and an 8-hop cap: a
  hand-edited or round-tripped tree could point a folder at an ancestor, and walking that
  inside a click handler would hang the page.
- **`activateMenuNode(node, {fromRoot})`** is now the one "visitor clicked a menu row" path,
  shared by the root list and the submenu list so the two can't drift apart. When a skip
  lands on a deeper folder, only that folder is pushed onto `state.menuNavStack` — which
  keeps Back honest: it returns the visitor where they came from, not through levels that
  were skipped on their behalf.
- **`menuRowOpensSubmenu(node)`** drives the `›` affordance, so a row only wears the
  "there's more inside" arrow when clicking it actually opens a submenu. On the live menu
  that leaves the arrow on LANDMARKS alone — confirmed by screenshot.
- **Autoplay needed no change:** `openClientVideoModal` already calls `player.play()` for a
  local file, and both `getYoutubeEmbedUrl`/`getVimeoEmbedUrl` already append `autoplay=1`.
  The video was always going to play; the extra tap was the whole problem.
- **Admin is untouched** — the drawer is client-only and the menu builder still shows and
  edits the true nested structure, so an admin can always see what they actually built.
  Chosen with the user: an empty folder shows a notice rather than a dead-end screen (and
  is NOT auto-hidden — an unfinished section staying visible is the admin's signal), and
  the skip recurses through as many single-item levels as it finds.

**Verification:** `node --check` clean. 26 assertions drive the real extracted
`resolveFolderTarget`/`menuRowOpensSubmenu` against the live `anandman` tree plus edge cases
— two sub-folders, images+video mixed, two videos, a single `gallery`-type child, an empty
folder, a folder whose only child is an empty folder, a contact node, a self-referencing
folder, and nesting past the hop cap (the last two must terminate rather than hang) — all
green. Then end-to-end in a real browser via the bundle-export `file://` route: clicking
GALLERY gives `galleryOpen=true counter=(1 / 25) name=GALLERY 1`, and clicking WALKTHROUGH
VIDEO gives `videoModalOpen=true playerVisible=block srcSet=true paused=false
submenuShown=false`. **Caveat on that last one:** headless needed
`--autoplay-policy=no-user-gesture-required`, because a synthetic `.click()` isn't a user
gesture to Chrome's autoplay policy. A real tap is, so this confirms the wiring reaches
`play()` with no submenu in between — not that autoplay survives every browser policy.

---

## 2026-09-04 (collapsed drawer: a rail, not a clipped half-button)

`styles.css` only. Follow-up to the drawer restyle, from a two-image before/after: the
COLLAPSED state was the problem, not the panel tint.

- **`translateX(-100%)` cut the reopen button in half.** The toggle sits at `right:-20px`
  and is 38px wide, so it spans drawer-x `[W-18, W+20]`; sliding the drawer's right edge
  exactly onto the screen's left edge put it at screen x `[-18, +20]` — **18 of its 38px
  off-screen**, a half-circle bleeding off the edge with no panel behind it. The old comment
  called that "a docked pull-the-drawer-back-out tab" and defended it; the reference mock
  says otherwise, and it reads as clipped chrome rather than a control.
  **Fix:** collapse to `translateX(calc(-100% + var(--collapsed-rail)))` with the rail at
  38px, leaving a slim sliver of the panel on screen and the whole toggle sitting on it.
  Verified by screenshot: rail 0–38px, toggle fully visible at 20–58px — matching the mock's
  0–38 / 15–55. The rail must stay >= the toggle's 20px overhang or the clipping returns.
- **The rail was streaked with cropped menu text.** It exposes the panel's right 38px, which
  is the tail END of the menu rows — so the first render of it showed sliced labels and a
  column of row `›` arrows instead of a plain sliver of glass. The panel's CONTENTS now fade
  out while collapsed (`.cat-drawer.is-collapsed .cat-drawer-inner > *`), keeping only its
  background. The toggle is a sibling of `.cat-drawer-inner`, not a child, so it's untouched
  and stays visible — that markup detail is what makes the one-line fix possible.
  `visibility` rides along on a delayed step so the hidden menu can't be tabbed into:
  invisible-but-focusable is a keyboard trap, not a cosmetic detail.
- **The rail passes pointer events through** (`pointer-events: none !important`, at higher
  specificity to beat `.cat-drawer-inner`'s own `auto !important`), so a drag starting on it
  pans the panorama instead of dying on an inert panel edge. The toggle keeps its own
  `auto`, so the one thing worth clicking there still works.
- **Kept:** the counter-transform warning. The fix moves the DRAWER, not the button — the
  toggle still rides the parent transform with no counter-transform of its own, which is
  exactly why nothing floats loose mid-screen the way the reverted 2026-09-02 attempt did.

**Verification:** screenshot-confirmed at 1280×860 via the bundle-export `file://` route,
in BOTH states — collapsed (clean rail, whole toggle, scene visible through the rail:
(55,69,87) against (73,87,103) beside it) and expanded (logo, all 8 menu rows, footer, panel
translucency all intact). The collapsed state was forced by injecting `is-collapsed` into the
exported BUNDLE copy only; the source is untouched by that.

---

## 2026-09-04 (client drawer: translucent panel + reference proportions)

`styles.css` only — no markup or JS changed. Requested with a reference mock: make the
client's left menu see-through "not very much transparent but that much that things can be
seen", and match the mock's logo/menu sizing and margins.

- **The panel is translucent, not frosted.** Was `rgba(30,34,43,0.88)` + `blur(16px)`; now a
  vertical gradient of `rgba(16,20,29,.58–.74)` + `blur(2px)`. **The blur mattered more than
  the alpha:** a 16px backdrop blur destroys every recognisable feature behind the glass, so
  the panel read as an opaque frosted slab even at 0.88 — dropping to 2px is what actually
  lets the treeline and horizon read through. The gradient is densest at the very top and
  bottom (behind the logo, and behind the footer icons) and thinnest across the middle where
  the menu sits over the usually-darker ground half of the pano — legibility bought where
  it's needed, transparency spent where it shows. Menu labels, brand text and the logo
  additionally carry their own `text-shadow`/`drop-shadow`, so a bright sky behind the panel
  can't wash them out.
- **The brand lockup now shows at every screen size**, not just on phones. This REVERSES a
  previously documented decision ("desktop's top bar already carries it, showing it twice
  costs menu space") — done deliberately at the user's request, since the mock puts the
  logo at the head of the drawer and the whole composition hangs off it. Re-hiding it on
  desktop is a design change, not a cleanup; the comment in `styles.css` says so.
- **Proportions matched to the mock:** drawer 250 → 282px, inner padding 24/18 → 34/26,
  logo lockup up to 168×148 (was 150×82, which squashed a tall lockup), menu rows
  `11px/12px` at 13.5px with 1px tracking and a 3px gap (≈ the mock's 40px rhythm), and the
  footer icons centred with the divider rule dropped — on a translucent panel a hairline
  reads as a scratch on the glass.
- **The menu is vertically centred in the space between logo and footer** (`justify-content:
  safe center`), which is the airy block the mock shows. `safe`, not plain `center`: a
  centred flex column that outgrows its box overflows in BOTH directions and the overflow
  past the start edge is unreachable by scrolling, so a long menu on a short window would
  lose its first items with no way to get at them. A browser that doesn't know the keyword
  drops the declaration and gets `flex-start` — top-aligned, never clipped, the right way
  to fail.
- **Both phone layouts keep their compact fit.** Portrait and landscape already tighten this
  drawer so all 8 items fit without scrolling — the drawer is the only navigation on a
  phone, so an item below the fold is effectively missing. Added overrides hold the small
  logo, the tight brand margin and `justify-content: flex-start` there, and landscape keeps
  the old 250px width (282 of an 844px screen is a third of it). Those overrides need the
  `body:not(.is-admin)` / `.cat-drawer` prefixes for specificity — the base rules are
  declared LATER in the file and a media query adds no specificity of its own, the same
  cascade trap already recorded twice in this project.

**Verification — screenshot-confirmed, unusually for this project.** This is client-only
styling, so the bundle-export route works (`GET /api/export-bundle?project=anandman` → unzip
→ headless Chrome on the `file://` index): checked at desktop 1280×860 and phone-landscape
844×420, both rendering correctly with all 8 menu items visible and unclipped. Transparency
was then confirmed by MEASURING pixels rather than by eye — sampling the panel where bright
sky sits behind it versus dark ground gave (66,80,97) and (37,45,56), tracking the backdrop
exactly as alpha compositing predicts (predicted (56,65,79) at α≈0.68 against a measured
(56,67,83) on the first pass), which a solid panel could not do. That measurement is what
caught the first attempt being too subtle to actually see through; the alpha was lowered ~0.10
and re-measured. Admin is unaffected (`body.is-admin .cat-drawer { display:none }`).

---

## 2026-09-04 (camera aimed at the category's MIRROR IMAGE)

- **`state.view.lon` and a stored landmark lon run in OPPOSITE directions, and the
  category camera code mixed them.** Reported after the previous pan fixes: HEALTHCARE and
  EDUCATION panned fine, but COMMERCIAL, CONNECTIVITY, LIFESTYLE and TEMPLE were still
  wrong. That split is the whole diagnosis. A stored lon uses `atan2(-v.x, v.z)` (the pano
  is viewed from inside, texture X-mirrored). `state.view.lon` is the camera YAW, fed to
  `cam.rotation.set(lat, lon + PI, 0, 'YXZ')`; working that matrix out, the camera's
  forward vector is `(cos(lat)sin(lon), sin(lat), cos(lat)cos(lon))` — the X-mirror of
  `dirFromLonLat`. So `state.view.lon = L` looks at stored lon **−L**.
  `computeLandmarkPanRange` built its arc with the stored-lon formula while its own doc
  comment promised "in `state.view.lon`'s radian convention", and every consumer
  (`animateCameraTo`, the `updateCamera` clamp, the idle sweep) treats it as camera lon.
  Net effect: **the camera was aimed at each category's mirror image across lon 0**, off by
  twice the category's offset from centre. Measured on the user's own project:

  | category | arc centre (stored lon) | aiming error | reported |
  |---|---|---|---|
  | HEALTHCARE | ~2° | ~4° | worked |
  | EDUCATION | ~−6° | ~12° | worked |
  | COMMERCIAL | ~−17° | ~34° | broken |
  | CONNECTIVITY | ~−33° | ~66° | broken |
  | LIFESTYLE | ~−41° | ~82° | broken |
  | TEMPLE | ~53° | ~106° | broken |

  A category sitting near lon 0 is its own mirror, so the error vanished into a 100°+ FOV
  and those two looked correct — which is exactly why this survived the earlier round of
  pan fixes. Projecting each landmark through a faithful reproduction of three.js' YXZ
  camera confirmed it before any change: COMMERCIAL 2 of 3 landmarks off-screen,
  CONNECTIVITY 4 of 5, LIFESTYLE 3 of 6, **TEMPLE 2 of 2** — against 0 of 2 and 0 of 6 for
  the two that worked. Exact match with the user's list.
  **Fix:** one named helper, `viewLonFromDir(v) = atan2(+v.x, v.z)`, with the two
  conventions written out above it, used by `computeLandmarkPanRange`, the ALL-branch
  centroid target, and `computeHome` (same latent bug there — masked because its pitch is
  −86°, i.e. nearly straight down, where yaw barely shows). `lonLatFromDir` keeps
  `atan2(-v.x, v.z)`: it is the stored-lon inverse and is correct as-is.
  **After:** all 6 categories frame every one of their landmarks (or, for a swept one,
  reveal all of them across the pass), on desktop and phone-landscape alike.
- **A swept category is now timed, not speed-capped.** CONNECTIVITY's 161° arc can't fit
  one frame (177° with padding, past the 120° FOV cap), so it tours — but at the ambient
  idle-drift rate that traverse took **134 seconds**, roughly a pixel every 20 frames,
  which reads as a frozen camera showing one landmark rather than as a sweep. The range now
  carries its own `radPerMs`, sized so one pass takes `LANDMARK_SWEEP_MS` (24s) whatever
  the arc's width — self-scaling, so every project's tour is equally readable instead of
  depending on how wide that particular category happens to be. CONNECTIVITY now crosses at
  7.4°/s and all 5 landmarks come into view. A category that FITS still sways at the
  ambient rate: that's ambience, not a tour.
- **Corrected a stale comment rather than trusting it.** The sweep branch claimed "minLon
  is the visual right edge and increasing lon sweeps leftward". With the range now in
  camera lon, `sweepMin` is the visual LEFT edge and the tour reads left-to-right —
  measured (at `sweepMin`, every visible landmark of a real 5-landmark category sat in the
  left half), not assumed, and the comment now says so along with a note to re-measure if
  anyone flips a convention here again.

**Files:** `app.js` only. **Verification:** `node --check` + `ast.parse` on `server.py`
clean; a harness projects the real landmarks through a faithful three.js YXZ camera
reproduction and asserts per category — 6/6 PASS (5 fitted categories: every landmark
on-screen at rest; CONNECTIVITY: 5/5 revealed across the pass). The earlier fly-in
assertions (0.0° first-frame jump, 0 frozen frames) and the landmark `featured` assertions
still pass. A grep guard confirms the only remaining `atan2(-v.x, ...)` in code is
`lonLatFromDir`, where it belongs. **Still not** browser-confirmed — headless capture of
this app is unreliable (see the gotchas), so the on-screen result wants a real look.

---

## 2026-09-04 (camera pan on category select)

Four fixes in the landmark-category camera path, all in `app.js`. Reported as "some issue
with panning of camera when selecting any of the categories"; diagnosed by replaying the
real `computeLandmarkPanRange`/`meanDirection`/`isLandmarkMatchCategory` sources against the
user's own `projects/anandman` landmarks + saved view, frame by frame, rather than by eye.

- **The arc clamp was eating the fly-in — the main bug.** `applyCategoryFilter` installs
  `state.landmarkPanRange` and *then* calls `animateCameraTo`, but `updateCamera` enforced
  that range as a hard clamp on `state.view.lon` **every frame**. The fly-in by definition
  starts outside the range it just installed, so every frame rendered pinned to the range
  boundary: the camera snapped to the destination on frame 1 and sat frozen while only the
  FOV (not clamped) animated. Measured across the six categories in that project: 5 of 6
  jumped **15.6–70.2° instantly** and stayed frozen for **22–29 of 36** animation frames.
  For a "fits" category the range is only ±3.5° wide (`LANDMARK_SWAY_HALF`), so essentially
  the entire journey sat outside it. CONNECTIVITY was the exception — wide-arc sweep branch
  whose range happened to contain the starting view — which is exactly why the problem felt
  inconsistent from category to category.
  **Fix:** `updateCamera` skips the clamp while `cameraAnimTimer` is live. The arc lock is
  meant to bound where the view can *wander*, not to fight the animation delivering it
  there, so it now engages the moment the fly-in ends (with the camera already inside it).
  All six categories now pan the full distance with a 0.0° first-frame jump and 0 frozen
  frames, and every one still lands inside its arc so the clamp engages without a snap.
- **Every landmark DOM rebuild re-flew the camera.** `rebuildLandmarkDOM()` ends by calling
  `applyCategoryFilter(state.selectedCategory)` — it only wants the highlight/dim classes
  re-applied to the freshly-created nodes, but it got the whole camera move too. With `ALL`
  selected `panInfo` is null while `validDirs` isn't, so the third branch fired
  `animateCameraTo(centroid, 72)`. Consequences: at client boot `setLandmarks()` → rebuild
  dragged the camera **45.5° off the saved `alignment.json` view and forced FOV 72**,
  breaking the documented WYSIWYG guarantee; and in admin, `addLandmark`/`deleteLandmark`/
  `setLandmarkRender` each yanked the view away right after a pin was dropped at the centre
  of it. **Fix:** `applyCategoryFilter(cat, { moveCamera = true })`; `rebuildLandmarkDOM`
  passes `moveCamera:false` for a styling-only refresh. (The one recursive path —
  `applyCategoryFilter` → `rebuildLandmarkDOM` when `lmDom` is empty → back — terminates:
  the inner call is styling-only and `lmDom` is populated by then.)
- **A "fits" category was framed on the wrong centre.** The fit decision and the FOV it
  picks both come from the arc `[minLon,maxLon]`, but the camera aimed at
  `meanDirection(dirs)`. For an uneven spread those differ — COMMERCIAL's vector mean sat
  **12.9° off the arc centre**, pushing an edge landmark outside the very frame the fit
  calculation had promised would hold all three. **Fix:** aim at `(minLon + maxLon) / 2`.
  Latitude still comes from the mean (no seam to straddle vertically). Verified: all five
  "fits" categories now contain every one of their landmarks.
- **Idle auto-pan was frame-rate dependent.** `lon += 0.00035` *per frame* meant the same
  scene drifted twice as fast on a 120Hz phone as on a 60Hz laptop, and crawled whenever
  the frame rate dipped. **Fix:** `AUTOPAN_RATE` (rad per ms) × a `dtMs` capped at 100ms
  (so returning to a backgrounded tab resumes rather than lurching). The rate is the exact
  per-ms equivalent of the old 60fps constant, so the feel on a 60Hz display is unchanged.
  **Not changed:** the sweep speed itself — 1.20°/s, i.e. ~134s for one pass of
  CONNECTIVITY's 161° arc. That's a taste call, not a bug; say so if it should be quicker.

**Verification:** `node --check app.js` + `ast.parse` on `server.py` clean; the landmark
`featured` assertions still pass unchanged. The before/after frame-by-frame replays live in
the session scratchpad (`sim_pan.mjs` / `sim_pan_after.mjs`) — they drive the real extracted
functions, so they measure the shipped math, not a paraphrase of it. **Not** confirmed in a
live browser: headless capture of this app is unreliable (see the gotchas), so the actual
on-screen smoothness wants a real look.

---

## 2026-09-04 (later same day)

- **The show-by-default control is now a ✓ ✕ PAIR, not a single toggle — the first
  version inverted people's intent.** Reported straight after shipping: "the landmarks that
  were tick marked are not currently visible, which is quite the opposite of what I
  expected." The engine was correct — checked the user's live `projects/anandman/landmarks.json`
  and replayed the real `parseLandmarks`/`isLandmarkShown` over it in Node: 15 `featured:true`
  landmarks draw in the default view, the 9 `featured:false` ones don't, and both `NIT Raipur`
  and `RITEE College` still come back under EDUCATION. Exactly as designed. **The UI was the
  bug.** Every landmark starts ticked (backwards compatibility), so a single button showing
  the CURRENT state reads as an ACTION — "tick the ones I want up-front" — and going down
  the list clicking the wanted landmarks turned each one OFF. The hidden set proves it: AIMS
  Raipur, NIT Raipur, Raipur Railway and the Bilaspur Highway, i.e. precisely the marquee
  landmarks anyone would feature.
  **Fix:** two separate buttons per row (`.ax-lm-vis-grp` holding `.ax-lm-vis-yes` +
  `.ax-lm-vis-no`), which makes every click idempotent — ✓ always means show, ✕ always
  means hide, and clicking the already-active half is an explicit no-op
  (`setLandmarkFeatured` early-returns when the value wouldn't change, so it can't flip and
  can't fire a spurious save). The active half is filled, the inactive half sits at
  `opacity:.45`. This is also what the original request literally asked for — "a tick and
  cross button in front of every landmark" — two buttons, not one.
  **Also added, since curating ~24 landmarks one row at a time is the real workflow:**
  `setAllLandmarksFeatured(on)` behind **✓ Show all** / **✕ Hide all** (`#axLmShowAll`/
  `#axLmHideAll`), and a live `✓ N of M shown by default` count (`#axLmCount`) refreshed by
  `refreshLmList`. "Hide all, then ✓ the handful you want" is now both the fastest way to
  curate and the one-click recovery from having picked the wrong set. The × delete button is
  untouched in behaviour and position.
  Files: `app.js`, `index.html` (bulk row + rewritten legend), `styles.css`
  (`.ax-lm-vis-grp`/`.ax-lm-vis-yes`/`.ax-lm-vis-no`/`.ax-lm-bulk`/`.ax-lm-count`).
  **Verification:** `node --check` clean; the 11 extracted-source assertions still pass
  unchanged (the visibility engine wasn't touched); the inversion diagnosis was confirmed
  against the user's real project data rather than reasoned about. Button styling remains
  un-screenshot-able here (headless admin limitation) — needs the user's eyes.
  **Lesson worth keeping:** a state-showing toggle whose default is "on for everything"
  invites exactly this inversion. When the job is "pick the few you want" out of a
  fully-on list, give it two explicit buttons, not one that flips.

---

## 2026-09-04

- **Landmarks can now be kept out of the default view without being deleted — a
  per-landmark tick/cross in the admin list.** Projects that had grown to ~20 landmarks
  drew all of them at once in the client's default (no category picked) view, which read
  as clutter. Each landmark now carries a `featured` flag, toggled by a ✓/✕ button
  in the admin Landmarks list, and visibility is decided in one place,
  `isLandmarkShown(lm, cat)` (`app.js`, next to `isLandmarkMatchCategory`):
  - **No category picked (ALL)** → only ticked (`featured !== false`) landmarks draw.
  - **A category picked** → *every* landmark in that category draws, ticked or not — a
    category view is a deliberate, complete list, so an unticked landmark is never
    unreachable, just not shouted about up-front.
  - **Admin, Landmarks tab** → always draws everything, so an unticked landmark can still
    be found and dragged; its banner gets `.is-unfeatured` (dashed outline + faded) so it's
    obvious which ones the client holds back.
  `applyCategoryFilter`'s ALL camera framing and `renderLandmarks`' mobile density cap both
  now count the same featured set, so the camera frames what's actually on screen and
  "+N more" stays truthful.
- **The tick/cross is deliberately not a delete, and the UI says so.** The pre-existing
  × delete button stays exactly where it was; the new toggle sits immediately to its
  left with a different shape and colour (green filled ✓ when on, hollow muted ✕ when
  off), both buttons carry explicit `title`/`aria-label` text spelling out
  "does NOT delete" vs "DELETE permanently", the row itself dims and goes dashed when
  unticked, a legend block above the list explains all three states, and `setAxStatus`
  reports the new state plus a running "N of M show by default" count — warning outright
  if the last tick is removed and the default view would be empty.
- **Persistence:** `featured` round-trips through `landmarks.json`
  (`buildLandmarksData`/`parseLandmarks`), the browser session snapshot, and Export.
  **Backwards compatible:** an existing `landmarks.json` has no `featured` key, and the
  parse defaults it to `true` (`l.featured !== false`), so every current project looks
  exactly as it does today until an admin unticks something.
  Files: `app.js`, `index.html` (legend markup in `#axTabLandmarks`), `styles.css`
  (`.ax-lm-vis`, `.ax-lm-legend`, `.ax-lm-li.is-hidden-default`, `.lm-banner.is-unfeatured`).
  **Verification:** `node --check app.js` + `python -c "import ast; ast.parse(...)"` on
  `server.py` both clean; the visibility/persistence logic was unit-tested by extracting
  the real `parseLandmarks` / `buildLandmarksData` / `isLandmarkShown` sources out of
  `app.js` and running 11 assertions in Node (legacy default, `false` surviving a
  save→load round-trip, ALL hiding vs category showing, admin override) — all green.
  The visual result (button styling, dashed hidden rows) is **not** screenshot-confirmed:
  headless screenshotting of admin mode remains unreliable here (see the gotcha in
  CLAUDE.md), so the CSS is code-reasoned only and wants a look in a real browser.

---

## 2026-09-08 (fix 2) — client drawer shows only the authored menu; SW served stale config

- **Removed the hardcoded `AERIAL VIEW` and `LANDMARKS` rows** from the client drawer
  (`renderClientSidebar`). The drawer is now exactly the menu built in admin. A project
  with no authored menu shows **no drawer at all** rather than an empty panel.
  Files: `app.js`.
- **…and made both authorable instead, so the removal isn't a net loss.** 5 of 9 projects
  here have landmarks but no menu items, and the drawer row was the only **desktop** route
  into the landmark category filter (`openLandmarksCategoryPicker` is otherwise reachable
  only from the mobile overflow hint). Added two zero-configuration content types —
  **📍 Landmarks** and **🗺️ Aerial View** — dispatched from `openNodeContent`, described by
  `NO_CONFIG_CONTENT_TYPES` (which drives the wizard hint that replaces the URL/upload
  row). Any project that wants those rows back adds them in the menu builder.
  Files: `app.js`, `index.html`.
- **Service worker served STALE project config — the real reason a new menu item didn't
  appear.** `sw.js` used `staleWhileRevalidate` for everything under `/projects/`, which
  returns the *previous* copy on the first load after an admin save and only refreshes on a
  **second** reload. For an authoring tool that reads as "my change didn't save". Project
  **config** files (`.json`/`.csv`/`.svg` — a few KB each) are now **network-first with
  cache fallback**; images and media stay stale-while-revalidate (large, and already
  cache-busted by their own `_ver`). `VERSION` bumped to `v2` so an installed worker drops
  the old caches and cannot keep serving under the previous rules. Files: `sw.js`.
- Note: the `act === 'aerial'` / `act === 'landmarks'` click handlers in
  `wireClientSidebarButtons` and `wireViewControls` are now unreachable (nothing emits
  `data-act` any more). Left in place rather than removed in the same pass.

## 2026-09-08 (fix) — `panotour` menu items lost their `tourId` on save

- **`cleanNodeForSave` is a whitelist, and it silently dropped `content.tourId`.** It
  rebuilds `content` from `url` + `fileName` only (plus `images` for galleries), so every
  save of a `panotour` menu item threw the tour reference away. The item still appeared in
  the menu and simply did nothing when clicked — the worst kind of failure. Added `tourId`
  to the whitelist, with a comment marking it as a whitelist so the next content type that
  carries its own field doesn't repeat this. Files: `app.js`.
- **`openClientPanoTour` now fails loudly and recovers where it safely can.** A missing
  `tourId` with exactly one tour in the project opens that tour (no ambiguity, and it
  repairs items saved before the fix); with several tours it says which control to use
  instead of doing nothing. Files: `app.js`.
- **Repaired existing data:** `projects/pano-testamit/alignment.json`'s "3BHK" menu item
  had `content:{url:"",fileName:""}` — re-pointed at tour `t1`.
- **Not a bug, worth documenting:** `wireAdmin` hides the client nav drawer
  (`els.catDrawer.hidden = true`) whenever `?admin=1` is set, because admin has its own
  sidebar. The menu is therefore **only ever visible in the client view** — the reported
  "menu is not visible" was this, on top of the `tourId` loss above.

## 2026-09-08 (later) — tour viewer, hotspot linking, `panotour` menu type

- **Fixed: every saved tour node pano was a 15-byte `[object Object]` file.**
  `resizeImageToBlob` returns `{ blob, W, H }`, but `addTourNodeFromFile` stored the
  **wrapper** as `panoBlob`, so `serverSave` stringified it. Every node image the admin
  had uploaded was silently destroyed on save (the files existed on disk, which is why
  the earlier end-to-end check passed — it verified files were *written*, not that they
  decoded). Now unwraps `out.blob`. Repaired the three corrupt uploads in
  `projects/pano-testamit/` from the demo renders. Files: `app.js`.

- **Client tour viewer — `openClientPanoTour` (Phase 1 steps 2–5).** Ported from the
  Phase 0 spike onto this file's own conventions: reuses `loadPanoTexture` (GPU cap +
  `flipY=false` — the spike's default-flipY bug rendered panos upside down),
  `dirFromLonLat`/`projectDir` from the landmark path, and the existing pano sphere.
  Per **D-11** the tour **takes over the main viewer** rather than opening a second
  canvas: plots/drape/landmarks/amenities hide, the sphere swaps textures, and
  `closePanoTour` restores the saved view + texture exactly. Crossfade is a second
  sphere at 0.985× **sharing the pano geometry** (dispose material only, never the shared
  geometry). Heading is *carried over* between nodes; `defaultView` applies on entry only,
  so walking never spins the camera. LRU texture cache (`TOUR_CACHE_MAX = 3`) + one-hop
  neighbour prefetch, straight from the 0-A finding that download weight (~2 MB/node) and
  GPU residency (~179 MB/node) are separate problems. Tour chrome (`refreshTourBar`):
  title, room strip, exit. Files: `app.js`, `index.html` (`#tourHotspots`, `#tourBar`),
  `styles.css`.

- **Hotspot authoring (Phase 1 steps 3/1.4).** Nav hotspots are direction-anchored and
  projected each frame, exactly like landmarks. In the admin **Tour** tab, each node row
  gets a **▶ open in viewer** button; while a tour is open the tab grows a hotspot editor
  for the current room — add (drops at view centre), retarget, relabel, delete, and
  **drag onto the doorway** (`startTourHsDrag`, same raycast→`lonLatFromDir` model as
  landmark pins). Plus **⌖ Set this view as the room's start view**. Client taps route
  through `pick()` because `#pano` grabs pointer capture (the amenity-pin trap again).
  Files: `app.js`, `styles.css`.

- **New menu content type `panotour`.** Distinct from the existing `tour`, which iframes
  an **external** 3DVista/Kuula URL or uploaded file; `panotour` stores a **`tourId`**
  referencing a tour in this project's `tour.json` (D-12). Added the wizard type card
  (🧭 360° Tour), a tour picker replacing the URL/upload row (`renderWizardTourPicker`,
  which warns when a tour has no nodes or no hotspot links), save/edit round-trip via
  `wizardState.tourId`, and the `openNodeContent` branch. Files: `app.js`, `index.html`.

- **`server.py`: tour-only projects + tours in the standalone bundle.**
  `/api/projects` and `do_bundle` required a `plots.svg`, which hid tour-only projects
  entirely; both now accept `plots.svg` **or** `tour.json`. `tour.json` added to
  `BUNDLE_DATA_FILES`, and new `tour_pano_basenames()` feeds node panos into
  `build_embedded_images_json` — they are WebGL textures, so under `file://` they must be
  data: URIs like the background pano (a loose sibling file is rejected as tainted).
  Closes the Phase 1.7 bundle gap. Files: `server.py`.

- **Demo project made openable.** `projects/panotour-demo/` was spike-format
  (`{nodes, links}`) which `parseTours` reads as zero tours, and had no `alignment.json`
  → empty `menuConfig.tree` → **no menu at all on the client**, which is why the feature
  looked broken. Added `spike/seed-demo-tour.py`: converts it to the app's
  `{tours:[…]}` shape (9 rooms, 16 links, living room as hub/start) and writes an
  `alignment.json` carrying a `panotour` menu item. Hotspot directions are evenly spread,
  **not surveyed** — drag them onto real doorways in admin. Also moved the 343 MB of raw
  PNG masters into `panotour-demo/_source/`: `do_bundle` copies every **top-level** file
  into `data/`, so the masters were shipping in every export — **bundle went 392 MB →
  43.5 MB**. Files: `spike/seed-demo-tour.py` (new), `projects/panotour-demo/*`.

- **Verified:** `node --check app.js`, `python ast.parse server.py`; all new helpers /
  CSS classes / HTML ids cross-checked as defined; `/api/projects` now lists
  `panotour-demo`; client + admin URLs 200; real bundle built via the endpoint contains
  `data/tour.json`, the tour (9 nodes / 16 links) embedded in `B91_BUNDLE_FILES`, and all
  9 node panos in `B91_BUNDLE_IMAGES`; seeded tour has no dangling links.
  **Not verified in-browser** — no browser tooling in this session, so the visual result
  (crossfade, hotspot placement, takeover/restore) needs the user's eyes.

## 2026-09-03

- **A manual drag now releases the landmark category's pan arc.** Selecting a category
  frames its landmarks and confines the view to their arc (`state.landmarkPanRange`,
  enforced in `updateCamera` — the single place the view is consumed, so auto-pan, the
  fly-in AND a drag were all equally bound by it). The framing is wanted; the cage isn't:
  a visitor who deliberately drags should be able to look anywhere. Now the first real
  drag (>6px, client only) clears the range and cancels any in-flight fly-in, restoring
  free 360° look and free idle spin. The category FILTER is deliberately untouched —
  that's `state.selectedCategory`, so the chosen landmarks stay highlighted while the
  visitor looks around, and tapping a category again re-frames as before. Admin is
  unaffected (the clamp never applied there), and with no category selected the range is
  already null so this is a no-op. `app.js` only.
  **Verification honesty:** this one is code-reasoned + syntax-checked only. I tried to
  prove it by scripting the real interaction in the exported bundle (select a category,
  then dispatch a long synthetic pointer drag) and measuring the landmark banners' on-screen
  positions — but a control run with NO category selected, where no clamp exists at all,
  showed the banners equally motionless (`before/mid/after` identical). So synthetic
  `PointerEvent`s don't drive this app's pan handler in headless: the harness can't
  distinguish "clamp released" from "drag never happened", making the test worthless rather
  than reassuring. Needs a real device/browser to confirm.

- **Portrait is now GATED, not nudged — phone visitors must rotate before any content is
  shown.** Follow-up to the rotate prompt below, at the user's request: the animated screen
  is no longer a dismissible hint but a hard requirement.
  - `.rotate-hint` became `position: fixed` + fully opaque (`var(--bg)`) at `z-index: 300`,
    above every panel and modal. A translucent version would still leave the squeezed,
    unusable portrait layout visible underneath, which is the very thing this exists to
    prevent.
  - Removed BOTH dismiss paths — the ~5s auto-hide timer and the tap-to-close handler.
    Either would have dropped the visitor into the portrait layout the gate is there to
    keep them out of. The only way past it is actually turning the device.
  - Orientation detection now listens on the orientation media query, `resize`, AND
    `orientationchange` (the media query fires before the viewport settles on some mobile
    browsers, and `isMobilePortrait()` reads `window.innerWidth` — `resize` is what
    reliably catches up), with a short delay on the orientation events for the same reason.
  - Both manifests (`server.py`'s generated one and the static one bundles ship with) now
    declare `"orientation": "landscape"`, so an INSTALLED app simply opens the right way up
    and never meets the gate at all.
  - Unaffected on purpose: desktop (`isMobilePortrait()` is never true on a real desktop
    window), admin (already `!state.admin`), and tablets in portrait (>720px wide), which
    get the normal layout rather than being blocked.
  - **Verified by screenshot:** 390x844 portrait shows ONLY the rotate screen with no
    content visible behind it; 844x390 landscape and 1400x900 desktop are unchanged.
    Files: `styles.css`, `app.js`, `server.py`, `manifest.webmanifest`.

- **All three status filters on landscape phones, plus an animated rotate prompt.**
  - **Reserved and Sold joined Available.** Landscape hides the header legend, and its
    stand-in only carried "Available", so a phone visitor couldn't see or filter the other
    two statuses at all. Replaced the single `#zoomAvailableBtn` with a
    `#zoomStatusGroup` of three (`.zoom-status-btn`, ids `zoomAvailableBtn`/
    `zoomReservedBtn`/`zoomSoldBtn`), each carrying its status colour dot and live count,
    right-aligned above the zoom controls. Made them read as controls rather than labels:
    34px min tap height, a lit gold border for the pressed/on state (dimmed + grayscaled +
    struck-through count when off), and a press scale. Sync now runs through one helper,
    `syncZoomStatusButtons()` — counts from `renderLegend`, pressed-state from
    `toggleFilter` — so the chips can't drift from the header legend, and clicks are wired
    generically off each button's `data-status`.
  - **Animated "rotate your phone" prompt** replaces the plain text toast, which was easy
    to miss and didn't communicate the ask as directly as motion does. New `#rotateHint`
    overlay: dimmed blurred backdrop, a gold phone outline that turns 0deg → -90deg on a
    2.6s loop with a hold at each end (a continuous spin reads as a loading spinner rather
    than an instruction), a curved arrow, and the line "Rotate your phone / The map opens up
    in landscape". Auto-clears after ~5s, and clears instantly on tap or as soon as the
    device is actually turned (rotating INTO landscape means the hint was obeyed — leaving
    it covering the view they just asked for would be perverse). Honours
    `prefers-reduced-motion` by showing the end state without animating. Not persisted as
    dismissed-forever on purpose: it's a momentary nudge, and someone who rotates back to
    portrait later is in the same situation again.
  - **Verified by screenshot** (bundle-export/`file://`): 844x390 shows all three chips
    colour-coded and right-aligned; 390x844 shows the rotate overlay rendering correctly;
    1400x900 desktop unchanged — legend still in the top bar, no floating chips, no overlay.
    Files: `index.html`, `styles.css`, `app.js`.

- **Collapsed drawer's arrow pointed the wrong way — two fixes cancelling each other out.**
  `app.js` already swaps the glyph (`‹` ⇄ `›`) in both the toggle handler and the portrait
  auto-collapse, and `styles.css` ALSO rotated `.cat-toggle-ico` 180° for `.is-collapsed`.
  Applied together they undo one another, so a collapsed drawer showed a left-pointing
  ("close") arrow when it was already closed and should have been inviting the visitor to
  open it rightwards. Removed the CSS rotation, leaving the JS glyph swap as the single
  source of truth (comment left in its place so it isn't reintroduced). Verified by
  screenshot: collapsed portrait now shows `›` docked at the left edge, open landscape
  still shows `‹`. `styles.css` only.

- **Home-screen icon is now the ADMIN'S logo, and the phone menu leads with the project's
  branding.** Two related asks, with a reference screenshot for the menu layout.
  - **Per-project PWA identity.** The manifest was static, so every project installed as a
    generic "Build91" icon. A manifest is static JSON by nature, so the per-project version
    has to be server-generated: new `GET /manifest.webmanifest?project=<id>` in server.py
    emits the admin's brand name/tagline and icons built from their logo, and
    `setupPwaIdentity()` (app.js, runs during module eval, before the browser evaluates
    installability) appends the current `?project=` to the `<link rel="manifest">` and the
    apple-touch-icon. New `GET /api/pwa-icon-{192,512,512m}.png?project=<id>` letterboxes
    the logo onto a square canvas at the required size (home-screen icons must be square
    and >=192px or the site isn't considered installable, and a logo is rarely either); the
    maskable variant gets extra padding since the OS crops it to its own shape. Results are
    cached beside the project as `.pwa-icon-*.png`, regenerated when the logo is newer.
    Pillow is an OPTIONAL import (`_pillow_ok()`) — this server is stdlib-only by design,
    and without it, or without a project logo, it falls back to the bundled B91 icons.
    Verified: the manifest for `sample` returns the admin's "ANDAMAN - ELEGANZA" naming, and
    the generated 192px icon is a correct square rendering of their actual logo.
  - **Drawer branding on phones.** The drawer had no branding at all; the logo lived only in
    the top bar, which is squeezed in portrait and hidden outright in landscape — so on a
    phone the visitor never saw whose site it was. Added `.cat-drawer-brand` (populated by
    `applyBrand`, so it can't drift from the top bar's version), shown ONLY on phones:
    stacked and centered in portrait, and a compact grid in landscape (logo spanning both
    text lines) where vertical space is scarce. Menu rows were tightened at the same time so
    the whole menu fits without scrolling — an item below the fold is effectively missing
    when the drawer is the only navigation. When a logo image loads, the name/tagline text
    is suppressed (`has-logo`), since a logo almost always contains the wordmark already —
    it was otherwise printed twice.
  - **Cascade gotcha hit again en route:** these mobile overrides sit ~line 790 while the
    drawer's base rules are at ~1030+, and a media query adds no specificity — so the later
    base rules silently won and the whole block did nothing (the first screenshot showed no
    branding and untightened rows). Fixed by scoping each override with `.cat-drawer`.
    Caught only because it was screenshotted; worth remembering that "the CSS is in the file"
    is not evidence it applies.
  - **Verified by screenshot** (bundle-export/`file://` route) at 844x390 landscape, 390x844
    portrait, and 1400x900 desktop: branding renders correctly in both phone orientations
    with every menu item visible and no scrollbar, and desktop is unchanged (no drawer
    branding, original spacing). Files: `server.py`, `app.js`, `index.html`, `styles.css`.

- **Landmark/amenity labels no longer cling to the screen edges — out-of-view markers now
  simply leave view.** User screenshot showed several "New landmark" banners stacked
  against the right edge (and one half-cut on the left), tracking along while panning.
  Cause: both renderers clamped the label's x into the viewport so it could never be cut
  off (`Math.max(halfW+margin, Math.min(W-halfW-margin, x))` in `renderLandmarks`, and the
  equivalent `translateX(calc(-50% + Npx))` chip nudge in `renderAmenities`). Reasonable in
  isolation, but it meant everything currently off-frame piled up on the sides instead of
  being out of shot. Removed both clamps: markers now sit at their true projected position,
  and one whose label wouldn't fit fully is hidden rather than shown clipped — so it
  disappears cleanly at the edge instead of sliding along it. Per the user: "if they are out
  of scope let them be".
  **Verified by screenshot** via the bundle-export/`file://` route (the reliable one for
  rendering work): at 760px the banners now sit spread at their real positions with no edge
  stack, and at 390px (phone portrait) three show, none clipped, none crowding the sides.
  Note the banner still partly hidden behind the open category drawer on desktop is
  unrelated and pre-existing — the drawer is an overlay on top of the pano, not a column
  beside it. `app.js` only.

- **Contact-card photo was never pre-downloaded — found from a precise user observation.**
  Reported symptom: opening the installed shortcut in airplane mode, SOME images were
  missing; turning the net on loaded them; afterwards they worked offline too. That
  sequence is diagnostic — it means those files were absent from the pre-download list but
  got cached as a side effect of being viewed online (the runtime stale-while-revalidate
  path), i.e. a gap in `collectOfflineAssets`, not a caching failure and NOT (as the user
  reasonably wondered) an inherent "needs net on first open" behaviour.
  Root cause: the menu walk handled `parent` and `child` nodes and skipped everything else,
  but the Contact card is its own node kind (`kind: 'contact'`) whose photo lives at
  `node.contact.image`, outside the `content` object the walk inspects. Now collected,
  resolved via `assetUrl(c.image)` exactly as `openClientContactModal` does so the cache
  key matches what the viewer requests. Also hardened two adjacent cases the viewers accept
  but the collector ignored: a local path stored in `content.url` instead of `content.fileName`,
  and the same for a gallery entry's `url`.
  **Verified by replaying the collector's logic in Node against the real committed project
  files:** 22 items collected (was 21), contact photo present, every collected path exists
  on disk, totalling 142.3MB — note that's less than the 252MB folder, because `sample`
  contains 7 videos of which only 4 are actually linked in the menu.
  Checked and found NOT affected: landmark/amenity renders (`parseLandmarks`/`parseAmenities`
  unwrap `render.file` to a string, which `renderSrc` handles) and plot media (the two refs
  in this project's `plots.csv` are genuinely external `http(s)` links, correctly excluded).

- **Install prompt stopped producing a home-screen shortcut — caused by the auto-reload
  added earlier the same day.** `clients.claim()` fires `controllerchange` on a FIRST
  visit too (no previous controller), not just when a new worker replaces an old one — so
  every fresh visit reloaded itself mid-boot, and that reload discarded the captured
  `beforeinstallprompt` event. Tapping Add then downloaded the content but silently did
  nothing about installing, because there was no prompt left to fire. Guarded the reload on
  `hadControllerAtLoad` so it only runs for a genuine update. Also: `prompt()` is only
  valid inside the originating tap, so it can't be deferred or retried — when no install
  event is available, the flow now says where the manual control is (menu ⋮ → Install app,
  or Share → Add to Home Screen on iOS) instead of skipping it silently. `app.js` only.
- **Page navigation is no longer network-first without a deadline.** Asked whether a
  first offline open has to wait on resources: it doesn't (everything is served locally),
  but the navigation handler awaited the network and only fell back to cache on failure —
  fine when fully offline (fails instantly) yet potentially many seconds on a WEAK signal,
  which is the worse case for an app whose promise is "opens instantly". Now, when a
  cached copy exists, the network gets a 2.5s head start (so an online visit still picks up
  the latest) and the cached copy wins if it doesn't answer in time; the network attempt
  continues regardless and refreshes the cache for next launch. First-ever visit (nothing
  cached) is unchanged. `sw.js` only.
  Worth recording from the same investigation: startup cost is dominated by IMAGE DECODE,
  not networking — `sample` carries a 4.9MB pano JPEG plus a **20.9MB** site-plan PNG, both
  decoded, downscaled to the GPU texture cap and uploaded on every launch, cached or not.
  Recompressing that PNG is the single biggest available startup win. (Whole project: 252MB,
  of which ~161MB is video — relevant to the storage-quota entry below.)

- **Actually attack the storage ceiling rather than just report it — request persistent
  storage, and warn before downloading if the project can't fit.** Follow-up to the entry
  below, after the user (emphatically) restated that EVERYTHING — video, images, PDF —
  must be available offline. Nothing about what gets downloaded changed; what changed is
  the chance it survives:
  - `requestPersistentStorage()` calls `navigator.storage.persist()` from inside the Add
    tap (browsers are more willing to grant it during a user gesture). This is the API
    that lifts the two limits that would otherwise truncate a video-heavy project: the
    data becomes exempt from eviction under storage pressure, and Chromium grants a much
    larger quota than the default best-effort allowance. No-op where unsupported.
  - `storageHeadroom()` (`navigator.storage.estimate()`) is checked BEFORE the prompt
    commits: if the project is larger than the free space, the banner says so up front
    ("may exceed this phone's free space (X left)") instead of letting the visitor sit
    through a download that gets silently cut off at the quota.
  - The partial-save message now distinguishes causes — `"N/M saved — phone storage full"`
    vs plain `"N/M saved"` — because those need different responses (free up space or trim
    the project, vs. just retry on a better connection).
  - Note for the real rollout: iOS Safari is the tight one, and its allowance is
    materially larger once the site is installed to the Home Screen — which the combined
    prompt already encourages in the same tap.

- **"Downloaded" now means "verified present in the cache", not "the bytes came down"
  — closing a silent-failure gap that video is the most likely thing to hit.** Prompted by
  the user asking whether video actually gets cached on phones. It does by design (video is
  collected, sized, fetched unranged so the WHOLE file is stored, and served back through
  `respondVideo`'s byte-range slicing so offline seeking works) — but the honesty of the
  "Done" message still rested on an assumption: that `cache.put()` in `sw.js` succeeded.
  It can reject on its own, most plausibly on a per-origin **storage quota**, which video
  is exactly what blows past (mobile browsers cap this; iOS Safari tightly). Those writes
  happen in the worker, detached from the response the page sees, so a quota failure was
  invisible to the download loop and would have been reported as success — the same false
  "Done" this flow already got burned by once, just one layer deeper.
  - New `verifyCachedItems()` (app.js): after the fetch loop, asks Cache Storage directly
    (the page shares it with the worker) which items are actually there, matching the same
    query-stripped keys `sw.js` writes. Anything missing counts toward the `"N/M saved"`
    total and blocks the per-project "saved" flag, so a quota-truncated save re-offers
    instead of claiming success.
  - `sw.js`: every `cache.put()` now has a `.catch()` — previously a rejection became an
    unhandled promise rejection that no surrounding `catch` could see.
  - Still unverified on a real device: whether the videos in this project actually fit
    within the phone's quota, and the byte-range playback path itself (`respondVideo`/
    `sliceRange`) under a real seek/replay.

- **Android has no inline PDF viewer at all — added a JS-rendered brochure viewer
  (pdf.js) for that platform.** The previous fix (open the PDF via a direct top-level
  navigation instead of an iframe) was based on the assumption that Chrome's built-in PDF
  viewer would take over on a real navigation. Real-device retest disproved it: Android
  showed its "Download file again? File name already exists" dialog instead — i.e. it
  downloads PDFs rather than displaying them, in an iframe AND on direct navigation.
  Confirmed the server isn't at fault (`Content-type: application/pdf`, no
  `Content-Disposition`, and the same file previews fine on iOS), so this is simply a
  missing browser capability (Chrome for Android only gained an inline PDF viewer in
  fairly recent versions). Nothing at the URL/markup level can work around that, so
  Android now renders the pages itself:
  - Vendored **pdf.js 3.11.174** (`vendor/pdf.min.js` + `vendor/pdf.worker.min.js`,
    ~1.4MB). v3 deliberately, not v4 — v4 relies on `Promise.withResolvers` and similar
    modern syntax that the older Android builds this exists to serve don't have.
  - `loadPdfJs()` injects it as a classic `<script>` on demand (it's a UMD build defining
    `window.pdfjsLib`; app.js is an ES module and can't `import` it) — only loaded when a
    brochure is actually opened on Android, never on other platforms.
  - `renderPdfInto()` draws pages sequentially into stacked canvases in the existing
    brochure modal (new `#clientBrochureCanvas` container + `.brochure-canvas` styles);
    sequential rather than parallel so a long brochure doesn't spike memory on exactly the
    low-end devices that need this path. iOS/desktop keep the native iframe viewer, which
    is the better experience (real text selection, pinch-zoom) where it actually works.
  - **Fail-safe:** a hang is not a rejection, so a `.catch` alone couldn't prevent a
    visitor being stranded on "Loading brochure…". Page 1 painting races a 12s deadline;
    if the deadline wins, the render is abandoned (`shouldStop`) and the PDF is handed to
    the phone's own handling — a download, not a preview, but never a dead end.
  - Both pdf.js files added to `sw.js`'s `SHELL_URLS` so they're precached — a visitor may
    well open the brochure for the first time only after going offline.
  - Canvases are dropped in `closeCustomModal` (they can be tens of MB on a long brochure).
  - **Verified as far as this environment allows:** pdf.js API loads (`pdfjsLib.version`
    reported 3.11.174), its worker spawns and replies `action: "ready"`, a plain `fetch` of
    the same PDF returns all 115,685 bytes, and a generic Worker round-trips — but
    `getDocument().promise` never settles under headless `--virtual-time-budget`, which
    deadlocks on pdf.js's multi-step worker handshake (the same class of headless async
    stall seen repeatedly this session, and the reason the fail-safe above matters
    regardless). The rendering itself still needs a real-device confirmation.

- **Brochure PDF still showed as a broken "tap Open" card on Android after the caching
  fixes above — turned out to be a completely different, pre-existing bug, unrelated to
  offline caching at all.** User re-tested and saw the exact same card; a targeted
  question narrowed it down: it happens the same way even ONLINE, before airplane mode —
  meaning it was never a cache-miss issue. Root cause: Android Chrome frequently refuses
  to render a PDF inline inside an `<iframe>` (how the Brochure viewer displays it) and
  downloads it instead, showing exactly this native "file downloaded, tap Open" card — a
  known, longstanding platform limitation, not something fixable by changing what's
  cached or how. A direct top-level navigation to the same PDF URL reliably uses Chrome's
  built-in PDF viewer instead, so `openClientBrochureModal` now detects Android
  (`/Android/i.test(navigator.userAgent)`) and opens the PDF with `window.open(src,
  '_blank')` instead of populating the modal's iframe. This still works offline: a new tab
  is a top-level navigation, same as any other, so `sw.js`'s existing project-asset
  navigation routing (see the earlier entry today) serves it from cache exactly the same
  way. Not applied to iOS/desktop — no evidence of the same iframe limitation there (the
  iPhone's earlier failure was a genuine cache-miss, a different bug, already fixed), and
  the in-app modal is the nicer experience where it actually works. `app.js` only.

- **Merged the two separate prompts (content download, then a plain install offer) into
  ONE combined "Add to Home Screen" banner, per explicit user request.** The user noticed
  Android's own native install popup shows its own "Installing…" progress after tapping
  Add, and asked why our download-with-progress step wasn't just folded into that same
  action — discussed and confirmed: the native prompt only builds the app-icon wrapper (it
  has no idea what a "gallery photo" is), the content download is the only thing that
  makes the site actually usable offline, so they're unrelated jobs but were needlessly
  presented as two separate user actions.
  - `#offlineSaveBanner` is now the ONLY banner — `#installBanner` and its dedicated
    functions (`maybeShowInstallBanner`, `hideInstallBanner`, `maybeShowIosInstallTip`)
    are removed, along with the CSS/markup that went with them.
  - The single `Add` button now does both jobs at once, neither blocking the other: calls
    `deferredInstallPrompt.prompt()` (native install dialog, where available — fire-and-
    forget, its `userChoice` isn't awaited) AND starts `runOfflineDownload` in the same
    click handler. Size/consent is still shown up front before the tap (per the earlier
    "ask first" decision — unchanged), but it's one action from there, not two.
  - `beforeinstallprompt`'s top-level listener now only captures the event
    (`deferredInstallPrompt = e`) — it no longer independently triggers any banner itself,
    closing the exact bypass-the-mobile-gate hole from the last entry (there's now only
    one place, `maybeOfferOfflineSave`, that ever shows anything, and it's only ever
    called from the already-mobile-gated `registerOfflineSupport`).
  - iOS Safari (no `beforeinstallprompt`, ever) gets the same banner and the same "Add"
    button, which still starts the content download — the sub-text additionally says
    "tap Share → Add to Home Screen after" for the one part that genuinely can't be
    automated on iOS (Apple gives web pages no API for it at all).
  - New `isIosSafari()` helper (extracted from the old `maybeShowIosInstallTip`, reused
    for the "is there any install path at all" check that decides whether to show the
    banner when a project happens to have zero local assets to cache).
  - Files: `app.js` (the bulk of it), `index.html` (retired `#installBanner` markup, added
    `id="offlineSaveTitle"` so the merged banner's heading can be set dynamically),
    `styles.css` (retired `.install-banner*` rules).

- **"Save for offline" reported 100%/Done while a PDF (and possibly others) had actually
  failed to cache — real bug, caught via real-device testing on both iPhone and Android
  showing the same failure.** `runOfflineDownload`'s per-item `catch` swallowed any
  fetch failure and still called `bump()` to keep the progress bar moving ("best-effort,
  not all-or-nothing" — reasonable intent, wrong execution): a failed request counted
  identically to a real success, so "Done" could mean either. Worse, the code also never
  checked `res.ok` on a "successful" fetch — sw.js's own synthetic `503 Offline` fallback
  response (if something failed further upstream) would have been silently treated as the
  real file and cached/counted as done. And regardless of outcome, the project always got
  marked `b91-offline-saved-<id>` = saved, permanently suppressing the prompt on any later
  visit — so even a fully failed run gave no way to retry.
  Fixed: `fetchOnce()` now throws on a non-OK response, not just a network error; each
  item gets one retry (today's demo tunnel — a free `cloudflared` quick tunnel — has
  already dropped requests under concurrent load, so a transient failure is a real,
  expected case, not hypothetical); failures are collected in a `failed[]` array instead
  of being discarded, `bump()` still runs on a final failure so the bar reaches 100%
  rather than stalling, but the closing state is honest about it (`"N/M saved"` instead of
  `"Done"`), and the `b91-offline-saved-<id>` flag is only set when `failed.length === 0`
  — a partial save leaves the prompt available again on the next visit instead of
  declaring false victory. Also lowered download concurrency (3 → 2) and sorted the queue
  so images/PDF go before video, on the theory that a constrained/flaky connection is more
  likely to sustain several small transfers than several concurrent large ones — the
  cheap items are what a partial failure should cost, not the video. `app.js` only.

- **Desktop mobile-gate follow-up: banner still showed on desktop even after the same-day
  gate above, because the gate lived in the wrong place.** User reloaded on desktop and
  still saw "Add to Home Screen." Root cause: `registerOfflineSupport()`'s mobile gate only
  stops *registration* from happening on new visits — it doesn't touch two things that
  bypass it entirely: (1) `maybeShowInstallBanner()` itself had no device check of its own,
  and is called directly by the top-level `beforeinstallprompt` listener, completely
  independent of `registerOfflineSupport()`; (2) a browser that had already registered
  `sw.js` on an earlier visit (before the mobile gate existed) keeps satisfying the
  browser's own install-eligibility check on every later visit regardless of what the gate
  now prevents going forward. Fixed both: `maybeShowInstallBanner()` now checks
  `isMobilePortrait() || isMobileLandscape()` directly (the actual display gate, not just
  the registration one — this is the fix that matters, since it blocks the banner
  regardless of which code path tries to trigger it), and `registerOfflineSupport()`'s
  desktop branch now actively `unregister()`s any existing service worker + deletes this
  app's caches instead of just returning, so a browser that tested this before the gate
  existed actually reverts instead of staying stuck. `app.js` only. A desktop tab that
  already has the old banner open needs one reload to pick this up.

- **"Add to Home Screen" banner never actually disappeared after Add/✕, and offered on
  desktop too (both caught by the user via real-device testing).**
  - **CSS bug:** `.install-banner { display: flex; ... }` was unconditional — same
    specificity as the UA stylesheet's `[hidden]{display:none}`, and later in cascade
    order, so it silently won every time `hideInstallBanner()` set `.hidden = true`. The
    banner stayed visibly on screen no matter what was tapped. Fixed with an explicit
    `.install-banner[hidden] { display: none; }` override (verified directly via an
    isolated test page — before the fix `getComputedStyle(...).display` read `flex` with
    the `hidden` attribute present; after, it correctly reads `none`). Added the same
    explicit `[hidden]` rule to `.offline-save-banner` defensively, even though it isn't
    actually affected today (no unconditional `display` of its own) — so it can't regress
    the same way later.
  - **Desktop scope bug:** the whole offline layer (service worker registration + both
    banners) had no device gating at all — it ran for any client page load, desktop
    included, even though desktop already has a real offline mechanism (⋯ → Export
    standalone site…) that this PWA layer was always meant to be a phone-only alternative
    to (see the Mobile Offline Rollout doc — this was scoped as mobile-only from the start
    of that discussion, it just hadn't been enforced in code yet). Fixed by gating
    `registerOfflineSupport()` on `isMobilePortrait() || isMobileLandscape()` — the same
    width+orientation checks the rest of the mobile-responsive pass already uses, already
    tuned to exclude a resized desktop window. On desktop this now means the service
    worker is never registered at all, so neither banner nor the offline cache applies —
    unchanged from before this whole initiative started. A desktop browser that already
    registered the worker on an earlier visit (before this fix shipped) keeps its existing
    registration; not actively unregistered (low-probability edge case, not worth the
    complexity of a cleanup path for something this new).
  - Files: `styles.css` (the two `[hidden]` rules), `app.js` (the mobile gate + its comment
    in `registerOfflineSupport`).

- **Brochure PDF served the entire app shell instead of the PDF, offline (real bug, found
  via real-device testing on the temporary tunnel demo).** The Brochure viewer loads its
  PDF into an `<iframe>` (`openClientBrochureModal`, app.js), and a browser treats an
  iframe's `src` load as a navigation — same `mode: 'navigate'` as the actual page. `sw.js`
  had one rule for every navigation: on a network failure, fall back to the cached app
  shell (`index.html`) — correct for reopening the app itself, but this meant an uncached
  PDF, offline, fell back to serving the **whole raw app shell** inside the little brochure
  iframe (unstyled `index.html` markup, confirmed from the user's screenshot). Fixed by
  routing project-asset navigations (path includes `/projects/` or `/data/`) through the
  same data-cache path as any other asset *before* the real-page-navigation branch, so a
  PDF is now cached/served like the file it is — not treated as a page load. `sw.js` only.
- **Eager "Save for offline" download — photos, PDF, and video, with a consent prompt and
  a real progress UI (user request, after testing showed gallery images/video/PDF weren't
  available offline unless each one had specifically been opened while online first).**
  Previously every non-shell asset was cache-on-view only (by design, mirroring video's
  intentional "cache only when actually played" behavior) — reasonable for video's size,
  but meant a buyer had to manually click through every photo and PDF before losing signal
  for a complete offline experience, which isn't realistic for a real demo. The user asked
  for everything to download automatically — but explicitly gated behind a size-and-consent
  prompt rather than starting silently, since eagerly pulling potentially hundreds of MB of
  video the instant the page loads could be an unwelcome, unannounced hit on a buyer's data
  plan (see the two-question discussion this session: broaden caching → recommended; ask
  first vs. auto-start → "ask first" recommended and chosen).
  - New: `collectOfflineAssets()` (app.js) walks `state.menuConfig.tree` (mirrors
    server.py's `scan_menu_for_online_content`'s walk of the same shape, but collecting
    local files instead of flagging external ones) plus `state.landmarks`/`state.amenities`
    render images, the pano, the site-plan, and the brand logo — collecting every same-
    origin (i.e. actually cacheable) asset URL for the current project. Plot-level media
    (`getPlotMediaList`) is deliberately NOT walked — those URLs are always meant to point
    out to an externally-hosted tour/video by design, so they'd be filtered out as external
    anyway. `estimateOfflineSize()` HEAD-requests each URL (real network request, bypasses
    the service worker since it only intercepts GET) to sum a total byte count without
    downloading anything yet.
  - New UI: `#offlineSaveBanner` (index.html) — a "Save for offline? · approx. XXX MB ·
    [Not now] [Download]" prompt that, on Download, morphs into a progress bar with a live
    percentage and a rolling ETA (`runOfflineDownload`, tracked via
    `Response.body.getReader()` byte counts, not just a file-count proxy). Shown once per
    project per browser — `localStorage` (`b91-offline-saved-<projectId>` /
    `b91-offline-declined-<projectId>`) suppresses re-asking on a later visit, mirroring
    the install banner's own existing dismiss pattern. Runs *before* the install banner in
    `registerOfflineSupport()` (chained, not simultaneous) so the two prompts don't stack.
    The actual downloads are plain `fetch()` calls with limited concurrency (3 at a time);
    no new caching code was needed in app.js — each fetch is transparently intercepted and
    stored by `sw.js`'s existing stale-while-revalidate (images/PDF) and `respondVideo`
    (video, unranged full-file GET → cached as the complete file) logic, exactly the same
    as if the user had opened that item themselves.
  - `registerOfflineSupport()` also hardened: `navigator.serviceWorker.ready` is now raced
    against a 5s timeout (`Promise.race`) rather than awaited unconditionally, so a stalled
    activation (flaky connection, or another open tab pinning an older worker) can't wedge
    the rest of boot — it now falls through to the install offer alone instead of hanging.
  - **Verification limits, stated plainly:** this could not be visually confirmed in this
    session. The live-server headless-screenshot method hit this project's own
    already-documented pano-texture-loading hang under headless — every single capture
    attempt (multiple virtual-time-budgets up to 20s, both before and after the
    `serviceWorker.ready` timeout fix) stopped at "Loading…" well before `init()` reaches
    `registerOfflineSupport()`, while the "Add to Home Screen" banner that WAS visible in
    those captures comes from a fully independent `beforeinstallprompt` listener — its
    presence says nothing about whether this new code ran. The bundle-export screenshot
    method (this project's usual reliable fallback) can't test this feature at all either:
    it forces `file://`, where service workers can't register and `fetch()` is blocked, so
    the feature is structurally inapplicable there. What WAS verified directly: `node
    --check` on both files; the real `sample` project's committed `alignment.json` genuinely
    has 17 local, cacheable assets (9 images, 4 PDFs, 4 videos) confirming the collector
    has real content to find, not an empty list; and a careful manual trace of every code
    path against the actual data shapes in this project. Needs a real-device pass over the
    tunnel before this is called solid.

## 2026-09-02


- **Added [VIRTUAL-TOUR.md](VIRTUAL-TOUR.md) — living plan for a multi-node panoramic
  virtual tour with hotspot navigation + WebXR.** Planning only; **no code written**.
  Captures a requirements Q&A with the product owner: replace 3DVista with our own tour
  engine (L1), panos are **3D renders** interior + exterior (L2), glide-through-space
  transition preferred (L4), WebXR on Quest with mono acceptable (L5/L6). Key technical
  finding: because the panos are rendered rather than photographed, a **depth pass** comes
  essentially free, which makes a real-parallax "glide" transition achievable by displacing
  a sphere mesh into a depth proxy — no photogrammetry or mesh reconstruction needed.
  Key tension logged: **eyeballed node placement (L3) is incompatible with the glide**,
  since depth warping needs the true inter-node translation vector (decision D-1,
  recommending the 3D scene's camera transforms be exported instead). Structure: locked
  decisions, a separate **Open Questions** table (external unknowns, OQ-1..7) and a
  separate **Decisions to be made** table (engineering choices with recommendations,
  D-1..9), a **render pipeline contract** flagged as the project's largest risk (radial vs
  planar depth, units, camera manifest), then Phases 0–5 with checkboxes — Phase 0 being a
  deliberately throwaway validation spike that proves the depth warp on two real adjacent
  interior nodes before any product is built around it. Doc carries a Progress Log to be
  appended each session. Files: `VIRTUAL-TOUR.md` (new), `CLAUDE.md` (planning-docs pointer
  in the header, new "Current status" entry).


- **Client offline layer (PWA) — minimal service worker + manifest + install prompt,
  built to demo mobile offline over a temporary tunnel while the real hosting decision
  (see the "Mobile Offline Rollout" doc) is still pending with the boss.** Client-only,
  same restriction as everywhere else in this initiative: a service worker can only
  register on a secure context (`https://` or `localhost`) — verified directly again this
  session (same "URL protocol... not supported" error as before) — so being on the same
  LAN as the boss doesn't by itself make a phone demo possible; a temporary HTTPS tunnel
  (e.g. `cloudflared` quick tunnel) in front of the already-running `server.py` is still
  needed for the live demo, not yet set up (no tunnel tool installed on this machine yet).
  New files: **`sw.js`** (root-scoped service worker — see its own header comment for the
  full design), **`manifest.webmanifest`** (static, generic branding — intentionally not
  per-project; see rationale below), **`icons/icon-192.png`**, **`icons/icon-512.png`**,
  **`icons/icon-512-maskable.png`** (generated via Pillow to match the existing
  `.brand-mark` gold-gradient "B91" look, not hand-drawn).
  - **Cache design (`sw.js`):** three caches — shell (app.js/styles.css/vendor/three.module.js/
    manifest/icons, precached on `install`), data (`projects/<id>/*.json|csv|svg` +
    pano/plan/amenity images, cached opportunistically on first request), media (video,
    cached only once actually requested — i.e. only after a buyer opens a video, since
    `<video>` in the client viewer never gets a `src` until `openClientVideoModal` sets one
    — see **Conventions & gotchas** for why this needed byte-range handling). Data/shell
    keys strip the cache-busting `?t=`/`?v=` query app.js always appends (`dataUrl`/
    `assetUrl`) before using the URL as a Cache Storage key, then stale-while-revalidate:
    serve the cached copy immediately, refresh it in the background from a real network
    fetch (which still carries the fresh cache-busting query) — otherwise every reload's
    unique query would be a cache miss, defeating the cache entirely.
  - **Admin is explicitly out of scope, twice over:** `registerOfflineSupport()` (app.js,
    called at the end of the successful boot path) never runs at all when `state.admin` is
    true, so a service worker is never even installed from an admin browser session in the
    first place. As a second, independent guard — since a worker's scope is the whole
    origin by default and could in principle already be installed in the same browser from
    an earlier client visit — `sw.js`'s own fetch handler checks for `admin=1` on every
    request (the navigated document's URL, or via `clients.get(event.clientId)` for
    subresource fetches from an already-open admin tab) and always falls through to a
    plain network fetch, untouched, when it finds it.
  - **Install prompt:** a small dismissible banner (`#installBanner`, new markup in
    index.html + `.install-banner*` styles.css rules) appears once `beforeinstallprompt`
    fires (Chrome/Edge/Android) with a working "Add" button, or — since iOS Safari never
    fires that event — swaps to manual "Tap Share → Add to Home Screen" instructions
    there instead (`maybeShowIosInstallTip`, UA-sniffed). Dismissal and installed-state
    are remembered in localStorage (`b91-pwa-dismissed`/`b91-pwa-installed`) so it doesn't
    nag on every visit.
  - **`manifest.webmanifest` is static/generic on purpose, not per-project:** its
    `start_url` can't dynamically reflect whichever `?project=<id>` the buyer was
    browsing when they tapped "Add to Home Screen" without a server-generated manifest
    route (a real web manifest file is static JSON, not templated per request) — skipped
    for now since the actual planned rollout (per the Mobile Offline Rollout doc) hosts
    each project as its own standalone bundle export at its own URL, which has no
    multi-project ambiguity to begin with; this only matters for today's throwaway
    same-server demo, where it's an acceptable footnote, not a blocker.
  - `server.py`: registered `.webmanifest` → `application/manifest+json` in the
    `mimetypes` module at import time (Python doesn't know this extension by default,
    which would otherwise serve it as `application/octet-stream`); no other server changes
    — `sw.js`/`manifest.webmanifest`/`icons/*` are served automatically by the existing
    static file handler, same as any other file in the project root.
  - **Verified:** `node --check` on `sw.js` and (with its one ES `import` line stripped,
    same trick the bundle export's own syntax-check precedent uses) `app.js`; `sw.js`/
    `manifest.webmanifest`/`icons/*.png` all served with 200 + correct Content-Type over
    `http://localhost:8731`; `beforeinstallprompt` fired on the real client page (Edge
    headless, fresh profile) — since Chrome only offers that once it's confirmed a valid
    manifest AND an active, fetch-handling service worker, this is real (not just
    code-reasoned) confirmation that registration succeeds end-to-end; a live screenshot
    of the client page shows the install banner rendered correctly, styled on-brand, not
    obstructing the zoom-controls column. **Not verified:** actual offline behavior after
    a real network cutoff (needs the tunnel + a real device, not yet done), and video
    byte-range caching specifically (`respondVideo`/`sliceRange` in sw.js) — implemented
    per documented `<video>` Range-request behavior but not exercised against a real
    seek/replay yet. Admin-mode regression could not be visually confirmed this session —
    hit the same live-server headless-screenshot unreliability already on record in this
    file (dynamic `import()` + `--virtual-time-budget` don't compose reliably; one capture
    mid-load showed the pre-JS DOM state, looking identical for both `?admin=1` and plain
    client URLs) — but a direct isolated check confirmed `state.admin` itself parses
    correctly from `?admin=1` (unaffected by this change, and nothing added here touches
    `wireAdmin()`/admin-detection logic), so this is treated as the same known testing
    limitation, not a new regression.

- **Landscape zoom-controls column misaligned — Available pill vs. icon row.** User
  screenshotted the landscape client and pointed out the alignment/margin looked off:
  the `.zoom-controls` column (Available pill + `#`/📍/🏛️/+/−/⊡ icon buttons) is a
  `flex-direction: column` stack with no `align-items` set, so it defaulted to
  flex-start (left). Every other child is the same 38px `.btn-icon` square, so this was
  invisible everywhere else — but the landscape-only Available pill (icon+label+count)
  is wider, and the container sizes itself to its widest child while staying pinned via
  `right: 16px`. Net effect: the pill's right edge sat at the intended 16px margin, but
  the narrower icon squares below it left-aligned to the pill's *left* edge instead,
  landing well short of that same right margin — the ragged, inconsistent column the
  user saw. Root-caused via reading the CSS (no JS involved) and fixed by adding
  `align-items: flex-end` to `.zoom-controls`, scoped inside the existing
  `body:not(.is-admin)` block of the landscape-only media query
  (`@media (orientation: landscape) and (max-height: 500px)`) so desktop and admin are
  untouched; also tightened the pill's padding slightly and nudged the container's
  right/bottom margin and item gap in for a cleaner fit on a short screen. Verified via
  the bundle-export screenshot workaround at 844×390 on the `sample` project — pill and
  icon column now share one right edge. `styles.css` only.

- **Mobile responsiveness pass — portrait fixes plus new orientation-aware landscape
  handling.** User asked for both client and admin to work well on phones; this entry
  covers the client-side work, verified via the bundle-export screenshot workaround (see
  **Conventions & gotchas**) at three viewports on the real `sample` project (which has
  exactly 12 landmarks): 390×844 (portrait), 844×390 (landscape), 1400×900 (desktop).

  **Portrait fixes:**
  - `.cat-drawer` now defaults to `is-collapsed` at boot on narrow portrait screens
    (`wireViewControls`, app.js) instead of covering ~64% of the screen before the visitor
    has even seen the panorama; desktop unchanged. Since `.cat-drawer-toggle` is a DOM
    child of `.cat-drawer`, added a counter-transform
    (`.cat-drawer.is-collapsed .cat-drawer-toggle`) so it stays visible/tappable when
    collapsed. `.cat-drawer`'s width changed from `width:250px;max-width:82vw` to
    `width:min(250px,82vw)` (identical result) so the counter-transform can reference the
    same expression.
  - `renderLandmarks()`/`renderAmenities()` (app.js) clamp each label's horizontal
    position to stay fully on-screen instead of running off the edge — the landmark
    connector line's endpoint moves with the clamp so it still visually reaches the
    banner; the amenity fix nudges just the `.am-chip` (an extra offset on top of its
    existing `translateX(-50%)`), leaving the pin exactly on its true hotspot.
  - New `LANDMARK_MOBILE_CAP = 6` (app.js): when more landmarks match the current filter
    than that on a mobile viewport, only the first 6 render — landmarks with a render
    image (`renderSrc(lm)`, the same signal behind the existing `.has-render` hover-card
    feature) are prioritized to stay visible — and a new `#lmOverflowHint` pill
    (index.html/styles.css) shows e.g. "+6 more — filter by category", wired (once, in
    `wireViewControls`, not per-frame) to a new `openLandmarksCategoryPicker()` (app.js)
    that jumps straight into the existing category picker.
  - `.sync-meta` now truncates with an ellipsis instead of overflowing past the viewport
    edge (`.sync{min-width:0}` + `.sync-meta{overflow:hidden;text-overflow:ellipsis;
    max-width:46vw}`); `.lm-ico`/`.lm-label`/`.lm-sub-bar`/`.am-chip`/`.am-ico`/`.am-label`
    shrink a bit to reduce (not eliminate — see the caveat below) how often labels
    collide; `.wizard-types-grid` (the menu-item wizard's content-type picker) drops from
    3 to 2 columns at `≤480px`.

  **New this pass — landscape gets different treatment than portrait, not the same mobile
  squeeze:** the user shared reference screenshots (desktop-quality layouts — a well
  margined site plan with a legend panel, a well-spaced landmarks view) and asked
  specifically for landscape mobile to look like those, with desktop required to stay
  completely untouched.
  - New `isMobilePortrait()` (app.js: `innerWidth<=720 && matchMedia('(orientation:
    portrait)').matches`) replaces the old plain-width check for the drawer-collapse and
    a new rotate hint (below) — a landscape phone, even one narrower than 720px, no
    longer gets the portrait squeeze. The big mobile CSS block (topbar/legend/sync/label
    sizing/modal-dialog) is now gated `@media (max-width:720px) and (orientation:
    portrait)` instead of plain `max-width:720px` — this only *narrows* which viewports
    the existing rules apply to, so there is no way it can newly affect desktop.
  - New `isMobileLandscape()` (app.js: `innerWidth<=900 && matchMedia('(orientation:
    landscape)').matches`) — a separate, wider threshold used **only** for the landmark
    density cap. Landscape testing showed even 844px width still overlaps heavily with a
    dozen full-size, uncapped labels, so `renderLandmarks()`'s cap trigger is
    `isMobilePortrait() || isMobileLandscape()` while the drawer-collapse and portrait CSS
    stayed portrait-exclusive.
  - New, minimal `@media (orientation:landscape) and (max-height:500px)` block
    (styles.css): hides the topbar tagline, trims topbar padding slightly. Most of the
    "looks like the reference" result came from *excluding* landscape from the portrait
    squeeze, not from adding new landscape rules — the underlying desktop-style layout
    already resembles the reference once portrait's squeeze isn't forced onto it.
  - New rotate hint: `wireViewControls()` (app.js), non-admin only, calls
    `showNotice('Tip: rotate your device to landscape for the best view.')` once at boot
    if `isMobilePortrait()`, and again via a `matchMedia` change listener if the visitor
    rotates back into portrait later in the session.

  **Verified:** portrait screenshot shows the collapsed drawer + rotate hint + "+6 more"
  hint; landscape screenshot shows the open drawer, a clean single-row topbar matching the
  reference images, and "+6 more" (needed once the cap was extended to landscape), with
  no rotate hint; desktop screenshot (1400×900) shows all 12 landmarks full-size and
  uncapped, the full topbar subtitle, and no hints of any kind — confirming desktop is
  unaffected.

  **Still unresolved, worth restating — now covers both orientations:** the density cap
  reduces landmark-vs-landmark overlap, it does not eliminate it; the labels that DO stay
  visible can still overlap each other somewhat, confirmed in both the portrait and
  landscape verification screenshots. This remains a deliberate scope boundary (real
  collision-avoidance/clustering was discussed and explicitly not chosen for this pass),
  not an oversight. Admin-side mobile behavior is still not visually verified this
  session (see **Conventions & gotchas**) — a human needs to check it on an actual phone.

  **Same-day follow-up: topbar hidden entirely in landscape, replaced by a floating
  "Available" button.** The user tested the above on a real device and found the topbar
  (brand + full legend + sync + Refresh) ate a disproportionate share of a short
  landscape screen; asked to hide it there and keep just the one thing worth keeping —
  seeing/filtering to available plots — as a compact bottom-right button.
  - New `#zoomAvailableBtn` (index.html), first child inside the existing `.zoom-controls`
    floating column — same dot/label/count as the header's "Available" chip, styled with
    the dark floating backdrop the other zoom-control buttons already use. `display:none`
    by default; only shown inside the landscape media query.
  - The landscape media query now also hides `.topbar` entirely and reveals
    `#zoomAvailableBtn` — both scoped `body:not(.is-admin)`, so admin keeps its topbar in
    landscape regardless (not something the user asked to change, and not tested for
    admin).
  - `renderLegend()`/`toggleFilter()` (app.js) now keep `#zoomAvailableBtn`'s count and
    `aria-pressed` in sync with the header chips (previously only updated the chips); a
    new click listener calls the exact same `toggleFilter('available')` the header chip
    already calls, so behavior is identical, just relocated.
  - **Hit a real CSS Grid bug getting here** — see the new **Conventions & gotchas** entry
    on `display:none` and grid item placement; first attempt produced a fully black
    screenshot (canvas rendered at `height="0"`), root-caused and fixed by collapsing
    `.topbar` in place instead of removing it from grid flow.
  - **Verified**: fresh bundle export, screenshotted at 844×390 (landscape — topbar gone,
    "Available 1" pill correct, drawer/hint still work, pano now fills nearly the full
    height), 1400×900 (desktop — completely unaffected), 390×844 (portrait — completely
    unaffected).

  **Second same-day follow-up: the collapsed drawer's toggle button, fixed properly this
  time.** When the drawer was first made to default-collapse (earlier in this same pass),
  a counter-transform was added to keep `.cat-drawer-toggle` reachable — it worked (the
  button stayed visible/tappable), but pushed it all the way back to its *open-state*
  position: ~230px in from the left edge, floating with nothing around it to anchor it.
  The user tested this on a real device and correctly called it out as looking like a
  stray/buggy floating button, not a deliberate control — **that earlier fix was the wrong
  call, worth being honest about rather than glossing over.**
  - Investigated whether hiding the toggle entirely (as first requested) was actually
    safe: found the bottom-left icon cluster (fullscreen/mute/autopan —
    `.cat-drawer-foot`) is *also* a child of `.cat-drawer`, confirmed via screenshot that
    it disappears along with the drawer when collapsed too — meaning the toggle is
    currently the **only** way back into the menu once collapsed. Flagged this and the
    user chose: dock it at the screen's left edge instead, rather than hide it with no
    replacement.
  - The actual fix, worked out from the transform math and then confirmed by screenshot:
    **delete the counter-transform, don't replace it with different positioning math.**
    The toggle's own unmodified base position (poking ~20px past the drawer's right edge
    when open — long-standing, unrelated to this pass) rides along with the parent's
    `-100%` collapse shift when no override fights it, landing docked ~20px past the
    *screen's* left edge instead — the same half-in/half-out visual language it already
    used on the drawer's edge, just anchored to the screen edge now. One rule removed in
    styles.css (`.cat-drawer.is-collapsed .cat-drawer-toggle`), replaced with a comment
    explaining why no override is needed — so a future edit doesn't reintroduce the
    counter-transform without understanding why it was wrong.
  - **Verified**: fresh bundle-export screenshot at 390×844 (portrait, collapsed by
    default) — toggle now shows as a small tab docked at the left edge, not floating
    mid-screen. No app.js or index.html changes; drawer's open-state appearance and the
    default-collapse behavior itself are unchanged.

  Files: `styles.css`.

## 2026-08-31

- **Standalone export now genuinely runs offline via `file://` — no server, not even a
  static one.** Previously "⋯ menu → Export standalone site…" produced a folder that
  *looked* self-contained but silently failed if opened by double-clicking `index.html`:
  verified directly (a minimal repro in headless Edge) that both the dynamic
  `<script type="module">import(...)</script>` used to load `app.js`, and every
  `fetch()` call the app makes for its own data (`plots.svg/csv`, `alignment/landmarks/
  amenities.json`), throw `Failed to fetch` under `file://`. Classic `<script src>` and
  `<img src>` do not — so most images/video (already `<img>`/`<video>`-based: logos,
  landmark/amenity renders, contact photos, gallery photos) needed no changes. The pano
  and site-plan images turned out to be the exception — see the follow-up fix below.
  - `server.py`'s `do_bundle` now rewrites the shipped copies at export time only (the
    live/served app is untouched): `module_to_global()` turns the vendored
    `vendor/three.module.js` — a single flat module whose only import/export surface is
    one trailing `export { A, B, C, ... };` line — into `vendor/three.global.js`
    (`window.THREE = {...}`); `strip_named_import()` removes `app.js`'s one
    `import * as THREE from './vendor/three.module.js';` line; `build_embedded_files_json()`
    + `bake_bundle_html()` embed the project's 5 core data files inline as
    `window.B91_BUNDLE_FILES` and swap the module script tag for two classic ones.
  - `app.js` gained `loadProjectFile(name)` (next to `dataUrl`) — a fetch-Response-shaped
    helper that the 5 data-loading call sites (`loadCommittedCSV`, `loadGeometry`,
    `loadAlignmentFile`, `loadLandmarksFile`, `loadAmenitiesFile`) now go through; in
    bundle mode it reads `B91_BUNDLE_FILES` instead of fetching. `loadData()` also skips
    the live Google Sheet attempt entirely in bundle mode (`!BUNDLE &&` guard) — a
    `file://` export can never reach one, so it goes straight to the embedded CSV.
  - New: **export-time flagging.** Any admin menu item (video/pdf/tour/link/gallery photo)
    whose active content is a pasted URL rather than an uploaded file still needs internet
    even in the offline bundle — that content lives elsewhere and can't be embedded.
    `scan_menu_for_online_content()` (server.py) walks the menu tree and a new
    `GET /api/export-bundle-check?project=<id>` route reports them; `exportBundle()`
    (app.js) calls it before downloading. **Revised same day** (see below) to a real popup
    with a per-item **Edit** jump instead of a plain list — the admin can still export
    anyway either way (non-blocking, by design). A matching `noteIfExternal()` helper in
    the client viewer surfaces the same "needs an internet connection" notice at
    watch-time for video/tour/PDF items resolved to an external URL (not wired into
    gallery photos or plain `link` items — a broken image / an outbound link are already
    self-explanatory, so a notice there would just be noise).
  - **Verified end-to-end**, not just unit-level: exported the real `sample` project
    (1 plot, 11 landmarks, 3 amenities, a real menu tree — none URL-backed, so
    `flagged: []` correctly), unzipped it, and opened its `index.html` via a literal
    `file://` URL in headless Edge with **no server running at all**. Confirmed zero
    console errors, a real `<canvas data-engine="three.js r160">` (Three.js initialized
    from the classic-script global), landmark banner DOM elements rendered, and the
    header showing "1 plots · project sample" (plots.csv loaded from embedded data, sheet
    fetch correctly skipped). Files: `server.py`, `app.js`.
  - **Follow-up same day: the pano background and site-plan (drape) image weren't
    rendering** in that first export, while everything else (plots, landmarks, amenities,
    menu content) worked. Root cause, verified with a second direct test: those two
    specifically are uploaded to a **WebGL texture** (`texImage2D`), and — unlike a plain
    `<img>`, which loads fine under `file://` — a texture sourced from a `file://` path is
    **rejected as tainted/cross-origin even from the same folder**. Confirmed with a
    minimal repro: `gl.texImage2D` on an `<img>` loaded from a local file throws
    `SecurityError: ... contains cross-origin data`; the identical call using a `data:`
    URI succeeds. Fix: `server.py` gained `build_embedded_images_json()` (base64-embeds
    just `panoImage.file`/`groundImage.file` as `window.B91_BUNDLE_IMAGES`, keyed by
    basename) and `read_alignment()` (factored out of `do_bundle_check`, now shared);
    `bake_bundle_html()` grew a 4th param to bake the new flag in too. `app.js`'s
    `assetUrl()` checks `BUNDLE_IMAGES` first and returns the embedded `data:` URI when
    present — a single-point change, so every other image (which was never affected)
    resolves exactly as before. **Verified**: re-exported `sample`, confirmed both
    `Demo.web.jpg` and `Map_DesignCutOut10.web.png` present as `data:image/...;base64,...`
    in the shipped `index.html`, then opened it via `file://` with no server running and
    **took an actual screenshot** (a DOM dump can't show WebGL canvas pixels) confirming
    the aerial pano now renders correctly with landmarks and menu overlaid, no console
    errors.
  - **Second follow-up same day: export-time flagging rebuilt as a real popup with a
    per-item Edit jump**, replacing the plain `confirm()` — a `confirm()` can only show
    text and OK/Cancel, so fixing a flagged item meant cancelling the export, finding that
    item in the menu tree, editing it separately, then re-exporting. New `#exportFlaggedModal`
    (`index.html`, reuses the existing `.modal.custom-feature-modal` pattern — no new CSS)
    lists each flagged item (title, content type, its current URL) with an **Edit** button;
    clicking it calls `openNodeBuilderModal(nodeId)` — the same "Add/Edit Menu Item" wizard
    used everywhere else — pre-loaded on that exact item, ready to swap the pasted link for
    an upload. `scan_menu_for_online_content()` (server.py) now includes each item's `id`
    and current `url` in its response (previously just `title`/`contentType`) so the client
    can make that jump. New `showExportFlaggedModal(flagged)` (app.js, next to
    `exportBundle`) drives it — resolves `true` only on "Export Anyway"; both "Cancel
    Export" and "Edit" resolve `false`. **Verified**: `node --check` passed; loaded the
    real admin page headlessly with zero console errors and all 4 new element ids present
    in the DOM; created a throwaway test project with one URL-backed item and one
    file-backed item, hit the real `/api/export-bundle-check` endpoint, and confirmed only
    the URL-backed one came back flagged, correctly carrying its `id`/`url`. **Not**
    verified: an actual interactive click-through of Edit/Proceed/Cancel in a live browser
    session — no browser-automation tool was available this session, only headless
    page-load + DOM-dump + screenshot. Worth a manual click-through before calling this
    fully proven, though the logic reuses already-proven helpers
    (`openCustomModal`/`closeCustomModal`, `openNodeBuilderModal(id)`) rather than new
    mechanics of its own.
  - **Third follow-up same day: amenities weren't covered by the flagging at all.** The
    user reported a YouTube video in one of their **amenities** (a separate feature from
    the menu tree — in-layout icon pins with their own `tour_url`) didn't trigger the
    popup — correctly: `scan_menu_for_online_content()` only ever walked the menu tree,
    never `amenities.json`. Confirmed against real data before fixing: the `sample`
    project's "Priyadarshi Satyakam aasram" amenity has a YouTube `tour_url` and wasn't
    being flagged. Fix: new `scan_amenities_for_online_content()` + `read_amenities()`
    (server.py, same pattern as the menu-tree scan) — any amenity with a non-empty
    `tour_url` is flagged (amenities have **no upload alternative at all** for it, so any
    value there is inherently a pasted link). `do_bundle_check` now merges both scans.
    Each flagged entry now carries a `"source"` (`"menu"` or `"amenity"`) so
    `showExportFlaggedModal`'s Edit button routes correctly — `openNodeBuilderModal(id)`
    only understands menu-tree nodes; an amenity's Edit now calls `setAdminTab('amenities')`
    + `selectAmenity(id)` instead. Also added `noteIfExternal()` to `openModal()` — the one
    shared function that opens tour/video/image content for **both** plots and amenities —
    so the runtime "needs an internet connection" notice now covers amenity tours too (and
    incidentally plot walkthroughs, which is accurate even though plots aren't part of the
    export-time flag list — see below).
    **Deliberately NOT extended to plots** (`plots.csv`'s own `tour_url`/`video_url`/
    `image_url`): a plot's tour link is *always* meant to point to an external 3DVista
    tour — that's this app's whole "storefront" design from day one, not an admin mistake
    the way an unflagged menu item or amenity link is (those two have a real "did you mean
    to upload instead?" choice; a plot's tour never offers one). Worth revisiting if the
    admin actually wants plot tour links called out too — that'd be a bigger addition
    (CSV + `media_json` parsing), not a small follow-up like this one. **Verified**:
    `node --check` passed; hit the real `/api/export-bundle-check?project=sample` against
    unmodified real data and confirmed the YouTube-linked amenity now comes back flagged
    with the right `id`/`title`/`url`/`source`; reloaded the real admin page headlessly
    afterward with zero console errors. Same caveat as above: Edit was not clicked through
    interactively.

- **Client Contact Card modal redesigned as a full-screen page.** Was a small
  centered ~900x500 box; `#clientContactModal`'s dialog is now 100vw/100dvh
  (no border-radius/shadow — a true takeover, not a card). The info side keeps
  the same admin-set fields (`node.contact`: title/about/phone/email/image —
  `openClientContactModal` in app.js is unchanged throughout) but presents them
  with a "Get in touch" eyebrow (small accent-colored rule + label), a serif
  display title (`Georgia`/`ui-serif` stack — no external font, stays
  offline-friendly), and the address/phone/email as icon rows with hairline
  separators instead of plain "Label: value" text. The icon rows use inline
  SVG line-icons (pin/phone/envelope) instead of emoji, since emoji render
  inconsistently across OS/browser and read as less premium. Palette shifted
  from the generic slate/cyan first pass to a warm editorial one — off-white
  panel (`#faf7f2`), warm charcoal ink (`#1c1917`), bronze/gold accent
  (`#a8752c`, via `--contact-accent` custom props scoped to
  `.contact-modal-right`) — to better match the warm interior photography
  admins tend to use here; close button is a circular subtle button. Mobile
  (`≤768px`) stacks image (38vh) over content, still full-screen. Cleaned up
  ~15 inline `style="..."` attributes on `#clientContactModal`'s markup that
  were dead weight — the CSS block already controlled everything via
  `!important` — and added a `.contact-modal-backdrop` rule
  (position:absolute/inset:0/z-index:1) since that one was previously *only*
  an inline style with no CSS-side equivalent (removing it without replacing
  would've broken backdrop click-to-close). Files: `index.html`
  (`#clientContactModal` markup), `styles.css` (`.contact-modal-*` block,
  ~line 1418+).

- **Fixed a black strap over admin wizard step text.** The "Add Menu Item"
  wizard's step body (`.custom-modal-body`) had no background of its own, so
  it inherited `.modal-body`'s `background:#000` (meant for other modals like
  the image/video lightbox) — showing as a solid black bar right above each
  step's heading (e.g. "Item Title & Content Type"). Fixed by giving
  `.custom-modal-body` `background: transparent` so it shows the wizard
  dialog's own dark panel color instead. File: `styles.css`.

- **Landmark category camera panning now "fits" instead of always sweeping.**
  Selecting a landmark category in the client used to always pan the camera across a
  window at least 45° wide (`MIN_SWEEP_ARC`), even for a tight cluster of landmarks —
  causing visibly excessive panning for categories that could've been shown in one
  frame. `computeLandmarkPanRange` now makes a fit-or-sweep decision: if the matched
  landmarks' bounding arc (plus 8° padding each side) fits within `FOV_MAX` (120°), the
  camera frames the whole group at a fitted FOV (55–120°) and idles with a small gentle
  sway instead of panning; only a category that genuinely can't fit in one frame still
  sweeps, now sized to its real leftmost/rightmost extent instead of an inflated
  minimum. Removed `MIN_SWEEP_ARC`/`SWEEP_EDGE_PAD`/`withSweepBounds`; added
  `LANDMARK_EDGE_PAD`/`LANDMARK_FIT_FOV_CAP`/`LANDMARK_FIT_FOV_FLOOR`/
  `LANDMARK_SWEEP_FOV`/`LANDMARK_SWAY_HALF` and a small `meanDirection` helper.
  `renderLoop`'s idle ping-pong and `updateCamera`'s hard clamp are unchanged — they
  just operate on a tiny sway window or a real sweep window depending on the fit
  decision. Verified in-browser by the user: a 2-landmark Education category that
  previously swept now correctly frames both landmarks together. Files: `app.js`
  (`computeLandmarkPanRange`, `applyCategoryFilter`), `CLAUDE.md` (new code-map bullet).

## 2026-08-27

- **Created this changelog.** From now on, every change made via Claude will be
  logged here as it happens (not batched at the end of a session).
