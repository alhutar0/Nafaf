/**
 * نفاف — التحذيرات الرسمية (Official warnings), worldwide
 * ============================================================
 * Nafaf never writes a warning itself. It relays, word for word, the CAP alerts that each country's
 * officially registered alerting authority publishes for redistribution (WMO Register of Alerting
 * Authorities → capsrc.js), plus the US National Weather Service point API.
 *   · text is never edited or machine-translated — the authority's own language feed is chosen
 *   · every alert carries the authority's name, its link and the feed's rights line
 *   · MeteoAlarm-hosted feeds (Europe) are link-out only until their redistribution terms are accepted
 *   · an alert counts as "here" only when its polygon/circle contains the point; alerts without
 *     geometry are listed as "elsewhere in the country" with their area name
 * An alert with no expiry is kept for 12 h after it starts (some quake/flash messages carry none).
 * GET /official?lat=..&lon=..&cc=om&lang=ar  →  { cc, here:[…], country:[…], sources:[…], linkOut:[…] }
 */
import { CAPSRC } from './capsrc.js';

const UA = 'Nafaf/1.0 (+https://nafaf.online)';
const SEV = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

function dec(s) {
  if (s == null) return '';
  s = String(s).replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').trim();
}
const reTag = n => new RegExp('<(?:[\\w.-]+:)?' + n + '\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?' + n + '\\s*>', 'gi');
function all(s, n) { const out = []; let m; const r = reTag(n); while ((m = r.exec(s))) out.push(m[1]); return out; }
function one(s, n) { const a = all(s, n); return a.length ? dec(a[0]) : ''; }
function clip(s, n) { s = String(s || '').replace(/\s+\n/g, '\n').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* ── geometry: CAP polygon "lat,lon lat,lon …", circle "lat,lon radiusKm" ── */
function poly(str) { return str.trim().split(/\s+/).map(p => p.split(',').map(Number)).filter(p => p.length >= 2 && isFinite(p[0]) && isFinite(p[1])); }
function inPoly(lat, lon, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [yi, xi] = P[i], [yj, xj] = P[j];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi)) c = !c;
  }
  return c;
}
function km(a, b, c, d) { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
function insideGeo(lat, lon, g) { if (!g) return null; return g.p.some(P => inPoly(lat, lon, P)) || g.c.some(c => km(lat, lon, c[0], c[1]) <= c[2]); }

/* ── CAP document → alert ── */
function parseCap(xml, lang) {
  const sent = one(xml, 'sent'), id = one(xml, 'identifier'), status = one(xml, 'status'), msgType = one(xml, 'msgType') || one(xml, 'message_type');
  const refs = one(xml, 'references').split(/\s+/).map(r => r.split(',')[1]).filter(Boolean);
  let infos = all(xml, 'info');
  if (!infos.length) return null;
  const want = (lang || 'en').toLowerCase();
  const pickInfo = infos.find(i => one(i, 'language').toLowerCase().startsWith(want)) || infos.find(i => one(i, 'language').toLowerCase().startsWith('en')) || infos[0];
  const I = pickInfo;
  let geo = null, areas = [];
  for (const a of all(I, 'area')) {
    areas.push(one(a, 'areaDesc'));
    for (const p of all(a, 'polygon')) { let P = poly(dec(p)); if (P.length < 3) continue; if (P.length > 400) { const k = Math.ceil(P.length / 400); P = P.filter((x, i) => i % k === 0); } (geo = geo || { p: [], c: [] }).p.push(P.map(x => [+x[0].toFixed(4), +x[1].toFixed(4)])); }
    for (const c of all(a, 'circle')) { const m = dec(c).match(/^(-?[\d.]+),\s*(-?[\d.]+)\s+([\d.]+)/); if (m) (geo = geo || { p: [], c: [] }).c.push([+m[1], +m[2], +m[3]]); }
  }
  areas = [...new Set(areas.filter(x => x && !/^polygonal event area$/i.test(x)))];
  return {
    id, status, msgType, refs,
    lang: one(I, 'language'),
    event: one(I, 'event'), headline: one(I, 'headline'),
    description: clip(one(I, 'description'), 1400), instruction: clip(one(I, 'instruction'), 700),
    severity: one(I, 'severity'), urgency: one(I, 'urgency'), certainty: one(I, 'certainty'),
    onset: one(I, 'onset') || one(I, 'effective') || sent, expires: one(I, 'expires'),
    sender: one(I, 'senderName'), web: one(I, 'web'),
    area: clip(areas.slice(0, 6).join(' · ') + (areas.length > 6 ? ' · +' + (areas.length - 6) : ''), 300),
    geo,
  };
}

/* ── feed (RSS or Atom) → CAP links + rights line ── */
function feedLinks(xml) {
  const links = [];
  for (const it of all(xml, 'item')) { const l = one(it, 'link') || one(it, 'guid'); if (/^https?:/.test(l)) links.push(l); }
  if (!links.length) {
    const re = /<entry\b[\s\S]*?<\/entry>/gi; let m;
    while ((m = re.exec(xml))) {
      const e = m[0];
      const cap = e.match(/<link\b[^>]*type="application\/cap\+xml"[^>]*href="([^"]+)"/i) || e.match(/<link\b[^>]*href="([^"]+)"[^>]*type="application\/cap\+xml"/i) || e.match(/<link\b[^>]*href="([^"]+)"/i);
      if (cap) links.push(dec(cap[1]));
    }
  }
  return { links: [...new Set(links)], rights: one(xml, 'copyright') || one(xml, 'rights') || one(xml, 'dc:rights') };
}

