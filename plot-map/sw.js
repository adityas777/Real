// sw.js — Build91 Plot Map: the offline layer for the CLIENT (view-only) experience.
//
// STRICT OFFLINE MODE (2026-09-24, see MOBILE-OFFLINE.md). A phone or tablet can SAVE a project
// (client menu → "⬇ SAVE FOR OFFLINE"): the page downloads every file the project needs — the app
// itself, its data, its media, and plots.csv with the Google Sheet merged in — into one cache per
// project, `b91-saved@<scope>:<project>`, and writes a small record there last. From then on that
// project ALWAYS runs from the saved copy, whatever the connection, exactly like an exported
// standalone folder: every request is answered from the cache and never from the network. The
// only way anything in it changes is the user tapping "⟳ UPDATE OFFLINE COPY" in the same menu.
//
// This worker's job is deliberately small, because the browser updates it on its own whenever
// it changes (that can't be switched off) while a saved copy keeps running the app code it was
// saved with. So whatever this file does must keep working with OLDER saved copies of app.js —
// the cache names, the record key, cacheKeyFor's key shape and the NET_PARAM pass-through are a
// contract with every saved copy out there. Change them only with a migration.
//
//  • A SAVED project: answered from its saved copy only. A navigation opens the saved index.html
//    (with `window.B91_OFFLINE_COPY` injected, which is how the page knows it runs strict); a
//    file the copy doesn't have is a 404, online or not — the same behaviour in the field as in
//    the office. Requests carrying NET_PARAM (the page's own save/update downloads and its "is
//    there an update?" check) go straight to the network.
//  • An UNSAVED project: plain network, nothing cached. With no connection it falls back to what
//    an older version of this worker cached (see LEGACY below) and otherwise shows a short
//    "not saved on this device" page instead of the browser's own error.
//  • Admin pages and admin requests: never touched.
//
// New versions of this file do NOT take over by themselves (no skipWaiting in install): the
// running app is never swapped or reloaded under the user. A new version starts when every
// window of the app has been closed, or when the page asks for it (SKIP_WAITING) during a
// save/update the user started. There is no automatic page reload anywhere.
//
// LEGACY. Up to v49 this worker cached opportunistically into `b91-shell-<v>` /
// `b91-shell@<scope>:<v>`, `b91-data` and `b91-media` (and older `b91-data-*`/`b91-media-*`). A
// phone that downloaded a project that way must keep working offline until it is adopted into
// a saved copy (app.js moves those files over — no second download — and then deletes them), so
// those caches are read, never written, and only when the network fails for an unsaved project.
// Nothing here deletes them.
const VERSION = 'v50';

const SCOPE_URL = self.registration.scope;                 // this worker's folder, e.g. https://re.build91.in/eleganzav2/
const SCOPE_PATH = new URL(SCOPE_URL).pathname;
const SAVED_PREFIX = `b91-saved@${SCOPE_PATH}:`;           // + project id
const RECORD_KEY = new URL('.b91-offline-record', SCOPE_URL).href;   // one per saved cache, written last
const NET_PARAM = 'b91_net';                               // "always the network" marker (app.js OFFLINE_NET)
const PROJECT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const LEGACY_SHELL_PREFIX = SCOPE_PATH === '/' ? 'b91-shell-' : `b91-shell@${SCOPE_PATH}:`;

self.addEventListener('install', () => {
  // Nothing to precache: a saved copy is written by the page, and an unsaved visit is plain
  // network. Deliberately no skipWaiting() — see the header.
});

self.addEventListener('activate', (event) => {
  // Only reached when no older version is running any more (or the page asked, SKIP_WAITING):
  // claiming then hands the open page to this version at once, so a save it just started goes
  // through the rules above rather than an older worker's.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  else if (type === 'SAVED_CHANGED') forgetSaved();
  else if (type === 'PING' && event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true, version: VERSION });
});

