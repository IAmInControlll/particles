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
await page.waitForTimeout(700);
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.aiHold = true;
  b.shieldOn = false; // drop the buckler so head lines are open
  const a = window.__fray.fighters[0];
  a.x = b.J.root.x - 240;
});
await page.waitForTimeout(600);

const track = () => page.evaluate(() => {
  const [a, b] = window.__fray.fighters;
  const D = window.__fray.damage;
  return {
    bMass: b.mass, bDead: b.dead(), hits: D.total.hits,
    tipV: a.W.tipSpeed | 0, wState: a.W.state,
    handV: Math.hypot(a.J.hand.x - a.J.hand.px, a.J.hand.y - a.J.hand.py) * 60 | 0,
    handPV: Math.hypot(a.J.handP.x - a.J.handP.px, a.J.handP.y - a.J.handP.py) * 60 | 0,
    aStam: +a.stam.toFixed(2),
  };
});
console.log("start", JSON.stringify(await track()));

// windup then sweep through the head - real mouse path over the canvas
const pos = await page.evaluate(() => {
  const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
  return { sx: a.J.sho.x, sy: a.J.sho.y, hx: b.J.head.x, hy: b.J.head.y };
});
for (let w = 0; w < 5; w++) {
  await page.mouse.move(pos.sx - 60, pos.sy - 140); // windup behind shoulder
  await page.mouse.down();
  await page.waitForTimeout(200);
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(
      pos.sx - 60 + (pos.hx + 80 - (pos.sx - 60)) * t,
      pos.sy - 140 + (pos.hy + 30 - (pos.sy - 140)) * t
    );
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  const s = await track();
  console.log(`whip${w + 1}`, JSON.stringify(s));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const [a, b] = window.__fray.fighters;
    a.x = b.J.root.x - 240;
    if (a.W.state !== "held") a.W.reset();
  });
  await page.waitForTimeout(300);
}
await browser.close();
