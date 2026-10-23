# Engine contract

How to use the particle engine. Read this before building any creation.

## The rule

**Never edit `src/engine/*`.** The engine is finished machinery; creations
plug into it through the public surface below. If you need a capability it
doesn't have, stop and flag it to the owner - do not patch the engine to
fit. Do not import from `src/engine/field.js`, `core.js`, or `director.js`
directly; the only legal import is:

```js
import { PF } from "../engine/index.js";
```

`window.PF` is the same object, for console debugging only.

## What the engine is

A WebGL point-sprite field of N particles (`opts.N`, default 9000 desktop /
4000 mobile). Per frame it integrates spring homing, flocking, drift-flow,
pointer-well forces, and exclusion rects over typed arrays, then draws all
N as additive circular sprites with perspective depth fade and hot cores.

The mental model: **you write `home[]`/`hcol[]` targets, the engine makes
reaching them beautiful.** Springs, damping, stagger, fling physics, and
the render are its job; targets are yours.

## Boot pattern

```js
import { PF } from "../engine/index.js";

Object.assign(PF.CFG, { /* per-page overrides */ });
const field = PF.createField({ N: 9000 });
field.frame = (T, dt) => { /* write home/hcol before integration */ };
field.start();
```

`field.frame(T, dt)` runs once per physics step, *before* integration.
That is your entire insertion point for most creations. `T` is sim seconds;
`dt` is the real step. CFG overrides at boot are per-page - each page is a
separate module realm, nothing leaks between pages.

## The public surface

### `PF.CFG`

Every tunable constant lives here (see `src/engine/core.js` for the full
list). Mutate keys at boot or live; all take effect immediately except the
few baked into shaders at `initGL` (`perspZ`, `perspMin`, `pointMinPx`) -
call `field.recompile()` after changing those. Keys are grouped: render
(`pointScale`, `depthFade`, `coreGain`, `twinkle`, `bg`, `additive`), homing
(`spring*`, `damp*`), flocking (`cohesion`, `align`, `separation`, `neigh*`),
drift (`flow*`, `driftPull`, `zReturn`), pointer (`repel*`, `pull*`,
`pullDelay`, `touchPull`, `captureR`, `horizon*`, `orb*`, `discTilt`,
`fling*`), transitions (`transSpeed`, `transStagger`, `directorDur`),
init (`N` sizing helpers, `reserveEvery`, `leaderChance`, `spawnSpread`).

Notables: `pullDelay` (seconds) gates pull/capture until a press outlives
it - set ~0.15 to make clicks never tug particles. `touchPull` lets touch
presses pull/capture like the mouse. `zReturn` springs un-homed
particles back to z=0 so `repelZ` lifts recover. **z sign:** `pos`/`home`
z is in xu units (not px); positive z = nearer = larger, brighter sprite
(`d = perspZ / (perspZ - z)`).

### `PF.PAL`

`{ink, mist, sky, accent, dim, hot}` - each an `[r,g,b]` 0..1 array. Write
these into `hcol[]`; `accent` is the capture-well tint, `hot` is the
event-horizon/heat color.

### Field state (typed arrays, index `i = p * 3`)

| Array | Type | Meaning |
|-------|------|---------|
| `pos`, `vel` | f32 x3 | current state; write `vel` for impulses |
| `col` | f32 x3 | rendered color (eases toward `hcol`) |
| `home`, `hcol` | f32 x3 | targets you write in `field.frame` |
| `homed` | u8 | 1 = spring toward `home`, 0 = drift/free |
| `snap` | u8 | 1 = teleport to `home` this step (auto-cleared) |
| `capt` | u8 | 0 = free, `w+1` = captured by `wells[w]` |
| `leader`, `reserve` | u8 | init-set style flags |
| `noFlock` | u8 | 1 = exempt from neighbor forces (rigid bodies) |
| `noWell` | u8 | 1 = immune to all pointer wells - no repel, pull, or capture; the flag for particles that draw rather than interact |
| `solid` | f32 | 0 = additive glow, 1 = opaque paint, in between mixes. Read only when `CFG.additive = false` (set at boot, or call `field.recompile()`). Opaque particles occlude in index order: lower index draws first, so allocate backgrounds low and foregrounds high |
| `size` | f32 | per-particle size target (set 0 to despawn) |
| `stag` | f32 | transition stagger depth |

### Field objects and hooks

- `field.exclude` - array of `{l, t, r, b}` px rects. Targets clamp out,
  particles get pushed out. Menus, lily pads, arena walls.