// The cache key for a URL: resolved against this worker's folder, every query parameter dropped
// except ?project= (the app's own `?v=`/`?t=` cache-busters change on every load). app.js keys the
// files it saves with the same rule (offlineKeyFor), so the two must stay identical.
function cacheKeyFor(url) {
  const u = new URL(url, SCOPE_URL);
  const project = u.searchParams.get('project');
  u.search = '';
  u.hash = '';
  if (project) u.searchParams.set('project', project);
  return u.toString();
}

// ─── Which saved copy (if any) a request belongs to ─────────────────────────
// In a published demo's folder there is exactly one project, so "the one saved here" is the
// answer. At the site root (local server, the single-site deploy) several projects share one
// address: the project is in the path (projects/<id>/…), in the request's own ?project=, or in
// the ?project= of the page that made the request — else the app's own default, "sample".
const savedMemo = new Map();                                  // cache name → Promise<Cache|null>
let scopePidMemo = null;                                      // Promise<project id|null>, published folders only
function forgetSaved() {
  savedMemo.clear();
  scopePidMemo = null;
  RANGED_BLOBS.clear();                                       // an update may have replaced a file held here
}

function savedCacheNamed(name) {
  if (!savedMemo.has(name)) {
    savedMemo.set(name, (async () => {
      if (!(await caches.has(name))) return null;
      const cache = await caches.open(name);
      // The record is written LAST, so a cache without one is a first save still in progress
      // (or one that failed) — not a saved copy yet.
      return (await cache.match(RECORD_KEY)) ? cache : null;
    })().catch(() => null));
  }
  return savedMemo.get(name);
}

// `clientUrl` is the page that made the request (null for a page load itself).
async function projectFor(url, clientUrl) {
  if (SCOPE_PATH !== '/') {
    if (!scopePidMemo) {
      scopePidMemo = caches.keys().then((all) => {
        const names = all.filter((n) => n.startsWith(SAVED_PREFIX));
        return names.length === 1 ? names[0].slice(SAVED_PREFIX.length) : null;
      }).catch(() => null);
    }
    return scopePidMemo;
  }
  const inPath = /^projects\/([^/]+)\//.exec(url.pathname.slice(SCOPE_PATH.length));
  let pid = (inPath && inPath[1]) || url.searchParams.get('project') || (clientUrl && clientUrl.searchParams.get('project')) || '';
  pid = String(pid || 'sample').trim().toLowerCase();
  return PROJECT_RE.test(pid) ? pid : null;
}

async function savedCopyFor(url, clientUrl) {
  const pid = await projectFor(url, clientUrl);
  return pid ? savedCacheNamed(SAVED_PREFIX + pid) : null;
}

// This app's own pages in this folder: the folder itself or its index.html (any ?query). Only
// these open from a saved copy. Anything else under the same scope — at the site root that
// includes other apps in sub-folders, e.g. a demo folder built for testing — is not ours, and is
// left to the network untouched.
function isAppPage(url) {
  const rel = url.pathname.slice(SCOPE_PATH.length);
  return rel === '' || rel === 'index.html';
}
function isProjectFile(url) {
  return url.pathname.slice(SCOPE_PATH.length).startsWith('projects/');
}

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                           // admin saves (POST) and the like
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // YouTube/Vimeo/Google Sheet/CDN links
  if (!url.href.startsWith(SCOPE_URL)) return;
  if (url.searchParams.has(NET_PARAM)) return;                // the page's own save/update downloads
  if (req.mode === 'navigate') {
    if (url.searchParams.has('admin')) return;                // the admin: always live
    // A PDF opened in a frame is a navigation too — a file of the project, so it's ours.
    if (!isAppPage(url) && !isProjectFile(url)) return;
  }
  event.respondWith(handle(event, req, url));
});

async function handle(event, req, url) {
  let clientUrl = null;
  if (req.mode !== 'navigate' && event.clientId) {
    try {
      const client = await self.clients.get(event.clientId);
      if (client) {
        clientUrl = new URL(client.url);
        // Requests from an admin page, or from a page that isn't this app (see isAppPage), go
        // straight to the network. (A worker's own requests — pdf.js — count as the app's.)
        if (clientUrl.searchParams.has('admin') || (client.type === 'window' && !isAppPage(clientUrl))) return fetch(req);
      }
    } catch {}
  }
  // A page load re-reads which projects are saved, so a copy saved or removed in another tab —
  // or while this worker was asleep — is always picked up by the next open.
  if (req.mode === 'navigate') forgetSaved();
  const saved = await savedCopyFor(url, clientUrl);
  return saved ? fromSaved(saved, req, url) : fromNetwork(req, url);
}

