'use strict';
/* =====================================================================
   PROGRESSION ENTRE LES PARTIES
   - Niveau de survivante (1 → 50) : de l'expérience à chaque partie, même perdue.
     Chaque niveau rapporte de la ferraille en réserve ; certains débloquent un objet du
     Garage (COSMETICS avec level: N, voir cosmetics.js).
   - Missions : 3 quotidiennes + 1 hebdomadaire, tirées de la date (les mêmes pour tous),
     qui avancent à la fin de chaque partie. Récompense : réserve + expérience.
   Sauvegarde : Save.data.level, Save.data.xp, Save.data.missions
   ===================================================================== */
/* Règles de partie choisies dans la Préparation : plus dur, mais plus de ferraille et d'XP */
const RUN_MODS = [
  { id: 'fast', icon: '🏃', name: 'Zombies enragés', desc: '+30 % de vitesse', bonus: 0.25 },
  { id: 'elites', icon: '👑', name: 'Élites partout', desc: 'Beaucoup plus d\'élites dorés', bonus: 0.2 },
  { id: 'night', icon: '🌙', name: 'Nuit éternelle', desc: 'Toutes les vagues de nuit', bonus: 0.2 },
  { id: 'storm', icon: '🌪️', name: 'Tempêtes', desc: 'Une tempête de sable à chaque vague', bonus: 0.15 },
  { id: 'noshelter', icon: '🚪', name: 'Refuges fermés', desc: 'Impossible d\'entrer dans les refuges', bonus: 0.3 },
  { id: 'fragile', icon: '💔', name: 'Fragile', desc: 'Moitié moins de vie', bonus: 0.4 },
  { id: 'shotgun', icon: '💢', name: 'Fusil à pompe imposé', desc: 'Pas de fusil d\'assaut', bonus: 0.15 },
];
const runModsChosen = () => { const s = (Save.data.settings.runMods) || {}; return RUN_MODS.filter(m => s[m.id]); };
const runModsBonus = list => list.reduce((a, m) => a + m.bonus, 0);

const LEVELS = {
  max: 50,
  xpFor: l => 150 + (l - 1) * 60,      // XP pour passer du niveau l au niveau l+1
  bank: l => 40 + l * 10,              // ferraille offerte en atteignant le niveau l
};
/* Expérience d'une partie */
const runXp = g => Math.round(g.stats.kills + g.wave.num * 20 + (g.parts || 0) * 50 + g.stats.bosses * 60
  + (g.stats.challenges || 0) * 30 + (g.stats.chests || 0) * 15 + (g.victory ? 300 : 0));

/* Missions. mode 'sum' : s'additionne de partie en partie ; 'max' : meilleure partie */
const MISSION_POOL = [
  { id: 'kills', icon: '🧟', text: n => `Abattre ${n} zombies`, vals: [150, 250, 400], mode: 'sum', stat: g => g.stats.kills },
  { id: 'wave', icon: '🌊', text: n => `Atteindre la vague ${n}`, vals: [6, 8, 10], mode: 'max', stat: g => g.wave.num },
  { id: 'barrels', icon: '🛢️', text: n => `Faire exploser ${n} fûts`, vals: [8, 15, 25], mode: 'sum', stat: g => g.stats.barrels },
  { id: 'bosses', icon: '💀', text: n => `Vaincre ${n} boss`, vals: [1, 2, 3], mode: 'sum', stat: g => g.stats.bosses },
  { id: 'combo', icon: '🔗', text: n => `Faire une série de ${n} éliminations`, vals: [30, 50, 80], mode: 'max', stat: g => g.stats.bestCombo || 0 },
  { id: 'parts', icon: '🔧', text: n => `Monter ${n} pièces aux établis`, vals: [3, 6, 10], mode: 'sum', stat: g => g.stats.mods || 0 },
  { id: 'challenges', icon: '⚡', text: n => `Réussir ${n} défis de vague`, vals: [2, 4, 6], mode: 'sum', stat: g => g.stats.challenges || 0 },
  { id: 'carparts', icon: '🚗', text: n => `Récupérer ${n} pièces de voiture`, vals: [2, 3, 4], mode: 'sum', stat: g => g.parts || 0 },
  { id: 'rolls', icon: '🌀', text: n => `Faire ${n} roulades`, vals: [60, 120, 200], mode: 'sum', stat: g => g.stats.rolls },
  { id: 'chests', icon: '🎁', text: n => `Ouvrir ${n} coffres dorés`, vals: [2, 4, 6], mode: 'sum', stat: g => g.stats.chests || 0 },
  { id: 'char', icon: '🧍', text: (n, m) => `Atteindre la vague ${n} avec ${CHARACTERS[m.char].name}`, vals: [5, 7, 9], mode: 'max', stat: (g, m) => (g.charId === m.char ? g.wave.num : 0), char: true },
];
const WEEKLY_POOL = [
  { id: 'w_kills', icon: '🧟', text: n => `Abattre ${n} zombies cette semaine`, vals: [2000], mode: 'sum', stat: g => g.stats.kills },
  { id: 'w_escape', icon: '🚗', text: () => 'Réparer la voiture et vous évader', vals: [1], mode: 'sum', stat: g => (g.victory ? 1 : 0) },
  { id: 'w_wave', icon: '🌊', text: n => `Atteindre la vague ${n}`, vals: [15], mode: 'max', stat: g => g.wave.num },
  { id: 'w_chests', icon: '🎁', text: n => `Ouvrir ${n} coffres dorés`, vals: [15], mode: 'sum', stat: g => g.stats.chests || 0 },
  { id: 'w_bosses', icon: '💀', text: n => `Vaincre ${n} boss`, vals: [8], mode: 'sum', stat: g => g.stats.bosses },
];
const MISSION_REWARD = [{ bank: 60, xp: 80 }, { bank: 100, xp: 120 }, { bank: 150, xp: 180 }];
const WEEKLY_REWARD = { bank: 400, xp: 400 };

