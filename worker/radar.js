/**
 * نفاف — الرصد بالرادار (Radar observation)
 * ============================================================
 * Why this exists: on 11 Nov 2026 a heavy thunderstorm sat over North Batinah for hours while ECMWF, GFS and ICON
 * all showed 0–0.3 mm, so Nafaf (which only asked the models) stayed silent. Models forecast; radar observes.
 * This module reads the latest composite radar frame (RainViewer, the same layer Nafaf's map shows; attribution kept)
 * and measures the echo around a point:
 *   here  — strongest echo within 4 km         (rain on you now)
 *   near  — strongest echo within 25 km, with distance and bearing of the closest ≥ 30 dBZ echo (rain close by)
 *   trend — whether that echo got closer since the previous frame (approaching)
 * dBZ → rain rate with Marshall–Palmer (Z = 200·R^1.6): 20 dBZ ≈ 0.6 mm/h · 30 ≈ 2.7 · 40 ≈ 11.5 · 50 ≈ 49.
 * PNG tiles are decoded here (no canvas in Workers) with DecompressionStream.
 */
import { RV_UB } from './rvcolors.js';

const UA = { 'User-Agent': 'Nafaf/1.0 (+https://nafaf.online)' };
const Z = 7;                     /* the highest zoom the free composite serves (~1.1 km per pixel at 24°N) */
const COLOR = new Map();
for (const [c, d] of RV_UB) if (!COLOR.has(c)) COLOR.set(c >>> 0, d);   /* first (lowest) dBZ for repeated colours */

export const mmh = dbz => dbz == null ? 0 : Math.round(Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6) * 10) / 10;

/* ── minimal PNG decoder: 8-bit RGBA / RGB / palette (+tRNS), all five row filters ── */
async function inflate(u8) {
  const ds = new DecompressionStream('deflate');
  const out = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}
export async function decodePNG(buf) {
  const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 8, w = 0, h = 0, depth = 0, ct = 0, pal = null, trns = null; const idat = [];
  while (p < b.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = b[p + 16]; ct = b[p + 17]; }
    else if (type === 'PLTE') pal = d.slice();
    else if (type === 'tRNS') trns = d.slice();
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('png depth ' + depth);
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 3 ? 1 : ct === 4 ? 2 : 1;
  let tot = 0; idat.forEach(x => tot += x.length); const all = new Uint8Array(tot); let o = 0; idat.forEach(x => { all.set(x, o); o += x.length; });
  const raw = await inflate(all), stride = w * bpp, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0, c = up && i >= bpp ? up[i - bpp] : 0, u = up ? up[i] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? u : c); }
      row[i] = v & 255;
    }
  }
  const rgba = new Uint32Array(w * h);   /* 0xRRGGBBAA */
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, al;
    if (ct === 6) { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; al = px[i * 4 + 3]; }
    else if (ct === 2) { r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2]; al = 255; }
    else if (ct === 3) { const k = px[i]; r = pal[k * 3]; g = pal[k * 3 + 1]; bl = pal[k * 3 + 2]; al = trns && k < trns.length ? trns[k] : 255; }
    else { r = g = bl = px[i * bpp]; al = ct === 4 ? px[i * 2 + 1] : 255; }
    rgba[i] = ((r << 24) | (g << 16) | (bl << 8) | al) >>> 0;
  }
  return { w, h, rgba };
}

const near = new Map();
function toDbz(c) {
  if ((c & 255) === 0) return null;
  const d = COLOR.get(c >>> 0); if (d != null) return d;
  if (near.has(c)) return near.get(c);
  let best = null, bd = 1e9;
  for (const [k, v] of COLOR) { const dr = (k >>> 24) - (c >>> 24), dg = ((k >>> 16) & 255) - ((c >>> 16) & 255), db = ((k >>> 8) & 255) - ((c >>> 8) & 255), da = (k & 255) - (c & 255); const s = dr * dr + dg * dg + db * db + da * da; if (s < bd) { bd = s; best = v; } }
  near.set(c, best); return best;
}

