/**
 * نفاف — خادم البثّ الحيّ للإشعارات
 * ============================================================
 * الفكرة: إشعار واحد يُستبدل محتواه ويحكي قصة الحدث لحظة بلحظة،
 *         بدل تراكم إشعارات تُزعج فتُحذف.
 *
 * ⚠️ قواعد مفروضة بالكود لا بالنية:
 *   ١) tag ثابت لكل مستخدم → أندرويد يستبدل الإشعار لا يكدّسه.
 *   ٢) الصوت والاهتزاز عند ٣ مراحل فقط (بداية · قفزة · رعد) — والباقي صامت.
 *   ٣) لا تحذيرات سلامة إطلاقًا. رصد ووصف فقط.
 *   ٤) صمت ليلي ٠١:٠٠–٠٦:٠٠ بتوقيت مسقط إلا لبداية المطر.
 *
 * النشر:
 *   npx wrangler kv namespace create NAFAF_KV
 *   npx wrangler secret put VAPID_PRIVATE_KEY
 *   npx wrangler deploy
 * ============================================================
 */

const MODELS = 'ecmwf_ifs025,gfs_seamless,icon_seamless';

/* ٥٢ موقعًا — نفس مواقع مرصد الأمطار في التطبيق */
const SPOTS = [
  ['شناص',24.742,56.468,'الباطنة'],['لوى',24.531,56.564,'الباطنة'],
  ['صحار',24.347,56.709,'الباطنة'],['صحم',24.172,56.888,'الباطنة'],
  ['الخابورة',23.977,57.096,'الباطنة'],['السويق',23.849,57.438,'الباطنة'],
  ['المصنعة',23.780,57.615,'الباطنة'],['بركاء',23.708,57.889,'الباطنة'],
  ['الرستاق',23.390,57.424,'الباطنة'],['العوابي',23.310,57.531,'الباطنة'],
  ['نخل',23.395,57.831,'الباطنة'],['وادي المعاول',23.520,57.930,'الباطنة'],
  ['السيب',23.670,58.189,'مسقط'],['بوشر',23.560,58.400,'مسقط'],
  ['مسقط',23.614,58.593,'مسقط'],['قريات',23.258,58.905,'مسقط'],
  ['نزوى',22.933,57.533,'الداخلية'],['بهلا',22.964,57.301,'الداخلية'],
  ['الحمراء',23.118,57.298,'الداخلية'],['منح',22.802,57.588,'الداخلية'],
  ['أدم',22.379,57.527,'الداخلية'],['سمائل',23.305,57.972,'الداخلية'],
  ['إزكي',22.933,57.767,'الداخلية'],['الجبل الأخضر',23.073,57.660,'الداخلية'],
  ['عبري',23.225,56.516,'الظاهرة'],['ينقل',23.588,56.539,'الظاهرة'],
  ['ضنك',23.548,56.253,'الظاهرة'],['البريمي',24.249,55.793,'البريمي'],
  ['محضة',24.399,55.972,'البريمي'],['السنينة',23.851,55.797,'البريمي'],
  ['إبراء',22.690,58.533,'الشرقية'],['المضيبي',22.570,58.130,'الشرقية'],
  ['بدية',22.449,58.800,'الشرقية'],['سمد الشأن',22.630,58.000,'الشرقية'],
  ['صور',22.567,59.529,'الشرقية'],['جعلان',22.030,59.330,'الشرقية'],
  ['مصيرة',20.670,58.890,'الشرقية'],['خصب',26.180,56.244,'مسندم'],
  ['بخا',26.153,56.146,'مسندم'],['دبا',25.617,56.267,'مسندم'],
  ['هيما',19.960,56.280,'الوسطى'],['الدقم',19.660,57.700,'الوسطى'],
  ['صلالة',17.019,54.089,'ظفار'],['ثمريت',17.666,54.024,'ظفار'],
  ['مرباط',16.993,54.692,'ظفار'],['ضلكوت',16.700,53.250,'ظفار'],
  ['دبي',25.204,55.270,'الإمارات'],['أبوظبي',24.453,54.377,'الإمارات'],
  ['العين',24.207,55.744,'الإمارات'],['رأس الخيمة',25.790,55.943,'الإمارات'],
  ['الفجيرة',25.128,56.326,'الإمارات'],['الشارقة',25.346,55.421,'الإمارات']
];

/* ============================================================
   مراحل القصة — نبرة نفاف تتصاعد مع الحدث
   ============================================================ */
const PHASES = {
  /* ١) ما قبل المطر — الضغط ينزل والسحب تتجمّع */
  building: {
    alert: false,
    title: (d) => 'نفاف يشوف تغيّر',
    body: (d) => `السحب تتجمّع فوق ${d.top}${d.press ? ` — الضغط نازل ${d.press} hPa` : ''}. ترقّب.`
  },
  /* ٢) بدأ المطر — لحظة الفرح، تستحق صوتًا */
  started: {
    alert: true,
    title: (d) => 'نفاف نزل! 🌧️',
    body: (d) => d.dry >= 20
      ? `بعد ${d.dry} يوم انتظار، بدأ المطر على ${d.top}. عساه بداية خير.`
      : `بدأ المطر على ${d.top}${d.n > 1 ? ` و${d.n - 1} منطقة ثانية` : ''}.`
  },
  /* ٣) يشتد — تحديث صامت */
  rising: {
    alert: false,
    title: (d) => 'المطر يشتد',
    body: (d) => `${d.mm} ملم على ${d.top}${d.n > 1 ? ` · ${d.list}` : ''}.`
  },
  /* ٤) قفزة كبيرة — تستحق تنبيهًا */
  surge: {
    alert: true,
    title: (d) => 'المطر غزير الحين',
    body: (d) => `${d.mm} ملم على ${d.top}. ${d.n} منطقة تمطر الحين.`
  },
  /* ٥) الذروة — صامت */
  peak: {
    alert: false,
    title: (d) => 'ذروة المطر',
    body: (d) => `أعلى كمية ${d.mm} ملم على ${d.top}${d.n > 1 ? ` · ${d.list}` : ''}.`
  },
  /* ٦) رعد — يستحق تنبيهًا */
  thunder: {
    alert: true,
    title: (d) => 'نشاط رعدي',
    body: (d) => `سحب رعدية على ${d.top}. راقب السما من مكان آمن.`
  },
  /* ٧) انحسر — تحديث صامت يختم القصة */
  easing: {
    alert: false,
    title: (d) => 'هدأ المطر',
    body: (d) => `انحسر المطر${d.total ? ` — نزل ${d.total} ملم إجمالًا اليوم` : ''}. الحمد لله.`
  }
};

/* ============================================================
   مسح المواقع
   ============================================================ */
async function scanRain() {
  const lats = SPOTS.map(s => s[1]).join(',');
  const lons = SPOTS.map(s => s[2]).join(',');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&current=precipitation,weather_code&forecast_days=1&models=${MODELS}&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('fetch failed');
  const d = await r.json();
  const arr = Array.isArray(d) ? d : [d];
  const wet = [];
  let thunder = false;
  const mods = MODELS.split(',');

  for (let i = 0; i < arr.length && i < SPOTS.length; i++) {
    const cu = arr[i] && arr[i].current;
    if (!cu) continue;
    let maxMM = 0, hits = 0;
    for (const m of mods) {
      const mm = cu['precipitation_' + m];
      const wc = cu['weather_code_' + m];
      const codeRain = wc != null && ((wc >= 51 && wc <= 67) || (wc >= 80 && wc <= 82) || (wc >= 95 && wc <= 99));
      if (wc >= 95 && wc <= 99) thunder = true;
      if (codeRain || (mm != null && mm >= 0.05)) hits++;
      if (mm != null && mm > maxMM) maxMM = mm;
    }
    if (hits > 0) wet.push({ name: SPOTS[i][0], region: SPOTS[i][3], mm: maxMM, hits });
  }
  wet.sort((a, b) => b.mm - a.mm || b.hits - a.hits);
  return { wet, thunder };
}

/* ============================================================
   تحديد المرحلة من الحالة السابقة
   ============================================================ */
function decidePhase(prev, now) {
  const wasWet = prev && prev.n > 0;
  const isWet = now.wet.length > 0;
  const maxMM = isWet ? now.wet[0].mm : 0;
  const prevMM = prev ? prev.mm : 0;

  if (!wasWet && !isWet) return null;                       /* لا شيء */
  if (!wasWet && isWet) return 'started';                    /* بدأ */
  if (wasWet && !isWet) return 'easing';                     /* انتهى */
  if (now.thunder && !(prev && prev.thunder)) return 'thunder';
  if (maxMM >= prevMM * 2 && maxMM - prevMM >= 2) return 'surge';
  if (maxMM > prevMM + 0.4) return 'rising';
  if (maxMM < prevMM - 0.6) return 'easing';
  return 'peak';
}

/* ليل مسقط؟ (UTC+4) */
function isQuietHours() {
  const h = (new Date().getUTCHours() + 4) % 24;
  return h >= 1 && h < 6;
}

/* ============================================================
   البثّ
   ============================================================ */
async function broadcast(env, phase, data) {
  const P = PHASES[phase];
  if (!P) return 0;

  /* صمت ليلي إلا لبداية المطر */
  let alert = P.alert;
  if (isQuietHours() && phase !== 'started') return 0;
  if (isQuietHours()) alert = true;   /* بداية المطر ليلًا تستحق */

  const payload = {
    title: P.title(data),
    body: P.body(data),
    tag: 'nafaf-rain',        /* ★ نفس الوسم = استبدال لا تكديس */
    renotify: alert,          /* صوت/اهتزاز عند المراحل الثلاث فقط */
    silent: !alert,
    phase,
    ts: Date.now()
  };

  const list = await env.NAFAF_KV.list({ prefix: 'sub:' });
  let sent = 0;
  for (const k of list.keys) {
    try {
      const sub = JSON.parse(await env.NAFAF_KV.get(k.name));
      const ok = await sendPush(env, sub, payload);   /* الوحدة المُختبرة أعلاه */
      if (ok) sent++;
      else await env.NAFAF_KV.delete(k.name);   /* اشتراك ميت */
    } catch (_) {}
  }
  return sent;
}

/* ============================================================
   وحدة التشفير — Web Push (RFC 8291 + VAPID)
   ✅ مُختبرة بالكامل: توقيع ES256 محقَّق بمفتاح مستقل،
      وتشفير aes128gcm محقَّق حجمًا وبنية (ترويسة 86 بايت + وسم GCM).
      بلا أي مكتبة خارجية — Web Crypto API الأصلية فقط.
   ============================================================ */

function b64url(buf) {
  var bin = '';
  var bytes = new Uint8Array(buf);
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  var bin = atob(str);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concatBytes() {
  var total = 0, i;
  for (i = 0; i < arguments.length; i++) total += arguments[i].length;
  var out = new Uint8Array(total), off = 0;
  for (i = 0; i < arguments.length; i++) { out.set(arguments[i], off); off += arguments[i].length; }
  return out;
}

/* ===== توقيع VAPID (JWT بصيغة ES256) ===== */
async function vapidHeader(endpoint, publicKeyB64, privateKeyB64) {
  var aud = new URL(endpoint).origin;
  var header = { typ: 'JWT', alg: 'ES256' };
  var now = Math.floor(Date.now() / 1000);
  var payload = { aud: aud, exp: now + 12 * 3600, sub: 'mailto:app@nafaf.local' };
  var unsigned = b64url(new TextEncoder().encode(JSON.stringify(header))) + '.' +
                 b64url(new TextEncoder().encode(JSON.stringify(payload)));

  /* استيراد المفتاح الخاص بصيغة JWK من raw scalar */
  var d = fromB64url(privateKeyB64);
  var pub = fromB64url(publicKeyB64);          /* 65 بايت: 0x04 + X(32) + Y(32) */
  var jwk = {
    kty: 'EC', crv: 'P-256',
    d: b64url(d),
    x: b64url(pub.slice(1, 33)),
    y: b64url(pub.slice(33, 65))
  };
  var key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  var sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned)));
  var jwt = unsigned + '.' + b64url(sig);
  return 'vapid t=' + jwt + ', k=' + publicKeyB64;
}

/* ===== تشفير الحمولة (RFC 8291 aes128gcm) ===== */
async function encryptPayload(sub, plaintextObj) {
  var p256dh = fromB64url(sub.keys.p256dh);
  var authSecret = fromB64url(sub.keys.auth);
  var plaintext = new TextEncoder().encode(JSON.stringify(plaintextObj));

  var serverKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  var serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));

  var clientPubKey = await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  var sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPubKey }, serverKeys.privateKey, 256));

  async function hkdf(salt, ikm, info, len) {
    var key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt, info: info }, key, len * 8);
    return new Uint8Array(bits);
  }

  var authInfo = concatBytes(new TextEncoder().encode('WebPush: info\0'), p256dh, serverPubRaw);
  var prk = await hkdf(authSecret, sharedSecret, authInfo, 32);

  var salt = crypto.getRandomValues(new Uint8Array(16));
  var cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  var nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  var cek = await hkdf(salt, prk, cekInfo, 16);
  var nonce = await hkdf(salt, prk, nonceInfo, 12);

  var padded = concatBytes(plaintext, new Uint8Array([2]));
  var aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  var ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  var rs = 4096;
  var header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = 65;
  header.set(serverPubRaw, 21);

  return concatBytes(header, ciphertext);
}

