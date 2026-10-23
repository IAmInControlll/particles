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
const BASE = `http://localhost:${process.env.PORT || 8321}`;
const OUT = path.join(root, "shots");
mkdirSync(OUT, { recursive: true });

// steps: [ms] wait | ["shot", name] | ["key", code, ms] hold |
// ["eval", js] run js in page | ["probe", name, js] capture js value
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
    else if (s[0] === "goto") {
      await page.goto(`${BASE}/space.html${s[1]}`);
      await page.waitForTimeout(400);
    } else if (s[0] === "reload") {
      await page.reload(); await page.waitForTimeout(400);
      if (!QS.includes("ship=")) await page.keyboard.press("Enter"); // leave the picker
    }
    else if (s[0] === "probe") probes[s[1]] = await page.evaluate(s[2]);
  }
}
console.log(JSON.stringify({ errors, probes }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
