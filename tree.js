/* ASCII Christmas tree.
 *
 * A 3D point cloud (needles, garland, ornaments, star, presents) is rotated,
 * projected onto a grid of character cells with a z-buffer, and each winning
 * point is drawn as one coloured glyph. Points carry a birth time, so the
 * scene assembles itself bottom-up before settling into a slow spin.
 */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const glowCanvas = document.getElementById('glow');
  const glowCtx = glowCanvas.getContext('2d');
  const hudTime = document.getElementById('hud-time');
  const hudStats = document.getElementById('hud-stats');

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

  // ------------------------------------------------------------- scene
  const OCC = 0, NEEDLE = 1, SOLID = 2, LIGHT = 3, STAR = 4;
  const RAMPS = [
    [' '],
    ['.', ':', ';', '\\', '*', 'x', 's', 'o', '%', '%', '#'],
    [':', '=', '+', 'x', '%', '#', '@'],
    ['o', 'o', '0', '*'],
    ['o', '0', '@'],
  ];
  const GROUND_RAMP = ['.', ':', ':', '-', '-', '=', '=', '+', '#'];
  // how far each kind is pulled toward the camera in the depth test
  const BIAS = [0, 0, 0.02, 0.07, 0.1];

  const Y0 = 0.45, Y1 = 2.45;          // needle span (world units, y up)
  const GROUND_R = 2.15;
  const STAR_Y = Y1 + 0.09;

  // timeline (seconds)
  const T_TRUNK = 0.3, T_TREE = 0.6, TREE_DUR = 4.2;
  const T_GARLAND = 4.9, GARLAND_DUR = 2.2;
  const T_ORN = 7.0, T_STAR = 9.3, T_GIFTS = 9.9, T_DONE = 13;

  const env = (h) => {
    const tier = 1 - ((h * 9) % 1);
    return 0.88 * Math.pow(1 - h, 0.74) * (0.86 + 0.14 * tier) + 0.02;
  };

  const pts = [];
  const add = (x, y, z, nx, ny, nz, r, g, b, birth, kind) => {
    pts.push(x, y, z, nx, ny, nz, r, g, b, birth, kind, rnd());
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
        const birth = T_TREE + TREE_DUR * h + gauss() * 0.05;
        if (s > 0.45 && rnd() < 0.05 * s) {
          add(x, y, z, 0, 1, 0, 0.92, 0.95, 1.0, birth, NEEDLE);   // snow on the tips
          continue;
        }
        const ao = 0.35 + 0.65 * Math.pow(s, 1.3);
        const tone = ao * uni(0.75, 1.1);
        const tip = Math.pow(rnd(), 3) * 0.6;
        add(x, y, z, nrm[0], nrm[1], nrm[2],
          (0.1 + 0.25 * tip) * tone, (0.44 + 0.34 * tip) * tone, (0.2 + 0.1 * tip) * tone,
          birth, NEEDLE);
      }
    }

    // --- invisible inner cone so the far side doesn't show through the gaps
    for (let i = 0; i < 16000; i++) {
      const h = treeH(), a = rnd() * TAU, rad = 0.6 * env(h) * Math.sqrt(uni(0.5, 1));
      add(rad * Math.cos(a), Y0 + h * (Y1 - Y0) - 0.06, rad * Math.sin(a), 0, 1, 0,
        0, 0, 0, T_TREE + TREE_DUR * h, OCC);
    }

    // --- garland: a swagged spiral of wire with warm bulbs
    const TURNS = 3.6;
    const spiral = (u) => {
      const h = 0.05 + 0.8 * u;
      const ag = TAU * TURNS * u + 0.9;
      const swag = -0.06 * Math.abs(Math.sin(ag * 2.5));
      const L = env(h);
      return [0.93 * L * Math.cos(ag), Y0 + h * (Y1 - Y0) - 0.17 * L + swag, 0.93 * L * Math.sin(ag), ag];
    };
    for (let i = 0; i < 2600; i++) {
      const u = i / 2600, p = spiral(u);
      add(p[0] + gauss() * 0.006, p[1] + gauss() * 0.006, p[2] + gauss() * 0.006,
        Math.cos(p[3]), 0.3, Math.sin(p[3]), 0.62, 0.44, 0.14, T_GARLAND + GARLAND_DUR * u, SOLID);
    }
    lightTimes = [];
    for (let i = 0; i < 150; i++) {
      const u = (i + 0.5) / 150, p = spiral(u), w = rnd() < 0.12;
      const birth = T_GARLAND + GARLAND_DUR * u;
      lightTimes.push(birth);
      add(p[0] * 1.03, p[1], p[2] * 1.03, 0, 1, 0, 1.0, w ? 0.95 : 0.78, w ? 0.85 : 0.32, birth, LIGHT);
    }
    for (let i = 0; i < 20; i++) {             // a few loose fairy lights
      const h = uni(0.05, 0.9), a = rnd() * TAU, L = env(h) * 0.9;
      const birth = T_ORN + rnd() * 2;
      lightTimes.push(birth);
      add(L * Math.cos(a), Y0 + h * (Y1 - Y0) - 0.15 * L, L * Math.sin(a), 0, 1, 0, 1.0, 0.85, 0.5, birth, LIGHT);
    }
    lightTimes.sort((a, b) => a - b);

    // --- ornaments
    const ORN = 17, order = [...Array(ORN).keys()].sort(() => rnd() - 0.5);
    for (let k = 0; k < ORN; k++) {
      const h = 0.06 + 0.8 * ((k + 0.5) / ORN), a = k * 2.39996 + 0.4;
      const L = env(h), rad = 0.055 + 0.04 * (1 - h);
      const cx = 0.97 * L * Math.cos(a), cz = 0.97 * L * Math.sin(a);
      const cy = Y0 + h * (Y1 - Y0) - 0.2 * L - rad * 0.6;
      const gold = k % 4 === 2;
      const col = gold ? [0.95, 0.68, 0.18] : [0.86, 0.1, 0.12];
      const birth = T_ORN + order[k] * 0.13;
      for (const d of fib(Math.round(260 + 5200 * rad))) {
        add(cx + d[0] * rad, cy + d[1] * rad, cz + d[2] * rad, d[0], d[1], d[2],
          col[0], col[1], col[2], birth, SOLID);
      }
    }

    // --- star
    for (const d of fib(420)) {
      const r = 0.075;
      add(d[0] * r, STAR_Y + d[1] * r, d[2] * r, d[0], d[1], d[2], 1.0, 0.82, 0.3, T_STAR, STAR);
    }

    // --- presents
    const gifts = [
      { a: 3.55, r: 0.98, w: 0.36, h: 0.27, d: 0.3, c: [0.82, 0.1, 0.1], rb: [0.95, 0.75, 0.25] },
      { a: 5.65, r: 1.05, w: 0.32, h: 0.2, d: 0.26, c: [0.12, 0.25, 0.8], rb: [0.95, 0.78, 0.3] },
      { a: 4.6, r: 0.92, w: 0.26, h: 0.17, d: 0.26, c: [0.9, 0.9, 0.94], rb: [0.85, 0.1, 0.12] },
      { a: 0.9, r: 0.95, w: 0.24, h: 0.22, d: 0.24, c: [0.9, 0.66, 0.16], rb: [0.8, 0.1, 0.1] },
      { a: 2.3, r: 1.0, w: 0.26, h: 0.32, d: 0.24, c: [0.45, 0.04, 0.1], rb: [0.92, 0.92, 0.95] },
      { a: 1.65, r: 1.12, w: 0.2, h: 0.14, d: 0.2, c: [0.1, 0.5, 0.25], rb: [0.9, 0.2, 0.2] },
    ];
    gifts.forEach((gf, gi) => {
      const px = gf.r * Math.cos(gf.a), pz = gf.r * Math.sin(gf.a);
      const rot = gf.a + uni(-0.5, 0.5), cr = Math.cos(rot), sr = Math.sin(rot);
      const t0 = T_GIFTS + gi * 0.4;
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
    });
  }

  build();
  const STRIDE = 12, N = pts.length / STRIDE;
  const P = new Float32Array(pts);
  pts.length = 0;

  // -------------------------------------------------------------- snow
  const FLAKES = 300;
  const flakes = new Float32Array(FLAKES * 5);       // x, y, speed, size, phase
  for (let i = 0; i < FLAKES; i++) {
    const depth = rnd();
    flakes.set([rnd(), rnd(), 0.006 + 0.03 * depth * depth, depth, rnd() * TAU], i * 5);
  }

  // ------------------------------------------------------------ camera
  const CAM_D = 6.2, PITCH = (16 * Math.PI) / 180, TARGET_Y = 1.32;
  const CP = Math.cos(PITCH), SP = Math.sin(PITCH);
  const CAM_Y = TARGET_Y + CAM_D * Math.tan(PITCH);
  const LIGHT_DIR = unit(-0.45, 0.72, -0.55);

  let W = 0, H = 0, dpr = 1, cellW = 6, cellH = 10, cols = 0, rows = 0, focal = 1;
  let zbuf, ibuf, groundR, groundHash;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    glowCanvas.width = Math.max(1, Math.round(W / 4));
    glowCanvas.height = Math.max(1, Math.round(H / 4));

    focal = Math.min(1.84 * H, 3.3 * W);
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
        const u = ((c + 0.5) * cellW - W / 2) / focal;
        const v = -((r + 0.5) * cellH - H / 2) / focal;
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
  const warmGlow = sprite(255, 190, 90);

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
  // ?t=13 jumps straight to a point on the timeline (handy when tuning)
  const startAt = parseFloat(new URLSearchParams(location.search).get('t'));
  let t = Number.isFinite(startAt) ? startAt : reduced ? T_DONE : 0, angle = 0, spin = BASE_SPIN, last = 0;
  let dragging = false, dragX = 0, dragV = 0;
  const visLights = [];

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    t += dt;
    if (!dragging) {
      angle += spin * dt;
      spin += (BASE_SPIN - spin) * Math.min(1, dt * 1.2);
    }
    render();
    requestAnimationFrame(frame);
  }

  function render() {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const fx = focal / cellW, fy = focal / cellH, ccx = W / 2 / cellW, ccy = H / 2 / cellH;
    zbuf.fill(Infinity); ibuf.fill(-1);

    // project
    for (let i = 0, o = 0; i < N; i++, o += STRIDE) {
      if (P[o + 9] > t) continue;
      const x = P[o] * ca + P[o + 2] * sa, z = -P[o] * sa + P[o + 2] * ca;
      const qy = P[o + 1] - CAM_Y, qz = z + CAM_D;
      const zc = -qy * SP + qz * CP;
      if (zc < 0.2) continue;
      const c = Math.floor(ccx + (x * fx) / zc);
      const r = Math.floor(ccy - ((qy * CP + qz * SP) * fy) / zc);
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
      const cell = r * cols + c, zz = zc - BIAS[P[o + 10]];
      if (zz < zbuf[cell]) { zbuf[cell] = zz; ibuf[cell] = i; }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // snow behind the glyphs
    for (let i = 0, o = 0; i < FLAKES; i++, o += 5) {
      const depth = flakes[o + 3];
      const y = (flakes[o + 1] + flakes[o + 2] * t) % 1;
      const x = flakes[o] + 0.006 * Math.sin(t * 0.5 + flakes[o + 4]);
      const px = x * W, py = y * H;
      const cell = Math.floor(py / cellH) * cols + Math.floor(px / cellW);
      if (depth < 0.85 && ibuf[cell] >= 0) continue;
      const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + depth) + flakes[o + 4] * 3);
      const s = 0.8 + 1.5 * depth * depth;
      ctx.fillStyle = `rgba(225,232,255,${(0.2 + 0.75 * depth) * tw})`;
      ctx.fillRect(px, py, s, s);
    }

    ctx.font = `bold ${(cellH * 1.08).toFixed(2)}px "SF Mono", ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const reveal = GROUND_R * Math.min(1, 1 - Math.pow(1 - Math.min(1, t / 1.4), 3));
    let lit = 0;
    while (lit < lightTimes.length && lightTimes[lit] <= t) lit++;
    const warm = lit / lightTimes.length;
    let letters = 0;
    visLights.length = 0;

    for (let r = 0, cell = 0; r < rows; r++) {
      const py = (r + 0.5) * cellH;
      for (let c = 0; c < cols; c++, cell++) {
        const i = ibuf[cell];
        const px = (c + 0.5) * cellW;
        if (i < 0) {
          // snow-covered ground disc
          const gr = groundR[cell];
          if (gr < 0 || gr > reveal) continue;
          const hh = groundHash[cell];
          const edge = Math.min(1, (GROUND_R - gr) * 2.2);
          let b = (0.3 + 0.7 * Math.exp(-Math.pow(gr / 1.1, 2))) * (0.4 + 0.6 * edge);
          b *= r % 2 ? 1 : 0.72;
          const front = Math.max(0, 1 - Math.abs(gr - reveal) * 5) * (t < 1.4 ? 1 : 0);
          b = Math.min(1, b + front * 0.5);
          const k = Math.min(GROUND_RAMP.length - 1, Math.max(0, Math.floor((b + (hh - 0.5) * 0.22) * GROUND_RAMP.length)));
          ctx.fillStyle = css((b * (200 + 40 * warm)) | 0, (b * 212) | 0, (b * (238 - 30 * warm)) | 0);
          ctx.fillText(GROUND_RAMP[k], px, py);
          letters++;
          continue;
        }
        const o = i * STRIDE, kind = P[o + 10];
        if (kind === OCC) continue;
        const seed = P[o + 11];
        const nx = P[o + 3] * ca + P[o + 5] * sa, nz = -P[o + 3] * sa + P[o + 5] * ca;
        const d = Math.max(0, nx * LIGHT_DIR[0] + P[o + 4] * LIGHT_DIR[1] + nz * LIGHT_DIR[2]);
        const age = t - P[o + 9];
        const flash = Math.max(0, 1 - age / 0.38);
        let lum, spec = 0, level;

        if (kind === NEEDLE) {
          lum = 0.4 + 0.9 * d;
          level = d * 0.65 + seed * 0.5;
        } else if (kind === SOLID) {
          lum = 0.32 + 0.85 * d;
          spec = Math.pow(d, 24) * 0.7;
          level = 0.25 + d * 0.6 + seed * 0.25;
        } else {
          const tw = kind === STAR ? 0.9 + 0.1 * Math.sin(t * 3 + seed * 9)
            : 0.62 + 0.38 * Math.sin(t * (2 + 3 * seed) + seed * 40);
          lum = tw; level = seed;
          if (kind === LIGHT) visLights.push(px, py, tw);
        }
        level = Math.min(0.999, level + flash);
        const f = flash * 0.9;
        const R = Math.min(255, ((P[o + 6] * lum + spec) * (1 - f) + f) * 255) | 0;
        const G = Math.min(255, ((P[o + 7] * lum + spec) * (1 - f) + f) * 255) | 0;
        const B = Math.min(255, ((P[o + 8] * lum + spec) * (1 - f) + f) * 255) | 0;
        const ramp = RAMPS[kind];
        ctx.fillStyle = css(R, G, B);
        ctx.fillText(ramp[(level * ramp.length) | 0], px, py);
        letters++;
      }
    }

    // additive glows: bulbs, then the star and its rays
    ctx.globalCompositeOperation = 'lighter';
    const gs = cellH * 5.5;
    for (let i = 0; i < visLights.length; i += 3) {
      ctx.globalAlpha = visLights[i + 2] * 0.75;
      ctx.drawImage(warmGlow, visLights[i] - gs / 2, visLights[i + 1] - gs / 2, gs, gs);
    }
    if (t > T_STAR) {
      const k = Math.min(1, (t - T_STAR) / 0.9);
      const qy = STAR_Y - CAM_Y, zc = -qy * SP + CAM_D * CP;
      const sx = W / 2, sy = H / 2 - ((qy * CP + CAM_D * SP) * focal) / zc;
      const pulse = 0.85 + 0.15 * Math.sin(t * 2.4);
      const big = cellH * 22 * k * pulse;
      ctx.globalAlpha = 0.9 * k;
      ctx.drawImage(warmGlow, sx - big / 2, sy - big / 2, big, big);
      ctx.lineWidth = 1;
      const unitLen = cellH * k * pulse;
      const rays = [[-90, 10], [-64, 7], [-116, 7], [0, 8], [180, 8], [90, 5], [58, 4], [122, 4], [-32, 3.5], [-148, 3.5]];
      for (const [deg, len] of rays) {
        const a = (deg * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
        const g = ctx.createLinearGradient(sx, sy, sx + dx * len * unitLen, sy + dy * len * unitLen);
        g.addColorStop(0, 'rgba(255,214,120,0.9)');
        g.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(sx + dx * unitLen, sy + dy * unitLen);
        ctx.lineTo(sx + dx * len * unitLen, sy + dy * len * unitLen);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    glowCtx.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);

    const deg = (((angle * 180) / Math.PI) % 360 + 360) % 360;
    hudTime.textContent = `t ${t.toFixed(2).padStart(5, '0')}s`;
    hudStats.textContent =
      `rotation ${deg.toFixed(2).padStart(6, '0')}°    lights ${String(lit).padStart(3, ' ')}\n` +
      `letters ${letters.toLocaleString('en-US')}`;
  }

  // ------------------------------------------------------- interaction
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; dragX = e.clientX; dragV = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragX;
    dragX = e.clientX;
    angle -= dx * 0.008;
    dragV = -dx * 0.008 * 60;
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    spin = Math.max(-6, Math.min(6, dragV || BASE_SPIN));
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  const replay = () => { t = 0; };
  canvas.addEventListener('dblclick', replay);
  window.addEventListener('keydown', (e) => { if (e.key === 'r' || e.key === 'R') replay(); });
  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });
})();
