// comms.js - the radio. A FIFO of spoken lines, one on air at a time, with
// a gap between lines so chatter never overlaps. Drawn top-left on its own
// canvas (#comms) ABOVE the GL canvas - the deck canvas sits under the
// particles and open glass dims anything drawn there.
//
// queue entry: { who, text }   on air: { who, text, t, hold }
// a line holds chars * 0.045 + 1.8s: types out first, then reads.
const CPS = 38;     // typewriter chars per second
const GAP = 0.55;   // dead air between lines
const FADE = 0.25;
const MONO = "ui-monospace,Consolas,monospace";
const HOLE = "#0a141a"; // cut-outs (visor, lenses) paint the portrait backdrop

export function createComms(cast, onLine) {
  const cv = document.getElementById("comms");
  const g = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const q = [];
  let cur = null, gap = 0, clock = 0;
  const wave = new Float32Array(36); // smoothed bar heights

  const resize = () => {
    W = innerWidth; H = innerHeight; dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener("resize", resize);

  const comms = {};
  // lines: [who, text][]; now = cut whatever is on air and drop the queue
  comms.say = (lines, now = false) => {
    if (now) { q.length = 0; cur = null; gap = 0; }
    for (const [who, text] of lines) q.push({ who, text });
  };
  comms.clear = () => { q.length = 0; cur = null; gap = 0; };
  comms.busy = () => !!cur || q.length > 0;
  comms.cur = () => cur && { who: cur.who, text: cur.text, shown: cur.text.slice(0, typed(cur)) };
  comms.queued = () => q.length;

  const typed = (c) => Math.min(c.text.length, (c.t * CPS) | 0);

  const step = (dt) => {
    clock += dt;
    if (cur) {
      cur.t += dt;
      if (cur.t >= cur.hold) { cur = null; gap = GAP; }
    } else if ((gap -= dt) <= 0 && q.length) {
      const l = q.shift();
      cur = { ...l, t: 0, hold: l.text.length * 0.045 + 1.8 };
      onLine(l);
    }
  };

  // --- portraits: procedural heads in a round frame, one silhouette per
  // face kind, tinted by the speaker colour, scanned and flickering
  const FACES = {
    headset: (c, r) => {
      head(c, r, 0.36, 0.44);
      c.beginPath(); // hair swept back
      c.ellipse(r * 0.04, -r * 0.28, r * 0.4, r * 0.24, -0.2, Math.PI, 0); c.fill();
      c.lineWidth = r * 0.07; // headset band + mic boom
      c.beginPath(); c.arc(0, -r * 0.1, r * 0.42, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      c.beginPath(); c.moveTo(-r * 0.4, 0); c.quadraticCurveTo(-r * 0.36, r * 0.32, -r * 0.08, r * 0.3); c.stroke();
      c.fillRect(-r * 0.48, -r * 0.12, r * 0.13, r * 0.24);
    },
    cap: (c, r) => {
      head(c, r, 0.34, 0.4);
      c.beginPath(); // officer cap crown + peak
      c.moveTo(-r * 0.42, -r * 0.22); c.lineTo(-r * 0.36, -r * 0.5); c.lineTo(r * 0.38, -r * 0.54);
      c.lineTo(r * 0.44, -r * 0.22); c.closePath(); c.fill();
      c.fillRect(-r * 0.46, -r * 0.24, r * 0.98, r * 0.08);
      c.fillRect(-r * 0.12, r * 0.62, r * 0.24, r * 0.12); // collar tab
    },
    goggles: (c, r) => {
      head(c, r, 0.33, 0.42);
      for (let k = -2; k <= 2; k++) { // spiky crop
        c.beginPath(); c.moveTo(k * r * 0.14 - r * 0.08, -r * 0.3);
        c.lineTo(k * r * 0.15, -r * 0.62); c.lineTo(k * r * 0.14 + r * 0.08, -r * 0.3); c.fill();
      }
      c.save(); c.fillStyle = HOLE; // goggle lenses up on the brow
      c.beginPath(); c.arc(-r * 0.15, -r * 0.3, r * 0.11, 0, 6.283); c.arc(r * 0.15, -r * 0.3, r * 0.11, 0, 6.283); c.fill();
      c.restore();
      c.lineWidth = r * 0.04;
      c.beginPath(); c.arc(-r * 0.15, -r * 0.3, r * 0.14, 0, 6.283); c.stroke();
      c.beginPath(); c.arc(r * 0.15, -r * 0.3, r * 0.14, 0, 6.283); c.stroke();
    },
    mask: (c, r, col, t) => {
      c.beginPath(); // hood
      c.moveTo(-r * 0.7, r); c.quadraticCurveTo(-r * 0.62, -r * 0.7, 0, -r * 0.7);
      c.quadraticCurveTo(r * 0.62, -r * 0.7, r * 0.7, r); c.closePath(); c.fill();
      c.save(); c.fillStyle = HOLE; // face hollow
      c.beginPath(); c.ellipse(0, -r * 0.02, r * 0.3, r * 0.38, 0, 0, 6.283); c.fill();
      c.restore();
      c.globalAlpha *= 0.55; // respirator
      c.beginPath(); c.ellipse(0, r * 0.08, r * 0.27, r * 0.3, 0, 0, 6.283); c.fill();
      c.globalAlpha /= 0.55;
      c.fillStyle = "#ffd0c0"; // eye slits burn
      c.shadowColor = col; c.shadowBlur = 8;
      const e = 0.7 + 0.3 * Math.sin(t * 7);
      c.globalAlpha *= e;
      c.fillRect(-r * 0.2, -r * 0.12, r * 0.13, r * 0.04); c.fillRect(r * 0.07, -r * 0.12, r * 0.13, r * 0.04);
      c.globalAlpha /= e; c.shadowBlur = 0;
    },
    helmet: (c, r) => {
      c.beginPath(); c.arc(0, -r * 0.05, r * 0.46, 0, 6.283); c.fill();
      shoulders(c, r);
      c.save(); c.fillStyle = HOLE; // visor
      c.beginPath(); c.ellipse(0, r * 0.02, r * 0.34, r * 0.18, 0, 0, 6.283); c.fill();
      c.restore();
    },
  };
  function shoulders(c, r) {
    c.beginPath();
    c.moveTo(-r, r); c.quadraticCurveTo(-r * 0.8, r * 0.48, -r * 0.2, r * 0.44);
    c.lineTo(r * 0.2, r * 0.44); c.quadraticCurveTo(r * 0.8, r * 0.48, r, r); c.closePath(); c.fill();
  }
  function head(c, r, w, h) {
    shoulders(c, r);
    c.fillRect(-r * 0.12, r * 0.25, r * 0.24, r * 0.25); // neck
    c.beginPath(); c.ellipse(0, -r * 0.08, r * w, r * h, 0, 0, 6.283); c.fill();
  }

  const portrait = (x, y, r, sp, amp, a) => {
    g.save();
    g.translate(x, y);
    g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.clip();
    const bg = g.createRadialGradient(0, -r * 0.2, 0, 0, 0, r);
    bg.addColorStop(0, "rgba(30,48,58,.95)"); bg.addColorStop(1, "rgba(4,9,13,.95)");
    g.fillStyle = bg; g.fillRect(-r, -r, r * 2, r * 2);
    // a bad link tears: rare horizontal jolts, worse on the open channel
    const tear = Math.random() < (sp.face === "mask" ? 0.12 : 0.04) ? (Math.random() - 0.5) * r * 0.3 : 0;
    g.translate(tear, 0);
    g.fillStyle = sp.col; g.strokeStyle = sp.col;
    g.globalAlpha = a * (0.62 + amp * 0.38);
    FACES[sp.face](g, r, sp.col, clock);
    g.translate(-tear, 0);
    g.globalAlpha = a * 0.35; // scanlines
    g.fillStyle = "#000";
    for (let sy = -r + (clock * 18) % 3; sy < r; sy += 3) g.fillRect(-r, sy, r * 2, 1.2);
    g.globalAlpha = a * 0.5; // static
    g.fillStyle = sp.col;
    for (let k = 0; k < 14; k++) g.fillRect((Math.random() - 0.5) * r * 2, (Math.random() - 0.5) * r * 2, 1.4, 1.4);
    g.restore();
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = sp.col; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, r + 2, 0, 6.283); g.stroke();
    for (let k = 0; k < 4; k++) { // bracket ticks on the ring
      const an = k * 1.5708 + 0.785;
      g.beginPath();
      g.moveTo(x + Math.cos(an) * (r + 4), y + Math.sin(an) * (r + 4));
      g.lineTo(x + Math.cos(an) * (r + 9), y + Math.sin(an) * (r + 9)); g.stroke();
    }
    g.restore();
  };

  const wrap = (s, px, maxW) => {
    g.font = `${px}px ${MONO}`;
    const out = [];
    let line = "";
    for (const w of s.split(" ")) {
      const tryL = line ? line + " " + w : w;
      if (g.measureText(tryL).width > maxW && line) { out.push(line); line = w; }
      else line = tryL;
    }
    if (line) out.push(line);
    return out;
  };

  // pre(g, W, H) draws underneath the box - the cutscene letterbox etc
  comms.frame = (dt, pre) => {
    step(dt);
    g.clearRect(0, 0, W, H);
    if (pre) pre(g, W, H);
    if (!cur) return;
    const sp = cast[cur.who] || cast.MAGS;
    const a = Math.min(1, cur.t / FADE, (cur.hold - cur.t) / FADE);
    const n = typed(cur), talking = n < cur.text.length || cur.t < n / CPS + 0.25;
    // voice envelope: syllable-ish pulses while typing, flat once read
    const amp = talking ? 0.55 + 0.45 * Math.abs(Math.sin(clock * 11) * Math.sin(clock * 4.3 + 1)) : 0.08;

    const s = Math.max(0.8, Math.min(1.15, W / 1600));
    const r = 30 * s, px = 14 * s, x0 = 18 * s, y0 = 18 * s;
    // a third of a wide screen keeps the centre clear; narrow screens get the row
    const bx = x0 + r * 2 + 16 * s, bw = Math.min(400 * s, (W < 900 ? W - 16 : W * 0.34) - bx);
    const lines = wrap(cur.text, px, bw - 24 * s);
    const bh = 64 * s + lines.length * px * 1.35;

    g.save();
    g.globalAlpha = a;
    g.fillStyle = "rgba(4,10,14,.74)";
    g.fillRect(bx, y0, bw, bh);
    g.strokeStyle = sp.col; g.globalAlpha = a * 0.3; g.lineWidth = 1;
    g.strokeRect(bx + 0.5, y0 + 0.5, bw - 1, bh - 1);
    g.globalAlpha = a; g.lineWidth = 2; // corner brackets
    for (const [cx, cy, sx, sy] of [[bx, y0, 1, 1], [bx + bw, y0, -1, 1], [bx, y0 + bh, 1, -1], [bx + bw, y0 + bh, -1, -1]]) {
      g.beginPath(); g.moveTo(cx + sx * 10 * s, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * 10 * s); g.stroke();
    }
    g.beginPath(); g.moveTo(x0 + r * 2 + 4 * s, y0 + r); g.lineTo(bx, y0 + r); g.stroke(); // link

    // name plate
    g.fillStyle = sp.col;
    g.fillRect(bx, y0, 3 * s, 26 * s);
    g.font = `bold ${13 * s}px ${MONO}`;
    g.textBaseline = "middle";
    g.fillText(sp.name, bx + 12 * s, y0 + 14 * s);
    const nw = g.measureText(sp.name).width;
    g.font = `${9.5 * s}px ${MONO}`;
    g.globalAlpha = a * 0.6;
    g.fillText(sp.role, bx + 20 * s + nw, y0 + 14.5 * s);

    // waveform: bars driven by the envelope, each with its own wobble
    g.globalAlpha = a * 0.9;
    const wy = y0 + 38 * s, ww = bw - 24 * s, bwid = ww / wave.length;
    for (let k = 0; k < wave.length; k++) {
      const tgt = amp * (0.25 + 0.75 * Math.abs(Math.sin(clock * (7 + k * 0.37) + k * 1.9))) * (talking ? 0.6 + Math.random() * 0.4 : 1);
      wave[k] += (tgt - wave[k]) * Math.min(1, dt * 18);
      const h = Math.max(1, wave[k] * 18 * s);
      g.fillRect(bx + 12 * s + k * bwid, wy - h / 2, Math.max(1, bwid - 2), h);
    }

    // typewriter text with a block caret while it types
    g.globalAlpha = a;
    g.font = `${px}px ${MONO}`;
    g.textBaseline = "alphabetic";
    g.fillStyle = "#e4eef0";
    g.shadowColor = "#000"; g.shadowBlur = 4;
    let left = n, ty = y0 + 54 * s + px;
    for (const ln of lines) {
      const part = ln.slice(0, Math.max(0, left));
      g.fillText(part, bx + 12 * s, ty);
      if (left > 0 && left <= ln.length && n < cur.text.length) {
        g.fillStyle = sp.col;
        g.fillRect(bx + 12 * s + g.measureText(part).width + 2, ty - px * 0.8, px * 0.5, px * 0.9);
        g.fillStyle = "#e4eef0";
      }
      left -= ln.length + 1;
      ty += px * 1.35;
    }
    g.shadowBlur = 0;
    g.restore();
    portrait(x0 + r, y0 + r, r, sp, amp, a);
  };

  return comms;
}
