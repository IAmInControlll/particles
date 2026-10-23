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
await page.waitForTimeout(800);
await page.evaluate(() => { window.__fray.fighters[1].aiHold = true; });

// ---- JUMP: press W, sample root height + grounded for 5s ----
console.log("--- jump ---");
const j0 = await page.evaluate(() => window.__fray.fighters[0].J.root.y);
await page.keyboard.press("w");
const apex = { y: 1e9, t: 0 };
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(100);
  const s = await page.evaluate(() => {
    const a = window.__fray.fighters[0];
    return { ry: a.J.root.y | 0, g: a.grounded, ftY: Math.min(a.J.footF.y, a.J.footB.y) | 0 };
  });
  if (s.ry < apex.y) { apex.y = s.ry; apex.t = i * 0.1; }
  if (i % 5 === 0 || i > 40) console.log(`t=${(i * 0.1).toFixed(1)}s`, JSON.stringify(s));
}
const jEnd = await page.evaluate(() => {
  const a = window.__fray.fighters[0];
  return { ry: a.J.root.y | 0, g: a.grounded };
});
console.log("jump: start", j0 | 0, "apex", apex.y | 0, "end", JSON.stringify(jEnd));

// ---- MACE KILL: two applyHits to the foe's head ----
console.log("--- mace ---");
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.reset(1300); b.W.reset();
});
await page.waitForTimeout(400);
const m0 = await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  return { mass: b.mass, headI: b.integrity.head, dead: b.dead() };
});
console.log("before", JSON.stringify(m0));
for (let hit = 0; hit < 2; hit++) {
  await page.evaluate(() => {
    const b = window.__fray.fighters[1];
    const j = b.J.head;
    b.applyHit(j.x, j.y, 2400, 0.8, -0.3, 0.3); // mace-weighted hit, cut 0.3
  });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const b = window.__fray.fighters[1];
    return {
      mass: b.mass, headI: +b.integrity.head.toFixed(1),
      sev: b.parts.filter((p) => p.severed).map((p) => p.name),
      dead: b.dead(), rootY: b.J.root.y | 0,
    };
  });
  console.log(`hit${hit + 1}`, JSON.stringify(m));
}
await browser.close();
