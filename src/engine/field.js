// field.js - particle state + GL renderer + per-frame physics step.
// Spring homing, flocking, drift flow, pointer forces, exclusion zones.
import { CFG, PAL, isMobile, rnd, params, F } from "./core.js";

export function createField(opts = {}) {
  const C = CFG;
  const N = opts.N ?? (isMobile() ? 4000 : 9000);

  let canvas = document.createElement("canvas");
  canvas.className = "pf-gl";
  canvas.style.cssText = `position:fixed;inset:0;z-index:${opts.zIndex ?? 0}`;
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  let gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: !!opts.transparent,
    premultipliedAlpha: true,
  });
  const field = { N, canvas, ok: !!gl, T: 0 };
  if (!gl) return field;

  // state: pos, vel, col (rendered), home/hcol (targets), plus flags
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const home = new Float32Array(N * 3);
  const hcol = new Float32Array(N * 3);
  const drawSize = new Float32Array(N);
  const ph = new Float32Array(N * 3); // per-particle phases, also hash source

  const homed = new Uint8Array(N).fill(1);
  const snap = new Uint8Array(N);
  const capt = new Uint8Array(N); // 0 = free, w + 1 = captured by wells[w]
  const leader = new Uint8Array(N);
  const reserve = new Uint8Array(N);
  const noFlock = new Uint8Array(N); // 1 = exempt from neighbor forces
  const size = new Float32Array(N);
  const sz = new Float32Array(N).fill(1);
  const stag = new Float32Array(N);
  const orbR = new Float32Array(N);
  const orbA = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    ph[i * 3] = rnd() * 6.283;
    ph[i * 3 + 1] = rnd() * 6.283;
    ph[i * 3 + 2] = rnd() * 6.283;
    size[i] = C.sizeMin + rnd() * C.sizeVar + (rnd() < C.bigChance ? C.bigBoost : 0);
    reserve[i] = +(i % C.reserveEvery === 0);
    leader[i] = +(!reserve[i] && rnd() < C.leaderChance);
    stag[i] = leader[i] ? 0 : C.stagMin + rnd() * C.stagVar;
    if (leader[i]) size[i] += C.leaderBoost;
    pos[i * 3] = innerWidth * (0.5 + (rnd() - 0.5) * C.spawnSpread);
    pos[i * 3 + 1] = innerHeight * (0.5 + (rnd() - 0.5) * C.spawnSpread);
  }

  Object.assign(field, {
    pos, vel, col, home, hcol, homed, snap, capt,
    leader, reserve, size, sz, stag, noFlock,
    extraWells: [], // remote/synthetic cursors {x, y, down, tint?} get the same physics as mouse
    exclude: [],
    drift: { x: innerWidth * 0.7, y: innerHeight * 0.5 },
    unit: innerHeight / C.unitDiv,
    frame: null, // per-step hook: field.frame(T, dt)
    canPull: (e) => !e.target.closest("a,button,input,textarea,label,select,summary,form"),
    mouseZone: null,
  });
  field.h1 = (i) => ph[i * 3] / 6.283;
  field.h2 = (i) => ph[i * 3 + 1] / 6.283;
  field.h3 = (i) => ph[i * 3 + 2] / 6.283;

  // --- GL setup ---
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return sh;
  };
  let prog, bufP, bufC, bufS, uR, uPt, uCore, uFade;
  const initGL = () => {
    prog = gl.createProgram();
    gl.attachShader(
      prog,
      compile(
        gl.VERTEX_SHADER,
        `attribute vec3 aP; attribute vec3 aC; attribute float aS;
         uniform vec2 uR; uniform float uPt; varying vec3 vC; varying float vD;
         void main(){
           float d = ${F(C.perspZ)} / max(${F(C.perspMin)}, ${F(C.perspZ)} - aP.z);
           gl_Position = vec4(aP.x / uR.x * 2.0 - 1.0, 1.0 - aP.y / uR.y * 2.0, 0.0, 1.0);
           gl_PointSize = max(${F(C.pointMinPx)}, aS * uPt * d);
           vC = aC;
           vD = d;
         }`
      )
    );
    gl.attachShader(
      prog,
      compile(
        gl.FRAGMENT_SHADER,
        `precision mediump float; varying vec3 vC; varying float vD;
         uniform float uCore; uniform float uFade;
         void main(){
           float r = length(gl_PointCoord - 0.5);
           if (r > 0.5) discard;
           float a = smoothstep(0.5, 0.0, r);
           float core = smoothstep(0.22, 0.0, r) * uCore;
           float fade = mix(uFade, 1.0, clamp((vD - 0.85) / 0.3, 0.0, 1.0));
           gl_FragColor = vec4(vC * (a + core) * fade, a * fade);
         }`
      )
    );
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const attr = (data, name, dim) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      const a = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, dim, gl.FLOAT, false, 0, 0);
      return b;
    };
    bufP = attr(pos, "aP", 3);
    bufC = attr(col, "aC", 3);
    bufS = attr(drawSize, "aS", 1);
    uR = gl.getUniformLocation(prog, "uR");
    uPt = gl.getUniformLocation(prog, "uPt");
    uCore = gl.getUniformLocation(prog, "uCore");
    uFade = gl.getUniformLocation(prog, "uFade");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  };
  initGL();

  let dpr = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, C.maxDPR);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uR, innerWidth, innerHeight);
    gl.uniform1f(uPt, C.pointScale * Math.min(innerHeight, C.pointMaxH) * dpr);
    field.unit = innerHeight / C.unitDiv;
    field.onResize && field.onResize();
  }
  field.recompile = () => {
    initGL();
    resize();
  };
  resize();
  addEventListener("resize", resize);

  // context-loss recovery: swap in a fresh canvas if the context dies
  let lostTimer = 0;
  const watch = (cv) => {
    cv.addEventListener("webglcontextlost", (ev) => {
      ev.preventDefault();
      clearTimeout(lostTimer);
      lostTimer = setTimeout(rebuildCtx, 2000);
    });
    cv.addEventListener("webglcontextrestored", () => {
      if (cv === canvas) {
        clearTimeout(lostTimer);
        initGL();
        resize();
      }
    });
  };
  const rebuildCtx = () => {
    if (!gl.isContextLost()) return;
    const cv = canvas.cloneNode(false);
    const g2 = cv.getContext("webgl", { antialias: false, alpha: !!opts.transparent, premultipliedAlpha: true });
    if (!g2 || g2.isContextLost()) {
      lostTimer = setTimeout(rebuildCtx, 5000);
      return;
    }
    canvas.replaceWith(cv);
    canvas = field.canvas = cv;
    gl = g2;
    watch(cv);
    initGL();
    resize();
  };
  watch(canvas);

  // --- pointer ---
  const mouse = (field.mouse = { x: -9e3, y: -9e3, px: 0, py: 0, vx: 0, vy: 0, speed: 0, down: false, over: null });
  addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.over = e.target;
  }, { passive: true });
  addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" && field.canPull(e)) {
      mouse.down = true;
      e.preventDefault();
    }
  });
  addEventListener("pointerup", () => {
    mouse.down = false;
  });
  document.addEventListener("pointerleave", () => {
    mouse.x = mouse.y = -9e3;
  });

  // --- uniform grid for flocking neighbor lookups (counting sort) ---
  let gw = 0, gh = 0;
  let pCell = new Int32Array(N);
  let pOrder = new Int32Array(N);
  let cellStart = new Int32Array(1);
  let cursor = new Int32Array(1);
  function buildGrid() {
    const cell = C.cellSize * field.unit;
    gw = Math.ceil((innerWidth + 400) / cell);
    gh = Math.ceil((innerHeight + 400) / cell);
    if (cellStart.length !== gw * gh + 1) {
      cellStart = new Int32Array(gw * gh + 1);
      cursor = new Int32Array(gw * gh);
    } else cellStart.fill(0);
    for (let i = 0; i < N; i++) {
      const cx = Math.min(gw - 1, Math.max(0, ((pos[i * 3] + 200) / cell) | 0));
      const cy = Math.min(gh - 1, Math.max(0, ((pos[i * 3 + 1] + 200) / cell) | 0));
      pCell[i] = cy * gw + cx;
      cellStart[pCell[i] + 1]++;
    }
    for (let i = 0; i < gw * gh; i++) cellStart[i + 1] += cellStart[i];
    cursor.set(cellStart.subarray(0, gw * gh));
    for (let i = 0; i < N; i++) pOrder[cursor[pCell[i]]++] = i;
  }

  let last = performance.now();
  let lastScroll = scrollY;
  let warp = +params.get("t") || 0;
  let reported = false;
  const report = (e) => {
    if (!reported) {
      reported = true;
      (self.reportError || console.error)(e);
    }
  };

  // --- physics step ---
  // dtf normalizes to a 180fps reference frame so tuning is framerate-independent.
  function step(dt) {
    if (dt <= 0) return;
    field.T += dt;
    const T = field.T;
    const unit = field.unit;
    const dtf = Math.max(0.25, Math.min(3, dt * 180));
    const dampHomeP = Math.pow(C.dampHome, dtf);
    const dampFreeP = Math.pow(C.dampFree, dtf);
    const kCol = 1 - Math.pow(1 - C.colorLerp, dtf);
    const kMouse = 1 - Math.pow(1 - C.mouseSpeedEase, dtf);

    const sy = (scrollY - lastScroll) * (opts.couple ?? C.scrollCouple);
    lastScroll = scrollY;
    if (sy) for (let i = 0; i < N; i++) pos[i * 3 + 1] -= sy;

    const wells = [mouse];
    for (const w of field.extraWells) wells.push(w);
    for (const w of wells) {
      if (w.x > -9e3) {
        if (w.px === undefined) { w.px = w.x; w.py = w.y; w.vx = w.vy = w.speed = 0; }
        w.vx = (w.x - w.px) / dtf;
        w.vy = (w.y - w.py) / dtf;
        if (Math.abs(w.vx) > C.mouseVelCap || Math.abs(w.vy) > C.mouseVelCap) w.vx = w.vy = 0;
        w.px = w.x;
        w.py = w.y;
        w.speed += (Math.hypot(w.vx, w.vy) / unit - w.speed) * kMouse;
        w.on = true;
      } else {
        w.speed = (w.speed || 0) * Math.pow(0.9, dtf);
        w.on = false;
      }
    }

    snap.fill(0);
    if (field.frame)
      try {
        field.frame(T, dt);
      } catch (e) {
        report(e);
      }

    buildGrid();
    const neighR2 = (C.neighborR * unit) ** 2;
    const sepR2 = (C.sepR * unit) ** 2;
    const ex = field.exclude;
    const drift = field.drift;
    const tint = PAL.accent;
    const hot = PAL.hot;
    const ccMix = [0, 0, 0];

    for (let p = 0; p < N; p++) {
      const i = p * 3;
      let tx = home[i], ty = home[i + 1], tz = home[i + 2];

      if (capt[p]) {
        const w = wells[capt[p] - 1];
        if (!w || !w.on || !w.down) {
          // well released or vanished - fling and free
          capt[p] = 0;
          if (w) {
            vel[i] += w.vx * C.fling + (rnd() - 0.5) * C.flingRand;
            vel[i + 1] += w.vy * C.fling + (rnd() - 0.5) * C.flingRand;
          }
        } else {
          // accretion: exponential infall to the horizon, Kepler angular speed,
          // per-particle orbital inclination for a volumetric disc
          const rMin = C.horizonR * unit;
          orbR[p] += (rMin - orbR[p]) * (1 - Math.pow(1 - C.orbSink, dtf));
          if (orbR[p] < rMin) orbR[p] = rMin;
          const rr = orbR[p] / unit;
          orbA[p] += dt * Math.min(C.orbSpeedMax, C.orbKepler * Math.pow(rr, -1.5));
          const cA = Math.cos(orbA[p]), sA = Math.sin(orbA[p]);
          const flat = 1 - C.discTilt + (ph[i + 1] / 6.283) * C.discTilt;
          const zTilt = (ph[i + 2] / 6.283 - 0.5) * 2 * C.discTilt;
          tx = w.x + cA * orbR[p];
          ty = w.y + sA * orbR[p] * flat;
          tz = sA * orbR[p] * zTilt;
        }
      }

      // keep the target outside exclusion rects
      for (let e = 0; e < ex.length; e++) {
        const z = ex[e];
        if (tx < z.l || tx > z.r || ty < z.t || ty > z.b) continue;
        const dl = tx - z.l, dr = z.r - tx, dT = ty - z.t, db = z.b - ty;
        const m = Math.min(dl, dr, dT, db);
        if (m === dl) tx = z.l;
        else if (m === dr) tx = z.r;
        else ty = m === dT ? z.t : z.b;
      }

      if (snap[p]) {
        pos[i] = tx;
        pos[i + 1] = ty;
        pos[i + 2] = tz;
        vel[i] = vel[i + 1] = vel[i + 2] = 0;
      }

      let cc = null;
      if (capt[p]) {
        const wt = wells[capt[p] - 1]?.tint || tint;
        const g = Math.min(1, orbR[p] / (C.horizonGlow * unit));
        ccMix[0] = wt[0] + (hot[0] - wt[0]) * (1 - g);
        ccMix[1] = wt[1] + (hot[1] - wt[1]) * (1 - g);
        ccMix[2] = wt[2] + (hot[2] - wt[2]) * (1 - g);
        cc = ccMix;
      }
      const heat = Math.min(C.heatMax, (Math.hypot(vel[i], vel[i + 1]) / unit) * C.heatGain);
      const jit = 1 + (ph[i + 2] - 3.14159) * C.colVar;
      for (let e = 0; e < 3; e++) {
        let tg = (cc ? cc[e] : hcol[i + e]) * jit;
        if (heat > 0.002) tg += (hot[e] - tg) * heat;
        col[i + e] += (tg - col[i + e]) * kCol;
      }

      const jx = pos[i], jy = pos[i + 1], jz = pos[i + 2];
      let fx = 0, fy = 0, fz = 0;

      if (homed[p] || capt[p]) {
        const k = capt[p] ? C.springCapture : leader[p] ? C.springLeader : C.spring;
        fx += (tx - jx) * k;
        fy += (ty - jy) * k;
        fz += (tz - jz) * k;

        if (!capt[p] && !reserve[p] && !noFlock[p]) {
          const cell = pCell[p];
          const ccx = cell % gw, ccy = (cell / gw) | 0;
          let cnt = 0, ax = 0, ay = 0, avx = 0, avy = 0;
          for (let dy = -1; dy <= 1 && cnt < C.maxNeighbors; dy++)
            for (let dx = -1; dx <= 1 && cnt < C.maxNeighbors; dx++) {
              const nc = (ccy + dy) * gw + ccx + dx;
              if (nc < 0 || nc >= gw * gh) continue;
              for (let e = cellStart[nc]; e < cellStart[nc + 1] && cnt < C.maxNeighbors; e++) {
                const n = pOrder[e];
                if (n === p || reserve[n]) continue;
                const ddx = pos[n * 3] - jx, ddy = pos[n * 3 + 1] - jy;
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 > neighR2) continue;
                cnt++;
                ax += pos[n * 3];
                ay += pos[n * 3 + 1];
                avx += vel[n * 3];
                avy += vel[n * 3 + 1];
                if (d2 < sepR2) {
                  fx -= ddx * C.separation;
                  fy -= ddy * C.separation;
                }
              }
            }
          if (cnt) {
            fx += (ax / cnt - jx) * C.cohesion;
            fy += (ay / cnt - jy) * C.cohesion;
            fx += (avx / cnt - vel[i]) * C.align;
            fy += (avy / cnt - vel[i + 1]) * C.align;
          }
        }
      } else {
        fx += (Math.cos((jy / unit) * C.flowFreq + T * C.flowT1 + ph[i]) +
               C.flowHarm * Math.cos((jx / unit) * C.flowFreq2 - T * C.flowT3 + ph[i + 2])) * C.flowAmp * unit + (drift.x - jx) * C.driftPull;
        fy += (Math.sin((jx / unit) * C.flowFreq + T * C.flowT2 + ph[i + 1]) +
               C.flowHarm * Math.sin((jy / unit) * C.flowFreq2 + T * C.flowT3 * 1.4 + ph[i])) * C.flowAmp * unit + (drift.y - jy) * C.driftPull;
      }

      // push particles out of exclusion rects
      for (let e = 0; e < ex.length; e++) {
        const z = ex[e];
        if (jx < z.l || jx > z.r || jy < z.t || jy > z.b) continue;
        const dl = jx - z.l, dr = z.r - jx, dT = jy - z.t, db = z.b - jy;
        const m = Math.min(dl, dr, dT, db);
        const push = (C.exBase + m * C.exDist) * unit * C.exPush;
        if (m === dl) fx -= push;
        else if (m === dr) fx += push;
        else if (m === dT) fy -= push;
        else fy += push;
      }

      if (!capt[p]) {
        for (let wi = 0; wi < wells.length; wi++) {
          const w = wells[wi];
          if (!w.on) continue;
          if (wi === 0 && field.mouseZone && !field.mouseZone(w.x, w.y)) continue;
          const dx = jx - w.x, dy = jy - w.y;
          const dist = Math.hypot(dx, dy) + 1e-4;
          if (w.down) {
            if (dist < C.pullR * unit) {
              const f = (1 - dist / (C.pullR * unit)) * C.pullAmp * unit;
              fx -= (dx / dist) * f - (dy / dist) * f * C.pullSwirl;
              fy -= (dy / dist) * f + (dx / dist) * f * C.pullSwirl;
              if (dist < C.captureR * unit) {
                capt[p] = wi + 1;
                orbR[p] = (C.orbRMin + rnd() * C.orbRVar) * unit;
                orbA[p] = Math.atan2(dy, dx);
              }
            }
          } else {
            const repelR = (C.repelBase + Math.min(C.repelSpeedMax, w.speed * C.repelSpeedGain)) * unit;
            if (dist < repelR) {
              const f = (1 - dist / repelR) ** 2 * C.repelAmp * unit;
              fx += (dx / dist) * f - (dy / dist) * f * C.repelSwirl;
              fy += (dy / dist) * f + (dx / dist) * f * C.repelSwirl;
              fz += (f / unit) * C.repelZ;
            }
          }
        }
      }

      const damp = homed[p] || capt[p] ? dampHomeP : dampFreeP;
      vel[i] = (vel[i] + fx * dtf) * damp;
      vel[i + 1] = (vel[i + 1] + fy * dtf) * damp;
      vel[i + 2] = (vel[i + 2] + fz * dtf) * damp;
      pos[i] += vel[i] * dtf;
      pos[i + 1] += vel[i + 1] * dtf;
      pos[i + 2] += vel[i + 2] * dtf;
    }
  }

  function draw(tms) {
    const dt = Math.min(C.dtMax, (tms - last) / 1000);
    last = tms;
    if (warp > 0) {
      for (let i = 0; i < 40 && warp > 0; i++) {
        step(1 / 60);
        warp -= 1 / 60;
      }
    } else step(dt * C.timeScale);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufP);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufC);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, col);
    const kSize = 1 - Math.pow(1 - C.sizeEase, Math.max(0.25, Math.min(3, dt * 180)));
    const twT = field.T * C.twinkleRate;
    for (let i = 0; i < N; i++) {
      const target = C.twinkle ? size[i] * sz[i] * (1 + C.twinkle * Math.sin(twT + ph[i])) : size[i] * sz[i];
      drawSize[i] += (target - drawSize[i]) * kSize;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, bufS);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, drawSize);
    gl.uniform1f(uCore, C.coreGain);
    gl.uniform1f(uFade, C.depthFade);
    if (opts.transparent) gl.clearColor(0, 0, 0, 0);
    else gl.clearColor(C.bg[0] / 255, C.bg[1] / 255, C.bg[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);
  }

  let running = true;
  const loop = (tms) => {
    if (!running) return;
    requestAnimationFrame(loop);
    try {
      draw(tms);
    } catch (e) {
      report(e);
    }
  };
  field.stop = () => (running = false);
  field.start = () =>
    requestAnimationFrame((tms) => {
      last = tms;
      loop(tms);
    });
  return field;
}
