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
    right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1],
    f: 600, cx: 0, cy: 0, ox: 0, oy: 0,
    K: 90,
    shake: 0,
    speed: 0,
    boost: 1,
    boosting: false,
    drifting: false,
    diff: 1, // difficulty speed multiplier, set by the run
  };

  const TURN = 1.55, ROLL = 2.3, ACCEL = 320, STRAFE = 250, VERT = 250;
  const CAP = 640, BCAP = 1450, DRAG = 0.42;

  cam.resize = () => {
    cam.cx = innerWidth / 2;
    cam.cy = innerHeight / 2;
    cam.f = innerHeight * 0.72;
  };
  cam.resize();

  cam.update = (dt, keys) => {
    const yIn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    const pIn = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    const rIn = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
    cam.yaw += yIn * TURN * dt;
    cam.pitch += pIn * TURN * 0.8 * dt;
    cam.pitch = Math.max(-1.2, Math.min(1.2, cam.pitch));
    cam.roll += rIn * ROLL * dt;
    // hands off the roll keys: ease toward a bank angle set by yaw input
    if (!rIn) cam.roll += (-yIn * 0.5 - cam.roll) * Math.min(1, dt * 3);
    cam.roll = Math.max(-1.1, Math.min(1.1, cam.roll));

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

    cam.drifting = !!(keys.ControlLeft || keys.ControlRight);
    const wantBoost = (!!keys.ShiftLeft || !!keys.ShiftRight) && !!keys.KeyW;
    cam.boosting = wantBoost && cam.boost > 0.02;
    const boost = cam.boosting ? 2.6 : 1;
    cam.boost = Math.max(0, Math.min(1, cam.boost + (wantBoost ? -0.34 : 0.09) * dt));

    const th = cam.drifting ? 0 : (keys.KeyW ? ACCEL * boost : 0) - (keys.KeyS ? ACCEL * 0.55 : 0);
    const st = cam.drifting ? 0 : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const vt = cam.drifting ? 0 : (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0);
    cam.vx += (cam.fwd[0] * th + cam.right[0] * st * STRAFE + cam.up[0] * vt * VERT) * dt;
    cam.vy += (cam.fwd[1] * th + cam.right[1] * st * STRAFE + cam.up[1] * vt * VERT) * dt;
    cam.vz += (cam.fwd[2] * th + cam.right[2] * st * STRAFE + cam.up[2] * vt * VERT) * dt;

    const drag = cam.drifting ? 0 : DRAG;
    const d = Math.exp(-drag * dt);
    cam.vx *= d; cam.vy *= d; cam.vz *= d;
    const sp2 = cam.vx * cam.vx + cam.vy * cam.vy + cam.vz * cam.vz;
    const cap = (cam.boosting ? BCAP : CAP) * cam.diff;
    if (sp2 > cap * cap) {
      const s = cap / Math.sqrt(sp2);
      cam.vx *= s; cam.vy *= s; cam.vz *= s;
    }
    cam.speed = Math.sqrt(Math.min(sp2, cap * cap * 4));
    cam.x += cam.vx * dt;
    cam.y += cam.vy * dt;
    cam.z += cam.vz * dt;

    cam.shake = Math.max(0, cam.shake - dt * 1.5);
    const sh = cam.shake * cam.shake * 26;
    cam.ox = (Math.random() - 0.5) * sh;
    cam.oy = (Math.random() - 0.5) * sh;
  };

  // world -> {screen x, screen y, home.z}; false when behind the near plane
  const out = cam.out = [0, 0, 0];
  cam.project = (wx, wy, wz) => {
    const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
    const vx = cam.right[0] * dx + cam.right[1] * dy + cam.right[2] * dz;
    const vy = cam.up[0] * dx + cam.up[1] * dy + cam.up[2] * dz;
    const vz = cam.fwd[0] * dx + cam.fwd[1] * dy + cam.fwd[2] * dz;
    if (vz <= NEAR) return false;
    const s = cam.f / vz;
    out[0] = cam.cx + cam.ox + vx * s;
    out[1] = cam.cy + cam.oy - vy * s;
    out[2] = PZ * (1 - vz / cam.K);
    return true;
  };

  return cam;
}
