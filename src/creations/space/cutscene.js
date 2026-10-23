// cutscene.js - docking cinematics. A script is a shot list plus a cue
// timeline (shape in story.js). While one plays it flies the ship on
// autopilot, puts the render eye on cam.eye (an external orbit around the
// ship), fires cues through onCue, and draws the letterbox. The carrier
// detonation lives here too: it outlives the cutscene if you skip.
const D2R = Math.PI / 180;
const NOKEYS = {};
const BOOM_STAGES = [0, 0.45, 0.9]; // seconds after boom(): spine pops, then the core
const ease = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;

export function createCutscene(cam, field, fx, course, PF) {
  const lm = course.landmark;
  const home = field.home, hcol = field.hcol, size = field.size;
  const eye = { x: 0, y: 0, z: 0, R: [1, 0, 0], U: [0, 1, 0], F: [0, 0, -1] };
  const aim = [0, 0, 0];
  let side = 1; // +1: carrier is to port, so "abeam" (az 90) is starboard
  let script = null, t = 0, cueI = 0, onCue = null, onEnd = null, total = 0;
  let barK = 0, lastDt = 0.016;
  // detonation clock: <0 idle, else seconds since boom(); flash/ring
  // anchor on the wreck centre
  let boomT = -1, stage = 0, flash = 0;
  const ring = [0, 0, 0];

  const cut = {};
  cut.active = () => !!script;
  cut.t = () => t;
  cut.shot = () => {
    if (!script) return -1;
    let acc = 0;
    for (let i = 0; i < script.shots.length; i++) if (t < (acc += script.shots[i].dur)) return i;
    return script.shots.length - 1;
  };
  cut.boomT = () => boomT;

  cut.play = (s, cueFn, endFn) => {
    script = s; t = 0; cueI = 0; onCue = cueFn; onEnd = endFn;
    total = s.shots.reduce((a, sh) => a + sh.dur, 0);
    // pass the carrier on the side you came in on, ~170wu off her centre
    let lx = cam.x - lm.x, ly = cam.y - lm.y, lz = cam.z - lm.z;
    const f = cam.fwd, along = lx * f[0] + ly * f[1] + lz * f[2];
    lx -= f[0] * along; ly -= f[1] * along; lz -= f[2] * along;
    let ll = Math.hypot(lx, ly, lz);
    if (ll < 1) { lx = cam.right[0]; ly = cam.right[1]; lz = cam.right[2]; ll = 1; }
    aim[0] = lm.x + lx / ll * 170; aim[1] = lm.y + ly / ll * 170; aim[2] = lm.z + lz / ll * 170;
    side = lx * cam.right[0] + ly * cam.right[1] + lz * cam.right[2] >= 0 ? 1 : -1;
  };

  const finish = () => {
    script = null;
    cam.eye = null;
    const f = onEnd; onEnd = null; onCue = null;
    f();
  };

  // Enter/Space: every cue still fires (the radio keeps the story), then cut
  cut.skip = () => {
    if (!script || t < 0.4) return false;
    while (cueI < script.cues.length) onCue(script.cues[cueI++], true);
    finish();
    return true;
  };

  // autopilot: line up on the pass point while it is ahead, level the
  // wings, and ease to the shot's speed - input stays locked
  const pilot = (dt, spd) => {
    const dx = aim[0] - cam.x, dy = aim[1] - cam.y, dz = aim[2] - cam.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    if (dx * cam.fwd[0] + dy * cam.fwd[1] + dz * cam.fwd[2] > 150) {
      let dyaw = Math.atan2(-dx, -dz) - cam.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const k = Math.min(1, dt * 1.4);
      cam.yaw += dyaw * k;
      cam.pitch += (Math.asin(dy / len) - cam.pitch) * k;
    }
    const rm = ((cam.roll % 6.2832) + 6.2832) % 6.2832;
    cam.roll -= (rm > 3.1416 ? rm - 6.2832 : rm) * Math.min(1, dt * 1.6);
    cam.yv = cam.pv = cam.rv = 0;
    const k = Math.min(1, dt * 1.2);
    cam.vx += (cam.fwd[0] * spd - cam.vx) * k;
    cam.vy += (cam.fwd[1] * spd - cam.vy) * k;
    cam.vz += (cam.fwd[2] * spd - cam.vz) * k;
    cam.update(dt, NOKEYS);
  };

  const anchor = (name, out) => {
    if (name === "ship") { out[0] = cam.x; out[1] = cam.y; out[2] = cam.z; }
    else if (name === "wreck") { out[0] = lm.x; out[1] = lm.y; out[2] = lm.z; }
    else if (name === "mid") { out[0] = (cam.x + lm.x) / 2; out[1] = (cam.y + lm.y) / 2; out[2] = (cam.z + lm.z) / 2; }
    else { out[0] = cam.x + cam.fwd[0] * 600; out[1] = cam.y + cam.fwd[1] * 600; out[2] = cam.z + cam.fwd[2] * 600; }
  };
  const la = [0, 0, 0], lb = [0, 0, 0];

  const frameEye = (sh, u) => {
    const e = ease(u);
    const az = lerp(sh.az[0], sh.az[1], e) * D2R * side, el = lerp(sh.el[0], sh.el[1], e) * D2R;
    const d = lerp(sh.d[0], sh.d[1], e);
    const R = cam.right, U = cam.up, F = cam.fwd;
    const ca = Math.cos(az) * Math.cos(el), sa = Math.sin(az) * Math.cos(el), se = Math.sin(el);
    eye.x = cam.x + d * (-F[0] * ca + R[0] * sa + U[0] * se);
    eye.y = cam.y + d * (-F[1] * ca + R[1] * sa + U[1] * se);
    eye.z = cam.z + d * (-F[2] * ca + R[2] * sa + U[2] * se);
    anchor(sh.look[0], la); anchor(sh.look[1], lb);
    const f = eye.F, r = eye.R, v = eye.U;
    f[0] = lerp(la[0], lb[0], e) - eye.x; f[1] = lerp(la[1], lb[1], e) - eye.y; f[2] = lerp(la[2], lb[2], e) - eye.z;
    let n = 1 / (Math.hypot(f[0], f[1], f[2]) || 1);
    f[0] *= n; f[1] *= n; f[2] *= n;
    r[0] = f[1] * U[2] - f[2] * U[1]; r[1] = f[2] * U[0] - f[0] * U[2]; r[2] = f[0] * U[1] - f[1] * U[0];
    n = 1 / (Math.hypot(r[0], r[1], r[2]) || 1);
    r[0] *= n; r[1] *= n; r[2] *= n;
    v[0] = r[1] * f[2] - r[2] * f[1]; v[1] = r[2] * f[0] - r[0] * f[2]; v[2] = r[0] * f[1] - r[1] * f[0];
    cam.eye = eye;
  };

  cut.frame = (dt) => {
    if (!script) return;
    t += dt;
    while (cueI < script.cues.length && script.cues[cueI].t <= t) onCue(script.cues[cueI++], false);
    if (!script) return; // a cue may not end the scene, but stay safe
    if (t >= total) return finish();
    let acc = 0, sh = script.shots[0], u = 0;
    for (const s of script.shots) {
      if (t < acc + s.dur) { sh = s; u = (t - acc) / s.dur; break; }
      acc += s.dur;
    }
    pilot(dt, sh.spd);
    frameEye(sh, u);
  };

  // --- detonation: staged pops along the spine, then the core goes with a
  // flash and a shockwave ring; the hull particles fly apart and fade
  cut.boom = () => { boomT = 0; stage = 0; ring[0] = lm.x; ring[1] = lm.y; ring[2] = lm.z; };
  cut.resetBoom = () => { boomT = -1; flash = 0; };
  const pop = (along, col, n, mag) =>
    fx.burst(lm.x + lm.D[0] * along, lm.y + lm.D[1] * along, lm.z + lm.D[2] * along, col, n, mag);

  // runs every frame after course.frame: owns the wreck's look once it blows
  cut.wreck = (dt) => {
    lastDt = dt;
    if (boomT < 0) {
      // on camera the carrier is close: lift it off the far-body depth
      // floor and warm it up so the hull reads as a ship, not dust
      if (!script) return;
      for (let i = 0; i < lm.n; i++) {
        const p = lm.lo + i, j = p * 3;
        if (home[j] < -4e3) continue;
        home[j + 2] = Math.max(home[j + 2], -0.8);
        hcol[j] *= 1.35; hcol[j + 1] *= 1.35; hcol[j + 2] *= 1.35;
      }
      return;
    }
    boomT += dt;
    while (stage < BOOM_STAGES.length && boomT >= BOOM_STAGES[stage]) {
      if (stage === 0) { pop(-90, PF.PAL.hot, 60, 90); pop(60, PF.PAL.hot, 60, 90); }
      else if (stage === 1) { pop(-40, PF.PAL.accent, 90, 140); pop(110, PF.PAL.hot, 90, 140); cam.shake = Math.max(cam.shake, 0.5); }
      else {
        pop(0, [1, 0.95, 0.85], 200, 320);
        pop(0, PF.PAL.hot, 150, 200);
        pop(-100, PF.PAL.accent, 60, 160);
        flash = 1;
        cam.shake = 1.2;
      }
      stage++;
    }
    const bt = boomT - BOOM_STAGES[2]; // time since the core went
    if (bt < 0) return;
    if (!cam.project(lm.x, lm.y, lm.z)) { for (let i = 0; i < lm.n; i++) size[lm.lo + i] = 0; return; }
    const cx = cam.out[0], cy = cam.out[1];
    const fade = Math.max(0, 1 - bt / 3.2), hot = Math.max(0, 1 - bt / 0.6);
    for (let i = 0; i < lm.n; i++) {
      const p = lm.lo + i, j = p * 3;
      if (fade <= 0 || home[j] < -4e3) { size[p] = 0; continue; }
      const h = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      const s = 1 + bt * (1.2 + h * 4);
      home[j] = cx + (home[j] - cx) * s + Math.cos(i * 2.4) * bt * 60 * h;
      home[j + 1] = cy + (home[j + 1] - cy) * s + Math.sin(i * 2.4) * bt * 60 * h;
      hcol[j] = (hcol[j] + hot * 1.6) * fade;
      hcol[j + 1] = (hcol[j + 1] + hot * 1.0) * fade;
      hcol[j + 2] = (hcol[j + 2] + hot * 0.5) * fade;
    }
  };

  // drawn on the comms canvas, under the comms box
  cut.draw = (g, W, H) => {
    const dt = lastDt;
    barK += ((script ? 1 : 0) - barK) * Math.min(1, dt * 5);
    const bt = boomT - BOOM_STAGES[2];
    if (boomT >= 0 && bt >= 0 && bt < 3 && cam.project(ring[0], ring[1], ring[2])) {
      const rx = cam.out[0], ry = cam.out[1];
      for (let k = 0; k < 2; k++) {
        const u = bt - k * 0.25;
        if (u <= 0) continue;
        const rr = Math.pow(u, 0.55) * Math.max(W, H) * 0.42;
        g.globalAlpha = Math.max(0, 1 - u / 2.6) * (k ? 0.45 : 0.85);
        g.strokeStyle = k ? "#ffd8a0" : "#fff2e0";
        g.lineWidth = (k ? 2 : 5) * (1 + u);
        g.beginPath(); g.ellipse(rx, ry, rr, rr * 0.34, -0.12, 0, 6.283); g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (flash > 0) {
      g.fillStyle = `rgba(255,244,228,${(flash * 0.92).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
      flash = Math.max(0, flash - dt * 1.3);
    }
    if (barK < 0.01) return;
    // tall enough to swallow the chase instrument strip (max(96, H*.16))
    const bh = (Math.max(96, H * 0.16) + 4) * barK;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, bh);
    g.fillRect(0, H - bh, W, bh);
    if (script) {
      g.globalAlpha = barK;
      g.font = "11px ui-monospace,Consolas,monospace";
      g.textBaseline = "middle";
      g.fillStyle = "#e8b060";
      g.textAlign = "left";
      if (script.caption) g.fillText(script.caption, 24, H - bh / 2);
      g.fillStyle = "#5f7a80";
      g.textAlign = "right";
      g.fillText("ENTER / SPACE  skip", W - 24, H - bh / 2);
      g.textAlign = "left";
      g.globalAlpha = 1;
    }
  };

  return cut;
}
