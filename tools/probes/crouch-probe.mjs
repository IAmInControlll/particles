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
await page.waitForTimeout(900);
await page.evaluate(() => { window.__fray.fighters[1].aiHold = true; window.__fray.fighters[1].reset(1400); });
await page.waitForTimeout(600);

const snap = () => page.evaluate(() => {
  const a = window.__fray.fighters[0];
  const J = a.J;
  const d = (p, q) => Math.hypot(q.x - p.x, q.y - p.y) | 0;
  return {
    rootY: J.root.y | 0, chestY: J.chest.y | 0, headY: J.head.y | 0,
    footFy: J.footF.y | 0, footBy: J.footB.y | 0,
    kneeFy: J.kneeF.y | 0, kneeBy: J.kneeB.y | 0,
    kneeFx: J.kneeF.x - J.root.x | 0, kneeBx: J.kneeB.x - J.root.x | 0,
    footFx: J.footF.x - J.root.x | 0, footBx: J.footB.x - J.root.x | 0,
    thigh: d(J.root, J.kneeF), shin: d(J.kneeF, J.footF),
    cr: a.intent.crouch,
  };
});
console.log("idle ", JSON.stringify(await snap()));
await page.keyboard.down("s");
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(200);
  console.log(`s+${(i + 1) * 200}ms`, JSON.stringify(await snap()));
}
await page.screenshot({ path: "shots/crouch-live.png" });
await page.keyboard.up("s");
await page.waitForTimeout(600);
console.log("up   ", JSON.stringify(await snap()));
await browser.close();
