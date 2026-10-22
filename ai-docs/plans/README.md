# Creations roadmap

Each creation is a standalone page (`name.html` + `name.js`) linked from the
hub's `PAGES` registry in `home.js`. Plans below are ordered by suggested
build sequence, not importance. Each builds machinery the next one needs.

| Order | Plan | One-liner |
|-------|------|-----------|
| next | [spaceship.md](spaceship.md) | First-person space game: particle cockpit, endless gate racing with lives + scoreboard, then dogfighting with drops. |
| after | [fighter.md](fighter.md) | Side-view duel. WASD/arrows move and duck, mouse whips the weapon arm. Dismemberment is permanent; health is body mass. |
| 1 | [koi-pond.md](koi-pond.md) | Interactive pond. Water ripples under the cursor, koi swim, deform, recohere, and can never break. |
| 2 | [mirror.md](mirror.md) | The swarm forms your webcam silhouette live. Priority: sub. |
| 3 | [telepresence.md](telepresence.md) | Two browsers. Each swarm renders the other person and reacts to their cursor. |

Deferred candidates live in [backlog.md](backlog.md). Ideas the owner already
rejected (Swarm Royale, Shadertoy-for-swarms, Formation Fighter, Bad Apple
playback, generative music video, tilt physics) are not in the backlog.

## Shared engine facts the plans rely on

- Scene fn: `fn(i, sceneT, fieldT, outPos4, outCol3)`, `fn.ext = [w,h]`.
  Register with `dir.register(name, fn, { boxFn })`, morph with `dir.play`.
- `field.frame` hook runs each step before physics. Write `field.exclude`
  and call `dir.homes()` (or write `home`/`hcol` directly) there.
- Homed particles are movable but unbreakable: disturb them and they spring
  back to their home target. This is the core mechanic of the pond and the
  mirror's shatter-reform moment.
- Built-in pointer verbs: hover repel+swirl, press-hold pull, close capture
  into orbit, release fling.
- Helpers on `PF`: `PF.textPoints(text, opts)` rasterizes text to a point
  list + ext; `PF.pick(pts, i, N)` distributes N particles over a point
  list; `PF.reseed(n)` for deterministic layouts.
