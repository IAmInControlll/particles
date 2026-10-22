# Requests: Spaceship (Voidrunner)


## The mission

The derelict is the carrier Blackbird - a three-leg rescue campaign,
not set dressing. Pick screen sets the scenario (dead carrier, trapped
crew, scavengers feeding). Legs spawn ~48k/62k/78k out (course LEGD);
dock within 700wu banks +800 and a hull patch, then the next signal
locks. Blow past 3k behind and the signal re-arms ahead on the same leg.
Story beats fire as fractions of each leg's spawn distance into a
persistent top-left log (hud.log/world.log, 6 lines, ~45s) - BLACKBIRD
comms, scavenger warnings, per-leg done lines. After the third dock
storyDone flips: finishStory() leaves the emptied wreck drifting, no new
signal, and the run goes endless for score. NAV shows WRCK range, radar
pins an amber blip, and deck draws a screen pin - bracket + range in
frame, edge arrow when off-screen or behind - gated on wreckDist > 0.
Story probes in check.mjs scenario story (wreck0, leg1, ambush, done).

Climax beats: inside the last 3k of leg 3 a forced ambush drops a heavy
plus two drones (the alpha defends the meal). A good dock launches
escort pods - ~10 warm lights staggered astern for ~6s (fx.escort) so
the rescue is visible in chase view - and the final dock raises a
self-dismissing CAMPAIGN COMPLETE board (hud.campaignDone, reuses #over
with a data-mode guard so its timer can't hide a later game over).

## Engine gaps
- None blocking. `field.noFlock` covered the rigid-body layers (cockpit,
  gates, rocks, ships, bolts, pickups, stars) exactly as documented.
- Rock-steady stars needed zero particle-level work: `noFlock` +
  page-level `CFG.twinkle: 0` + `CFG.heatGain: 0`. The only jitter sources
  left are deliberate (mouse repel) or user-visible (boost FOV kick).
- Per-layer twinkle/heat disable is not possible - both are shader-wide
  CFG knobs. Setting them to 0 page-side loses the twinkle the engine
  demo uses for atmosphere; acceptable here since space wants a still
  field. If another creation wants twinkling foreground + steady
  background, that would need a per-particle opt-out flag.

## Hub integration
- [x] hub card: "Voidrunner" -> space.html (linked in PAGES by the hub
  owner)

## Shared helpers
- None added. Everything needed lived in `src/creations/space/`.
- My headless check script lives at `src/creations/space/check.mjs` because
  `tools/` is outside my write scope this session. If the owner wants the
  canonical `tools/verify-*.mjs` home, the file is self-contained; move it
  and point `BASE` stays the same.

## Collisions / notes
- localStorage keys used: `space.best`, `space.board`, `space.track`.
- `game.auto` (or `__space.auto = true` in console) is an autopilot used by
  the headless checks; it also works as an attract mode if the hub ever
  wants one.
- `window.__space` exposes the game object for debugging (same convention
  as `window.__pf`).
- `field.drift` is pinned to screen center every frame so released
  explosion/shed particles pool mid-screen instead of the default corner.
- `field.mouse.down` doubles as the pickup magnet extender (press-hold
  widens the pull radius 300 -> 620 wu).

## Polish pass (session 2)
What was broken / changed:
- Manual W thrust was dead: the autopilot-off path ran `delete keys.KeyW`
  every frame. Fixed to clear the key once when auto flips off.
- Backdrop: bg 5,7,14 -> 3,4,9; stars are now white-only (PAL.ink/dim) in
  a near shell (320-1500 wu) plus a deep shell (1600-4000 wu, 25%) for
  slow far-field parallax at max speed.
- Speed feel: `cam.f` widens ~18% under boost/speed (eased fovK); stars
  and dust gain size+brightness with `cam.speedK`; dust respawn tightened
  so motes stream past the canopy.
- Cockpit rebuilt to an X-wing read: A-struts + edge struts + top arc,
  filled dash band, blinking instrument row, dome scanners, corner
  wedges. Density scales with the layer budget (N-agnostic). Warm palette
  keeps it distinct from the sky-blue gates and white stars.
- Gates: pending rings brighter (sky, size 1.05), next-gate accent bumped,
  point-blank bloom softened.
- Bug fixed in check harness: `clip`/`over`/`fight`/`ship` scenarios now
  reload the page so localStorage/state never leak between probes.
- New `motion` scenario numerically proves approach: nearest gate's
  projected pixel radius grows between two timed probes.
- Snap tracking is now the default (`space.track` unset = snap); spring
  homing trailed rigid bodies a frame behind their homes and read as
  fuzz. T still toggles and persists.
- Stars and dust are now camera-centric instead of corridor-slabs:
  respawned in a tunnel around `cam.fwd` (~3.7k ahead, ~1.6k behind,
  1.5k lateral) so space surrounds the ship on every heading while
  points stay world-anchored for parallax. Verified by `lookback`
  scenario (fwd 1291 / back 1677 visible stars at cruise).
- Steering has angular inertia now: `cam.yv/pv/rv` are velocities that
  wind up over ~0.25s on input and coast down ~0.5s on release
  (`A_ATT`/`A_REL` in camera.js). Arrows set a rate target, not the rate.
  Autopilot unaffected - it steers cam.x/y positionally.
- Cockpit encloses now: perimeter rim (top rail, side rails, rounded
  corners), dim overhead canopy fill, an eye-level crossbar, dash-to-rail
  corner posts, wall instrument clusters, a faint nose V below the
  reticle, and a right-dash speed gauge keyed to `cam.speedK`. Layer
  share 13.5 -> 16 percent.
- Star shell gained hero stars (~4%, bright, ahead-biased - fly-up-to
  targets) and 4 drifting nebula clouds (~11%, big dim blue-violet haze).
- Pointer: `field.mouseZone = () => false` - the whole page ignores the
  cursor (keyboard game, no pointer verbs needed).
- Gate scoring now scales with speed: `25 * (1 + combo*0.5) * (0.65 +
  speedK*0.85)` - 0.65x parked, ~1.5x at boost cap.
- Planets: new `planets` layer (~13% of N). Each of 3 bodies bakes a
  dense point-cloud surface - gamma-lifted sun shading plus baked
  latitude banding (60% are gas giants) - with a thin viewer-facing
  limb ring recomputed per frame. 0-2 tilted ring bands spin in the
  planet's equatorial plane. Spawned 2.4-6.2k ahead, off the racing
  line; reachable by steering off-course.
- Gate compass: the reticle ring was replaced by a static center marker
  plus a ~40-point 3D arrow (kind 5, immune to shed) floating 170wu ahead
  of the camera, reoriented each frame toward `course.next` (the nearest
  pending gate). Members bake arrow-local coords (shaft/chevron/tail) and
  project through cam.project, so it tips and swings to any bearing:
  tail-on blob when lined up, wings spread head-on when the gate is
  behind. The tip carries a red bead ring (red survives only under ~1.2
  luminance - stacked additive dots clip to white). Reticle+arrow are
  baked FIRST in the cockpit point list: layer overflow trims the list
  tail, and the arrow being last originally made it vanish entirely.
  home.z pinned at 3.2 with the rest of the cockpit.
- Sun compass: ~110 points at the head of the planets slice pinned to a
  constant world direction (-0.3, 0.45, -0.84) at 30k range, riding
  WITH the camera (zero parallax, never leaves the sky). home.z is
  pinned to 0 because the shader's perspective term would crush it to
  zero at that depth. The same vector is LIGHT, so planets are lit
  from where the sun sits.
- Cockpit rebuilt via a 3-candidate arena (subagents, judged, grafted).
  Winner's shape: layered ship interior - a far windscreen trapezoid
  (z~0.9, small/dim), connector struts with per-point z+lum RAMPING along
  each member (beams literally grow approaching the pilot - the key depth
  cue), near canopy shell at z~4.6, overhead visor band + ribs, wraparound
  dash with instruments/dome scanners/yoke/chin pod, asymmetric console
  pods (left is the throttle pod carrying the speed strip). Grafted from
  the losers: aerial cool-shift toward PAL.mist on far steel, doubled
  far-window rim (frame thickness), joint gussets, visor edge. Sway and
  shake scale by z (near drifts ~1.4x, far ~0.3x) - real parallax.
- Ship select: boot opens on a pick overlay (1/2/3); ?ship=name skips it.
  ships.js: kestrel (balanced, hull 3), dart (fast+twitchy, hull 2,
  scoreMul 0.9), mule (heavy, hull 4, scoreMul 1.2). Ship sets
  cam.thrustK/capK/turnK and rebuilds the cockpit with canopy shape
  params (width/roof/dash). Persisted in space.ship; R after game over
  relaunches the same hull, 1/2/3 there switches it.
- Pick overlay now previews: clicking a ship row or pressing 1/2/3
  rebuilds the live cockpit behind the overlay (canopy shape + hull
  pips reflect the choice) without launching; Enter/Space or the launch
  button starts the run. Post-game-over, 1/2/3 still switches hull
  before R relaunches.
- Radar scope: kind 6 dial + kind 7 blips on the right dash. 24 blips
  project contacts onto the cam right/fwd plane each frame - 12 hostile
  slots (red), 8 pickups (green), 4 on the next gate (sky diamond).
  Out-of-range contacts clamp to the rim; far ones dim. Needs `world`
  ({ent, course}) passed to cockpit.frame. Gotcha: blips hidden at boot
  zeroed size[] and the lit path never restored it - first render was
  dial-only until size[p]=1.35 went into the on-branch.
- Free roll: the +/-1.1 rad roll clamp is gone - Q/E spin without limit
  and the SHIP attitude sticks permanently (verified: roll 3.02 held,
  still 3.96 five seconds after release). Bank assist eases toward
  turn-bank only within 0.75 rad of the nearest level attitude (mod 2pi
  via signed error, so a full spin back to level still counts).
- Visor counter-roll self-levels: cam.visor (read by deck.js shell +
  cockpit.js reticle/motes) tracks clamp(-roll, .36)*.4 instantly, then
  fades to upright ~2s after the last Q/E input (cam.levelT) - the
  interior straightens, the ship doesn't. Verified: visor -0.144 held,
  0 after 5s.
- Body-frame steering: yv/pv now turn about the ship's own up/right
  axes, converted to Euler rates each frame (yaw' = (pv*sr+yv*cr)/cp,
  pitch' = pv*cr-yv*sr, roll' = rv+yaw'*sp). Rolled 90deg and pressing
  up pitches toward canopy-up, verified live: fwd [0,0,-1] -> [-0.998,
  0,-0.068] at roll=pi/2. cam.yaw/pitch/roll stay authoritative so all
  readers/tests are unchanged. Pitch still clamped +/-1.2 (keeps cp
  away from 0 and blocks somersaults - reach any attitude via roll).

## Solid cockpit deck (session 3)
What changed:
- The particle-dot interior is gone. New `deck.js` draws a solid opaque
  cockpit on `<canvas id="deck">` (z-index between the GL canvas and the
  HUD, pointer-events none, sized W*H*dpr). Static hull geometry is
  pre-rendered into two offscreen layers - far windscreen trapezoid +
  tapered connector struts, near visor band + A-pillars + wraparound dash
  + console pods + recessed housings - composited per frame with
  depth-scaled sway (far 0.4x, near 1x), the same vvx/vvy/ox/oy/jitter
  inputs the particle cockpit used, plus a small speedK vibration.
  Counter-roll stays capped at ~14deg.
- Instruments are a table `[{id,label,x,y,w,h|r,rot,draw}]` in cockpit
  units; each draw(ctx, st) reads st = {run, cam, world, deckT, blink}.
  SPD digits + speedK segment bar + BST bar (left pod), NAV SCR/BEST/
  COMBO/DIST + WRN lamps (HOSTILES/HULL/SHLD) + COM status line (center),
  RDR scope + SYS HULL/SHLD bars + life pips (right). Side pods rotate
  +/-5deg toward the pilot. Radar blips use the old kind-7 projection
  (right/fwd plane, RANGE 1800, clamp to rim; red/green/sky-diamond).
- `deck.hit()` drives a red edge vignette + lamp pulse; instruments
  flicker while run.invuln > 0. Called beside every cockpit.shed call.
- cockpit.js keeps only motes + reticle + compass arrow (kind 2/5);
  shed() still works, motes scatter. Layer share 16% -> 3%, freed budget
  went to stars +7, ent +3, course +3.
- hud.js no longer writes corner readouts (hud-tr/hud-bl removed;
  hud-tl stays for the WebGL boot error). hud-msg is display:none and
  acts as the message store - the deck reads textContent + the opacity
  flag and renders flashes on the COM line. Pick overlay, game-over
  board, hud-keys unchanged.
- `deck.paint(ship)` rebuilds both layers on pickShip with the same
  w/roof/dashY mapping, so hull previews reshape the interior live.
- New `deckshots.mjs` writes shots/space-deck-{boot,race,fight,hit}.png
  and probes deck alpha (reticle pixel transparent, dash opaque) plus
  lamp/blip pixel counts. `__space.deck` exposed for probing.
- Layer split fix on deck landing: fx.lo moved cut(0.85) -> cut(0.86) -
  the rebalanced split overlapped the last 1% of stars with fx.

## Frame-driven cockpit (session 4)
What changed:
- New `frames.js`: FRAMES table, one entry per ship name. Units are
  normalized cockpit space (x -1..1 -> cx, y up -1..1 -> cy); every member
  carries z depth (0.9 far glass .. 4.8 nearest steel). Spec shape:
  panes (open glass polys), struts (tapered beams p0/p1/w0/w1/z0/z1),
  bands (e0 away edge + e1 glass edge strips, `loop` = closed ring),
  pods (plate polys), lamps (blinking dash points), inst (housing rects
  per ship - same SPD/NAV/WRN/COM/RDR/SYS table, positions shift to fit).
- deck.js now paints the backing: opaque near-black shell over the whole
  canvas with panes punched via destination-out, then members shaded by
  depth (mean z < 2.4 draws on the far 0.4x-sway layer), housings, then
  live instruments. The w/roof/dashY ship stretch is gone - ships.js
  hulls differ by FRAMES topology, not by rescaling.
- Z-order flip: createField got {zIndex: 6, transparent: true} - the GL
  canvas rides ABOVE the deck canvas (z5) so particle structure draws on
  the opaque backing. Side effect: world particles share that canvas and
  would draw over the hull, so deck.cull(ranges) runs after deck.frame
  and snap-parks any homed world home that lands outside the panes.
  Far members inside a pane (deep rims, connector struts) also block via
  segment-distance tests, so stars can't shine through the deep frame.
  Unhomed drifters (fx debris, shed particles) pass over the hull -
  reads as interior sparks, not a leak.
- cockpit.js emits structure from the same FRAMES: strut edge pairs
  (inner edge bright, outer dim - centered members run both bright),
  rivet runs along pane/pod borders, gusset knots at strut joints, pod
  corner bolts, blinking lamps. Arclength sampling: point spacing is
  weighted-total-length / budget, so density stays even when topology
  changes. Per-point z drives perspective size and sway gain
  (zk = 0.2 + z*0.25). shed() unchanged but now scatters structure;
  kinds 2/5 (reticle, arrow) stay protected.
- Layer split: cockpit .03 -> .11 (800-815 structure pts + ~175 motes at
  N=9000), funded by stars -.04, course -.02, ent -.02. Ships verified
  visually distinct: kestrel trapezoid canopy, dart twin slit + center
  spine, mule panoramic + brow slab. New `frame` scenario in check.mjs
  (SPACE_QS=ship=name) writes space-frame.png per ship.

## Cockpit face grain (session 5)
What changed:
- cockpit.js emits a new kind 8 (face grain) on top of the edge runs:
  strut quads, band interiors, pod plates, and per-frame `fills` polys
  all scatter dim steel inside their faces. Samplers are area-weighted
  (centroid-fan triangles for polys, segment-trapezoid for band strips,
  stratified u along struts) so density reads even, and fill points
  carry the same per-point z as the edges - near faces brighten and
  sway more.
- frames.js grew a `fills` array per ship: dash face trapezoid under
  the pane bottoms (den ~1.8), ceiling/visor underside (den ~0.3), and
  side plates for kestrel/dart (den 1.0-1.3). Visor top edges are
  hoisted consts shared by the brow band e0 and the ceiling poly.
- Budget: layer cockpit .11 -> .16 (~1450 pts at N=9000), funded by
  stars .21 -> .17 and course -.01. Edges claim ~42% of the layer
  (STR_TGT), face grain soaks exactly what motes+edges leave and rides
  the pts tail, so residual overflow only ever trims grain. shed()
  releases kind 8 like any structure point; reticle/arrow stay immune.
- Grain lum is ~0.24-0.36 of the bright edge tone, size ~1.25: hull
  plates read as dark matter against open glass, and pane interiors
  stay particle-free (glass lit fraction unchanged in fillshots.mjs
  metrics). New fillshots.mjs shoots space-fill-{kestrel,dart,mule}.png
  and diffs hull coverage against the space-frame-* baselines.

## Grain density tuning (session 5 cont.)
The first grain pass used size-1.25 points at ~0.3 edge lum spread over
whole plates - it read as fireflies, not surface. Retuned: grain size
0.62, lum ~0.10-0.17 of the edge tone, and cockpit share .16 -> .19
(~1530 pts) funded by course -.01 and stars -.02 so more of the budget
lands on faces. Edge budget share 42% -> 36%. Result: hull reads as dim
particle texture under bright dotted edges. Rechecked boot/race/fight/
over - zero console errors.

## Particles out of the hull (session 5 cont.)
User direction: particles build the world; the ship interior is solid.
cockpit.js is back to only what floats in the view volume - shield
motes, reticle, compass arrow (53 pts + 180 motes). All structural
particle kinds (edges, rivets, gussets, bolts, face grain) are gone;
the deck canvas alone renders struts, bands, pods, backing. Frame
lamps moved into deck.frame so the blinking dash indicators survive.
frames.js `fills` data removed as dead; budget rebalanced cockpit
.19 -> .05, course .27, stars .26, planets .13, ent .15, fx .14.
Full 15-scenario suite green, zero console errors.

## Enemy tuning + debris fix (session 5 cont.)
- Bug: released entity particles (killShip, pickup take, reset) set
  homed=0 and drifted forever - dead ships left scattered dots over the
  hull because deck.cull only parks homed particles. Fix: release()
  records each range in a dead list; ent.frame parks it after ~1.2s.
- Enemies are bigger (SHIP_SCALE 1.6 -> 2.3), slower (spd 300+diff*90
  -> 190+diff*55), and die in one bolt (hp 1, hit radius 22 -> 30).
  Kill pays +250 (was +150).
- Ships disengage after 20s or when outrun past 1700wu - "leave"
  state steers them away and despawns at range, so a wave can be
  fought for bonus points or ignored while racing. "wave clear +200"
  fires either way once no hostiles remain.
- Gate spacing widened ~30%: gateGap 560+min(420,d*.02)+140r ->
  740+min(560,d*.026)+180r.

## Alive sky + depth-crush fix (session 5 cont.)
The empty sky was a projection bug, not density: cam.project maps world
range to home.z = perspZ*(1-vz/90), so anything past ~500wu crushed the
shader's sprite-scale term to near zero (same issue the sun needed
pinned for). Fixes:
- stars carry a baked sZ (0.55 deep .. 1.6 hero) instead of real depth;
  depth cue lives in size/lum. Nebula 0.9, band 0.85.
- gates/rocks clamp z at -4, planets at -3, ships/bolts/picks at -5,
  dust pins 1.1 - distant things floor at readable sprite size instead
  of sub-pixel. Planet surfaces now fill instead of ring-only.
- Star content: share .26 -> .34, nebula clouds 4 -> 6 at ~14% of the
  layer, ~25% of stars form a galactic band stripe fixed in world space
  (navigable landmark), 10% of normal stars tint pale blue or amber,
  ~12% twinkle via per-star speed in sTw. Gates: radius 19-34 ->
  26-46wu, gap +30%. Kills pay +250, enemies bigger/slower/one-shot
  and disengage after 20s or 1700wu so waves are optional bonus.

## Pickup labels + chase view (session 6)
What changed:
- Pickup tags: deck.js frame pass projects each live pickup
  (`world.ent.picks`, `!pk.taken`) through cam.project and draws a small
  monospace tag beside it - "BST"/"HUL"/"SHD" in the ring's palette
  color, ~10px mono, raw projected position (world objects: no sway/roll
  transform), skipped past 2500wu. Pick overlay gained a one-line legend
  in .hint style explaining the three kinds.
- Third-person chase view, chosen at pick time only. Picker has a
  cockpit/chase row (clickable, V toggles, .cur highlight like .ship).
  Persisted in `space.view`, `?view=chase` selects directly, `?ship=`
  still skips the picker. hud.showPick signature grew view + onView.
- camera.js: `cam.chase` flag. cam.x/y/z stays the SHIP position (physics
  untouched); project() subtracts the eye offset `(-fwd*150 + up*42)` and
  applies a small view-space down-tilt (-0.08 rad) so the hull reads
  center-low. Shake/sway unchanged. In chase, project() also uses the
  LAGGED view basis cam.vr/vu/vf (lerp toward right/up/fwd at 4.2/s,
  re-orthonormalized) instead of the true basis - the hull body still
  draws on the true basis, so it visibly banks and swings while the
  camera catches up (racing-cam feel). Verified: hull PCA tilt -25deg
  mid-roll, ~0 at rest.
- New `exterior.js`: one baked particle silhouette per ship name
  (kestrel 412 fighter w/ swept wings + twin tail fins, dart 378 narrow
  interceptor, mule 380 boxy hauler + chunky engine block), body space
  facing -z, ~380-410 pts on the cockpit layer's tail
  `[cockpit.lo + cockpit.used, hi)`. Per frame rotated by cam's
  right/up/-fwd basis around the ship anchor with a small velocity lag +
  hover bob; steel-mist hull, hot/accent engine glow (flares on boost),
  sky canopy/wingtips. cockpit.js owns only `[0, used)` now (frame loop +
  shed bound) so the two never contend.
- Layer split: cockpit 5% -> 10% (~900 pts: 180 motes + 53 reticle/arrow
  + ~400 hull), funded by course -2, stars -2, fx -1.
- deck.setView(mode): chase paints no backing/members/pane cutouts;
  the same INST draw fns repack into a bottom floating-HUD strip on a
  faint dark band. deck.cull returns early in chase (no panes - every
  world particle is visible).
- Shield motes in chase orbit the ship: a world-space ring (26wu, cam
  right/up plane at the hull anchor) projected through cam.project
  instead of the screen-space ellipse. Reticle + compass arrow stay
  (aim/nav still needed); reticle dims to 0.85x in chase.
- check.mjs: `goto` step type + `third` scenario (?ship=X&view=chase,
  probes exterior pts homed near center-low + phase) + `tag` scenario
  (three staged pickups, screenshots labels). Suite green both modes.

## Hostile target boxes (session 7)
- Hostiles always read hostile: hull tint is red-steel (HULL
  [0.72,.42,.40] replacing PAL.mist), wingtips + engine glow are red, and
  the last MARK=16 pts of each ship body bake render as a dotted red
  target box - the screen-space bounding box of the ship's projected
  hull, padded 18px, 4 pts per side, skipped when the ship is fully
  offscreen. Verified via shots/space-box.png (box scenario pins a live
  hostile 700wu ahead).
- Dart canopy reworked: the twin side-slits left the center blind, so
  it is now one wide hexagonal windscreen (x +/-0.66) with a slim spine
  strut over the glass as a mullion - struts gained an optional blk
  flag that forces them into deck.cull's BLK mask so stars hide behind
  the spine properly.
- Dart v2: pane top notch + rim dip removed (the black wedges flanking
  the mullion) - pane is a flat-top quad windscreen, spine slimmed to
  0.022/0.038.
- Leave-despawn bug: a ship breaking off called release() (the kill
  scatter) so departing hostiles looked like they exploded. Now
  park()s quietly.
- Killfeed: hud.flash pushes {text,col,t} into hud.feed (cap 8, world
  exposes it); deck draws up to 4 recent popups stacked under the
  reticle, fading over 3.5s, color-coded per event kind (kill red, BST
  gold, HUL green, SHD blue - same palette as the pickup rings/tags).
- Cull mask fix: strut BLK half-width used w in unit space but beams
  paint w*cy px - a vertical beam's perpendicular lands on x, so the
  mask ran cy/cx wider than the paint and ate particles in a dead band
  beside dart's spine. Now hw = w * (vertical ? cy/cx : 1) + 0.006.
- Guns always hot: firing moved out of the fight-phase gate - space
  fires in race/over phases too; bolts harmlessly time out with no
  targets (check.mjs "fire" scenario probes 7 live bolts at hostiles 0).
- Chase exterior glow-up: two new body kinds baked per ship - kind 3
  exhaust wash (50-58 pts, baked as 0..1 trail params off each ship's
  tail z, stretched by cam.speedK and flared on boost, jitter-wobbles
  and fades downstream) and kinds 4/5 wingtip strobes (port red /
  starboard green, hard blink via sin(extT*4.4)). All on the same
  exterior layer range, still fully particle-built.
- Enemy durability + wave ramp: hostiles back to hp 3 (three bolts to
  kill, +250 each). Wave size now keys off gatesPassed - 1 hostile
  under 8 gates, +1 per ~8 gates, capped by the pool. Ship pool raised
  3 -> 5 (SHIP_PTS 380 -> 340 to fit), picks to 8, bolts ~32. Layer
  split rebalanced: ent 15% -> 26%, course 21% -> 19%, planets 11% ->
  8%, stars 32% -> 26% (sky still dense after the depth-size fix).
  Kill feed shows "N hostiles inbound" per wave.
- Lives 3 -> 5 (init + restart); PWR panel LIVES pips row reflowed to
  five dots.

## Feature batch: audio, kinds, intercept, derelict, sun, glare (session 8)
- New `audio.js`: `createAudio()` lazily builds a WebAudio graph on the
  first user gesture (index.js calls `au.unlock()` from the picker
  launch, any keydown, and pointerdown - no context before a gesture,
  and every method no-ops until one exists). `au.engine(speedK, boosting)` runs per frame: detuned saws
  through a lowpass, pitch+gain rise with speedK, extra bite on boost.
  `au.sfx(name)` fires quiet one-shots for bolt/kill/gate/hit/pick/wave/
  over. M toggles mute (master gain 0, restored on unmute). Wired in
  index.js: fire, killShip, gate pass, crash/pickup, fight start,
  game over.
- Boost streaks in fx.js: ~60 fx-layer points parked offscreen at
  idle; above speedK ~0.5 they spawn on screen-space rays from frame
  center, radiate outward growing into streak motes (size+alpha scale
  with speedK), and wrap back near center past the screen edge. Same
  homed WORLD range, so deck.cull keeps them inside the panes.
- Enemy kinds in entities.js: a `KINDS` registry carries
  {bake, hp, score, spdMul, hitR, drop} per type. fighter unchanged
  (hp 3, +250). drone is a compact ~25wu dart (hp 1, +50, 1.4x speed,
  hitR 18). heavy is a ~90wu boxy bruiser (hp 5, +500, 0.7x speed,
  hitR 55, guaranteed pickup). Waves 1-2 are fighter-only; wave 3+
  mixes drones; every ~4th wave or a 25% roll adds exactly one heavy.
  Red-steel hull + dotted target box apply to every kind via the same
  bake tail. Killfeed prints "drone +50" etc; index.js pays ship.score.
- Shootable hostile bolts: ent.frame walks player bolts (hostile
  false) against live hostile bolts; under ~25wu both die, a small fx
  burst fires at the midpoint, and a ctx.onIntercept callback pays +15
  with killfeed "intercepted +15". Pairwise over the ~32-bolt pool.
- Derelict capital ship in course.js: ~257 pts baked along local x -
  spine girder, hull slabs swelling amidships, tower + dish, dead
  engine block, sparse warm windows, 2-pt red beacon blinking slow.
  World-anchored, tumbles ~0.05 rad/s about a baked perpendicular.
  Spawns 1200-2600wu off the racing line ahead (first 3.5-7k, then
  every ~9-14k), respawns once the camera passes it. Lives on the
  planets layer (grown back to ~11% by taking 3 from stars - course
  had no slack), renders through cam.project floored at home.z -3.
  `course.landmark` exposes {lo, n, x, y, z, D, U, V, spin} for probes.
  Confirmed gotcha: deck.cull's strut blocker mask legitimately eats
  it when it drifts behind a canopy member - pin probes to clear
  glass.
- Sun rework in course.js: ~150 pts - dense bright core gradient,
  faint corona shell, and sparse radial ray clusters baked around the
  disc; ray arms slowly precess (angle advanced per frame). Still
  rides with the camera at 30k on the fixed SUN direction, still the
  planet lighting source, home.z still pinned 0.
- Canopy glare in deck.js: cockpit view only, when course.sunVis the
  projected sun position gets a soft warm radial-gradient blob drawn
  on the deck canvas, clipped to the pane paths only (same polys the
  backing cutouts use) - it lights the glass, never the hull plates
  or struts, and is skipped in chase.
- Layer split: planets 8% -> 11% (sun 150 + landmark ~257 + 3 planets
  still ~124 shell each), stars 26% -> 23%.
- check.mjs `warcry` scenario: spawns drone+heavy (hp/score probes),
  parks a hostile bolt on a player bolt (dScore +15, both dead), pins
  the derelict in clear glass broadside (lmVis 257, screenshot), rides
  W+Shift to speedK 1.0 (streak screenshot), then aims the nose at SUN
  (sunVis + sunXY probes, glare screenshot). Full 24-scenario suite
  green, zero console errors.
- Band cull mask fix (all visors): the mask put a blocker ring on EACH
  band edge with radius thickness/2 + 0.01, so the inner ring ate
  t/2+0.01 into open glass - a dead particle band tracing every pane
  rim on all three ships. Now one ring on the strip midline with
  hw = max(t0,t1)/2 + 0.004 - matches the painted strip plus a hair.
- Derelict glow-up: cap 260 -> ~400 pts. Cold RIM-lit dorsal edges so
  the silhouette reads at range, brighter window rows + a tower
  cluster, 12 ember pts flickering like dying fires (sin hash per pt),
  and a ~70-pt debris cloud co-tumbling with the hull. Beacon blink
  brighter. Planets layer grown 11% -> 13% (stars 23% -> 21%).
