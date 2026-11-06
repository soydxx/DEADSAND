'use strict';
/* =====================================================================
   SAUVEGARDE (localStorage) : réserve de ferraille, atelier, personnages,
   succès, statistiques cumulées et options.
   ===================================================================== */

const Save = {
  KEY: 'deadsand.save',
  data: null,

  defaults() {
    return {
      bank: 0,                        // ferraille en réserve
      perm: {},                       // niveaux de l'atelier { id: niveau }
      chars: { survivor: true },      // personnages débloqués
      char: 'survivor',               // personnage choisi
      ach: {},                        // succès obtenus { id: date }
      stats: { kills: 0, bosses: 0, runs: 0 },
      settings: { quality: 'auto', sfx: 0.8, music: 0.5, vibrate: true },
      cos: { owned: {}, eq: {} },     // garage : objets achetés + équipés
      charKills: {},                  // zombies abattus par personnage (défis de tenues)
      name: '',                       // pseudo affiché avec le titre
    };
  },

  load() {
    const d = U.storage.get(this.KEY, null) || {};
    const def = this.defaults();
    this.data = Object.assign(def, d);
    this.data.settings = Object.assign(def.settings, d.settings || {});
    this.data.stats = Object.assign(def.stats, d.stats || {});
    if (!CHARACTERS[this.data.char] || !this.data.chars[this.data.char]) this.data.char = 'survivor';
  },

  save() { U.storage.set(this.KEY, this.data); },

  /** Qualité graphique effective ('high' | 'low') */
  quality() {
    const q = this.data.settings.quality;
    if (q !== 'auto') return q;
    return window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
  },
};
Save.load();
