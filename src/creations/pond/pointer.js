// pointer.js - all pointer interpretation for the pond. Owns the press
// listeners, the IDLE/PRESS/DRAG/HOLD verb machine, and the reduced
// direct-to-vel impulses that give taps and drags their immediate feel.
// The sustained surface response lives in water.js: taps stamp the wave
// field, drags trench it and jet its momentum grid, holds swirl both.
// Engine pointer forces are off page-wide via mouseZone; field.mouse
// still reports cursor state. vel units are px per 1/180s reference
// frame; impulses scale by dtf, the same convention water.js uses.
const IDLE = 0, PRESS = 1, DRAG = 2, HOLD = 3;
const PARK_T = 0.35; // s of stillness that flips DRAG back to HOLD
const DRAG_R = 1.1; // xu wake half-width around the drag segment
const DRAG_KEEP = 0.65; // direct drag impulse share; the grid carries the rest
const JET = 0.35; // fraction of cursor speed pushed along the path
const LAT = 0.5; // sideways part strength, same units
const WAKE = 0.4; // wake gain behind the hand
const WAKE_BACK = 0.6; // wake's back-flow share vs its out-flow
const SEGV_CAP = 1.2; // xu per ref frame, caps flick impulses
const BURST_R = 0.55; // xu tap splash radius
const BURST = 0.08; // px per ref frame tap shove; immediate plip under the ring
const CALM_SPD = 0.15; // xu/s under which the cursor reads as still

