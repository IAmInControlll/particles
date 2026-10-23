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
  b.shieldOn = false;
  b.W.state = "ground"; // blade down - no parry wall in the sweep path
  window.__fray.fighters[0].x = b.J.root.x - 240;
});
await page.waitForTimeout(600);

const pos = await page.evaluate(() => {
  const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
  return { sx: a.J.sho.x, sy: a.J.sho.y, hx: b.J.head.x, hy: b.J.head.y };
});
console.log("pos", JSON.stringify(pos));
await page.mouse.move(pos.sx - 60, pos.sy - 140);
await page.mouse.down();
await page.waitForTimeout(200);
const steps = 10;
for (let i = 0; i <= steps; i++) {
  const t = i / steps;
  await page.mouse.move(
    pos.sx - 60 + (pos.hx + 80 - (pos.sx - 60)) * t,
    pos.sy - 140 + (pos.hy + 30 - (pos.sy - 140)) * t
  );
  const s = await page.evaluate(() => {
    const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
    const seg = a.W.seg;
    const dHead = Math.hypot(seg.bx - b.J.head.x, seg.by - b.J.head.y) | 0;
    const dChest = Math.hypot(seg.bx - b.J.chest.x, seg.by - b.J.chest.y) | 0;
    return {
      ax: seg.ax | 0, ay: seg.ay | 0, bx: seg.bx | 0, by: seg.by | 0,
      dHead, dChest, tipV: a.W.tipSpeed | 0,
      hits: window.__fray.damage.total.hits, cl: window.__fray.damage.total.clashes, bMass: b.mass,
    };
  });
  console.log(`t${i}`, JSON.stringify(s));
  await page.waitForTimeout(24);
}
await page.mouse.up();
await browser.close();
