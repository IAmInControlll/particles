// Verify the playground + hub in a private headless browser.
// Uses playwright-core bundled with Devin; browsers from the ms-playwright cache.
import { createRequire } from "module";
import { mkdirSync } from "fs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);

const BASE = "http://localhost:8321";
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const pick = async (v) =>
  page.evaluate((v) => {
    const s = document.querySelector("#panel select");
    s.value = v;
    s.dispatchEvent(new Event("change"));
    return s.value;
  }, v);

await page.goto(`${BASE}/playground.html`);
await page.waitForTimeout(3000);
await shot("01-ring");

for (const sc of ["cube", "spiral", "star"]) {
  await pick(sc);
  await page.waitForTimeout(2800);
  await shot(`02-${sc}`);
}

// custom text - y-flip regression check
await page.evaluate(() => {
  const inp = [...document.querySelectorAll("#panel input")].find(
    (i) => i.type === "text"
  );
  inp.value = "PARTICLES";
  [...document.querySelectorAll("#panel button")]
    .find((b) => b.textContent.trim() === "Form")
    .click();
});
await page.waitForTimeout(3500);
await shot("03-text");

// drift
await pick("__drift");
await page.waitForTimeout(2500);
await shot("04-drift");

// pointer interaction - hover sweep then a drag
await pick("ring");
await page.waitForTimeout(2800);
await page.mouse.move(800, 450);
await page.waitForTimeout(400);
await page.mouse.move(1000, 400);
await page.waitForTimeout(400);
await shot("05-hover");
await page.mouse.move(600, 500);
await page.mouse.down();
await page.mouse.move(900, 550, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(600);
await shot("06-drag");

// black-hole capture - hold still on the ring's edge where particles stream
await page.mouse.move(600, 150);
await page.mouse.down();
await page.waitForTimeout(1600);
await shot("07-capture-mid");
await page.waitForTimeout(1600);
await shot("08-capture-core");
await page.mouse.up();
await page.waitForTimeout(500);
await shot("09-release");

// live control - bump point size via the first range input under Render
await page.evaluate(() => {
  const det = [...document.querySelectorAll("#panel details")].find((d) =>
    d.querySelector("summary")?.textContent.includes("Render")
  );
  if (det && !det.open) det.querySelector("summary").click();
});
await page.waitForTimeout(300);
const sliderInfo = await page.evaluate(() => {
  const det = [...document.querySelectorAll("#panel details")].find((d) =>
    d.querySelector("summary")?.textContent.includes("Render")
  );
  const r = det?.querySelector("input[type=range]");
  if (!r) return null;
  const before = r.value;
  r.value = r.max;
  r.dispatchEvent(new Event("input"));
  return { before, after: r.value };
});
await page.waitForTimeout(800);
await shot("10-render-max");

// rebuild
await page.evaluate(() => {
  [...document.querySelectorAll("#panel button")]
    .find((b) => /rebuild/i.test(b.textContent))
    ?.click();
});
await page.waitForTimeout(3000);
await shot("11-rebuilt");

// hub - title y-flip regression check
await page.goto(`${BASE}/`);
await page.waitForTimeout(4500);
await shot("12-hub");

console.log(JSON.stringify({ errors, sliderInfo }, null, 2));
await browser.close();
