// fillshots.mjs - per-ship cockpit shots + canopy fill metrics from deck.fill():
// glass % of screen, mask-vs-paint disagreement, top-left comms zone glass.
// shots -> shots/space-fill-{ship}-{w}x{h}.png
// usage: PORT=8321 node src/creations/space/fillshots.mjs [ship ...]
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);
const BASE = `http://localhost:${process.env.PORT || 8321}`;
const OUT = path.join(root, "shots");
mkdirSync(OUT, { recursive: true });

const errors = [];
const probes = {};
const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const VIEWS = [[1600, 900], [390, 844]];
const ships = process.argv.slice(2);
for (const [w, h] of VIEWS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const ship of ships.length ? ships : ["kestrel", "dart", "mule"]) {
    await page.goto(`${BASE}/space.html?ship=${ship}&view=cockpit`);
    await page.waitForTimeout(2500);
    await page.evaluate("window.__space.auto = true");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(OUT, `space-fill-${ship}-${w}x${h}.png`) });
    probes[`${ship} ${w}x${h}`] = await page.evaluate("__space.deck.fill(2)");
  }
  await page.close();
}
console.log(JSON.stringify({ errors, probes }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
