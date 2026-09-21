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

// Minified production build (r160, exact same version as the dev build this replaced) —
// 670KB vs the dev build's 1.3MB unminified, gzipped further by server.py on top of that.
// Swap back to the dev build only if THREE's own internals need debugging (its stack
// traces are far more readable unminified); this app's own code is unaffected either way.
import * as THREE from './vendor/three.module.min.js';

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
  stage: $('stage'), pano: $('pano'), panoHint: $('panoHint'), bootCurtain: $('bootCurtain'),
  bootProgressWrap: $('bootProgressWrap'), bootProgressFill: $('bootProgressFill'), bootProgressPct: $('bootProgressPct'),
  brandMark: $('brandMark'), brandName: $('brandName'), brandTagline: $('brandTagline'),
  proj: $('proj'), projSelect: $('projSelect'), projTools: $('projTools'), projSave: $('projSave'), projSettingsBtn: $('projSettingsBtn'), projSettingsPopover: $('projSettingsPopover'), projSettingsClose: $('projSettingsClose'), projMenuBtn: $('projMenuBtn'), projMenu: $('projMenu'),
  projName: $('projName'), projNameInput: $('projNameInput'), projNameOk: $('projNameOk'), projNameCancel: $('projNameCancel'), projNameHint: $('projNameHint'),
  axBrandName: $('axBrandName'), axBrandTagline: $('axBrandTagline'), axBrandLogo: $('axBrandLogo'), axBrandLogoFile: $('axBrandLogoFile'), axBrandLogoName: $('axBrandLogoName'), axBrandLogoClear: $('axBrandLogoClear'),
  axBootImagePick: $('axBootImagePick'), axBootImageFile: $('axBootImageFile'), axBootImageName: $('axBootImageName'), axBootImageClear: $('axBootImageClear'),
  axSheetOn: $('axSheetOn'), axSheetBody: $('axSheetBody'), axSheetUrl: $('axSheetUrl'), axSheetTest: $('axSheetTest'), axSheetSample: $('axSheetSample'), axSheetMsg: $('axSheetMsg'),
  legend: $('legend'),
  tooltip: $('tooltip'), notice: $('notice'),
  zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), zoomReset: $('zoomReset'), labelToggle: $('labelToggle'), landmarkToggle: $('landmarkToggle'), amenityToggle: $('amenityToggle'),
  zoomStatusGroup: $('zoomStatusGroup'), zoomAvailableBtn: $('zoomAvailableBtn'),
  areaFilterSel: $('areaFilterSel'), areaFilterSelMobile: $('areaFilterSelMobile'),
  axAreaUnit: $('axAreaUnit'), axAreaNote: $('axAreaNote'), axAreaList: $('axAreaList'), axAreaAdd: $('axAreaAdd'),
  axAreaPanel: $('axAreaPanel'), axAreaToggle: $('axAreaToggle'),
  zoomReservedBtn: $('zoomReservedBtn'), zoomSoldBtn: $('zoomSoldBtn'), rotateHint: $('rotateHint'),
  landmarks: $('landmarks'), amenities: $('amenities'),
  tourLayer: $('tourHotspots'),
  axAudioPick: $('axAudioPick'), axAudioFile: $('axAudioFile'), axAudioName: $('axAudioName'), axAudioClear: $('axAudioClear'), siteAudio: $('siteAudio'),
  compass: $('compass'), compassCone: $('compassCone'),
  catDrawer: $('catDrawer'), catDrawerToggle: $('catDrawerToggle'), catToggleIco: $('catToggleIco'), catLevel1: $('catLevel1'), catLevel2: $('catLevel2'), catLevelSubMenu: $('catLevelSubMenu'), catNavL1: $('catNavL1'), catNav: $('catNav'), catBackBtn: $('catBackBtn'),
  catDrawerBrand: $('catDrawerBrand'), catDrawerLogo: $('catDrawerLogo'), catDrawerName: $('catDrawerName'), catDrawerTagline: $('catDrawerTagline'),
  fsToggle: $('fsToggle'), audioToggle: $('audioToggle'), autoPanToggle: $('autoPanToggle'),
  lmOverflowHint: $('lmOverflowHint'),
  // admin tabs + landmarks
  axTitle: $('axTitle'), axSubtitle: $('axSubtitle'), axTabBtnAlign: $('axTabBtnAlign'), axTabBtnLandmarks: $('axTabBtnLandmarks'), axTabBtnAmenities: $('axTabBtnAmenities'), axTabBtnTour: $('axTabBtnTour'),
  axTabAlign: $('axTabAlign'), axTabLandmarks: $('axTabLandmarks'), axTabAmenities: $('axTabAmenities'), axTabTour: $('axTabTour'),
  axTourAdd: $('axTourAdd'), axTourList: $('axTourList'), axTourEmpty: $('axTourEmpty'), axTourNodeFile: $('axTourNodeFile'), axTourLoad: $('axTourLoad'), axTourFile: $('axTourFile'), axTourSaveBtn: $('axTourSaveBtn'),
  axTourNodeAltFile: $('axTourNodeAltFile'), tourVariants: $('tourVariants'),
  axMenuImageFile: $('axMenuImageFile'),
  axTourMapFile: $('axTourMapFile'), tourMapModal: $('tourMapModal'), tourMapModalTitle: $('tourMapModalTitle'), tourMapModalHint: $('tourMapModalHint'),
  tourMapCanvas: $('tourMapCanvas'), tourMapEditImg: $('tourMapEditImg'), tourMapEditDots: $('tourMapEditDots'), tourMapNodeList: $('tourMapNodeList'),
  tourMap: $('tourMap'), tourMapInner: $('tourMapInner'), tourMapImg: $('tourMapImg'), tourMapDots: $('tourMapDots'),
  tourMapSwitch: $('tourMapSwitch'), tourMapPips: $('tourMapPips'), tourMapHide: $('tourMapHide'),
  axLmAdd: $('axLmAdd'), axLmList: $('axLmList'), axLmEmpty: $('axLmEmpty'), axLmCount: $('axLmCount'), axLmShowAll: $('axLmShowAll'), axLmHideAll: $('axLmHideAll'), axLmLoad: $('axLmLoad'), axLmFile: $('axLmFile'), axLmSave: $('axLmSave'),
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
  projMenuBuilderBtn: $('projMenuBuilderBtn'), projMenuBuilderDropdown: $('projMenuBuilderDropdown'),
  catLevelSubMenu: $('catLevelSubMenu'), catSubMenuNav: $('catSubMenuNav'), catSubMenuBackBtn: $('catSubMenuBackBtn'),
  adminNodeBuilderModal: $('adminNodeBuilderModal'),
  clientVideoModal: $('clientVideoModal'), clientGalleryModal: $('clientGalleryModal'),
  clientBrochureModal: $('clientBrochureModal'), clientContactModal: $('clientContactModal'),
  exportFlaggedModal: $('exportFlaggedModal'), exportFlaggedList: $('exportFlaggedList'),
  exportFlaggedCancel: $('exportFlaggedCancel'), exportFlaggedProceed: $('exportFlaggedProceed'),
  offlineSaveBanner: $('offlineSaveBanner'), offlineSavePrompt: $('offlineSavePrompt'), offlineSaveTitle: $('offlineSaveTitle'), offlineSaveSize: $('offlineSaveSize'),
  offlineSaveSkip: $('offlineSaveSkip'), offlineSaveGo: $('offlineSaveGo'), offlineSaveProgress: $('offlineSaveProgress'),
  offlineSaveEta: $('offlineSaveEta'), offlineSaveBarFill: $('offlineSaveBarFill'), offlineSavePct: $('offlineSavePct'),
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
// A bundle also bakes this project's core data files inline (see server.py's
// build_embedded_files_json) so loadProjectFile below never needs fetch() — fetch() and ES
// module imports are both blocked when the exported folder is opened via file:// with no
// server, which is the whole point of a "standalone" bundle; classic <script src> and
// <img src> are not blocked, which is why only the data-loading path needs this indirection.
const BUNDLE_FILES = (BUNDLE && window.B91_BUNDLE_FILES && typeof window.B91_BUNDLE_FILES === 'object') ? window.B91_BUNDLE_FILES : null;
// The pano + site-plan images specifically get base64-embedded too (server.py's
// build_embedded_images_json), keyed by basename → data: URI. Unlike every other asset
// (a plain <img>, which file:// loads fine), these two are uploaded to a WebGL texture,
// and a texture sourced from a file:// path — even one sitting right next to index.html —
// is rejected by the browser as tainted/cross-origin (verified directly); a data: URI isn't.
const BUNDLE_IMAGES = (BUNDLE && window.B91_BUNDLE_IMAGES && typeof window.B91_BUNDLE_IMAGES === 'object') ? window.B91_BUNDLE_IMAGES : null;
// The project comes from ?project=<id> (or the baked bundle id). In ADMIN only, a remembered
// last-project is a convenience fallback; the client never loads a project from localStorage.
const BOOT_PROJECT = BUNDLE
  ? (sanitizeProjectId(BUNDLE.project) || 'site')
  : (sanitizeProjectId(_params.get('project'))
    || (_params.has('admin') ? (() => { try { return sanitizeProjectId(localStorage.getItem('b91-project-id')); } catch { return ''; } })() : '')
    || 'sample');
const baseName = (p) => String(p || '').split(/[\\/]/).pop();

// The narrow-portrait-only condition the drawer default-collapse, topbar/legend squeeze,
// and rotate hint share. A landscape phone has the width these specifically exist to work
// around not having, confirmed by screenshot (the drawer/topbar look right open/uncompressed
// in landscape) — so those stay gated to portrait only. Never true on a real desktop window.
const isMobilePortrait = () => window.innerWidth <= 720 && window.matchMedia('(orientation: portrait)').matches;
// The landmark density cap is a different case: even a fairly wide landscape phone (~844px)
// still isn't wide enough to show a dozen labels without heavy overlap — confirmed by
// screenshot, this one genuinely needs a phone-landscape allowance too, just a separate,
// wider threshold than the portrait one above (900 comfortably covers real phones in
// landscape — the largest phones top out around 926-932px — while real desktop windows are
// essentially never both landscape-oriented AND under 900px).
const isMobileLandscape = () => window.innerWidth <= 900 && window.matchMedia('(orientation: landscape)').matches;

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
  northDeg: 0,   // which STORED lon is true north; drives the compass. 0 until an admin sets it (alignment.json `northDeg`)
  viewVel: { lon: 0, lat: 0 },   // current camera angular velocity (rad/ms) — decays a drag's flick into coasting inertia
  brand: { name: '', tagline: '', logo: null, logoBlob: null, logoName: null, _url: null, _ver: '' }, // client title-bar branding (in alignment.json)
  audio: { file: null, blob: null, name: null, _url: null, _ver: '' },  // admin-uploaded background music (in alignment.json), played on loop for the client
  bootImage: { file: null, blob: null, name: null, _url: null, _ver: '' },  // admin-uploaded #bootCurtain background (in alignment.json), shown while the site boots
  panoBlob: null, panoName: null,       // resized texture-safe pano JPEG kept for export / session restore
  plots: new Map(), selectedId: null, hoverId: null,
  activeFilters: new Set(STATUS_ORDER),
  // Admin-defined area bands (alignment.json `area`). `unit` is a LABEL, not a conversion
  // factor — see plotAreaValue for why. `areaFilterId` is the one currently picked in the
  // client dropdown (null = show everything normally).
  area: { unit: 'sq.ft', filters: [] },
  areaFilterId: null,
  // Per-plot fields the admin has edited away from what the live sheet says. These WIN over
  // the sheet on both sides — see computePlotOverrides/applyPlotOverrides.
  plotOverrides: {},
  overlayOpacity: 0.5,
  showLabels: (() => { try { return localStorage.getItem('b91-show-labels') === '1'; } catch { return false; } })(), // plot-number annotations: optional, default off (remembered per browser)
  showLandmarks: (() => { try { return localStorage.getItem('b91-show-landmarks') !== '0'; } catch { return true; } })(), // landmark banners: default ON so client view shows them on load
  landmarks: [], lmSel: null, adminTab: 'align', // horizon landmarks; selected id; which admin tab is showing
  amenities: [], amSel: null, amCardOpen: null,  // in-layout amenities (icon pins + render); selected id; open card id
  tours: [], tourSel: null, tourNodeSel: null,   // authored virtual tours (tour.json); admin: selected tour id + node id
  menuImageTarget: null,                         // MENU IMAGE node awaiting an upload — see setMenuImageFromFile
  tourAltTarget: null,                           // node awaiting a second (variant 'b') render — see addTourNodeAltFromFile
  tourView: null, tourHsSel: null,               // live tour takeover ({tourId,nodeId,…}) + admin-selected hotspot index
  tourActive: null, tourNode: null,              // client: running tour object + current node id (null ⇒ not in a tour)
  cardAnchor: null, cardHoverMode: false,        // shared info-card anchor {lon,lat}; hover cards (landmarks) auto-hide
  serverSave: true,                              // is server.py's write API reachable? (else saves fall back to downloads)
  showAmenities: (() => { try { return localStorage.getItem('b91-show-amenities') !== '0'; } catch { return true; } })(), // amenities: shown by default (they're core content)
  view: { lon: 0, lat: 0, fov: 70 }, home: { lon: 0, lat: 0, fov: 70 },
  savedView: null,                      // camera view stored in the alignment (WYSIWYG); null ⇒ auto-frame
  adminMode: 'look',                    // 'look' = drag rotates view; 'move' = drag repositions layout
  selectedCategory: 'ALL', autoPan: true, lastUserTouch: Date.now(), audioCtx: null, audioPlaying: false,
  landmarkPanRange: null, autoPanDir: 1,  // when a category is selected, idle auto-pan sweeps between its leftmost/rightmost landmark instead of spinning 360°
  menuConfig: {
    tree: []
  },
  menuNavStack: [],
  // Visitor pref: does picking a menu item collapse the drawer? Default false = the
  // existing auto-collapse behaviour. See buildKeepMenuToggle.
  keepMenuOpen: (() => { try { return localStorage.getItem('b91-keep-menu-open') === '1'; } catch { return false; } })(),
  // Visitor pref: has the tour minimap been dismissed? Persisted like the other client
  // toggles, so "I don't want this" sticks across rooms and tours rather than needing to be
  // re-dismissed every time. See toggleTourMapHidden.
  tourMapHidden: (() => { try { return localStorage.getItem('b91-tour-map-hidden') === '1'; } catch { return false; } })(),
};
let three = null, plotsDirty = false;
const labelCache = new Map();           // id → reusable label Sprite (avoid texture churn on rebuild)

// Resolve a committed data file / image to a URL under the active project dir. Stored
// image paths (e.g. "sample/foo.jpg") are resolved by BASENAME against the project base,
// so old paths keep working and a project directory is self-contained & relocatable.
const dataUrl = (name) => `${state.assetBase}/${name}?t=${Date.now()}`;

// Load one of this project's core data files (plots.svg/csv, alignment/landmarks/amenities
// .json) — in a standalone bundle, reads the copy server.py embedded inline (BUNDLE_FILES)
// instead of fetch()-ing it, since fetch() is blocked when the exported folder is opened via
// file:// with no server. Returns a fetch-Response-shaped object either way (.ok/.text()/
// .json()) so callers don't need to branch — null on any failure, same as a failed fetch.
async function loadProjectFile(name) {
  if (BUNDLE_FILES && Object.prototype.hasOwnProperty.call(BUNDLE_FILES, name)) {
    const text = BUNDLE_FILES[name];
    return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
  }
  try { return await fetch(dataUrl(name), { cache: 'no-store' }); } catch { return null; }
}

function assetUrl(storedPath, ver) {
  if (!storedPath) return '';
  if (/^(https?:|\/\/|data:|blob:)/i.test(storedPath)) return storedPath;
  if (BUNDLE_IMAGES) {
    const embedded = BUNDLE_IMAGES[baseName(storedPath)];
    if (embedded) return embedded;         // pano/plan in bundle mode — see BUNDLE_IMAGES above
  }
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
  const res = await loadProjectFile('plots.csv');
  if (!res || !res.ok) { state.rows = new Map(); return false; } // new/empty project — no CSV yet
  state.rows = indexRows(parseCSV(await res.text()).map(normalizeRow));
  return true;
}
// Populate state.rows from the LIVE sheet if one is configured & reachable, else the
// committed CSV. Returns a short label describing the source (shown by setSync).
// Fields an admin edit can pin. Mirrors buildPlotsCSV's columns minus plot_id.
const OVERRIDE_FIELDS = ['status', 'facing', 'size', 'dimensions', 'price', 'block', 'tour_url', 'video_url', 'image_url', 'media_json', 'notes'];
// Which fields differ between what the admin currently has and what the sheet says — i.e.
// what the admin has deliberately changed. Derived by DIFFING at save time rather than by
// tracking every keystroke: the admin's rows were themselves seeded from the sheet, so
// anything that no longer matches it is by definition an edit. That also makes it
// self-cleaning — set a value back to what the sheet says and the override disappears.
//
// A blank is never recorded: "" can't be told apart from "never filled in", and recording
// it would let an empty admin field permanently mask a real sheet value.
function computePlotOverrides(sheetRows) {
  if (!sheetRows) return state.plotOverrides || {};
  const out = {};
  state.rows.forEach((row, id) => {
    const s = sheetRows.get(id), diff = {};
    OVERRIDE_FIELDS.forEach((k) => {
      const mine = (row?.[k] ?? '').toString().trim();
      const theirs = (s?.[k] ?? '').toString().trim();
      if (mine && mine !== theirs) diff[k] = mine;
    });
    if (Object.keys(diff).length) out[id] = diff;
  });
  return out;
}
function applyPlotOverrides() {
  const ov = state.plotOverrides || {};
  for (const [id, fields] of Object.entries(ov)) {
    const row = state.rows.get(id) || { plot_id: id };
    Object.assign(row, fields);
    row.plot_id = id;
    state.rows.set(id, normalizeRow(row));   // status may have been overridden — re-lower-case it
  }
}
async function loadData() {
  // A standalone bundle has no network to reach a live sheet with, and no server to fall
  // back through either — go straight to the embedded plots.csv instead of a doomed fetch.
  //
  // Precedence, when a sheet is configured: committed plots.csv (the base — covers every
  // plot, including any the sheet has no row for) < the live sheet (bulk, always current)
  // < the admin's own edits. The last of those is the rule this exists to enforce: the
  // sheet used to REPLACE state.rows wholesale, so anything edited in the admin was
  // invisible to the client, and plots missing from the sheet lost their data entirely.
  if (!BUNDLE && state.sheet.enabled && state.sheet.url) {
    const snap = await fetchSheetRows();
    if (snap) {
      await loadCommittedCSV();
      snap.forEach((row, id) => state.rows.set(id, row));
      applyPlotOverrides();
      state.dataSource = 'live'; return 'live sheet';
    }
    await loadCommittedCSV(); applyPlotOverrides(); state.dataSource = 'cached'; return 'cached · sheet unreachable';
  }
  await loadCommittedCSV(); applyPlotOverrides(); state.dataSource = 'file'; return `project “${state.projectId}”`;
}

// ─── Geometry (polygons in image-pixel space) + anchor ────────────────────────
async function loadGeometry() {
  const res = await loadProjectFile('plots.svg');
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
// ─── Boot progress bar ─────────────────────────────────────────────────────────
// Real byte progress of whatever the boot curtain is actually waiting on — usually the
// pano and/or draped site-plan image, the two big binary downloads, not the tiny JSON/SVG
// files that load before them. Never regresses (a stalled fetch shouldn't visibly rewind
// the bar); see hideBootCurtain for where it gets reset/hidden for good after first boot.
let bootPct = 0;
function setBootProgress(pct) {
  bootPct = Math.max(bootPct, Math.min(100, pct));
  if (els.bootProgressFill) els.bootProgressFill.style.width = bootPct.toFixed(0) + '%';
  if (els.bootProgressPct) els.bootProgressPct.textContent = bootPct.toFixed(0) + '%';
}
// Fetches a URL as a Blob while reporting real bytes-loaded/total via onBytes(loaded,
// total) — server.py always sends Content-Length for static assets, so `total` is
// reliable here. Falls back to a plain non-streamed fetch (progress jumps once at the
// end) if the runtime can't stream a response body. On a non-ok response, tries to read a
// JSON `{error}` body for a real message (several of this app's own API routes return
// one) before falling back to a plain status-code message.
async function fetchBlobWithProgress(url, onBytes) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    let msg = `Could not load ${url} (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  const total = +res.headers.get('content-length') || 0;
  if (!res.body?.getReader) { const blob = await res.blob(); onBytes?.(blob.size, total || blob.size); return blob; }
  const reader = res.body.getReader(); const chunks = []; let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.length;
    onBytes?.(loaded, total);
  }
  return new Blob(chunks);
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
// Background audio, stored and resolved exactly like the brand logo: a fresh in-memory
// blob wins before export, otherwise the committed path, cache-busted with the alignment's
// savedAt so re-uploading over the same filename can't serve a stale track.
function audioData() {
  return state.audio.file ? { file: state.audio.file } : null;
}
function siteAudioSrc() {
  const a = state.audio;
  if (a.blob) { if (!a._url) a._url = URL.createObjectURL(a.blob); return a._url; }
  return assetUrl(a.file, a._ver);
}
function hasSiteAudio() { return !!(state.audio.blob || state.audio.file); }
// #bootCurtain background image, resolved/serialised exactly like the brand logo (fresh
// blob wins before export, otherwise the committed path — but, unlike every other
// branding asset here, deliberately NOT cache-busted with `_ver` (2026-09-16). This one
// needs to be visible before app.js has even fetched alignment.json (see the <link
// rel="preload"> in index.html's <head>, which can only target a FIXED url), so its
// committed path must be predictable ahead of time. The staleness risk that `_ver`
// normally guards against is covered instead by giving this exact filename a short
// server-side cache lifetime (deploy_s3.py's BOOT_IMAGE_CACHE) rather than a version
// token — a brief window of possibly-stale is an acceptable trade for a loading screen
// that would otherwise defeat its own purpose by taking seconds to appear.
function bootImageData() {
  return state.bootImage.file ? { file: state.bootImage.file } : null;
}
function bootImageSrc() {
  const b = state.bootImage;
  if (b.blob) { if (!b._url) b._url = URL.createObjectURL(b.blob); return b._url; }
  return assetUrl(b.file);
}
function hasBootImage() { return !!(state.bootImage.blob || state.bootImage.file); }
// Paints (or clears) #bootCurtain's background from state.bootImage. Called alongside
// applyBrand()/applySiteAudio() as soon as the alignment is known — early enough in boot
// that the custom image covers most of the loading window, since alignment.json is one
// of the first things fetched (well before the much larger pano/ground-image downloads
// the curtain is actually waiting on). Falls back to the plain dark background (the
// existing #bootCurtain CSS default) when no image is set.
function applyBootImage() {
  if (!els.bootCurtain) return;
  const src = hasBootImage() ? bootImageSrc() : '';
  els.bootCurtain.style.backgroundImage = src ? `url("${src}")` : '';
  els.bootCurtain.classList.toggle('has-image', !!src);
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
  // Mirror the branding into the drawer's phone-only header (see index.html) — same
  // resolved logo/name/tagline, so it can't drift from the top bar's version.
  if (els.catDrawerName) els.catDrawerName.textContent = name;
  if (els.catDrawerTagline) els.catDrawerTagline.textContent = tagline;
  if (els.catDrawerLogo) {
    const dropText = () => els.catDrawerBrand && els.catDrawerBrand.classList.remove('has-logo');
    if (src) {
      els.catDrawerLogo.innerHTML = `<img alt="${esc(name)} logo" />`;
      const i = els.catDrawerLogo.firstChild;
      // A logo almost always contains the company wordmark already, so repeating the name
      // and tagline underneath just prints it twice — `has-logo` hides them (CSS). Falls
      // back to showing the text if the image can't load.
      i.onerror = () => { els.catDrawerLogo.textContent = raw ? brandInitials(raw) : BRAND_DEFAULT_MARK; dropText(); };
      i.src = src;
      if (els.catDrawerBrand) els.catDrawerBrand.classList.add('has-logo');
    } else {
      els.catDrawerLogo.textContent = raw ? brandInitials(raw) : BRAND_DEFAULT_MARK;
      dropText();
    }
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
// Stored AS UPLOADED — no re-encode. There's no browser-side equivalent of
// resizeImageToBlob for audio (decoding + re-encoding in-page needs a codec we don't ship),
// so the admin's file is what ships. Hence the size warning rather than a silent shrink: a
// 20MB track is a real cost on a phone, and only the admin can fix it.
//
// A VIDEO is accepted here too, and only its sound is used. No extraction step is needed:
// an <audio> element handed an .mp4/.webm/.mov demuxes it and plays the sound track, with
// the picture simply never rendered because an audio element has no video surface. That
// keeps one code path for both kinds. (The alternative — decodeAudioData into a buffer —
// would pull the whole file into memory as raw PCM, hundreds of MB for a short clip, to
// achieve the same audible result.) The cost is honest and stated in the admin hint: the
// file still ships at its full video size, so an audio file is lighter for visitors.
const SITE_AUDIO_BIG_MB = 8;
function isVideoSource(file) {
  return /^video\//i.test(file?.type || '') || /\.(mp4|m4v|mov|mkv|webm)$/i.test(file?.name || '');
}
function setSiteAudioFile(file) {
  if (!file) return;
  const named = /\.(mp3|m4a|aac|ogg|oga|wav|weba|webm|mp4|m4v|mov|mkv)$/i.test(file.name || '');
  if (!/^(audio|video)\//i.test(file.type || '') && !named) {
    setAxStatus('That does not look like an audio or video file — use an MP3, M4A, OGG or WAV, or an MP4/WebM/MOV whose sound you want.');
    return;
  }
  if (state.audio._url) { try { URL.revokeObjectURL(state.audio._url); } catch {} state.audio._url = null; }
  const ext = ((file.name || '').match(/\.[a-z0-9]+$/i) || ['.mp3'])[0].toLowerCase();
  state.audio.blob = file;
  state.audio.name = `audio${ext}`;
  state.audio.file = `sample/audio${ext}`;
  applySiteAudio(); onAlignmentChanged();
  const mb = file.size / (1024 * 1024);
  const vid = isVideoSource(file);
  setAxStatus(`Background ${vid ? 'audio taken from that video' : 'audio set'} (${mb.toFixed(1)} MB).${vid
    ? ' Only its <strong>sound</strong> is used — the picture is never shown.'
    : ''}${mb > SITE_AUDIO_BIG_MB
    ? ' <strong>That is large</strong> — visitors on mobile data download it before it plays; a shorter clip, or an audio-only file, is kinder.'
    : ''} Press <strong>\u{1F50A}</strong> to preview. Click <strong>Save</strong> in the top bar to commit it.`);
  if (vid) warnIfSilentVideo(file);
}
// A video picked for its music might carry no sound track at all — in which case nothing
// ever plays and there is no clue why. There is no portable "hasAudio" API, so this only
// speaks up when a browser answers DEFINITIVELY (Firefox's mozHasAudio, or the spec's
// audioTracks where implemented); elsewhere it stays quiet rather than crying wolf on a
// perfectly good file. The admin's \u{1F50A} preview is the real check either way.
function warnIfSilentVideo(file) {
  let probe;
  try { probe = document.createElement('video'); } catch { return; }
  const url = URL.createObjectURL(file);
  const finish = (hasSound) => {
    try { URL.revokeObjectURL(url); } catch {}
    probe.removeAttribute('src');
    if (hasSound === false) setAxStatus('That video has <strong>no sound track</strong>, so nothing will play for visitors. Pick a clip that has audio.');
  };
  probe.preload = 'auto';
  probe.muted = true;                     // muted playback is exempt from the autoplay policy, so the fallback below needs no gesture
  probe.addEventListener('loadedmetadata', () => {
    if (typeof probe.mozHasAudio === 'boolean') { finish(probe.mozHasAudio); return; }              // Firefox
    if (probe.audioTracks && typeof probe.audioTracks.length === 'number') { finish(probe.audioTracks.length > 0); return; }  // spec / Safari
    // Chrome exposes neither, but it does count decoded bytes per track — so play it
    // MUTED for a moment and see whether any audio actually decodes. Verified to
    // discriminate correctly on real files: a clip with a `soun` track reports a non-zero
    // count, a video-only clip stays at 0.
    if (typeof probe.webkitAudioDecodedByteCount !== 'number') { finish(null); return; }
    probe.play().then(() => {
      setTimeout(() => { const n = probe.webkitAudioDecodedByteCount; try { probe.pause(); } catch {} finish(n > 0); }, 700);
    }).catch(() => finish(null));
  }, { once: true });
  probe.addEventListener('error', () => finish(null), { once: true });
  probe.src = url;
}
function clearSiteAudio() {
  if (state.audio._url) { try { URL.revokeObjectURL(state.audio._url); } catch {} state.audio._url = null; }
  state.audio.file = null; state.audio.blob = null; state.audio.name = null;
  applySiteAudio(); onAlignmentChanged();
  setAxStatus('Background audio removed. Click <strong>Save</strong> in the top bar to commit it.');
}
function updateAudioAdminUI() {
  if (els.axAudioName) els.axAudioName.textContent = hasSiteAudio() ? (state.audio.name || baseName(state.audio.file) || 'audio') : 'no audio';
  if (els.axAudioClear) els.axAudioClear.hidden = !hasSiteAudio();
  if (els.axAudioPick) els.axAudioPick.textContent = hasSiteAudio() ? '\u{1F3B5} Replace\u2026' : '\u{1F3B5} Audio\u2026';
}
function clearBrandLogo() {
  if (state.brand._url) { try { URL.revokeObjectURL(state.brand._url); } catch {} state.brand._url = null; }
  state.brand.logo = null; state.brand.logoBlob = null; state.brand.logoName = null;
  applyBrand(); onAlignmentChanged();
}
async function setBootImage(file) {
  if (!file) return;
  // Tighter than the pano's own 2000px/0.85 cap (2026-09-16) — this is glanced at for a
  // couple of seconds while the real content loads behind it, not something a visitor
  // studies up close, so it's worth trading a bit of sharpness for a faster download on
  // exactly the asset that most needs to arrive fast.
  let out; try { out = await resizeImageToBlob(file, 1600, 'image/jpeg', 0.78); }
  catch { setAxStatus('Could not read that image — use a PNG/JPG/WebP image.'); return; }
  if (state.bootImage._url) { try { URL.revokeObjectURL(state.bootImage._url); } catch {} state.bootImage._url = null; }
  state.bootImage.blob = out.blob; state.bootImage.file = 'sample/loading.web.jpg'; state.bootImage.name = 'loading.web.jpg';
  applyBootImage(); updateBootImageAdminUI(); onAlignmentChanged();
  setAxStatus(`Loading page image set (${out.W}×${out.H}). Click <strong>Save</strong> in the top bar to commit it.`);
}
function clearBootImage() {
  if (state.bootImage._url) { try { URL.revokeObjectURL(state.bootImage._url); } catch {} state.bootImage._url = null; }
  state.bootImage.file = null; state.bootImage.blob = null; state.bootImage.name = null;
  applyBootImage(); updateBootImageAdminUI(); onAlignmentChanged();
  setAxStatus('Loading page image removed. Click <strong>Save</strong> in the top bar to commit it.');
}
function updateBootImageAdminUI() {
  const has = hasBootImage();
  if (els.axBootImageName) { els.axBootImageName.textContent = has ? (state.bootImage.name || baseName(state.bootImage.file) || 'image') : 'no loading page image'; els.axBootImageName.classList.toggle('is-set', has); }
  if (els.axBootImageClear) els.axBootImageClear.hidden = !has;
  if (els.axBootImagePick) els.axBootImagePick.textContent = has ? '\u{1F5BC} Replace…' : '\u{1F5BC} Loading page image…';
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
// A concrete example of the exact header row this feature expects (the same fatal
// error testSheet reports — "no plot_id column" — is the #1 way an admin hits this
// blind, since nothing before this button ever showed them what the sheet is
// supposed to look like). Uses the REAL plot ids from the current layout when any
// exist, so pasting this straight into a fresh Google Sheet and hitting Test shows
// every id already matching, rather than a generic template the admin then has to
// find-and-replace. Deliberately keeps to the base plots.csv columns only
// (plot_id/status/facing/size/dimensions/price/block/tour_url/notes) — the extra
// video_url/image_url/media_json columns buildPlotsCSV also writes are advanced,
// multi-media fields meant to be authored via the trace editor's own picker UI, not
// hand-typed into a spreadsheet.
function downloadSampleSheetCsv() {
  const cols = ['plot_id', 'status', 'facing', 'size', 'dimensions', 'price', 'block', 'tour_url', 'notes'];
  const statuses = ['available', 'reserved', 'sold'];
  const facings = ['East', 'North', 'West', 'South'];
  const sizes = ['1200 sq.ft', '1500 sq.ft', '1800 sq.ft', '2000 sq.ft'];
  const dims = ['30x40', '30x50', '40x45', '40x50'];
  const prices = ['1800000', '2250000', '2800000', '3200000'];
  const blocks = ['A', 'A', 'B', 'B'];
  const notesEx = ['Corner plot', '', 'Near clubhouse', 'Park facing'];
  const ids = state.geom.length ? state.geom.slice(0, 5).map((g) => g.id) : ['Plot-101', 'Plot-102', 'Plot-103'];
  const esc = (v) => { v = (v ?? '').toString(); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = ids.map((id, i) => [
    id, statuses[i % statuses.length], facings[i % facings.length], sizes[i % sizes.length],
    dims[i % dims.length], prices[i % prices.length], blocks[i % blocks.length], '', notesEx[i % notesEx.length],
  ].map(esc).join(','));
  const csv = cols.join(',') + '\n' + rows.join('\n') + '\n';
  downloadFiles([['sample-plot-data.csv', csv, 'text/csv']]);
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
    updateBootImageAdminUI();
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
    tex.anisotropy = 16;   // see the pano's identical line — default 1 blurs this drape badly
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
// TWO OPPOSITE LON CONVENTIONS LIVE IN THIS FILE — the single most expensive trap here.
//   • A stored lon (landmarks, amenities, `lonLatFromDir`, `dirFromLonLat`) uses
//     `atan2(-v.x, v.z)`, because the pano sphere is viewed from INSIDE and its texture is
//     X-mirrored (see `dir()` / the handedness note in CLAUDE.md).
//   • `state.view.lon` is the CAMERA YAW, fed to `cam.rotation.set(lat, lon + PI, 0)`.
//     Working that matrix out, the camera's forward vector is
//     `(cos(lat)sin(lon), sin(lat), cos(lat)cos(lon))` — the X-mirror of `dirFromLonLat`.
// So the two run in OPPOSITE directions: `state.view.lon = L` looks at stored lon `-L`.
// Converting a world direction into a camera lon therefore needs `atan2(+v.x, v.z)`, NOT
// the `atan2(-v.x, v.z)` used everywhere else — mixing them aims the camera at the
// category's mirror image. That is exactly the bug fixed on 2026-09-04: it was invisible
// for landmarks sitting near lon 0 (a 2° group was 4° off, lost in a 100°+ FOV) and
// catastrophic away from it (a group at 53° was aimed 106° wrong, i.e. nowhere near it).
// Always go through this helper for anything that ends up in `state.view.lon`.
function viewLonFromDir(v) { return Math.atan2(v.x, v.z); }
function computeHome() {
  if (!state.geom.length) return;
  const mean = new THREE.Vector3(); const dirs = [];
  state.geom.forEach((g) => g.pts.forEach((p) => { const d = placeOnSphere(p); dirs.push(d); mean.add(d); }));
  mean.normalize();
  state.home.lon = viewLonFromDir(mean);          // camera yaw, not a stored lon (see above)
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
// Idle auto-pan speed. Advancing a fixed amount PER FRAME tied the pan rate to the
// display: the same scene drifted twice as fast on a 120Hz phone as on a 60Hz laptop,
// and slowed to a crawl whenever the frame rate dipped. Expressed per millisecond
// instead, preserving the long-standing 60fps feel (0.00035 rad/frame) exactly.
const AUTOPAN_RATE = (1.8 * Math.PI / 180) / 1000;   // rad per ms == 1.8 deg/s, the reference tour's idle drift (its sequences run 1.6-2.1)
let lastFrameTs = 0;
function renderLoop() {
  requestAnimationFrame(renderLoop);
  if (!three) return;
  if (plotsDirty) { plotsDirty = false; rebuildPlots(); }

  const nowTs = performance.now();
  // Cap dt so returning to a backgrounded tab resumes the drift instead of lurching
  // through however many seconds of rAF the browser skipped.
  const dtMs = lastFrameTs ? Math.min(100, nowTs - lastFrameTs) : (1000 / 60);
  lastFrameTs = nowTs;

  // Steered motion (d-pad, and the flick left over from a drag) takes precedence over the
  // idle drift below — they'd otherwise both write state.view.lon in the same frame.
  const steering = stepViewMotion(dtMs);

  // Slow motion auto-pan when enabled in client view (!state.admin) and user is idle.
  // With no category selected: free 360° spin (unchanged). With a category selected:
  // ping-pong between that category's rightmost and leftmost landmark instead
  // (increasing lon sweeps leftward — the pano is viewed from inside, so it's mirrored).
  // `!state.hoverId` holds the camera still for as long as the cursor rests on a plot
  // (2026-09-18, on request). It has to be the hover STATE rather than a `lastUserTouch`
  // bump, because a pointer resting motionless on a plot stops firing events — the idle
  // timer would expire and the map would drift out from under whatever the visitor is
  // reading. Leaving the plot resumes the drift on the usual idle delay.
  if (!steering && state.autoPan && !state.admin && !cameraAnimTimer && !state.hoverId && Date.now() - (state.lastUserTouch || 0) > 2200) {
    const range = state.landmarkPanRange;
    if (range) {
      // Re-express the current lon as the equivalent value nearest the range so the
      // comparison below is correct regardless of which ±360° "lap" it's stored at.
      const lo = range.sweepMin, hi = range.sweepMax;
      const mid = (lo + hi) / 2;
      let lon = state.view.lon;
      while (lon - mid > Math.PI) lon -= TAU;
      while (mid - lon > Math.PI) lon += TAU;

      // A swept category carries its own pace (`radPerMs`, sized so one pass takes
      // LANDMARK_SWEEP_MS); a fitted one just sways at the ambient rate.
      lon += (range.radPerMs || AUTOPAN_RATE) * dtMs * (state.autoPanDir || 1);
      if (lon >= hi) { lon = hi; state.autoPanDir = -1; }
      else if (lon <= lo) { lon = lo; state.autoPanDir = 1; }
      state.view.lon = lon;
    } else {
      state.view.lon = (state.view.lon + AUTOPAN_RATE * dtMs) % TAU;
    }
  }

  updateCamera();
  updateCompass();
  updateTourMapCone();     // minimap view cone tracks the camera, same as the compass does
  three.renderer.render(three.scene, three.camera);
  if (els.panel.classList.contains('open')) placePanel();   // keep the popover glued to its plot as the view moves
  if (els.landmarks && !els.landmarks.hidden) renderLandmarks();  // keep banners/pins/lines glued to the scene
  if (els.amenities && !els.amenities.hidden) renderAmenities();  // keep amenity icon-pins glued to the scene
  if (state.tourView) renderTourHotspots();                       // keep tour nav hotspots glued to the scene
  if (els.amCard && els.amCard.classList.contains('open')) placeAmCard(); // keep the amenity card glued to its pin
}
// ─── Compass ─────────────────────────────────────────────────────────────
// The rose turns with the view; the letters counter-turn so they stay upright, which is
// how the reference tour's compass reads and the only way N/S/E/W stay legible.
// `state.view.lon` is the camera YAW and runs OPPOSITE a stored lon (see the two-conventions
// gotcha), so the heading is negated to get a stored-lon bearing before north is removed.
// Keeps the auto-pan button's icon and wording describing what a press will DO.
function updateAutoPanToggleUI() {
  const b = els.autoPanToggle;
  if (!b) return;
  b.classList.toggle('is-active', !!state.autoPan);
  const t = state.autoPan ? 'Stop the camera moving' : 'Let the camera move again';
  b.title = t;
  b.setAttribute('aria-label', t);
  b.setAttribute('aria-pressed', String(!state.autoPan));
}

function updateCompass() {
  if (!els.compassCone) return;
  // Only the cone moves. Its artwork points at 12 o'clock (north), so rotating it by the
  // heading swings it to whatever the camera faces. `state.view.lon` is the camera YAW and
  // runs OPPOSITE a stored lon (see the two-conventions gotcha), hence the negation.
  const headingDeg = -state.view.lon * 180 / Math.PI;
  const rot = headingDeg - (state.northDeg || 0);
  els.compassCone.setAttribute('transform', `rotate(${rot.toFixed(2)} 60 60)`);
}
// The camera yaw (state.view.lon) that makes the compass point at north — i.e. the exact
// inverse of updateCompass()'s own heading formula above (rot = -lon*180/PI - northDeg;
// rot is 0, cone at 12 o'clock/north, when lon = -northDeg in radians). Used by the
// AERIAL VIEW menu action so "reset to the full site view" also means "face north," not
// just whatever direction the layout's centroid happens to sit in. Uncalibrated projects
// (northDeg unset, the compass's own documented default) resolve this to lon 0.
function northFacingLon() { return -(state.northDeg || 0) * Math.PI / 180; }

// The directional pad was removed 2026-09-10 (client no longer offers it — drag/flick is
// the only look-around input now). `stepViewMotion`/`viewVel` survive because a drag's
// flick-to-coast inertia (wireViewControls' pointerup handler) shares the same
// frame-rate-independent easing the d-pad used to drive with a held-button target; with no
// target to chase any more, this just decays whatever velocity a flick left behind toward
// zero, which is exactly what coasting needs.
const VIEW_EASE_PER_S = 0.0016;            // fraction of the gap left after 1s
// Integrates viewVel each frame; called from renderLoop so motion is tied to elapsed time
// rather than to how often a timer happens to fire.
function stepViewMotion(dtMs) {
  const v = state.viewVel;
  const k = 1 - Math.pow(VIEW_EASE_PER_S, dtMs / 1000);       // frame-rate independent easing
  v.lon += (0 - v.lon) * k;
  v.lat += (0 - v.lat) * k;
  if (Math.abs(v.lon) < 1e-7 && Math.abs(v.lat) < 1e-7) { v.lon = 0; v.lat = 0; return false; }
  state.view.lon += v.lon * dtMs;
  state.view.lat = clampLat(state.view.lat + v.lat * dtMs);
  return true;
}

function updateCamera() {
  const cam = three.camera;
  // Hard limit: while a landmark category is selected in the client, the view can
  // never leave that category's own arc — enforced here (the single place the view
  // is consumed) so no path out of it exists: auto-pan or a drag.
  //
  // ...but NOT while a fly-in is in flight (`cameraAnimTimer`). `applyCategoryFilter`
  // installs the new range and *then* starts the fly-in, and the fly-in by definition
  // begins outside that range — so clamping it made every frame render pinned to the
  // range boundary: the camera snapped to the destination on frame 1 and sat there
  // while only the FOV animated. Measured on a real project (2026-09-04): 5 of 6
  // categories jumped 15-70 degrees instantly and stayed frozen for 22-29 of the 36
  // animation frames. The arc lock is meant to bound where the view can WANDER, not to
  // fight the animation that is delivering it there, so it engages once the fly-in ends.
  const range = state.landmarkPanRange;
  if (range && !state.admin && !cameraAnimTimer) {
    const mid = (range.sweepMin + range.sweepMax) / 2;
    let lon = state.view.lon;
    while (lon - mid > Math.PI) lon -= TAU;
    while (mid - lon > Math.PI) lon += TAU;
    state.view.lon = Math.min(range.sweepMax, Math.max(range.sweepMin, lon));
  }
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
  let panStart = null, didMove = false, pinch = 0, moveMode = false, dragLast = null, downXY = null, dragFlick = null;

  el.addEventListener('wheel', (e) => { e.preventDefault(); setFov(state.view.fov * (e.deltaY > 0 ? 1.06 : 1 / 1.06)); }, { passive: false });

  el.addEventListener('pointerdown', (e) => {
    try { el.setPointerCapture(e.pointerId); } catch {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      didMove = false;
      if (state.admin && state.adminMode === 'move') { moveMode = true; dragLast = rayToGround(e); downXY = { x: e.clientX, y: e.clientY }; panStart = null; } // drag anywhere → reposition layout
      else { moveMode = false; panStart = { x: e.clientX, y: e.clientY, lon: state.view.lon, lat: state.view.lat, t: performance.now() }; }
      state.viewVel.lon = 0; state.viewVel.lat = 0; dragFlick = null;   // grabbing kills any coast
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
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        didMove = true;
        // A deliberate drag outranks the selected category's arc: the auto-framing and
        // sweep are a helpful default, not a cage. Releasing the range here (the same
        // thing leaving Landmarks does) restores free 360° look AND free idle spin, while
        // the category FILTER stays put — that's `state.selectedCategory`, untouched, so
        // the chosen landmarks stay highlighted while the visitor looks around. Also stops
        // an in-flight fly-in from yanking the view back mid-drag.
        if (!state.admin && state.landmarkPanRange) {
          state.landmarkPanRange = null;
          if (cameraAnimTimer) { clearInterval(cameraAnimTimer); cameraAnimTimer = null; }
        }
      }
      const nlon = panStart.lon - dx * k, nlat = clampLat(panStart.lat + dy * k);
      // Remember the instantaneous speed of the gesture so releasing can coast (below).
      const now = performance.now(), dt = Math.max(1, now - (panStart.t || now));
      dragFlick = { lon: (nlon - state.view.lon) / dt, lat: (nlat - state.view.lat) / dt };
      panStart.t = now;
      state.view.lon = nlon; state.view.lat = nlat; requestRender();
    } else hover(e);
  });

  const end = (e) => {
    const wasClick = (panStart || moveMode) && !didMove, wasDrag = didMove && (moveMode || panStart);
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0;
    if (pointers.size === 0) {
      el.classList.remove('grabbing');
      if (wasClick) pick(e);
      // Let a flick coast instead of stopping dead the instant the finger lifts — the
      // single biggest thing that made panning feel rough. stepViewMotion decays it.
      if (wasDrag && !moveMode && dragFlick) {
        const cap = 0.004;                       // rad/ms, keeps a hard flick from spinning wildly
        state.viewVel.lon = Math.max(-cap, Math.min(cap, dragFlick.lon));
        state.viewVel.lat = Math.max(-cap, Math.min(cap, dragFlick.lat));
      }
      dragFlick = null;
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
  for (const btn of zoomStatusButtons()) btn.addEventListener('click', () => toggleFilter(btn.dataset.status));
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
    // Start collapsed on narrow PORTRAIT screens only: the drawer is ~80% of the viewport
    // width there (fine as a tap-to-open overlay, the standard mobile drawer pattern), but
    // left open by default it covers almost the whole phone screen before the visitor has
    // even seen the panorama. A landscape phone has the width to spare — same as desktop,
    // which this never touches (isMobilePortrait is never true on a real desktop window) —
    // so it keeps the open-by-default behavior there too.
    if (isMobilePortrait() && !state.admin) {
      els.catDrawer.classList.add('is-collapsed');
      if (els.catToggleIco) els.catToggleIco.textContent = '›';
    }
  }

  els.lmOverflowHint?.addEventListener('click', (e) => { e.stopPropagation(); openLandmarksCategoryPicker(); });

  // Nudge portrait mobile visitors toward landscape, where there's room for the layout to
  // breathe (see the reference the admin's own screenshots were compared against). Purely
  // a suggestion — reuses the existing showNotice toast, auto-dismisses, never blocks
  // anything — and re-fires if they rotate back into portrait after having left it.
  if (!state.admin) {
    // No dismiss path on purpose — see showRotateHint. Listening on BOTH the orientation
    // media query and resize: the media query is the right signal, but some mobile
    // browsers fire it before the viewport dimensions settle, and isMobilePortrait()
    // reads window.innerWidth — so resize is the one that reliably catches up afterwards.
    const checkRotateHint = () => { if (isMobilePortrait()) showRotateHint(); else hideRotateHint(); };
    checkRotateHint();
    window.matchMedia('(orientation: portrait)').addEventListener?.('change', () => setTimeout(checkRotateHint, 60));
    window.addEventListener('resize', checkRotateHint);
    window.addEventListener('orientationchange', () => setTimeout(checkRotateHint, 60));
  }

  els.catDrawerToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    els.catDrawer?.classList.toggle('is-collapsed');
    const collapsed = els.catDrawer?.classList.contains('is-collapsed');
    if (els.catToggleIco) els.catToggleIco.textContent = collapsed ? '›' : '‹';
  });

  // NOTE: `#catNavL1`'s and `#catNav`'s own `.cat-btn` rows are NOT wired here — both
  // elements have their innerHTML fully replaced at runtime (renderClientSidebar and
  // renderLandmarkCategoryNav respectively), so a listener attached to whatever the
  // static index.html placeholder markup contains at boot would be attached to nodes
  // that get thrown away before the visitor can ever click them. Wiring lives with each
  // render call instead (wireClientSidebarButtons / renderLandmarkCategoryNav's own
  // `.addEventListener` loop) so it can never go stale relative to what's on screen.
  els.catBackBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    touch();
    applyCategoryFilter('ALL');
    if (els.catLevel2) els.catLevel2.hidden = true;
    if (els.catLevel1) els.catLevel1.hidden = false;
    updateLegendVisibility();
  });

  [els.areaFilterSel, els.areaFilterSelMobile].forEach((sel) => {
    sel?.addEventListener('change', (e) => { e.stopPropagation(); touch(); setAreaFilter(sel.value); });
    sel?.addEventListener('click', (e) => e.stopPropagation());   // don't let the pano steal the tap
  });
  // A real click listener too, not just the pick() routing above — pick() only fires from
  // a POINTER event on #pano; a keyboard Enter/Space on this (focused, real <button>)
  // fires `click` directly and never touches #pano's capture at all.
  els.tourMapSwitch?.addEventListener('click', (e) => { e.stopPropagation(); switchTourMap(); });
  // Furnished / unfurnished. Wired HERE and not in wireAdmin, which returns early for a
  // client — this is client UI, so wiring it there left the buttons dead for every visitor.
  // POINTER taps do NOT arrive here (see the .tour-variant-btn branch in pick): #pano's
  // capture eats them. This listener exists for the keyboard — Enter/Space on a focused
  // button fires `click` directly and never touches #pano — exactly like .tour-map-switch.
  els.tourVariants?.querySelectorAll('[data-variant]').forEach((b) => {
    b.addEventListener('click', (e) => { e.stopPropagation(); touch(); setTourVariant(b.dataset.variant); });
  });
  els.tourMapHide?.addEventListener('click', (e) => { e.stopPropagation(); toggleTourMapHidden(); });
  els.fsToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
  els.audioToggle?.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
  els.autoPanToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.autoPan = !state.autoPan;
    updateAutoPanToggleUI();
  });

  updateAutoPanToggleUI();
  new ResizeObserver(debounce(onResize, 120)).observe(els.pano);
  if (!state.admin) wireNavScrollHints();   // client drawer only — admin's is hidden entirely (wireAdmin)
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
  // An explicit `category` is AUTHORITATIVE and short-circuits everything below. The icon
  // rules underneath are inference for landmarks that carry no category; letting them also
  // apply to one that does would file it in two places at once — D Mart is `mall`, which
  // infers COMMERCIAL, but the project it was imported from files it under LIFESTYLE.
  if (lm.category) return String(lm.category).toUpperCase() === c;
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

// Per-landmark "featured" flag (the tick/cross in the admin Landmarks list, added
// 2026-09-04). Showing every landmark at once made the default view unreadably
// crowded, so the admin ticks the handful worth showing up-front; the rest stay in
// the project and surface in full the moment a visitor picks their category -- a
// category view is a deliberate, complete list, so nothing is ever unreachable.
// Landmarks saved before the flag existed carry no `featured` key and stay visible
// (hence `!== false`, not a truthiness test).
function isLandmarkDefaultVisible(lm) { return !lm || lm.featured !== false; }
function isLandmarkShown(lm, cat) {
  if (state.admin && state.adminTab === 'landmarks') return true;   // editing -> see everything, incl. the hidden ones being placed
  const c = cat || 'ALL';
  if (c === 'ALL') return isLandmarkDefaultVisible(lm);
  return isLandmarkMatchCategory(lm, c);
}

// The known category names icon/keyword inference can produce (kept in sync with the
// branches inside isLandmarkMatchCategory). Used to find a landmark's own effective
// category by testing each candidate through the SAME matcher everything else uses,
// rather than re-deriving the icon/keyword rules a second time.
const KNOWN_LANDMARK_CATEGORIES = ['CONNECTIVITY', 'HEALTHCARE', 'EDUCATION', 'COMMERCIAL', 'LIFESTYLE', 'TEMPLE'];

// A landmark's own category, whether it was explicitly set (authoritative) or only
// implied by its icon/label (today's admin UI has no Category field, so most landmarks
// only ever get a category this way). Used to group landmarks under a category header —
// e.g. in the admin's built-in LANDMARKS menu row — even for the ones nobody has
// explicitly filed yet.
function effectiveLandmarkCategory(lm) {
  if (lm && lm.category) return String(lm.category).trim();
  for (const c of KNOWN_LANDMARK_CATEGORIES) { if (isLandmarkMatchCategory(lm, c)) return c; }
  return 'UNCATEGORIZED';
}

// Every category currently present across this project's landmarks, in first-seen
// order, each with the landmarks filed under it. This is the ONE place both the
// client's landmark category picker (#catNav) and the admin's built-in LANDMARKS menu
// row read from — so a landmark the admin adds, or a category they rename, shows up in
// both without either needing to be told about the other.
function getLandmarkCategories() {
  const order = [], byName = new Map();
  state.landmarks.forEach((lm) => {
    const name = effectiveLandmarkCategory(lm);
    if (!byName.has(name)) { byName.set(name, []); order.push(name); }
    byName.get(name).push(lm);
  });
  return order.map((name) => ({ name, landmarks: byName.get(name), count: byName.get(name).length }));
}

// Renames a category everywhere at once: every landmark currently filed under `oldName`
// (explicitly or by inference) gets an EXPLICIT `category = newName`, which is what makes
// the rename stick even for landmarks that only ever had an inferred category before.
// Confirmed behaviour: renaming "Education" to "School" moves every landmark that was
// under Education (however it got there) into "School", everywhere the category is used
// (admin Landmarks tab, the client picker, camera framing) — not a cosmetic label swap.
function renameLandmarkCategory(oldName, newName) {
  const clean = String(newName || '').trim();
  if (!clean || clean === oldName) return;
  let changed = false;
  state.landmarks.forEach((lm) => {
    if (effectiveLandmarkCategory(lm) === oldName) { lm.category = clean; changed = true; }
  });
  if (!changed) return;
  rebuildLandmarkDOM();
  refreshLmList();
  renderLandmarks();
  renderLandmarkCategoryNav();
  onLandmarksChanged();
}

// Bounding arc (in state.view.lon's radian convention) of a set of directions,
// found via the largest-empty-gap method so it's correct even when the landmarks
// straddle the ±180° seam. Also returns the actual direction vector at each end
// (not just its lon) so the camera can be framed on that exact landmark, lat
// included, rather than an averaged blend. Returns null for an empty set.
//
// Fit-or-sweep decision: if the arc (plus edge padding) is narrow enough to sit
// inside one comfortable frame, there's nothing to reveal by panning — the camera
// frames the whole group and holds (fits:true, gentle idle sway only). Only when
// the arc genuinely can't fit in a single frame does the camera sweep across it
// (fits:false), and that sweep is sized to the real extent — no artificial minimum
// stretching it wider than the landmarks actually are.
const LANDMARK_EDGE_PAD = 8 * Math.PI / 180;    // padding each side, in both the fit check and the sweep bounds
const LANDMARK_FIT_FOV_CAP = FOV_MAX;           // widest FOV willing to zoom out to in order to fit everyone in one frame — reuses the app's own accepted max (past it, the camera fisheyes hard)
const LANDMARK_FIT_FOV_FLOOR = 55;              // deg — floor so a single/tight-cluster category doesn't zoom in uncomfortably close
const LANDMARK_SWEEP_FOV = 72;                  // deg — fixed viewing FOV used while sweeping across a category that doesn't fit
const LANDMARK_SWAY_HALF = 3.5 * Math.PI / 180; // idle amplitude when a category already fits (gentle sway instead of a hard sweep)
// A category too wide to fit one frame is TOURED, and a tour has a job to do: show every
// landmark in it. Pacing it with the ambient idle-drift rate (AUTOPAN_RATE, ~1.2 deg/s)
// meant a 161-degree arc took 134 seconds to cross one way — about a pixel every 20
// frames, which reads as a frozen camera showing one landmark, not as a sweep. So the
// sweep is timed instead of speed-capped: whatever the arc's width, one pass takes this
// long, which keeps every project's tour equally readable. The gentle sway of a category
// that DOES fit still uses the ambient rate — it's ambience, not a tour.
const LANDMARK_SWEEP_MS = 30000;                // cap: one full left-to-right pass never takes longer than this
const LANDMARK_SWEEP_MIN_RATE = (2.0 * Math.PI / 180) / 1000;  // rad/ms == 2 deg/s, the reference tour's own drift pace

function computeLandmarkPanRange(dirs) {
  if (!dirs.length) return null;
  // Camera-lon, per this function's contract above — every value it returns
  // (minLon/maxLon/sweepMin/sweepMax) is consumed as `state.view.lon`, by the clamp in
  // `updateCamera`, by `animateCameraTo`, and by the idle sweep. It used the stored-lon
  // formula until 2026-09-04, which mirrored every category across lon 0.
  const pts = dirs.map((d) => ({ lon: viewLonFromDir(d), dir: d }));
  let minLon, maxLon, minDir, maxDir;
  if (pts.length === 1) {
    minLon = maxLon = pts[0].lon;
    minDir = maxDir = pts[0].dir;
  } else {
    pts.sort((a, b) => a.lon - b.lon);
    const n = pts.length;
    let maxGap = -1, gapIdx = 0;
    for (let i = 0; i < n; i++) {
      const cur = pts[i].lon;
      const next = i === n - 1 ? pts[0].lon + TAU : pts[i + 1].lon;
      const gap = next - cur;
      if (gap > maxGap) { maxGap = gap; gapIdx = i; }
    }
    // The arc is everything OUTSIDE the largest gap — walk it starting right after
    // the gap, unwrapping each step forward so min/max are directly comparable.
    const startIdx = (gapIdx + 1) % n;
    minLon = pts[startIdx].lon;
    minDir = pts[startIdx].dir;
    let prev = minLon; maxLon = minLon; maxDir = minDir;
    for (let k = 1; k < n; k++) {
      const p = pts[(startIdx + k) % n];
      let v = p.lon;
      while (v < prev) v += TAU;
      maxLon = v;
      maxDir = p.dir;
      prev = v;
    }
  }

  const desiredFov = (maxLon - minLon) * 180 / Math.PI + 2 * (LANDMARK_EDGE_PAD * 180 / Math.PI);
  if (desiredFov <= LANDMARK_FIT_FOV_CAP) {
    return { fits: true, fovDeg: Math.max(LANDMARK_FIT_FOV_FLOOR, Math.min(LANDMARK_FIT_FOV_CAP, desiredFov)), minLon, maxLon, minDir, maxDir };
  }
  return { fits: false, sweepMin: minLon - LANDMARK_EDGE_PAD, sweepMax: maxLon + LANDMARK_EDGE_PAD, minLon, maxLon, minDir, maxDir };
}

// ─── Matching the reference tour's landmark framing ──────────────────────────────
// The project this one is modelled on frames EVERY landmark category at a constant
// horizontal FOV of 110 and simply points somewhere sensible — it never zooms per category
// and never sweeps. Two things follow.
//
// (1) hfov is HORIZONTAL; three.js `camera.fov` is VERTICAL. A single hard-coded vertical
//     number cannot match on more than one screen shape: hfov 110 is vfov 77.5 on a 16:9
//     desktop but 66.8 on a 844x390 landscape phone. So the horizontal value is what's
//     stored, and the vertical is derived from the live aspect ratio.
// (2) their camera angles are hand-authored, so no formula reproduces them exactly.
//     Measured against all five of their categories, aiming at the TIGHTEST CLUSTER of a
//     category's landmarks averages 12.1 deg of error, versus 20.8 for the bounding-arc
//     midpoint (which lands 52 deg out on a category with one far-flung outlier) and 18.7
//     for the plain circular mean. Cluster it is.
const LANDMARK_HFOV = 110;
function vfovFromHfov(hfovDeg) {
  const rect = els.pano ? els.pano.getBoundingClientRect() : null;
  const aspect = (rect && rect.width > 0 && rect.height > 0) ? rect.width / rect.height
    : (three && three.camera.aspect ? three.camera.aspect : 16 / 9);
  const v = 2 * Math.atan(Math.tan(hfovDeg * Math.PI / 360) / aspect) * 180 / Math.PI;
  return Math.max(FOV_MIN, Math.min(FOV_MAX, v));
}
function angDelta(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

// Centre of the widest-populated window: the frame that holds the most of this category's
// landmarks, tie-broken toward the tightest one. An outlier on the far side of the sphere
// is left out of shot rather than dragging the camera to a midpoint that shows neither
// group — which is exactly the judgement a person makes by hand.
function landmarkClusterCentre(dirs, windowDeg) {
  const lons = dirs.map(viewLonFromDir);
  if (lons.length <= 1) return lons[0] || 0;
  const half = windowDeg * Math.PI / 360;
  let best = null;
  for (const seed of lons) {
    for (let k = -1; k <= 1; k++) {
      const centre = seed + k * half;                       // window anchored on, or edged against, each landmark
      const inside = lons.filter((v) => Math.abs(angDelta(v, centre)) <= half + 1e-9);
      if (!inside.length) continue;
      const span = Math.max(...inside.map((v) => Math.abs(angDelta(v, centre))));
      const key = inside.length * 1000 - span * 180 / Math.PI;
      if (!best || key > best.key) best = { key, inside };
    }
  }
  const ref0 = best.inside[0];                              // average the winners, so the aim sits on the group
  return ref0 + best.inside.reduce((t, v) => t + angDelta(v, ref0), 0) / best.inside.length;
}

function meanDirection(dirs) {
  const mean = new THREE.Vector3();
  dirs.forEach((v) => mean.add(v));
  return mean.divideScalar(dirs.length).normalize();
}

// Rebuilds the client's Landmarks category picker (#catNav) from the real data every
// time. It used to be static markup in index.html (a fixed HEALTHCARE/EDUCATION/
// COMMERCIAL/CONNECTIVITY/LIFESTYLE/TEMPLE list, identical for every project, wired
// once at boot in wireViewControls) — a project whose landmarks used any other category
// name simply had no button to reach it. Called from setLandmarks() (boot, file/session
// load) and onLandmarksChanged() (any admin edit), so it can never drift from what
// isLandmarkMatchCategory actually groups things into.
function renderLandmarkCategoryNav() {
  if (!els.catNav) return;
  const cats = getLandmarkCategories();
  let html = '<button class="cat-btn is-active" type="button" data-cat="ALL">ALL LANDMARKS</button>';
  cats.forEach((c) => { html += `<button class="cat-btn" type="button" data-cat="${esc(c.name)}">${esc(c.name.toUpperCase())}</button>`; });
  els.catNav.innerHTML = html;
  els.catNav.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.lastUserTouch = Date.now();
      applyCategoryFilter(btn.dataset.cat);
      collapseClientDrawer();
    });
  });
  // Keep the active highlight correct across a rebuild mid-selection (e.g. a category
  // rename while a visitor... never happens client-side, but admin previews/edits can
  // trigger this while ALL/a category is already selected).
  els.catNav.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.cat === (state.selectedCategory || 'ALL'));
  });
  addKeepMenuToggle(els.catNav, els.catNav.querySelectorAll('.cat-btn').length);
}

// Auto-collapses the drawer to its thin rail (same visual state as tapping the toggle)
// whenever a visitor's selection actually shows them something to look at — a modal, a
// landmark category framed on the pano, a tour room/tour switch, or the full aerial view
// (2026-09-16, on request: the menu was left open and eating screen space over the very
// thing the visitor just chose to see). Deliberately NOT used for pure menu navigation —
// drilling into a folder or hitting BACK — since the visitor hasn't picked real content
// yet and still needs the menu open to do so. `state.admin` guard is a cheap no-op safety
// net: the client drawer is already `display:none` in admin (wireAdmin), so this would be
// visually inert there regardless.
function collapseClientDrawer() {
  if (state.admin || !els.catDrawer) return;
  if (state.keepMenuOpen) return;      // the visitor pinned the menu open — see buildKeepMenuToggle
  els.catDrawer.classList.add('is-collapsed');
  if (els.catToggleIco) els.catToggleIco.textContent = '›';
}
// "Keep open" — offered in every menu level that actually holds a choice (2+ rows), because
// the auto-collapse is only ever annoying when you're comparing several items in a row.
//
// ONE shared preference rather than one per menu: a visitor who pins the menu open in the
// landmark picker means "stop closing on me", not "stop closing in this list only", and a
// per-level setting would leave them re-pinning it at every level. Persisted per browser
// like the other client toggles.
const KEEP_MENU_KEY = 'b91-keep-menu-open';
function setKeepMenuOpen(on) {
  state.keepMenuOpen = !!on;
  try { localStorage.setItem(KEEP_MENU_KEY, state.keepMenuOpen ? '1' : '0'); } catch {}
  syncKeepMenuToggles();
}
// Updates every copy in place. Deliberately NOT a re-render: renderClientSidebar's root
// branch hides #catLevel2, so re-rendering from here would slam the landmark picker shut
// the moment someone toggled this inside it.
function syncKeepMenuToggles() {
  document.querySelectorAll('.cat-keep').forEach((wrap) => {
    const input = wrap.querySelector('.ui-switch-input');
    if (input) input.checked = !!state.keepMenuOpen;
    wrap.title = state.keepMenuOpen ? 'Menu stays open when you pick an item' : 'Menu closes when you pick an item';
  });
}
// A real ON/OFF switch (2026-09-18, replacing a custom checkbox-look button) — the same
// `.ui-switch` markup/CSS the landmark "show by default" row and the menu builder's
// built-in-row toggle already use, on request, rather than a bespoke control.
function buildKeepMenuToggle() {
  const wrap = document.createElement('label');
  wrap.className = 'cat-keep ui-switch';
  wrap.title = state.keepMenuOpen ? 'Menu stays open when you pick an item' : 'Menu closes when you pick an item';
  const input = document.createElement('input');
  input.type = 'checkbox'; input.className = 'ui-switch-input';
  input.checked = !!state.keepMenuOpen;
  // No visible label (2026-09-18, on request) — the accessible name lives on the input
  // instead, and the wrap's `title` covers a sighted hover.
  input.setAttribute('aria-label', 'Keep menu open when you pick an item');
  // stopPropagation matches every other in-menu control (e.g. the landmark category
  // buttons) — without it the click bubbles to the row/backdrop handler that closes menus.
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('change', () => { state.lastUserTouch = Date.now(); setKeepMenuOpen(input.checked); });
  const track = document.createElement('span'); track.className = 'ui-switch-track';
  const thumb = document.createElement('span'); thumb.className = 'ui-switch-thumb';
  track.appendChild(thumb);
  // Order matters: `.ui-switch-input:checked + .ui-switch-track` is an adjacent-sibling
  // selector, so the input must be immediately followed by the track with nothing between.
  wrap.append(input, track);
  return wrap;
}
// Only worth offering where there's more than one thing to pick between.
function addKeepMenuToggle(container, itemCount) {
  if (!container || itemCount <= 1) return;
  container.prepend(buildKeepMenuToggle());
}

// "There's more to scroll" hint (2026-09-16, on request — see the CSS comment on
// .has-more-below for why a bare scrollbar isn't enough). Toggles the fade on whichever
// `.cat-menu-level` wraps this nav, from real scroll metrics: only shown while there is
// GENUINELY more content below AND the visitor hasn't already scrolled to see it, so it
// can never lie by lingering once they're actually at the bottom.
function updateNavScrollHint(nav) {
  if (!nav) return;
  const wrap = nav.closest('.cat-menu-level');
  if (!wrap) return;
  const canScroll = nav.scrollHeight > nav.clientHeight + 2;
  const atBottom = nav.scrollTop + nav.clientHeight >= nav.scrollHeight - 2;
  wrap.classList.toggle('has-more-below', canScroll && !atBottom);
}
// Wired once at boot rather than called from every render site: three different
// functions (renderClientSidebar's two branches, renderLandmarkCategoryNav) replace
// these containers' innerHTML, each with its own early returns for the empty/no-items
// case — hooking every one of them by hand is exactly the kind of thing that quietly
// goes stale the next time a new render path is added. A MutationObserver on each
// container instead reacts to ANY content change automatically, present or future; a
// ResizeObserver alongside it catches the cases content itself doesn't change but the
// available space does (rotating the phone, the drawer's own collapse/expand).
function wireNavScrollHints() {
  ['catNavL1', 'catNav', 'catSubMenuNav'].forEach((id) => {
    const nav = $(id);
    if (!nav) return;
    const check = () => updateNavScrollHint(nav);
    nav.addEventListener('scroll', check, { passive: true });
    new MutationObserver(check).observe(nav, { childList: true, subtree: true, characterData: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(check).observe(nav);
    check();
  });
}

// Opens the drawer straight to the Landmarks category picker — same steps as tapping
// "Landmarks" in the drawer's top-level menu (see wireViewControls' `.cat-btn` handlers),
// factored out so the mobile overflow hint (renderLandmarks' CAP logic) can trigger it too.
function openLandmarksCategoryPicker() {
  els.catDrawer?.classList.remove('is-collapsed');
  if (els.catToggleIco) els.catToggleIco.textContent = '‹';
  if (els.catLevel1) els.catLevel1.hidden = true;
  if (els.catLevel2) els.catLevel2.hidden = false;
  updateLegendVisibility();
  state.autoPan = true;
  applyCategoryFilter('ALL');
}

// A tour actually takes over the viewer, so SOME level of the drawer must always carry an
// explicit way out while one is open — appended to whichever synthetic list is actually
// being shown (see each call site below) rather than duplicated as its own concept.
function withExitTourRow(children) {
  if (!state.tourView) return children;
  return [...children, { id: '__exit_tour__', kind: 'child', contentType: 'exittour', title: '✕ Exit Tour', content: {} }];
}
// The synthetic "folder" listing every TOUR (one row each) — only needed as its own menu
// level when a project has 2+ tours (openClientPanoTour's own anchoring pushes this ahead
// of tourRoomPickerNode, or alone when `anchorRooms:false` or the active tour has only one
// room — see its own comment). Built live from state.tours rather than authored into
// menuConfig.tree.
// renderClientSidebar's submenu click handler falls back to searching a pushed parent's
// own `children` when findNodeInfo can't find a node in the real tree, which is what
// makes a synthetic (non-authored) parent like this work at all.
function virtualTourPickerNode() {
  return {
    id: '__virtualtour_picker__',
    title: 'VIRTUAL TOUR',
    children: withExitTourRow(state.tours.map((t) => ({ id: `virtualtour-${t.id}`, kind: 'child', contentType: 'panotour', title: t.name || 'Untitled tour', content: { tourId: t.id } })))
  };
}
// The per-ROOM analogue, one level deeper: once a SPECIFIC tour is open AND it actually
// has more than one room to choose between, its rooms are browsable straight from the
// drawer exactly like LANDMARKS' categories are (2026-09-11, explicit request — replaces
// the old floating room-strip bar, `#tourBar`/`refreshTourBar`, removed the same day). A
// tour with only ONE room never gets this level pushed at all (see openClientPanoTour) —
// showing a "choice" of one room, highlighted because it's the only one AND the one
// you're already standing in, was reported the same day as pointless clutter ("SWIMMING_
// POOL" highlighted with nothing else to pick, unlike "MODERN VILLA"'s real multi-room
// list) — exactly the same "one thing inside is never a choice" rule `resolveFolderTarget`
// already applies to ordinary authored folders, just applied to rooms too.
function tourRoomPickerNode(tour) {
  return {
    id: '__tour_room_picker__',
    title: tour.name || 'VIRTUAL TOUR',
    children: withExitTourRow(tour.nodes.map((n) => ({ id: `panotourroom-${tour.id}-${n.id}`, kind: 'child', contentType: 'panotourroom', title: n.name || 'Room', content: { tourId: tour.id, nodeId: n.id } }))),
  };
}
function isTourMenuNode(node) {
  return !!node && (node.id === '__tour_room_picker__' || node.id === '__virtualtour_picker__');
}
// `moveCamera:false` re-applies only the highlight/dim styling for the current
// selection — used when the landmark DOM is rebuilt (see rebuildLandmarkDOM), where the
// selection hasn't changed and flying the camera is actively wrong: it stole the client's
// saved WYSIWYG view at boot (setLandmarks -> rebuild, measured at 45 degrees off with the
// FOV forced to 72) and yanked the admin's view away every time a landmark was added,
// deleted or given a render image.
function applyCategoryFilter(cat, { moveCamera = true } = {}) {
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

  if (!moveCamera) return;                 // styling-only refresh — leave the view exactly where it is

  // ALL frames only what's actually on screen -- the featured set (see isLandmarkShown).
  const targetList = state.selectedCategory === 'ALL' ? state.landmarks.filter(isLandmarkDefaultVisible) : matched;

  if (targetList.length > 0 && three) {
    // Aim at the MIDPOINT of each landmark's banner and pin, not at the banner. The banner
    // floats well above its pin (16 deg apart, matching the reference's banner+leader
    // graphic), so aiming at banners alone tilts the camera up into empty sky and pushes
    // the pins off the bottom of the frame. The midpoint is the graphic's centre, which is
    // exactly what the reference's own category cameras point at (their pitches run -0.3
    // to -3.2, i.e. level, not up at the labels).
    const ll = (pos) => {
      if (!pos) return null;
      const lon = pos.lon != null ? pos.lon : (pos.lonDeg != null ? pos.lonDeg : null);
      const lat = pos.lat != null ? pos.lat : (pos.latDeg != null ? pos.latDeg : null);
      return (isFinite(lon) && isFinite(lat)) ? { lon, lat } : null;
    };
    const validDirs = [];
    targetList.forEach((l) => {
      const b = ll(l.banner), h = ll(l.hotspot);
      const a = b || h; if (!a) return;
      const other = (b && h) ? h : a;
      validDirs.push(dirFromLonLat(a.lon, (a.lat + other.lat) / 2));
    });

    // A specific category (not ALL) constrains the view to that category's own arc
    // instead of a free 360° spin (see renderLoop/updateCamera). If everything matched
    // already fits in one frame, the camera frames the group and holds (gentle sway
    // only) — no sweep. Only a category that genuinely can't fit in one frame sweeps,
    // sized to its real leftmost/rightmost extent.
    // Constant framing, like the reference: aim at the category's tightest cluster at a
    // fixed 110 horizontal FOV. No fit-or-sweep any more — that zoomed differently for
    // every category (55 to 117 vertical) and panned across the wide ones, neither of
    // which the reference does.
    if (state.selectedCategory !== 'ALL') {
      const fovDeg = vfovFromHfov(LANDMARK_HFOV);
      const mean = meanDirection(validDirs);
      const targetLat = clampLat(Math.asin(THREE.MathUtils.clamp(mean.y, -1, 1)));
      let targetLon = landmarkClusterCentre(validDirs, LANDMARK_HFOV);

      // The frame is a CONSTANT 110 horizontal (reference parity), so a category wider than
      // that has landmarks outside it no matter where we aim. Those must stay reachable:
      // with only the +-3.5 sway below, the updateCamera clamp locks the view to a 7-degree
      // window and an outlying landmark can never be seen at all (Connectivity spans 136
      // and had 1 of 4 stranded). So a category that doesn't fit SWEEPS its real extent,
      // at the same fixed zoom; one that already fits keeps the gentle sway, since there
      // is nothing to reveal.
      // EVERY category pans across its own landmarks, leftmost to rightmost — the camera
      // centre travels from one end landmark to the other, so each in turn comes to the
      // middle of frame. This deliberately DIVERGES from the reference, which holds a fixed
      // shot and never sweeps: asked for twice, explicitly. The zoom stays at the
      // reference's hfov 110; only the motion differs.
      // Previously this swept only when a category was too wide to fit in one frame, which
      // left 4 of 6 categories with nothing but a 7-degree sway — imperceptible, and read
      // as "the camera isn't panning".
      const arc = computeLandmarkPanRange(validDirs);
      if (arc && arc.maxLon > arc.minLon) {
        const lo = arc.minLon - LANDMARK_EDGE_PAD;
        const hi = arc.maxLon + LANDMARK_EDGE_PAD;
        // Pace: the reference's ~2 deg/s, but never slower than a full pass in
        // LANDMARK_SWEEP_MS, so a wide category doesn't crawl for minutes.
        const width = Math.abs(hi - lo);
        state.landmarkPanRange = { sweepMin: lo, sweepMax: hi,
          radPerMs: Math.max(LANDMARK_SWEEP_MIN_RATE, width / LANDMARK_SWEEP_MS) };
        // Open on the reference-matched framing, then drift; clamped in so the range can't
        // yank it on the first idle frame.
        let t = targetLon;
        const mid = (lo + hi) / 2;
        while (t - mid > Math.PI) t -= TAU;
        while (mid - t > Math.PI) t += TAU;
        targetLon = Math.min(hi, Math.max(lo, t));
      } else {
        state.landmarkPanRange = { sweepMin: targetLon - LANDMARK_SWAY_HALF, sweepMax: targetLon + LANDMARK_SWAY_HALF };
      }
      animateCameraTo(targetLon, targetLat, fovDeg);
      state.autoPanDir = 1;
    } else if (validDirs.length > 0) {
      state.landmarkPanRange = null;
      const mean = meanDirection(validDirs);
      const targetLon = viewLonFromDir(mean);
      const targetLat = clampLat(Math.asin(THREE.MathUtils.clamp(mean.y, -1, 1)));
      animateCameraTo(targetLon, targetLat, 72);
    }
  } else if (state.selectedCategory !== 'ALL') {
    state.landmarkPanRange = null;
    showNotice(`No <strong>${esc(state.selectedCategory)}</strong> landmarks saved in this project yet.`);
  } else {
    state.landmarkPanRange = null;
  }
}

// ─── Background audio ─────────────────────────────────────────────────
// One button (🔊), two sources: an admin-uploaded track when the project has one,
// otherwise the original synthesised ambience — kept so a project that never sets audio
// behaves exactly as it did before this feature existed.
const SITE_AUDIO_VOLUME = 0.35;          // background music, not a foreground track
const AUDIO_MUTED_KEY = 'b91-audio-muted';
function audioMutedPref() { try { return localStorage.getItem(AUDIO_MUTED_KEY) === '1'; } catch { return false; } }
function setAudioMutedPref(m) { try { localStorage.setItem(AUDIO_MUTED_KEY, m ? '1' : '0'); } catch {} }

function updateAudioToggleUI() {
  if (!els.audioToggle) return;
  // The button holds an inline SVG whose on/off halves swap via the is-active class
  // set below - do NOT write textContent here: that replaces the whole icon with a
  // character and loses it (which is exactly what happened on the first pass).
  els.audioToggle.classList.toggle('is-active', state.audioPlaying);
  els.audioToggle.title = hasSiteAudio()
    ? (state.audioPlaying ? 'Mute the background music' : 'Play the background music')
    : 'Toggle Sound';
}

// Every current browser refuses to start audible playback before the visitor has
// interacted with the page, so play() rejects on load through no fault of ours. That's a
// state to recover from, not an error: arm a one-shot listener and start on the first real
// gesture — the earliest instant the browser will allow it.
let audioGestureArmed = false;
function armAudioGesture() {
  if (audioGestureArmed) return;
  audioGestureArmed = true;
  const go = () => {
    document.removeEventListener('pointerdown', go, true);
    document.removeEventListener('keydown', go, true);
    audioGestureArmed = false;
    if (!audioMutedPref()) startSiteAudio(false);
  };
  document.addEventListener('pointerdown', go, true);
  document.addEventListener('keydown', go, true);
}

function startSiteAudio(explicit) {
  const el = els.siteAudio;
  if (!el || !hasSiteAudio()) return;
  const src = siteAudioSrc();
  if (src && el.dataset.src !== src) { el.src = src; el.dataset.src = src; }   // only reload when it actually changed
  el.loop = true;
  el.volume = SITE_AUDIO_VOLUME;
  // Optimistic, deliberately. `el.paused` flips synchronously and the visitor's intent is
  // already known, but play()'s promise only settles once playback has actually BEGUN.
  // Updating state there left two bugs (both caught in testing): the button kept showing
  // the old glyph for as long as the media took to start, and state.audioPlaying stayed
  // false — so an immediate second press re-started the track instead of muting it.
  // Reflect the intent now; walk it back only if playback is genuinely refused.
  state.audioPlaying = true;
  updateAudioToggleUI();
  el.play().catch(() => {
    state.audioPlaying = false;
    updateAudioToggleUI();
    if (!explicit) armAudioGesture();      // an explicit press already WAS a gesture; if that failed, arming again won't help
  });
}

// Called after the alignment lands (boot) and whenever the admin changes the track.
function applySiteAudio() {
  updateAudioAdminUI();
  const el = els.siteAudio;
  if (!el) return;
  if (!hasSiteAudio()) {
    try { el.pause(); } catch {}
    el.removeAttribute('src'); delete el.dataset.src;
    state.audioPlaying = false; updateAudioToggleUI();
    return;
  }
  // Admin never gets music started at them mid-edit — the 🔊 button previews it on demand.
  if (state.admin) { updateAudioToggleUI(); return; }
  if (audioMutedPref()) { state.audioPlaying = false; updateAudioToggleUI(); return; }
  startSiteAudio(false);
}

function toggleAudio() {
  if (hasSiteAudio()) {
    const el = els.siteAudio;
    if (!el) return;
    if (state.audioPlaying) {
      try { el.pause(); } catch {}
      state.audioPlaying = false;
      setAudioMutedPref(true);            // a visitor who muted stays muted on their next visit
      updateAudioToggleUI();
    } else {
      // Record the CHOICE here, synchronously, not in play()'s .then(): `paused` flips
      // immediately but the promise only settles once playback actually begins, so writing
      // the preference there raced (caught in testing — an unmute read back as still
      // muted). What the visitor asked for shouldn't depend on how fast the media loads.
      setAudioMutedPref(false);
      startSiteAudio(true);
    }
    return;
  }
  // No track configured — the pre-existing synthesised ambience, unchanged.
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
  updateAudioToggleUI();
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
  // Plots outside the active area band are faded back (isAreaDimmed) — hovering one must not
  // pop its number/info card or light it up, or the dimmed plots read as still selectable.
  // Client only: the admin keeps hover so they can still inspect any plot while editing.
  let id = rayHit(e);
  if (id && !state.admin && isAreaDimmed(id)) id = null;
  if (id !== state.hoverId) { clearHover(); state.hoverId = id; if (id) setEmphasis(id, true); requestRender(); }
  if (id) showTooltip(id, e); else hideTooltip();
}
function clearHover() { if (state.hoverId && state.hoverId !== state.selectedId) setEmphasis(state.hoverId, false); state.hoverId = null; }
function pick(e) {
  // Amenity pins are DOM markers, but #pano grabs pointer capture on pointerdown, so a
  // real tap's `click` lands on #pano — the marker's own click never fires. Hit-test the
  // marker here (it takes precedence over any plot beneath it) so tapping a pin opens it.
  const hitEl = document.elementFromPoint(e.clientX, e.clientY);
  // In a tour the plot map is hidden, so there is nothing to raycast — but the nav
  // hotspots are DOM and lose their own click to #pano's capture (same trap as amenity
  // pins), so they are hit-tested here instead. Admin drags are handled by the element's
  // own pointerdown, which stops propagation before capture happens.
  if (state.tourView) {
    // Same trap, for the minimap's own buttons (2026-09-18) — checked before the dots since
    // they sit visually above them, in the map's corner. Hide is checked first of all: while
    // the map is dismissed it's the ONLY thing on screen here, and it must stay reachable.
    // The furnished/unfurnished toggle is the same trap (2026-09-21): it lives inside #pano,
    // so a real tap's `click` is eaten by the capture above and its own listener never ran —
    // the button looked completely dead to every visitor. Checked first; it owns its corner of
    // the screen and overlaps nothing else.
    const vbtn = hitEl?.closest?.('.tour-variant-btn');
    if (vbtn) { setTourVariant(vbtn.dataset.variant); return; }
    const hideBtn = hitEl?.closest?.('.tour-map-hide');
    if (hideBtn) { toggleTourMapHidden(); return; }
    const sw = hitEl?.closest?.('.tour-map-switch');
    if (sw) { switchTourMap(); return; }
    // The minimap's room dots are the same trap again — they sit inside #pano, so their
    // own click is eaten by its pointer capture. Checked BEFORE .tour-hs because the
    // minimap is an overlay drawn on top of everything else in the scene.
    const dot = hitEl?.closest?.('.tour-map-dot');
    if (dot) { const nid = dot.dataset.nodeId; if (nid) tourGoTo(nid); return; }
    const hs = hitEl?.closest?.('.tour-hs');
    if (hs) { const i = tourHsDom.findIndex((h) => h.el === hs); if (i >= 0) hs.click(); }
    return;
  }
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
  els.pano.style.cursor = on ? 'pointer' : '';
  // A plot filtered out by the active area band stays faded even under the cursor — the
  // whole point of the band is that everything outside it recedes, and hover-brightening it
  // (then resetting it to full opacity on the way out) was un-dimming plots one by one as
  // the pointer crossed the layout.
  if (isAreaDimmed(id)) { paintPlot(p, id, p.status); return; }
  p.fill.material.opacity = on ? Math.min(1, state.overlayOpacity + 0.3) : state.overlayOpacity;
  p.line.material.opacity = on ? 1 : 0.95;
}

// ─── Data join → colour + legend ──────────────────────────────────────────────
// ─── Area filters (admin-defined size bands) ─────────────────────────────────
// Units offered to the admin. This is a LABEL ONLY — see plotAreaValue.
const AREA_UNITS = ['sq.ft', 'sq.m', 'sq.yd', 'gaj', 'acre', 'hectare', 'cent', 'marla'];
const DEFAULT_FILTER_COLORS = ['#4f9dfb', '#9b6cf6', '#28b7a6', '#f08a3c', '#e05b8a', '#7cc44a'];
// A plot's area as a NUMBER, or null when it can't be read.
//
// The catch this whole feature has to live with: `size` is free text ("1200 sq.ft") — the
// number and its unit are one string, and always have been. So an explicit numeric `area`
// column wins where a project has one, and otherwise the leading number is parsed out of
// `size`. That also means we can NOT convert between units (we'd be guessing each row's
// source unit), which is why state.area.unit is only ever a display label and the admin's
// min/max are read in whatever unit the data already uses.
function plotAreaValue(row) {
  if (!row) return null;
  const explicit = parseFloat(String(row.area ?? '').replace(/,/g, ''));
  if (isFinite(explicit)) return explicit;
  const m = String(row.size ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
const activeAreaFilter = () => state.area.filters.find((f) => f.id === state.areaFilterId) || null;
function plotMatchesAreaFilter(row, f) {
  if (!f) return true;
  const a = plotAreaValue(row);
  if (a == null) return false;                      // unreadable area can't satisfy a range
  return (f.min == null || a >= f.min) && (f.max == null || a <= f.max);
}
// How many plots this filter would actually match — drives the admin's per-filter readout,
// so a band that silently matches nothing is visible at authoring time rather than being
// discovered on the live site.
function areaFilterMatchCount(f) {
  let n = 0;
  state.geom.forEach((g) => { if (plotMatchesAreaFilter(state.rows.get(g.id), f)) n++; });
  return n;
}
// Plots whose area couldn't be read at all — the other half of that readout.
function areaReadableCount() {
  let n = 0;
  state.geom.forEach((g) => { if (plotAreaValue(state.rows.get(g.id)) != null) n++; });
  return n;
}
const hexToInt = (s) => { const n = parseInt(String(s || '').replace('#', ''), 16); return isFinite(n) ? n : 0x888888; };

const AREA_DIM = 0.22;                                  // how far a plot outside the active band fades back
const isAreaDimmed = (id) => { const f = activeAreaFilter(); return !!f && !plotMatchesAreaFilter(state.rows.get(id), f); };
// A plot's RESTING appearance right now: its status colour normally, the active band's
// colour when it falls in that band, faded when a band is active and it doesn't.
//
// Every styling path goes through this — initial paint, hover-off and deselect — because
// they each used to re-derive "normal" as `state.overlayOpacity` + the status colour, which
// meant simply moving the cursor across a filtered-out plot permanently un-dimmed it
// (reported 2026-09-18). Anything that restores a plot's look must ask here, not assume.
function plotBaseStyle(id, status) {
  const st = STATUS_META[status] ? status : 'unknown';
  const f = activeAreaFilter();
  if (!f) return { color: STATUS_META[st].color, fill: state.overlayOpacity, line: 0.95 };
  return plotMatchesAreaFilter(state.rows.get(id), f)
    ? { color: hexToInt(f.color), fill: state.overlayOpacity, line: 0.95 }
    : { color: STATUS_META[st].color, fill: state.overlayOpacity * AREA_DIM, line: AREA_DIM };
}
function paintPlot(p, id, status) {
  const s = plotBaseStyle(id, status);
  p.fill.material.color.setHex(s.color); p.fill.material.opacity = s.fill;
  p.line.material.color.setHex(s.color); p.line.material.opacity = s.line;
}
function colorPlots() {
  // While a band is picked, matching plots wear ITS colour and everything else fades back —
  // non-matching plots are dimmed rather than hidden so the layout still reads as a whole
  // and you can see where the matches sit within it. Status filtering still applies on top
  // (a plot must pass both), since "Type 1 AND available" is the real question being asked.
  state.plots.forEach((p, id) => {
    const row = state.rows.get(id), status = STATUS_META[row?.status] ? row.status : 'unknown';
    p.status = status; p.group.visible = state.activeFilters.has(status);
    if (id === state.selectedId) applySelectStyle(p, status);
    else paintPlot(p, id, status);
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
    // 'unknown' is still a real internal status — a plot with no status data keeps
    // rendering in grey and stays visible — but it gets no legend chip (2026-09-18, on
    // request): it's an artefact of missing data rather than something a visitor chooses
    // between, and the area Filter dropdown now occupies that slot.
    if (s === 'unknown') return;
    const chip = document.createElement('button');
    chip.className = 'chip'; chip.type = 'button'; chip.dataset.status = s;
    chip.setAttribute('aria-pressed', String(state.activeFilters.has(s)));
    chip.innerHTML = `<span class="dot"></span>${STATUS_META[s].label} <span class="count">${counts[s]}</span>`;
    chip.addEventListener('click', () => toggleFilter(s));
    els.legend.appendChild(chip);
  });
  // Adopt the area dropdown as the row's last item, so it sits right after Sold instead of
  // being pushed to the far edge of the header. MOVED, not recreated — appendChild relocates
  // the live element, keeping its change listener and current selection intact, which also
  // means it has to be re-adopted here on every legend rebuild (innerHTML='' above drops it).
  if (els.areaFilterSel) els.legend.appendChild(els.areaFilterSel);
  // Landscape's compact stand-in for the header legend (hidden there, see styles.css) —
  // keep all three counts in sync the same way the header chips just were.
  syncZoomStatusButtons(counts);
}

// The Available/Reserved/Sold legend describes PLOT status and only makes sense while
// looking at the actual plot map — not while browsing LANDMARKS (a picker over the same
// pano, but the visitor's attention is on landmark categories, not plot filtering) and
// not inside a VIRTUAL TOUR (a different pano entirely, with no plots to filter). Hidden
// there, shown again back on the base aerial view. Checked structurally (tour state +
// which drawer level is on screen) rather than a separately-tracked flag, so it can never
// drift out of sync with what the drawer is actually showing.
function isAerialSectionActive() {
  return !state.tourView
    && (!els.catLevel2 || els.catLevel2.hidden !== false)
    && (state.menuNavStack || []).length === 0;
}
function updateLegendVisibility() {
  const show = isAerialSectionActive();
  els.legend?.classList.toggle('is-hidden', !show);
  els.zoomStatusGroup?.classList.toggle('is-hidden', !show);
  // The rest of the plot-map control column (# / landmarks / amenities / zoom / recenter) is
  // just as meaningless inside a tour or a sub-section — and in a tour it sat on top of the
  // minimap's own hide/switch buttons. Client only: the admin keeps these tools throughout.
  document.querySelector('.zoom-controls')?.classList.toggle('is-hidden', !show && !state.admin);
  // The area dropdown follows the legend exactly: it only means anything on the plot map,
  // so it goes away inside a tour / the landmark picker like every other plot-map control.
  const hasFilters = (state.area.filters || []).length > 0;
  [els.areaFilterSel, els.areaFilterSelMobile].forEach((s) => {
    if (!s) return;
    s.hidden = !hasFilters;
    s.classList.toggle('is-hidden', !show);
  });
}
// Text colour that stays readable on an admin-picked band colour (perceived-luminance test).
function areaBandTextColor(hex) {
  const n = hexToInt(hex), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff';
}
// The closed dropdown wears the picked band's colour too, so what's selected reads the same
// as the plots it highlights on the layout. "All sizes" (no band) goes back to the stylesheet.
function tintAreaSelect(sel) {
  const f = (state.area.filters || []).find((x) => x.id === sel.value);
  sel.style.backgroundColor = f ? f.color : '';
  sel.style.color = f ? areaBandTextColor(f.color) : '';
}
// Both dropdowns are built from one list so they can't drift — same reasoning as
// syncZoomStatusButtons for the status pills.
function renderAreaFilterUI() {
  const filters = state.area.filters || [];
  [els.areaFilterSel, els.areaFilterSelMobile].forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = '';
    const all = document.createElement('option'); all.value = ''; all.textContent = 'Filter: All sizes';
    sel.appendChild(all);
    filters.forEach((f) => {
      const o = document.createElement('option');
      o.value = f.id;
      const range = f.min != null && f.max != null ? `${f.min}–${f.max}`
        : f.min != null ? `${f.min}+` : f.max != null ? `up to ${f.max}` : 'any';
      o.textContent = `${f.name} (${range} ${state.area.unit})`;
      // Same colour the admin gave the band, i.e. the one its plots wear on the layout.
      // Native <option> backgrounds are honoured by desktop + Android Chrome/Edge; iOS Safari
      // draws its own picker and ignores them (the closed control is tinted regardless).
      o.style.backgroundColor = f.color; o.style.color = areaBandTextColor(f.color);
      sel.appendChild(o);
    });
    sel.value = state.areaFilterId || '';
    tintAreaSelect(sel);
  });
  updateLegendVisibility();
}
// ── Admin: project area unit ──
// The unit is declared once for the whole project (it sits with Plot Data, since it
// describes the data rather than the filters), and every plot's area is read in it.
// Changing it rewrites each plot's free-text Area so the stored data actually says what
// the project claims — otherwise "1200 sq.ft" rows would sit under a project labelled
// sq.m and the client would show a unit the data contradicts.
//
// The NUMBER is preserved verbatim: this normalises the label, it does NOT convert
// 1200 sq.ft into 111.48 sq.m. Rewriting figures the admin typed is a much bigger,
// harder-to-undo action than relabelling, and a project's plots are realistically entered
// in one unit already — so switching the unit is "I mis-stated which unit these are in",
// not "convert my measurements".
function applyAreaUnitToPlots(unit) {
  const relabel = (s) => {
    const m = String(s ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
    return m ? `${m[0]} ${unit}` : (s ?? '');     // blank / unparseable areas are left alone
  };
  state.rows.forEach((r) => { if (r && r.size) r.size = relabel(r.size); });
  // While the tracer is open (which it always is — this control lives inside it) its own
  // copy of each plot is the one on screen, so it has to be rewritten too or the edit
  // would appear to do nothing and then be undone by the next commit.
  if (trace.open && trace.plots.length) { trace.plots.forEach((p) => { if (p.size) p.size = relabel(p.size); }); refreshTraceList(); }
  applyData();
}
function setAreaUnit(unit) {
  const prev = state.area.unit;
  state.area.unit = unit || 'sq.ft';
  if (prev !== state.area.unit) applyAreaUnitToPlots(state.area.unit);
  refreshAreaAdminUI(); renderAreaFilterUI(); onAlignmentChanged();
}

// ── Admin: area band editor ──
function addAreaFilter() {
  const n = state.area.filters.length;
  state.area.filters.push({ id: `af${Date.now().toString(36)}${n}`, name: `Type ${n + 1}`, min: null, max: null,
    color: DEFAULT_FILTER_COLORS[n % DEFAULT_FILTER_COLORS.length] });
  refreshAreaAdminUI(); renderAreaFilterUI(); onAlignmentChanged();
}
function deleteAreaFilter(id) {
  state.area.filters = state.area.filters.filter((f) => f.id !== id);
  if (state.areaFilterId === id) setAreaFilter(null);
  refreshAreaAdminUI(); renderAreaFilterUI(); onAlignmentChanged();
}
function refreshAreaAdminUI() {
  if (!els.axAreaList) return;
  // The unit picker lives in the Plot Data section, not this panel — populated here anyway
  // since this is the one refresh both share.
  if (els.axAreaUnit) {
    if (!els.axAreaUnit.options.length) {
      AREA_UNITS.forEach((u) => { const o = document.createElement('option'); o.value = u; o.textContent = u; els.axAreaUnit.appendChild(o); });
    }
    els.axAreaUnit.value = state.area.unit || 'sq.ft';
  }
  // The honest readout. A band matching nothing looks identical to a band configured
  // wrongly, and area is parsed out of free text (see plotAreaValue), so say plainly how
  // many plots actually yielded a number.
  if (els.axAreaNote) {
    const total = state.geom.length, ok = areaReadableCount();
    els.axAreaNote.textContent = total
      ? `Area readable on ${ok} of ${total} plots${ok < total ? ' — the rest have no number in their Area field.' : '.'}`
      : 'No plots yet — import a layout first.';
    els.axAreaNote.className = 'ax-area-note' + (total && ok < total ? ' is-warn' : '');
  }

  els.axAreaList.innerHTML = '';
  state.area.filters.forEach((f) => {
    const row = document.createElement('div'); row.className = 'ax-area-row';
    const name = document.createElement('input'); name.className = 'ax-area-name'; name.value = f.name; name.title = 'Filter name';
    name.addEventListener('input', () => { f.name = name.value; renderAreaFilterUI(); onAlignmentChanged(); });
    const swatch = document.createElement('input'); swatch.type = 'color'; swatch.className = 'ax-area-color'; swatch.value = f.color; swatch.title = 'Highlight colour';
    swatch.addEventListener('input', () => { f.color = swatch.value; if (state.areaFilterId === f.id) { colorPlots(); requestRender(true); } onAlignmentChanged(); });
    const del = document.createElement('button'); del.className = 'ax-lm-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Delete filter';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteAreaFilter(f.id); });
    row.append(swatch, name, del);

    const range = document.createElement('div'); range.className = 'ax-area-range';
    const mk = (key, ph) => {
      const i = document.createElement('input');
      i.type = 'number'; i.className = 'ax-area-num'; i.placeholder = ph; i.inputMode = 'decimal';
      i.value = f[key] == null ? '' : String(f[key]);
      i.addEventListener('input', () => {
        // Blank stays null ("open-ended"), never 0 — otherwise "up to 1200" silently
        // becomes "exactly 0 to 1200" and matches almost nothing.
        f[key] = i.value.trim() === '' ? null : (isFinite(+i.value) ? +i.value : null);
        if (state.areaFilterId === f.id) { colorPlots(); requestRender(true); }
        updateAreaCount(); renderAreaFilterUI(); onAlignmentChanged();
      });
      return i;
    };
    const count = document.createElement('span'); count.className = 'ax-area-count';
    const updateAreaCount = () => { count.textContent = `${areaFilterMatchCount(f)} plots`; };
    updateAreaCount();
    range.append(mk('min', 'min'), document.createTextNode('–'), mk('max', 'max'),
      Object.assign(document.createElement('span'), { className: 'ax-area-unit', textContent: state.area.unit }), count);

    const wrap = document.createElement('div'); wrap.className = 'ax-area-item';
    wrap.append(row, range);
    els.axAreaList.appendChild(wrap);
  });
}
function setAreaFilter(id) {
  state.areaFilterId = id || null;
  [els.areaFilterSel, els.areaFilterSelMobile].forEach((s) => { if (s) { s.value = state.areaFilterId || ''; tintAreaSelect(s); } });
  colorPlots(); requestRender(true);
}

// The landscape status chips mirror the header legend's state; kept in one place so the
// two can't drift (counts come from renderLegend, pressed-state from toggleFilter).
function zoomStatusButtons() {
  return [els.zoomAvailableBtn, els.zoomReservedBtn, els.zoomSoldBtn].filter(Boolean);
}
function syncZoomStatusButtons(counts) {
  for (const btn of zoomStatusButtons()) {
    const s = btn.dataset.status;
    if (counts) { const c = btn.querySelector('.count'); if (c) c.textContent = counts[s] || 0; }
    btn.setAttribute('aria-pressed', String(state.activeFilters.has(s)));
  }
}
function toggleFilter(status) {
  state.activeFilters.has(status) ? state.activeFilters.delete(status) : state.activeFilters.add(status);
  if (state.activeFilters.size === 0) STATUS_ORDER.forEach((s) => state.activeFilters.add(s));
  els.legend.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(state.activeFilters.has(c.dataset.status))));
  syncZoomStatusButtons();
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
// Deselecting returns a plot to its resting look — which, with an area band active, means
// the band's colour or the faded state, NOT an unconditional status colour at full opacity.
function restorePlotStyle(id) {
  const p = state.plots.get(id); if (!p) return;
  paintPlot(p, id, p.status || 'unknown');
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
  noteIfExternal(rawUrl, mediaTypeName.toLowerCase()); // shared by plot tours/videos AND amenity tours — see openModal's callers

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
// Portrait phones are GATED, not nudged: the content stays hidden behind this animated
// screen until the device is actually turned. So there's no dismiss — no timer, no tap to
// close — because either of those would drop the visitor into the squeezed portrait layout
// this exists to keep them out of. The only way past it is rotating (checkRotateHint in
// wireViewControls, driven by the orientation media query + a resize fallback).
let rotateHintTimer = null;
function showRotateHint() {
  if (!els.rotateHint || !els.rotateHint.hidden) return;
  clearTimeout(rotateHintTimer);
  els.rotateHint.classList.remove('is-leaving');
  els.rotateHint.hidden = false;
}
function hideRotateHint() {
  if (!els.rotateHint || els.rotateHint.hidden) return;
  clearTimeout(rotateHintTimer);
  els.rotateHint.classList.add('is-leaving');
  // Let the fade finish before actually removing it from layout.
  rotateHintTimer = setTimeout(() => {
    els.rotateHint.hidden = true;
    els.rotateHint.classList.remove('is-leaving');
  }, 280);
}

// `persist:true` skips the auto-hide timeout — for a message that needs to keep updating
// (a live progress readout) rather than vanish on its own fixed schedule regardless of
// whether the thing it's reporting on is actually done yet. The caller is responsible for
// eventually showing a normal (non-persist) notice to let it auto-hide again.
function showNotice(msg, { persist = false } = {}) {
  els.notice.innerHTML = `<strong>Heads up:</strong> ${msg}`;
  els.notice.hidden = false;
  clearTimeout(showNotice._t);
  if (!persist) showNotice._t = setTimeout(() => { els.notice.hidden = true; }, 9000);
}

// ─── Alignment: load / save / admin UI ────────────────────────────────────────
// An alignment = the overlay transform PLUS the camera view, so the client
// reproduces exactly what the admin set up (WYSIWYG) instead of re-framing.
function getMenuTree() {
  state.menuConfig = state.menuConfig || {};
  if (!(Array.isArray(state.menuConfig.tree) && state.menuConfig.tree.length > 0)) {
    state.menuConfig.tree = migrateLegacyMenuConfig(state.menuConfig);
  }
  return ensureBuiltinNodes();
}

// AERIAL VIEW and LANDMARKS have been, in order: hardcoded client rows (pre-2026-09-08,
// every project carried them with no way to turn off) → ordinary authored nodes an admin
// had to add by hand (a fresh project silently lost them) → a `menuConfig.builtins` side
// block, fixed always-first, draggable/deletable by nothing (2026-09-09). That third
// version protected them but couldn't be reordered relative to authored items at all —
// reported the same day: "even landmark and aerial view should be movable... whoever is
// on top of the menu will be default even in presence of landmark and aerial view."
// **Current design: they're ordinary tree nodes, `builtin: 'aerial'|'landmarks'` marking
// which one, living wherever the admin has dragged them** — so they use every existing
// node mechanism for free (drag-reorder via the existing dragstart/dragover/drop handlers
// keyed on `data-node-id`, rename via the existing double-click-to-rename on
// `.tree-title-text[data-node-id]`, position via plain array order) instead of needing
// any of their own. Only two things are still special-cased: an `enabled` flag (the
// ON/OFF switch — content that would need a link/upload has no such flag, but these two
// have no content to configure, so "off" is a real, meaningful state) and NO delete
// button (self-healing instead — see ensureBuiltinNodes).
function builtinNodeExists(list, key) {
  for (const n of list) {
    if (n.builtin === key) return true;
    if (n.kind === 'parent' && Array.isArray(n.children) && builtinNodeExists(n.children, key)) return true;
  }
  return false;
}
// Guarantees both builtin nodes exist SOMEWHERE in the tree, inserting a default at the
// top exactly once per project if either is missing — which covers a brand-new project,
// an older project saved under the previous `menuConfig.builtins` design (migrated using
// its saved enabled/title so nothing resets), AND the edge case where a builtin node was
// deleted as a side effect of deleting the folder it had been dragged into: rather than
// guard every deletion path against that, it's simply allowed to happen and self-heals
// back in on the next render. Idempotent — `builtinNodeExists` short-circuits once both
// are present, so this is cheap to call from `getMenuTree()` on every access.
// `builtin` key -> { contentType, defaultTitle }. The key and the contentType differ for
// 'tour': the content type 'tour' is already taken (an EXTERNAL 3DVista/Kuula iframe), so
// this built-in's own content type is 'virtualtour' — auto-discovers whichever tours
// exist in state.tours, as opposed to an authored 'panotour' item pointing at one by id.
// `menuimage` (2026-09-21, on request) is the odd one out: every other builtin is a ROW the
// visitor taps, this one DRAWS its uploaded image straight into the menu and is not clickable
// at all (asked for to sit a QR code under CONTACT US). It reuses the builtin machinery for
// everything else — drag to reorder, ON/OFF switch, rename, self-heal — and because it is an
// ordinary `kind: 'child'` node with `content.fileName`/`fileBlob`, saving, export, the
// offline precache and the bundle all pick its image up with no special casing.
const BUILTIN_DEFS = {
  aerial: { contentType: 'aerial', title: 'AERIAL VIEW' },
  landmarks: { contentType: 'landmarks', title: 'LANDMARKS' },
  tour: { contentType: 'virtualtour', title: 'VIRTUAL TOUR' },
  menuimage: { contentType: 'menuimage', title: 'MENU IMAGE', atEnd: true }
};
// Does this node draw itself into the menu instead of being a tappable row?
const isMenuImageNode = (n) => !!n && n.contentType === 'menuimage';
const menuImageSrc = (n) => {
  const c = (n && n.content) || {};
  if (c.fileBlob) { if (!c._url) c._url = URL.createObjectURL(c.fileBlob); return c._url; }
  return c.fileName ? assetUrl(c.fileName) : '';   // unversioned, same as the contact-card photo
};
function ensureBuiltinNodes() {
  const tree = state.menuConfig.tree;
  const legacy = state.menuConfig.builtins || {};
  Object.keys(BUILTIN_DEFS).forEach((key, i) => {
    if (builtinNodeExists(tree, key)) return;
    const def = BUILTIN_DEFS[key];
    const legacyEntry = legacy[key] || {};
    // The image belongs at the END by default — it was asked for as the last thing under
    // CONTACT US. The admin can still drag it anywhere, like any other builtin.
    tree.splice(def.atEnd ? tree.length : i, 0, {
      id: `builtin-${key}`,
      kind: 'child',
      contentType: def.contentType,
      title: (legacyEntry.title || '').toString().trim() || def.title,
      builtin: key,
      enabled: legacyEntry.enabled !== false,
      content: { url: '', fileName: '' }
    });
  });
  return tree;
}

function migrateLegacyMenuConfig(mc) {
  if (!mc) return [];
  if (Array.isArray(mc.tree) && mc.tree.length > 0) return mc.tree;

  const tree = [];
  const customSections = Array.isArray(mc.customSections) ? mc.customSections : [];

  if (customSections.length > 0) {
    customSections.forEach((sec, sIdx) => {
      if (!sec || sec.enabled === false) return;
      const type = sec.type;
      const title = (sec.title || 'Section').trim();

      if (type === 'contact_us') {
        tree.push({
          id: sec.id || `node_contact_${Date.now()}`,
          title: title || 'CONTACT US',
          kind: 'contact',
          contact: {
            title: sec.titleVal || sec.title || 'Anandam Eleganza - Premium Villa Plots',
            about: sec.about || '',
            phone: sec.phone || '',
            email: sec.email || '',
            image: sec.image || '',
            imageName: sec.imageName || '',
            imageBlob: sec.imageBlob || null
          }
        });
      } else if (type === 'gallery') {
        tree.push({
          id: sec.id || `node_gallery_${Date.now()}_${sIdx}`,
          title: title || 'GALLERY',
          kind: 'child',
          contentType: 'gallery',
          content: {
            images: Array.isArray(sec.images) ? sec.images.map(img => ({ name: img.name, url: img.url, blob: img.blob })) : []
          }
        });
      } else {
        let cType = 'video';
        if (type === 'virtual_tour') cType = 'tour';
        else if (type === 'brochure') cType = 'pdf';

        const groups = Array.isArray(sec.groups) ? sec.groups : [];
        const totalItems = groups.reduce((acc, g) => acc + (Array.isArray(g.items) ? g.items.length : 0), 0);

        // Case B: Exactly 1 group with exactly 1 item -> collapse to single ChildNode
        if (groups.length === 1 && totalItems === 1) {
          const item = (groups[0].items && groups[0].items[0]) || {};
          tree.push({
            id: sec.id || `node_item_${Date.now()}_${sIdx}`,
            title: title || item.name || 'Item',
            kind: 'child',
            contentType: cType,
            content: {
              url: item.url || item.videoUrl || item.pdfUrl || '',
              fileName: item.fileName || item.videoName || item.pdfName || '',
              fileBlob: item.fileBlob || item.videoBlob || item.pdfBlob || null
            }
          });
        } else if (groups.length > 0) {
          // Case A: Multi-group or multi-item -> preserve full group layer: Parent(Section) -> Parent(Group) -> Child(Item)
          const sectionChildren = [];
          
          if (groups.length === 1) {
            // Single group with multiple items: Section -> Items
            const grp = groups[0];
            (grp.items || []).forEach((item, iIdx) => {
              sectionChildren.push({
                id: item.id || `node_item_${Date.now()}_${sIdx}_${iIdx}`,
                title: item.name || item.title || `Item ${iIdx + 1}`,
                kind: 'child',
                contentType: cType,
                content: {
                  url: item.url || item.videoUrl || item.pdfUrl || '',
                  fileName: item.fileName || item.videoName || item.pdfName || '',
                  fileBlob: item.fileBlob || item.videoBlob || item.pdfBlob || null
                }
              });
            });
          } else {
            // Multiple groups: Section -> Group -> Items
            groups.forEach((grp, gIdx) => {
              const grpItems = Array.isArray(grp.items) ? grp.items : [];
              const groupChildren = grpItems.map((item, iIdx) => ({
                id: item.id || `node_subitem_${Date.now()}_${sIdx}_${gIdx}_${iIdx}`,
                title: item.name || item.title || `Item ${iIdx + 1}`,
                kind: 'child',
                contentType: cType,
                content: {
                  url: item.url || item.videoUrl || item.pdfUrl || '',
                  fileName: item.fileName || item.videoName || item.pdfName || '',
                  fileBlob: item.fileBlob || item.videoBlob || item.pdfBlob || null
                }
              }));
              sectionChildren.push({
                id: grp.id || `node_grp_${Date.now()}_${sIdx}_${gIdx}`,
                title: (grp.title || `Sub-Group ${gIdx + 1}`).trim(),
                kind: 'parent',
                children: groupChildren
              });
            });
          }

          tree.push({
            id: sec.id || `node_sec_${Date.now()}_${sIdx}`,
            title: title || 'CATEGORY',
            kind: 'parent',
            children: sectionChildren
          });
        }
      }
    });
  }

  // Check top-level legacy keys if customSections was empty
  if (tree.length === 0 && mc.contact_us && mc.contact_us.enabled) {
    tree.push({
      id: `node_contact_${Date.now()}`,
      title: mc.contact_us.title || 'CONTACT US',
      kind: 'contact',
      contact: {
        title: mc.contact_us.title || 'Anandam Eleganza - Premium Villa Plots',
        about: mc.contact_us.about || '',
        phone: mc.contact_us.phone || '',
        email: mc.contact_us.email || '',
        image: mc.contact_us.image || '',
        imageName: mc.contact_us.imageName || '',
        imageBlob: mc.contact_us.imageBlob || null
      }
    });
  }

  // Idempotency: cleanup legacy keys so re-reads never re-migrate
  delete mc.customSections;
  delete mc.location_intel;
  delete mc.walkthrough_video;
  delete mc.virtual_tour;
  delete mc.gallery;
  delete mc.brochure;
  delete mc.contact_us;

  return tree;
}

function cleanNodeForSave(node) {
  if (!node) return null;
  const clean = {
    id: node.id,
    title: node.title || '',
    kind: node.kind
  };
  if (node.kind === 'parent') {
    clean.children = Array.isArray(node.children) ? node.children.map(cleanNodeForSave).filter(Boolean) : [];
  } else if (node.kind === 'child') {
    clean.contentType = node.contentType || 'link';
    const c = node.content || {};
    // NOTE: this is a WHITELIST — anything not copied here is dropped on every save.
    // A new content type that carries its own field MUST be added below, or it will be
    // silently lost on the round-trip (a `panotour` item saved without its `tourId`
    // still appears in the menu and simply does nothing when clicked).
    clean.content = {
      url: c.url || '',
      fileName: c.fileName || (c.fileBlob ? c.fileBlob.name : '')
    };
    if (clean.contentType === 'gallery') {
      clean.content.images = Array.isArray(c.images) ? c.images.map(img => ({ name: img.name, url: img.url })) : [];
    }
    if (clean.contentType === 'panotour') {
      clean.content.tourId = c.tourId || '';       // which tour in this project's tour.json
    }
    if (node.builtin) {
      clean.builtin = node.builtin;                // 'aerial' | 'landmarks' — see ensureBuiltinNodes
      clean.enabled = node.enabled !== false;
    }
  } else if (node.kind === 'contact') {
    const ct = node.contact || {};
    clean.contact = {
      title: ct.title || '',
      about: ct.about || '',
      phone: ct.phone || '',
      email: ct.email || '',
      image: ct.image || '',
      imageName: ct.imageName || (ct.imageBlob ? ct.imageBlob.name : '')
    };
  }
  return clean;
}

function menuConfigData() {
  // No separate `builtins` block any more — AERIAL VIEW/LANDMARKS are ordinary tree
  // nodes now (see ensureBuiltinNodes), so cleanNodeForSave already carries their
  // `builtin`/`enabled` fields through with everything else.
  return { tree: getMenuTree().map(cleanNodeForSave).filter(Boolean) };
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
  const au = d && d.audio; const audio = (au && au.file) ? { file: au.file, _ver: savedAt } : null;
  const bi = d && d.bootImage; const bootImage = (bi && bi.file) ? { file: bi.file, _ver: savedAt } : null;
  const northDeg = (d && isFinite(+d.northDeg)) ? +d.northDeg : null;   // which stored lon is true north (compass)
  const dc = d && d.data, sh = dc && dc.sheet;                       // plot-data source (Google Sheet | committed file)
  const data = { enabled: !!(dc && dc.source === 'sheet'), url: (sh && sh.url || '').toString(), gid: (sh && sh.gid != null ? String(sh.gid) : '') };
  const menuConfig = d && d.menuConfig ? d.menuConfig : null;
  const area = parseAreaConfig(d && d.area);
  // Admin edits that outrank the live sheet. Whitelisted per field so a hand-edited or
  // round-tripped file can't inject arbitrary keys into a plot row.
  const plotOverrides = {};
  const po = d && d.plotOverrides;
  if (po && typeof po === 'object') {
    for (const [id, fields] of Object.entries(po)) {
      if (!id || !fields || typeof fields !== 'object') continue;
      const clean = {};
      OVERRIDE_FIELDS.forEach((k) => { if (fields[k] != null && String(fields[k]) !== '') clean[k] = String(fields[k]); });
      if (Object.keys(clean).length) plotOverrides[id] = clean;
    }
  }
  return { transform, view, opacity, groundImage, panoImage, brand, audio, bootImage, northDeg, data, menuConfig, area, plotOverrides, savedAt };
}
async function loadAlignmentFile() {                    // committed file → {transform, view} | null
  try { const res = await loadProjectFile('alignment.json'); if (!res || !res.ok) return null; return parseAlignment(await res.json()); }
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
    ...(audioData() ? { audio: audioData() } : {}),
    ...(bootImageData() ? { bootImage: bootImageData() } : {}),
    ...(state.northDeg ? { northDeg: +(+state.northDeg).toFixed(2) } : {}),
    ...(sheetData() ? { data: sheetData() } : {}),
    ...(areaData() ? { area: areaData() } : {}),
    ...(Object.keys(state.plotOverrides || {}).length ? { plotOverrides: state.plotOverrides } : {}),
    ...(menuConfigData() ? { menuConfig: menuConfigData() } : {}) };
}
// Serialise the plot-data source (only when a sheet URL has been configured).
function sheetData() {
  const url = (state.sheet.url || '').trim(); if (!url) return null;
  return { source: state.sheet.enabled ? 'sheet' : 'file', sheet: { url, ...(state.sheet.gid ? { gid: state.sheet.gid } : {}) } };
}
// Serialise the area unit + bands. Omitted entirely when a project has defined no filters
// AND left the unit at its default, so alignment.json is byte-identical for every project
// that never touches this feature.
function areaData() {
  const filters = (state.area.filters || []).filter((f) => f && f.name);
  if (!filters.length && state.area.unit === 'sq.ft') return null;
  return { unit: state.area.unit || 'sq.ft',
    filters: filters.map((f) => ({ id: f.id, name: f.name, color: f.color,
      ...(f.min == null ? {} : { min: +f.min }), ...(f.max == null ? {} : { max: +f.max }) })) };
}
function parseAreaConfig(a) {
  const out = { unit: 'sq.ft', filters: [] };
  if (!a || typeof a !== 'object') return out;
  if (typeof a.unit === 'string' && a.unit.trim()) out.unit = a.unit.trim();
  // A blank min or max means "open-ended on that side" — stored as null, not 0, or a band
  // written as "up to 1200" would silently become "exactly 0 to 1200".
  out.filters = (Array.isArray(a.filters) ? a.filters : []).map((f, i) => ({
    id: (f?.id || `af${i + 1}`).toString(),
    name: (f?.name || `Filter ${i + 1}`).toString(),
    color: /^#[0-9a-f]{6}$/i.test(f?.color || '') ? f.color : DEFAULT_FILTER_COLORS[i % DEFAULT_FILTER_COLORS.length],
    min: (f?.min == null || f.min === '') ? null : (isFinite(+f.min) ? +f.min : null),
    max: (f?.max == null || f.max === '') ? null : (isFinite(+f.max) ? +f.max : null),
  })).filter((f) => f.id);
  return out;
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
    siteAudio: state.audio.blob ? { name: state.audio.name || 'audio.mp3', blob: state.audio.blob } : null,
    bootImage: state.bootImage.blob ? { name: state.bootImage.name || 'loading.web.jpg', blob: state.bootImage.blob } : null,
    landmarks: state.landmarks.map((l) => ({ id: l.id, label: l.label, distance: l.distance, driveTime: l.driveTime, icon: l.icon, category: l.category || null, featured: l.featured !== false, render: l.render, renderBlob: l.renderBlob || null, hotspot: { ...l.hotspot }, banner: { ...l.banner } })),
    amenities: state.amenities.map((a) => ({ id: a.id, name: a.name, icon: a.icon, facing: a.facing, size: a.size, dimensions: a.dimensions, price: a.price, block: a.block, tour_url: a.tour_url, notes: a.notes, render: a.render, renderBlob: a.renderBlob || null, hotspot: { ...a.hotspot } })),
    tours: state.tours.map((t) => ({ id: t.id, name: t.name, startNode: t.startNode, variantLabels: tourVariantLabels(t),
      nodes: t.nodes.map((n) => ({ id: n.id, name: n.name, pano: n.pano, panoBlob: n.panoBlob || null,
        panoAlt: n.panoAlt || null, panoAltBlob: n.panoAltBlob || null, defaultView: { ...n.defaultView } })),
      links: t.links.map((k) => ({ from: k.from, to: k.to, label: k.label, hotspot: { ...k.hotspot }, icon: k.icon, rot: k.rot, variant: k.variant || null })),
      maps: (t.maps || []).map((m) => ({ id: m.id, file: m.file, blob: m.blob || null, points: (m.points || []).map((p) => ({ ...p })) })) })),
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
// POST files to server.py, which writes them into projects/<projectId>/. Text
// data and small blobs (< UPLOAD_BINARY_THRESHOLD) go as base64 JSON to the
// existing /api/save endpoint. Large blobs (videos, images) are sent as raw
// binary to /api/upload — no btoa() cap, no RAM spike from arrayBuffer().
async function blobToBase64(blob) {
  // FileReader.readAsDataURL is browser-native and doesn't share btoa()'s
  // ~500 MB string-length limit. Only call this for small blobs; large ones
  // go through /api/upload as raw binary and never need base64 at all.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(new Error('FileReader error encoding file for upload'));
    reader.readAsDataURL(blob);
  });
}

// Files (Blobs) above this size are uploaded as raw binary to /api/upload
// instead of being base64-encoded into the JSON body. 5 MB is a conservative
// threshold — small enough that base64 JSON is still fine, large enough that
// we don't split unnecessarily for logo / landmark / plan images.
const UPLOAD_BINARY_THRESHOLD = 5 * 1024 * 1024; // 5 MB

async function serverSave(files) {
  const project = state.projectId;
  const jsonEntries   = [];  // small / text files → /api/save  (JSON + base64)
  const binaryUploads = [];  // large blobs       → /api/upload (raw binary stream)

  for (const [name, data, mime] of files) {
    if (data instanceof Blob && data.size > UPLOAD_BINARY_THRESHOLD) {
      binaryUploads.push([name, data, mime || 'application/octet-stream']);
    } else if (data instanceof Blob) {
      jsonEntries.push({ name, encoding: 'base64', data: await blobToBase64(data) });
    } else {
      jsonEntries.push({ name, encoding: 'utf8', data: String(data) });
    }
  }

  let lastResult = null;

  // ── Small / text files via existing JSON endpoint ──────────────────────────
  if (jsonEntries.length > 0) {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, files: jsonEntries }),
    });
    if (!res.ok) throw new Error(`server responded ${res.status}`);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'save failed');
    lastResult = j;
  }

  // ── Large binaries via raw binary stream — no base64, no JSON wrapper ──────
  for (const [name, blob, mime] of binaryUploads) {
    const url = `/api/upload?project=${encodeURIComponent(project)}&name=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': mime },
      body: blob,
    });
    if (!res.ok) throw new Error(`upload of "${name}" failed: ${res.status}`);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || `upload of "${name}" failed`);
    lastResult = j;
  }

  // Synthesise a result when we only did binary uploads (no JSON batch)
  if (!lastResult) {
    lastResult = {
      ok: true, project,
      dir: `projects/${project}`,
      written: binaryUploads.map((f) => f[0]),
      skipped: [],
    };
  } else if (binaryUploads.length > 0) {
    lastResult.written = (lastResult.written || []).concat(binaryUploads.map((f) => f[0]));
  }

  return lastResult;
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
  if (!state.audio.blob) add(state.audio.file);
  if (!state.bootImage.blob) add(state.bootImage.file);
  state.amenities.forEach((a) => { if (!a.renderBlob) add(a.render); });
  state.landmarks.forEach((l) => { if (!l.renderBlob) add(l.render); });
  state.tours.forEach((t) => (t.maps || []).forEach((m) => { if (!m.blob) add(m.file); }));
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

  const traverse = (nodeList) => {
    if (!Array.isArray(nodeList)) return;
    for (const node of nodeList) {
      if (node.kind === 'parent') {
        traverse(node.children);
      } else if (node.kind === 'child') {
        const c = node.content || {};
        if (c.fileBlob && c.fileName) {
          // Image types spelled out too (2026-09-21): the MENU IMAGE builtin ships a .png and
          // octet-stream is the wrong hint for something the client loads into an <img>.
          const lower = c.fileName.toLowerCase();
          const mime = lower.endsWith('.pdf') ? 'application/pdf'
            : lower.endsWith('.mp4') ? 'video/mp4'
            : lower.endsWith('.png') ? 'image/png'
            : /\.jpe?g$/.test(lower) ? 'image/jpeg'
            : lower.endsWith('.webp') ? 'image/webp'
            : 'application/octet-stream';
          addBlob(c.fileBlob, c.fileName, mime);
        }
        if (node.contentType === 'gallery' && Array.isArray(c.images)) {
          c.images.forEach(img => {
            if (img.blob && img.name) addBlob(img.blob, img.name, 'image/jpeg');
          });
        }
      } else if (node.kind === 'contact') {
        const ct = node.contact || {};
        if (ct.imageBlob && (ct.imageName || ct.image)) {
          addBlob(ct.imageBlob, ct.imageName || ct.image, 'image/jpeg');
        }
      }
    }
  };

  traverse(getMenuTree());
  return files;
}

// one-click export of the whole site to the server-side project directory
async function exportSite() {
  const hasGeom = state.geom.length > 0;
  const hasLandmarks = state.landmarks.length > 0;
  const hasAmenities = state.amenities.length > 0;
  const hasTours = state.tours.length > 0;
  const hasPano = !!(state.panoBlob || state.panoImage?.file);
  const hasBrand = !!(state.brand?.name || state.brand?.tagline || state.brand?.logo || state.brand?.logoBlob || state.audio?.file || state.audio?.blob);
  const hasPlan = !!(trace.planBlob || state.planBlob || trace.objURL || state.groundImage?.file);

  if (!hasGeom && !hasLandmarks && !hasAmenities && !hasTours && !hasPano && !hasBrand && !hasPlan) {
    setAxStatus('Nothing to save yet — import/trace plots, set a panorama, or add landmarks / amenities / tours first.');
    return false;
  }
  const planBlob = trace.planBlob || state.planBlob || (trace.objURL ? await (await fetch(trace.objURL)).blob() : null);
  const planName = trace.srcName || state.planName || 'plan.web.png';
  const panoBlob = state.panoBlob, panoName = state.panoName || baseName(state.panoImage?.file || '');
  // plots.csv is always written from state.rows — the admin's working data, which already
  // merges sheet + their own edits (see loadData). It used to be REBUILT FROM A FRESH SHEET
  // SNAPSHOT here whenever a sheet was configured, which silently discarded every admin edit
  // at the moment of saving: change a plot's size, hit Save, and the sheet's value was
  // written instead. Fixed 2026-09-18 on report ("admin changes should be considered truth").
  //
  // The sheet is still re-fetched, but only to work out WHICH fields the admin has changed
  // away from it; those are recorded as overrides in alignment.json and re-applied over the
  // sheet on every load, so an edit survives later sheet updates instead of being a
  // one-time snapshot.
  if (hasGeom && state.sheet.enabled && state.sheet.url) {
    const snap = await fetchSheetRows().catch(() => null);
    if (snap && snap.size) state.plotOverrides = computePlotOverrides(snap);
  }
  const plotsCsv = hasGeom ? buildPlotsCSV() : '';
  const files = [
    ...(hasGeom ? [['plots.svg', buildPlotsSVG(), 'image/svg+xml'], ['plots.csv', plotsCsv, 'text/csv']] : []),
    ['alignment.json', JSON.stringify(alignmentData(), null, 2), 'application/json'],
    ...(planBlob ? [[baseName(planName), planBlob, 'image/png']] : []),
    ...(panoBlob && panoName ? [[panoName, panoBlob, 'image/jpeg']] : []),
    ...(state.brand.logoBlob && state.brand.logo ? [[baseName(state.brand.logo), state.brand.logoBlob, 'image/png']] : []),
    ...(state.audio.blob && state.audio.file ? [[baseName(state.audio.file), state.audio.blob, state.audio.blob.type || (/\.(mp4|m4v|mov|mkv|webm)$/i.test(state.audio.file) ? 'video/mp4' : 'audio/mpeg')]] : []),
    ...(state.bootImage.blob && state.bootImage.file ? [[baseName(state.bootImage.file), state.bootImage.blob, 'image/jpeg']] : []),
    ['landmarks.json', JSON.stringify(buildLandmarksData(), null, 2), 'application/json'],
    ['amenities.json', JSON.stringify(buildAmenitiesData(), null, 2), 'application/json'],
    ...(hasTours ? [['tour.json', JSON.stringify(buildToursData(), null, 2), 'application/json'], ...tourNodeBlobFiles()] : []),
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

  // Pre-flight: warn about menu items that link to something online instead of an uploaded
  // file — those need internet no matter what, even in an otherwise fully offline export
  // (see server.py's scan_menu_for_online_content). Best-effort: never block the export
  // itself if this check fails for some reason.
  try {
    const chk = await fetch(`/api/export-bundle-check?project=${encodeURIComponent(id)}`);
    if (chk.ok) {
      const { flagged } = await chk.json();
      if (Array.isArray(flagged) && flagged.length > 0) {
        const proceed = await showExportFlaggedModal(flagged);
        if (!proceed) return; // cancelled, or admin chose to jump into editing one — showExportFlaggedModal already handled the notice
      }
    }
  } catch {}

  // The project menu (this button's own parent) already hid itself the instant it was
  // clicked (onProjAction), so there is NOTHING else on screen for the rest of this
  // function to show through except the notice banner below — reported 2026-09-11 as "how
  // can he see the downloading is even started, there is no downloading progress
  // animation." Two real phases, both visible: the server builds the whole zip in memory
  // before sending anything (slow for a big project — base64-embeds every pano/plan image
  // inline), during which `fetch()` itself simply hasn't resolved yet; then it streams,
  // during which fetchBlobWithProgress's real byte counts drive a live percentage. Both
  // phases use `persist:true` so the message doesn't vanish on showNotice's normal 9s
  // timer while the admin is still waiting — only the final result reverts to normal.
  showNotice(`Building the standalone site for “${esc(id)}”… this can take a while for a large project.`, { persist: true });
  try {
    let lastTick = 0;
    const blob = await fetchBlobWithProgress(`/api/export-bundle?project=${encodeURIComponent(id)}`, (loaded, total) => {
      const now = Date.now();
      if (now - lastTick < 250 && loaded !== total) return;   // throttle — a fast LAN transfer can fire this hundreds of times/sec
      lastTick = now;
      const loadedMB = (loaded / 1048576).toFixed(1);
      if (total) {
        const pct = Math.min(100, Math.round((loaded / total) * 100));
        showNotice(`Downloading the standalone site… ${pct}% (${loadedMB} MB of ${(total / 1048576).toFixed(1)} MB)`, { persist: true });
      } else {
        showNotice(`Downloading the standalone site… ${loadedMB} MB so far`, { persist: true });
      }
    });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${id}-plotmap.zip`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    const embed = `<iframe src="https://YOUR-HOST/${id}/index.html" style="width:100%;aspect-ratio:16/9;border:0" allowfullscreen loading="lazy"></iframe>`;
    let copied = false; try { await navigator.clipboard.writeText(embed); copied = true; } catch {}
    showNotice(`Downloaded <code>${id}-plotmap.zip</code>. Unzip the <code>${id}/</code> folder — <strong>open <code>index.html</code> directly, no server needed</strong> — or upload it to any static host. ${copied ? 'An <strong>&lt;iframe&gt; embed snippet is on your clipboard</strong>' : 'Embed it with an <code>&lt;iframe&gt;</code> pointing at <code>index.html</code>'} (replace <code>YOUR-HOST</code> with your domain).`);
  } catch (e) {
    showNotice(`Couldn’t build the standalone site (${esc(String(e.message || e))}). This needs <code>python server.py</code> running — a plain static server can’t zip the bundle.`);
  }
}

// Pre-flight popup for exportBundle: lists every menu item that needs internet even in the
// offline export (see scan_menu_for_online_content), each with an Edit button that jumps
// straight into that item's existing "Add/Edit Menu Item" wizard — so the admin can swap
// the pasted link for an uploaded file right there instead of hunting through the menu tree.
// Resolves true only if the admin explicitly clicks "Export Anyway"; Cancel OR Edit both
// resolve false (Edit takes them off to fix the item — export can be retried once it's fixed).
function showExportFlaggedModal(flagged) {
  return new Promise((resolve) => {
    const modal = els.exportFlaggedModal, list = els.exportFlaggedList;
    if (!modal || !list) { resolve(true); return; } // markup missing — don't block export over it

    list.innerHTML = flagged.map((f, i) => `
      <div class="export-flag-row" style="display:flex; align-items:center; gap:12px; padding:10px 0; ${i > 0 ? 'border-top:1px solid rgba(255,255,255,0.08);' : ''}">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:13.5px; color:#f8fafc;">${esc(f.title)}</div>
          <div style="font-size:10.5px; font-weight:600; color:#9aa5b1; text-transform:uppercase; letter-spacing:.04em; margin-top:2px;">${esc(f.contentType)}</div>
          ${f.url ? `<div style="font-size:11.5px; color:#7dd3fc; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(f.url)}">${esc(f.url)}</div>` : ''}
        </div>
        <button class="btn btn-ghost" type="button" data-edit-node="${esc(f.id || '')}" data-edit-source="${esc(f.source || 'menu')}" style="flex:none; font-size:12px;">Edit</button>
      </div>
    `).join('');

    const finish = (result) => {
      closeCustomModal(modal);
      els.exportFlaggedProceed.removeEventListener('click', onProceed);
      els.exportFlaggedCancel.removeEventListener('click', onCancel);
      list.removeEventListener('click', onListClick);
      resolve(result);
    };
    const onProceed = () => finish(true);
    const onCancel = () => { showNotice('Export cancelled.'); finish(false); };
    const onListClick = (e) => {
      const btn = e.target.closest('[data-edit-node]');
      if (!btn) return;
      const nodeId = btn.dataset.editNode, source = btn.dataset.editSource;
      finish(false);
      if (!nodeId) return;
      if (source === 'amenity') { setAdminTab('amenities'); selectAmenity(nodeId); }
      else openNodeBuilderModal(nodeId);
    };
    els.exportFlaggedProceed.addEventListener('click', onProceed);
    els.exportFlaggedCancel.addEventListener('click', onCancel);
    list.addEventListener('click', onListClick);

    openCustomModal(modal);
  });
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
  els.axBootImagePick?.addEventListener('click', () => els.axBootImageFile.click());
  els.axBootImageFile?.addEventListener('change', () => { const f = els.axBootImageFile.files?.[0]; if (f) setBootImage(f); els.axBootImageFile.value = ''; });
  els.axBootImageClear?.addEventListener('click', clearBootImage);
  els.axAudioPick?.addEventListener('click', () => els.axAudioFile.click());
  els.axAudioFile?.addEventListener('change', () => { const f = els.axAudioFile.files?.[0]; if (f) setSiteAudioFile(f); els.axAudioFile.value = ''; });
  els.axAudioClear?.addEventListener('click', clearSiteAudio);
  updateBrandAdminUI();
  updateBootImageAdminUI();
  els.axSheetOn?.addEventListener('change', () => { state.sheet.enabled = els.axSheetOn.checked; updateSheetAdminUI(); if (state.sheet.enabled && !state.sheet.url) setSheetMsg('Paste your Google Sheet link, then Test.', ''); onAlignmentChanged(); });
  els.axSheetUrl?.addEventListener('input', () => { state.sheet.url = els.axSheetUrl.value; state.sheet.gid = ''; onAlignmentChanged(); });
  els.axAreaAdd?.addEventListener('click', addAreaFilter);
  els.axAreaToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const collapsed = els.axAreaPanel?.classList.toggle('is-collapsed');
    els.axAreaToggle.setAttribute('aria-expanded', String(!collapsed));
  });
  els.axAreaUnit?.addEventListener('change', () => setAreaUnit(els.axAreaUnit.value));
  refreshAreaAdminUI();
  els.axSheetTest?.addEventListener('click', testSheet);
  els.axSheetSample?.addEventListener('click', downloadSampleSheetCsv);
  updateSheetAdminUI();
  els.axTabBtnAlign.addEventListener('click', () => setAdminTab('align'));
  els.axTabBtnLandmarks.addEventListener('click', () => setAdminTab('landmarks'));
  els.axTabBtnAmenities?.addEventListener('click', () => setAdminTab('amenities'));
  els.axTabBtnTour?.addEventListener('click', () => setAdminTab('tour'));
  els.axLmAdd.addEventListener('click', addLandmark);
  els.axLmShowAll?.addEventListener('click', () => setAllLandmarksFeatured(true));
  els.axLmHideAll?.addEventListener('click', () => setAllLandmarksFeatured(false));
  els.axLmSave?.addEventListener('click', saveLandmarksAs);
  els.axLmLoad?.addEventListener('click', () => els.axLmFile?.click());
  els.axLmFile?.addEventListener('change', async () => { const f = els.axLmFile.files?.[0]; if (f) { try { setLandmarks(parseLandmarks(JSON.parse(await f.text()))); onLandmarksChanged(); setAxStatus(`Loaded ${state.landmarks.length} landmark(s) from ${f.name}.`); } catch (err) { setAxStatus(`Could not read that landmarks file (${err.message}).`); } } els.axLmFile.value = ''; });
  els.axAmAdd?.addEventListener('click', addAmenity);
  els.axAmSave?.addEventListener('click', saveAmenitiesAs);
  els.axAmLoad?.addEventListener('click', () => els.axAmFile?.click());
  els.axAmFile?.addEventListener('change', async () => { const f = els.axAmFile.files?.[0]; if (f) { try { setAmenities(parseAmenities(JSON.parse(await f.text()))); onAmenitiesChanged(); setAxStatus(`Loaded ${state.amenities.length} amenit${state.amenities.length === 1 ? 'y' : 'ies'} from ${f.name}.`); } catch (err) { setAxStatus(`Could not read that amenities file (${err.message}).`); } } els.axAmFile.value = ''; });
  els.axTourAdd?.addEventListener('click', addTour);
  els.axTourSaveBtn?.addEventListener('click', saveToursAs);
  els.axTourLoad?.addEventListener('click', () => els.axTourFile?.click());
  els.axTourFile?.addEventListener('change', async () => { const f = els.axTourFile.files?.[0]; if (f) { try { setTours(parseTours(JSON.parse(await f.text()))); onToursChanged(); setAxStatus(`Loaded ${state.tours.length} tour(s) from ${f.name}.`); } catch (err) { setAxStatus(`Could not read that tour file (${err.message}).`); } } els.axTourFile.value = ''; });
  els.axTourNodeFile?.addEventListener('change', async () => { const f = els.axTourNodeFile.files?.[0]; if (f) await addTourNodeFromFile(f); els.axTourNodeFile.value = ''; });
  els.axTourMapFile?.addEventListener('change', async () => { const f = els.axTourMapFile.files?.[0]; if (f) await setTourMapFromFile(f); els.axTourMapFile.value = ''; });
  els.axMenuImageFile?.addEventListener('change', async () => { const f = els.axMenuImageFile.files?.[0]; if (f) await setMenuImageFromFile(f); els.axMenuImageFile.value = ''; });
  els.axTourNodeAltFile?.addEventListener('change', async () => { const f = els.axTourNodeAltFile.files?.[0]; if (f) await addTourNodeAltFromFile(f); els.axTourNodeAltFile.value = ''; });
  // Tour-map editor: a click anywhere on the image places the ARMED room's dot there.
  // `tourMapEdit.drag` is checked first because a drag that ends over the canvas also
  // fires a click — without the guard, releasing a dragged dot would place the armed
  // room on top of wherever the drag happened to end.
  els.tourMapCanvas?.addEventListener('click', (e) => {
    if (tourMapEdit.dragJustEnded) { tourMapEdit.dragJustEnded = false; return; }
    if (!tourMapEdit.armed) return;
    const { x, y } = tourMapNorm(e);
    const armed = tourMapEdit.armed;
    tourMapEdit.armed = null;
    setTourMapPoint(armed, x, y);
  });
  els.tourMapCanvas?.addEventListener('pointermove', (e) => {
    // Aiming a cone: the angle is just the pointer's bearing from that dot's centre,
    // measured clockwise from "up" to match the CSS rotation the cone uses.
    if (tourMapEdit.rotDrag) {
      const m = curTourMapMap(); const p = m && tourMapPointFor(m, tourMapEdit.rotDrag.nodeId);
      if (!p) return;
      const r = els.tourMapCanvas.getBoundingClientRect();
      const dx = (e.clientX - r.left) - p.x * r.width;
      const dy = (e.clientY - r.top) - p.y * r.height;
      if (Math.hypot(dx, dy) < 6) return;            // too close to the centre to read an angle
      p.rot = normDeg(Math.atan2(dx, -dy) * 180 / Math.PI);
      els.tourMapEditDots?.querySelectorAll(`.tourmap-cone.is-armed, .tourmap-rot`)
        .forEach((el) => el.style.setProperty('--rot', `${p.rot}deg`));
      const readout = els.tourMapNodeList?.querySelector('.tourmap-noderow.is-armed .tourmap-noderow-state');
      if (readout) readout.textContent = `${Math.round(p.rot)}°`;
      return;
    }
    if (!tourMapEdit.drag) return;
    tourMapEdit.drag.moved = true;
    const { x, y } = tourMapNorm(e);
    const m = curTourMapMap(); const p = m && tourMapPointFor(m, tourMapEdit.drag.nodeId);
    if (!p) return;
    p.x = x; p.y = y;
    // Move the live element directly rather than re-rendering the whole editor on every
    // pointermove — a full re-render would destroy the element mid-drag and drop the
    // pointer capture with it.
    const el = els.tourMapEditDots?.querySelector(`.tourmap-dot[data-node-id="${CSS.escape(p.nodeId)}"]`);
    if (el) { el.style.left = `${x * 100}%`; el.style.top = `${y * 100}%`; }
  });
  const endTourMapDrag = () => {
    if (tourMapEdit.rotDrag) {
      tourMapEdit.rotDrag = null; tourMapEdit.dragJustEnded = true;
      onToursChanged(); renderTourMapEditor(); renderClientTourMap();
      return;
    }
    if (!tourMapEdit.drag) return;
    const moved = tourMapEdit.drag.moved;
    tourMapEdit.drag = null;
    if (moved) { tourMapEdit.dragJustEnded = true; onToursChanged(); renderTourMapEditor(); renderClientTourMap(); }
  };
  els.tourMapCanvas?.addEventListener('pointerup', endTourMapDrag);
  els.tourMapCanvas?.addEventListener('pointercancel', endTourMapDrag);
  els.tourMapModal?.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeTourMapEditor));
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
      if (state.audio._url) { try { URL.revokeObjectURL(state.audio._url); } catch {} }
      state.audio = { file: a.audio?.file || null, blob: null, name: a.audio?.file ? baseName(a.audio.file) : null, _url: null, _ver: a.audio?._ver || '' };
      applySiteAudio();
      if (state.bootImage._url) { try { URL.revokeObjectURL(state.bootImage._url); } catch {} }
      state.bootImage = { file: a.bootImage?.file || null, blob: null, name: a.bootImage?.file ? baseName(a.bootImage.file) : null, _url: null, _ver: a.bootImage?._ver || '' };
      applyBootImage(); updateBootImageAdminUI();
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
  thresh: 36, simplify: 3, snap: true, dxf: null,
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
// Lowest unused "Plot-Ann" number, computed fresh from what's actually in trace.plots
// right now rather than a monotonic counter — reported 2026-09-17: deleting A102 and
// capturing a new plot continued from A103 instead of reusing the now-free A102, because
// a counter only ever goes up. Scanning the live list instead means a deleted number is
// immediately available again, and duplicates are impossible by construction (a number
// is only "next" if nothing currently holds it).
function nextPlotId() {
  const used = new Set();
  trace.plots.forEach((p) => { const m = /A(\d+)\b/i.exec(p.id); if (m) used.add(+m[1]); });
  let n = 101;
  while (used.has(n)) n++;
  return `Plot-A${n}`;
}
function snapTarget(p, exclude) {
  if (!trace.snap) return null; const rad = 10 / trace.view.zoom, r2 = rad * rad; let best = null, bd = r2;
  trace.plots.forEach((pl, pi) => pl.pts.forEach((v, vi) => { if (exclude && exclude.plot === pi && exclude.vert === vi) return; const dx = v.x - p.x, dy = v.y - p.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { x: v.x, y: v.y }; } }));
  return best;
}
// Auto-fill a traced plot's business fields from an already-loaded Google Sheet row —
// on request 2026-09-17 ("when i draw plots... is it possible [to pull from the sheet]").
// Deliberately excludes video_url/image_url/media_json — those are multi-media fields
// meant to be authored via the trace editor's own upload/link picker, not typed into a
// spreadsheet (same call made for the sample-sheet download button).
const SHEET_AUTOFILL_FIELDS = ['size', 'price', 'facing', 'dimensions', 'block', 'tour_url', 'notes'];
// Freshest sheet fetch, taken right when Import & Trace opens (see openTrace) — kept
// SEPARATE from `state.rows` on purpose. `state.rows` is the authoritative plot data
// (committed CSV or whatever loadData() last resolved) and merging a plain sheet fetch
// into it would risk silently wiping a field a row happens not to carry. Read-only,
// lookup-only cache; null whenever no sheet is configured.
let traceSheetRows = null;
// `state.rows`'/`traceSheetRows`' own keys are whatever indexRows() settled on when
// fetched — the polygon's id for anything that already existed in the layout at that
// moment, otherwise the sheet's raw (uncanonicalized) plot_id. A plot drawn/renamed AFTER
// that fetch was never part of that join, so an exact `.get(id)` can miss a row that's
// really there under a slightly different-looking key ("A102" vs "Plot-A102" vs
// "plot_102"). Try the fast exact match first (both maps), then fall back to a canonical
// scan (same tolerant matching indexRows/canonPlotId use everywhere else) so a rename
// during THIS session still finds it.
function findSheetRowForId(id) {
  const k = canonPlotId(id);
  if (!k) return null;
  for (const rows of [traceSheetRows, state.rows]) {
    if (!rows) continue;
    const direct = rows.get(id);
    if (direct) return direct;
    for (const row of rows.values()) { if (canonPlotId(row.plot_id) === k) return row; }
  }
  return null;
}
// Fills only fields the plot doesn't already have a value for — never overwrites
// something the admin already typed — and remembers which fields came from the sheet
// (`p._sheetFilled`) so refreshTraceList can show a small "✓ Sheet" hint next to them.
// Returns true if anything actually changed, so callers know whether to re-render.
//
// `status` needs its OWN rule, separate from the plain text fields above — it's a
// dropdown that always has SOME value (defaults to 'available'), so "only fill if
// empty" can never fire for it the way it does for a blank price/facing input. Reported
// 2026-09-17: "the available/sold/reserved is not getting fetched... make sure the
// status is fetched exactly in plots as well." Fixed by tracking whether the admin has
// ever actually touched the status dropdown themselves (`p._statusTouched`, set by its
// own change handler in refreshTraceList) — as long as they haven't, the sheet's status
// is free to keep overwriting the untouched default every time a match is (re)found
// (first capture, then again on rename once the real id matches); the moment they pick a
// status by hand, this stops touching it for that plot, same "never fight a manual edit"
// rule as every other field.
function autofillPlotFromSheet(p) {
  if (!p || !p.id) return false;
  const row = findSheetRowForId(p.id);
  if (!row) return false;
  if (!p._sheetFilled) p._sheetFilled = new Set();
  let changed = false;
  SHEET_AUTOFILL_FIELDS.forEach((key) => {
    if (!p[key] && row[key]) { p[key] = row[key]; p._sheetFilled.add(key); changed = true; }
  });
  if (!p._statusTouched && STATUS_META[row.status] && p.status !== row.status) {
    p.status = row.status; p._sheetFilled.add('status'); changed = true;
  }
  return changed;
}
function addPlot(pts, id, status) {
  const p = { id: id || nextPlotId(), status: status || 'available', pts };
  autofillPlotFromSheet(p);
  trace.plots.push(p);
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
    idIn.addEventListener('change', () => {
      p.id = 'Plot-' + idIn.value.trim();
      // Typing/confirming the real plot number is the moment a freshly-drawn plot can
      // finally be matched against an already-loaded sheet row (see autofillPlotFromSheet)
      // — its placeholder id at capture time never matched anything. Only the fields that
      // are still empty get filled, so re-render the whole row (not just redraw the
      // canvas) when that actually happens.
      if (autofillPlotFromSheet(p)) refreshTraceList();
      drawTrace();
    });
    
    const sel = document.createElement('select'); sel.className = 'trace-status';
    STATUS_ORDER.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = STATUS_META[s].label; if (s === p.status) o.selected = true; sel.appendChild(o); });
    // Marks this plot's status as manually decided — once set, autofillPlotFromSheet
    // stops touching it for this plot even if the sheet's value differs (same "don't
    // fight a manual edit" rule the text fields already follow).
    sel.addEventListener('change', () => { p.status = sel.value; p._statusTouched = true; p._sheetFilled?.delete('status'); refreshTraceList(); drawTrace(); });
    const statusSheetDot = document.createElement('span');
    statusSheetDot.className = 'trace-status-sheet-dot'; statusSheetDot.title = 'Status pulled from the Google Sheet';
    statusSheetDot.hidden = !p._sheetFilled?.has('status');

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
      li.append(idIn, mediaBadge, sel, statusSheetDot, editBtn, del);
    } else {
      li.append(idIn, sel, statusSheetDot, editBtn, del);
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
        const w = document.createElement('label'); w.className = 'trace-field';
        const labelRow = document.createElement('span'); labelRow.className = 'trace-field-label-row';
        labelRow.appendChild(document.createTextNode(label));
        // Shows which fields got their value from the Google Sheet (autofillPlotFromSheet)
        // rather than being typed by hand — so the fill is never a silent, unexplained
        // change. Disappears the instant the admin edits that field themselves.
        const sheetBadge = document.createElement('span');
        sheetBadge.className = 'trace-field-sheet-badge'; sheetBadge.textContent = '✓ Sheet';
        sheetBadge.hidden = !p._sheetFilled?.has(key);
        labelRow.appendChild(sheetBadge);
        w.appendChild(labelRow);
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = p[key] || ''; if (ph) inp.placeholder = ph;
        inp.addEventListener('input', () => {
          p[key] = inp.value;
          if (p._sheetFilled) p._sheetFilled.delete(key);
          sheetBadge.hidden = true;
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
async function traceLoadImage(file) {
  // Device's real texture ceiling (same one the pano uses) — only ever clamps when the
  // GPU genuinely can't hold the image as a texture. Not a deliberate quality cut: any
  // upload at or under this size passes through at full original resolution, lossless.
  const cap = Math.min(PANO_TEX_CAP, gpuMaxTexSize());
  let bmp, w, h, viaBitmap = false;
  try { bmp = await createImageBitmap(file); w = bmp.width; h = bmp.height; viaBitmap = true; }
  catch {
    try { const u = URL.createObjectURL(file); const im = new Image(); im.src = u; await im.decode(); URL.revokeObjectURL(u); bmp = im; w = im.naturalWidth; h = im.naturalHeight; }
    catch { setTraceHint(`Could not read that image — it may be corrupt, or too large for the browser to decode. Resize it to ≤ ${cap} px and retry.`, true); return; }
  }
  if (!w || !h) { setTraceHint('Could not read that image.', true); return; }
  const sc = Math.min(1, cap / Math.max(w, h));
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
  trace.plots = []; trace.draft = null; trace.sel = -1;
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
  trace.W = conv.W; trace.H = conv.H; trace.draft = null; trace.sel = -1;
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
  refreshAreaAdminUI(); renderAreaFilterUI();   // plot set just changed → refresh the band counts + client dropdown
  setAxStatus(`Imported ${state.geom.length} plots${trace.isRaster ? ' + plan image' : ''}. Align, fill data, then click <strong>Save</strong> in the top bar${trace.isRaster ? ' (saves the resized plan image too)' : ''}.`);
}
async function openTrace() {
  trace.open = true; els.traceWin.classList.add('open'); els.traceWin.setAttribute('aria-hidden', 'false');
  updateSheetAdminUI();
  refreshAreaAdminUI();   // its per-band "N plots" counts read state.geom/state.rows, which move as plots are traced
  // Re-fetch the sheet fresh right as tracing starts (rather than relying on whatever
  // loadData() cached at page boot) — kept in `traceSheetRows`, never merged into
  // `state.rows` directly, so a sheet row that's missing a field (or a row that isn't
  // there at all) can never silently clobber data the admin already has. This is what
  // makes drawing a plot whose id was only just added to the sheet actually work in the
  // same session, instead of needing a full page reload first.
  traceSheetRows = (state.sheet.enabled && state.sheet.url) ? await fetchSheetRows().catch(() => null) : null;
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
  if (typeof applyCategoryFilter === 'function') applyCategoryFilter(state.selectedCategory, { moveCamera: false });
}
function projectDir(dir, cam, W, H) {
  const p = dir.clone().multiplyScalar(R).project(cam);
  if (p.z > 1) return null;                               // behind the camera → hide
  return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
}
// Mobile used to cap how many landmarks render at once (a density problem, not the
// edge-overflow one the clamp below solves), hiding the rest behind a "+N more" tap into
// the category picker. Removed 2026-09-10 at explicit request — "don't do that, let's
// make the banner/font size small for mobile instead": every matching landmark now
// renders on mobile exactly as it does on desktop, and decluttering is handled entirely
// by the landscape-phone banner shrink in styles.css (kept small enough there specifically
// because nothing is hidden here any more). `capSet`/`hiddenCount` stay in the code as
// dead-but-harmless plumbing (the `if (capSet ...)` check below never fires since capSet
// is always null) rather than restructuring the whole function for a `const CAP = null`
// that's trivially re-enabled if density ever becomes a problem again at these smaller
// sizes. #lmOverflowHint (still wired in wireViewControls) simply never shows any more.
const LANDMARK_MOBILE_CAP = Infinity;
function renderLandmarks() {
  if (!three || !els.landmarks || els.landmarks.hidden) return;
  const rect = els.pano.getBoundingClientRect(), W = rect.width, H = rect.height, cam = three.camera;
  const filterCat = state.selectedCategory || 'ALL';

  let capSet = null, hiddenCount = 0;
  if (!state.admin && (isMobilePortrait() || isMobileLandscape())) {
    const matched = state.landmarks.filter((lm) => isLandmarkShown(lm, filterCat));
    if (matched.length > LANDMARK_MOBILE_CAP) {
      const prioritized = [...matched.filter((lm) => renderSrc(lm)), ...matched.filter((lm) => !renderSrc(lm))];
      capSet = new Set(prioritized.slice(0, LANDMARK_MOBILE_CAP).map((lm) => lm.id));
      hiddenCount = matched.length - LANDMARK_MOBILE_CAP;
    }
  }
  if (els.lmOverflowHint) {
    els.lmOverflowHint.hidden = hiddenCount === 0;
    if (hiddenCount > 0) els.lmOverflowHint.textContent = `+${hiddenCount} more — filter by category`;
  }

  for (const lm of state.landmarks) {
    const d = lmDom.get(lm.id); if (!d) continue;

    // Visibility (isLandmarkShown): a selected category shows exactly its own members,
    // featured or not; the default ALL view shows only the featured ones. Admin editing
    // sees everything, with the unfeatured banners marked (.is-unfeatured) so it's obvious
    // which ones the client won't show up-front.
    d.banner.classList.toggle('is-unfeatured', lm.featured === false);
    if (!isLandmarkShown(lm, filterCat)) {
      d.line.style.display = d.pin.style.display = d.banner.style.display = 'none';
      continue;
    }
    if (capSet && !capSet.has(lm.id)) {
      d.line.style.display = d.pin.style.display = d.banner.style.display = 'none';
      continue;
    }

    const hp = projectDir(dirFromLonLat(lm.hotspot.lon, lm.hotspot.lat), cam, W, H);
    const bp = projectDir(dirFromLonLat(lm.banner.lon, lm.banner.lat), cam, W, H);
    const show = hp && bp;
    d.line.style.display = d.pin.style.display = d.banner.style.display = show ? '' : 'none';
    if (!show) continue;
    // A banner sits where its landmark actually is — never dragged inward to stay visible.
    // It used to be clamped to the viewport so a label couldn't be cut off at the edge, but
    // that made everything currently out of view pile up against the sides, tracking along
    // as you panned; a landmark that isn't in shot should simply not be in shot. So: no
    // clamping, and one that won't fit fully is hidden rather than shown half-cut.
    // offsetWidth is a layout read, but landmark counts are small (a handful to a few
    // dozen), so this doesn't meaningfully add up per frame.
    const halfW = d.banner.offsetWidth / 2, margin = 6;
    if (bp.x - halfW < margin || bp.x + halfW > W - margin) {
      d.line.style.display = d.pin.style.display = d.banner.style.display = 'none';
      continue;
    }
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
  renderLandmarkCategoryNav();   // category set may have gained/lost a member — keep the picker in sync
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
  const lm = { id: 'lm' + (++lmSeq), label: '', distance: '', driveTime: '', icon: 'place', featured: true, render: null, renderBlob: null, hotspot: hs, banner: { lon: hs.lon, lat: Math.max(-80, Math.min(80, hs.lat + 12)) } };
  state.landmarks.push(lm); rebuildLandmarkDOM(); selectLandmark(lm.id); onLandmarksChanged();
  setAxStatus('Landmark added — drag its pin onto a spot, drag the banner to place it, and fill the label/distance/time.');
}
function deleteLandmark(id) {
  const lm = state.landmarks.find((l) => l.id === id); if (lm?._url) { try { URL.revokeObjectURL(lm._url); } catch {} }
  state.landmarks = state.landmarks.filter((l) => l.id !== id);
  if (state.lmSel === id) state.lmSel = null;
  rebuildLandmarkDOM(); refreshLmList(); onLandmarksChanged();
}
// The tick/cross toggle in the admin list. Unticking never removes anything -- the
// landmark just stops riding in the client's default "all landmarks" view, and still
// appears whenever a visitor filters to its category. (Deleting is the separate x.)
function setLandmarkFeatured(lm, on) {
  if ((lm.featured !== false) === !!on) return;      // clicking the already-active button is a no-op, not a flip
  lm.featured = !!on;
  refreshLmList(); renderLandmarks(); onLandmarksChanged();
  const kept = state.landmarks.filter(isLandmarkDefaultVisible).length;
  // Unticking the last one leaves the client's default view empty \u2014 legal, but almost
  // never what's meant, so say it outright rather than letting it be discovered live.
  const tail = kept === 0
    ? ` <strong>No landmarks are ticked now</strong>, so the default view shows none at all \u2014 tick at least one, or visitors only see landmarks after picking a category.`
    : ` ${kept} of ${state.landmarks.length} landmark(s) show by default.`;
  setAxStatus((on
    ? `<strong>${esc(lm.label || lm.id)}</strong> is now <strong>shown by default</strong> \u2014 it appears in the client's all-landmarks view.`
    : `<strong>${esc(lm.label || lm.id)}</strong> is now <strong>hidden by default</strong> \u2014 it still appears when a visitor picks its category. Nothing was deleted.`) + tail);
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
// Bulk ✓/✕ for the whole list. With a couple of dozen landmarks, "hide all, then tick
// the handful I want" is the fastest way to curate (and the fastest way to recover from
// having ticked the wrong set).
function setAllLandmarksFeatured(on) {
  if (!state.landmarks.length) return;
  state.landmarks.forEach((lm) => { lm.featured = !!on; });
  refreshLmList(); renderLandmarks(); onLandmarksChanged();
  setAxStatus(on
    ? `All <strong>${state.landmarks.length}</strong> landmarks are now <strong>shown by default</strong>.`
    : `All <strong>${state.landmarks.length}</strong> landmarks are now <strong>hidden from the default view</strong> — tick the ones you want up-front. Nothing was deleted; every one still appears under its category.`);
}
function refreshLmList() {
  if (!els.axLmList) return;
  els.axLmEmpty.hidden = state.landmarks.length > 0;
  if (els.axLmCount) {
    const kept = state.landmarks.filter(isLandmarkDefaultVisible).length;
    els.axLmCount.textContent = state.landmarks.length
      ? `✓ ${kept} of ${state.landmarks.length} shown by default`
      : '';
  }
  els.axLmList.innerHTML = '';
  state.landmarks.forEach((lm) => {
    const shown = lm.featured !== false;
    const li = document.createElement('li'); li.className = 'ax-lm-li' + (lm.id === state.lmSel ? ' is-sel' : '') + (shown ? '' : ' is-hidden-default');
    const head = document.createElement('div'); head.className = 'ax-lm-li-head';
    const ico = document.createElement('span'); ico.className = 'ax-lm-ico-sel'; ico.textContent = LM_ICONS[lm.icon] || LM_ICONS.place;
    const title = document.createElement('span'); title.className = 'ax-lm-title'; title.textContent = (lm.label || '').trim() || 'New landmark';
    // A real ON/OFF switch, not a plain button (2026-09-09, replacing the ✓/✕ button PAIR
    // this control shipped with). The pair existed because a SINGLE button showing the
    // current state reads as an action ("tick this one to include it") when every
    // landmark starts ticked, so going down the list clicking the ones you want silently
    // turns them OFF — the inversion reported on 2026-09-04. A switch sidesteps that the
    // same way the pair did (ON always means shown, at a glance, regardless of what was
    // clicked) without needing two separate buttons — requested explicitly to match the
    // switch already used for the admin menu builder's built-in rows.
    const vis = document.createElement('label'); vis.className = 'ui-switch ax-lm-vis-switch';
    vis.title = shown
      ? 'Shown by default — appears in the client’s all-landmarks view. Click to hide (still reachable via its category; does NOT delete it).'
      : 'Hidden from the default view — still appears when a visitor picks its category. Click to show by default.';
    const visInput = document.createElement('input'); visInput.type = 'checkbox'; visInput.className = 'ui-switch-input';
    visInput.checked = shown;
    visInput.setAttribute('aria-label', 'Show by default: ' + ((lm.label || '').trim() || 'new landmark'));
    visInput.addEventListener('click', (e) => e.stopPropagation());
    visInput.addEventListener('change', () => setLandmarkFeatured(lm, visInput.checked));
    const visTrack = document.createElement('span'); visTrack.className = 'ui-switch-track';
    const visThumb = document.createElement('span'); visThumb.className = 'ui-switch-thumb';
    visTrack.appendChild(visThumb); vis.append(visInput, visTrack);
    const del = document.createElement('button'); del.className = 'ax-lm-del'; del.type = 'button'; del.textContent = '×';
    del.title = 'DELETE this landmark permanently.\nTo only keep it out of the default view, use the switch instead.';
    del.setAttribute('aria-label', 'Delete landmark ' + ((lm.label || '').trim() || 'new landmark'));
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteLandmark(lm.id); });
    head.append(ico, title, vis, del); li.appendChild(head);
    li.addEventListener('click', (e) => { if (e.target.closest('.ax-lm-edit,.ax-lm-del,.ax-lm-vis-switch')) return; selectLandmark(lm.id === state.lmSel ? null : lm.id); });
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
  els.axTabAlign.hidden = tab !== 'align'; els.axTabLandmarks.hidden = tab !== 'landmarks'; if (els.axTabAmenities) els.axTabAmenities.hidden = tab !== 'amenities'; if (els.axTabTour) els.axTabTour.hidden = tab !== 'tour';
  els.axTabBtnAlign.classList.toggle('is-on', tab === 'align'); els.axTabBtnLandmarks.classList.toggle('is-on', tab === 'landmarks'); els.axTabBtnAmenities?.classList.toggle('is-on', tab === 'amenities'); els.axTabBtnTour?.classList.toggle('is-on', tab === 'tour');
  els.axTabBtnAlign.setAttribute('aria-selected', String(tab === 'align')); els.axTabBtnLandmarks.setAttribute('aria-selected', String(tab === 'landmarks')); els.axTabBtnAmenities?.setAttribute('aria-selected', String(tab === 'amenities')); els.axTabBtnTour?.setAttribute('aria-selected', String(tab === 'tour'));
  const titles = { landmarks: 'Landmarks', amenities: 'Amenities', tour: 'Virtual tours', align: 'Align overlay' };
  const subs = { landmarks: 'Add banners on the horizon; drag the pin and the banner to place them.', amenities: 'Add amenities in the layout; drag each icon-pin, name it, and attach a render image.', tour: 'Build multi-node 360° walkthroughs; add a tour and upload a panorama per node.', align: 'Pick a drag mode, then drag in the pano. Sliders scale/rotate/fade.' };
  if (els.axTitle) els.axTitle.textContent = titles[tab] || titles.align;
  if (els.axSubtitle) els.axSubtitle.textContent = subs[tab] || subs.align;
  applyLandmarkVisibility(); refreshLmList();
  applyAmenityVisibility(); refreshAmList();
  refreshTourList();
}
// persistence
function normLL(o) { if (!o) return null; const lon = o.lonDeg != null ? +o.lonDeg : +o.lon, lat = o.latDeg != null ? +o.latDeg : +o.lat; return (isFinite(lon) && isFinite(lat)) ? { lon, lat } : null; }
function parseLandmarks(d) {
  const arr = (d && Array.isArray(d.landmarks)) ? d.landmarks : (Array.isArray(d) ? d : []);
  const ver = (d && d.savedAt) || '';                    // cache-bust token for committed render images
  return arr.map((l, i) => {
    const render = (l.render && l.render.file) ? l.render.file : (typeof l.render === 'string' ? l.render : null);
    return { id: l.id || 'lm' + (i + 1), label: (l.label || '').toString(), distance: (l.distance || '').toString(), driveTime: (l.driveTime || l.drive || '').toString(), icon: LM_ICONS[l.icon] ? l.icon : 'place', category: (l.category || '').toString().toUpperCase() || null, featured: l.featured !== false, render, renderBlob: l.renderBlob || null, _ver: ver, hotspot: normLL(l.hotspot), banner: normLL(l.banner || l.hotspot) };
  }).filter((l) => l.hotspot && l.banner);
}
function buildLandmarksData() {
  return { version: 1, note: 'Build91 landmark hotspots', savedAt: new Date().toISOString(),
    landmarks: state.landmarks.map((l) => ({ id: l.id, label: l.label, distance: l.distance, driveTime: l.driveTime, icon: l.icon, featured: l.featured !== false,
      ...(l.category ? { category: l.category } : {}),
      ...(l.render ? { render: { file: l.render } } : {}), hotspot: { lonDeg: +l.hotspot.lon.toFixed(2), latDeg: +l.hotspot.lat.toFixed(2) }, banner: { lonDeg: +l.banner.lon.toFixed(2), latDeg: +l.banner.lat.toFixed(2) } })) };
}
async function loadLandmarksFile() {
  try { const r = await loadProjectFile('landmarks.json'); if (!r || !r.ok) return null; return parseLandmarks(await r.json()); } catch { return null; }
}
function setLandmarks(list) {
  state.landmarks.forEach((l) => { if (l._url) { try { URL.revokeObjectURL(l._url); } catch {} } });
  state.landmarks = list || []; state.lmSel = null;
  lmSeq = state.landmarks.reduce((m, l) => { const n = parseInt(String(l.id).replace(/\D/g, ''), 10); return Math.max(m, isFinite(n) ? n : 0); }, 0);
  rebuildLandmarkDOM(); refreshLmList(); applyLandmarkVisibility(); renderLandmarkCategoryNav();
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
    // Same rule as renderLandmarks' banner: the chip is never nudged inward to stay
    // visible (that made off-view amenities crowd the edges and slide along while
    // panning). It stays centered on its true spot, and an amenity whose label won't fit
    // fully is hidden instead of being shown clipped.
    const chip = m.querySelector('.am-chip');
    if (chip) {
      chip.style.transform = '';
      const halfW = chip.offsetWidth / 2, margin = 6;
      if (p.x - halfW < margin || p.x + halfW > W - margin) { m.style.display = 'none'; continue; }
    }
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
  openClientGalleryModal([{ url: src, name: caption || '' }], 0);
}
function closeLightbox() {
  closeClientGalleryModal();
  lbLastFocused?.focus?.();
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
  try { const r = await loadProjectFile('amenities.json'); if (!r || !r.ok) return null; return parseAmenities(await r.json()); } catch { return null; }
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

// ═══ Virtual tours (multi-node panoramic walkthroughs — VIRTUAL-TOUR.md Phase 1) ══════
// A project's tour.json holds MANY independent tours (OQ-4). A tour = { id, name,
// startNode, nodes:[{ id, name, pano{file}, defaultView{lon,lat,fov} }],
// links:[{ from, to, hotspot{lon,lat}, label }] }. Each node's pano is a texture-safe
// .web.jpg resolved by basename like every other project image. Absent tour.json ⇒ no
// tours (today's behaviour). Loaded/saved/exported/sessioned exactly like landmarks/
// amenities. The client crossfade viewer + hotspot authoring build on top of this (later
// Phase-1 steps); this module is the data model + admin tour/node management.
// The 8-point compass, ordered clockwise from North. Single source of truth for every
// facingDir consumer below (validation, the admin <select>, the northDeg calibration, and
// the save-confirmation label) — add a direction here once rather than in four places
// that can drift apart.
const COMPASS_DIRS = [
  ['N', 'North', 0], ['NE', 'Northeast', 45], ['E', 'East', 90], ['SE', 'Southeast', 135],
  ['S', 'South', 180], ['SW', 'Southwest', 225], ['W', 'West', 270], ['NW', 'Northwest', 315],
];
const COMPASS_DIR_KEYS = COMPASS_DIRS.map(([v]) => v);
const COMPASS_DIR_DEG = Object.fromEntries(COMPASS_DIRS.map(([v, , deg]) => [v, deg]));
const COMPASS_DIR_LABEL = Object.fromEntries(COMPASS_DIRS.map(([v, label]) => [v, label]));

// Nav-hotspot icons. SVG rather than the emoji `AM_ICONS`/`LM_ICONS` use, because these
// have to be ROTATABLE and animated — an emoji glyph can't be aimed at a doorway, and its
// look is at the mercy of the platform font. `floor: true` marks the ones that read as
// lying ON the ground (tilted into perspective by CSS) rather than facing the viewer;
// `rotatable` gates the admin's aim control, since a rotated door just looks broken.
const TOUR_HS_ICONS = {
  chevron: { label: 'Arrow (aimable)', rotatable: true, floor: true,
    svg: '<svg viewBox="0 0 48 32" aria-hidden="true"><path d="M4 26 L24 7 L44 26" /></svg>' },
  stairs: { label: 'Stairs (aimable)', rotatable: true, floor: true,
    svg: '<svg viewBox="0 0 48 32" aria-hidden="true"><path d="M6 27 h10 v-6 h10 v-6 h10 v-6 h6" /></svg>' },
  door: { label: 'Door', rotatable: false, floor: false,
    svg: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="hs-ring" /><rect x="14" y="11" width="13" height="18" rx="1.5" /><circle cx="17.5" cy="20" r="1.6" class="hs-dot" /></svg>' },
  ring: { label: 'Ring (plain)', rotatable: false, floor: false,
    svg: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" class="hs-ring" /><circle cx="20" cy="20" r="5" class="hs-dot" /></svg>' },
};
const TOUR_HS_ICON_ORDER = ['chevron', 'door', 'stairs', 'ring'];
// ── Room VARIANTS (2026-09-21) ──────────────────────────────────────────────
// A room can carry TWO panoramas of the same viewpoint — furnished and unfurnished — and
// the visitor flips between them with a toggle that persists as they walk the tour. The
// slots are named 'a'/'b' rather than 'furnished'/'unfurnished' because their LABELS are
// per-tour and admin-editable (a future site may want Day/Night or Option A/B); 'a' is
// always the node's original `pano`, so every tour saved before this reads back unchanged
// with one variant and no toggle.
const TOUR_VARIANTS = ['a', 'b'];
const TOUR_VARIANT_LABELS_DEFAULT = ['Furnished', 'Unfurnished'];
const otherVariant = (v) => (v === 'b' ? 'a' : 'b');
// A link shows in both variants unless it names one — e.g. a "close the curtains" hotspot
// that only means anything in the furnished render.
const normVariantTag = (v) => (TOUR_VARIANTS.includes(v) ? v : null);
const TOUR_HS_ICON_DEFAULT = 'chevron';
const tourHsIcon = (k) => TOUR_HS_ICONS[k?.icon] || TOUR_HS_ICONS[TOUR_HS_ICON_DEFAULT];

let tourSeq = 0;
function newTourId() { return 't' + (++tourSeq); }
function nodeSeqFor(tour) { return (tour.nodes || []).reduce((m, n) => { const k = parseInt(String(n.id).replace(/\D/g, ''), 10); return Math.max(m, isFinite(k) ? k : 0); }, 0); }
function parseTours(d) {
  const arr = (d && Array.isArray(d.tours)) ? d.tours : (Array.isArray(d) ? d : []);
  const ver = (d && d.savedAt) || '';                    // cache-bust token for committed node images
  return arr.map((t, i) => {
    const nodes = (Array.isArray(t.nodes) ? t.nodes : []).map((n, j) => {
      const pano = (n.pano && n.pano.file) ? n.pano.file : (typeof n.pano === 'string' ? n.pano : null);
      // Variant 'b' — optional. Same shape as `pano` (committed path + in-memory blob for an
      // unsaved upload), and its own object-URL slot so revoking one never orphans the other.
      const panoAlt = (n.panoAlt && n.panoAlt.file) ? n.panoAlt.file : (typeof n.panoAlt === 'string' ? n.panoAlt : null);
      const dv = n.defaultView || {};
      return { id: (n.id || 'n' + (j + 1)).toString(), name: (n.name || '').toString() || ('Node ' + (j + 1)),
        pano, panoBlob: n.panoBlob || null, _ver: ver, _url: null,
        panoAlt, panoAltBlob: n.panoAltBlob || null, _urlAlt: null,
        defaultView: { lon: +(dv.lonDeg != null ? dv.lonDeg : dv.lon) || 0, lat: +(dv.latDeg != null ? dv.latDeg : dv.lat) || 0, fov: +dv.fov || 75,
          facingDir: COMPASS_DIR_KEYS.includes(dv.facingDir) ? dv.facingDir : null } };
    }).filter((n) => n.id);
    const nodeIds = new Set(nodes.map((n) => n.id));
    // `icon`/`rot` (2026-09-18): which marker this exit draws as, and which way an aimable
    // one points (degrees clockwise from "up"). Links written before this default to the
    // arrow — it's the shape the reference tour uses for a doorway, and an un-aimed arrow
    // pointing straight up already reads as "through here".
    const links = (Array.isArray(t.links) ? t.links : []).map((k) => ({ from: k.from, to: k.to, label: (k.label || '').toString(), hotspot: normLL(k.hotspot),
      icon: TOUR_HS_ICON_ORDER.includes(k.icon) ? k.icon : TOUR_HS_ICON_DEFAULT, rot: normDeg(+k?.rot || 0),
      variant: normVariantTag(k?.variant) }))
      .filter((k) => nodeIds.has(k.from) && nodeIds.has(k.to) && k.hotspot);   // drop links to deleted nodes
    // Optional isometric / floor-plan image(s) for this tour — MULTIPLE per tour
    // (2026-09-18, on request: the client gets a switch button to flip between them, e.g.
    // separate views/floors of the same site), each with its own dot per room in
    // NORMALISED 0..1 coordinates — so a map renders correctly at any display size (admin
    // editor at ~900px, client minimap at ~190px) without storing, or having to rescale,
    // pixel positions. Accepts the legacy singular `map` key (every file written before
    // this) by wrapping it as a one-item array, so nothing already saved needs migrating.
    // `blob` mirrors `panoBlob` above: it exists so an unsaved upload survives a session
    // round-trip through IndexedDB.
    const rawMaps = Array.isArray(t.maps) ? t.maps : (t.map && typeof t.map === 'object' ? [t.map] : []);
    const maps = rawMaps.map((mSrc, mi) => {
      const mFile = (mSrc && mSrc.file) || null;
      // `rot` = which way the view cone points ON THE MAP (degrees clockwise from "up")
      // when standing in that room at its saved start view. Deliberately anchored to the
      // map image rather than to real-world north: `state.northDeg`/`facingDir` compass
      // calibration is optional and, in practice, unset on most rooms (all 9 of anandman's
      // MODERN VILLA, 2026-09-17) — deriving the cone from it would have aimed every one of
      // them arbitrarily. This way the admin aims it against the picture they're looking
      // at, and it stays correct whether or not the compass is ever calibrated.
      const points = (mSrc && Array.isArray(mSrc.points) ? mSrc.points : [])
        .map((p) => ({ nodeId: (p && p.nodeId != null ? p.nodeId : '').toString(), x: clamp01(+p.x), y: clamp01(+p.y), rot: normDeg(+p?.rot || 0) }))
        .filter((p) => nodeIds.has(p.nodeId) && isFinite(p.x) && isFinite(p.y));   // drop dots for deleted rooms
      return { id: (mSrc && mSrc.id ? mSrc.id.toString() : null) || `m${mi + 1}`, file: mFile, blob: (mSrc && mSrc.blob) || null, _ver: ver, _url: null, points };
    }).filter((m) => m.file || m.blob);
    // Editable per tour; a blank entry falls back to the default rather than rendering an
    // unlabelled button.
    const rawLabels = Array.isArray(t.variantLabels) ? t.variantLabels : [];
    const variantLabels = TOUR_VARIANT_LABELS_DEFAULT.map((d, vi) => ((rawLabels[vi] || '').toString().trim() || d));
    return { id: (t.id || 't' + (i + 1)).toString(), name: (t.name || '').toString() || ('Tour ' + (i + 1)),
      startNode: (t.startNode && nodeIds.has(t.startNode)) ? t.startNode : (nodes[0] ? nodes[0].id : null), nodes, links, maps, variantLabels };
  }).filter((t) => t.id);
}
const clamp01 = (v) => Math.max(0, Math.min(1, +v || 0));
const normDeg = (d) => ((+d || 0) % 360 + 360) % 360;
function buildToursData() {
  return { version: 1, note: 'Build91 virtual tours', savedAt: new Date().toISOString(),
    tours: state.tours.map((t) => ({ id: t.id, name: t.name, startNode: t.startNode,
      // Omitted while still the defaults, so existing tours don't all grow a new key.
      ...(tourVariantLabels(t).some((v, vi) => v !== TOUR_VARIANT_LABELS_DEFAULT[vi]) ? { variantLabels: tourVariantLabels(t) } : {}),
      nodes: t.nodes.map((n) => ({ id: n.id, name: n.name, ...(n.pano ? { pano: { file: n.pano } } : {}),
        ...(n.panoAlt ? { panoAlt: { file: n.panoAlt } } : {}),
        defaultView: { lonDeg: +(+n.defaultView.lon).toFixed(2), latDeg: +(+n.defaultView.lat).toFixed(2), fov: Math.round(+n.defaultView.fov || 75),
          ...(n.defaultView.facingDir ? { facingDir: n.defaultView.facingDir } : {}) } })),
      links: t.links.map((k) => ({ from: k.from, to: k.to, label: k.label, hotspot: { lonDeg: +k.hotspot.lon.toFixed(2), latDeg: +k.hotspot.lat.toFixed(2) },
        icon: k.icon || TOUR_HS_ICON_DEFAULT, rot: Math.round(normDeg(k.rot)),
        ...(k.variant ? { variant: k.variant } : {}) })),
      ...((t.maps || []).some((m) => m.file) ? { maps: t.maps.filter((m) => m.file).map((m) => ({ id: m.id, file: m.file,
        points: (m.points || []).map((p) => ({ nodeId: p.nodeId, x: +(+p.x).toFixed(4), y: +(+p.y).toFixed(4), rot: Math.round(normDeg(p.rot)) })) })) } : {}) })) };
}
// every node pano blob still in memory (fresh import / session restore), for Export + session
function tourNodeBlobFiles() {
  const out = [];
  state.tours.forEach((t) => {
    t.nodes.forEach((n) => {
      if (n.panoBlob && n.pano) out.push([baseName(n.pano), n.panoBlob, 'image/jpeg']);
      if (n.panoAltBlob && n.panoAlt) out.push([baseName(n.panoAlt), n.panoAltBlob, 'image/jpeg']);
    });
    (t.maps || []).forEach((m) => { if (m.blob && m.file) out.push([baseName(m.file), m.blob, 'image/png']); });   // PNG keeps the render's transparency
  });
  return out;
}
async function loadToursFile() {
  try { const r = await loadProjectFile('tour.json'); if (!r || !r.ok) return null; return parseTours(await r.json()); } catch { return null; }
}
function setTours(list) {
  state.tours.forEach((t) => {
    t.nodes.forEach((n) => { if (n._url) { try { URL.revokeObjectURL(n._url); } catch {} } });
    (t.maps || []).forEach((m) => { if (m._url) { try { URL.revokeObjectURL(m._url); } catch {} } });
  });
  state.tours = list || [];
  tourSeq = state.tours.reduce((m, t) => { const k = parseInt(String(t.id).replace(/\D/g, ''), 10); return Math.max(m, isFinite(k) ? k : 0); }, 0);
  state.tourSel = state.tours[0]?.id || null; state.tourNodeSel = null;
  if (typeof refreshTourList === 'function') refreshTourList();
}
function onToursChanged() { if (state.admin) scheduleSessionSave(); }
const curTour = () => state.tours.find((t) => t.id === state.tourSel) || null;

function addTour() {
  const t = { id: newTourId(), name: 'Tour ' + (state.tours.length + 1), startNode: null, nodes: [], links: [], maps: [] };
  state.tours.push(t); state.tourSel = t.id; state.tourNodeSel = null;
  refreshTourList(); onToursChanged();
  setAxStatus('Tour added — give it a name, then <strong>Add node</strong> to upload each 360° panorama.');
}
function deleteTour(id) {
  const t = state.tours.find((x) => x.id === id);
  if (t) {
    t.nodes.forEach((n) => { if (n._url) { try { URL.revokeObjectURL(n._url); } catch {} } });
    (t.maps || []).forEach((m) => { if (m._url) { try { URL.revokeObjectURL(m._url); } catch {} } });
  }
  state.tours = state.tours.filter((x) => x.id !== id);
  if (state.tourSel === id) { state.tourSel = state.tours[0]?.id || null; state.tourNodeSel = null; }
  refreshTourList(); onToursChanged();
}
function selectTour(id) { state.tourSel = id; state.tourNodeSel = null; refreshTourList(); }
async function addTourNodeFromFile(file) {
  const t = curTour(); if (!t || !file) return;
  const cap = Math.min(PANO_TEX_CAP, gpuMaxTexSize());
  // resizeImageToBlob returns { blob, W, H } — NOT a Blob. Unwrapping it matters: storing
  // the wrapper made every saved node pano serialise as the string "[object Object]"
  // (a 15-byte file on disk that silently fails to decode).
  let out; try { out = await resizeImageToBlob(file, cap, 'image/jpeg', 0.85); } catch { setAxStatus('Could not read that image as a panorama.'); return; }
  const id = 'n' + (nodeSeqFor(t) + 1);
  const base = (file.name || 'node').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 40);
  const node = { id, name: base || ('Node ' + (t.nodes.length + 1)), pano: `sample/tour-${t.id}-${id}.web.jpg`, panoBlob: out.blob, _ver: '', _url: null,
    defaultView: { lon: 0, lat: 0, fov: 75, facingDir: null } };
  t.nodes.push(node);
  if (!t.startNode) t.startNode = id;                    // first node is the entry point by default
  state.tourNodeSel = id; refreshTourList(); onToursChanged();
  setAxStatus(`Node “${node.name}” added to ${esc(t.name)}. (Hotspot linking + preview land in the tour viewer — next build step.)`);
}
// The second render for one room. Which room is decided before the file dialog opens
// (state.tourAltTarget), because a file input gives no way to carry it through the picker.
async function addTourNodeAltFromFile(file) {
  const t = curTour(); if (!t || !file) return;
  const n = t.nodes.find((x) => x.id === state.tourAltTarget); if (!n) return;
  const cap = Math.min(PANO_TEX_CAP, gpuMaxTexSize());
  let out; try { out = await resizeImageToBlob(file, cap, 'image/jpeg', 0.85); } catch { setAxStatus('Could not read that image as a panorama.'); return; }
  if (n._urlAlt) { try { URL.revokeObjectURL(n._urlAlt); } catch {} n._urlAlt = null; }
  // Same naming convention as the primary (see addTourNodeFromFile) with a -b suffix, so the
  // two renders of one room sort together on disk. assetUrl() only ever reads the basename.
  n.panoAlt = `sample/tour-${t.id}-${n.id}-b.web.jpg`;
  n.panoAltBlob = out.blob;
  // Drop any cached texture for this slot — the room may already have been viewed with a
  // previous upload still in the LRU under the same key.
  const k = tourKey(t, n, 'b'); const old = tourTex.get(k);
  if (old) { old.dispose(); tourTex.delete(k); }
  refreshTourList(); onToursChanged(); renderTourVariantBar();
  const labels = tourVariantLabels(t);
  setAxStatus(`${esc(labels[1])} render added to “${esc(n.name)}”.`);
}
function clearTourNodeAlt(tourId, nodeId) {
  const t = state.tours.find((x) => x.id === tourId); if (!t) return;
  const n = t.nodes.find((x) => x.id === nodeId); if (!n) return;
  if (n._urlAlt) { try { URL.revokeObjectURL(n._urlAlt); } catch {} n._urlAlt = null; }
  n.panoAlt = null; n.panoAltBlob = null;
  const k = tourKey(t, n, 'b'); const tex = tourTex.get(k);
  if (tex) { tex.dispose(); tourTex.delete(k); }
  // If the visitor/admin is standing in this room in variant b, fall back to a so the
  // viewer isn't left showing a texture that no longer has a source.
  if (state.tourView && state.tourView.tourId === t.id && state.tourView.nodeId === n.id && curTourVariant() === 'b') {
    state.tourView.variant = 'a';
    const node = n; loadTourNodeTex(t, node, 'a').then((tex2) => { swapPano(tex2); requestRender(); }).catch(() => {});
  }
  refreshTourList(); onToursChanged(); renderTourVariantBar();
}
function deleteTourNode(tourId, nodeId) {
  const t = state.tours.find((x) => x.id === tourId); if (!t) return;
  const n = t.nodes.find((x) => x.id === nodeId);
  if (n && n._url) { try { URL.revokeObjectURL(n._url); } catch {} }
  if (n && n._urlAlt) { try { URL.revokeObjectURL(n._urlAlt); } catch {} }
  t.nodes = t.nodes.filter((x) => x.id !== nodeId);
  t.links = t.links.filter((k) => k.from !== nodeId && k.to !== nodeId);   // drop links touching it
  // ...and its dot on every isometric, or a minimap would keep drawing a dot that jumps
  // nowhere. parseTours filters these out on load too; this is the live-edit half.
  (t.maps || []).forEach((m) => { m.points = (m.points || []).filter((p) => p.nodeId !== nodeId); });
  if (t.startNode === nodeId) t.startNode = t.nodes[0]?.id || null;
  if (state.tourNodeSel === nodeId) state.tourNodeSel = null;
  refreshTourList(); onToursChanged();
}
async function saveToursAs() {
  const files = [['tour.json', JSON.stringify(buildToursData(), null, 2), 'application/json'], ...tourNodeBlobFiles()];
  await saveToProject(files, '<code>tour.json</code>');
}

// ─── Tour map (isometric / floor plan with one dot per room) ────────────────────────
// One OR MORE images per tour (2026-09-18: multiple, on request — e.g. separate floors or
// angles of the same site; the client gets a switch button to flip between them), each with
// a 0..1 coordinate per room on it. Authored in the admin modal below (click a room, click
// the map) and shown to the visitor as a corner minimap while that tour is open — the "you
// are here + jump anywhere" affordance a room list can't give, since a list has no spatial
// information in it at all.
//
// This is a plain <img>, NOT a WebGL texture — so unlike panoImage/groundImage it needs no
// BUNDLE_IMAGES base64 embedding for the standalone `file://` bundle (same reasoning as
// the brand logo; see the file:// gotchas in CLAUDE.md).
// Takes a single MAP object (not a tour) — a tour can have several now.
function tourMapSrc(m) {
  if (!m) return '';
  if (m.blob) { if (!m._url) m._url = URL.createObjectURL(m.blob); return m._url; }
  return assetUrl(m.file, m._ver);   // committed path → active project dir, cache-busted
}
const tourHasMaps = (t) => !!(t && Array.isArray(t.maps) && t.maps.length);
async function setTourMapFromFile(file) {
  const t = curTour(); if (!t || !file) return;
  // PNG, not JPEG — same call as the brand logo, and for the same reason: an isometric
  // render is normally supplied on a TRANSPARENT background, and the client draws it bare
  // over the panorama (no panel behind it). Re-encoding to JPEG would bake that
  // transparency into an opaque white rectangle, which is exactly the "floating box" look
  // this is meant to avoid. 1600px is plenty — the largest it's ever drawn is the admin
  // editor (~900px wide); the client minimap is ~340px.
  let out; try { out = await resizeImageToBlob(file, 1600, 'image/png'); } catch { setAxStatus('Could not read that image.'); return; }
  if (!Array.isArray(t.maps)) t.maps = [];
  // Timestamp + running index rather than a plain counter — mirrors the area-filter id
  // pattern — so an id stays unique even after earlier isometrics have been deleted.
  const id = 'm' + Date.now().toString(36) + t.maps.length;
  t.maps.push({ id, file: `sample/tour-${t.id}-map-${id}.web.png`, blob: out.blob, _ver: '', _url: null, points: [] });
  refreshTourList(); onToursChanged();
  setAxStatus(`Isometric added to <strong>${esc(t.name)}</strong> — open it to place a dot for each room.`);
}
function clearTourMap(tourId, mapId) {
  const t = state.tours.find((x) => x.id === tourId); if (!t) return;
  const m = (t.maps || []).find((x) => x.id === mapId); if (!m) return;
  if (m._url) { try { URL.revokeObjectURL(m._url); } catch {} }
  t.maps = t.maps.filter((x) => x.id !== mapId);
  if (tourMapEdit.tourId === tourId && tourMapEdit.mapId === mapId) closeTourMapEditor();
  refreshTourList(); onToursChanged(); renderClientTourMap();
}

// ── Admin dot-placement editor ──
// `armed` is the room whose dot the next click on the image will set. Clicking a room in
// the side list arms it; clicking the image places/moves that room's dot and disarms, so
// the common case (place every room once, in order) is click-room, click-map, repeat.
// `mapId` scopes the whole editor to ONE isometric at a time — opened per-row from the
// admin's map list (see refreshTourList) rather than the editor offering its own picker,
// since "which isometric am I placing dots on" is much clearer decided before opening it.
const tourMapEdit = { tourId: null, mapId: null, armed: null, drag: null, dragJustEnded: false, rotDrag: null };
let tourMapCone = null;   // the client minimap's single view-cone element (see updateTourMapCone)
let tourMapFlipping = false;   // guards switchTourMap against overlapping flips (see its own comment)
function openTourMapEditor(tourId, mapId) {
  const t = state.tours.find((x) => x.id === tourId);
  const m = t && (t.maps || []).find((x) => x.id === mapId);
  if (!t || !m) return;
  tourMapEdit.tourId = tourId; tourMapEdit.mapId = mapId; tourMapEdit.armed = null; tourMapEdit.drag = null;
  if (els.tourMapModalTitle) els.tourMapModalTitle.textContent = `🗺 ${t.name || 'Tour'} — place rooms on the map`;
  if (els.tourMapEditImg) els.tourMapEditImg.src = tourMapSrc(m);
  openCustomModal(els.tourMapModal);
  renderTourMapEditor();
}
function closeTourMapEditor() {
  tourMapEdit.tourId = null; tourMapEdit.mapId = null; tourMapEdit.armed = null; tourMapEdit.drag = null;
  closeCustomModal(els.tourMapModal);
}
const curTourMapTour = () => state.tours.find((t) => t.id === tourMapEdit.tourId) || null;
const curTourMapMap = () => { const t = curTourMapTour(); return (t && (t.maps || []).find((m) => m.id === tourMapEdit.mapId)) || null; };
function tourMapPointFor(m, nodeId) { return (m?.points || []).find((p) => p.nodeId === nodeId) || null; }
function setTourMapPoint(nodeId, x, y) {
  const m = curTourMapMap(); if (!m) return;
  const existing = tourMapPointFor(m, nodeId);
  if (existing) { existing.x = clamp01(x); existing.y = clamp01(y); }      // moving keeps its aim
  else m.points.push({ nodeId, x: clamp01(x), y: clamp01(y), rot: 0 });
  onToursChanged(); renderTourMapEditor(); renderClientTourMap();
}
const TOURMAP_ROT_STEP = 15;   // degrees per − / + click in the room list
function setTourMapPointRot(nodeId, deg) {
  const m = curTourMapMap(); const p = m && tourMapPointFor(m, nodeId); if (!p) return;
  p.rot = normDeg(deg);
  onToursChanged(); renderClientTourMap();
}
function clearTourMapPoint(nodeId) {
  const m = curTourMapMap(); if (!m) return;
  m.points = m.points.filter((p) => p.nodeId !== nodeId);
  onToursChanged(); renderTourMapEditor(); renderClientTourMap();
}
function renderTourMapEditor() {
  const t = curTourMapTour(); const m = curTourMapMap();
  if (!t || !m || !els.tourMapEditDots || !els.tourMapNodeList) return;
  els.tourMapEditDots.innerHTML = '';
  (m.points || []).forEach((p) => {
    const n = t.nodes.find((x) => x.id === p.nodeId); if (!n) return;
    // Every dot previews its own view cone, so the admin can see at a glance which rooms
    // are still aimed at the default (straight up) — but only the SELECTED room gets the
    // drag handle, or nine overlapping handles would be unusable.
    const cone = document.createElement('div');
    cone.className = 'tourmap-cone' + (tourMapEdit.armed === p.nodeId ? ' is-armed' : '');
    cone.style.left = `${p.x * 100}%`; cone.style.top = `${p.y * 100}%`;
    cone.style.setProperty('--rot', `${normDeg(p.rot)}deg`);
    els.tourMapEditDots.appendChild(cone);
    if (tourMapEdit.armed === p.nodeId) {
      const h = document.createElement('div');
      h.className = 'tourmap-rot';
      h.style.left = `${p.x * 100}%`; h.style.top = `${p.y * 100}%`;
      h.style.setProperty('--rot', `${normDeg(p.rot)}deg`);
      h.title = 'Drag to aim this room’s view cone';
      h.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        tourMapEdit.rotDrag = { nodeId: p.nodeId };
        h.setPointerCapture?.(e.pointerId);
      });
      els.tourMapEditDots.appendChild(h);
    }
    const d = document.createElement('div');
    d.className = 'tourmap-dot' + (tourMapEdit.armed === p.nodeId ? ' is-armed' : '');
    d.style.left = `${p.x * 100}%`; d.style.top = `${p.y * 100}%`;
    d.dataset.nodeId = p.nodeId;    // how the drag handler finds this element again — index
    d.title = n.name;               // into the points array would desync if any dot is skipped
    d.innerHTML = `<span class="tourmap-dot-lbl"></span>`;
    d.querySelector('.tourmap-dot-lbl').textContent = n.name;
    // Drag to fine-tune. pointerdown on a dot must NOT fall through to the canvas's own
    // "place the armed room here" click, hence the stopPropagation + the drag guard below.
    d.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      tourMapEdit.drag = { nodeId: p.nodeId, moved: false };
      d.setPointerCapture?.(e.pointerId);
    });
    els.tourMapEditDots.appendChild(d);
  });

  els.tourMapNodeList.innerHTML = '';
  t.nodes.forEach((n) => {
    const placed = !!tourMapPointFor(m, n.id);
    const row = document.createElement('div');
    row.className = 'tourmap-noderow' + (tourMapEdit.armed === n.id ? ' is-armed' : '') + (placed ? ' is-placed' : '');
    const dot = document.createElement('span'); dot.className = 'tourmap-noderow-dot';
    const nm = document.createElement('span'); nm.className = 'tourmap-noderow-name'; nm.textContent = n.name;
    const st = document.createElement('span'); st.className = 'tourmap-noderow-state';
    const pt = tourMapPointFor(m, n.id);
    st.textContent = tourMapEdit.armed === n.id
      ? (placed ? `${Math.round(normDeg(pt.rot))}°` : 'click the map…')
      : (placed ? `${Math.round(normDeg(pt.rot))}°` : 'not placed');
    row.append(dot, nm, st);
    if (placed) {
      // − / + turn this room's view cone (the "shadow" the client sees on the minimap) by a
      // fixed step — the same `rot` the drag handle edits, i.e. the direction it points at the
      // room's saved start view. Shift = fine 5° step. Buttons sit ON the row, so no need to
      // arm the room first.
      [['−', -1, 'Turn the view cone anticlockwise (Shift = 5°)'], ['+', 1, 'Turn the view cone clockwise (Shift = 5°)']].forEach(([txt, dir, tip]) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ax-lm-del tourmap-rotbtn';
        b.textContent = txt; b.title = tip; b.setAttribute('aria-label', tip);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          setTourMapPointRot(n.id, pt.rot + dir * (e.shiftKey ? 5 : TOURMAP_ROT_STEP));
          renderTourMapEditor();
        });
        row.appendChild(b);
      });
      const x = document.createElement('button'); x.type = 'button'; x.className = 'ax-lm-del'; x.textContent = '×'; x.title = 'Remove this room’s dot';
      x.addEventListener('click', (e) => { e.stopPropagation(); clearTourMapPoint(n.id); });
      row.appendChild(x);
    }
    row.addEventListener('click', () => {
      tourMapEdit.armed = (tourMapEdit.armed === n.id) ? null : n.id;
      renderTourMapEditor();
    });
    els.tourMapNodeList.appendChild(row);
  });
  if (els.tourMapModalHint) {
    const left = t.nodes.filter((n) => !tourMapPointFor(m, n.id)).length;
    const armedPlaced = tourMapEdit.armed && tourMapPointFor(m, tourMapEdit.armed);
    els.tourMapModalHint.textContent = tourMapEdit.armed
      ? (armedPlaced ? 'Drag the small handle to aim this room’s view cone, or click the map to move the dot.'
        : 'Now click the spot on the map where that room is.')
      : (left ? `Pick a room on the right, then click the map. ${left} room${left === 1 ? '' : 's'} still unplaced.`
        : 'All rooms placed. Pick a room to aim its view cone, or drag a dot to fine-tune.');
  }
}
// Pointer → normalised 0..1 inside the image box (which is exactly the canvas element, so
// no letterbox offset has to be accounted for — see the CSS: the <img> fills it).
function tourMapNorm(e) {
  const r = els.tourMapCanvas.getBoundingClientRect();
  return { x: clamp01((e.clientX - r.left) / Math.max(1, r.width)), y: clamp01((e.clientY - r.top) / Math.max(1, r.height)) };
}

// ── Client minimap ──
// Wraps into range rather than clamping, so "switch" can always just add 1 — the common
// case (2 maps) then behaves as a plain toggle back and forth.
const wrapIndex = (i, len) => (!len ? 0 : ((i % len) + len) % len);
// Which map is "current" for the open tour. Lives on `state.tourView` itself (not a
// separate global) so it's naturally scoped to this viewing of this tour and resets to 0
// the next time ANY tour is entered — `state.tourView` is rebuilt fresh by
// openClientPanoTour every time, so there's nothing to reset by hand.
function activeTourMap() {
  const tour = curTourView(); const maps = (tour && tour.maps) || [];
  if (!maps.length) return null;
  if (state.tourView) state.tourView.mapIndex = wrapIndex(state.tourView.mapIndex || 0, maps.length);
  return maps[state.tourView ? state.tourView.mapIndex : 0];
}
// Rebuilt whenever the open tour (or its active map) changes; the ACTIVE dot is re-marked
// on every room arrival (tourGoTo) without rebuilding, same cheap-update pattern
// refreshTourRoomMenu uses for the drawer's room list.
function renderClientTourMap() {
  if (!els.tourMap) return;
  const tour = curTourView();
  const maps = (tour && tour.maps) || [];
  const map = activeTourMap();
  // Gate on the TOUR having something worth showing, NOT on the ACTIVE map having dots
  // (2026-09-18 fix). Requiring dots on the active one made sense while a tour had exactly
  // one map — a lone dot-less map does nothing — but with several it meant switching to a
  // newly-added isometric the admin hadn't placed dots on yet hid the WHOLE minimap, switch
  // button and all, so there was no way to switch back. An unplaced map still shows; it
  // just draws no dots until the admin places some.
  const show = !!(state.tourView && map && maps.some((m) => (m.points || []).length));
  els.tourMap.hidden = !show;
  // The map takes over the compass's own top-right slot for the duration (on request —
  // the reference tour shows a map there and no compass at all). A body class rather than
  // touching .compass directly, so the compass keeps owning its own styling and simply
  // yields the corner; removed again the moment the map goes away.
  document.body.classList.toggle('tour-map-on', show);
  if (!show) {
    if (els.tourMapDots) els.tourMapDots.innerHTML = '';
    if (els.tourMapSwitch) els.tourMapSwitch.hidden = true;
    if (els.tourMapPips) els.tourMapPips.hidden = true;
    if (els.tourMapHide) els.tourMapHide.hidden = true;
    tourMapCone = null;
    return;
  }
  // Dismissed by the visitor: `.tour-map` itself stays rendered (NOT `hidden`) so the
  // restore button survives — CSS collapses the image/dots/switch/pips and repositions the
  // one remaining button into the corner. Everything below still builds normally, so
  // un-hiding is instant and already correct rather than needing a rebuild.
  const dismissed = !!state.tourMapHidden;
  els.tourMap.classList.toggle('is-map-hidden', dismissed);
  if (els.tourMapHide) {
    els.tourMapHide.hidden = false;
    els.tourMapHide.title = dismissed ? 'Show the map' : 'Hide the map';
    els.tourMapHide.setAttribute('aria-label', dismissed ? 'Show the map' : 'Hide the map');
    els.tourMapHide.setAttribute('aria-pressed', String(dismissed));
  }
  if (els.tourMapImg) {
    const src = tourMapSrc(map);
    if (els.tourMapImg.getAttribute('src') !== src) els.tourMapImg.src = src;
  }
  // The switch button + its pagination pips only make sense with 2+ isometrics — a single
  // map has nothing to switch TO, so both stay hidden rather than showing a dead control.
  // (While dismissed, CSS hides them regardless of this.)
  if (els.tourMapSwitch) els.tourMapSwitch.hidden = maps.length < 2;
  // Tells the CSS whether the hide button needs to shift left to clear the switch, or can
  // sit in the corner alone (see .tour-map.has-switch).
  els.tourMap.classList.toggle('has-switch', maps.length >= 2);
  if (els.tourMapPips) {
    els.tourMapPips.hidden = maps.length < 2;
    els.tourMapPips.innerHTML = '';
    if (maps.length >= 2) {
      const idx = state.tourView.mapIndex || 0;
      maps.forEach((_, i) => {
        const pip = document.createElement('span'); pip.className = 'tour-map-pip' + (i === idx ? ' is-on' : '');
        els.tourMapPips.appendChild(pip);
      });
    }
  }
  if (!els.tourMapDots) return;
  els.tourMapDots.innerHTML = '';
  // The view cone ("radar") for whichever room the visitor is standing in. One element,
  // repositioned onto the active dot and re-aimed every frame — appended FIRST so it
  // renders beneath the dots rather than over them.
  tourMapCone = document.createElement('div');
  tourMapCone.className = 'tour-map-cone';
  tourMapCone.hidden = true;
  els.tourMapDots.appendChild(tourMapCone);
  map.points.forEach((p) => {
    const n = tour.nodes.find((x) => x.id === p.nodeId); if (!n) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tour-map-dot' + (state.tourView.nodeId === p.nodeId ? ' is-here' : '');
    b.style.left = `${p.x * 100}%`; b.style.top = `${p.y * 100}%`;
    b.dataset.nodeId = p.nodeId;
    b.title = n.name; b.setAttribute('aria-label', n.name);
    b.addEventListener('click', (e) => { e.stopPropagation(); tourGoTo(p.nodeId); });
    els.tourMapDots.appendChild(b);
  });
  updateTourMapActive();
}
// Flips to the next isometric with a smooth 3D rotation — the whole `.tour-map-inner` (image
// + dots together, so they turn as one unit rather than the dots floating over a spinning
// picture) rotates to its edge, the image/dots are swapped while invisible edge-on, then it
// rotates back to reveal the new one. Timeout-based rather than a `transitionend` listener:
// simpler, and this codebase already times CSS transitions this way elsewhere (the drawer/
// gallery fades) — a transition running on a single `transform` property has no multi-event
// ambiguity to worry about. The 220ms half-duration must match `.tour-map-inner.is-flipping`
// in styles.css; if that duration changes, this does too.
// Visitor can dismiss the minimap entirely (2026-09-18, on request). Deliberately a
// TOGGLE on one button rather than a one-way close: the button stays in the same corner
// either way and just swaps its icon, so there's always an obvious way back — a dismiss
// with no restore would strand a visitor who tapped it by accident.
//
// The compass is deliberately NOT restored while the map is dismissed (`tour-map-on` stays
// on for the whole tour): it would reoccupy this exact corner and collide with the restore
// button, and a tour compass is usually uncalibrated anyway (most rooms leave `facingDir`
// unset — see the `rot` note in parseTours), so bringing it back buys nothing here.
// ── Furnished / unfurnished toggle (2026-09-21) ─────────────────────────────
// Shown whenever ANY room in the open tour carries both renders. In a room that has only
// one, the missing side is DISABLED rather than hidden — the bar keeps its size and
// position as the visitor walks, instead of appearing and vanishing room to room, and
// their chosen mode is left untouched so it resumes in the next room that has both.
function renderTourVariantBar() {
  const bar = els.tourVariants; if (!bar) return;
  const tour = curTourView();
  const show = !!state.tourView && tourHasVariants(tour);
  bar.hidden = !show;
  if (!show) return;
  const labels = tourVariantLabels(tour);
  const node = curTourNode();
  const live = curTourVariant();
  TOUR_VARIANTS.forEach((v, vi) => {
    const btn = bar.querySelector(`[data-variant="${v}"]`); if (!btn) return;
    btn.textContent = labels[vi];
    // "Pressed" follows the visitor's CHOICE, not what the room fell back to — otherwise
    // walking into a furnished-only room would look like the toggle flipped itself.
    btn.setAttribute('aria-pressed', String(v === live));
    const have = node ? nodeHasVariant(node, v) : true;
    // aria-disabled + a class, NOT the `disabled` property: a truly disabled button swallows
    // the click, so tapping the greyed side did nothing at all and read as "the toggle is
    // broken" (reported 2026-09-21). It stays clickable and explains itself instead.
    btn.disabled = false;
    btn.setAttribute('aria-disabled', String(!have));
    btn.classList.toggle('is-unavailable', !have);
    btn.title = have ? labels[vi] : `This room has no ${labels[vi].toLowerCase()} version`;
  });
}
async function setTourVariant(v) {
  const tv = state.tourView, tour = curTourView();
  if (!tv || !tour || tv.busy || !TOUR_VARIANTS.includes(v) || v === tv.variant) return;
  const node = curTourNode(); if (!node) return;
  if (!nodeHasVariant(node, v)) {
    // Say so rather than no-op. The choice is deliberately NOT changed — the visitor stays in
    // the version they picked, so it resumes in the next room that has both.
    const labs = tourVariantLabels(tour);
    showNotice(`“${esc(node.name)}” has no ${esc(labs[TOUR_VARIANTS.indexOf(v)].toLowerCase())} version — showing the ${esc(labs[TOUR_VARIANTS.indexOf(otherVariant(v))].toLowerCase())} one instead.`);
    return;
  }
  tv.busy = true; refreshTourRoomMenu();
  try {
    const tex = await loadTourNodeTex(tour, node, v);
    if (!state.tourView) return;                          // exited while loading
    tv.variant = v;
    // Deliberately NO camera move: it is the same viewpoint, so holding the angle is what
    // makes the furniture appear to materialise in place. Same crossfade as walking between
    // rooms (2026-09-21, on request) — one shared helper, so they cannot drift apart.
    await tourCrossfade(tex);
    tourTouch(tourKey(tour, node, v)); tourEvict();
    prefetchTourNeighbours(tour, node.id);                // neighbours in the NEW variant
    rebuildTourHotspotDOM();                              // variant-tagged hotspots appear/disappear
    renderTourVariantBar(); requestRender();
  } catch (e) {
    showNotice(e.message || 'Could not load that version of this room.');
  } finally {
    if (state.tourView) { state.tourView.busy = false; refreshTourRoomMenu(); }
  }
}
function toggleTourMapHidden() {
  state.tourMapHidden = !state.tourMapHidden;
  try { localStorage.setItem('b91-tour-map-hidden', state.tourMapHidden ? '1' : '0'); } catch {}
  renderClientTourMap();
}
function switchTourMap() {
  const tour = curTourView(); const maps = (tour && tour.maps) || [];
  if (!state.tourView || maps.length < 2) return;
  if (tourMapFlipping) return;                       // ignore taps mid-flip rather than stacking them
  const next = wrapIndex((state.tourView.mapIndex || 0) + 1, maps.length);
  if (!els.tourMapInner) { state.tourView.mapIndex = next; renderClientTourMap(); return; }

  let done = false;
  const commit = () => {
    if (done) return; done = true;
    tourMapFlipping = false;
    els.tourMapInner?.classList.remove('is-flipping');   // transitions 90deg -> 0, the reveal half
    // The tour can be exited mid-flip (a pending timer always outlives the thing that
    // scheduled it) — bail on the index write, but only AFTER clearing the class/flag
    // above, or the minimap would be left stranded edge-on and permanently un-switchable
    // the next time a tour opens.
    if (!state.tourView) return;
    state.tourView.mapIndex = next;
    renderClientTourMap();
  };
  // Wait for BOTH the turn and the image before revealing. The turn alone isn't enough: an
  // isometric is a ~1-2MB PNG that isn't in cache the first time it's shown, so swapping
  // `src` and rotating back in the same tick revealed an image that hadn't downloaded yet —
  // i.e. a blank map, which is exactly the "not visible" this fixes. Preloading runs in
  // PARALLEL with the rotation, so an already-cached image costs nothing extra.
  let turned = false, ready = false;
  const bothDone = () => { if (turned && ready) commit(); };
  const pre = new Image();
  pre.onload = pre.onerror = () => { ready = true; bothDone(); };   // onerror too: a broken
  pre.src = tourMapSrc(maps[next]);                                 // image must not wedge it
  // ...and a hard cap so a slow network can't leave the map stranded edge-on (invisible)
  // indefinitely. Past this we reveal regardless and let the <img> finish on its own.
  setTimeout(() => { ready = true; bothDone(); }, 1500);

  tourMapFlipping = true;
  els.tourMapInner.classList.add('is-flipping');
  setTimeout(() => { turned = true; bothDone(); }, 220);            // matches the CSS duration
}
function updateTourMapActive() {
  if (!els.tourMapDots || !state.tourView) return;
  els.tourMapDots.querySelectorAll('.tour-map-dot').forEach((b) => {
    b.classList.toggle('is-here', b.dataset.nodeId === state.tourView.nodeId);
  });
  // Park the cone on the room the visitor is actually in; updateTourMapCone aims it.
  const map = activeTourMap();
  const p = map && (map.points || []).find((q) => q.nodeId === state.tourView.nodeId);
  if (tourMapCone) {
    tourMapCone.hidden = !p;
    if (p) {
      const movedRoom = tourMapCone.dataset.nodeId !== state.tourView.nodeId;
      tourMapCone.dataset.nodeId = state.tourView.nodeId;
      tourMapCone.style.left = `${p.x * 100}%`; tourMapCone.style.top = `${p.y * 100}%`;
      // Re-run the fade so the cone visibly CLOSES and REOPENS on the new room rather than
      // just being somewhere else. The element is reused (not recreated), so the animation
      // needs the standard restart: clear it, force a reflow, hand it back.
      if (movedRoom) { tourMapCone.style.animation = 'none'; void tourMapCone.offsetWidth; tourMapCone.style.animation = ''; }
    }
  }
  updateTourMapCone();
}
// Live camera → cone rotation, called every frame from renderLoop (right where the compass
// updates, for the same reason: it has to track a free-panning camera).
//
// `p.rot` is the on-map direction at the room's SAVED START VIEW, so the live angle is that
// plus however far the visitor has panned since. The minus sign is the camera-yaw
// convention: `state.view.lon` increases counter-clockwise relative to compass/screen
// bearing (see updateCompass' own `-view.lon` and the two-lon-conventions note above
// computeHome). Reading the room's own defaultView rather than state.northDeg is deliberate
// — see the `rot` comment in parseTours.
function updateTourMapCone() {
  if (!tourMapCone || tourMapCone.hidden || !state.tourView) return;
  const tour = curTourView(); if (!tour) return;
  const map = activeTourMap();
  const p = map && (map.points || []).find((q) => q.nodeId === state.tourView.nodeId);
  const node = tour.nodes.find((n) => n.id === state.tourView.nodeId);
  if (!p || !node) return;
  const lonDeg = state.view.lon * 180 / Math.PI;
  tourMapCone.style.setProperty('--rot', `${normDeg(p.rot - (lonDeg - (node.defaultView.lon || 0)))}deg`);
}
// Admin Tour-tab list: each tour is a row; the selected one expands to its node list +
// Add-node. (Hotspot linking + per-node default view are set inside the tour viewer, the
// next build step — this tab manages the tour/node structure and pano uploads.)
function refreshTourList() {
  if (!els.axTourList) return;
  if (els.axTourEmpty) els.axTourEmpty.hidden = state.tours.length > 0;
  els.axTourList.innerHTML = '';
  state.tours.forEach((t) => {
    const li = document.createElement('div'); li.className = 'ax-tour-li' + (t.id === state.tourSel ? ' is-sel' : '');
    const head = document.createElement('div'); head.className = 'ax-lm-li-head';
    const name = document.createElement('input'); name.className = 'ax-tour-name'; name.value = t.name; name.title = 'Tour name';
    name.addEventListener('input', () => { t.name = name.value; onToursChanged(); });
    name.addEventListener('click', (e) => e.stopPropagation());
    const count = document.createElement('span'); count.className = 'ax-tour-count'; count.textContent = `${t.nodes.length} node${t.nodes.length === 1 ? '' : 's'}`;
    const del = document.createElement('button'); del.className = 'ax-lm-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Delete tour';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteTour(t.id); });
    head.append(name, count, del); li.appendChild(head);
    li.addEventListener('click', (e) => { if (e.target.closest('.ax-tour-edit,.ax-lm-del,input,button')) return; selectTour(t.id === state.tourSel ? null : t.id); });
    if (t.id === state.tourSel) {
      const ed = document.createElement('div'); ed.className = 'ax-tour-edit';
      if (!t.nodes.length) { const p = document.createElement('p'); p.className = 'ax-tour-hint'; p.textContent = 'No nodes yet — Add node to upload a 360° panorama.'; ed.appendChild(p); }
      const liveNode = (state.tourView && state.tourView.tourId === t.id) ? state.tourView.nodeId : null;
      t.nodes.forEach((n) => {
        const row = document.createElement('div'); row.className = 'ax-tour-node' + (n.id === liveNode ? ' is-live' : '');
        const star = document.createElement('button'); star.type = 'button'; star.className = 'ax-tour-start' + (t.startNode === n.id ? ' is-on' : '');
        star.textContent = t.startNode === n.id ? '★' : '☆'; star.title = t.startNode === n.id ? 'Start node' : 'Set as the tour’s start node';
        star.addEventListener('click', (e) => { e.stopPropagation(); t.startNode = n.id; refreshTourList(); onToursChanged(); });
        const nn = document.createElement('input'); nn.className = 'ax-tour-nodename'; nn.value = n.name; nn.title = 'Node name';
        nn.addEventListener('input', () => { n.name = nn.value; onToursChanged(); rebuildTourHotspotDOM(); });
        // Open this node in the live viewer — where hotspots are placed and the start
        // view is set (both are inherently spatial, so they are authored in the pano).
        const go = document.createElement('button'); go.type = 'button'; go.className = 'ax-tour-open';
        go.textContent = n.id === liveNode ? '◉' : '▶'; go.title = n.id === liveNode ? 'Currently open in the viewer' : 'Open this node in the viewer';
        go.addEventListener('click', (e) => {
          e.stopPropagation();
          if (state.tourView && state.tourView.tourId === t.id) tourGoTo(n.id);
          else { state.tourSel = t.id; openClientPanoTour(t.id, t.name); setTimeout(() => tourGoTo(n.id), 0); }
        });
        const dn = document.createElement('button'); dn.type = 'button'; dn.className = 'ax-lm-del'; dn.textContent = '×'; dn.title = 'Delete node';
        dn.addEventListener('click', (e) => { e.stopPropagation(); deleteTourNode(t.id, n.id); });
        row.append(star, go, nn, dn); ed.appendChild(row);

        // Second line: the room's two renders. Slot A is the pano uploaded with the node and
        // is always present; slot B is optional — the ＋ opens the picker for THIS node
        // (state.tourAltTarget, since a file input can't carry it), and once filled shows a ×
        // to drop it again.
        const vr = document.createElement('div'); vr.className = 'ax-tour-vrow';
        const vLabels = tourVariantLabels(t);
        const tagA = document.createElement('span'); tagA.className = 'ax-tour-vtag is-on';
        tagA.textContent = vLabels[0]; tagA.title = `${vLabels[0]} render (the pano this node was created from)`;
        vr.appendChild(tagA);
        if (nodeHasVariant(n, 'b')) {
          const tagB = document.createElement('span'); tagB.className = 'ax-tour-vtag is-on';
          tagB.textContent = vLabels[1]; tagB.title = `${vLabels[1]} render`;
          const rmB = document.createElement('button'); rmB.type = 'button'; rmB.className = 'ax-lm-del ax-tour-vdel';
          rmB.textContent = '×'; rmB.title = `Remove the ${vLabels[1]} render`;
          rmB.addEventListener('click', (e) => { e.stopPropagation(); clearTourNodeAlt(t.id, n.id); });
          vr.append(tagB, rmB);
        } else {
          const addB = document.createElement('button'); addB.type = 'button'; addB.className = 'ax-tour-vadd';
          addB.textContent = `＋ ${vLabels[1]}`;
          addB.title = `Upload the ${vLabels[1]} render of this room — must be shot from the SAME camera position as the ${vLabels[0]} one, or the hotspots will not line up`;
          addB.addEventListener('click', (e) => { e.stopPropagation(); state.tourAltTarget = n.id; els.axTourNodeAltFile?.click(); });
          vr.appendChild(addB);
        }
        ed.appendChild(vr);
      });
      // What the client's two toggle buttons are called. Per tour, so one project can run
      // Furnished/Unfurnished and another Day/Night. Blank falls back to the default rather
      // than rendering an unlabelled button (see parseTours).
      const vBox = document.createElement('div'); vBox.className = 'ax-tour-vlabels';
      const vh = document.createElement('span'); vh.className = 'ax-tour-vlabels-h'; vh.textContent = 'Version labels';
      vh.title = 'What the two buttons are called in the viewer. Only shown once a room has both renders.';
      vBox.appendChild(vh);
      tourVariantLabels(t).forEach((lab, vi) => {
        const inp = document.createElement('input'); inp.className = 'ax-tour-vlabel'; inp.value = lab;
        inp.placeholder = TOUR_VARIANT_LABELS_DEFAULT[vi];
        inp.title = `Label for version ${vi + 1}`;
        inp.addEventListener('click', (e) => e.stopPropagation());
        inp.addEventListener('input', () => {
          const next = tourVariantLabels(t).slice();
          next[vi] = inp.value.trim() || TOUR_VARIANT_LABELS_DEFAULT[vi];
          t.variantLabels = next;
          onToursChanged(); renderTourVariantBar();
        });
        vBox.appendChild(inp);
      });
      ed.appendChild(vBox);

      const add = document.createElement('button'); add.type = 'button'; add.className = 'btn btn-ghost ax-tour-addnode'; add.textContent = '＋ Add node (upload pano)';
      add.addEventListener('click', (e) => { e.stopPropagation(); els.axTourNodeFile?.click(); });
      ed.appendChild(add);

      // ── Tour map (one OR MORE isometrics / floor plans per tour, 2026-09-18) ──
      // Sits right under Add-node because it's the same kind of action (upload an asset
      // that belongs to this tour), and because placing dots only makes sense once the
      // rooms it points at exist. Each isometric gets its own row — the client shows a
      // switch button to flip between them once there are 2+ (see renderClientTourMap).
      const mapBox = document.createElement('div'); mapBox.className = 'ax-tour-map';
      const maps = t.maps || [];
      maps.forEach((m, mi) => {
        const placed = (m.points || []).filter((p) => t.nodes.some((n) => n.id === p.nodeId)).length;
        const row = document.createElement('div'); row.className = 'ax-tour-maprow';
        const thumb = document.createElement('img'); thumb.className = 'ax-tour-mapthumb'; thumb.src = tourMapSrc(m); thumb.alt = '';
        const meta = document.createElement('span'); meta.className = 'ax-tour-mapmeta';
        meta.textContent = `Isometric ${mi + 1} · ${placed}/${t.nodes.length} placed`;
        const openMap = document.createElement('button'); openMap.type = 'button'; openMap.className = 'ax-tour-mapopenrow';
        openMap.textContent = '🗺'; openMap.title = 'Place rooms on this isometric';
        openMap.addEventListener('click', (e) => { e.stopPropagation(); openTourMapEditor(t.id, m.id); });
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ax-lm-del'; rm.textContent = '×'; rm.title = 'Remove this isometric';
        rm.addEventListener('click', (e) => { e.stopPropagation(); clearTourMap(t.id, m.id); });
        row.append(thumb, meta, openMap, rm); mapBox.appendChild(row);
      });
      const addMap = document.createElement('button'); addMap.type = 'button'; addMap.className = 'btn btn-ghost ax-tour-mapadd';
      addMap.textContent = maps.length ? '＋ Add another isometric' : '🗺 Upload isometric / floor plan';
      addMap.title = maps.length
        ? 'Add another view (e.g. a different floor or angle) — visitors get a switch button to flip between them'
        : 'Upload an isometric or floor-plan image, then place a dot for each room on it';
      addMap.addEventListener('click', (e) => { e.stopPropagation(); els.axTourMapFile?.click(); });
      mapBox.appendChild(addMap);
      ed.appendChild(mapBox);

      // ── Hotspot authoring, only while this tour is open in the viewer ──
      if (state.tourView && state.tourView.tourId === t.id && state.tourView.nodeId) {
        const here = t.nodes.find((n) => n.id === state.tourView.nodeId);
        const box = document.createElement('div'); box.className = 'ax-tour-hs';
        const h = document.createElement('div'); h.className = 'ax-tour-hs-h';
        h.innerHTML = `Hotspots in <strong>${esc(here ? here.name : '')}</strong>`;
        box.appendChild(h);

        const mine = t.links.map((k, i) => ({ k, i })).filter((x) => x.k.from === state.tourView.nodeId);
        if (!mine.length) { const p = document.createElement('p'); p.className = 'ax-tour-hint'; p.textContent = 'No exits from this room yet — add one below, then drag it onto the doorway.'; box.appendChild(p); }
        mine.forEach(({ k, i }) => {
          const r = document.createElement('div'); r.className = 'ax-tour-hsrow' + (state.tourHsSel === i ? ' is-sel' : '');
          const tgt = t.nodes.find((n) => n.id === k.to);
          const lbl = document.createElement('input'); lbl.className = 'ax-tour-hslabel';
          lbl.value = k.label || ''; lbl.placeholder = tgt ? tgt.name : k.to; lbl.title = 'Hotspot label (blank = target node name)';
          lbl.addEventListener('input', () => { k.label = lbl.value; onToursChanged(); rebuildTourHotspotDOM(); });
          const arrow = document.createElement('span'); arrow.className = 'ax-tour-hsarrow'; arrow.textContent = '→';
          const to = document.createElement('select'); to.className = 'ax-tour-hsto'; to.title = 'Target node';
          t.nodes.filter((n) => n.id !== k.from).forEach((n) => { const o = document.createElement('option'); o.value = n.id; o.textContent = n.name; to.appendChild(o); });
          to.value = k.to;
          to.addEventListener('change', () => { k.to = to.value; onToursChanged(); rebuildTourHotspotDOM(); });
          const del = document.createElement('button'); del.type = 'button'; del.className = 'ax-lm-del'; del.textContent = '×'; del.title = 'Delete hotspot';
          del.addEventListener('click', (e) => { e.stopPropagation(); deleteTourHotspot(i); });
          r.append(lbl, arrow, to, del); box.appendChild(r);

          // Second row: which marker this exit draws as, and — for the aimable ones — which
          // way it points. Split onto its own line because the row above is already four
          // controls wide in a narrow sidebar.
          const r2 = document.createElement('div'); r2.className = 'ax-tour-hsrow2';
          const icoSel = document.createElement('select'); icoSel.className = 'ax-tour-hsico'; icoSel.title = 'Hotspot marker';
          TOUR_HS_ICON_ORDER.forEach((key) => { const o = document.createElement('option'); o.value = key; o.textContent = TOUR_HS_ICONS[key].label; icoSel.appendChild(o); });
          icoSel.value = k.icon || TOUR_HS_ICON_DEFAULT;
          icoSel.addEventListener('click', (e) => e.stopPropagation());
          icoSel.addEventListener('change', () => { k.icon = icoSel.value; onToursChanged(); rebuildTourHotspotDOM(); refreshTourList(); });
          r2.appendChild(icoSel);

          // Which version(s) this exit appears in — for a hotspot that only makes sense in
          // one render (e.g. "close the curtains", which has no meaning unfurnished).
          // Offered only once the tour actually has two versions somewhere, so a single-render
          // tour's sidebar stays as it was.
          if (tourHasVariants(t)) {
            const vSel = document.createElement('select'); vSel.className = 'ax-tour-hsvar'; vSel.title = 'Show this hotspot in';
            const labs = tourVariantLabels(t);
            [['', 'Both versions'], ['a', `${labs[0]} only`], ['b', `${labs[1]} only`]].forEach(([val, txt]) => {
              const o = document.createElement('option'); o.value = val; o.textContent = txt; vSel.appendChild(o);
            });
            vSel.value = k.variant || '';
            vSel.addEventListener('click', (e) => e.stopPropagation());
            vSel.addEventListener('change', () => { k.variant = normVariantTag(vSel.value); onToursChanged(); rebuildTourHotspotDOM(); });
            r2.appendChild(vSel);
          }

          if (tourHsIcon(k).rotatable) {
            const aim = document.createElement('div'); aim.className = 'ax-tour-hsaim';
            // Quick cardinal presets cover the overwhelmingly common cases (through a
            // doorway ahead / off to one side); the slider is there for the doorway that
            // sits at an awkward angle.
            [['↑', 0], ['→', 90], ['↓', 180], ['←', 270]].forEach(([glyph, deg]) => {
              const b = document.createElement('button');
              b.type = 'button'; b.className = 'ax-tour-hsdir' + (Math.round(normDeg(k.rot)) === deg ? ' is-on' : '');
              b.textContent = glyph; b.title = `Point ${glyph}`;
              b.addEventListener('click', (e) => { e.stopPropagation(); k.rot = deg; onToursChanged(); rebuildTourHotspotDOM(); refreshTourList(); });
              aim.appendChild(b);
            });
            const deg = document.createElement('span'); deg.className = 'ax-tour-hsdeg'; deg.textContent = `${Math.round(normDeg(k.rot))}°`;
            const slider = document.createElement('input');
            slider.type = 'range'; slider.min = '0'; slider.max = '359'; slider.step = '1';
            slider.className = 'ax-tour-hsrot'; slider.value = String(Math.round(normDeg(k.rot)));
            slider.title = 'Fine-tune the angle';
            slider.addEventListener('click', (e) => e.stopPropagation());
            slider.addEventListener('input', () => {
              k.rot = normDeg(+slider.value);
              deg.textContent = `${Math.round(k.rot)}°`;
              // Live-update the marker in the pano without a full rebuild, so dragging the
              // slider feels continuous rather than stepping.
              const live = tourHsDom[tourHsDom.findIndex((h) => h.idx === i)];
              live?.el.querySelector('.tour-hs-ico')?.style.setProperty('--rot', `${k.rot}deg`);
            });
            slider.addEventListener('change', () => { onToursChanged(); refreshTourList(); });
            aim.append(slider, deg);
            r2.appendChild(aim);
          }
          box.appendChild(r2);
        });

        const others = t.nodes.filter((n) => n.id !== state.tourView.nodeId);
        const addRow = document.createElement('div'); addRow.className = 'ax-tour-hsadd';
        if (others.length) {
          const pick = document.createElement('select'); pick.className = 'ax-tour-hsto';
          others.forEach((n) => { const o = document.createElement('option'); o.value = n.id; o.textContent = n.name; pick.appendChild(o); });
          const ab = document.createElement('button'); ab.type = 'button'; ab.className = 'btn btn-ghost'; ab.textContent = '＋ Add hotspot here';
          ab.title = 'Drops a hotspot at the centre of the current view — then drag it into place';
          ab.addEventListener('click', (e) => { e.stopPropagation(); addTourHotspot(pick.value); });
          addRow.append(pick, ab);
        } else {
          const p = document.createElement('p'); p.className = 'ax-tour-hint'; p.textContent = 'Upload at least one more node to link to.';
          addRow.appendChild(p);
        }
        box.appendChild(addRow);

        // Two very differently-weighted actions used to share one identical style (same
        // class, same ghost outline, both starting with an ambiguous glyph — ⌖ reads as
        // a generic crosshair and ✕ reads as DELETE everywhere else in this sidebar,
        // e.g. the node/hotspot × buttons right above it) with nothing to tell them
        // apart at a glance. Now visually distinct: "set start view" is a gold
        // save-flavoured action (🏠, this app's confirm colour), "back to plot map" is a
        // plain, calm exit — a left arrow instead of ✕, so it can't be misread as a
        // destructive action the way a "×" throughout this same panel already means.
        // Each room's own pano has its own arbitrary "lon 0" — a direction picked here ties
        // THAT room's coordinate system to a real-world compass bearing, independent of the
        // main aerial pano's own (separately-set) northDeg. Saved alongside the start view
        // itself since both describe "what does facing this way, right now, mean" — see
        // tourGoTo's per-node state.northDeg calibration, which reads this back on arrival.
        const dvRow = document.createElement('div'); dvRow.className = 'ax-tour-dvrow';
        const dirLbl = document.createElement('span'); dirLbl.className = 'ax-tour-dirlbl'; dirLbl.textContent = 'Compass facing:';
        const dirSel = document.createElement('select'); dirSel.className = 'ax-tour-dirsel';
        dirSel.title = 'Which real-world direction the camera is facing right now — calibrates the compass for this room';
        [['', 'Not set'], ...COMPASS_DIRS.map(([val, label]) => [val, label])]
          .forEach(([val, label]) => { const o = document.createElement('option'); o.value = val; o.textContent = label; dirSel.appendChild(o); });
        dirSel.value = here?.defaultView?.facingDir || '';
        dirSel.addEventListener('click', (e) => e.stopPropagation());
        dvRow.append(dirLbl, dirSel);
        box.appendChild(dvRow);

        const dv = document.createElement('button'); dv.type = 'button'; dv.className = 'btn btn-primary ax-tour-dv';
        dv.textContent = '🏠 Set as this room’s start view';
        dv.title = 'Visitors arriving in this room will face the direction you are looking now, with the compass calibrated to the direction picked above';
        dv.addEventListener('click', (e) => { e.stopPropagation(); setTourNodeDefaultView(dirSel.value); });
        box.appendChild(dv);

        const ex = document.createElement('button'); ex.type = 'button'; ex.className = 'btn btn-ghost ax-tour-exit';
        ex.textContent = '← Back to the plot map';
        ex.title = 'Leaves this room and returns to the plot map — the tour itself is unaffected';
        ex.addEventListener('click', (e) => { e.stopPropagation(); closePanoTour(); refreshTourList(); });
        box.appendChild(ex);

        ed.appendChild(box);
      } else if (t.nodes.length) {
        const open = document.createElement('button'); open.type = 'button'; open.className = 'btn btn-primary ax-tour-openall';
        open.textContent = '▶ Open tour to place hotspots';
        open.addEventListener('click', (e) => { e.stopPropagation(); openClientPanoTour(t.id, t.name); refreshTourList(); });
        ed.appendChild(open);
      }
      li.appendChild(ed);
    }
    els.axTourList.appendChild(li);
  });
}
// ═══ Tour viewer (Phase 1 steps 2–5) ════════════════════════════════════════════════
// Ported from the Phase 0 spike (spike/index.html), rewritten onto this file's own
// conventions rather than the spike's: it reuses `loadPanoTexture` (which already caps to
// the GPU max and — critically — sets flipY=false; the spike's default-flipY bug rendered
// every pano upside down), `dirFromLonLat`/`projectDir` from the landmark path, and the
// existing pano sphere.
//
// D-11: the tour TAKES OVER the main viewer rather than opening a second canvas — the
// pano sphere just swaps textures, so there is one WebGL context and one camera. Plots,
// drape, landmarks and amenities are hidden for the duration and restored on exit.
//
// Texture lifecycle (the 0-A finding): download weight and GPU residency are separate
// problems. ~2 MB/node downloads fine, but an 8192×4096 RGBA texture with mips is ~179 MB,
// so holding a 15-node tour resident (OQ-3) would be ~2.7 GB. Hence a hard LRU cap plus
// one-hop prefetch: walking the tour is instant, and only the resident set is bounded.
// Bumped from 3 (2026-09-16, on request) to give the new cross-tour window below room to
// coexist with same-tour room-neighbor prefetch without immediately evicting each other.
// Deliberately a SMALL bump, not "prefetch everything" — at ~179 MB/node (8K) this is
// already ~895 MB of VRAM headroom, genuinely worth knowing on a lower-end mobile GPU;
// see prefetchNeighbourTours below for why the window itself stays small (3 tours) too.
const TOUR_CACHE_MAX = 5;                                  // nodes kept in VRAM (~895 MB at 8K)
const tourTex = new Map();                                 // nodeKey -> THREE.Texture (insertion order = LRU)
const tourInflight = new Map();
let tourHsDom = [];                                        // [{ el, dir, idx }] projected each frame
let tourFadeMesh = null;
let tourHsDrag = null;

// The variant is part of the cache key: the two renders of one room are different textures
// and must never alias each other in tourTex.
const tourKey = (t, n, v) => `${t.id}/${n.id}/${v || 'a'}`;
const tourVariantLabels = (t) => (Array.isArray(t && t.variantLabels) && t.variantLabels.length === 2)
  ? t.variantLabels : TOUR_VARIANT_LABELS_DEFAULT.slice();
// Does this room actually carry that variant's image?
const nodeHasVariant = (n, v) => !!(v === 'b' ? (n.panoAlt || n.panoAltBlob) : (n.pano || n.panoBlob));
// Which variant this room will ACTUALLY render for a requested one. A room with only the
// furnished render shows it while the visitor is in unfurnished mode — the fallback happens
// here, at render time, and never writes back to tourView.variant, so their choice survives
// walking through a single-variant room and resumes in the next room that has both.
const nodeVariantFor = (n, v) => (nodeHasVariant(n, v) ? v : otherVariant(v));
// True when ANY room in the tour has both, i.e. the toggle is worth showing at all.
const tourHasVariants = (t) => !!t && t.nodes.some((n) => nodeHasVariant(n, 'a') && nodeHasVariant(n, 'b'));
const curTourVariant = () => (state.tourView && state.tourView.variant) || 'a';
const curTourView = () => state.tourView ? state.tours.find((t) => t.id === state.tourView.tourId) : null;
const curTourNode = () => { const t = curTourView(); return t ? t.nodes.find((n) => n.id === state.tourView.nodeId) : null; };

// Node image source: a fresh in-memory blob (admin, pre-export) wins over the committed
// file, exactly like renderSrc does for landmark/amenity renders.
function tourNodeSrc(node, v) {
  if (nodeVariantFor(node, v || 'a') === 'b') {
    if (node.panoAltBlob) { if (!node._urlAlt) node._urlAlt = URL.createObjectURL(node.panoAltBlob); return node._urlAlt; }
    return node.panoAlt ? assetUrl(node.panoAlt, node._ver) : null;
  }
  if (node.panoBlob) { if (!node._url) node._url = URL.createObjectURL(node.panoBlob); return node._url; }
  return node.pano ? assetUrl(node.pano, node._ver) : null;
}
function tourTouch(k) { const v = tourTex.get(k); if (v) { tourTex.delete(k); tourTex.set(k, v); } }
function tourEvict() {
  const keep = state.tourView ? `${state.tourView.tourId}/${state.tourView.nodeId}/${curTourVariant()}` : null;
  while (tourTex.size > TOUR_CACHE_MAX) {
    const [k, tex] = tourTex.entries().next().value;
    if (k === keep) { tourTouch(k); break; }                // never evict what is on screen
    tex.dispose(); tourTex.delete(k);
  }
}
function loadTourNodeTex(tour, node, v) {
  // Key on the variant the room will REALLY show, so a single-variant room resolves to the
  // same cache entry whichever mode the visitor is in, instead of downloading it twice.
  const vv = nodeVariantFor(node, v || 'a');
  const k = tourKey(tour, node, vv);
  if (tourTex.has(k)) { tourTouch(k); return Promise.resolve(tourTex.get(k)); }
  if (tourInflight.has(k)) return tourInflight.get(k);
  const src = tourNodeSrc(node, vv);
  if (!src) return Promise.reject(new Error(`Node “${node.name}” has no panorama image.`));
  const p = loadPanoTexture(src).then((tex) => {
    tourInflight.delete(k); tourTex.set(k, tex); tourEvict(); return tex;
  }).catch((e) => { tourInflight.delete(k); throw e; });
  tourInflight.set(k, p);
  return p;
}
// Prefetch every node one hop away, so the next click is instant. Fire-and-forget.
function prefetchTourNeighbours(tour, nodeId) {
  // Only the variant currently being viewed — warming both would double every tour's
  // download for a toggle the visitor may never touch.
  const v = curTourVariant();
  tour.links.filter((k) => k.from === nodeId).forEach((k) => {
    const n = tour.nodes.find((x) => x.id === k.to);
    if (n) loadTourNodeTex(tour, n, v).catch(() => {});
  });
}
// Cross-TOUR prefetch (2026-09-16, on request): the room-hop prefetch above only ever
// covered ROOMS within the tour already open — stepping from one tour to a wholly
// different one (Mandir -> Gazebo, each its own single-room tour) always started a fresh
// download with nothing warmed up. This mirrors that same "one hop ahead" idea one level
// up, over `state.tours`' own order (the exact order the tour-list picker shows them in,
// so "next"/"previous" here matches what the visitor actually sees): +2 tours ahead, -1
// behind — an explicit, requested asymmetric window, not a general one-hop cache, since
// forward is the direction a visitor walking a tour list actually goes. Only the START
// node of each neighbour tour is warmed (not its own rooms — that's what
// prefetchTourNeighbours does once you're actually inside it), and it shares the SAME
// tourTex LRU as room prefetch (see TOUR_CACHE_MAX above for the VRAM trade-off this
// makes). Fire-and-forget, called once per tour ENTRY/switch (openClientPanoTour) — not
// on every room move within a tour, since the window only depends on which TOUR you're
// in, not which room.
function prefetchNeighbourTours(tourId) {
  const i = state.tours.findIndex((t) => t.id === tourId);
  if (i < 0) return;
  [state.tours[i + 1], state.tours[i + 2], state.tours[i - 1]].filter(Boolean).forEach((t) => {
    if (!t.nodes.length) return;
    const startNode = t.nodes.find((n) => n.id === t.startNode) || t.nodes[0];
    loadTourNodeTex(t, startNode, 'a').catch(() => {});   // a neighbouring tour is always entered fresh, i.e. at variant 'a'
  });
}

// ─── Enter / exit the takeover ──────────────────────────────────────────────
// `anchorRooms` (default true): whether the drawer should drill straight to THIS tour's
// own room list, or stop one level up at the tour list. True for every normal entry point
// (a single-tour project has no tour-list step to stop at; explicitly picking a named
// tour, or a specific room, is a deliberate "go there" that should show its rooms) —
// false ONLY for the multi-tour root VIRTUAL TOUR click's own auto-play (see
// openNodeContent's 'virtualtour' branch), which behaves like clicking any other
// multi-child folder: it shows ITS OWN children (the tour list) one level in, exactly
// like `resolveFolderTarget`'s 'menu' action, while auto-playing the topmost tour so the
// visitor isn't staring at an empty picker — picking a DIFFERENT tour from that list is
// what drills one level deeper into ITS room list.
function openClientPanoTour(tourId, title, { anchorRooms = true } = {}) {
  let tour = state.tours.find((t) => t.id === tourId);
  // Be forgiving about a missing tourId: menu items saved before `cleanNodeForSave` kept
  // the field lost it on every save, and an item that silently does nothing is the worst
  // possible failure. With exactly one tour in the project there is no ambiguity — open
  // it. With several, say plainly what to fix rather than guessing.
  if (!tour && !tourId && state.tours.length === 1) tour = state.tours[0];
  if (!tour) {
    if (!state.tours.length) showNotice('This project has no virtual tours yet. Add one in the admin <strong>Tour</strong> tab.');
    else showNotice('This menu item isn’t pointing at a tour. Edit it in the menu builder and pick one under <strong>360° Tour</strong>.');
    return;
  }
  if (!tour.nodes.length) { showNotice(`“${tour.name}” has no panoramas yet.`); return; }
  if (!three) return;
  // Switching from an ALREADY-OPEN tour straight to this one (Mandir -> Gazebo, say) used
  // to fully exit-then-reenter: closePanoTour restored the aerial pano/texture
  // SYNCHRONOUSLY, then this function tore the plot map back down and waited on the new
  // tour's first texture — a real visible gap, previously papered over with the boot
  // curtain (2026-09-09 fix for "small gap in which some aerial view is shown"). Reported
  // 2026-09-16 as looking like a jarring loading screen rather than a smooth switch —
  // fixed by never touching the aerial pano/texture here at all: keep tour A's last frame
  // on screen, reuse its ORIGINAL saved{} snapshot (the true pre-tour aerial view —
  // re-deriving it from `three.pano.material.map` here would wrongly capture tour A's OWN
  // texture, corrupting "Exit Tour" into landing back in tour A instead of the aerial
  // map), and let tourGoTo's existing crossfade (below, `instant: !switchingTours`)
  // dissolve tour A's frame directly into tour B's first room — the exact mechanism
  // same-tour room navigation already uses, which is why THAT path never showed a loading
  // screen in the first place.
  const priorTourView = state.tourView;
  const switchingTours = !!priorTourView;
  if (switchingTours) {
    if (els.tourLayer) els.tourLayer.innerHTML = '';
    tourHsDom = [];
    state.tourHsSel = null;
  }

  // Every tour is entered at variant 'a'; the visitor's choice persists as they walk THIS
  // tour (tourGoTo keeps it) but does not leak into the next tour they open, whose rooms
  // may label their slots differently.
  state.tourView = { tourId, nodeId: null, title: title || tour.name, busy: false, variant: 'a',
    saved: switchingTours ? priorTourView.saved
      : { view: { ...state.view }, panoMap: three.pano.material.map, northDeg: state.northDeg } };

  // Takeover: everything that belongs to the plot map goes away for the duration.
  state.plots.forEach((p) => { p.group.visible = false; });
  if (three.ground) three.ground.mesh.visible = false;
  if (els.landmarks) els.landmarks.hidden = true;
  if (els.amenities) els.amenities.hidden = true;
  if (els.panel?.classList.contains('open')) closePanel();
  if (els.amCard?.classList.contains('open')) closeAmCard();
  document.body.classList.add('tour-open');
  renderTourVariantBar();
  updateLegendVisibility();   // plot-map controls don't apply inside a tour
  if (els.tourLayer) els.tourLayer.hidden = false;
  // While ANY tour is open — freshly entered from the plot map, or switched to from a
  // different tour — the drawer stays anchored to a tour-related section, not reset to
  // the plot map's root menu. Reopening the drawer mid-tour, or switching from this tour
  // to another, should never unexpectedly drop the visitor back at the root — only
  // actually EXITING the tour (closePanoTour) does that. Rebuilt fresh each time (not
  // reused from whatever pushed it here) so it always reflects the current
  // state.tours/tour.nodes, e.g. if a room was added/renamed since this was last shown.
  // A tour with only one room has nothing to pick between — same "one thing inside is
  // never a choice" rule as an ordinary folder — so its own room-list level is skipped
  // entirely, not just rendered with a single (pointless, already-highlighted) entry.
  const roomChoiceNeeded = anchorRooms && tour.nodes.length > 1;
  if (roomChoiceNeeded) {
    state.menuNavStack = state.tours.length > 1 ? [virtualTourPickerNode(), tourRoomPickerNode(tour)] : [tourRoomPickerNode(tour)];
  } else if (state.tours.length > 1) {
    // Multiple tours but nothing to choose WITHIN this one ⇒ stay at the tour list (still
    // lets the visitor switch tours) rather than drilling one level deeper for no reason.
    state.menuNavStack = [virtualTourPickerNode()];
  } else {
    // The only tour AND only one room in it: no picker level makes sense at all — back to
    // the root menu, which gets its own "Exit Tour" row appended while touring (see
    // renderClientSidebar's root-level branch) so leaving is still always reachable.
    state.menuNavStack = [];
  }
  renderClientSidebar();

  state.view.fov = 75;
  // A fresh entry from the plot map has no prior tour texture to crossfade FROM, so it
  // still hard-cuts straight to the first room (matching the aerial pano's own cut, not
  // fade, entry). Switching tours crossfades instead — see the note above.
  tourGoTo(tour.startNode || tour.nodes[0].id, { instant: !switchingTours });
  prefetchNeighbourTours(tourId);
  renderClientTourMap();   // rebuilt per tour — each tour has its own map + dots
}
function closePanoTour({ silent = false } = {}) {
  const tv = state.tourView; if (!tv) return;
  if (tourFadeMesh) { three.scene.remove(tourFadeMesh); tourFadeMesh.material.dispose(); tourFadeMesh = null; }
  state.tourView = null;

  // Restore the plot map exactly as it was.
  state.plots.forEach((p) => { p.group.visible = true; });
  if (three.ground) three.ground.mesh.visible = true;
  applyLandmarkVisibility(); applyAmenityVisibility();     // restore per each one's own rules
  document.body.classList.remove('tour-open');
  renderTourVariantBar();     // state.tourView is already null → hides the toggle
  updateLegendVisibility();   // back on the plot map (if the menu is at its root)
  if (els.tourLayer) { els.tourLayer.hidden = true; els.tourLayer.innerHTML = ''; }
  renderClientTourMap();   // state.tourView is already null → hides the map and gives the compass its corner back
  tourHsDom = [];
  if (tv.saved?.panoMap) { three.pano.material.map = tv.saved.panoMap; three.pano.material.needsUpdate = true; }
  if (tv.saved?.view) Object.assign(state.view, tv.saved.view);
  if (tv.saved?.northDeg != null) state.northDeg = tv.saved.northDeg;   // restore the aerial's own calibration, not the last room's
  clampView(); requestRender();
  // Drop the tour's textures — the plot map has no use for them and they are the biggest
  // thing in VRAM. The committed background pano is untouched (it is not in this cache).
  tourTex.forEach((tex) => tex.dispose()); tourTex.clear(); tourInflight.clear();
  // Exiting a tour always lands back on the DEFAULT menu (root), on both the admin and
  // client "back/exit" buttons — both call this same function — rather than leaving the
  // drawer wherever it was navigated to before the tour was entered (most commonly the
  // VIRTUAL TOUR picker that was just used to get here).
  state.menuNavStack = [];
  renderClientSidebar();
  if (!silent) setAxStatus('');
}

// ─── Node switching + crossfade ─────────────────────────────────────────────
// The spike's swappable transition interface, reduced to what Phase 1 ships: `cut` and
// `crossfade`. Phase 2's depth glide would slot in here as a third branch (deferred —
// the owner declined both its prerequisites, see VIRTUAL-TOUR.md D-1/OQ-1).
function tourTween(ms, fn) {
  return new Promise((res) => {
    const t0 = performance.now();
    (function step() {
      const t = Math.min(1, (performance.now() - t0) / ms);
      fn(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);   // easeInOutQuad
      t < 1 ? requestAnimationFrame(step) : res();
    })();
  });
}
// The tour crossfade: a second sphere just inside the first, sharing its geometry, fades in
// over the outgoing texture. Geometry is SHARED — dispose only the material. Used BOTH for
// room-to-room moves and for the furnished/unfurnished swap (2026-09-21, on request: the two
// must look identical), so the duration and easing live in exactly one place.
const TOUR_FADE_MS = 460;
async function tourCrossfade(tex) {
  if (!three.pano.material.map) { swapPano(tex); return; }
  tourFadeMesh = new THREE.Mesh(three.pano.geometry, new THREE.MeshBasicMaterial({
    map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  tourFadeMesh.scale.setScalar(0.985); tourFadeMesh.renderOrder = 2;
  three.scene.add(tourFadeMesh);
  await tourTween(TOUR_FADE_MS, (e) => { if (tourFadeMesh) tourFadeMesh.material.opacity = e; });
  if (three.pano.material.map !== tex) { three.pano.material.map = tex; three.pano.material.needsUpdate = true; }
  three.scene.remove(tourFadeMesh); tourFadeMesh.material.dispose(); tourFadeMesh = null;
}
async function tourGoTo(nodeId, { instant = false } = {}) {
  const tv = state.tourView, tour = curTourView();
  if (!tv || !tour || tv.busy) return;
  const node = tour.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  if (node.id === tv.nodeId) return;

  tv.busy = true; refreshTourRoomMenu();
  try {
    const tex = await loadTourNodeTex(tour, node, curTourVariant());
    if (!state.tourView) return;                            // exited while loading

    tv.nodeId = node.id;
    // Compass calibration is a per-ROOM constant (each pano has its own arbitrary "lon 0",
    // unrelated to the main aerial pano's own northDeg) — set from the direction picked
    // alongside this node's start view (see setTourNodeDefaultView), independent of the
    // live camera yaw below, and reapplied on every arrival (walking a tour or jumping in
    // fresh), not just on an instant entry. Uncalibrated rooms fall back to 0, matching the
    // project's documented "uncalibrated ⇒ 0" default rather than leaking in whatever
    // northDeg happened to be set for the aerial view or a previous room.
    const dirDeg = COMPASS_DIR_DEG[node.defaultView.facingDir];
    state.northDeg = (dirDeg != null) ? (-(node.defaultView.lon || 0) - dirDeg) : 0;
    // Every arrival snaps to the room's own saved start view (2026-09-11, explicit
    // request) — hotspot clicks, the room-strip thumbnails, and the admin's node list all
    // funnel through here with instant=false, so this used to only ever apply on a fresh
    // instant entry ("heading continuity": the visitor's facing direction carried over
    // unchanged when walking, so stepping through a doorway never spun the camera under
    // them). That carry-over is intentionally gone — every room, however you arrive, faces
    // the direction its admin picked. `state.view.lon` is a CAMERA yaw (see the
    // two-lon-conventions note above `computeHome`), which is the convention defaultView
    // stores.
    // IMPORTANT: this runs BEFORE the texture swap/crossfade below, not after. Snapping
    // the camera only once the fade had already finished (the original 2026-09-11 order)
    // meant the entire crossfade played out at the visitor's OLD look direction and then
    // hard-cut to the new one right at the end — reported the same day as "shows a camera
    // angle and then cuts... not smooth." Setting the view first means the crossfade (or
    // hard swap) plays out at one STABLE angle throughout — a single clean cut followed by
    // a smooth fade, not a smooth fade followed by a jarring cut.
    state.view.lon = (node.defaultView.lon || 0) * Math.PI / 180;
    state.view.lat = (node.defaultView.lat || 0) * Math.PI / 180;
    state.view.fov = node.defaultView.fov || 75;
    clampView();

    if (instant) swapPano(tex);
    else await tourCrossfade(tex);

    tourTouch(tourKey(tour, node, nodeVariantFor(node, curTourVariant()))); tourEvict();
    prefetchTourNeighbours(tour, node.id);
    state.tourHsSel = null;
    rebuildTourHotspotDOM(); refreshTourRoomMenu(); updateTourMapActive(); renderTourVariantBar(); requestRender();
    if (state.admin && state.adminTab === 'tour') refreshTourList();   // hotspot box follows the open node
  } catch (e) {
    showNotice(e.message || 'Could not load that panorama.');
  } finally {
    // The bar is refreshed HERE as well as on the success path: if anything above threw,
    // a stale available/unavailable state would otherwise carry into the new room.
    if (state.tourView) { state.tourView.busy = false; refreshTourRoomMenu(); renderTourVariantBar(); }
  }
}

// ─── Navigation hotspots (DOM overlay, projected each frame) ────────────────
// Same model as landmarks: anchored to a fixed sphere DIRECTION and projected to screen
// every frame, so a hotspot stays glued to its doorway as the visitor looks around.
// Stored lon/lat use the `lonLatFromDir`/`dirFromLonLat` convention (NOT the camera-yaw
// one) — placement round-trips through the same reflection, so it stays self-consistent.
function rebuildTourHotspotDOM() {
  if (!els.tourLayer) return;
  const tv = state.tourView, tour = curTourView();
  els.tourLayer.innerHTML = ''; tourHsDom = [];
  if (!tv || !tour) return;
  // A variant-tagged link only draws in its own variant — e.g. a "close the curtains"
  // hotspot that means nothing in the unfurnished render. Admin sees every hotspot
  // regardless, or a link tagged to the variant they aren't previewing would be
  // unselectable and look deleted.
  const liveVariant = curTourVariant();
  tour.links.forEach((k, idx) => {
    if (k.from !== tv.nodeId) return;
    if (!state.admin && k.variant && k.variant !== liveVariant) return;
    const target = tour.nodes.find((n) => n.id === k.to); if (!target) return;
    const ico = tourHsIcon(k);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `tour-hs tour-hs--${k.icon || TOUR_HS_ICON_DEFAULT}` + (ico.floor ? ' is-floor' : '') + (state.admin && state.tourHsSel === idx ? ' is-sel' : '');
    // The rotation rides on an inner wrapper, never on .tour-hs itself — renderTourHotspots
    // writes left/top on that element every frame and a transform here would be a fight
    // waiting to happen. The inner-inner span is what animates, so its motion happens in
    // the already-tilted/rotated space (i.e. an arrow bounces ALONG the way it points).
    el.innerHTML = `<span class="tour-hs-ico"><span class="tour-hs-ico-in">${ico.svg}</span></span><span class="tour-hs-lbl"></span>`;
    if (ico.rotatable) el.querySelector('.tour-hs-ico').style.setProperty('--rot', `${normDeg(k.rot)}deg`);
    el.querySelector('.tour-hs-lbl').textContent = k.label || target.name;
    el.title = state.admin ? `Link → ${target.name} (drag to reposition)` : `Go to ${target.name}`;
    if (state.admin && state.adminTab === 'tour') {
      el.addEventListener('pointerdown', (e) => startTourHsDrag(e, idx));
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.admin && state.adminTab === 'tour') { if (!tourHsDrag?.moved) { state.tourHsSel = idx; refreshTourList(); rebuildTourHotspotDOM(); } return; }
      tourGoTo(k.to);
    });
    els.tourLayer.appendChild(el);
    tourHsDom.push({ el, dir: dirFromLonLat(k.hotspot.lon, k.hotspot.lat), idx });
  });
  renderTourHotspots();
}
function renderTourHotspots() {
  if (!tourHsDom.length || !three) return;
  const rect = els.pano.getBoundingClientRect(), W = rect.width, H = rect.height, cam = three.camera;
  tourHsDom.forEach((h) => {
    const p = projectDir(h.dir, cam, W, H);
    if (!p) { h.el.style.display = 'none'; return; }
    h.el.style.display = '';
    h.el.style.left = `${p.x}px`; h.el.style.top = `${p.y}px`;
  });
}
function startTourHsDrag(e, idx) {
  if (!(state.admin && state.adminTab === 'tour')) return;
  e.preventDefault(); e.stopPropagation();                 // stops #pano's pointer capture
  tourHsDrag = { idx, moved: false }; state.tourHsSel = idx;
  window.addEventListener('pointermove', onTourHsDragMove);
  window.addEventListener('pointerup', endTourHsDrag, { once: true });
}
function onTourHsDragMove(e) {
  if (!tourHsDrag || !three) return;
  const tour = curTourView(); if (!tour) return;
  const k = tour.links[tourHsDrag.idx]; if (!k) return;
  three.raycaster.setFromCamera(ndcOf(e), three.camera);
  k.hotspot = lonLatFromDir(three.raycaster.ray.direction);
  tourHsDrag.moved = true;
  rebuildTourHotspotDOM();
}
function endTourHsDrag() {
  window.removeEventListener('pointermove', onTourHsDragMove);
  if (tourHsDrag?.moved) onToursChanged();
  const moved = tourHsDrag?.moved;
  tourHsDrag = null;
  if (moved) refreshTourList();
}

// ─── Admin authoring inside the viewer (Phase 1 step 3) ─────────────────────
function addTourHotspot(targetId) {
  const tour = curTourView(), tv = state.tourView; if (!tour || !tv) return;
  const target = tour.nodes.find((n) => n.id === targetId); if (!target) return;
  // Drop it where the admin is looking. `dirFromView` is the camera→stored-lon bridge:
  // the camera's forward direction, converted with the STORED convention.
  const fwd = new THREE.Vector3(); three.camera.getWorldDirection(fwd);
  tour.links.push({ from: tv.nodeId, to: targetId, label: '', hotspot: lonLatFromDir(fwd), icon: TOUR_HS_ICON_DEFAULT, rot: 0 });
  state.tourHsSel = tour.links.length - 1;
  rebuildTourHotspotDOM(); refreshTourList(); onToursChanged();
  setAxStatus(`Hotspot → <strong>${esc(target.name)}</strong> added. Drag it onto the doorway it leads through.`);
}
function deleteTourHotspot(idx) {
  const tour = curTourView(); if (!tour) return;
  tour.links.splice(idx, 1);
  if (state.tourHsSel === idx) state.tourHsSel = null;
  rebuildTourHotspotDOM(); refreshTourList(); onToursChanged();
}
function setTourNodeDefaultView(facingDir) {
  const node = curTourNode(); if (!node) return;
  node.defaultView = { lon: state.view.lon * 180 / Math.PI, lat: state.view.lat * 180 / Math.PI, fov: state.view.fov,
    facingDir: facingDir || null };
  onToursChanged(); refreshTourList();
  const dirNote = facingDir ? ` (compass set to ${COMPASS_DIR_LABEL[facingDir]})` : '';
  setAxStatus(`Start view saved for <strong>${esc(node.name)}</strong> — visitors arrive facing this way${dirNote}.`);
}

// ─── Viewer chrome (room/tour menu active/busy indication) ──────────────────
// The room list (and, for a tour with only one room, the tour list one level up instead —
// see openClientPanoTour) lives in the drawer now, rendered generically by
// renderClientSidebar — this just keeps whichever one is on screen in sync with what's
// actually live and whether a jump is in flight, mirroring what the old floating
// `#tourBar` did for its own chips. Only touches the DOM if a tour-related submenu
// happens to be what's on screen; harmlessly no-ops otherwise (visitor could have the
// drawer showing something else entirely — LANDMARKS, a folder, or the root+Exit-row
// case where there's no submenu at all).
function refreshTourRoomMenu() {
  const tv = state.tourView; if (!tv) return;
  const container = $('catSubMenuNav'); if (!container) return;
  container.classList.toggle('is-busy', !!tv.busy);
  const activeRoomId = `panotourroom-${tv.tourId}-${tv.nodeId}`;
  const activeTourId = `virtualtour-${tv.tourId}`;
  container.querySelectorAll('.cat-btn[data-node-id]').forEach((btn) => {
    const id = btn.dataset.nodeId;
    btn.classList.toggle('is-active', id === activeRoomId || id === activeTourId);
  });
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

// ─── Custom Menu Setup & Client Integration (Tree-Based Menu Builder) ─────────

function findNodeInfo(id, list = getMenuTree(), parent = null, depth = 1) {
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node.id === id) {
      return { node, parent, index: i, list, depth };
    }
    if (node.kind === 'parent' && Array.isArray(node.children)) {
      const found = findNodeInfo(id, node.children, node, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function hasContactNodeInTree(list = getMenuTree()) {
  for (const node of list) {
    if (node.kind === 'contact') return true;
    if (node.kind === 'parent' && Array.isArray(node.children)) {
      if (hasContactNodeInTree(node.children)) return true;
    }
  }
  return false;
}

function getValidParentFolders(excludeId = null, list = getMenuTree(), depth = 1, prefix = '') {
  let options = [];
  if (depth >= 3) return options; // Cannot nest children under Level 3
  for (const node of list) {
    if (node.kind === 'parent') {
      if (excludeId && (node.id === excludeId)) continue;
      const label = prefix ? `${prefix} › ${node.title}` : node.title;
      options.push({ id: node.id, label, depth });
      if (Array.isArray(node.children) && depth < 2) {
        options = options.concat(getValidParentFolders(excludeId, node.children, depth + 1, label));
      }
    }
  }
  return options;
}

function addNode(parentId, nodeData) {
  const tree = getMenuTree();
  const newNode = Object.assign({ id: nodeData.id || `node_${Date.now()}_${Math.floor(Math.random()*1000)}` }, nodeData);
  
  let targetList = tree;
  if (parentId && parentId !== 'root') {
    const info = findNodeInfo(parentId);
    if (info && info.node && info.node.kind === 'parent') {
      info.node.children = info.node.children || [];
      targetList = info.node.children;
    }
  }

  // Deduplication check: prevent duplicate node ID or matching title+kind+content within the same parent
  const isDuplicate = targetList.some((existing) => {
    if (existing.id === newNode.id) return true;
    if (existing.kind === newNode.kind && existing.title === newNode.title) {
      if (newNode.kind === 'child' && existing.content && newNode.content) {
        return (existing.content.url && existing.content.url === newNode.content.url) ||
               (existing.content.fileName && existing.content.fileName === newNode.content.fileName);
      }
      if (newNode.kind === 'parent') return true;
    }
    return false;
  });

  if (isDuplicate) {
    console.warn('[MenuBuilder] Blocked duplicate node addition:', newNode.title);
    return null;
  }

  targetList.push(newNode);
  state.menuConfig.tree = tree;
  return newNode;
}

function updateNode(nodeId, nodeData, targetParentId = undefined) {
  const info = findNodeInfo(nodeId);
  if (!info) return null;
  const currentParentId = info.parent ? info.parent.id : 'root';
  const updatedNode = Object.assign({}, info.node, nodeData);

  if (targetParentId !== undefined && targetParentId !== currentParentId) {
    // Moved to a different parent
    info.list.splice(info.index, 1);
    addNode(targetParentId, updatedNode);
  } else {
    info.list[info.index] = updatedNode;
  }
  return updatedNode;
}

function deleteNode(nodeId) {
  const info = findNodeInfo(nodeId);
  if (!info) return false;
  info.list.splice(info.index, 1);
  return true;
}

function moveNode(nodeId, direction) {
  const info = findNodeInfo(nodeId);
  if (!info) return false;
  const { list, index } = info;
  if (direction === 'up' && index > 0) {
    const temp = list[index - 1];
    list[index - 1] = list[index];
    list[index] = temp;
    return true;
  } else if (direction === 'down' && index < list.length - 1) {
    const temp = list[index + 1];
    list[index + 1] = list[index];
    list[index] = temp;
    return true;
  }
  return false;
}

// ─── Client Sidebar Dynamic Rendering (Recursive Stack Navigation) ────────────

// ─── What a folder click should actually DO ──────────────────────────────────
// A folder is a navigation aid, not content. Drilling into one that presents no actual
// choice costs a tap and shows a screen with nothing to decide. Both shapes below came
// from a real project (2026-09-04):
//   • three folders holding a single video / PDF each — two taps to play one video, with
//     a one-row submenu in between;
//   • a "gallery" folder holding 25 image nodes titled GALLERY 1..25 — 25 near-identical
//     labels, every one of which lands in the SAME scrolling viewer, because
//     openClientFolderImageModal already gathers every image sibling regardless of which
//     one you picked. The list was pure friction.
// Returns { action, node }:
//   'open'   → open that node's content directly (node is the content child)
//   'images' → open the image viewer at node (the folder's FIRST image; prev/next does the rest)
//   'menu'   → render node's children as a submenu — there's a genuine choice here
//   'empty'  → nothing inside
const MENU_SKIP_MAX_HOPS = 8;
function resolveFolderTarget(node) {
  const seen = new Set();
  let cur = node;
  for (let hop = 0; cur && hop < MENU_SKIP_MAX_HOPS; hop++) {
    if (cur.kind !== 'parent') return { action: 'open', node: cur };
    // A hand-edited or round-tripped tree could point a folder back at an ancestor;
    // walking that would spin here inside a click handler. Bail to the plain list.
    if (seen.has(cur.id)) return { action: 'menu', node: cur };
    seen.add(cur.id);

    const kids = Array.isArray(cur.children) ? cur.children : [];
    if (!kids.length) return { action: 'empty', node: cur };

    // One thing inside is never a choice — keep skipping, however deep it nests.
    if (kids.length === 1) { cur = kids[0]; continue; }

    // A folder of nothing but images IS the gallery. Open it at the first image and let
    // the viewer carry the visitor through the rest — which is all the submenu was doing,
    // one manual pick at a time. A single sub-folder or a mixed folder is a real choice
    // and keeps its list.
    if (kids.every((k) => k && k.kind === 'child' && k.contentType === 'image')) {
      return { action: 'images', node: kids[0] };
    }
    return { action: 'menu', node: cur };
  }
  return { action: 'menu', node };
}

// Should this row advertise a submenu? Only if clicking it actually opens one — a folder
// that jumps straight to content must not wear a "there's more inside" arrow.
function menuRowOpensSubmenu(node) {
  return !!node && node.kind === 'parent' && resolveFolderTarget(node).action === 'menu';
}

// The single "visitor clicked a menu row" entry point, shared by the root list and the
// submenu list so the two can't drift apart.
function activateMenuNode(node, { fromRoot = false, autoOpen = false } = {}) {
  if (!node) return;
  const target = resolveFolderTarget(node);

  if (target.action === 'menu') {
    // `target.node` is the folder actually worth showing, which may be several levels
    // below the one clicked. Pushing just that keeps Back honest: it returns the visitor
    // to where they came from, not through the levels that were skipped for them.
    if (fromRoot) state.menuNavStack = [target.node];
    else state.menuNavStack.push(target.node);
    renderClientSidebar();
    return;
  }
  if (target.action === 'empty') {
    showNotice(`<strong>${esc((node.title || 'This section').trim())}</strong> has no content in it yet.`);
    return;
  }
  const info = findNodeInfo(target.node.id);
  if (target.action === 'images') { collapseClientDrawer(); openClientFolderImageModal(target.node, info); }
  else openNodeContent(target.node, info, { autoOpen });
}

function renderClientSidebar() {
  const tree = getMenuTree();
  const stack = state.menuNavStack || [];

  if (stack.length === 0) {
    // Level 1: Root Navigation
    if (els.catLevel1) els.catLevel1.hidden = false;
    if (els.catLevelSubMenu) els.catLevelSubMenu.hidden = true;
    if (els.catLevel2) els.catLevel2.hidden = true;
    updateLegendVisibility();

    if (!els.catNavL1) return;
    // AERIAL VIEW and LANDMARKS are ordinary tree nodes now (`node.builtin`, see
    // ensureBuiltinNodes) — they render in whatever position the admin has dragged them
    // to, via the exact same generic path as an authored item (openNodeContent already
    // dispatches on contentType 'aerial'/'landmarks'). The only thing special about them
    // here is `enabled` — an authored node has no such flag and is always shown, but a
    // builtin's ON/OFF switch can hide it from the client without deleting it.
    //
    // Whenever the root menu is what's on screen (this branch), the pano behind it IS the
    // plain aerial view — every other content type either opens a modal on top of it
    // (video/pdf/gallery/link) or drills into its own picker level (LANDMARKS' `#catLevel2`,
    // a submenu's `menuNavStack` level), neither of which leaves the root list visible. The
    // one exception is an open tour (`state.tourView`), which really does replace the pano
    // with a tour room while still showing the root list (single-tour/room case — see the
    // `withExitTourRow`-less `+= EXIT TOUR` append below). So AERIAL VIEW is the one row
    // that's ever marked active here, and only when no tour has taken the view over —
    // reported 2026-09-17: backing out of Landmarks landed the visitor back on the aerial
    // pano with nothing in the menu showing that's where they were.
    const activeAerialId = !state.tourView
      ? tree.find((n) => n.contentType === 'aerial' && n.enabled !== false)?.id
      : null;
    const html = tree
      // The VIRTUAL TOUR row itself is pointless while already inside one — reported
      // 2026-09-18 from the single-tour/single-room case (the one scenario where the root
      // list stays visible alongside "✕ EXIT TOUR", per the comment above): tapping it
      // again would just re-open the same tour from the same room. `node.builtin==='tour'`
      // is the one stable way to identify it regardless of what it's been renamed to.
      .filter((node) => node.enabled !== false && !(state.tourView && node.builtin === 'tour'))
      .map((node) => {
        // The MENU IMAGE builtin renders as a picture in the list, not a row — nothing to tap.
        // With no image uploaded yet it renders NOTHING rather than an empty frame, so a
        // switched-on-but-unfilled item is invisible to the visitor instead of a broken box.
        if (isMenuImageNode(node)) {
          const src = menuImageSrc(node);
          return src ? `<div class="cat-menu-img"><img src="${esc(src)}" alt="${esc((node.title || '').trim())}" /></div>` : '';
        }
        const title = (node.title || 'ITEM').trim().toUpperCase();
        const drills = menuRowOpensSubmenu(node);
        const arrow = drills ? ' <span class="cat-btn-arrow">›</span>' : '';
        const activeCls = node.id === activeAerialId ? ' is-active' : '';
        return `<button class="cat-btn ${drills ? 'cat-btn-sub' : ''}${activeCls}" type="button" data-node-id="${esc(node.id)}">${esc(title)}${arrow}</button>`;
      }).join('')
      // A single-tour, single-room project has nowhere else to put an exit — see
      // openClientPanoTour's `state.menuNavStack = []` case — so it's appended straight
      // onto the root list itself, the one level that's always shown.
      + (state.tourView ? `<button class="cat-btn" type="button" data-node-id="__exit_tour__">✕ EXIT TOUR</button>` : '');

    els.catNavL1.innerHTML = html;
    // Nothing to show at all (every item disabled, or nothing authored) ⇒ no drawer,
    // rather than an empty panel over the panorama — UNLESS a tour is open, in which case
    // the Exit Tour row above is the only thing on screen and must stay reachable.
    if (els.catDrawer && !state.admin) els.catDrawer.hidden = !state.tourView && !tree.some((node) => node.enabled !== false);
    wireClientSidebarButtons();
    addKeepMenuToggle(els.catNavL1, els.catNavL1.querySelectorAll('.cat-btn').length);
  } else {
    // Level 2 / Level 3: Drilled-in Parent Navigation
    if (els.catLevel1) els.catLevel1.hidden = true;
    if (els.catLevel2) els.catLevel2.hidden = true;
    if (els.catLevelSubMenu) els.catLevelSubMenu.hidden = false;
    updateLegendVisibility();

    const currentParent = stack[stack.length - 1];
    const container = $('catSubMenuNav');
    // The submenu heading (repeating the folder's own name back at the visitor — "GALLERY"
    // atop the gallery list, "VIRTUAL TOUR" atop the tour picker) was dropped 2026-09-18 on
    // request, across every folder: they've just tapped that exact row, so the name is
    // still fresh on screen and the heading read as redundant. `hidden`, not emptied text —
    // `.cat-drawer-head` is `justify-content: space-between` between this and the back
    // button, and hiding it removes it from that flex layout entirely rather than leaving a
    // zero-width span the back button has to share the row with for no reason.
    const titleEl = $('catSubMenuTitle');
    if (titleEl) titleEl.hidden = true;

    if (!container) return;
    // Same exclusion as the root list, for a folder the admin has dragged the builtin
    // VIRTUAL TOUR row into — it shouldn't turn up as a re-openable item inside a
    // submenu while already touring either.
    const children = (Array.isArray(currentParent.children) ? currentParent.children : [])
      .filter((node) => !(state.tourView && node.builtin === 'tour'));

    if (!children.length) {
      container.innerHTML = `<p style="padding:14px; font-size:12px; color:var(--text-mute);">No items inside this category.</p>`;
      return;
    }

    container.innerHTML = children.map((node) => {
      // Same as the root list — an image dragged into a folder draws itself there too.
      if (isMenuImageNode(node)) {
        if (node.enabled === false) return '';
        const src = menuImageSrc(node);
        return src ? `<div class="cat-menu-img"><img src="${esc(src)}" alt="${esc((node.title || '').trim())}" /></div>` : '';
      }
      const title = (node.title || 'ITEM').trim().toUpperCase();
      const drills = menuRowOpensSubmenu(node);
      const arrow = drills ? ' <span class="cat-btn-arrow">›</span>' : '';
      return `<button class="cat-btn ${drills ? 'cat-btn-sub' : ''}" type="button" data-node-id="${esc(node.id)}">${esc(title)}${arrow}</button>`;
    }).join('');

    container.querySelectorAll('.cat-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nodeId = btn.dataset.nodeId;
        const nodeInfo = findNodeInfo(nodeId);
        if (nodeInfo) { activateMenuNode(nodeInfo.node); return; }
        // Not every pushed "parent" is a real authored folder — the built-in VIRTUAL TOUR
        // row (see openNodeContent's 'virtualtour' branch) pushes a SYNTHETIC parent
        // whose children are generated on the fly from state.tours, so they were never
        // part of menuConfig.tree and findNodeInfo can't find them there. Fall back to
        // the children array that's actually on screen.
        const synthetic = children.find((c) => c.id === nodeId);
        if (synthetic) activateMenuNode(synthetic);
      });
    });
    addKeepMenuToggle(container, children.length);
  }
}

// Whatever renders as the very FIRST ENABLED row of the client menu — a builtin
// (AERIAL VIEW/LANDMARKS) or an authored item, in whatever order the admin has actually
// dragged them into, since builtins became ordinary movable tree nodes (2026-09-09) — is
// the visitor's "default screen": it opens exactly as if they had tapped it. Client-only
// (admin has its own sidebar and never sees this menu at all).
//
// Split into a decide step (this function) and a fire step (fireAutoOpen, below) because
// firing it required different data depending on the target, and waiting for ALL of it
// (landmarks + amenities + tours + the project-bar probe) before switching away from the
// pano's default boot view made the default screen visibly flash the wrong thing first,
// then jump — reported 2026-09-09. Each of the three fire call sites in init() now runs
// the instant its OWN prerequisite is ready instead of all waiting for the last one:
// a plain content item or a folder drill needs nothing but the menu tree (fires before
// the pano even starts loading), the landmarks picker needs `state.landmarks` (fires
// right after setLandmarks), and a `panotour` item needs `state.tours` (fires right after
// setTours). Decided ONCE, early, so the two loading branches (landmarks/tours) know
// whether they're the one that should act without re-deriving the menu logic each time.
function computeAutoOpenTarget() {
  if (state.admin) return null;
  // A disabled builtin doesn't count as "on top" — the next enabled item does. Authored
  // nodes have no `enabled` field at all and are always considered.
  // A MENU IMAGE is not a destination — it draws itself into the menu and cannot be tapped,
  // so it must never be picked as the default screen just for sitting at the top.
  const top = getMenuTree().find((n) => n.enabled !== false && !isMenuImageNode(n));
  if (!top) return null;
  const resolved = resolveFolderTarget(top);
  // AERIAL VIEW has no content of its own to "open" — clicking it resets the camera to a
  // computed full-site overview. Firing that same reset on every load would FIGHT the
  // admin's saved WYSIWYG opening shot (a deliberately preserved, heavily-relied-on
  // contract — see "Client reproduces the saved view" in the architecture notes). The
  // boot view already IS the intended default screen whenever aerial ends up on top, so
  // there's nothing extra to do — this is the one content type that stays a permanent
  // no-op here regardless of position.
  if (resolved.action === 'open' && resolved.node.contentType === 'aerial') return null;
  const needsLandmarks = resolved.action === 'open' && resolved.node.contentType === 'landmarks';
  // Both an authored 'panotour' item and the built-in 'virtualtour' row read state.tours
  // (both dispatch to openClientPanoTour — see its 'virtualtour' branch in openNodeContent),
  // so both need to wait for the same fire point.
  const needsTours = resolved.action === 'open' && (resolved.node.contentType === 'panotour' || resolved.node.contentType === 'virtualtour');
  return { kind: needsLandmarks ? 'landmarks' : (needsTours ? 'panotour' : 'node'), node: top };
}
// Fires a target from computeAutoOpenTarget. `activateMenuNode` already dispatches on
// contentType via openNodeContent (including 'landmarks' → openLandmarksCategoryPicker),
// so every non-null target fires through the exact same single path a real tap uses —
// nothing here can drift from what clicking the row actually does. `target.kind` only
// ever mattered for WHEN to call this (see the three call sites in init()), not HOW.
function fireAutoOpen(target) {
  if (!target) return;
  // autoOpen:true marks this as the "no real click behind it" case — the one thing that
  // currently reads it is openClientVideoModal, which starts muted so the browser's
  // autoplay policy doesn't silently block it (see its own comment).
  activateMenuNode(target.node, { fromRoot: true, autoOpen: true });
}

// Reveals the pano/UI behind #bootCurtain (see index.html + styles.css). Idempotent —
// safe to call more than once (e.g. the end-of-boot safety-net call after a specific
// target already hid it earlier). Retiming autoOpenTarget's THREE fire points to be as
// early as each one's own data allowed (2026-09-09) still wasn't enough on its own: the
// pano itself renders the instant its texture decodes, so between THAT and whichever fire
// point actually applies, the visitor briefly saw the untouched default view before the
// switch — reported twice as "aerial shows first, then jumps." The curtain is what
// actually fixes it: nothing is shown at all until the fire point for the CONFIGURED
// target has already run, so there is nothing to see "switch" — the first frame the
// visitor sees is already correct.
let bootProgressDone = false;
function hideBootCurtain() {
  if (!bootProgressDone) {
    bootProgressDone = true;
    setBootProgress(100);
    if (els.bootProgressWrap) els.bootProgressWrap.hidden = true;
  }
  els.bootCurtain?.classList.add('is-hidden');
}
// showBootCurtain() (its former re-show counterpart) was removed 2026-09-16 — it existed
// only to paper over tour-to-tour switching's old exit-then-reenter flash with a loading
// screen; that path now crossfades directly between tours instead (see
// openClientPanoTour), so nothing re-shows this curtain after boot any more.

function wireClientSidebarButtons() {
  if (!els.catNavL1) return;
  const touch = () => { state.lastUserTouch = Date.now(); };

  els.catNavL1.querySelectorAll('.cat-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      touch();
      const nodeId = btn.dataset.nodeId;
      if (!nodeId) return;
      // The one synthetic row that can appear at ROOT level (see renderClientSidebar) —
      // a single-tour, single-room project has no picker level to carry it otherwise.
      if (nodeId === '__exit_tour__') { closePanoTour(); return; }
      const nodeInfo = findNodeInfo(nodeId);
      if (!nodeInfo) return;
      // AERIAL VIEW / LANDMARKS are ordinary nodes now — activateMenuNode's own dispatch
      // (via openNodeContent) already handles their contentType, same as any other item.
      activateMenuNode(nodeInfo.node, { fromRoot: true });
    });
  });
}

function openNodeContent(node, nodeInfo = null, { autoOpen = false } = {}) {
  if (!node) return;
  if (!nodeInfo) nodeInfo = findNodeInfo(node.id);
  if (node.kind === 'contact') {
    collapseClientDrawer();
    openClientContactModal(node.contact || {});
    return;
  }
  if (node.kind === 'child') {
    const cType = node.contentType || 'link';
    const content = node.content || {};
    // Collapse for anything that actually shows the visitor real content — a modal, a
    // tour room/tour switch, or the full aerial view. The two exceptions are 'landmarks'
    // and 'virtualtour': both open a PICKER LIST the visitor still needs to choose from
    // (openLandmarksCategoryPicker explicitly re-opens the drawer itself just below;
    // 'virtualtour' relies on the drawer staying open to show its tour list), so
    // collapsing here would hide the very list they need next.
    if (cType !== 'landmarks' && cType !== 'virtualtour') collapseClientDrawer();

    if (cType === 'video') {
      openClientVideoModal(node.title || 'Video Player', content, { autoOpen });
    } else if (cType === 'pdf') {
      openClientBrochureModal(content);
    } else if (cType === 'gallery') {
      openClientGalleryModal(content, 0);
    } else if (cType === 'landmarks') {
      // Neither this nor 'aerial' below knew anything about a tour being open — clicking
      // either while touring left the ROOM's pano showing and either force-unhid the
      // landmark banners on top of it (this branch, via applyLandmarkVisibility inside
      // openLandmarksCategoryPicker) or panned the camera around inside the room using
      // plot-map geometry (the 'aerial' branch) — neither ever restored the actual plot
      // map. closePanoTour() first (only if a tour is actually open) so both act on the
      // REAL aerial pano, exactly like exiting the tour manually then clicking the same
      // button would.
      if (state.tourView) closePanoTour();
      openLandmarksCategoryPicker();          // was the hardcoded LANDMARKS drawer row
    } else if (cType === 'aerial') {
      if (state.tourView) closePanoTour();
      state.landmarkPanRange = null;          // leaving a category — release its arc
      computeHome();                          // still used for its pitch/FOV (nadir, max zoom out)
      animateCameraTo(northFacingLon(), state.home.lat, FOV_MAX);   // but face NORTH, not the layout centroid
      state.autoPan = true;
    } else if (cType === 'panotour') {
      // Our own multi-node walkthrough (takes over the viewer). Distinct from 'tour',
      // which iframes an EXTERNAL tour (3DVista/Kuula) by URL or uploaded file, AND from
      // 'virtualtour' below (an AUTHORED item always points at one specific tour by id;
      // the built-in row auto-discovers whichever tours currently exist).
      openClientPanoTour(content.tourId, node.title || 'Virtual Tour');
    } else if (cType === 'panotourroom') {
      // A room row inside the drawer's tour-room picker (see tourRoomPickerNode) — the
      // per-room analogue of clicking a specific landmark. Already in this exact tour ⇒
      // just walk to the room; otherwise open the tour fresh, then jump to the room the
      // visitor actually clicked (openClientPanoTour on its own would only land on the
      // tour's designated START node).
      if (state.tourView && state.tourView.tourId === content.tourId) {
        tourGoTo(content.nodeId);
      } else {
        const t = state.tours.find((x) => x.id === content.tourId);
        if (!t) { showNotice('This tour no longer exists.'); return; }
        openClientPanoTour(t.id, t.name);
        if (t.startNode !== content.nodeId) setTimeout(() => tourGoTo(content.nodeId), 0);
      }
    } else if (cType === 'menuimage') {
      // Drawn into the menu, never opened — see renderClientSidebar. Nothing to do.
    } else if (cType === 'exittour') {
      closePanoTour();
    } else if (cType === 'virtualtour') {
      // Built-in row (see ensureBuiltinNodes) — the client-side analogue of LANDMARKS'
      // category picker, but for state.tours: no tours ⇒ a plain notice; exactly one ⇒
      // open it directly (nothing to pick from, straight to its room list); two or more ⇒
      // behaves like any other multi-child folder — shows its own children (the tour
      // list) one level in — while ALSO auto-playing the topmost tour (state.tours[0], the
      // admin's own ordering) so the visitor sees something immediately, same as LANDMARKS
      // showing "ALL LANDMARKS" the instant its category list appears. Picking a different
      // tour from that list is what drills one level deeper into ITS OWN room list.
      if (!state.tours.length) {
        showNotice('This project has no virtual tours yet. Add one in the admin <strong>Tour</strong> tab.');
      } else if (state.tours.length === 1) {
        openClientPanoTour(state.tours[0].id, state.tours[0].name);
      } else {
        openClientPanoTour(state.tours[0].id, state.tours[0].name, { anchorRooms: false });
      }
    } else if (cType === 'tour') {
      openClientTourModal(node.title || 'Virtual Tour', content);
    } else if (cType === 'image') {
      openClientFolderImageModal(node, nodeInfo);
    } else if (cType === 'link') {
      const url = content.url || '';
      if (url) {
        window.open(url, '_blank');
      } else {
        showNotice(`No web link configured for "${node.title}".`);
      }
    }
  }
}

// ─── Viewer Dispatchers ───────────────────────────────────────────────────────

// In a standalone offline export, content resolved to a raw external URL (as opposed to an
// uploaded file, which was copied into the bundle) can't be reached without internet — the
// export flags these to the admin already (see server.py's scan_menu_for_online_content),
// but the viewer itself still surfaces it plainly instead of a silently blank embed.
function noteIfExternal(rawSrc, kind) {
  if (BUNDLE && /^https?:/i.test(rawSrc || '')) {
    showNotice(`This ${kind} is hosted online — an internet connection is needed to view it.`);
  }
}

function openClientVideoModal(title, config, { autoOpen = false } = {}) {
  let rawSrc = config.fileBlob ? URL.createObjectURL(config.fileBlob) : null;
  if (!rawSrc && config.fileName) {
    rawSrc = assetUrl(config.fileName);
  }
  if (!rawSrc && config.url) {
    rawSrc = config.url;
  }
  if (!rawSrc) {
    showNotice(`No video uploaded or URL configured for "${title}".`);
    return;
  }
  noteIfExternal(rawSrc, 'video');

  const isYt = isYoutubeUrl(rawSrc);
  const isVim = isVimeoUrl(rawSrc);
  const isDirect = /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(rawSrc) || rawSrc.startsWith('blob:');

  if (els.clientVideoModal) {
    const titleEl = $('clientVideoTitle');
    const player = $('clientVideoPlayer');
    const iframe = $('clientVideoIframe');

    if (titleEl) titleEl.textContent = title;

    if (isYt || isVim || (!isDirect && /^https?:\/\//i.test(rawSrc))) {
      if (player) { player.style.display = 'none'; player.pause(); player.src = ''; }
      if (iframe) {
        iframe.style.display = 'block';
        iframe.src = isYt ? getYoutubeEmbedUrl(rawSrc, autoOpen) : (isVim ? getVimeoEmbedUrl(rawSrc, autoOpen) : rawSrc);
      }
    } else {
      if (iframe) { iframe.style.display = 'none'; iframe.src = 'about:blank'; }
      if (player) {
        player.style.display = 'block';
        player.src = rawSrc;
        // A real click is itself the "user gesture" browsers require for unmuted
        // autoplay, so a manually-opened video plays with sound as always. Opening as
        // the client's DEFAULT SCREEN (autoOpen, fired at boot with no gesture behind
        // it at all) has none of that — an unmuted play() there is silently rejected by
        // the browser's autoplay policy and the video just sits paused, which is why a
        // video-as-default-screen previously never actually autoplayed. Muting is what
        // autoplay policies exempt, so that's the one case this starts muted; the
        // player's own `controls` (index.html) let the visitor unmute with one tap.
        // `muted` is set unconditionally each open — the element is reused, so a later
        // manual open of a different video must not inherit a stale mute from this one.
        player.muted = !!autoOpen;
        player.play().catch(() => {});
      }
    }

    openCustomModal(els.clientVideoModal);
  } else {
    openModal({ url: rawSrc, title });
  }
}

function openClientTourModal(title, config) {
  let tourSrc = config.fileBlob ? URL.createObjectURL(config.fileBlob) : null;
  if (!tourSrc && config.fileName) {
    tourSrc = assetUrl(config.fileName);
  }
  if (!tourSrc && config.url) {
    tourSrc = config.url;
  }
  if (tourSrc) {
    noteIfExternal(tourSrc, 'virtual tour');
    openModal({ url: tourSrc, title });
  } else {
    showNotice(`No virtual tour link or file configured for "${title}".`);
  }
}

function openClientFolderImageModal(node, nodeInfo = null) {
  if (!nodeInfo && node) nodeInfo = findNodeInfo(node.id);

  let imageList = [];
  let activeIdx = 0;

  if (nodeInfo && Array.isArray(nodeInfo.list)) {
    const imgNodes = nodeInfo.list.filter(n => n && n.kind === 'child' && n.contentType === 'image');
    if (imgNodes.length > 0) {
      imageList = imgNodes.map((n) => {
        const c = n.content || {};
        let src = '';
        if (c.fileBlob) src = URL.createObjectURL(c.fileBlob);
        else if (c.fileName) src = assetUrl(c.fileName);
        else if (c.url) src = c.url;
        return {
          id: n.id,
          name: n.title || (c.fileName ? c.fileName.replace(/\.[^/.]+$/, '') : 'Image'),
          url: src,
          blob: c.fileBlob || null,
          fileName: c.fileName || ''
        };
      });
      activeIdx = imgNodes.findIndex(n => n.id === node.id);
      if (activeIdx < 0) activeIdx = 0;
    }
  }

  if (!imageList.length && node) {
    const c = node.content || {};
    let src = '';
    if (c.fileBlob) src = URL.createObjectURL(c.fileBlob);
    else if (c.fileName) src = assetUrl(c.fileName);
    else if (c.url) src = c.url;
    if (!src) {
      showNotice(`No image uploaded or URL configured for "${node.title || 'Image'}".`);
      return;
    }
    imageList = [{
      id: node.id,
      name: node.title || (c.fileName ? c.fileName.replace(/\.[^/.]+$/, '') : 'Image'),
      url: src,
      blob: c.fileBlob || null,
      fileName: c.fileName || ''
    }];
    activeIdx = 0;
  }

  openClientGalleryModal({ images: imageList }, activeIdx);
}

function openClientImageModal(title, config) {
  let imgSrc = config.fileBlob ? URL.createObjectURL(config.fileBlob) : null;
  if (!imgSrc && config.fileName) {
    imgSrc = assetUrl(config.fileName);
  }
  if (!imgSrc && config.url) {
    imgSrc = config.url;
  }
  if (imgSrc) {
    openClientGalleryModal([{ url: imgSrc, name: title }], 0);
  } else {
    showNotice(`No image uploaded or URL configured for "${title}".`);
  }
}

function openClientGalleryModal(content, startIndex = 0) {
  if (!els.clientGalleryModal) return;
  let rawImages = [];
  if (Array.isArray(content)) {
    rawImages = content;
  } else if (content && Array.isArray(content.images)) {
    rawImages = content.images;
  } else if (content && typeof content === 'object') {
    rawImages = [content];
  }

  if (!rawImages.length) {
    showNotice('No gallery photos uploaded yet.');
    return;
  }

  state.currentGalleryImages = rawImages.map((img, i) => {
    if (typeof img === 'string') {
      const isUrl = /^https?:\/\//i.test(img) || img.startsWith('blob:') || img.startsWith('data:');
      return {
        name: `Photo ${i + 1}`,
        url: isUrl ? img : assetUrl(img)
      };
    }
    let src = img.url || '';
    if (img.blob) {
      src = URL.createObjectURL(img.blob);
    } else if (img.fileBlob) {
      src = URL.createObjectURL(img.fileBlob);
    } else if (img.fileName) {
      src = assetUrl(img.fileName);
    } else if (!src && img.name && !img.name.startsWith('http')) {
      src = assetUrl(img.name);
    }
    const displayName = img.name || img.title || (img.fileName ? img.fileName.replace(/\.[^/.]+$/, '') : `Photo ${i + 1}`);
    return {
      ...img,
      name: displayName,
      url: src
    };
  }).filter(img => Boolean(img.url));

  if (!state.currentGalleryImages.length) {
    showNotice('No valid image URLs or files found.');
    return;
  }

  currentGalleryIdx = (startIndex >= 0 && startIndex < state.currentGalleryImages.length) ? startIndex : 0;
  updateGallerySlide(currentGalleryIdx);
  startGalleryAutoplay();

  els.clientGalleryModal.style.display = 'flex';
  els.clientGalleryModal.hidden = false;
  els.clientGalleryModal.setAttribute('aria-hidden', 'false');
  void els.clientGalleryModal.offsetWidth;
  els.clientGalleryModal.classList.add('open');
}

// Slideshow autoplay (2026-09-16, on request). `galleryAutoplayOn` is the visitor's own
// play/pause choice, independent of whether a timer is actually running right now — a
// manual Prev/Next/swipe/arrow-key restarts the countdown (so a click isn't immediately
// followed by an autoplay tick a moment later) without touching that choice, so tapping
// pause is the only thing that actually stops it.
const GALLERY_AUTOPLAY_MS = 4000;
let galleryAutoplayTimer = null;
let galleryAutoplayOn = true;
function startGalleryAutoplay() {
  clearInterval(galleryAutoplayTimer);
  galleryAutoplayTimer = null;
  const btn = $('galleryAutoplayBtn');
  if ((state.currentGalleryImages || []).length <= 1) { if (btn) btn.style.display = 'none'; return; }
  if (btn) btn.style.display = 'flex';
  updateGalleryAutoplayBtn();
  if (!galleryAutoplayOn) return;
  galleryAutoplayTimer = setInterval(() => updateGallerySlide(currentGalleryIdx + 1), GALLERY_AUTOPLAY_MS);
}
function stopGalleryAutoplay() {
  clearInterval(galleryAutoplayTimer);
  galleryAutoplayTimer = null;
}
function restartGalleryAutoplayIfRunning() {
  if (galleryAutoplayTimer) startGalleryAutoplay();
}
function toggleGalleryAutoplay() {
  galleryAutoplayOn = !galleryAutoplayOn;
  startGalleryAutoplay();
}
function updateGalleryAutoplayBtn() {
  const btn = $('galleryAutoplayBtn');
  if (!btn) return;
  btn.classList.toggle('is-paused', !galleryAutoplayOn);
  btn.setAttribute('aria-pressed', String(galleryAutoplayOn));
  btn.setAttribute('aria-label', galleryAutoplayOn ? 'Pause slideshow' : 'Play slideshow');
}

let currentGalleryIdx = 0;
function updateGallerySlide(idx) {
  const images = state.currentGalleryImages || [];
  if (!images.length) return;

  currentGalleryIdx = (idx + images.length) % images.length;
  const img = images[currentGalleryIdx];
  const src = img.url || '';

  const activeImg = $('galleryActiveImg');
  const imgName = $('galleryImgName');
  const imgCounter = $('galleryImgCounter');
  const prevBtn = $('galleryPrevBtn');
  const nextBtn = $('galleryNextBtn');
  const captionBar = $('galleryCaptionBar');

  if (activeImg) {
    activeImg.style.opacity = '0.3';
    activeImg.style.transform = 'scale(0.985)';
    const temp = new Image();
    temp.onload = () => {
      activeImg.src = src;
      activeImg.style.opacity = '1';
      activeImg.style.transform = 'scale(1)';
    };
    temp.onerror = () => {
      activeImg.src = src;
      activeImg.style.opacity = '1';
      activeImg.style.transform = 'scale(1)';
    };
    temp.src = src;
  }

  if (imgName) {
    imgName.textContent = img.name || '';
  }
  if (imgCounter) {
    imgCounter.textContent = images.length > 1 ? `(${currentGalleryIdx + 1} / ${images.length})` : '';
  }
  if (captionBar) {
    captionBar.style.display = (!img.name && images.length <= 1) ? 'none' : 'flex';
  }

  if (prevBtn) prevBtn.style.display = images.length > 1 ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = images.length > 1 ? 'flex' : 'none';

  // Prefetch the neighbours either Prev/Next would land on, so that tap feels instant
  // instead of waiting on a fresh download — plain <img> requests, so the browser's own
  // HTTP cache (not app.js) reuses them, and there's no VRAM cost to bound the way there
  // is for tour panoramas (2026-09-16).
  if (images.length > 1) {
    [1, -1].forEach((d) => {
      const n = images[(currentGalleryIdx + d + images.length) % images.length];
      if (n?.url) new Image().src = n.url;
    });
  }
}

function closeClientGalleryModal() {
  if (!els.clientGalleryModal) return;
  stopGalleryAutoplay();
  els.clientGalleryModal.classList.remove('open');
  els.clientGalleryModal.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    if (!els.clientGalleryModal.classList.contains('open')) {
      els.clientGalleryModal.style.display = 'none';
      els.clientGalleryModal.hidden = true;
      const activeImg = $('galleryActiveImg');
      if (activeImg) activeImg.removeAttribute('src');
    }
  }, 220);
}

// pdf.js, loaded on demand and only where it's actually needed (see openClientBrochureModal):
// vendor/pdf.min.js is a UMD build, so it goes in as a classic <script> that defines the
// window.pdfjsLib global — app.js itself is an ES module and can't `import` it. v3 on
// purpose, not v4: v4 relies on Promise.withResolvers and similar modern syntax that the
// older Android Chrome builds this exists to work around don't have.
let pdfJsReady = null;
function loadPdfJs() {
  if (pdfJsReady) return pdfJsReady;
  pdfJsReady = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement('script');
    s.src = 'vendor/pdf.min.js';
    s.onload = () => {
      if (!window.pdfjsLib) { reject(new Error('pdfjsLib missing')); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('pdf.js failed to load'));
    document.head.appendChild(s);
  });
  return pdfJsReady;
}

// Draw every page of `src` into `container` as stacked canvases. Sequential, not parallel,
// so a long brochure doesn't spike memory on a low-end phone — the exact class of device
// that needs this path in the first place. `onFirstPage` fires as soon as page 1 is
// actually painted (the caller uses it to cancel its "this is taking too long" fallback),
// and `shouldStop` lets the caller abandon a render it has already given up on.
async function renderPdfInto(src, container, onFirstPage, shouldStop = () => false) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument(src).promise;
  if (shouldStop()) return;
  container.textContent = '';
  const targetW = Math.min(container.clientWidth || window.innerWidth || 800, 1400);
  for (let n = 1; n <= doc.numPages; n++) {
    if (shouldStop()) return;
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetW / base.width });
    const canvas = document.createElement('canvas');
    canvas.className = 'brochure-page';
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    if (shouldStop()) return;
    container.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    if (n === 1 && onFirstPage) onFirstPage();
  }
}

function openClientBrochureModal(b = {}) {
  if (!els.clientBrochureModal) return;
  const frame = $('clientBrochureFrame');
  const btn = $('clientBrochureDownload');
  let src = null;

  // Priority 1: in-memory blob from device upload
  if (b.fileBlob) {
    src = URL.createObjectURL(b.fileBlob);
  }
  // Priority 2: direct URL or Google Drive link
  if (!src && b.url) {
    const rawUrl = b.url.trim();
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
  if (!src && b.fileName) {
    src = assetUrl(b.fileName);
  }

  if (!src) {
    showNotice('No PDF brochure uploaded or URL configured yet.');
    return;
  }
  noteIfExternal(src, 'PDF');

  if (btn) { btn.href = src; btn.download = b.fileName || b.name || 'brochure.pdf'; }
  els.clientBrochureModal.classList.add('open');
  els.clientBrochureModal.setAttribute('aria-hidden', 'false');

  // All mobile browsers (Android AND iOS) use the pdf.js canvas renderer so PDFs:
  //   1. Always open INSIDE the app modal — never redirect to a new browser tab
  //   2. Work fully offline once downloaded (an <iframe src=pdf> would need network)
  //   3. Are consistent across devices
  // Android Chrome has no native inline PDF viewer at all (it downloads instead).
  // iOS Safari CAN show PDFs in an iframe, but in standalone/PWA mode it breaks the
  // app by opening the PDF in a separate browser tab, and offline it fails entirely.
  // pdf.js solves both. Desktop keeps the native iframe viewer (real text selection,
  // pinch-zoom, browser built-in controls) — that tradeoff is only right on a big screen.
  // The `.style.display` toggles below are deliberate rather than `.hidden` — both
  // elements carry an inline `display`, which would beat the `[hidden]` attribute (see
  // Conventions & gotchas).
  const canvasBox = $('clientBrochureCanvas');
  if ((isMobilePortrait() || isMobileLandscape()) && canvasBox) {
    if (frame) { frame.removeAttribute('src'); frame.style.display = 'none'; }
    canvasBox.style.display = 'block';
    canvasBox.textContent = 'Loading brochure…';
    // A stalled render must never strand the visitor on "Loading brochure…", and a hang
    // isn't a rejection so the catch below can't cover it — hence an explicit deadline.
    // Whichever happens first wins: page 1 painting cancels the deadline; the deadline
    // firing falls back to opening the PDF in a new tab (last-resort, never a dead end).
    let abandoned = false;
    const giveUp = () => {
      if (abandoned) return;
      abandoned = true;
      canvasBox.style.display = 'none';
      canvasBox.textContent = '';
      closeCustomModal(els.clientBrochureModal);
      window.open(src, '_blank');
    };
    const deadline = setTimeout(giveUp, 12000);
    renderPdfInto(src, canvasBox, () => clearTimeout(deadline), () => abandoned)
      .catch(() => { clearTimeout(deadline); giveUp(); });
    return;
  }
  if (canvasBox) { canvasBox.style.display = 'none'; canvasBox.textContent = ''; }
  if (frame) { frame.style.display = 'block'; frame.src = src; }
}

function openClientContactModal(c = {}) {
  if (!els.clientContactModal) return;
  const title = $('clientContactTitle');
  const about = $('clientContactAbout');
  const phone = $('clientContactPhone');
  const email = $('clientContactEmail');
  const img = $('clientContactImg');

  if (title) title.textContent = c.title || 'Anandam Eleganza - Premium Villa Plots';
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

function isYoutubeUrl(url) {
  return /youtube\.com|youtu\.be/i.test(url || '');
}
function getYoutubeEmbedUrl(url, muted = false) {
  const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/i);
  // A boot-time auto-open (see openClientVideoModal) has no user gesture behind it, and
  // browser autoplay policies only exempt MUTED playback from that requirement — an
  // unmuted iframe autoplay there would just silently sit paused.
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1${muted ? '&mute=1' : ''}` : url;
}
function isVimeoUrl(url) {
  return /vimeo\.com/i.test(url || '');
}
function getVimeoEmbedUrl(url, muted = false) {
  const m = (url || '').match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return m ? `https://player.vimeo.com/video/${m[1]}?autoplay=1${muted ? '&muted=1' : ''}` : url;
}

// ─── Admin Tree View & Unified Node Builder Modal ─────────────────────────────

let activeEditingNodeId = null;
let activeNodeBuilderKind = 'parent'; // 'parent' | 'child' | 'contact'
let pendingNodeFileBlob = null;
let pendingNodeFileName = '';
let pendingContactImageBlob = null;
let pendingContactImageName = '';
let pendingGalleryImages = [];

async function syncCustomMenuFilesToDisk() {
  try {
    const files = collectCustomMenuFiles();
    if (files.length) {
      await serverSave(files);
    }
  } catch (e) {
    console.warn('Auto-sync menu files:', e);
  }
}

let wizardState = {
  step: 1,
  mode: 'create', // 'create' or 'edit'
  editingNodeId: null,
  presetParentId: 'root',
  kind: 'parent', // 'parent' | 'child' | 'contact'
  contentType: 'video', // 'video' | 'pdf' | 'image' | 'gallery' | 'tour' | 'panotour' | 'link'
                        // 'tour' = external (3DVista/Kuula) in an iframe; 'panotour' = our
                        // own multi-node walkthrough, referenced by tourId (tour.json)
  tourId: '',
  sourceType: 'url', // 'url' | 'upload'
  selectedPlacement: 'root',
  title: '',
  url: '',
  fileBlob: null,
  fileName: '',
  contact: { title: '', about: '', phone: '', email: '', image: '', imageName: '', imageBlob: null },
  galleryImages: []
};

// Collapsed folders set for scannability
state.collapsedFolders = state.collapsedFolders || new Set();
// Which built-in rows (aerial/landmarks) currently have their ▾ info panel open.
state.expandedBuiltins = state.expandedBuiltins || new Set();

// A built-in row (AERIAL VIEW / LANDMARKS) renders through the SAME recursive walk as any
// authored node (renderNodeRow checks `node.builtin` and delegates here) so it drags and
// drops with the existing node machinery — position is just array order, nothing special.
// What IS still special: no delete button (self-healing instead, see ensureBuiltinNodes)
// and an ON/OFF switch in place of the usual overflow menu (content nodes have no such
// flag — these two have no content to configure, so "off" is a real, meaningful state).
// The ▾ arrow expands a plain-language note on what the row does — for LANDMARKS it also
// unfolds the live category → landmark list read straight from the Landmarks tab data
// (see getLandmarkCategories), so an admin never has to author menu items to keep it in
// sync with what's actually been placed.
const BUILTIN_ICON = { aerial: '🧭', landmarks: '📍', tour: '🌐', menuimage: '🖼' };
const BUILTIN_INFO = {
  aerial: 'Flies the camera back to the full site aerial view. Needs no link or content of its own — a visitor just taps it to reset their view.',
  landmarks: 'Opens the landmark category picker. The categories and landmarks listed below are read live from the Landmarks tab — add, remove or recategorize a landmark there and this list updates on its own.',
  tour: 'Opens the project’s virtual tour(s). The list below is read live from the Tour tab — with exactly one tour it opens straight away; with several, a picker lets the visitor choose which to walk through.',
  menuimage: 'Shows a picture inside the menu itself — typically a QR code. Unlike every other row it is not tappable: the image is simply drawn where this item sits, so drag it to the bottom to sit under CONTACT US. Switch it off to hide it without losing the upload.'
};
function renderBuiltinNodeRow(node, depth) {
  const key = node.builtin;
  const isOpen = state.expandedBuiltins.has(key);
  const indent = (depth - 1) * 20;
  const enabled = node.enabled !== false;
  const title = (node.title || '').trim() || (BUILTIN_DEFS[key] ? BUILTIN_DEFS[key].title : key.toUpperCase());
  return `
    <div class="tree-node-row is-leaf is-builtin" data-node-id="${esc(node.id)}" data-is-folder="0" draggable="true" style="margin-left:${indent}px; ${depth > 1 ? 'border-left:2px solid rgba(250,204,21,0.35); padding-left:8px;' : 'padding-left:8px;'} display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:nowrap; box-sizing:border-box;">
      <div style="display:flex; align-items:center; gap:5px; min-width:0; flex:1; overflow:hidden;">
        <span class="tree-drag-handle">⠿</span>
        <span class="builtin-expand-arrow ${isOpen ? 'is-open' : ''}" data-builtin-key="${esc(key)}" title="What does this do?">▾</span>
        <span style="font-size:14px; flex-shrink:0;">${BUILTIN_ICON[key] || '⭐'}</span>
        <span class="tree-title-text" data-node-id="${esc(node.id)}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:text;" title="Double-click to rename">${esc(title)}</span>
        <span class="tree-inline-tag" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3);">BUILT-IN</span>
      </div>
      <label class="ui-switch" title="${enabled ? 'Shown in the client menu — click to hide' : 'Hidden from the client menu — click to show'}">
        <input type="checkbox" class="ui-switch-input builtin-node-switch" data-node-id="${esc(node.id)}" ${enabled ? 'checked' : ''}>
        <span class="ui-switch-track"><span class="ui-switch-thumb"></span></span>
      </label>
    </div>
    <div class="builtin-info-panel" data-builtin-key="${esc(key)}" style="margin-left:${indent + 18}px; ${isOpen ? '' : 'display:none;'}">
      <p class="builtin-info-text">${esc(BUILTIN_INFO[key] || '')}</p>
      ${key === 'landmarks' ? renderBuiltinLandmarkCategories() : ''}
      ${key === 'tour' ? renderBuiltinTourList() : ''}
      ${key === 'menuimage' ? renderBuiltinMenuImage(node) : ''}
    </div>
  `;
}

// Upload slot for the MENU IMAGE builtin — the only builtin that carries content of its own.
// Stored as an ordinary child node's `content.fileName`/`fileBlob`, so every existing save,
// export and precache path already handles it (see collectCustomMenuFiles).
// PNG, not JPEG: a QR code is exactly the kind of hard-edged black-and-white art that JPEG
// smears, and a smeared QR can stop scanning. Capped at 1024px — far more than a menu-width
// image needs, and it keeps the file small enough to ride along in the offline cache.
async function setMenuImageFromFile(file) {
  const info = findNodeInfo(state.menuImageTarget);
  const node = info && info.node; if (!node || !file) return;
  let out;
  try { out = await resizeImageToBlob(file, 1024, 'image/png'); }
  catch { setAxStatus('Could not read that file as an image.'); return; }
  const c = node.content || (node.content = {});
  if (c._url) { try { URL.revokeObjectURL(c._url); } catch {} c._url = null; }
  c.fileName = `sample/menu-image-${node.id}.web.png`;
  c.fileBlob = out.blob;
  c.url = '';
  onAlignmentChanged(); renderAdminMenuTree(); renderClientSidebar();
  setAxStatus('Menu image updated.');
}
function clearMenuImage(nodeId) {
  const info = findNodeInfo(nodeId);
  const node = info && info.node; if (!node) return;
  const c = node.content || (node.content = {});
  if (c._url) { try { URL.revokeObjectURL(c._url); } catch {} c._url = null; }
  c.fileName = ''; c.fileBlob = null; c.url = '';
  onAlignmentChanged(); renderAdminMenuTree(); renderClientSidebar();
}
function renderBuiltinMenuImage(node) {
  const src = menuImageSrc(node);
  const has = !!src;
  return `
    <div class="builtin-mi" data-node-id="${esc(node.id)}">
      ${has ? `<div class="builtin-mi-thumb"><img src="${esc(src)}" alt="" /></div>`
            : `<p class="builtin-cat-empty">No image yet — upload one and it appears in the client menu.</p>`}
      <div class="builtin-mi-actions">
        <button type="button" class="btn btn-ghost builtin-mi-pick" data-node-id="${esc(node.id)}">${has ? '🖼 Replace image…' : '🖼 Upload image…'}</button>
        ${has ? `<button type="button" class="btn btn-ghost builtin-mi-clear" data-node-id="${esc(node.id)}">Remove</button>` : ''}
      </div>
    </div>
  `;
}

function renderBuiltinLandmarkCategories() {
  const cats = getLandmarkCategories();
  if (!cats.length) return `<p class="builtin-cat-empty">No landmarks placed yet — add one on the Landmarks tab and its category appears here.</p>`;
  return `<div class="builtin-cat-list">${cats.map((c) => `
    <div class="builtin-cat-row" data-cat-name="${esc(c.name)}">
      <span class="builtin-cat-title" data-cat-name="${esc(c.name)}" title="Double-click to rename this category — every landmark in it moves with the new name">${esc(c.name)}</span>
      <span class="tree-inline-tag" style="background:rgba(250,204,21,0.15); color:var(--gold,#facc15); border:1px solid rgba(250,204,21,0.3);">${c.count}</span>
    </div>
    <div class="builtin-lm-sublist">${c.landmarks.map((lm) => `
      <div class="builtin-lm-row" data-lm-id="${esc(lm.id)}" title="Click to open on the Landmarks tab · double-click the name to rename">
        <span style="font-size:12px; flex-shrink:0;">${esc(LM_ICONS[lm.icon] || LM_ICONS.place)}</span>
        <span class="builtin-lm-title" data-lm-id="${esc(lm.id)}">${esc((lm.label || '').trim() || 'Untitled')}</span>
      </div>
    `).join('')}</div>
  `).join('')}</div>`;
}

// Distinct classes from the landmark rows above (not `.builtin-lm-row`/`.builtin-lm-title`)
// — reusing those would also catch these rows in the LANDMARKS wiring block further down
// (a blanket querySelectorAll('.builtin-lm-row')), sending a tour click to the Landmarks
// tab with an undefined landmark id instead of the Tour tab with the right tour selected.
function renderBuiltinTourList() {
  const tours = state.tours;
  if (!tours.length) return `<p class="builtin-cat-empty">No tours placed yet — add one on the Tour tab and it appears here.</p>`;
  return `<div class="builtin-cat-list">${tours.map((t) => `
    <div class="builtin-tour-row" data-tour-id="${esc(t.id)}" title="Click to open on the Tour tab · double-click the name to rename">
      <span style="font-size:12px; flex-shrink:0;">🌐</span>
      <span class="builtin-tour-title" data-tour-id="${esc(t.id)}">${esc((t.name || '').trim() || 'Untitled tour')}</span>
      <span class="tree-inline-tag" style="background:rgba(250,204,21,0.15); color:var(--gold,#facc15); border:1px solid rgba(250,204,21,0.3); margin-left:auto;">${t.nodes.length} node${t.nodes.length === 1 ? '' : 's'}</span>
    </div>
  `).join('')}</div>`;
}

function renderAdminMenuTree() {
  const treeEl = $('projMenuBuilderDropdown');
  if (!treeEl) return;

  const tree = getMenuTree();
  let html = `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.12); background:linear-gradient(180deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95)); border-radius:12px 12px 0 0;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:13px; font-weight:800; color:var(--gold,#facc15); text-transform:uppercase; letter-spacing:0.6px; display:flex; align-items:center; gap:6px;">
          📋 CLIENT SIDEBAR MENU
        </span>
        <span style="font-size:10px; font-weight:700; padding:2px 7px; border-radius:10px; background:rgba(250,204,21,0.18); color:var(--gold,#facc15); border:1px solid rgba(250,204,21,0.3);">${tree.length} Items</span>
      </div>
      <button type="button" class="btn btn-primary" id="adminAddRootNodeBtn" style="font-size:11.5px; padding:5px 12px; font-weight:700; border-radius:6px; box-shadow:0 2px 8px rgba(250,204,21,0.25);">＋ Add Item</button>
    </div>
    <div style="padding:10px; display:flex; flex-direction:column; gap:4px; max-height:450px; overflow-y:auto;" id="adminMenuTreeContainer">
  `;

  // ensureBuiltinNodes (getMenuTree) guarantees the two built-in rows always exist, so
  // `tree` itself is never truly empty any more — "no menu items yet" now means no
  // AUTHORED item exists besides them, and is a hint shown ALONGSIDE the built-in rows
  // (still rendered — they're never hidden from the admin) rather than replacing them.
  const hasAuthoredItems = tree.some((n) => !n.builtin);

  {
    const kindIcons = {
      parent: '📁',
      contact: '📞',
      video: '🎬',
      pdf: '📄',
      gallery: '🖼️',
      tour: '🌐',
      image: '🖼️',
      link: '🔗'
    };

    const renderNodeRow = (node, depth, index, totalSiblings, parentId) => {
      if (node.builtin) return renderBuiltinNodeRow(node, depth);
      let icon = '📄';
      if (node.kind === 'parent') icon = kindIcons.parent;
      else if (node.kind === 'contact') icon = kindIcons.contact;
      else icon = kindIcons[node.contentType] || '📄';

      const title = (node.title || 'Untitled').trim();
      const indent = (depth - 1) * 20;
      const isFolder = node.kind === 'parent';
      const isContact = node.kind === 'contact';
      const canAddChild = isFolder && depth < 3;
      const isCollapsed = state.collapsedFolders.has(node.id);
      const childCount = isFolder && Array.isArray(node.children) ? node.children.length : 0;

      let rowClass = 'tree-node-row ';
      if (isFolder) rowClass += 'is-folder';
      else if (isContact) rowClass += 'is-contact';
      else rowClass += 'is-leaf';

      let inlineTag = '';
      let tagClass = 'tree-inline-tag ';
      if (isFolder) {
        inlineTag = '';
      } else if (isContact) {
        inlineTag = 'Contact Card';
        tagClass += 'tag-contact';
      } else if (node.contentType) {
        inlineTag = node.contentType.toUpperCase();
        tagClass += `tag-${node.contentType}`;
      }

      let nodeHtml = `
        <div class="${rowClass}" data-node-id="${esc(node.id)}" data-is-folder="${isFolder ? '1' : '0'}" draggable="true" style="margin-left:${indent}px; ${depth > 1 ? 'border-left:2px solid rgba(250,204,21,0.35); padding-left:8px;' : 'padding-left:8px;'} display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:nowrap; box-sizing:border-box;">
          <div style="display:flex; align-items:center; gap:5px; min-width:0; flex:1; overflow:hidden;">
            <span class="tree-drag-handle">⠿</span>
            ${isFolder ? `
              <span class="tree-chevron ${isCollapsed ? 'is-collapsed' : ''}" data-folder-id="${esc(node.id)}" title="${isCollapsed ? 'Expand folder' : 'Collapse folder'}">▼</span>
            ` : '<span style="width:14px; display:inline-block; flex-shrink:0;"></span>'}
            <span style="font-size:14px; flex-shrink:0;">${icon}</span>
            <span class="tree-title-text" data-node-id="${esc(node.id)}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:text;" title="Double-click to rename">${esc(title)}</span>
            ${inlineTag ? `<span class="${tagClass}">${esc(inlineTag)}</span>` : ''}
          </div>

          <div class="tree-actions-wrapper" style="position:relative; flex-shrink:0; margin-left:auto; display:flex; align-items:center;">
            <button type="button" class="tree-overflow-trigger" data-node-id="${esc(node.id)}" title="Actions">＋</button>
            <div class="tree-overflow-menu" id="treeOverflow_${esc(node.id)}" style="position:absolute; right:0; top:calc(100% + 3px); z-index:99999; background:#090d16; border:1px solid rgba(250,204,21,0.28); border-radius:6px; box-shadow:0 8px 24px rgba(0,0,0,0.9); padding:3px; flex-direction:column; gap:2px; min-width:140px; width:max-content; display:none;">
              ${canAddChild ? `
                <!-- Add Inside: Accordion Trigger -->
                <button type="button" class="tree-overflow-item is-add-inside tree-add-accordion-trigger" data-node-id="${esc(node.id)}" title="Add item inside this folder" style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:4px 8px; font-size:11px; font-weight:600; color:#facc15; background:rgba(250,204,21,0.08); border:none; border-radius:4px; text-align:left; cursor:pointer; width:100%; white-space:nowrap;">
                  <span style="display:flex; align-items:center; gap:5px;"><span style="font-size:11px;">＋</span><span>Add Inside</span></span>
                  <span class="tree-accordion-caret" id="caret_${esc(node.id)}" style="font-size:9px; transition:transform 0.15s ease;">▾</span>
                </button>
                
                <!-- Inline Expandable Options (Expands below inside same box) -->
                <div class="tree-add-inline-list" id="inlineAdd_${esc(node.id)}" style="display:none; flex-direction:column; gap:2px; margin:1px 0 1px 6px; padding-left:6px; border-left:1.5px solid rgba(250,204,21,0.3);">
                  <!-- Folder button -->
                  <button type="button" class="tree-add-type-btn tree-btn-choose-folder" data-parent-id="${esc(node.id)}" data-kind="parent" id="btnChooseFolder_${esc(node.id)}" style="display:flex; align-items:center; gap:6px; padding:3px 6px; font-size:10.5px; font-weight:500; color:#e2e8f0; background:rgba(255,255,255,0.04); border:none; border-radius:3px; text-align:left; cursor:pointer; width:100%; white-space:nowrap;">
                    <span style="font-size:11px;">📁</span>
                    <span>Folder</span>
                  </button>

                  <!-- Inline Folder Name Input (Opens inside dropdown on clicking Folder) -->
                  <div class="tree-folder-inline-create" id="folderInlineCreate_${esc(node.id)}" style="display:none; align-items:center; gap:3px; padding:2px 3px; background:rgba(250,204,21,0.06); border:1px solid rgba(250,204,21,0.3); border-radius:4px; margin:1px 0;">
                    <span style="font-size:11px;">📁</span>
                    <input type="text" class="tree-new-folder-input" id="folderInput_${esc(node.id)}" placeholder="Folder name..." style="font-size:10.5px; font-weight:600; color:#ffffff; background:#090d16; border:1px solid rgba(255,255,255,0.25); border-radius:3px; padding:2px 5px; height:20px; outline:none; flex:1; min-width:70px;" />
                    <button type="button" class="tree-btn-folder-ok" data-parent-id="${esc(node.id)}" style="font-size:10px; font-weight:700; color:#0f172a; background:var(--gold,#facc15); border:none; border-radius:3px; padding:2px 6px; height:20px; cursor:pointer;" title="Create folder">OK</button>
                    <button type="button" class="tree-btn-folder-cancel" data-parent-id="${esc(node.id)}" style="font-size:10px; color:#94a3b8; background:transparent; border:none; padding:2px 3px; cursor:pointer;" title="Cancel">✕</button>
                  </div>

                  <button type="button" class="tree-add-type-btn" data-parent-id="${esc(node.id)}" data-kind="child" style="display:flex; align-items:center; gap:6px; padding:3px 6px; font-size:10.5px; font-weight:500; color:#e2e8f0; background:rgba(255,255,255,0.04); border:none; border-radius:3px; text-align:left; cursor:pointer; width:100%; white-space:nowrap;">
                    <span style="font-size:11px;">📄</span>
                    <span>Content Item</span>
                  </button>
                  <button type="button" class="tree-add-type-btn" data-parent-id="${esc(node.id)}" data-kind="contact" style="display:flex; align-items:center; gap:6px; padding:3px 6px; font-size:10.5px; font-weight:500; color:#e2e8f0; background:rgba(255,255,255,0.04); border:none; border-radius:3px; text-align:left; cursor:pointer; width:100%; white-space:nowrap;">
                    <span style="font-size:11px;">📞</span>
                    <span>Contact Card</span>
                  </button>
                </div>
              ` : ''}
              <button type="button" class="tree-overflow-item tree-act-edit" data-node-id="${esc(node.id)}" title="Rename item" style="display:flex; align-items:center; gap:6px; padding:4px 8px; font-size:11px; font-weight:500; color:#e2e8f0; background:transparent; border:none; border-radius:4px; text-align:left; cursor:pointer; width:100%; white-space:nowrap;">
                <span>✏️</span> <span>Rename</span>
              </button>
              <button type="button" class="tree-overflow-item is-danger tree-act-del" data-node-id="${esc(node.id)}" title="Delete Item" style="display:flex; align-items:center; gap:6px; padding:4px 8px; font-size:11px; font-weight:500; color:#fb7185; background:transparent; border:none; border-radius:4px; text-align:left; cursor:pointer; width:100%; white-space:nowrap;">
                <span>🗑️</span> <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      `;

      if (isFolder && Array.isArray(node.children) && !isCollapsed) {
        node.children.forEach((child, cIdx) => {
          nodeHtml += renderNodeRow(child, depth + 1, cIdx, node.children.length, node.id);
        });
      }

      return nodeHtml;
    };

    tree.forEach((rootNode, rIdx) => {
      html += renderNodeRow(rootNode, 1, rIdx, tree.length, 'root');
    });

    if (!hasAuthoredItems) {
      html += `
        <div style="padding:28px 16px; text-align:center; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.15); border-radius:10px; margin:4px 0;">
          <div style="font-size:32px; margin-bottom:8px;">📂</div>
          <p style="font-size:13px; font-weight:700; color:#f8fafc; margin:0 0 4px 0;">No menu items created yet</p>
          <p style="font-size:11.5px; color:var(--text-mute,#94a3b8); margin:0 0 14px 0;">Click <strong>＋ Add Item</strong> to start building your client sidebar menu</p>
          <button type="button" class="btn btn-primary" id="adminEmptyStateAddBtn" style="font-size:12px; padding:6px 14px; border-radius:6px;">＋ Create First Item</button>
        </div>
      `;
    }
  }

  html += `</div>`;
  treeEl.innerHTML = html;

  // Inline Rename Helper function
  const startInlineRename = (nodeId) => {
    treeEl.querySelectorAll('.tree-overflow-menu').forEach(m => {
      m.classList.remove('is-open');
      m.style.display = 'none';
    });
    treeEl.querySelectorAll('.tree-add-inline-list').forEach(m => m.style.display = 'none');

    const span = treeEl.querySelector(`.tree-title-text[data-node-id="${nodeId}"]`);
    if (!span || span.tagName === 'INPUT') return;

    const currentTitle = span.textContent.trim();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-title-input';
    input.value = currentTitle;
    input.dataset.nodeId = nodeId;

    span.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finishRename = (save) => {
      if (finished) return;
      finished = true;
      const newTitle = input.value.trim();
      if (save && newTitle && newTitle !== currentTitle) {
        updateNode(nodeId, { title: newTitle });
        onAlignmentChanged();
        renderClientSidebar();
      }
      renderAdminMenuTree();
    };

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        finishRename(true);
      } else if (e.key === 'Escape') {
        finishRename(false);
      }
    });

    input.addEventListener('blur', () => {
      finishRename(true);
    });

    input.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  };

  // Header & Empty State Add buttons
  const triggerAddRoot = (e) => {
    e.stopPropagation();
    treeEl.hidden = true;
    $('projMenuBuilderBtn')?.setAttribute('aria-expanded', 'false');
    openNodeBuilderModal(null, 'root');
  };
  $('adminAddRootNodeBtn')?.addEventListener('click', triggerAddRoot);
  $('adminEmptyStateAddBtn')?.addEventListener('click', triggerAddRoot);

  // Chevron Collapse/Expand Toggles
  treeEl.querySelectorAll('.tree-chevron').forEach((chev) => {
    chev.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = chev.dataset.folderId;
      if (state.collapsedFolders.has(folderId)) {
        state.collapsedFolders.delete(folderId);
      } else {
        state.collapsedFolders.add(folderId);
      }
      renderAdminMenuTree();
    });
  });

  // Double-click on item name to rename inline
  treeEl.querySelectorAll('.tree-title-text').forEach((span) => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const nodeId = span.dataset.nodeId;
      if (nodeId) startInlineRename(nodeId);
    });
  });

  // Generic swap-to-input rename, shared by a category name and an individual landmark
  // name — the two renameable things inside the built-in LANDMARKS row's expansion that
  // AREN'T a plain node title (the built-in row's own title is a real tree node now and
  // already goes through the generic `.tree-title-text`/startInlineRename wiring just
  // above). Structurally the same (swap span→input, Enter/blur commits, Escape cancels)
  // but parameterised over WHAT gets saved, since each writes to a different place (a
  // landmark's `category`, or its `label`).
  const startGenericRename = (span, currentValue, onSave) => {
    if (!span || span.tagName === 'INPUT') return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tree-title-input';
    input.value = currentValue;
    span.replaceWith(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      const val = input.value.trim();
      if (save && val && val !== currentValue) onSave(val);
      else renderAdminMenuTree();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
  };

  // Built-in ✓ switch — on/off, shown by default; off hides it from the client menu
  // without losing anything (matches the featured-landmark switch precedent: never a
  // delete). Just an ordinary field on the node now (`updateNode`, same path any other
  // node edit goes through) rather than a separate menuBuiltins() config block.
  treeEl.querySelectorAll('.builtin-node-switch').forEach((input) => {
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', (e) => {
      e.stopPropagation();
      updateNode(input.dataset.nodeId, { enabled: input.checked });
      onAlignmentChanged();
      renderClientSidebar();
      renderAdminMenuTree();
    });
  });

  // ▾ expand arrow — reveals a plain-language note on what the row does (and, for
  // LANDMARKS, the live category/landmark list). Admin-only; never shown to the client.
  treeEl.querySelectorAll('.builtin-expand-arrow').forEach((arrow) => {
    arrow.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = arrow.dataset.builtinKey;
      if (state.expandedBuiltins.has(key)) state.expandedBuiltins.delete(key);
      else state.expandedBuiltins.add(key);
      renderAdminMenuTree();
    });
  });

  treeEl.querySelectorAll('.builtin-mi-pick').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.menuImageTarget = btn.dataset.nodeId;
      els.axMenuImageFile?.click();
    });
  });
  treeEl.querySelectorAll('.builtin-mi-clear').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); clearMenuImage(btn.dataset.nodeId); });
  });

  // Category name inside the expanded LANDMARKS row — double-click to rename. Renaming
  // moves EVERY landmark currently filed under it (see renameLandmarkCategory) — not a
  // cosmetic label swap.
  treeEl.querySelectorAll('.builtin-cat-title').forEach((span) => {
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const oldName = span.dataset.catName;
      startGenericRename(span, oldName, (val) => renameLandmarkCategory(oldName, val));
    });
  });

  // Individual landmark row inside a category — click jumps to it on the Landmarks tab
  // (where the full editor already lives: label, distance, icon, render image);
  // double-clicking the name renames it right here, same as any other menu title.
  treeEl.querySelectorAll('.builtin-lm-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const lmId = row.dataset.lmId;
      treeEl.hidden = true;
      $('projMenuBuilderBtn')?.setAttribute('aria-expanded', 'false');
      setAdminTab('landmarks');
      selectLandmark(lmId);
    });
  });
  // The name itself stops its click from reaching the row (which jumps to the Landmarks
  // tab) so double-clicking it to rename doesn't fire that jump on the first click.
  treeEl.querySelectorAll('.builtin-lm-title').forEach((span) => {
    span.addEventListener('click', (e) => e.stopPropagation());
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const lmId = span.dataset.lmId;
      const lm = state.landmarks.find((l) => l.id === lmId);
      if (!lm) return;
      startGenericRename(span, (lm.label || '').trim(), (val) => { lm.label = val; onLandmarksChanged(); renderAdminMenuTree(); });
    });
  });

  // Individual tour row inside the expanded VIRTUAL TOUR row — same pattern as a
  // landmark row above: click jumps to it on the Tour tab (where node upload/hotspot
  // authoring already live), double-click the name renames it right here.
  treeEl.querySelectorAll('.builtin-tour-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const tourId = row.dataset.tourId;
      treeEl.hidden = true;
      $('projMenuBuilderBtn')?.setAttribute('aria-expanded', 'false');
      setAdminTab('tour');
      selectTour(tourId);
    });
  });
  treeEl.querySelectorAll('.builtin-tour-title').forEach((span) => {
    span.addEventListener('click', (e) => e.stopPropagation());
    span.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const tourId = span.dataset.tourId;
      const tour = state.tours.find((t) => t.id === tourId);
      if (!tour) return;
      startGenericRename(span, (tour.name || '').trim(), (val) => { tour.name = val; onToursChanged(); renderAdminMenuTree(); });
    });
  });

  // Add Inside — Accordion toggle (expands options downwards in the same box)
  treeEl.querySelectorAll('.tree-add-accordion-trigger').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const nodeId = trigger.dataset.nodeId;
      const inlineList = $(`inlineAdd_${nodeId}`);
      const caret = $(`caret_${nodeId}`);
      if (!inlineList) return;
      const isVisible = inlineList.style.display === 'flex';
      inlineList.style.display = isVisible ? 'none' : 'flex';
      if (caret) caret.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
    });
  });

  // Inline Folder Create Handler (Prompt for name directly inside dropdown)
  const handleInlineFolderCreate = (parentId) => {
    const input = $(`folderInput_${parentId}`);
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    // Add folder node directly
    addNode(parentId, { kind: 'parent', title: name, children: [] });
    state.collapsedFolders.delete(parentId); // Expand folder to see new child
    onAlignmentChanged();
    renderClientSidebar();
    renderAdminMenuTree();
  };

  // Add Inside — Folder button clicked: Reveal inline name input inside dropdown
  treeEl.querySelectorAll('.tree-btn-choose-folder').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parentId = btn.dataset.parentId;
      btn.style.display = 'none';
      const form = $(`folderInlineCreate_${parentId}`);
      if (form) {
        form.style.display = 'flex';
        const input = $(`folderInput_${parentId}`);
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    });
  });

  // Inline Folder Create — OK button
  treeEl.querySelectorAll('.tree-btn-folder-ok').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parentId = btn.dataset.parentId;
      handleInlineFolderCreate(parentId);
    });
  });

  // Inline Folder Create — Cancel button
  treeEl.querySelectorAll('.tree-btn-folder-cancel').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parentId = btn.dataset.parentId;
      const form = $(`folderInlineCreate_${parentId}`);
      const chooseBtn = $(`btnChooseFolder_${parentId}`);
      if (form) form.style.display = 'none';
      if (chooseBtn) chooseBtn.style.display = 'flex';
    });
  });

  // Inline Folder Create — Keydown (Enter / Escape)
  treeEl.querySelectorAll('.tree-new-folder-input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      const parentId = input.id.replace('folderInput_', '');
      if (e.key === 'Enter') {
        handleInlineFolderCreate(parentId);
      } else if (e.key === 'Escape') {
        const form = $(`folderInlineCreate_${parentId}`);
        const chooseBtn = $(`btnChooseFolder_${parentId}`);
        if (form) form.style.display = 'none';
        if (chooseBtn) chooseBtn.style.display = 'flex';
      }
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  });

  // Add Inside — Content Item & Contact Card choice buttons
  treeEl.querySelectorAll('.tree-add-type-btn:not(.tree-btn-choose-folder)').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parentId = btn.dataset.parentId;
      const kind = btn.dataset.kind;
      // Close everything
      treeEl.querySelectorAll('.tree-overflow-menu').forEach(m => {
        m.classList.remove('is-open');
        m.style.display = 'none';
      });
      treeEl.querySelectorAll('.tree-add-inline-list').forEach(m => m.style.display = 'none');
      $('projMenuBuilderDropdown').hidden = true;
      $('projMenuBuilderBtn')?.setAttribute('aria-expanded', 'false');
      // Open modal pre-set to chosen kind, skipping step 1
      openNodeBuilderModal(null, parentId, kind);
    });
  });

  // Overflow Menu (+) Toggles & Actions
  treeEl.querySelectorAll('.tree-overflow-trigger').forEach((trig) => {
    trig.addEventListener('click', (e) => {
      e.stopPropagation();
      const nodeId = trig.dataset.nodeId;
      const menu = $(`treeOverflow_${nodeId}`);
      if (!menu) return;
      const isCurrentlyOpen = menu.classList.contains('is-open') || menu.style.display === 'flex';

      // Close any other open overflow menus
      treeEl.querySelectorAll('.tree-overflow-menu').forEach(m => {
        m.classList.remove('is-open');
        m.style.display = 'none';
      });
      treeEl.querySelectorAll('.tree-add-inline-list').forEach(m => m.style.display = 'none');

      if (!isCurrentlyOpen) {
        menu.classList.add('is-open');
        menu.style.display = 'flex';
      }
    });
  });

  // Close all menus when clicking outside
  const closeAllMenus = (e) => {
    if (!e.target.closest('.tree-actions-wrapper')) {
      treeEl.querySelectorAll('.tree-overflow-menu').forEach((m) => {
        m.classList.remove('is-open');
        m.style.display = 'none';
      });
      treeEl.querySelectorAll('.tree-add-inline-list').forEach((m) => m.style.display = 'none');
    }
  };
  document.removeEventListener('click', closeAllMenus);
  document.addEventListener('click', closeAllMenus);

  // Rename Node (Inline rename)
  treeEl.querySelectorAll('.tree-act-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.nodeId;
      startInlineRename(id);
    });
  });

  // ─── Drag and Drop Node Reordering & Relocation ─────────────────
  let draggedNodeId = null;

  const isDescendantOf = (checkId, ancestorId) => {
    const ancestorInfo = findNodeInfo(ancestorId);
    if (!ancestorInfo || ancestorInfo.node.kind !== 'parent') return false;
    let found = false;
    const scan = (children) => {
      if (!Array.isArray(children)) return;
      for (const child of children) {
        if (child.id === checkId) {
          found = true;
          return;
        }
        if (child.kind === 'parent' && child.children) {
          scan(child.children);
        }
      }
    };
    scan(ancestorInfo.node.children);
    return found;
  };

  const clearDragIndicators = () => {
    treeEl.querySelectorAll('.tree-node-row').forEach((row) => {
      row.classList.remove('is-dragging', 'drag-drop-inside', 'drag-drop-above', 'drag-drop-below');
    });
  };

  treeEl.querySelectorAll('.tree-node-row').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.closest('.tree-actions-wrapper')) {
        e.preventDefault();
        return;
      }
      draggedNodeId = row.dataset.nodeId;
      e.dataTransfer.setData('text/plain', draggedNodeId);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => row.classList.add('is-dragging'), 0);
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedNodeId || draggedNodeId === row.dataset.nodeId) return;

      if (isDescendantOf(row.dataset.nodeId, draggedNodeId)) return;

      e.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const height = rect.height;
      const isFolder = row.dataset.isFolder === '1';

      row.classList.remove('drag-drop-inside', 'drag-drop-above', 'drag-drop-below');

      if (isFolder && relY > height * 0.25 && relY < height * 0.75) {
        row.classList.add('drag-drop-inside');
      } else if (relY < height * 0.5) {
        row.classList.add('drag-drop-above');
      } else {
        row.classList.add('drag-drop-below');
      }
    });

    row.addEventListener('dragleave', (e) => {
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove('drag-drop-inside', 'drag-drop-above', 'drag-drop-below');
      }
    });

    row.addEventListener('dragend', () => {
      draggedNodeId = null;
      clearDragIndicators();
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const sourceId = draggedNodeId || e.dataTransfer.getData('text/plain');
      const targetId = row.dataset.nodeId;
      const dropType = row.classList.contains('drag-drop-inside') ? 'inside' :
                       (row.classList.contains('drag-drop-above') ? 'above' : 'below');

      clearDragIndicators();
      draggedNodeId = null;

      if (!sourceId || !targetId || sourceId === targetId) return;
      if (isDescendantOf(targetId, sourceId)) {
        alert('Cannot move a folder inside itself or its own sub-items.');
        return;
      }

      const sourceInfo = findNodeInfo(sourceId);
      const targetInfo = findNodeInfo(targetId);
      if (!sourceInfo || !targetInfo) return;

      // Remove from current parent list
      sourceInfo.list.splice(sourceInfo.index, 1);

      if (dropType === 'inside' && targetInfo.node.kind === 'parent') {
        targetInfo.node.children = targetInfo.node.children || [];
        targetInfo.node.children.push(sourceInfo.node);
        state.collapsedFolders.delete(targetId);
      } else {
        const newTargetIndex = targetInfo.list.findIndex(n => n.id === targetId);
        if (newTargetIndex !== -1) {
          const insertIdx = dropType === 'above' ? newTargetIndex : newTargetIndex + 1;
          targetInfo.list.splice(insertIdx, 0, sourceInfo.node);
        } else {
          targetInfo.list.push(sourceInfo.node);
        }
      }

      onAlignmentChanged();
      renderClientSidebar();
      renderAdminMenuTree();
    });
  });

  // Delete Node with distinct non-empty folder warning
  treeEl.querySelectorAll('.tree-act-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.nodeId;
      const info = findNodeInfo(id);
      if (info && info.node) {
        const node = info.node;
        const count = countTotalDescendants(node);
        let confirmed = false;
        if (node.kind === 'parent' && count > 0) {
          confirmed = confirm(`Delete '${node.title}' and its ${count} items inside?\n\nThis will permanently delete all contents inside this folder.`);
        } else {
          confirmed = confirm(`Are you sure you want to delete '${node.title}'?`);
        }
        if (confirmed && deleteNode(id)) {
          onAlignmentChanged();
          renderClientSidebar();
          renderAdminMenuTree();
        }
      }
    });
  });
}

function countTotalDescendants(node) {
  if (!node || node.kind !== 'parent' || !Array.isArray(node.children)) return 0;
  let count = node.children.length;
  node.children.forEach((child) => {
    count += countTotalDescendants(child);
  });
  return count;
}

// ─── Guided Wizard Implementation ──────────────────────────────────────────

function openNodeBuilderModal(nodeId = null, defaultParentId = 'root', presetKind = null) {
  activeEditingNodeId = nodeId;
  const info = nodeId ? findNodeInfo(nodeId) : null;
  const node = info ? info.node : null;
  const currentParentId = info ? (info.parent ? info.parent.id : 'root') : defaultParentId;

  // If a presetKind is given (from the sub-menu), skip step 1 and go straight to step 2
  const resolvedKind = node ? node.kind : (presetKind || 'parent');
  const startStep = nodeId ? 2 : (presetKind ? 2 : 1);

  // Initialize Wizard State
  wizardState = {
    step: startStep,
    mode: nodeId ? 'edit' : 'create',
    editingNodeId: nodeId,
    presetParentId: defaultParentId,
    kind: resolvedKind,
    contentType: node?.contentType || 'video',
    sourceType: (node?.content?.fileName || node?.content?.fileBlob) ? 'upload' : 'url',
    selectedPlacement: currentParentId,
    title: node ? node.title : '',
    url: node?.content?.url || '',
    fileBlob: node?.content?.fileBlob || null,
    fileName: node?.content?.fileName || '',
    selectedFiles: [],
    tourId: node?.content?.tourId || '',           // 'panotour' items reference a tour.json tour
    contact: Object.assign({ title: '', about: '', phone: '', email: '', image: '', imageName: '', imageBlob: null }, node?.contact || {}),
    galleryImages: (node?.content?.images && Array.isArray(node.content.images)) ? [...node.content.images] : []
  };

  const initialFileInput = $('wizardFileInput');
  if (initialFileInput) initialFileInput.value = '';

  pendingNodeFileBlob = wizardState.fileBlob;
  pendingNodeFileName = wizardState.fileName;
  pendingContactImageBlob = wizardState.contact.imageBlob;
  pendingContactImageName = wizardState.contact.imageName;
  pendingGalleryImages = wizardState.galleryImages;

  // Update Modal Title
  const modalTitle = $('nodeBuilderModalTitle');
  if (modalTitle) modalTitle.textContent = node ? `✏️ Edit "${node.title}"` : '✨ Add Menu Item';

  // Contact Singleton Check
  const contactExists = hasContactNodeInTree();
  const isEditingContact = node && node.kind === 'contact';
  const contactChoiceCard = $('wizardChoiceContact');
  const contactBadge = $('wizardContactBadge');

  if (contactChoiceCard) {
    if (contactExists && !isEditingContact) {
      if (contactBadge) contactBadge.style.display = 'inline-block';
    } else {
      if (contactBadge) contactBadge.style.display = 'none';
    }
  }

  // Pre-populate input fields
  if ($('wizardFolderTitleInput')) $('wizardFolderTitleInput').value = wizardState.kind === 'parent' ? wizardState.title : '';
  if ($('wizardContentTitleInput')) $('wizardContentTitleInput').value = wizardState.kind === 'child' ? wizardState.title : '';
  if ($('wizardUrlInput')) $('wizardUrlInput').value = wizardState.url;
  if ($('wizardFileStatus')) $('wizardFileStatus').textContent = wizardState.fileName ? `Selected: ${wizardState.fileName}` : 'No file chosen';

  if ($('wizardContactTitle')) $('wizardContactTitle').value = wizardState.contact.title || wizardState.title || '';
  if ($('wizardContactAbout')) $('wizardContactAbout').value = wizardState.contact.about || '';
  if ($('wizardContactPhone')) $('wizardContactPhone').value = wizardState.contact.phone || '';
  if ($('wizardContactEmail')) $('wizardContactEmail').value = wizardState.contact.email || '';
  if ($('wizardContactImageStatus')) $('wizardContactImageStatus').textContent = wizardState.contact.imageName ? `Selected: ${wizardState.contact.imageName}` : (wizardState.contact.image ? `Current: ${wizardState.contact.image}` : 'No image selected');

  updateWizardStepUI();
  openCustomModal(els.adminNodeBuilderModal);
}

function updateWizardStepUI() {
  // Hide all step views
  const steps = ['wizardStep1', 'wizardStep2a_Folder', 'wizardStep2b_Content', 'wizardStep2c_Contact', 'wizardStep3_Placement', 'wizardStep4_Confirm'];
  steps.forEach((s) => {
    const el = $(s);
    if (el) el.style.display = 'none';
  });

  const isEditing = wizardState.mode === 'edit';
  const isPlacementPreset = wizardState.presetParentId && wizardState.presetParentId !== 'root' && wizardState.mode === 'create';

  // Determine total steps for creation wizard path
  let totalSteps = 4;
  if (wizardState.kind === 'contact') {
    totalSteps = 1;
  } else if (wizardState.kind === 'parent') {
    totalSteps = isPlacementPreset ? 2 : 3;
  } else if (wizardState.kind === 'child') {
    totalSteps = isPlacementPreset ? 2 : 4;
  }

  // Active step view resolution
  let activeStepId = 'wizardStep1';

  if (isEditing) {
    // Single-screen form pre-filled with node's fields when editing!
    if (wizardState.kind === 'parent') activeStepId = 'wizardStep2a_Folder';
    else if (wizardState.kind === 'child') activeStepId = 'wizardStep2b_Content';
    else if (wizardState.kind === 'contact') activeStepId = 'wizardStep2c_Contact';
  } else {
    // Multi-step Creation Wizard
    if (wizardState.step === 1) {
      activeStepId = 'wizardStep1';
    } else if (wizardState.step === 2) {
      if (wizardState.kind === 'parent') activeStepId = 'wizardStep2a_Folder';
      else if (wizardState.kind === 'child') activeStepId = 'wizardStep2b_Content';
      else if (wizardState.kind === 'contact') activeStepId = 'wizardStep2c_Contact';
    } else if (wizardState.step === 3) {
      activeStepId = 'wizardStep3_Placement';
      renderPlacementPicker();
    } else if (wizardState.step === 4) {
      activeStepId = 'wizardStep4_Confirm';
      renderWizardSummary();
    }
  }

  const activeEl = $(activeStepId);
  if (activeEl) activeEl.style.display = 'block';

  // Step Counter Indicator Label
  const indicator = $('wizardStepIndicator');
  if (indicator) {
    if (isEditing) {
      indicator.textContent = 'Single-Screen Edit';
    } else if (wizardState.kind === 'contact') {
      indicator.textContent = 'Contact Details';
    } else {
      indicator.textContent = `Step ${wizardState.step} of ${totalSteps}`;
    }
  }

  // Back button visibility
  const backBtn = $('wizardBackBtn');
  if (backBtn) {
    backBtn.style.visibility = (wizardState.step === 1 || isEditing || wizardState.kind === 'contact') ? 'hidden' : 'visible';
  }

  // Next / Save button text
  const nextBtn = $('wizardNextBtn');
  if (nextBtn) {
    if (isEditing) {
      nextBtn.textContent = 'Save Changes';
      nextBtn.classList.remove('btn-ghost');
      nextBtn.classList.add('btn-primary');
    } else if (wizardState.step === totalSteps || wizardState.step === 4 || (isPlacementPreset && wizardState.step === 2)) {
      nextBtn.textContent = wizardState.kind === 'parent' ? 'Create Folder' : 'Save Item';
      nextBtn.classList.remove('btn-ghost');
      nextBtn.classList.add('btn-primary');
    } else {
      nextBtn.textContent = 'Next Step →';
    }
  }

  // Content type card active state
  document.querySelectorAll('.wizard-type-card').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.type === wizardState.contentType);
  });

  // Source toggle & group visibility
  const sourceGroup = $('wizardSourceGroup');
  const galleryGroup = $('wizardGalleryGroup');
  const tourGroup = $('wizardTourGroup');
  const noCfgHint = $('wizardNoConfigHint');
  // A 360° tour has no URL and no upload — it points at a tour already authored in the
  // Tour tab — so it swaps the whole URL/upload row for a picker.
  if (tourGroup) tourGroup.style.display = wizardState.contentType === 'panotour' ? 'block' : 'none';
  // Built-in viewer actions take no configuration at all — just a title.
  const noConfig = NO_CONFIG_CONTENT_TYPES[wizardState.contentType];
  if (noCfgHint) {
    noCfgHint.style.display = noConfig ? 'block' : 'none';
    if (noConfig) noCfgHint.innerHTML = noConfig;
  }
  if (wizardState.contentType === 'panotour' || noConfig) {
    if (sourceGroup) sourceGroup.style.display = 'none';
    if (galleryGroup) galleryGroup.style.display = 'none';
    if (wizardState.contentType === 'panotour') renderWizardTourPicker();
    return;
  }
  if (wizardState.contentType === 'gallery') {
    if (sourceGroup) sourceGroup.style.display = 'none';
    if (galleryGroup) galleryGroup.style.display = 'block';
    renderNodeGalleryPreviews();
  } else {
    if (sourceGroup) sourceGroup.style.display = 'block';
    if (galleryGroup) galleryGroup.style.display = 'none';

    document.querySelectorAll('.wizard-source-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.source === wizardState.sourceType);
    });

    const urlGroup = $('wizardUrlInputGroup');
    const fileGroup = $('wizardFileInputGroup');
    const fileInput = $('wizardFileInput');
    const urlInput = $('wizardUrlInput');

    if (wizardState.contentType === 'video') {
      if (fileInput) fileInput.accept = 'video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.mov';
      if (urlInput) urlInput.placeholder = 'https://example.com/video.mp4 or YouTube / Vimeo link';
    } else if (wizardState.contentType === 'pdf') {
      if (fileInput) fileInput.accept = 'application/pdf,.pdf';
      if (urlInput) urlInput.placeholder = 'https://example.com/document.pdf or Google Drive link';
    } else if (wizardState.contentType === 'image') {
      if (fileInput) fileInput.accept = 'image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp';
      if (urlInput) urlInput.placeholder = 'https://example.com/image.jpg';
    }

    if (urlGroup) urlGroup.style.display = wizardState.sourceType === 'url' ? 'block' : 'none';
    if (fileGroup) fileGroup.style.display = wizardState.sourceType === 'upload' ? 'block' : 'none';
  }
}

// Content types that are a built-in viewer action rather than a piece of media: they take
// only a title. Value = the hint shown in place of the URL/upload row.
const NO_CONFIG_CONTENT_TYPES = {
  landmarks: 'Opens the landmark category list in this drawer. Needs no link — it uses the landmarks already placed in the <strong>Landmarks</strong> tab.',
  aerial: 'Flies the camera back to the full site view. Needs no link.',
};

// Populates the wizard's tour dropdown from the project's authored tours, and says
// plainly when there are none yet (the most likely reason a menu item would do nothing).
function renderWizardTourPicker() {
  const sel = $('wizardTourSelect'), hint = $('wizardTourHint');
  if (!sel) return;
  const tours = state.tours || [];
  sel.innerHTML = '';
  if (!tours.length) {
    sel.innerHTML = '<option value="">— no tours in this project yet —</option>';
    sel.disabled = true;
    if (hint) hint.innerHTML = 'Build one first in the admin sidebar’s <strong>Tour</strong> tab: add a tour, upload a panorama per room, then link them with hotspots.';
    return;
  }
  sel.disabled = false;
  tours.forEach((t) => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `${t.name} — ${t.nodes.length} node${t.nodes.length === 1 ? '' : 's'}`;
    sel.appendChild(o);
  });
  if (wizardState.tourId && tours.some((t) => t.id === wizardState.tourId)) sel.value = wizardState.tourId;
  else wizardState.tourId = sel.value;
  sel.onchange = () => { wizardState.tourId = sel.value; renderWizardTourPicker(); };
  const t = tours.find((x) => x.id === sel.value);
  if (hint) {
    if (!t) hint.textContent = '';
    else if (!t.nodes.length) hint.innerHTML = '⚠️ This tour has no panoramas yet — it will not open.';
    else if (!t.links.length) hint.innerHTML = `⚠️ No hotspots linked yet: visitors can still jump between the ${t.nodes.length} rooms from the strip, but cannot walk between them.`;
    else hint.textContent = `${t.nodes.length} rooms · ${t.links.length} hotspot link${t.links.length === 1 ? '' : 's'}.`;
  }
}

function renderPlacementPicker() {
  const container = $('wizardPlacementList');
  if (!container) return;

  const validParents = getValidParentFolders(wizardState.editingNodeId);
  let html = `
    <div class="wizard-placement-item ${wizardState.selectedPlacement === 'root' ? 'is-selected' : ''}" data-placement="root">
      <span>📁 Top Level (Main Menu)</span>
      ${wizardState.selectedPlacement === 'root' ? '<span>✓</span>' : ''}
    </div>
  `;

  validParents.forEach((p) => {
    const parentInfo = findNodeInfo(p.id);
    const depth = parentInfo ? parentInfo.depth : 1;
    const isAtMaxDepth = wizardState.kind === 'parent' && depth >= 2;
    const isSelected = wizardState.selectedPlacement === p.id;

    const indent = (depth - 1) * 16;
    let itemClass = 'wizard-placement-item ';
    if (isSelected) itemClass += 'is-selected ';
    if (isAtMaxDepth) itemClass += 'is-disabled ';

    html += `
      <div class="${itemClass}" data-placement="${esc(p.id)}" ${isAtMaxDepth ? 'title="This folder is already 3 levels deep"' : ''} style="margin-left:${indent}px;">
        <span>📁 ${esc(p.label)}</span>
        ${isAtMaxDepth ? '<span style="font-size:10px; color:#f43f5e;">Max Depth (L3)</span>' : (isSelected ? '<span>✓</span>' : '')}
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.wizard-placement-item:not(.is-disabled)').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      wizardState.selectedPlacement = item.dataset.placement;
      renderPlacementPicker();
    });
  });
}

function renderWizardSummary() {
  const summaryEl = $('wizardSummaryText');
  if (!summaryEl) return;

  let placementLabel = 'Top Level (Main Menu)';
  if (wizardState.selectedPlacement !== 'root') {
    const pInfo = findNodeInfo(wizardState.selectedPlacement);
    if (pInfo && pInfo.node) placementLabel = `Folder "${pInfo.node.title}"`;
  }

  let kindText = 'Folder';
  let nameText = wizardState.title || 'Untitled';
  if (wizardState.kind === 'child') {
    kindText = `${wizardState.contentType.toUpperCase()} Item`;
  } else if (wizardState.kind === 'contact') {
    kindText = 'Contact Card';
    nameText = wizardState.contact.title || wizardState.title || 'CONTACT US';
  }

  summaryEl.innerHTML = `
    Adding <strong>${esc(kindText)}</strong>: "<em>${esc(nameText)}</em>" inside <strong>${esc(placementLabel)}</strong>.
  `;
}

function setNodeBuilderKind(kind) {
  activeNodeBuilderKind = kind;

  document.querySelectorAll('.node-kind-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.kind === kind);
  });

  const titleGroup = $('nodeTitleGroup');
  const childFields = $('nodeChildFields');
  const contactFields = $('nodeContactFields');

  if (titleGroup) titleGroup.style.display = kind === 'contact' ? 'none' : 'block';
  if (childFields) childFields.style.display = kind === 'child' ? 'block' : 'none';
  if (contactFields) contactFields.style.display = kind === 'contact' ? 'block' : 'none';

  updateContentTypeFields();
}

function updateContentTypeFields() {
  const typeSel = $('nodeContentTypeSelect');
  const cType = typeSel ? typeSel.value : 'video';
  const singleGroup = $('nodeSingleContentGroup');
  const galleryGroup = $('nodeGalleryContentGroup');
  const fileGroup = $('nodeFileUploadGroup');
  const urlLabel = $('nodeUrlLabel');
  const fileLabel = $('nodeFileLabel');

  if (cType === 'gallery') {
    if (singleGroup) singleGroup.style.display = 'none';
    if (galleryGroup) galleryGroup.style.display = 'block';
  } else {
    if (singleGroup) singleGroup.style.display = 'block';
    if (galleryGroup) galleryGroup.style.display = 'none';

    if (cType === 'video') {
      if (urlLabel) urlLabel.textContent = 'Video Link (YouTube, Vimeo, MP4 URL):';
      if (fileLabel) fileLabel.textContent = 'Or Upload Video File (.mp4):';
      if (fileGroup) fileGroup.style.display = 'block';
    } else if (cType === 'pdf') {
      if (urlLabel) urlLabel.textContent = 'PDF URL / Google Drive Link:';
      if (fileLabel) fileLabel.textContent = 'Or Upload PDF File (.pdf):';
      if (fileGroup) fileGroup.style.display = 'block';
    } else if (cType === 'tour') {
      if (urlLabel) urlLabel.textContent = '360 Virtual Tour URL (3DVista / Kuula):';
      if (fileLabel) fileLabel.textContent = 'Or Upload Standalone Tour Zip / HTML:';
      if (fileGroup) fileGroup.style.display = 'block';
    } else if (cType === 'image') {
      if (urlLabel) urlLabel.textContent = 'Image URL:';
      if (fileLabel) fileLabel.textContent = 'Or Upload Image File:';
      if (fileGroup) fileGroup.style.display = 'block';
    } else if (cType === 'link') {
      if (urlLabel) urlLabel.textContent = 'External Web URL (opens in new tab):';
      if (fileGroup) fileGroup.style.display = 'none';
    }
  }
}

function renderNodeGalleryPreviews() {
  const container = $('nodeGalleryPreviews');
  if (!container) return;
  container.innerHTML = pendingGalleryImages.map((img, i) => {
    const src = img.blob ? URL.createObjectURL(img.blob) : assetUrl(img.url || img.name);
    return `
      <div class="gallery-preview-item" style="position:relative; width:64px; height:64px; border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.2);">
        <img src="${esc(src)}" alt="${esc(img.name)}" style="width:100%; height:100%; object-fit:cover;" />
        <button type="button" class="gallery-preview-remove" data-idx="${i}" style="position:absolute; top:2px; right:2px; width:18px; height:18px; background:rgba(0,0,0,0.7); color:#fff; border:none; border-radius:50%; font-size:10px; cursor:pointer;">✕</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.gallery-preview-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      pendingGalleryImages.splice(idx, 1);
      renderNodeGalleryPreviews();
    });
  });
}

function initCustomMenuAdminAndClient() {
  // Menu Builder Dropdown Toggle
  const btn = $('projMenuBuilderBtn');
  const dropdown = $('projMenuBuilderDropdown');

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!dropdown) return;
    const isHidden = dropdown.hidden;
    dropdown.hidden = !isHidden;
    btn.setAttribute('aria-expanded', String(isHidden));
    if (isHidden) {
      renderAdminMenuTree();
    }
  });

  document.addEventListener('click', () => {
    if (dropdown) {
      dropdown.hidden = true;
      btn?.setAttribute('aria-expanded', 'false');
    }
  });

  dropdown?.addEventListener('click', (e) => e.stopPropagation());

  // ─── Step 1 Choice Rows Selection ─────────────────────────────
  document.querySelectorAll('.wizard-choice-row').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const choice = card.dataset.choice;
      if (choice === 'contact') {
        const existingContact = getMenuTree().find((n) => n.kind === 'contact');
        if (existingContact && wizardState.editingNodeId !== existingContact.id) {
          // Contact already exists -> Jump to edit existing Contact Card immediately
          openNodeBuilderModal(existingContact.id);
          return;
        }
      }
      wizardState.kind = choice;
      wizardState.step = 2;
      updateWizardStepUI();
    });
  });

  // ─── Step 2b Content Type Card Selection ────────────────────────
  document.querySelectorAll('.wizard-type-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const newType = card.dataset.type;
      if (newType !== wizardState.contentType) {
        wizardState.contentType = newType;
        const fileInput = $('wizardFileInput');
        if (fileInput) fileInput.value = '';
        wizardState.selectedFiles = [];
        wizardState.fileBlob = null;
        wizardState.fileName = '';
        pendingNodeFileBlob = null;
        pendingNodeFileName = '';
        const status = $('wizardFileStatus');
        if (status) status.textContent = 'No file chosen (you can select one or more files)';
      }
      updateWizardStepUI();
    });
  });

  // ─── Step 2b Source Segmented Toggle (URL vs Upload) ────────────
  document.querySelectorAll('.wizard-source-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      wizardState.sourceType = btn.dataset.source;
      updateWizardStepUI();
    });
  });

  // ─── File Upload Handlers ────────────────────────────────────────
  $('wizardFileInput')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validExtensions = {
      video: ['.mp4', '.webm', '.mov', '.ogg', '.m4v', '.mkv'],
      pdf: ['.pdf'],
      image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp']
    };

    const cType = wizardState.contentType || 'video';
    const allowed = validExtensions[cType] || [];

    const invalid = files.filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return !allowed.includes(ext);
    });

    if (invalid.length > 0) {
      alert(`Invalid file format for ${cType.toUpperCase()}.\n\nPlease select only ${allowed.join(', ')} files.\n\nRejected: ${invalid.map(f => f.name).join(', ')}`);
      e.target.value = '';
      wizardState.selectedFiles = [];
      pendingNodeFileBlob = null;
      pendingNodeFileName = '';
      wizardState.fileBlob = null;
      wizardState.fileName = '';
      const status = $('wizardFileStatus');
      if (status) status.textContent = 'No file chosen (you can select one or more files)';
      return;
    }

    wizardState.selectedFiles = files;
    if (files.length === 1) {
      pendingNodeFileBlob = files[0];
      pendingNodeFileName = files[0].name;
      wizardState.fileBlob = files[0];
      wizardState.fileName = files[0].name;
      const status = $('wizardFileStatus');
      if (status) status.textContent = `Selected: ${files[0].name} (${(files[0].size / (1024 * 1024)).toFixed(2)} MB)`;

      const titleInput = $('wizardContentTitleInput');
      if (titleInput && !titleInput.value.trim()) {
        titleInput.value = files[0].name.replace(/\.[^/.]+$/, '');
      }
    } else {
      pendingNodeFileBlob = files[0];
      pendingNodeFileName = files[0].name;
      wizardState.fileBlob = files[0];
      wizardState.fileName = files[0].name;
      const status = $('wizardFileStatus');
      if (status) status.textContent = `Selected ${files.length} ${cType} files: ${files.map(f => f.name).join(', ')}`;
    }
  });

  $('wizardGalleryFilesInput')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => {
      pendingGalleryImages.push({ name: f.name, blob: f, url: `sample/${f.name}` });
    });
    wizardState.galleryImages = pendingGalleryImages;
    renderNodeGalleryPreviews();
  });

  $('wizardContactImageFile')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      pendingContactImageBlob = file;
      pendingContactImageName = file.name;
      wizardState.contact.imageBlob = file;
      wizardState.contact.imageName = file.name;
      const status = $('wizardContactImageStatus');
      if (status) status.textContent = `Selected: ${file.name}`;
    }
  });

  // ─── Wizard Back Button ──────────────────────────────────────────
  $('wizardBackBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wizardState.step > 1) {
      wizardState.step--;
      updateWizardStepUI();
    }
  });

  // ─── Save Execution Helper (with async execution lock) ─────────
  let isSavingWizard = false;
  const executeWizardSave = async () => {
    if (isSavingWizard) return null;
    isSavingWizard = true;
    try {
      const parentId = wizardState.selectedPlacement || 'root';
      const kind = wizardState.kind;

      let title = wizardState.title.trim();
      if (kind === 'parent') {
        title = ($('wizardFolderTitleInput')?.value || '').trim() || 'FOLDER';
      } else if (kind === 'child') {
        title = ($('wizardContentTitleInput')?.value || '').trim() || 'ITEM';
      } else if (kind === 'contact') {
        title = ($('wizardContactTitle')?.value || '').trim() || 'CONTACT US';
      }

      const nodeData = { title, kind };

      if (kind === 'parent') {
        nodeData.children = activeEditingNodeId ? (findNodeInfo(activeEditingNodeId)?.node?.children || []) : [];
      } else if (kind === 'child') {
        nodeData.contentType = wizardState.contentType;
        const url = ($('wizardUrlInput')?.value || '').trim();

        const existingNode = activeEditingNodeId ? findNodeInfo(activeEditingNodeId)?.node : null;
        const existingContent = existingNode?.content || {};

        nodeData.content = {
          url,
          fileName: pendingNodeFileName || existingContent.fileName || '',
          fileBlob: pendingNodeFileBlob || existingContent.fileBlob || null
        };

        if (wizardState.contentType === 'gallery') {
          nodeData.content.images = pendingGalleryImages;
        }
        // A 360° tour stores a tourId reference, not a URL/file — the panos live in
        // tour.json and are shipped by Export like any other project image.
        if (wizardState.contentType === 'panotour') {
          nodeData.content.tourId = ($('wizardTourSelect')?.value || wizardState.tourId || existingContent.tourId || '');
        }
      } else if (kind === 'contact') {
        const existingNode = activeEditingNodeId ? findNodeInfo(activeEditingNodeId)?.node : null;
        const existingContact = existingNode?.contact || {};

        nodeData.contact = {
          title,
          about: ($('wizardContactAbout')?.value || '').trim(),
          phone: ($('wizardContactPhone')?.value || '').trim(),
          email: ($('wizardContactEmail')?.value || '').trim(),
          image: pendingContactImageName ? `sample/${pendingContactImageName}` : (existingContact.image || ''),
          imageName: pendingContactImageName || existingContact.imageName || '',
          imageBlob: pendingContactImageBlob || existingContact.imageBlob || null
        };
      }

      // Handle multi-file upload batch creation
      if (!activeEditingNodeId && wizardState.sourceType === 'upload' && Array.isArray(wizardState.selectedFiles) && wizardState.selectedFiles.length > 1) {
        const baseTitle = ($('wizardContentTitleInput')?.value || '').trim();
        let lastCreated = null;
        for (let i = 0; i < wizardState.selectedFiles.length; i++) {
          const file = wizardState.selectedFiles[i];
          const cleanName = file.name.replace(/\.[^/.]+$/, '');
          let itemTitle = cleanName;
          if (baseTitle && baseTitle !== cleanName) {
            itemTitle = `${baseTitle} ${i + 1}`;
          }
          const itemNodeData = {
            title: itemTitle,
            kind: 'child',
            contentType: wizardState.contentType,
            content: {
              url: '',
              fileName: file.name,
              fileBlob: file
            }
          };
          lastCreated = addNode(parentId, itemNodeData);
        }
        if (parentId !== 'root') {
          state.collapsedFolders.delete(parentId);
        }
        onAlignmentChanged();
        renderClientSidebar();
        renderAdminMenuTree();
        await syncCustomMenuFilesToDisk();
        return lastCreated;
      }

      let createdOrUpdatedNode = null;
      if (activeEditingNodeId) {
        createdOrUpdatedNode = updateNode(activeEditingNodeId, nodeData, parentId);
      } else {
        createdOrUpdatedNode = addNode(parentId, nodeData);
      }

      onAlignmentChanged();
      renderClientSidebar();
      renderAdminMenuTree();
      await syncCustomMenuFilesToDisk();
      return createdOrUpdatedNode;
    } finally {
      isSavingWizard = false;
    }
  };

  // ─── Wizard Next / Save Button ──────────────────────────────────
  $('wizardNextBtn')?.addEventListener('click', async (e) => {
    e.stopPropagation();

    // Step 2a: Folder validation & save / step transition
    if (wizardState.step === 2 && wizardState.kind === 'parent') {
      const fTitle = ($('wizardFolderTitleInput')?.value || '').trim();
      if (!fTitle) {
        showNotice('Please enter a folder name / title.');
        return;
      }
      wizardState.title = fTitle;

      const isPlacementPreset = wizardState.presetParentId && wizardState.presetParentId !== 'root' && wizardState.mode === 'create';
      if (isPlacementPreset || wizardState.mode === 'edit') {
        await executeWizardSave();
        closeCustomModal(els.adminNodeBuilderModal);
        return;
      } else {
        wizardState.step = 3; // Placement picker
        updateWizardStepUI();
        return;
      }
    }

    // Step 2b: Content Item validation & step transition
    if (wizardState.step === 2 && wizardState.kind === 'child') {
      const cTitle = ($('wizardContentTitleInput')?.value || '').trim();
      if (!cTitle) {
        showNotice('Please enter an item title.');
        return;
      }
      wizardState.title = cTitle;
      wizardState.url = ($('wizardUrlInput')?.value || '').trim();

      const isPlacementPreset = wizardState.presetParentId && wizardState.presetParentId !== 'root' && wizardState.mode === 'create';
      if (isPlacementPreset || wizardState.mode === 'edit') {
        await executeWizardSave();
        closeCustomModal(els.adminNodeBuilderModal);
        return;
      } else {
        wizardState.step = 3; // Placement picker
        updateWizardStepUI();
        return;
      }
    }

    // Step 2c: Contact Card Save
    if (wizardState.step === 2 && wizardState.kind === 'contact') {
      wizardState.title = ($('wizardContactTitle')?.value || '').trim() || 'CONTACT US';
      await executeWizardSave();
      closeCustomModal(els.adminNodeBuilderModal);
      return;
    }

    // Step 3: Placement Picker Transition / Folder Save
    if (wizardState.step === 3) {
      if (wizardState.kind === 'parent') {
        await executeWizardSave();
        closeCustomModal(els.adminNodeBuilderModal);
        return;
      }
      wizardState.step = 4; // Confirm
      updateWizardStepUI();
      return;
    }

    // Step 4 or Edit Mode: Final Save
    if (wizardState.step === 4 || wizardState.mode === 'edit') {
      await executeWizardSave();
      closeCustomModal(els.adminNodeBuilderModal);
    }
  });

  // Client Sub-Menu back button
  $('catSubMenuBackBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.menuNavStack && state.menuNavStack.length > 0) {
      // Backing all the way out of the tour-list/room-list levels while a tour is still
      // open would otherwise land on the root menu with the pano still showing a tour
      // room — a state this app deliberately never allows (see closePanoTour's own
      // comment: only actually EXITING resets to root). Exit for real instead, same as
      // the room list's own "✕ Exit Tour" row.
      const wasTourNode = isTourMenuNode(state.menuNavStack[state.menuNavStack.length - 1]);
      state.menuNavStack.pop();
      const stillTourNode = state.menuNavStack.length > 0 && isTourMenuNode(state.menuNavStack[state.menuNavStack.length - 1]);
      if (state.tourView && wasTourNode && !stillTourNode) { closePanoTour(); return; }
      renderClientSidebar();
    }
  });

  // Gallery Lightbox Navigation & Closing
  $('galleryPrevBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateGallerySlide(currentGalleryIdx - 1);
    restartGalleryAutoplayIfRunning();
  });
  $('galleryNextBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateGallerySlide(currentGalleryIdx + 1);
    restartGalleryAutoplayIfRunning();
  });
  $('galleryAutoplayBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleGalleryAutoplay();
  });
  $('galleryCloseBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeClientGalleryModal();
  });
  els.clientGalleryModal?.querySelector('.gallery-lightbox-backdrop')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeClientGalleryModal();
  });

  // Touch Swipe Support for Gallery
  let touchStartX = 0, touchStartY = 0;
  const stage = $('galleryStage') || els.clientGalleryModal;
  if (stage) {
    stage.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) updateGallerySlide(currentGalleryIdx + 1);
          else updateGallerySlide(currentGalleryIdx - 1);
          restartGalleryAutoplayIfRunning();
        }
      }
    }, { passive: true });
  }

  document.addEventListener('keydown', (e) => {
    if (els.clientGalleryModal && els.clientGalleryModal.classList.contains('open')) {
      if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault();
        updateGallerySlide(currentGalleryIdx - 1);
        restartGalleryAutoplayIfRunning();
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault();
        updateGallerySlide(currentGalleryIdx + 1);
        restartGalleryAutoplayIfRunning();
      } else if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        closeClientGalleryModal();
      }
    }
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

  // Modal Close buttons (data-close)
  document.querySelectorAll('.custom-feature-modal [data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) closeCustomModal(modal);
    });
  });
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
  const pdfBox = modalEl.querySelector('.brochure-canvas');
  if (pdfBox) pdfBox.textContent = '';   // drop the rendered page canvases — they can be tens of MB on a long brochure
}

// ─── Offline support (PWA) — client only ───────────────────────────────────
// Must match VERSION in sw.js — used to version the offline-banner localStorage keys so
// bumping the SW version automatically re-shows the banner to users who dismissed it
// under the old version (they need to re-download into the new cache namespace).
const SW_VERSION = 'v12';
// sw.js caches the app shell + project data + on-demand video so the client experience
// keeps working with no signal once it's been opened at least once online. Never
// registered on ?admin=1 pages — sw.js's own admin passthrough is a second guard for the
// case where the same browser already has the worker installed from an earlier client
// visit. Requires a secure context (https:// or localhost — verified directly: a service
// worker refuses to register under file:// or a plain LAN http:// origin with a "URL
// protocol... not supported" error), so this silently no-ops there instead of erroring;
// the rest of the app is unaffected either way.
// The app shell (app.js/styles.css/index.html) is cached stale-while-revalidate (sw.js):
// a returning visit renders the CACHED copy instantly while fetching the latest version
// in the background for next time — a real fix shipped to the server is otherwise
// invisible to an already-cached phone until a SECOND visit. Reloading once when a new
// worker actually takes control (skipWaiting+clients.claim already make that happen
// automatically) closes that gap — `refreshedOnce` guards against a reload loop.
// Only reload when a worker REPLACES an existing one (a genuine update). On a first visit
// there's no controller yet, and clients.claim() fires this same event — reloading there
// was a self-inflicted bug: every first visit reloaded mid-boot, which discarded the
// captured beforeinstallprompt event, so tapping Add downloaded the content but silently
// offered no home-screen shortcut (there was nothing left to prompt with).
const hadControllerAtLoad = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
let refreshedOnce = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (!hadControllerAtLoad || refreshedOnce) return;
  refreshedOnce = true;
  window.location.reload();
});

// Point the manifest (and the iOS touch icon) at THIS project, so the installed home-screen
// icon and name are the admin's branding rather than a generic Build91 one. The manifest is
// static JSON by nature, so the per-project version is generated by server.py's
// /manifest.webmanifest route — it reads the same ?project= appended here. Runs during
// module evaluation, well before the browser evaluates installability. Skipped in a
// standalone bundle, which has no server to generate anything and ships the static file.
function setupPwaIdentity() {
  if (BUNDLE) return;
  const q = `?project=${encodeURIComponent(state.projectId || 'sample')}`;
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = `manifest.webmanifest${q}`;
  const touch = document.querySelector('link[rel="apple-touch-icon"]');
  if (touch) touch.href = `api/pwa-icon-192.png${q}`;
}
setupPwaIdentity();

// Just captures the event for maybeOfferOfflineSave's single "Add" button to fire later
// (see its own comment) — this listener itself doesn't show anything, since the one
// combined banner already covers both the install offer and the content download.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (els.offlineSaveBanner) els.offlineSaveBanner.hidden = true;   // covers installing via the browser's own menu instead of our button
  try { localStorage.setItem('b91-pwa-installed', '1'); } catch {}
});

async function registerOfflineSupport() {
  // Mobile-only, on purpose: desktop already has a real offline mechanism (⋯ → Export
  // standalone site…, a genuine local file/host-anywhere copy) — this whole PWA layer
  // exists specifically for phones, which can't use that export the same way (see the
  // Mobile Offline Rollout doc). Reuses the same width+orientation checks the rest of the
  // mobile-responsive pass already relies on to distinguish a real phone from a resized
  // desktop window ("never true on a real desktop window" — see their own definitions).
  if (!('serviceWorker' in navigator)) return;
  if (state.admin || !(isMobilePortrait() || isMobileLandscape())) {
    // Actively revert, not just skip: a browser that visited before this mobile gate
    // existed may already have sw.js registered and controlling the page, which keeps
    // satisfying the browser's own beforeinstallprompt eligibility on every later visit
    // regardless of this gate — unregistering here is what actually stops it going forward.
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('b91-')).map((k) => caches.delete(k)));
      }
    } catch {}
    return;
  }
  let ready = false;
  try {
    await navigator.serviceWorker.register('sw.js');
    // .ready resolves once a worker is actually active/controlling — the precondition for
    // both caching downloads and the install offer below. Races it against a timeout so a
    // stalled activation (a flaky connection, or another open tab pinning an older worker)
    // can't silently wedge the rest of boot — falls through to the install offer alone.
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(rej, 5000))]);
    ready = true;
  } catch {
    // unsupported browser / insecure origin / activation timeout — app still works online, just not offline
  }
  return ready;
}

// Registration has to happen EARLY (so the worker can cache boot fetches — see init), but the
// offline banner has to happen LATE, and the two were fused until 2026-09-12 with real
// consequences. maybeOfferOfflineSave calls collectOfflineAssets(), which reads
// state.menuConfig/landmarks/amenities/tours to decide what to download. Offering it the
// moment registration finished meant racing boot: if the worker went active before the
// project finished loading, the banner collected only the handful of config files that
// collectOfflineAssets adds unconditionally and offered a ~19KB download instead of the real
// ~213MB one. Tapping Add then cached the config and NOTHING else — so the menu worked
// offline while every video, image and PDF behind it was missing, which is exactly the
// "video and images stopped working offline" report that led here. Whoever wins that race is
// down to connection speed and whether the worker was already installed, which is why it
// looked intermittent. Registration is kicked off at the top of init and only awaited here,
// at the end, so the banner always sees a fully loaded project.
// The small per-project files the client cannot render a real menu without. Shared with
// collectOfflineAssets so the eager download and the warm-up below can't drift apart.
const OFFLINE_CONFIG_FILES = ['alignment.json', 'plots.svg', 'plots.csv', 'landmarks.json', 'amenities.json', 'tour.json'];

// Re-request the project config once the worker is genuinely active, so it lands in the
// cache even on a FIRST visit. A service worker only intercepts fetches once it controls the
// page, and on a first visit it is usually still installing while boot fetches this exact
// config — so nothing caches it, and the visitor's NEXT load (offline) falls back to the
// built-in rows alone: no LOCATION INTELLIGENCE, no BROCHURE, no authored items at all.
// Measured 2026-09-12: a visitor who declined the download and visited once had the full
// 43.7MB video sitting in the cache and no menu row left to reach it with; a second online
// visit fixed it by itself. This closes that first-visit window for ~30KB, and costs nothing
// afterwards (these are already-cached URLs by then, and staying network-first keeps them
// fresh). Deliberately NOT extended to the pano/site-plan images: those are megabytes, and
// the visitor who wants them offline has the "Add" button, which fetches everything.
async function warmOfflineConfigCache() {
  const pid = state.projectId || 'sample';
  await Promise.all(OFFLINE_CONFIG_FILES.map((f) =>
    fetch(`projects/${pid}/${f}`, { cache: 'no-store' }).catch(() => {})));
}

async function offerOfflineSaveAfterBoot(registration) {
  try {
    if (!(await registration)) return;
    await warmOfflineConfigCache();
    await maybeOfferOfflineSave();
  } catch {}
}

// ─── Add to Home Screen + save-for-offline (one combined prompt) ───────────
// Originally two separate prompts shown back to back (content download, then a plain
// install offer) — collapsed into one after the user pointed out both were really asking
// for the same "get this ready for offline" intent, and having a separate manual download
// step before the (already separate) native install step just felt redundant. One tap on
// "Add" now does both jobs at once: fires the native install prompt (where available) AND
// starts the content download, in parallel — the two are unrelated under the hood (the
// native prompt just builds an app-icon wrapper, it has no idea what a "gallery photo" is;
// the content download is the only thing that makes the site actually usable offline —
// see the discussion this session), so neither needs to wait on the other's outcome.
// Sizes/consent are still shown up front before the tap, and video is still eagerly
// included per the user's explicit request — but as one action, not two.
function collectOfflineAssets() {
  const items = [];
  const seen = new Set();
  // assetUrl() returns the raw string unchanged for anything already absolute
  // (http(s)/data:/blob:) and a plain same-origin relative path otherwise (see its own
  // comment) — so "local" here just means "not one of those absolute forms".
  const isLocal = (u) => !!u && !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//');
  const add = (u, kind) => { if (isLocal(u) && !seen.has(u)) { seen.add(u); items.push({ url: u, kind }); } };

  if (state.panoImage?.file) add(assetUrl(state.panoImage.file), 'image');
  if (state.groundImage?.file) add(assetUrl(state.groundImage.file), 'image');
  if (state.brand?.logo) add(assetUrl(state.brand.logo), 'image');
  if (state.bootImage?.file) add(assetUrl(state.bootImage.file), 'image');
  if (state.audio?.file) add(siteAudioSrc(), 'audio');   // background music, same treatment as any other local asset
  for (const lm of state.landmarks || []) if (lm.render) add(renderSrc(lm), 'image');
  for (const am of state.amenities || []) if (am.render) add(renderSrc(am), 'image');
  // Virtual-tour room panoramas — one equirectangular JPEG per node, across every tour in
  // tour.json. Missing from this walk until 2026-09-12, found by auditing every asset the
  // project references against what a real offline device could actually fetch: all 17 of
  // this project's tour panoramas came back 503 offline, so VIRTUAL TOUR was the one headline
  // feature that stayed broken with no signal — the room list opened, then every room landed
  // on a blank sphere. They're only requested when a visitor opens that specific room, so
  // opportunistic runtime caching never reached them either unless someone had walked all
  // nine tours online first. parseTours normalises each node's pano to a plain path string
  // (see its own comment), which is what assetUrl expects.
  // Both renders of a room, where a second one exists (2026-09-21): the furnished/unfurnished
  // toggle is useless offline if only one side was precached, and the visitor gets no warning
  // that the other is missing until they tap it.
  for (const t of state.tours || []) for (const n of t.nodes || []) {
    if (n.pano) add(assetUrl(n.pano), 'image');
    if (n.panoAlt) add(assetUrl(n.panoAlt), 'image');
  }
  // Tour minimap images — same reasoning as the room panoramas above: only requested once
  // a tour with a map is actually opened, so runtime caching alone would never reach them.
  for (const t of state.tours || []) for (const m of t.maps || []) if (m.file) add(assetUrl(m.file, m._ver), 'image');

  // Custom menu tree — mirrors server.py's scan_menu_for_online_content's walk of the same
  // shape, but collecting local files to prefetch instead of flagging external ones. Plot
  // media (getPlotMediaList) is deliberately NOT walked here: those URLs are always meant
  // to point out to an externally-hosted tour/video by design (see noteIfExternal/the
  // export-flagging feature), so isLocal() would exclude them anyway.
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (!node || typeof node !== 'object') continue;
      if (node.kind === 'parent') { walk(node.children); continue; }
      // Contact card photo. A `contact` node carries no `content`, so the child-only walk
      // below skipped it entirely — a real gap found via device testing: the photo simply
      // wasn't there offline until the visitor happened to open the card while online,
      // after which the runtime cache picked it up and it "started working". Resolved the
      // same way the card itself does (openClientContactModal: assetUrl(c.image)) so the
      // cache key matches what the viewer will actually request.
      if (node.kind === 'contact') {
        const cc = node.contact || {};
        if (cc.image) add(assetUrl(cc.image), 'image');
        else if (cc.imageName) add(assetUrl(cc.imageName), 'image');
        continue;
      }
      if (node.kind !== 'child') continue;
      const c = node.content || {};
      const ctype = node.contentType || 'link';
      const kindFor = (t) => (t === 'video' ? 'video' : (t === 'pdf' ? 'pdf' : 'image'));
      if (ctype === 'gallery') {
        for (const img of c.images || []) {
          if (!img) continue;
          if (typeof img === 'string') { add(assetUrl(img), 'image'); continue; }
          if (img.fileName) add(assetUrl(img.fileName), 'image');
          else if (img.name && !/^https?:/i.test(img.name)) add(assetUrl(img.name), 'image');
          else if (img.url) add(assetUrl(img.url), 'image');   // a local path can live in `url` too — the viewer accepts that, so it has to be collected
        }
      } else if (c.fileName) {
        add(assetUrl(c.fileName), kindFor(ctype));
      } else if (c.url) {
        // Same fallback the viewers use (openClientVideoModal/Brochure/Tour all end at
        // assetUrl(rawUrl) for a non-absolute string). assetUrl passes a real external URL
        // through untouched, and add() drops anything that isn't same-origin, so a genuine
        // http(s) link is still correctly ignored here.
        add(assetUrl(c.url), kindFor(ctype));
      }
    }
  };
  walk(state.menuConfig?.tree);

  // Project data files — explicitly downloaded so the app works in airplane mode even if
  // the user taps "Add" immediately without fully navigating around first.
  // These are small JSON/CSV/SVG files that define the plots, alignment, landmarks and
  // amenities. Without them the map can't boot at all offline. They're fetched via
  // assetUrl so the path resolves correctly (projects/{pid}/...) and de-duped by `seen`.
  const pid = state.projectId || 'sample';
  // tour.json included since 2026-09-12 alongside the node panoramas above — boot fetches it
  // anyway, so it was usually cached by luck, but "usually" isn't what this list is for.
  const DATA_FILES = OFFLINE_CONFIG_FILES;
  for (const f of DATA_FILES) add(`projects/${pid}/${f}`, 'data');

  return items;
}

async function estimateOfflineSize(items) {
  const results = new Array(items.length);
  let idx = 0;
  const CONC = 6;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      let size = 0;
      try {
        const res = await fetch(items[i].url, { method: 'HEAD', cache: 'no-store' });
        size = parseInt(res.headers.get('content-length') || '0', 10) || 0;
      } catch {}
      results[i] = { ...items[i], size };
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, items.length) }, worker));
  return { items: results, totalBytes: results.reduce((s, r) => s + (r.size || 0), 0) };
}

// Browsers hand a site a limited, evictable storage budget by default — and will silently
// throw data away under pressure (iOS Safari also clears it after ~7 days of not opening
// the site). Asking for "persistent" storage is what lifts both limits: it exempts the
// data from eviction and, on Chromium, unlocks a much larger quota than the default
// best-effort allowance. It's a no-op where unsupported, and browsers are more willing to
// grant it during a user gesture, which is why this is called from the Add tap.
async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

// How much room this origin actually has left, or null if the browser won't say.
async function storageHeadroom() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const est = await navigator.storage.estimate();
    if (typeof est.quota !== 'number' || typeof est.usage !== 'number') return null;
    return Math.max(0, est.quota - est.usage);
  } catch { return null; }
}

function formatBytes(n) {
  if (!n || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 100 * 1024 * 1024 ? 1 : 0)} MB`;
}

function isIosSafari() {
  const isIos = /iP(hone|ad|od)/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  return isIos && isSafari;   // iOS never fires beforeinstallprompt on ANY browser — Safari is the only one that even has a manual Share-sheet path
}

// How many of these assets aren't in any b91- cache yet. Asked of Cache Storage directly
// rather than inferred from a localStorage "saved" flag, because the flag records only that a
// download once FINISHED — not that the content is still there. Those diverge for real: a
// browser can evict a non-persisted cache under storage pressure (iOS Safari also clears it
// after ~7 days unopened), and until 2026-09-12 a service-worker VERSION bump deleted the
// content caches outright. Either way the visitor was left with the flag set, the banner
// therefore suppressed, and nothing actually cached — no way back to a working offline copy
// short of clearing site data. Checking what's really stored is what makes that self-healing.
async function countMissingOfflineAssets(items) {
  if (!('caches' in window) || !items.length) return 0;
  try {
    const names = (await caches.keys()).filter((k) => k.startsWith('b91-'));
    if (!names.length) return items.length;
    const opened = await Promise.all(names.map((n) => caches.open(n)));
    let missing = 0;
    for (const it of items) {
      // sw.js keys entries with the cache-busting query stripped (see its cacheKeyFor), so
      // match on the bare URL or nothing would ever be found.
      const u = new URL(it.url, location.href);
      u.search = '';
      const key = u.toString();
      let found = false;
      for (const c of opened) { if (await c.match(key)) { found = true; break; } }
      if (!found) missing++;
    }
    return missing;
  } catch { return 0; }   // can't tell — don't nag on the strength of a failed probe
}

async function maybeOfferOfflineSave() {
  if (state.admin || !els.offlineSaveBanner || navigator.onLine === false) return;
  const pid = state.projectId || 'default';
  const standalone = isStandaloneDisplay();
  let saved = false, declined = false;
  try {
    saved = localStorage.getItem(`b91-offline-saved-${SW_VERSION}-${pid}`) === '1';
    declined = localStorage.getItem(`b91-offline-declined-${SW_VERSION}-${pid}`) === '1';
  } catch {}
  if (declined) return;   // they said no; respect it until the next SW version

  const assets = collectOfflineAssets();
  const iosManual = isIosSafari();
  const missing = await countMissingOfflineAssets(assets);
  // Everything's already downloaded: the banner has no content job left, so only show it if
  // there's still an INSTALL worth offering (i.e. not already installed, and never saved).
  if (missing === 0 && (saved || standalone)) return;
  // Nothing this banner could actually do: no content to fetch, and no install path either
  // (not a beforeinstallprompt browser, not iOS Safari's manual Share-sheet route, or already
  // running installed).
  if (!missing && !deferredInstallPrompt && !iosManual) return;

  // Already installed → "Add to Home Screen" is meaningless; this is purely a re-download.
  // That case exists because content can go missing under an intact install (see
  // countMissingOfflineAssets), and the home-screen icon is exactly where such a visitor
  // lives — suppressing the banner there used to leave them with no route back at all.
  if (els.offlineSaveTitle) els.offlineSaveTitle.textContent = standalone ? 'Download for offline use' : 'Add to Home Screen';
  const sizeLabel = (bytes) => {
    const size = formatBytes(bytes);
    const base = assets.length ? (size ? `Includes offline access — approx. ${size}` : 'Includes offline access') : 'Opens instantly next time';
    if (standalone) return size ? `Approx. ${size} · so it works with no signal` : 'So it works with no signal';
    return iosManual ? `${base} · tap Share → Add to Home Screen after` : base;
  };
  if (els.offlineSaveSize) els.offlineSaveSize.textContent = assets.length ? 'Checking size…' : sizeLabel(0);

  els.offlineSavePrompt.hidden = false;
  els.offlineSaveProgress.hidden = true;
  els.offlineSaveBanner.hidden = false;

  const { items, totalBytes } = assets.length ? await estimateOfflineSize(assets) : { items: [], totalBytes: 0 };
  if (els.offlineSaveSize) {
    // Say so BEFORE they commit if the phone plainly can't hold it, rather than letting
    // them sit through a download that gets silently truncated at the quota.
    const headroom = await storageHeadroom();
    const tooBig = headroom !== null && totalBytes > 0 && totalBytes > headroom;
    els.offlineSaveSize.textContent = tooBig
      ? `${sizeLabel(totalBytes)} · may exceed this phone's free space (${formatBytes(headroom)} left)`
      : sizeLabel(totalBytes);
  }

  await new Promise((resolve) => {
    const onSkip = () => {
      els.offlineSaveSkip.removeEventListener('click', onSkip);
      els.offlineSaveGo.removeEventListener('click', onGo);
      els.offlineSaveBanner.hidden = true;
      try { localStorage.setItem(`b91-offline-declined-${SW_VERSION}-${pid}`, '1'); } catch {}
      resolve();
    };
    const onGo = async () => {
      els.offlineSaveSkip.removeEventListener('click', onSkip);
      els.offlineSaveGo.removeEventListener('click', onGo);
      // prompt() only works inside the tap that triggered it, so it can't be deferred or
      // retried later — if the browser hasn't handed us an install event by now, the only
      // honest option is telling the visitor where the manual control lives (below).
      let promptedInstall = false;
      if (deferredInstallPrompt) {
        const p = deferredInstallPrompt;
        deferredInstallPrompt = null;
        promptedInstall = true;
        p.prompt();               // native install dialog — fire-and-forget, doesn't block the content download below
        p.userChoice.catch(() => {});
      }
      // Ask for non-evictable storage while we're still inside the tap that requested it —
      // this is what gives the videos room to land and keeps them from being cleared later.
      await requestPersistentStorage();
      if (items.length) await runOfflineDownload(items, totalBytes, pid);
      if (!promptedInstall && !isStandaloneDisplay()) {
        showNotice(iosManual
          ? 'Saved for offline. To add the icon: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.'
          : 'Saved for offline. To add the icon: open your browser <strong>menu (⋮)</strong>, then <strong>Install app</strong> / <strong>Add to Home screen</strong>.');
      }
      else els.offlineSaveBanner.hidden = true;
      resolve();
    };
    els.offlineSaveSkip.addEventListener('click', onSkip);
    els.offlineSaveGo.addEventListener('click', onGo);
  });
}

async function runOfflineDownload(items, totalBytes, pid) {
  els.offlineSavePrompt.hidden = true;
  els.offlineSaveProgress.hidden = false;

  let bytesDone = 0;
  const startedAt = Date.now();
  const knownTotal = totalBytes > 0 ? totalBytes : items.length;   // falls back to a per-item unit if HEAD sizes were unavailable
  const bump = (n) => {
    bytesDone += n;
    const pct = Math.min(99, Math.round((bytesDone / knownTotal) * 100));
    if (els.offlineSaveBarFill) els.offlineSaveBarFill.style.width = pct + '%';
    if (els.offlineSavePct) els.offlineSavePct.textContent = pct + '%';
    const elapsed = (Date.now() - startedAt) / 1000;
    if (els.offlineSaveEta && elapsed > 1 && bytesDone > 0) {
      const remain = Math.max(0, knownTotal - bytesDone);
      const etaSec = remain / (bytesDone / elapsed);
      els.offlineSaveEta.textContent = etaSec > 8 ? `~${Math.max(1, Math.ceil(etaSec / 60))} min left` : 'almost done';
    }
  };

  // A failed/incomplete fetch used to be counted the same as a real success just to keep
  // the bar moving — meaning "100% / Done" could mean "actually cached" or "silently
  // failed" with no way to tell the difference (a real bug: a Brochure PDF reported done
  // but wasn't actually available offline). Now each item gets one retry, a non-OK
  // response (including sw.js's own synthetic 503 "Offline" placeholder, if something
  // upstream failed) counts as a failure not a success, and the final state — and whether
  // this project gets marked "saved" at all — honestly reflects what actually cached.
  const failed = [];
  async function fetchOnce(item) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error('status ' + res.status);
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) bump(value.length);
      }
    } else {
      await res.blob();
      bump(item.size || 1);
    }
  }

  // Smaller files first, video last: if the connection can't sustain everything (today's
  // demo tunnel has already dropped requests under load — see above), the cheap, fast
  // items are the ones most likely to land, and the videos — the expensive part — are what
  // contends for bandwidth the least once they're the only thing left in flight. Lower
  // concurrency than a normal connection would warrant, for the same reason.
  const kindWeight = { image: 0, pdf: 0, video: 1 };
  const queue = items.slice().sort((a, b) => (kindWeight[a.kind] ?? 0) - (kindWeight[b.kind] ?? 0));
  const CONC = 2;
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      try {
        await fetchOnce(item);
      } catch {
        try { await fetchOnce(item); }   // one retry — the free tunnel used for today's demo drops occasional requests under concurrent load
        catch { failed.push(item); bump(item.size || 1); }   // still bump so the bar reaches 100% instead of stalling — failure is tracked separately below, not hidden
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, worker));

  // Downloading a file is NOT the same as it being stored. sw.js writes to the cache with
  // cache.put(), and that can reject on its own — most plausibly a per-origin storage
  // quota, which video is by far the most likely thing to blow past (mobile browsers cap
  // this, iOS Safari tightly). Those writes happen in the worker, detached from the
  // response the page sees, so a quota failure would otherwise be invisible here and get
  // reported as a success — exactly the false "Done" this whole flow already got burned
  // by once. So: ask the cache what it ACTUALLY holds before claiming anything.
  const stored = await verifyCachedItems(items.filter((i) => !failed.includes(i)));
  const missing = failed.length + stored.missing.length;

  if (els.offlineSaveBarFill) els.offlineSaveBarFill.style.width = '100%';
  if (els.offlineSavePct) els.offlineSavePct.textContent = '100%';
  if (missing) {
    // Name the cause: "download failed" and "phone wouldn't store it" need different
    // responses from whoever is looking at this (retry vs. free up space / trim the project).
    const headroom = await storageHeadroom();
    const outOfSpace = headroom !== null && headroom < 5 * 1024 * 1024;
    if (els.offlineSaveEta) {
      els.offlineSaveEta.textContent = outOfSpace
        ? `${items.length - missing}/${items.length} saved — phone storage full`
        : `${items.length - missing}/${items.length} saved`;
    }
    // Deliberately NOT marking this project "saved" — leaving the flag unset means the
    // prompt offers again on a later visit instead of silently declaring victory on a
    // partial save the visitor has no way to know about otherwise.
  } else {
    if (els.offlineSaveEta) els.offlineSaveEta.textContent = 'Done';
    try { localStorage.setItem(`b91-offline-saved-${SW_VERSION}-${pid}`, '1'); } catch {}
  }
  await new Promise((r) => setTimeout(r, missing ? 2600 : 1200));
  if (els.offlineSaveBanner) els.offlineSaveBanner.hidden = true;
}

// Confirms, against Cache Storage itself, which of these are genuinely available offline.
// The page shares the same Cache Storage as sw.js, so it can check the worker's work
// directly. Keys are stored query-stripped (see sw.js's cacheKeyFor), so match the same way.
async function verifyCachedItems(items) {
  const missing = [];
  if (!('caches' in window)) return { missing };   // can't verify → don't claim failure either
  for (const item of items) {
    try {
      const hit = await caches.match(item.url.split('?')[0]);
      if (!hit) missing.push(item);
    } catch { /* a failed check isn't evidence of a failed save — leave it out of `missing` */ }
  }
  return { missing };
}

function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// ─── Boot ───────────────────────────────────────────────────────────────────
(async function init() {
  try {
    // Fire-and-forget, as early as possible — NOT at the end of boot where this used to
    // live. A service worker only intercepts fetches once it's actually active AND
    // controlling the page (`clients.claim()`); registering it after every other boot
    // fetch (alignment/plots/landmarks/amenities/tour) had already completed meant NONE of
    // that project config was ever cached on a genuine first visit — a phone that opened
    // the app once online, then went offline, found the menu reduced to just the built-in
    // rows (AERIAL VIEW/LANDMARKS/VIRTUAL TOUR — the only thing that doesn't need
    // menuConfig) with every authored item and every landmark/tour simply gone (confirmed
    // via a real offline reload in a real browser, not just reasoning about timing).
    // Starting registration here instead — concurrently with, not blocking, the rest of
    // boot — gives the worker the best realistic chance of being active before those
    // fetches fire, so `networkFirst`/`staleWhileRevalidate` actually get to cache them.
    // Still no guarantee on a very first, very slow-network visit (installing the worker
    // competes for the same bandwidth), but every visit after the first is unaffected
    // either way, and this makes the FIRST one far more likely to succeed too.
    // NOT awaited here, and the offline BANNER deliberately isn't offered from inside it —
    // that waits for the end of boot, once there's a loaded project to measure. See
    // offerOfflineSaveAfterBoot.
    const offlineRegistration = registerOfflineSupport();
    await loadGeometry();
    setBootProgress(3);
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
    if (chosen?.area) state.area = chosen.area;                        // area unit + admin-defined size bands
    if (chosen?.plotOverrides) state.plotOverrides = chosen.plotOverrides;   // admin edits that outrank the live sheet
    // site branding (title bar): alignment's brand (path) + session logo blob if any
    if (chosen?.brand) Object.assign(state.brand, { name: chosen.brand.name, tagline: chosen.brand.tagline, logo: chosen.brand.logo, _ver: chosen.brand._ver });
    if (restored?.brandLogo?.blob) { state.brand.logoBlob = restored.brandLogo.blob; state.brand.logoName = restored.brandLogo.name; if (!state.brand.logo) state.brand.logo = `sample/${restored.brandLogo.name}`; }
    if (chosen?.audio) Object.assign(state.audio, { file: chosen.audio.file, name: baseName(chosen.audio.file), _ver: chosen.audio._ver });
    if (chosen?.bootImage) Object.assign(state.bootImage, { file: chosen.bootImage.file, name: baseName(chosen.bootImage.file), _ver: chosen.bootImage._ver });
    if (chosen?.northDeg != null) state.northDeg = chosen.northDeg;
    if (restored?.siteAudio?.blob) { state.audio.blob = restored.siteAudio.blob; state.audio.name = restored.siteAudio.name; if (!state.audio.file) state.audio.file = `sample/${restored.siteAudio.name}`; }
    if (restored?.bootImage?.blob) { state.bootImage.blob = restored.bootImage.blob; state.bootImage.name = restored.bootImage.name; if (!state.bootImage.file) state.bootImage.file = `sample/${restored.bootImage.name}`; }
    applyBrand();
    applySiteAudio();
    // As early as the alignment is known (well before the much larger pano/ground-image
    // fetches below) so the custom loading-screen image covers most of the actual
    // loading window — see applyBootImage's own comment.
    applyBootImage();
    if (chosen?.menuConfig) {
      state.menuConfig = Object.assign({}, state.menuConfig, chosen.menuConfig);
    }
    initCustomMenuAdminAndClient();
    renderClientSidebar();
    // The root menu (just rendered) is clickable from this point — well before landmarks
    // ever load (setLandmarks(), which normally populates #catNav, doesn't run until
    // AFTER the pano texture and plot data have both finished loading, much later in this
    // same async chain). A visitor who taps LANDMARKS in that window saw a genuinely
    // empty picker — #catNav's static markup was deliberately emptied (2026-09-09,
    // "populated entirely by renderLandmarkCategoryNav()") on the assumption it would
    // always be populated before anyone could reach it, which this disproved. Calling it
    // here too — safe with zero landmarks loaded yet, since it always emits at least an
    // "ALL LANDMARKS" button — means an early tap sees a real, clickable picker (just with
    // nothing to show ON the pano yet) instead of a dead panel with no way back in but the
    // Back button. setLandmarks()'s own call to this function still refreshes it once the
    // real categories are known.
    renderLandmarkCategoryNav();
    // Decided here (menu tree known) rather than at the end of boot — see
    // computeAutoOpenTarget's comment. A plain content item or folder drill needs
    // nothing further and fires right away, before the pano itself even starts loading.
    const autoOpenTarget = computeAutoOpenTarget();
    if (autoOpenTarget && autoOpenTarget.kind === 'node') fireAutoOpen(autoOpenTarget);
    setBootProgress(8);
    // background pano: session blob > project's panoImage reference > neutral fallback
    let panoSrc = null;
    if (restored?.pano?.blob) { state.panoBlob = restored.pano.blob; state.panoName = restored.pano.name; state.panoImage = { file: restored.pano.name }; panoSrc = restored.pano.blob; }
    else if (chosen?.panoImage?.file) { state.panoImage = chosen.panoImage; panoSrc = assetUrl(chosen.panoImage.file); }
    // draped site-plan PNG: session blob (survives reload) > committed alignment reference > none.
    // Previously only fetched AFTER the pano had already revealed the curtain (loadGroundImage
    // ran post-initThree, and always did its own from-scratch network fetch) — a large plan
    // PNG then visibly popped in over an already-settled pano, sometimes seconds later, with
    // nothing telling the visitor it was still loading. Now pre-fetched as a plain Blob IN
    // PARALLEL with the pano below (loadGroundImage itself still has to run after initThree,
    // since it needs the live `three` scene — but by then the slow network part is already
    // done, leaving only a fast local decode).
    let planFile = null, planOpacity = 1, groundSrc = null;
    if (restored?.plan?.blob) { state.planBlob = restored.plan.blob; state.planName = restored.plan.name; groundSrc = restored.plan.blob; planFile = restored.plan.name; planOpacity = restored.plan.opacity ?? 1; }
    else if (chosen?.groundImage) { groundSrc = assetUrl(chosen.groundImage.file); planFile = chosen.groundImage.file; planOpacity = chosen.groundImage.opacity; }

    const panoNeedsFetch = panoSrc && !(panoSrc instanceof Blob);
    const groundNeedsFetch = groundSrc && !(groundSrc instanceof Blob);
    const panoWeight = panoNeedsFetch ? (groundNeedsFetch ? 45 : 90) : 0;
    const groundWeight = groundNeedsFetch ? (panoNeedsFetch ? 45 : 90) : 0;
    let panoLoaded = 0, panoTotal = 0, groundLoaded = 0, groundTotal = 0;
    const reportBootBytes = () => {
      const panoFrac = panoNeedsFetch ? (panoTotal ? panoLoaded / panoTotal : 0) : 1;
      const groundFrac = groundNeedsFetch ? (groundTotal ? groundLoaded / groundTotal : 0) : 1;
      setBootProgress(8 + panoFrac * panoWeight + groundFrac * groundWeight);
    };
    const panoBlobPromise = panoNeedsFetch
      ? fetchBlobWithProgress(panoSrc, (l, t) => { panoLoaded = l; panoTotal = t; reportBootBytes(); }).catch(() => null)
      : Promise.resolve(panoSrc);
    const groundBlobPromise = groundNeedsFetch
      ? fetchBlobWithProgress(groundSrc, (l, t) => { groundLoaded = l; groundTotal = t; reportBootBytes(); }).catch(() => null)
      : Promise.resolve(groundSrc);
    const [panoBlobOrSrc, groundBlobOrSrc] = await Promise.all([panoBlobPromise, groundBlobPromise]);

    let texture;
    if (panoBlobOrSrc) { try { texture = await loadPanoTexture(panoBlobOrSrc); } catch { texture = fallbackPanoTexture(); } }
    else texture = fallbackPanoTexture();                 // project has no pano yet → plain sky, app still runs
    setBootProgress(98);
    initThree(texture);
    wireAdmin();
    updatePanoName();
    // A 'node'/no-op target already fired (or has nothing to fire) — the pano is now
    // showing the correct screen, so reveal it. 'landmarks'/'panotour' targets keep the
    // curtain up a little longer, until their own fire point further down.
    if (!autoOpenTarget || autoOpenTarget.kind === 'node') hideBootCurtain();
    if (groundBlobOrSrc) {
      const url = (groundBlobOrSrc instanceof Blob) ? URL.createObjectURL(groundBlobOrSrc) : groundBlobOrSrc;
      await loadGroundImage(url, planOpacity, planFile);
      if (state.admin && state.groundImage) { els.axPlanRow.hidden = false; els.axPlanOpacity.value = planOpacity; els.axPlanOpacityVal.textContent = `${Math.round(planOpacity * 100)}%`; }
    }
    await loadData();
    if (restored && Array.isArray(restored.rows)) state.rows = indexRows(restored.rows); // session's edited statuses win (canonicalised to the layout ids)
    applyData();
    renderAreaFilterUI();     // needs state.rows + the alignment's `area` block, both settled by here
    // landmarks: session (freshest) > committed landmarks.json > none
    let lms = [];
    if (restored?.landmarks?.length) lms = parseLandmarks({ landmarks: restored.landmarks });
    else { const lmFile = await loadLandmarksFile(); if (lmFile) lms = lmFile; }
    setLandmarks(lms);
    // Fires the instant real landmark data exists — the earliest point the category
    // picker's "ALL" framing can actually reach the landmarks it needs to aim at.
    if (autoOpenTarget && autoOpenTarget.kind === 'landmarks') { fireAutoOpen(autoOpenTarget); hideBootCurtain(); }
    // amenities: session (freshest, incl. render blobs) > committed amenities.json > none
    let ams = [];
    if (restored?.amenities?.length) ams = parseAmenities({ amenities: restored.amenities });
    else { const amFile = await loadAmenitiesFile(); if (amFile) ams = amFile; }
    setAmenities(ams);
    // tours: session (freshest, incl. node pano blobs) > committed tour.json > none
    let trs = [];
    if (restored?.tours?.length) trs = parseTours({ tours: restored.tours });
    else { const trFile = await loadToursFile(); if (trFile) trs = trFile; }
    setTours(trs);
    // A `panotour` top item needs state.tours to resolve which tour to open.
    if (autoOpenTarget && autoOpenTarget.kind === 'panotour') { fireAutoOpen(autoOpenTarget); hideBootCurtain(); }
    if (restored && state.admin) setSessionStatus(`Restored your last session · saved ${new Date(restored.savedAt).toLocaleString()}`, true);
    initProjectBar();                                    // header project switcher / manage menu
    offerOfflineSaveAfterBoot(offlineRegistration);       // now that the project is loaded, there's something real to measure
    hideBootCurtain();                                    // safety net — idempotent, in case no branch above matched
  } catch (err) {
    console.error(err);
    hideBootCurtain();                                    // never leave the visitor stuck behind it on a boot error
    const webgl = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } })();
    showNotice(webgl
      ? `${err.message}. If you opened this file directly (file://), run a static server — e.g. <code>python -m http.server</code> — then reload.`
      : `This browser/GPU could not start WebGL, which the 360° viewer needs. Try a different browser or enable hardware acceleration.`);
  }
})();
