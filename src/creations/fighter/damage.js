// damage.js - hit adjudication. A weapon's moving segment is tested
// against the enemy's joint positions; proximity times tip speed is the
// hit. Kicks shove instead. No pairwise particle tests anywhere.

const HIT_JOINTS = ["head", "chest", "sho", "elb", "kneeF", "kneeB", "root"];

export function createDamage(fighters, u) {
  const HIT_R = 0.15 * u;
  const MIN_V = 450; // px/s - a resting blade can jitter ~350; real swings run 700+
  const CD = 0.32; // per-attacker hit cooldown
  const cd = [0, 0];
  const kickLanded = [false, false];

  const ptSeg = (jx, jy, s) => {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const L2 = dx * dx + dy * dy || 1e-4;
    let t = ((jx - s.ax) * dx + (jy - s.ay) * dy) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = s.ax + dx * t - jx, qy = s.ay + dy * t - jy;
    return qx * qx + qy * qy;
  };

  return {
    step(T, dt) {
      for (let a = 0; a < 2; a++) {
        const atk = fighters[a], def = fighters[1 - a];
        if (!atk || !def || def.dead()) continue;

        // blade contact
        const W = atk.W;
        if (W.tipSpeed > MIN_V && T > cd[a]) {
          for (const jn of HIT_JOINTS) {
            const j = def.J[jn];
            if (ptSeg(j.x, j.y, W.seg) < HIT_R * HIT_R) {
              const tv = W.tipV;
              const d = Math.hypot(tv.x, tv.y) || 1;
              def.applyHit(j.x, j.y, W.tipSpeed, tv.x / d, tv.y / d);
              cd[a] = T + CD;
              break;
            }
          }
        }

        // kick: once per kick, while the leg is extended - any joint works
        if (atk.kickT > 0.1 && !kickLanded[a]) {
          const ft = atk.J.footF;
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
