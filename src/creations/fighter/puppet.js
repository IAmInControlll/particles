// puppet.js - one fighter: a verlet joint skeleton wearing a particle skin.
// Owns a contiguous particle range [lo,hi). Each part maps a slice onto a
// bone segment (bone), a circle (ring), or a joint cluster (knot) and is
// the single source of truth for hits, severs, and mass accounting.

const TAU = Math.PI * 2;

// body plan, all lengths in field.unit
const PROPORTIONS = {
  thigh: 0.46,
  shin: 0.44,
  spine: 0.42,
  neck: 0.16,
  headR: 0.13,
  collar: 0.1,
  upper: 0.34,
  fore: 0.34,
};

// one row per body part; severTree maps a joint to the parts that die with it.
// th is half-thickness as a fraction of unit.
const PART_DEFS = [
  { name: "head", type: "ring", ja: "head", n: 26, r: 0.13, gain: 1.1 },
  { name: "spine", type: "bone", ja: "root", jb: "chest", n: 30, th: 0.05, gain: 0.95 },
  { name: "collar", type: "bone", ja: "chest", jb: "sho", n: 10, th: 0.035, gain: 0.9 },
  { name: "upper", type: "bone", ja: "sho", jb: "elb", n: 16, th: 0.03, gain: 0.9 },
  { name: "fore", type: "bone", ja: "elb", jb: "hand", n: 16, th: 0.028, gain: 0.9 },
  { name: "thighF", type: "bone", ja: "root", jb: "kneeF", n: 20, th: 0.034, gain: 0.85 },
  { name: "shinF", type: "bone", ja: "kneeF", jb: "footF", n: 18, th: 0.028, gain: 0.85 },
  { name: "thighB", type: "bone", ja: "root", jb: "kneeB", n: 20, th: 0.034, gain: 0.7 },
  { name: "shinB", type: "bone", ja: "kneeB", jb: "footB", n: 18, th: 0.028, gain: 0.7 },
  { name: "kRoot", type: "knot", ja: "root", n: 10, r: 0.035, gain: 1.0 },
  { name: "kChest", type: "knot", ja: "chest", n: 8, r: 0.028, gain: 1.05 },
  { name: "kSho", type: "knot", ja: "sho", n: 7, r: 0.022, gain: 1.05 },
  { name: "kElb", type: "knot", ja: "elb", n: 7, r: 0.02, gain: 1.05 },
  { name: "kHand", type: "knot", ja: "hand", n: 10, r: 0.024, gain: 1.15 },
  { name: "kKneeF", type: "knot", ja: "kneeF", n: 6, r: 0.02, gain: 0.9 },
  { name: "kKneeB", type: "knot", ja: "kneeB", n: 6, r: 0.02, gain: 0.75 },
  { name: "kFootF", type: "knot", ja: "footF", n: 7, r: 0.02, gain: 0.9 },
  { name: "kFootB", type: "knot", ja: "footB", n: 7, r: 0.02, gain: 0.75 },
];

// joint -> parts that sever when its integrity hits zero
const SEVER_TREE = {
  head: ["head"],
  chest: ["head", "spine", "collar", "upper", "fore"],
  sho: ["collar", "upper", "fore"],
  elb: ["fore"],
  kneeF: ["shinF"],
  kneeB: ["shinB"],
  root: ["head", "spine", "collar", "upper", "fore", "thighF", "shinF", "thighB", "shinB"],
};

// joints whose integrity can be damaged by hits (armor the rest)
const HIT_JOINTS = ["head", "chest", "sho", "elb", "kneeF", "kneeB", "root"];

