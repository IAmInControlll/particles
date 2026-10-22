// index.js - Mirror: the swarm forms your webcam silhouette. Owns the
// camera state machine, the resample driver, dir.play, #status, __mirror.
import { makeScenes } from "../../scenes/scenes.js";
import { createSampler, PT } from "./sampler.js";
import { selfScene } from "./scene.js";

const SAMPLE_MS = 250; // 4Hz resample; 1000 under prefers-reduced-motion
const GRACE_MS = 2500; // empty frames tolerated before morphing to ambient

export function createMirror({ PF, field, dir, statusEl }) {
  const M = (window.__mirror = {
    state: "boot",
    mode: PF.params.get("s") === "edges" ? "edges" : "lum",
    count: 0,
    samples: 0,
    err: "",
  });
  const store = { buf: new Float32Array(field.N * PT.STRIDE), count: 0, cap: field.N, W: 0, H: 0 };
  const sampler = createSampler({ mode: M.mode });

  const setState = (s, msg) => {
    M.state = s;
    statusEl.dataset.mode = s;
    statusEl.textContent = msg;
  };

  const fit = (fn) => ({
    cx: innerWidth / 2,
    cy: innerHeight * 0.52,
    s: Math.min(innerWidth / fn.ext[0], innerHeight / fn.ext[1]) * 0.8,
  });

  // ambient is the resting scene for every non-self gap
  const ambient = makeScenes(field).spiral;
  dir.register("ambient", ambient, { boxFn: () => fit(ambient) });
  dir.play("ambient");

  let played = "ambient";
  let lastSample = 0;
  let lastNonEmpty = 0;
  let selfSc = null;

  const fallback = (msg) => {
    setState("fallback", msg + " - click status to retry");
    played = "ambient";
    dir.play("ambient");
  };

  function open() {
    if (M.state === "prompting") return;
    setState("prompting", "requesting camera access");
    sampler.open().then(
      () => {
        store.W = sampler.W;
        store.H = sampler.H;
        if (selfSc) selfSc.fn.ext = [store.W / store.H || 4 / 3, 1];
        else {
          const fn = selfScene(store, field, PF.PAL);
          selfSc = dir.register("self", fn, { boxFn: () => fit(fn) });
        }
        setState("live", "live - the swarm is you");
      },
      (e) => {
        M.err = (e && e.name) || "Error";
        fallback(
          M.err === "NotAllowedError" ? "camera denied"
          : M.err === "NotFoundError" ? "no camera found"
          : "camera unavailable"
        );
      }
    );
  }

  sampler.onEnded = () => {
    if (M.state === "live") fallback("camera disconnected");
  };

  statusEl.addEventListener("click", () => {
    if (M.state === "fallback") open();
  });
  document.addEventListener("visibilitychange", () => sampler.setPaused(document.hidden));

  function tick() {
    if (M.state !== "live") return;
    const now = performance.now();
    if (now - lastSample < (PF.reduce ? 1000 : SAMPLE_MS)) return;
    lastSample = now;
    if (sampler.read(store)) {
      lastNonEmpty = now;
      M.count = store.count;
      M.samples++;
    }
    const target = now - lastNonEmpty < GRACE_MS ? "self" : "ambient";
    if (target !== played) {
      played = target;
      dir.play(target);
    }
  }

  return { open, tick };
}
