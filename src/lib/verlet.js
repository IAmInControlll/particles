// verlet.js - tiny position-verlet solver for joint ragdolls.
// Points carry position + previous position (implicit velocity).
// Constraints relax pairs toward a rest length; pull targets and
// floor/wall clamps apply inside the iteration loop so constraints
// fight the pulls and the body stays floppy.

export function createVerlet({ gravity = 2400, iterations = 7, damp = 0.99 } = {}) {
  const pts = [];
  const cons = [];
  let lastDt = 1 / 60;

  function point(x, y) {
    const p = { x, y, px: x, py: y, pull: null, k: 0, gone: false };
    pts.push(p);
    return p;
  }

  function link(a, b, len, stiff = 1) {
    const c = {
      a,
      b,
      len: len ?? Math.hypot(a.x - b.x, a.y - b.y),
      stiff,
      broken: false,
    };
    cons.push(c);
    return c;
  }

  // vx/vy in px/s; converted through the last step dt.
  function impulse(p, vx, vy) {
    p.px -= vx * lastDt;
    p.py -= vy * lastDt;
  }

  const vel = (p) => ({ x: (p.x - p.px) / lastDt, y: (p.y - p.py) / lastDt });

  function step(dt, env = {}) {
    if (dt <= 0) return;
    lastDt = Math.min(dt, 1 / 30);
    const g = gravity * lastDt * lastDt;
    const floor = env.floor ?? Infinity;
    const wl = env.wallL ?? -Infinity;
    const wr = env.wallR ?? Infinity;
    for (const p of pts) {
      if (p.gone) continue;
      const nx = p.x + (p.x - p.px) * damp;
      const ny = p.y + (p.y - p.py) * damp + g;
      p.px = p.x;
      p.py = p.y;
      p.x = nx;
      p.y = ny;
    }
    for (let it = 0; it < iterations; it++) {
      for (const c of cons) {
        if (c.broken || c.a.gone || c.b.gone) continue;
        const dx = c.b.x - c.a.x;
        const dy = c.b.y - c.a.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const diff = ((d - c.len) / d) * 0.5 * c.stiff;
        c.a.x += dx * diff;
        c.a.y += dy * diff;
        c.b.x -= dx * diff;
        c.b.y -= dy * diff;
      }
      for (const p of pts) {
        if (p.gone) continue;
        if (p.pull) {
          p.x += (p.pull.x - p.x) * p.k;
          p.y += (p.pull.y - p.y) * p.k;
        }
        if (p.y > floor) {
          p.y = floor;
          p.px += (p.x - p.px) * 0.14;
          if (p.py < p.y) p.py = p.y;
        }
        if (p.x < wl) p.x = wl;
        else if (p.x > wr) p.x = wr;
      }
    }
  }

  return { pts, cons, point, link, impulse, vel, step };
}
