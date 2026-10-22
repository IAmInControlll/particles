// shatter.js - Shatter boot. Thin: CFG overrides, field, creation, frame wire.
import { PF } from "../engine/index.js";
import { createShatter } from "../creations/shatter/index.js";

(function () {
  Object.assign(PF.CFG, {
    pointScale: 0.0058,
    bg: [4, 6, 10],
    spring: 0.05,
    springLeader: 0.08,
    dampHome: 0.84,
    dampFree: 0.965,
    flowAmp: 0.0015,
    driftPull: 0.001,
    twinkle: 0.04,
    depthFade: 0.5,
    heatGain: 0.4,
    colVar: 0.08,
    repelAmp: 0.08,
    captureR: 0.26,
    pullDelay: 0.3, // a tap never outlives this, so clicks never tug particles
  });
  PF.reseed(Date.now() & 0x7fffff); // different layout every load
  const field = PF.createField({ N: PF.isMobile() ? 5000 : 15000 });
  if (!field.ok) {
    document.getElementById("hud-tl").textContent = "WebGL unavailable";
    return;
  }
  window.__pf = field;
  const game = createShatter(field, PF);
  window.__shatter = game;
  field.frame = (T, dt) => game.frame(T, dt);
  field.start();
})();
