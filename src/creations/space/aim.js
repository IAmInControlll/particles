// aim.js - 2D combat overlay: lead pips on hostiles, HP pips under the target
// box, and the reticle hit marker. One call from deck.frame, drawn in raw
// projected space (no canopy sway/roll) like the pickup tags.
const TAU = 6.2832;
const BOLT_BASE = 1150; // playerFire: fwd * (cam.speed + BOLT_BASE) + camV * 0.4
const MUZZLE = 16, RANGE = 1400, BOLT_LIFE = 1.7;

// aim direction (unit, in `u`) that lands a player bolt on ship s, or 0.
// The bolt keeps B along the aim axis plus 0.4 of the shooter's velocity, so
// with D = target - muzzle and w = target vel - 0.4 camV, |D + w t| = B t.
// Returns the flight time t (0 when no solution inside bolt life).
export function leadAim(cam, s, u) {
  const B = cam.speed + BOLT_BASE;
  const dx = s.x - cam.x - cam.fwd[0] * MUZZLE,
    dy = s.y - cam.y - cam.fwd[1] * MUZZLE,
    dz = s.z - cam.z - cam.fwd[2] * MUZZLE;
  const wx = s.vx - cam.vx * 0.4, wy = s.vy - cam.vy * 0.4, wz = s.vz - cam.vz * 0.4;
  const a = wx * wx + wy * wy + wz * wz - B * B;
  const b = 2 * (dx * wx + dy * wy + dz * wz);
  const c = dx * dx + dy * dy + dz * dz;
  if (a >= 0) return 0; // target outruns the bolt
  const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  if (!(t > 0) || t > BOLT_LIFE) return 0;
  const k = 1 / (B * t);
  u[0] = (dx + wx * t) * k; u[1] = (dy + wy * t) * k; u[2] = (dz + wz * t) * k;
  return t;
}

const FAR = 2500; // aim points project from far out so muzzle parallax vanishes
const u = [0, 0, 0];
const pip = { x: 0, y: 0 }; // last drawn pip, exposed for probes
export const aimState = { pip, tol: 0, on: false };

export function drawAim(g, cam, ent, W, H, blink) {
  const o = cam.out;
  g.save();
  g.globalAlpha = blink;
  aimState.on = false;
  // where a bolt fired right now actually flies: true fwd, not the chase eye
  const aimOk = cam.project(cam.x + cam.fwd[0] * FAR, cam.y + cam.fwd[1] * FAR, cam.z + cam.fwd[2] * FAR);
  const ax = o[0], ay = o[1];
  for (const s of ent.ships) {
    if (!s.alive) continue;
    const dx = s.x - cam.x, dy = s.y - cam.y, dz = s.z - cam.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > RANGE || dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2] < 40) continue;
    if (!cam.project(s.x, s.y, s.z)) continue;
    const sx = o[0], sy = o[1];
    // projected hit radius: view depth of the ship sets the pixel scale
    const tol = Math.max(7, s.K.hitR * cam.f / Math.max(40, d));
    if (leadAim(cam, s, u) && aimOk && cam.project(cam.x + u[0] * FAR, cam.y + u[1] * FAR, cam.z + u[2] * FAR)) {
      const px = o[0], py = o[1];
      const on = aimOk && Math.hypot(px - ax, py - ay) <= tol;
      g.strokeStyle = "rgba(255,130,112,.5)"; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(px, py); g.stroke();
      g.shadowColor = "#ff6a58";
      if (on) {
        g.shadowBlur = 8;
        g.fillStyle = "#ffffff";
        g.beginPath(); g.arc(px, py, 4.5, 0, TAU); g.fill();
        g.strokeStyle = "#ffc0b4"; g.lineWidth = 2.2;
        g.beginPath(); g.arc(px, py, 9, 0, TAU); g.stroke();
      } else {
        g.strokeStyle = "rgba(255,150,132,.9)"; g.lineWidth = 1.8;
        g.beginPath(); g.arc(px, py, 4.5, 0, TAU); g.stroke();
      }
      g.shadowBlur = 0;
      if (!aimState.on || on) { pip.x = px; pip.y = py; aimState.tol = tol; aimState.on = on; }
    }
    // hull pips: only once the ship has taken damage
    if (s.hp < s.hpMax) {
      const w = 9, gap = 3, tw = s.hpMax * (w + gap) - gap;
      const x0 = s.bx - tw / 2, y0 = s.by + 6;
      for (let i = 0; i < s.hpMax; i++) {
        const lit = i < s.hp;
        g.fillStyle = lit ? "#ffd0c8" : "rgba(255,140,124,.3)";
        g.fillRect(x0 + i * (w + gap), y0, w, 5);
      }
    }
  }
  // reticle hit marker; a kill is bigger, brighter, and lasts longer
  const m = ent.mark;
  if (m.t > 0) {
    const k = m.kill ? Math.min(1, m.t / 0.3) : Math.min(1, m.t / 0.15);
    const r0 = m.kill ? 9 : 5, r1 = m.kill ? 20 : 11;
    g.globalAlpha = blink * k;
    g.strokeStyle = m.kill ? "#ff9a8a" : "#ffffff";
    g.lineWidth = m.kill ? 3.4 : 2.4;
    g.shadowColor = g.strokeStyle; g.shadowBlur = m.kill ? 10 : 4;
    const cx = W / 2, cy = H / 2;
    g.beginPath();
    for (let sx = -1; sx <= 1; sx += 2)
      for (let sy = -1; sy <= 1; sy += 2) {
        g.moveTo(cx + sx * r0, cy + sy * r0);
        g.lineTo(cx + sx * r1, cy + sy * r1);
      }
    g.stroke();
  }
  g.restore();
}
