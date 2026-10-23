// arena.js - the whole pit, drawn in particles. A layer table, back to
// front, splits the scenery slice: stars, moon, clouds, far ridge, hills
// with cypresses, the ruined colosseum wall, broken columns, crowd tiers,
// parapet, torches with live flame and embers, grass. The ground is its
// own slice above the fighters in draw order, so debris that sinks under
// the floor line vanishes into it. Opaque particles (solid 1) tile on a
// hex grid sized per layer to its particle share, so a silhouette stays
// solid at any budget; glow particles (solid 0) are the light.
import { PF } from "../../engine/index.js";

const TAU = Math.PI * 2;

// deterministic hash -> stable silhouettes across relayouts
const hash = (i, s) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.55;
  return x - Math.floor(x);
};
// smooth 1D value noise, two octaves
const vnoise = (x, s) => {
  const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f);
  return hash(i, s) * (1 - t) + hash(i + 1, s) * t;
};
const fbm = (x, s) => vnoise(x, s) * 0.68 + vnoise(x * 2.7, s + 9) * 0.32;

const CLOTH = [
  [0.3, 0.12, 0.1], [0.13, 0.16, 0.27], [0.28, 0.22, 0.13], [0.13, 0.2, 0.15],
  [0.2, 0.2, 0.22], [0.25, 0.14, 0.22], [0.17, 0.13, 0.1], [0.12, 0.11, 0.12],
];
const SKIN = [[0.4, 0.27, 0.19], [0.27, 0.17, 0.12], [0.46, 0.33, 0.24]];
const HAIR = [[0.05, 0.04, 0.035], [0.16, 0.1, 0.05], [0.1, 0.08, 0.07], [0.3, 0.28, 0.26]];

