// audio.js - WebAudio bleeps + engine hum. The AudioContext is created or
// resumed on the first user gesture (au.unlock from the picker/keys); every
// call before that is a no-op. M toggles mute, persisted in space.mute.
import { createMusic } from "./music.js";
export function createAudio() {
  let ctx = null, master = null, eng = null, noiseBuf = null, mus = null;
  let musMood = "pick", musK = 0;
  let muted = false;
  try { muted = localStorage.getItem("space.mute") === "1"; } catch {}
  let engK = 0, engB = false;
  const last = Object.create(null); // per-name throttle (bolt fires ~8/s)
  const GAP = { bolt: 0.06 };

  const au = {};

  au.unlock = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch { ctx = null; return; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(ctx.destination);
      // engine voice: detuned saws through a lowpass, pitched by speed
      const eg = ctx.createGain(); eg.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 220; lp.Q.value = 0.9;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = "sawtooth"; o2.type = "sawtooth";
      o1.frequency.value = 48;
      o2.frequency.value = 48 * 1.5;
      o2.detune.value = 10;
      o1.connect(lp); o2.connect(lp); lp.connect(eg); eg.connect(master);
      o1.start(); o2.start();
      eng = { o1, o2, lp, eg };
      au.engine(engK, engB);
      mus = createMusic(ctx, master);
      mus.set(musMood, musK);
      mus.start();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  };

  au.muted = () => muted;
  au.toggle = () => {
    muted = !muted;
    try { localStorage.setItem("space.mute", muted ? "1" : "0"); } catch {}
    if (master && ctx)
      master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.03);
    return muted;
  };

  // continuous engine hum, called every frame - cheap param nudges
  au.engine = (speedK, boosting) => {
    engK = speedK; engB = boosting;
    if (!ctx || !eng) return;
    const t = ctx.currentTime;
    const f = 44 + speedK * 58 + (boosting ? 15 : 0);
    eng.o1.frequency.setTargetAtTime(f, t, 0.09);
    eng.o2.frequency.setTargetAtTime(f * 1.497, t, 0.09);
    eng.lp.frequency.setTargetAtTime(200 + speedK * 640 + (boosting ? 560 : 0), t, 0.11);
    eng.eg.gain.setTargetAtTime(0.014 + speedK * 0.07 + (boosting ? 0.05 : 0), t, 0.1);
  };

  // adaptive score; mood is one of the MOODS keys in music.js (unknown -> race)
  au.music = (mood, speedK) => {
    musMood = mood; musK = speedK;
    if (mus) mus.set(mood, speedK);
  };
  au.musicStats = () => mus && mus.stats();

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

  const noise = (dur, cutoff, g0, t0 = 0) => {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, (ctx.sampleRate * 0.6) | 0, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + t0;
    const src = ctx.createBufferSource(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    lp.type = "lowpass"; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(g0, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  };

  const SFX = {
    bolt: () => tone("triangle", 860, 190, 0.09, 0.045),
    kill: () => { noise(0.3, 900, 0.15); tone("sine", 130, 42, 0.34, 0.2); },
    gate: () => { tone("sine", 660, 660, 0.16, 0.06); tone("sine", 990, 990, 0.34, 0.05, 0.07); },
    hit: () => { noise(0.16, 480, 0.19); tone("sine", 96, 38, 0.24, 0.22); },
    pick: () => { tone("sine", 520, 1080, 0.11, 0.06); tone("sine", 1040, 1560, 0.1, 0.04, 0.08); },
    // low alert swell: shaped gain envelope over detuned saws
    wave: () => {
      const t = ctx.currentTime;
      const g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 320;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      lp.connect(g); g.connect(master);
      for (const det of [0, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth"; o.frequency.value = 98; o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + 1.3);
      }
    },
    tick: () => { tone("square", 2300, 1500, 0.03, 0.035); tone("sine", 3400, 2600, 0.05, 0.03); },
    // radio squelch: filtered noise burst, then a two-note blip
    comms: () => {
      noise(0.09, 4200, 0.07);
      tone("square", 1250, 1250, 0.05, 0.03, 0.05);
      tone("square", 1700, 1700, 0.06, 0.03, 0.12);
    },
    over: () => { tone("triangle", 300, 52, 1.3, 0.16); noise(0.7, 300, 0.07); },
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
