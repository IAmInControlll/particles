// ripples.js - fixed ring pool. Each live front gives particles inside its
// band a one-frame outward impulse; all-N scan, capt[] skipped.
const RINGS = 8;
// vel units are px per 1/180s, so a readable shove is a small number
const IMP = 0.05; // per reference frame, scaled by dtf

export function makeRipples(field) {
  const list = [];
  for (let k = 0; k < RINGS; k++)
    list.push({ x: 0, y: 0, r: 0, v: 0, band: 0, active: false });

  const spawn = (x, y) => {
    let g = null;
    for (const q of list) if (!q.active) { g = q; break; }
    if (!g) {
      g = list[0];
      for (const q of list) if (q.r > g.r) g = q;
    }
    const u = field.unit;
    g.x = x;
    g.y = y;
    g.r = 0.12 * u;
    g.v = 1.6 * u;
    g.band = 0.28 * u;
    g.active = true;
  };

  const step = (T, dt) => {
    const { pos, vel, capt } = field, u = field.unit, N = field.N;
    const imp = IMP * Math.min(3, Math.max(0.25, dt * 180));
    for (const g of list) {
      if (!g.active) continue;
      g.r += g.v * dt;
      if (g.r > 3.5 * u) { g.active = false; continue; }
      const outer = g.r + g.band;
      const i2 = (g.r - g.band) * (g.r - g.band);
      const o2 = outer * outer;
      for (let p = 0; p < N; p++) {
        if (capt[p]) continue;
        const i = p * 3;
        const dx = pos[i] - g.x, dy = pos[i + 1] - g.y;
        if (dx > outer || dx < -outer || dy > outer || dy < -outer) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < i2 || d2 > o2) continue;
        const d = Math.sqrt(d2) + 1e-4;
        vel[i] += (dx / d) * imp;
        vel[i + 1] += (dy / d) * imp;
      }
    }
  };

  return { list, spawn, step };
}
