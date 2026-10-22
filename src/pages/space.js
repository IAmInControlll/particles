// space.js - Voidrunner boot. Thin: CFG overrides, field, creation, frame wire.
import { PF } from "../engine/index.js";
import { createSpace } from "../creations/space/index.js";

(function () {
  Object.assign(PF.CFG, {
    pointScale: 0.0058,
    bg: [5, 7, 14],
    spring: 0.06,
    springLeader: 0.09,
    dampHome: 0.82,
    dampFree: 0.965,
    flowAmp: 0.002,
    driftPull: 0.0008,
    twinkle: 0.16,
    depthFade: 0.5,
    heatGain: 1.5,
    heatMax: 0.75,
    colVar: 0.1,
    repelAmp: 0.06,
    captureR: 0.26,
  });

  PF.reseed(11);
  const field = PF.createField({ N: PF.isMobile() ? 4200 : 9000 });
  if (!field.ok) {
    document.getElementById("hud-tl").textContent = "WebGL unavailable";
    return;
  }
  window.__pf = field;

  const game = createSpace(field, PF);
  window.__space = game;
  field.frame = (T, dt) => game.frame(T, dt);
  field.start();
})();
