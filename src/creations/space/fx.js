// fx.js - near-field dust motes (speed feel), burst/shed pool, game-over text.
// Dust is world-anchored in a sliding window around the camera. Bursts borrow
// dust particles: release to drift with an impulse, then re-home.
export function createFx(field, cam, PF, layer) {
  const rnd = PF.rnd;
  const N = layer.hi - layer.lo;
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock, vel = field.vel;

  const BURST = Math.min(420, (N * 0.3) | 0); // first BURST indices double as burst pool
  const STR = Math.min(64, (N * 0.07) | 0); // tail slice = warp streaks
  const ESC = 10;                            // further tail slice = escort pods
  const DUST_N = N - STR - ESC;
  const DUST_R = 950, DUST_R2 = DUST_R * DUST_R;
  const wx = new Float32Array(DUST_N), wy = new Float32Array(DUST_N), wz = new Float32Array(DUST_N);
  const base = new Float32Array(N); // base dim color luminance
  const busy = new Float32Array(N); // >0 = borrowed by a burst, counts down
  const COLS = new Uint8Array(N);   // palette pick per particle
  // streaks are screen-space rays from frame center - angle + radial
  // distance, not world positions, so they read as pure speed
  const sA = new Float32Array(STR), sR = new Float32Array(STR), sV = new Float32Array(STR);
  for (let i = 0; i < STR; i++) {
    sA[i] = rnd() * 6.283;
    sR[i] = rnd() * 60;
    sV[i] = 0.7 + rnd() * 0.9;
  }
  // escort pods: after a dock, rescued lifepods ride your tail for a few
  // seconds - warm lights in a loose column astern, staggered in per pod
  const ePh = new Float32Array(ESC), eD = new Float32Array(ESC);
  for (let i = 0; i < ESC; i++) { ePh[i] = rnd() * 6.283; eD[i] = i * 0.16; }
  let escT = 0, fxT = 0;

  // motes surround the camera in a sphere so drift/strafe reads in every direction
  const respawn = (i) => {
    const a = rnd() * 6.283, u = rnd() * 2 - 1;
    const w = Math.sqrt(1 - u * u);
    const r = 45 + rnd() * 900;
    let dx = Math.cos(a) * w, dy = u, dz = Math.sin(a) * w;
    if ((dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2]) < 0 && rnd() < 0.45) {
      dx = -dx; dy = -dy; dz = -dz;
    }
    wx[i] = cam.x + dx * r;
    wy[i] = cam.y + dy * r;
    wz[i] = cam.z + dz * r;
  };

  for (let i = 0; i < N; i++) {
    if (i < DUST_N) respawn(i);
    const p = layer.lo + i, j = p * 3;
    size[p] = 0.5 + rnd() * 0.9;
    base[i] = 0.4 + rnd() * 0.9;
    COLS[i] = rnd() < 0.8 ? 0 : rnd() < 0.5 ? 1 : 2;
    const c = [PF.PAL.dim, PF.PAL.mist, PF.PAL.sky][COLS[i]];
    hcol[j] = c[0] * base[i] * 0.8;
    hcol[j + 1] = c[1] * base[i] * 0.8;
    hcol[j + 2] = c[2] * base[i] * 0.8;
  }

  let burstCur = 0;
  const fx = {};

  // release n particles at world (x,y,z) with an outward impulse + hot tint
  fx.burst = (x, y, z, col, n, mag = 90) => {
    if (!cam.project(x, y, z)) return;
    const sx = cam.out[0], sy = cam.out[1];
    for (let k = 0; k < n; k++) {
      const i = burstCur = (burstCur + 1) % BURST;
      const p = layer.lo + i, j = p * 3;
      homed[p] = 0;
      busy[i] = 1.1 + rnd() * 0.5;
      const a = rnd() * 6.283, m = mag * (0.4 + rnd());
      vel[j] += Math.cos(a) * m;
      vel[j + 1] += Math.sin(a) * m;
      field.pos[j] = sx + (rnd() - 0.5) * 8;
      field.pos[j + 1] = sy + (rnd() - 0.5) * 8;
      hcol[j] = col[0] * 1.4; hcol[j + 1] = col[1] * 1.4; hcol[j + 2] = col[2] * 1.4;
    }
  };

  fx.escort = () => { escT = 6; };
  fx.escT = () => escT;

  fx.frame = (dt, snapMode) => {
    const o = cam.out;
    fxT += dt;
    escT = Math.max(0, escT - dt);
    field.drift.x = cam.cx;
    field.drift.y = cam.cy;
    for (let i = 0; i < DUST_N; i++) {
      const p = layer.lo + i, j = p * 3;
      if (busy[i] > 0) {
        busy[i] -= dt;
        if (busy[i] <= 0) {
          respawn(i);
          homed[p] = 1;
          snap[p] = 1;
          const c = [PF.PAL.dim, PF.PAL.mist, PF.PAL.sky][COLS[i]];
          hcol[j] = c[0] * base[i] * 0.8;
          hcol[j + 1] = c[1] * base[i] * 0.8;
          hcol[j + 2] = c[2] * base[i] * 0.8;
        }
        continue;
      }
      const ddx = wx[i] - cam.x, ddy = wy[i] - cam.y, ddz = wz[i] - cam.z;
      const dax = ddx * cam.fwd[0] + ddy * cam.fwd[1] + ddz * cam.fwd[2];
      if (ddx * ddx + ddy * ddy + ddz * ddz > DUST_R2 || dax < -700) respawn(i);
      if (!cam.project(wx[i], wy[i], wz[i])) {
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1;
        continue;
      }
      // dust lives at real depth up to ~950wu - o[2] there would crush
      // the sprite scale; pin a modest near depth so motes actually read
      home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = 1.1;
      if (snapMode) snap[p] = 1;
      // dust is the near-field speed cue: it brightens and swells with speed
      const g = 0.9 + cam.speedK * 1.6;
      const c = [PF.PAL.dim, PF.PAL.mist, PF.PAL.sky][COLS[i]];
      hcol[j] = c[0] * base[i] * g; hcol[j + 1] = c[1] * base[i] * g; hcol[j + 2] = c[2] * base[i] * g;
      size[p] = (0.5 + (COLS[i] ? 0.4 : 0.2)) * (1 + cam.speedK * 1.8);
    }

    // warp streaks: screen-space rays out of frame center. Radius runs
    // outward fast and wraps back; size and lum scale with speed. Below
    // ~half speed they park offscreen. deck.cull clips them to the panes.
    const sk = Math.max(0, Math.min(1, (cam.speedK - 0.5) * 2.4));
    const RMAX = Math.hypot(cam.cx, cam.cy) + 90;
    const ox = cam.cx + cam.ox, oy = cam.cy + cam.oy;
    for (let i = 0; i < STR; i++) {
      const p = layer.lo + DUST_N + i, j = p * 3;
      if (sk <= 0) {
        sR[i] = rnd() * 60;
        if (home[j] > -4e3 || size[p] > 0) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          size[p] = 0; snap[p] = 1;
        }
        continue;
      }
      sR[i] += sV[i] * (150 + sk * 1500) * dt;
      if (sR[i] > RMAX) {
        sR[i] = 24 + rnd() * 90;
        sA[i] = rnd() * 6.283;
      }
      homed[p] = 1;
      home[j] = ox + Math.cos(sA[i]) * sR[i];
      home[j + 1] = oy + Math.sin(sA[i]) * sR[i];
      home[j + 2] = 1.0;
      if (snapMode) snap[p] = 1;
      const lum = (0.12 + sk * 0.6) * sV[i];
      size[p] = (0.55 + sk * 1.3) * (0.5 + sV[i] * 0.5);
      hcol[j] = PF.PAL.mist[0] * lum;
      hcol[j + 1] = PF.PAL.mist[1] * lum;
      hcol[j + 2] = PF.PAL.mist[2] * lum;
    }

    // escort pods trail astern: warm amber lights, each pod's own clock
    // staggered by eD, the whole column fading as escT runs down
    for (let i = 0; i < ESC; i++) {
      const p = layer.lo + DUST_N + STR + i, j = p * 3;
      const t = escT - eD[i];
      if (t <= 0) {
        if (home[j] > -4e3 || size[p] > 0) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          size[p] = 0; snap[p] = 1;
        }
        continue;
      }
      const back = 45 + i * 15 + Math.sin(ePh[i] + fxT * 2) * 6;
      const lx = Math.sin(ePh[i] * 2 + fxT * 1.7) * 9;
      const ly = Math.cos(ePh[i] + fxT * 1.3) * 6;
      const wx = cam.x - cam.fwd[0] * back + cam.right[0] * lx + cam.up[0] * ly;
      const wy = cam.y - cam.fwd[1] * back + cam.right[1] * lx + cam.up[1] * ly;
      const wz = cam.z - cam.fwd[2] * back + cam.right[2] * lx + cam.up[2] * ly;
      if (!cam.project(wx, wy, wz)) {
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1;
        continue;
      }
      homed[p] = 1;
      home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = Math.max(o[2], 0.8);
      if (snapMode) snap[p] = 1;
      const fade = Math.min(1, t * 2.5) * Math.min(1, escT / 1.8);
      const tw = 0.8 + 0.4 * Math.sin(ePh[i] * 3 + fxT * 8);
      size[p] = 1.9 * fade;
      hcol[j] = tw * fade; hcol[j + 1] = 0.72 * tw * fade; hcol[j + 2] = 0.38 * tw * fade;
    }
  };

  return fx;
}
