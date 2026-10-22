// mirror.js - Mirror boot. Thin: CFG overrides, field, creation, frame wire.
import { PF } from "../engine/index.js";
import { createMirror } from "../creations/mirror/index.js";

(function () {
  Object.assign(PF.CFG, { spring: 0.04, transStagger: 0.8 });
  PF.reseed(7);
  const statusEl = document.getElementById("status");
  const field = PF.createField({ N: PF.isMobile() ? 4000 : 9000 });
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
