// course.js - corridor path, starfield shell, gate rings, tumbling rocks.
// Bodies are fixed design-space point lists rigidly anchored to world
// positions, projected through cam.project into home[] every frame.
export function createCourse(field, cam, PF, layers) {
  const rnd = PF.rnd;
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock;

  // wandering corridor: deterministic sine offsets along the -z track axis
  const trackX = (z) => 230 * Math.sin(z / 2400) + 120 * Math.sin(z / 900 + 2.1);
  const trackY = (z) => 150 * Math.cos(z / 3100) + 90 * Math.sin(z / 1100 + 1.3);

  // --- stars: dim white points in a sphere SHELL AROUND THE CAMERA, not a
  // forward slab - space surrounds the ship in every direction. Points are
  // world-anchored while in range (true parallax); a star that exits the
  // shell respawns at a random direction on it. ~1/4 ride the deep shell
  // for slow far-field parallax at max speed.
  const S = layers.stars;
  const SN = S.hi - S.lo;
  const STAR_R = 4300, STAR_R2 = STAR_R * STAR_R;
  const sx = new Float32Array(SN), sy = new Float32Array(SN), sz = new Float32Array(SN);
  const sCol = new Float32Array(SN * 3), sSize = new Float32Array(SN);
  const sZ = new Float32Array(SN); // baked shader depth - see star writes
  const sTw = new Float32Array(SN); // 0 steady, else twinkle speed
  // kinds: 0 normal, 1 hero (bright, biased ahead - you can fly up to one),
  // 2 nebula haze (member of one of NK drifting clouds, big and dim),
  // 3 galactic band (distant dust stripe fixed in world space)
  const sk = new Uint8Array(SN), sCl = new Int16Array(SN);
  const NK = 6;
  // band plane basis: fixed normal so the stripe is a navigable landmark
  const bn = (() => { const l = Math.hypot(0.22, 0.95, 0.18); return [0.22 / l, 0.95 / l, 0.18 / l]; })();
  const e1l = Math.hypot(bn[1], bn[0]);
  const be1 = [bn[1] / e1l, -bn[0] / e1l, 0];
  const be2 = [bn[1] * 0 - bn[2] * be1[1], bn[2] * be1[0] - bn[0] * 0, bn[0] * be1[1] - bn[1] * be1[0]];
  const ncx = new Float32Array(NK), ncy = new Float32Array(NK), ncz = new Float32Array(NK);
  const spawnCluster = (c) => {
    const ahead = rnd() < 0.6;
    const ax = ahead ? 700 + rnd() * 3000 : -(300 + rnd() * 1300);
    const b = rnd() * 6.283, lr = 500 + rnd() * 1300;
    ncx[c] = cam.x + cam.fwd[0] * ax + (cam.right[0] * Math.cos(b) + cam.up[0] * Math.sin(b)) * lr;
    ncy[c] = cam.y + cam.fwd[1] * ax + (cam.right[1] * Math.cos(b) + cam.up[1] * Math.sin(b)) * lr;
    ncz[c] = cam.z + cam.fwd[2] * ax + (cam.right[2] * Math.cos(b) + cam.up[2] * Math.sin(b)) * lr;
  };
  const scatterNeb = (i) => {
    const c = sCl[i];
    const a = rnd() * 6.283, rr = (rnd() + rnd()) * 340;
    sx[i] = ncx[c] + Math.cos(a) * rr + (rnd() - 0.5) * 220;
    sy[i] = ncy[c] + Math.sin(a) * rr * 0.65;
    sz[i] = ncz[c] + (rnd() - 0.5) * 320;
    sSize[i] = 1.7 + rnd() * 1.6;
    sZ[i] = 0.9;
    const v = rnd();
    const cc = v < 0.34 ? [0.34, 0.42, 0.72] : v < 0.58 ? [0.5, 0.35, 0.66]
      : v < 0.78 ? [0.28, 0.52, 0.58] : v < 0.92 ? [0.58, 0.34, 0.38] : PF.PAL.dim;
    const lum = 0.09 + rnd() * 0.14;
    sCol[i * 3] = cc[0] * lum; sCol[i * 3 + 1] = cc[1] * lum; sCol[i * 3 + 2] = cc[2] * lum;
  };
  // Spawn a star in a tunnel around the flight axis: axial offset runs
  // ~3.7k ahead / ~1.6k behind (motion drains forward stock into the tail,
  // so ahead needs the deeper reach), lateral disc fills the periphery.
  const respawnStar = (i) => {
    if (sk[i] === 2) { scatterNeb(i); return; }
    if (sk[i] === 3) {
      // distant galactic band: a stripe of faint dust in a fixed plane,
      // effectively at infinity - always the same direction in the sky
      const t = rnd() * 6.283, off = (rnd() - 0.5) * 0.42;
      let dx = be1[0] * Math.cos(t) + be2[0] * Math.sin(t) + bn[0] * off;
      let dy = be1[1] * Math.cos(t) + be2[1] * Math.sin(t) + bn[1] * off;
      let dz = be1[2] * Math.cos(t) + be2[2] * Math.sin(t) + bn[2] * off;
      const dl = Math.hypot(dx, dy, dz) || 1, r = 2600 + rnd() * 1400;
      sx[i] = cam.x + (dx / dl) * r;
      sy[i] = cam.y + (dy / dl) * r;
      sz[i] = cam.z + (dz / dl) * r;
      sSize[i] = 0.6 + rnd() * 0.8;
      sZ[i] = 0.85;
      const w = rnd();
      const cc = w < 0.5 ? [0.7, 0.78, 0.95] : w < 0.8 ? PF.PAL.mist : [0.9, 0.75, 0.65];
      const lum = 0.18 + rnd() * 0.3;
      sTw[i] = 0;
      sCol[i * 3] = cc[0] * lum; sCol[i * 3 + 1] = cc[1] * lum; sCol[i * 3 + 2] = cc[2] * lum;
      return;
    }
    const ahead = rnd() < (sk[i] === 1 ? 0.85 : 0.66);
    const ax = ahead ? 250 + rnd() * 3500 : -(150 + rnd() * 1450);
    const b = rnd() * 6.283, lr = Math.sqrt(rnd()) * 1500;
    const dx = cam.fwd[0] * ax + (cam.right[0] * Math.cos(b) + cam.up[0] * Math.sin(b)) * lr;
    const dy = cam.fwd[1] * ax + (cam.right[1] * Math.cos(b) + cam.up[1] * Math.sin(b)) * lr;
    const dz = cam.fwd[2] * ax + (cam.right[2] * Math.cos(b) + cam.up[2] * Math.sin(b)) * lr;
    sx[i] = cam.x + dx; sy[i] = cam.y + dy; sz[i] = cam.z + dz;
    if (sk[i] === 1) {
      sSize[i] = 1.3 + rnd() * 0.6;
      sZ[i] = 1.6; // near-z keeps heroes big through the shader's persp term
      const lum = 0.95 + rnd() * 0.3;
      sCol[i * 3] = PF.PAL.ink[0] * lum; sCol[i * 3 + 1] = PF.PAL.ink[1] * lum; sCol[i * 3 + 2] = PF.PAL.ink[2] * lum;
      return;
    }
    const deep = dx * dx + dy * dy + dz * dz > 2250000; // 1500^2
    sSize[i] = deep ? 0.35 + rnd() * 0.45 : 0.45 + rnd() * 0.9;
    // world depth is baked into size/lum instead - home.z at real range
    // would crush every star to a sub-pixel sprite through perspZ
    sZ[i] = deep ? 0.55 : 1.4;
    const c = rnd();
    const lum = deep ? 0.34 + rnd() * 0.4
      : c < 0.15 ? 0.95 + rnd() * 0.35
      : 0.6 + rnd() * 0.4;
    // mostly white; a slice of pale blue / warm amber stars for variety
    const cc = c < 0.28 ? PF.PAL.dim
      : c < 0.38 ? [0.62, 0.72, 1.0]
      : c < 0.48 ? [1.0, 0.82, 0.62]
      : PF.PAL.ink;
    sTw[i] = !deep && rnd() < 0.12 ? 1.6 + rnd() * 3.4 : 0;
    sCol[i * 3] = cc[0] * lum; sCol[i * 3 + 1] = cc[1] * lum; sCol[i * 3 + 2] = cc[2] * lum;
  };
  for (let c = 0; c < NK; c++) spawnCluster(c);
  for (let i = 0; i < SN; i++) {
    sk[i] = i % 20 === 0 ? 1 : i % 7 === 0 ? 2 : i % 4 === 1 ? 3 : 0;
    sCl[i] = (i / 7 | 0) % NK;
    respawnStar(i);
    noFlock[S.lo + i] = 1;
    const j = (S.lo + i) * 3;
    hcol[j] = sCol[i * 3]; hcol[j + 1] = sCol[i * 3 + 1]; hcol[j + 2] = sCol[i * 3 + 2];
  }

  // --- gates: ring bodies in the xy plane at a corridor point ---
  const C = layers.course;
  const CN = C.hi - C.lo;
  const GATE_PTS = 128, ROCK_PTS = 230;
  const GATES = Math.max(3, Math.min(9, (CN / 2 / GATE_PTS) | 0));
  const ROCKS = Math.max(0, Math.min(5, ((CN - GATES * GATE_PTS) / ROCK_PTS) | 0));

  const ring = new Float32Array(GATE_PTS * 2);
  for (let i = 0; i < GATE_PTS; i++) {
    if (i < 104) {
      const a = (i / 104) * 6.283;
      ring[i * 2] = Math.cos(a); ring[i * 2 + 1] = Math.sin(a);
    } else if (i < 124) {
      // tick marks just outside the ring at 15-degree spacing
      const a = ((i - 104) / 20) * 6.283;
      ring[i * 2] = Math.cos(a) * 1.09; ring[i * 2 + 1] = Math.sin(a) * 1.09;
    } else {
      // inner guide lights on the ring's top
      const a = -1.5708 + (i - 124) * 0.09;
      ring[i * 2] = Math.cos(a) * 0.82; ring[i * 2 + 1] = Math.sin(a) * 0.82;
    }
  }

  const gates = [];
  for (let g = 0; g < GATES; g++)
    gates.push({ z: 0, x: 0, y: 0, r: 30, state: 0, flash: 0, lo: C.lo + g * GATE_PTS });

  const rocks = [];
  for (let r = 0; r < ROCKS; r++) {
    const body = new Float32Array(ROCK_PTS * 3);
    for (let i = 0; i < ROCK_PTS; i++) {
      // lumpy sphere: random direction, radius modulated by low-freq lumps
      const a = rnd() * 6.283, b = Math.acos(2 * rnd() - 1);
      const lump = 0.68 + 0.32 * Math.sin(a * 3 + b * 5) + rnd() * 0.18;
      body[i * 3] = Math.sin(b) * Math.cos(a) * lump;
      body[i * 3 + 1] = Math.cos(b) * lump;
      body[i * 3 + 2] = Math.sin(b) * Math.sin(a) * lump;
    }
    rocks.push({ x: 0, y: 0, z: 0, r: 40, spin: rnd() * 6.283, spinV: 0.1 + rnd() * 0.3,
      lo: C.lo + GATES * GATE_PTS + r * ROCK_PTS, body, dead: true });
  }

  // --- planets: procedural landmarks floating beside the corridor.
  // Each planet bakes a point-cloud sphere (hemisphere-shaded so it reads
  // as a lit ball) plus 0-2 ring bands in its equatorial plane. World-
  // anchored; respawns far ahead when it exits behind, so they double
  // as heading markers you can actually fly up to.
  const PL = layers.planets;
  const PN = PL.hi - PL.lo;
  // sun: a compass fixed at infinite range in a constant world direction.
  // It rides WITH the camera (no parallax) so it never leaves the sky;
  // the same vector is the planets' light source so shading agrees.
  const SUN_N = Math.min(150, Math.max(40, (PN * 0.15) | 0));
  const SUN_D = 30000;
  const sd = [-0.3, 0.45, -0.84];
  const sl2 = Math.hypot(sd[0], sd[1], sd[2]);
  const SUN = [sd[0] / sl2, sd[1] / sl2, sd[2] / sl2];
  const LIGHT = SUN;
  // basis spanning the plane facing the sun's direction
  let se1 = [-SUN[2], 0, SUN[0]];
  const sel = Math.hypot(se1[0], se1[2]) || 1;
  se1 = [se1[0] / sel, 0, se1[2] / sel];
  const se2 = [
    SUN[1] * se1[2] - SUN[2] * 0,
    SUN[2] * se1[0] - SUN[0] * se1[2],
    SUN[0] * 0 - SUN[1] * se1[0],
  ];
  const sunA = new Float32Array(SUN_N), sunR = new Float32Array(SUN_N);
  const sunD = new Float32Array(SUN_N), sunLum = new Float32Array(SUN_N);
  const sunCol = new Float32Array(SUN_N * 3), sunK = new Uint8Array(SUN_N);
  const ARMS = 6; // ray clusters precess slowly around the disc
  for (let i = 0; i < SUN_N; i++) {
    const v = rnd();
    const p = PL.lo + i;
    if (v < 0.62) {
      // dense core: white-hot center cooling to a warm limb
      sunK[i] = 0;
      sunA[i] = rnd() * 6.283;
      sunR[i] = Math.sqrt(rnd()) * 620;
      sunD[i] = (rnd() - 0.5) * 700;
      const t = sunR[i] / 620;
      sunLum[i] = 1.75 - t * 1.0;
      size[p] = 1.9 - t * 0.5;
      const w = 1 - t * 0.55;
      sunCol[i * 3] = 1.0; sunCol[i * 3 + 1] = 0.82 + 0.13 * w; sunCol[i * 3 + 2] = 0.6 + 0.3 * w;
    } else if (v < 0.78) {
      // faint corona ring just outside the disc
      sunK[i] = 1;
      sunA[i] = rnd() * 6.283;
      sunR[i] = 760 + rnd() * 200;
      sunD[i] = (rnd() - 0.5) * 900;
      sunLum[i] = 0.3 + rnd() * 0.25;
      size[p] = 1.0;
      sunCol[i * 3] = 1.0; sunCol[i * 3 + 1] = 0.75; sunCol[i * 3 + 2] = 0.5;
    } else {
      // sparse radial ray arms; angle bakes the arm slot, the frame
      // pass adds a slow precession so the spokes wheel around
      sunK[i] = 2;
      const t = rnd();
      sunA[i] = (((rnd() * ARMS) | 0) / ARMS) * 6.283 + (rnd() - 0.5) * 0.11;
      sunR[i] = 980 + t * 1600;
      sunD[i] = (rnd() - 0.5) * 500;
      sunLum[i] = (0.55 - t * 0.4) * (0.7 + rnd() * 0.6);
      size[p] = 1.15 - t * 0.4;
      sunCol[i * 3] = 1.0; sunCol[i * 3 + 1] = 0.7; sunCol[i * 3 + 2] = 0.45;
    }
    noFlock[p] = 1; homed[p] = 1; snap[p] = 1;
  }

  // --- derelict capital ship: a slow landmark off the racing line.
  // Baked along local x (the spine); the frame pass tumbles it about a
  // transverse axis so the hull cartwheels. World-anchored, respawns far
  // ahead when it falls behind like a planet does.
  const LMK_N = Math.min(420, Math.max(80, (PN * 0.36) | 0));
  const lmb = new Float32Array(LMK_N * 3), lmCol = new Float32Array(LMK_N * 3);
  // kinds: 0 hull, 1 window, 2 beacon, 3 debris, 4 ember flicker
  const lmKind = new Uint8Array(LMK_N);
  const lm = {
    x: 0, y: 0, z: 0, spin: 0, seq: 0,
    D: [0, 0, -1], U: [0, 1, 0], V: [1, 0, 0],
    lo: PL.lo + SUN_N, n: LMK_N, leg: 0, done: false, legLen: 0,
  };
  {
    let li = 0;
    const lp = (x, y, z, k, c, l) => {
      if (li >= LMK_N) return;
      lmb[li * 3] = x; lmb[li * 3 + 1] = y; lmb[li * 3 + 2] = z;
      lmKind[li] = k;
      lmCol[li * 3] = c[0] * l; lmCol[li * 3 + 1] = c[1] * l; lmCol[li * 3 + 2] = c[2] * l;
      li++;
    };
    const STEEL = [0.38, 0.45, 0.56], RIM = [0.58, 0.7, 0.88],
      WARM = [0.95, 0.72, 0.42], BEAC = [1.0, 0.3, 0.28], EMB = [1.0, 0.5, 0.26];
    lp(52, 27, 0, 2, BEAC, 1); lp(52, 28.6, 0, 2, BEAC, 1); // beacon first: always bakes
    for (let t = 0; t < 80; t++) { // spine girder
      const x = -130 + (t / 80) * 260;
      lp(x, (rnd() - 0.5) * 7, (rnd() - 0.5) * 7, 0, STEEL, 0.55 + rnd() * 0.3);
    }
    for (let t = 0; t < 85; t++) { // hull slabs, beam swells amidships;
      // dorsal faces pick up a cold starlight rim so the silhouette reads
      const x = -120 + rnd() * 245;
      const u = Math.sin((x + 120) / 245 * Math.PI);
      const y = (rnd() - 0.5) * (2 + u * 10), z = (rnd() - 0.5) * (3 + u * 18);
      const lit = y > 3 || rnd() < 0.14;
      lp(x, y, z, 0, lit ? RIM : STEEL, (lit ? 0.75 : 0.42) + rnd() * 0.3);
    }
    for (let t = 0; t < 45; t++) // superstructure tower
      lp(25 + rnd() * 50, 4 + rnd() * 18, (rnd() - 0.5) * 9, 0, STEEL, 0.5 + rnd() * 0.3);
    for (let t = 0; t < 24; t++) // dead engine block at the stern
      lp(128 + rnd() * 14, (rnd() - 0.5) * 18, (rnd() - 0.5) * 22, 0, STEEL, 0.3 + rnd() * 0.2);
    for (let t = 0; t < 30; t++) // lit windows: spine rows + a tower cluster
      if (t < 8) lp(35 + rnd() * 30, 9 + rnd() * 10, (rnd() - 0.5) * 6, 1, WARM, 0.7 + rnd() * 0.4);
      else lp(-110 + (t / 22) * 225 + rnd() * 6, 4.5 + rnd() * 2, (t % 2 ? 1 : -1) * (7 + rnd() * 4), 1, WARM, 0.65 + rnd() * 0.35);
    for (let t = 0; t < 12; t++) { // dish/antenna nub on the tower
      const a = (t / 12) * 6.283, rr = t < 9 ? 1 + (t % 3) : 0;
      lp(40 + Math.cos(a) * rr * 1.6, 24 + Math.sin(a) * rr * 1.6 + (t < 9 ? 2 : -2), (rnd() - 0.5) * 2, 0, STEEL, 0.55);
    }
    for (let t = 0; t < 12; t++) // dying fires: ember pts flicker on the hull
      lp(-80 + rnd() * 190, (rnd() - 0.5) * 12, (rnd() - 0.5) * 16, 4, EMB, 1);
    for (let t = 0; t < 70; t++) // debris cloud tumbles along with the hull
      lp(-150 + rnd() * 320, (rnd() - 0.5) * (14 + rnd() * 70),
        (rnd() - 0.5) * (16 + rnd() * 80), 3, STEEL, 0.3 + rnd() * 0.3);
  }
  // campaign legs: each rescue is a real journey out, longer each time.
  // lm.leg picks the distance band; lm.done (story over) leaves the
  // emptied wreck drifting off behind with no new signal
  const LEGD = [48000, 62000, 78000];
  const spawnLm = () => {
    lm.seq++;
    const b = rnd() * 6.283;
    const lat = 500 + rnd() * 800;
    const ax = LEGD[Math.min(lm.leg, LEGD.length - 1)] * (0.94 + rnd() * 0.12);
    lm.legLen = Math.hypot(ax, lat);
    lm.x = cam.x + cam.fwd[0] * ax + (cam.right[0] * Math.cos(b) + cam.up[0] * Math.sin(b)) * lat;
    lm.y = cam.y + cam.fwd[1] * ax + (cam.right[1] * Math.cos(b) + cam.up[1] * Math.sin(b)) * lat;
    lm.z = cam.z + cam.fwd[2] * ax + (cam.right[2] * Math.cos(b) + cam.up[2] * Math.sin(b)) * lat;
    // spine rides roughly along the corridor with a drift-angle tilt -
    // a dead hull adrift, not a ship on the track
    const ya = (rnd() - 0.5) * 1.1, pa = (rnd() - 0.5) * 0.5;
    lm.D[0] = cam.fwd[0] * Math.cos(ya) + cam.right[0] * Math.sin(ya) + cam.up[0] * pa;
    lm.D[1] = cam.fwd[1] * Math.cos(ya) + cam.right[1] * Math.sin(ya) + cam.up[1] * pa;
    lm.D[2] = cam.fwd[2] * Math.cos(ya) + cam.right[2] * Math.sin(ya) + cam.up[2] * pa;
    const dl = Math.hypot(lm.D[0], lm.D[1], lm.D[2]) || 1;
    lm.D[0] /= dl; lm.D[1] /= dl; lm.D[2] /= dl;
    // tumble axis V: any perpendicular to the spine; U completes the basis
    const tx = Math.abs(lm.D[1]) < 0.9 ? 0 : 1, ty = Math.abs(lm.D[1]) < 0.9 ? 1 : 0;
    let ux = ty * lm.D[2] - 0 * lm.D[1], uy = 0 * lm.D[0] - tx * lm.D[2], uz = tx * lm.D[1] - ty * lm.D[0];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    lm.V[0] = ux; lm.V[1] = uy; lm.V[2] = uz;
    lm.U[0] = lm.V[1] * lm.D[2] - lm.V[2] * lm.D[1];
    lm.U[1] = lm.V[2] * lm.D[0] - lm.V[0] * lm.D[2];
    lm.U[2] = lm.V[0] * lm.D[1] - lm.V[1] * lm.D[0];
    lm.spin = rnd() * 6.283;
  };
  spawnLm();
  for (let i = 0; i < LMK_N; i++) {
    const p = lm.lo + i;
    noFlock[p] = 1; homed[p] = 1; snap[p] = 1;
  }

  const NPL = 3;
  const PPN = ((PN - SUN_N - LMK_N) / NPL) | 0;
  const PLANET_COLS = [
    [0.5, 0.6, 0.9],   // ice giant
    [0.85, 0.55, 0.32], // rust world
    [0.55, 0.66, 0.6], // grey-green
    [0.68, 0.45, 0.62], // violet
  ];
  const planets = [];
  for (let pi = 0; pi < NPL; pi++) {
    const n = PPN;
    planets.push({
      lo: PL.lo + SUN_N + LMK_N + pi * PPN, n,
      x: 0, y: 0, z: 0, R: 300,
      ax: 0, ay: 1, az: 0, // ring plane normal
      e1x: 1, e1y: 0, e1z: 0, e2x: 0, e2y: 0, e2z: 1, // ring basis
      rings: 0, ringN: 0, rimN: 0, spin: 0, spinV: 0.02,
      shellN: 0, col: [0.4, 0.4, 0.4],
      pd: new Float32Array(n * 3),   // shell unit dirs
      pf: new Float32Array(n),       // radial factor (interior speckle < 1)
      pcol: new Float32Array(n * 3),
      psz: new Float32Array(n),
      ra: new Float32Array(n), rr: new Float32Array(n), ry: new Float32Array(n),
    });
  }
  const spawnPlanet = (pl) => {
    pl.R = 170 + Math.pow(rnd(), 2.2) * 680; // skew small; huge ones are rare
    const b = rnd() * 6.283;
    const lat = pl.R * 1.9 + 600 + rnd() * 1700; // off the racing line
    const ax = 2400 + rnd() * 3800;
    pl.x = cam.x + cam.fwd[0] * ax + (cam.right[0] * Math.cos(b) + cam.up[0] * Math.sin(b)) * lat;
    pl.y = cam.y + cam.fwd[1] * ax + (cam.right[1] * Math.cos(b) + cam.up[1] * Math.sin(b)) * lat;
    pl.z = cam.z + cam.fwd[2] * ax + (cam.right[2] * Math.cos(b) + cam.up[2] * Math.sin(b)) * lat;
    // random axis -> ring plane
    const a = rnd() * 6.283, u = rnd() * 2 - 1, w = Math.sqrt(1 - u * u);
    pl.ax = Math.cos(a) * w; pl.ay = u; pl.az = Math.sin(a) * w;
    // orthonormal basis for the equatorial plane
    const hx = pl.ay + 0.31, hy = -pl.ax, hz = 0.17; // rough perpendicular, normalized next
    const hl = Math.hypot(hx, hy, hz) || 1;
    const e1x = hx / hl, e1y = hy / hl, e1z = hz / hl;
    pl.e1x = e1x; pl.e1y = e1y; pl.e1z = e1z;
    pl.e2x = pl.ay * e1z - pl.az * e1y;
    pl.e2y = pl.az * e1x - pl.ax * e1z;
    pl.e2z = pl.ax * e1y - pl.ay * e1x;
    pl.rings = rnd() < 0.4 ? 0 : rnd() < 0.7 ? 1 : 2;
    pl.spin = 0; pl.spinV = 0.012 + rnd() * 0.03;
    const base = PLANET_COLS[(rnd() * PLANET_COLS.length) | 0];
    const lum = 0.5 + rnd() * 0.3;
    pl.ringN = pl.rings === 0 ? 0 : ((pl.n * (pl.rings === 2 ? 0.3 : 0.24)) | 0);
    pl.rimN = Math.min(48, (pl.n * 0.13) | 0); // thin limb accent, not the body
    pl.shellN = pl.n - pl.ringN - pl.rimN;
    pl.col = [base[0] * (lum + 0.35), base[1] * (lum + 0.35), base[2] * (lum + 0.35)];
    pl.bandAmp = rnd() < 0.6 ? 0.3 : 0.06; // gas-giant bands vs rock
    pl.bandF = 4 + rnd() * 7;
    const ptScale = Math.min(3, 1.1 + pl.R / 430);
    // member layout by field offset: [0, rimN) limb ring - [rimN,
    // rimN+shellN) surface shell - [rimN+shellN, n) ring band(s).
    for (let m = pl.rimN; m < pl.rimN + pl.shellN; m++) {
      const aa = rnd() * 6.283, uu = rnd() * 2 - 1, ww = Math.sqrt(1 - uu * uu);
      const dx = Math.cos(aa) * ww, dy = uu, dz = Math.sin(aa) * ww;
      pl.pd[m * 3] = dx; pl.pd[m * 3 + 1] = dy; pl.pd[m * 3 + 2] = dz;
      pl.pf[m] = rnd() < 0.15 ? 0.5 + rnd() * 0.42 : 1; // sparse interior fill
      const shade = Math.pow(Math.max(0, dx * LIGHT[0] + dy * LIGHT[1] + dz * LIGHT[2]), 0.7);
      const L = (0.16 + 1.05 * shade * lum) * (1 + pl.bandAmp * Math.sin(dy * pl.bandF)) + rnd() * 0.05;
      pl.pcol[m * 3] = base[0] * L; pl.pcol[m * 3 + 1] = base[1] * L; pl.pcol[m * 3 + 2] = base[2] * L;
      pl.psz[m] = (1.5 + rnd() * 1.3) * ptScale;
    }
    for (let m = pl.rimN + pl.shellN; m < pl.n; m++) {
      // ring band(s): outer band second when 2 rings; thin disc, slow spin
      const k = pl.rings === 2 && rnd() < 0.45 ? 1 : 0;
      pl.ra[m] = rnd() * 6.283;
      pl.rr[m] = pl.R * (1.38 + k * 0.62 + rnd() * 0.5);
      pl.ry[m] = (rnd() - 0.5) * 0.05 * pl.R;
      const g = 0.3 + rnd() * 0.35;
      pl.pcol[m * 3] = PF.PAL.mist[0] * g + 0.05;
      pl.pcol[m * 3 + 1] = PF.PAL.mist[1] * g;
      pl.pcol[m * 3 + 2] = PF.PAL.mist[2] * g;
      pl.psz[m] = 0.9 + rnd() * 0.7;
    }
    for (let i = 0; i < pl.n; i++) {
      const p = pl.lo + i;
      noFlock[p] = 1;
      homed[p] = 1;
      snap[p] = 1;
    }
  };
  for (const pl of planets) spawnPlanet(pl);

  const course = { trackX, trackY, gates, rocks, planets, landmark: lm, SUN,
    sunVis: false, sunX: 0, sunY: 0,
    respawnLm: (leg) => {
      if (lm.done) return;
      if (leg != null) lm.leg = Math.min(leg, LEGD.length - 1);
      spawnLm();
    },
    finishStory: () => { lm.done = true; },
    stars: { sx, sy, sz, n: SN } };

  const gateGap = (dist) => 740 + Math.min(560, dist * 0.026) + rnd() * 180;
  const gateR = (dist) => Math.max(26, 46 - dist * 0.0009);

  function spawnGate(g, z, dist) {
    g.z = z;
    g.x = trackX(z);
    g.y = trackY(z);
    g.r = gateR(dist);
    g.state = 0;
    g.flash = 0;
  }

  function spawnRock(k, z, dist) {
    const side = rnd() < 0.5 ? -1 : 1;
    k.z = z;
    k.r = 30 + rnd() * 30;
    // keep the rock's edge off the corridor center so a clean line stays flyable
    k.x = trackX(z) + side * (k.r + 15 + rnd() * 80);
    k.y = trackY(z) + (rnd() - 0.5) * 130;
    k.dead = false;
  }

  course.reset = () => {
    let z = -1100;
    for (const g of gates) { spawnGate(g, z, 0); z -= gateGap(0); }
    for (const k of rocks) k.dead = true;
    lm.leg = 0; lm.done = false; // each run replays the campaign fresh
    spawnLm();
  };
  course.reset();

  // returns events for the frame: {type:"pass"|"clip"|"miss"|"rock", gate?}
  course.check = (prevZ) => {
    for (const g of gates) {
      if (g.state !== 0 || g.z > prevZ || g.z <= cam.z) continue;
      const d = Math.hypot(cam.x - g.x, cam.y - g.y);
      if (d < g.r * 0.78) { g.state = 1; g.flash = 1; return { type: "pass", gate: g }; }
      if (d < g.r * 1.3) { g.state = 2; return { type: "clip", gate: g }; }
      g.state = 2;
      return { type: "miss", gate: g };
    }
    for (const k of rocks) {
      if (k.dead) continue;
      const dx = cam.x - k.x, dy = cam.y - k.y, dz = cam.z - k.z;
      if (dx * dx + dy * dy + dz * dz < k.r * k.r * 0.49) {
        k.dead = true;
        return { type: "rock", rock: k };
      }
    }
    return null;
  };

  let stT = 0, sunSpin = 0;
  course.frame = (dt, snapMode) => {
    stT += dt;
    const o = cam.out;
    const starGain = 1 + cam.speedK * 0.75;
    const starSize = 1 + cam.speedK * 1.7; // streak substitute: bigger+brighter at speed
    // nebula cloud centers drift with the same rules; on exit, move the
    // cloud and re-scatter its members so the patch stays coherent
    for (let c = 0; c < NK; c++) {
      const dx = ncx[c] - cam.x, dy = ncy[c] - cam.y, dz = ncz[c] - cam.z;
      const ax = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
      if (dx * dx + dy * dy + dz * dz > STAR_R2 || ax < -1800) {
        spawnCluster(c);
        for (let i = 0; i < SN; i++) if (sk[i] === 2 && sCl[i] === c) scatterNeb(i);
      }
    }
    for (let i = 0; i < SN; i++) {
      const p = S.lo + i, j = p * 3;
      const dx = sx[i] - cam.x, dy = sy[i] - cam.y, dz = sz[i] - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const axial = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
      if (d2 > STAR_R2 || axial < -1800) respawnStar(i);
      if (!cam.project(sx[i], sy[i], sz[i])) {
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1;
        continue;
      }
      home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = sZ[i];
      if (snapMode) snap[p] = 1;
      size[p] = sSize[i] * starSize;
      const tw = sTw[i] ? 0.72 + 0.28 * Math.sin(stT * sTw[i] + i * 1.7) : 1;
      hcol[j] = sCol[i * 3] * starGain * tw;
      hcol[j + 1] = sCol[i * 3 + 1] * starGain * tw;
      hcol[j + 2] = sCol[i * 3 + 2] * starGain * tw;
    }

    // recycle + write gates; nearest pending gate gets the highlight
    let front = 1e9, next = null;
    for (const g of gates) {
      if (g.z < front) front = g.z;
      if (g.state === 0 && g.z < cam.z && (!next || g.z > next.z)) next = g;
    }
    course.next = next; // cockpit compass reads it
    const dist = -cam.z;
    for (const g of gates) {
      if (g.z > cam.z + 260) spawnGate(g, front - gateGap(dist), dist);
      g.flash = Math.max(0, g.flash - dt * 2);
      const cr = g.r;
      const isNext = g === next;
      for (let i = 0; i < GATE_PTS; i++) {
        const p = g.lo + i, j = p * 3;
        const wx = g.x + ring[i * 2] * cr, wy = g.y + ring[i * 2 + 1] * cr;
        if (!cam.project(wx, wy, g.z)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = Math.max(o[2], -4); // far gates stay readable rings
        if (snapMode) snap[p] = 1;
        const f = g.flash;
        const guide = i >= 124;
        const c = f > 0 ? PF.PAL.accent : guide || isNext ? PF.PAL.accent : g.state === 0 ? PF.PAL.sky : PF.PAL.dim;
        const b = f > 0 ? 1.7 : guide ? 1.3 : isNext ? 1.3 : g.state === 0 ? 0.95 : 0.4;
        size[p] = f > 0 ? 1.5 : guide || isNext ? 1.3 : g.state === 0 ? 1.05 : 0.7;
        hcol[j] = c[0] * b; hcol[j + 1] = c[1] * b; hcol[j + 2] = c[2] * b;
      }
    }

    // sun: the compass. Fixed world direction at 30k - effectively
    // infinite, zero parallax, always in the same sky quadrant. It rides
    // with the camera so it can never be left behind; you steer relative
    // to it, and planets are lit from it.
    sunSpin += dt * 0.035; // ray arms wheel slowly around the disc
    const sx0 = cam.x + SUN[0] * SUN_D;
    const sy0 = cam.y + SUN[1] * SUN_D;
    const sz0 = cam.z + SUN[2] * SUN_D;
    for (let i = 0; i < SUN_N; i++) {
      const p = PL.lo + i, j = p * 3;
      const a = sunA[i] + (sunK[i] === 2 ? sunSpin : 0);
      const ca = Math.cos(a), sa = Math.sin(a);
      const wx = sx0 + (se1[0] * ca + se2[0] * sa) * sunR[i] + SUN[0] * sunD[i];
      const wy = sy0 + (se1[1] * ca + se2[1] * sa) * sunR[i] + SUN[1] * sunD[i];
      const wz = sz0 + (se1[2] * ca + se2[2] * sa) * sunR[i] + SUN[2] * sunD[i];
      if (!cam.project(wx, wy, wz)) {
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1;
        continue;
      }
      // pin z: o[2] at 30k depth flattens the shader's perspective term
      // to ~0 - the compass keeps fixed size/brightness instead
      home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = 0;
      if (snapMode) snap[p] = 1;
      const L = sunLum[i];
      hcol[j] = sunCol[i * 3] * L; hcol[j + 1] = sunCol[i * 3 + 1] * L; hcol[j + 2] = sunCol[i * 3 + 2] * L;
    }
    // where the canopy glare lands: deck clips a warm bloom to the panes
    if (cam.project(sx0, sy0, sz0)) {
      course.sunVis = true; course.sunX = o[0]; course.sunY = o[1];
    } else course.sunVis = false;

    // derelict: tumble about the transverse V axis, respawn far ahead
    // once it falls behind - the wreck recurs through the run
    lm.spin += dt * 0.05;
    {
      const dx = lm.x - cam.x, dy = lm.y - cam.y, dz = lm.z - cam.z;
      const ax = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
      if (!lm.done && ax < -3000) spawnLm(); // blew past it: signal re-arms ahead
      const ca = Math.cos(lm.spin), sa = Math.sin(lm.spin);
      const blink = Math.sin(stT * 2.6) > 0.35;
      for (let i = 0; i < LMK_N; i++) {
        const p = lm.lo + i, j = p * 3;
        const bx = lmb[i * 3], by = lmb[i * 3 + 1], bz = lmb[i * 3 + 2];
        const rx = bx * ca - by * sa, ry = bx * sa + by * ca;
        const wx = lm.x + lm.D[0] * rx + lm.U[0] * ry + lm.V[0] * bz;
        const wy = lm.y + lm.D[1] * rx + lm.U[1] * ry + lm.V[1] * bz;
        const wz = lm.z + lm.D[2] * rx + lm.U[2] * ry + lm.V[2] * bz;
        if (!cam.project(wx, wy, wz)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = Math.max(o[2], -3); // same depth floor as planets
        if (snapMode) snap[p] = 1;
        const k = lmKind[i];
        // beacon blinks hard, embers flicker like dying fires, debris
        // stays small and dim so the cloud reads behind the hull
        const L = k === 2 ? (blink ? 1.9 : 0.08)
          : k === 4 ? 0.3 + (Math.sin(stT * 9 + i * 12.93) > 0.7 ? 1.4 : 0)
          : 1;
        size[p] = k === 2 ? 2.1 : k === 3 ? 1.15 : k === 4 ? 1.5 : k === 1 ? 1.35 : 1.7;
        hcol[j] = lmCol[i * 3] * L; hcol[j + 1] = lmCol[i * 3 + 1] * L; hcol[j + 2] = lmCol[i * 3 + 2] * L;
      }
    }

    // planets: respawn when the center exits; shell is static offsets,
    // ring members rotate slowly around the axis
    for (const pl of planets) {
      pl.spin += pl.spinV * dt;
      const dx = pl.x - cam.x, dy = pl.y - cam.y, dz = pl.z - cam.z;
      const ax = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
      if (dx * dx + dy * dy + dz * dz > 1.2e8 || ax < -2600) spawnPlanet(pl);
      // viewer dir drives the limb: an explicit silhouette ring in the
      // plane facing the camera is what makes a sparse point-sphere read
      // as a body from any distance; far-hemisphere shell dims for depth
      const vdx = cam.x - pl.x, vdy = cam.y - pl.y, vdz = cam.z - pl.z;
      const vl = Math.hypot(vdx, vdy, vdz) || 1;
      const cvx = vdx / vl, cvy = vdy / vl, cvz = vdz / vl;
      let ux = -cvz, uz = cvx;
      const ul = Math.hypot(ux, uz);
      if (ul < 0.05) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }
      const vxx = cvy * uz, vyy = cvz * ux - cvx * uz, vzz = -cvy * ux;
      for (let i = 0; i < pl.rimN; i++) {
        const p = pl.lo + i, j = p * 3;
        const t = (i / pl.rimN) * 6.283, c = Math.cos(t), s2 = Math.sin(t);
        const wx = pl.x + (ux * c + vxx * s2) * pl.R;
        const wy = pl.y + (vyy * s2) * pl.R;
        const wz = pl.z + (uz * c + vzz * s2) * pl.R;
        if (!cam.project(wx, wy, wz)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = Math.max(o[2], -3); // surface points must not crush to sub-pixel
        if (snapMode) snap[p] = 1;
        size[p] = 2.0;
        hcol[j] = pl.col[0] * 1.15; hcol[j + 1] = pl.col[1] * 1.15; hcol[j + 2] = pl.col[2] * 1.15;
      }
      for (let i = 0; i < pl.shellN; i++) {
        const m = pl.rimN + i, p = pl.lo + m, j = p * 3;
        const wx = pl.x + pl.pd[m * 3] * pl.R * pl.pf[m];
        const wy = pl.y + pl.pd[m * 3 + 1] * pl.R * pl.pf[m];
        const wz = pl.z + pl.pd[m * 3 + 2] * pl.R * pl.pf[m];
        if (!cam.project(wx, wy, wz)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = Math.max(o[2], -3);
        if (snapMode) snap[p] = 1;
        const face = pl.pd[m * 3] * cvx + pl.pd[m * 3 + 1] * cvy + pl.pd[m * 3 + 2] * cvz;
        const lim = face < -0.08 ? 0.08 : 1 + Math.max(0, 1 - Math.abs(face) * 5) * 1.8;
        size[p] = pl.psz[m] * (0.75 + lim * 0.55);
        hcol[j] = pl.pcol[m * 3] * lim;
        hcol[j + 1] = pl.pcol[m * 3 + 1] * lim;
        hcol[j + 2] = pl.pcol[m * 3 + 2] * lim;
      }
      for (let m = pl.rimN + pl.shellN; m < pl.n; m++) {
        const p = pl.lo + m, j = p * 3;
        const ca = Math.cos(pl.ra[m] + pl.spin), sa = Math.sin(pl.ra[m] + pl.spin);
        const wx = pl.x + (pl.e1x * ca + pl.e2x * sa) * pl.rr[m] + pl.ax * pl.ry[m];
        const wy = pl.y + (pl.e1y * ca + pl.e2y * sa) * pl.rr[m] + pl.ay * pl.ry[m];
        const wz = pl.z + (pl.e1z * ca + pl.e2z * sa) * pl.rr[m] + pl.az * pl.ry[m];
        if (!cam.project(wx, wy, wz)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = Math.max(o[2], -3);
        if (snapMode) snap[p] = 1;
        size[p] = pl.psz[m];
        hcol[j] = pl.pcol[m * 3]; hcol[j + 1] = pl.pcol[m * 3 + 1]; hcol[j + 2] = pl.pcol[m * 3 + 2];
      }
    }

    // rocks tumble slowly; density ramps with distance, dead rocks park offscreen
    const rockBudget = Math.min(ROCKS, 1 + ((dist / 4000) | 0));
    for (let ri = 0; ri < rocks.length; ri++) {
      const k = rocks[ri];
      k.spin += k.spinV * dt;
      const cs = Math.cos(k.spin), sn = Math.sin(k.spin);
      if (dist > 2500 && ri < rockBudget && (k.dead || k.z > cam.z + 200))
        spawnRock(k, cam.z - 1400 - rnd() * 3200, dist);
      for (let i = 0; i < ROCK_PTS; i++) {
        const p = k.lo + i, j = p * 3;
        if (k.dead) { homed[p] = 0; size[p] = 0; continue; }
        size[p] = 1.1;
        const bx = k.body[i * 3] * cs - k.body[i * 3 + 2] * sn;
        const bz = k.body[i * 3] * sn + k.body[i * 3 + 2] * cs;
        const wx = k.x + bx * k.r, wy = k.y + k.body[i * 3 + 1] * k.r, wz = k.z + bz * k.r;
        if (!cam.project(wx, wy, wz)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = Math.max(o[2], -4);
        if (snapMode) snap[p] = 1;
        hcol[j] = PF.PAL.mist[0] * 0.55;
        hcol[j + 1] = PF.PAL.mist[1] * 0.55;
        hcol[j + 2] = PF.PAL.mist[2] * 0.62;
      }
    }
  };

  return course;
}
