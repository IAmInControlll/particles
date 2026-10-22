// index.js - Fray. Two particle-built figures duel on a floor line.
// Owns the arena, particle range allocation, input adapters, and the
// match state machine. Per-fighter: verlet skeleton (puppet), armed arm
// with a blade (weapon), intent source (keys+mouse for P0, ai for P1).
import { createVerlet } from "../../lib/verlet.js";
import { createPuppet } from "./puppet.js";
import { createWeapon } from "./weapon.js";
import { createAI } from "./ai.js";
import { createDamage } from "./damage.js";

const PER_FIGHTER = 420;
const WEAPON_N = 130;

export function createFighter(field, PF) {
  const u = field.unit;
  const floor = innerHeight * 0.8;
  const env = () => ({ floor, wallL: innerWidth * 0.09, wallR: innerWidth * 0.91 });

  const e = env();
  const mk = (lo, side, x, body, blade) => {
    const V = createVerlet({ gravity: 2400, iterations: 7 });
    const f = createPuppet(field, V, {
      lo,
      weaponLo: lo + PER_FIGHTER - WEAPON_N,
      hi: lo + PER_FIGHTER,
      side,
      x,
      floor,
      colors: { body },
    });
    f.W = createWeapon(field, f, V, { color: blade });
    return f;
  };

  const f0 = mk(0, 1, e.wallL + u, PF.PAL.ink, PF.PAL.accent);
  const f1 = mk(PER_FIGHTER, -1, e.wallR - u, [1.0, 0.62, 0.38], [1.0, 0.5, 0.3]);
  const fighters = [f0, f1];
  const ai = createAI(f1, f0, u);
  const damage = createDamage(fighters, u);

  // ---- match: intro -> fight -> roundend -> matchend, best of 3 ----
  const match = { state: "intro", round: 1, wins: [0, 0], t: 0, roundsDone: 0 };
  const banner = document.getElementById("banner");
  const fills = [document.getElementById("mass0"), document.getElementById("mass1")];
  const pips = [...document.querySelectorAll("#pips0 .pip"), ...document.querySelectorAll("#pips1 .pip")];
  const say = (t) => banner && (banner.textContent = t);
  say("round 1");

  let career = +(localStorage.getItem("fighter.wins") || 0);
  const midEl = document.querySelector("#hud .mid");
  const paintMid = () => midEl && (midEl.textContent = `fray - ${career}w`);
  paintMid();

  function resetRound() {
    const e = env();
    for (const f of fighters) {
      f.reset(f === f0 ? e.wallL + u : e.wallR - u);
      f.W.reset();
      f.face(f === f0 ? 1 : -1);
    }
  }
  let allocHi = 0;
  for (const f of fighters) allocHi = Math.max(allocHi, f.hi);

  const dim = PF.PAL.dim;
  for (let p = allocHi; p < field.N; p++) {
    field.homed[p] = 0;
    field.hcol[p * 3] = dim[0] * 0.55;
    field.hcol[p * 3 + 1] = dim[1] * 0.55;
    field.hcol[p * 3 + 2] = dim[2] * 0.55;
  }

  // ---- human input -> f0.intent ----
  const keys = {};
  addEventListener("keydown", (ev) => {
    if (ev.repeat) return;
    keys[ev.code] = 1;
    if (ev.code === "KeyW" || ev.code === "ArrowUp") f0.intent.jump = 1;
    if (ev.code === "Space") f0.intent.kick = 1;
  });
  addEventListener("keyup", (ev) => (keys[ev.code] = 0));
  addEventListener("pointerup", () => {
    if (f0.intent.grip) f0.intent.throwNow = 1;
  });

  function readInput() {
    const i = f0.intent;
    i.move = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    i.crouch = keys.KeyS || keys.ArrowDown ? 1 : 0;
    i.aim.x = field.mouse.x;
    i.aim.y = field.mouse.y;
    i.aimOn = field.mouse.x > -9e3 ? 1 : 0;
    i.grip = field.mouse.down ? 1 : 0;
  }

  function step(T, dt) {
    match.t += dt;
    readInput();
    const e = env();
    field.exclude = [
      { l: -200, t: -200, r: e.wallL - 10, b: innerHeight + 200 },
      { l: e.wallR + 10, t: -200, r: innerWidth + 200, b: innerHeight + 200 },
    ];
    field.drift.x = innerWidth / 2;
    field.drift.y = innerHeight * 0.35;

    const fighting = match.state === "fight";
    if (!fighting) f0.intent.move = f1.intent.move = 0;
    if (fighting) ai.step(dt);

    // bodies never share space - fighting-game min separation
    const minSep = 0.45 * u;
    const gapx = f1.x - f0.x;
    if (Math.abs(gapx) < minSep) {
      const push = ((minSep - Math.abs(gapx)) / 2) * Math.sign(gapx || 1);
      f0.x -= push;
      f1.x += push;
    }

    const dx = f1.J.root.x - f0.J.root.x;
    if (Math.abs(dx) > 0.1 * u) {
      f0.face(Math.sign(dx));
      f1.face(-Math.sign(dx));
    }
    for (const f of fighters) {
      f.step(dt, e);
      f.W.update(dt, e);
      f.W.writeHomes();
    }
    if (fighting) damage.step(T, dt);

    for (let i = 0; i < 2; i++)
      if (fills[i]) fills[i].style.width = `${(fighters[i].mass / fighters[i].mass0) * 100}%`;

    if (match.state === "intro" && match.t > 1.5) {
      match.state = "fight";
      match.t = 0;
      say("");
    } else if (match.state === "fight" && (f0.dead() || f1.dead())) {
      match.state = "roundend";
      match.t = 0;
      const w = f0.dead() ? 1 : 0;
      match.wins[w]++;
      match.roundsDone++;
      if (pips[w * 2 + (match.wins[w] - 1)]) pips[w * 2 + (match.wins[w] - 1)].classList.add("won");
      say(f0.dead() ? "ko - foe takes it" : "ko - you take it");
    } else if (match.state === "roundend" && match.t > 2.4) {
      match.t = 0;
      if (match.wins[0] === 2 || match.wins[1] === 2) {
        match.state = "matchend";
        if (match.wins[0] === 2) {
          career++;
          localStorage.setItem("fighter.wins", String(career));
          paintMid();
        }
        say(match.wins[0] === 2 ? "you win the fray" : "foe wins the fray");
      } else {
        match.state = "intro";
        match.round++;
        resetRound();
        say(`round ${match.round}`);
      }
    } else if (match.state === "matchend" && match.t > 3.4) {
      match.state = "intro";
      match.round = 1;
      match.wins = [0, 0];
      match.t = 0;
      for (const p of pips) p.classList.remove("won");
      resetRound();
      say("round 1");
    }
  }

  return { step, fighters, match, say, field };
}
