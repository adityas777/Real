// sw.js — Build91 Plot Map: minimal offline layer for the CLIENT (view-only) experience.
//
// Registered only from client (non-admin) pages — see app.js's registerOfflineSupport().
// That said, once installed its scope is the whole origin ("/", the default scope for a
// worker served from the root), so as a second line of defence this file itself never
// touches admin traffic either: every fetch handler below checks for `admin=1` before
// doing anything (see isAdminRequest) and falls straight through to a plain network fetch
// when it finds it, so an admin session in the same browser is never served stale/cached
// data by a worker that happened to get installed from an earlier client visit.
//
// Cache key normalization: every data/asset fetch in app.js is cache-busted with a
// `?t=`/`?v=` query param (dataUrl/assetUrl) so the LIVE server always sees a fresh
// request — but that means the exact request URL is different on every single load, which
// would defeat Cache Storage's exact-match lookups. cacheKeyFor() strips the query string
// so the cache is keyed on the stable resource identity instead; requests still go to the
// network with their original cache-busting query intact.

// Bump this whenever the caching STRATEGY changes (not just the app code): the old caches
// are deleted on activate, so an already-installed worker cannot keep serving data under
// the previous rules. v2: project config moved to network-first. v3-v4: reserved by the
// Virtual Tours branch. v5: isRangedMediaPath widened to cover audio extensions, since an
// <audio> element makes the same byte-range requests as <video> and needs the same
// respondVideo/sliceRange treatment. v6: SHELL_URLS now precaches the MINIFIED three.js
// build (app.js's own import switched to it, 2026-09-11, for load-time — see CLAUDE.md's
// "vendored three.js path appears in FOUR places" gotcha) — bumped so an already-installed
// worker's v5 shell cache (which had the OLD, now-unused three.module.js precached and was
// therefore MISSING the file the app actually loads) gets discarded rather than silently
// leaving a visitor's offline pano viewer unable to find its own THREE.js. v7:
// respondVideo (since renamed, see v8) gained the background priming fetch for a ranged
// first-request — existing cached videos aren't invalidated by this (purely additive:
// previously-uncached mobile videos can now get cached, nothing already stored changes
// shape), bumped per this file's own policy of one per strategy change regardless. v8:
// PDFs (the brochure viewer, read progressively by pdf.js via Range requests exactly like
// a media element) are now routed through the same safe path — renamed respondVideo/
// VIDEO_BLOB_CACHE/VIDEO_PRIME_INFLIGHT/primeVideoCache/isRangedMediaPath to their generic
// respondRangedAsset/RANGED_BLOB_CACHE/RANGE_PRIME_INFLIGHT/primeRangedCache/
// isRangedCacheablePath names since "video" no longer describes what they cover. PDFs were
// previously falling through to the plain staleWhileRevalidate path, where pdf.js's several
// different-byte-range 206 responses for the same file kept overwriting each other under
// one cache key — the brochure could never actually be reconstructed offline.
const VERSION = 'v8';
// Only the SHELL is version-namespaced. The shell is CODE (app.js/styles/vendor) — a new
// deploy genuinely invalidates it, and it's ~2MB, cheap to re-fetch.
//
// DATA and MEDIA are deliberately NOT versioned, as of 2026-09-12, and this is load-bearing:
// they hold the visitor's actual downloaded CONTENT (project images in data, video/audio/PDF
// in media — together the whole ~200MB "Includes offline access" download). When these were
// versioned, every VERSION bump deleted them via the activate sweep below, and a phone that
// had downloaded everything for offline use silently lost ALL of it the next time it
// connected — which is exactly what happened when v7→v8 shipped: "video and images worked
// perfectly yesterday, now nothing plays offline." Un-versioning them means a caching-strategy
// change costs a visitor the small shell re-fetch, never their content. That's safe because
// these entries are plain complete 200 responses keyed by stable URL — always valid to serve
// as an offline fallback regardless of which strategy stored them — and online visitors still
// get fresh copies anyway (config is networkFirst, images are staleWhileRevalidate).
// Corrupt-entry risk (the thing a bump WOULD have flushed) is handled directly instead: the
// migration below refuses to carry over anything that isn't a complete 200.
const SHELL_CACHE = `b91-shell-${VERSION}`;
const DATA_CACHE = 'b91-data';
const MEDIA_CACHE = 'b91-media';
const ALL_CACHES = [SHELL_CACHE, DATA_CACHE, MEDIA_CACHE];
// Versioned content caches written by any earlier build, to be folded into the un-versioned
// ones on activate rather than deleted (see migrateLegacyContentCaches).
const LEGACY_CONTENT_PREFIXES = ['b91-data-', 'b91-media-'];

