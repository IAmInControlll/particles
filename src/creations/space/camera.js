// camera.js - 6DOF flight camera: motion state, key input, world->home projection.
// World: +x right, +y up, camera flies toward -z. home.z maps view depth onto the
// shader's perspective term d = perspZ / max(perspMin, perspZ - z).
export function createCamera(PF) {
  const PZ = PF.CFG.perspZ;
  const NEAR = 6;
  const cam = {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0, roll: 0,
    yv: 0, pv: 0, rv: 0, // angular velocity - inertia, not instant turn
    right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1],
    f: 600, cx: 0, cy: 0, ox: 0, oy: 0,
    K: 90,
    shake: 0,
    speed: 0,
    speedK: 0, // speed / cap, for gain layers elsewhere
    boost: 1,
    boosting: false,
    fovK: 0, // eased boost kick on focal length
    drifting: false,
    diff: 1, // difficulty speed multiplier, set by the run
    thrustK: 1, capK: 1, turnK: 1, // ship stats, set at pick
    chase: false, // third-person: render eye rides behind+above the hull
    levelT: 0, // seconds since last roll input - drives auto-straighten
    vr: [1, 0, 0], vu: [0, 1, 0], vf: [0, 0, -1], // chase view basis (lags)
    visor: 0, // cockpit counter-roll shown by deck/reticle (self-levels)
  };

  const TURN = 1.55, ROLL = 2.3, ACCEL = 320, STRAFE = 250, VERT = 250;
  const CAP = 640, BCAP = 1450, DRAG = 0.42;
  // thruster feel: angular velocity winds up over ~0.25s on input and
  // coasts down over ~0.5s on release - mass, not a mouse cursor
  const A_ATT = 4.2, A_REL = 2.1;

  cam.resize = () => {
    cam.cx = innerWidth / 2;
    cam.cy = innerHeight / 2;
    cam.fBase = innerHeight * 0.72;
    cam.f = cam.fBase;
  };
  cam.resize();

  cam.update = (dt, keys) => {
    const yIn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    const pIn = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    const rIn = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
    const TURNK = TURN * cam.turnK;
    cam.yv += (yIn * TURNK - cam.yv) * Math.min(1, dt * (yIn ? A_ATT : A_REL));
    cam.pv += (pIn * TURNK * 0.8 - cam.pv) * Math.min(1, dt * (pIn ? A_ATT : A_REL));
    cam.rv += (rIn * ROLL - cam.rv) * Math.min(1, dt * (rIn ? A_ATT : A_REL));
    // body-frame steering: yv/pv turn about the ship's own up/right
    // axes, so arrows stay canopy-relative at any roll. Converted to
    // Euler rates (yaw then pitch then roll) so the basis build below
    // and every cam.yaw/pitch/roll reader keep working.
    const cp0 = Math.cos(cam.pitch), sp0 = Math.sin(cam.pitch);
    const cr0 = Math.cos(cam.roll), sr0 = Math.sin(cam.roll);
    const yawR = (cam.pv * sr0 + cam.yv * cr0) / Math.max(0.2, cp0);
    cam.pitch += (cam.pv * cr0 - cam.yv * sr0) * dt;
    if (cam.pitch > 1.2) cam.pitch = 1.2;
    else if (cam.pitch < -1.2) cam.pitch = -1.2;
    cam.yaw += yawR * dt;
    cam.roll += (cam.rv + yawR * sp0) * dt;
    // hands off the roll keys: bank assist only engages near level -
    // past ~40deg the attitude sticks (true free roll, mod 2pi so a
    // full spin back to level still counts as level)
    cam.levelT = rIn ? 0 : cam.levelT + dt;
    const rmod = ((cam.roll % 6.2832) + 6.2832) % 6.2832;
    const rErr = rmod > 3.1416 ? rmod - 6.2832 : rmod;
    if (!rIn && Math.abs(rErr) < 0.75)
      cam.roll += (-cam.yv / TURNK * 0.5 - rErr) * Math.min(1, dt * 3);

    // visor counter-roll: the canopy interior tilts to sell the bank,
    // then self-levels a couple seconds after roll input stops - the
    // SHIP stays at whatever attitude you left it; only the cockpit
    // visual (deck + reticle) returns upright
    const vTgt = Math.max(-0.36, Math.min(0.36, -cam.roll)) * 0.4;
    const vFade = cam.levelT > 2 ? Math.max(0, 1 - (cam.levelT - 2) * 0.8) : 1;
    cam.visor += (vTgt * vFade - cam.visor) * Math.min(1, dt * 6);

    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
    // M = Ry(yaw) * Rx(pitch) * Rz(roll); columns are world-space right/up/back
    cam.right[0] = cy * cr + sy * sp * sr;
    cam.right[1] = cp * sr;
    cam.right[2] = -sy * cr + cy * sp * sr;
    cam.up[0] = -cy * sr + sy * sp * cr;
    cam.up[1] = cp * cr;
    cam.up[2] = sy * sr + cy * sp * cr;
    cam.fwd[0] = -sy * cp;
    cam.fwd[1] = sp;
    cam.fwd[2] = -cy * cp;

    // chase view basis trails the ship's true basis - the hull (drawn on
    // the true basis) visibly banks/pitches/turns in frame while the
    // camera swings around to catch up, like a racing chase cam
    const lk = 1 - Math.exp(-dt * 4.2);
    const vr = cam.vr, vu = cam.vu, vf = cam.vf;
    vf[0] += (cam.fwd[0] - vf[0]) * lk; vf[1] += (cam.fwd[1] - vf[1]) * lk; vf[2] += (cam.fwd[2] - vf[2]) * lk;
    vr[0] += (cam.right[0] - vr[0]) * lk; vr[1] += (cam.right[1] - vr[1]) * lk; vr[2] += (cam.right[2] - vr[2]) * lk;
    vu[0] += (cam.up[0] - vu[0]) * lk; vu[1] += (cam.up[1] - vu[1]) * lk; vu[2] += (cam.up[2] - vu[2]) * lk;
    // re-orthonormalize the lagged set around vf (Gram-Schmidt)
    let n = 1 / Math.hypot(vf[0], vf[1], vf[2]);
    vf[0] *= n; vf[1] *= n; vf[2] *= n;
    let dd = vr[0] * vf[0] + vr[1] * vf[1] + vr[2] * vf[2];
    vr[0] -= dd * vf[0]; vr[1] -= dd * vf[1]; vr[2] -= dd * vf[2];
    n = 1 / Math.hypot(vr[0], vr[1], vr[2]);
    vr[0] *= n; vr[1] *= n; vr[2] *= n;
    vu[0] = vr[1] * vf[2] - vr[2] * vf[1]; // up = right x fwd
    vu[1] = vr[2] * vf[0] - vr[0] * vf[2];
    vu[2] = vr[0] * vf[1] - vr[1] * vf[0];

    cam.drifting = !!(keys.ControlLeft || keys.ControlRight);
    const wantBoost = (!!keys.ShiftLeft || !!keys.ShiftRight) && !!keys.KeyW;
    cam.boosting = wantBoost && cam.boost > 0.02;
    const boost = cam.boosting ? 2.6 : 1;
    cam.boost = Math.max(0, Math.min(1, cam.boost + (wantBoost ? -0.34 : 0.09) * dt));

    const th = cam.drifting ? 0 : (keys.KeyW ? ACCEL * cam.thrustK * boost : 0) - (keys.KeyS ? ACCEL * cam.thrustK * 0.55 : 0);
    const st = cam.drifting ? 0 : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const vt = cam.drifting ? 0 : (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0);
    cam.vx += (cam.fwd[0] * th + cam.right[0] * st * STRAFE + cam.up[0] * vt * VERT) * dt;
    cam.vy += (cam.fwd[1] * th + cam.right[1] * st * STRAFE + cam.up[1] * vt * VERT) * dt;
    cam.vz += (cam.fwd[2] * th + cam.right[2] * st * STRAFE + cam.up[2] * vt * VERT) * dt;

    const drag = cam.drifting ? 0 : DRAG;
    const d = Math.exp(-drag * dt);
    cam.vx *= d; cam.vy *= d; cam.vz *= d;
    const sp2 = cam.vx * cam.vx + cam.vy * cam.vy + cam.vz * cam.vz;
    const cap = (cam.boosting ? BCAP : CAP) * cam.diff * cam.capK;
    if (sp2 > cap * cap) {
      const s = cap / Math.sqrt(sp2);
      cam.vx *= s; cam.vy *= s; cam.vz *= s;
    }
    cam.speed = Math.sqrt(Math.min(sp2, cap * cap * 4));
    cam.speedK = Math.min(1, cam.speed / BCAP);
    cam.x += cam.vx * dt;
    cam.y += cam.vy * dt;
    cam.z += cam.vz * dt;

    // boost + raw speed widen the lens: near field sweeps outward faster
    const kick = cam.boosting ? 1 : cam.speedK * 0.55;
    cam.fovK += (kick - cam.fovK) * Math.min(1, dt * 4);
    cam.f = cam.fBase * (1 - cam.fovK * 0.18);

    cam.shake = Math.max(0, cam.shake - dt * 1.5);
    const sh = cam.shake * cam.shake * 26;
    cam.ox = (Math.random() - 0.5) * sh;
    cam.oy = (Math.random() - 0.5) * sh;
  };

  // world -> {screen x, screen y, home.z}; false when behind the near plane
  // Chase view: the render eye sits behind+above the hull while cam.x/y/z
  // stays the SHIP position, so physics and world anchors are untouched -
  // project() just subtracts the offset eye and adds a small down-tilt so
  // the silhouette reads center-low with the corridor ahead above it.
  const EYE_B = 150, EYE_U = 42, EYE_TILT = -0.08;
  const eCt = Math.cos(EYE_TILT), eSt = Math.sin(EYE_TILT);
  const out = cam.out = [0, 0, 0];
  cam.project = (wx, wy, wz) => {
    let dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
    const R = cam.chase ? cam.vr : cam.right;
    const U = cam.chase ? cam.vu : cam.up;
    const F = cam.chase ? cam.vf : cam.fwd;
    if (cam.chase) {
      dx += F[0] * EYE_B - U[0] * EYE_U;
      dy += F[1] * EYE_B - U[1] * EYE_U;
      dz += F[2] * EYE_B - U[2] * EYE_U;
    }
    const vx = R[0] * dx + R[1] * dy + R[2] * dz;
    let vy = U[0] * dx + U[1] * dy + U[2] * dz;
    let vz = F[0] * dx + F[1] * dy + F[2] * dz;
    if (cam.chase) {
      const ty = vy * eCt - vz * eSt;
      vz = vy * eSt + vz * eCt;
      vy = ty;
    }
    if (vz <= NEAR) return false;
    const s = cam.f / vz;
    out[0] = cam.cx + cam.ox + vx * s;
    out[1] = cam.cy + cam.oy - vy * s;
    out[2] = PZ * (1 - vz / cam.K);
    return true;
  };

  return cam;
}
