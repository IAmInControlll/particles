// ships.js - pick-a-hull table. Each ship sets flight multipliers
// (applied in camera.js); hullMax feeds the shield->hull->life model.
// The cockpit topology comes from FRAMES[ship.name] in frames.js.
export const SHIPS = [
  {
    name: "kestrel", tag: "standard frame - balanced",
    thrust: 1, cap: 1, turn: 1, hullMax: 3, scoreMul: 1,
  },
  {
    name: "dart", tag: "interceptor - fast, twitchy, thin hull",
    thrust: 1.2, cap: 1.05, turn: 1.28, hullMax: 2, scoreMul: 0.9,
  },
  {
    name: "mule", tag: "hauler - heavy, tough, pays better",
    thrust: 0.82, cap: 0.92, turn: 0.7, hullMax: 4, scoreMul: 1.2,
  },
];
