// skin.js - the look of a fighter: opaque particle flesh and clothes.
// Every body part owns a fixed layout of local points (a along the
// bone, b across it toward the front), relaxed once at boot into an
// even packing that hugs the part's outline. The outfit picks a
// material per point (skin, cloth, hair, boots), and each frame maps
// the layout onto the live skeleton with cylinder shading. Missing
// flesh shows as blood: holes bleed at their rims and cuts at the stump.

// sprite diameter in u at size 1: fighter.js pointScale 0.0072 * unitDiv 8
const SPRITE_U = 0.0576;
const PERSP = 9; // CFG.perspZ - sprite scale is perspZ / (perspZ - z)

// sprite size that draws a disc dU wide (in u) at depth z
export const sizeOf = (dU, z) => dU / (SPRITE_U * (PERSP / (PERSP - z)));

export const MAT = {
  SKIN: 0, EAR: 1, HAIR: 2, SHIRT: 3, TRIM: 4, PANTS: 5, BELT: 6,
  BUCKLE: 7, BOOT: 8, EYE: 9, STEEL: 10, GLOVE: 11,
};
// draw order inside a part: details paint over the cloth they sit on
const LAYER = [0, 4, 3, 1, 2, 1, 3, 4, 2, 5, 3, 3];

const BLOOD = [0.62, 0.03, 0.04];
const GORE = [0.86, 0.13, 0.1];
// key light from above and a little right (the moon), facing the viewer
export const LX = 0.24, LY = -0.78, LZ = 0.58;
const AMB = 0.55, DIF = 0.6;
// cool moonlight rim on silhouette edges keeps dark cloth off the night
const RIM = [0.16, 0.2, 0.3];

// outfits: colors are final, pre-shading. sleeve/bootH are lengths in u.
// No foe wears red: blood has to read on every outfit
const SKINS = {
  fair: [0.93, 0.72, 0.58], tan: [0.82, 0.58, 0.42], brown: [0.6, 0.4, 0.27], dark: [0.42, 0.27, 0.19],
};
export const PLAYER_OUTFIT = {
  skin: SKINS.fair, hair: [0.4, 0.23, 0.11], shirt: [0.2, 0.42, 0.8], trim: [0.82, 0.74, 0.5],
  pants: [0.44, 0.38, 0.31], belt: [0.42, 0.25, 0.1], boot: [0.3, 0.19, 0.11],
  top: "tunic", sleeve: 0.85, bootH: 0.2, hairStyle: "short", beard: false, helm: false, bracer: false,
  face: [0.2, 0.38, 0.72], glove: [0.2, 0.4, 0.88],
};
const FOE_OUTFITS = [
  { skin: SKINS.tan, hair: [0.2, 0.12, 0.07], shirt: [0.8, 0.58, 0.16], trim: [0.36, 0.2, 0.1],
    pants: [0.36, 0.31, 0.27], belt: [0.2, 0.12, 0.07], boot: [0.22, 0.14, 0.09],
    top: "tunic", sleeve: 0.24, bootH: 0.24, hairStyle: "short", beard: true, helm: false, bracer: true,
    face: [0.75, 0.5, 0.14], glove: [0.85, 0.6, 0.15] },
  { skin: SKINS.fair, hair: [0.88, 0.7, 0.38], shirt: [0.26, 0.48, 0.22], trim: [0.52, 0.38, 0.2],
    pants: [0.55, 0.45, 0.3], belt: [0.32, 0.21, 0.1], boot: [0.32, 0.21, 0.12],
    top: "shirt", sleeve: 0.85, bootH: 0.17, hairStyle: "long", beard: false, helm: false, bracer: false,
    face: [0.3, 0.5, 0.26], glove: [0.3, 0.58, 0.24] },
  { skin: SKINS.brown, hair: [0.12, 0.09, 0.07], shirt: [0.5, 0.26, 0.6], trim: [0.85, 0.72, 0.4],
    pants: [0.4, 0.4, 0.44], belt: [0.22, 0.14, 0.09], boot: [0.2, 0.14, 0.1],
    top: "tunic", sleeve: 0.5, bootH: 0.22, hairStyle: "short", beard: false, helm: true, bracer: false,
    face: [0.5, 0.26, 0.6], glove: [0.6, 0.3, 0.72] },
  { skin: SKINS.dark, hair: [0.1, 0.07, 0.05], shirt: [0.5, 0.3, 0.14], trim: [0.8, 0.64, 0.3],
    pants: [0.62, 0.5, 0.3], belt: [0.34, 0.2, 0.09], boot: [0.2, 0.13, 0.08],
    top: "bare", sleeve: 0, bootH: 0.2, hairStyle: "bald", beard: true, helm: false, bracer: true,
    face: [0.6, 0.45, 0.2], glove: [0.8, 0.66, 0.24] },
  { skin: SKINS.fair, hair: [0.62, 0.26, 0.1], shirt: [0.84, 0.8, 0.7], trim: [0.3, 0.44, 0.36],
    pants: [0.3, 0.36, 0.32], belt: [0.36, 0.22, 0.1], boot: [0.22, 0.15, 0.1],
    top: "shirt", sleeve: 0.85, bootH: 0.26, hairStyle: "long", beard: true, helm: false, bracer: false,
    face: [0.3, 0.44, 0.36], glove: [0.3, 0.5, 0.4] },
  { skin: SKINS.tan, hair: [0.16, 0.12, 0.1], shirt: [0.36, 0.38, 0.43], trim: [0.62, 0.64, 0.68],
    pants: [0.26, 0.27, 0.3], belt: [0.46, 0.3, 0.14], boot: [0.16, 0.15, 0.16],
    top: "shirt", sleeve: 0.85, bootH: 0.24, hairStyle: "short", beard: false, helm: true, bracer: true,
    face: [0.36, 0.38, 0.43], glove: [0.4, 0.42, 0.48] },
];
export const foeOutfit = (n) => FOE_OUTFITS[n % FOE_OUTFITS.length];

