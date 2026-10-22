# Requests: Telepresence

## Engine gaps
- Resolved before build: `field.extraWells` already shipped, so the plan's
  "engine support" option needed no patch. One `{x, y, down, tint}` well
  per peer gives the remote cursor full repel/pull/capture physics.
- Nice-to-have: `dir.replay(name)`. Re-entering the ambient scene after
  the last peer silhouette goes stale requires writing `dir.cur = -1`
  before `dir.play("ambient")` (play() early-returns on the same scene).
  Works, but mutating director state from the page is a mild reach.
- Nice-to-have: extraWell idle timeout. A remote cursor that stops moving
  keeps repelling at its last position until the peer leaves or moves.
  Mitigated page-side only in that disconnect drops the peer's well.

## Hub integration
- [x] hub card: Telepresence -> telepresence.html. The card already
  exists in `PAGES` marked `soon`; flipping `soon` to the live href links
  it. Page verified bootable with zero console errors.

## Shared helpers
- Webcam sampler: mirror's engine-free `sampler.js` was lifted verbatim
  into `src/creations/telepresence/sampler.js` (cross-creation imports
  are forbidden), plus a one-line `S.video = video` so the page can show
  a local preview. If promoted to `src/lib/sampler.js`, this copy can go.

## Collisions / notes
- Relay is `tools/relay.js` on port 8322, `node tools/relay.js`,
  dependency-free (stdlib http + crypto). `serve.js` untouched.
- Check: `node src/creations/telepresence/check.mjs` (needs serve.js on
  :8321; spawns the relay itself when :8322 is free). Two headless pages
  in one room exchange a synthetic silhouette + cursor through the real
  wire; screenshots land in `shots/telepresence-*.png`.
- Headless note: a refused WebSocket logs `net::ERR_CONNECTION_REFUSED`
  once per retry from the browser's network layer. Not a page error and
  not suppressible from JS; the check runs the relay so it stays clean.
- `?relay=host:port` URL param overrides the default `hostname:8322`.

## Planned: public relay + voice (phase 2, see plans/telepresence.md)
- Owner decision: keep telepresence, deploy the relay publicly for
  internet play (LAN/localhost only today). Host TBD: fly.io / Render /
  Railway run relay.js as-is with free wss; a Cloudflare Worker port is
  the set-and-forget option. net.js needs a wss scheme fix + baked-in
  default relay URL first.
- Voice planned on top: WebRTC audio P2P with the relay as signaling
  (sdp/ice message types), STUN only, mic default-muted, ~6 peer cap.
