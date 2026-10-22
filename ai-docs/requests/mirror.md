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
  PAGES entry in src/pages/home.js still says `soon: true` - that file
  is outside my ownership, flipping it is a one-line edit for whoever
  owns the hub)

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
