// frames.js - per-ship hull geometry tables, one topology per ship.
// deck.js paints members as near-black backing plates and punches
// `panes` as open glass.
// Units: x -1..1 -> +/-cx, y up -1..1 -> +/-cy. z is member depth
// (0.9 far glass .. 4.8 nearest steel): mean z < 2.4 draws on the far
// sway layer; per point it sets perspective size and sway gain.
// band: e0 = away/hull edge, e1 = glass edge; loop: e0/e1 are closed
// rings filled even-odd (window rims).
const S = (x0, y0, x1, y1, w0, w1, z0, z1, blk) =>
  ({ p0: [x0, y0], p1: [x1, y1], w0, w1, z0, z1, blk });
const pair = (s) => [s, { ...s, p0: [-s.p0[0], s.p0[1]], p1: [-s.p1[0], s.p1[1]] }];
const curve = (f, x0, x1, n) => {
  const p = [];
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; p.push([x, f(x)]); }
  return p;
};
const drop = (pts, dy) => pts.map(([x, y]) => [x, y - dy]);
// visor top edges shared by the brow band rim
const vK = [[-1.0, 0.72], [-0.64, 0.66], [-0.44, 0.72], [0, 0.74], [0.44, 0.72], [0.64, 0.66], [1.0, 0.72]];
const vD = [[-0.52, 0.72], [-0.2, 0.78], [0.2, 0.78], [0.52, 0.72]];
const vM = [[-1.15, 0.95], [-0.7, 0.80], [0, 0.84], [0.7, 0.80], [1.15, 0.95]];

