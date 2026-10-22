# Particle Playground

WebGL point-sprite particle engine with a live control panel. Original code;
architecture is a reimplementation of the technique studied on a production
site (point sprites + spring homing + flocking + drift + pointer forces).

## Run

```
node tools/serve.js     # http://localhost:8321
node tools/verify.mjs   # headless-browser check, screenshots -> shots/
```

ES modules, no build. Pages import `PF` from `src/engine/index.js`.
`/` is the hub, linking to `playground.html` and future creation pages.

**Read before building a creation:** `ai-docs/engine.md` (the engine
contract - what you may use, and the no-edits rule) and
`ai-docs/creation-structure.md` (per-creation file layout).

## Layout

- `index.html`, `playground.html` — entry pages; each loads one module
  script from `src/pages/`.
- `src/engine/core.js` — CFG (all tunables), PAL (palette), seeded `rnd`/
  `reseed`, `ease`, `pick` (uniform point-list sampling), `textPoints`
  (text rasterizer), `reduce`/`isMobile`.
- `src/engine/field.js` — `createField({N})`: typed-array state, WebGL
  point-sprite renderer, physics step (spring homing, flocking, drift,
  pointer forces, exclusion rects), context-loss recovery.
- `src/engine/director.js` — `createDirector(field)`: scene registry,
  `play(name)` transitions, `homes()` per-frame target writer.
- `src/engine/index.js` — assembles the `PF` API object; also sets
  `window.PF` for console debugging.
- `src/scenes/scenes.js` — `makeScenes(field)`, the original geometric
  scene set (ring, orbits, grid, cube, spiral, wave, polygon, shell, star).
- `src/pages/home.js` — hub driver; `PAGES` array is the creation registry;
  swarm forms the title and slides around the menu via `field.exclude`.
- `src/pages/playground.js` — playground driver; boots field, registers
  scenes, builds the panel.
- `tools/serve.js` — tiny static server rooted at the project dir.
- `tools/verify.mjs` — headless check; playwright-core bundled with Devin
  plus the shared ms-playwright browser cache.
- `ai-docs/plans/` — creation plans and roadmap. Build order: Koi Pond,
  Mirror, Telepresence; see `ai-docs/plans/README.md`.
- Planned creations (hub cards marked soon): Mirror (webcam silhouette
  scene), Telepresence (two-browser swarm), Koi Pond (interactive pond).

## Engine notes

- Scene fn signature: `fn(i, sceneLocalT, fieldT, outPos4, outCol3)`.
  `outPos[3]` doubles as a snap-teleport flag. `fn.ext = [w,h]` is the
  design-space bounding box used by `sceneBox` to fit the viewport.
- Call `dir.homes()` every frame inside `field.frame` — it evaluates the
  active scene per particle and blends during transitions.
- `dir.play(name)` transitions; `dir.play(name)` with `fromPos` freezes
  current positions so drift -> scene staggers in nicely.
- `dir.cur === -1` means free drift; the playground releases particles
  through the same staggered ramp.
- `unit = innerHeight / CFG.unitDiv` is the physics length unit ("xu" in
  slider labels). `pos`/`home` z is in xu units, not px; positive z =
  nearer = bigger, brighter sprite.
- `reserveEvery` defaults to 0 - ambient drifters are opt-in per page
  (e.g. pond sets 8 for water flecks). ~3% are `leader` (bigger,
  brighter, zero transition stagger).
- `field.noFlock[i] = 1` exempts a particle from neighbor forces - set it
  for rigid bodies (koi, cockpit, puppets) so flocking can't jitter them.
- `field.noWell[i] = 1` makes a particle immune to every pointer well -
  no hover repel, no pull, no capture. Use for drawn elements (backdrops,
  furniture, HUD) while the rest of the page stays interactive.
- `field.extraWells` is a list of extra pointer wells `{x, y, down, tint?}`
  (remote or synthetic cursors). They get identical repel/pull/capture
  physics to `field.mouse`; `capt[p]` stores `wellIndex + 1`, and a well
  releasing (`down=false`) or vanishing flings its captured particles.
  Per-well `tint` overrides the accent capture color.
- Mouse: hover repels with swirl; LMB pulls; very close captures into an
  accretion disc (infall to `horizonR`, Kepler speed, accent -> hot tint);
  release flings.
- Pages own CFG: each page is a separate module realm, so set CFG overrides
  at boot before/after `createField` - no global state crosses pages.
- Particle "despawn" idiom: `homed[i] = 0`, `size[i] = 0`, dim `hcol[i]` -
  additive blending makes it fade out while drifting away.
