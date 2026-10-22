# Requests: Koi Pond

## Engine gaps

- **Un-homed particles have no z restoring force.** `repelZ` pushes water
  particles to +z on hover, and nothing pulls them back (the drift/flow
  branch only writes fx/fy). Splashes permanently brighten the wake.
  RESOLVED: `zReturn` now springs un-homed particles back to z=0.
- **Click-vs-hold disambiguation needs a press gate.** The engine sets
  `mouse.down` on pointerdown, so a quick feed-click still pulls for the
  duration of the press. RESOLVED: `pullDelay` gates pull/capture until a
  press outlives it, and `field.mouse.pressing` exposes the armed state.
- **Touch holds need a synthetic `extraWell`.** Engine never sets
  `mouse.down` for touch pointers. RESOLVED: `touchPull` lets touch
  presses pull/capture through the same `mouse.down`/`pressing` path.

## Hub integration

- [x] hub card: Koi Pond -> pond.html (page exists and boots clean;
  `home.js` is outside pond ownership so the card line itself is the
  hub owner's to add: `{ name: "Koi Pond", desc: "feed the fish, hold to
  pull them", href: "pond.html" }`)

## Shared helpers

- None added. `src/creations/pond/pointer.js` (verb machine + water-only
  impulses over `!homed`) is a candidate for `src/lib/` if a second
  creation wants subset pointer forces.

- **`field.exclude` rects accumulate a glowing edge shell.** Exclusion
  pushes interior particles to the nearest edge, but the force ends
  exactly at the boundary - drifters settle into a stable 1px line riding
  the edge, and additive blending draws the whole rect as a bright
  outline ("random rectangle" artifact). The hub menu and any
  exclude-user with ambient drift will hit this. The pond enforces a
  minimum outward speed on riders in a margin band outside each rect
  (`EDGE_BAND`/`EDGE_KICK` in `src/creations/pond/index.js`) so they
  transit through and drift off; a purely tangential shove just
  circulates them around the whole perimeter (tried it - two glowing
  rectangles instead of edge lines). An engine-side fix would extend the
  exclusion force past the boundary or damp tangentially at it.

## Status update (all three gaps landed)

- `pullDelay` + `touchPull` landed in the engine. The veto-then-arm gate
  and the synthetic touch `extraWell` were removed from
  `src/creations/pond/index.js`; click classification still runs page-side
  but on sim time (`field.T`) so it cannot disagree with the arm gate.
  `pond.js` sets `pullDelay: 0.24` and `touchPull: true`.
- `zReturn` landed; the per-frame un-homed z-decay loop was removed.
- `reserveEvery` now defaults to 0; `pond.js` opts in with 8.
- Hub card is live in `src/pages/home.js`.

## Redesign (interaction + fuzz)

- **Fuzz root cause:** the size distribution, not `repelZ`. Probe after a
  cursor sweep showed 3 of 9000 particles above z=0.3 while ~2400 water
  particles had `size > 1.3` (`sizeVar` + `bigChance`/`bigBoost` +
  `leaderBoost` under `pointScale`). Fixed in `tintWater`: water indices
  clamp to `size 0.8` and clear `leader`, so every path that creates
  water (boot, pellet retire) keeps the fine-speckle look. Fish/pellets
  keep their variance for texture; pellets bump to `size 1.25` on
  activation so food reads over the calmer water.
- **Engine pointer forces are off page-wide** via
  `field.mouseZone = () => false`; all water verbs live in
  `src/creations/pond/pointer.js` (IDLE/PRESS/DRAG/HOLD on `field.T`).
  `mouseZone` was sufficient - no engine gap. If a second creation ever
  wants "pointer forces on un-homed particles only," a per-well
  `affects(p)` predicate or a homed-aware CFG flag would be the
  engine-side version; the pond's page-side scans are the workaround.
- `field.mouse.speed` is xu per reference frame, not xu/s - multiply by
  180 before comparing to per-second thresholds (`ctx.mSpeed`).

## Water physics + coverage (water.js)

- **Coverage root cause:** un-homed particles were independent, not a
  medium. `spawnSpread: 1.4` parked ~14% of the water budget offscreen at
  boot with no way back, `driftPull` biased density ~2:1 toward a
  wandering center point, and pure random walk left 35-45 of 144 coarse
  cells empty at any moment. Fixed by coupling particles through fields:
  `driftPull: 0`, a coarse density/pressure/PIC grid for leveling, and a
  fine wave heightfield for visible rings.
- **Sim shape:** grid A (half-xu cells) scatters density + velocity,
  blurs into `pres`, and gathers `-grad(p)` plus a viscosity relax toward
  cell velocity (drag momentum lives in `jetx/jety` overlays so wakes
  stay coherent). Grid B (eighth-xu cells) is a `h`/`hv` heightfield:
  verbs stamp gaussians, `C2*laplacian` propagates real rings, and every
  free particle (fish members too) gets `vel -= grad(h)*WG`. Fish are
  pushed again via spine joints so bodies deform gently, then homes are
  rewritten for recohesion.
- **Boundary: periodic wrap, full stop.** Every wall variant failed
  empirically before this: a spring let ~1900 particles park offscreen; a
  specular mirror landed the whole crossing flux in one ~10px strip and
  fed a rim faster than pressure could drain it; a scattered landing band
  just moved the pile inward; border pressure ghosts and no-slip cell
  clamping damped the shoreline into sediment. The largest hidden pump
  was the wave sponge: damping `h` toward 0 in the two rings inside the
  border made `|h|` systematically low at the edge, so `-grad(h)` pushed
  water *out* through any wall (~2000 particles at steady state). Removed
  - the border is Neumann/mirrored now, so waves reflect physically.
  With particles wrapping `x%W`/`y%H` and `pgx/pgy` computed on wrapped
  neighbor indices, there is no boundary to pile against: measured
  edge:mid density ~0.87-0.99, ~30 particles in one-frame wrap transit,
  zero empty probe cells, mobile clean.
- `PK` must beat the flow-noise equilibrium push (~0.25 px/ref-frame) or
  the leveling force loses to diffusion; 0.9 does. `VMAX` caps water at
  3.5 px/ref-frame, which also bounds how far past an edge a particle
  can fly before the wrap catches it.
- **Engine note:** the wrap is page-side because `field.frame` runs
  before integration, so crossings are always caught next frame. A
  `bounds: "wrap" | "reflect" | "none"` field option would be the
  engine-side version if another free-particle creation wants it.

## Fish count control + tap read

- **Fish slots are fixed at boot** and `setFish(n)` only toggles
  `f.active` plus `homed`/`noFlock` on an invariant span. Inactive
  members are plain water (`tintWater`), so all `!homed` water loops
  pick them up for free - no repartitioning, no index reshuffle
  mid-sim. Activation restores member `size` (tintWater had capped it
  to 0.8); deactivation retints as water and releases any pellet claim.
- **`maxFish` is budget-derived, not fixed**: floor((N - pellets -
  0.32*N) / fishSlice) = 13 desktop / 9 mobile. Fish can only be added
  until the water budget runs out - "unlimited" would starve the pond
  to a bare field of koi. `pond.html` shows a `- count +` stepper;
  button targets are exempt from `canPull`, so count clicks never drop
  pellets.
- **Fish looks are randomized per slot**: `kind` picked from the four
  koi palettes, plus `sizeMul`/`lenMul` body variance, per-channel
  `colJit` palette jitter, wag/turn personality jitter, `hunger`
  (feeding appetite), and `pat` - two rolled [center, width] blotches
  along the spine that the patterns share. Koi pass: silhouette got a
  caudal stem + tail fluke (`bodyW` pinches past t~0.82 then fans out),
  ~8% of members ride pectoral fins past the flank, snout-edge members
  bake dark as eyes, and markings are smooth blotches (membership bent
  by lateral coord, hash-ragged edges) instead of per-particle speckle
  - showa uses the two blotches as separate orange/white patches on
  black, bekko confines its speckles to blotch interiors.
- **Splash and pellet are decoupled.** `plip` (burst + wave stamp +
  ctx.splash/startle) fires on pointerdown, so contact ripples
  instantly; `drop` (pellet) fires on pointerup only for a still,
  sub-holdMs press. Drags and holds ripple the water at the touch
  point but drop no food. Earlier: feed-on-release lagged by the whole
  press duration; feed-on-down dropped pellets at drag starts.
- **One pellet feeds one fish.** A pellet carries `claim`; only an
  unclaimed pellet can become a target (`pellets.freeNearest`), and a
  fish claims it with probability `hunger * (0.15 + 0.85*(1 - d/R))`
  per second within NOTICE_R = 2.2xu - a close hungry fish usually
  bites, a far or indifferent one may never bother. The claim dies
  with the pellet, the fish's deactivation, or a stolen slot. The old
  code targeted `pellets.nearest` unconditionally, so every fish in
  range converged on the same pellet.
- **Tap read, two lessons.** (1) Displacement alone is below the
  speckle noise floor - the crest needs a rendered signal: gather maps
  `h` into `size` swell on crests plus asymmetric z lift/dip (`ws0`
  stores boot sizes so `SIZE_K` recovers to baseline). (2) Amplitude
  overshoots fast: the crater+crest+slap+echo build stamped a ~1xu pit
  that evacuated a screen-scale disc visible for ~8s. `HDAMP` 0.996
  gives waves a ~0.9s half-life. A pit+slap plip still read heavy - ANY
  negative h / downward hv makes every particle the expanding front
  sweeps take a z-dip, darkening a ~350px disc. Taps stamp ONLY a
  positive crest ring (0.5xu at 0.28xu radius) - a brightening front,
  no trough, no disc. `stampV` was deleted with the slap; burst shove
  0.08 over 0.55xu.

## Collisions / notes

- **Plan z-sign corrected.** The plan says "fish sit at z > 0 so they dim
  and shrink"; the shader maps z > 0 to *nearer/brighter*
  (`d = perspZ/(perspZ - aP.z)`). Built with fish homes at z < 0
  (-1.4..-2.6 xu staggered per fish), pellets at z = +0.4, water at 0.
  `home[i+2]` is in xu units, not px.
- `snap[p]` is cleared before `field.frame` runs, so event-driven
  teleports must defer into the frame hook - pellets carry a `pending`
  flag for this.
- `homed` defaults to 1 for all N with `home` zeroed; any un-owned index
  needs an explicit `homed = 0` boot pass or it springs to the origin.
- Reserves inside entity slices drift (kept `homed=0` + water tint) -
  they read as flecks crossing bodies rather than holes.
- Multi-touch edge accepted: a second touch pointer takes over the
  tracked press (first finger's release is ignored). Single-finger use
  is unaffected.
