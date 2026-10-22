import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core");
const browser = await chromium.launch({ executablePath: "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:8321/fighter.html");
await page.waitForTimeout(1200);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click('button[data-g="shield"][data-v="buckler"]');
await page.click("#go");
await page.waitForTimeout(900);

// hold the foe so each pose is readable
await page.evaluate(() => {
  window.__fray.fighters[1].aiHold = true;
});

const shot = (n) => page.screenshot({ path: `shots/pose-${n}.png` });

// idle guard
await page.waitForTimeout(700);
await shot("idle");

// walk right toward the foe
await page.keyboard.down("d");
await page.waitForTimeout(350);
await shot("walk");
await page.waitForTimeout(700);
await page.keyboard.up("d");

// crouch
await page.keyboard.down("s");
await page.waitForTimeout(500);
await shot("crouch");
await page.keyboard.up("s");
await page.waitForTimeout(400);

// jump
await page.keyboard.down("w");
await page.waitForTimeout(280);
await shot("jump-apex");
await page.waitForTimeout(700);
await page.keyboard.up("w");
await page.waitForTimeout(900);

// whip the blade through the foe's head height
await page.evaluate(() => {
  const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
  a.intent.aim = { x: a.J.root.x + 260, y: a.J.chest.y - 60 };
  a.intent.aimOn = true;
});
await page.waitForTimeout(250);
await shot("windup");
const sweep = await page.evaluate(() => {
  const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
  return { tx: b.J.chest.x, ty: b.J.chest.y, px: a.J.root.x };
});
for (let i = 0; i <= 10; i++) {
  await page.evaluate(({ t, sweep }) => {
    const a = window.__fray.fighters[0];
    a.intent.aim = {
      x: sweep.px + 260 + (sweep.tx - sweep.px - 260) * t,
      y: sweep.ty - 60 + 90 * t,
    };
  }, { t: i / 10, sweep });
  await page.waitForTimeout(28);
}
await shot("swing");
await page.evaluate(() => {
  window.__fray.fighters[0].intent.aimOn = false;
});

// clinch: drive body into the foe until joints repel
await page.keyboard.down("d");
await page.waitForTimeout(1500);
await page.keyboard.up("d");
await shot("clinch");

const state = await page.evaluate(() => {
  const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
  return {
    aMass: a.mass, bMass: b.mass,
    aRoot: a.J.root.x | 0, bRoot: b.J.root.x | 0,
    gap: Math.abs(b.J.root.x - a.J.root.x) | 0,
    headV: Math.hypot(a.J.head.x - a.J.head.px, a.J.head.y - a.J.head.py) * 60 | 0,
    bHits: b.mass0 - b.mass,
  };
});
console.log("state", JSON.stringify(state));
if (errors.length) console.log("ERRORS:", errors.slice(0, 4));
await browser.close();
