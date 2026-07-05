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
  renderUrl: 'sample/EleganzaPano360.web.jpg', // texture-safe copy of the 12000×6000 original
  plotsSvgUrl: 'sample/plots.svg',             // plot geometry (polygons in image-pixel space)
  plotsCsvUrl: 'sample/plots.csv',             // local data source (wired & live)
  alignmentUrl: 'sample/alignment.json',       // overlay transform (admin saves it here)

  TOUR_BASE_URL: 'https://demo.build91.in/Eleganza', // 3DVista deep-link base

  USE_GOOGLE_SHEET: false, SHEET_ID: '', SHEET_NAME: 'Sheet1',
  sheetCsvUrl(id, name) { return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`; },
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
  legend: $('legend'), syncMeta: $('syncMeta'), refreshBtn: $('refreshBtn'),
  tooltip: $('tooltip'), notice: $('notice'),
  zoomIn: $('zoomIn'), zoomOut: $('zoomOut'), zoomReset: $('zoomReset'), labelToggle: $('labelToggle'),
  panel: $('panel'), panelClose: $('panelClose'), panelBadge: $('panelBadge'),
  panelTitle: $('panelTitle'), panelBlock: $('panelBlock'), panelSize: $('panelSize'),
  panelPrice: $('panelPrice'), panelFacing: $('panelFacing'), panelDimensions: $('panelDimensions'),
  panelNotes: $('panelNotes'), walkBtn: $('walkBtn'), walkHint: $('walkHint'),
  modal: $('modal'), modalClose: $('modalClose'), modalTitle: $('modalTitle'),
  modalOpenNew: $('modalOpenNew'), modalSpinner: $('modalSpinner'), tourFrame: $('tourFrame'),
  // admin
  adminBar: $('adminBar'), axScale: $('axScale'), axScaleNum: $('axScaleNum'), axScaleDown: $('axScaleDown'), axScaleUp: $('axScaleUp'),
  axRot: $('axRot'), axRotNum: $('axRotNum'), axRotDown: $('axRotDown'), axRotUp: $('axRotUp'), axOpacity: $('axOpacity'), axOpacityVal: $('axOpacityVal'),
  axReset: $('axReset'), axLoad: $('axLoad'), axFile: $('axFile'), axSave: $('axSave'), axStatus: $('axStatus'),
  axSessionSave: $('axSessionSave'), axSessionClear: $('axSessionClear'), axSessionStatus: $('axSessionStatus'),
  axExport: $('axExport'), axModeLook: $('axModeLook'), axModeMove: $('axModeMove'), axImport: $('axImport'),
  axPlanRow: $('axPlanRow'), axPlanOpacity: $('axPlanOpacity'), axPlanOpacityVal: $('axPlanOpacityVal'),
  // trace editor
  traceWin: $('traceWin'), traceHint: $('traceHint'), traceFile: $('traceFile'), traceDxf: $('traceDxf'),
  traceFinish: $('traceFinish'), traceClose: $('traceClose'),
  traceModeAuto: $('traceModeAuto'), traceModeManual: $('traceModeManual'), traceModeEdit: $('traceModeEdit'),
  traceThresh: $('traceThresh'), traceThreshVal: $('traceThreshVal'), traceSimplify: $('traceSimplify'), traceSimplifyVal: $('traceSimplifyVal'),
  traceSnap: $('traceSnap'), traceUndo: $('traceUndo'), traceClear: $('traceClear'),
  traceDxfLayer: $('traceDxfLayer'), traceLayerSel: $('traceLayerSel'), traceCount: $('traceCount'), traceList: $('traceList'),
  traceStage: $('traceStage'), traceCanvas: $('traceCanvas'), traceEmpty: $('traceEmpty'),
};

// ─── State ──────────────────────────────────────────────────────────────────
const R = 500, R_PLOT = 492, R_DRAPE = 489, GROUND_H = 1; // R_DRAPE = PNG site-plan layer, just under the plot fills; GROUND_H = camera height above the ground plane (normalized)
const FOV_MIN = 20, FOV_MAX = 120; // field-of-view range; wide max lets the view zoom out to the whole site (past ~120° a perspective camera fisheyes hard)
const PANO_TEX_CAP = 8192; // target equirectangular width; actual cap = min(this, GPU max texture size) so it
                           // stays sharp on desktop (≤16384) yet auto-downscales to 4096 on mobile GPUs
function gpuMaxTexSize() { try { const g = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); return g ? g.getParameter(g.MAX_TEXTURE_SIZE) : 4096; } catch { return 4096; } }
const IDENTITY = () => ({ tx: 0, ty: 0, scale: 1, rotation: 0 }); // tx/ty = ground-plane offset (world units); rotation in radians
const state = {
  admin: new URLSearchParams(location.search).has('admin'),
  rows: new Map(), geom: [], imgW: 12000, imgH: 6000,
  anchor: { x: 6000, y: 3000 },         // cluster centroid in image px (pivot for scale/rotate)
  kGround: 0.0003,                      // px → ground-plane units (auto-calibrated in loadGeometry)
  transform: IDENTITY(),
  groundImage: null,                    // { file, opacity } — PNG site-plan draped on the ground (shares the transform)
  planBlob: null, planName: null,       // raw imported plan PNG (kept so the working session survives a reload pre-export)
  plots: new Map(), selectedId: null, hoverId: null,
  activeFilters: new Set(STATUS_ORDER),
  overlayOpacity: 0.5,
  showLabels: (() => { try { return localStorage.getItem('b91-show-labels') === '1'; } catch { return false; } })(), // plot-number annotations: optional, default off (remembered per browser)
  view: { lon: 0, lat: 0, fov: 70 }, home: { lon: 0, lat: 0, fov: 70 },
  savedView: null,                      // camera view stored in the alignment (WYSIWYG); null ⇒ auto-frame
  adminMode: 'look',                    // 'look' = drag rotates view; 'move' = drag repositions layout
};
let three = null, plotsDirty = false;
const labelCache = new Map();           // id → reusable label Sprite (avoid texture churn on rebuild)

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
async function loadData() {
  let text, sourceLabel = 'local sample';
  if (CONFIG.USE_GOOGLE_SHEET && CONFIG.SHEET_ID) {
    try {
      const res = await fetch(CONFIG.sheetCsvUrl(CONFIG.SHEET_ID, CONFIG.SHEET_NAME), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text(); sourceLabel = 'Google Sheet';
    } catch (err) { showNotice(`Could not reach the Google Sheet (${err.message}). Showing the local sample instead.`); }
  }
  if (text == null) {
    const res = await fetch(CONFIG.plotsCsvUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${CONFIG.plotsCsvUrl} (HTTP ${res.status})`);
    text = await res.text();
  }
  state.rows = new Map(parseCSV(text).map((r) => [r.plot_id, r]));
  return sourceLabel;
}

