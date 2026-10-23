import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);
import { mkdirSync } from "fs";

const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://localhost:8321/fighter.html");
await page.waitForFunction(() => window.__fray);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click("#go");
await page.waitForFunction(() => window.__fray.match.state === "fight");
mkdirSync("shots/seq", { recursive: true });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(260);
  await page.screenshot({ path: `shots/seq/w${i}.png` });
}
await browser.close();
