// water.js - pond water as two grids over the viewport. Grid A (coarse,
// half-xu cells) holds scattered density, pressure and cell velocity: the
// pressure gradient spreads clumps, fills voids and levels coverage, and
// the cell velocity gives viscosity a coherent wake to relax into. Grid B
// (fine, eighth-xu cells) is a wave heightfield: verbs stamp height, the
// field propagates it as real expanding rings, and every particle (fish
// members too) feels the downhill push. vel units are px per 1/180s ref
// frame like the rest of the pond; z units are xu, so h in px divides by u.
import { PF } from "../../engine/index.js";

const PK = 0.9; // pressure push per (dens/px) gradient; must beat flow noise
const NEG_P = 1.0; // under-density pull share of PK - voids actively fill
const VISC = 0.25; // relax particle vel toward cell velocity
const P_LERP = 0.5; // temporal smoothing on pressure, kills shot noise
const WAVE_SPD = 1.6; // xu/s ring speed, matches the old ripple fronts
const HDAMP = 0.996; // hv decay per ref frame; ring half-life ~0.9s
const RELAX = 0.0005; // slow leak of mean height
const WG = 0.9; // wave slope -> px/ref-frame push; must clear the ~1.7 ambient
const ZUP = 1.4; // crest z-lift, applied to h/u so it lands in xu
const ZDN = 1.8; // trough sinks harder than a crest lifts
const SIZE_K = 0.9; // crest size gain; water sprites fatten on the ring
const FISH_PUSH = 2.5; // spine-joint displacement per unit slope
const VMAX = 1.8; // px/ref-frame water speed cap; pond still
const RECLAIM = 1.0; // xu offscreen where layout() teleports back in
const TAP_R0 = 0.28; // xu tap crest ring radius
const TAP_RING = 0.5; // xu tap crest height
const TAP_RSIG = 1.0; // ring sigma in cellsB
const TRENCH_D = 0.04; // xu trench depth at full drag speed
const TRENCH_SPD = 0.5; // xu per ref frame seg speed for full depth
const TRENCH_SIG = 2.0; // trench sigma in cellsB
const JET_C = 0.3; // share of cursor speed written as cell momentum
const JET_MAX = 1.2; // xu per ref frame cap on segV for the jet
const JET_DECAY = 0.95; // wake momentum half-life ~13 ref frames
const SWIRL_R = 0.8; // xu hold radius
const SWIRL = 0.016; // px per ref frame tangential impulse (was 0.04)
const SWIRL_DIP = 0.006; // xu per ref frame dipole stamp rate
const DIMPLE_A = 0.05; // xu pit depth a fully calm cursor approaches
const DIMPLE_K = 0.06; // approach rate toward the pit envelope
const GAUSS_SIG = 1.5; // stamp sigma in cellsB

