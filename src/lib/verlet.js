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
    const p = { x, y, px: x, py: y, pull: null, k: 0, gone: false, gs: 1, im: 1 };
    pts.push(p);
    return p;
  }

  function link(a, b, len, stiff = 1) {
    const c = {
      type: 0,
      a,
      b,
      len: len ?? Math.hypot(a.x - b.x, a.y - b.y),
      stiff,
      broken: false,
    };
    cons.push(c);
    return c;
  }

  // a hinge clamps the angle between the axis (piv - mid(r1,r2)) and
  // (jt - piv) to center +- band. Solved inside the iteration loop so
  // it converges with the links instead of fighting them afterward.
  function hinge(piv, r1, r2, jt, band, stiff = 0.5) {
    const c = { type: 1, piv, r1, r2, jt, band, center: 0, stiff, broken: false };
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
      const ny = p.y + (p.y - p.py) * damp + g * p.gs;
      p.px = p.x;
      p.py = p.y;
      p.x = nx;
      p.y = ny;
    }
    for (let it = 0; it < iterations; it++) {
      for (const c of cons) {
        if (c.broken) continue;
        if (c.type === 1) {
          const p = c.piv, j = c.jt;
          if (p.gone || j.gone || p.free || j.free || c.r1.free || c.r2.free) continue;
          const ux = p.x - (c.r1.x + c.r2.x) / 2;
          const uy = p.y - (c.r1.y + c.r2.y) / 2;
          const ul = Math.hypot(ux, uy) || 1e-4;
          const vx = j.x - p.x, vy = j.y - p.y;
          const vl = Math.hypot(vx, vy) || 1e-4;
          const ang = Math.atan2((ux * vy - uy * vx) / (ul * vl), (ux * vx + uy * vy) / (ul * vl));
          const d = ang - c.center;
          const e = d > c.band ? d - c.band : d < -c.band ? d + c.band : 0;
          if (!e) continue;
          const rot = -e * c.stiff;
          const cs = Math.cos(rot), sn = Math.sin(rot);
          // shift px with the correction so the clamp bends the joint
          // instead of pumping energy - an unshifted teleport reads as
          // added velocity next step and whips a buoyant joint forever
          const ox = j.x, oy = j.y;
          j.x = p.x + vx * cs - vy * sn;
          j.y = p.y + vx * sn + vy * cs;
          j.px += j.x - ox;
          j.py += j.y - oy;
          continue;
        }
        if (c.a.gone || c.b.gone) continue;
        const dx = c.b.x - c.a.x;
        const dy = c.b.y - c.a.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const diff = ((d - c.len) / d) * c.stiff;
        const ws = c.a.im + c.b.im || 1;
        const ka = (c.a.im / ws) * diff, kb = (c.b.im / ws) * diff;
        c.a.x += dx * ka;
        c.a.y += dy * ka;
        c.b.x -= dx * kb;
        c.b.y -= dy * kb;
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

  return { pts, cons, point, link, hinge, impulse, vel, step };
}
