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
];
const runModsChosen = () => { const s = (Save.data.settings.runMods) || {}; return RUN_MODS.filter(m => s[m.id]); };
const runModsBonus = list => list.reduce((a, m) => a + m.bonus, 0);

/** Rex le chien : rejoint la survivante au niveau 6, mord plus fort aux niveaux 15 et 30 */
const DOG_LEVELS = [6, 15, 30];
const dogLevel = () => DOG_LEVELS.filter(l => Progress.unlockLevel() >= l).length;

/* NIVEAUX D'ARMES : chaque arme de classe (principale ou secondaire) gagne un niveau avec ses éliminations
   (cumulées d'une partie à l'autre, celles de la partie en cours comptent tout de suite).
   Le niveau d'arme débloque les pièces avancées de l'établi : niveau III d'une pièce au niveau d'arme 3,
   niveau IV (« Calibre » / « Pression ») au niveau d'arme 5.
   Sauvegarde : Save.data.wstats = { id: { kills, crits } } */
const WLEVELS = [0, 40, 120, 250, 450, 700, 1000, 1400, 1900, 2500]; // éliminations pour atteindre les niveaux 1 → 10
const PART_REQ = [1, 1, 1, 3, 5];                                   // niveau d'arme requis pour monter une pièce au niveau 0,I,II,III,IV
/* Défis d'armes : débloquent des camouflages (cosmetics.js, wchal) */
const wName = id => (PRIMARIES[id] || SECONDARIES[id] || { name: id }).name;

/* PRESTIGE : au niveau 50, on peut repartir au niveau 1 en gardant tout ce qui est débloqué.
   Insigne ⭐ à côté du niveau, 500 🔩, et des récompenses exclusives (camouflages, titre). Save.data.prestige */
const PRESTIGE = { max: 10, bank: 500 };

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
  prestige() { return Save.data.prestige || 0; },
  /** Niveau qui compte pour les déblocages : après un prestige, tout reste débloqué */
  unlockLevel() { return this.prestige() ? LEVELS.max : this.level(); },
  canPrestige() { return this.level() >= LEVELS.max && this.prestige() < PRESTIGE.max; },
  doPrestige() {
    if (!this.canPrestige()) return false;
    const S = Save.data;
    S.prestige = this.prestige() + 1; S.level = 1; S.xp = 0; S.bank += PRESTIGE.bank;
    Save.save(); Cosmetics.version++;
    return true;
  },

  /* ---------------- niveaux d'armes ---------------- */
  wstats() {
    const S = Save.data;
    if (!S.wstats) { // première fois : l'arme utilisée jusqu'ici reçoit une partie des éliminations passées
      S.wstats = {};
      const id = Loadout.current().primary; S.wstats[id] = { kills: Math.min((S.stats && S.stats.kills) || 0, 450), crits: 0 };
    }
    return S.wstats;
  },
  /** Éliminations d'une arme (sauvegardées + partie en cours si g) */
  wKills(id, g, stat = 'kills') {
    const s = this.wstats()[id], r = g && g.stats && g.stats.wk && g.stats.wk[id];
    return ((s && s[stat]) || 0) + ((r && r[stat]) || 0);
  },
  wLevelOf(kills) {
    let l = 1; while (l < WLEVELS.length && kills >= WLEVELS[l]) l++;
    const max = l >= WLEVELS.length;
    return { lvl: l, kills, next: max ? null : WLEVELS[l], prev: WLEVELS[l - 1], max };
  },
  wLevel(id, g) { return this.wLevelOf(this.wKills(id, g)); },
  /** Arme de classe qui a fait l'élimination (src des dégâts) */
  weaponOf(g, src) {
    if (SECONDARIES[src]) return src;
    if (src === 'rifle' || src === 'shotgun' || src === 'flamer') return g.primary || null;
    return null;
  },
  /** Élimination : compte pour l'arme, annonce les montées de niveau en pleine partie */
  onWeaponKill(g, src, crit) {
    if (g.tut) return;
    const id = this.weaponOf(g, src); if (!id) return;
    const W = g.stats.wk || (g.stats.wk = {}), r = W[id] || (W[id] = { kills: 0, crits: 0 });
    const before = this.wLevel(id, g).lvl;
    r.kills++; if (crit) r.crits++;
    const after = this.wLevel(id, g).lvl;
    if (after > before) {
      const unlock = after === 3 ? ' · pièces niveau III débloquées' : after === 5 ? ' · pièces niveau IV débloquées' : '';
      UI.toast(`⬆️ ${wName(id)} · niveau ${after} !`, `Niveau d'arme${unlock}`);
      Sfx.play('unlock');
    }
  },
  /** Défi d'arme (camouflage) : { w: id | 'sec' | 'any', stat: 'kills' | 'crits' | 'level', n } */
  wchal(c, g) {
    let have;
    if (c.stat === 'level') have = Math.max(...[...Object.keys(PRIMARIES), ...Object.keys(SECONDARIES)].map(id => this.wLevel(id, g).lvl));
    else if (c.w === 'sec') have = Object.keys(SECONDARIES).reduce((a, id) => a + this.wKills(id, g, c.stat), 0);
    else have = this.wKills(c.w, g, c.stat);
    return { have: Math.min(have, c.n), n: c.n, done: have >= c.n };
  },

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
    // niveaux d'armes + camouflages débloqués par les défis d'armes pendant la partie
    const camos = COSMETICS.filter(c => c.wchal), had = new Set(camos.filter(c => Cosmetics.owned(c)).map(c => c.id));
    res.weapons = [];
    const WS = this.wstats();
    for (const [id, r] of Object.entries((g.stats && g.stats.wk) || {})) {
      const l0 = this.wLevel(id).lvl, s = WS[id] || (WS[id] = { kills: 0, crits: 0 });
      s.kills += r.kills; s.crits += r.crits;
      res.weapons.push({ id, name: wName(id), kills: r.kills, lvl0: l0, lvl1: this.wLevel(id).lvl });
    }
    res.camos = camos.filter(c => !had.has(c.id) && Cosmetics.owned(c));
    if (res.camos.length) Cosmetics.version++;
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
      res.levels.push({ lvl, bank: b, items: this.prestige() ? [] : COSMETICS.filter(c => c.level === lvl) }); // après un prestige, tout est déjà débloqué
    }
    if (lvl >= LEVELS.max) cur = Math.min(cur, LEVELS.xpFor(lvl));
    S.level = lvl; S.xp = cur;
    res.lvl1 = lvl; res.xp1 = cur;
    if (res.levels.some(l => l.items.length)) Cosmetics.version++;
    return res;
  },
  /** Prochain objet débloqué par niveau (pour donner envie) */
  nextUnlock() { const l = this.unlockLevel(); return COSMETICS.filter(c => c.level > l).sort((a, b) => a.level - b.level)[0] || null; },
};
