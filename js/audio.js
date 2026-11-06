'use strict';
/* =====================================================================
   SONS synthétisés (Web Audio) — aucun fichier externe.
   Ajouter un son : une entrée dans SOUNDS { gap: anti-spam (s), fn(sfx) }.
   ===================================================================== */

// Palette sonore « post-apo » : coups de feu secs, impacts mats, grognements, sirène
const SOUNDS = {
  shoot:    { gap: 0.06, fn: s => { s.fnoise(0.07, 0.16, 'highpass', 2400, 900, 0.7); s.fnoise(0.12, 0.12, 'lowpass', 900, 120, 1); s.tone(150, 0.08, 'sine', 0.09, 50); } },
  hit:      { gap: 0.03, fn: s => { s.fnoise(0.06, 0.08, 'bandpass', 900, 300, 1.5); s.tone(120, 0.06, 'sine', 0.07, 60); } },
  kill:     { gap: 0.03, fn: s => { s.fnoise(0.22, 0.12, 'lowpass', 1400, 200, 1.2); s.tone(95, 0.22, 'sawtooth', 0.05, 40); if (Math.random() < 0.35) s.groan(0.05, 1.3); } },
  hurt:     { gap: 0.1,  fn: s => { s.fnoise(0.18, 0.16, 'lowpass', 1800, 300, 1); s.tone(220, 0.2, 'triangle', 0.1, 110); s.tone(70, 0.25, 'sine', 0.14, 40); } },
  coin:     { gap: 0.035, fn: s => { s.tone(1568, 0.04, 'square', 0.025); s.tone(2350, 0.08, 'triangle', 0.03, 0, 0.03); } },
  wave:     { gap: 0.2,  fn: s => { s.tone(440, 0.6, 'sawtooth', 0.06, 660); s.tone(660, 0.6, 'sawtooth', 0.05, 440, 0.6); } },
  clear:    { gap: 0.2,  fn: s => [330, 440, 554, 660].forEach((f, i) => s.tone(f, 0.25, 'square', 0.05, 0, i * 0.1)) },
  upgrade:  { gap: 0.2,  fn: s => { s.tone(660, 0.12, 'square', 0.07); s.tone(990, 0.25, 'triangle', 0.08, 0, 0.1); } },
  boss:     { gap: 0.5,  fn: s => { s.tone(60, 1.6, 'sawtooth', 0.22, 35); s.tone(90, 1.4, 'sawtooth', 0.1, 50); s.fnoise(1.4, 0.16, 'lowpass', 600, 80, 1); s.groan(0.18, 0.6); } },
  bossShot: { gap: 0.1,  fn: s => { s.tone(120, 0.3, 'sawtooth', 0.12, 50); s.noise(0.2, 0.08); } },
  enemyShot:{ gap: 0.08, fn: s => { s.tone(300, 0.12, 'sine', 0.07, 120); s.noise(0.06, 0.04); } },
  death:    { gap: 1,    fn: s => { s.tone(200, 1.2, 'sawtooth', 0.14, 50); s.fnoise(1.0, 0.14, 'lowpass', 1200, 90, 1); s.tone(55, 1.2, 'sine', 0.2, 30); } },
  click:    { gap: 0.05, fn: s => s.tone(900, 0.03, 'square', 0.04) },
  roll:     { gap: 0.12, fn: s => { s.fnoise(0.2, 0.09, 'bandpass', 900, 2400, 0.8); s.tone(240, 0.12, 'sine', 0.04, 120); } },
  clang:    { gap: 0.05, fn: s => { s.tone(1800, 0.05, 'square', 0.03, 1200); s.tone(900, 0.08, 'triangle', 0.04); } },
  boom:     { gap: 0.06, fn: s => { s.fnoise(0.09, 0.3, 'highpass', 1800, 600, 0.7); s.fnoise(1.1, 0.32, 'lowpass', 1600, 60, 0.9); s.tone(70, 0.7, 'sine', 0.32, 28); s.tone(110, 0.3, 'sawtooth', 0.08, 40); } },
  heal:     { gap: 0.2,  fn: s => [523, 659, 784].forEach((f, i) => s.tone(f, 0.18, 'sine', 0.08, 0, i * 0.07)) },
  shotgun:  { gap: 0.1,  fn: s => { s.fnoise(0.1, 0.22, 'highpass', 1600, 500, 0.7); s.fnoise(0.3, 0.2, 'lowpass', 1100, 100, 1); s.tone(85, 0.18, 'sine', 0.18, 40); s.tone(700, 0.04, 'square', 0.03, 400, 0.22); } },
  flame:    { gap: 0.1,  fn: s => s.fnoise(0.18, 0.06, 'bandpass', 700, 1100, 0.6) },
  throw:    { gap: 0.1,  fn: s => s.tone(500, 0.15, 'sine', 0.05, 900) },
  droneShot:{ gap: 0.07, fn: s => s.tone(1300, 0.04, 'square', 0.025, 700) },
  mine:     { gap: 0.2,  fn: s => s.tone(1000, 0.06, 'square', 0.04) },
  achieve:  { gap: 0.5,  fn: s => [659, 880, 1046, 1318].forEach((f, i) => s.tone(f, 0.22, 'triangle', 0.08, 0, i * 0.08)) },
  buy:      { gap: 0.1,  fn: s => { s.tone(1046, 0.08, 'square', 0.05); s.tone(1568, 0.14, 'square', 0.05, 0, 0.07); } },
  engine:   { gap: 1,    fn: s => { s.tone(70, 1.6, 'sawtooth', 0.12, 140); s.tone(105, 1.6, 'square', 0.04, 210); } },
  brake:    { gap: 1,    fn: s => { s.noise(0.7, 0.12); s.tone(900, 0.5, 'triangle', 0.04, 500); } },
  wind:     { gap: 2,    fn: s => s.noise(2.5, 0.08) },
  unlock:   { gap: 1,    fn: s => { s.tone(220, 0.4, 'sawtooth', 0.1, 440); s.tone(330, 0.6, 'sawtooth', 0.08, 660, 0.3); } },
  objective:{ gap: 0.5,  fn: s => [523, 784, 659].forEach((f, i) => s.tone(f, 0.18, 'square', 0.06, 0, i * 0.1)) },
  door:     { gap: 0.2,  fn: s => { s.tone(140, 0.2, 'triangle', 0.12, 90); s.noise(0.1, 0.06); } },
  thud:     { gap: 0.25, fn: s => { s.tone(80, 0.15, 'sine', 0.2, 50); s.noise(0.08, 0.08); } },
  bite:     { gap: 0.1,  fn: s => { s.noise(0.06, 0.08); s.tone(320, 0.08, 'square', 0.04, 160); } },
  reload:   { gap: 0.15, fn: s => { s.tone(420, 0.04, 'square', 0.05, 300); s.tone(700, 0.05, 'square', 0.05, 900, 0.07); s.noise(0.04, 0.05); } },
  heli:     { gap: 0.1,  fn: s => { s.noise(0.07, 0.025); s.tone(55, 0.08, 'sine', 0.06, 40); } },
  splat:    { gap: 0.08, fn: s => { s.fnoise(0.16, 0.1, 'lowpass', 900, 150, 2); s.tone(160, 0.12, 'sine', 0.06, 50); } },
  groan:    { gap: 0.4,  fn: s => s.groan(0.14, 0.75) },
  charge:   { gap: 0.5,  fn: s => { s.groan(0.16, 0.55); s.fnoise(0.9, 0.12, 'lowpass', 400, 1200, 1); } },
  lock:     { gap: 0.05, fn: s => { s.tone(1400, 0.05, 'square', 0.04); s.tone(1900, 0.06, 'square', 0.03, 0, 0.05); } },
};

