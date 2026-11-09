/* ============================================================
   نفاف — عامل الخدمة (Service Worker)
   ملف حقيقي منفصل — إلزامي؛ التسجيل من Blob لا يعمل في أي متصفح.
   ⚠️ يجب أن يبقى بجانب index.html في نفس المجلد على GitHub Pages.
   ⚠️ CACHE يُغيَّر رقمه مع كل تحديث كبير — هذا يجبر كل المتصفحات
      على حذف النسخة القديمة تلقائيًا دون أي إجراء من المستخدم.
   ============================================================ */

var CACHE = 'nafaf-v29';
var STATE = 'nafaf-state';   /* موقع المستخدم ولغته للفحص في الخلفية — لا يُمسح مع التحديث */   /* رُفع الرقم — يمسح كل ذاكرة v1 القديمة تلقائيًا */

self.addEventListener('install', function (e) {
  self.skipWaiting();   /* لا تنتظر إغلاق كل التبويبات — فعّل فورًا */
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (n) {
          if (n !== CACHE && n !== STATE) return caches.delete(n);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(function (r) {
          var c = r.clone();
          caches.open(CACHE).then(function (x) { x.put(e.request, c); });
          return r;
        })
        .catch(function () { return caches.match(e.request); })
    );
    return;
  }

  /* مكتبات محلية ثابتة الإصدار (three.js للوادي) وملفات اللغة — تُحفظ مرة وتعمل بلا إنترنت */
  /* ملفات الرسم والصور واللغة صارت في الجذر (بلا مجلدات) — تُحفظ مرة وتعمل بلا إنترنت */
  if (/\/(three\.module\.min|OrbitControls|Sky|Pass|UnrealBloomPass|CopyShader|LuminosityHighPassShader|nafaf-i18n)\.js(\?|$)|\/earth-(day|night)-[24]k\.jpg|\/earth-land-mask\.png/.test(url)) {
    e.respondWith(
      caches.match(e.request).then(function (m) {
        var net = fetch(e.request).then(function (r) {
          if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (x) { x.put(e.request, c); }); }
          return r;
        });
        return m || net;
      })
    );
    return;
  }

  /* مختبر الوادي: مكتبة الرسم ثابتة الإصدار — تُحفظ مرة وتعمل بلا إنترنت بعدها */
  if (url.indexOf('cdn.jsdelivr.net/npm/three@0.162.0/') >= 0) {
    e.respondWith(
      caches.match(e.request).then(function (m) {
        return m || fetch(e.request).then(function (r) {
          var c = r.clone();
          caches.open(CACHE).then(function (x) { x.put(e.request, c); });
          return r;
        });
      })
    );
    return;
  }

  if (url.indexOf('open-meteo.com') >= 0 || url.indexOf('rainviewer.com') >= 0) {
    e.respondWith(
      fetch(e.request)
        .then(function (r) {
          var c = r.clone();
          caches.open(CACHE).then(function (x) { x.put(e.request, c); });
          return r;
        })
        .catch(function () { return caches.match(e.request); })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (m) { return m || fetch(e.request); })
  );
});

/* ★ تحديث الودجت بطلب من التطبيق */
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'nafaf-widget' && d.title) {
    e.waitUntil(
      self.registration.showNotification(d.title, {
        body: d.body || '',
        tag: 'nafaf-widget',
        renotify: false,
        silent: true,
        requireInteraction: true,
        dir: 'auto',
        badge: 'icons/icon-96.png',
        icon: 'icons/icon-192.png',
        data: { url: './', widget: true }
      })
    );
  } else if (d.type === 'nafaf-widget-off') {
    e.waitUntil(
      self.registration.getNotifications({ tag: 'nafaf-widget' })
        .then(function (ns) { ns.forEach(function (n) { n.close(); }); })
    );
  } else if (d.type === 'nafaf-state' && typeof d.lat === 'number') {
    /* التطبيق يسلّمنا موقعك ولغتك لنفحص السماء ونحن مغلقون */
    e.waitUntil(readState().then(function (old) {
      var st = Object.assign({}, old || {}, { lat: d.lat, lon: d.lon, place: d.place || '', lang: d.lang || 'ar', widget: !!d.widget, tz: d.tz, t: Date.now() });
      return writeState(st);
    }));
  }
});

