// contact.js - rigid contact between the two fighters. Every solid thing
// is a capsule: body bones ride their joints, a held weapon is a capsule
// on its hand, a raised buckler is a disc on the off hand. Overlaps are
// projected out as pure translation (px moves with x, so a deep overlap
// can't pump energy), then the approaching normal velocity is removed
// as an inelastic impulse split by inverse mass - that impulse is the
// momentum a strike hands to the body it lands on. Each strike slot
// (weapon or bare fist) gets a per-frame touch record that damage.js
// adjudicates instead of its own proximity guesses.

// bone capsules by joint pair, radius in unit. Keyed by joints, not
// parts, so a re-skinned part table can't desync physics; a capsule
// with a freed (severed) end drops out.
const BONES = [
  ["root", "belly", 0.1],
  ["belly", "chest", 0.11],
  ["chest", "neck", 0.06],
  ["head", "head", 0.12],
  ["root", "kneeF", 0.065],
  ["kneeF", "footF", 0.05],
  ["root", "kneeB", 0.065],
  ["kneeB", "footB", 0.05],
  ["sho", "elb", 0.045],
  ["elb", "hand", 0.042],
  ["shoS", "elbS", 0.045],
  ["elbS", "handS", 0.04],
];
// forearm capsule index -> the fist slot it strikes for
const FIST_BONE = { 9: "F1", 11: "F2" };
const ITER = 3;
const SWEEP_MAX = 12;
const HIT_V_MAX = 3200; // px/s

