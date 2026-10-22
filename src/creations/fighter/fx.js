// fx.js - a small reusable spark pool. Un-homed particles parked at
// size 0; a burst drops them at a point with a shove and they die back
// on a short fuse. Used where permanent loss is wrong (shield deflects,
// hit sparks, thrown-weapon impacts).

export function createFx(field, opts) {
  const lo = opts.lo, hi = opts.hi;
  const home = field.home, pos = field.pos, vel = field.vel;
  const hcol = field.hcol, col = field.col, size = field.size;

  const pool = [];
  for (let p = lo; p < hi; p++) {
    field.homed[p] = 0;
    field.noFlock[p] = 1;
    field.leader[p] = 0;
    size[p] = 0;
    pool.push({ p, t: -1 });
  }
  let cur = 0;

  function burst(x, y, n, dirx, diry, speed, c) {
    const d = Math.hypot(dirx, diry) || 1;
    dirx /= d;
    diry /= d;
    for (let k = 0; k < n; k++) {
      const s = pool[cur];
      cur = (cur + 1) % pool.length;
      const p = s.p, i = p * 3;
      const a = field.h1(p) * 6.2832;
      const jx = Math.cos(a) * 6, jy = Math.sin(a) * 6;
      const sp = speed * (0.45 + field.h2(p) * 0.9);
      pos[i] = x + jx;
      pos[i + 1] = y + jy;
      vel[i] = (dirx * sp - diry * sp * (field.h2(p) - 0.5) * 1.6) / 180;
      vel[i + 1] = (diry * sp + dirx * sp * (field.h2(p) - 0.5) * 1.6) / 180;
      vel[i + 2] = 0;
      size[p] = 0.9 + field.h3(p) * 0.5;
      const m = 0.8 + field.h3(p) * 0.6;
      col[i] = hcol[i] = c[0] * m;
      col[i + 1] = hcol[i + 1] = c[1] * m;
      col[i + 2] = hcol[i + 2] = c[2] * m;
      s.t = field.T + 0.3 + field.h2(p) * 0.4;
    }
  }

  function step() {
    for (const s of pool)
      if (s.t > 0 && field.T > s.t) {
        size[s.p] = 0;
        s.t = -1;
      }
  }

  return { burst, step };
}
