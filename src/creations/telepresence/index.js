// index.js - Telepresence: the swarm forms every fresh peer silhouette in
// horizontal slots; peer cursors are extraWells that stir the swarm. Owns
// room/relay, camera loop, cursor broadcast, roster, status chrome, __tele.
import { makeScenes } from "../../scenes/scenes.js";
import { createSampler } from "./sampler.js";
import { createNet } from "./net.js";
import { createPeer } from "./peer.js";

const CAP_OUT = 1400; // outgoing silhouette cap
const SAMPLE_MS = 250; // ~4Hz while live; 1000 under prefers-reduced-motion
const CUR_MS = 33; // cursor send throttle

export function createTelepresence({ PF, field, dir, ui }) {
  const { statusEl, peersEl, shareEl, previewEl } = ui;
  const PAL = PF.PAL;
  const TINTS = [PAL.accent, PAL.sky, PAL.hot, PAL.mist];
  const N = field.N;

  // --- room + share link ---
  let room = PF.params.get("room");
  if (!room) {
    room = Math.random().toString(36).slice(2, 8);
    const u = new URL(location.href);
    u.searchParams.set("room", room);
    history.replaceState(null, "", u);
  }
  const href = location.href;
  if (shareEl) {
    shareEl.textContent = href;
    let shareTimer = 0;
    shareEl.addEventListener("click", () => {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(href).then(() => {
        shareEl.textContent = "copied";
        clearTimeout(shareTimer);
        shareTimer = setTimeout(() => (shareEl.textContent = href), 900);
      }, () => {});
    });
  }

  // --- ambient resting scene for every peer gap ---
  const ambient = makeScenes(field).spiral;
  dir.register("ambient", ambient, {
    boxFn: () => ({
      cx: innerWidth / 2,
      cy: innerHeight * 0.52,
      s: Math.min(innerWidth / ambient.ext[0], innerHeight / ambient.ext[1]) * 0.8,
    }),
  });
  dir.play("ambient");

  // --- peers ---
  const peers = new Map();
  let myId = 0;
  let legendDirty = true;

  const addPeer = (id) => {
    if (!id || id === myId || peers.has(id)) return;
    peers.set(id, createPeer(id, TINTS[id % TINTS.length], field));
    legendDirty = true;
  };
  const dropPeer = (id) => {
    const p = peers.get(id);
    if (!p) return;
    p.dispose();
    peers.delete(id);
    legendDirty = true;
  };
  const resetPeers = () => {
    for (const p of peers.values()) p.dispose();
    peers.clear();
    legendDirty = true;
  };

  const onRoster = (m) => {
    if (m.t === "welcome") {
      myId = m.id;
      resetPeers();
      for (const id of m.peers || []) addPeer(id);
      legendDirty = true;
    } else if (m.t === "join") addPeer(m.id);
    else if (m.t === "leave") dropPeer(m.id);
  };
  const onMsg = (m) => {
    const p = peers.get(m.f);
    if (!p) return;
    if (m.t === "sil" && Array.isArray(m.pts)) p.setSil(m.pts, m.a, performance.now());
    else if (m.t === "cur") p.setCur(m.x, m.y, m.d);
  };

  const net = createNet({
    host: PF.params.get("relay") || location.hostname + ":8322",
    room,
    onMsg,
    onRoster,
    // a dead relay leaves frozen wells behind; drop peers rather than let
    // stale cursors keep stirring. Gated on myId so retry cycles while
    // never-connected don't churn an empty map (or injected test peers).
    onState: (s) => { if (s === "offline" && myId) { myId = 0; resetPeers(); } },
  });

  // --- camera: sampled locally, only points cross the wire ---
  let cam = "boot", camMsg = "", lastSample = 0;
  const sampler = createSampler({ mode: "lum" });
  const store = { buf: new Float32Array(CAP_OUT * 4), count: 0, cap: CAP_OUT, W: 0, H: 0 };
  let wire = [];

  const detachPreview = () => {
    if (previewEl && sampler.video && sampler.video.parentNode === previewEl)
      previewEl.removeChild(sampler.video);
  };
  const camFallback = (msg) => {
    cam = "fallback";
    camMsg = msg;
    detachPreview();
  };
  function openCam() {
    if (cam === "prompting" || cam === "live") return;
    cam = "prompting";
    sampler.open().then(
      () => {
        store.W = sampler.W;
        store.H = sampler.H;
        cam = "live";
        camMsg = "";
        if (previewEl && sampler.video) previewEl.appendChild(sampler.video);
      },
      (e) => {
        const err = (e && e.name) || "Error";
        camFallback(
          err === "NotAllowedError" ? "camera denied - click status to retry"
          : err === "NotFoundError" ? "no camera found"
          : "camera unavailable"
        );
      }
    );
  }
  sampler.onEnded = () => {
    if (cam === "live") camFallback("camera disconnected - click status to retry");
  };
  statusEl.addEventListener("click", () => {
    if (cam === "fallback") openCam();
  });
  document.addEventListener("visibilitychange", () => sampler.setPaused(document.hidden));

  function sendSil() {
    if (!myId) return;
    const n = store.count, b = store.buf;
    wire.length = n * 4;
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      wire[o] = Math.round(b[o] * 1e3) / 1e3;
      wire[o + 1] = Math.round(b[o + 1] * 1e3) / 1e3;
      wire[o + 2] = Math.round(b[o + 2] * 1e2) / 1e2;
      wire[o + 3] = b[o + 3] > 0.5 ? 1 : 0;
    }
    net.send({ t: "sil", f: myId, a: Math.round((store.W / store.H) * 1e3) / 1e3, pts: wire });
  }

  // --- cursor broadcast ---
  const cur = { nx: 0.5, ny: 0.5, d: 0 };
  const sent = { nx: -1, ny: -1, d: 0, t: -1e9 };
  addEventListener("pointermove", (e) => {
    cur.nx = e.clientX / innerWidth;
    cur.ny = e.clientY / innerHeight;
  }, { passive: true });
  addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" && field.canPull(e)) cur.d = 1;
  });
  addEventListener("pointerup", () => { cur.d = 0; });

  function pumpCursor(now) {
    if (!myId) return;
    const dFlip = cur.d !== sent.d;
    if (!dFlip && ((cur.nx === sent.nx && cur.ny === sent.ny) || now - sent.t < CUR_MS)) return;
    sent.nx = cur.nx;
    sent.ny = cur.ny;
    sent.d = cur.d;
    sent.t = now;
    net.send({
      t: "cur", f: myId, d: cur.d,
      x: Math.round(cur.nx * 1e3) / 1e3,
      y: Math.round(cur.ny * 1e3) / 1e3,
    });
  }

  // --- chrome ---
  const rgb = (t) => `rgb(${(t[0] * 255) | 0},${(t[1] * 255) | 0},${(t[2] * 255) | 0})`;
  function renderLegend() {
    if (!peersEl) return;
    peersEl.textContent = "";
    const dot = (tint, title) => {
      const s = document.createElement("span");
      s.style.background = rgb(tint);
      s.title = title;
      peersEl.appendChild(s);
    };
    dot(TINTS[myId % TINTS.length], "you");
    const list = [...peers.values()].sort((a, b) => a.id - b.id);
    for (const p of list) dot(p.tint, `peer ${p.id}`);
  }

  let lastLine = "";
  function statusLine() {
    const conn = net.state();
    if (conn !== "live") return conn === "connecting" ? "relay connecting" : "relay offline - retrying";
    const camStr =
      cam === "live" ? "live" :
      cam === "prompting" ? "requesting camera access" :
      cam === "fallback" ? camMsg : "camera off";
    return `room ${room} · ${peers.size + 1} here · ${camStr}`;
  }

  // --- frame hooks ---
  const freshList = [];
  let wasWriting = false;

  function tick(now = performance.now()) {
    if (cam === "live" && now - lastSample >= (PF.reduce ? 1000 : SAMPLE_MS)) {
      lastSample = now;
      if (sampler.read(store)) sendSil();
    }
    pumpCursor(now);
    freshList.length = 0;
    for (const p of peers.values()) if (p.fresh(now)) freshList.push(p);
    freshList.sort((a, b) => a.id - b.id);
    const has = freshList.length > 0;
    if (wasWriting && !has) {
      // replay ambient as a drift->scene entry so the return staggers in
      dir.cur = -1;
      dir.play("ambient");
    }
    wasWriting = has;
    const line = statusLine();
    if (line !== lastLine) {
      lastLine = line;
      statusEl.textContent = line;
      statusEl.dataset.mode = cam === "fallback" ? "fallback" : "live";
    }
    if (legendDirty) {
      legendDirty = false;
      renderLegend();
    }
    state.conn = net.state();
    state.cam = cam;
    state.id = myId;
  }

  const home = field.home, hcol = field.hcol, homed = field.homed;
  const mist = PAL.mist, hot = PAL.hot;

  function writeHomes() {
    const k = freshList.length;
    if (!k) return false;
    const iw = innerWidth, ih = innerHeight, cy = ih * 0.52;
    const zUnit = field.unit;
    for (let j = 0; j < k; j++) {
      const p = freshList[j];
      const buf = p.sil.buf, count = p.sil.count, tint = p.tint;
      const lo = (j * N / k) | 0, hi = ((j + 1) * N / k) | 0, span = hi - lo;
      const cx = iw * (j + 0.5) / k;
      const s = Math.min(iw * 0.9 / k / p.sil.aspect, ih * 0.8);
      const zAmp = 0.06 * s / zUnit;
      for (let i = lo; i < hi; i++) {
        const j4 = (((i - lo) * count / span) | 0) * 4;
        const o = i * 3;
        homed[i] = 1;
        home[o] = cx + buf[j4] * s;
        home[o + 1] = cy - buf[j4 + 1] * s;
        home[o + 2] = (field.h1(i) - 0.5) * zAmp;
        if (buf[j4 + 3] > 0.5) {
          hcol[o] = tint[0] + (hot[0] - tint[0]) * 0.45;
          hcol[o + 1] = tint[1] + (hot[1] - tint[1]) * 0.45;
          hcol[o + 2] = tint[2] + (hot[2] - tint[2]) * 0.45;
        } else {
          const sh = 0.25 + 0.75 * buf[j4 + 2];
          hcol[o] = mist[0] + (tint[0] - mist[0]) * sh;
          hcol[o + 1] = mist[1] + (tint[1] - mist[1]) * sh;
          hcol[o + 2] = mist[2] + (tint[2] - mist[2]) * sh;
        }
      }
    }
    return true;
  }

  const state = { conn: "connecting", cam: "boot", room, id: 0 };
  window.__tele = {
    state, peers, net,
    send: (o) => net.send(o),
    // feeds a synthetic message through the real roster/msg paths so
    // headless checks can simulate peers with no relay
    inject: (m) => (m.t === "welcome" || m.t === "join" || m.t === "leave" ? onRoster(m) : onMsg(m)),
  };

  openCam();

  return { tick, writeHomes };
}
