// weapon.js - the armed-hand implement riding a fighter's hand.
// Held: the segment rides the forearm direction; tip speed is the damage
// signal. Thrown: hilt and tip become free verlet points with spin that
// land and wait for the owner to walk over. WEAPONS rows tune reach,
// damage, throw threshold, and silhouette per loadout.

export const WEAPONS = {
  blade: { len: 0.62, dmg: 1.0, cut: 1.0, throwV: 850, lag: 40, wt: 1.0, shape: "taper", desc: "blade - balanced reach, honest bite, fair on the arms" },
  mace: { len: 0.48, dmg: 1.55, cut: 0.3, throwV: 1150, lag: 24, wt: 1.6, shape: "mace", desc: "mace - short, crushing, hard to throw, gasses you out" },
  spear: { len: 1.3, dmg: 0.85, cut: 0.8, throwV: 720, lag: 34, wt: 0.8, shape: "spear", desc: "spear - twice the blade's reach, light head, cheap to keep swinging" },
  fists: { len: 0, dmg: 0.38, cut: 0.15, throwV: 1e9, lag: 0, wt: 0.5, shape: "fists", bare: true, floor: 70, desc: "fists - bare knuckles, both hands swing, light work" },
};

export function createWeapon(field, f, V, opts) {
  const u = field.unit;
  const lo = opts.lo;
  const hi = opts.hi;
  const HAND = opts.hand || "hand";
  const ELB = opts.elb || "elb";
  const FORE = opts.forePart || "fore";
  const offhand = !!opts.offhand;

  const W = {
    state: "held", // held | thrown | ground
    seg: { ax: 0, ay: 0, bx: 0, by: 0 },
    // last frame's seg - damage.js sweeps seg->prev so a fast tip cannot
    // tunnel past a joint or a shield between frames
    prev: { ax: 0, ay: 0, bx: 0, by: 0 },
    tipSpeed: 0,
    tipV: { x: 0, y: 0 },
    spec: WEAPONS.blade,
    dmg: WEAPONS.blade.dmg,
    len: WEAPONS.blade.len * u,
  };

  const hilt = V.point(0, 0);
  const tip = V.point(0, 0);
  const shaft = V.link(hilt, tip, W.len, 1);
  hilt.gone = tip.gone = true;
  shaft.broken = true;

  let prevTx = 0, prevTy = 0, prevGrip = 0;
  let bdx = 0, bdy = 1, cold = true;

  const J = f.J;
  const seg = W.seg;

  // bare knuckles despawn the slice - the only writer that may re-home
  // it is an armed spec, or setShield/f.reset would leave dead particles
  // floating at stale homes
  W.syncSlice = () => {
    const bare = !!W.spec.bare;
    for (let p = lo; p < hi; p++) {
      field.homed[p] = bare ? 0 : 1;
      field.size[p] = bare ? 0 : 2.4;
    }
  };

  W.setSpec = (name) => {
    W.spec = WEAPONS[name] || WEAPONS.blade;
    W.dmg = W.spec.dmg;
    W.len = W.spec.len * u;
    shaft.len = W.len;
    const bare = !!W.spec.bare;
    if (bare !== W._bare) {
      W._bare = bare;
      W.syncSlice();
      if (!bare) W.reset();
    }
  };

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
    if (dt <= 0 || W.spec.bare) return;
    W.prev.ax = seg.ax; W.prev.ay = seg.ay;
    W.prev.bx = seg.bx; W.prev.by = seg.by;
    if (W.state === "held") {
      const dx = J[HAND].x - J[ELB].x, dy = J[HAND].y - J[ELB].y;
      const d = Math.hypot(dx, dy) || 1e-4;
      // a collapsed forearm makes normalize() noisy - freeze the last
      // good direction instead of letting the tip whip phantom energy
      if (d > 10) {
        // cold start (spawn/reset): snap to the arm line - the lag
        // smoothing below would otherwise hang the blade pointing
        // straight down for the first second and read as a drop
        const k = cold ? 1 : Math.min(1, dt * W.spec.lag);
        bdx += (dx / d - bdx) * k;
        bdy += (dy / d - bdy) * k;
        const m = Math.hypot(bdx, bdy) || 1e-4;
        bdx /= m;
        bdy /= m;
      }
      seg.ax = J[HAND].x;
      seg.ay = J[HAND].y;
      seg.bx = J[HAND].x + bdx * W.len;
      seg.by = J[HAND].y + bdy * W.len;
      // the snap would otherwise read as a ~150px/frame tip spike and a
      // pending throwNow (e.g. released off the go button) fires it away
      if (cold) {
        prevTx = seg.bx;
        prevTy = seg.by;
        cold = false;
      }
      // single-frame finite diff turns joint jitter into phantom whip
      // speed - average over ~5 frames; real swings register almost fully
      const vk = Math.min(1, dt * 12);
      W.tipV.x += ((seg.bx - prevTx) / dt - W.tipV.x) * vk;
      W.tipV.y += ((seg.by - prevTy) / dt - W.tipV.y) * vk;
      W.tipSpeed = Math.hypot(W.tipV.x, W.tipV.y);

      // dropped when the arm is gone
      if (f.part[FORE].severed) throwBlade(0, 0);
      if (!offhand) {
        // lunge burst on grip; a deliberate release while whipping throws
        if (f.intent.grip && !prevGrip) V.impulse(J.root, f.side * 260, 0);
        if (f.intent.throwNow && W.tipSpeed > W.spec.throwV) {
          const hv = V.vel(J[HAND]);
          throwBlade(hv.x, hv.y);
        }
        f.intent.throwNow = 0;
      }
    } else {
      seg.ax = hilt.x;
      seg.ay = hilt.y;
      seg.bx = tip.x;
      seg.by = tip.y;
      const tv = V.vel(tip);
      W.tipV.x = tv.x;
      W.tipV.y = tv.y;
      W.tipSpeed = Math.hypot(tv.x, tv.y);
      if (W.state === "thrown" && W.tipSpeed < 100 && Math.max(hilt.y, tip.y) > env.floor - 40) {
        // a slow weapon near the floor has landed - lay the seg flat so
        // a blade leaning upright at the wall doesn't hang forever
        W.state = "ground";
        const cx = (hilt.x + tip.x) / 2;
        hilt.x = cx - W.len / 2; hilt.y = hilt.py = env.floor - 1;
        tip.x = cx + W.len / 2; tip.y = tip.py = env.floor - 1;
        hilt.px = hilt.x; tip.px = tip.x;
      }
      if (W.state === "ground" && !f.part[FORE].severed && Math.abs(J.root.x - hilt.x) < 0.5 * u) {
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
    if (W.spec.bare) return;
    const home = field.home, hcol = field.hcol;
    // a free weapon is rigid - snap its particles to the seg or spring
    // lag strings them along the flight path into a long comet tail
    const rigid = W.state !== "held";
    const dx = seg.bx - seg.ax, dy = seg.by - seg.ay;
    const d = Math.hypot(dx, dy) || 1e-4;
    const px = -dy / d, py = dx / d;
    const n = hi - lo;
    // trail smear: fast tips drag ghost homes backward along the path
    const smear = Math.min(1, W.tipSpeed / 1400);
    const smX = -W.tipV.x * 0.028 * smear, smY = -W.tipV.y * 0.028 * smear;
    for (let p = lo; p < hi; p++) {
      const i = p * 3;
      const t = (p - lo) / (n - 1);
      const shape = W.spec.shape;
      if (t < 0.12) {
        // hilt knot: a tight blob around the grip
        const a = field.h1(p) * Math.PI * 2;
        const r = field.h2(p) * 0.022 * u;
        home[i] = seg.ax + Math.cos(a) * r;
        home[i + 1] = seg.ay + Math.sin(a) * r;
      } else if (shape === "mace" && t > 0.72) {
        // mace head: a fat bright knot at the end of the shaft
        const a = field.h1(p) * Math.PI * 2;
        const r = (0.045 + field.h2(p) * 0.04) * u;
        home[i] = seg.bx + Math.cos(a) * r;
        home[i + 1] = seg.by + Math.sin(a) * r;
      } else {
        const o = field.h2(p) * 2 - 1;
        const w =
          (shape === "spear" ? 0.009 : 0.016 - 0.011 * t) * u;
        home[i] = seg.ax + dx * t + px * o * w + smX * (t - 0.4);
        home[i + 1] = seg.ay + dy * t + py * o * w + smY * (t - 0.4);
      }
      home[i + 2] = (field.h3(p) - 0.5) * 5;
      if (rigid) field.snap[p] = 1;
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
    cold = true;
    // stale prev corners would sweep a phantom quad across the arena
    W.prev.ax = W.prev.bx = J[HAND].x;
    W.prev.ay = W.prev.by = J[HAND].y;
  };

  for (let p = lo; p < hi; p++) field.noFlock[p] = 1;
  return W;
}

// createFist - a bare knuckle. Weapon-shaped ({seg, tipV, tipSpeed, dmg})
// so the damage loop treats a punch exactly like a weak short weapon:
// seg spans elbow -> just past the hand, tip speed is the hand's own
// velocity. Dead while the forearm is severed. No particles of its own -
// the hand's skin already reads as the fist.
export function createFist(field, f, V, opts = {}) {
  const u = field.unit;
  const HAND = opts.hand || "hand";
  const ELB = opts.elb || "elb";
  const FORE = opts.forePart || "fore";
  const F = {
    state: "held",
    seg: { ax: 0, ay: 0, bx: 0, by: 0 },
    prev: { ax: 0, ay: 0, bx: 0, by: 0 },
    tipSpeed: 0,
    tipV: { x: 0, y: 0 },
    spec: WEAPONS.fists,
    dmg: WEAPONS.fists.dmg,
    minV: 300, // a fist is hand speed only - no lever amplification
    dead: false,
  };
  F.update = () => {
    F.prev.ax = F.seg.ax; F.prev.ay = F.seg.ay;
    F.prev.bx = F.seg.bx; F.prev.by = F.seg.by;
    const E = f.J[ELB], H = f.J[HAND];
    F.dead = f.part[FORE].severed;
    if (F.dead) {
      F.tipSpeed = 0;
      return;
    }
    const dx = H.x - E.x, dy = H.y - E.y;
    const d = Math.hypot(dx, dy) || 1;
    F.seg.ax = E.x;
    F.seg.ay = E.y;
    F.seg.bx = H.x + (dx / d) * 0.08 * u;
    F.seg.by = H.y + (dy / d) * 0.08 * u;
    const v = V.vel(H);
    F.tipV.x = v.x;
    F.tipV.y = v.y;
    F.tipSpeed = Math.hypot(v.x, v.y);
  };
  return F;
}