/* ===== الإرسال الكامل ===== */
/* Urgency (RFC 8030): خدمة كروم/أندرويد (FCM) تؤجّل الرسائل العادية حين يكون الجوال في وضع السكون (Doze)،
   فتنبيهات المطر تُرسل "high" لتوقظ الجوال فورًا، والتحديثات الهادئة (الودجت) "low" حتى لا تستنزف البطارية.
   الاشتراك الميت (404/410) يُحذف فورًا حتى لا يُهدر الإرسال عليه في كل دورة. */
function pushUrgency(p) {
  if (!p) return 'normal';
  if (p.urgency) return p.urgency;
  if (p.widget || p.silent) return 'low';
  if (p.sev === 'alert' || p.sev === 'notice' || /rain|thunder|near|soon|flood|storm|test/i.test(String(p.type || p.tag || ''))) return 'high';
  return 'normal';
}
async function sendPushStatus(env, sub, payloadObj) {
  try {
    var auth = await vapidHeader(sub.endpoint, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    var body = await encryptPayload(sub, payloadObj);
    var urg = pushUrgency(payloadObj);
    var res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'TTL': urg === 'high' ? '3600' : '900',
        'Urgency': urg,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Authorization': auth
      },
      body: body
    });
    if (res.status === 404 || res.status === 410) {
      try { await env.NAFAF_KV.delete('sub:' + btoa(sub.endpoint).slice(-40)); } catch (e) {}
    }
    return res.status;
  } catch (e) { return 0; }
}
async function sendPush(env, sub, payloadObj) {
  var st = await sendPushStatus(env, sub, payloadObj);
  return st >= 200 && st < 300;
}


/* ============================================================
   ★ حارس السلسلة — يذكّر قبل أن تُفقد لا بعدها
   ⚠️ مبادئ غير قابلة للتفاوض:
     • لا تأنيب ولا لوم — نبرة قلق ودّي فقط
     • لا يعمل إلا لمن سلسلته ٣ أيام فأكثر (لا معنى قبلها)
     • مرة واحدة في اليوم كحد أقصى لكل مستخدم
     • في نافذة ٢٠:٠٠–٢٢:٣٠ بتوقيته المحلي فقط
   ============================================================ */
const GUARD_MSG = {
  dial: (n) => ({
    title: 'وينك؟',
    body: n >= 30
      ? `سلسلتك معي ${n} يوم. باقي شوي على منتصف الليل — لا تخليها تروح.`
      : n >= 7
        ? `سلسلتك ${n} يوم متصلة. مرّ على سماك قبل ما ينتهي اليوم.`
        : `سلسلتك ${n} أيام. طلّة سريعة تكفي.`
  }),
  fus: (n) => ({
    title: 'تذكير',
    body: `سلسلتك المتصلة ${n} يومًا. تبقّى وقت قصير قبل انتهاء اليوم.`
  }),
  en: (n) => ({
    title: 'Still there?',
    body: `Your streak is at ${n} days. A quick look keeps it alive.`
  })
};

async function runStreakGuard(env) {
  const list = await env.NAFAF_KV.list({ prefix: 'hb:' });
  let sent = 0;

  for (const k of list.keys) {
    try {
      const hb = JSON.parse(await env.NAFAF_KV.get(k.name));
      if (!hb || !hb.endpoint) continue;
      if (hb.streak < 3) continue;                    /* لا معنى لسلسلة أقصر */

      /* وقت المستخدم المحلي */
      const localMs = Date.now() + (hb.tz * 60000);
      const local = new Date(localMs);
      const hour = local.getUTCHours();
      const mins = local.getUTCMinutes();

      /* النافذة: ٢٠:٠٠ حتى ٢٢:٣٠ محليًا */
      const inWindow = (hour === 20 || hour === 21 || (hour === 22 && mins <= 30));
      if (!inWindow) continue;

      /* هل فتح التطبيق اليوم بتوقيته؟ */
      const seenLocal = new Date(hb.seen + (hb.tz * 60000));
      const sameDay = seenLocal.getUTCFullYear() === local.getUTCFullYear()
        && seenLocal.getUTCMonth() === local.getUTCMonth()
        && seenLocal.getUTCDate() === local.getUTCDate();
      if (sameDay) continue;                          /* فتحه اليوم — لا داعي */

      /* هل نبّهناه اليوم بالفعل؟ */
      const dayTag = local.getUTCFullYear() + '-' + (local.getUTCMonth() + 1) + '-' + local.getUTCDate();
      if (hb.guarded === dayTag) continue;

      const msg = (GUARD_MSG[hb.lang] || GUARD_MSG.dial)(hb.streak);
      const subRaw = await env.NAFAF_KV.get('sub:' + k.name.slice(3));
      if (!subRaw) continue;
      const sub = JSON.parse(subRaw);

      const ok = await sendPush(env, sub, {
        title: msg.title,
        body: msg.body,
        tag: 'nafaf-streak',       /* وسم منفصل عن المطر — لا يستبدله */
        renotify: true,
        silent: false
      });

      if (ok) {
        sent++;
        hb.guarded = dayTag;
        await env.NAFAF_KV.put(k.name, JSON.stringify(hb), { expirationTtl: 60 * 60 * 24 * 90 });
      }
    } catch (_) {}
  }
  return sent;
}


/* ★ يضيف أي تبويب جديد في الافتراضي ولم يعرفه الإعداد المحفوظ —
   فالميزة الجديدة تظهر تلقائيًا في التطبيق والبوابة دون تحرير يدوي.
   ⚠️ التبويب الذي أطفأه المشغّل يبقى مطفأ لأنه موجود في القائمة. */
function mergeNav(cfg) {
  try {
    if (!cfg || !Array.isArray(cfg.navigation)) return cfg;
    const have = new Set(cfg.navigation.map(n => n.id));
    for (const d of defaultCfg().navigation) {
      if (!have.has(d.id)) cfg.navigation.push(Object.assign({}, d));
    }
    /* ★ الأقسام الجديدة تُضاف للإعداد المحفوظ في مكانها — المخفي يبقى مخفيًا */
    const dflt = defaultCfg();
    if (!cfg.blocks) cfg.blocks = { now: [] };
    if (!Array.isArray(cfg.blocks.now)) cfg.blocks.now = [];
    const hb = new Set(cfg.blocks.now.map(b => b.id));
    for (const b of dflt.blocks.now) if (!hb.has(b.id)) cfg.blocks.now.push(Object.assign({}, b));
    cfg.blocks.now = cfg.blocks.now.filter(b => b.id !== 'ask');
    if (!Array.isArray(cfg.dock) || !cfg.dock.length) cfg.dock = dflt.dock.map(d => Object.assign({}, d));
    else { const hd = new Set(cfg.dock.map(d => d.id)); for (const d of dflt.dock) if (!hd.has(d.id)) cfg.dock.push(Object.assign({}, d)); }
    /* اسم قديم للتبويب fc */
    for (const n of cfg.navigation) {
      if (n.id === 'fc' && n.label === 'التوقعات') { n.label = 'الطقس القادم'; n.en = 'Coming weather'; }
    }
  } catch (_) {}
  return cfg;
}

/* التحقق من كلمة مرور اللوحة — KV يتقدّم على المتغيّر الأصلي */
async function checkPass(env, given) {
  if (!given) return false;
  const stored = await env.NAFAF_KV.get('adminpass');
  const real = stored || env.ADMIN_PASS || '';
  return real !== '' && String(given) === String(real);
}

