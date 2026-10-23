// puppet.js - one fighter: a verlet joint skeleton wearing a particle skin.
// Owns a contiguous particle range [lo,hi). Each part maps a slice onto a
// bone segment (bone), a circle (ring), or a joint cluster (knot) and is
// the single source of truth for hits, severs, and mass accounting.

import { createSkin } from "./skin.js";

// body plan, all lengths in field.unit - a real torso chain
// (pelvis > waist > ribcage > neck > head), not a stick
const PROPORTIONS = {
  thigh: 0.6,
  shin: 0.57,
  belly: 0.22,   // pelvis -> waist
  spine: 0.3,    // waist -> ribcage
  collar: 0.13,  // ribcage -> shoulder
  neckP: 0.08,   // ribcage -> neck
  neck2: 0.14,   // neck -> head
  headR: 0.16,
  upper: 0.44,
  fore: 0.44,
};

// one row per body part; severTree maps a joint to the parts that die with it.
// Rows run back to front: solid particles paint in index order, so the
// far leg and arm sit behind the trunk and the weapon arm in front.
// Hands and boots belong to their forearm and shin. skin.js owns shapes.
const PART_DEFS = [
  { name: "thighB", type: "bone", ja: "root", jb: "kneeB", n: 56 },
  { name: "shinB", type: "bone", ja: "kneeB", jb: "footB", n: 44 },
  { name: "trapS", type: "bone", ja: "chest", jb: "shoS", n: 8 },
  { name: "upS", type: "bone", ja: "shoS", jb: "elbS", n: 26 },
  { name: "foreS", type: "bone", ja: "elbS", jb: "handS", n: 30 },
  { name: "thighF", type: "bone", ja: "root", jb: "kneeF", n: 56 },
  { name: "shinF", type: "bone", ja: "kneeF", jb: "footF", n: 44 },
  { name: "belly", type: "bone", ja: "root", jb: "belly", n: 46 },
  { name: "ribcage", type: "bone", ja: "belly", jb: "chest", n: 62 },
  { name: "neck", type: "bone", ja: "chest", jb: "neck", n: 10 },
  { name: "head", type: "disc", ja: "head", n: 50 },
  { name: "collar", type: "bone", ja: "chest", jb: "sho", n: 10 },
  { name: "upper", type: "bone", ja: "sho", jb: "elb", n: 28 },
  { name: "fore", type: "bone", ja: "elb", jb: "hand", n: 30 },
];

// the duel's tuning table - combat dials a designer touches live here:
// movement forces, motor strength, stamina economy, damage thresholds
export const TUNE = {
  walkV: 2.6,          // *u - top walk speed
  accel: 16, brake: 22, // lerp rates toward target speed
  stepTrig: 0.1,       // *u - how far the hips pass the rear foot before it steps
  stepT: 0.18,         // s per foot swing
  stepLift: 0.14,      // *u - how high a stepping foot rises
  standH: 0.92,        // hip height as a fraction of leg length - soft knees
  walkDip: 0.06,       // extra knee bend at full walk speed
  handV: 2600,         // px/s the arm motor can carry the hand at full drive
  hipK: 0.25,          // pelvis height hold - the buoyant torso floats it up to straight legs otherwise
  anchorK: 0.4,        // planted-foot pin strength
  pushK: 0.11,         // weight hint on plant - the root servo owns propulsion
  jumpV: 1250,         // px/s takeoff impulse (air-damped buoyancy ~0.6g fall)
  jumpH: 380,          // px/s horizontal carry into a jump - D+W arcs diagonal
  airT: 0.35,          // s takeoff grace before ground clauses fire
  airVMax: 460,        // px/s cap on held-direction air steering
  stagK: 0.14,         // pull multiplier while staggered
  faintK: 0.12,        // pull multiplier while fainted
  driveBase: 1.3,      // motor strength at wt 0, full tank
  driveWt: 0.3,        // strength lost per unit weapon weight
  driveMin: 0.3,       // strength floor - even a dying arm twitches
  stamPowLo: 0.4, stamPowHi: 0.6, // strength swing across the tank
  drainHot: 0.13,      // stam/s while above damage speed
  drainWork: 0.04,     // stam/s in the 150-450 work band
  drainLoad: 0.1,      // stam/s per unit of wrist stretch - the proxy's
                       // lag is the physical effort of dragging the arm
  drainKick: 0.07, drainJump: 0.05, drainBlock: 0.05, drainClash: 0.06,
  regenRest: 0.26,     // stam/s at rest (slow baseline + quick refill)
  regenFaint: 0.5,     // stam/s while floored
  faintT: 1.6,         // s on the floor when the tank hits zero
  faintEnd: 0.35,      // tank level that lets the fighter stand
  dmgFloor: 320,       // px/s of hit power that deals nothing - grazes
  killBase: 1.0, killRate: 350, killMax: 12, // particles per hit
  integHit: 0.35,      // flat integrity chew per landed hit
  integVel: 1600,      // px/s that adds 1 more point of integrity damage
  severKick: 320,      // px/s the freed limb gets knocked
  flexMin: 0.5,        // rad - folded-double bound for hinge limits
  // BB body plan (decoded from the APK): the torso floats on negative
  // gravity while legs+feet ballast it. gs < 0 is a buoyant joint.
  buoy: { belly: -1.2, chest: -2.0, neck: -2.0, head: -2.4, sho: -0.4, shoS: -0.4 },
  footIm: 0.18,        // BB foot COM is a heavy ballast -> im ~1/6
  kneeIm: 0.35, rootIm: 0.5, armIm: 1.25,
  leanForce: 7000,     // px/s^2 sideways head/chest force for walk lean - 18000 capsized the buoyant torso (~2340px/s^2 ≈ 1g sideways vs soft spine hinges) into a walking face-plant
};

// joint -> parts that sever when its integrity hits zero
const SEVER_TREE = {
  head: ["head"],
  chest: ["head", "neck", "ribcage", "collar", "trapS", "upper", "fore", "upS", "foreS"],
  sho: ["collar", "upper", "fore"],
  shoS: ["trapS", "upS", "foreS"],
  elb: ["fore"],
  kneeF: ["shinF"],
  kneeB: ["shinB"],
  root: ["head", "neck", "belly", "ribcage", "collar", "trapS", "upper", "fore", "upS", "foreS", "thighF", "shinF", "thighB", "shinB"],
};
// only limbs detach - a head or spine coming apart is the mass bar's
// job to express, not an instant kill
const SEVERABLE = { sho: 1, elb: 1, shoS: 1, elbS: 1, kneeF: 1, kneeB: 1 };

// head or neck integrity below this fraction is a knockout
const VITAL_KO = 0.45;

// joints whose integrity can be damaged by hits (armor the rest)
const HIT_JOINTS = ["head", "neck", "chest", "belly", "sho", "elb", "kneeF", "kneeB", "root"];

