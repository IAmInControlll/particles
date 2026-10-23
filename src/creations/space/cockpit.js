// cockpit.js - particles that float inside the view volume: shield motes
// orbiting the canopy, the aim reticle, and the holo compass arrow
// projected over the dash pad (deck.pad is its screen anchor).
// The hull itself is canvas - deck.js paints it from frames.js and culls
// world particles outside the panes, so no dot ever forms the ship.
// kinds: 2 reticle, 5 holo compass (arrow + projector beam)
export function createCockpit(field, cam, PF, layer, pad) {
  const rnd = PF.rnd;
  const N = layer.hi - layer.lo;
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock,
    vel = field.vel;

  const MOTES = 6;
  const pts = [];
  for (let t = 0; t < 12; t++) {
    const a = (t / 12) * 6.283;
    pts.push([Math.cos(a) * 0.032, Math.sin(a) * 0.032, 2, 0]);
  }
  pts.push([0, 0, 3.2, 2, 0]);

  // holo compass table, 4 floats per point: (a, b, role, w). a runs the
  // arrow axis (-0.5 tail .. 0.5 tip), b across it, both in arrow lengths;
  // the arrow is flat and turns about its axis to face the eye, so it
  // never collapses edge-on. roles: 0 head edge (w = leading-edge weight),
  // 1 head fill, 2 shaft, 3 projector beam (a = rise phase, b = side).
  // Mobile layers are a third the size: a lighter table keeps the
  // exterior's tail share.
  const small = N < 1000;
  const nEdge = small ? 44 : 56, nFill = small ? 18 : 34, nShaft = small ? 16 : 24,
    nBeam = small ? 16 : 30;
  const ARROW_N = nEdge + nFill + nShaft + nBeam;
  const al = new Float32Array(ARROW_N * 4);
  {
    const HEAD = [[0.5, 0], [0.02, 0.3], [0.14, 0], [0.02, -0.3]]; // tip, barb, notch, barb
    const segL = HEAD.map((q, k) => {
      const r = HEAD[(k + 1) % 4];
      return Math.hypot(r[0] - q[0], r[1] - q[1]);
    });
    const per = segL.reduce((x, y) => x + y);
    let n = 0;
    const put = (a, b, role, w) => {
      al[n * 4] = a; al[n * 4 + 1] = b; al[n * 4 + 2] = role; al[n * 4 + 3] = w; n++;
    };
    // edge: even arc-length steps round the notched head, so the outline
    // reads crisp; the two tip->barb runs are the leading edge
    for (let k = 0; k < nEdge; k++) {
      let d = (k / nEdge) * per, sg = 0;
      while (d > segL[sg]) d -= segL[sg++];
      const q = HEAD[sg], r = HEAD[(sg + 1) % 4], t = d / segL[sg];
      const lead = sg === 0 ? 1 - t * 0.5 : sg === 3 ? 0.5 + t * 0.5 : 0;
      put(q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t, 0, lead);
    }
    for (let k = 0; k < nFill; k++) {
      // inside one of the two tip-barb-notch triangles
      let u = rnd(), v = rnd();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const B = HEAD[k % 2 ? 1 : 3];
      put(0.5 + (B[0] - 0.5) * u + (0.14 - 0.5) * v, B[1] * u, 1, 0);
    }
    const rail = (nShaft - 4) >> 1;
    for (let k = 0; k < rail * 2; k++) put(-0.5 + ((k >> 1) / (rail - 1)) * 0.62, k & 1 ? 0.045 : -0.045, 2, 0);
    for (let k = 0; k < nShaft - rail * 2; k++) put(-0.5, -0.045 + (k / 3) * 0.09, 2, 0);
    for (let k = 0; k < nBeam; k++) put(k / nBeam, ((k * 0.618034) % 1) * 2 - 1, 3, 0);
  }
  const arrowLo = pts.length;
  // view-space depth of the dash arrow, its length (wu), forward tilt
  const HD = 150, HL = 22, TILT = 0.8, TC = Math.cos(TILT), TS = Math.sin(TILT);
  for (let i = 0; i < ARROW_N; i++) pts.push([0, 0, 3.2, 5, 0]);

  const S = pts.length;
  const body = new Float32Array(S * 5);
  for (let i = 0; i < S; i++) {
    const [x, y, z, kind, aux] = pts[i];
    body[i * 5] = x; body[i * 5 + 1] = y; body[i * 5 + 2] = z;
    body[i * 5 + 3] = kind; body[i * 5 + 4] = aux;
  }
  const MOTE_PTS = Math.max(4, Math.min(small ? 20 : 30, ((N - S) / MOTES) | 0));
  const MOTE_ARC = 3.3 / MOTE_PTS; // a mote's trail spans the same arc at any count
  for (let i = 0; i < N; i++) {
    const p = layer.lo + i;
    noFlock[p] = 1;
    const bi = i - MOTES * MOTE_PTS;
    size[p] = i < MOTES * MOTE_PTS ? 1.4 : bi >= 0 && bi < S ? 1.15 : 0;
  }

  const shed = new Float32Array(N); // >0 = released, counts down
  let swayX = 0, swayY = 0, moteA = 0, holoT = 0;
  // the layer tail [used, N) belongs to exterior.js (chase ship body) -
  // the frame loop and shed() only ever write [0, used)
  const OWN = MOTES * MOTE_PTS + S;
  const cockpit = { pts: S, motes: MOTES * MOTE_PTS, used: OWN };
  // probe handle: the compass slice in field indices, table order
  cockpit.holo = { lo: layer.lo + MOTES * MOTE_PTS + arrowLo, edge: nEdge, fill: nFill, shaft: nShaft, beam: nBeam };

  cockpit.shed = (n, mag = 60) => {
    for (let k = 0, tries = 0; k < n && tries < n * 8; tries++) {
      const li = (rnd() * OWN) | 0;
      if (li >= MOTES * MOTE_PTS) {
        const kind = body[(li - MOTES * MOTE_PTS) * 5 + 3];
        if (kind === 2 || kind === 5) continue; // reticle and compass can't shed
      }
      if (shed[li] > 0) continue;
      const p = layer.lo + li, j = p * 3;
      shed[li] = 1.4 + rnd() * 0.6;
      homed[p] = 0;
      vel[j] += (rnd() - 0.5) * mag;
      vel[j + 1] += mag * (0.5 + rnd() * 0.8); // shed falls, screen y is down
      k++;
    }
  };

  cockpit.frame = (dt, run, world, chase) => {
    moteA += dt * 0.9;
    holoT += dt;
    // inverse view-space velocity sway, smoothed
    const vvx = cam.right[0] * cam.vx + cam.right[1] * cam.vy + cam.right[2] * cam.vz;
    const vvy = cam.up[0] * cam.vx + cam.up[1] * cam.vy + cam.up[2] * cam.vz;
    const k = Math.min(1, dt * 5);
    swayX += (Math.max(-0.12, Math.min(0.12, -vvx * 0.0002)) - swayX) * k;
    swayY += (Math.max(-0.12, Math.min(0.12, vvy * 0.0002)) - swayY) * k;
    const blink = run.invuln > 0 ? (Math.sin(run.invuln * 30) > 0 ? 0.35 : 1) : 1;
    const scale = Math.min(innerWidth, innerHeight) * 0.52;
    // counter-roll caps at ~14deg and self-levels after input stops
    // (cam.visor) - bank feel only, free spins don't corkscrew the view
    const roll = cam.visor;
    const cosr = Math.cos(roll), sinr = Math.sin(roll);
    const shx = cam.ox * 0.45 + (Math.random() - 0.5) * run.jitter * 14;
    const shy = cam.oy * 0.45 + (Math.random() - 0.5) * run.jitter * 14;

    // holo compass: the true direction to the next relay, re-expressed in
    // the view basis with forward pitched up by TILT - read like a dash
    // instrument seen from above, so "ahead" points up-screen instead of
    // shrinking to a tail-on dot. Cockpit: anchored over deck's pad at
    // depth HD via inverse projection; chase: floats ahead of the hull.
    const tg = run.next;
    const R = chase ? cam.vr : cam.right, U = chase ? cam.vu : cam.up, F = chase ? cam.vf : cam.fwd;
    const onPad = !chase && pad.on;
    let ax = 0, ay = 0, az = 0, kx = 0, ky = 0, kz = 0, ox = 0, oy = 0, oz = 0;
    let L = 0, lift = 0, aF = 0, wpx = 0;
    if (tg) {
      let dx = tg.x - cam.x, dy = tg.y - cam.y, dz = tg.z - cam.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      const dr = dx * R[0] + dy * R[1] + dz * R[2];
      const du = dx * U[0] + dy * U[1] + dz * U[2];
      const df = dx * F[0] + dy * F[1] + dz * F[2];
      const u2 = du * TC + df * TS, f2 = df * TC - du * TS;
      ax = R[0] * dr + U[0] * u2 + F[0] * f2;
      ay = R[1] * dr + U[1] * u2 + F[1] * f2;
      az = R[2] * dr + U[2] * u2 + F[2] * f2;
      // width axis = a x F: the flat arrow turns its face to the eye (the
      // head is symmetric, so the sign flip through the view axis is free)
      kx = ay * F[2] - az * F[1]; ky = az * F[0] - ax * F[2]; kz = ax * F[1] - ay * F[0];
      const bl = Math.hypot(kx, ky, kz);
      if (bl < 1e-3) { kx = R[0]; ky = R[1]; kz = R[2]; }
      else { kx /= bl; ky /= bl; kz /= bl; }
      aF = ax * F[0] + ay * F[1] + az * F[2];
      if (onPad) {
        // portrait squeezes the dash: shorter arrow
        L = HL * Math.min(1, (innerWidth / innerHeight) * 1.7);
        lift = pad.r + innerHeight * 0.075;
        const sx = pad.x + pad.ux * lift, sy = pad.y + pad.uy * lift;
        const vx = ((sx - cam.cx - cam.ox) * HD) / cam.f, vy = (-(sy - cam.cy - cam.oy) * HD) / cam.f;
        ox = cam.x + R[0] * vx + U[0] * vy + F[0] * HD;
        oy = cam.y + R[1] * vx + U[1] * vy + F[1] * HD;
        oz = cam.z + R[2] * vx + U[2] * vy + F[2] * HD;
        wpx = (0.3 * L * cam.f) / HD;
      } else {
        L = 40;
        ox = cam.x + cam.fwd[0] * 170 + cam.up[0] * 22;
        oy = cam.y + cam.fwd[1] * 170 + cam.up[1] * 22;
        oz = cam.z + cam.fwd[2] * 170 + cam.up[2] * 22;
      }
    }
    const hue = pad.tint, depth = onPad ? HD : 320;
    const scan = ((holoT * 0.75) % 1) * 1.6 - 0.3; // scanline: tail -> tip sweep

    for (let i = 0; i < OWN; i++) {
      const p = layer.lo + i, j = p * 3;
      if (shed[i] > 0) {
        shed[i] -= dt;
        if (shed[i] <= 0) homed[p] = 1; // spring pulls the shed particle back
        continue;
      }
      if (i < MOTES * MOTE_PTS) {
        const m = (i / MOTE_PTS) | 0;
        if (m >= run.shield) {
          homed[p] = 0; size[p] = 0;
          continue;
        }
        homed[p] = 1;
        const a = moteA + m * 1.047 + (i % MOTE_PTS) * MOTE_ARC;
        if (chase) {
          // chase: motes orbit the SHIP - a world-space ring in the
          // right/up plane at the hull anchor, 26wu radius
          const ca = Math.cos(a) * 26, sa = Math.sin(a) * 26;
          const wx = cam.x + cam.right[0] * ca + cam.up[0] * sa;
          const wy = cam.y + cam.right[1] * ca + cam.up[1] * sa;
          const wz = cam.z + cam.right[2] * ca + cam.up[2] * sa;
          if (!cam.project(wx, wy, wz)) {
            home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
            snap[p] = 1;
            continue;
          }
          size[p] = 1.9;
          home[j] = cam.out[0]; home[j + 1] = cam.out[1];
          home[j + 2] = Math.max(cam.out[2], -2);
          hcol[j] = PF.PAL.sky[0] * 1.4;
          hcol[j + 1] = PF.PAL.sky[1] * 1.4;
          hcol[j + 2] = PF.PAL.sky[2] * 1.5;
          continue;
        }
        // shield motes orbit an ellipse around mid-canopy
        size[p] = 1.4;
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
      homed[p] = 1;
      const bx = body[bi * 5], by = body[bi * 5 + 1], kind = body[bi * 5 + 3];
      if (kind === 5) {
        const q = (bi - arrowLo) * 4, role = al[q + 2];
        if (!tg || (role === 3 && !onPad)) {
          size[p] = 0;
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          continue;
        }
        const a = al[q], b = al[q + 1], w = al[q + 3];
        const fl = (0.88 + 0.12 * Math.random()) * blink;
        if (role === 3) {
          // beam: faint motes rise off the lens and fan out to the arrow
          const r = (a + holoT * 0.55) % 1;
          const up = pad.r * 0.5 + r * (lift - pad.r * 0.5);
          const half = (pad.r * 0.45 + r * (wpx * 0.55 - pad.r * 0.45)) * b;
          home[j] = pad.x + pad.ux * up - pad.uy * half;
          home[j + 1] = pad.y + pad.uy * up + pad.ux * half;
          home[j + 2] = 3.2;
          size[p] = 0.95;
          const lum = 0.3 * Math.sin(r * Math.PI) * fl;
          hcol[j] = hue[0] * lum; hcol[j + 1] = hue[1] * lum; hcol[j + 2] = hue[2] * lum;
          continue;
        }
        const la = a * L, lb = b * L;
        if (!cam.project(ox + ax * la + kx * lb, oy + ay * la + ky * lb, oz + az * la + kz * lb)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        home[j] = cam.out[0]; home[j + 1] = cam.out[1]; home[j + 2] = 3.2;
        // the nearer end grows a touch, so a tipped arrow reads in depth
        const near = 1 - ((aF * la) / depth) * 2.5;
        size[p] = (role === 0 ? 1.3 : role === 1 ? 1 : 1.1) * near;
        // modest luminance: stacked additive dots clip to white, so the
        // hue only survives if each point stays well under ~1
        const sw = Math.exp(-((a + 0.5 - scan) ** 2) * 60);
        const lum = (role === 0 ? 0.42 + 0.3 * w : role === 1 ? 0.2 : 0.3) * (1 + sw * 1.1) * fl;
        const wh = role === 0 ? w * 0.22 * fl : 0; // white lift on the leading edge
        hcol[j] = hue[0] * lum + wh; hcol[j + 1] = hue[1] * lum + wh; hcol[j + 2] = hue[2] * lum + wh;
        continue;
      }
      const rx = bx * cosr - by * sinr, ry = bx * sinr + by * cosr;
      // reticle: rolls with the counter-bank like the canopy does;
      // dimmer in chase so the hull silhouette reads under it
      const lum = (chase ? 0.85 : 1.45) * blink;
      home[j] = cam.cx + rx * scale + (swayX * scale + shx);
      home[j + 1] = cam.cy - ry * scale + (swayY * scale + shy);
      home[j + 2] = 3.2;
      hcol[j] = PF.PAL.accent[0] * lum;
      hcol[j + 1] = PF.PAL.accent[1] * lum;
      hcol[j + 2] = PF.PAL.accent[2] * lum;
    }
  };

  return cockpit;
}
