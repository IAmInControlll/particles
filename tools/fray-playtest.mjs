// fray-playtest.mjs - plays whole Fray rounds with an in-page bot that
// drives the real input path (synthetic pointer + key events), then
// scores the duel: do rounds end, is it fair, do bodies collide, do
// blades pass through flesh, does the foe vary its attacks.
//
//   node tools/fray-playtest.mjs [--weapon blade] [--rounds 3] [--max 120]
//                                [--out shots/playtest-blade.json] [--shots]
//
// Exit code 1 when a gate fails. Gates print as PASS/FAIL lines.
import { createRequire } from "module";
import { mkdirSync, writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i < 0 ? d : process.argv[i + 1] ?? true;
};
const WEAPON = arg("weapon", "blade");
const ROUNDS = +arg("rounds", 3);
const MAX_ROUND = +arg("max", 120);
const OUT = arg("out", `shots/playtest-${WEAPON}.json`);
const SHOTS = process.argv.includes("--shots");
const BASE = `http://localhost:${process.env.PORT || 8321}`;
mkdirSync("shots", { recursive: true });

const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${BASE}/fighter.html`);
await page.waitForFunction(() => window.__fray);
await page.click(`button[data-g="weapon"][data-v="${WEAPON}"]`);
if (WEAPON !== "fists") await page.click('button[data-g="shield"][data-v="buckler"]');

await page.evaluate(({ MAX_ROUND }) => {
  const fr = window.__fray;
  const [me, foe] = fr.fighters;
  const u = fr.field.unit;
  const cv = fr.field.canvas;
  const R = (window.__pt = { rounds: [], cur: null, frames: 0, t0: performance.now(), stall: 0 });

  // ---- synthetic input: the same events a person produces ----
  const held = {};
  const key = (code, on) => {
    if (!!held[code] === on) return;
    held[code] = on;
    dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", { code }));
  };
  const tap = (code) => {
    dispatchEvent(new KeyboardEvent("keydown", { code }));
    dispatchEvent(new KeyboardEvent("keyup", { code }));
  };
  let lmb = false, rmb = false;
  const mouse = (x, y) => dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, pointerType: "mouse" }));
  const button = (b, on) => {
    if (b === 0 ? lmb === on : rmb === on) return;
    if (b === 0) lmb = on; else rmb = on;
    const ev = new PointerEvent(on ? "pointerdown" : "pointerup", { button: b, bubbles: true, pointerType: "mouse" });
    (on ? cv : window).dispatchEvent(ev);
  };

  // ---- bot: a competent, human-paced player ----
  // reaction delay on reading the foe's swing, strikes are arcs through
  // the foe's torso from a varied windup, guards on telegraphs, backs
  // off when winded, kicks when crowded.
  const B = { mode: "approach", t: 0, arc: 0, react: 0, kickCd: 0 };
  const reach = () => (me.W.spec.bare ? 0.75 : 0.7 + me.W.spec.len * 0.9) * u;
  function bot(dt) {
    const gap = foe.J.root.x - me.J.root.x;
    const dist = Math.abs(gap), dir = Math.sign(gap) || 1;
    B.t += dt;
    B.kickCd -= dt;
    const foeHot = foe.W.tipSpeed > 650 || foe.F1.tipSpeed > 650;
    B.react = foeHot && dist < 2.2 * u ? B.react + dt : 0;
    const guard = me.shieldOn && B.react > 0.2 && B.mode !== "strike";
    button(2, guard);
    if (B.mode === "approach") {
      key("KeyD", dir > 0 && dist > reach());
      key("KeyA", dir < 0 && dist > reach());
      mouse(me.J.sho.x + dir * 0.4 * u, me.J.sho.y - 0.1 * u);
      button(0, false);
      if (dist <= reach() * 1.05 && B.t > 0.25) {
        B.mode = me.stam < 0.25 ? "back" : "windup";
        B.t = 0;
        B.arc = (Math.random() * 3) | 0; // 0 overhead, 1 rising, 2 thrust
      }
      if (dist < 0.75 * u && B.kickCd < 0) { tap("Space"); B.kickCd = 1.5; }
    } else if (B.mode === "windup") {
      key("KeyD", false); key("KeyA", false);
      button(0, true);
      const wy = [-0.6, 0.45, -0.05][B.arc], wx = [-0.25, -0.2, -0.3][B.arc];
      mouse(me.J.sho.x + dir * wx * u, me.J.sho.y + wy * u);
      if (B.t > 0.22) { B.mode = "strike"; B.t = 0; }
    } else if (B.mode === "strike") {
      const k = Math.min(1, B.t / 0.2);
      const tx = foe.J.chest.x + dir * 0.4 * u, ty = foe.J.chest.y;
      const sy = [-0.6, 0.45, -0.05][B.arc], ey = [0.5, -0.55, 0.0][B.arc];
      mouse(tx - dir * (1 - k) * 0.5 * u, ty + (sy + (ey - sy) * k) * u);
      if (B.t > 0.28) { B.mode = Math.random() < 0.35 ? "back" : "approach"; B.t = 0; button(0, false); }
    } else if (B.mode === "back") {
      button(0, false);
      key("KeyA", dir > 0); key("KeyD", dir < 0);
      mouse(me.J.sho.x + dir * 0.3 * u, me.J.sho.y - 0.3 * u);
      if (B.t > 0.5 + (1 - me.stam)) { key("KeyA", false); key("KeyD", false); B.mode = "approach"; B.t = 0; }
    }
  }
  const release = () => { key("KeyA", false); key("KeyD", false); button(0, false); button(2, false); };

  // ---- metrics ----
  const recv = [0, 0], blk = [0, 0];
  fr.fighters.forEach((f, k) => {
    const o = f.applyHit;
    f.applyHit = (...a) => { if (R.cur) R.cur.hits[1 - k]++; return o(...a); };
    const b = f.blockStagger;
    f.blockStagger = (...a) => { if (R.cur) R.cur.blocks[k]++; return b(...a); };
  });
  const segDist = (ax, ay, bx, by, cx, cy, dx, dy) => {
    // min distance between segments ab and cd (sampled - cheap and plenty for a gate)
    let m = 1e9;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      const ex = dx - cx, ey = dy - cy, L = ex * ex + ey * ey || 1e-6;
      let s = ((px - cx) * ex + (py - cy) * ey) / L;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      m = Math.min(m, Math.hypot(cx + ex * s - px, cy + ey * s - py));
    }
    return m;
  };
  const crosses = (s, a, b) => {
    const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
    return o(s.ax, s.ay, s.bx, s.by, a.x, a.y) !== o(s.ax, s.ay, s.bx, s.by, b.x, b.y) &&
      o(a.x, a.y, b.x, b.y, s.ax, s.ay) !== o(a.x, a.y, b.x, b.y, s.bx, s.by);
  };
  const BONES = [["neck", "root"], ["root", "kneeF"], ["kneeF", "footF"], ["root", "kneeB"], ["kneeB", "footB"]];

  let last = performance.now();
  function tick() {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    R.frames++;
    const st = fr.match.state;
    if (st === "gameover" || st === "loadout") {
      release();
      if (R.rounds.length < 1e9) dispatchEvent(new KeyboardEvent("keydown", { code: "Enter" }));
    }
    if (st === "fight") {
      if (!R.cur) R.cur = { foeWeapon: foe.W.spec.desc.split(" ")[0], t: 0, frames: 0, hits: [0, 0], blocks: [0, 0], clinch: 0, overlap: 0, pass: [0, 0], explode: 0, gaps: [], aiStates: {}, attacks: {}, m0: [me.mass, foe.mass] };
      const c = R.cur;
      c.t += dt;
      c.frames++;
      bot(dt);
      c.aiStates[fr.ai.state] = (c.aiStates[fr.ai.state] || 0) + 1;
      // attack kinds the foe actually threw: the AI may name them via
      // ai.attack; otherwise a swing state counts as one generic kind
      const atk = fr.ai.attack || (fr.ai.state === "swing" ? "swing" : null);
      if (atk && fr.ai.state !== "approach") c.attacks[atk] = 1;
      if (foe.kickT > 0) c.attacks.kick = 1;
      const gap = Math.abs(foe.J.root.x - me.J.root.x) / u;
      if (c.frames % 6 === 0) c.gaps.push(+gap.toFixed(2));
      const a = me.J, b = foe.J;
      const torso = segDist(a.neck.x, a.neck.y, a.root.x, a.root.y, b.neck.x, b.neck.y, b.root.x, b.root.y) / u;
      if (torso < 0.3) c.clinch++;
      let ov = 1e9;
      for (const [p, q] of BONES) for (const [r, s] of BONES)
        ov = Math.min(ov, segDist(a[p].x, a[p].y, a[q].x, a[q].y, b[r].x, b[r].y, b[s].x, b[s].y) / u);
      if (ov < 0.08) c.overlap++;
      // blade segment crossing the foe's spine line = it went through flesh
      fr.fighters.forEach((f, k) => {
        const d = fr.fighters[1 - k];
        if (f.W.state === "held" && !f.W.spec.bare && crosses(f.W.seg, d.J.neck, d.J.root)) c.pass[k]++;
      });
      for (const f of fr.fighters) for (const n in f.J) {
        const j = f.J[n];
        if (!j.free && Math.hypot(j.x - j.px, j.y - j.py) * 60 > 4500) { c.explode++; break; }
      }
      if (c.t > MAX_ROUND) { c.result = "stall"; c.m1 = [me.mass, foe.mass]; R.rounds.push(c); R.cur = null; R.stall++; fr.match.state = "gameover"; }
    } else if (R.cur) {
      const c = R.cur;
      // the match names its verdict (ko kind or decision on time); older
      // builds only had death, so fall back to reading the bodies
      const mr = fr.match.result;
      c.result = mr ? ["win", "lose", "draw"][mr.winner < 0 ? 2 : mr.winner] + ":" + mr.how
        : me.dead() ? "lose" : foe.dead() ? "win" : "end:" + st;
      c.m1 = [me.mass, foe.mass];
      R.rounds.push(c);
      R.cur = null;
      release();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}, { MAX_ROUND });

// the bot presses Enter on the loadout and gameover screens itself
const t0 = Date.now();
let shotN = 0;
while (true) {
  await page.waitForTimeout(1000);
  const n = await page.evaluate(() => window.__pt.rounds.length);
  if (SHOTS && (Date.now() - t0) / 1000 > shotN * 6 && shotN < 12) {
    await page.screenshot({ path: `shots/playtest-${WEAPON}-${String(shotN).padStart(2, "0")}.png` });
    shotN++;
  }
  if (n >= ROUNDS) break;
  if (Date.now() - t0 > (MAX_ROUND + 15) * ROUNDS * 1000) break;
}
const R = await page.evaluate(() => {
  const r = window.__pt;
  return { rounds: r.rounds, fps: r.frames / ((performance.now() - r.t0) / 1000) };
});
await browser.close();

const rows = R.rounds.map((c) => {
  const g = c.gaps.slice().sort((a, b) => a - b);
  const mean = g.reduce((a, b) => a + b, 0) / (g.length || 1);
  const sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / (g.length || 1));
  const states = Object.keys(c.attacks).length;
  return {
    foe: c.foeWeapon, result: c.result, secs: +c.t.toFixed(1),
    hits: c.hits, blocks: c.blocks,
    dmgDealt: [c.m0[1] - c.m1[1], c.m0[0] - c.m1[0]], // [player->foe, foe->player]
    clinchPct: +((100 * c.clinch) / c.frames).toFixed(1),
    overlapPct: +((100 * c.overlap) / c.frames).toFixed(1),
    passThrough: c.pass, explodeFrames: c.explode,
    gapMean: +mean.toFixed(2), gapSd: +sd.toFixed(2), attackKinds: states,
  };
});
console.table(rows.map((r) => ({ ...r, hits: r.hits.join("/"), blocks: r.blocks.join("/"), dmgDealt: r.dmgDealt.join("/"), passThrough: r.passThrough.join("/") })));

const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
const gates = [];
const gate = (name, ok, detail) => gates.push({ name, ok, detail });
gate("rounds end (no stall, all <= 75s)", rows.length >= ROUNDS && rows.every((r) => r.result !== "stall" && r.secs <= 75), rows.map((r) => `${r.result}@${r.secs}s`).join(" "));
const pd = sum((r) => r.dmgDealt[0]), fd = sum((r) => r.dmgDealt[1]);
gate("fair damage (player/foe in 0.4..2.5)", fd > 0 && pd / fd >= 0.4 && pd / fd <= 2.5, `player dealt ${pd}, foe dealt ${fd}, ratio ${(pd / (fd || 1)).toFixed(2)}`);
const clinch = sum((r) => r.clinchPct * r.secs) / (sum((r) => r.secs) || 1);
gate("no clinch (torsos < 0.3u apart < 10% of time)", clinch < 10, `${clinch.toFixed(1)}%`);
const ovl = sum((r) => r.overlapPct * r.secs) / (sum((r) => r.secs) || 1);
gate("bodies collide (bones overlapping < 2% of time)", ovl < 2, `${ovl.toFixed(1)}%`);
const pass = sum((r) => r.passThrough[0] + r.passThrough[1]);
const frames = sum((r) => r.secs * 60);
gate("blades stop at flesh (spine crossings < 0.5% of frames)", pass / (frames || 1) < 0.005, `${pass} crossing frames of ~${frames | 0}`);
gate("no physics explosions", sum((r) => r.explodeFrames) === 0, `${sum((r) => r.explodeFrames)} frames`);
gate("foe varies (>= 3 attack kinds per round)", rows.every((r) => r.attackKinds >= 3), rows.map((r) => r.attackKinds).join(","));
gate("fps >= 50", R.fps >= 50, R.fps.toFixed(1));
gate("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
for (const g of gates) console.log(`${g.ok ? "PASS" : "FAIL"}  ${g.name}  ${g.detail}`);
writeFileSync(OUT, JSON.stringify({ weapon: WEAPON, rows, gates, fps: R.fps, errors }, null, 1));
if (gates.some((g) => !g.ok)) process.exitCode = 1;
