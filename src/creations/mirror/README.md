# Mirror

The swarm continuously forms your webcam silhouette. Frames are sampled
locally into a point cloud and registered as a mutable scene; the swarm
morphs to follow. Nothing is uploaded - the video never leaves the tab.

Page: `/mirror.html`. Driver: `src/pages/mirror.js`. Debug: `window.__mirror`.

## Files

- `index.js` - `createMirror({PF, field, dir, statusEl})` -> `{open, tick}`.
  Owns the camera state machine, the resample driver, all `dir.play`
  calls, the viewfinder-rect containment pass, and `__mirror`.
- `sampler.js` - webcam capture + pixel -> point decode into a flat
  store. Engine-free (no `src/engine` imports). Sole writer of the
  store's `buf`/`count`/`cellT`.
- `scene.js` - the "self" scene fn. Sole reader of the store. Maps
  particles to fixed cell stations, writes real camera colors, and owns
  the jump-snap retarget rule.

## Runtime state

`__mirror.state`: `boot` -> `prompting` -> `live` | `fallback`.
`live` requires a granted, producing stream. `fallback` covers denial,
no device, disconnect (`track.onended`), or getUserMedia failure; the
status line is clickable and retries `open()`.

Scenes: `ambient` (spiral, always registered first, covers prompt
wait/denial/walk-away) and `self` (registered on first successful
`open`). `played` tracks the last `dir.play` target. While `live`, a
2.5s grace (`GRACE_MS`) of empty/invalid samples triggers a morph back
to `ambient`; a good sample morphs back to `self`.

Sampling cadence is `SAMPLE_MS` = 33ms (~27Hz measured). Under
`PF.reduce` it drops to 1000ms. `visibilitychange` calls
`sampler.setPaused(document.hidden)`.

## The store

One `Float32Array` of `4N` points, stride `PT.STRIDE` = 7:

    X, Y      design-space point (rect = [-a/2..a/2] x [-0.5..0.5], a=W/H)
    SHADE     blurred luminance 0..1
    EDGE      1 when the cell is an edges-mode contour point
    R, G, B   camera color 0..1

`store.cap` = `4N` bounds the emit set by construction (`strideOf` grows
the emit stride until `WH/s^2 <= cap`). `store.cellT` maps every cell of
the sampling grid to the buf slot of its nearest emitted point;
`store.cellEmit` marks cells that emitted themselves.

## Sampling pipeline (`sampler.read(store)`)

1. `drawImage` into a WxH canvas (longest side 280, aspect preserved;
   mirrored unless `?flip=0`), `getImageData`, temporal blend `0.5` into
   `lum`/`cr`/`cg`/`cb`, then a 3x3 box blur into `blur`.
2. `borderStats()` estimates background RGB + luminance std from the
   frame's outer ~6% ring. Threshold `t = THRESH + 1.5*std`
   (`THRESH` = 30 RGB distance); hysteresis low bar `lo = 0.6t`.
3. `fillLum`: per-cell squared RGB distance from the border background;
   hysteresis enters at `t2`, leaves below `lo2`. `fillEdges` (mode
   `edges`): Sobel `grad` hysteresis around `EDGE_T` = 60 emits contour
   points (flag `EDGE`), plus interior at half rate on the same RGB test.
4. `fillInterior`: emit-mask -> 2-cell dilation -> exterior flood fill
   from borders -> enclosed cells emit only when their own deviation
   still exceeds `0.35t` (permissive inside contours, strict outside).
5. Chamfer (two-pass distance transform) writes `cellT`: every cell ->
   nearest emit cell's buf slot. Empty read keeps the previous store
   (`count` restored) and returns `false`.

Camera request: `{video: {width: {ideal: 640}, facingMode: {ideal: "user"}},
audio: false}` - `ideal`, never required, so virtual cams (phone bridges,
OBS, DroidCam) can't `OverconstrainedError`.

## Scene mapping (`scene.js`)

First `K = min(600, N*0.07)` indices draw the viewfinder: the sampled
rect's perimeter in design space, gray edge, accent corner ticks,
permanently snapped (`out[3] = 1`).

The remaining `M = N - K` particles each own a fixed cell station
`(i-K)*cells/M`. Per frame: station -> `cellT[st]` -> emit slot.
Stations whose own cell didn't emit share-load across a ~5% window of
the emit list (spreads density along the contour instead of piling on
one cell). Cell-sized dither via `h2`/`h3` spreads stacked particles
over the emit cell.

Color: raw camera `R/G/B` (edge contours get a 70% accent mix and full
size). `out[2]` = luminance relief `(shade-0.5)*0.52 + hair` - bright
pulls nearer, dim recedes; `size` follows shade (`0.6 + 0.9*shade`).

**Jump-snap rule**: the scene keeps each particle's previous design-space
home. A home delta > `0.024` sets `out[3] = 1`, so camera motion and
cell retargets *teleport* particles (the feed tracks at sample rate,
no smear). A repelled particle's home does not change, so hover scatter
still flies back through the spring.

## Interaction

- Hover repel: active everywhere (default `mouseZone`).
- LMB drag: pull toward the cursor; close range captures into an
  accretion orbit; release flings (engine defaults - `canPull` only
  exempts interactive DOM targets).
- `field.noFlock.fill(1)` - flocking smears the silhouette; off.
- `e` toggles `lum` <-> `edges` live; `?s=edges` sets the boot mode.
- `?flip=0` disables the mirror transform (raw camera orientation).

Containment (`index.js::contain`, runs every `tick` while `self` is
played and the transition has completed): silhouette positions are
clamped to the camera rect inflated 1.24x (covers the ~22% perspective
overshoot from z-relief at `perspZ` 9). A particle inside the cursor's
actual repel radius stamps `excT`; outside the rect it has ~0.5s to fly
back before the clamp. Mid-morph and despawned (unhomed) particles are
exempt. Viewfinder particles are snapped so they never leave.

## Page CFG overrides (`src/pages/mirror.js`)

    spring 0.12        tracking stiffness (scatter regroups fast)
    transStagger 0.5   must satisfy transSpeed - stagMax*transStagger > 1
    touchPull true
    heatGain 0.08      velocity white-out, kept low for color accuracy
    twinkle 0.05, colVar 0.02, pointScale 0.005
    N: 16000 desktop / 5000 mobile

`N*4` must stay >= the stride-1 cell count of the camera's grid
(280px longest side -> 58,800 cells at 4:3) or the emit stride falls
back to 2.

## Known limits

- Geometric fill is not semantic segmentation: background enclosed by a
  strong contour (furniture inside your outline) can still emit.
- Border-ring background estimate assumes a centered subject; a figure
  pressed against a frame edge can contaminate the estimate.
- Dense bright regions still read hot - additive point sprites
  brighten where they stack; there is no tone mapping.
- `THRESH`/`EDGE_T` are global constants; extreme lighting may want a
  pass on them.
