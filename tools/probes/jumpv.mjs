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

await fray(() => {
  const a = window.__fray.fighters[0];
  const r = (window.__jr = { t0: window.__fray.field.T, minY: 1e9, landT: 0, standT: 0, g: 0 });
  const poll = () => {
    const t = window.__fray.field.T - r.t0;
    const fy = Math.min(a.J.footF.y, a.J.footB.y);
    if (a.J.root.y < r.minY) r.minY = a.J.root.y;
    if (fy < 700) r.g = t;
    if (!r.landT && t > 0.3 && fy > 705) r.landT = t;
    if (r.landT && !r.standT && a.J.chest.y < a.J.root.y - 90) r.standT = t;
    if (t < 4) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
});
await page.keyboard.down("w");
await page.waitForTimeout(80);
await page.keyboard.up("w");
await page.waitForTimeout(4200);
const r = await fray(() => {
  const a = window.__fray.fighters[0];
  return { minY: window.__jr.minY | 0, airT: +(window.__jr.landT - 0).toFixed(2),
    standT: window.__jr.standT, rootY: a.J.root.y | 0, chestDy: (a.J.root.y - a.J.chest.y) | 0 };
});
console.log(JSON.stringify(r));
await browser.close();
