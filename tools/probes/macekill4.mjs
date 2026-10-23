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
await page.goto("http://localhost:8321/fighter.html");
await page.waitForFunction(() => window.__fray);
const fray = (fn) => page.evaluate(fn);

await page.click('button[data-g="weapon"][data-v="mace"]');
await page.click("#go");
await page.waitForFunction(() => window.__fray.match.state === "fight");

await fray(() => {
  const b = window.__fray.fighters[1];
  b.shieldOn = false;
  b.W.setSpec("fists");
  b.W.reset();
});

for (let i = 0; i < 6; i++) {
  const st = await fray(() => {
    const [a, b] = window.__fray.fighters;
    if (b.mass < 200 || b.dead()) b.reset(a.x + 340);
    if (a.W.state !== "held") a.W.reset();
    return {
      m: b.mass, hits: window.__fray.damage.total.hits,
      x: b.J.chest.x, y: b.J.chest.y, ax: a.x,
    };
  });
  await page.mouse.move(st.x - 240, st.y - 80);
  await page.mouse.down({ button: "left" });
  await page.waitForTimeout(80);
  await page.mouse.move(st.x - 20, st.y - 40, { steps: 4 });
  await page.mouse.move(st.x + 80, st.y - 60, { steps: 4 });
  await page.waitForTimeout(120);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(500);
  const after = await fray(() => {
    const [a, b] = window.__fray.fighters;
    return {
      m: b.mass, hits: window.__fray.damage.total.hits,
      wSt: a.W.state, dead: b.dead(), tip: a.W.tipSpeed | 0,
    };
  });
  console.log(`swing${i}: mass ${st.m}->${after.m} (d${st.m - after.m}) hits ${st.hits}->${after.hits} wSt=${after.wSt} dead=${after.dead}`);
}
await browser.close();
