// check.mjs - private headless check for shatter.html. Screenshots -> shots/shatter-*.png
// usage: node src/creations/shatter/check.mjs [scenario ...]  (default: boot)
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);
const BASE = "http://localhost:8321";
const OUT = path.join(root, "shots");
mkdirSync(OUT, { recursive: true });

// steps: [ms] wait | ["shot", name] | ["eval", js] | ["probe", name, js]
// ["tap", x, y] quick click | ["goto", qs] reload with query
const SCEN = {
  boot: [
    [2500],
    ["probe", "phase", "__shatter.run.phase"],
    ["probe", "ammo", "__shatter.run.ammo"],
    ["probe", "corridorVis", `(() => {
      const f = __shatter.field, L = __shatter.layers.corridor;
      let n = 0;
      for (let p = L.lo; p < L.hi; p++) if (f.homed[p] && f.home[p*3] > -4e3) n++;
      return n;
    })()`],
    ["probe", "fps", `(() => new Promise(r => {
      let n = 0; const s = performance.now();
      const f = () => { n++; performance.now() - s < 1000 ? requestAnimationFrame(f) : r(n) };
      requestAnimationFrame(f);
    }))()`],
    ["shot", "boot"],
  ],
  throw: [
    [1500],
    ["tap", 800, 450],
    ["tap", 700, 400], // back-to-back: pointerdown throws must not lag
    ["tap", 900, 500],
    [120],
    ["probe", "flight", "__shatter.balls.inFlight()"],
    ["probe", "ammo", "__shatter.run.ammo"],
    ["probe", "thrown", "__shatter.run.thrown"],
    ["shot", "throw"],
  ],
  run: [
    [1500],
    ["eval", "__shatter.auto = true"],
    [8000],
    ["shot", "run-early"],
    ["probe", "r1", "({ammo: __shatter.run.ammo, thrown: __shatter.run.thrown, dist: __shatter.run.dist|0, combo: __shatter.run.combo, phase: __shatter.run.phase, paneAlive: __shatter.obs.panes.filter(p=>p.on).length, dying: __shatter.obs.panes.filter(p=>p.deadT>0).length})"],
    [9000],
    ["probe", "r2", "({ammo: __shatter.run.ammo, thrown: __shatter.run.thrown, dist: __shatter.run.dist|0, combo: __shatter.run.combo, phase: __shatter.run.phase, pow: __shatter.run.pow})"],
    ["shot", "run-mid"],
    [9000],
    ["probe", "r3", "({ammo: __shatter.run.ammo, thrown: __shatter.run.thrown, dist: __shatter.run.dist|0, best: __shatter.run.best|0, phase: __shatter.run.phase, multi: __shatter.run.multi})"],
    ["shot", "run-late"],
  ],
  // pane pinned ahead, tap its weak point -> deadT>0 means release ran
  shatter: [
    [1500],
    ["eval", `(() => {
      const s = __shatter, p = s.obs.panes.find(p => p.on && !p.deadT);
      p.z = s.cam.z - 380; p.x = s.cam.laneX(p.z); p.y = s.cam.laneY(p.z);
      const w = s.obs.weakPoint(p);
      s.cam.project(w[0], w[1], w[2]);
      window.__aim = [s.cam.out[0], s.cam.out[1]];
      window.__pane = p;
      return 1;
    })()`],
    [80],
    ["tap", ["js", "window.__aim[0]"], ["js", "window.__aim[1]"]],
    [900],
    ["probe", "deadT", "+(window.__pane.deadT || 0).toFixed(2)"],
    ["probe", "debris", `(() => {
      const f = __shatter.field;
      let n = 0;
      for (let p = window.__pane.lo; p < window.__pane.lo + window.__pane.n; p++)
        if (!f.homed[p]) n++;
      return n;
    })()`],
    ["probe", "score", "__shatter.run.score | 0"], // dist + 30 shatter bonus
    ["shot", "shatter"],
  ],
  // crystal pinned ahead, throw at it -> pays ammo, releases to debris
  crystal: [
    [1500],
    ["eval", `(() => {
      const s = __shatter, c = s.obs.crystals.find(c => !c.on || c.deadT > 0) || s.obs.crystals[0];
      s.run.invuln = 5; // no random pane can confound the probe
      const pin = () => {
        if (c.deadT > 0) return;
        c.on = true; c.deadT = 0;
        c.z = s.cam.z - 300; c.x = s.cam.laneX(c.z); c.y = s.cam.laneY(c.z);
      };
      pin();
      window.__pin = setInterval(pin, 30);
      window.__cry = c; window.__a0 = s.run.ammo; window.__pay = c.pay;
      s.cam.project(c.x, c.y, c.z);
      window.__aim = [s.cam.out[0], s.cam.out[1]];
      return [c.on, c.pay];
    })()`],
    [80],
    ["tap", ["js", "window.__aim[0]"], ["js", "window.__aim[1]"]],
    [1200],
    ["eval", "clearInterval(window.__pin); 1"],
    ["probe", "pay", "({gain: __shatter.run.ammo - window.__a0 + 1, want: window.__pay, dead: !window.__cry.on || window.__cry.deadT > 0, combo: __shatter.run.combo})"],
    ["shot", "crystal"],
  ],
  // an intact pane reaching the camera is a collision: -10, invuln
  collide: [
    [1500],
    ["eval", `(() => {
      const s = __shatter, p = s.obs.panes.find(p => p.on && !p.deadT);
      s.run.ammo = 20; s.run.invuln = 0;
      p.z = s.cam.z - 90; p.x = s.cam.laneX(p.z); p.y = s.cam.laneY(p.z);
      window.__a0 = s.run.ammo; window.__pane = p;
      return 1;
    })()`],
    [700],
    ["probe", "hit", "({ammo: __shatter.run.ammo, was: window.__a0, invuln: +__shatter.run.invuln.toFixed(2), shake: +__shatter.cam.shake.toFixed(2)})"],
    ["shot", "collide"],
  ],
  // combo 3 -> multi 2: one tap throws two balls for one ammo
  multi: [
    [1500],
    ["eval", "__shatter.run.combo = 3; __shatter.run.multi = 2; window.__a0 = __shatter.run.ammo; 1"],
    ["tap", 800, 420],
    [150],
    ["probe", "multi", "({flight: __shatter.balls.inFlight(), ammo: __shatter.run.ammo, was: window.__a0, thrown: __shatter.run.thrown})"],
    ["shot", "multi"],
  ],
  // powerups: claim each kind through the real onHit path, verify effects
  powerups: [
    [1500],
    ["eval", `(() => {
      const s = __shatter;
      for (const k of ["slow", "frenzy", "heavy"]) {
        const pk = s.obs.pickups.find(p => !p.on);
        if (!pk) continue;
        pk.kind = k; pk.on = true; pk.deadT = 0;
        pk.x = s.cam.x; pk.y = s.cam.y; pk.z = s.cam.z - 200;
        s.onHit({ type: "pickup", pk }, { vol: null, x: pk.x, y: pk.y, z: pk.z, pierce: 0 });
      }
      return 1;
    })()`],
    [200],
    ["probe", "pow", "({slow: +__shatter.run.pow.slow.toFixed(1), frenzy: +__shatter.run.pow.frenzy.toFixed(1), heavy: +__shatter.run.pow.heavy.toFixed(1)})"],
    ["eval", "window.__z0 = __shatter.cam.z; 1"],
    [1000],
    ["probe", "slowDt", `(() => {
      // world should advance at ~half speed while slow is active
      const s = __shatter, dz = window.__z0 - s.cam.z;
      return { dz: dz | 0, half: dz < s.cam.speed * (1 + s.cam.ramp) * 0.75 };
    })()`],
    ["probe", "frenzyFree", `(() => {
      const s = __shatter;
      s.run.ammo = 5;
      s.throwAt(800, 450);
      return { before: 5, after: s.run.ammo };
    })()`],
    ["shot", "powerups"],
  ],
  // level tint: jump dist into each band and confirm the theme lands
  level: [
    [1500],
    ["probe", "glacier", "__shatter.lv.t.map(c => +c.toFixed(2))"],
    ["eval", "__shatter.run.dist = 4900; 1"],
    [1000],
    ["probe", "cyan", "__shatter.lv.t.map(c => +c.toFixed(2))"],
    ["shot", "level-cyan"],
    ["eval", "__shatter.run.dist = 8900; 1"],
    [1000],
    ["probe", "violet", "__shatter.lv.t.map(c => +c.toFixed(2))"],
    ["shot", "level-violet"],
  ],
  // pity: starving on ammo with no live crystal must spawn one ahead
  pity: [
    [1500],
    ["eval", `(() => {
      const s = __shatter;
      for (const c of s.obs.crystals) { c.on = false; c.deadT = 0; }
      s.run.ammo = 4;
      return 1;
    })()`],
    [1200],
    ["probe", "fed", "({live: __shatter.obs.crystals.filter(c => c.on && !c.deadT).length, ammo: __shatter.run.ammo})"],
    ["shot", "pity"],
  ],
  // restart: force over then tap -> fresh run
  restart: [
    [1200],
    ["eval", "__shatter.run.ammo = 0; 1"],
    [1500],
    ["probe", "phase", "__shatter.run.phase"],
    ["tap", 800, 450],
    [200],
    ["probe", "strayTap", "__shatter.run.phase"], // a tap must NOT restart - the button does
    ["shot", "over"],
    ["eval", "document.querySelector('#over button').click(); 1"],
    [300],
    ["probe", "after", "({phase: __shatter.run.phase, ammo: __shatter.run.ammo, thrown: __shatter.run.thrown, dist: __shatter.run.dist|0, score: __shatter.run.score|0})"],
  ],
};

