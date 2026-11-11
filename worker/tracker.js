/**
 * نفاف — متتبّع الخلايا الرعدية (Storm-cell tracker)
 * ============================================================
 * From the last three radar frames (10 min apart) around a point:
 *   1. cells   — connected areas ≥ 35 dBZ in the newest frame (convective rain), with peak, centre and size
 *   2. motion  — each cell is matched against the previous frame by shifting its mask and maximising overlap
 *                (block matching); a second match against the frame before confirms it. Cells that cannot be
 *                matched (just born) take the mean motion of their matched neighbours, flagged "est".
 *   3. future  — the centre moved forward 15/30/45/60 min; ETA = first time the moving cell's edge reaches a place.
 * Honest limits: thunderstorm cells grow, split and die within 30–60 min; the projection is a straight line.
 * ETAs carry ± max(5 min, 25 %) and nothing is projected beyond 90 min.
 */
import { frames, makeTileCache } from './radar.js';

const Z = 7, N = 2 ** Z * 256;
const gxOf = lon => (lon + 180) / 360 * N;
const gyOf = lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N; };
const lonOf = gx => gx / N * 360 - 180;
const latOf = gy => Math.atan(Math.sinh(Math.PI * (1 - 2 * gy / N))) * 180 / Math.PI;
function km(a, b, c, d) { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }

/* a dBZ mosaic of the box [gx0,gx1)×[gy0,gy1) in global pixels */
async function mosaic(getTile, gx0, gy0, w, h) {
  const g = new Int8Array(w * h).fill(-128);
  const tx0 = Math.floor(gx0 / 256), tx1 = Math.floor((gx0 + w - 1) / 256), ty0 = Math.floor(gy0 / 256), ty1 = Math.floor((gy0 + h - 1) / 256);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = await getTile(tx, ty); if (!t) continue;
    for (let py = 0; py < 256; py++) {
      const y = ty * 256 + py - gy0; if (y < 0 || y >= h) continue;
      for (let px = 0; px < 256; px++) { const x = tx * 256 + px - gx0; if (x < 0 || x >= w) continue; g[y * w + x] = t[py * 256 + px]; }
    }
  }
  return g;
}

function components(g, w, h, th) {
  const lab = new Int32Array(w * h), cells = []; let id = 0;
  const st = [];
  for (let i = 0; i < w * h; i++) {
    if (lab[i] || g[i] < th) continue;
    id++; const px = []; st.push(i); lab[i] = id;
    while (st.length) {
      const k = st.pop(); px.push(k); const x = k % w, y = (k / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (!lab[j] && g[j] >= th) { lab[j] = id; st.push(j); }
      }
    }
    if (px.length >= 3) cells.push({ id, px });
  }
  return cells;
}

/* best shift (dx,dy) of the cell mask that overlaps ≥30 dBZ in an older frame; returns null if weak */
function match(cell, older, w, h, maxS) {
  let best = null, bs = 0;
  for (let dy = -maxS; dy <= maxS; dy++) for (let dx = -maxS; dx <= maxS; dx++) {
    let s = 0;
    for (const k of cell.px) { const x = k % w + dx, y = ((k / w) | 0) + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue; if (older[y * w + x] >= 30) s++; }
    if (s > bs || (s === bs && best && dx * dx + dy * dy < best[0] * best[0] + best[1] * best[1])) { bs = s; best = [dx, dy]; }
  }
  return bs >= Math.max(2, cell.px.length * 0.25) ? best : null;   /* the older position = now + (dx,dy) */
}

/**
 * cellsAround(lat, lon, R km, places[{n,lat,lon}]) →
 * { t, cells:[{lat,lon,dbz,areaKm2,rKm,speed,heading,est,track:[[lat,lon]×4],eta:{here:{min,pm}|null},near:[{n,min,pm}]}], here:{min,pm,cell}|null }
 */
