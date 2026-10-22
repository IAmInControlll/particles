// fillshots.mjs - per-ship mid-run shots + hull grain coverage metrics.
// shots -> shots/space-fill-{kestrel,dart,mule}.png
// usage: node src/creations/space/fillshots.mjs [ship ...]
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);
const OUT = path.join(root, "shots");
mkdirSync(OUT, { recursive: true });

const errors = [];
const probes = {};
const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

// lit-pixel stats over a fractional rect; hull backing sits under ~25,
// grain dots push pixels past the threshold
const metric = (file) => page.evaluate(async (file) => {
  const img = new Image();
  img.src = `/shots/${file}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const stat = (x0, y0, x1, y1) => {
    let lit = 0, n = 0, sum = 0;
    for (let y = (y0 * c.height) | 0; y < y1 * c.height; y += 2)
      for (let x = (x0 * c.width) | 0; x < x1 * c.width; x += 2) {
        const i = (y * c.width + x) * 4;
        const m = Math.max(d[i], d[i + 1], d[i + 2]);
        sum += m;
        if (m > 42) lit++;
        n++;
      }
    return { litPct: +((lit / n) * 100).toFixed(1), mean: +(sum / n).toFixed(1) };
  };
  return { dash: stat(0.05, 0.62, 0.95, 0.97), top: stat(0.05, 0.03, 0.95, 0.45) };
}, file);

// glass rect per ship (fractional px): fill must not invade open panes
const GLASS = {
  kestrel: [0.4, 0.28, 0.6, 0.45],
  dart: [0.3, 0.28, 0.45, 0.5],
  mule: [0.35, 0.32, 0.65, 0.5],
};
const glassMetric = (file, r) => page.evaluate(async ({ file, r }) => {
  const img = new Image();
  img.src = `/shots/${file}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0, n = 0;
  for (let y = (r[1] * c.height) | 0; y < r[3] * c.height; y += 2)
    for (let x = (r[0] * c.width) | 0; x < r[2] * c.width; x += 2) {
      const i = (y * c.width + x) * 4;
      if (Math.max(d[i], d[i + 1], d[i + 2]) > 42) lit++;
      n++;
    }
  return +((lit / n) * 100).toFixed(1);
}, { file, r });

const ships = process.argv.slice(2);
const which = ships.length ? ships : ["kestrel", "dart", "mule"];
for (const ship of which) {
  await page.goto(`http://localhost:8321/space.html?ship=${ship}`);
  await page.waitForTimeout(2500);
  await page.evaluate("window.__space.auto = true");
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, `space-fill-${ship}.png`) });
  probes[ship] = {
    pts: await page.evaluate("__space.cockpit.pts"),
    motes: await page.evaluate("__space.cockpit.motes"),
    fill: await metric(`space-fill-${ship}.png`),
    glassLitPct: await glassMetric(`space-fill-${ship}.png`, GLASS[ship]),
  };
  try {
    probes[ship].before = await metric(`space-frame-${ship}.png`);
    probes[ship].glassLitPctBefore = await glassMetric(`space-frame-${ship}.png`, GLASS[ship]);
  } catch { probes[ship].before = "no baseline shot"; }
}
console.log(JSON.stringify({ errors, probes }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
