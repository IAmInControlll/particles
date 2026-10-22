// obstacles.js - panes, crystals, power-up pickups, and the spawn director.
// Entities are baked point shapes rigidly transformed through cam.project
// into home[] each frame (snap - spring lag reads as fuzz). A kill releases
// the entity's own slice to drift: radial impulse + toward-viewer z kick,
// then gravity drags the shards down while size and color fade to parked.
export function createObstacles(field, cam, PF, layers, hooks, lv) {
  const rnd = PF.rnd;
  const { home, hcol, homed, snap, size, pos, vel, noFlock, noWell } = field;
  const SPAWN = 1350;      // pipeline fill depth ahead of the camera
  const G = 330;           // debris gravity, wu/s^2

  // ---------- shared entity machinery ----------
  const ents = []; // every pane/crystal/pickup for the death pass
  const dead = []; // entities mid-shatter

  const release = (e, hx, hy) => {
    // radial impulse in screen space from the hit point + vel.z viewer kick
    dead.push(e);
    e.deadT = 1.5;
    for (let p = e.lo; p < e.lo + e.n; p++) {
      const j = p * 3;
      homed[p] = 0;
      const dx = pos[j] - hx, dy = pos[j + 1] - hy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const m = (1.6 + rnd() * 3.8) * (e.kick ?? 1);
      vel[j] += (dx / d) * m + (rnd() - 0.5) * 1.4;
      vel[j + 1] += (dy / d) * m + (rnd() - 0.5) * 1.4;
      vel[j + 2] += 0.03 + rnd() * 0.06;
      hcol[j] *= 1.7; hcol[j + 1] *= 1.7; hcol[j + 2] *= 1.7;
    }
  };

  const deadPass = (dt) => {
    for (let k = dead.length - 1; k >= 0; k--) {
      const e = dead[k];
      e.deadT -= dt;
      const fade = Math.max(0, 1 - dt * 1.4), g = G * 0.004 * dt * 180;
      const done = e.deadT <= 0;
      for (let p = e.lo; p < e.lo + e.n; p++) {
        const j = p * 3;
        if (done) {
          homed[p] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[p] = 1; size[p] = 0;
        } else {
          vel[j + 1] += g;
          hcol[j] *= fade; hcol[j + 1] *= fade; hcol[j + 2] *= fade;
          size[p] = Math.max(0, size[p] - dt * 1.1);
        }
      }
      if (done) { e.deadT = 0; e.on = false; dead.splice(k, 1); }
    }
  };

  const projectEnt = (e, wx, wy, wz, zc0, zc1) => {
    for (let q = 0; q < e.n; q++) {
      const p = e.lo + q, j = p * 3;
      const px = wx + e.tx[q * 3], py = wy + e.tx[q * 3 + 1], pz = wz + e.tx[q * 3 + 2];
      if (!cam.project(px, py, pz)) {
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0; snap[p] = 1;
        continue;
      }
      const o = cam.out;
      home[j] = o[0]; home[j + 1] = o[1];
      home[j + 2] = o[2] < zc0 ? zc0 : o[2] > zc1 ? zc1 : o[2];
      homed[p] = 1; snap[p] = 1;
    }
  };

  // ---------- panes ----------
  const MAXPANES = 5;
  const PCAP = ((layers.panes.hi - layers.panes.lo) / MAXPANES) | 0;
  const panes = [];
  for (let i = 0; i < MAXPANES; i++) {
    panes.push({
      on: false, kind: "single", x: 0, y: 0, z: 0, roll: 0, tilt: 0,
      descend: 0, rects: [], n: 0,
      lo: layers.panes.lo + i * PCAP,
      tx: new Float32Array(PCAP * 3), lum: new Float32Array(PCAP),
      kick: 1, deadT: 0,
    });
  }

  // rects are solid regions in pane-local coords. weak:true = breakable glass;
  // weak:false = dim steel, balls bounce off
  const rectPts = (e, i, r, weak) => {
    // perimeter sample ~13wu + stipple ~34wu; trim to slice budget
    let used = i;
    const put = (x, y, l) => {
      if (used >= PCAP) return;
      e.tx[used * 3] = x; e.tx[used * 3 + 1] = y; e.tx[used * 3 + 2] = 0;
      e.lum[used] = l; used++;
    };
    const per = 2 * (r.w + r.h), es = Math.max(8, (per / 13) | 0);
    for (let q = 0; q < es; q++) {
      const t = q / es, side = (t * 4) | 0, u = t * 4 - side;
      let x, y;
      if (side === 0) { x = r.x + u * r.w; y = r.y; }
      else if (side === 1) { x = r.x + r.w; y = r.y + u * r.h; }
      else if (side === 2) { x = r.x + (1 - u) * r.w; y = r.y + r.h; }
      else { x = r.x; y = r.y + (1 - u) * r.h; }
      put(x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, weak ? 0.8 + rnd() * 0.3 : 0.4);
    }
    const area = r.w * r.h, fs = Math.max(6, (area / 1100) | 0);
    for (let q = 0; q < fs; q++) {
      put(r.x + rnd() * r.w, r.y + rnd() * r.h, weak ? 0.2 + rnd() * 0.18 : 0.14);
    }
    return used;
  };

  const bakePane = (p, kind, dist) => {
    p.kind = kind; p.rects = []; p.roll = 0; p.tilt = 0; p.descend = 0;
    const lx = cam.laneX(p.z), ly = cam.laneY(p.z);
    let used = 0;
    if (kind === "wall") {
      // corridor-wide wall, one glass panel over the lane, rest dim steel
      const pw = 190 + rnd() * 60, ph = 300 + rnd() * 80;
      const weak = { x: -pw / 2, y: -ph / 2, w: pw, h: ph, weak: true };
      const W = 720, H = 520;
      p.rects.push({ x: -W / 2, y: -H / 2, w: (W - pw) / 2, h: H, weak: false });
      p.rects.push(weak);
      p.rects.push({ x: pw / 2, y: -H / 2, w: (W - pw) / 2, h: H, weak: false });
      p.x = lx; p.y = ly;
      for (const r of p.rects) used = rectPts(p, used, r, r.weak);
    } else if (kind === "gap") {
      // a slab with a bite taken out; the bite is offset off the lane so
      // the pane usually must be broken - occasionally it lines up = free pass
      const w = 360 + rnd() * 140, h = 260 + rnd() * 90, g = 120 + rnd() * 60;
      const gx = (rnd() - 0.5) * (w - g); // gap center in local coords
      p.rects.push({ x: -w / 2, y: -h / 2, w: gx - g / 2 + w / 2, h, weak: true });
      p.rects.push({ x: gx + g / 2, y: -h / 2, w: w / 2 - gx - g / 2, h, weak: true });
      const off = rnd() < 0.22 ? -gx : (rnd() - 0.5) * 240;
      p.x = lx - off; p.y = ly + (rnd() - 0.5) * 90;
      for (const r of p.rects) used = rectPts(p, used, r, true);
    } else {
      const w = 320 + rnd() * 190, h = 250 + rnd() * 140;
      p.rects.push({ x: -w / 2, y: -h / 2, w, h, weak: true });
      p.x = lx + (rnd() - 0.5) * 220;
      p.y = ly + (rnd() - 0.5) * 130;
      if (kind === "angled") {
        p.tilt = (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.35);
        p.roll = (rnd() - 0.5) * 0.5;
      } else if (kind === "descend") {
        p.y += h * (0.7 + rnd() * 0.4); // starts high, slides down past the lane
        p.descend = 60 + rnd() * 70;
      } else if (kind === "single") {
        p.roll = (rnd() - 0.5) * 0.14;
      }
      used = rectPts(p, used, p.rects[0], true);
    }
    p.n = used;
    for (let q = used; q < PCAP; q++) { // clear tail
      const pidx = p.lo + q;
      homed[pidx] = 1; home[pidx * 3] = -5e3; home[pidx * 3 + 1] = -5e3;
      home[pidx * 3 + 2] = 0; snap[pidx] = 1; size[pidx] = 0;
    }
    // bake local -> world (roll in xy, tilt in yz)
    const cr = Math.cos(p.roll), sr = Math.sin(p.roll);
    const ct = Math.cos(p.tilt), st = Math.sin(p.tilt);
    for (let q = 0; q < used; q++) {
      const x0 = p.tx[q * 3], y0 = p.tx[q * 3 + 1];
      const x1 = x0 * cr - y0 * sr, y1 = x0 * sr + y0 * cr;
      p.tx[q * 3] = x1;
      p.tx[q * 3 + 1] = y1 * ct;
      p.tx[q * 3 + 2] = y0 * st;
    }
    p.on = true;
  };

  // world->pane local (unroll then untilt); out = [lx,ly,lz]
  const paneLocal = (p, wx, wy, wz, out) => {
    const dx = wx - p.x, dy = wy - p.y, dz = wz - p.z;
    const cr = Math.cos(-p.roll), sr = Math.sin(-p.roll);
    const x1 = dx * cr - dy * sr, y1 = dx * sr + dy * cr;
    const ct = Math.cos(-p.tilt), st = Math.sin(-p.tilt);
    out[0] = x1; out[1] = y1 * ct - dz * st; out[2] = y1 * st + dz * ct;
  };

  // ---------- crystals ----------
  const MAXCRY = 4;
  const CCAP = ((layers.crystals.hi - layers.crystals.lo) / MAXCRY) | 0;
  const TIERS = [{ r: 44, pay: 3 }, { r: 68, pay: 5 }, { r: 105, pay: 10 }];
  const crystals = [];
  for (let i = 0; i < MAXCRY; i++) {
    crystals.push({
      on: false, x: 0, y: 0, z: 0, r: 50, pay: 3, tier: 0,
      rotA: rnd() * 6.28, rotB: rnd() * 6.28, rotW: 0.4 + rnd() * 0.5,
      n: 0, lo: layers.crystals.lo + i * CCAP,
      tx: new Float32Array(CCAP * 3), local: new Float32Array(CCAP * 3),
      deadT: 0,
    });
  }

  const bakeCrystal = (c, z) => {
    const roll = rnd();
    c.tier = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
    const t = TIERS[c.tier];
    c.r = t.r; c.pay = t.pay;
    c.x = cam.laneX(z) + (rnd() - 0.5) * 320;
    c.y = cam.laneY(z) + (rnd() - 0.5) * 220;
    c.z = z;
    // octahedron: 6 verts, 12 edges sampled + sparse face interior
    const r = c.r;
    const V = [[r,0,0],[-r,0,0],[0,r,0],[0,-r,0],[0,0,r],[0,0,-r]];
    const E = [];
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
      if ((a ^ b) !== 1) E.push([a, b]); // skip opposite pairs
    }
    let n = 0;
    const put = (x, y, z2) => {
      if (n >= CCAP) return;
      c.local[n * 3] = x; c.local[n * 3 + 1] = y; c.local[n * 3 + 2] = z2; n++;
    };
    const per = Math.max(4, ((CCAP * 0.72) / E.length) | 0);
    for (const [a, b] of E) {
      for (let q = 0; q < per; q++) {
        const u = q / (per - 1);
        put(V[a][0] + (V[b][0] - V[a][0]) * u + (rnd() - 0.5) * 4,
            V[a][1] + (V[b][1] - V[a][1]) * u + (rnd() - 0.5) * 4,
            V[a][2] + (V[b][2] - V[a][2]) * u + (rnd() - 0.5) * 4);
      }
    }
    for (let f = 0; f < 8 && n < CCAP; f++) { // face interiors: tri of 3 axis verts
      const va = V[f & 1 ? 0 : 1], vb = V[f & 2 ? 2 : 3], vc = V[f & 4 ? 4 : 5];
      for (let q = 0; q < 4 && n < CCAP; q++) {
        let u = rnd(), v = rnd();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        put(va[0] + (vb[0] - va[0]) * u + (vc[0] - va[0]) * v,
            va[1] + (vb[1] - va[1]) * u + (vc[1] - va[1]) * v,
            va[2] + (vb[2] - va[2]) * u + (vc[2] - va[2]) * v);
      }
    }
    c.n = n;
    c.rotA = rnd() * 6.28; c.rotB = rnd() * 6.28;
    c.rotW = (0.35 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1);
    for (let p = c.lo; p < c.lo + CCAP; p++) { // clear tail
      homed[p] = 1; home[p * 3] = -5e3; home[p * 3 + 1] = -5e3; home[p * 3 + 2] = 0;
      snap[p] = 1; size[p] = 0;
      noFlock[p] = 1; noWell[p] = 1;
    }
    c.on = true;
  };

  // ---------- pickups ----------
  const MAXPICK = 3;
  const XCAP = ((layers.pickups.hi - layers.pickups.lo) / MAXPICK) | 0;
  const PKIND = {
    slow:   { col: PF.PAL.sky,    dur: 6,  letter: "S" },
    frenzy: { col: [1, 0.62, 0.3], dur: 8,  letter: "F" },
    heavy:  { col: PF.PAL.accent, dur: 10, letter: "H" },
  };
  const glyphs = {};
  for (const k in PKIND) {
    const t = PF.textPoints(PKIND[k].letter, { h: 90, maxPoints: 200 });
    glyphs[k] = t.pts.map(([x, y]) => [x / 90 * 46, y / 90 * 46]);
  }
  const pickups = [];
  for (let i = 0; i < MAXPICK; i++) {
    pickups.push({
      on: false, kind: "slow", x: 0, y: 0, z: 0, bob: rnd() * 6.28,
      n: 0, lo: layers.pickups.lo + i * XCAP,
      tx: new Float32Array(XCAP * 3), lum: new Float32Array(XCAP),
      deadT: 0,
    });
  }

  const bakePickup = (pk, kind, z) => {
    pk.kind = kind;
    pk.x = cam.laneX(z) + (rnd() - 0.5) * 260;
    pk.y = cam.laneY(z) + (rnd() - 0.5) * 160;
    pk.z = z;
    let n = 0;
    const R = 56, rn = Math.min(56, (XCAP * 0.55) | 0);
    for (let q = 0; q < rn; q++) {
      const a = (q / rn) * 6.283;
      pk.tx[n * 3] = Math.cos(a) * R; pk.tx[n * 3 + 1] = Math.sin(a) * R;
      pk.tx[n * 3 + 2] = 0; pk.lum[n] = 0.75; n++;
    }
    for (const [gx, gy] of glyphs[kind]) {
      if (n >= XCAP) break;
      pk.tx[n * 3] = gx; pk.tx[n * 3 + 1] = gy; pk.tx[n * 3 + 2] = 0;
      pk.lum[n] = 1; n++;
    }
    pk.n = n;
    for (let p = pk.lo; p < pk.lo + XCAP; p++) {
      homed[p] = 1; home[p * 3] = -5e3; home[p * 3 + 1] = -5e3; home[p * 3 + 2] = 0;
      snap[p] = 1; size[p] = 0;
      noFlock[p] = 1; noWell[p] = 1;
    }
    pk.on = true;
  };

  // ---------- spawn director ----------
  let lastZ = -SPAWN * 0.5, nextPowT = 9;
  const KINDS = ["single", "angled", "gap", "descend", "wall"];
  const UNLOCK = [0, 700, 1500, 2600, 4200];
  const W = [0.3, 0.25, 0.2, 0.15, 0.1];
  const pickKind = (dist) => {
    let hi = 0, sum = 0;
    for (let i = 0; i < KINDS.length; i++) if (dist > UNLOCK[i]) { hi = i; sum += W[i]; }
    let r = rnd() * sum;
    for (let i = 0; i <= hi; i++) { r -= W[i]; if (r <= 0) return KINDS[i]; }
    return "single";
  };

  const spawnAhead = (dist, T, ammo = 25) => {
    // pity rule: low ammo guarantees a crystal in the pipeline right now -
    // a run must never starve waiting on spawn luck
    if (ammo < 10 && !crystals.some((c) => c.on && !c.deadT)) {
      const c = crystals.find((c) => !c.on && !c.deadT);
      if (c) bakeCrystal(c, cam.z - SPAWN * (0.55 + rnd() * 0.3));
    }
    while (lastZ > cam.z - SPAWN) {
      const free = panes.find((p) => !p.on && !p.deadT);
      const gap = (640 + rnd() * 420) / (1 + cam.ramp);
      lastZ -= gap;
      // pity rule: low ammo with no live crystal forces the slot to feed
      // the player - a run must never starve on spawn luck alone
      const starving = ammo < 10 && !crystals.some((c) => c.on && !c.deadT);
      if (!starving && !free) continue;
      if (starving || rnd() < 0.34) {
        // crystal chains: 1-3 tumbling down the slot - the ammo economy
        // needs enough targets to keep a decent player fed
        const chain = starving && ammo < 6 ? 3 : 1 + (rnd() < 0.45) + (rnd() < 0.18);
        for (let k = 0; k < chain; k++) {
          const c = crystals.find((c) => !c.on && !c.deadT);
          if (!c) break;
          bakeCrystal(c, lastZ - k * 140);
        }
        continue;
      }
      if (rnd() < 0.08) continue; // breather
      free.z = lastZ;
      bakePane(free, pickKind(dist), dist);
    }
    if (ammo < 6 && nextPowT > T + 4) nextPowT = T + 1.5; // desperation pickup
    if (T > nextPowT) {
      nextPowT = T + 18 + rnd() * 6;
      const pk = pickups.find((p) => !p.on);
      if (pk) {
        const ks = Object.keys(PKIND);
        bakePickup(pk, ks[(rnd() * ks.length) | 0], cam.z - SPAWN * 0.9);
      }
    }
  };

  // world coords of the first weak rect's center (auto-aim / probes)
  const wp = [0, 0, 0];
  const weakPoint = (p) => {
    const r = p.rects.find((r) => r.weak);
    if (!r) return null;
    const lx = r.x + r.w / 2, ly = r.y + r.h / 2;
    const cr = Math.cos(p.roll), sr = Math.sin(p.roll);
    const ct = Math.cos(p.tilt), st = Math.sin(p.tilt);
    wp[0] = p.x + lx * cr - ly * sr;
    wp[1] = p.y + (lx * sr + ly * cr) * ct;
    wp[2] = p.z + ly * st;
    return wp;
  };

  // ---------- per-frame ----------
  const tmpL = [0, 0, 0];
  const obs = { panes, crystals, pickups, PKIND, release, weakPoint };

  obs.frame = (dt) => {
    // panes: descend motion, project, pass/despawn bookkeeping
    for (const p of panes) {
      if (!p.on) continue;
      if (p.deadT) continue;
      if (p.descend) {
        p.y -= p.descend * dt;
        if (p.y < cam.laneY(p.z) - 300) p.descend = 0;
      }
      if (cam.z - p.z < -90) { // fully behind -> recycle
        p.on = false;
        for (let q = p.lo; q < p.lo + p.n; q++) {
          const j = q * 3;
          homed[q] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[q] = 1; size[q] = 0;
        }
        continue;
      }
      projectEnt(p, p.x, p.y, p.z, -2.2, 1.9);
      for (let q = 0; q < p.n; q++) {
        const pp = p.lo + q;
        size[pp] = 0.7 + p.lum[q] * 0.8;
        const c = p.lum[q] > 0.5 ? PF.PAL.ink : PF.PAL.mist;
        const j = pp * 3, m = p.lum[q];
        hcol[j] = c[0] * m * lv.t[0];
        hcol[j + 1] = c[1] * m * lv.t[1];
        hcol[j + 2] = c[2] * m * lv.t[2];
      }
    }
    // crystals: tumble + project
    for (const c of crystals) {
      if (!c.on || c.deadT) continue;
      if (cam.z - c.z < -90) {
        c.on = false;
        for (let q = c.lo; q < c.lo + c.n; q++) {
          const j = q * 3;
          homed[q] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[q] = 1; size[q] = 0;
        }
        continue;
      }
      const a = c.rotA + field.T * c.rotW, b = c.rotB + field.T * c.rotW * 0.7;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      for (let q = 0; q < c.n; q++) {
        const x0 = c.local[q * 3], y0 = c.local[q * 3 + 1], z0 = c.local[q * 3 + 2];
        const x1 = x0 * ca - z0 * sa, z1 = x0 * sa + z0 * ca; // Ry
        const y2 = y0 * cb - z1 * sb, z2 = y0 * sb + z1 * cb; // Rx
        c.tx[q * 3] = x1; c.tx[q * 3 + 1] = y2; c.tx[q * 3 + 2] = z2;
      }
      projectEnt(c, c.x, c.y, c.z, -2.4, 2.2);
      for (let q = 0; q < c.n; q++) {
        const pp = c.lo + q, j = pp * 3;
        size[pp] = 1 + c.tier * 0.25;
        const m = 0.5 + c.tier * 0.2;
        hcol[j] = (PF.PAL.sky[0] * m + 0.25) * lv.t[0];
        hcol[j + 1] = (PF.PAL.sky[1] * m + 0.3) * lv.t[1];
        hcol[j + 2] = PF.PAL.sky[2] * m * lv.t[2];
      }
    }
    // pickups: bob + project
    for (const pk of pickups) {
      if (!pk.on || pk.deadT) continue;
      if (cam.z - pk.z < -90) {
        pk.on = false;
        for (let q = pk.lo; q < pk.lo + pk.n; q++) {
          const j = q * 3;
          homed[q] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
          snap[q] = 1; size[q] = 0;
        }
        continue;
      }
      const by = pk.y + Math.sin(field.T * 1.4 + pk.bob) * 14;
      projectEnt(pk, pk.x, by, pk.z, -2, 2);
      const col = PKIND[pk.kind].col;
      for (let q = 0; q < pk.n; q++) {
        const pp = pk.lo + q, j = pp * 3;
        size[pp] = 0.8 + pk.lum[q] * 0.5;
        hcol[j] = col[0] * pk.lum[q]; hcol[j + 1] = col[1] * pk.lum[q]; hcol[j + 2] = col[2] * pk.lum[q];
      }
    }
    deadPass(dt);
  };

  // ball (world pos, prev pos) vs entities. Returns event or null.
  const bl = [0, 0, 0], cl = [0, 0, 0];
  obs.hitTest = (bx, by, bz, px, py, pz) => {
    for (const c of crystals) {
      if (!c.on || c.deadT) continue;
      const dx = bx - c.x, dy = by - c.y, dz = bz - c.z;
      const rr = c.r + 14;
      if (dx * dx + dy * dy + dz * dz < rr * rr)
        return { type: "crystal", c };
    }
    for (const pk of pickups) {
      if (!pk.on || pk.deadT) continue;
      const dx = bx - pk.x, dy = by - pk.y, dz = bz - pk.z;
      if (dx * dx + dy * dy + dz * dz < 70 * 70)
        return { type: "pickup", pk };
    }
    for (const p of panes) {
      if (!p.on || p.deadT) continue;
      paneLocal(p, px, py, pz, bl);
      if (bl[2] <= 0) continue;
      paneLocal(p, bx, by, bz, cl);
      if (cl[2] > 0) continue;
      const t = bl[2] / (bl[2] - cl[2]);
      const hx = bl[0] + (cl[0] - bl[0]) * t, hy = bl[1] + (cl[1] - bl[1]) * t;
      for (const r of p.rects) {
        if (hx >= r.x && hx <= r.x + r.w && hy >= r.y && hy <= r.y + r.h)
          return { type: r.weak ? "pane" : "steel", p, hx, hy };
      }
    }
    return null;
  };

  // camera crossing check: pane plane reached with lane point inside a
  // solid rect -> collision. Called with the camera's previous z.
  obs.check = (prevZ) => {
    for (const p of panes) {
      if (!p.on || p.deadT) continue;
      if (!(prevZ > p.z && cam.z <= p.z)) continue;
      paneLocal(p, cam.x, cam.y, p.z, tmpL);
      for (const r of p.rects) {
        if (tmpL[0] >= r.x && tmpL[0] <= r.x + r.w &&
            tmpL[1] >= r.y && tmpL[1] <= r.y + r.h)
          return { type: "collision", p };
      }
    }
    return null;
  };

  obs.reset = () => {
    lastZ = cam.z - SPAWN * 0.5; nextPowT = 9;
    for (const e of [...panes, ...crystals, ...pickups]) {
      e.on = false; e.deadT = 0;
      for (let q = e.lo; q < e.lo + e.n; q++) {
        const j = q * 3;
        homed[q] = 1; home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[q] = 1; size[q] = 0;
      }
    }
    dead.length = 0;
  };

  obs.spawnAhead = spawnAhead;
  // flags on all entity slices (full capacity): rigid shapes, no pointer verbs
  const caps = new Map([[panes, PCAP], [crystals, CCAP], [pickups, XCAP]]);
  for (const [arr, cap] of caps) {
    for (const e of arr) {
      for (let q = e.lo; q < e.lo + cap; q++) { noFlock[q] = 1; noWell[q] = 1; }
      ents.push(e);
    }
  }
  return obs;
}
