// sky.js - the far sky: painted nebula banks plus each leg's giant world.
// Nebula clouds sit in fixed sky directions (rotation only, no parallax).
// The giant is world-anchored ~120k out, so it swells and slides aside
// over a leg. A quarter-res 2D canvas under the deck paints the soft colour
// and the giant's dark body - additive particles can brighten but never
// occlude, so mass has to be painted. The giant's lit speckle, limb and
// ring are particles on top: the particle layer stays the hero.
export function createSky(field, cam, PF, range, LIGHT) {
  const home = field.home, hcol = field.hcol, snap = field.snap,
    homed = field.homed, size = field.size, noFlock = field.noFlock;

  // own seeded stream: the sky must not shift PF.rnd's gate/rock sequence
  let seed = 90127;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // one mood per campaign stage (leg 1-3, then endless cycles them).
  // cols: cloud body / secondary / bright rim, 0-255. haze: 0-1 tints for
  // the particle nebula haze so near clouds agree with the painted ones.
  const MOODS = [
    { // leg 1: cold teal reach
      wash: [6, 16, 26], cols: [[30, 118, 150], [40, 64, 150], [130, 220, 210]],
      giant: { yaw: 0.62, pitch: -0.26, R: 15000, col: [0.6, 0.72, 0.84], bands: 0.1, ring: 0 },
    },
    { // leg 2: crimson storm front
      wash: [26, 6, 14], cols: [[176, 40, 62], [112, 34, 112], [255, 146, 96]],
      giant: { yaw: -0.5, pitch: -0.3, R: 18000, col: [0.92, 0.66, 0.5], bands: 0.32, ring: 1 },
    },
    { // leg 3: reactor violet
      wash: [14, 7, 30], cols: [[104, 52, 196], [196, 60, 146], [255, 186, 96]],
      giant: { yaw: 0.85, pitch: 0.08, R: 13000, col: [0.74, 0.64, 0.96], bands: 0.2, ring: 2 },
    },
    { // endless: amber deep field
      wash: [24, 16, 6], cols: [[200, 120, 36], [44, 124, 104], [246, 210, 150]],
      giant: { yaw: -0.2, pitch: -0.48, R: 16000, col: [0.58, 0.84, 0.7], bands: 0.24, ring: 1 },
    },
  ];
  const CLOUDS_PER = 7, SPR = 192;
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // yaw/pitch relative to the track axis (-z): +yaw = right, +pitch = up
  const dirOf = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];

  // a cloud bank sprite: lumpy puffs along a wobbly spine, brighter rim
  // knots, then dust lanes carved out so it reads as structure, not a blob
  const paintCloud = (cols) => {
    const c = document.createElement("canvas");
    c.width = c.height = SPR;
    const g = c.getContext("2d");
    const H = SPR / 2, ph = rng() * 6.283;
    const puff = (x, y, r, col, a) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
      gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    g.globalCompositeOperation = "lighter";
    for (let k = 0; k < 64; k++) {
      const t = rng() * 2 - 1, e = 1 - Math.abs(t);
      const x = H + t * SPR * 0.34 + (rng() - 0.5) * SPR * 0.1;
      const y = H + Math.sin(t * 2.4 + ph) * SPR * 0.09 + (rng() - 0.5) * SPR * 0.2 * e;
      const v = rng();
      const col = v < 0.62 ? cols[0] : v < 0.86 ? cols[1] : cols[2];
      const hi = col === cols[2];
      puff(x, y, SPR * (hi ? 0.04 + rng() * 0.05 : 0.07 + rng() * 0.13) * (0.5 + e * 0.5),
        col, hi ? 0.18 + rng() * 0.14 : 0.05 + rng() * 0.07);
    }
    g.globalCompositeOperation = "destination-out";
    for (let k = 0; k < 12; k++) {
      const t = rng() * 2 - 1;
      puff(H + t * SPR * 0.3, H + Math.sin(t * 2.4 + ph) * SPR * 0.09 + (rng() - 0.5) * SPR * 0.12,
        SPR * (0.03 + rng() * 0.06), [0, 0, 0], 0.35 + rng() * 0.3);
    }
    return c;
  };
  // cloud layout per mood: most banks in the forward half-sky where the
  // pilot looks, a few flung wide so turning never finds an empty sky
  for (const m of MOODS) {
    m.clouds = [];
    for (let k = 0; k < CLOUDS_PER; k++) {
      const wide = k >= 5;
      const yaw = (rng() - 0.5) * (wide ? 6.0 : 2.6), pitch = (rng() - 0.5) * (wide ? 1.6 : 0.9);
      const d = dirOf(yaw, pitch);
      // tangent basis at d: the sprite's long axis gets a random tilt
      const e1 = unit(cross(d, [0, 1, 0])), e2 = cross(e1, d), tilt = (rng() - 0.5) * 1.2;
      const ax = [0, 1, 2].map((i) => e1[i] * Math.cos(tilt) + e2[i] * Math.sin(tilt));
      m.clouds.push({ d, ax, ang: 0.32 + rng() * 0.38, a: 0.55 + rng() * 0.45, spr: paintCloud(m.cols) });
    }
  }

  const cv = document.createElement("canvas");
  cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:1;pointer-events:none";
  document.body.prepend(cv);
  const g = cv.getContext("2d");
  // quarter-res: everything here is soft by design, and A/B timing put
  // half-res at ~+3ms/frame raster cost in headless vs ~0 at quarter
  const SC = 0.25;
  let W = 0, H = 0;
  const resize = () => {
    W = Math.max(1, (innerWidth * SC) | 0); H = Math.max(1, (innerHeight * SC) | 0);
    cv.width = W; cv.height = H;
  };
  resize();
  addEventListener("resize", resize);

  // direction / world point -> half-res screen; false when behind the eye
  const o = cam.out;
  const projDir = (d) => cam.project(cam.x + d[0] * 1e6, cam.y + d[1] * 1e6, cam.z + d[2] * 1e6);

  // --- giant: one slot, faded out and re-anchored on a mood change
  const GN = range.hi - range.lo;
  const RIM_N = (GN * 0.2) | 0, RING_N = (GN * 0.3) | 0, SURF_N = GN - RIM_N - RING_N;
  const su = new Float32Array(SURF_N), sv = new Float32Array(SURF_N), sl = new Float32Array(SURF_N);
  for (let i = 0; i < SURF_N; i++) {
    const a = rng() * 6.283, r = Math.sqrt(rng()) * 0.985;
    su[i] = Math.cos(a) * r; sv[i] = Math.sin(a) * r; sl[i] = 0.6 + rng() * 0.6;
  }
  const ra = new Float32Array(RING_N), rr = new Float32Array(RING_N), rl = new Float32Array(RING_N);
  for (let i = 0; i < RING_N; i++) {
    ra[i] = rng() * 6.283;
    const band = rng();
    rr[i] = band < 0.7 ? 1.5 + rng() * 0.26 : 1.88 + rng() * 0.14; // main band + thin outer
    rl[i] = 0.6 + rng() * 0.6;
  }
  for (let p = range.lo; p < range.hi; p++) { noFlock[p] = 1; homed[p] = 1; snap[p] = 1; }

  const gi = { x: 0, y: 0, z: 0, R: 1, mood: 0, a: 0, axis: [0, 1, 0], spin: 0 };
  const anchor = (m) => {
    const G = MOODS[m].giant, D = 120000, d = dirOf(G.yaw, G.pitch);
    gi.x = cam.x + d[0] * D; gi.y = cam.y + d[1] * D; gi.z = cam.z + d[2] * D;
    gi.R = G.R; gi.mood = m;
    gi.axis = unit([0.3 * (m - 1.5), 1, 0.62]); // ~30deg toward the eye: rings open
  };

  // per-frame giant frame: V toward the giant, a stable local basis
  // (axis-locked, so surface speckle never swims with camera roll), and
  // the screen basis for the painted per-pixel body
  const V = [0, 0, 1], Bu = [0, 1, 0], Br = [1, 0, 0];
  let bodyCv = document.createElement("canvas"), bodyG = bodyCv.getContext("2d"), bodyImg = null;

  const paintBody = (col, cx, cy, rho, alpha) => {
    const pr = Math.max(2, Math.min(96, Math.ceil(rho)));
    const n = pr * 2;
    if (bodyCv.width !== n) { bodyCv.width = bodyCv.height = n; bodyImg = bodyG.createImageData(n, n); }
    const R = cam.chase ? cam.vr : cam.right;
    // screen right/up made orthogonal to the view ray through the giant
    const k1 = dot(R, V), sr = unit([R[0] - V[0] * k1, R[1] - V[1] * k1, R[2] - V[2] * k1]);
    const su2 = cross(sr, V); // right x fwd = up
    const lr = dot(LIGHT, sr), lu = dot(LIGHT, su2), lv = dot(LIGHT, V);
    const ar = dot(gi.axis, sr), au = dot(gi.axis, su2), av = dot(gi.axis, V);
    const G = MOODS[gi.mood].giant, wash = MOODS[gi.mood].wash;
    const d = bodyImg.data;
    for (let y = 0; y < n; y++) {
      const ny = -(y + 0.5 - pr) / pr;
      for (let x = 0; x < n; x++) {
        const nx = (x + 0.5 - pr) / pr, q = nx * nx + ny * ny, j = (y * n + x) * 4;
        if (q >= 1) { d[j + 3] = 0; continue; }
        const nz = Math.sqrt(1 - q); // facing the camera: n = nx*sr + ny*su - nz*V
        const L = nx * lr + ny * lu - nz * lv;
        const lit = L > 0 ? Math.pow(L, 0.75) : 0;
        const lat = nx * ar + ny * au - nz * av;
        const band = 1 + G.bands * Math.sin(lat * 13 + Math.sin(lat * 31) * 0.8);
        // thin bright atmosphere at the lit limb, near-black night side
        // tinted by the mood wash so it silhouettes against the nebula
        const limb = Math.pow(1 - nz, 3) * Math.max(0, L + 0.25) * 1.4;
        const e = Math.min(1, (1 - Math.sqrt(q)) * pr * 1.5);
        for (let c = 0; c < 3; c++)
          d[j + c] = Math.min(255, wash[c] * 0.5 + 255 * (G.col[c] * (lit * 0.9 * band) + limb * (0.5 + G.col[c] * 0.5)));
        d[j + 3] = 255 * e * alpha;
      }
    }
    bodyG.putImageData(bodyImg, 0, 0);
    g.drawImage(bodyCv, cx - rho, cy - rho, rho * 2, rho * 2);
    // soft halo leaning toward the light
    const hx = cx + lr * rho * 0.12, hy = cy - lu * rho * 0.12;
    const gr = g.createRadialGradient(hx, hy, rho * 0.92, hx, hy, rho * 1.5);
    const a = 0.2 * alpha * Math.max(0.25, 1 - lv);
    gr.addColorStop(0, `rgba(${(G.col[0] * 255) | 0},${(G.col[1] * 255) | 0},${(G.col[2] * 255) | 0},${a})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = gr;
    g.fillRect(hx - rho * 1.5, hy - rho * 1.5, rho * 3, rho * 3);
    g.globalCompositeOperation = "source-over";
  };

  const hide = (p) => {
    const j = p * 3;
    home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0; snap[p] = 1;
  };
  const put = (p, wx, wy, wz, sz, r, gg, b, snapMode) => {
    if (!cam.project(wx, wy, wz)) { hide(p); return; }
    const j = p * 3;
    // pin z: at ~1e5 range o[2] would crush every sprite to the floor
    home[j] = o[0]; home[j + 1] = o[1]; home[j + 2] = 0;
    if (snapMode) snap[p] = 1;
    size[p] = sz; hcol[j] = r; hcol[j + 1] = gg; hcol[j + 2] = b;
  };

  // galactic band: a fixed great circle the far star sphere crowds
  // (course.js bakes its stars from sky.band); a pale painted glow along
  // it makes the stripe read as one landmark across every mood
  const bn = unit([0.22, 0.95, 0.18]), be1 = unit([bn[1], -bn[0], 0]), be2 = cross(bn, be1);
  const BAND = [];
  for (let k = 0; k < 22; k++) {
    const t = (k / 22) * 6.283, c = Math.cos(t), s = Math.sin(t);
    BAND.push({ d: [0, 1, 2].map((i) => be1[i] * c + be2[i] * s), ax: [0, 1, 2].map((i) => be2[i] * c - be1[i] * s),
      ang: 0.28, a: 0.4 + rng() * 0.35, spr: paintCloud([[150, 158, 186], [116, 118, 150], [232, 226, 214]]) });
  }

  const sky = { moods: MOODS.length, mood: 0, giant: gi, band: { n: bn, e1: be1, e2: be2 } };
  let mood = 0, prevMood = 0, mix = 1;
  // carrier silhouette: additive hull sprites can't occlude, so course.js
  // paints a dark disc under each plate onto this canvas (same frame) and
  // marks a coarse grid that hides far stars behind the hull next frame
  const OGX = 64, OGY = 36;
  let occ = new Uint8Array(OGX * OGY), occPrev = new Uint8Array(OGX * OGY), occN = 0;
  const occSwap = () => { const t = occPrev; occPrev = occ; occ = t; occ.fill(0); occN = 0; };
  sky.shadeBegin = () => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
  };
  sky.shade = (x, y, r) => {
    g.moveTo((x + r) * SC, y * SC);
    g.arc(x * SC, y * SC, r * SC, 0, 6.2832);
    occN++;
    const cw = innerWidth / OGX, ch = innerHeight / OGY;
    const c0 = Math.max(0, ((x - r) / cw) | 0), c1 = Math.min(OGX - 1, ((x + r) / cw) | 0);
    const r0 = Math.max(0, ((y - r) / ch) | 0), r1 = Math.min(OGY - 1, ((y + r) / ch) | 0);
    for (let gy = r0; gy <= r1; gy++)
      for (let gx = c0; gx <= c1; gx++) {
        const dx = (gx + 0.5) * cw - x, dy = (gy + 0.5) * ch - y;
        if (dx * dx + dy * dy <= r * r) occ[gy * OGX + gx] = 1;
      }
  };
  sky.shadeEnd = () => {
    if (!occN) return;
    g.fillStyle = "rgb(7,9,15)";
    g.fill();
  };
  sky.occluded = (x, y) => {
    const gx = (x * OGX / innerWidth) | 0, gy = (y * OGY / innerHeight) | 0;
    return gx >= 0 && gy >= 0 && gx < OGX && gy < OGY && occPrev[gy * OGX + gx] === 1;
  };

  sky.reset = () => { mood = prevMood = 0; mix = 1; anchor(0); gi.a = 1; };
  sky.reset();

  // haze tint for the course's particle nebula clusters, 0-1 rgb
  sky.haze = (v) => {
    const c = MOODS[mood].cols[v < 0.55 ? 0 : v < 0.85 ? 1 : 2];
    return [c[0] / 255, c[1] / 255, c[2] / 255];
  };

  const drawClouds = (list, alpha) => {
    for (const c of list) {
      if (!projDir(c.d)) continue;
      const x = o[0] * SC, y = o[1] * SC;
      // second point along the bank's long axis gives scale + screen angle
      const t = [c.d[0] + c.ax[0] * 0.1, c.d[1] + c.ax[1] * 0.1, c.d[2] + c.ax[2] * 0.1];
      if (!projDir(t)) continue;
      const dx = o[0] * SC - x, dy = o[1] * SC - y;
      const s = Math.hypot(dx, dy) * 10 * c.ang * 2.2;
      if (x + s < 0 || x - s > W || y + s < 0 || y - s > H) continue;
      g.save();
      g.translate(x, y);
      g.rotate(Math.atan2(dy, dx));
      g.globalAlpha = alpha * c.a;
      g.drawImage(c.spr, -s / 2, -s / 2, s, s);
      g.restore();
    }
  };

  // stage: 0-2 campaign legs, 3 endless; endK: endless progress (cycles moods)
  sky.frame = (dt, stage, endK, snapMode) => {
    occSwap(); // stars read last frame's hull grid; an unseen carrier clears it
    const want = stage < 3 ? stage : (3 + endK) % MOODS.length;
    if (want !== mood && mix >= 1) { prevMood = mood; mood = want; mix = 0; }
    mix = Math.min(1, mix + dt / 5);
    sky.mood = mood;

    // the giant fades out, re-anchors to the new mood, fades back in;
    // also re-anchors if the pilot somehow overtakes it
    const gdx = gi.x - cam.x, gdy = gi.y - cam.y, gdz = gi.z - cam.z;
    const gd = Math.hypot(gdx, gdy, gdz);
    const passed = gd < gi.R * 2.5 || gdz > 0;
    if (gi.mood !== mood || passed) {
      gi.a = Math.max(0, gi.a - dt / 2.5);
      if (gi.a === 0) anchor(mood);
    } else gi.a = Math.min(1, gi.a + dt / 2.5);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    const wa = MOODS[mood].wash, wb = MOODS[prevMood].wash, k = mix;
    g.fillStyle = `rgb(${(wb[0] + (wa[0] - wb[0]) * k) * 0.45},${(wb[1] + (wa[1] - wb[1]) * k) * 0.45},${(wb[2] + (wa[2] - wb[2]) * k) * 0.45})`;
    g.fillRect(0, 0, W, H);
    drawClouds(BAND, 1);
    if (k < 1) drawClouds(MOODS[prevMood].clouds, 1 - k);
    drawClouds(MOODS[mood].clouds, k);
    g.globalAlpha = 1;

    V[0] = gdx / gd; V[1] = gdy / gd; V[2] = gdz / gd;
    const bu = unit(cross(cross(V, gi.axis), V)); // spin axis, flattened onto the disc
    Bu[0] = bu[0]; Bu[1] = bu[1]; Bu[2] = bu[2];
    const br = cross(Bu, V); Br[0] = br[0]; Br[1] = br[1]; Br[2] = br[2];
    const vis = gi.a > 0.01 && cam.project(gi.x, gi.y, gi.z);
    const rho = vis ? (gi.R / gd) * cam.f : 0; // full-res px radius
    const cx = o[0], cy = o[1];
    if (vis && rho > 1.5) paintBody(MOODS[gi.mood].giant.col, cx * SC, cy * SC, rho * SC, gi.a);
    sky.giantVis = vis && rho > 1.5; sky.giantPx = rho;
    sky.gx = cx; sky.gy = cy; sky.gr2 = vis ? rho * rho * 0.96 * gi.a * gi.a : 0;

    // particles: surface speckle on the lit face, a limb ring, the ring
    const G = MOODS[gi.mood].giant, A = gi.a;
    let p = range.lo;
    const pz = Math.min(2.4, Math.max(0.9, rho / 70));
    for (let i = 0; i < SURF_N; i++, p++) {
      if (!vis) { hide(p); continue; }
      const u = su[i], w = sv[i], nz = Math.sqrt(1 - u * u - w * w);
      const nx = u * Br[0] + w * Bu[0] - nz * V[0];
      const ny = u * Br[1] + w * Bu[1] - nz * V[1];
      const nzz = u * Br[2] + w * Bu[2] - nz * V[2];
      const L = nx * LIGHT[0] + ny * LIGHT[1] + nzz * LIGHT[2];
      if (L <= 0.02) { hide(p); continue; }
      const lat = nx * gi.axis[0] + ny * gi.axis[1] + nzz * gi.axis[2];
      const b = Math.pow(L, 0.8) * sl[i] * (1 + G.bands * 1.6 * Math.sin(lat * 13 + Math.sin(lat * 31) * 0.8)) * A * 0.75;
      put(p, gi.x + nx * gi.R, gi.y + ny * gi.R, gi.z + nzz * gi.R, pz * (0.7 + sl[i] * 0.4),
        G.col[0] * b, G.col[1] * b, G.col[2] * b, snapMode);
    }
    for (let i = 0; i < RIM_N; i++, p++) {
      if (!vis) { hide(p); continue; }
      const t = (i / RIM_N) * 6.283, c = Math.cos(t), s = Math.sin(t);
      const nx = c * Br[0] + s * Bu[0], ny = c * Br[1] + s * Bu[1], nzz = c * Br[2] + s * Bu[2];
      const L = nx * LIGHT[0] + ny * LIGHT[1] + nzz * LIGHT[2];
      const b = Math.max(0, L + 0.2) * 1.3 * A;
      if (b < 0.02) { hide(p); continue; }
      const R = gi.R * 1.01;
      put(p, gi.x + nx * R, gi.y + ny * R, gi.z + nzz * R, pz * 1.1,
        (0.4 + G.col[0] * 0.6) * b, (0.4 + G.col[1] * 0.6) * b, (0.4 + G.col[2] * 0.6) * b, snapMode);
    }
    // ring plane basis from the spin axis
    const e1 = unit(cross(gi.axis, [0.3, 0.1, 1])), e2 = cross(gi.axis, e1);
    gi.spin += dt * 0.01;
    for (let i = 0; i < RING_N; i++, p++) {
      if (!vis || !G.ring) { hide(p); continue; }
      const a = ra[i] + gi.spin, r = rr[i] * gi.R * (G.ring === 2 ? 0.9 : 1);
      const ox = (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * r;
      const oy = (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * r;
      const oz = (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * r;
      // behind the body (farther than its centre and inside its disc)?
      const along = ox * V[0] + oy * V[1] + oz * V[2];
      if (along > 0) {
        const px = ox - V[0] * along, py = oy - V[1] * along, pzz = oz - V[2] * along;
        if (px * px + py * py + pzz * pzz < gi.R * gi.R) { hide(p); continue; }
      }
      const b = rl[i] * A;
      put(p, gi.x + ox, gi.y + oy, gi.z + oz, pz * 1.05,
        (0.5 + G.col[0] * 0.5) * b, (0.45 + G.col[1] * 0.5) * b, (0.4 + G.col[2] * 0.5) * b, snapMode);
    }
  };

  return sky;
}
