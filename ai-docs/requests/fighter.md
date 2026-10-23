# Requests: Fighter

## Engine gaps

None blocking. Everything needed was reachable through the PF surface:
`homed`/`size`/`hcol` for permanent loss, `noFlock` for rigid bodies,
`exclude` for arena walls, `mouse` for arm aiming, `unit` for scale, and
the `?t=` time warp for fast-forward verification. Page-side workarounds
used (no engine patch):

- Two-button input: the engine exposes a single `mouse.down`; Fray tracks
  LMB/RMB itself via pointer events (`contextmenu` suppressed page-side).
- Deflect sparks: permanent body loss can't come from an unbreakable
  shield, so `fx.js` owns a small reusable spark pool in its own slice.
- Shield blocking is a page-side segment-vs-disc test (`f.shield`
  surface vs weapon segment) before hit resolution.
- Arena is a static owned slice with negative-z homes; no engine scene
  involvement.

## Hub integration

- [x] hub card: "Fray" -> fighter.html

## Shared helpers

- `src/lib/verlet.js` - small generic verlet solver: points, distance
  constraints, per-point pull targets, floor/wall clamp, breakable links.
  Creation-agnostic; any creation needing rope/ragdoll/chain physics can
  use it.

## Mobile fallback

No second pointer button exists on touch. Degradation: a touch pointer
maps to LMB (tap-drag swings the weapon arm, release can throw), and the
shield stays in its stance guard - which is already the covering pose -
so it auto-guards without input. `PF.isMobile()` drops the field to
N=4500; owned slices use ~2630, leaving ambient headroom.

## Collisions / notes

- `field.mouseZone = () => false` on this page: the cursor is a pure game
  input (arm aim), so engine pointer forces are fully disabled.
- Fray sets `field.exclude` and `field.drift` every frame inside
  `field.frame`; ambient particles are the tail range after the arena/fx
  slices.
- localStorage keys: `fighter.best` (ladder streak record),
  `fighter.loadout` (last weapon/shield pick). The old `fighter.wins`
  career key is superseded by `fighter.best` and no longer written.
- `window.__fray` is exposed for headless checks, matching the
  `window.PF` debug convention. `src/creations/fighter/check.mjs` is a
  private playwright check (loadout, floor constraint, shield block,
  RMB shield drive, hits, kick, throw, ladder, gameover, re-ground
  after jump) - not part of tools/verify.mjs.

## Refinement notes (grounded/scene pass)

- Hover bug root cause: pull targets anchored to `J.root.y` feed back
  through the verlet links as lift (the torso chain pulls toward
  "root - offset", the constraints then drag the root up to meet them).
  Any body without feet planted floated at a spring-gravity equilibrium.
  Fix in `puppet.js`: airborne torso/arm pulls anchor to a fixed world
  height (the stance line), a 0.15s `airT` takeoff grace keeps the
  ground clauses from eating the jump impulse, and re-grounding accepts
  feet near the floor OR the root back inside a 0.3u slack band.
- The "particle storm" was the ambient drift tail clumping visibly
  mid-screen. The tail range is now homed as a static starfield via
  `arena.sky()` (owned, noFlock, snap), and the drift region moved below
  the floor line.
- Shield blocking surface: disc radius 0.22u centered 0.2u in front of
  the shield hand, so frontal strikes meet the shield before the arm.
- Loadout: picking a weapon/shield re-arms the player live behind the
  overlay (`armFighters` on each selection) and a stat line describes
  the weapon. Floating health bars (`.fbar` divs) track `mass/mass0`
  above each fighter's head every frame.

## Refinement notes (spear/dual/leap/crouch pass)

- Spear reach 0.85 -> 1.3u (2.1x the blade's 0.62). `createWeapon` is
  parameterized on joints + particle slice; `f.W2` rides `handS`/`elbS`
  on the old shield slice (`SHIELD_N`) when loadout shield is "dual".
  Off-hand weapon can't be thrown deliberately (`!offhand` guards the
  throw branch) but drops if `foreS` severs. `damage.js` tests both
  segs for a dual attacker; AI aims `strike2Pos` instead of covering.
  `f.shield.active` still gates on `shieldOn` only, so dual has no
  phantom block surface.
