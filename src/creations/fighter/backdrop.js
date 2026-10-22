// backdrop.js - the arena's painted scenery on a 2D canvas UNDER the GL
// layer (deck.js pattern from the space run). Point sprites are terrible
// at silhouettes - a moonlit ridge as scattered dots reads as noise, not
// landscape. So everything static is painted here: sky, moon, ridges,
// ruins, crowd, walls, and an opaque ground that swallows every stray
// particle that drifts below the floor line. Particles keep what they
// are good at: live flame, rising embers, the fighters themselves.
export function createBackdrop(env) {
  const cv = document.getElementById("bg");
  const g = cv.getContext("2d");
  const TAU = Math.PI * 2;
  let ring = false;

  // deterministic hash -> jagged but stable silhouettes across resizes
  const h = (i, s) => {
    const x = Math.sin(i * 127.1 + s * 311.7) * 43758.55;
    return x - Math.floor(x);
  };

  function paint(e) {
    const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
    const floor = e.floor, wl = e.wallL, wr = e.wallR, u = e.u;
    const span = wr - wl;

    // ---- sky: deep night falling to a bruised horizon haze ----
    const sky = g.createLinearGradient(0, 0, 0, floor);
    sky.addColorStop(0, "#05070d");
    sky.addColorStop(0.62, "#0a1220");
    sky.addColorStop(0.9, "#131c2b");
    sky.addColorStop(1, "#1a2233");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, floor);

    // moon: pale disc high right with a soft halo and a ragged bite
    const mx = wl + span * 0.8, my = floor - 2.5 * u, mr = 0.34 * u;
    const halo = g.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.6);
    halo.addColorStop(0, "rgba(200,214,232,.28)");
    halo.addColorStop(1, "rgba(200,214,232,0)");
    g.fillStyle = halo;
    g.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    g.fillStyle = "#c4cfdd";
    g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.fillStyle = "#aebbd0";
    g.beginPath(); g.arc(mx - mr * 0.3, my + mr * 0.15, mr * 0.5, 0, TAU); g.fill();
    g.fillStyle = "#c4cfdd";
    g.beginPath(); g.arc(mx - mr * 0.42, my + mr * 0.05, mr * 0.3, 0, TAU); g.fill();

    // ---- far ridge: two silhouettes, the back one colder ----
    for (const [seed, top, col] of [[3, 0.55, "#0c1220"], [9, 0.4, "#0e1626"]]) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, floor);
      for (let i = 0; i <= 24; i++) {
        const x = (i / 24) * W;
        const y = floor - top * u - h(i, seed) * 0.9 * u - Math.sin(i * 0.9 + seed) * 0.25 * u;
        g.lineTo(x, Math.min(floor, y));
      }
      g.lineTo(W, floor);
      g.closePath(); g.fill();
    }

    // ---- ruined wall band + broken columns just behind the fight ----
    g.fillStyle = "#0f141f";
    const wallTop = floor - 0.62 * u;
    g.beginPath();
    g.moveTo(wl - 20, floor);
    for (let i = 0; i <= 30; i++) {
      const x = wl - 20 + (i / 30) * (span + 40);
      const breach = h(i, 17) < 0.22;
      const y = floor - (breach ? 0.06 + h(i, 5) * 0.1 : 0.4 + h(i, 5) * 0.3) * u;
      g.lineTo(x, Math.min(floor, y));
    }
    g.lineTo(wr + 20, floor);
    g.closePath(); g.fill();
    // broken columns rising off the wall line
    for (let c = 0; c < 7; c++) {
      const cx = wl + span * (0.06 + (0.88 * c) / 6);
      const cw = 0.09 * u, cht = (0.9 + h(c, 23) * 1.3) * u;
      g.fillStyle = "#101623";
      g.fillRect(cx - cw / 2, floor - cht, cw, cht - 0.4 * u);
      // ragged cap
      g.beginPath();
      g.moveTo(cx - cw / 2, floor - cht);
      g.lineTo(cx - cw / 2 + cw * h(c, 29), floor - cht - 0.14 * u);
      g.lineTo(cx + cw / 2, floor - cht - 0.04 * u * h(c, 31));
      g.lineTo(cx + cw / 2, floor - cht);
      g.closePath(); g.fill();
    }

    if (ring) {
      // ---- boxing ring: posts + sagging ropes over the wall band ----
      const postY = floor - 1.3 * u;
      for (const px of [wl + span * 0.05, wr - span * 0.05]) {
        g.fillStyle = "#20293a";
        g.fillRect(px - 0.035 * u, postY, 0.07 * u, 1.3 * u);
        g.fillStyle = "#2e3a4f";
        g.fillRect(px - 0.035 * u, postY, 0.07 * u, 0.1 * u);
      }
      for (let r = 0; r < 3; r++) {
        const ry = floor - (0.5 + r * 0.28) * u;
        g.strokeStyle = "#5a2622";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(wl + span * 0.05, ry);
        g.quadraticCurveTo(wl + span / 2, ry + 0.05 * u, wr - span * 0.05, ry);
        g.stroke();
      }
    }

    // ---- crowd: two dim rows of heads against the wall ----
    for (let row = 0; row < 2; row++) {
      const cy = floor - (0.18 + row * 0.22) * u;
      for (let i = 0; i < 90; i++) {
        const x = wl + span * (i / 89) + (h(i, 40 + row) - 0.5) * 9;
        const r = 2 + h(i, 60 + row) * 2.4;
        const warm = h(i, 80 + row) > 0.86;
        g.fillStyle = warm ? "rgba(150,90,50,.5)" : "rgba(40,48,64,.55)";
        g.beginPath(); g.arc(x, cy + h(i, 70) * 6, r, 0, TAU); g.fill();
      }
    }

    // ---- torch posts: dark poles; the live flames stay particle ----
    for (let t = 0; t < 5; t++) {
      const bx = wl + span * ((t + 0.5) / 5);
      const ty = floor - 0.86 * u;
      g.fillStyle = "#1a1410";
      g.fillRect(bx - 2.5, ty, 5, 0.86 * u);
      g.fillStyle = "#241c14";
      g.fillRect(bx - 7, ty - 4, 14, 7);
      // warm glow pool on the wall behind each brazier
      const gl = g.createRadialGradient(bx, ty, 4, bx, ty, 0.8 * u);
      gl.addColorStop(0, "rgba(190,110,40,.16)");
      gl.addColorStop(1, "rgba(190,110,40,0)");
      g.fillStyle = gl;
      g.fillRect(bx - u, ty - u, 2 * u, 2 * u);
    }

    // ---- arena edge pillars framing the pit ----
    for (const px of [wl - 14, wr + 14]) {
      const pw = 0.3 * u, pt = floor - 0.5 * u - 14;
      g.fillStyle = "#141a26";
      g.fillRect(px - pw / 2, pt, pw, 0.5 * u + 14);
      g.fillStyle = "#1a2233";
      g.fillRect(px - pw / 2, pt - 12, pw, 12);
      g.fillStyle = "rgba(120,140,170,.12)";
      g.fillRect(px - pw / 2 - 4, pt - 16, pw + 8, 6);
    }

    // ---- ground: opaque soil swallows every stray under the line ----
    const soil = g.createLinearGradient(0, floor, 0, H);
    soil.addColorStop(0, "#171310");
    soil.addColorStop(0.12, "#100d0b");
    soil.addColorStop(1, "#060505");
    g.fillStyle = soil;
    g.fillRect(0, floor + 3, W, H - floor);
    // the lit lip: a faint warm edge right on the fight line
    const lip = g.createLinearGradient(0, floor - 2, 0, floor + 3);
    lip.addColorStop(0, "rgba(90,80,66,0)");
    lip.addColorStop(1, "rgba(90,80,66,.35)");
    g.fillStyle = lip;
    g.fillRect(wl, floor - 2, span, 5);

    // vignette so the fight line pops
    const vg = g.createRadialGradient(W / 2, floor - u * 0.8, u * 2, W / 2, floor - u * 0.8, W * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.45)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  return {
    paint,
    setRing(on) { ring = !!on; },
  };
}
