'use strict';
/* =====================================================================
   ÉTABLI D'ARMURIER : des établis sont posés sur la carte (un ou deux par zone).
   Près d'un établi, « Améliorer » met la partie en pause et ouvre l'armurier :
   l'arme tourne en 3D, chaque pièce achetée apparaît sur le modèle
   (lunette → portée, canon → cadence, chargeur → dégâts…).
   Les pièces se paient avec la ferraille de la partie (3 niveaux par pièce).
   Onglet « Peinture » : peintures d'armes du Garage, aperçu en direct.
   Onglet « Armes » : acheter les armes secondaires, les monter de niveau, les faire évoluer.
   Règle pour le joueur : l'Entraînement améliore la survivante, les établis ses armes,
   les refuges sa survie.
   Pièces visibles : voir applyGunMods() dans render3d.js.
   ===================================================================== */

/** Établis sur la carte (zone = s'ouvre avec la zone). big : l'Armurerie du centre commercial */
const BENCHES = MAP.benches; // emplacements propres à chaque carte (world.js)
for (const b of BENCHES) MAP.props.push({ model: 'p_bench', x: b.x, y: b.y, w: b.big ? 84 : 56, d: b.big ? 30 : 26, rot: b.rot, bench: true });

const GUN_COST = [50, 100, 170]; // prix des niveaux 1, 2, 3 d'une pièce (ferraille de la partie)
/* Onglet « Armes » (ferraille de la partie) */
const WEAPON_SHOP = {
  buy: 150,                    // nouvelle arme secondaire (niveau 1)
  level: l => 70 + l * 40,     // passer du niveau l au niveau l+1
  evo: 280,                    // évolution, quand l'arme est au niveau max
};

/* Pièces par arme. lv : nom de la pièce montée à chaque niveau (0 = d'origine) */
const GUN_PARTS = {
  rifle: {
    name: 'Fusil d\'assaut', icon: '🔫',
    parts: [
      { id: 'scope', icon: '🔭', name: 'Lunette', stat: 'Portée', fx: '+15 % de portée',
        lv: ['Hausse métallique', 'Viseur point rouge', 'Lunette ×4', 'Lunette de tireur d\'élite'],
        apply: p => { p.weapon.range *= 1.15; } },
      { id: 'barrel', icon: '🔩', name: 'Canon', stat: 'Cadence', fx: '+12 % de cadence de tir',
        lv: ['Canon court', 'Canon ventilé', 'Canon allégé à rainures', 'Triple canon rotatif'],
        apply: p => { p.weapon.fireRate *= 1.12; } },
      { id: 'mag', icon: '💥', name: 'Chargeur', stat: 'Dégâts', fx: '+12 % de dégâts',
        lv: ['Chargeur standard', 'Chargeur long', 'Chargeurs jumelés', 'Chargeur tambour'],
        apply: p => { p.weapon.damage *= 1.12; } },
      { id: 'muzzle', icon: '📌', name: 'Bouche', stat: 'Perforation', fx: 'Les balles traversent +1 zombie',
        lv: ['Sans embout', 'Cache-flamme', 'Compensateur', 'Frein de bouche + baïonnette'],
        apply: p => { p.weapon.pierce += 1; } },
      { id: 'laser', icon: '🎯', name: 'Rail', stat: 'Critique', fx: '+6 % de coups critiques',
        lv: ['Rail nu', 'Pointeur laser', 'Laser + lampe', 'Laser vert de précision'],
        apply: p => { p.weapon.critChance += 0.06; } },
    ],
  },
  shotgun: {
    name: 'Fusil à pompe', icon: '💢',
    parts: [
      { id: 'barrel', icon: '🔭', name: 'Canons', stat: 'Portée', fx: '+15 % de portée',
        lv: ['Canons sciés', 'Canons longs', 'Bande ventilée', 'Canons de chasse'] },
      { id: 'pump', icon: '🔧', name: 'Pompe', stat: 'Cadence', fx: '+12 % de cadence',
        lv: ['Pompe en bois', 'Pompe striée', 'Pompe en acier', 'Pompe à ressort + tube'] },
      { id: 'shells', icon: '🧨', name: 'Cartouchière', stat: 'Plombs', fx: '+1 plomb par tir',
        lv: ['Sans cartouchière', '4 cartouches', '8 cartouches', 'Cartouches magnum'] },
    ],
  },
  flamer: {
    name: 'Lance-flammes', icon: '🔥',
    parts: [
      { id: 'nozzle', icon: '🔭', name: 'Buse', stat: 'Portée', fx: '+12 % de portée',
        lv: ['Buse courte', 'Buse longue', 'Buse évasée', 'Buse à cage de refroidissement'] },
      { id: 'tank', icon: '🛢️', name: 'Réservoir', stat: 'Dégâts', fx: '+15 % de dégâts',
        lv: ['Réservoir simple', 'Grand réservoir', 'Double réservoir', 'Double réservoir sous pression'] },
      { id: 'igniter', icon: '⚡', name: 'Allumeur', stat: 'Largeur', fx: 'Cône de flammes +12 %',
        lv: ['Veilleuse', 'Bobine d\'allumage', 'Double bobine', 'Anneau à plasma'] },
    ],
  },
};

