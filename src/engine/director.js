// director.js - scene registry + staggered transitions between shapes.
// Scene fn signature: fn(i, sceneLocalT, fieldT, outPos4, outCol3)
//   outPos[0..2] design-space coords, outPos[3] = snap-teleport flag
//   fn.ext = [w, h] design bounds, fn.gain = color scale (optional)
import { CFG, PAL, ease, reduce, stillT } from "./core.js";

export function createDirector(field, opts = {}) {
  const C = CFG;
  const D = {
    field,
    scenes: [],
    cur: -1,
    prev: -1,
    switchT: -10,
    enter: {},
    dur: opts.dur ?? C.directorDur,
    fromPos: null,
    fromCol: null,
  };
  const pa = [0, 0, 0, 0], pb = [0, 0, 0, 0];
  const ca = [0, 0, 0], cb = [0, 0, 0];

  const project = (sc, box, out) => {
    if (sc.px) return;
    const u = C.perspZ / Math.max(C.perspMin, C.perspZ - (out[2] * box.s) / field.unit);
    out[0] = box.cx + out[0] * (box.sx || box.s) * u;
    out[1] = box.cy - out[1] * (box.sy || box.s) * u;
    out[2] = (out[2] * box.s) / field.unit;
  };

  D.ttOf = (sc) =>
    sc.clock ? sc.clock() : reduce ? stillT(sc.fn) : field.T - (D.enter[sc.name] ?? field.T);

  D.eval = (sc, box, i, out, colOut) => {
    out[3] = 0;
    sc.fn(i, D.ttOf(sc), field.T, out, colOut);
    if (sc.fn.gain) {
      colOut[0] *= sc.fn.gain;
      colOut[1] *= sc.fn.gain;
      colOut[2] *= sc.fn.gain;
    }
    project(sc, box, out);
  };

  const resolveBox = (sc) => (sc && (sc.boxFn ? (sc.box = sc.boxFn()) : sc.box));

  D.register = (name, fn, scOpts = {}) => {
    const sc = { name, fn, box: scOpts.box || null, boxFn: scOpts.boxFn, clock: scOpts.clock, px: scOpts.px };
    D.scenes.push(sc);
    return sc;
  };

  // play(name): transition to a registered scene.
  // fromPos: freeze current positions as the "previous" state (nice entry from drift).
  D.play = (name, fromPos = true) => {
    const idx = D.scenes.findIndex((s) => s.name === name);
    if (idx < 0 || idx === D.cur) return;
    D.prev = D.cur;
    D.cur = idx;
    D.switchT = field.T;
    D.enter[name] = field.T;
    if (fromPos && D.prev < 0) {
      D.fromPos = field.pos.slice();
      D.fromCol = field.col.slice();
    } else D.fromPos = null;
  };

  // Call every frame inside field.frame. Writes home/hcol for every particle.
  D.homes = () => {
    const cur = D.scenes[D.cur];
    const prev = D.prev >= 0 ? D.scenes[D.prev] : null;
    if (prev) prev.pre && prev.pre();
    if (cur && cur !== prev && cur.pre) cur.pre();
    const boxP = prev ? resolveBox(prev) : cur && resolveBox(cur);
    const boxC = cur ? resolveBox(cur) : boxP;
    const m = Math.min(1, (field.T - D.switchT) / D.dur);
    if (boxP && boxC) {
      field.drift.x = boxP.cx + (boxC.cx - boxP.cx) * m;
      field.drift.y = boxP.cy + (boxC.cy - boxP.cy) * m;
    }
    const dim = PAL.dim;
    const home = field.home, hcol = field.hcol;
    for (let p = 0; p < field.N; p++) {
      const i = p * 3;
      if (field.reserve[p]) {
        field.homed[p] = 0;
        field.hcol[i] = dim[0] * 0.7;
        field.hcol[i + 1] = dim[1] * 0.7;
        field.hcol[i + 2] = dim[2] * 0.7;
        continue;
      }
      field.homed[p] = 1;
      const y = ease(m * C.transSpeed - field.stag[p] * C.transStagger);
      pa[3] = pb[3] = 0;
      let hasPrev = false, hasCur = false;
      if (y < 1) {
        if (D.fromPos) {
          pa[0] = D.fromPos[i];
          pa[1] = D.fromPos[i + 1];
          pa[2] = D.fromPos[i + 2];
          ca[0] = D.fromCol[i];
          ca[1] = D.fromCol[i + 1];
          ca[2] = D.fromCol[i + 2];
          hasPrev = true;
        } else if (prev) {
          D.eval(prev, boxP, p, pa, ca);
          hasPrev = true;
        }
      }
      if (y > 0 && cur) {
        D.eval(cur, boxC, p, pb, cb);
        hasCur = true;
      }
      if (y <= 0 && hasPrev) {
        home[i] = pa[0]; home[i + 1] = pa[1]; home[i + 2] = pa[2];
        hcol[i] = ca[0]; hcol[i + 1] = ca[1]; hcol[i + 2] = ca[2];
      } else if (y >= 1 && hasCur) {
        home[i] = pb[0]; home[i + 1] = pb[1]; home[i + 2] = pb[2];
        hcol[i] = cb[0]; hcol[i + 1] = cb[1]; hcol[i + 2] = cb[2];
      } else if (hasPrev && hasCur) {
        for (let e = 0; e < 3; e++) {
          home[i + e] = pa[e] + (pb[e] - pa[e]) * y;
          hcol[i + e] = ca[e] + (cb[e] - ca[e]) * y;
        }
      } else {
        field.homed[p] = 0;
      }
      if ((y < 0.02 && pa[3]) || (y > 0.98 && pb[3])) field.snap[p] = 1;
      if (field.leader[p]) {
        hcol[i] = Math.min(1, hcol[i] * C.leaderBrighten);
        hcol[i + 1] = Math.min(1, hcol[i + 1] * C.leaderBrighten);
        hcol[i + 2] = Math.min(1, hcol[i + 2] * C.leaderBrighten);
      }
    }
    if (m >= 1) D.fromPos = null;
  };
  return D;
}