/* ============================================================
   نقاط الدخول
   ============================================================ */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  /* الفحص الدوري — كل ١٠ دقائق */
  async scheduled(event, env, ctx) {
    try {
      const now = await scanRain();
      const raw = await env.NAFAF_KV.get('state');
      const prev = raw ? JSON.parse(raw) : null;

      const phase = decidePhase(prev, now);
      const top = now.wet[0];
      const list = now.wet.slice(1, 4).map(w => w.name).join(' · ');

      /* تراكم اليوم */
      const today = new Date().toISOString().slice(0, 10);
      let total = (prev && prev.day === today) ? (prev.total || 0) : 0;
      if (top) total = Math.max(total, top.mm);

      if (phase) {
        await broadcast(env, phase, {
          top: top ? top.name : (prev ? prev.top : ''),
          n: now.wet.length,
          mm: top ? top.mm.toFixed(1) : '0',
          list,
          total: total ? total.toFixed(1) : null,
          dry: prev ? (prev.dryDays || 0) : 0,
          press: null
        });
      }

      /* احفظ الحالة */
      const dryDays = now.wet.length ? 0 : ((prev && prev.dryDays || 0) + (phase === 'easing' ? 1 : 0));
      await env.NAFAF_KV.put('state', JSON.stringify({
        n: now.wet.length, mm: top ? top.mm : 0, top: top ? top.name : null,
        thunder: now.thunder, day: today, total, dryDays, phase, ts: Date.now()
      }));

      /* ★ حارس السلسلة — يعمل في نفس الدورة */
      await runStreakGuard(env);

      /* ★ محرك التنبيهات الشامل — لكل مستخدم حسب موقعه */
      await runAlerts(env);
    } catch (e) {
      console.error('scheduled error', e);
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    /* تسجيل اشتراك */
    if (url.pathname === '/subscribe' && request.method === 'POST') {
      const sub = await request.json();
      if (!sub || !sub.endpoint) return json({ error: 'bad subscription' }, 400);
      const id = 'sub:' + btoa(sub.endpoint).slice(-40);
      /* ★ نحفظ موقع المستخدم مع اشتراكه ليصله ما يخصّه هو
         ⚠️ إحداثيات مقرّبة لدرجة عشرية (~١١ كم) — تكفي للطقس
            ولا تكشف عنوان أحد. */
      const rec = Object.assign({}, sub);
      if (typeof sub.lat === 'number') rec.lat = Math.round(sub.lat * 10) / 10;
      if (typeof sub.lon === 'number') rec.lon = Math.round(sub.lon * 10) / 10;
      if (sub.place) rec.place = String(sub.place).slice(0, 60);
      if (typeof sub.tz === 'number') rec.tz = sub.tz;
      rec.ts = Date.now();
      await env.NAFAF_KV.put(id, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 120 });
      return json({ ok: true });
    }

    /* ★ نبض السلسلة — التطبيق يخبرنا أنه فُتح اليوم وكم طول سلسلته
       ⚠️ لا نخزّن أي بيانات شخصية: فقط رقم السلسلة وإزاحة المنطقة الزمنية */
    if (url.pathname === '/heartbeat' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !b.endpoint) return json({ error: 'bad request' }, 400);
      const id = 'hb:' + btoa(b.endpoint).slice(-40);
      await env.NAFAF_KV.put(id, JSON.stringify({
        endpoint: b.endpoint,
        streak: Math.max(0, parseInt(b.streak, 10) || 0),
        tz: parseInt(b.tz, 10) || 0,          /* دقائق الإزاحة عن UTC */
        seen: Date.now(),
        lang: (b.lang === 'en' || b.lang === 'fus') ? b.lang : 'dial'
      }), { expirationTtl: 60 * 60 * 24 * 90 });
      return json({ ok: true });
    }

    /* إلغاء اشتراك */
    if (url.pathname === '/unsubscribe' && request.method === 'POST') {
      const sub = await request.json();
      if (sub && sub.endpoint) {
        await env.NAFAF_KV.delete('sub:' + btoa(sub.endpoint).slice(-40));
      }
      return json({ ok: true });
    }


    /* ============================================================
       ★ نظام الأخبار العاجلة — لوحة التحكم
       ============================================================ */

    /* قراءة الخبر الحالي — مفتوحة للتطبيق */
    if (url.pathname === '/news') {
      const raw = await env.NAFAF_KV.get('news', { cacheTtl: 120 });
      if (!raw) return json({ active: false });
      const n = JSON.parse(raw);
      /* انتهت صلاحيته؟ */
      if (n.expires && Date.now() > n.expires) {
        await env.NAFAF_KV.delete('news');
        return json({ active: false });
      }
      return json(n);
    }

    /* نشر أو تحديث خبر — محمية */
    if (url.pathname === '/news/publish' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.title || !String(b.title).trim()) return json({ error: 'no title' }, 400);

      const item = {
        active: true,
        kind: ['urgent', 'alert', 'info', 'good'].indexOf(b.kind) >= 0 ? b.kind : 'info',
        title: String(b.title).slice(0, 120),
        body: b.body ? String(b.body).slice(0, 400) : '',
        ts: Date.now(),
        expires: b.hours ? Date.now() + (parseInt(b.hours, 10) * 3600000) : null
      };
      await env.NAFAF_KV.put('news', JSON.stringify(item));

      /* إرسال إشعار مع الخبر إن طُلب */
      let pushed = 0;
      if (b.notify) {
        const list = await env.NAFAF_KV.list({ prefix: 'sub:' });
        for (const k of list.keys) {
          try {
            const sub = JSON.parse(await env.NAFAF_KV.get(k.name));
            const ok = await sendPush(env, sub, {
              title: item.title,
              body: item.body || '',
              tag: 'nafaf-news',
              renotify: true,
              silent: false
            });
            if (ok) pushed++;
          } catch (_) {}
        }
      }
      return json({ ok: true, pushed });
    }

    /* إيقاف الخبر فورًا — محمية */
    if (url.pathname === '/news/stop' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      await env.NAFAF_KV.delete('news');
      return json({ ok: true });
    }

    /* إحصاءات للوحة التحكم — محمية */
    if (url.pathname === '/admin/stats' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const subs = await env.NAFAF_KV.list({ prefix: 'sub:' });
      const hbs = await env.NAFAF_KV.list({ prefix: 'hb:' });
      const stateRaw = await env.NAFAF_KV.get('state');
      const newsRaw = await env.NAFAF_KV.get('news');
      return json({
        ok: true,
        subscribers: subs.keys.length,
        activeUsers: hbs.keys.length,
        rain: stateRaw ? JSON.parse(stateRaw) : null,
        news: newsRaw ? JSON.parse(newsRaw) : null
      });
    }

    /* تغيير كلمة المرور — محمية بالحالية */
    if (url.pathname === '/admin/pass' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.newPass || String(b.newPass).length < 6) return json({ error: 'weak' }, 400);
      /* ⚠️ لا يمكن تغيير Secret برمجيًا في Workers — نخزّنها في KV كبديل */
      await env.NAFAF_KV.put('adminpass', String(b.newPass));
      return json({ ok: true, note: 'تم الحفظ في KV — يتقدّم على المتغيّر الأصلي' });
    }


    /* ============================================================
       ★ الإعدادات الحيّة — يتحكم بها المشغّل من اللوحة
       ============================================================ */

    /* قراءة الإعدادات — مفتوحة للتطبيق */
    if (url.pathname === '/config') {
      const raw = await env.NAFAF_KV.get('config');
      const cfg = raw ? JSON.parse(raw) : {};
      return json(Object.assign({
        rotateSec: 4,                                  /* ثواني البطاقة الدوّارة */
        rotateSlides: null,                            /* null = كل الشرائح */
        tabOrder: null,                                /* null = الترتيب الافتراضي */
        features: {}                                   /* تفعيل/تعطيل ميزات */
      }, cfg));
    }

    /* حفظ الإعدادات — محمية */
    if (url.pathname === '/config/save' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const cfg = {
        rotateSec: Math.max(2, Math.min(30, parseInt(b.rotateSec, 10) || 4)),
        rotateSlides: Array.isArray(b.rotateSlides) ? b.rotateSlides : null,
        tabOrder: Array.isArray(b.tabOrder) ? b.tabOrder : null,
        features: (b.features && typeof b.features === 'object') ? b.features : {},
        updated: Date.now()
      };
      await env.NAFAF_KV.put('config', JSON.stringify(cfg));
      return json({ ok: true, config: cfg });
    }

    /* ============================================================
       ★ عدّاد الزوار — لحظي وتراكمي
       ⚠️ لا نخزّن أي معرّف شخصي: بصمة مجهولة يومية فقط
       ============================================================ */
    if (url.pathname === '/visit' && request.method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const now = Date.now();
      const day = new Date(now).toISOString().slice(0, 10);

      /* بصمة مجهولة: تُشتق من معرّف عشوائي يولّده التطبيق ويحفظه محليًا */
      const vid = String(b.vid || '').slice(0, 40);
      if (!vid) return json({ ok: false });

      /* نشط الآن: صلاحية ٥ دقائق
         ★ نقرأ أولًا لنعرف إن كانت الجلسة قائمة — يوفّر كتابات كثيرة */
      const alreadyLive = await env.NAFAF_KV.get('live:' + vid);
      /* لا نُجدّد إلا إن قاربت الصلاحية على الانتهاء */
      if (!alreadyLive || (now - parseInt(alreadyLive, 10)) > 240000) {
        await env.NAFAF_KV.put('live:' + vid, String(now), { expirationTtl: 900 });
      }

      /* زائر فريد اليوم */
      const dayKey = 'vday:' + day + ':' + vid;
      const seen = await env.NAFAF_KV.get(dayKey);
      if (!seen) {
        await env.NAFAF_KV.put(dayKey, '1', { expirationTtl: 60 * 60 * 40 });
        /* عدّاد اليوم */
        const dc = parseInt(await env.NAFAF_KV.get('vcount:' + day) || '0', 10) + 1;
        await env.NAFAF_KV.put('vcount:' + day, String(dc), { expirationTtl: 60 * 60 * 24 * 400 });
        /* الإجمالي التراكمي */
        const total = parseInt(await env.NAFAF_KV.get('vtotal') || '0', 10) + 1;
        await env.NAFAF_KV.put('vtotal', String(total));
      }

      /* ★★★ عدّاد الفتحات — يُكتب مرة كل جلسة لا كل نداء ★★★
         ⚠️ كان يكتب في كل ping (كل ٣ دقائق) = ٤٨٠ كتابة يوميًا للمستخدم
            الواحد — وهذا وحده يستنزف الحد المجاني (١٠٠٠ كتابة) بمستخدمين.
         ⚠️ الآن: يُحتسب مرة واحدة عند بداية الجلسة فقط. */
      if (!alreadyLive) {
        const opens = parseInt(await env.NAFAF_KV.get('opens:' + day) || '0', 10) + 1;
        await env.NAFAF_KV.put('opens:' + day, String(opens), { expirationTtl: 60 * 60 * 24 * 400 });
      }

      return json({ ok: true });
    }

    /* إحصاءات الزوار التفصيلية — محمية */
    if (url.pathname === '/admin/visitors' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);

      const live = await env.NAFAF_KV.list({ prefix: 'live:' });
      const total = parseInt(await env.NAFAF_KV.get('vtotal') || '0', 10);

      /* آخر ١٤ يومًا */
      const days = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        days.push({
          day: d,
          unique: parseInt(await env.NAFAF_KV.get('vcount:' + d) || '0', 10),
          opens: parseInt(await env.NAFAF_KV.get('opens:' + d) || '0', 10)
        });
      }

      return json({
        ok: true,
        liveNow: live.keys.length,
        total: total,
        days: days
      });
    }



    /* ============================================================
       ★ المراسلون المعتمدون
       ============================================================ */

    /* تقديم طلب مراسل — يتطلب تسجيل دخول */
    if (url.pathname === '/correspondent/apply' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !b.vid || !b.name) return json({ error: 'bad request' }, 400);
      const vidA = String(b.vid).slice(0, 40);
      /* البريد من تسجيل الدخول لا من إدخال المستخدم */
      let uEmail = '';
      try {
        const u = await env.NAFAF_KV.get('user:' + vidA);
        if (u) uEmail = JSON.parse(u).email || '';
      } catch (_) {}
      if (!uEmail) return json({ error: 'login required' }, 401);

      await env.NAFAF_KV.put('capp:' + vidA, JSON.stringify({
        vid: vidA,
        email: uEmail,
        name: String(b.name).slice(0, 60),
        wilaya: String(b.wilaya || '').slice(0, 40),
        contact: String(b.contact || '').slice(0, 60),
        why: String(b.why || '').slice(0, 300),
        ts: Date.now(), status: 'pending'
      }), { expirationTtl: 60 * 60 * 24 * 180 });
      return json({ ok: true });
    }

    /* حالة المراسل — يسألها التطبيق */
    if (url.pathname === '/correspondent/status' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !b.vid) return json({ error: 'bad request' }, 400);
      const vid = String(b.vid).slice(0, 40);
      const approved = await env.NAFAF_KV.get('corr:' + vid);
      if (approved) {
        let nm = '';
        try { nm = JSON.parse(approved).name || ''; } catch (_) {}
        return json({ ok: true, status: 'approved', name: nm });
      }
      const pending = await env.NAFAF_KV.get('capp:' + vid);
      return json({ ok: true, status: pending ? 'pending' : 'none' });
    }

    /* قائمة الطلبات والمعتمدين — محمية */
    if (url.pathname === '/admin/correspondents' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const apps = await env.NAFAF_KV.list({ prefix: 'capp:' });
      const active = await env.NAFAF_KV.list({ prefix: 'corr:' });
      const pending = [], approved = [];
      for (const k of apps.keys) {
        try { const a = JSON.parse(await env.NAFAF_KV.get(k.name)); if (a) pending.push(a); } catch (_) {}
      }
      for (const k of active.keys) {
        try { const a = JSON.parse(await env.NAFAF_KV.get(k.name)); if (a) approved.push(a); } catch (_) {}
      }
      return json({ ok: true, pending, approved });
    }

    /* اعتماد أو إلغاء مراسل — محمية */
    if (url.pathname === '/admin/correspondent/decide' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.vid) return json({ error: 'no vid' }, 400);
      const vid = String(b.vid).slice(0, 40);

      if (b.decision === 'approve') {
        const raw = await env.NAFAF_KV.get('capp:' + vid);
        const a = raw ? JSON.parse(raw) : { vid, name: b.name || '' };
        a.status = 'approved'; a.approvedAt = Date.now();
        await env.NAFAF_KV.put('corr:' + vid, JSON.stringify(a));
        await env.NAFAF_KV.delete('capp:' + vid);
        return json({ ok: true, status: 'approved' });
      }
      if (b.decision === 'revoke') {
        await env.NAFAF_KV.delete('corr:' + vid);
        return json({ ok: true, status: 'revoked' });
      }
      await env.NAFAF_KV.delete('capp:' + vid);
      return json({ ok: true, status: 'rejected' });
    }

    /* ============================================================
       ★ نظام الرصد الشعبي — ثلاث طبقات
         مراسل معتمد (بموافقة) · إجماع تلقائي · رصد فردي
       ⚠️ الإحداثيات تُحفظ للتدقيق عندك فقط — لا تُعرض للعامة
       ============================================================ */

    /* استقبال رصد */
    if (url.pathname === '/report' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !b.vid || !b.kind) return json({ error: 'bad request' }, 400);
      const vid = String(b.vid).slice(0, 40);
      const kind = String(b.kind).slice(0, 20);
      const valid = ['clear','clouds','rain','dust','humid','cold'];
      if (valid.indexOf(kind) < 0) return json({ error: 'bad kind' }, 400);

      /* ★ منع التكرار — رصد واحد لكل جهاز كل ٣٠ دقيقة (يتحقق الخادم لا التطبيق) */
      const last = await env.NAFAF_KV.get('rlim:' + vid);
      if (last && (Date.now() - parseInt(last, 10)) < 30 * 60000) {
        const left = Math.ceil((30 * 60000 - (Date.now() - parseInt(last, 10))) / 60000);
        return json({ error: 'rate', minutes: left }, 429);
      }
      await env.NAFAF_KV.put('rlim:' + vid, String(Date.now()), { expirationTtl: 2400 });

      /* هل هو مراسل معتمد؟ */
      const corrRaw = await env.NAFAF_KV.get('corr:' + vid);
      const isCorr = !!corrRaw;
      let corrName = '';
      if (isCorr) { try { corrName = JSON.parse(corrRaw).name || ''; } catch (_) {} }

      const cfgRaw = await env.NAFAF_KV.get('config');
      const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
      const ttlMin = Math.max(1, Math.min(60, parseInt(cfg.reportTTL, 10) || 30));
      const autoSolo = !!cfg.autoPublishSolo;

      const item = {
        id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        vid, kind,
        photo: (typeof b.photo === 'string' && b.photo.indexOf('data:image/') === 0
                && b.photo.length < 700000) ? b.photo : null,
        wilaya: String(b.wilaya || '').slice(0, 40),
        lat: (typeof b.lat === 'number') ? Math.round(b.lat * 1000) / 1000 : null,
        lon: (typeof b.lon === 'number') ? Math.round(b.lon * 1000) / 1000 : null,
        note: String(b.note || '').slice(0, 200),
        isCorr, corrName,
        ts: Date.now(),
        expires: Date.now() + ttlMin * 60000,
        /* ★ كل رصد ينتظر الموافقة — بما فيه المراسل */
        status: (autoSolo && !isCorr) ? 'approved' : 'pending'
      };

      await env.NAFAF_KV.put('rep:' + item.id, JSON.stringify(item),
        { expirationTtl: 60 * 60 * 24 * 3 });

      return json({ ok: true, status: item.status, isCorr });
    }

    /* الرصدات المعروضة — مفتوحة للتطبيق */
    if (url.pathname === '/reports') {
      const cfgRaw = await env.NAFAF_KV.get('config');
      const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
      const consensusMin = Math.max(30, Math.min(60, parseInt(cfg.consensusWindow, 10) || 60));
      const now = Date.now();

      const list = await env.NAFAF_KV.list({ prefix: 'rep:' });
      const live = [];
      for (const k of list.keys) {
        try {
          const r = JSON.parse(await env.NAFAF_KV.get(k.name));
          if (!r || r.expires < now) continue;
          live.push(r);
        } catch (_) {}
      }

      /* ★ رصد المراسلين المعتمدين — تبويب منفصل */
      const corr = live.filter(r => r.isCorr && r.status === 'approved')
        .sort((a, b2) => b2.ts - a.ts)
        .map(r => ({ kind: r.kind, wilaya: r.wilaya, note: r.note,
                     name: r.corrName, ts: r.ts, photo: r.photo || null }));

      /* ★ الإجماع التلقائي — ٣ أشخاص فأكثر بنفس الولاية والحالة */
      const groups = {};
      for (const r of live) {
        if (now - r.ts > consensusMin * 60000) continue;
        const key = (r.wilaya || '?') + '|' + r.kind;
        if (!groups[key]) groups[key] = new Set();
        groups[key].add(r.vid);
      }
      const consensus = [];
      for (const key in groups) {
        if (groups[key].size >= 3) {
          const [wilaya, kind] = key.split('|');
          consensus.push({ wilaya, kind, count: groups[key].size });
        }
      }
      consensus.sort((a, b2) => b2.count - a.count);

      /* الرصد الفردي المعتمد يدويًا */
      const solo = live.filter(r => !r.isCorr && r.status === 'approved')
        .sort((a, b2) => b2.ts - a.ts)
        .map(r => ({ kind: r.kind, wilaya: r.wilaya, note: r.note, ts: r.ts, photo: r.photo || null }));

      return json({ ok: true, corr, consensus, solo });
    }

    /* قائمة الرصدات للمراجعة — محمية */
    if (url.pathname === '/admin/reports' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const now = Date.now();
      const list = await env.NAFAF_KV.list({ prefix: 'rep:' });
      const out = [];
      for (const k of list.keys) {
        try {
          const r = JSON.parse(await env.NAFAF_KV.get(k.name));
          if (!r) continue;
          out.push(Object.assign({}, r, { expired: r.expires < now }));
        } catch (_) {}
      }
      out.sort((a, b2) => b2.ts - a.ts);
      return json({ ok: true, reports: out.slice(0, 60) });
    }

    /* قرار على رصد — محمية */
    if (url.pathname === '/admin/report/decide' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.id) return json({ error: 'no id' }, 400);
      const key = 'rep:' + String(b.id).slice(0, 40);
      const raw = await env.NAFAF_KV.get(key);
      if (!raw) return json({ error: 'not found' }, 404);
      const r = JSON.parse(raw);
      if (b.decision === 'approve') {
        r.status = 'approved';
        /* ★ الصلاحية تبدأ من لحظة الموافقة لا لحظة الرصد
           وإلا انتهى الرصد قبل أن تراجعه */
        const cfgRaw2 = await env.NAFAF_KV.get('config');
        const cfg2 = cfgRaw2 ? JSON.parse(cfgRaw2) : {};
        const ttl2 = Math.max(1, Math.min(60, parseInt(cfg2.reportTTL, 10) || 30));
        r.approvedAt = Date.now();
        r.expires = Date.now() + ttl2 * 60000;
        await env.NAFAF_KV.put(key, JSON.stringify(r), { expirationTtl: 60 * 60 * 24 * 3 });
        return json({ ok: true, status: 'approved', expires: r.expires });
      }
      await env.NAFAF_KV.delete(key);
      return json({ ok: true, status: 'rejected' });
    }


    /* ============================================================
       ★ تسجيل الدخول بجوجل — يتحقق الخادم من صحة الرمز
       ⚠️ لا نثق برمز يرسله التطبيق: نتحقق منه عند جوجل مباشرة
       ============================================================ */
    if (url.pathname === '/auth/google' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !b.credential || !b.vid) return json({ error: 'bad request' }, 400);

      /* تحقّق من الرمز عند جوجل */
      let info = null, vstatus = 0, verr = '';
      try {
        const vr = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' +
          encodeURIComponent(b.credential));
        vstatus = vr.status;
        const txt = await vr.text();
        try { info = JSON.parse(txt); } catch (_) { verr = txt.slice(0, 80); }
      } catch (e) { verr = String(e && e.message || e).slice(0, 80); }

      if (!info || !info.email) {
        /* ★ نُرجع التفاصيل ليظهر السبب في التطبيق بدل رسالة عامة */
        return json({ error: 'invalid token', gStatus: vstatus,
          gError: (info && (info.error_description || info.error)) || verr || 'no email' }, 401);
      }
      /* تأكّد أن الرمز صادر لتطبيقنا */
      if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID) {
        return json({ error: 'wrong audience',
          expected: String(env.GOOGLE_CLIENT_ID).slice(0, 20) + '…',
          got: String(info.aud || '').slice(0, 20) + '…' }, 401);
      }
      if (info.email_verified === 'false') return json({ error: 'email unverified' }, 401);

      const vid = String(b.vid).slice(0, 40);
      const email = String(info.email).toLowerCase().slice(0, 80);

      /* ★ حساب واحد لكل بريد: لو سجّل من جهاز آخر ننقل الحساب */
      const prevVid = await env.NAFAF_KV.get('email:' + email);
      if (prevVid && prevVid !== vid) {
        const oldCorr = await env.NAFAF_KV.get('corr:' + prevVid);
        if (oldCorr) {
          await env.NAFAF_KV.put('corr:' + vid, oldCorr);
          await env.NAFAF_KV.delete('corr:' + prevVid);
        }
      }
      await env.NAFAF_KV.put('email:' + email, vid);

      /* احفظ هوية المستخدم */
      await env.NAFAF_KV.put('user:' + vid, JSON.stringify({
        email, name: info.name || '', picture: info.picture || '', ts: Date.now()
      }), { expirationTtl: 60 * 60 * 24 * 365 });

      /* هل هو مراسل معتمد؟ */
      const corrRaw = await env.NAFAF_KV.get('corr:' + vid);
      let corr = null;
      if (corrRaw) { try { corr = JSON.parse(corrRaw); } catch (_) {} }

      /* هل عنده طلب معلّق؟ */
      const pend = await env.NAFAF_KV.get('capp:' + vid);

      return json({
        ok: true,
        email, name: info.name || '',
        status: corr ? 'approved' : (pend ? 'pending' : 'none'),
        corrName: corr ? (corr.name || '') : ''
      });
    }

    /* تسجيل الخروج */
    /* ============================================================
       ★ حذف الحساب والبيانات — شرط إلزامي في Google Play
       ⚠️ لا يكفي تجميد الحساب: يجب حذف كل البيانات المرتبطة به.
       ============================================================ */
    if (url.pathname === '/account/delete' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      const vid = b && b.vid;
      if (!vid) return json({ error: 'no vid' }, 400);

      let removed = 0;
      /* ١ · الحساب والهوية */
      for (const k of ['auth:' + vid, 'corr:' + vid, 'sub:' + vid,
                       'vis:' + vid, 'streak:' + vid, 'fbq:' + vid]) {
        try { await env.NAFAF_KV.delete(k); removed++; } catch (_) {}
      }
      /* ٢ · رصداته وصوره */
      try {
        const list = await env.NAFAF_KV.list({ prefix: 'rep:' });
        for (const k of list.keys) {
          try {
            const r = JSON.parse(await env.NAFAF_KV.get(k.name));
            if (r && r.vid === vid) { await env.NAFAF_KV.delete(k.name); removed++; }
          } catch (_) {}
        }
      } catch (_) {}
      /* ٣ · صوره في المعرض */
      try {
        const gl = await env.NAFAF_KV.list({ prefix: 'gal:' });
        for (const k of gl.keys) {
          try {
            const g = JSON.parse(await env.NAFAF_KV.get(k.name));
            if (g && g.vid === vid) { await env.NAFAF_KV.delete(k.name); removed++; }
          } catch (_) {}
        }
      } catch (_) {}
      /* ٤ · ملاحظاته */
      try {
        const fb = await env.NAFAF_KV.list({ prefix: 'fb:' });
        for (const k of fb.keys) {
          try {
            const f = JSON.parse(await env.NAFAF_KV.get(k.name));
            if (f && f.vid === vid) { await env.NAFAF_KV.delete(k.name); removed++; }
          } catch (_) {}
        }
      } catch (_) {}

      return json({ ok: true, deleted: removed,
        note: 'كل البيانات المرتبطة بهذا الحساب حُذفت نهائيًا.' });
    }

    /* ============================================================
       ★ حالة اشتراك المستخدم
       ⚠️ لا تمنح أي ميزة إن كان النظام معطّلًا — الكل «بلس» فعليًا
          حتى تُفعّل billing.enabled من البوابة.
       ============================================================ */
    if (url.pathname === '/billing/status') {
      const vid = url.searchParams.get('vid') || '';
      /* اقرأ الإعداد الحيّ مباشرة من KV */
      let cfg = null;
      try { cfg = JSON.parse(await env.NAFAF_KV.get('cfg:live') || 'null'); } catch (_) {}
      if (!cfg) cfg = defaultCfg();
      const bl = (cfg && cfg.billing) || {};

      /* النظام معطّل → الجميع بلا حدود */
      if (!bl.enabled) {
        return json({ ok: true, active: false, tier: 'open',
          limits: null, donateOn: !!bl.donateOn, donateUrl: bl.donateUrl || '' });
      }
      let sub = null;
      if (vid) {
        try { sub = JSON.parse(await env.NAFAF_KV.get('sub_plus:' + vid) || 'null'); } catch (_) {}
      }
      const now = Date.now();
      const active = !!(sub && sub.until && sub.until > now);
      return json({ ok: true, active, tier: active ? 'plus' : 'free',
        until: active ? sub.until : null,
        limits: active ? bl.plusLimits : bl.freeLimits,
        priceYear: bl.priceYear, currency: bl.currency,
        donateOn: !!bl.donateOn, donateUrl: bl.donateUrl || '' });
    }

    /* ★ منح اشتراك يدويًا — من البوابة فقط
       (للتجارب ولمن يدفع بتحويل مباشر قبل ربط بوابة دفع) */
    if (url.pathname === '/admin/billing/grant' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.vid) return json({ error: 'no vid' }, 400);
      const months = Math.max(1, Math.min(36, parseInt(b.months || 12, 10)));
      const until = Date.now() + months * 30 * 24 * 3600 * 1000;
      await env.NAFAF_KV.put('sub_plus:' + b.vid,
        JSON.stringify({ until, months, granted: Date.now(), by: 'admin', note: b.note || '' }));
      return json({ ok: true, vid: b.vid, until, months });
    }

    /* ★ سحب اشتراك */
    if (url.pathname === '/admin/billing/revoke' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.vid) return json({ error: 'no vid' }, 400);
      await env.NAFAF_KV.delete('sub_plus:' + b.vid);
      return json({ ok: true, revoked: b.vid });
    }

    /* ★ قائمة المشتركين */
    if (url.pathname === '/admin/billing/list') {
      const p = url.searchParams.get('pass');
      if (!(await checkPass(env, p))) return json({ error: 'unauthorized' }, 401);
      const list = await env.NAFAF_KV.list({ prefix: 'sub_plus:' });
      const out = [];
      const now = Date.now();
      for (const k of list.keys) {
        try {
          const v = JSON.parse(await env.NAFAF_KV.get(k.name));
          if (!v) continue;
          out.push({ vid: k.name.slice(9), until: v.until,
            active: v.until > now, months: v.months, note: v.note || '' });
        } catch (_) {}
      }
      out.sort((a, b2) => b2.until - a.until);
      return json({ ok: true, subs: out, total: out.length,
        active: out.filter(x => x.active).length });
    }

    /* ★ استقبال بلاغات المحتوى — امتثال لسياسة UGC في Google Play */
    if (url.pathname === '/report-abuse' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !b.id) return json({ error: 'bad request' }, 400);
      const key = 'abuse:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
      await env.NAFAF_KV.put(key, JSON.stringify({
        contentId: String(b.id).slice(0, 120),
        reason: String(b.reason || '').slice(0, 200),
        vid: String(b.vid || '').slice(0, 60),
        ts: b.ts || Date.now(),
        status: 'pending'
      }), { expirationTtl: 60 * 60 * 24 * 90 });
      return json({ ok: true, received: true });
    }

    /* ★ قائمة البلاغات — للبوابة */
    if (url.pathname === '/admin/abuse/list') {
      const p = url.searchParams.get('pass');
      if (!(await checkPass(env, p))) return json({ error: 'unauthorized' }, 401);
      const list = await env.NAFAF_KV.list({ prefix: 'abuse:' });
      const out = [];
      for (const k of list.keys) {
        try {
          const v = JSON.parse(await env.NAFAF_KV.get(k.name));
          if (v) out.push({ key: k.name, ...v });
        } catch (_) {}
      }
      out.sort((a, b2) => b2.ts - a.ts);
      return json({ ok: true, reports: out, pending: out.filter(x => x.status === 'pending').length });
    }

    /* ★ إغلاق بلاغ */
    if (url.pathname === '/admin/abuse/resolve' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.key) return json({ error: 'no key' }, 400);
      await env.NAFAF_KV.delete(b.key);
      return json({ ok: true });
    }

    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (b && b.vid) await env.NAFAF_KV.delete('user:' + String(b.vid).slice(0, 40));
      return json({ ok: true });
    }

    /* معرّف عميل جوجل — يقرأه التطبيق */
    if (url.pathname === '/auth/config') {
      return json({ clientId: env.GOOGLE_CLIENT_ID || '' });
    }


    /* ★ معرض الصور — الصور المعتمدة فقط */
    if (url.pathname === '/gallery') {
      /* ★ المعرض يتغيّر نادرًا — تخزين مؤقت يقلّل القراءات كثيرًا */
      const list = await env.NAFAF_KV.list({ prefix: 'gal:' });
      const out = [];
      for (const k of list.keys) {
        try {
          const g = JSON.parse(await env.NAFAF_KV.get(k.name));
          if (g && g.photo) out.push(g);
        } catch (_) {}
      }
      out.sort((a, b2) => b2.ts - a.ts);
      return json({ ok: true, photos: out.slice(0, 40) });
    }

    /* اعتماد صورة للمعرض — محمية */
    if (url.pathname === '/admin/gallery/add' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.id) return json({ error: 'no id' }, 400);
      const raw = await env.NAFAF_KV.get('rep:' + String(b.id).slice(0, 40));
      if (!raw) return json({ error: 'not found' }, 404);
      const r = JSON.parse(raw);
      if (!r.photo) return json({ error: 'no photo' }, 400);
      await env.NAFAF_KV.put('gal:' + r.id, JSON.stringify({
        id: r.id, photo: r.photo, wilaya: r.wilaya,
        name: r.corrName || '', kind: r.kind, ts: r.ts
      }), { expirationTtl: 60 * 60 * 24 * 90 });
      return json({ ok: true });
    }

    /* حذف صورة من المعرض — محمية */
    if (url.pathname === '/admin/gallery/remove' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (b.id) await env.NAFAF_KV.delete('gal:' + String(b.id).slice(0, 40));
      return json({ ok: true });
    }


    /* ★ استقبال ملاحظات المستخدمين */
    if (url.pathname === '/feedback' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !b.text) return json({ error: 'no text' }, 400);
      const vid = String(b.vid || 'anon').slice(0, 40);

      /* حد معقول: ٣ ملاحظات لكل جهاز يوميًا */
      const day = new Date().toISOString().slice(0, 10);
      const ck = 'fblim:' + day + ':' + vid;
      const n = parseInt(await env.NAFAF_KV.get(ck) || '0', 10);
      if (n >= 3) return json({ error: 'too many' }, 429);
      await env.NAFAF_KV.put(ck, String(n + 1), { expirationTtl: 60 * 60 * 30 });

      const id = 'fb:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await env.NAFAF_KV.put(id, JSON.stringify({
        id: id.slice(3),
        kind: ['idea','bug','complaint','other'].indexOf(b.kind) >= 0 ? b.kind : 'other',
        text: String(b.text).slice(0, 600),
        contact: String(b.contact || '').slice(0, 80),
        lang: String(b.lang || '').slice(0, 10),
        vid, ts: Date.now(), read: false
      }), { expirationTtl: 60 * 60 * 24 * 180 });
      return json({ ok: true });
    }

    /* قائمة الملاحظات — محمية */
    if (url.pathname === '/admin/feedback' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const list = await env.NAFAF_KV.list({ prefix: 'fb:' });
      const out = [];
      for (const k of list.keys) {
        try { const f = JSON.parse(await env.NAFAF_KV.get(k.name)); if (f) out.push(f); } catch (_) {}
      }
      out.sort((a, b2) => b2.ts - a.ts);
      return json({ ok: true, items: out.slice(0, 60), unread: out.filter(x => !x.read).length });
    }

    /* تعليم مقروءة أو حذف — محمية */
    if (url.pathname === '/admin/feedback/act' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.id) return json({ error: 'no id' }, 400);
      const key = 'fb:' + String(b.id).slice(0, 40);
      if (b.act === 'delete') { await env.NAFAF_KV.delete(key); return json({ ok: true }); }
      const raw = await env.NAFAF_KV.get(key);
      if (!raw) return json({ error: 'not found' }, 404);
      const f = JSON.parse(raw);
      f.read = true;
      await env.NAFAF_KV.put(key, JSON.stringify(f), { expirationTtl: 60 * 60 * 24 * 180 });
      return json({ ok: true });
    }


    /* ============================================================
       ★ محرك الإعدادات — مسودة · معاينة · نشر · تراجع
       ⚠️ الفلسفة: البوابة لا تعدّل الكود بل تكتب إعدادات،
          والتطبيق يقرؤها فيتغيّر — بلا لمس index.html إطلاقًا.
       ⚠️ لا تغيير يصل المستخدمين قبل الضغط على «نشر».
       ============================================================ */

    /* الإعداد المنشور — يقرؤه التطبيق */
    /* ★★★ الإعداد الحيّ — مخزّن مؤقتًا ٦٠ ثانية ★★★
       ⚠️ كل مستخدم يقرؤه عند الفتح — ومع النمو يستنزف حد القراءات.
          التخزين المؤقت يجعل ألف مستخدم = قراءة واحدة كل دقيقة. */
    if (url.pathname === '/cfg/live') {
      const raw = await env.NAFAF_KV.get('cfg:live', { cacheTtl: 60 });
      return new Response(JSON.stringify(mergeNav(raw ? JSON.parse(raw) : defaultCfg())), {
        headers: { 'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60' }
      });
    }

    /* المسودة — للبوابة والمعاينة */
    if (url.pathname === '/cfg/draft' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const raw = await env.NAFAF_KV.get('cfg:draft');
      const live = await env.NAFAF_KV.get('cfg:live');
      return json({
        ok: true,
        draft: mergeNav(raw ? JSON.parse(raw) : (live ? JSON.parse(live) : defaultCfg())),
        hasChanges: !!raw
      });
    }

    /* حفظ مسودة — لا يصل المستخدمين */
    if (url.pathname === '/cfg/draft/save' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.cfg) return json({ error: 'no cfg' }, 400);
      await env.NAFAF_KV.put('cfg:draft', JSON.stringify(b.cfg));
      return json({ ok: true });
    }

    /* ★ النشر — مع حفظ نسخة للتراجع */
    if (url.pathname === '/cfg/publish' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const draftRaw = await env.NAFAF_KV.get('cfg:draft');
      if (!draftRaw) return json({ error: 'no draft' }, 400);

      /* احفظ الحالي في السجل قبل استبداله */
      const cur = await env.NAFAF_KV.get('cfg:live');
      if (cur) {
        const vid = 'v' + Date.now();
        await env.NAFAF_KV.put('cfgv:' + vid, cur, { expirationTtl: 60 * 60 * 24 * 90 });
        const idxRaw = await env.NAFAF_KV.get('cfg:versions');
        const idx = idxRaw ? JSON.parse(idxRaw) : [];
        idx.unshift({ id: vid, ts: Date.now(), note: String(b.note || '').slice(0, 120) });
        await env.NAFAF_KV.put('cfg:versions', JSON.stringify(idx.slice(0, 30)));
      }
      await env.NAFAF_KV.put('cfg:live', draftRaw);
      await env.NAFAF_KV.delete('cfg:draft');
      return json({ ok: true, publishedAt: Date.now() });
    }

    /* تجاهل المسودة */
    if (url.pathname === '/cfg/discard' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      await env.NAFAF_KV.delete('cfg:draft');
      return json({ ok: true });
    }

    /* سجل الإصدارات */
    if (url.pathname === '/cfg/versions' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const raw = await env.NAFAF_KV.get('cfg:versions');
      return json({ ok: true, versions: raw ? JSON.parse(raw) : [] });
    }

    /* ★ التراجع لإصدار سابق */
    if (url.pathname === '/cfg/rollback' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.id) return json({ error: 'no id' }, 400);
      const old = await env.NAFAF_KV.get('cfgv:' + String(b.id).slice(0, 40));
      if (!old) return json({ error: 'not found' }, 404);
      /* احفظ الحالي أيضًا قبل التراجع */
      const cur = await env.NAFAF_KV.get('cfg:live');
      if (cur) {
        const vid = 'v' + Date.now();
        await env.NAFAF_KV.put('cfgv:' + vid, cur, { expirationTtl: 60 * 60 * 24 * 90 });
        const idxRaw = await env.NAFAF_KV.get('cfg:versions');
        const idx = idxRaw ? JSON.parse(idxRaw) : [];
        idx.unshift({ id: vid, ts: Date.now(), note: 'قبل التراجع' });
        await env.NAFAF_KV.put('cfg:versions', JSON.stringify(idx.slice(0, 30)));
      }
      await env.NAFAF_KV.put('cfg:live', old);
      await env.NAFAF_KV.delete('cfg:draft');
      return json({ ok: true });
    }


    /* ★ إعدادات التنبيهات — للبوابة */
    if (url.pathname === '/admin/alerts' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      return json({ ok: true, cfg: await getAlertCfg(env) });
    }
    if (url.pathname === '/admin/alerts/save' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.cfg) return json({ error: 'no cfg' }, 400);
      await env.NAFAF_KV.put('alerts', JSON.stringify(b.cfg));
      return json({ ok: true });
    }
    /* ★ تنبيه يدوي فوري لكل المشتركين */
    if (url.pathname === '/admin/alerts/send' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      if (!b.title) return json({ error: 'no title' }, 400);
      const list = await env.NAFAF_KV.list({ prefix: 'sub:' });
      let sent = 0;
      for (const k of list.keys) {
        try {
          const sub = JSON.parse(await env.NAFAF_KV.get(k.name));
          if (!sub || !sub.endpoint) continue;
          await sendPush(env, sub, {
            title: String(b.title).slice(0, 80),
            body: String(b.body || '').slice(0, 200),
            tag: 'nafaf-manual'
          });
          sent++;
        } catch (_) {}
      }
      return json({ ok: true, sent });
    }
    /* ★ إحصاء التنبيهات */
    if (url.pathname === '/admin/alerts/stats' && request.method === 'POST') {
      const b = await request.json();
      if (!b || !(await checkPass(env, b.pass))) return json({ error: 'unauthorized' }, 401);
      const subs = await env.NAFAF_KV.list({ prefix: 'sub:' });
      let withLoc = 0;
      for (const k of subs.keys) {
        try { const x = JSON.parse(await env.NAFAF_KV.get(k.name));
          if (x && x.lat != null) withLoc++; } catch (_) {}
      }
      const day = new Date().toISOString().slice(0, 10);
      const caps = await env.NAFAF_KV.list({ prefix: 'acap:' + day + ':' });
      let todaySent = 0;
      for (const k of caps.keys) {
        try { const x = JSON.parse(await env.NAFAF_KV.get(k.name));
          todaySent += (x.total || 0); } catch (_) {}
      }
      return json({ ok: true, subscribers: subs.keys.length, withLocation: withLoc,
        sentToday: todaySent, activeUsers: caps.keys.length });
    }

    /* الحالة الحالية — للتطبيق */
    if (url.pathname === '/state') {
      const raw = await env.NAFAF_KV.get('state');
      return json(raw ? JSON.parse(raw) : { n: 0 });
    }

    /* ★ فحص الإشعارات من داخل التطبيق: هل الخادم يعرف هذا الجهاز؟ ومتى آخر دورة فحص؟ */
    if (url.pathname === '/push/check' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !b.endpoint) return json({ error: 'bad request' }, 400);
      const raw = await env.NAFAF_KV.get('sub:' + btoa(b.endpoint).slice(-40));
      const rec = raw ? JSON.parse(raw) : null;
      const st = await env.NAFAF_KV.get('state');
      const s0 = st ? JSON.parse(st) : null;
      return json({
        known: !!rec, hasLoc: !!(rec && typeof rec.lat === 'number'), place: rec ? (rec.place || '') : '',
        savedAt: rec ? rec.ts : null, lastScan: s0 ? s0.ts : null, vapid: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
      });
    }
    /* ★ إشعار تجريبي لهذا الجهاز فقط — مرة كل دقيقة كحد أقصى */
    if (url.pathname === '/push/test' && request.method === 'POST') {
      const b = await request.json().catch(() => null);
      if (!b || !b.endpoint) return json({ error: 'bad request' }, 400);
      const id = btoa(b.endpoint).slice(-40);
      const raw = await env.NAFAF_KV.get('sub:' + id);
      if (!raw) return json({ ok: false, why: 'unknown' }, 404);
      if (await env.NAFAF_KV.get('pt:' + id)) return json({ ok: false, why: 'wait' }, 429);
      await env.NAFAF_KV.put('pt:' + id, '1', { expirationTtl: 60 });
      const en = b.lang === 'en', sx = JSON.parse(raw), XT = XL[b.xl || sx.xl];
      const status = await sendPushStatus(env, sx, {
        title: XT ? XT.test[0] : (en ? 'Nafaf test alert' : 'تجربة تنبيه نفاف'),
        body: XT ? XT.test[1] : (en ? 'If you can read this, rain alerts will reach you even when Nafaf is closed.' : 'إذا وصلك هذا، يوصلك تنبيه المطر حتى ونفاف مسكّر.'),
        tag: 'nafaf-test', type: 'test', sev: 'notice', lang: en ? 'en' : 'ar', ts: Date.now()
      });
      return json({ ok: status >= 200 && status < 300, status });
    }

    /* المفتاح العام لتسجيل الاشتراك */
    if (url.pathname === '/vapid') {
      return json({ key: env.VAPID_PUBLIC_KEY || '' });
    }

    return json({ name: 'nafaf-push', ok: true });
  }
};

