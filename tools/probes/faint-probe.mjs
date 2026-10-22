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
  const [a, b] = window.__fray.fighters;
  b.aiHold = true;
  a.x = b.J.root.x - 260;
});
await page.waitForTimeout(400);
// hold LMB and whip hard like the clash phase does
const sh = await page.evaluate(() => ({ x: window.__fray.fighters[0].J.sho.x, y: window.__fray.fighters[0].J.sho.y }));
await page.mouse.move(sh.x - 40, sh.y + 120);
await page.mouse.down({ button: "left" });
for (let i = 0; i < 30; i++) {
  const s = await page.evaluate(() => {
    const a = window.__fray.fighters[0];
    const J = a.J;
    return {
      stam: +a.stam.toFixed(2), faintT: +a.faintT.toFixed(2),
      stretch: J.handP ? +Math.hypot(J.handP.x - J.hand.x, J.handP.y - J.hand.y).toFixed(1) : -1,
      tipV: a.W.tipSpeed | 0,
      armDead: a.part.fore.severed || a.part.upper.severed,
      handDX: (J.hand.x - J.root.x) | 0,
      proxyDX: J.handP ? (J.handP.x - J.root.x) | 0 : -999,
      hits: window.__fray.damage.total.hits,
    };
  });
  console.log(JSON.stringify(s));
  if (i % 2) await page.mouse.move(sh.x - 40, sh.y + 120, { steps: 2 });
  else await page.mouse.move(sh.x + 300, sh.y - 100, { steps: 2 });
  await page.waitForTimeout(80);
}
await page.mouse.up({ button: "left" });
await page.screenshot({ path: "shots/faint.png" });
await browser.close();
