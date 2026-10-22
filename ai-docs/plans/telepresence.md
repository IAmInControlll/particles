# Telepresence

Two browsers, one shared swarm. Each person's swarm renders the other
person, and each person's cursor physically stirs the other's swarm. You
reach into their field and they feel it.

Files: `telepresence.html`, `telepresence.js`, plus a WebSocket relay in or
beside `serve.js`. Hub card: "Telepresence".

## Architecture (plan A, simplest correct)

Each client runs its own full field. What crosses the wire is small:

```js
// ~4Hz, from mirror.js's sampler
{ type: "sil", pts: [[x,y],...], cols?: [...], t }
// ~30Hz
{ type: "cur", x, y, down }
```

On receipt of `sil`, the remote person's point cloud becomes the active
scene: your swarm morphs into them. On receipt of `cur`, a remote cursor
applies real forces to your swarm. That second part is the magic: their
hand on your screen pushes your particles, and vice versa.

This is NOT a shared-state simulation. Two independent simulations, each
locally deterministic, connected by intentions (silhouettes, cursors), not
state. No netcode headache.

## The remote-cursor dependency

RESOLVED before build: `field.extraWells` shipped in the engine, so a
remote cursor gets identical repel/pull/capture physics with no patch.
One well object per peer lives in `extraWells` for the peer's lifetime;
`x = -9e3` disables, removal flings captured particles. Per-well `tint`
colors what the remote cursor captures.

## Relay

DONE: sibling `tools/relay.js` on :8322 (dep-free ws on Node stdlib, no
`ws` package). Rooms via `?room=abc`, `welcome` carries the existing peer
roster, join/leave broadcast, messages relayed verbatim. No persistence,
no auth, toy-grade. `serve.js` untouched.

## Build steps

1. [x] Relay: two tabs exchange a ping through a room. Verified live with
   real sockets (welcome roster, verbatim relay, leave broadcast) and in
   `check.mjs` (two headless pages through the real wire).
2. [x] Silhouette: mirror's engine-free sampler lifted verbatim into
   `src/creations/telepresence/sampler.js` (cross-creation imports are
   forbidden; mirror kept its copy in its own folder). ~4Hz `sil`
   messages morph the remote field via direct `home[]`/`hcol[]` writes.
3. [x] Remote cursor: `field.extraWells` already existed - no patch.
   `cur` messages at ~30Hz drive one well per peer; verified end to end
   (remote press at normalized 0.5,0.5 produced a live well at 800,450
   with a visible capture disc).
4. [x] Room UX: `?room=` slug auto-generated via `history.replaceState`,
   shareable URL shown in `#share` (click to copy), presence count in
   `#status`, per-peer tint derived from relay id so "you" match on both
   ends, dot legend in `#peers`, local video preview in `#preview`.
5. [x] N > 2: one remote well + one silhouette slot per peer. Peers with
   fresh silhouettes split all N particles into contiguous slices, each
   fitted into a horizontal slot across the viewport.

## Open questions - resolved

- Direct `home` writes, as planned. Ambient (spiral via director) fills
  every peer-silhouette gap; when the last fresh silhouette goes stale
  the page pokes `dir.cur = -1` then `dir.play("ambient")` to re-enter
  through the staggered drift->scene path.
- 4Hz silhouettes + spring smoothing reads fine in screenshots; cursors
  stream at ~30Hz with no extra lerp (the engine eases well velocity).
- Peer tint is derived from the relay-assigned id (`TINTS[id % 4]`), so
  "you" look the same on both ends with no extra messages.

## Phase 2 - public relay + voice (planned)

Goal: telepresence works over the internet, not just LAN/localhost -
and peers can hear each other.

### Public relay

- [ ] Host `tools/relay.js` on a public always-on free tier with TLS
  (fly.io / Render / Railway, or a Cloudflare Worker port). The relay is
  one dep-free file; the host just runs `node tools/relay.js`. `wss://`
  comes free with host-managed certs.
- [ ] `net.js` scheme fix: accept a full `wss://host` `?relay=` param and
  auto-pick `wss:` when `location.protocol === "https:"` (https pages
  refuse `ws://` as mixed content). Bake the deployed relay URL in as
  the default so no param is needed.
- [ ] No relay-side changes otherwise: rooms, roster, verbatim text
  relay already suffice. Rooms are in-memory only; a restart makes every
  client reconnect in ~2s with zero data loss (silhouettes refresh at
  4Hz anyway).

### Voice (WebRTC audio over relay signaling)

- [ ] The relay doubles as the signaling channel for free: add `sdp`
  (offer/answer) and `ice` message types routed by `onMsg`, addressed
  `f`/`to` by relay id. A few KB of JSON per handshake; audio never
  crosses the relay.
- [ ] `peer.js`: one `RTCPeerConnection` per peer pair; lower relay id
  initiates. Mic via `getUserMedia({audio:true})`, track attached once.
- [ ] STUN only (`stun:stun.l.google.com`). TURN is deferred - peers
  behind symmetric NATs degrade to silhouettes-only, same pattern as a
  denied camera.
- [ ] UX: mic button in the status bar, default muted (strangers should
  not auto-play). Mute state rides the legend dot.
- [ ] Mesh is N^2 connections - cap voice to ~6 peers, mute beyond.
- [ ] Headless check: two Playwright pages with fake audio devices can
  complete a real offer/answer on localhost (iceState connected).

Both phases are deploy-time/client-side only - the engine and every
other page stay untouched, and telepresence keeps its graceful offline
behavior when no relay is reachable.