const Sfx = {
  ctx: null,
  master: null,
  muted: U.storage.get('arena.muted', false),
  last: {},

  /** À appeler dans un geste utilisateur (exigence des navigateurs mobiles) */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.out = this.ctx.createGain();            // sortie générale (coupure du son)
      this.out.connect(this.ctx.destination);
      this.master = this.ctx.createGain();         // bus des bruitages
      this.master.connect(this.out);
      this.applyVolumes();
      if (typeof Music !== 'undefined') Music.attach(this.ctx, this.out);
    } catch (e) { this.ctx = null; }
  },

  applyVolumes() {
    if (!this.ctx) return;
    this.out.gain.value = this.muted ? 0 : 1;
    this.master.gain.value = 0.6 * (typeof Save !== 'undefined' ? Save.data.settings.sfx : 0.8);
    if (typeof Music !== 'undefined') Music.setVolume(typeof Save !== 'undefined' ? Save.data.settings.music : 0.5);
  },

  setMuted(m) { this.muted = m; U.storage.set('arena.muted', m); this.applyVolumes(); },

  play(name) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const snd = SOUNDS[name];
    if (!snd) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < snd.gap) return;
    this.last[name] = now;
    snd.fn(this);
  },

  tone(freq, dur, type = 'square', vol = 0.1, endFreq = 0, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  /** Bruit filtré (claquement, souffle, explosion) avec balayage de fréquence */
  fnoise(dur, vol, type = 'lowpass', f0 = 1000, f1 = 0, q = 0.8, delay = 0) {
    const c = this.ctx; this.noise(0, 0); // crée le tampon de bruit si besoin
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + delay;
    src.buffer = this.noiseBuf; src.loop = dur > 0.45;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.02);
  },
  /** Grognement de zombie : voix rauque (dent de scie + vibrato) passée dans un formant */
  groan(vol = 0.08, pitch = 1) {
    const c = this.ctx, t = c.currentTime, dur = 0.6 + Math.random() * 0.7, f0 = (70 + Math.random() * 40) * pitch;
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), bp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.2), t + dur);
    lfo.frequency.value = 5 + Math.random() * 4; lg.gain.value = f0 * 0.06; lfo.connect(lg); lg.connect(o.frequency);
    bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(500 + Math.random() * 250, t); bp.frequency.linearRampToValueAtTime(320, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp); bp.connect(g); g.connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },
  /** Grognement à distance (volume selon l'éloignement), sans anti-répétition */
  groanAt(vol, pitch) { if (!this.muted && this.ctx && this.ctx.state === 'running') this.groan(vol, pitch); },

  /** Ambiance continue : vent du désert (plus fort pendant les tempêtes), un peu plus sourd la nuit */
  ambience(wind, night) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.amb) {
      const c = this.ctx; this.noise(0, 0);
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      src.buffer = this.noiseBuf; src.loop = true; f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.7; g.gain.value = 0;
      lfo.frequency.value = 0.13; lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); // rafales
      src.connect(f); f.connect(g); g.connect(this.master); src.start(); lfo.start();
      this.amb = { f, g };
    }
    const t = this.ctx.currentTime;
    this.amb.g.gain.setTargetAtTime(0.035 + wind * 0.16, t, 0.6);
    this.amb.f.frequency.setTargetAtTime(380 + wind * 700 - night * 120, t, 0.6);
  },

  noise(dur, vol = 0.1) {
    const c = this.ctx;
    if (!this.noiseBuf) {
      const len = c.sampleRate * 0.5;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!(dur > 0)) return;
    const src = c.createBufferSource(), g = c.createGain(), t = c.currentTime;
    src.buffer = this.noiseBuf;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  },
};
