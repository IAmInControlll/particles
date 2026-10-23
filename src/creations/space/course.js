// course.js - corridor path, starfield shell, gate kinds, rocks + rubble fields.
// Bodies are fixed design-space point lists rigidly anchored to world
// positions, projected through cam.project into home[] every frame.
import { createSky } from "./sky.js";

export function createCourse(field, cam, PF, layers) {
  const rnd = PF.rnd;
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock;

  // wandering corridor: deterministic sine offsets along the -z track axis
  const trackX = (z) => 230 * Math.sin(z / 2400) + 120 * Math.sin(z / 900 + 2.1);
  const trackY = (z) => 150 * Math.cos(z / 3100) + 90 * Math.sin(z / 1100 + 1.3);

  // sun direction: the sky compass and the single light every body shares
  const sd = [-0.3, 0.45, -0.84];
  const sl2 = Math.hypot(sd[0], sd[1], sd[2]);
  const SUN = [sd[0] / sl2, sd[1] / sl2, sd[2] / sl2];
  const LIGHT = SUN;
  // painted backdrop + the leg's giant world; its particles take the
  // planets layer's tail
  const PL = layers.planets;
  const GI_N = Math.min(420, ((PL.hi - PL.lo) * 0.19) | 0);
  const sky = createSky(field, cam, PF, { lo: PL.hi - GI_N, hi: PL.hi }, SUN);

  // --- stars: two tables on the stars layer, glints on its tail.
  // FAR (fd dir, fCol rgb*lum, fSz, fTw): a celestial sphere at infinity.
  // Directions are baked once with a magnitude law (many faint, a few
  // bright), densest along the galactic band, and projected as direction
  // only - they turn with the view and never slide past or respawn.
  // NEAR (nx/ny/nz world pos, nCol, nSz, nk 0 mote | 1 hero): dust motes in
  // a tunnel around the flight axis - the parallax and speed cue, dimmer
  // and smaller than the far sky, tinted by the sky mood, recycled once
  // passed. A few heroes ride ahead and swell as you close on them.
  const S = layers.stars;
  const GL = S.hi - S.lo > 1500 ? 14 : 4, GLN = GL * 9;
  const SN = S.hi - S.lo - GLN;
  const FN = (SN * 0.75) | 0, NN = SN - FN, NLO = S.lo + FN;
  const FAR_Z = 1.2; // shader depth where the sprite fade term is 1
  const PZ = PF.CFG.perspZ;
  // own seeded stream: the sky is the same every run, and its bake must
  // not shift PF.rnd's gate/rock sequence
  let seed = 7411;
  const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // galactic band plane, shared with the painted glow under it
  const { n: bn, e1: be1, e2: be2 } = sky.band;

  const fd = new Float32Array(FN * 3), fCol = new Float32Array(FN * 3);
  const fSz = new Float32Array(FN), fTw = new Float32Array(FN);
  // N(<m) grows ~2.5x per magnitude: inverse CDF of that law on [m0, m1]
  const magIn = (m0, m1) => {
    const a = Math.pow(2.5, m0), b = Math.pow(2.5, m1);
    return Math.log(a + srnd() * (b - a)) / Math.log(2.5);
  };
  const BAND_C = [[0.7, 0.78, 0.95], PF.PAL.mist, [0.9, 0.75, 0.65]];
  const STAR_C = [[0.62, 0.76, 1.0], [1.0, 0.82, 0.6], [1.0, 0.6, 0.48], PF.PAL.ink];
  for (let i = 0; i < FN; i++) {
    const band = i % 20 < 11; // ~55% of the sphere crowds the band
    let dx, dy, dz, m;
    if (band) {
      const t = srnd() * 6.283;
      const off = (srnd() + srnd() + srnd() - 1.5) * (srnd() < 0.7 ? 0.09 : 0.36); // tight core, wide skirt
      dx = be1[0] * Math.cos(t) + be2[0] * Math.sin(t) + bn[0] * off;
      dy = be1[1] * Math.cos(t) + be2[1] * Math.sin(t) + bn[1] * off;
      dz = be1[2] * Math.cos(t) + be2[2] * Math.sin(t) + bn[2] * off;
      m = magIn(2, 7);
    } else {
      const u = srnd() * 2 - 1, a = srnd() * 6.283, w = Math.sqrt(1 - u * u);
      dx = Math.cos(a) * w; dy = u; dz = Math.sin(a) * w;
      m = magIn(-1, 6.5);
    }
    const dl = Math.hypot(dx, dy, dz);
    fd[i * 3] = dx / dl; fd[i * 3 + 1] = dy / dl; fd[i * 3 + 2] = dz / dl;
    // flux 10^(-0.4m) spans ~400x; compress it into what a sprite can show
    const fl = Math.pow(10, -0.4 * m);
    const lum = (band ? 0.42 : 0.5) + Math.pow(fl, 0.35);
    fSz[i] = 0.5 + 1.4 * Math.pow(fl, 0.45);
    const c = srnd();
    const cc = band ? BAND_C[c < 0.5 ? 0 : c < 0.8 ? 1 : 2]
      : STAR_C[c < 0.2 ? 0 : c < 0.32 ? 1 : c < 0.37 ? 2 : 3];
    fTw[i] = !band && m < 4 && srnd() < 0.15 ? 1.6 + srnd() * 3.4 : 0;
    fCol[i * 3] = cc[0] * lum; fCol[i * 3 + 1] = cc[1] * lum; fCol[i * 3 + 2] = cc[2] * lum;
    const p = S.lo + i, j = p * 3;
    noFlock[p] = 1; homed[p] = 1; size[p] = fSz[i];
    hcol[j] = fCol[i * 3]; hcol[j + 1] = fCol[i * 3 + 1]; hcol[j + 2] = fCol[i * 3 + 2];
  }

  const nx = new Float32Array(NN), ny = new Float32Array(NN), nz = new Float32Array(NN);
  const nCol = new Float32Array(NN * 3), nSz = new Float32Array(NN), nk = new Uint8Array(NN);
  const NEAR_R = 3000, NEAR_R2 = NEAR_R * NEAR_R;
  // tunnel around the flight axis: axial ~2.6k ahead / ~1.2k behind
  // (motion drains forward stock into the tail), lateral disc for the
  // periphery. Heroes always spawn deep ahead so you close on them.
  const respawnNear = (i) => {
    const hero = nk[i] === 1;
    const ax = hero ? 2300 + rnd() * 600 : rnd() < 0.66 ? 150 + rnd() * 2500 : -(100 + rnd() * 1100);
    const b = rnd() * 6.283, lr = hero ? 250 + rnd() * 900 : Math.sqrt(rnd()) * 1300;
    nx[i] = cam.x + cam.fwd[0] * ax + (cam.right[0] * Math.cos(b) + cam.up[0] * Math.sin(b)) * lr;
    ny[i] = cam.y + cam.fwd[1] * ax + (cam.right[1] * Math.cos(b) + cam.up[1] * Math.sin(b)) * lr;
    nz[i] = cam.z + cam.fwd[2] * ax + (cam.right[2] * Math.cos(b) + cam.up[2] * Math.sin(b)) * lr;
    let cc, lum;
    if (hero) { cc = PF.PAL.ink; lum = 0.8 + rnd() * 0.3; nSz[i] = 0.8 + rnd() * 0.3; }
    else {
      const h = sky.haze(rnd()), d = PF.PAL.dim;
      cc = [d[0] * 0.4 + h[0] * 0.6, d[1] * 0.4 + h[1] * 0.6, d[2] * 0.4 + h[2] * 0.6];
      lum = 0.15 + rnd() * 0.25;
      nSz[i] = 0.3 + rnd() * 0.35;
    }
    nCol[i * 3] = cc[0] * lum; nCol[i * 3 + 1] = cc[1] * lum; nCol[i * 3 + 2] = cc[2] * lum;
  };
  const HEROES = Math.min(10, NN >> 6);
  for (let i = 0; i < NN; i++) {
    nk[i] = i < HEROES ? 1 : 0;
    respawnNear(i);
    noFlock[NLO + i] = 1;
  }
  const glD = new Float32Array(GL * 3), glC = new Float32Array(GL * 3), glS = new Float32Array(GL);
  for (let k = 0; k < GL; k++) {
    // mostly in the forward half-sky, a couple behind
    const yaw = (rnd() - 0.5) * (k < GL - 3 ? 2.8 : 6.2), pitch = (rnd() - 0.5) * 1.3;
    glD[k * 3] = Math.sin(yaw) * Math.cos(pitch);
    glD[k * 3 + 1] = Math.sin(pitch);
    glD[k * 3 + 2] = -Math.cos(yaw) * Math.cos(pitch);
    const c = k % 3 === 0 ? [0.7, 0.82, 1.0] : k % 3 === 1 ? [1.0, 0.86, 0.66] : PF.PAL.ink;
    glC[k * 3] = c[0]; glC[k * 3 + 1] = c[1]; glC[k * 3 + 2] = c[2];
    glS[k] = 0.8 + rnd() * 0.5;
    for (let m = 0; m < 9; m++) noFlock[S.hi - GLN + k * 9 + m] = 1;
  }

  // --- gates: ring bodies in the xy plane at a corridor point ---
  const C = layers.course;
  const CN = C.hi - C.lo;
  const GATE_PTS = 128, ROCK_PTS = 230;
  const GATES = Math.max(3, Math.min(9, (CN / 2 / GATE_PTS) | 0));
  const ROCKS = Math.max(0, Math.min(5, ((CN - GATES * GATE_PTS) / ROCK_PTS) | 0));
  // rubble: small rocks from the course tail, packed into rock-field stretches
  const RUB_PTS = 36;
  const RUBS = Math.max(0, Math.min(16, ((CN - GATES * GATE_PTS - ROCKS * ROCK_PTS) / RUB_PTS) | 0));

  // gate shapes: unit xy + a role per point. Roles: 0 rim, 1 tick mark
  // just outside the rim, 2 guide light on the ring's top, 3 crossbar
  // (laid along local x, rotated by g.ang per frame)
  const bakeGate = (barN) => {
    const xy = new Float32Array(GATE_PTS * 2), role = new Uint8Array(GATE_PTS);
    const rimN = 104 - barN;
    for (let i = 0; i < GATE_PTS; i++) {
      let a, rr;
      if (i < rimN) { a = (i / rimN) * 6.283; rr = 1; }
      else if (i < 104) {
        role[i] = 3;
        xy[i * 2] = -0.94 + ((i - rimN) / (barN - 1)) * 1.88;
        continue;
      } else if (i < 124) { role[i] = 1; a = ((i - 104) / 20) * 6.283; rr = 1.09; }
      else { role[i] = 2; a = -1.5708 + (i - 124) * 0.09; rr = 0.82; }
      xy[i * 2] = Math.cos(a) * rr; xy[i * 2 + 1] = Math.sin(a) * rr;
    }
    return { xy, role };
  };
  const RING = bakeGate(0), SPIN = bakeGate(30);
  const BAR_HW = 0.17; // crossbar clip half-width, in gate radii

  // gate kinds: one row drives spawn mix, motion, collision, paint and the
  // first-sighting intro. unlock = first campaign stage (run.legs; 3 =
  // endless) that rolls it; w = roll weight; ramp = extra weight per 20k
  // flown in endless. Optional hooks: spawn(g) seeds per-gate state,
  // move(g, dt) runs per frame and sets the autopilot aim g.ax/g.ay,
  // hit(g, dx, dy) turns an inner-ring pass into a clip. field: the
  // corridor segment leading up to this gate fills with rubble.
  const GOLD = [1.0, 0.76, 0.28], VIOLET = [0.62, 0.5, 1.0], BAR = [1.0, 0.36, 0.24],
    RUBC = [0.78, 0.64, 0.52];
  const KINDS = {
    ring: { shape: RING, col: PF.PAL.sky, unlock: 0, w: 3, ramp: 0 },
    drift: {
      shape: RING, col: VIOLET, unlock: 0, w: 2, ramp: 0.5,
      intro: "drifting relay - lost station-keeping, track it", hex: "#a090ff",
      spawn: (g) => { g.ph = rnd() * 6.283; g.amp = 40 + rnd() * 45; },
      move: (g) => {
        // slow lissajous around the corridor point - readable, trackable
        g.x = g.bx + Math.sin(stT * 0.8 + g.ph) * g.amp;
        g.y = g.by + Math.sin(stT * 0.55 + g.ph * 1.7) * g.amp * 0.45;
        g.ax = g.x; g.ay = g.y;
      },
    },
    boost: {
      shape: RING, col: GOLD, unlock: 1, w: 0.8, ramp: 0,
      intro: "overcharged relay - burn through for boost", hex: "#ffc247",
    },
    rocks: {
      shape: RING, col: PF.PAL.sky, unlock: 1, w: 1.2, ramp: 0.6, field: true,
      intro: "debris field - relay chain runs through it", hex: "#c8b49a",
    },
    spin: {
      shape: SPIN, col: PF.PAL.sky, unlock: 2, w: 1.8, ramp: 0.8,
      intro: "damaged relay - thread the gap", hex: "#ff6a4a",
      spawn: (g) => { g.ang = rnd() * 3.1416; g.spinV = (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.35); },
      move: (g, dt) => {
        g.ang += g.spinV * dt;
        // autopilot: aim at the middle of an open half where the bar will
        // be at arrival time - converges as the gate closes
        const tA = Math.max(0, cam.z - g.z) / Math.max(250, cam.speed);
        const a = g.ang + g.spinV * tA;
        g.ax = g.x - Math.sin(a) * g.r * 0.48;
        g.ay = g.y + Math.cos(a) * g.r * 0.48;
      },
      hit: (g, dx, dy) => Math.abs(-dx * Math.sin(g.ang) + dy * Math.cos(g.ang)) < g.r * BAR_HW,
    },
  };
  // leg 1 opens on a scripted tutorial run before the rolls take over
  const OPENING = ["ring", "ring", "ring", "drift", "ring", "ring", "boost", "ring", "drift"];

  const gates = [];
  for (let g = 0; g < GATES; g++)
    gates.push({ z: 0, x: 0, y: 0, bx: 0, by: 0, ax: 0, ay: 0, r: 30, state: 0, flash: 0,
      kind: "ring", ang: 0, spinV: 0, ph: 0, amp: 0, lo: C.lo + g * GATE_PTS });

  const lumpBody = (n) => {
    const body = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // lumpy sphere: random direction, radius modulated by low-freq lumps
      const a = rnd() * 6.283, b = Math.acos(2 * rnd() - 1);
      const lump = 0.68 + 0.32 * Math.sin(a * 3 + b * 5) + rnd() * 0.18;
      body[i * 3] = Math.sin(b) * Math.cos(a) * lump;
      body[i * 3 + 1] = Math.cos(b) * lump;
      body[i * 3 + 2] = Math.sin(b) * Math.sin(a) * lump;
    }
    return body;
  };
  const rocks = [];
  for (let r = 0; r < ROCKS + RUBS; r++) {
    const rub = r >= ROCKS;
    rocks.push({ x: 0, y: 0, z: 0, r: 40, spin: rnd() * 6.283, spinV: 0.1 + rnd() * 0.3,
      lo: rub ? C.lo + GATES * GATE_PTS + ROCKS * ROCK_PTS + (r - ROCKS) * RUB_PTS : C.lo + GATES * GATE_PTS + r * ROCK_PTS,
      n: rub ? RUB_PTS : ROCK_PTS, rub, body: lumpBody(rub ? RUB_PTS : ROCK_PTS), dead: true });
  }

  // --- planets: procedural landmarks floating beside the corridor.
  // Each planet bakes a point-cloud sphere (hemisphere-shaded so it reads
  // as a lit ball) plus 0-2 ring bands in its equatorial plane. World-
  // anchored; respawns far ahead when it exits behind, so they double
  // as heading markers you can actually fly up to.
  const PN = PL.hi - PL.lo - GI_N;
  // sun: a compass fixed at infinite range in a constant world direction.
  // It rides WITH the camera (no parallax) so it never leaves the sky;
  // the same vector is the planets' light source so shading agrees.
  const SUN_N = Math.min(150, Math.max(40, (PN * 0.15) | 0));
  const SUN_D = 30000;
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

  // --- carrier: the derelict capital ship, a slow landmark off the
  // racing line. Part list, one row per point: local pos lmb (x = spine,
  // bow at -x; y dorsal; z beam), local outward normal lmN (zero = seen
  // from every side: debris), rgb*lum lmCol, grain lmG (wu to the next
  // point - sets how far a sprite grows up close so plates merge into a
  // surface), role lmKind. The frame pass tumbles it about local z (the
  // world V axis), culls points facing away, and sun-shades the plating.
  const PLATE = 0, EDGE = 1, WIN = 2, BAY = 3, NAV = 4, BEACON = 5, EMBER = 6, DEBRIS = 7;
  const ROLE_SZ = [1.0, 1.25, 1.0, 1.2, 1.5, 2.1, 1.5, 0.9]; // sprite floor at range
  const LM_CAP = 1000;
  const lmb = new Float32Array(LM_CAP * 3), lmN = new Float32Array(LM_CAP * 3);
  const lmCol = new Float32Array(LM_CAP * 3), lmG = new Float32Array(LM_CAP);
  const lmKind = new Uint8Array(LM_CAP);
  let LMK_N = 0;
  {
    const lp = (x, y, z, n, k, c, l, gr) => {
      const i = LMK_N++;
      lmb[i * 3] = x; lmb[i * 3 + 1] = y; lmb[i * 3 + 2] = z;
      lmN[i * 3] = n[0]; lmN[i * 3 + 1] = n[1]; lmN[i * 3 + 2] = n[2];
      lmKind[i] = k; lmG[i] = gr;
      lmCol[i * 3] = c[0] * l; lmCol[i * 3 + 1] = c[1] * l; lmCol[i * 3 + 2] = c[2] * l;
    };
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const STEEL = [0.4, 0.47, 0.58], RIM = [0.62, 0.74, 0.92], WARM = [0.95, 0.72, 0.42],
      BAYC = [0.7, 0.9, 1.0], AMBER = [1.0, 0.66, 0.3], BEAC = [1.0, 0.3, 0.28], EMB = [1.0, 0.5, 0.26];
    // hull stations along the spine: [x, half-height, half-beam]
    const HS = [[-140, 2, 4], [-104, 7, 12], [-64, 10, 16], [88, 10, 16], [98, 13, 19], [128, 13, 19]];
    const hullAt = (x) => { // half-height/beam at x, for windows and lights
      for (let s = 1; s < HS.length; s++) if (x <= HS[s][0]) {
        const a = HS[s - 1], b = HS[s], u = (x - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      }
      return [HS[5][1], HS[5][2]];
    };
    // bay: open on both flanks amidships, pods launch from here
    const BX0 = -34, BX1 = 6, BY0 = -8, BY1 = 3, BW = HS[2][2];
    const inBay = (p) => Math.abs(p[2]) > BW - 0.5 && p[0] > BX0 && p[0] < BX1 && p[1] > BY0 && p[1] < BY1;
    // faces as quads a-b-c-d (bilinear), oriented by an outward hint
    const quads = [];
    const quad = (a, b, c, d, hint) => {
      let n = nrm(crs(sub(b, a), sub(d, a)));
      if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = [-n[0], -n[1], -n[2]];
      quads.push({ a, b, c, d, n, area: Math.hypot(...crs(sub(b, a), sub(d, a))) });
    };
    for (let s = 0; s < HS.length - 1; s++) {
      const [x0, h0, w0] = HS[s], [x1, h1, w1] = HS[s + 1];
      for (const sy of [1, -1]) quad([x0, sy * h0, -w0], [x1, sy * h1, -w1], [x1, sy * h1, w1], [x0, sy * h0, w0], [0, sy, 0]);
      for (const sz of [1, -1]) quad([x0, -h0, sz * w0], [x1, -h1, sz * w1], [x1, h1, sz * w1], [x0, h0, sz * w0], [0, 0, sz]);
    }
    quad([128, -13, -19], [128, -13, 19], [128, 13, 19], [128, 13, -19], [1, 0, 0]); // stern
    // command tower: tapered block on the dorsal hull, bridge facing the bow
    const TX0 = 30, TX1 = 72, TY0 = 10, TY1 = 27, TW0 = 7, TW1 = 5;
    quad([TX0, TY0, -TW0], [TX0, TY0, TW0], [TX0, TY1, TW1], [TX0, TY1, -TW1], [-1, 0, 0]);
    quad([TX1, TY0, -TW0], [TX1, TY0, TW0], [TX1, TY1, TW1], [TX1, TY1, -TW1], [1, 0, 0]);
    for (const sz of [1, -1]) quad([TX0, TY0, sz * TW0], [TX1, TY0, sz * TW0], [TX1, TY1, sz * TW1], [TX0, TY1, sz * TW1], [0, 0.3, sz]);
    quad([TX0, TY1, -TW1], [TX1, TY1, -TW1], [TX1, TY1, TW1], [TX0, TY1, TW1], [0, 1, 0]);

    // plates: R2 low-discrepancy fill, area-weighted, run per near-square
    // tile so long faces keep even spacing both ways; a panel-cell hash
    // varies the plating lum
    const PLATE_N = 440;
    const totA = quads.reduce((s, q) => s + q.area, 0);
    const plateG = Math.sqrt(totA / PLATE_N);
    const lerp3 = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
    const onQuad = (q, u, v) => lerp3(lerp3(q.a, q.b, u), lerp3(q.d, q.c, u), v);
    const hash = (a, b, c) => { const h = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return h - Math.floor(h); };
    let r2 = 0;
    quads.forEach((q, qi) => {
      const lu = Math.hypot(...sub(q.b, q.a)), lv = Math.hypot(...sub(q.d, q.a));
      const nu = Math.max(1, Math.round(lu / lv)), nv = Math.max(1, Math.round(lv / lu));
      const want = Math.round((q.area / totA) * PLATE_N);
      for (let t = 0; t < nu * nv; t++) {
        const tw = Math.round(((t + 1) * want) / (nu * nv)) - Math.round((t * want) / (nu * nv));
        for (let got = 0, k = 0; got < tw && k < tw * 3; k++, r2++) {
          const u = ((t % nu) + ((0.5 + r2 * 0.7548776662) % 1)) / nu;
          const v = (((t / nu) | 0) + ((0.5 + r2 * 0.5698402910) % 1)) / nv;
          const p = onQuad(q, u, v);
          if (inBay(p)) continue;
          got++;
          const h = hash(Math.floor(p[0] / 14), Math.floor(p[1] / 4.5) + qi * 7, Math.floor(p[2] / 4.5));
          lp(p[0], p[1], p[2], q.n, PLATE, STEEL, 0.14 + h * 0.08, plateG * 2.2);
        }
      }
    });
    // edges: corner longerons, station frames, tower corners - the lines
    // that hold the silhouette at range; normals point out of the crease
    const segs = [];
    const seg = (a, b, n) => segs.push({ a, b, n: nrm(n), len: Math.hypot(...sub(b, a)) });
    for (const sy of [1, -1]) for (const sz of [1, -1])
      for (let s = 0; s < HS.length - 1; s++)
        seg([HS[s][0], sy * HS[s][1], sz * HS[s][2]], [HS[s + 1][0], sy * HS[s + 1][1], sz * HS[s + 1][2]], [0, sy, sz]);
    for (const [x, h, w] of HS) {
      seg([x, h, -w], [x, h, w], [0, 1, 0]); seg([x, -h, -w], [x, -h, w], [0, -1, 0]);
      seg([x, -h, w], [x, h, w], [0, 0, 1]); seg([x, -h, -w], [x, h, -w], [0, 0, -1]);
    }
    for (const tx of [TX0, TX1]) {
      const fx = tx === TX0 ? -1 : 1;
      for (const sz of [1, -1]) seg([tx, TY0, sz * TW0], [tx, TY1, sz * TW1], [fx, 0, sz]);
      seg([tx, TY1, -TW1], [tx, TY1, TW1], [fx, 1, 0]);
    }
    for (const sz of [1, -1]) seg([TX0, TY1, sz * TW1], [TX1, TY1, sz * TW1], [0, 1, sz]);
    const EDGE_N = 190;
    const edgeG = segs.reduce((s, e) => s + e.len, 0) / EDGE_N;
    for (const e of segs) {
      const n = Math.max(1, Math.round(e.len / edgeG));
      for (let k = 0; k < n; k++) {
        const p = lerp3(e.a, e.b, (k + 0.5) / n);
        lp(p[0], p[1], p[2], e.n, EDGE, RIM, 0.3, edgeG * 2);
      }
    }
    // bay, both flanks: amber frame, lit back wall recessed 6wu
    for (const sz of [1, -1]) {
      const fz = sz * (BW + 0.3), n = [0, 0, sz];
      const per = 2 * (BX1 - BX0 + BY1 - BY0), fn = 24;
      for (let k = 0; k < fn; k++) {
        let d = (k / fn) * per, x, y;
        if (d < BX1 - BX0) { x = BX0 + d; y = BY0; }
        else if ((d -= BX1 - BX0) < BY1 - BY0) { x = BX1; y = BY0 + d; }
        else if ((d -= BY1 - BY0) < BX1 - BX0) { x = BX1 - d; y = BY1; }
        else { x = BX0; y = BY1 - (d - (BX1 - BX0)); }
        lp(x, y, fz, n, BAY, AMBER, 0.9, per / fn);
      }
      for (let gx = 0; gx < 8; gx++) for (let gy = 0; gy < 3; gy++)
        lp(BX0 + 3 + gx * 4.8, BY0 + 2 + gy * 3.2, sz * (BW - 6), n, BAY, BAYC, 0.55 + srnd() * 0.3, 4);
    }
    // window rows: an upper deck lit most of its length, a lower deck
    // sparse, both broken by the bay; bridge strip + tower decks
    for (const sz of [1, -1]) for (const [y, on] of [[4, 0.78], [-4, 0.35]])
      for (let x = -98; x <= 84; x += 5) {
        if ((x > BX0 - 4 && x < BX1 + 4) || srnd() > on) continue;
        const w = hullAt(x)[1];
        lp(x, y, sz * (w + 0.2), [0, 0, sz], WIN, WARM, 0.75 + srnd() * 0.4, 2.5);
      }
    for (let z = -4.5; z <= 4.6; z += 1.3) lp(TX0 - 0.2, 23, z, [-1, 0, 0], WIN, WARM, 1.0, 2);
    for (const sz of [1, -1]) for (let x = 36; x <= 66; x += 6)
      lp(x, 17, sz * (TW0 - 1.2), [0, 0, sz], WIN, WARM, 0.7 + srnd() * 0.3, 2.5);
    // dead engines: three nozzle rims on the stern
    for (const ez of [-11, 0, 11]) for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 6.283;
      lp(131, Math.sin(a) * 5.5, ez + Math.cos(a) * 5.5, [1, 0, 0], EDGE, STEEL, 0.7, 2.9);
    }
    // running lights on the dorsal corners: red port (+z), green starboard
    for (const sz of [1, -1]) for (let x = -120; x <= 80; x += 40) {
      const [h, w] = hullAt(x);
      lp(x, h + 0.4, sz * (w + 0.4), [0, 0.7, sz * 0.7], NAV, sz > 0 ? [1, 0.25, 0.2] : [0.3, 1, 0.45], 1, 3);
    }
    lp(-141, 0, 0, [-1, 0, 0], NAV, PF.PAL.ink, 1, 3);
    lp(52, 28.4, 0, [0, 1, 0], BEACON, BEAC, 1, 3); lp(52, 30, 0, [0, 1, 0], BEACON, BEAC, 1, 3);
    for (let k = 0; k < 10; k++) { // dish on the tower roof
      const a = (k / 10) * 6.283;
      lp(42 + Math.cos(a) * 3, TY1 + 1.5, Math.sin(a) * 3, [0, 1, 0], EDGE, STEEL, 0.8, 2);
    }
    // dying fires on the plating, then a debris cloud tumbling along
    for (let k = 0; k < 14; k++) {
      const q = quads[(srnd() * 20) | 0], p = onQuad(q, srnd(), srnd());
      if (!inBay(p)) lp(p[0], p[1], p[2], q.n, EMBER, EMB, 1, 3);
    }
    for (let k = 0; LMK_N < LM_CAP && k < 50; k++) {
      let x, y, z;
      do {
        x = -150 + srnd() * 320; y = (srnd() - 0.5) * (14 + srnd() * 70); z = (srnd() - 0.5) * (16 + srnd() * 80);
      } while (x > -140 && x < 132 && Math.abs(y) < 15 && Math.abs(z) < 21);
      lp(x, y, z, [0, 0, 0], DEBRIS, STEEL, 0.3 + srnd() * 0.3, 2.5);
    }
  }
  const lm = {
    x: 0, y: 0, z: 0, spin: 0, seq: 0,
    D: [0, 0, -1], U: [0, 1, 0], V: [1, 0, 0],
    lo: PL.lo + SUN_N, n: LMK_N, leg: 0, done: false, legLen: 0,
    bay: { x: 0, y: 0, z: 0 }, // world point the pods launch from, eye side
    kind: lmKind, // role per point, for probes
  };

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

  const course = { trackX, trackY, gates, rocks, planets, landmark: lm, SUN, sky,
    sunVis: false, sunX: 0, sunY: 0,
    respawnLm: (leg) => {
      if (lm.done) return;
      if (leg != null) lm.leg = Math.min(leg, LEGD.length - 1);
      spawnLm();
    },
    finishStory: () => { lm.done = true; endZ = cam.z; },
    stars: { far: { lo: S.lo, n: FN }, near: { lo: NLO, n: NN }, glint: { lo: S.hi - GLN, n: GLN } } };

  const gateGap = (dist) => 740 + Math.min(560, dist * 0.026) + rnd() * 180;
  const gateR = (dist) => Math.max(26, 46 - dist * 0.0009);

  // campaign stage drives the gate mix: run.legs while the story runs,
  // 3 once it is over (lm.leg/lm.done already track exactly that)
  const stage = () => (lm.done ? 3 : lm.leg);
  let spawnSeq = 0, endZ = 0;
  const seen = new Set();
  course.mix = [{}, {}, {}, {}]; // kinds rolled per stage, for probes
  const rollKind = (dist) => {
    const s = stage();
    if (s === 0 && spawnSeq < OPENING.length) return OPENING[spawnSeq];
    const far = s === 3 ? Math.max(0, endZ - cam.z) / 20000 : 0;
    let tot = 0;
    for (const id in KINDS) if (KINDS[id].unlock <= s) tot += KINDS[id].w * (1 + KINDS[id].ramp * far);
    let r = rnd() * tot;
    for (const id in KINDS) {
      const k = KINDS[id];
      if (k.unlock > s) continue;
      r -= k.w * (1 + k.ramp * far);
      if (r <= 0) return id;
    }
    return "ring";
  };

  function spawnGate(g, z, dist, prev) {
    g.z = z;
    g.x = g.bx = g.ax = trackX(z);
    g.y = g.by = g.ay = trackY(z);
    g.r = gateR(dist);
    g.state = 0;
    g.flash = 0;
    let id = rollKind(dist);
    // never two rock fields back to back - the second would start empty
    if (id === "rocks" && prev && prev.kind === "rocks") id = "ring";
    spawnSeq++;
    const m = course.mix[stage()];
    m[id] = (m[id] || 0) + 1;
    setKind(g, id, prev);
  }
  // prev: the gate before g along the corridor (a rock field fills the gap)
  function setKind(g, id, prev) {
    g.kind = id;
    const k = KINDS[id];
    if (k.spawn) k.spawn(g);
    if (k.field && prev) fillField(prev, g);
  }
  course.setKind = setKind; // check.mjs stages each kind in view

  function spawnRock(k, z, dist) {
    const side = rnd() < 0.5 ? -1 : 1;
    k.z = z;
    k.r = 30 + rnd() * 30;
    // keep the rock's edge off the corridor center so a clean line stays flyable
    k.x = trackX(z) + side * (k.r + 15 + rnd() * 80);
    k.y = trackY(z) + (rnd() - 0.5) * 130;
    k.dead = false;
  }

  // rock-field stretch: pack the rubble pool (plus any idle big rocks)
  // into the segment between gate a and gate b. A lane stays clear around
  // both the straight a->b line and b's own axis (a pilot lines up early),
  // so the field is dense but always has a flyable thread.
  function fillField(a, b) {
    const free = rocks.filter((k) => k.dead || k.z > cam.z + 100); // idle or behind us
    const n = free.length;
    for (let i = 0; i < n; i++) {
      const k = free[i];
      k.r = k.rub ? 9 + rnd() * 14 : 26 + rnd() * 20;
      const t = 0.12 + ((i + rnd()) / n) * 0.8;
      k.z = a.z + (b.z - a.z) * t;
      const lx = a.bx + (b.bx - a.bx) * t, ly = a.by + (b.by - a.by) * t;
      const clr = 58 + k.r;
      for (let tries = 0; tries < 8; tries++) {
        const ang = rnd() * 6.283, rr = clr + rnd() * (k.rub ? 150 : 110);
        k.x = lx + Math.cos(ang) * rr;
        k.y = ly + Math.sin(ang) * rr * 0.8;
        if (Math.hypot(k.x - b.bx, k.y - b.by) > clr && Math.hypot(k.x - lx, k.y - ly) > clr) break;
      }
      k.dead = false;
    }
  }

  course.reset = () => {
    lm.leg = 0; lm.done = false; // each run replays the campaign fresh
    spawnSeq = 0; endZ = 0;
    sky.reset();
    seen.clear();
    for (const m of course.mix) for (const id in m) delete m[id];
    for (const k of rocks) k.dead = true;
    let z = -1100, prev = null;
    for (const g of gates) { spawnGate(g, z, 0, prev); prev = g; z -= gateGap(0); }
    spawnLm();
  };
  course.reset();

  // returns events for the frame: {type:"pass"|"clip"|"miss"|"rock", kind, gate?}
  course.check = (prevZ) => {
    for (const g of gates) {
      if (g.state !== 0 || g.z > prevZ || g.z <= cam.z) continue;
      const dx = cam.x - g.x, dy = cam.y - g.y, d = Math.hypot(dx, dy);
      const hit = KINDS[g.kind].hit;
      if (d < g.r * 0.78 && !(hit && hit(g, dx, dy))) {
        g.state = 1; g.flash = 1;
        return { type: "pass", kind: g.kind, gate: g };
      }
      g.state = 2;
      return { type: d < g.r * 1.3 ? "clip" : "miss", kind: g.kind, gate: g };
    }
    for (const k of rocks) {
      if (k.dead) continue;
      const dx = cam.x - k.x, dy = cam.y - k.y, dz = cam.z - k.z;
      if (dx * dx + dy * dy + dz * dz < k.r * k.r * 0.49) {
        k.dead = true;
        return { type: "rock", kind: "rock", rock: k };
      }
    }
    return null;
  };

  let stT = 0, sunSpin = 0;
  course.frame = (dt, snapMode) => {
    stT += dt;
    const o = cam.out;
    const starGain = 1 + cam.speedK * 0.75;
    // sky first: the giant's disc this frame occludes the far sphere
    sky.frame(dt, stage(), lm.done ? Math.max(0, ((endZ - cam.z) / 40000) | 0) : 0, snapMode);
    const behindGiant = () => {
      const ex = o[0] - sky.gx, ey = o[1] - sky.gy;
      return ex * ex + ey * ey < sky.gr2 || sky.occluded(o[0], o[1]);
    };
    const hide = (p) => {
      const j = p * 3;
      home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
      snap[p] = 1;
    };
    // far sphere: direction only (1e6 out swamps any eye offset), so zero
    // parallax. Size and colour are baked; only twinklers rewrite colour.
    for (let i = 0; i < FN; i++) {
      const p = S.lo + i, j = p * 3;
      if (!cam.project(cam.x + fd[i * 3] * 1e6, cam.y + fd[i * 3 + 1] * 1e6, cam.z + fd[i * 3 + 2] * 1e6) || behindGiant()) {
        hide(p);
        continue;
      }
      home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = FAR_Z;
      if (snapMode) snap[p] = 1;
      if (fTw[i]) {
        const tw = 0.72 + 0.28 * Math.sin(stT * fTw[i] + i * 1.7);
        hcol[j] = fCol[i * 3] * tw; hcol[j + 1] = fCol[i * 3 + 1] * tw; hcol[j + 2] = fCol[i * 3 + 2] * tw;
      }
    }
    // near motes: real parallax, recycled once passed; they carry the
    // speed cue (swell + brighten), and nearer reads bigger
    const moteSize = 1 + cam.speedK * 0.5;
    for (let i = 0; i < NN; i++) {
      const p = NLO + i, j = p * 3;
      let dx = nx[i] - cam.x, dy = ny[i] - cam.y, dz = nz[i] - cam.z;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > NEAR_R2 || dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2] < -1300) {
        respawnNear(i);
        dx = nx[i] - cam.x; dy = ny[i] - cam.y; dz = nz[i] - cam.z;
        d2 = dx * dx + dy * dy + dz * dz;
      }
      if (!cam.project(nx[i], ny[i], nz[i])) { hide(p); continue; }
      homed[p] = 1;
      home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = FAR_Z;
      if (snapMode) snap[p] = 1;
      const d = Math.sqrt(d2);
      const hero = nk[i] === 1;
      size[p] = hero ? nSz[i] * Math.min(3.2, Math.max(0.8, 1500 / d))
        : nSz[i] * moteSize * (0.75 + 250 / Math.max(250, d));
      const g = hero ? 1 : starGain;
      hcol[j] = nCol[i * 3] * g; hcol[j + 1] = nCol[i * 3 + 1] * g; hcol[j + 2] = nCol[i * 3 + 2] * g;
    }

    // glints: core + four screen-aligned spikes, lengths breathing
    for (let k = 0; k < GL; k++) {
      const p0 = S.hi - GLN + k * 9;
      if (!cam.project(cam.x + glD[k * 3] * 1e6, cam.y + glD[k * 3 + 1] * 1e6, cam.z + glD[k * 3 + 2] * 1e6) || behindGiant()) {
        for (let m = 0; m < 9; m++) {
          const j = (p0 + m) * 3;
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0; snap[p0 + m] = 1;
        }
        continue;
      }
      const x = o[0], y = o[1];
      const tw = 0.8 + 0.2 * Math.sin(stT * 1.7 * glS[k] + k * 2.3);
      const sp = 5.5 * glS[k] * tw;
      for (let m = 0; m < 9; m++) {
        const p = p0 + m, j = p * 3;
        const arm = (m - 1) >> 1, far = (m - 1) & 1;
        const dx = m === 0 ? 0 : arm === 0 ? 1 : arm === 1 ? -1 : 0;
        const dy = m === 0 ? 0 : arm === 2 ? 1 : arm === 3 ? -1 : 0;
        homed[p] = 1;
        home[j] = x + dx * sp * (1 + far); home[j + 1] = y + dy * sp * (1 + far) * 0.9; home[j + 2] = 0.9;
        snap[p] = 1; // screen-locked: spikes must not spring-lag the core
        const L = (m === 0 ? 1.5 : far ? 0.32 : 0.7) * tw * starGain;
        size[p] = (m === 0 ? 2.3 : far ? 0.75 : 1.05) * glS[k];
        hcol[j] = glC[k * 3] * L; hcol[j + 1] = glC[k * 3 + 1] * L; hcol[j + 2] = glC[k * 3 + 2] * L;
      }
    }

    // recycle + write gates; nearest pending gate gets the highlight
    let front = null, next = null;
    for (const g of gates) {
      if (!front || g.z < front.z) front = g;
      if (g.state === 0 && g.z < cam.z && (!next || g.z > next.z)) next = g;
    }
    course.next = next; // cockpit compass reads it
    if (next && !seen.has(next.kind)) {
      seen.add(next.kind);
      const k = KINDS[next.kind];
      if (k.intro && course.onIntro) course.onIntro(k.intro, k.hex);
    }
    const dist = -cam.z;
    for (const g of gates) {
      if (g.z > cam.z + 260) { spawnGate(g, front.z - gateGap(dist), dist, front); front = g; }
      g.flash = Math.max(0, g.flash - dt * 2);
      const K = KINDS[g.kind], sh = K.shape;
      if (K.move) K.move(g, dt);
      const cr = g.r;
      const isNext = g === next;
      const ca = Math.cos(g.ang), sa = Math.sin(g.ang);
      // kinds keep their own colour; plain rings keep the old accent-on-next
      const live = g.kind === "ring" && isNext ? PF.PAL.accent : K.col;
      const pulse = g.kind === "boost" ? 0.85 + 0.3 * Math.sin(stT * 6) : 1;
      for (let i = 0; i < GATE_PTS; i++) {
        const p = g.lo + i, j = p * 3;
        const role = sh.role[i];
        let ux = sh.xy[i * 2], uy = sh.xy[i * 2 + 1];
        if (role === 3) { uy = ux * sa; ux *= ca; }
        if (!cam.project(g.x + ux * cr, g.y + uy * cr, g.z)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = Math.max(o[2], -4); // far gates stay readable rings
        if (snapMode) snap[p] = 1;
        const f = g.flash;
        const guide = role === 2, bar = role === 3 && g.state === 0;
        const c = f > 0 ? PF.PAL.accent : bar ? BAR : guide ? PF.PAL.accent : g.state === 0 ? live : PF.PAL.dim;
        const b = f > 0 ? 1.7 : bar ? 1.45 : guide ? 1.3 : g.state !== 0 ? 0.4 : (isNext ? 1.3 : 0.95) * pulse;
        size[p] = f > 0 ? 1.5 : bar ? 1.5 : guide || isNext ? 1.3 : g.state === 0 ? 1.05 : 0.7;
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
      // tumbled local axes in world: x' = D cos + U sin, y' = U cos - D sin
      const D = lm.D, U = lm.U, V = lm.V;
      const X0 = D[0] * ca + U[0] * sa, X1 = D[1] * ca + U[1] * sa, X2 = D[2] * ca + U[2] * sa;
      const Y0 = U[0] * ca - D[0] * sa, Y1 = U[1] * ca - D[1] * sa, Y2 = U[2] * ca - D[2] * sa;
      // eye and sun in the hull's local frame: facing + shading per point
      const E = cam.eye || cam, ex = E.x - lm.x, ey = E.y - lm.y, ez = E.z - lm.z;
      const elx = ex * X0 + ey * X1 + ez * X2, ely = ex * Y0 + ey * Y1 + ez * Y2, elz = ex * V[0] + ey * V[1] + ez * V[2];
      const llx = LIGHT[0] * X0 + LIGHT[1] * X1 + LIGHT[2] * X2;
      const lly = LIGHT[0] * Y0 + LIGHT[1] * Y1 + LIGHT[2] * Y2;
      const llz = LIGHT[0] * V[0] + LIGHT[1] * V[1] + LIGHT[2] * V[2];
      const bs = elz >= 0 ? 1 : -1; // pods leave from the bay on the eye's side
      lm.bay.x = lm.x - 14 * X0 - 2.5 * Y0 + bs * 10 * V[0];
      lm.bay.y = lm.y - 14 * X1 - 2.5 * Y1 + bs * 10 * V[1];
      lm.bay.z = lm.z - 14 * X2 - 2.5 * Y2 + bs * 10 * V[2];
      const away = !cam.project(lm.x, lm.y, lm.z) && ex * ex + ey * ey + ez * ez > 400 * 400;
      const blink = Math.sin(stT * 2.6) > 0.35;
      sky.shadeBegin();
      for (let i = 0; i < LMK_N; i++) {
        const p = lm.lo + i, j = p * 3;
        if (away) { hide(p); continue; }
        const bx = lmb[i * 3], by = lmb[i * 3 + 1], bz = lmb[i * 3 + 2];
        const nx = lmN[i * 3], ny = lmN[i * 3 + 1], nz = lmN[i * 3 + 2];
        const k = lmKind[i];
        // additive sprites never occlude: drop the far side of the hull so
        // what is left reads as one solid skin. Creases and lights cull late.
        if (k !== DEBRIS) {
          const tx = elx - bx, ty = ely - by, tz = elz - bz;
          const f = nx * tx + ny * ty + nz * tz;
          if (f < (k === EDGE || k === NAV || k === BEACON ? -0.35 * Math.sqrt(tx * tx + ty * ty + tz * tz) : 0)) { hide(p); continue; }
        }
        const wx = lm.x + X0 * bx + Y0 * by + V[0] * bz;
        const wy = lm.y + X1 * bx + Y1 * by + V[1] * bz;
        const wz = lm.z + X2 * bx + Y2 * by + V[2] * bz;
        if (!cam.project(wx, wy, wz)) { hide(p); continue; }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = FAR_Z;
        if (snapMode) snap[p] = 1;
        // grow with closeness so neighbours overlap into a surface: 130 =
        // px-per-size at FAR_Z folded with the 0.72H focal length, so a
        // sprite spans its grain. The soft disc reads over its inner half,
        // so plates and edges bake ~2x their spacing as grain - and low
        // per-point lum, since ~4 sprites stack on every pixel
        const vz = cam.K * (1 - o[2] / PZ);
        size[p] = Math.min(16, Math.max(ROLE_SZ[k], lmG[i] * 130 / vz));
        if ((k === PLATE || k === EDGE) && !lm.boom) {
          const sx = o[0], sy = o[1];
          const r = 0.6 * lmG[i] * cam.f / Math.max(1, Math.hypot(wx - E.x, wy - E.y, wz - E.z));
          if (r > 1) sky.shade(sx, sy, r);
        }
        const sun = Math.max(0, nx * llx + ny * lly + nz * llz);
        const L = k === PLATE ? 0.34 + 0.85 * sun
          : k === EDGE ? 0.5 + 0.7 * sun
          : k === BAY ? 0.85 + 0.15 * Math.sin(stT * 1.3 + bx * 0.2)
          // running lights: a pulse chasing bow to stern
          : k === NAV ? 0.3 + ((((stT * 0.6 - (bx + 141) / 280) % 1) + 1) % 1 < 0.12 ? 1.6 : 0)
          : k === BEACON ? (blink ? 1.9 : 0.08)
          : k === EMBER ? 0.3 + (Math.sin(stT * 9 + i * 12.93) > 0.7 ? 1.4 : 0)
          : 1;
        hcol[j] = lmCol[i * 3] * L; hcol[j + 1] = lmCol[i * 3 + 1] * L; hcol[j + 2] = lmCol[i * 3 + 2] * L;
      }
      sky.shadeEnd();
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
      if (k.rub) { if (k.z > cam.z + 200) k.dead = true; }
      else if (dist > 2500 && ri < rockBudget && (k.dead || k.z > cam.z + 200))
        spawnRock(k, cam.z - 1400 - rnd() * 3200, dist);
      for (let i = 0; i < k.n; i++) {
        const p = k.lo + i, j = p * 3;
        if (k.dead) { homed[p] = 0; size[p] = 0; continue; }
        const bx = k.body[i * 3] * cs - k.body[i * 3 + 2] * sn;
        const bz = k.body[i * 3] * sn + k.body[i * 3 + 2] * cs;
        const by = k.body[i * 3 + 1];
        const wx = k.x + bx * k.r, wy = k.y + by * k.r, wz = k.z + bz * k.r;
        // sunlit face: the lump direction doubles as the surface normal
        const lit = 0.3 + 1.1 * Math.max(0, (bx * LIGHT[0] + by * LIGHT[1] + bz * LIGHT[2]) /
          (Math.hypot(bx, by, bz) || 1));
        size[p] = (k.rub ? 1.7 : 1.1) * (0.8 + lit * 0.3);
        if (!cam.project(wx, wy, wz)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = Math.max(o[2], -4);
        if (snapMode) snap[p] = 1;
        // rubble runs warmer so a field reads as one body of debris
        const rc = k.rub ? RUBC : PF.PAL.mist;
        hcol[j] = rc[0] * 0.55 * lit;
        hcol[j + 1] = rc[1] * 0.55 * lit;
        hcol[j + 2] = rc[2] * 0.62 * lit;
      }
    }
  };

  return course;
}
