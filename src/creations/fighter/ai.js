// ai.js - the foe is a second pair of hands on the same input the player
// has (BB's CharacterEnemyAI): it moves the hand targets and the walk
// intent, and the identical arm physics plays out. Nothing here touches
// a joint.
//
// Strikes are parametric arcs around the shoulder (BB's SwingDown /
// SwingUp / Stab fields): windup pose -> sweep through the target angle
// -> follow-through. The sweep is aimed once, at launch, from a delayed
// read of the player plus a bounded aim error - a committed swing can
// be stepped out of, blocked, or beaten to the punch.

const DEG = Math.PI / 180;

// angles in degrees in the facing frame (0 = straight at the foe, +90 =
// overhead), radii in arm lengths. from/to are relative to the aimed
// target angle; windup and follow are absolute stance poses.
const STRIKES = {
  overhead: { dur: 0.78, windupEnd: 0.5, strikeEnd: 0.72, windupAngle: 128, windupRadius: 0.8, from: 70, to: -50, radius: 1, followAngle: -80, followRadius: 0.75, zone: "head" },
  rising: { dur: 0.72, windupEnd: 0.46, strikeEnd: 0.7, windupAngle: -135, windupRadius: 0.75, from: -65, to: 55, radius: 1, followAngle: 95, followRadius: 0.75, zone: "chest" },
  stab: { dur: 0.6, windupEnd: 0.5, strikeEnd: 0.66, windupAngle: 8, windupRadius: 0.25, from: 0, to: 0, radius: 1.05, startRadius: 0.3, followAngle: -10, followRadius: 0.9, zone: "chest" },
  lunge: { dur: 0.82, windupEnd: 0.52, strikeEnd: 0.7, windupAngle: 15, windupRadius: 0.2, from: 4, to: -4, radius: 1.05, startRadius: 0.25, followAngle: -15, followRadius: 0.95, zone: "chest", lunge: 1 },
  sweep: { dur: 0.76, windupEnd: 0.48, strikeEnd: 0.7, windupAngle: 145, windupRadius: 0.8, from: 45, to: -45, radius: 1, followAngle: -110, followRadius: 0.7, zone: "knee" },
  // bare-knuckle set: short arcs, quick hands
  jab: { dur: 0.42, windupEnd: 0.42, strikeEnd: 0.62, windupAngle: 10, windupRadius: 0.3, from: 0, to: 0, radius: 1.05, startRadius: 0.35, followAngle: 5, followRadius: 0.6, zone: "head" },
  hook: { dur: 0.55, windupEnd: 0.45, strikeEnd: 0.68, windupAngle: 70, windupRadius: 0.55, from: 45, to: -35, radius: 0.95, followAngle: -60, followRadius: 0.55, zone: "head" },
  uppercut: { dur: 0.55, windupEnd: 0.45, strikeEnd: 0.68, windupAngle: -80, windupRadius: 0.5, from: -55, to: 45, radius: 0.95, followAngle: 80, followRadius: 0.6, zone: "chest" },
  kick: { dur: 0.5, kick: 1, zone: "chest" },
};
const ARMED_MIX = ["overhead", "rising", "stab", "lunge", "sweep", "kick"];
const BARE_MIX = ["jab", "hook", "uppercut", "lunge", "kick"];