async function get(u, ttl) {
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': 'application/xml,text/xml,application/atom+xml,application/rss+xml,*/*' }, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
}

/* one authority: feed → newest CAP documents → active alerts */
async function fromSource(src, lang, max = 30) {
  const [sid, , name, feed] = src;
  const xml = await get(feed, 300);
  const { links, rights } = feedLinks(xml);
  const docs = await Promise.all(links.slice(0, max).map(u => get(u, 3600).then(t => [u, t]).catch(() => null)));
  const out = [];
  for (const d of docs) {
    if (!d) continue;
    try { const a = parseCap(d[1], lang); if (a) { a.cap = d[0]; a.src = { id: sid, name, rights, feed }; out.push(a); } } catch (e) { }
  }
  return out;
}

/* United States: NWS point query (open data) */
async function nws(lat, lon) {
  const r = await fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: { 'User-Agent': UA, 'Accept': 'application/geo+json' }, cf: { cacheTtl: 120, cacheEverything: true } });
  if (!r.ok) throw new Error('NWS ' + r.status);
  const j = await r.json();
  return (j.features || []).map(f => {
    const p = f.properties || {};
    return {
      id: p.id, status: p.status, msgType: p.messageType, refs: (p.references || []).map(x => x.identifier),
      lang: 'en-US', event: p.event, headline: p.headline || p.event,
      description: clip(p.description, 1400), instruction: clip(p.instruction, 700),
      severity: p.severity, urgency: p.urgency, certainty: p.certainty,
      onset: p.onset || p.effective, expires: p.ends || p.expires, sender: p.senderName, web: 'https://www.weather.gov',
      area: clip(p.areaDesc, 300), inside: true, geo: null, cap: p['@id'] || '',
      src: { id: 'us-noaa-nws-en', name: 'National Weather Service', rights: 'Public domain (U.S. Government work)', feed: 'https://api.weather.gov' },
    };
  });
}

/* the authorities of a country, one language variant each: the reader's language, else English, else the first */
function sourcesFor(cc, lang) {
  const list = CAPSRC[cc] || [];
  const groups = {};
  for (const s of list) { const key = s[0].replace(/-[a-z]{2,3}$/, ''); (groups[key] = groups[key] || []).push(s); }
  const pick = [], linkOut = [];
  for (const k in groups) {
    const g = groups[k];
    const s = g.find(x => x[1] === lang) || g.find(x => x[1] === 'en') || g[0];
    if (s[4]) linkOut.push({ name: s[2], url: 'https://meteoalarm.org' }); else pick.push(s);
  }
  return { pick, linkOut };
}

