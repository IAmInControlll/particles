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
await page.evaluate(() => { window.__fray.fighters[1].aiHold = true; });

// step the player to whip range of the foe and track mass/hits
await page.evaluate(() => {
  const [a, b] = window.__fray.fighters;
  a.x = b.J.root.x - 240;
});
await page.waitForTimeout(600);

const track = () => page.evaluate(() => {
  const [a, b] = window.__fray.fighters;
  return {
    bMass: b.mass, bDead: b.dead(), bFaint: +b.faintT.toFixed(2),
    bStag: +b.staggerT.toFixed(2), state: window.__fray.match.state,
    sev: b.parts.filter((p) => p.severed).map((p) => p.name),
    tipV: a.W.tipSpeed | 0,
    rootY: b.J.root.y | 0, headY: b.J.head.y | 0,
  };
});
console.log("start", JSON.stringify(await track()));

// two hard whips through the foe's head
for (let w = 0; w < 2; w++) {
  const pos = await page.evaluate(() => {
    const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
    return { sx: a.J.sho.x, sy: a.J.sho.y, hx: b.J.head.x, hy: b.J.head.y };
  });
  await page.mouse.move(pos.sx + 40, pos.sy - 120); // windup: hand high
  await page.mouse.down();
  await page.waitForTimeout(120);
  // fast sweep through the head
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(pos.sx + 40 + (pos.hx - pos.sx) * t, pos.sy - 120 + (pos.hy + 40 - (pos.sy - 120)) * t);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
  console.log(`whip${w + 1}`, JSON.stringify(await track()));
}
await page.screenshot({ path: "shots/macekill.png" });
await browser.close();
