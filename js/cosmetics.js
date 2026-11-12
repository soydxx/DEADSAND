'use strict';
/* =====================================================================
   GARAGE : personnalisation (purement visuelle)
   Chaque objet a un emplacement (slot) et une condition de déblocage :
     price  → s'achète avec la ferraille de la réserve
     ach    → offert par un succès (id dans ACHIEVEMENTS)
     kills  → défi de personnage : { char, n } zombies abattus avec ce personnage
     wave   → meilleure vague atteinte
   Sauvegarde : Save.data.cos = { owned: {id: true}, eq: {slot: id} }, Save.data.name
   ===================================================================== */

/* Rôles des matériaux des personnages (les noms viennent des modèles glTF) */
const OUTFIT_ROLES = {
  survivor: { LightGreen: 'top', Green: 'pants', White: 'shirt', Brown2: 'gear', Gold: 'trim', Brown_02: 'gear', Brown: 'boots' },
  scout: { White: 'shirt', Grey: 'pants', Orange: 'top', Brown: 'boots' },
  swat: { Swat: 'top', Swat_Black: 'pants' },
};
OUTFIT_ROLES.mechanic = OUTFIT_ROLES.survivor; // Vega utilise le même modèle que Mia
OUTFIT_ROLES.medic = OUTFIT_ROLES.scout;        // Nora utilise le même modèle que Kira
const OUTFIT_PALETTES = {
  desert:   { top: '#c2a06a', pants: '#8a7048', shirt: '#e0d0b0', gear: '#6a5232', trim: '#b08840', boots: '#4a3a26' },
  urban:    { top: '#50545c', pants: '#2e3036', shirt: '#8a8e96', gear: '#222428', trim: '#a8b0b8', boots: '#18191c' },
  military: { top: '#4a5a34', pants: '#3e4a2c', shirt: '#6a7450', gear: '#2e3420', trim: '#8a8a6a', boots: '#222418' },
  grime:    { mult: '#8f7c5c' },
  medic:    { top: '#f2f4f4', pants: '#2e5a7a', shirt: '#d8e8ec', boots: '#22262a' },     // blouse blanche de Nora
  medicnight: { top: '#3a8a8a', pants: '#1e3a4a', shirt: '#9ad8d8', boots: '#161a1e' },  // tenue de bloc
  mechanic: { top: '#d8701a', pants: '#2a3a4a', shirt: '#e8dcc4', gear: '#3a2a1a', trim: '#ffc21a', boots: '#1e1c1a' }, // combinaison orange de Vega // la tenue d'origine, couverte de crasse et de sang séché
};

const COSMETICS = [];
const C = (o) => COSMETICS.push(o);

// --- Tenues (une série par personnage) ---
for (const ch of ['survivor', 'scout', 'swat']) {
  const nm = { survivor: 'Mia', scout: 'Kira', swat: 'Brick' }[ch];
  C({ id: `of_${ch}_default`, slot: `outfit_${ch}`, cat: 'outfit', char: ch, icon: '👕', name: `${nm} · Tenue d'origine`, free: true });
  C({ id: `of_${ch}_desert`, slot: `outfit_${ch}`, cat: 'outfit', char: ch, icon: '🏜️', name: `${nm} · Désert`, palette: 'desert', price: 150 });
  C({ id: `of_${ch}_urban`, slot: `outfit_${ch}`, cat: 'outfit', char: ch, icon: '🏙️', name: `${nm} · Urbaine`, palette: 'urban', price: 200 });
  C({ id: `of_${ch}_grime`, slot: `outfit_${ch}`, cat: 'outfit', char: ch, icon: '🩸', name: `${nm} · Survivante crasseuse`, palette: 'grime', price: 120 });
  C({ id: `of_${ch}_military`, slot: `outfit_${ch}`, cat: 'outfit', char: ch, icon: '🎖️', name: `${nm} · Militaire`, palette: 'military', kills: { char: ch, n: 500 } });
}

