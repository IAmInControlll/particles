# Bloody Bastards - reverse-engineered mechanics

Source: `com.tibith.badboxing` 5.0.5 (XAPK). Unity IL2CPP build.
Extracted via UnityPy from `data.unity3d` + `global-metadata.dat` (fields table).
All numbers are real serialized prefab values, not guesses.

## The one idea that matters

The body is a **Box2D ragdoll whose torso has negative gravity**.
There is no balance servo. Chest/neck/head literally float upward like a
balloon while heavy feet anchor the legs. Everything else hangs off that.

| Bone          | mass | gravityScale | joint (limits)                     |
|---------------|------|--------------|------------------------------------|
| Pelvis        | 5.0  | +1.0         | root (has DeadWeight +1.0 fixed)   |
| Belly         | 5.0  | **-2.0**     | hinge->Pelvis, +/-5 deg            |
| Chest         | 5.0  | **-5.0**     | hinge->Belly, +/-5 deg             |
| Chest COM     | 3.0  | -5.0         | fixed->Chest                       |
| Neck          | 3.0  | **-5.0**     | hinge->Chest, +/-2 deg             |
| Head          | 3.0  | **-5.0**     | hinge->Neck, +/-40 deg (+ -35/-35) |
| Head COM      | 0.1  | -5.0         | fixed->Head (pulls COM up)         |
| Arm           | 3.0  | +1.0         | hinge->Chest, **no limit**         |
| Forearm       | 3.0  | +1.0         | hinge->Arm, 15..105 deg (one-way)  |
| Hand          | 3.0  | +1.0         | hinge->Forearm +/-35 + extra fixed |
| HandX_COM     | 0.45 | **0.0**      | hinge->Hand, free spin             |
| Thigh         | 5.0  | +1.0         | hinge->Pelvis, +/-45 deg           |
| Calf          | 5.0  | +1.0         | hinge->Thigh, -30..-130 (one-way)  |
| Foot          | 5.0  | +1.0         | hinge->Calf, -5..55, **motor on**  |
| FootX_COM     | 4.0  | +1.0         | fixed->Foot (heavy sole)           |
| Pelvis COM    | 3.0  | +1.0         | fixed->Pelvis                      |

Dimensions (Unity meters): fighter ~1.7 tall. Pelvis sits ~0.85 up.
Thigh->Calf offset ~0.338, Calf->Foot ~0.355. Shoulder->elbow ~0.28,
elbow->hand ~0.30. Shoulders at +/-0.12-0.125 from spine.

Design translation for Fray: instead of pose pulls keeping the body
upright, give torso particles a weak upward "buoyancy" bias and keep
feet genuinely heavy. Free shoulders + limited elbows/knees, exactly as
above. The buoyant-torso trick produces the BB sway for free.

## Hands and the drag mechanism

- `HandL_COM`/`HandR_COM` are separate 0.45-mass, zero-gravity rigidbodies
  hinged to the hand bones. The **weapon mounts to the COM**, not the hand
  (`handFixedJointForItem_L/R`). A shield/weapon thus floats as dead
  weight the arm has to carry.
- The hand chain toward the cursor is runtime joints:
  `handFixedJoint2DL/R` + `handHingeJoint2DL/R` (plus `_Dummy_TwoHanded`
  variants connecting both hands to one item). The drag target is
  `handLeftPoint`/`handRightPoint` under `ControlPoints` - the player nub
  moves that point and a joint chain pulls the arm after it.
- `StaminaDrainer` lives ON each HandX_COM - stamina is drained by the
  physical load of driving that COM (weapon weight amplifies it).
  Decoded values: `6, 0.2, 4, 4, 1.5, 0.6, 0.4` (drain/regen params).
- `StaminaDrainer` values on CharacterMover: `staminaRechargePerSecond`,
  `staminaEmptyTimeUntilRecover`. Hands get `handsForcedInactiveSeconds`
  (1.0s) when stamina empties; `ForcedInactiveTolerance` gates reactivation.
- Hand motion params on the swing component: `restAngle`, `swingMultiplier`,
  `lerpSpeed`, `singleHandedSpawnAngle`, `doubleHandedSpawnAngle`,
  `leftSpawnDelay`, `leftLerpSpeedScale`.
