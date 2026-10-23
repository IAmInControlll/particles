import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);

const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const fray = (fn) => page.evaluate(fn);
await page.goto("http://localhost:8321/fighter.html");
await page.waitForFunction(() => window.__fray);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click('button[data-g="shield"][data-v="buckler"]');
await page.click("#go");
await page.waitForFunction(() => window.__fray.match.state === "fight");

await fray(() => {
  const fr = window.__fray;
  const b = fr.fighters[1];
  b.aiHold = 1;
  b.stam = 1; b.faintT = 0;
  b.setShield("none");
  const [a] = fr.fighters;
  const want = b.J.root.x - 110;
  const dx = want - a.J.root.x;
  for (const jn of Object.keys(a.J)) { a.J[jn].x += dx; a.J[jn].px += dx; }
  a.x += dx;
  a.feet.F.px += dx; a.feet.B.px += dx;
  a.feet.F.tx += dx; a.feet.B.tx += dx;
});
await page.waitForTimeout(400);

await fray(() => {
  const a = window.__fray.fighters[0], b = window.__fray.fighters[1];
  window.__kr = [];
  const poll = () => {
    window.__kr.push({
      t: +window.__fray.field.T.toFixed(2),
      kT: +a.kickT.toFixed(2), ik: a.intent.kick,
      fx: a.J.footF.x | 0, fy: a.J.footF.y | 0,
      foeR: b.J.root.x | 0, aR: a.J.root.x | 0, aX: a.x | 0,
      stag: +b.staggerT.toFixed(2), pull: !!a.J.footF.pull,
    });
    if (window.__kr.length < 40) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
});
await page.keyboard.press("Space");
await page.waitForTimeout(2500);
const kr = await fray(() => window.__kr);
for (const r of kr) console.log(JSON.stringify(r));
await browser.close();
