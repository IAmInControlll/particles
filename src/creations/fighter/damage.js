// damage.js - hit adjudication over real contacts. contact.js leaves a
// touch record on every strike slot (body / shield / weapon) with the
// closing speed at the contact point; a body touch above the slot's
// threshold is a hit by that speed, a shield touch is a block, a blade
// touch is a clash. Kicks shove instead.

import { TUNE } from "./puppet.js";

const HIT_JOINTS = ["head", "neck", "chest", "belly", "sho", "shoS", "elb", "elbS", "kneeF", "kneeB", "root"];
// a boot to a planted foot still shoves the body - feet aren't damage
// zones but they are kick contacts
const KICK_JOINTS = [...HIT_JOINTS, "footF", "footB"];

export function createDamage(fighters, u, fx) {
  const MIN_V = 350; // px/s - a resting blade can jitter ~250; real swings run 600+
  const CD = 0.32; // per-slot hit cooldown
  const cd = [[0, 0], [0, 0]];
  // contact latches: a slot resting on the buckler or locked against a
  // blade fires its effects once on entry, never again until the touch
  // has been gone LATCH_GAP. Without this a resting blade re-triggers a
  // stagger impulse every cooldown tick and the defender spasms.
  const inSh = [[0, 0], [0, 0]];
  const inCl = [[0, 0], [0, 0]];
  const lastSh = [[-9, -9], [-9, -9]];
  const lastCl = [[-9, -9], [-9, -9]];
  const LATCH_GAP = 0.12; // s without contact before a latch lets go
  const kickLanded = [false, false];
  const spark = [1.0, 0.85, 0.4];
  const ev = { hit: 0, block: 0, clash: 0, power: 0 };
  const total = { hits: 0, blocks: 0, clashes: 0 };

  return {
    ev,
    total,
    step(T, dt) {
      ev.hit = ev.block = ev.clash = ev.power = 0;
      for (let a = 0; a < 2; a++) {
        const atk = fighters[a], def = fighters[1 - a];
        // a fainted fighter can't strike - and its held blade lies flat
        // on the floor, so it can't be used to parry either
        if (!atk || !def || def.dead() || atk.faintT > 0) continue;

        // per-hand strike slots: an armed hand contributes its weapon
        // seg; a bare or disarmed hand contributes its fist. The off
        // hand strikes whenever the buckler isn't occupying it - dual
        // and none and boxing all leave it free.
        const armed = (W) => (W.spec.bare || W.state !== "held" ? null : W);
        const slots = [[armed(atk.W), atk.F1]];
        if (!atk.shieldOn) slots.push([atk.dual ? armed(atk.W2) : null, atk.F2]);
        const sh = def.shield;
        for (let k = 0; k < slots.length; k++) {
          const [W, F] = slots[k];
          const S = W || F;
          if (!S || S.dead) continue;
          // a slot moving past its hit threshold is work - it bleeds
          // stamina every hot frame whether or not the swing lands. The
          // contact band still costs a little: working the arm around at
          // real speed is exertion even when it can't break skin.
          const moving = S.tipSpeed > (S.minV || MIN_V);
          if (moving) {
            atk.drainStam(TUNE.drainHot * S.spec.wt * dt);
          } else if (S.tipSpeed > 150) atk.drainStam(TUNE.drainWork * S.spec.wt * dt);
          // genuinely moving hands pause regen - otherwise mid-speed
          // whips net positive stamina and the tank can never empty
          if (S.tipSpeed > 150) atk.hotNow = true;
          const cdc = cd[a][k];
          const tc = S.touch;

          // a buckler face the slot is resting on eats the strike - fast
          // or slow, speed only decides how hard the block lands. Effects
          // fire on entry; the latch holds while the seg stays on the face
          // and lets go only after a short gap, so contact jitter can't
          // machine-gun staggers.
          if (tc.shield.on) {
            lastSh[a][k] = T;
            if (!inSh[a][k]) {
              inSh[a][k] = 1;
              ev.block++;
              total.blocks++;
              const sp = Math.max(tc.shield.speed, S.tipSpeed * 0.5);
              if (sp > 150 && T > cdc) {
                fx.burst(tc.shield.x, tc.shield.y, 14, -tc.shield.dx, -tc.shield.dy, 260 + sp * 0.3, spark);
                const m = sp > (S.minV || MIN_V) ? 0.6 : 0.3;
                def.blockStagger(tc.shield.dx * m, tc.shield.dy * m);
                def.drainStam(TUNE.drainBlock);
                cd[a][k] = T + CD;
                ev.power = sp;
              }
            }
            continue;
          }
          if (T - lastSh[a][k] > LATCH_GAP) inSh[a][k] = 0;

          // steel on steel: blades that physically met. A bare fist has no
          // blade to lock and slips under the guard.
          if (W && tc.weapon.on) {
            lastCl[a][k] = T;
            if (!inCl[a][k]) {
              inCl[a][k] = 1;
              ev.clash++;
              total.clashes++;
              const sp = Math.max(tc.weapon.speed, S.tipSpeed * 0.5);
              if (sp > 150 && T > cdc) {
                const mag = sp > (S.minV || MIN_V) ? 1 : 0.5;
                fx.burst(tc.weapon.x, tc.weapon.y, 12, -tc.weapon.dx, -tc.weapon.dy, 240 + sp * 0.3, spark);
                atk.drainStam(TUNE.drainClash);
                def.drainStam(TUNE.drainClash);
                cd[a][k] = T + CD;
                ev.power = sp * mag;
              }
            }
            continue;
          }
          if (T - lastCl[a][k] > LATCH_GAP) inCl[a][k] = 0;

          // flesh: the slot's capsule actually touched a bone this frame.
          // Damage is the closing speed at that contact - a blade parked
          // on a body deals nothing, a swing that lands deals by speed.
          // The cooldown stops one drag through the body landing a hit
          // every frame.
          const tb = tc.body;
          if (!tb.on || T <= cdc) continue;
          const power = Math.max(tb.speed, 0);
          if (power < (S.minV || MIN_V)) continue;
          def.applyHit(tb.x, tb.y, power * S.dmg, tb.dx, tb.dy, S.spec.cut ?? 1, S.spec.floor ?? TUNE.dmgFloor);
          cd[a][k] = T + CD;
          ev.hit++;
          total.hits++;
          ev.power = power;
        }

        // kick: once per kick, while the leg is extended - any joint works.
        // The shield eats a boot too - the kick fizzles against the face.
        if (atk.kickT > 0.1 && !kickLanded[a]) {
          const ft = atk.J.footF;
          if (sh && sh.active) {
            const kx = ft.x - sh.x, ky = ft.y - sh.y;
            if (kx * kx + ky * ky < (sh.r + 0.12 * u) ** 2) {
              kickLanded[a] = true;
              fx.burst(sh.x, sh.y, 10, -atk.side, -0.2, 220, spark);
              def.blockStagger(atk.side * 0.3, 0.1);
            }
          }
          for (const jn of KICK_JOINTS) {
            const j = def.J[jn];
            const dx = j.x - ft.x, dy = j.y - ft.y;
            if (dx * dx + dy * dy < (0.6 * u) ** 2) {
              kickLanded[a] = true;
              const dir = Math.sign(j.x - atk.J.root.x) || 1;
              def.shove(dir, -0.25);
              break;
            }
          }
        }
        if (atk.kickT === 0) kickLanded[a] = false;
      }
    },
  };
}