- W jump: every joint gets the launch impulse (not just root/feet -
  the anchored head/torso pulls were pinning the skeleton through the
  links). During the 0.15s `airT` takeoff window all anchored pose
  pulls are suppressed (ballistic launch); they re-engage afterward
  for the return. Apex ~250px at the 1600x900 viewport.
- S crouch: stance target 0.5x, feet widen, and knees get a strong
  forward bend - without it the leg chain stays near-straight and the
  root physically cannot sink (measured: only 18px drop with a weak
  midpoint pull, ~110px with the fold).
- Buckler is a C-arc now: a tall band bowed toward the foe, open
  toward the body, disc r=0.22u sitting 0.2u ahead of the hand.
- check.mjs additions: spear >= 2x blade spec assert, dual-mode assert
  (W2 held, seg length == spec, shield surface inactive).

## Refinement notes (fists/ring pass)

- Bare hands punch: `createFist` is a weapon-shaped strike object
  ({seg, tipV, tipSpeed, dmg}) riding elbow->hand with hand velocity as
  tip speed, minV 300 (no lever amplification). damage.js builds
  per-hand slots: armed hand -> weapon seg, empty hand -> fist; the off
  hand strikes whenever the buckler isn't occupying it, so "none" is a
  free second fist too. A disarmed fighter still deals 0.38x damage.
  RMB drives the off-hand in every shield mode now.
- Loadout gains "fists": WEAPONS.fists is bare (slice despawns, both
  hands punch, shield pick is overridden to dual) and flips the arena
  to ring mode - corner posts + three sagging rope strands + a low
  ringside crowd instead of the ruins. arena.setRing sets a dirty flag;
  step() re-runs layoutAll when it flips.
- Foe arsenal cycles fists in too (every 4th foe boxes, forced dual),
  and player fists force the foe to fists - boxing is mutual.
- "Weapon drops at spawn" was the held-seg direction init: bdx/bdy
  started at (0,1) so a long blade hung straight down through the floor
  until lag smoothing caught it. `W.reset()` now flags a cold start and
  the first update snaps the direction to the forearm line.

## Refinement notes (air control + backdrop pass)

- Jump/air control: takeoff adds `hv = intent.move * 430` horizontally
  to the whole-body launch impulse, and while airborne `intent.move`
  steers every joint at 640px/s. `f.x` lerps to `J.root.x` in the air
  (10/s) so landing anchors at the traveled position; the stale-`f.x`
  snap-back is gone. AI gets the same steering for free since it
  writes the same intent. Verified: hold-D jump drifts ~590px and
  re-grounds; a no-input jump lands near the takeoff point.
- Backdrop depth lesson: sparse point sprites can't draw filled
  silhouettes - the earlier wall band scattered ~100 dots over
  ~1250x150px and read as speckle. Sprite *size* is the density
  lever: ridge particles at size 2.6-4.4 at ~0.2 luminance read as
  misty mountain mass; a crest-biased vertical distribution (h3^2)
  concentrates particles along the peak line so the outline reads.
- Scene now layers far ridge (z -2.8, size 2.6-4.4) -> ruined wall +
  broken columns (z -1.6, size ~1.3-2.2) -> crowd rows + braziers
  (z -1.2/-1.3) -> floor/grass/pillars near the fight. Ring mode
  shares the crowd helper; ropes at 60% of the backdrop slice.

## Refinement notes (stamina + clash pass)

- Stamina: `f.stam` 0..1, single writer `f.drainStam(n)`; hot strike
  slots bleed `0.13 * spec.wt * dt` every frame above minV (mace 1.6x,
  blade 1.0x, spear 0.8x, fists 0.5x), kicks 0.07, jumps 0.05, blocking
  costs the defender 0.05, clashes cost both 0.06. Regen is gated on
  `hotNow` (set by damage.step, consumed one frame later in f.step):
  0.26/s at rest, 0.5/s while floored, nothing while swinging.
