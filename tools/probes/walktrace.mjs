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
await page.click("#go");
await page.waitForFunction(() => window.__fray.match.state === "fight");
await page.keyboard.down("d");
for (let i = 0; i < 26; i++) {
  await page.waitForTimeout(80);
  const s = await fray(() => {
    const a = window.__fray.fighters[0];
    const J = a.J;
    return [J.root.y | 0, J.root.x | 0, J.chest.y | 0, J.footF.y | 0, J.footF.x | 0,
      J.footB.y | 0, J.footB.x | 0, J.kneeF.y | 0, a.feet.F.t.toFixed(2), a.feet.B.t.toFixed(2),
      (a.J.chest.x - a.J.root.x) | 0, a.vx | 0];
  });
  console.log(`${(i * 0.08).toFixed(2)} ry=${s[0]} rx=${s[1]} cy=${s[2]} fF=${s[3]}@${s[4]} fB=${s[5]}@${s[6]} kF=${s[7]} tF=${s[8]} tB=${s[9]} cxdx=${s[10]} vx=${s[11]}`);
}
await page.keyboard.up("d");
await browser.close();