- `handsDragWhenActive` / `handsDragWhenPassive` / `handsDragThreshold`
  on CharacterMover - hands have real linear drag while driven.

## Locomotion

- `movementSpeed` (+ `movementSpeedWhenDowned`), `maxVelocityX` = **22**.
- `footLeftPoint`/`footRightPoint` under `ControlPoints/Feet` are step
  targets; `VelocityXFeetMoverThreshold` triggers stepping when the
  pelvis gets ahead/behind the feet. Feet are moved toward those points
  (feet follow points, pelvis follows via body physics).
- `pelvisPoint` (+`pelvisWhenAnyLegSeveredPoint` fallback) is the height
  target the body holds at; `feetPositionTransformGrowScaleDivider`
  scales the stance width.
- `headForceUpwards`/`headForceSideways` + `HeadForceXxxMultiplier` -
  small corrective forces applied AT THE HEAD, layered over the
  negative-gravity buoyancy (tilt/lean control).
- `pushingCollider` + `pushingAreaEffector` - body-vs-body shoving is a
  real **AreaEffector2D** on the chest; also `KickReceiver` trigger box +
  `ExtraCollider_Kick` on the shin.
- Inputs (from input actions blob): `MoveLeftHand`, `MoveRightHand`,
  `Move`, `WalkLeft`, `WalkRight`, `Kick`. Nubs: `NubLeft`, `NubRight`,
  `doubleTapWindow` 0.175s, `kickWindow` 0.25s, `moveSustainSeconds` 0.2s,
  `handsForcedInactiveSeconds` 1.0s.
- Kick: `kickAnimation` + `kickEffector` (AreaEffector), `kickForce`,
  `kickDurationSeconds`, `kickWindupSeconds`.

## Damage, wounding, dismemberment

- Per-part HP (BodyPart component, serialized): Pelvis 100, Belly 100,
  Head 70, Neck 70, Hand 50, Thigh 40, Calf 40, Arm 30, Forearm 30,
  Nose 30. Armor plates: 30-100 by item (MetalCap hat 100, kimono 50-70).
- `DamageSpeedThresholdSharp` / `DamageSpeedThresholdBlunt` - hits below
  a velocity threshold do nothing; `damagePerMps` scales damage with
  impact speed; `knockbackPerDamage` pushes the body; `sfxVolumePerMps`
  scales clang volume. Damage = f(relative velocity), not fixed numbers.
- Hit material enum on weapons: WoodHandle, WoodBlunt, MetalHandle,
  MetalBlade, MetalSpike, MetalBlunt, SpikePommel - per-contact-surface
  damage typing.
- `impaleDamageThreshold`, `impaleDurationBase`, `impaleDurationPerDamage`:
  high-speed hits IMPALE - the weapon sticks into the body for seconds.
- InternalOrgan Brain / Ribcage / Guts are trigger capsules inside the
  body (`InternalOrgan_Brain` inside head etc.) with `ImpaleMask_*`
  children + `Cut` - organs detect penetrating weapons.
- Severing: joints aren't "cut" - the bone hierarchy physically separates
  (Bloodgush_X emitters mark every sever point: neck, both shoulders,
  elbows, wrists, hips, knees, ankles). `ChestColliderForSeveredHeads`
  keeps severed heads bouncing off the chest.
- `headSevered`, `anyHandPartL/RSevered`, `anyLegLeft/RightSevered`,
  `anyLegSevered` are live flags on CharacterMover - severed hands lose
  their drag joints (the nub goes dead).
- Armor = separate GameObjects `___ArmorPart_<Bone>_<Layer>` with their
  own BoxCollider2D physically in front of the bone + `bt` component.
  Hits hit the plate collider first.
- Wounds are PAINTED: `DamageDecalPainter` + CW Paint `CwPaintableMesh`
  decals at `Bloodgush_*`/`Wound` points; `BloodOnTheGroundCustomizer`
  pools floor blood. The visible "flesh" is a single skinned `Smeg` mesh
  over the bone chain - particles in Fray are our equivalent.

## The AI = a second pair of hands on virtual nubs

