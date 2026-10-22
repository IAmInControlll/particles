// ai.js - the foe's intent writer. A state table, not scattered flags:
// each state writes f.intent per frame and may nominate the next state.
// Telegraphs are built in - windup holds the hand back before the swing.
// The shield covers while it isn't swinging: guard stance and reactive
// cover when the player's blade gets fast, exposed in windup and swing.

export function createAI(f, foe, u, diff = {}) {
  const D = {
    windupT: 0.55,
    swingT: 0.22,
    recoverT: 0.6,
    guardT: 0.8,
    reach: 1.15, // xu at which it commits to a swing
    guardChance: 0.3,
    aggression: 0.8,
    ...diff,
  };
  let state = "approach";
  let t = 0;
  const aim = f.intent.aim;
  const sAim = f.intent.sAim;

  const gap = () => foe.J.root.x - f.x;
  const readyPos = () => {
    aim.x = f.J.sho.x + f.side * 0.45 * u;
    aim.y = f.J.sho.y - 0.08 * u;
  };
  const windupPos = () => {
    aim.x = f.J.sho.x - f.side * 0.3 * u;
    aim.y = f.J.sho.y - 0.5 * u;
  };
  const guardPos = () => {
    aim.x = f.J.sho.x + f.side * 0.12 * u;
    aim.y = f.J.sho.y - 0.42 * u;
  };
  // buckler parked over the chest/head line, pushed toward the foe
  const coverPos = () => {
    sAim.x = f.J.chest.x + f.side * 0.3 * u;
    sAim.y = f.J.chest.y - 0.05 * u;
  };
  // dual wield: the off hand rakes through the foe's torso on a slow
  // sweep so the second blade stays hot
  const strike2Pos = () => {
    sAim.x = foe.J.chest.x + f.side * 0.2 * u;
    sAim.y = foe.J.chest.y + Math.sin(t * 9) * 0.25 * u;
  };
  const rand = Math.random;
  const pick = () => {
    const r = rand();
    // winded: back off and breathe; a wrecked one just shells up
    if (f.stam < 0.3) return f.mass < f.mass0 * 0.55 ? "guard" : "retreat";
    if (f.mass < f.mass0 * 0.55 && r < 0.4) return "retreat";
    if (r < D.guardChance) return "guard";
    return r < D.guardChance + D.aggression ? "windup" : "approach";
  };

  const S = {
    approach(i) {
      const g = gap();
      i.move = Math.abs(g) > 0.55 * u ? Math.sign(g) : 0;
      i.grip = 0;
      readyPos();
      if (Math.abs(g) < D.reach * u) return pick();
    },
    windup(i) {
      i.move = 0;
      i.sOn = 0; // shield drops - windup leaves the body open
      windupPos();
      if (t > D.windupT) return "swing";
    },
    swing(i) {
      i.move = 0;
      i.grip = 1;
      i.sOn = 0;
      // whip through the foe's torso, slightly ahead of it
      aim.x = foe.J.chest.x + f.side * 0.5 * u;
      aim.y = foe.J.chest.y - 0.05 * u;
      if (t > D.swingT) return "recover";
    },
    recover(i) {
      i.grip = 0;
      readyPos();
      if (t > D.recoverT) return "approach";
    },
    guard(i) {
      i.move = 0;
      guardPos();
      if (t > D.guardT) return "approach";
    },
    retreat(i) {
      i.move = -Math.sign(gap());
      guardPos();
      if (Math.abs(gap()) > 3 * u || t > 1.4) return "approach";
    },
  };

  return {
    step(dt) {
      const i = f.intent;
      if (f.faintT > 0) {
        i.aimOn = i.sOn = i.move = i.jump = i.kick = i.crouch = i.grip = 0;
        return;
      }
      i.aimOn = 1;
      i.jump = i.kick = 0;
      i.crouch = 0;
      // default: buckler covers while it isn't swinging; a dual wielder's
      // off hand is a second weapon and rakes instead
      i.sOn = (f.shieldOn || f.dual) && (state !== "swing" && state !== "windup") ? 1 : 0;
      if (i.sOn) (f.dual ? strike2Pos : coverPos)();
      if (f.staggerT > 0) {
        i.move = 0;
        return;
      }
      t += dt;
      const next = S[state](i);
      if (next && next !== state) {
        state = next;
        t = 0;
      }
    },
    tune(d) {
      Object.assign(D, d);
    },
    get state() {
      return state;
    },
  };
}
