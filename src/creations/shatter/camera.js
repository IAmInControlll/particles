// camera.js - rail camera: fixed forward speed down -z, gentle lane sway,
// collision shake, world->home projection. The run cannot steer; the lane
// wander is what makes gap panes and weak panels interesting.
export function createCamera(PF) {
  const PZ = PF.CFG.perspZ;
  const cam = {
    x: 0, y: 0, z: 0,
    f: 600, cx: 0, cy: 0, ox: 0, oy: 0,
    K: 170, NEAR: 6,
    right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1],
    shake: 0, t: 0,
    speed: 320, ramp: 0, // ramp 0..~0.9 builds speed over distance
  };

  cam.resize = () => {
    cam.cx = innerWidth / 2;
    cam.cy = innerHeight / 2;
    cam.f = innerHeight * 0.74;
  };
  cam.resize();

  // lane wander: the path the camera rides, also the bend axis of the
  // corridor - obstacles place their gaps/weak panels relative to this.
  // Near-straight: a curved lane hides whether a pane actually blocks
  // you, so the drift stays inside one ball's width
  cam.laneX = (z) => Math.sin(z * 0.00042) * 10 + Math.sin(z * 0.00111 + 1.7) * 4;
  cam.laneY = (z) => Math.sin(z * 0.00035 + 0.8) * 6 + Math.sin(z * 0.00088 + 3.1) * 3;

  cam.update = (dt) => {
    cam.t += dt;
    cam.z -= cam.speed * (1 + cam.ramp) * dt;
    const k = Math.min(1, dt * 2.4);
    cam.x += (cam.laneX(cam.z) - cam.x) * k;
    cam.y += (cam.laneY(cam.z) - cam.y) * k;

    // view basis: look down-lane at a point ahead, bank lightly into curves
    const ah = cam.z - 140;
    let fx = cam.laneX(ah) - cam.x, fy = cam.laneY(ah) - cam.y, fz = ah - cam.z;
    let n = 1 / Math.hypot(fx, fy, fz);
    const F = cam.fwd, R = cam.right, U = cam.up;
    F[0] = fx * n; F[1] = fy * n; F[2] = fz * n;
    // right = normalize(F x up0); up = R x F
    n = 1 / Math.max(1e-6, Math.hypot(F[2], F[0]));
    R[0] = -F[2] * n; R[1] = 0; R[2] = F[0] * n;
    U[0] = R[1] * F[2] - R[2] * F[1];
    U[1] = R[2] * F[0] - R[0] * F[2];
    U[2] = R[0] * F[1] - R[1] * F[0];
    const roll = Math.max(-0.14, Math.min(0.14,
      (cam.laneX(cam.z - 60) - cam.laneX(cam.z)) * 0.0011));
    const cr = Math.cos(roll), sr = Math.sin(roll);
    for (const V of [R, U]) {
      const cx = F[1] * V[2] - F[2] * V[1], cy = F[2] * V[0] - F[0] * V[2],
        cz = F[0] * V[1] - F[1] * V[0];
      V[0] = V[0] * cr + cx * sr; V[1] = V[1] * cr + cy * sr; V[2] = V[2] * cr + cz * sr;
    }

    cam.shake = Math.max(0, cam.shake - dt * 1.6);
    const sh = cam.shake * cam.shake * 30;
    cam.ox = (Math.random() - 0.5) * sh;
    cam.oy = (Math.random() - 0.5) * sh;
  };

  // world -> {screen x, screen y, raw home.z}; false behind the near plane.
  // Callers clamp out[2] per layer - raw depth crushes far sprite scale.
  const out = cam.out = [0, 0, 0];
  cam.project = (wx, wy, wz) => {
    const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
    const R = cam.right, U = cam.up, F = cam.fwd;
    const vx = R[0] * dx + R[1] * dy + R[2] * dz;
    const vy = U[0] * dx + U[1] * dy + U[2] * dz;
    const vz = F[0] * dx + F[1] * dy + F[2] * dz;
    if (vz <= cam.NEAR) return false;
    const s = cam.f / vz;
    out[0] = cam.cx + cam.ox + vx * s;
    out[1] = cam.cy + cam.oy - vy * s;
    out[2] = PZ * (1 - vz / cam.K);
    return true;
  };

  // screen px tap -> world point at view depth d ahead (unproject inverse)
  cam.unproject = (sx, sy, d) => {
    const vx = (sx - cam.cx) * d / cam.f, vy = (cam.cy - sy) * d / cam.f;
    return [
      cam.x + cam.right[0] * vx + cam.up[0] * vy + cam.fwd[0] * d,
      cam.y + cam.right[1] * vx + cam.up[1] * vy + cam.fwd[1] * d,
      cam.z + cam.right[2] * vx + cam.up[2] * vy + cam.fwd[2] * d,
    ];
  };

  return cam;
}
