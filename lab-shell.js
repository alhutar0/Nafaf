/* ═══════ Nafaf Lab Shell — the shared frame every lab wears (same family as the cyclone game) ═══════
   One back orb in the same corner on every lab, the lab's own colour as an entry glow, gold accents,
   the same glass, buttons, sliders and focus ring. It styles with :where() (zero specificity), so each
   lab's own layout always wins; it only replaces the old, differently placed "Nafaf" back links. */
(function () {
  if (window.__nxShell) return; window.__nxShell = 1;
  var NX = null; try { NX = JSON.parse(localStorage.getItem('nx.cfg') || 'null'); } catch (e) {}
  var SH = (NX && NX.labShell) || {};
  var fileNow = (location.pathname.split('/').pop() || '').toLowerCase();
  /* a lab switched off in the admin portal: say so and offer the way back */
  if (NX && NX.labs && NX.labs.some(function (l) { return l.enabled === false && (l.id + '.html') === fileNow; })) {
    document.addEventListener('DOMContentLoaded', function () {
      var en = false; try { en = localStorage.getItem('lang') === 'en'; } catch (e) {}
      document.body.innerHTML = '<div style="position:fixed;inset:0;display:grid;place-items:center;background:#050914;color:#EEF3FA;font:16px system-ui,sans-serif;text-align:center;padding:24px"><div><div style="font-size:40px;margin-bottom:10px">🛠</div><b>' + (en ? 'This lab is resting for now' : 'هذا المختبر متوقف مؤقتًا') + '</b><p style="opacity:.7;margin:8px 0 18px">' + (en ? 'It will be back soon.' : 'يرجع قريب إن شاء الله.') + '</p><a href="./" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#E3A94B;color:#1d1305;font-weight:800;text-decoration:none">' + (en ? 'Back to Nafaf' : 'رجوع لنفاف') + '</a></div></div>';
    });
    return;
  }
  if (SH.on === false) return;
  var EN = false; try { EN = localStorage.getItem('lang') === 'en'; } catch (e) {}
  var file = (location.pathname.split('/').pop() || '').toLowerCase();
  var LABS = {"cyclone.html": {"n": "لعبة الأعاصير", "e": "Cyclone Game", "c": "#F08A4B"}, "wadi.html": {"n": "مختبر الوادي", "e": "Wadi Lab", "c": "#4FB3E8"}, "falaj.html": {"n": "محرك الأفلاج", "e": "Falaj Engine", "c": "#5CC9B0"}, "seeding.html": {"n": "مفاعل الاستمطار", "e": "Cloud Seeding Reactor", "c": "#9CC8FF"}, "atmo.html": {"n": "مختبر الغلاف الجوي", "e": "Atmosphere Lab", "c": "#B88CFF"}, "trajectory.html": {"n": "بصمة الهواء", "e": "Air Fingerprint", "c": "#7FB8FF"}, "worlds.html": {"n": "نافذة العوالم", "e": "Window to Worlds", "c": "#E3A94B"}, "route.html": {"n": "مخطط المسار", "e": "Route Planner", "c": "#6FD39B"}, "coach.html": {"n": "المدرب البيئي", "e": "Bio-Weather Coach", "c": "#F2B84B"}, "body.html": {"n": "المجسم الحراري", "e": "Thermal Body", "c": "#F06B5B"}, "sky.html": {"n": "البوصلة السماوية", "e": "Sky Compass", "c": "#CFE8FF"}, "broadcast.html": {"n": "استوديو النشرة", "e": "Broadcast Studio", "c": "#E58AB0"}, "scent.html": {"n": "قارورة الجو", "e": "Weather Flask", "c": "#D9A066"}, "village.html": {"n": "قرية نفاف", "e": "Nafaf Village", "c": "#B9D36A"}};
  var LAB = LABS[file] || null;
  var C = { 'wadi.html': '#4FB3E8', 'falaj.html': '#5CC9B0', 'seeding.html': '#9CC8FF', 'atmo.html': '#B88CFF', 'cyclone.html': '#F08A4B', 'trajectory.html': '#7FB8FF', 'worlds.html': '#E3A94B',
    'route.html': '#6FD39B', 'coach.html': '#F2B84B', 'body.html': '#F06B5B', 'sky.html': '#CFE8FF', 'broadcast.html': '#E58AB0', 'scent.html': '#D9A066', 'village.html': '#B9D36A' };
  var lc = (LAB && LAB.c) || C[file] || '#E3A94B';
  var css = ''
    + ':root{--ls-gold:#E3A94B;--ls-lc:' + lc + ';--ls-glass:rgba(6,12,26,.74);--ls-edge:rgba(255,255,255,.10);--ls-ink:#EEF3FA;--ls-spring:cubic-bezier(.34,1.56,.64,1)}'
    + 'html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-tap-highlight-color:transparent}'
    + ':where(body){font-family:system-ui,-apple-system,"Segoe UI",Tahoma,"Geeza Pro","Noto Sans Arabic",Arial,sans-serif}'
    + '::selection{background:color-mix(in srgb,var(--ls-lc) 45%,transparent)}'
    + ':where(input[type=range],input[type=checkbox],input[type=radio],progress){accent-color:var(--ls-gold)}'
    + ':where(button,a,[role=button],input,select,summary):focus-visible{outline:2px solid var(--ls-gold);outline-offset:2px}'
    + ':where(button,[role=button]){transition:scale .35s var(--ls-spring),background-color .2s,border-color .2s}'
    + ':where(button:not(:disabled),[role=button]):active{scale:.95}'
    + '*{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}'
    + '::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:3px}'
    /* the back orb: identical on every lab */
    + '#lsBack{position:fixed;z-index:2147483000;top:max(10px,env(safe-area-inset-top,0px));inset-inline-end:max(12px,env(safe-area-inset-right,0px));width:38px;height:38px;border-radius:50%;display:grid;place-items:center;'
    + 'background:var(--ls-glass);border:1px solid var(--ls-edge);color:var(--ls-ink);text-decoration:none;box-shadow:0 10px 28px -12px rgba(0,0,0,.9),0 0 0 0 var(--ls-lc);transition:scale .35s var(--ls-spring),box-shadow .4s}'
    + '#lsBack:hover{box-shadow:0 10px 28px -12px rgba(0,0,0,.9),0 0 0 3px color-mix(in srgb,var(--ls-lc) 40%,transparent)}'
    + '#lsBack:active{scale:.9}'
    + '#lsBack svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}'
    + 'html[dir=rtl] #lsBack svg{transform:scaleX(-1)}'
    + '#lsBack i{position:absolute;inset:-1px;border-radius:50%;border:2px solid var(--ls-lc);opacity:.0;animation:lsRing 1.6s ease-out .3s 2}'
    + '@keyframes lsRing{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.6)}}'
    + '#lsTag{position:fixed;z-index:2147482999;top:max(10px,env(safe-area-inset-top,0px));inset-inline-end:calc(max(12px,env(safe-area-inset-right,0px)) + 46px);height:38px;display:flex;align-items:center;gap:7px;padding:0 12px;border-radius:999px;'
    + 'background:var(--ls-glass);border:1px solid var(--ls-edge);color:var(--ls-ink);font:700 12.5px/1 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;white-space:nowrap;pointer-events:none;opacity:0;transform:translateY(-6px);transition:opacity .4s,transform .5s var(--ls-spring)}'
    + '#lsTag.on{opacity:1;transform:none}'
    + '#lsTag b{width:8px;height:8px;border-radius:50%;background:var(--ls-lc);box-shadow:0 0 10px var(--ls-lc)}'
    /* entry: the lab opens out of its own colour, like the launcher flash that brought the user here */
    + '#lsIn{position:fixed;inset:0;z-index:2147483001;pointer-events:none;background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--ls-lc) 70%,#050914) 0,#050914 60%);animation:lsIn .9s ease .05s forwards}'
    + '@keyframes lsIn{to{opacity:0;visibility:hidden}}'
    + '@media (prefers-reduced-motion:reduce){#lsIn,#lsBack i{animation:none;display:none}#lsTag{transition:none}}'
    + '@media print{#lsBack,#lsTag,#lsIn{display:none}}';
  var st = document.createElement('style'); st.id = 'lsCss'; st.textContent = css; (document.head || document.documentElement).appendChild(st);
  if (SH.flash !== false) { var flash = document.createElement('div'); flash.id = 'lsIn'; document.documentElement.appendChild(flash);
  setTimeout(function () { flash.remove(); }, 1300); }

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    /* retire the old "Nafaf" back links that floated in a different place on each lab:
       fixed-position ones and the small ones in a header. Buttons inside result screens stay. */
    var links = document.querySelectorAll('a[href="./"],a[href="index.html"],a[href="/"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], cs = getComputedStyle(a), txt = (a.textContent || '').trim();
      var fixed = cs.position === 'fixed', inHead = !!a.closest('header,.top,.head');
      if (a.id === 'bBack') continue;                     /* the wadi game's own nav bar keeps its button */
      if (fixed || (inHead && txt.length <= 12)) a.style.display = 'none';
    }
    var b = document.createElement('a'); b.id = 'lsBack'; b.href = './';
    b.setAttribute('aria-label', EN ? 'Back to Nafaf' : 'العودة إلى نفاف'); b.title = b.getAttribute('aria-label');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><i></i>';
    document.body.appendChild(b);
    /* never sit on a lab's own title or controls: try the corner, then step down until the spot is clear */
    function busyAt(x, y) {
      var els = document.elementsFromPoint(x, y) || [];
      for (var k = 0; k < els.length; k++) { var e = els[k]; if (e === b || b.contains(e) || e.id === 'lsTag' || e.id === 'lsIn') continue;
        if (e === document.body || e === document.documentElement || e.tagName === 'CANVAS' || e.tagName === 'svg' && e.clientWidth > innerWidth * 0.6) return false;
        if (/^(A|BUTTON|INPUT|SELECT|LABEL|TEXTAREA)$/.test(e.tagName)) return true;
        for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()) return true;
        var r = e.getBoundingClientRect(); if (r.width < innerWidth * 0.7 || r.height < innerHeight * 0.4) return true;   /* a small panel = something of the lab's */
      }
      return false;
    }
    function place() {
      var top0 = Math.max(10, parseFloat(getComputedStyle(b).top) || 10), rtl = getComputedStyle(document.documentElement).direction === 'rtl' || document.dir === 'rtl';
      b.style.visibility = 'hidden';
      for (var step = 0; step < 6; step++) {
        var y = top0 + step * 46, x0 = rtl ? 12 : innerWidth - 50, clear = true;
        [[x0 + 4, y + 4], [x0 + 34, y + 4], [x0 + 4, y + 34], [x0 + 34, y + 34], [x0 + 19, y + 19]].forEach(function (p) { if (clear && busyAt(p[0], p[1])) clear = false; });
        if (clear) { b.style.top = y + 'px'; break; }
      }
      b.style.visibility = '';
      var tg = document.getElementById('lsTag'); if (tg) tg.style.top = b.style.top || '';
    }
    setTimeout(place, 60); setTimeout(place, 1500); addEventListener('resize', function () { clearTimeout(place.k); place.k = setTimeout(place, 200); });
    var name = LAB ? (EN ? LAB.e : LAB.n) : (document.title || '').split(/[—|·-]/)[0].trim();
    if (name && SH.tag !== false) {
      var t = document.createElement('div'); t.id = 'lsTag'; t.setAttribute('aria-hidden', 'true'); t.innerHTML = '<b></b><span></span>'; t.lastChild.textContent = name;
      document.body.appendChild(t);
      /* the name greets the user, then gets out of the way of the view */
      requestAnimationFrame(function () { t.classList.add('on'); });
      setTimeout(function () { t.classList.remove('on'); }, 2600);
    }
    try { var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = '#050914'; } catch (e) {}
  });
})();
