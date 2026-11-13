/**
 * نفاف — مطر الساعة القادمة (Radar nowcast, 0–90 min)
 * ============================================================
 * Method (extrapolation nowcasting, the same family as the old Dark Sky "next hour"):
 *   1. motion  — the echo field around a region (±200 km) in the newest radar frame is matched against the frames
 *                10 and 20 min older by shifting it (block matching, first on a 4× coarser grid, then refined at
 *                full resolution). The shift that overlaps the most rain is the steering motion of the rain.
 *   2. advect  — rain at your point in m minutes ≈ rain now at the point that far upstream (you − motion × m).
 *   3. honesty — the sampling disc grows with lead time (3 km + 0.1 km per minute), so the series turns into a
 *                chance rather than a yes/no; growth and decay of the rain are NOT modelled; nothing beyond 90 min.
 * Output per point: p (share of the disc with rain ≥ 18 dBZ ≈ 0.3 mm/h) and dbz (80th percentile of the wet part),
 * every 5 min of lead time counted from the radar frame (the app subtracts the frame's age to get "from now").
 * Hindcast on the real 11 Nov 2026 North Batinah storm (13 frames, 1296 points, rain = p ≥ 0.3), critical success index
 * nowcast vs persistence: +10 min 0.55/0.51 · +30 min 0.37/0.29 · +60 min 0.18/0.13 — better, and still modest:
 * convective storms that form in place cannot be extrapolated.
 */
import { frames, makeTileCache, mmh } from './radar.js';
import { mosaic } from './tracker.js';

const Z = 7, N = 2 ** Z * 256, WET = 18, STEP = 5, LEADS = 23;   /* leads 0..110 min from the frame time */
const gxOf = lon => (lon + 180) / 360 * N;
const gyOf = lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N; };

/* one tile cache per radar frame, shared by every request this isolate serves (frames change every 10 min) */
const TILES = new Map();
function tilesFor(host, path) {
  if (!TILES.has(path)) { TILES.set(path, makeTileCache(host, path)); while (TILES.size > 8) TILES.delete(TILES.keys().next().value); }
  return TILES.get(path);
}

function coarse(g, w, h, f) {
  const W = Math.ceil(w / f), H = Math.ceil(h / f), o = new Int8Array(W * H).fill(-128);
  for (let y = 0; y < h; y++) { const Y = (y / f) | 0; for (let x = 0; x < w; x++) { const v = g[y * w + x], k = Y * W + ((x / f) | 0); if (v > o[k]) o[k] = v; } }
  return { o, W, H };
}

/* best shift (dx,dy) such that new(x) ≈ old(x+dx); score = share of new rain pixels that land on old rain */
function shiftScore(gNew, gOld, W, H, idx, dx, dy) {
  let s = 0;
  for (const k of idx) { const x = k % W + dx, y = ((k / W) | 0) + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; if (gOld[y * W + x] >= WET - 3) s++; }
  return s;
}
function bestShift(gNew, gOld, W, H, idx, cx, cy, S) {
  let best = null, bs = -1;
  for (let dy = cy - S; dy <= cy + S; dy++) for (let dx = cx - S; dx <= cx + S; dx++) {
    const s = shiftScore(gNew, gOld, W, H, idx, dx, dy);
    if (s > bs || (s === bs && best && dx * dx + dy * dy < best[0] * best[0] + best[1] * best[1])) { bs = s; best = [dx, dy]; }
  }
  return { d: best, q: idx.length ? bs / idx.length : 0 };
}
function wetIdx(g, n, max) {
  const a = []; for (let i = 0; i < n; i++) if (g[i] >= WET) a.push(i);
  if (a.length <= max) return a;
  const st = a.length / max, b = []; for (let i = 0; i < a.length; i += st) b.push(a[Math.floor(i)]); return b;
}

/**
 * motion of the rain around (lat,lon): pixels/hour at zoom 7 (x east, y south), or null when there is too little rain
 */
