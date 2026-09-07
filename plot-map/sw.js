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

const VERSION = 'v1';
const SHELL_CACHE = `b91-shell-${VERSION}`;
const DATA_CACHE = `b91-data-${VERSION}`;
const MEDIA_CACHE = `b91-media-${VERSION}`;
const ALL_CACHES = [SHELL_CACHE, DATA_CACHE, MEDIA_CACHE];

// The minimum needed to boot the client shell (pano engine + UI) with zero network.
// Project data (alignment/plots/landmarks/amenities json+csv+svg), the pano/plan images,
// and any menu media are deliberately NOT listed here — they're cached opportunistically
// the first time they're actually requested (see the fetch handler), so a visitor who
// never opens a given video never downloads it just by loading the app.
// pdf.js is here rather than left to runtime caching because the Android path that needs
// it (see openClientBrochureModal — that browser has no inline PDF viewer of its own) has
// to work with no connection, and a visitor may well open the brochure for the first time
// only after going offline. ~1.4MB, precached once.
const SHELL_URLS = ['./', './index.html', './app.js', './styles.css', './vendor/three.module.js',
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

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function cacheKeyFor(url) {
  const u = new URL(url, self.location.origin);
  u.search = '';
  return u.toString();
}

// Anything an <audio> or <video> element streams. AUDIO BELONGS HERE TOO: a media element
// requests its src with byte-range headers and gets 206 Partial Content back, and caching a
// single 206 under the resource URL silently corrupts the cache (only that one slice would
// ever be served again) — the exact hazard respondVideo exists to prevent. Background music
// (added 2026-09-04) went through the ordinary cache path until these extensions were added.
function isRangedMediaPath(pathname) {
  return /\.(mp4|webm|ogg|mov|m4v|mkv|mp3|m4a|aac|oga|wav|weba|flac)$/i.test(pathname);
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

// Video needs its own strategy: the <video> element requests it with byte-range headers
// (for seeking/streaming), and caching a single 206 partial-content response under the
// resource's key would silently corrupt the cache (only that one slice would ever be
// served again). So a range request is only ever answered from cache once we already hold
// a COMPLETE (status 200) copy — sliced manually to build a proper 206 reply — and is
// otherwise passed straight to the network, with a separate unranged fetch kicked off in
// the background to prime the full-file cache for next time (including offline playback).
async function respondVideo(cache, request) {
  const key = cacheKeyFor(request.url);
  const full = await cache.match(key);
  const range = request.headers.get('range');

  if (full) {
    if (!range) return full.clone();
    return sliceRange(await full.clone().blob(), range, full.headers.get('Content-Type') || 'video/mp4');
  }

  if (!range) {
    try {
      const res = await fetch(request);
      if (res && res.ok && res.status === 200) await cache.put(key, res.clone()).catch(() => {});   // see the note in staleWhileRevalidate about why this can reject
      return res;
    } catch { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
  }

  fetch(key, { cache: 'no-store' }).then((res) => {
    if (res && res.ok && res.status === 200) cache.put(key, res.clone()).catch(() => {});
  }).catch(() => {});
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
      // We already hold a usable copy. Give the network a brief head start so an online
      // visit still picks up the latest, but never let a weak signal hold the launch
      // hostage: fully offline fails instantly, but one bar can hang for many seconds,
      // which for an app whose whole promise is "opens instantly" is the worse outcome.
      // The network attempt keeps running either way and refreshes the cache for next time.
      try {
        return await Promise.race([
          network,
          new Promise((_, reject) => setTimeout(() => reject(new Error('slow-network')), 2500)),
        ]);
      } catch { return cached; }
    })());
    return;
  }

  event.respondWith((async () => {
    if (await isAdminRequest(event, url)) return fetch(req);

    if (isRangedMediaPath(url.pathname)) return respondVideo(await caches.open(MEDIA_CACHE), req);

    if (SHELL_URLS.some((u) => cacheKeyFor(u) === cacheKeyFor(req.url))) {
      return staleWhileRevalidate(await caches.open(SHELL_CACHE), req);
    }

    if (isProjectAsset) return staleWhileRevalidate(await caches.open(DATA_CACHE), req);

    try { return await fetch(req); } catch { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
  })());
});