// BB's personality fields. aimBias/maxAim in degrees, reaction in s,
// spacing in xu added to the weapon's preferred range. mix weights the
// strike table; a missing kind falls back to 1.
export const PERSONAS = {
  duelist: { aggression: 0.55, relentless: 0.2, bullyBias: 0.25, reaction: 0.34, aimBias: 12, maxAim: 24, spacing: 0, dodge: 0.35, feint: 0.2, shieldTrack: 0.85, retreat: 0.55, mix: { stab: 1.6, lunge: 1, overhead: 1, rising: 1, sweep: 0.5, kick: 0.5, jab: 1.6 } },
  brute: { aggression: 0.75, relentless: 0.6, bullyBias: 0.7, reaction: 0.46, aimBias: 18, maxAim: 34, spacing: -0.2, dodge: 0.1, feint: 0.05, shieldTrack: 0.45, retreat: 0.25, mix: { overhead: 2.2, sweep: 1.2, rising: 0.7, stab: 0.4, lunge: 0.4, kick: 1.1, hook: 2 } },
  skirmisher: { aggression: 0.45, relentless: 0.1, bullyBias: 0.15, reaction: 0.3, aimBias: 14, maxAim: 28, spacing: 0.35, dodge: 0.6, feint: 0.35, shieldTrack: 0.7, retreat: 0.9, mix: { lunge: 2, stab: 1, rising: 1, overhead: 0.6, sweep: 0.7, kick: 0.3, jab: 1.4 } },
  berserker: { aggression: 0.85, relentless: 0.8, bullyBias: 0.45, reaction: 0.5, aimBias: 22, maxAim: 40, spacing: -0.1, dodge: 0.05, feint: 0.1, shieldTrack: 0.3, retreat: 0.15, mix: { overhead: 1.4, rising: 1.4, sweep: 1, stab: 0.6, lunge: 0.6, kick: 0.7, uppercut: 1.6, hook: 1.4 } },
};
const PERSONA_ORDER = ["duelist", "brute", "skirmisher", "berserker"];

// ladder foe n (0-based): personas cycle against the weapon cycle at a
// different stride so the second lap pairs them differently, and each
// lap reads faster and aims truer
export function personaFor(n) {
  const name = PERSONA_ORDER[(n + Math.floor(n / 4)) % PERSONA_ORDER.length];
  const P = PERSONAS[name];
  const k = Math.min(1, n / 10);
  return {
    ...P,
    name,
    reaction: P.reaction * (1 - 0.35 * k),
    aimBias: P.aimBias * (1 - 0.4 * k),
    maxAim: P.maxAim * (1 - 0.3 * k),
    aggression: Math.min(1, P.aggression + 0.2 * k),
  };
}

const RING = 64; // frames of player history the reaction delay reads from

