import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core");
const browser = await chromium.launch({ executablePath: "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://localhost:8321/fighter.html");
await page.waitForTimeout(1200);
await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click('button[data-g="shield"][data-v="buckler"]');
await page.click("#go");
await page.waitForTimeout(1600);
await page.evaluate(() => { window.__fray.fighters[1].aiHold = true; window.__fray.fighters[1].reset(1300); });
await page.waitForTimeout(800);
await page.screenshot({ path: "shots/face-idle.png" });
// tight crop of the player's head for readability check
await page.screenshot({ path: "shots/face-crop.png", clip: { x: 500, y: 420, width: 260, height: 200 } });
await browser.close();
