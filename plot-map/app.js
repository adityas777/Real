/* =============================================================================
   Build91 · Interactive Plot Map  —  app.js
   360° panorama viewer (Three.js) with plots projected onto the same sphere,
   plus an ADMIN overlay-alignment tool (?admin=1).

   • Client view  (index.html)            → loads sample/alignment.json, applies it.
   • Admin view   (index.html?admin=1)     → drag a plot to move the whole layout,
       sliders to scale/rotate, Save → downloads alignment.json (drop into sample/),
       Load → re-import a saved file. Work auto-saved as a local draft.

   ALIGNMENT MATH: plots.svg stores polygons in the panorama's image-pixel space.
   Each vertex maps onto a horizontal GROUND PLANE one unit below the camera
   (scale/rotate/translate applied there about the cluster anchor), then projects
   through the camera origin onto the sphere — a perspective image of a flat site
   plan. By default the layout centres on the nadir, so scale & rotate are uniform
   in every direction; admin tweaks slide/scale/rotate it to match the photo.
   ============================================================================= */

import * as THREE from './vendor/three.module.js';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  // Per-project data files/images are read from projects/<id>/ (see dataUrl/assetUrl);
  // the client picks the project via ?project=<id> (default "sample").
  // Plot status/details can also come LIVE from a per-project Google Sheet — that config
  // lives in state.sheet (set in the admin Align tab, persisted in alignment.json's
  // "data" block); see parseSheetUrl / fetchSheetRows / loadData.
  TOUR_BASE_URL: 'https://demo.build91.in/Eleganza', // 3DVista deep-link base
};

const STATUS_META = {
  available: { label: 'Available', cls: 'is-available', color: 0x34c77b },
  reserved:  { label: 'Reserved',  cls: 'is-reserved',  color: 0xe3b341 },
  sold:      { label: 'Sold',      cls: 'is-sold',      color: 0xd2615a },
  unknown:   { label: 'Unknown',   cls: 'is-unknown',   color: 0x8a91a0 },
};
const STATUS_ORDER = ['available', 'reserved', 'sold', 'unknown'];
const SELECT_COLOR = 0xd4af37;
const DRAFT_KEY = 'b91-plot-alignment-draft-v2'; // v2: tx/ty are ground-plane units (old px-unit drafts ignored)
const TAU = Math.PI * 2;

// ─── DOM refs ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'), pano: $('pano'), panoHint: $('panoHint'),
  brandMark: $('brandMark'), brandName: $('brandName'), brandTagline: $('brandTagline'),
  proj: $('proj'), projSelect: $('projSelect'), projTools: $('projTools'), projSave: $('projSave'), projSettingsBtn: $('projSettingsBtn'), projSettingsPopover: $('projSettingsPopover'), projSettingsClose: $('projSettingsClose'), projMenuBtn: $('projMenuBtn'), projMenu: $('projMenu'),
  projName: $('projName'), projNameInput: $('projNameInput'), projNameOk: $('projNameOk'), projNameCancel: $('projNameCancel'), projNameHint: $('projNameHint'),
  axBrandName: $('axBrandName'), axBrandTagline: $('axBrandTagline'), axBrandLogo: $('axBrandLogo'), axBrandLogoFile: $('axBrandLogoFile'), axBrandLogoName: $('axBrandLogoName'), axBrandLogoClear: $('axBrandLogoClear'),
  axSheetOn: $('axSheetOn'), axSheetBody: $('axSheetBody'), axSheetUrl: $('axSheetUrl'), axSheetTest: $('axSheetTest'), axSheetMsg: $('axSheetMsg'),
  legend: $('legend'), syncMeta: $('syncMeta'), refreshBtn: $('refreshBtn'),
  tooltip: $('tooltip'), notice: $('notice'),
  zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), zoomReset: $('zoomReset'), labelToggle: $('labelToggle'), landmarkToggle: $('landmarkToggle'), amenityToggle: $('amenityToggle'),
  landmarks: $('landmarks'), amenities: $('amenities'),
  catDrawer: $('catDrawer'), catDrawerToggle: $('catDrawerToggle'), catToggleIco: $('catToggleIco'), catLevel1: $('catLevel1'), catLevel2: $('catLevel2'), catLevelSubMenu: $('catLevelSubMenu'), catNavL1: $('catNavL1'), catNav: $('catNav'), catBackBtn: $('catBackBtn'), fsToggle: $('fsToggle'), audioToggle: $('audioToggle'), autoPanToggle: $('autoPanToggle'),
  // admin tabs + landmarks
  axTitle: $('axTitle'), axSubtitle: $('axSubtitle'), axTabBtnAlign: $('axTabBtnAlign'), axTabBtnLandmarks: $('axTabBtnLandmarks'), axTabBtnAmenities: $('axTabBtnAmenities'),
  axTabAlign: $('axTabAlign'), axTabLandmarks: $('axTabLandmarks'), axTabAmenities: $('axTabAmenities'),
  axLmAdd: $('axLmAdd'), axLmList: $('axLmList'), axLmEmpty: $('axLmEmpty'), axLmLoad: $('axLmLoad'), axLmFile: $('axLmFile'), axLmSave: $('axLmSave'),
  axAmAdd: $('axAmAdd'), axAmList: $('axAmList'), axAmEmpty: $('axAmEmpty'), axAmLoad: $('axAmLoad'), axAmFile: $('axAmFile'), axAmSave: $('axAmSave'),
  // amenity info card + full-render lightbox
  amCard: $('amCard'), amCardClose: $('amCardClose'), amCardIco: $('amCardIco'), amCardBlock: $('amCardBlock'), amCardTitle: $('amCardTitle'),
  amCardThumb: $('amCardThumb'), amCardImg: $('amCardImg'), amCardGrid: $('amCardGrid'), amCardNotes: $('amCardNotes'), amCardWalk: $('amCardWalk'),
  lightbox: $('lightbox'), lightboxImg: $('lightboxImg'), lightboxClose: $('lightboxClose'), lightboxCap: $('lightboxCap'),
  panel: $('panel'), panelClose: $('panelClose'), panelBadge: $('panelBadge'),
  panelTitle: $('panelTitle'), panelBlock: $('panelBlock'), panelGrid: $('panelGrid'),
  panelNotes: $('panelNotes'), walkBtn: $('walkBtn'), walkHint: $('walkHint'),
  modal: $('modal'), modalClose: $('modalClose'), modalTitle: $('modalTitle'),
  modalOpenNew: $('modalOpenNew'), modalSpinner: $('modalSpinner'), tourFrame: $('tourFrame'),
  // admin
  adminBar: $('adminBar'), axScale: $('axScale'), axScaleNum: $('axScaleNum'), axScaleDown: $('axScaleDown'), axScaleUp: $('axScaleUp'),
  axRot: $('axRot'), axRotNum: $('axRotNum'), axRotDown: $('axRotDown'), axRotUp: $('axRotUp'), axOpacity: $('axOpacity'), axOpacityVal: $('axOpacityVal'),
  axReset: $('axReset'), axLoad: $('axLoad'), axFile: $('axFile'), axSave: $('axSave'), axStatus: $('axStatus'),
  axSessionSave: $('axSessionSave'), axSessionClear: $('axSessionClear'), axSessionStatus: $('axSessionStatus'),
  axExport: $('axExport'), axModeLook: $('axModeLook'), axModeMove: $('axModeMove'), axImport: $('axImport'),
  axPano: $('axPano'), axPanoFile: $('axPanoFile'), axPanoName: $('axPanoName'),
  axPlanRow: $('axPlanRow'), axPlanOpacity: $('axPlanOpacity'), axPlanOpacityVal: $('axPlanOpacityVal'),
  // trace editor
  traceWin: $('traceWin'), traceHint: $('traceHint'), traceFile: $('traceFile'), traceDxf: $('traceDxf'),
  traceFinish: $('traceFinish'), traceClose: $('traceClose'),
  traceModeAuto: $('traceModeAuto'), traceModeManual: $('traceModeManual'), traceModeEdit: $('traceModeEdit'),
  traceThresh: $('traceThresh'), traceThreshVal: $('traceThreshVal'), traceSimplify: $('traceSimplify'), traceSimplifyVal: $('traceSimplifyVal'),
  traceSnap: $('traceSnap'), traceUndo: $('traceUndo'), traceClear: $('traceClear'),
  traceDxfLayer: $('traceDxfLayer'), traceLayerSel: $('traceLayerSel'), traceCount: $('traceCount'), traceList: $('traceList'),
  traceStage: $('traceStage'), traceCanvas: $('traceCanvas'), traceEmpty: $('traceEmpty'),
  // custom menu admin + client elements
  projCustomMenuBtn: $('projCustomMenuBtn'), projCustomDropdown: $('projCustomDropdown'),
  catLevelSubMenu: $('catLevelSubMenu'), catSubMenuNav: $('catSubMenuNav'), catSubMenuBackBtn: $('catSubMenuBackBtn'),
  adminLocationIntelModal: $('adminLocationIntelModal'), adminWalkthroughModal: $('adminWalkthroughModal'),
  adminVirtualTourModal: $('adminVirtualTourModal'), adminGalleryModal: $('adminGalleryModal'),
  adminBrochureModal: $('adminBrochureModal'), adminContactModal: $('adminContactModal'), adminCurrentMenuModal: $('adminCurrentMenuModal'),
  clientVideoModal: $('clientVideoModal'), clientGalleryModal: $('clientGalleryModal'),
  clientBrochureModal: $('clientBrochureModal'), clientContactModal: $('clientContactModal'),
};

// ─── State ──────────────────────────────────────────────────────────────────
const R = 500, R_PLOT = 492, R_DRAPE = 489, GROUND_H = 1; // R_DRAPE = PNG site-plan layer, just under the plot fills; GROUND_H = camera height above the ground plane (normalized)
const FOV_MIN = 20, FOV_MAX = 120; // field-of-view range; wide max lets the view zoom out to the whole site (past ~120° a perspective camera fisheyes hard)
const PANO_TEX_CAP = 8192; // target equirectangular width; actual cap = min(this, GPU max texture size) so it
                           // stays sharp on desktop (≤16384) yet auto-downscales to 4096 on mobile GPUs
function gpuMaxTexSize() { try { const g = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); return g ? g.getParameter(g.MAX_TEXTURE_SIZE) : 4096; } catch { return 4096; } }
const IDENTITY = () => ({ tx: 0, ty: 0, scale: 1, rotation: 0 }); // tx/ty = ground-plane offset (world units); rotation in radians
// ── Projects: each site lives in projects/<id>/. Client loads ?project=<id>
//    (default "sample"); admin saves to the server-side project dir (see server.py).
const PROJECT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
function sanitizeProjectId(s) { s = (s || '').trim().toLowerCase(); return PROJECT_ID_RE.test(s) ? s : ''; }
const _params = new URLSearchParams(location.search);
// Standalone BUNDLE mode: an exported portable folder bakes `window.B91_BUNDLE =
// { project, dataBase }` into index.html (before app.js loads). It forces the view-only
// client, reads all data from dataBase (e.g. "./data") instead of projects/<id>/, and never
// touches the /api server — so the folder runs on any static host / inside an <iframe>.
const BUNDLE = (typeof window !== 'undefined' && window.B91_BUNDLE && typeof window.B91_BUNDLE === 'object') ? window.B91_BUNDLE : null;
// The project comes from ?project=<id> (or the baked bundle id). In ADMIN only, a remembered
// last-project is a convenience fallback; the client never loads a project from localStorage.
const BOOT_PROJECT = BUNDLE
  ? (sanitizeProjectId(BUNDLE.project) || 'site')
  : (sanitizeProjectId(_params.get('project'))
    || (_params.has('admin') ? (() => { try { return sanitizeProjectId(localStorage.getItem('b91-project-id')); } catch { return ''; } })() : '')
    || 'sample');
const baseName = (p) => String(p || '').split(/[\\/]/).pop();

const state = {
  admin: BUNDLE ? false : _params.has('admin'),   // a bundle is always the view-only client (admin code stays inert)
  bundle: !!BUNDLE,                                // running inside an exported standalone folder?
  projectId: BOOT_PROJECT,               // save target (admin can retarget); assetBase is fixed at boot
  assetBase: BUNDLE ? String(BUNDLE.dataBase || './data').replace(/\/+$/, '') : `projects/${BOOT_PROJECT}`, // where THIS load reads files/images from
  rows: new Map(), geom: [], imgW: 12000, imgH: 6000,
  sheet: { url: '', gid: '', enabled: false }, // per-project Google-Sheet plot-data source (alignment.json "data")
  dataSource: 'file',                          // what loadData() last used: 'file' | 'live' | 'cached'
  anchor: { x: 6000, y: 3000 },         // cluster centroid in image px (pivot for scale/rotate)
  kGround: 0.0003,                      // px → ground-plane units (auto-calibrated in loadGeometry)
  transform: IDENTITY(),
  groundImage: null,                    // { file, opacity } — PNG site-plan draped on the ground (shares the transform)
  planBlob: null, planName: null,       // raw imported plan PNG (kept so the working session survives a reload pre-export)
  panoImage: null,                      // { file } — admin-chosen 360° background pano (exported + referenced in alignment.json)
  brand: { name: '', tagline: '', logo: null, logoBlob: null, logoName: null, _url: null, _ver: '' }, // client title-bar branding (in alignment.json)
  panoBlob: null, panoName: null,       // resized texture-safe pano JPEG kept for export / session restore
  plots: new Map(), selectedId: null, hoverId: null,
  activeFilters: new Set(STATUS_ORDER),
  overlayOpacity: 0.5,
  showLabels: (() => { try { return localStorage.getItem('b91-show-labels') === '1'; } catch { return false; } })(), // plot-number annotations: optional, default off (remembered per browser)
  showLandmarks: (() => { try { return localStorage.getItem('b91-show-landmarks') !== '0'; } catch { return true; } })(), // landmark banners: default ON so client view shows them on load
  landmarks: [], lmSel: null, adminTab: 'align', // horizon landmarks; selected id; which admin tab is showing
  amenities: [], amSel: null, amCardOpen: null,  // in-layout amenities (icon pins + render); selected id; open card id
  cardAnchor: null, cardHoverMode: false,        // shared info-card anchor {lon,lat}; hover cards (landmarks) auto-hide
  serverSave: true,                              // is server.py's write API reachable? (else saves fall back to downloads)
  showAmenities: (() => { try { return localStorage.getItem('b91-show-amenities') !== '0'; } catch { return true; } })(), // amenities: shown by default (they're core content)
  view: { lon: 0, lat: 0, fov: 70 }, home: { lon: 0, lat: 0, fov: 70 },
  savedView: null,                      // camera view stored in the alignment (WYSIWYG); null ⇒ auto-frame
  adminMode: 'look',                    // 'look' = drag rotates view; 'move' = drag repositions layout
  selectedCategory: 'ALL', autoPan: true, lastUserTouch: Date.now(), audioCtx: null, audioPlaying: false,
  menuConfig: {
    location_intel: { enabled: false, videoUrl: '', videoName: '', videoBlob: null },
    walkthrough_video: { enabled: false, videoUrl: '', videoName: '', videoBlob: null },
    virtual_tour: { enabled: false, items: [] },
    gallery: { enabled: false, images: [] },
    brochure: { enabled: false, pdfUrl: '', pdfName: '', pdfBlob: null },
    contact_us: {
      enabled: true,
      image: '',
      imageName: '',
      imageBlob: null,
      title: 'Anandam Eleganza - Premium Villa Plots',
      about: 'Site Address: Beside Loha Market, Sondongari Main Road, Hirapur, Raipur, Chhatisgarh',
      phone: '+91 7389705477',
      email: 'anandameleganza@gmail.com'
    }
  },
};
let three = null, plotsDirty = false;
const labelCache = new Map();           // id → reusable label Sprite (avoid texture churn on rebuild)

// Resolve a committed data file / image to a URL under the active project dir. Stored
// image paths (e.g. "sample/foo.jpg") are resolved by BASENAME against the project base,
// so old paths keep working and a project directory is self-contained & relocatable.
const dataUrl = (name) => `${state.assetBase}/${name}?t=${Date.now()}`;
function assetUrl(storedPath, ver) {
  if (!storedPath) return '';
  if (/^(https?:|\/\/|data:|blob:)/i.test(storedPath)) return storedPath;
  const u = `${state.assetBase}/${baseName(storedPath)}`;
  return ver ? `${u}?v=${encodeURIComponent(ver)}` : u;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = []; let row = [], field = '', i = 0, inQ = false;
  const pushF = () => { row.push(field); field = ''; };
  const pushR = () => { pushF(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ',') pushF(); else if (c === '\n') pushR(); else if (c === '\r') {} else field += c; }
    i++;
  }
  if (field.length || row.length) pushR();
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(header.map((h, j) => [h, (r[j] ?? '').trim()])));
}
// Normalise a parsed CSV/sheet row in place: status is lower-cased & trimmed so a sheet
// that says "Sold"/"SOLD" still maps to a known status (unknown values fall through to
// 'unknown' at consume time in colorPlots/applyData). Other fields are used verbatim.
function normalizeRow(r) { r.status = (r.status || '').trim().toLowerCase(); return r; }

// Canonical plot key: trims, lowercases, and drops an optional "Plot-" prefix, so a sheet
// that lists bare numbers ("133") joins to a "Plot-133" polygon (and vice-versa).
const canonPlotId = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/^plot[\s_-]*/, '');
// Key parsed rows to the LAYOUT: match each polygon id by canonical form and rewrite the
// row's plot_id to the polygon id, so a bare-number sheet joins and everything downstream
// (colouring, popover, CSV snapshot, session) sees the canonical "Plot-XXX" id. Rows with no
// matching polygon are kept under their raw plot_id (geometry not loaded yet / extra rows).
function indexRows(rows) {
  const byCanon = new Map();
  for (const r of rows) { const k = canonPlotId(r.plot_id); if (k && !byCanon.has(k)) byCanon.set(k, r); }
  const map = new Map(), used = new Set();
  for (const g of state.geom) { const k = canonPlotId(g.id); const r = byCanon.get(k); if (r) { r.plot_id = g.id; map.set(g.id, r); used.add(k); } }
  for (const r of rows) { const k = canonPlotId(r.plot_id); if (!used.has(k) && r.plot_id != null && !map.has(r.plot_id)) map.set(r.plot_id, r); }
  return map;
}