C({ id: 'of_mechanic_default', slot: 'outfit_mechanic', cat: 'outfit', char: 'mechanic', icon: '🦺', name: 'Vega · Combinaison', palette: 'mechanic', free: true });
C({ id: 'of_medic_default', slot: 'outfit_medic', cat: 'outfit', char: 'medic', icon: '🥼', name: 'Nora · Blouse blanche', palette: 'medic', free: true });
C({ id: 'of_medic_scrubs', slot: 'outfit_medic', cat: 'outfit', char: 'medic', icon: '🩺', name: 'Nora · Tenue de bloc', palette: 'medicnight', price: 150 });
C({ id: 'of_medic_grime', slot: 'outfit_medic', cat: 'outfit', char: 'medic', icon: '🩸', name: 'Nora · Urgences', palette: 'grime', price: 120 });
C({ id: 'of_mechanic_grime', slot: 'outfit_mechanic', cat: 'outfit', char: 'mechanic', icon: '🩸', name: 'Vega · Cambouis', palette: 'grime', price: 120 });

// --- Peintures d'armes ---
const WEAPON_SKINS = {
  default: null,
  desert:  { metal: '#b8955e', wood: '#d8c090', r: 0.7, m: 0.1 },
  rust:    { metal: '#7a4a2a', wood: '#5a3a22', r: 0.95, m: 0.2 },
  chrome:  { metal: '#e8eef2', wood: '#2a2a2e', r: 0.2, m: 0.55 },
  wood:    { metal: '#24201c', wood: '#3e2414', r: 0.55, m: 0.4 },
  hazard:  { metal: '#ffc21a', wood: '#1a1a1a', r: 0.5, m: 0.2, stripes: true },
  gold:    { metal: '#ffcc40', wood: '#e8a820', r: 0.25, m: 0.6, glow: '#5a3c00' },
  night:   { metal: '#1a1c24', wood: '#2a2a38', r: 0.4, m: 0.6 },
  blood:   { metal: '#5a1010', wood: '#2a0a08', r: 0.5, m: 0.4 },
  neon:    { metal: '#16162a', wood: '#101018', r: 0.3, m: 0.5, glow: '#0a5a7a' },
  diamond: { metal: '#cfefff', wood: '#8ad8ff', r: 0.1, m: 0.7, glow: '#1a4a6a' },
  // camouflages des défis d'armes
  tiger:   { metal: '#e07a1a', wood: '#1a1410', r: 0.55, m: 0.2, stripes: true },
  cobalt:  { metal: '#2a5ab8', wood: '#16244a', r: 0.3, m: 0.7 },
  toxic:   { metal: '#5aff3a', wood: '#1a2a10', r: 0.45, m: 0.3, glow: '#1a5a0a' },
  arctic:  { metal: '#e8eef2', wood: '#9aa8b4', r: 0.6, m: 0.1 },
  lava:    { metal: '#2a1410', wood: '#ff5a1a', r: 0.5, m: 0.3, glow: '#6a1a00' },
  ivory:   { metal: '#ece2c8', wood: '#c8a040', r: 0.35, m: 0.4 },
  carbon:  { metal: '#121214', wood: '#2a2a30', r: 0.25, m: 0.5, stripes: true },
  // récompenses de prestige
  prestige: { metal: '#5a2a9a', wood: '#ffc21a', r: 0.25, m: 0.6, glow: '#2a0a5a' },
  obsidian: { metal: '#08080c', wood: '#5a1aff', r: 0.1, m: 0.8, glow: '#2a0a6a' },
  aurora:   { metal: '#3affc8', wood: '#c77dff', r: 0.15, m: 0.6, glow: '#0a4a5a' },
};
C({ id: 'ws_default', slot: 'weapon', cat: 'weapon', icon: '🔫', name: 'Acier d\'origine', skin: 'default', free: true });
C({ id: 'ws_desert', slot: 'weapon', cat: 'weapon', icon: '🏜️', name: 'Camouflage désert', skin: 'desert', price: 200 });
C({ id: 'ws_rust', slot: 'weapon', cat: 'weapon', icon: '🟤', name: 'Rouille', skin: 'rust', price: 150 });
C({ id: 'ws_wood', slot: 'weapon', cat: 'weapon', icon: '🪵', name: 'Bois sombre', skin: 'wood', price: 200 });
C({ id: 'ws_hazard', slot: 'weapon', cat: 'weapon', icon: '⚠️', name: 'Danger jaune et noir', skin: 'hazard', price: 300 });
C({ id: 'ws_chrome', slot: 'weapon', cat: 'weapon', icon: '🪞', name: 'Chrome', skin: 'chrome', price: 350 });
C({ id: 'ws_gold', slot: 'weapon', cat: 'weapon', icon: '👑', name: 'Or massif', skin: 'gold', wave: 30 });
// récompenses de niveau de survivante (level : niveau requis)
C({ id: 'ws_night', slot: 'weapon', cat: 'weapon', icon: '🌑', name: 'Nuit noire', skin: 'night', level: 5 });
C({ id: 'ws_blood', slot: 'weapon', cat: 'weapon', icon: '🩸', name: 'Sang séché', skin: 'blood', level: 15 });
C({ id: 'ws_neon', slot: 'weapon', cat: 'weapon', icon: '💠', name: 'Néon', skin: 'neon', level: 25 });
C({ id: 'ws_diamond', slot: 'weapon', cat: 'weapon', icon: '💎', name: 'Diamant', skin: 'diamond', level: 50 });
// défis d'armes (wchal, voir Progress.wchal) : éliminations / coups critiques mortels cumulés avec une arme de classe
C({ id: 'ws_tiger', slot: 'weapon', cat: 'weapon', icon: '🐅', name: 'Tigre', skin: 'tiger', wchal: { w: 'rifle', stat: 'kills', n: 300, t: '300 éliminations au fusil d\'assaut' } });
C({ id: 'ws_cobalt', slot: 'weapon', cat: 'weapon', icon: '🔷', name: 'Cobalt', skin: 'cobalt', wchal: { w: 'smg', stat: 'kills', n: 400, t: '400 éliminations à la mitraillette' } });
C({ id: 'ws_toxic', slot: 'weapon', cat: 'weapon', icon: '☣️', name: 'Toxique', skin: 'toxic', wchal: { w: 'shotgun', stat: 'kills', n: 300, t: '300 éliminations au fusil à pompe' } });
C({ id: 'ws_arctic', slot: 'weapon', cat: 'weapon', icon: '❄️', name: 'Arctique', skin: 'arctic', wchal: { w: 'sniper', stat: 'crits', n: 120, t: '120 coups critiques mortels au fusil de précision' } });
C({ id: 'ws_lava', slot: 'weapon', cat: 'weapon', icon: '🌋', name: 'Lave', skin: 'lava', wchal: { w: 'flamer', stat: 'kills', n: 400, t: '400 éliminations au lance-flammes' } });
C({ id: 'ws_ivory', slot: 'weapon', cat: 'weapon', icon: '🦴', name: 'Ivoire', skin: 'ivory', wchal: { w: 'sec', stat: 'kills', n: 200, t: '200 éliminations à l\'arme secondaire' } });
C({ id: 'ws_carbon', slot: 'weapon', cat: 'weapon', icon: '🏁', name: 'Carbone', skin: 'carbon', wchal: { w: 'any', stat: 'level', n: 10, t: 'Une arme au niveau 10' } });
// prestige (insigne ⭐ au niveau 50)
C({ id: 'ws_prestige', slot: 'weapon', cat: 'weapon', icon: '⭐', name: 'Prestige', skin: 'prestige', prestige: 1 });
C({ id: 'ws_obsidian', slot: 'weapon', cat: 'weapon', icon: '🖤', name: 'Obsidienne', skin: 'obsidian', prestige: 3 });
C({ id: 'ws_aurora', slot: 'weapon', cat: 'weapon', icon: '🌌', name: 'Aurore', skin: 'aurora', prestige: 5 });

