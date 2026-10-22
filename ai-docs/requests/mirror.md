# Requests: Mirror

## Engine gaps
- None. The mutable point-list scene (scene fn closing over a flat
  Float32Array store, mutated in place ~4Hz) works through the stock
  director; `dir.homes()` re-evaluates every frame and springs chase the
  new targets. No re-register per sample needed.
- Note: `PF.pick` cannot index a flat typed array, so the scene fn
  inlines its exact formula `(i * count / N) | 0` on the dense prefix.
  Uniform coverage preserved; worth knowing if the engine ever wants a
  flat-buffer `pick` variant.

## Hub integration
- [x] hub card: Mirror -> mirror.html (page is linkable and verified;
  PAGES entry flipped to a live link by the hub owner)

## Shared helpers
- `src/creations/mirror/sampler.js` is engine-free (no src/engine
  imports; takes a caller-supplied store `{buf, count, cap}`) and is
  deliberately shaped to promote to `src/lib/sampler.js` unchanged when
  Telepresence needs webcam sampling. I did not create it under src/lib/
  to avoid colliding with the Telepresence lane working concurrently.

## Collisions / notes
- Fallback scene reuses `makeScenes(field).spiral` from
  src/scenes/scenes.js (import only, no edits) for every non-self gap:
  permission prompt, denial, disconnect, and >2.5s of empty frames.
- localStorage: none needed; the browser's own permission store covers
  denial and #status click retries.
- Verified headless via a private chrome-headless-shell with
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream:
  live/edges/fallback states, zero console errors, shots/mirror-*.png.
  Headless denial surfaces as `NotSupportedError` (headless shell lacks
  a real device path), which maps to the generic "camera unavailable"
  message; the click-to-retry affordance is wired.

## Polish pass (post-review, session 2+)

- Pointer model per user direction: full engine verbs - hover repel,
  LMB pull, close-range capture orbit, release fling (default
  `canPull`, exempts interactive DOM). A `field.canPull = () => false`
  phase was tried and reverted. Silhouette runs unsnapped so pointer
  forces can displace it; the jump-snap rule in scene.js keeps camera
  tracking instant while scatter still springs home.
- Segmentation/distribution reworked over three feedback rounds:
  border-mean luminance -> border-mean RGB distance, frame-mean speckle
  -> hysteresis + 3x3 blur + temporal blend, ordinal pick mapping ->
  fixed cell stations + chamfer nearest-emitter resolve (the old mapping
  retargeted the whole swarm on count wobble), plus silhouette fill
  (close+flood+low-dev interior emit) and emit-list share-loading.
- Grid 240 long side, camera request 640, sample interval 33ms, N 12000
  desktop / 5000 mobile, emit buffer 4N, `spring` 0.09.
- Viewfinder: first ~7% of indices draw the sampled rect's perimeter,
  `out[3]=1` snapped, `?flip=0` disables the mirror transform.
- `window.__mirror.field` exposes the field for headless probes.