// ─── Geometry (polygons in image-pixel space) + anchor ────────────────────────
async function loadGeometry() {
  const res = await fetch(CONFIG.plotsSvgUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${CONFIG.plotsSvgUrl} (HTTP ${res.status})`);
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
async function loadPanoTexture(url) {
  const cap = Math.min(PANO_TEX_CAP, gpuMaxTexSize());
  let src;
  try {
    const bmp = await createImageBitmap(await (await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' })).blob());
    if (bmp.width > cap) {
      const W = cap, H = Math.round(bmp.height * cap / bmp.width);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(bmp, 0, 0, W, H); if (bmp.close) bmp.close(); src = c;
    } else src = bmp;
  } catch {
    const t = await new THREE.TextureLoader().loadAsync(url);   // fallback: no downscale
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 16; t.needsUpdate = true; return t;
  }
  const tex = new THREE.Texture(src);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 16;   // ← sharpens the nadir/zenith convergence (Three clamps to the GPU max); default 1 = the fuzzy "swirl"
  tex.needsUpdate = true;
  return tex;
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
  state.home.lon = (Math.atan2(mean.x, mean.z) + TAU) % TAU;
  state.home.lat = Math.asin(THREE.MathUtils.clamp(mean.y, -1, 1));
  let maxAng = 0; dirs.forEach((d) => { maxAng = Math.max(maxAng, mean.angleTo(d)); });
  state.home.fov = Math.max(35, Math.min(FOV_MAX, maxAng * 2 * 180 / Math.PI * 1.25));
  state.home.lat = clampLat(state.home.lat);                   // full range (incl. top-down) now allowed
}

// ─── Render loop (continuous rAF; rebuilds geometry first if marked dirty) ────
// A steady loop (rather than one-shot rAF) keeps the camera applied and a frame
// always painted — robust against background rAF throttling. Cheap for ~10–400
// flat meshes; could be made on-demand later if idle GPU cost ever matters.
function requestRender(rebuild = false) { if (rebuild) plotsDirty = true; }
function renderLoop() {
  requestAnimationFrame(renderLoop);
  if (!three) return;
  if (plotsDirty) { plotsDirty = false; rebuildPlots(); }
  updateCamera();
  three.renderer.render(three.scene, three.camera);
  if (els.panel.classList.contains('open')) placePanel();   // keep the popover glued to its plot as the view moves
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
  new ResizeObserver(debounce(onResize, 120)).observe(els.pano);
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
function pick(e) { const id = rayHit(e); if (id) openPanel(id); else if (els.panel.classList.contains('open')) closePanel(); }
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
  const status = STATUS_META[row.status] ? row.status : 'unknown';
  if (state.selectedId && state.selectedId !== id) restorePlotStyle(state.selectedId);
  state.selectedId = id;
  const p = state.plots.get(id);
  if (p) { applySelectStyle(p, status); requestRender(); }
  els.panelBadge.textContent = STATUS_META[status].label; els.panelBadge.className = `status-badge ${STATUS_META[status].cls}`;
  els.panelTitle.textContent = id.replace('Plot-', 'Plot '); els.panelBlock.textContent = row.block ? `Block ${row.block}` : '';
  els.panelSize.textContent = row.size || '—'; els.panelPrice.textContent = row.price || '—';
  els.panelFacing.textContent = row.facing || '—'; els.panelDimensions.textContent = row.dimensions || '—';
  els.panelNotes.textContent = row.notes || '';
  const hasTour = !!(row.tour_url && row.tour_url.trim());
  els.walkBtn.disabled = !hasTour; els.walkBtn.onclick = hasTour ? () => openModal(row) : null;
  els.walkHint.textContent = hasTour ? '' : (status === 'sold' ? 'This plot is sold — walkthrough unavailable.' : 'No walkthrough linked yet.');
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
}
function restorePlotStyle(id) {
  const p = state.plots.get(id); if (!p) return; const c = STATUS_META[p.status || 'unknown'].color;
  p.fill.material.color.setHex(c); p.fill.material.opacity = state.overlayOpacity; p.line.material.color.setHex(c); p.line.material.opacity = 0.95;
}
function closePanel() {
  els.panel.classList.remove('open'); els.panel.setAttribute('aria-hidden', 'true');
  if (state.selectedId) { restorePlotStyle(state.selectedId); state.selectedId = null; requestRender(); }
}

// ─── Tour modal ───────────────────────────────────────────────────────────────
let lastFocused = null;
function openModal(row) {
  lastFocused = document.activeElement;
  els.modalTitle.textContent = `Walkthrough · ${row.plot_id.replace('Plot-', 'Plot ')}`;
  els.modalOpenNew.href = row.tour_url; els.modalSpinner.style.display = 'grid';
  els.tourFrame.src = row.tour_url; els.tourFrame.onload = () => { els.modalSpinner.style.display = 'none'; };
  els.modal.classList.add('open'); els.modal.setAttribute('aria-hidden', 'false');
  document.addEventListener('keydown', onModalKey); setTimeout(() => els.modalClose.focus(), 0);
}
function closeModal() {
  els.modal.classList.remove('open'); els.modal.setAttribute('aria-hidden', 'true'); els.tourFrame.src = 'about:blank';
  document.removeEventListener('keydown', onModalKey); lastFocused?.focus?.();
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
function parseAlignment(d) {
  const t = (d && d.transform) ? d.transform : d || {};
  const transform = { tx: +t.tx || 0, ty: +t.ty || 0, scale: +t.scale || 1, rotation: (t.rotationDeg != null ? t.rotationDeg * Math.PI / 180 : +t.rotation || 0) };
  let view = null;
  if (d && d.view) { const v = d.view; view = { lon: (v.lonDeg != null ? v.lonDeg * Math.PI / 180 : +v.lon || 0), lat: (v.latDeg != null ? v.latDeg * Math.PI / 180 : +v.lat || 0), fov: +v.fov || 70 }; }
  const opacity = (d && d.opacity != null) ? +d.opacity : null;
  const gi = d && d.groundImage; const groundImage = (gi && gi.file) ? { file: gi.file, opacity: gi.opacity != null ? +gi.opacity : 1 } : null;
  return { transform, view, opacity, groundImage, savedAt: (d && d.savedAt) || '' };
}
async function loadAlignmentFile() {                    // committed file → {transform, view} | null
  try { const res = await fetch(`${CONFIG.alignmentUrl}?t=${Date.now()}`, { cache: 'no-store' }); if (!res.ok) return null; return parseAlignment(await res.json()); }
  catch { return null; }
}
function readDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? parseAlignment(JSON.parse(raw)) : null; } catch { return null; } }
function alignmentData() {
  return { version: 1, note: 'Build91 plot-map overlay alignment', savedAt: new Date().toISOString(),
    transform: { tx: +state.transform.tx.toFixed(4), ty: +state.transform.ty.toFixed(4), scale: +state.transform.scale.toFixed(4), rotationDeg: +(state.transform.rotation * 180 / Math.PI).toFixed(2) },
    view: { lonDeg: +(state.view.lon * 180 / Math.PI).toFixed(2), latDeg: +(state.view.lat * 180 / Math.PI).toFixed(2), fov: Math.round(state.view.fov) },
    opacity: +state.overlayOpacity.toFixed(2),
    ...(state.groundImage ? { groundImage: { file: state.groundImage.file, opacity: +(+state.groundImage.opacity).toFixed(2) } } : {}) };
}
function onAlignmentChanged() { if (!state.admin) return; try { localStorage.setItem(DRAFT_KEY, JSON.stringify(alignmentData())); } catch {} scheduleSessionSave(); setAxStatus('Unsaved changes — click Save file to export.'); }
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
  const text = JSON.stringify(alignmentData(), null, 2);
  if (window.showSaveFilePicker) {                       // native "Save As" dialog (Chromium)
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: 'alignment.json', types: [{ description: 'Alignment JSON', accept: { 'application/json': ['.json'] } }] });
      const w = await handle.createWritable(); await w.write(text); await w.close();
      setAxStatus(`Saved to <code>${handle.name}</code>. (Put it in <code>sample/</code> for the client.)`);
    } catch (e) { if (e.name !== 'AbortError') setAxStatus(`Save failed: ${e.message}`); }
  } else {                                                // fallback: plain download
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'alignment.json'; a.click(); URL.revokeObjectURL(a.href);
    setAxStatus('Downloaded <code>alignment.json</code> → move it into <code>sample/</code> for the client view.');
  }
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
function buildPlotsCSV() {
  const cols = ['plot_id', 'status', 'facing', 'size', 'dimensions', 'price', 'block', 'tour_url', 'notes'];
  const esc = (v) => { v = (v ?? '').toString(); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  const rows = state.geom.map((g) => { const r = state.rows.get(g.id) || { plot_id: g.id }; return cols.map((c) => esc(c === 'plot_id' ? g.id : r[c])).join(','); });
  return cols.join(',') + '\n' + rows.join('\n') + '\n';
}
// one-click export of the whole site to a folder (point it at sample/); resilient
// to locked/changed files (retry once, then download the stragglers) and falls
// back to plain downloads where the directory picker isn't supported.
async function exportSite() {
  if (!state.geom.length) { setAxStatus('Nothing to export yet — Import / Trace plots first.'); return; }
  const planBlob = trace.planBlob || state.planBlob || (trace.objURL ? await (await fetch(trace.objURL)).blob() : null);
  const planName = trace.srcName || state.planName || 'plan.web.png';
  const files = [
    ['plots.svg', buildPlotsSVG(), 'image/svg+xml'],
    ['plots.csv', buildPlotsCSV(), 'text/csv'],
    ['alignment.json', JSON.stringify(alignmentData(), null, 2), 'application/json'],
    ...(planBlob ? [[planName, planBlob, 'image/png']] : []),
  ];
  const download = (n, data, mime) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime })); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const tag = (arr) => arr.map((f) => `<code>${f[0]}</code>`).join(', ');

  if (window.showDirectoryPicker) {
    let dir;
    try { dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'b91-sample' }); }
    catch (e) { if (e.name === 'AbortError') return; setAxStatus(`Couldn’t open that folder: ${e.message}`); return; }
    const writeOnce = async (n, data) => { const fh = await dir.getFileHandle(n, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close(); };
    const failed = [];
    for (const f of files) {
      const [n, data] = f;
      try { await writeOnce(n, data); }
      catch { try { await new Promise((r) => setTimeout(r, 80)); await writeOnce(n, data); }   // retry re-reads fresh on-disk state
              catch { failed.push(f); } }
    }
    if (!failed.length) { setAxStatus(`Exported ${tag(files)} into that folder. Reload the client to see them.`); return; }
    failed.forEach(([n, data, mime]) => download(n, data, mime));                               // locked on disk → download instead
    setAxStatus(`Wrote ${tag(files.filter((f) => !failed.includes(f)))}. ${failed.length} file(s) were locked on disk (close them in any editor) — downloaded ${tag(failed)} instead; move them into <code>sample/</code>.`);
    return;
  }
  files.forEach(([n, data, mime]) => download(n, data, mime));
  setAxStatus(`Downloaded ${tag(files)} → drop them into <code>sample/</code>.`);
}
function wireAdmin() {
  if (!state.admin) return;
  document.body.classList.add('is-admin'); els.adminBar.hidden = false;
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
  els.axSessionSave.addEventListener('click', () => saveSession(true));
  els.axSessionClear.addEventListener('click', clearSession);
  els.axSave.addEventListener('click', saveAlignmentAs);
  els.axExport.addEventListener('click', exportSite);
  els.axLoad.addEventListener('click', () => els.axFile.click());
  els.axFile.addEventListener('change', async () => {
    const f = els.axFile.files?.[0]; if (!f) return;
    try {
      const a = parseAlignment(JSON.parse(await f.text()));
      state.transform = a.transform;
      if (a.opacity != null) state.overlayOpacity = a.opacity;
      if (a.groundImage) { loadGroundImage(a.groundImage.file, a.groundImage.opacity, a.groundImage.file); els.axPlanRow.hidden = false; els.axPlanOpacity.value = a.groundImage.opacity; els.axPlanOpacityVal.textContent = `${Math.round(a.groundImage.opacity * 100)}%`; }
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
  drawTrace();
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
    const li = document.createElement('li'); li.className = 'trace-li' + (i === trace.sel ? ' is-sel' : '');
    const idIn = document.createElement('input'); idIn.className = 'trace-id'; idIn.value = p.id.replace('Plot-', ''); idIn.title = 'Plot number';
    idIn.addEventListener('change', () => { p.id = 'Plot-' + idIn.value.trim(); drawTrace(); });
    const sel = document.createElement('select'); sel.className = 'trace-status';
    STATUS_ORDER.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = STATUS_META[s].label; if (s === p.status) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', () => { p.status = sel.value; drawTrace(); });
    const del = document.createElement('button'); del.className = 'trace-del'; del.type = 'button'; del.textContent = '×'; del.title = 'Delete plot';
    del.addEventListener('click', () => { trace.plots.splice(i, 1); if (trace.sel >= trace.plots.length) trace.sel = trace.plots.length - 1; refreshTraceList(); drawTrace(); });
    li.append(idIn, sel, del);
    li.addEventListener('click', (ev) => { if (ev.target.closest('input,select,button,.trace-edit')) return; trace.sel = (trace.sel === i ? -1 : i); refreshTraceList(); drawTrace(); });
    if (i === trace.sel) {                                // selected plot expands an inline data editor
      const ed = document.createElement('div'); ed.className = 'trace-edit';
      const field = (label, key, ph) => {
        const w = document.createElement('label'); w.className = 'trace-field'; w.append(document.createTextNode(label));
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = p[key] || ''; if (ph) inp.placeholder = ph;
        inp.addEventListener('input', () => { p[key] = inp.value; });
        w.appendChild(inp); return w;
      };
      ed.append(
        field('Price', 'price', 'e.g. ₹ 12,50,000'),
        field('Area', 'size', 'e.g. 1,500 sq ft'),
        field('Facing', 'facing', 'e.g. East'),
        field('Dimensions', 'dimensions', "e.g. 30' × 50'"),
        field('Tour URL', 'tour_url', 'https://…'),
        field('Notes', 'notes', ''),
      );
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
    ['size', 'price', 'facing', 'dimensions', 'tour_url', 'notes', 'block'].forEach((k) => { if (p[k] !== undefined) row[k] = p[k]; });
    state.rows.set(p.id, row);
  });
  labelCache.clear();                                   // ids changed → rebuild label sprites
  closeTrace();
  rebuildPlots(); computeHome(); Object.assign(state.view, state.home);
  if (trace.isRaster && trace.objURL) { state.planBlob = trace.planBlob; state.planName = trace.srcName; loadGroundImage(trace.objURL, state.groundImage?.opacity ?? 1, `sample/${trace.srcName}`); els.axPlanRow.hidden = false; els.axPlanOpacity.value = 1; els.axPlanOpacityVal.textContent = '100%'; }
  else { state.planBlob = null; state.planName = null; removeGround(); els.axPlanRow.hidden = true; }
  applyData(); requestRender(true); onAlignmentChanged();
  setAxStatus(`Imported ${state.geom.length} plots${trace.isRaster ? ' + plan image' : ''}. Align, fill data, then <strong>Export site files…</strong>${trace.isRaster ? ' (writes the resized plan image too)' : ''}.`);
}
async function openTrace() {
  trace.open = true; els.traceWin.classList.add('open'); els.traceWin.setAttribute('aria-hidden', 'false');
  if (state.geom.length) await loadCurrentLayoutIntoTrace();   // default to editing the live layout (price/status/retrace)
  requestAnimationFrame(() => { resizeTraceCanvas(); if (trace.W) fitTrace(); drawTrace(); });
}
// Pull the current working plots + their data + the plan image into the editor so
// the admin can tweak and re-commit, instead of always starting from a blank import.
async function loadCurrentLayoutIntoTrace() {
  trace.W = state.imgW; trace.H = state.imgH;
  trace.plots = state.geom.map((g) => {
    const r = state.rows.get(g.id) || {};
    return { id: g.id, status: STATUS_META[r.status] ? r.status : 'available', pts: g.pts.map((v) => ({ x: v.x, y: v.y })),
      size: r.size || '', price: r.price || '', facing: r.facing || '', dimensions: r.dimensions || '', tour_url: r.tour_url || '', notes: r.notes || '', block: r.block || '' };
  });
  trace.draft = null; trace.sel = -1;
  trace.seq = Math.max(0, ...state.geom.map((g) => { const m = /A(\d+)\b/.exec(g.id); return m ? +m[1] - 100 : 0; })); // keep new ids past existing A1xx
  if (state.planBlob) {                                  // rebuild the raster backdrop so Auto-trace works on the live plan
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && els.panel.classList.contains('open') && !els.modal.classList.contains('open')) closePanel(); });

const topbar = document.querySelector('.topbar');
const syncTopbarH = () => document.documentElement.style.setProperty('--topbar-h', topbar.offsetHeight + 'px');
new ResizeObserver(syncTopbarH).observe(topbar); syncTopbarH();

// release the WebGL context on unload (avoids leaking contexts across reloads/navigations)
window.addEventListener('pagehide', () => { try { three?.renderer?.forceContextLoss(); three?.renderer?.dispose(); } catch {} });

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
    const texture = await loadPanoTexture(CONFIG.renderUrl);
    initThree(texture);
    wireAdmin();
    if (restored?.plan?.blob) {                           // imported plan image, recovered from the session blob (survives reload pre-export)
      state.planBlob = restored.plan.blob; state.planName = restored.plan.name;
      const url = URL.createObjectURL(restored.plan.blob);
      await loadGroundImage(url, restored.plan.opacity ?? 1, `sample/${restored.plan.name}`);
      if (state.admin && state.groundImage) { els.axPlanRow.hidden = false; els.axPlanOpacity.value = restored.plan.opacity ?? 1; els.axPlanOpacityVal.textContent = `${Math.round((restored.plan.opacity ?? 1) * 100)}%`; }
    } else if (chosen?.groundImage) {                     // draped PNG site plan referenced by the alignment file
      await loadGroundImage(chosen.groundImage.file, chosen.groundImage.opacity, chosen.groundImage.file);
      if (state.admin && state.groundImage) { els.axPlanRow.hidden = false; els.axPlanOpacity.value = chosen.groundImage.opacity; els.axPlanOpacityVal.textContent = `${Math.round(chosen.groundImage.opacity * 100)}%`; }
    }
    const src = await loadData();
    if (restored && Array.isArray(restored.rows)) state.rows = new Map(restored.rows.map((r) => [r.plot_id, r])); // session's edited statuses win over the sample CSV
    applyData(); setSync(src);
    if (restored && state.admin) setSessionStatus(`Restored your last session · saved ${new Date(restored.savedAt).toLocaleString()}`, true);
  } catch (err) {
    console.error(err);
    els.syncMeta.textContent = 'Load error';
    const webgl = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } })();
    showNotice(webgl
      ? `${err.message}. If you opened this file directly (file://), run a static server — e.g. <code>python -m http.server</code> — then reload.`
      : `This browser/GPU could not start WebGL, which the 360° viewer needs. Try a different browser or enable hardware acceleration.`);
  }
})();
