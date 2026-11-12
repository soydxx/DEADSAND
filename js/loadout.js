'use strict';
/* =====================================================================
   CLASSES (création de classe, façon Call of Duty)
   Avant la partie, on choisit une classe : une arme principale, un équipement LÉTAL
   (touche G), un équipement TACTIQUE (touche F) et 3 ATOUTS (un par couleur).
   Les objets se débloquent avec le niveau de survivante (level).
   En partie, les établis améliorent l'arme principale (pièces) et l'équipement (niveaux).
   Sauvegarde : Save.data.classes = [{ name, primary, lethal, tactical, perks: [p1, p2, p3] }], Save.data.classSel
   ===================================================================== */

/* Armes principales. kind = famille (modèle 3D + pièces de l'établi) ; weapon = réglages du tir (fusils) ;
   look = pièces visibles d'office sur le modèle ; bars = caractéristiques affichées (0 à 1) */
const PRIMARIES = {
  rifle: { name: 'Fusil d\'assaut', icon: '🔫', kind: 'rifle', level: 1, desc: 'Polyvalent : bonne cadence, bonne portée.',
    weapon: {}, bars: { Dégâts: 0.45, Cadence: 0.5, Portée: 0.6, Mobilité: 0.6 } },
  smg: { name: 'Mitraillette', icon: '💨', kind: 'rifle', level: 3, desc: 'Cadence folle mais courte portée. +8 % de vitesse de course.',
    weapon: { damage: 6.5, fireRate: 5.6, range: 240, projSpeed: 620, spread: 0.1, critChance: 0.04 }, speed: 1.08, look: { mag: 1, laser: 1 },
    bars: { Dégâts: 0.25, Cadence: 0.95, Portée: 0.3, Mobilité: 0.9 } },
  shotgun: { name: 'Fusil à pompe', icon: '💢', kind: 'shotgun', level: 1, desc: 'Salve de plombs en éventail, dévastatrice de près.',
    bars: { Dégâts: 0.85, Cadence: 0.25, Portée: 0.25, Mobilité: 0.55 } },
  sniper: { name: 'Fusil de précision', icon: '🎯', kind: 'rifle', level: 8, desc: 'Lent, mais chaque balle traverse 2 zombies et frappe très fort.',
    weapon: { damage: 42, fireRate: 0.95, range: 560, projSpeed: 980, pierce: 2, critChance: 0.15, critMult: 2.5, knockback: 220, projRadius: 5 }, speed: 0.95,
    look: { scope: 3, barrel: 2 }, bars: { Dégâts: 1, Cadence: 0.12, Portée: 1, Mobilité: 0.4 } },
  flamer: { name: 'Lance-flammes', icon: '🔥', kind: 'flamer', level: 12, desc: 'Cône de flammes continu qui brûle toute la horde devant vous.',
    bars: { Dégâts: 0.7, Cadence: 1, Portée: 0.15, Mobilité: 0.5 } },
};
/* Armes secondaires (arme de poing, comme dans Call of Duty) : on passe de l'une à l'autre
   avec la touche « Changer d'arme » (R, molette, touche 2, ou en touchant sa case).
   Avec l'arme secondaire en main, on court plus vite (speed) : utile pour fuir, rejoindre un objectif,
   ou tirer de loin quand l'arme principale porte court (pompe, lance-flammes).
   weapon = réglages du tir (dégâts / cadence de base dans WEAPONS[id].stats, niveaux à l'établi) */