// ---- part outline primitives in local (a, b) u-space ----
// seg: tapered capsule, front extent f0->f1 and back extent k0->k1 over
// a0..a1; cap < 1 flattens the rounded ends. circ: disc. box: rounded rect.
const seg = (a0, a1, f0, f1, k0, k1, cap = 1) => ({ k: 0, a0, a1, f0, f1, k0, k1, cap });
const circ = (a, b, r, fist = false) => ({ k: 1, a, b, r, fist });
const box = (a0, a1, b0, b1, r) => ({ k: 2, a0, a1, b0, b1, r });

function sdPrim(q, a, b) {
  if (q.k === 1) return Math.hypot(a - q.a, b - q.b) - q.r;
  if (q.k === 2) {
    const ca = (q.a0 + q.a1) / 2, cb = (q.b0 + q.b1) / 2;
    const ha = (q.a1 - q.a0) / 2 - q.r, hb = (q.b1 - q.b0) / 2 - q.r;
    const da = Math.abs(a - ca) - ha, db = Math.abs(b - cb) - hb;
    return Math.hypot(Math.max(da, 0), Math.max(db, 0)) + Math.min(Math.max(da, db), 0) - q.r;
  }
  const t = Math.max(0, Math.min(1, (a - q.a0) / (q.a1 - q.a0)));
  const ext = b >= 0 ? q.f0 + (q.f1 - q.f0) * t : q.k0 + (q.k1 - q.k0) * t;
  if (a >= q.a0 && a <= q.a1) return Math.abs(b) - ext;
  const ae = a < q.a0 ? q.a0 : q.a1;
  return Math.hypot((a - ae) / q.cap, b) - ext;
}
function sdf(prims, a, b) {
  let d = 1e9;
  for (const q of prims) d = Math.min(d, sdPrim(q, a, b));
  return d;
}

