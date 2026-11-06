'use strict';
/* =====================================================================
   SCÉNARIO D'UNE PARTIE
   - intro : la voiture arrive en dérapage, la survivante en sort
   - pause tactique entre les vagues (20 s) : on se déplace, on visite les refuges
   - ouverture des zones (vagues 5, 10, 15) : la barricade saute
   - objectifs de vague → pièces de la voiture → réparation → fuite = VICTOIRE
   - nuit (une vague sur 4) et tempêtes de sable
   - refuges : entrer / sortir, achats, porte assiégée par la horde
   ===================================================================== */

const STORY = {
  breakTime: 45,
  introTime: 4.2,
  nightEvery: 4,
  stormChance: 0.4, stormDuration: 22,
  door: { hp: 260, reinforce: 150 },
  repairTime: 14, repairRadius: 75,
  eventChance: 0.35, // vagues 3+ : probabilité d'un événement (horde de coureurs / ravitaillement)
};

/* Objectifs : chacun rapporte une pièce de la voiture. Ils restent actifs jusqu'à réussite. */
const OBJECTIVES = [
  { wave: 3, type: 'fetch', item: 'gascan', zone: 'parking', name: "Trouver un bidon d'essence", short: 'Essence', reward: 80 },
  { wave: 7, type: 'defend', zone: 'mall', name: 'Défendre le générateur', short: 'Bougies', at: { x: 1200, y: 470 }, hp: 420, reward: 120 },
  { wave: 12, type: 'hold', zone: 'slums', name: 'Siphonner la station-service', short: 'Courroie', at: MAP.gasStation, r: 85, time: 22, reward: 160 },
  { wave: 16, type: 'fetch', item: 'battery', zone: 'base', name: "Récupérer une batterie à l'hôpital", short: 'Batterie', reward: 200 },
];

/* Achats dans les refuges (ferraille de la partie) */
const SHELTER_ITEMS = {
  clinic: [
    { id: 'medkit', icon: '🩹', name: 'Trousse de soins', desc: '+40 PV immédiatement', cost: () => 40, buy: g => { g.player.hp = Math.min(g.player.maxHp, g.player.hp + 40); } },
  ],
  hospital: [
    { id: 'maxhp', icon: '❤️', name: 'Transfusion', desc: '+20 PV max', cost: g => 120 + (g.buys.maxhp || 0) * 60, buy: g => { g.player.maxHp += 20; g.player.hp += 20; } },
    { id: 'regen', icon: '💊', name: 'Stimulants', desc: '+1 PV par seconde', cost: g => 140 + (g.buys.regen || 0) * 80, buy: g => { g.player.regen += 1; } },
  ],
  armory: [
    { id: 'newgun', icon: '🎁', name: 'Nouvelle arme', desc: 'Une arme secondaire au hasard', cost: () => 150,
      ok: g => Weapons.sideCount(g) < MAX_SIDE_WEAPONS && Object.keys(WEAPONS).some(k => !g.weapons[k]),
      buy: g => { const free = Object.keys(WEAPONS).filter(k => !g.weapons[k]); const id = free[Math.floor(Math.random() * free.length)]; Weapons.levelUp(g, id); g.upLevels['w_' + id] = 1; return WEAPONS[id].name; } },
    { id: 'upgun', icon: '⬆️', name: 'Améliorer une arme', desc: 'La moins avancée gagne 1 niveau', cost: g => 90 + Math.min(...Object.values(g.weapons).map(w => w.lvl), 5) * 40,
      ok: g => Object.entries(g.weapons).some(([k, w]) => w.lvl < WEAPONS[k].max),
      buy: g => { const [id, w] = Object.entries(g.weapons).filter(([k, ww]) => ww.lvl < WEAPONS[k].max).sort((a, b) => a[1].lvl - b[1].lvl)[0]; w.lvl++; g.upLevels['w_' + id] = w.lvl; return WEAPONS[id].name; } },
    { id: 'ammo', icon: '💥', name: 'Munitions blindées', desc: '+15 % de dégâts (toutes les armes)', cost: g => 120 + (g.buys.ammo || 0) * 70, buy: g => { g.player.weapon.damage *= 1.15; } },
  ],
  workshop: [
    { id: 'turret', icon: '🗼', name: 'Tourelle automatique', desc: "Va dans l'inventaire : posez-la où vous voulez, elle tire 45 s", cost: () => 110, buy: g => { Inventory.add(g, 'turret'); return 'inv'; } },
    { id: 'wire', icon: '🕸️', name: 'Barbelés', desc: "Va dans l'inventaire : ralentit et blesse les zombies qui les traversent", cost: () => 60, buy: g => { Inventory.add(g, 'wire'); return 'inv'; } },
    { id: 'doors', icon: '🚪', name: 'Renforcer les portes', desc: '+150 PV pour toutes les portes', cost: g => 90 + (g.buys.doors || 0) * 50, buy: g => { g.doorBonus += STORY.door.reinforce; for (const s of Object.values(g.shelters)) { s.max = STORY.door.hp + g.doorBonus; s.hp = s.max; } } },
    { id: 'barrels', icon: '🛢️', name: 'Fûts piégés ×3', desc: "Va dans l'inventaire : trois fûts explosifs à poser où vous voulez", cost: () => 50, buy: g => { Inventory.add(g, 'barrels'); return 'inv'; } },
  ],
};

