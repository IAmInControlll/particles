import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);

const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const fray = (fn) => page.evaluate(fn);
await page.goto("http://localhost:8321/fighter.html");
await page.waitForFunction(() => window.__fray);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click("#go");
await page.waitForFunction(() => window.__fray.match.state === "fight");
await page.waitForTimeout(800);

// sample every joint + the particle positions for 2s, report max |v| and jitter
const r = await fray(() => new Promise((res) => {
  const f = window.__fray.fighters[0];
  const field = window.__fray.field;
  const jn = Object.keys(f.J).filter((k) => !f.J[k].gone);
  const prev = {}, jv = {};
  for (const k of jn) { prev[k] = [f.J[k].x, f.J[k].y]; jv[k] = []; }
  const p0 = f.lo, p1 = f.lo + 200;
  const pPrev = new Float32Array((p1 - p0) * 2);
  const pJit = new Float32Array(p1 - p0);
  for (let p = p0; p < p1; p++) { pPrev[(p - p0) * 2] = field.pos[p * 3]; pPrev[(p - p0) * 2 + 1] = field.pos[p * 3 + 1]; }
  let n = 0, t0 = null;
  const poll = (ts) => {
    if (t0 === null) t0 = ts;
    const dt = 1 / 60;
    for (const k of jn) {
      const j = f.J[k];
      const v = Math.hypot(j.x - prev[k][0], j.y - prev[k][1]) / dt;
      jv[k].push(v); prev[k] = [j.x, j.y];
    }
    for (let p = p0; p < p1; p++) {
      const d = Math.hypot(field.pos[p * 3] - pPrev[(p - p0) * 2], field.pos[p * 3 + 1] - pPrev[(p - p0) * 2 + 1]);
      pJit[p - p0] += d;
      pPrev[(p - p0) * 2] = field.pos[p * 3]; pPrev[(p - p0) * 2 + 1] = field.pos[p * 3 + 1];
    }
    n++;
    if (ts - t0 < 2000) requestAnimationFrame(poll); else {
      const out = {};
      for (const k of jn) {
        const a = jv[k];
        const mx = Math.max(...a) | 0;
        const avg = (a.reduce((s, v) => s + v, 0) / a.length) | 0;
        out[k] = `${avg}/${mx}`;
      }
      const jit = [...pJit].map((x) => x / n);
      res({ frames: n, jointAvgMax: out, partAvgJit: (jit.reduce((s, x) => s + x, 0) / jit.length).toFixed(1),
        partMaxJit: Math.max(...jit).toFixed(1) });
    }
  };
  requestAnimationFrame(poll);
}));
console.log(JSON.stringify(r, null, 1));
await browser.close();
