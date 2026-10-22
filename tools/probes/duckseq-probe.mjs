import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core");
const browser = await chromium.launch({ executablePath: "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("ERR", String(e)));
await page.goto("http://localhost:8321/fighter.html");
await page.waitForTimeout(1200);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click('button[data-g="shield"][data-v="none"]');
await page.click("#go");
await page.waitForTimeout(500);
// mirror the check: hold the foe at the far wall
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.aiHold = 1;
  b.reset(innerWidth - 240);
});
const snap = (tag) => page.evaluate((t) => {
  const a = window.__fray.fighters[0];
  const J = a.J;
  return {
    t,
    rootY: J.root.y | 0, chestY: J.chest.y | 0, headY: J.head.y | 0,
    footFy: J.footF.y | 0, footBy: J.footB.y | 0,
    kneeFy: J.kneeF.y | 0, kneeBy: J.kneeB.y | 0,
    kneeFx: J.kneeF.x - J.root.x | 0, footFx: J.footF.x - J.root.x | 0,
    stag: +a.staggerT.toFixed(2), faint: +a.faintT.toFixed(2),
    vx: a.vx | 0, cr: a.intent.crouch,
  };
}, tag);
// walk phase exactly like the check
await page.keyboard.down("d");
await page.waitForTimeout(600);
await page.keyboard.up("d");
await page.waitForTimeout(450);
console.log("idle", JSON.stringify(await snap("idle")));
await page.keyboard.down("s");
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(250);
  console.log("s", JSON.stringify(await snap(`s${i}`)));
}
await page.screenshot({ path: "shots/duckseq.png" });
await page.keyboard.up("s");
await browser.close();