// even packing of n points inside an outline given as a distance fn:
// quasi-random seed, then pairwise repulsion with an inward projection -
// points settle into a near-hex lattice whose outer ring traces the edge
function relax(dist, [a0, a1, b0, b1], n) {
  const R2a = 0.7548776662, R2b = 0.5698402910;
  const at = (k) => a0 + ((0.5 + k * R2a) % 1) * (a1 - a0);
  const bt = (k) => b0 + ((0.5 + k * R2b) % 1) * (b1 - b0);
  let inside = 0;
  for (let k = 0; k < 3000; k++) if (dist(at(k), bt(k)) < 0) inside++;
  const area = (inside / 3000) * (a1 - a0) * (b1 - b0);
  const s = Math.sqrt(area / n) * 1.07;
  const pts = [];
  for (let k = 1; pts.length < n && k < 200000; k++)
    if (dist(at(k), bt(k)) < 0) pts.push({ a: at(k), b: bt(k) });
  const inset = s * 0.42, e = 1e-4;
  for (let it = 0; it < 70; it++) {
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const P = pts[i], Q = pts[j];
        const da = Q.a - P.a, db = Q.b - P.b, d2 = da * da + db * db;
        if (d2 >= s * s || d2 < 1e-12) continue;
        const d = Math.sqrt(d2), m = ((s - d) / d) * 0.25;
        P.a -= da * m; P.b -= db * m;
        Q.a += da * m; Q.b += db * m;
      }
    for (const P of pts) {
      const d = dist(P.a, P.b);
      if (d <= -inset) continue;
      const ga = (dist(P.a + e, P.b) - dist(P.a - e, P.b)) / (2 * e);
      const gb = (dist(P.a, P.b + e) - dist(P.a, P.b - e)) / (2 * e);
      const g = Math.hypot(ga, gb) || 1;
      P.a -= (ga / g) * (d + inset);
      P.b -= (gb / g) * (d + inset);
    }
  }
  return { pts, s };
}

function primBox(prims) {
  let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
  for (const q of prims) {
    if (q.k === 1) {
      a0 = Math.min(a0, q.a - q.r); a1 = Math.max(a1, q.a + q.r);
      b0 = Math.min(b0, q.b - q.r); b1 = Math.max(b1, q.b + q.r);
    } else if (q.k === 2) {
      a0 = Math.min(a0, q.a0); a1 = Math.max(a1, q.a1);
      b0 = Math.min(b0, q.b0); b1 = Math.max(b1, q.b1);
    } else {
      const r = Math.max(q.f0, q.f1, q.k0, q.k1);
      a0 = Math.min(a0, q.a0 - r * q.cap); a1 = Math.max(a1, q.a1 + r * q.cap);
      b0 = Math.min(b0, -r); b1 = Math.max(b1, r);
    }
  }
  return [a0, a1, b0, b1];
}

