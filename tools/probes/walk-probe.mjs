import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core");
const browser = await chromium.launch({ executablePath: "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("ERR", String(e)));
await page.goto("http://localhost:8321/fighter.html");
await page.waitForTimeout(1200);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click('button[data-g="shield"][data-v="buckler"]');
await page.click("#go");
await page.waitForTimeout(400);
await page.evaluate(() => { window.__fray.fighters[1].aiHold = true; });
await page.keyboard.down("d");
for (let i = 0; i < 14; i++) {
  const s = await page.evaluate(() => {
    const f = window.__fray.fighters[0];
    const J = f.J;
    const v = (j) => Math.round((j.x - j.px) * 60);
    return {
      rx: J.root.x | 0, fx: f.x | 0, vx: f.vx | 0, mv: f.intent.move,
      rootV: v(J.root),
      fF: { x: J.footF.x | 0, px: f.feet.F.px | 0, t: +f.feet.F.t.toFixed(2) },
      fB: { x: J.footB.x | 0, px: f.feet.B.px | 0, t: +f.feet.B.t.toFixed(2) },
    };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(120);
}
await page.keyboard.up("d");
await browser.close();
