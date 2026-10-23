// music.js - generative adaptive score, pure WebAudio. One lookahead
// scheduler on a 16th-note grid reads MOODS[mood]; moods differ only by
// data. Layer buses crossfade (~1.5-2s) so rhythmic layers never leave the
// grid. Every transient voice frees itself on `ended`.
const SEMI = (root, s) => root * Math.pow(2, s / 12);

// pat strings: one char per 16th, "x" hit, "X" accent/octave up, "." rest.
// layers: steady-state bus gain per layer. cut/dens ramp over speedK 0..1.
const MOODS = {
  pick: {
    bpm: 60, root: 55, bars: 2,
    prog: [[0, 7, 12, 15], [-4, 3, 7, 12], [3, 7, 10, 15], [-2, 5, 10, 14]],
    layers: { pad: 0.9, drone: 0.5, arp: 0, bass: 0, kick: 0, hat: 0 },
    padCut: [380, 380], arpCut: [0, 0], dens: [0, 0],
  },
  race: {
    bpm: 112, root: 55, bars: 2,
    prog: [[0, 7, 12, 15], [-4, 3, 7, 12], [3, 7, 10, 15], [-2, 5, 10, 14]],
    layers: { pad: 0.65, drone: 0.3, arp: 0.7, bass: 0, kick: 0, hat: 0.15 },
    padCut: [320, 1100], arpCut: [700, 3200], dens: [0.2, 1],
    hat: "..x...x...x...x.",
  },
  fight: {
    bpm: 136, root: 49, bars: 2,
    prog: [[0, 7, 12, 15], [1, 8, 13, 17], [0, 7, 12, 15], [-2, 5, 10, 14]],
    layers: { pad: 0.55, drone: 0.3, arp: 0, bass: 1, kick: 1, hat: 0.8 },
    padCut: [300, 300], arpCut: [0, 0], dens: [0, 0],
    bass: "x.xxx.xXx.xxx.Xx", kick: "x...x...x..xx...", hat: "..x...x...x...xx",
  },
  dock: {
    bpm: 60, root: 73.4, bars: 2,
    prog: [[0, 7, 12, 16], [5, 12, 16, 21], [-3, 4, 9, 12], [-5, 2, 7, 11]],
    layers: { pad: 1, drone: 0.35, arp: 0, bass: 0, kick: 0, hat: 0 },
    padCut: [900, 900], arpCut: [0, 0], dens: [0, 0],
  },
  finale: {
    bpm: 126, root: 46.2, bars: 2,
    prog: [[0, 7, 12, 15], [1, 8, 13, 18], [-2, 5, 10, 13], [1, 8, 12, 17]],
    layers: { pad: 0.55, drone: 0.4, arp: 0.8, bass: 0.8, kick: 0.6, hat: 0.5 },
    padCut: [260, 700], arpCut: [600, 2400], dens: [0.45, 1],
    bass: "x...x...x...x..X", kick: "x.......x.......", hat: "..x...x...x...x.",
  },
  over: {
    bpm: 50, root: 41.2, bars: 4,
    prog: [[0, 7, 12, 15]],
    layers: { pad: 0.12, drone: 0.45, arp: 0, bass: 0, kick: 0, hat: 0 },
    padCut: [200, 200], arpCut: [0, 0], dens: [0, 0],
  },
};
const LAYERS = ["pad", "drone", "arp", "bass", "kick", "hat"];
const ARP_SEQ = [0, 2, 1, 3, 2, 3, 1, 2];
// step priority: arp density d plays steps whose rank/16 < d
const RANK = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15].reduce((r, s, i) => (r[s] = i, r), []);
const AHEAD = 0.12, TAU = 0.5, QUIET = 3;

