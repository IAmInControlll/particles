// painter.js - solid body silhouettes on a 2D canvas between the
// painted backdrop (z0, static) and the GL particle layer (z1,
// additive). Point sprites can't render anatomy - 30 dots can't draw
// a knee - so capsule limbs paint the body here and the particles on
// top read as lit flesh. Each capsule's width and alpha track its
// part's live particle count, so damage literally withers the form:
// health is how much of you is left, drawn and counted alike.
export function createPainter() {
  const cv = document.getElementById("bodies");
  const g = cv.getContext("2d");
  const TAU = Math.PI * 2;

  const seg = (x0, y0, x1, y1, w, col, al) => {
    g.globalAlpha = al;
    g.strokeStyle = col;
    g.lineWidth = Math.max(w, 0.5);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  const disc = (x, y, r, col, al) => {
    g.globalAlpha = al;
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, Math.max(r, 0.5), 0, TAU);
    g.fill();
  };

  // live-particle fraction of a part - severed parts paint nothing;
  // the chunk on the floor is the particle debris's job
  function flesh(f, name) {
    const pt = f.part[name];
    if (!pt || pt.severed) return 0;
    let n = 0;
    for (let p = pt.lo; p < pt.hi; p++) n += f.alive[p - f.lo];
    return n / (pt.hi - pt.lo);
  }

  // a limb with girth: a filled tapered quad around the a-b axis,
  // w0 wide at a, w1 at b. Capsule ends come from the round joins.
  const limb = (ax, ay, bx, by, w0, w1, col, alp) => {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1e-4;
    const nx = -dy / d, ny = dx / d;
    g.globalAlpha = alp;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(ax + nx * w0, ay + ny * w0);
    g.lineTo(bx + nx * w1, by + ny * w1);
    g.lineTo(bx - nx * w1, by - ny * w1);
    g.lineTo(ax - nx * w0, ay - ny * w0);
    g.closePath();
    g.fill();
    disc(ax, ay, w0, col, alp);
    disc(bx, by, w1, col, alp);
  };

  function drawFighter(f, u) {
    const J = f.J, s = f.side, t = f.tint;
    // the paint is the body in shadow - additive particles light it
    const lit = `rgb(${t[0] * 105 | 0},${t[1] * 105 | 0},${t[2] * 118 | 0})`;
    const dim = `rgb(${t[0] * 55 | 0},${t[1] * 55 | 0},${t[2] * 66 | 0})`;
    // face sits brighter than the body so the particle ring reads as a
    // lit edge - a darker disc inside the ring is a hollow skull
    const face = `rgb(${Math.min(255, t[0] * 185) | 0},${Math.min(255, t[1] * 185) | 0},${Math.min(255, t[2] * 200) | 0})`;
    const al = (x) => 0.16 + 0.84 * x;
    const wd = (x, w) => (0.3 + 0.7 * x) * w * u;

    g.lineCap = "round";

    // back limbs dim behind the trunk
    let x = flesh(f, "thighB");
    if (x > 0.02) limb(J.root.x, J.root.y, J.kneeB.x, J.kneeB.y, wd(x, 0.05), wd(x, 0.04), dim, al(x) * 0.8);
    x = flesh(f, "shinB");
    if (x > 0.02) {
      limb(J.kneeB.x, J.kneeB.y, J.footB.x, J.footB.y, wd(x, 0.042), wd(x, 0.028), dim, al(x) * 0.8);
      seg(J.footB.x, J.footB.y, J.footB.x + s * 0.09 * u, J.footB.y + 0.01 * u, wd(x, 0.05), dim, al(x) * 0.8);
    }
    x = flesh(f, "trapS");
    if (x > 0.02) seg(J.chest.x, J.chest.y, J.shoS.x, J.shoS.y, wd(x, 0.1), dim, al(x) * 0.8);
    x = flesh(f, "upS");
    if (x > 0.02) limb(J.shoS.x, J.shoS.y, J.elbS.x, J.elbS.y, wd(x, 0.042), wd(x, 0.032), dim, al(x) * 0.8);
    x = flesh(f, "foreS");
    if (x > 0.02) {
      limb(J.elbS.x, J.elbS.y, J.handS.x, J.handS.y, wd(x, 0.036), wd(x, 0.024), dim, al(x) * 0.8);
      disc(J.handS.x, J.handS.y, 0.035 * u, dim, al(x) * 0.8);
    }

    // trunk: pelvis > waist > ribcage > neck - a tapered human torso,
    // not a stick. Each zone fades with its own live mass so wounds
    // carve the silhouette where they land.
    const pelvis = flesh(f, "belly"), ribs = flesh(f, "ribcage");
    if (pelvis > 0.02 || ribs > 0.02) {
      const bx = J.belly.x, by = J.belly.y;
      const wp = wd(pelvis || ribs, 0.085), ww = wd(pelvis || ribs, 0.06), wc = wd(ribs || pelvis, 0.105);
      g.globalAlpha = al(Math.max(pelvis, ribs));
      g.fillStyle = lit;
      // side-on torso: vertical column from root to chest, hip thick,
      // waist pinched, chest widest - the classic side profile
      const nx = 1, ny = 0; // torso width is mostly horizontal in side view
      g.beginPath();
      g.moveTo(J.root.x + nx * wp, J.root.y + ny * wp);
      g.lineTo(bx + nx * ww, by + ny * ww);
      g.lineTo(J.chest.x + nx * wc, J.chest.y + ny * wc);
      g.lineTo(J.chest.x - nx * wc, J.chest.y - ny * wc);
      g.lineTo(bx - nx * ww, by - ny * ww);
      g.lineTo(J.root.x - nx * wp, J.root.y - ny * wp);
      g.closePath();
      g.fill();
      disc(J.root.x, J.root.y, wp, lit, al(pelvis));
      disc(bx, by, ww, lit, al(Math.max(pelvis, ribs)));
      disc(J.chest.x, J.chest.y, wc, lit, al(ribs));
    }
    x = flesh(f, "collar");
    if (x > 0.02) seg(J.chest.x, J.chest.y, J.sho.x, J.sho.y, wd(x, 0.12), lit, al(x));
    x = flesh(f, "neck");
    if (x > 0.02) limb(J.chest.x, J.chest.y, J.neck.x, J.neck.y, wd(x, 0.035), wd(x, 0.028), lit, al(x));
    x = flesh(f, "head");
    if (x > 0.02) {
      limb(J.neck.x, J.neck.y, J.head.x, J.head.y, wd(x, 0.028), wd(x, 0.05), lit, al(x));
      // solid skull under the face - the particle ring rim-lights it
      // instead of framing a hole (bare rim = hollow skull)
      disc(J.head.x, J.head.y, 0.1 * u, lit, al(x));
      disc(J.head.x, J.head.y, 0.082 * u * (0.45 + 0.55 * x), face, al(x));
    }

    // front leg + foot: thigh meaty, shin tapered, a real foot toe
    x = flesh(f, "thighF");
    if (x > 0.02) limb(J.root.x, J.root.y, J.kneeF.x, J.kneeF.y, wd(x, 0.055), wd(x, 0.042), lit, al(x));
    x = flesh(f, "shinF");
    if (x > 0.02) {
      limb(J.kneeF.x, J.kneeF.y, J.footF.x, J.footF.y, wd(x, 0.045), wd(x, 0.028), lit, al(x));
      seg(J.footF.x, J.footF.y, J.footF.x + s * 0.09 * u, J.footF.y + 0.01 * u, wd(x, 0.05), lit, al(x));
    }

    // front arm on top - it carries the weapon
    x = flesh(f, "upper");
    if (x > 0.02) limb(J.sho.x, J.sho.y, J.elb.x, J.elb.y, wd(x, 0.045), wd(x, 0.034), lit, al(x));
    x = flesh(f, "fore");
    if (x > 0.02) {
      limb(J.elb.x, J.elb.y, J.hand.x, J.hand.y, wd(x, 0.038), wd(x, 0.026), lit, al(x));
      disc(J.hand.x, J.hand.y, 0.038 * u, lit, al(x));
    }
  }

  return {
    draw(fighters, u) {
      if (cv.width !== innerWidth || cv.height !== innerHeight) {
        cv.width = innerWidth;
        cv.height = innerHeight;
      }
      g.clearRect(0, 0, cv.width, cv.height);
      drawFighter(fighters[1], u);
      drawFighter(fighters[0], u); // player reads on top in a clinch
    },
  };
}
