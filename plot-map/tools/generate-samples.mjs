#!/usr/bin/env node
/**
 * generate-samples.mjs
 * -----------------------------------------------------------------------------
 * Generates the synthetic sample assets for the Build91 interactive plot map:
 *
 *   sample/plots.svg   — the plot overlay (one IRREGULAR shape per plot, id = plot_id)
 *   sample/plots.csv   — the data table (status / size / price / tour_url ...)
 *
 * Plots are organic, irregular parcels (like real rural-India subdivisions),
 * produced by a Voronoi tessellation of jittered seed points, clipped to an
 * irregular site boundary, and inset to leave lanes between plots.
 *
 * The backdrop is the real aerial 360° panorama (sample/EleganzaPano360*.jpg);
 * plots are laid over the site band of that image. The SVG viewBox matches the
 * panorama's pixel dimensions so the overlay registers 1:1.
 *
 * Scale 10 ⇄ 400 plots by changing ONE number — PLOT_COUNT — then re-run:
 *   node tools/generate-samples.mjs
 *
 * SVG CONTRACT (kept identical for real, surveyed geometry):
 *   - <svg> viewBox === render/panorama pixel dimensions  (1:1 registration)
 *   - each plot = a single shape with id="Plot-…" and class="plot"
 *   - NO inline fill on plots (status drives fill via CSS class at runtime)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Tunables ────────────────────────────────────────────────────────────────
const PLOT_COUNT = 10;          // ← change to 400 to stress-test; everything scales
const W = 12000, H = 6000;      // panorama pixel size = SVG viewBox (EleganzaPano360.jpg)

// Where on the panorama the plots sit, as fractions of the image. The real
// site (laid-out parcels + red-dirt roads) is the lower-centre foreground band.
// Nudge these to slot the overlay precisely over your render.
const SITE = { x0: 0.40, y0: 0.55, x1: 0.74, y1: 0.86 };

const RELAX = 1;                // Lloyd relaxation passes (0 = wildest, 2 = tidier)
const INSET = 0.90;             // shrink each parcel toward its centroid → lanes between plots
const TOUR_BASE_URL = 'https://demo.build91.in/Eleganza'; // real 3DVista tour base
const DEEPLINK_MEDIA = true;    // append ?media=<plot_id> to deep-link per plot (see note in app.js)

// Status mix + sample content pools
const STATUS_WEIGHTS = { available: 0.5, reserved: 0.25, sold: 0.2, unknown: 0.05 };
const RATE_PER_SQFT = 2800;     // ₹ per sq ft (price = size × rate)
const TARGET_MEDIAN_SQFT = 1600;// median parcel size; others scale by real cell area
const NOTE_POOL = [
  'Corner plot, east-facing', 'Road-facing', 'Near temple', 'Cul-de-sac, quiet',
  'Wide frontage', 'Premium location', 'Close to main gate', 'Greenbelt-facing',
  'South-facing', 'Near community hall', 'Vaastu-compliant', '',
];

// ─── Tiny seeded PRNG (deterministic output across runs) ──────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(91);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// ─── Geometry helpers ─────────────────────────────────────────────────────────
const V = (x, y) => ({ x, y });
const sub = (a, b) => V(a.x - b.x, a.y - b.y);
function polyArea(p) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; a += p[i].x * q.y - q.x * p[i].y; } return a / 2; }
function polyCentroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const j = (i + 1) % n, cross = p[i].x * p[j].y - p[j].x * p[i].y;
    a += cross; cx += (p[i].x + p[j].x) * cross; cy += (p[i].y + p[j].y) * cross;
  }
  a *= 0.5; return V(cx / (6 * a), cy / (6 * a));
}
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a.y > pt.y) !== (b.y > pt.y)) && (pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}
// Sutherland–Hodgman clip of `poly` against half-plane  a·x ≤ c
function clipHalfPlane(poly, a, c) {
  const out = [];
  const inside = (p) => a.x * p.x + a.y * p.y <= c + 1e-9;
  const isect = (s, e) => {
    const d = sub(e, s), denom = a.x * d.x + a.y * d.y;
    const t = (c - (a.x * s.x + a.y * s.y)) / denom;
    return V(s.x + t * d.x, s.y + t * d.y);
  };
  for (let i = 0; i < poly.length; i++) {
    const s = poly[(i + poly.length - 1) % poly.length], e = poly[i];
    const sIn = inside(s), eIn = inside(e);
    if (eIn) { if (!sIn) out.push(isect(s, e)); out.push(e); }
    else if (sIn) out.push(isect(s, e));
  }
  return out;
}
// Voronoi cell of seed p within `boundary`: clip by bisector half-plane vs every other seed.
function voronoiCell(p, seeds, boundary) {
  let cell = boundary;
  for (const q of seeds) {
    if (q === p) continue;
    const a = V(q.x - p.x, q.y - p.y);                       // normal toward q
    const c = (q.x * q.x + q.y * q.y - p.x * p.x - p.y * p.y) / 2; // keep side closer to p
    cell = clipHalfPlane(cell, a, c);
    if (cell.length < 3) break;
  }
  return cell;
}
// Andrew's monotone-chain convex hull
function convexHull(pts) {
  const p = [...pts].sort((u, v) => u.x - v.x || u.y - v.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop(); lower.push(pt); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const pt = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop(); upper.push(pt); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// ─── Build the irregular site boundary (irregular but convex, so Voronoi clips cleanly) ──
const reg = { x0: SITE.x0 * W, y0: SITE.y0 * H, x1: SITE.x1 * W, y1: SITE.y1 * H };
const reg_w = reg.x1 - reg.x0, reg_h = reg.y1 - reg.y0;
const center = V(reg.x0 + reg_w / 2, reg.y0 + reg_h / 2);
const boundaryPts = [];
const BN = 11;
for (let i = 0; i < BN; i++) {
  const ang = (i / BN) * Math.PI * 2 + (rand() - 0.5) * 0.25;
  const rr = 0.80 + rand() * 0.20;
  boundaryPts.push(V(center.x + Math.cos(ang) * (reg_w / 2) * rr, center.y + Math.sin(ang) * (reg_h / 2) * rr));
}
const boundary = convexHull(boundaryPts);

// ─── Seed points (Poisson-ish rejection sampling inside the boundary) ─────────
const bArea = Math.abs(polyArea(boundary));
const minDist = Math.sqrt(bArea / PLOT_COUNT) * 0.62;
let seeds = [];
let guard = 0;
while (seeds.length < PLOT_COUNT && guard++ < PLOT_COUNT * 4000) {
  const pt = V(reg.x0 + rand() * reg_w, reg.y0 + rand() * reg_h);
  if (!pointInPoly(pt, boundary)) continue;
  if (seeds.every((s) => Math.hypot(s.x - pt.x, s.y - pt.y) > minDist)) seeds.push(pt);
}

// ─── Lloyd relaxation (move each seed to its cell centroid) ───────────────────
for (let pass = 0; pass < RELAX; pass++) {
  seeds = seeds.map((p) => {
    const cell = voronoiCell(p, seeds, boundary);
    return cell.length >= 3 ? polyCentroid(cell) : p;
  });
}

// ─── Final cells, sorted reading-order (top→bottom, left→right) for tidy ids ──
seeds.sort((a, b) => (a.y - b.y) > reg_h * 0.16 ? a.y - b.y : a.x - b.x);
const cells = seeds.map((p) => voronoiCell(p, seeds, boundary)).filter((c) => c.length >= 3);

// area → size calibration (median cell ⇒ TARGET_MEDIAN_SQFT)
const areasPx = cells.map((c) => Math.abs(polyArea(c)));
const medianPx = [...areasPx].sort((a, b) => a - b)[Math.floor(areasPx.length / 2)];
const sqftPerPx = TARGET_MEDIAN_SQFT / medianPx;

// block letter by horizontal band (~8 plots per block)
const blocks = Math.max(1, Math.round(PLOT_COUNT / 8));
const blockOf = (cx) => String.fromCharCode(65 + Math.min(blocks - 1, Math.floor(((cx - reg.x0) / reg_w) * blocks)));
const blockCounter = {};

const plots = cells.map((cell, idx) => {
  const cen = polyCentroid(cell);
  const block = blockOf(cen.x);
  blockCounter[block] = (blockCounter[block] ?? 100) + 1;
  const plot_id = `Plot-${block}${blockCounter[block]}`;

  // inset toward centroid → lane gaps between plots
  const inset = cell.map((v) => V(cen.x + (v.x - cen.x) * INSET, cen.y + (v.y - cen.y) * INSET));

  // status
  const r = rand(); let acc = 0, status = 'available';
  for (const [s, wt] of Object.entries(STATUS_WEIGHTS)) { acc += wt; if (r <= acc) { status = s; break; } }

  // size from real parcel area, snapped to 50 sq ft
  const sqft = Math.max(600, Math.round((areasPx[idx] * sqftPerPx) / 50) * 50);
  const priceNum = sqft * RATE_PER_SQFT;

  // tour_url: empty for ~half the sold plots, to demo the disabled "Walk through" button
  const hasTour = !(status === 'sold' && rand() < 0.5);
  const media = DEEPLINK_MEDIA ? `?media=${plot_id}&skip-loading` : '?skip-loading';
  const tour_url = hasTour ? `${TOUR_BASE_URL}/index.htm${media}` : '';

  // label sizing in viewBox units (relative to parcel size)
  const bb = cell.reduce((m, v) => ({ minx: Math.min(m.minx, v.x), maxx: Math.max(m.maxx, v.x), miny: Math.min(m.miny, v.y), maxy: Math.max(m.maxy, v.y) }),
    { minx: 1e9, maxx: -1e9, miny: 1e9, maxy: -1e9 });
  const fontSize = Math.max(70, Math.min(240, Math.min(bb.maxx - bb.minx, bb.maxy - bb.miny) * 0.22));

  return {
    plot_id, status, block,
    size: `${sqft.toLocaleString('en-IN')} sq ft`,
    price: formatINR(priceNum),
    tour_url, notes: pick(NOTE_POOL),
    points: inset, cx: cen.x, cy: cen.y, fontSize,
  };
});

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatINR(n) {
  const s = Math.round(n).toString();
  const last3 = s.slice(-3), rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${rest ? grouped + ',' : ''}${last3}`;
}
function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

// ─── Emit plots.csv ───────────────────────────────────────────────────────────
const HEADER = ['plot_id', 'status', 'size', 'price', 'block', 'tour_url', 'notes'];
const csv = [
  HEADER.join(','),
  ...plots.map((p) => [p.plot_id, p.status, p.size, p.price, p.block, p.tour_url, p.notes].map(csvCell).join(',')),
].join('\n') + '\n';

// ─── Emit plots.svg (irregular overlay) ───────────────────────────────────────
const fmt = (n) => n.toFixed(1);
const plotShapes = plots.map((p) => {
  const pts = p.points.map((v) => `${fmt(v.x)},${fmt(v.y)}`).join(' ');
  return (
`    <g class="plot-group">
      <polygon id="${p.plot_id}" class="plot" points="${pts}" />
      <text class="plot-label" x="${fmt(p.cx)}" y="${fmt(p.cy)}" font-size="${fmt(p.fontSize)}" stroke-width="${fmt(p.fontSize * 0.07)}">${p.plot_id.replace('Plot-', '')}</text>
    </g>`
  );
}).join('\n');

const plotsSvg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plot-overlay" preserveAspectRatio="xMidYMid meet">
  <!-- Generated by tools/generate-samples.mjs — ${plots.length} irregular parcels. Do not hand-edit. -->
  <g class="plots">
${plotShapes}
  </g>
</svg>
`;

// ─── Write files ──────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(__dirname, '..', 'sample');
mkdirSync(sampleDir, { recursive: true });
writeFileSync(join(sampleDir, 'plots.csv'), csv, 'utf8');
writeFileSync(join(sampleDir, 'plots.svg'), plotsSvg, 'utf8');

const counts = plots.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {});
const sizes = plots.map((p) => parseInt(p.size.replace(/[^\d]/g, ''), 10));
console.log(`✓ Generated ${plots.length} irregular parcels`);
console.log(`  status mix:`, counts);
console.log(`  size range: ${Math.min(...sizes).toLocaleString('en-IN')}–${Math.max(...sizes).toLocaleString('en-IN')} sq ft`);
console.log(`  → sample/plots.csv, sample/plots.svg`);
