// corridor.js - the particle tunnel. Octagon lattice (vertex rails + cross
// rings) bent along the camera lane, world-anchored interior dust for
// parallax, and a pool of drifting structures (hoops, columns, shard
// clouds) that respawn ahead after they pass. All dim, all deep-z.
export function createCorridor(field, cam, PF, layer, lv) {
  const rnd = PF.rnd;
  const N = layer.hi - layer.lo;
  const { home, hcol, homed, snap, size } = field;

  const CORR = 1600;        // respawn window length in wu
  const R = 320;            // tunnel cross-section radius
  const SIDES = 8;
  const VX = new Float32Array(SIDES + 1), VY = new Float32Array(SIDES + 1);
  for (let k = 0; k <= SIDES; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8;
    VX[k] = Math.cos(a) * R;
    VY[k] = Math.sin(a) * R;
  }
  const octPt = (u, out) => { // u in [0,1) around the octagon outline
    const s = (u * SIDES) | 0, t = u * SIDES - s;
    out[0] = VX[s] + (VX[s + 1] - VX[s]) * t;
    out[1] = VY[s] + (VY[s + 1] - VY[s]) * t;
  };

  // budget: ~66% lattice (rails dominate - radial streaks sell the tunnel),
  // ~16% structures, ~18% interior dust
  const LAT = (N * 0.66) | 0, STR = (N * 0.16) | 0, DUST = N - LAT - STR;
  const RAIL_N = (LAT * 0.7) | 0, RING_N = LAT - RAIL_N;
  const NOBJ = 6, ON = (STR / NOBJ) | 0;

  const lx = new Float32Array(N), ly = new Float32Array(N), lz = new Float32Array(N);
  const kind = new Uint8Array(N);       // 0 lattice 1 dust 2 structure
  const lum = new Float32Array(N);
  const objOf = new Int16Array(N);      // structure object index, -1 none
  objOf.fill(-1);
  const ringOf = new Uint8Array(N);     // ring index per lattice pt, 255 = rail
  ringOf.fill(255);
  const ringJit = new Float32Array(24); // shared per-ring wrap jitter
  const ringStamp = new Int32Array(24); // re-rolled once per wrap frame
  let frameNo = 0;

  const objects = [];
  for (let o = 0; o < NOBJ; o++) {
    objects.push({
      kind: o % 3, // 0 hoop 1 column 2 shards
      wz: 0, ox: 0, oy: 0, tilt: 0, spin: 0,
      lo: layer.lo + LAT + DUST + o * ON,
      n: ON,
    });
  }

  const tmp = [0, 0];
  const park = (p) => {
    const j = p * 3;
    home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
    snap[p] = 1;
  };

  // -- lattice: rails along octagon edges + rings across the outline.
  // Rails are dense enough to read as converging streaks; rings are sparser
  // cross-beats that keep the tube cylindrical.
  {
    let i = 0;
    const railCount = SIDES;
    const perRail = (RAIL_N / railCount) | 0;
    for (let r = 0; r < railCount; r++) {
      const rx = VX[r], ry = VY[r];
      for (let q = 0; q < perRail && i < RAIL_N; q++, i++) {
        lx[i] = rx + (rnd() - 0.5) * 4; ly[i] = ry + (rnd() - 0.5) * 4;
        lz[i] = cam.z - (q / perRail) * CORR - rnd() * 24;
        kind[i] = 0; lum[i] = 0.42 + rnd() * 0.16;
      }
    }
    const rings = Math.max(4, (CORR / 210) | 0);
    const perRing = (RING_N / rings) | 0;
    for (let r = 0; r < rings; r++) {
      const wz = cam.z - (r / rings) * CORR - rnd() * 60;
      for (let q = 0; q < perRing && i < LAT; q++, i++) {
        octPt(q / perRing + rnd() * 0.01, tmp);
        lx[i] = tmp[0]; ly[i] = tmp[1];
        lz[i] = wz;
        kind[i] = 0; lum[i] = 0.3 + rnd() * 0.12;
        ringOf[i] = r;
      }
    }
    for (; i < LAT; i++) { // lattice slack becomes extra dust
      kind[i] = 1;
      respawnDust(i);
    }
  }

  function respawnDust(i) {
    const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * R * 0.82;
    lx[i] = Math.cos(a) * rr; ly[i] = Math.sin(a) * rr * 0.9;
    lz[i] = cam.z - rnd() * CORR;
    lum[i] = 0.18 + rnd() * 0.3;
  }
  for (let i = LAT; i < LAT + DUST; i++) {
    kind[i] = 1;
    respawnDust(i);
  }

  // -- structures
  const bakeObject = (o) => {
    const ob = objects[o];
    ob.kind = (rnd() * 3) | 0; // each pass re-rolls hoop/column/shards
    ob.wz = cam.z - CORR * (0.25 + rnd() * 0.75);
    const side = rnd() < 0.5 ? -1 : 1;
    if (ob.kind === 0) {          // hoop: tilted ring off to one side
      ob.ox = side * (260 + rnd() * 140);
      ob.oy = (rnd() - 0.5) * 240;
      ob.tilt = rnd() * 6.283;
      const r = 120 + rnd() * 110;
      for (let q = 0; q < ob.n; q++) {
        const i = LAT + DUST + o * ON + q;
        const t = (q / ob.n) * 6.283;
        lx[i] = Math.cos(t) * r + (rnd() - 0.5) * 7;
        ly[i] = Math.sin(t) * r * 0.9 + (rnd() - 0.5) * 7;
        lz[i] = (rnd() - 0.5) * 14;
        lum[i] = 0.3 + rnd() * 0.25;
      }
    } else if (ob.kind === 1) {   // column: vertical bar beside the lane
      ob.ox = side * (280 + rnd() * 130);
      ob.oy = (rnd() - 0.5) * 80;
      const h = 170 + rnd() * 160;
      for (let q = 0; q < ob.n; q++) {
        const i = LAT + DUST + o * ON + q;
        lx[i] = (rnd() - 0.5) * 16;
        ly[i] = (q / ob.n - 0.5) * h;
        lz[i] = (rnd() - 0.5) * 16;
        lum[i] = 0.28 + rnd() * 0.2;
      }
    } else {                      // shards: loose blob drifting by
      ob.ox = side * (240 + rnd() * 160);
      ob.oy = (rnd() - 0.5) * 260;
      for (let q = 0; q < ob.n; q++) {
        const i = LAT + DUST + o * ON + q;
        lx[i] = (rnd() + rnd() - 1) * 110;
        ly[i] = (rnd() + rnd() - 1) * 110;
        lz[i] = (rnd() + rnd() - 1) * 110;
        lum[i] = 0.3 + rnd() * 0.3;
      }
    }
    ob.spin = (rnd() - 0.5) * 0.3;
  };
  for (let o = 0; o < NOBJ; o++) {
    bakeObject(o);
    objects[o].wz = cam.z - (o / NOBJ) * CORR; // stagger first pass
  }

  const ZC0 = -1.6, ZC1 = 0.7; // corridor depth clamp: dim and deep
  const cor = {};
  cor.frame = (dt) => {
    frameNo++;
    const o = cam.out;
    for (let i = 0; i < N; i++) {
      const p = layer.lo + i, j = p * 3;
      let wx, wy, wz;
      if (kind[i] === 2) {
        const ob = objects[objOf[i]];
        if (ob.wz > cam.z + 80) bakeObject(objOf[i]);
        const cxo = cam.laneX(ob.wz) + ob.ox, cyo = cam.laneY(ob.wz) + ob.oy;
        if (ob.spin) {
          const a = ob.tilt + cam.t * ob.spin, ca = Math.cos(a), sa = Math.sin(a);
          wx = cxo + lx[i] * ca - ly[i] * sa;
          wy = cyo + lx[i] * sa + ly[i] * ca;
        } else {
          wx = cxo + lx[i]; wy = cyo + ly[i];
        }
        wz = ob.wz + lz[i];
      } else {
        if (lz[i] > cam.z + 60) {
          if (kind[i] === 1) { respawnDust(i); }
          else {
            const ri = ringOf[i];
            if (ri === 255) lz[i] -= CORR + (rnd() - 0.5) * 24;
            else {
              if (ringStamp[ri] !== frameNo) {
                ringStamp[ri] = frameNo;
                ringJit[ri] = (rnd() - 0.5) * 46;
              }
              lz[i] -= CORR + ringJit[ri]; // whole ring keeps one cadence
            }
          }
        }
        wx = cam.laneX(lz[i]) + lx[i];
        wy = cam.laneY(lz[i]) + ly[i];
        wz = lz[i];
      }
      if (!cam.project(wx, wy, wz)) { park(p); continue; }
      home[j] = o[0]; home[j + 1] = o[1];
      home[j + 2] = o[2] < ZC0 ? ZC0 : o[2] > ZC1 ? ZC1 : o[2];
      homed[p] = 1;
      if (size[p] === 0) snap[p] = 1; // re-materializing: don't streak in
      const dk = 1 - Math.min(1, (cam.z - wz) / CORR) * 0.55; // near brighter
      size[p] = (0.7 + lum[i]) * (0.7 + dk * 0.5);
      const c = kind[i] === 2 ? PF.PAL.sky : PF.PAL.mist;
      const l = lum[i] * dk;
      hcol[j] = c[0] * l * lv.t[0];
      hcol[j + 1] = c[1] * l * lv.t[1];
      hcol[j + 2] = c[2] * l * lv.t[2];
    }
  };
  return cor;
}