// The minimum needed to boot the client shell (pano engine + UI) with zero network.
// Project data (alignment/plots/landmarks/amenities json+csv+svg), the pano/plan images,
// and any menu media are deliberately NOT listed here — they're cached opportunistically
// the first time they're actually requested (see the fetch handler), so a visitor who
// never opens a given video never downloads it just by loading the app.
// pdf.js is here rather than left to runtime caching because the Android path that needs
// it (see openClientBrochureModal — that browser has no inline PDF viewer of its own) has
// to work with no connection, and a visitor may well open the brochure for the first time
// only after going offline. ~1.4MB, precached once.
const SHELL_URLS = ['./', './index.html', './app.js', './styles.css', './vendor/three.module.min.js',
  './vendor/pdf.min.js', './vendor/pdf.worker.min.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_URLS.map(async (u) => {
      try { const res = await fetch(u, { cache: 'no-store' }); if (res.ok) await cache.put(cacheKeyFor(u), res); } catch {}
    }));
    await self.skipWaiting();
  })());
});

// Fold any older VERSIONED data/media cache into its un-versioned replacement, so upgrading
// to this build doesn't cost a visitor content they already downloaded. Entries are copied
// one at a time and only when they're a COMPLETE 200 — a stored 206/partial is the corrupt
// shape the old PDF bug produced, and carrying that forward would preserve the very thing a
// version bump used to flush. Anything already present in the destination wins (it was
// written by current code). The legacy cache is dropped once drained, so this runs once.
async function migrateLegacyContentCaches(keys) {
  const legacy = keys.filter((k) => LEGACY_CONTENT_PREFIXES.some((p) => k.startsWith(p)));
  for (const name of legacy) {
    try {
      const dest = await caches.open(name.startsWith('b91-media-') ? MEDIA_CACHE : DATA_CACHE);
      const src = await caches.open(name);
      for (const req of await src.keys()) {
        try {
          if (await dest.match(req)) continue;
          const res = await src.match(req);
          if (res && res.status === 200 && !res.headers.get('Content-Range')) await dest.put(req, res);
        } catch {}   // one unreadable entry must not abort the whole migration
      }
      await caches.delete(name);
    } catch {}
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Claim first: migration below can take a while on a phone holding a few hundred MB, and
    // there's no reason for the page to sit uncontrolled (falling through to the network for
    // everything, caching nothing) while it runs.
    await self.clients.claim();
    const keys = await caches.keys();
    const isLegacyContent = (k) => LEGACY_CONTENT_PREFIXES.some((p) => k.startsWith(p));
    // Superseded SHELL caches only — content caches are migrated, not dropped.
    await Promise.all(keys
      .filter((k) => !ALL_CACHES.includes(k) && !isLegacyContent(k))
      .map((k) => caches.delete(k)));
    await migrateLegacyContentCaches(keys);
  })());
});