function readState() {
  return caches.open(STATE).then(function (c) { return c.match('./__nafaf_state'); })
    .then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
}
function writeState(st) {
  return caches.open(STATE).then(function (c) { return c.put('./__nafaf_state', new Response(JSON.stringify(st), { headers: { 'Content-Type': 'application/json' } })); });
}
function tx(st, a, b, c) { return st && st.lang === 'en' ? c : (st && st.lang === 'msa' ? b : a); }
var VIB = { alert: [180, 80, 180, 80, 260], notice: [120, 60, 120], info: [] };

/* ★ إشعار من الخادم: مطر يبدأ، مطر يقترب، رعد، رياح… أو تحديث صامت للودجت */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data.json(); } catch (x) { d = { title: 'نفاف', body: e.data ? e.data.text() : '' }; }
  if (d.widget) {
    /* تحديث الودجت والتطبيق مغلق: نفس الوسم = يستبدل بلا صوت */
    e.waitUntil(self.registration.showNotification(d.title || 'نفاف', {
      body: d.body || '', tag: 'nafaf-widget', renotify: false, silent: true, requireInteraction: true,
      dir: 'auto', badge: 'icons/icon-96.png', icon: 'icons/icon-192.png', data: { url: './', widget: true }
    }));
    return;
  }
  var sev = d.sev || (d.renotify ? 'notice' : 'info');
  var opts = {
    body: d.body || '',
    tag: d.tag || 'nafaf-rain',
    renotify: d.renotify != null ? !!d.renotify : sev !== 'info',
    silent: d.silent != null ? !!d.silent : sev === 'info',
    dir: 'auto',
    lang: d.lang === 'en' ? 'en' : 'ar',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-96.png',
    timestamp: d.ts || Date.now(),
    data: { url: d.url || './' }
  };
  if (VIB[sev] && VIB[sev].length) opts.vibrate = VIB[sev];
  if (d.actions) opts.actions = d.actions;
  else if (/rain|thunder|near|soon/i.test(d.type || d.tag || '')) opts.actions = [{ action: 'radar', title: d.lang === 'en' ? 'Radar' : 'الرادار' }];
  e.waitUntil(self.registration.showNotification(d.title || 'نفاف', opts));
});

/* ★ الفحص في الخلفية (Periodic Background Sync — أندرويد/كروم للتطبيق المثبّت):
   كروم يقرّر التوقيت الفعلي حسب استخدامك للتطبيق؛ هذا مكمّل لخادم الإشعارات لا بديل عنه */
var WX = { 0: ['صحو', 'صحو', 'Clear'], 1: ['صحو غالبًا', 'صحو غالبًا', 'Mostly clear'], 2: ['غيم جزئي', 'غائم جزئيًا', 'Partly cloudy'], 3: ['غيم', 'غائم', 'Overcast'],
  45: ['ضباب', 'ضباب', 'Fog'], 48: ['ضباب', 'ضباب', 'Fog'], 51: ['رذاذ', 'رذاذ', 'Drizzle'], 61: ['مطر خفيف', 'مطر خفيف', 'Light rain'], 63: ['مطر', 'مطر', 'Rain'], 65: ['مطر غزير', 'مطر غزير', 'Heavy rain'],
  80: ['زخات', 'زخات', 'Showers'], 81: ['زخات', 'زخات', 'Showers'], 82: ['زخات قوية', 'زخات قوية', 'Heavy showers'], 95: ['رعد', 'عاصفة رعدية', 'Thunderstorm'], 96: ['رعد وبرد', 'رعد وبَرَد', 'Thunder & hail'], 99: ['رعد وبرد', 'رعد وبَرَد', 'Thunder & hail'] };
