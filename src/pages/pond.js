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
    driftPull: 0, // water.js owns coverage now; the wander pool biased density 2:1
    flowAmp: 0.0008, // pond-still ambient drift; pressure + wrap hold coverage
    twinkle: 0.05,
    heatGain: 0.9,
    spawnSpread: 1.4,
    reserveEvery: 8, // ambient water flecks - deliberate for this page
    pullDelay: 0.24, // press shorter than this is a feed click, not a pull
    touchPull: true, // touch holds get the same pull/capture verbs
  });
  PF.reseed(11);
  const field = PF.createField({ N: PF.isMobile() ? 4000 : 15000 });
  if (!field.ok) return;
  window.__pf = field;
  const wantFish = PF.isMobile() ? 4 : 6;
  const pond = createPond(field, {
    fish: wantFish,
    fishSlice: PF.isMobile() ? 280 : 450,
    pelletSlots: PF.isMobile() ? 5 : 6,
    pelletSlice: PF.isMobile() ? 24 : 32,
    clickSlop: 10,
  });
  window.__pond = pond; // debug probe: world.water exposes the grids
  const fnum = document.getElementById("fnum");
  let cur = pond.setFish(Math.min(wantFish, pond.maxFish));
  const show = () => (fnum.textContent = cur);
  document.getElementById("fdec").addEventListener("click", () => {
    cur = pond.setFish(cur - 1);
    show();
  });
  document.getElementById("finc").addEventListener("click", () => {
    cur = pond.setFish(cur + 1);
    show();
  });
  show();
  field.onResize = () => pond.layout();
  field.frame = (T, dt) => pond.step(T, dt);
  field.start();
})();
