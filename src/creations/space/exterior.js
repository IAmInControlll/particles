// exterior.js - the player's own hull as a particle body for chase view.
// One baked silhouette per ship name in body space (facing -z, ~34wu),
// rotated by cam's yaw/pitch/roll basis around the ship anchor each frame
// and projected like any world body - cam.project supplies the chase eye.
// Lives on the cockpit layer's tail (range handed in by index.js); in
// cockpit view every point stays parked offscreen.
// kinds: 0 hull steel, 1 engine glow, 2 canopy/wingtip hint,
//        3 exhaust trail, 4 port strobe (red), 5 stbd strobe (green)
// kind-3 pts bake with bz = 0..1 trail param; frame() extends them
// behind the tail by speed so the wash reads as a live exhaust
export function createExterior(field, cam, PF, layer) {
  const rnd = PF.rnd;
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock;

  const bake = (cap, tail, fill) => {
    const pts = new Float32Array(cap * 3), kind = new Uint8Array(cap);
    let n = 0;
    const bp = (x, y, z, k) => {
      if (n >= cap) return;
      pts[n * 3] = x; pts[n * 3 + 1] = y; pts[n * 3 + 2] = z; kind[n++] = k;
    };
    fill(bp);
    return { pts, kind, n, tail };
  };
  // shared bake helpers: exhaust wash + wingtip strobes
  const wash = (bp, n, w, h) => {
    for (let t = 0; t < n; t++)
      bp((rnd() - 0.5) * w * (1 + rnd() * 0.8), (rnd() - 0.5) * h, rnd(), 3);
  };
  const strobes = (bp, lx, ly, lz, rx, ry, rz) => {
    bp(lx, ly, lz, 4); bp(rx, ry, rz, 5);
  };

  const BODIES = {
    // kestrel - balanced fighter: round fuselage, swept wings, twin tail fins
    kestrel: bake(475, 17.6, (bp) => {
      for (let t = 0; t < 150; t++) {
        const z = -17 + (t / 150) * 34;
        const r = 0.3 + Math.sin(((z + 17) / 34) * Math.PI) * 1.7;
        const a = rnd() * 6.283;
        bp(Math.cos(a) * r, Math.sin(a) * r * 0.72, z, 0);
      }
      for (let t = 0; t < 20; t++)
        bp((rnd() - 0.5) * 1.7, 1.6 + rnd() * 0.7, -9 + rnd() * 5, 2); // canopy
      for (let s = -1; s <= 1; s += 2)
        for (let t = 0; t < 70; t++) {
          const u = rnd();
          bp(s * (1.9 + u * 11), (rnd() - 0.5) * 0.45,
            2 + u * 9.5 + (rnd() - 0.5) * 2.2, 0); // swept wing
        }
      for (let s = -1; s <= 1; s += 2)
        for (let t = 0; t < 5; t++) bp(s * 12.6, 0, 11.2, 2); // wingtips
      for (let s = -1; s <= 1; s += 2)
        for (let t = 0; t < 22; t++)
          bp(s * 3.1 + (rnd() - 0.5) * 0.7, 1 + t * 0.19, 11 + t * 0.1 + rnd() * 1.2, 0); // tail fin
      for (let t = 0; t < 26; t++)
        bp((rnd() < 0.5 ? 2.2 : -2.2) + (rnd() - 0.5) * 2.6, (rnd() - 0.5) * 2, 15.4 + rnd() * 1.6, 0);
      for (let t = 0; t < 22; t++)
        bp((rnd() - 0.5) * 4.6, (rnd() - 0.5) * 2, 17.3 + rnd() * 0.7, 1); // engine glow
      strobes(bp, -12.6, 0.3, 11.2, 12.6, 0.3, 11.2);
      wash(bp, 55, 4.4, 2.0);
    }),

    // dart - narrow interceptor: long pointed hull, small delta wings, stub tail
    dart: bake(440, 15.8, (bp) => {
      for (let t = 0; t < 200; t++) {
        const z = -23 + (t / 200) * 38;
        const r = 0.15 + Math.sin(((z + 23) / 38) * Math.PI) * 1.05;
        const a = rnd() * 6.283;
        bp(Math.cos(a) * r, Math.sin(a) * r * 0.8, z, 0);
      }
      for (let t = 0; t < 14; t++)
        bp((rnd() - 0.5) * 1.1, 1.05 + rnd() * 0.5, -10 + rnd() * 4.5, 2); // canopy
      for (let s = -1; s <= 1; s += 2)
        for (let t = 0; t < 45; t++) {
          const u = rnd();
          bp(s * (1.2 + u * 6.5), (rnd() - 0.5) * 0.4,
            3.5 + u * 7 + (rnd() - 0.5) * 1.6, 0); // delta wing
        }
      for (let s = -1; s <= 1; s += 2)
        for (let t = 0; t < 6; t++) bp(s * 7.6, 0, 9.8, 2); // wingtips
      for (let s = -1; s <= 1; s += 2)
        for (let t = 0; t < 14; t++)
          bp(s * 1.8 + (rnd() - 0.5) * 0.6, 0.8 + t * 0.14, 12 + rnd() * 1.4, 0); // stub fin
      for (let t = 0; t < 18; t++)
        bp((rnd() - 0.5) * 2.4, (rnd() - 0.5) * 1.6, 14 + rnd(), 0);
      for (let t = 0; t < 16; t++)
        bp((rnd() - 0.5) * 2.8, (rnd() - 0.5) * 1.6, 15.4 + rnd() * 0.6, 1); // engine glow
      strobes(bp, -7.7, 0, 9.8, 7.7, 0, 9.8);
      wash(bp, 50, 2.6, 1.6);
    }),

    // mule - boxy hauler: wide cargo hull, stub wings, oversized engine block
    mule: bake(440, 19.0, (bp) => {
      for (let t = 0; t < 215; t++) {
        const x = (rnd() - 0.5) * 6.6, y = (rnd() - 0.5) * 4.8, z = -15 + rnd() * 30;
        if (rnd() < 0.5) bp(x, y > 0 ? 2.4 : -2.4, z, 0);
        else bp(x > 0 ? 3.3 : -3.3, y, z, 0); // slab sides
      }
      for (let t = 0; t < 18; t++)
        bp((rnd() - 0.5) * 3.2, 2.4 + rnd() * 0.9, -14.5 + rnd() * 3.5, 2); // cab
      for (let s = -1; s <= 1; s += 2)
        for (let t = 0; t < 34; t++) {
          const u = rnd();
          bp(s * (3.3 + u * 5.5), -0.6 + (rnd() - 0.5) * 0.8, 2 + u * 4.5, 0); // stub wing
        }
      for (let t = 0; t < 55; t++) {
        const x = (rnd() - 0.5) * 9, y = (rnd() - 0.5) * 4.4, z = 15 + rnd() * 3.2;
        bp(rnd() < 0.5 ? x : x > 0 ? 4.5 : -4.5, y, z, 0); // engine block, wider than hull
      }
      for (let t = 0; t < 24; t++)
        bp((rnd() - 0.5) * 7.5, (rnd() - 0.5) * 3.4, 18.4 + rnd() * 0.8, 1); // engine glow
      strobes(bp, -8.9, -0.6, 6.5, 8.9, -0.6, 6.5);
      wash(bp, 58, 7.4, 3.2);
    }),
  };

  let body = BODIES.kestrel;
  let extT = 0, lx = 0, ly = 0, lz = 0, parked = false;

  const ext = { lo: layer.lo, hi: layer.hi };
  const park = () => {
    for (let p = layer.lo; p < layer.hi; p++) {
      const j = p * 3;
      homed[p] = 1; size[p] = 0;
      home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
      snap[p] = 1;
    }
    parked = true;
  };
  ext.setShip = (name) => {
    body = BODIES[name] || BODIES.kestrel;
    for (let p = layer.lo; p < layer.hi; p++) noFlock[p] = 1;
    park();
  };

  ext.frame = (dt, chase, snapMode) => {
    if (!chase) { if (!parked) park(); return; }
    parked = false;
    extT += dt;
    // the hull trails its own motion a touch, plus a slow hover bob
    const k = Math.min(1, dt * 4);
    lx += (-cam.vx * 0.028 - lx) * k;
    ly += (-cam.vy * 0.028 - ly) * k;
    lz += (-cam.vz * 0.028 - lz) * k;
    const bob = Math.sin(extT * 1.6) * 0.4;
    const ax = cam.x + lx + cam.up[0] * bob;
    const ay = cam.y + ly + cam.up[1] * bob;
    const az = cam.z + lz + cam.up[2] * bob;
    const R = cam.right, U = cam.up, F = cam.fwd, o = cam.out;
    const eg = cam.boosting ? 2.1 : 1.35; // engines flare on boost
    // exhaust wash stretches with speed and flares hard on boost
    const trail = (8 + cam.speedK * 18) * (cam.boosting ? 1.8 : 1);
    const mist = PF.PAL.mist, sky = PF.PAL.sky, hot = PF.PAL.hot, acc = PF.PAL.accent;
    // small fields (mobile N) shrink the layer tail - sample the body
    // evenly instead of truncating the nose off the silhouette
    const avail = layer.hi - layer.lo;
    const n = Math.min(body.n, avail);
    for (let k = 0; k < n; k++) {
      const i = (k * body.n / n) | 0;
      const p = layer.lo + k, j = p * 3;
      const kd = body.kind[i];
      let bx = body.pts[i * 3], by = body.pts[i * 3 + 1], bz = body.pts[i * 3 + 2];
      let blinkOn = 1;
      if (kd === 3) {
        // exhaust: bz is a 0..1 trail param - stretch back off the tail,
        // widen and wobble as it cools downstream
        const t = bz;
        bz = body.tail + t * trail;
        bx *= 1 + t * 0.9; by *= 1 + t * 0.6;
        bx += Math.sin(extT * 26 + i * 1.7) * 0.5 * t;
        by += Math.cos(extT * 21 + i * 2.3) * 0.4 * t;
      } else if (kd === 4 || kd === 5) {
        blinkOn = Math.sin(extT * 4.4 + (kd === 4 ? 0 : 2.6)) > 0.5 ? 1 : 0;
      }
      // body faces -z: world = right*bx + up*by - fwd*bz around the anchor
      const wx = ax + R[0] * bx + U[0] * by - F[0] * bz;
      const wy = ay + R[1] * bx + U[1] * by - F[1] * bz;
      const wz = az + R[2] * bx + U[2] * by - F[2] * bz;
      if (!cam.project(wx, wy, wz)) {
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1;
        continue;
      }
      homed[p] = 1;
      home[j] = o[0]; home[j + 1] = o[1];
      home[j + 2] = Math.max(o[2], -2); // own ship stays chunky like entities
      if (snapMode) snap[p] = 1;
      if (kd === 1) {
        size[p] = 2.2;
        hcol[j] = (hot[0] * 0.5 + acc[0] * 0.5) * eg;
        hcol[j + 1] = (hot[1] * 0.5 + acc[1] * 0.5) * eg;
        hcol[j + 2] = (hot[2] * 0.5 + acc[2] * 0.5) * eg;
      } else if (kd === 2) {
        size[p] = 1.9;
        hcol[j] = sky[0] * 1.4; hcol[j + 1] = sky[1] * 1.4; hcol[j + 2] = sky[2] * 1.4;
      } else if (kd === 3) {
        const t = body.pts[i * 3 + 2], fade = (1 - t * 0.78) * eg;
        size[p] = 2.0 - t * 0.9;
        hcol[j] = (hot[0] * 0.7 + acc[0] * 0.3) * fade;
        hcol[j + 1] = (hot[1] * 0.7 + acc[1] * 0.3) * fade;
        hcol[j + 2] = (hot[2] * 0.7 + acc[2] * 0.3) * fade;
      } else if (kd === 4 || kd === 5) {
        // wingtip strobes: port red, starboard green, hard blink
        size[p] = blinkOn ? 2.9 : 0;
        const cr = kd === 4 ? 1.9 : 0.4, cg = kd === 4 ? 0.5 : 1.7, cb = kd === 4 ? 0.4 : 0.8;
        hcol[j] = cr; hcol[j + 1] = cg; hcol[j + 2] = cb;
      } else {
        size[p] = 1.9;
        hcol[j] = mist[0] * 1.15; hcol[j + 1] = mist[1] * 1.15; hcol[j + 2] = mist[2] * 1.15;
      }
    }
  };

  return ext;
}
