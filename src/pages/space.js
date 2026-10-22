// space.js - Voidrunner boot. Thin: CFG overrides, field, creation, frame wire.
import { PF } from "../engine/index.js";
import { createSpace } from "../creations/space/index.js";

(async function () {
  Object.assign(PF.CFG, {
    pointScale: 0.0058,
    bg: [3, 4, 9],
    spring: 0.06,
    springLeader: 0.09,
    dampHome: 0.82,
    dampFree: 0.965,
    flowAmp: 0.002,
    driftPull: 0.0008,
    twinkle: 0, // stars must read rock steady
    depthFade: 0.5,
    heatGain: 0, // pointer proximity never flashes the backdrop
    colVar: 0.1,
    repelAmp: 0.06,
    captureR: 0.26,
  });

  PF.reseed(11);
  // zIndex 6 + transparent: GL rides above the deck canvas (z5) so the
  // particle structure draws on top of the opaque hull backing; cleared
  // alpha lets the backing show where no particles are. deck.cull() keeps
  // world particles out of the hull zone. HUD/overlay DOM stays higher.
  const field = PF.createField({ N: PF.isMobile() ? 5000 : 15000, zIndex: 6, transparent: true });
  if (!field.ok) {
    document.getElementById("hud-tl").textContent = "WebGL unavailable";
    return;
  }
  window.__pf = field;

  // cockpit variants for design trials / ship picks: ?cockpit=c1 etc
  let createCockpit;
  const ck = PF.params.get("cockpit");
  if (ck) {
    try {
      createCockpit = (await import(`../creations/space/cockpit-${ck}.js`)).createCockpit;
    } catch (e) {
      console.warn("cockpit variant failed:", ck, e.message);
    }
  }

  const game = createSpace(field, PF, { createCockpit });
  window.__space = game;
  field.frame = (T, dt) => game.frame(T, dt);
  field.start();
})();
