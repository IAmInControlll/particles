// scene.js - "self" scene fn: reads the sampler's point store. Sole reader.
import { PT } from "./sampler.js";

export function selfScene(store, field, PAL) {
  const N = field.N, mist = PAL.mist, ink = PAL.ink, acc = PAL.accent;
  const fn = (i, t, T, out, col) => {
    if (!store.count) { out[0] = out[2] = 0; out[1] = -99; col[0] = col[1] = col[2] = 0; return; }
    const j = ((i * store.count / N) | 0) * PT.STRIDE;
    out[0] = store.buf[j + PT.X];
    out[1] = store.buf[j + PT.Y];
    out[2] = (field.h1(i) - 0.5) * 0.06;
    if (store.buf[j + PT.EDGE] > 0.5) { col[0] = acc[0]; col[1] = acc[1]; col[2] = acc[2]; }
    else {
      const s = store.buf[j + PT.SHADE];
      col[0] = mist[0] + (ink[0] - mist[0]) * s;
      col[1] = mist[1] + (ink[1] - mist[1]) * s;
      col[2] = mist[2] + (ink[2] - mist[2]) * s;
    }
  };
  fn.ext = [store.W / store.H || 4 / 3, 1];
  return fn;
}
