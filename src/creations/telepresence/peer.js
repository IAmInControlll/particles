// peer.js - one remote participant: a silhouette store plus a cursor well
// living in field.extraWells (stable object, mutated in place).
const CAP = 2200;
const STALE_MS = 3000;

export function createPeer(id, tint, field) {
  const well = { x: -9e3, y: -9e3, down: false, tint };
  field.extraWells.push(well);
  const sil = { buf: new Float32Array(CAP * 4), count: 0, aspect: 4 / 3, t: -1e9 };

  function setSil(pts, aspect, now) {
    const n = Math.min(CAP, pts.length >> 2);
    const buf = sil.buf;
    for (let i = 0, m = n * 4; i < m; i++) buf[i] = pts[i];
    sil.count = n;
    sil.aspect = aspect > 0 ? aspect : 4 / 3;
    sil.t = now;
  }

  function setCur(nx, ny, d) {
    well.x = nx * innerWidth;
    well.y = ny * innerHeight;
    well.down = !!d;
  }

  const fresh = (now) => sil.count > 0 && now - sil.t < STALE_MS;

  function dispose() {
    well.x = -9e3;
    const i = field.extraWells.indexOf(well);
    if (i >= 0) field.extraWells.splice(i, 1);
  }

  return { id, tint, well, sil, setSil, setCur, fresh, dispose };
}
