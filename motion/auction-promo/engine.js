/* product-motion · engine.js
 * Детерминированный движок кадров. Каждый кадр — чистая функция времени: render(t).
 * Никаких CSS-transition, setTimeout, requestAnimationFrame, Date.now() и Math.random() в render —
 * только вычисление состояния из t. Поэтому покадровый рендер не дёргается и совпадает с превью.
 *
 * Контракт со скриптами (scripts/render.py):
 *   window.PLAN  — из plan.js: duration, fps, canvas [w, h], language, vo, titles (обычно пусто), music
 *   window.CUES  — (опц.) из cues.js, пишет align_vo.py после озвучки; иначе субтитры оцениваются по тексту
 *   window.SYNC  — (опц.) из cues.js: время слов озвучки, {"p3:индустрию": 11.01, "p4": 13.55}
 *   window.TMAP  — (опц.) из tmap.js, пишет retime.py: карта времени динамичной версии
 *   window.render(t), window.READY, window.DURATION, window.FPS
 * Параметры страницы: ?fmt=h|v  ·  &subs=0 — без субтитров  ·  &tmap=0 — игнорировать tmap.js (обычный темп)
 *                     &preview=1 — превью в браузере: кадр вписан в окно, ползунок времени и пуск (рендер его не использует)
 *
 * Слои кадра (снизу вверх):
 *   #stage > #app    — интерфейс (полотно PLAN.canvas, по умолчанию 1600×960), его двигает камера
 *   #fdim            — затемнение ВСЕГО кадра (тёмный экран обработки, модалки). Сцены зовут E.dim(x)
 *   #stage2 > #app2  — то, что над затемнением: содержимое тёмных экранов, модалки, курсор.
 *                      Камера и прозрачность копируются с #app. Так край окна не просвечивает и не мерцает.
 *   #endcard, #subL  — финальная карточка, субтитры
 *
 * Цвета и шрифт — из brand/brand.css (CSS-переменные): --accent, --dark, --ring-stops и др. Движок их только читает.
 *
 * Страница вызывает E.start({ build, setup, scene }):
 *   build(E)    — один раз создаёт DOM (карточки, списки) до загрузки шрифтов
 *   setup(E)    — после шрифтов: замеры (E.measureAt + E.rect) и пути камеры/курсора
 *   scene(t, E) — состояние DOM на момент t (исходное время сцены; в E.MEAS — всё показано для замеров)
 */
