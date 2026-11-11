/**
 * نفاف — الزوار مباشرة (Live presence + visitor statistics), one Durable Object with SQLite storage.
 * ============================================================
 * Live:   the app sends a beat every 30 s while it is on screen and a "bye" when it is hidden; a visitor is
 *         "here now" if their last beat is < 75 s old. Kept in memory (rebuilt within 30 s if the object restarts).
 * Stored: one row per visitor per day (country, first/last seen, sessions, active beats, source, language, device,
 *         installed) and the peak concurrency of every minute. No IP, no name, no position: the country comes
 *         from the connection; the city is only held in memory for the live view and never written.
 * The visitor id is the app's random anonymous id (visitorId), the same one /visit already used.
 */
export class Presence {
  constructor(state) {
    this.state = state; this.sql = state.storage.sql; this.live = new Map(); this.wrote = new Map(); this.lastMin = 0;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS visits(day TEXT, vid TEXT, cc TEXT, first INTEGER, last INTEGER, sessions INTEGER, beats INTEGER,
      src TEXT, lang TEXT, dev TEXT, st INTEGER, PRIMARY KEY(day, vid))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS seen(vid TEXT PRIMARY KEY, first_day TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS conc(m INTEGER PRIMARY KEY, n INTEGER)`);
  }
  count(now) { let n = 0; for (const v of this.live.values()) if (now - v.t < 75e3) n++; return n; }
  async fetch(request) {
    const url = new URL(request.url), now = Date.now();
    if (url.pathname === '/beat') {
      const b = await request.json();
      const vid = String(b.vid || '').slice(0, 40); if (!vid) return new Response('no');
      const prev = this.live.get(vid), fresh = !prev || now - prev.t > 5 * 60e3;
      this.live.set(vid, { t: now, since: fresh ? now : prev.since, cc: b.cc || '??', city: b.city || '', region: b.region || '',
        tab: String(b.tab || '').slice(0, 16), lang: String(b.lang || '').slice(0, 6), dev: b.dev === 'd' ? 'd' : b.dev === 't' ? 't' : 'm', st: b.st ? 1 : 0, src: String(b.src || '').slice(0, 24), page: String(b.page || 'app').slice(0, 16) });
      const day = new Date(now).toISOString().slice(0, 10);
      /* write at most once per 5 min per visitor (and always at the start of a session) */
      if (fresh || now - (this.wrote.get(vid) || 0) > 5 * 60e3) {
        this.wrote.set(vid, now);
        const isNew = this.sql.exec('SELECT first_day FROM seen WHERE vid=?', vid).toArray().length === 0;
        if (isNew) this.sql.exec('INSERT INTO seen(vid, first_day) VALUES(?,?)', vid, day);
        this.sql.exec(`INSERT INTO visits(day, vid, cc, first, last, sessions, beats, src, lang, dev, st) VALUES(?,?,?,?,?,1,1,?,?,?,?)
          ON CONFLICT(day, vid) DO UPDATE SET last=excluded.last, beats=beats+10, sessions=sessions+?, cc=excluded.cc, st=max(st, excluded.st)`,
          day, vid, b.cc || '??', now, now, String(b.src || ''), String(b.lang || ''), b.dev || 'm', b.st ? 1 : 0, fresh ? 1 : 0);
      }
      /* the minute's peak */
      const m = Math.floor(now / 60e3), n = this.count(now);
      if (m !== this.lastMin || n > (this.peak || 0)) {
        if (m !== this.lastMin) this.peak = 0;
        this.peak = Math.max(this.peak || 0, n); this.lastMin = m;
        this.sql.exec('INSERT INTO conc(m, n) VALUES(?,?) ON CONFLICT(m) DO UPDATE SET n=max(n, excluded.n)', m, this.peak);
      }
      if (Math.random() < 0.002) this.cleanup(now);
      for (const [k, v] of this.live) if (now - v.t > 10 * 60e3) { this.live.delete(k); this.wrote.delete(k); }
      return new Response(JSON.stringify({ n }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/bye') {
      const b = await request.json().catch(() => ({})); const v = this.live.get(String(b.vid || ''));
      if (v) v.t = now - 76e3;   /* gone from "now" at once; the session itself may resume */
      return new Response('ok');
    }
    if (url.pathname === '/snap') {
      const L = [...this.live.values()].filter(v => now - v.t < 75e3);
      const grp = f => { const o = {}; L.forEach(v => { const k = f(v); if (k) o[k] = (o[k] || 0) + 1; }); return o; };
      const m0 = Math.floor(now / 60e3);
      const spark = this.sql.exec('SELECT m, n FROM conc WHERE m >= ? ORDER BY m', m0 - 120).toArray();
      const day = new Date(now).toISOString().slice(0, 10);
      const today = this.sql.exec(`SELECT COUNT(*) AS u, SUM(sessions) AS s, SUM(st) AS st,
          SUM(CASE WHEN seen.first_day = visits.day THEN 1 ELSE 0 END) AS nw FROM visits LEFT JOIN seen USING(vid) WHERE day=?`, day).toArray()[0] || {};
      const todayCc = this.sql.exec('SELECT cc, COUNT(*) AS n FROM visits WHERE day=? GROUP BY cc ORDER BY n DESC LIMIT 30', day).toArray();
      const peak = this.sql.exec('SELECT MAX(n) AS p FROM conc WHERE m >= ?', Math.floor(Date.parse(day) / 60e3)).toArray()[0] || {};
      return Response.json({
        now: L.length, at: now,
        cc: grp(v => v.cc), city: grp(v => v.city ? v.cc + '|' + v.city : ''), tab: grp(v => v.page !== 'app' ? v.page : (v.tab || 'now')),
        lang: grp(v => v.lang), dev: grp(v => v.dev), inst: L.filter(v => v.st).length, src: grp(v => v.src),
        sessions: L.sort((a, b) => b.since - a.since).slice(0, 20).map(v => ({ cc: v.cc, city: v.city, tab: v.page !== 'app' ? v.page : v.tab, dev: v.dev, st: v.st, min: Math.round((now - v.since) / 60e3), lang: v.lang })),
        spark, today: { unique: today.u || 0, sessions: today.s || 0, installed: today.st || 0, newv: today.nw || 0, peak: peak.p || 0, cc: todayCc }
      });
    }
    if (url.pathname === '/stats') {
      const b = await request.json().catch(() => ({})); const days = Math.min(120, Math.max(1, b.days | 0 || 30));
      const from = new Date(now - (days - 1) * 864e5).toISOString().slice(0, 10);
      const q = (s, ...a) => this.sql.exec(s, ...a).toArray();
      return Response.json({
        days,
        perDay: q(`SELECT day, COUNT(*) AS u, SUM(sessions) AS s, SUM(CASE WHEN seen.first_day = visits.day THEN 1 ELSE 0 END) AS nw
                   FROM visits LEFT JOIN seen USING(vid) WHERE day >= ? GROUP BY day ORDER BY day`, from),
        cc: q('SELECT cc, COUNT(DISTINCT vid) AS u, SUM(sessions) AS s, SUM(beats) AS b FROM visits WHERE day >= ? GROUP BY cc ORDER BY u DESC LIMIT 80', from),
        src: q('SELECT src, COUNT(DISTINCT vid) AS u FROM visits WHERE day >= ? GROUP BY src ORDER BY u DESC LIMIT 20', from),
        lang: q('SELECT lang, COUNT(DISTINCT vid) AS u FROM visits WHERE day >= ? GROUP BY lang ORDER BY u DESC', from),
        dev: q('SELECT dev, COUNT(DISTINCT vid) AS u FROM visits WHERE day >= ? GROUP BY dev ORDER BY u DESC', from),
        total: q('SELECT COUNT(DISTINCT vid) AS u, SUM(sessions) AS s, ROUND(AVG(beats) * 0.5, 1) AS mins FROM visits WHERE day >= ?', from)[0] || {},
        returning: q(`SELECT COUNT(DISTINCT visits.vid) AS r FROM visits JOIN seen USING(vid) WHERE visits.day >= ? AND seen.first_day < visits.day`, from)[0] || {},
        allTime: q('SELECT COUNT(*) AS u FROM seen')[0] || {}
      });
    }
    return new Response('not found', { status: 404 });
  }
  cleanup(now) {
    const old = new Date(now - 400 * 864e5).toISOString().slice(0, 10);
    this.sql.exec('DELETE FROM visits WHERE day < ?', old);
    this.sql.exec('DELETE FROM conc WHERE m < ?', Math.floor(now / 60e3) - 3 * 1440);
  }
}