export function createContact(fighters, u) {
  // per-fighter collider lists, built once
  const bodies = fighters.map((f) => ({
    f,
    bones: BONES.map(([a, b, r]) => ({ kind: "bone", a, b, r: r * u })),
    weapons: [
      { kind: "weapon", W: f.W, hand: "handP", wrist: "hand" },
      { kind: "weapon", W: f.W2, hand: "handSP", wrist: "handS" },
    ],
    shield: { kind: "shield", hand: "handSP", wrist: "handS" },
  }));
  for (const bd of bodies) bd.targets = [bd.shield, ...bd.bones];
  // probes draw the capsules from here
  for (const f of fighters) f.caps = BONES;

  // touch records hang off each strike slot: damage.js reads them
  const touchOf = (S) => S.touch || (S.touch = {
    body: { on: false, speed: 0, x: 0, y: 0, dx: 0, dy: 0 },
    shield: { on: false, speed: 0, x: 0, y: 0, dx: 0, dy: 0 },
    weapon: { on: false, speed: 0, x: 0, y: 0, dx: 0, dy: 0 },
  });
  for (const f of fighters) for (const S of [f.W, f.W2, f.F1, f.F2]) touchOf(S);

  // ---- geometry scratch (no per-frame allocation) ----
  const GA = { ax: 0, ay: 0, bx: 0, by: 0, r: 0 };
  const GB = { ax: 0, ay: 0, bx: 0, by: 0, r: 0 };
  const CP = { s: 0, t: 0, x1: 0, y1: 0, x2: 0, y2: 0, d2: 0 };

  const closest = (A, B, o) => {
    const d1x = A.bx - A.ax, d1y = A.by - A.ay;
    const d2x = B.bx - B.ax, d2y = B.by - B.ay;
    const rx = A.ax - B.ax, ry = A.ay - B.ay;
    const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y;
    const b = d1x * d2x + d1y * d2y, c = d1x * rx + d1y * ry, ff = d2x * rx + d2y * ry;
    let s, t;
    if (a < 1e-6 && e < 1e-6) { s = t = 0; }
    else if (a < 1e-6) { s = 0; t = Math.max(0, Math.min(1, ff / e)); }
    else if (e < 1e-6) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const den = a * e - b * b;
      s = den > 1e-6 ? Math.max(0, Math.min(1, (b * ff - c * e) / den)) : 0;
      t = (b * s + ff) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
    o.s = s; o.t = t;
    o.x1 = A.ax + d1x * s; o.y1 = A.ay + d1y * s;
    o.x2 = B.ax + d2x * t; o.y2 = B.ay + d2y * t;
    const dx = o.x2 - o.x1, dy = o.y2 - o.y1;
    o.d2 = dx * dx + dy * dy;
    return o.d2;
  };

  // is this collider solid right now? fills G when it is
  const geom = (bd, c, G) => {
    const f = bd.f, J = f.J;
    if (c.kind === "bone") {
      const A = J[c.a], B = J[c.b];
      if (!A || !B || A.free || B.free || A.gone || B.gone) return false;
      G.ax = A.x; G.ay = A.y; G.bx = B.x; G.by = B.y; G.r = c.r;
      return true;
    }
    if (c.kind === "weapon") {
      const W = c.W;
      if (!W || W.spec.bare || W.state !== "held") return false;
      if (W === f.W2 && !f.dual) return false;
      if (J[c.hand].free) return false;
      const s = W.seg;
      G.ax = s.ax; G.ay = s.ay; G.bx = s.bx; G.by = s.by; G.r = (W.spec.r || 0.03) * u;
      return true;
    }
    const sh = f.shield;
    if (!sh.active) return false;
    G.ax = G.bx = sh.x; G.ay = G.by = sh.y; G.r = sh.r;
    return true;
  };

  // inverse mass a contact at param s sees, and the displacement each
  // driving point takes per unit of correction
  const drivers = (bd, c, s, D) => {
    const J = bd.f.J;
    if (c.kind === "bone") {
      const A = J[c.a], B = J[c.b];
      if (A === B) { D.n = 1; D.p[0] = A; D.w[0] = 1; D.im = A.im; return D; }
      D.n = 2; D.p[0] = A; D.p[1] = B; D.w[0] = 1 - s; D.w[1] = s;
      D.im = A.im * (1 - s) * (1 - s) + B.im * s * s;
      return D;
    }
    // weapon / buckler: a rigid lump on the hand proxy + wrist - both
    // move together, and the implement's own weight sits in the lump
    const P = J[c.hand], H = J[c.wrist];
    const wt = c.kind === "weapon" ? c.W.spec.wt : 0.7;
    const m = 1 / P.im + 1 / H.im + wt * 2;
    D.n = 2; D.p[0] = P; D.p[1] = H; D.w[0] = 1; D.w[1] = 1; D.im = 1 / m;
    return D;
  };
  const DA = { n: 0, p: [null, null], w: [0, 0], im: 0 };
  const DB = { n: 0, p: [null, null], w: [0, 0], im: 0 };
  // rigid lumps move every point by the full correction; bones by weight
  const share = (c, D, i) => (c.kind === "bone" ? D.w[i] * D.p[i].im : D.im);

  // contact-point displacement this frame (implicit verlet velocity)
  const velAt = (c, s, D, o) => {
    if (c.kind === "weapon") {
      // the blade sweeps as hilt + rotation: its raw frame motion,
      // captured before any contact edits this frame
      o.x = c.hx + (c.tx - c.hx) * s; o.y = c.hy + (c.ty - c.hy) * s;
      return o;
    }
    o.x = o.y = 0;
    for (let i = 0; i < D.n; i++) {
      const p = D.p[i], w = c.kind === "bone" ? D.w[i] : 1 / D.n;
      o.x += (p.x - p.px) * w; o.y += (p.y - p.py) * w;
    }
    return o;
  };
  const VA = { x: 0, y: 0 }, VB = { x: 0, y: 0 };

  let dtF = 1 / 60;
  const touch = (S, kind, speed, x, y, dx, dy) => {
    if (!S) return;
    const r = S.touch[kind];
    if (r.on && r.speed >= speed) return;
    r.on = true; r.speed = speed; r.x = x; r.y = y; r.dx = dx; r.dy = dy;
  };

  // per-frame budgets for each body joint, summed over every pair and
  // iteration: a struck joint takes at most DV_MAX of new speed - one
  // joint stands in for the whole body's inertia here, and an uncapped
  // share of a 3000px/s blade launched a chest joint at 10k - and is
  // shoved at most PUSH_MAX, so a deep overlap resolves over a few frames
  // instead of stretching a chain that the links then snap back at 12k
  const DV_MAX = 900;
  const PUSH_MAX = 0.1; // *u per frame
  const kick = (p, nx, ny, k, cap) => {
    k = Math.min(k, cap - p.cdv);
    if (k <= 0) return;
    p.cdv += k;
    p.px -= nx * k; p.py -= ny * k;
  };
  // a lump (blade, buckler) is stopped by the impulse, never thrown back
  const stop = (p, nx, ny, k) => {
    const vn = (p.x - p.px) * nx + (p.y - p.py) * ny;
    if (k > vn) k = Math.max(0, vn);
    p.px += nx * k; p.py += ny * k;
  };

  // a lump moves rigidly: both its points take the same shift, as pure
  // translation so the projection adds no speed
  const shiftLump = (bd, c, dx, dy) => {
    const J = bd.f.J, P = J[c.hand], H = J[c.wrist];
    P.x += dx; P.y += dy; P.px += dx; P.py += dy;
    H.x += dx; H.y += dy; H.px += dx; H.py += dy;
  };
  // a blade takes its share of a correction by pivoting about the hand
  // where it can - the part across the blade, at a contact out along
  // it - and shoves the hand only with the part along the blade. A
  // blade blocked at the tip leans on what it hit while the arm keeps
  // moving; translating the whole arm froze a spear's hand in place
  // and the pull then yanked it 120px a frame back toward its target.
  const PIVOT_MIN = 0.12; // *u of blade between hand and contact
  function moveWeapon(bd, c, s, dx, dy) {
    const sg = c.W.seg;
    const bx = sg.bx - sg.ax, by = sg.by - sg.ay, L = Math.hypot(bx, by) || 1;
    const ux = bx / L, uy = by / L, arm = s * L;
    if (arm > PIVOT_MIN * u) {
      const perp = -dx * uy + dy * ux;
      c.W.setDir(ux * arm - uy * perp, uy * arm + ux * perp);
      dx += uy * perp; dy -= ux * perp;
    }
    shiftLump(bd, c, dx, dy);
    c.W.place();
  }
  const moveBy = (bd, c, D, lam, sx, sy, s) => {
    if (c.kind === "weapon") return moveWeapon(bd, c, s, sx * lam * D.im, sy * lam * D.im);
    if (c.kind !== "bone") return shiftLump(bd, c, sx * lam * D.im, sy * lam * D.im);
    for (let i = 0; i < D.n; i++) {
      const p = D.p[i];
      const k = Math.min(lam * D.w[i] * p.im, PUSH_MAX * u - p.cmv);
      if (k <= 0) continue;
      p.cmv += k;
      p.x += sx * k; p.y += sy * k; p.px += sx * k; p.py += sy * k;
    }
  };
  // how much of a normal impulse stops the hand: all of it for a thrust,
  // little for a blade struck across (the pivot already stopped that)
  const handShare = (c, nx, ny) => {
    if (c.kind !== "weapon") return 1;
    const sg = c.W.seg, L = Math.hypot(sg.bx - sg.ax, sg.by - sg.ay) || 1;
    return Math.abs((sg.bx - sg.ax) * nx + (sg.by - sg.ay) * ny) / L;
  };

  // resolve one collider pair; returns true when they touched
  function pair(ba, ca, bb, cb, it) {
    if (!geom(ba, ca, GA) || !geom(bb, cb, GB)) return false;
    const rr = GA.r + GB.r;
    if (closest(GA, GB, CP) >= rr * rr) return false;
    let d = Math.sqrt(CP.d2), nx, ny, ov;
    if (d > 1e-3) {
      nx = (CP.x2 - CP.x1) / d; ny = (CP.y2 - CP.y1) / d; ov = rr - d;
    } else if (ca.kind === "weapon") {
      // the blade's axis crosses the bone: it went in, it comes back out
      // the way it came - retract along the blade until the tip clears
      const L = Math.hypot(GA.bx - GA.ax, GA.by - GA.ay) || 1;
      nx = (GA.bx - GA.ax) / L; ny = (GA.by - GA.ay) / L;
      ov = (1 - CP.s) * L + rr;
    } else {
      // dead-centre overlap: separate along the line between the bodies
      nx = Math.sign(bb.f.J.root.x - ba.f.J.root.x) || 1; ny = 0; ov = rr;
    }
    drivers(ba, ca, CP.s, DA);
    drivers(bb, cb, CP.t, DB);
    const crossing = d <= 1e-3 && ca.kind === "weapon";
    const wsum = crossing ? DA.im : DA.im + DB.im || 1;
    const lam = ov / wsum;
    // relative approach before the correction (b relative to a along n)
    velAt(ca, CP.s, DA, VA);
    velAt(cb, CP.t, DB, VB);
    const rvx = VB.x - VA.x, rvy = VB.y - VA.y;
    const vn = rvx * nx + rvy * ny;
    const hA = handShare(ca, nx, ny), hB = handShare(cb, nx, ny);
    // translation: x and px together - no velocity from the projection
    moveBy(ba, ca, DA, lam, -nx, -ny, CP.s);
    if (!crossing) moveBy(bb, cb, DB, lam, nx, ny, CP.t);
    if (vn < 0) {
      // inelastic: cancel the closing speed, split by inverse mass
      const j = -vn / (DA.im + DB.im || 1);
      const cap = DV_MAX * dtF;
      for (let i = 0; i < DA.n; i++) {
        const k = j * share(ca, DA, i), p = DA.p[i];
        if (ca.kind === "bone") kick(p, -nx, -ny, k, cap);
        else stop(p, nx, ny, k * hA);
      }
      for (let i = 0; i < DB.n; i++) {
        const k = j * share(cb, DB, i), p = DB.p[i];
        if (cb.kind === "bone") kick(p, nx, ny, k, cap);
        else stop(p, -nx, -ny, k * hB);
      }
    }
    if (it === 0) {
      // the strike record: speed is the closing speed at the contact
      // point, the hit lands on the defender's bone axis
      // capped: a long spear tip whipping through a sampled sweep reads
      // 8000px/s, which is no blow a body could land
      const sp = Math.min(HIT_V_MAX, Math.max(0, -vn) / dtF);
      const rl = Math.hypot(rvx, rvy) || 1;
      if (ca.kind === "weapon") {
        const kind = cb.kind === "bone" ? "body" : cb.kind;
        touch(ca.W, kind, sp, CP.x2, CP.y2, -rvx / rl, -rvy / rl);
      }
      if (cb.kind === "weapon") {
        const kind = ca.kind === "bone" ? "body" : ca.kind;
        touch(cb.W, kind, sp, CP.x1, CP.y1, rvx / rl, rvy / rl);
      }
      if (ca.kind === "bone" && CP.s > 0.5 && ca.fist) {
        touch(ba.f[ca.fist], cb.kind === "bone" ? "body" : cb.kind, sp, CP.x2, CP.y2, -rvx / rl, -rvy / rl);
      }
      if (cb.kind === "bone" && CP.t > 0.5 && cb.fist) {
        touch(bb.f[cb.fist], ca.kind === "bone" ? "body" : ca.kind, sp, CP.x1, CP.y1, rvx / rl, rvy / rl);
      }
    }
    return true;
  }
  for (const bd of bodies) for (const i in FIST_BONE) bd.bones[i].fist = FIST_BONE[i];

  // a fast blade crosses a bone in one frame - sample the sweep from
  // last frame's seg and park the blade at the first pose that touches
  const SW = { ax: 0, ay: 0, bx: 0, by: 0 };
  function sweep(ba, cw, bb) {
    if (!geom(ba, cw, GA)) return;
    const W = cw.W, s = W.seg, q = W.prev;
    const mv = Math.max(Math.hypot(s.ax - q.ax, s.ay - q.ay), Math.hypot(s.bx - q.bx, s.by - q.by));
    const n = Math.min(SWEEP_MAX, Math.ceil(mv / (0.06 * u)));
    if (n < 2) return;
    const targets = bb.targets;
    // a target already touched by last frame's pose is the pair solve's
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      c.skip = !geom(bb, c, GB) || closest(q, GB, CP) < (GA.r + GB.r) ** 2;
    }
    for (let k = 1; k < n; k++) {
      const t = k / n;
      SW.ax = q.ax + (s.ax - q.ax) * t; SW.ay = q.ay + (s.ay - q.ay) * t;
      SW.bx = q.bx + (s.bx - q.bx) * t; SW.by = q.by + (s.by - q.by) * t;
      for (const c of targets) {
        if (c.skip || !geom(bb, c, GB)) continue;
        const rr = GA.r + GB.r;
        if (closest(SW, GB, CP) >= rr * rr) continue;
        // first touching pose: the blade stops where it met the target.
        // The hand stays where the arm took it and the blade leans from
        // there onto the contact point; only a contact right at the
        // hilt rewinds the hand itself. The pair solve then lands the
        // impact with the full sweep speed.
        const cx = CP.x1 - s.ax, cy = CP.y1 - s.ay;
        if (Math.hypot(cx, cy) > PIVOT_MIN * u) W.setDir(cx, cy);
        else {
          shiftLump(ba, cw, SW.ax - s.ax, SW.ay - s.ay);
          W.setDir(SW.bx - SW.ax, SW.by - SW.ay);
        }
        W.place();
        return;
      }
    }
  }

  const refresh = () => {
    for (const bd of bodies) {
      const f = bd.f;
      for (const cw of bd.weapons) if (cw.W && cw.W.state === "held" && !cw.W.spec.bare) cw.W.place();
      f.shield.x = f.J.handS.x + f.side * 0.2 * u;
      f.shield.y = f.J.handS.y;
    }
  };

  return {
    bodies,
    step(dt) {
      dtF = Math.min(Math.max(dt, 1 / 240), 1 / 30);
      for (const f of fighters) for (const n in f.J) f.J[n].cdv = f.J[n].cmv = 0;
      for (const f of fighters) for (const S of [f.W, f.W2, f.F1, f.F2]) {
        const t = S.touch;
        t.body.on = t.shield.on = t.weapon.on = false;
      }
      const [A, B] = bodies;
      for (const bd of bodies) for (const cw of bd.weapons) {
        if (!cw.W) continue;
        const sg = cw.W.seg, q = cw.W.prev;
        cw.hx = sg.ax - q.ax; cw.hy = sg.ay - q.ay;
        cw.tx = sg.bx - q.bx; cw.ty = sg.by - q.by;
      }
      for (const [x, y] of [[A, B], [B, A]]) for (const cw of x.weapons) sweep(x, cw, y);
      refresh();
      for (let it = 0; it < ITER; it++) {
        for (const ca of A.bones) for (const cb of B.bones) pair(A, ca, B, cb, it);
        for (const [x, y] of [[A, B], [B, A]]) {
          for (const cw of x.weapons) {
            pair(x, cw, y, y.shield, it);
            for (const cb of y.bones) pair(x, cw, y, cb, it);
          }
          // a raised buckler is a wall for the other body too
          for (const cb of y.bones) pair(x, x.shield, y, cb, it);
        }
        for (const ca of A.weapons) for (const cb of B.weapons) pair(A, ca, B, cb, it);
        pair(A, A.shield, B, B.shield, it);
        refresh();
      }
    },
  };
}
