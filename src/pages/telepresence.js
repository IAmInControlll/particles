// telepresence.js - Telepresence boot. Thin: CFG overrides, field, creation, frame wire.
import { PF } from "../engine/index.js";
import { createTelepresence } from "../creations/telepresence/index.js";

(function () {
  Object.assign(PF.CFG, { spring: 0.04, transStagger: 0.8 });
  PF.reseed(11);
  const statusEl = document.getElementById("status");
  const field = PF.createField({ N: PF.isMobile() ? 4000 : 9000 });
  if (!field.ok) {
    statusEl.textContent = "WebGL unavailable";
    return;
  }
  const dir = PF.createDirector(field);
  const tele = createTelepresence({
    PF, field, dir,
    ui: {
      statusEl,
      peersEl: document.getElementById("peers"),
      shareEl: document.getElementById("share"),
      previewEl: document.getElementById("preview"),
    },
  });
  field.frame = () => {
    tele.tick();
    if (!tele.writeHomes()) dir.homes();
  };
  field.start();
})();