export function createMusic(ctx, dest, snap = false) {
  const out = ctx.createGain(); out.gain.value = 0.24;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
  out.connect(comp); comp.connect(dest);

  const bus = {};
  for (const l of LAYERS) { bus[l] = ctx.createGain(); bus[l].gain.value = 0; bus[l].connect(out); }

  // persistent voices: 4 pad chord tones x 2 detuned saws, 2 drone sines
  const padLP = ctx.createBiquadFilter();
  padLP.type = "lowpass"; padLP.Q.value = 0.8; padLP.frequency.value = 300;
  const padG = ctx.createGain(); padG.gain.value = 0.045;
  padLP.connect(padG); padG.connect(bus.pad);
  const persistent = [];
  const pad = [];
  for (let i = 0; i < 4; i++) {
    const pair = [0, 1].map((d) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth"; o.detune.value = d ? 7 : -7;
      o.connect(padLP); o.start(); persistent.push(o);
      return o;
    });
    pad.push(pair);
  }
  const droneG = ctx.createGain(); droneG.gain.value = 0.07; droneG.connect(bus.drone);
  const drone = [1, 1.5].map((m) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.connect(droneG); o.start(); persistent.push(o);
    return o;
  });

  let noiseBuf = null;
  const noise = () => noiseBuf || (() => {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate >> 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  })();

  let live = 0; // transient voices alive right now
  const voice = (src, chain, t, dur) => {
    live++;
    src.onended = () => { live--; src.disconnect(); for (const n of chain) n.disconnect(); };
    src.start(t); src.stop(t + dur + 0.03);
  };
  const env = (peak, t, a, dur) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  };
  const note = (type, f, t, dur, peak, to, cut) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = env(peak, t, 0.006, dur), chain = [g];
    if (cut) {
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cut;
      o.connect(lp); lp.connect(g); chain.push(lp);
    } else o.connect(g);
    g.connect(to);
    voice(o, chain, t, dur);
  };
  const kick = (t, peak) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = env(peak, t, 0.004, 0.24); o.connect(g); g.connect(bus.kick);
    voice(o, [g], t, 0.24);
  };
  const hat = (t, peak) => {
    const s = ctx.createBufferSource(); s.buffer = noise();
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6500;
    const g = env(peak, t, 0.002, 0.05); s.connect(hp); hp.connect(g); g.connect(bus.hat);
    voice(s, [hp, g], t, 0.05);
  };

  let mood = "race", cfg = MOODS.race, speedK = 0;
  let step = 0, nextT = 0, timer = 0;
  const offAt = Object.fromEntries(LAYERS.map((l) => [l, 0]));
  const on = (l, now) => cfg.layers[l] > 0 || now < offAt[l] + QUIET;
  const chordAt = (s) => cfg.prog[Math.floor(s / 16 / cfg.bars) % cfg.prog.length];

  const retune = (t, tau) => {
    const ch = chordAt(step);
    for (let i = 0; i < 4; i++) {
      const f = SEMI(cfg.root * 2, ch[i]);
      for (const o of pad[i]) o.frequency.setTargetAtTime(f, t, tau);
    }
    drone[0].frequency.setTargetAtTime(cfg.root, t, tau);
    drone[1].frequency.setTargetAtTime(cfg.root * 1.5, t, tau);
  };

  const params = (now) => {
    const k = Math.min(1, Math.max(0, speedK));
    padLP.frequency.setTargetAtTime(cfg.padCut[0] + (cfg.padCut[1] - cfg.padCut[0]) * k, now, 0.2);
  };
  // layer gains only change with the mood: one ramp per switch, no per-frame event pile-up
  const fade = (now) => {
    for (const l of LAYERS) {
      const g = cfg.layers[l], p = bus[l].gain;
      if (snap) p.value = g; else p.setTargetAtTime(g, now, TAU);
    }
  };

  const hit = (pat, s) => pat && pat[s & 15] !== ".";
  const play = (s, t) => {
    const st = s & 15, ch = chordAt(s), k = Math.min(1, Math.max(0, speedK));
    if (st === 0 && Math.floor(s / 16) % cfg.bars === 0) retune(t, 0.5);
    const acc = st % 4 === 0 ? 1 : 0.7;
    if (on("arp", t) && cfg.arpCut[1] && RANK[st] / 16 < cfg.dens[0] + (cfg.dens[1] - cfg.dens[0]) * k)
      note("triangle", SEMI(cfg.root * 4, ch[ARP_SEQ[s % 8]]), t, 0.22, 0.05 * acc, bus.arp,
        cfg.arpCut[0] + (cfg.arpCut[1] - cfg.arpCut[0]) * k);
    if (on("bass", t) && hit(cfg.bass, st))
      note("sawtooth", SEMI(cfg.root, ch[0] + (cfg.bass[st] === "X" ? 12 : 0)), t, 0.2, 0.1, bus.bass, 420);
    if (on("kick", t) && hit(cfg.kick, st)) kick(t, 0.22);
    if (on("hat", t) && hit(cfg.hat, st)) hat(t, 0.035 * acc);
  };

  // pump(now): schedule every step whose time falls inside the lookahead
  const pump = (now) => {
    if (nextT < now - 0.25) nextT = now + 0.03; // tab was throttled: skip, don't burst
    while (nextT < now + AHEAD) {
      play(step, nextT);
      nextT += 60 / cfg.bpm / 4;
      step++;
    }
  };

  retune(ctx.currentTime, 0.01);
  fade(ctx.currentTime);
  const fixed = persistent.length + 5 + LAYERS.length; // oscs + padLP/padG/droneG/out/comp + buses

  const m = {
    pump,
    set(name, k) {
      const next = MOODS[name] ? name : "race";
      speedK = k || 0;
      const now = ctx.currentTime;
      if (next !== mood) {
        for (const l of LAYERS)
          if (cfg.layers[l] > 0 && MOODS[next].layers[l] === 0) offAt[l] = now;
        mood = next; cfg = MOODS[next];
        retune(now, 0.8);
        fade(now);
      }
      params(now);
    },
    start() {
      if (timer) return;
      nextT = ctx.currentTime + 0.05;
      m.set(mood, speedK);
      timer = setInterval(() => pump(ctx.currentTime), 25);
    },
    stop() {
      clearInterval(timer); timer = 0;
      for (const o of [...persistent]) { try { o.stop(); } catch {} o.disconnect(); }
      persistent.length = 0;
    },
    stats() {
      const gains = {};
      // gain readback freezes on a silent bus (Chrome idles it); `targets` is the truth, crossfade is proven by renderCross
    for (const l of LAYERS) gains[l] = +bus[l].gain.value.toFixed(3);
      return { mood, time: +ctx.currentTime.toFixed(2), bpm: cfg.bpm, step, speedK, gains, targets: { ...cfg.layers }, transient: live, nodes: (persistent.length ? fixed : 0) + live, running: !!timer };
    },
  };
  return m;
}

// offline render of one mood in steady state, mono float samples
export async function renderMood(mood, secs, speedK, sr = 44100) {
  const ctx = new OfflineAudioContext(1, sr * secs, sr);
  const m = createMusic(ctx, ctx.destination, true);
  m.set(mood, speedK);
  for (let t = 0; t < secs; t += 0.05) m.pump(t);
  return (await ctx.startRendering()).getChannelData(0);
}

// offline crossfade: mood a for `at` seconds then b; per-second RMS shows the ~2s blend on the beat grid
export async function renderCross(a, b, at, secs, speedK = 0.5, sr = 44100) {
  const ctx = new OfflineAudioContext(1, sr * secs, sr);
  const m = createMusic(ctx, ctx.destination);
  m.set(a, speedK);
  let switched = false;
  const pumps = [];
  for (let t = 0.05; t < secs; t += 0.05) pumps.push(t);
  for (const t of pumps) ctx.suspend(t).then(() => { if (t >= at && !switched) { m.set(b, speedK); switched = true; } m.pump(t); ctx.resume(); });
  return (await ctx.startRendering()).getChannelData(0);
}