(function () {
  const Q = new URLSearchParams(location.search);
  const V = (Q.get('fmt') || 'h') === 'v';
  const SUBS = Q.get('subs') !== '0';
  const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
  document.documentElement.classList.add(V ? 'fv' : 'fh');
  const $ = id => document.getElementById(id);

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;   // камера, перестроения
  const eout = x => 1 - Math.pow(1 - x, 3);                                     // появления
  const lerp = (a, b, p) => a + (b - a) * p;
  const env = (t, a, b, fi = .3, fo = .3) => Math.min(eout(lin(t, a, a + fi)), 1 - eio(lin(t, b - fo, b)));
  const bump = (t, a, b) => Math.sin(lin(t, a, b) * Math.PI);
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
  const fmtN = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const css = (el, o) => { for (const k in o) el.style[k] = o[k]; };
  const show = (el, on, disp = 'block') => { el.style.display = on ? disp : 'none'; return on; };
  const typed = (t, a, b, text) => text.slice(0, Math.floor(lin(t, a, b) * text.length));   // печать текста
  const blink = t => Math.floor(t * 2.4) % 2 === 0;
  const stagger = (t, t0, i, step = .1, dur = .45) => eout(lin(t, t0 + i * step, t0 + i * step + dur));
  // склонение: plural(5, ['стартап','стартапа','стартапов'])
  const plural = (n, f) => { const a = n % 10, b = n % 100; return (a === 1 && b !== 11) ? f[0] : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? f[1] : f[2]; };
  // переливающаяся обводка поля (.gw .ring / .glow): угол растёт со временем
  // цвета — из --ring-stops бренд-профиля (brand.css); читаются один раз
  let STOPS = null;
  const ringStops = () => STOPS || (STOPS = (getComputedStyle(document.documentElement).getPropertyValue('--ring-stops') || '').trim() || '#3D8BFF, #8B6CFF, #19C3A7, #3D8BFF');
  const grad = a => `conic-gradient(from ${a.toFixed(1)}deg at 50% 50%, ${ringStops()})`;
  // текст поля с подсветкой фрагментов: segs=[{a,b,p,id}] (символы a..b, p — сила подсветки 0..1), sel — «выделить всё»
  function markup(str, n, segs = [], sel = false) {
    const s = str.slice(0, n); let h = '', pos = 0;
    for (const m of [...segs].sort((x, y) => x.a - y.a)) {
      if (m.a >= n) break;
      h += s.slice(pos, m.a); const e = Math.min(m.b, n), al = (10 * (m.p || 0)).toFixed(1);
      const bg = `color-mix(in srgb, var(--dark) ${al}%, transparent)`;
      h += `<span class="mk" id="${m.id}" style="background:${bg};box-shadow:0 0 0 3px ${bg}">${s.slice(m.a, e)}</span>`;
      pos = e;
    }
    h += s.slice(pos);
    return sel ? `<span class="sel">${h}</span>` : h;
  }

  const PLAN = window.PLAN || {};
  const DUR = PLAN.duration || 30, FPS = PLAN.fps || 30;
  const CW = (PLAN.canvas || [1600, 960])[0], CH = (PLAN.canvas || [1600, 960])[1];   // полотно интерфейса
  document.documentElement.style.setProperty('--cw', CW + 'px');
  document.documentElement.style.setProperty('--ch', CH + 'px');
  const PREVIEW = Q.get('preview') === '1';
  const sync = (key, fb) => (window.SYNC && window.SYNC[key] != null) ? window.SYNC[key] : fb;
  // карта времени динамичной версии: время кадра → исходное время сцены
  const TMAP = Q.get('tmap') === '0' ? null : (window.TMAP || null);
  function toScene(tn) {
    if (!TMAP) return tn; const K = TMAP.knots;
    if (tn <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) if (tn <= K[i][0]) { const a = K[i - 1], b = K[i]; return a[1] + (b[1] - a[1]) * (tn - a[0]) / ((b[0] - a[0]) || 1); }
    return K[K.length - 1][1];
  }

  const S = { MEAS: false, KF: [], CUR: [], CLICKS: [], anchor: V ? [540, 1000] : [W / 2, H / 2], dim: 0 };
  let SCENE = () => {};

  // ---------- interpolation ----------
  function sample(K, t, logIdx) {
    if (!K.length) return null;
    if (t <= K[0][0]) return K[0].slice(1);
    for (let i = 0; i < K.length - 1; i++) {
      const a = K[i], b = K[i + 1];
      if (t < b[0]) {
        const p = eio(lin(t, a[0], b[0])); const o = [];
        for (let j = 1; j < a.length; j++) o.push(j === logIdx ? Math.exp(lerp(Math.log(a[j]), Math.log(b[j]), p)) : lerp(a[j], b[j], p));
        return o;
      }
    }
    return K[K.length - 1].slice(1);
  }

  // ---------- measuring ----------
  function rect(el) {
    if (typeof el === 'string') el = $(el);
    const a = $('app').getBoundingClientRect(), b = el.getBoundingClientRect();
    return { x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height, cx: b.left - a.left + b.width / 2, cy: b.top - a.top + b.height / 2 };
  }
  function measureAt(t) {
    S.MEAS = true; $('app').style.transform = 'none'; if ($('app2')) $('app2').style.transform = 'none';
    SCENE(t, API); return API;
  }

  // ---------- overlays: cursor, ripples, titles, subtitles ----------
  let TITLES = [], TEL = [], CUES = [];
  function buildOverlays() {
    const host = $('app2') || $('app');           // курсор — над модалками и затемнением
    if (host) {
      const rp = document.createElement('div'); rp.id = 'ripples'; host.appendChild(rp);
      const cu = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      cu.id = 'cursor'; cu.setAttribute('viewBox', '0 0 30 30');
      cu.innerHTML = '<path d="M6 3.5l16.5 14-7.2.7 4.2 8.6-3.4 1.6-4.2-8.7-5.9 5z" fill="var(--cursor, #16181D)" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>';
      host.appendChild(cu);
    }
    const frame = $('frame');
    if (!$('fdim')) { const d = document.createElement('div'); d.id = 'fdim'; d.className = 'layer'; frame.appendChild(d); }
    const tl = document.createElement('div'); tl.id = 'titleL'; tl.className = 'layer'; frame.appendChild(tl);
    const sl = document.createElement('div'); sl.id = 'subL'; sl.className = 'layer'; sl.innerHTML = '<div id="sub"></div>'; frame.appendChild(sl);
    if (!SUBS) sl.style.display = 'none';
    // титры — только если явно заданы в PLAN.titles (по умолчанию роликам хватает субтитров)
    TITLES = (PLAN.titles || []).map(T => ({ until: T.until, parts: T.parts.map(p => ({ t: p.t, at: sync(p.sync, p.at), brV: !!p.brV })) }));
    TEL = TITLES.map(T => {
      const d = document.createElement('div'); d.className = 'tc';
      d.innerHTML = T.parts.map((p, j) => (j && V && p.brV ? '<br>' : '') + `<span>${p.t}</span>`).join('');
      tl.appendChild(d); return d;
    });
    CUES = window.CUES || estimateCues(PLAN.vo || []);
  }
  // оценка субтитров до записи озвучки: ~14.5 символа/с; строки из vo[].subs или из текста
  function estimateCues(vo) {
    const out = [];
    vo.forEach(p => {
      const lines = p.subs || splitLines(p.text); let t = p.at;
      lines.forEach(l => { const d = Math.max(1.0, l.length / 14.5); out.push([+Math.max(0, t - .05).toFixed(2), +(t + d + .25).toFixed(2), l]); t += d + .15; });
    });
    for (let i = 0; i < out.length - 1; i++) if (out[i][1] > out[i + 1][0] - .04) out[i][1] = +(out[i + 1][0] - .04).toFixed(2);
    return out;
  }
  function splitLines(text, max = 56) {
    const out = [];
    (text.match(/[^.!?…]+[.!?…]*\s*/g) || [text]).forEach(s => {
      s = s.trim(); if (!s) return;
      if (s.length <= max) { out.push(s); return; }
      const mid = s.length / 2; let cuts = [...s.matchAll(/[,:;—–]\s/g)].map(m => m.index + m[0].length);
      if (!cuts.length) cuts = [...s.matchAll(/ /g)].map(m => m.index);
      const k = cuts.reduce((a, c) => Math.abs(c - mid) < Math.abs(a - mid) ? c : a, cuts[0]);
      out.push(...splitLines(s.slice(0, k), max), ...splitLines(s.slice(k), max));
    });
    return out;
  }
  function renderOverlays(t) {
    TITLES.forEach((T, i) => {
      const d = TEL[i], a = Math.min(...T.parts.map(p => p.at));
      const e = S.MEAS ? 0 : env(t, a, T.until, .35, .3);
      if (!show(d, e > 0)) return;
      d.style.opacity = e;
      d.style.transform = (V ? 'translateX(-50%) ' : '') + `translateY(${(1 - eout(lin(t, a, a + .4))) * 16}px)`;
      d.querySelectorAll('span').forEach((s, j) => { const p = eout(lin(t, T.parts[j].at, T.parts[j].at + .35)); s.style.opacity = .16 + .84 * p; s.style.transform = `translateY(${(1 - p) * 4}px)`; });
    });
    const sub = $('sub'); let cue = null;
    if (!S.MEAS && SUBS) for (const c of CUES) if (t >= c[0] && t < c[1]) cue = c;
    if (cue) { if (sub._c !== cue) { sub.textContent = cue[2]; sub._c = cue; } sub.style.opacity = env(t, cue[0], cue[1], .12, .12); }
    else sub.style.opacity = 0;
    const fd = $('fdim'), d = S.MEAS ? 0 : S.dim;
    fd.style.display = d > .001 ? 'block' : 'none'; fd.style.opacity = d;
  }
  function renderCamera(t) {
    const app = $('app'), app2 = $('app2'); if (!app) return;
    if (S.MEAS) { app.style.transform = 'none'; if (app2) app2.style.transform = 'none'; return; }
    const c = sample(S.KF, t, 3);
    if (c) { const [x, y, s] = c; app.style.transform = `translate(${S.anchor[0] - x * s}px,${S.anchor[1] - y * s}px) scale(${s})`; }
    if (app2) {                                    // верхний слой повторяет камеру и прозрачность окна
      app2.style.transform = app.style.transform; app2.style.opacity = app.style.opacity;
      if ($('stage') && $('stage2')) $('stage2').style.display = $('stage').style.display;
    }
  }
  function renderCursor(t) {
    const cu = $('cursor'); if (!cu) return;
    if (S.MEAS || !S.CUR.length) { cu.style.display = 'none'; return; }
    const [x, y, o] = sample(S.CUR, t, -1);
    let cl = 0; S.CLICKS.forEach(c => cl = Math.max(cl, bump(t, c - .06, c + .14)));
    if (!show(cu, o > .01)) { $('ripples').innerHTML = ''; $('ripples')._h = ''; return; }
    css(cu, { opacity: clamp(o), transform: `translate(${x - 6}px,${y - 4}px) scale(${1 - .16 * cl})` });
    let html = '';
    S.CLICKS.forEach(c => { const p = lin(t, c, c + .55); if (p > 0 && p < 1) { const [rx, ry] = sample(S.CUR, c, -1); html += `<div class="rip" style="left:${rx}px;top:${ry}px;transform:scale(${.25 + 1.3 * eout(p)});opacity:${(1 - p) * .9}"></div>`; } });
    const rp = $('ripples'); if (rp._h !== html) { rp.innerHTML = html; rp._h = html; }
  }

  function frame(t) {                              // t — исходное время сцены
    S.dim = 0;
    SCENE(t, API);
    renderCamera(t); renderCursor(t); renderOverlays(t);
  }
  function start(o) {
    SCENE = o.scene || SCENE;
    const fr = $('frame'); fr.style.width = W + 'px'; fr.style.height = H + 'px';
    if (o.build) o.build(API);
    buildOverlays();
    const imgs = [...document.images].map(i => i.decode().catch(() => {}));
    Promise.all([document.fonts.ready, ...imgs]).then(() => {
      if (o.setup) o.setup(API);
      S.MEAS = false; frame(0); window.READY = true;
      if (PREVIEW) previewBar();
    });
  }

  // ---------- превью в браузере (&preview=1): не участвует в рендере ----------
  function previewBar() {
    const fr = $('frame'), D = window.DURATION;
    const fit = () => { const k = Math.min(innerWidth / W, (innerHeight - 56) / H); fr.style.transformOrigin = '0 0'; fr.style.transform = `scale(${k})`; };
    fit(); addEventListener('resize', fit);
    document.documentElement.style.overflow = document.body.style.overflow = 'hidden';
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:56px;display:flex;gap:12px;align-items:center;padding:0 16px;background:#111;color:#fff;font:14px system-ui;z-index:999';
    bar.innerHTML = '<button id="pvPlay" style="width:72px;height:32px">▶</button><input id="pvT" type="range" min="0" step="0.0333" style="flex:1"><span id="pvL" style="width:110px;font-variant-numeric:tabular-nums"></span>';
    document.body.appendChild(bar);
    const r = $('pvT'), l = $('pvL'); r.max = D; let playing = false, t0 = 0, s0 = 0;
    const go = t => { r.value = t; l.textContent = `${(+t).toFixed(2)} / ${D.toFixed(1)} с`; window.render(+t); };
    r.oninput = () => { playing = false; $('pvPlay').textContent = '▶'; go(r.value); };
    $('pvPlay').onclick = () => { playing = !playing; $('pvPlay').textContent = playing ? '❚❚' : '▶'; t0 = performance.now(); s0 = +r.value >= D ? 0 : +r.value; if (playing) requestAnimationFrame(tick); };
    function tick(now) { if (!playing) return; const t = s0 + (now - t0) / 1000; if (t >= D) { playing = false; $('pvPlay').textContent = '▶'; go(D); return; } go(t); requestAnimationFrame(tick); }
    const qt = parseFloat(Q.get('t')); go(isNaN(qt) ? 0 : qt);
  }

  const API = {
    V, W, H, $, clamp, lin, eio, eout, lerp, env, bump, rng, fmtN, css, show, typed, blink, stagger, plural, grad, markup, sync,
    PLAN, DUR, FPS, rect, measureAt, start, toScene,
    get MEAS() { return S.MEAS; },
    CW, CH,                                             // размер полотна #app
    camera(kfH, kfV) { S.KF = V ? kfV : kfH; },       // [[t, x, y, scale]] в координатах #app (CW×CH)
    cursor(keys) { S.CUR = keys; },                     // [[t, x, y, opacity]]
    clicks(times) { S.CLICKS = times; },                // моменты кликов (курсор «вжимается» + рябь)
    anchor(a) { S.anchor = a; },                        // точка кадра, куда камера ставит свою цель
    dim(x) { S.dim = Math.max(S.dim, x); },             // затемнение всего кадра 0..1 (на этот кадр)
  };
  window.E = API;
  window.render = tn => frame(toScene(tn));
  window.DURATION = TMAP ? TMAP.duration : DUR; window.FPS = FPS; window.READY = false;
})();
