// fx.js - the debris pool. Extra spill an entity doesn't own: ball-death
// sparks, the camera-collision burst, pickup claim flash. Released
// particles drift with an impulse, get pulled down by gravity, fade, park.
export function createFx(field, cam, PF, layer) {
  const rnd = PF.rnd;
  const N = layer.hi - layer.lo;
  const { home, hcol, homed, snap, size, pos, vel } = field;
  const busy = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = layer.lo + i, j = p * 3;
    homed[p] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
    snap[p] = 1; size[p] = 0;
  }

  let cur = 0;
  const fx = {};
  // n particles released at world (x,y,z); radial impulse + viewer z kick
  fx.burst = (x, y, z, col, n, mag = 3, zk = 0.05) => {
    if (!cam.project(x, y, z)) return;
    const sx = cam.out[0], sy = cam.out[1], sz = Math.max(0, cam.out[2]);
    for (let k = 0; k < n; k++) {
      const i = cur = (cur + 1) % N, p = layer.lo + i, j = p * 3;
      homed[p] = 0;
      busy[i] = 0.9 + rnd() * 0.7;
      pos[j] = sx + (rnd() - 0.5) * 10;
      pos[j + 1] = sy + (rnd() - 0.5) * 10;
      pos[j + 2] = sz;
      const a = rnd() * 6.283, m = mag * (0.4 + rnd());
      vel[j] += Math.cos(a) * m;
      vel[j + 1] += Math.sin(a) * m;
      vel[j + 2] += zk * (0.5 + rnd());
      hcol[j] = col[0] * 1.4; hcol[j + 1] = col[1] * 1.4; hcol[j + 2] = col[2] * 1.4;
      size[p] = 0.9 + rnd() * 0.8;
    }
  };

  fx.frame = (dt) => {
    const fade = Math.max(0, 1 - dt * 1.3), g = 0.05 * dt * 180;
    for (let i = 0; i < N; i++) {
      if (busy[i] <= 0) continue;
      busy[i] -= dt;
      const p = layer.lo + i, j = p * 3;
      if (busy[i] <= 0) {
        homed[p] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1; size[p] = 0;
        continue;
      }
      vel[j + 1] += g;
      hcol[j] *= fade; hcol[j + 1] *= fade; hcol[j + 2] *= fade;
      size[p] = Math.max(0, size[p] - dt * 0.8);
    }
  };
  return fx;
}
