// entities.js - enemy ships, bolt pool, pickups. Pooled index ranges on the
// ent layer; each entity rigidly transforms a design-space body per frame.
// Dead entities release their range to drift with an outward impulse.
export function createEntities(field, cam, PF, layer, ctx) {
  const rnd = PF.rnd;
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock,
    vel = field.vel, pos = field.pos;

  const N = layer.hi - layer.lo;
  const SHIP_PTS = 380, BOLT_PTS = 10, PICK_PTS = 40;
  const SHIPS = Math.max(1, Math.min(3, (N * 0.58 / SHIP_PTS) | 0));
  const PICKS = Math.max(2, Math.min(8, (N * 0.16 / PICK_PTS) | 0));
  const BOLTS = ((N - SHIPS * SHIP_PTS - PICKS * PICK_PTS) / BOLT_PTS) | 0;
  const RED = [1.0, 0.38, 0.32], GOLD = [1.0, 0.82, 0.35];

  // fighter silhouette in body space, facing -z, ~42 wu long
  const SHIP_SCALE = 1.6;
  const body = new Float32Array(SHIP_PTS * 3);
  const bodyKind = new Uint8Array(SHIP_PTS); // 0 hull, 1 glow, 2 tip
  let bi = 0;
  const bp = (x, y, z, kind) => {
    if (bi >= SHIP_PTS) return;
    body[bi * 3] = x * SHIP_SCALE; body[bi * 3 + 1] = y * SHIP_SCALE; body[bi * 3 + 2] = z * SHIP_SCALE;
    bodyKind[bi++] = kind;
  };
  for (let t = 0; t < 130; t++) {
    const z = -13 + (t / 130) * 26;
    const r = 0.7 + Math.sin((z + 13) / 26 * Math.PI) * 1.3;
    const a = rnd() * 6.283;
    bp(Math.cos(a) * r, Math.sin(a) * r * 0.7, z, 0);
  }
  for (let t = 0; t < 24; t++) bp((rnd() - 0.5) * 1.6, 1.4 + rnd() * 0.8, -4 + rnd() * 5, 0); // canopy
  for (let s = -1; s <= 1; s += 2)
    for (let t = 0; t <= 1; t += 1 / 78) {
      const x = s * (1.5 + t * 9.5), z = 3 + t * 7;
      bp(x, (rnd() - 0.5) * 0.4, z + (rnd() - 0.5) * 1.2, 0);
    }
  for (let s = -1; s <= 1; s += 2)
    for (let t = 0; t < 18; t++) bp(s * (2 + t * 1.4), t * 1.6, 10 + t * 0.35, 0); // tail fins
  for (let t = 0; t < 26; t++) bp((rnd() < 0.5 ? 3 : -3) + (rnd() - 0.5) * 3, (rnd() - 0.5) * 2, 12 + rnd() * 1.4, 0); // engine blocks
  for (let t = 0; t < 14; t++) bp((rnd() - 0.5) * 3.4, (rnd() - 0.5) * 1.6, 13.6, 1); // engine glow
  for (let s = -1; s <= 1; s += 2) for (let t = 0; t < 5; t++) bp(s * 11, 0, 10, 2); // wingtips
  while (bi < SHIP_PTS) bp((rnd() - 0.5) * 6, (rnd() - 0.5) * 2.5, 4 + rnd() * 8, 0); // hull fill

  const boltBody = new Float32Array(BOLT_PTS * 3);
  for (let i = 0; i < BOLT_PTS; i++) {
    boltBody[i * 3] = (rnd() - 0.5) * 0.5;
    boltBody[i * 3 + 1] = (rnd() - 0.5) * 0.5;
    boltBody[i * 3 + 2] = -2.2 + (i / BOLT_PTS) * 4.4;
  }

  const pickBody = new Float32Array(PICK_PTS * 3);
  for (let i = 0; i < PICK_PTS; i++) {
    if (i < 28) {
      const a = (i / 28) * 6.283;
      pickBody[i * 3] = Math.cos(a) * 3; pickBody[i * 3 + 1] = Math.sin(a) * 3; pickBody[i * 3 + 2] = 0;
    } else {
      pickBody[i * 3] = (rnd() - 0.5) * 1.6; pickBody[i * 3 + 1] = (rnd() - 0.5) * 1.6; pickBody[i * 3 + 2] = (rnd() - 0.5) * 1.6;
    }
  }

  const ships = [], bolts = [], picks = [];
  for (let s = 0; s < SHIPS; s++)
    ships.push({ x: 0, y: 0, z: 1e9, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
      hp: 3, alive: false, state: "in", stateT: 0, fireT: 1,
      lo: layer.lo + s * SHIP_PTS, side: s % 2 ? 1 : -1 });
  for (let b = 0; b < BOLTS; b++)
    bolts.push({ x: 0, y: 0, z: 1e9, vx: 0, vy: 0, vz: 0, life: 0, hostile: false,
      lo: layer.lo + SHIPS * SHIP_PTS + PICKS * PICK_PTS + b * BOLT_PTS, on: false });
  for (let p = 0; p < PICKS; p++)
    picks.push({ x: 0, y: 0, z: 1e9, vx: 0, vy: 0, vz: 0, kind: "boost", taken: true,
      spin: 0, lo: layer.lo + SHIPS * SHIP_PTS + p * PICK_PTS });

  const release = (lo, hi, cx, cy, mag) => {
    for (let p = lo; p < hi; p++) {
      const j = p * 3;
      homed[p] = 0;
      const dx = pos[j] - cx, dy = pos[j + 1] - cy;
      const d = Math.hypot(dx, dy) + 1;
      vel[j] += (dx / d) * mag * (0.5 + rnd());
      vel[j + 1] += (dy / d) * mag * (0.5 + rnd());
    }
  };

  const park = (lo, hi) => {
    for (let p = lo; p < hi; p++) {
      const j = p * 3;
      homed[p] = 1;
      size[p] = 0;
      home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
      snap[p] = 1;
    }
  };
  for (const s of ships) park(s.lo, s.lo + SHIP_PTS);
  for (const b of bolts) park(b.lo, b.lo + BOLT_PTS);
  for (const p of picks) park(p.lo, p.lo + PICK_PTS);

  const ent = {};

  ent.reset = () => {
    for (const s of ships) { s.alive = false; release(s.lo, s.lo + SHIP_PTS, cam.cx, cam.cy, 30); }
    for (const b of bolts) { b.on = false; park(b.lo, b.lo + BOLT_PTS); }
    for (const p of picks) { p.taken = true; park(p.lo, p.lo + PICK_PTS); }
  };

  ent.spawnShip = () => {
    const s = ships.find((s) => !s.alive);
    if (!s) return;
    s.alive = true;
    s.hp = 3;
    s.state = "in"; s.stateT = 0;
    s.x = cam.x + cam.fwd[0] * 1300 + (rnd() - 0.5) * 600;
    s.y = cam.y + cam.fwd[1] * 1300 + (rnd() - 0.5) * 400;
    s.z = cam.z + cam.fwd[2] * 1300;
    s.vx = cam.vx * 0.4; s.vy = cam.vy * 0.4; s.vz = cam.vz * 0.4;
    s.fireT = 1 + rnd();
    for (let p = s.lo; p < s.lo + SHIP_PTS; p++) { homed[p] = 1; size[p] = 1; snap[p] = 1; }
  };

  ent.countAlive = () => ships.reduce((n, s) => n + (s.alive ? 1 : 0), 0);

  const fireBolt = (x, y, z, vx, vy, vz, hostile) => {
    const b = bolts.find((b) => !b.on);
    if (!b) return;
    b.on = true; b.hostile = hostile;
    b.x = x; b.y = y; b.z = z;
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.life = 1.7;
    for (let p = b.lo; p < b.lo + BOLT_PTS; p++) { homed[p] = 1; size[p] = 1.7; snap[p] = 1; }
  };

  ent.playerFire = () => {
    fireBolt(
      cam.x + cam.fwd[0] * 16 + cam.right[0] * 2.6 * ent._wing - cam.up[0] * 1.4,
      cam.y + cam.fwd[1] * 16 + cam.right[1] * 2.6 * ent._wing - cam.up[1] * 1.4,
      cam.z + cam.fwd[2] * 16 + cam.right[2] * 2.6 * ent._wing - cam.up[2] * 1.4,
      cam.fwd[0] * (cam.speed + 1150) + cam.vx * 0.4 + (rnd() - 0.5) * 30,
      cam.fwd[1] * (cam.speed + 1150) + cam.vy * 0.4 + (rnd() - 0.5) * 30,
      cam.fwd[2] * (cam.speed + 1150) + cam.vz * 0.4 + (rnd() - 0.5) * 30,
      false
    );
    ent._wing = -ent._wing;
  };
  ent._wing = 1;

  const dropPickup = (x, y, z) => {
    const p = picks.find((p) => p.taken);
    if (!p) return;
    p.taken = false;
    p.x = x; p.y = y; p.z = z;
    p.vx = (rnd() - 0.5) * 60; p.vy = (rnd() - 0.5) * 60; p.vz = (rnd() - 0.5) * 60;
    const r = rnd();
    p.kind = r < 0.4 ? "boost" : r < 0.75 ? "health" : "shield";
    for (let q = p.lo; q < p.lo + PICK_PTS; q++) { homed[q] = 1; size[q] = 1.1; snap[q] = 1; }
  };

  const killShip = (s) => {
    s.alive = false;
    const vis = cam.project(s.x, s.y, s.z);
    release(s.lo, s.lo + SHIP_PTS, vis ? cam.out[0] : cam.cx, vis ? cam.out[1] : cam.cy, 110);
    ctx.fx.burst(s.x, s.y, s.z, PF.PAL.hot, 140, 160);
    ctx.fx.burst(s.x, s.y, s.z, RED, 60, 90);
    if (rnd() < 0.65) dropPickup(s.x, s.y, s.z);
    ctx.onKill(s);
  };

  const steer = (e, tx, ty, tz, spd, dt) => {
    const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z;
    const d = Math.hypot(dx, dy, dz) + 1e-4;
    const k = Math.min(1, dt * 2.1);
    e.vx += (dx / d * spd - e.vx) * k;
    e.vy += (dy / d * spd - e.vy) * k;
    e.vz += (dz / d * spd - e.vz) * k;
    e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
    const spd2 = Math.hypot(e.vx, e.vy, e.vz) + 1e-4;
    const ty2 = Math.atan2(-e.vx, -e.vz), tp2 = Math.asin(Math.max(-1, Math.min(1, e.vy / spd2)));
    e.yaw += (ty2 - e.yaw) * k;
    e.pitch += (tp2 - e.pitch) * k;
    return d;
  };

  ent.frame = (dt, snapMode, fighting) => {
    const o = cam.out;
    // --- ships ---
    for (const s of ships) {
      if (!s.alive) continue;
      s.stateT += dt;
      const dC = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
      const spd = 300 + cam.diff * 90;
      if (s.state === "in") {
        const tx = cam.x + cam.fwd[0] * 300 + cam.right[0] * 130 * s.side;
        const ty = cam.y + cam.fwd[1] * 300 + cam.up[1] * 100 * s.side;
        const tz = cam.z + cam.fwd[2] * 300;
        steer(s, tx, ty, tz, spd, dt);
        if (dC < 480 || s.stateT > 6) { s.state = "strafe"; s.stateT = 0; }
      } else if (s.state === "strafe") {
        const tx = cam.x + cam.right[0] * 260 * s.side - cam.fwd[0] * 70;
        const ty = cam.y + cam.up[1] * 120 - cam.fwd[1] * 70;
        const tz = cam.z - cam.fwd[2] * 70;
        steer(s, tx, ty, tz, spd * 1.15, dt);
        if (s.stateT > 1.5) { s.state = "break"; s.stateT = 0; s.side = -s.side; }
      } else {
        const fx2 = s.x - cam.x, fy2 = s.y - cam.y, fz2 = s.z - cam.z;
        const fd = Math.hypot(fx2, fy2, fz2) + 1e-4;
        steer(s, s.x + fx2 / fd * 500 + s.vx, s.y + fy2 / fd * 500, s.z + fz2 / fd * 500, spd, dt);
        if (s.stateT > 1.4) { s.state = "in"; s.stateT = 0; }
      }
      // ram damage + enemy fire
      if (dC < 40) { killShip(s); ctx.hit(2); continue; }
      const fx3 = (cam.x - s.x) / dC, fy3 = (cam.y - s.y) / dC, fz3 = (cam.z - s.z) / dC;
      const sCp = Math.cos(s.pitch);
      const sFwdX = -Math.sin(s.yaw) * sCp, sFwdY = Math.sin(s.pitch), sFwdZ = -Math.cos(s.yaw) * sCp;
      const aim = fx3 * sFwdX + fy3 * sFwdY + fz3 * sFwdZ;
      s.fireT -= dt;
      if (fighting && s.fireT <= 0 && aim > 0.978 && dC < 950) {
        s.fireT = 0.55 + rnd() * 0.5;
        fireBolt(s.x + sFwdX * 15, s.y + sFwdY * 15, s.z + sFwdZ * 15,
          fx3 * 880 + s.vx * 0.3, fy3 * 880 + s.vy * 0.3, fz3 * 880 + s.vz * 0.3, true);
      }
      // write body
      const cy2 = Math.cos(s.yaw), sy2 = Math.sin(s.yaw), cp2 = Math.cos(s.pitch), sp2 = Math.sin(s.pitch);
      for (let i = 0; i < SHIP_PTS; i++) {
        const p = s.lo + i, j = p * 3;
        const bx = body[i * 3], by = body[i * 3 + 1], bz = body[i * 3 + 2];
        const x1 = bx * cy2 + bz * sy2, z1 = -bx * sy2 + bz * cy2;
        const y2 = by * cp2 - z1 * sp2, z2 = by * sp2 + z1 * cp2;
        if (!cam.project(s.x + x1, s.y + y2, s.z + z2)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = o[2];
        if (snapMode) snap[p] = 1;
        const k2 = bodyKind[i];
        const c = k2 === 1 ? RED : k2 === 2 ? PF.PAL.accent : PF.PAL.mist;
        const b2 = k2 === 1 ? 1.9 : k2 === 2 ? 1.5 : 1.2;
        size[p] = k2 === 1 ? 2.1 : k2 === 2 ? 1.8 : 1.7;
        hcol[j] = c[0] * b2; hcol[j + 1] = c[1] * b2; hcol[j + 2] = c[2] * b2;
      }
    }

    // --- bolts ---
    for (const b of bolts) {
      if (!b.on) continue;
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const dx = b.x - cam.x, dy = b.y - cam.y, dz = b.z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (b.life <= 0 || d2 > 3600 * 3600) {
        b.on = false;
        park(b.lo, b.lo + BOLT_PTS);
        continue;
      }
      if (b.hostile && d2 < 13 * 13) {
        b.on = false;
        park(b.lo, b.lo + BOLT_PTS);
        ctx.hit(1);
        continue;
      }
      if (!b.hostile) {
        for (const s of ships) {
          if (!s.alive) continue;
          const hx = b.x - s.x, hy = b.y - s.y, hz = b.z - s.z;
          if (hx * hx + hy * hy + hz * hz < 22 * 22) {
            b.on = false;
            park(b.lo, b.lo + BOLT_PTS);
            s.hp--;
            ctx.fx.burst(b.x, b.y, b.z, PF.PAL.accent, 30, 80);
            if (s.hp <= 0) killShip(s);
            break;
          }
        }
        if (!b.on) continue;
      }
      const vlen = Math.hypot(b.vx, b.vy, b.vz) + 1e-4;
      const byaw = Math.atan2(-b.vx, -b.vz), bpit = Math.asin(Math.max(-1, Math.min(1, b.vy / vlen)));
      const cb = Math.cos(byaw), sb = Math.sin(byaw), cpb = Math.cos(bpit), spb = Math.sin(bpit);
      const c = b.hostile ? RED : PF.PAL.accent;
      for (let i = 0; i < BOLT_PTS; i++) {
        const p = b.lo + i, j = p * 3;
        const bz = boltBody[i * 3 + 2];
        const x1 = boltBody[i * 3] * cb + bz * sb, z1 = -boltBody[i * 3] * sb + bz * cb;
        const y2 = boltBody[i * 3 + 1] * cpb - z1 * spb, z2 = boltBody[i * 3 + 1] * spb + z1 * cpb;
        if (!cam.project(b.x + x1, b.y + y2, b.z + z2)) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = o[2];
        if (snapMode) snap[p] = 1;
        size[p] = i < 2 ? 1.9 : 1.4;
        const head = i < 2 ? 1.6 : 1.0;
        hcol[j] = c[0] * head; hcol[j + 1] = c[1] * head; hcol[j + 2] = c[2] * head;
      }
    }

    // --- pickups ---
    for (const pk of picks) {
      if (pk.taken) continue;
      pk.spin += dt * 2.4;
      const dx = cam.x - pk.x, dy = cam.y - pk.y, dz = cam.z - pk.z;
      const d = Math.hypot(dx, dy, dz) + 1e-4;
      const magR = field.mouse.down ? 620 : 300; // press-hold extends the pull
      if (d < magR) {
        const pull = 1500 * dt;
        pk.vx += (dx / d) * pull; pk.vy += (dy / d) * pull; pk.vz += (dz / d) * pull;
        const pv = Math.hypot(pk.vx, pk.vy, pk.vz);
        if (pv > 620) { const s = 620 / pv; pk.vx *= s; pk.vy *= s; pk.vz *= s; }
      } else {
        pk.vx *= Math.exp(-dt); pk.vy *= Math.exp(-dt); pk.vz *= Math.exp(-dt);
      }
      pk.x += pk.vx * dt; pk.y += pk.vy * dt; pk.z += pk.vz * dt;
      if (d < 16) {
        pk.taken = true;
        const vis = cam.project(pk.x, pk.y, pk.z);
        release(pk.lo, pk.lo + PICK_PTS, vis ? cam.out[0] : cam.cx, vis ? cam.out[1] : cam.cy, 40);
        ctx.onPickup(pk.kind, pk);
        continue;
      }
      if (pk.z > cam.z + 400) {
        pk.taken = true;
        release(pk.lo, pk.lo + PICK_PTS, cam.cx, cam.cy, 30);
        continue;
      }
      const c = pk.kind === "boost" ? GOLD : pk.kind === "health" ? PF.PAL.accent : PF.PAL.sky;
      const cs = Math.cos(pk.spin), sn = Math.sin(pk.spin);
      for (let i = 0; i < PICK_PTS; i++) {
        const p = pk.lo + i, j = p * 3;
        const bx = pickBody[i * 3] * cs - pickBody[i * 3 + 1] * sn;
        const by = pickBody[i * 3] * sn + pickBody[i * 3 + 1] * cs;
        if (!cam.project(pk.x + bx, pk.y + by, pk.z + pickBody[i * 3 + 2])) {
          home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1;
          continue;
        }
        homed[p] = 1;
        home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = o[2];
        if (snapMode) snap[p] = 1;
        size[p] = 1.7;
        hcol[j] = c[0]; hcol[j + 1] = c[1]; hcol[j + 2] = c[2];
      }
    }
  };

  ent.ships = ships;
  ent.bolts = bolts;
  ent.picks = picks;
  return ent;
}