function wxName(st, code) { var k = WX[code] || WX[Math.floor(code / 10) * 10] || WX[3]; return tx(st, k[0], k[1], k[2]); }
function skyCheck() {
  return readState().then(function (st) {
    if (!st || typeof st.lat !== 'number') return;
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + st.lat + '&longitude=' + st.lon +
      '&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m' +
      '&minutely_15=precipitation&forecast_minutely_15=8&timezone=auto';
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.current) return;
      var c = d.current, jobs = [], soon = -1, mm = 0, m = d.minutely_15 || {};
      (m.precipitation || []).forEach(function (v, i) { if (soon < 0 && v >= 0.2) { soon = i; mm = v; } });
      var place = st.place || tx(st, 'منطقتك', 'منطقتك', 'your area');
      if (st.widget) {
        var title = Math.round(c.temperature_2m) + '° · ' + wxName(st, c.weather_code) + (st.place ? ' · ' + st.place : '');
        var body = tx(st, 'يحس ', 'المحسوسة ', 'Feels ') + Math.round(c.apparent_temperature) + '° · ' + tx(st, 'رياح ', 'رياح ', 'Wind ') + Math.round(c.wind_speed_10m) + tx(st, ' كم/س', ' كم/س', ' km/h');
        if (soon >= 0) body += '\n🌧️ ' + tx(st, 'مطر متوقع خلال ', 'مطر متوقع خلال ', 'Rain expected in ') + (soon * 15 || 15) + tx(st, ' دقيقة', ' دقيقة', ' min');
        jobs.push(self.registration.showNotification(title, { body: body, tag: 'nafaf-widget', renotify: false, silent: true, requireInteraction: true, dir: 'auto', badge: 'icons/icon-96.png', icon: 'icons/icon-192.png', data: { url: './', widget: true } }));
      }
      /* مطر خلال ساعة ولم يبدأ بعد: إشعار واحد كل ٣ ساعات كحد أقصى، بنفس وسم الخادم فلا يتكرر */
      if (soon >= 1 && (c.precipitation || 0) < 0.1 && (!st.rainNote || Date.now() - st.rainNote > 3 * 3600e3)) {
        st.rainNote = Date.now();
        jobs.push(writeState(st));
        jobs.push(self.registration.showNotification(tx(st, '🌦️ المطر جاي', '🌦️ المطر يقترب', '🌦️ Rain on the way'), {
          body: place + ' — ' + tx(st, 'متوقع يبدأ خلال ', 'يُتوقع أن يبدأ خلال ', 'expected to start within ') + (soon * 15) + tx(st, ' دقيقة تقريبًا.', ' دقيقة تقريبًا.', ' minutes.'),
          tag: 'nafaf-rainSoon', renotify: true, dir: 'auto', icon: 'icons/icon-192.png', badge: 'icons/icon-96.png', vibrate: VIB.notice,
          actions: [{ action: 'radar', title: tx(st, 'الرادار', 'الرادار', 'Radar') }], data: { url: './#live' }
        }));
      }
      return Promise.all(jobs);
    });
  }).catch(function () {});
}
self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'nafaf-sky') e.waitUntil(skyCheck());
});

self.addEventListener('notificationclick', function (e) {
  /* ★★★ ودجت نفاف — لا يُغلق بالنقر بل يفتح التطبيق ويبقى ★★★
     ⚠️ الإشعار العادي يُغلق · الودجت يبقى مثبّتًا */
  var isWidget = e.notification.tag === 'nafaf-widget';
  if (!isWidget) e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || './';
  if (e.action === 'radar') target = './#live';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      for (var i = 0; i < cs.length; i++) {
        if ('focus' in cs[i]) {
          if (target.indexOf('#live') >= 0) try { cs[i].postMessage({ type: 'nafaf-open', tab: 'live' }); } catch (x) {}
          return cs[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
