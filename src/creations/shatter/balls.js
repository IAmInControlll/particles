// balls.js - the thrown-ball pool. A tap unprojects to a world point ahead
// of the camera, ballistic aim compensates gravity so the clump lands where
// you tapped, and world-space hit tests run against the obstacle lists.
// Balls are homed clumps rewritten each frame (snap); a dead ball releases
// to drift for a beat, then its slice parks back at the camera hand.
export function createBalls(field, cam, PF, layer, hooks) {
  const rnd = PF.rnd;
  const { home, hcol, homed, snap, size, vel, noFlock, noWell } = field;

  const MAXB = 12;
  const BCAP = ((layer.hi - layer.lo) / MAXB) | 0;
  const R = 10;            // clump radius, wu
  const V = 1150;          // throw speed, wu/s
  const G = 330;           // gravity, wu/s^2
  const RANGE = 1500;      // despawn depth past the camera
  const LIFE = 3.2;

  const balls = [];
  for (let i = 0; i < MAXB; i++) {
    const b = {
      on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      life: 0, die: 0, vol: null, pierce: 0,
      lo: layer.lo + i * BCAP,
      ox: new Float32Array(BCAP), oy: new Float32Array(BCAP), oz: new Float32Array(BCAP),
    };
    for (let q = 0; q < BCAP; q++) {
      // small dense sphere, slightly squashed on z for a disk read head-on
      const a = rnd() * 6.283, u = rnd() * 2 - 1, w = Math.sqrt(1 - u * u);
      const r = R * (0.3 + rnd() * 0.7);
      b.ox[q] = Math.cos(a) * w * r;
      b.oy[q] = u * r;
      b.oz[q] = Math.sin(a) * w * r * 0.5;
      const p = b.lo + q;
      noFlock[p] = 1; noWell[p] = 1;
      homed[p] = 1; home[p * 3] = -5e3; home[p * 3 + 1] = -5e3; home[p * 3 + 2] = 0;
      snap[p] = 1; size[p] = 0;
    }
    balls.push(b);
  }

  const game = { balls };
  let next = 0;

  // tap at screen (sx,sy) -> throw `count` balls, fanned by aim offsets
  game.throwAt = (sx, sy, count) => {
    const spawned = [];
    for (let k = 0; k < count; k++) {
      const b = balls[next]; next = (next + 1) % MAXB;
      if (b.on) continue;
      // aim at a fixed-depth unproject point, fanned horizontally + lobbed
      // up to compensate gravity so the arc lands on the tap point
      const fx = sx + (k - (count - 1) / 2) * 13 + (rnd() - 0.5) * 6;
      const [tx, ty, tz] = cam.unproject(fx, sy + (rnd() - 0.5) * 8, 340);
      const hx = cam.x + cam.fwd[0] * 26 + cam.up[0] * -16 + cam.right[0] * 7;
      const hy = cam.y + cam.fwd[1] * 26 + cam.up[1] * -16 + cam.right[1] * 7;
      const hz = cam.z + cam.fwd[2] * 26 + cam.up[2] * -16 + cam.right[2] * 7;
      const dx = tx - hx, dy = ty - hy, dz = tz - hz;
      const d = Math.hypot(dx, dy, dz) || 1;
      const t = d / V;
      const vy = (dy + 0.5 * G * t * t) / t; // arrive on target despite gravity
      b.vx = dx / t; b.vy = vy; b.vz = dz / t;
      b.x = hx; b.y = hy; b.z = hz;
      b.life = 0; b.die = 0; b.pierce = hooks.heavy() ? 1 : 0;
      b.on = true;
      spawned.push(b);
    }
    return spawned;
  };

  // release a ball's slice to drift as a dying spark, then repark
  const kill = (b, bright) => {
    for (let q = 0; q < BCAP; q++) {
      const p = b.lo + q, j = p * 3;
      homed[p] = 0;
      vel[j] += (rnd() - 0.5) * 2.2;
      vel[j + 1] += (rnd() - 0.5) * 2.2;
      vel[j + 2] += 0.02 + rnd() * 0.03;
      if (bright) { hcol[j] *= 1.5; hcol[j + 1] *= 1.5; hcol[j + 2] *= 1.5; }
    }
    b.die = 0.7;
    b.on = false;
    if (b.vol) { b.vol.live--; b.vol = null; }
  };

  game.frame = (dt) => {
    for (const b of balls) {
      if (b.die > 0) {
        b.die -= dt;
        if (b.die <= 0) {
          for (let q = 0; q < BCAP; q++) {
            const p = b.lo + q, j = p * 3;
            homed[p] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
            snap[p] = 1; size[p] = 0;
          }
        }
        continue;
      }
      if (!b.on) continue;
      const px = b.x, py = b.y, pz = b.z;
      b.life += dt;
      b.vy -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      // despawn rules: past max range, below the tunnel floor, timed out,
      // or drifting behind the camera plane
      const depth = cam.z - b.z;
      const floor = cam.laneY(b.z) - 330;
      if (b.life > LIFE || depth > RANGE || depth < -40 || b.y < floor) {
        kill(b, false);
        continue;
      }
      const hit = hooks.hitTest(b.x, b.y, b.z, px, py, pz);
      if (hit) {
        hooks.onHit(hit, b);
        if (hit.type === "pane" && b.pierce > 0) { b.pierce--; }
        else kill(b, hit.type !== "steel");
        continue;
      }
      for (let q = 0; q < BCAP; q++) {
        const p = b.lo + q, j = p * 3;
        if (!cam.project(b.x + b.ox[q], b.y + b.oy[q], b.z + b.oz[q])) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0; snap[p] = 1;
          continue;
        }
        const o = cam.out;
        home[j] = o[0]; home[j + 1] = o[1];
        home[j + 2] = o[2] < 0.4 ? 0.4 : o[2] > 2.8 ? 2.8 : o[2];
        homed[p] = 1; snap[p] = 1;
        size[p] = 1.35;
        hcol[j] = PF.PAL.hot[0] * 0.9; hcol[j + 1] = PF.PAL.hot[1] * 0.9; hcol[j + 2] = PF.PAL.hot[2] * 0.95;
      }
    }
  };

  game.inFlight = () => balls.reduce((n, b) => n + (b.on ? 1 : 0), 0);
  game.reset = () => {
    for (const b of balls) {
      b.on = false; b.die = 0; b.vol = null;
      for (let q = 0; q < BCAP; q++) {
        const p = b.lo + q, j = p * 3;
        homed[p] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1; size[p] = 0;
      }
    }
  };
  return game;
}