// body plan. L0 is the bone's rest length in u (head: 1, its a is in u).
// fs flips "front" for parts whose bone points up the body. dim/z set
// the depth layer: far limbs sit darker and slightly smaller.
function partShapes(P) {
  const thigh = [seg(-0.02, 0.3, 0.08, 0.072, 0.092, 0.076), seg(0.3, P.thigh, 0.072, 0.054, 0.076, 0.056)];
  const shin = [
    seg(0, 0.17, 0.05, 0.047, 0.052, 0.063), seg(0.17, 0.47, 0.047, 0.034, 0.063, 0.036),
    seg(0.47, P.shin - 0.04, 0.034, 0.038, 0.036, 0.04),
    box(P.shin - 0.1, P.shin + 0.01, -0.055, 0.155, 0.03),
  ];
  const arm = (L) => [seg(0, L * 0.4, 0.048, 0.05, 0.052, 0.048), seg(L * 0.4, L, 0.05, 0.04, 0.048, 0.04)];
  const fore = (L) => [
    seg(0, L * 0.35, 0.042, 0.043, 0.042, 0.04), seg(L * 0.35, L * 0.94, 0.043, 0.029, 0.04, 0.028),
    circ(L + 0.025, 0, 0.046, true),
  ];
  const back = { dim: 0.74, z: 0.4 }, mid = { dim: 0.93, z: 0.9 }, front = { dim: 1.1, z: 1.2 };
  return {
    thighB: { L0: P.thigh, fs: 1, prims: thigh, ...back },
    shinB: { L0: P.shin, fs: 1, prims: shin, ...back },
    trapS: { L0: P.collar, fs: -1, prims: [circ(P.collar, 0, 0.058)], ...back },
    upS: { L0: P.upper * 0.85, fs: 1, prims: arm(P.upper * 0.85), ...back },
    foreS: { L0: P.fore, fs: 1, prims: fore(P.fore), ...back },
    thighF: { L0: P.thigh, fs: 1, prims: thigh, ...front },
    shinF: { L0: P.shin, fs: 1, prims: shin, ...front },
    belly: { L0: P.belly, fs: -1, prims: [seg(-0.1, 0, 0.094, 0.1, 0.1, 0.116, 0.6), seg(0, P.belly, 0.1, 0.088, 0.116, 0.084)], ...mid },
    ribcage: { L0: P.spine, fs: -1, prims: [seg(0, 0.15, 0.088, 0.114, 0.084, 0.094), seg(0.15, P.spine + 0.01, 0.114, 0.1, 0.094, 0.09, 0.35)], ...mid },
    neck: { L0: P.neckP, fs: -1, prims: [seg(-0.03, 0.17, 0.04, 0.04, 0.046, 0.046)], ...mid },
    head: {
      L0: 1, fs: -1, head: true, ...mid,
      prims: [circ(0.02, -0.014, 0.11), circ(-0.035, 0.034, 0.076), circ(-0.086, 0.044, 0.042), circ(-0.004, 0.108, 0.022)],
      // small fixed features: ear, eye
      pins: [{ a: -0.012, b: -0.03, m: MAT.EAR, d: 0.05 }, { a: 0.012, b: 0.07, m: MAT.EYE, d: 0.028 }],
    },
    collar: { L0: P.collar, fs: -1, prims: [circ(P.collar, 0, 0.064), seg(0.02, P.collar, 0.05, 0.05, 0.05, 0.05)], ...mid },
    upper: { L0: P.upper, fs: 1, prims: arm(P.upper), ...front },
    fore: { L0: P.fore, fs: 1, prims: fore(P.fore), ...front },
  };
}

function matOf(name, a, b, L0, o, boxing) {
  const M = MAT;
  const bare = boxing || o.top === "bare";
  switch (name) {
    case "thighF": case "thighB":
      return boxing && a > 0.26 ? M.SKIN : M.PANTS;
    case "shinF": case "shinB": {
      const bh = boxing ? 0.07 : o.bootH;
      if (a > L0 - bh || (a > L0 - 0.1 && b > 0.045)) return boxing ? M.TRIM : M.BOOT;
      return boxing ? M.SKIN : M.PANTS;
    }
    case "belly":
      if (a > 0.125 && a < 0.185) return boxing ? M.TRIM : b > 0.055 ? M.BUCKLE : M.BELT;
      if (a <= 0.125) return boxing ? M.PANTS : o.top === "tunic" ? M.SHIRT : M.PANTS;
      return bare ? M.SKIN : M.SHIRT;
    case "ribcage":
      if (bare) return M.SKIN;
      if (a > L0 - 0.035 && b > 0.0) return o.top === "tunic" ? M.TRIM : M.SKIN;
      return M.SHIRT;
    case "neck": return M.SKIN;
    case "collar": case "trapS": return bare ? M.SKIN : M.SHIRT;
    case "upper": case "upS": case "fore": case "foreS": {
      const lower = name === "fore" || name === "foreS";
      if (lower && a > L0) return boxing || o.glove === true ? M.GLOVE : M.SKIN;
      const sl = bare ? 0 : o.sleeve;
      const s = lower ? a + (name === "fore" ? 0.44 : 0.374) : a;
      if (s < sl - 0.035) return M.SHIRT;
      if (s < sl) return M.TRIM;
      if (lower && o.bracer && !boxing && a > L0 * 0.45) return M.BOOT;
      return M.SKIN;
    }
    case "head": {
      if (o.helm && !boxing && a > 0.03 - 0.12 * b && b < 0.1) return a < 0.045 - 0.12 * b ? M.TRIM : M.STEEL;
      const crown = a > 0.048 - 0.3 * b && b < 0.085;
      const nape = b < -0.05 && a > -0.035;
      if (o.hairStyle === "short" && (crown || nape)) return M.HAIR;
      if (o.hairStyle === "long" && (crown || (b < -0.035 && a > -0.16))) return M.HAIR;
      if (o.beard && a < -0.055 && b > -0.02 && b < 0.095) return M.HAIR;
      return M.SKIN;
    }
  }
  return M.SKIN;
}

