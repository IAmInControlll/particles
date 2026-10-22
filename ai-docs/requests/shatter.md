# Requests: Shatter


## The mission

Endless forward-runner: the camera rides a fixed lane down a dark
particle corridor, taps throw pooled particle balls with real ballistic
(gravity + world-space hit tests), and glass panes shatter into engine
debris. Crystals pay +3/+5/+10 by tier and build a combo that fans
throws out to 5 balls per tap at the same ammo cost. SLOW dilates
world time only (balls stay live), FRENZY makes throws free, HEAVY
pierces a pane and splashes. Run ends on ammo 0; best persists in
`shatter.best`.

## Engine gaps

- None blocking. `field.canPull = () => false` plus `CFG.pullDelay 0.3`
  gave clean tap detection (down/up < 0.28s, < 10px travel) with zero
  pointer-verb interference; hover repel still works on everything.
- Per-particle twinkle is not possible - `CFG.twinkle` is shader-wide.
  Set low page-side (0.04) so rigid homed shapes don't shimmer;
  acceptable since the shatter flash carries the spectacle anyway.
- `home.z` doubles as sprite depth AND brightness - distant panes were
  near-invisible until `projectEnt` clamps real depth to `[-4, 1.5]`
  (same trick space uses for gates/ships). Documented, not patched.
- No engine-side screen-shake hook; done page-side in camera.js by
  jittering the projection basis (`cam.shake`, decays ~0.6s).

## Hub integration

- Page is linkable: `shatter.html` is a standalone entry loading
  `src/pages/shatter.js`. The hub owner adds the card in
  `src/pages/home.js` / `index.html` - I did not touch either.

## Shared helpers

- None added. Everything lives in `src/creations/shatter/`.
- Headless probe `src/creations/shatter/check.mjs` is self-contained
  (`node src/creations/shatter/check.mjs [scenario...]`; `tools/` was
  outside my write scope). Scenarios: boot, throw, run, shatter,
  crystal, collide, multi, powerups, restart. Screenshots land in
  `shots/shatter-*.png`.

## Collisions / notes

- localStorage: `shatter.best` (best score), `shatter.mute`.
- Score = distance + bonus (pane +30, crystal pay*10, pickup +40);
  `shatter.best` tracks the best score, not raw distance.
- Game over is a modal: TRY AGAIN button or R restarts - stray taps do
  NOT restart (pointerdown early-returns while phase is "over").
- The lane is near-straight on purpose (laneX/Y amplitude <= ~14wu):
  on a curved lane you can't tell whether a pane actually blocks you.
  Cam base speed 320 wu/s ramping to ~610 (ramp cap 0.9 at ~20km).
- `window.__shatter` exposes `{field, cam, run, layers, obs, balls, fx,
  auto, collide, onHit, throwAt}` for probes and console debugging.
- `__shatter.auto = true` is the autopilot used by the `run` scenario;
  it auto-aims at `obs.weakPoint(p)` / crystal centers and plays a full
  game to game-over (~19km, zero errors).
- One field, six disjoint index ranges (corridor/panes/crystals/balls/
  pickups/debris) - the shared mutable state is just `field.home/hcol/
  homed/snap/size` written in a fixed order each frame.
- `field.drift` is pinned to the camera basis each frame so released
  debris pools around the view center instead of a corner.
- Pointer verbs are fully off: `canPull = () => false` AND
  `mouseZone = () => false` - the cursor repels nothing, taps are only
  throws. Entity slices keep `noWell` on top as belt-and-braces.
- Levels tint by distance: `levels.js` exposes `lv.t` (3-mul), a hue
  band per ~4km (glacier -> cyan -> violet -> ember -> jade, lerped in
  over the first ~800m of each band). Corridor, pane fill/edge, and
  crystal hcol writes multiply by it; debris inherits the zone hue on
  release. Pickups keep their kind-coded colors and balls keep PAL.hot
  so gameplay reads stay constant.
- Budget is now N 15000 desktop / 5000 mobile (pond parity); all
  slices scale off fractions of N. Boot probe at 15k: ~4.9k live
  corridor points, 61 fps locked, zero errors.
- Balls are `homed=0` from spawn (true ballistic), recycled through the
  fx pool's parked state. Pane/crystal/pickup particles are `noFlock` +
  `noWell` rigid slices; release flips `homed=0` with an impulse.
- Restart resets `cam.z`/`cam.ramp` as well as run state - `run.dist`
  is derived from `-cam.z`, so forgetting the camera reset leaves the
  next run starting at the old distance (probed: `restart` scenario).
- Invulnerability gates `obs.check` entirely - during invuln panes pass
  through with no collision event (no -10, no combo reset). The crystal
  probe relies on this to isolate payout measurement.

## Balance pass (session 1)

- Tunnel reads via dense longitudinal rails (8 lanes) + sparse rings +
  dust, with a near/far luminance gradient. Earlier flat-bright lattices
  washed out; depth-shaded rails read as a corridor immediately.
- Difficulty ramp `cam.ramp = min(0.9, dist/20000)`: speed builds
  ~320->610 u/s over the first ~20km; the spawner mixes in
  angled/gap/descend/wall kinds past ~4km.
- Auto-played full run reaches ~10-12km on the starting 25 balls - the
  crystal economy (+3/5/10) roughly offsets the -10 collision penalty,
  so a competent player runs much longer.
