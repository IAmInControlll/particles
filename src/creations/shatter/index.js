// index.js - Shatter orchestrator. Layer split, run state machine, tap
// input, hit routing, and the per-frame write order into home[]/hcol[].
import { createCamera } from "./camera.js";
import { createCorridor } from "./corridor.js";
import { createObstacles } from "./obstacles.js";
import { createBalls } from "./balls.js";
import { createFx } from "./fx.js";
import { createHud } from "./hud.js";
import { createAudio } from "./audio.js";
import { createLevel } from "./levels.js";

export function createShatter(field, PF) {
  const N = field.N;
  field.canPull = () => false;    // taps are throws, never engine pull/capture
  field.mouseZone = () => false;  // and never hover repel either

  const cut = (f) => (N * f) | 0;
  const layers = {
    corridor: { lo: 0, hi: cut(0.34) },
    panes: { lo: cut(0.34), hi: cut(0.58) },
    crystals: { lo: cut(0.58), hi: cut(0.68) },
    balls: { lo: cut(0.68), hi: cut(0.76) },
    pickups: { lo: cut(0.76), hi: cut(0.82) },
    debris: { lo: cut(0.82), hi: N },
  };

  const cam = createCamera(PF);
  const au = createAudio();
  const lv = createLevel();
  const corridor = createCorridor(field, cam, PF, layers.corridor, lv);
  const fx = createFx(field, cam, PF, layers.debris);
  const hud = createHud();

  const run = {
    phase: "run", // run | over
    ammo: 25,
    thrown: 0,
    dist: 0,
    bonus: 0,
    score: 0,
    time: 0,
    best: +localStorage.getItem("shatter.best") || 0,
    combo: 0,
    multi: 1,
    invuln: 0,
    deadT: 0,
    pow: { slow: 0, frenzy: 0, heavy: 0 },
  };
  const volleys = []; // {live, hit} per tap; a whiffed volley breaks combo

  const hooks = {
    heavy: () => run.pow.heavy > 0,
    hitTest: null, // wired below
    onHit: null,
  };
  const obs = createObstacles(field, cam, PF, layers, hooks, lv);
  const balls = createBalls(field, cam, PF, layers.balls, hooks);
  hooks.hitTest = obs.hitTest;

  const screenOf = (wx, wy, wz) => cam.project(wx, wy, wz) ? [cam.out[0], cam.out[1]] : [cam.cx, cam.cy];

  hooks.onHit = (hit, b) => {
    const [hx, hy] = screenOf(b.x, b.y, b.z);
    if (hit.type === "pane") {
      obs.release(hit.p, hx, hy);
      run.bonus += 30;
      au.sfx("shatter");
      if (b.vol) b.vol.hit = true;
      if (run.pow.heavy > 0) {
        // splash: the punch carries through to a small radius
        fx.burst(b.x, b.y, b.z, PF.PAL.accent, 26, 4, 0.07);
      }
    } else if (hit.type === "steel") {
      au.sfx("steel");
      fx.burst(b.x, b.y, b.z, PF.PAL.dim, 12, 2.4, 0.03);
    } else if (hit.type === "crystal") {
      const c = hit.c;
      obs.release(c, hx, hy);
      c.on = false;
      run.ammo += c.pay;
      run.bonus += c.pay * 10;
      run.combo++;
      run.multi = Math.min(5, 1 + ((run.combo / 3) | 0));
      if (b.vol) b.vol.hit = true;
      au.sfx("crystal");
      hud.flash(`+${c.pay}`, 0.8);
    } else if (hit.type === "pickup") {
      const pk = hit.pk;
      obs.release(pk, hx, hy);
      pk.on = false;
      run.bonus += 40;
      run.pow[pk.kind] = obs.PKIND[pk.kind].dur;
      if (b.vol) b.vol.hit = true;
      au.sfx("power");
      hud.flash(pk.kind, 1.1);
    }
  };

  function collide(p) {
    au.sfx("hit");
    run.combo = 0; run.multi = 1;
    run.ammo = Math.max(0, run.ammo - 10);
    run.invuln = 2;
    cam.shake = 1;
    obs.release(p, cam.cx, cam.cy);
    fx.burst(cam.x + cam.fwd[0] * 40, cam.y + cam.fwd[1] * 40, cam.z + cam.fwd[2] * 40,
      PF.PAL.hot, 60, 5, 0.09);
    hud.flash(run.ammo > 0 ? "-10" : "out of balls", 1.2);
    if (run.ammo <= 0) gameOver();
  }

  let overShown = false;
  function gameOver() {
    if (run.phase === "over") return;
    run.phase = "over";
    run.deadT = 0.9; // let the last exchange read before the card drops
    au.sfx("over");
    run.score = (run.dist | 0) + run.bonus;
    run.best = Math.max(run.best, run.score);
    try { localStorage.setItem("shatter.best", run.best | 0); } catch {}
  }

  function restart() {
    run.phase = "run";
    run.ammo = 25; run.thrown = 0; run.dist = 0; run.bonus = 0; run.score = 0;
    run.combo = 0; run.multi = 1;
    run.invuln = 0; run.deadT = 0; run.time = 0;
    run.pow.slow = run.pow.frenzy = run.pow.heavy = 0;
    overShown = false;
    volleys.length = 0;
    cam.z = 0; cam.ramp = 0; cam.shake = 0;
    obs.reset(); balls.reset();
    hud.hideOver();
    hud.flash("go", 1);
  }

  // tap-to-throw fires on pointerdown - release-gated taps always read
  // as lag in a runner. The pool cap is the only rate limiter; throwAt
  // itself guards phase, so a press over the modal can't throw
  addEventListener("pointerdown", (e) => {
    au.unlock();
    game.throwAt(e.clientX, e.clientY);
  });
  addEventListener("keydown", (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    au.unlock();
    if (e.code === "KeyM") hud.flash(au.toggle() ? "muted" : "sound on", 0.8);
    if (e.code === "KeyR" && run.phase === "over") restart();
  });
  field.onResize = () => cam.resize();

  const game = { field, cam, run, layers, obs, balls, fx, lv, auto: false, collide, onHit: hooks.onHit };
  game.throwAt = (sx, sy) => {
    if (run.phase !== "run") return false;
    if (run.ammo <= 0 && run.pow.frenzy <= 0) { au.sfx("noammo"); return false; }
    const vol = { live: 0, hit: false };
    const spawned = balls.throwAt(sx, sy, run.multi);
    if (!spawned.length) return false;
    vol.live = spawned.length;
    for (const b of spawned) b.vol = vol;
    volleys.push(vol);
    run.thrown += spawned.length;
    if (run.pow.frenzy <= 0) run.ammo--;
    au.sfx("throw");
    return true;
  };

  // auto mode: aim at the best target on a cadence - drives the headless
  // checks and doubles as an attract mode
  let autoT = 0;
  game.autoTick = (dt) => {
    autoT -= dt;
    if (autoT > 0) return;
    autoT = 0.35;
    let tp = null, tz = -1e9;
    for (const p of obs.panes) {
      if (!p.on || p.deadT) continue;
      if (p.z < cam.z - 1150 || p.z > cam.z - 150) continue;
      const w = obs.weakPoint(p);
      if (w && p.z > tz) { tz = p.z; tp = [w[0], w[1], w[2]]; }
    }
    if (!tp) {
      for (const c of obs.crystals) {
        if (!c.on || c.deadT) continue;
        if (c.z < cam.z - 1150 || c.z > cam.z - 200) continue;
        if (c.z > tz) { tz = c.z; tp = [c.x, c.y, c.z]; }
      }
    }
    if (!tp) {
      for (const pk of obs.pickups) {
        if (!pk.on || pk.deadT) continue;
        if (pk.z < cam.z - 1150 || pk.z > cam.z - 200) continue;
        if (pk.z > tz) { tz = pk.z; tp = [pk.x, pk.y, pk.z]; }
      }
    }
    if (tp && cam.project(tp[0], tp[1], tp[2])) game.throwAt(cam.out[0], cam.out[1]);
  };

  let prevZ = 0;
  game.frame = (T, dt) => {
    run.time += dt;
    const wdt = run.pow.slow > 0 ? dt * 0.5 : dt; // world dilates, balls don't
    for (const k in run.pow) run.pow[k] = Math.max(0, run.pow[k] - dt);
    run.invuln = Math.max(0, run.invuln - dt);

    if (run.phase === "run") {
      prevZ = cam.z;
      cam.ramp = Math.min(0.9, run.dist / 20000);
      cam.update(wdt);
      run.dist = Math.max(run.dist, -cam.z);
      run.score = (run.dist | 0) + run.bonus;
      lv.update(run.dist);
      if (game.auto) game.autoTick(dt);
      obs.spawnAhead(run.dist, run.time, run.ammo);
      const ev = run.invuln <= 0 ? obs.check(prevZ) : null;
      if (ev) collide(ev.p);
      // last ball spent: only the flight already out can still save the run
      if (run.ammo <= 0 && balls.inFlight() === 0) gameOver();
      // whiffed volleys break the combo
      for (let i = volleys.length - 1; i >= 0; i--) {
        const v = volleys[i];
        if (v.live <= 0) {
          if (!v.hit) { if (run.combo > 0) hud.flash("combo lost", 0.8); run.combo = 0; run.multi = 1; }
          volleys.splice(i, 1);
        }
      }
    } else {
      cam.update(wdt); // attract mode: keep drifting behind the card
      run.deadT -= dt;
      if (run.deadT <= 0 && !overShown) {
        overShown = true;
        hud.gameOver(run, restart);
      }
    }

    field.drift.x = cam.cx;
    field.drift.y = cam.cy * 0.7;
    corridor.frame(wdt);
    obs.frame(wdt);
    balls.frame(dt);
    fx.frame(dt);
    hud.frame(dt, run);
  };
  return game;
}