CharacterEnemyAI fields: `Aggression`, `ReactionTime`, `attackRange`,
`kickRange`, `wallX`, `relentless`, `nubMaxDeflection`,
`preferredSpacing`, `minSpacing`, `personalitySwitchTime`, `bullyBias`,
`dodgeBackDuration`, `postAttackRetreatBoost`, `useProceduralStrikes`,
`aimStrength`, `strikeVariation`, `handAnchorL/R`, `nubAngleOffsetDeg`,
`aimOrigin`, `aimBiasDeg`, `maxAimDeg`, `shieldGuardRadius`,
`shieldTrackStrength`, `shieldTrackSpeed`, `PlayerPosition`.

The AI does not animate limbs - it moves `handAnchorL/R` (its nub
deflection) toward `aimOrigin` and the same hand-follow physics plays
out. `AIHandsInputRelayer` + `AIHandAnimBundle_<Weapon>_xH` (18 bundles:
per-weapon-grip animation data). `EnemyBulkConfig_BK_*` (36 configs) hold
per-opponent stat ranges (spacing, aggression, stat vectors, colors).
`AIOpponentSpawner` builds ladder enemies from these.

## Weapons

`JS_HandItem_*` prefab: one Rigidbody2D + PolygonCollider2Ds + a child
`Counterweight` rigidbody fixed-jointed to it (`HandItemsCounterweightTweaker`
exists - counterweight mass tunes balance). Handles: `Handle_1`/`Handle_2`
grip points; `Char1Right/Left/Double` + `Char2Right/Left/Double` are
per-fighter grip markers (which hand goes where, 1H vs 2H).
Masses: 2H axe body 1.0 + cw 0.25; 2H spear 1.0 + 0.25; 2H mace 2.0 + 1.0.
The weapon connects to `handFixedJointForItem_L/R` on the hand COM.
`WeaponSelfCollider` = 0.25-mass circle fixed to chest so your own weapon
physically rests on/bumps your body. `minSpeedForWhoosh`,
`impactSpeedThreshold`, `clangFeedbackSpeed` drive audio feedback.

## Attack structure (field names)

Swing = parametric arc data, not canned animation:
`SwingUp | SwingDown | Stab`, `duration`, `windupSnap`, `windupEnd`,
`strikeEnd`, `windupAngle`, `windupRadius`, `strikeFromAngle`,
`strikeToAngle`, `strikeRadius`, `followAngle`, `followRadius`,
`holdExtension`, `targetTransform`. The hand travels a circular arc:
windup pose -> strike sweep (angle range at radius) -> follow-through
-> hold. `useProceduralStrikes` on the AI confirms strikes are generated
on the fly around the target.

## Visual/fx bits worth copying

- `TailAnimator2` on hair/beard/hat/cloak/skirt/forearm-protuberance
  bones - floppy secondary motion for anything dangling.
- `BodyfallSFXTriggers`, `FootstepsSFX`, `VoiceSFX`, `ImpactSFX`.
- `KickReceiver` + `ExtraCollider_Kick`, `ExtraCollider_Base/Legs/Chest/Head`
  fat hitboxes layered over the bone colliders.
- `PostDeathRigidbodies` - extra weights added to the corpse.
- `CharacterPostDropResetter` - picks the body back up after a knockdown.
- Bystanders: `BystanderMovement`/`BystanderCustomization` crowd members.

## What Fray should take (not copy verbatim)

1. Buoyant torso (negative-g equivalent = upward bias on chest/head
   particles) + heavy feet instead of pose pulls. Biggest single win.
2. Weapon rides on a heavy zero-g "COM" proxy, the arm drags the proxy,
   the proxy drags the weapon - decouples weapon weight from arm strength.
3. Free shoulder + one-way elbow/knee + powered ankle.
4. Damage from impact SPEED with sharp/blunt thresholds, knockback
   proportional to damage.
5. Armor plates as separate protruding colliders that take the hit first.
6. AI moves the same hand-target the player's mouse moves, with
   aimBias/maxAim + spacing + aggression fields.
7. Severing = hierarchy split at marked joints, chunks keep simulating.
8. Impaling = weapon sticks in body for N seconds at high speed.