function cacheKeyFor(url) {
  const u = new URL(url, self.location.origin);
  // Preserve ?project= so each project gets its own navigation + data cache entry.
  // Without this, a second visit to /?project=anandman overwrites the cached
  // /?project=eleganza shell (both keyed as bare "/"), so tapping the home-screen
  // icon for eleganza would launch anandman — or fall back to "sample" if the wrong
  // shell happened to be cached.
  // All other query params (cache-busters like ?t= and ?v= added by app.js) are
  // stripped so the cache key stays stable across reloads.
  const project = u.searchParams.get('project');
  u.search = '';
  if (project) u.searchParams.set('project', project);
  return u.toString();
}

// Anything fetched with byte-range requests: <audio>/<video> elements, AND pdf.js (used
// for the brochure viewer on mobile — see openClientBrochureModal — which reads a PDF
// progressively via Range requests exactly like a media element, not as one big download).
// Caching a single 206 under the resource URL silently corrupts the cache (only that one
// slice would ever be served again) — the exact hazard respondRangedAsset exists to
// prevent. Background music (added 2026-09-04) went through the ordinary cache path until
// audio extensions were added here; PDFs (2026-09-12) had the exact same gap — routed
// through the plain staleWhileRevalidate path, where pdf.js's several different-byte-range
// 206 responses for the SAME file kept overwriting each other under one cache key, so the
// brochure was never actually reconstructible offline (whichever slice landed last "won"
// and any offline open got a corrupted fragment, not the real document).
function isRangedCacheablePath(pathname) {
  return /\.(mp4|webm|ogg|mov|m4v|mkv|mp3|m4a|aac|oga|wav|weba|flac|pdf)$/i.test(pathname);
}

async function isAdminRequest(event, requestUrl) {
  if (requestUrl.searchParams.has('admin')) return true;
  if (!event.clientId) return false;
  try {
    const client = await self.clients.get(event.clientId);
    return !!(client && /[?&]admin=1(&|$)/.test(client.url));
  } catch { return false; }
}