const Gunsmith = {
  init(g) { g.gunMods = { rifle: {}, shotgun: {}, flamer: {} }; g.gs = null; },
  lvl(g, gun, part) { return (g && g.gunMods && g.gunMods[gun] && g.gunMods[gun][part]) || 0; },
  /** Armes qu'on peut modifier : le fusil d'assaut + les armes équipables obtenues */
  guns(g) { return ['rifle', ...MAIN_WEAPONS.filter(id => id !== 'rifle' && g.weapons[id])]; },
  part(gun, id) { return GUN_PARTS[gun].parts.find(p => p.id === id); },
  /** Prix réduits pour Vega la mécano (p.benchDiscount) */
  price(g, base) { return Math.round(base * (1 - ((g.player && g.player.benchDiscount) || 0))); },
  partCost(g, lvl) { return this.price(g, GUN_COST[lvl]); },

  /** Établi proche (dans une zone ouverte) */
  near(x, y, maxD = 62) {
    for (let i = 0; i < BENCHES.length; i++) {
      const b = BENCHES[i];
      if (World.isUnlocked(b.zone) && Math.hypot(b.x - x, b.y - y) < maxD) return i;
    }
    return -1;
  },

  /** Bonus des pièces sur les armes secondaires équipables (stats recalculées à chaque tir) */
  tune(g, id, s) {
    if (!g.gunMods) return s;
    const L = k => this.lvl(g, id, k);
    if (id === 'shotgun') { s.range *= 1 + 0.15 * L('barrel'); s.cd *= Math.pow(1 / 1.12, L('pump')); s.pellets += L('shells'); }
    else if (id === 'flamer') { s.range *= 1 + 0.12 * L('nozzle'); s.dmg *= 1 + 0.15 * L('tank'); s.cone *= 1 + 0.12 * L('igniter'); }
    return s;
  },

  /** Caractéristiques affichées (barres), éventuellement avec une pièce de plus */
  stats(g, gun, extraPart) {
    const p = g.player;
    if (gun === 'rifle') {
      const w = { ...p.weapon };
      if (extraPart) { const fp = { weapon: w }; this.part('rifle', extraPart).apply(fp); }
      return [
        ['Dégâts', w.damage, 60], ['Cadence', w.fireRate, 10], ['Portée', w.range, 700],
        ['Perforation', w.pierce, 8], ['Critique', w.critChance * 100, 60, '%'],
      ];
    }
    const wl = (g.weapons[gun] && g.weapons[gun].lvl) || 1;
    const save = g.gunMods[gun][extraPart];
    if (extraPart) g.gunMods[gun][extraPart] = (save || 0) + 1;
    const s = this.tune(g, gun, WEAPONS[gun].stats(wl));
    if (extraPart) g.gunMods[gun][extraPart] = save;
    if (gun === 'shotgun') return [['Dégâts', s.dmg * s.pellets, 140], ['Cadence', 1 / s.cd, 3], ['Portée', s.range, 500], ['Plombs', s.pellets, 16]];
    return [['Dégâts', s.dmg / s.tick, 120], ['Portée', s.range, 360], ['Largeur', s.cone * 114.6, 90, '°']];
  },

  open(g, bench) {
    if (g.state !== 'playing' || g.player.inside) return;
    const gun = this.guns(g).includes(g.active) ? g.active : 'rifle';
    // l'Armurerie s'ouvre sur l'onglet « Armes »
    g.gs = { bench, gun, part: GUN_PARTS[gun].parts[0].id, tab: BENCHES[bench] && BENCHES[bench].big ? 'arms' : 'parts', skin: null, pulse: 0, yaw: 0 };
    g.state = 'gunsmith';
    g.banner = null;
    Input.reset(); Input.releaseJoystick();
    Sfx.play('reload');
    UI.setHudButtons(false);
    UI.showGunsmith(g);
  },
  close(g) {
    if (g.state !== 'gunsmith') return;
    const bought = g.gs.bought || 0, evo = g.gs.evo;
    g.gs = null;
    g.state = 'playing';
    // on ressort plus fort : onde dorée, étincelles, annonce de l'évolution
    if (bought) {
      const p = g.player;
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: 130 });
      Entities.burst(g, p.x, p.y, '#ffd24a', 30, 300, 3.5, 0.7); Entities.star(g, p.x, p.y, 2, '#fff3b0');
      Entities.addText(g, p.x, p.y - 50, bought > 1 ? `ARMES AMÉLIORÉES ×${bought}` : 'ARME AMÉLIORÉE !', '#ffd24a', 20);
      Sfx.play('upgrade');
      if (evo) g.comboPop = { text: `${evo.icon} ${evo.name.toUpperCase()} !`, sub: 'Évolution débloquée', color: '#c77dff', t: 0 };
    }
    g.player.invuln = Math.max(g.player.invuln, 0.6);
    Cosmetics.version++; // remet la peinture équipée (si une autre était en aperçu)
    UI.hide(); UI.screen = 'game'; UI.setHudButtons(true);
  },
  setGun(g, gun) {
    if (!g.gs || !this.guns(g).includes(gun)) return;
    g.gs.gun = gun; g.gs.part = GUN_PARTS[gun].parts[0].id;
    UI.showGunsmith(g);
  },
  select(g, part) { if (g.gs) { g.gs.part = part; UI.showGunsmith(g); } },
  /** Sélection au clavier (flèches) */
  step(g, d) {
    const parts = GUN_PARTS[g.gs.gun].parts, i = parts.findIndex(p => p.id === g.gs.part);
    this.select(g, parts[(i + d + parts.length) % parts.length].id);
  },
  buy(g, partId) {
    const gs = g.gs; if (!gs) return;
    const gun = gs.gun, l = this.lvl(g, gun, partId), part = this.part(gun, partId);
    const cost = this.partCost(g, l);
    if (!part || l >= 3 || g.coins < cost) { Sfx.play('clang'); return; }
    g.coins -= cost; gs.bought = (gs.bought || 0) + 1;
    g.gunMods[gun][partId] = l + 1;
    if (part.apply) part.apply(g.player, g);
    gs.part = partId; gs.pulse = 1;
    g.stats.mods = (g.stats.mods || 0) + 1;
    Sfx.play('upgrade');
    UI.showGunsmith(g);
  },
  /** Peintures : aperçu (même non débloquée), équiper, acheter avec la réserve */
  preview(g, id) { if (!g.gs) return; g.gs.skin = id; UI.showGunsmith(g); },

  /* ---------------- onglet « Armes » : acheter, monter de niveau, faire évoluer ---------------- */
  /** Prochaine action possible sur une arme secondaire : { kind: 'buy'|'level'|'evo'|'max'|'full', cost } */
  weaponOffer(g, id) {
    const w = g.weapons[id], def = WEAPONS[id];
    if (!w) return Weapons.sideCount(g) >= MAX_SIDE_WEAPONS ? { kind: 'full' } : { kind: 'buy', cost: this.price(g, WEAPON_SHOP.buy) };
    if (w.lvl < def.max) return { kind: 'level', cost: this.price(g, WEAPON_SHOP.level(w.lvl)) };
    if (!w.evo && EVOLUTIONS.some(e => e.weapon === id)) return { kind: 'evo', cost: this.price(g, WEAPON_SHOP.evo) };
    return { kind: 'max' };
  },
  buyWeapon(g, id) {
    const o = this.weaponOffer(g, id);
    if (!o.cost || g.coins < o.cost) { Sfx.play('clang'); return; }
    g.coins -= o.cost;
    if (o.kind === 'buy' || o.kind === 'level') Weapons.levelUp(g, id);
    else { g.weapons[id].evo = true; g.stats.evolved++; if (g.gs) g.gs.evo = EVOLUTIONS.find(e => e.weapon === id); }
    if (g.gs) g.gs.bought = (g.gs.bought || 0) + 1;
    g.upLevels['w_' + id] = g.weapons[id].lvl;
    if (g.gs) g.gs.pulse = 1;
    Sfx.play('upgrade');
    g.checkAchievements();
    UI.showGunsmith(g);
  },
};
