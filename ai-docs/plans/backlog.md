# Backlog

Ideas that survived the brainstorm but are not scheduled. Each links back to
why the engine makes it feasible. Owner picks from here when a slot opens.

## The pond (shared persistent swarm)

One swarm living on a server 24/7. Every visitor plays with the same flock;
connected clients each own a slice of particles and can visibly steal them
from each other's clouds. A communal pet, not a demo. Deterministic sim
means a thin WS relay shipping intentions is enough. Distinct from
Telepresence (which is person-shaped and 1:1); this is ambient and N-way.

## Falcon

Invert the flock: it holds formation while fleeing your cursor, which is
the predator. Dive and it splits, flows around you, re-forms behind. One
steering-force sign flip plus an evasion radius. The most visceral thing
the physics can do for the least code.

## Ghosts

Record `{seed, pointer timeline}` from a session, replay inside someone
else's field. Async telepresence: a recording of you plays in their page.
Tiny JSON, no server. Ghost duets and battles fall out for free. Reuses
`PF.reseed` determinism.

## Shepherd

Puzzle game: never touch the swarm directly. Place and move attractor
wells to herd it through gates and around hazards (exclude zones).
Lemmings with a murmuration. Levels are just lists of wells and rects, so
a level editor is nearly free.

## Conductor

Two MediaPipe-tracked hands as separate gravity wells. Pinch captures,
spread palms disperses, push morphs scenes. Playing the swarm like a
theremin. Related to Mirror's tracking pipeline.

## Room installation

Projected on a wall, depth camera bodies become exclude zones, swarm flows
around real people. Exclude zones are built for exactly this. Demo-day
material.
