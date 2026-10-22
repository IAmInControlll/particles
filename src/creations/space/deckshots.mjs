// deckshots.mjs - deck overlay screenshots + pixel/binding probes.
// shots -> shots/space-deck-{boot,race,fight}.png
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);
const OUT = path.join(root, "shots");
mkdirSync(OUT, { recursive: true });

const errors = [];
const probes = {};
const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:8321/space.html");
await page.waitForTimeout(2500);
// pick screen: dart preview narrows the canopy, kestrel for the boot shot
await page.keyboard.press("Digit2");
await page.waitForTimeout(400);
probes.dartPaint = await page.evaluate("!!__space.deck");
await page.keyboard.press("Digit1");
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, "space-deck-boot.png") });
// forward view must stay clear: deck alpha 0 at reticle, opaque on the dash
probes.pixels = await page.evaluate(`(() => {
  const c = document.getElementById("deck");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  const px = (x, y) => d[((y * c.width) + x) * 4 + 3];
  const cx = c.width >> 1, cy = c.height >> 1;
  return { reticle: px(cx, cy), aboveDash: px(cx, (cy * 1.35) | 0),
    dash: px(cx, (cy * 1.65) | 0), nav: px((cx * 0.84) | 0, (cy * 1.6) | 0) };
})()`);

await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.evaluate("window.__space.auto = true");
await page.waitForTimeout(9000);
probes.race = await page.evaluate(
  "({score: __space.run.score, speed: __space.cam.speed|0, dist: __space.run.dist|0, phase: __space.run.phase, msg: document.getElementById('hud-msg').textContent})"
);
await page.screenshot({ path: path.join(OUT, "space-deck-race.png") });

// force a fight wave: two hostiles pinned ahead, radar + lamps should light
await page.evaluate(`(() => {
  const s = __space;
  s.run.phase = "fight"; s.run.wave = Math.max(1, s.run.wave);
  s.ent.spawnShip(); s.ent.spawnShip();
  window.__pin = setInterval(() => {
    for (const sh of s.ent.ships) {
      if (!sh.alive) continue;
      sh.x = s.cam.x + s.cam.fwd[0] * 500 + s.cam.right[0] * 120 * (sh.side || 1);
      sh.y = s.cam.y + s.cam.fwd[1] * 500;
      sh.z = s.cam.z + s.cam.fwd[2] * 500;
      sh.vx = sh.vy = sh.vz = 0;
    }
  }, 60);
  return 1;
})()`);
await page.waitForTimeout(1500);
probes.fight = await page.evaluate(
  "({phase: __space.run.phase, hostiles: __space.run.hostiles, hull: __space.run.hull, shield: __space.run.shield, lives: __space.run.lives})"
);
await page.screenshot({ path: path.join(OUT, "space-deck-fight.png") });
// hit feedback: red edge flicker + warning lamps
await page.evaluate("__space.hit(1); clearInterval(window.__pin)");
await page.waitForTimeout(350);
await page.screenshot({ path: path.join(OUT, "space-deck-hit.png") });

console.log(JSON.stringify({ errors, probes }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
