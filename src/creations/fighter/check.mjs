// check.mjs - private headless check for Fray. Screenshots -> shots/fighter-*.
// Pass 1 (interactive): boot, movement, a landed whip, kick stagger, throw.
// Pass 2 (flow): ?t= time warp proves a round resolves; poll for matchend.
import { createRequire } from "module";
import { mkdirSync } from "fs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);

const BASE = "http://localhost:8321";
mkdirSync("shots", { recursive: true });
const fail = (msg) => {
  console.log("FAIL:", msg);
  process.exitCode = 1;
};

const errors = [];
const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (n) => page.screenshot({ path: `shots/fighter-${n}.png` });
const fray = (fn) => page.evaluate(fn);

// ---- pass 1: interactive duel ----
await page.goto(`${BASE}/fighter.html`);
await page.waitForTimeout(2200);
await shot("boot");
const boot = await fray(() => ({
  state: window.__fray.match.state,
  mass: window.__fray.fighters.map((f) => f.mass),
  footY: Math.round(window.__fray.fighters[0].J.footF.y),
  floor: Math.round(innerHeight * 0.8),
}));
if (boot.mass[0] !== 290 || boot.mass[1] !== 290) fail(`boot mass ${boot.mass}`);
if (Math.abs(boot.footY - boot.floor) > 20) fail(`feet off floor: ${boot.footY} vs ${boot.floor}`);

// movement: walk, jump, duck
const x0 = await fray(() => window.__fray.fighters[0].x);
await page.keyboard.down("d");
await page.waitForTimeout(600);
await page.keyboard.up("d");
const x1 = await fray(() => window.__fray.fighters[0].x);
if (x1 - x0 < 15) fail(`walk moved only ${x1 - x0}px`);

const yIdle = await fray(() => window.__fray.fighters[0].J.root.y);
await page.keyboard.down("w");
await page.waitForTimeout(350);
const yJump = await fray(() => window.__fray.fighters[0].J.root.y);
await page.keyboard.up("w");
if (yIdle - yJump < 15) fail(`jump rose only ${yIdle - yJump}px`);
await page.waitForTimeout(700);
await page.keyboard.down("s");
await page.waitForTimeout(500);
const yDuck = await fray(() => window.__fray.fighters[0].J.root.y);
await page.keyboard.up("s");
if (yDuck - yIdle < 10) fail(`duck dropped only ${yDuck - yIdle}px`);

// close distance, then whip the cursor through the foe's torso
await page.keyboard.down("d");
for (let i = 0; i < 30; i++) {
  const d = await fray(() =>
    Math.abs(
      window.__fray.fighters[1].J.root.x - window.__fray.fighters[0].J.root.x
    )
  );
  if (d < 140) break;
  await page.waitForTimeout(300);
}
await page.keyboard.up("d");
const foe = await fray(() => ({
  x: Math.round(window.__fray.fighters[1].J.root.x),
  y: Math.round(window.__fray.fighters[1].J.chest.y),
}));
await page.mouse.move(foe.x - 160, foe.y - 80);
await page.mouse.move(foe.x + 40, foe.y + 30, { steps: 3 });
await page.mouse.move(foe.x + 110, foe.y - 40, { steps: 3 });
await page.waitForTimeout(900);
await shot("hit");
const hit = await fray(() => ({
  m1: window.__fray.fighters[1].mass,
  sev1: window.__fray.fighters[1].parts.filter((p) => p.severed).length,
}));
if (hit.m1 >= 290 && !hit.sev1) fail("whip dealt no damage");

// kick staggers at close range
await page.keyboard.press("Space");
await page.waitForTimeout(400);
const kick = await fray(() => window.__fray.fighters[1].staggerT);
if (!(kick > 0)) fail("kick did not stagger");
await shot("kick");

// throw: grip + hard whip + release, then walk over to pick up
await page.mouse.move(foe.x - 260, foe.y + 40);
await page.mouse.down();
await page.mouse.move(foe.x - 60, foe.y - 140, { steps: 4 });
await page.mouse.move(foe.x + 200, foe.y - 60, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(1000);
const wState = await fray(() => window.__fray.fighters[0].W.state);
await shot("throw");
if (wState === "held") fail("release during whip did not throw");

// ---- pass 2: match flow under time warp ----
await page.goto(`${BASE}/fighter.html?t=120`);
await page.waitForTimeout(5000);
const flow = await fray(() => {
  const m = window.__fray.match;
  return { state: m.state, round: m.round, wins: [...m.wins], done: m.roundsDone };
});
await shot("match");
if (flow.done < 1)
  fail(`no round resolved in 120s warp: ${JSON.stringify(flow)}`);

console.log(JSON.stringify({ errors, boot, hit, kick, wState, flow }, null, 1));
await browser.close();
process.exit(errors.length ? 1 : 0);