export const FRAMES = {
  // standard frame: trapezoid windscreen ahead, connectors ramping back,
  // visor band, wraparound dash, symmetric pods
  kestrel: {
    panes: [
      { z: 4.4, pts: [
        [-0.92, -0.18], [0.92, -0.18],
        [0.63, 0.50], [0.45, 0.575], [-0.45, 0.575], [-0.63, 0.50],
      ] },
    ],
    struts: [
      ...pair(S(0.185, 0.265, 0.55, 0.545, 0.018, 0.045, 0.9, 3.4)),
      ...pair(S(0.34, -0.02, 0.835, 0.06, 0.016, 0.040, 0.9, 3.2)),
      ...pair(S(0.30, -0.25, 0.95, -0.185, 0.018, 0.050, 0.9, 3.4)),
      ...pair(S(0.53, 0.575, 0.955, -0.18, 0.050, 0.100, 4.0, 4.8)),
    ],
    bands: [
      { z: 0.9, loop: true,
        e0: [[-0.36, -0.27], [0.36, -0.27], [0.21, 0.29], [0, 0.32], [-0.21, 0.29]],
        e1: [[-0.305, -0.235], [0.305, -0.235], [0.175, 0.255], [0, 0.285], [-0.175, 0.255]] },
      { z: 4.4,
        e0: vK,
        e1: [[-0.95, 0.42], [-0.63, 0.50], [-0.45, 0.575], [0, 0.60], [0.45, 0.575], [0.63, 0.50], [0.95, 0.42]] },
      { z: 4.6,
        e0: drop(curve((x) => -0.335 - 0.09 * x * x, -1.0, 1.0, 12), 0.075),
        e1: curve((x) => -0.335 - 0.09 * x * x, -1.0, 1.0, 12) },
    ],
    pods: [
      { z: 4.6, pts: [[-1.10, -0.26], [-0.62, -0.38], [-0.68, -0.72], [-1.14, -0.62]] },
      { z: 4.6, pts: [[1.10, -0.26], [0.62, -0.38], [0.68, -0.72], [1.14, -0.62]] },
    ],
    lamps: [
      { x: -0.42, y: -0.44, z: 4.6, c: "amb" },
      { x: 0.34, y: -0.42, z: 4.6, c: "grn" },
      { x: 0.68, y: -0.52, z: 4.6, c: "amb" },
    ],
    inst: [
      { id: "spd", label: "SPD", x: -0.82, y: -0.43, w: 0.20, h: 0.28, rot: 0.09 },
      { id: "nav", label: "NAV", x: -0.16, y: -0.60, w: 0.30, h: 0.21 },
      { id: "wrn", label: "WRN", x: 0.20, y: -0.585, w: 0.22, h: 0.16 },
      { id: "com", label: "COM", x: 0.01, y: -0.845, w: 0.52, h: 0.115 },
      { id: "rdr", label: "RDR", x: 0.50, y: -0.665, r: 0.125 },
      { id: "sys", label: "PWR", x: 0.83, y: -0.42, w: 0.20, h: 0.24, rot: -0.09 },
    ],
  },

  // interceptor: one wide hexagonal windscreen with a slim center spine
  // mullion over the glass (blk - it occludes), steep A-pillars, deep dash
  dart: {
    panes: [
      { z: 4.0, pts: [[-0.66, -0.16], [0.66, -0.16], [0.52, 0.64], [-0.52, 0.64]] },
    ],
    struts: [
      S(0, -0.17, 0, 0.66, 0.022, 0.038, 2.6, 4.8, true),           // spine mullion
      ...pair(S(0.52, 0.63, 0.68, -0.17, 0.048, 0.070, 3.6, 4.8)),  // steep A-pillar
      ...pair(S(0.30, 0.42, 0.56, 0.62, 0.012, 0.030, 0.9, 3.0)),
      ...pair(S(0.36, -0.20, 0.64, -0.16, 0.012, 0.028, 0.9, 3.2)),
    ],
    bands: [
      { z: 0.9, loop: true,
        e0: [[-0.70, -0.20], [0.70, -0.20], [0.58, 0.68], [-0.58, 0.68]],
        e1: [[-0.60, -0.15], [0.60, -0.15], [0.48, 0.59], [-0.48, 0.59]] },
      { z: 4.4,
        e0: vD,
        e1: [[-0.54, 0.62], [-0.2, 0.68], [0.2, 0.68], [0.54, 0.62]] },
      { z: 4.6,
        e0: drop(curve((x) => -0.44 - 0.22 * x * x, -0.80, 0.80, 10), 0.08),
        e1: curve((x) => -0.44 - 0.22 * x * x, -0.80, 0.80, 10) },
    ],
    pods: [
      { z: 4.6, pts: [[-0.98, -0.34], [-0.62, -0.44], [-0.66, -0.70], [-1.0, -0.62]] },
      { z: 4.6, pts: [[0.98, -0.34], [0.62, -0.44], [0.66, -0.70], [1.0, -0.62]] },
    ],
    lamps: [
      { x: -0.30, y: -0.50, z: 4.6, c: "red" },
      { x: 0.28, y: -0.50, z: 4.6, c: "grn" },
    ],
    inst: [
      { id: "spd", label: "SPD", x: -0.62, y: -0.52, w: 0.18, h: 0.26, rot: 0.06 },
      { id: "nav", label: "NAV", x: -0.14, y: -0.70, w: 0.26, h: 0.18 },
      { id: "wrn", label: "WRN", x: 0.14, y: -0.66, w: 0.20, h: 0.15 },
      { id: "com", label: "COM", x: 0, y: -0.90, w: 0.44, h: 0.10 },
      { id: "rdr", label: "RDR", x: 0.44, y: -0.76, r: 0.105 },
      { id: "sys", label: "PWR", x: 0.62, y: -0.50, w: 0.16, h: 0.22, rot: -0.05 },
    ],
  },

  // hauler: panoramic wraparound, thin mullions between front and side
  // glass, heavy brow slab instead of a visor, blocky asymmetric dash
  mule: {
    panes: [
      { z: 3.6, pts: [[-0.72, -0.22], [0.72, -0.22], [0.68, 0.38], [-0.68, 0.38]] },
      { z: 3.6, pts: [[-0.78, -0.20], [-1.04, -0.12], [-1.06, 0.32], [-0.76, 0.37]] },
      { z: 3.6, pts: [[0.78, -0.20], [1.04, -0.12], [1.06, 0.32], [0.76, 0.37]] },
    ],
    struts: [
      ...pair(S(0.735, -0.21, 0.71, 0.385, 0.022, 0.030, 3.2, 4.6)), // mullion
      S(0, 0.45, 0, 0.82, 0.020, 0.024, 4.5, 4.7),                  // brow rib
      ...pair(S(0.45, 0.43, 0.55, 0.80, 0.016, 0.020, 4.5, 4.7)),   // brow ribs
      ...pair(S(0.56, 0.28, 0.70, 0.375, 0.014, 0.032, 1.2, 3.4)),
      ...pair(S(0.58, -0.25, 0.74, -0.21, 0.014, 0.032, 1.2, 3.4)),
    ],
    bands: [
      { z: 1.2, loop: true,
        e0: [[-0.60, -0.26], [0.60, -0.26], [0.56, 0.30], [-0.56, 0.30]],
        e1: [[-0.55, -0.225], [0.55, -0.225], [0.51, 0.26], [-0.51, 0.26]] },
      { z: 4.6,
        e0: vM,
        e1: [[-1.1, 0.40], [-0.72, 0.415], [0, 0.44], [0.72, 0.415], [1.1, 0.40]] },
      { z: 4.6,
        e0: drop(curve((x) => -0.32 - 0.03 * x * x, -1.05, 1.05, 12), 0.07),
        e1: curve((x) => -0.32 - 0.03 * x * x, -1.05, 1.05, 12) },
    ],
    pods: [
      { z: 4.6, pts: [[-1.02, -0.36], [-0.72, -0.42], [-0.74, -0.64], [-1.06, -0.60]] },
      { z: 4.6, pts: [[0.50, -0.36], [1.12, -0.28], [1.16, -0.72], [0.56, -0.78]] },
    ],
    lamps: [
      { x: -0.45, y: -0.40, z: 4.6, c: "amb" },
      { x: 0.30, y: -0.40, z: 4.6, c: "amb" },
      { x: 0.92, y: -0.56, z: 4.6, c: "grn" },
    ],
    inst: [
      { id: "spd", label: "SPD", x: -0.88, y: -0.46, w: 0.16, h: 0.24, rot: 0.08 },
      { id: "nav", label: "NAV", x: -0.30, y: -0.60, w: 0.28, h: 0.20 },
      { id: "wrn", label: "WRN", x: 0.06, y: -0.56, w: 0.20, h: 0.15 },
      { id: "com", label: "COM", x: -0.08, y: -0.87, w: 0.50, h: 0.11 },
      { id: "rdr", label: "RDR", x: 0.62, y: -0.60, r: 0.125 },
      { id: "sys", label: "PWR", x: 0.90, y: -0.45, w: 0.16, h: 0.24, rot: -0.10 },
    ],
  },
};
