import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core");
const browser = await chromium.launch({ executablePath: "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:8321/fighter.html");
await page.waitForTimeout(1200);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click('button[data-g="shield"][data-v="buckler"]');
await page.click("#go");
await page.waitForTimeout(600);
// hold the foe so only the player's idle body is measured
await page.evaluate(() => { window.__fray.fighters[1].aiHold = true; });
// sample joint heights + drift over 4s of no input
for (let k = 0; k < 8; k++) {
  const s = await page.evaluate(() => {
    const f = window.__fray.fighters[0];
    const J = f.J;
    const v = (j) => Math.round(Math.hypot(j.x - j.px, j.y - j.py) * 60);
    return {
      t: performance.now() | 0,
      rootY: J.root.y | 0, chestY: J.chest.y | 0, headY: J.head.y | 0,
      dx: (J.chest.x - J.root.x) | 0,
      footY: Math.max(J.footF.y, J.footB.y) | 0,
      headV: v(J.head), rootV: v(J.root),
      grounded: f.grounded,
    };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(500);
}
await page.screenshot({ path: "shots/buoy-idle.png" });
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
