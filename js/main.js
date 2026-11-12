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
  stats: null, upLevels: {}, coins: 0,
  vacuum: false, waveCleared: false, clearTimer: 0, deathTimer: 0,
  choices: [], newAch: [], achTimer: 0, camZoom: 1, showPlayer: true,
  best: U.storage.get('arena.best', { score: 0, wave: 0 }),

  /** opts.tutorial : partie guidée (js/tutorial.js), sans vagues ni récompenses de fin */
  newRun(opts = {}) {
    const p = this.player = Entities.createPlayer();
    this.charId = Save.data.char;
    const L = Loadout.current(); // classe choisie dans la Préparation
    Loadout.applyPrimary(p, L);  // réglages de l'arme principale, avant les bonus
    p.dmgBase = p.weapon.damage; // référence des bonus de dégâts (équipement, arme secondaire)
    CHARACTERS[this.charId].apply(p);
    p.charDmg = p.weapon.damage / p.dmgBase; // bonus de dégâts du personnage (repris par l'arme secondaire)
    Loadout.applyPerks(p, L);
    // règles choisies dans la Préparation (plus dur → plus de ferraille et d'XP) ; aucune pendant le tutoriel
    const chosen = opts.tutorial ? [] : runModsChosen();
    this.mods = Object.fromEntries(chosen.map(m => [m.id, true]));
    this.modBonus = runModsBonus(chosen);
    p.scrapMult *= 1 + this.modBonus;
    if (this.mods.fragile) { p.maxHp = Math.round(p.maxHp * 0.5); p.hp = p.maxHp; }
    this.enemies = []; this.pBullets = []; this.eBullets = [];
    this.pickups = []; this.particles = []; this.texts = [];
    this.barrels = []; this.grenades = []; this.mines = []; this.fireZones = []; this.drones = []; this.fx = []; this.burrowers = [];
    this.weapons = {}; this.magnetT = 0; this.hitStop = 0; this.flash = 0; this.lock = null;
    this.stats = { kills: 0, score: 0, time: 0, bosses: 0, elites: 0, barrels: 0, evolved: 0, rolls: 0, hurtBy: {} };
    this.death = null; this.lastBlow = null; this.tut = null;
    this.upLevels = {};
    this.coins = 0;
    this.newAch = [];
    this.genFails = 0;
    this.zonesOpened = 0; this.nightsSurvived = 0; this.revives = 0; this.noRevive = false; this.reviveFromBank = 0;
    this.wave = new WaveManager(this);
    Story.begin(this);            // carte réinitialisée + cinématique d'arrivée
    Allies.init(this);
    Inventory.init(this);
    Gunsmith.init(this);
    Fun.init(this);
    Forts.init(this);
    Loadout.equip(this, L);
    if (this.charId === 'mechanic') this.inv.turret = (this.inv.turret || 0) + 1; // Vega : une tourelle offerte
    Input.reset(); Input.capture = null; UI.rebinding = null;
    UI.hide();
    UI.setHudButtons(true);
    if (opts.tutorial) Tutorial.begin(this);
  },

  startWave(n) {
    this.wave.start(n);
    this.waveStartTime = this.stats.time;
    this.vacuum = false;
    this.waveCleared = false;
    Story.onWaveStart(this, n);
    Fun.startChallenge(this, n);
    this.player.regenPool = this.player.maxHp * 0.35 * (this.player.regenPoolMult || 1); this.lastStand = 0;
    const F = CONFIG.scrapFade; this.scrapScale = Math.max(F.min, 1 - Math.max(0, n - F.from) * F.perWave);
    Entities.placeBarrels(this);
    const boss = this.wave.isBoss, ev = this.event, W = this.wave;
    const title = ev === 'doubleboss' ? `VAGUE ${n} · DOUBLE BOSS` : boss ? `VAGUE ${n} · BOSS` : ev === 'runners' ? `VAGUE ${n} · COUREURS` : ev === 'blackout' ? `VAGUE ${n} · PANNE DE COURANT` : this.night ? `VAGUE ${n} · NUIT` : `VAGUE ${n}`;
    const sub = ev === 'doubleboss' ? `${ENEMY_TYPES[W.bossType].name} et ${ENEMY_TYPES[W.bossType2].name} arrivent… · prime ×1,5`
      : boss ? `${ENEMY_TYPES[W.bossType].name} arrive… tenez bon !`
      : ev === 'runners' ? 'Que des coureurs et des rampants ! · prime ×1,5'
      : ev === 'blackout' ? 'Plus de lampe torche ni de lampadaires… · prime ×1,5'
      : ev === 'rush' ? 'Horde de coureurs en approche !' : ev === 'supply' ? 'Ravitaillement largué sur la carte' : this.night ? 'Ils sont plus nombreux dans le noir' : '';
    this.showBanner(title, sub, 2.2, boss ? '#ff5a3a' : ev === 'runners' ? '#ffb030' : this.night ? '#8ab4ff' : null);
    Sfx.play(boss ? 'boss' : 'wave');
  },

  showBanner(text, sub, dur, color) { this.banner = { text, sub, t: 0, dur, color }; },

  update(dt) {
    // ralenti (boss abattu, grosse explosion) : le temps de jeu passe à 30 %
    if (this.slowmo > 0 && this.state === 'playing') { this.slowmo -= dt; dt *= 0.3; }
    this.time += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.flash > 0) this.flash -= dt;
    Music.setIntensity(this.state === 'playing' ? (this.phase === 'break' ? 0.3 : this.wave.isBoss && !this.waveCleared ? 1 : 0.65) : this.state === 'dying' ? 0.1 : 0.2);

    if (this.state === 'intro') { Story.updateIntro(this, dt); Entities.updateEffects(this, dt); return; }
    if (this.state === 'escape') { Story.updateEscape(this, dt); Entities.updateEnemies(this, dt * 0.3); Entities.updateEffects(this, dt); return; }

    if (this.state === 'playing') {
      if (this.hitStop > 0) { this.hitStop -= dt; return; }
      const p = this.player;
      this.stats.time += dt;
      if (this.phase === 'tut') Tutorial.update(this, dt);
      else if (this.phase === 'break') Story.updateBreak(this, dt);
      else { Story.updateWave(this, dt); this.wave.update(dt); }
      const tgt = p.inside ? World.doorOf(p.inside) : p;
      World.updateFlow(tgt.x, tgt.y, dt);
      Entities.updatePlayer(this, dt);
      if (!p.inside) Weapons.update(this, dt);
      Allies.update(this, dt);
      Story.updateShelter(this, dt);
      Entities.updateEnemies(this, dt);
      Forts.update(this, dt);
      Entities.updateBurrowers(this, dt);
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
      Fun.update(this, dt);
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
      Fun.endWave(this);
      const bonus = this.wave.num * CONFIG.waveClearBonus;
      this.stats.score += bonus;
      // prime de ferraille (remplace l'ancien choix d'amélioration) : à dépenser aux établis et dans les refuges
      const W = CONFIG.waveScrap, special = Story.specialWave(this); // vague spéciale : prime ×1,5
      const scrap = Math.round((W.base + Math.min(this.wave.num, W.capWave) * W.perWave) * this.player.scrapMult * (special ? 1.5 : 1));
      this.coins += scrap;
      if (special) this.stats.specials = (this.stats.specials || 0) + 1;
      this.showBanner('VAGUE REPOUSSÉE !', `+${bonus} pts · +${scrap} 🔩${special ? ' (vague spéciale ×1,5)' : ''}`, 1.6, '#ffc21a');
      Entities.petals(this, 60);
      Sfx.play('clear');
      return;
    }
    this.clearTimer -= dt;
    const coinsLeft = this.pickups.some(c => c.kind === 'coin');
    if (this.clearTimer <= 0 && (!coinsLeft || this.clearTimer < -1.5)) {
      this.player.invuln = Math.max(this.player.invuln, 1);
      this.checkAchievements();
      Story.startBreak(this); // pause tactique : établis et refuges ouverts
    }
  },

  /* ------------------------------ ciblage manuel ------------------------------ */
  aimAt(sx, sy, clear) {
    Sfx.unlock();
    if (this.state === 'intro') { Story.endIntro(this); return; }
    if (this.state !== 'playing' || this.player.inside) return;
    // mode construction : clic = poser, clic droit = démonter l'élément visé
    if (this.build && this.build.on) {
      if (clear) { const c = Render.cursorWorld(); if (c) Forts.removeAt(this, c.x, c.y); }
      else Forts.place(this);
      return;
    }
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
        if (a.id === 'escape') setTimeout(() => UI.toast('🔧 Nouveau personnage : Vega', 'La mécano rejoint l\'équipe (onglet Équipe)'), 3400);
        Sfx.play('achieve');
      }
    }
  },

  /* ------------------------------ fin de partie ------------------------------ */
  onPlayerDeath() {
    this.state = 'dying';
    this.deathTimer = 1.6;
    this.shake = 25;
    const p = this.player;
    // cause de la mort (affichée en fin de partie) : dernier coup reçu + zombies autour
    const b = this.lastBlow, around = this.enemies.filter(e => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 150).length;
    this.death = { k: b ? b.k : 'unknown', n: b ? b.n : 'La horde', ic: b ? b.ic : '🧟', around, wave: this.wave.num };
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
    Save.data.charKills = Save.data.charKills || {};
    Save.data.charKills[this.charId] = (Save.data.charKills[this.charId] || 0) + s.kills; // défis de tenues
    // causes de mort cumulées (pour voir ce qui est trop dur d'une partie à l'autre)
    if (this.death && !this.victory && !this.noRevive) { const D = Save.data.deathBy = Save.data.deathBy || {}; D[this.death.k] = (D[this.death.k] || 0) + 1; }
    this.checkAchievements();
    this.progress = Progress.onRunEnd(this); // expérience, niveaux, missions
    // tableau des 10 meilleures parties (local)
    const fav = Object.entries(s.dmgBy || {}).sort((a, b) => b[1] - a[1])[0];
    const d = new Date(), entry = { score: s.score, wave: this.wave.num, kills: s.kills, char: this.charId, fav: fav ? fav[0] : 'rifle', win: !!this.victory, mods: Object.keys(this.mods || {}).length, date: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, t: Date.now() };
    const board = Save.data.board = (Save.data.board || []).concat(entry).sort((a, b) => b.score - a.score).slice(0, 10);
    this.boardRank = board.indexOf(entry) + 1;
    Save.save();
    Online.submit(entry); // classement en ligne entre amis (si configuré, voir js/online.js)
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

  /** Paramètres : depuis le jeu (met en pause), l'écran titre ou la Préparation */
  openSettings() {
    if (this.state === 'playing') { this.state = 'paused'; Input.reset(); }
    const from = this.state === 'paused' ? 'pause' : UI.screen === 'lobby' ? 'lobby' : 'title';
    if (from === 'lobby') { UI.showLobby('options'); return; }
    UI.showSettings(from);
  },
  closeSettings() {
    Input.capture = null; UI.rebinding = null;
    if (UI.optCtx === 'pause' && this.state === 'paused') UI.showPause(this);
    else UI.showTitle(this.best);
  },

  /** Remet le décor au calme (parking, jour) derrière les menus */
  resetScene() {
    this.player = null; this.banner = null; this.tut = null;
    this.enemies = []; this.pBullets = []; this.eBullets = []; this.pickups = []; this.texts = [];
    this.barrels = []; this.grenades = []; this.mines = []; this.fireZones = []; this.drones = [];
    this.turrets = []; this.traps = []; this.objective = null; this.dog = null; this.crates = []; this.acid = [];
    this.gunMods = null; this.gs = null; this.burrowers = []; this.helpers = []; this.rescues = []; this.blackout = false; this.forts = []; this.build = null;
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
    UI.classPick = null;
    UI.previewChar = null;
    UI.showLobby(tab || 'classes');
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
      this.reviveFromBank = (this.reviveFromBank || 0) + r.cost - fromRun; // affiché en fin de partie
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
      case 'resume': this.resume(); break;
      case 'tutorial': this.goLandscape(); this.newRun({ tutorial: true }); break;
      case 'quit': if (this.tut) { this.toLobby(); break; } this.noRevive = true; this.state = 'dying'; this.deathTimer = 0; UI.hide(); UI.setHudButtons(false); break;
      case 'quitAsk': if (this.state === 'paused') UI.showQuitConfirm(this); break;
      case 'rebind':
        UI.rebinding = data.id; UI.refreshOptions();
        Input.capture = e => {
          if (e.code !== 'Escape') Inventory.setBind(data.id, e.code, Inventory.keyLabel(e));
          UI.rebinding = null; UI.refreshOptions();
        };
        break;
      case 'resetKeys': Inventory.resetBinds(); Input.capture = null; UI.rebinding = null; UI.refreshOptions(); break;
      // paramètres accessibles partout (écran titre, en partie via ⚙️ ou le menu pause)
      case 'settings': this.openSettings(); break;
      case 'settingsBack': this.closeSettings(); break;
      case 'revive': this.revive(); break;
      case 'giveup': if (this.state === 'revive') this.gameOver(); break;
      case 'menu': this.toLobby(); break;
      case 'leave': Story.leaveShelter(this); break;
      case 'shelterBuy': Story.buyShelter(this, data.id); break;
      case 'continue': Story.continueEndless(this); break;
      case 'tab': UI.showLobby(data.tab); break;
      case 'gcat': UI.garageCat = data.cat; UI.showLobby('garage'); break;
      case 'cosBuy': if (Cosmetics.buy(data.id)) { Sfx.play('buy'); this.checkAchievementsMenu(); } UI.showLobby('garage'); break;
      case 'cosEquip': Cosmetics.equip(data.id); UI.showLobby('garage'); break;
      case 'chars': case 'classes': case 'ach': case 'options': this.toLobby(action); break;
      case 'preview':
        UI.previewChar = data.id;
        if (charOwned(data.id)) { S.char = data.id; Save.save(); }
        UI.showLobby('chars');
        break;
      case 'selectChar':
        if (charOwned(data.id)) { S.char = data.id; Save.save(); UI.showLobby('chars'); }
        break;
      case 'buyChar': {
        const c = CHARACTERS[data.id];
        if (c && !c.unlock && !charOwned(data.id) && S.bank >= c.cost) { S.bank -= c.cost; S.chars[data.id] = true; S.char = data.id; Save.save(); Sfx.play('buy'); UI.showLobby('chars'); }
        break;
      }
      case 'set': {
        const v = data.val === 'true' ? true : data.val === 'false' ? false : isNaN(Number(data.val)) ? data.val : Number(data.val);
        S.settings[data.key] = v; if (data.key === 'quality') S.settings.aq = 0; // on repart de la pleine qualité
        Save.save(); Sfx.applyVolumes(); if (data.key === 'realSfx') Sfx.setReal(v); UI.refreshOptions();
        break;
      }
      case 'reload': location.reload(); break;
      case 'prestigeAsk': UI.prestigeAsk = true; UI.showLobby('missions'); break;
      case 'prestigeNo': UI.prestigeAsk = false; UI.showLobby('missions'); break;
      case 'prestige':
        UI.prestigeAsk = false;
        if (Progress.doPrestige()) { Sfx.play('achieve'); UI.toast(`⭐ Prestige ${Progress.prestige()} !`, `Retour au niveau 1 · +${PRESTIGE.bank} 🔩 · tout reste débloqué`); }
        UI.showLobby('missions'); break;
      // création de classe
      case 'clsSel': S.classSel = Number(data.i); Save.save(); UI.classPick = null; UI.showLobby('classes'); break;
      case 'clsNew': if (Loadout.add()) { Sfx.play('buy'); UI.classPick = 'primary'; } UI.showLobby('classes'); break;
      case 'clsDel': Loadout.remove(S.classSel); UI.classPick = null; UI.showLobby('classes'); break;
      case 'clsPick': UI.classPick = UI.classPick === data.slot ? null : data.slot; UI.showLobby('classes'); break;
      case 'clsSet': {
        const sl = data.slot, ok = sl === 'primary' ? Loadout.open(PRIMARIES[data.id]) : sl === 'secondary' ? Loadout.open(SECONDARIES[data.id]) : sl === 'lethal' ? Loadout.open(LETHALS[data.id]) : sl === 'tactical' ? Loadout.open(TACTICALS[data.id]) : Loadout.open(Loadout.perk(Number(sl.slice(4)), data.id));
        if (ok) { if (sl.startsWith('perk')) Loadout.set('perk', data.id, Number(sl.slice(4))); else Loadout.set(sl, data.id); Sfx.play('reload'); UI.classPick = null; }
        UI.showLobby('classes'); break;
      }
      case 'map': if (MAPS[data.id] && MAP.id !== data.id && mapOpen(data.id)) { S.settings.map = data.id; Save.save(); location.reload(); } break;
      case 'mod': { const m = S.settings.runMods = S.settings.runMods || {}; m[data.id] = !m[data.id]; Save.save(); UI.showLobby('chars'); break; }
      // établi d'armurier
      case 'gsClose': Gunsmith.close(this); break;
      case 'gsGun': Gunsmith.setGun(this, data.id); break;
      case 'gsPart': Gunsmith.select(this, data.id); break;
      case 'gsBuy': Gunsmith.buy(this, data.id); break;
      case 'gsWeapon': Gunsmith.buyWeapon(this, data.id); break;
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
        if (UI.screen === 'settings') { if (code === 'Escape') this.closeSettings(); break; }
        if (UI.screen === 'title' && confirm) this.toLobby();
        else if (UI.screen === 'lobby' && (code === 'Enter' || code === 'NumpadEnter')) this.newRun();
        else if (UI.screen === 'lobby' && code === 'Escape') this.toMenu();
        break;
      case 'tutend':
        if ((code === 'Enter' || code === 'NumpadEnter') && !UI.isLocked()) this.newRun();
        else if (code === 'Escape') this.toLobby();
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
        // mode construction : 1-2-3 choisissent, Entrée pose, Échap ou B referment
        if (this.build && this.build.on) {
          const kinds = Object.keys(FORTS), d = /^Digit([1-9])$/.exec(code);
          if (d && kinds[d[1] - 1]) { Forts.select(this, kinds[d[1] - 1]); break; }
          if (code === 'Enter' || code === 'NumpadEnter') { Forts.place(this); break; }
          if (code === 'Escape' || act === 'build') { Forts.toggle(this, false); break; }
        }
        if (act === 'build') { Forts.toggle(this); break; }
        if (code === 'Escape' || code === 'KeyP') this.pause();
        else if (act === 'roll' || ((code === 'ShiftLeft' || code === 'ShiftRight') && !act)) Entities.roll(this);
        else if (act === 'interact') this.contextAction('enter');
        else if (act === 'wave') this.contextAction('next');
        else if (act === 'ability') Fun.useAbility(this);
        else if (act === 'next') Inventory.next(this);
        else if (act) Inventory.use(this, act);
        else if (code === 'Tab') this.lock = null;
        break;
      }
      case 'paused':
        if (UI.screen === 'settings') { if (code === 'Escape') this.closeSettings(); break; }
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
        } else if (code === 'Tab') { const T = ['parts', 'gear', 'paint']; gs.tab = T[(T.indexOf(gs.tab) + 1) % 3]; gs.skin = null; UI.showGunsmith(this); }
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

  // l'Entraînement a été retiré : tout ce qui y avait été acheté est remboursé dans la réserve
  const OLD_PERM = { dmg: l => 80 + l * 80, reroll: l => 120 + l * 120 };
  for (const it of SHOP) OLD_PERM[it.id] = it.cost;
  let refund = 0;
  for (const [id, lv] of Object.entries(Save.data.perm || {})) { const cost = OLD_PERM[id]; if (cost) for (let i = 0; i < lv; i++) refund += cost(i); }
  Save.data.perm = {};
  if (refund) { Save.data.bank += refund; Save.save(); setTimeout(() => UI.toast(`🔩 +${refund} remboursés`, 'L\'Entraînement est retiré : votre réserve vous est rendue'), 800); }
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
    Input.pollPad(Game.state);
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