function matColor(m, o, boxing) {
  const M = MAT;
  switch (m) {
    case M.SKIN: return o.skin;
    case M.EAR: return [o.skin[0] * 0.8, o.skin[1] * 0.74, o.skin[2] * 0.72];
    case M.HAIR: return o.hair;
    case M.SHIRT: return o.shirt;
    case M.TRIM: return boxing ? o.glove : o.trim;
    case M.PANTS: return boxing ? o.glove.map((c) => c * 0.55) : o.pants;
    case M.BELT: return o.belt;
    case M.BUCKLE: return [0.86, 0.74, 0.4];
    case M.BOOT: return o.boot;
    case M.EYE: return [0.06, 0.04, 0.04];
    case M.STEEL: return [0.62, 0.66, 0.72];
    case M.GLOVE: return o.glove;
  }
  return o.skin;
}

// the buckler in its own local frame: a = up, b = toward the foe.
// Round wooden face in slight perspective, an iron rim, a domed boss
const SHIELD_RX = 0.2, SHIELD_RY = 0.28;

export function createSkin(field, f, P) {
  const u = field.unit;
  const lo = f.lo, hi = f.hi, n = hi - lo;
  const shapes = partShapes(P);
  // per-particle layout (index p - lo), rewritten by materialize()
  const LT = new Float32Array(n), LB = new Float32Array(n);
  const NQ = new Float32Array(n), NQA = new Float32Array(n), NZ = new Float32Array(n);
  const CR = new Float32Array(n), CG = new Float32Array(n), CB = new Float32Array(n);
  const NB = new Int16Array(n * 3).fill(-1);
  const size0 = new Float32Array(n).fill(1);
  const canon = []; // per part: relaxed points in canonical order

  for (const pt of f.parts) {
    const sh = shapes[pt.name];
    const pins = sh.pins || [];
    const dist = (a, b) => sdf(sh.prims, a, b);
    const { pts, s } = relax(dist, primBox(sh.prims), pt.hi - pt.lo - pins.length);
    const sz = sizeOf(s * 1.62, sh.z);
    for (const q of pts) {
      q.sz = sz;
      if (sh.head) {
        q.qa = Math.max(-1, Math.min(1, q.a / 0.12));
        q.qb = Math.max(-1, Math.min(1, q.b / 0.12));
      } else {
        const ext = Math.abs(q.b) - sdf(sh.prims, q.a, q.b);
        q.qa = 0;
        q.qb = Math.max(-1, Math.min(1, q.b / (ext || 1)));
      }
      q.fist = sh.prims.some((c) => c.fist && Math.hypot(q.a - c.a, q.b - c.b) < c.r + s * 0.5);
    }
    for (const pin of pins)
      pts.push({ a: pin.a, b: pin.b, pin: pin.m, sz: sizeOf(pin.d, sh.z), qa: pin.a / 0.12, qb: pin.b / 0.12 });
    canon.push({ pt, sh, pts, s });
  }

  const shieldPts = shieldLayout(f.hi - f.shieldLo);

  let outfit = PLAYER_OUTFIT, boxing = false, built = "";
  function materialize() {
    for (const { pt, sh, pts, s } of canon) {
      const L0 = sh.L0;
      for (const q of pts) q.m = q.pin ?? matOf(pt.name, q.a, q.b, L0, outfit, boxing);
      const order = pts.map((q, i) => i).sort((i, j) => LAYER[pts[i].m] - LAYER[pts[j].m] || i - j);
      const local = order.map((i) => pts[i]);
      for (let k = 0; k < local.length; k++) {
        const q = local[k], p = pt.lo + k, x = p - lo;
        const g = boxing && q.fist ? 1.32 : 1; // gloves swell the fist
        const fa = L0 + 0.025;
        const a = q.fist ? fa + (q.a - fa) * g : q.a;
        LT[x] = a / L0;
        LB[x] = q.b * g;
        NQ[x] = q.qb;
        NQA[x] = q.qa;
        NZ[x] = Math.sqrt(Math.max(0, 1 - q.qa * q.qa - q.qb * q.qb));
        const c = matColor(q.m, outfit, boxing);
        const dim = sh.dim;
        CR[x] = c[0] * dim; CG[x] = c[1] * dim; CB[x] = c[2] * dim;
        size0[x] = q.sz * (q.fist ? g : 1);
        field.size[p] = f.alive[x] ? size0[x] : field.size[p];
        field.solid[p] = 1;
        // three nearest same-part neighbors: a dead one marks a wound rim
        let n0 = -1, n1 = -1, n2 = -1, d0 = 1e9, d1 = 1e9, d2 = 1e9;
        const lim = s * s * 3.2;
        for (let j = 0; j < local.length; j++) {
          if (j === k) continue;
          const r = local[j], dd = (r.a - q.a) ** 2 + (r.b - q.b) ** 2;
          if (dd > lim) continue;
          if (dd < d0) { n2 = n1; d2 = d1; n1 = n0; d1 = d0; n0 = j; d0 = dd; }
          else if (dd < d1) { n2 = n1; d2 = d1; n1 = j; d1 = dd; }
          else if (dd < d2) { n2 = j; d2 = dd; }
        }
        NB[x * 3] = n0 < 0 ? -1 : pt.lo + n0 - lo;
        NB[x * 3 + 1] = n1 < 0 ? -1 : pt.lo + n1 - lo;
        NB[x * 3 + 2] = n2 < 0 ? -1 : pt.lo + n2 - lo;
      }
    }
    built = outfitKey();
  }
  const outfitKey = () => (outfit === PLAYER_OUTFIT ? "p" : FOE_OUTFITS.indexOf(outfit)) + (boxing ? "b" : "");

  const cuts = [];
  function write(dt) {
    boxing = !!(f.W && f.W.spec.bare);
    if (outfitKey() !== built) materialize();
    const J = f.J, s = f.side, home = field.home, hcol = field.hcol, alive = f.alive;
    // a severed part whose root joint stayed on the body leaves a stump
    // there; the chunk bleeds at its own root end
    cuts.length = 0;
    for (const pt of f.parts) if (pt.severed && !J[pt.ja0].free) cuts.push(J[pt.ja0]);
    const cutR2 = (0.085 * u) ** 2;
    for (const { pt, sh } of canon) {
      let ax, ay, dx, dy;
      if (sh.head) {
        // people hold their heads level: the drawn skull leans only
        // part way with the neck, or the face stares at the sky
        const H = J[pt.ja], N = J.neck;
        const nl = Math.hypot(H.x - N.x, H.y - N.y) || 1;
        const ux = ((H.x - N.x) / nl) * 0.45, uy = ((H.y - N.y) / nl) * 0.45 - 0.55;
        const ul = Math.hypot(ux, uy) || 1;
        ax = H.x; ay = H.y; dx = (ux / ul) * u; dy = (uy / ul) * u;
      } else {
        const A = J[pt.ja], B = J[pt.jb];
        ax = A.x; ay = A.y; dx = B.x - A.x; dy = B.y - A.y;
      }
      const dl = Math.hypot(dx, dy) || 1e-4;
      const tx = dx / dl, ty = dy / dl;
      const Fx = sh.fs * s * ty, Fy = -sh.fs * s * tx;
      const z = sh.z;
      const sev = pt.severed;
      for (let p = pt.lo; p < pt.hi; p++) {
        const x = p - lo;
        if (!alive[x]) continue;
        MOTE[x] = 0;
        const i = p * 3;
        const t = LT[x], b = LB[x] * u;
        const wx = ax + dx * t + Fx * b, wy = ay + dy * t + Fy * b;
        home[i] = wx;
        home[i + 1] = wy;
        home[i + 2] = z;
        field.snap[p] = 1;
        field.solid[p] = 1;
        const nq = NQ[x], na = NQA[x];
        const nx = Fx * nq + tx * na, ny = Fy * nq + ty * na;
        // contour darkening separates a limb from the same-colored trunk
        // behind it; the moon rim lifts only the edge turned from the key
        const nz = NZ[x];
        const lit = (AMB + DIF * Math.max(0, nx * LX + ny * LY + nz * LZ)) * (0.62 + 0.38 * Math.min(1, nz * 1.6));
        const rim = Math.max(0, -(nx * LX + ny * LY)) * (1 - nz) * 1.6;
        let r = CR[x] * lit + RIM[0] * rim, g = CG[x] * lit + RIM[1] * rim, bl = CB[x] * lit + RIM[2] * rim;
        let w = 0;
        if (sev) {
          // a lopped limb keeps its clothes; only the cut end is raw
          if (t * sh.L0 < 0.07) w = 1;
          r *= 0.85; g *= 0.82; bl *= 0.82;
        } else {
          const k0 = NB[x * 3], k1 = NB[x * 3 + 1], k2 = NB[x * 3 + 2];
          const dead = (k0 >= 0 && !alive[k0]) + (k1 >= 0 && !alive[k1]) + (k2 >= 0 && !alive[k2]);
          if (dead) w = 0.3 + 0.2 * dead;
          for (let c = 0; c < cuts.length; c++) {
            const ex = wx - cuts[c].x, ey = wy - cuts[c].y, e2 = ex * ex + ey * ey;
            if (e2 < cutR2) w = Math.max(w, 1 - e2 / cutR2 * 0.6);
          }
        }
        if (w > 0) {
          const gc = w > 0.9 ? GORE : BLOOD;
          r += (gc[0] - r) * w; g += (gc[1] - g) * w; bl += (gc[2] - bl) * w;
        }
        hcol[i] = r;
        hcol[i + 1] = g;
        hcol[i + 2] = bl;
      }
    }
    if (dt > 0) drip(dt);
    // size 0 still draws at the engine's 1.5px floor, and a solid speck
    // shows in the drift pool: despawned particles go additive black
    for (let p = lo; p < hi; p++)
      if (field.size[p] === 0 && field.solid[p]) {
        field.solid[p] = 0;
        hcol[p * 3] = hcol[p * 3 + 1] = hcol[p * 3 + 2] = 0;
      }
  }

  // knocked-loose flesh flies as blood drops on its own ballistic arc
  // and lands as a splat. The page's drift pool would otherwise yank
  // free motes under the floor in a frame or two, so each drop stays
  // homed and snapped to a position integrated here
  const MX = new Float32Array(n), MY = new Float32Array(n), MVX = new Float32Array(n), MVY = new Float32Array(n);
  const MOTE = new Uint8Array(n); // 1 flying, 2 landed
  function drip(dt) {
    const home = field.home, size = field.size, floorY = f.floorY - 1;
    const drag = Math.max(0, 1 - 1.2 * dt), shrink = 1 - 0.5 * dt;
    for (const d of f.dying) {
      const x = d.p - lo;
      if (MOTE[x] !== 1) continue;
      const i = d.p * 3;
      MVY[x] += 2400 * dt;
      MVX[x] *= drag;
      MVY[x] *= drag;
      MX[x] += MVX[x] * dt;
      MY[x] += MVY[x] * dt;
      if (MY[x] >= floorY) {
        MY[x] = floorY - field.h3(d.p) * 2;
        MOTE[x] = 2;
      } else size[d.p] *= shrink;
      home[i] = MX[x];
      home[i + 1] = MY[x];
      field.snap[d.p] = 1;
    }
  }

  // a particle knocked off the body: a blood drop, part flesh-tinted.
  // Called right after the kill impulse lands in field.vel
  function bleed(p) {
    const x = p - lo, i = p * 3;
    const k = 0.3 * field.h1(p), v = field.h2(p);
    const r = GORE[0] + (BLOOD[0] - GORE[0]) * v, g = GORE[1] + (BLOOD[1] - GORE[1]) * v, b = GORE[2] + (BLOOD[2] - GORE[2]) * v;
    field.hcol[i] = r + (CR[x] - r) * k;
    field.hcol[i + 1] = g + (CG[x] - g) * k;
    field.hcol[i + 2] = b + (CB[x] - b) * k;
    field.size[p] = size0[x] * 1.2;
    MX[x] = field.pos[i];
    MY[x] = field.pos[i + 1];
    MVX[x] = field.vel[i] * 180 * 0.5;
    MVY[x] = field.vel[i + 1] * 180 * 0.5;
    MOTE[x] = 1;
    field.homed[p] = 1;
  }

  function writeShield() {
    const s = f.side, sh = f.shield, home = field.home, hcol = field.hcol;
    const o = outfit;
    for (let k = 0; k < shieldPts.length; k++) {
      const p = f.shieldLo + k, i = p * 3, q = shieldPts[k];
      home[i] = sh.x + q.b * s * u;
      home[i + 1] = sh.y - q.a * u;
      home[i + 2] = 1.3;
      field.snap[p] = 1;
      field.size[p] = q.sz;
      field.solid[p] = 1;
      const lit = AMB + DIF * Math.max(0, q.nb * s * LX - q.na * LY + q.nz * LZ);
      const c = q.m === 0 ? IRON : q.m === 1 ? o.face : q.m === 2 ? WOOD : BOSS;
      // plank seams run vertically across the wood
      const grain = q.m === 2 ? 0.86 + 0.14 * Math.sin(q.b * 150) : 1;
      hcol[i] = c[0] * lit * grain;
      hcol[i + 1] = c[1] * lit * grain;
      hcol[i + 2] = c[2] * lit * grain;
    }
  }

  materialize();
  return {
    size0,
    write,
    bleed,
    writeShield,
    setOutfit(o) { outfit = o; },
  };
}

