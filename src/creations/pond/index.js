// index.js - koi pond: index partition, boot passes, pointer wiring, pipeline.
import { PF } from "../../engine/index.js";
import { makeFish, layoutFish, initSpine, stepFish, writeFishHomes } from "./fish.js";
import { evalSteer, pickCurious } from "./steer.js";
import { makePellets } from "./pellets.js";
import { makeWater } from "./water.js";
import { makePointer } from "./pointer.js";

const WATER = [0.085, 0.25, 0.29]; // dim teal, per-particle jittered
const NOTICE_R = 2.2; // xu, how close a fish must be to notice food
const SURFACE_Z = -0.9; // fish rise toward the pellet plane while seeking
const WATER_SIZE = 0.8; // cap water speckle size - the fat sprites read as fuzz
const EDGE_BAND = 0.5; // xu margin outside pads where riders get shed
const EDGE_KICK = 1.1; // xu/s outward speed enforced inside the band
const EDGE_SHOVE = 0.5; // xu/s^2 tangential slide while transiting

export function createPond(field, opts = {}) {
  const N = field.N;
  const nPel = opts.pelletSlots ?? 6, pSlice = opts.pelletSlice ?? 32;
  const fSlice = opts.fishSlice ?? 450;
  // the + button can push fish until the water budget runs out: inactive
  // slots drift as water, so maxFish is the point where every slot active
  // still leaves ~a third of the field as water
  const minWater = Math.round(N * 0.32);
  const maxFish =
    opts.maxFish ??
    Math.max(1, Math.floor((N - nPel * pSlice - minWater) / fSlice));
  // all maxFish slots are built at boot; nAct of them swim, the rest are
  // borrowed water until setFish activates them
  const nFish = Math.max(0, Math.min(maxFish, opts.fish ?? 6));
  let nAct = nFish;
  // a press shorter than this is a feed tap, longer is a hold; the
  // classifier runs on sim time (field.T) inside pointer.js
  const holdMs = opts.holdMs ?? 240;
  const clickSlop = opts.clickSlop ?? 10;

  // partition from the end so water stays a contiguous prefix
  const pelLo = N - nPel * pSlice;
  const fishLo = pelLo - maxFish * fSlice;
  const { homed, hcol, col, reserve, noFlock, size, leader } = field;

  const tintWater = (p, hard) => {
    const i = p * 3, j = 0.55 + 0.7 * field.h3(p);
    hcol[i] = WATER[0] * j;
    hcol[i + 1] = WATER[1] * j;
    hcol[i + 2] = WATER[2] * j;
    if (size[p] > WATER_SIZE) size[p] = WATER_SIZE;
    leader[p] = 0; // leaderBrighten pops water flecks out of the surface
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
  for (let k = 0; k < maxFish; k++) {
    const lo = fishLo + k * fSlice;
    const f = makeFish(field, lo, lo + fSlice);
    f.active = k < nFish;
    for (let p = lo; p < f.hi; p++) {
      if (reserve[p]) continue;
      if (f.active) {
        homed[p] = 1;
        noFlock[p] = 1;
      } else {
        homed[p] = 0;
        tintWater(p, true);
      }
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

  const pads = (opts.pads || []).map(() => ({ l: 0, t: 0, r: 0, b: 0 }));

  const ctx = {
    T: 0, dt: 0, unit: field.unit, W: innerWidth, H: innerHeight,
    mx: -9e3, my: -9e3, mSpeed: 0, calmT: 0,
    splash: { x: 0, y: 0, t: -9 },
    steer: { x: 0, y: 0 },
    field, fishes, pellets, pads, tintWater,
  };
  const water = makeWater(field, ctx);
  const pointer = makePointer(field, ctx, { pellets, water, holdMs, clickSlop });
  const world = { fishes, pellets, pads, water, ctx };

  // a programmatic feed resolves through the same tap path as a click
  const feed = (x, y) => pointer.tap(x, y);

  // per-fish placement: position seed, heading, z tier by current active
  // count, spine init. Runs from layout() on first layout and from
  // setFish() on activation - reactivated members drifted as water, so
  // f.placed=false always lands back here for a fresh spine.
  const placeFish = (f, k) => {
    f.placed = true;
    f.x = ctx.W * (0.15 + 0.7 * ((k * 0.618 + 0.2) % 1));
    f.y = ctx.H * (0.18 + 0.64 * field.h1(f.lo));
    f.heading = field.h2(f.lo) * 6.2832;
    f.vx = Math.cos(f.heading) * f.cruise;
    f.vy = Math.sin(f.heading) * f.cruise;
    f.z = f.zBase = f.zTarget =
      nAct > 1 ? -1.4 - (1.2 * k) / (nAct - 1) : -2;
    initSpine(f);
  };

  // setFish never calls layout(): water.layout() zeroes the wave field,
  // which would flatten every live ring
  const setFish = (n) => {
    n = Math.max(0, Math.min(maxFish, n | 0));
    nAct = n;
    for (let k = 0; k < maxFish; k++) {
      const f = fishes[k];
      if (k < n) {
        if (f.active) continue;
        f.active = true;
        f.placed = false;
        f.target = null;
        f.curious = false;
        for (let p = f.lo; p < f.hi; p++) {
          if (reserve[p]) continue;
          homed[p] = 1;
          noFlock[p] = 1;
          size[p] = 0.9 + 0.6 * field.h2(p); // tintWater capped it at WATER_SIZE
        }
        placeFish(f, k);
      } else if (f.active) {
        f.active = false;
        if (f.target && f.target.claim === f) f.target.claim = null;
        f.target = null;
        f.curious = false;
        for (let p = f.lo; p < f.hi; p++) {
          if (reserve[p]) continue;
          homed[p] = 0;
          noFlock[p] = 0;
          tintWater(p, false); // soft tint: dissolves back into pond
        }
      }
    }
    return n;
  };
  world.setFish = setFish;
  world.maxFish = maxFish;

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
    for (let k = 0; k < maxFish; k++) {
      const f = fishes[k];
      layoutFish(f, field, ctx.unit);
      if (!f.active) continue;
      if (!f.placed) {
        placeFish(f, k);
      } else {
        if (f.x > ctx.W) f.x = ctx.W * 0.9;
        if (f.y > ctx.H) f.y = ctx.H * 0.9;
      }
    }
    pellets.layout(ctx.unit);
    water.layout();
  };

  const step = (T, dt) => {
    ctx.T = T;
    ctx.dt = dt;
    ctx.unit = field.unit;

    // 1. pointer first: writes ctx.mx/my/mSpeed/calmT, resolves pending taps
    // (burst, wave stamp, pellet drop, splash stamp), then runs the verbs
    pointer.step(T, dt);

    // 2. pellets: pending drops snap here (inside field.frame), bob, retire
    pellets.step(T, dt, ctx);

    // 3-4. fish: curiosity picks, steer, integrate, spine, then write homes
    pickCurious(ctx);
    const notice2 = NOTICE_R * NOTICE_R * ctx.unit * ctx.unit;
    const noticeD = NOTICE_R * ctx.unit;
    for (const f of fishes) {
      if (!f.active) continue;
      if (f.target && (!f.target.active || f.target.claim !== f))
        f.target = null;
      // a nearby unclaimed pellet attracts with probability rate*dt, so a
      // close hungry fish usually bites and a far or indifferent one may
      // never bother. First claimer wins - one pellet feeds one fish.
      if (!f.target) {
        const p = pellets.freeNearest(f.x, f.y, notice2);
        if (p) {
          const d = Math.hypot(p.x - f.x, p.y - f.y);
          const rate = f.hunger * (0.15 + 0.85 * (1 - d / noticeD));
          if (PF.rnd() < rate * dt) {
            p.claim = f;
            f.target = p;
          }
        }
      }
      f.zTarget = f.target ? SURFACE_Z : f.zBase;
      evalSteer(f, ctx, ctx.steer);
      stepFish(f, ctx);
    }
    // water runs between stepFish and writeFishHomes so the wave field's
    // spine pushes land before homes are written from the joints
    water.step(T, dt);
    for (const f of fishes) {
      if (!f.active) continue;
      writeFishHomes(f, ctx);
    }

    // 5. shed pad edge-riders - the exclude rect ejects drifters to its
    // boundary where they pile into a glowing 1px shell; enforce outward
    // speed through a margin band so they transit through and drift off
    // (dormant: no pads)
    if (pads.length) {
      const pos = field.pos, vel = field.vel;
      const band = EDGE_BAND * ctx.unit, kick = EDGE_KICK * ctx.unit;
      const shove = EDGE_SHOVE * ctx.unit * dt;
      for (let p = 0; p < N; p++) {
        if (homed[p]) continue;
        const i = p * 3, jx = pos[i], jy = pos[i + 1];
        for (let z = 0; z < pads.length; z++) {
          const r = pads[z];
          const ox = Math.max(r.l - jx, 0, jx - r.r);
          const oy = Math.max(r.t - jy, 0, jy - r.b);
          if ((ox === 0 && oy === 0) || ox > band || oy > band) continue;
          const nx = ox > 0 ? (jx < r.l ? -1 : 1) : 0;
          const ny = oy > 0 ? (jy < r.t ? -1 : 1) : 0;
          // top the outward velocity up to kick so riders exit the band
          // instead of hovering on the boundary
          const inv = nx && ny ? 0.7071 : 1;
          const out = (vel[i] * nx + vel[i + 1] * ny) * inv;
          const add = (kick - out) * inv;
          if (add > 0) {
            vel[i] += nx * add;
            vel[i + 1] += ny * add;
          }
          if (oy > 0) vel[i] += (jx < (r.l + r.r) * 0.5 ? -shove : shove);
          if (ox > 0) vel[i + 1] += (jy < (r.t + r.b) * 0.5 ? -shove : shove);
        }
      }
    }
  };

  layout();
  return { step, layout, feed, setFish, maxFish, world };
}
