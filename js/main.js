'use strict';
/* =====================================================================
   JEU : machine à états + boucle principale
   États : menu → intro → playing (phase 'wave' ⇄ 'break') ⇄ paused/upgrade
           → dying → gameover   |   playing → escape → victory (→ sans fin)
   ===================================================================== */

const Game = {
  state: 'menu',
  time: 0, shake: 0, hurtFlash: 0, flash: 0, hitStop: 0, banner: null,
  player: null, wave: null, phase: 'wave', lock: null,
  enemies: [], pBullets: [], eBullets: [], pickups: [], particles: [], texts: [],
  barrels: [], grenades: [], mines: [], fireZones: [], drones: [], fx: [], turrets: [], traps: [],
  weapons: {}, magnetT: 0, shelters: {}, objective: null, car: null, dog: null,
  stats: null, upLevels: {}, coins: 0, rerollCost: 0,
  vacuum: false, waveCleared: false, clearTimer: 0, deathTimer: 0,
  choices: [], newAch: [], achTimer: 0, camZoom: 1, showPlayer: true,
  best: U.storage.get('arena.best', { score: 0, wave: 0 }),

  /** opts.daily : défi du jour (règles spéciales tirées de la date) */
  newRun(opts = {}) {
    const p = this.player = Entities.createPlayer();
    this.charId = Save.data.char;
    CHARACTERS[this.charId].apply(p);
    for (const s of SHOP) { const l = Save.data.perm[s.id] || 0; if (l) s.apply(p, l); }
    this.daily = !!opts.daily;
    this.mods = this.daily ? Daily.modsSet() : {};
    if (this.mods.fragile) { p.maxHp = Math.round(p.maxHp * 0.5); p.hp = p.maxHp; p.scrapMult *= 2; }
    this.enemies = []; this.pBullets = []; this.eBullets = [];
    this.pickups = []; this.particles = []; this.texts = [];
    this.barrels = []; this.grenades = []; this.mines = []; this.fireZones = []; this.drones = []; this.fx = [];
    this.weapons = {}; this.magnetT = 0; this.hitStop = 0; this.flash = 0; this.lock = null;
    this.stats = { kills: 0, score: 0, time: 0, bosses: 0, elites: 0, barrels: 0, evolved: 0, rolls: 0 };
    this.upLevels = {};
    this.coins = 0;
    this.newAch = [];
    this.zonesOpened = 0; this.nightsSurvived = 0; this.revives = 0; this.noRevive = false;
    this.rerollCost = CONFIG.rerollBaseCost;
    this.wave = new WaveManager(this);
    Story.begin(this);            // carte réinitialisée + cinématique d'arrivée
    Allies.init(this);
    Inventory.init(this);
    Gunsmith.init(this);
    if (this.mods.shotgun) { this.weapons.shotgun = { lvl: 1, t: 0, evo: false, aux: [] }; this.upLevels.w_shotgun = 1; this.active = 'shotgun'; }
    Input.reset(); Input.capture = null; UI.rebinding = null;
    UI.hide();
    UI.setHudButtons(true);
  },

  startWave(n) {
    this.wave.start(n);
    this.waveStartTime = this.stats.time;
    this.vacuum = false;
    this.waveCleared = false;
    Story.onWaveStart(this, n);
    Entities.placeBarrels(this);
    const boss = this.wave.isBoss;
    this.showBanner(boss ? `VAGUE ${n} · BOSS` : this.night ? `VAGUE ${n} · NUIT` : `VAGUE ${n}`,
      boss ? `${ENEMY_TYPES[this.wave.bossType].name} arrive… tenez bon !` : this.event === 'rush' ? 'Horde de coureurs en approche !' : this.event === 'supply' ? 'Ravitaillement largué sur la carte' : this.night ? 'Ils sont plus nombreux dans le noir' : '', 2, boss ? '#ff5a3a' : this.night ? '#8ab4ff' : null);
    Sfx.play(boss ? 'boss' : 'wave');
  },

  showBanner(text, sub, dur, color) { this.banner = { text, sub, t: 0, dur, color }; },

  update(dt) {
    this.time += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.flash > 0) this.flash -= dt;
    Music.setIntensity(this.state === 'playing' ? (this.phase === 'break' ? 0.3 : this.wave.isBoss && !this.waveCleared ? 1 : 0.65) : this.state === 'dying' ? 0.1 : 0.2);

    if (this.player && (this.state === 'playing' || Tips.cur)) Tips.update(this, dt); // conseils de premiers pas
    if (this.state === 'intro') { Story.updateIntro(this, dt); Entities.updateEffects(this, dt); return; }
    if (this.state === 'escape') { Story.updateEscape(this, dt); Entities.updateEnemies(this, dt * 0.3); Entities.updateEffects(this, dt); return; }

    if (this.state === 'playing') {
      if (this.hitStop > 0) { this.hitStop -= dt; return; }
      const p = this.player;
      this.stats.time += dt;
      if (this.phase === 'break') Story.updateBreak(this, dt);
      else { Story.updateWave(this, dt); this.wave.update(dt); }
      const tgt = p.inside ? World.doorOf(p.inside) : p;
      World.updateFlow(tgt.x, tgt.y, dt);
      Entities.updatePlayer(this, dt);
      if (!p.inside) Weapons.update(this, dt);
      Allies.update(this, dt);
      Story.updateShelter(this, dt);
      Entities.updateEnemies(this, dt);
      // grognements : plus fréquents et plus forts quand la horde est proche
      if ((this.groanT = (this.groanT || 1) - dt) <= 0 && this.enemies.length) {
        let d = 1e9; for (const e of this.enemies) d = Math.min(d, Math.hypot(e.x - p.x, e.y - p.y));
        this.groanT = U.rand(0.9, 2.4) / Math.sqrt(Math.min(this.enemies.length, 9));
        if (d < 600) Sfx.groanAt(0.1 * (1 - d / 600) + 0.015, U.rand(0.85, 1.25));
      }
      Entities.updateBullets(this, dt);
      Entities.updateBarrels(this, dt);
      Entities.updatePickups(this, dt);
      Entities.updateEffects(this, dt);
      this.achTimer -= dt;
      if (this.achTimer <= 0) { this.achTimer = 0.5; this.checkAchievements(); }
      if (this.state === 'playing' && this.phase === 'wave') this.checkWaveEnd(dt);
    } else if (this.state === 'dying') {
      Entities.updateEffects(this, dt * 0.6);
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.offerRevive();
    } else if (this.state === 'revive') {
      Entities.updateEffects(this, dt * 0.3);
      this.reviveT -= dt;
      if (this.reviveT <= 0) this.gameOver();
    } else if (this.state !== 'paused' && this.state !== 'gunsmith') { // établi : partie figée
      Entities.updateEffects(this, dt);
    }
  },

  checkWaveEnd(dt) {
    if (!this.wave.isCleared()) return;
    if (!this.waveCleared) {
      this.waveCleared = true;
      this.clearTimer = 1.4;
      this.vacuum = true;
      this.eBullets.length = 0;
      if (this.night) this.nightsSurvived++;
      const bonus = this.wave.num * CONFIG.waveClearBonus;
      this.stats.score += bonus;
      this.showBanner('VAGUE REPOUSSÉE !', `+${bonus} pts`, 1.4, '#ffc21a');
      Entities.petals(this, 60);
      Sfx.play('clear');
      return;
    }
    this.clearTimer -= dt;
    const coinsLeft = this.pickups.some(c => c.kind === 'coin');
    if (this.clearTimer <= 0 && (!coinsLeft || this.clearTimer < -1.5)) {
      if (this.player.inside) Story.leaveShelter(this);
      this.openUpgrade();
    }
  },

  /* ------------------------------ ciblage manuel ------------------------------ */
  aimAt(sx, sy, clear) {
    Sfx.unlock();
    if (this.state === 'intro') { Story.endIntro(this); return; }
    if (this.state !== 'playing' || this.player.inside) return;
    if (clear) { this.lock = null; return; }
    const t = Render.pick(this, sx, sy);
    if (t) { this.lock = t; Sfx.play('lock'); } else this.lock = null;
  },

  /* ------------------------------ succès ------------------------------ */
  checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (Save.data.ach[a.id]) continue;
      let ok = false;
      try { ok = a.test(this, Save.data); } catch (e) { ok = false; }
      if (ok) {
        Save.data.ach[a.id] = Date.now(); Save.save();
        this.newAch.push(a);
        UI.toast(`${a.icon} Succès : ${a.name}`, a.desc);
        Sfx.play('achieve');
      }
    }
  },

  /* ------------------------------ améliorations ------------------------------ */
  openUpgrade() {
    this.state = 'upgrade';
    this.banner = null;
    Input.releaseJoystick();
    this.choices = rollUpgrades(this, 3);
    this.showUpgradeUI();
  },
  showUpgradeUI() {
    UI.showUpgrade(this.choices, this.upLevels, this.wave.num, this.coins, this.rerollCost, this.player.freeRerolls, this.weapons);
  },

  pickUpgrade(i) {
    const u = this.choices[i];
    if (!u || this.state !== 'upgrade') return;
    u.apply(this.player, this);
    this.upLevels[u.id] = (this.upLevels[u.id] || 0) + 1;
    Sfx.play('upgrade');
    UI.hide();
    this.state = 'playing';
    this.player.invuln = 1;
    this.checkAchievements();
    Story.startBreak(this);       // pause tactique avant la vague suivante
  },

  reroll() {
    if (this.state !== 'upgrade') return;
    const p = this.player;
    if (p.freeRerolls > 0) p.freeRerolls--;
    else if (this.coins >= this.rerollCost) { this.coins -= this.rerollCost; this.rerollCost += CONFIG.rerollCostStep; }
    else return;
    this.choices = rollUpgrades(this, 3);
    this.showUpgradeUI();
  },

  /* ------------------------------ fin de partie ------------------------------ */
  onPlayerDeath() {
    this.state = 'dying';
    this.deathTimer = 1.6;
    this.shake = 25;
    const p = this.player;
    Entities.puff(this, p.x, p.y, 12, 22);
    Entities.burst(this, p.x, p.y, '#b8322a', 30, 260, 4, 1.1);
    Input.releaseJoystick();
    UI.setHudButtons(false);
    Sfx.play('death');
    U.haptic(200);
  },

  gameOver() {
    this.state = 'gameover';
    const s = this.stats;
    const isNewBest = s.score > this.best.score;
    this.best = { score: Math.max(this.best.score, s.score), wave: Math.max(this.best.wave, this.wave.num) };
    U.storage.set('arena.best', this.best);
    const share = bankShare(this.wave.num, this.victory);
    const banked = Math.floor(this.coins * share);
    this.bankShare = share; this.coinsLost = this.coins - banked;
    Save.data.bank += banked;
    Save.data.stats.kills += s.kills; Save.data.stats.bosses += s.bosses; Save.data.stats.runs++;
    this.dailyBest = this.daily ? Daily.record(s.score, this.wave.num) : false;
    Save.data.charKills = Save.data.charKills || {};
    Save.data.charKills[this.charId] = (Save.data.charKills[this.charId] || 0) + s.kills; // défis de tenues
    this.checkAchievements();
    Save.save();
    UI.showGameOver(this, this.best, isNewBest, banked, this.newAch);
  },

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    Input.reset();
    UI.showPause(this);
  },

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    if (this.player.inside) UI.showShelter(this, this.player.inside);
    else UI.hide();
  },

  /** Remet le décor au calme (parking, jour) derrière les menus */
  resetScene() {
    this.player = null; this.banner = null;
    this.enemies = []; this.pBullets = []; this.eBullets = []; this.pickups = []; this.texts = [];
    this.barrels = []; this.grenades = []; this.mines = []; this.fireZones = []; this.drones = [];
    this.turrets = []; this.traps = []; this.objective = null; this.dog = null; this.crates = []; this.acid = [];
    this.gunMods = null; this.gs = null;
    if (Tips.cur) Tips.hide();
    this.night = false; this.storm = null; this.camZoom = 1; this.showPlayer = true; this.lock = null;
    if (this.wave) this.wave.warnings = [];
    World.reset();
    Input.releaseJoystick();
    UI.setHudButtons(false);
  },

  /** Téléphone : plein écran + verrouillage à l'horizontale (si le navigateur l'autorise) */
  goLandscape() {
    if (Input.mode !== 'touch') return;
    const el = document.documentElement;
    const lock = () => { try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* non pris en charge */ } };
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, lock);
      else lock();
    } catch (e) { lock(); }
  },

  /** Écran titre */
  toMenu() {
    this.state = 'menu';
    this.resetScene();
    UI.showTitle(this.best);
  },

  /** Préparation : personnages, atelier, succès, options, puis « Lancer la partie » */
  toLobby(tab) {
    if (this.state !== 'menu') { this.state = 'menu'; this.resetScene(); }
    UI.previewChar = null;
    UI.showLobby(tab || 'chars');
  },

  /* ------------------------------ réanimation ------------------------------ */
  reviveInfo() {
    const free = REVIVE.free + (this.player.freeRevives || 0);
    const paidIdx = Math.max(0, this.revives - free);
    const cost = this.revives < free ? 0 : Math.round(REVIVE.baseCost * Math.pow(REVIVE.mult, paidIdx));
    return { free: this.revives < free, cost, canPay: this.coins + Save.data.bank >= cost };
  },
  offerRevive() {
    const r = this.reviveInfo();
    if (this.noRevive || (!r.free && !r.canPay)) { this.gameOver(); return; }
    this.state = 'revive';
    this.reviveT = REVIVE.choiceTime;
    UI.showRevive(this, r.free, r.cost, r.canPay);
  },
  revive() {
    if (this.state !== 'revive') return;
    const r = this.reviveInfo();
    if (!r.free) {
      if (!r.canPay) return;
      const fromRun = Math.min(this.coins, r.cost);
      this.coins -= fromRun; Save.data.bank -= r.cost - fromRun; Save.save();
    }
    this.revives++;
    const p = this.player;
    p.hp = p.maxHp * REVIVE.hpRatio; p.invuln = REVIVE.invuln; p.stamina = p.staminaMax;
    this.eBullets.length = 0;
    this.state = 'playing';
    UI.hide(); UI.setHudButtons(true);
    // onde de choc : repousse (et sonne) la horde autour de la survivante
    Entities.explode(this, p.x, p.y, REVIVE.blastRadius, 30, { color: '#7dff6a' });
    for (const e of this.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d < REVIVE.blastRadius * 1.6) { e.kbx += dx / d * 700; e.kby += dy / d * 700; }
    }
    Entities.petals(this, 40);
    this.showBanner('DE RETOUR !', r.free ? 'Réanimation offerte' : `−${r.cost} 🔩`, 1.6, '#7dff6a');
    Sfx.play('upgrade');
  },

  /* ------------------------------ boutons ------------------------------ */
  handleAction(action, data) {
    const S = Save.data;
    switch (action) {
      case 'start': this.goLandscape(); this.toLobby(); break;
      case 'title': this.toMenu(); break;
      case 'play': this.newRun(); break;
      case 'daily': this.goLandscape(); if (this.state !== 'menu') { this.state = 'menu'; this.resetScene(); } UI.showDaily(); break;
      case 'playDaily': this.newRun({ daily: true }); break;
      case 'pick': this.pickUpgrade(Number(data.i)); break;
      case 'reroll': this.reroll(); break;
      case 'resume': this.resume(); break;
      case 'quit': this.noRevive = true; this.state = 'dying'; this.deathTimer = 0; UI.hide(); UI.setHudButtons(false); break;
      case 'quitAsk': if (this.state === 'paused') UI.showQuitConfirm(this); break;
      case 'rebind':
        UI.rebinding = data.id; UI.showLobby('options');
        Input.capture = e => {
          if (e.code !== 'Escape') Inventory.setBind(data.id, e.code, Inventory.keyLabel(e));
          UI.rebinding = null; UI.showLobby('options');
        };
        break;
      case 'resetKeys': Inventory.resetBinds(); Input.capture = null; UI.rebinding = null; UI.showLobby('options'); break;
      case 'revive': this.revive(); break;
      case 'giveup': if (this.state === 'revive') this.gameOver(); break;
      case 'menu': this.toLobby(); break;
      case 'leave': Story.leaveShelter(this); break;
      case 'shelterBuy': Story.buyShelter(this, data.id); break;
      case 'continue': Story.continueEndless(this); break;
      case 'tab': UI.showLobby(data.tab); break;
      case 'resetTips': Tips.reset(); UI.toast('💡 Conseils réactivés', 'Ils réapparaîtront pendant la prochaine partie'); UI.showLobby('options'); break;
      case 'gcat': UI.garageCat = data.cat; UI.showLobby('garage'); break;
      case 'cosBuy': if (Cosmetics.buy(data.id)) { Sfx.play('buy'); this.checkAchievementsMenu(); } UI.showLobby('garage'); break;
      case 'cosEquip': Cosmetics.equip(data.id); UI.showLobby('garage'); break;
      case 'chars': case 'shop': case 'ach': case 'options': this.toLobby(action); break;
      case 'preview':
        UI.previewChar = data.id;
        if (S.chars[data.id]) { S.char = data.id; Save.save(); }
        UI.showLobby('chars');
        break;
      case 'selectChar':
        if (S.chars[data.id]) { S.char = data.id; Save.save(); UI.showLobby('chars'); }
        break;
      case 'buyChar': {
        const c = CHARACTERS[data.id];
        if (c && !S.chars[data.id] && S.bank >= c.cost) { S.bank -= c.cost; S.chars[data.id] = true; S.char = data.id; Save.save(); Sfx.play('buy'); UI.showLobby('chars'); }
        break;
      }
      case 'buyPerm': {
        const it = SHOP.find(s => s.id === data.id), l = S.perm[data.id] || 0;
        if (it && l < it.max && S.bank >= it.cost(l)) { S.bank -= it.cost(l); S.perm[data.id] = l + 1; Save.save(); Sfx.play('buy'); this.checkAchievementsMenu(); UI.showLobby('shop'); }
        break;
      }
      case 'set': {
        const v = data.val === 'true' ? true : data.val === 'false' ? false : isNaN(Number(data.val)) ? data.val : Number(data.val);
        S.settings[data.key] = v; Save.save(); Sfx.applyVolumes(); UI.showLobby('options');
        break;
      }
      case 'reload': location.reload(); break;
      // établi d'armurier
      case 'gsClose': Gunsmith.close(this); break;
      case 'gsGun': Gunsmith.setGun(this, data.id); break;
      case 'gsPart': Gunsmith.select(this, data.id); break;
      case 'gsBuy': Gunsmith.buy(this, data.id); break;
      case 'gsTab': if (this.gs) { this.gs.tab = data.tab; this.gs.skin = null; UI.showGunsmith(this); } break;
      case 'gsSkin': Gunsmith.preview(this, data.id); break;
      case 'gsEquip': Cosmetics.equip(data.id); if (this.gs) this.gs.skin = null; UI.showGunsmith(this); break;
      case 'gsSkinBuy': if (Cosmetics.buy(data.id)) { Sfx.play('buy'); if (this.gs) this.gs.skin = null; } UI.showGunsmith(this); break;
    }
  },
  /** Boutons contextuels en jeu (entrer dans un refuge, lancer la vague) */
  contextAction(kind) {
    if (this.state !== 'playing') return;
    const p = this.player;
    if (kind === 'enter') {
      const id = World.nearDoor(p.x, p.y);
      if (id) { Story.enterShelter(this, id); return; }
      const b = Gunsmith.near(p.x, p.y);
      if (b >= 0) Gunsmith.open(this, b);
    }
    else if (kind === 'next') Story.endBreak(this);
  },
  checkAchievementsMenu() {
    for (const a of ACHIEVEMENTS) if (!Save.data.ach[a.id] && a.id === 'rich' && Save.data.bank >= 1000) { Save.data.ach[a.id] = Date.now(); Save.save(); UI.toast(`${a.icon} Succès : ${a.name}`, a.desc); }
  },

  onKey(code) {
    Sfx.unlock();
    const confirm = code === 'Enter' || code === 'Space' || code === 'NumpadEnter';
    switch (this.state) {
      case 'intro': Story.endIntro(this); break;
      case 'menu':
        if (UI.isLocked()) break;
        if (UI.screen === 'title' && confirm) this.toLobby();
        else if (UI.screen === 'lobby' && (code === 'Enter' || code === 'NumpadEnter')) this.newRun();
        else if (UI.screen === 'lobby' && code === 'Escape') this.toMenu();
        else if (UI.screen === 'daily' && code === 'Escape') this.toLobby();
        else if (UI.screen === 'daily' && (code === 'Enter' || code === 'NumpadEnter')) this.newRun({ daily: true });
        break;
      case 'gameover':
        if (confirm && !UI.isLocked()) this.newRun();
        if (code === 'Escape') this.toLobby();
        break;
      case 'revive':
        if (UI.isLocked()) break;
        if (code === 'Enter' || code === 'NumpadEnter' || code === 'KeyR') this.revive();
        else if (code === 'Escape') this.gameOver();
        break;
      case 'playing': {
        const p = this.player, act = Inventory.actionFor(code);
        if (p.inside) { if (act === 'interact' || code === 'Escape') Story.leaveShelter(this); break; }
        if (code === 'Escape' || code === 'KeyP') this.pause();
        else if (act === 'roll' || ((code === 'ShiftLeft' || code === 'ShiftRight') && !act)) Entities.roll(this);
        else if (act === 'interact') this.contextAction('enter');
        else if (act === 'wave') this.contextAction('next');
        else if (act === 'next') Inventory.next(this);
        else if (act) Inventory.use(this, act);
        else if (code === 'Tab') this.lock = null;
        break;
      }
      case 'paused':
        if (code === 'Escape' || code === 'KeyP' || confirm) this.resume();
        break;
      case 'gunsmith': { // établi : Échap / E pour reprendre, flèches pour choisir, Entrée pour acheter
        const gs = this.gs, act = Inventory.actionFor(code);
        if (code === 'Escape' || act === 'interact') Gunsmith.close(this);
        else if (gs.tab === 'parts' && (code === 'ArrowDown' || code === 'KeyS')) Gunsmith.step(this, 1);
        else if (gs.tab === 'parts' && (code === 'ArrowUp' || code === 'KeyW' || code === 'KeyZ')) Gunsmith.step(this, -1);
        else if (gs.tab === 'parts' && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space')) Gunsmith.buy(this, gs.part);
        else if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyQ' || code === 'KeyA' || code === 'KeyD') {
          const guns = Gunsmith.guns(this), i = guns.indexOf(gs.gun), d = code === 'ArrowLeft' || code === 'KeyQ' || code === 'KeyA' ? -1 : 1;
          if (guns.length > 1) Gunsmith.setGun(this, guns[(i + d + guns.length) % guns.length]);
        } else if (code === 'Tab') { gs.tab = gs.tab === 'parts' ? 'paint' : 'parts'; UI.showGunsmith(this); }
        break;
      }
      case 'upgrade': {
        if (UI.isLocked()) break;
        const m = /^(?:Digit|Numpad)([1-3])$/.exec(code);
        if (m) this.pickUpgrade(Number(m[1]) - 1);
        else if (code === 'KeyR') this.reroll();
        break;
      }
    }
  },
};

