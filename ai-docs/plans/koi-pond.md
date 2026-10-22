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
  size,                             // body scale
  palette,                          // per-fish koi coloring
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
3. Water particles stay un-homed (drift + flow). Cursor repel gives ripples
   for free.
4. Ripple rings: a click spawns `{x, y, r0}` expanding at fixed speed.
   Particles within a band of the front get a one-frame outward velocity
   impulse.

Fish sit at `z > 0` so they dim and shrink under the surface water layer at
`z = 0`. Subsurface look for free.

## Interactions

- Hover: water repels (ripples).
- Click: drop pellet + spawn ripple ring. Nearest fish steer to it; on
  arrival the cluster flashes accent and the pellet drains.
- Press-hold near a fish: particles scatter under pull, homes keep tracking
  the anchor, release recoheres (reads as a wriggle). Optional: anchors
  also flee a held cursor, so you push fish rather than tear them.
- Lily pads / rocks: exclude zones; water slides around them, anchors steer.

## Build steps

- [x] 1. Page scaffold (`pond.html` + `pond.js`, field boot, register hub card).
  Hub card is pending in `ai-docs/requests/pond.md` - `home.js` is owned by
  another agent, so the card line is the owner's to add.
- [x] 2. Anchors: N fish swimming wander + separation + center pull, no bodies.
- [x] 3. Body clusters: homes written per frame from anchors; teardrop point list.
- [x] 4. Tail-wag and per-fish palettes.
- [x] 5. Pads as exclude zones; anchor avoidance steering.
- [x] 6. Pellets: click, seek, arrive-flash, drain.
- [x] 7. Ripple rings on click.
- [x] 8. Polish: z-depth, ambient reserve layer, mobile N tuning.

Built beyond the letter of these steps: bodies ride an 8-joint chased spine
(bend on turns), steering is a weighted behavior table, click-vs-hold is a
veto-then-arm press gate, held touches get a persistent `extraWell`, and
un-homed water `pos.z` is decayed each step to counter the `repelZ` lift.
See `ai-docs/requests/pond.md` for the z-sign correction (fish sit at z < 0,
not z > 0 - the shader maps z > 0 to nearer/brighter).

## Open questions

- Fish count vs particle budget. Start 6 fish x ~400 particles on desktop.
- Built-in flocking runs on homed non-reserve particles and may add free
  organic wiggle to bodies, or may jitter them apart. Evaluate visually;
  per-group flocking disable would need an engine flag if it hurts.
- Whether anchors should flee a held cursor (push) or hold still (stretch).
  Try push first, it reads more alive.
