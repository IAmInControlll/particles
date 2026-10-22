// fish.js - koi bodies: teardrop member baking, chased spine, home writer.
import { PF } from "../../engine/index.js";

const S = 8; // spine joints; sx[0] is pinned to the anchor
const WAG_LEN = 2.6; // wag wave travel length along the body, in t units
const MAX_TURN = 2.4; // rad/s
const MIN_SPD = 0.3; // xu/s
const MAX_ACC = 2.4; // xu/s^2
const FLASH_DECAY = 2.4; // /s
const EXCITE_DECAY = 1.2; // /s

const WHITE = [0.9, 0.92, 0.88];
const ORANGE = [1.0, 0.45, 0.15];
const GOLD = [1.0, 0.75, 0.25];
const BLACK = [0.08, 0.08, 0.1];

// koi archetypes cycled per fish: (station t, h2, h3) -> rgb
const KINDS = [
  (t, h2) => (Math.sin(t * 7.3 + h2 * 2.4) > 0.15 && h2 > 0.3 ? ORANGE : WHITE), // kohaku patches
  () => GOLD, // ogon
  (t, h2, h3) => (h3 > 0.85 ? BLACK : WHITE), // bekko speckle
  (t, h2) => (h2 > 0.78 ? GOLD : ORANGE), // orange
];

export function makeFish(field, lo, hi, kind) {
  const f = {
    lo, hi, kind: kind % KINDS.length,
    x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0,
    owned: new Int32Array(0), n: 0, placed: false,
    S, segLen: 0,
    sx: new Float32Array(S), sy: new Float32Array(S), lag: new Float32Array(S),
    bodyT: null, bodyL: null, bodyW: null, bodyZ: null, baseCol: null,
    z: -2, zBase: -2, zTarget: -2,
    size: 0, cruise: 0, maxSpd: 0, wagAmp: 0,
    wagPhase: PF.rnd() * 6.283, wagFreq: 5.5 + PF.rnd() * 3,
    flash: 0, excitement: 0, target: null,
    turnW1: 0.35 + PF.rnd() * 0.5, turnW2: 0.2 + PF.rnd() * 0.45,
    turnP1: PF.rnd() * 6.283, turnP2: PF.rnd() * 6.283,
  };
  // head joint tracks tight, tail whips loose
  for (let k = 1; k < S; k++) f.lag[k] = 0.85 - (0.35 * (k - 1)) / (S - 2);
  return f;
}

// Unit-scaled quantities + member arrays. Reserve-filtered owned list is
// rebuilt here so a resize can rebake without a second boot path.
export function layoutFish(f, field, unit) {
  f.size = 0.17 * unit;
  f.segLen = 0.125 * unit;
  f.wagAmp = 0.05 * unit;
  f.maxSpd = (0.5 + 0.4 * field.h2(f.lo)) * unit;
  f.cruise = 0.62 * f.maxSpd;
  let n = 0;
  for (let p = f.lo; p < f.hi; p++) if (!field.reserve[p]) n++;
  if (n !== f.n) {
    f.owned = new Int32Array(n);
    f.bodyT = new Float32Array(n);
    f.bodyL = new Float32Array(n);
    f.bodyW = new Float32Array(n);
    f.bodyZ = new Float32Array(n);
    f.baseCol = new Float32Array(n * 3);
    const colFn = KINDS[f.kind];
    for (let j = 0, p = f.lo; p < f.hi; p++) {
      if (field.reserve[p]) continue;
      // ~30% of members crowd the head station, rest fill the body
      const t = PF.rnd() < 0.3 ? PF.rnd() * 0.2 : PF.rnd();
      f.bodyT[j] = t;
      const l = PF.rnd() - PF.rnd(); // triangular: disc fill, not rim
      f.bodyL[j] = l;
      f.bodyZ[j] = (field.h3(p) - 0.5) * 0.3;
      const c = colFn(t, field.h2(p), field.h3(p));
      f.baseCol[j * 3] = c[0];
      f.baseCol[j * 3 + 1] = c[1];
      f.baseCol[j * 3 + 2] = c[2];
      f.owned[j] = p;
      j++;
    }
    f.n = n;
  }
  for (let j = 0; j < n; j++)
    f.bodyW[j] = f.size * Math.sin(Math.PI * Math.pow(f.bodyT[j], 0.8));
}

export function initSpine(f) {
  const c = Math.cos(f.heading), s = Math.sin(f.heading);
  for (let k = 0; k < f.S; k++) {
    f.sx[k] = f.x - c * f.segLen * k;
    f.sy[k] = f.y - s * f.segLen * k;
  }
}

