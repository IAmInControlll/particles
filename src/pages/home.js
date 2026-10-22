// Home hub: the swarm forms the site title, menu cards route to creations.
import { PF } from "../engine/index.js";

(function () {
  const PAGES = [
    { name: "Playground", desc: "every engine constant on a slider", href: "playground.html" },
    { name: "Koi Pond", desc: "feed the fish, hold to pull them", href: "pond.html" },
    { name: "Voidrunner", desc: "rescue the blackbird's crew - a 3-leg campaign in particles", href: "space.html" },
    { name: "Fray", desc: "particle stick-duel - body mass is health", href: "fighter.html" },
    { name: "Shatter", desc: "throw balls through a glass corridor", href: "shatter.html" },
    { name: "Mirror", desc: "your webcam silhouette as a scene", href: "mirror.html" },
    { name: "Telepresence", desc: "two browsers, each swarm is the other person", soon: true },
  ];

  const menu = document.getElementById("menu");
  for (let i = 0; i < PAGES.length; i++) {
    const p = PAGES[i];
    const a = document.createElement(p.soon ? "div" : "a");
    a.className = "card" + (p.soon ? " soon" : "");
    a.style.animationDelay = `${0.15 + i * 0.07}s`;
    if (p.href) a.href = p.href;
    a.innerHTML =
      `<span class="tag">${p.soon ? "soon" : "open"}</span>` +
      `<div class="name">${p.name}</div>` +
      `<div class="desc">${p.desc}</div>`;
    menu.appendChild(a);
  }

  // keyboard nav: arrows move a highlight, enter/1-6 open
  const cards = [...menu.children];
  let cur = -1;
  const mark = (i) => {
    if (cur >= 0) cards[cur].classList.remove("hi");
    cur = i;
    if (cur >= 0) cards[cur].classList.add("hi");
  };
  addEventListener("keydown", (e) => {
    const live = cards.map((c, i) => ({ c, i })).filter(({ c }) => c.tagName === "A");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = live.findIndex(({ i }) => i === cur);
      const next = live[(at + (e.key === "ArrowDown" ? 1 : -1) + live.length) % live.length];
      mark(next.i);
    } else if (e.key === "Enter" && cur >= 0 && cards[cur].href) {
      location.href = cards[cur].href;
    } else if (e.key >= "1" && e.key <= "6") {
      const { c } = live[+e.key - 1] || {};
      if (c) location.href = c.href;
    }
  });

  PF.reseed(7);
  Object.assign(PF.CFG, {
    bigChance: 0,
    twinkle: 0.1,
    colVar: 0.03,
    flowAmp: 0.004,
    driftPull: 0.0016,
  });
  const field = PF.createField({ N: PF.isMobile() ? 2500 : 6000 });
  if (!field.ok) return;
  window.__pf = field;
  const dir = PF.createDirector(field, { dur: 2.4 });

  // the page border: a dense stippled band around the frame edge, same
  // treatment as the word - cursor-reactive, springs pull it straight back.
  // Sized before the word rasterizes: pick() maps index ranges to vertical
  // bands of the glyph, so the word must distribute over the non-tail
  // range or its bottom quarter is claimed by border indices.
  const EDGE = Math.min(
    (field.N * 0.22) | 0,
    Math.ceil(((innerWidth + innerHeight - 64) * 2) / 3.2)
  );
  const EDGE_LO = field.N - EDGE;
  // fireworks get their own slice between word and border: parked
  // offscreen while idle, so bursts leave no litter
  const FX_N = 240, FX_LO = EDGE_LO - FX_N;
  for (let p = EDGE_LO; p < field.N; p++) {
    field.homed[p] = 1;
    field.noFlock[p] = 1;
    field.size[p] = 1.15;
    field.leader[p] = 0;
  }

  // rasterize a word into scene-fn targets, one particle per lit pixel
  function textScene(text) {
    const r = PF.textPoints(text, {
      font: "700 220px system-ui, 'Segoe UI', sans-serif",
      h: 340,
      maxPoints: FX_LO,
    });
    if (!r) return null;
    const { pts, ext } = r;
    const fn = (i, t, T, out, col) => {
      if (i >= FX_LO) return; // the fx and border slices own the tail
      const p = PF.pick(pts, i, FX_LO);
      out[0] = p[0];
      out[1] = p[1];
      // a luminance wave rolls slowly across the word - alive, still readable
      out[2] = Math.sin(p[0] * 0.004 - T * 0.7) * 0.55;
      const c = i % 23 === 0 ? PF.PAL.accent : i % 3 ? PF.PAL.ink : PF.PAL.mist;
      col[0] = c[0];
      col[1] = c[1];
      col[2] = c[2];
    };
    fn.ext = ext;
    return fn;
  }

  const fn = textScene("PARTICLES");
  const credit = document.getElementById("credit");
  let placeCredit = () => {};
  let exTop = innerHeight * 0.55;
  if (fn) {
    // the word lives in the band between the border inset and the menu's
    // exclusion edge - sized and centered from the measured rect so the
    // letters can never be clamped by it
    const wordBox = () => {
      const bandTop = 46;
      const bandBot = Math.max(bandTop + 90, exTop - 20);
      const band = bandBot - bandTop;
      const s =
        Math.min(innerWidth / fn.ext[0], band / fn.ext[1]) *
        0.62 *
        (1 + Math.sin(field.T * 0.55) * 0.014); // the word breathes
      return { cx: innerWidth / 2, cy: bandTop + band * 0.55, s };
    };
    dir.register("title", fn, { boxFn: wordBox });
    dir.play("title");
    // sit the credit under the word's right end, tracking the same box
    placeCredit = () => {
      const { cx, cy, s } = wordBox();
      credit.style.right = `${innerWidth - (cx + (fn.ext[0] * s) / 2) + 4}px`;
      credit.style.top = `${cy + (fn.ext[1] * s) / 2 - 14}px`;
    };
  } else {
    placeCredit = () => {
      credit.style.right = "12%";
      credit.style.top = "42%";
    };
  }

  // particles perimeter-slide around the menu
  let ex = [];
  const measure = () => {
    const r = menu.getBoundingClientRect();
    ex = [{ l: r.left - 16, t: r.top - 16, r: r.right + 16, b: r.bottom + 16 }];
    exTop = r.top - 16;
    placeCredit();
  };
  measure();
  addEventListener("resize", measure);

  // an occasional drifter breaks loose and streaks across - a meteor
  const mist = PF.PAL.mist, hot = PF.PAL.hot, home = field.home, hcol = field.hcol;
  let meteor = -1, meteorT = 0, nextMeteor = 5 + PF.rnd() * 7;

  // fireworks slice: homed but invisible (size 0), parked along the
  // bottom edge so a rocket launch is a short spring, not a cross-
  // screen transit. The frame loop reparks idle ones each tick.
  for (let p = FX_LO; p < EDGE_LO; p++) {
    field.homed[p] = 1;
    field.noFlock[p] = 1;
    field.leader[p] = 0;
    field.size[p] = 0;
  }

  // a rocket launches from the bottom edge and streaks up - spring lag
  // draws the tail - then ~110 sparks burst outward at different speeds,
  // droop with gravity, and park back offscreen
  const FW_HUES = [PF.PAL.accent, PF.PAL.hot, PF.PAL.sky, [1, 0.85, 0.5]];
  const bursts = [], fwUsed = new Set();
  let nextFw = 3.5 + PF.rnd() * 5;
  const spawnFw = (tx, ty) => {
    const want = 120, parts = [];
    for (let p = FX_LO; p < EDGE_LO && parts.length < want; p++) {
      if (fwUsed.has(p)) continue;
      fwUsed.add(p);
      parts.push(p);
    }
    if (parts.length < 30) {
      for (const p of parts) fwUsed.delete(p);
      return;
    }
    const cx = tx ?? innerWidth * (0.15 + PF.rnd() * 0.7);
    const cy = ty ?? innerHeight * (0.14 + PF.rnd() * 0.3);
    for (const p of parts) {
      field.homed[p] = 1;
      field.noFlock[p] = 1;
      field.snap[p] = 0;
      field.size[p] = 1.6;
    }
    bursts.push({
      t: 0,
      upDur: 0.55 + PF.rnd() * 0.3,
      dur: 1.6 + PF.rnd() * 0.6,
      x0: cx + (PF.rnd() - 0.5) * 160,
      y0: innerHeight - 34,
      cx,
      cy,
      maxR: 160 + PF.rnd() * 160,
      hue: FW_HUES[(PF.rnd() * FW_HUES.length) | 0],
      parts,
      rings: parts.map((p) => ({
        a: field.h1(p) * Math.PI * 2,
        sp: 0.55 + field.h3(p) * 0.6, // per-spark streak speed
        fill: field.h2(p) < 0.8 ? 1 : Math.sqrt(field.h2(p)),
        life: 0.65 + field.h3((p + 7) % field.N) * 0.35, // per-spark lifetime
      })),
    });
  };

  // a quick tap launches a firework that pops at the point - drags,
  // holds, and taps on cards/links don't count
  let pd = null;
  addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pd = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      ui: !!e.target.closest("a,button"),
    };
  });
  addEventListener("pointerup", (e) => {
    const d = pd;
    pd = null;
    if (!d || d.ui) return;
    const held = (performance.now() - d.t) / 1000;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (held > 0.28 || moved > 12) return; // that was a hold or a drag
    const cy = Math.max(70, Math.min(innerHeight * 0.78, e.clientY));
    const cx = Math.max(70, Math.min(innerWidth - 70, e.clientX));
    spawnFw(cx, cy);
  });

  field.frame = (T, dt) => {
    field.exclude = ex;
    dir.homes();
    // the border: word-density dots along a rect inset, perpendicular
    // jitter stipples it like the letterforms; same palette, and the
    // luminance wave rolls around the frame by arc length
    const m = 14, rw = innerWidth - m * 2, rh = innerHeight - m * 2;
    const per = 2 * (rw + rh);
    for (let k = 0; k < EDGE; k++) {
      const p = EDGE_LO + k, o = p * 3;
      let d = (k / EDGE) * per;
      let x, y, nx = 0, ny = 0;
      if (d < rw) { x = m + d; y = m; ny = 1; }
      else if ((d -= rw) < rh) { x = m + rw; y = m + d; nx = -1; }
      else if ((d -= rh) < rw) { x = m + rw - d; y = m + rh; ny = -1; }
      else { d -= rw; x = m; y = m + rh - d; nx = 1; }
      const j = (field.h1(k) - 0.5) * 7;
      home[o] = x + nx * j;
      home[o + 1] = y + ny * j;
      home[o + 2] = Math.sin(d * 0.004 - T * 0.7) * 0.55; // same wave as the word
      const c = k % 23 === 0 ? PF.PAL.accent : k % 3 ? PF.PAL.ink : mist;
      hcol[o] = c[0];
      hcol[o + 1] = c[1];
      hcol[o + 2] = c[2];
    }
    // the drift anchor wanders a slow lissajous so the dust field migrates
    field.drift.x = innerWidth * (0.5 + 0.42 * Math.sin(T * 0.05));
    field.drift.y = innerHeight * (0.5 + 0.36 * Math.sin(T * 0.073 + 1.7));
    if (meteor < 0) {
      if (T > nextMeteor) {
        for (let tries = 0; tries < 8; tries++) {
          const cand = FX_LO + ((PF.rnd() * FX_N) | 0); // fx slice only
          if (fwUsed.has(cand)) continue;
          meteor = cand;
          break;
        }
        if (meteor < 0) {
          nextMeteor = T + 3;
        } else {
          meteorT = T;
          const a = PF.rnd() < 0.5 ? -0.25 : Math.PI + 0.25; // shallow diagonal either way
          const sp = 26 + PF.rnd() * 22;
          field.homed[meteor] = 0; // cut loose - velocity carries it
          field.vel[meteor * 3] = Math.cos(a) * sp;
          field.vel[meteor * 3 + 1] = Math.sin(a) * sp + 8;
          field.size[meteor] = 1.7;
          hcol[meteor * 3] = mist[0] * 1.6;
          hcol[meteor * 3 + 1] = mist[1] * 1.6;
          hcol[meteor * 3 + 2] = mist[2] * 1.6;
        }
      }
    } else if (T - meteorT > 1.1) {
      field.homed[meteor] = 1; // repark loop below takes it back
      meteor = -1;
      nextMeteor = T + 6 + PF.rnd() * 9;
    }

    // fireworks: rocket climbs from the bottom edge, sparks streak out
    // at per-spark speeds, droop and fade, then park back offscreen
    if (T > nextFw) {
      spawnFw();
      nextFw = T + (PF.rnd() < 0.3 ? 0.6 + PF.rnd() * 0.9 : 5 + PF.rnd() * 9);
    }
    for (let b = bursts.length - 1; b >= 0; b--) {
      const fw = bursts[b];
      fw.t += dt;
      if (fw.t < fw.upDur) {
        // launch: every spark rides the rocket - the spring lag is the tail
        const e = 1 - Math.pow(1 - fw.t / fw.upDur, 1.6);
        const tx = fw.x0 + (fw.cx - fw.x0) * e;
        const ty = fw.y0 + (fw.cy - fw.y0) * e;
        for (const p of fw.parts) {
          const o = p * 3;
          home[o] = tx + (field.h2(p) - 0.5) * 6;
          home[o + 1] = ty + field.h3(p) * 8;
          home[o + 2] = -0.2;
          hcol[o] = hot[0] * 1.3;
          hcol[o + 1] = hot[1] * 1.3;
          hcol[o + 2] = hot[2] * 1.3;
        }
        continue;
      }
      const t2 = fw.t - fw.upDur;
      const r = fw.maxR * (1 - Math.exp(-t2 * 6));
      const fall = t2 * t2 * 52;
      // brief over-bright flash on pop, then fade; big sparks shrink as they cool
      const flash = 1 + Math.max(0, 1 - t2 * 7) * 1.8;
      const spark = 1.9 - Math.min(0.8, t2 * 0.5);
      let alive = 0;
      for (let k = 0; k < fw.parts.length; k++) {
        const p = fw.parts[k], o = p * 3, rg = fw.rings[k];
        const q = t2 / (fw.dur * rg.life);
        if (q >= 1) {
          fwUsed.delete(p); // the repark loop below takes it home
          continue;
        }
        alive++;
        const rr = r * rg.sp * rg.fill;
        home[o] = fw.cx + Math.cos(rg.a) * rr;
        home[o + 1] = fw.cy + Math.sin(rg.a) * rr + fall * rg.sp;
        home[o + 2] = -0.2;
        field.size[p] = spark;
        const fl = Math.max(0, 1 - q) * flash * (0.7 + 0.3 * Math.sin(p * 12.9 + fw.t * 24)); // shimmer
        hcol[o] = fw.hue[0] * fl;
        hcol[o + 1] = fw.hue[1] * fl;
        hcol[o + 2] = fw.hue[2] * fl;
      }
      if (!alive) bursts.splice(b, 1);
    }
    // idle fx sparks wait invisible just below the launch edge
    for (let p = FX_LO; p < EDGE_LO; p++) {
      if (fwUsed.has(p) || p === meteor) continue;
      const o = p * 3;
      home[o] = innerWidth * field.h1(p);
      home[o + 1] = innerHeight + 60;
      home[o + 2] = 0;
      field.size[p] = 0;
    }
  };
  field.start();
})();