- Faint: stam 0 arms `faintT = 1.6`; while floored the pose forces
  crouch stance, kMul *0.12, intents dead (move/aim/sOn/kick ignored),
  shield disc inactive, and the fighter stays down until stam >= 0.35.
  A fainted fighter contributes no strike slots and no parry targets -
  without that its grounded blade could keep clashing and pin its own
  stamina at 0 forever (found by the check).
- Clash: attacker's hot seg vs defender's HELD weapon segs
  (segSegDist2 < 0.075u), after the shield check, before body joints.
  Sparks at the closest-point midpoint, both clashing hands get
  `deflect()` impulses, attacker cooldown applies. Fists never clash -
  a bare hand slips under the blade. A parked blade is now a real
  guard, which is why check's whip phase grounds the foe's weapon.
- AI: faintT zeroes intents like staggerT; pick() retreats under 0.3
  stam (guard if also wrecked) so the foe paces itself.
- HUD: 2px `.sfill` stamina strip under each floating health bar,
  #8a9a9f at 55%, warms to #d09a5f under 0.25.

## Refinement notes (contact tier + bare-slice fix)

- Floating weapons in fists mode: `setShield("dual")` and `f.reset()`
  bulk re-enabled the off-hand/weapon slices AFTER `setSpec("fists")`
  had despawned them, so stale homes rendered as floaters. Weapons now
  own their slice state via `W.syncSlice()`; setShield only enables the
  slice when it holds a visible thing (buckler, or a non-bare W2), and
  reset re-asserts bare state after the bulk enable.
- Contact tier in damage.js: shield and clash checks used to require a
  damage-speed swing (tipSpeed > minV), so a slow press slid through
  the guard. Now any genuinely moving segment (>150px/s, cooldown
  shared) can be blocked or clashed; only breaking skin still requires
  the hot threshold. Soft contacts get half-strength stagger/deflect.
- Buckler disc grew 0.22u -> 0.30u to cover the C-arc visual - strikes
  on the visible shield read as blocks.

## Refinement notes (contact latches)

- Spaz on block: contact effects re-fired every cooldown tick while a
  seg rested on the disc - each trigger pumped a torso impulse and
  re-armed staggerT, which weakens all pose pulls (kMul 0.14) so the
  body crumpled under repeated shoves. Blocks and clashes are now
  entry-latched: effects fire once when the seg enters the contact
  volume, and hysteresis (1.45x shield / 1.9x clash exit radius) keeps
  hand jitter from bouncing the latch.
- Through-shield hole: cd[] was per-attacker, so a blocked main hand
  also suppressed the off-hand slot's checks for 0.32s - a second
  blade swept through freely. Cooldown is now per attacker-slot, and
  interception is pure geometry (no tipSpeed gate) - speed only decides
  whether the contact produces effects.
- Kicks now fizzle against the shield face too.
- check.mjs hardened for live-brawl flakiness: phases wait for fight
  state, dead foes are revived mid-loop, severed player forearms are
  re-grown, and the faint phase pins match.state to "fight" since
  damage.step never runs during roundend/gameover.

## BB overhaul request (poteto-mode)

Full physics/combat overhaul brief: articulated ragdolls, real
collisions (body/body, weapon/shield, weapon/weapon), physical
locomotion with steps, independent arm motors bounded by weight and
stamina, tuned survivability (several hits per duel), injury spectrum
with physical severed-limb debris, AI under identical rules, clean
round flow. Baseline measured: one-hit kills, tunneling swings, no
joint limits, sliding locomotion, interpenetrating bodies. All units
verified live - see plan pass 9 and .audit/fray-overhaul.tsv.

## Refinement notes (particle scenery pass, v3 bg stream)