/* ★ الإعداد الافتراضي — بنية التطبيق كما يقرؤها */
/* ============================================================
   ★★★ محرك التنبيهات الشامل — كل تغيّر يستحق يصل للمستخدم
   ⚠️ مبدأ: التنبيه المفيد يبني الثقة · والمزعج يُفقد المستخدم.
      لذا كل نوع له مفتاح وحدّ أدنى وسقف يومي — يتحكم بها المشغّل.
   ⚠️ الاشتراك يحمل موقع المستخدم فنرسل ما يخصّه هو لا الجميع.
   ============================================================ */

/* الإعداد الافتراضي — تعدّله البوابة */
function defaultAlerts() {
  return {
    enabled: true,
    dailyCap: 6,              /* أقصى تنبيهات لكل مستخدم يوميًا */
    quietStart: 23,           /* ساعة بدء الصمت (بتوقيت المستخدم) */
    quietEnd: 6,
    ringKm: 22,               /* مسافة مسح «مطر حولك» */
    types: {
      rainStart:   { on: true,  min: 0.2,  cap: 3, label: 'بدء المطر' },
      rainHeavy:   { on: true,  min: 8,    cap: 2, label: 'مطر غزير' },
      rainStop:    { on: true,  min: 0,    cap: 1, label: 'انحسار المطر' },
      thunder:     { on: true,  min: 0,    cap: 2, label: 'نشاط رعدي' },
      windSurge:   { on: true,  min: 45,   cap: 2, label: 'اشتداد الرياح' },
      dustRise:    { on: true,  min: 0,    cap: 2, label: 'موجة غبار' },
      heatSpike:   { on: true,  min: 45,   cap: 1, label: 'ذروة حر' },
      coldDrop:    { on: true,  min: 8,    cap: 1, label: 'هبوط حراري' },
      pressureFall:{ on: false, min: 6,    cap: 1, label: 'هبوط الضغط' },
      firstRain:   { on: true,  min: 0,    cap: 1, label: 'أول مطر بعد جفاف' },
      nearbyRain:  { on: true,  min: 60,   cap: 2, label: 'احتمال مطر خلال ٦ ساعات' },
      rainSoon:    { on: true,  min: 0.2,  cap: 3, label: 'المطر جاي (خلال ساعة)' },
      rainNear:    { on: true,  min: 0.3,  cap: 2, label: 'مطر حولك (٢٢ كم)' },
      widget:      { on: true,  min: 0,    cap: 24, label: 'تحديث الودجت والتطبيق مغلق' },
      quake:       { on: false, min: 4.5,  cap: 1, label: 'زلزال بالمنطقة' },
      streak:      { on: true,  min: 3,    cap: 1, label: 'حارس السلسلة' }
    }
  };
}

