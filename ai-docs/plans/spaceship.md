# Spaceship (working title: Voidrunner)

First-person 6DOF space game rendered entirely in particles. The cockpit is
a dense particle structure pinned to the camera. Space is a sparse particle
starfield. Ships, gates, rocks, bolts, and pickups are entity particle
clusters in their own layer. Two loops: endless gate racing first, then
dogfighting that reuses the same world machinery.

Files: `space.html`, `src/pages/space.js`. Hub card: "Voidrunner".

## The core trick

One field, one render pass. `field.frame` writes `home`/`hcol` for every
particle every frame from the game state. The director is not used; the
game IS a scene writer. Camera transform per particle:

```js
v = R(cam)^-1 * (world - cam)          // view space
home = [cx + v.x * f / v.z, cy - v.y * f / v.z, depthScale(v.z)]
```

`home.z` feeds the engine's perspective term, so near points draw big, far
points draw small. Homing spring gives camera motion free smoothing; tune
`CFG.spring`/`dampHome` per page or use `snap` for crisp tracking.

## Particle layers (index ranges, one field)

| Group | Share of N | What it is | Palette |
|-------|-----------|------------|---------|
| cockpit | ~700 | canopy struts, dash band, reticle; fixed view-space points near z~perspZ | ink/warm |
| stars | ~2500 | sparse far points on a sphere shell around the track | dim |
| course | ~2500 | gate rings + rock clusters, each an anchored entity | mist/sky |
| entities | ~2000 | enemy ships, bolts, pickups; pooled ranges | accent hostile-red, pickups green/gold |
| fx | remainder | explosion/splash spill | accent |

Bodies are static design-space point lists rigidly transformed by their
anchor each frame, same pattern as the koi plan's fish. Cockpit gets an
inverse-velocity sway offset so it feels weighted; on damage it jitters
and sheds particles that fall as fx then recycle.

## Data shapes

```js
Cam    = { x, y, z, vx, vy, vz, yaw, pitch, roll }
Entity = { kind, x, y, z, vx, vy, vz, yaw, pitch, lo, hi, body, alive, hp }
Gate   = { z, x, y, r, passed }        // ring of ~120 particles on the track axis
Pickup = { kind: "boost"|"health"|"shield", x, y, z, taken }
Run    = { score, best, lives, speed, dist, phase: "race"|"fight"|"over" }
```

Entity allocator: fixed index ranges per entity kind; dead entities
release their range back to the pool and their particles to drift.

## Controls

W/S thrust fwd/back, A/D strafe, R/F up/down, arrows pitch up/down + yaw
left/right, Q/E roll, Shift boost, Space fire (fight mode), drift on Ctrl
(cut thrust, keep velocity, rotate free - Squadrons drift). Mouse optional
aim later.

## Loop 1: endless gate racing

- Gates spawn ahead along -z at increasing spacing. Fly through the ring:
  +score, +combo. Clip the ring edge or a rock: crash = cockpit burst +
  shake, lose a life, brief invulnerability fade.
- Missing a gate costs nothing but the combo.
- Speed ramps with distance; difficulty = gate radius shrink + rock
  density up.
- Lives: 3. Game over screen: score, best (localStorage), name entry for a
  local top-10 scoreboard, restart key.
- Track is a gentle wandering corridor (sine offsets in x/y) so steering
  matters beyond threading rings.

## Loop 2: dogfighting

- Same camera/layers. Enemy ships own particle ranges, fly simple AI:
  approach, strafe run, break off, re-engage.
- Bolts: short-lived entities spawned at cockpit wingtips along view
  forward; enemy bolts tinted hostile. Hit test = coarse sphere vs anchor.
- Enemy death: its particle range releases to drift with outward impulse.
  Disintegration is free.
- Enemies drop pickups: boost refill, health (repairs a life/shield
  segment), shield motes (visible orbit ring around the cockpit layer).
  Pickups magnetize to the camera inside a radius; press-hold extends the
  pull (built-in capture physics).
- Getting shot shakes the cockpit layer and burns shield motes first, then
  health, then a life.

## Build steps

1. [DONE] Page scaffold + camera math: starfield layer streaming past on WASD,
  arrows tilting. Prove parallax feels right before any gameplay.
2. [DONE] Cockpit layer: struts + dash + reticle, velocity sway.
3. [DONE] Gate entities + pass/miss/clip detection + score/lives/combo + crash
  sequence + speed ramp.
4. [DONE] Game over + localStorage scoreboard + restart.
5. [DONE] Rocks/debris entities on the corridor.
6. [DONE] Bolts + fire input + sphere hit tests.
7. [DONE] Enemy ship bodies + AI state machine + death scatter.
8. [DONE] Pickups + magnetize + boost/health/shield effects.
9. [DONE] Balance pass, mobile N tuning, hub card flip.

## Open questions

- Tracking mode: spring homing is the default (free motion smoothing on a
  fast camera). If it reads as input lag or mush, flip the world groups to
  `snap`-per-frame for crisp tracking. Build the switch in from step 1.
  -> built: T toggles spring/snap at runtime, persisted in `space.track`.
- Flocking jitter on packed cockpit/entity particles: probably reads as
  ship vibration (good). If it reads as noise, per-group flocking disable
  needs a small engine flag.
  -> resolved: `noFlock[]` on cockpit/gates/rocks/ships/bolts/pickups. No
  engine change needed.
- Cockpit at near z: check `pointMaxH`/`perspMin` don't blow up point size;
  may need a z clamp for the cockpit group.
  -> resolved: cockpit sits at home.z = 3.2 (d ~1.5x), safely under max.
- Lives model shared across both loops or separate? Probably: shields->
  health->life shared, racing crashes skip the shield.
  -> implemented exactly so: hit() burns shield->hull, hull hit 0 costs a
  life; race crashes call loseLife() directly.
