# Koi pond

Interactive pond scene. Water is a free-drifting particle layer that ripples
under the cursor. Koi are particle clusters that swim, deform under touch,
and always recohere. Feeding pellets draw fish to the click point.

Files: `pond.html`, `pond.js`. Hub card: "Koi Pond".

## Why it fits the engine

"Movable but not breakable" is exactly what homed particles do: their home
targets re-evaluate every frame, so disturbance only deforms the cluster and
the spring pulls it back. A fish never breaks because it has no fixed
geometry, only moving targets.

## Data shapes

```js
Fish = {
  x, y, heading, speed, turnBias,   // anchor state, updated per frame
  lo, hi,                           // particle index range it owns
  active,                           // inactive slots swim as water
  size,                             // body scale
  kind, sizeMul, lenMul, colJit,    // randomized per-fish look
  wagPhase,
}
Pellet = { x, y, born, amount }
Pad    = { l, t, r, b }             // lily pad / rock exclude zone
```

The fish body is a static design-space point list. A procedural teardrop
first: half-width `sin(pi * t^0.8)` over `t in [0,1]`, denser head blob,
sparse tail. Rasterized koi silhouette is a later upgrade.

## Per-frame pipeline (inside `field.frame`)

1. Update anchors: wander noise on heading, separation between fish, avoid
   pads, steer toward nearest live pellet within a sniff radius, gentle
   center pull so fish stay in view.
2. For each fish particle `i` in `[lo, hi)`: `home[i] = anchor +
   rot(bodyOffset[j] * size, heading)`, plus lateral tail-wag
   `sin(T * freq + bodyX[j])`. Set `hcol` from the fish palette (orange,
   white, black speckle via `field.h1(i)`).
3. Water particles stay un-homed but are not independent: `water.js`
   steps two grids each frame - a coarse density/pressure/PIC field that
   levels coverage and carries drag momentum, and a fine heightfield that
   propagates real rings. Water wraps at screen edges (periodic
   boundaries); waves reflect (Neumann border).
4. Pointer verbs stamp the water fields instead of scripting rings: tap
   drops a gaussian bump (stone), drag writes a trench + momentum jet
   (hand), hold stirs a swirl dipole, calm hover holds a dimple.

Fish sit at `z > 0` so they dim and shrink under the surface water layer at
`z = 0`. Subsurface look for free.

## Interactions

Revised model (post-review): engine pointer forces are OFF page-wide
(`field.mouseZone = () => false`); water verbs are pond code in
`pointer.js`, acting on `!homed` particles only. Fish are never touched
by pointer physics - they react through steering alone.

- Hover: nothing to water. Fish personality does the work - a fast or
  close cursor triggers distance-decayed shy-away; a calm cursor for
  ~0.8s draws in up to 2 idle fish to watch from a polite ring
  (`pickCurious` + `curious` row).
- Tap (quick still press): food drop - one pellet plus a small plip
  ring on water (crest reads via size swell + z lift, not raw motion).
  Nearby fish may claim the pellet - probability scales with distance
  and per-fish `hunger`, first claimer wins, one pellet feeds one fish.
  A brief startle dart hits fish right at the splash point.
- Drag: hand through water - jet along the path, lateral part, and a
  counter-rotating flank wake behind the hand; fast drags pace trail
  rings by distance.
- Long still hold: gentle tangential swirl stirring at the cursor.
- Lily pads / rocks: exclude zones; water slides around them, anchors
  steer. Disabled in `pond.js` after review (see build step 5).

## Build steps

- [x] 1. Page scaffold (`pond.html` + `pond.js`, field boot, register hub card).
  Hub card is pending in `ai-docs/requests/pond.md` - `home.js` is owned by
  another agent, so the card line is the owner's to add.
- [x] 2. Anchors: N fish swimming wander + separation + center pull, no bodies.
- [x] 3. Body clusters: homes written per frame from anchors; teardrop point list.
- [x] 4. Tail-wag and per-fish palettes.
- [x] 5. Pads as exclude zones; anchor avoidance steering. Built and
  working, but disabled in `pond.js` (`opts.pads: []`) after review -
  exclude rects accumulate a bright particle shell on their boundary and,
  once shed, read as dead voids in the water. Mechanism stays in
  `index.js`/`steer.js` for a future shape that parts water more
  gracefully.
- [x] 6. Pellets: click, seek, arrive-flash, drain.
- [x] 7. Ripple rings on click.
- [x] 8. Polish: z-depth, ambient reserve layer, mobile N tuning.

Built beyond the letter of these steps: bodies ride an 8-joint chased spine
(bend on turns), steering is a weighted behavior table with fish
personality rows (shy/curious/startle), the interaction layer lives in
`pointer.js` (IDLE/PRESS/DRAG/HOLD verb machine on sim time), and water is
a real two-grid simulation in `water.js` rather than scripted rings. The
press gate, synthetic touch well, and z-decay workarounds were all retired
when the engine grew `pullDelay`/`touchPull`/`zReturn` - and pointer
forces are now fully page-side since `mouseZone` disables the engine's.
See `ai-docs/requests/pond.md` for the z-sign correction (fish sit at
z < 0, not z > 0 - the shader maps z > 0 to nearer/brighter) and the
coverage/boundary investigation that ended at periodic wrap.

## Open questions - resolved

- Fish count vs particle budget: all `maxFish` slots are partitioned at
  boot; the on-screen `-/+` stepper toggles `f.active` without
  repartitioning - inactive slots drift as water. `maxFish` is
  budget-derived (13 desktop, 9 mobile) so the + button stops where
  every active slot still leaves ~a third of the field as water.
- Flocking: bodies set `noFlock = 1` so neighbor forces can't jitter the
  clusters apart. Organic motion comes from the chase spine + tail wave
  instead. Could be re-evaluated - flocking might read as lively wiggle
  rather than noise at low `CFG.cohesion`.
- Anchors flee a held cursor (push), verified - bodies scatter under the
  pull, anchors swim off, everything recoheres on release. The stretch
  variant is a one-line flip (`flee` row weight to 0 in `steer.js`).
