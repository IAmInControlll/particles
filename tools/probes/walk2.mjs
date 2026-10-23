import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);
import { mkdirSync } from "fs";

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
mkdirSync("shots/seq", { recursive: true });
// hold D (walk right) for the player; foe AI will do its own thing
await page.keyboard.down("d");
for (let i = 0; i < 7; i++) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/seq/pw${i}.png` });
  const s = await fray(() => {
    const a = window.__fray.fighters[0];
    return { rx: a.J.root.x | 0, ry: a.J.root.y | 0, fy: Math.min(a.J.footF.y, a.J.footB.y) | 0,
      pitch: ((a.J.chest.x - a.J.root.x) / (a.J.root.y - a.J.chest.y + 0.01) * 57.3) | 0, vx: a.vx | 0 };
  });
  console.log(i, JSON.stringify(s));
}
await page.keyboard.up("d");
await browser.close();
