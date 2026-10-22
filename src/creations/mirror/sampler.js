// sampler.js - webcam capture + pixel->point decode into a flat store.
// Engine-free: no src/engine imports; shaped to promote to src/lib later.
// Sole writer of the store's buf/count/cellT.
export const PT = { X: 0, Y: 1, SHADE: 2, EDGE: 3, R: 4, G: 5, B: 6, STRIDE: 7 };

const THRESH = 30; // RGB distance from the border background that counts as figure
const EDGE_T = 60; // Sobel magnitude that counts as edge
const INF = 30000;

export function createSampler({ mode = "lum", mirror = true } = {}) {
  const S = { mode, open, read, setPaused, W: 0, H: 0, onEnded: null };
  // `fill` reads S.mode at call time so the page can flip lum/edges live
  const fill = (store, s, cw, t2, lo2) =>
    (S.mode === "edges" ? fillEdges : fillLum)(store, s, cw, t2, lo2);
  let stream = null, video = null, ctx = null, W = 0, H = 0;
  let lum = null, blur = null, grad = null, hit = null, hitE = null;
  let cr = null, cg = null, cb = null;
  // cell-grid maps: emit cell -> buf slot, then cell -> nearest emit cell.
  // The scene maps particles to FIXED cell stations, so a stable image
  // holds stable targets - no swarm-wide retarget when count wobbles.
  let emitIdx = new Int32Array(0), near = new Int32Array(0), dist = new Uint16Array(0);
  let mask2 = new Uint8Array(0);
  let bgR = 0, bgG = 0, bgB = 0;
  // silhouette fill: mask = emitted cells, dil = dilated mask (gap close),
  // ext = exterior flood region on the dilated mask, stack for the flood
  let mask = new Uint8Array(0), dil = new Uint8Array(0), ext = new Uint8Array(0), stack = new Int32Array(0);

  async function open() {
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = await navigator.mediaDevices.getUserMedia({
      // ideal, not required: virtual cams (phone bridges, OBS, DroidCam)
      // report no facing mode, and exact width would OverconstrainedError
      video: { width: { ideal: 640 }, facingMode: { ideal: "user" } },
      audio: false,
    });
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    await new Promise((res) => {
      if (video.videoWidth) res();
      else video.onloadedmetadata = () => res();
    });
    await video.play();
    // longest side 280, aspect preserved - portrait cams don't squash
    const g = 280 / Math.max(video.videoWidth, video.videoHeight);
    W = Math.max(32, Math.round(video.videoWidth * g));
    H = Math.max(32, Math.round(video.videoHeight * g));
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    ctx = cv.getContext("2d", { willReadFrequently: true });
    if (mirror) ctx.setTransform(-1, 0, 0, 1, W, 0);
    lum = new Float32Array(W * H);
    blur = new Float32Array(W * H);
    grad = new Float32Array(W * H); // edges-mode buffers; ~215KB always-on so the mode key can flip live
    hit = new Uint8Array(W * H);
    hitE = new Uint8Array(W * H);
    cr = new Float32Array(W * H);
    cg = new Float32Array(W * H);
    cb = new Float32Array(W * H);
    S.W = W;
    S.H = H;
    stream.getVideoTracks()[0].onended = () => S.onEnded && S.onEnded();
  }

  function read(store) {
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const n = W * H;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const L = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
      lum[i] += (L - lum[i]) * 0.5; // temporal blend kills per-sample flicker
      cr[i] += (d[o] - cr[i]) * 0.5;
      cg[i] += (d[o + 1] - cg[i]) * 0.5;
      cb[i] += (d[o + 2] - cb[i]) * 0.5;
    }
    // 3x3 box blur into blur[] - speckle noise can't scatter the figure
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        const y0 = Math.max(0, y - 1), y1 = Math.min(H - 1, y + 1);
        const x0 = Math.max(0, x - 1), x1 = Math.min(W - 1, x + 1);
        for (let yy = y0; yy <= y1; yy++)
          for (let xx = x0; xx <= x1; xx++) { s += lum[yy * W + xx]; c++; }
        blur[y * W + x] = s / c;
      }
    }
    const s = strideOf(store);
    const cw = Math.ceil(W / s), ch = Math.ceil(H / s), cells = cw * ch;
    if (emitIdx.length !== cells) {
      emitIdx = new Int32Array(cells);
      near = new Int32Array(cells);
      dist = new Uint16Array(cells);
      store.cellT = new Int32Array(cells);
      mask = new Uint8Array(cells);
      dil = new Uint8Array(cells);
      ext = new Uint8Array(cells);
      stack = new Int32Array(cells);
      mask2 = new Uint8Array(cells);
    }
    emitIdx.fill(-1);
    const prev = store.count;
    store.count = 0;
    const [bR, bG, bB, std] = borderStats();
    bgR = bR; bgG = bG; bgB = bB;
    const t = THRESH + std * 1.5, lo = t * 0.6;
    fill(store, s, cw, t * t, lo * lo);
    fillInterior(store, s, cw, ch, t * 0.35);
    if (!store.count) {
      store.count = prev; // empty frame keeps the last silhouette
      return false;
    }
    chamfer(store.cellT, cw, ch, cells);
    for (let c = 0; c < cells; c++) mask2[c] = emitIdx[c] >= 0 ? 1 : 0;
    store.cellEmit = mask2;
    store.cells = cells;
    store.stride = s;
    return true;
  }

  // silhouette fill: close small gaps in the emit mask (2-cell dilation),
  // flood the exterior from the borders, and emit enclosed holes ONLY
  // where the hole's own color still deviates past a low bar. Without
  // the dev check, a room edge loop floods the whole enclosed backdrop.
  function fillInterior(store, s, cw, ch, loT) {
    const cells = cw * ch;
    for (let c = 0; c < cells; c++) mask[c] = emitIdx[c] >= 0 ? 1 : 0;
    // dilate twice: src -> dst via 8-neighborhood OR
    for (let it = 0; it < 2; it++) {
      const src = it === 0 ? mask : dil, dst = it === 0 ? dil : mask;
      dst.fill(0);
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const c = y * cw + x;
          if (!src[c]) continue;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < cw && ny >= 0 && ny < ch) dst[ny * cw + nx] = 1;
            }
        }
    }
    // mask now holds the 2x-dilated emit region; flood exterior over it
    ext.fill(0);
    let sp = 0;
    const push = (c) => { if (!ext[c] && !mask[c]) { ext[c] = 1; stack[sp++] = c; } };
    for (let x = 0; x < cw; x++) { push(x); push((ch - 1) * cw + x); }
    for (let y = 0; y < ch; y++) { push(y * cw); push(y * cw + cw - 1); }
    while (sp) {
      const c = stack[--sp];
      const x = c % cw, y = (c / cw) | 0;
      if (x > 0) push(c - 1);
      if (x < cw - 1) push(c + 1);
      if (y > 0) push(c - cw);
      if (y < ch - 1) push(c + cw);
    }
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const c = y * cw + x;
        if (mask[c] || ext[c]) continue;
        const i = y * s * W + x * s;
        const dr = cr[i] - bgR, dg = cg[i] - bgG, db = cb[i] - bgB;
        if (dr * dr + dg * dg + db * db < loT * loT) continue; // bg-colored hole
        emit(store, s, cw, x * s, y * s, i, 0);
      }
  }

  // two-pass chamfer: every cell learns the buf slot of its nearest
  // emitted point. Particles stationed over background settle on the
  // figure's nearest edge - short local flights, dense contours.
  function chamfer(cellT, cw, ch, cells) {
    for (let c = 0; c < cells; c++) {
      if (emitIdx[c] >= 0) { dist[c] = 0; near[c] = c; }
      else { dist[c] = INF; near[c] = -1; }
    }
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const c = y * cw + x;
        if (!dist[c]) continue;
        let best = dist[c], bi = near[c];
        if (x > 0 && dist[c - 1] + 1 < best) { best = dist[c - 1] + 1; bi = near[c - 1]; }
        if (y > 0) {
          if (dist[c - cw] + 1 < best) { best = dist[c - cw] + 1; bi = near[c - cw]; }
          if (x > 0 && dist[c - cw - 1] + 2 < best) { best = dist[c - cw - 1] + 2; bi = near[c - cw - 1]; }
          if (x < cw - 1 && dist[c - cw + 1] + 2 < best) { best = dist[c - cw + 1] + 2; bi = near[c - cw + 1]; }
        }
        dist[c] = best; near[c] = bi;
      }
    for (let y = ch - 1; y >= 0; y--)
      for (let x = cw - 1; x >= 0; x--) {
        const c = y * cw + x;
        if (!dist[c]) continue;
        let best = dist[c], bi = near[c];
        if (x < cw - 1 && dist[c + 1] + 1 < best) { best = dist[c + 1] + 1; bi = near[c + 1]; }
        if (y < ch - 1) {
          if (dist[c + cw] + 1 < best) { best = dist[c + cw] + 1; bi = near[c + cw]; }
          if (x < cw - 1 && dist[c + cw + 1] + 2 < best) { best = dist[c + cw + 1] + 2; bi = near[c + cw + 1]; }
          if (x > 0 && dist[c + cw - 1] + 2 < best) { best = dist[c + cw - 1] + 2; bi = near[c + cw - 1]; }
        }
        dist[c] = best; near[c] = bi;
      }
    for (let c = 0; c < cells; c++) cellT[c] = near[c] >= 0 ? emitIdx[near[c]] : -1;
  }

  function setPaused(v) {
    if (!video) return;
    if (v) video.pause();
    else video.play().catch(() => {});
  }

  // stride bounds candidates to <= cap by construction: WH/s^2 <= cap.
  // Cap is 4N, so stride 1 (per-pixel emit) usually fits whole-frame.
  const strideOf = (store) => Math.max(1, Math.ceil(Math.sqrt((W * H) / store.cap)));

  const put = (store, px, py, i, e) => {
    if (store.count >= store.cap) return -1;
    const o = store.count * PT.STRIDE;
    store.buf[o + PT.X] = (px / W - 0.5) * (W / H);
    store.buf[o + PT.Y] = 0.5 - py / H;
    store.buf[o + PT.SHADE] = blur[i] / 255;
    store.buf[o + PT.EDGE] = e;
    store.buf[o + PT.R] = cr[i] / 255;
    store.buf[o + PT.G] = cg[i] / 255;
    store.buf[o + PT.B] = cb[i] / 255;
    store.count++;
    return o;
  };

  // emit at pixel index i (cell position x,y), recording the buf slot
  // under its cell index so chamfer can point neighboring cells at it
  const emit = (store, s, cw, x, y, i, e) => {
    const o = put(store, x, y, i, e);
    if (o >= 0) emitIdx[((y / s) | 0) * cw + ((x / s) | 0)] = o;
  };

  // background estimate from the frame's outer ring - the figure sits
  // centered, so the border is mostly backdrop. Returns the mean RGB so
  // segmentation separates by COLOR (skin vs gray wall differs even at
  // equal brightness), plus luminance std for the noise-adaptive floor.
  const borderStats = () => {
    const bw = Math.max(1, (W * 0.06) | 0), bh = Math.max(1, (H * 0.06) | 0);
    let mr = 0, mg = 0, mb = 0, ml = 0, m2 = 0, c = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (x >= bw && x < W - bw && y >= bh && y < H - bh) continue;
        const i = y * W + x;
        const L = blur[i];
        ml += L; m2 += L * L;
        mr += cr[i]; mg += cg[i]; mb += cb[i];
        c++;
      }
    return [mr / c, mg / c, mb / c, Math.sqrt(Math.max(0, m2 / c - (ml / c) * (ml / c)))];
  };

  // hysteresis: a pixel joins the figure on a strong deviation and only
  // leaves when it reads clearly as backdrop again. Boundary pixels can't
  // flicker in/out per sample, so a still image holds a still silhouette.
  function fillLum(store, s, cw, t2, lo2) {
    for (let y = 0; y < H; y += s)
      for (let x = 0; x < W; x += s) {
        const i = y * W + x;
        const dr = cr[i] - bgR, dg = cg[i] - bgG, db = cb[i] - bgB;
        const dev = dr * dr + dg * dg + db * db;
        if (dev > t2) hit[i] = 1;
        else if (dev < lo2) hit[i] = 0;
        if (hit[i]) emit(store, s, cw, x, y, i, 0);
      }
  }

  function fillEdges(store, s, cw, t2, lo2) {
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = blur[i - W + 1] + 2 * blur[i + 1] + blur[i + W + 1]
                 - blur[i - W - 1] - 2 * blur[i - 1] - blur[i + W - 1];
        const gy = blur[i + W - 1] + 2 * blur[i + W] + blur[i + W + 1]
                 - blur[i - W - 1] - 2 * blur[i - W] - blur[i - W + 1];
        grad[i] = Math.abs(gx) + Math.abs(gy);
      }
    const s2 = s * 2, eLo = EDGE_T * 0.6;
    for (let y = 0; y < H; y += s)
      for (let x = 0; x < W; x += s) {
        const i = y * W + x;
        const g = grad[i];
        if (g > EDGE_T) hitE[i] = 1;
        else if (g < eLo) hitE[i] = 0;
        if (hitE[i]) { emit(store, s, cw, x, y, i, 1); continue; }
        if (!(x % s2) && !(y % s2)) {
          const dr = cr[i] - bgR, dg = cg[i] - bgG, db = cb[i] - bgB;
          const dev = dr * dr + dg * dg + db * db;
          if (dev > t2) hit[i] = 1;
          else if (dev < lo2) hit[i] = 0;
          if (hit[i]) emit(store, s, cw, x, y, i, 0);
        }
      }
  }

  return S;
}
