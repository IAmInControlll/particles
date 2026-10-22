// mirror.js - Mirror boot. Thin: CFG overrides, field, creation, frame wire.
import { PF } from "../engine/index.js";
import { createMirror } from "../creations/mirror/index.js";

(function () {
  Object.assign(PF.CFG, {
    spring: 0.12,        // stiffer tracking so scattered particles regroup fast
    transStagger: 0.5,   // must satisfy transSpeed - stagMax*transStagger > 1 or high-stag particles blend forever
    touchPull: true,
    heatGain: 0.08,      // velocity bleaches toward white - keep it a whisper on a camera feed
    twinkle: 0.05,
    colVar: 0.02,
    pointScale: 0.005,   // smaller sprites = sharper image
  });
  PF.reseed(7);
  const statusEl = document.getElementById("status");
  // 16k so the emit cap (4N) clears a stride-1 280px cell grid on 4:3 cams
  const field = PF.createField({ N: PF.isMobile() ? 5000 : 16000 });
  if (!field.ok) {
    statusEl.textContent = "WebGL unavailable";
    return;
  }
  const dir = PF.createDirector(field);
  const mirror = createMirror({ PF, field, dir, statusEl });
  field.frame = () => {
    mirror.tick();
    dir.homes();
  };
  field.start();
  mirror.open();
})();