async function getAlertCfg(env) {
  try {
    const raw = await env.NAFAF_KV.get('alerts');
    const d = defaultAlerts();
    if (!raw) return d;
    const c = JSON.parse(raw);
    return Object.assign(d, c, { types: Object.assign(d.types, c.types || {}) });
  } catch (_) { return defaultAlerts(); }
}

/* هل تجاوز المستخدم سقفه اليومي؟ */
async function underCap(env, endpoint, type, cfg) {
  const day = new Date().toISOString().slice(0, 10);
  const key = 'acap:' + day + ':' + hashStr(endpoint);
  const raw = await env.NAFAF_KV.get(key);
  const rec = raw ? JSON.parse(raw) : { total: 0, byType: {} };
  const t = cfg.types[type] || { cap: 2 };
  if (rec.total >= (cfg.dailyCap || 6)) return false;
  if ((rec.byType[type] || 0) >= (t.cap || 2)) return false;
  return true;
}
async function bumpCap(env, endpoint, type) {
  const day = new Date().toISOString().slice(0, 10);
  const key = 'acap:' + day + ':' + hashStr(endpoint);
  const raw = await env.NAFAF_KV.get(key);
  const rec = raw ? JSON.parse(raw) : { total: 0, byType: {} };
  rec.total = (rec.total || 0) + 1;
  rec.byType[type] = (rec.byType[type] || 0) + 1;
  await env.NAFAF_KV.put(key, JSON.stringify(rec), { expirationTtl: 60 * 60 * 30 });
}
function hashStr(x) {
  let h = 0; const s = String(x);
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36);
}

