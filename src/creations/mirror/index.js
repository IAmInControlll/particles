// index.js - Mirror: the swarm forms your webcam silhouette. Owns the
// camera state machine, the resample driver, dir.play, #status, __mirror.
import { makeScenes } from "../../scenes/scenes.js";
import { createSampler, PT } from "./sampler.js";
import { selfScene } from "./scene.js";

const SAMPLE_MS = 33; // ~30Hz resample, video-frame cadence; 1000 under prefers-reduced-motion
const GRACE_MS = 2500; // empty frames tolerated before morphing to ambient

export function createMirror({ PF, field, dir, statusEl }) {
  const M = (window.__mirror = {
    state: "boot",
    mode: PF.params.get("s") === "edges" ? "edges" : "lum",
    count: 0,
    samples: 0,
    err: "",
    field,
  });
  const store = { buf: new Float32Array(field.N * 4 * PT.STRIDE), count: 0, cap: field.N * 4, cells: 0, cellT: null, W: 0, H: 0 };
  const sampler = createSampler({ mode: M.mode, mirror: PF.params.get("flip") !== "0" });
  M.store = store;
  M.sampler = sampler;
  field.noFlock.fill(1); // flocking smears the silhouette and is the hot cost

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

  // containment: the swarm lives inside the camera rect; the cursor's
  // repel bubble is the only license to leave it. A particle within the
  // bubble stamps its excuse; outside, it has ~0.5s to fly back before
  // we clamp it to the edge.
  const K = Math.min(600, (field.N * 0.07) | 0); // viewfinder slice, matches scene.js
  const excT = new Float32Array(field.N).fill(-99);
  const contain = () => {
    if (!selfSc || played !== "self") return;
    const C = PF.CFG;
    // mid-morph flights legitimately converge through outside space
    if (field.T - dir.switchT < (dir.dur * (1 + C.transStagger)) / C.transSpeed + 0.15) return;
    const box = fit(selfSc.fn);
    // 1.24 covers the max perspective overshoot from z-relief (perspZ 9)
    const hw = (selfSc.fn.ext[0] / 2) * box.s * 1.24, hh = 0.5 * box.s * 1.24;
    const x0 = box.cx - hw, x1 = box.cx + hw, y0 = box.cy - hh, y1 = box.cy + hh;
    const m = field.mouse;
    // excuse only inside the real repel radius - a parked cursor outside
    // it must not pin a cloud beyond the frame forever
    const bub = (C.repelBase + Math.min(C.repelSpeedMax, m.speed * C.repelSpeedGain)) * field.unit;
    const bub2 = bub * bub;
    const pos = field.pos, vel = field.vel, homed = field.homed, T = field.T;
    for (let p = K; p < field.N; p++) {
      if (!homed[p]) continue;
      const i = p * 3, x = pos[i], y = pos[i + 1];
      const dxm = x - m.x, dym = y - m.y;
      if (m.on && dxm * dxm + dym * dym < bub2) excT[p] = T;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      if (T - excT[p] < 0.5) continue;
      pos[i] = Math.min(x1, Math.max(x0, x));
      pos[i + 1] = Math.min(y1, Math.max(y0, y));
      vel[i] = vel[i + 1] = 0;
    }
  };
  // e flips lum <-> edges live; the mode param still sets the boot mode
  addEventListener("keydown", (e) => {
    if (e.key !== "e" || M.state !== "live") return;
    sampler.mode = M.mode = M.mode === "edges" ? "lum" : "edges";
    statusEl.textContent = `live - the swarm is you (${M.mode})`;
  });
  document.addEventListener("visibilitychange", () => sampler.setPaused(document.hidden));

  function tick() {
    if (M.state !== "live") return;
    contain();
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
