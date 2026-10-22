// playground.js - boots a PF field, registers scenes, wires the control panel.
import { PF } from "../engine/index.js";
import { makeScenes } from "../scenes/scenes.js";

(function () {
  const CFG = PF.CFG;
  const DEFAULTS = structuredClone(CFG);
  const panel = document.getElementById("panel");
  const stats = document.getElementById("stats");

  let field = null;
  let dir = null;
  let sceneFns = {};
  let activeName = "__drift";
  let textFn = null;
  const ui = {
    N: PF.isMobile() ? 4000 : 9000,
    seed: 7,
    fit: 0.8,
    cxOff: 0,
    cyOff: 0,
    excludePanel: false,
    noPointer: false,
    wellShare: 0,
    hoverOn: true,
    pressOn: true,
    paused: false,
    driftX: innerWidth * 0.7,
    driftY: innerHeight * 0.5,
  };

  const PANEL_W = 340;

  // ---------- scenes ----------

  function sceneBox(fn) {
    const ext = fn.ext || [4.4, 3.2];
    const availW = innerWidth - PANEL_W;
    return {
      cx: availW / 2 + ui.cxOff,
      cy: innerHeight / 2 + ui.cyOff,
      s: (Math.min(availW / ext[0], innerHeight / ext[1]) * ui.fit),
    };
  }

  function makeTextScene(text) {
    const r = PF.textPoints(text, {
      font: "600 160px system-ui, 'Segoe UI', sans-serif",
      h: 240,
      norm: 90,
      maxPoints: field.N,
    });
    if (!r) return null;
    const { pts, ext } = r;
    const fn = (i, t, T, out, col) => {
      const p = PF.pick(pts, i, field.N);
      out[0] = p[0];
      out[1] = p[1];
      out[2] = 0;
      const c = i % 23 === 0 ? PF.PAL.accent : i % 3 ? PF.PAL.ink : PF.PAL.mist;
      col[0] = c[0] * 0.75;
      col[1] = c[1] * 0.75;
      col[2] = c[2] * 0.75;
    };
    fn.ext = ext;
    return fn;
  }

  function goScene(name) {
    activeName = name;
    if (name === "__drift") {
      dir.fromPos = field.pos.slice();
      dir.fromCol = field.col.slice();
      dir.prev = dir.cur;
      dir.cur = -1;
      dir.switchT = field.T;
      return;
    }
    dir.play(name);
    sceneSelect && (sceneSelect.value = name);
  }

  function releaseAll() {
    const d = PF.PAL.dim;
    for (let i = 0; i < field.N; i++) {
      field.homed[i] = 0;
      field.hcol[i * 3] = d[0] * 0.7;
      field.hcol[i * 3 + 1] = d[1] * 0.7;
      field.hcol[i * 3 + 2] = d[2] * 0.7;
    }
  }

  function frameHook() {
    field.exclude = ui.excludePanel
      ? [{ l: innerWidth - PANEL_W - 10, t: -10, r: innerWidth + 10, b: innerHeight + 10 }]
      : [];
    if (dir.cur < 0) {
      // drift: let the fromPos blend decay, then full release
      if (dir.fromPos && field.T - dir.switchT < dir.dur) {
        dir.homes();
      } else {
        releaseAll();
      }
      field.drift.x = ui.driftX;
      field.drift.y = ui.driftY;
    } else {
      dir.homes();
    }
  }

  // deterministic random subset of particles ignores every pointer well
  function applyNoWell() {
    if (!field) return;
    for (let p = 0; p < field.N; p++)
      field.noWell[p] = field.h1(p) < ui.wellShare ? 1 : 0;
  }

  function boot() {
    PF.reseed(ui.seed);
    const oldName = activeName;
    if (field) {
      field.stop && field.stop();
      field.canvas.remove();
    }
    field = PF.createField({ N: ui.N });
    if (!field.ok) {
      stats.textContent = "WebGL unavailable";
      return;
    }
    field.canPull = (e) => ui.pressOn && !e.target.closest("#panel");
    field.mouseZone = () =>
      !ui.noPointer &&
      !(field.mouse.over && field.mouse.over.closest && field.mouse.over.closest("#panel"));
    applyNoWell();

    sceneFns = makeScenes(field);
    dir = PF.createDirector(field, { dur: CFG.directorDur });
    dir.scenes = [];
    for (const name of Object.keys(sceneFns))
      dir.register(name, sceneFns[name], { boxFn: () => sceneBox(sceneFns[name]) });
    if (textFn)
      dir.register("__text", textFn, { boxFn: () => sceneBox(textFn) });

    field.frame = frameHook;
    activeName = "__drift";
    buildSceneList();
    if (oldName === "__text" && textFn) dir.play("__text");
    else if (oldName !== "__drift") dir.play(oldName);
    ui.driftX = field.drift.x;
    ui.driftY = field.drift.y;
    field.start();
  }

  // ---------- UI ----------

  function el(tag, attrs, parent) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) e[k] = attrs[k];
    if (parent) parent.appendChild(e);
    return e;
  }

  function row(sec, label) {
    const r = el("div", { className: "row" }, sec);
    el("label", { textContent: label, title: label }, r);
    return r;
  }

  const fmt = (v) => (Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(1) : +(+v).toPrecision(3));

  function slider(sec, label, obj, key, min, max, step, opts = {}) {
    const r = row(sec, label);
    const inp = el("input", { type: "range", min, max, step, value: obj[key] }, r);
    const out = el("output", { textContent: fmt(obj[key]) }, r);
    inp.oninput = () => {
      obj[key] = +inp.value;
      out.textContent = fmt(obj[key]);
      if (opts.onchange) opts.onchange();
    };
    return inp;
  }

  function colorRow(sec, label, get, set) {
    const r = row(sec, label);
    const inp = el("input", { type: "color" }, r);
    const toHex = (a) => "#" + a.map((v) => Math.round(Math.min(1, v) * 255).toString(16).padStart(2, "0")).join("");
    inp.value = toHex(get());
    inp.oninput = () => {
      const v = [1, 3, 5].map((i) => parseInt(inp.value.slice(i, i + 2), 16) / 255);
      set(v);
    };
    return inp;
  }

  function check(sec, label, obj, key) {
    const r = row(sec, label);
    const inp = el("input", { type: "checkbox", checked: obj[key] }, r);
    inp.onchange = () => (obj[key] = inp.checked);
    return inp;
  }

  function button(sec, label, fn) {
    const r = sec.classList && sec.classList.contains("row") ? sec : row(sec, "");
    const b = el("button", { textContent: label }, r);
    b.onclick = fn;
    return b;
  }

  function section(title, open = false) {
    const d = el("details", { open }, panel);
    el("summary", { textContent: title }, d);
    return d;
  }

  let sceneSelect;
  function buildSceneList() {
    if (!sceneSelect) return;
    sceneSelect.innerHTML = "";
    el("option", { value: "__drift", textContent: "· free drift" }, sceneSelect);
    if (textFn) el("option", { value: "__text", textContent: "· custom text" }, sceneSelect);
    Object.keys(sceneFns).sort().forEach((k) => el("option", { value: k, textContent: k }, sceneSelect));
    sceneSelect.value = activeName;
  }

  function buildUI() {
    el("h1", { textContent: "Particles" }, panel);
    el("div", { className: "sub", textContent: "point-sprite field - live controls" }, panel);

    const sScene = section("Scene", true);
    const r0 = row(sScene, "scene");
    sceneSelect = el("select", {}, r0);
    sceneSelect.onchange = () => goScene(sceneSelect.value);
    const rt = row(sScene, "custom text");
    const tin = el("input", { type: "text", placeholder: "type + Form", value: "PARTICLES" }, rt);
    tin.onkeydown = (e) => e.stopPropagation();
    button(rt, "Form", () => {
      const fn = makeTextScene(tin.value.trim() || " ");
      if (!fn) return;
      textFn = fn;
      const ti = dir.scenes.findIndex((s) => s.name === "__text");
      if (ti >= 0) dir.scenes.splice(ti, 1);
      dir.register("__text", textFn, { boxFn: () => sceneBox(textFn) });
      buildSceneList();
      goScene("__text");
    });
    slider(sScene, "transition dur", CFG, "directorDur", 0.2, 5, 0.05, { onchange: () => (dir.dur = CFG.directorDur) });
    slider(sScene, "stagger depth", CFG, "transStagger", 0, 1.5, 0.01);
    slider(sScene, "trans speed", CFG, "transSpeed", 0.5, 4, 0.05);
    slider(sScene, "scene fit", ui, "fit", 0.2, 1.5, 0.01);
    slider(sScene, "scene x", ui, "cxOff", -600, 600, 5);
    slider(sScene, "scene y", ui, "cyOff", -400, 400, 5);
    const rb = row(sScene, "");
    button(rb, "Replay morph", () => {
      if (!field) return;
      for (let i = 0; i < field.N * 3; i += 3) {
        field.vel[i] += (PF.rnd() - 0.5) * 60;
        field.vel[i + 1] += (PF.rnd() - 0.5) * 60;
      }
      dir.fromPos = field.pos.slice();
      dir.fromCol = field.col.slice();
      dir.switchT = field.T;
    });
    check(sScene, "reduce motion", { get reduce() { return PF.reduce; }, set reduce(v) { PF.setReduce(v); } }, "reduce");

    const sSim = section("Simulation");
    slider(sSim, "time scale", CFG, "timeScale", 0, 3, 0.01);
    slider(sSim, "dt clamp (s)", CFG, "dtMax", 0.005, 0.12, 0.005);
    const rp = row(sSim, "");
    button(rp, "Pause [space]", () => setPaused(!ui.paused));
    const rn = row(sSim, "particles N");
    const nIn = el("input", { type: "number", min: 200, max: 40000, step: 200, value: ui.N }, rn);
    nIn.onkeydown = (e) => e.stopPropagation();
    button(rn, "Rebuild", () => {
      ui.N = Math.max(200, Math.min(40000, +nIn.value || ui.N));
      boot();
    });
    const rs = row(sSim, "seed");
    const sIn = el("input", { type: "number", min: 1, max: 99999, step: 1, value: ui.seed }, rs);
    sIn.onkeydown = (e) => e.stopPropagation();
    button(rs, "Reseed+rebuild", () => {
      ui.seed = +sIn.value || 7;
      boot();
    });

    const sRen = section("Render");
    slider(sRen, "point scale", CFG, "pointScale", 0.001, 0.015, 0.0001);
    slider(sRen, "point max H", CFG, "pointMaxH", 300, 2000, 10);
    slider(sRen, "min point px", CFG, "pointMinPx", 0.5, 8, 0.1, { onchange: () => field.recompile() });
    slider(sRen, "max DPR", CFG, "maxDPR", 0.5, 3, 0.25, { onchange: () => dispatchEvent(new Event("resize")) });
    slider(sRen, "persp Z", CFG, "perspZ", 3, 20, 0.5, { onchange: () => field.recompile() });
    slider(sRen, "persp min", CFG, "perspMin", 1, 8, 0.25, { onchange: () => field.recompile() });
    slider(sRen, "depth fade", CFG, "depthFade", 0, 1, 0.01);
    slider(sRen, "core gain", CFG, "coreGain", 0, 2, 0.02);
    slider(sRen, "twinkle", CFG, "twinkle", 0, 0.5, 0.01);
    slider(sRen, "twinkle rate", CFG, "twinkleRate", 0, 8, 0.1);
    slider(sRen, "heat gain", CFG, "heatGain", 0, 3, 0.05);
    slider(sRen, "heat max", CFG, "heatMax", 0, 1, 0.02);
    slider(sRen, "color jitter", CFG, "colVar", 0, 0.3, 0.005);
    colorRow(sRen, "background", () => CFG.bg.map((v) => v / 255), (v) => (CFG.bg = v.map((x) => x * 255)));
    for (const name of Object.keys(PF.PAL))
      colorRow(sRen, "pal " + name, () => PF.PAL[name], (v) => { PF.PAL[name][0] = v[0]; PF.PAL[name][1] = v[1]; PF.PAL[name][2] = v[2]; });

    const sPhys = section("Homing + flocking");
    slider(sPhys, "spring", CFG, "spring", 0, 0.15, 0.001);
    slider(sPhys, "spring leader", CFG, "springLeader", 0, 0.2, 0.001);
    slider(sPhys, "spring capture", CFG, "springCapture", 0, 0.6, 0.005);
    slider(sPhys, "damp homed", CFG, "dampHome", 0.5, 0.99, 0.005);
    slider(sPhys, "damp free", CFG, "dampFree", 0.8, 0.999, 0.001);
    slider(sPhys, "neighbor R xu", CFG, "neighborR", 0.02, 0.4, 0.005);
    slider(sPhys, "sep R xu", CFG, "sepR", 0.002, 0.1, 0.001);
    slider(sPhys, "max neighbors", CFG, "maxNeighbors", 1, 24, 1);
    slider(sPhys, "cohesion", CFG, "cohesion", 0, 0.15, 0.001);
    slider(sPhys, "align", CFG, "align", 0, 0.3, 0.005);
    slider(sPhys, "separation", CFG, "separation", 0, 0.8, 0.01);
    slider(sPhys, "grid cell xu", CFG, "cellSize", 0.04, 0.4, 0.005);
    slider(sPhys, "leader glow", CFG, "leaderBrighten", 1, 2.5, 0.05);

    const sDrift = section("Drift (un-homed)");
    slider(sDrift, "flow amp", CFG, "flowAmp", 0, 0.01, 0.0002);
    slider(sDrift, "flow freq", CFG, "flowFreq", 0.1, 3, 0.05);
    slider(sDrift, "flow t1", CFG, "flowT1", 0, 1.5, 0.01);
    slider(sDrift, "flow t2", CFG, "flowT2", 0, 1.5, 0.01);
    slider(sDrift, "flow harmonic", CFG, "flowHarm", 0, 2, 0.05);
    slider(sDrift, "flow freq2", CFG, "flowFreq2", 0.5, 5, 0.05);
    slider(sDrift, "flow t3", CFG, "flowT3", 0, 1.5, 0.01);
    slider(sDrift, "drift pull", CFG, "driftPull", 0, 0.01, 0.0002);
    slider(sDrift, "drift x", ui, "driftX", 0, innerWidth, 5);
    slider(sDrift, "drift y", ui, "driftY", 0, innerHeight, 5);

    const sMouse = section("Mouse");
    check(sMouse, "cursor off", ui, "noPointer");
    slider(sMouse, "immune share", ui, "wellShare", 0, 1, 0.01, { onchange: applyNoWell });
    const hoverChk = check(sMouse, "hover repel", ui, "hoverOn");
    check(sMouse, "press pull", ui, "pressOn");
    slider(sMouse, "repel R xu", CFG, "repelBase", 0.05, 2, 0.05);
    slider(sMouse, "speed gain", CFG, "repelSpeedGain", 0, 20, 0.5);
    slider(sMouse, "speed max", CFG, "repelSpeedMax", 0.2, 4, 0.1);
    const repelAmpInp = slider(sMouse, "repel amp", CFG, "repelAmp", 0, 0.4, 0.005);
    hoverChk.onchange = () => {
      ui.hoverOn = hoverChk.checked;
      repelAmpInp.disabled = !hoverChk.checked; // slider can't fight the switch
      CFG.repelAmp = hoverChk.checked ? +repelAmpInp.value : 0;
    };
    slider(sMouse, "repel swirl", CFG, "repelSwirl", -3, 3, 0.1);
    slider(sMouse, "repel z", CFG, "repelZ", 0, 3, 0.05);
    slider(sMouse, "pull R xu", CFG, "pullR", 0.5, 6, 0.1);
    slider(sMouse, "pull amp", CFG, "pullAmp", 0, 0.15, 0.002);
    slider(sMouse, "pull swirl", CFG, "pullSwirl", -3, 3, 0.1);
    slider(sMouse, "capture R xu", CFG, "captureR", 0.02, 0.6, 0.01);
    slider(sMouse, "horizon R xu", CFG, "horizonR", 0.01, 0.2, 0.005);
    slider(sMouse, "infall rate", CFG, "orbSink", 0, 0.05, 0.001);
    slider(sMouse, "orbit speed", CFG, "orbKepler", 0, 4, 0.05);
    slider(sMouse, "disc tilt", CFG, "discTilt", 0, 1, 0.02);
    slider(sMouse, "horizon glow xu", CFG, "horizonGlow", 0.05, 1, 0.02);
    slider(sMouse, "fling", CFG, "fling", 0, 2, 0.05);
    slider(sMouse, "fling rand", CFG, "flingRand", 0, 8, 0.1);
    el("div", { className: "hint", textContent: "hover = repel+swirl - hold LMB = pull, capture orbits, release = fling" }, sMouse);

    const sEx = section("Exclude zones");
    check(sEx, "avoid panel", ui, "excludePanel");
    el("div", { className: "hint", textContent: "particles get pushed out of the panel rect" }, sEx);

    const sInit = section("Init (applies on rebuild)");
    slider(sInit, "reserve every", CFG, "reserveEvery", 0, 30, 1);
    slider(sInit, "leader chance", CFG, "leaderChance", 0, 0.2, 0.005);
    slider(sInit, "leader boost", CFG, "leaderBoost", 0, 4, 0.1);
    slider(sInit, "big chance", CFG, "bigChance", 0, 0.2, 0.005);
    slider(sInit, "big boost", CFG, "bigBoost", 0, 4, 0.1);
    slider(sInit, "size min", CFG, "sizeMin", 0.1, 3, 0.05);
    slider(sInit, "size var", CFG, "sizeVar", 0, 3, 0.05);
    slider(sInit, "stagger min", CFG, "stagMin", 0, 2, 0.05);
    slider(sInit, "stagger var", CFG, "stagVar", 0, 2, 0.05);
    slider(sInit, "spawn spread", CFG, "spawnSpread", 0, 3, 0.05);

    const sCfg = section("Config");
    const rc = row(sCfg, "");
    button(rc, "Copy config", () => {
      const diff = {};
      for (const k in CFG) if (JSON.stringify(CFG[k]) !== JSON.stringify(DEFAULTS[k])) diff[k] = CFG[k];
      navigator.clipboard && navigator.clipboard.writeText(JSON.stringify({ CFG: diff, PAL: PF.PAL }, null, 1));
    });
    button(rc, "Reset all", () => location.reload());
    el("div", { className: "hint", textContent: "Reset rebuilds the page. Copy exports changed values." }, sCfg);
  }

  let savedScale = 1;
  function setPaused(v) {
    if (!ui.paused) savedScale = CFG.timeScale || 1;
    ui.paused = v;
    CFG.timeScale = v ? 0 : savedScale;
  }
  addEventListener("keydown", (e) => {
    if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      setPaused(!ui.paused);
    }
  });

  let fps = 60, lastT = performance.now();
  (function statLoop(t) {
    requestAnimationFrame(statLoop);
    const dt = t - lastT;
    lastT = t;
    fps += (1000 / Math.max(1, dt) - fps) * 0.05;
    if (field)
      stats.textContent = `${fps.toFixed(0)} fps  N=${field.N}  unit=${field.unit.toFixed(1)}px  T=${field.T.toFixed(1)}s  scene=${activeName}`;
  })(performance.now());

  buildUI();
  boot();
  // start on an original scene - swirl-in from spawn cluster via fromPos
  if (dir.scenes.length) {
    activeName = "__drift";
    dir.play("ring");
    activeName = "ring";
    sceneSelect && (sceneSelect.value = "ring");
  }
})();
