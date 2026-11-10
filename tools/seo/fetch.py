"""Nafaf city pages — data step (run by .github/workflows/seo-data.yml, never in the browser).
Picks the cities, then for each one fetches, once:
  · its names in the page languages and its region (Open-Meteo geocoding, CC BY 4.0 — names from GeoNames)
  · its monthly climate normals 1991–2020 (NASA POWER climatology, MERRA-2 reanalysis — NASA LaRC POWER Project)
and stores everything in data/seo/cities.json. Re-runs only fetch what is missing, so rebuilding pages costs nothing.
"""
import json, glob, os, sys, time, re, unicodedata, urllib.request, urllib.parse, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'seo', 'cities.json')
UA = {'User-Agent': 'Nafaf/1.0 (+https://nafaf.online)'}
GULF = {'OM', 'AE', 'SA', 'QA', 'BH', 'KW', 'YE'}
EXTRA = {'IN': 15, 'PK': 12, 'BD': 8, 'DE': 10, 'FR': 10, 'GB': 8, 'EG': 6, 'IR': 6, 'IQ': 6, 'JO': 3, 'TR': 6, 'ID': 6, 'PH': 5, 'MY': 4,
         'US': 15, 'CA': 5, 'AU': 6, 'IT': 6, 'ES': 6, 'NL': 4, 'BE': 3, 'AT': 3, 'CH': 4, 'SE': 3, 'NO': 2, 'DK': 2, 'PL': 4, 'MA': 5,
         'DZ': 4, 'TN': 3, 'NG': 4, 'KE': 3, 'ZA': 4, 'BR': 6, 'MX': 5, 'JP': 6, 'KR': 4, 'CN': 10, 'TH': 4, 'VN': 4, 'RU': 6, 'LK': 3,
         'NP': 2, 'AF': 3, 'SD': 3, 'LB': 2, 'SY': 3, 'PS': 2, 'LY': 3}
LOCAL = {'FR': 'fr', 'BE': 'fr', 'LU': 'fr', 'MC': 'fr', 'CH': 'de', 'DE': 'de', 'AT': 'de', 'LI': 'de', 'PK': 'ur', 'IN': 'hi', 'BD': 'bn'}
MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(3 * (i + 1))

def ascii_slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def select():
    rows = []
    for f in glob.glob(os.path.join(ROOT, 'geo', 'c_*.json')):
        rows += json.load(open(f, encoding='utf-8'))
    by = {}
    for r in rows: by.setdefault(r[1], []).append(r)
    sel = []
    for cc, L in by.items():
        L.sort(key=lambda r: -r[4])
        sel += [r for r in L if r[4] >= 30] if cc in GULF else L[:EXTRA.get(cc, 2)]
    return sel

def names(r):
    """names + region in each page language, from the geocoder entry nearest to the GeoNames point (same country)."""
    name, cc, lat, lon, pop = r
    langs = ['en', 'ar'] + ([LOCAL[cc]] if cc in LOCAL else [])
    out = {}
    q = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode() or name
    for lg in langs:
        try:
            j = get('https://geocoding-api.open-meteo.com/v1/search?' + urllib.parse.urlencode({'name': q, 'count': 20, 'language': lg, 'format': 'json'}))
        except Exception:
            continue
        best = None
        for g in j.get('results') or []:
            if g.get('country_code', '').upper() != cc: continue
            d = (g['latitude'] - lat) ** 2 + (g['longitude'] - lon) ** 2
            if d < 0.05 and (best is None or d < best[0]): best = (d, g)
        if best:
            g = best[1]
            out[lg] = {'n': g.get('name'), 'a1': g.get('admin1'), 'c': g.get('country')}
        time.sleep(0.15)
    return out

def climate(lat, lon):
    u = ('https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS10M'
         f'&community=RE&longitude={lon:.3f}&latitude={lat:.3f}&start=1991&end=2020&format=JSON')
    p = get(u)['properties']['parameter']
    m = lambda k: [p[k][M] for M in MONTHS]
    pr = [round(v * d, 1) for v, d in zip(m('PRECTOTCORR'), DAYS)]
    return {'tmax': [round(v, 1) for v in m('T2M_MAX')], 'tmin': [round(v, 1) for v in m('T2M_MIN')], 'rain': pr,
            'rh': [round(v) for v in m('RH2M')], 'wind': [round(v * 3.6, 1) for v in m('WS10M')]}

def main():
    data = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    have = {(v['geo'][0], v['cc']) for v in data.values()}
    todo = [r for r in select() if (r[0], r[1]) not in have]
    limit = int(os.environ.get('SEO_LIMIT', '0') or 0)
    if limit: todo = todo[:limit]
    print('cities selected; to fetch:', len(todo), flush=True)
    def work(r):
        try:
            nm = names(r)
            cl = climate(r[2], r[3])
            return r, nm, cl, None
        except Exception as e:
            return r, None, None, str(e)[:200]
    done = 0
    with cf.ThreadPoolExecutor(4) as ex:
        for r, nm, cl, err in ex.map(work, todo):
            if err: print('ERR', r[0], r[1], err, flush=True); continue
            en = (nm.get('en') or {}).get('n') or r[0]
            slug = ascii_slug(en) + '-' + r[1].lower()
            while slug in data: slug += '-2'
            data[slug] = {'geo': r[0], 'cc': r[1], 'lat': r[2], 'lon': r[3], 'pop': r[4], 'names': nm, 'clim': cl}
            done += 1
            if done % 25 == 0:
                json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
                print('saved', done, flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('total cities', len(data))

if __name__ == '__main__':
    main()