export function makeWater(field, ctx) {
  const { pos, vel, homed, capt, size } = field;
  const N = field.N;
  let u = field.unit, W = 0, H = 0, dtfNow = 1;

  let cellA = 1, gwa = 0, gha = 0;
  let dens = new Float32Array(0), cvx = new Float32Array(0), cvy = new Float32Array(0);
  let pres = new Float32Array(0), blur = new Float32Array(0);
  let pgx = new Float32Array(0), pgy = new Float32Array(0);
  let jetx = new Float32Array(0), jety = new Float32Array(0);

  let cellB = 1, gwb = 0, ghb = 0, C2 = 0;
  let h = new Float32Array(0), hv = new Float32Array(0);
  let hgx = new Float32Array(0), hgy = new Float32Array(0);
  // baseline size snapshot taken on the first layout() (post-tintWater);
  // the per-frame size write restores it, so crests fatten and recover
  let ws0 = null;

  const layout = () => {
    u = field.unit;
    W = innerWidth;
    H = innerHeight;
    cellA = u * 0.5;
    gwa = Math.ceil(W / cellA);
    gha = Math.ceil(H / cellA);
    const na = gwa * gha;
    if (dens.length !== na) {
      dens = new Float32Array(na);
      cvx = new Float32Array(na);
      cvy = new Float32Array(na);
      pres = new Float32Array(na);
      blur = new Float32Array(na);
      pgx = new Float32Array(na);
      pgy = new Float32Array(na);
      jetx = new Float32Array(na);
      jety = new Float32Array(na);
    }
    cellB = u / (PF.isMobile() ? 6 : 8);
    gwb = Math.ceil(W / cellB) + 1;
    ghb = Math.ceil(H / cellB) + 1;
    const nb = gwb * ghb;
    if (h.length !== nb) {
      h = new Float32Array(nb);
      hv = new Float32Array(nb);
      hgx = new Float32Array(nb);
      hgy = new Float32Array(nb);
    } else {
      h.fill(0);
      hv.fill(0);
    }
    // sqrt(C2) cells per ref frame is the wave speed: C2 = (spd*cellsPerU/180)^2
    const cpu = u / cellB;
    C2 = (WAVE_SPD * cpu / 180) ** 2;
    api.gw = gwb;
    api.gh = ghb;
    api.h = h;

    const lim = RECLAIM * u;
    for (let p = 0; p < N; p++) {
      if (homed[p] || capt[p]) continue;
      const i = p * 3;
      const x = pos[i], y = pos[i + 1];
      if (x < -lim || x > W + lim || y < -lim || y > H + lim) {
        pos[i] = PF.rnd() * W;
        pos[i + 1] = PF.rnd() * H;
        vel[i] = vel[i + 1] = vel[i + 2] = 0;
      }
    }
    if (!ws0) {
      ws0 = new Float32Array(N);
      ws0.set(field.size);
    }
  };

  // border-replicated bilinear gather: offscreen reads clamp to the edge
  const gather = (a, gw, gh, cell, x, y) => {
    let gx = x / cell - 0.5, gy = y / cell - 0.5;
    if (gx < 0) gx = 0;
    else if (gx > gw - 1.001) gx = gw - 1.001;
    if (gy < 0) gy = 0;
    else if (gy > gh - 1.001) gy = gh - 1.001;
    const ix = gx | 0, iy = gy | 0;
    const tx = gx - ix, ty = gy - iy;
    const c = iy * gw + ix;
    const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty);
    const w2 = (1 - tx) * ty, w3 = tx * ty;
    return a[c] * w0 + a[c + 1] * w1 + a[c + gw] * w2 + a[c + gw + 1] * w3;
  };

  const step = (T, dt) => {
    if (!gwa || !gwb) return;
    const dtf = Math.max(0.25, Math.min(3, dt * 180));
    dtfNow = dtf;

    // --- grid A scatter ---
    dens.fill(0);
    cvx.fill(0);
    cvy.fill(0);
    let nWater = 0;
    const aMaxX = gwa - 1.001, aMaxY = gha - 1.001;
    for (let p = 0; p < N; p++) {
      if (homed[p] || capt[p]) continue;
      nWater++;
      const i = p * 3;
      let gx = pos[i] / cellA - 0.5, gy = pos[i + 1] / cellA - 0.5;
      if (gx < 0) gx = 0;
      else if (gx > aMaxX) gx = aMaxX;
      if (gy < 0) gy = 0;
      else if (gy > aMaxY) gy = aMaxY;
      const ix = gx | 0, iy = gy | 0;
      const tx = gx - ix, ty = gy - iy;
      const c = iy * gwa + ix;
      const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty);
      const w2 = (1 - tx) * ty, w3 = tx * ty;
      const vx = vel[i], vy = vel[i + 1];
      dens[c] += w0; cvx[c] += w0 * vx; cvy[c] += w0 * vy;
      dens[c + 1] += w1; cvx[c + 1] += w1 * vx; cvy[c + 1] += w1 * vy;
      dens[c + gwa] += w2; cvx[c + gwa] += w2 * vx; cvy[c + gwa] += w2 * vy;
      dens[c + gwa + 1] += w3; cvx[c + gwa + 1] += w3 * vx; cvy[c + gwa + 1] += w3 * vy;
    }
    const rho0 = nWater / (gwa * gha);
    const na = gwa * gha;
    for (let y = 0; y < gha; y++) {
      const y0 = (y > 0 ? y - 1 : 0) * gwa, y1 = y * gwa;
      const y2 = (y < gha - 1 ? y + 1 : gha - 1) * gwa;
      for (let x = 0; x < gwa; x++) {
        const x0 = x > 0 ? x - 1 : 0, x2 = x < gwa - 1 ? x + 1 : gwa - 1;
        blur[y1 + x] =
          (dens[y0 + x0] + dens[y0 + x] + dens[y0 + x2] +
           dens[y1 + x0] + dens[y1 + x] + dens[y1 + x2] +
           dens[y2 + x0] + dens[y2 + x] + dens[y2 + x2]) / 9;
      }
    }
    const kp = 1 - Math.pow(1 - P_LERP, dtf);
    const jd = Math.pow(JET_DECAY, dtf);
    const invA = 0.5 / cellA;
    for (let c = 0; c < na; c++) {
      pres[c] += (blur[c] - rho0 - pres[c]) * kp;
      const d = dens[c];
      // jet overlays the scattered mean so viscosity carries the wake
      cvx[c] = (d > 0.5 ? cvx[c] / d : 0) + jetx[c];
      cvy[c] = (d > 0.5 ? cvy[c] / d : 0) + jety[c];
      jetx[c] *= jd;
      jety[c] *= jd;
    }
    // periodic pressure gradient: the grid wraps like the particles, so
    // pressure acts seamlessly across seams and no wall pile can form
    for (let y = 0; y < gha; y++) {
      const row = y * gwa;
      for (let x = 0; x < gwa; x++) {
        const c = row + x;
        const xl = row + ((x + gwa - 1) % gwa), xr = row + ((x + 1) % gwa);
        const yt = ((y + gha - 1) % gha) * gwa + x, yb = ((y + 1) % gha) * gwa + x;
        pgx[c] = (pres[xr] - pres[xl]) * invA;
        pgy[c] = (pres[yb] - pres[yt]) * invA;
      }
    }

    // --- grid B wave update; ring 0 is never integrated so it stays 0 ---
    const hd = Math.pow(HDAMP, dtf);
    for (let y = 1; y < ghb - 1; y++) {
      const row = y * gwb;
      for (let x = 1; x < gwb - 1; x++) {
        const c = row + x;
        const lap = h[c - 1] + h[c + 1] + h[c - gwb] + h[c + gwb] - 4 * h[c];
        hv[c] = (hv[c] + (C2 * lap - RELAX * h[c]) * dtf) * hd;
      }
    }
    for (let y = 1; y < ghb - 1; y++) {
      const row = y * gwb;
      for (let x = 1; x < gwb - 1; x++) {
        const c = row + x;
        h[c] += hv[c] * dtf;
      }
    }
    // Neumann border: mirror the adjacent ring so the force gradient
    // vanishes at the walls and waves reflect. Any damping near the
    // border pins |h| low in an edge band - downhill pushes water out
    // through the wall; measured as a ~2000-particle boundary pump.
    for (let x = 0; x < gwb; x++) {
      h[x] = h[x + gwb];
      h[x + (ghb - 1) * gwb] = h[x + (ghb - 2) * gwb];
    }
    for (let y = 0; y < ghb; y++) {
      h[y * gwb] = h[y * gwb + 1];
      h[y * gwb + gwb - 1] = h[y * gwb + gwb - 2];
    }
    const invB = 0.5 / cellB;
    for (let y = 0; y < ghb; y++) {
      const row = y * gwb;
      for (let x = 0; x < gwb; x++) {
        const c = row + x;
        const xl = x > 0 ? c - 1 : c, xr = x < gwb - 1 ? c + 1 : c;
        const yt = y > 0 ? c - gwb : c, yb = y < ghb - 1 ? c + gwb : c;
        hgx[c] = (h[xr] - h[xl]) * invB;
        hgy[c] = (h[yb] - h[yt]) * invB;
      }
    }

    // --- gather: wave push on everything free, water extras below ---
    // bilinear coords are computed once per grid and shared across gathers
    const bMaxX = gwb - 1.001, bMaxY = ghb - 1.001;
    for (let p = 0; p < N; p++) {
      if (capt[p]) continue;
      const i = p * 3;
      const x = pos[i], y = pos[i + 1];
      let gx = x / cellB - 0.5, gy = y / cellB - 0.5;
      if (gx < 0) gx = 0;
      else if (gx > bMaxX) gx = bMaxX;
      if (gy < 0) gy = 0;
      else if (gy > bMaxY) gy = bMaxY;
      const bx = gx | 0, by = gy | 0;
      const btx = gx - bx, bty = gy - by;
      const bc = by * gwb + bx;
      const bw0 = (1 - btx) * (1 - bty), bw1 = btx * (1 - bty);
      const bw2 = (1 - btx) * bty, bw3 = btx * bty;
      vel[i] -=
        (hgx[bc] * bw0 + hgx[bc + 1] * bw1 + hgx[bc + gwb] * bw2 + hgx[bc + gwb + 1] * bw3) * WG * dtf;
      vel[i + 1] -=
        (hgy[bc] * bw0 + hgy[bc + 1] * bw1 + hgy[bc + gwb] * bw2 + hgy[bc + gwb + 1] * bw3) * WG * dtf;
      if (homed[p]) continue;
      const hh =
        h[bc] * bw0 + h[bc + 1] * bw1 + h[bc + gwb] * bw2 + h[bc + gwb + 1] * bw3;
      vel[i + 2] += hh * (hh > 0 ? ZUP / u : ZDN / u) * dtf;
      // crests fatten the speckle so the ring reads, not just pushes;
      // rewriting from ws0 every frame restores the baseline as it passes
      size[p] = ws0[p] * (1 + SIZE_K * Math.min(1, Math.max(0, hh) / u));
      gx = x / cellA - 0.5;
      gy = y / cellA - 0.5;
      if (gx < 0) gx = 0;
      else if (gx > aMaxX) gx = aMaxX;
      if (gy < 0) gy = 0;
      else if (gy > aMaxY) gy = aMaxY;
      const ax = gx | 0, ay = gy | 0;
      const atx = gx - ax, aty = gy - ay;
      const ac = ay * gwa + ax;
      const aw0 = (1 - atx) * (1 - aty), aw1 = atx * (1 - aty);
      const aw2 = (1 - atx) * aty, aw3 = atx * aty;
      const pr = pres[ac] * aw0 + pres[ac + 1] * aw1 + pres[ac + gwa] * aw2 + pres[ac + gwa + 1] * aw3;
      const k = pr > 0 ? PK : PK * NEG_P;
      vel[i] -=
        (pgx[ac] * aw0 + pgx[ac + 1] * aw1 + pgx[ac + gwa] * aw2 + pgx[ac + gwa + 1] * aw3) * k * dtf;
      vel[i + 1] -=
        (pgy[ac] * aw0 + pgy[ac + 1] * aw1 + pgy[ac + gwa] * aw2 + pgy[ac + gwa + 1] * aw3) * k * dtf;
      vel[i] +=
        ((cvx[ac] * aw0 + cvx[ac + 1] * aw1 + cvx[ac + gwa] * aw2 + cvx[ac + gwa + 1] * aw3) - vel[i]) * VISC * dtf;
      vel[i + 1] +=
        ((cvy[ac] * aw0 + cvy[ac + 1] * aw1 + cvy[ac + gwa] * aw2 + cvy[ac + gwa + 1] * aw3) - vel[i + 1]) * VISC * dtf;
      // speed cap: flow noise equilibrates near 8px/ref, so a transit
      // band ~v*dtf deep piles against both faces of the reflector.
      // Slower water thins the layer, shallows the overshoot, and still
      // reads as moving current.
      const sp2 = vel[i] * vel[i] + vel[i + 1] * vel[i + 1];
      if (sp2 > VMAX * VMAX) {
        const sc = VMAX / Math.sqrt(sp2);
        vel[i] *= sc;
        vel[i + 1] *= sc;
      }
      // periodic boundaries: water exiting one edge re-enters the
      // opposite edge with velocity intact. Every reflector variant we
      // tried (mirror, scattered re-entry, pressure walls) fed a rim the
      // pressure could not drain; wrapping has no boundary at all, so a
      // uniform layer is its equilibrium. Water speckle is homogeneous -
      // the wrap is invisible. Fish are homed and never reach this code.
      if (x < 0 || x > W) pos[i] = ((x % W) + W) % W;
      if (y < 0 || y > H) pos[i + 1] = ((y % H) + H) % H;
    }

    const fishes = ctx.fishes;
    for (let fi = 0; fi < fishes.length; fi++) {
      const f = fishes[fi];
      if (!f.active) continue;
      const sx = f.sx, sy = f.sy;
      for (let k = 0; k < f.S; k++) {
        sx[k] -= gather(hgx, gwb, ghb, cellB, sx[k], sy[k]) * FISH_PUSH * dtf;
        sy[k] -= gather(hgy, gwb, ghb, cellB, sx[k], sy[k]) * FISH_PUSH * dtf;
      }
    }
  };

  // gaussian stamp into h; cell loops clamp to [1, gw-2] so the pinned
  // border ring can never be written
  const stamp = (x, y, amp, sig) => {
    const s = sig * cellB, r2 = 9 * s * s, inv = 0.5 / (s * s);
    const cx = x / cellB - 0.5, cy = y / cellB - 0.5;
    let x0 = Math.ceil(cx - 3 * sig), x1 = Math.floor(cx + 3 * sig);
    let y0 = Math.ceil(cy - 3 * sig), y1 = Math.floor(cy + 3 * sig);
    if (x0 < 1) x0 = 1;
    if (x1 > gwb - 2) x1 = gwb - 2;
    if (y0 < 1) y0 = 1;
    if (y1 > ghb - 2) y1 = ghb - 2;
    for (let yy = y0; yy <= y1; yy++) {
      const dy = (yy - cy) * cellB;
      const row = yy * gwb;
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx - cx) * cellB;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        h[row + xx] += amp * Math.exp(-d2 * inv);
      }
    }
  };

  // annular stamp into h - a raised rim at radius r0 (px) around (x, y)
  const ringStamp = (x, y, r0, amp, sig) => {
    const s = sig * cellB, inv = 0.5 / (s * s);
    const cx = x / cellB - 0.5, cy = y / cellB - 0.5;
    const ro = (r0 + 3 * s) / cellB;
    let x0 = Math.ceil(cx - ro), x1 = Math.floor(cx + ro);
    let y0 = Math.ceil(cy - ro), y1 = Math.floor(cy + ro);
    if (x0 < 1) x0 = 1;
    if (x1 > gwb - 2) x1 = gwb - 2;
    if (y0 < 1) y0 = 1;
    if (y1 > ghb - 2) y1 = ghb - 2;
    for (let yy = y0; yy <= y1; yy++) {
      const dy = (yy - cy) * cellB;
      const row = yy * gwb;
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx - cx) * cellB;
        const d = Math.sqrt(dx * dx + dy * dy) - r0;
        if (d * d > 9 * s * s) continue;
        h[row + xx] += amp * Math.exp(-d * d * inv);
      }
    }
  };

  // a food plip: just the crest ring. A pit or slap leaves a trailing
  // trough that z-dips every particle the front sweeps - reads as a big
  // dark disc, heavy for one pellet.
  const tap = (x, y) => ringStamp(x, y, TAP_R0 * u, TAP_RING * u, TAP_RSIG);

  const trench = (x0, y0, x1, y1, segV) => {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1 || !gwa) return;
    const dirx = dx / len, diry = dy / len;
    const vc = Math.min(segV, JET_MAX * u);
    const depth = TRENCH_D * u * Math.min(1, segV / (TRENCH_SPD * u));
    const jx = dirx * JET_C * vc, jy = diry * JET_C * vc;
    const steps = Math.min(16, Math.ceil(len / cellB));
    const aMaxX = gwa - 1.001, aMaxY = gha - 1.001;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const sx = x0 + dx * t, sy = y0 + dy * t;
      stamp(sx, sy, -depth, TRENCH_SIG);
      let gx = sx / cellA - 0.5, gy = sy / cellA - 0.5;
      if (gx < 0) gx = 0;
      else if (gx > aMaxX) gx = aMaxX;
      if (gy < 0) gy = 0;
      else if (gy > aMaxY) gy = aMaxY;
      const ix = gx | 0, iy = gy | 0;
      const tx = gx - ix, ty = gy - iy;
      const c = iy * gwa + ix;
      const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty);
      const w2 = (1 - tx) * ty, w3 = tx * ty;
      jetx[c] += jx * w0; jety[c] += jy * w0;
      jetx[c + 1] += jx * w1; jety[c + 1] += jy * w1;
      jetx[c + gwa] += jx * w2; jety[c + gwa] += jy * w2;
      jetx[c + gwa + 1] += jx * w3; jety[c + gwa + 1] += jy * w3;
    }
  };

  const swirl = (x, y, dtf) => {
    const r = SWIRL_R * u, r2 = r * r, imp = SWIRL * dtf;
    for (let p = 0; p < N; p++) {
      if (homed[p] || capt[p]) continue;
      const i = p * 3;
      const dx = pos[i] - x, dy = pos[i + 1] - y;
      if (dx > r || dx < -r || dy > r || dy < -r) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1e-4) continue;
      const d = Math.sqrt(d2), k = (1 - d / r) * imp;
      vel[i] += (-dy / d) * k;
      vel[i + 1] += (dx / d) * k;
    }
    // rotating dipole textures the surface; the signs alternate as it turns
    const a = field.T * 2.6, off = 0.3 * r;
    const ox = Math.cos(a) * off, oy = Math.sin(a) * off;
    const dip = SWIRL_DIP * u * dtf;
    stamp(x + ox, y + oy, dip, GAUSS_SIG);
    stamp(x - ox, y - oy, -dip, GAUSS_SIG);
  };

  const dimple = (x, y, amp) => {
    if (amp <= 0.01 || !gwb) return;
    const s = GAUSS_SIG * cellB, r2 = 9 * s * s, inv = 0.5 / (s * s);
    const kk = Math.min(1, DIMPLE_K * dtfNow);
    const depth = DIMPLE_A * u * amp;
    const cx = x / cellB - 0.5, cy = y / cellB - 0.5;
    let x0 = Math.ceil(cx - 3 * GAUSS_SIG), x1 = Math.floor(cx + 3 * GAUSS_SIG);
    let y0 = Math.ceil(cy - 3 * GAUSS_SIG), y1 = Math.floor(cy + 3 * GAUSS_SIG);
    if (x0 < 1) x0 = 1;
    if (x1 > gwb - 2) x1 = gwb - 2;
    if (y0 < 1) y0 = 1;
    if (y1 > ghb - 2) y1 = ghb - 2;
    for (let yy = y0; yy <= y1; yy++) {
      const dy = (yy - cy) * cellB;
      const row = yy * gwb;
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx - cx) * cellB;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const c = row + xx;
        const env = -depth * Math.exp(-d2 * inv);
        h[c] += (env - h[c]) * kk;
        hv[c] *= 1 - kk; // damp outgoing waves or they empty the pit
      }
    }
  };

  const api = { step, layout, tap, trench, swirl, dimple, h, gw: 0, gh: 0 };
  return api;
}
