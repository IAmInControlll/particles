// index.js - Fray. Two particle-built figures duel on a floor line.
// Owns the arena, particle range allocation, input adapters, and the
// match state machine. Per-fighter: verlet skeleton (puppet), armed arm
// with a blade (weapon), intent source (keys+mouse for P0, ai for P1).
import { createVerlet } from "../../lib/verlet.js";
import { createPuppet } from "./puppet.js";
import { createWeapon, createFist, WEAPONS } from "./weapon.js";
import { createAI } from "./ai.js";
import { createDamage } from "./damage.js";
import { createArena } from "./arena.js";
import { createBackdrop } from "./backdrop.js";
import { createPainter } from "./painter.js";
import { createFx } from "./fx.js";

const BODY_N = 500;
const WEAPON_N = 130;
const SHIELD_N = 80;
const PER_FIGHTER = BODY_N + WEAPON_N + SHIELD_N;
const ARENA_N = 1400;
const FX_N = 150;

export function createFighter(field, PF) {
  const u = field.unit;
  const floor = innerHeight * 0.8;
  const env = () => ({ floor, wallL: innerWidth * 0.09, wallR: innerWidth * 0.91 });

  const e = env();
  const mk = (lo, side, x, body, blade, shield) => {
    const V = createVerlet({ gravity: 2400, iterations: 7 });
    const f = createPuppet(field, V, {
      lo,
      weaponLo: lo + BODY_N,
      shieldLo: lo + BODY_N + WEAPON_N,
      hi: lo + PER_FIGHTER,
      side,
      x,
      floor,
      shield,
      colors: { body },
    });
    f.W = createWeapon(field, f, V, {
      color: blade,
      lo: lo + BODY_N,
      hi: lo + BODY_N + WEAPON_N,
      hand: "handP", // the weapon grips the proxy, not the knuckles
    });
    // the shield slice doubles as the second weapon's particles when the
    // loadout is dual wield - off-hand seg rides handS/elbS, can't throw
    f.W2 = createWeapon(field, f, V, {
      color: blade,
      lo: lo + BODY_N + WEAPON_N,
      hi: lo + PER_FIGHTER,
      hand: "handSP",
      elb: "elbS",
      forePart: "foreS",
      offhand: true,
    });
    // bare hands still punch: fists ride the same joints and take over a
    // strike slot whenever that hand holds nothing
    f.F1 = createFist(field, f, V, {});
    f.F2 = createFist(field, f, V, { hand: "handS", elb: "elbS", forePart: "foreS" });
    return f;
  };

  const f0 = mk(0, 1, e.wallL + u, PF.PAL.ink, PF.PAL.accent, "buckler");
  const f1 = mk(PER_FIGHTER, -1, e.wallR - u, [1.0, 0.62, 0.38], [1.0, 0.5, 0.3], "buckler");
  const fighters = [f0, f1];
  const ai = createAI(f1, f0, u);
  const arena = createArena(field, { lo: 2 * PER_FIGHTER, hi: 2 * PER_FIGHTER + ARENA_N });
  const backdrop = createBackdrop(); // paints the scenery under the GL layer
  const painter = createPainter(); // body silhouettes between scenery and particles
  const fx = createFx(field, { lo: arena.hi, hi: arena.hi + FX_N });
  const damage = createDamage(fighters, u, fx);

  // ---- match: loadout -> intro -> fight -> roundend -> next foe, until
  // the player dies. A ladder, not a set: score = opponents beaten. ----
  const match = { state: "loadout", round: 1, t: 0, roundsDone: 0 };
  const banner = document.getElementById("banner");
  const fills = [document.getElementById("mass0"), document.getElementById("mass1")];
  const say = (t) => banner && (banner.textContent = t);
  const fbars = [0, 1].map((i) => ({
    box: document.getElementById("fbar" + i),
    fill: document.querySelector("#fbar" + i + " .fill"),
    sfill: document.querySelector("#fbar" + i + " .sfill"),
    sx: 0, sy: 0,
  }));

  let best = +(localStorage.getItem("fighter.best") || 0);
  const midEl = document.querySelector("#hud .mid");
  const paintMid = () =>
    midEl &&
    (midEl.textContent =
      match.state === "loadout" || match.state === "gameover"
        ? `fray - best ${best}`
        : `streak ${match.round - 1} - best ${best}`);
  paintMid();

  // ---- loadout ----
  const loEl = document.getElementById("loadout");
  const loadout = { weapon: "blade", shield: "buckler" };
  try {
    const saved = JSON.parse(localStorage.getItem("fighter.loadout") || "null");
    if (saved) Object.assign(loadout, saved);
  } catch {}
  for (const b of loEl.querySelectorAll("button[data-g]")) {
    b.classList.toggle("on", b.dataset.v === loadout[b.dataset.g]);
    b.addEventListener("click", () => {
      for (const o of loEl.querySelectorAll(`button[data-g="${b.dataset.g}"]`)) o.classList.remove("on");
      b.classList.add("on");
      loadout[b.dataset.g] = b.dataset.v;
      localStorage.setItem("fighter.loadout", JSON.stringify(loadout));
      armFighters(); // live preview: the fighter re-arms behind the overlay
      paintStat();
    });
  }
  const statEl = document.getElementById("stat");
  const paintStat = () =>
    statEl && (statEl.textContent = WEAPONS[loadout.weapon].desc);
  paintStat();

  const FOE_WEAPONS = ["blade", "spear", "mace", "fists"];
  const foeArsenal = (n) => ({
    weapon: FOE_WEAPONS[n % FOE_WEAPONS.length],
    // bare-knuckle foes always fight two-fisted
    shield: FOE_WEAPONS[n % FOE_WEAPONS.length] === "fists" || n % 3 === 2 ? "dual" : "buckler",
    diff: {
      windupT: Math.max(0.3, 0.55 - n * 0.04),
      recoverT: Math.max(0.35, 0.6 - n * 0.045),
      guardChance: Math.min(0.5, 0.3 + n * 0.04),
      aggression: Math.min(1, 0.8 + n * 0.05),
      reach: Math.min(1.35, 1.15 + n * 0.03),
    },
  });

  function armFighters() {
    const boxing = loadout.weapon === "fists";
    f0.W.setSpec(loadout.weapon);
    f0.W2.setSpec(loadout.weapon);
    // fists ignores the shield pick - bare knuckle means both hands free
    f0.setShield(boxing ? "dual" : loadout.shield);
    arena.setRing(boxing);
    backdrop.setRing(boxing); // boxing gets the painted ring backdrop
    arena.dirty = true; // re-runs layoutAll, which repaints the backdrop
    // a boxing match is mutual - fists for you means fists for the foe
    const f = boxing ? { weapon: "fists", shield: "dual", diff: foeArsenal(match.round - 1).diff } : foeArsenal(match.round - 1);
    f1.W.setSpec(f.weapon);
    f1.W2.setSpec(f.weapon);
    f1.setShield(f.shield);
    ai.tune(f.diff);
  }

  function beginLadder() {
    match.round = 1;
    armFighters();
    resetRound();
    match.state = "intro";
    match.t = 0;
    say(`foe ${match.round}`);
    if (loEl) loEl.style.display = "none";
    paintMid();
  }
  document.getElementById("go").addEventListener("click", beginLadder);
  addEventListener("keydown", (ev) => {
    if (ev.code === "Enter" && (match.state === "loadout" || match.state === "gameover")) beginLadder();
  });
  armFighters(); // saved loadout applied before round 1

  function resetRound() {
    const e = env();
    for (const f of fighters) {
      f.reset(f === f0 ? e.wallL + u : e.wallR - u);
      f.W.reset();
      f.W2.reset();
      f.face(f === f0 ? 1 : -1);
    }
  }
  const allocHi = arena.hi + FX_N;
  const layoutAll = () => {
    const e = env();
    e.u = u;
    arena.layout(e);
    arena.sky(allocHi, field.N, e); // ambient tail becomes a starfield
    backdrop.paint(e); // painted scenery under the GL layer
  };
  layoutAll();
  field.onResize = layoutAll;

  // ---- human input -> f0.intent ----
  const keys = {};
  let lmb = false, rmb = false;
  addEventListener("keydown", (ev) => {
    if (ev.repeat) return;
    keys[ev.code] = 1;
    if (ev.code === "KeyW" || ev.code === "ArrowUp") f0.intent.jump = 1;
    if (ev.code === "Space") f0.intent.kick = 1;
  });
  addEventListener("keyup", (ev) => (keys[ev.code] = 0));
  addEventListener("contextmenu", (ev) => ev.preventDefault());
  addEventListener("pointerdown", (ev) => {
    // only canvas presses arm the hands - a click on the loadout/go
    // buttons must not leave a pending throwNow in the intent
    if (ev.target !== field.canvas) return;
    if (ev.button === 2) rmb = true;
    else if (ev.button === 0 || ev.pointerType === "touch") lmb = true;
  });
  addEventListener("pointerup", (ev) => {
    if (ev.button === 2) rmb = false;
    else {
      if (lmb && f0.intent.grip) f0.intent.throwNow = 1;
      lmb = false;
    }
  });
  addEventListener("pointercancel", () => (lmb = rmb = false));
  addEventListener("blur", () => (lmb = rmb = false));

  function readInput() {
    const i = f0.intent;
    i.move = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    i.crouch = keys.KeyS || keys.ArrowDown ? 1 : 0;
    i.aim.x = field.mouse.x;
    i.aim.y = field.mouse.y;
    // LMB held: weapon arm drives. RMB held: shield arm drives. Neutral:
    // both return to stance (shield stance is already a guard).
    i.aimOn = lmb ? 1 : 0;
    i.grip = lmb ? 1 : 0;
    i.sOn = rmb ? 1 : 0;
    i.sAim.x = field.mouse.x;
    i.sAim.y = field.mouse.y;
  }

  // torso-and-limb joint names only - hands and feet stay free so arms
  // can reach past the guard and feet can plant wide. A raised buckler
  // blocks hands too - no limb occupies space inside the foe's disc.
  const BODY_CONTACT = ["chest", "belly", "head", "sho", "elb", "elbS", "root", "kneeF", "kneeB"];
  const SHIELD_BLOCK_JOINTS = [...BODY_CONTACT, "hand", "handS"];

  // impact freeze: a brief full stop on a solid connect reads as weight.
  // Without a refractory gap, brawls land events faster than the window
  // and the freeze chains - the whole duel ran at half speed (and ate
  // inputs) for seconds at a time
  let hitStop = 0, hitGap = 0;
  function step(T, dt) {
    match.t += dt;
    hitGap = Math.max(0, hitGap - dt);
    if (hitStop > 0) {
      hitStop -= dt;
      return;
    }
    readInput();
    if (arena.dirty) {
      arena.dirty = false;
      layoutAll();
    }
    const e = env();
    field.exclude = [
      { l: -200, t: -200, r: e.wallL - 10, b: e.floor + 8 },
      { l: e.wallR + 10, t: -200, r: innerWidth + 200, b: e.floor + 8 },
    ];
    // dead motes drain to a point below the viewport - no exclusion band
    // under the floor or they pool there and read as a moving dotted line
    field.drift.x = innerWidth / 2;
    field.drift.y = e.floor + 260;

    const fighting = match.state === "fight";
    if (!fighting) f0.intent.move = f1.intent.move = 0;
    if (fighting) {
      if (f1.aiHold) {
        // test seam: a held foe stands at guard so player-side checks
        // run without a live AI chopping at them mid-phase
        const i = f1.intent;
        i.move = i.jump = i.kick = i.aimOn = i.sOn = 0;
      } else ai.step(dt);
    }

    // bodies never share space - fighting-game min separation. Skip
    // when one is clearly airborne so a jump can clear the foe.
    const minSep = 0.45 * u;
    const gapx = f1.x - f0.x;
    const dyR = Math.abs(f1.J.root.y - f0.J.root.y);
    if (Math.abs(gapx) < minSep && dyR < 0.7 * u) {
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
      f.F1.update();
      f.F2.update();
      if (f.dual) {
        f.W2.update(dt, e);
        f.W2.writeHomes();
      }
    }

    // bodies resist each other: opposing joint discs push apart. minSep
    // only separates the f.x targets - without this the verlet bodies
    // interpenetrate in a clinch. Every push shifts px with x so it is a
    // pure translation - moving x alone injects velocity through verlet
    // and that is where the "spazz" energy came from. Skip when one
    // fighter is clearly airborne above the other so jumps clear the foe.
    const dyRoot = f1.J.root.y - f0.J.root.y;
    const skipContact = Math.abs(dyRoot) > 0.7 * u;
    const BODY_R = 0.13 * u, BODY_R2 = BODY_R * BODY_R * 4;
    if (!skipContact) {
      for (const na of BODY_CONTACT) {
        const ja = f0.J[na];
        for (const nb of BODY_CONTACT) {
          const jb = f1.J[nb];
          const bx = jb.x - ja.x, by = jb.y - ja.y;
          const bd2 = bx * bx + by * by;
          if (bd2 < BODY_R2 && bd2 > 1e-4) {
            const bd = Math.sqrt(bd2);
            const push = (BODY_R * 2 - bd) * 0.5 / bd;
            const hx = bx * push, hy = by * push;
            ja.x -= hx; ja.y -= hy; ja.px -= hx; ja.py -= hy;
            jb.x += hx; jb.y += hy; jb.px += hx; jb.py += hy;
          }
        }
      }
      // a raised buckler is a wall, not a spring: opposing body joints
      // get projected fully out of its disc (60% to them, 40% recoil
      // into the holder's shield hand). Partial pushes lost to the arm
      // springs and let strikes slide through - bucklers going through
      // each other was the discs having no hard constraint at all
      for (const [holder, other] of [[f0, f1], [f1, f0]]) {
        const sh = holder.shield;
        if (!sh.active) continue;
        for (const nb of SHIELD_BLOCK_JOINTS) {
          const jb = other.J[nb];
          const bx = jb.x - sh.x, by = jb.y - sh.y;
          const rr = sh.r + BODY_R;
          const bd2 = bx * bx + by * by;
          if (bd2 < rr * rr && bd2 > 1e-4) {
            const bd = Math.sqrt(bd2);
            const ox = bx / bd, oy = by / bd, ov = rr - bd;
            const hx = ox * ov * 0.6, hy = oy * ov * 0.6;
            const sx = ox * ov * 0.4, sy = oy * ov * 0.4;
            jb.x += hx; jb.y += hy; jb.px += hx; jb.py += hy;
            const hs = holder.J.handS;
            hs.x -= sx; hs.y -= sy; hs.px -= sx; hs.py -= sy;
          }
        }
      }
      // shield on shield: two raised bucklers meet like rams - each
      // hand slides back half the overlap so the discs end tangent
      if (f0.shield.active && f1.shield.active) {
        const a = f0.shield, c = f1.shield;
        const bx = c.x - a.x, by = c.y - a.y;
        const rr = a.r + c.r;
        const bd2 = bx * bx + by * by;
        if (bd2 < rr * rr && bd2 > 1e-4) {
          const bd = Math.sqrt(bd2);
          const push = (rr - bd) * 0.5 / bd;
          const hx = bx * push, hy = by * push;
          const A = f0.J.handS, C = f1.J.handS;
          A.x -= hx; A.y -= hy; A.px -= hx; A.py -= hy;
          C.x += hx; C.y += hy; C.px += hx; C.py += hy;
        }
      }
      // hands moved - re-derive the discs so visuals and hit tests read
      // post-solve positions instead of one-frame-stale ones
      for (const f of fighters) {
        f.shield.x = f.J.handS.x + f.side * 0.2 * u;
        f.shield.y = f.J.handS.y;
      }
    }
    // contact pushes can re-bend a knee past straight - clamp last
    for (const f of fighters) {
      f.limJoint(f.lim.kneeF);
      f.limJoint(f.lim.kneeB);
    }
    if (fighting) {
      damage.step(T, dt);
      // a few frozen frames on a solid connect - reads as impact
      if ((damage.ev.hit || damage.ev.block || damage.ev.clash) && hitGap <= 0) {
        hitStop = 0.035;
        hitGap = 0.25;
      }
    }
    arena.frame(dt, T); // torch flames and rising embers
    painter.draw(fighters, u);
    fx.step();

    for (let i = 0; i < 2; i++) {
      const ratio = fighters[i].dead() ? 0 : Math.max(0, fighters[i].mass / fighters[i].mass0);
      if (fills[i]) fills[i].style.width = `${ratio * 100}%`;
      const hb = fbars[i];
      if (hb.box && hb.fill) {
        const h = fighters[i].J.head;
        // the head joint bobs every verlet frame - a smoothed anchor keeps
        // the bar floating instead of jittering with it
        if (!hb.sy || Math.abs(h.x - hb.sx) + Math.abs(h.y - hb.sy) > 2 * u) { hb.sx = h.x; hb.sy = h.y; }
        hb.sx += (h.x - hb.sx) * 0.12;
        hb.sy += (h.y - hb.sy) * 0.12;
        hb.box.style.transform = `translate3d(${hb.sx - 45 | 0}px, ${hb.sy - 0.32 * u | 0}px, 0)`;
        hb.box.style.opacity = ratio <= 0.02 ? 0 : 1;
        hb.fill.style.width = `${ratio * 100}%`;
        if (hb.sfill) {
          const st = fighters[i].stam;
          hb.sfill.style.width = `${st * 100}%`;
          hb.sfill.style.background = st < 0.25 ? "#d09a5f" : "";
        }
      }
    }

    if (match.state === "intro" && match.t > 1.5) {
      match.state = "fight";
      match.t = 0;
      say("");
    } else if (match.state === "fight" && (f0.dead() || f1.dead())) {
      match.state = "roundend";
      match.t = 0;
      match.roundsDone++;
      say(f0.dead() ? "you fall" : "ko - foe down");
    } else if (match.state === "roundend" && match.t > 3.0) {
      match.t = 0;
      if (f0.dead()) {
        match.state = "gameover";
        const streak = match.round - 1;
        if (streak > best) {
          best = streak;
          localStorage.setItem("fighter.best", String(best));
        }
        const title = loEl && loEl.querySelector(".title");
        if (title) title.textContent = `fallen - streak ${streak} - best ${best}`;
        if (loEl) loEl.style.display = "flex";
        say("");
      } else {
        match.state = "intro";
        match.round++;
        armFighters();
        resetRound();
        say(`foe ${match.round}`);
      }
      paintMid();
    }
  }

  return { step, fighters, match, say, field, damage, fx };
}
