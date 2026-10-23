// frames.js - per-ship hull geometry tables, one topology per ship.
// deck.js paints the whole canvas as near-black hull, punches `panes` as
// open glass, then draws members (struts, bands, pods) on top - members
// may cross glass (A-pillars do) and the cull mask follows them.
// Units: x -1..1 -> +/-cx, y up -1..1 -> +/-cy; member widths w0/w1 are
// half-widths in cy units (true px = w*cy at any aspect). z is member
// depth (0.9 far .. 4.8 nearest steel): mean z < 2.4 draws on the far
// sway layer. band: e0 = away/hull edge, e1 = glass edge; loop: e0/e1
// are closed rings filled even-odd (window rims).
// Layout rules: the dash band is the pane's bottom edge; pillars leave
// the screen through the side edges below y 0.5 so the top-left 30% x 22%
// (comms box) stays glass; `inst` sit on hull below the pane edge.
// pad: the holo-compass projector {x, y, r} on the coaming lip, left of
// centre so the arrow above it clears the killfeed under the reticle.
const S = (x0, y0, x1, y1, w0, w1, z0, z1) => ({ p0: [x0, y0], p1: [x1, y1], w0, w1, z0, z1 });
const pair = (s) => [s, { ...s, p0: [-s.p0[0], s.p0[1]], p1: [-s.p1[0], s.p1[1]] }];
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
// one open pane over everything above the dash: hood half-width hx at
// height hy, side consoles falling to sy at the screen edge
const sky = (hx, hy, sy) => ({ z: 4.4, pts: [
  [-1.05, sy], [-hx, hy], [hx, hy], [1.05, sy], [1.05, 1.05], [-1.05, 1.05],
] });
// coaming lip along the pane's bottom edge, t thick
const lip = (hx, hy, sy, t) => ({ z: 4.6,
  e0: [[-1.05, sy - t], [-hx, hy - t], [hx, hy - t], [1.05, sy - t]],
  e1: [[-1.05, sy], [-hx, hy], [hx, hy], [1.05, sy]] });

const kCon = [[-1.05, -0.69], [-0.52, -0.475], [-0.47, -1.05], [-1.05, -1.05]];
const dCon = [[-1.05, -0.77], [-0.44, -0.575], [-0.42, -1.05], [-1.05, -1.05]];
const mCon = [[-1.05, -0.53], [-0.62, -0.385], [-0.58, -1.05], [-1.05, -1.05]];

