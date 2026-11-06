'use strict';
/* =====================================================================
   DÉFI DU JOUR : la même partie pour tout le monde ce jour-là.
   Deux règles spéciales tirées au sort à partir de la date (identiques
   pour tous les joueurs le même jour). Meilleurs scores gardés sur l'appareil.
   ===================================================================== */
const DAILY_MODS = [
  { id: 'night', icon: '🌙', name: 'Nuit éternelle', desc: 'Toutes les vagues se jouent de nuit' },
  { id: 'storm', icon: '🌪️', name: 'Saison des tempêtes', desc: 'Une tempête de sable à chaque vague' },
  { id: 'shotgun', icon: '💢', name: 'Fusil à pompe imposé', desc: 'Départ au fusil à pompe, sans fusil d\'assaut' },
  { id: 'fast', icon: '💨', name: 'Zombies enragés', desc: 'Les zombies courent 30 % plus vite' },
  { id: 'fragile', icon: '🩸', name: 'Fragile mais riche', desc: 'Moitié moins de vie, ferraille ×2' },
  { id: 'barrels', icon: '🛢️', name: 'Poudrière', desc: 'Trois fois plus de fûts explosifs' },
  { id: 'elites', icon: '👑', name: 'Ruée vers l\'or', desc: 'Beaucoup plus de zombies élites' },
  { id: 'noshelter', icon: '🚪', name: 'Portes condamnées', desc: 'Les refuges restent fermés' },
];

const Daily = {
  key(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  /** Règles du jour : 2 modificateurs distincts tirés à partir de la date */
  today() {
    const key = this.key();
    let h = 2166136261; for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
    const pool = DAILY_MODS.slice(), mods = [];
    while (mods.length < 2) mods.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return { key, mods };
  },
  modsSet() { const o = {}; for (const m of this.today().mods) o[m.id] = true; return o; },
  best(key = this.key()) { return (Save.data.daily || {})[key] || null; },
  /** Enregistre le score du jour (garde le meilleur) ; renvoie true si c'est un record du jour */
  record(score, wave) {
    const D = Save.data.daily = Save.data.daily || {}, k = this.key(), prev = D[k];
    const isBest = !prev || score > prev.score;
    if (isBest) D[k] = { score, wave };
    const keys = Object.keys(D).sort(); while (keys.length > 30) delete D[keys.shift()];
    Save.save();
    return isBest;
  },
  /** Les 7 derniers jours joués */
  history() { return Object.entries(Save.data.daily || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7); },
};
