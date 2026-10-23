// weapon.js - the armed-hand implement riding a fighter's hand.
// Held: the segment rides the forearm direction; tip speed is the damage
// signal. Thrown: hilt and tip become free verlet points with spin that
// land and wait for the owner to walk over. WEAPONS rows tune reach,
// damage, throw threshold, and silhouette per loadout.

import { sizeOf, LX, LY } from "./skin.js";

export const WEAPONS = {
  blade: { len: 0.62, r: 0.03, dmg: 1.0, cut: 1.0, throwV: 850, lag: 40, wt: 1.0, shape: "taper", desc: "blade - balanced reach, honest bite, fair on the arms" },
  mace: { len: 0.48, r: 0.06, dmg: 1.55, cut: 0.3, throwV: 1150, lag: 24, wt: 1.6, shape: "mace", desc: "mace - short, crushing, hard to throw, gasses you out" },
  spear: { len: 1.3, r: 0.025, dmg: 0.85, cut: 0.8, throwV: 720, lag: 34, wt: 0.8, shape: "spear", desc: "spear - twice the blade's reach, light head, cheap to keep swinging" },
  fists: { len: 0, dmg: 0.38, cut: 0.15, throwV: 1e9, lag: 0, wt: 0.5, shape: "fists", bare: true, floor: 70, desc: "fists - bare knuckles, both hands swing, light work" },
};

// ---- look: each shape is a list of local points (a along the seg from
// the hand in u, b across it, d sprite width in u, m material) ----
const STEEL = [0.66, 0.7, 0.77], EDGE = [0.93, 0.96, 1.0], FULLER = [0.46, 0.5, 0.57];
const BRASS = [0.82, 0.63, 0.3], IRON = [0.4, 0.42, 0.47], GRIP = [0.3, 0.17, 0.08], WRAP = [0.48, 0.3, 0.13];
const WOOD = [0.58, 0.38, 0.19], WOOD2 = [0.44, 0.28, 0.14];
const TRAIL_C = [0.62, 0.78, 1.0];
const Z = 1.3;

