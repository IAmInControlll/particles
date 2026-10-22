# Fighter (working title: Fray)

Two particle-built figures in a side-view duel. Keyboard moves the body,
the mouse drags your weapon arm. Bloody Bastards physics awkwardness, but
bodies are mutable matter: hits knock the struck region's particles loose
permanently. Health is literally how much of you is left.

Files: `fighter.html`, `src/pages/fighter.js`. Hub card: "Fray".

## Controls

- A/D or Left/Right: walk. W or Up: jump. S or Down: duck (crouches the
  spine, low profile, better footing).
- Mouse: the armed hand's target. Whip the cursor, the arm and weapon
  follow through the reach envelope around the shoulder. Swing speed is
  damage.
- LMB hold: lunge grip - small forward burst plus a tighter weapon grip.
  Release while whipping hard and the weapon can be thrown (and lost until
  walked over).
- Space: kick/shove (short-range stagger, buys space).

## Art direction

Stickman, but make it lethal. Each figure is sparse glowing motes tracing
bone segments: a ring of particles for the head, lines of particles down
each limb, denser knots at joints. The weapon is a blade of accent-colored
particles. Hits scatter motes like embers; a severed limb falls as a
trailing smear. Aim for the look of a stick-fight animation rendered in
embers and ink, not filled bodies.

## The puppet

Two-level sim. A cheap joint ragdoll does the flopping; particles do the
rendering.

```js
Fighter = {
  joints: { root, hip, chest, head, shElb, elbow, hand,
            kHip, knee, foot, /* per side */ },  // x, y, vx, vy each
  lo, hi,            // owned particle range
  side,              // facing
  mass,              // live particle count = health
  weapon: { pts, attachedTo: "hand", thrown, integrity },
}
```

- Joints verlet-integrate: gravity, floor clamp, distance constraints
  (thigh length, spine length), stagger impulses from hits.
- Each bone segment owns a thin line of particles along it (plus a head
  ring and joint knots), expressed as offsets from its joint pair. Homes =
  joint position + rotated offset, written per frame in `field.frame`.
  ~200-400 particles per figure reads great and leaves budget for
  scatter-fx.
- Duck/jump/walk are pose targets blended into the constraint solve.

## Damage

- Weapon particles are not tested pairwise. The weapon's moving segment is
  tested against enemy joint positions; on proximity, impact = hand
  velocity magnitude. Scales with swing speed, so whipping beats poking.
- A hit scatters particles near the impact point: those detach from the
  body permanently (they scatter, dim, despawn). Flesh lost is flesh gone.
- Each joint has integrity. Hits landing near a joint damage it; at zero
  the subtree severs - the whole limb releases and fades. A severed arm
  never comes back.
- Round ends when head or chest is destroyed, or mass falls below ~40%.
  Best of 3; bodies re-form fresh between rounds only.

## Enemy AI

Simple state machine: approach to reach, telegraphed windup (hand pulls
back - readable), swing, recover, occasional guard (hand held high),
retreat when badly maimed. Difficulty = swing speed, windup length, guard
frequency. Campaign later; one opponent archetype first.

## Arena

Floor line (joint clamp + floor friction), edge walls as exclude zones.
Sparse ambient particles for atmosphere. Maybe a raised platform later for
vertical play.

## Build steps

1. [x] Page scaffold + one puppet: joints, constraints, walk/jump/duck poses.
   Prove the puppet feels floppy and alive before combat.
2. [x] Weapon hand: mouse-target reach envelope, weapon cluster attached.
3. [x] Second puppet mirrored; walk-in-place AI that approaches.
4. [x] Hit detection + particle scatter + sever rules + permanent loss.
5. [x] Swing/damage tuning, stagger, kick, thrown weapons.
6. [x] AI attack/guard/retreat states.
7. [x] Rounds, best-of-3, HUD (mass remaining per fighter), hub card.
   HUD and rounds done; hub card pending in ai-docs/requests/fighter.md.

## Open questions

- Mouse-follow hand vs spring-drag hand. Follow is tighter; spring-drag
  (hand homes toward cursor with lag) is more BB-authentic floppy. Spring
  first, per the engine's default.
- Whether severed limb particles litter the floor briefly before fading.
  Probably yes, 2-3s, readable and gruesome.
- 2-player local is awkward (one mouse). Could do WASD-player vs a second
  mouse only on dual-input setups; skip for v1, AI opponent covers it.
- Reach envelope limits: too generous and it's god-hand; too tight and
  swings can't build momentum. Tune with a shoulder-orbit radius.