async function fromSaved(cache, req, url) {
  // Opening the app → the saved index.html (a PDF opened in a frame is a navigation too, but
  // it's a file, not the app).
  if (req.mode === 'navigate' && !isProjectFile(url)) {
    const page = await cache.match(new URL('index.html', SCOPE_URL).href);
    if (!page) return notSavedPage();
    const html = await page.text();
    const flag = `<script>window.B91_OFFLINE_COPY = ${JSON.stringify({ worker: VERSION })};</script>`;
    return new Response(html.replace(/<head[^>]*>/i, (m) => m + flag), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const res = await cache.match(cacheKeyFor(url.href));
  if (!res) return new Response('Not in the saved copy', { status: 404, statusText: 'Not in the saved copy' });
  const range = req.headers.get('range');
  return range ? sliceRange(cacheKeyFor(url.href), res, range) : res;
}

async function fromNetwork(req, url) {
  try {
    return await fetch(req);
  } catch {
    const legacy = await fromLegacy(req, url);
    if (legacy) return legacy;
    if (req.mode === 'navigate') return notSavedPage();
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// What an older version of this worker cached for this folder (see LEGACY in the header).
async function legacyCaches() {
  const names = (await caches.keys()).filter((n) => n.startsWith(LEGACY_SHELL_PREFIX)
    || n === 'b91-data' || n === 'b91-media' || n.startsWith('b91-data-') || n.startsWith('b91-media-'));
  return Promise.all(names.map((n) => caches.open(n)));
}

async function fromLegacy(req, url) {
  try {
    const opened = await legacyCaches();
    if (!opened.length) return null;
    const keys = req.mode === 'navigate' && !isProjectFile(url)
      ? [cacheKeyFor(url.href), cacheKeyFor('./index.html')]
      : [cacheKeyFor(url.href)];
    for (const key of keys) {
      for (const cache of opened) {
        const res = await cache.match(key);
        if (!res) continue;
        const range = req.headers.get('range');
        return range ? sliceRange(key, res, range) : res;
      }
    }
  } catch {}
  return null;
}

// ─── Byte ranges ────────────────────────────────────────────────────────────
// <video>/<audio> and pdf.js read files in byte ranges. The cache holds whole files, so a range
// request is answered by slicing the stored copy. A few recently used files are kept as Blobs so
// seeking through one video doesn't re-read it from the cache on every request.
const RANGED_BLOBS = new Map();                                 // key → Blob (most recent last)
async function sliceRange(key, res, rangeHeader) {
  let blob = RANGED_BLOBS.get(key);
  if (!blob) {
    blob = await res.blob();
    RANGED_BLOBS.set(key, blob);
    while (RANGED_BLOBS.size > 3) RANGED_BLOBS.delete(RANGED_BLOBS.keys().next().value);
  }
  const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
  const total = blob.size;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= total) end = total - 1;
  return new Response(blob.slice(start, end + 1, contentType), {
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

// ─── "Not saved on this device" ─────────────────────────────────────────────
function notSavedPage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not saved on this device</title>
<style>
  html, body { height: 100%; margin: 0; background: #0c0d11; color: #e8e6df;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { min-height: 100%; box-sizing: border-box; padding: 24px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 8px; color: #d4af37; font-weight: 600; }
  p { margin: 0 0 6px; max-width: 420px; color: #a9a79f; }
  button { margin-top: 18px; padding: 10px 20px; border-radius: 999px; border: 1px solid #d4af37;
    background: transparent; color: #d4af37; font: inherit; }
</style></head><body><main>
  <h1>This project isn't saved on this device</h1>
  <p>Connect to the internet and open it again.</p>
  <p>To use it without a connection, open the menu and choose <strong>Save for offline</strong>.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
