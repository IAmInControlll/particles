// Home hub: the swarm forms the site title, menu cards route to creations.
import { PF } from "../engine/index.js";

(function () {
  const PAGES = [
    { name: "Playground", desc: "every engine constant on a slider", href: "playground.html" },
    { name: "Koi Pond", desc: "feed the fish, hold to pull them", href: "pond.html" },
    { name: "Mirror", desc: "your webcam silhouette as a scene", href: "mirror.html" },
    { name: "Fray", desc: "particle stick-duel - body mass is health", href: "fighter.html" },
    { name: "Voidrunner", desc: "first-person gate racing in particles", href: "space.html" },
    { name: "Telepresence", desc: "two browsers, each swarm is the other person", soon: true },
  ];

  const menu = document.getElementById("menu");
  for (const p of PAGES) {
    const a = document.createElement(p.soon ? "div" : "a");
    a.className = "card" + (p.soon ? " soon" : "");
    if (p.href) a.href = p.href;
    a.innerHTML =
      `<span class="tag">${p.soon ? "soon" : "open"}</span>` +
      `<div class="name">${p.name}</div>` +
      `<div class="desc">${p.desc}</div>`;
    menu.appendChild(a);
  }

  PF.reseed(7);
  const field = PF.createField({ N: PF.isMobile() ? 2500 : 6000 });
  if (!field.ok) return;
  window.__pf = field;
  const dir = PF.createDirector(field, { dur: 2.4 });

  // rasterize a word into scene-fn targets, one particle per lit pixel
  function textScene(text) {
    const r = PF.textPoints(text, {
      font: "700 220px system-ui, 'Segoe UI', sans-serif",
      h: 340,
      maxPoints: field.N,
    });
    if (!r) return null;
    const { pts, ext } = r;
    const fn = (i, t, T, out, col) => {
      const p = PF.pick(pts, i, field.N);
      out[0] = p[0];
      out[1] = p[1];
      out[2] = 0;
      const c = i % 23 === 0 ? PF.PAL.accent : i % 3 ? PF.PAL.ink : PF.PAL.mist;
      col[0] = c[0];
      col[1] = c[1];
      col[2] = c[2];
    };
    fn.ext = ext;
    return fn;
  }

  const fn = textScene("PARTICLES");
  if (fn) {
    dir.register("title", fn, {
      boxFn: () => ({
        cx: innerWidth / 2,
        cy: innerHeight * 0.32,
        s: Math.min(innerWidth / fn.ext[0], innerHeight * 0.55 / fn.ext[1]) * 0.62,
      }),
    });
    dir.play("title");
  }

  // particles perimeter-slide around the menu
  let ex = [];
  const measure = () => {
    const r = menu.getBoundingClientRect();
    ex = [{ l: r.left - 16, t: r.top - 16, r: r.right + 16, b: r.bottom + 16 }];
  };
  measure();
  addEventListener("resize", measure);

  field.frame = () => {
    field.exclude = ex;
    dir.homes();
  };
  field.start();
})();
