'use strict';
/* =====================================================================
   INTERFACE (DOM) : menu, personnages, atelier, succès, options,
   choix d'amélioration, pause, fin de partie, notifications, bouton roulade.
   Tous les boutons portent data-action → Game.handleAction(action, data).
   ===================================================================== */

const UI = {
  lockUntil: 0,
  screen: 'main',

  init() {
    this.el = document.getElementById('overlay');
    this.hudBtns = document.getElementById('hud-buttons');
    this.btnRoll = document.getElementById('btn-roll');
    this.toastEl = document.getElementById('toast');

    this.el.addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t || t.disabled || this.isLocked()) return;
      Sfx.unlock();
      Sfx.play('click');
      Game.handleAction(t.dataset.action, t.dataset);
    });
    document.getElementById('btn-settings').addEventListener('click', () => { Sfx.unlock(); Sfx.play('click'); Game.openSettings(); });
    // bouton roulade (mobile) : réagit au toucher sans attendre le "click"
    this.btnRoll.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sfx.unlock(); if (Game.state === 'playing') Entities.roll(Game); });
    // capacité spéciale du personnage
    this.btnAbility = document.getElementById('btn-ability');
    this.btnAbility.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sfx.unlock(); Fun.useAbility(Game); });
    // pseudo (Options) et nom de classe (Classes)
    this.el.addEventListener('change', e => {
      if (e.target.id === 'class-name-input') { const v = e.target.value.replace(/[<>&"]/g, '').trim().slice(0, 14); Loadout.classes()[Save.data.classSel].name = v || `Classe ${Save.data.classSel + 1}`; Save.save(); this.showLobby('classes'); return; }
      if (e.target.id === 'group-input') { Save.data.settings.group = e.target.value; Save.save(); this.showLobby('ach'); return; }
      if (e.target.id !== 'name-input') return;
      Save.data.name = e.target.value.replace(/[<>&"]/g, '').trim().slice(0, 16); Save.save();
      this.refreshOptions();
    });
    this.btnAction = document.getElementById('btn-action');
    this.btnNext = document.getElementById('btn-next');
    const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sfx.unlock(); Sfx.play('click'); fn(); });
    tap(this.btnAction, () => Game.contextAction('enter'));
    tap(this.btnNext, () => Game.contextAction('next'));
    // fortifications (forts.js) : bouton pendant la pause + barre de choix
    this.btnBuild = document.getElementById('btn-build');
    tap(this.btnBuild, () => Forts.toggle(Game, true));
    this.buildBar = document.getElementById('buildbar');
    this.buildBar.addEventListener('pointerdown', e => {
      const b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); e.stopPropagation(); Sfx.unlock();
      if (b.dataset.fort) Forts.select(Game, b.dataset.fort);
      else if (b.dataset.place != null) Forts.place(Game);
      else if (b.dataset.close != null) Forts.toggle(Game, false);
    });
    // barre d'inventaire : toucher / cliquer une case = équiper ou poser
    this.hotbar = document.getElementById('hotbar');
    this.hotbar.addEventListener('pointerdown', e => {
      const s = e.target.closest('[data-slot]');
      if (!s) return;
      e.preventDefault(); e.stopPropagation(); Sfx.unlock();
      Inventory.use(Game, s.dataset.slot);
    });
    // établi : survol d'une pièce (la caméra s'en approche) et glisser pour tourner l'arme
    this.el.addEventListener('pointerover', e => {
      if (!Game.gs) return;
      const h = e.target.closest('[data-gs-hover]');
      Game.gs.hover = h ? h.dataset.gsHover : null;
    });
    this.el.addEventListener('pointerdown', e => {
      if (!Game.gs || e.target.closest('.panel')) return;
      this._drag = { x: e.clientX, yaw: Game.gs.yaw || 0 };
    });
    window.addEventListener('pointermove', e => { if (this._drag && Game.gs) Game.gs.yaw = this._drag.yaw + (e.clientX - this._drag.x) * 0.012; });
    window.addEventListener('pointerup', () => { this._drag = null; });
    // tutoriel : consigne en haut de l'écran (+ bouton pour le quitter)
    this.tutEl = document.createElement('div'); this.tutEl.id = 'tut'; this.tutEl.className = 'hidden';
    document.body.appendChild(this.tutEl);
    this.tutEl.addEventListener('pointerdown', e => { if (e.target.closest('[data-tut-quit]')) { e.preventDefault(); Sfx.play('click'); Game.toLobby(); } });
    // plus de bouton « couper le son » : le volume se règle dans les Paramètres (un ancien « muet » est levé)
    if (Sfx.muted) Sfx.setMuted(false);
  },

  setHudButtons(show) {
    this.hudBtns.classList.toggle('hidden', !show);
    this.btnRoll.classList.toggle('hidden', !show || Input.mode !== 'touch');
  },
  isLocked() { return performance.now() < this.lockUntil; },

  /** Mise à jour à chaque image : recharge de la roulade sur le bouton mobile */
  /** Barre d'inventaire (DOM) : reconstruite seulement quand son contenu change */
  tickHotbar(g) {
    const p = g.player, show = g.state === 'playing' && p && !p.inside;
    this.hotbar.classList.toggle('hidden', !show);
    if (!show) return;
    const slots = Inventory.slots(g), touch = Input.mode === 'touch';
    const keysSig = Object.keys(BINDINGS).map(k => Inventory.label(k)).join('');
    const sig = slots.map(s => `${s.id}${s.active ? '*' : ''}${s.count || ''}${s.extra || ''}${s.lvl || ''}${s.evo ? 'e' : ''}`).join('|') + touch + keysSig;
    if (sig !== this._hotSig) {
      this._hotSig = sig;
      const alt = { lethal: Inventory.label('grenade'), tactical: Inventory.label('mine'), secondary: Inventory.label('next') };
      this.hotbar.innerHTML = slots.map((s, i) => `<button class="slot ${s.kind} ${s.active ? 'on' : ''} ${s.evo ? 'evo' : ''}" data-slot="${s.id}" title="${s.name}">
        <span class="ic">${s.icon}</span>
        ${touch ? '' : `<span class="key">${i < 8 ? Inventory.label('slot' + (i + 1)) : ''}${alt[s.id] ? ` · ${alt[s.id]}` : ''}</span>`}
        ${s.count ? `<span class="cnt">×${s.count}</span>` : s.extra ? `<span class="cnt">${s.extra}</span>` : s.lvl ? `<span class="lv">${s.lvl}</span>` : ''}
        <i class="cd"></i>
      </button>`).join('');
    }
    // recharge des grenades et des mines
    for (const s of slots) if (s.cd != null) { const el = this.hotbar.querySelector(`[data-slot="${s.id}"] .cd`); if (el) el.style.height = `${Math.round(s.cd * 100)}%`; }
  },

  /** Consigne du tutoriel (reconstruite seulement quand elle change) */
  tickTutorial(g) {
    const show = !!(g.tut && g.state === 'playing' && g.player && !g.player.inside);
    this.tutEl.classList.toggle('hidden', !show);
    if (!show) return;
    const i = Tutorial.info(g); if (!i) return;
    const sig = JSON.stringify(i) + Input.mode;
    if (sig === this._tutSig) return;
    this._tutSig = sig;
    this.tutEl.classList.toggle('ok', i.ok);
    this.tutEl.innerHTML = `<div class="tut-top"><small>🎓 TUTORIEL · ${i.n} / ${i.of}</small><button data-tut-quit title="Quitter le tutoriel">Quitter ✕</button></div>
      <b>${i.ok ? '✔ ' : ''}${i.title}${i.count ? ` <em>${i.count}</em>` : ''}</b><span>${i.text}</span>
      <i class="tut-bar"><em style="width:${Math.round((i.n - (i.ok ? 0 : 1)) / i.of * 100)}%"></em></i>`;
  },

  showTutorialEnd(g, reward) {
    this.screen = 'main';
    const touch = Input.mode === 'touch';
    this.open(`
      <h2>🎓 Tutoriel terminé !</h2>
      <p class="sub">Vous savez tout ce qu'il faut pour tenir. Pour le reste :</p>
      <ul class="tut-recap">
        <li>🌊 Les zombies arrivent par <b>vagues</b>. Entre deux vagues, une <b>pause</b> vous laisse aller aux établis et aux refuges (${touch ? 'bouton ▶' : `touche ${Inventory.label('wave')}`} pour lancer la suivante).</li>
        <li>🧱 Pendant la pause, <b>fortifiez</b> (${touch ? 'bouton « Fortifier »' : `touche ${Inventory.label('build')}`}) : barricades, sacs de sable et pieux que la horde doit casser.</li>
        <li>🚗 Accomplissez les <b>objectifs</b> pour récupérer 4 pièces de voiture, réparez-la et <b>évadez-vous</b>.</li>
        <li>🔩 La ferraille de la partie sert aux établis et aux refuges ; une part va dans votre <b>réserve</b> à la fin.</li>
        <li>🎖️ Dans la Préparation, créez vos <b>classes</b> : arme principale, secondaire, explosifs et atouts.</li>
      </ul>
      ${reward ? `<p class="banked">🎁 +${reward} 🔩 versés dans la réserve</p>` : ''}
      <button class="btn" data-action="play">▶ Première vraie partie</button>
      <button class="btn small ghost" data-action="menu">🧍 Préparation</button>
    `, 500);
  },

  tick(g) {
    this.tickTutorial(g);
    this.tickContext(g);
    this.tickAbility(g);
    this.tickHotbar(g);
    if (g.state === 'revive') {
      const bar = this.el.querySelector('.rv-timer i'), cnt = this.el.querySelector('.rv-count');
      if (bar) bar.style.width = `${Math.max(0, g.reviveT / REVIVE.choiceTime * 100)}%`;
      if (cnt) cnt.textContent = `(${Math.ceil(g.reviveT)})`;
    }
    if (this.btnRoll.classList.contains('hidden')) { if (g.state === 'playing' && Input.mode === 'touch' && !this.hudBtns.classList.contains('hidden')) this.btnRoll.classList.remove('hidden'); return; }
    const p = g.player;
    if (!p) return;
    // bouton roulade : jauge d'endurance (charges) en anneau
    const k = p.stamina / p.staminaMax, n = Math.floor(p.stamina);
    this.btnRoll.style.setProperty('--cd', `${Math.round(k * 360)}deg`);
    this.btnRoll.classList.toggle('ready', n >= 1);
    if (this._rollN !== n) { this._rollN = n; this.btnRoll.dataset.n = n; }
  },

  /** Bouton de capacité spéciale : icône du personnage, recharge en anneau, touche sur PC */
  tickAbility(g) {
    const p = g.player, show = g.state === 'playing' && p && !p.inside;
    this.btnAbility.classList.toggle('hidden', !show);
    if (!show) return;
    const a = Fun.ability(g), cd = Math.max(0, p.abilityT || 0), max = a.cd * (p.abilityCdMult || 1);
    const sig = `${a.icon}${Inventory.label('ability')}${Input.mode}`;
    if (this._abSig !== sig) { this._abSig = sig; this.btnAbility.querySelector('.ic').textContent = a.icon; this.btnAbility.querySelector('.k').textContent = Input.mode === 'touch' ? '' : Inventory.label('ability'); this.btnAbility.title = `${a.name} : ${a.desc}`; }
    this.btnAbility.style.setProperty('--cd', `${Math.round((1 - cd / max) * 360)}deg`);
    this.btnAbility.classList.toggle('ready', cd <= 0);
  },

  /** Boutons contextuels : « Entrer » près d'une porte, « Lancer la vague » pendant la pause */
  tickContext(g) {
    const p = g.player, playing = g.state === 'playing' && p && !p.inside;
    const touch = Input.mode === 'touch';
    let door = null;
    if (playing) door = World.nearDoor(p.x, p.y, 60);
    const s = door && g.shelters[door];
    const bench = playing && !door ? Gunsmith.near(p.x, p.y) : -1;
    const actTxt = door ? (s.broken ? `🚫 ${SHELTERS[door].name} · porte enfoncée` : `${SHELTERS[door].icon} Entrer · ${SHELTERS[door].name}${touch ? '' : ` (${Inventory.label('interact')})`}`)
      : bench >= 0 ? `${BENCHES[bench].big ? '🔫 Armurerie · Armes et pièces' : '🔧 Établi · Améliorer l\'arme'}${touch ? '' : ` (${Inventory.label('interact')})`}` : '';
    if (this._act !== actTxt) {
      this._act = actTxt;
      this.btnAction.textContent = actTxt;
      this.btnAction.classList.toggle('hidden', !actTxt);
      this.btnAction.classList.toggle('off', !!(s && s.broken));
    }
    const buildTxt = playing && g.build && !g.build.on && Forts.canBuild(g) ? `🧱 Fortifier${touch ? '' : ` (${Inventory.label('build')})`}` : '';
    if (this._build !== buildTxt) { this._build = buildTxt; this.btnBuild.textContent = buildTxt; this.btnBuild.classList.toggle('hidden', !buildTxt); }
    this.tickBuild(g, touch);
    const nextTxt = playing && g.phase === 'break' ? `▶ Vague ${g.wave.num + 1} · ${Math.ceil(g.breakT)} s${touch ? '' : ` (${Inventory.label('wave')})`}` : '';
    if (this._next !== nextTxt) {
      this._next = nextTxt;
      this.btnNext.textContent = nextTxt;
      this.btnNext.classList.toggle('hidden', !nextTxt);
    }
    // panneau de refuge : PV de la porte + soins en direct
    if (p && p.inside && g.state === 'playing') {
      const bar = this.el.querySelector('.door-bar i'), hp = this.el.querySelector('.sh-hp'), lbl = this.el.querySelector('.door-lbl'), coins = this.el.querySelector('.sh-coins');
      const sh = g.shelters[p.inside];
      if (bar) bar.style.width = `${Math.max(0, sh.hp / sh.max * 100)}%`;
      if (lbl) lbl.textContent = g.phase === 'wave' && g.enemies.some(e => { const d = World.doorOf(p.inside); return Math.hypot(e.x - d.x, e.y - d.y) < e.r + 34; }) ? '⚠️ Ils enfoncent la porte !' : g.phase === 'break' ? `Pause · ${Math.ceil(g.breakT)} s` : 'Porte tenue';
      if (hp) hp.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      if (coins) coins.textContent = g.coins;
    }
  },

  /** Barre du mode construction : choix de la fortification, prix, nombre posé, aide */
  tickBuild(g, touch) {
    const B = g.build, show = !!(B && B.on && g.state === 'playing');
    this.buildBar.classList.toggle('hidden', !show);
    if (!show) return;
    const sig = `${B.kind}|${g.coins}|${g.forts.length}|${touch}`;
    if (sig === this._buildSig) return;
    this._buildSig = sig;
    const items = Object.entries(FORTS).map(([id, F], i) => {
      const cost = Forts.cost(g, id);
      return `<button class="${B.kind === id ? 'on' : ''} ${g.coins < cost ? 'poor' : ''}" data-fort="${id}" title="${F.desc}"><span class="ic">${F.icon}</span><b>${F.name}</b><small>${cost} 🔩${touch ? '' : ` · ${i + 1}`}</small></button>`;
    }).join('');
    this.buildBar.innerHTML = `<div class="bb-head"><b>🧱 Fortifier</b><small>${g.forts.length} / ${FORT_MAX} · ${touch ? 'se pose devant vous' : 'clic : poser · clic droit : démonter (50 %)'}</small></div>
      <div class="bb-items">${items}</div>
      <div class="bb-act">${touch ? '<button class="place" data-place>Poser</button>' : ''}<button class="close" data-close>✕${touch ? '' : ' Échap'}</button></div>`;
  },

  /** lockMs : délai avant que les boutons soient cliquables (évite les taps accidentels) */
  open(html, lockMs = 0, cls = '', mode = '') {
    this.el.dataset.mode = mode; // 'title' / 'lobby' : fond transparent, la scène 3D reste visible
    if (mode !== 'lobby' && mode !== 'title') this.screen = this.screen === 'lobby' || this.screen === 'title' ? 'game' : this.screen;
    this.el.innerHTML = `<div class="panel ${cls}">${html}</div>`;
    this.el.classList.remove('hidden');
    this.lockUntil = performance.now() + lockMs;
    const panel = this.el.firstElementChild;
    if (lockMs) {
      panel.classList.add('locked');
      setTimeout(() => panel.classList.remove('locked'), lockMs);
    }
    this.el.scrollTop = 0;
  },

  hide() { this.el.classList.add('hidden'); this.el.innerHTML = ''; },

  /** Notification en haut de l'écran (succès débloqué…) */
  toast(title, sub) {
    const t = this.toastEl;
    t.innerHTML = `<b>${title}</b><span>${sub || ''}</span>`;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 3200);
  },

  /** Armes possédées (niveau, évolution) + pièces montées à l'établi */
  buildChips(g) {
    const chips = Object.entries(g.weapons || {}).map(([id, w]) => {
      const evo = w.evo && EVOLUTIONS.find(e => e.weapon === id);
      return `<span class="chip ${evo ? 'evo' : 'weapon'}">${evo ? evo.icon : WEAPONS[id].icon} ${evo ? evo.name : WEAPONS[id].name} niv. ${w.lvl}</span>`;
    });
    const parts = Object.values(g.gunMods || {}).reduce((s, m) => s + Object.values(m).reduce((a, b) => a + b, 0), 0);
    if (parts) chips.push(`<span class="chip">🔧 ${parts} pièce${parts > 1 ? 's' : ''} d'arme</span>`);
    return chips.length ? `<div class="chips">${chips.join('')}</div>` : '';
  },

  bank() { return `<div class="bank">🔩 Réserve : <b>${Save.data.bank}</b></div>`; },
  back() { return '<button class="btn small ghost" data-action="menu">← Retour</button>'; },

  /* ------------------------------ écran titre ------------------------------ */
  showTitle(best) {
    this.screen = 'title';
    this.previewChar = null;
    const touch = Input.mode === 'touch';
    this.open(`
      <div class="title-top">
        <img class="title-logo" src="icons/icon.svg" alt="">
        <h1 class="title">DEAD<span>SAND</span></h1>
        <p class="tag">Votre voiture a calé en plein désert. La horde arrive.</p>
        <p class="who-title">${this.levelBadge()} ${Cosmetics.playerName()} · <span>${Cosmetics.title()}</span></p>
      </div>
      <div class="title-bottom">
        <button class="btn big" data-action="start" autofocus>Commencer</button>
        <button class="btn small ${Save.data.tutDone ? 'ghost' : 'tut-new'} title-set" data-action="tutorial">🎓 Tutoriel${Save.data.tutDone ? '' : ' (2 min)'}</button>
        <button class="btn small ghost title-set" data-action="settings">⚙️ Paramètres</button>
        ${best.score ? `<p class="best">Record : <b>${best.score}</b> pts · vague ${best.wave}</p>` : ''}
        ${Render.softGL ? '<p class="hint warn">⚠️ Accélération graphique désactivée dans ce navigateur : le jeu sera lent (voir ⚙️ Paramètres).</p>' : ''}
        <p class="press">${touch ? 'Touchez « Commencer »' : 'Appuyez sur Entrée'}</p>
      </div>
    `, 300, 'title-screen', 'title');
  },

  /* ------------------------------ préparation (lobby) ------------------------------ */
  /** Caractéristiques d'un personnage, calculées sur un joueur fictif */
  charStats(id) {
    const p = Entities.createPlayer(); CHARACTERS[id].apply(p);
    const b = Entities.createPlayer();
    return [
      ['❤️ Vie', p.maxHp, p.maxHp / (b.maxHp * 1.6)],
      ['👟 Vitesse', `${Math.round(p.speed / b.speed * 100)} %`, p.speed / (b.speed * 1.3)],
      ['💥 Dégâts', `${Math.round(p.weapon.damage / b.weapon.damage * 100)} %`, p.weapon.damage / (b.weapon.damage * 1.3)],
      ['🛡️ Armure', p.armor, (p.armor + 1) / 5],
    ];
  },

  showLobby(tab = this.tab || 'chars') {
    this.tab = tab;
    const S = Save.data, sel = CHARACTERS[S.char];
    const tabs = [['classes', '🎖️', 'Classes'], ['chars', '🧍', 'Équipe'], ['missions', '🎯', 'Missions'], ['garage', '🎨', 'Garage'], ['ach', '🏆', 'Succès'], ['options', '⚙️', 'Options']];
    const body = { classes: () => this.tabClasses(), chars: () => this.tabChars(), missions: () => this.tabMissions(), garage: () => this.tabGarage(), ach: () => this.tabAch(), options: () => this.tabOptions() }[tab]();
    const inner = `
      <div class="lobby-head">
        <div><h2>Préparation</h2><div class="who">${this.levelBadge()} ${Cosmetics.playerName()} · <span>${Cosmetics.title()}</span></div></div>
        <span class="bank">🔩 <b>${S.bank}</b></span>
      </div>
      <div class="tabs">${tabs.map(([id, ic, nm]) => `<button class="${id === tab ? 'on' : ''}" data-action="tab" data-tab="${id}"><span>${ic}</span>${nm}</button>`).join('')}</div>
      <div class="lobby-body">${body}</div>
      <div class="lobby-foot">
        <button class="btn" data-action="play">▶ Lancer la partie <span class="muted">· ${sel.name} · ${Loadout.current().name}${runModsChosen().length ? ` · ${runModsChosen().map(m => m.icon).join('')} +${Math.round(runModsBonus(runModsChosen()) * 100)} %` : ''}</span></button>
        <div class="foot-links"><button class="link" data-action="title">← Écran titre</button><button class="link" data-action="tutorial">🎓 ${S.tutDone ? 'Refaire le tutoriel' : 'Tutoriel (2 min) · +150 🔩'}</button></div>
      </div>`;
    const panel = this.screen === 'lobby' && this.el.querySelector('.panel.lobby');
    if (panel) { // simple changement d'onglet : pas d'animation d'ouverture
      const scroll = tab === this._lastTab ? panel.querySelector('.lobby-body').scrollTop : 0;
      panel.innerHTML = inner; panel.querySelector('.lobby-body').scrollTop = scroll;
    } else this.open(inner, 0, 'lobby', 'lobby');
    this._lastTab = tab;
    this.screen = 'lobby';
  },

  /** Création de classe (façon Call of Duty) : 3 classes, arme principale, létal, tactique, 3 atouts */
  tabClasses() {
    const S = Save.data, list = Loadout.classes(), sel = S.classSel, L = Loadout.current(), lvl = Loadout.level(), pick = this.classPick;
    const P = PRIMARIES[L.primary];
    const lock = it => (Loadout.open(it) ? '' : `<span class="cl-lock">🔒 Niv. ${it.level}</span>`);
    const slots = list.map((c, i) => `<button class="${i === sel ? 'on' : ''}" data-action="clsSel" data-i="${i}"><b>${(c.name || `Classe ${i + 1}`).replace(/[<>&"]/g, '')}</b><small>${PRIMARIES[c.primary] ? PRIMARIES[c.primary].icon : '🔫'} ${i === sel ? '✔ Utilisée' : 'Choisir'}</small></button>`).join('');
    const row = (key, label, icon, name, sub, color, extra = '') => `<button class="cl-row ${pick === key ? 'open' : ''}" data-action="clsPick" data-slot="${key}" style="--c:${color}">
        <span class="cl-lbl">${label}</span><span class="ic">${icon}</span><span class="txt"><b>${name}</b><small>${sub}</small>${extra}</span><span class="cl-arrow">${pick === key ? '▲' : '▼'}</span></button>`;
    const bars = Object.entries(P.bars).map(([n, v]) => `<div class="cl-bar"><span>${n}</span><i><em style="width:${Math.round(v * 100)}%"></em></i></div>`).join('');
    // liste de choix sous la ligne ouverte
    const picker = (key, items) => (pick !== key ? '' : `<div class="cl-pick">${items.map(([id, ic, nm, ds, it, on]) => `<button class="${on ? 'on' : ''} ${Loadout.open(it) ? '' : 'locked'}" data-action="clsSet" data-slot="${key}" data-id="${id}" ${Loadout.open(it) ? '' : 'disabled'}><span class="ic">${ic}</span><span class="txt"><b>${nm}${on ? ' ✔' : ''}</b><small>${ds}</small></span>${lock(it)}</button>`).join('')}</div>`);
    const pk = i => Loadout.perk(i, L.perks[i]);
    const add = list.length < MAX_CLASSES ? '<button class="cl-add" data-action="clsNew" title="Créer une nouvelle classe"><b>+</b><small>Nouvelle</small></button>' : '';
    let html = `<div class="cl-slots">${slots}${add}</div>
      <div class="opt cl-name"><span>Nom de la classe</span><input id="class-name-input" class="name-input" maxlength="14" value="${(list[sel].name || '').replace(/"/g, '&quot;')}">${list.length > 1 ? '<button class="link cl-del" data-action="clsDel" title="Supprimer cette classe">🗑️</button>' : ''}</div>`;
    const wl = id => { const w = Progress.wLevel(id); return `<span class="wl-tag">Arme niv. ${w.lvl}${w.max ? '' : ` · ${w.kills}/${w.next}`}</span>`; };
    html += row('primary', 'PRINCIPALE', P.icon, `${P.name} ${wl(L.primary)}`, P.desc, '#ffc21a', `<span class="cl-bars">${bars}</span>`);
    html += picker('primary', Object.entries(PRIMARIES).map(([id, it]) => [id, it.icon, it.name, `${it.desc} · arme niv. ${Progress.wLevel(id).lvl}`, it, id === L.primary]));
    const Sx = SECONDARIES[L.secondary];
    html += row('secondary', 'SECOND&shy;AIRE', Sx.icon, `${Sx.name} ${wl(L.secondary)}`, `${Sx.desc} · touche ${Inventory.label('slot2')} ou ${Inventory.label('next')}`, '#c9d2da');
    html += picker('secondary', Object.entries(SECONDARIES).map(([id, it]) => [id, it.icon, it.name, `${it.desc} · arme niv. ${Progress.wLevel(id).lvl}`, it, id === L.secondary]));
    html += row('lethal', 'LÉTAL', WEAPONS[L.lethal].icon, WEAPONS[L.lethal].name, `${LETHALS[L.lethal].desc} · touche ${Inventory.label('grenade')}`, '#ff8a3a');
    html += picker('lethal', Object.entries(LETHALS).map(([id, it]) => [id, WEAPONS[id].icon, WEAPONS[id].name, it.desc, it, id === L.lethal]));
    html += row('tactical', 'TACTIQUE', WEAPONS[L.tactical].icon, WEAPONS[L.tactical].name, `${TACTICALS[L.tactical].desc}${WEAPONS[L.tactical].type === 'manual' ? ` · touche ${Inventory.label('mine')}` : ''}`, '#3ad6ff');
    html += picker('tactical', Object.entries(TACTICALS).map(([id, it]) => [id, WEAPONS[id].icon, WEAPONS[id].name, it.desc, it, id === L.tactical]));
    for (let i = 0; i < 3; i++) {
      html += row('perk' + i, `ATOUT ${i + 1}`, pk(i).icon, pk(i).name, pk(i).desc, PERK_COLORS[i]);
      html += picker('perk' + i, PERKS[i].map(it => [it.id, it.icon, it.name, it.desc, it, it.id === L.perks[i]]));
    }
    const next = [...Object.values(PRIMARIES), ...Object.values(SECONDARIES), ...Object.values(LETHALS), ...Object.values(TACTICALS), ...PERKS.flat()].filter(it => it.level > lvl).sort((a, b) => a.level - b.level)[0];
    return html + `<p class="hint">Votre arme et votre équipement s'améliorent ensuite aux établis 🔧 pendant la partie.${next ? ` Prochain déblocage au <b>niveau ${next.level}</b> (vous êtes niveau ${lvl}).` : ''}</p>`;
  },

  /** Pastille de niveau avec petite barre d'expérience */
  levelBadge() {
    const l = Progress.level(), k = l >= LEVELS.max ? 1 : Progress.xp() / LEVELS.xpFor(l), pr = Progress.prestige();
    return `<span class="lvl-badge ${pr ? 'prestige' : ''}" title="Niveau de survivante${pr ? ` · prestige ${pr}` : ''}">${pr ? `⭐${pr} · ` : ''}Niv. ${l}<i style="width:${Math.round(k * 100)}%"></i></span>`;
  },

  /** Missions du jour / de la semaine + niveau de survivante */
  tabMissions() {
    const M = Progress.missions(), l = Progress.level(), need = LEVELS.xpFor(l), xp = Progress.xp(), nx = Progress.nextUnlock();
    const row = m => {
      const d = Progress.def(m), r = Progress.reward(m), k = U.clamp(m.prog / m.n, 0, 1);
      return `<div class="mis ${m.done ? 'done' : ''}"><span class="ic">${d.icon}</span>
        <span class="txt"><b>${Progress.text(m)}</b><span class="mbar"><i style="width:${Math.round(k * 100)}%"></i></span><small>${m.done ? '✔ Accomplie' : `${m.prog} / ${m.n}`}</small></span>
        <span class="rw">+${r.bank} 🔩<br>+${r.xp} XP</span></div>`;
    };
    return `<div class="lvl-card"><div><b>Niveau ${l}</b>${l < LEVELS.max ? `<small>${xp} / ${need} XP</small>` : '<small>Niveau maximum</small>'}</div>
        <div class="xp-bar static"><i style="width:${l >= LEVELS.max ? 100 : Math.round(xp / need * 100)}%"></i></div>
        <p class="hint">Chaque partie rapporte de l'expérience, même perdue. Chaque niveau : +${LEVELS.bank(l + 1)} 🔩 en réserve${nx ? ` · prochain cadeau au niveau ${nx.level} : ${nx.icon} ${nx.name}` : ''}.</p></div>
      ${this.prestigeBlock()}
      <h3>Missions du jour <small class="muted">· renouvelées dans ${Progress.left(false)}</small></h3>
      <div class="mis-list">${M.daily.map(row).join('')}</div>
      <h3>Mission de la semaine <small class="muted">· encore ${Progress.left(true)}</small></h3>
      <div class="mis-list">${row(M.weekly)}</div>
      <p class="hint">Les missions avancent à la fin de chaque partie ; la récompense est versée automatiquement.</p>
      ${this.weaponsBlock()}`;
  },

  /** Prestige : au niveau 50, repartir au niveau 1 en gardant tout */
  prestigeBlock() {
    const pr = Progress.prestige(), next = pr + 1;
    const rewards = COSMETICS.filter(c => c.prestige === next).map(c => `${c.icon} ${c.name}`).join(' · ');
    if (!Progress.canPrestige()) return pr ? `<p class="hint">⭐ Prestige ${pr}${pr >= PRESTIGE.max ? ' (maximum)' : ` · prochain prestige au niveau ${LEVELS.max}`}. Tous vos déblocages sont conservés.</p>` : `<p class="hint">⭐ Au niveau ${LEVELS.max}, vous pourrez passer <b>prestige</b> : retour au niveau 1, en gardant tout ce qui est débloqué, plus des récompenses exclusives.</p>`;
    return `<div class="prestige-card">
      <b>⭐ Prestige ${next} disponible !</b>
      <span>Retour au niveau 1 · vous gardez armes, atouts, tenues et peintures · +${PRESTIGE.bank} 🔩${rewards ? ` · ${rewards}` : ''}</span>
      ${this.prestigeAsk ? `<div class="menu-grid two"><button class="btn small" data-action="prestige">Confirmer le prestige ${next}</button><button class="btn small ghost" data-action="prestigeNo">Annuler</button></div>`
        : '<button class="btn small" data-action="prestigeAsk">Passer prestige</button>'}
    </div>`;
  },

  /** Niveaux d'armes et défis de camouflage */
  weaponsBlock() {
    const rowW = (id, it) => {
      const w = Progress.wLevel(id), k = w.max ? 1 : (w.kills - w.prev) / (w.next - w.prev), open = Loadout.open(it);
      return `<div class="wl-row ${open ? '' : 'locked'}"><span class="ic">${it.icon}</span><span class="txt"><b>${it.name} <small>· niv. ${w.lvl}${w.max ? ' (max)' : ''}</small></b>
        <span class="mbar"><i style="width:${Math.round(k * 100)}%"></i></span><small>${open ? `${w.kills} éliminations${w.max ? '' : ` · niveau ${w.lvl + 1} à ${w.next}`}` : `🔒 Niveau ${it.level} de survivante`}</small></span></div>`;
    };
    const weapons = [...Object.entries(PRIMARIES), ...Object.entries(SECONDARIES)].map(([id, it]) => rowW(id, it)).join('');
    const camos = COSMETICS.filter(c => c.wchal).map(c => {
      const ch = Progress.wchal(c.wchal), k = ch.have / ch.n;
      return `<div class="wl-row ${ch.done ? 'done' : ''}"><span class="ic">${c.icon}</span><span class="txt"><b>${c.name}${ch.done ? ' ✔' : ''}</b>
        <span class="mbar"><i style="width:${Math.round(k * 100)}%"></i></span><small>${c.wchal.t} · ${ch.have} / ${ch.n}</small></span></div>`;
    }).join('');
    return `<h3>Niveaux d'armes <small class="muted">· pièces III au niveau 3, IV au niveau 5</small></h3><div class="wl-list">${weapons}</div>
      <h3>Défis de camouflage <small class="muted">· peintures à équiper au Garage ou à l'établi</small></h3><div class="wl-list">${camos}</div>`;
  },

  tabChars() {
    const S = Save.data, pid = this.previewChar || S.char, pc = CHARACTERS[pid];
    const list = Object.entries(CHARACTERS).map(([id, c]) => {
      const owned = charOwned(id);
      return `<button class="char ${id === pid ? 'on' : ''} ${owned ? '' : 'locked'}" data-action="preview" data-id="${id}">
        <span class="av">${{ swat: '🪖', scout: '🏃‍♀️', mechanic: '🔧', medic: '🩺' }[id] || '🧍‍♀️'}</span>
        <span class="nm">${c.name}</span><span class="rl">${owned ? (S.char === id ? '✔ Choisie' : c.role) : c.unlock ? '🔒 Évasion' : `🔒 ${c.cost} 🔩`}</span>
      </button>`;
    }).join('');
    const stats = this.charStats(pid).map(([n, v, k]) => `<div class="stat"><span>${n}</span><div class="sbar"><i style="width:${Math.round(U.clamp(k, 0.05, 1) * 100)}%"></i></div><b>${v}</b></div>`).join('');
    const owned = charOwned(pid);
    const act = S.char === pid ? '<span class="tagline ok">✔ Personnage sélectionné</span>'
      : owned ? `<button class="btn small" data-action="selectChar" data-id="${pid}">Choisir ${pc.name}</button>`
      : pc.unlock ? '<span class="tagline">🔒 Se débloque en réparant la voiture et en vous évadant</span>'
      : `<button class="btn small" data-action="buyChar" data-id="${pid}" ${S.bank < pc.cost ? 'disabled' : ''}>Débloquer · ${pc.cost} 🔩</button>`;
    return `<div class="char-list">${list}</div>
      <div class="char-card">
        <div class="char-name">${pc.name} <small>${pc.role}</small></div>
        <p class="ds">${pc.desc}</p>
        <div class="stats-bars">${stats}</div>
        ${act}
      </div>
      ${dogLevel() ? '<p class="hint center">🐺 Rex vous accompagne sur le terrain.</p>' : `<p class="hint center">🐺 Rex le chien vous rejoint au niveau ${DOG_LEVELS[0]} de survivante.</p>`}
      <div class="ab-card"><span class="ic">${(ABILITIES[pid] || ABILITIES.survivor).icon}</span><span><b>Capacité : ${(ABILITIES[pid] || ABILITIES.survivor).name}</b><small>${(ABILITIES[pid] || ABILITIES.survivor).desc} · recharge ${(ABILITIES[pid] || ABILITIES.survivor).cd} s · touche ${Inventory.label('ability')}</small></span></div>
      ${this.modsBlock()}`;
  },

  /** Règles de partie facultatives : plus dur, plus de ferraille et d'XP */
  modsBlock() {
    const on = (Save.data.settings.runMods) || {}, bonus = runModsBonus(runModsChosen());
    const maps = Object.values(MAPS).map(m => {
      const open = mapOpen(m.id), cur = MAP.id === m.id;
      return `<button class="${cur ? 'on' : ''} ${open ? '' : 'locked'}" data-action="map" data-id="${m.id}" ${open ? '' : 'disabled'}><span>${m.icon}</span><b>${m.name}</b><small>${cur ? '✔ Sélectionnée' : open ? `Choisir (recharge le jeu)${m.night ? ' · toujours la nuit' : ''}` : MAP_REQ[m.id].text}</small></button>`;
    }).join('');
    return `<h3>Carte</h3><div class="map-pick">${maps}</div>
      <h3>Règles de la partie <small class="muted">· facultatif</small></h3>
      <p class="hint">Plus dur, mais plus de ferraille et d'XP${bonus ? ` · <b class="ok">+${Math.round(bonus * 100)} % actuellement</b>` : ''}.</p>
      <div class="mods-pick">${RUN_MODS.map(m => `<button class="${on[m.id] ? 'on' : ''}" data-action="mod" data-id="${m.id}" title="${m.desc}"><span>${m.icon}</span><b>${m.name}</b><small>${m.desc}</small><em>+${Math.round(m.bonus * 100)} %</em></button>`).join('')}</div>`;
  },

  /** Garage : personnalisation, aperçu en direct sur le parking */
  tabGarage() {
    const S = Save.data, cat = this.garageCat || 'outfit';
    const chips = COS_CATS.map(([id, ic, nm]) => `<button class="${id === cat ? 'on' : ''}" data-action="gcat" data-cat="${id}">${ic} ${nm}</button>`).join('');
    let items = COSMETICS.filter(c => c.cat === cat);
    let note = '';
    if (cat === 'outfit') { items = items.filter(c => c.char === S.char); note = `<p class="hint">Tenues de <b>${CHARACTERS[S.char].name}</b> · changez de personnage dans l'onglet Équipe.</p>`; }
    if (cat === 'dog' && !dogLevel()) note = `<p class="hint">Rex vous rejoint au niveau ${DOG_LEVELS[0]} de survivante. Vous pouvez déjà préparer son look.</p>`;
    if (cat === 'title') note = `<p class="hint">Affiché à côté de votre pseudo (« ${Cosmetics.playerName()} », modifiable dans Options). Les titres s'obtiennent avec les succès.</p>`;
    if (cat === 'theme') note = '<p class="hint">Ambiance du parking sur l\'écran titre et dans la Préparation.</p>';
    // regroupement par emplacement (voiture : peinture / autocollant / équipement…)
    const slots = [...new Set(items.map(i => i.slot))];
    const slotNames = { car_paint: 'Peinture', car_decal: 'Autocollant', car_kit: 'Équipement', dog_breed: 'Race', dog_acc: 'Accessoire', tracer: 'Balles traçantes', kill: 'Mort des zombies', trail: 'Traînée de roulade' };
    const rows = slots.map(slot => {
      const eq = Cosmetics.eq(slot);
      const list = items.filter(i => i.slot === slot).map(it => {
        const own = Cosmetics.owned(it), on = eq && eq.id === it.id;
        const act = on ? '<span class="tagline ok">✔ Équipé</span>'
          : own ? `<button class="btn small ghost" data-action="cosEquip" data-id="${it.id}">Équiper</button>`
          : it.price ? `<button class="btn small" data-action="cosBuy" data-id="${it.id}" ${S.bank < it.price ? 'disabled' : ''}>${it.price} 🔩</button>`
          : `<span class="lock">${Cosmetics.lockText(it)}</span>`;
        const swatch = it.color ? `<i class="sw" style="background:${it.color}"></i>` : '';
        return `<div class="shop-row ${on ? 'on' : ''} ${own ? '' : 'locked'}"><span class="ic">${it.icon}</span><span class="txt"><b>${swatch}${it.name}</b></span>${act}</div>`;
      }).join('');
      return `${slots.length > 1 ? `<h3>${slotNames[slot] || ''}</h3>` : ''}<div class="shop-list">${list}</div>`;
    }).join('');
    return `<div class="chips-row">${chips}</div>${note}${rows}`;
  },

  tabAch() {
    const S = Save.data;
    // les 10 meilleures parties (sur cet appareil)
    const names = { rifle: 'Fusil', shotgun: 'Pompe', flamer: 'Flammes', boom: 'Explosions', drone: 'Drone', turret: 'Tourelles', trap: 'Barbelés', dog: 'Rex', ally: 'Survivants' };
    const board = (S.board || []).map((r, i) => `<tr class="${i < 3 ? 'top' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><b>${r.score}</b></td><td>V${r.wave}${r.win ? ' 🚗' : ''}</td><td>${CHARACTERS[r.char] ? CHARACTERS[r.char].name : ''}</td><td>${names[r.fav] || ''}</td><td>${r.mods ? `⚙️${r.mods}` : ''}</td><td class="muted">${r.date}</td></tr>`).join('');
    const boardHtml = `<h3>🏅 Meilleures parties</h3>${board ? `<table class="board"><thead><tr><th></th><th>Score</th><th>Vague</th><th>Perso</th><th>Arme</th><th></th><th></th></tr></thead><tbody>${board}</tbody></table>` : '<p class="hint">Jouez une partie pour inscrire votre premier score.</p>'}${this.onlineBlock()}<h3>🏆 Succès</h3>`;
    return `${boardHtml}<p class="sub">${Object.keys(S.ach).length} / ${ACHIEVEMENTS.length} débloqués · ${S.stats.kills} zombies abattus · ${S.stats.runs} parties</p>
      <div class="ach-list">${ACHIEVEMENTS.map(a => `<div class="ach ${S.ach[a.id] ? 'done' : ''}"><span class="ic">${S.ach[a.id] ? a.icon : '🔒'}</span>
        <span><b>${a.name}</b><small>${a.desc}</small></span></div>`).join('')}</div>`;
  },

  /** Classement en ligne entre amis (js/online.js) : code de groupe + 20 meilleurs scores, chargés en arrière-plan */
  onlineBlock() {
    if (!Online.enabled()) return `<h3>🌐 Classement entre amis</h3><p class="hint">Pas encore activé sur ce site. La personne qui publie le jeu peut le brancher sur un projet Supabase gratuit (voir le README).</p>`;
    const grp = Online.group(), esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, '');
    let list = '<p class="hint">Choisissez un code de groupe (le même que vos amis) : vos scores y seront envoyés à la fin de chaque partie.</p>';
    if (grp.length >= 3) {
      const c = Online.cache[grp];
      if (!c) { list = '<p class="hint">Chargement du classement…</p>'; Online.top(grp).then(() => { if (this.screen === 'lobby' && this.tab === 'ach') this.showLobby('ach'); }); }
      else if (c.error) list = `<p class="hint warn">⚠️ ${c.error} · le classement sera rechargé plus tard.</p>`;
      else if (!c.rows.length) list = '<p class="hint">Aucun score dans ce groupe pour l\'instant : à vous de jouer !</p>';
      else list = `<table class="board"><thead><tr><th></th><th>Joueur</th><th>Score</th><th>Vague</th><th>Perso</th></tr></thead><tbody>${c.rows.map((r, i) => `<tr class="${i < 3 ? 'top' : ''} ${r.name === Cosmetics.playerName() ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><b>${r.prestige ? `⭐${esc(r.prestige)} ` : ''}${esc(r.name)}</b></td><td>${esc(r.score)}</td><td>V${esc(r.wave)}${r.win ? ' 🚗' : ''}</td><td>${CHARACTERS[r.char] ? CHARACTERS[r.char].name : ''}${MAPS[r.map] ? ` ${MAPS[r.map].icon}` : ''}</td></tr>`).join('')}</tbody></table>`;
    }
    return `<h3>🌐 Classement entre amis</h3>
      <div class="opt"><span>Code du groupe</span><input id="group-input" class="name-input" maxlength="24" placeholder="ex. LES-POTES" value="${esc(grp)}"></div>
      ${grp && Cosmetics.playerName() === 'Survivante' ? '<p class="hint">Astuce : choisissez un pseudo dans Options pour qu\'on vous reconnaisse.</p>' : ''}
      ${list}`;
  },

  /** Paramètres hors Préparation (écran titre ou partie en pause) : même contenu que l'onglet Options */
  showSettings(ctx) {
    this.optCtx = ctx;
    const inner = `<div class="set-head"><h2>⚙️ Paramètres</h2><button class="btn small ghost" data-action="settingsBack">← ${ctx === 'pause' ? 'Retour à la pause' : 'Retour'}</button></div>
      <div class="set-body">${this.tabOptions()}</div>`;
    const panel = this.screen === 'settings' && this.el.querySelector('.panel.settings');
    if (panel) { const sc = panel.querySelector('.set-body').scrollTop; panel.innerHTML = inner; panel.querySelector('.set-body').scrollTop = sc; }
    else this.open(inner, 0, 'settings', '');
    this.screen = 'settings';
  },
  /** Redessine les options là où elles sont affichées (Préparation ou panneau Paramètres) */
  refreshOptions() { if (this.screen === 'settings') this.showSettings(this.optCtx); else this.showLobby('options'); },

  tabOptions() {
    const s = Save.data.settings, touch = Input.mode === 'touch', inRun = !!(Game.player && Game.state === 'paused');
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(s[key]) === String(v) ? 'on' : ''}" data-action="set" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
    const vol = [[0, '0'], [0.25, '25'], [0.5, '50'], [0.8, '80'], [1, '100']];
    return `
      <p class="hint">Échap (ou Start à la manette) met aussi la partie en pause.</p>
      <div class="opt"><span>Pseudo</span><input id="name-input" class="name-input" maxlength="16" placeholder="Survivante" value="${(Save.data.name || '').replace(/"/g, '&quot;')}"></div>
      <div class="opt"><span>Qualité graphique</span>${seg('quality', [['auto', 'Auto'], ['high', 'Haute'], ['low', 'Éco']])}</div>
      <p class="hint">Si le jeu rame : choisissez <b>Éco</b> (sans ombres ni halo, résolution réduite). Économie : pour les téléphones et PC modestes. ${inRun ? 'S\'appliquera au prochain lancement du jeu (la partie en cours n\'est pas interrompue).' : 'Appliqué au rechargement.'}</p>
      <p class="hint">Carte graphique : ${Render.gpuName ? Render.gpuName.replace(/^ANGLE \((.*)\)$/, '$1').split(',').slice(0, 2).join(',').replace(/ \(0x[0-9a-f]+\)/i, '') : 'inconnue'}${s.quality === 'auto' && Render.aqLevel ? ` · allègement automatique ${Render.aqLevel}/6` : ''}</p>
      ${Render.softGL ? '<p class="hint warn">⚠️ Votre navigateur n\'utilise pas la carte graphique (rendu logiciel) : le jeu sera lent. Activez « l\'accélération matérielle » dans les paramètres du navigateur (Chrome / Edge : Paramètres → Système), puis relancez-le.</p>' : ''}
      <div class="opt"><span>Bruitages</span>${seg('sfx', vol)}</div>
      <div class="opt"><span>Musique</span>${seg('music', vol)}</div>
      <div class="opt"><span>Vibrations</span>${seg('vibrate', [[true, 'Oui'], [false, 'Non']])}</div>
      <div class="opt"><span>Afficher les images/s</span>${seg('fps', [[false, 'Non'], [true, 'Oui']])}</div>
      <div class="opt"><span>Hordes optimisées</span>${seg('vat', [[true, 'Oui'], [false, 'Non']])}</div>
      <p class="hint">Dessine la horde en un seul passage sur la carte graphique (3× plus rapide). Si des zombies s'affichent mal, choisissez « Non » puis rechargez la page.${Save.data.settings.vat !== false && Render.vat === null ? ' ⚠️ Non disponible sur cet appareil : mode classique utilisé.' : ''}</p>
      <div class="opt"><span>Sons enregistrés</span>${seg('realSfx', [[false, 'Non'], [true, 'Oui']])}</div>
      <p class="hint">Remplace quelques bruitages (explosions, portes, capacités, fanfares) par des sons enregistrés (Kenney, CC0). Désactivé par défaut.</p>
      ${inRun ? '' : '<button class="btn small ghost" data-action="reload">Appliquer et recharger</button>'}
      <h3>Touches</h3>
      ${touch ? '<p class="hint">Sur téléphone, l\'inventaire et la roulade se touchent directement à l\'écran. Ces touches servent avec un clavier.</p>' : '<p class="hint">Cliquez sur une touche puis appuyez sur la nouvelle (Échap pour annuler). Déplacements : ZQSD / WASD / flèches · molette : arme suivante.</p>'}
      <div class="binds">${Object.entries(BINDINGS).map(([id, b]) => `<div class="bind"><span>${b[2]}</span>
        <button class="key-btn ${this.rebinding === id ? 'wait' : ''}" data-action="rebind" data-id="${id}">${this.rebinding === id ? 'Appuyez…' : Inventory.label(id)}</button></div>`).join('')}</div>
      <button class="link" data-action="resetKeys">Rétablir les touches par défaut</button>
      <h3>Commandes</h3>
      <div class="controls">
        <div class="${touch ? '' : 'dim'}">👆 <b>Mobile</b> : pouce à gauche pour bouger, touchez un zombie ou un fût à droite pour le cibler, 🌀 pour rouler</div>
        <div class="${touch ? 'dim' : ''}">⌨️ <b>PC</b> : ZQSD / flèches, <b>clic</b> pour cibler (clic droit / Tab : relâcher), <b>${Inventory.label('roll')}</b> roulade, <b>${Inventory.label('interact')}</b> refuge, <b>${Inventory.label('wave')}</b> lancer la vague, <b>${Inventory.label('slot1')}-${Inventory.label('slot8')}</b> cases de l'inventaire (dans l'ordre), <b>${Inventory.label('grenade')}</b> grenade (vers la souris), <b>${Inventory.label('mine')}</b> mine, Échap pause</div>
        <div>🔫 Tir <b>automatique</b> · 🚗 4 pièces pour réparer la voiture et fuir · 💉 1re réanimation offerte</div>
      </div>`;
  },

  /* ------------------------------ réanimation ------------------------------ */
  showRevive(g, free, cost, canPay) {
    const bank = Save.data.bank;
    this.open(`
      <h2>À terre !</h2>
      <p class="sub">La horde se referme… une dernière chance ?</p>
      <div class="rv-timer"><i></i></div>
      <button class="btn big" data-action="revive" ${free || canPay ? '' : 'disabled'}>💉 Se relever · ${free ? 'gratuit' : `${cost} 🔩`}</button>
      <p class="hint center">${free ? (g.revives ? 'Réanimation offerte (Adrénaline).' : 'La première réanimation est offerte. Les suivantes coûtent de la ferraille.')
        : `Payé avec la ferraille de la partie (${g.coins}), puis la réserve (${bank}).${canPay ? '' : ' Pas assez de ferraille.'}`}</p>
      <p class="hint center">Vous repartez avec ${Math.round(REVIVE.hpRatio * 100)} % de vie et une onde de choc repousse la horde.</p>
      <button class="btn small ghost" data-action="giveup">Abandonner <span class="rv-count muted"></span></button>
    `, 600, 'revive');
  },

  /* ------------------------------ en partie ------------------------------ */
  showPause(g) {
    this.screen = 'pause';
    this.open(`
      <h2>Pause</h2>
      <p class="sub">Vague ${g.wave.num} · ${g.stats.score} pts · 🔩 ${g.coins}</p>
      ${this.buildChips(g)}
      <button class="btn" data-action="resume">Reprendre</button>
      <button class="btn small ghost" data-action="settings">⚙️ Paramètres</button>
      <button class="btn small ghost" data-action="quitAsk">Abandonner…</button>
    `);
  },

  /** Double vérification avant d'abandonner (évite les clics accidentels) */
  showQuitConfirm(g) {
    const share = bankShare(g.wave.num, g.victory);
    this.open(`
      <h2>Abandonner ?</h2>
      <p class="sub">La partie s'arrête ici.</p>
      <p class="hint center">${Math.floor(g.coins * share)} 🔩 sur ${g.coins} iraient dans la réserve (${Math.round(share * 100)} %).</p>
      <button class="btn" data-action="resume">Non, reprendre</button>
      <button class="btn small danger" data-action="quit">Oui, abandonner</button>
    `, 450);
  },

  /** Établi d'armurier : l'arme tourne en 3D à gauche (render3d), le panneau est à droite.
      Onglet Pièces : chaque pièce a 3 niveaux, visibles sur le modèle. Onglet Peinture : aperçu en direct. */
  showGunsmith(g) {
    const gs = g.gs; if (!gs) return;
    if (!Gunsmith.guns(g).includes(gs.gun)) gs.gun = Gunsmith.guns(g)[0];
    if (!Gunsmith.part(gs.gun, gs.part)) gs.part = GUN_PARTS[gs.gun].parts[0].id; // pièce d'une autre arme : on revient à la première
    const touch = Input.mode === 'touch', def = GUN_PARTS[gs.gun], P = PRIMARIES[g.primary] || PRIMARIES.rifle;
    const roman = ['0', 'I', 'II', 'III', 'IV'], gunTabs = '';
    const tabs = `<div class="gs-tabs">${[['parts', `${P.icon} Arme principale`], ['gear', '🎒 Équipement'], ['paint', '🎨 Peinture']].map(([id, nm]) => `<button class="${gs.tab === id ? 'on' : ''}" data-action="gsTab" data-tab="${id}">${nm}</button>`).join('')}</div>`;
    let body;
    if (gs.tab === 'gear') {
      // létal + tactique de la classe : niveaux 1→5, puis évolution
      const L = g.loadout || {}, rows = [[L.secondary, 'Secondaire', 'next'], [L.lethal, 'Létal', 'grenade'], [L.tactical, 'Tactique', 'mine']].filter(([id]) => id && WEAPONS[id]).map(([id, slot, key]) => {
        const w = WEAPONS[id], own = g.weapons[id], o = Gunsmith.weaponOffer(g, id), evo = EVOLUTIONS.find(e => e.weapon === id);
        const pips = Array.from({ length: w.max }, (_, k) => `<i class="${own && k < own.lvl ? 'on' : ''}"></i>`).join('');
        const type = w.type === 'manual' || w.type === 'secondary' ? `${slot} · touche ${Inventory.label(key)}` : `${slot} · automatique`;
        const desc = o.kind === 'level' ? `Niv. ${own.lvl + 1} : ${w.desc(own.lvl)}` : o.kind === 'evo' ? `${evo.icon} ${evo.name} : ${evo.desc.replace(/^ÉVOLUTION : /, '')}` : own && own.evo && evo ? `${evo.icon} ${evo.name}` : 'Niveau maximum';
        const btn = o.kind === 'max' || o.kind === 'none' ? '<span class="tagline ok">✔ MAX</span>'
          : `<button class="btn small ${o.kind === 'evo' ? 'evo' : ''}" data-action="gsWeapon" data-id="${id}" ${g.coins < o.cost ? 'disabled' : ''}>${o.kind === 'evo' ? 'Évoluer' : 'Niv. +1'} · ${o.cost} 🔩</button>`;
        return `<div class="gs-arm own ${own && own.evo ? 'evo' : ''}">
          <span class="ic">${own && own.evo && evo ? evo.icon : w.icon}</span>
          <span class="txt"><b>${w.name} <small>· ${type}</small></b><span class="cur">${desc}</span><span class="pips">${pips}</span></span>
          ${btn}
        </div>`;
      }).join('');
      body = `<p class="hint">L'arme secondaire et l'équipement de votre classe « ${(g.loadout && g.loadout.name) || ''} ». Au niveau 5, le létal et le tactique peuvent <b>évoluer</b>.</p><div class="gs-arms">${rows}</div>`;    } else if (gs.tab === 'parts') {
      const sel = Gunsmith.part(gs.gun, gs.part), selL = Gunsmith.lvl(g, gs.gun, gs.part);
      // barres de caractéristiques : actuel + gain de la pièce sélectionnée (en vert)
      const selMax = Gunsmith.maxOf(sel), now = Gunsmith.stats(g, gs.gun), next = selL < selMax ? Gunsmith.stats(g, gs.gun, gs.part) : now;
      const fmt = (v, u) => (u === '%' || u === '°' ? `${Math.round(v)}${u === '%' ? ' %' : '°'}` : v >= 20 ? Math.round(v) : Math.round(v * 10) / 10);
      const bars = now.map(([n, v, max, u], i) => {
        const nv = next[i][1], a = U.clamp(v / max, 0.03, 1), b = U.clamp(nv / max, 0.03, 1), up = nv > v + 1e-6;
        return `<div class="gs-stat ${up ? 'up' : ''}"><span>${n}</span><div class="gs-bar"><i style="width:${a * 100}%"></i>${up ? `<em style="left:${a * 100}%;width:${(b - a) * 100}%"></em>` : ''}</div><b>${fmt(v, u)}${up ? ` <small>→ ${fmt(nv, u)}</small>` : ''}</b></div>`;
      }).join('');
      const rows = def.parts.map(pt => {
        const l = Gunsmith.lvl(g, gs.gun, pt.id), mx = Gunsmith.maxOf(pt), on = pt.id === gs.part, cost = l < mx ? Gunsmith.partCost(g, l) : 0, lk = l < mx && !Gunsmith.levelOk(g, l + 1);
        const pips = Array.from({ length: mx }, (_, k) => `<i class="${k < l ? 'on' : ''}"></i>`).join('');
        return `<button class="gs-part ${on ? 'on' : ''} ${l >= mx ? 'max' : ''}" data-action="gsPart" data-id="${pt.id}" data-gs-hover="${pt.id}">
          <span class="ic">${pt.icon}</span>
          <span class="txt"><b>${pt.name} <small>· ${pt.stat}</small></b><span class="cur">${pt.lv[l]}</span></span>
          <span class="pips">${pips}</span>
          <span class="price">${l >= mx ? 'MAX' : lk ? `🔒 Arme niv. ${Gunsmith.partReq(l + 1)}` : `${cost} 🔩`}</span>
        </button>`;
      }).join('');
      const selCost = selL < selMax ? Gunsmith.partCost(g, selL) : 0, selOk = selL < selMax && Gunsmith.levelOk(g, selL + 1), can = selOk && g.coins >= selCost;
      const WL = Progress.wLevel(g.primary, g);
      const detail = selL < selMax
        ? `<div class="gs-next"><div><span class="lbl">Niveau ${roman[selL + 1]} · ${sel.lv[selL + 1]}</span><span class="fx">${selOk ? sel.fx : `🔒 Niveau d'arme ${Gunsmith.partReq(selL + 1)} requis (actuel : ${WL.lvl})`}</span></div>
            <button class="btn small" data-action="gsBuy" data-id="${sel.id}" ${can ? '' : 'disabled'}>${!selOk ? '🔒 Verrouillé' : can ? 'Monter' : 'Pas assez'} · ${selCost} 🔩</button></div>`
        : `<div class="gs-next max"><span class="lbl">✔ ${sel.lv[selMax]} · pièce au maximum</span></div>`;
      const wl = `<p class="hint">⬆️ ${P.name} · <b>niveau d'arme ${WL.lvl}</b>${WL.max ? ' (max)' : ` · ${WL.kills} / ${WL.next} éliminations`} · pièces III au niveau 3, IV au niveau 5</p>`;
      body = `<div class="gs-stats">${bars}</div>${detail}${wl}<div class="gs-parts">${rows}</div>`;
    } else {
      const S = Save.data, eq = Cosmetics.eq('weapon'), cur = gs.skin || eq.id;
      const rows = COSMETICS.filter(c => c.slot === 'weapon').map(it => {
        const own = Cosmetics.owned(it), isEq = eq.id === it.id, on = it.id === cur;
        const act = isEq ? '<span class="tagline ok">✔ Équipée</span>'
          : own ? `<button class="btn small ghost" data-action="gsEquip" data-id="${it.id}">Équiper</button>`
          : it.price ? `<button class="btn small" data-action="gsSkinBuy" data-id="${it.id}" ${S.bank < it.price ? 'disabled' : ''}>${it.price} 🔩</button>`
          : `<span class="lock">${Cosmetics.lockText(it)}</span>`;
        const sk = WEAPON_SKINS[it.skin], sw = sk ? `linear-gradient(135deg, ${sk.metal} 55%, ${sk.wood} 55%)` : 'linear-gradient(135deg, #2a2d32 55%, #7a4a28 55%)';
        return `<div class="gs-skin ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-action="gsSkin" data-id="${it.id}" data-gs-hover="skin:${it.id}">
          <i class="sw" style="background:${sw}"></i><span class="txt"><b>${it.name}</b></span>${act}</div>`;
      }).join('');
      body = `<p class="hint">Touchez une peinture pour l'essayer sur l'arme. Les peintures s'achètent avec la <b>réserve</b> (🔩 ${S.bank}) et s'appliquent à toutes vos armes.</p><div class="gs-skins">${rows}</div>`;
    }
    const inner = `
      <div class="gs-head">
        <div><h2>🔧 Établi</h2><span class="sub">${gs.tab === 'gear' ? 'Équipement de la classe' : `${P.icon} ${P.name}`} · partie en pause</span></div>
        <span class="bank">🔩 <b>${g.coins}</b></span>
      </div>
      ${gunTabs}${tabs}
      ${g.tut ? `<p class="hint tut-hint">🎓 Choisissez une pièce, achetez-la avec « Monter » : elle apparaît sur l'arme. Puis « Reprendre ».</p>` : ''}
      <div class="gs-body">${body}</div>
      <div class="gs-foot">
        <button class="btn" data-action="gsClose">▶ Reprendre${touch ? '' : ` <span class="muted">(Échap)</span>`}</button>
        ${touch ? '<span class="hint">Faites glisser l\'arme pour la tourner</span>' : '<span class="hint">↑↓ pièce · Entrée acheter · Tab onglet suivant · glisser pour tourner</span>'}
      </div>`;
    const panel = this.screen === 'gunsmith' && this.el.querySelector('.panel.gunsmith');
    if (panel) { const sc = panel.querySelector('.gs-body').scrollTop; panel.innerHTML = inner; panel.querySelector('.gs-body').scrollTop = sc; }
    else { this.open(inner, 200, 'gunsmith', 'gunsmith'); }
    this.screen = 'gunsmith';
  },

  /** Intérieur d'un refuge : achats, soins, état de la porte */
  showShelter(g, id) {
    const def = SHELTERS[id], sh = g.shelters[id], p = g.player;
    const items = (SHELTER_ITEMS[def.type] || []).map(it => {
      const cost = it.cost(g), n = g.buys[it.id] || 0, full = it.max && n >= it.max, ok = !full && (!it.ok || it.ok(g));
      return `<div class="card static">
        <span class="ic">${it.icon}</span>
        <span class="txt"><span class="nm">${it.name}${it.max ? ` <small class="muted">${n}/${it.max}</small>` : ''}</span><span class="ds">${it.desc}</span>
        ${ok ? `<button class="btn small" data-action="shelterBuy" data-id="${it.id}" ${g.coins < cost ? 'disabled' : ''}>Acheter · ${cost} 🔩</button>` : `<span class="tagline">${full ? '✔ Maximum' : it.no || 'Indisponible'}</span>`}
        </span></div>`;
    }).join('');
    const heal = `<p class="sub">À l'abri, les zombies ne vous voient plus mais assiègent la porte · ❤️ <b class="sh-hp">${Math.ceil(p.hp)} / ${p.maxHp}</b></p>`;
    this.open(`
      <h2>${def.icon} ${def.name}</h2>
      ${heal}
      ${g.tut ? `<p class="hint tut-hint">🎓 Ici, la ferraille sert à survivre : soins, vie max, armure, objets à poser. Pendant une vague, la horde frappe la porte : si elle cède, il faut fuir. Sortez pour continuer.</p>` : ''}
      <div class="door"><span class="door-lbl">Porte tenue</span><div class="door-bar"><i style="width:${sh.hp / sh.max * 100}%"></i></div></div>
      <div class="bank">🔩 Ferraille : <b class="sh-coins">${g.coins}</b></div>
      <div class="cards">${items}</div>
      <button class="btn" data-action="leave">Sortir${Input.mode === 'touch' ? '' : ` (${Inventory.label('interact')})`}</button>
    `, 0, 'wide shelter');
  },

  showVictory(g, bonus) {
    this.screen = 'main';
    UI.setHudButtons(false);
    const s = g.stats;
    this.open(`
      <h1 class="title">ÉVA<span>SION</span></h1>
      <p class="tag">La voiture rugit, le désert défile. Vous avez survécu.</p>
      <div class="stats reveal">${this.runStats(g).map(([n, v, cnt], i) => `<div style="--d:${0.25 + i * 0.13}s"><span>${n}</span><b ${cnt != null ? `data-count="${cnt}"` : ''}>${v}</b></div>`).join('')}</div>
      ${this.xpBlock(g.progress)}
      <p class="banked">Prime d'évasion : +${bonus} 🔩</p>
      <button class="btn" data-action="continue">Continuer en mode sans fin</button>
      <button class="btn small ghost" data-action="quit">Terminer la partie (encaisser)</button>
    `, 900);
  },

  showGameOver(g, best, isNewBest, banked, newAch) {
    this.screen = 'main';
    const s = g.stats, bank = Save.data.bank;
    this.open(`
      <h2>${g.victory ? 'Partie terminée · survivante !' : 'La horde vous a eue'}</h2>
      <p class="who center">${Cosmetics.playerName()} · <span>${Cosmetics.title()}</span></p>
      ${isNewBest ? '<p class="newbest">🏆 Nouveau record !</p>' : g.boardRank && g.boardRank <= 10 ? `<p class="newbest">🏅 ${g.boardRank}${g.boardRank === 1 ? 're' : 'e'} meilleure partie</p>` : ''}
      ${this.deathBlock(g)}
      <div class="stats reveal">${this.runStats(g).map(([n, v, cnt], i) => `<div style="--d:${0.25 + i * 0.13}s"><span>${n}</span><b ${cnt != null ? `data-count="${cnt}"` : ''}>${v}</b></div>`).join('')}</div>
      ${this.xpBlock(g.progress)}
      <p class="banked">+${banked} 🔩 versés dans la réserve (total ${bank})</p>
      ${g.reviveFromBank ? `<p class="hint center">💉 Réanimations payées avec la réserve pendant la partie : −${g.reviveFromBank} 🔩</p>` : ''}
      <p class="hint center">${g.victory ? 'Évasion réussie : toute la ferraille est conservée.' : `Vague ${g.wave.num} atteinte : ${Math.round(g.bankShare * 100)} % de la ferraille conservée${g.coinsLost ? ` (${g.coinsLost} 🔩 perdus)` : ''}. Plus vous tenez, plus vous gardez.`}</p>
      ${newAch.length ? `<div class="chips">${newAch.map(a => `<span class="chip evo">${a.icon} ${a.name}</span>`).join('')}</div>` : ''}
      ${this.buildChips(g)}
      <button class="btn" data-action="play">Rejouer</button>
      <div class="menu-grid two">
        <button class="btn small ghost" data-action="classes">🎖️ Classes</button>
        <button class="btn small ghost" data-action="menu">🧍 Préparation</button>
      </div>
      <p class="best">Record : <b>${best.score}</b> pts · vague ${best.wave}</p>
    `, 700);
    this.animateSummary(g.progress);
  },

  /** Cause de la mort : dernier coup, zombies autour, origine des dégâts subis, conseil */
  deathBlock(g) {
    const D = g.death;
    if (!D || g.victory || g.noRevive) return '';
    const H = Object.values(g.stats.hurtBy || {}).sort((a, b) => b.d - a.d), tot = H.reduce((a, h) => a + h.d, 0) || 1;
    const src = H.slice(0, 3).map(h => `<span>${h.ic} ${h.n} <b>${Math.round(h.d / tot * 100)} %</b></span>`).join('');
    const roll = Input.mode === 'touch' ? 'le bouton de roulade' : `la roulade (${Inventory.label('roll')})`;
    const kind = D.k.split('_')[0], bt = D.k.split('_')[1], boss = !!(bt && ENEMY_TYPES[bt] && ENEMY_TYPES[bt].boss);
    const TIPS = {
      melee: `Gardez vos distances : ${roll} traverse la horde sans prendre de coups.`,
      spit: `Les crachats se voient venir : ${roll} au bon moment les esquive.`,
      kamikaze: 'Les kamikazes (orange) explosent au contact : abattez-les de loin, ou ciblez-les en priorité.',
      barrel: 'Les fûts blessent aussi la survivante : éloignez-vous avant de les faire sauter.',
      acid: 'Les flaques vertes brûlent : ne restez pas dedans.',
      fire: 'Le Brûleur laisse des brasiers derrière lui : tournez autour sans marcher dans ses traces.',
    };
    const tip = D.around >= 8 ? `${D.around} zombies vous entouraient : restez en mouvement, ne vous laissez pas coincer contre un mur.`
      : boss ? `Les boss frappent fort : tournez autour d'eux et gardez une charge de roulade en réserve.` : TIPS[kind] || '';
    const n = (Save.data.deathBy || {})[D.k] || 0;
    return `<div class="death-box">
      <div class="dh"><span>💀 Cause de la mort</span><b>${D.ic} ${D.n}</b>${D.around >= 5 ? `<small>${D.around} zombies autour de vous</small>` : ''}</div>
      ${src ? `<div class="dsrc"><small>Dégâts subis pendant la partie</small>${src}</div>` : ''}
      ${tip ? `<p class="hint">💡 ${tip}</p>` : ''}
      ${n > 1 ? `<p class="hint">C'est la ${n}ᵉ fois que cette cause vous élimine.</p>` : ''}
    </div>`;
  },

  /** Statistiques de la partie (nom, valeur affichée, valeur à compter) */
  runStats(g) {
    const s = g.stats, names = { rifle: (PRIMARIES[g.primary] || PRIMARIES.rifle).name, shotgun: 'Fusil à pompe', flamer: 'Lance-flammes', boom: 'Explosions', drone: 'Drone', turret: 'Tourelles', trap: 'Barbelés', dog: 'Rex', ally: 'Survivants' };
    for (const [id, S] of Object.entries(SECONDARIES)) names[id] = S.name;
    const fav = Object.entries(s.dmgBy || {}).sort((a, b) => b[1] - a[1])[0];
    const fmt = n => n >= 10000 ? `${Math.round(n / 1000)} k` : String(Math.round(n));
    return [
      ['Score', s.score, s.score], ['Vague', g.wave.num, g.wave.num], ['Zombies abattus', s.kills, s.kills], ['Temps', U.formatTime(s.time)],
      ['Meilleure série', `×${s.bestCombo || 0}`], ['Dégâts infligés', fmt(s.dmg || 0)],
      ['Arme préférée', fav ? names[fav[0]] || fav[0] : '—'], ['Coffres · défis', `🎁 ${s.chests || 0} · ⚡ ${s.challenges || 0}`],
    ];
  },
  /** Expérience gagnée, niveaux atteints, missions accomplies */
  xpBlock(P) {
    if (!P) return '';
    const need0 = LEVELS.xpFor(P.lvl0), need1 = LEVELS.xpFor(P.lvl1), up = P.lvl1 > P.lvl0;
    const from = Math.round(P.xp0 / need0 * 100), to = up ? 100 : Math.round(P.xp1 / need1 * 100);
    const levels = P.levels.map(l => `<div class="lvl-up"><b>⭐ NIVEAU ${l.lvl} !</b><span>+${l.bank} 🔩${l.items.map(i => ` · ${i.icon} ${i.name}`).join('')}</span></div>`).join('');
    const ms = P.missions.map(m => `<div class="mis-done"><span>${m.icon} ${m.weekly ? '<b>Hebdo</b> · ' : ''}${m.text}</span><b>+${m.bank} 🔩 · +${m.xp} XP</b></div>`).join('');
    return `<div class="xp-box" style="--d:${0.25 + 8 * 0.13}s">
        <div class="xp-head"><span class="lvl">Niv. <b>${up ? P.lvl1 : P.lvl0}</b></span><span class="gain">+${P.xpTotal} XP</span></div>
        <div class="xp-bar"><i style="--from:${from}%;--to:${to}%"></i></div>
        ${up ? `<div class="xp-after">Niveau ${P.lvl1} · ${P.xp1} / ${need1} XP</div>` : `<div class="xp-after">${P.xp1} / ${need1} XP</div>`}
        ${levels}${ms ? `<div class="mis-list"><b>🎯 Missions accomplies</b>${ms}</div>` : ''}
        ${(P.weapons || []).length ? `<div class="mis-list"><b>⬆️ Armes</b>${P.weapons.map(w => `<div class="mis-done"><span>${(PRIMARIES[w.id] || SECONDARIES[w.id]).icon} ${w.name} · +${w.kills} élim.</span><b>${w.lvl1 > w.lvl0 ? `niv. ${w.lvl0} → ${w.lvl1} !` : `niv. ${w.lvl1}`}</b></div>`).join('')}</div>` : ''}
        ${(P.camos || []).map(c => `<div class="lvl-up"><b>🎨 CAMOUFLAGE DÉBLOQUÉ</b><span>${c.icon} ${c.name} · ${c.wchal.t}</span></div>`).join('')}
      </div>`;
  },
  /** Les chiffres défilent (comptent jusqu'à leur valeur) */
  animateSummary(P) {
    if (P && P.lvl1 > P.lvl0) setTimeout(() => { if (Game.state === 'gameover') { Sfx.play('levelup'); U.haptic(150); } }, 2900);
    const els = this.el.querySelectorAll('[data-count]');
    els.forEach((el, i) => {
      const target = Number(el.dataset.count), t0 = performance.now() + 250 + i * 130, dur = 700;
      el.textContent = '0';
      const step = now => {
        const k = U.clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
        el.textContent = String(Math.round(target * e));
        if (k < 1 && el.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  },
};