export async function cellsAround(lat, lon, R = 150, places = []) {
  const F = await frames(); const P = F.past;
  if (P.length < 2) return { t: null, cells: [] };
  const f0 = P[P.length - 1], f1 = P[P.length - 2], f2 = P[P.length - 3];
  const kmpp = 40075 * Math.cos(lat * Math.PI / 180) / N, rp = Math.ceil(R / kmpp);
  const cx = Math.floor(gxOf(lon)), cy = Math.floor(gyOf(lat)), gx0 = cx - rp, gy0 = cy - rp, w = 2 * rp, h = 2 * rp;
  const g0 = await mosaic(makeTileCache(F.host, f0.path), gx0, gy0, w, h);
  const g1 = await mosaic(makeTileCache(F.host, f1.path), gx0, gy0, w, h);
  const g2 = f2 ? await mosaic(makeTileCache(F.host, f2.path), gx0, gy0, w, h) : null;
  const dt1 = (f0.time - f1.time) / 3600, dt2 = f2 ? (f0.time - f2.time) / 3600 : null;
  const maxS = Math.min(30, Math.ceil(110 * dt1 / kmpp));     /* up to ~110 km/h */
  const raw = components(g0, w, h, 35).sort((a, b) => b.px.length - a.px.length).slice(0, 25);
  const out = [];
  for (const c of raw) {
    let sx = 0, sy = 0, sw = 0, pk = -128;
    for (const k of c.px) { const v = g0[k], wt = Math.pow(10, v / 10); sx += (k % w) * wt; sy += ((k / w) | 0) * wt; sw += wt; if (v > pk) pk = v; }
    const mx = sx / sw, my = sy / sw;
    const m1 = match(c, g1, w, h, maxS), m2 = g2 ? match(c, g2, w, h, Math.min(45, maxS * 2)) : null;
    let vx = null, vy = null;   /* pixels per hour, eastward / southward */
    if (m1 && m2) { vx = (-m1[0] / dt1 + -m2[0] / dt2) / 2; vy = (-m1[1] / dt1 + -m2[1] / dt2) / 2; }
    else if (m1) { vx = -m1[0] / dt1; vy = -m1[1] / dt1; }
    out.push({ mx, my, vx, vy, est: !m1, dbz: pk, area: c.px.length * kmpp * kmpp });
  }
  /* cells without a match take the mean motion of matched ones (the steering flow) */
  const mv = out.filter(c => c.vx != null);
  const mvx = mv.length ? mv.reduce((s, c) => s + c.vx, 0) / mv.length : 0, mvy = mv.length ? mv.reduce((s, c) => s + c.vy, 0) / mv.length : 0;
  const cells = out.map(c => {
    if (c.vx == null) { c.vx = mvx; c.vy = mvy; c.est = true; }
    const gx = gx0 + c.mx, gy = gy0 + c.my, clat = latOf(gy), clon = lonOf(gx);
    const speed = Math.hypot(c.vx, c.vy) * kmpp, heading = (Math.atan2(c.vx, -c.vy) * 180 / Math.PI + 360) % 360;
    const rKm = Math.max(2, Math.sqrt(c.area / Math.PI));
    const at = m => [latOf(gy + c.vy * m / 60), lonOf(gx + c.vx * m / 60)];
    const track = [15, 30, 45, 60].map(m => at(m).map(v => +v.toFixed(3)));
    const etaTo = (plat, plon) => {
      const d0 = km(clat, clon, plat, plon);
      if (d0 <= rKm + 2) return { min: 0, pm: 0 };
      if (speed < 3) return null;
      for (let m = 2; m <= 90; m += 2) { const [a, b] = at(m); if (km(a, b, plat, plon) <= rKm + 3) return { min: m, pm: Math.max(5, Math.round(m * 0.25)) }; }
      return null;
    };
    const near = places.map(p => ({ n: p.n, e: etaTo(p.lat, p.lon) })).filter(x => x.e).sort((a, b) => a.e.min - b.e.min).slice(0, 4).map(x => ({ n: x.n, min: x.e.min, pm: x.e.pm }));
    let over = null, od = 1e9; for (const p of places) { const d = km(clat, clon, p.lat, p.lon); if (d < od) { od = d; over = p.n; } }
    return { lat: +clat.toFixed(3), lon: +clon.toFixed(3), dbz: c.dbz, areaKm2: Math.round(c.area), rKm: +rKm.toFixed(1), speed: Math.round(speed), heading: Math.round(heading),
      dir: Math.round(heading / 45) % 8, est: c.est, track, over: over && od < 25 ? over : null, overKm: Math.round(od), here: etaTo(lat, lon), near };
  }).filter(c => km(lat, lon, c.lat, c.lon) <= R);
  cells.sort((a, b) => (a.here ? a.here.min : 999) - (b.here ? b.here.min : 999) || b.dbz - a.dbz);
  const hit = cells.find(c => c.here);
  return { t: f0.time, cells: cells.slice(0, 12), here: hit ? { min: hit.here.min, pm: hit.here.pm, dbz: hit.dbz } : null };
}

/* ETA of an already-tracked cell at another place (used by the push engine for each subscriber) */
export function etaFor(c, plat, plon) {
  const d0 = km(c.lat, c.lon, plat, plon);
  if (d0 <= c.rKm + 2) return { min: 0, pm: 0 };
  if (c.speed < 3) return null;
  const r = Math.PI / 180, h = c.heading * r;
  for (let m = 2; m <= 90; m += 2) {
    const dk = c.speed * m / 60, la = c.lat + dk * Math.cos(h) / 111.2, lo = c.lon + dk * Math.sin(h) / (111.2 * Math.cos(c.lat * r));
    if (km(la, lo, plat, plon) <= c.rKm + 3) return { min: m, pm: Math.max(5, Math.round(m * 0.25)) };
  }
  return null;
}
