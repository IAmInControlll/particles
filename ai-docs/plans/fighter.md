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

## Refinement pass (gameplay + presentation)

- [x] Arena: particle floor strip (packed earth), under-floor shadow band,
  edge wall pillars, ruined-wall backdrop silhouette - one static slice,
  negative z, dim tones. Exclude/wall logic unchanged; a shallow
  under-floor shelf catches dead-particle litter.
- [x] Feet planted: `env.floor` read per frame, landing crouch on ground
  contact, leg pulls gated by severed state (a legless body drops and
  stays), check asserts no joint ever below the floor line.
- [x] Loadout: DOM overlay before round 1 - weapon (blade / mace / spear,
  different reach/damage/throw threshold via a WEAPONS spec table) and
  shield (buckler / none). Persisted in `fighter.loadout`.
- [x] Shield arm: `elbS`/`handS` joints + buckler lens slice; `f.shield`
  is the blocking surface. A hot weapon segment intersecting it is eaten
  whole - deflect sparks (fx pool), blocker stagger, zero damage.
  Unbreakable, undroppable; off-hand stays vulnerable off-angle.
- [x] Two hands, two buttons: LMB drives the weapon hand, RMB drives the
  shield hand, neutral returns to stance; contextmenu suppressed.
- [x] Ladder: loadout -> intro -> fight -> roundend -> next foe, until
  the player dies -> gameover -> rearm. Difficulty ramps via `ai.tune`
  (windup/recover/guard/reach) and foe arsenal cycles blade/spear/mace.
  Score = opponents beaten, best in `fighter.best`.
- [x] Extras: hit-stop (~50ms freeze on hit or block), blade trail smear
  at high tip speed, 3s roundend hold over the fallen foe.
- [x] AI shield use: buckler covers the torso in stance/guard/approach,
  drops exposure during windup/swing.

## Refinement pass 2 (user feedback)

- [x] Grounded, always: the root cause of the airborne/hover state was
  pull targets anchored to `J.root.y` feeding back through the verlet
  links as lift. Airborne torso/arm pulls now anchor to the fixed stance
  height, `airT` gives a 0.15s takeoff grace so the ground clauses don't
  eat the jump impulse, and re-grounding accepts feet near the floor or
  the root back inside a 0.3u slack band.
- [x] Scene, not a storm: the ambient drift tail is now a static
  starfield (`arena.sky`), the drift region sits below the floor, and
  the arena slice draws grass tufts, a pale moon, and the ruined
  backdrop - readable environment, fighters still dominant.
- [x] Shield protrudes: block disc is 0.22u radius centered 0.2u ahead
  of the shield fist, so strikes meet the buckler before the arm line.
- [x] Loadout previews: picking a weapon or shield re-arms the player
  live behind the overlay, plus a one-line stat description per weapon.
- [x] Health bars: HUD bars plus floating `.fbar` divs tracking
  `mass/mass0` above each fighter's head.

## Refinement pass 3 (user feedback)

- [x] Spear reach: `len` 1.3u vs blade's 0.62 - just over double.
- [x] Dual wield: the loadout's third shield option is now "dual
  wield" - `f.W2` is a second weapon riding `handS`/`elbS` on the
  former shield slice, spec-matched to the main pick. It cannot be
  thrown deliberately but drops if `foreS` severs. Damage tests both
  segs; the AI rakes with it instead of covering.
- [x] W is a real leap: all joints take the launch impulse and all
  anchored pose pulls are suppressed during the `airT` takeoff window
  - apex ~250px, ~0.5s airtime, clean landing.
- [x] S crouches to half height: feet widen and knees get a strong
  forward fold so the leg chain actually lets the root sink.
- [x] Buckler is a C: a tall band bowed toward the foe, open toward
  the body - visibly wrapping the torso, not a lens.
- [x] check.mjs covers the new mechanics: spear>=2x blade spec assert,
  dual-mode assert (held seg at spec length, shield surface off).

## Refinement pass 4 (user feedback)

