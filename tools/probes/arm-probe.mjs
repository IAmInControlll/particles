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
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.aiHold = true; b.shieldOn = false; b.W.state = "ground";
});
for (let i = 0; i < 6; i++) {
  const s = await page.evaluate(() => {
    const a = window.__fray.fighters[0];
    return { st: a.W.state, fore: a.part.fore.severed, upper: a.part.upper.severed, rx: a.J.root.x | 0, handX: a.J.hand.x | 0, elbX: a.J.elb.x | 0, shoX: a.J.sho.x | 0, aimOn: a.intent.aimOn, aimX: a.intent.aim.x | 0 };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(300);
}
// teleport stance like stepIn, then watch the arm during catch-up
await page.evaluate(() => { const [a, b] = window.__fray.fighters; a.x = b.J.root.x - 240; });
for (let i = 0; i < 10; i++) {
  const s = await page.evaluate(() => {
    const a = window.__fray.fighters[0];
    return { st: a.W.state, fore: a.part.fore.severed, rx: a.J.root.x | 0, handX: a.J.hand.x | 0, elbX: a.J.elb.x | 0, shoX: a.J.sho.x | 0, tipV: a.W.tipSpeed | 0 };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(150);
}
await browser.close();
