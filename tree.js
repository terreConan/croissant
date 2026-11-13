/* ASCII Christmas tree.
 *
 * A 3D point cloud (needles, garland, ornaments, star, presents) is rotated,
 * projected onto a grid of character cells with a z-buffer, and each winning
 * point is drawn as one coloured glyph. Points carry a birth time on a shared
 * timeline: the bare tree grows by itself on load, and scrolling through the
 * page sections advances the timeline to add the decorations.
 *
 * Ornaments, presents, polaroids and the star are created from the page: every element
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
  const OCC = 0, NEEDLE = 1, SOLID = 2, LIGHT = 3, STAR = 4, CARD = 5, SUN = 6, RAY = 7;
  const RAMPS = [
    [' '],
    // needles are written with the letters of "andrew shin", light to dense
    ['.', ':', 'i', 'r', 's', 'n', 'e', 'a', 'h', 'd', 'w'],
    [':', '=', '+', 'x', '%', '#', '@'],
    ['o', 'o', '0', '*'],
    ['o', '0', '@'],
    ['.', ':', '=', '+', 'x', '%', '#', '@'],   // polaroids: glyph follows the photo's brightness
    ['o', '0', '@', '@'],                       // the sun's disc
    ['.', '\'', '*', '+'],                      // and its rays
  ];
  // vintage bulb colours
  const BULBS = [[1, 0.27, 0.2], [1, 0.68, 0.2], [0.35, 0.9, 0.42], [0.32, 0.55, 1], [1, 0.45, 0.72], [1, 0.94, 0.8]];
  const FLASH = 0.38;                  // seconds a new letter stays lit white
  const GROW = 1.1;                    // seconds an ornament or the star takes to swell in
  // how far each kind is pulled toward the camera in the depth test
  const BIAS = [0, 0, 0.02, 0.07, 0.1, 0.12, 0.1, 0.1];

  const Y0 = 0.45, Y1 = 2.45;          // needle span (world units, y up)
  const GROUND_R = 1.7;
  const STAR_Y = Y1 + 0.09;

  // timeline (seconds). The bare tree (up to T_GARLAND) plays on load. The lights
  // follow the About section, and after that every linked entry on the page owns
  // a slot, in page order: its object appears as the entry scrolls into view.
  const T_TRUNK = 0.3, T_TREE = 0.6, TREE_DUR = 3.3;
  const T_GARLAND = 4.9, GARLAND_DUR = 1.4, T_LIGHTS_END = 6.9;
  const aboutEl = document.getElementById('about');
  const slots = new Map();
  let T_DONE = T_LIGHTS_END;
  for (const el of document.querySelectorAll('[data-tree]')) {
    const len = el.dataset.tree === 'star' ? 1.9 : 1.3;   // long enough to finish appearing
    slots.set(el, { a: T_DONE, b: T_DONE + len });
    T_DONE += len;
  }
  const birthOf = (el) => slots.get(el).a + 0.05;
  let T_STAR = T_DONE;       // set in build(); with no star entry it simply comes last

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
  let objects = [];
  const TYPE_NAME = { 'ornament-blue': 'education', 'ornament-red': 'experience', 'ornament-gold': 'honor', present: 'project', polaroid: 'photo', star: 'contact' };
  const link = (el, type, color, pos, azimuth, birth) => {
    const heading = el.querySelector('h3, h2');
    const label = el.dataset.label || (heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '');
    const accent = `rgb(${color.map((c) => Math.round(Math.min(1, c * 1.1) * 255)).join(',')})`;
    objects.push({ el, type, label, accent, pos, azimuth, birth, soft: type !== 'present', fixed: false });
    curObj = objects.length;
  };
  // an entry's photos: <li data-src> items, or a data-photo list
  const photosOf = (el) => [
    ...[...el.querySelectorAll('.photos [data-src]')].map((li) => ({ src: li.dataset.src, w: li.dataset.w, h: li.dataset.h })),
    ...(el.dataset.photo || '').split('|').map((p) => ({ src: p.trim() })).filter((p) => p.src),
  ];
  const linked = (type) => [...document.querySelectorAll(`[data-tree="${type}"]`)];

  let lightTimes = [];
  let photoJobs = [];        // polaroid photo areas, coloured from the image once it loads
  const starEl = linked('star')[0];
  if (starEl) T_STAR = birthOf(starEl); else T_DONE += 1.9;

  const bulb = (x, y, z, birth, pal) => {
    lightTimes.push(birth);
    const c = BULBS[pal];
    add(x, y, z, pal, 1, 0, c[0], c[1], c[2], birth, LIGHT);   // nx carries the palette index
  };
  // the education, experience and honor entries, their colours interleaved
  const ornaments = (blue, red, gold) => {
    const sets = [['ornament-blue', blue], ['ornament-red', red], ['ornament-gold', gold]]
      .map(([type, col]) => linked(type).map((el) => ({ el, type, col, birth: birthOf(el) })));
    const out = [];
    for (let i = 0; i < Math.max(...sets.map((set) => set.length)); i++) {
      for (const set of sets) if (set[i]) out.push(set[i]);
    }
    return out;
  };
  // a polaroid: a white card with a square photo, centred at (cx, cy, cz),
  // facing the direction `face`, leaning back by `lean` and tilted by `roll`
  const card = (el, cx, cy, cz, face, lean, roll, azimuth) => {
    const w = 0.34, edge = 0.028, foot = 0.085, side = w - 2 * edge, ht = edge + side + foot;
    const cr = Math.cos(roll), sr = Math.sin(roll), cl = Math.cos(lean), sl = Math.sin(lean);
    const ox = Math.cos(face), oz = Math.sin(face), tx = -oz, tz = ox;
    const nrm = unit(ox * cl, sl + 0.25, oz * cl);
    const t0 = birthOf(el);
    link(el, 'polaroid', [0.93, 0.9, 0.84], [cx, cy, cz], azimuth, t0);
    const job = { src: (photosOf(el)[0] || {}).src, from: pts.length / STRIDE, uv: [] };
    const count = Math.round(36000 * w * ht);
    for (let k = 0; k < count; k++) {                       // photo points first, then the frame
      const u = rnd(), v = rnd();
      const lx = (u - 0.5) * w, ly = (0.5 - v) * ht;
      const pu = (u * w - edge) / side, pv = (v * ht - edge) / side;
      const inPhoto = pu >= 0 && pu <= 1 && pv >= 0 && pv <= 1;
      if (inPhoto !== k < count * 0.62) continue;
      const ax = lx * cr - ly * sr, ay = lx * sr + ly * cr;
      const col = inPhoto ? [0.2, 0.19, 0.18] : [0.93, 0.9, 0.84];
      if (inPhoto) job.uv.push(pu, pv);
      add(cx + tx * ax - ox * sl * ay, cy + cl * ay, cz + tz * ax - oz * sl * ay, nrm[0], nrm[1], nrm[2], col[0], col[1], col[2], t0, CARD);
    }
    photoJobs.push(job);
    curObj = 0;
  };

  // ------------------------------------------------------------ winter
  function buildWinter() {
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
    // --- ornaments: one per linked card, the colours interleaved up the tree
    const orns = ornaments([0.3, 0.52, 0.95], [0.86, 0.1, 0.12], [0.95, 0.68, 0.18]);
    const taken = [];                        // where things hang, as [height, azimuth]
    orns.forEach((orn, k) => {
      const h = 0.78 - 0.68 * ((k + 0.5) / orns.length), a = k * 2.39996 + 0.4;
      const L = env(h), rad = 0.072 + 0.04 * (1 - h);
      const cx = 0.97 * L * Math.cos(a), cz = 0.97 * L * Math.sin(a);
      const cy = Y0 + h * (Y1 - Y0) - 0.2 * L - rad * 0.6;
      taken.push([h, a]);
      link(orn.el, orn.type, orn.col, [cx, cy, cz], a, orn.birth);
      for (const d of fib(Math.round(260 + 5200 * rad))) {
        add(cx + d[0] * rad, cy + d[1] * rad, cz + d[2] * rad, d[0], d[1], d[2],
          orn.col[0], orn.col[1], orn.col[2], orn.birth, SOLID);
      }
      curObj = 0;
    });

    // --- polaroids: a white card with a square photo, leaning back against the branches
    linked('polaroid').forEach((el, i) => {
      // each hangs at its own height, turned to the emptiest side of the tree there
      const hung = linked('polaroid').length;
      const level = hung > 1 ? 0.58 - (0.34 * i) / (hung - 1) : 0.45;
      let h = level, a = 0, room = -1;
      for (let hh = level - 0.03; hh <= level + 0.031; hh += 0.03) {
        for (let aa = 0; aa < TAU; aa += 0.1) {
          let near = Infinity;
          for (const [th, ta] of taken) {
            const da = Math.abs(((aa - ta) % TAU + TAU * 1.5) % TAU - Math.PI);
            near = Math.min(near, Math.hypot((hh - th) * (Y1 - Y0), da * env((hh + th) / 2)));
          }
          if (near > room) { room = near; h = hh; a = aa; }
        }
      }
      taken.push([h, a]);
      const rad = 0.97 * env(h) + 0.05;
      card(el, rad * Math.cos(a), Y0 + h * (Y1 - Y0) - 0.12, rad * Math.sin(a), a, 0.44, i % 2 ? -0.2 : 0.17, a);
    });

    // --- star: a glowing ball at the tip
    if (starEl) link(starEl, 'star', [1.0, 0.82, 0.3], [0, STAR_Y, 0], null, T_STAR);
    for (const d of fib(420)) {
      const r = 0.075;
      add(d[0] * r, STAR_Y + d[1] * r, d[2] * r, d[0], d[1], d[2], 1.0, 0.82, 0.3, T_STAR, STAR);
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
      const t0 = birthOf(el);
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

  // ------------------------------------------------------------ summer
  // A beach umbrella on the sand, with the page mapped onto it the same way:
  // lights strung on the canopy, a lantern under the rim for each entry, a beach
  // ball for each project, the polaroids in a basket, and the sun for contact.
  function buildSummer() {
    const TOP = 2.08, RIM_Y = 1.62, RIM_R = 1.15, PANELS = 8;
    const dome = (u, a) => TOP - (TOP - RIM_Y) * Math.pow(u, 1.6)
      - 0.05 * u * u * u * Math.abs(Math.sin((PANELS / 2) * a));     // scalloped between the ribs

    // --- pole
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * TAU, y = rnd() * TOP;
      add(0.035 * Math.cos(a), y, 0.035 * Math.sin(a), Math.cos(a), 0, Math.sin(a),
        0.8, 0.74, 0.62, T_TRUNK + (y / TOP) * 1.3, SOLID);
    }

    // --- canopy: striped panels, written in the same letters as the tree, opening from the tip
    for (let i = 0; i < 34000; i++) {
      const u = Math.sqrt(rnd()), a = rnd() * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const stripe = Math.floor((a / TAU) * PANELS) % 2;
      const tone = uni(0.82, 1.05) * (0.8 + 0.2 * u);
      const col = stripe ? [0.58, 0.2, 0.15] : [0.58, 0.55, 0.48];
      const nrm = unit(ca * (0.25 + 0.5 * u) + gauss() * 0.12, 0.85 + gauss() * 0.12, sa * (0.25 + 0.5 * u) + gauss() * 0.12);
      add(RIM_R * u * ca, dome(u, a) + gauss() * 0.004, RIM_R * u * sa, nrm[0], nrm[1], nrm[2],
        col[0] * tone, col[1] * tone, col[2] * tone, T_TREE + 1.1 + (TREE_DUR - 1.1) * u + gauss() * 0.04, NEEDLE);
    }
    for (let i = 0; i < 14000; i++) {          // an unseen lining so nothing shows through
      const u = Math.sqrt(rnd()), a = rnd() * TAU;
      add(RIM_R * 0.98 * u * Math.cos(a), dome(u, a) - 0.035, RIM_R * 0.98 * u * Math.sin(a), 0, 1, 0,
        0, 0, 0, T_TREE + 1.1 + (TREE_DUR - 1.1) * u, OCC);
    }

    // --- lights: a string round the rim and up each rib
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * TAU;
      bulb(RIM_R * Math.cos(a), dome(1, a) - 0.035, RIM_R * Math.sin(a), T_GARLAND + GARLAND_DUR * 0.6 * (i / 56), i % BULBS.length);
    }
    for (let rib = 0; rib < PANELS; rib++) {
      for (let j = 1; j <= 4; j++) {
        const a = (rib * TAU) / PANELS, u = j / 5;
        bulb(RIM_R * u * Math.cos(a), dome(u, a) + 0.03, RIM_R * u * Math.sin(a),
          T_GARLAND + GARLAND_DUR * (0.4 + 0.6 * rnd()), (rib + j) % BULBS.length);
      }
    }

    // --- bunting: one pennant per linked card, hanging from the rim
    const orns = ornaments([0.5, 0.8, 1.0], [0.95, 0.25, 0.22], [1.0, 0.8, 0.25]);
    orns.forEach((orn, k) => {
      const a = ((k + 0.5) / orns.length) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const wide = 0.24, tall = 0.3;
      const top = dome(1, a) - 0.03, cx = RIM_R * ca, cz = RIM_R * sa;
      link(orn.el, orn.type, orn.col, [cx, top - tall * 0.38, cz], a, orn.birth);
      for (let i = 0; i < 1500; i++) {
        const v = rnd(), u = (rnd() - 0.5) * (1 - v);        // a triangle, point down
        const flare = 0.05 * v;                              // the tip swings out a little
        const hem = v < 0.09 ? 1.25 : 1;                     // a paler band along the top
        add(cx - sa * u * wide + ca * flare, top - v * tall, cz + ca * u * wide + sa * flare, ca, 0.35, sa,
          Math.min(1, orn.col[0] * hem), Math.min(1, orn.col[1] * hem), Math.min(1, orn.col[2] * hem), orn.birth, SOLID);
      }
      curObj = 0;
    });

    // --- beach balls: one per project, on the sand
    const BALLS = [[0.95, 0.3, 0.24], [0.35, 0.75, 1.0], [1.0, 0.78, 0.2], [0.3, 0.8, 0.55]];
    const white = [0.96, 0.95, 0.92];
    const balls = linked('present');
    balls.forEach((el, gi) => {
      const a = 3.9 + (gi * TAU) / balls.length + uni(-0.15, 0.15);
      const dist = 1.2 + uni(-0.05, 0.08), r = 0.2 - 0.025 * (gi % 3);
      const px = dist * Math.cos(a), pz = dist * Math.sin(a), turn = rnd() * TAU;
      const col = BALLS[gi % BALLS.length], t0 = birthOf(el);
      link(el, 'present', col, [px, r, pz], a, t0);
      for (const d of fib(2600)) {
        const wedge = Math.floor(((Math.atan2(d[2], d[0]) + turn + TAU * 2) % TAU) / (TAU / 6)) % 2;
        const c = Math.abs(d[1]) > 0.94 || wedge ? white : col;
        add(px + d[0] * r, r + d[1] * r, pz + d[2] * r, d[0], d[1], d[2], c[0], c[1], c[2],
          t0 + 0.6 * ((d[1] + 1) / 2), SOLID);
      }
      curObj = 0;
    });

    // --- a woven basket on the sand, holding the polaroids
    const snaps = linked('polaroid');
    if (snaps.length) {
      const ba = 3.9 + TAU / (2 * Math.max(1, balls.length)), bd = 0.8, BH = 0.2;
      const bx = bd * Math.cos(ba), bz = bd * Math.sin(ba);
      for (let i = 0; i < 6200; i++) {
        const v = rnd(), a = rnd() * TAU, rr = 0.2 + 0.08 * v;
        const weave = (Math.floor(v * 6) + Math.floor((a / TAU) * 30)) % 2 ? 1 : 0.7;
        const lip = v > 0.93 ? 1.25 : 1;
        add(bx + rr * Math.cos(a), v * BH, bz + rr * Math.sin(a), Math.cos(a), 0.25, Math.sin(a),
          0.62 * weave * lip, 0.44 * weave * lip, 0.24 * weave * lip, T_TRUNK + 0.5 + v * 0.5, SOLID);
      }
      snaps.forEach((el, i) => {               // fanned out, leaning back a little
        const fan = i - (snaps.length - 1) / 2;
        const cx = bx - Math.sin(ba) * fan * 0.13 - Math.cos(ba) * Math.abs(fan) * 0.03;
        const cz = bz + Math.cos(ba) * fan * 0.13 - Math.sin(ba) * Math.abs(fan) * 0.03;
        card(el, cx, BH + 0.1 + 0.02 * (i % 2), cz, ba + fan * 0.4, 0.2, fan * 0.12 + (i % 2 ? -0.06 : 0.06), ba);
      });
    }

    // --- the sun, up and to the left. It stays put in the sky while the umbrella turns.
    const sunAt = [-1.02, 2.42, 0], core = 0.15;
    if (starEl) {
      link(starEl, 'star', [1.0, 0.8, 0.3], sunAt, null, T_STAR);
      objects[objects.length - 1].fixed = true;
    }
    for (const d of fib(900)) {
      add(sunAt[0] + d[0] * core, sunAt[1] + d[1] * core, sunAt[2] + d[2] * core, d[0], d[1], d[2], 1.0, 0.82, 0.3, T_STAR, SUN);
    }
    for (let ray = 0; ray < 12; ray++) {       // rays, long and short by turns
      const a = (ray / 12) * TAU, reach = ray % 2 ? 0.1 : 0.17;
      for (let i = 0; i < 46; i++) {
        const r = core + 0.06 + reach * rnd(), off = gauss() * 0.008;
        add(sunAt[0] + r * Math.cos(a) - off * Math.sin(a), sunAt[1] + r * Math.sin(a) + off * Math.cos(a), sunAt[2],
          0, 0, -1, 1.0, 0.74, 0.26, T_STAR + 0.25, RAY);
      }
    }
    curObj = 0;
  }

  // both scenes are built once; switching the season swaps which one is drawn
  const make = (builder) => {
    pts.length = 0; objects = []; lightTimes = []; photoJobs = []; curObj = 0;
    builder();
    lightTimes.sort((a, b) => a - b);
    const scene = { P: new Float32Array(pts), N: pts.length / STRIDE, objects, lightTimes, jobs: photoJobs };
    pts.length = 0;
    return scene;
  };
  const scenes = { winter: make(buildWinter), summer: make(buildSummer) };
  let P = scenes.winter.P, N = scenes.winter.N;
  let summer = false;

  // paint each polaroid with its photo: sample the image onto the photo points
  for (const scene of Object.values(scenes)) for (const job of scene.jobs) {
    if (!job.src) continue;
    const img = new Image();
    img.onload = () => {
      const S = 40, c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d', { willReadFrequently: true });
      const iw = img.naturalWidth || S, ih = img.naturalHeight || S, m = Math.min(iw, ih);
      x.drawImage(img, (iw - m) / 2, (ih - m) / 2, m, m, 0, 0, S, S);
      let px;
      try { px = x.getImageData(0, 0, S, S).data; } catch (err) { return; }
      for (let k = 0; k < job.uv.length / 2; k++) {
        const q = (Math.min(S - 1, (job.uv[k * 2 + 1] * S) | 0) * S + Math.min(S - 1, (job.uv[k * 2] * S) | 0)) * 4;
        const o = (job.from + k) * STRIDE;
        scene.P[o + 6] = px[q] / 255; scene.P[o + 7] = px[q + 1] / 255; scene.P[o + 8] = px[q + 2] / 255;
      }
      render();
    };
    img.src = job.src;
  }

  // -------------------------------------------------------------- snow
  const FLAKES = 380;
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
  let wide = true;
  let originX = 0, originY = 0;        // where the tree's look-at point lands on screen
  let zbuf, ibuf, groundR, groundHash;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    glowCanvas.width = Math.max(1, Math.round(W / 4));
    glowCanvas.height = Math.max(1, Math.round(H / 4));

    // wide: tree on the left, text on the right. narrow: tree in a band above the text.
    wide = window.innerWidth >= 900;
    originX = wide ? W * 0.31 : W * 0.5;
    originY = H * 0.5;
    focal = wide ? Math.min(1.68 * H, 3.3 * W * 0.52) : Math.min(1.62 * H, 3.3 * W);
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
  // ?t=99 holds the timeline at least that far along, ?a=2.8 holds the tree at
  // that angle (both handy when tuning)
  const query = new URLSearchParams(location.search);
  const floorT = parseFloat(query.get('t')) || 0;
  const holdA = parseFloat(query.get('a'));
  const BASE_SPIN = !isNaN(holdA) ? 0 : reduced ? 0.08 : 0.33;
  const AUTO_END = T_GARLAND - 0.05;
  let t = floorT;            // timeline position
  let autoT = reduced ? AUTO_END : 0;   // the part that plays by itself
  let scrollT = 0;           // how far the page scroll has pushed the timeline
  let clock = 0;             // wall time, for twinkle and snow
  let angle = holdA || 0, spin = BASE_SPIN, last = 0;
  let dragging = false, dragX = 0, dragV = 0, downX = 0, downY = 0, moved = false;
  let hoverObj = null;       // object under the pointer
  let focusObj = null;       // object whose card is hovered or focused
  const visLights = [];

  function readScroll() {
    const vh = window.innerHeight;
    let s = 0;
    if (aboutEl) {
      const p = clamp((vh * 0.9 - aboutEl.getBoundingClientRect().top) / (vh * 0.55), 0, 1);
      if (p > 0) s = T_GARLAND + p * (T_LIGHTS_END - T_GARLAND);
    }
    for (const [el, slot] of slots) {
      const p = clamp((vh * 0.85 - el.getBoundingClientRect().top) / (vh * 0.2), 0, 1);
      if (p > 0) s = Math.max(s, slot.a + p * (slot.b - slot.a));
    }
    const doc = document.documentElement;
    if (vh + window.scrollY >= doc.scrollHeight - 2) s = T_DONE;
    scrollT = s;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    clock += dt;

    autoT = Math.min(AUTO_END, autoT + dt);
    const target = Math.max(autoT, scrollT, floorT);
    if (reduced) t = target;
    else if (target > t) t += Math.min(target - t, dt * (1 + Math.min(5, (target - t) * 0.5)));  // real time, faster the further behind
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
    if (!W || !H) return;                  // not laid out yet (a hidden tab)
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
      }
      const still = kind === SUN || kind === RAY;
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
      if (summer && i % 3) continue;         // summer: a few warm motes, drifting up
      const depth = flakes[o + 3];
      const fall = (flakes[o + 1] + flakes[o + 2] * clock * (summer ? 0.35 : 1)) % 1;
      const y = summer ? 1 - fall : fall;
      const x = flakes[o] + 0.006 * Math.sin(clock * 0.5 + flakes[o + 4]);
      const px = x * W, py = y * H;
      const cell = Math.floor(py / cellH) * cols + Math.floor(px / cellW);
      if (depth < 0.85 && ibuf[cell] >= 0) continue;
      const tw = 0.55 + 0.45 * Math.sin(clock * (0.6 + depth) + flakes[o + 4] * 3);
      const s = 0.9 + 1.8 * depth * depth;
      const quiet = wide && px > originX * 1.75 ? 0.4 : 1;      // keep it calm behind the text
      ctx.fillStyle = `rgba(${summer ? '255,232,170' : '244,236,222'},${(0.2 + 0.7 * depth) * tw * quiet})`;
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
          // a soft drift of snow (or sand), stippled, thinning toward the edge
          const gr = groundR[cell];
          if (gr < 0 || gr > reveal) continue;
          const hh = groundHash[cell];
          const dens = (0.62 * Math.exp(-Math.pow(gr / 0.85, 2)) + 0.05 * (1 - gr / GROUND_R)) * (summer ? 1.35 : 1);
          if (hh > dens) continue;
          const b = 0.4 + 0.6 * (1 - gr / GROUND_R);
          ctx.fillStyle = summer ? css((b * 246) | 0, (b * 214) | 0, (b * 150) | 0)
            : css((b * (228 + 20 * warm)) | 0, (b * 222) | 0, (b * (214 - 24 * warm)) | 0);
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
        const flash = soft ? 0 : Math.max(0, 1 - age / FLASH);
        const fade = soft ? Math.min(1, age / GROW) : 1;      // soft objects fade up, no flash
        let lum, spec = 0, level;

        if (kind === NEEDLE) {
          lum = 0.8 + 1.05 * d;
          level = d * 0.6 + seed * 0.55;
        } else if (kind === SOLID) {
          lum = 0.32 + 0.85 * d;
          spec = Math.pow(d, 24) * 0.7;
          level = 0.25 + d * 0.6 + seed * 0.25;
        } else if (kind === CARD) {
          lum = 0.78 + 0.3 * d;
          level = 0.12 + 0.88 * (0.3 * P[o + 6] + 0.59 * P[o + 7] + 0.11 * P[o + 8]);
        } else {
          const tw = kind === STAR || kind === SUN ? 0.9 + 0.1 * Math.sin(clock * 3 + seed * 9)
            : kind === RAY ? 0.7 + 0.3 * Math.sin(clock * 1.6 + seed * 20)
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
        level = Math.min(0.999, level + flash);
        const f = flash * 0.9;               // new letters flash white, then take their colour
        const R = Math.min(255, ((P[o + 6] * lum + spec) * (1 - f) + f) * 255) | 0;
        const G = Math.min(255, ((P[o + 7] * lum + spec) * (1 - f) + f) * 255) | 0;
        const B = Math.min(255, ((P[o + 8] * lum + spec) * (1 - f) + f) * 255) | 0;
        const ramp = RAMPS[kind];
        ctx.fillStyle = css(R, G, B);
        ctx.fillText(ramp[(level * ramp.length) | 0], px, py);
      }
    }

    // additive glows: bulbs, then the highlighted object
    ctx.globalCompositeOperation = 'lighter';
    const gs = cellH * 5.5;
    for (let i = 0; i < visLights.length; i += 4) {
      ctx.globalAlpha = visLights[i + 2] * 0.8;
      ctx.drawImage(bulbGlow[visLights[i + 3]], visLights[i] - gs / 2, visLights[i + 1] - gs / 2, gs, gs);
    }
    if (hl && hl.birth <= t) {
      const [x, y, z] = hl.pos;
      const zr = hl.fixed ? z : -x * sa + z * ca;
      if (zr < 0.25 || hl.type === 'star') { // only when it's on the near side
        const [sx, sy] = project(hl.fixed ? x : x * ca + z * sa, y, zr);
        const size = cellH * (hl.type === 'present' ? 20 : 13);
        ctx.globalAlpha = 0.5 + 0.3 * hlPulse;
        ctx.drawImage(whiteGlow, sx - size / 2, sy - size / 2, size, size);
      }
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

  // ---------------------------------------------------------- lightbox
  const box = document.getElementById('lightbox');
  // An entry's photos ride two half-wheels at the sides of the page (one wheel
  // along the bottom on a narrow screen). Scrolling turns the wheels while the
  // page stays put, and the photo at the inner point of each wheel is shown large.
  let tiles = [], wheels = [];
  let wheelPos = 0, wheelTo = 0, wheelRaf = 0, snapTimer = 0, wheelEase = 0.3;
  let grabbed = false, grabAt = 0, grabMoved = false;

  function layoutWheels() {
    const vw = window.innerWidth, vh = window.innerHeight, narrow = vw < 800;
    const groups = narrow ? [tiles] : [tiles.filter((_, i) => i % 2 === 0), tiles.filter((_, i) => i % 2 === 1)];
    wheels = groups.filter((items) => items.length).map((items, side) => {
      const ring = items.length >= 12;                     // enough to close the circle
      const step = ring ? TAU / items.length : 0.5;
      const R = narrow ? vw * 0.95 : vh * 0.5;
      const wheel = narrow
        ? { cx: vw / 2, cy: vh + R * 0.62, dir: -Math.PI / 2, sign: 1 }
        : side === 0 ? { cx: -R * 0.45, cy: vh / 2, dir: 0, sign: 1 }
          : { cx: vw + R * 0.45, cy: vh / 2, dir: Math.PI, sign: -1 };
      Object.assign(wheel, { items, ring, step, R, pitch: R * step });
      // room for the large photo, and the size of the small ones on the rim
      const boxW = narrow ? vw * 0.88 : vw / 2 - R * 0.55 - 64;
      const boxH = narrow ? vh - R * 0.38 - 120 : vh * 0.66;
      const small = clamp(wheel.pitch * 0.82, 44, 130);
      items.forEach((tile, k) => {
        tile.fw = Math.min(boxW, boxH * tile.ar);
        tile.fh = tile.fw / tile.ar;
        tile.small = small / Math.max(tile.fw, tile.fh);
        tile.reach = narrow ? tile.fh / 2 : tile.fw / 2;
        tile.wheel = wheel; tile.k = k;
        tile.img.style.width = `${tile.fw}px`;
        tile.img.style.height = `${tile.fh}px`;
      });
      return wheel;
    });
  }

  // how far tile k sits from the inner point of its wheel, in photos
  const offsetOf = (tile) => {
    const n = tile.wheel.items.length;
    const d = tile.k - wheelPos;
    return tile.wheel.ring ? ((d % n) + n * 1.5) % n - n / 2 : d;
  };

  function drawWheels() {
    for (const wheel of wheels) {
      for (const tile of wheel.items) {
        const d = offsetOf(tile), ang = d * wheel.step, st = tile.img.style;
        if (Math.abs(ang) > 1.9) { st.visibility = 'hidden'; tile.img.classList.remove('hot'); continue; }
        const f = Math.exp(-Math.pow(d / 0.62, 2));       // 1 at the inner point, 0 on the rim
        const r = wheel.R + f * (30 + tile.reach);
        const a = wheel.dir + wheel.sign * ang;
        const x = wheel.cx + r * Math.cos(a), y = wheel.cy + r * Math.sin(a);
        const size = tile.small + (1 - tile.small) * f;
        const lean = wheel.sign * ang * 0.3 * (1 - f);
        st.visibility = 'visible';
        st.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${lean.toFixed(3)}rad) scale(${size.toFixed(4)})`;
        st.zIndex = f > 0.5 ? 2 : 1;
        tile.img.classList.toggle('hot', f > 0.5);
      }
    }
  }

  function turn() {
    wheelPos += (wheelTo - wheelPos) * (reduced ? 1 : wheelEase);
    if (Math.abs(wheelTo - wheelPos) < 0.004) wheelPos = wheelTo;
    drawWheels();
    wheelRaf = !box.hidden && wheelPos !== wheelTo ? requestAnimationFrame(turn) : 0;
  }
  function turnTo(to, settleNow) {
    const longest = Math.max(1, ...wheels.map((wheel) => wheel.items.length));
    wheelTo = wheels.every((wheel) => wheel.ring) ? to : clamp(to, 0, longest - 1);
    wheelEase = settleNow ? 0.12 : 0.3;      // follow the hand closely; glide when settling
    if (!wheelRaf) wheelRaf = requestAnimationFrame(turn);
    clearTimeout(snapTimer);                 // once the hand rests, drift to the nearest photo
    snapTimer = setTimeout(() => {
      wheelTo = Math.round(wheelTo);
      wheelEase = settleNow ? 0.14 : 0.07;
      if (!wheelRaf) wheelRaf = requestAnimationFrame(turn);
    }, settleNow ? 0 : 280);
  }

  function openPhoto(obj) {
    const photos = photosOf(obj.el);
    if (!box || !photos.length) return;
    box.textContent = '';
    tiles = photos.map((photo) => {
      const img = document.createElement('img');
      img.src = photo.src;
      img.alt = obj.label;
      img.draggable = false;
      box.appendChild(img);
      return { img, ar: photo.w && photo.h ? photo.w / photo.h : 1 };
    });
    const hint = document.createElement('p');
    hint.className = 'hint wheel-hint';
    hint.textContent = 'scroll';
    box.appendChild(hint);
    box.hidden = false;
    layoutWheels();
    wheelPos = reduced ? 0 : -1.5;           // the wheels roll into place
    drawWheels();
    box.getBoundingClientRect();             // commit the start state so it animates
    box.classList.add('open');
    turnTo(0, true);
  }
  function closePhoto() {
    if (!box || box.hidden) return;
    box.classList.remove('open');
    setTimeout(() => { if (!box.classList.contains('open')) box.hidden = true; }, reduced ? 0 : 450);
  }
  if (box) {
    const narrowNow = () => window.innerWidth < 800;
    // the wheels turn as far and as fast as you scroll: slow to linger, fast to fly through
    box.addEventListener('wheel', (e) => {
      e.preventDefault();                    // the page behind stays where it is
      const px = (e.deltaY + e.deltaX) * (e.deltaMode === 1 ? 32 : 1);
      turnTo(wheelTo + clamp(px, -240, 240) / 300);
    }, { passive: false });
    box.addEventListener('pointerdown', (e) => {
      grabbed = true; grabMoved = false;
      grabAt = narrowNow() ? e.clientX : e.clientY;
    });
    box.addEventListener('pointermove', (e) => {
      if (!grabbed || !wheels.length) return;
      const at = narrowNow() ? e.clientX : e.clientY;
      if (!grabMoved && Math.abs(at - grabAt) < 6) return;
      grabMoved = true;
      turnTo(wheelTo - (at - grabAt) / wheels[0].pitch);
      grabAt = at;
    });
    const release = () => { if (grabbed && grabMoved) turnTo(wheelTo, true); grabbed = false; };
    box.addEventListener('pointerup', release);
    box.addEventListener('pointercancel', release);
    box.addEventListener('click', (e) => {
      if (grabMoved) { grabMoved = false; return; }
      const tile = tiles.find((item) => item.img === e.target);
      // a photo on the rim turns to the inner point; anything else closes
      if (tile && !tile.img.classList.contains('hot')) turnTo(Math.round(wheelPos + offsetOf(tile)), true);
      else closePhoto();
    });
  }

  function activate(obj) {
    if (obj.type === 'polaroid') { openPhoto(obj); return; }
    const calm = reduced ? 'auto' : 'smooth';
    obj.el.scrollIntoView({ behavior: calm, block: wide ? 'center' : 'end' });
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

  for (const el of document.querySelectorAll('[data-tree]')) {
    const mine = () => objects.find((obj) => obj.el === el);   // its object in the current season
    const on = () => { focusObj = mine() || null; };
    const off = () => { if (focusObj && focusObj.el === el) focusObj = null; };
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); });
    el.addEventListener('pointerleave', off);
    el.addEventListener('focus', on);
    el.addEventListener('blur', off);
    if (el.dataset.tree === 'polaroid') {
      const show = () => { const obj = mine(); if (obj) openPhoto(obj); };
      el.addEventListener('click', show);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); }
      });
    }
  }

  // ------------------------------------------------------------ season
  const seasonBtn = document.getElementById('season');
  function setSeason(name, replay) {
    const season = scenes[name] ? name : 'winter';
    summer = season === 'summer';
    ({ P, N, objects, lightTimes } = scenes[season]);
    hoverObj = null; focusObj = null;
    document.documentElement.dataset.theme = season;
    for (const obj of objects) obj.el.style.setProperty('--accent', obj.accent);
    for (const el of document.querySelectorAll('[data-summer]')) {     // wording that names the scene
      if (el.dataset.winter === undefined) el.dataset.winter = el.textContent;
      el.textContent = summer ? el.dataset.summer : el.dataset.winter;
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = summer ? '#2b3dc3' : '#2a1b12';
    if (replay) {                            // build the new scene up again
      t = 0; autoT = reduced ? AUTO_END : 0;
      try { localStorage.setItem('season', season); } catch (err) { /* private mode */ }
    }
  }
  if (seasonBtn) seasonBtn.addEventListener('click', () => setSeason(summer ? 'winter' : 'summer', true));
  let savedSeason = null;
  try { savedSeason = localStorage.getItem('season'); } catch (err) { /* private mode */ }
  setSeason(query.get('season') || savedSeason || 'winter', false);

  // links that leave the page open in a new tab
  for (const a of document.querySelectorAll('a[href]')) {
    if (/^(#|mailto:)/.test(a.getAttribute('href'))) continue;
    a.target = '_blank';
    a.rel = 'noopener';
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePhoto();
    if (box && !box.hidden && /^Arrow/.test(e.key)) {
      e.preventDefault();
      turnTo(Math.round(wheelTo) + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1), true);
    }
    if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) { t = 0; autoT = 0; }
  });
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', resize);
  window.addEventListener('resize', () => { if (box && !box.hidden) { layoutWheels(); drawWheels(); } });

  resize();
  render();                  // paint once right away, before the first animation frame
  requestAnimationFrame((now) => { last = now; requestAnimationFrame(frame); });
})();
