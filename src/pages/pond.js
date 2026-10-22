import { PF } from "../engine/index.js";
import { createPond } from "../creations/pond/index.js";

(function () {
  Object.assign(PF.CFG, {
    bg: [5, 15, 19],
    depthFade: 0.5,
    spring: 0.038,
    dampHome: 0.85,
    repelBase: 0.55,
    repelAmp: 0.11,
    repelZ: 0.7,
    pullR: 2.0,
    captureR: 0.24,
    driftPull: 0.0009,
    flowAmp: 0.0035,
    twinkle: 0.08,
    heatGain: 0.9,
    spawnSpread: 1.4,
  });
  PF.reseed(11);
  const field = PF.createField({ N: PF.isMobile() ? 4000 : 9000 });
  if (!field.ok) return;
  window.__pf = field;
  const pond = createPond(field, {
    fish: PF.isMobile() ? 4 : 6,
    fishSlice: PF.isMobile() ? 280 : 450,
    pelletSlots: PF.isMobile() ? 5 : 6,
    pelletSlice: PF.isMobile() ? 24 : 32,
    pads: [
      { x: 0.14, y: 0.16, w: 0.17, h: 0.11 },
      { x: 0.68, y: 0.72, w: 0.18, h: 0.11 },
    ],
    holdMs: 240,
    clickSlop: 10,
  });
  field.onResize = () => pond.layout();
  field.frame = (T, dt) => pond.step(T, dt);
  field.start();
})();
