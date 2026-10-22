// hud.js - DOM overlay: score/combo/speed readouts, flashes, game-over board.
export function createHud() {
  const tl = document.getElementById("hud-tl");
  const tr = document.getElementById("hud-tr");
  const bl = document.getElementById("hud-bl");
  const msg = document.getElementById("hud-msg");
  const over = document.getElementById("over");
  let msgT = 0;

  const hud = {};
  hud.flash = (text, dur = 1.6) => {
    msg.textContent = text;
    msg.style.opacity = 1;
    msgT = dur;
  };

  hud.frame = (dt, run, cam) => {
    if (msgT > 0 && (msgT -= dt) <= 0) msg.style.opacity = 0;
    tl.textContent =
      `score ${run.score}` +
      (run.combo > 1 ? `  x${run.combo}` : "") +
      `\nbest  ${run.best}`;
    tr.textContent = `dist  ${(run.dist / 1000).toFixed(1)}k\nspeed ${cam.speed | 0}`;
    const pip = (n, m, ch) => ch.repeat(n) + "-".repeat(Math.max(0, m - n));
    bl.textContent =
      `lives ${pip(run.lives, 3, "o")}  hull ${pip(run.hull, 3, "|")}  ` +
      `shield ${pip(run.shield, 6, ".")}\nboost ${pip(Math.round(cam.boost * 10), 10, "=")}` +
      (run.phase === "fight" ? `\nhostiles ${run.hostiles}` : "");
  };

  const boardHtml = (board) =>
    board.map((b, i) => `${String(i + 1).padStart(2)}. ${b.name.padEnd(12, " ")} ${b.score}`).join("\n") || "no scores yet";

  hud.gameOver = (run, board, onSubmit, onRestart) => {
    over.style.display = "block";
    over.innerHTML =
      `<h2>RUN DOWN</h2>` +
      `<div>score ${run.score} &middot; best ${run.best}</div>` +
      `<div class="board" id="over-board">${boardHtml(board)}</div>` +
      `<input id="over-name" maxlength="12" placeholder="callsign" />` +
      ` <button id="over-save">save</button>` +
      `<div class="hint">enter saves - R restarts</div>`;
    const inp = over.querySelector("#over-name");
    inp.focus();
    over.querySelector("#over-save").onclick = () => {
      const name = (inp.value || "anon").slice(0, 12);
      over.querySelector("#over-board").textContent = boardHtml(onSubmit(name));
      over.querySelector("#over-save").disabled = true;
      inp.blur();
    };
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") over.querySelector("#over-save").click();
    };
    hud._restart = onRestart;
  };

  hud.hideOver = () => (over.style.display = "none");
  return hud;
}