// n is the slice budget: the off-hand rides the smaller shield slice,
// so detail counts scale down and the main body keeps a solid line
function shapeFor(shape, len, n) {
  const pts = [];
  const sc = Math.min(1, n / 116);
  const c = (k) => Math.max(2, Math.round(k * sc));
  const add = (a, b, d, m) => pts.push({ a, b, d, m });
  const line = (k, a0, a1, b, d, m) => {
    for (let i = 0; i < k; i++) add(a0 + ((a1 - a0) * (i + 0.5)) / k, b, d, typeof m === "function" ? m(i) : m);
  };
  const ring = (k, a, b, r, d, m) => {
    for (let i = 0; i < k; i++) add(a + Math.cos((i / k) * 6.283) * r, b + Math.sin((i / k) * 6.283) * r, d, m);
  };
  const wrap = (i) => (i % 2 ? WRAP : GRIP);
  if (shape === "taper") {
    ring(3, -0.115, 0, 0.012, 0.022, BRASS);
    line(c(9), -0.1, 0.02, 0, 0.032, wrap);
    const g = c(11);
    for (let i = 0; i < g; i++) add(0.045, -0.085 + (0.17 * i) / (g - 1), 0.026, BRASS); // crossguard
    add(0.065, 0, 0.034, BRASS);
    // rows across the blade (lit edge, fuller, shadow edge), two when the
    // budget is thin so each row stays a solid line; the last 0.14u
    // tapers to a point so the silhouette reads as a sword, not a rod
    const rows = n - pts.length >= 66 ? 3 : 2;
    const k = Math.floor((n - pts.length) / rows);
    const mats = rows === 3 ? [STEEL, FULLER, EDGE] : [STEEL, EDGE];
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < k; i++) {
        const a = 0.07 + ((len - 0.075) * (i + 0.5)) / k;
        const hw = 0.019 * Math.min(1, (len - a) / 0.14);
        const b = (row - (rows - 1) / 2) * hw * (rows === 3 ? 0.62 : 0.8);
        add(a, b, 0.012 + hw * (rows === 3 ? 0.85 : 1.1), mats[row]);
      }
  } else if (shape === "spear") {
    add(-0.37, 0, 0.042, IRON);
    add(-0.35, 0, 0.042, IRON);
    line(c(8), -0.07, 0.07, 0, 0.04, wrap);
    const head = 3 * c(10), sock = c(4);
    const k = Math.max(4, n - pts.length - head - sock);
    line(k, -0.34, len - 0.2, 0, 0.036 + 0.008 * (1 - sc), (i) => (i % 5 === 2 ? WOOD2 : WOOD));
    line(sock, len - 0.215, len - 0.17, 0, 0.044, IRON);
    // leaf blade: widest a third of the way up, to a sharp point
    for (let i = 0; i < head; i++) {
      const row = i % 3, t = (Math.floor(i / 3) + 0.5) / (head / 3);
      const a = len - 0.17 + 0.17 * t;
      const hw = 0.034 * Math.sin(Math.PI * Math.pow(t, 0.62));
      add(a, (row - 1) * hw * 0.6, 0.012 + hw * 0.8, row === 2 ? EDGE : row === 1 ? STEEL : FULLER);
    }
  } else if (shape === "mace") {
    add(-0.1, 0, 0.032, IRON);
    line(c(9), -0.09, 0.05, 0, 0.038, wrap);
    const hc = len - 0.045;
    const fr = sc < 0.8 ? 2 : 3, outer = c(12), inner = c(7);
    const k = Math.max(4, n - pts.length - 6 * fr - outer - inner - 1);
    line(k, 0.05, hc - 0.04, 0, 0.036, (i) => (i % 4 === 1 ? WOOD2 : WOOD));
    // six flanges stand off the ball - the outline says "mace" even
    // edge-on, a plain disc reads as a lollipop
    for (let j = 0; j < 6; j++) {
      const ang = (j / 6) * 6.283 + 0.26;
      for (let r = 0; r < fr; r++) {
        const rr = 0.062 + (r * 0.032) / fr;
        add(hc + Math.cos(ang) * rr, Math.sin(ang) * rr, 0.03 - (r * 0.012) / fr, STEEL);
      }
    }
    ring(outer, hc, 0, 0.046, 0.036, IRON);
    ring(inner, hc, 0, 0.024, 0.036, IRON);
    add(hc, 0, 0.036, IRON);
  }
  return pts;
}

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
      if (bare) field.size[p] = 0; // armed sizes come from writeHomes
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

  // contact.js stops a blade at flesh: it repoints the held direction
  // and re-seats the seg on the moved hand. Tip speed then measures from
  // the stopped pose, so a blocked blade reads as stopped next frame.
  W.setDir = (x, y) => {
    const m = Math.hypot(x, y);
    if (m < 1e-4) return;
    bdx = x / m;
    bdy = y / m;
  };
  W.place = () => {
    seg.ax = J[HAND].x;
    seg.ay = J[HAND].y;
    seg.bx = J[HAND].x + bdx * W.len;
    seg.by = J[HAND].y + bdy * W.len;
    prevTx = seg.bx;
    prevTy = seg.by;
  };

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

  // the last few particles are an additive swing trail behind the tip
  const nT = Math.max(6, Math.round((hi - lo) * 0.11));
  const nB = hi - lo - nT;
  const HIST = 6;
  const hist = new Float32Array(HIST * 2);
  let hN = 0, hHead = 0, look = null;
  W.writeHomes = () => {
    if (W.spec.bare) return;
    if (!look || look.shape !== W.spec.shape) look = { shape: W.spec.shape, pts: shapeFor(W.spec.shape, W.len / u, nB) };
    const home = field.home, hcol = field.hcol, size = field.size, solid = field.solid;
    // rigid always: spring lag would bend steel into a comet tail
    const dx = seg.bx - seg.ax, dy = seg.by - seg.ay;
    const d = Math.hypot(dx, dy) || 1e-4;
    const tx = dx / d, ty = dy / d;
    const px = -ty * f.side, py = tx * f.side; // +b is the leading edge
    const face = px * LX + py * LY; // > 0 when the +b edge faces the light
    const glint = Math.min(1, W.tipSpeed / 1600);
    for (let k = 0; k < nB; k++) {
      const p = lo + k, i = p * 3, q = look.pts[k];
      if (!q) {
        size[p] = 0;
        continue;
      }
      home[i] = seg.ax + (tx * q.a + px * q.b) * u;
      home[i + 1] = seg.ay + (ty * q.a + py * q.b) * u;
      home[i + 2] = Z;
      field.snap[p] = 1;
      size[p] = sizeOf(q.d, Z);
      solid[p] = 1;
      const side = q.b > 0.001 ? 1 : q.b < -0.001 ? -1 : 0;
      const m = 0.9 + 0.3 * side * face + (q.m === EDGE ? glint * 0.25 : 0);
      hcol[i] = Math.min(1, q.m[0] * m);
      hcol[i + 1] = Math.min(1, q.m[1] * m);
      hcol[i + 2] = Math.min(1, q.m[2] * m);
    }
    // a jump (reset, pickup) restarts the trail instead of streaking it
    const last = (hHead + HIST - 1) % HIST;
    if (hN && Math.hypot(seg.bx - hist[last * 2], seg.by - hist[last * 2 + 1]) > 0.9 * u) hN = 0;
    hist[hHead * 2] = seg.bx;
    hist[hHead * 2 + 1] = seg.by;
    hHead = (hHead + 1) % HIST;
    hN = Math.min(HIST, hN + 1);
    const heat = Math.max(0, Math.min(1, (W.tipSpeed - 380) / 1000));
    for (let k = 0; k < nT; k++) {
      const p = lo + nB + k, i = p * 3;
      // spread the trail along the last hN tip samples, newest first
      const jf = (k / (nT - 1)) * Math.max(0, hN - 1), j0 = jf | 0, fr = jf - j0;
      const a = (hHead - 1 - j0 + HIST * 2) % HIST, b = (hHead - 2 - j0 + HIST * 2) % HIST;
      const bj = j0 + 1 < hN ? b : a;
      home[i] = hist[a * 2] + (hist[bj * 2] - hist[a * 2]) * fr;
      home[i + 1] = hist[a * 2 + 1] + (hist[bj * 2 + 1] - hist[a * 2 + 1]) * fr;
      home[i + 2] = Z;
      field.snap[p] = 1;
      solid[p] = 0;
      const fade = heat * (1 - k / nT);
      size[p] = fade > 0.03 ? sizeOf(0.11 * (1 - (k / nT) * 0.5), Z) : 0;
      hcol[i] = TRAIL_C[0] * fade;
      hcol[i + 1] = TRAIL_C[1] * fade;
      hcol[i + 2] = TRAIL_C[2] * fade;
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
