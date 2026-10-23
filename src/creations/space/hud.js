// hud.js - DOM overlay: pick screen, game-over board, and the two message
// channels. hud.flash = status line (hud-msg is display:none - the dash COM
// panel in deck.js reads textContent + the opacity flag). hud.pop = score
// popups in the feed under the reticle. Story lines go to comms.js.
export function createHud() {
  const msg = document.getElementById("hud-msg");
  const over = document.getElementById("over");
  let msgT = 0;

  const hud = {};
  // killfeed: recent event popups the deck draws under the reticle
  // (color per event kind - matches the pickup tag palette)
  hud.feed = [];
  hud.flash = (text, dur = 1.6) => {
    msg.textContent = text;
    msg.style.opacity = 1;
    msgT = dur;
  };
  hud.pop = (text, col = "") => {
    hud.feed.push({ text, col, t: 0 });
    if (hud.feed.length > 8) hud.feed.splice(0, hud.feed.length - 8);
  };

  // cutscene: the DOM key strip and home link would sit on the letterbox
  const chrome = ["hud-keys", "hub"].map((id) => document.getElementById(id));
  hud.cine = (on) => { for (const el of chrome) el.style.visibility = on ? "hidden" : ""; };

  hud.frame = (dt) => {
    if (msgT > 0 && (msgT -= dt) <= 0) msg.style.opacity = 0;
    for (const e of hud.feed) e.t += dt;
  };

  const boardHtml = (board) =>
    board.map((b, i) => `${String(i + 1).padStart(2)}. ${b.name.padEnd(12, " ")} ${b.score}`).join("\n") || "no scores yet";

  // one-shot campaign board: same centered panel as game over, but
  // self-dismissing - the run keeps flying behind it
  hud.campaignDone = (run, of, secs = 6.5) => {
    over.dataset.mode = "campaign";
    over.style.display = "block";
    over.innerHTML =
      `<h2>THE BLACKBIRD IS GONE</h2>` +
      `<div class="souls">${run.souls} OF ${of} SOULS SAVED</div>` +
      `<div>capt. hale stayed with his ship</div>` +
      `<div class="board">kills ${run.kills}  &middot;  score ${run.score}</div>` +
      `<div class="hint">the drift is yours - fly for score</div>`;
    setTimeout(() => {
      if (over.dataset.mode === "campaign") over.style.display = "none";
    }, secs * 1000);
  };

  hud.gameOver = (run, board, onSubmit, onRestart) => {
    over.dataset.mode = "over";
    over.style.display = "block";
    over.innerHTML =
      `<h2>RUN DOWN</h2>` +
      `<div>score ${run.score} &middot; best ${run.best}${run.storyDone ? "" : ` &middot; souls saved ${run.souls}`}</div>` +
      `<div class="board" id="over-board">${boardHtml(board)}</div>` +
      `<input id="over-name" maxlength="12" placeholder="callsign" />` +
      ` <button id="over-save">save</button>` +
      `<div class="hint">enter saves - R restarts - 1/2/3 switch ship</div>`;
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

  const pick = document.getElementById("pick");
  hud.showPick = (ships, cur, view, onPick, onView, onLaunch) => {
    pick.style.display = "block";
    pick.innerHTML =
      `<h2>VOIDRUNNER</h2>` +
      `<div class="brief">three hours ago the carrier BLACKBIRD lost her reactor in the drift.<br>` +
      `forty souls aboard, batteries failing, and the gnaw are circling.<br>` +
      `thread the old relay rings to carry her signal - dock and get them out.</div>` +
      `<div>pick your ship - the cockpit is the preview</div>` +
      ships.map((s, i) =>
        `<div class="ship${i === cur ? " cur" : ""}" data-i="${i}">[${i + 1}] ${s.name} <span>${s.tag}</span></div>`
      ).join("") +
      `<div class="views">view ` +
        `<span class="vopt${view === "cockpit" ? " cur" : ""}" data-v="cockpit">cockpit</span> / ` +
        `<span class="vopt${view === "chase" ? " cur" : ""}" data-v="chase">chase</span>` +
      `</div>` +
      `<button id="pick-go">launch</button>` +
      `<div class="hint">drops - gold BST: refills boost - green HUL: patches hull - blue SHD: +2 shield motes</div>` +
      `<div class="hint">click or 1/2/3 to try a hull - V flips the camera - enter launches</div>`;
    pick.querySelectorAll(".ship").forEach((el) => {
      el.onclick = () => onPick(+el.dataset.i);
    });
    pick.querySelectorAll(".vopt").forEach((el) => {
      el.onclick = () => onView(el.dataset.v);
    });
    pick.querySelector("#pick-go").onclick = onLaunch;
  };
  hud.hidePick = () => (pick.style.display = "none");
  return hud;
}
