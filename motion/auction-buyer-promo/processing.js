/* product-motion · processing.js — нейтральная анимация «система работает» для экрана обработки.
 *
 * Точки слетаются из хаоса в два кольца вокруг ядра, кольца медленно вращаются, по внешнему бежит
 * блик цвета --accent, в ядро влетают карточки-источники (документы, записи, файлы) и растворяются.
 * Всё — функция времени t, без таймеров и случайности во время render.
 *
 *   <svg id="pviz" class="pviz"></svg>             — в #app2, внутри .proc
 *   const PV = Processing(E.$('pviz'));             — в build(E)
 *   PV.render(t, T0, TD);                           — в scene(t, E)
 *      T0 — начало сборки (≈ 0.4 с после затемнения); вращение и блик — с T0 + 2
 *      TD — когда влетают карточки (под слово озвучки: E.sync('p5:каталогом', …) − .3)
 * Опции: Processing(svg, {light:true}) — графит на светлом, если экран обработки не тёмный; {seed, cards:6}.
 * Для продукта с собственным лоадером лучше повторить его (структуру и движение) — это просто запасной вариант.
 */
(function () {
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lin = (t, a, b) => clamp((t - a) / (b - a));
  const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const lerp = (a, b, p) => a + (b - a) * p;

  window.Processing = function (svg, opt = {}) {
    const light = !!opt.light;
    const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#4F5BD5').trim();
    const C = {
      node: light ? '#1D2026' : '#FFFFFF', amb: light ? 'rgba(29,32,38,.3)' : 'rgba(255,255,255,.45)',
      edge: light ? '#1D2026' : '#FFFFFF', core: light ? 'rgba(29,32,38,.08)' : 'rgba(255,255,255,.08)',
      cardFill: light ? '#FFFFFF' : 'rgba(255,255,255,.06)', cardLine: light ? '#5D6470' : 'rgba(255,255,255,.6)', cardText: light ? '#C9CED5' : 'rgba(255,255,255,.4)',
    };
    const VW = 520, VH = 360, cx = 260, cy = 180;
    const R = rng(opt.seed || 7), P = [], E = [], RINGS = [[112, 20, 1], [64, 12, -1]];
    RINGS.forEach(([r, n, dir], ri) => { for (let i = 0; i < n; i++) P.push({ k: 'ring', ri, r, a0: i * 2 * Math.PI / n, dir, idx: i, n }); });
    for (let i = 0; i < 18; i++) P.push({ k: 'amb' });
    P.forEach(p => { p.sx = -40 + R() * (VW + 80); p.sy = -40 + R() * (VH + 80); p.d = R() * .55; p.ph = R() * 6.28; if (p.k === 'amb') { p.sx = R() * VW; p.sy = R() * VH; } });
    let base = 0;
    RINGS.forEach(([, n]) => { for (let i = 0; i < n; i++) E.push([base + i, base + (i + 1) % n, .55]); base += n; });
    for (let i = 0; i < RINGS[1][1]; i++) E.push([RINGS[0][1] + i, Math.round(i * RINGS[0][1] / RINGS[1][1]), .22]);   // спицы между кольцами

    const ns = 'http://www.w3.org/2000/svg';
    svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
    const gl = document.createElementNS(ns, 'g'), gc = document.createElementNS(ns, 'g'), gp = document.createElementNS(ns, 'g');
    svg.append(gl, gc, gp);
    const core = document.createElementNS(ns, 'circle'); core.setAttribute('cx', cx); core.setAttribute('cy', cy); core.setAttribute('fill', C.core); gl.appendChild(core);
    const halo = document.createElementNS(ns, 'circle'); halo.setAttribute('r', 15); halo.setAttribute('fill', accent); gp.appendChild(halo);
    E.forEach(e => { const l = document.createElementNS(ns, 'line'); l.setAttribute('stroke', C.edge); l.setAttribute('stroke-width', '1.4'); gl.appendChild(l); e.el = l; });
    P.forEach(p => { const c = document.createElementNS(ns, 'circle'); c.setAttribute('fill', p.k === 'amb' ? C.amb : C.node); gp.appendChild(c); p.el = c; });
    const CARDS = [];
    for (let i = 0; i < (opt.cards || 6); i++) {
      const g = document.createElementNS(ns, 'g');
      g.innerHTML = `<rect x="-14" y="-18" width="28" height="36" rx="5" fill="${C.cardFill}" stroke="${C.cardLine}" stroke-width="1.4"/><path d="M-8 -8h16M-8 -1h16M-8 6h10" stroke="${C.cardText}" stroke-width="2" stroke-linecap="round"/>`;
      gc.appendChild(g); CARDS.push({ el: g, i, sx: i % 2 ? VW + 40 : -40, sy: 40 + R() * (VH - 80) });
    }

    function render(t, T0, TD) {
      const TG = T0 + 2, pts = [];
      P.forEach(p => {
        const dx = p.sx + 16 * Math.sin(t * .8 + p.ph), dy = p.sy + 12 * Math.cos(t * .7 + p.ph);
        let x = dx, y = dy, a = 0;
        if (p.k === 'ring') {
          a = eio(clamp((t - T0 - p.d) / 1.5));
          const spin = p.dir * .16 * Math.max(0, t - TG) + p.dir * .1 * Math.sin((t - T0) * .5);
          const ang = p.a0 + spin, wob = 1 + .015 * Math.sin(t * 2 + p.ph);
          x = lerp(dx, cx + p.r * wob * Math.cos(ang), a); y = lerp(dy, cy + p.r * wob * Math.sin(ang), a);
        }
        pts.push([x, y, a]);
        const op = p.k === 'amb' ? .5 : .3 + .7 * a;
        p.el.setAttribute('cx', x.toFixed(1)); p.el.setAttribute('cy', y.toFixed(1)); p.el.setAttribute('r', p.k === 'amb' ? 2.2 : (p.ri ? 3 : 3.6)); p.el.setAttribute('opacity', op.toFixed(2));
      });
      // ядро «дышит»
      const ca = eio(lin(t, T0 + .6, T0 + 1.6));
      core.setAttribute('r', (40 * ca * (1 + .06 * Math.sin(t * 3))).toFixed(1)); core.setAttribute('opacity', ca.toFixed(2));
      // блик цвета --accent бежит по внешнему кольцу
      const n0 = RINGS[0][1], gOn = lin(t, TG, TG + .4), k = Math.floor((((t - TG) * 7) % n0 + n0) % n0), gp_ = pts[k];
      halo.setAttribute('cx', gp_[0].toFixed(1)); halo.setAttribute('cy', gp_[1].toFixed(1)); halo.setAttribute('opacity', (.55 * gOn).toFixed(2));
      P[k].el.setAttribute('r', (3.6 + 2.2 * gOn).toFixed(2));
      E.forEach(e => {
        const A = pts[e[0]], B = pts[e[1]], near = (e[0] === k || e[1] === k) && gOn > 0;
        const o = Math.min(A[2], B[2]) * e[2] * (near ? 1.6 : .85);
        e.el.setAttribute('x1', A[0].toFixed(1)); e.el.setAttribute('y1', A[1].toFixed(1)); e.el.setAttribute('x2', B[0].toFixed(1)); e.el.setAttribute('y2', B[1].toFixed(1)); e.el.setAttribute('opacity', o.toFixed(2));
      });
      // карточки-источники влетают в ядро
      CARDS.forEach(d => {
        const t0 = TD + d.i * .33, p = lin(t, t0, t0 + 1.1);
        if (p <= 0 || p >= 1) { d.el.setAttribute('opacity', 0); return; }
        const e = eio(p), x = lerp(d.sx, cx, e), y = lerp(d.sy, cy, e), s = 1 - .75 * e;
        d.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${s.toFixed(3)})`);
        d.el.setAttribute('opacity', (Math.min(1, p * 4) * (1 - eio(lin(p, .7, 1)))).toFixed(2));
      });
    }
    return { render };
  };
})();
