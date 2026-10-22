// cockpit.js - view-locked particle cockpit: canopy struts, dash band, reticle,
// shield motes. Written straight to screen space; sway counters view velocity.
export function createCockpit(field, cam, PF, layer) {
  const rnd = PF.rnd;
  const N = layer.hi - layer.lo;
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock,
    vel = field.vel, pos = field.pos;

  // body point list in normalized cockpit space (x -1..1, y up -1..1)
  // kinds: 0 strut, 1 dash, 2 reticle, 3 console lights
  const pts = [];
  const add = (x, y, kind, j = 0.004) =>
    pts.push([x + (rnd() - 0.5) * j, y + (rnd() - 0.5) * j, kind]);

  // canopy struts: bottom corners converging to a top-center spine
  for (let s = -1; s <= 1; s += 2)
    for (let t = 0; t <= 1; t += 1 / 95) {
      const bend = Math.sin(t * Math.PI) * 0.16;
      add(s * (0.86 - t * 0.62 - bend), -1.02 + t * 1.5, 0, 0.006);
    }
  // top canopy arc between the strut tips
  for (let t = -1; t <= 1; t += 1 / 30)
    add(t * 0.24, 0.48 + Math.abs(t) * -0.1 + t * t * 0.03, 0, 0.005);
  // dash band across the bottom
  for (let t = 0; t < 300; t++) {
    const x = (rnd() - 0.5) * 1.5;
    const y = -0.86 - Math.abs(x) * 0.16 + (rnd() - 0.5) * 0.055;
    add(x, y, 1, 0.002);
  }
  // console lights on the dash
  for (let t = 0; t < 46; t++)
    add((rnd() - 0.5) * 1.2, -0.845 - Math.abs((rnd() - 0.5) * 1.2) * 0.05, 3, 0.002);
  // reticle: ring + ticks + pip, immune to shed
  for (let t = 0; t < 44; t++) {
    const a = (t / 44) * 6.283;
    add(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 2, 0.0008);
  }
  for (let t = 0; t < 4; t++) {
    const a = t * 1.5708;
    for (let k = 1; k <= 3; k++)
      add(Math.cos(a) * (0.045 + k * 0.012), Math.sin(a) * (0.045 + k * 0.012), 2, 0.0006);
  }
  add(0, 0, 2, 0.0005);

  // shield motes: first MOTE_N*MOTE_PTS indices of the layer, orbiting ellipse
  const MOTES = 6, MOTE_PTS = Math.max(6, ((N - pts.length) / MOTES) | 0);
  const S = pts.length;
  const body = new Float32Array(S * 3);
  const baseCol = new Float32Array(S * 3);
  for (let i = 0; i < S; i++) {
    body[i * 3] = pts[i][0];
    body[i * 3 + 1] = pts[i][1];
    body[i * 3 + 2] = pts[i][2];
    const kind = pts[i][2];
    const c =
      kind === 2 ? PF.PAL.accent :
      kind === 3 ? (rnd() < 0.3 ? PF.PAL.accent : PF.PAL.mist) :
      kind === 1 ? PF.PAL.ink : PF.PAL.mist;
    const g = kind === 2 ? 1.15 : kind === 3 ? 0.9 : kind === 1 ? 0.5 : 0.75;
    baseCol[i * 3] = c[0] * g;
    baseCol[i * 3 + 1] = c[1] * g;
    baseCol[i * 3 + 2] = c[2] * g;
  }
  for (let i = 0; i < N; i++) {
    const p = layer.lo + i;
    noFlock[p] = 1;
    size[p] = i < MOTES * MOTE_PTS ? 1.4 : 0.85;
  }

  const shed = new Float32Array(N); // >0 = released, counts down
  let swayX = 0, swayY = 0, moteA = 0;
  const cockpit = {};

  cockpit.shed = (n, mag = 60) => {
    for (let k = 0, tries = 0; k < n && tries < n * 8; tries++) {
      const bi = (rnd() * S) | 0;
      if (pts[bi][2] === 2) continue; // reticle can't shed
      const li = MOTES * MOTE_PTS + bi;
      if (li >= N || shed[li] > 0) continue;
      const p = layer.lo + li, j = p * 3;
      shed[li] = 1.4 + rnd() * 0.6;
      homed[p] = 0;
      vel[j] += (rnd() - 0.5) * mag;
      vel[j + 1] += mag * (0.5 + rnd() * 0.8); // shed falls, screen y is down
      k++;
    }
  };

  cockpit.frame = (dt, run) => {
    moteA += dt * 0.9;
    // inverse view-space velocity sway, smoothed
    const vvx = cam.right[0] * cam.vx + cam.right[1] * cam.vy + cam.right[2] * cam.vz;
    const vvy = cam.up[0] * cam.vx + cam.up[1] * cam.vy + cam.up[2] * cam.vz;
    const k = Math.min(1, dt * 5);
    swayX += (Math.max(-0.12, Math.min(0.12, -vvx * 0.0002)) - swayX) * k;
    swayY += (Math.max(-0.12, Math.min(0.12, vvy * 0.0002)) - swayY) * k;
    const blink = run.invuln > 0 ? (Math.sin(run.invuln * 30) > 0 ? 0.35 : 1) : 1;
    const scale = Math.min(innerWidth, innerHeight) * 0.52;
    const roll = -cam.roll * 0.4;
    const cosr = Math.cos(roll), sinr = Math.sin(roll);
    const shx = cam.ox * 0.45 + (Math.random() - 0.5) * run.jitter * 14;
    const shy = cam.oy * 0.45 + (Math.random() - 0.5) * run.jitter * 14;

    for (let i = 0; i < N; i++) {
      const p = layer.lo + i, j = p * 3;
      if (i < MOTES * MOTE_PTS) {
        // shield motes orbit an ellipse around mid-canopy
        const m = (i / MOTE_PTS) | 0;
        if (m >= run.shield) {
          homed[p] = 0; size[p] = 0;
          continue;
        }
        homed[p] = 1; size[p] = 1.4;
        const a = moteA + m * 1.047 + (i % MOTE_PTS) * 0.11;
        const ex = Math.cos(a) * 0.19, ey = Math.sin(a) * 0.115;
        home[j] = cam.cx + ex * scale + shx;
        home[j + 1] = cam.cy - ey * scale + shy;
        home[j + 2] = 3.2;
        hcol[j] = PF.PAL.sky[0] * 1.2;
        hcol[j + 1] = PF.PAL.sky[1] * 1.2;
        hcol[j + 2] = PF.PAL.sky[2] * 1.3;
        continue;
      }
      const bi = i - MOTES * MOTE_PTS;
      if (bi >= S) { homed[p] = 0; size[p] = 0; continue; }
      if (shed[i] > 0) {
        shed[i] -= dt;
        if (shed[i] <= 0) homed[p] = 1; // spring pulls the shed particle back into formation
        continue;
      }
      homed[p] = 1;
      const bx = body[bi * 3], by = body[bi * 3 + 1];
      const rx = bx * cosr - by * sinr, ry = bx * sinr + by * cosr;
      home[j] = cam.cx + rx * scale + swayX * scale + shx;
      home[j + 1] = cam.cy - ry * scale + swayY * scale + shy;
      home[j + 2] = 3.2;
      hcol[j] = baseCol[bi * 3] * blink;
      hcol[j + 1] = baseCol[bi * 3 + 1] * blink;
      hcol[j + 2] = baseCol[bi * 3 + 2] * blink;
    }
  };

  return cockpit;
}
