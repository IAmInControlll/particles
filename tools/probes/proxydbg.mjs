import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core");
const browser = await chromium.launch({ executablePath: "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("ERR", String(e)));
await page.goto("http://localhost:8321/fighter.html");
await page.waitForTimeout(1200);
await page.click('button[data-g="weapon"][data-v="mace"]');
await page.click('button[data-g="shield"][data-v="none"]');
await page.click("#go");
await page.waitForTimeout(900);
await page.evaluate(() => { window.__fray.fighters[1].aiHold = true; });

const j = () => page.evaluate(() => {
  const a = window.__fray.fighters[0];
  const J = a.J;
  const d = (p) => ({ x: p.x | 0, y: p.y | 0 });
  return {
    aim: { x: a.intent.aim.x | 0, y: a.intent.aim.y | 0, on: a.intent.aimOn },
    sho: d(J.sho), hand: d(J.hand), handP: d(J.handP), elb: d(J.elb),
    tip: { x: a.W.seg.bx | 0, y: a.W.seg.by | 0 },
    tipV: a.W.tipSpeed | 0, wState: a.W.state, stam: +a.stam.toFixed(2),
  };
});
console.log("idle", JSON.stringify(await j()));
await page.evaluate(() => {
  const a = window.__fray.fighters[0];
  a.intent.aimOn = 1; a.intent.grip = 1;
  a.intent.aim.x = a.J.sho.x + 200; a.intent.aim.y = a.J.sho.y - 60;
});
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(150);
  console.log(`t${i}`, JSON.stringify(await j()));
}
await browser.close();