const WOOD = [0.5, 0.33, 0.17], IRON = [0.42, 0.44, 0.48], BOSS = [0.78, 0.8, 0.84];

// shield points on an ellipse, material by depth from the edge:
// 0 iron rim, 1 painted band, 2 bare wood, 3 boss. Sorted so the boss
// paints over the face
function shieldLayout(n) {
  const ry = SHIELD_RY, rx = SHIELD_RX;
  const ell = (a, b) => (Math.hypot(a / ry, b / rx) - 1) * Math.min(rx, ry);
  const { pts, s } = relax(ell, [-ry, ry, -rx, rx], n);
  const sz = sizeOf(s * 1.62, 1.3);
  const bx = 0.05; // the boss sits toward the foe: the face is domed
  for (const q of pts) {
    const edge = -ell(q.a, q.b);
    const boss = Math.hypot(q.a / 0.065, (q.b - bx) / 0.05) < 1;
    q.m = boss ? 3 : edge < s * 0.6 ? 0 : edge < s * 1.7 ? 1 : 2;
    q.sz = sz;
    const r = Math.min(1, Math.hypot(q.a / ry, q.b / rx));
    q.na = (q.a / ry) * 0.8;
    q.nb = (q.b / rx) * 0.8 + 0.25;
    q.nz = Math.sqrt(Math.max(0.05, 1 - r * r * 0.64));
  }
  pts.sort((p, q) => (p.m === 3) - (q.m === 3));
  return pts;
}