const names = process.argv.slice(2);
const which = names.length ? names : ["boot"];
const errors = [];
const probes = {};
const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const QS = process.env.SHATTER_QS ? `?${process.env.SHATTER_QS}` : "";
await page.goto(`${BASE}/shatter.html${QS}`);
for (const name of which) {
  await page.reload();
  await page.waitForTimeout(300);
  for (const s of SCEN[name]) {
    if (typeof s[0] === "number") await page.waitForTimeout(s[0]);
    else if (s[0] === "shot") await page.screenshot({ path: path.join(OUT, `shatter-${s[1]}.png`) });
    else if (s[0] === "eval") await page.evaluate(s[1]);
    else if (s[0] === "probe") probes[s[1]] = await page.evaluate(s[2]);
    else if (s[0] === "tap") {
      const x = Array.isArray(s[1]) ? await page.evaluate(s[1][1]) : s[1];
      const y = Array.isArray(s[2]) ? await page.evaluate(s[2][1]) : s[2];
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.up();
    } else if (s[0] === "goto") {
      await page.goto(`${BASE}/shatter.html${s[1]}`);
      await page.waitForTimeout(400);
    } else if (s[0] === "reload") {
      await page.reload(); await page.waitForTimeout(400);
    }
  }
}
console.log(JSON.stringify({ errors, probes }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
