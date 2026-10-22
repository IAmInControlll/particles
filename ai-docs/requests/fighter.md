# Requests: Fighter

## Engine gaps

None. Everything needed was reachable through the PF surface:
`homed`/`size`/`hcol` for permanent loss, `noFlock` for rigid bodies,
`exclude` for arena walls, `mouse` for arm aiming, `unit` for scale, and
the `?t=` time warp for fast-forward verification.

## Hub integration

- [ ] hub card: "Fray" -> fighter.html

## Shared helpers

- `src/lib/verlet.js` - small generic verlet solver: points, distance
  constraints, per-point pull targets, floor/wall clamp, breakable links.
  Creation-agnostic; any creation needing rope/ragdoll/chain physics can
  use it.

## Collisions / notes

- `field.mouseZone = () => false` on this page: the cursor is a pure game
  input (arm aim), so engine pointer forces are fully disabled.
- Fray sets `field.exclude` and `field.drift` every frame inside
  `field.frame`; ambient particles are the tail range after both
  fighters' owned slices.
- Career win counter uses localStorage key `fighter.wins`.
- `window.__fray` is exposed for headless checks, matching the
  `window.PF` debug convention. `src/creations/fighter/check.mjs` is a
  private playwright check (boot, movement, hits, throw, warp match
  flow) - not part of tools/verify.mjs.
