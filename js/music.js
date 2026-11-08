'use strict';
/* =====================================================================
   MUSIQUE générée en temps réel (Web Audio, aucun fichier).
   Séquenceur à 4 temps : grosse caisse, caisse claire, charleston,
   basse en gamme mineure et nappe. L'intensité (0..1) ajoute des couches :
   menu = calme et filtré, vagues = rythme complet, boss = double tempo
   à la charleston + basse plus agressive.
   ===================================================================== */

const Music = {
  ctx: null, bus: null, filter: null, vol: 0.5,
  bpm: 104, step: 0, nextTime: 0, timer: null,
  intensity: 0.2, target: 0.2,
  // basse : degrés de la gamme de ré mineur (Hz), une note par temps
  bassLine: [73.42, 73.42, 87.31, 82.41, 73.42, 73.42, 98.0, 87.31],
  padChords: [[146.8, 174.6, 220.0], [130.8, 164.8, 196.0], [116.5, 146.8, 174.6], [130.8, 164.8, 220.0]],

  attach(ctx, out) {
    this.ctx = ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = this.vol * 0.55;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 900;
    this.bus.connect(this.filter); this.filter.connect(out);
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 30);
  },

  setVolume(v) { this.vol = v; if (this.bus) this.bus.gain.value = v * 0.55; },
  /** 0 = menu/pause, 0.6 = vague, 1 = boss */
  setIntensity(v) { this.target = v; },
  /** Vraies pistes (assets/audio) : « calm » et « action » en boucle, mélangées selon l'intensité */
  useTracks(tracks) {
    const c = this.ctx; this.tracks = {};
    for (const [k, buf] of Object.entries(tracks)) {
      const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; src.loop = true; g.gain.value = 0;
      src.connect(g); g.connect(this.bus); src.start(); this.tracks[k] = g;
    }
  },

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    this.intensity += (this.target - this.intensity) * 0.05;
    if (this.tracks) { // pistes enregistrées : fondu entre calme et action, pas de séquenceur
      this.filter.frequency.setTargetAtTime(20000, c.currentTime, 0.3);
      const I = this.intensity, T = this.tracks;
      if (T.calm) T.calm.gain.setTargetAtTime(T.action ? Math.max(0, 1 - I * 1.4) : 1, c.currentTime, 0.5);
      if (T.action) T.action.gain.setTargetAtTime(T.calm ? Math.min(1, I * 1.4) : 1, c.currentTime, 0.5);
      return;
    }
    this.filter.frequency.setTargetAtTime(500 + this.intensity * 7000, c.currentTime, 0.3);
    const spb = 60 / (this.bpm * (this.intensity > 0.9 ? 1.15 : 1)) / 4; // double-croches
    while (this.nextTime < c.currentTime + 0.12) { this.playStep(this.step, this.nextTime, spb); this.nextTime += spb; this.step = (this.step + 1) % 64; }
  },

  playStep(s, t, spb) {
    const I = this.intensity, beat = s % 16;
    if (beat % 4 === 0 && (I > 0.3 || beat === 0)) this.kick(t, I > 0.3 ? 0.5 : 0.3);
    if (I > 0.35 && (beat === 4 || beat === 12)) this.snare(t, 0.22);
    if (I > 0.45 && (beat % 2 === 0 || I > 0.9)) this.hat(t, beat % 4 === 2 ? 0.07 : 0.04);
    if (beat % 4 === 0) { const f = this.bassLine[(s >> 2) % 8]; this.bass(t, f, spb * (I > 0.9 ? 2 : 3.5), I); }
    if (beat === 0 && s % 32 === 0) this.pad(t, this.padChords[(s >> 5) % 4], spb * 32);
  },

  env(g, t, a, d, v) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); },
  osc(type, f, t, dur, v, a = 0.005, slideTo = 0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this.env(g, t, a, dur, v); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + a + dur + 0.05);
  },
  noise(t, dur, v, hp) {
    const c = this.ctx;
    if (!this.nbuf) { const n = c.sampleRate * 0.5; this.nbuf = c.createBuffer(1, n, c.sampleRate); const d = this.nbuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.nbuf; f.type = 'highpass'; f.frequency.value = hp;
    this.env(g, t, 0.002, dur, v); s.connect(f); f.connect(g); g.connect(this.bus); s.start(t); s.stop(t + dur + 0.05);
  },
  kick(t, v) { this.osc('sine', 120, t, 0.28, v, 0.002, 40); },
  snare(t, v) { this.noise(t, 0.16, v, 1200); this.osc('triangle', 190, t, 0.08, v * 0.5); },
  hat(t, v) { this.noise(t, 0.04, v, 7000); },
  bass(t, f, dur, I) { this.osc(I > 0.9 ? 'sawtooth' : 'triangle', f, t, dur, 0.18 + I * 0.1, 0.01); if (I > 0.5) this.osc('square', f * 2, t, dur * 0.5, 0.03, 0.01); },
  pad(t, chord, dur) { for (const f of chord) this.osc('sawtooth', f, t, dur, 0.018, 1.5); },
};