export const FRAMES = {
  // strike fighter: two heavy A-pillars from the dash corners out through
  // the upper sides, no overhead steel, low dash with angled side consoles
  kestrel: {
    panes: [sky(0.46, -0.40, -0.64)],
    struts: [
      ...pair(S(0.44, -0.44, 1.10, 0.56, 0.030, 0.080, 4.0, 4.8)),
      ...pair(S(0.50, -0.43, 1.10, 0.47, 0.007, 0.016, 4.0, 4.6)), // inner rail
    ],
    bands: [lip(0.46, -0.40, -0.64, 0.05)],
    pods: [
      { z: 4.6, pts: kCon },
      { z: 4.6, pts: mirror(kCon) },
      { z: 4.6, pts: [[-0.40, -0.475], [0.40, -0.475], [0.36, -1.05], [-0.36, -1.05]] },
    ],
    lamps: [
      { x: -0.40, y: -0.80, z: 4.6, c: "amb" },
      { x: 0.40, y: -0.80, z: 4.6, c: "grn" },
      { x: -0.62, y: -0.58, z: 4.6, c: "amb" },
    ],
    inst: [
      { id: "spd", label: "SPD", x: -0.74, y: -0.79, w: 0.22, h: 0.27, rot: -0.12 },
      { id: "wrn", label: "WRN", x: -0.25, y: -0.60, w: 0.19, h: 0.17 },
      { id: "nav", label: "NAV", x: 0.02, y: -0.60, w: 0.29, h: 0.19 },
      { id: "rdr", label: "RDR", x: 0.29, y: -0.61, r: 0.11 },
      { id: "com", label: "COM", x: 0, y: -0.86, w: 0.50, h: 0.11 },
      { id: "sys", label: "PWR", x: 0.74, y: -0.79, w: 0.22, h: 0.27, rot: 0.12 },
    ],
    pad: { x: -0.17, y: -0.425, r: 0.022 },
  },

  // interceptor bubble: slender kinked frame rails far out at the sides,
  // a hairline nose spine under the reticle, the lowest dash of the three
  dart: {
    panes: [sky(0.40, -0.50, -0.72)],
    struts: [
      ...pair(S(0.39, -0.53, 0.70, -0.06, 0.012, 0.022, 3.8, 4.4)),
      ...pair(S(0.70, -0.06, 1.08, 0.30, 0.022, 0.034, 4.4, 4.8)),
      S(0, -0.53, 0, -0.30, 0.010, 0.004, 4.0, 3.6),
    ],
    bands: [lip(0.40, -0.50, -0.72, 0.04)],
    pods: [
      { z: 4.6, pts: dCon },
      { z: 4.6, pts: mirror(dCon) },
      { z: 4.6, pts: [[-0.34, -0.565], [0.34, -0.565], [0.30, -1.05], [-0.30, -1.05]] },
    ],
    lamps: [
      { x: -0.36, y: -0.80, z: 4.6, c: "red" },
      { x: 0.36, y: -0.80, z: 4.6, c: "grn" },
    ],
    inst: [
      { id: "spd", label: "SPD", x: -0.72, y: -0.85, w: 0.20, h: 0.24, rot: -0.10 },
      { id: "wrn", label: "WRN", x: -0.22, y: -0.67, w: 0.16, h: 0.15 },
      { id: "nav", label: "NAV", x: 0.02, y: -0.67, w: 0.24, h: 0.16 },
      { id: "rdr", label: "RDR", x: 0.25, y: -0.68, r: 0.09 },
      { id: "com", label: "COM", x: 0, y: -0.89, w: 0.42, h: 0.10 },
      { id: "sys", label: "PWR", x: 0.72, y: -0.85, w: 0.20, h: 0.24, rot: 0.10 },
    ],
    pad: { x: -0.17, y: -0.52, r: 0.019 },
  },

  // hauler: chunky pillars, a tall heavy dash, one thin high brace
  // (stays under the comms zone at x < -0.4)
  mule: {
    panes: [sky(0.60, -0.30, -0.50)],
    struts: [
      ...pair(S(0.58, -0.36, 1.12, 0.46, 0.050, 0.110, 4.2, 4.8)),
      ...pair(S(1.06, 0.45, 0, 0.50, 0.016, 0.012, 4.4, 4.4)),
    ],
    bands: [lip(0.60, -0.30, -0.50, 0.06)],
    pods: [
      { z: 4.6, pts: mCon },
      { z: 4.6, pts: [[1.05, -0.50], [0.58, -0.37], [0.54, -1.05], [1.05, -1.05]] },
      { z: 4.6, pts: [[-0.54, -0.39], [0.50, -0.39], [0.46, -1.05], [-0.50, -1.05]] },
    ],
    lamps: [
      { x: -0.46, y: -0.95, z: 4.6, c: "amb" },
      { x: 0.42, y: -0.95, z: 4.6, c: "amb" },
      { x: 0.92, y: -0.62, z: 4.6, c: "grn" },
    ],
    inst: [
      { id: "spd", label: "SPD", x: -0.80, y: -0.73, w: 0.21, h: 0.27, rot: -0.08 },
      { id: "nav", label: "NAV", x: -0.20, y: -0.52, w: 0.30, h: 0.20 },
      { id: "wrn", label: "WRN", x: 0.13, y: -0.52, w: 0.22, h: 0.18 },
      { id: "rdr", label: "RDR", x: 0.39, y: -0.54, r: 0.12 },
      { id: "com", label: "COM", x: -0.02, y: -0.80, w: 0.56, h: 0.12 },
      { id: "sys", label: "PWR", x: 0.80, y: -0.73, w: 0.22, h: 0.26, rot: 0.08 },
    ],
    pad: { x: -0.17, y: -0.33, r: 0.026 },
  },
};
