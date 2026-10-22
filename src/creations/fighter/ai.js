// ai.js - the foe's intent writer. A state table, not scattered flags:
// each state writes f.intent per frame and may nominate the next state.
// Telegraphs are built in - windup holds the hand back before the swing.

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

  const rand = Math.random;
  const pick = () => {
    const r = rand();
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
      windupPos();
      if (t > D.windupT) return "swing";
    },
    swing(i) {
      i.move = 0;
      i.grip = 1;
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
      i.aimOn = 1;
      i.jump = i.kick = 0;
      i.crouch = 0;
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
    get state() {
      return state;
    },
  };
}