/* every active alert of a country in one language, geometry included — cached once per country for everyone */
async function countryAlerts(cc, lang) {
  const key = new Request(`https://nafaf-cache.local/official-country/v1/${cc}/${lang}`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return await hit.json();
  const S = sourcesFor(cc, lang);
  const W = /met|hydro|weather|dwd|bom|imd|ncm|pmd|ema|caa|dom|tmd|kma|bmkg|inmet/i;
  const ord = S.pick.sort((a, b) => (W.test(b[0]) ? 1 : 0) - (W.test(a[0]) ? 1 : 0)).slice(0, 3);
  const errors = [];
  const res = await Promise.all(ord.map(s => fromSource(s, lang).catch(() => { errors.push(s[0]); return []; })));
  let alerts = [].concat(...res);
  const now = Date.now();
  const superseded = new Set(); alerts.forEach(a => (a.refs || []).forEach(r => superseded.add(r)));
  alerts = alerts.filter(a => (a.status || 'Actual') === 'Actual' && a.msgType !== 'Cancel' && !superseded.has(a.id) && (a.expires ? Date.parse(a.expires) > now : (now - (Date.parse(a.onset) || 0)) < 12 * 36e5));
  const seen = new Set(); alerts = alerts.filter(a => { const k = a.headline + '|' + a.area + '|' + a.expires; if (seen.has(k)) return false; seen.add(k); return true; });
  const out = { alerts: alerts.map(({ refs, status, ...r }) => r), sources: ord.map(s => ({ name: s[2], url: s[3] })), linkOut: S.linkOut, errors };
  const body = JSON.stringify(out);
  await cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${errors.length ? 60 : 300}` } }));
  return out;
}

export async function officialAlerts(cc, lat, lon, lang) {
  cc = String(cc || '').toLowerCase().slice(0, 2);
  lang = String(lang || 'en').toLowerCase().slice(0, 3);
  const now = Date.now();
  let alerts = [], sources = [], linkOut = [], errors = [];
  if (cc === 'us') {
    try { alerts = await nws(lat, lon); sources.push({ name: 'National Weather Service', url: 'https://www.weather.gov' }); } catch (e) { errors.push('nws'); }
    alerts = alerts.filter(a => (a.status || 'Actual') === 'Actual' && a.msgType !== 'Cancel' && (!a.expires || Date.parse(a.expires) > now));
  } else {
    const C = await countryAlerts(cc, lang);
    sources = C.sources; linkOut = C.linkOut; errors = C.errors;
    alerts = C.alerts.filter(a => !a.expires || Date.parse(a.expires) > now).map(a => ({ ...a, inside: insideGeo(lat, lon, a.geo) }));
  }
  const rank = a => (SEV[a.severity] || 0) * 10 - (Date.parse(a.onset) > now ? 1 : 0);
  alerts.sort((a, b) => rank(b) - rank(a));
  const strip = a => { const { refs, status, geo, ...r } = a; return r; };
  return {
    cc, at: new Date(now).toISOString(),
    here: alerts.filter(a => a.inside === true).slice(0, 8).map(strip),
    country: alerts.filter(a => a.inside !== true).slice(0, 12).map(strip),
    sources, linkOut, errors,
  };
}

/* edge-cached handler: one answer per country, ~1 km cell and language, for 5 minutes */
export async function handleOfficial(request, url, ctx, CORS) {
  const lat = parseFloat(url.searchParams.get('lat')), lon = parseFloat(url.searchParams.get('lon'));
  const cc = (url.searchParams.get('cc') || (request.cf && request.cf.country) || '').toLowerCase();
  const lang = (url.searchParams.get('lang') || 'en').toLowerCase();
  if (!isFinite(lat) || !isFinite(lon) || !/^[a-z]{2}$/.test(cc)) return new Response(JSON.stringify({ error: 'lat, lon, cc required' }), { status: 400, headers: { 'content-type': 'application/json', ...CORS } });
  const key = new Request(`https://nafaf-cache.local/official/${cc}/${lat.toFixed(2)}/${lon.toFixed(2)}/${lang}`);
  const cache = caches.default;
  let hit = await cache.match(key);
  if (hit) { const r = new Response(hit.body, hit); r.headers.set('x-nafaf-cache', 'hit'); return r; }
  const body = JSON.stringify(await officialAlerts(cc, lat, lon, lang));
  const res = new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', ...CORS } });
  const put = cache.put(key, res.clone());
  if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  return res;
}