- [x] Fists: a disarmed or bare hand still punches - `createFist` is a
  weapon-shaped strike (elb->knuckles seg, hand velocity, 0.38x dmg,
  lower min speed since there's no lever). Every empty hand strikes:
  thrown blade -> fist, "none" loadout -> free second fist, dropped
  off-hand -> fist.
- [x] Boxing option: "fists" in the weapon loadout despawns the weapon
  slice, overrides the shield pick to two-fisted, and swaps the arena
  backdrop to a ring - posts plus three sagging ropes and a low crowd.
  The foe ladder throws a boxer every 4th round.
- [x] RMB drives the off-hand in all modes, not just shield/dual.
- [x] Boxing is mutual: picking fists arms the foe with fists too.
- [x] Weapon cold-start: held seg direction snaps to the forearm on
  reset instead of easing in from straight-down (read as a drop).

## Refinement pass 5 (user feedback)

- [x] Jump air control: takeoff impulse carries move direction
  (hv = move * 430 into every joint), and while airborne intent.move
  applies a 640px/s steering impulse to all joints. f.x chases
  J.root.x in the air (lerp 10/s) so the landing anchors where the
  body actually lands instead of snapping back to a stale target.
  Verified: hold-D jump drifts ~590px, lands grounded.
- [x] Layered arena backdrop replaces the flat ruins band: far
  mountain ridge silhouette (crest-emphasized), ruined wall band,
  broken columns, dim crowd rows behind the fight line, and torch
  braziers as warm accents. Sprite size carries the mass - sparse
  particles at size 2.6-4.4 read as silhouette, not speckle.
- [x] Moon disc doubled (0.17u) and brightened.
- [x] Ring mode rebudgeted: denser ropes (size 1.05, even brightness),
  three crowd rows rising behind the ropes.
- [x] Slice rebudget: floor 0.3->0.22, band 0.12->0.08, backdrop gets
  the difference (~42% of the arena slice).

## Open questions

Resolved in the refinement pass:

- Spring-drag hand (BB-authentic flop), shoulder-orbit reach envelope.
- Severed limbs litter the under-floor shelf briefly before fading.
- 2-player local: skipped; ladder AI covers the opponent role.
- Mobile: touch maps to the weapon arm; shield falls back to stance
  auto-guard (see requests/fighter.md).

## Refinement pass 6 (Bloody Bastards parity - poteto-mode)

- [x] Stamina: every hot swing bleeds the tank scaled by weapon
  weight (mace gasses you, spear is cheap); kicks, jumps, blocks, and
  clashes all cost. Rest refills at 0.26/s.
- [x] Faint: an empty tank drops the fighter to a heap for ~1.6s,
  dead inputs, exposed - BB's signature punishment for flailing.
- [x] Weapon clash: a held blade in a swing's path deflects it with
  sparks and a two-handed knockback - steel answers steel, fists slip
  under. Symmetric: your parked blade guards you too.
- [x] AI stamina pacing: winded foes retreat or shell up to breathe.
- [x] Stamina sliver under each floating health bar.

## Refinement pass 7 (user feedback)

- [x] Contact physics: equipment intercepts any moving segment, not
  just hot swings - slow presses smother on the shield disc, slow
  blades tangle with held ones. Damage still needs a real swing.
- [x] Buckler disc covers the visible C-arc (0.30u).
- [x] Fists-mode floaters fixed: bare-spec slices can't be re-enabled
  by setShield/reset bulk writes (W.syncSlice owns slice state).

## Refinement pass 8 (user feedback)

- [x] Contact latches + hysteresis: equipment contact fires once per
  entry, holds while touching, re-arms on clean exit - resting blades
  no longer machine-gun staggers.
- [x] Per-slot cooldowns and geometry-gated interception: off-hand
  weapons and slow presses can no longer slip through a live shield.
- [x] Kicks blocked by the buckler.
- [x] check.mjs phase normalization for severed arms, dead foes, and
  out-of-fight windows.

## Refinement pass 9 (BB overhaul - physics and combat systems)

- [x] Swept collision: every adjucation test uses seg + previous-frame
  seg (point-vs-swept-quad for joints/disc, seg-seg for clash) - no more
  tunneling at 2500+ px/s tip speeds.
- [x] Body-body contact: joint-disc repulsion between the 8 torso/limb
  joints of opposing fighters - clinches push instead of overlap.
- [x] Locomotion: f.x target carries vx momentum (accel/brake); feet
  plant at world spots and step when outrun, each plant pushing the
  root. Walking is lurchy stepping, not sliding.
- [x] Joint limits: elbow/knee hinge clamps measured from spawn bend
  sign; h-space convention (straight = +pi) so hyperextension wraps to
  the wrong side; hard snap runs post-V.step and post-body-contact.
- [x] Damage model: per-joint integrity (elb 4 .. root 12), killN capped
  at 12 particles/hit, cut-vs-blunt per weapon spec - ~11 clean hits to
  kill in an even duel, single hit max ~6% mass.
- [x] Severed limbs persist: only boundary links break, kept particles
  skin to the freed joints and tumble to the floor, dissolve 4-9s.
  Severed off-arm drops the buckler. Wounded joints weaken the limb's
  drive (armK) and limp the stance (legKFactor partial).
- [x] Motor strength: hand drive scaled by weapon weight and stamina,
  floor 0.22 - mace tips reach ~1400px/s vs blade ~2600.
- [x] TUNE table exported from puppet.js - 28 combat dials in one place.
- [x] check.mjs: phase normalization for severed shins/dead foes/out-
  of-fight windows; RMB target moved inside the reach envelope.

## Refinement pass 10 (backdrop architecture + hard contacts)

- [x] Painted backdrop (`backdrop.js` on a `#bg` canvas): sky gradient,
  moon, mountain ridges, ruins, crowd, torch posts, opaque ground, edge
  pillars, ring mode - scenery is painted, not speckled (space deck.js
  pattern). GL canvas is `transparent: true, zIndex: 1` so particles
  composite additively over the painting.
- [x] arena.js cut to particle-native roles only: packed floor strip,
  live torch flames, rising embers (pond's explicit-slice pattern).
  Ambient tail is a dim static starfield; walls/crowd/ridges moved to
  canvas.
- [x] Under-floor drifters killed: the exclusion shelf pooled dead
  motes at its boundary (the "moving dots"); removed so motes drain to
  the offscreen drift point and fade.
- [x] Shield hard constraints: buckler discs get full-separation
  position solves (60% to the attacker, 40% recoil into the holder's
  shield hand; 50/50 shield-vs-shield) and `px` shifts with `x` so
  pushes add no velocity - two raised bucklers hold each other out
  instead of interpenetrating. Hands/feet added to the shield-block
  joint set.
- [x] Shield disc positions re-derived after the contact solve so
  visuals and hit tests read post-solve spots, not one-frame-stale ones.

## Refinement pass 11 (air pose + body density)

- [x] BODY_N 330 -> 500: mass pool +52% (longer rounds), every
  PART_DEFS count scaled ~1.6x so limb proportions hold at density.
- [x] Airborne silhouette via capped velocity nudges (~140px/s max)
  steering legs toward a tucked-then-trailing pose. Position pulls on
  airborne joints are unusable at any anchor: a pull teleports a joint,
  the links convert it to body velocity, and the body pumps itself
  whichever way the targets sit - measured 60px hover at root-anchored
  targets, 1150px/s horizontal sprint at asymmetric stance ones.
  Impulses can't teleport and gravity always wins vertically.
- [x] jumpV 1700 -> 2100 to recover the apex the nudges bleed
  (~40%): measured ~266px apex, legs tuck at peak then extend for the
  landing, clean re-ground.
- [x] Floating bars 60x6 -> 90x9.

## Refinement pass 12 (painted bodies - the BB readability fix)

- [x] `painter.js` on a dedicated `#bodies` canvas between backdrop
  and GL (z0 both, DOM order): capsule limbs + disc head/hands/feet
  drawn from the same joints that drive the particle skin. Point
  sprites can't render anatomy; the painted silhouette carries the
  form, additive particles light it as living flesh - the same
  deck.js lesson that fixed the backdrop, applied to the fighters.
- [x] Health IS the body: every capsule's width and alpha track its
  part's live particle fraction (`f.alive` count / part n). Eating a
  limb visibly withers it; severed parts stop painting so the stump
  stays clean while the chunk lies on the floor as debris.
- [x] Hard floor clamp: feet were held by pulls only, so overshoot
  let joints rest a few px under the line persistently. Post-solve
  all joints pin at floor with py zeroed - resting contact, no
  bounce.
- [x] check.mjs `aiHold` seam (index.js zeroes f1.intent when set):
  the locomotion phases measured the player while a live AI chopped
  at it. Held foe + explicit resets make every phase deterministic.
  Kick phase steps to 110px (was 170 - only connected because the
  live foe walked into reach).
- [x] Floor check polls for a persistent violation (contact shoves
  one frame deep are legitimate; resting penetration is not).
- [x] Thrown/ground weapons render rigid: `field.snap` pins the slice
  to the seg each frame - spring lag used to string the particles
  along the flight path into a ~700px comet rod across the arena.
  A slow weapon near the floor lays flat (was: blades leaning
  upright at the wall hung in "thrown" forever).
- [x] Impact freeze refractory: hitStop 0.05 with no gap chained into
  sustained slow-mo during brawls (and ate inputs). Now 0.035 freeze
  every 0.25s max.
- [x] Skull-head fix: the face paints brighter than the body (dark
  disc inside a bright ring read as a hollow socket).
- [x] Body flesh dimmed ~40% (0.7->0.42 base): surface shimmer over
  the painted form instead of a blown-out light blob; wounds show as
  withering silhouette.

## Refinement pass 13 (player control - the agency fix)

- [x] Root velocity servo: propulsion used to live in plant pushes -
  every foot plant shoved the root by pushK*f.vx, so walking was a
  ~5Hz surge train and the root pulsed +-90px/s while f.vx ramped
  ~350ms behind the input. Now a servo in pose() impulses the root
  (0.45) and chest (0.25) toward f.vx each frame - the hips track
  the target inside ~3 frames. Measured: top speed in ~150ms (was
  ~350ms), direction reversal in <80ms, dead-stop settle with zero
  jitter. Steps remain but only animate the legs (pushK 0.55->0.11).
- [x] accel 8->16 / brake 11->22 so f.vx itself stops lagging.
- [x] Air steering 330->650 px/s^2 for real aerial correction, but
  capped at airVMax 460px/s in the held direction - uncapped it
  built to >1000px/s and a held D+W crossed half the arena.
  Counter-steering always allowed (reversal preserved).
- [x] Walk lean cap 0.12->0.08 - it saturated at full speed and read
  as a permanent falling-forward hunch in stills.
- [x] Verified live: W+D over the foe = clean arc, no minSep trap,
  ~600px flight; neutral W apex ~250px; gait probe shows feet
  alternating within 20px of floor with no kick/stagger anomalies.

## Refinement pass 14 (severed-limb anatomy - no rubber arms)

- [x] The 900px line across the arena was a kept bone drawing to a
  freed joint: sever "fore" at the elbow and elb flew off with the
  chunk while "upper" (sho->elb) kept skinning to it, permanently.
  The painted capsule did the same via hardcoded J names.
- [x] Fix: kept joints stay on the body as the stump tip (zero
  repointing for kept bones, painter needs no changes); the chunk
  gets a clone point (elb_x). Links: kept+moved stays (braces the
  stump), moved+free repoints the moved end to its clone (chunk
  keeps its shape), kept+free is the cut and breaks.
- [x] Kept parts with a freed-outright ref collapse to the kept end;
  severed parts spanning kept+freed collapse the kept end onto the
  chunk; knots entirely on freed joints auto-sever (die with the
  chunk instead of lying lit on the floor forever).
- [x] Zombie-arm kills: armed-arm pulls now skip entirely when fore or
  upper is severed (a pull on a freed joint dragged the chunk to the
  cursor); limJoint entries touching freed joints are nulled (a clamp
  on hand would tether it to the stump); freed joints skip jump and
  air-coherence loops (the chunk must not leap when you do); the
  grounded probe ignores freed feet (a severed foot resting on the
  floor used to lock grounded=true mid-air).
- [x] Hits skip severed parts via a new f.partOf index - the fallen
  chunk can't bleed the fighter twice.

## Refinement pass 15 (Bloody Bastards anatomy rebuild)

Reverse-engineered the real BB xapk (IL2CPP dump, `ai-docs/bloody-bastards.md`)
and rebuilt the puppet around its actual mechanics instead of guessed ones.

- [x] Buoyant torso: per-point `gs` gravity scale + `im` inverse mass in
  verlet.js. BB's real secret - the upper body has NEGATIVE gravity
  (belly -2g, chest/neck/head -5g) while feet carry ~5x ballast. The
  body stands as a taut pendulum; the old pose-pull spine is gone.
- [x] Solver hinges: `V.hinge(piv, r1, r2, jt, band, stiff)` inside the
  iteration loop clamps joint angle to center+-band. The first attempt
  corrected posture post-step and oscillated ~500px/s; in-solver it
  converges. Corrections shift `px` with `x` (velocity-neutral) - an
  unshifted teleport is an energy pump (headV hit 1157px/s before).
- [x] 15-joint skeleton: root > belly > chest > neck > head, plus a
  second shoulder shoS. Stacked spine hinges (waist 0.16, spine 0.13,
  neck 0.1, head 0.6) - each hinge's axis continues the one below, so
  a waist hunch carries the column like a real spine instead of
  shearing at one joint. BB: spine +-5deg stacked, neck +-2.
- [x] Sever-aware constraints: hinge cons break when their four refs
  split across a cut (half a hinge on each side is just a tether);
  reset restores pivot/r1/r2/jt endpoints alongside link a/b.
- [x] Human skin: painter draws tapered quads (thigh meaty > shin,
  bicep > forearm) + a pelvis-waist-ribcage torso polygon instead of
  stick capsules. Fighter's-guard idle replaces the surrender pose.
- [x] Hand COM proxies: `handP`/`handSP` - zero-g points hinged to the
  wrists (BB: 0.45-mass COM per hand, weapons fixed-joint to it). The
  weapon mounts to the proxy; the cursor drags the proxy; the wrist
  link drags the arm. Proxy im scales with weapon weight - a mace lags
  the hand like real mass, a blade snaps.
- [x] Stamina = physical load: drain is proportional to wrist stretch
  (proxy-vs-hand gap), not just tip speed - exertion is literally how
  hard the arm is being dragged.
- [x] `pull()` guards `j.free` - the whole zombie-pull class dead at
  the source.
- [x] check.mjs `reviveA()`: the live foe maims the player between
  phases (a severed leg = a heap that can't whip). Each mechanic phase
  now normalizes the actor - resets severed limbs, tops the tank,
  clears faint/stagger - so it measures the mechanic, not the walk-in.
- [x] Suite green: hit 74, clashes 8, stamMin 0.42, floor exactly 720,
  fists/dual/throw/faint/ladder/gameover/rearm all pass, zero errors.
  chunk is already lost mass, striking it can't bleed twice.
- [x] reset() restores everything: clones retire (gone+deleted), free
  flags clear, con endpoints and part ja/jb and lim entries come back.
- [x] Verified: elbow sever keeps max bone span ~67px (was 900), stump
  tracks the body, chunk lies on the floor; knee sever + whole-arm
  sever collapse correctly; suite fully green.

## Rebuild pass 15 - rebuilt on the real Bloody Bastards

Pass 15 stops guessing. `ai-docs/bloody-bastards.md` is the decoded
evidence from the actual APK (UnityPy over data.unity3d + the il2cpp
fields table). The numbers below are real prefab values.

### What BB actually does (evidence)

- The body stands because the torso FLOATS: Belly gravityScale -2,
  Chest/Neck/Head/HeadCOM -5. Legs+feet stay +1 with a 4.0-mass COM
  weight fixed-jointed to each foot. Net body force is slightly
  downward, so the buoyant torso stands as a taut string in tension
  through the leg chain. There is NO upright servo - that's the sway.
- 13 rigidbodies, hinge joints: shoulder FREE (no limit), spine +-5,
  neck +-2, head +-40, elbow 15..105 one-way, wrist +-35 (+extra fixed
  stiffener), hip +-45, knee -30..-130 one-way, ankle -5..55 MOTOR.
- Hands: a separate 0.45-mass zero-gravity COM body hinged to the hand
  is the weapon mount (handFixedJointForItem_L/R). Cursor drives
  handLeftPoint/handRightPoint targets; runtime hinge+fixed joints
  drag the arm chain after them. StaminaDrainer lives ON the COM -
  stamina costs the physical load of dragging the weapon.
- Locomotion: footLeftPoint/footRightPoint step targets; pelvisPoint
  height hold; headForceUpwards/Sideways small correctives; pushing
  between bodies is an AreaEffector2D, kicks are effector pushes.
- Damage: DamageSpeedThresholdSharp/Blunt, damagePerMps - damage is
  literally impact speed; knockbackPerDamage; impaleDamageThreshold
  sticks the weapon inside for impaleDurationBase+perDamage seconds.
- Per-bone HP: pelvis/belly 100, head/neck 70, hand 50, thigh/calf 40,
  arm/forearm 30. Armor = separate protruding box colliders w/ own HP.
- AI: deflects the same virtual nubs (nubMaxDeflection, aimBiasDeg,
  maxAimDeg, Aggression, preferredSpacing, shieldTrackSpeed). It does
  not animate limbs; it moves the same targets the player's mouse does.
- Swing = parametric arc: windupAngle/Radius -> strikeFrom->To Angle
  at strikeRadius -> followAngle/Radius + holdExtension.

### The rebuild (units)

Falsifiable done-predicate: (a) fighter stands unaided - no input -
  without topple or drift; (b) screenshots read as a human silhouette
  (tapered limbs, torso width, neck, face, feet) in guard/walk/swing/
  crouch/jump/fall; (c) hands track the mouse with weapon-weight lag;
  (d) hits hurt in proportion to impact speed; (e) suite green.

1. [x] Buoyant torso: per-point gs on belly -2 / chest+neck+head -2.4,
   shoulders -0.5; feet im 0.2 anchor. Torso pose pulls REMOVED.
2. [x] Skeleton 12->15: belly, neck, shoS added; waist/spine/neck/head
   stacked solver hinges; sever/reset rewired for hinge endpoints.
3. [x] Human skin: tapered limb quads + pelvis-waist-ribcage torso
   polygon + solid skull disc under the face (rim particle ring was a
   hollow skull), fighter's-guard idle pose.
4. [x] Hand COM proxy: handP/handSP zero-g points hinged to wrists;
   weapons mount to proxies, aim pulls drive proxies, proxy im scales
   with weapon weight; stamina drains on wrist stretch.
5. [x] Feet: planted feet slide at 0.85 body speed while walking;
   distance-aware root catch-up pull (BB pelvisPoint).
6. [x] Damage-by-speed: eff = power - spec.floor (blade 320, fists 70);
   kill/integrity/knockback all scale with eff - grazes bite nothing,
   shove tracks damage dealt.
7. [x] Sweep: idle/walk/crouch/jump/clinch/sever screenshots verified;
   suite fully green (duck fix: settle sample + stance 0.42).

Risk order: buoyancy first (new mechanism, could self-lift like the
old pose-pull pump), skeleton second (ripples sever/painter), skin
third (visual only), proxy fourth (rewires control feel).