export function createPuppet(field, V, opts) {
  const u = field.unit;
  const P = PROPORTIONS;
  const lo = opts.lo;
  const weaponLo = opts.weaponLo;
  const hi = opts.hi;
  const cols = opts.colors; // {body:[r,g,b], glow:[r,g,b]}
  const floor = opts.floor;

  const f = {
    lo,
    hi,
    weaponLo,
    side: opts.side,
    x: opts.x,
    intent: { move: 0, jump: 0, crouch: 0, kick: 0, grip: 0, throwNow: 0, aimOn: 0, aim: { x: 0, y: 0 } },
    J: {},
    parts: [],
    part: {},
    grounded: true,
    staggerT: 0,
    kickT: 0,
    walkPhase: 0,
    dying: [],
    alive: new Uint8Array(hi - lo).fill(1),
    mass0: weaponLo - lo,
    mass: weaponLo - lo,
  };

  // ---- skeleton ----
  const J = f.J;
  const spawnJoints = (x) => {
    const s = f.side;
    const legLen = (P.thigh + P.shin) * u;
    const ry = floor - legLen;
    const put = (name, jx, jy) => (J[name] ? ((J[name].x = J[name].px = jx), (J[name].y = J[name].py = jy), J[name]) : (J[name] = V.point(jx, jy)));
    put("root", x, ry);
    put("chest", x + s * 0.02 * u, ry - P.spine * u);
    put("head", x + s * 0.03 * u, ry - (P.spine + P.neck) * u);
    put("sho", x + s * P.collar * u, ry - (P.spine + 0.03) * u);
    put("elb", x + s * (P.collar + 0.1) * u, ry - (P.spine - P.upper * 0.8) * u);
    put("hand", x + s * (P.collar + 0.16) * u, ry - (P.spine - P.upper * 0.8 - 0.1) * u);
    put("kneeF", x + s * 0.1 * u, ry + P.thigh * u);
    put("footF", x + s * 0.16 * u, floor);
    put("kneeB", x - s * 0.05 * u, ry + P.thigh * u);
    put("footB", x - s * 0.12 * u, floor);
  };

  spawnJoints(opts.x);
  f.cons = [
    V.link(J.root, J.chest, P.spine * u),
    V.link(J.chest, J.head, P.neck * u),
    V.link(J.chest, J.sho, P.collar * u),
    V.link(J.sho, J.root, (P.spine + 0.02) * u, 0.8),
    V.link(J.sho, J.elb, P.upper * u),
    V.link(J.elb, J.hand, P.fore * u),
    V.link(J.root, J.kneeF, P.thigh * u),
    V.link(J.kneeF, J.footF, P.shin * u),
    V.link(J.root, J.kneeB, P.thigh * u),
    V.link(J.kneeB, J.footB, P.shin * u),
    V.link(J.head, J.sho, (P.neck + P.collar) * u, 0.6),
  ];

  // ---- particle skin: assign [lo, weaponLo) across PART_DEFS ----
  let cur = lo;
  for (const def of PART_DEFS) {
    const part = { ...def, lo: cur, hi: cur + def.n, severed: false };
    f.parts.push(part);
    f.part[def.name] = part;
    cur = part.hi;
  }
  // leftover body-range particles join the spine part
  if (cur < weaponLo) f.part.spine.hi = weaponLo;

  const size0 = field.size.slice(lo, hi);
  const integ0 = {};
  for (const n of HIT_JOINTS) integ0[n] = 4;
  f.integrity = { ...integ0 };

  // flag the owned range once at boot
  for (let p = lo; p < hi; p++) field.noFlock[p] = 1;

  const scratch = {};
  for (const name of ["root", "chest", "head", "sho", "elb", "hand", "kneeF", "footF", "kneeB", "footB"])
    scratch[name] = { x: 0, y: 0 };

  const pull = (name, tx, ty, k) => {
    const j = J[name];
    j.pull = scratch[name];
    j.pull.x = tx;
    j.pull.y = ty;
    j.k = k;
  };

  const legLen = () => (P.thigh + P.shin) * u;

  // ---- pose: intent -> joint pull targets ----
  function pose(dt, env) {
    const s = f.side;
    const crouch = f.intent.crouch;
    const stance = crouch ? 0.58 : 1;
    const rootV = V.vel(J.root);
    const lean = Math.max(-0.12, Math.min(0.12, (rootV.x / u) * 0.06)) * s;

    f.x = Math.max(env.wallL + 0.3 * u, Math.min(env.wallR - 0.3 * u, f.x + f.intent.move * 1.7 * u * dt * (crouch ? 0.55 : 1)));

    const air = !f.grounded;
    const stag = f.staggerT > 0;
    const kMul = stag ? 0.14 : crouch ? 1.25 : 1;

    const rx = f.x + lean * u;
    pull("root", rx, floor - legLen() * stance, 0.09 * kMul);

    // torso chain
    const hunch = crouch ? 0.16 : 0.05;
    pull("chest", rx + s * (hunch + lean) * u, J.root.y - P.spine * u * stance, 0.11 * kMul);
    pull("head", rx + s * (hunch + 0.03 + lean) * u, J.root.y - (P.spine + P.neck) * u * stance, 0.1 * kMul);
    pull("sho", rx + s * (hunch + P.collar) * u, J.root.y - (P.spine + 0.01) * u * stance, 0.11 * kMul);

    // legs
    const speed = Math.abs(rootV.x);
    if (f.intent.move !== 0 && !air) f.walkPhase += dt * (5 + speed * 0.012);
    const sw = Math.min(1, speed / (0.9 * u)) * (f.intent.move !== 0 ? 1 : 0.4);
    const stride = 0.3 * u * sw;
    const lift = 0.1 * u * sw;
    const stF = s * (crouch ? 0.22 : 0.16) * u;
    const stB = -s * (crouch ? 0.17 : 0.11) * u;

    if (f.kickT > 0) {
      // kick: front leg spears forward
      pull("footF", rx + s * 0.62 * u, floor - 0.14 * u, 0.5);
      pull("kneeF", rx + s * 0.34 * u, floor - 0.34 * u, 0.3);
      pull("footB", rx + stB, floor, 0.16 * kMul);
      pull("kneeB", (J.root.x + rx + stB) / 2 - s * 0.04 * u, (J.root.y + floor) / 2, 0.08 * kMul);
    } else if (air) {
      pull("footF", rx + s * 0.08 * u, J.root.y + P.shin * u * 0.8, 0.14);
      pull("kneeF", rx + s * 0.22 * u, J.root.y + P.thigh * u * 0.5, 0.1);
      pull("footB", rx - s * 0.14 * u, J.root.y + P.shin * u * 0.9, 0.14);
      pull("kneeB", rx - s * 0.02 * u, J.root.y + P.thigh * u * 0.5, 0.1);
    } else {
      const a = f.walkPhase;
      pull("footF", rx + stF + Math.sin(a) * stride, floor - Math.max(0, Math.cos(a)) * lift - 2, 0.17 * kMul);
      pull("footB", rx + stB + Math.sin(a + Math.PI) * stride, floor - Math.max(0, Math.cos(a + Math.PI)) * lift - 2, 0.17 * kMul);
      const bend = (0.05 + 0.06 * sw) * u;
      pull("kneeF", (J.root.x + J.footF.x) / 2 + s * bend, (J.root.y + J.footF.y) / 2 + 0.02 * u, 0.08 * kMul);
      pull("kneeB", (J.root.x + J.footB.x) / 2 + s * bend, (J.root.y + J.footB.y) / 2 + 0.02 * u, 0.08 * kMul);
    }

    // armed arm: aim target inside the reach envelope around the shoulder
    const reach = (P.upper + P.fore) * u * 0.98;
    if (f.intent.aimOn) {
      const sx = J.sho.x, sy = J.sho.y;
      let dx = f.intent.aim.x - sx, dy = f.intent.aim.y - sy;
      const d = Math.hypot(dx, dy) || 1e-4;
      if (d > reach) { dx *= reach / d; dy *= reach / d; }
      if (d < 0.12 * u) { dx *= (0.12 * u) / d; dy *= (0.12 * u) / d; }
      const hx = sx + dx, hy = sy + dy;
      const gripK = f.intent.grip ? 0.26 : 0.14;
      pull("hand", hx, hy, gripK * kMul);
      // elbow bends down-and-back like a real arm
      let nx = -dy / d, ny = dx / d;
      if (ny - nx * s < 0) { nx = -nx; ny = -ny; }
      pull("elb", sx + dx * 0.5 + nx * d * 0.32, sy + dy * 0.5 + ny * d * 0.32, 0.1 * kMul);
    } else {
      // idle: arm hangs slightly forward
      pull("hand", rx + s * 0.2 * u, J.root.y - P.spine * u * 0.35, 0.08 * kMul);
      pull("elb", rx + s * 0.13 * u, J.root.y - P.spine * u * 0.15, 0.08 * kMul);
    }
  }

  // ---- skin write ----
  const hot = [1.0, 0.72, 0.35];
  function writeHomes() {
    const home = field.home, hcol = field.hcol;
    for (const pt of f.parts) {
      if (pt.severed) continue;
      const g = pt.gain;
      if (pt.type === "bone") {
        const A = J[pt.ja], B = J[pt.jb];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const px = (-dy / d) * (pt.th || 0) * u, py = (dx / d) * (pt.th || 0) * u;
        for (let p = pt.lo; p < pt.hi; p++) {
          if (!f.alive[p - lo]) continue;
          const t = (p - pt.lo) / (pt.hi - pt.lo - 1 || 1);
          const o = field.h2(p) * 2 - 1;
          const i = p * 3;
          home[i] = A.x + dx * t + px * o;
          home[i + 1] = A.y + dy * t + py * o;
          home[i + 2] = (field.h3(p) - 0.5) * 6;
          const m = (0.7 + 0.5 * field.h3(p)) * g;
          hcol[i] = cols.body[0] * m;
          hcol[i + 1] = cols.body[1] * m;
          hcol[i + 2] = cols.body[2] * m;
        }
      } else {
        const A = J[pt.ja];
        const R = pt.r * u;
        for (let p = pt.lo; p < pt.hi; p++) {
          if (!f.alive[p - lo]) continue;
          const i = p * 3;
          if (pt.type === "ring") {
            const a = ((p - pt.lo) / pt.n) * TAU + field.h1(p) * 0.4;
            const r = R * (0.8 + 0.35 * field.h3(p));
            home[i] = A.x + Math.cos(a) * r;
            home[i + 1] = A.y + Math.sin(a) * r;
          } else {
            const a = field.h1(p) * TAU;
            const r = R * Math.sqrt(field.h2(p));
            home[i] = A.x + Math.cos(a) * r;
            home[i + 1] = A.y + Math.sin(a) * r;
          }
          home[i + 2] = (field.h3(p) - 0.5) * 6;
          const m = (0.75 + 0.45 * field.h3(p)) * g;
          hcol[i] = cols.body[0] * m;
          hcol[i + 1] = cols.body[1] * m;
          hcol[i + 2] = cols.body[2] * m;
        }
      }
    }
  }

  // ---- kill / sever ----
  const killP = (p, dirx, diry, imp) => {
    const i = p * 3;
    f.alive[p - lo] = 0;
    f.mass--;
    field.homed[p] = 0;
    field.vel[i] += dirx * imp + (field.h1(p) - 0.5) * imp * 1.6;
    field.vel[i + 1] += diry * imp + (field.h2(p) - 0.5) * imp * 1.6 - imp * 0.4;
    const m = 0.9 + field.h3(p) * 0.6;
    field.hcol[i] = hot[0] * m;
    field.hcol[i + 1] = hot[1] * m;
    field.hcol[i + 2] = hot[2] * m;
    f.dying.push({ p, at: field.T + 1.2 + field.h1(p) * 1.4 });
  };

  function severJoint(name) {
    const lost = SEVER_TREE[name];
    if (!lost) return [];
    const cut = [];
    for (const pn of lost) {
      const pt = f.part[pn];
      if (!pt || pt.severed) continue;
      pt.severed = true;
      cut.push(pn);
      for (let p = pt.lo; p < pt.hi; p++)
        if (f.alive[p - lo]) killP(p, 0, 1, 1.6);
    }
    if (cut.length) {
      for (const c of f.cons)
        if (!c.broken && lost.includes(partOfJoint(c.a)) && lost.includes(partOfJoint(c.b))) c.broken = true;
      for (const jn of Object.keys(J)) if (lost.includes(partOfJointJ(jn))) J[jn].pull = null;
    }
    return cut;
  }

  const JOINT_PART = {
    head: "head", chest: "spine", sho: "upper", elb: "fore", hand: "fore",
    kneeF: "shinF", footF: "shinF", kneeB: "shinB", footB: "shinB", root: "spine",
  };
  const partOfJoint = (j) => f.part[JOINT_PART[Object.keys(J).find((k) => J[k] === j)]]?.name;
  const partOfJointJ = (jn) => JOINT_PART[jn];

  // ---- combat surface ----
  f.applyHit = (x, y, power, dirx, diry) => {
    // power in px/s. Returns what the hit did.
    const hitR = (0.14 + Math.min(0.1, power / 9000)) * u;
    const r2 = hitR * hitR;
    let killed = 0;
    const killN = Math.min(38, 3 + (power / 90) | 0);
    const cand = [];
    for (let p = lo; p < weaponLo; p++) {
      if (!f.alive[p - lo]) continue;
      const dx = field.home[p * 3] - x, dy = field.home[p * 3 + 1] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 * 2.6) cand.push(p);
    }
    const take = Math.min(cand.length, killN);
    for (let k = 0; k < take; k++) {
      killP(cand[(k * cand.length) / take | 0], dirx, diry, 1.5 + power / 700);
      killed++;
    }

    const severed = [];
    for (const jn of HIT_JOINTS) {
      const j = J[jn];
      const dx = j.x - x, dy = j.y - y;
      if (dx * dx + dy * dy < r2 && f.integrity[jn] > 0) {
        f.integrity[jn] -= 1 + power / 1400;
        if (f.integrity[jn] <= 0) severed.push(...severJoint(jn));
      }
    }

    if (power > 520) {
      f.staggerT = Math.max(f.staggerT, 0.3 + power / 2600);
      V.impulse(J.root, dirx * power * 0.22, diry * power * 0.22);
      V.impulse(J.chest, dirx * power * 0.3, diry * power * 0.3);
    }
    return { killed, severed };
  };

  f.shove = (dirx, diry) => {
    V.impulse(J.root, dirx * 720, diry * 720 - 140);
    V.impulse(J.chest, dirx * 900, diry * 900 - 160);
    V.impulse(J.head, dirx * 700, diry * 700 - 120);
    f.staggerT = Math.max(f.staggerT, 0.7);
  };

  f.dead = () => f.part.head.severed || f.part.spine.severed || f.mass < f.mass0 * 0.4;

  f.step = (dt, env) => {
    f.staggerT = Math.max(0, f.staggerT - dt);
    f.kickT = Math.max(0, f.kickT - dt);
    if (f.intent.jump && f.grounded) {
      const jv = 640;
      V.impulse(J.root, 0, -jv);
      V.impulse(J.chest, 0, -jv * 0.85);
      V.impulse(J.footF, 0, -jv * 1.1);
      V.impulse(J.footB, 0, -jv * 1.1);
      f.grounded = false;
    }
    f.intent.jump = 0;
    if (f.intent.kick && f.kickT <= 0) f.kickT = 0.3;
    f.intent.kick = 0;

    pose(dt, env);
    V.step(dt, env);

    const fp = Math.max(J.footF.y, J.footB.y);
    f.grounded = fp > floor - 8 || J.root.y > floor - legLen() * 0.9;

    for (const name of Object.keys(J)) J[name].pull = null;
    writeHomes();
    for (let i = f.dying.length - 1; i >= 0; i--)
      if (field.T >= f.dying[i].at) {
        field.size[f.dying[i].p] = 0;
        f.dying[i] = f.dying[f.dying.length - 1];
        f.dying.pop();
      }
  };

  f.face = (s) => (f.side = s);

  f.reset = (x) => {
    f.x = x;
    spawnJoints(x);
    for (const c of f.cons) c.broken = false;
    for (const pt of f.parts) pt.severed = false;
    f.integrity = { ...integ0 };
    f.alive.fill(1);
    f.mass = f.mass0;
    f.dying.length = 0;
    f.staggerT = f.kickT = 0;
    for (let p = lo; p < hi; p++) {
      field.homed[p] = 1;
      field.snap[p] = 1;
      field.size[p] = size0[p - lo];
    }
    writeHomes();
  };

  return f;
}
