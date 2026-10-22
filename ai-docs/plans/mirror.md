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

- Refresh rate vs jarring re-morphs. 4Hz is the starting guess; the
  director's own transition stagger may smooth it for free.
- Mirrored sampling (flip x) feels natural, like a mirror. Default flipped.
- Whether to also show a faint live video inset for the "aha" association.
  Probably not; the swarm IS the video.
