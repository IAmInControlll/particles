# Mirror

The swarm continuously forms you. Webcam frames are sampled into a point
cloud and registered as a scene; the swarm morphs to follow. Move and it
shatters, then re-forms. Priority: sub (owner designated).

Files: `mirror.html`, `mirror.js`. Hub card: "Mirror".

## Sampler pipeline

1. `getUserMedia({ video: { width: 320 } })` into a hidden `<video>`.
2. Every ~250ms draw to a small offscreen canvas (~160x120), read ImageData.
3. Convert to a point list. `PF.textPoints`-style stride loop keeps
   `pts.length <= field.N`.
4. Rebuild the scene fn's point list in place (the fn closes over a mutable
   `pts` array) and let the swarm re-home. No re-register per frame.
5. Palette from the frame too: sample average luminance per region or just
   ink/mist with accent particles on edges.

Sampler versions, in order: v1 luminance-threshold silhouette. v2 edge
detection plus luminance shading for facial detail. v2 is an upgrade of the
same creation, not a new one.

## Graceful paths

- No camera / denied permission: show a message and fall back to a scene
  from `PF.makeScenes` so the page is never empty.
- `PF.reduce` (prefers-reduced-motion): keep the silhouette static, skip
  re-sampling, or drop to a much slower refresh.

## Interactions

All built-in pointer verbs work on the formed silhouette. Hover repel
shatters part of your face; press-hold captures chunks into orbit; release
flings them and they re-home. That shatter-reform loop is the wow moment.

## Build steps

1. [x] Page scaffold + camera permission flow + fallback.
2. [x] v1 silhouette: threshold to point list, register "self" scene, play.
3. [x] Live re-sampling loop; verify morphs track movement without stutter.
4. [x] v2 edge + luminance sampler behind a query flag (`?s=edges`).
5. [x] Polish: palette tuning, mobile camera handling, privacy note on page
   (all processing is client-side, nothing leaves the machine).

Built: `mirror.html`, `src/pages/mirror.js`,
`src/creations/mirror/{index,sampler,scene}.js`. Ambient spiral covers
prompt/denial/disconnect/empty-frame gaps; deviation-from-mean
thresholding; `window.__mirror` + `#status[data-mode]` for headless
checks. Verified: shots/mirror-{live,edges,fallback}.png.

## Open questions

- Refresh rate vs jarring re-morphs. Resolved: 150ms (~7Hz) after the
  "too slow" report; per-sample deltas are small enough that springs
  track without pulsing. `PF.reduce` still drops to 1Hz.
- Mirrored sampling (flip x) feels natural, like a mirror. Default
  flipped; `?flip=0` disables for debugging.
- Whether to also show a faint live video inset for the "aha" association.
  Probably not; the swarm IS the video.

## Fidelity notes (post-review tuning)

- Segmentation is border-sampled background estimation (outer ~6% ring
  mean + std), not frame-mean deviation - a large figure no longer emits
  its own backdrop. Threshold is `THRESH + borderStd`, noise-adaptive.
- `lum` scratch is temporally blended (0.5) then 3x3 box-blurred into a
  second scratch; kernels read the blurred field. Kills speckle flicker.
- Emission set is hysteretic: join at `|dev| > t`, leave only at
  `|dev| < 0.6t` (same for EDGE_T edges). Boundary pixels can't flicker.
- Particle->point mapping is SPATIAL, not ordinal: each particle owns a
  fixed cell of the emit grid (`(i-K)*cells/M`), resolved per sample by a
  two-pass chamfer transform to its nearest emitted slot. The old
  proportional-list mapping retargeted the whole swarm on every count
  wobble - that was the "pixels jumping" bug (probe: 6474 of 8370
  particles >20px from home). After: half the swarm sits <5px, out-of-frame
  strays 672 -> 14, and coverage is edge-dense.
- Viewfinder: the first ~7% of scene indices trace the sampled rect's
  perimeter in design space (mist edge, accent corners), `out[3]=1`
  snapped so the border never drifts.
- Refresh is 33ms (~30Hz, video cadence); camera requested at 640 and the
  sample grid is 240 on the long side. Emit buffer is 4N so count is not
  swarm-capped.
- Segmentation is RGB distance from the border background (skin vs wall
  separates at equal brightness); interior holes emit only when their own
  color still deviates past 0.35t - "permissive inside contours, strict
  outside". Background stations share-load over a ~5% window of the emit
  list instead of piling on the single nearest cell.
- RESTORED: "all pointer verbs work on the formed silhouette" - a
  clicks-dead phase (`field.canPull = () => false`) was tried and
  reverted per user direction; LMB pull/capture/fling are live again.
  Silhouette particles are spring-homed, NOT snapped - snap teleports
  before the force stage and would eat repel. The viewfinder stays
  snapped + noWell so the frame never jitters.
- All particles run `noFlock` - flocking smeared the silhouette and was
  the per-frame hot cost. `spring: 0.07`, `heatGain: 0.5`, `twinkle:
  0.05`, `pointScale: 0.005` for crispness.
- Duplicated particles get sub-pixel dither (+-0.5px via h2/h3) so a
  sparse point list reads dense instead of gridded.
- Grid dims preserve camera aspect on the longest side (portrait cams
  used to squash into 160x160).
