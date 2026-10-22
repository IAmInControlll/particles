// index.js - Voidrunner orchestrator. Owns the layer split, the run state
// machine, input, and the per-frame write order into home[]/hcol[].
import { createCamera } from "./camera.js";
import { createCourse } from "./course.js";
import { createFx } from "./fx.js";
import { createHud } from "./hud.js";
import { createCockpit } from "./cockpit.js";
import { createEntities } from "./entities.js";

export function createSpace(field, PF) {
  const N = field.N;

  // index-range layers on one field (plan's table, scaled to N)
  const cut = (f) => (N * f) | 0;
  const layers = {
    cockpit: { lo: 0, hi: cut(0.08) },
    ent: { lo: cut(0.08), hi: cut(0.3) },
    course: { lo: cut(0.3), hi: cut(0.58) },
    stars: { lo: cut(0.58), hi: cut(0.86) },
    fx: { lo: cut(0.86), hi: N },
  };

  const cam = createCamera(PF);
  const course = createCourse(field, cam, PF, layers);
  const fx = createFx(field, cam, PF, layers.fx);
  const cockpit = createCockpit(field, cam, PF, layers.cockpit);
  const hud = createHud();
  let ent; // created after run exists

  const run = {
    phase: "race", // race | fight | over
    score: 0,
    best: +localStorage.getItem("space.best") || 0,
    lives: 3,
    hull: 3,
    shield: 0,
    combo: 0,
    dist: 0,
    hostiles: 0,
    invuln: 0,
    jitter: 0,
    gatesPassed: 0,
    wave: 0,
    kills: 0,
  };

  // fight damage: shield motes burn first, then hull, then a life.
  // racing crashes (clip/rock) bypass this and take a life directly.
  function hit(n = 1) {
    if (run.invuln > 0 || run.phase === "over") return;
    if (run.shield > 0) {
      run.shield -= n;
      if (run.shield < 0) { run.hull += run.shield; run.shield = 0; }
      cam.shake = Math.max(cam.shake, 0.5);
      run.jitter = Math.max(run.jitter, 0.5);
      cockpit.shed(24);
      hud.flash("shield hit", 0.8);
      return;
    }
    run.hull -= n;
    cam.shake = Math.max(cam.shake, 0.75);
    run.jitter = Math.max(run.jitter, 0.8);
    cockpit.shed(40);
    fx.burst(cam.x + cam.fwd[0] * 24, cam.y + cam.fwd[1] * 24, cam.z + cam.fwd[2] * 24, PF.PAL.accent, 40, 90);
    if (run.hull <= 0) { run.hull = 3; crash(); }
    else hud.flash("hull hit", 0.8);
  }

  function startFight() {
    run.phase = "fight";
    run.wave++;
    const n = Math.min(3, run.wave);
    for (let i = 0; i < n; i++) ent.spawnShip();
    hud.flash("hostiles inbound", 1.6);
  }

  ent = createEntities(field, cam, PF, layers.ent, {
    fx,
    hit,
    onKill: () => {
      run.score += 150;
      run.kills++;
      hud.flash("kill +150", 1);
    },
    onPickup: (kind) => {
      run.score += 10;
      if (kind === "boost") { cam.boost = 1; hud.flash("boost refilled", 1); }
      else if (kind === "health") { run.hull = Math.min(3, run.hull + 1); hud.flash("hull patched", 1); }
      else { run.shield = Math.min(6, run.shield + 2); hud.flash("shield motes +2", 1); }
    },
  });

  // snap tracking: teleports rigid layers every frame (crisp, no spring lag).
  // spring mode lets homing smooth camera motion. T toggles, persisted.
  let snapTrack = localStorage.getItem("space.track") === "snap";

  const loadBoard = () => {
    try { return JSON.parse(localStorage.getItem("space.board")) || []; }
    catch { return []; }
  };
  const saveScore = (name) => {
    const b = loadBoard();
    b.push({ name, score: run.score });
    b.sort((a, c) => c.score - a.score);
    const top = b.slice(0, 10);
    localStorage.setItem("space.board", JSON.stringify(top));
    return top;
  };

  function crash() {
    if (run.invuln > 0) return;
    run.combo = 0;
    run.lives--;
    run.invuln = 2.4;
    run.jitter = 1;
    cam.shake = 1;
    cam.vx *= 0.3; cam.vy *= 0.3; cam.vz *= 0.3;
    cockpit.shed(90);
    fx.burst(cam.x + cam.fwd[0] * 30, cam.y + cam.fwd[1] * 30, cam.z + cam.fwd[2] * 30, PF.PAL.hot, 110, 140);
    if (run.lives <= 0) return gameOver();
    hud.flash(`hull breach - ${run.lives} ${run.lives === 1 ? "life" : "lives"} left`, 1.8);
  }

  function gameOver() {
    run.phase = "over";
    run.best = Math.max(run.best, run.score);
    localStorage.setItem("space.best", run.best);
    hud.gameOver(run, loadBoard(), saveScore, restart);
  }

  const keys = Object.create(null);
  const GAME_KEYS = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyQ", "KeyE",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space",
    "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  ]);
  addEventListener("keydown", (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === "KeyT") {
      snapTrack = !snapTrack;
      localStorage.setItem("space.track", snapTrack ? "snap" : "spring");
      hud.flash(snapTrack ? "snap tracking" : "spring tracking", 0.9);
    }
    if (e.code === "KeyR" && run.phase === "over") restart();
  });
  addEventListener("keyup", (e) => (keys[e.code] = false));
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  field.onResize = () => cam.resize();

  function restart() {
    run.phase = "race";
    run.score = 0; run.combo = 0; run.lives = 3; run.hull = 3; run.shield = 0;
    run.dist = 0; run.hostiles = 0; run.gatesPassed = 0; run.wave = 0;
    run.kills = 0; run.invuln = 0; run.jitter = 0;
    cam.x = cam.y = cam.z = 0;
    cam.vx = cam.vy = cam.vz = 0;
    cam.yaw = cam.pitch = cam.roll = 0;
    cam.boost = 1;
    course.reset();
    ent.reset();
    hud.hideOver();
    hud.flash("run it back", 1.4);
  }

  let fireT = 0;

  const game = { cam, run, keys, course, ent, hit, auto: false };
  game.frame = (T, dt) => {
    if (run.phase === "over") {
      course.frame(dt, snapTrack);
      fx.frame(dt, snapTrack);
      cockpit.frame(dt, run);
      hud.frame(dt, run, cam);
      return;
    }
    const prevZ = cam.z;
    if (game.auto) {
      keys.KeyW = true;
      // aim at the nearest pending gate ahead; fall back to the corridor
      let tx = course.trackX(cam.z - 700), ty = course.trackY(cam.z - 700), tz = cam.z - 700;
      for (const g of course.gates)
        if (g.state === 0 && g.z < cam.z - 30 && g.z > tz) { tz = g.z; tx = g.x; ty = g.y; }
      const pull = Math.min(1, dt * (cam.z - tz < 400 ? 5 : 1.6));
      cam.x += (tx - cam.x) * pull;
      cam.y += (ty - cam.y) * pull;
    } else delete keys.KeyW;
    cam.update(dt, keys);
    run.dist = Math.max(run.dist, -cam.z);
    run.invuln = Math.max(0, run.invuln - dt);
    run.jitter = Math.max(0, run.jitter - dt * 2.2);
    cam.diff = 1 + Math.min(0.7, run.dist / 16000);

    const ev = run.invuln <= 0 ? course.check(prevZ) : null;
    if (ev) {
      if (ev.type === "pass") {
        const pts = Math.round(25 * (1 + run.combo * 0.5));
        run.score += pts;
        run.combo++;
        hud.flash(`gate +${pts}`, 0.8);
        if (run.phase === "race" && ++run.gatesPassed % 6 === 0) startFight();
      } else if (ev.type === "miss") {
        run.combo = 0;
        hud.flash("missed", 0.9);
      } else {
        run.combo = 0;
        crash();
      }
    }

    // fight wave bookkeeping
    if (run.phase === "fight") {
      run.hostiles = ent.countAlive();
      if (run.hostiles === 0) {
        run.phase = "race";
        run.score += 200;
        hud.flash("wave clear +200", 1.4);
      }
      fireT -= dt;
      if (keys.Space && fireT <= 0) {
        fireT = 0.13;
        ent.playerFire();
      }
    }

    course.frame(dt, snapTrack);
    ent.frame(dt, snapTrack, run.phase === "fight");
    fx.frame(dt, snapTrack);
    cockpit.frame(dt, run);
    hud.frame(dt, run, cam);
  };
  return game;
}
