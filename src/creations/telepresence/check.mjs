// check.mjs - private headless check for telepresence.html.
// Boots the ws relay, opens two pages in one room, pushes a synthetic
// silhouette + cursor through the real wire, screenshots -> shots/telepresence-*.png
// usage: node src/creations/telepresence/check.mjs   (needs serve.js on :8321)
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const { chromium } = require(
  "C:/Users/Mohammad/AppData/Local/Programs/Devin/resources/app/node_modules/playwright-core"
);
const BASE = "http://localhost:8321";
const RELAY = "http://localhost:8322";
const OUT = path.join(root, "shots");
mkdirSync(OUT, { recursive: true });
const ROOM = "check" + ((Math.random() * 1e6) | 0);

const up = async (u) => { try { return (await fetch(u)).ok; } catch { return false; } };
if (!(await up(BASE))) {
  console.log("serve.js not reachable on :8321 - start it first");
  process.exit(1);
}

let relay = null;
if (!(await up(RELAY))) {
  relay = spawn("node", [path.join(root, "tools/relay.js")], { stdio: "pipe" });
  relay.stdout.on("data", () => {});
  for (let i = 0; i < 40 && !(await up(RELAY)); i++) await new Promise(r => setTimeout(r, 250));
  if (!(await up(RELAY))) { console.log("relay failed to boot"); process.exit(1); }
}

// synthetic stride-4 point lists [x,y,shade,edge] in sampler design space
const figure = () => {
  const pts = [];
  for (let i = 0; i < 260; i++) { // head disc
    const a = Math.random() * 6.283, r = 0.11 * Math.sqrt(Math.random());
    pts.push(r * Math.cos(a), 0.28 + r * Math.sin(a), 0.5 + Math.random() * 0.4, 0);
  }
  for (let i = 0; i < 640; i++) { // torso trapezoid, wider at shoulders
    const y = -0.38 + Math.random() * 0.55;
    const w = 0.09 + 0.09 * ((y + 0.38) / 0.55);
    pts.push((Math.random() * 2 - 1) * w, y, 0.4 + Math.random() * 0.5, 0);
  }
  return pts;
};
const blob = () => {
  const pts = [];
  for (let i = 0; i < 800; i++) {
    const a = Math.random() * 6.283, r = 0.3 * Math.sqrt(Math.random());
    pts.push(r * Math.cos(a) * 1.4, r * Math.sin(a), 0.3 + Math.random() * 0.6, i % 17 === 0 ? 1 : 0);
  }
  return pts;
};

const errors = [];
const probes = {};
const browser = await chromium.launch({
  executablePath:
    "C:/Users/Mohammad/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe",
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const watch = (p, tag) => {
  p.on("console", (m) => m.type() === "error" && errors.push(`${tag}: ${m.text()}`));
  p.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
};
const A = await ctx.newPage(), B = await ctx.newPage();
watch(A, "A"); watch(B, "B");
const shot = (p, n) => p.screenshot({ path: path.join(OUT, `telepresence-${n}.png`) });
const tele = (p, js) => p.evaluate(js);

await A.goto(`${BASE}/telepresence.html?room=${ROOM}`);
await A.waitForTimeout(2500);
probes.aSolo = await tele(A, `window.__tele && ({conn: __tele.state.conn, cam: __tele.state.cam, room: __tele.state.room, id: __tele.state.id, peers: __tele.peers.size})`);
await shot(A, "solo");

await B.goto(`${BASE}/telepresence.html?room=${ROOM}`);
await B.waitForTimeout(2500);
probes.aPeers = await tele(A, `__tele.peers.size`);
probes.bPeers = await tele(B, `__tele.peers.size`);
await shot(B, "joined-b");

// A broadcasts a figure silhouette; B should morph into it
await A.evaluate((pts) => {
  const T = window.__tele, send = T.send || ((o) => T.net.send(o));
  send({ t: "sil", f: T.state.id ?? T.net.id(), a: 0.7, pts });
}, figure());
await B.evaluate((pts) => {
  const T = window.__tele, send = T.send || ((o) => T.net.send(o));
  send({ t: "sil", f: T.state.id ?? T.net.id(), a: 1.4, pts });
}, blob());
await A.waitForTimeout(3500);
probes.bSilCount = await tele(B, `[...__tele.peers.values()][0]?.sil.count ?? 0`);
probes.aSilCount = await tele(A, `[...__tele.peers.values()][0]?.sil.count ?? 0`);
await shot(B, "room-b-sees-a");
await shot(A, "room-a-sees-b");

// A's cursor presses down near B's swarm center - remote well should go live
await A.evaluate(() => {
  const T = window.__tele, send = T.send || ((o) => T.net.send(o));
  send({ t: "cur", f: T.state.id ?? T.net.id(), x: 0.5, y: 0.5, d: 1 });
});
await B.waitForTimeout(1800);
probes.bWell = await tele(B, `(() => { const w = [...__tele.peers.values()][0]?.well; return w && {x: w.x|0, y: w.y|0, down: w.down}; })()`);
await shot(B, "cursor-stir-b");
await A.evaluate(() => {
  const T = window.__tele, send = T.send || ((o) => T.net.send(o));
  send({ t: "cur", f: T.state.id ?? T.net.id(), x: 0.5, y: 0.5, d: 0 });
});

// A leaves - B's swarm should release the silhouette back to ambient
await A.close();
await B.waitForTimeout(3200);
probes.bPeersAfterLeave = await tele(B, `__tele.peers.size`);
await shot(B, "after-leave");

console.log(JSON.stringify({ room: ROOM, errors, probes }, null, 2));
await browser.close();
if (relay) relay.kill();
process.exit(errors.length ? 1 : 0);