/* ------------------------------- Démarrage -------------------------------
   Appelé par js/render3d.js une fois Three.js et les modèles chargés. */
window.bootGame = function boot() {
  window.gameBooted = true;
  const canvas = document.getElementById('game');
  Render.init(canvas);
  Input.init(canvas);
  Input.onKey = code => Game.onKey(code);
  Input.onAim = (x, y, clear) => Game.aimAt(x, y, clear);
  Input.canStartJoystick = () => Game.state === 'playing';
  Input.onWheel = () => { if (Game.state === 'playing') Inventory.next(Game); };
  UI.init();

  const onResize = () => {
    Render.resize();
    // téléphone tourné à la verticale : la partie se met en pause (un écran demande de le tourner)
    if (Input.mode === 'touch' && innerHeight > innerWidth) Game.pause();
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  document.addEventListener('visibilitychange', () => { if (document.hidden) Game.pause(); });
  window.addEventListener('blur', () => Game.pause());

  document.addEventListener('contextmenu', e => e.preventDefault());
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1 || !e.target.closest('#overlay')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('pointerdown', () => Sfx.unlock());

  const loading = document.getElementById('loading');
  if (loading) loading.remove();
  Game.toMenu();

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    const steps = Math.max(1, Math.ceil(dt / CONFIG.maxStep));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) Game.update(h);
    Render.draw(Game);
    UI.tick(Game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(t => { last = t; frame(t); });
};

setTimeout(() => {
  if (window.gameBooted) return;
  const o = document.getElementById('overlay');
  o.classList.remove('hidden');
  o.innerHTML = '<div class="panel"><h2>Chargement impossible</h2><p class="sub">Le moteur 3D n\'a pas pu démarrer. Rechargez la page ; si le problème persiste, votre navigateur ne gère peut-être pas WebGL.</p><button class="btn" data-action="reload">Recharger</button></div>';
  o.addEventListener('click', () => location.reload());
}, 15000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