// Serve from cache immediately if we have it (fast + works offline), and refresh the cache
// in the background from the network so the next load picks up any admin edit — no manual
// versioning needed since the page's own cache-busting query already forces a fresh fetch.
// Network-first, cache as the offline fallback. Used ONLY for the small project CONFIG
// files (alignment/plots/landmarks/amenities/tour — json, csv, svg).
//
// Why these can't be stale-while-revalidate: they are the output of the admin editor, and
// SWR serves the previous copy on the first load after a save, so a freshly published menu
// item / tour / landmark simply does not appear until the visitor reloads a SECOND time.
// That reads as "my change didn't save" and cost a real debugging round. They are a few KB
// each, so paying a network round-trip for correctness is cheap; images and media (large,
// and already cache-busted by their own `_ver` token) stay on SWR.
async function networkFirst(cache, request) {
  const key = cacheKeyFor(request.url);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(cache, request) {
  const key = cacheKeyFor(request.url);
  const cached = await cache.match(key);
  const network = fetch(request).then((res) => {
    // cache.put can reject on its own (storage quota, most plausibly — video is what
    // blows past it). Swallowing it here only prevents a noisy unhandled rejection; the
    // page verifies what actually landed via verifyCachedItems (app.js) rather than
    // trusting this to have worked.
    if (res && res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (cached) { network.catch(() => {}); return cached; }
  const res = await network;
  return res || new Response('Offline', { status: 503, statusText: 'Offline' });
}

// Range-requested assets (video, audio, and pdf.js's PDF reads) need their own strategy:
// the client requests them with byte-range headers (for seeking/streaming/progressive PDF
// rendering), and caching a single 206 partial-content response under the resource's key
// would silently corrupt the cache (only that one slice would ever be served again). So a
// range request is only ever answered from cache once we already hold a COMPLETE (status
// 200) copy — sliced manually to build a proper 206 reply — and is otherwise passed
// straight to the network, with a separate unranged fetch kicked off in the background to
// prime the full-file cache for next time (including offline playback).
const RANGED_BLOB_CACHE = new Map();

// MOBILE browsers (iOS Safari reliably, Android often too) send a Range header on the very
// FIRST request for a <video>/<audio> element, AND pdf.js does the same for a PDF — before
// playback/rendering even starts, just to probe the file — where desktop browsers usually
// send a plain GET first. Every write to the cache used to live only in
// respondRangedAsset's `!range` branch, so on mobile the asset was never actually cached on
// ANY visit, however many times it was opened: the "opportunistic offline caching" this
// file exists for silently never fired for the device class it matters most for
// (2026-09-12: reported first for video, then confirmed the exact same gap existed for the
// PDF brochure, which wasn't even routed through this function at all until the same fix).
// Fixed by firing this plain, unranged fetch of the same URL in the background the first
// time a ranged request finds nothing cached yet, purely to populate the cache for next
// time — the visible request is still answered straight from the network immediately
// after, so playback/rendering is never held up waiting on the full download. Deduped by
// key: several range requests for the same asset (a video's metadata probe then playback
// then seeks; a PDF's many out-of-order page reads) arriving while that download is still
// in flight must only ever start ONE background fetch, not one per request — once it
// lands, `full` is set on the NEXT request and this whole priming path is skipped from
// then on. This also fixed an incidental bandwidth waste for PDFs: before being routed
// here, every one of pdf.js's range requests independently triggered its own
// staleWhileRevalidate "revalidate" fetch of the same file, observed as TWO full 36MB
// downloads for a single brochure open — now there's at most one deduped background fetch.
// One shared tracker for "a full-file fetch of this key is already in flight," used by
// BOTH the plain (`!range`) path below AND the ranged-priming path — not just ranged
// requests among themselves. pdf.js in particular doesn't only make range requests: it
// commonly issues one main, unranged streaming request for the bulk of the file ALONGSIDE
// a few early ranged reads for out-of-order data (e.g. the xref table near the end).
// Before this was unified, each path had its own independent "am I already fetching this"
// check, so those two request shapes for the SAME uncached file each started their OWN
// full download — observed directly as two separate complete 36MB fetches for a single
// brochure open. Whichever request (ranged or not) gets here first starts the ONE fetch;
// every other concurrent request for the same key, ranged or not, joins the same promise.
const RANGE_PRIME_INFLIGHT = new Map();   // cache key -> in-flight full-file fetch Promise
function fetchAndCacheFull(cache, key, url) {
  if (RANGE_PRIME_INFLIGHT.has(key)) return RANGE_PRIME_INFLIGHT.get(key);
  const task = fetch(url, { cache: 'no-store' })
    .then(async (res) => {
      // Awaited (not fire-and-forget) so a waitUntil(task) caller's stay-alive tracking
      // actually covers the cache WRITE too, not just the network fetch finishing.
      if (res && res.ok && res.status === 200) await cache.put(key, res.clone()).catch(() => {});
      return res;
    })
    .finally(() => RANGE_PRIME_INFLIGHT.delete(key));
  RANGE_PRIME_INFLIGHT.set(key, task);
  return task;
}

async function respondRangedAsset(cache, request, event) {
  const key = cacheKeyFor(request.url);
  const full = await cache.match(key);
  const range = request.headers.get('range');

  if (full) {
    if (!range) return full.clone();
    let blob = RANGED_BLOB_CACHE.get(key);
    if (!blob) {
      blob = await full.blob();
      RANGED_BLOB_CACHE.set(key, blob);
      if (RANGED_BLOB_CACHE.size > 5) {
        const oldestKey = RANGED_BLOB_CACHE.keys().next().value;
        RANGED_BLOB_CACHE.delete(oldestKey);
      }
    }
    return sliceRange(blob, range, full.headers.get('Content-Type') || 'application/octet-stream');
  }

  if (!range) {
    // Nothing cached yet, and this request already wants the whole file — it CAN be the
    // caching fetch itself, so it joins the same shared tracker instead of always
    // starting its own independent fetch (that dedup matters when a ranged probe for the
    // same key got here microseconds earlier and is already mid-download).
    try { return (await fetchAndCacheFull(cache, key, request.url)).clone(); }
    catch { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
  }

  // Ranged AND nothing cached yet — mobile's own metadata-probe request (or pdf.js's first
  // page read) lands here. Answer it from the network immediately so playback/rendering
  // isn't held up, but keep the priming fetch alive past this handler's own return via
  // waitUntil — otherwise the browser is free to tear the worker down the instant this
  // response is sent, cutting the download short.
  event.waitUntil(fetchAndCacheFull(cache, key, request.url));
  try { return await fetch(request); } catch { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
}

function sliceRange(blob, rangeHeader, contentType) {
  const total = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= total) end = total - 1;
  const chunk = blob.slice(start, end + 1, contentType);
  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept admin saves (POST) or anything else
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (YouTube/Vimeo/CDN links)

  const isProjectAsset = url.pathname.includes('/projects/') || url.pathname.includes('/data/');

  // A browser treats an <iframe src="...pdf"> as a navigation of that nested frame — same
  // `mode: 'navigate'` as loading the actual page. The Brochure viewer does exactly this
  // (openClientBrochureModal sets an <iframe>'s src straight to the PDF path). Route that
  // case as a plain data asset (cache/serve the PDF itself) BEFORE the real-page-navigation
  // branch below, whose offline fallback assumes it's always safe to hand back the cached
  // app shell — correct for reopening the app itself, but it was wrongly serving the whole
  // index.html *inside* the brochure iframe whenever the PDF wasn't cached and the network
  // was down, instead of either the cached PDF or a clean failure.
  if (req.mode === 'navigate' && isProjectAsset) {
    event.respondWith((async () => staleWhileRevalidate(await caches.open(DATA_CACHE), req))());
    return;
  }

  if (req.mode === 'navigate') {
    if (url.searchParams.has('admin')) return; // admin document load — untouched, straight to network
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = (await cache.match(cacheKeyFor(req.url))) || (await cache.match(cacheKeyFor('./index.html')));
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(cacheKeyFor(req.url), res.clone()).catch(() => {});
        return res;
      });
      // Nothing cached yet (first ever visit) — the network is the only option.
      if (!cached) {
        try { return await network; }
        catch { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
      }
      // True stale-while-revalidate: serve the cached copy INSTANTLY so the app opens
      // with zero delay regardless of signal strength, and let the network fetch run in
      // the background to refresh the cache for the NEXT visit. The old 2500ms race was
      // well-intentioned (always serve the freshest copy when online) but caused a
      // noticeable blank/spinner every open on a weak signal — unacceptable for an app
      // that was downloaded specifically to avoid that. A hard-offline visit gets the
      // cached copy just as fast; an online visit gets it equally fast and picks up any
      // updates on the following open instead of this one.
      network.catch(() => {}); // background refresh — failure is fine, cache still valid
      return cached;
    })());
    return;
  }

  event.respondWith((async () => {
    if (await isAdminRequest(event, url)) return fetch(req);

    if (isRangedCacheablePath(url.pathname)) return respondRangedAsset(await caches.open(MEDIA_CACHE), req, event);

    if (SHELL_URLS.some((u) => cacheKeyFor(u) === cacheKeyFor(req.url))) {
      return staleWhileRevalidate(await caches.open(SHELL_CACHE), req);
    }

    if (isProjectAsset) {
      // Config (the admin's output) must be fresh when online; media stays SWR.
      const cache = await caches.open(DATA_CACHE);
      return /\.(json|csv|svg)$/i.test(url.pathname)
        ? networkFirst(cache, req)
        : staleWhileRevalidate(cache, req);
    }

    try { return await fetch(req); } catch { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
  })());
});
