// steer.js - ordered weighted steering table. Each row writes a unit
// response (px/s^2) into a scratch vec; evalSteer accumulates w * tmp into
// out. Extension point: a new steering behavior is one table row.
const EAT_R = 0.35; // xu
const DRAIN = 0.34; // pellet amount /s while eaten
const SHY_R = 1.8; // xu
const SHY_SPD = 3; // xu/s cursor speed that maxes the scare
const POLITE_R = 1.1; // xu ring where a curious fish parks
const CURIOUS_R = 4; // xu
const CURIOUS_MAX = 2; // fish allowed to watch at once
const CURIOUS_KEEP = 1.4; // hysteresis: incumbents survive to 1.4 * CURIOUS_R
const STARTLE_R = 3; // xu
const STARTLE_T = 0.35; // s after a splash that fish bolt
const PAD_MARGIN = 0.35; // xu
const SEP_R = 1.1; // xu
const SEEK_GAIN = 4; // /s, pursuit stiffness toward desired velocity

function seek(f, c, o) {
  const p = f.target;
  const dx = p.x - f.x, dy = p.y - f.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1) return;
  const d = Math.sqrt(d2), u = c.unit;
  let vx, vy;
  if (d < EAT_R * u) {
    p.amount -= DRAIN * c.dt;
    f.flash = 1;
    f.excitement = 1;
    // orbit the food instead of parking on it
    vx = (-dy / d) * f.maxSpd * 0.85 + (dx / d) * f.maxSpd * 0.25;
    vy = (dx / d) * f.maxSpd * 0.85 + (dy / d) * f.maxSpd * 0.25;
  } else {
    f.excitement = Math.max(f.excitement, 0.5);
    const sp = Math.min(1.25, d / (0.9 * u)) * f.maxSpd;
    vx = (dx / d) * sp;
    vy = (dy / d) * sp;
  }
  o.x += (vx - f.vx) * SEEK_GAIN;
  o.y += (vy - f.vy) * SEEK_GAIN;
}

function shy(f, c, o) {
  const dx = f.x - c.mx, dy = f.y - c.my;
  const r = SHY_R * c.unit;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r || d2 < 1e-4) return;
  const d = Math.sqrt(d2), k = 1 - d / r;
  // a fast cursor scares from further out than a slow one
  const str = k * k * (2.0 + 3.0 * Math.min(c.mSpeed, SHY_SPD)) * c.unit;
  o.x += (dx / d) * str;
  o.y += (dy / d) * str;
  f.excitement = Math.max(f.excitement, k);
}

function curious(f, c, o) {
  const dx = c.mx - f.x, dy = c.my - f.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1) return;
  const d = Math.sqrt(d2), u = c.unit;
  // capped approach; desired speed fades to zero at the polite ring so the
  // fish parks and watches instead of nosing the cursor
  const over = (d - POLITE_R * u) / u;
  const sp = 0.5 * f.maxSpd * Math.min(1, Math.max(0, over));
  o.x += ((dx / d) * sp - f.vx) * SEEK_GAIN;
  o.y += ((dy / d) * sp - f.vy) * SEEK_GAIN;
}

function startle(f, c, o) {
  const dx = f.x - c.splash.x, dy = f.y - c.splash.y;
  const r = STARTLE_R * c.unit;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r || d2 < 1e-4) return;
  const d = Math.sqrt(d2);
  const str = (1 - d / r) * 9 * c.unit;
  o.x += (dx / d) * str;
  o.y += (dy / d) * str;
  f.excitement = 1;
}

function avoid(f, c, o) {
  const m = PAD_MARGIN * c.unit, u = c.unit;
  for (let e = 0; e < c.pads.length; e++) {
    const z = c.pads[e];
    if (f.x < z.l - m || f.x > z.r + m || f.y < z.t - m || f.y > z.b + m)
      continue;
    const dl = f.x - z.l, dr = z.r - f.x, dt = f.y - z.t, db = z.b - f.y;
    const mn = Math.min(dl, dr, dt, db);
    let nx = 0, ny = 0;
    if (mn === dl) nx = -1;
    else if (mn === dr) nx = 1;
    else if (mn === dt) ny = -1;
    else ny = 1;
    o.x += nx * 4.5 * u;
    o.y += ny * 4.5 * u;
    // keep tangential speed so the fish slides around the pad
    const vt = f.vx * -ny + f.vy * nx;
    o.x += -ny * vt * 0.8;
    o.y += nx * vt * 0.8;
  }
}

