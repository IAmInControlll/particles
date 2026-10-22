// audio.js - WebAudio one-shots. The AudioContext is created/resumed on the
// first gesture (au.unlock); every call before that is a no-op. M toggles
// mute, persisted in shatter.mute.
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem("shatter.mute") === "1"; } catch {}
  const last = Object.create(null);
  const GAP = { throw: 0.05, shatter: 0.05, steel: 0.08 };

  const au = {};
  au.unlock = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch { ctx = null; return; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  au.muted = () => muted;
  au.toggle = () => {
    muted = !muted;
    try { localStorage.setItem("shatter.mute", muted ? "1" : "0"); } catch {}
    if (master && ctx)
      master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.03);
    return muted;
  };

  const tone = (type, f0, f1, dur, g0, t0 = 0) => {
    const t = ctx.currentTime + t0;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(g0, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  };
  const noise = (dur, cutoff, g0, type = "lowpass", t0 = 0) => {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, (ctx.sampleRate * 0.6) | 0, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + t0;
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    f.type = type; f.frequency.value = cutoff;
    g.gain.setValueAtTime(g0, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  };

  const SFX = {
    throw: () => { noise(0.07, 2600, 0.1, "bandpass"); tone("sine", 420, 200, 0.07, 0.05); },
    shatter: () => {
      noise(0.28, 5200, 0.16, "highpass");
      tone("sine", 1900, 3200, 0.22, 0.06);
      tone("sine", 2600, 4100, 0.18, 0.04, 0.03);
    },
    steel: () => { tone("triangle", 240, 120, 0.1, 0.09); noise(0.06, 900, 0.07); },
    crystal: () => {
      tone("sine", 880, 1760, 0.3, 0.09);
      tone("sine", 1320, 2640, 0.24, 0.06, 0.05);
      noise(0.12, 6400, 0.04, "highpass");
    },
    hit: () => { noise(0.22, 420, 0.24); tone("sine", 88, 34, 0.3, 0.26); },
    power: () => { tone("sine", 620, 1240, 0.12, 0.08); tone("sine", 930, 1860, 0.14, 0.06, 0.09); },
    noammo: () => tone("square", 190, 140, 0.05, 0.04),
    over: () => { tone("triangle", 320, 46, 1.2, 0.15); noise(0.6, 300, 0.07); },
  };
  au.sfx = (name) => {
    if (!ctx || muted || !SFX[name]) return;
    const now = ctx.currentTime;
    if (GAP[name] && now - (last[name] || -9) < GAP[name]) return;
    last[name] = now;
    try { SFX[name](); } catch {}
  };
  return au;
}