/* ── frames and tiles ── */
export async function frames() {
  const r = await fetch('https://api.rainviewer.com/public/weather-maps.json', { headers: UA, cf: { cacheTtl: 60 } });
  if (!r.ok) throw new Error('rainviewer ' + r.status);
  const j = await r.json(); const past = (j.radar && j.radar.past) || [];
  return { host: j.host || 'https://tilecache.rainviewer.com', past };
}
const tileXY = (lat, lon) => { const n = 2 ** Z, x = (lon + 180) / 360 * n, s = Math.sin(lat * Math.PI / 180), y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n; return [x, y]; };
const pixLatLon = (gx, gy) => { const n = 2 ** Z * 256, lon = gx / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * gy / n))) * 180 / Math.PI; return [lat, lon]; };

export function makeTileCache(host, path) {
  const cache = new Map();
  return async (tx, ty) => {
    const k = tx + '/' + ty;
    if (!cache.has(k)) cache.set(k, (async () => {
      const r = await fetch(`${host}${path}/256/${Z}/${tx}/${ty}/2/0_0.png`, { headers: UA, cf: { cacheTtl: 600 } });
      if (!r.ok) return null;
      const { w, h, rgba } = await decodePNG(await r.arrayBuffer());
      const d = new Int8Array(w * h).fill(-128);
      for (let i = 0; i < w * h; i++) { const v = toDbz(rgba[i]); if (v != null) d[i] = Math.max(-127, Math.min(127, v)); }
      return d;
    })().catch(() => null));
    return cache.get(k);
  };
}

function km(a, b, c, d) { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
function bearing(a, b, c, d) { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return (Math.atan2(y, x) / r + 360) % 360; }

/* the echo field around one point in one frame */
export async function sampleAt(getTile, lat, lon, R = 25, strong = 30) {
  const [fx, fy] = tileXY(lat, lon), kmpp = 40075 * Math.cos(lat * Math.PI / 180) / (2 ** Z * 256), rp = Math.ceil(R / kmpp) + 1;
  const gx0 = Math.floor(fx * 256), gy0 = Math.floor(fy * 256);
  let here = null, here8 = null, max = null, closest = null;
  /* fetch the (at most four) tiles first, then scan synchronously */
  const T = new Map();
  for (const ty of new Set([Math.floor((gy0 - rp) / 256), Math.floor((gy0 + rp) / 256)]))
    for (const tx of new Set([Math.floor((gx0 - rp) / 256), Math.floor((gx0 + rp) / 256)])) T.set(tx + '/' + ty, await getTile(tx, ty));
  for (let gy = gy0 - rp; gy <= gy0 + rp; gy++) {
    for (let gx = gx0 - rp; gx <= gx0 + rp; gx++) {
      const dpx = Math.hypot(gx - fx * 256, gy - fy * 256), dk = dpx * kmpp; if (dk > R) continue;
      const tile = T.get(Math.floor(gx / 256) + '/' + Math.floor(gy / 256)); if (!tile) continue;
      const v = tile[(gy & 255) * 256 + (gx & 255)]; if (v === -128) continue;
      if (dk <= 4 && (here == null || v > here)) here = v;
      if (dk <= 8 && (here8 == null || v > here8)) here8 = v;
      if (max == null || v > max) max = v;
      if (v >= strong && (!closest || dk < closest.km)) { const [la, lo] = pixLatLon(gx + .5, gy + .5); closest = { km: Math.round(km(lat, lon, la, lo)), dir: Math.round(bearing(lat, lon, la, lo) / 45) % 8, dbz: v }; }
    }
  }
  return { here, here8, max, closest };
}

/* the latest frame + the one before (for "approaching"), for many points */
export async function radarScan(points) {
  const F = await frames(); if (!F.past.length) return null;
  const last = F.past[F.past.length - 1], prev = F.past[F.past.length - 2];
  const g1 = makeTileCache(F.host, last.path), g0 = prev ? makeTileCache(F.host, prev.path) : null;
  const out = [];
  for (const p of points) {
    try {
      const a = await sampleAt(g1, p.lat, p.lon), b = g0 ? await sampleAt(g0, p.lat, p.lon) : null;
      a.trend = a.closest && b && b.closest ? b.closest.km - a.closest.km : null;   /* + = coming closer */
      a.t = last.time; out.push(a);
    } catch (e) { out.push(null); }
  }
  return { t: last.time, res: out };
}
