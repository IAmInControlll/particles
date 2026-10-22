// cockpit.js - particles that float inside the view volume: shield motes
// orbiting the canopy, the aim reticle, and the 3D gate compass arrow.
// The hull itself is canvas - deck.js paints it from frames.js and culls
// world particles outside the panes, so no dot ever forms the ship.
// kinds: 2 reticle, 5 compass arrow
export function createCockpit(field, cam, PF, layer) {
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

  // gate compass: members bake arrow-LOCAL coords in al[] and are projected
  // each frame as a 3D arrow floating ahead of the camera, oriented toward
  // the next pending gate - it tips/swings to any bearing.
  const arrowLo = pts.length;
  const ARROW_N = 40;
  const al = new Float32Array(ARROW_N * 3);
  for (let i = 0; i < ARROW_N; i++) {
    let a, b, c;
    if (i < ARROW_N * 0.34) {
      a = -0.55 + rnd() * 0.62; // shaft
      b = (rnd() - 0.5) * 0.05; c = (rnd() - 0.5) * 0.05;
    } else if (i < ARROW_N * 0.76) {
      const headHi = ARROW_N * 0.76 | 0;
      if (i >= headHi - 9) {
        // red bead at the tip: a small ring around the axis end, so the
        // pointing end carries an unmistakable marker in every attitude
        const phi = ((i - (headHi - 9)) / 9) * 6.283;
        a = 0.55;
        b = Math.cos(phi) * 0.075; c = Math.sin(phi) * 0.075;
      } else {
        // pointed cone: radius tapers to the tip
        const ang = rnd() * 6.283;
        a = 0.24 + rnd() * 0.3;
        const rr = (0.55 - a) * 0.42;
        b = Math.cos(ang) * rr; c = Math.sin(ang) * rr;
      }
    } else {
      // tail: four symmetric fins behind the shaft, not a scatter
      const k = i % 4, e = 0.13 + rnd() * 0.06;
      a = -0.52 - rnd() * 0.1;
      b = (k === 0 ? e : k === 1 ? -e : (rnd() - 0.5) * 0.03);
      c = (k === 2 ? e : k === 3 ? -e : (rnd() - 0.5) * 0.03);
    }
    al[i * 3] = a; al[i * 3 + 1] = b; al[i * 3 + 2] = c;
    pts.push([0, 0, 3.2, 5, 0]);
  }

  const S = pts.length;
  const body = new Float32Array(S * 5);
  for (let i = 0; i < S; i++) {
    const [x, y, z, kind, aux] = pts[i];
    body[i * 5] = x; body[i * 5 + 1] = y; body[i * 5 + 2] = z;
    body[i * 5 + 3] = kind; body[i * 5 + 4] = aux;
  }
  const MOTE_PTS = Math.max(4, Math.min(30, ((N - S) / MOTES) | 0));
  for (let i = 0; i < N; i++) {
    const p = layer.lo + i;
    noFlock[p] = 1;
    const bi = i - MOTES * MOTE_PTS;
    size[p] = i < MOTES * MOTE_PTS ? 1.4 : bi >= 0 && bi < S ? 1.15 : 0;
  }

  const shed = new Float32Array(N); // >0 = released, counts down
  let swayX = 0, swayY = 0, moteA = 0;
  // the layer tail [used, N) belongs to exterior.js (chase ship body) -
  // the frame loop and shed() only ever write [0, used)
  const OWN = MOTES * MOTE_PTS + S;
  const cockpit = { pts: S, motes: MOTES * MOTE_PTS, used: OWN };

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

    // compass arrow frame: direction to the next gate in world space, so
    // the arrow genuinely tips and swings in 3D - tail-on when lined up,
    // head-on (wings spread) when the gate is behind you
    const tg = run.next;
    let ax = 0, ay = 0, az = 0, b1x = 0, b1y = 0, b1z = 0;
    let c2x = 0, c2y = 0, c2z = 0, cx0 = 0, cy0 = 0, cz0 = 0, aim = 0;
    if (tg) {
      let dx = tg.x - cam.x, dy = tg.y - cam.y, dz = tg.z - cam.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      ax = dx; ay = dy; az = dz;
      let px = -dz, pz = dx; // d x world-up
      const pl = Math.hypot(px, pz);
      if (pl < 0.05) { px = 1; pz = 0; } else { px /= pl; pz /= pl; }
      b1x = px; b1z = pz;
      c2x = dy * pz; c2y = dz * px - dx * pz; c2z = -dy * px; // d x p1
      cx0 = cam.x + cam.fwd[0] * 170 + cam.up[0] * 22;
      cy0 = cam.y + cam.fwd[1] * 170 + cam.up[1] * 22;
      cz0 = cam.z + cam.fwd[2] * 170 + cam.up[2] * 22;
      aim = dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2];
    }

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
        const a = moteA + m * 1.047 + (i % MOTE_PTS) * 0.11;
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
        const ai = bi - arrowLo;
        if (!tg || ai < 0 || ai >= ARROW_N) {
          size[p] = 0;
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          continue;
        }
        const la = al[ai * 3] * 34, lb = al[ai * 3 + 1] * 34, lc = al[ai * 3 + 2] * 34;
        const wx = cx0 + ax * la + b1x * lb + c2x * lc;
        const wy = cy0 + ay * la + b1y * lb + c2y * lc;
        const wz = cz0 + az * la + b1z * lb + c2z * lc;
        if (!cam.project(wx, wy, wz)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        home[j] = cam.out[0] + shx; home[j + 1] = cam.out[1] + shy; home[j + 2] = 3.2;
        // red tip reads which way even when the arrow is foreshortened;
        // the very end of the chevron gets an extra hot bump
        const tip = al[ai * 3];
        const lum = (1.05 + Math.max(0, aim) * 0.55) * blink;
        if (tip > 0.14) {
          // modest luminance: stacked additive dots clip to white, so the
          // red only survives if each point stays under ~1.2
          size[p] = tip > 0.38 ? 2.4 : 1.8;
          const L = (tip > 0.38 ? 1.15 : 0.9) * blink;
          hcol[j] = L; hcol[j + 1] = 0.2 * L; hcol[j + 2] = 0.16 * L;
        } else if (tip < -0.42) {
          size[p] = 1.35;
          hcol[j] = PF.PAL.sky[0] * lum;
          hcol[j + 1] = PF.PAL.sky[1] * lum;
          hcol[j + 2] = PF.PAL.sky[2] * lum;
        } else {
          size[p] = 1.15;
          hcol[j] = PF.PAL.accent[0] * lum;
          hcol[j + 1] = PF.PAL.accent[1] * lum;
          hcol[j + 2] = PF.PAL.accent[2] * lum;
        }
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
