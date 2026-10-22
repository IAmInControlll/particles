// core.js - engine constants, palette, config, seeded PRNG, helpers.
export const params = new URLSearchParams(location.search);

export let reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const setReduce = (v) => (reduce = !!v);
export const isMobile = () => innerWidth < 1024;
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const STILL_T = 6;
export const stillT = (fn) => fn.stillT ?? fn.arriveT ?? STILL_T;

export const PAL = {
  ink: [0.85, 0.9, 0.95],
  mist: [0.5, 0.62, 0.75],
  sky: [0.35, 0.55, 0.95],
  accent: [0.4, 0.95, 0.7],
  dim: [0.22, 0.3, 0.42],
  hot: [1.0, 0.97, 0.85],
};

// uniform index into a point list: full coverage when len > n,
// even duplication when len < n. Never use list[i % list.length].
export const pick = (list, i, n, len = list.length) => list[(i * len / n) | 0];

// rasterize text into design-space points (y up). Adaptive stride keeps
// pts.length <= maxPoints so N particles cover the whole word.
export const textPoints = (text, { font = "600 160px system-ui, 'Segoe UI', sans-serif", pad = 40, h = 240, norm = h / 3, maxPoints = 1e9 } = {}) => {
  const mctx = document.createElement("canvas").getContext("2d");
  mctx.font = font;
  const tw = Math.max(64, Math.ceil(mctx.measureText(text).width) + pad * 2);
  const cv = document.createElement("canvas");
  cv.width = tw;
  cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, tw / 2, h / 2);
  const img = ctx.getImageData(0, 0, tw, h).data;
  let stride = 1, pts = [];
  for (; stride <= 12; stride++) {
    pts = [];
    for (let y = 0; y < h; y += stride)
      for (let x = 0; x < tw; x += stride)
        if (img[(y * tw + x) * 4 + 3] > 128)
          pts.push([(x - tw / 2) / norm, (h / 2 - y) / norm]);
    if (pts.length <= maxPoints) break;
  }
  return pts.length ? { pts, ext: [tw / norm, h / norm] } : null;
};

let seed = 7;
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const reseed = (s = 7) => (seed = s | 0 || 7);

export const CFG = {
  unitDiv: 8,
  dtMax: 0.05,
  timeScale: 1,

  pointScale: 0.006,
  pointMaxH: 1100,
  pointMinPx: 1.5,
  maxDPR: 2,
  perspZ: 9,
  perspMin: 2,
  depthFade: 0.55,
  coreGain: 0.55,
  twinkle: 0.12,
  twinkleRate: 1.8,
  heatGain: 1.2,
  heatMax: 0.8,
  colVar: 0.08,
  bg: [8, 12, 20],
  additive: true,

  reserveEvery: 0, // ambient drifters are opt-in per page
  leaderChance: 0.03,
  leaderBoost: 1.3,
  bigChance: 0.03,
  bigBoost: 1.4,
  sizeMin: 0.6,
  sizeVar: 0.9,
  stagMin: 0.2,
  stagVar: 0.8,
  spawnSpread: 1.2,

  spring: 0.028,
  springLeader: 0.05,
  springCapture: 0.25,
  dampHome: 0.87,
  dampFree: 0.97,
  neighborR: 0.11,
  sepR: 0.02,
  maxNeighbors: 8,
  cohesion: 0.03,
  align: 0.08,
  separation: 0.2,
  cellSize: 0.11,

  flowAmp: 0.0025,
  flowFreq: 0.9,
  flowT1: 0.4,
  flowT2: 0.3,
  flowHarm: 0.5,
  flowFreq2: 2.3,
  flowT3: 0.55,
  driftPull: 0.0012,
  zReturn: 0.05,

  repelBase: 0.45,
  repelSpeedGain: 7,
  repelSpeedMax: 1.3,
  repelAmp: 0.09,
  repelSwirl: 1.2,
  repelZ: 0.5,
  pullR: 2.4,
  pullAmp: 0.03,
  pullSwirl: 0.8,
  pullDelay: 0,
  touchPull: false,
  captureR: 0.32,
  orbRMin: 0.12,
  orbRVar: 0.85,
  horizonR: 0.035,
  orbSink: 0.009,
  orbKepler: 1.5,
  orbSpeedMax: 14,
  discTilt: 0.55,
  horizonGlow: 0.3,
  fling: 0.5,
  flingRand: 2,
  mouseVelCap: 200,
  mouseSpeedEase: 0.2,
  colorLerp: 0.12,
  sizeEase: 0.1,
  scrollCouple: 1,

  exPush: 0.1,
  exBase: 0.06,
  exDist: 0.004,

  transSpeed: 1.6,
  transStagger: 0.6,
  leaderBrighten: 1.25,
  directorDur: 1.8,
};

// shader source literal formatter
export const F = (n) => Number(n).toFixed(4);