// ── Google Sheet plot-data source (per project) ───────────────────────────────
// Accepts any normal share link (/spreadsheets/d/<ID>/edit#gid=…) or a "Publish to web"
// link (/spreadsheets/d/e/<PUBID>/pubhtml). Returns browser-readable CSV endpoint(s) —
// gviz for a shared doc, the pub CSV for a published one — tried in order. Both send
// permissive CORS for public sheets; a private sheet fails and we fall back to plots.csv.
function parseSheetUrl(url) {
  url = (url || '').trim(); if (!url) return null;
  let m = url.match(/\/spreadsheets\/d\/e\/([^/]+)/); if (m) return { kind: 'pub', id: m[1] };   // Publish-to-web id
  m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/); if (m) return { kind: 'doc', id: m[1] }; // normal spreadsheet id
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url)) return { kind: 'doc', id: url };                          // a bare id
  return null;
}
function sheetGid(url, explicitGid) {
  if (explicitGid != null && String(explicitGid).trim() !== '') return String(explicitGid).trim();
  const m = (url || '').match(/[#?&]gid=([0-9]+)/); return m ? m[1] : '';
}
function sheetCsvCandidates(url, gid) {
  const p = parseSheetUrl(url); if (!p) return [];
  const gq = sheetGid(url, gid); const g = gq ? `&gid=${encodeURIComponent(gq)}` : '';
  return p.kind === 'pub'
    ? [`https://docs.google.com/spreadsheets/d/e/${p.id}/pub?output=csv${g}`]
    : [`https://docs.google.com/spreadsheets/d/${p.id}/gviz/tq?tqx=out:csv${g}`];
}
// Fetch the configured sheet → Map(plot_id → row), or null on any failure (network, CORS,
// private sheet, or a response that isn't CSV with a plot_id column).
async function fetchSheetRows(cfg = state.sheet) {
  if (!cfg || !cfg.enabled || !cfg.url) return null;
  for (const u of sheetCsvCandidates(cfg.url, cfg.gid)) {
    try {
      const res = await fetch(`${u}&_cb=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const rows = parseCSV(await res.text());
      if (rows.length && 'plot_id' in rows[0]) return indexRows(rows.map(normalizeRow));
    } catch {}
  }
  return null;
}
async function loadCommittedCSV() {                     // the committed projects/<id>/plots.csv (fallback / default)
  let res = null; try { res = await fetch(dataUrl('plots.csv'), { cache: 'no-store' }); } catch {}
  if (!res || !res.ok) { state.rows = new Map(); return false; } // new/empty project — no CSV yet
  state.rows = indexRows(parseCSV(await res.text()).map(normalizeRow));
  return true;
}
// Populate state.rows from the LIVE sheet if one is configured & reachable, else the
// committed CSV. Returns a short label describing the source (shown by setSync).
async function loadData() {
  if (state.sheet.enabled && state.sheet.url) {
    const snap = await fetchSheetRows();
    if (snap) { state.rows = snap; state.dataSource = 'live'; return 'live sheet'; }
    await loadCommittedCSV(); state.dataSource = 'cached'; return 'cached · sheet unreachable';
  }
  await loadCommittedCSV(); state.dataSource = 'file'; return `project “${state.projectId}”`;
}

// ─── Geometry (polygons in image-pixel space) + anchor ────────────────────────
async function loadGeometry() {
  const url = dataUrl('plots.svg');
  let res = null; try { res = await fetch(url, { cache: 'no-store' }); } catch {}
  if (!res || !res.ok) {                       // no plots.svg yet ⇒ a NEW/empty project — start blank so admin can build it
    state.geom = []; state.imgW = 12000; state.imgH = 6000; recomputeAnchorAndK();
    return;
  }
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const vb = (doc.querySelector('svg').getAttribute('viewBox') || '0 0 12000 6000').split(/\s+/).map(Number);
  state.imgW = vb[2]; state.imgH = vb[3];
  state.geom = [...doc.querySelectorAll('polygon.plot')].map((poly) => ({
    id: poly.id,
    pts: poly.getAttribute('points').trim().split(/\s+/).map((p) => { const [x, y] = p.split(',').map(Number); return { x, y }; }),
  }));
  recomputeAnchorAndK();
}
// anchor = centroid of ALL vertices (deterministic → admin & client agree); kGround
// auto-calibrates px → ground units so the layout's outer radius lands ~35° off the
// nadir at scale 1 (sensible default footprint at any plot count / plan size).
function recomputeAnchorAndK() {
  let sx = 0, sy = 0, n = 0;
  state.geom.forEach((g) => g.pts.forEach((p) => { sx += p.x; sy += p.y; n++; }));
  if (n) state.anchor = { x: sx / n, y: sy / n };
  let maxR = 1;
  state.geom.forEach((g) => g.pts.forEach((p) => { maxR = Math.max(maxR, Math.hypot(p.x - state.anchor.x, p.y - state.anchor.y)); }));
  state.kGround = Math.tan(35 * Math.PI / 180) / maxR;
}

// ─── Overlay transform → ground-plane point (the alignment) ───────────────────
// The whole layout is treated as a rigid site plan lying flat on a horizontal
// ground plane one unit below the camera. A raw plot pixel maps to ground (east,
// south) coordinates about the anchor; scale/rotate are applied in that flat
// plane (so they're uniform in every direction — no pole singularity) and tx/ty
// slide the plan along the ground. By default (identity) the anchor sits at
// (0,0) → straight down at the nadir.
// NOTE on handedness: the pano SPHERE is viewed from the INSIDE, which mirrors its
// texture, so dir() reflects across X (−sin lon) to un-mirror it. The ground-plane
// drape/plots are different — viewed from ABOVE like a map on a table, NOT mirrored
// — so groundPoint is NOT reflected. (Reflecting it too made the imported plan read
// backwards.) Both then read correctly and overlay each other consistently.
function groundPoint(p) {
  const A = state.anchor, t = state.transform, k = state.kGround;
  const lx = (p.x - A.x) * k, lz = (p.y - A.y) * k;            // east, south (px → ground units)
  const c = Math.cos(t.rotation), s = Math.sin(t.rotation);
  return new THREE.Vector3((lx * c - lz * s) * t.scale + t.tx, -GROUND_H, (lx * s + lz * c) * t.scale + t.ty);
}

// ─── Image-pixel → sphere direction (alignment contract; matches texture UVs) ─
function dir(px, py) {
  const lon = (px / state.imgW) * TAU, lat = (0.5 - py / state.imgH) * Math.PI, cl = Math.cos(lat);
  return new THREE.Vector3(-cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon));
}

// ─── Pano texture (downscale oversized equirectangulars; seamless meridian) ───
// A 360° viewer needs the pano as a single WebGL texture. Full-res drone panos
// (e.g. 12000×6000, ~290 MB VRAM) blow past mobile GPUs' 4096 limit and stall
// desktop ones, so we downscale to a texture-safe, power-of-two size on load.
// wrapS = Repeat makes the lon=0/2π seam blend (no visible vertical stitch line);
// wrapT stays clamped (top/bottom are the poles, they don't wrap).
function panoTextureFromSource(source) {                 // source = canvas | ImageBitmap | HTMLImage (already sized)
  const tex = new THREE.Texture(source);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 16;   // ← sharpens the nadir/zenith convergence (Three clamps to the GPU max); default 1 = the fuzzy "swirl"
  tex.needsUpdate = true;
  return tex;
}
// A plain sky→ground gradient used when a project has no pano yet (so the app still runs
// and the admin can drop one in), rather than shipping a heavy default image around.
function fallbackPanoTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d').createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#2a3a55'); g.addColorStop(0.5, '#141821'); g.addColorStop(1, '#0a0c11');
  const cx = c.getContext('2d'); cx.fillStyle = g; cx.fillRect(0, 0, c.width, c.height);
  return panoTextureFromSource(c);
}
async function loadPanoTexture(src) {                    // src = URL string OR a Blob/File
  const cap = Math.min(PANO_TEX_CAP, gpuMaxTexSize());
  try {
    const blob = (src instanceof Blob) ? src : await (await fetch(`${src}?v=${Date.now()}`, { cache: 'no-store' })).blob();
    const bmp = await createImageBitmap(blob);
    let source = bmp;
    if (bmp.width > cap) {
      const W = cap, H = Math.round(bmp.height * cap / bmp.width);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(bmp, 0, 0, W, H); if (bmp.close) bmp.close(); source = c;
    }
    return panoTextureFromSource(source);
  } catch {
    if (typeof src === 'string') {                        // fallback: let Three decode the URL (no downscale)
      const t = await new THREE.TextureLoader().loadAsync(src);
      t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 16; t.needsUpdate = true; return t;
    }
    throw new Error('Could not decode panorama image');
  }
}
function swapPano(tex) {                                  // live-replace the sphere's background texture
  if (!three?.pano || !tex) return;
  three.pano.material.map?.dispose(); three.pano.material.map = tex; three.pano.material.needsUpdate = true; requestRender();
}
// Admin: pick a 360° pano image → downscale to a texture-safe JPEG, swap it live,
// and keep the resized blob + reference so "Export site files…" ships it.
async function setPanoFromFile(file) {
  if (!file) return;
  const cap = Math.min(PANO_TEX_CAP, gpuMaxTexSize());
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { setAxStatus('Could not read that image as a panorama — use a JPG/PNG equirectangular.'); return; }
  const scale = Math.min(1, cap / bmp.width);
  const W = Math.round(bmp.width * scale), H = Math.round(bmp.height * scale);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(bmp, 0, 0, W, H); if (bmp.close) bmp.close();
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') + '.web.jpg';
  swapPano(panoTextureFromSource(c));
  state.panoBlob = blob; state.panoName = name; state.panoImage = { file: `sample/${name}` };
  updatePanoName(); onAlignmentChanged();
  setAxStatus(`Background pano set to <code>${name}</code>${scale < 1 ? ` (resized to ${W}×${H} for the browser)` : ''}. Click <strong>Save</strong> in the top bar to commit it.`);
}
function updatePanoName() {
  if (!els.axPanoName) return;
  const f = state.panoImage?.file;
  els.axPanoName.textContent = f ? `Client pano: ${f.replace(/^sample\//, '')}` : 'Using the default panorama.';
  els.axPanoName.classList.toggle('is-set', !!f);
}

// ─── Site branding (client title bar: project name + tagline + logo) ──────────
const BRAND_DEFAULT_NAME = 'Build91', BRAND_DEFAULT_TAGLINE = 'Interactive Plot Map', BRAND_DEFAULT_MARK = 'B91';
// Serialised into alignment.json (only when the site actually set something).
function brandData() {
  const b = state.brand, name = (b.name || '').trim(), tagline = (b.tagline || '').trim();
  if (!name && !tagline && !b.logo) return null;
  return { ...(name ? { name } : {}), ...(tagline ? { tagline } : {}), ...(b.logo ? { logo: { file: b.logo } } : {}) };
}
function brandLogoSrc() {
  const b = state.brand;
  if (b.logoBlob) { if (!b._url) b._url = URL.createObjectURL(b.logoBlob); return b._url; }
  return assetUrl(b.logo, b._ver);      // committed logo → resolved under the active project dir, cache-busted
}
function brandInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 3).toUpperCase();
}
// Paint the client title bar from state.brand (falling back to the built-in defaults).
function applyBrand() {
  const raw = (state.brand.name || '').trim();
  const name = raw || BRAND_DEFAULT_NAME, tagline = (state.brand.tagline || '').trim() || BRAND_DEFAULT_TAGLINE;
  if (els.brandName) els.brandName.textContent = name;
  if (els.brandTagline) els.brandTagline.textContent = tagline;
  const src = brandLogoSrc();
  const fallbackMark = () => { els.brandMark.classList.remove('has-logo'); els.brandMark.textContent = raw ? brandInitials(raw) : BRAND_DEFAULT_MARK; };
  if (els.brandMark) {
    if (src) { els.brandMark.classList.add('has-logo'); els.brandMark.innerHTML = `<img class="brand-logo" alt="${esc(name)} logo" />`; const img = els.brandMark.firstChild; img.onerror = fallbackMark; img.src = src; }
    else fallbackMark();
  }
  document.title = `${name} · ${tagline}`;
  if (state.admin) updateBrandAdminUI();
}
function updateBrandAdminUI() {
  if (els.axBrandName) els.axBrandName.value = state.brand.name || '';
  if (els.axBrandTagline) els.axBrandTagline.value = state.brand.tagline || '';
  const has = !!(state.brand.logo || state.brand.logoBlob);
  if (els.axBrandLogoName) { els.axBrandLogoName.textContent = has ? (state.brand.logo || 'logo').replace(/^sample\//, '') : 'no logo'; els.axBrandLogoName.classList.toggle('is-set', has); }
  if (els.axBrandLogoClear) els.axBrandLogoClear.hidden = !has;
}
async function setBrandLogo(file) {
  if (!file) return;
  let out; try { out = await resizeImageToBlob(file, 512, 'image/png'); }   // PNG keeps logo transparency; small cap
  catch { setAxStatus('Could not read that logo — use a PNG/JPG/SVG image.'); return; }
  if (state.brand._url) { try { URL.revokeObjectURL(state.brand._url); } catch {} state.brand._url = null; }
  state.brand.logoBlob = out.blob; state.brand.logo = 'sample/logo.web.png'; state.brand.logoName = 'logo.web.png';
  applyBrand(); onAlignmentChanged();
  setAxStatus(`Logo set (${out.W}×${out.H}). Click <strong>Save</strong> in the top bar to commit it.`);
}
function clearBrandLogo() {
  if (state.brand._url) { try { URL.revokeObjectURL(state.brand._url); } catch {} state.brand._url = null; }
  state.brand.logo = null; state.brand.logoBlob = null; state.brand.logoName = null;
  applyBrand(); onAlignmentChanged();
}

// ─── Plot data source (admin: Google Sheet vs committed CSV) ───────────────────
function updateSheetAdminUI() {
  if (els.axSheetOn) els.axSheetOn.checked = !!state.sheet.enabled;
  if (els.axSheetBody) els.axSheetBody.hidden = !state.sheet.enabled;
  if (els.axSheetUrl && document.activeElement !== els.axSheetUrl) els.axSheetUrl.value = state.sheet.url || '';
}
function setSheetMsg(msg, kind) { if (els.axSheetMsg) { els.axSheetMsg.textContent = msg; els.axSheetMsg.className = `ax-data-note${kind ? ' is-' + kind : ''}`; } }
// Fetch the pasted sheet and report row count + how many plot_ids match the layout.
async function testSheet() {
  const url = (els.axSheetUrl?.value || '').trim();
  state.sheet.url = url; state.sheet.gid = '';
  const cands = sheetCsvCandidates(url, '');
  if (!cands.length) { setSheetMsg('That doesn’t look like a Google Sheet link — paste the sheet’s share or “Publish to web” URL.', 'err'); return; }
  setSheetMsg('Testing…', ''); if (els.axSheetTest) els.axSheetTest.disabled = true;
  try {
    let rows = null, err = 'the sheet is not public';
    for (const u of cands) {
      try {
        const res = await fetch(`${u}&_cb=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) { err = `HTTP ${res.status}`; continue; }
        const parsed = parseCSV(await res.text());
        if (!parsed.length) { err = 'the sheet looks empty'; continue; }
        if (!('plot_id' in parsed[0])) { err = 'no “plot_id” column — the header row must match plots.csv'; continue; }
        rows = parsed; break;
      } catch (e) { err = 'the request was blocked (is the sheet public?)'; }
    }
    if (!rows) { setSheetMsg(`Couldn’t read the sheet — ${err}.`, 'err'); return; }
    const ids = new Set(state.geom.map((g) => canonPlotId(g.id)));       // match with/without a "Plot-" prefix
    const withId = rows.filter((r) => (r.plot_id || '').trim());
    const matched = ids.size ? withId.filter((r) => ids.has(canonPlotId(r.plot_id))).length : 0;
    const ok = !ids.size || matched > 0;
    setSheetMsg(`✓ ${withId.length} row(s), plot_id column found${ids.size ? ` · ${matched}/${ids.size} match the layout` : ''}.`, ok ? 'ok' : 'err');
    onAlignmentChanged();
  } finally { if (els.axSheetTest) els.axSheetTest.disabled = false; }
}

// ─── Header project menu (switch / new / duplicate / rename / delete) ─────────
function projUrl(id) { return `${location.pathname}?${state.admin ? 'admin=1&' : ''}project=${encodeURIComponent(id)}`; }
async function initProjectBar() {
  if (!els.proj || !state.admin) return;                                  // admin-only — the client view is view-only (no switcher/save)
  let projects = [];
  // /api/projects only exists under server.py. If it's missing, we're on a plain static
  // server → saves can't write to disk (they'll download). Warn up-front so it's not a surprise.
  try { const r = await fetch('/api/projects'); state.serverSave = r.ok; if (r.ok) projects = (await r.json()).projects || []; }
  catch { state.serverSave = false; }
  if (!state.serverSave) showNotice('Save server not detected — Save will <strong>download</strong> files instead of writing to the project folder. Run <code>python server.py 8731</code> (not <code>http.server</code>) and reload.');
  projects = projects.filter((p) => sanitizeProjectId(p) === p);          // only loadable ids (drops legacy "My Demo" folders)
  if (!projects.includes(BOOT_PROJECT)) projects.unshift(BOOT_PROJECT);   // always show the current one
  els.projSelect.innerHTML = projects.map((p) => `<option value="${esc(p)}"${p === BOOT_PROJECT ? ' selected' : ''}>${esc(p)}</option>`).join('');
  els.proj.hidden = false;
  els.projSelect.addEventListener('change', () => { const id = sanitizeProjectId(els.projSelect.value); if (id && id !== BOOT_PROJECT) location.href = projUrl(id); });
  if (els.projTools) {
    els.projTools.hidden = false;
    els.projSave?.addEventListener('click', headerSave);
    els.projSettingsBtn?.addEventListener('click', toggleProjSettings);
    els.projSettingsClose?.addEventListener('click', closeProjSettings);
    els.projMenuBtn.addEventListener('click', toggleProjMenu);
    els.projMenu.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => onProjAction(b.dataset.act)));
    els.projNameOk.addEventListener('click', commitProjName);
    els.projNameInput.addEventListener('input', validateProjName);
    els.projNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitProjName(); if (e.key === 'Escape') closeProjName(); });
    els.projNameCancel.addEventListener('click', closeProjName);
    document.addEventListener('click', (e) => {
      if (!els.projTools.contains(e.target)) {
        els.projMenu.hidden = true;
        els.projMenuBtn.setAttribute('aria-expanded', 'false');
        closeProjSettings();
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProjSettings(); });
  }
}
function toggleProjSettings() {
  if (!els.projSettingsPopover) return;
  const open = els.projSettingsPopover.hidden;
  els.projSettingsPopover.hidden = !open;
  els.projSettingsBtn?.setAttribute('aria-expanded', String(open));
  if (open) {
    els.projMenu.hidden = true;
    els.projMenuBtn.setAttribute('aria-expanded', 'false');
    closeProjName();
    updateBrandAdminUI();
  }
}
function closeProjSettings() {
  if (els.projSettingsPopover) els.projSettingsPopover.hidden = true;
  els.projSettingsBtn?.setAttribute('aria-expanded', 'false');
}
function toggleProjMenu() {
  const open = els.projMenu.hidden;
  els.projMenu.hidden = !open;
  els.projMenuBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    closeProjName();
    closeProjSettings();
  }
}
let projAction = null;   // 'new' | 'saveas' | 'rename' | 'delete'
function onProjAction(act) {
  els.projMenu.hidden = true; els.projMenuBtn.setAttribute('aria-expanded', 'false');
  if (act === 'bundle') { exportBundle(); return; }           // one-shot download — no name/confirm row
  projAction = act;
  const titles = {
    new: ['Create a new empty project', 'new-project-id', ''],
    saveas: ['Duplicate this project as…', 'new-project-id', ''],
    rename: [`Rename “${BOOT_PROJECT}” to…`, 'new-project-id', BOOT_PROJECT],
    delete: [`Delete “${BOOT_PROJECT}”? Type its id to confirm`, BOOT_PROJECT, ''],
  }[act];
  els.projName.hidden = false;
  els.projNameInput.placeholder = titles[1]; els.projNameInput.value = titles[2];
  els.projNameOk.textContent = act === 'delete' ? 'Delete' : 'OK';
  els.projNameOk.classList.toggle('is-danger', act === 'delete');
  els.projNameHint.innerHTML = titles[0];
  els.projNameInput.focus(); els.projNameInput.select(); validateProjName();
}
function closeProjName() { els.projName.hidden = true; projAction = null; els.projNameHint.textContent = ''; els.projNameInput.classList.remove('is-bad'); }
function validateProjName() {
  const v = sanitizeProjectId(els.projNameInput.value);
  let ok = !!v;
  if (projAction === 'delete') ok = els.projNameInput.value === BOOT_PROJECT;
  else if (projAction === 'rename' && v === BOOT_PROJECT) ok = false;   // no-op
  els.projNameOk.disabled = !ok;
  els.projNameInput.classList.toggle('is-bad', !!els.projNameInput.value && !ok && projAction !== 'delete');
  return ok;
}
async function commitProjName() {
  if (!validateProjName()) return;
  const v = sanitizeProjectId(els.projNameInput.value);
  if (projAction === 'new') { location.href = projUrl(v); return; }        // empty project → build & save there
  if (projAction === 'saveas') { state.projectId = v; els.projNameHint.textContent = 'Duplicating…'; await exportSite(); location.href = projUrl(v); return; }
  if (projAction === 'rename') return renameProject(BOOT_PROJECT, v);
  if (projAction === 'delete') return deleteProject(BOOT_PROJECT);
}
async function renameProject(from, to) {
  els.projNameHint.textContent = 'Renaming…';
  try {
    const r = await fetch('/api/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error);
    location.href = projUrl(to);
  } catch (e) { els.projNameHint.innerHTML = `<span class="is-bad">Rename failed: ${esc(e.message)}</span>`; }
}
async function deleteProject(pid) {
  els.projNameHint.textContent = 'Deleting…';
  try {
    const r = await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: pid }) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error);
    // go to another existing project (or a fresh default)
    let next = 'sample';
    try { const pr = await fetch('/api/projects'); if (pr.ok) { const list = (await pr.json()).projects.filter((p) => p !== pid); if (list.length) next = list[0]; } } catch {}
    location.href = projUrl(next);
  } catch (e) { els.projNameHint.innerHTML = `<span class="is-bad">Delete failed: ${esc(e.message)}</span>`; }
}

// ─── Pano sphere (custom geometry so UVs match dir() exactly) ─────────────────
// High segH matters: the bottom/top vertex ring collapses to the nadir/zenith
// pole, so finer latitude bands shrink the converging "swirl" to a tiny point
// when looking straight down (a coarse sphere smears it into a big blob).
function buildPanoSphere(texture) {
  const segW = 256, segH = 256, pos = [], uv = [], idx = [];
  for (let iy = 0; iy <= segH; iy++) for (let ix = 0; ix <= segW; ix++) {
    const px = (ix / segW) * state.imgW, py = (iy / segH) * state.imgH, d = dir(px, py);
    pos.push(d.x * R, d.y * R, d.z * R); uv.push(px / state.imgW, py / state.imgH);
  }
  for (let iy = 0; iy < segH; iy++) for (let ix = 0; ix < segW; ix++) {
    const a = iy * (segW + 1) + ix, b = a + 1, c = a + (segW + 1), d = c + 1; idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
}

// ─── PNG site-plan drape (optional ground layer under the plots) ──────────────
// The imported plan image is draped onto the SAME ground plane as the plots (a
// subdivided grid over the plan-pixel rect [0..imgW]×[0..imgH], each node placed
// via placeOnSphere). It therefore shares the alignment transform and moves /
// scales / rotates together with the polygons; it keeps the landscaping graphics
// visible while the marked parcels render as interactive polygons on top.
function groundSegs() {                                  // square-ish cells regardless of plan aspect
  const long = 80, ar = state.imgW / state.imgH;
  return { segW: Math.max(8, Math.round(ar >= 1 ? long : long * ar)), segH: Math.max(8, Math.round(ar >= 1 ? long / ar : long)) };
}
function buildGroundMesh(texture) {
  const { segW, segH } = groundSegs(), uv = [], idx = [];
  for (let iy = 0; iy <= segH; iy++) for (let ix = 0; ix <= segW; ix++) uv.push(ix / segW, iy / segH);
  for (let iy = 0; iy < segH; iy++) for (let ix = 0; ix < segW; ix++) { const a = iy * (segW + 1) + ix, b = a + 1, c = a + (segW + 1), d = c + 1; idx.push(a, b, d, a, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((segW + 1) * (segH + 1) * 3), 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: state.groundImage?.opacity ?? 1, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2;   // pano(0) < drape(2) < fills(5) < lines(10) < labels(20)
  three.ground = { mesh, mat, segW, segH };
  three.scene.add(mesh); updateGroundGeometry();
}
function updateGroundGeometry() {                        // re-place the drape for the current transform
  const G = three?.ground; if (!G) return;
  const arr = G.mesh.geometry.attributes.position.array; let k = 0;
  for (let iy = 0; iy <= G.segH; iy++) for (let ix = 0; ix <= G.segW; ix++) {
    const d = placeOnSphere({ x: (ix / G.segW) * state.imgW, y: (iy / G.segH) * state.imgH }).multiplyScalar(R_DRAPE);
    arr[k++] = d.x; arr[k++] = d.y; arr[k++] = d.z;
  }
  G.mesh.geometry.attributes.position.needsUpdate = true; G.mesh.geometry.computeBoundingSphere();
}
function removeGround() {
  const G = three?.ground; if (!G) return;
  three.scene.remove(G.mesh); G.mesh.geometry.dispose(); G.mat.map?.dispose(); G.mat.dispose(); three.ground = null;
}
async function loadGroundImage(src, opacity = 1, file = null) { // src = what to load (path or object URL); file = the persistable path
  if (!three) return; removeGround();
  const persist = file || src;                            // never persist a transient blob: URL — keep the sample/… path
  state.groundImage = src ? { file: persist, opacity } : null;
  if (!src) { requestRender(); return; }
  try {
    const tex = await new THREE.TextureLoader().loadAsync(src);
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
    buildGroundMesh(tex);
  } catch { state.groundImage = null; if (state.admin && els.axPlanRow) els.axPlanRow.hidden = true; } // missing image ⇒ skip the drape, don't break the app
  requestRender();
}
function setGroundOpacity(o) {
  if (state.groundImage) state.groundImage.opacity = o;
  if (three?.ground) { three.ground.mat.opacity = o; requestRender(); }
}

// ─── Plot objects ─────────────────────────────────────────────────────────────
// Each plot vertex is projected from its ground-plane point straight through the
// camera origin onto the sphere — a true perspective image of a flat site plan.
// This never folds/inverts ("butterfly") and, because the plan is rigid on the
// ground, scaling/rotating/moving it stays uniform in every direction.
function placeOnSphere(p) { return groundPoint(p).normalize(); } // raw plot px → unit sphere dir
function subdivPx(pts, perEdge = 6) {                             // subdivide polygon edges in px
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let s = 0; s < perEdge; s++) { const t = s / perEdge; out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return out;
}
function getLabel(id) {
  if (labelCache.has(id)) return labelCache.get(id);
  const text = id.replace('Plot-', ''), c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 66px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 11; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.78)'; ctx.strokeText(text, 128, 66);
  ctx.fillStyle = '#fff'; ctx.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 20; labelCache.set(id, s); return s;
}
function buildPlotObject(g) {
  const oc = g.pts.reduce((m, p) => ({ x: m.x + p.x / g.pts.length, y: m.y + p.y / g.pts.length }), { x: 0, y: 0 });
  const centerDir = placeOnSphere(oc), bdir = subdivPx(g.pts).map(placeOnSphere);

  const fillPos = [], cf = centerDir.clone().multiplyScalar(R_PLOT);
  for (let i = 0; i < bdir.length; i++) {
    const p1 = bdir[i].clone().multiplyScalar(R_PLOT), p2 = bdir[(i + 1) % bdir.length].clone().multiplyScalar(R_PLOT);
    fillPos.push(cf.x, cf.y, cf.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fillPos, 3));
  const fill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: state.overlayOpacity, side: THREE.DoubleSide, depthWrite: false }));
  fill.renderOrder = 5; fill.userData = { id: g.id };

  const linePos = []; bdir.forEach((d) => { const p = d.clone().multiplyScalar(R_PLOT * 0.999); linePos.push(p.x, p.y, p.z); });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const line = new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false })); line.renderOrder = 10;

  const label = getLabel(g.id);
  const worldDiam = bdir[0].clone().multiplyScalar(R_PLOT).distanceTo(bdir[(bdir.length / 2) | 0].clone().multiplyScalar(R_PLOT));
  const lh = Math.max(8, worldDiam * 0.22); label.scale.set(lh * 2, lh, 1);
  label.position.copy(centerDir.clone().multiplyScalar(R_PLOT * 0.995));
  label.visible = state.showLabels;                  // plot-number annotation: shown only when toggled on

  const group = new THREE.Group(); group.add(fill, line, label);
  return { group, fill, line, label, centerDir };
}

// ─── Three.js init / rebuild ──────────────────────────────────────────────────
function initThree(texture) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(els.pano.clientWidth, els.pano.clientHeight);
  els.pano.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(state.view.fov, els.pano.clientWidth / els.pano.clientHeight, 0.1, 1100);
  const pano = buildPanoSphere(texture); scene.add(pano);
  three = { renderer, scene, camera, pano, raycaster: new THREE.Raycaster(), fillMeshes: [] };
  rebuildPlots();
  computeHome();                                   // always set state.home (for the ⊡ recenter button)
  Object.assign(state.view, state.savedView || state.home); // saved view = WYSIWYG; else auto-frame
  clampView();                                     // keep an old/steep saved view (e.g. fov 95, near-nadir) off the pole
  wireViewControls();
  renderLoop();
}
function disposeMeshGeoMat(o) { o.geometry?.dispose(); if (o.material) o.material.dispose(); }
function rebuildPlots() {
  if (!three) return;
  updateGroundGeometry();                          // keep the PNG drape glued to the same transform
  state.plots.forEach((p) => { three.scene.remove(p.group); disposeMeshGeoMat(p.fill); disposeMeshGeoMat(p.line); }); // labels are cached/reused
  state.plots.clear(); three.fillMeshes.length = 0;
  state.geom.forEach((g) => { const o = buildPlotObject(g); three.scene.add(o.group); state.plots.set(g.id, o); three.fillMeshes.push(o.fill); });
  colorPlots();
}

// frame the placed layout: mean direction + angular span → lon/lat/fov
function computeHome() {
  if (!state.geom.length) return;
  const mean = new THREE.Vector3(); const dirs = [];
  state.geom.forEach((g) => g.pts.forEach((p) => { const d = placeOnSphere(p); dirs.push(d); mean.add(d); }));
  mean.normalize();
  state.home.lon = Math.atan2(-mean.x, mean.z);
  // True Nadir Top-Down Bird's-Eye View (pitch -87° facing straight down at layout center)
  state.home.lat = -1.50;
  state.home.fov = FOV_MAX; // Max zoomed out (120°)
}

// ─── Render loop (continuous rAF; rebuilds geometry first if marked dirty) ────
// A steady loop (rather than one-shot rAF) keeps the camera applied and a frame
// always painted — robust against background rAF throttling. Cheap for ~10–400
// flat meshes; could be made on-demand later if idle GPU cost ever matters.
function requestRender(rebuild = false) { if (rebuild) plotsDirty = true; }
let cameraAnimTimer = null;
function renderLoop() {
  requestAnimationFrame(renderLoop);
  if (!three) return;
  if (plotsDirty) { plotsDirty = false; rebuildPlots(); }

  // Slow motion auto-pan (left to right) when enabled in client view (!state.admin) and user is idle
  if (state.autoPan && !state.admin && !cameraAnimTimer && Date.now() - (state.lastUserTouch || 0) > 2200) {
    state.view.lon = (state.view.lon + 0.00035) % TAU;
  }

  updateCamera();
  three.renderer.render(three.scene, three.camera);
  if (els.panel.classList.contains('open')) placePanel();   // keep the popover glued to its plot as the view moves
  if (els.landmarks && !els.landmarks.hidden) renderLandmarks();  // keep banners/pins/lines glued to the scene
  if (els.amenities && !els.amenities.hidden) renderAmenities();  // keep amenity icon-pins glued to the scene
  if (els.amCard && els.amCard.classList.contains('open')) placeAmCard(); // keep the amenity card glued to its pin
}
function updateCamera() {
  const cam = three.camera;
  if (cam.fov !== state.view.fov) { cam.fov = state.view.fov; cam.updateProjectionMatrix(); }
  // Drive the camera by yaw/pitch Euler angles (YXZ) rather than lookAt: lookAt
  // gimbal-locks at the poles (its up-vector goes parallel to the view dir), but
  // Euler is stable, so the user can look fully straight down/up. yaw = lon+π,
  // pitch = lat reproduces the old dirFromView orientation (level horizon).
  cam.rotation.set(state.view.lat, state.view.lon + Math.PI, 0, 'YXZ');
}
// Full pitch range — straight down gives the clean top-down "map" view of the
// (well-patched) nadir; straight up gives the sky. (No pole margin needed now
// that the camera no longer gimbal-locks at vertical.)
const clampLat = (l) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, l));
function clampView() { state.view.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, state.view.fov)); state.view.lat = clampLat(state.view.lat); }
function setFov(f) { state.view.fov = Math.max(FOV_MIN, Math.min(FOV_MAX, f)); requestRender(); }

// ─── Look-around + (admin) cluster-move controls ──────────────────────────────
function wireViewControls() {
  const el = els.pano, pointers = new Map();
  let panStart = null, didMove = false, pinch = 0, moveMode = false, dragLast = null, downXY = null;

  el.addEventListener('wheel', (e) => { e.preventDefault(); setFov(state.view.fov * (e.deltaY > 0 ? 1.06 : 1 / 1.06)); }, { passive: false });

  el.addEventListener('pointerdown', (e) => {
    try { el.setPointerCapture(e.pointerId); } catch {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      didMove = false;
      if (state.admin && state.adminMode === 'move') { moveMode = true; dragLast = rayToGround(e); downXY = { x: e.clientX, y: e.clientY }; panStart = null; } // drag anywhere → reposition layout
      else { moveMode = false; panStart = { x: e.clientX, y: e.clientY, lon: state.view.lon, lat: state.view.lat }; }
      el.classList.add('grabbing'); hideHint();
    } else if (pointers.size === 2) pinch = pDist(pointers);
  });

  el.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const d = pDist(pointers); if (pinch > 0) setFov(state.view.fov * (pinch / d)); pinch = d; hideTooltip(); return; }
    if (moveMode) {                                   // drag anywhere → slide the whole plan on the ground
      const g = rayToGround(e);
      if (g) {
        if (dragLast) { state.transform.tx += g.x - dragLast.x; state.transform.ty += g.z - dragLast.z; if (downXY && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 6) didMove = true; requestRender(true); }
        dragLast = g;                                 // (re)anchor on first/again ground contact
      }
    } else if (panStart) {                            // drag empty → look around
      const k = (state.view.fov * Math.PI / 180) / els.pano.clientHeight;
      const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) didMove = true;
      state.view.lon = panStart.lon - dx * k; state.view.lat = clampLat(panStart.lat + dy * k); requestRender();
    } else hover(e);
  });

  const end = (e) => {
    const wasClick = (panStart || moveMode) && !didMove, wasDrag = didMove && (moveMode || panStart);
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0;
    if (pointers.size === 0) {
      el.classList.remove('grabbing');
      if (wasClick) pick(e);
      if (wasDrag && state.admin) onAlignmentChanged(); // capture move (transform) OR look-around (view)
      moveMode = false; panStart = null; dragLast = null; downXY = null;
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); panStart = null; moveMode = false; el.classList.remove('grabbing'); });
  el.addEventListener('pointerleave', () => { if (!panStart && !moveMode) { clearHover(); hideTooltip(); } });

  els.zoomIn.addEventListener('click', () => { setFov(state.view.fov / 1.3); if (state.admin) onAlignmentChanged(); });
  els.zoomOut.addEventListener('click', () => { setFov(state.view.fov * 1.3); if (state.admin) onAlignmentChanged(); });
  els.zoomReset.addEventListener('click', () => { computeHome(); Object.assign(state.view, state.home); requestRender(); if (state.admin) onAlignmentChanged(); });
  els.labelToggle?.addEventListener('click', () => {
    state.showLabels = !state.showLabels;
    try { localStorage.setItem('b91-show-labels', state.showLabels ? '1' : '0'); } catch {}
    applyLabelVisibility();
  });
  applyLabelVisibility();                            // sync sprite visibility + button state to the saved preference
  els.landmarkToggle?.addEventListener('click', () => {
    state.showLandmarks = !state.showLandmarks;
    try { localStorage.setItem('b91-show-landmarks', state.showLandmarks ? '1' : '0'); } catch {}
    applyLandmarkVisibility();
  });
  applyLandmarkVisibility();
  els.amenityToggle?.addEventListener('click', () => {
    state.showAmenities = !state.showAmenities;
    try { localStorage.setItem('b91-show-amenities', state.showAmenities ? '1' : '0'); } catch {}
    if (!state.showAmenities) closeAmCard();
    applyAmenityVisibility();
  });
  applyAmenityVisibility();

  // Category Drawer & Controls wiring
  const touch = () => { state.lastUserTouch = Date.now(); };
  el.addEventListener('pointerdown', touch);
  el.addEventListener('wheel', touch);

  if (els.catDrawer) {
    ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach((evt) => {
      els.catDrawer.addEventListener(evt, (e) => e.stopPropagation());
    });
  }

  els.catDrawerToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    els.catDrawer?.classList.toggle('is-collapsed');
    const collapsed = els.catDrawer?.classList.contains('is-collapsed');
    if (els.catToggleIco) els.catToggleIco.textContent = collapsed ? '›' : '‹';
  });

  els.catNavL1?.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      touch();
      const act = btn.dataset.act;
      if (act === 'landmarks') {
        if (els.catLevel1) els.catLevel1.hidden = true;
        if (els.catLevel2) els.catLevel2.hidden = false;
        state.autoPan = true;
        applyCategoryFilter('ALL');
      } else if (act === 'aerial') {
        computeHome();
        animateCameraTo(state.home.lon, state.home.lat, FOV_MAX);
        state.autoPan = true;
      } else {
        const title = btn.textContent.replace('›', '').trim();
        showNotice(`<strong>${esc(title)}</strong> section selected.`);
      }
    });
  });

  els.catBackBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    touch();
    applyCategoryFilter('ALL');
    if (els.catLevel2) els.catLevel2.hidden = true;
    if (els.catLevel1) els.catLevel1.hidden = false;
  });

  els.catNav?.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      touch();
      applyCategoryFilter(btn.dataset.cat);
    });
  });

  els.fsToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
  els.audioToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
  els.autoPanToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.autoPan = !state.autoPan;
    els.autoPanToggle?.classList.toggle('is-active', state.autoPan);
  });

  new ResizeObserver(debounce(onResize, 120)).observe(els.pano);
}

function animateCameraTo(targetLon, targetLat, targetFov = null) {
  if (cameraAnimTimer) clearInterval(cameraAnimTimer);
  const steps = 35;
  let step = 0;
  let diffLon = targetLon - state.view.lon;
  while (diffLon < -Math.PI) diffLon += TAU;
  while (diffLon > Math.PI) diffLon -= TAU;
  const startLon = state.view.lon;
  const startLat = state.view.lat;
  const diffLat = targetLat - startLat;
  const startFov = state.view.fov;
  const diffFov = targetFov != null ? (targetFov - startFov) : 0;

  cameraAnimTimer = setInterval(() => {
    step++;
    const t = Math.sin((step / steps) * (Math.PI / 2));
    state.view.lon = startLon + diffLon * t;
    state.view.lat = startLat + diffLat * t;
    if (targetFov != null) setFov(startFov + diffFov * t);
    requestRender();
    if (step >= steps) {
      clearInterval(cameraAnimTimer);
      cameraAnimTimer = null;
    }
  }, 16);
}

function isLandmarkMatchCategory(lm, cat) {
  if (!lm || !cat || cat === 'ALL') return true;
  const c = String(cat).toUpperCase();
  const icon = String(lm.icon || '').toLowerCase();
  const label = String(lm.label || lm.name || '').toLowerCase();

  // 1. Check icon category mapping
  const grp = ICON_CATEGORIES.find((g) => g.category.toUpperCase() === c);
  if (grp && grp.icons.includes(icon)) return true;

  // 2. Keyword fallback on label/name text
  if (c === 'CONNECTIVITY' && /airport|train|railway|station|metro|bus|highway|road|expressway|flyover|junction/i.test(label)) return true;
  if (c === 'HEALTHCARE' && /hospital|clinic|pharma|medical|health|care|nursing/i.test(label)) return true;
  if (c === 'EDUCATION' && /school|college|university|institute|academy|tuition|vidyalaya/i.test(label)) return true;
  if (c === 'COMMERCIAL' && /mall|market|office|bank|hotel|shop|store|bazaar|complex|plaza|center|centre|hub/i.test(label)) return true;
  if (c === 'LIFESTYLE' && /restaurant|park|lake|stadium|club|pool|gym|garden|playground|court|theatre|theater|resort|cinema|movie/i.test(label)) return true;
  if (c === 'TEMPLE' && /temple|mandir|church|mosque|gurudwara|shrine|dargah|prayer/i.test(label)) return true;

  // 3. Direct landmark category property check
  if (lm.category && String(lm.category).toUpperCase() === c) return true;

  return false;
}

function applyCategoryFilter(cat) {
  state.selectedCategory = cat || 'ALL';
  if (els.catNav) {
    els.catNav.querySelectorAll('.cat-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.cat === state.selectedCategory);
    });
  }

  // Force landmarks visible when filtering by category
  state.showLandmarks = true;
  applyLandmarkVisibility();

  // Ensure DOM elements are initialized
  if (lmDom.size === 0 && state.landmarks.length > 0) {
    rebuildLandmarkDOM();
  }

  const matched = [];
  state.landmarks.forEach((lm) => {
    const isMatch = isLandmarkMatchCategory(lm, state.selectedCategory);
    const d = lmDom.get(lm.id);
    if (d) {
      if (state.selectedCategory === 'ALL') {
        d.banner.classList.remove('is-dimmed', 'is-cat-matched');
        d.pin.classList.remove('is-dimmed', 'is-cat-matched');
        d.line.classList.remove('is-dimmed', 'is-cat-matched');
      } else if (isMatch) {
        d.banner.classList.add('is-cat-matched');
        d.banner.classList.remove('is-dimmed');
        d.pin.classList.add('is-cat-matched');
        d.pin.classList.remove('is-dimmed');
        d.line.classList.add('is-cat-matched');
        d.line.classList.remove('is-dimmed');
      } else {
        d.banner.classList.add('is-dimmed');
        d.banner.classList.remove('is-cat-matched');
        d.pin.classList.add('is-dimmed');
        d.pin.classList.remove('is-cat-matched');
        d.line.classList.add('is-dimmed');
        d.line.classList.remove('is-cat-matched');
      }
    }
    if (isMatch) {
      matched.push(lm);
    }
  });

  const targetList = state.selectedCategory === 'ALL' ? state.landmarks : matched;

  if (targetList.length > 0 && three) {
    const validDirs = [];
    targetList.forEach((l) => {
      const pos = l.banner || l.hotspot;
      if (!pos) return;
      const lon = pos.lon != null ? pos.lon : (pos.lonDeg != null ? pos.lonDeg : null);
      const lat = pos.lat != null ? pos.lat : (pos.latDeg != null ? pos.latDeg : null);
      if (isFinite(lon) && isFinite(lat)) {
        validDirs.push(dirFromLonLat(lon, lat));
      }
    });

    if (validDirs.length > 0) {
      const mean = new THREE.Vector3();
      validDirs.forEach((v) => mean.add(v));
      mean.divideScalar(validDirs.length).normalize();
      const targetLon = Math.atan2(-mean.x, mean.z);
      const targetLat = clampLat(Math.asin(THREE.MathUtils.clamp(mean.y, -1, 1)));
      animateCameraTo(targetLon, targetLat, 72);
    }
  } else if (state.selectedCategory !== 'ALL') {
    showNotice(`No <strong>${esc(state.selectedCategory)}</strong> landmarks saved in this project yet.`);
  }
}

function toggleAudio() {
  if (!state.audioCtx) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      state.audioCtx = new AudioCtx();
      const bufferSize = state.audioCtx.sampleRate * 2;
      const buffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.012;
      const noise = state.audioCtx.createBufferSource();
      noise.buffer = buffer; noise.loop = true;
      const filter = state.audioCtx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 350;
      noise.connect(filter); filter.connect(state.audioCtx.destination);
      noise.start();
      state.audioPlaying = true;
    } catch {}
  } else if (state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
    state.audioPlaying = true;
  } else if (state.audioCtx.state === 'running') {
    state.audioCtx.suspend();
    state.audioPlaying = false;
  }
  if (els.audioToggle) {
    els.audioToggle.textContent = state.audioPlaying ? '🔊' : '🔇';
    els.audioToggle.classList.toggle('is-active', state.audioPlaying);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}
function onResize() {
  if (!three) return;
  const w = els.pano.clientWidth, h = els.pano.clientHeight;
  three.camera.aspect = w / h; three.camera.updateProjectionMatrix(); three.renderer.setSize(w, h); requestRender();
}
const pDist = (m) => { const [a, b] = [...m.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ─── Raycast helpers ──────────────────────────────────────────────────────────
function ndcOf(e) { const r = els.pano.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
function rayHit(e) {
  three.raycaster.setFromCamera(ndcOf(e), three.camera);
  const hits = three.raycaster.intersectObjects(three.fillMeshes.filter((m) => m.parent.visible), false);
  return hits.length ? hits[0].object.userData.id : null;
}
function rayToGround(e) {                               // pointer ray → point on the ground plane
  three.raycaster.setFromCamera(ndcOf(e), three.camera);
  const ray = three.raycaster.ray, dy = ray.direction.y;
  if (dy > -1e-4) return null;                          // at/above the horizon → no ground hit
  const t = (-GROUND_H - ray.origin.y) / dy;
  return t > 0 ? ray.direction.clone().multiplyScalar(t).add(ray.origin) : null;
}
function hover(e) {
  const id = rayHit(e);
  if (id !== state.hoverId) { clearHover(); state.hoverId = id; if (id) setEmphasis(id, true); requestRender(); }
  if (id) showTooltip(id, e); else hideTooltip();
}
function clearHover() { if (state.hoverId && state.hoverId !== state.selectedId) setEmphasis(state.hoverId, false); state.hoverId = null; }
function pick(e) {
  // Amenity pins are DOM markers, but #pano grabs pointer capture on pointerdown, so a
  // real tap's `click` lands on #pano — the marker's own click never fires. Hit-test the
  // marker here (it takes precedence over any plot beneath it) so tapping a pin opens it.
  const hitEl = document.elementFromPoint(e.clientX, e.clientY);
  const marker = hitEl?.closest?.('.am-marker');
  if (marker) { for (const [aid, m] of amDom) if (m === marker) { openAmCard(aid); return; } }
  // a render-bearing landmark banner is tappable too (mobile) — opens the same card sticky
  const lmb = hitEl?.closest?.('.lm-banner.has-render');
  if (lmb && !(state.admin && state.adminTab === 'landmarks')) { for (const [lid, d] of lmDom) if (d.banner === lmb) { openLmCard(lid, { hover: false }); return; } }
  const id = rayHit(e);
  if (id) openPanel(id);
  else { if (els.panel.classList.contains('open')) closePanel(); if (els.amCard?.classList.contains('open')) closeAmCard(); }
}
function setEmphasis(id, on) {
  const p = state.plots.get(id); if (!p || id === state.selectedId) return;
  p.fill.material.opacity = on ? Math.min(1, state.overlayOpacity + 0.3) : state.overlayOpacity;
  p.line.material.opacity = on ? 1 : 0.95; els.pano.style.cursor = on ? 'pointer' : '';
}

// ─── Data join → colour + legend ──────────────────────────────────────────────
function colorPlots() {
  state.plots.forEach((p, id) => {
    const row = state.rows.get(id), status = STATUS_META[row?.status] ? row.status : 'unknown';
    p.status = status; p.group.visible = state.activeFilters.has(status);
    if (id === state.selectedId) applySelectStyle(p, status);
    else { const c = STATUS_META[status].color; p.fill.material.color.setHex(c); p.fill.material.opacity = state.overlayOpacity; p.line.material.color.setHex(c); p.line.material.opacity = 0.95; }
  });
}
// Selection keeps the plot's STATUS colour (so availability stays readable) and
// just marks itself with a brighter fill + gold outline — never recolours the fill.
function applySelectStyle(p, status) {
  const c = STATUS_META[STATUS_META[status] ? status : 'unknown'].color;
  p.fill.material.color.setHex(c);
  p.fill.material.opacity = Math.min(1, Math.max(0.7, state.overlayOpacity + 0.3));
  p.line.material.color.setHex(SELECT_COLOR);
  p.line.material.opacity = 1;
}
function applyData() {
  const counts = { available: 0, reserved: 0, sold: 0, unknown: 0 };
  state.plots.forEach((p, id) => { const row = state.rows.get(id); counts[STATUS_META[row?.status] ? row.status : 'unknown']++; });
  renderLegend(counts); colorPlots();
  if (state.selectedId && state.rows.has(state.selectedId)) openPanel(state.selectedId, true);
  requestRender();
}
function renderLegend(counts) {
  els.legend.innerHTML = '';
  STATUS_ORDER.forEach((s) => {
    if (s === 'unknown' && counts.unknown === 0) return;
    const chip = document.createElement('button');
    chip.className = 'chip'; chip.type = 'button'; chip.dataset.status = s;
    chip.setAttribute('aria-pressed', String(state.activeFilters.has(s)));
    chip.innerHTML = `<span class="dot"></span>${STATUS_META[s].label} <span class="count">${counts[s]}</span>`;
    chip.addEventListener('click', () => toggleFilter(s));
    els.legend.appendChild(chip);
  });
}
function toggleFilter(status) {
  state.activeFilters.has(status) ? state.activeFilters.delete(status) : state.activeFilters.add(status);
  if (state.activeFilters.size === 0) STATUS_ORDER.forEach((s) => state.activeFilters.add(s));
  els.legend.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(state.activeFilters.has(c.dataset.status))));
  colorPlots(); requestRender();
}

// ─── Plot-number annotations (optional, default off) ──────────────────────────
function applyLabelVisibility() {
  state.plots.forEach((p) => { if (p.label) p.label.visible = state.showLabels; });
  if (els.labelToggle) {
    els.labelToggle.setAttribute('aria-pressed', String(state.showLabels));
    els.labelToggle.title = state.showLabels ? 'Hide plot numbers' : 'Show plot numbers';
  }
  requestRender();
}

// ─── Tooltip / hint ───────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function showTooltip(id, e) {                            // plot info card, anchored beside the cursor/plot
  const p = state.plots.get(id); if (!p) return;
  const row = state.rows.get(id) || {}, status = p.status || 'unknown';
  const meta = [['Area', row.size], ['Price', row.price], ['Facing', row.facing], ['Dimensions', row.dimensions]]
    .filter(([, v]) => v != null && String(v).trim())
    .map(([k, v]) => `<div class="t-row"><span class="t-k">${k}</span><span class="t-v">${esc(v)}</span></div>`).join('');
  els.tooltip.innerHTML =
    `<div class="t-head"><strong>${esc(id.replace('Plot-', 'Plot '))}</strong>` +
    `<span class="t-status"><span class="t-dot" style="background:var(--${status})"></span>${STATUS_META[status].label}</span></div>` +
    (meta ? `<div class="t-meta">${meta}</div>` : '');
  els.tooltip.classList.add('show'); els.tooltip.setAttribute('aria-hidden', 'false');
  const r = els.stage.getBoundingClientRect();
  let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
  if (x + els.tooltip.offsetWidth > r.width) x = e.clientX - r.left - els.tooltip.offsetWidth - 14;
  if (y + els.tooltip.offsetHeight > r.height) y = e.clientY - r.top - els.tooltip.offsetHeight - 14;
  els.tooltip.style.left = x + 'px'; els.tooltip.style.top = y + 'px';
}
function hideTooltip() { els.tooltip.classList.remove('show'); els.tooltip.setAttribute('aria-hidden', 'true'); }
function hideHint() { els.panoHint?.classList.add('gone'); }

// ─── Info panel ───────────────────────────────────────────────────────────────
function openPanel(id, keepScroll = false) {
  const row = state.rows.get(id); if (!row) return;
  if (typeof closeAmCard === 'function') closeAmCard();  // don't stack with an amenity card
  const status = STATUS_META[row.status] ? row.status : 'unknown';
  if (state.selectedId && state.selectedId !== id) restorePlotStyle(state.selectedId);
  state.selectedId = id;
  const p = state.plots.get(id);
  if (p) { applySelectStyle(p, status); requestRender(); }
  els.panel.dataset.status = status;
  els.panelBadge.textContent = STATUS_META[status].label; els.panelBadge.className = `status-badge ${STATUS_META[status].cls}`;
  els.panelTitle.textContent = id.replace('Plot-', 'Plot ');
  const block = (row.block || '').trim(); els.panelBlock.textContent = block ? `Block ${block}` : ''; els.panelBlock.hidden = !block;
  // Only render fields that actually have a value — blanks are hidden, not shown as "—".
  const val = (v) => (v != null && String(v).trim()) ? String(v).trim() : '';
  const price = val(row.price), rest = [['Area', row.size], ['Facing', row.facing], ['Dimensions', row.dimensions]].filter(([, v]) => val(v));
  els.panelGrid.innerHTML =
    (price ? `<div class="panel-price"><dt>Price</dt><dd>${esc(price)}</dd></div>` : '') +
    rest.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(val(v))}</dd></div>`).join('');
  els.panelGrid.hidden = !price && rest.length === 0;
  const notes = val(row.notes); els.panelNotes.textContent = notes; els.panelNotes.hidden = !notes;
  const mediaList = getPlotMediaList(row);
  let ctaWrap = els.panel.querySelector('.panel-cta-wrap');
  if (!ctaWrap) {
    ctaWrap = document.createElement('div');
    ctaWrap.className = 'panel-cta-wrap';
    els.walkBtn.parentNode.insertBefore(ctaWrap, els.walkBtn);
    els.walkBtn.hidden = true;
  }

  ctaWrap.innerHTML = '';
  if (!mediaList.length && !state.admin) {
    ctaWrap.hidden = true;
  } else {
    ctaWrap.hidden = false;
    mediaList.forEach((media, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = idx === 0 ? 'btn btn-primary panel-cta' : 'btn btn-primary panel-cta panel-cta-sub';
      const icon = media.type === 'youtube' ? '▶' : media.type === 'image' ? '📷' : '🌐';
      const defaultTitle = media.type === 'youtube' ? 'Watch Video' : media.type === 'image' ? 'View Photo' : 'Walk through this plot';
      btn.innerHTML = `<span>${icon} ${esc(media.title || defaultTitle)}</span><span class="panel-cta-arrow" aria-hidden="true">→</span>`;
      btn.onclick = () => openModal(media, row.plot_id);
      ctaWrap.appendChild(btn);
    });

    if (state.admin) {
      const adminBtn = document.createElement('button');
      adminBtn.type = 'button';
      adminBtn.className = 'btn btn-ghost panel-admin-edit-btn';
      adminBtn.style.cssText = 'width:100%; margin-top:6px; font-size:11px; padding:6px 10px; border:1px dashed var(--gold); color:var(--gold); display:flex; align-items:center; justify-content:center; gap:6px; background:rgba(212,175,55,0.08); border-radius:6px; cursor:pointer;';
      adminBtn.innerHTML = '<span>✏️ Edit Media & Plot Data</span><span style="font-size:10px; opacity:0.8;">(Admin) →</span>';
      adminBtn.onclick = async () => {
        await openTrace();
        const foundIdx = trace.plots.findIndex(p => canonPlotId(p.id) === canonPlotId(id));
        if (foundIdx >= 0) {
          trace.sel = foundIdx;
          refreshTraceList();
        }
      };
      ctaWrap.appendChild(adminBtn);
    }
  }
  els.walkHint.hidden = true; els.walkHint.textContent = '';
  els.panel.classList.add('open'); els.panel.setAttribute('aria-hidden', 'false');
  panelDims = { w: els.panel.offsetWidth, h: els.panel.offsetHeight };  // measure once per open (content height varies)
  placePanel();
}
// Anchor the info popover beside the selected plot's on-screen position, flipping
// sides / clamping so it never leaves the viewport. Called on open and every frame.
let panelDims = { w: 296, h: 220 };
function placePanel() {
  const pop = els.panel; if (!pop.classList.contains('open')) return;
  const r = els.pano.getBoundingClientRect();
  let ax = r.left + r.width / 2, ay = r.top + r.height / 2;
  const p = state.plots.get(state.selectedId);
  if (p && three) {
    const v = p.centerDir.clone().multiplyScalar(R_PLOT).project(three.camera);
    ax = r.left + (v.x * 0.5 + 0.5) * r.width;
    ay = r.top + (-v.y * 0.5 + 0.5) * r.height;
  }
  const vw = window.innerWidth, vh = window.innerHeight, M = 12, GAP = 18;
  const pw = panelDims.w, ph = panelDims.h;
  let leftBound = M;                                   // keep the popover clear of the admin bar (overlay on the left)
  if (state.admin && els.adminBar && !els.adminBar.hidden) leftBound = Math.max(M, els.adminBar.getBoundingClientRect().right + 8);
  let x = ax + GAP;                                    // default: to the right of the plot
  if (x + pw > vw - M) x = ax - GAP - pw;              // flip left if it would overflow
  x = Math.max(leftBound, Math.min(x, vw - pw - M));
  let y = ay - ph / 2;                                 // vertically centred on the plot
  y = Math.max(M, Math.min(y, vh - ph - M));
  pop.style.left = Math.round(x) + 'px'; pop.style.top = Math.round(y) + 'px';
  // a little caret pointing back at the plot, on whichever side the popover ended up
  let side = 'none';
  if (ax <= x - 2) side = 'left'; else if (ax >= x + pw + 2) side = 'right';
  pop.dataset.side = side;
  if (side !== 'none') pop.style.setProperty('--caret-y', Math.max(18, Math.min(ph - 18, ay - y)) + 'px');
}
function restorePlotStyle(id) {
  const p = state.plots.get(id); if (!p) return; const c = STATUS_META[p.status || 'unknown'].color;
  p.fill.material.color.setHex(c); p.fill.material.opacity = state.overlayOpacity; p.line.material.color.setHex(c); p.line.material.opacity = 0.95;
}
function closePanel() {
  els.panel.classList.remove('open'); els.panel.setAttribute('aria-hidden', 'true');
  if (state.selectedId) { restorePlotStyle(state.selectedId); state.selectedId = null; requestRender(); }
}

// ─── Media Type Parser & List Helper (3D Tour, YouTube, Image) ──────────────────
function parseMediaType(url) {
  if (!url) return { type: 'none', url: '' };
  url = String(url).trim();
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/i);
  if (ytMatch) {
    return { type: 'youtube', videoId: ytMatch[1], embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0` };
  }
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeoMatch) {
    return { type: 'vimeo', videoId: vimeoMatch[1], embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1` };
  }
  if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(url) || url.startsWith('data:image/')) {
    return { type: 'image', url };
  }
  return { type: 'walkthrough', url };
}

function getPlotMediaList(row) {
  if (!row) return [];
  const list = [];
  const urlsSeen = new Set();

  const addMediaItem = (type, url, title) => {
    if (!url || !String(url).trim()) return;
    const u = String(url).trim();
    if (urlsSeen.has(u)) return;
    urlsSeen.add(u);
    const parsed = parseMediaType(u);
    const finalType = type || (parsed.type !== 'none' ? parsed.type : 'walkthrough');
    const defaultTitle = finalType === 'youtube' ? 'Watch Video' : finalType === 'image' ? 'View Photo' : 'Walk through this plot';
    list.push({
      type: finalType,
      url: u,
      title: title || defaultTitle,
      embedUrl: parsed.embedUrl,
    });
  };

  // 1. In-memory mediaList array
  if (Array.isArray(row.mediaList)) {
    row.mediaList.forEach(item => {
      addMediaItem(item.type, item.url || item.tour_url, item.title || item.label);
    });
  }

  // 2. media_json string or array
  if (row.media_json) {
    try {
      const arr = typeof row.media_json === 'string' ? JSON.parse(row.media_json) : row.media_json;
      if (Array.isArray(arr)) {
        arr.forEach(item => {
          addMediaItem(item.type, item.url || item.tour_url, item.title || item.label);
        });
      }
    } catch {}
  }

  // 3. Fallback CSV columns
  addMediaItem('walkthrough', row.tour_url, 'Walk through this plot');
  addMediaItem('youtube', row.video_url, 'Watch Video');
  addMediaItem('image', row.image_url, 'View Photo');

  return list;
}

// ─── Tour & Media modal ────────────────────────────────────────────────────────
let lastFocused = null;
function openModal(media, plotId = '') {
  lastFocused = document.activeElement;
  let rawUrl = '', type = 'walkthrough', title = '', embedUrl = '';
  if (typeof media === 'string') {
    rawUrl = media;
    const parsed = parseMediaType(rawUrl);
    type = parsed.type; embedUrl = parsed.embedUrl;
  } else if (media && typeof media === 'object') {
    rawUrl = media.url || media.tour_url || '';
    const parsed = parseMediaType(rawUrl);
    type = media.type || parsed.type;
    embedUrl = media.embedUrl || parsed.embedUrl;
    title = media.title || '';
    if (!plotId && media.plot_id) plotId = media.plot_id;
  }

  const plotName = plotId ? plotId.replace('Plot-', 'Plot ') : '';
  const mediaTypeName = type === 'youtube' ? 'YouTube Video' : type === 'vimeo' ? 'Vimeo Video' : type === 'image' ? 'Image' : '3D Walkthrough';
  const displayTitle = title ? `${title}${plotName ? ' · ' + plotName : ''}` : `${mediaTypeName}${plotName ? ' · ' + plotName : ''}`;

  els.modalTitle.textContent = displayTitle;
  els.modalOpenNew.href = rawUrl || '#';
  els.modalSpinner.style.display = 'grid';

  let imgEl = els.modal.querySelector('.modal-img');
  if (!imgEl) {
    imgEl = document.createElement('img');
    imgEl.className = 'modal-img';
    imgEl.style.cssText = 'max-width:100%; max-height:80vh; object-fit:contain; display:none; margin:auto; border-radius:8px; box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    els.tourFrame.parentNode.appendChild(imgEl);
  }

  if (type === 'youtube') {
    els.tourFrame.style.display = 'block';
    imgEl.style.display = 'none';
    imgEl.src = '';
    els.tourFrame.src = embedUrl || rawUrl;
    els.tourFrame.onload = () => { els.modalSpinner.style.display = 'none'; };
  } else if (type === 'image') {
    els.tourFrame.style.display = 'none';
    els.tourFrame.src = 'about:blank';
    imgEl.src = rawUrl;
    imgEl.style.display = 'block';
    imgEl.onload = () => { els.modalSpinner.style.display = 'none'; };
    imgEl.onerror = () => { els.modalSpinner.style.display = 'none'; };
  } else {
    els.tourFrame.style.display = 'block';
    imgEl.style.display = 'none';
    imgEl.src = '';
    els.tourFrame.src = rawUrl || 'about:blank';
    els.tourFrame.onload = () => { els.modalSpinner.style.display = 'none'; };
  }

  els.modal.classList.add('open');
  els.modal.setAttribute('aria-hidden', 'false');
  document.addEventListener('keydown', onModalKey);
  setTimeout(() => els.modalClose.focus(), 0);
}
function closeModal() {
  els.modal.classList.remove('open');
  els.modal.setAttribute('aria-hidden', 'true');
  els.tourFrame.src = 'about:blank';
  const imgEl = els.modal.querySelector('.modal-img');
  if (imgEl) { imgEl.src = ''; imgEl.style.display = 'none'; }
  els.tourFrame.style.display = 'block';
  document.removeEventListener('keydown', onModalKey);
  lastFocused?.focus?.();
}
function onModalKey(e) {
  if (e.key === 'Escape') return closeModal();
  if (e.key === 'Tab') {
    const f = [...els.modal.querySelectorAll('button, a[href], iframe, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

// ─── Notices / sync / refresh ─────────────────────────────────────────────────
function showNotice(msg) { els.notice.innerHTML = `<strong>Heads up:</strong> ${msg}`; els.notice.hidden = false; clearTimeout(showNotice._t); showNotice._t = setTimeout(() => { els.notice.hidden = true; }, 9000); }
function setSync(src) { const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); els.syncMeta.textContent = `${state.rows.size} plots · ${src} · synced ${t}`; }
async function refresh() { els.refreshBtn.disabled = true; try { const src = await loadData(); applyData(); setSync(src); } catch (err) { showNotice(err.message); } finally { els.refreshBtn.disabled = false; } }

// ─── Alignment: load / save / admin UI ────────────────────────────────────────
// An alignment = the overlay transform PLUS the camera view, so the client
// reproduces exactly what the admin set up (WYSIWYG) instead of re-framing.
function getCustomSections() {
  const mc = state.menuConfig || {};
  if (Array.isArray(mc.customSections) && mc.customSections.length) {
    return mc.customSections.filter(s => s && s.enabled !== false);
  }

  const legacy = [];
  const secDefs = [
    { key: 'location_intel', defaultTitle: 'LOCATION INTELLIGENCE' },
    { key: 'walkthrough_video', defaultTitle: 'WALKTHROUGH VIDEO' },
    { key: 'virtual_tour', defaultTitle: 'VIRTUAL TOUR' },
    { key: 'gallery', defaultTitle: 'GALLERY' },
    { key: 'brochure', defaultTitle: 'BROCHURE' },
    { key: 'contact_us', defaultTitle: 'CONTACT US' }
  ];

  secDefs.forEach(({ key, defaultTitle }) => {
    const sec = mc[key];
    if (sec && sec.enabled) {
      legacy.push({
        id: `legacy_${key}`,
        type: key,
        title: (sec.title || defaultTitle).trim(),
        enabled: true,
        groups: Array.isArray(sec.groups) ? sec.groups : (sec.items ? [{ id: 'g1', title: 'GENERAL', items: sec.items }] : []),
        items: sec.items || [],
        images: sec.images || [],
        image: sec.image || '',
        imageName: sec.imageName || '',
        about: sec.about || '',
        phone: sec.phone || '',
        email: sec.email || ''
      });
    }
  });

  state.menuConfig = state.menuConfig || {};
  state.menuConfig.customSections = legacy;
  return legacy;
}

function menuConfigData() {
  const sections = getCustomSections();
  const cleanGroupItems = (groups) => {
    if (!Array.isArray(groups)) return [];
    return groups.map((g, gIdx) => ({
      id: g.id || `grp_${gIdx + 1}`,
      title: g.title || `Sub-Group ${gIdx + 1}`,
      items: Array.isArray(g.items) ? g.items.map((i, iIdx) => {
        const vName = i.videoName || i.fileName || (i.videoBlob || i.fileBlob ? (i.videoBlob || i.fileBlob).name : '');
        const pName = i.pdfName || i.fileName || (i.pdfBlob || i.fileBlob ? (i.pdfBlob || i.fileBlob).name : '');
        const fName = i.fileName || vName || pName || '';
        const vUrl = i.videoUrl || i.url || '';
        const pUrl = i.pdfUrl || i.url || '';
        const mainUrl = i.url || vUrl || pUrl || fName || '';
        return {
          id: i.id || `item_${iIdx + 1}`,
          name: i.name || i.title || '',
          url: mainUrl,
          videoUrl: vUrl || mainUrl,
          videoName: vName || fName,
          pdfUrl: pUrl || mainUrl,
          pdfName: pName || fName,
          fileName: fName
        };
      }) : []
    }));
  };

  return {
    customSections: sections.map((sec, idx) => ({
      id: sec.id || `sec_${Date.now()}_${idx}`,
      type: sec.type,
      title: sec.title || '',
      enabled: true,
      groups: cleanGroupItems(sec.groups),
      images: Array.isArray(sec.images) ? sec.images.map(img => ({ name: img.name, url: img.url })) : [],
      image: sec.image || '',
      imageName: sec.imageName || '',
      about: sec.about || '',
      phone: sec.phone || '',
      email: sec.email || ''
    }))
  };
}

function parseAlignment(d) {
  const t = (d && d.transform) ? d.transform : d || {};
  const transform = { tx: +t.tx || 0, ty: +t.ty || 0, scale: +t.scale || 1, rotation: (t.rotationDeg != null ? t.rotationDeg * Math.PI / 180 : +t.rotation || 0) };
  let view = null;
  if (d && d.view) { const v = d.view; view = { lon: (v.lonDeg != null ? v.lonDeg * Math.PI / 180 : +v.lon || 0), lat: (v.latDeg != null ? v.latDeg * Math.PI / 180 : +v.lat || 0), fov: +v.fov || 70 }; }
  const opacity = (d && d.opacity != null) ? +d.opacity : null;
  const gi = d && d.groundImage; const groundImage = (gi && gi.file) ? { file: gi.file, opacity: gi.opacity != null ? +gi.opacity : 1 } : null;
  const pi = d && d.panoImage; const panoImage = (pi && pi.file) ? { file: pi.file } : null;
  const savedAt = (d && d.savedAt) || '';
  const b = d && d.brand;
  const brand = b ? { name: (b.name || '').toString(), tagline: (b.tagline || '').toString(), logo: (b.logo && b.logo.file) ? b.logo.file : null, _ver: savedAt } : null;
  const dc = d && d.data, sh = dc && dc.sheet;                       // plot-data source (Google Sheet | committed file)
  const data = { enabled: !!(dc && dc.source === 'sheet'), url: (sh && sh.url || '').toString(), gid: (sh && sh.gid != null ? String(sh.gid) : '') };
  const menuConfig = d && d.menuConfig ? d.menuConfig : null;
  return { transform, view, opacity, groundImage, panoImage, brand, data, menuConfig, savedAt };
}
async function loadAlignmentFile() {                    // committed file → {transform, view} | null
  try { const res = await fetch(dataUrl('alignment.json'), { cache: 'no-store' }); if (!res.ok) return null; return parseAlignment(await res.json()); }
  catch { return null; }
}
function readDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? parseAlignment(JSON.parse(raw)) : null; } catch { return null; } }
function alignmentData() {
  return { version: 1, note: 'Build91 plot-map overlay alignment', savedAt: new Date().toISOString(),
    transform: { tx: +state.transform.tx.toFixed(4), ty: +state.transform.ty.toFixed(4), scale: +state.transform.scale.toFixed(4), rotationDeg: +(state.transform.rotation * 180 / Math.PI).toFixed(2) },
    view: { lonDeg: +(state.view.lon * 180 / Math.PI).toFixed(2), latDeg: +(state.view.lat * 180 / Math.PI).toFixed(2), fov: Math.round(state.view.fov) },
    opacity: +state.overlayOpacity.toFixed(2),
    ...(state.groundImage ? { groundImage: { file: state.groundImage.file, opacity: +(+state.groundImage.opacity).toFixed(2) } } : {}),
    ...(state.panoImage ? { panoImage: { file: state.panoImage.file } } : {}),
    ...(brandData() ? { brand: brandData() } : {}),
    ...(sheetData() ? { data: sheetData() } : {}),
    ...(menuConfigData() ? { menuConfig: menuConfigData() } : {}) };
}
// Serialise the plot-data source (only when a sheet URL has been configured).
function sheetData() {
  const url = (state.sheet.url || '').trim(); if (!url) return null;
  return { source: state.sheet.enabled ? 'sheet' : 'file', sheet: { url, ...(state.sheet.gid ? { gid: state.sheet.gid } : {}) } };
}
function onAlignmentChanged() { if (!state.admin) return; try { localStorage.setItem(DRAFT_KEY, JSON.stringify(alignmentData())); } catch {} scheduleSessionSave(); setAxStatus('Unsaved changes — click <strong>Save</strong> in the top bar to apply.'); }
function setAxStatus(msg) { if (els.axStatus) els.axStatus.innerHTML = msg; }

// ─── Working session (full in-browser snapshot of in-progress admin work) ─────
// The lightweight DRAFT (localStorage, above) only holds the alignment numbers.
// A real working session must also survive a reload of the TRACED GEOMETRY and the
// IMPORTED PLAN IMAGE (a freshly imported PNG lives only as an in-memory blob — its
// sample/… path doesn't exist on disk until "Export site files…"). A multi-MB image
// blob won't fit localStorage, so the session lives in IndexedDB, which stores Blobs.
const SESSION_DB = 'b91-admin', SESSION_STORE = 'session', SESSION_KEY = 'current';
function idbOpen() {
  return new Promise((res, rej) => {
    let r; try { r = indexedDB.open(SESSION_DB, 1); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => r.result.createObjectStore(SESSION_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(val) {
  const db = await idbOpen();
  try { await new Promise((res, rej) => { const tx = db.transaction(SESSION_STORE, 'readwrite'); tx.objectStore(SESSION_STORE).put(val, SESSION_KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }
  finally { db.close(); }
}
async function idbGet() {
  const db = await idbOpen();
  try { return await new Promise((res, rej) => { const g = db.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE).get(SESSION_KEY); g.onsuccess = () => res(g.result || null); g.onerror = () => rej(g.error); }); }
  finally { db.close(); }
}
async function idbDel() {
  const db = await idbOpen();
  try { await new Promise((res) => { const tx = db.transaction(SESSION_STORE, 'readwrite'); tx.objectStore(SESSION_STORE).delete(SESSION_KEY); tx.oncomplete = res; tx.onerror = res; tx.onabort = res; }); }
  finally { db.close(); }
}
function buildSession() {                                // a complete snapshot to resume from
  return {
    savedAt: new Date().toISOString(),
    align: alignmentData(),                             // transform + view + opacity + groundImage(path)
    imgW: state.imgW, imgH: state.imgH,
    geom: state.geom.map((g) => ({ id: g.id, pts: g.pts.map((p) => ({ x: p.x, y: p.y })) })),
    rows: [...state.rows.values()],                     // per-plot status/data filled so far
    plan: state.planBlob ? { name: state.planName || 'plan.web.png', blob: state.planBlob, opacity: state.groundImage?.opacity ?? 1 } : null,
    pano: state.panoBlob ? { name: state.panoName || 'pano.web.jpg', blob: state.panoBlob } : null,
    brandLogo: state.brand.logoBlob ? { name: state.brand.logoName || 'logo.web.png', blob: state.brand.logoBlob } : null,
    landmarks: state.landmarks.map((l) => ({ id: l.id, label: l.label, distance: l.distance, driveTime: l.driveTime, icon: l.icon, render: l.render, renderBlob: l.renderBlob || null, hotspot: { ...l.hotspot }, banner: { ...l.banner } })),
    amenities: state.amenities.map((a) => ({ id: a.id, name: a.name, icon: a.icon, facing: a.facing, size: a.size, dimensions: a.dimensions, price: a.price, block: a.block, tour_url: a.tour_url, notes: a.notes, render: a.render, renderBlob: a.renderBlob || null, hotspot: { ...a.hotspot } })),
  };
}
let sessionTimer = null;
function scheduleSessionSave() {                         // debounce: many slider ticks → one write
  if (!state.admin) return;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => saveSession(false), 600);
}
async function saveSession(explicit) {
  if (!state.admin) return;
  clearTimeout(sessionTimer);
  try {
    await idbPut(buildSession());
    setSessionStatus(`Session saved · ${new Date().toLocaleTimeString()}`, true);
  } catch (e) {
    setSessionStatus(`Couldn't save session: ${e?.message || e}`, false);
  }
}
async function clearSession() {
  try { await idbDel(); } catch {}
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
  setSessionStatus('Working session discarded.', false);
}
function setSessionStatus(msg, saved) {
  if (!els.axSessionStatus) return;
  els.axSessionStatus.textContent = msg;
  els.axSessionStatus.classList.toggle('is-saved', !!saved);
}
// Apply a restored session's geometry/data into state (before initThree builds meshes).
function applySessionGeometry(sess) {
  if (sess.imgW) state.imgW = sess.imgW;
  if (sess.imgH) state.imgH = sess.imgH;
  if (Array.isArray(sess.geom) && sess.geom.length) {
    state.geom = sess.geom.map((g) => ({ id: g.id, pts: g.pts.map((p) => ({ x: +p.x, y: +p.y })) }));
    recomputeAnchorAndK();
  }
  if (Array.isArray(sess.rows)) state.rows = new Map(sess.rows.map((r) => [r.plot_id, r]));
}

const clampScale = (v) => Math.max(0.05, Math.min(3, Math.round((+v || 0) * 1000) / 1000));
function setScale(v) {                                   // single source of truth for slider + stepper + number field
  state.transform.scale = clampScale(v);
  if (els.axScale) els.axScale.value = state.transform.scale;
  if (els.axScaleNum) els.axScaleNum.value = (+state.transform.scale).toFixed(2);
  requestRender(true); onAlignmentChanged();
}
const clampRot = (v) => { let d = +v; if (!isFinite(d)) d = 0; return Math.max(-180, Math.min(180, Math.round(d * 10) / 10)); }; // 0.1° granularity
function setRotation(deg) {                              // single source of truth for rotate slider + stepper + number field
  const d = clampRot(deg);
  state.transform.rotation = d * Math.PI / 180;
  if (els.axRot) els.axRot.value = d;
  if (els.axRotNum) els.axRotNum.value = d.toFixed(1);
  requestRender(true); onAlignmentChanged();
}
function updateAdminUI() {
  if (!state.admin) return;
  els.axScale.value = state.transform.scale; els.axScaleNum.value = (+state.transform.scale).toFixed(2);
  const deg = clampRot(state.transform.rotation * 180 / Math.PI); els.axRot.value = deg; if (els.axRotNum) els.axRotNum.value = deg.toFixed(1);
  els.axOpacity.value = state.overlayOpacity; els.axOpacityVal.textContent = `${Math.round(state.overlayOpacity * 100)}%`;
}
function setAdminMode(mode) {
  state.adminMode = mode;
  els.axModeLook?.classList.toggle('is-on', mode === 'look');
  els.axModeMove?.classList.toggle('is-on', mode === 'move');
  els.pano.classList.toggle('move-mode', mode === 'move');
  if (els.panoHint) els.panoHint.textContent = mode === 'move'
    ? 'Drag anywhere to move the whole layout · sliders scale/rotate'
    : 'Drag to look around · click a plot for details';
}
async function saveAlignmentAs() {
  await saveToProject([['alignment.json', JSON.stringify(alignmentData(), null, 2), 'application/json']], '<code>alignment.json</code>');
}
// serialise the current geometry/data back to the files the client loads
function buildPlotsSVG() {
  const r1 = (n) => Math.round(n * 10) / 10;
  const body = state.geom.map((g) => {
    const pts = g.pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ');
    const c = g.pts.reduce((m, p) => ({ x: m.x + p.x / g.pts.length, y: m.y + p.y / g.pts.length }), { x: 0, y: 0 });
    return `    <g class="plot-group">\n      <polygon id="${g.id}" class="plot" points="${pts}" />\n      <text class="plot-label" x="${r1(c.x)}" y="${r1(c.y)}">${g.id.replace('Plot-', '')}</text>\n    </g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(state.imgW)} ${Math.round(state.imgH)}" class="plot-overlay" preserveAspectRatio="xMidYMid meet">\n  <!-- Exported by the Build91 admin trace tool. -->\n  <g class="plots">\n${body}\n  </g>\n</svg>\n`;
}
function buildPlotsCSV(rowsMap = state.rows) {
  const cols = ['plot_id', 'status', 'facing', 'size', 'dimensions', 'price', 'block', 'tour_url', 'video_url', 'image_url', 'media_json', 'notes'];
  const esc = (v) => { v = (v ?? '').toString(); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = state.geom.map((g) => {
    const r = rowsMap.get(g.id) || { plot_id: g.id };
    if (r.mediaList && r.mediaList.length) {
      if (!r.media_json || typeof r.media_json !== 'string') {
        r.media_json = JSON.stringify(r.mediaList);
      }
      const mainTour = r.mediaList.find(m => m.type === 'walkthrough') || r.mediaList[0];
      if (mainTour && !r.tour_url) r.tour_url = mainTour.url;
      const mainYt = r.mediaList.find(m => m.type === 'youtube');
      if (mainYt && !r.video_url) r.video_url = mainYt.url;
      const mainImg = r.mediaList.find(m => m.type === 'image');
      if (mainImg && !r.image_url) r.image_url = mainImg.url;
    }
    return cols.map((c) => esc(c === 'plot_id' ? g.id : r[c])).join(',');
  });
  return cols.join(',') + '\n' + rows.join('\n') + '\n';
}
// ─── Server-side save ─────────────────────────────────────────────────────────
// POST files to server.py, which writes them into projects/<projectId>/. Files are
// [name, data, mime]; text is sent as-is, Blobs as base64. Throws on any failure so
// callers can fall back to a browser download.
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
async function serverSave(files) {
  const payload = { project: state.projectId, files: [] };
  for (const [name, data] of files) {
    if (data instanceof Blob) payload.files.push({ name, encoding: 'base64', data: await blobToBase64(data) });
    else payload.files.push({ name, encoding: 'utf8', data: String(data) });
  }
  const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`server responded ${res.status}`);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'save failed');
  return j;
}
function downloadFiles(files) {
  files.forEach(([n, data, mime]) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' })); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
}
const tagFiles = (arr) => arr.map((f) => `<code>${f[0]}</code>`).join(', ');
// Save one or more files to the current project on the server; download-fallback if the
// server isn't reachable (e.g. running under a plain static server).
async function saveToProject(files, label) {
  if (!sanitizeProjectId(state.projectId)) { setAxStatus('Set a valid <strong>Project ID</strong> first (letters, digits, - or _).'); return false; }
  try {
    const j = await serverSave(files);
    state.serverSave = true;
    const client = `${location.origin}/?project=${encodeURIComponent(j.project)}`;
    setAxStatus(`Saved ${label} to <code>${j.dir}/</code>. Client: <a href="${client}" target="_blank">/?project=${esc(j.project)}</a>`);
    return true;
  } catch (e) {
    state.serverSave = false;
    downloadFiles(files);
    const msg = `Save server not running — <strong>downloaded</strong> ${label} to your browser instead of <code>projects/${esc(state.projectId)}/</code>. Start it with <code>python server.py 8731</code> (not <code>http.server</code>), then Save again.`;
    setAxStatus(msg); showNotice(msg);
    return false;
  }
}
// Referenced images that live on disk (no in-memory blob). When SAVING TO A NEW project
// (clone/save-as), fetch them from the source project so the new directory is complete.
// Same-project saves skip this — those files are already in the target dir.
async function fetchReferencedImages(haveNames) {
  const refs = [];
  const add = (path) => { if (path && !haveNames.has(baseName(path))) refs.push(baseName(path)); };
  if (!state.panoBlob) add(state.panoImage?.file);
  if (!state.planBlob) add(state.groundImage?.file);
  if (!state.brand.logoBlob) add(state.brand.logo);
  state.amenities.forEach((a) => { if (!a.renderBlob) add(a.render); });
  state.landmarks.forEach((l) => { if (!l.renderBlob) add(l.render); });
  const out = [];
  for (const name of new Set(refs)) {
    try { const r = await fetch(`${state.assetBase}/${name}`); if (r.ok) out.push([name, await r.blob(), 'application/octet-stream']); } catch {}
  }
  return out;
}
function collectCustomMenuFiles() {
  const files = [];
  const addBlob = (blob, filename, mime) => {
    if (blob && filename) {
      files.push([baseName(filename), blob, mime || 'application/octet-stream']);
    }
  };

  const sections = getCustomSections();
  sections.forEach((sec) => {
    if (sec.type === 'gallery' && Array.isArray(sec.images)) {
      sec.images.forEach(img => {
        if (img.blob && img.name) addBlob(img.blob, img.name, 'image/jpeg');
      });
    } else if (sec.type === 'contact_us') {
      if (sec.imageBlob && (sec.imageName || sec.image)) {
        addBlob(sec.imageBlob, sec.imageName || sec.image, 'image/jpeg');
      }
    } else {
      const groups = Array.isArray(sec.groups) ? sec.groups : [];
      groups.forEach((grp) => {
        (grp.items || []).forEach((item) => {
          const blob = item.fileBlob || item.videoBlob || item.pdfBlob;
          const name = item.fileName || item.videoName || item.pdfName;
          if (blob && name) {
            const mime = name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : (name.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');
            addBlob(blob, name, mime);
          }
        });
      });
    }
  });

  return files;
}

// one-click export of the whole site to the server-side project directory
async function exportSite() {
  const hasGeom = state.geom.length > 0;
  const hasLandmarks = state.landmarks.length > 0;
  const hasAmenities = state.amenities.length > 0;
  const hasPano = !!(state.panoBlob || state.panoImage?.file);
  const hasBrand = !!(state.brand?.name || state.brand?.tagline || state.brand?.logo || state.brand?.logoBlob);
  const hasPlan = !!(trace.planBlob || state.planBlob || trace.objURL || state.groundImage?.file);

  if (!hasGeom && !hasLandmarks && !hasAmenities && !hasPano && !hasBrand && !hasPlan) {
    setAxStatus('Nothing to save yet — import/trace plots, set a panorama, or add landmarks / amenities first.');
    return false;
  }
  const planBlob = trace.planBlob || state.planBlob || (trace.objURL ? await (await fetch(trace.objURL)).blob() : null);
  const planName = trace.srcName || state.planName || 'plan.web.png';
  const panoBlob = state.panoBlob, panoName = state.panoName || baseName(state.panoImage?.file || '');
  // When a live sheet is the source, snapshot it into plots.csv so the committed file stays
  // a current fallback (and is what a standalone bundle bakes in); fall back to state.rows.
  let plotsCsv = hasGeom ? buildPlotsCSV() : '';
  if (hasGeom && state.sheet.enabled && state.sheet.url) { const snap = await fetchSheetRows().catch(() => null); if (snap && snap.size) plotsCsv = buildPlotsCSV(snap); }
  const files = [
    ...(hasGeom ? [['plots.svg', buildPlotsSVG(), 'image/svg+xml'], ['plots.csv', plotsCsv, 'text/csv']] : []),
    ['alignment.json', JSON.stringify(alignmentData(), null, 2), 'application/json'],
    ...(planBlob ? [[baseName(planName), planBlob, 'image/png']] : []),
    ...(panoBlob && panoName ? [[panoName, panoBlob, 'image/jpeg']] : []),
    ...(state.brand.logoBlob && state.brand.logo ? [[baseName(state.brand.logo), state.brand.logoBlob, 'image/png']] : []),
    ['landmarks.json', JSON.stringify(buildLandmarksData(), null, 2), 'application/json'],
    ['amenities.json', JSON.stringify(buildAmenitiesData(), null, 2), 'application/json'],
    // freshly-imported render images (an already-on-disk path has no blob to re-ship)
    ...state.amenities.filter((a) => a.renderBlob && a.render).map((a) => [baseName(a.render), a.renderBlob, 'image/jpeg']),
    ...state.landmarks.filter((l) => l.renderBlob && l.render).map((l) => [baseName(l.render), l.renderBlob, 'image/jpeg']),
    // custom menu files (videos, pdfs, images)
    ...collectCustomMenuFiles()
  ];
  // saving to a different project → copy over the on-disk images too, so the clone is complete
  if (state.projectId !== BOOT_PROJECT) {
    const have = new Set(files.map((f) => f[0]));
    files.push(...await fetchReferencedImages(have));
  }
  const ok = await saveToProject(files, tagFiles(files));
  if (ok) saveSession(true);
  return ok;
}
// header "💾 Save" — write ALL project files to the current project dir, with inline feedback
async function headerSave() {
  const btn = els.projSave; if (!btn || btn.disabled) return;
  const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = 'Saving…';
  let ok = false;
  try { ok = await exportSite(); } catch {}
  btn.innerHTML = ok ? '✓ Saved' : '⚠ Downloaded — no server';
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, ok ? 1600 : 2600);
}
// ─── Standalone bundle export (portable folder for any static host / iframe embed) ─────
// Asks server.py to zip the app shell + this project's files into a self-contained folder
// that runs view-only anywhere (no server, no admin) and copies an <iframe> embed snippet.
async function exportBundle() {
  const id = sanitizeProjectId(state.projectId);
  if (!id) { showNotice('Set a valid Project ID first (letters, digits, - or _).'); return; }
  showNotice(`Building the standalone site for “${esc(id)}”…`);
  try {
    const res = await fetch(`/api/export-bundle?project=${encodeURIComponent(id)}`);
    if (!res.ok) { let m = `server responded ${res.status}`; try { m = (await res.json()).error || m; } catch {} throw new Error(m); }
    const blob = await res.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${id}-plotmap.zip`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    const embed = `<iframe src="https://YOUR-HOST/${id}/index.html" style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen loading="lazy"></iframe>`;
    let copied = false; try { await navigator.clipboard.writeText(embed); copied = true; } catch {}
    showNotice(`Downloaded <code>${id}-plotmap.zip</code>. Unzip &amp; upload the <code>${id}/</code> folder to any static host — it runs view-only with no server. ${copied ? 'An <strong>&lt;iframe&gt; embed snippet is on your clipboard</strong>' : 'Embed it with an <code>&lt;iframe&gt;</code> pointing at <code>index.html</code>'} (replace <code>YOUR-HOST</code> with your domain).`);
  } catch (e) {
    showNotice(`Couldn’t build the standalone site (${esc(String(e.message || e))}). This needs <code>python server.py</code> running — a plain static server can’t zip the bundle.`);
  }
}
function wireAdmin() {
  if (!state.admin) return;
  document.body.classList.add('is-admin'); els.adminBar.hidden = false;
  if (els.catDrawer) els.catDrawer.hidden = true;
  updateAdminUI();
  setAdminMode('look');

  els.axModeLook.addEventListener('click', () => setAdminMode('look'));
  els.axModeMove.addEventListener('click', () => setAdminMode('move'));
  els.axPlanOpacity.addEventListener('input', () => { const o = parseFloat(els.axPlanOpacity.value); els.axPlanOpacityVal.textContent = `${Math.round(o * 100)}%`; setGroundOpacity(o); onAlignmentChanged(); });
  els.axScale.addEventListener('input', () => setScale(els.axScale.value));
  els.axScaleDown.addEventListener('click', () => setScale(state.transform.scale - 0.01));
  els.axScaleUp.addEventListener('click', () => setScale(state.transform.scale + 0.01));
  // live while typing (don't reformat the field mid-edit); commit/clean up on change
  els.axScaleNum.addEventListener('input', () => { state.transform.scale = clampScale(els.axScaleNum.value); els.axScale.value = state.transform.scale; requestRender(true); onAlignmentChanged(); });
  els.axScaleNum.addEventListener('change', () => setScale(els.axScaleNum.value));
  els.axRot.addEventListener('input', () => setRotation(els.axRot.value));
  els.axRotDown.addEventListener('click', () => setRotation((state.transform.rotation * 180 / Math.PI) - 0.1));
  els.axRotUp.addEventListener('click', () => setRotation((state.transform.rotation * 180 / Math.PI) + 0.1));
  // live while typing (don't reformat the field mid-edit); commit/clean up on change
  els.axRotNum.addEventListener('input', () => { const d = clampRot(els.axRotNum.value); state.transform.rotation = d * Math.PI / 180; els.axRot.value = d; requestRender(true); onAlignmentChanged(); });
  els.axRotNum.addEventListener('change', () => setRotation(els.axRotNum.value));
  els.axOpacity.addEventListener('input', () => { state.overlayOpacity = parseFloat(els.axOpacity.value); els.axOpacityVal.textContent = `${Math.round(state.overlayOpacity * 100)}%`; colorPlots(); requestRender(); onAlignmentChanged(); });
  els.axReset.addEventListener('click', () => { state.transform = IDENTITY(); state.savedView = null; state.overlayOpacity = 0.5; updateAdminUI(); colorPlots(); computeHome(); Object.assign(state.view, state.home); requestRender(true); try { localStorage.removeItem(DRAFT_KEY); } catch {} clearSession(); setAxStatus('Reset to generated placement.'); });
  els.axSessionSave?.addEventListener('click', () => saveSession(true));
  els.axSessionClear?.addEventListener('click', clearSession);
  els.axPano.addEventListener('click', () => els.axPanoFile.click());
  els.axPanoFile.addEventListener('change', () => { const f = els.axPanoFile.files?.[0]; if (f) setPanoFromFile(f); els.axPanoFile.value = ''; });
  els.axBrandName?.addEventListener('input', () => { state.brand.name = els.axBrandName.value; applyBrand(); onAlignmentChanged(); });
  els.axBrandTagline?.addEventListener('input', () => { state.brand.tagline = els.axBrandTagline.value; applyBrand(); onAlignmentChanged(); });
  els.axBrandLogo?.addEventListener('click', () => els.axBrandLogoFile.click());
  els.axBrandLogoFile?.addEventListener('change', () => { const f = els.axBrandLogoFile.files?.[0]; if (f) setBrandLogo(f); els.axBrandLogoFile.value = ''; });
  els.axBrandLogoClear?.addEventListener('click', clearBrandLogo);
  updateBrandAdminUI();
  els.axSheetOn?.addEventListener('change', () => { state.sheet.enabled = els.axSheetOn.checked; updateSheetAdminUI(); if (state.sheet.enabled && !state.sheet.url) setSheetMsg('Paste your Google Sheet link, then Test.', ''); onAlignmentChanged(); });
  els.axSheetUrl?.addEventListener('input', () => { state.sheet.url = els.axSheetUrl.value; state.sheet.gid = ''; onAlignmentChanged(); });
  els.axSheetTest?.addEventListener('click', testSheet);
  updateSheetAdminUI();
  els.axTabBtnAlign.addEventListener('click', () => setAdminTab('align'));
  els.axTabBtnLandmarks.addEventListener('click', () => setAdminTab('landmarks'));
  els.axTabBtnAmenities?.addEventListener('click', () => setAdminTab('amenities'));
  els.axLmAdd.addEventListener('click', addLandmark);
  els.axLmSave?.addEventListener('click', saveLandmarksAs);
  els.axLmLoad?.addEventListener('click', () => els.axLmFile?.click());
  els.axLmFile?.addEventListener('change', async () => { const f = els.axLmFile.files?.[0]; if (f) { try { setLandmarks(parseLandmarks(JSON.parse(await f.text()))); onLandmarksChanged(); setAxStatus(`Loaded ${state.landmarks.length} landmark(s) from ${f.name}.`); } catch (err) { setAxStatus(`Could not read that landmarks file (${err.message}).`); } } els.axLmFile.value = ''; });
  els.axAmAdd?.addEventListener('click', addAmenity);
  els.axAmSave?.addEventListener('click', saveAmenitiesAs);
  els.axAmLoad?.addEventListener('click', () => els.axAmFile?.click());
  els.axAmFile?.addEventListener('change', async () => { const f = els.axAmFile.files?.[0]; if (f) { try { setAmenities(parseAmenities(JSON.parse(await f.text()))); onAmenitiesChanged(); setAxStatus(`Loaded ${state.amenities.length} amenit${state.amenities.length === 1 ? 'y' : 'ies'} from ${f.name}.`); } catch (err) { setAxStatus(`Could not read that amenities file (${err.message}).`); } } els.axAmFile.value = ''; });
  setAdminTab('align');
  els.axSave?.addEventListener('click', saveAlignmentAs);
  els.axExport?.addEventListener('click', exportSite);
  els.axLoad?.addEventListener('click', () => els.axFile?.click());
  els.axFile?.addEventListener('change', async () => {
    const f = els.axFile.files?.[0]; if (!f) return;
    try {
      const a = parseAlignment(JSON.parse(await f.text()));
      state.transform = a.transform;
      if (a.opacity != null) state.overlayOpacity = a.opacity;
      if (a.groundImage) { loadGroundImage(assetUrl(a.groundImage.file), a.groundImage.opacity, a.groundImage.file); els.axPlanRow.hidden = false; els.axPlanOpacity.value = a.groundImage.opacity; els.axPlanOpacityVal.textContent = `${Math.round(a.groundImage.opacity * 100)}%`; }
      if (a.panoImage?.file) { state.panoImage = a.panoImage; state.panoBlob = null; state.panoName = null; loadPanoTexture(assetUrl(a.panoImage.file)).then(swapPano).catch(() => {}); updatePanoName(); }
      if (state.brand._url) { try { URL.revokeObjectURL(state.brand._url); } catch {} } // loaded file's brand replaces the current one
      state.brand = { name: a.brand?.name || '', tagline: a.brand?.tagline || '', logo: a.brand?.logo || null, logoBlob: null, logoName: null, _url: null, _ver: a.brand?._ver || '' };
      applyBrand();
      if (a.data) { state.sheet = { url: a.data.url || '', gid: a.data.gid || '', enabled: !!a.data.enabled }; updateSheetAdminUI(); }
      computeHome(); Object.assign(state.view, a.view || state.home); clampView(); // restore saved view (kept off the pole)
      updateAdminUI(); colorPlots(); requestRender(true); onAlignmentChanged(); setAxStatus(`Loaded ${f.name}.`);
    } catch (err) { setAxStatus(`Could not read that file (${err.message}).`); }
    els.axFile.value = '';
  });
  wireTrace();
}

// ═══ Import & Trace editor (admin: PNG / DXF → plot polygons) ══════════════════
// A 2D canvas editor: load a site-plan PNG (kept as the draped ground layer) or a
// DXF (vector), capture each parcel as a polygon, then "Use these plots" pushes
// them into the live pano where the existing alignment tools place them.
const trace = {
  open: false, bitmap: null, imgData: null, W: 0, H: 0, isRaster: false,
  objURL: null, planBlob: null, srcName: '', view: { zoom: 1, ox: 0, oy: 0 }, fit: 1,
  mode: 'auto', plots: [], draft: null, sel: -1, drag: null, down: null,
  thresh: 36, simplify: 3, snap: true, seq: 0, dxf: null,
};
const hexColor = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
const traceCtx = () => els.traceCanvas.getContext('2d');

// — geometry helpers —
function polyCentroid(pts) { let x = 0, y = 0; pts.forEach((p) => { x += p.x; y += p.y; }); return { x: x / pts.length, y: y / pts.length }; }
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function douglasPeucker(pts, eps) {
  if (pts.length < 3 || eps <= 0) return pts.slice();
  const sq = eps * eps, keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const d2 = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); const ex = p.x - (a.x + t * dx), ey = p.y - (a.y + t * dy); return ex * ex + ey * ey; };
  const st = [[0, pts.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let md = 0, mk = -1; for (let k = i + 1; k < j; k++) { const d = d2(pts[k], pts[i], pts[j]); if (d > md) { md = d; mk = k; } } if (md > sq && mk > 0) { keep[mk] = 1; st.push([i, mk], [mk, j]); } }
  return pts.filter((_, k) => keep[k]);
}
// flood-fill the cell under (ix,iy), trace its boundary, simplify → polygon (image px)
function autoTraceAt(ix, iy) {
  const D = trace.imgData; if (!D) return null;
  const W = trace.W, H = trace.H, data = D.data, sx = Math.round(ix), sy = Math.round(iy);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  const o = (sy * W + sx) * 4, sr = data[o], sg = data[o + 1], sb = data[o + 2], th2 = trace.thresh * trace.thresh;
  const match = (x, y) => { const i = (y * W + x) * 4, dr = data[i] - sr, dg = data[i + 1] - sg, db = data[i + 2] - sb; return dr * dr + dg * dg + db * db <= th2; };
  const mask = new Uint8Array(W * H), st = [[sx, sy]]; let count = 0;
  while (st.length) {
    const [x, y] = st.pop(); if (mask[y * W + x]) continue;
    let xl = x; while (xl >= 0 && !mask[y * W + xl] && match(xl, y)) xl--; xl++;
    let xr = x; while (xr < W && !mask[y * W + xr] && match(xr, y)) xr++; xr--;
    for (let xx = xl; xx <= xr; xx++) { mask[y * W + xx] = 1; count++; }
    for (let xx = xl; xx <= xr; xx++) { if (y > 0 && !mask[(y - 1) * W + xx] && match(xx, y - 1)) st.push([xx, y - 1]); if (y + 1 < H && !mask[(y + 1) * W + xx] && match(xx, y + 1)) st.push([xx, y + 1]); }
  }
  if (count < 12 || count > W * H * 0.6) return null;
  const c = traceBoundary(mask, W, H); if (!c || c.length < 4) return null;
  const simp = douglasPeucker(c, trace.simplify || 1);
  return simp.length >= 3 ? simp : null;
}
// Moore-neighbour boundary tracing of a binary mask (8-connected) with backtrack px
function traceBoundary(mask, W, H) {
  const set = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  let sx = -1, sy = -1;
  for (let y = 0; y < H && sx < 0; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { sx = x; sy = y; break; }
  if (sx < 0) return null;
  const OFF = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // clockwise
  const out = []; let cx = sx, cy = sy, bx = sx - 1, by = sy, iter = 0, max = W * H * 8 + 1000;
  do {
    out.push({ x: cx, y: cy });
    let bIdx = OFF.findIndex((d) => d[0] === bx - cx && d[1] === by - cy); if (bIdx < 0) bIdx = 4;
    let found = -1, px = bx, py = by;
    for (let k = 1; k <= 8; k++) { const di = (bIdx + k) % 8, nx = cx + OFF[di][0], ny = cy + OFF[di][1]; if (set(nx, ny)) { found = di; break; } px = nx; py = ny; }
    if (found < 0) break;
    bx = px; by = py; cx += OFF[found][0]; cy += OFF[found][1]; iter++;
  } while ((cx !== sx || cy !== sy) && iter < max);
  return out;
}

// — view transforms —
const toImg = (sx, sy) => ({ x: (sx - trace.view.ox) / trace.view.zoom, y: (sy - trace.view.oy) / trace.view.zoom });
const toScr = (x, y) => ({ x: x * trace.view.zoom + trace.view.ox, y: y * trace.view.zoom + trace.view.oy });
function resizeTraceCanvas() { const cv = els.traceCanvas, st = els.traceStage; cv.width = st.clientWidth; cv.height = st.clientHeight; }
function fitTrace() {
  const cv = els.traceCanvas; if (!trace.W) return;
  const z = Math.min(cv.width / trace.W, cv.height / trace.H) * 0.94; trace.fit = z; trace.view.zoom = z;
  trace.view.ox = (cv.width - trace.W * z) / 2; trace.view.oy = (cv.height - trace.H * z) / 2;
  trace.userView = false;                                // auto-fit follows container size until the user zooms/pans
}

// — drawing —
function drawTrace() {
  const g = traceCtx(), cv = els.traceCanvas; g.clearRect(0, 0, cv.width, cv.height);
  if (trace.bitmap) { g.save(); g.translate(trace.view.ox, trace.view.oy); g.scale(trace.view.zoom, trace.view.zoom); g.drawImage(trace.bitmap, 0, 0); g.restore(); }
  else if (trace.W) { const a = toScr(0, 0), b = toScr(trace.W, trace.H); g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); g.strokeStyle = 'rgba(255,255,255,.15)'; g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
  trace.plots.forEach((p, i) => drawPoly(g, p, i === trace.sel));
  if (trace.draft) drawDraft(g, trace.draft);
}
function drawPoly(g, p, selected) {
  if (p.pts.length < 2) return;
  const col = hexColor(STATUS_META[p.status]?.color ?? STATUS_META.unknown.color);
  g.beginPath(); p.pts.forEach((pt, i) => { const s = toScr(pt.x, pt.y); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); }); g.closePath();
  g.fillStyle = col + '4d'; g.fill(); g.lineWidth = selected ? 3 : 2; g.strokeStyle = selected ? '#d4af37' : col; g.stroke();
  const cs = toScr(...Object.values(polyCentroid(p.pts))); g.font = 'bold 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.72)'; g.strokeText(p.id.replace('Plot-', ''), cs.x, cs.y); g.fillStyle = '#fff'; g.fillText(p.id.replace('Plot-', ''), cs.x, cs.y);
  if (selected || trace.mode === 'edit') p.pts.forEach((pt) => { const s = toScr(pt.x, pt.y); g.beginPath(); g.arc(s.x, s.y, 4, 0, TAU); g.fillStyle = '#d4af37'; g.fill(); g.lineWidth = 1; g.strokeStyle = '#000'; g.stroke(); });
}
function drawDraft(g, pts) {
  g.beginPath(); pts.forEach((pt, i) => { const s = toScr(pt.x, pt.y); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); });
  g.lineWidth = 2; g.strokeStyle = '#d4af37'; g.stroke();
  pts.forEach((pt) => { const s = toScr(pt.x, pt.y); g.beginPath(); g.arc(s.x, s.y, 4, 0, TAU); g.fillStyle = '#d4af37'; g.fill(); });
}

// — capture / edit —
function nextPlotId() { const id = `Plot-A${101 + trace.seq}`; trace.seq++; return id; }
function snapTarget(p, exclude) {
  if (!trace.snap) return null; const rad = 10 / trace.view.zoom, r2 = rad * rad; let best = null, bd = r2;
  trace.plots.forEach((pl, pi) => pl.pts.forEach((v, vi) => { if (exclude && exclude.plot === pi && exclude.vert === vi) return; const dx = v.x - p.x, dy = v.y - p.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: v.x, y: v.y }; } }));
  return best;
}
function addPlot(pts, id, status) {
  trace.plots.push({ id: id || nextPlotId(), status: status || 'available', pts });
  trace.sel = trace.plots.length - 1; refreshTraceList(); drawTrace();
}
function pickVertex(sx, sy) { let best = null, bd = 64; trace.plots.forEach((pl, pi) => pl.pts.forEach((v, vi) => { const s = toScr(v.x, v.y), dx = s.x - sx, dy = s.y - sy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { plot: pi, vert: vi }; } })); return best; }
function pickPlot(p) { for (let i = trace.plots.length - 1; i >= 0; i--) if (pointInPoly(p, trace.plots[i].pts)) return i; return -1; }
function doAutoTrace(pt) {
  const poly = autoTraceAt(pt.x, pt.y);
  if (!poly) { setTraceHint('No clear cell there — adjust “Colour match”, or switch to Manual.', true); return; }
  addPlot(trace.snap ? poly.map((q) => snapTarget(q, null) || q) : poly);
  setTraceHint('Captured. Click the next plot.');
}
function doManualClick(pt) {
  let p = snapTarget(pt, null) || { x: pt.x, y: pt.y };
  if (!trace.draft) { trace.draft = [p]; }
  else { const f = toScr(trace.draft[0].x, trace.draft[0].y), s = toScr(p.x, p.y); if (trace.draft.length >= 3 && Math.hypot(f.x - s.x, f.y - s.y) < 10) { addPlot(trace.draft.slice()); trace.draft = null; } else trace.draft.push(p); }
}

// — pointer / wheel —
function traceDown(e) {
  const r = els.traceCanvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  trace.down = { sx, sy, ox: trace.view.ox, oy: trace.view.oy, moved: false, button: e.button, img: toImg(sx, sy) };
  if (trace.mode === 'edit' && e.button === 0) { const hv = pickVertex(sx, sy); if (hv) { trace.sel = hv.plot; trace.drag = hv; } else { const pi = pickPlot(toImg(sx, sy)); if (pi >= 0) trace.sel = pi; } drawTrace(); }
}
function traceMove(e) {
  if (!trace.down) return;
  const r = els.traceCanvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, dx = sx - trace.down.sx, dy = sy - trace.down.sy;
  if (Math.abs(dx) + Math.abs(dy) > 3) trace.down.moved = true;
  if (trace.drag) { let p = toImg(sx, sy); const sg = snapTarget(p, trace.drag); if (sg) p = sg; trace.plots[trace.drag.plot].pts[trace.drag.vert] = p; drawTrace(); return; }
  const pan = trace.down.button === 1 || trace.down.button === 2 || (trace.mode !== 'manual' && trace.down.button === 0);
  if (pan && trace.down.moved) { trace.view.ox = trace.down.ox + dx; trace.view.oy = trace.down.oy + dy; trace.userView = true; drawTrace(); }
}
function traceUp() {
  if (!trace.down) return; const d = trace.down;
  if (trace.drag) { trace.drag = null; refreshTraceList(); }
  else if (!d.moved && d.button === 0) { if (trace.mode === 'auto') doAutoTrace(d.img); else if (trace.mode === 'manual') doManualClick(d.img); }
  trace.down = null; drawTrace();
}
function traceWheel(e) {
  e.preventDefault(); const r = els.traceCanvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, before = toImg(sx, sy);
  trace.view.zoom = Math.max(trace.fit * 0.2, Math.min(trace.fit * 24, trace.view.zoom * (e.deltaY > 0 ? 1 / 1.1 : 1.1)));
  trace.view.ox = sx - before.x * trace.view.zoom; trace.view.oy = sy - before.y * trace.view.zoom; trace.userView = true; drawTrace();
}
function traceDbl(e) {
  if (trace.mode === 'manual' && trace.draft && trace.draft.length >= 3) { addPlot(trace.draft.slice()); trace.draft = null; drawTrace(); return; }
  if (trace.mode === 'edit') { const r = els.traceCanvas.getBoundingClientRect(), hv = pickVertex(e.clientX - r.left, e.clientY - r.top); if (hv && trace.plots[hv.plot].pts.length > 3) { trace.plots[hv.plot].pts.splice(hv.vert, 1); refreshTraceList(); drawTrace(); } }
}

// — side list / modes / hint —
function setTraceMode(m) { trace.mode = m; trace.draft = null; ['Auto', 'Manual', 'Edit'].forEach((n) => els['traceMode' + n].classList.toggle('is-on', n.toLowerCase() === m)); els.traceCanvas.style.cursor = m === 'manual' ? 'crosshair' : 'default'; drawTrace(); }
function setTraceHint(msg, warn) { els.traceHint.textContent = msg; els.traceHint.classList.toggle('is-warn', !!warn); }
function refreshTraceList() {
  els.traceCount.textContent = `${trace.plots.length} plot${trace.plots.length === 1 ? '' : 's'}`;
  els.traceList.innerHTML = '';
  trace.plots.forEach((p, i) => {
    if (!p.mediaList) p.mediaList = getPlotMediaList(p);

    const syncMedia = () => {
      p.media_json = JSON.stringify(p.mediaList);
      const mainTour = p.mediaList.find(m => m.type === 'walkthrough') || p.mediaList[0];
      p.tour_url = mainTour ? mainTour.url : (p.tour_url || '');
      const mainYt = p.mediaList.find(m => m.type === 'youtube');
      p.video_url = mainYt ? mainYt.url : (p.video_url || '');
      const mainImg = p.mediaList.find(m => m.type === 'image');
      p.image_url = mainImg ? mainImg.url : (p.image_url || '');
    };
    syncMedia();

    const li = document.createElement('li'); li.className = 'trace-li' + (i === trace.sel ? ' is-sel' : '');
    const idIn = document.createElement('input'); idIn.className = 'trace-id'; idIn.value = p.id.replace('Plot-', ''); idIn.title = 'Plot number';
    idIn.addEventListener('change', () => { p.id = 'Plot-' + idIn.value.trim(); drawTrace(); });
    
    const sel = document.createElement('select'); sel.className = 'trace-status';
    STATUS_ORDER.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = STATUS_META[s].label; if (s === p.status) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', () => { p.status = sel.value; drawTrace(); });

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-ghost btn-xs trace-edit-btn';
    editBtn.type = 'button';
    editBtn.textContent = i === trace.sel ? '▲ Close' : '✏️ Edit';
    editBtn.title = 'Edit plot data and media';
    editBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      trace.sel = (trace.sel === i ? -1 : i);
      refreshTraceList();
      drawTrace();
    });

    const del = document.createElement('button'); del.className = 'trace-del'; del.type = 'button'; del.textContent = '✕'; del.title = 'Delete plot';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      trace.plots.splice(i, 1);
      if (trace.sel >= trace.plots.length) trace.sel = trace.plots.length - 1;
      refreshTraceList();
      drawTrace();
    });

    if (p.mediaList.length) {
      const mediaBadge = document.createElement('span');
      mediaBadge.className = 'trace-media-badge';
      mediaBadge.title = `${p.mediaList.length} media item(s) attached`;
      mediaBadge.textContent = `🎬 ${p.mediaList.length}`;
      li.append(idIn, mediaBadge, sel, editBtn, del);
    } else {
      li.append(idIn, sel, editBtn, del);
    }

    li.addEventListener('click', (ev) => {
      if (ev.target.closest('input,select,button,.trace-edit,label')) return;
      trace.sel = (trace.sel === i ? -1 : i);
      refreshTraceList();
      drawTrace();
    });

    if (i === trace.sel) {
      const ed = document.createElement('div'); ed.className = 'trace-edit';
      
      const field = (label, key, ph, onUpdate) => {
        const w = document.createElement('label'); w.className = 'trace-field'; w.append(document.createTextNode(label));
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = p[key] || ''; if (ph) inp.placeholder = ph;
        inp.addEventListener('input', () => {
          p[key] = inp.value;
          if (onUpdate) onUpdate(inp.value);
        });
        w.appendChild(inp); return w;
      };

      ed.append(
        field('Price', 'price', 'e.g. ₹ 12,50,000'),
        field('Area', 'size', 'e.g. 1,500 sq ft'),
        field('Facing', 'facing', 'e.g. East'),
        field('Dimensions', 'dimensions', "e.g. 30' × 50'"),
      );

      // Quick Media Link Fields
      ed.append(
        field('3D Tour URL', 'tour_url', 'https://demo.build91.in/...', (val) => {
          if (val) {
            const existing = p.mediaList.find(m => m.type === 'walkthrough');
            if (existing) existing.url = val;
            else p.mediaList.unshift({ type: 'walkthrough', url: val, title: '3D Virtual Walkthrough' });
          }
          syncMedia();
        }),
        field('YouTube Video URL', 'video_url', 'https://www.youtube.com/watch?v=...', (val) => {
          if (val) {
            const existing = p.mediaList.find(m => m.type === 'youtube');
            if (existing) existing.url = val;
            else p.mediaList.push({ type: 'youtube', url: val, title: 'Watch Video' });
          }
          syncMedia();
        }),
        field('Image / Photo URL', 'image_url', 'https://images.unsplash.com/...', (val) => {
          if (val) {
            const existing = p.mediaList.find(m => m.type === 'image');
            if (existing) existing.url = val;
            else p.mediaList.push({ type: 'image', url: val, title: 'View Photo' });
          }
          syncMedia();
        })
      );

      // Multi-Media Manager Box
      const mediaBox = document.createElement('div');
      mediaBox.className = 'trace-media-box';

      const mediaHead = document.createElement('div');
      mediaHead.className = 'trace-media-head';
      mediaHead.textContent = `ATTACHED MEDIA (${p.mediaList.length} ATTACHMENT${p.mediaList.length === 1 ? '' : 'S'})`;
      mediaBox.appendChild(mediaHead);

      const itemsList = document.createElement('div');
      itemsList.className = 'trace-media-items-list';

      p.mediaList.forEach((mItem, mIdx) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'trace-media-item-row';

        const typeSel = document.createElement('select');
        typeSel.className = 'trace-media-type-sel';
        typeSel.innerHTML = `
          <option value="walkthrough" ${mItem.type === 'walkthrough' ? 'selected' : ''}>🌐 3D Tour</option>
          <option value="youtube" ${mItem.type === 'youtube' ? 'selected' : ''}>▶ YouTube</option>
          <option value="image" ${mItem.type === 'image' ? 'selected' : ''}>📷 Image</option>
        `;
        typeSel.addEventListener('change', () => {
          mItem.type = typeSel.value;
          syncMedia();
          refreshTraceList();
        });

        const titleInp = document.createElement('input');
        titleInp.type = 'text';
        titleInp.className = 'trace-media-title-inp';
        titleInp.placeholder = 'Label (e.g. 3D Tour, Video)';
        titleInp.value = mItem.title || '';
        titleInp.addEventListener('input', () => {
          mItem.title = titleInp.value;
          syncMedia();
        });

        const urlInp = document.createElement('input');
        urlInp.type = 'text';
        urlInp.className = 'trace-media-url-inp';
        urlInp.placeholder = 'URL (https://...)';
        urlInp.value = mItem.url || '';
        urlInp.addEventListener('input', () => {
          mItem.url = urlInp.value;
          syncMedia();
        });

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button'; prevBtn.className = 'btn btn-ghost btn-xs'; prevBtn.textContent = '👁'; prevBtn.title = 'Preview media';
        prevBtn.addEventListener('click', () => {
          if (!mItem.url) return alert('Enter a URL first.');
          openModal(mItem, p.id);
        });

        const delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.className = 'trace-del'; delBtn.textContent = '✕'; delBtn.title = 'Remove media item';
        delBtn.addEventListener('click', () => {
          p.mediaList.splice(mIdx, 1);
          syncMedia();
          refreshTraceList();
        });

        itemRow.append(typeSel, titleInp, urlInp, prevBtn, delBtn);
        itemsList.appendChild(itemRow);
      });

      mediaBox.appendChild(itemsList);

      // Add New Media Action Buttons
      const addBar = document.createElement('div');
      addBar.className = 'trace-media-presets';

      const add3D = document.createElement('button');
      add3D.type = 'button'; add3D.className = 'btn btn-ghost btn-xs'; add3D.textContent = '+ 🌐 3D Tour';
      add3D.addEventListener('click', () => {
        p.mediaList.push({ type: 'walkthrough', url: 'https://demo.build91.in/3BHK-Tour/index.htm', title: '3D Virtual Walkthrough' });
        syncMedia();
        refreshTraceList();
      });

      const addYt = document.createElement('button');
      addYt.type = 'button'; addYt.className = 'btn btn-ghost btn-xs'; addYt.textContent = '+ ▶ YouTube';
      addYt.addEventListener('click', () => {
        p.mediaList.push({ type: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Watch Video' });
        syncMedia();
        refreshTraceList();
      });

      const addImg = document.createElement('button');
      addImg.type = 'button'; addImg.className = 'btn btn-ghost btn-xs'; addImg.textContent = '+ 📷 Image URL';
      addImg.addEventListener('click', () => {
        p.mediaList.push({ type: 'image', url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c', title: 'View Photo' });
        syncMedia();
        refreshTraceList();
      });

      const fileLabel = document.createElement('label');
      fileLabel.className = 'btn btn-ghost btn-xs trace-file-label';
      fileLabel.innerHTML = '+ 📁 Upload Image<input type="file" accept="image/*" hidden>';
      const fileInp = fileLabel.querySelector('input');
      fileInp.addEventListener('change', () => {
        const file = fileInp.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            p.mediaList.push({ type: 'image', url: e.target.result, title: file.name.replace(/\.[^.]+$/, '') });
            syncMedia();
            refreshTraceList();
          };
          reader.readAsDataURL(file);
        }
      });

      addBar.append(add3D, addYt, addImg, fileLabel);
      mediaBox.appendChild(addBar);
      ed.appendChild(mediaBox);

      ed.append(field('Notes', 'notes', ''));
      li.appendChild(ed);
    }
    els.traceList.appendChild(li);
  });
}

// — image / DXF loading —
// Big site-plan exports are often huge (tens of MP). The browser can't decode a
// gigapixel image, and a >4096px texture exceeds the GPU limit, so we decode with
// createImageBitmap (memory-efficient) and DOWNSCALE to a texture-/memory-safe
// ceiling. The resized PNG is what we trace on, drape, and export.
const TRACE_MAX = 4096;
async function traceLoadImage(file) {
  let bmp, w, h, viaBitmap = false;
  try { bmp = await createImageBitmap(file); w = bmp.width; h = bmp.height; viaBitmap = true; }
  catch {
    try { const u = URL.createObjectURL(file); const im = new Image(); im.src = u; await im.decode(); URL.revokeObjectURL(u); bmp = im; w = im.naturalWidth; h = im.naturalHeight; }
    catch { setTraceHint('Could not read that image — it may be corrupt, or too large for the browser to decode. Resize it to ≤ 4096 px and retry.', true); return; }
  }
  if (!w || !h) { setTraceHint('Could not read that image.', true); return; }
  const sc = Math.min(1, TRACE_MAX / Math.max(w, h));
  const W = Math.max(1, Math.round(w * sc)), H = Math.max(1, Math.round(h * sc));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, W, H);
  if (viaBitmap && bmp.close) bmp.close();
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  if (trace.objURL && trace.objURL.startsWith('blob:')) URL.revokeObjectURL(trace.objURL);
  trace.bitmap = c;                                    // the downscaled canvas is the backdrop (drawImage takes a canvas — no extra decode)
  trace.W = W; trace.H = H; trace.imgData = cx.getImageData(0, 0, W, H);
  trace.isRaster = true; trace.objURL = blob ? URL.createObjectURL(blob) : null; trace.planBlob = blob; trace.dxf = null;
  trace.srcName = file.name.replace(/\.[^.]+$/, '') + '.web.png';   // saved/exported as the resized, texture-safe PNG
  trace.plots = []; trace.draft = null; trace.seq = 0; trace.sel = -1;
  els.traceEmpty.hidden = true; els.traceDxfLayer.hidden = true;
  fitTrace(); refreshTraceList(); drawTrace();
  setTraceHint(sc < 1 ? `Loaded — resized to ${W}×${H} for the browser. Click inside each plot.` : 'Click inside each plot to auto-detect it.');
}
function traceLoadDXFText(text, name) {
  const parsed = parseDXF(text);
  if (!parsed.polys.length) { setTraceHint('No polyline entities found in that DXF.', true); return; }
  trace.dxf = parsed; trace.isRaster = false; trace.bitmap = null; trace.imgData = null; trace.srcName = name; trace.objURL = null; trace.planBlob = null;
  const layers = ['(all)', ...new Set(parsed.polys.filter((p) => p.closed).map((p) => p.layer))];
  els.traceLayerSel.innerHTML = ''; layers.forEach((l) => { const o = document.createElement('option'); o.value = l; o.textContent = l; els.traceLayerSel.appendChild(o); });
  els.traceDxfLayer.hidden = false; els.traceEmpty.hidden = true;
  applyDXFLayer('(all)'); setTraceHint('DXF loaded — pick the plot-boundary layer, edit numbers, then “Use these plots”.');
}
function applyDXFLayer(layer) {
  const conv = dxfToPlots(trace.dxf, layer); if (!conv) { setTraceHint('No closed polylines on that layer.', true); return; }
  trace.W = conv.W; trace.H = conv.H; trace.seq = 0; trace.draft = null; trace.sel = -1;
  trace.plots = conv.plots.map((p) => { const lbl = conv.labels.find((t) => pointInPoly(t, p.pts)); return { id: lbl && lbl.text ? 'Plot-' + lbl.text.replace(/\s+/g, '') : nextPlotId(), status: 'available', pts: p.pts }; });
  fitTrace(); refreshTraceList(); drawTrace();
}

// — commit into the live pano —
function finishTrace() {
  if (!trace.plots.length) { setTraceHint('Capture at least one plot first.', true); return; }
  state.imgW = trace.W; state.imgH = trace.H;
  state.geom = trace.plots.map((p) => ({ id: p.id, pts: p.pts.map((v) => ({ x: v.x, y: v.y })) }));
  recomputeAnchorAndK();
  trace.plots.forEach((p) => {
    const row = state.rows.get(p.id) || { plot_id: p.id };
    row.plot_id = p.id; row.status = p.status;
    ['size', 'price', 'facing', 'dimensions', 'tour_url', 'video_url', 'image_url', 'notes', 'block', 'media_json'].forEach((k) => { if (p[k] !== undefined) row[k] = p[k]; });
    if (p.mediaList && p.mediaList.length) {
      row.mediaList = p.mediaList;
      row.media_json = JSON.stringify(p.mediaList);
    }
    state.rows.set(p.id, row);
  });
  labelCache.clear();                                   // ids changed → rebuild label sprites
  closeTrace();
  rebuildPlots(); computeHome(); Object.assign(state.view, state.home);
  if (trace.isRaster && trace.objURL) { state.planBlob = trace.planBlob; state.planName = trace.srcName; loadGroundImage(trace.objURL, state.groundImage?.opacity ?? 1, `sample/${trace.srcName}`); els.axPlanRow.hidden = false; els.axPlanOpacity.value = 1; els.axPlanOpacityVal.textContent = '100%'; }
  else { state.planBlob = null; state.planName = null; removeGround(); els.axPlanRow.hidden = true; }
  applyData(); requestRender(true); onAlignmentChanged();
  setAxStatus(`Imported ${state.geom.length} plots${trace.isRaster ? ' + plan image' : ''}. Align, fill data, then click <strong>Save</strong> in the top bar${trace.isRaster ? ' (saves the resized plan image too)' : ''}.`);
}
async function openTrace() {
  trace.open = true; els.traceWin.classList.add('open'); els.traceWin.setAttribute('aria-hidden', 'false');
  updateSheetAdminUI();
  if (state.geom.length) await loadCurrentLayoutIntoTrace();   // default to editing the live layout (price/status/retrace)
  if (trace.plots.length > 0 && (trace.sel === -1 || trace.sel >= trace.plots.length)) {
    let selIdx = 0;
    if (state.selectedId) {
      const found = trace.plots.findIndex(p => canonPlotId(p.id) === canonPlotId(state.selectedId));
      if (found >= 0) selIdx = found;
    }
    trace.sel = selIdx;
  }
  refreshTraceList();
  requestAnimationFrame(() => { resizeTraceCanvas(); if (trace.W) fitTrace(); drawTrace(); });
}
// Pull the current working plots + their data + the plan image into the editor so
// the admin can tweak and re-commit, instead of always starting from a blank import.
async function loadCurrentLayoutIntoTrace() {
  trace.W = state.imgW; trace.H = state.imgH;
  trace.plots = state.geom.map((g) => {
    const r = state.rows.get(g.id) || {};
    const mediaList = getPlotMediaList(r);
    return {
      id: g.id,
      status: STATUS_META[r.status] ? r.status : 'available',
      pts: g.pts.map((v) => ({ x: v.x, y: v.y })),
      size: r.size || '',
      price: r.price || '',
      facing: r.facing || '',
      dimensions: r.dimensions || '',
      tour_url: r.tour_url || '',
      video_url: r.video_url || '',
      image_url: r.image_url || '',
      notes: r.notes || '',
      block: r.block || '',
      media_json: r.media_json || (mediaList.length ? JSON.stringify(mediaList) : ''),
      mediaList: mediaList,
    };
  });
  trace.draft = null; trace.sel = -1;
  trace.seq = Math.max(0, ...state.geom.map((g) => { const m = /A(\d+)\b/.exec(g.id); return m ? +m[1] - 100 : 0; })); // keep new ids past existing A1xx
  // rebuild the raster backdrop so Auto-trace works on the live plan. The raw blob is
  // kept in memory on import/session-restore; but when the site booted from committed
  // files only the drape *texture* exists (state.planBlob is null), so fetch the
  // referenced PNG back into a blob here — otherwise the trace editor shows plots only.
  if (!state.planBlob && state.groundImage?.file) {
    try { state.planBlob = await (await fetch(assetUrl(state.groundImage.file))).blob(); state.planName = baseName(state.groundImage.file); }
    catch { state.planBlob = null; }
  }
  if (state.planBlob) {
    try {
      const bmp = await createImageBitmap(state.planBlob);
      const c = document.createElement('canvas'); c.width = state.imgW; c.height = state.imgH;
      const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      if (trace.objURL && trace.objURL.startsWith('blob:')) URL.revokeObjectURL(trace.objURL);
      trace.bitmap = c; trace.imgData = cx.getImageData(0, 0, c.width, c.height);
      trace.isRaster = true; trace.planBlob = state.planBlob; trace.srcName = state.planName || 'plan.web.png';
      trace.objURL = URL.createObjectURL(state.planBlob); trace.dxf = null;
    } catch { trace.bitmap = null; trace.imgData = null; trace.isRaster = false; trace.objURL = null; }
  } else { trace.bitmap = null; trace.imgData = null; trace.isRaster = false; trace.objURL = null; trace.dxf = null; }
  els.traceEmpty.hidden = true; els.traceDxfLayer.hidden = true;
  refreshTraceList();
  setTraceHint(`Editing the current ${trace.plots.length}-plot layout — select a plot to edit its data, drag corners to re-trace, or load a new image / DXF to start over.`);
}
function closeTrace() { trace.open = false; els.traceWin.classList.remove('open'); els.traceWin.setAttribute('aria-hidden', 'true'); }

function wireTrace() {
  els.axImport.addEventListener('click', openTrace);
  els.traceClose.addEventListener('click', closeTrace);
  els.traceFinish.addEventListener('click', finishTrace);
  els.traceModeAuto.addEventListener('click', () => setTraceMode('auto'));
  els.traceModeManual.addEventListener('click', () => setTraceMode('manual'));
  els.traceModeEdit.addEventListener('click', () => setTraceMode('edit'));
  els.traceThresh.addEventListener('input', () => { trace.thresh = +els.traceThresh.value; els.traceThreshVal.textContent = els.traceThresh.value; });
  els.traceSimplify.addEventListener('input', () => { trace.simplify = +els.traceSimplify.value; els.traceSimplifyVal.textContent = els.traceSimplify.value; });
  els.traceSnap.addEventListener('change', () => { trace.snap = els.traceSnap.checked; });
  els.traceUndo.addEventListener('click', () => { if (trace.draft) trace.draft = null; else trace.plots.pop(); trace.sel = trace.plots.length - 1; refreshTraceList(); drawTrace(); });
  els.traceClear.addEventListener('click', () => { trace.plots = []; trace.draft = null; trace.sel = -1; refreshTraceList(); drawTrace(); });
  els.traceLayerSel.addEventListener('change', () => applyDXFLayer(els.traceLayerSel.value));
  els.traceFile.addEventListener('change', () => { const f = els.traceFile.files?.[0]; if (f) traceLoadImage(f); els.traceFile.value = ''; });
  els.traceDxf.addEventListener('change', async () => { const f = els.traceDxf.files?.[0]; if (f) traceLoadDXFText(await f.text(), f.name); els.traceDxf.value = ''; });
  const cv = els.traceCanvas;
  cv.addEventListener('pointerdown', (e) => { try { cv.setPointerCapture(e.pointerId); } catch {} traceDown(e); });
  cv.addEventListener('pointermove', traceMove);
  cv.addEventListener('pointerup', traceUp);
  cv.addEventListener('dblclick', traceDbl);
  cv.addEventListener('wheel', traceWheel, { passive: false });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  new ResizeObserver(debounce(() => { if (trace.open) { resizeTraceCanvas(); if (!trace.userView && trace.W) fitTrace(); drawTrace(); } }, 120)).observe(els.traceStage);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && trace.open) closeTrace(); });
}

// ═══ DXF parsing (the DWG path: convert DWG→DXF once, then import) ═════════════
// Dependency-free ASCII reader: closed LWPOLYLINE / POLYLINE → plot polygons;
// TEXT / MTEXT → candidate plot numbers; grouped by layer (group code 8).
function cleanMText(s) { return s.replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').trim(); }
function parseDXF(text) {
  const L = text.split(/\r\n|\r|\n/), tok = []; for (let i = 0; i + 1 < L.length; i += 2) tok.push([parseInt(L[i], 10), L[i + 1]]);
  const polys = [], texts = []; let e = null, poly = null;
  const pushLW = (n) => { if (n.verts.length >= 3) polys.push({ layer: n.layer, closed: (n.flag & 1) === 1, pts: n.verts }); };
  for (let k = 0; k < tok.length; k++) {
    const code = tok[k][0]; let val = (tok[k][1] ?? '').trim();
    if (code === 0) {
      if (e && e.type === 'LWPOLYLINE') pushLW(e);
      else if (e && (e.type === 'TEXT' || e.type === 'MTEXT') && e.text) texts.push({ layer: e.layer, x: e.x, y: e.y, text: cleanMText(e.text) });
      else if (e && e.type === 'VERTEX' && poly) poly.verts.push({ x: e.x, y: e.y });
      if (val === 'SEQEND') { if (poly) { if (poly.verts.length >= 3) polys.push({ layer: poly.layer, closed: (poly.flag & 1) === 1, pts: poly.verts }); poly = null; } e = null; continue; }
      e = null;
      if (val === 'LWPOLYLINE') e = { type: 'LWPOLYLINE', layer: '0', verts: [], flag: 0, _x: null };
      else if (val === 'POLYLINE') poly = { type: 'POLYLINE', layer: '0', verts: [], flag: 0 };
      else if (val === 'VERTEX') e = { type: 'VERTEX', x: 0, y: 0 };
      else if (val === 'TEXT' || val === 'MTEXT') e = { type: val, layer: '0', x: 0, y: 0, text: '' };
      continue;
    }
    if (e) {
      if (code === 8) e.layer = val;
      else if (e.type === 'LWPOLYLINE') { if (code === 70) e.flag = parseInt(val, 10) || 0; else if (code === 10) e._x = parseFloat(val); else if (code === 20 && e._x != null) { e.verts.push({ x: e._x, y: parseFloat(val) }); e._x = null; } }
      else if (e.type === 'VERTEX') { if (code === 10) e.x = parseFloat(val); else if (code === 20) e.y = parseFloat(val); }
      else if (e.type === 'TEXT') { if (code === 10) e.x = parseFloat(val); else if (code === 20) e.y = parseFloat(val); else if (code === 1) e.text = val; }
      else if (e.type === 'MTEXT') { if (code === 10) e.x = parseFloat(val); else if (code === 20) e.y = parseFloat(val); else if (code === 1 || code === 3) e.text += val; }
    } else if (poly) { if (code === 8) poly.layer = val; else if (code === 70) poly.flag = parseInt(val, 10) || 0; }
  }
  if (e && e.type === 'LWPOLYLINE') pushLW(e);
  else if (e && (e.type === 'TEXT' || e.type === 'MTEXT') && e.text) texts.push({ layer: e.layer, x: e.x, y: e.y, text: cleanMText(e.text) });
  return { polys, texts };
}
// chosen closed polylines → polygons in plan-pixel space (fit to ~4000px, Y flipped)
function dxfToPlots(parsed, layer) {
  let polys = parsed.polys.filter((p) => p.closed); if (layer && layer !== '(all)') polys = polys.filter((p) => p.layer === layer);
  if (!polys.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  polys.forEach((p) => p.pts.forEach((v) => { minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); }));
  const w = maxX - minX || 1, h = maxY - minY || 1, sc = 4000 / Math.max(w, h);
  const toPx = (v) => ({ x: (v.x - minX) * sc, y: (maxY - v.y) * sc });          // flip Y (CAD is Y-up)
  return { W: Math.round(w * sc), H: Math.round(h * sc), plots: polys.map((p) => ({ pts: p.pts.map(toPx), layer: p.layer })), labels: parsed.texts.map((t) => ({ ...toPx(t), text: t.text })) };
}

// ─── Static controls ──────────────────────────────────────────────────────────
els.refreshBtn.addEventListener('click', refresh);
els.panelClose.addEventListener('click', closePanel);
els.modalClose.addEventListener('click', closeModal);
els.modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
els.amCardClose?.addEventListener('click', closeAmCard);
els.amCard?.addEventListener('mouseenter', keepCard);                 // hovering the card keeps a landmark hover-card open
els.amCard?.addEventListener('mouseleave', () => { if (state.cardHoverMode) scheduleHideCard(); });
els.lightboxClose?.addEventListener('click', closeLightbox);
els.lightbox?.querySelector('.modal-backdrop')?.addEventListener('click', closeLightbox);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (els.lightbox?.classList.contains('open')) return;                 // lightbox has its own Esc handler
  if (els.amCard?.classList.contains('open')) { closeAmCard(); return; }
  if (els.panel.classList.contains('open') && !els.modal.classList.contains('open')) closePanel();
});

const topbar = document.querySelector('.topbar');
const syncTopbarH = () => document.documentElement.style.setProperty('--topbar-h', topbar.offsetHeight + 'px');
new ResizeObserver(syncTopbarH).observe(topbar); syncTopbarH();

// release the WebGL context on unload (avoids leaking contexts across reloads/navigations)
window.addEventListener('pagehide', () => { try { three?.renderer?.forceContextLoss(); three?.renderer?.dispose(); } catch {} });

// ═══ Landmarks (horizon banners + connector line + pin) ═══════════════════════
// A landmark = { label, distance, driveTime, icon, hotspot{lon,lat}, banner{lon,lat} }.
// Both the pin (hotspot) and the banner are anchored to fixed directions on the
// sphere, so they stay put in the scene as you look around; an SVG line connects
// them and stretches as the admin drags either end. Rendered as a projected HTML/SVG
// overlay (so the banner can be nicely styled). Client is view-only.
const LM_ICONS = { place: '📍', airport: '✈️', train: '🚆', metro: '🚇', bus: '🚌', highway: '🛣️', school: '🎓', college: '🏛️', hospital: '🏥', mall: '🛍️', market: '🏪', restaurant: '🍽️', park: '🌳', lake: '🌊', temple: '🛕', stadium: '🏟️', office: '🏢', hotel: '🏨', bank: '🏦' };
const LM_ICON_ORDER = ['place', 'airport', 'train', 'metro', 'bus', 'highway', 'school', 'college', 'hospital', 'mall', 'market', 'restaurant', 'park', 'lake', 'temple', 'stadium', 'office', 'hotel', 'bank'];

const ICON_CATEGORIES = [
  { category: 'CONNECTIVITY', icons: ['airport', 'train', 'metro', 'bus', 'highway'] },
  { category: 'HEALTHCARE', icons: ['hospital'] },
  { category: 'EDUCATION', icons: ['school', 'college'] },
  { category: 'COMMERCIAL', icons: ['mall', 'market', 'office', 'bank', 'hotel', 'shop'] },
  { category: 'LIFESTYLE', icons: ['restaurant', 'park', 'lake', 'stadium', 'clubhouse', 'pool', 'gym', 'garden', 'playground', 'court', 'amphitheatre', 'pond'] },
  { category: 'TEMPLE', icons: ['temple'] },
  { category: 'GENERAL', icons: ['place', 'parking', 'gate', 'tower', 'hall'] }
];

function populateIconSelect(sel, currentIcon, iconDict, orderList) {
  sel.innerHTML = '';
  const categorized = new Set();
  ICON_CATEGORIES.forEach((grp) => {
    const validIcons = grp.icons.filter((k) => orderList.includes(k));
    if (validIcons.length === 0) return;
    const optgrp = document.createElement('optgroup');
    optgrp.label = grp.category;
    validIcons.forEach((k) => {
      categorized.add(k);
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `${iconDict[k] || '📍'}  ${k}`;
      if (k === currentIcon) o.selected = true;
      optgrp.appendChild(o);
    });
    sel.appendChild(optgrp);
  });
  const remaining = orderList.filter((k) => !categorized.has(k));
  if (remaining.length > 0) {
    const optgrp = document.createElement('optgroup');
    optgrp.label = 'OTHER';
    remaining.forEach((k) => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = `${iconDict[k] || '📍'}  ${k}`;
      if (k === currentIcon) o.selected = true;
      optgrp.appendChild(o);
    });
    sel.appendChild(optgrp);
  }
}
const SVGNS = 'http://www.w3.org/2000/svg';
let lmSeq = 0, lmSvg = null, lmDrag = null;
const lmDom = new Map();                                  // id → { line, pin, banner }

function dirFromLonLat(lonDeg, latDeg) {                  // matches the pano's dir(): sphere viewed from inside (X reflected)
  const lon = lonDeg * Math.PI / 180, lat = latDeg * Math.PI / 180, cl = Math.cos(lat);
  return new THREE.Vector3(-cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon));
}
function lonLatFromDir(v) {                               // inverse of dirFromLonLat
  const n = v.clone().normalize();
  return { lon: Math.atan2(-n.x, n.z) * 180 / Math.PI, lat: Math.asin(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI };
}
function lmBannerHTML(lm) {
  const ico = LM_ICONS[lm.icon] || LM_ICONS.place;
  const label = (lm.label || '').trim() ? esc(lm.label) : '<span class="lm-empty-label">New landmark</span>';

  let distStr = (lm.distance || '').trim();
  let timeStr = (lm.driveTime || '').trim();

  let metaText = '';
  if (distStr || timeStr) {
    let parts = [];
    if (distStr) {
      let d = distStr.toUpperCase();
      if (!d.startsWith('~')) d = '~' + d;
      if (!/\bKM\b/i.test(d)) d += ' KM';
      parts.push(d);
    }
    if (timeStr) {
      let t = timeStr.toUpperCase();
      if (!t.includes('MINUTE') && !t.includes('MIN')) t += ' MINUTE';
      if (!t.startsWith('(') && !t.endsWith(')')) t = `(${t})`;
      parts.push(t);
    }
    metaText = parts.join(' ');
  }

  const subBar = metaText ? `<div class="lm-sub-bar">${esc(metaText)}</div>` : '';

  return `<div class="lm-head-row"><span class="lm-ico">${ico}</span><span class="lm-label">${label}</span></div>${subBar}`;
}
function ensureLmSvg() {
  if (lmSvg && lmSvg.isConnected) return lmSvg;
  lmSvg = document.createElementNS(SVGNS, 'svg'); lmSvg.setAttribute('class', 'lm-lines');
  els.landmarks.appendChild(lmSvg); return lmSvg;
}
function rebuildLandmarkDOM() {
  if (!els.landmarks) return;
  const svg = ensureLmSvg(); svg.innerHTML = '';
  [...els.landmarks.querySelectorAll('.lm-pin, .lm-banner')].forEach((n) => n.remove());
  lmDom.clear();
  state.landmarks.forEach((lm) => {
    const line = document.createElementNS(SVGNS, 'line'); svg.appendChild(line);
    const pin = document.createElement('div'); pin.className = 'lm-pin'; els.landmarks.appendChild(pin);
    const banner = document.createElement('div'); banner.className = 'lm-banner'; banner.innerHTML = lmBannerHTML(lm); els.landmarks.appendChild(banner);
    pin.addEventListener('pointerdown', (e) => startLmDrag(e, lm.id, 'hotspot'));
    banner.addEventListener('pointerdown', (e) => startLmDrag(e, lm.id, 'banner'));
    // a render-bearing landmark becomes interactive in the client: hover (desktop) or
    // tap (mobile → routed via pick()) pops the shared card with its render thumbnail.
    if (renderSrc(lm)) {
      banner.classList.add('has-render');
      banner.addEventListener('mouseenter', () => {
        if (!window.matchMedia('(hover: hover)').matches) return;      // hover only on hover-capable devices
        if (state.admin && state.adminTab === 'landmarks') return;     // don't pop cards while editing landmarks
        keepCard(); openLmCard(lm.id, { hover: true });
      });
      banner.addEventListener('mouseleave', () => { if (state.cardHoverMode) scheduleHideCard(); });
    }
    const sel = lm.id === state.lmSel; pin.classList.toggle('is-sel', sel); banner.classList.toggle('is-sel', sel); line.classList.toggle('is-sel', sel);
    lmDom.set(lm.id, { line, pin, banner });
  });
  renderLandmarks();
  if (typeof applyCategoryFilter === 'function') applyCategoryFilter(state.selectedCategory);
}
function projectDir(dir, cam, W, H) {
  const p = dir.clone().multiplyScalar(R).project(cam);
  if (p.z > 1) return null;                               // behind the camera → hide
  return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
}
function renderLandmarks() {
  if (!three || !els.landmarks || els.landmarks.hidden) return;
  const rect = els.pano.getBoundingClientRect(), W = rect.width, H = rect.height, cam = three.camera;
  const filterCat = state.selectedCategory || 'ALL';
  for (const lm of state.landmarks) {
    const d = lmDom.get(lm.id); if (!d) continue;

    // Strict category filtering: if a category is selected and lm icon/label does not match -> hide completely
    if (filterCat !== 'ALL') {
      const isMatch = isLandmarkMatchCategory(lm, filterCat);
      if (!isMatch) {
        d.line.style.display = d.pin.style.display = d.banner.style.display = 'none';
        continue;
      }
    }

    const hp = projectDir(dirFromLonLat(lm.hotspot.lon, lm.hotspot.lat), cam, W, H);
    const bp = projectDir(dirFromLonLat(lm.banner.lon, lm.banner.lat), cam, W, H);
    const show = hp && bp;
    d.line.style.display = d.pin.style.display = d.banner.style.display = show ? '' : 'none';
    if (!show) continue;
    d.line.setAttribute('x1', hp.x); d.line.setAttribute('y1', hp.y); d.line.setAttribute('x2', bp.x); d.line.setAttribute('y2', bp.y);
    d.pin.style.left = hp.x + 'px'; d.pin.style.top = hp.y + 'px';
    d.banner.style.left = bp.x + 'px'; d.banner.style.top = bp.y + 'px';
  }
}
function applyLandmarkVisibility() {
  if (!els.landmarks) return;
  const editing = state.admin && state.adminTab === 'landmarks';
  const visible = state.showLandmarks || editing;
  els.landmarks.hidden = !visible;
  els.landmarks.classList.toggle('is-editing', editing);
  if (els.landmarkToggle) { els.landmarkToggle.setAttribute('aria-pressed', String(state.showLandmarks)); els.landmarkToggle.title = state.showLandmarks ? 'Hide landmarks' : 'Show landmarks'; }
  if (visible) renderLandmarks();
}
function onLandmarksChanged() {
  if (state.admin) {
    scheduleSessionSave();
    clearTimeout(onLandmarksChanged._t);
    onLandmarksChanged._t = setTimeout(() => {
      exportSite().catch(() => {});
    }, 400);
  }
}

function startLmDrag(e, id, part) {
  if (!(state.admin && state.adminTab === 'landmarks')) return;
  e.preventDefault(); e.stopPropagation();
  lmDrag = { id, part }; selectLandmark(id);
  window.addEventListener('pointermove', onLmDragMove);
  window.addEventListener('pointerup', endLmDrag, { once: true });
}
function onLmDragMove(e) {
  if (!lmDrag || !three) return;
  three.raycaster.setFromCamera(ndcOf(e), three.camera);
  const ll = lonLatFromDir(three.raycaster.ray.direction);   // where the pointer points, in world dir
  const lm = state.landmarks.find((l) => l.id === lmDrag.id); if (!lm) return;
  if (lmDrag.part === 'hotspot') lm.hotspot = ll; else lm.banner = ll;
  renderLandmarks();
}
function endLmDrag() { window.removeEventListener('pointermove', onLmDragMove); lmDrag = null; onLandmarksChanged(); }

function selectLandmark(id) {
  state.lmSel = id;
  lmDom.forEach((d, lid) => { const on = lid === id; d.pin.classList.toggle('is-sel', on); d.banner.classList.toggle('is-sel', on); d.line.classList.toggle('is-sel', on); });
  refreshLmList();
}
function addLandmark() {
  const fwd = three ? new THREE.Vector3(0, 0, -1).applyQuaternion(three.camera.quaternion) : new THREE.Vector3(0, 0, 1);
  const hs = lonLatFromDir(fwd);
  const lm = { id: 'lm' + (++lmSeq), label: '', distance: '', driveTime: '', icon: 'place', render: null, renderBlob: null, hotspot: hs, banner: { lon: hs.lon, lat: Math.max(-80, Math.min(80, hs.lat + 12)) } };
  state.landmarks.push(lm); rebuildLandmarkDOM(); selectLandmark(lm.id); onLandmarksChanged();
  setAxStatus('Landmark added — drag its pin onto a spot, drag the banner to place it, and fill the label/distance/time.');
}
function deleteLandmark(id) {
  const lm = state.landmarks.find((l) => l.id === id); if (lm?._url) { try { URL.revokeObjectURL(lm._url); } catch {} }
  state.landmarks = state.landmarks.filter((l) => l.id !== id);
  if (state.lmSel === id) state.lmSel = null;
  rebuildLandmarkDOM(); refreshLmList(); onLandmarksChanged();
}
async function setLandmarkRender(lm, file) {
  if (!file) return;
  let out; try { out = await resizeImageToBlob(file, 2000); }
  catch { setAxStatus('Could not read that image — use a JPG/PNG render.'); return; }
  if (lm._url) { try { URL.revokeObjectURL(lm._url); } catch {} lm._url = null; }
  const slug = ((lm.label || '').trim() || lm.id).toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || lm.id;
  lm.renderBlob = out.blob; lm.render = `sample/landmark-${slug}.web.jpg`;
  rebuildLandmarkDOM(); refreshLmList(); onLandmarksChanged();      // rebuild so the banner gains its hover/tap card
  setAxStatus(`Render set for <strong>${esc(lm.label || lm.id)}</strong> (${out.W}×${out.H}). It shows on hover/tap in the client. Click <strong>Save</strong> in the top bar to commit it.`);
}
function refreshLmList() {
  if (!els.axLmList) return;
  els.axLmEmpty.hidden = state.landmarks.length > 0;
  els.axLmList.innerHTML = '';
  state.landmarks.forEach((lm) => {
    const li = document.createElement('li'); li.className = 'ax-lm-li' + (lm.id === state.lmSel ? ' is-sel' : '');
    const head = document.createElement('div'); head.className = 'ax-lm-li-head';
    const ico = document.createElement('span'); ico.className = 'ax-lm-ico-sel'; ico.textContent = LM_ICONS[lm.icon] || LM_ICONS.place;
    const title = document.createElement('span'); title.className = 'ax-lm-title'; title.textContent = (lm.label || '').trim() || 'New landmark';
    const del = document.createElement('button'); del.className = 'ax-lm-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Delete landmark';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteLandmark(lm.id); });
    head.append(ico, title, del); li.appendChild(head);
    li.addEventListener('click', (e) => { if (e.target.closest('.ax-lm-edit,.ax-lm-del')) return; selectLandmark(lm.id === state.lmSel ? null : lm.id); });
    if (lm.id === state.lmSel) {
      const ed = document.createElement('div'); ed.className = 'ax-lm-edit';
      const sync = () => { const d = lmDom.get(lm.id); if (d) d.banner.innerHTML = lmBannerHTML(lm); ico.textContent = LM_ICONS[lm.icon] || LM_ICONS.place; title.textContent = (lm.label || '').trim() || 'New landmark'; onLandmarksChanged(); };
      const field = (label, key, ph) => {
        const w = document.createElement('label'); w.className = 'ax-lm-field'; w.append(document.createTextNode(label));
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = lm[key] || ''; if (ph) inp.placeholder = ph;
        inp.addEventListener('input', () => { lm[key] = inp.value; sync(); });
        w.appendChild(inp); return w;
      };
      const iconField = () => {
        const w = document.createElement('label'); w.className = 'ax-lm-field'; w.append(document.createTextNode('Icon / Category'));
        const sel = document.createElement('select');
        populateIconSelect(sel, lm.icon, LM_ICONS, LM_ICON_ORDER);
        sel.addEventListener('change', () => { lm.icon = sel.value; sync(); });
        w.appendChild(sel); return w;
      };
      const renderField = () => {
        const w = document.createElement('div'); w.className = 'ax-lm-field'; w.append(document.createTextNode('Render image (shown on hover/tap)'));
        const row = document.createElement('div'); row.className = 'ax-am-render';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-ghost'; btn.textContent = lm.render ? 'Replace image…' : 'Add image…';
        const fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = 'image/png,image/jpeg,image/webp,image/*'; fileInp.hidden = true;
        btn.addEventListener('click', () => fileInp.click());
        fileInp.addEventListener('change', async () => { const f = fileInp.files?.[0]; if (f) await setLandmarkRender(lm, f); fileInp.value = ''; });
        const name = document.createElement('span'); name.className = 'ax-am-render-name'; name.textContent = lm.render ? lm.render.replace(/^sample\//, '') : 'none';
        row.append(btn, fileInp, name); w.appendChild(row); return w;
      };
      ed.append(field('Label', 'label', 'e.g. Kempegowda Airport'), field('Distance', 'distance', 'e.g. 12 km'), field('Drive time', 'driveTime', 'e.g. 20 min'), iconField(), renderField());
      li.appendChild(ed);
    }
    els.axLmList.appendChild(li);
  });
}
function setAdminTab(tab) {
  state.adminTab = tab;
  els.axTabAlign.hidden = tab !== 'align'; els.axTabLandmarks.hidden = tab !== 'landmarks'; if (els.axTabAmenities) els.axTabAmenities.hidden = tab !== 'amenities';
  els.axTabBtnAlign.classList.toggle('is-on', tab === 'align'); els.axTabBtnLandmarks.classList.toggle('is-on', tab === 'landmarks'); els.axTabBtnAmenities?.classList.toggle('is-on', tab === 'amenities');
  els.axTabBtnAlign.setAttribute('aria-selected', String(tab === 'align')); els.axTabBtnLandmarks.setAttribute('aria-selected', String(tab === 'landmarks')); els.axTabBtnAmenities?.setAttribute('aria-selected', String(tab === 'amenities'));
  const titles = { landmarks: 'Landmarks', amenities: 'Amenities', align: 'Align overlay' };
  const subs = { landmarks: 'Add banners on the horizon; drag the pin and the banner to place them.', amenities: 'Add amenities in the layout; drag each icon-pin, name it, and attach a render image.', align: 'Pick a drag mode, then drag in the pano. Sliders scale/rotate/fade.' };
  if (els.axTitle) els.axTitle.textContent = titles[tab] || titles.align;
  if (els.axSubtitle) els.axSubtitle.textContent = subs[tab] || subs.align;
  applyLandmarkVisibility(); refreshLmList();
  applyAmenityVisibility(); refreshAmList();
}
// persistence
function normLL(o) { if (!o) return null; const lon = o.lonDeg != null ? +o.lonDeg : +o.lon, lat = o.latDeg != null ? +o.latDeg : +o.lat; return (isFinite(lon) && isFinite(lat)) ? { lon, lat } : null; }
function parseLandmarks(d) {
  const arr = (d && Array.isArray(d.landmarks)) ? d.landmarks : (Array.isArray(d) ? d : []);
  const ver = (d && d.savedAt) || '';                    // cache-bust token for committed render images
  return arr.map((l, i) => {
    const render = (l.render && l.render.file) ? l.render.file : (typeof l.render === 'string' ? l.render : null);
    return { id: l.id || 'lm' + (i + 1), label: (l.label || '').toString(), distance: (l.distance || '').toString(), driveTime: (l.driveTime || l.drive || '').toString(), icon: LM_ICONS[l.icon] ? l.icon : 'place', render, renderBlob: l.renderBlob || null, _ver: ver, hotspot: normLL(l.hotspot), banner: normLL(l.banner || l.hotspot) };
  }).filter((l) => l.hotspot && l.banner);
}
function buildLandmarksData() {
  return { version: 1, note: 'Build91 landmark hotspots', savedAt: new Date().toISOString(),
    landmarks: state.landmarks.map((l) => ({ id: l.id, label: l.label, distance: l.distance, driveTime: l.driveTime, icon: l.icon,
      ...(l.render ? { render: { file: l.render } } : {}), hotspot: { lonDeg: +l.hotspot.lon.toFixed(2), latDeg: +l.hotspot.lat.toFixed(2) }, banner: { lonDeg: +l.banner.lon.toFixed(2), latDeg: +l.banner.lat.toFixed(2) } })) };
}
async function loadLandmarksFile() {
  try { const r = await fetch(dataUrl('landmarks.json'), { cache: 'no-store' }); if (!r.ok) return null; return parseLandmarks(await r.json()); } catch { return null; }
}
function setLandmarks(list) {
  state.landmarks.forEach((l) => { if (l._url) { try { URL.revokeObjectURL(l._url); } catch {} } });
  state.landmarks = list || []; state.lmSel = null;
  lmSeq = state.landmarks.reduce((m, l) => { const n = parseInt(String(l.id).replace(/\D/g, ''), 10); return Math.max(m, isFinite(n) ? n : 0); }, 0);
  rebuildLandmarkDOM(); refreshLmList(); applyLandmarkVisibility();
}
async function saveLandmarksAs() {
  const files = [['landmarks.json', JSON.stringify(buildLandmarksData(), null, 2), 'application/json'],
    ...state.landmarks.filter((l) => l.renderBlob && l.render).map((l) => [baseName(l.render), l.renderBlob, 'image/jpeg'])];
  await saveToProject(files, '<code>landmarks.json</code>');
}

// ═══ Amenities (in-layout icon pins + render image, no status) ════════════════
// An amenity = { id, name, icon, <plot-like fields>, render{file}/renderBlob, hotspot{lon,lat} }.
// Unlike plots it has no status/colour and its NAME is the label (e.g. "Club House").
// Unlike landmarks it's a single anchored icon-pin (no banner/connector), is CLICKABLE
// in the client (opens an info card), and carries a full render image shown in a
// lightbox. Rendered as a projected HTML overlay so it stays glued to the scene.
const AM_ICONS = { clubhouse: '🏛️', pool: '🏊', gym: '🏋️', garden: '🌳', park: '🌳', playground: '🛝', temple: '🛕', parking: '🅿️', shop: '🏪', school: '🎓', hospital: '🏥', gate: '🚪', amphitheatre: '🎭', court: '🏸', pond: '🌊', tower: '🗼', office: '🏢', hall: '🎪', place: '📍' };
const AM_ICON_ORDER = ['clubhouse', 'pool', 'gym', 'garden', 'playground', 'temple', 'parking', 'shop', 'school', 'hospital', 'gate', 'amphitheatre', 'court', 'pond', 'tower', 'office', 'hall', 'place'];
let amSeq = 0, amDrag = null, amSuppressClick = false;    // suppress the click a drag synthesizes
const amDom = new Map();                                  // id → marker element
let amCardDims = { w: 296, h: 240 };

// Prefer a freshly-imported blob (pre-export) over the committed sample/ path. Works for
// any object carrying { render, renderBlob, _url, _ver } — used by amenities and landmarks.
// A re-uploaded image keeps the same label-derived filename, so the committed path is
// cache-busted with the source file's savedAt (`_ver`) — otherwise the client's browser
// serves the STALE cached image after a re-export. Fresh blobs need no bust.
function renderSrc(o) {
  if (!o) return '';
  if (o.renderBlob) { if (!o._url) o._url = URL.createObjectURL(o.renderBlob); return o._url; }
  return assetUrl(o.render, o._ver);   // committed path → resolved under the active project dir, cache-busted
}
function amMarkerHTML(am) {
  const ico = AM_ICONS[am.icon] || AM_ICONS.place;
  const name = (am.name || '').trim() ? esc(am.name) : '<span class="am-empty-label">New amenity</span>';
  // a pin dot marks the exact hotspot; the label bubble floats above it (caret points down)
  return `<span class="am-pin"></span><span class="am-chip"><span class="am-ico">${ico}</span><span class="am-label">${name}</span></span>`;
}
function rebuildAmenityDOM() {
  if (!els.amenities) return;
  [...els.amenities.querySelectorAll('.am-marker')].forEach((n) => n.remove());
  amDom.clear();
  state.amenities.forEach((am) => {
    const m = document.createElement('div'); m.className = 'am-marker'; m.innerHTML = amMarkerHTML(am);
    m.classList.toggle('is-sel', am.id === state.amSel);
    m.addEventListener('pointerdown', (e) => { if (state.admin && state.adminTab === 'amenities') startAmDrag(e, am.id); });
    m.addEventListener('click', (e) => {
      if (amSuppressClick) { amSuppressClick = false; e.stopPropagation(); return; } // this click ends a drag
      if (state.admin && state.adminTab === 'amenities') { e.stopPropagation(); selectAmenity(am.id === state.amSel ? null : am.id); }
      else openAmCard(am.id);
    });
    els.amenities.appendChild(m); amDom.set(am.id, m);
  });
  renderAmenities();
}
function renderAmenities() {
  if (!three || !els.amenities || els.amenities.hidden) return;
  const rect = els.pano.getBoundingClientRect(), W = rect.width, H = rect.height, cam = three.camera;
  for (const am of state.amenities) {
    const m = amDom.get(am.id); if (!m) continue;
    const p = projectDir(dirFromLonLat(am.hotspot.lon, am.hotspot.lat), cam, W, H);
    m.style.display = p ? '' : 'none';
    if (!p) continue;
    m.style.left = p.x + 'px'; m.style.top = p.y + 'px';
  }
}
function applyAmenityVisibility() {
  if (!els.amenities) return;
  const editing = state.admin && state.adminTab === 'amenities';
  const visible = state.showAmenities || editing;
  els.amenities.hidden = !visible;
  els.amenities.classList.toggle('is-editing', editing);
  if (els.amenityToggle) { els.amenityToggle.setAttribute('aria-pressed', String(state.showAmenities)); els.amenityToggle.title = state.showAmenities ? 'Hide amenities' : 'Show amenities'; }
  if (visible) renderAmenities();
}
function onAmenitiesChanged() {
  if (state.admin) {
    scheduleSessionSave();
    clearTimeout(onAmenitiesChanged._t);
    onAmenitiesChanged._t = setTimeout(() => {
      exportSite().catch(() => {});
    }, 400);
  }
}

function startAmDrag(e, id) {
  e.preventDefault(); e.stopPropagation();
  amDrag = { id, moved: false }; selectAmenity(id);
  window.addEventListener('pointermove', onAmDragMove);
  window.addEventListener('pointerup', endAmDrag, { once: true });
}
function onAmDragMove(e) {
  if (!amDrag || !three) return;
  amDrag.moved = true;
  three.raycaster.setFromCamera(ndcOf(e), three.camera);
  const am = state.amenities.find((a) => a.id === amDrag.id); if (!am) return;
  am.hotspot = lonLatFromDir(three.raycaster.ray.direction);
  renderAmenities();
}
function endAmDrag() { window.removeEventListener('pointermove', onAmDragMove); const moved = amDrag?.moved; amDrag = null; if (moved) { amSuppressClick = true; onAmenitiesChanged(); } }

function selectAmenity(id) {
  state.amSel = id;
  amDom.forEach((m, aid) => m.classList.toggle('is-sel', aid === id));
  refreshAmList();
}
function addAmenity() {
  const fwd = three ? new THREE.Vector3(0, 0, -1).applyQuaternion(three.camera.quaternion) : new THREE.Vector3(0, 0, 1);
  const am = { id: 'am' + (++amSeq), name: '', icon: 'clubhouse', facing: '', size: '', dimensions: '', price: '', block: '', tour_url: '', notes: '', render: null, renderBlob: null, hotspot: lonLatFromDir(fwd) };
  state.amenities.push(am); rebuildAmenityDOM(); selectAmenity(am.id); onAmenitiesChanged();
  setAxStatus('Amenity added — drag its pin onto a spot, then name it, pick an icon and add a render image.');
}
function deleteAmenity(id) {
  const am = state.amenities.find((a) => a.id === id); if (am?._url) { try { URL.revokeObjectURL(am._url); } catch {} }
  state.amenities = state.amenities.filter((a) => a.id !== id);
  if (state.amSel === id) state.amSel = null;
  rebuildAmenityDOM(); refreshAmList(); onAmenitiesChanged();
}
async function setAmenityRender(am, file) {
  if (!file) return;
  let out; try { out = await resizeImageToBlob(file, 2000); }
  catch { setAxStatus('Could not read that image — use a JPG/PNG render.'); return; }
  if (am._url) { try { URL.revokeObjectURL(am._url); } catch {} am._url = null; }
  const slug = ((am.name || '').trim() || am.id).toLowerCase().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || am.id;
  const name = `amenity-${slug}.web.jpg`;
  am.renderBlob = out.blob; am.render = `sample/${name}`;
  refreshAmList(); onAmenitiesChanged();
  setAxStatus(`Render set for <strong>${esc(am.name || am.id)}</strong> (${out.W}×${out.H}). Click <strong>Save</strong> in the top bar to commit it.`);
}
function refreshAmList() {
  if (!els.axAmList) return;
  els.axAmEmpty.hidden = state.amenities.length > 0;
  els.axAmList.innerHTML = '';
  state.amenities.forEach((am) => {
    const li = document.createElement('li'); li.className = 'ax-lm-li' + (am.id === state.amSel ? ' is-sel' : '');
    const head = document.createElement('div'); head.className = 'ax-lm-li-head';
    const ico = document.createElement('span'); ico.className = 'ax-lm-ico-sel'; ico.textContent = AM_ICONS[am.icon] || AM_ICONS.place;
    const title = document.createElement('span'); title.className = 'ax-lm-title'; title.textContent = (am.name || '').trim() || 'New amenity';
    const del = document.createElement('button'); del.className = 'ax-lm-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Delete amenity';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteAmenity(am.id); });
    head.append(ico, title, del); li.appendChild(head);
    li.addEventListener('click', (e) => { if (e.target.closest('.ax-lm-edit,.ax-lm-del')) return; selectAmenity(am.id === state.amSel ? null : am.id); });
    if (am.id === state.amSel) {
      const ed = document.createElement('div'); ed.className = 'ax-lm-edit';
      const sync = () => { const m = amDom.get(am.id); if (m) m.innerHTML = amMarkerHTML(am); ico.textContent = AM_ICONS[am.icon] || AM_ICONS.place; title.textContent = (am.name || '').trim() || 'New amenity'; onAmenitiesChanged(); };
      const field = (label, key, ph) => {
        const w = document.createElement('label'); w.className = 'ax-lm-field'; w.append(document.createTextNode(label));
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = am[key] || ''; if (ph) inp.placeholder = ph;
        inp.addEventListener('input', () => { am[key] = inp.value; sync(); });
        w.appendChild(inp); return w;
      };
      const iconField = () => {
        const w = document.createElement('label'); w.className = 'ax-lm-field'; w.append(document.createTextNode('Icon / Category'));
        const sel = document.createElement('select');
        populateIconSelect(sel, am.icon, AM_ICONS, AM_ICON_ORDER);
        sel.addEventListener('change', () => { am.icon = sel.value; sync(); });
        w.appendChild(sel); return w;
      };
      const renderField = () => {
        const w = document.createElement('div'); w.className = 'ax-lm-field'; w.append(document.createTextNode('Render image'));
        const row = document.createElement('div'); row.className = 'ax-am-render';
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-ghost'; btn.textContent = am.render ? 'Replace image…' : 'Add image…';
        const fileInp = document.createElement('input'); fileInp.type = 'file'; fileInp.accept = 'image/png,image/jpeg,image/webp,image/*'; fileInp.hidden = true;
        btn.addEventListener('click', () => fileInp.click());
        fileInp.addEventListener('change', async () => { const f = fileInp.files?.[0]; if (f) await setAmenityRender(am, f); fileInp.value = ''; });
        const name = document.createElement('span'); name.className = 'ax-am-render-name'; name.textContent = am.render ? am.render.replace(/^sample\//, '') : 'none';
        row.append(btn, fileInp, name); w.appendChild(row); return w;
      };
      ed.append(field('Name', 'name', 'e.g. Club House'), iconField(),
        field('Facing', 'facing', 'e.g. East'), field('Size', 'size', 'e.g. 4,000 sq.ft'),
        field('Dimensions', 'dimensions', 'e.g. 60 × 80 ft'), field('Price', 'price'),
        field('Block', 'block'), field('Tour URL', 'tour_url', 'https://…'),
        field('Notes', 'notes'), renderField());
      li.appendChild(ed);
    }
    els.axAmList.appendChild(li);
  });
}

// ─── Shared info card (amenity click, or landmark hover/tap) ──────────────────
// One #amCard element, anchored to whatever point `state.cardAnchor` holds, populated
// per kind. Amenity cards are click-sticky; landmark cards opened on desktop HOVER
// auto-hide on mouse-out (state.cardHoverMode) but a tap makes them sticky.
function openAmCard(id) {
  const am = state.amenities.find((a) => a.id === id); if (!am) return;
  closePanel();                                          // don't stack with a plot popover
  state.amCardOpen = id; state.cardAnchor = am.hotspot; state.cardHoverMode = false;
  els.amCardIco.textContent = AM_ICONS[am.icon] || AM_ICONS.place;
  els.amCardTitle.textContent = (am.name || '').trim() || 'Amenity';
  const block = (am.block || '').trim(); els.amCardBlock.textContent = block ? `Block ${block}` : ''; els.amCardBlock.hidden = !block;
  const val = (v) => (v != null && String(v).trim()) ? String(v).trim() : '';
  const src = renderSrc(am);
  if (src) { els.amCardImg.src = src; els.amCardImg.alt = `${am.name || 'Amenity'} render`; els.amCardThumb.hidden = false; els.amCardThumb.onclick = () => openLightbox(src, am.name); }
  else { els.amCardThumb.hidden = true; els.amCardThumb.onclick = null; els.amCardImg.removeAttribute('src'); }
  const price = val(am.price), rest = [['Area', am.size], ['Facing', am.facing], ['Dimensions', am.dimensions]].filter(([, v]) => val(v));
  els.amCardGrid.innerHTML =
    (price ? `<div class="panel-price"><dt>Price</dt><dd>${esc(price)}</dd></div>` : '') +
    rest.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(val(v))}</dd></div>`).join('');
  els.amCardGrid.hidden = !price && rest.length === 0;
  const notes = val(am.notes); els.amCardNotes.textContent = notes; els.amCardNotes.hidden = !notes;
  const hasTour = !!val(am.tour_url);
  els.amCardWalk.hidden = !hasTour; els.amCardWalk.onclick = hasTour ? () => openModal({ plot_id: am.name || 'Amenity', tour_url: am.tour_url }) : null;
  els.amCard.classList.add('open'); els.amCard.setAttribute('aria-hidden', 'false');
  amCardDims = { w: els.amCard.offsetWidth, h: els.amCard.offsetHeight };
  placeAmCard();
}
// Landmark card — only render-bearing landmarks get one. hover=true ⇒ auto-hides on leave.
function openLmCard(id, { hover = false } = {}) {
  const lm = state.landmarks.find((l) => l.id === id); if (!lm) return;
  const src = renderSrc(lm); if (!src) return;           // no image ⇒ nothing to show (banner already has label/meta)
  closePanel();
  state.amCardOpen = 'lm:' + id; state.cardAnchor = lm.banner; state.cardHoverMode = !!hover;
  els.amCardIco.textContent = LM_ICONS[lm.icon] || LM_ICONS.place;
  els.amCardTitle.textContent = (lm.label || '').trim() || 'Landmark';
  els.amCardBlock.hidden = true;
  els.amCardImg.src = src; els.amCardImg.alt = `${lm.label || 'Landmark'} render`; els.amCardThumb.hidden = false; els.amCardThumb.onclick = () => openLightbox(src, lm.label);
  const rows = [['Distance', lm.distance], ['Drive time', lm.driveTime]].filter(([, v]) => (v || '').trim());
  els.amCardGrid.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v.trim())}</dd></div>`).join('');
  els.amCardGrid.hidden = rows.length === 0;
  els.amCardNotes.hidden = true; els.amCardWalk.hidden = true;
  els.amCard.classList.add('open'); els.amCard.setAttribute('aria-hidden', 'false');
  amCardDims = { w: els.amCard.offsetWidth, h: els.amCard.offsetHeight };
  placeAmCard();
}
function placeAmCard() {
  const pop = els.amCard; if (!pop.classList.contains('open') || !three || !state.cardAnchor) return;
  const r = els.pano.getBoundingClientRect();
  const v = dirFromLonLat(state.cardAnchor.lon, state.cardAnchor.lat).multiplyScalar(R).project(three.camera);
  const ax = r.left + (v.x * 0.5 + 0.5) * r.width, ay = r.top + (-v.y * 0.5 + 0.5) * r.height;
  const vw = window.innerWidth, vh = window.innerHeight, M = 12, GAP = 18, pw = amCardDims.w, ph = amCardDims.h;
  let leftBound = M;
  if (state.admin && els.adminBar && !els.adminBar.hidden) leftBound = Math.max(M, els.adminBar.getBoundingClientRect().right + 8);
  let x = ax + GAP; if (x + pw > vw - M) x = ax - GAP - pw;
  x = Math.max(leftBound, Math.min(x, vw - pw - M));
  let y = ay - ph / 2; y = Math.max(M, Math.min(y, vh - ph - M));
  pop.style.left = Math.round(x) + 'px'; pop.style.top = Math.round(y) + 'px';
  let side = 'none'; if (ax <= x - 2) side = 'left'; else if (ax >= x + pw + 2) side = 'right';
  pop.dataset.side = side;
  if (side !== 'none') pop.style.setProperty('--caret-y', Math.max(18, Math.min(ph - 18, ay - y)) + 'px');
}
function closeAmCard() { if (!els.amCard) return; els.amCard.classList.remove('open'); els.amCard.setAttribute('aria-hidden', 'true'); state.amCardOpen = null; state.cardAnchor = null; state.cardHoverMode = false; }
// keep the (hover) card alive while the pointer is over it; hide shortly after it leaves
let cardHideTimer = null;
function keepCard() { clearTimeout(cardHideTimer); }
function scheduleHideCard() { clearTimeout(cardHideTimer); cardHideTimer = setTimeout(() => { if (state.cardHoverMode) closeAmCard(); }, 180); }

// ─── Full-render lightbox ─────────────────────────────────────────────────────
let lbLastFocused = null;
function openLightbox(src, caption) {
  lbLastFocused = document.activeElement;
  els.lightboxImg.src = src; els.lightboxImg.alt = (caption || 'Amenity') + ' render';
  if (els.lightboxCap) els.lightboxCap.textContent = caption || '';
  els.lightbox.classList.add('open'); els.lightbox.setAttribute('aria-hidden', 'false');
  document.addEventListener('keydown', onLightboxKey); setTimeout(() => els.lightboxClose?.focus(), 0);
}
function closeLightbox() {
  els.lightbox.classList.remove('open'); els.lightbox.setAttribute('aria-hidden', 'true'); els.lightboxImg.removeAttribute('src');
  document.removeEventListener('keydown', onLightboxKey); lbLastFocused?.focus?.();
}
function onLightboxKey(e) { if (e.key === 'Escape') closeLightbox(); }

// ─── Amenities persistence ────────────────────────────────────────────────────
function parseAmenities(d) {
  const arr = (d && Array.isArray(d.amenities)) ? d.amenities : (Array.isArray(d) ? d : []);
  const ver = (d && d.savedAt) || '';                    // cache-bust token for committed render images
  return arr.map((a, i) => {
    const hs = normLL(a.hotspot);
    const render = (a.render && a.render.file) ? a.render.file : (typeof a.render === 'string' ? a.render : null);
    return { id: a.id || 'am' + (i + 1), name: (a.name || '').toString(), icon: AM_ICONS[a.icon] ? a.icon : 'clubhouse',
      facing: (a.facing || '').toString(), size: (a.size || '').toString(), dimensions: (a.dimensions || '').toString(),
      price: (a.price || '').toString(), block: (a.block || '').toString(), tour_url: (a.tour_url || '').toString(), notes: (a.notes || '').toString(),
      render, renderBlob: a.renderBlob || null, _ver: ver, hotspot: hs };
  }).filter((a) => a.hotspot);
}
function buildAmenitiesData() {
  return { version: 1, note: 'Build91 in-layout amenities', savedAt: new Date().toISOString(),
    amenities: state.amenities.map((a) => ({ id: a.id, name: a.name, icon: a.icon, facing: a.facing, size: a.size, dimensions: a.dimensions, price: a.price, block: a.block, tour_url: a.tour_url, notes: a.notes,
      ...(a.render ? { render: { file: a.render } } : {}), hotspot: { lonDeg: +a.hotspot.lon.toFixed(2), latDeg: +a.hotspot.lat.toFixed(2) } })) };
}
async function loadAmenitiesFile() {
  try { const r = await fetch(dataUrl('amenities.json'), { cache: 'no-store' }); if (!r.ok) return null; return parseAmenities(await r.json()); } catch { return null; }
}
function setAmenities(list) {
  state.amenities.forEach((a) => { if (a._url) { try { URL.revokeObjectURL(a._url); } catch {} } });
  state.amenities = list || []; state.amSel = null;
  amSeq = state.amenities.reduce((m, a) => { const n = parseInt(String(a.id).replace(/\D/g, ''), 10); return Math.max(m, isFinite(n) ? n : 0); }, 0);
  rebuildAmenityDOM(); refreshAmList(); applyAmenityVisibility();
}
async function saveAmenitiesAs() {
  const files = [['amenities.json', JSON.stringify(buildAmenitiesData(), null, 2), 'application/json'],
    ...state.amenities.filter((a) => a.renderBlob && a.render).map((a) => [baseName(a.render), a.renderBlob, 'image/jpeg'])];
  await saveToProject(files, '<code>amenities.json</code>');
}
// generic downscale-to-blob (renders): keeps the longest side ≤ cap, re-encodes JPEG
async function resizeImageToBlob(file, cap, mime = 'image/jpeg', q = 0.9) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, cap / Math.max(bmp.width, bmp.height));
  const W = Math.max(1, Math.round(bmp.width * scale)), H = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').drawImage(bmp, 0, 0, W, H); if (bmp.close) bmp.close();
  const blob = await new Promise((res) => c.toBlob(res, mime, q));
  return { blob, W, H };
}

// ─── Custom Menu Setup & Client Integration ────────────────────────────────────
function getSectionSubItems(secKey) {
  const mc = state.menuConfig || {};
  const sec = mc[secKey] || {};
  if (Array.isArray(sec.items) && sec.items.length) {
    return sec.items.filter((i) => i && ((i.name || '').trim() || (i.url || '').trim() || (i.videoUrl || '').trim() || (i.pdfUrl || '').trim() || i.videoBlob || i.pdfBlob));
  }
  // Backward compatibility single item fallbacks
  if (secKey === 'location_intel') {
    if (sec.videoUrl || sec.videoBlob) {
      return [{ id: 'li1', name: sec.title || 'Location Intelligence', videoUrl: sec.videoUrl, videoName: sec.videoName, videoBlob: sec.videoBlob }];
    }
  } else if (secKey === 'walkthrough_video') {
    if (sec.videoUrl || sec.videoBlob) {
      return [{ id: 'wv1', name: sec.title || 'Walkthrough Video', videoUrl: sec.videoUrl, videoName: sec.videoName, videoBlob: sec.videoBlob }];
    }
  } else if (secKey === 'brochure') {
    if (sec.pdfUrl || sec.pdfBlob) {
      return [{ id: 'br1', name: sec.title || 'Brochure PDF', pdfUrl: sec.pdfUrl, pdfName: sec.pdfName, pdfBlob: sec.pdfBlob }];
    }
  }
  return [];
}

function getSectionGroups(secKey) {
  const mc = state.menuConfig || {};
  const sec = mc[secKey] || {};
  if (!sec || sec.enabled === false) return [];
  if (Array.isArray(sec.groups)) {
    return sec.groups.map((g, gIdx) => ({
      id: g.id || `grp_${gIdx + 1}`,
      title: g.title || `Sub-Group ${gIdx + 1}`,
      items: Array.isArray(g.items) ? g.items.filter(i => i && ((i.name || '').trim() || (i.url || '').trim() || (i.videoUrl || '').trim() || (i.pdfUrl || '').trim() || i.fileName || i.videoName || i.pdfName || i.fileBlob || i.videoBlob || i.pdfBlob)) : []
    }));
  }
  // Backward compatibility: wrap flat items into a single group only if sec.groups was never set
  const flatItems = getSectionSubItems(secKey);
  if (flatItems.length) {
    return [{ id: 'grp_default', title: 'GENERAL', items: flatItems }];
  }
  return [];
}

function renderClientSidebar() {
  if (!els.catNavL1) return;
  let html = `
    <button class="cat-btn" type="button" data-act="aerial">AERIAL VIEW</button>
    <button class="cat-btn cat-btn-sub" type="button" data-act="landmarks">LANDMARKS <span class="cat-btn-arrow">›</span></button>
  `;

  const sections = getCustomSections();
  sections.forEach((sec) => {
    const title = (sec.title || 'SECTION').trim().toUpperCase();
    html += `<button class="cat-btn cat-btn-sub" type="button" data-sec-id="${esc(sec.id)}">${esc(title)} <span class="cat-btn-arrow">›</span></button>`;
  });

  els.catNavL1.innerHTML = html;
  wireClientSidebarButtons();
}

function wireClientSidebarButtons() {
  if (!els.catNavL1) return;
  const touch = () => { state.lastUserTouch = Date.now(); };
  els.catNavL1.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      touch();
      const act = btn.dataset.act;
      const secId = btn.dataset.secId;

      if (act === 'landmarks') {
        if (els.catLevel1) els.catLevel1.hidden = true;
        if (els.catLevelSubMenu) els.catLevelSubMenu.hidden = true;
        if (els.catLevel2) els.catLevel2.hidden = false;
        state.autoPan = true;
        applyCategoryFilter('ALL');
      } else if (act === 'aerial') {
        computeHome();
        animateCameraTo(state.home.lon, state.home.lat, FOV_MAX);
        state.autoPan = true;
      } else if (secId) {
        const sec = getCustomSections().find(s => s.id === secId);
        if (!sec) return;
        if (sec.type === 'gallery') {
          openClientGalleryModal(sec);
        } else if (sec.type === 'contact_us') {
          openClientContactModal(sec);
        } else {
          if (els.catLevel1) els.catLevel1.hidden = true;
          if (els.catLevel2) els.catLevel2.hidden = true;
          if (els.catLevelSubMenu) els.catLevelSubMenu.hidden = false;
          renderSubMenuNavBySecId(secId, null);
        }
      }
    });
  });
}

function renderSubMenuNavBySecId(secId, activeGroupIdx = null) {
  const container = $('catSubMenuNav');
  const titleEl = $('catSubMenuTitle');
  if (!container) return;

  const sec = getCustomSections().find(s => s.id === secId);
  if (!sec) return;

  const sectionTitle = (sec.title || 'SECTION').trim().toUpperCase();
  const groups = Array.isArray(sec.groups) ? sec.groups.map((g, gIdx) => ({
    id: g.id || `grp_${gIdx + 1}`,
    title: g.title || `Sub-Group ${gIdx + 1}`,
    items: Array.isArray(g.items) ? g.items.filter(i => i && ((i.name || '').trim() || (i.url || '').trim() || (i.videoUrl || '').trim() || (i.pdfUrl || '').trim() || i.fileName || i.videoName || i.pdfName || i.fileBlob || i.videoBlob || i.pdfBlob)) : []
  })) : [];

  if (!groups.length) {
    if (titleEl) titleEl.textContent = sectionTitle;
    container.innerHTML = `<p style="padding:14px; font-size:12px; color:var(--text-mute);">No sub-items configured in this section.</p>`;
    return;
  }

  if (activeGroupIdx === null && groups.length === 1 && (groups[0].title === 'GENERAL' || !groups[0].title)) {
    activeGroupIdx = 0;
  }

  if (activeGroupIdx === null) {
    // Level 2: Render Sub-Groups List
    if (titleEl) titleEl.textContent = sectionTitle;
    container.innerHTML = groups.map((grp, gIdx) => `
      <button class="cat-btn cat-btn-sub" type="button" data-sec-id="${esc(secId)}" data-grp-idx="${gIdx}">
        ${esc(grp.title.toUpperCase())} <span class="cat-btn-arrow">›</span>
      </button>
    `).join('');

    container.querySelectorAll('.cat-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sId = btn.dataset.secId;
        const gIdx = parseInt(btn.dataset.grpIdx, 10);
        renderSubMenuNavBySecId(sId, gIdx);
      });
    });
  } else {
    // Level 3: Render Items inside selected Sub-Group
    const group = groups[activeGroupIdx] || groups[0];
    const groupTitle = group.title ? group.title.trim().toUpperCase() : sectionTitle;
    if (titleEl) titleEl.textContent = groupTitle;

    let html = '';
    if (groups.length > 1) {
      html += `
        <button class="cat-btn cat-btn-back" type="button" data-sec-id="${esc(secId)}" style="color:var(--gold,#facc15); font-weight:600; margin-bottom:6px;">
          ‹ BACK TO SUB-GROUPS
        </button>
      `;
    }

    if (!group.items.length) {
      html += `<p style="padding:14px; font-size:12px; color:var(--text-mute);">No items in this sub-group.</p>`;
    } else {
      html += group.items.map((item, iIdx) => `
        <button class="cat-btn" type="button" data-sec-id="${esc(secId)}" data-grp-idx="${activeGroupIdx}" data-item-idx="${iIdx}">
          ${esc(item.name || item.title || `ITEM ${iIdx + 1}`)}
        </button>
      `).join('');
    }

    container.innerHTML = html;

    const backBtn = container.querySelector('.cat-btn-back');
    backBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      renderSubMenuNavBySecId(secId, null);
    });

    container.querySelectorAll('.cat-btn:not(.cat-btn-back)').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sId = btn.dataset.secId;
        const gIdx = parseInt(btn.dataset.grpIdx, 10);
        const iIdx = parseInt(btn.dataset.itemIdx, 10);
        const targetSec = getCustomSections().find(s => s.id === sId);
        const targetGroup = targetSec?.groups?.[gIdx];
        const item = targetGroup?.items?.[iIdx];
        if (item && targetSec) {
          openSubItemModal(targetSec.type, item);
        }
      });
    });
  }
}

function openSubItemModal(secKey, item) {
  if (secKey === 'location_intel' || secKey === 'walkthrough_video') {
    const title = item.name || (secKey === 'location_intel' ? 'Location Intelligence' : 'Walkthrough Video');
    openClientVideoModal(title, item);
  } else if (secKey === 'virtual_tour') {
    let tourSrc = item.fileBlob || item.videoBlob ? URL.createObjectURL(item.fileBlob || item.videoBlob) : null;
    if (!tourSrc && (item.fileName || item.videoName)) {
      tourSrc = assetUrl(item.fileName || item.videoName);
    }
    if (!tourSrc && (item.url || item.videoUrl)) {
      tourSrc = item.url || item.videoUrl;
    }
    if (tourSrc) {
      openModal({ url: tourSrc, title: item.name });
    } else {
      showNotice(`No tour link or file configured for "${item.name || 'Virtual Tour'}".`);
    }
  } else if (secKey === 'brochure') {
    openClientBrochureModal(item);
  }
}

function openClientVideoModal(title, config) {
  let rawSrc = config.fileBlob || config.videoBlob ? URL.createObjectURL(config.fileBlob || config.videoBlob) : null;
  if (!rawSrc && (config.videoName || config.fileName)) {
    rawSrc = assetUrl(config.videoName || config.fileName);
  }
  if (!rawSrc && (config.videoUrl || config.url)) {
    rawSrc = config.videoUrl || config.url;
  }
  if (!rawSrc) {
    showNotice(`No video uploaded or URL configured for ${title}.`);
    return;
  }
  openModal({ url: rawSrc, title: title });
}

function isYoutubeUrl(url) {
  return /youtube\.com|youtu\.be/i.test(url || '');
}
function getYoutubeEmbedUrl(url) {
  const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/i);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1` : url;
}
function isVimeoUrl(url) {
  return /vimeo\.com/i.test(url || '');
}
function getVimeoEmbedUrl(url) {
  const m = (url || '').match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return m ? `https://player.vimeo.com/video/${m[1]}?autoplay=1` : url;
}

let currentGalleryIdx = 0;
let activeEditingSecId = null;

function upsertCustomSection(type, data) {
  const sections = getCustomSections();
  if (activeEditingSecId) {
    const idx = sections.findIndex(s => s.id === activeEditingSecId);
    if (idx !== -1) {
      sections[idx] = Object.assign({}, sections[idx], data, { id: activeEditingSecId, type, enabled: true });
    } else {
      sections.push(Object.assign({}, data, { id: activeEditingSecId, type, enabled: true }));
    }
  } else {
    sections.push(Object.assign({}, data, { id: `sec_${Date.now()}_${Math.floor(Math.random()*1000)}`, type, enabled: true }));
  }
  state.menuConfig.customSections = sections;
}

function openClientGalleryModal(sec) {
  if (!els.clientGalleryModal) return;
  const images = sec.images || [];
  if (!images.length) {
    showNotice('No gallery images uploaded yet.');
    return;
  }
  state.currentGalleryImages = images;
  currentGalleryIdx = 0;
  updateGallerySlide(currentGalleryIdx);

  els.clientGalleryModal.classList.add('open');
  els.clientGalleryModal.setAttribute('aria-hidden', 'false');
}

function updateGallerySlide(idx) {
  const images = state.currentGalleryImages || [];
  if (!images.length) return;

  currentGalleryIdx = (idx + images.length) % images.length;
  const img = images[currentGalleryIdx];
  const src = img.blob ? URL.createObjectURL(img.blob) : assetUrl(img.url || img.name);

  const activeImg = $('galleryActiveImg');
  const imgName = $('galleryImgName');
  const imgCounter = $('galleryImgCounter');
  const prevBtn = $('galleryPrevBtn');
  const nextBtn = $('galleryNextBtn');

  if (activeImg) {
    activeImg.style.opacity = '0.4';
    activeImg.src = src;
    setTimeout(() => { activeImg.style.opacity = '1'; }, 50);
  }
  if (imgName) imgName.textContent = img.name || `Image ${currentGalleryIdx + 1}`;
  if (imgCounter) imgCounter.textContent = `(${currentGalleryIdx + 1} / ${images.length})`;

  if (prevBtn) prevBtn.style.display = images.length > 1 ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = images.length > 1 ? 'flex' : 'none';
}

function openClientBrochureModal(item = null) {
  if (!els.clientBrochureModal) return;
  const frame = $('clientBrochureFrame');
  const btn = $('clientBrochureDownload');
  const b = item || {};
  let src = null;

  // Priority 1: in-memory blob from device upload
  if (b.fileBlob || b.pdfBlob) {
    src = URL.createObjectURL(b.fileBlob || b.pdfBlob);
  }
  // Priority 2: direct URL or Google Drive link
  if (!src && (b.pdfUrl || b.url)) {
    const rawUrl = (b.pdfUrl || b.url).trim();
    const gdrive = rawUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (gdrive) {
      src = `https://drive.google.com/file/d/${gdrive[1]}/preview`;
    } else if (/^(https?:|\/\/|data:|blob:)/i.test(rawUrl)) {
      src = rawUrl;
    } else {
      src = assetUrl(rawUrl);
    }
  }
  // Priority 3: saved filename (served from project assets)
  if (!src && (b.pdfName || b.fileName)) {
    src = assetUrl(b.pdfName || b.fileName);
  }

  if (!src) {
    showNotice('No PDF brochure uploaded or URL configured yet.');
    return;
  }
  if (frame) frame.src = src;
  if (btn) { btn.href = src; btn.download = b.pdfName || b.fileName || b.name || 'brochure.pdf'; }
  els.clientBrochureModal.classList.add('open');
  els.clientBrochureModal.setAttribute('aria-hidden', 'false');
}

function openClientContactModal(sec) {
  if (!els.clientContactModal) return;
  const c = sec || {};
  const title = $('clientContactTitle');
  const about = $('clientContactAbout');
  const phone = $('clientContactPhone');
  const email = $('clientContactEmail');
  const img = $('clientContactImg');

  if (title) title.textContent = c.titleVal || c.title || 'Anandam Eleganza - Premium Villa Plots';
  if (about) about.textContent = c.about || 'Site Address: Beside Loha Market, Sondongari Main Road, Hirapur, Raipur, Chhatisgarh';
  if (phone) {
    const num = c.phone || '+91 7389705477';
    phone.textContent = num;
    phone.href = `tel:${num.replace(/\s+/g, '')}`;
  }
  if (email) {
    const mail = c.email || 'anandameleganza@gmail.com';
    email.textContent = mail;
    email.href = `mailto:${mail}`;
  }
  if (img) {
    const defaultImg = state.panoImage?.file ? assetUrl(state.panoImage.file) : 'projects/sample/Demo.web.jpg';
    const src = c.imageBlob ? URL.createObjectURL(c.imageBlob) : (c.image ? assetUrl(c.image) : defaultImg);
    img.src = src;
  }

  els.clientContactModal.style.display = 'flex';
  els.clientContactModal.hidden = false;
  els.clientContactModal.setAttribute('aria-hidden', 'false');
}

function renderCurrentMenuAdminPanel() {
  const treeEl = $('projCurrentMenuDropdown');
  if (!treeEl) return;

  const sections = getCustomSections();
  const iconMap = {
    location_intel: '📍',
    walkthrough_video: '🎬',
    virtual_tour: '🌐',
    gallery: '🖼️',
    brochure: '📄',
    contact_us: '📞'
  };

  let html = `
    <div style="font-size:11px; font-weight:700; color:var(--gold,#facc15); padding:6px 10px 8px; border-bottom:1px solid rgba(255,255,255,0.1); text-transform:uppercase; letter-spacing:0.5px;">
      👁️ CURRENT CLIENT SIDEBAR MENU
    </div>
  `;

  if (!sections.length) {
    html += `<p style="padding:10px; font-size:11.5px; color:var(--text-mute); text-align:center; margin:0;">No active custom menu sections.<br/>Click <strong>📋 Menu ▾</strong> to add sections.</p>`;
  } else {
    sections.forEach((sec) => {
      const icon = iconMap[sec.type] || '📁';
      const title = (sec.title || 'SECTION').trim().toUpperCase();

      html += `
        <div class="menu-tree-section" style="margin-top:6px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:6px 8px;">
          <div class="menu-tree-sec-head" style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <span class="menu-tree-sec-title" style="font-weight:700; font-size:11.5px; color:var(--gold,#facc15); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${icon} ${esc(title)}</span>
            <div style="display:flex; gap:4px; flex-shrink:0;">
              <button type="button" class="menu-tree-edit-btn" data-edit-type="${esc(sec.type)}" data-edit-sec-id="${esc(sec.id)}" style="font-size:10px; font-weight:600; padding:2px 6px; background:rgba(250,204,21,0.15); color:var(--gold,#facc15); border:1px solid rgba(250,204,21,0.3); border-radius:4px; cursor:pointer;">✏️ Edit</button>
              <button type="button" class="menu-tree-del-btn" data-del-sec-id="${esc(sec.id)}" style="font-size:10px; font-weight:600; padding:2px 6px; background:rgba(244,63,94,0.15); color:var(--danger,#f43f5e); border:1px solid rgba(244,63,94,0.3); border-radius:4px; cursor:pointer;">🗑️ Delete</button>
            </div>
          </div>
      `;

      if (sec.type === 'gallery') {
        const imgs = sec.images || [];
        html += `<div class="menu-tree-group" style="margin-left:6px; padding-left:6px; border-left:2px solid rgba(255,255,255,0.1); font-size:10.5px; color:#cbd5e1;">Images (${imgs.length})</div>`;
      } else if (sec.type === 'contact_us') {
        html += `<div class="menu-tree-group" style="margin-left:6px; padding-left:6px; border-left:2px solid rgba(255,255,255,0.1); font-size:10.5px; color:#cbd5e1;">Contact Card</div>`;
      } else {
        const groups = Array.isArray(sec.groups) ? sec.groups : [];
        if (!groups.length) {
          html += `<div class="menu-tree-group" style="margin-left:6px; padding-left:6px; font-size:10.5px; color:var(--text-mute);">(No sub-items)</div>`;
        } else {
          groups.forEach((grp) => {
            html += `
              <div class="menu-tree-group" style="margin-left:6px; padding-left:6px; border-left:2px solid rgba(255,255,255,0.1); margin-top:4px;">
                <div class="menu-tree-grp-title" style="font-weight:600; font-size:11px; color:#e2e8f0;">📂 ${esc(grp.title)}</div>
            `;
            (grp.items || []).forEach((item) => {
              const itemLabel = item.name || item.title || 'Item';
              const hasUpload = !!(item.fileBlob || item.videoBlob || item.pdfBlob || item.fileName || item.videoName || item.pdfName);
              const hasUrl = !!(item.url || item.videoUrl || item.pdfUrl);
              const badge = hasUpload ? '📁 File' : (hasUrl ? '🔗 Link' : '');
              html += `
                <div class="menu-tree-item" style="font-size:10px; color:#94a3b8; margin-left:6px; padding:1px 0; display:flex; justify-content:space-between; gap:4px;">
                  <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">• ${esc(itemLabel)}</span>
                  ${badge ? `<span style="font-size:8.5px; padding:1px 4px; border-radius:3px; background:rgba(255,255,255,0.08);">${badge}</span>` : ''}
                </div>
              `;
            });
            html += `</div>`;
          });
        }
      }

      html += `</div>`;
    });
  }

  treeEl.innerHTML = html;

  // Edit listeners
  treeEl.querySelectorAll('[data-edit-sec-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      treeEl.hidden = true;
      $('projCurrentMenuBtn')?.setAttribute('aria-expanded', 'false');
      const type = btn.dataset.editType;
      const secId = btn.dataset.editSecId;
      openAdminMenuModal(type, secId);
    });
  });

  // Delete listeners
  treeEl.querySelectorAll('[data-del-sec-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const secId = btn.dataset.delSecId;
      if (secId) {
        state.menuConfig.customSections = getCustomSections().filter(s => s.id !== secId);
        onAlignmentChanged();
        renderClientSidebar();
        renderCurrentMenuAdminPanel();
      }
    });
  });
}

function initCustomMenuAdminAndClient() {
  // Admin 📋 Menu ▾ dropdown toggling
  els.projCustomMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!els.projCustomDropdown) return;
    const isHidden = els.projCustomDropdown.hidden;
    els.projCustomDropdown.hidden = !isHidden;
    els.projCustomMenuBtn.setAttribute('aria-expanded', String(isHidden));
    const currentDropdown = $('projCurrentMenuDropdown');
    if (currentDropdown) currentDropdown.hidden = true;
  });

  // Admin 👁️ Current Menu ▾ dropdown toggling
  const currentMenuBtn = $('projCurrentMenuBtn');
  const currentDropdown = $('projCurrentMenuDropdown');

  currentMenuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentDropdown) return;
    const isHidden = currentDropdown.hidden;
    currentDropdown.hidden = !isHidden;
    currentMenuBtn.setAttribute('aria-expanded', String(isHidden));
    if (isHidden) {
      if (els.projCustomDropdown) els.projCustomDropdown.hidden = true;
      els.projCustomMenuBtn?.setAttribute('aria-expanded', 'false');
      renderCurrentMenuAdminPanel();
    }
  });

  document.addEventListener('click', () => {
    if (els.projCustomDropdown) {
      els.projCustomDropdown.hidden = true;
      els.projCustomMenuBtn?.setAttribute('aria-expanded', 'false');
    }
    if (currentDropdown) {
      currentDropdown.hidden = true;
      currentMenuBtn?.setAttribute('aria-expanded', 'false');
    }
  });

  els.projCustomDropdown?.querySelectorAll('button[data-menu-act]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      els.projCustomDropdown.hidden = true;
      const act = btn.dataset.menuAct;
      openAdminMenuModal(act, null); // Fresh new section
    });
  });

  // Generic Sub-Menu back button
  $('catSubMenuBackBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (els.catLevelSubMenu) els.catLevelSubMenu.hidden = true;
    if (els.catLevel1) els.catLevel1.hidden = false;
  });

  // Gallery Lightbox Navigation
  $('galleryPrevBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateGallerySlide(currentGalleryIdx - 1);
  });
  $('galleryNextBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateGallerySlide(currentGalleryIdx + 1);
  });
  document.addEventListener('keydown', (e) => {
    if (els.clientGalleryModal && els.clientGalleryModal.classList.contains('open')) {
      if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault();
        updateGallerySlide(currentGalleryIdx - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault();
        updateGallerySlide(currentGalleryIdx + 1);
      }
    }
  });

  async function syncCustomMenuFilesToDisk() {
    try {
      const files = collectCustomMenuFiles();
      if (files.length) {
        await serverSave(files);
      }
    } catch (e) {
      console.warn('Auto-sync custom menu files:', e);
    }
  }

  // Setup Admin Modals
  // 1. Location Intel Modal
  $('adminLocIntelAddBtn')?.addEventListener('click', () => {
    addAdminSubGroup('adminLocIntelList');
  });
  $('adminLocIntelSave')?.addEventListener('click', async () => {
    const title = ($('adminLocIntelSectionTitle')?.value || '').trim() || 'LOCATION INTELLIGENCE';
    const groups = getAdminSubGroups('adminLocIntelList');
    upsertCustomSection('location_intel', { title, groups, items: groups.flatMap(g => g.items || []) });
    closeCustomModal(els.adminLocationIntelModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
    await syncCustomMenuFilesToDisk();
  });
  $('adminLocIntelClear')?.addEventListener('click', () => {
    if (activeEditingSecId) state.menuConfig.customSections = getCustomSections().filter(s => s.id !== activeEditingSecId);
    closeCustomModal(els.adminLocationIntelModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
  });

  // 2. Walkthrough Video Modal
  $('adminWalkthroughAddBtn')?.addEventListener('click', () => {
    addAdminSubGroup('adminWalkthroughList');
  });
  $('adminWalkthroughSave')?.addEventListener('click', async () => {
    const title = ($('adminWalkthroughSectionTitle')?.value || '').trim() || 'WALKTHROUGH VIDEO';
    const groups = getAdminSubGroups('adminWalkthroughList');
    upsertCustomSection('walkthrough_video', { title, groups, items: groups.flatMap(g => g.items || []) });
    closeCustomModal(els.adminWalkthroughModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
    await syncCustomMenuFilesToDisk();
  });
  $('adminWalkthroughClear')?.addEventListener('click', () => {
    if (activeEditingSecId) state.menuConfig.customSections = getCustomSections().filter(s => s.id !== activeEditingSecId);
    closeCustomModal(els.adminWalkthroughModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
  });

  // 3. Virtual Tour Modal
  $('adminVtAddBtn')?.addEventListener('click', () => {
    addAdminSubGroup('adminVtList');
  });
  $('adminVtSave')?.addEventListener('click', async () => {
    const title = ($('adminVtSectionTitle')?.value || '').trim() || 'VIRTUAL TOUR';
    const groups = getAdminSubGroups('adminVtList');
    upsertCustomSection('virtual_tour', { title, groups, items: groups.flatMap(g => g.items || []) });
    closeCustomModal(els.adminVirtualTourModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
    await syncCustomMenuFilesToDisk();
  });
  $('adminVtClear')?.addEventListener('click', () => {
    if (activeEditingSecId) state.menuConfig.customSections = getCustomSections().filter(s => s.id !== activeEditingSecId);
    closeCustomModal(els.adminVirtualTourModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
  });

  // 4. Gallery Modal
  $('adminGalleryFiles')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!state.tempGalleryImages) state.tempGalleryImages = [];
    files.forEach((f) => {
      state.tempGalleryImages.push({ name: f.name, blob: f, url: `sample/${f.name}` });
    });
    renderAdminGalleryPreviews();
  });
  $('adminGallerySave')?.addEventListener('click', async () => {
    const title = ($('adminGallerySectionTitle')?.value || '').trim() || 'GALLERY';
    const images = state.tempGalleryImages || [];
    upsertCustomSection('gallery', { title, images });
    closeCustomModal(els.adminGalleryModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
    await syncCustomMenuFilesToDisk();
  });
  $('adminGalleryClear')?.addEventListener('click', () => {
    if (activeEditingSecId) state.menuConfig.customSections = getCustomSections().filter(s => s.id !== activeEditingSecId);
    closeCustomModal(els.adminGalleryModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
  });

  // 5. Brochure Modal
  $('adminBrochureAddBtn')?.addEventListener('click', () => {
    addAdminSubGroup('adminBrochureList');
  });
  $('adminBrochureSave')?.addEventListener('click', async () => {
    const title = ($('adminBrochureSectionTitle')?.value || '').trim() || 'BROCHURE';
    const groups = getAdminSubGroups('adminBrochureList');
    upsertCustomSection('brochure', { title, groups, items: groups.flatMap(g => g.items || []) });
    closeCustomModal(els.adminBrochureModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
    await syncCustomMenuFilesToDisk();
  });
  $('adminBrochureClear')?.addEventListener('click', () => {
    if (activeEditingSecId) state.menuConfig.customSections = getCustomSections().filter(s => s.id !== activeEditingSecId);
    closeCustomModal(els.adminBrochureModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
  });

  // 6. Contact Us Modal
  $('adminContactSave')?.addEventListener('click', async () => {
    const sectionTitle = ($('adminContactSectionTitle')?.value || '').trim() || 'CONTACT US';
    const fileInput = $('adminContactImageFile');
    const file = fileInput?.files?.[0];
    const title = ($('adminContactTitle')?.value || '').trim();
    const about = ($('adminContactAbout')?.value || '').trim();
    const phone = ($('adminContactPhone')?.value || '').trim();
    const email = ($('adminContactEmail')?.value || '').trim();

    const existingSec = activeEditingSecId ? getCustomSections().find(s => s.id === activeEditingSecId) : {};

    upsertCustomSection('contact_us', {
      title: sectionTitle,
      imageBlob: file || existingSec?.imageBlob,
      imageName: file ? file.name : (existingSec?.imageName || ''),
      image: file ? `sample/${file.name}` : (existingSec?.image || ''),
      titleVal: title,
      about,
      phone,
      email
    });
    closeCustomModal(els.adminContactModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
    await syncCustomMenuFilesToDisk();
  });
  $('adminContactClear')?.addEventListener('click', () => {
    if (activeEditingSecId) state.menuConfig.customSections = getCustomSections().filter(s => s.id !== activeEditingSecId);
    closeCustomModal(els.adminContactModal);
    onAlignmentChanged();
    renderClientSidebar();
    renderCurrentMenuAdminPanel();
  });

  // Modal Close buttons (data-close)
  document.querySelectorAll('.custom-feature-modal [data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) closeCustomModal(modal);
    });
  });

  // Client Contact Close
  const hideContactModal = () => {
    if (els.clientContactModal) {
      els.clientContactModal.style.display = 'none';
      els.clientContactModal.hidden = true;
      els.clientContactModal.setAttribute('aria-hidden', 'true');
    }
  };
  $('clientContactClose')?.addEventListener('click', hideContactModal);
  els.clientContactModal?.querySelector('.contact-modal-backdrop')?.addEventListener('click', hideContactModal);
}

function addAdminSubGroup(containerId, groupData = {}) {
  const container = typeof containerId === 'string' ? $(containerId) : containerId;
  if (!container) return;

  const card = document.createElement('div');
  card.className = 'sub-group-card';
  const groupTitle = groupData.title || groupData.name || '';

  card.innerHTML = `
    <div class="sub-group-header">
      <input type="text" placeholder="Sub-Domain / Sub-Group Title (e.g. Kitchen Videos)" class="sub-group-title-input form-input-text" value="${esc(groupTitle)}" />
      <button type="button" class="btn btn-ghost sub-group-del-btn" title="Delete Sub-Group" style="color:var(--danger,#f43f5e); font-size:12px; padding:4px 8px;">✕ Delete Sub-Group</button>
    </div>
    <div class="sub-group-body">
      <!-- Items list inside this group -->
    </div>
    <button type="button" class="btn btn-ghost sub-group-add-item-btn" style="margin-top:8px; font-size:12px;">＋ Add Item</button>
  `;

  const groupBody = card.querySelector('.sub-group-body');
  const addItemBtn = card.querySelector('.sub-group-add-item-btn');
  const delGroupBtn = card.querySelector('.sub-group-del-btn');

  const items = Array.isArray(groupData.items) ? groupData.items : [];
  if (items.length) {
    items.forEach(item => addAdminSubItemRow(groupBody, item));
  } else {
    addAdminSubItemRow(groupBody, {});
  }

  addItemBtn?.addEventListener('click', () => {
    addAdminSubItemRow(groupBody, {});
  });

  delGroupBtn?.addEventListener('click', () => {
    card.remove();
  });

  container.appendChild(card);
}

function getAdminSubGroups(containerId) {
  const container = typeof containerId === 'string' ? $(containerId) : containerId;
  if (!container) return [];
  const listId = typeof containerId === 'string' ? containerId : container.id;
  const groups = [];

  container.querySelectorAll('.sub-group-card').forEach((card, gIdx) => {
    const title = (card.querySelector('.sub-group-title-input')?.value || '').trim() || `Sub-Group ${gIdx + 1}`;
    const groupBody = card.querySelector('.sub-group-body');
    const items = getAdminSubItemRows(groupBody);

    groups.push({
      id: `grp_${gIdx + 1}`,
      title,
      items
    });
  });

  return groups;
}

function addAdminSubItemRow(containerId, itemData = {}) {
  const list = typeof containerId === 'string' ? $(containerId) : containerId;
  if (!list) return;

  const row = document.createElement('div');
  row.className = 'vt-item-row sub-item-row';
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';
  row.style.marginBottom = '8px';
  row.style.width = '100%';

  const existingFileName = itemData.fileName || itemData.videoName || itemData.pdfName || '';
  const fileLabel = existingFileName ? `File: ${existingFileName}` : 'Upload File';
  const urlValue = itemData.url || itemData.videoUrl || itemData.pdfUrl || '';

  row.innerHTML = `
    <input type="text" placeholder="Title (e.g. Living Room)" class="sub-name form-input-text" style="flex:1; min-width:110px;" value="${esc(itemData.name || itemData.title || '')}" />
    <input type="text" placeholder="Link / URL (YouTube, 3DVista, PDF, MP4)" class="sub-url form-input-text" style="flex:1.5; min-width:130px;" value="${esc(urlValue)}" />
    <label class="btn btn-ghost sub-file-label" style="font-size:11px; padding:6px 10px; cursor:pointer; white-space:nowrap; border:1px dashed rgba(255,255,255,0.25); display:inline-flex; align-items:center; gap:4px;" title="Upload file from device">
      📁 <span class="sub-file-text">${esc(fileLabel)}</span>
      <input type="file" class="sub-file-input" hidden />
    </label>
    <button type="button" class="btn btn-ghost sub-del-btn" title="Delete Item" style="color:var(--danger,#f43f5e); font-size:14px; padding:4px 8px;">✕</button>
  `;

  const fileInput = row.querySelector('.sub-file-input');
  const fileText = row.querySelector('.sub-file-text');

  if (itemData.fileBlob || itemData.videoBlob || itemData.pdfBlob) {
    row._fileBlob = itemData.fileBlob || itemData.videoBlob || itemData.pdfBlob;
    row._fileName = existingFileName || row._fileBlob.name;
    row._videoBlob = row._fileBlob;
    row._videoName = row._fileName;
    row._pdfBlob = row._fileBlob;
    row._pdfName = row._fileName;
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        row._fileBlob = file;
        row._fileName = file.name;
        row._videoBlob = file;
        row._videoName = file.name;
        row._pdfBlob = file;
        row._pdfName = file.name;
        if (fileText) fileText.textContent = `File: ${file.name}`;
      }
    });
  }

  row.querySelector('.sub-del-btn')?.addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function getAdminSubItemRows(containerId) {
  const list = typeof containerId === 'string' ? $(containerId) : containerId;
  if (!list) return [];
  const items = [];
  list.querySelectorAll('.sub-item-row, .vt-item-row').forEach((row, idx) => {
    const name = (row.querySelector('.sub-name, .vt-name')?.value || '').trim();
    const urlVal = (row.querySelector('.sub-url, .vt-url')?.value || '').trim();

    const videoBlob = row._videoBlob || null;
    const videoName = row._videoName || (videoBlob ? videoBlob.name : '');
    const pdfBlob = row._pdfBlob || null;
    const pdfName = row._pdfName || (pdfBlob ? pdfBlob.name : '');

    if (name || urlVal || videoBlob || videoName || pdfBlob || pdfName) {
      items.push({
        id: `item_${idx + 1}`,
        name: name || `Item ${idx + 1}`,
        url: urlVal,
        videoUrl: urlVal,
        pdfUrl: urlVal,
        videoBlob,
        videoName,
        pdfBlob,
        pdfName
      });
    }
  });
  return items;
}

function openAdminMenuModal(act, sectionId = null) {
  activeEditingSecId = sectionId;
  const sections = getCustomSections();
  const existingSec = sectionId ? sections.find(s => s.id === sectionId) : null;

  if (act === 'current_menu') {
    renderCurrentMenuAdminPanel();
    openCustomModal(els.adminCurrentMenuModal);
    return;
  }

  if (act === 'location_intel') {
    if ($('adminLocIntelSectionTitle')) $('adminLocIntelSectionTitle').value = existingSec ? (existingSec.title || '') : '';
    const list = $('adminLocIntelList');
    if (list) {
      list.innerHTML = '';
      const groups = existingSec ? existingSec.groups : [];
      if (groups && groups.length) {
        groups.forEach((grp) => addAdminSubGroup('adminLocIntelList', grp));
      } else {
        addAdminSubGroup('adminLocIntelList', {});
      }
    }
    openCustomModal(els.adminLocationIntelModal);
  } else if (act === 'walkthrough_video') {
    if ($('adminWalkthroughSectionTitle')) $('adminWalkthroughSectionTitle').value = existingSec ? (existingSec.title || '') : '';
    const list = $('adminWalkthroughList');
    if (list) {
      list.innerHTML = '';
      const groups = existingSec ? existingSec.groups : [];
      if (groups && groups.length) {
        groups.forEach((grp) => addAdminSubGroup('adminWalkthroughList', grp));
      } else {
        addAdminSubGroup('adminWalkthroughList', {});
      }
    }
    openCustomModal(els.adminWalkthroughModal);
  } else if (act === 'virtual_tour') {
    if ($('adminVtSectionTitle')) $('adminVtSectionTitle').value = existingSec ? (existingSec.title || '') : '';
    const list = $('adminVtList');
    if (list) {
      list.innerHTML = '';
      const groups = existingSec ? existingSec.groups : [];
      if (groups && groups.length) {
        groups.forEach((grp) => addAdminSubGroup('adminVtList', grp));
      } else {
        addAdminSubGroup('adminVtList', {});
      }
    }
    openCustomModal(els.adminVirtualTourModal);
  } else if (act === 'gallery') {
    if ($('adminGallerySectionTitle')) $('adminGallerySectionTitle').value = existingSec ? (existingSec.title || '') : '';
    state.tempGalleryImages = existingSec && Array.isArray(existingSec.images) ? [...existingSec.images] : [];
    renderAdminGalleryPreviews();
    openCustomModal(els.adminGalleryModal);
  } else if (act === 'brochure') {
    if ($('adminBrochureSectionTitle')) $('adminBrochureSectionTitle').value = existingSec ? (existingSec.title || '') : '';
    const list = $('adminBrochureList');
    if (list) {
      list.innerHTML = '';
      const groups = existingSec ? existingSec.groups : [];
      if (groups && groups.length) {
        groups.forEach((grp) => addAdminSubGroup('adminBrochureList', grp));
      } else {
        addAdminSubGroup('adminBrochureList', {});
      }
    }
    openCustomModal(els.adminBrochureModal);
  } else if (act === 'contact_us') {
    const c = existingSec || {};
    if ($('adminContactSectionTitle')) $('adminContactSectionTitle').value = c.title || '';
    if ($('adminContactTitle')) $('adminContactTitle').value = c.titleVal || c.title || '';
    if ($('adminContactAbout')) $('adminContactAbout').value = c.about || '';
    if ($('adminContactPhone')) $('adminContactPhone').value = c.phone || '';
    if ($('adminContactEmail')) $('adminContactEmail').value = c.email || '';
    const status = $('adminContactImageStatus');
    if (status) status.textContent = c.imageName ? `Current image: ${c.imageName}` : (c.image ? `Current: ${c.image}` : 'No image selected');
    openCustomModal(els.adminContactModal);
  }
}

function openCustomModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('open');
  modalEl.setAttribute('aria-hidden', 'false');
}

function closeCustomModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('open');
  modalEl.setAttribute('aria-hidden', 'true');
  const video = modalEl.querySelector('video');
  if (video) { video.pause(); video.src = ''; }
  const iframe = modalEl.querySelector('iframe');
  if (iframe) iframe.src = 'about:blank';
  const embed = modalEl.querySelector('embed');
  if (embed) embed.removeAttribute('src');
}