const Story = {
  /* ------------------------------ début de partie ------------------------------ */
  begin(g) {
    World.reset();
    g.state = 'intro'; g.introT = 0; g.phase = 'wave';
    g.parts = 0; g.objective = null; g.objDone = {}; g.victory = false;
    g.car = { x: MAP.car.x, y: MAP.car.y + 520, yaw: Math.PI, show: true, smoke: false };
    g.showPlayer = false; g.camZoom = 1.35;
    g.night = false; g.storm = null; g.stormDone = false;
    g.shelters = {}; g.doorBonus = 0; g.buys = {}; g.crates = []; g.acid = []; g.event = null;
    for (const id of Object.keys(SHELTERS)) g.shelters[id] = { hp: STORY.door.hp, max: STORY.door.hp, broken: false };
    g.player.x = MAP.startPos.x; g.player.y = MAP.startPos.y;
    Sfx.play('engine');
  },

  /** Cinématique d'intro : la voiture freine sur le parking, la survivante en sort */
  updateIntro(g, dt) {
    g.introT += dt;
    const t = g.introT, c = g.car, stopT = 2.2;
    const k = Math.min(1, t / stopT), e = 1 - Math.pow(1 - k, 3);
    c.y = MAP.car.y + 520 * (1 - e);
    c.yaw = Math.PI + Math.sin(Math.min(1, t / stopT) * Math.PI) * 0.35 * (1 - k); // petit dérapage
    if (t < stopT && Math.random() < 0.6) Entities.puff(g, c.x + U.rand(-20, 20), c.y + 40, 1, 14, true);
    if (t > stopT - 0.1 && !g._skid) { g._skid = true; g.shake = 8; Sfx.play('brake'); Entities.puff(g, c.x, c.y + 30, 10, 20, true); }
    if (t > 2.7) g.showPlayer = true;
    g.camZoom = 1 + 0.35 * Math.max(0, 1 - Math.max(0, t - 2.4) / 1.6);
    if (t >= STORY.introTime) this.endIntro(g);
  },
  endIntro(g) {
    g.car.x = MAP.car.x; g.car.y = MAP.car.y; g.car.yaw = Math.PI; g.car.smoke = true;
    g.showPlayer = true; g.camZoom = 1; g._skid = false;
    g.state = 'playing';
    g.startWave(1);
  },

  /* ------------------------------ vagues ------------------------------ */
  onWaveStart(g, n) {
    g.phase = 'wave';
    const M = g.mods || {};
    g.night = M.night || (n >= STORY.nightEvery && n % STORY.nightEvery === 0);
    g.storm = null; g.stormDone = M.storm ? false : (g.night || n < 6 || Math.random() > STORY.stormChance);
    g.stormAt = M.storm ? U.rand(2, 6) : U.rand(8, 18);
    // portes réparées entre les vagues
    for (const s of Object.values(g.shelters)) { s.broken = false; s.hp = s.max; }
    // événement de vague (pas pendant les boss) : horde de coureurs ou ravitaillement largué
    g.event = null;
    if (!g.wave.isBoss && n >= 3 && Math.random() < STORY.eventChance) {
      g.event = Math.random() < 0.5 ? 'rush' : 'supply';
      if (g.event === 'rush') for (let i = 0; i < 6 + n; i++) g.wave.queue.splice(Math.floor(Math.random() * (g.wave.queue.length + 1)), 0, 'fast');
      else this.dropSupplies(g, 3);
    }
    // objectif de la vague (ou celui en cours qui n'est pas réussi)
    if (!g.objective) {
      const o = OBJECTIVES.find(ob => ob.wave <= n && !g.objDone[ob.wave] && World.isUnlocked(ob.zone));
      if (o) this.startObjective(g, o);
      else if (g.parts >= OBJECTIVES.length && !g.victory) this.startObjective(g, { type: 'repair', name: 'Réparer la voiture et fuir !', short: 'Fuite', at: MAP.car, r: STORY.repairRadius, time: STORY.repairTime, reward: 500 });
    } else if (g.objective.type === 'defend' && g.objective.failed) this.startObjective(g, g.objective.def);
  },

  updateWave(g, dt) {
    // tempête de sable
    if (!g.stormDone && g.stats.time - g.waveStartTime > g.stormAt) {
      g.stormDone = true; g.storm = { t: 0, dur: STORY.stormDuration };
      g.showBanner('TEMPÊTE DE SABLE', 'Visibilité réduite… ils approchent', 2.2, '#ffb070');
      Sfx.play('wind');
    }
    if (g.storm) { g.storm.t += dt; if (g.storm.t > g.storm.dur) g.storm = null; }
    this.updateObjective(g, dt);
    this.updateSupplies(g, dt);
    // fumée du capot tant que la voiture est en panne
    if (g.car.smoke && Math.random() < 0.08) Entities.puff(g, g.car.x, g.car.y - 30, 1, 10);
  },

  /** Fin de vague : pause tactique avant la suivante (après le choix d'amélioration) */
  startBreak(g) {
    g.phase = 'break'; g.breakT = STORY.breakTime;
    g.night = false; g.storm = null;
    if (g.objective && g.objective.type === 'defend') { // le générateur a tenu toute la vague
      if (!g.objective.failed) this.completeObjective(g);
    }
    const next = g.wave.num + 1, z = MAP.zones.find(zz => zz.unlock === next);
    if (z && !World.isUnlocked(z.id)) this.unlockZone(g, z);
    else g.showBanner('PAUSE', `${STORY.breakTime} s · refuges ouverts · ${Input.mode === 'touch' ? '▶ pour lancer' : 'N pour lancer'}`, 2.4, '#7dff6a');
    for (const s of Object.values(g.shelters)) { s.broken = false; s.hp = s.max; }
  },
  updateBreak(g, dt) {
    if (!g.player.inside) g.breakT -= dt; // le temps est suspendu pendant les achats dans un refuge
    if (g.car.smoke && Math.random() < 0.08) Entities.puff(g, g.car.x, g.car.y - 30, 1, 10);
    this.updateObjective(g, dt);
    this.updateSupplies(g, dt);
    if (g.breakT <= 0 && !g.player.inside) this.endBreak(g);
  },
  endBreak(g) {
    if (g.phase !== 'break') return;
    if (g.player.inside) this.leaveShelter(g);
    g.startWave(g.wave.num + 1);
  },

  /* ------------------------------ ravitaillement largué ------------------------------ */
  dropSupplies(g, n) {
    g.crates = g.crates || [];
    for (let i = 0; i < n; i++) {
      const p = World.randomPoint(g.player.x, g.player.y, 220, 620, 18);
      g.crates.push({ x: p.x, y: p.y, t: -i * 0.6, fall: 2.4, landed: false });
    }
  },
  updateSupplies(g, dt) {
    if (!g.crates || !g.crates.length) return;
    const p = g.player;
    for (const c of g.crates) {
      c.t += dt;
      if (!c.landed && c.t >= c.fall) { c.landed = true; Entities.puff(g, c.x, c.y, 8, 18, true); Sfx.play('thud'); }
      if (c.landed && !p.inside && Math.hypot(c.x - p.x, c.y - p.y) < p.r + 20) {
        c.taken = true;
        p.hp = Math.min(p.maxHp, p.hp + 25); g.coins += 20;
        // une arme possédée gagne parfois un niveau
        const owned = Object.entries(g.weapons).filter(([k, w]) => w.lvl < WEAPONS[k].max);
        let extra = '';
        if (owned.length && Math.random() < 0.5) { const [k, w] = owned[Math.floor(Math.random() * owned.length)]; w.lvl++; g.upLevels['w_' + k] = w.lvl; extra = ` · ${WEAPONS[k].name} niv. ${w.lvl}`; }
        Entities.addText(g, c.x, c.y - 30, `+25 PV · +20 🔩${extra}`, '#7dff6a', 15);
        Sfx.play('heal');
      }
    }
    U.compact(g.crates, c => !c.taken);
  },

  unlockZone(g, z) {
    World.unlock(z.id);
    for (const s of MAP.separators) if (s.zone === z.id) {
      const mx = s.x0 === s.x1 ? s.x0 : (s.gate[0] + s.gate[1]) / 2, my = s.y0 === s.y1 ? s.y0 : (s.gate[0] + s.gate[1]) / 2;
      Entities.explode(g, mx, my, 120, 0, { color: '#ff7a1a' });
      g.fx.push({ t: 'gate', zone: z.id });
    }
    g.zonesOpened = (g.zonesOpened || 0) + 1;
    g.showBanner('NOUVELLE ZONE', z.name, 3, '#3ad6ff');
    Sfx.play('unlock');
  },

  /* ------------------------------ objectifs ------------------------------ */
  startObjective(g, def) {
    const o = { def, type: def.type, name: def.name, progress: 0, failed: false };
    if (def.type === 'fetch') {
      const p = World.randomPoint(g.player.x, g.player.y, 320, 1400, 16, def.zone);
      o.item = { x: p.x, y: p.y, kind: def.item, carried: false };
    } else if (def.type === 'defend') {
      o.gen = { x: def.at.x, y: def.at.y, hp: def.hp * WAVE_CONFIG.hpMult(g.wave.num) / 2, max: def.hp * WAVE_CONFIG.hpMult(g.wave.num) / 2, flash: 0 };
    } else { o.at = def.at; o.r = def.r; o.time = def.time; }
    g.objective = o;
    g.showBanner('OBJECTIF', def.name, 2.6, '#ffc21a');
    Sfx.play('objective');
  },

  updateObjective(g, dt) {
    const o = g.objective, p = g.player;
    if (!o) return;
    if (o.type === 'fetch') {
      const it = o.item;
      if (!it.carried && !p.inside && Math.hypot(it.x - p.x, it.y - p.y) < p.r + 18) { it.carried = true; Sfx.play('coin'); Entities.addText(g, p.x, p.y - 30, 'Récupéré !', '#ffc21a', 16); }
      if (it.carried) { it.x = p.x; it.y = p.y; if (Math.hypot(MAP.car.x - p.x, MAP.car.y - p.y) < 80) this.completeObjective(g); }
    } else if (o.type === 'defend') {
      if (o.gen.flash > 0) o.gen.flash -= dt;
      if (o.gen.hp <= 0 && !o.failed) {
        o.failed = true;
        Entities.explode(g, o.gen.x, o.gen.y, 90, 40, { color: '#ffb030' });
        g.showBanner('GÉNÉRATEUR DÉTRUIT', 'Nouvel essai à la prochaine vague', 2.2, '#ff5a3a');
      }
    } else if (o.type === 'hold' || o.type === 'repair') {
      const inside = !p.inside && Math.hypot(o.at.x - p.x, o.at.y - p.y) < o.r;
      if (inside && g.phase === 'wave') { o.progress += dt; if (Math.random() < 0.3) Entities.burst(g, o.at.x, o.at.y, '#ffc21a', 1, 60, 2, 0.4); }
      if (o.progress >= o.time) this.completeObjective(g);
    }
  },

  completeObjective(g) {
    const o = g.objective;
    if (!o) return;
    g.coins += o.def.reward || 0;
    if (o.type === 'repair') { g.objective = null; this.startEscape(g); return; }
    g.objDone[o.def.wave] = true; g.parts++;
    g.objective = null;
    g.showBanner('PIÈCE RÉCUPÉRÉE', `${o.def.short} · ${g.parts}/${OBJECTIVES.length} · +${o.def.reward} 🔩`, 2.6, '#7dff6a');
    Sfx.play('clear');
    if (g.parts >= OBJECTIVES.length) Entities.addText(g, g.player.x, g.player.y - 40, 'La voiture peut être réparée !', '#7dff6a', 16);
  },

  /* ------------------------------ fuite & victoire ------------------------------ */
  startEscape(g) {
    g.state = 'escape'; g.escapeT = 0; g.victory = true;
    g.car.smoke = false; g.showPlayer = false;
    g.enemies.forEach(e => { e.flash = 0.2; });
    g.showBanner('ÉVASION !', 'Plein gaz…', 3, '#7dff6a');
    Sfx.play('engine');
  },
  updateEscape(g, dt) {
    g.escapeT += dt;
    const t = g.escapeT, c = g.car;
    if (t > 0.6) { c.y -= (t - 0.6) * 420 * dt * 2; if (Math.random() < 0.8) Entities.puff(g, c.x + U.rand(-16, 16), c.y + 45, 1, 14, true); }
    g.camZoom = 1 + Math.min(0.2, t * 0.1);
    if (t > 3.6) {
      g.state = 'victory';
      const bonus = 500;
      g.coins += bonus;
      Save.data.stats.wins = (Save.data.stats.wins || 0) + 1; Save.save();
      g.checkAchievements();
      UI.showVictory(g, bonus);
    }
  },
  /** Après la victoire : on peut continuer en mode sans fin */
  continueEndless(g) {
    g.state = 'playing'; g.showPlayer = true; g.camZoom = 1;
    g.car.x = MAP.car.x; g.car.y = MAP.car.y; g.car.yaw = Math.PI;
    g.player.x = MAP.startPos.x; g.player.y = MAP.startPos.y; g.player.invuln = 2;
    UI.hide(); UI.setHudButtons(true);
    this.startBreak(g);
  },

  /* ------------------------------ refuges ------------------------------ */
  enterShelter(g, id) {
    const p = g.player, s = g.shelters[id];
    if (!s || s.broken || p.inside) return;
    if (g.mods && g.mods.noshelter) { Entities.addText(g, p.x, p.y - 30, 'Porte condamnée (défi du jour)', '#ff6a5a', 13); return; }
    p.inside = id; p.vx = p.vy = 0;
    g.lock = null;
    Input.releaseJoystick();
    Sfx.play('door');
    UI.showShelter(g, id);
  },
  leaveShelter(g) {
    const p = g.player;
    if (!p.inside) return;
    const d = World.doorOf(p.inside);
    p.x = d.x; p.y = d.y + 18; p.inside = null; p.invuln = Math.max(p.invuln, 1);
    World.resolve(p);
    UI.hide();
    Sfx.play('door');
  },
  buyShelter(g, itemId) {
    const p = g.player, type = SHELTERS[p.inside] && SHELTERS[p.inside].type;
    const it = (SHELTER_ITEMS[type] || []).find(i => i.id === itemId);
    if (!it || (it.ok && !it.ok(g))) return;
    const cost = it.cost(g);
    if (g.coins < cost) return;
    g.coins -= cost;
    const what = it.buy(g);
    g.buys[it.id] = (g.buys[it.id] || 0) + 1;
    Sfx.play('buy');
    if (what !== 'inv') UI.toast(`${it.icon} ${it.name}`, what || it.desc);
    UI.showShelter(g, p.inside);
  },
  /** La horde frappe la porte quand on est à l'intérieur ; si elle cède, on est éjecté */
  updateShelter(g, dt) {
    const p = g.player, id = p.inside;
    if (!id) return;
    const s = g.shelters[id], def = SHELTERS[id];
    if (def.heal) p.hp = Math.min(p.maxHp, p.hp + def.heal * dt);
    const d = World.doorOf(id);
    let hitting = 0;
    for (const e of g.enemies) if (Math.hypot(e.x - d.x, e.y - d.y) < e.r + 34) { s.hp -= e.damage * 0.6 * dt; hitting++; }
    if (hitting && Math.random() < 0.15) Sfx.play('thud');
    if (s.hp <= 0) {
      s.hp = 0; s.broken = true;
      this.leaveShelter(g);
      p.invuln = 1.6;
      for (const e of g.enemies) { const dx = e.x - p.x, dy = e.y - p.y, dd = Math.hypot(dx, dy) || 1; if (dd < 120) { e.kbx += dx / dd * 500; e.kby += dy / dd * 500; } }
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: 120 });
      g.shake = 14;
      g.showBanner('LA PORTE A CÉDÉ !', 'Courez !', 1.8, '#ff5a3a');
      Sfx.play('boom');
    }
  },
};