export function makePointer(field, ctx, { pellets, water, holdMs, clickSlop }) {
  field.mouseZone = () => false;
  const press = {
    down: false, x: -9e3, y: -9e3, x0: 0, y0: 0,
    t0: 0, lastMoveT: 0, moved: 0, touchId: -1,
  };
  const plip = { pending: false, x: 0, y: 0 }; // water splash on contact
  const drop = { pending: false, x: 0, y: 0 }; // pellet, tap releases only
  let verb = IDLE, px = 0, py = 0;

  addEventListener("pointerdown", (e) => {
    if (!field.canPull(e)) return;
    if (e.pointerType === "touch") press.touchId = e.pointerId;
    press.down = true;
    press.x = press.x0 = e.clientX;
    press.y = press.y0 = e.clientY;
    press.t0 = press.lastMoveT = field.T;
    press.moved = 0;
    // any touch ripples the water right away - drags and holds get the
    // plip too, it's just not food
    plip.x = e.clientX;
    plip.y = e.clientY;
    plip.pending = true;
  });
  addEventListener("pointermove", (e) => {
    if (!press.down) return;
    if (press.touchId >= 0 && e.pointerId !== press.touchId) return;
    press.x = e.clientX;
    press.y = e.clientY;
    const dx = press.x - press.x0, dy = press.y - press.y0;
    const m = Math.sqrt(dx * dx + dy * dy);
    if (m > press.moved) press.moved = m;
    press.lastMoveT = field.T;
  });
  const release = () => {
    press.down = false;
    press.touchId = -1;
  };
  addEventListener("pointerup", (e) => {
    if (press.touchId >= 0 && e.pointerId !== press.touchId) return;
    // a press that never left PRESS (still, quick) is a feed tap
    if (press.down && (field.T - press.t0) * 1000 < holdMs && press.moved < clickSlop) {
      drop.x = press.x;
      drop.y = press.y;
      drop.pending = true;
    }
    release();
  });
  addEventListener("pointercancel", release);
  addEventListener("blur", release);

  const burstPass = (x, y, dtf) => {
    const { pos, vel, homed, capt } = field, N = field.N;
    const r = BURST_R * field.unit, r2 = r * r;
    const imp = BURST * dtf;
    for (let p = 0; p < N; p++) {
      if (homed[p] || capt[p]) continue;
      const i = p * 3;
      const dx = pos[i] - x, dy = pos[i + 1] - y;
      if (dx > r || dx < -r || dy > r || dy < -r) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1e-4) continue;
      const d = Math.sqrt(d2), k = (1 - d2 / r2) * imp;
      vel[i] += (dx / d) * k;
      vel[i + 1] += (dy / d) * k;
    }
  };

  const dragPass = (mx, my, dtf) => {
    const sx = mx - px, sy = my - py;
    const len2 = sx * sx + sy * sy;
    if (len2 < 1e-6) return;
    const { pos, vel, homed, capt } = field, N = field.N;
    const u = field.unit;
    const len = Math.sqrt(len2);
    const dirx = sx / len, diry = sy / len;
    const prx = -diry, pry = dirx;
    let segV = len / dtf; // cursor speed in px per ref frame
    const cap = SEGV_CAP * u;
    if (segV > cap) segV = cap;
    water.trench(px, py, mx, my, segV);
    segV *= DRAG_KEEP;
    const r = DRAG_R * u, r2 = r * r;
    const xl = Math.min(px, mx) - r, xr = Math.max(px, mx) + r;
    const yt = Math.min(py, my) - r, yb = Math.max(py, my) + r;
    for (let p = 0; p < N; p++) {
      if (homed[p] || capt[p]) continue;
      const i = p * 3;
      const x = pos[i], y = pos[i + 1];
      if (x < xl || x > xr || y < yt || y > yb) continue;
      const qx = x - px, qy = y - py;
      const a = qx * dirx + qy * diry; // px along the path; <0 is behind the hand
      const s = qx * prx + qy * pry;
      let d2;
      if (a < 0) d2 = a * a + s * s;
      else if (a > len) { const w = a - len; d2 = w * w + s * s; }
      else d2 = s * s;
      if (d2 > r2) continue;
      const fall = (1 - d2 / r2) * segV;
      const sn = s < 0 ? -1 : 1;
      const jet = JET * fall, lat = LAT * fall;
      vel[i] += dirx * jet + prx * sn * lat;
      vel[i + 1] += diry * jet + pry * sn * lat;
      if (a < 0) {
        // behind the hand: back-flow plus flank-signed out-flow, so the two
        // sides rotate against each other like a real wake
        const wk = WAKE * fall;
        vel[i] += -dirx * wk * WAKE_BACK + prx * sn * wk;
        vel[i + 1] += -diry * wk * WAKE_BACK + pry * sn * wk;
      }
    }
  };

  const step = (T, dt) => {
    const m = field.mouse;
    ctx.mx = m.x;
    ctx.my = m.y;
    // engine mouse.speed is xu per ref frame; xu/s = speed * 180
    ctx.mSpeed = m.speed * 180;
    ctx.calmT =
      !press.down && m.x > -9e3 && ctx.mSpeed < CALM_SPD ? ctx.calmT + dt : 0;
    const dtf = Math.max(0.25, Math.min(3, dt * 180));

    if (plip.pending) {
      plip.pending = false;
      burstPass(plip.x, plip.y, dtf);
      water.tap(plip.x, plip.y);
      const sp = ctx.splash;
      sp.x = plip.x;
      sp.y = plip.y;
      sp.t = T;
    }
    if (drop.pending) {
      drop.pending = false;
      pellets.drop(drop.x, drop.y);
    }

    if (!press.down) verb = IDLE;
    else if (verb === IDLE) {
      verb = PRESS;
      px = m.x;
      py = m.y;
    } else if (verb === PRESS) {
      if (press.moved > clickSlop) { verb = DRAG; px = m.x; py = m.y; }
      else if (T - press.t0 >= holdMs / 1000) verb = HOLD;
    } else if (verb === HOLD) {
      if (press.moved > clickSlop) { verb = DRAG; px = m.x; py = m.y; }
    } else if (T - press.lastMoveT > PARK_T) verb = HOLD;

    if (press.down && m.x > -9e3) {
      if (verb === DRAG) dragPass(m.x, m.y, dtf);
      else if (verb === HOLD) water.swirl(m.x, m.y, dtf);
      px = m.x;
      py = m.y;
    } else if (m.x > -9e3) {
      // a resting cursor dimples the surface; motion fades the pit out.
      // a fresh splash disturbs it, so the pit holds off nearby while the
      // tap ring is still radiating
      const amp = 1 - ctx.mSpeed / CALM_SPD;
      if (amp > 0) {
        const sp = ctx.splash, rr = 1.2 * field.unit;
        const dx = m.x - sp.x, dy = m.y - sp.y;
        if (T - sp.t > 1.0 || dx * dx + dy * dy > rr * rr)
          water.dimple(m.x, m.y, amp);
      }
    }
  };

  const tapAt = (x, y) => {
    plip.x = drop.x = x;
    plip.y = drop.y = y;
    plip.pending = drop.pending = true;
  };

  return { step, tap: tapAt };
}