// --- Voiture ---
for (const [id, nm, hex, price] of [['white', 'Blanc cassé', null, 0], ['red', 'Rouge', '#b8281e', 120], ['black', 'Noir mat', '#202022', 150], ['olive', 'Kaki', '#5a6a3a', 150], ['sand', 'Sable', '#c8a46a', 120], ['blue', 'Bleu nuit', '#1e3a6a', 150], ['rust', 'Rouillée', '#8a4a26', 100]]) {
  C({ id: `cp_${id}`, slot: 'car_paint', cat: 'car', icon: '🎨', name: `Peinture · ${nm}`, color: hex, ...(price ? { price } : { free: true }) });
}
C({ id: 'cd_none', slot: 'car_decal', cat: 'car', icon: '⬜', name: 'Sans autocollant', decal: null, free: true });
C({ id: 'cd_stripes', slot: 'car_decal', cat: 'car', icon: '🏁', name: 'Bandes de course', decal: 'stripes', price: 150 });
C({ id: 'cd_flames', slot: 'car_decal', cat: 'car', icon: '🔥', name: 'Flammes', decal: 'flames', price: 250 });
C({ id: 'cd_bio', slot: 'car_decal', cat: 'car', icon: '☣️', name: 'Biohazard', decal: 'bio', price: 200 });
C({ id: 'cd_skull', slot: 'car_decal', cat: 'car', icon: '💀', name: 'Crâne', decal: 'skull', ach: 'boss1' });
C({ id: 'ck_none', slot: 'car_kit', cat: 'car', icon: '🚙', name: 'Carrosserie de série', kit: [], free: true });
C({ id: 'ck_bullbar', slot: 'car_kit', cat: 'car', icon: '🛡️', name: 'Pare-buffle', kit: ['bullbar'], price: 200 });
C({ id: 'ck_rack', slot: 'car_kit', cat: 'car', icon: '🧳', name: 'Galerie + bidons', kit: ['rack'], price: 200 });
C({ id: 'ck_both', slot: 'car_kit', cat: 'car', icon: '🧰', name: 'Pare-buffle + galerie', kit: ['bullbar', 'rack'], price: 350 });
C({ id: 'ck_armor', slot: 'car_kit', cat: 'car', icon: '🪖', name: 'Blindée (plaques + grilles)', kit: ['bullbar', 'rack', 'armor'], ach: 'escape' });