function populateAdminVtList() {
  const list = $('adminVtList');
  if (!list) return;
  list.innerHTML = '';
  const items = state.menuConfig.virtual_tour?.items || [];
  if (items.length === 0) {
    addAdminSubItemRow('adminVtList', {});
  } else {
    items.forEach(item => addAdminSubItemRow('adminVtList', item));
  }
}

function addAdminVtRow(name, url) {
  addAdminSubItemRow('adminVtList', { name, url });
}

function renderAdminGalleryPreviews() {
  const container = $('adminGalleryPreviews');
  if (!container) return;
  const images = state.tempGalleryImages || [];
  container.innerHTML = images.map((img, i) => {
    const src = img.blob ? URL.createObjectURL(img.blob) : assetUrl(img.url || img.name);
    return `
      <div class="gallery-preview-item">
        <img src="${esc(src)}" alt="${esc(img.name)}" />
        <button type="button" class="gallery-preview-remove" data-idx="${i}">✕</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.gallery-preview-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (state.tempGalleryImages) state.tempGalleryImages.splice(idx, 1);
      renderAdminGalleryPreviews();
    });
  });
}

// ─── Boot ───────────────────────────────────────────────────────────────────
(async function init() {
  try {
    await loadGeometry();
    // alignment precedence — client: committed file only. admin: freshest of the full
    // working SESSION (IndexedDB: geometry + plan image + alignment), the lightweight
    // DRAFT (localStorage: alignment only), or the committed file. A freshly saved/
    // edited file still wins once its savedAt is newer.
    const file = await loadAlignmentFile();
    const session = state.admin ? await idbGet().catch(() => null) : null;
    const draft = state.admin ? readDraft() : null;
    let chosen = file, restored = null;
    if (session && (!file || session.savedAt >= file.savedAt) && (!draft || session.savedAt >= draft.savedAt)) {
      restored = session;                                // full session is freshest → restore everything
      applySessionGeometry(session);
      chosen = parseAlignment(session.align);
    } else if (draft && (!file || draft.savedAt >= file.savedAt)) {
      chosen = draft;
    }
    if (chosen) { state.transform = chosen.transform; state.savedView = chosen.view; if (chosen.opacity != null) state.overlayOpacity = chosen.opacity; }
    if (chosen?.data) state.sheet = { url: chosen.data.url || '', gid: chosen.data.gid || '', enabled: !!chosen.data.enabled }; // plot-data source (Google Sheet | committed CSV)
    // site branding (title bar): alignment's brand (path) + session logo blob if any
    if (chosen?.brand) Object.assign(state.brand, { name: chosen.brand.name, tagline: chosen.brand.tagline, logo: chosen.brand.logo, _ver: chosen.brand._ver });
    if (restored?.brandLogo?.blob) { state.brand.logoBlob = restored.brandLogo.blob; state.brand.logoName = restored.brandLogo.name; if (!state.brand.logo) state.brand.logo = `sample/${restored.brandLogo.name}`; }
    applyBrand();
    if (chosen?.menuConfig) {
      state.menuConfig = Object.assign({}, state.menuConfig, chosen.menuConfig);
    }
    initCustomMenuAdminAndClient();
    renderClientSidebar();
    // background pano: session blob > project's panoImage reference > neutral fallback
    let panoSrc = null;
    if (restored?.pano?.blob) { state.panoBlob = restored.pano.blob; state.panoName = restored.pano.name; state.panoImage = { file: restored.pano.name }; panoSrc = restored.pano.blob; }
    else if (chosen?.panoImage?.file) { state.panoImage = chosen.panoImage; panoSrc = assetUrl(chosen.panoImage.file); }
    let texture;
    if (panoSrc) { try { texture = await loadPanoTexture(panoSrc); } catch { texture = fallbackPanoTexture(); } }
    else texture = fallbackPanoTexture();                 // project has no pano yet → plain sky, app still runs
    initThree(texture);
    wireAdmin();
    updatePanoName();
    if (restored?.plan?.blob) {                           // imported plan image, recovered from the session blob (survives reload pre-export)
      state.planBlob = restored.plan.blob; state.planName = restored.plan.name;
      const url = URL.createObjectURL(restored.plan.blob);
      await loadGroundImage(url, restored.plan.opacity ?? 1, restored.plan.name);
      if (state.admin && state.groundImage) { els.axPlanRow.hidden = false; els.axPlanOpacity.value = restored.plan.opacity ?? 1; els.axPlanOpacityVal.textContent = `${Math.round((restored.plan.opacity ?? 1) * 100)}%`; }
    } else if (chosen?.groundImage) {                     // draped PNG site plan referenced by the alignment file
      await loadGroundImage(assetUrl(chosen.groundImage.file), chosen.groundImage.opacity, chosen.groundImage.file);
      if (state.admin && state.groundImage) { els.axPlanRow.hidden = false; els.axPlanOpacity.value = chosen.groundImage.opacity; els.axPlanOpacityVal.textContent = `${Math.round(chosen.groundImage.opacity * 100)}%`; }
    }
    const src = await loadData();
    if (restored && Array.isArray(restored.rows)) state.rows = indexRows(restored.rows); // session's edited statuses win (canonicalised to the layout ids)
    applyData(); setSync(src);
    // landmarks: session (freshest) > committed landmarks.json > none
    let lms = [];
    if (restored?.landmarks?.length) lms = parseLandmarks({ landmarks: restored.landmarks });
    else { const lmFile = await loadLandmarksFile(); if (lmFile) lms = lmFile; }
    setLandmarks(lms);
    // amenities: session (freshest, incl. render blobs) > committed amenities.json > none
    let ams = [];
    if (restored?.amenities?.length) ams = parseAmenities({ amenities: restored.amenities });
    else { const amFile = await loadAmenitiesFile(); if (amFile) ams = amFile; }
    setAmenities(ams);
    if (restored && state.admin) setSessionStatus(`Restored your last session · saved ${new Date(restored.savedAt).toLocaleString()}`, true);
    initProjectBar();                                    // header project switcher / manage menu
  } catch (err) {
    console.error(err);
    els.syncMeta.textContent = 'Load error';
    const webgl = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } })();
    showNotice(webgl
      ? `${err.message}. If you opened this file directly (file://), run a static server — e.g. <code>python -m http.server</code> — then reload.`
      : `This browser/GPU could not start WebGL, which the 360° viewer needs. Try a different browser or enable hardware acceleration.`);
  }
})();
