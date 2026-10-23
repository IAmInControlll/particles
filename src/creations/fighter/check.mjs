// check.mjs - private headless check for Fray. Screenshots -> shots/fighter-*.
// Covers: loadout, arena boot, floor constraint, movement, LMB whip hit,
// shield block (mass preserved + stagger), RMB shield drive, throw, kick,
// ladder progression (foe kill -> next foe, player death -> gameover).
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { WEAPONS } from "./weapon.js";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);

const BASE = `http://localhost:${process.env.PORT || 8321}`;
mkdirSync("shots", { recursive: true });
const fail = (msg) => {
  console.log("FAIL:", msg);
  process.exitCode = 1;
};

if (!(WEAPONS.spear.len >= 2 * WEAPONS.blade.len))
  fail(`spear ${WEAPONS.spear.len} not >= 2x blade ${WEAPONS.blade.len}`);

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
const state = () => fray(() => window.__fray.match.state);
const waitFor = async (pred, tries = 20, gap = 300) => {
  for (let i = 0; i < tries; i++) {
    if (await pred()) return true;
    await page.waitForTimeout(gap);
  }
  return false;
};

// ---- loadout ----
await page.goto(`${BASE}/fighter.html`);
await page.waitForTimeout(1400);
await shot("loadout");
const boot = await fray(() => ({
  state: window.__fray.match.state,
  mass: window.__fray.fighters.map((f) => f.mass),
  mass0: window.__fray.fighters[0].mass0,
}));
if (boot.state !== "loadout") fail(`boot state ${boot.state}`);
if (boot.mass[0] !== boot.mass0 || boot.mass[1] !== boot.mass0)
  fail(`boot mass ${boot.mass} vs ${boot.mass0}`);

await page.click('button[data-g="weapon"][data-v="blade"]');
await page.click('button[data-g="shield"][data-v="buckler"]');
await page.click("#go");
await waitFor(async () => (await state()) === "fight", 12, 250);

// ---- ladder: kill the foe while the player is still whole ----
await page.evaluate(() => { window.__fray.fighters[1].mass = 5; });
let next = null;
for (let i = 0; i < 20; i++) {
  const s = await fray(() => ({
    state: window.__fray.match.state,
    round: window.__fray.match.round,
    foeSpec: window.__fray.fighters[1].W.spec.shape,
    done: window.__fray.match.roundsDone,
  }));
  if (s.done >= 1 && s.round >= 2) { next = s; break; }
  if (s.state === "intro" && s.round >= 2) { await shot("next-foe"); }
  await page.waitForTimeout(300);
}
if (!next) fail("no next foe: " + JSON.stringify(await fray(() => window.__fray.match)));
else if (next.foeSpec !== "spear") fail(`foe 2 spec ${next.foeSpec}`);