// Anchor kinematics: ctx.steer (px/s^2) -> velocity -> heading -> position,
// then the chased-constraint spine. No allocation; all arrays live on f.
export function stepFish(f, ctx) {
  const dt = ctx.dt, u = ctx.unit;
  let ax = ctx.steer.x, ay = ctx.steer.y;
  const aMax = MAX_ACC * u, a2 = ax * ax + ay * ay;
  if (a2 > aMax * aMax) {
    const k = aMax / Math.sqrt(a2);
    ax *= k; ay *= k;
  }
  f.vx += ax * dt;
  f.vy += ay * dt;
  let spd = Math.hypot(f.vx, f.vy);
  const sMax = f.maxSpd * (1 + 0.6 * f.excitement), sMin = MIN_SPD * u;
  if (spd > sMax) {
    f.vx *= sMax / spd; f.vy *= sMax / spd;
    spd = sMax;
  } else if (spd < sMin) {
    if (spd < 1e-3) {
      f.vx = Math.cos(f.heading) * sMin;
      f.vy = Math.sin(f.heading) * sMin;
    } else {
      f.vx *= sMin / spd; f.vy *= sMin / spd;
    }
    spd = sMin;
  }
  f.speed = spd;
  const want = Math.atan2(f.vy, f.vx);
  let dh = want - f.heading;
  if (dh > Math.PI) dh -= 6.2832;
  else if (dh < -Math.PI) dh += 6.2832;
  const mt = MAX_TURN * dt;
  f.heading += dh > mt ? mt : dh < -mt ? -mt : dh;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  const m = 0.45 * u;
  if (f.x < -m) f.x = -m;
  else if (f.x > ctx.W + m) f.x = ctx.W + m;
  if (f.y < -m) f.y = -m;
  else if (f.y > ctx.H + m) f.y = ctx.H + m;
  f.wagPhase += dt * f.wagFreq * (0.5 + spd / sMax);
  f.flash = Math.max(0, f.flash - FLASH_DECAY * dt);
  f.excitement = Math.max(0, f.excitement - EXCITE_DECAY * dt);
  f.z += (f.zTarget - f.z) * Math.min(1, 3 * dt);

  const sx = f.sx, sy = f.sy, lag = f.lag, L = f.segLen;
  sx[0] = f.x; sy[0] = f.y;
  for (let k = 1; k < S; k++) {
    const dx = sx[k - 1] - sx[k], dy = sy[k - 1] - sy[k];
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-4) d = 1e-4;
    const tx = sx[k - 1] - (dx / d) * L, ty = sy[k - 1] - (dy / d) * L;
    if (d > 3 * L) {
      sx[k] = tx; sy[k] = ty; // teleport recover after drag-stretch
    } else {
      sx[k] += (tx - sx[k]) * lag[k];
      sy[k] += (ty - sy[k]) * lag[k];
    }
  }
}

// Spine station lerp + lateral normal + wag traveling wave + flash tint.
export function writeFishHomes(f, ctx) {
  const home = ctx.field.home, hcol = ctx.field.hcol;
  const sx = f.sx, sy = f.sy, own = f.owned, n = f.n;
  const hx = Math.cos(f.heading), hy = Math.sin(f.heading);
  const fl = f.flash, ac = PF.PAL.accent;
  const wa = f.wagAmp, wp = f.wagPhase;
  for (let j = 0; j < n; j++) {
    const t = f.bodyT[j];
    const s = t * (S - 1);
    let k = s | 0;
    if (k > S - 2) k = S - 2;
    const uu = s - k;
    const bx = sx[k] + (sx[k + 1] - sx[k]) * uu;
    const by = sy[k] + (sy[k + 1] - sy[k]) * uu;
    let tx = sx[k + 1] - sx[k], ty = sy[k + 1] - sy[k];
    const tl = Math.sqrt(tx * tx + ty * ty);
    if (tl < 1e-3) { tx = hx; ty = hy; } // degenerate joint: fall back to heading
    else { tx /= tl; ty /= tl; }
    const lat =
      f.bodyL[j] * f.bodyW[j] + wa * t * t * Math.sin(wp - t * WAG_LEN);
    const i = own[j] * 3;
    home[i] = bx - ty * lat;
    home[i + 1] = by + tx * lat;
    home[i + 2] = f.z + f.bodyZ[j];
    const j3 = j * 3, br = f.baseCol[j3], bg = f.baseCol[j3 + 1], bb = f.baseCol[j3 + 2];
    hcol[i] = br + (ac[0] - br) * fl;
    hcol[i + 1] = bg + (ac[1] - bg) * fl;
    hcol[i + 2] = bb + (ac[2] - bb) * fl;
  }
}
