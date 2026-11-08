'use strict';
/* =====================================================================
   CONFIGURATION & TABLES DE DONNÉES
   Tout l'équilibrage du jeu se règle ici, sans toucher au moteur.
   ===================================================================== */

const CONFIG = {
  // Monde logique (voir world.js pour le plan des zones)
  world: { width: 2400, height: 1600 },
  arena: { wall: 26, top: 26 }, // épaisseur de la barrière de béton sur chaque bord
  maxStep: 1 / 60,              // pas de simulation max (sous-pas si frame longue)

  player: {
    radius: 15,
    maxHp: 100,
    speed: 220,                 // unités monde / seconde
    invulnTime: 0.8,            // invincibilité après un coup (s)
    magnet: 70,                 // rayon d'attraction de la ferraille
    regen: 0,                   // PV / seconde
    armor: 0,                   // dégâts retirés à chaque coup
    lifeOnKill: 0,              // PV rendus par élimination
    weapon: {
      damage: 12,
      fireRate: 2.4,            // tirs / seconde
      projSpeed: 560,
      range: 320,
      projCount: 1,
      spread: 0.16,             // écart angulaire entre projectiles (rad)
      pierce: 0,                // ennemis traversés
      projRadius: 4.5,
      critChance: 0.05,
      critMult: 2,
      knockback: 110,
    },
  },

  // Roulade d'esquive (Espace / Maj sur PC, bouton sur mobile) : courte, avec une jauge
  // d'endurance de `charges` roulades ; chaque charge revient en `cooldown` s (après `delay`)
  roll: { charges: 3, cooldown: 1.1, delay: 0.35, duration: 0.17, speedMult: 3.0 },

  pickups: { life: 20, magnetSpeed: 200, magnetAccel: 1400 },

  // Bonus lâchés pendant la vague (probabilité par zombie abattu)
  powerups: {
    medkit: { chance: 0.016, heal: 30 },
    magnet: { chance: 0.008, duration: 1.5 },
    bomb:   { chance: 0.006, radius: 330, damage: 140 },
    life: 15,
  },

  // Fûts explosifs posés dans l'arène à chaque vague
  barrels: { perWave: 5, hp: 18, radius: 12, blast: 95, damage: 60, playerDamage: 14 },

  touch: {
    zone: 'left',               // 'left' = moitié gauche de l'écran, 'any' = partout
    radius: 60,                 // rayon du joystick (px CSS)
    deadZone: 0.12,
  },

  waveClearBonus: 25,           // points × numéro de vague
  waveScrap: { base: 25, perWave: 8 }, // prime de ferraille en fin de vague (à dépenser aux établis / refuges)
  screenShake: true,
  maxParticles: 700,
};

/* ---------------------------------------------------------------------
   ENNEMIS
   behavior : clé dans BEHAVIORS (entities.js) | model : variante dans ZOMBIE_TYPES (render3d.js)
   coins = ferraille lâchée | color = couleur des éclaboussures | armor = dégâts absorbés par balle
   --------------------------------------------------------------------- */
