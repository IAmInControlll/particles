// fighter.js - boots the Fray duel: CFG overrides, field, game module.
import { PF } from "../engine/index.js";
import { createFighter } from "../creations/fighter/index.js";

Object.assign(PF.CFG, {
  // opaque paint for flesh, cloth and steel (field.solid = 1); sparks,
  // fire and the sky keep the additive glow (solid 0)
  additive: false,
  pointScale: 0.0072,
  spring: 0.05,
  dampHome: 0.85,
  // speed-to-heat would tint every swinging arm orange
  heatGain: 0,
  // per-particle tone jitter: enough grain for cloth, not confetti
  colVar: 0.025,
  flowAmp: 0.0016,
  driftPull: 0.0009,
  // size breathing ripples a solid silhouette's edge
  twinkle: 0.05,
  bg: [10, 10, 15],
});

PF.reseed(11);
const field = PF.createField({ N: PF.isMobile() ? 4500 : 9000, transparent: true, zIndex: 1 });
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