// --- Rex le chien ---
const DOG_BREEDS = {
  husky: null,
  shepherd: { 'Material': '#2a1e14', 'Material.001': '#b07a3a', 'Material.006': '#1e160e', 'Material.003': '#c89a5a' },
  black:    { 'Material': '#1e1c1a', 'Material.001': '#2a2826', 'Material.006': '#141210', 'Material.003': '#3a3634' },
};
C({ id: 'db_husky', slot: 'dog_breed', cat: 'dog', icon: '🐺', name: 'Husky', breed: 'husky', free: true });
C({ id: 'db_shepherd', slot: 'dog_breed', cat: 'dog', icon: '🐕', name: 'Berger', breed: 'shepherd', price: 200 });
C({ id: 'db_black', slot: 'dog_breed', cat: 'dog', icon: '🐕‍🦺', name: 'Chien noir', breed: 'black', price: 250 });
C({ id: 'da_none', slot: 'dog_acc', cat: 'dog', icon: '⭕', name: 'Sans accessoire', acc: null, free: true });
C({ id: 'da_bandana', slot: 'dog_acc', cat: 'dog', icon: '🧣', name: 'Bandana rouge', acc: 'bandana', price: 100 });
C({ id: 'da_spikes', slot: 'dog_acc', cat: 'dog', icon: '⛓️', name: 'Collier à pointes', acc: 'spikes', price: 150 });

