// arena.js - the live layer of the pit. The scenery itself is painted by
// backdrop.js; this slice keeps only what particles do better than paint:
// a packed floor strip the fighters can kick up, live torch flames that
// flicker over the painted posts, and embers drifting up off the line.
// Everything else (moon, ridges, ruins, crowd, walls) is canvas now.
const TAU = Math.PI * 2;

export function createArena(field, opts) {
  const lo = opts.lo;
  const hi = opts.hi;
  const N = hi - lo;
  const home = field.home, hcol = field.hcol, size = field.size;

  // sub-slices
  const FLOOR_N = (N * 0.42) | 0;
  const FLAME_N = (N * 0.34) | 0;
  const EMBER_N = N - FLOOR_N - FLAME_N;
  const floorLo = lo;
  const flameLo = floorLo + FLOOR_N;
  const emberLo = flameLo + FLAME_N;

  for (let p = lo; p < hi; p++) {
    field.homed[p] = 1;
    field.noFlock[p] = 1;
    field.leader[p] = 0;
  }

  const stone = [0.34, 0.30, 0.26];
  const ember = [0.55, 0.30, 0.12];
  const flame = [1.0, 0.55, 0.16];

  // torch post x positions mirror the painted posts in backdrop.js
  const posts = (e) => {
    const span = e.wallR - e.wallL;
    const xs = [];
    for (let t = 0; t < 5; t++) xs.push(e.wallL + span * ((t + 0.5) / 5));
    return xs;
  };

  // per-ember persistent state: which post, rise progress, lateral wobble
  const emb = new Float32Array(EMBER_N * 3); // [post, t, wob]

  let floor = 0, wl = 0, wr = 0, u = 1;

  const tint = (p, c, m) => {
    const i = p * 3;
    hcol[i] = c[0] * m;
    hcol[i + 1] = c[1] * m;
    hcol[i + 2] = c[2] * m;
  };

  function layout(e) {
    floor = e.floor; wl = e.wallL; wr = e.wallR; u = e.u;
    const span = wr - wl;

    // packed floor: dense two-row strip hugging the line, tapering at walls
    for (let p = floorLo; p < flameLo; p++) {
      const i = p * 3;
      const t = field.h1(p);
      const th = (2 + field.h2(p) * 5) * (0.55 + 0.45 * Math.min(1, t * 12, (1 - t) * 12));
      const row = field.h3(p) < 0.35 ? 3 + field.h2(p) * 7 : -th / 2;
      home[i] = wl + span * t;
      home[i + 1] = floor + row;
      home[i + 2] = -0.15 - field.h3(p) * 0.4;
      tint(p, stone, 0.4 + field.h3(p) * 0.55);
      size[p] = 1.5;
    }

    // torch flames: clusters at each painted post top. Write a first
    // home so nothing sits at 0,0; frame() rewrites them every tick.
    const xs = posts(e);
    for (let p = flameLo; p < emberLo; p++) {
      const i = p * 3;
      const bx = xs[(p - flameLo) % xs.length];
      home[i] = bx + (field.h2(p) - 0.5) * 0.08 * u;
      home[i + 1] = floor - 0.86 * u - field.h3(p) * 0.3 * u;
      home[i + 2] = -0.9;
      tint(p, flame, 1.4 + field.h3(p) * 0.8);
      size[p] = 0.7;
    }

    // embers: slow warm motes rising off the fight line, seeded mid-rise
    for (let p = emberLo; p < hi; p++) {
      const i = p * 3, k = (p - emberLo) * 3;
      emb[k] = field.h1(p) * 5;       // nearest post index, fractional
      emb[k + 1] = field.h2(p);        // rise progress 0..1
      emb[k + 2] = field.h3(p) * TAU;  // wobble phase
      home[i] = wl + span * field.h1(p);
      home[i + 1] = floor - emb[k + 1] * 0.9 * u;
      home[i + 2] = -0.7;
      tint(p, ember, 0.9 + field.h3(p) * 0.7);
      size[p] = 0.55 + field.h2(p) * 0.35;
    }

    for (let p = lo; p < hi; p++) field.snap[p] = 1;
  }

  // per-frame: flames lick and lean, embers climb and respawn at the line
  function frame(dt, T) {
    const xs = posts({ wallL: wl, wallR: wr });
    const per = ((emberLo - flameLo) / xs.length) | 0;
    for (let p = flameLo; p < emberLo; p++) {
      const i = p * 3;
      const t = (p - flameLo) / Math.max(1, per);
      const post = Math.min(xs.length - 1, t | 0);
      const ph = field.h1(p) * TAU;
      const bx = xs[post];
      const ty = floor - 0.9 * u;
      // teardrop: tight bright base, sparse flickering tongue above
      const rise = field.h3(p) * field.h3(p) * (0.32 + 0.1 * Math.sin(T * 9 + ph * 3)) * u;
      const sway = Math.sin(T * 6 + ph * 4 + post * 2.1) * (0.02 + 0.05 * (rise / (0.32 * u) + 0.2)) * u;
      home[i] = bx + (field.h2(p) - 0.5) * 0.07 * u + sway;
      home[i + 1] = ty - rise;
      home[i + 2] = -0.9;
      const m = 1.5 + 0.7 * Math.sin(T * 11 + ph * 5 + field.h2(p) * 9) + field.h3(p) * 0.4;
      tint(p, flame, m);
      size[p] = 0.55 + (1 - rise / (0.45 * u)) * 0.55;
      field.snap[p] = 1;
    }

    for (let p = emberLo; p < hi; p++) {
      const i = p * 3, k = (p - emberLo) * 3;
      emb[k + 1] += dt * (0.05 + field.h2(p) * 0.05); // 20-10s rise
      if (emb[k + 1] > 1) { emb[k + 1] = 0; emb[k] = Math.random() * 5; }
      const t = emb[k + 1];
      const post = xs[Math.min(xs.length - 1, emb[k] | 0)];
      const sway = Math.sin(T * 1.4 + emb[k + 2] + t * 9) * 0.09 * u * t;
      home[i] = post + (field.h1(p) - 0.5) * 0.5 * u + sway;
      home[i + 1] = floor - 0.9 * u - t * 1.6 * u;
      home[i + 2] = -0.7;
      // fade in off the post, fade out at height
      const a = Math.min(1, t * 6) * Math.max(0, 1 - (t - 0.7) / 0.3);
      tint(p, ember, a * (0.9 + field.h3(p) * 0.7));
      field.snap[p] = 1;
    }
  }

  // the ambient tail becomes sky: a static starfield over the painted
  // backdrop. Dimmer than before - stars are texture, not scenery, and
  // they must never out-bright the fighters. [a,b) is outside the slice.
  function sky(a, b, e) {
    const u = field.unit;
    for (let p = a; p < b; p++) {
      const i = p * 3;
      field.homed[p] = 1;
      field.noFlock[p] = 1;
      field.leader[p] = 0;
      field.snap[p] = 1;
      home[i] = field.h1(p) * innerWidth;
      home[i + 1] = field.h2(p) * (e.floor - 1.5 * u);
      home[i + 2] = -2.2 - field.h3(p) * 2.4;
      const lum = 0.05 + field.h3(p) * 0.13 + (field.h1(p) > 0.96 ? 0.22 : 0);
      tint(p, [0.72, 0.76, 0.82], lum);
      size[p] = 0.35 + field.h2(p) * 0.4;
    }
  }

  const arena = {
    layout,
    frame,
    sky,
    lo,
    hi,
    dirty: false,
    _ring: false,
    get ring() { return arena._ring; },
    // backdrop owns the ring visuals; the flag only survives for callers
    setRing(on) { arena._ring = !!on; },
  };
  return arena;
}
