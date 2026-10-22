// hud.js - DOM overlay: ammo/distance/best/combo readout, power-up timers,
// flash messages, and the game-over card.
export function createHud() {
  const tl = document.getElementById("hud-tl");
  const tr = document.getElementById("hud-tr");
  const msg = document.getElementById("hud-msg");
  const over = document.getElementById("over");
  let msgT = 0, acc = "";

  const hud = {};
  hud.flash = (text, dur = 1.4) => {
    msg.textContent = text;
    msg.style.opacity = 1;
    msgT = dur;
  };

  const NAMES = { slow: "SLOW", frenzy: "FRENZY", heavy: "HEAVY" };
  const fmt = (n) => (n | 0).toLocaleString("en-US");
  const km = (m) => (m < 1000 ? `${m | 0}m` : `${(m / 1000).toFixed(1)}km`);
  const bar = (v, max, n) =>
    "\u25ae".repeat(Math.min(n, Math.ceil((v / max) * n))).padEnd(n, "\u25b1");
  hud.frame = (dt, run) => {
    if (msgT > 0 && (msgT -= dt) <= 0) msg.style.opacity = 0;
    const combo = run.multi > 1
      ? `x${run.multi} throw ${bar(run.combo % 3 || 3, 3, 3)}`
      : run.combo > 0 ? `combo ${bar(run.combo % 3 || 3, 3, 3)}` : "";
    const next =
      `<span class="big">${fmt(run.score)}</span>\n` +
      `balls ${bar(run.ammo, 25, 10)} ${run.ammo}\n` +
      (combo ? `${combo}\n` : "") +
      `<span class="dim">${km(run.dist)} &middot; best ${fmt(run.best)}</span>`;
    if (next !== acc) { acc = next; tl.innerHTML = acc; }
    const pow = Object.entries(run.pow)
      .filter(([, t]) => t > 0)
      .map(([k, t]) => `${NAMES[k]} ${t.toFixed(1)}`)
      .join("\n");
    if (tr.textContent !== pow) tr.textContent = pow;
  };

  hud.gameOver = (run, onRestart) => {
    over.style.display = "block";
    over.innerHTML =
      `<h2>SHATTERED</h2>` +
      `<div class="big">${run.score}</div>` +
      `<div>${run.dist | 0}m travelled &middot; ${run.thrown} thrown</div>` +
      `<div>best ${run.best | 0}</div>` +
      `<button id="again">try again</button>` +
      `<div class="hint">or press R</div>`;
    over.querySelector("button").onclick = onRestart;
  };
  hud.hideOver = () => (over.style.display = "none");
  return hud;
}
