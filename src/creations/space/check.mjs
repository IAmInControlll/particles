// check.mjs - private headless check for space.html. Screenshots -> shots/space-*.png
// usage: node src/creations/space/check.mjs [scenario ...]  (default: boot)
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

// steps: [ms] wait | ["shot", name] | ["key", code, ms] hold |
// ["eval", js] run js in page | ["probe", name, js] capture js value
const SCEN = {
  boot: [[2500], ["shot", "boot"]],
  fly: [
    [2500], ["shot", "fly-park"],
    ["key", "KeyW", 3200], ["shot", "fly-thrust"],
    ["key", "ArrowLeft", 900], ["key", "KeyW", 1800], ["shot", "fly-turn"],
    ["key", "ShiftLeft", 2000], ["shot", "fly-boost"],
  ],
  race: [
    [2000], ["eval", "window.__space.auto = true"],
    [5000], ["shot", "race-approach"],
    [7000],
    ["probe", "race1", "({score: __space.run.score, combo: __space.run.combo, lives: __space.run.lives, phase: __space.run.phase})"],
    ["shot", "race-mid"],
    [9000],
    ["probe", "race2", "({score: __space.run.score, combo: __space.run.combo, lives: __space.run.lives, dist: __space.run.dist|0})"],
    ["shot", "race-late"],
  ],
  clip: [
    ["reload"], [2000], ["eval", "window.__space.auto = true"],
    [7000],
    ["probe", "preLives", "__space.run.lives"],
    // aim at the next gate's edge, hands off, let momentum carry through
    ["eval", `(() => {
      const s = window.__space, g = [...s.course.gates]
        .filter(g => g.state === 0 && g.z < s.cam.z - 80)
        .sort((a, b) => b.z - a.z)[0];
      if (!g) return "nogate";
      s.auto = false;
      s.cam.x = g.x; s.cam.y = g.y + g.r * 1.02;
      return g.z;
    })()`],
    [2500],
    ["probe", "post", "({lives: __space.run.lives, phase: __space.run.phase, invuln: __space.run.invuln})"],
    ["shot", "clip-aftermath"],
  ],
  over: [
    ["reload"], [2000], ["eval", "window.__space.auto = true; __space.run.lives = 1"],
    [7000],
    ["eval", `(() => {
      const s = window.__space, g = [...s.course.gates]
        .filter(g => g.state === 0 && g.z < s.cam.z - 80)
        .sort((a, b) => b.z - a.z)[0];
      if (!g) return "nogate";
      s.auto = false;
      s.cam.x = g.x; s.cam.y = g.y + g.r * 1.02;
      return g.z;
    })()`],
    [2500],
    ["probe", "overState", "({phase: __space.run.phase, lives: __space.run.lives, best: __space.run.best})"],
    ["eval", `document.getElementById("over-name").value = "TEST";
             document.getElementById("over-save").click()`],
    [300],
    ["probe", "board", "localStorage.getItem('space.board')"],
    ["shot", "over-board"],
    ["key", "KeyR", 300],
    [1200],
    ["probe", "restarted", "({phase: __space.run.phase, score: __space.run.score, lives: __space.run.lives})"],
  ],
  fight: [
    ["reload"], [2000], ["eval", "window.__space.auto = true"],
    [16000],
    ["probe", "fightStart", "({phase: __space.run.phase, hostiles: __space.run.hostiles, wave: __space.run.wave})"],
    ["shot", "fight-wave"],
    // pin an enemy dead ahead and hose it
    ["eval", `(() => {
      const s = __space;
      s.auto = false;
      let sh = s.ent.ships.find(x => x.alive);
      if (!sh) { s.run.phase = "fight"; s.ent.spawnShip(); sh = s.ent.ships[0]; }
      s.run.phase = "fight";
      window.__pin = setInterval(() => {
        if (!sh.alive) return;
        sh.x = s.cam.x + s.cam.fwd[0] * 260;
        sh.y = s.cam.y + s.cam.fwd[1] * 260;
        sh.z = s.cam.z + s.cam.fwd[2] * 260;
        sh.vx = sh.vy = sh.vz = 0;
      }, 50);
      return sh.hp;
    })()`],
    ["key", "Space", 300],
    ["shot", "fight-firing"],
    ["key", "Space", 2500],
    ["eval", "clearInterval(window.__pin)"],
    ["probe", "kill", "({kills: __space.run.kills, score: __space.run.score, alive: __space.ent.ships.map(s => s.alive), drops: __space.ent.picks.map(p => !p.taken)})"],
    ["shot", "fight-kill"],
    // damage model: shield burns first, then hull
    ["eval", "__space.run.shield = 2; __space.run.hull = 3; __space.run.invuln = 0"],
    ["eval", "__space.hit(1)"],
    ["probe", "shieldBurn", "({shield: __space.run.shield, hull: __space.run.hull})"],
    ["eval", "__space.hit(2)"],
    ["probe", "hullHit", "({shield: __space.run.shield, hull: __space.run.hull, lives: __space.run.lives})"],
    // pickup magnetize + shield effect
    ["eval", `(() => {
      const s = __space, pk = s.ent.picks[0];
      pk.taken = false; pk.kind = "shield";
      pk.x = s.cam.x + s.cam.fwd[0] * 200; pk.y = s.cam.y + s.cam.fwd[1] * 200; pk.z = s.cam.z + s.cam.fwd[2] * 200;
      pk.vx = pk.vy = pk.vz = 0;
      for (let q = pk.lo; q < pk.lo + 40; q++) { s.ent; }
      return 1;
    })()`],
    [2500],
    ["probe", "pickup", "({shield: __space.run.shield, taken: __space.ent.picks[0].taken})"],
    ["shot", "fight-late"],
  ],
  ship: [
    ["reload"], [2000],
    ["eval", `(() => {
      const s = __space;
      s.run.phase = "fight";
      s.ent.spawnShip();
      const sh = s.ent.ships.find(x => x.alive);
      window.__pin = setInterval(() => {
        if (!sh.alive) return;
        sh.x = s.cam.x + s.cam.fwd[0] * 170;
        sh.y = s.cam.y + s.cam.fwd[1] * 170;
        sh.z = s.cam.z + s.cam.fwd[2] * 170;
        sh.vx = sh.vy = sh.vz = 0;
        sh.yaw = 0; sh.pitch = 0;
        sh.state = "in"; sh.stateT = 0;
      }, 60);
      return 1;
    })()`],
    [1800],
    ["shot", "ship-silhouette"],
    ["key", "Space", 2600],
    ["eval", "clearInterval(window.__pin)"],
    ["probe", "kills", "__space.run.kills"],
    ["shot", "ship-death"],
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

await page.goto(`${BASE}/space.html`);
for (const name of which) {
  for (const s of SCEN[name]) {
    if (typeof s[0] === "number") await page.waitForTimeout(s[0]);
    else if (s[0] === "shot") await page.screenshot({ path: path.join(OUT, `space-${s[1]}.png`) });
    else if (s[0] === "key") {
      await page.keyboard.down(s[1]);
      await page.waitForTimeout(s[2]);
      await page.keyboard.up(s[1]);
    } else if (s[0] === "eval") await page.evaluate(s[1]);
    else if (s[0] === "reload") { await page.reload(); await page.waitForTimeout(400); }
    else if (s[0] === "probe") probes[s[1]] = await page.evaluate(s[2]);
  }
}
console.log(JSON.stringify({ errors, probes }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