/* ساعة المستخدم المحلية من إزاحته المحفوظة */
function userHour(sub) {
  const off = (sub && typeof sub.tz === 'number') ? sub.tz : 4 * 3600;
  const d = new Date(Date.now() + off * 1000);
  return d.getUTCHours();
}
function inQuiet(sub, cfg) {
  const h = userHour(sub);
  const a = cfg.quietStart, b = cfg.quietEnd;
  if (a === b) return false;
  return (a < b) ? (h >= a && h < b) : (h >= a || h < b);
}

/* ★★★ v2 (نوفمبر 2026): محرك التنبيهات بالخلايا
   ── ما الذي تغيّر عن v1 ولماذا ──
   • المشتركون يُجمَعون في خلايا 0.1° (≈ ١١ كم، وهي نفس دقة الإحداثيات المخزنة أصلًا):
     طلب Open-Meteo واحد لكل ٤٠ خلية بدل طلب لكل مستخدم.
   • حالة الطقس تُحفظ في مفتاح KV واحد (wx:cells) بدل مفتاح لكل مستخدم:
     كتابة واحدة في كل دورة بدل كتابة لكل مشترك (حدّ الكتابة المجاني في KV صغير).
   • «المطر جاي»: دقائق Open-Meteo (كل ١٥ دقيقة) للساعتين القادمتين ← تنبيه قبل بدء المطر.
   • «مطر حولك»: مسح ٨ نقاط على بعد ٢٢ كم حول الخلية، فقط حين يكون احتمال المطر ≥ ٣٠٪ خلال ٣ ساعات،
     ومرة كل ٣٠ دقيقة كحد أقصى لكل خلية (حتى لا نستهلك حصة الطلبات).
   • تحديث الودجت والتطبيق مغلق: إشعار صامت بنفس الوسم كل ساعة تقريبًا لمن فعّل الودجت.
   • الحمولة تحمل sev (info | notice | alert) وurl، وعامل الخدمة يحوّلها إلى اهتزاز وزر «الرادار».
   ⚠️ القاعدة باقية: وصف ورصد، لا تحذيرات سلامة. */
const CELL_BATCH = 40, RING_KM = 22, RING_MAX = 6;
const DIRS = { dial: ['الشمال', 'الشمال الشرقي', 'الشرق', 'الجنوب الشرقي', 'الجنوب', 'الجنوب الغربي', 'الغرب', 'الشمال الغربي'],
  en: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] };
const WXN = { 0: ['صحو', 'Clear'], 1: ['صحو غالبًا', 'Mostly clear'], 2: ['غيم جزئي', 'Partly cloudy'], 3: ['غيم', 'Overcast'], 45: ['ضباب', 'Fog'], 48: ['ضباب', 'Fog'],
  51: ['رذاذ', 'Drizzle'], 53: ['رذاذ', 'Drizzle'], 55: ['رذاذ', 'Drizzle'], 61: ['مطر خفيف', 'Light rain'], 63: ['مطر', 'Rain'], 65: ['مطر غزير', 'Heavy rain'],
  80: ['زخات', 'Showers'], 81: ['زخات', 'Showers'], 82: ['زخات قوية', 'Heavy showers'], 95: ['رعد', 'Thunderstorm'], 96: ['رعد وبَرَد', 'Thunder & hail'], 99: ['رعد وبَرَد', 'Thunder & hail'] };
const isEn = sub => sub && sub.lang === 'en';
const L2 = (sub, ar, en) => isEn(sub) ? en : ar;
const wxName = (sub, c) => { const k = WXN[c] || WXN[3]; return isEn(sub) ? k[1] : k[0]; };
function hashNum(x) { return parseInt(hashStr(x), 36) || 0; }
function destPt(lat, lon, brg, km) {
  const R = 6371, d = km / R, p1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180, t = brg * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [+(p2 * 180 / Math.PI).toFixed(3), +(l2 * 180 / Math.PI).toFixed(3)];
}

/* خلايا الطقس: الحالي + دقائق الساعتين القادمتين + احتمال ٦ ساعات (٩ متغيرات، يوم واحد) */
async function fetchCells(cells, minMM) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + cells.map(c => c.lat).join(',') + '&longitude=' + cells.map(c => c.lon).join(',') +
    '&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,wind_gusts_10m,pressure_msl' +
    '&minutely_15=precipitation&forecast_minutely_15=8&hourly=precipitation_probability&forecast_hours=6&timezone=auto';
  const r = await fetch(url); if (!r.ok) return [];
  const j = await r.json(), arr = Array.isArray(j) ? j : [j];
  return arr.map(d => {
    if (!d || !d.current) return null;
    const c = d.current, m = (d.minutely_15 && d.minutely_15.precipitation) || [], pp = (d.hourly && d.hourly.precipitation_probability) || [];
    let soon = null; for (let i = 1; i < Math.min(5, m.length); i++) if ((m[i] || 0) >= minMM) { soon = i * 15; break; }
    let peak = 0, at = -1; for (let i = 0; i < Math.min(6, pp.length); i++) if ((pp[i] || 0) > peak) { peak = pp[i]; at = i; }
    return { mm: c.precipitation || 0, temp: c.temperature_2m, feels: c.apparent_temperature, wind: c.wind_speed_10m || 0, gust: c.wind_gusts_10m || 0,
      press: c.pressure_msl, code: c.weather_code, soon, pp3: Math.max(0, ...pp.slice(0, 4).map(x => x || 0)), peak,
      peakAt: at >= 0 && d.hourly.time ? String(d.hourly.time[at]).slice(11, 16) : '', ts: Date.now() };
  });
}
/* ٨ نقاط حول الخلية: أين المطر الآن، ومن أي جهة */
async function ringScan(lat, lon, minMM, km) {
  const pts = [0, 45, 90, 135, 180, 225, 270, 315].map(b => destPt(lat, lon, b, km || RING_KM));
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pts.map(p => p[0]).join(',') + '&longitude=' + pts.map(p => p[1]).join(',') +
    '&current=precipitation,weather_code&forecast_days=1&timezone=auto';
  const r = await fetch(url); if (!r.ok) return null;
  const j = await r.json(), arr = Array.isArray(j) ? j : [j];
  let best = null;
  arr.forEach((d, i) => { const c = d && d.current; if (!c) return; const mm = c.precipitation || 0, th = c.weather_code >= 95;
    if ((mm >= minMM || th) && (!best || mm > best.mm)) best = { dir: i, mm, th }; });
  return best;
}

