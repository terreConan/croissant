/* ASCII Christmas tree.
 *
 * A 3D point cloud (needles, garland, ornaments, star, presents) is rotated,
 * projected onto a grid of character cells with a z-buffer, and each winning
 * point is drawn as one coloured glyph. Points carry a birth time on a shared
 * timeline: the bare tree grows by itself on load, and scrolling through the
 * page sections advances the timeline to add the decorations.
 *
 * Ornaments, presents and the star are created from the page: every element
 * with a data-tree attribute gets one object, and the two are linked (click
 * the object to reach the card, hover the card to find the object).
 */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const glowCanvas = document.getElementById('glow');
  const glowCtx = glowCanvas.getContext('2d');
  const tip = document.getElementById('tip');

  // ---------------------------------------------------------------- rng
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(7);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  const uni = (a, b) => a + (b - a) * rnd();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------- scene
  const OCC = 0, NEEDLE = 1, SOLID = 2, LIGHT = 3, STAR = 4;
  const RAMPS = [
    [' '],
    // needles are written with the letters of "andrew shin", light to dense
    ['.', ':', 'i', 'r', 's', 'n', 'e', 'a', 'h', 'd', 'w'],
    [':', '=', '+', 'x', '%', '#', '@'],
    ['o', 'o', '0', '*'],
    ['+', '*', '*'],
  ];
  // vintage bulb colours
  const BULBS = [[1, 0.27, 0.2], [1, 0.68, 0.2], [0.35, 0.9, 0.42], [0.32, 0.55, 1], [1, 0.45, 0.72], [1, 0.94, 0.8]];
  const DRIFT = 0.6;                   // seconds a letter takes to settle into place
  const GROW = 1.1;                    // seconds an ornament or the star takes to swell in
  // how far each kind is pulled toward the camera in the depth test
  const BIAS = [0, 0, 0.02, 0.07, 0.1];

  const Y0 = 0.45, Y1 = 2.45;          // needle span (world units, y up)
  const GROUND_R = 1.7;
  const STAR_Y = Y1 + 0.17;

  // timeline (seconds). Up to T_GARLAND plays on load; the rest follows scroll.
  const T_TRUNK = 0.3, T_TREE = 0.6, TREE_DUR = 3.3;
  const T_GARLAND = 4.9, GARLAND_DUR = 1.4;
  const T_BLUE = 6.95, T_RED = 8.05, T_GOLD = 9.15, ORN_SPAN = 0.4;
  const T_GIFTS = 10.25, GIFT_SPAN = 1.0;
  const T_STAR = 12.3, T_DONE = 13.4;
  const SECTIONS = [
    ['about', T_GARLAND, 6.9],
    ['education', 6.9, 8.0],
    ['experience', 8.0, 9.1],
    ['honors', 9.1, 10.2],
    ['projects', 10.2, 12.1],
    ['contact', 12.1, T_DONE],
  ].map(([id, a, b]) => ({ el: document.getElementById(id), a, b })).filter((s) => s.el);

  const env = (h) => {
    const tier = 1 - ((h * 6) % 1);
    return 0.9 * Math.pow(1 - h, 0.8) * (0.72 + 0.28 * tier) + 0.02;
  };

  // x y z | nx ny nz | r g b | birth kind seed object
  const STRIDE = 13;
  const pts = [];
  let curObj = 0;
  const add = (x, y, z, nx, ny, nz, r, g, b, birth, kind) => {
    pts.push(x, y, z, nx, ny, nz, r, g, b, birth, kind, rnd(), curObj);
  };
  const unit = (x, y, z) => {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  const fib = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const th = Math.PI * (3 - Math.sqrt(5)) * i;
      out.push([r * Math.cos(th), y, r * Math.sin(th)]);
    }
    return out;
  };
  const treeH = () => (rnd() < 0.78 ? 1 - Math.sqrt(rnd()) : rnd());

  // objects linked to page elements; a point's object field is index + 1
  const objects = [];
  const TYPE_NAME = { 'ornament-blue': 'education', 'ornament-red': 'experience', 'ornament-gold': 'honor', present: 'project', star: 'contact' };
  const link = (el, type, color, pos, azimuth, birth) => {
    const heading = el.querySelector('h3, h2');
    const label = el.dataset.label || (heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '');
    const accent = `rgb(${color.map((c) => Math.round(Math.min(1, c * 1.1) * 255)).join(',')})`;
    el.style.setProperty('--accent', accent);
    objects.push({ el, type, label, accent, pos, azimuth, birth, soft: type !== 'present' });
    curObj = objects.length;
  };
  const linked = (type) => [...document.querySelectorAll(`[data-tree="${type}"]`)];

  let lightTimes = [];

  function build() {
    // --- trunk
    for (let i = 0; i < 1400; i++) {
      const a = rnd() * TAU, y = rnd() * (Y0 + 0.15);
      const bark = 0.75 + 0.25 * Math.sin(y * 90 + a * 3);
      add(0.075 * Math.cos(a), y, 0.075 * Math.sin(a), Math.cos(a), 0, Math.sin(a),
        0.36 * bark, 0.22 * bark, 0.12 * bark, T_TRUNK + y * 0.8, SOLID);
    }

    // --- needles: branches that rise a little, then droop toward the tip
    for (let br = 0; br < 520; br++) {
      const h = treeH();
      const a = rnd() * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const L = env(h), yb = Y0 + h * (Y1 - Y0);
      const n = Math.round(26 + 95 * L);
      for (let i = 0; i < n; i++) {
        const s = Math.pow(rnd(), 0.6);
        const side = gauss() * 0.05 * (0.35 + s) * (0.4 + L);
        const rad = s * L + gauss() * 0.02;
        const y = yb + 0.1 * L * s - 0.3 * L * s * s + gauss() * 0.025;
        const x = rad * ca - side * sa, z = rad * sa + side * ca;
        const nrm = unit(ca * 0.75 + gauss() * 0.3, 0.55 + gauss() * 0.3, sa * 0.75 + gauss() * 0.3);
        const birth = T_TREE + TREE_DUR * (0.86 * h + 0.14 * (a / TAU)) + gauss() * 0.04;
        if (s > 0.5 && rnd() < 0.035 * s) {
          add(x, y, z, 0, 1, 0, 0.96, 0.93, 0.88, birth, NEEDLE);  // frost on the tips
          continue;
        }
        const ao = 0.35 + 0.65 * Math.pow(s, 1.3);
        const tone = ao * uni(0.75, 1.1);
        const tip = Math.pow(rnd(), 3) * 0.6;
        add(x, y, z, nrm[0], nrm[1], nrm[2],
          (0.09 + 0.3 * tip) * tone, (0.46 + 0.3 * tip) * tone, (0.31 + 0.12 * tip) * tone,
          birth, NEEDLE);
      }
    }

    // --- invisible inner cone so the far side doesn't show through the gaps
    for (let i = 0; i < 16000; i++) {
      const h = treeH(), a = rnd() * TAU, rad = 0.6 * env(h) * Math.sqrt(uni(0.5, 1));
      add(rad * Math.cos(a), Y0 + h * (Y1 - Y0) - 0.06, rad * Math.sin(a), 0, 1, 0,
        0, 0, 0, T_TREE + TREE_DUR * h, OCC);
    }

    // --- lights: two strands of coloured bulbs wound opposite ways
    lightTimes = [];
    const bulb = (x, y, z, birth, pal) => {
      lightTimes.push(birth);
      const c = BULBS[pal];
      add(x, y, z, pal, 1, 0, c[0], c[1], c[2], birth, LIGHT);   // nx carries the palette index
    };
    for (let strand = 0; strand < 2; strand++) {
      const dir = strand ? -1 : 1;
      for (let i = 0; i < 75; i++) {
        const u = (i + 0.5) / 75, h = 0.05 + 0.82 * u, L = env(h);
        const ag = dir * TAU * 2.7 * u + strand * 2.1;
        const sag = -0.05 * Math.abs(Math.sin(ag * 2.5));
        bulb(0.96 * L * Math.cos(ag), Y0 + h * (Y1 - Y0) - 0.17 * L + sag, 0.96 * L * Math.sin(ag),
          T_GARLAND + GARLAND_DUR * (0.5 * strand + 0.5 * u), (i + strand * 3) % BULBS.length);
      }
    }
    for (let i = 0; i < 20; i++) {             // a few loose ones
      const h = uni(0.05, 0.9), a = rnd() * TAU, L = env(h) * 0.9;
      bulb(L * Math.cos(a), Y0 + h * (Y1 - Y0) - 0.15 * L, L * Math.sin(a), T_GARLAND + rnd() * GARLAND_DUR, 5);
    }
    lightTimes.sort((a, b) => a - b);

    // --- ornaments: one per linked card, the colours interleaved up the tree
    const sets = [
      ['ornament-blue', [0.3, 0.52, 0.95], T_BLUE],
      ['ornament-red', [0.86, 0.1, 0.12], T_RED],
      ['ornament-gold', [0.95, 0.68, 0.18], T_GOLD],
    ].map(([type, col, t0]) => linked(type).map((el, j, all) =>
      ({ el, type, col, birth: t0 + ((j + 0.5) / all.length) * ORN_SPAN })));
    const orns = [];
    for (let i = 0; i < Math.max(...sets.map((set) => set.length)); i++) {
      for (const set of sets) if (set[i]) orns.push(set[i]);
    }
    orns.forEach((orn, k) => {
      const h = 0.78 - 0.68 * ((k + 0.5) / orns.length), a = k * 2.39996 + 0.4;
      const L = env(h), rad = 0.072 + 0.04 * (1 - h);
      const cx = 0.97 * L * Math.cos(a), cz = 0.97 * L * Math.sin(a);
      const cy = Y0 + h * (Y1 - Y0) - 0.2 * L - rad * 0.6;
      link(orn.el, orn.type, orn.col, [cx, cy, cz], a, orn.birth);
      for (const d of fib(Math.round(260 + 5200 * rad))) {
        add(cx + d[0] * rad, cy + d[1] * rad, cz + d[2] * rad, d[0], d[1], d[2],
          orn.col[0], orn.col[1], orn.col[2], orn.birth, SOLID);
      }
      curObj = 0;
    });

    // --- star: a flat five-pointed star that always faces the viewer
    const starEl = linked('star')[0];
    if (starEl) link(starEl, 'star', [1.0, 0.82, 0.3], [0, STAR_Y, 0], null, T_STAR);
    const RO = 0.2, RI = 0.08, BETA = TAU / 10;
    for (let i = 0; i < 2600; i++) {
      const th = rnd() * TAU;
      const fold = (((th - Math.PI / 2) % (2 * BETA)) + 2 * BETA) % (2 * BETA);
      const phi = fold > BETA ? 2 * BETA - fold : fold;
      const edge = (RO * RI * Math.sin(BETA)) / (RI * Math.sin(BETA - phi) + RO * Math.sin(phi));
      const r = Math.sqrt(rnd()) * edge, core = 1 - 0.3 * (r / RO);
      add(r * Math.cos(th), STAR_Y + r * Math.sin(th), 0, 0, 0, -1, 1.0 * core, 0.84 * core, 0.36 * core, T_STAR, STAR);
    }
    curObj = 0;

    // --- presents: one per linked card, spaced around the base
    const WRAP = [
      { w: 0.38, h: 0.29, d: 0.32, c: [0.82, 0.1, 0.1], rb: [0.95, 0.75, 0.25] },
      { w: 0.34, h: 0.22, d: 0.28, c: [0.14, 0.3, 0.85], rb: [0.95, 0.78, 0.3] },
      { w: 0.28, h: 0.19, d: 0.28, c: [0.9, 0.9, 0.94], rb: [0.85, 0.1, 0.12] },
      { w: 0.26, h: 0.24, d: 0.26, c: [0.9, 0.66, 0.16], rb: [0.8, 0.1, 0.1] },
      { w: 0.28, h: 0.34, d: 0.26, c: [0.5, 0.06, 0.4], rb: [0.92, 0.92, 0.95] },
      { w: 0.24, h: 0.17, d: 0.24, c: [0.1, 0.55, 0.3], rb: [0.9, 0.2, 0.2] },
    ];
    const presents = linked('present');
    presents.forEach((el, gi) => {
      const gf = WRAP[gi % WRAP.length];
      const a = 3.9 + (gi * TAU) / presents.length + uni(-0.15, 0.15);
      const dist = 1.02 + uni(-0.04, 0.06);
      const px = dist * Math.cos(a), pz = dist * Math.sin(a);
      const rot = a + uni(-0.5, 0.5), cr = Math.cos(rot), sr = Math.sin(rot);
      const t0 = T_GIFTS + (gi / presents.length) * GIFT_SPAN;
      link(el, 'present', gf.c, [px, gf.h / 2, pz], a, t0);
      const put = (lx, ly, lz, nx, ny, nz, col) => {
        add(px + lx * cr - lz * sr, ly, pz + lx * sr + lz * cr,
          nx * cr - nz * sr, ny, nx * sr + nz * cr, col[0], col[1], col[2],
          t0 + 0.6 * (ly / gf.h), SOLID);
      };
      const ribbon = (u, v) => (Math.abs(u - 0.5) < 0.085 || Math.abs(v - 0.5) < 0.085 ? gf.rb : gf.c);
      const dens = 9000;
      for (let i = 0; i < dens * gf.w * gf.d; i++) {           // top
        const u = rnd(), v = rnd();
        put((u - 0.5) * gf.w, gf.h, (v - 0.5) * gf.d, 0, 1, 0, ribbon(u, v));
      }
      for (let s = 0; s < 4; s++) {                            // sides
        const alongX = s < 2, sign = s % 2 ? 1 : -1;
        const span = alongX ? gf.w : gf.d;
        for (let i = 0; i < dens * span * gf.h; i++) {
          const u = rnd(), v = rnd();
          const col = Math.abs(u - 0.5) < 0.085 ? gf.rb : gf.c;
          if (alongX) put((u - 0.5) * gf.w, v * gf.h, sign * gf.d / 2, 0, 0, sign, col);
          else put(sign * gf.w / 2, v * gf.h, (u - 0.5) * gf.d, sign, 0, 0, col);
        }
      }
      for (const side of [-1, 1]) {                            // bow
        for (const d of fib(90)) {
          put(side * 0.035 + d[0] * 0.035, gf.h + 0.02 + d[1] * 0.022, d[2] * 0.03, d[0], d[1], d[2], gf.rb);
        }
      }
      curObj = 0;
    });
  }

  build();
  const N = pts.length / STRIDE;
  const P = new Float32Array(pts);
  pts.length = 0;

  // -------------------------------------------------------------- snow
  const FLAKES = 150;
  const flakes = new Float32Array(FLAKES * 5);       // x, y, speed, size, phase
  for (let i = 0; i < FLAKES; i++) {
    const depth = rnd();
    flakes.set([rnd(), rnd(), 0.006 + 0.03 * depth * depth, depth, rnd() * TAU], i * 5);
  }

  // ------------------------------------------------------------ camera
  const CAM_D = 6.2, PITCH = (16 * Math.PI) / 180, TARGET_Y = 1.38;
  const CP = Math.cos(PITCH), SP = Math.sin(PITCH);
  const CAM_Y = TARGET_Y + CAM_D * Math.tan(PITCH);
  const LIGHT_DIR = unit(-0.45, 0.72, -0.55);

  let W = 0, H = 0, dpr = 1, cellW = 6, cellH = 10, cols = 0, rows = 0, focal = 1;
  let originX = 0, originY = 0;        // where the tree's look-at point lands on screen
  let zbuf, ibuf, groundR, groundHash;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    glowCanvas.width = Math.max(1, Math.round(W / 4));
    glowCanvas.height = Math.max(1, Math.round(H / 4));

    // wide: tree on the left, text on the right. narrow: tree up top, text over it.
    const wide = W >= 900;
    originX = wide ? W * 0.31 : W * 0.5;
    originY = wide ? H * 0.5 : H * 0.36;
    focal = wide ? Math.min(1.68 * H, 3.3 * W * 0.52) : Math.min(1.2 * H, 3.3 * W);
    cellH = Math.max(5, (focal * 0.4) / 64);
    cellW = cellH * 0.6;
    cols = Math.ceil(W / cellW); rows = Math.ceil(H / cellH);
    zbuf = new Float32Array(cols * rows);
    ibuf = new Int32Array(cols * rows);
    groundR = new Float32Array(cols * rows);
    groundHash = new Float32Array(cols * rows);

    // ray-cast every cell onto the ground plane once; the disc is static
    const h = mulberry32(99);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = ((c + 0.5) * cellW - originX) / focal;
        const v = -((r + 0.5) * cellH - originY) / focal;
        const dy = v * CP - SP;
        let rad = -1;
        if (dy < -1e-4) {
          const t = -CAM_Y / dy;
          const d = Math.hypot(u * t, -CAM_D + t * (v * SP + CP));
          if (d < GROUND_R) rad = d;
        }
        groundR[r * cols + c] = rad;
        groundHash[r * cols + c] = h();
      }
    }
    readScroll();
  }

  // world point (already spun) -> screen pixels
  function project(x, y, z) {
    const qy = y - CAM_Y, qz = z + CAM_D, zc = -qy * SP + qz * CP;
    return [originX + (x * focal) / zc, originY - ((qy * CP + qz * SP) * focal) / zc];
  }

  // ------------------------------------------------------------ sprites
  const sprite = (r, g, b) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
    gr.addColorStop(0.35, `rgba(${r},${g},${b},0.16)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return c;
  };
  const warmGlow = sprite(255, 196, 100);
  const whiteGlow = sprite(255, 250, 240);
  const bulbGlow = BULBS.map((c) => sprite(...c.map((v) => Math.round(v * 255))));

  const colorCache = new Map();
  const css = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let s = colorCache.get(key);
    if (!s) { s = `rgb(${r & 0xf8},${g & 0xf8},${b & 0xf8})`; colorCache.set(key, s); }
    return s;
  };

  // ------------------------------------------------------------- state
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BASE_SPIN = reduced ? 0.08 : 0.33;
  // ?t=13 holds the timeline at least that far along (handy when tuning)
  const floorT = parseFloat(new URLSearchParams(location.search).get('t')) || 0;
  const AUTO_END = T_GARLAND - 0.05;
  let t = floorT;            // timeline position
  let autoT = reduced ? AUTO_END : 0;   // the part that plays by itself
  let scrollT = 0;           // how far the page scroll has pushed the timeline
  let clock = 0;             // wall time, for twinkle and snow
  let angle = 0, spin = BASE_SPIN, last = 0;
  let dragging = false, dragX = 0, dragV = 0, downX = 0, downY = 0, moved = false;
  let hoverObj = null;       // object under the pointer
  let focusObj = null;       // object whose card is hovered or focused
  const visLights = [];

  function readScroll() {
    const vh = window.innerHeight;
    let s = 0;
    for (const sec of SECTIONS) {
      const p = clamp((vh * 0.9 - sec.el.getBoundingClientRect().top) / (vh * 0.55), 0, 1);
      if (p > 0) s = Math.max(s, sec.a + p * (sec.b - sec.a));
    }
    const doc = document.documentElement;
    if (SECTIONS.length && vh + window.scrollY >= doc.scrollHeight - 2) s = T_DONE;
    scrollT = s;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    clock += dt;

    autoT = Math.min(AUTO_END, autoT + dt);
    const target = Math.max(autoT, scrollT, floorT);
    if (reduced) t = target;
    else if (target > t) t += Math.min(target - t, dt * (1 + Math.min(1.5, (target - t) * 0.4)));  // real time, a little faster when far behind
    else t += (target - t) * Math.min(1, dt * 8);                // un-build quickly

    if (!dragging) {
      if (focusObj && focusObj.azimuth !== null && focusObj.birth <= t) {
        // turn the linked object toward the camera
        const want = focusObj.azimuth + Math.PI / 2;
        const d = ((((want - angle) % TAU) + TAU * 1.5) % TAU) - Math.PI;
        angle += d * Math.min(1, dt * 4);
        spin = 0;
      } else {
        angle += spin * dt;
        spin += ((hoverObj ? 0 : BASE_SPIN) - spin) * Math.min(1, dt * (hoverObj ? 8 : 1.2));
      }
    }
    render();
    requestAnimationFrame(frame);
  }

  function render() {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const fx = focal / cellW, fy = focal / cellH, ccx = originX / cellW, ccy = originY / cellH;
    zbuf.fill(Infinity); ibuf.fill(-1);

    // project
    for (let i = 0, o = 0; i < N; i++, o += STRIDE) {
      const age = t - P[o + 9];
      if (age < 0) continue;
      const kind = P[o + 10];
      let wx = P[o], wy = P[o + 1], wz = P[o + 2];
      const obj = P[o + 12] > 0 ? objects[P[o + 12] - 1] : null;
      if (obj && obj.soft) {
        if (age < GROW) {
          const k = 1 - age / GROW, sc = 1 - k * k * k;
          wx = obj.pos[0] + (wx - obj.pos[0]) * sc;
          wy = obj.pos[1] + (wy - obj.pos[1]) * sc;
          wz = obj.pos[2] + (wz - obj.pos[2]) * sc;
        }
      } else if (age < DRIFT && kind !== OCC) {
        // letters swirl in from above and outside, then settle
        const k = 1 - age / DRIFT, e = k * k * k, seed = P[o + 11];
        const cs = Math.cos(e * 1.8), sn = Math.sin(e * 1.8), grow = 1 + e * 0.9;
        const rx = wx * cs - wz * sn, rz = wx * sn + wz * cs;
        wx = rx * grow + e * 0.35 * Math.cos(seed * 50);
        wz = rz * grow + e * 0.35 * Math.sin(seed * 50);
        wy += e * (0.2 + 0.7 * seed);
      }
      const still = kind === STAR;          // the star doesn't spin with the tree
      const x = still ? wx : wx * ca + wz * sa, z = still ? wz : -wx * sa + wz * ca;
      const qy = wy - CAM_Y, qz = z + CAM_D;
      const zc = -qy * SP + qz * CP;
      if (zc < 0.2) continue;
      const c = Math.floor(ccx + (x * fx) / zc);
      const r = Math.floor(ccy - ((qy * CP + qz * SP) * fy) / zc);
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      const cell = r * cols + c, zz = zc - BIAS[kind];
      if (zz < zbuf[cell]) { zbuf[cell] = zz; ibuf[cell] = i; }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // snow behind the glyphs
    for (let i = 0, o = 0; i < FLAKES; i++, o += 5) {
      const depth = flakes[o + 3];
      const y = (flakes[o + 1] + flakes[o + 2] * clock) % 1;
      const x = flakes[o] + 0.006 * Math.sin(clock * 0.5 + flakes[o + 4]);
      const px = x * W, py = y * H;
      const cell = Math.floor(py / cellH) * cols + Math.floor(px / cellW);
      if (depth < 0.85 && ibuf[cell] >= 0) continue;
      const tw = 0.55 + 0.45 * Math.sin(clock * (0.6 + depth) + flakes[o + 4] * 3);
      const s = 0.8 + 1.5 * depth * depth;
      ctx.fillStyle = `rgba(244,236,222,${(0.15 + 0.6 * depth) * tw})`;
      ctx.fillRect(px, py, s, s);
    }

    ctx.font = `bold ${(cellH * 1.08).toFixed(2)}px "SF Mono", ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const reveal = GROUND_R * Math.min(1, 1 - Math.pow(1 - Math.min(1, t / 1.4), 3));
    let lit = 0;
    while (lit < lightTimes.length && lightTimes[lit] <= t) lit++;
    const warm = lit / lightTimes.length;
    const hl = hoverObj || focusObj;
    const hlId = hl ? objects.indexOf(hl) + 1 : -1;
    const hlPulse = 0.5 + 0.5 * Math.sin(clock * 6);
    visLights.length = 0;

    for (let r = 0, cell = 0; r < rows; r++) {
      const py = (r + 0.5) * cellH;
      for (let c = 0; c < cols; c++, cell++) {
        const i = ibuf[cell];
        const px = (c + 0.5) * cellW;
        if (i < 0) {
          // a soft drift of snow, stippled, thinning toward the edge
          const gr = groundR[cell];
          if (gr < 0 || gr > reveal) continue;
          const hh = groundHash[cell];
          const dens = 0.62 * Math.exp(-Math.pow(gr / 0.85, 2)) + 0.05 * (1 - gr / GROUND_R);
          if (hh > dens) continue;
          const b = 0.4 + 0.6 * (1 - gr / GROUND_R);
          ctx.fillStyle = css((b * (228 + 20 * warm)) | 0, (b * 222) | 0, (b * (214 - 24 * warm)) | 0);
          ctx.fillText(hh < dens * 0.08 ? '*' : hh < dens * 0.5 ? ':' : '.', px, py);
          continue;
        }
        const o = i * STRIDE, kind = P[o + 10];
        if (kind === OCC) continue;
        const seed = P[o + 11];
        const nx = P[o + 3] * ca + P[o + 5] * sa, nz = -P[o + 3] * sa + P[o + 5] * ca;
        const d = Math.max(0, nx * LIGHT_DIR[0] + P[o + 4] * LIGHT_DIR[1] + nz * LIGHT_DIR[2]);
        const age = t - P[o + 9];
        const soft = P[o + 12] > 0 && objects[P[o + 12] - 1].soft;
        const flash = soft ? 0 : Math.max(0, 1 - age / DRIFT);
        const fade = soft ? Math.min(1, age / GROW) : 1;      // soft objects fade up, no ember
        let lum, spec = 0, level;

        if (kind === NEEDLE) {
          lum = 0.8 + 1.05 * d;
          level = d * 0.6 + seed * 0.55;
        } else if (kind === SOLID) {
          lum = 0.32 + 0.85 * d;
          spec = Math.pow(d, 24) * 0.7;
          level = 0.25 + d * 0.6 + seed * 0.25;
        } else {
          const tw = kind === STAR ? 0.9 + 0.1 * Math.sin(clock * 3 + seed * 9)
            : 0.62 + 0.38 * Math.sin(clock * (2 + 3 * seed) + seed * 40);
          lum = tw; level = seed;
          if (kind === LIGHT) visLights.push(px, py, tw, P[o + 3]);
        }
        if (P[o + 12] === hlId) {            // linked object under attention
          lum = lum * 1.3 + 0.15;
          spec += 0.1 + 0.14 * hlPulse;
          level += 0.2;
        }
        lum *= fade; spec *= fade;
        level = Math.min(0.999, level + flash * 0.5);
        const f = flash * flash * 0.85;      // letters arrive as warm embers, then take their colour
        const R = Math.min(255, ((P[o + 6] * lum + spec) * (1 - f) + f) * 255) | 0;
        const G = Math.min(255, ((P[o + 7] * lum + spec) * (1 - f) + f * 0.74) * 255) | 0;
        const B = Math.min(255, ((P[o + 8] * lum + spec) * (1 - f) + f * 0.42) * 255) | 0;
        const ramp = RAMPS[kind];
        ctx.fillStyle = css(R, G, B);
        ctx.fillText(ramp[(level * ramp.length) | 0], px, py);
      }
    }

    // additive glows: bulbs, the highlighted object, then the star and its rays
    ctx.globalCompositeOperation = 'lighter';
    const gs = cellH * 5.5;
    for (let i = 0; i < visLights.length; i += 4) {
      ctx.globalAlpha = visLights[i + 2] * 0.8;
      ctx.drawImage(bulbGlow[visLights[i + 3]], visLights[i] - gs / 2, visLights[i + 1] - gs / 2, gs, gs);
    }
    if (hl && hl.type !== 'star' && hl.birth <= t) {
      const [x, y, z] = hl.pos;
      const zr = -x * sa + z * ca;
      if (zr < 0.25) {                       // only when it's on the near side
        const [sx, sy] = project(x * ca + z * sa, y, zr);
        const size = cellH * (hl.type === 'present' ? 20 : 13);
        ctx.globalAlpha = 0.5 + 0.3 * hlPulse;
        ctx.drawImage(whiteGlow, sx - size / 2, sy - size / 2, size, size);
      }
    }
    if (t > T_STAR) {
      const k = Math.pow(Math.min(1, (t - T_STAR) / 1.6), 2) * (hl && hl.type === 'star' ? 1.3 : 1);
      const [sx, sy] = project(0, STAR_Y, 0);
      const size = cellH * 17 * k * (0.9 + 0.1 * Math.sin(clock * 2.4));
      ctx.globalAlpha = Math.min(1, 0.85 * k);
      ctx.drawImage(warmGlow, sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowCtx.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
  }

  // ------------------------------------------------------- interaction
  // which linked object is drawn at (or right next to) this screen position
  function pick(px, py) {
    const c0 = Math.floor(px / cellW), r0 = Math.floor(py / cellH);
    let best = null, bestD = 99;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const c = c0 + dc, r = r0 + dr;
        if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
        const i = ibuf[r * cols + c];
        if (i < 0) continue;
        const id = P[i * STRIDE + 12];
        const d = dr * dr + dc * dc * 0.36;
        if (id > 0 && d < bestD) { bestD = d; best = objects[id - 1]; }
      }
    }
    return best;
  }

  function setHover(obj, x, y) {
    hoverObj = obj;
    canvas.classList.toggle('pointing', !!obj);
    tip.classList.toggle('on', !!obj);
    if (!obj) return;
    tip.textContent = obj.label ? `${TYPE_NAME[obj.type]} · ${obj.label}` : TYPE_NAME[obj.type];
    tip.style.setProperty('--accent', obj.accent);
    tip.style.left = `${Math.min(x + 14, W - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.max(8, y - 34)}px`;
  }

  function activate(obj) {
    const calm = reduced ? 'auto' : 'smooth';
    obj.el.scrollIntoView({ behavior: calm, block: 'center' });
    obj.el.classList.add('is-lit');
    setTimeout(() => obj.el.classList.remove('is-lit'), 2200);
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    dragX = downX = e.clientX; downY = e.clientY; dragV = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) {
      if (e.pointerType === 'mouse') setHover(pick(e.clientX, e.clientY), e.clientX, e.clientY);
      return;
    }
    if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) < 6) return;
    if (!moved) { moved = true; setHover(null); canvas.classList.add('dragging'); }
    const dx = e.clientX - dragX;
    dragX = e.clientX;
    angle -= dx * 0.008;
    dragV = -dx * 0.008 * 60;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('dragging');
    if (moved) { spin = clamp(dragV || BASE_SPIN, -6, 6); return; }
    const obj = pick(e.clientX, e.clientY);
    if (obj) activate(obj);
  });
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('pointerleave', () => { if (!dragging) setHover(null); });

  for (const obj of objects) {
    const on = () => { focusObj = obj; };
    const off = () => { if (focusObj === obj) focusObj = null; };
    obj.el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); });
    obj.el.addEventListener('pointerleave', off);
    obj.el.addEventListener('focus', on);
    obj.el.addEventListener('blur', off);
  }

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) { t = 0; autoT = 0; }
  });
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });
})();
