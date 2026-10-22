// scene.js - "self" scene fn: reads the sampler's point store. Sole reader.
// Particle i owns a FIXED cell of the sampler grid; cellT[] resolves the
// station to the buf slot of its nearest emitted point. A stable image
// gives stable targets - no swarm-wide retarget when the count wobbles.
// The first K indices draw the camera viewfinder instead of the figure.
// Colors are the camera's own RGB; z relief and size follow luminance so
// highlights come forward and shadows recede.
import { PT } from "./sampler.js";

export function selfScene(store, field, PAL) {
  const N = field.N, acc = PAL.accent;
  const K = Math.min(600, (N * 0.07) | 0);
  const M = N - K;
  const GRAY = [0.5, 0.55, 0.6];
  // jump-snap: a retargeted particle (camera moved, cell remapped) gets
  // snap=1 and teleports to its new home - the image tracks at sample
  // rate instead of the whole swarm flying. A repelled particle's home
  // never moved, so hover scatter still arcs back through the spring.
  const prev = new Float32Array(N * 3).fill(1e9);
  const JUMP2 = 0.024 * 0.024;
  const fn = (i, t, T, out, col) => {
    if (i < K) {
      // viewfinder: the sampled rect's perimeter in design space, y up,
      // neutral gray edge with accent corner ticks. Snapped - never drifts.
      const a = store.W / (store.H || 120) || 4 / 3;
      const ha = a / 2, per = 2 * (a + 1);
      const s0 = (i / K) * per;
      let s = s0, x, y;
      if (s < a) { x = -ha + s; y = 0.5; }
      else if (s < a + 1) { s -= a; x = ha; y = 0.5 - s; }
      else if (s < 2 * a + 1) { s -= a + 1; x = ha - s; y = -0.5; }
      else { s -= 2 * a + 1; x = -ha; y = -0.5 + s; }
      out[0] = x;
      out[1] = y;
      out[2] = 0;
      out[3] = 1;
      const q = s0 % (per / 4);
      const c = q < 0.06 || q > per / 4 - 0.06 ? acc : GRAY;
      const g = c === acc ? 0.9 : 0.55;
      col[0] = c[0] * g;
      col[1] = c[1] * g;
      col[2] = c[2] * g;
      return;
    }
    const b3 = i * 3;
    const dead = () => {
      out[0] = 0; out[1] = -99; out[2] = 0; out[3] = 1;
      col[0] = col[1] = col[2] = 0;
      prev[b3] = 0; prev[b3 + 1] = -99; prev[b3 + 2] = 0;
    };
    if (!store.count || !store.cellT) { dead(); return; }
    const st = ((i - K) * store.cells / M) | 0;
    let j = store.cellT[st];
    if (j < 0) { dead(); return; }
    // stations that didn't emit share-load across a local window of the
    // emit list, so the flood of background stations spreads along the
    // contour instead of piling on the single nearest cell
    if (store.cellEmit && !store.cellEmit[st] && store.count > 1) {
      const spread = Math.max(1, (store.count * 0.05) | 0);
      const k = ((j / PT.STRIDE) + ((field.h2(i) * spread) | 0)) % store.count;
      j = k * PT.STRIDE;
    }
    // cell-sized dither: particles sharing a point spread over its full
    // emit cell instead of stacking on one center
    const d = (store.stride || 2) / (store.H || 120);
    const shade = store.buf[j + PT.SHADE];
    out[0] = store.buf[j + PT.X] + (field.h2(i) - 0.5) * d;
    out[1] = store.buf[j + PT.Y] + (field.h3(i) - 0.5) * d;
    // luminance relief: bright pulls nearer, dim recedes, plus the hair
    out[2] = (shade - 0.5) * 0.52 + (field.h1(i) - 0.5) * 0.05;
    // snap only on a real retarget: camera motion teleports the swarm
    // into place (no smear), while a repelled particle's home is
    // unchanged so hover scatter still flies back through the spring
    const d3x = out[0] - prev[b3], d3y = out[1] - prev[b3 + 1], d3z = out[2] - prev[b3 + 2];
    out[3] = d3x * d3x + d3y * d3y + d3z * d3z > JUMP2 ? 1 : 0;
    prev[b3] = out[0]; prev[b3 + 1] = out[1]; prev[b3 + 2] = out[2];
    if (store.buf[j + PT.EDGE] > 0.5) {
      // edge mode contours keep the accent glow, tinted by the real color
      col[0] = acc[0] * 0.7 + store.buf[j + PT.R] * 0.3;
      col[1] = acc[1] * 0.7 + store.buf[j + PT.G] * 0.3;
      col[2] = acc[2] * 0.7 + store.buf[j + PT.B] * 0.3;
      field.size[i] = 1.0;
    } else {
      // raw camera color with a shadow floor: on the dark page a dim
      // pixel renders as a hole in the silhouette - scale RGB up until
      // the strongest channel reads, preserving hue (navy stays navy,
      // not gray - an additive floor would wash darks out)
      let r = store.buf[j + PT.R], g = store.buf[j + PT.G], b = store.buf[j + PT.B];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (mx < 0.3) {
        const k = 0.3 / (mx + 0.03);
        r *= k; g *= k; b *= k;
      }
      col[0] = Math.min(1, r);
      col[1] = Math.min(1, g);
      col[2] = Math.min(1, b);
      field.size[i] = 0.7 + 0.85 * shade; // highlights swell, shadows stay legible
    }
  };
  fn.ext = [store.W / store.H || 4 / 3, 1];
  return fn;
}
