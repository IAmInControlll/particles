# Requests: Spaceship (Voidrunner)

## Engine gaps
- None blocking. `field.noFlock` covered the rigid-body layers (cockpit,
  gates, rocks, ships, bolts, pickups) exactly as documented.
- Nice-to-have: per-group flocking disable is already handled by
  `noFlock[]`. The plan's open question about a per-group flag resolved
  without an engine change.
- Nice-to-have: `home.z` semantics (d = perspZ / max(perspMin, perspZ - z))
  are only documented implicitly in the shader. A line in engine.md noting
  "positive z = nearer, larger sprite" would help future creations.

## Hub integration
- [x] hub card: "Voidrunner" -> space.html (page exists and boots clean;
  ready to link)

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
