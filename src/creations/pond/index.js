// index.js - koi pond: index partition, boot passes, press gate, pipeline.
import { makeFish, layoutFish, initSpine, stepFish, writeFishHomes } from "./fish.js";
import { evalSteer } from "./steer.js";
import { makePellets } from "./pellets.js";
import { makeRipples } from "./ripples.js";

const WATER = [0.085, 0.25, 0.29]; // dim teal, per-particle jittered
const SNIFF_R2 = 2.6 * 2.6; // xu^2
const SURFACE_Z = -0.9; // fish rise toward the pellet plane while seeking
const Z_DECAY = 0.9; // per 1/60s on un-homed z (repelZ leak fix)

export function createPond(field, opts = {}) {
  const N = field.N;
  const nFish = opts.fish ?? 6, fSlice = opts.fishSlice ?? 450;
  const nPel = opts.pelletSlots ?? 6, pSlice = opts.pelletSlice ?? 32;
  const holdMs = opts.holdMs ?? 240, clickSlop = opts.clickSlop ?? 10;

  // partition from the end so water stays a contiguous prefix
  const pelLo = N - nPel * pSlice;
  const fishLo = pelLo - nFish * fSlice;
  const { homed, hcol, col, reserve, noFlock } = field;

  const tintWater = (p, hard) => {
    const i = p * 3, j = 0.55 + 0.7 * field.h3(p);
    hcol[i] = WATER[0] * j;
    hcol[i + 1] = WATER[1] * j;
    hcol[i + 2] = WATER[2] * j;
    if (hard) {
      col[i] = hcol[i];
      col[i + 1] = hcol[i + 1];
      col[i + 2] = hcol[i + 2];
    }
  };

  // boot order matters: reserves first, water, then entity ownership.
  for (let p = 0; p < N; p++) if (reserve[p]) homed[p] = 0;
  for (let p = 0; p < fishLo; p++) {
    homed[p] = 0;
    tintWater(p, true);
  }
  const fishes = [];
  for (let k = 0; k < nFish; k++) {
    const lo = fishLo + k * fSlice;
    const f = makeFish(field, lo, lo + fSlice, k);
    for (let p = lo; p < f.hi; p++)
      if (!reserve[p]) {
        homed[p] = 1;
        noFlock[p] = 1;
      }
    fishes.push(f);
  }
  const pelSpans = [];
  for (let k = 0; k < nPel; k++)
    pelSpans.push([pelLo + k * pSlice, pelLo + (k + 1) * pSlice]);
  const pellets = makePellets(field, pelSpans);
  for (const [lo, hi] of pelSpans)
    for (let p = lo; p < hi; p++) {
      homed[p] = 0;
      tintWater(p, true);
    }
  // reserves inside fish spans drift as water flecks crossing bodies
  for (let p = fishLo; p < pelLo; p++) if (reserve[p]) tintWater(p, true);

  const ripples = makeRipples(field);
  const pads = (opts.pads || []).map(() => ({ l: 0, t: 0, r: 0, b: 0 }));

  const press = { down: false, x: -9e3, y: -9e3, x0: 0, y0: 0, t0ms: 0, moved: 0, touchId: -1 };
  let touchWell = null; // one persistent extraWell, mutated, never spliced

  const ctx = {
    T: 0, dt: 0, unit: field.unit, W: innerWidth, H: innerHeight,
    armed: false, mx: -9e3, my: -9e3, steer: { x: 0, y: 0 },
    field, fishes, pellets, pads, mouse: field.mouse, tintWater,
  };
  const world = { fishes, pellets, pads, ripples, water: { lo: 0, hi: fishLo }, ctx };

  const feed = (x, y) => {
    pellets.drop(x, y);
    ripples.spawn(x, y);
  };

  // registered after createField's own handlers, so the veto lands after
  // the engine sets mouse.down
  addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      press.touchId = e.pointerId;
    } else {
      if (!field.canPull(e)) return;
      field.mouse.down = false; // veto until the press is classified
    }
    press.down = true;
    press.x = press.x0 = e.clientX;
    press.y = press.y0 = e.clientY;
    press.t0ms = performance.now();
    press.moved = 0;
  });
  addEventListener("pointermove", (e) => {
    if (!press.down) return;
    if (press.touchId >= 0 && e.pointerId !== press.touchId) return;
    press.x = e.clientX;
    press.y = e.clientY;
    const dx = press.x - press.x0, dy = press.y - press.y0;
    const m = Math.sqrt(dx * dx + dy * dy);
    if (m > press.moved) press.moved = m;
  });
  const release = () => {
    press.down = false;
    press.touchId = -1;
    if (touchWell) {
      touchWell.down = false;
      touchWell.x = -9e3; // well vanishes -> captured particles fling free
    }
  };
  addEventListener("pointerup", (e) => {
    if (press.touchId >= 0 && e.pointerId !== press.touchId) return;
    if (press.down && performance.now() - press.t0ms < holdMs && press.moved < clickSlop)
      feed(press.x, press.y); // quick still press = feed
    release();
  });
  addEventListener("pointercancel", release);
  addEventListener("blur", release);

  const layout = () => {
    ctx.W = innerWidth;
    ctx.H = innerHeight;
    ctx.unit = field.unit;
    (opts.pads || []).forEach((r, k) => {
      const p = pads[k];
      p.l = r.x * ctx.W;
      p.t = r.y * ctx.H;
      p.r = (r.x + r.w) * ctx.W;
      p.b = (r.y + r.h) * ctx.H;
    });
    field.exclude = pads; // same objects the avoid behavior reads
    for (let k = 0; k < nFish; k++) {
      const f = fishes[k];
      layoutFish(f, field, ctx.unit);
      if (!f.placed) {
        f.placed = true;
        f.x = ctx.W * (0.15 + 0.7 * ((k * 0.618 + 0.2) % 1));
        f.y = ctx.H * (0.18 + 0.64 * field.h1(f.lo));
        f.heading = field.h2(f.lo) * 6.2832;
        f.vx = Math.cos(f.heading) * f.cruise;
        f.vy = Math.sin(f.heading) * f.cruise;
        f.z = f.zBase = f.zTarget =
          nFish > 1 ? -1.4 - (1.2 * k) / (nFish - 1) : -2;
        initSpine(f);
      } else {
        if (f.x > ctx.W) f.x = ctx.W * 0.9;
        if (f.y > ctx.H) f.y = ctx.H * 0.9;
      }
    }
    pellets.layout(ctx.unit);
  };

  const step = (T, dt) => {
    // 1. classify the press: vetoed clicks arm only after holdMs; held
    // touches promote to the persistent synthetic well (engine never sets
    // mouse.down for touch)
    const held = press.down && performance.now() - press.t0ms >= holdMs;
    if (held && press.touchId < 0) field.mouse.down = true;
    ctx.armed = held;
    if (held && press.touchId >= 0) {
      if (!touchWell) {
        touchWell = { x: press.x, y: press.y, down: true };
        field.extraWells.push(touchWell);
      } else {
        touchWell.x = press.x;
        touchWell.y = press.y;
        touchWell.down = true;
      }
    }
    ctx.T = T;
    ctx.dt = dt;
    ctx.unit = field.unit;
    ctx.mx = press.touchId >= 0 ? press.x : field.mouse.x;
    ctx.my = press.touchId >= 0 ? press.y : field.mouse.y;

    // 2. pellets: pending drops snap here (inside field.frame), bob, retire
    pellets.step(T, dt, ctx);

    // 3-4. fish: steer, integrate, spine, then write homes
    const sniff2 = SNIFF_R2 * ctx.unit * ctx.unit;
    for (const f of fishes) {
      if (f.target && !f.target.active) f.target = null;
      if (!f.target) f.target = pellets.nearest(f.x, f.y, sniff2);
      f.zTarget = f.target ? SURFACE_Z : f.zBase;
      evalSteer(f, ctx, ctx.steer);
      stepFish(f, ctx);
    }
    for (const f of fishes) writeFishHomes(f, ctx);

    // 5. water housekeeping: drift-point wander + z-leak decay
    const md = Math.min(ctx.W, ctx.H) * 0.15;
    field.drift.x = ctx.W * 0.5 + Math.sin(T * 0.16) * md;
    field.drift.y = ctx.H * 0.5 + Math.sin(T * 0.11 + 1.7) * md;
    const zd = Math.pow(Z_DECAY, dt * 60), pos = field.pos, vel = field.vel;
    for (let p = 0; p < N; p++) {
      if (homed[p]) continue;
      const i = p * 3 + 2;
      pos[i] *= zd;
      vel[i] *= zd;
    }

    // 6. ripple fronts push everything in their band
    ripples.step(T, dt);
  };

  layout();
  return { step, layout, feed, world };
}
