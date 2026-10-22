# Requests: Koi Pond

## Engine gaps

- **Un-homed particles have no z restoring force.** `repelZ` pushes water
  particles to +z on hover, and nothing pulls them back (the drift/flow
  branch only writes fx/fy). Splashes permanently brighten the wake. The
  pond works around it by decaying `pos[i+2]`/`vel[i+2]` toward 0 over
  un-homed indices each step (`src/creations/pond/index.js`). An engine-side
  z-spring for un-homed particles (or a CFG flag) would retire the
  workaround. Any creation using `repelZ` + drift has this leak.
- **Click-vs-hold disambiguation needs a press gate.** The engine sets
  `mouse.down` on pointerdown, so a quick feed-click still pulls for the
  duration of the press. The pond vetoes `field.mouse.down` on pointerdown
  (its listener runs after the engine's) and re-arms it after a holdMs
  window inside `field.frame`. Fighter/spaceship will hit the same need -
  a CFG `pullDelay` (pull/capture suppressed until a press outlives N ms)
  would make it an engine feature instead of per-creation gates.
- **Touch holds need a synthetic `extraWell`.** Engine never sets
  `mouse.down` for touch pointers; hold-scatter on mobile requires pushing
  a persistent well object into `field.extraWells`. Works fine - just
  non-obvious (`capt[]` indexes wells by position, so mutate, never splice).

## Hub integration

- [x] hub card: Koi Pond -> pond.html (page exists and boots clean;
  `home.js` is outside pond ownership so the card line itself is the
  hub owner's to add: `{ name: "Koi Pond", desc: "feed the fish, hold to
  pull them", href: "pond.html" }`)

## Shared helpers

- None added. Candidate for `src/lib/`: the veto-then-arm press gate
  (click = X, hold = pointer verbs) once a second creation needs it.

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