function separate(f, c, o) {
  const r = SEP_R * c.unit, r2 = r * r;
  for (let i = 0; i < c.fishes.length; i++) {
    const g = c.fishes[i];
    if (!g.active || g === f) continue;
    const dx = f.x - g.x, dy = f.y - g.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const str = (r / d - 1) * 2.2 * c.unit;
    o.x += (dx / d) * str;
    o.y += (dy / d) * str;
  }
}

function wander(f, c, o) {
  const a =
    Math.sin(c.T * f.turnW1 + f.turnP1) * Math.sin(c.T * f.turnW2 + f.turnP2);
  const h = f.heading + a * 1.1;
  o.x += (Math.cos(h) * f.cruise - f.vx) * 1.6;
  o.y += (Math.sin(h) * f.cruise - f.vy) * 1.6;
}

function center(f, c, o) {
  const ex = (f.x - c.W * 0.5) / (c.W * 0.42);
  const ey = (f.y - c.H * 0.5) / (c.H * 0.4);
  const e2 = ex * ex + ey * ey;
  if (e2 <= 1) return;
  const dx = c.W * 0.5 - f.x, dy = c.H * 0.5 - f.y;
  const d = Math.sqrt(dx * dx + dy * dy) + 1e-4;
  const str = Math.min(2.5, e2 - 1) * 1.6 * c.unit;
  o.x += (dx / d) * str;
  o.y += (dy / d) * str;
}

export const BEHAVIORS = [
  { name: "startle", w: 4.0, on: (f, c) => c.T - c.splash.t < STARTLE_T, fn: startle },
  { name: "shy", w: 3.2, on: (f, c) => c.mx > -9e3, fn: shy },
  { name: "avoid", w: 2.6, fn: avoid },
  { name: "seek", w: 2.2, on: (f) => !!f.target, fn: seek },
  { name: "curious", w: 1.8, on: (f) => f.curious, fn: curious },
  { name: "separate", w: 1.4, fn: separate },
  { name: "wander", w: 0.8, fn: wander },
  { name: "center", w: 0.5, fn: center },
];

// Once per frame. A still cursor over calm water draws the two nearest idle
// fish in to watch; any motion, press, or splash clears the flag.
export function pickCurious(ctx) {
  const fishes = ctx.fishes;
  if (ctx.calmT < 0.8) {
    for (let i = 0; i < fishes.length; i++) fishes[i].curious = false;
    return;
  }
  const mx = ctx.mx, my = ctx.my;
  const r2 = CURIOUS_R * CURIOUS_R * ctx.unit * ctx.unit;
  const keep2 = CURIOUS_KEEP * CURIOUS_KEEP * r2;
  let n = 0;
  for (let i = 0; i < fishes.length; i++) {
    const f = fishes[i];
    if (!f.active || !f.curious) continue;
    const dx = f.x - mx, dy = f.y - my;
    if (dx * dx + dy * dy > keep2) f.curious = false;
    else n++;
  }
  while (n < CURIOUS_MAX) {
    let best = null, bd = r2;
    for (let i = 0; i < fishes.length; i++) {
      const f = fishes[i];
      if (!f.active || f.curious || f.target) continue; // a feeding fish ignores you
      const dx = f.x - mx, dy = f.y - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = f; }
    }
    if (!best) return;
    best.curious = true;
    n++;
  }
}

const tmp = { x: 0, y: 0 }; // per-row scratch, reused every call
export function evalSteer(f, ctx, out) {
  out.x = 0;
  out.y = 0;
  for (let i = 0; i < BEHAVIORS.length; i++) {
    const b = BEHAVIORS[i];
    if (b.on && !b.on(f, ctx)) continue;
    tmp.x = 0;
    tmp.y = 0;
    b.fn(f, ctx, tmp);
    out.x += b.w * tmp.x;
    out.y += b.w * tmp.y;
  }
}
