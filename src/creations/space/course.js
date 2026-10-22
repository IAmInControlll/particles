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

  // --- stars ---
  const S = layers.stars;
  const SN = S.hi - S.lo;
  const SPAN = 6000;
  const sx = new Float32Array(SN), sy = new Float32Array(SN), sz = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    const z = cam.z - rnd() * SPAN;
    const a = rnd() * 6.283, rr = 320 + rnd() * 1200;
    sx[i] = trackX(z) + Math.cos(a) * rr;
    sy[i] = trackY(z) + Math.sin(a) * rr * 0.7;
    sz[i] = z;
    const p = S.lo + i, j = p * 3;
    noFlock[p] = 1;
    size[p] = 0.5 + rnd() * 1.0;
    const c = rnd();
    const cc = c < 0.6 ? PF.PAL.mist : c < 0.88 ? PF.PAL.sky : PF.PAL.ink;
    const g = 0.45 + rnd() * 0.8;
    hcol[j] = cc[0] * g; hcol[j + 1] = cc[1] * g; hcol[j + 2] = cc[2] * g;
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

  const course = { trackX, trackY, gates, rocks };

  const gateGap = (dist) => 560 + Math.min(420, dist * 0.02) + rnd() * 140;
  const gateR = (dist) => Math.max(19, 34 - dist * 0.0007);

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

  course.frame = (dt, snapMode) => {
    const o = cam.out;
    for (let i = 0; i < SN; i++) {
      const p = S.lo + i, j = p * 3;
      if (sz[i] > cam.z + 60) sz[i] -= SPAN;
      if (!cam.project(sx[i], sy[i], sz[i])) {
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1;
        continue;
      }
      home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = o[2];
      if (snapMode) snap[p] = 1;
    }

    // recycle + write gates; nearest pending gate gets the highlight
    let front = 1e9, next = null;
    for (const g of gates) {
      if (g.z < front) front = g.z;
      if (g.state === 0 && g.z < cam.z && (!next || g.z > next.z)) next = g;
    }
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
        home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = o[2];
        if (snapMode) snap[p] = 1;
        const f = g.flash;
        const guide = i >= 124;
        const c = f > 0 ? PF.PAL.accent : guide || isNext ? PF.PAL.accent : g.state === 0 ? PF.PAL.mist : PF.PAL.dim;
        const b = f > 0 ? 1.5 : guide ? 1.25 : isNext ? 1.15 : g.state === 0 ? 0.8 : 0.4;
        hcol[j] = c[0] * b; hcol[j + 1] = c[1] * b; hcol[j + 2] = c[2] * b;
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
        home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = o[2];
        if (snapMode) snap[p] = 1;
        hcol[j] = PF.PAL.mist[0] * 0.55;
        hcol[j + 1] = PF.PAL.mist[1] * 0.55;
        hcol[j + 2] = PF.PAL.mist[2] * 0.62;
      }
    }
  };

  return course;
}