export function createAI(f, foe, u, env) {
  let D = personaFor(0);
  const aim = f.intent.aim;
  const sAim = f.intent.sAim;
  const armR = 0.86 * u; // matches the arm's reach envelope in puppet.js
  const rand = Math.random;

  // delayed perception: the player as the foe saw them `reaction` ago
  const HW = 9;
  const hist = new Float32Array(RING * HW);
  let head = 0, filled = 0;
  const seen = { cx: 0, cy: 0, hx: 0, hy: 0, kx: 0, ky: 0, tipX: 0, tipY: 0, tipV: 0 };
  function perceive() {
    const J = foe.J;
    const S = foe.W.spec.bare ? foe.F1 : foe.W;
    const tip = foe.W.spec.bare ? null : foe.W.seg;
    const o = head * HW;
    hist[o] = J.chest.x; hist[o + 1] = J.chest.y;
    hist[o + 2] = J.head.x; hist[o + 3] = J.head.y;
    hist[o + 4] = J.kneeF.x; hist[o + 5] = J.kneeF.y;
    hist[o + 6] = tip ? tip.bx : J.hand.x;
    hist[o + 7] = tip ? tip.by : J.hand.y;
    hist[o + 8] = Math.max(S.tipSpeed, foe.F2.tipSpeed);
    head = (head + 1) % RING;
    filled = Math.min(RING, filled + 1);
    const lag = Math.min(filled - 1, Math.round(D.reaction * 60));
    const r = ((head - 1 - lag + RING * 2) % RING) * HW;
    seen.cx = hist[r]; seen.cy = hist[r + 1];
    seen.hx = hist[r + 2]; seen.hy = hist[r + 3];
    seen.kx = hist[r + 4]; seen.ky = hist[r + 5];
    seen.tipX = hist[r + 6]; seen.tipY = hist[r + 7];
    seen.tipV = hist[r + 8];
  }

  // weapon geometry sets the fighting range: the tip reach from the
  // shoulder decides where a strike lands. Against a longer weapon the
  // safe place is inside it; against a shorter one, just outside it.
  const range = { tip: 1, strike: 1, pref: 1, min: 0.8, theirs: 1 };
  // a fist lands with the arm still bent, well short of full extension
  const tipReach = (w) => (w.spec.bare ? 0.62 : 0.86 + w.spec.len);
  function measure() {
    const tip = tipReach(f.W), theirs = tipReach(foe.W);
    range.tip = tip * u;
    range.theirs = theirs * u;
    range.strike = (tip + 0.12) * u;
    const outside = theirs < tip - 0.25;
    const pref = outside ? Math.min(tip + 0.35, theirs + 0.45) : theirs > tip + 0.25 ? tip * 0.8 : tip + 0.25;
    range.pref = Math.max(0.9, pref + D.spacing + mood.spacing) * u;
    range.min = Math.max(0.62, tip * 0.55) * u;
  }

  // BB's personalitySwitchTime: the foe swings between pressing and
  // waiting it out, so one round has tempo changes
  const mood = { t: 0, press: false, aggression: 0, spacing: 0 };
  function moodStep(dt) {
    mood.t -= dt;
    if (mood.t > 0) return;
    mood.press = !mood.press;
    mood.t = 5 + rand() * 5;
    mood.aggression = mood.press ? 0.2 : -0.2;
    mood.spacing = mood.press ? -0.2 : 0.25;
  }

  // one live strike at a time - its arc is fixed at launch
  const cur = { kind: null, S: null, t: 0, tgtA: 0, hand: 0, feint: false, chained: false };
  const P = { x: 0, y: 0 };
  const polar = (sh, a, r) => {
    P.x = sh.x + f.side * Math.cos(a * DEG) * r * armR;
    P.y = sh.y - Math.sin(a * DEG) * r * armR;
  };
  const READY_A = 12, READY_R = 0.52;
  const smooth = (x) => x * x * (3 - 2 * x);
  // hand target at phase k of the strike, around shoulder sh
  function arcAt(S, k, sh) {
    let a, r;
    if (k < S.windupEnd) {
      const e = smooth(k / S.windupEnd);
      a = READY_A + (S.windupAngle - READY_A) * e;
      r = READY_R + (S.windupRadius - READY_R) * e;
    } else if (k < S.strikeEnd) {
      // the sweep accelerates through the target - the whip is late
      const e = (k - S.windupEnd) / (S.strikeEnd - S.windupEnd);
      const w = e * e * (2 - e);
      a = cur.tgtA + S.from + (S.to - S.from) * w;
      r = (S.startRadius ?? S.radius) + (S.radius - (S.startRadius ?? S.radius)) * w;
    } else {
      const e = smooth(Math.min(1, (k - S.strikeEnd) / (1 - S.strikeEnd)));
      a = cur.tgtA + S.to + (S.followAngle - cur.tgtA - S.to) * e;
      r = S.radius + (S.followRadius - S.radius) * e;
    }
    polar(sh, a, r);
  }
  const readyPos = (sh) => polar(sh, READY_A, READY_R);

  const twoHanded = () => f.dual || f.W.spec.bare;
  const mixFor = () => (f.W.spec.bare ? BARE_MIX : ARMED_MIX);
  function chooseKind(gap) {
    const kinds = mixFor();
    let total = 0;
    for (const k of kinds) total += weight(k, gap);
    let r = rand() * total;
    for (const k of kinds) {
      r -= weight(k, gap);
      if (r <= 0) return k;
    }
    return kinds[0];
  }
  // distance shapes the pick: a lunge covers ground, a kick needs the
  // foe in the clinch, the rest want the sweet spot
  function weight(k, gap) {
    let w = D.mix[k] ?? 1;
    // pinned or clinched, the boot is the way out - a kick shoves
    if (k === "kick") w *= gap < 1.25 * u ? (pinned ? 4 : 1.5) : 0;
    else if (k === "lunge") w *= gap > range.strike * 0.9 ? 1.3 : 0.3;
    else if (gap > range.strike * 1.25) w *= 0.25;
    return w;
  }

  function launch(kind) {
    cur.kind = kind;
    cur.S = STRIKES[kind];
    cur.t = 0;
    cur.feint = !cur.chained && !cur.S.kick && rand() < D.feint;
    cur.hand = twoHanded() && rand() < 0.45 ? 1 : 0;
    // aim: target angle from the shoulder to a delayed read of the zone,
    // off by a bounded random error. Committed for the whole swing.
    const sh = cur.hand ? f.J.shoS : f.J.sho;
    const zx = cur.S.zone === "head" ? seen.hx : cur.S.zone === "knee" ? seen.kx : seen.cx;
    const zy = cur.S.zone === "head" ? seen.hy : cur.S.zone === "knee" ? seen.ky : seen.cy;
    const ta = Math.atan2(-(zy - sh.y), (zx - sh.x) * f.side) / DEG;
    const err = Math.max(-D.maxAim, Math.min(D.maxAim, (rand() * 2 - 1) * D.aimBias * 1.6));
    cur.tgtA = Math.max(-80, Math.min(80, ta + err));
    if (cur.S.kick) f.intent.kick = 1;
  }

  let pinned = false;
  let state = "stalk";
  let t = 0, cool = 0.8;
  const go = (s) => {
    state = s;
    t = 0;
  };

  function shieldTrack(dt) {
    // buckler rides between the chest and where the player's weapon
    // was seen, clamped to a guard radius - BB's shieldTrack fields
    const c = f.J.chest;
    const gx = c.x + f.side * 0.3 * u, gy = c.y - 0.05 * u;
    let tx = gx, ty = gy;
    if (seen.tipV > 300) {
      let dx = seen.tipX - c.x, dy = seen.tipY - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const R = 0.42 * u;
      dx = (dx / d) * R;
      dy = (dy / d) * R;
      tx = gx + (c.x + dx - gx) * D.shieldTrack;
      ty = gy + (c.y + dy - gy) * D.shieldTrack;
    }
    const k = Math.min(1, dt * 10 * D.shieldTrack);
    sAim.x += (tx - sAim.x) * k;
    sAim.y += (ty - sAim.y) * k;
  }

  function step(dt) {
    const i = f.intent;
    if (f.faintT > 0) {
      i.aimOn = i.sOn = i.move = i.jump = i.kick = i.crouch = i.grip = 0;
      cur.kind = null;
      return;
    }
    perceive();
    moodStep(dt);
    measure();
    i.aimOn = 1;
    i.jump = 0;
    i.crouch = 0;
    t += dt;
    cool -= dt;

    const g = foe.J.root.x - f.x;
    const gap = Math.abs(g), dir = Math.sign(g) || f.side;
    const e = env();
    const behind = dir > 0 ? f.x - e.wallL : e.wallR - f.x;
    const cornered = behind < 0.7 * u;
    pinned = gap < 0.9 * u || (cornered && gap < range.strike);
    // bully bias: a hurt, staggered, or cornered player draws pressure
    const edge = Math.max(0, f.mass / f.mass0 - foe.mass / foe.mass0) * 2 +
      (foe.staggerT > 0 ? 0.5 : 0) + (foe.faintT > 0 ? 1 : 0);
    const aggr = Math.max(0.1, Math.min(1, D.aggression + mood.aggression + D.bullyBias * edge));
    const winded = f.stam < 0.3;

    // a landed hit breaks the swing and the foe backs off after -
    // that punish window is what makes a counter worth throwing
    if (f.staggerT > 0) {
      i.move = 0;
      i.grip = 0;
      cur.kind = null;
      readyPos(f.J.sho);
      aim.x = P.x;
      aim.y = P.y;
      if (state !== "retreat") go("retreat");
      if (f.shieldOn) shieldTrack(dt);
      return;
    }

    const threat = seen.tipV > 650 && gap < range.tip + 1.1 * u;
    const spacingMove = () => {
      if (gap > range.pref + 0.15 * u) return dir * Math.min(1, (gap - range.pref) / (0.5 * u));
      // recovering inside the player's reach: get out of it
      if (gap < Math.min(range.strike, range.theirs) && cool > 0.45 && !cornered && D.relentless < 0.5) return -dir;
      if (gap < range.min && !cornered) return -dir;
      if (gap < range.pref - 0.25 * u && !cornered) return -dir * 0.6 * (1 - D.relentless);
      return 0;
    };

    if (state === "stalk") {
      i.move = winded ? (cornered ? 0 : -dir * 0.7) : spacingMove();
      i.grip = 0;
      readyPos(f.J.sho);
      aim.x = P.x;
      aim.y = P.y;
      // a player standing in range is an opening - it cuts the wait
      // short, so walking in unguarded gets punished
      const opening = (gap < range.strike && cool < 0.45) || pinned;
      if (threat && rand() < D.dodge * dt * 8 && !cornered) go("dodge");
      else if (!winded && (cool <= 0 || opening) && gap < range.pref + 0.6 * u) {
        cur.chained = false;
        launch(chooseKind(gap));
        go("strike");
      }
    } else if (state === "dodge") {
      i.move = cornered ? 0 : -dir;
      i.grip = 0;
      readyPos(f.J.sho);
      aim.x = P.x;
      aim.y = P.y;
      if (t > 0.35) {
        cool = Math.min(cool, 0.25 * (1 - aggr));
        go("stalk");
      }
    } else if (state === "strike" && cur.kind) {
      const S = cur.S;
      cur.t += dt;
      const k = cur.t / S.dur;
      // close the distance during the windup; a lunge also drives the
      // body through the sweep
      const inWindup = k < (S.windupEnd ?? 0.5);
      // the drive stops at striking range - ramming the bodies together
      // only hands the contact solver an overlap to fling apart
      if (S.lunge && !inWindup && k < S.strikeEnd && gap > range.min + 0.2 * u) i.move = dir;
      else if (inWindup && gap > range.strike) i.move = dir * 0.8;
      else i.move = 0;
      if (S.kick) {
        readyPos(f.J.sho);
        aim.x = P.x;
        aim.y = P.y;
        i.grip = 0;
      } else {
        i.grip = inWindup ? 0 : 1;
        arcAt(S, Math.min(1, k), cur.hand ? f.J.shoS : f.J.sho);
        if (cur.hand) {
          sAim.x = P.x;
          sAim.y = P.y;
          readyPos(f.J.sho);
        }
        aim.x = P.x;
        aim.y = P.y;
        // the other hand of a two-handed fighter follows the lead a
        // beat behind - BB's leftSpawnDelay one-two
        if (twoHanded() && !cur.hand && k > 0.15) arcAt(S, Math.min(1, k - 0.15), f.J.shoS), sAim.x = P.x, sAim.y = P.y;
      }
      if (cur.feint && k >= S.windupEnd) {
        // feint: the windup sells it, the sweep never comes
        cur.kind = null;
        cur.feint = false;
        cool = 0.1 + rand() * 0.25;
        go(rand() < 0.5 ? "stalk" : "retreat");
      } else if (k >= 1) {
        cur.kind = null;
        // relentless foes chain a second strike before resetting
        if (!winded && !cur.chained && rand() < D.relentless * 0.6 && gap < range.strike * 1.2) {
          cur.chained = true;
          launch(chooseKind(gap));
          cur.t = 0;
        } else {
          cool = (1.2 - aggr * 0.9) * (0.7 + rand() * 0.6);
          go(rand() < D.retreat ? "retreat" : "stalk");
        }
      }
    } else if (state === "retreat") {
      // BB's postAttackRetreatBoost: step back out of the counter
      i.move = cornered || gap > range.pref ? 0 : -dir;
      i.grip = 0;
      readyPos(f.J.sho);
      aim.x = P.x;
      aim.y = P.y;
      if (t > 0.3 + D.retreat * 0.5 || gap > range.pref + 0.2 * u || cornered) go("stalk");
    } else go("stalk");

    const offStriking = state === "strike" && cur.kind && (cur.hand || twoHanded());
    i.sOn = f.shieldOn || f.dual || f.W.spec.bare ? 1 : 0;
    if (!offStriking) {
      if (f.shieldOn) shieldTrack(dt);
      else {
        // second blade or off fist held high in front, ready to answer
        polar(f.J.shoS, 20, 0.55);
        sAim.x = P.x;
        sAim.y = P.y;
      }
    }
    // bare hands between punches hang in the stance guard, the same as a
    // player who isn't holding a button
    if (f.W.spec.bare && !(state === "strike" && cur.kind && !cur.S.kick)) i.aimOn = i.sOn = 0;
  }

  return {
    step,
    tune(d) {
      D = { ...D, ...d };
    },
    reset() {
      go("stalk");
      cur.kind = null;
      cool = 0.8 + rand() * 0.6;
      filled = 0;
      mood.t = 0;
      mood.press = rand() < 0.5;
    },
    get state() {
      return state;
    },
    // the attack being thrown right now (a STRIKES key, or "feint"
    // while a feint's windup sells it); null between attacks
    get attack() {
      return state === "strike" && cur.kind ? (cur.feint ? "feint" : cur.kind) : null;
    },
    get persona() {
      return D.name;
    },
    get range() {
      return range;
    },
  };
}
