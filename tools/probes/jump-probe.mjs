import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core");
const browser = await chromium.launch({ executablePath: "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://localhost:8321/fighter.html");
await page.waitForTimeout(1200);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click('button[data-g="shield"][data-v="buckler"]');
await page.click("#go");
await page.waitForTimeout(500);
await page.evaluate(() => { window.__fray.fighters[1].aiHold = true; });
await page.keyboard.press("KeyW");
for (let k = 0; k < 14; k++) {
  const s = await page.evaluate(() => {
    const f = window.__fray.fighters[0];
    return { t: performance.now() | 0, rootY: f.J.root.y | 0, gnd: f.grounded, chestY: f.J.chest.y | 0 };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(300);
}
await browser.close();