// --- Effets ---
for (const [id, nm, hex, price] of [['yellow', 'Jaune', '#ffd27a', 0], ['red', 'Rouge', '#ff4a3a', 100], ['green', 'Vert', '#7dff6a', 100], ['blue', 'Bleu', '#5ab8ff', 100]]) {
  C({ id: `tr_${id}`, slot: 'tracer', cat: 'fx', icon: '✨', name: `Balles traçantes · ${nm}`, color: hex, ...(price ? { price } : { free: true }) });
}
C({ id: 'tr_purple', slot: 'tracer', cat: 'fx', icon: '✨', name: 'Balles traçantes · Violet', color: '#c77dff', level: 8 });
C({ id: 'kf_plasma', slot: 'kill', cat: 'fx', icon: '🔵', name: 'Mort des zombies · Plasma', kfx: 'plasma', level: 30 });
C({ id: 'kf_dust', slot: 'kill', cat: 'fx', icon: '💨', name: 'Mort des zombies · Poussière', kfx: 'dust', free: true });
C({ id: 'kf_sparks', slot: 'kill', cat: 'fx', icon: '⚡', name: 'Mort des zombies · Étincelles', kfx: 'sparks', price: 150 });
C({ id: 'kf_confetti', slot: 'kill', cat: 'fx', icon: '🎉', name: 'Mort des zombies · Confettis', kfx: 'confetti', price: 200 });
C({ id: 'rt_sand', slot: 'trail', cat: 'fx', icon: '🏜️', name: 'Roulade · Sable', trail: 'sand', free: true });
C({ id: 'rt_smoke', slot: 'trail', cat: 'fx', icon: '🌫️', name: 'Roulade · Fumée noire', trail: 'smoke', price: 120 });
C({ id: 'rt_sparks', slot: 'trail', cat: 'fx', icon: '🎇', name: 'Roulade · Étincelles', trail: 'sparks', price: 180 });

// --- Titres (offerts par les succès) ---
C({ id: 'ti_none', slot: 'title', cat: 'title', icon: '🏷️', name: 'Recrue', title: 'Recrue', free: true }); // (pas « Survivante » : c'est déjà le pseudo par défaut)
for (const [ach, t] of [['w5', 'Rescapée'], ['w10', 'Vétérane'], ['w15', 'Légende du désert'], ['boss1', 'Tueuse de géants'], ['boss3', 'Chasseuse de Mastodontes'], ['k1000', 'Fossoyeuse'], ['boom', 'Pyromane'], ['night', 'Noctambule'], ['rich', 'Ferrailleuse'], ['zone', 'Exploratrice'], ['escape', 'Évadée'], ['roll', 'Insaisissable']]) {
  C({ id: `ti_${ach}`, slot: 'title', cat: 'title', icon: '🏷️', name: t, title: t, ach });
}

for (const [lv, t] of [[3, 'Dure à cuire'], [10, 'Aguerrie'], [20, 'Fléau des morts'], [40, 'Reine du désert'], [50, 'Légende vivante']]) {
  C({ id: `ti_lvl${lv}`, slot: 'title', cat: 'title', icon: '🏷️', name: t, title: t, level: lv });
}
C({ id: 'ti_prestige2', slot: 'title', cat: 'title', icon: '🏷️', name: 'Immortelle', title: 'Immortelle', prestige: 2 });
C({ id: 'ti_prestige10', slot: 'title', cat: 'title', icon: '🏷️', name: 'Éternelle', title: 'Éternelle', prestige: 10 });
C({ id: 'cp_blood', slot: 'car_paint', cat: 'car', icon: '🎨', name: 'Peinture · Rouge sang', color: '#5a0a0a', level: 12 });
C({ id: 'cp_chrome', slot: 'car_paint', cat: 'car', icon: '🎨', name: 'Peinture · Chrome', color: '#c8ccd2', level: 35 });