- The 2D backdrop is gone except one vertical gradient (sky, the shadowed
  stands behind the crowd, dark soil). check.mjs asserts it: every row
  of #bg must be flat, and the field must hold solid scenery particles.
- With `CFG.additive = false`, opaque sprites tile silhouettes: each fill
  layer bisects a hex-grid spacing until its region fits the layer's
  particle share, sprites at 1.5x spacing. The same layer table scales
  from the 9000 to the 4500 budget without per-device numbers.
- Thin shapes (columns, cypresses, ropes, posts) are strokes: beads
  spaced under their thickness, which keeps edges straight. A hex fill
  on a 15px-wide column reads as a stack of balls.
- The crowd is one sprite per body part (shoulders, belly, head, hair or
  a raised fist), back tier first. A grid fill of the same budget read
  as confetti.
- Draw order is index order, so the ground band is the last slice, above
  the fighters and fx; debris sinking under the floor line disappears.
- The wall exclusion rects had to go: they clamp every particle home
  outside the walls onto the rect edge, which crushes full-width
  scenery into two vertical lines.
- Headless Chromium renders on SwiftShader, so fill rate is the limiter.
  Halo and light-pool sprites hundreds of px wide cost more than the
  whole crowd; keep big glows few. Per-layer sprite area is the number
  to watch (about 2.3M px for the scene at 1600x900).

## Refinement notes (v3 phys: contact solver, gait, pumps)

- Momentum-free corrections pump energy when a link undoes them. Any
  step that moves `x` and shifts `px` by the same amount (hinge clamp,
  pull iterations >= 1, `limJoint`, contact translation) carries no
  velocity by itself, but if a link then pulls the joint back with an
  x-only move, the px offset stays behind as velocity. The verlet spine
  hinges did this 7x per frame and reported 10-17k px/s on joints that
  barely moved. Hinges are now x-only like links. Pulls keep the px
  shift: making them x-only left the idle torso wobbling +-0.12u
  forever (the shift is their damping).
- The verlet velocity of a pulled joint is not its motion. A walking
  root read about -3000px/s while travelling +150px/s, because the pull
  drags it momentum-free and the leg links bill it backward. Gait logic
  reads `f.rvSm`, smoothed frame-to-frame travel, never `V.vel(root)`.
- `limJoint` snapped a wrong-side elbow up to 2 rad in one frame (hand
  flung ~100px), the arm pull dragged it back, and the pair flip-flopped
  every frame. It now turns at most 0.3 rad per frame the short way, and
  carries the hand proxy with the hand so the wrist link doesn't stretch.
- contact.js owns all fighter-vs-fighter solids: 12 bone capsules per
  body keyed by joint pairs (not part names, so a re-skinned part table
  can't desync physics), held weapons as capsules on the hand proxy, the
  buckler as a disc. Projection is translation, then an inelastic normal
  impulse split by inverse mass; a struck joint takes at most 900px/s
  from one contact, because a single joint stands in for the whole
  body's inertia.
- Blades pivot instead of shoving the arm. A correction across the blade
  rotates it about the hand; only the part along the blade moves the
  hand. Translating the whole hand lump froze a spear's hand on contact,
  and the arm pull then yanked it 120px a frame back toward its target.
  Fast sweeps are sampled from last frame's seg; the first touching pose
  re-aims the blade from the hand onto the contact point.
- damage.js no longer guesses hits from 0.24u joint proximity. It reads
  `S.touch.{body,shield,weapon}` that contact.js writes per strike slot;
  the hit power is the closing speed at the contact point, capped at
  3200px/s (a whipping spear tip in a sampled sweep reads 8000).
- Skin last: `f.writeHomes()` runs from index.js after contact, so drawn
  bodies match the separated joints.
- Gait: hips at 0.92 leg length (straight legs can't put a foot anywhere
  but under the hip), and the trailing foot steps once the hips pass it,
  aiming where the hips will be at touchdown plus half a stride. A foot
  plants where it actually landed.
