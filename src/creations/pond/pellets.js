// pellets.js - fixed food pool. Idle slots are borrowed water (homed=0,
// water tint). drop() defers the snap to the next step() because the engine
// clears snap[] before field.frame runs.
import { PF } from "../../engine/index.js";

const PELLET_Z = 0.4; // xu, floats above the water plane
const BLOB_R = 0.06; // xu
const BOB = 3; // px
const TINT = [1.0, 0.82, 0.5];

export function makePellets(field, spans) {
  const list = spans.map(([lo, hi], k) => ({
    lo, hi, x: 0, y: 0, born: -1, amount: 0,
    active: false, pending: false, px: 0, py: 0,
    owned: new Int32Array(0), off: new Float32Array(0), seed: k * 1.7,
  }));

  const layout = (unit) => {
    const R = BLOB_R * unit;
    for (const p of list) {
      let n = 0;
      for (let q = p.lo; q < p.hi; q++) if (!field.reserve[q]) n++;
      if (p.owned.length !== n) {
        p.owned = new Int32Array(n);
        p.off = new Float32Array(n * 2);
      }
      let j = 0;
      for (let q = p.lo; q < p.hi; q++) {
        if (field.reserve[q]) continue;
        p.owned[j] = q;
        const a = PF.rnd() * 6.2832, rr = R * Math.sqrt(PF.rnd()); // uniform disc
        p.off[j * 2] = Math.cos(a) * rr;
        p.off[j * 2 + 1] = Math.sin(a) * rr;
        j++;
      }
    }
  };

  const drop = (x, y) => {
    let p = null;
    for (const q of list)
      if (!q.active && !q.pending) { p = q; break; }
    if (!p) {
      p = list[0];
      for (const q of list) if (q.born < p.born) p = q;
    }
    p.pending = true;
    p.px = x;
    p.py = y;
  };

  const nearest = (x, y, r2Max) => {
    let best = null, bd = r2Max;
    for (const p of list) {
      if (!p.active) continue;
      const dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = p; }
    }
    return best;
  };

  const step = (T, dt, ctx) => {
    const { home, hcol, homed, snap } = field;
    for (const p of list) {
      const own = p.owned;
      if (p.pending) {
        p.pending = false;
        p.active = true;
        p.x = p.px;
        p.y = p.py;
        p.amount = 1;
        p.born = T;
        for (let j = 0; j < own.length; j++) {
          const q = own[j], i = q * 3;
          homed[q] = 1;
          home[i] = p.x + p.off[j * 2];
          home[i + 1] = p.y + p.off[j * 2 + 1];
          home[i + 2] = PELLET_Z;
          hcol[i] = TINT[0];
          hcol[i + 1] = TINT[1];
          hcol[i + 2] = TINT[2];
          snap[q] = 1;
        }
      } else if (p.active) {
        if (p.amount <= 0) {
          p.active = false;
          for (let j = 0; j < own.length; j++) {
            homed[own[j]] = 0;
            ctx.tintWater(own[j]); // dissolves back into pond
          }
          continue;
        }
        const bob = Math.sin(T * 2 + p.seed) * BOB;
        for (let j = 0; j < own.length; j++) {
          const i = own[j] * 3;
          home[i] = p.x + p.off[j * 2];
          home[i + 1] = p.y + p.off[j * 2 + 1] + bob;
          home[i + 2] = PELLET_Z;
        }
      }
    }
  };

  return { list, layout, drop, nearest, step };
}
