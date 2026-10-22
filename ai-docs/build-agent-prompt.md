# Build-agent prompt

Copy this into a fresh agent session. Replace `<NAME>` (creation name,
e.g. `pond`) and `<PLAN>` (plan filename, e.g. `koi-pond.md`).

---

You are building one creation for the particle playground at
`C:\Users\Mohammad\Documents\Projects\particles`. Other agents are
building other creations in this same repo right now - stay strictly
inside your file ownership.

Invoke `poteto-mode` and follow it for the whole build.

## Read first, in order

1. `AGENTS.md`
2. `ai-docs/engine.md` - the engine contract. `src/engine/` is FROZEN:
   never edit it, never import anything except `PF` from
   `src/engine/index.js`. If it can't do something you need, see
   "Missing capabilities" below.
3. `ai-docs/creation-structure.md` - required file layout.
4. `ai-docs/plans/<PLAN>` - your spec. Build all of it; the build steps
   are your milestones.

## Ownership (hard boundary)

You own ONLY: `<NAME>.html`, `src/pages/<NAME>.js`,
`src/creations/<NAME>/*`, `ai-docs/plans/<PLAN>`,
`ai-docs/requests/<NAME>.md`, `shots/<NAME>-*.png`.

Never edit: `src/engine/*`, `src/scenes/*`, `src/pages/home.js`,
`src/pages/playground.js`, `tools/serve.js`, `tools/verify.mjs`,
`AGENTS.md`, `ai-docs/engine.md`, `ai-docs/creation-structure.md`,
or any file belonging to another creation.

New shared helpers go in `src/lib/` only if genuinely creation-agnostic;
never edit a `src/lib/` file you didn't create.

## Concurrency rules

- The dev server may already be running: `node tools/serve.js`. If you get
  EADDRINUSE, that means it IS running - reuse it, don't kill it.
- Launch your OWN headless browser for checks (copy the playwright-core
  bootstrap from `tools/verify.mjs`). Never drive a shared or visible
  browser instance.
- Screenshots: `shots/<NAME>-*.png` only.
- `localStorage` keys prefixed `<NAME>.`.

## Missing capabilities

If the engine can't do something your plan needs:

1. Write it up in `ai-docs/requests/<NAME>.md` (format in
   `ai-docs/requests/README.md`) - what you need, why, where it hurts.
2. Work around it at page level if a reasonable workaround exists.
3. Do NOT patch `src/engine/*` yourself.

Same file: tick off the hub-card line if your page is linkable, and note
any `src/lib/` helpers you added or wished existed.

## Done means

- Every build step in `ai-docs/plans/<PLAN>` is implemented (mark them).
- The page boots at `http://localhost:8321/<NAME>.html` with zero console
  errors.
- Your verification screenshots are in `shots/<NAME>-*.png`.
- `ai-docs/requests/<NAME>.md` exists and is filled in.
- Nothing outside your ownership was modified.
