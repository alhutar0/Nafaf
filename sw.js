/* ============================================================
   نفاف — عامل الخدمة (Service Worker)
   ⚠️ يجب أن يكون ملفًا مستقلًا بجانب index.html — لا يمكن تضمينه
      داخل الصفحة، لأن المتصفحات تمنع تسجيله من blob: أو data:
   يوفّر: العمل بلا إنترنت + استقبال إشعارات المطر الحيّة
   ============================================================ */

var CACHE = 'nafaf-v2';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);   /* نظّف النسخ القديمة */
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var u = e.request.url;

  /* الصفحة نفسها: الشبكة أولًا لضمان أحدث نسخة، والمخزن احتياطًا */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (r) {
        var c = r.clone();
        caches.open(CACHE).then(function (x) { x.put(e.request, c); });
        return r;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }

  /* بيانات الطقس: الشبكة أولًا مع نسخة احتياطية للعمل أوفلاين */
  if (u.indexOf('open-meteo.com') >= 0 || u.indexOf('rainviewer.com') >= 0) {
    e.respondWith(
      fetch(e.request).then(function (r) {
        var c = r.clone();
        caches.open(CACHE).then(function (x) { x.put(e.request, c); });
        return r;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }

  /* بقية الموارد: المخزن أولًا */
  e.respondWith(
    caches.match(e.request).then(function (m) { return m || fetch(e.request); })
  );
});

/* ===== استقبال إشعار المطر الحيّ ===== */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data.json(); }
  catch (x) { d = { title: 'نفاف', body: e.data ? e.data.text() : '' }; }

  e.waitUntil(
    self.registration.showNotification(d.title || 'نفاف', {
      body: d.body || '',
      tag: d.tag || 'nafaf-rain',   /* ★ وسم ثابت = استبدال لا تكديس */
      renotify: !!d.renotify,       /* صوت واهتزاز عند المراحل المهمة فقط */
      silent: !!d.silent,
      dir: 'rtl',
      lang: 'ar',
      data: { url: './' }
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      for (var i = 0; i < cs.length; i++) {
        if ('focus' in cs[i]) return cs[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
