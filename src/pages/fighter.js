// fighter.js - boots the Fray duel: CFG overrides, field, game module.
import { PF } from "../engine/index.js";
import { createFighter } from "../creations/fighter/index.js";

Object.assign(PF.CFG, {
  pointScale: 0.0072,
  spring: 0.05,
  dampHome: 0.85,
  heatGain: 1.9,
  flowAmp: 0.0016,
  driftPull: 0.0009,
  twinkle: 0.16,
  bg: [10, 10, 15],
});

PF.reseed(11);
const field = PF.createField({ N: PF.isMobile() ? 4500 : 9000 });
if (!field.ok) {
  const b = document.getElementById("banner");
  if (b) b.textContent = "WebGL unavailable";
} else {
  field.mouseZone = () => false;
  const game = createFighter(field, PF);
  field.frame = (T, dt) => game.step(T, dt);
  field.start();
  window.__fray = game;
}
