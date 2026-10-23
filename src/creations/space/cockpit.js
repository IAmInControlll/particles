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

  // holo compass: a volumetric arrow on the literal 3D relay direction.
  // Table, 4 floats per point: (a, r, th, role). a runs the axis (-0.5
  // tail .. 0.5 tip), r is the radius off it, both in arrow lengths, th
  // the angle round it. roles: 0 tip, 1 cone ring, 2 cone generator,
  // 3 shaft rail, 4 fin, 5 projector beam (a = rise phase, r = side).
  // Rings carry the end-on silhouette, generators and fins the side one.
  // Mobile layers are a third the size: a lighter table keeps the
  // exterior's tail share.
  const small = N < 1000;
  const nRing = small ? 12 : 16, nMid = small ? 6 : 8, nGen = small ? 4 : 6, gPts = small ? 2 : 3,
    nRail = small ? 5 : 7, nFin = small ? 6 : 8, nBeam = small ? 14 : 24;
  const tab = [];
  {
    const put = (a, r, th, role) => tab.push(a, r, th, role);
    const HB = 0.1, HR = 0.17, SR = 0.035; // cone base, cone radius, shaft radius
    put(0.5, 0, 0, 0);
    for (let k = 0; k < nRing; k++) put(HB, HR, (k / nRing) * 6.283, 1);
    for (let k = 0; k < nMid; k++) put(0.3, HR * 0.5, ((k + 0.5) / nMid) * 6.283, 1);
    for (let k = 0; k < nGen; k++)
      for (let t = 1; t <= gPts; t++) {
        const u = t / (gPts + 1);
        put(0.5 + (HB - 0.5) * u, HR * u, ((k + 0.25) / nGen) * 6.283, 2);
      }
    for (let s = 0; s < 3; s++)
      for (let k = 0; k < nRail; k++) put(-0.5 + (k / (nRail - 1)) * (HB + 0.5), SR, (s / 3) * 6.283 + 1, 3);
    // 4 swept fins: leading edge root -> outer corner, trailing edge back in
    const lead = Math.ceil(nFin * 0.6);
    for (let f = 0; f < 4; f++)
      for (let k = 0; k < nFin; k++) {
        const t = k < lead ? k / (lead - 1) : 1 - (k - lead + 1) / (nFin - lead + 1);
        put(k < lead ? -0.24 - 0.26 * t : -0.5, SR + (0.17 - SR) * t, (f / 4) * 6.283, 4);
      }
    for (let k = 0; k < nBeam; k++) put(k / nBeam, ((k * 0.618034) % 1) * 2 - 1, 0, 5);
  }
  const al = new Float32Array(tab);
  const ARROW_N = al.length / 4;
  const arrowLo = pts.length;
  // HD: view-space depth of the dash arrow, HL: its length (wu). EX: the
  // exaggerated-perspective eye distance in arrow lengths - true depth
  // at 150 shrinks a 22wu arrow's far end by only ~7%, too little to read
  const HD = 150, HL = 22, EX = 1.8, PZ = PF.CFG.perspZ;
  // reference frame drawn round the arrow on the deck canvas (pad.seg)
  const MODE = new URLSearchParams(location.search).get("compass") === "ball" ? "ball" : "stalk";
  // per-role base size, luminance; tail colour = tint * COOL (bluer, dimmer)
  const RS = [2.3, 1.25, 1.05, 1, 1.2], RL = [0.95, 0.42, 0.34, 0.3, 0.4], COOL = [0.45, 0.6, 0.95];
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
  let moteA = 0, holoT = 0;
  // the layer tail [used, N) belongs to exterior.js (chase ship body) -
  // the frame loop and shed() only ever write [0, used)
  const OWN = MOTES * MOTE_PTS + S;
  const cockpit = { pts: S, motes: MOTES * MOTE_PTS, used: OWN };
  // probe handle: the compass slice in field indices, table order
  cockpit.holo = { lo: layer.lo + MOTES * MOTE_PTS + arrowLo, arrow: ARROW_N - nBeam, beam: nBeam, tab: al, mode: MODE };

  // arrow roll frame (p, q), screen anchor of its centre, exaggeration
  let px = 1, py = 0, pz = 0, qx = 0, qy = 1, qz = 0, sOx = 0, sOy = 0, vzO = 0, exL = 1;
  // P2 = screen x, y and the depth gain pf (>1 nearer than the centre):
  // offsets from the centre scale by exL / (exL + dz), a closer virtual eye
  const P2 = [0, 0, 1];
  const proj = (x, y, z) => {
    if (!cam.project(x, y, z)) return false;
    const pf = exL / Math.max(exL * 0.4, exL + cam.K * (1 - cam.out[2] / PZ) - vzO);
    P2[0] = sOx + (cam.out[0] - sOx) * pf; P2[1] = sOy + (cam.out[1] - sOy) * pf; P2[2] = pf;
    return true;
  };
  // reference frame -> pad.seg (x0, y0, x1, y1, alpha, width) and pad.dot
  // (x, y, radius, alpha, filled); deck strokes them in the state tint
  // next frame. The frame is the SHIP's (right/up/fwd), so in chase it
  // visibly turns with the hull.
  let lx = 0, ly = 0, lf = 1, lOk = false, fade = false;
  const vert = (x, y, z, a, w, first) => {
    const was = lOk, x0 = lx, y0 = ly, f0 = lf;
    lOk = proj(x, y, z);
    lx = P2[0]; ly = P2[1]; lf = P2[2];
    if (first || !was || !lOk || pad.nSeg >= pad.seg.length / 6) return;
    const s = pad.seg, o = pad.nSeg++ * 6;
    // back half (farther than the centre) fades: hidden-line depth cue
    s[o] = x0; s[o + 1] = y0; s[o + 2] = lx; s[o + 3] = ly;
    s[o + 4] = fade && (f0 + lf) * 0.5 < 1 ? a * 0.35 : a; s[o + 5] = w;
  };
  const ring = (cx, cy, cz, A, B, rad, a, w) => {
    fade = true;
    for (let k = 0; k <= 40; k++) {
      const t = (k / 40) * 6.2832, c = Math.cos(t) * rad, s = Math.sin(t) * rad;
      vert(cx + A[0] * c + B[0] * s, cy + A[1] * c + B[1] * s, cz + A[2] * c + B[2] * s, a, w, k === 0);
    }
    fade = false;
  };
  const dot = (x, y, z, rad, a, fill) => {
    if (!proj(x, y, z) || pad.nDot >= pad.dot.length / 5) return;
    const d = pad.dot, o = pad.nDot++ * 5;
    d[o] = P2[0]; d[o + 1] = P2[1]; d[o + 2] = rad * P2[2]; d[o + 3] = a; d[o + 4] = fill;
  };
  const refFrame = (ox, oy, oz, dx, dy, dz, L) => {
    const R = cam.right, U = cam.up, F = cam.fwd, rad = L * 0.62;
    pad.nSeg = pad.nDot = 0;
    const nose = () => {
      // small forward chevron on the ring: which way the ship's nose is
      const fx = ox + F[0] * rad * 1.12, fy = oy + F[1] * rad * 1.12, fz = oz + F[2] * rad * 1.12;
      for (const sd of [-1, 1]) {
        vert(ox + F[0] * rad * 0.9 + R[0] * rad * 0.12 * sd, oy + F[1] * rad * 0.9 + R[1] * rad * 0.12 * sd,
          oz + F[2] * rad * 0.9 + R[2] * rad * 0.12 * sd, 0.5, 1.2, true);
        vert(fx, fy, fz, 0.5, 1.2, false);
      }
    };
    if (MODE === "ball") {
      // gimbal sphere: limb, equator (right/fwd), fore-aft meridian (up/fwd);
      // the axis pierces the shell - solid dot on the near face (relay
      // behind you), hollow on the far face (relay ahead)
      ring(ox, oy, oz, R, U, rad, 0.13, 1);
      ring(ox, oy, oz, R, F, rad, 0.42, 1.3);
      ring(ox, oy, oz, U, F, rad, 0.26, 1);
      nose();
      const k = rad;
      if (proj(ox + dx * k, oy + dy * k, oz + dz * k)) {
        const near = P2[2] >= 1;
        dot(ox + dx * k, oy + dy * k, oz + dz * k, 3.4, near ? 0.95 : 0.6, near ? 1 : 0);
      }
      return;
    }
    // stalk (Elite scanner): disc in the ship's right/fwd plane, the whole
    // arrow's shadow on it (through the centre), a stalk from tip to shadow
    ring(ox, oy, oz, R, F, rad, 0.45, 1.3);
    ring(ox, oy, oz, R, F, rad * 0.5, 0.16, 1);
    vert(ox - R[0] * rad, oy - R[1] * rad, oz - R[2] * rad, 0.14, 1, true);
    vert(ox + R[0] * rad, oy + R[1] * rad, oz + R[2] * rad, 0.14, 1, false);
    vert(ox - F[0] * rad, oy - F[1] * rad, oz - F[2] * rad, 0.14, 1, true);
    vert(ox + F[0] * rad, oy + F[1] * rad, oz + F[2] * rad, 0.14, 1, false);
    nose();
    const h = L * 0.5, du = dx * U[0] + dy * U[1] + dz * U[2];
    const tx = ox + dx * h, ty = oy + dy * h, tz = oz + dz * h;
    const sx = tx - U[0] * du * h, sy = ty - U[1] * du * h, sz = tz - U[2] * du * h;
    vert(ox - dx * h + U[0] * du * h, oy - dy * h + U[1] * du * h, oz - dz * h + U[2] * du * h, 0.7, 2, true);
    vert(sx, sy, sz, 0.85, 2, false);
    vert(tx, ty, tz, 0.75, 1.4, true);
    vert(sx, sy, sz, 0.75, 1.4, false);
    dot(sx, sy, sz, 2.8, 0.9, 1);
  };

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
    const blink = run.invuln > 0 ? (Math.sin(run.invuln * 30) > 0 ? 0.35 : 1) : 1;
    const scale = Math.min(innerWidth, innerHeight) * 0.52;
    const shx = cam.ox * 0.45 + (Math.random() - 0.5) * run.jitter * 14;
    const shy = cam.oy * 0.45 + (Math.random() - 0.5) * run.jitter * 14;

    // holo compass: the arrow lies on the true direction to the next
    // relay. Cockpit: centred over deck's pad at depth HD via inverse
    // projection; chase: floats ahead of the hull. The roll frame (p, q)
    // is parallel-transported frame to frame, so it never flips as the
    // axis swings through a pole.
    const tg = run.next;
    const onPad = !chase && pad.on;
    let dx = 0, dy = 0, dz = 0, ox = 0, oy = 0, oz = 0, L = 0, lift = 0, wpx = 0, ok = false;
    if (tg) {
      dx = tg.x - cam.x; dy = tg.y - cam.y; dz = tg.z - cam.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      if (onPad) {
        // portrait squeezes the dash: shorter arrow
        L = HL * Math.min(1, (innerWidth / innerHeight) * 1.7);
        lift = pad.r + innerHeight * 0.085;
        const sx = pad.x + pad.ux * lift, sy = pad.y + pad.uy * lift;
        const vx = ((sx - cam.cx - cam.ox) * HD) / cam.f, vy = (-(sy - cam.cy - cam.oy) * HD) / cam.f;
        const R = cam.right, U = cam.up, F = cam.fwd;
        ox = cam.x + R[0] * vx + U[0] * vy + F[0] * HD;
        oy = cam.y + R[1] * vx + U[1] * vy + F[1] * HD;
        oz = cam.z + R[2] * vx + U[2] * vy + F[2] * HD;
        wpx = (0.3 * L * cam.f) / HD;
      } else {
        // chase: hang it low-left near the eye (150 back, 42 up) so the eye
        // looks down ~23deg onto the ship's level plane - the stalk disc
        // opens up instead of sitting edge-on ahead of the hull
        const R = cam.vr, U = cam.vu, F = cam.vf;
        const fb = 105 - 150, ub = 42 - 45, rb = -45;
        L = 14;
        ox = cam.x + F[0] * fb + U[0] * ub + R[0] * rb;
        oy = cam.y + F[1] * fb + U[1] * ub + R[1] * rb;
        oz = cam.z + F[2] * fb + U[2] * ub + R[2] * rb;
      }
      let k = px * dx + py * dy + pz * dz;
      px -= k * dx; py -= k * dy; pz -= k * dz;
      let pl = Math.hypot(px, py, pz);
      if (pl < 0.3) {
        const B = Math.abs(dx * cam.up[0] + dy * cam.up[1] + dz * cam.up[2]) < 0.9 ? cam.up : cam.right;
        k = B[0] * dx + B[1] * dy + B[2] * dz;
        px = B[0] - k * dx; py = B[1] - k * dy; pz = B[2] - k * dz;
        pl = Math.hypot(px, py, pz);
      }
      px /= pl; py /= pl; pz /= pl;
      qx = dy * pz - dz * py; qy = dz * px - dx * pz; qz = dx * py - dy * px;
      if (cam.project(ox, oy, oz)) {
        sOx = cam.out[0]; sOy = cam.out[1]; vzO = cam.K * (1 - cam.out[2] / PZ);
        exL = EX * L;
        ok = true;
      }
    }
    if (ok) refFrame(ox, oy, oz, dx, dy, dz, L);
    const hue = pad.tint, rl = holoT * 0.6; // slow roll: fins show 3D form end-on
    const hot = [hue[0] * 0.8 + 0.25, hue[1] * 0.8 + 0.25, hue[2] * 0.8 + 0.25];
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
        const q = (bi - arrowLo) * 4, a = al[q], r = al[q + 1], role = al[q + 3];
        if (!ok || (role === 5 && !onPad)) {
          size[p] = 0;
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          continue;
        }
        const fl = (0.88 + 0.12 * Math.random()) * blink;
        if (role === 5) {
          // beam: faint motes rise off the lens and fan out to the arrow
          const rr = (a + holoT * 0.55) % 1;
          const up = pad.r * 0.5 + rr * (lift - pad.r * 0.5);
          const half = (pad.r * 0.45 + rr * (wpx * 0.55 - pad.r * 0.45)) * r;
          home[j] = pad.x + pad.ux * up - pad.uy * half;
          home[j + 1] = pad.y + pad.uy * up + pad.ux * half;
          home[j + 2] = 3.2;
          size[p] = 0.95;
          const lum = 0.3 * Math.sin(rr * Math.PI) * fl;
          hcol[j] = hue[0] * lum; hcol[j + 1] = hue[1] * lum; hcol[j + 2] = hue[2] * lum;
          continue;
        }
        const th = al[q + 2] + rl, c = Math.cos(th) * r * L, s = Math.sin(th) * r * L, la = a * L;
        if (!proj(ox + dx * la + px * c + qx * s, oy + dy * la + py * c + qy * s, oz + dz * la + pz * c + qz * s)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        home[j] = P2[0]; home[j + 1] = P2[1]; home[j + 2] = 3.2;
        // depth cue: the nearer end is bigger and brighter, exaggerated
        const pf = P2[2];
        size[p] = RS[role] * pf ** 1.2;
        // modest luminance: stacked additive dots clip to white, so the
        // hue only survives if each point stays well under ~1
        const u = a + 0.5, sw = Math.exp(-((u - scan) ** 2) * 60);
        const lum = RL[role] * (0.4 + 0.6 * pf) * (1 + sw * 0.9) * fl;
        for (let e = 0; e < 3; e++) {
          const cool = hue[e] * COOL[e];
          hcol[j + e] = (cool + (hot[e] - cool) * u) * lum;
        }
        continue;
      }
      // gunsight: collimated, so it stays on the bore line - no head sway,
      // no counter-roll, only shake. Dimmer in chase so the hull reads under it
      const lum = (chase ? 0.85 : 1.45) * blink;
      home[j] = cam.cx + bx * scale + shx;
      home[j + 1] = cam.cy - by * scale + shy;
      home[j + 2] = 3.2;
      hcol[j] = PF.PAL.accent[0] * lum;
      hcol[j + 1] = PF.PAL.accent[1] * lum;
      hcol[j + 2] = PF.PAL.accent[2] * lum;
    }
  };

  return cockpit;
}
