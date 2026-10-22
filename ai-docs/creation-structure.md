# Creation structure

How each planned creation lays out its files. Every creation is
**self-contained**: its own entry page, its own page driver, its own module
folder. Creations never import each other and never touch `src/engine/`.

## The pattern

```
<name>.html                      # thin entry: canvas host + one module script
src/pages/<name>.js              # boot + wiring only: CFG overrides,
                                 #   createField, imports, field.frame = ...
src/creations/<name>/            # creation-owned modules (game, sim, fx)
    index.js                     #   factory: export function create<Name>(field, opts)
    *.js                         #   one file per subsystem
```

Rules:

- `src/pages/<name>.js` is thin: import `PF`, apply `Object.assign(PF.CFG,
  {...})`, `PF.createField()`, instantiate the creation module(s), wire
  `field.frame`, `field.start()`. No game logic in the page file.
- `src/creations/<name>/index.js` exports a factory that receives `field`
  (and `PF` helpers if needed) and returns the creation's update/step
  surface. Modules inside the folder never import the engine internals -
  they receive what they need.
- Shared, creation-agnostic helpers go in `src/lib/` (e.g. a webcam
  sampler shared by Mirror + Telepresence, a verlet solver shared by
  Fighter + future puppets). `src/lib/` imports from `src/engine/index.js`
  only.
- Each creation registers itself on the hub: add a card to `PAGES` in
  `src/pages/home.js` (label, href, status). Dead links are not allowed -
  only add the card when the page exists, or mark it "soon".
- Screenshot/test output goes to `shots/`, never the repo root.
- Its plan file in `ai-docs/plans/` is the spec; keep build-step checkboxes
  accurate as work lands. Do not delete plan files.

## Per-plan map

| Plan | Entry | Page driver | Creation modules | Notes |
|------|-------|-------------|------------------|-------|
| Koi Pond | `pond.html` | `src/pages/pond.js` | `src/creations/pond/{fish,pellets,ripples}.js` | fish own index ranges + `noFlock`; `field.exclude` for pads |
| Mirror | `mirror.html` | `src/pages/mirror.js` | `src/lib/sampler.js` (shared) + `src/creations/mirror/scene.js` | mutable point list scene; camera denied → fall back to `PF.makeScenes`-style scene |
| Telepresence | `telepresence.html` | `src/pages/telepresence.js` | `src/creations/telepresence/{net,peer}.js` + `tools/relay.js` | remote cursors via `field.extraWells`; needs the ws relay |
| Spaceship | `space.html` | `src/pages/space.js` | `src/creations/space/{camera,cockpit,course,entities,fx,hud}.js` | one field; index-range layers; `noFlock` on cockpit/entities |
| Fighter | `fighter.html` | `src/pages/fighter.js` | `src/creations/fighter/{puppet,weapon,ai,damage}.js` + `src/lib/verlet.js` | two puppets own index ranges; joints write homes |

Filenames above are the canonical spec from `ai-docs/plans/*.md`; adjust
the inside-folder split as needed but keep entry + page driver names exact
so the hub links stay stable.

## Isolation contract

- **Engine is frozen.** `src/engine/*` and `src/scenes/scenes.js` belong to
  the core build. If a creation needs a new primitive scene shape, it may
  add a scene fn - but engine files (`core/field/director/index`) do not
  change per creation.
- **No cross-creation imports.** If two creations need the same helper,
  move it to `src/lib/`; never import across `src/creations/` folders.
- **No shared mutable state between creations.** Each page boots its own
  `PF` realm; nothing persists across pages except `localStorage`
  (scoreboards, `best` keys - prefix per creation, e.g. `space.best`).
- **Verification stays in `tools/`.** Add creation checks to `verify.mjs`
  or a sibling script under `tools/`; keep `shots/` for output.