const Progress = {
  level() { return Save.data.level || 1; },
  xp() { return Save.data.xp || 0; },

  /* ---------------- missions ---------------- */
  dayKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  weekKey(d = new Date()) { const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return this.dayKey(m); }, // lundi de la semaine
  rng(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) | 0; return () => { s = (s * 1103515245 + 12345) | 0; return ((s >>> 8) & 0xffff) / 65536; }; },
  missions() {
    const S = Save.data, day = this.dayKey(), week = this.weekKey();
    const M = S.missions = S.missions || {};
    if (M.day !== day) {
      const R = this.rng('d' + day), pool = [...MISSION_POOL], out = [];
      const owned = Object.keys(CHARACTERS).filter(charOwned);
      while (out.length < 3 && pool.length) {
        const def = pool.splice(Math.floor(R() * pool.length), 1)[0], tier = Math.floor(R() * def.vals.length);
        const m = { id: def.id, tier, n: def.vals[tier], prog: 0, done: false };
        if (def.char) m.char = owned[Math.floor(R() * owned.length)];
        out.push(m);
      }
      M.day = day; M.daily = out;
    }
    if (M.week !== week) {
      const R = this.rng('w' + week), def = WEEKLY_POOL[Math.floor(R() * WEEKLY_POOL.length)];
      M.week = week; M.weekly = { id: def.id, tier: 0, n: def.vals[0], prog: 0, done: false, weekly: true };
    }
    return M;
  },
  def(m) { return (m.weekly ? WEEKLY_POOL : MISSION_POOL).find(d => d.id === m.id); },
  text(m) { return this.def(m).text(m.n, m); },
  reward(m) { return m.weekly ? WEEKLY_REWARD : MISSION_REWARD[m.tier]; },
  /** Temps restant avant renouvellement (texte) */
  left(weekly) {
    const now = new Date(), end = new Date(now); end.setHours(24, 0, 0, 0);
    if (weekly) end.setDate(end.getDate() + ((7 - ((now.getDay() + 6) % 7)) - 1));
    const h = Math.max(0, Math.round((end - now) / 3600000));
    return h >= 48 ? `${Math.round(h / 24)} j` : `${h} h`;
  },

  /* ---------------- fin de partie : XP, niveaux, missions ---------------- */
  onRunEnd(g) {
    const S = Save.data, M = this.missions(), res = { missions: [], levels: [], unlocks: [], bank: 0 };
    res.lvl0 = this.level(); res.xp0 = this.xp();
    let xp = Math.round(runXp(g) * (1 + (g.modBonus || 0))); // règles choisies : bonus d'XP
    res.runXp = xp;
    for (const m of [...M.daily, M.weekly]) {
      if (m.done) continue;
      const v = this.def(m).stat(g, m) || 0;
      m.prog = this.def(m).mode === 'sum' ? m.prog + v : Math.max(m.prog, v);
      if (m.prog >= m.n) {
        m.done = true; m.prog = m.n;
        const r = this.reward(m);
        S.bank += r.bank; res.bank += r.bank; xp += r.xp;
        res.missions.push({ text: this.text(m), icon: this.def(m).icon, ...r, weekly: !!m.weekly });
      }
    }
    res.xpTotal = xp;
    // montée de niveau(x)
    let lvl = this.level(), cur = this.xp() + xp;
    while (lvl < LEVELS.max && cur >= LEVELS.xpFor(lvl)) {
      cur -= LEVELS.xpFor(lvl); lvl++;
      const b = LEVELS.bank(lvl); S.bank += b; res.bank += b;
      res.levels.push({ lvl, bank: b, items: COSMETICS.filter(c => c.level === lvl) });
    }
    if (lvl >= LEVELS.max) cur = Math.min(cur, LEVELS.xpFor(lvl));
    S.level = lvl; S.xp = cur;
    res.lvl1 = lvl; res.xp1 = cur;
    if (res.levels.some(l => l.items.length)) Cosmetics.version++;
    return res;
  },
  /** Prochain objet débloqué par niveau (pour donner envie) */
  nextUnlock() { const l = this.level(); return COSMETICS.filter(c => c.level > l).sort((a, b) => a.level - b.level)[0] || null; },
};