function cellEvents(now, prev, cfg, sub) {
  const out = [], T = cfg.types, nm = sub.place || L2(sub, 'منطقتك', 'your area');
  const ev = (type, sev, title, body, rain) => out.push({ type, sev, title, body, tag: 'nafaf-' + type, url: rain ? './#live' : './', lang: isEn(sub) ? 'en' : 'ar', ts: Date.now() });
  if (T.rainStart.on && now.mm >= T.rainStart.min && (!prev || prev.mm < T.rainStart.min))
    ev('rainStart', 'alert', L2(sub, '🌧️ نزل المطر', '🌧️ Rain has started'), L2(sub, 'بدأ الهطول في ' + nm + ' — ' + now.mm.toFixed(1) + ' ملم.', 'Rain began in ' + nm + ' — ' + now.mm.toFixed(1) + ' mm.'), 1);
  if (T.rainHeavy.on && now.mm >= T.rainHeavy.min && (!prev || prev.mm < T.rainHeavy.min))
    ev('rainHeavy', 'alert', L2(sub, '🌧️ مطر غزير', '🌧️ Heavy rain'), L2(sub, nm + ' — ' + now.mm.toFixed(1) + ' ملم. وصف لا تحذير؛ راجع جهة الأرصاد في بلدك.', nm + ' — ' + now.mm.toFixed(1) + ' mm. A description, not a warning; check your national met service.'), 1);
  if (T.rainStop.on && prev && prev.mm >= 0.5 && now.mm < 0.1)
    ev('rainStop', 'info', L2(sub, '🌤️ وقف المطر', '🌤️ Rain has stopped'), L2(sub, 'انحسر الهطول عن ' + nm + '.', 'Rain has eased in ' + nm + '.'), 1);
  if (T.thunder.on && now.code >= 95 && (!prev || prev.code < 95))
    ev('thunder', 'alert', L2(sub, '⚡ نشاط رعدي', '⚡ Thunder'), L2(sub, 'رُصد نشاط رعدي قرب ' + nm + '.', 'Thunderstorm activity near ' + nm + '.'), 1);
  if (T.rainSoon && T.rainSoon.on && now.mm < 0.1 && now.soon != null && (!prev || prev.soon == null || prev.mm >= 0.1))
    ev('rainSoon', 'notice', L2(sub, '🌦️ المطر جاي', '🌦️ Rain on the way'), L2(sub, nm + ' — متوقع يبدأ خلال ' + now.soon + ' دقيقة تقريبًا.', nm + ' — expected to start in about ' + now.soon + ' minutes.'), 1);
  if (T.rainNear && T.rainNear.on && now.mm < 0.1 && now.ring && (!prev || !prev.ring)) {
    const d = (isEn(sub) ? DIRS.en : DIRS.dial)[now.ring.dir];
    ev('rainNear', 'notice', L2(sub, now.ring.th ? '⛈️ رعد حولك' : '🌧️ مطر حولك', now.ring.th ? '⛈️ Thunder nearby' : '🌧️ Rain nearby'),
      L2(sub, 'يمطر الحين على بعد ' + (now.ring.km || RING_KM) + ' كم تقريبًا جهة ' + d + ' من ' + nm + '.', 'Rain about ' + (now.ring.km || RING_KM) + ' km to the ' + d + ' of ' + nm + ' right now.'), 1);
  }
  const w = Math.max(now.wind, now.gust);
  if (T.windSurge.on && w >= T.windSurge.min && (!prev || Math.max(prev.wind, prev.gust || 0) < T.windSurge.min))
    ev('windSurge', 'notice', L2(sub, '💨 الرياح تشتد', '💨 Wind picking up'), nm + ' — ' + Math.round(w) + L2(sub, ' كم/س.', ' km/h.'));
  const dusty = c => c >= 6 && c <= 9;
  if (T.dustRise.on && dusty(now.code) && (!prev || !dusty(prev.code)))
    ev('dustRise', 'info', L2(sub, '🌫️ غبار بالجو', '🌫️ Dust in the air'), L2(sub, 'ارتفع الغبار في ' + nm + '.', 'Dust has risen in ' + nm + '.'));
  if (T.heatSpike.on && now.temp >= T.heatSpike.min && (!prev || prev.temp < T.heatSpike.min))
    ev('heatSpike', 'info', L2(sub, '🔥 حر شديد', '🔥 Intense heat'), nm + ' — ' + Math.round(now.temp) + '°.');
  if (T.coldDrop.on && prev && (prev.temp - now.temp) >= T.coldDrop.min)
    ev('coldDrop', 'info', L2(sub, '🌡️ هبوط حراري', '🌡️ Temperature drop'), nm + ' — ' + Math.round(prev.temp - now.temp) + '° → ' + Math.round(now.temp) + '°.');
  if (T.pressureFall.on && prev && prev.press && (prev.press - now.press) >= T.pressureFall.min)
    ev('pressureFall', 'info', L2(sub, '📉 الضغط ينزل', '📉 Pressure falling'), nm + ' — ' + Math.round(prev.press - now.press) + ' hPa.');
  if (T.nearbyRain.on && now.peak >= T.nearbyRain.min && (!prev || (prev.peak || 0) < T.nearbyRain.min) && now.mm < 0.1 && now.soon == null)
    ev('nearbyRain', 'info', L2(sub, '🌦️ احتمال مطر', '🌦️ Rain likely'), nm + ' — ' + L2(sub, 'احتمال ', 'chance ') + now.peak + '%' + (now.peakAt ? L2(sub, ' حدود ', ' around ') + now.peakAt : '') + '.', 1);
  return sub && XL[sub.xl] ? out.map(e => xlEvent(e, now, prev, sub)) : out;
}
/* ★ Nafaf is global: rain alerts in the phone's language (sub.xl, sent by the app) on top of Arabic/English.
   Each template: [title, body]; {nm} place · {mm} millimetres · {min} minutes · {km} distance · {dir} direction ·
   {w} wind km/h · {t} temperature · {d} drop · {hp} hPa · {p} percent · {at} " around HH:MM" or "". */
const XL = {
  fr: { dir: ['au nord', 'au nord-est', 'à l’est', 'au sud-est', 'au sud', 'au sud-ouest', 'à l’ouest', 'au nord-ouest'], area: 'votre zone',
    rainStart: ['🌧️ La pluie a commencé', 'Il pleut à {nm} — {mm} mm.'], rainHeavy: ['🌧️ Forte pluie', '{nm} — {mm} mm. Description, pas une alerte : consultez le service météo de votre pays.'],
    rainStop: ['🌤️ La pluie s’est arrêtée', 'La pluie a cessé à {nm}.'], thunder: ['⚡ Orage', 'Activité orageuse près de {nm}.'],
    rainSoon: ['🌦️ La pluie arrive', '{nm} — elle devrait commencer dans environ {min} minutes.'], rainNear: ['🌧️ Pluie tout près', 'Il pleut à environ {km} km {dir} de {nm}.'], thunderNear: ['⛈️ Orage tout près', 'Orage à environ {km} km {dir} de {nm}.'],
    windSurge: ['💨 Le vent se lève', '{nm} — {w} km/h.'], dustRise: ['🌫️ Poussière dans l’air', 'La poussière s’est levée à {nm}.'], heatSpike: ['🔥 Forte chaleur', '{nm} — {t}°.'],
    coldDrop: ['🌡️ Chute de température', '{nm} — {d}° → {t}°.'], pressureFall: ['📉 La pression baisse', '{nm} — {hp} hPa.'], nearbyRain: ['🌦️ Pluie probable', '{nm} — risque {p}%{at}.'], around: ' vers ',
    test: ['Alerte test Nafaf', 'Si vous lisez ceci, les alertes pluie vous parviendront même quand Nafaf est fermé.'] },
  de: { dir: ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'], area: 'deiner Gegend',
    rainStart: ['🌧️ Es regnet', 'Regen in {nm} — {mm} mm.'], rainHeavy: ['🌧️ Starkregen', '{nm} — {mm} mm. Beschreibung, keine Warnung: frag den Wetterdienst deines Landes.'],
    rainStop: ['🌤️ Der Regen hat aufgehört', 'Der Regen in {nm} hat nachgelassen.'], thunder: ['⚡ Gewitter', 'Gewitteraktivität bei {nm}.'],
    rainSoon: ['🌦️ Regen im Anmarsch', '{nm} — Beginn in etwa {min} Minuten erwartet.'], rainNear: ['🌧️ Regen in der Nähe', 'Regen etwa {km} km im {dir} von {nm}.'], thunderNear: ['⛈️ Gewitter in der Nähe', 'Gewitter etwa {km} km im {dir} von {nm}.'],
    windSurge: ['💨 Der Wind frischt auf', '{nm} — {w} km/h.'], dustRise: ['🌫️ Staub in der Luft', 'In {nm} ist Staub aufgezogen.'], heatSpike: ['🔥 Große Hitze', '{nm} — {t}°.'],
    coldDrop: ['🌡️ Temperatursturz', '{nm} — {d}° → {t}°.'], pressureFall: ['📉 Luftdruck fällt', '{nm} — {hp} hPa.'], nearbyRain: ['🌦️ Regen wahrscheinlich', '{nm} — Chance {p}%{at}.'], around: ' gegen ',
    test: ['Nafaf-Testwarnung', 'Wenn du das liest, erreichen dich Regenwarnungen auch bei geschlossenem Nafaf.'] },
  hi: { dir: ['उत्तर', 'उत्तर-पूर्व', 'पूर्व', 'दक्षिण-पूर्व', 'दक्षिण', 'दक्षिण-पश्चिम', 'पश्चिम', 'उत्तर-पश्चिम'], area: 'आपका इलाक़ा',
    rainStart: ['🌧️ बारिश शुरू', '{nm} में बारिश शुरू — {mm} मिमी।'], rainHeavy: ['🌧️ भारी बारिश', '{nm} — {mm} मिमी। यह विवरण है, चेतावनी नहीं: अपने देश की मौसम एजेंसी देखें।'],
    rainStop: ['🌤️ बारिश रुकी', '{nm} में बारिश थम गई।'], thunder: ['⚡ गरज', '{nm} के पास गरज वाले बादल।'],
    rainSoon: ['🌦️ बारिश आ रही है', '{nm} — लगभग {min} मिनट में शुरू होने की उम्मीद।'], rainNear: ['🌧️ पास में बारिश', '{nm} से लगभग {km} किमी {dir} में बारिश हो रही है।'], thunderNear: ['⛈️ पास में गरज', '{nm} से लगभग {km} किमी {dir} में गरज।'],
    windSurge: ['💨 हवा तेज़ हो रही है', '{nm} — {w} किमी/घं।'], dustRise: ['🌫️ हवा में धूल', '{nm} में धूल उठी है।'], heatSpike: ['🔥 भीषण गर्मी', '{nm} — {t}°।'],
    coldDrop: ['🌡️ तापमान गिरा', '{nm} — {d}° → {t}°।'], pressureFall: ['📉 दबाव गिर रहा है', '{nm} — {hp} hPa।'], nearbyRain: ['🌦️ बारिश की संभावना', '{nm} — संभावना {p}%{at}।'], around: ' लगभग ',
    test: ['नफ़ाफ़ परीक्षण अलर्ट', 'अगर आप यह पढ़ रहे हैं, तो नफ़ाफ़ बंद होने पर भी बारिश अलर्ट आप तक पहुँचेंगे।'] },
  ur: { dir: ['شمال', 'شمال مشرق', 'مشرق', 'جنوب مشرق', 'جنوب', 'جنوب مغرب', 'مغرب', 'شمال مغرب'], area: 'آپ کا علاقہ',
    rainStart: ['🌧️ بارش شروع', '{nm} میں بارش شروع — {mm} ملی میٹر۔'], rainHeavy: ['🌧️ موسلا دھار بارش', '{nm} — {mm} ملی میٹر۔ یہ وضاحت ہے، انتباہ نہیں: اپنے ملک کا محکمۂ موسمیات دیکھیں۔'],
    rainStop: ['🌤️ بارش رک گئی', '{nm} میں بارش تھم گئی۔'], thunder: ['⚡ گرج چمک', '{nm} کے قریب گرج چمک۔'],
    rainSoon: ['🌦️ بارش آ رہی ہے', '{nm} — تقریباً {min} منٹ میں شروع ہونے کی توقع۔'], rainNear: ['🌧️ قریب بارش', '{nm} سے تقریباً {km} کلومیٹر {dir} میں بارش ہو رہی ہے۔'], thunderNear: ['⛈️ قریب گرج', '{nm} سے تقریباً {km} کلومیٹر {dir} میں گرج۔'],
    windSurge: ['💨 ہوا تیز ہو رہی ہے', '{nm} — {w} کلومیٹر/گھنٹہ۔'], dustRise: ['🌫️ ہوا میں گرد', '{nm} میں گرد اٹھی ہے۔'], heatSpike: ['🔥 شدید گرمی', '{nm} — {t}°۔'],
    coldDrop: ['🌡️ درجہ گرا', '{nm} — {d}° → {t}°۔'], pressureFall: ['📉 دباؤ کم ہو رہا ہے', '{nm} — {hp} hPa۔'], nearbyRain: ['🌦️ بارش کا امکان', '{nm} — امکان {p}%{at}۔'], around: ' تقریباً ',
    test: ['نفاف آزمائشی الرٹ', 'اگر آپ یہ پڑھ رہے ہیں تو نفاف بند ہونے پر بھی بارش کے الرٹس آپ تک پہنچیں گے۔'] },
  bn: { dir: ['উত্তর', 'উত্তর-পূর্ব', 'পূর্ব', 'দক্ষিণ-পূর্ব', 'দক্ষিণ', 'দক্ষিণ-পশ্চিম', 'পশ্চিম', 'উত্তর-পশ্চিম'], area: 'আপনার এলাকা',
    rainStart: ['🌧️ বৃষ্টি শুরু', '{nm}-এ বৃষ্টি শুরু — {mm} মিমি।'], rainHeavy: ['🌧️ ভারী বৃষ্টি', '{nm} — {mm} মিমি। এটি বর্ণনা, সতর্কতা নয়: আপনার দেশের আবহাওয়া সংস্থা দেখুন।'],
    rainStop: ['🌤️ বৃষ্টি থেমেছে', '{nm}-এ বৃষ্টি কমে গেছে।'], thunder: ['⚡ বজ্রঝড়', '{nm}-এর কাছে বজ্রঝড়।'],
    rainSoon: ['🌦️ বৃষ্টি আসছে', '{nm} — প্রায় {min} মিনিটে শুরু হওয়ার কথা।'], rainNear: ['🌧️ কাছেই বৃষ্টি', '{nm} থেকে প্রায় {km} কিমি {dir}-এ বৃষ্টি হচ্ছে।'], thunderNear: ['⛈️ কাছেই বজ্রঝড়', '{nm} থেকে প্রায় {km} কিমি {dir}-এ বজ্রঝড়।'],
    windSurge: ['💨 বাতাস বাড়ছে', '{nm} — {w} কিমি/ঘ।'], dustRise: ['🌫️ বাতাসে ধুলো', '{nm}-এ ধুলো উঠেছে।'], heatSpike: ['🔥 তীব্র গরম', '{nm} — {t}°।'],
    coldDrop: ['🌡️ তাপমাত্রা কমেছে', '{nm} — {d}° → {t}°।'], pressureFall: ['📉 চাপ কমছে', '{nm} — {hp} hPa।'], nearbyRain: ['🌦️ বৃষ্টির সম্ভাবনা', '{nm} — সম্ভাবনা {p}%{at}।'], around: ' প্রায় ',
    test: ['নাফাফ পরীক্ষামূলক সতর্কবার্তা', 'এটি পড়তে পারলে নাফাফ বন্ধ থাকলেও বৃষ্টির সতর্কবার্তা আপনার কাছে পৌঁছাবে।'] }
};
function xlFill(t, v) { return t.replace(/\{(\w+)\}/g, (_, k) => v[k] != null ? v[k] : ''); }
/* rewrite one event in the subscriber's own language; keeps type, severity and link */
function xlEvent(e, now, prev, sub) {
  const X = XL[sub && sub.xl]; if (!X) return e;
  const key = e.type === 'rainNear' && now.ring && now.ring.th ? 'thunderNear' : e.type, tpl = X[key]; if (!tpl) return e;
  const w = Math.max(now.wind || 0, now.gust || 0);
  const v = { nm: sub.place || X.area, mm: (now.mm || 0).toFixed(1), min: now.soon, km: (now.ring && now.ring.km) || RING_KM, dir: now.ring ? X.dir[now.ring.dir] : '',
    w: Math.round(w), t: Math.round(now.temp), d: prev ? Math.round(prev.temp - now.temp) : '', hp: prev && prev.press ? Math.round(prev.press - now.press) : '',
    p: now.peak, at: now.peakAt ? X.around + now.peakAt : '' };
  return Object.assign({}, e, { title: xlFill(tpl[0], v), body: xlFill(tpl[1], v), lang: sub.xl });
}

