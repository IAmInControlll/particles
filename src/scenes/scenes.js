// scenes.js - original geometric scenes for the playground.
// Each scene fn(i, sceneT, fieldT, outPos4, outCol3) writes design-space
// position + rgb color for one particle. fn.ext = [w,h] bounds for fitting.
import { PAL } from "../engine/core.js";

export function makeScenes(field) {
  const P = PAL;
  const N = field.N;
  const h1 = field.h1, h2 = field.h2, h3 = field.h3;
  const TAU = Math.PI * 2;
  const set = (out, x, y, z) => { out[0] = x; out[1] = y; out[2] = z; };
  const mix = (col, a, b, t) => {
    col[0] = a[0] + (b[0] - a[0]) * t;
    col[1] = a[1] + (b[1] - a[1]) * t;
    col[2] = a[2] + (b[2] - a[2]) * t;
  };
  const copy = (col, c, g = 1) => { col[0] = c[0] * g; col[1] = c[1] * g; col[2] = c[2] * g; };

  const scenes = {};

  // ---- ring: one circle, slow rotation, accent every 14th
  scenes.ring = (i, t, T, out, col) => {
    const a = (i / N) * TAU + T * 0.15;
    const r = 1.7 + (h1(i) - 0.5) * 0.08;
    set(out, Math.cos(a) * r, Math.sin(a) * r * 0.9, 0);
    copy(col, i % 14 === 0 ? P.accent : i % 3 ? P.ink : P.mist);
  };
  scenes.ring.ext = [4.2, 3.4];

  // ---- orbits: nested ellipses, inner rings spin faster
  const orbR = [0.55, 0.95, 1.35, 1.8];
  scenes.orbits = (i, t, T, out, col) => {
    const ring = i % 4;
    const a = h1(i) * TAU + T * (1.3 - ring * 0.28);
    const r = orbR[ring] + (h2(i) - 0.5) * 0.1;
    set(out, Math.cos(a) * r, Math.sin(a) * r * 0.38, Math.sin(a + h3(i)) * 0.15);
    copy(col, i % 17 === 0 ? P.accent : ring === 0 ? P.ink : ring % 2 ? P.sky : P.mist);
  };
  scenes.orbits.ext = [4.4, 3];

  // ---- grid: jittered blocks lattice, brightness wave rolls through
  scenes.grid = (i, t, T, out, col) => {
    const cols = 20, rows = 12;
    const gx = i % cols, gy = (i / cols | 0) % rows;
    const x = (gx / (cols - 1) - 0.5) * 4.4 + (h1(i) - 0.5) * 0.12;
    const y = (gy / (rows - 1) - 0.5) * 2.4 + (h2(i) - 0.5) * 0.12;
    const w = Math.sin(x * 1.4 + T * 1.8) * 0.06;
    set(out, x, y + w, 0);
    const glow = 0.55 + 0.45 * Math.sin(x * 1.4 + T * 1.8 - 1.2);
    copy(col, i % 23 === 0 ? P.accent : P.mist, 0.4 + 0.6 * Math.max(0, glow));
  };
  scenes.grid.ext = [5, 3.2];

  // ---- cube: wireframe cube edges, tumbling in 3D (perspective showcase)
  const cubeV = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const cubeE = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  scenes.cube = (i, t, T, out, col) => {
    const e = cubeE[i % 12];
    const tt = h1(i);
    const ax = e[0], bx = e[1];
    let x = cubeV[ax][0] + (cubeV[bx][0] - cubeV[ax][0]) * tt;
    let y = cubeV[ax][1] + (cubeV[bx][1] - cubeV[ax][1]) * tt;
    let z = cubeV[ax][2] + (cubeV[bx][2] - cubeV[ax][2]) * tt;
    const ry = T * 0.5, rx = 0.5 + Math.sin(T * 0.23) * 0.2;
    let x1 = x * Math.cos(ry) - z * Math.sin(ry);
    let z1 = x * Math.sin(ry) + z * Math.cos(ry);
    let y1 = y * Math.cos(rx) - z1 * Math.sin(rx);
    let z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
    set(out, x1 * 1.1, y1 * 1.1, z2 * 1.1);
    copy(col, z2 > 0.7 ? P.accent : z2 > 0 ? P.sky : P.mist, 0.5 + 0.5 * (z2 + 1) / 2);
  };
  scenes.cube.ext = [3.6, 3.6];

  // ---- spiral: three-arm galaxy
  scenes.spiral = (i, t, T, out, col) => {
    const arm = i % 3;
    const rr = 0.2 + Math.sqrt(h1(i)) * 2.1;
    const a = (arm / 3) * TAU + rr * 1.9 + T * 0.22 + (h2(i) - 0.5) * 0.5;
    set(out, Math.cos(a) * rr, Math.sin(a) * rr * 0.85, (h3(i) - 0.5) * 0.2);
    mix(col, P.ink, P.sky, Math.min(1, rr / 2.3));
    if (i % 19 === 0) copy(col, P.accent);
  };
  scenes.spiral.ext = [5, 4.2];

  // ---- wave: travelling sine sheet
  scenes.wave = (i, t, T, out, col) => {
    const x = h1(i) * 5 - 2.5 + Math.floor(i / 97) * 0.02;
    const y = Math.sin(x * 1.3 + T * 1.2) * 0.45 + Math.cos(x * 0.6 + T * 0.7) * 0.2;
    set(out, x, y + (h2(i) - 0.5) * 0.5, (h3(i) - 0.5) * 0.4);
    const g = Math.max(0, Math.min(1, y + 0.6));
    mix(col, P.mist, P.accent, g * g);
  };
  scenes.wave.ext = [5.4, 2.6];

  // ---- polygon: hexagon outline, slow spin, accent vertices
  scenes.polygon = (i, t, T, out, col) => {
    const sides = 6;
    const side = i % sides;
    const tt = h1(i);
    const rot = T * 0.12;
    const a0 = (side / sides) * TAU + rot, a1 = ((side + 1) / sides) * TAU + rot;
    const r = 1.8;
    const x = Math.cos(a0) * r + (Math.cos(a1) - Math.cos(a0)) * r * tt;
    const y = Math.sin(a0) * r + (Math.sin(a1) - Math.sin(a0)) * r * tt;
    set(out, x, y, 0);
    copy(col, tt < 0.08 || tt > 0.92 ? P.accent : P.mist);
  };
  scenes.polygon.ext = [4.4, 4.2];

  // ---- shell: fibonacci sphere, rotating, depth-shaded
  const GA = Math.PI * (3 - Math.sqrt(5));
  scenes.shell = (i, t, T, out, col) => {
    const k = i % N;
    const y = 1 - (k / Math.max(1, N - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GA * k + T * 0.3;
    set(out, Math.cos(th) * rad * 1.6, y * 1.6, Math.sin(th) * rad * 1.6);
    const depth = (Math.sin(th) * rad + 1) / 2;
    mix(col, P.dim, i % 29 === 0 ? P.accent : P.ink, 0.25 + 0.75 * depth);
  };
  scenes.shell.ext = [4.2, 4.2];

  // ---- star: five-point star outline
  const starPts = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? 1.9 : 0.8;
    const a = Math.PI / 2 - (k / 10) * TAU;
    starPts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  scenes.star = (i, t, T, out, col) => {
    const seg = i % 10;
    const tt = h1(i);
    const [x0, y0] = starPts[seg], [x1, y1] = starPts[(seg + 1) % 10];
    set(out, x0 + (x1 - x0) * tt, y0 + (y1 - y0) * tt, 0);
    copy(col, seg % 2 === 0 ? P.ink : P.accent, 0.8);
  };
  scenes.star.ext = [4.4, 4.4];

  return scenes;
};