export async function regionMotion(lat, lon, R = 200) {
  const F = await frames(); const P = F.past;
  if (!P.length) return { t: null, motion: null, region: { wet: 0, max: null } };
  const f0 = P[P.length - 1], kmpp = 40075 * Math.cos(lat * Math.PI / 180) / N, rp = Math.ceil(R / kmpp);
  const gx0 = Math.floor(gxOf(lon)) - rp, gy0 = Math.floor(gyOf(lat)) - rp, w = 2 * rp, h = 2 * rp;
  const g0 = await mosaic(tilesFor(F.host, f0.path), gx0, gy0, w, h);
  let wet = 0, max = -128; for (let i = 0; i < w * h; i++) { if (g0[i] >= WET) wet++; if (g0[i] > max) max = g0[i]; }
  const region = { wet: Math.round(wet / (w * h) * 1000) / 1000, max: max > -128 ? max : null };
  if (wet < 40 || P.length < 2) return { t: f0.time, motion: null, region };
  const C = coarse(g0, w, h, 4), cIdx = wetIdx(C.o, C.W * C.H, 6000), fIdx = wetIdx(g0, w * h, 25000);
  const est = [];
  for (const back of [1, 2]) {
    const f = P[P.length - 1 - back]; if (!f) continue;
    const dt = (f0.time - f.time) / 3600; if (dt <= 0 || dt > 0.6) continue;
    const g = await mosaic(tilesFor(F.host, f.path), gx0, gy0, w, h), Co = coarse(g, w, h, 4);
    const S = Math.max(2, Math.ceil(120 * dt / (kmpp * 4)));       /* up to ~120 km/h */
    const c = bestShift(C.o, Co.o, C.W, C.H, cIdx, 0, 0, S); if (!c.d || c.q < 0.3) continue;
    const r = bestShift(g0, g, w, h, fIdx, c.d[0] * 4, c.d[1] * 4, 4); if (!r.d || r.q < 0.25) continue;
    est.push({ vx: -r.d[0] / dt, vy: -r.d[1] / dt, q: r.q });
  }
  if (!est.length) return { t: f0.time, motion: null, region };
  /* two estimates that disagree by more than half the speed: keep the newer (10-min) one */
  let m = est[0];
  if (est.length === 2) {
    const a = est[0], b = est[1], sp = Math.max(Math.hypot(a.vx, a.vy), 1);
    m = Math.hypot(a.vx - b.vx, a.vy - b.vy) < 0.5 * sp + 4 / kmpp
      ? { vx: (a.vx * a.q + b.vx * b.q) / (a.q + b.q), vy: (a.vy * a.q + b.vy * b.q) / (a.q + b.q), q: Math.max(a.q, b.q) } : a;
  }
  /* below ~8 km/h the shift is within one or two pixels of measurement noise (1 px per 10 min ≈ 7 km/h): treat the rain
     as stationary, which on the 11 Nov 2026 storm (quasi-stationary over the Hajar) scored as well as any motion */
  if (Math.hypot(m.vx, m.vy) * kmpp < 8) m = { vx: 0, vy: 0, q: m.q };
  const speed = Math.hypot(m.vx, m.vy) * kmpp, heading = speed ? (Math.atan2(m.vx, -m.vy) * 180 / Math.PI + 360) % 360 : 0;
  return { t: f0.time, motion: { vx: +m.vx.toFixed(2), vy: +m.vy.toFixed(2), speed: Math.round(speed), heading: Math.round(heading), dir: Math.round(heading / 45) % 8, q: +m.q.toFixed(2), n: est.length }, region };
}

/* rain statistics in a disc of radius r km around global pixel (gx,gy) of one frame */
async function disc(getTile, gx, gy, rKm, kmpp) {
  const rp = rKm / kmpp, x0 = Math.floor(gx - rp), x1 = Math.ceil(gx + rp), y0 = Math.floor(gy - rp), y1 = Math.ceil(gy + rp);
  const T = new Map();
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty++) for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx++) T.set(tx + '/' + ty, await getTile(tx, ty));
  let n = 0; const w = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if ((x + .5 - gx) ** 2 + (y + .5 - gy) ** 2 > rp * rp) continue;
    const t = T.get(Math.floor(x / 256) + '/' + Math.floor(y / 256)); if (!t) continue;
    n++; const v = t[(y & 255) * 256 + (x & 255)]; if (v >= WET) w.push(v);
  }
  if (!n) return [0, null];
  w.sort((a, b) => a - b);
  return [Math.round(w.length / n * 100) / 100, w.length ? w[Math.min(w.length - 1, Math.floor(w.length * 0.8))] : null];
}

/**
 * nowcastAt(lat, lon, M) → { t, step, s:[[p,dbz]×23] by lead from the frame, past:[[t,p,dbz]×≤7] }
 * M = regionMotion(...) of the surrounding region (shared by everyone nearby)
 */
export async function nowcastAt(lat, lon, M) {
  const F = await frames(); const P = F.past;
  if (!P.length) return null;
  const f0 = P[P.length - 1], get = tilesFor(F.host, f0.path), kmpp = 40075 * Math.cos(lat * Math.PI / 180) / N;
  const gx = gxOf(lon), gy = gyOf(lat), s = [];
  const dry = !M || !M.region || M.region.max == null || M.region.max < WET;
  for (let k = 0; k < LEADS; k++) {
    const m = k * STEP;
    if (dry) { s.push([0, null]); continue; }
    if (!M.motion && m > 0) { s.push(null); continue; }        /* no motion: we only know "now" */
    const ux = M.motion ? gx - M.motion.vx * m / 60 : gx, uy = M.motion ? gy - M.motion.vy * m / 60 : gy;
    s.push(await disc(get, ux, uy, 3 + 0.1 * m, kmpp));
  }
  /* the last hour as observed at the point itself */
  const past = [];
  if (!dry) for (const f of P.slice(-7)) { const d = await disc(tilesFor(F.host, f.path), gx, gy, 3, kmpp); past.push([f.time, d[0], d[1]]); }
  return { t: f0.time, step: STEP, s, past };
}

export { mmh };
