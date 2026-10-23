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
  const a = window.__fray.fighters[0];
  a.x = b.J.root.x - 230;
});
await page.waitForTimeout(700);

const track = () => page.evaluate(() => {
  const [a, b] = window.__fray.fighters;
  const D = window.__fray.damage;
  return {
    bMass: b.mass, bDead: b.dead(), bFaint: +b.faintT.toFixed(2),
    hits: D.total.hits, clashes: D.total.clashes,
    tipV: a.W.tipSpeed | 0, wState: a.W.state,
    aStam: +a.stam.toFixed(2),
    rootY: b.J.root.y | 0, bx: b.J.root.x | 0, ax: a.J.root.x | 0,
  };
});
console.log("start", JSON.stringify(await track()));

// 4 hard whips through the foe's head, counting hits + mass per swing
for (let w = 0; w < 4; w++) {
  await page.evaluate(() => {
    const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
    a.intent.aimOn = 1;
    a.intent.grip = 1;
    // windup: pull hand behind and above the shoulder
    a.intent.aim.x = a.J.sho.x - a.side * 80;
    a.intent.aim.y = a.J.sho.y - 120;
  });
  await page.waitForTimeout(180);
  // sweep through the head in ~6 fast frames
  for (let i = 0; i <= 6; i++) {
    await page.evaluate((t) => {
      const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
      a.intent.aim.x = a.J.sho.x - a.side * 80 + (b.J.head.x - a.J.sho.x + a.side * 80 + 60) * t;
      a.intent.aim.y = a.J.sho.y - 120 + (b.J.head.y - a.J.sho.y + 160) * t;
    }, i / 6);
    await page.waitForTimeout(22);
  }
  await page.evaluate(() => {
    const a = window.__fray.fighters[0];
    a.intent.aimOn = 0; a.intent.grip = 0;
  });
  await page.waitForTimeout(650);
  const s = await track();
  console.log(`whip${w + 1}`, JSON.stringify(s));
  if (s.bDead) break;
  // re-approach if the foe was knocked away
  await page.evaluate(() => {
    const [a, b] = window.__fray.fighters;
    a.x = b.J.root.x - 230;
  });
  await page.waitForTimeout(300);
}
await page.screenshot({ path: "shots/macekill2.png" });
await browser.close();
