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
await page.waitForTimeout(500);
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.aiHold = true; b.shieldOn = false; b.W.state = "ground";
});
// step into range like the check does (teleports the stance target)
await page.evaluate(() => {
  const [a, b] = window.__fray.fighters;
  a.x = b.J.root.x - 240;
});
await page.waitForTimeout(900);
const foe = await page.evaluate(() => ({ x: window.__fray.fighters[1].J.chest.x, y: window.__fray.fighters[1].J.chest.y }));
console.log("foe", JSON.stringify(foe));
await page.mouse.move(foe.x - 260, foe.y - 50);
await page.mouse.down({ button: "left" });
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(() => {
    const [a, b] = window.__fray.fighters;
    const w = a.W;
    return {
      handX: a.J.hand.x | 0, handY: a.J.hand.y | 0,
      tipX: w.seg.bx | 0, tipY: w.seg.by | 0,
      tipV: w.tipSpeed | 0,
      foeX: b.J.chest.x | 0, foeY: b.J.chest.y | 0,
      aRoot: a.J.root.x | 0,
      hits: window.__fray.damage.total.hits,
    };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(60);
}
await page.mouse.move(foe.x + 90, foe.y - 50, { steps: 4 });
await page.waitForTimeout(200);
for (let i = 0; i < 8; i++) {
  const s = await page.evaluate(() => {
    const [a, b] = window.__fray.fighters;
    const w = a.W;
    return {
      tipX: w.seg.bx | 0, tipY: w.seg.by | 0, tipV: w.tipSpeed | 0,
      foeX: b.J.chest.x | 0, hits: window.__fray.damage.total.hits,
    };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(60);
}
await page.mouse.up({ button: "left" });
await page.screenshot({ path: "shots/whip.png" });
await browser.close();
