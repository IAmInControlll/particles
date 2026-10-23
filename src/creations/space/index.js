// index.js - Voidrunner orchestrator. Owns the layer split, the run state
// machine, input, and the per-frame write order into home[]/hcol[].
import { createCamera } from "./camera.js";
import { createCourse } from "./course.js";
import { createFx } from "./fx.js";
import { createHud } from "./hud.js";
import { createCockpit } from "./cockpit.js";
import { createDeck } from "./deck.js";
import { createEntities } from "./entities.js";
import { createExterior } from "./exterior.js";
import { createAudio } from "./audio.js";
import { SHIPS } from "./ships.js";
import { createComms } from "./comms.js";
import { createCutscene } from "./cutscene.js";
import { CAST, LEGS, SOULS, ORREN_DOWN, ENDLESS, OVERSHOOT, WAVES } from "./story.js";

export function createSpace(field, PF, mods = {}) {
  const N = field.N;
  field.mouseZone = () => false; // keyboard-only game; cursor is not an input

  // index-range layers on one field (plan's table, scaled to N)
  const cut = (f) => (N * f) | 0;
  const layers = {
    cockpit: { lo: 0, hi: cut(0.10) },
    ent: { lo: cut(0.10), hi: cut(0.36) },
    course: { lo: cut(0.36), hi: cut(0.55) },
    planets: { lo: cut(0.55), hi: cut(0.70) }, // sun + derelict + planets + giant
    stars: { lo: cut(0.70), hi: cut(0.89) },
    fx: { lo: cut(0.89), hi: N },
  };
  // world layers sit under the hull backing - cull keeps them in the panes
  const WORLD = [layers.ent, layers.course, layers.planets, layers.stars, layers.fx];

  const cam = createCamera(PF);
  const au = createAudio();
  const deck = createDeck(cam, field);
  const course = createCourse(field, cam, PF, layers);
  const fx = createFx(field, cam, PF, layers.fx);
  const mkCockpit = mods.createCockpit || createCockpit;
  const hud = createHud();
  const comms = createComms(CAST, () => au.sfx("comms"));
  const cine = createCutscene(cam, field, fx, course, PF);
  let ent; // created after run exists

  // ship pick: hull sets flight stats, hull size, and canopy shape.
  // ?ship=name launches straight into it; otherwise the run opens on the
  // pick screen and 1/2/3 picks + launches.
  let shipIdx = 0, ship = SHIPS[0];
  {
    const want = PF.params.get("ship") || localStorage.getItem("space.ship");
    const i = SHIPS.findIndex((s) => s.name === want);
    if (i >= 0) shipIdx = i;
  }
  // camera view: cockpit (inside the hull) or chase (third-person behind
  // it). Chosen at pick time only; persisted, ?view= selects directly.
  let view = "cockpit";
  {
    const want = PF.params.get("view") || localStorage.getItem("space.view");
    if (want === "chase") view = "chase";
  }
  const setView = (m) => {
    view = m === "chase" ? "chase" : "cockpit";
    localStorage.setItem("space.view", view);
    cam.chase = view === "chase";
    deck.setView(view);
  };
  let cockpit, exterior;
  const pickShip = (i) => {
    shipIdx = Math.max(0, Math.min(SHIPS.length - 1, i));
    ship = SHIPS[shipIdx];
    localStorage.setItem("space.ship", ship.name);
    cam.thrustK = ship.thrust; cam.capK = ship.cap; cam.turnK = ship.turn;
    run.hullMax = ship.hullMax;
    run.hull = ship.hullMax;
    cockpit = mkCockpit(field, cam, PF, layers.cockpit, deck.pad);
    if (exterior) exterior.setShip(ship.name);
    deck.paint(ship);
  };

  const run = {
    phase: PF.params.get("ship") ? "race" : "pick", // pick | race | fight | dock | over
    score: 0,
    best: +localStorage.getItem("space.best") || 0,
    lives: 5,
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
    waveSize: 0,  // hostiles fielded this wave
    waveKills: 0, // of those, destroyed (rams count) - escapees forfeit the bonus
    legs: 0,       // rescue legs completed
    souls: 0,      // crew pulled off the Blackbird
    wreckDist: 0, // live distance to the derelict (0 = no live objective)
    storyDone: false, // campaign finished - the run goes endless
    next: null, // pending gate the cockpit compass points at
    hullMax: 3,
  };
  const launch = () => {
    au.unlock(); // first gesture: AudioContext may start now
    hud.hidePick();
    restart();
    hud.flash(ship.name, 1.4);
  };
  // pick = preview: the cockpit behind the overlay rebuilds on the spot
  const repick = (i) => {
    pickShip(i);
    showPick();
  };
  const pickView = (m) => {
    setView(m);
    showPick();
  };
  const showPick = () => hud.showPick(SHIPS, shipIdx, view, repick, pickView, launch);
  pickShip(shipIdx);
  // exterior body owns the cockpit layer tail, after motes+reticle+arrow
  exterior = createExterior(field, cam, PF,
    { lo: layers.cockpit.lo + cockpit.used, hi: layers.cockpit.hi });
  exterior.setShip(ship.name);
  setView(view);
  if (run.phase === "pick") showPick();

  // fight damage: shield motes burn first, then hull, then a life.
  // racing crashes (clip/rock) bypass this and take a life directly.
  function hit(n = 1) {
    if (run.invuln > 0 || run.phase === "over") return;
    au.sfx("hit");
    if (run.shield > 0) {
      run.shield -= n;
      if (run.shield < 0) { run.hull += run.shield; run.shield = 0; }
      cam.shake = Math.max(cam.shake, 0.5);
      run.jitter = Math.max(run.jitter, 0.5);
      cockpit.shed(24);
      deck.hit();
      hud.flash("shield hit", 0.8);
      return;
    }
    run.hull -= n;
    cam.shake = Math.max(cam.shake, 0.75);
    run.jitter = Math.max(run.jitter, 0.8);
    cockpit.shed(40);
    deck.hit();
    fx.burst(cam.x + cam.fwd[0] * 24, cam.y + cam.fwd[1] * 24, cam.z + cam.fwd[2] * 24, PF.PAL.accent, 40, 90);
    if (run.hull <= 0) { run.hull = run.hullMax; crash(); }
    else hud.flash("hull hit", 0.8);
  }

  function startFight() {
    run.phase = "fight";
    run.wave++;
    au.sfx("wave");
    // wave size steps up with distance flown: 1 under 8 gates, then
    // another hostile per ~8 gates, capped by the ship pool
    const n = Math.min(ent.ships.length, 1 + ((run.gatesPassed / 8) | 0));
    // roster: early waves are all fighters; later waves mix in cheap
    // drones; every 4th wave (or a 1-in-4 roll) fields exactly one heavy
    const roster = [];
    for (let i = 0; i < n; i++)
      roster.push(run.wave < 3 ? "fighter" : PF.rnd() < 0.5 ? "drone" : "fighter");
    if (run.wave >= 3 && (run.wave % 4 === 0 || PF.rnd() < 0.25))
      roster[(PF.rnd() * roster.length) | 0] = "heavy";
    for (const kind of roster) ent.spawnShip(kind);
    run.waveSize = ent.countAlive(); run.waveKills = 0;
    hud.flash(n > 1 ? `${n} hostiles inbound` : "hostile inbound", 1.6);
    // flavour on the radio, only into a quiet channel
    if (!comms.busy() && PF.rnd() < 0.6) {
      const pool = WAVES[run.storyDone ? 3 : run.legs];
      comms.say([pool[(PF.rnd() * pool.length) | 0]]);
    }
  }

  ent = createEntities(field, cam, PF, layers.ent, {
    fx, au,
    hit,
    onKill: (s) => {
      run.score += s.score;
      run.kills++;
      run.waveKills++;
      au.sfx("kill");
      hud.pop(`${s.kind} +${s.score}`, "#e85444");
      if (s === orren) { orren = null; comms.say(ORREN_DOWN, true); }
    },
    onIntercept: () => {
      run.score += 15;
      au.sfx("hit");
      hud.pop("intercepted +15", "#e8a044");
    },
    onPickup: (kind) => {
      run.score += 10;
      au.sfx("pick");
      if (kind === "boost") { cam.boost = 1; hud.pop("BST +10 - boost refilled", "#ffd159"); }
      else if (kind === "health") { run.hull = Math.min(run.hullMax, run.hull + 1); hud.pop("HUL +10 - hull patched", "#66f2b2"); }
      else { run.shield = Math.min(6, run.shield + 2); hud.pop("SHD +10 - shield motes +2", "#598cf2"); }
    },
  });
  const world = { ent, course, feed: hud.feed }; // feed: score popups under the reticle
  course.onIntro = (text) => hud.flash(text, 2.6); // first sighting of each gate kind

  // snap tracking: teleports rigid layers every frame (crisp, no spring lag).
  // spring mode lets homing smooth camera motion. T toggles, persisted.
  let snapTrack = localStorage.getItem("space.track") !== "spring"; // snap is the default; T flips to spring

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
    au.sfx("hit");
    run.combo = 0;
    run.lives--;
    run.invuln = 2.4;
    run.jitter = 1;
    cam.shake = 1;
    cam.vx *= 0.3; cam.vy *= 0.3; cam.vz *= 0.3;
    cockpit.shed(90);
    deck.hit();
    fx.burst(cam.x + cam.fwd[0] * 30, cam.y + cam.fwd[1] * 30, cam.z + cam.fwd[2] * 30, PF.PAL.hot, 110, 140);
    if (run.lives <= 0) return gameOver();
    hud.flash(`hull breach - ${run.lives} ${run.lives === 1 ? "life" : "lives"} left`, 1.8);
  }

  function gameOver() {
    run.phase = "over";
    au.sfx("over");
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
    au.unlock(); // any key is a gesture - safe to resume the context
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === "KeyM") {
      const m = au.toggle();
      hud.flash(m ? "muted" : "sound on", 0.8);
    }
    if (e.code === "KeyT") {
      snapTrack = !snapTrack;
      localStorage.setItem("space.track", snapTrack ? "snap" : "spring");
      hud.flash(snapTrack ? "snap tracking" : "spring tracking", 0.9);
    }
    if (e.code === "KeyV" && run.phase === "pick")
      pickView(view === "chase" ? "cockpit" : "chase");
    const dig = e.code === "Digit1" ? 0 : e.code === "Digit2" ? 1 : e.code === "Digit3" ? 2 : -1;
    if (dig >= 0 && run.phase === "pick") repick(dig); // preview the hull live
    else if (dig >= 0 && run.phase === "over") { pickShip(dig); hud.flash(`${ship.name} - R to launch`, 1.4); }
    if ((e.code === "Enter" || e.code === "Space") && run.phase === "pick") launch();
    if ((e.code === "Enter" || e.code === "Space") && run.phase === "dock" && !e.repeat) cine.skip();
    if (e.code === "KeyR" && run.phase === "over") restart();
  });
  addEventListener("keyup", (e) => (keys[e.code] = false));
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  addEventListener("pointerdown", () => au.unlock()); // clicks are gestures too
  field.onResize = () => { cam.resize(); deck.resize(); };

  function restart() {
    run.phase = "race";
    run.score = 0; run.combo = 0; run.lives = 5; run.hull = run.hullMax; run.shield = 0;
    run.dist = 0; run.hostiles = 0; run.gatesPassed = 0; run.wave = 0;
    run.kills = 0; run.invuln = 0; run.jitter = 0;
    run.waveSize = 0; run.waveKills = 0;
    run.legs = 0; run.souls = 0; run.wreckDist = 0; run.storyDone = false;
    legOpen = -1; legSeq = -1; beats = 0; ambushed = false; orren = null;
    comms.clear(); cine.resetBoom();
    cam.x = cam.y = cam.z = 0;
    cam.vx = cam.vy = cam.vz = 0;
    cam.yaw = cam.pitch = cam.roll = 0;
    cam.yv = cam.pv = cam.rv = 0;
    cam.boost = 1;
    course.reset();
    ent.reset();
    hud.hideOver();
    hud.flash("run it back", 1.4);
  }

  // campaign driver over story.js. Beats fire once per leg as the wreck
  // range closes (fractions of the leg's spawn distance); the radio queue
  // keeps them from talking over each other. Inside DOCK_R the run hands
  // off to a cutscene (phase "dock"); docked() hands it back.
  const DOCK_R = 700;
  // the rings are a dormant relay chain; damaged kinds read in the pop
  const RELAY = { drift: "drifting relay", spin: "faulty relay", boost: "overcharged relay" };
  let legOpen = -1, legSeq = -1, beats = 0, ambushed = false, orren = null, patched = false;

  function story() {
    const lm = course.landmark;
    const dl = Math.hypot(lm.x - cam.x, lm.y - cam.y, lm.z - cam.z);
    run.wreckDist = run.storyDone ? 0 : dl;
    if (run.storyDone) return;
    const leg = LEGS[run.legs];
    if (legOpen !== run.legs) {
      legOpen = run.legs; beats = 0; ambushed = false;
      comms.say(leg.open);
    } else if (lm.seq !== legSeq) comms.say(OVERSHOOT);
    legSeq = lm.seq;
    const ll = lm.legLen || dl;
    leg.beats.forEach((b, i) => {
      if (!(beats & (1 << i)) && dl < b.at * ll) { beats |= 1 << i; comms.say(b.say); }
    });
    if (leg.ambush && !ambushed && dl < leg.ambush.dist) {
      ambushed = true;
      for (const k of leg.ambush.roster) ent.spawnShip(k);
      orren = ent.ships.find((s) => s.alive && s.kind === "heavy" && s.age === 0) || null;
      run.waveSize = ent.countAlive(); run.waveKills = 0;
      run.phase = "fight";
      au.sfx("wave");
      hud.flash("hostiles on the wreck", 2);
      comms.say(leg.ambush.say, true);
    }
    if (dl < DOCK_R) dock(leg);
  }

  function dock(leg) {
    run.phase = "dock";
    run.wreckDist = 0;
    run.legs++;
    run.souls += leg.souls;
    run.score += 800; // paid on the clamp so the finale's end card counts it
    patched = run.hull < run.hullMax;
    if (patched) run.hull++;
    course.landmark.done = true; // hold the carrier still while the camera films it
    au.sfx("gate");
    hud.flash("docking clamps engaged", 2);
    deck.setView("chase"); // the external eye needs the no-hull render path
    hud.cine(true);
    cine.play({ ...leg.dock, caption: `LEG ${run.legs} // ${leg.title} // ${leg.souls} SOULS ABOARD` }, cue, docked);
  }

  const ACT = {
    pods: () => fx.escort(course.landmark, 14),
    // the reactor takes Orren's pack with the ship
    boom: () => {
      cine.boom();
      for (const s of ent.ships) if (s.alive) {
        fx.burst(s.x, s.y, s.z, PF.PAL.hot, 50, 120);
        run.score += s.score; run.kills++;
      }
      ent.reset();
      orren = null;
    },
    card: () => hud.campaignDone(run, SOULS),
  };
  // skipping fires every remaining cue at once, so lines queue, never cut
  const cue = (c, skipping) => {
    if (c.say) comms.say(c.say, c.now && !skipping);
    if (c.act) ACT[c.act]();
  };

  function docked() {
    deck.setView(view);
    hud.cine(false);
    run.invuln = Math.max(run.invuln, 1.5);
    hud.pop(`souls aboard +800${patched ? " - hull patched" : ""}`, "#66f2b2");
    if (run.legs >= LEGS.length) {
      run.storyDone = true;
      comms.say(ENDLESS);
      hud.flash("endless run", 2);
    } else {
      course.landmark.done = false;
      course.respawnLm(run.legs);
    }
    run.phase = ent.countAlive() ? "fight" : "race";
  }

  const ckLo = layers.cockpit.lo;
  function dockFrame(dt) {
    cine.frame(dt);
    run.invuln = Math.max(run.invuln, 1.5);
    run.jitter = Math.max(0, run.jitter - dt * 2.2);
    course.frame(dt, snapTrack);
    cine.wreck(dt);
    ent.frame(dt, snapTrack, false);
    fx.frame(dt, snapTrack);
    // cockpit reticle/arrow/motes are screen furniture: park them off-shot
    const home = field.home, snap = field.snap;
    for (let p = ckLo; p < ckLo + cockpit.used; p++) {
      home[p * 3] = -5e3; home[p * 3 + 1] = -5e3; snap[p] = 1;
    }
    exterior.frame(dt, run.phase === "dock" || view === "chase", snapTrack);
    deck.frame(dt, run, world);
    hud.frame(dt);
    comms.frame(dt, cine.draw);
  }

  let fireT = 0, prevAuto = false;

  const game = { field, layers, cam, run, keys, course, ent, hit, deck, ext: exterior, auto: false, au, world, fx, hud, comms, cine };
  Object.defineProperty(game, "ship", { get: () => ship.name });
  Object.defineProperty(game, "cockpit", { get: () => cockpit });
  Object.defineProperty(game, "view", { get: () => view });
  game.frame = (T, dt) => {
    const chase = view === "chase";
    au.engine(cam.speedK, cam.boosting);
    au.music(run.phase === "race" && run.legs === 2 && !run.storyDone ? "finale" : run.phase, cam.speedK);
    if (run.phase === "over" || run.phase === "pick") {
      course.frame(dt, snapTrack);
      fx.frame(dt, snapTrack);
      deck.frame(dt, run, world); // first: cockpit reads this frame's deck.pad
      cockpit.frame(dt, run, world, chase);
      exterior.frame(dt, chase, snapTrack);
      deck.cull(WORLD);
      hud.frame(dt, run, cam);
      comms.frame(dt, cine.draw);
      return;
    }
    if (run.phase === "dock") return dockFrame(dt);
    const prevZ = cam.z;
    if (game.auto) {
      keys.KeyW = true;
      // aim at the nearest pending gate ahead; fall back to the corridor
      let tx = course.trackX(cam.z - 700), ty = course.trackY(cam.z - 700), tz = cam.z - 700;
      for (const g of course.gates)
        if (g.state === 0 && g.z < cam.z - 30 && g.z > tz) { tz = g.z; tx = g.ax; ty = g.ay; }
      const pull = Math.min(1, dt * (cam.z - tz < 400 ? 5 : 1.6));
      cam.x += (tx - cam.x) * pull;
      cam.y += (ty - cam.y) * pull;
    } else if (prevAuto) delete keys.KeyW; // clear autopilot residue once
    prevAuto = game.auto;
    cam.update(dt, keys);
    run.dist = Math.max(run.dist, -cam.z);
    run.invuln = Math.max(0, run.invuln - dt);
    run.jitter = Math.max(0, run.jitter - dt * 2.2);
    cam.diff = 1 + Math.min(0.7, run.dist / 16000);

    story();
    if (run.phase === "dock") return dockFrame(0);

    const ev = run.invuln <= 0 ? course.check(prevZ) : null;
    if (ev) {
      if (ev.type === "pass") {
        const pts = Math.round(25 * (1 + run.combo * 0.5) * (0.65 + cam.speedK * 0.85) * ship.scoreMul);
        run.score += pts;
        run.combo++;
        au.sfx("gate");
        if (ev.kind === "boost") { cam.boost = 1; cam.kick(1.3, 1.7); }
        hud.pop(`${RELAY[ev.kind] || "relay"} lit +${pts}`);
        if (run.phase === "race" && ++run.gatesPassed % 6 === 0) startFight();
      } else if (ev.type === "miss") {
        run.combo = 0;
        hud.flash("relay dark - signal degrading", 1.4);
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
        if (run.waveKills >= run.waveSize) {
          run.score += 200;
          hud.flash("wave clear +200", 1.4);
        } else hud.flash(`${run.waveSize - run.waveKills} broke off - no clear bonus`, 1.4);
      }
    }
    // guns always hot - space fires in race too, there's just nothing
    // to hit between waves
    fireT -= dt;
    if (keys.Space && fireT <= 0) {
      fireT = 0.13;
      ent.playerFire();
      au.sfx("bolt");
    }

    course.frame(dt, snapTrack);
    cine.wreck(dt);
    run.next = course.next;
    ent.frame(dt, snapTrack, run.phase === "fight");
    fx.frame(dt, snapTrack);
    deck.frame(dt, run, world); // first: cockpit reads this frame's deck.pad
    cockpit.frame(dt, run, world, chase);
    exterior.frame(dt, chase, snapTrack);
    deck.cull(WORLD);
    hud.frame(dt, run, cam);
    comms.frame(dt, cine.draw);
  };
  return game;
}
