/* ============================================================
   نفاف — عامل الخدمة (Service Worker)
   ملف حقيقي منفصل — إلزامي؛ التسجيل من Blob لا يعمل في أي متصفح.
   ⚠️ يجب أن يبقى بجانب index.html في نفس المجلد على GitHub Pages.
   ⚠️ CACHE يُغيَّر رقمه مع كل تحديث كبير — هذا يجبر كل المتصفحات
      على حذف النسخة القديمة تلقائيًا دون أي إجراء من المستخدم.
   ============================================================ */

var CACHE = 'nafaf-v14';   /* رُفع الرقم — يمسح كل ذاكرة v1 القديمة تلقائيًا */

self.addEventListener('install', function (e) {
  self.skipWaiting();   /* لا تنتظر إغلاق كل التبويبات — فعّل فورًا */
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.map(function (n) {
          if (n !== CACHE) return caches.delete(n);
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
        dir: 'rtl', lang: 'ar',
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
  }
});

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data.json(); } catch (x) { d = { title: 'نفاف', body: e.data ? e.data.text() : '' }; }

  e.waitUntil(
    self.registration.showNotification(d.title || 'نفاف', {
      body: d.body || '',
      tag: d.tag || 'nafaf-rain',
      renotify: !!d.renotify,
      silent: !!d.silent,
      dir: 'rtl',
      lang: 'ar',
      data: { url: './' }
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  /* ★★★ ودجت نفاف — لا يُغلق بالنقر بل يفتح التطبيق ويبقى ★★★
     ⚠️ الإشعار العادي يُغلق · الودجت يبقى مثبّتًا */
  var isWidget = e.notification.tag === 'nafaf-widget';
  if (!isWidget) e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function (cs) {
      for (var i = 0; i < cs.length; i++) {
        if ('focus' in cs[i]) return cs[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