const SECONDARIES = {
  pistol: { name: 'Pistolet', icon: '🔫', level: 1, speed: 1.15, desc: 'Toujours prêt. +15 % de vitesse de course quand il est en main.',
    weapon: { range: 340, projSpeed: 720, critChance: 0.08 } },
  revolver: { name: 'Revolver', icon: '🤠', level: 5, speed: 1.1, desc: 'Lent mais très puissant, chaque balle traverse un zombie. +10 % de vitesse.',
    weapon: { range: 400, projSpeed: 820, pierce: 1, critChance: 0.2, critMult: 2.2, knockback: 190, projRadius: 4.8 }, sfx: 'shotgun' },
  mpistol: { name: 'Pistolet-mitrailleur', icon: '⚡', level: 7, speed: 1.12, desc: 'Rafales rapides à courte portée. +12 % de vitesse.',
    weapon: { range: 250, projSpeed: 650, projRadius: 3.6, critChance: 0.04, jitter: 0.09 } },
  flaregun: { name: 'Lance-fusées', icon: '🎆', level: 10, speed: 1.1, desc: 'La fusée enflamme le sol à l\'impact (2,5 s). +10 % de vitesse.',
    weapon: { range: 330, projSpeed: 520, projRadius: 5.5, critChance: 0.05, flare: true } },
};
const LETHALS = {
  grenade: { level: 1, desc: 'Explosion de zone, lancée vers la cible ou la souris.' },
  molotov: { level: 3, desc: 'Petite explosion puis un brasier qui brûle 5 s.' },
  mines: { level: 5, desc: 'Posée au sol, explose au passage d\'un zombie (3 max, 30 s).' },
};
const TACTICALS = {
  drone: { level: 1, desc: 'Un drone tourne autour de vous et tire tout seul.' },
  turretkit: { level: 4, desc: 'Pose une tourelle automatique devant vous.' },
  wirekit: { level: 9, desc: 'Déroule des barbelés qui ralentissent et blessent la horde.' },
};
/* Atouts : un par couleur (comme les 3 emplacements d'atouts) */
const PERKS = [
  [ // atout 1 · bleu
    { id: 'light', icon: '👟', name: 'Pieds légers', desc: '+12 % de vitesse', level: 1, apply: p => { p.speed *= 1.12; } },
    { id: 'vest', icon: '🦺', name: 'Gilet renforcé', desc: '+30 PV max', level: 1, apply: p => { p.maxHp += 30; p.hp = p.maxHp; } },
    { id: 'scav', icon: '🔩', name: 'Récupérateur', desc: '+15 % de ferraille ramassée', level: 4, apply: p => { p.scrapMult *= 1.15; } },
  ],
  [ // atout 2 · rouge
    { id: 'hands', icon: '✋', name: 'Main sûre', desc: '+15 % de cadence de tir', level: 1, apply: p => { p.weapon.fireRate *= 1.15; p.rateMult = 1.15; } },
    { id: 'ap', icon: '📌', name: 'Perforant', desc: 'Les balles traversent +1 zombie', level: 2, apply: p => { p.weapon.pierce += 1; p.extraPierce = 1; } },
    { id: 'demo', icon: '💥', name: 'Démolition', desc: '+35 % de dégâts d\'explosion', level: 6, apply: p => { p.demoMult = 1.35; } },
  ],
  [ // atout 3 · jaune
    { id: 'wind', icon: '🌀', name: 'Second souffle', desc: '+1 charge de roulade', level: 1, apply: p => { p.staminaMax += 1; p.stamina += 1; } },
    { id: 'eng', icon: '🛠️', name: 'Ingénieur', desc: 'Létal et tactique se rechargent 30 % plus vite', level: 3, apply: p => { p.equipCd = 0.7; } },
    { id: 'tough', icon: '🪨', name: 'Coriace', desc: '−2 dégâts subis par coup', level: 9, apply: p => { p.armor += 2; } },
  ],
];
const PERK_COLORS = ['#3ab8ff', '#ff5a4a', '#ffc21a'];
/* Une seule classe toute prête au départ ; le joueur en crée d'autres avec « + » (MAX_CLASSES au plus) */
const DEFAULT_CLASS = { name: 'Classe 1', primary: 'rifle', secondary: 'pistol', lethal: 'grenade', tactical: 'drone', perks: ['light', 'hands', 'wind'] };
const DEFAULT_CLASSES = [DEFAULT_CLASS];
const MAX_CLASSES = 5;

