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
