// weapon.js - the blade cluster riding a fighter's armed hand.
// Held: a tapering line from the hand along the forearm direction; tip
// speed is the damage signal. Thrown: hilt and tip become free verlet
// points with spin that land and wait for the owner to walk over.

export function createWeapon(field, f, V, opts) {
  const u = field.unit;
  const LEN = 0.62 * u;
  const THROW_V = 850;
  const lo = f.weaponLo;
  const hi = f.hi;

  const W = {
    state: "held", // held | thrown | ground
    seg: { ax: 0, ay: 0, bx: 0, by: 0 },
    tipSpeed: 0,
    tipV: { x: 0, y: 0 },
  };

  const hilt = V.point(0, 0);
  const tip = V.point(0, 0);
  const shaft = V.link(hilt, tip, LEN, 1);
  hilt.gone = tip.gone = true;
  shaft.broken = true;

  let prevTx = 0, prevTy = 0, prevGrip = 0;
  let bdx = 0, bdy = 1;

  const J = f.J;
  const seg = W.seg;

  function throwBlade(vx, vy) {
    W.state = "thrown";
    hilt.gone = tip.gone = false;
    shaft.broken = false;
    hilt.x = hilt.px = seg.ax;
    hilt.y = hilt.py = seg.ay;
    tip.x = tip.px = seg.bx;
    tip.y = tip.py = seg.by;
    V.impulse(hilt, vx, vy);
    V.impulse(tip, vx, vy);
    // spin: tip keeps the whip, hilt counter-rotates a touch
    V.impulse(tip, -vy * 0.35, vx * 0.35);
    V.impulse(hilt, vy * 0.12, -vx * 0.12);
  }

  W.update = (dt, env) => {
    if (dt <= 0) return;
    if (W.state === "held") {
      const dx = J.hand.x - J.elb.x, dy = J.hand.y - J.elb.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      // a collapsed forearm makes normalize() noisy - freeze the last
      // good direction instead of letting the tip whip phantom energy
      if (d > 10) {
        const k = Math.min(1, dt * 40);
        bdx += (dx / d - bdx) * k;
        bdy += (dy / d - bdy) * k;
        const m = Math.hypot(bdx, bdy) || 1e-4;
        bdx /= m;
        bdy /= m;
      }
      seg.ax = J.hand.x;
      seg.ay = J.hand.y;
      seg.bx = J.hand.x + bdx * LEN;
      seg.by = J.hand.y + bdy * LEN;
      // single-frame finite diff turns joint jitter into phantom whip
      // speed - average over ~5 frames; real swings register almost fully
      const vk = Math.min(1, dt * 12);
      W.tipV.x += ((seg.bx - prevTx) / dt - W.tipV.x) * vk;
      W.tipV.y += ((seg.by - prevTy) / dt - W.tipV.y) * vk;
      W.tipSpeed = Math.hypot(W.tipV.x, W.tipV.y);

      // dropped when the arm is gone
      if (f.part.fore.severed) throwBlade(0, 0);
      // lunge burst on grip; a deliberate release while whipping throws
      if (f.intent.grip && !prevGrip) V.impulse(J.root, f.side * 260, 0);
      if (f.intent.throwNow && W.tipSpeed > THROW_V) {
        const hv = V.vel(J.hand);
        throwBlade(hv.x, hv.y);
      }
      f.intent.throwNow = 0;
    } else {
      seg.ax = hilt.x;
      seg.ay = hilt.y;
      seg.bx = tip.x;
      seg.by = tip.y;
      const tv = V.vel(tip);
      W.tipV.x = tv.x;
      W.tipV.y = tv.y;
      W.tipSpeed = Math.hypot(tv.x, tv.y);
      if (W.state === "thrown" && hilt.y >= env.floor - 3 && tip.y >= env.floor - 3 && W.tipSpeed < 120)
        W.state = "ground";
      if (W.state === "ground" && !f.part.fore.severed && Math.abs(J.root.x - hilt.x) < 0.5 * u) {
        W.state = "held";
        hilt.gone = tip.gone = true;
        shaft.broken = true;
      }
    }
    prevTx = seg.bx;
    prevTy = seg.by;
    prevGrip = f.intent.grip;
  };

  const glow = opts.color;
  W.writeHomes = () => {
    const home = field.home, hcol = field.hcol;
    const dx = seg.bx - seg.ax, dy = seg.by - seg.ay;
    const d = Math.hypot(dx, dy) || 1e-4;
    const px = -dy / d, py = dx / d;
    const n = hi - lo;
    for (let p = lo; p < hi; p++) {
      const i = p * 3;
      const t = (p - lo) / (n - 1);
      if (t < 0.12) {
        // hilt knot: a tight blob around the grip
        const a = field.h1(p) * Math.PI * 2;
        const r = field.h2(p) * 0.022 * u;
        home[i] = seg.ax + Math.cos(a) * r;
        home[i + 1] = seg.ay + Math.sin(a) * r;
      } else {
        const o = field.h2(p) * 2 - 1;
        const w = (0.016 - 0.011 * t) * u;
        home[i] = seg.ax + dx * t + px * o * w;
        home[i + 1] = seg.ay + dy * t + py * o * w;
      }
      home[i + 2] = (field.h3(p) - 0.5) * 5;
      const m = 0.75 + 0.5 * field.h3(p) + t * 0.25;
      hcol[i] = glow[0] * m;
      hcol[i + 1] = glow[1] * m;
      hcol[i + 2] = glow[2] * m;
    }
  };

  W.reset = () => {
    W.state = "held";
    hilt.gone = tip.gone = true;
    shaft.broken = true;
  };

  for (let p = lo; p < hi; p++) field.noFlock[p] = 1;
  return W;
}
