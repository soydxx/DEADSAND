'use strict';
/* Petites fonctions utilitaires partagées */

const TAU = Math.PI * 2;

const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  dist2: (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },

  /** entries : [[valeur, poids], ...] */
  weightedPick(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = Math.random() * total;
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  },

  /** Supprime en place les éléments pour lesquels keep() renvoie false */
  compact(arr, keep) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) if (keep(arr[i])) arr[j++] = arr[i];
    arr.length = j;
  },

  /** Vibration courte sur mobile (si activée dans les options) */
  haptic(ms) {
    try {
      if (typeof Save === 'undefined' || !Save.data.settings.vibrate || !navigator.vibrate) return;
      if (typeof Input !== 'undefined' && Input.mode !== 'touch') return;            // seulement sur écran tactile
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // le navigateur exige un geste préalable
      navigator.vibrate(ms);
    } catch (e) { /* ignoré */ }
  },

  /** 7 → "VII" */
  roman(n) {
    const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, s] of t) while (n >= v) { out += s; n -= v; }
    return out || 'N';
  },

  formatTime(s) {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  },

  // localStorage protégé (navigation privée, stockage bloqué…)
  storage: {
    get(key, def) {
      try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); }
      catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignoré */ }
    },
  },
};