// ---- player death -> gameover -> rearm ----
await waitFor(async () => (await state()) === "fight", 12, 250);
await page.evaluate(() => { window.__fray.fighters[0].mass = 5; });
await waitFor(async () => (await state()) === "gameover", 16, 300);
await shot("gameover");
const over = await state();
if (over !== "gameover") fail(`expected gameover, got ${over}`);
await page.keyboard.press("Enter");
await waitFor(async () => (await state()) === "fight", 12, 250);
const rearm = await state();
if (rearm !== "fight") fail(`rearm state ${rearm}`);
await shot("arena");
// the scenery is particles: #bg may hold one vertical gradient, no shapes
const scenery = await fray(() => {
  const cv = document.getElementById("bg");
  const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  let rowSpread = 0;
  for (let y = 0; y < cv.height; y++) {
    let mn = 1e9, mx = -1;
    for (let x = 0; x < cv.width; x++) {
      const k = (y * cv.width + x) * 4, v = d[k] + 2 * d[k + 1] + d[k + 2];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    rowSpread = Math.max(rowSpread, mx - mn);
  }
  const f = window.__fray.field;
  let solid = 0;
  for (let p = 0; p < f.N; p++) solid += f.solid[p] > 0.5;
  return { rowSpread, solid };
});
if (scenery.rowSpread > 4) fail(`#bg canvas paints shapes: a row varies by ${scenery.rowSpread}`);
if (scenery.solid < 1000) fail(`scenery is not solid particles: ${scenery.solid} solid`);
// every phase below measures the player or drives the foe directly -
// a live AI walks in and chops at the measurements (walk reads 9px
// into a clinch, duck reads shallow through a stagger, a held-down
// foot trips the floor poll). Hold it at the far wall; phases that
// need it closer reset it explicitly.
await fray(() => {
  const b = window.__fray.fighters[1];
  b.aiHold = 1;
  b.reset(innerWidth - 240);
});

// ---- floor constraint: joints never go below the floor line ----
await page.keyboard.down("d");
await page.waitForTimeout(400);
await page.keyboard.press("KeyW");
await page.waitForTimeout(900);
await page.keyboard.up("d");
// a hit mid-jump is legitimate airtime; what must never happen is a
// player stuck dangling - poll for the eventual landing
const gnd = await waitFor(() => fray(() => window.__fray.fighters[0].grounded), 12, 250);
if (!gnd) fail("player never re-grounded after jump");
await page.waitForTimeout(400);
const floorSample = () => fray(() => {
  const fl = innerHeight * 0.8;
  let worst = -1e9, who = "";
  for (const f of window.__fray.fighters)
    for (const [n, j] of Object.entries(f.J))
      if (j.y > worst) { worst = j.y; who = n; }
  return { worst: Math.round(worst), floor: Math.round(fl), who };
});
// the body-contact solver runs after the floor clamp, so one frame can
// legitimately shove a foot a few px deep - next frame's clamp clears
// it. Only a penetration that persists is a real violation; poll for
// a clean sample before calling it a failure
let floorCheck = await floorSample();
for (let i = 0; i < 10 && floorCheck.worst > floorCheck.floor + 1; i++) {
  await page.waitForTimeout(120);
  floorCheck = await floorSample();
}
if (floorCheck.worst > floorCheck.floor + 1)
  fail(`joint below floor: ${floorCheck.who} at ${floorCheck.worst} vs ${floorCheck.floor}`);

// ---- movement: walk, duck ----
// park the foe first - walking into it runs f.x into minSep's shove and
// the measure reads pushback, not locomotion
await fray(() => {
  const [a, b] = window.__fray.fighters;
  if (Math.abs(b.J.root.x - a.J.root.x) < 400) b.reset(innerWidth - 240);
});
const x0 = await fray(() => window.__fray.fighters[0].x);
await page.keyboard.down("d");
await page.waitForTimeout(600);
await page.keyboard.up("d");
const x1 = await fray(() => window.__fray.fighters[0].x);
if (x1 - x0 < 15) fail(`walk moved only ${x1 - x0}px`);

// the walk's mid-stride hip dip reads below the crouch depth - sampling
// root.y the frame the key releases measures gait, not stance
await page.waitForTimeout(450);
const yIdle = await fray(() => {
  const a = window.__fray.fighters[0];
  // a hit during the walk phase leaves staggerT running - stagK weakens
  // the pose pulls and the crouch reads shallow for reasons the duck
  // phase isn't measuring
  a.staggerT = 0;
  a.faintT = 0;
  return a.J.root.y;
});
await page.keyboard.down("s");
await page.waitForTimeout(500);
const duckDbg = await fray(() => {
  const a = window.__fray.fighters[0];
  return {
    rootY: a.J.root.y, cr: a.intent.crouch, stag: a.staggerT,
    faint: a.faintT, grounded: a.grounded,
    kneeFi: a.integrity.kneeF, kneeBi: a.integrity.kneeB,
    sevF: a.part.shinF.severed, sevB: a.part.shinB.severed,
    footFy: a.J.footF.y, footBy: a.J.footB.y,
  };
});
const yDuck = duckDbg.rootY;
await page.keyboard.up("s");
if (yDuck - yIdle < 10) fail(`duck dropped only ${yDuck - yIdle}px ${JSON.stringify(duckDbg)}`);

// f.x is the body's locomotion driver - stepping beside the foe is a
// deterministic approach that a retreating AI can't spoil. Refilling
// the foe's tank keeps a winded or floored one from spoiling it anyway.
// stance targets no longer drag a body (a released stance point waits
// for real locomotion now) — proximity setup teleports the skeleton
// instead. Same move-everything translation f.reset's spawn does.
const stepIn = (gap = 200) =>
  page.evaluate((g) => {
    const [a, b] = window.__fray.fighters;
    b.stam = 1;
    b.faintT = 0;
    const want = Math.sign(b.J.root.x - a.J.root.x || 1) > 0
      ? b.J.root.x - g : b.J.root.x + g;
    const dx = want - a.J.root.x;
    for (const jn of Object.keys(a.J)) { a.J[jn].x += dx; a.J[jn].px += dx; }
    a.x += dx;
    a.feet.F.px += dx; a.feet.B.px += dx;
    a.feet.F.tx += dx; a.feet.B.tx += dx;
  }, gap);

// the live foe maims the player between measurements - a severed leg
// drops the body to a heap that can't whip, kick, or walk, and a dry
// tank floors it. Phases that measure a mechanic (whip reach, clash,
// kick) need the actor whole, so revive before measuring: the question
// is "does the mechanic work", not "did the player survive getting in".
const reviveA = () =>
  page.evaluate(() => {
    const a = window.__fray.fighters[0];
    const maimed =
      a.part.fore.severed || a.part.upper.severed ||
      a.part.shinF.severed || a.part.shinB.severed ||
      a.part.thighF.severed || a.part.thighB.severed ||
      a.W.state !== "held";
    if (maimed) {
      const st = a.stam;
      a.reset(340);
      a.W.reset();
      a.stam = st;
    }
    a.stam = 1;
    a.faintT = 0;
    a.staggerT = 0;
    for (const k of Object.keys(a.integrity)) a.integrity[k] = Math.max(a.integrity[k], 6);
  });

// ---- LMB whip hit: shield dropped so the sweep tests raw damage ----
// runs before the block/RMB phases so the player's arm is guaranteed
// whole - a severed forearm drops the blade and whips can never land
await page.evaluate(() => {
  const b = window.__fray.fighters[1];
  b.shieldOn = false;
  // a held blade parries whips now - bare hands so this phase measures
  // raw body damage, not the clash mechanic the next phase exercises
  b.W.setSpec("fists");
});
const hits0 = await fray(() => window.__fray.damage.total.hits);
for (let i = 0; i < 8; i++) {
  // adjudication only runs in fight state - an intro/roundend window
  // between phases produces silent sweeps
  await waitFor(async () => (await state()) === "fight", 14, 300);
  const foe = await fray(() => {
    const [a, b] = window.__fray.fighters;
    const m = window.__fray.match;
    // the brawl is live - the foe can die mid-sweep (slots skip a dead
    // target) or lop the player's arm off. Death also flips the match to
    // roundend and stops adjudication - pin it back to fight.
    if (m.state !== "fight") { m.state = "fight"; m.t = 0; }
    if (b.dead() || b.J.root.y < -100) b.reset(innerWidth - 240);
    b.shieldOn = false;
    // a held blade parries every chest sweep into a clash - bare hands
    // can't lock steel, so fists-spec leaves the foe defenseless. The
    // clash phase restores its blade.
    b.W.setSpec("fists");
    if (a.part.fore.severed || a.W.state !== "held") {
      const st = a.stam;
      a.reset(340);
      a.W.reset();
      a.stam = st;
    }
    return {
      x: b.J.chest.x,
      y: b.J.chest.y,
      hits: window.__fray.damage.total.hits,
    };
  });
  if (foe.hits > hits0) break;
  await reviveA();
  await stepIn(160);
  await page.waitForTimeout(200);
  await page.mouse.move(foe.x - 260, foe.y - 50);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(foe.x - 30, foe.y + (i % 2 ? 120 : 40), { steps: 3 });
  await page.mouse.move(foe.x + 90, foe.y - 50, { steps: 3 });
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(400);
}
await shot("hit");
const hit = await fray(() => window.__fray.damage.total.hits);
if (!(hit > hits0)) fail("whip dealt no damage");
await page.evaluate(() => { window.__fray.fighters[1].shieldOn = true; });

// ---- stamina + clash: a long whip bleeds the tank, and a held blade
// in the swing's path deflects it. Foe buckler drops so its blade is
// what answers the sweep ----
await waitFor(async () => (await state()) === "fight", 14, 300);
await fray(() => {
  const [a, b] = window.__fray.fighters;
  b.shieldOn = false;
  a.stam = b.stam = 1;
  // a faint carried over from earlier phases leaves the arm dead, and a
  // pending release throws the blade on the first hot sweep
  a.faintT = b.faintT = 0;
  a.intent.throwNow = 0;
  a.W.reset();
  b.reset(a.J.root.x + 260); // adjacent - the sweep must reach its blade
  b.W.setSpec("blade"); // the hit phase left it on fists
  b.W.reset(); // re-arm the foe - the clash phase needs a held blade
});
const cl0 = await fray(() => window.__fray.damage.total.clashes);
await reviveA();
await stepIn(210);
await page.mouse.down({ button: "left" });
const whipT0 = Date.now();
let stamMin = 1;
while (Date.now() - whipT0 < 2400) {
  const s = await fray(() => {
    const fr = window.__fray;
    const [a, b] = fr.fighters;
    // keep both fighters armed and standing: a severed forearm drops the
    // blade, a dead foe ends the round, and either stalls the drain. The
    // player's tank survives an arm re-grow so the drain stays continuous.
    // Death also flips the match to roundend - pin state back or damage
    // adjudication stops entirely for the rest of the window.
    {
      if (fr.match.state !== "fight") { fr.match.state = "fight"; fr.match.t = 0; }
      if (b.dead() || b.J.root.y < -100) {
        b.reset(a.J.root.x + 260);
        b.W.reset();
        b.setShield("none");
      }
      // limbs pinned just short of severing; head and neck held whole,
      // since a chewed-up head is a knockout and ends the phase
      for (const n of ["chest", "belly", "sho", "shoS", "elb", "elbS", "kneeF", "kneeB", "root"]) b.integrity[n] = 4;
      b.integrity.head = b.integrity.neck = 18;
      b.mass = b.mass0;
      // this phase measures clash - the foe's blade must be in hand
      if (b.W.state !== "held") b.W.reset();
      if (b.part.fore.severed) {
        b.reset(a.J.root.x + 260);
        b.W.reset();
        b.setShield("none");
      }
      // a floored foe can't parry - stand it back up as a clash target
      if (b.faintT > 0) { b.faintT = 0; b.stam = 1; }
      // hold the target in place - a free AI walks out of blade range
      // and the sweep meets air; stagger keeps it alive but parked
      b.staggerT = 0.5;
      if (a.part.fore.severed) {
        const st = a.stam;
        a.reset(340);
        a.W.reset();
        a.stam = st;
      } else if (a.W.state !== "held") a.W.reset(); // re-grip a thrown blade
    }
    const seg = b.W.seg;
    return { mx: (seg.ax + seg.bx) / 2, my: (seg.ay + seg.by) / 2, tx: seg.bx, ty: seg.by, stam: a.stam,
             shx: a.J.sho.x, shy: a.J.sho.y };
  });
  stamMin = Math.min(stamMin, s.stam);
  // sweep through the held blade and its tip - staying hot is what drains
  await page.mouse.move(s.mx - 170, s.my - 70, { steps: 2 });
  await page.mouse.move(s.tx, s.ty, { steps: 2 });
  // a full slash arc back across the player's own shoulder: the foe-side
  // points all sit beyond arm reach so the hand only wobbles at max
  // extension and tip speed never reaches the drain band without this
  await page.mouse.move(s.shx - 40, s.shy + 120, { steps: 2 });
  await page.mouse.move(s.shx + 300, s.shy - 100, { steps: 2 });
}
await page.mouse.up({ button: "left" });
const whip = {
  stamMin: +stamMin.toFixed(3),
  clashes: await fray(() => window.__fray.damage.total.clashes),
};
if (!(whip.stamMin < 0.85)) fail(`2.4s whip never dipped stam below 0.85 (min ${whip.stamMin})`);
if (!(whip.clashes > cl0)) fail("sweep through held blade never clashed");
await shot("clash");

// ---- shield block: whip the blade through the foe's buckler ----
// the whip above can kill the current foe - wait out any transition and
// re-normalize whoever is standing across from us
await waitFor(async () => (await state()) === "fight", 14, 300);
await fray(() => {
  const foe = window.__fray.fighters[1];
  // the whip phase keeps killing the foe - revive before arming the
  // buckler or shield.active stays off and the phase reads a corpse
  if (foe.dead()) foe.reset(innerWidth - 240);
  foe.mass = foe.mass0;
  foe.faintT = 0;
  foe.setShield("buckler");
});
await page.waitForTimeout(300);
const sh0 = await fray(() => {
  const foe = window.__fray.fighters[1];
  if (foe.dead()) { foe.reset(innerWidth - 240); foe.setShield("buckler"); }
  return { active: foe.shield.active, blocks: window.__fray.damage.total.blocks };
});
if (!sh0.active) fail("foe shield inactive");
for (let i = 0; i < 8; i++) {
  await waitFor(async () => (await state()) === "fight", 14, 300);
  const sh = await fray(() => {
    const [a, b] = window.__fray.fighters;
    // passive target: a staggered foe's buckler stays live but it can't
    // swing back, wander off, or collapse - the loop measures the block.
    // A dead foe skips every adjudication branch, so keep it alive too.
    if (b.dead() || b.J.root.y < -100) {
      b.reset(innerWidth - 240);
      b.setShield("buckler");
    }
    b.stam = 1;
    b.faintT = 0;
    b.staggerT = 0.8;
    a.faintT = 0; // a mid-loop faint deadens the whip arm for ~2s
    // the live foe can sever the player's forearm between phases - a
    // dead arm carries no blade to the disc and the phase goes silent
    if (a.part.fore.severed || a.W.state !== "held") {
      const st = a.stam;
      a.reset(340);
      a.W.reset();
      a.stam = st;
    }
    return { x: b.shield.x, y: b.shield.y, blocks: window.__fray.damage.total.blocks };
  });
  if (sh.blocks > sh0.blocks) break;
  await stepIn(200);
  await page.waitForTimeout(250);
  const sh2 = await fray(() => ({ x: window.__fray.fighters[1].shield.x, y: window.__fray.fighters[1].shield.y }));
  // hold LMB with the cursor just past the disc, wiggling to stay hot -
  // the seg spans hilt->tip through the disc every hot frame
  await page.mouse.move(sh2.x - 200, sh2.y);
  await page.mouse.down({ button: "left" });
  for (let k = 0; k < 6; k++)
    await page.mouse.move(sh2.x + 60 + (k % 2) * 60, sh2.y + (k % 2 ? -50 : 50), { steps: 2 });
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(250);
}
await shot("block");
const blk = await fray(() => ({
  blocks: window.__fray.damage.total.blocks,
  stag: +window.__fray.fighters[1].staggerT.toFixed(2),
}));
if (!(blk.blocks > sh0.blocks)) fail(`no shield block registered: ${JSON.stringify(blk)}`);

// ---- RMB drives the shield hand toward the cursor ----
// back away first: a foe at melee range staggers the player mid-hold and
// the weakened pulls make the measurement flaky
await page.evaluate(() => {
  const [a, b] = window.__fray.fighters;
  // deterministic baseline: a sprawl, slide, or chewed shoulder left over
  // from earlier phases makes the hand chase a moving skeleton - reset
  // unconditionally so the phase measures the arm, not the aftermath
  a.reset(340);
  a.stam = 1;
  a.faintT = 0;
  a.staggerT = 0;
  a.x = 320;
  // hold the foe parked across the arena - a live foe closes the gap
  // inside the hold window and its strikes corrupt the measurement
  b.aiHold = 1;
  b.x = innerWidth - 240;
  b.J.root.x = innerWidth - 240;
  if (window.__fray.match.state !== "fight") { window.__fray.match.state = "fight"; window.__fray.match.t = 0; }
});
await page.waitForTimeout(500);
// aim high above the player's own chest so the envelope-bound hand has a
// deterministic direction to chase, wherever the body happens to stand
const sBefore = await fray(() => ({
  hx: window.__fray.fighters[0].J.handS.x,
  hy: window.__fray.fighters[0].J.handS.y,
  cx: window.__fray.fighters[0].J.chest.x,
  cy: window.__fray.fighters[0].J.chest.y,
}));
// 180px up-forward sits inside the reach envelope, so a healthy arm can
// actually chase it - a target beyond reach only measures the envelope
const tgt = { x: sBefore.cx + 60, y: sBefore.cy - 180 };
await page.mouse.move(tgt.x, tgt.y);
await page.mouse.down({ button: "right" });
await page.waitForTimeout(800);
await shot("rmb-shield");
const sAfter = await fray(() => ({ x: window.__fray.fighters[0].J.handS.x, y: window.__fray.fighters[0].J.handS.y }));
await page.mouse.up({ button: "right" });
const dBefore = Math.hypot(tgt.x - sBefore.hx, tgt.y - sBefore.hy);
const dAfter = Math.hypot(tgt.x - sAfter.x, tgt.y - sAfter.y);
if (!(dAfter < dBefore - 40)) fail(`RMB didn't drive shield hand: ${dBefore | 0} -> ${dAfter | 0}`);

// ---- kick staggers at close range ----
let kicked = 0;
for (let i = 0; i < 8; i++) {
  if (kicked > 0) break;
  await fray(() => {
    const fr = window.__fray;
    const b = fr.fighters[1];
    if (fr.match.state !== "fight") { fr.match.state = "fight"; fr.match.t = 0; }
    if (b.dead() || b.J.root.y < -100) b.reset(innerWidth - 240);
    b.setShield("none"); // measure raw foot contact, not a shield fizzle
    b.faintT = 0;
    b.stam = 1;
    if (fr.fighters[0].part.shinF.severed || fr.fighters[0].part.shinB.severed) fr.fighters[0].reset(340);
  });
  // kick reach is ~0.62u past the root - 170px only ever connected
  // because the live foe walked into it; a held foe keeps the gap
  await reviveA();
  await stepIn(110);
  await page.waitForTimeout(320); // let stag/lmb effects clear, foot reach is real
  await page.keyboard.press("Space");
  await page.waitForTimeout(320);
  kicked = await fray(() => window.__fray.fighters[1].staggerT);
}
if (!(kicked > 0)) fail("kick did not stagger");
await shot("kick");

// ---- throw: whip until the tip is hot, then flag the release ----
await reviveA(); // the kick phase can leave the arm maimed - a dead arm
// reads as tipV ~150 and the throw never primes
const foe2 = await fray(() => ({
  x: Math.round(window.__fray.fighters[1].J.root.x),
  y: Math.round(window.__fray.fighters[1].J.chest.y),
}));
await page.mouse.move(foe2.x - 300, foe2.y + 60);
await page.mouse.down({ button: "left" });
let maxTv = 0, wState = "held";
for (let i = 0; i < 30; i++) {
  // hard wide swings keep the smoothed tip velocity above throwV
  await page.mouse.move(foe2.x + (i % 2 ? 320 : -300), foe2.y + (i % 2 ? -160 : 60), { steps: 3 });
  const r = await fray(() => {
    // keep the release flag up for the whole whip - throwNow is consumed
    // the frame it lands, so gating it on a stale tipSpeed sample can
    // miss the hot frame entirely
    window.__fray.fighters[0].intent.throwNow = 1;
    return {
      tv: window.__fray.fighters[0].W.tipSpeed,
      st: window.__fray.fighters[0].W.state,
    };
  });
  maxTv = Math.max(maxTv, r.tv);
  if (r.st !== "held") break;
}
await page.waitForTimeout(700);
wState = await fray(() => window.__fray.fighters[0].W.state);
await page.mouse.up({ button: "left" });
await shot("throw");
if (wState === "held") fail(`release during whip did not throw (max tipV ${maxTv | 0})`);

// ---- fists: with the blade on the ground the same hand still punches ----
const fHits0 = await fray(() => window.__fray.damage.total.hits);
for (let i = 0; i < 10; i++) {
  const foe = await fray(() => {
    const b = window.__fray.fighters[1];
    // the hit phase can kill the foe - revive it or fists have no target
    if (b.dead() || b.J.root.y < -100) b.reset(innerWidth - 240);
    // passive target: shield down, tank full, held mid-stagger so it
    // can't swing back or kite - the loop measures fist contact only
    b.shieldOn = false;
    b.stam = 1;
    b.faintT = 0;
    b.staggerT = 0.8;
    return {
      x: b.J.chest.x,
      y: b.J.chest.y,
      hits: window.__fray.damage.total.hits,
      armGone: window.__fray.fighters[0].part.fore.severed,
    };
  });
  if (foe.hits > fHits0 || foe.armGone) break;
  await stepIn(80); // fist reach ends ~75px past the shoulder - 140px gaps only ever hit the foe's outstretched arm
  await page.waitForTimeout(250);
  await page.mouse.move(foe.x - 120, foe.y - 60);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(foe.x + 20, foe.y - 30, { steps: 3 });
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(300);
}
const fists = await fray(() => ({
  hits: window.__fray.damage.total.hits,
  armGone: window.__fray.fighters[0].part.fore.severed,
  w: window.__fray.fighters[0].W.state,
}));
if (!(fists.hits > fHits0 || fists.armGone))
  fail(`disarmed fist dealt no damage: ${JSON.stringify(fists)}`);

// ---- dual wield: off-hand seg exists, shield surface stays off ----
await fray(() => {
  const a = window.__fray.fighters[0];
  a.setShield("dual");
  a.W2.setSpec("blade");
});
await page.waitForTimeout(400);
await shot("dual");
const dual = await fray(() => {
  const a = window.__fray.fighters[0];
  const L = Math.hypot(a.W2.seg.bx - a.W2.seg.ax, a.W2.seg.by - a.W2.seg.ay);
  return {
    dual: a.dual, shieldOn: a.shieldOn, shActive: a.shield.active,
    w2: a.W2.state, w2len: Math.round(L), want: Math.round(a.W2.len),
  };
});
if (!(dual.dual && !dual.shieldOn && !dual.shActive))
  fail(`dual mode left shield state on: ${JSON.stringify(dual)}`);
if (!(Math.abs(dual.w2len - dual.want) < 6))
  fail(`off-hand weapon seg ${dual.w2len} vs spec ${dual.want}`);

// ---- faint: an empty tank collapses the fighter mid-whip ----
// runs last - the downed body can eat foe hits without weakening any
// earlier assertion, and the recovery wait just reads timers back
await waitFor(async () => (await state()) === "fight", 14, 300);
await fray(() => {
  const [a, b] = window.__fray.fighters;
  a.x = 340;
  b.x = innerWidth - 240;
  // an arm severed in the live brawl deadens every strike slot - the
  // whip can never drain the tank and the faint never comes. Same for
  // a dead foe: adjudication skips dead defenders entirely.
  if (b.dead() || b.J.root.y < -100) b.reset(innerWidth - 240);
  if (a.part.fore.severed) {
    a.reset(340);
    a.W.reset();
  }
  a.faintT = 0;
  a.stam = 0.02;
});
const sho0 = await fray(() => ({ x: window.__fray.fighters[0].J.sho.x, y: window.__fray.fighters[0].J.sho.y }));
await page.mouse.move(sho0.x, sho0.y);
await page.mouse.down({ button: "left" });
const faintT0 = Date.now();
let faintSeen = false;
while (Date.now() - faintT0 < 3000 && !faintSeen) {
  // sweep across the player's own shoulder - absolute points land past
  // arm reach wherever the body stands, the arm pins cold, and regen
  // beats the drain (the tank climbs instead of hitting zero)
  const sho = await fray(() => ({ x: window.__fray.fighters[0].J.sho.x, y: window.__fray.fighters[0].J.sho.y }));
  await page.mouse.move(sho.x - 60, sho.y - 80, { steps: 2 });
  await page.mouse.move(sho.x + 160, sho.y + 90, { steps: 2 });
  faintSeen = await fray(() => {
    const fr = window.__fray;
    const [a2, b2] = fr.fighters;
    // a mid-loop death flips the match out of fight state and damage
    // stops running - pin it back and stand both fighters up so the
    // drain keeps running for the full window
    if (fr.match.state !== "fight") { fr.match.state = "fight"; fr.match.t = 0; }
    if (b2.dead()) b2.reset(innerWidth - 240);
    if (a2.part.fore.severed) {
      const st = a2.stam;
      a2.reset(340);
      a2.W.reset();
      a2.stam = st;
    }
    return a2.faintT > 0;
  });
}
await page.mouse.up({ button: "left" });
if (!faintSeen) {
  const diag = await fray(() => {
    const a2 = window.__fray.fighters[0];
    return {
      stam: +a2.stam.toFixed(2), faintT: a2.faintT, match: window.__fray.match.state,
      w: a2.W.state, fore: a2.part.fore.severed, tipF: a2.F1.tipSpeed | 0,
      dead: a2.dead(),
    };
  });
  fail(`whip on an empty tank never fainted ${JSON.stringify(diag)}`);
}
await shot("faint");
// intent.move is dead input while the body is down - assert on the
// move velocity, not f.x: the collapse itself slides the root and the
// touchdown sync drags f.x with it, which is body physics, not walking
const vxMax = await (async () => {
  let m = 0;
  await page.keyboard.down("d");
  for (let i = 0; i < 9; i++) {
    await page.waitForTimeout(50);
    m = Math.max(m, Math.abs(await fray(() => window.__fray.fighters[0].vx)));
  }
  await page.keyboard.up("d");
  return m;
})();
if (vxMax > 20) fail(`fainted fighter built walk speed ${vxMax | 0}`);
// stays down until the tank refills past 0.35
const stood = await waitFor(() => fray(() => {
  const f = window.__fray.fighters[0];
  return f.faintT <= 0 && f.stam >= 0.35;
}), 24, 250);
if (!stood) fail("fighter never stood back up from faint");

console.log(JSON.stringify({ errors, boot, scenery, floorCheck, blk, dRmb: [dBefore | 0, dAfter | 0], hit, kicked, wState, fists, dual, whip, faintSeen, stood, next, over, rearm }, null, 1));
await browser.close();
// fail() sets exitCode; an explicit exit(0) would mask FAIL lines
process.exit(errors.length || process.exitCode ? 1 : 0);
