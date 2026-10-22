# Shatter

Endless forward-runner on rails. The camera flies a fixed path down a dark
particle corridor; tap to throw a ball that arcs into world space and
shatters pale glass panes before they reach you. Cold crystal clusters pay
ammo; pane collisions cost it. Everything visible is engine particles.

Files: `shatter.html`, `src/pages/shatter.js`, `src/creations/shatter/*`.
localStorage: `shatter.best`, `shatter.mute`.

## The core trick

Same world-to-home projection as space, cut to a rail camera: world is
+x right, +y up, camera travels toward -z at a fixed speed down a
near-straight lane (tiny sine drift only - a curved lane hides whether
a pane actually blocks you) with collision shake. No steering.

```js
v = world - cam                    // view space (fwd is -z, small pitch)
home = [cx + v.x * f / v.z, cy - v.y * f / v.z, depthClamp(v.z)]
```

`home.z` is clamped per layer so depth reads through sprite size without
crushing far geometry to sub-pixel (space's lesson): corridor deep,
obstacles mid, balls near. Rigid entities write `snap` every frame for
crisp tracking; the corridor rides the spring.

Debris impulses live in screen space: a pane releases its own particles
(`homed=0`) with a radial impulse from the projected hit point plus a
`vel.z` kick toward the viewer (positive z = nearer = growing sprite),
then gravity drags them down while `size`/`hcol` fade to parked.

## Particle layers (one field, index ranges)

| Group | Share | What it is | Flags |
|-------|-------|------------|-------|
| corridor | ~34% | tunnel lattice + drifting rings/columns/shards, deep z, dim | hover repel allowed |
| panes | ~24% | up to 5 live pane entities, baked rect stipple + edge lists | noFlock, noWell |
| crystals | ~10% | up to 4 live clusters, parametric solids, slow tumble | noFlock, noWell |
| balls | ~8% | pool of 8 in-flight clumps x ~40 pts | noFlock, noWell |
| pickups | ~6% | up to 3 power-ups, ring+glyph | noFlock, noWell |
| debris | ~18% | impact spills: ball-death sparks, collision burst, claim flash | free |

Budget N: 6000 desktop / 2500 mobile (`PF.isMobile`). Entity death releases
its own slice to drift with impulse - that IS the debris. The debris layer
only adds extra spill an entity doesn't own (muzzle spark, camera crash).

## Data shapes

```js
Cam     = { x, y, z, f, cx, cy, ox, oy, shake, swayT, K, NEAR,
            project(wx,wy,wz) -> out[sx,sy,hz] | false }
Pane    = { on, x, y, z, w, h, roll, tilt, descend, rects, lo, hi, deadT,
            kind, pts, edge0 }         // rects = solid local regions
Crystal = { on, x, y, z, r, tier, rotA, rotB, rotW, pts, lo, hi, deadT }
Pickup  = { on, kind, x, y, z, bob, pts, lo, hi }
Ball    = { on, x, y, z, vx, vy, vz, pierce, vol, pts, lo, hi }
Volley  = { live, hit }                // all balls thrown by one tap
Run     = { phase, ammo, thrown, dist, best, combo, multi, invuln,
            deadT, pow: {slow, frenzy, heavy} }
```

Spawn director: distance-keyed cadence table; obstacle z spacing shrinks
and speed rises on `ramp = 1 + min(0.6, dist * k)`. Pane kinds come from a
weighted table that unlocks with distance (single -> angled -> gap ->
descend -> wall+weak).

## Controls

pointerdown throws instantly toward the tapped point (release-gated
taps read as lag in a runner; the ball pool is the rate limiter).
`field.canPull = () => false` and `field.mouseZone = () => false` kill
every pointer verb - the cursor only throws. R restarts after game
over. M toggles mute. No drag verbs.

## Loop

- Start 25 balls. Tap throws `multi` balls (slight fan spread) for 1 ammo.
- Score = distance + bonus (pane +30, crystal pay*10, pickup +40);
  `shatter.best` persists the best score.
- Pane reaches camera intact over the lane point: collision = shake,
  -10 ammo, 2s invuln, combo reset. Camera passes through gaps safely.
- Ball crosses a pane's solid rect in pane-local space: pane shatters.
- Crystal hit: +3 small / +5 medium / +10 large, combo++. A volley that
  hits nothing resets combo; pane/powerup hits are neutral.
- `multi = min(5, 1 + combo/3)`: 2 balls/tap at combo 3, 5/tap at 12+.
- Pane kinds: single, angled (tilt), partial with gap, descending, wall
  with one weak panel sitting over the lane.
- Game over at ammo 0 (after in-flight balls settle): modal card with
  score, distance, thrown, best, TRY AGAIN button + R. Stray taps do
  not restart. `shatter.best` persists.

## Power-ups

Floating pickups on a ~25s cadence; shoot to claim.
- SLOW: world dt x0.5 for 6s (camera, spawns, pane/crystal motion). Balls
  integrate at real dt.
- FRENZY: throws cost 0 ammo for 8s.
- HEAVY: balls pierce one pane + splash radius damages neighbors for 10s.

## Audio

Lazily created AudioContext on first gesture. One-shot synths: throw
(noise pop), shatter (noise burst + glass chime), crystal (fm bell),
collision (low thud), powerup (two-note rise), game over. M mutes.

## Build steps

1. [x] Plan + scaffold: shatter.html, pages/shatter.js, rail camera,
   corridor lattice streaming past. Visual proof the tunnel reads.
2. [x] Corridor structures: rings, columns, shard clouds drifting by.
3. [x] Panes: spawn cadence, all five kinds, lane-relative placement,
   camera pass/collision detection.
4. [x] Balls: pool, tap-throw, ballistic arc, world-space hit tests.
5. [x] Shatter: pane release w/ radial+z impulse, gravity, fade, recycle.
   Tune until it reads violent.
6. [x] Crystals: tiers, tumble, payout, combo + multi-ball.
7. [x] HUD: ammo, distance, best, combo, flashes; game over + restart.
8. [x] Power-ups: three kinds, timers, HUD readout, 25s cadence.
9. [x] Audio one-shots + M mute.
10. [x] check.mjs: boot clean, tap throws, pane shatters (debris live),
    crystal payout, collision penalty, combo multi-ball, each power-up.
    window.__shatter debug handle + auto mode.
11. [x] Balance + mobile N pass, screenshots to shots/shatter-*.png,
    ai-docs/requests/shatter.md notes.

## Open questions

- Spring vs snap tracking for entities -> snap, per space's finding
  (spring trails rigid bodies a frame behind; reads as fuzz).
- Should a pane hit also break combo? -> no: pane/powerup hits are
  neutral, only a whiffed volley or a camera collision resets it.
- Ball trails? -> skipped; additive sprites already streak under motion.
- Floor bounce for missed balls? -> despawn at floor/far plane instead;
  keeps the pool churning and the read clean.