// --- Thème du menu ---
C({ id: 'th_day', slot: 'theme', cat: 'theme', icon: '☀️', name: 'Plein jour', theme: 'day', free: true });
C({ id: 'th_dusk', slot: 'theme', cat: 'theme', icon: '🌇', name: 'Crépuscule', theme: 'dusk', price: 100 });
C({ id: 'th_night', slot: 'theme', cat: 'theme', icon: '🌙', name: 'Nuit', theme: 'night', price: 150 });
C({ id: 'th_storm', slot: 'theme', cat: 'theme', icon: '🌪️', name: 'Tempête de sable', theme: 'storm', price: 150 });

const COS_CATS = [['outfit', '👕', 'Tenues'], ['weapon', '🔫', 'Armes'], ['car', '🚙', 'Voiture'], ['dog', '🐺', 'Rex'], ['fx', '✨', 'Effets'], ['title', '🏷️', 'Titres'], ['theme', '🌇', 'Menu']];

const Cosmetics = {
  version: 0, // incrémenté à chaque changement : le rendu réapplique les apparences
  data() {
    const S = Save.data;
    if (!S.cos) S.cos = { owned: {}, eq: {} };
    if (!S.charKills) S.charKills = {};
    return S.cos;
  },
  get(id) { return COSMETICS.find(c => c.id === id); },
  /** Objet équipé dans un emplacement (ou celui offert par défaut) */
  eq(slot) {
    const d = this.data(), id = d.eq[slot];
    const it = id && this.get(id);
    return it && this.owned(it) ? it : COSMETICS.find(c => c.slot === slot && c.free);
  },
  /** Débloqué ? (acheté, ou condition remplie) */
  owned(it) {
    const S = Save.data, d = this.data();
    if (it.free || d.owned[it.id]) return true;
    if (it.ach) return !!S.ach[it.ach];
    if (it.kills) return (S.charKills[it.kills.char] || 0) >= it.kills.n;
    if (it.wave) return (typeof Game !== 'undefined' && Game.best && Game.best.wave >= it.wave);
    if (it.level) return Progress.unlockLevel() >= it.level; // après un prestige, tout reste débloqué
    if (it.wchal) return Progress.wchal(it.wchal).done;
    if (it.prestige) return Progress.prestige() >= it.prestige;
    return false;
  },
  /** Texte de la condition de déblocage */
  lockText(it) {
    if (it.ach) { const a = ACHIEVEMENTS.find(x => x.id === it.ach); return `🔒 Succès « ${a ? a.name : it.ach} »`; }
    if (it.kills) { const S = Save.data, have = S.charKills[it.kills.char] || 0; return `🔒 ${it.kills.n} zombies avec ${CHARACTERS[it.kills.char].name} (${Math.min(have, it.kills.n)}/${it.kills.n})`; }
    if (it.wave) return `🔒 Atteindre la vague ${it.wave} (record : ${Game.best.wave})`;
    if (it.level) return `🔒 Niveau ${it.level} de survivante`;
    if (it.wchal) { const c = Progress.wchal(it.wchal); return `🔒 ${it.wchal.t} (${c.have}/${c.n})`; }
    if (it.prestige) return `🔒 Prestige ${it.prestige}`;
    return '';
  },
  buy(id) {
    const it = this.get(id), S = Save.data;
    if (!it || this.owned(it) || !it.price || S.bank < it.price) return false;
    S.bank -= it.price; this.data().owned[id] = true; this.equip(id); Save.save();
    return true;
  },
  equip(id) {
    const it = this.get(id);
    if (!it || !this.owned(it)) return false;
    this.data().eq[it.slot] = id; Save.save();
    this.version++;
    return true;
  },
  title() { return this.eq('title').title; },
  playerName() { return (Save.data.name || '').trim() || 'Survivante'; },
};
