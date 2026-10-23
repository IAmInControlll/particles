// deck.js - opaque hull backing on a 2D canvas overlay, driven by FRAMES.
// The near layer fills the whole canvas and punches `panes` as open glass,
// so space can only show through glass - never between hull plates. Far
// members (deep window rims, connector struts) draw on a second offscreen
// composited at 0.4x sway for parallax. The canvas sits BELOW the GL layer
// (see createField zIndex) so the particle structure rides on top; the
// flip side is that world particles would draw over the hull, so deck.cull
// parks any world home that lands outside the panes or under a far member.
// Instruments draw live on top of the backing from {run, cam, world}.
import { FRAMES } from "./frames.js";
import { drawAim } from "./aim.js";

const ZSPLIT = 2.4; // member mean z below this paints on the far sway layer

export function createDeck(cam, field) {
  const cv = document.getElementById("deck");
  const g = cv.getContext("2d");
  const far = document.createElement("canvas"), near = document.createElement("canvas");
  const fg = far.getContext("2d"), ng = near.getContext("2d");
  const msgEl = document.getElementById("hud-msg");
  const TAU = 6.2832;
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, frame = null, INST = [], BOX = [];
  let swayX = 0, swayY = 0, deckT = 0, hitT = 0;
  // "cockpit": opaque hull backing + pane cutouts + cull mask. "chase":
  // no backing at all (third-person, no canopy) - instruments repack as
  // a floating strip and world particles are never culled.
  let view = "cockpit";
  // mask state: refreshed each frame, consumed by cull()
  let mCos = 1, mSin = 0, mTx = 0, mTy = 0, fCos = 1, fSin = 0, fTx = 0, fTy = 0;
  let PANES = [], BLKN = [], BLKF = [], HB = [];

  const GRN = "#8fd8b0", AMB = "#e8b060", BLU = "#7ea8e8", RED = "#e85444",
    DIM = "#3d5a54",
    EL = "rgba(150,185,195,.16)", ED = "rgba(0,0,0,.5)",
    MONO = "ui-monospace,Consolas,monospace";

  // unit cockpit space -> px (y up)
  const X = (u) => cx + u * cx;
  const Y = (u) => cy - u * cy;
  const UW = (u) => u * cx;
  const UH = (u) => u * cy;
  const P = (pts) => pts.map(([x, y]) => [X(x), Y(y)]);

  const trace = (c, p, close = true) => {
    c.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]);
    if (close) c.closePath();
  };
  const poly = (c, p, close = true) => {
    c.beginPath();
    trace(c, p, close);
  };
  // bevel: edges above/left of the centroid catch light, the rest fall dark
  const bevel = (c, p) => {
    let mx = 0, my = 0;
    for (const q of p) { mx += q[0]; my += q[1]; }
    mx /= p.length; my /= p.length;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const ex = (a[0] + b[0]) / 2, ey = (a[1] + b[1]) / 2;
      const lit = ey < my - 0.5 || (Math.abs(ey - my) <= 0.5 && ex < mx);
      c.strokeStyle = lit ? EL : ED;
      c.lineWidth = lit ? 1.2 : 1.6;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
  };
  const plate = (c, p, fill) => { poly(c, p); c.fillStyle = fill; c.fill(); bevel(c, p); };
  const vgrad = (c, y0, y1, c0, c1) => {
    const gr = c.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    return gr;
  };
  const rrect = (c, x, y, w, h, r) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  const screw = (c, x, y) => {
    c.beginPath(); c.arc(X(x), Y(y), 1.4, 0, TAU);
    c.fillStyle = "rgba(190,215,220,.10)"; c.fill();
  };
  // tapered hull beam between two unit points, lit across its width: the
  // upward-facing edge catches light, a specular line runs just inside it,
  // so pillars read as steel against black space
  const beam = (c, s) => {
    const ax = X(s.p0[0]), ay = Y(s.p0[1]), bx = X(s.p1[0]), by = Y(s.p1[1]);
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let px = -dy / L, py = dx / L;
    if (py > 0) { px = -px; py = -py; } // +p = the side facing up
    const q0 = s.w0 * cy, q1 = s.w1 * cy, qm = (q0 + q1) / 2;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const gr = c.createLinearGradient(mx + px * qm, my + py * qm, mx - px * qm, my - py * qm);
    gr.addColorStop(0, "#2a3740");
    gr.addColorStop(0.18, "#18222a");
    gr.addColorStop(0.7, "#0c1217");
    gr.addColorStop(1, "#05080b");
    plate(c, [
      [ax + px * q0, ay + py * q0], [bx + px * q1, by + py * q1],
      [bx - px * q1, by - py * q1], [ax - px * q0, ay - py * q0],
    ], gr);
    c.strokeStyle = "rgba(170,200,210,.16)"; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(ax + px * q0 * 0.72, ay + py * q0 * 0.72);
    c.lineTo(bx + px * q1 * 0.72, by + py * q1 * 0.72);
    c.stroke();
  };
  // strip between two edges; loop = closed ring filled even-odd
  const bandFill = (c, b) => {
    c.beginPath();
    if (b.loop) {
      trace(c, P(b.e0)); trace(c, P(b.e1));
      c.fillStyle = "#0a0f14";
      c.fill("evenodd");
    } else {
      trace(c, P(b.e0).concat(P(b.e1).reverse()));
      c.fillStyle = "#0a0f14";
      c.fill();
    }
    c.strokeStyle = EL; c.lineWidth = 1.2;
    poly(c, P(b.e1), !!b.loop); c.stroke();
  };
  const seg = (c, x, y, w, h, lit, col) => {
    c.fillStyle = lit ? col : "rgba(140,170,175,.07)";
    if (lit) { c.shadowColor = col; c.shadowBlur = 6; }
    c.fillRect(x, y, w, h);
    c.shadowBlur = 0;
  };
  const text = (c, s, x, y, px, col, align = "left", blur = 0) => {
    c.font = `600 ${px}px ${MONO}`;
    c.textAlign = align; c.textBaseline = "middle";
    c.fillStyle = col;
    if (blur) { c.shadowColor = col; c.shadowBlur = blur; }
    c.fillText(s, x, y);
    c.shadowBlur = 0;
  };

  // --- live instruments ---
  const drawSpd = (c, st, hw, hh) => {
    const speed = Math.round(st.cam.speed);
    text(c, String(speed), hw * 0.35, -hh * 0.42, hh * 0.52, GRN, "right", 8);
    const sn = 12, bw = hw * 0.2, sh = hh * 1.18 / sn;
    for (let t = 0; t < sn; t++) {
      const lit = t / (sn - 1) <= st.cam.speedK;
      const col = st.cam.boosting || t / (sn - 1) > 0.75 ? AMB : GRN;
      seg(c, hw * 0.62, hh * 0.42 - t * sh - sh * 0.62, bw, sh * 0.62, lit, col);
    }
    text(c, "BST", -hw * 0.88, hh * 0.72, hh * 0.2, DIM);
    const bn = 10, bw2 = hw * 1.36 / bn;
    for (let t = 0; t < bn; t++)
      seg(c, -hw * 0.48 + t * bw2, hh * 0.6, bw2 * 0.68, hh * 0.24, t / bn < st.cam.boost, AMB);
  };
  const drawNav = (c, st, hw, hh) => {
    text(c, "SCR", -hw * 0.88, -hh * 0.5, hh * 0.24, DIM);
    text(c, String(st.run.score), -hw * 0.88, -hh * 0.08, hh * 0.44, GRN, "left", 7);
    if (st.run.combo > 1)
      text(c, `x${st.run.combo}`, -hw * 0.88, hh * 0.42, hh * 0.3, AMB, "left", 6);
    else if (st.run.wreckDist > 0)
      text(c, `WRCK ${(st.run.wreckDist / 1000).toFixed(1)}k`,
        -hw * 0.88, hh * 0.42, hh * 0.28, AMB, "left", 5);
    text(c, "BEST", hw * 0.12, -hh * 0.5, hh * 0.24, DIM);
    text(c, String(st.run.best), hw * 0.12, -hh * 0.08, hh * 0.36, "#5f8a78");
    text(c, "DIST", hw * 0.12, hh * 0.42, hh * 0.24, DIM);
    text(c, `${(st.run.dist / 1000).toFixed(1)}k`, hw * 0.52, hh * 0.42, hh * 0.32, BLU);
  };
  const drawWrn = (c, st, hw, hh) => {
    const pulse = 0.65 + 0.35 * Math.sin(st.deckT * 16);
    const lamp = (y, s, on, col = RED) => {
      c.beginPath(); c.arc(-hw * 0.82, y, hh * 0.13, 0, TAU);
      c.fillStyle = on ? col : "rgba(140,170,175,.08)";
      if (on) { c.shadowColor = col; c.shadowBlur = 10; c.globalAlpha = pulse; }
      c.fill();
      c.shadowBlur = 0; c.globalAlpha = st.blink;
      text(c, s, -hw * 0.62, y + 1, hh * 0.3, on ? col : DIM);
    };
    lamp(-hh * 0.52, `HOSTILES ${st.run.phase === "fight" ? st.run.hostiles : ""}`,
      st.run.phase === "fight" && st.run.hostiles > 0);
    lamp(0, "HULL", st.run.hull <= 1);
    lamp(hh * 0.52, "SHLD", st.run.phase === "fight" && st.run.shield === 0);
  };
  const drawMsg = (c, st, hw, hh) => {
    const s = +msgEl.style.opacity > 0 ? msgEl.textContent : "";
    if (s) text(c, s, 0, 0, Math.min(hh * 0.5, hw * 0.2), GRN, "center", 6);
    else text(c, "SYS NOMINAL", 0, 0, hh * 0.4, DIM, "center");
  };
  const drawRdr = (c, st, hw, hh) => {
    const R = hh * 0.94;
    c.strokeStyle = "rgba(120,160,160,.35)"; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
    c.strokeStyle = "rgba(120,160,160,.16)";
    for (const rr of [0.33, 0.66]) { c.beginPath(); c.arc(0, 0, R * rr, 0, TAU); c.stroke(); }
    for (let t = 0; t < 4; t++) {
      const a = t * Math.PI / 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9);
      c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      c.strokeStyle = "rgba(120,160,160,.4)"; c.stroke();
    }
    // sweep arm with a fading conic trail
    const a0 = -Math.PI / 2 + (st.deckT * 2.2) % TAU;
    const cg = c.createConicGradient(a0 - 1.15, 0, 0);
    cg.addColorStop(0, "rgba(143,216,176,0)");
    cg.addColorStop(0.16, "rgba(143,216,176,.22)");
    cg.addColorStop(0.175, "rgba(143,216,176,0)");
    cg.addColorStop(1, "rgba(143,216,176,0)");
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = cg; c.fill();
    c.strokeStyle = "rgba(143,216,176,.6)"; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); c.stroke();
    // own ship mark
    poly(c, [[0, -R * 0.09], [R * 0.055, R * 0.07], [-R * 0.055, R * 0.07]]);
    c.fillStyle = GRN; c.fill();
    // contacts on the cam right/fwd plane, same projection as the old blips
    const RANGE = 1800;
    const blip = (wx, wy, wz, col) => {
      const dx = wx - cam.x, dy = wy - cam.y, dz = wz - cam.z;
      const vx = cam.right[0] * dx + cam.right[1] * dy + cam.right[2] * dz;
      const vz = cam.fwd[0] * dx + cam.fwd[1] * dy + cam.fwd[2] * dz;
      let nx = vx / RANGE, nz = vz / RANGE;
      const rr = Math.hypot(nx, nz);
      if (rr > 1) { nx /= rr; nz /= rr; }
      const dim = (1.25 - Math.min(1, rr)) * 0.8 + 0.45;
      c.globalAlpha = dim * st.blink;
      c.fillStyle = col;
      c.beginPath(); c.arc(nx * R, -nz * R, 2.2, 0, TAU); c.fill();
      c.globalAlpha = st.blink;
    };
    if (st.world) {
      let n = 0;
      for (const sh of st.world.ent.ships) {
        if (n >= 12) break;
        if (sh.alive) { blip(sh.x, sh.y, sh.z, RED); n++; }
      }
      n = 0;
      for (const pk of st.world.ent.picks) {
        if (n >= 8) break;
        if (!pk.taken) { blip(pk.x, pk.y, pk.z, GRN); n++; }
      }
      const gt = st.run.next;
      if (gt) for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        blip(gt.x + Math.cos(a) * 30, gt.y, gt.z + Math.sin(a) * 30, BLU);
      }
      const lm = st.world.course.landmark;
      if (lm && st.run.wreckDist > 0) blip(lm.x, lm.y, lm.z, AMB); // live objective only
    }
  };
  // PWR: the active-powerups tracker. Row labels share the pickup tag
  // colors so a gold BST ring in the world reads as this bar on the dash.
  // Four label|gauge rows under the housing's own caps label (which sits
  // in the top ~22% of the box), so nothing overprints it.
  const drawSys = (c, st, hw, hh) => {
    const gx = -hw * 0.3, gw = hw * 1.18, gh = hh * 0.17, fs = Math.max(8, hh * 0.2);
    const row = (k) => -hh * 0.36 + k * hh * 0.4;
    const bar = (y, f, col) => {
      c.fillStyle = "rgba(140,170,175,.07)";
      c.fillRect(gx, y - gh / 2, gw, gh);
      c.fillStyle = col;
      c.shadowColor = col; c.shadowBlur = 6;
      c.fillRect(gx, y - gh / 2, gw * Math.max(0, Math.min(1, f)), gh);
      c.shadowBlur = 0;
    };
    text(c, "BST", -hw * 0.88, row(0), fs, AMB);
    bar(row(0), st.cam.boost, AMB);
    text(c, "HUL", -hw * 0.88, row(1), fs, GRN);
    bar(row(1), st.run.hull / (st.run.hullMax || 3), st.run.hull <= 1 ? RED : GRN);
    text(c, "SHD", -hw * 0.88, row(2), fs, BLU);
    const sw = gw / 6;
    for (let t = 0; t < 6; t++)
      seg(c, gx + t * sw, row(2) - gh / 2, sw * 0.78, gh, t < st.run.shield, BLU);
    text(c, "LIV", -hw * 0.88, row(3), fs, DIM);
    for (let t = 0; t < 5; t++) {
      c.beginPath(); c.arc(gx + hh * 0.07 + t * hh * 0.16, row(3), hh * 0.065, 0, TAU);
      c.fillStyle = t < st.run.lives ? GRN : "rgba(140,170,175,.07)";
      c.fill();
    }
    // post-hit invulnerability is an active buff too - count it down
    if (st.run.invuln > 0)
      text(c, `INV ${st.run.invuln.toFixed(1)}`, gx + gw, row(3), fs, RED, "right");
  };
  const DRAW = { spd: drawSpd, nav: drawNav, wrn: drawWrn, com: drawMsg, rdr: drawRdr, sys: drawSys };

  // recessed housing: bezel ring, dark glass, inner top shadow, caps label
  const house = (c, b) => {
    const inst = b.inst;
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.rot);
    if (inst.r) {
      const r = b.hh;
      c.beginPath(); c.arc(0, 0, r + 5, 0, TAU);
      c.fillStyle = "#141b21"; c.fill();
      c.strokeStyle = ED; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(0, 0, r, 0, TAU);
      c.fillStyle = vgrad(c, -r, r, "#050a0e", "#0b141b"); c.fill();
      c.save(); c.clip();
      c.fillStyle = vgrad(c, -r, -r * 0.3, "rgba(0,0,0,.55)", "rgba(0,0,0,0)");
      c.fillRect(-r, -r, r * 2, r * 2);
      c.restore();
      text(c, inst.label, 0, r * 0.72, Math.max(8, r * 0.16 | 0), DIM, "center");
    } else {
      const w = b.hw * 2, h = b.hh * 2;
      rrect(c, -w / 2 - 5, -h / 2 - 5, w + 10, h + 10, 5);
      c.fillStyle = "#141b21"; c.fill();
      c.strokeStyle = ED; c.lineWidth = 1.6; c.stroke();
      rrect(c, -w / 2, -h / 2, w, h, 3);
      c.fillStyle = vgrad(c, -h / 2, h / 2, "#050a0e", "#0b141b"); c.fill();
      c.save(); c.clip();
      c.fillStyle = vgrad(c, -h / 2, -h * 0.1, "rgba(0,0,0,.5)", "rgba(0,0,0,0)");
      c.fillRect(-w / 2, -h / 2, w, h);
      c.restore();
      c.strokeStyle = "rgba(120,150,160,.2)"; c.lineWidth = 1; c.stroke();
      text(c, inst.label, -w / 2 + 5, -h / 2 + h * 0.11, Math.max(8, h * 0.11 | 0), DIM);
    }
    c.restore();
  };

  // instrument boxes in near-layer px. Landscape uses the frame's dash
  // placement; portrait squeezes unit x too hard for it, so the panels
  // repack into a 2x3 grid across the bottom. Chase reuses the grid as
  // its floating strip. hh is capped by hw: the draw fns lay text out
  // for wide-ish panels.
  const grid = (cols, top, bot = H) => {
    const rows = Math.ceil(INST.length / cols), cw = W / cols, ch = (bot - top) / rows;
    return INST.map((inst, k) => ({
      inst, x: cw * ((k % cols) + 0.5), y: top + ch * (((k / cols) | 0) + 0.55), rot: 0,
      hw: cw * 0.44, hh: Math.min(ch * 0.38, cw * 0.26),
    }));
  };
  const layout = () => {
    if (view === "chase") BOX = grid(W < H ? 3 : INST.length, H - Math.max(96, H * 0.16));
    else if (W < H) BOX = grid(2, H - Math.max(150, H * 0.28) - 22, H - 22); // clear of the home link
    else BOX = INST.map((inst) => ({
      inst, x: X(inst.x), y: Y(inst.y), rot: inst.rot || 0,
      hw: inst.r ? UH(inst.r) : UW(inst.w) / 2, hh: UH(inst.r || inst.h / 2),
    }));
  };

  // members at one depth: struts as tapered beams, bands as strips, pods
  // as plates. far = deep layer (drawn dimmer, sways less).
  const members = (c, isFar) => {
    for (const s of frame.struts)
      if (((s.z0 + s.z1) / 2 < ZSPLIT) === isFar) beam(c, s);
    for (const b of frame.bands)
      if ((b.z < ZSPLIT) === isFar) bandFill(c, b);
    for (const p of frame.pods)
      if ((p.z < ZSPLIT) === isFar)
        plate(c, P(p.pts), vgrad(c, Y(0), Y(-0.7), "#0d1318", "#070b0f"));
    if (!isFar) for (const p of frame.pods)
      for (const q of p.pts) screw(c, q[0] * 0.96, q[1] * 0.96);
  };

  const paintFar = () => {
    fg.clearRect(0, 0, W, H);
    if (view === "chase") return; // no interior geometry in third person
    members(fg, true);
  };

  const paintNear = () => {
    ng.clearRect(0, 0, W, H);
    if (view === "chase") return;
    // the backing: opaque near-black hull over the whole canvas
    ng.fillStyle = vgrad(ng, 0, H, "#0a0f14", "#04070a");
    ng.fillRect(0, 0, W, H);
    // punch the glass
    ng.globalCompositeOperation = "destination-out";
    for (const p of frame.panes) { poly(ng, P(p.pts)); ng.fill(); }
    ng.globalCompositeOperation = "source-over";
    // gasket rim on each opening
    ng.strokeStyle = "rgba(150,185,195,.12)"; ng.lineWidth = 1.5;
    for (const p of frame.panes) { poly(ng, P(p.pts)); ng.stroke(); }
    members(ng, false);
    for (const b of BOX) house(ng, b);
  };

  // cull mask: pane polys in unit space, plus every member as a tapered
  // capsule blocker so stars can't shine through frame drawn over glass.
  // Blockers live in iso units (x scaled by cx/cy, so 1 = cy px both
  // ways): member widths are cy-relative and a capsule test only matches
  // the painted beam when both axes share a scale. Each layer is tested
  // in its own sway transform.
  const buildMask = () => {
    PANES = frame.panes.map((p) => {
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const [x, y] of p.pts) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return { pts: p.pts, x0, x1, y0, y1 };
    });
    const asp = cx / cy, M = 0.004;
    BLKN = []; BLKF = [];
    const add = (isFar, a, b, w0, w1) => (isFar ? BLKF : BLKN)
      .push([a[0] * asp, a[1], b[0] * asp, b[1], w0 + M, w1 + M]);
    for (const s of frame.struts) add((s.z0 + s.z1) / 2 < ZSPLIT, s.p0, s.p1, s.w0, s.w1);
    // housing bboxes (rotation-padded, +5px bezel) in near-layer px
    HB = BOX.map((b) => {
      const c = Math.abs(Math.cos(b.rot)), s = Math.abs(Math.sin(b.rot));
      const ex = c * b.hw + s * b.hh + 5, ey = s * b.hw + c * b.hh + 5;
      return [b.x - ex, b.y - ey, b.x + ex, b.y + ey];
    });
    for (const b of frame.bands) {
      // one capsule on the strip midline, radius half its thickness
      const n = Math.min(b.e0.length, b.e1.length), last = b.loop ? n : n - 1;
      const mid = (i) => [(b.e0[i][0] + b.e1[i][0]) / 2, (b.e0[i][1] + b.e1[i][1]) / 2];
      const half = (i) => Math.hypot((b.e1[i][0] - b.e0[i][0]) * asp, b.e1[i][1] - b.e0[i][1]) / 2;
      for (let i = 0; i < last; i++) {
        const j = (i + 1) % n;
        add(b.z < ZSPLIT, mid(i), mid(j), half(i), half(j));
      }
    }
  };

  const inPane = (u, v) => {
    for (const p of PANES) {
      if (u < p.x0 || u > p.x1 || v < p.y0 || v > p.y1) continue;
      let inside = false;
      const pts = p.pts, n = pts.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const a = pts[i], b = pts[j];
        if (a[1] > v !== b[1] > v && u < ((b[0] - a[0]) * (v - a[1])) / (b[1] - a[1]) + a[0])
          inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };
  const blocked = (L, u, v) => {
    for (const b of L) {
      const dx = b[2] - b[0], dy = b[3] - b[1];
      const L2 = dx * dx + dy * dy || 1e-6;
      let t = ((u - b[0]) * dx + (v - b[1]) * dy) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = u - (b[0] + dx * t), ey = v - (b[1] + dy * t), r = b[4] + (b[5] - b[4]) * t;
      if (ex * ex + ey * ey < r * r) return true;
    }
    return false;
  };
  // screen px -> does a world particle there show through open glass?
  // Inverts the near/far draw transforms of the last deck.frame.
  const shows = (hx, hy) => {
    const dx = hx - cx - mTx, dy = hy - cy - mTy;
    const iu = (dx * mCos + dy * mSin) / cy, v = (dx * mSin - dy * mCos) / cy;
    if (!inPane((iu * cy) / cx, v) || blocked(BLKN, iu, v)) return false;
    const lx = cx + iu * cy, ly = cy - v * cy;
    for (const r of HB) if (lx > r[0] && lx < r[2] && ly > r[1] && ly < r[3]) return false;
    const fx = hx - cx - fTx, fy = hy - cy - fTy;
    return !blocked(BLKF, (fx * fCos + fy * fSin) / cy, (fx * fSin - fy * fCos) / cy);
  };

  const rebuild = () => { layout(); buildMask(); paintFar(); paintNear(); };

  const st = { run: null, cam, world: null, deckT: 0, blink: 1 };
  const deck = {};

  deck.resize = () => {
    W = innerWidth; H = innerHeight;
    cx = W / 2; cy = H / 2;
    dpr = devicePixelRatio || 1;
    for (const c of [cv, far, near]) { c.width = W * dpr; c.height = H * dpr; }
    for (const c of [g, fg, ng]) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (frame) rebuild();
  };

  deck.paint = (ship) => {
    frame = FRAMES[ship.name] || FRAMES.kestrel;
    INST = frame.inst;
    if (W) rebuild(); else deck.resize();
  };

  deck.setView = (m) => {
    view = m === "chase" ? "chase" : "cockpit";
    if (frame) rebuild();
  };

  deck.hit = () => { hitT = 0.9; };
  deck.shows = shows;

  // probe: sample the composed deck canvas on a px grid. glass = deck
  // alpha under 64 (glare tops out ~46); falseShow = mask lets a particle
  // through onto painted hull, falseHide = mask parks one over open glass.
  // tl = glass share of the top-left comms-box zone (30% x 22%).
  deck.fill = (step = 4) => {
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const pct = (a, b) => +((100 * a) / (b || 1)).toFixed(1);
    let n = 0, gl = 0, fs = 0, fh = 0, tn = 0, tg = 0;
    for (let y = step / 2; y < H; y += step)
      for (let x = step / 2; x < W; x += step) {
        const a = d[(((y * dpr) | 0) * cv.width + ((x * dpr) | 0)) * 4 + 3];
        const glass = a < 64, sh = view === "chase" || shows(x, y);
        n++; if (glass) gl++;
        if (sh && a > 200) fs++;
        if (!sh && glass) fh++;
        if (x < W * 0.3 && y < H * 0.22) { tn++; if (glass) tg++; }
      }
    return { glass: pct(gl, n), falseShow: pct(fs, n), falseHide: pct(fh, n), tl: pct(tg, tn) };
  };

  // hide world particles parked behind the hull: a home outside every
  // pane (or under any member drawn over one) is offscreen this frame
  const home = field.home, snap = field.snap, homed = field.homed;
  deck.cull = (ranges) => {
    if (view === "chase" || !PANES.length) return; // chase: no panes, all world visible
    for (const rg of ranges) {
      for (let p = rg.lo; p < rg.hi; p++) {
        if (!homed[p]) continue;
        const j = p * 3, hx = home[j], hy = home[j + 1];
        if (hx < -4e3) continue;
        if (shows(hx, hy)) continue;
        home[j] = -5e3; home[j + 1] = -5e3; home[j + 2] = 0;
        snap[p] = 1;
      }
    }
  };

  deck.frame = (dt, run, world) => {
    if (!W) return;
    deckT += dt;
    hitT = Math.max(0, hitT - dt);
    const vvx = cam.right[0] * cam.vx + cam.right[1] * cam.vy + cam.right[2] * cam.vz;
    const vvy = cam.up[0] * cam.vx + cam.up[1] * cam.vy + cam.up[2] * cam.vz;
    const k = Math.min(1, dt * 5);
    swayX += (Math.max(-0.12, Math.min(0.12, -vvx * 0.0002)) - swayX) * k;
    swayY += (Math.max(-0.12, Math.min(0.12, vvy * 0.0002)) - swayY) * k;
    const roll = cam.visor; // canopy counter-roll, self-levels after spin
    // shake + a small speed/boost hum on top of the old jitter input
    const vib = cam.speedK * (cam.boosting ? 2.2 : 0.7);
    const shx = cam.ox * 0.45 + (Math.random() - 0.5) * (run.jitter * 14 + vib);
    const shy = cam.oy * 0.45 + (Math.random() - 0.5) * (run.jitter * 14 + vib);
    // mask transform = the near layer's draw transform, inverted in cull
    mTx = swayX * cx + shx; mTy = swayY * cy + shy;
    mCos = Math.cos(roll); mSin = Math.sin(roll);
    fTx = mTx * 0.4; fTy = mTy * 0.4;
    fCos = Math.cos(roll * 0.4); fSin = Math.sin(roll * 0.4);

    g.clearRect(0, 0, W, H);
    if (view !== "chase") {
      g.save();
      g.translate(cx + fTx, cy + fTy);
      g.rotate(roll * 0.4);
      g.drawImage(far, -cx, -cy, W, H);
      g.restore();
      // canopy glare: the sun burns through open glass - a warm bloom
      // painted under the near layer, so hull steel and every member
      // drawn over the glass occlude it for free
      if (world && world.course && world.course.sunVis) {
        const gx = world.course.sunX, gy = world.course.sunY;
        const gr = g.createRadialGradient(gx, gy, 0, gx, gy, Math.min(cx, cy) * 0.78);
        gr.addColorStop(0, "rgba(255,214,150,.18)");
        gr.addColorStop(0.5, "rgba(255,192,120,.07)");
        gr.addColorStop(1, "rgba(255,192,120,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      }
      g.save();
      g.translate(cx + mTx, cy + mTy);
      g.rotate(roll);
      g.drawImage(near, -cx, -cy, W, H);
      g.restore();
    }

    st.run = run; st.world = world; st.deckT = deckT;
    st.blink = run.invuln > 0 ? (Math.sin(run.invuln * 30) > 0 ? 0.35 : 1) : 1;
    if (view === "chase") {
      // floating HUD strip: the same instrument draw fns repacked into a
      // bottom row over a faint dark band, readable against open space
      const sh = Math.max(96, H * 0.16), sy = H - sh;
      g.fillStyle = "rgba(4,9,13,.58)";
      g.fillRect(0, sy, W, sh);
      g.strokeStyle = "rgba(120,150,160,.18)";
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, sy + 0.5); g.lineTo(W, sy + 0.5); g.stroke();
      for (const b of BOX) {
        g.save();
        g.translate(b.x, b.y);
        g.globalAlpha = st.blink;
        DRAW[b.inst.id](g, st, b.hw, b.hh);
        g.restore();
      }
    } else {
      g.save();
      g.translate(mTx, mTy);
      g.translate(cx, cy); g.rotate(roll); g.translate(-cx, -cy);
      for (const b of BOX) {
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot);
        g.globalAlpha = st.blink;
        DRAW[b.inst.id](g, st, b.hw, b.hh);
        g.restore();
      }
      // frame lamps: small live indicators on the dash, blink on their
      // own phase like the old particle versions did; portrait packs the
      // panels over their unit spots, so lamps sit out
      if (W >= H) for (let li = 0; li < frame.lamps.length; li++) {
        const l = frame.lamps[li];
        const on = Math.sin(deckT * (1.4 + (li % 3) * 0.8) + li * 2.6) > -0.1;
        g.globalAlpha = (on ? 0.85 : 0.15) * st.blink;
        g.fillStyle = l.c === "red" ? RED : l.c === "grn" ? GRN : AMB;
        if (on) { g.shadowColor = g.fillStyle; g.shadowBlur = 6; }
        g.beginPath(); g.arc(X(l.x), Y(l.y), 2.4, 0, TAU); g.fill();
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;
      g.restore();
    }

    // pickup tags: world objects, so they get the raw projected position
    // (no sway/roll) - a small mono tag beside each live ring
    if (world && world.ent) {
      const o = cam.out;
      g.globalAlpha = 1;
      for (const pk of world.ent.picks) {
        if (pk.taken) continue;
        const dx = pk.x - cam.x, dy = pk.y - cam.y, dz = pk.z - cam.z;
        if (dx * dx + dy * dy + dz * dz > 2500 * 2500) continue;
        if (!cam.project(pk.x, pk.y, pk.z)) continue;
        const tag = pk.kind === "boost" ? "BST" : pk.kind === "health" ? "HUL" : "SHD";
        const col = pk.kind === "boost" ? "#ffd159" : pk.kind === "health" ? "#66f2b2" : "#598cf2";
        text(g, tag, o[0] + 14, o[1] - 15, 10, col, "left", 4);
      }
    }

    if (world && world.ent) drawAim(g, cam, world.ent, W, H, st.blink);

    // killfeed: recent event popups under the reticle, newest on top,
    // fading over ~3.5s - what the pickup/kill actually gave you
    if (world && world.feed) {
      let fy = H * 0.66;
      for (let i = world.feed.length - 1; i >= 0; i--) {
        const e = world.feed[i];
        if (e.t > 3.5) continue;
        g.globalAlpha = Math.min(1, (3.5 - e.t) / 1.2) * st.blink;
        text(g, e.text, W / 2, fy, 13, e.col || GRN, "center", 5);
        fy += 18;
      }
      g.globalAlpha = 1;
    }

    // wreck marker: a screen pin for the objective - bracket + range
    // in frame, an edge arrow when it is off-screen or behind
    {
      const lm = world && world.course && world.course.landmark;
      if (lm && run.wreckDist > 0) {
        const dx = lm.x - cam.x, dy = lm.y - cam.y, dz = lm.z - cam.z;
        const R = cam.chase ? cam.vr : cam.right,
          U = cam.chase ? cam.vu : cam.up,
          F = cam.chase ? cam.vf : cam.fwd;
        const vx = R[0] * dx + R[1] * dy + R[2] * dz;
        const vy = U[0] * dx + U[1] * dy + U[2] * dz;
        const vz = F[0] * dx + F[1] * dy + F[2] * dz;
        const mX = 30, mT = 30,
          mB = view === "chase" ? Math.max(96, H * 0.16) + 14 : 34;
        let sx, sy, edge = true;
        if (vz > 20 && cam.project(lm.x, lm.y, lm.z)) {
          sx = cam.out[0]; sy = cam.out[1];
          edge = sx < mX || sx > W - mX || sy < mT || sy > H - mB;
          if (edge) {
            const mx = sx - W / 2, my = sy - H / 2,
              k = Math.max(1, Math.abs(mx) / (W / 2 - mX), Math.abs(my) / (H / 2 - mB));
            sx = W / 2 + mx / k; sy = H / 2 + my / k;
          }
        } else {
          const d = Math.hypot(vx, vy);
          if (d < 1) { sx = W / 2; sy = H - mB - 10; }
          else { sx = W / 2 + (vx / d) * (W / 2 - mX); sy = H / 2 - (vy / d) * (H / 2 - mB); }
        }
        const rng = (run.wreckDist / 1000).toFixed(1);
        g.globalAlpha = (0.6 + 0.3 * Math.sin(deckT * 4)) * st.blink;
        if (edge) {
          const a = Math.atan2(sy - H / 2, sx - W / 2);
          g.save(); g.translate(sx, sy); g.rotate(a);
          g.fillStyle = AMB;
          g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -5.5); g.lineTo(-5, 5.5); g.closePath(); g.fill();
          g.restore();
          text(g, `BB ${rng}k`, sx - Math.cos(a) * 24, sy - Math.sin(a) * 24 + 3, 9, AMB, "center", 3);
        } else {
          g.strokeStyle = AMB; g.lineWidth = 1.2;
          g.strokeRect(sx - 11, sy - 11, 22, 22);
          text(g, `BB ${rng}k`, sx, sy + 25, 10, AMB, "center", 4);
        }
        g.globalAlpha = 1;
      }
    }

    // damage: red edge flicker + the warn cluster pulses while hitT lasts
    const heat = Math.max(hitT > 0 ? Math.min(1, hitT * 3) * (0.55 + 0.45 * Math.sin(deckT * 34)) : 0,
      run.invuln > 0 ? 0.25 : 0);
    if (heat > 0) {
      const rg = g.createRadialGradient(cx, cy, Math.min(cx, cy) * 0.55, cx, cy, Math.max(cx, cy) * 1.15);
      rg.addColorStop(0, "rgba(220,50,40,0)");
      rg.addColorStop(1, `rgba(220,50,40,${(0.4 * heat).toFixed(3)})`);
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    }
  };

  return deck;
}
