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
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.aiHold = true; b.shieldOn = false; b.W.state = "ground";
  window.__fray.fighters[0].x = b.J.root.x - 240;
});
await page.waitForTimeout(900);
const foe = await page.evaluate(() => ({ x: window.__fray.fighters[1].J.chest.x, y: window.__fray.fighters[1].J.chest.y }));
const snap = () => page.evaluate(() => {
  const a = window.__fray.fighters[0];
  const J = a.J;
  return {
    rootX: J.root.x | 0, bellyDX: (J.belly.x - J.root.x) | 0,
    chestDX: (J.chest.x - J.belly.x) | 0, headDX: (J.head.x - J.neck.x) | 0,
    shoDX: (J.sho.x - J.root.x) | 0, handX: J.hand.x | 0,
    tipX: a.W.seg.bx | 0, waistC: +a.waistCon.center.toFixed(3),
    hits: window.__fray.damage.total.hits,
  };
});
console.log("idle", JSON.stringify(await snap()));
await page.mouse.move(foe.x - 260, foe.y - 50);
await page.mouse.down({ button: "left" });
for (let i = 0; i < 6; i++) {
  console.log("wind", JSON.stringify(await snap()));
  await page.waitForTimeout(80);
}
await page.mouse.move(foe.x + 90, foe.y - 30, { steps: 4 });
for (let i = 0; i < 6; i++) {
  console.log("thru", JSON.stringify(await snap()));
  await page.waitForTimeout(80);
}
await page.mouse.up({ button: "left" });
await browser.close();
