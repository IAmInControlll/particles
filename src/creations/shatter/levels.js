// levels.js - per-band color grading. Every ~4km the corridor and glass
// drift into a new theme; the first ~800m of each band lerps the tint in
// so the shift reads as travelling somewhere, not a palette snap.
const STAGE = 4000, FADE = 800;
const THEMES = [
  [1.0, 1.0, 1.0],    // glacier - the neutral launch look
  [0.62, 1.08, 1.2],  // cyan depth
  [1.05, 0.62, 1.3],  // violet
  [1.3, 0.8, 0.5],    // ember
  [0.62, 1.22, 0.78], // jade
];
export function createLevel() {
  const lv = { t: [1, 1, 1], n: 0 };
  lv.update = (dist) => {
    const k = Math.max(0, dist) / STAGE;
    const i = Math.floor(k) % THEMES.length;
    const p = i === 0 && k < 1 ? 0 : (i + THEMES.length - 1) % THEMES.length;
    const f = Math.min(1, (k % 1) * (STAGE / FADE));
    for (let c = 0; c < 3; c++)
      lv.t[c] = THEMES[p][c] + (THEMES[i][c] - THEMES[p][c]) * f;
    lv.n = i;
  };
  return lv;
}
