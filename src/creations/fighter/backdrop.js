// backdrop.js - one flat vertical gradient on the #bg canvas under the
// GL layer. It holds no shapes: every piece of scenery is particles
// (arena.js). The gradient only fills what the particles leave open:
// night sky down to the arcade base, then the shadowed stands that show
// between spectators, then dark soil under the ground band's grains.
export function createBackdrop() {
  const cv = document.getElementById("bg");
  const g = cv.getContext("2d");
  let ring = false;

  function paint(e) {
    const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
    const at = (y) => Math.min(1, Math.max(0, y / H));
    const stands = e.floor - 1.2 * e.u;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#03050b");
    grad.addColorStop(at(stands * 0.55), "#0a1428");
    grad.addColorStop(at(stands * 0.85), ring ? "#211f36" : "#1a2a4a");
    grad.addColorStop(at(stands - 2), ring ? "#33283a" : "#26355a");
    grad.addColorStop(at(stands), "#100e12");
    grad.addColorStop(at(e.floor), "#0c0a0a");
    grad.addColorStop(1, "#050404");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  return {
    paint,
    setRing(on) { ring = !!on; },
  };
}
