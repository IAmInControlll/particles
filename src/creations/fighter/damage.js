// damage.js - hit adjudication. A weapon's segment is tested against the
// enemy's joint positions; proximity times tip speed is the hit. Tests
// are swept - the seg and its previous-frame seg form a quad, so a fast
// tip cannot tunnel through a joint, a shield disc, or a held blade
// between frames. A shield disc intersecting the sweep eats the whole
// strike - sparks, a small stagger, no damage. Kicks shove instead.

import { TUNE } from "./puppet.js";

const HIT_JOINTS = ["head", "neck", "chest", "belly", "sho", "shoS", "elb", "elbS", "kneeF", "kneeB", "root"];

export function createDamage(fighters, u, fx) {
  const HIT_R = 0.24 * u;
  const MIN_V = 350; // px/s - a resting blade can jitter ~250; real swings run 600+
  const CLASH_R = 0.075 * u; // two blade segs this close read as steel on steel
  const CD = 0.32; // per-slot hit cooldown
  const cd = [[0, 0], [0, 0]];
  // contact latches: a seg inside the shield disc or tangled with a
  // blade is HELD there - effects fire once on entry, never again until
  // the seg fully exits. Without this a resting blade re-triggers a
  // stagger impulse every cooldown tick and the defender spasms.
  const inSh = [[0, 0], [0, 0]];
  const inCl = [[0, 0], [0, 0]];
  const kickLanded = [false, false];
  const spark = [1.0, 0.85, 0.4];
  const ev = { hit: 0, block: 0, clash: 0, power: 0 };
  const total = { hits: 0, blocks: 0, clashes: 0 };

  const ptSeg = (jx, jy, s) => {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const L2 = dx * dx + dy * dy || 1e-4;
    let t = ((jx - s.ax) * dx + (jy - s.ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = s.ax + dx * t - jx, qy = s.ay + dy * t - jy;
    return qx * qx + qy * qy;
  };

  // squared distance between two segments; the midpoint of the closest
  // pair lands in cp so callers can spark where the blades actually met
  const cp = { x: 0, y: 0 };
  const segSegDist2 = (a, b) => {
    const d1x = a.bx - a.ax, d1y = a.by - a.ay;
    const d2x = b.bx - b.ax, d2y = b.by - b.ay;
    const rx = a.ax - b.ax, ry = a.ay - b.ay;
    const A = d1x * d1x + d1y * d1y;
    const E = d2x * d2x + d2y * d2y;
    const B = d1x * d2x + d1y * d2y;
    const C = d1x * rx + d1y * ry;
    const F = d2x * rx + d2y * ry;
    const den = A * E - B * B;
    let s = den > 1e-6 ? (B * F - C * E) / den : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    let t = E > 1e-6 ? (B * s + F) / E : 0;
    if (t < 0) { t = 0; s = A > 1e-6 ? -C / A : 0; }
    else if (t > 1) { t = 1; s = A > 1e-6 ? (B - C) / A : 0; }
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    const p1x = a.ax + d1x * s, p1y = a.ay + d1y * s;
    const p2x = b.ax + d2x * t, p2y = b.ay + d2y * t;
    cp.x = (p1x + p2x) * 0.5;
    cp.y = (p1y + p2y) * 0.5;
    const dx = p2x - p1x, dy = p2y - p1y;
    return dx * dx + dy * dy;
  };

  const ptTri = (px, py, ax, ay, bx, by, cx, cy) => {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };

  // point vs the quad the seg swept through this frame: near either the
  // current or previous seg edge, or inside the swept area at all
  const swept = (jx, jy, S, r2) => {
    const s = S.seg, q = S.prev || s;
    if (ptSeg(jx, jy, s) < r2 || ptSeg(jx, jy, q) < r2) return true;
    return ptTri(jx, jy, s.ax, s.ay, s.bx, s.by, q.bx, q.by) ||
      ptTri(jx, jy, s.ax, s.ay, q.bx, q.by, q.ax, q.ay);
  };
  // seg-vs-seg across the frame: attacker's sweep against both of the
  // defender's endpoints
  const sweptSeg2 = (S, dW) =>
    Math.min(
      segSegDist2(S.seg, dW.seg),
      segSegDist2(S.prev || S.seg, dW.seg),
      segSegDist2(S.seg, dW.prev || dW.seg));

  return {
    ev,
    total,
    debug: { inSh, inCl, cd },
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

          // shield geometry first: any seg inside the disc is caught,
          // fast or slow - speed only decides how hard the block lands.
          // While caught the seg cannot reach anything behind the face.
          // The exit radius is wider than the entry radius so contact
          // jitter can't bounce the latch and machine-gun staggers.
          if (sh && sh.active &&
            swept(sh.x, sh.y, S, (inSh[a][k] ? sh.r * 1.45 : sh.r) ** 2)) {
            if (!inSh[a][k]) {
              inSh[a][k] = 1;
              ev.block++;
              total.blocks++;
              if (S.tipSpeed > 150 && T > cdc) {
                const tv = S.tipV;
                const d = Math.hypot(tv.x, tv.y) || 1;
                fx.burst(sh.x, sh.y, 14, -tv.x / d, -tv.y / d, 260 + S.tipSpeed * 0.3, spark);
                def.blockStagger((tv.x / d) * (moving ? 0.6 : 0.3), (tv.y / d) * (moving ? 0.6 : 0.3));
                def.drainStam(TUNE.drainBlock);
                cd[a][k] = T + CD;
                ev.power = S.tipSpeed;
              }
            }
            continue;
          }
          inSh[a][k] = 0;

          // steel on steel: an enemy blade held in the swing's path
          // deflects it - any held blade counts, parked or moving. A
          // bare fist has no blade to lock and slips under the guard.
          const defHeld = !W || def.faintT > 0 ? [] : [def.W, def.dual ? def.W2 : null];
          let locked = false;
          for (const dW of defHeld) {
            if (!dW || dW.spec.bare || dW.state !== "held") continue;
            const rr = inCl[a][k] ? CLASH_R * 1.9 : CLASH_R;
            if (sweptSeg2(S, dW) < rr * rr) {
              locked = true;
              if (!inCl[a][k]) {
                inCl[a][k] = 1;
                ev.clash++;
                total.clashes++;
                if (S.tipSpeed > 150 && T > cdc) {
                  const tv = S.tipV;
                  const d = Math.hypot(tv.x, tv.y) || 1;
                  const mag = moving ? 1 : 0.5;
                  fx.burst(cp.x, cp.y, 12, -tv.x / d, -tv.y / d, 240 + S.tipSpeed * 0.3, spark);
                  atk.deflect((-tv.x / d) * mag, (-tv.y / d) * mag, S === atk.W2);
                  def.deflect((tv.x / d) * mag, (tv.y / d) * mag, dW === def.W2);
                  atk.drainStam(TUNE.drainClash);
                  def.drainStam(TUNE.drainClash);
                  cd[a][k] = T + CD;
                  ev.power = S.tipSpeed;
                }
              }
              break;
            }
          }
          if (!locked) inCl[a][k] = 0;
          else continue; // blades stay tangled until the seg slides clear
          if (!moving) continue; // contact, not damage - it never crossed

          // blade or knuckle contact - swept, so a fast tip can't tunnel
          for (const jn of HIT_JOINTS) {
            const j = def.J[jn];
            if (swept(j.x, j.y, S, HIT_R * HIT_R)) {
              const tv = S.tipV;
              const d = Math.hypot(tv.x, tv.y) || 1;
              def.applyHit(j.x, j.y, S.tipSpeed * S.dmg, tv.x / d, tv.y / d, S.spec.cut ?? 1, S.spec.floor ?? TUNE.dmgFloor);
              cd[a][k] = T + CD;
              ev.hit++;
              total.hits++;
              ev.power = S.tipSpeed;
              break;
            }
          }
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
          for (const jn of HIT_JOINTS) {
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
