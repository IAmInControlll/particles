// sampler.js - webcam capture + pixel->point decode into a flat store.
// Engine-free: no src/engine imports; shaped to promote to src/lib later.
// Sole writer of the store's buf/count.
export const PT = { X: 0, Y: 1, SHADE: 2, EDGE: 3, STRIDE: 4 };

const THRESH = 20; // deviation-from-mean luminance that counts as figure
const EDGE_T = 60; // Sobel magnitude that counts as edge

export function createSampler({ mode = "lum", mirror = true } = {}) {
  const fill = mode === "edges" ? fillEdges : fillLum;
  let stream = null, video = null, ctx = null, W = 0, H = 0;
  let lum = null, grad = null;

  const S = { open, read, setPaused, video: null, W: 0, H: 0, onEnded: null };

  async function open() {
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, facingMode: "user" },
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
    S.video = video; // exposed so pages can show a local preview
    W = 160;
    H = Math.max(90, Math.min(160, Math.round((160 * video.videoHeight) / video.videoWidth)));
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    ctx = cv.getContext("2d", { willReadFrequently: true });
    if (mirror) ctx.setTransform(-1, 0, 0, 1, W, 0);
    lum = new Float32Array(W * H);
    grad = mode === "edges" ? new Float32Array(W * H) : null;
    S.W = W;
    S.H = H;
    stream.getVideoTracks()[0].onended = () => S.onEnded && S.onEnded();
  }

  function read(store) {
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0, n = W * H; i < n; i++) {
      const o = i * 4;
      lum[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
    }
    const prev = store.count;
    store.count = 0;
    fill(store);
    if (!store.count) {
      store.count = prev; // empty frame keeps the last silhouette
      return false;
    }
    return true;
  }

  function setPaused(v) {
    if (!video) return;
    if (v) video.pause();
    else video.play().catch(() => {});
  }

  // stride bounds candidates to <= cap by construction: WH/s^2 <= cap
  const strideOf = (store) => Math.max(1, Math.ceil(Math.sqrt((W * H) / store.cap)));

  const put = (store, px, py, L, e) => {
    if (store.count >= store.cap) return;
    const o = store.count * PT.STRIDE;
    store.buf[o + PT.X] = (px / W - 0.5) * (W / H);
    store.buf[o + PT.Y] = 0.5 - py / H;
    store.buf[o + PT.SHADE] = L / 255;
    store.buf[o + PT.EDGE] = e;
    store.count++;
  };

  function fillLum(store) {
    const s = strideOf(store);
    let mean = 0;
    for (let i = 0, n = W * H; i < n; i++) mean += lum[i];
    mean /= W * H;
    for (let y = 0; y < H; y += s)
      for (let x = 0; x < W; x += s) {
        const L = lum[y * W + x];
        if (Math.abs(L - mean) > THRESH) put(store, x, y, L, 0);
      }
  }

  function fillEdges(store) {
    const s = strideOf(store);
    let mean = 0;
    for (let i = 0, n = W * H; i < n; i++) mean += lum[i];
    mean /= W * H;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1]
                 - lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1];
        const gy = lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1]
                 - lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1];
        grad[i] = Math.abs(gx) + Math.abs(gy);
      }
    const s2 = s * 2;
    for (let y = 0; y < H; y += s)
      for (let x = 0; x < W; x += s) {
        const i = y * W + x;
        if (grad[i] > EDGE_T) put(store, x, y, lum[i], 1);
        else if (!(x % s2) && !(y % s2) && Math.abs(lum[i] - mean) > THRESH) put(store, x, y, lum[i], 0);
      }
  }

  return S;
}