export function createArena(field, opts) {
  const { lo, hi, groundLo, groundHi } = opts;
  const N = field.N;
  const home = field.home, hcol = field.hcol, size = field.size, solid = field.solid;
  const CFG = PF.CFG;

  // per-particle rest pose for animated layers
  const ax = new Float32Array(N), ay = new Float32Array(N), aph = new Float32Array(N);
  const el = new Int32Array(N);
  // layout scratch: grid points of the fill being placed
  const gx = new Float32Array(N), gy = new Float32Array(N);
  const ge = new Int32Array(N);
  const C = [0, 0, 0];

  const S = { W: 1, H: 1, F: 1, wl: 0, wr: 1, span: 1, u: 1, ring: false, torches: [], excite: 0 };

  // css px per unit of field.size; everything sits at z = 0 (no perspective)
  const pxs = () => CFG.pointScale * Math.min(innerHeight, CFG.pointMaxH);
  // the engine's depth fade at z = 0, halfway up its ramp
  const fade0 = () => CFG.depthFade + (1 - CFG.depthFade) * 0.5;

  // solid colours are authored as seen: undo the engine's depth fade and
  // per-particle colour jitter so silhouettes read flat, not speckled
  function paint(p, r, g, b, isSolid) {
    const i = p * 3;
    const k = isSolid ? 1 / (fade0() * (1 + (field.h3(p) * 6.283 - 3.14159) * CFG.colVar)) : 1;
    hcol[i] = r * k;
    hcol[i + 1] = g * k;
    hcol[i + 2] = b * k;
  }
  function put(p, x, y, px, isSolid) {
    const i = p * 3;
    home[i] = x;
    home[i + 1] = y;
    home[i + 2] = 0;
    ax[p] = x;
    ay[p] = y;
    size[p] = px / pxs();
    solid[p] = isSolid ? 1 : 0;
    field.homed[p] = 1;
    field.noFlock[p] = 1;
    field.noWell[p] = 1;
    field.leader[p] = 0;
  }
  const hide = (p) => {
    put(p, field.pos[p * 3], field.pos[p * 3 + 1], 0, 0);
    paint(p, 0, 0, 0, 0);
  };

  // warm light falloff from the braziers, for baked lighting on stone
  function warm(x, y) {
    let w = 0;
    const R2 = (0.6 * S.u) ** 2;
    for (const t of S.torches) {
      const dx = x - t, dy = y - (S.F - 0.95 * S.u);
      w += Math.exp(-(dx * dx + dy * dy) / R2);
    }
    return Math.min(1, w);
  }
  const lit = (c, x, y, amt) => {
    const w = warm(x, y) * amt;
    C[0] = c[0] + w * 0.3;
    C[1] = c[1] + w * 0.14;
    C[2] = c[2] + w * 0.03;
  };

  // ---------------- geometry (px, y down) ----------------
  const farTop = (x) => S.F - S.u * (2.0 + 0.95 * fbm(x / (1.7 * S.u), 3));
  // the colosseum's outer arcade rises behind the top tier of seats
  const ARC_BASE = 1.2, ARC_SPRING = 1.52, ARC_HW = 0.12;
  const BLOCK = () => 0.42 * S.u;
  const wallTop = (x) => {
    const b = Math.floor(x / BLOCK());
    const r = hash(b, 13);
    const jag = (hash(Math.floor(x / (0.07 * S.u)), 17) - 0.5) * 0.05 * S.u;
    if (r < 0.18) return S.F - (ARC_BASE + 0.05) * S.u + jag * 2;
    if (r < 0.42) return S.F - ARC_SPRING * S.u + jag;
    return S.F - 1.86 * S.u + jag * 0.4;
  };
  const nearArch = (x) => {
    const B = BLOCK();
    return Math.abs(x - (Math.floor(x / B) + 0.5) * B) < (ARC_HW + 0.04) * S.u;
  };
  const archOpen = (x, y) => {
    const B = BLOCK();
    const dx = x - (Math.floor(x / B) + 0.5) * B, hw = ARC_HW * S.u;
    if (Math.abs(dx) >= hw) return false;
    return y > S.F - ARC_SPRING * S.u - Math.sqrt(hw * hw - dx * dx) && y < S.F - (ARC_BASE + 0.04) * S.u;
  };
  // crowd tiers, k = 0 nearest the pit
  const crowdTiers = () => (S.ring ? 4 : 3);
  const tierBase = (k) => S.F - S.u * (S.ring ? 0.24 + k * 0.24 : 0.3 + k * 0.29);

  // ---------------- the layer table ----------------
  // kind fill:   solid hex-grid tiling of inside(); w weights its share
  // kind stroke: solid beads along segments [x0,y0,x1,y1,sag,thick,r,g,b]
  // kind dots:   share of the slice, placed by place(p, k, n)
  // mode limits a layer to the arena or the ring; tick animates [a,b)
  const LAYERS = [
    {
      key: "stars", kind: "dots", share: 0.045,
      place(p, k) {
        const x = field.h1(p) * S.W;
        const y = Math.pow(field.h2(p), 1.3) * (S.F - 1.8 * S.u);
        const big = hash(k, 2) > 0.94;
        put(p, x, y, (big ? 2.6 : 1.2) + hash(k, 3) * 1.4, 0);
        const lum = big ? 0.75 : 0.18 + hash(k, 4) * 0.35;
        aph[p] = lum;
        el[p] = hash(k, 6) > 0.85 ? 1 : 0; // a few warm stars
      },
      tick(T, dt, a, b) {
        for (let p = a; p < b; p++) {
          const m = aph[p] * (0.65 + 0.35 * Math.sin(T * (1.2 + field.h3(p) * 3) + field.h1(p) * 40));
          const w = el[p], i = p * 3;
          hcol[i] = m * (w ? 1 : 0.82);
          hcol[i + 1] = m * (w ? 0.85 : 0.9);
          hcol[i + 2] = m * (w ? 0.62 : 1);
        }
      },
    },
    {
      key: "halo", kind: "dots", count: () => 5,
      place(p, k, n) {
        const t = k / Math.max(1, n - 1);
        put(p, S.moon.x, S.moon.y, S.moon.r * (2.3 + t * 2.2), 0);
        const m = 0.1 * (1 - t * 0.5);
        paint(p, m * 0.8, m * 0.9, m * 1.15, 0);
      },
    },
    {
      key: "moon", kind: "fill", w: 4,
      box: () => [S.moon.x - S.moon.r, S.moon.y - S.moon.r, S.moon.x + S.moon.r, S.moon.y + S.moon.r],
      inside: (x, y) => ((x - S.moon.x) ** 2 + (y - S.moon.y) ** 2 < S.moon.r ** 2 ? 0 : -1),
      color(x, y) {
        const R = S.moon.r, dx = (x - S.moon.x) / R, dy = (y - S.moon.y) / R;
        let m = 1 - 0.22 * (dx * dx + dy * dy);
        // maria: a few soft dark seas
        for (const [cx, cy, cr] of [[-0.3, -0.2, 0.32], [0.25, 0.15, 0.26], [-0.05, 0.45, 0.2], [0.35, -0.4, 0.14]]) {
          const q = ((dx - cx) ** 2 + (dy - cy) ** 2) / (cr * cr);
          if (q < 1) m -= 0.17 * (1 - q);
        }
        C[0] = 0.9 * m; C[1] = 0.9 * m; C[2] = 0.82 * m;
      },
    },
    {
      key: "clouds", kind: "dots", share: 0.018,
      place(p, k, n) {
        const cl = k % 5;
        el[p] = cl;
        // a puff offset from the cloud centre; the centre drifts in tick
        const ox = (hash(p, 31) + hash(p, 32) - 1) * 1.3 * S.u;
        const oy = (hash(p, 33) + hash(p, 34) - 1) * 0.16 * S.u - Math.abs(ox) * 0.06;
        const cy = hash(cl, 35) * 3.5 * S.u + S.F - 4.9 * S.u;
        const x = S.cloudX(cl, 0) + ox, y = cy + oy;
        put(p, x, y, (0.22 + hash(p, 36) * 0.22) * S.u, 0);
        ax[p] = ox;
        ay[p] = oy;
        aph[p] = cy;
        const nearMoon = Math.exp(-((x - S.moon.x) ** 2 + (y - S.moon.y) ** 2) / (2.5 * S.u) ** 2);
        const m = 0.03 + 0.06 * nearMoon;
        paint(p, m * 0.85, m * 0.9, m * 1.1, 0);
      },
      tick(T, dt, a, b) {
        for (let p = a; p < b; p++) {
          const cl = el[p];
          const x = S.cloudX(cl, T);
          const i = p * 3;
          // a wrap would drag the cloud across the sky - teleport instead
          if (Math.abs(home[i] - (x + ax[p])) > S.u) field.snap[p] = 1;
          home[i] = x + ax[p];
          home[i + 1] = aph[p] + ay[p];
        }
      },
    },
    {
      key: "far", kind: "fill", w: 0.5,
      box: () => [0, S.F - 3.3 * S.u, S.W, S.F - (ARC_BASE - 0.05) * S.u],
      // only where it can show: above the arcade, in arches and breaches
      inside: (x, y) => (y > farTop(x) && (y < wallTop(x) + 0.12 * S.u || nearArch(x)) ? 0 : -1),
      color(x, y) {
        const t = Math.min(1, (y - farTop(x)) / (0.3 * S.u));
        const rim = (1 - t) * (0.025 + 0.05 * Math.exp(-(((x - S.moon.x) / (3 * S.u)) ** 2)));
        C[0] = 0.03 + rim; C[1] = 0.045 + rim; C[2] = 0.08 + rim * 1.3;
      },
    },
    {
      // cypress spires along the ridge line, three tapering strokes each
      key: "cypress", kind: "stroke", gap: 0.5, cap: 0.05,
      strokes(push) {
        const pitch = 0.6 * S.u;
        for (let c = 0; c * pitch < S.W + pitch; c++) {
          if (hash(c, 41) < 0.5) continue;
          const x = c * pitch + (hash(c, 43) - 0.5) * 0.3 * pitch;
          const b = farTop(x) + 0.04 * S.u, h = (0.3 + hash(c, 47) * 0.4) * S.u;
          push(x, b, x, b - 0.45 * h, 0, 0.1 * S.u, 0.025, 0.042, 0.05);
          push(x, b - 0.35 * h, x, b - 0.75 * h, 0, 0.075 * S.u, 0.025, 0.042, 0.05);
          push(x, b - 0.7 * h, x, b - h, 0, 0.04 * S.u, 0.025, 0.042, 0.05);
        }
      },
    },
    {
      key: "arcade", kind: "fill", w: 2,
      box: () => [0, S.F - 1.95 * S.u, S.W, S.F - ARC_BASE * S.u],
      inside: (x, y) => (y > wallTop(x) && !archOpen(x, y) ? 0 : -1),
      color(x, y) {
        const B = BLOCK();
        const course = (y - S.F) / (0.11 * S.u);
        const joint = course - Math.floor(course) < 0.18 ? 0.75 : 1;
        const pil = Math.abs((((x / B) % 1) + 1) % 1 - 0.5) > 0.38 ? 1.15 : 1;
        const age = 0.85 + hash(Math.floor(x / (0.1 * S.u)) + Math.floor(course) * 97, 19) * 0.3;
        // moonlight catches the broken top edge
        const rim = y - wallTop(x) < 0.05 * S.u ? 1.5 : 1;
        const m = joint * pil * age * rim;
        C[0] = 0.13 * m; C[1] = 0.135 * m; C[2] = 0.16 * m;
      },
    },
    {
      // broken columns: a shaft, a shadowed flank, a moonlit edge, and a
      // capital on the ones still whole
      key: "columns", kind: "stroke", mode: "arena", gap: 0.5, cap: 0.14,
      strokes(push) {
        const u = S.u, bot = S.F - 0.75 * u;
        for (let c = 0; c < S.columns.length; c++) {
          const x = S.columns[c];
          const top = S.F - (1.95 + hash(c, 23) * 0.75) * u;
          lit([0.2, 0.19, 0.19], x, S.F - 1.1 * u, 0.5);
          push(x, bot, x, top, 0, 0.15 * u, C[0], C[1], C[2]);
          push(x - 0.04 * u, bot, x - 0.04 * u, top + 0.03 * u, 0, 0.07 * u, C[0] * 0.6, C[1] * 0.6, C[2] * 0.62);
          push(x + 0.045 * u, bot, x + 0.045 * u, top + 0.03 * u, 0, 0.045 * u, C[0] * 1.35, C[1] * 1.38, C[2] * 1.45);
          if (hash(c, 31) > 0.55) push(x - 0.11 * u, top, x + 0.11 * u, top, 0, 0.065 * u, C[0] * 1.1, C[1] * 1.1, C[2] * 1.12);
        }
      },
    },
    {
      key: "lamps", kind: "dots", share: 0.012, mode: "ring",
      place(p, k, n) {
        const L = 4, lamp = k % L, j = (k / L) | 0, m = Math.ceil(n / L);
        const x = S.wl + S.span * (0.12 + 0.76 * (lamp / (L - 1)));
        const y0 = S.F - 3.5 * S.u;
        el[p] = lamp;
        if (j < 5) {
          put(p, x + (j - 2) * 0.04 * S.u, y0, 0.1 * S.u, 0);
          paint(p, 0.9, 0.82, 0.6, 0);
        } else {
          // the cone: wider, dimmer discs falling toward the ring
          const t = (j - 5) / Math.max(1, m - 6);
          put(p, x, y0 + t * 2.4 * S.u, (0.25 + t * 1.6) * S.u, 0);
          const g = 0.035 * (1 - t * 0.7);
          paint(p, g, g * 0.9, g * 0.7, 0);
        }
      },
    },
    {
      // one sprite per body part: two shoulders, a belly, a head, then
      // hair or a raised fist. Back tier first so nearer tiers overlap it.
      key: "crowd", kind: "dots", share: 0.17,
      place(p, k, n) {
        const T = crowdTiers(), persons = (n / 5) | 0;
        const per = Math.max(1, Math.ceil(persons / T));
        const pi = (k / 5) | 0, part = k % 5;
        const tier = T - 1 - ((pi / per) | 0), c = pi % per;
        const id = pi + 1;
        if (pi >= persons || tier < 0 || hash(id, 3) < 0.08) return hide(p);
        const pitch = S.W / per;
        const sc = Math.min(1.35, Math.max(0.7, pitch / (0.19 * S.u))) * (1 - 0.07 * tier) * (S.ring ? 1.12 : 1);
        const u = S.u * sc;
        const px = (c + 0.5 + (hash(id, 5) - 0.5) * 0.4 + hash(tier, 91) * 0.5) * pitch;
        const hy = tierBase(tier) - 0.2 * u + (hash(id, 7) - 0.5) * 0.05 * u;
        const side = hash(id, 13) < 0.5 ? -1 : 1;
        const cloth = CLOTH[(hash(id, 8) * CLOTH.length) | 0];
        const skin = SKIN[(hash(id, 9) * SKIN.length) | 0];
        const fist = hash(id, 11) > 0.86;
        const dim = 0.48 * (1 - 0.17 * tier);
        let x = px, y = hy, s = 0.1 * u, col = skin;
        if (part < 2) { x = px + (part ? 1 : -1) * 0.04 * u; y = hy + 0.12 * u; s = 0.11 * u; col = cloth; }
        else if (part === 2) { y = hy + 0.22 * u; s = 0.14 * u; col = cloth; }
        else if (part === 4 && fist) { x = px + side * 0.075 * u; y = hy - 0.07 * u; s = 0.045 * u; }
        else if (part === 4) { y = hy - 0.022 * u; x = px - side * 0.008 * u; s = 0.082 * u; col = HAIR[(hash(id, 15) * HAIR.length) | 0]; }
        put(p, x, y, s, 1);
        el[p] = id;
        aph[p] = hash(id, 1) * TAU;
        lit([col[0] * dim, col[1] * dim, col[2] * dim], x, y, 0.8);
        paint(p, C[0], C[1], C[2], 1);
      },
      tick(T, dt, a, b) {
        const u = S.u, ex = S.excite;
        for (let p = a; p < b; p++) {
          const ph = aph[p], i = p * 3;
          const hop = ex * 0.07 * u * Math.max(0, Math.sin(T * 9 + ph * 3));
          home[i] = ax[p] + Math.sin(T * 0.8 + ph) * 0.012 * u;
          home[i + 1] = ay[p] - Math.abs(Math.sin(T * 1.7 + ph)) * 0.008 * u - hop;
        }
      },
    },
    {
      key: "flashes", kind: "dots", share: 0.006, mode: "ring",
      place(p, k) {
        put(p, field.h1(p) * S.W, tierBase(1 + (k % 3)) - 0.15 * S.u, 0, 0);
        paint(p, 1.4, 1.4, 1.5, 0);
        aph[p] = 3 + hash(k, 51) * 7; // seconds between pops
      },
      tick(T, dt, a, b) {
        for (let p = a; p < b; p++) {
          const ph = ((T + field.h2(p) * aph[p]) / aph[p]) % 1;
          size[p] = ph < 0.025 ? (0.16 * S.u) / pxs() : 0;
          field.snap[p] = 1;
        }
      },
    },
    {
      key: "parapet", kind: "fill", w: 2,
      box: () => [0, S.F - 0.27 * S.u, S.W, S.F + 3],
      inside: (x, y) => (y > S.F - 0.24 * S.u ? 0 : -1),
      color(x, y) {
        const cope = y < S.F - 0.19 * S.u;
        const blk = Math.floor(x / (0.3 * S.u) + (cope ? 0 : 0.5));
        const joint = Math.abs((x / (0.3 * S.u) + (cope ? 0 : 0.5)) % 1) < 0.05 ? 0.7 : 1;
        const m = joint * (0.88 + hash(blk, 61) * 0.24) * (cope ? 1.6 : 1 - (y - S.F + 0.19 * S.u) / S.u);
        lit([0.15 * m, 0.13 * m, 0.12 * m], x, y, 0.7);
      },
    },
    {
      key: "pillars", kind: "fill", w: 5,
      box: () => [0, S.F - 1.25 * S.u, S.W, S.F + 3],
      inside(x, y) {
        for (let s = 0; s < 2; s++) {
          const cx = s ? S.wr + 0.06 * S.u : S.wl - 0.06 * S.u;
          const dx = Math.abs(x - cx);
          if (dx < 0.16 * S.u && y > S.F - 1.0 * S.u) return s;
          if (dx < 0.21 * S.u && y > S.F - 1.12 * S.u && y < S.F - 0.98 * S.u) return s;
        }
        return -1;
      },
      color(x, y, s) {
        const cx = s ? S.wr + 0.06 * S.u : S.wl - 0.06 * S.u;
        const inner = s ? x < cx : x > cx; // the face toward the pit catches the torchlight
        const cap = y < S.F - 0.98 * S.u;
        const m = (inner ? 1.15 : 0.8) * (cap ? 1.25 : 1);
        lit([0.17 * m, 0.155 * m, 0.15 * m], x, y, 1.0);
      },
    },
    {
      key: "posts", kind: "stroke",
      strokes(push) {
        const y0 = S.F - 0.22 * S.u, y1 = S.F - 0.88 * S.u;
        for (const x of S.torches) {
          push(x, y0, x, y1, 0, 0.045 * S.u, 0.11, 0.08, 0.06);
          push(x - 0.075 * S.u, y1, x + 0.075 * S.u, y1, 0.03 * S.u, 0.06 * S.u, 0.24, 0.15, 0.08);
        }
      },
    },
    {
      key: "ringposts", kind: "stroke", mode: "ring",
      strokes(push) {
        const top = S.F - 1.32 * S.u;
        for (const [x, c] of [[S.wl + 0.1 * S.u, [0.62, 0.1, 0.09]], [S.wr - 0.1 * S.u, [0.1, 0.22, 0.62]]]) {
          push(x, S.F, x, top, 0, 0.075 * S.u, 0.38, 0.4, 0.44);
          push(x, top + 0.1 * S.u, x, S.F - 0.36 * S.u, 0, 0.12 * S.u, c[0], c[1], c[2]);
        }
      },
    },
    {
      key: "ropes", kind: "stroke", mode: "ring", cap: 0.2, gap: 0.75,
      strokes(push) {
        const xa = S.wl + 0.1 * S.u, xb = S.wr - 0.1 * S.u;
        const cols = [[0.62, 0.1, 0.09], [0.72, 0.72, 0.74], [0.1, 0.22, 0.62]];
        for (let r = 0; r < 3; r++) {
          const y = S.F - (0.45 + r * 0.33) * S.u;
          push(xa, y, xb, y, 0.06 * S.u, 0.045 * S.u, cols[r][0], cols[r][1], cols[r][2]);
        }
      },
    },
    {
      key: "pools", kind: "dots", count: () => 2 * S.torches.length,
      place(p, k) {
        const t = k % S.torches.length;
        el[p] = t;
        put(p, S.torches[t], S.F - 0.95 * S.u, (k < S.torches.length ? 0.6 : 1.1) * S.u, 0);
        paint(p, 0.05, 0.022, 0.006, 0);
      },
      tick(T, dt, a, b) {
        for (let p = a; p < b; p++) {
          const t = el[p];
          const f = 0.75 + 0.25 * Math.sin(T * 13 + t * 2.3) * Math.sin(T * 7.1 + t);
          const i = p * 3;
          hcol[i] = 0.08 * f;
          hcol[i + 1] = 0.034 * f;
          hcol[i + 2] = 0.008 * f;
        }
      },
    },
    {
      key: "flames", kind: "dots", share: 0.04,
      place(p, k) {
        el[p] = k % S.torches.length;
        put(p, S.torches[el[p]], S.F - 0.95 * S.u, 4, 0);
        paint(p, 1, 0.55, 0.16, 0);
      },
      // teardrop: tight bright base, sparse flickering tongue above
      tick(T, dt, a, b) {
        const u = S.u, ty = S.F - 0.93 * u;
        for (let p = a; p < b; p++) {
          const i = p * 3, post = el[p];
          const ph = field.h1(p) * TAU;
          const q = field.h3(p);
          const rise = q * q * (0.34 + 0.1 * Math.sin(T * 9 + ph * 3)) * u;
          const sway = Math.sin(T * 6 + ph * 4 + post * 2.1) * (0.02 + 0.05 * (rise / (0.32 * u) + 0.2)) * u;
          home[i] = S.torches[post] + (field.h2(p) - 0.5) * 0.08 * u * (1 - q * 0.6) + sway;
          home[i + 1] = ty - rise;
          const m = 1.4 + 0.6 * Math.sin(T * 11 + ph * 5 + field.h2(p) * 9) + q * 0.3;
          // white-yellow core, orange body, red tips
          hcol[i] = m;
          hcol[i + 1] = m * (0.62 - q * 0.38);
          hcol[i + 2] = m * (0.22 - q * 0.18);
          size[p] = ((1.2 - q * 0.75) * 0.075 * u) / pxs();
          field.snap[p] = 1;
        }
      },
    },
    {
      key: "embers", kind: "dots", share: 0.025,
      place(p, k) {
        put(p, S.torches[k % S.torches.length], S.F - S.u, 2 + hash(k, 81) * 1.6, 0);
        ax[p] = hash(k, 82) * S.torches.length; // which brazier
        ay[p] = hash(k, 83); // rise progress 0..1
        aph[p] = hash(k, 84) * TAU;
      },
      tick(T, dt, a, b) {
        const u = S.u, n = S.torches.length;
        for (let p = a; p < b; p++) {
          ay[p] += dt * (0.05 + field.h2(p) * 0.05);
          if (ay[p] > 1) { ay[p] = 0; ax[p] = Math.random() * n; }
          const t = ay[p];
          const post = S.torches[Math.min(n - 1, ax[p] | 0)];
          const sway = Math.sin(T * 1.4 + aph[p] + t * 9) * 0.09 * u * t;
          const i = p * 3;
          home[i] = post + (field.h1(p) - 0.5) * 0.5 * u * t + sway;
          home[i + 1] = S.F - 1.0 * u - t * 1.7 * u;
          const m = Math.min(1, t * 6) * Math.max(0, 1 - (t - 0.6) / 0.4) * (0.9 + field.h3(p) * 0.7);
          hcol[i] = 0.7 * m;
          hcol[i + 1] = 0.32 * m;
          hcol[i + 2] = 0.1 * m;
          field.snap[p] = 1;
        }
      },
    },
    {
      key: "lip", kind: "stroke", gap: 0.9,
      strokes(push) {
        const c = S.ring ? [0.62, 0.62, 0.66] : [0.34, 0.27, 0.2];
        push(-4, S.F + 1, S.W + 4, S.F + 1, 0, 0.05 * S.u, c[0], c[1], c[2]);
      },
    },
    {
      key: "grass", kind: "dots", share: 0.025, mode: "arena",
      place(p, k) {
        // blades of 4 beads; bead j of blade b, rooted along the parapet
        const b = (k / 4) | 0, j = k % 4;
        const bx = hash(b, 101) * S.W;
        const ht = (0.06 + hash(b, 103) * 0.1) * S.u;
        el[p] = j;
        put(p, bx, S.F - 1 - (j / 3) * ht, (0.022 - j * 0.004) * S.u * 1.4, 1);
        aph[p] = ht;
        const g = 0.6 + hash(b, 107) * 0.5;
        paint(p, 0.1 * g, 0.14 * g, 0.07 * g, 1);
      },
      tick(T, dt, a, b) {
        const u = S.u;
        for (let p = a; p < b; p++) {
          const j = el[p];
          if (!j) continue;
          const f = j / 3;
          const gust = Math.sin(T * 0.7 + ax[p] * 0.004) * 0.6 + 0.4;
          const lean = (Math.sin(T * 2.3 + ax[p] * 0.02) * 0.5 + gust) * 0.05 * u * f * f;
          home[p * 3] = ax[p] + lean;
          home[p * 3 + 1] = ay[p] + Math.abs(lean) * 0.3;
        }
      },
    },
    // ---- front slice: above the fighters ----
    // two bands: fine grain at the fight line, coarse toward the viewer
    {
      key: "deep", kind: "fill", w: 0.6, front: true, fat: 1.3,
      box: () => [0, S.F + 0.4 * S.u, S.W, S.H + 0.1 * S.u],
      inside: () => 0,
      color: (x, y) => groundColor(x, y),
    },
    {
      key: "ground", kind: "fill", w: 3, front: true, inset: 0.85,
      box: () => [0, S.F + 2, S.W, S.F + 0.5 * S.u],
      inside: () => 0,
      color: (x, y) => groundColor(x, y),
    },
    {
      // pebbles and grit scattered over the near ground, for scale
      key: "pebbles", kind: "dots", share: 0.06, front: true,
      place(p, k) {
        const x = field.h1(p) * S.W;
        const d = Math.pow(field.h2(p), 1.6);
        const y = S.F + 4 + d * (S.H - S.F);
        put(p, x, y, (0.03 + d * 0.06) * S.u * (0.6 + hash(k, 121) * 0.8), 1);
        groundColor(x, y);
        const m = hash(k, 123) < 0.5 ? 0.5 : 1.7;
        paint(p, C[0] * m, C[1] * m, C[2] * m, 1);
      },
    },
  ];
  function groundColor(x, y) {
    const d = (y - S.F) / S.u;
    const edge = Math.min(1, Math.max(0, Math.min(x - S.wl, S.wr - x) / S.u + 0.6));
    const speck = 0.85 + hash(Math.floor(x / 5) * 31 + Math.floor(y / 5), 111) * 0.3;
    if (S.ring && d < 0.42) {
      // apron skirt, folds every quarter unit
      const fold = 0.85 + 0.15 * Math.cos((x / (0.25 * S.u)) * TAU);
      C[0] = 0.07 * fold; C[1] = 0.1 * fold; C[2] = 0.3 * fold;
      return;
    }
    const t = Math.min(1, d / 0.9);
    const m = (1 - t * 0.8) * (0.55 + 0.45 * edge) * speck * (S.ring ? 0.45 : 1);
    lit([0.22 * m, 0.17 * m, 0.12 * m], x, S.F - 0.4 * S.u, 0.6 * (1 - t));
  }

  // hex grid count of inside() points at spacing d
  function gridScan(L, d, store) {
    const [x0, y0, x1, y1] = L.box();
    const dy = d * 0.866;
    let c = 0, row = 0;
    for (let y = y0 + d * (L.inset || 0.433); y < y1; y += dy, row++) {
      for (let x = x0 + (row & 1 ? d * 0.5 : 0); x < x1; x += d) {
        const e = L.inside(x, y);
        if (e < 0) continue;
        if (store) {
          if (c >= store) return c;
          gx[c] = x; gy[c] = y; ge[c] = e;
        }
        c++;
      }
    }
    return c;
  }

  function placeFill(L, a, b) {
    const n = b - a;
    if (n <= 0) return;
    // smallest spacing whose grid still fits in n (log bisection)
    let dlo = 0.5, dhi = Math.max(S.W, S.H);
    for (let it = 0; it < 18; it++) {
      const d = Math.sqrt(dlo * dhi);
      if (gridScan(L, d, 0) > n) dlo = d; else dhi = d;
    }
    const d = (L.d = dhi);
    const c = gridScan(L, d, n);
    for (let k = 0; k < n; k++) {
      const p = a + k;
      if (!c) { hide(p); continue; }
      // spare particles double up on grid points: free texture
      const g = k < c ? k : ((k - c) * 7919) % c;
      const j = k < c ? 0.22 : 0.5;
      const x = gx[g] + (field.h1(p) - 0.5) * j * d;
      const y = gy[g] + (field.h2(p) - 0.5) * j * d;
      el[p] = ge[g];
      aph[p] = hash(ge[g], 1) * TAU;
      L.color(gx[g], gy[g], ge[g]);
      put(p, x, y, (L.fat || 1.5) * d * (0.95 + field.h3(p) * 0.1), 1);
      paint(p, C[0], C[1], C[2], 1);
    }
  }

  const segs = [];
  const pushSeg = (...s) => segs.push(s);
  function strokeNeed(L) {
    segs.length = 0;
    L.strokes(pushSeg);
    let need = 0;
    for (const s of segs) need += Math.hypot(s[2] - s[0], s[3] - s[1]) / ((L.gap || 0.6) * s[5]) + 1;
    return Math.ceil(need);
  }
  function placeStroke(L, a, b) {
    segs.length = 0;
    L.strokes(pushSeg);
    let tot = 0;
    for (const s of segs) tot += Math.hypot(s[2] - s[0], s[3] - s[1]) / s[5] + 1;
    let p = a;
    for (let si = 0; si < segs.length; si++) {
      const [x0, y0, x1, y1, sag, th, r, g, bl] = segs[si];
      const share = (Math.hypot(x1 - x0, y1 - y0) / th + 1) / tot;
      const m = si === segs.length - 1 ? b - p : Math.max(2, Math.round((b - a) * share));
      for (let k = 0; k < m && p < b; k++, p++) {
        const t = m > 1 ? k / (m - 1) : 0.5;
        put(p, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t), th * 1.3, 1);
        paint(p, r, g, bl, 1);
      }
    }
    for (; p < b; p++) hide(p);
  }

  // split [a,b) over the layers: dots by share, strokes by need, fills
  // by weighted area; then place each back to front
  function assign(list, a, b) {
    const n = b - a;
    let left = n, wsum = 0;
    for (const L of list) {
      if (L.kind === "dots") L.n = L.count ? L.count() : Math.round(L.share * n);
      else if (L.kind === "stroke") L.n = Math.min(strokeNeed(L), Math.round((L.cap || 0.08) * n));
      else {
        const dref = 0.06 * S.u;
        L.area = gridScan(L, dref, 0) * dref * dref;
        wsum += L.area * L.w;
        L.n = 0;
      }
      left -= L.n;
    }
    const pool = left;
    let lastFill = null;
    for (const L of list) {
      if (L.kind !== "fill") continue;
      L.n = Math.floor((pool * L.area * L.w) / Math.max(1, wsum));
      left -= L.n;
      lastFill = L;
    }
    if (lastFill) lastFill.n += left; // rounding remainder
    let p = a;
    for (const L of list) {
      L.a = p;
      L.b = p += L.n;
    }
    for (const L of list) {
      if (L.kind === "fill") placeFill(L, L.a, L.b);
      else if (L.kind === "stroke") placeStroke(L, L.a, L.b);
      else for (let p2 = L.a; p2 < L.b; p2++) L.place(p2, p2 - L.a, L.b - L.a);
    }
  }

  function layout(e) {
    S.W = innerWidth;
    S.H = innerHeight;
    S.F = e.floor;
    S.wl = e.wallL;
    S.wr = e.wallR;
    S.span = S.wr - S.wl;
    S.u = e.u;
    S.ring = arena._ring;
    S.torches = [];
    const nt = S.span > 6 * S.u ? 5 : 3;
    for (let t = 0; t < nt; t++) S.torches.push(S.wl + S.span * ((t + 0.5) / nt));
    S.columns = [];
    const nc = Math.max(2, Math.round(S.span / (1.6 * S.u)));
    for (let c = 0; c < nc; c++) S.columns.push(S.wl + S.span * ((c + 1) / (nc + 1)) + (hash(c, 27) - 0.5) * 0.3 * S.u);
    S.moon = { x: S.W * 0.74, y: S.F - 4.3 * S.u, r: Math.min(0.42 * S.u, 0.075 * S.W) };
    const cw = S.W + 2.6 * S.u;
    S.cloudX = (cl, T) => ((((hash(cl, 37) * cw + T * (0.03 + hash(cl, 39) * 0.04) * S.u) % cw) + cw) % cw) - 1.3 * S.u;

    const on = (L) => !L.mode || L.mode === (S.ring ? "ring" : "arena");
    for (const L of LAYERS) { L.a = 0; L.b = 0; }
    assign(LAYERS.filter((L) => !L.front && on(L)), lo, hi);
    assign(LAYERS.filter((L) => L.front && on(L)), groundLo, groundHi);
  }

  function frame(dt, T, hit) {
    S.excite = Math.min(1, S.excite * Math.exp(-dt * 0.9) + (hit ? 0.45 : 0));
    for (const L of LAYERS) if (L.tick && L.b > L.a) L.tick(T, dt, L.a, L.b);
  }

  const arena = {
    layout,
    frame,
    lo,
    hi,
    dirty: false,
    _ring: false,
    get ring() { return arena._ring; },
    setRing(on) { arena._ring = !!on; },
    layers: LAYERS,
  };
  return arena;
}
