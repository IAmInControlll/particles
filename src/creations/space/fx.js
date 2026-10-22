// fx.js - near-field dust motes (speed feel), burst/shed pool, game-over text.
// Dust is world-anchored in a sliding window around the camera. Bursts borrow
// dust particles: release to drift with an impulse, then re-home.
export function createFx(field, cam, PF, layer) {
  const rnd = PF.rnd;
  const N = layer.hi - layer.lo;
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock, vel = field.vel;

  const BURST = Math.min(420, (N * 0.3) | 0); // first BURST indices double as burst pool
  const DUST_Z = 1500;
  const wx = new Float32Array(N), wy = new Float32Array(N), wz = new Float32Array(N);
  const base = new Float32Array(N); // base dim color luminance
  const busy = new Float32Array(N); // >0 = borrowed by a burst, counts down
  const COLS = new Uint8Array(N);   // palette pick per particle

  const respawn = (i, anyZ) => {
    wx[i] = cam.x + (rnd() - 0.5) * 700;
    wy[i] = cam.y + (rnd() - 0.5) * 560;
    wz[i] = cam.z + 60 - (anyZ ? rnd() * DUST_Z : rnd() * 200) - 160;
  };

  for (let i = 0; i < N; i++) {
    respawn(i, true);
    const p = layer.lo + i, j = p * 3;
    size[p] = 0.5 + rnd() * 0.9;
    base[i] = 0.25 + rnd() * 0.75;
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

  fx.frame = (dt, snapMode) => {
    const o = cam.out;
    field.drift.x = cam.cx;
    field.drift.y = cam.cy;
    for (let i = 0; i < N; i++) {
      const p = layer.lo + i, j = p * 3;
      if (busy[i] > 0) {
        busy[i] -= dt;
        if (busy[i] <= 0) {
          respawn(i, false);
          homed[p] = 1;
          snap[p] = 1;
          const c = [PF.PAL.dim, PF.PAL.mist, PF.PAL.sky][COLS[i]];
          hcol[j] = c[0] * base[i] * 0.8;
          hcol[j + 1] = c[1] * base[i] * 0.8;
          hcol[j + 2] = c[2] * base[i] * 0.8;
        }
        continue;
      }
      if (wz[i] > cam.z + 50) respawn(i, false);
      if (!cam.project(wx[i], wy[i], wz[i])) {
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1;
        continue;
      }
      home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = o[2];
      if (snapMode) snap[p] = 1;
    }
  };

  return fx;
}