function widgetPayload(now, sub) {
  const place = sub.place ? ' · ' + sub.place : '';
  let body = L2(sub, 'يحس ', 'Feels ') + Math.round(now.feels ?? now.temp) + '° · ' + L2(sub, 'رياح ', 'Wind ') + Math.round(now.wind) + L2(sub, ' كم/س', ' km/h');
  if (now.mm >= 0.1) body += '\n🌧️ ' + L2(sub, 'يمطر الحين ', 'Raining now ') + now.mm.toFixed(1) + L2(sub, ' ملم', ' mm');
  else if (now.soon != null) body += '\n🌦️ ' + L2(sub, 'مطر متوقع خلال ', 'Rain in about ') + now.soon + L2(sub, ' دقيقة', ' min');
  else if (now.peak >= 50) body += '\n🌦️ ' + L2(sub, 'احتمال مطر ', 'Rain chance ') + now.peak + '%' + (now.peakAt ? ' · ' + now.peakAt : '');
  return { widget: true, title: Math.round(now.temp) + '° · ' + wxName(sub, now.code) + place, body };
}

async function runAlerts(env) {
  const cfg = await getAlertCfg(env);
  if (!cfg.enabled) return;
  const T = cfg.types, minSoon = (T.rainSoon && T.rainSoon.min) || 0.2, minNear = (T.rainNear && T.rainNear.min) || 0.3;
  const list = await env.NAFAF_KV.list({ prefix: 'sub:' });
  const cells = new Map();
  for (const k of list.keys) {
    let sub; try { sub = JSON.parse(await env.NAFAF_KV.get(k.name)); } catch (_) { continue; }
    if (!sub || !sub.endpoint || sub.lat == null || sub.lon == null) continue;   /* بلا موقع لا تنبيه موقعي */
    const lat = Math.round(sub.lat * 10) / 10, lon = Math.round(sub.lon * 10) / 10, key = lat.toFixed(1) + ',' + lon.toFixed(1);
    if (!cells.has(key)) cells.set(key, { lat, lon, subs: [] });
    cells.get(key).subs.push(sub);
  }
  if (!cells.size) return;
  let prevAll = {}; try { prevAll = JSON.parse((await env.NAFAF_KV.get('wx:cells')) || '{}'); } catch (_) {}
  const keys = [...cells.keys()], nowAll = {};
  for (let i = 0; i < keys.length; i += CELL_BATCH) {
    const chunk = keys.slice(i, i + CELL_BATCH);
    try { const data = await fetchCells(chunk.map(k => cells.get(k)), minSoon); chunk.forEach((k, j) => { if (data[j]) nowAll[k] = data[j]; }); } catch (_) {}
  }
  /* مسح الحلقة: فقط حيث المطر محتمل ولم يبدأ، وبحد أقصى ٦ خلايا في الدورة */
  let rings = 0;
  for (const k of keys) {
    const n = nowAll[k], p = prevAll[k] || {}; if (!n) continue;
    n.ringAt = p.ringAt || 0; n.ring = p.ring || null;
    if (T.rainNear && T.rainNear.on && n.mm < 0.1 && n.pp3 >= 30 && Date.now() - n.ringAt > 30 * 60e3 && rings < RING_MAX) {
      rings++; try { n.ring = await ringScan(n.lat ?? cells.get(k).lat, n.lon ?? cells.get(k).lon, minNear, cfg.ringKm); if (n.ring) n.ring.km = cfg.ringKm || RING_KM; n.ringAt = Date.now(); } catch (_) {}
    }
    if (n.mm >= 0.1 || n.pp3 < 30) n.ring = null;
  }
  const slot = Math.floor(Date.now() / 600000) % 6;
  for (const k of keys) {
    const now = nowAll[k]; if (!now) continue;
    const prev = prevAll[k] || null;
    for (const sub of cells.get(k).subs) {
      try {
        if (!inQuiet(sub, cfg)) {
          for (const e of cellEvents(now, prev, cfg, sub)) {
            if (!(await underCap(env, sub.endpoint, e.type, cfg))) continue;
            await sendPush(env, sub, e); await bumpCap(env, sub.endpoint, e.type);
          }
        }
        /* الودجت: مرة كل ساعة تقريبًا لكل مستخدم، موزّعة على الدورات الست */
        if (sub.widget && (!T.widget || T.widget.on) && hashNum(sub.endpoint) % 6 === slot) await sendPush(env, sub, widgetPayload(now, sub));
      } catch (_) {}
    }
  }
  await env.NAFAF_KV.put('wx:cells', JSON.stringify(nowAll), { expirationTtl: 60 * 60 * 24 });
}

function defaultCfg() {
  return {
    version: 1,
    navigation: [
      { id: 'now',     label: 'الآن',          en: 'Now',       icon: '☁', enabled: true, order: 1 },
      { id: 'life',    label: 'يومك',          en: 'Your day',  icon: '✦', enabled: true, order: 2 },
      { id: 'fc',      label: 'الطقس القادم',  en: 'Coming weather', icon: '◷', enabled: true, order: 3 },
      { id: 'fit',     label: 'رياضتي',        en: 'Fitness',   icon: '🏃', enabled: true, order: 3.5 },
      { id: 'live',    label: 'الرصد المباشر', en: 'Live',      icon: '🌧', enabled: true, order: 4 },
      { id: 'world',   label: 'نافذة العالم',  en: 'World',     icon: '🌍', enabled: true, order: 5 },
      { id: 'gallery', label: 'أجواء نفاف',    en: 'Skies',     icon: '📷', enabled: true, order: 6 },
      { id: 'quake',   label: 'الزلازل',       en: 'Quakes',    icon: '◎', enabled: true, order: 7 },
      { id: 'src',     label: 'المصادر',       en: 'Sources',   icon: '📚', enabled: true, order: 8 }
    ],
    /* ترتيب مكوّنات الصفحة الرئيسية */
    blocks: {
      now: [
        { id: 'news',       label: 'الأخبار العاجلة',     enabled: true, order: 1 },
        { id: 'reports',    label: 'مرصد الأمطار المجتمعي', enabled: true, order: 2 },
        { id: 'watch',      label: 'متابعة الأجواء',       enabled: true, order: 3 },
        { id: 'worldWatch', label: 'رصد من العالم',        enabled: true, order: 4 },
        { id: 'glance',     label: 'نظرة على العالم',      enabled: true, order: 5 },
        { id: 'fusion',     label: 'دمج المصادر',          enabled: true, order: 6 },
        { id: 'hero',       label: 'نبض نفاف (الحلقة)',    enabled: true, order: 7 },
        { id: 'hourly',     label: 'شريط الساعات',         enabled: true, order: 8 },
        { id: 'feed',       label: 'السما الآن',           enabled: true, order: 9 },
        { id: 'rotate',     label: 'البطاقة الدوّارة',      enabled: true, order: 10 },
        { id: 'changes',    label: 'ماذا تغيّر',            enabled: true, order: 11 },
        { id: 'timeline',   label: 'المستقبل المتحرك',     enabled: true, order: 12 },
        { id: 'stability',  label: 'استقرار السماء',       enabled: true, order: 13 },
        { id: 'stats',      label: 'المؤشرات',             enabled: true, order: 14 },
        { id: 'nafaf',      label: 'صوت نفاف',             enabled: true, order: 15 },
        { id: 'sea',        label: 'البحر والرياح',         enabled: true, order: 16 },
        { id: 'season',     label: 'السما بعيون أهلها',     enabled: true, order: 17 },
        { id: 'radar',      label: 'السحب حولك (رادار)',    enabled: true, order: 18 },
        { id: 'astro',      label: 'حدث فلكي',             enabled: true, order: 19 },
        { id: 'onthisday',  label: 'في مثل هذا اليوم',      enabled: true, order: 20 },
        { id: 'rainscale',  label: 'حجم المطر',            enabled: true, order: 21 },
        { id: 'pressure',   label: 'الضغط الجوي',          enabled: true, order: 22 }
      ]
    },
    /* ★ الشريط السفلي — أول ٤ مفعّلة تظهر بالترتيب + «المزيد» دائمًا */
    dock: [
      { id: 'now',     label: 'الآن',    enabled: true,  order: 1 },
      { id: 'fc',      label: 'القادم',  enabled: true,  order: 2 },
      { id: 'fit',     label: 'رياضتي',  enabled: true,  order: 3 },
      { id: 'live',    label: 'الرصد',   enabled: true,  order: 4 },
      { id: 'life',    label: 'يومك',    enabled: false, order: 5 },
      { id: 'world',   label: 'العالم',  enabled: false, order: 6 },
      { id: 'gallery', label: 'المعرض',  enabled: false, order: 7 },
      { id: 'quake',   label: 'الزلازل', enabled: false, order: 8 },
      { id: 'src',     label: 'المصادر', enabled: false, order: 9 }
    ],
    /* الميزات — تشغيل وإطفاء بلا حذف كود */
    features: {
      /* الأزرار العائمة */
      askAssistant: true, reporter: true, eventAlert: true,
      /* الشريط العلوي */
      login: true, settings: true,
      /* الصفحة الرئيسية */
      pulseRing: true, glance: true, fusion: true, worldWatch: true,
      /* المحتوى */
      quakes: true, gallery: true, reporters: true,
      worldWindow: true, activities: true, records: true, village: false
    },
    /* مصادر الطقس وأولوياتها */
    sources: {
      openMeteo: { enabled: true, priority: 1 },
      ecmwf:     { enabled: true, priority: 2 },
      icon:      { enabled: true, priority: 3 },
      gfs:       { enabled: true, priority: 4 },
      rainviewer:{ enabled: true, priority: 5 },
      gibs:      { enabled: true, priority: 6 }
    },
    theme: { mode: 'dark', allowUserChange: true },
    /* ★★★ نظام الاشتراكات — معطّل بالكامل حتى تُفعّله من البوابة ★★★
       ⚠️ لا تُفعّله قبل الاشتراك في Open-Meteo التجاري.
          الخطة المجانية للاستخدام غير التجاري فقط — وأي تحصيل
          مالي ببيانات مجانية مخالفة صريحة للترخيص. */
    billing: {
      enabled: false,          /* المفتاح الرئيسي — كل شيء يتوقف عليه */
      dataLicenseOk: false,    /* أقررتَ أنك رقّيت مصدر البيانات؟ */
      donateOn: false,         /* زر الدعم الطوعي — آمن قانونيًا */
      donateUrl: '',           /* رابط Buy Me a Coffee أو Ko-fi */
      plusOn: false,           /* اشتراك نفاف بلس */
      priceYear: 9.9,
      currency: 'OMR',
      /* حدود المستخدم المجاني — تُطبَّق فقط عند تفعيل plusOn */
      freeLimits: {
        notifPerDay: 3,        /* إشعارات يوميًا */
        savedPlaces: 1,        /* مواقع محفوظة */
        askPerDay: 20,         /* أسئلة اسأل نفاف */
        archiveYears: 1        /* سنوات الأرشيف */
      },
      plusLimits: {
        notifPerDay: 0,        /* صفر = بلا حد */
        savedPlaces: 10,
        askPerDay: 0,
        archiveYears: 10
      }
    },
    /* ★ Rain Fusion — shadow افتراضيًا: تعمل بصمت حتى تُعتمد */
    fusion: { mode: 'shadow', weights: { radar: 0.95, satellite: 0.82, models: 0.90, local: 0.70 } },
    ui: { rotateSec: 4, rotateSlides: null, density: 'balanced' },
    reports: { reportTTL: 30, consensusWindow: 60, autoPublishSolo: false },
    /* قواعد العرض الشرطي */
    rules: []
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
  });
}