const ENEMY_TYPES = {
  basic: {
    name: 'Rôdeur', behavior: 'chase', model: 'walker',
    hp: 30, speed: 70, radius: 13, damage: 12,
    color: '#6f8a3a', coins: 1, score: 10,
  },
  fast: {
    name: 'Coureur', behavior: 'chase', model: 'runner', wobble: true,
    hp: 14, speed: 165, radius: 9, damage: 8,
    color: '#7a8a4a', coins: 1, score: 15,
  },
  crawler: {
    name: 'Rampant', behavior: 'chase', model: 'crawler',
    hp: 22, speed: 95, radius: 10, damage: 10,
    color: '#6a7a3a', coins: 1, score: 15,
  },
  tank: {
    name: 'Brute', behavior: 'chase', model: 'brute',
    hp: 150, speed: 42, radius: 23, damage: 25, knockbackResist: 0.85,
    color: '#5f7a32', coins: 4, score: 40,
  },
  shooter: {
    name: 'Cracheur', behavior: 'ranged', model: 'spitter',
    hp: 26, speed: 85, radius: 12, damage: 10,
    preferredDist: 240, fireCooldown: 2.0, bulletSpeed: 230, bulletDamage: 10,
    bulletColor: '#9cff3a',
    color: '#a8c83a', coins: 2, score: 25,
  },
  bomber: {
    name: 'Kamikaze', behavior: 'bomber', model: 'bomber',
    hp: 20, speed: 118, radius: 12, damage: 0,
    explodeRadius: 72, explodeDamage: 22,
    color: '#ff8a3a', coins: 2, score: 25,
  },
  armored: {
    name: 'Blindé', behavior: 'chase', model: 'armored',
    hp: 90, speed: 58, radius: 15, damage: 16, armor: 6, knockbackResist: 0.6,
    color: '#5a6a4a', coins: 3, score: 35,
  },
  // Le Hurleur : reste en retrait et hurle : les zombies autour de lui accélèrent (vague 6+)
  howler: {
    name: 'Hurleur', behavior: 'howler', model: 'howler',
    hp: 45, speed: 78, radius: 13, damage: 10, preferredDist: 180, howlEvery: 6, howlRadius: 240,
    color: '#9a5ac8', coins: 3, score: 35,
  },
  // Le Porte-bouclier : un bouclier anti-émeute arrête les balles de face (contournez-le ou faites-le sauter)
  shield: {
    name: 'Porte-bouclier', behavior: 'chase', model: 'shield', shield: true,
    hp: 75, speed: 55, radius: 15, damage: 15, knockbackResist: 0.75,
    color: '#6a6a5a', coins: 3, score: 35,
  },
  // L'Enfouisseur : avance sous le sable (invisible, seule une traînée trahit sa présence) puis surgit
  burrower: {
    name: 'Enfouisseur', behavior: 'chase', model: 'burrower', burrow: true,
    hp: 38, speed: 82, radius: 12, damage: 14, burrowSpeed: 150,
    color: '#8a6a3a', coins: 2, score: 30,
  },
  boss: {
    name: 'Le Mastodonte', behavior: 'boss', model: 'behemoth', boss: true,
    hp: 900, speed: 48, radius: 40, damage: 30, knockbackResist: 1,
    fireCooldown: 1.7, bulletSpeed: 200, bulletDamage: 14,
    bulletColor: '#c6ff3a', summonEvery: 7,
    color: '#7fa83a', coins: 30, score: 500,
  },
  // La Reine : reste en retrait et fait naître des vagues de rampants et de coureurs
  queen: {
    name: 'La Reine', behavior: 'queen', model: 'queen', boss: true,
    hp: 760, speed: 42, radius: 32, damage: 24, knockbackResist: 1,
    preferredDist: 300, summonEvery: 3.6, fireCooldown: 2.4, bulletSpeed: 230, bulletDamage: 10, bulletColor: '#c88aff',
    color: '#8a5aa8', coins: 30, score: 500,
  },
  // Le Bélier : se met en position, puis charge en ligne droite ; sonné s'il percute un mur
  charger: {
    name: 'Le Bélier', behavior: 'charger', model: 'charger', boss: true,
    hp: 1050, speed: 52, radius: 38, damage: 42, knockbackResist: 1,
    chargeEvery: 4.2, chargeSpeed: 560, chargeTime: 0.85, windup: 0.9,
    color: '#8a5a3a', coins: 30, score: 500,
  },
  // La Gerbeuse : arrose de bile en éventail ; la bile laisse des flaques acides au sol
  spewer: {
    name: 'La Gerbeuse', behavior: 'spewer', model: 'spewer', boss: true,
    hp: 880, speed: 40, radius: 36, damage: 28, knockbackResist: 1,
    fireCooldown: 1.5, bulletSpeed: 210, bulletDamage: 12, bulletColor: '#b8d84a', acid: true,
    color: '#8a9a2a', coins: 30, score: 500,
  },
};
/** Boss de la vague n (toutes les 5 vagues, à tour de rôle) */
const BOSS_ORDER = ['boss', 'queen', 'charger', 'spewer'];
const bossFor = n => BOSS_ORDER[(Math.floor(n / 5) - 1) % BOSS_ORDER.length];

/* ---------------------------------------------------------------------
   VAGUES — formules de difficulté (w = numéro de vague, commence à 1)
   --------------------------------------------------------------------- */