export function createPuppet(field, V, opts) {
  const u = field.unit;
  const P = PROPORTIONS;
  const lo = opts.lo;
  const weaponLo = opts.weaponLo;
  const hi = opts.hi;
  const shieldLo = opts.shieldLo;
  const floor = opts.floor;

  const f = {
    lo,
    hi,
    weaponLo,
    shieldLo,
    side: opts.side,
    x: opts.x,
    intent: { move: 0, jump: 0, crouch: 0, kick: 0, grip: 0, throwNow: 0, aimOn: 0, aim: { x: 0, y: 0 }, sOn: 0, sAim: { x: 0, y: 0 } },
    shieldOn: opts.shield === "buckler",
    dual: opts.shield === "dual",
    // the disc covers the C-arc's face - a strike anywhere on the
    // visible buckler reads as a block, not a hole in the art
    shield: { x: 0, y: 0, r: 0.3 * u, active: false },
    J: {},
    parts: [],
    part: {},
    grounded: true,
    staggerT: 0,
    kickT: 0,
    landT: 0,
    stam: 1,
    faintT: 0,
    // set by damage.step while a strike slot is hot; consumed (and
    // cleared) by f.step so it can't go stale outside the fight state
    hotNow: false,
    vx: 0,
    // each foot is either planted at a world spot or mid-step toward a
    // new one - planted feet anchor the body so walking pushes instead
    // of skating
    feet: {
      F: { px: opts.x + 0.16 * u, sx: 0, tx: 0, t: 1 },
      B: { px: opts.x - 0.12 * u, sx: 0, tx: 0, t: 1 },
    },
    dying: [],
    floorY: floor,
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
    const cy = ry - P.belly * u;            // waist
    const ty = cy - P.spine * u;            // ribcage
    put("root", x, ry);
    put("belly", x + s * 0.01 * u, cy);
    put("chest", x + s * 0.02 * u, ty);
    put("neck", x + s * 0.025 * u, ty - P.neckP * u);
    put("head", x + s * 0.03 * u, ty - (P.neckP + P.neck2) * u);
    put("sho", x + s * P.collar * u, ty + 0.02 * u);
    put("shoS", x - s * 0.06 * u, ty + 0.03 * u);
    put("elb", x + s * (P.collar + 0.1) * u, ty + P.upper * 0.8 * u);
    put("hand", x + s * (P.collar + 0.16) * u, ty + (P.upper * 0.8 + 0.1) * u);
    put("elbS", x - s * 0.02 * u, ty + P.upper * 0.55 * u);
    put("handS", x + s * 0.04 * u, ty + P.spine * 0.55 * u);
    // hand COM proxies (BB: each hand carries a ~0.45 mass zero-g body;
    // the weapon mounts to it and the wrist link drags the arm). The
    // cursor drives the proxy - load = how far the arm lags behind it.
    put("handP", J.hand.x, J.hand.y);
    put("handSP", J.handS.x, J.handS.y);
    J.handP.gs = 0;
    J.handSP.gs = 0;
    J.handP.im = J.handSP.im = 1.6; // retuned per-frame with weapon wt
    put("kneeF", x + s * 0.1 * u, ry + P.thigh * u);
    put("footF", x + s * 0.16 * u, floor);
    put("kneeB", x - s * 0.05 * u, ry + P.thigh * u);
    put("footB", x - s * 0.12 * u, floor);
    // the torso floats (BB: belly -2g, chest/neck/head -5g); the
    // legs are the ballast and each foot carries a heavy COM weight.
    // gsBase is the rest scale - pose() fades it with posture so a
    // fainted body loses its lift and can actually fall over.
    for (const jn of BUOY_JOINTS) J[jn].gsBase = TUNE.buoy[jn];
    J.footF.im = J.footB.im = TUNE.footIm;
    J.kneeF.im = J.kneeB.im = TUNE.kneeIm;
    J.root.im = TUNE.rootIm;
    J.elb.im = J.hand.im = J.elbS.im = J.handS.im = TUNE.armIm;
    // BB rigidbodies carry linear/angular damping - without it every
    // pose pull overshoots into a limit cycle and the torso churns
    // forever. Heavy on the buoyant column, light on whipping arms.
    J.belly.vd = J.chest.vd = 0.85;
    J.neck.vd = J.head.vd = 0.88;
    J.sho.vd = J.shoS.vd = 0.88;
    J.root.vd = 0.9;
    J.elb.vd = J.hand.vd = J.elbS.vd = J.handS.vd = 0.94;
    J.handP.vd = J.handSP.vd = 0.92;
    J.kneeF.vd = J.kneeB.vd = 0.94;
  };

  const BUOY_JOINTS = ["belly", "chest", "neck", "head", "sho", "shoS"];
  spawnJoints(opts.x);
  // scratch axis points for the waist hinge - pinned under the pelvis in
  // pose() so the spine's "up" is world-vertical, not feet-relative.
  // Not in J: the joint-keyed loops (jump, floor pin, pull clear) must
  // not treat them as body parts
  f.wRefA = V.point(opts.x, floor);
  f.wRefB = V.point(opts.x, floor);
  f.wRefA.gs = f.wRefB.gs = 0;

  // joint limits: each hinge joint records which side of the parent
  // limb it was born bent toward. The clamp below refuses bends to the
  // other side (hyperextension) or past the flexion cap.
  const bendSign = (an, bn, cn) => {
    const a = J[an], b = J[bn], c = J[cn];
    const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
    return Math.sign(ux * vy - uy * vx) || 1;
  };
  f.lim = {
    elb: ["sho", "elb", "hand", bendSign("sho", "elb", "hand")],
    elbS: ["shoS", "elbS", "handS", bendSign("shoS", "elbS", "handS")],
    kneeF: ["root", "kneeF", "footF", bendSign("root", "kneeF", "footF")],
    kneeB: ["root", "kneeB", "footB", bendSign("root", "kneeB", "footB")],
  };
  // h = interior hinge angle on the legal side: h -> +pi is straight,
  // h -> 0 is folded double, h < 0 is the wrong side of the joint -
  // near -pi is hyperextension (straight bent the wrong way), near 0-
  // is a wrong-side fold. px shifts with x so corrections add no speed.
  const limJoint = (e) => {
    if (!e) return; // entry nulled when its chain severed
    const [an, bn, cn, sign] = e;
    const a = J[an], b = J[bn], c = J[cn];
    if (!a || !b || !c || a.gone || b.gone || c.gone) return;
    const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
    const ul = Math.hypot(ux, uy) || 1e-4, vl = Math.hypot(vx, vy) || 1e-4;
    const h = Math.atan2((ux * vy - uy * vx) * sign / (ul * vl), (ux * vx + uy * vy) / (ul * vl));
    const FLEX_MIN = TUNE.flexMin;
    if (h >= FLEX_MIN) return;
    const tgt = Math.abs(h) > Math.PI / 2 ? Math.PI - 0.12 : FLEX_MIN;
    // the short way round, and only a little per frame: a wrong-side
    // elbow snapped 2 rad in one go flung the hand ~100px, the arm pull
    // dragged it straight back, and the pair flip-flopped every frame
    let d = tgt - h;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    const rot = Math.max(-LIM_STEP, Math.min(LIM_STEP, d)) * sign;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const tx2 = b.x + vx * cs - vy * sn, ty2 = b.y + vx * sn + vy * cs;
    const ox = tx2 - c.x, oy = ty2 - c.y;
    c.px += ox; c.py += oy;
    c.x = tx2; c.y = ty2;
    // the hand proxy rides the wrist - leaving it behind stretched the
    // wrist link 60px and the solver yanked the hand back next step
    const pr = cn === "hand" ? J.handP : cn === "handS" ? J.handSP : null;
    if (pr && !pr.free) { pr.x += ox; pr.y += oy; pr.px += ox; pr.py += oy; }
  };
  const LIM_STEP = 0.3; // rad per frame
  f.limJoint = limJoint;

  f.cons = [
    V.link(J.root, J.belly, P.belly * u),
    V.link(J.belly, J.chest, P.spine * u),
    V.link(J.chest, J.neck, P.neckP * u),
    V.link(J.neck, J.head, P.neck2 * u),
    V.link(J.chest, J.sho, P.collar * u),
    V.link(J.chest, J.shoS, P.collar * u),
    V.link(J.sho, J.belly, (P.spine + P.collar) * 0.9 * u, 0.7),
    V.link(J.shoS, J.belly, (P.spine + P.collar) * 0.95 * u, 0.7),
    V.link(J.sho, J.elb, P.upper * u),
    V.link(J.elb, J.hand, P.fore * u),
    V.link(J.shoS, J.elbS, P.upper * 0.85 * u, 0.9),
    V.link(J.elbS, J.handS, P.fore * u),
    // the wrists: proxy sits just past the knuckles, dragging the arm
    V.link(J.handP, J.hand, 0.012 * u, 0.9),
    V.link(J.handSP, J.handS, 0.012 * u, 0.9),
    V.link(J.root, J.kneeF, P.thigh * u),
    V.link(J.kneeF, J.footF, P.shin * u),
    V.link(J.root, J.kneeB, P.thigh * u),
    V.link(J.kneeB, J.footB, P.shin * u),
    V.link(J.neck, J.sho, (P.neckP + P.collar) * u, 0.5),
    // solver-internal hinges (BB: spine +-5deg stacked down the torso,
    // neck +-2, head can nod). The waist axis is the pelvis frame
    // (feet-mid -> root); each higher hinge continues the axis of the
    // one below, so a waist hunch carries the whole column like a
    // real spine instead of shearing at one joint.
    // the waist's "up" reference: scratch points pinned under the pelvis
    // give a world-vertical axis. Anchoring to the feet-mid let trailing
    // feet rotate the whole torso ~50deg during a walk - the spine was
    // straight, the REFERENCE was tilted
    f.waistCon = V.hinge(J.root, f.wRefA, f.wRefB, J.belly, 0.16, 0.85),
    V.hinge(J.belly, J.root, J.root, J.chest, 0.13, 0.8),
    V.hinge(J.chest, J.belly, J.belly, J.neck, 0.1, 0.75),
    V.hinge(J.neck, J.chest, J.chest, J.head, 0.6, 0.55),
  ];
  // originals for reset: severing repoints link ends to chunk clones
  // and part endpoints to stumps - both must come back on a rearm
  for (const c of f.cons) {
    c.a0 = c.a;
    c.b0 = c.b;
    if (c.type === 1) { c.piv0 = c.piv; c.r10 = c.r1; c.r20 = c.r2; c.jt0 = c.jt; }
  }
  const limOrig = { ...f.lim };

  // ---- particle skin: assign [lo, weaponLo) across PART_DEFS ----
  // partOf indexes every particle to its part so hits can skip flesh
  // that already lies severed on the floor. Counts scale to the slice
  // so the body always fills it exactly.
  f.partOf = new Array(hi - lo).fill(null);
  const sumN = PART_DEFS.reduce((t, d) => t + d.n, 0);
  let cur = lo, acc = 0;
  for (const def of PART_DEFS) {
    acc += def.n;
    const end = lo + Math.round((acc * (weaponLo - lo)) / sumN);
    const part = { ...def, n: end - cur, lo: cur, hi: end, severed: false, ja0: def.ja, jb0: def.jb };
    f.parts.push(part);
    f.part[def.name] = part;
    for (let p = part.lo; p < part.hi; p++) f.partOf[p - lo] = part;
    cur = end;
  }

  const skin = createSkin(field, f, P);
  f.setOutfit = skin.setOutfit;
  const size0 = skin.size0;
  // per-joint integrity: small limb joints give way after a couple of
  // real cuts; the pelvis and chest take sustained damage before the
  // whole structure fails. Blunt hits chip this slower than edged ones.
  const INTEG0 = { head: 16, neck: 18, chest: 20, belly: 22, sho: 5, shoS: 5, elb: 4, elbS: 4, kneeF: 4, kneeB: 4, root: 24 };
  const integ0 = { ...INTEG0 };
  f.integrity = { ...integ0 };

  // flag the owned range once at boot
  for (let p = lo; p < hi; p++) field.noFlock[p] = 1;

  const scratch = {};
  for (const name of ["root", "belly", "chest", "neck", "head", "sho", "shoS", "elb", "hand", "handP", "elbS", "handS", "handSP", "kneeF", "footF", "kneeB", "footB"])
    scratch[name] = { x: 0, y: 0 };

  const pull = (name, tx, ty, k) => {
    const j = J[name];
    if (!j || j.free) return; // a freed joint answers to physics only
    if (!j.pull) { scratch[name].lx = undefined; scratch[name].ly = undefined; } // fresh pull: no phantom target velocity
    j.pull = scratch[name];
    j.pull.x = tx;
    j.pull.y = ty;
    j.k = k;
  };

  const legLen = () => (P.thigh + P.shin) * u;
  const legKFactor = () => {
    if (f.part.shinF.severed || f.part.thighF.severed ||
        f.part.shinB.severed || f.part.thighB.severed)
      return (f.part.shinF.severed || f.part.thighF.severed) &&
             (f.part.shinB.severed || f.part.thighB.severed) ? 0.14 : 0.62;
    // a chewed-up knee limps before it gives out
    const kf = f.integrity.kneeF / INTEG0.kneeF, kb = f.integrity.kneeB / INTEG0.kneeB;
    return 0.75 + 0.25 * Math.min(kf, kb);
  };
  // wounded arms swing weak: integrity below half reads as a crippled
  // limb well before the joint actually lets go
  const armK = (jn) => 0.35 + 0.65 * Math.min(1, f.integrity[jn] / (INTEG0[jn] * 0.5));

  // the arm drives a point that chases the cursor at a speed the arm can
  // actually produce - weight and an empty tank slow it. Pulling the
  // proxy straight at a cursor that jumps 200px (a flick, a synthetic
  // input) moved the hand 200px in one solver step: 12000px/s.
  f.handT = { x: 0, y: 0 };
  f.handTS = { x: 0, y: 0 };
  const chase = (T, from, tx, ty, drive, dt, cold) => {
    if (cold) { T.x = from.x; T.y = from.y; }
    const dx = tx - T.x, dy = ty - T.y, d = Math.hypot(dx, dy);
    const step = TUNE.handV * drive * dt;
    if (d <= step) { T.x = tx; T.y = ty; }
    else { T.x += (dx / d) * step; T.y += (dy / d) * step; }
  };

  // ---- pose: intent -> joint pull targets ----
  function pose(dt, env) {
    const floor = env.floor;
    const s = f.side;
    // faint: the body collapses to crouch height with dead inputs
    const faint = f.faintT > 0;
    const crouch = f.intent.crouch || faint;
    const mv = faint ? 0 : f.intent.move;
    // legs gone: the body can't stand at full height any more
    const legK = legKFactor();
    // landing weight: brief dip as the stance catches the fall
    const dip = f.landT > 0 ? (f.landT / 0.25) * 0.16 : 0;
    const rootV = V.vel(J.root);
    // hip speed for the gait from real frame-to-frame travel: the verlet
    // velocity of a pulled joint is not its motion - the pull drags it
    // forward momentum-free while the leg links bill it backward, so a
    // walking root read ~-3000px/s and the gait stepped the wrong way
    const rxNow = J.root.x;
    const rvRaw = f.rxLast === undefined || dt <= 0 ? 0 : (rxNow - f.rxLast) / dt;
    f.rxLast = rxNow;
    f.rvSm = (f.rvSm || 0) + (rvRaw - (f.rvSm || 0)) * Math.min(1, dt * 10);
    // soft knees: straight legs can't put a foot anywhere but under the
    // hip, so a standing body could only ever drag its feet
    const stride = Math.min(1, Math.abs(f.rvSm) / (TUNE.walkV * u));
    const stance = (crouch ? 0.42 : TUNE.standH - TUNE.walkDip * stride - dip) * legK;
    // lean is smoothed hard: raw rootV.x oscillates ±900px/s at rest and
    // feeding it into the pull targets drags the whole skeleton with the
    // jitter - a self-amplifying loop. The visual lean only needs walk
    // frequencies, so a ~0.2s filter keeps the tilt and kills the noise.
    const leanRaw = Math.max(-0.08, Math.min(0.08, (rootV.x / u) * 0.06)) * s;
    f.leanSm = (f.leanSm ?? 0) + (leanRaw - (f.leanSm ?? 0)) * Math.min(1, dt * 5);
    const lean = f.leanSm;

    // the move target carries momentum - acceleration and braking are
    // what separate a heavy step from a rigid slide
    const vmax = TUNE.walkV * u * (crouch ? 0.55 : 1);
    f.vx += (mv * vmax - f.vx) * Math.min(1, dt * (mv !== 0 ? TUNE.accel : TUNE.brake));
    f.x = Math.max(env.wallL + 0.3 * u, Math.min(env.wallR - 0.3 * u, f.x + f.vx * dt));
    // the stance target stays within leg reach of the pelvis: an
    // unbounded lead drags the torso over its anchored feet into a
    // cartwheel. The servo owns speed; f.x only places the stance.
    if (f.grounded && !faint) {
      const lead = 0.35 * u;
      f.x = Math.max(J.root.x - lead, Math.min(J.root.x + lead, f.x));
    }

    const air = !f.grounded;
    if (!air && !faint) {
      // locomotion authority lives in the hips: a velocity servo tracks
      // f.vx. It must converge gently - an instant velocity match slams
      // the pelvis past the anchored feet and the body cartwheels over
      // them (the step system's job is to keep the legs under, not to
      // catch a thrown pelvis). ~0.35s convergence is walk feel.
      const drive = Math.max(-140, Math.min(140, (f.vx - rootV.x) * 0.18));
      V.impulse(J.root, drive, 0);
      // the chest gets only a whisper of the same servo - a full share
      // drives the buoyant top ahead of the pelvis and folds the spine
      V.impulse(J.chest, (f.vx - V.vel(J.chest).x) * 0.03, 0);
    }
    if (air) {
      // coherence damp: bleed every joint's velocity toward the root's
      // so the body flies as one piece. Internal force only - it can't
      // lift, drag, or steer the arc the way position pulls do (a pull
      // anchored to the world dangles the body at takeoff height; one
      // anchored to the root self-lifts through the link solver)
      const rvx = rootV.x, rvy = rootV.y;
      const k2 = Math.min(1, dt * 6);
      // air steer is capped: an uncapped push plus walk momentum plus
      // jumpH carry built to >1000px/s over a held jump - one leap
      // crossed half the arena. Reversal is always allowed; pushing
      // further in the held direction stops past the cap
      const ax =
        mv !== 0 && mv * rootV.x < TUNE.airVMax ? mv * 650 * dt : 0;
      for (const name of Object.keys(J)) {
        const j = J[name];
        if (j.free) continue;
        const v = V.vel(j);
        V.impulse(j, (rvx - v.x) * k2 + ax, (rvy - v.y) * k2);
      }
      // air silhouette: steer the legs with capped velocity nudges toward
      // a trailing pose. Position pulls are unusable here - every one
      // teleports a joint, the links convert it into body velocity, and
      // the body pumps itself whichever way the targets sit (a 60px
      // hover at root-anchored targets, a 1150px/s horizontal sprint at
      // asymmetric ones). An impulse adds at most ~140px/s per frame -
      // gravity and drag always win, it can only bend the silhouette
      const fLegA = !(f.part.shinF.severed || f.part.thighF.severed);
      const bLegA = !(f.part.shinB.severed || f.part.thighB.severed);
      const nudge = (jn, ox, oy) => {
        const j = J[jn];
        const dx = J.root.x + ox - j.x, dy = J.root.y + oy - j.y;
        const d = Math.hypot(dx, dy);
        if (d > 10) V.impulse(j, (dx / d) * Math.min(d, 60) * 2.4 * dt, (dy / d) * Math.min(d, 60) * 2.4 * dt);
      };
      if (fLegA) {
        nudge("footF", s * 0.05 * u, legLen() * 0.9);
        nudge("kneeF", s * 0.1 * u, legLen() * 0.45);
      }
      if (bLegA) {
        nudge("footB", -s * 0.04 * u, legLen() * 0.93);
        nudge("kneeB", -s * 0.005 * u, legLen() * 0.45);
      }
    }
    const stag = f.staggerT > 0;
    const kMul = (stag ? TUNE.stagK : crouch ? 1.25 : 1) * (faint ? TUNE.faintK : 1);

    // airborne pose anchors to the body's own x, not f.x: the stance
    // springs shape the skeleton around itself instead of dragging it
    // back toward the takeoff spot mid-flight. lean stays out too -
    // it reads root velocity and turns drift into more drift.
    const rx = (air ? J.root.x : f.x) + (air ? 0 : lean) * u;
    // no root pull in the air: a downward spring toward standH sinks the
    // root under the ballistic feet and the legs flip over the body.
    // On the ground the pull doubles as BB's pelvisPoint: a far stance
    // target gets a stronger drag so the body actually hustles to it
    // instead of leaning on mass-5 feet forever
    const gapX = air ? 0 : f.x - J.root.x;
    const catchK = Math.min(0.2, (Math.abs(gapX) / (0.5 * u)) * 0.2);
    if (!air) pull("root", rx, floor - legLen() * stance, (TUNE.hipK + catchK) * kMul);

    // the torso stands by buoyancy, not a pose servo (BB evidence:
    // belly -2g, chest/neck/head -5g, no upright controller). A faint
    // zeroes the float so the body can fall; a stagger half-sinks it.
    // Airborne it keeps working - the chest wants to be on top, which
    // is what rights a knocked-down fighter mid-tumble.
    // in the air the buoyancy half-damps: torso still wants the top
    // (righting torque is what lands a fighter on its feet) but the
    // body's net weight returns toward 1g instead of hanging
    const buoyMul = faint ? 0 : stag ? 0.45 : air ? 0.35 : 1;
    for (const jn of BUOY_JOINTS) J[jn].gs = 1 + (J[jn].gsBase - 1) * buoyMul;
    // lean is a sideways force on the floating torso (BB headForce*),
    // not a position target - the body tilts as a balance response
    const hunch = crouch ? 0.16 : 0.05;
    const lx = air ? 0 : lean;
    // pin the waist axis under the pelvis each frame - world-vertical.
    // A faint or hard stagger loosens the hinge so a real knockdown can
    // still fold the column instead of the torso floating eerily upright
    f.wRefA.x = f.wRefA.px = f.wRefB.x = f.wRefB.px = J.root.x;
    f.wRefA.y = f.wRefA.py = J.root.y + 0.3 * u;
    f.wRefB.y = f.wRefB.py = J.root.y + 0.6 * u;
    f.waistCon.stiff = faint || stag ? 0.2 : 0.85;
    f.waistCon.center = s * (hunch + lx) * 0.55;
    const leanF = s * (hunch + lx * 0.5) * TUNE.leanForce * dt * buoyMul;
    V.impulse(J.chest, leanF, 0);
    V.impulse(J.head, leanF * 0.6, 0);
    const baseY = J.root.y;
    const aK = air ? 0 : 1;

    // legs
    const speed = Math.abs(f.rvSm);
    const sw = Math.min(1, speed / (0.9 * u)) * (mv !== 0 ? 1 : 0.4);
    // crouch needs a wide base: feet at ±0.5u let the legs Z-fold and
    // the root actually sinks - a narrow crouch stance keeps the legs
    // near-straight and the body physically cannot drop
    const stF = s * (crouch ? 0.52 : 0.16) * u;
    const stB = -s * (crouch ? 0.44 : 0.11) * u;

    // severed legs get no pulls - dead joints drop to the floor and stay
    const fLeg = !(f.part.shinF.severed || f.part.thighF.severed);
    const bLeg = !(f.part.shinB.severed || f.part.thighB.severed);
    if (f.kickT > 0 && fLeg && !faint) {
      // kick: front leg spears forward. 0.62u barely bent the knee -
      // a real thrust kick extends to near full leg (1.17u): foot to
      // shin height, knee onto the root->foot line so the leg straightens
      pull("footF", rx + s * 0.95 * u, floor - 0.5 * u, 0.55);
      pull("kneeF", rx + s * 0.48 * u, floor - 0.78 * u, 0.35);
      if (bLeg) {
        pull("footB", rx + stB, floor, 0.16 * kMul);
        pull("kneeB", (J.root.x + rx + stB) / 2 - s * 0.04 * u, (J.root.y + floor) / 2, 0.08 * kMul);
      }
    } else if (!air) {
      // a gait, not a tow: while the hips travel, the TRAILING foot lifts
      // and swings to where the hips will be at touchdown plus half a
      // stride (capture-point placement), so the feet keep landing under
      // the pelvis. The old drift trigger only fired once a foot was far
      // behind, and the spot it aimed for was past leg reach - both feet
      // ended up towed behind the hips in one stiff diagonal.
      const bend = (crouch ? 0.55 : 0.03 + 0.05 * sw) * u;
      const kKnee = 0.08 * kMul * (crouch ? 1.6 : 1);
      // a knocked body steps too - catching the stumble is a step
      const dir = Math.abs(f.rvSm) > 0.45 * u ? Math.sign(f.rvSm) : mv !== 0 ? Math.sign(f.vx) || mv : 0;
      const stepT = crouch ? TUNE.stepT * 1.4 : TUNE.stepT;
      const reachX = legLen() * (crouch ? 0.7 : 0.42);
      const stSpots = { F: J.root.x + stF, B: J.root.x + stB };
      f.settleT = dir ? 0 : (f.settleT || 0) + dt;
      for (const [fk, jn, kn] of [["F", "footF", "kneeF"], ["B", "footB", "kneeB"]]) {
        const legOk = fk === "F" ? fLeg : bLeg;
        if (!legOk) continue;
        const ft = f.feet[fk];
        const other = f.feet[fk === "F" ? "B" : "F"];
        const otherOk = fk === "F" ? bLeg : fLeg;
        if (ft.t >= 1 && (other.t >= 1 || !otherOk)) {
          let go = false;
          if (dir) {
            // the rear foot in the travel direction goes once the hips
            // have passed it; a lone leg hops whenever it trails
            const behind = (J.root.x - ft.px) * dir;
            const rear = !otherOk || (other.px - ft.px) * dir >= 0;
            go = rear && behind > TUNE.stepTrig * u;
          } else if (f.settleT > 0.2) {
            // settled: feet walk back to the fighting stance one at a
            // time. Only a real displacement replants - sway -> replant
            // -> anchor drag is a limit cycle that vibrates a still body
            go = Math.abs(stSpots[fk] - ft.px) > 0.16 * u;
          }
          if (go) {
            ft.sx = J[jn].x;
            ft.t = 0;
          }
        }
        if (ft.t < 1) {
          ft.t = Math.min(1, ft.t + dt / stepT);
          // re-aimed every frame so the plant tracks the body's real speed
          const rem = (1 - ft.t) * stepT;
          const v = f.rvSm;
          const want = dir ? J.root.x + v * rem + dir * Math.abs(v) * stepT * 0.5 : stSpots[fk];
          ft.tx = Math.max(J.root.x - reachX, Math.min(J.root.x + reachX + Math.abs(v) * rem, want));
          const e = ft.t * ft.t * (3 - 2 * ft.t);
          const k2 = Math.sin(ft.t * Math.PI); // lift arc over the step
          pull(jn, ft.sx + (ft.tx - ft.sx) * e, floor - k2 * TUNE.stepLift * u, 0.5 * kMul);
          if (ft.t >= 1) {
            ft.px = J[jn].x; // the foot plants where it landed, not where it aimed
            // plant push is only a weight hint - the root servo owns
            // propulsion; a full pushK shove was the walk surge
            V.impulse(J.root, f.vx * TUNE.pushK, 0);
          }
        } else {
          // planted: anchor to the floor spot in 2D - a planted foot is an
          // anchor, not a sled
          const brace = f.braceT > 0;
          pull(jn, ft.px, floor, (brace ? 0.6 : TUNE.anchorK) * kMul);
        }
        // a swinging leg folds at the knee so the foot clears the floor
        const swing = ft.t < 1 ? Math.sin(ft.t * Math.PI) * 0.1 * u : 0;
        pull(kn, (J.root.x + J[jn].x) / 2 + s * (bend + swing), (J.root.y + J[jn].y) / 2 + 0.02 * u, kKnee * (f.braceT > 0 ? 2.2 : 1) * (swing ? 1.6 : 1));
      }
    }

    // armed arm: aim target inside the reach envelope around the shoulder
    const reach = (P.upper + P.fore) * u * 0.98;
    // a severed arm takes no pulls - dragging a freed joint to the aim
    // point flings the chunk across the arena like a zombie hand
    const armDead = f.part.fore.severed || f.part.upper.severed;
    const aimOn = f.intent.aimOn && !faint && !armDead;
    const aimCold = !f.aimWas;
    f.aimWas = aimOn;
    if (aimOn) {
      const sx = J.sho.x, sy = J.sho.y;
      const wArm = armK("elb");
      // the arm is a limited motor: weapon weight drags the drive down
      // and a near-empty tank leaves real strength on the table
      const wt = f.W && f.W.spec ? f.W.spec.wt : 0.5;
      const drive = Math.max(TUNE.driveMin, (TUNE.driveBase - wt * TUNE.driveWt) * (TUNE.stamPowLo + TUNE.stamPowHi * f.stam));
      chase(f.handT, J.handP, f.intent.aim.x, f.intent.aim.y, drive, dt, aimCold);
      let dx = f.handT.x - sx, dy = f.handT.y - sy;
      const d = Math.hypot(dx, dy) || 1e-4;
      if (d > reach) { dx *= reach / d; dy *= reach / d; }
      if (d < 0.12 * u) { dx *= (0.12 * u) / d; dy *= (0.12 * u) / d; }
      const hx = sx + dx, hy = sy + dy;
      const gripK = (f.intent.grip ? 0.26 : 0.14) * wArm * drive;
      // the proxy takes the drive; the wrist link drags the arm behind
      // it, so a heavy head lags and loads the tank like real weight
      J.handP.im = 0.25 + wt * 0.15;
      pull("handP", hx, hy, gripK * kMul);
      pull("hand", hx, hy, gripK * kMul * 0.35);
      // elbow bends down-and-back like a real arm - but the bias
      // collapses at full reach so a committed strike can straighten
      let nx = -dy / d, ny = dx / d;
      if (ny - nx * s < 0) { nx = -nx; ny = -ny; }
      const eb = 0.32 * (1 - Math.min(1, d / reach));
      pull("elb", sx + dx * 0.5 + nx * d * eb, sy + dy * 0.5 + ny * d * eb, 0.1 * kMul * wArm);
    } else if (!armDead) {
      // idle: weapon hand cocked back at the shoulder, elbow tucked -
      // a fighter's ready pose, not arms at face height
      pull("hand", rx + s * 0.24 * u, J.sho.y + 0.1 * u, 0.08 * kMul * aK);
      pull("elb", rx + s * 0.08 * u, J.sho.y + 0.36 * u, 0.08 * kMul * aK);
    }

    // off arm: RMB drives it toward sAim in every mode - buckler, second
    // blade, or bare fist. Neutral: a guard stance when armed, a plain
    // hang when the hand is empty. The rear shoulder is the pivot.
    const sx = J.shoS.x, sy = J.shoS.y;
    const sReach = (P.upper * 0.85 + P.fore) * u * 0.95;
    const wArmS = armK("shoS");
    const wt2 = f.dual && f.W2 && f.W2.spec ? f.W2.spec.wt : f.shieldOn ? 0.7 : 0.5;
    const driveS = Math.max(TUNE.driveMin, (TUNE.driveBase - wt2 * TUNE.driveWt) * (TUNE.stamPowLo + TUNE.stamPowHi * f.stam));
    const armDeadS = f.part.foreS.severed || f.part.upS.severed;
    const sOn = f.intent.sOn && !faint && !armDeadS;
    const sCold = !f.sAimWas;
    f.sAimWas = sOn;
    if (sOn) {
      chase(f.handTS, J.handSP, f.intent.sAim.x, f.intent.sAim.y, driveS, dt, sCold);
      let dx = f.handTS.x - sx, dy = f.handTS.y - sy;
      const d = Math.hypot(dx, dy) || 1e-4;
      if (d > sReach) { dx *= sReach / d; dy *= sReach / d; }
      if (d < 0.1 * u) { dx *= (0.1 * u) / d; dy *= (0.1 * u) / d; }
      // the proxy must outweigh the hand: if im > handS.im the wrist
      // link yanks the PROXY back instead of dragging the arm forward -
      // the cursor chases a feather and the hand never leaves guard
      J.handSP.im = 0.25 + wt2 * 0.15;
      pull("handSP", sx + dx, sy + dy, 0.2 * kMul * wArmS * driveS);
      pull("handS", sx + dx, sy + dy, 0.2 * kMul * wArmS * driveS * 0.35);
      const ebS = 1 - Math.min(1, d / sReach);
      pull("elbS", sx + dx * 0.45 - dy * 0.18 * ebS, sy + dy * 0.45 + dx * 0.18 * ebS, 0.1 * kMul * wArmS * driveS);
    } else if (f.shieldOn || f.dual) {
      // guarded idle: buckler or second weapon held over the chest line
      pull("handS", rx + s * 0.22 * u, sy + 0.14 * u, 0.1 * kMul * aK);
      pull("elbS", rx - s * 0.02 * u, sy + 0.3 * u, 0.1 * kMul * aK);
    } else {
      // empty off hand guards the chest line
      pull("handS", rx + s * 0.22 * u, sy + 0.12 * u, 0.07 * kMul * aK);
      pull("elbS", rx + s * 0.02 * u, sy + 0.34 * u, 0.07 * kMul * aK);
    }

  }

  // ---- skin write ----
  function writeHomes(dt) {
    if (f.shieldOn) skin.writeShield();
    skin.write(dt);
  }

  // ---- kill / sever ----
  const killP = (p, dirx, diry, imp) => {
    const i = p * 3;
    f.alive[p - lo] = 0;
    f.mass--;
    field.homed[p] = 0;
    field.vel[i] += dirx * imp + (field.h1(p) - 0.5) * imp * 1.6;
    field.vel[i + 1] += diry * imp + (field.h2(p) - 0.5) * imp * 1.6 - imp * 0.4;
    skin.bleed(p);
    f.dying.push({ p, at: field.T + 1.2 + field.h1(p) * 1.4 });
  };

  function severJoint(name, dirx = 0, diry = 0) {
    const lost = SEVER_TREE[name];
    if (!lost) return [];
    const cut = [];
    const lostSet = new Set(lost);
    // joints whose own part severs leave the body - unless a kept bone
    // still draws to them. Then they stay as the stump tip and the
    // chunk gets a clone, so a kept limb can't stretch across the
    // arena after the flying part
    const freedNames = new Set(
      Object.keys(J).filter((jn) => lostSet.has(JOINT_PART[jn]))
    );
    const keptRefs = new Set();
    for (const pt of f.parts)
      if (!lostSet.has(pt.name) && !pt.severed && pt.type === "bone") {
        keptRefs.add(pt.ja);
        keptRefs.add(pt.jb);
      }
    const cloneOf = {};
    for (const jn of freedNames) {
      if (keptRefs.has(jn)) {
        // stump stays: clone the point for the chunk
        const cn = jn + "_x";
        const c = (J[cn] = V.point(J[jn].x, J[jn].y));
        c.pull = null;
        c.free = 1;
        JOINT_PART[cn] = JOINT_PART[jn];
        cloneOf[jn] = cn;
        V.impulse(c, dirx * TUNE.severKick, diry * TUNE.severKick - 130);
        V.impulse(J[jn], dirx * TUNE.severKick * 0.2, diry * TUNE.severKick * 0.2 - 50);
      } else {
        const j = J[jn];
        j.free = 1;
        j.pull = null;
        V.impulse(j, dirx * TUNE.severKick, diry * TUNE.severKick - 130);
      }
    }
    // links: kept+moved stays (it braces the stump); free+free and
    // moved+free ride the chunk (moved ends repoint to the clone);
    // kept+free is the cut itself. A hinge's four refs must land on
    // one side together or it snaps - half a spine hinge on the body
    // and half on the chunk is just a tether.
    const jName = (o) => Object.keys(J).find((k) => J[k] === o);
    const sideOf = (jn) =>
      cloneOf[jn] ? "moved" : freedNames.has(jn) ? "free" : "kept";
    const fixEnd = (c, key) => {
      const n = jName(c[key]);
      if (cloneOf[n]) c[key] = J[cloneOf[n]];
      return sideOf(n);
    };
    for (const c of f.cons) {
      if (c.broken) continue;
      if (c.type === 1) {
        const sides = ["piv", "r1", "r2", "jt"].map((k) => sideOf(jName(c[k])));
        const body = sides.every((x) => x === "kept");
        const chunk = sides.every((x) => x !== "kept");
        if (body) continue;
        if (chunk) {
          if (sides.includes("moved")) for (const k of ["piv", "r1", "r2", "jt"]) fixEnd(c, k);
          continue;
        }
        c.broken = true;
        continue;
      }
      const an = jName(c.a), bn = jName(c.b);
      const as = sideOf(an), bs = sideOf(bn);
      if (as === "free" || bs === "free") {
        if (as === "kept" || bs === "kept") {
          c.broken = true;
          continue;
        }
        if (as === "moved") c.a = J[cloneOf[an]];
        if (bs === "moved") c.b = J[cloneOf[bn]];
      }
    }
    const die = (pt) => {
      if (!pt || pt.severed) return;
      pt.severed = true;
      cut.push(pt.name);
      for (let p = pt.lo; p < pt.hi; p++) {
        if (!f.alive[p - lo]) continue;
        // a third sprays off as the wound; the rest stays skinned to the
        // freed joints and tumbles to the floor as a physical limb
        if (field.h1(p) < 0.32) killP(p, dirx, diry + 0.3, 1.6);
        else {
          f.mass--; // lost flesh counts even while the chunk lies there
          f.dying.push({ p, at: field.T + 4 + field.h1(p) * 5 });
        }
      }
    };
    for (const pn of lost) die(f.part[pn]);
    // a kept knot left entirely on the chunk goes with it - otherwise
    // its cluster lies on the floor lit forever
    for (const pt of f.parts) {
      if (pt.severed) continue;
      const refs = pt.type === "bone" ? [pt.ja, pt.jb] : [pt.ja];
      if (refs.every((r) => freedNames.has(r) && !cloneOf[r])) die(pt);
    }
    // repoint: severed parts ride the chunk (moved refs go to clones; a
    // kept end collapses onto the chunk end); kept parts hold the body
    // (moved joints ARE the stump - a freed-outright end collapses to
    // the kept end instead of rubber-banding)
    const side = (jn) => (cloneOf[jn] ? "moved" : freedNames.has(jn) ? "free" : "kept");
    for (const pt of f.parts) {
      const refs = pt.type === "bone" ? ["ja", "jb"] : ["ja"];
      const chunkRef = refs.find((r) => side(pt[r]) !== "kept");
      const keptRef = refs.find((r) => side(pt[r]) === "kept");
      for (const r of refs) {
        const s = side(pt[r]);
        if (pt.severed) {
          if (s === "moved") pt[r] = cloneOf[pt[r]];
          else if (s === "kept" && chunkRef) pt[r] = pt[chunkRef];
        } else if (s === "free" && keptRef) pt[r] = pt[keptRef];
      }
    }
    // hinge clamps touching a freed joint would tether the chunk to the
    // body it just left
    for (const k of Object.keys(f.lim)) {
      const e = f.lim[k];
      if (e && [e[0], e[1], e[2]].some((jn) => freedNames.has(jn))) f.lim[k] = null;
    }
    return cut;
  }

  const JOINT_PART = {
    head: "head", neck: "neck", chest: "ribcage", belly: "belly", root: "belly",
    sho: "upper", elb: "fore", hand: "fore", handP: "fore",
    shoS: "upS", elbS: "foreS", handS: "foreS", handSP: "foreS",
    kneeF: "shinF", footF: "shinF", kneeB: "shinB", footB: "shinB",
  };

  // ---- combat surface ----
  // cut scales how much a strike chews through joint integrity: a mace
  // crushes flesh (knockback up, particles lost) but rarely severs, a
  // blade bites deep, fists mostly just bruise.
  f.applyHit = (x, y, power, dirx, diry, cut = 1, floor = TUNE.dmgFloor) => {
    // power in px/s. Returns what the hit did.
    const hitR = (0.14 + Math.min(0.1, power / 9000)) * u;
    const r2 = hitR * hitR;
    // damage is speed over threshold, not contact: a graze at the
    // moving gate barely bites, a real swing scales up
    const eff = Math.max(0, power - floor);
    let killed = 0;
    const killN = Math.min(TUNE.killMax, TUNE.killBase + (eff / TUNE.killRate) | 0);
    const cand = [];
    for (let p = lo; p < weaponLo; p++) {
      if (!f.alive[p - lo]) continue;
      // a fallen chunk is already lost mass - striking it can't
      // bleed the fighter twice
      const pt = f.partOf[p - lo];
      if (pt && pt.severed) continue;
      const dx = field.home[p * 3] - x, dy = field.home[p * 3 + 1] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 * 2.6) cand.push(p);
    }
    // head bites deepest, core next, limbs least - the bar is the only
    // life track, so a zone multiplier is how placement matters
    const ZONE_DMG = { head: 1.45, neck: 1.35, chest: 1.25, belly: 1.15, root: 1.15 };
    let zone = null, zd = r2;
    for (const jn of HIT_JOINTS) {
      const j = J[jn];
      const dx = j.x - x, dy = j.y - y, d2 = dx * dx + dy * dy;
      if (d2 < zd) { zd = d2; zone = jn; }
    }
    const take = Math.min(cand.length, Math.round(killN * (ZONE_DMG[zone] || 1)));
    for (let k = 0; k < take; k++) {
      killP(cand[(k * cand.length) / take | 0], dirx, diry, 1.5 + eff / 700);
      killed++;
    }

    const severed = [];
    for (const jn of HIT_JOINTS) {
      const j = J[jn];
      const dx = j.x - x, dy = j.y - y;
      if (dx * dx + dy * dy < r2 && f.integrity[jn] > 0) {
        f.integrity[jn] -= (TUNE.integHit + eff / TUNE.integVel) * cut;
        if (f.integrity[jn] <= 0 && SEVERABLE[jn]) severed.push(...severJoint(jn, dirx, diry));
      }
    }

    // knockback tracks damage dealt, always: a graze nudges, a slam
    // shoves - and only a real hit earns stagger. The contact solver
    // already hands the struck bone the blow's momentum, so this is the
    // BB knockbackPerDamage on top, not the whole shove
    const blunt = 1 + (1 - cut) * 0.6; // crushing hits shove harder
    V.impulse(J.root, dirx * eff * 0.12 * blunt, diry * eff * 0.12 * blunt);
    V.impulse(J.chest, dirx * eff * 0.16 * blunt, diry * eff * 0.16 * blunt);
    if (power > 520) f.staggerT = Math.max(f.staggerT, Math.min(1.1, 0.3 + (eff / 2600) * blunt));
    return { killed, severed };
  };

  f.shove = (dirx, diry) => {
    V.impulse(J.root, dirx * 720, diry * 720 - 140);
    V.impulse(J.chest, dirx * 900, diry * 900 - 160);
    V.impulse(J.head, dirx * 700, diry * 700 - 120);
    f.staggerT = Math.max(f.staggerT, 0.7);
  };

  f.blockStagger = (dirx, diry) => {
    V.impulse(J.root, dirx * 240, diry * 100);
    V.impulse(J.chest, dirx * 300, diry * 120);
    f.staggerT = Math.max(f.staggerT, 0.26);
  };

  // single writer for stamina spend - an empty tank drops the fighter
  f.drainStam = (n) => {
    f.stam = Math.max(0, f.stam - n);
    if (f.stam === 0) f.faintT = Math.max(f.faintT, TUNE.faintT);
  };

  // blade-on-blade knockback: the clashing arm gets whipped aside
  f.deflect = (dirx, diry, off) => {
    const h = off ? "handS" : "hand", e = off ? "elbS" : "elb";
    V.impulse(J[h], dirx * 560, diry * 560);
    V.impulse(J[e], dirx * 320, diry * 320);
  };

  // why the fighter is out of the round, or null while still in it.
  // Health is how much of you is left; a wrecked head or a body that can
  // no longer stand or hold anything also ends it before the mass does.
  f.out = () => {
    if (f.mass < f.mass0 * 0.4) return "bled";
    if (f.integrity.head < INTEG0.head * VITAL_KO || f.integrity.neck < INTEG0.neck * VITAL_KO) return "head";
    if (f.part.shinF.severed && f.part.shinB.severed) return "legs";
    if ((f.part.upper.severed || f.part.fore.severed) && (f.part.upS.severed || f.part.foreS.severed)) return "arms";
    return null;
  };
  f.dead = () => f.out() !== null;

  f.step = (dt, env) => {
    const floor = env.floor;
    f.staggerT = Math.max(0, f.staggerT - dt);
    f.kickT = Math.max(0, f.kickT - dt);
    f.landT = Math.max(0, f.landT - dt);
    f.braceT = Math.max(0, (f.braceT || 0) - dt);
    f.airT = Math.max(0, (f.airT || 0) - dt);
    // exertion pauses recovery - the tank refills at rest, fast while
    // floored, and the fighter stays down until it reaches 0.35
    const faint = f.faintT > 0;
    if (faint) {
      f.faintT -= dt;
      if (f.faintT <= 0 && f.stam < TUNE.faintEnd) f.faintT = 0.05;
    }
    const wasHot = f.hotNow;
    f.hotNow = false;
    f.stam = Math.min(1, f.stam + (faint ? TUNE.regenFaint : wasHot ? 0 : TUNE.regenRest) * dt);
    if (f.intent.jump && f.grounded && !faint) {
      // every joint launches together - any unimpulsed joint is an
      // anchored pull holding the skeleton down through the links. The
      // every joint's velocity is renormalized to exactly (hv, -jv):
      // the stance spring jitters each joint differently at rest, so a
      // flat additive impulse launches a skeleton already stretching
      // internally - the links ring through the arc and slosh the body
      // sideways. Identical velocities lift it as one rigid piece.
      const jv = TUNE.jumpV;
      const hv = f.intent.move * TUNE.jumpH;
      for (const name of Object.keys(J)) {
        const j = J[name];
        if (j.free) continue; // severed debris doesn't jump with you
        const cv = V.vel(j);
        V.impulse(j, hv - cv.x, -jv - cv.y);
      }
      f.grounded = false;
      // takeoff grace: feet still touch the floor for the first frames,
      // so without it the ground clauses re-fire and the stance springs
      // eat the impulse before the body ever leaves the ground
      f.airT = TUNE.airT;
      f.drainStam(TUNE.drainJump);
    }
    f.intent.jump = 0;
    if (!faint && f.intent.kick && f.kickT <= 0) {
      f.kickT = 0.3;
      f.drainStam(TUNE.drainKick);
    }
    f.intent.kick = 0;

    pose(dt, env);
    V.step(dt, env);
    // wrist stretch is the physical effort of dragging the arm through
    // a swing - the proxy runs ahead and the arm pays for the gap. A
    // heavy head opens it wider than a light one.
    for (const [pn, hn] of [["handP", "hand"], ["handSP", "handS"]]) {
      const pj = J[pn], hj = J[hn];
      if (!pj || pj.free || hj.free) continue;
      const stretch = Math.max(0, Math.hypot(pj.x - hj.x, pj.y - hj.y) - 0.012 * u) / u;
      if (stretch > 0.02) {
        f.drainStam(TUNE.drainLoad * stretch * dt);
        f.hotNow = true;
      }
    }
    // hinge limits after the link solve - a violent shove can re-bend a
    // knee past straight inside the iterations, so the last word is here.
    // Airborne they're skipped: each snap teleports a limb and the links
    // convert it to body slosh - measured as ±800px/s oscillation
    // mid-flight. A 1s ballistic arc can't hyperextend meaningfully and
    // the landing replant resets the legs anyway.
    if (f.grounded) {
      f.limJoint(f.lim.elb);
      f.limJoint(f.lim.elbS);
      f.limJoint(f.lim.kneeF);
      f.limJoint(f.lim.kneeB);
    }

    const wasAir = !f.grounded;
    // hard floor: feet are held by pulls, and pulls overshoot - nothing
    // else stopped a joint resting a few px under the line. Pin at the
    // surface and zero the downward remainder so it stays put
    for (const name of Object.keys(J)) {
      const j = J[name];
      if (j.y > floor) { j.y = floor; j.py = floor; }
    }
    // freed feet rest on the floor as debris - they must not count as
    // a planted foot or a severed leg locks the fighter grounded
    const fp = Math.max(
      J.footF.free ? 0 : J.footF.y,
      J.footB.free ? 0 : J.footB.y
    );
    // grounded = feet near the floor OR the root has come back down to
    // its stance height. The dangling air pose lifts feet ~0.8 shin
    // under the root, so feet alone can never re-trigger a landing; and
    // a weak stance pull sags ~0.2u below target in free hang, so the
    // root test needs enough slack to catch that hover too.
    const standH = floor - legLen() * legKFactor();
    f.grounded =
      f.airT <= 0 && (fp > floor - 10 || J.root.y > standH - 0.3 * u);
    if (wasAir && f.grounded) {
      f.landT = 0.25;
      f.braceT = 0.45;
      f.airLag = J.root.y;
      // touchdown re-plants both feet under the body - spots left from
      // takeoff sit behind the landing and the taut leg slings the
      // root back like a rubber band. The move target lands with the
      // body too, or the stance spring drags it back to takeoff.
      f.x = J.root.x;
      f.feet.F.px = f.feet.F.tx = J.root.x + f.side * 0.16 * u;
      f.feet.B.px = f.feet.B.tx = J.root.x - f.side * 0.11 * u;
      f.feet.F.t = f.feet.B.t = 1;
      // landing absorbs, it doesn't bounce - bleed most of the fall's
      // downward velocity so the stance spring can't pole-vault the
      // body back up off a compressed landing
      for (const name of Object.keys(J)) {
        const j = J[name];
        if (j.free) continue;
        const cv = V.vel(j);
        V.impulse(j, -cv.x * 0.4, -cv.y * 0.85);
      }
    }

    for (const name of Object.keys(J)) J[name].pull = null;
    const sh = f.shield;
    // the disc rides forward of the fist - a frontal strike meets
    // shield before it ever reaches the arm or chest line
    sh.x = J.handS.x + f.side * 0.2 * u;
    sh.y = J.handS.y;
    // a severed off-arm can't hold a buckler - the face drops with it
    sh.active = f.shieldOn && !f.dead() && !faint &&
      !(f.part.upS.severed || f.part.foreS.severed);
    for (let i = f.dying.length - 1; i >= 0; i--)
      if (field.T >= f.dying[i].at) {
        field.size[f.dying[i].p] = 0;
        field.homed[f.dying[i].p] = 0;
        f.alive[f.dying[i].p - lo] = 0;
        f.dying[i] = f.dying[f.dying.length - 1];
        f.dying.pop();
      }
  };

  f.face = (s) => (f.side = s);
  f.V = V; // probe handle, like window.__fray
  f.writeHomes = writeHomes;

  f.setShield = (v) => {
    f.shieldOn = v === "buckler";
    f.dual = v === "dual";
    // the off-hand slice is only live when it holds a visible thing -
    // a bare W2 (fists) must stay despawned or it renders as floaters
    const use = f.shieldOn || (f.dual && !(f.W2 && f.W2.spec.bare));
    for (let p = f.shieldLo; p < hi; p++) {
      if (use) {
        field.homed[p] = 1;
        field.snap[p] = 1;
        field.size[p] = size0[p - lo];
      } else {
        field.size[p] = 0;
        field.homed[p] = 0;
      }
    }
  };

  f.reset = (x) => {
    f.x = x;
    f.vx = 0;
    f.feet.F.px = x + f.side * 0.16 * u;
    f.feet.F.t = 1;
    f.feet.B.px = x - f.side * 0.12 * u;
    f.feet.B.t = 1;
    spawnJoints(x);
    // severed chunks die with the round: clones retire, freed flags
    // clear, and links/parts get their born endpoints back
    for (const jn of Object.keys(J)) {
      if (jn.endsWith("_x")) {
        J[jn].gone = true;
        delete J[jn];
      } else J[jn].free = 0;
    }
    for (const c of f.cons) {
      c.a = c.a0;
      c.b = c.b0;
      if (c.type === 1) { c.piv = c.piv0; c.r1 = c.r10; c.r2 = c.r20; c.jt = c.jt0; }
      c.broken = false;
    }
    for (const pt of f.parts) {
      pt.severed = false;
      pt.ja = pt.ja0;
      pt.jb = pt.jb0;
    }
    f.lim.elb = limOrig.elb;
    f.lim.elbS = limOrig.elbS;
    f.lim.kneeF = limOrig.kneeF;
    f.lim.kneeB = limOrig.kneeB;
    f.integrity = { ...integ0 };
    f.alive.fill(1);
    f.mass = f.mass0;
    f.dying.length = 0;
    f.staggerT = f.kickT = f.landT = 0;
    f.stam = 1;
    f.faintT = 0;
    f.hotNow = false;
    for (let p = lo; p < hi; p++) {
      field.homed[p] = 1;
      field.snap[p] = 1;
      field.size[p] = size0[p - lo];
    }
    // bulk re-enable above resurrects despawned slices - re-assert the
    // bare state so fists/dropped modes don't leave floaters
    if (f.W) f.W.syncSlice();
    if (f.W2) f.W2.syncSlice();
    if (!f.shieldOn && !f.dual) for (let p = f.shieldLo; p < hi; p++) field.size[p] = 0;
    writeHomes();
  };

  return f;
}
