// check.mjs - private headless check for space.html. Screenshots -> shots/space-*.png
// usage: node src/creations/space/check.mjs [scenario ...]  (default: boot)
import { createRequire } from "module";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);
const BASE = `http://localhost:${process.env.PORT || 8321}`;
const OUT = path.join(root, "shots");
mkdirSync(OUT, { recursive: true });

const CANOPY = `(() => {
      const s = __space, f = s.field, c = document.getElementById("deck");
      const k = c.width / innerWidth, a = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let live = 0, onHull = 0;
      for (let p = 0; p < f.homed.length; p++) {
        if (!f.homed[p] || !f.size[p]) continue;
        const x = f.home[p * 3], y = f.home[p * 3 + 1];
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        live++;
        if (a[(((y * k) | 0) * c.width + ((x * k) | 0)) * 4 + 3] > 200) onHull++;
      }
      return { ...s.deck.fill(2), live, onHull };
    })()`;

// steps: [ms] wait | ["shot", name] | ["key", code, ms] hold |
// ["eval", js] run js in page | ["probe", name, js] capture js value |
// ["viewport", w, h] resize the page | ["crop", row, label, rectJs] keep a
// clipped shot for ["sheet", file], a labelled grid PNG, one row per row key
const SCEN = {
  boot: [[2500], ["probe", "phase", "__space.run.phase"], ["shot", "boot"]],
  shiptest: [
    [1500],
    ["probe", "ship", "__space.ship"],
    ["probe", "hullMax", "__space.run.hullMax"],
    ["probe", "hull", "__space.run.hull"],
    ["probe", "turnK", "+__space.cam.turnK.toFixed(2)"],
    ["probe", "thrustK", "+__space.cam.thrustK.toFixed(2)"],
    ["shot", "shiptest"],
  ],
  keys: [
    [1500],
    ["key", "KeyW", 1200],
    ["probe", "wSpeed", "__space.cam.speed | 0"],
    ["key", "KeyW", 800],
    ["probe", "wSpeed2", "__space.cam.speed | 0"],
    ["key", "KeyA", 600],
    ["probe", "aStrafe", "__space.cam.vx | 0"],
  ],
  steer: [
    [1500],
    ["eval", "__space.keys.ArrowLeft = true"],
    [140],
    ["probe", "yvRamp", "+__space.cam.yv.toFixed(3)"],
    [900],
    ["probe", "yvFull", "+__space.cam.yv.toFixed(3)"],
    ["eval", "__space.keys.ArrowLeft = false"],
    [320],
    ["probe", "yvCoast", "+__space.cam.yv.toFixed(3)"],
  ],
  // level: free roll sticks while held AND after release (ship attitude
  // persists) - only the visor counter-roll self-levels ~2s after input
  level: [
    [1500],
    ["key", "KeyQ", 1500],
    ["probe", "rolled", "+(__space.cam.roll % 6.2832).toFixed(2)"],
    [1200],
    ["probe", "visorHeld", "+__space.cam.visor.toFixed(3)"],
    [4200],
    ["probe", "stillRolled", "+(__space.cam.roll % 6.2832).toFixed(2)"],
    ["probe", "visorLevel", "+__space.cam.visor.toFixed(3)"],
  ],
  motion: [
    [2000], ["eval", "window.__space.auto = true"],
    [5000], ["shot", "motion-a"],
    ["probe", "gateR0", `(window.__g0 = (() => {
      const s = __space, g = [...s.course.gates]
        .filter(g => g.state === 0 && g.z < s.cam.z - 800)
        .sort((a, b) => b.z - a.z)[0];
      return g ? { g, r: g.r * s.cam.f / (s.cam.z - g.z), d: s.cam.z - g.z } : { g: null, r: 0, d: 0 };
    })()).r`],
    [900],
    ["probe", "gateGrow", `(() => {
      const s = __space, g = window.__g0.g;
      if (!g || g.state !== 0) return { r0: window.__g0.r, r1: null, note: "gate passed before second probe", speed: s.cam.speed | 0 };
      // f varies with boost FOV kick; approach is the honest signal
      return { r0: window.__g0.r, r1: g.r * s.cam.f / (s.cam.z - g.z),
        d0: window.__g0.d, d1: s.cam.z - g.z, speed: s.cam.speed | 0 };
    })()`],
    ["shot", "motion-b"],
    [1200],
    ["shot", "motion-c"],
  ],
  fly: [
    [2500], ["shot", "fly-park"],
    ["key", "KeyW", 3200], ["shot", "fly-thrust"],
    ["key", "ArrowLeft", 900], ["key", "KeyW", 1800], ["shot", "fly-turn"],
    ["eval", "__space.keys.KeyW = true; __space.keys.ShiftLeft = true"],
    [1600], ["shot", "fly-boost"],
    ["eval", "__space.keys.KeyW = false; __space.keys.ShiftLeft = false"],
  ],
  lookback: [
    [2500],
    ["probe", "fwdStars", `(() => {
      const s = __space, st = s.course.stars;
      let n = 0;
      for (let i = 0; i < st.n; i++) if (s.cam.project(st.sx[i], st.sy[i], st.sz[i])) n++;
      return n;
    })()`],
    ["eval", "__space.cam.yaw = Math.PI"],
    [600],
    ["probe", "backStars", `(() => {
      const s = __space, st = s.course.stars;
      let n = 0;
      for (let i = 0; i < st.n; i++) if (s.cam.project(st.sx[i], st.sy[i], st.sz[i])) n++;
      return n;
    })()`],
    ["shot", "lookback"],
    ["eval", "__space.cam.yaw = 0"],
  ],
  planet: [
    ["reload"], [2500],
    ["eval", `(() => {
      const s = __space, pl = s.course.planets.reduce((a, b) => b.R > a.R ? b : a);
      window.__pl = pl;
      pl.x = s.cam.x + s.cam.fwd[0] * 1300 + s.cam.right[0] * 300;
      pl.y = s.cam.y + s.cam.fwd[1] * 1300 + s.cam.up[0] * 80;
      pl.z = s.cam.z + s.cam.fwd[2] * 1300;
      return [pl.R, pl.rings];
    })()`],
    [800],
    ["shot", "planet-far"],
    ["key", "KeyW", 2000],
    [300],
    ["shot", "planet-near"],
    ["probe", "planets", "__space.course.planets.map(p => ({R: p.R | 0, rings: p.rings, shellN: p.shellN}))"],
  ],
  compass: [
    ["reload"], [2000],
    ["eval", "window.__space.auto = true"],
    [3000],
    ["eval", `(() => {
      const s = __space;
      s.auto = false; s.keys.KeyW = false;
      s.cam.yaw = -0.7; s.cam.yv = 0; s.cam.pv = 0; s.cam.rv = 0;
      s.cam.update(0.016, s.keys);
      return s.run.next ? [s.run.next.x | 0, s.run.next.z | 0] : null;
    })()`],
    [700],
    ["shot", "compass-side"],
    ["probe", "next", "(__space.run.next ? [__space.run.next.x | 0, __space.run.next.z | 0] : null)"],
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
        .filter(g => g.state === 0 && g.kind === "ring" && g.z < s.cam.z - 80)
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
        .filter(g => g.state === 0 && g.kind === "ring" && g.z < s.cam.z - 80)
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
  // wave bonus pays only when every hostile dies; escapees forfeit it
  waveclear: [
    ["reload"], [1500],
    ["eval", `(() => {
      const s = __space;
      s.run.gatesPassed = 16; s.run.phase = "race"; s.run.wave = 0;
      s.ent.spawnShip("fighter"); s.ent.spawnShip("drone");
      s.run.phase = "fight"; s.run.waveSize = s.ent.countAlive(); s.run.waveKills = 0;
      window.__s0 = s.run.score;
      for (const sh of s.ent.ships) if (sh.alive) { sh.state = "leave"; sh.stateT = 6; }
    })()`],
    [600],
    ["probe", "escaped", "({phase: __space.run.phase, dScore: __space.run.score - __s0, kills: __space.run.waveKills, size: __space.run.waveSize})"],
    ["eval", `(() => {
      const s = __space;
      s.ent.spawnShip("drone"); s.ent.spawnShip("drone");
      s.run.phase = "fight"; s.run.waveSize = s.ent.countAlive(); s.run.waveKills = 0;
      s.run.invuln = 99;
      window.__s1 = s.run.score;
      for (const sh of s.ent.ships) if (sh.alive) { sh.x = s.cam.x; sh.y = s.cam.y; sh.z = s.cam.z; }
    })()`],
    [600],
    ["probe", "rammed", "({phase: __space.run.phase, dScore: __space.run.score - __s1, kills: __space.run.waveKills, size: __space.run.waveSize})"],
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
  // frame: straight into a ship via SPACE_QS=ship=name, autopilot, mid-run shot
  frame: [
    [2500], ["eval", "window.__space.auto = true"],
    [6000],
    ["probe", "ship", "__space.ship"],
    ["probe", "cockpitPts", "(__space.cockpit ? __space.cockpit.pts : -1)"],
    ["probe", "motes", "(__space.cockpit ? __space.cockpit.motes : -1)"],
    ["shot", "frame"],
  ],
  // third: chase view end-to-end - ?ship= skips the picker, ?view=chase
  // puts the render eye behind the hull. Probes exterior pts homed and
  // landing center-low, phase race, then screenshots all three hulls.
  third: [
    ["goto", "?ship=kestrel&view=chase"], [2500],
    ["eval", "window.__space.auto = true"],
    [4000],
    ["probe", "phase", "__space.run.phase"],
    ["probe", "view", "__space.view"],
    ["probe", "extCenter", `(() => {
      const s = __space, f = s.field, L = s.ext;
      let n = 0, sx = 0, sy = 0;
      for (let p = L.lo; p < L.hi; p += 3) {
        if (!f.homed[p]) continue;
        const j = p * 3, hx = f.home[j], hy = f.home[j + 1];
        if (hx < -4e3) continue;
        n++; sx += hx; sy += hy;
      }
      return n ? { n, mx: sx / n | 0, my: sy / n | 0 } : { n: 0 };
    })()`],
    ["shot", "third-kestrel"],
    ["goto", "?ship=dart&view=chase"], [2500],
    ["eval", "window.__space.auto = true"],
    [4000],
    ["shot", "third-dart"],
    ["goto", "?ship=mule&view=chase"], [2500],
    ["eval", "window.__space.auto = true"],
    [4000],
    ["shot", "third-mule"],
    // leave no chase residue in storage for later scenarios in this run
    ["eval", "localStorage.removeItem('space.view')"],
  ],
  // alive: the chase hull should visibly tilt - measure the screen-space
  // principal axis of the exterior points (0 = wings level). Held roll
  // should tilt it well off axis, then it settles back toward level.
  alive: [
    ["goto", "?ship=kestrel&view=chase"], [2500],
    ["eval", "window.__space.auto = true"],
    [3500],
    ["probe", "rollRest", `(() => {
      const s = __space, f = s.field;
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let p = s.ext.lo; p < s.ext.hi; p++) {
        if (!f.homed[p]) continue;
        const j = p * 3, hx = f.home[j], hy = f.home[j + 1];
        if (hx < -4e3) continue;
        n++; sx += hx; sy += hy; sxx += hx * hx; syy += hy * hy; sxy += hx * hy;
      }
      if (!n) return 0;
      const mx = sx / n, my = sy / n;
      const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
      return +(0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180 / Math.PI).toFixed(1);
    })()`],
    ["eval", "__space.keys.KeyQ = true"], [500],
    ["probe", "rollMid", `(() => {
      const s = __space, f = s.field;
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let p = s.ext.lo; p < s.ext.hi; p++) {
        if (!f.homed[p]) continue;
        const j = p * 3, hx = f.home[j], hy = f.home[j + 1];
        if (hx < -4e3) continue;
        n++; sx += hx; sy += hy; sxx += hx * hx; syy += hy * hy; sxy += hx * hy;
      }
      if (!n) return 0;
      const mx = sx / n, my = sy / n;
      const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
      return +(0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180 / Math.PI).toFixed(1);
    })()`],
    ["shot", "chase-roll"],
    ["eval", "__space.keys.KeyQ = false"], [400],
    ["eval", "__space.keys.ArrowLeft = true"], [700],
    ["shot", "chase-turn"],
    ["eval", "__space.keys.ArrowLeft = false"],
    ["eval", "localStorage.removeItem('space.view')"],
  ],
  // fire: guns are hot outside fight - holding space in race should
  // stream bolts with zero hostiles alive
  fire: [
    ["reload"], [2000], ["eval", "window.__space.auto = true"], [1500],
    ["key", "Space", 900],
    ["probe", "raceFire", `({phase: __space.run.phase, bolts: __space.ent.bolts.filter(b => b.on).length, hostiles: __space.run.hostiles})`],
    ["shot", "race-fire"],
    ["key", "Space", 100],
  ],
  // box: pin a live hostile dead ahead and screenshot the red target box
  box: [
    ["reload"], [2000], ["eval", "window.__space.auto = true"], [2000],
    ["eval", `(() => {
      const s = __space;
      s.run.phase = "fight";
      s.ent.spawnShip();
      const sh = s.ent.ships.find(x => x.alive);
      sh.x = s.cam.x + s.cam.fwd[0] * 700;
      sh.y = s.cam.y + s.cam.fwd[1] * 700 + 30;
      sh.z = s.cam.z + s.cam.fwd[2] * 700;
      sh.vx = sh.vy = sh.vz = 0;
      sh.state = "hold"; sh.stateT = 0;
      return 1;
    })()`],
    [400],
    ["shot", "box"],
  ],
  // warcry: enemy kinds, bolt intercept, the derelict, boost streaks,
  // and the canopy glare - the feature batch end to end
  warcry: [
    ["reload"], [2000], ["eval", "window.__space.auto = true"], [2000],
    ["eval", `(() => {
      const s = __space;
      s.run.phase = "fight";
      s.ent.reset();
      s.ent.spawnShip("drone");
      s.ent.spawnShip("heavy");
      return 1;
    })()`],
    [400],
    ["probe", "kinds", "__space.ent.ships.filter(s => s.alive).map(s => ({kind: s.kind, hp: s.hp, score: s.score}))"],
    // bolt intercept: park a hostile bolt on a player bolt's head
    ["eval", `(() => {
      const s = __space;
      window.__s0 = s.run.score;
      const pb = s.ent.bolts.find(b => !b.on);
      const hb = s.ent.bolts.find(b => !b.on && b !== pb);
      const x = s.cam.x + s.cam.fwd[0] * 300, y = s.cam.y + s.cam.fwd[1] * 300, z = s.cam.z + s.cam.fwd[2] * 300;
      Object.assign(pb, {on: true, hostile: false, x, y, z, vx: 0, vy: 0, vz: 0, life: 1.5});
      Object.assign(hb, {on: true, hostile: true, x: x + 4, y, z, vx: 0, vy: 0, vz: 0, life: 1.5});
      window.__pb = pb; window.__hb = hb;
      return 1;
    })()`],
    [400],
    ["probe", "intercept", `({dScore: __space.run.score - window.__s0,
      pbOn: window.__pb.on, hbOn: window.__hb.on})`],
    // retire the spawned hostiles so later shots stay clean
    ["eval", `__space.ent.ships.forEach(s => { if (s.alive) s.age = 999; });
              __space.run.phase = "race";`],
    // derelict: pin the wreck center-low in clear glass (off the strut
    // blocker mask), spine broadside so the hull reads long
    ["eval", `(() => {
      const s = __space, lm = s.course.landmark;
      s.auto = false;
      s.keys.KeyW = false;
      lm.x = s.cam.x + s.cam.fwd[0] * 2300 - s.cam.up[0] * 230;
      lm.y = s.cam.y + s.cam.fwd[1] * 2300 - s.cam.up[1] * 230;
      lm.z = s.cam.z + s.cam.fwd[2] * 2300 - s.cam.up[2] * 230;
      lm.D[0] = s.cam.right[0]; lm.D[1] = s.cam.right[1]; lm.D[2] = s.cam.right[2];
      lm.U[0] = s.cam.up[0]; lm.U[1] = s.cam.up[1]; lm.U[2] = s.cam.up[2];
      lm.V[0] = -s.cam.fwd[0]; lm.V[1] = -s.cam.fwd[1]; lm.V[2] = -s.cam.fwd[2];
      lm.spin = 0;
      return 1;
    })()`],
    [900],
    ["probe", "lmVis", `(() => {
      const s = __space, f = s.field, lm = s.course.landmark;
      let n = 0;
      for (let p = lm.lo; p < lm.lo + lm.n; p++) {
        const j = p * 3;
        if (f.homed[p] && f.home[j] > -4e3) n++;
      }
      return n;
    })()`],
    ["shot", "warcry-landmark"],
    // boost streaks: ride W+shift until speedK clears the streak floor
    ["eval", "__space.keys.KeyW = true; __space.keys.ShiftLeft = true"],
    [2800],
    ["probe", "speedK", "+__space.cam.speedK.toFixed(2)"],
    ["shot", "warcry-streaks"],
    ["eval", "__space.keys.KeyW = false; __space.keys.ShiftLeft = false"],
    // canopy glare: aim the nose at the sun's fixed compass direction
    ["eval", `(() => {
      const s = __space, S = s.course.SUN;
      s.auto = false;
      s.keys.KeyW = false;
      s.cam.pitch = Math.asin(S[1]);
      s.cam.yaw = Math.atan2(-S[0], -S[2]);
      s.cam.yv = s.cam.pv = s.cam.rv = 0;
      return 1;
    })()`],
    [900],
    ["probe", "sunVis", "__space.course.sunVis"],
    ["probe", "sunXY", "[__space.course.sunX | 0, __space.course.sunY | 0]"],
    ["shot", "warcry-glare"],
  ],
  // story: the derelict is the mission - pin it ahead, let autopilot dock,
  // skip each cutscene, and confirm the campaign ends into endless mode
  story: [
    ["reload"], [2000], ["eval", "window.__space.auto = true"], [1500],
    ["probe", "wreck0", "__space.run.wreckDist | 0"],
    ["probe", "onAir0", "__space.comms.cur()"],
    ["eval", `window.__pin = (d = 500) => {
      const s = __space, lm = s.course.landmark;
      lm.x = s.cam.x + s.cam.fwd[0] * d;
      lm.y = s.cam.y + s.cam.fwd[1] * d;
      lm.z = s.cam.z + s.cam.fwd[2] * d;
      window.__s0 = s.run.score;
      return 1;
    }; __pin()`],
    [1200], ["probe", "dock1", "__space.run.phase"],
    ["key", "Enter", 60], [300],
    ["probe", "leg1", "({phase: __space.run.phase, legs: __space.run.legs, souls: __space.run.souls, dScore: __space.run.score - window.__s0, wreckNext: __space.run.wreckDist | 0})"],
    ["eval", "__pin()"], [1200], ["key", "Enter", 60], [300],
    ["eval", "__pin(2500)"], [400],
    // leg-3 approach: Orren's ambush should already be on scope
    ["probe", "ambush", "({phase: __space.run.phase, kinds: __space.ent.ships.filter(s => s.alive).map(s => s.kind)})"],
    ["eval", "__pin()"], [1200], ["key", "Enter", 60], [400],
    ["probe", "done", "({legs: __space.run.legs, souls: __space.run.souls, storyDone: __space.run.storyDone, wreckDist: __space.run.wreckDist, board: document.getElementById('over').style.display, boomT: +__space.cine.boomT().toFixed(1), alive: __space.ent.countAlive(), phase: __space.run.phase})"],
    ["shot", "story-rescue"],
  ],
  thrust: [
    [1500],
    ["key", "KeyW", 1500],
    ["probe", "thrust", "__space.cam.speed | 0"],
    ["key", "KeyW", 900],
    ["probe", "thrust2", "__space.cam.speed | 0"],
  ],
  strafe: [
    [1500],
    ["key", "KeyD", 800],
    ["probe", "strafeR", "__space.cam.vx | 0"],
    ["key", "KeyA", 800],
    ["probe", "strafeL", "__space.cam.vx | 0"],
  ],
  // tag: stage one live pickup of each kind ahead (beyond the magnetize
  // radius so they hold) and screenshot the world-space labels
  tag: [
    ["reload"], [2000], ["eval", "window.__space.auto = true"],
    [3000],
    ["eval", `(() => {
      const s = __space;
      const kinds = ["boost", "health", "shield"];
      s.ent.picks.forEach((pk, i) => {
        if (i >= 3) return;
        pk.taken = false; pk.kind = kinds[i];
        pk.x = s.cam.x + s.cam.fwd[0] * 900 + s.cam.right[0] * (i - 1) * 260;
        pk.y = s.cam.y + s.cam.fwd[1] * 900 + (i - 1) * 60;
        pk.z = s.cam.z + s.cam.fwd[2] * 900 + s.cam.right[2] * (i - 1) * 260;
        pk.vx = pk.vy = pk.vz = 0;
      });
      return 1;
    })()`],
    [350],
    ["shot", "picktags"],
  ],  // canopy-fill: each hull mid-flight (gates ahead). Probes deck.fill()
  // (glass %, mask-vs-paint disagreement, top-left comms zone glass) and
  // onHull = live homed particles whose home sits on an opaque deck
  // pixel - the cull mask should keep that at ~0; overlay text (wreck
  // marker label, story log) also counts, so a few stray hits are those.
  "canopy-fill": [
    ["goto", "?ship=kestrel&view=cockpit"], [2500],
    ["eval", "window.__space.auto = true"],
    [5000],
    ["probe", "kestrel", CANOPY],
    ["shot", "canopy-kestrel"],
    ["goto", "?ship=dart&view=cockpit"], [2500],
    ["eval", "window.__space.auto = true"],
    [5000],
    ["probe", "dart", CANOPY],
    ["shot", "canopy-dart"],
    ["goto", "?ship=mule&view=cockpit"], [2500],
    ["eval", "window.__space.auto = true"],
    [5000],
    ["probe", "mule", CANOPY],
    ["shot", "canopy-mule"],
    // tl is the comms-box zone (comms draws on its own canvas): pure glass
    ["probe", "tlNoLog", "__space.deck.fill(2).tl"],
    // glare paints under the near layer: aim so the sun sits behind the
    // left pillar - the bloom must stop at the pillar edge
    ["goto", "?ship=kestrel&view=cockpit"], [2000],
    ["eval", `(() => {
      const s = __space, S = s.course.SUN;
      s.auto = false;
      s.cam.pitch = Math.asin(S[1]) + 0.12;
      s.cam.yaw = Math.atan2(-S[0], -S[2]) - 0.62;
      s.cam.yv = s.cam.pv = s.cam.rv = 0;
      return 1;
    })()`],
    [900],
    ["probe", "glareSun", "[__space.course.sunVis, __space.course.sunX | 0, __space.course.sunY | 0]"],
    ["shot", "canopy-glare"],
  ],
  // music-*: scheduler probes (live) and offline renders -> shots/music-*.wav
  "music-sched": [
    [2500], ["eval", "__space.au.unlock()"], [300],
    ["probe", "before", "__space.au.musicStats()"],
    ["probe", "cycle", `(async () => {
      const s = __space, au = s.au, orig = au.music, log = [];
      let force = null, maxNodes = 0;
      au.music = (m, k) => orig(force || m, k);
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const t0 = au.musicStats().time;
      for (const m of ["pick", "race", "fight", "dock", "finale", "over"]) {
        force = m;
        for (let i = 0; i < 40; i++) { await wait(250); maxNodes = Math.max(maxNodes, au.musicStats().nodes); if (i === 7) log.push(au.musicStats()); }
        log.push(Object.assign(au.musicStats(), { settled: m }));
      }
      force = null;
      const t1 = au.musicStats().time;
      return { audioSecs: +(t1 - t0).toFixed(1), maxNodes, log: log.filter(l => l.settled).map(l => ({ mood: l.mood, bpm: l.bpm, gains: l.gains, nodes: l.nodes })) };
    })()`],
    [3000],
    ["probe", "after", "__space.au.musicStats()"],
  ],
  "music-render": [
    [1500],
    ["probe", "render", `(async () => {
      const { renderMood } = await import("/src/creations/space/music.js");
      const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
      const wav = (f, sr) => {
        const n = f.length, u = new Uint8Array(44 + n * 2), v = new DataView(u.buffer);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true);
        v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
        v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f[i])) * 32767, true);
        return u;
      };
      const stat = (f) => { let p = 0, e = 0; for (const x of f) { p = Math.max(p, Math.abs(x)); e += x * x; } return { rms: +Math.sqrt(e / f.length).toFixed(4), peak: +p.toFixed(4) }; };
      const { renderCross } = await import("/src/creations/space/music.js");
      const secBands = (f) => { const o = []; for (let i = 0; i + SR <= f.length; i += SR) { let e = 0; for (let j = i; j < i + SR; j++) e += f[j] * f[j]; o.push(+Math.sqrt(e / SR).toFixed(4)); } return o; };
      const MASTER = 0.85, SR = 44100, out = { music: {}, sfx: {}, files: {} };
      for (const [m, k] of [["pick", 0.3], ["race", 0.3], ["race", 1], ["fight", 0.6], ["dock", 0.3], ["finale", 0.6], ["finale", 1], ["over", 0]]) {
        const f = await renderMood(m, 8, k, SR);
        for (let i = 0; i < f.length; i++) f[i] *= MASTER;
        const name = "music-" + m + (k === 1 ? "-fast" : "");
        out.music[name] = stat(f);
        out.files[name + ".wav"] = b64(wav(f, SR));
      }
      out.cross = {};
      for (const [a, b] of [["pick", "fight"], ["fight", "dock"], ["race", "over"]])
        out.cross[a + ">" + b + "@4s"] = secBands(await renderCross(a, b, 4, 12));
      // sfx through the real audio.js on an offline context; subtract the
      // sfx-free baseline (idle engine + pick-mood pad) to isolate each hit
      const { createAudio } = await import("/src/creations/space/audio.js");
      const AC = window.AudioContext;
      const run = async (name) => {
        window.AudioContext = class { constructor() { return (window.__off = new OfflineAudioContext(1, SR * 2, SR)); } };
        const au = createAudio();
        au.unlock();
        if (au.muted()) au.toggle();
        const off = window.__off;
        if (name) au.sfx(name);
        const buf = await off.startRendering();
        return buf.getChannelData(0).slice();
      };
      const base = await run(null);
      for (const n of ["bolt", "tick", "hit", "kill", "gate", "pick", "comms", "wave", "over"]) {
        const f = await run(n);
        for (let i = 0; i < f.length; i++) f[i] -= base[i];
        out.sfx[n] = stat(f);
      }
      window.AudioContext = AC;
      return out;
    })()`],
  ],
  // story-dock: one dock played as a cutscene - letterbox, external eye,
  // comms on air - then Enter skips back to flight with controls restored
  "story-dock": [
    ["reload"], [2500],
    ["probe", "onAir", "__space.comms.cur()"],
    ["shot", "story-comms"],
    ["eval", `(() => {
      const s = __space, lm = s.course.landmark;
      lm.x = s.cam.x + s.cam.fwd[0] * 600 + s.cam.right[0] * 120;
      lm.y = s.cam.y + s.cam.fwd[1] * 600;
      lm.z = s.cam.z + s.cam.fwd[2] * 600 + s.cam.right[2] * 120;
      return 1;
    })()`],
    [300],
    ["probe", "docking", "({phase: __space.run.phase, eye: !!__space.cam.eye, shot: __space.cine.shot(), view: __space.view})"],
    [1700], ["shot", "story-dock-a"],
    [2200],
    ["probe", "mid", "({phase: __space.run.phase, shot: __space.cine.shot(), t: +__space.cine.t().toFixed(1), onAir: __space.comms.cur(), escT: +__space.fx.escT().toFixed(1)})"],
    ["shot", "story-dock-b"],
    ["eval", "__space.keys.KeyW = false"],
    ["key", "Enter", 60], [200],
    ["probe", "skipped", "({phase: __space.run.phase, eye: __space.cam.eye, view: __space.view, invuln: +__space.run.invuln.toFixed(1), legs: __space.run.legs, souls: __space.run.souls, queued: __space.comms.queued()})"],
    ["eval", "window.__v0 = __space.cam.speed"],
    ["key", "KeyW", 900],
    ["probe", "controls", "({before: window.__v0 | 0, after: __space.cam.speed | 0})"],
    ["shot", "story-dock-after"],
  ],
  // story-finale: leg 3 from the ambush through the detonation to the end
  // card, played in full (no skip)
  "story-finale": [
    ["reload"], [1500],
    ["eval", `(() => {
      const s = __space;
      s.run.legs = 2; s.run.souls = 32;
      s.course.respawnLm(2);
      return 1;
    })()`],
    [600],
    ["eval", `window.__pin = (d) => {
      const s = __space, lm = s.course.landmark;
      lm.x = s.cam.x + s.cam.fwd[0] * d + s.cam.right[0] * 150;
      lm.y = s.cam.y + s.cam.fwd[1] * d;
      lm.z = s.cam.z + s.cam.fwd[2] * d + s.cam.right[2] * 150;
      return 1;
    }; __pin(2600)`],
    [300],
    ["probe", "ambush", "({phase: __space.run.phase, kinds: __space.ent.ships.filter(s => s.alive).map(s => s.kind), onAir: __space.comms.cur()})"],
    ["eval", "__pin(600)"], [200],
    ["probe", "dock", "({phase: __space.run.phase, eye: !!__space.cam.eye})"],
    [9900],
    ["probe", "boom", "({t: +__space.cine.t().toFixed(1), boomT: +__space.cine.boomT().toFixed(2), shot: __space.cine.shot(), alive: __space.ent.countAlive(), onAir: __space.comms.cur()})"],
    ["shot", "story-boom"],
    [700], ["shot", "story-boom-b"],
    [2900],
    ["probe", "card", "({display: document.getElementById('over').style.display, text: document.getElementById('over').innerText})"],
    ["shot", "story-card"],
    [3000],
    ["probe", "after", "({phase: __space.run.phase, storyDone: __space.run.storyDone, eye: __space.cam.eye, view: __space.view, souls: __space.run.souls, legs: __space.run.legs, wreckDist: __space.run.wreckDist, lmVisible: (() => { const lm = __space.course.landmark, f = window.__pf; let n = 0; for (let i = 0; i < lm.n; i++) if (f.size[lm.lo + i] > 0) n++; return n; })()})"],
    [3500],
    ["probe", "endless", "__space.comms.cur()"],
  ],
  // story-dup: every hud.flash and hud.pop text over a gate pass and a
  // kill - no text may land in both channels
  "story-dup": [
    ["reload"], [1500],
    ["eval", `(() => {
      const s = __space, h = s.hud;
      window.__msgs = { flash: [], pop: [], comms: [] };
      const f = h.flash, p = h.pop, c = s.comms.say;
      s.comms.say = (lines, now) => { for (const l of lines) __msgs.comms.push(l[1]); return c(lines, now); };
      h.flash = (t, ...a) => { __msgs.flash.push(t); return f(t, ...a); };
      h.pop = (t, ...a) => { __msgs.pop.push(t); return p(t, ...a); };
      s.auto = true;
      return 1;
    })()`],
    [7000],
    ["eval", `(() => {
      const s = __space;
      s.auto = false; s.keys.KeyW = false;
      s.ent.spawnShip("drone");
      const sh = s.ent.ships.find(x => x.alive);
      s.run.phase = "fight";
      window.__pin2 = setInterval(() => {
        if (!sh.alive) return;
        sh.x = s.cam.x + s.cam.fwd[0] * 260; sh.y = s.cam.y + s.cam.fwd[1] * 260; sh.z = s.cam.z + s.cam.fwd[2] * 260;
        sh.vx = sh.vy = sh.vz = 0;
      }, 50);
      return 1;
    })()`],
    ["key", "Space", 1500],
    ["eval", "clearInterval(window.__pin2)"],
    [300],
    ["probe", "channels", `(() => {
      const m = window.__msgs, both = m.flash.filter(t => m.pop.includes(t))
        .concat(m.comms.filter(t => m.flash.includes(t) || m.pop.includes(t)));
      return { flash: m.flash, pop: m.pop, comms: m.comms.length, both,
        com: document.getElementById("hud-msg").textContent,
        feed: __space.world.feed.map(e => e.text) };
    })()`],
    ["shot", "story-dup"],
  ],
  // world-gates: stage each gate kind as the next gate, park the camera
  // just short of it on its axis, screenshot. rocks parks at the previous
  // gate so the rubble stretch fills the view.
  "world-gates": [
    ["reload"], [1500], ["eval", "window.__space.auto = true"], [2500],
    ["eval", `window.__stage = (id) => {
      const s = __space, c = s.course;
      s.auto = false; s.keys.KeyW = false;
      s.cam.vx = s.cam.vy = s.cam.vz = 0;
      s.cam.yaw = s.cam.pitch = s.cam.roll = 0; s.cam.yv = s.cam.pv = s.cam.rv = 0;
      s.run.invuln = 5;
      const pend = c.gates.filter(g => g.state === 0 && g.z < s.cam.z - 60).sort((a, b) => b.z - a.z);
      const a = pend[0], b = pend[1];
      const g = id === "rocks" ? b : a;
      c.setKind(g, id, a);
      const back = id === "rocks" ? a.z + 120 : g.z + 300;
      s.cam.x = id === "rocks" ? a.bx : g.bx; s.cam.y = (id === "rocks" ? a.by : g.by) + 8; s.cam.z = back;
      s.cam.update(0.016, s.keys);
      return { kind: g.kind, r: g.r | 0, d: (s.cam.z - g.z) | 0 };
    }; 1`],
    ["probe", "drift", "__stage('drift')"], [700], ["shot", "world-gate-drift"],
    ["probe", "driftMoved", "(() => { const g = __space.course.next; return +Math.hypot(g.x - g.bx, g.y - g.by).toFixed(1); })()"],
    ["probe", "spin", "__stage('spin')"], [700], ["shot", "world-gate-spin"],
    ["probe", "boost", "__stage('boost')"], [700], ["shot", "world-gate-boost"],
    ["probe", "rocks", "__stage('rocks')"], [700], ["shot", "world-gate-rocks"],
    ["probe", "rubbleLive", "__space.course.rocks.filter(k => !k.dead && k.z < __space.cam.z).length"],
  ],
  // world-spin: fly straight into a frozen horizontal crossbar (clip,
  // a life lost), then through an open half of the next spinner (pass)
  "world-spin": [
    ["reload"], [1500], ["eval", "window.__space.auto = true"], [2500],
    ["eval", `window.__spin = (dy) => {
      const s = __space, c = s.course;
      s.auto = false; s.run.invuln = 0; s.run.phase = "race";
      s.cam.yaw = s.cam.pitch = s.cam.roll = 0; s.cam.yv = s.cam.pv = s.cam.rv = 0;
      const g = c.gates.filter(g => g.state === 0 && g.z < s.cam.z - 60).sort((a, b) => b.z - a.z)[0];
      c.setKind(g, "spin");
      g.spinV = 0; g.ang = 0;
      s.cam.x = g.x; s.cam.y = g.y + dy * g.r; s.cam.z = g.z + 160;
      s.cam.vx = s.cam.vy = 0; s.cam.vz = -500;
      window.__l0 = s.run.lives; window.__p0 = s.run.gatesPassed; window.__sg = g;
      return { r: g.r | 0, lives: s.run.lives };
    }; 1`],
    ["probe", "barSetup", "__spin(0.02)"], [900],
    ["probe", "barClip", "({lives: __space.run.lives, lost: window.__l0 - __space.run.lives, gateState: window.__sg.state})"],
    ["eval", "__space.run.invuln = 0"],
    ["probe", "gapSetup", "__spin(0.45)"], [900],
    ["probe", "gapPass", "({lost: window.__l0 - __space.run.lives, passed: __space.run.gatesPassed - window.__p0, gateState: window.__sg.state})"],
  ],
  // world-boost: drain boost, cruise at cap into a gold gate - pass
  // refills boost and the surge lifts speed past the normal cap
  "world-boost": [
    ["reload"], [1500], ["eval", "window.__space.auto = true"], [2500],
    ["eval", "__space.auto = false"], [100],
    ["eval", `(() => {
      const s = __space, c = s.course;
      s.auto = false; s.run.invuln = 0;
      s.cam.yaw = s.cam.pitch = s.cam.roll = 0; s.cam.yv = s.cam.pv = s.cam.rv = 0;
      const g = c.gates.filter(g => g.state === 0 && g.z < s.cam.z - 60).sort((a, b) => b.z - a.z)[0];
      c.setKind(g, "boost");
      s.cam.x = g.x; s.cam.y = g.y; s.cam.z = g.z + 500;
      s.cam.vx = s.cam.vy = 0; s.cam.vz = -600;
      s.cam.boost = 0.2; s.keys.KeyW = true;
      window.__bg = g; window.__vmax = 0; window.__evs = [];
      const ck = c.check; c.check = (z) => { const e = ck(z); if (e) __evs.push([e.type, e.kind, s.cam.speed | 0, s.run.lives]); return e; };
      window.__vt = setInterval(() => { if (__evs.length) window.__vmax = Math.max(window.__vmax, s.cam.speed); }, 30);
      return 1;
    })()`],
    [200],
    ["probe", "preBoost", "({boost: +__space.cam.boost.toFixed(2), speed: __space.cam.speed | 0})"],
    [1100],
    ["probe", "postBoost", "({boost: +__space.cam.boost.toFixed(2), events: __evs, peakSpeed: window.__vmax | 0, surgeT: +__space.cam.surgeT.toFixed(2)})"],
    ["eval", "clearInterval(window.__vt); __space.keys.KeyW = false"],
  ],
  // world-mix: long autopilot run stepped through every campaign stage
  // via the game's own leg hooks; probes the kinds rolled per stage
  "world-mix": [
    ["reload"], [1500], ["eval", "window.__space.auto = true"],
    ["eval", `(() => {
      const c = __space.course, ck = c.check, ev = window.__ev = {};
      c.check = (z) => { const e = ck(z); if (e) { const k = e.type + ":" + e.kind; ev[k] = (ev[k] || 0) + 1; } return e; };
      return 1;
    })()`],
    [18000],
    ["eval", "__space.course.respawnLm(1)"], [18000],
    ["eval", "__space.course.respawnLm(2)"], [18000],
    ["eval", "__space.course.finishStory()"], [18000],
    ["probe", "mix", "__space.course.mix"],
    ["probe", "events", "window.__ev"],
    ["probe", "run", "({lives: __space.run.lives, dist: __space.run.dist | 0, gates: __space.run.gatesPassed})"],
  ],
  // world-sky: the painted sky + giant from several headings, then the
  // leg-2/3 moods after the crossfade (5s) and giant re-anchor (~5s)
  "world-sky": [
    ["reload"], [1500],
    ["eval", `window.__look = (v) => {
      const s = __space;
      s.auto = false; s.keys.KeyW = false;
      s.cam.vx = s.cam.vy = s.cam.vz = 0; s.cam.yv = s.cam.pv = s.cam.rv = 0; s.cam.roll = 0;
      s.cam.pitch = Math.asin(Math.max(-1, Math.min(1, v[1])));
      s.cam.yaw = Math.atan2(-v[0], -v[2]);
      s.cam.update(0.016, s.keys);
      return 1;
    }; window.__toGiant = () => { const s = __space, g = s.course.sky.giant;
      const d = [g.x - s.cam.x, g.y - s.cam.y, g.z - s.cam.z], l = Math.hypot(...d);
      return __look(d.map(x => x / l)); }; 1`],
    ["eval", "__look([0, 0, -1])"], [700], ["shot", "world-sky-fwd"],
    ["eval", "__look([-1, 0.05, 0])"], [700], ["shot", "world-sky-left"],
    ["eval", "__look([1, 0.05, 0])"], [700], ["shot", "world-sky-right"],
    ["eval", "__look(__space.course.SUN)"], [700], ["shot", "world-sky-sun"],
    ["eval", "__toGiant()"], [700],
    ["probe", "giant", "({vis: __space.course.sky.giantVis, px: __space.course.sky.giantPx | 0, mood: __space.course.sky.mood})"],
    ["shot", "world-sky-giant"],
    ["eval", "__look([0, 0, 1])"], [700], ["shot", "world-sky-back"],
    ["eval", "__space.course.respawnLm(1); __look([0, 0, -1])"], [11000],
    ["eval", "__toGiant()"], [700],
    ["probe", "giant2", "({vis: __space.course.sky.giantVis, px: __space.course.sky.giantPx | 0, mood: __space.course.sky.mood})"],
    ["shot", "world-sky-leg2-giant"],
    ["eval", "__look([0.3, 0.1, -1])"], [700], ["shot", "world-sky-leg2-fwd"],
    ["eval", "__space.course.respawnLm(2)"], [11000], ["eval", "__toGiant()"], [700], ["shot", "world-sky-leg3-giant"],
    // chase view: the painted body and its particle limb must stay registered
    ["goto", "?ship=kestrel&view=chase"], [2000],
    ["eval", `(() => { const s = __space, g = s.course.sky.giant;
      const d = [g.x - s.cam.x, g.y - s.cam.y, g.z - s.cam.z], l = Math.hypot(...d);
      s.cam.pitch = Math.asin(d[1] / l) + 0.12; s.cam.yaw = Math.atan2(-d[0], -d[2]); return 1; })()`],
    [1500], ["shot", "world-sky-chase"],
    ["eval", "localStorage.removeItem('space.view')"],
  ],
  // world-perf: mean rAF interval and mean game.frame JS time over ~4s of
  // autopilot (headless rAF is vsync-capped, so frameMs is the sharper signal)
  "world-perf": [
    ["reload"], [1500], ["eval", "window.__space.auto = true"], [2500],
    ["eval", `(() => {
      const f = __pf, g = f.frame, m = window.__perf = { js: 0, n: 0, raf: [], last: 0 };
      f.frame = (T, dt) => { const t0 = performance.now(); g(T, dt); m.js += performance.now() - t0; m.n++; };
      const tick = (t) => { if (m.last) m.raf.push(t - m.last); m.last = t; if (m.raf.length < 400) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      return 1;
    })()`],
    [4000],
    ["probe", "perf", `(() => {
      const m = window.__perf, r = m.raf.slice().sort((a, b) => a - b);
      return { frames: m.n, frameMs: +(m.js / m.n).toFixed(2),
        rafMean: +(r.reduce((a, b) => a + b, 0) / r.length).toFixed(2), rafP95: +r[(r.length * 0.95) | 0].toFixed(2) };
    })()`],
  ],
};

// combat-lead: a fighter strafes at a known velocity (steering overridden each
// frame), the lead pip is computed by aim.js, the cam is turned onto it and one
// bolt fired. Control: a bolt at the ship's current position must miss.
const AIM_SETUP = `(() => {
  const s = __space, e = s.ent;
  s.auto = false; s.run.phase = "fight"; s.run.invuln = 999; s.run.hull = s.run.hullMax;
  e.reset();
  e.spawnShip("fighter");
  const sh = e.ships.find(x => x.alive);
  window.__V = [200, -20, -60];
  window.__place = () => {
    const c = s.cam;
    Object.assign(c, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, yv: 0, pv: 0, rv: 0 });
    c.update(1e-4, s.keys);
    sh.x = -100; sh.y = 30; sh.z = -600; sh.hp = sh.hpMax; sh.hitT = 0;
  };
  window.__sh = sh;
  const f0 = e.frame;
  e.frame = (dt, ...a) => {
    const p = [sh.x, sh.y, sh.z];
    f0(dt, ...a);
    if (!sh.alive) return;
    sh.x = p[0] + __V[0] * dt; sh.y = p[1] + __V[1] * dt; sh.z = p[2] + __V[2] * dt;
    sh.vx = __V[0]; sh.vy = __V[1]; sh.vz = __V[2];
    sh.state = "strafe"; sh.stateT = 0; sh.age = 0; sh.fireT = 1e9;
  };
  window.__spy = { maxHit: 0, sfx: [], hp: [] };
  const sfx = s.au.sfx;
  s.au.sfx = (n, ...r) => { __spy.sfx.push(n); return sfx(n, ...r); };
  setInterval(() => { __spy.maxHit = Math.max(__spy.maxHit, sh.hitT); }, 4);
  __place();
  return { hp: sh.hp, hpMax: sh.hpMax, kind: sh.kind };
})()`;
const AIM_AT = (lead, dyaw, fire = false) => `(async () => {
  const s = __space, c = s.cam, sh = __sh;
  const { leadAim, aimState } = await import("/src/creations/space/aim.js");
  __place();
  const u = [0, 0, 0];
  let t = 0;
  for (let i = 0; i < 3; i++) {
    if (${lead}) t = leadAim(c, sh, u);
    else { const d = Math.hypot(sh.x - c.x, sh.y - c.y, sh.z - c.z); u[0] = (sh.x - c.x) / d; u[1] = (sh.y - c.y) / d; u[2] = (sh.z - c.z) / d; }
    c.pitch = Math.asin(u[1]); c.yaw = Math.atan2(-u[0], -u[2]) + ${dyaw};
    c.update(1e-4, s.keys);
    for (const k of ["vf", "vr", "vu"]) { const src = { vf: c.fwd, vr: c.right, vu: c.up }[k]; for (let q = 0; q < 3; q++) c[k][q] = src[q]; }
  }
  window.__lead = { t, u: [...u] };
  window.__fire = () => s.ent.playerFire();
  if (${fire}) __fire();
  return { t: +t.toFixed(3), u: u.map(v => +v.toFixed(4)) };
})()`;
const PIP_PROBE = `(async () => {
  const s = __space, c = s.cam, sh = __sh;
  const { leadAim, aimState } = await import("/src/creations/space/aim.js");
  const u = [0, 0, 0];
  leadAim(c, sh, u);
  c.project(c.x + u[0] * 2500, c.y + u[1] * 2500, c.z + u[2] * 2500);
  const want = [c.out[0], c.out[1]];
  return { drawn: [Math.round(aimState.pip.x), Math.round(aimState.pip.y)], want: want.map(Math.round), on: aimState.on, tol: Math.round(aimState.tol) };
})()`;
SCEN["combat-lead"] = [
  ["reload"], [1500],
  ["probe", "setup", AIM_SETUP],
  ["eval", AIM_AT(false, 0)], ["eval", "__fire()"], [1600],
  ["probe", "controlMiss", "({ hp: __sh.hp, hit: __spy.maxHit, sfx: __spy.sfx })"],
  ["probe", "leadSolve", AIM_AT(true, 0.09)], [60],
  ["probe", "pipOffTarget", PIP_PROBE],
  ["shot", "combat-lead-off"],
  ["probe", "leadAimed", AIM_AT(true, 0, true)], [40],
  ["probe", "pipOnTarget", PIP_PROBE],
  ["shot", "combat-lead-on"],
  [1000],
  ["probe", "leadHit", "({ hp: __sh.hp, hitT: +__spy.maxHit.toFixed(3), sfx: __spy.sfx })"],
];
// combat-hit: two non-lethal hits show the flash, tick, HP row, hit marker; third kills
SCEN["combat-hit"] = [
  ["reload"], [1500],
  ["probe", "setup", AIM_SETUP],
  ["eval", "__V = [0, 0, 0]"],
  ["eval", AIM_AT(true, 0, true)], [900],
  ["probe", "afterOne", "({ hp: __sh.hp, hpMax: __sh.hpMax, flash: +__spy.maxHit.toFixed(3), sfx: __spy.sfx, mark: +__space.ent.mark.t.toFixed(3) })"],
  ["eval", "__fire()"], [900],
  ["probe", "afterTwo", "({ hp: __sh.hp, alive: __sh.alive, sfx: __spy.sfx })"],
  // hitT/mark last ~0.1s, shorter than a screenshot: pin them to eyeball the draw
  ["eval", "__sh.hitT = 9; __space.ent.mark.t = 9; __space.ent.mark.kill = false"],
  [120], ["shot", "combat-hit-hp"],
  ["eval", "__sh.hitT = 0; __space.ent.mark.t = 9; __space.ent.mark.kill = true"],
  [120], ["shot", "combat-kill-mark"],
  ["eval", "__sh.hitT = 0; __space.ent.mark.t = 0"],
  ["eval", "__fire()"], [900],
  ["probe", "killed", "({ alive: __sh.alive, kills: __space.run.kills, sfx: __spy.sfx })"],
];
SCEN["combat-lead-chase"] = [
  ["goto", "?ship=kestrel&view=chase"], [2500],
  ["probe", "view", "__space.view"],
  ["probe", "chase_setup", AIM_SETUP],
  ["probe", "chase_leadSolve", AIM_AT(true, 0.09)], [60],
  ["probe", "chase_pipOffTarget", PIP_PROBE],
  ["shot", "combat-chase-off"],
  ["probe", "chase_leadAimed", AIM_AT(true, 0)], [60],
  ["probe", "chase_pipOnTarget", PIP_PROBE],
  ["shot", "combat-chase-on"],
];

// hud-chase: long COM text, invuln readout and world particles in the strip
// band. Probes: no world home inside the strip, COM text inside its cell,
// no cell/hub overlap.
const HUD_PROBE = `(() => {
  const s = __space, f = s.field, L = s.deck.layoutInfo(), top = innerHeight - L.stripH;
  let inStrip = 0, live = 0;
  for (const rg of [s.layers.ent, s.layers.course, s.layers.planets, s.layers.stars, s.layers.fx])
    for (let p = rg.lo; p < rg.hi; p++) {
      if (!f.homed[p] || f.home[p * 3] < -4e3) continue;
      live++;
      if (f.home[p * 3 + 1] >= top) inStrip++;
    }
  const com = L.boxes.find((b) => b.id === "com"), h = document.getElementById("hub").getBoundingClientRect();
  const hit = (a, b) => a.x - a.hw < b.x + b.hw && a.x + a.hw > b.x - b.hw && a.y - a.hh < b.y + b.hh && a.y + a.hh > b.y - b.hh;
  let cellOverlap = 0;
  for (let i = 0; i < L.boxes.length; i++) {
    for (let j = i + 1; j < L.boxes.length; j++) if (hit(L.boxes[i], L.boxes[j])) cellOverlap++;
    const b = L.boxes[i];
    if (hit(b, { x: (h.left + h.right) / 2, y: (h.top + h.bottom) / 2, hw: h.width / 2, hh: h.height / 2 })) cellOverlap += 100;
  }
  return { inStrip, live, comTextW: Math.round(L.msgW), comCellW: Math.round(com.hw * 2), fits: L.msgW <= com.hw * 2, cellOverlap, hubTop: Math.round(h.top), boxBottom: Math.round(Math.max(...L.boxes.map((b) => b.y + b.hh + 5))) };
})()`;
const HUD_SET = `(() => { const s = __space;
  s.hud.flash("damaged relay - thread the gap and keep the line", 30);
  s.run.invuln = 30;
  for (let k = 0; k < 6; k++) s.fx.burst(s.cam.x, s.cam.y, s.cam.z - 60, [1, 0.5, 0.8], 80, 60);
  return 1; })()`;
SCEN["hud-chase"] = [
  ["viewport", 1600, 900],
  ["goto", "?ship=kestrel&view=chase"], [2500],
  ["eval", HUD_SET], [400],
  ["probe", "hud1600", HUD_PROBE],
  ["shot", "hud-chase-1600"],
  ["viewport", 390, 844], [600],
  ["eval", HUD_SET], [400],
  ["probe", "hud390", HUD_PROBE],
  ["shot", "hud-chase-390"],
  ["viewport", 1600, 900],
  ["eval", "localStorage.removeItem('space.view')"],
];

// holo-*: the dash compass. HOLO reads the pad contract and the arrow's
// projected homes: centroid, extent, mean colour (normalised, so hue
// compares across brightness), live beam motes, the tail->tip screen
// vector and depthRatio = head mean size / tail mean size (>1: the tip is
// the near end, so the arrow points at the eye; <1: away).
const HOLO = `(() => {
  const s = __space, f = s.field, h = s.cockpit.holo, P = s.deck.pad;
  const nA = h.arrow;
  let n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, c = [0, 0, 0], beam = 0;
  let hs = 0, hn = 0, ts = 0, tn = 0, tx = 0, ty = 0, tc = 0;
  for (let k = 0; k < nA + h.beam; k++) {
    const p = h.lo + k, j = p * 3, x = f.home[j], y = f.home[j + 1];
    if (!f.size[p] || x < -4e3) continue;
    if (k >= nA) { beam++; continue; }
    n++; sx += x; sy += y;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    for (let e = 0; e < 3; e++) c[e] += f.hcol[j + e];
    const a = h.tab[k * 4];
    if (a > 0.25) { hs += f.size[p]; hn++; }
    if (a < -0.25) { ts += f.size[p]; tn++; }
    if (a < -0.45) { tx += x; ty += y; tc++; }
  }
  const tip = h.lo;
  const m = Math.max(...c) || 1;
  const cx = n ? sx / n : -1, cy = n ? sy / n : -1;
  return {
    pad: { on: P.on, lit: P.lit, x: P.x | 0, y: P.y | 0, r: +P.r.toFixed(1) },
    aim: +P.aim.toFixed(2), n, beam, centroid: [cx | 0, cy | 0],
    size: n ? [(x1 - x0) | 0, (y1 - y0) | 0] : null,
    edgeHue: c.map((v) => +(v / m).toFixed(2)),
    mode: h.mode,
    tipVec: tc ? [(f.home[tip * 3] - tx / tc) | 0, (f.home[tip * 3 + 1] - ty / tc) | 0] : null,
    depthRatio: hn && tn ? +((hs / hn) / (ts / tn)).toFixed(2) : null,
    ref: { seg: P.nSeg, dot: P.nDot },
    overDash: n > 0 && cy > innerHeight * 0.5 && cy < P.y && P.y - cy < innerHeight * 0.16,
  };
})()`;
// park the ship and turn so the next relay sits yawOff off the nose
// (+ turns left, so -PI/2 puts the relay hard left)
const FACE_RELAY = (yawOff) => `(() => {
  const s = __space, c = s.cam, g = s.run.next;
  s.auto = false; s.keys.KeyW = false;
  if (!g) return null;
  const dx = g.x - c.x, dy = g.y - c.y, dz = g.z - c.z, d = Math.hypot(dx, dy, dz);
  c.pitch = Math.asin(dy / d); c.yaw = Math.atan2(-dx, -dz) + ${yawOff}; c.roll = 0;
  c.yv = c.pv = c.rv = 0; c.vx = c.vy = c.vz = 0;
  c.update(1e-4, s.keys);
  return 1;
})()`;
const HOLO_BUDGET = `(() => {
  const s = __space, c = s.cockpit, h = c.holo, L = s.ext;
  return { N: s.field.N, layer: L.hi, motes: c.motes, reticle: c.pts - h.arrow - h.beam,
    arrow: h.arrow, beam: h.beam, exterior: L.hi - L.lo };
})()`;
const holoShip = (ship) => [
  ["goto", `?ship=${ship}&view=cockpit`], [2500],
  ["eval", "window.__space.auto = true"],
  [2500],
  ["eval", FACE_RELAY(0)], [900],
  ["probe", `${ship}Ahead`, HOLO],
  ["shot", `holo-${ship}-ahead`],
  ["eval", FACE_RELAY(-Math.PI / 2)], [900],
  ["probe", `${ship}Left`, HOLO],
  ["shot", `holo-${ship}-left`],
  ["eval", FACE_RELAY(Math.PI)], [900],
  ["probe", `${ship}Behind`, HOLO],
  ["shot", `holo-${ship}-behind`],
];
SCEN["holo-dash"] = [
  ...holoShip("kestrel"),
  ["probe", "budgetDesktop", HOLO_BUDGET],
  // no pending relay: freeze the run ("over" stops course.next writes) and
  // clear the target - the pad idles dim with no arrow
  ["eval", "__space.run.phase = 'over'; __space.run.next = null"], [900],
  ["probe", "kestrelIdle", HOLO],
  ["shot", "holo-kestrel-idle"],
  ...holoShip("dart"),
  ...holoShip("mule"),
];
SCEN["holo-portrait"] = [
  ["viewport", 390, 844],
  ["goto", "?ship=kestrel&view=cockpit"], [2500],
  ["eval", "window.__space.auto = true"],
  [2500],
  ["eval", FACE_RELAY(-0.5)], [900],
  ["probe", "portrait", HOLO],
  ["probe", "budgetMobile", HOLO_BUDGET],
  ["shot", "holo-portrait"],
  ["viewport", 1600, 900],
];
SCEN["holo-chase"] = [
  ["goto", "?ship=kestrel&view=chase"], [2500],
  ["eval", "window.__space.auto = true"],
  [2500],
  ["eval", FACE_RELAY(-0.6)], [900],
  ["probe", "chase", HOLO],
  ["shot", "holo-chase"],
  ["eval", "localStorage.removeItem('space.view')"],
  // a dock cutscene parks every cockpit point, the compass included
  ["goto", "?ship=kestrel&view=cockpit"], [2500],
  ["eval", `(() => {
    const s = __space, lm = s.course.landmark;
    lm.x = s.cam.x + s.cam.fwd[0] * 600 + s.cam.right[0] * 120;
    lm.y = s.cam.y + s.cam.fwd[1] * 600;
    lm.z = s.cam.z + s.cam.fwd[2] * 600 + s.cam.right[2] * 120;
    return 1;
  })()`],
  [1500],
  ["probe", "dock", `({ phase: __space.run.phase, holo: ${HOLO} })`],
  ["shot", "holo-dock"],
];

// world2-*: celestial sphere + carrier. W2_SETS names the star-layer slices
// (the pre-sphere build exposed only one tunnel set, probed as "all").
const W2_SETS = `(() => { const st = __space.course.stars, N = __pf.N;
  return st.far ? { far: st.far, near: st.near } : { all: { lo: (N * 0.70) | 0, n: st.n } }; })()`;
const W2_POS = `(() => { const f = __pf, o = {};
  for (const [k, r] of Object.entries(${W2_SETS})) {
    const a = new Float32Array(r.n * 2);
    for (let i = 0; i < r.n; i++) {
      const p = r.lo + i, j = p * 3, x = f.home[j], y = f.home[j + 1];
      const on = f.homed[p] && f.size[p] > 0 && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
      a[i * 2] = on ? x : NaN; a[i * 2 + 1] = y;
    }
    o[k] = a;
  }
  return o; })()`;
const W2_VIS = `(() => { const o = {};
  for (const [k, a] of Object.entries(${W2_POS})) {
    let n = 0; for (let i = 0; i < a.length; i += 2) if (a[i] === a[i]) n++;
    o[k] = n;
  }
  return o; })()`;
const W2_CAM = "(({ yaw, pitch, roll, f, cx, cy, ox, oy }) => ({ yaw, pitch, roll, f, cx, cy, ox, oy }))(__space.cam)";
const W2_DRIFT0 = `window.__w2 = { t: performance.now(), pos: ${W2_POS}, cam: ${W2_CAM} }; 1`;
const W2_DRIFT = `(() => { const now = ${W2_POS}, dt = (performance.now() - __w2.t) / 1000, c1 = ${W2_CAM}, dc = {};
  for (const k in c1) dc[k] = +(c1[k] - __w2.cam[k]).toFixed(4);
  const o = { dt: +dt.toFixed(2), dCam: dc };
  for (const k in now) {
    const a = __w2.pos[k], b = now[k];
    let n = 0, s = 0;
    for (let i = 0; i < a.length; i += 2) {
      if (a[i] !== a[i] || b[i] !== b[i]) continue;
      n++; s += Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1]);
    }
    o[k] = { pairs: n, meanPxPerS: n ? +(s / n / dt).toFixed(1) : null };
  }
  return o; })()`;
SCEN["world2-stars"] = [
  ["reload"], [1500],
  ["eval", `(() => { const s = __space, c = s.cam;
    s.auto = false; c.yaw = 0; c.pitch = 0; c.roll = 0; c.yv = c.pv = c.rv = 0;
    s.keys.KeyW = true; s.keys.ShiftLeft = true;
    window.__w2fill = setInterval(() => { c.boost = 1; }, 50); // full burn, steady FOV
    return 1; })()`],
  [3200],
  ["probe", "speedK", "+__space.cam.speedK.toFixed(2)"],
  ["probe", "visFly", W2_VIS],
  ["eval", W2_DRIFT0], ["shot", "world2-fly-a"], [1000],
  ["probe", "driftStraight", W2_DRIFT], ["shot", "world2-fly-b"],
  ["eval", "__space.keys.ArrowLeft = true"], [500],
  ["eval", W2_DRIFT0], [400],
  ["probe", "driftTurn", W2_DRIFT], ["shot", "world2-turn"],
  ["eval", `(() => { const s = __space, c = s.cam; s.keys.ArrowLeft = false; s.keys.KeyW = false; s.keys.ShiftLeft = false; clearInterval(__w2fill);
    c.vx = c.vy = c.vz = 0; c.yv = c.pv = c.rv = 0; c.yaw = 0; c.pitch = 0; return 1; })()`],
  [1200],
  ["probe", "visRest", W2_VIS], ["shot", "world2-rest"],
  ["eval", "__space.cam.yaw = Math.PI; __space.cam.update(0.016, __space.keys); 1"], [700],
  ["probe", "visBack", W2_VIS],
  ["eval", "__space.cam.yaw = Math.PI / 2; __space.cam.update(0.016, __space.keys); 1"], [700],
  ["probe", "visLeft", W2_VIS],
  ["probe", "budget", `(() => { const c = __space.course, st = c.stars, N = __pf.N;
    return { N, far: st.far.n, near: st.near.n, glint: st.glint.n, carrier: c.landmark.n,
      planet: c.planets.map(p => p.n), bolts: __space.ent.bolts.length }; })()`],
];
// carrier close-up: pin her broadside (+z flank to the eye) at range d and
// measure, per role, drawn sprite diameter vs nearest-neighbour spacing on
// screen - ratio >= 1 means neighbours visibly overlap into a surface
const W2_PIN = (d) => `(() => { const s = __space, c = s.cam, lm = s.course.landmark;
  s.run.storyDone = true; // no dock cutscene: keep the cockpit eye
  s.auto = false; s.keys.KeyW = false; c.vx = c.vy = c.vz = 0; c.yv = c.pv = c.rv = 0;
  lm.x = c.x + c.fwd[0] * ${d}; lm.y = c.y + c.fwd[1] * ${d}; lm.z = c.z + c.fwd[2] * ${d};
  for (let i = 0; i < 3; i++) { lm.D[i] = c.right[i]; lm.U[i] = c.up[i]; lm.V[i] = -c.fwd[i]; }
  lm.spin = -0.25; return 1; })()`;
const W2_MERGE = `(() => { const f = __pf, lm = __space.course.landmark, px = 0.006 * Math.min(innerHeight, 1100) * 9 / 7.8;
  const out = { vis: 0 };
  for (const [name, role] of [["plate", 0], ["edge", 1]]) {
    const pts = [];
    for (let i = 0; i < lm.n; i++) {
      const p = lm.lo + i, j = p * 3;
      if (lm.kind[i] !== role || f.home[j] < -4e3 || !f.size[p]) continue;
      pts.push([f.home[j], f.home[j + 1], f.size[p] * px]);
    }
    const nn = pts.map(a => { let m = 1e9; for (const b of pts) if (b !== a) m = Math.min(m, Math.hypot(a[0] - b[0], a[1] - b[1])); return m; }).sort((a, b) => a - b);
    const dia = pts.map(a => a[2]).sort((a, b) => a - b), med = (v) => v.length ? +v[v.length >> 1].toFixed(1) : null;
    // the soft disc reads over about half its drawn diameter
    out[name] = { n: pts.length, diaPx: med(dia), nnPx: med(nn), overlap: pts.length ? +(0.5 * med(dia) / med(nn)).toFixed(2) : null };
  }
  for (let i = 0; i < lm.n; i++) if (f.home[(lm.lo + i) * 3] > -4e3) out.vis++;
  return out; })()`;
SCEN["world2-carrier"] = [
  ["reload"], [1500],
  ["eval", W2_PIN(260)], [600], ["probe", "near260", W2_MERGE], ["shot", "world2-carrier-260"],
  ["eval", W2_PIN(700)], [600], ["probe", "mid700", W2_MERGE], ["shot", "world2-carrier-700"],
  ["eval", W2_PIN(2400)], [600], ["probe", "far2400", W2_MERGE], ["shot", "world2-carrier-2400"],
];
// holo3d: the 3D compass at fixed attitudes, both reference variants.
// AIM_REL freezes the run ("over" stops course.next writes) and parks the
// relay 3000wu out along (right, up, fwd) in the ship frame; SWEEP turns
// it one slow full yaw (8s) so samples land at 45/135/225/315 deg.
const AIM_REL = (r, u, f) => `(() => {
  const s = __space, c = s.cam, k = 3000 / Math.hypot(${r}, ${u}, ${f});
  clearInterval(window.__sweep);
  s.auto = false; s.run.phase = "over";
  const v = [0, 1, 2].map((e) => c.right[e] * ${r} + c.up[e] * ${u} + c.fwd[e] * ${f});
  s.run.next = { x: c.x + v[0] * k, y: c.y + v[1] * k, z: c.z + v[2] * k };
  return 1;
})()`;
const SWEEP = `(() => {
  const s = __space, c = s.cam, t0 = performance.now();
  clearInterval(window.__sweep);
  s.auto = false; s.run.phase = "over";
  const go = () => {
    const a = ((performance.now() - t0) / 8000) * 6.2832;
    window.__sweepA = (a * 180) / Math.PI;
    const r = -Math.sin(a), f = Math.cos(a);
    const v = [0, 1, 2].map((e) => c.right[e] * r + c.fwd[e] * f);
    s.run.next = { x: c.x + v[0] * 3000, y: c.y + v[1] * 3000, z: c.z + v[2] * 3000 };
  };
  go();
  window.__sweep = setInterval(go, 30);
  return 1;
})()`;
const PAD_RECT = `(() => { const P = __space.deck.pad; return { x: P.x - 130, y: P.y - 190, width: 260, height: 230 }; })()`;
const S3 = Math.SQRT1_2, T3 = 1 / Math.sqrt(3);
const ATT = [
  ["ahead", 0, 0, 1], ["behind", 0, 0, -1], ["left", -1, 0, 0], ["right", 1, 0, 0],
  ["up", 0, 1, 0], ["down", 0, -1, 0], ["fwd-up-L", -T3, T3, T3], ["aft-dn-R", T3, -T3, -T3],
  ["fwd-R30", 0.5, 0, Math.sqrt(3) / 2],
];
const holo3d = (mode) => [
  ["goto", `?ship=kestrel&view=cockpit&compass=${mode}`], [2500],
  ...ATT.flatMap(([n, r, u, f]) => [
    ["eval", AIM_REL(r, u, f)], [900],
    ["probe", `${mode}:${n}`, HOLO],
    ["shot", `holo3d-${mode}-${n}`],
    ["crop", mode, n, PAD_RECT],
  ]),
  ["eval", SWEEP],
  ...[45, 135, 225, 315].flatMap((deg) => [
    ["eval", `new Promise((res) => { const w = () => (window.__sweepA >= ${deg} ? res(1) : requestAnimationFrame(w)); w(); })`],
    ["probe", `${mode}:sweep${deg}`, HOLO],
    ["shot", `holo3d-${mode}-sweep${deg}`],
    ["crop", mode, `sweep${deg}`, PAD_RECT],
  ]),
  ["eval", "clearInterval(window.__sweep)"],
];
SCEN.holo3d = [...holo3d("ball"), ...holo3d("stalk"), ["sheet", "space-holo3d-sheet.png"]];

const names = process.argv.slice(2);
const which = names.length ? names : ["boot"];
const errors = [];
const probes = {};
const crops = [];
const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const QS = process.env.SPACE_QS ? `?${process.env.SPACE_QS}` : "";
await page.goto(`${BASE}/space.html${QS}`);
// the run opens on the ship picker: capture it, preview hull 2 live,
// then launch on kestrel
if (!QS.includes("ship=")) {
  await page.waitForTimeout(900);
  await page.keyboard.press("Digit2"); // dart preview - canopy should narrow
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "space-pick.png") });
  await page.keyboard.press("Digit1");
  await page.keyboard.press("Enter");
}
for (const name of which) {
  for (const s of SCEN[name]) {
    if (typeof s[0] === "number") await page.waitForTimeout(s[0]);
    else if (s[0] === "shot") await page.screenshot({ path: path.join(OUT, `space-${s[1]}.png`) });
    else if (s[0] === "key") {
      await page.keyboard.down(s[1]);
      await page.waitForTimeout(s[2]);
      await page.keyboard.up(s[1]);
    } else if (s[0] === "eval") await page.evaluate(s[1]);
    else if (s[0] === "viewport") { await page.setViewportSize({ width: s[1], height: s[2] }); await page.waitForTimeout(300); }
    else if (s[0] === "goto") {
      await page.goto(`${BASE}/space.html${s[1]}`);
      await page.waitForTimeout(400);
    } else if (s[0] === "reload") {
      await page.reload(); await page.waitForTimeout(400);
      if (!QS.includes("ship=")) await page.keyboard.press("Enter"); // leave the picker
    }
    else if (s[0] === "crop") {
      const clip = await page.evaluate(s[3]);
      const b64 = (await page.screenshot({ clip })).toString("base64");
      const pr = probes[`${s[1]}:${s[2]}`];
      crops.push({ row: s[1], label: s[2], b64, note: pr && pr.depthRatio != null ? `depth ${pr.depthRatio}` : "" });
    } else if (s[0] === "sheet") {
      // drawn in the page itself: no image dependency on the node side
      const b64 = await page.evaluate(async (crops) => {
        const rows = [...new Set(crops.map((c) => c.row))];
        const ims = await Promise.all(crops.map(async (c) => createImageBitmap(await (await fetch(`data:image/png;base64,${c.b64}`)).blob())));
        const cw = ims[0].width, ch = ims[0].height, LW = 70, TH = 34;
        const cols = Math.max(...rows.map((r) => crops.filter((c) => c.row === r).length));
        const cv = new OffscreenCanvas(LW + cols * cw, rows.length * (ch + TH));
        const g = cv.getContext("2d");
        g.fillStyle = "#05080b"; g.fillRect(0, 0, cv.width, cv.height);
        g.font = "13px monospace"; g.textBaseline = "top";
        rows.forEach((r, ri) => {
          const y = ri * (ch + TH);
          g.fillStyle = "#cfe"; g.fillText(r, 8, y + TH + ch / 2);
          crops.filter((c) => c.row === r).forEach((c, ci) => {
            const x = LW + ci * cw;
            g.drawImage(ims[crops.indexOf(c)], x, y + TH);
            g.strokeStyle = "#234"; g.strokeRect(x + 0.5, y + TH + 0.5, cw - 1, ch - 1);
            g.fillStyle = "#cfe"; g.fillText(c.label, x + 6, y + 3);
            g.fillStyle = "#7a9"; g.fillText(c.note, x + 6, y + 18);
          });
        });
        const blob = await cv.convertToBlob({ type: "image/png" });
        const u8 = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        return btoa(bin);
      }, crops);
      writeFileSync(path.join(OUT, s[1]), Buffer.from(b64, "base64"));
    } else if (s[0] === "probe") {
      const v = await page.evaluate(s[2]);
      if (v && v.files) { // probe may hand back files (name -> base64) to save under shots/
        for (const [f, b] of Object.entries(v.files)) writeFileSync(path.join(OUT, f), Buffer.from(b, "base64"));
        v.files = Object.keys(v.files).map((f) => path.join(OUT, f));
      }
      probes[s[1]] = v;
    }
  }
}
console.log(JSON.stringify({ errors, probes }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