const WAVE_CONFIG = {
  bossEvery: 5,
  startDelay: 1.6,
  count: w => Math.round(6 + w * 3 + w * w * 0.15),
  bossWaveCountFactor: 0.5,
  hpMult: w => 1 + (w - 1) * 0.15,
  bossHpMult: w => 1 + (w / 5 - 1) * 0.7,
  speedMult: w => Math.min(1.35, 1 + (w - 1) * 0.02),
  damageMult: w => 1 + (w - 1) * 0.05,
  spawnInterval: w => Math.max(0.3, 1.15 - w * 0.06),
  groupSize: w => 1 + Math.floor(w / 3),
  weights: w => ({
    basic: 10,
    fast: w >= 2 ? 2 + w * 0.6 : 0,
    crawler: w >= 2 ? 1.5 + w * 0.3 : 0,
    shooter: w >= 3 ? 1.5 + w * 0.4 : 0,
    tank: w >= 4 ? 1 + w * 0.35 : 0,
    bomber: w >= 5 ? 1 + w * 0.3 : 0,
    armored: w >= 7 ? 1 + w * 0.3 : 0,
    howler: w >= 6 ? 0.8 + w * 0.12 : 0,
    shield: w >= 8 ? 0.8 + w * 0.2 : 0,
    burrower: w >= 9 ? 1 + w * 0.2 : 0,
  }),
  // zombies élites dorés (×3 PV, ×5 ferraille) à partir de la vague 6
  eliteChance: w => (w >= 6 ? Math.min(0.12, 0.03 + (w - 6) * 0.006) : 0),
  warningTime: 0.9,
  bossWarningTime: 1.8,
  maxAlive: 90,
  minSpawnDistance: 230,
};

/* ---------------------------------------------------------------------
   PERSONNAGES JOUABLES (débloqués avec la ferraille en réserve)
   model : fichier dans assets/models/
   --------------------------------------------------------------------- */
/* Seconde chance : la première est offerte, les suivantes coûtent de la ferraille
   (celle de la partie d'abord, puis la réserve). Coût : base × mult^(n° payant). */
const REVIVE = { free: 1, baseCost: 150, mult: 2, hpRatio: 0.6, invuln: 3, choiceTime: 9, blastRadius: 230 };

/* Ferraille versée en réserve à la fin d'une partie : une part seulement, qui grandit avec la
   vague atteinte (mourir tôt rapporte peu → pas d'intérêt à économiser puis abandonner).
   Une évasion réussie conserve tout. */
const BANKING = { base: 0.25, perWave: 0.05, max: 0.8, escape: 1 };
const bankShare = (wave, escaped) => escaped ? BANKING.escape : Math.min(BANKING.max, BANKING.base + BANKING.perWave * Math.max(0, wave - 1));

const CHARACTERS = {
  survivor: { name: 'Mia', role: 'Polyvalente', desc: 'Équilibrée en tout.', model: 'survivor', cost: 0,
    apply: () => {} },
  scout: { name: 'Kira', role: 'Éclaireuse', desc: '+15 % vitesse, +10 % critique, roulade plus fréquente, −20 PV.', model: 'scout', cost: 350,
    apply: p => { p.speed *= 1.15; p.weapon.critChance += 0.1; p.rollCdMax *= 0.8; p.maxHp -= 20; p.hp = p.maxHp; } },
  swat: { name: 'Brick', role: 'Tank', desc: '+50 PV, +3 armure, +15 % dégâts, −10 % vitesse.', model: 'swat', cost: 500,
    apply: p => { p.maxHp += 50; p.hp = p.maxHp; p.armor += 3; p.weapon.damage *= 1.15; p.speed *= 0.9; } },
  // débloquée en réparant la voiture (succès « Évadée ! ») : capacité spéciale d'atelier
  mechanic: { name: 'Vega', role: 'Mécano', desc: 'Établis −25 %, une tourelle offerte au départ, +10 % de ferraille.', model: 'survivor', cost: 0, unlock: 'escape', palette: 'mechanic',
    apply: p => { p.benchDiscount = 0.25; p.scrapMult *= 1.1; } },
};
/** Personnage disponible ? (acheté, ou débloqué par un succès) */
const charOwned = id => !!(Save.data.chars[id] || (CHARACTERS[id].unlock && Save.data.ach[CHARACTERS[id].unlock]));

/* ---------------------------------------------------------------------
   ENTRAÎNEMENT : améliorations permanentes du PERSONNAGE (vie, vitesse, réanimations, Rex),
   achetées avec la ferraille en réserve. Les armes s'améliorent aux établis, pendant la partie.
   apply : (player, niveau) au début de chaque partie
   --------------------------------------------------------------------- */
