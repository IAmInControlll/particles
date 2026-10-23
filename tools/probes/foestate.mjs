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

for (let t = 0; t < 14; t++) {
  await page.waitForTimeout(400);
  const s = await fray(() => {
    const b = window.__fray.fighters[1];
    const f = Math.min(b.J.footF.y, b.J.footB.y);
    return {
      ry: b.J.root.y | 0, cy: b.J.chest.y | 0, fy: f | 0,
      g: b.grounded, faint: +b.faintT.toFixed(2), stag: +b.staggerT.toFixed(2),
      st: window.__fray.match.state, mv: b.intent.move,
    };
  });
  console.log(`${(t * 0.4).toFixed(1)}s`, JSON.stringify(s));
}
await browser.close();