const Loadout = {
  level() { return Progress.unlockLevel(); }, // après un prestige, tout reste débloqué
  open(item) { return !item || (item.level || 1) <= this.level(); },
  perk(slot, id) { return PERKS[slot].find(p => p.id === id); },
  classes() {
    const S = Save.data;
    // ancien format (3 classes toutes faites) : on ne garde que la classe utilisée
    if (S.classesV !== 2) {
      const keep = Array.isArray(S.classes) && S.classes[S.classSel || 0];
      S.classes = [keep ? Object.assign({}, keep, { name: keep.name === 'Assaut' ? 'Classe 1' : keep.name }) : JSON.parse(JSON.stringify(DEFAULT_CLASS))];
      S.classSel = 0; S.classesV = 2;
    }
    if (!Array.isArray(S.classes) || !S.classes.length) S.classes = [JSON.parse(JSON.stringify(DEFAULT_CLASS))];
    if (!(S.classSel >= 0 && S.classSel < S.classes.length)) S.classSel = 0;
    return S.classes;
  },
  /** Classe choisie, corrigée si un objet n'est plus disponible (niveau insuffisant, objet retiré) */
  current() {
    const c = this.classes()[Save.data.classSel], d = DEFAULT_CLASS;
    const ok = (tbl, id, def) => (tbl[id] && this.open(tbl[id]) ? id : def);
    return {
      name: c.name || 'Classe',
      primary: ok(PRIMARIES, c.primary, d.primary), secondary: ok(SECONDARIES, c.secondary, d.secondary), lethal: ok(LETHALS, c.lethal, d.lethal), tactical: ok(TACTICALS, c.tactical, d.tactical),
      perks: [0, 1, 2].map(i => { const pk = this.perk(i, (c.perks || [])[i]); return pk && this.open(pk) ? pk.id : d.perks[i]; }),
    };
  },
  /** Nouvelle classe (copie de la classe de départ), aussitôt sélectionnée */
  add() {
    const list = this.classes(); if (list.length >= MAX_CLASSES) return false;
    list.push(Object.assign(JSON.parse(JSON.stringify(DEFAULT_CLASS)), { name: `Classe ${list.length + 1}` }));
    Save.data.classSel = list.length - 1; Save.save(); return true;
  },
  remove(i) {
    const list = this.classes(); if (list.length <= 1) return false;
    list.splice(i, 1); Save.data.classSel = Math.min(Save.data.classSel, list.length - 1); Save.save(); return true;
  },
  set(field, value, slot) {
    const c = this.classes()[Save.data.classSel];
    if (field === 'perk') { c.perks = c.perks || []; c.perks[slot] = value; } else c[field] = value;
    Save.save();
  },

  /* ---------------- début de partie ---------------- */
  /** Réglages de l'arme principale : AVANT les bonus du personnage et des atouts */
  applyPrimary(p, L) {
    const P = PRIMARIES[L.primary];
    Object.assign(p.weapon, P.weapon || {});
    if (P.speed) p.speed *= P.speed;
  },
  applyPerks(p, L) { L.perks.forEach((id, i) => { const pk = this.perk(i, id); if (pk) pk.apply(p); }); },
  /** Arme principale + équipements dans la partie */
  equip(g, L) {
    g.loadout = L; g.primary = L.primary;
    const P = PRIMARIES[L.primary];
    g.primaryKind = P.kind;
    g.active = P.kind; // 'rifle' (fusils), 'shotgun' ou 'flamer'
    if (P.kind !== 'rifle') g.weapons[P.kind] = { lvl: 1, t: 0, evo: false, aux: [] };
    g.secondary = L.secondary; g.swapT = 0;
    for (const id of [L.secondary, L.lethal, L.tactical]) { g.weapons[id] = { lvl: 1, t: 0, evo: false, aux: [] }; g.upLevels['w_' + id] = 1; }
  },

  /* ---------------- arme secondaire ---------------- */
  /** Passe à l'arme principale ou secondaire (to absent : on alterne). Petit délai pendant lequel on ne tire pas. */
  swap(g, to) {
    const p = g.player;
    if (!g.secondary || !p || p.inside || g.state !== 'playing') return false;
    const cur = g.active === 'secondary' ? 'secondary' : 'primary';
    to = to || (cur === 'primary' ? 'secondary' : 'primary');
    if (to === cur) return false;
    g.active = to === 'secondary' ? 'secondary' : g.primaryKind;
    g.swapT = 0.3;
    if (g.tut) g.tut.swapped = true;
    Sfx.play('reload');
    return true;
  },
  /** Vitesse de course selon l'arme en main */
  speedMult(g) { return g.active === 'secondary' && g.secondary ? SECONDARIES[g.secondary].speed : 1; },
  /** Réglages de tir de l'arme secondaire (recalculés à chaque image : niveau de l'établi, bonus du personnage) */
  secWeapon(g) {
    const id = g.secondary, S = SECONDARIES[id], w = g.weapons[id], p = g.player;
    const st = WEAPONS[id].stats(w ? w.lvl : 1), o = g._sw || (g._sw = {});
    Object.assign(o, CONFIG.player.weapon, { projCount: 1, pierce: 0, jitter: 0, flare: false }, S.weapon);
    o.damage = st.dmg * (p.charDmg || 1);
    o.fireRate = st.rate * (p.rateMult || 1);
    o.pierce += p.extraPierce || 0;
    return o;
  },
  /** Pièces visibles : celles achetées + celles de base de l'arme (mitraillette, fusil de précision) */
  displayMods(g, kind) {
    const bought = (g && g.gunMods && g.gunMods[kind]) || {}, P = PRIMARIES[g && g.primary] || PRIMARIES[this.current().primary];
    if (!P || P.kind !== kind || !P.look) return bought;
    const out = Object.assign({}, P.look);
    for (const [k, v] of Object.entries(bought)) out[k] = Math.max(out[k] || 0, v);
    return out;
  },

  /* ---------------- en partie : touches G (létal) et F (tactique) ---------------- */
  useLethal(g) {
    const id = g.loadout && g.loadout.lethal, w = id && g.weapons[id];
    if (!w) return false;
    const ok = id === 'mines' ? Weapons.placeMine(g) : Weapons.throwGrenade(g, id);
    if (!ok) Sfx.play('click');
    else if (g.tut) g.tut.lethal = true;
    return ok;
  },
  useTactical(g) {
    const id = g.loadout && g.loadout.tactical, w = id && g.weapons[id], p = g.player;
    if (!w || WEAPONS[id].type !== 'manual') return false;
    if (w.t > 0 || p.inside) { Sfx.play('click'); return false; }
    const s = WEAPONS[id].stats(w.lvl), a = p.aimAngle, x = p.x + Math.cos(a) * 46, y = p.y + Math.sin(a) * 46;
    if (World.solidAt(x, y)) { Entities.addText(g, p.x, p.y - 30, 'Pas de place ici', '#ff6a5a', 13); return false; }
    if (id === 'turretkit') { Allies.addTurret(g, x, y, s.life); if (w.evo) Allies.addTurret(g, x + Math.cos(a + 1.57) * 44, y + Math.sin(a + 1.57) * 44, s.life); }
    else { Allies.addTrap(g, x, y); if (w.evo) Allies.addTrap(g, x + Math.cos(a + 1.57) * 50, y + Math.sin(a + 1.57) * 50); }
    w.t = w.cdMax = s.cd * (p.equipCd || 1);
    Entities.puff(g, x, y, 5, 12, true); Sfx.play('mine');
    return true;
  },
};