const SHOP = [
  { id: 'hp', icon: '❤️', name: 'Constitution', desc: '+10 PV max par niveau', max: 5, cost: l => 60 + l * 60,
    apply: (p, l) => { p.maxHp += 10 * l; p.hp = p.maxHp; } },
  { id: 'speed', icon: '👟', name: 'Cardio', desc: '+4 % de vitesse par niveau', max: 5, cost: l => 60 + l * 60,
    apply: (p, l) => { p.speed *= 1 + 0.04 * l; } },
  { id: 'magnet', icon: '🧲', name: 'Poches profondes', desc: '+20 % de rayon de collecte par niveau', max: 3, cost: l => 50 + l * 50,
    apply: (p, l) => { p.magnet *= 1 + 0.2 * l; } },
  { id: 'scrap', icon: '🔩', name: 'Récupérateur', desc: '+10 % de ferraille ramassée par niveau', max: 5, cost: l => 100 + l * 100,
    apply: (p, l) => { p.scrapMult = 1 + 0.1 * l; } },
  { id: 'roll', icon: '🌀', name: 'Réflexes', desc: '−10 % de recharge de la roulade par niveau', max: 3, cost: l => 90 + l * 90,
    apply: (p, l) => { p.rollCdMax *= 1 - 0.1 * l; } },
  { id: 'revive', icon: '💉', name: 'Adrénaline', desc: '+1 réanimation gratuite par partie', max: 2, cost: l => 250 + l * 250,
    apply: (p, l) => { p.freeRevives = l; } },
  { id: 'dog', icon: '🐺', name: 'Rex le chien', desc: 'Un husky vous accompagne et mord les zombies (niveau = force de morsure)', max: 3, cost: l => 300 + l * 200,
    apply: () => {} },
];

/* ---------------------------------------------------------------------
   SUCCÈS — test : (game, sauvegarde) => booléen, vérifiés pendant la partie
   --------------------------------------------------------------------- */
const ACHIEVEMENTS = [
  { id: 'w5', icon: '🥉', name: 'Survivant', desc: 'Atteindre la vague 5', test: g => g.wave.num >= 5 },
  { id: 'w10', icon: '🥈', name: 'Vétéran', desc: 'Atteindre la vague 10', test: g => g.wave.num >= 10 },
  { id: 'w15', icon: '🥇', name: 'Légende du désert', desc: 'Atteindre la vague 15', test: g => g.wave.num >= 15 },
  { id: 'boss1', icon: '💀', name: 'Tueur de géant', desc: 'Vaincre un Mastodonte', test: g => g.stats.bosses >= 1 },
  { id: 'boss3', icon: '☠️', name: 'Chasseur de titans', desc: 'Vaincre 3 Mastodontes au total', test: (g, S) => S.stats.bosses + g.stats.bosses >= 3 },
  { id: 'k100', icon: '🧟', name: 'Centurion', desc: '100 zombies en une partie', test: g => g.stats.kills >= 100 },
  { id: 'k1000', icon: '⚰️', name: 'Fossoyeur', desc: '1000 zombies au total', test: (g, S) => S.stats.kills + g.stats.kills >= 1000 },
  { id: 'boom', icon: '🛢️', name: "Feu d'artifice", desc: 'Faire exploser 10 fûts en une partie', test: g => g.stats.barrels >= 10 },
  { id: 'evo', icon: '✨', name: 'Évolution', desc: 'Obtenir une arme évoluée', test: g => g.stats.evolved >= 1 },
  { id: 'elite', icon: '👑', name: 'Or massif', desc: 'Abattre un zombie élite', test: g => g.stats.elites >= 1 },
  { id: 'arsenal', icon: '🗃️', name: 'Arsenal', desc: 'Posséder 3 armes secondaires en même temps', test: g => g.weapons && Weapons.sideCount(g) >= 3 },
  { id: 'roll', icon: '🤸', name: 'Insaisissable', desc: 'Faire 50 roulades en une partie', test: g => g.stats.rolls >= 50 },
  { id: 'rich', icon: '💰', name: 'Ferrailleur', desc: 'Avoir 1000 ferraille en réserve', test: (g, S) => S.bank >= 1000 },
  { id: 'zone', icon: '🗺️', name: 'Explorateur', desc: 'Ouvrir toutes les zones de la carte', test: g => (g.zonesOpened || 0) >= 3 },
  { id: 'night', icon: '🌙', name: 'Nuit blanche', desc: 'Survivre à une vague de nuit', test: g => (g.nightsSurvived || 0) >= 1 },
  { id: 'part', icon: '🔧', name: 'Mécano', desc: 'Récupérer une pièce de la voiture', test: g => (g.parts || 0) >= 1 },
  { id: 'escape', icon: '🚗', name: 'Évadée !', desc: 'Réparer la voiture et fuir', test: g => g.victory },
];
