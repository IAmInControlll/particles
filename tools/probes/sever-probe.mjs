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
await page.click('button[data-g="shield"][data-v="none"]');
await page.click("#go");
await page.waitForTimeout(500);
// sever the foe's forearm at the elbow and watch the chunk fly
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.aiHold = true;
  b.integrity.elb = 0.5; // one tap from severing
  b.W.state = "ground";
  b.shieldOn = false;
});
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.applyHit(b.J.elb.x, b.J.elb.y, 900, 0.7, 0.3, 1);
});
await page.waitForTimeout(400);
const s1 = await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  let maxSpan = 0;
  for (const pt of b.parts) {
    if (pt.type !== "bone" || pt.severed) continue;
    const a = b.J[pt.ja], c = b.J[pt.jb];
    if (a && c) maxSpan = Math.max(maxSpan, Math.hypot(c.x - a.x, c.y - a.y));
  }
  return {
    sev: b.parts.filter((p) => p.severed).map((p) => p.name),
    maxSpan: maxSpan | 0,
    mass: b.mass,
    elbX: b.J.elb_x ? (b.J.elb_x.x | 0) : null,
    cons: b.cons.filter((c) => c.broken).length,
  };
});
console.log("sever", JSON.stringify(s1));
await page.screenshot({ path: "shots/sever-elb.png" });
// sever the whole upper body at the chest - exercises hinge breaks
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.integrity.chest = 0.5;
  b.applyHit(b.J.chest.x, b.J.chest.y, 1400, 0.6, -0.4, 1);
});
await page.waitForTimeout(600);
const s2 = await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  return {
    sev: b.parts.filter((p) => p.severed).map((p) => p.name).length,
    mass: b.mass,
    dead: b.dead(),
  };
});
console.log("chest", JSON.stringify(s2));
await page.screenshot({ path: "shots/sever-chest.png" });
// reset - a rearm must restore every part, link, and hinge
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.reset(1100);
  b.W.reset();
});
await page.waitForTimeout(800);
const s3 = await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  return {
    sev: b.parts.filter((p) => p.severed).length,
    broken: b.cons.filter((c) => c.broken).length,
    mass: b.mass,
    mass0: b.mass0,
    chestY: b.J.chest.y | 0,
    clones: Object.keys(b.J).filter((k) => k.endsWith("_x")).length,
  };
});
console.log("reset", JSON.stringify(s3));
await page.screenshot({ path: "shots/sever-reset.png" });
if (errors.length) console.log("ERRORS:", errors.slice(0, 4));
await browser.close();