- `field.drift = {x, y}` - where un-homed particles pool toward.
- `field.extraWells` - push `{x, y, down, tint?}` for remote/synthetic
  cursors. Same repel/pull/capture physics as the mouse; `tint` overrides
  the accent color of particles that well captures. Set `x = -9e3` or
  remove the entry to disable; released wells fling their particles.
- `field.mouse` - the real cursor well: `{x, y, vx, vy, speed, down}`.
- `field.mouseZone(x, y)` - return false to gate pointer forces by region.
- `field.canPull(e)` - gate for LMB pull/capture; default skips clicks on
  interactive elements.
- `field.onResize` - hook after each resize/`unit` update.
- `field.unit` - physics length unit in px (`innerHeight / CFG.unitDiv`).
- `field.h1/h2/h3(p)` - stable per-particle hash in [0,1); pass the
  particle index `p` (it reads `ph[p*3]` internally). Use for per-particle
  variation (speckle, tilt, direction).
- `field.start() / field.stop()`, `field.recompile()`,
  `field.T` (sim seconds), `field.canvas`, `field.N`, `field.ok`.

### Pointer verbs - pick your lever

The engine splits pointer behavior into independent verbs. Combine the
switches; do not reach for the biggest hammer by default.

| You want | Do |
| --- | --- |
| Nothing reacts to the cursor | `field.mouseZone = () => false` |
| Hover repel yes, clicks dead | `field.canPull = () => false` |
| Pull/capture yes, no hover scatter | `PF.CFG.repelAmp = 0` (page override) |
| Only some particles immune | `field.noWell[p] = 1` on those indices |
| Gate by screen region | `field.mouseZone = (x, y) => inRegion(x, y)` |
| Touch can't pull, mouse can | leave `CFG.touchPull = false` |
| Custom verbs on a particle subset | `mouseZone = () => false`, then write `vel[]`/`home[]` yourself per frame (see `src/creations/pond/pointer.js`) |

### `PF` helpers

- `PF.pick(list, i, n, len?)` - uniform index into a point list for
  particle `i` of `n`. Always use this to scatter particles over a point
  list; never `list[i % list.length]` (clips when len > n, front-loads
  when len < n). Pass `len` when the list is a typed-array store whose
  valid prefix is shorter than `.length` (e.g. `pick(store, i, N,
  store.count)`).
- `PF.textPoints(text, opts)` - rasterize text to y-up design-space
  `[[x,y],...]` with `{pts, ext}`. Adaptive sampling keeps `pts.length`
  under `maxPoints`.
- `PF.ease(t)` - smoothstep. `PF.rnd()` seeded PRNG, `PF.reseed(s)` for
  deterministic replays. `PF.reduce` / `PF.setReduce(v)` for
  prefers-reduced-motion. `PF.isMobile()`.

### Director (optional - for scene-morph pages)

```js
const dir = PF.createDirector(field);
dir.register(name, fn, { box, boxFn, clock, px });
dir.play(name);            // staggered morph
field.frame = () => dir.homes();  // must be called every frame
```

- Scene fn: `fn(i, sceneLocalT, fieldT, outPos4, outCol3)` - write
  design-space xyz into `outPos[0..2]`, color into `outCol3`, set
  `outPos[3] = 1` to snap-teleport. `fn.ext = [w, h]` declares design
  bounds for viewport fitting; `fn.gain` scales color.
- `sc.px` = scene already outputs pixel coords (skip projection).
- `sc.pre` - per-frame hook, assign it on the object `register` returns.
- `dir.cur === -1` is free drift; `dir.play(name)` from drift captures
  positions and staggers in.
- Pages that write `home` directly in `field.frame` do NOT need a director
  (spaceship, fighter, koi - the game IS the scene writer).

## Idioms

- **Despawn a particle:** `homed[p] = 0; size[p] = 0;` dim `hcol[p*3..]`.
  Additive blending makes black invisible; it drifts off and the size ease
  shrinks it away.
- **Entity owns a slice:** `lo, hi` index range; each frame write that
  range's `home`/`hcol` from the entity's transform. Set `noFlock` for
  rigid shapes. On death, release the range to drift and recycle it.
- **Impulses:** add directly to `vel[]` (units: px per 1/180 s).
- **Config:** `Object.assign(PF.CFG, {...})` at boot before `createField`.

## Rules for builders

1. No engine edits. Missing capability = report it, don't graft it.
2. No new dependencies without asking. Plain ES modules, no build step.
3. No per-particle allocations inside `field.frame` or any per-frame loop -
   hoist arrays/objects to module scope and reuse.
4. Typed arrays only for hot-path state; plain objects for entities.
5. One field per page. Index-range ownership, not per-particle objects.
6. Keep `pos`/`vel` reads free of `Math.sqrt` where squared comparisons
   work (follow the engine's own style).
