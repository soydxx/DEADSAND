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
    this.btnMute = document.getElementById('btn-mute');
    this.btnPause = document.getElementById('btn-pause');
    this.btnRoll = document.getElementById('btn-roll');
    this.toastEl = document.getElementById('toast');

    this.el.addEventListener('click', e => {
      const t = e.target.closest('[data-action]');
      if (!t || t.disabled || this.isLocked()) return;
      Sfx.unlock();
      Sfx.play('click');
      Game.handleAction(t.dataset.action, t.dataset);
    });
    this.btnPause.addEventListener('click', () => { Sfx.unlock(); Game.pause(); });
    this.btnMute.addEventListener('click', () => { Sfx.unlock(); Sfx.setMuted(!Sfx.muted); this.refreshMute(); });
    // bouton roulade (mobile) : réagit au toucher sans attendre le "click"
    this.btnRoll.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sfx.unlock(); if (Game.state === 'playing') Entities.roll(Game); });
    // pseudo (Options)
    this.el.addEventListener('change', e => {
      if (e.target.id !== 'name-input') return;
      Save.data.name = e.target.value.replace(/[<>&"]/g, '').trim().slice(0, 16); Save.save();
      this.showLobby('options');
    });
    this.btnAction = document.getElementById('btn-action');
    this.btnNext = document.getElementById('btn-next');
    const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); Sfx.unlock(); Sfx.play('click'); fn(); });
    tap(this.btnAction, () => Game.contextAction('enter'));
    tap(this.btnNext, () => Game.contextAction('next'));
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
    this.refreshMute();
  },

  refreshMute() { this.btnMute.textContent = Sfx.muted ? '🔇' : '🔊'; },
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
      const alt = { grenade: Inventory.label('grenade'), mine: Inventory.label('mine') };
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

  tick(g) {
    this.tickContext(g);
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

  /** Boutons contextuels : « Entrer » près d'une porte, « Lancer la vague » pendant la pause */
  tickContext(g) {
    const p = g.player, playing = g.state === 'playing' && p && !p.inside;
    const touch = Input.mode === 'touch';
    let door = null;
    if (playing) door = World.nearDoor(p.x, p.y, 60);
    const s = door && g.shelters[door];
    const bench = playing && !door ? Gunsmith.near(p.x, p.y) : -1;
    const actTxt = door ? (s.broken ? `🚫 ${SHELTERS[door].name} · porte enfoncée` : `${SHELTERS[door].icon} Entrer · ${SHELTERS[door].name}${touch ? '' : ` (${Inventory.label('interact')})`}`)
      : bench >= 0 ? `🔧 Établi · Améliorer l'arme${touch ? '' : ` (${Inventory.label('interact')})`}` : '';
    if (this._act !== actTxt) {
      this._act = actTxt;
      this.btnAction.textContent = actTxt;
      this.btnAction.classList.toggle('hidden', !actTxt);
      this.btnAction.classList.toggle('off', !!(s && s.broken));
    }
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

  buildChips(levels) {
    const ids = Object.keys(levels);
    if (!ids.length) return '';
    return `<div class="chips">${ids.map(id => {
      const u = UPGRADES.find(x => x.id === id);
      return u ? `<span class="chip ${u.kind || ''}">${u.icon} ${u.name}${levels[id] > 1 ? ` ×${levels[id]}` : ''}</span>` : '';
    }).join('')}</div>`;
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
        <h1 class="title">DEAD<span>SAND</span></h1>
        <p class="tag">Votre voiture a calé en plein désert. La horde arrive.</p>
        <p class="who-title">${Cosmetics.playerName()} · <span>${Cosmetics.title()}</span></p>
      </div>
      <div class="title-bottom">
        <button class="btn big" data-action="start" autofocus>Commencer</button>
        <button class="btn small ghost daily-btn" data-action="daily">🗓️ Défi du jour</button>
        ${best.score ? `<p class="best">Record : <b>${best.score}</b> pts · vague ${best.wave}</p>` : ''}
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
    const tabs = [['chars', '🧍', 'Équipe'], ['garage', '🎨', 'Garage'], ['shop', '💪', 'Entraînement'], ['ach', '🏆', 'Succès'], ['options', '⚙️', 'Options']];
    const body = { chars: () => this.tabChars(), garage: () => this.tabGarage(), shop: () => this.tabShop(), ach: () => this.tabAch(), options: () => this.tabOptions() }[tab]();
    const inner = `
      <div class="lobby-head">
        <div><h2>Préparation</h2><div class="who">${Cosmetics.playerName()} · <span>${Cosmetics.title()}</span></div></div>
        <span class="bank">🔩 <b>${S.bank}</b></span>
      </div>
      <div class="tabs">${tabs.map(([id, ic, nm]) => `<button class="${id === tab ? 'on' : ''}" data-action="tab" data-tab="${id}"><span>${ic}</span>${nm}</button>`).join('')}</div>
      <div class="lobby-body">${body}</div>
      <div class="lobby-foot">
        <button class="btn" data-action="play">▶ Lancer la partie <span class="muted">· ${sel.name}</span></button>
        <div class="foot-links"><button class="link" data-action="title">← Écran titre</button><button class="link" data-action="daily">🗓️ Défi du jour</button></div>
      </div>`;
    const panel = this.screen === 'lobby' && this.el.querySelector('.panel.lobby');
    if (panel) { // simple changement d'onglet : pas d'animation d'ouverture
      const scroll = tab === this._lastTab ? panel.querySelector('.lobby-body').scrollTop : 0;
      panel.innerHTML = inner; panel.querySelector('.lobby-body').scrollTop = scroll;
    } else this.open(inner, 0, 'lobby', 'lobby');
    this._lastTab = tab;
    this.screen = 'lobby';
  },

  tabChars() {
    const S = Save.data, pid = this.previewChar || S.char, pc = CHARACTERS[pid];
    const list = Object.entries(CHARACTERS).map(([id, c]) => {
      const owned = S.chars[id];
      return `<button class="char ${id === pid ? 'on' : ''} ${owned ? '' : 'locked'}" data-action="preview" data-id="${id}">
        <span class="av">${id === 'swat' ? '🪖' : id === 'scout' ? '🏃‍♀️' : '🧍‍♀️'}</span>
        <span class="nm">${c.name}</span><span class="rl">${owned ? (S.char === id ? '✔ Choisie' : c.role) : `🔒 ${c.cost} 🔩`}</span>
      </button>`;
    }).join('');
    const stats = this.charStats(pid).map(([n, v, k]) => `<div class="stat"><span>${n}</span><div class="sbar"><i style="width:${Math.round(U.clamp(k, 0.05, 1) * 100)}%"></i></div><b>${v}</b></div>`).join('');
    const owned = S.chars[pid];
    const act = S.char === pid ? '<span class="tagline ok">✔ Personnage sélectionné</span>'
      : owned ? `<button class="btn small" data-action="selectChar" data-id="${pid}">Choisir ${pc.name}</button>`
      : `<button class="btn small" data-action="buyChar" data-id="${pid}" ${S.bank < pc.cost ? 'disabled' : ''}>Débloquer · ${pc.cost} 🔩</button>`;
    return `<div class="char-list">${list}</div>
      <div class="char-card">
        <div class="char-name">${pc.name} <small>${pc.role}</small></div>
        <p class="ds">${pc.desc}</p>
        <div class="stats-bars">${stats}</div>
        ${act}
      </div>
      ${S.perm.dog ? '<p class="hint center">🐺 Rex vous accompagne sur le terrain.</p>' : ''}`;
  },

  /** Garage : personnalisation, aperçu en direct sur le parking */
  tabGarage() {
    const S = Save.data, cat = this.garageCat || 'outfit';
    const chips = COS_CATS.map(([id, ic, nm]) => `<button class="${id === cat ? 'on' : ''}" data-action="gcat" data-cat="${id}">${ic} ${nm}</button>`).join('');
    let items = COSMETICS.filter(c => c.cat === cat);
    let note = '';
    if (cat === 'outfit') { items = items.filter(c => c.char === S.char); note = `<p class="hint">Tenues de <b>${CHARACTERS[S.char].name}</b> · changez de personnage dans l'onglet Équipe.</p>`; }
    if (cat === 'dog' && !S.perm.dog) note = '<p class="hint">Rex se débloque à l\'Entraînement. Vous pouvez déjà préparer son look.</p>';
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

  /** Achats possibles avec la réserve : bonus d'entraînement + personnages à débloquer */
  affordable(bank) {
    const S = Save.data, out = [];
    for (const it of SHOP) {
      const l = S.perm[it.id] || 0;
      if (l < it.max && it.cost(l) <= bank) out.push({ icon: it.icon, name: `${it.name} niv. ${l + 1}`, cost: it.cost(l) });
    }
    for (const [id, c] of Object.entries(CHARACTERS)) if (!S.chars[id] && c.cost <= bank) out.push({ icon: '🧍', name: `Personnage ${c.name}`, cost: c.cost });
    return out;
  },
  cheapest() {
    const S = Save.data;
    const costs = SHOP.filter(it => (S.perm[it.id] || 0) < it.max).map(it => ({ it, cost: it.cost(S.perm[it.id] || 0) }));
    return costs.sort((a, b) => a.cost - b.cost)[0] || null;
  },

  tabShop() {
    const S = Save.data, cheap = this.cheapest();
    const empty = !this.affordable(S.bank).length;
    const explain = `<div class="explain">
        <b>💡 Comment ça marche ?</b>
        <ol>
          <li>En partie, ramassez la <b>ferraille 🔩</b> lâchée par les zombies.</li>
          <li>À la fin de la partie, une part de ce qu'il vous reste est versée dans votre <b>réserve</b> : ${Math.round(BANKING.base * 100)} % à la vague 1, puis +${Math.round(BANKING.perWave * 100)} % par vague (max ${Math.round(BANKING.max * 100)} %), 100 % en cas d'évasion.</li>
          <li>Ici, la réserve achète des <b>bonus permanents</b>, actifs dès le début de chaque partie.</li>
        </ol>
        ${cheap ? `<p>Premier objectif : <b>${cheap.it.icon} ${cheap.it.name}</b> pour <b>${cheap.cost} 🔩</b>${S.bank ? ` (encore ${Math.max(0, cheap.cost - S.bank)} 🔩)` : ''}.</p>` : ''}
      </div>`;
    return `${empty ? explain : `<p class="sub">Bonus permanents, actifs dès le début de chaque partie. En fin de partie, ${Math.round(BANKING.base * 100)} à ${Math.round(BANKING.max * 100)} % de la ferraille restante arrive ici selon la vague atteinte (100 % si vous vous évadez).</p>`}
      <div class="shop-list">${SHOP.map(it => {
        const l = S.perm[it.id] || 0, maxed = l >= it.max, cost = maxed ? 0 : it.cost(l);
        const pips = Array.from({ length: it.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
        return `<div class="shop-row">
          <span class="ic">${it.icon}</span>
          <span class="txt"><b>${it.name}</b><small>${it.desc}</small><span class="pips">${pips}</span></span>
          ${maxed ? '<span class="tagline ok">Max</span>' : `<button class="btn small" data-action="buyPerm" data-id="${it.id}" ${S.bank < cost ? 'disabled' : ''}>${cost} 🔩</button>`}
        </div>`;
      }).join('')}</div>`;
  },

  tabAch() {
    const S = Save.data;
    return `<p class="sub">${Object.keys(S.ach).length} / ${ACHIEVEMENTS.length} débloqués · ${S.stats.kills} zombies abattus · ${S.stats.runs} parties</p>
      <div class="ach-list">${ACHIEVEMENTS.map(a => `<div class="ach ${S.ach[a.id] ? 'done' : ''}"><span class="ic">${S.ach[a.id] ? a.icon : '🔒'}</span>
        <span><b>${a.name}</b><small>${a.desc}</small></span></div>`).join('')}</div>`;
  },

  tabOptions() {
    const s = Save.data.settings, touch = Input.mode === 'touch';
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(s[key]) === String(v) ? 'on' : ''}" data-action="set" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
    const vol = [[0, '0'], [0.25, '25'], [0.5, '50'], [0.8, '80'], [1, '100']];
    return `
      <div class="opt"><span>Pseudo</span><input id="name-input" class="name-input" maxlength="16" placeholder="Survivante" value="${(Save.data.name || '').replace(/"/g, '&quot;')}"></div>
      <div class="opt"><span>Qualité graphique</span>${seg('quality', [['auto', 'Auto'], ['high', 'Haute'], ['low', 'Éco']])}</div>
      <p class="hint">Économie : pour les téléphones modestes. Appliqué au rechargement.</p>
      <div class="opt"><span>Bruitages</span>${seg('sfx', vol)}</div>
      <div class="opt"><span>Musique</span>${seg('music', vol)}</div>
      <div class="opt"><span>Vibrations</span>${seg('vibrate', [[true, 'Oui'], [false, 'Non']])}</div>
      <button class="btn small ghost" data-action="reload">Appliquer et recharger</button>
      <h3>Touches</h3>
      ${touch ? '<p class="hint">Sur téléphone, l\'inventaire et la roulade se touchent directement à l\'écran. Ces touches servent avec un clavier.</p>' : '<p class="hint">Cliquez sur une touche puis appuyez sur la nouvelle (Échap pour annuler). Déplacements : ZQSD / WASD / flèches · molette : arme suivante.</p>'}
      <div class="binds">${Object.entries(BINDINGS).map(([id, b]) => `<div class="bind"><span>${b[2]}</span>
        <button class="key-btn ${this.rebinding === id ? 'wait' : ''}" data-action="rebind" data-id="${id}">${this.rebinding === id ? 'Appuyez…' : Inventory.label(id)}</button></div>`).join('')}</div>
      <button class="link" data-action="resetKeys">Rétablir les touches par défaut</button>
      <h3>Conseils</h3>
      <p class="hint">Les bulles d'aide n'apparaissent qu'une fois. ${Object.keys(Save.data.tips || {}).length} / ${TIPS.length} déjà vues.</p>
      <button class="btn small ghost" data-action="resetTips">Revoir les conseils</button>
      <h3>Commandes</h3>
      <div class="controls">
        <div class="${touch ? '' : 'dim'}">👆 <b>Mobile</b> : pouce à gauche pour bouger, touchez un zombie ou un fût à droite pour le cibler, 🌀 pour rouler</div>
        <div class="${touch ? 'dim' : ''}">⌨️ <b>PC</b> : ZQSD / flèches, <b>clic</b> pour cibler (clic droit / Tab : relâcher), <b>${Inventory.label('roll')}</b> roulade, <b>${Inventory.label('interact')}</b> refuge, <b>${Inventory.label('wave')}</b> lancer la vague, <b>${Inventory.label('slot1')}-${Inventory.label('slot8')}</b> cases de l'inventaire (dans l'ordre), <b>${Inventory.label('grenade')}</b> grenade (vers la souris), <b>${Inventory.label('mine')}</b> mine, Échap pause</div>
        <div>🔫 Tir <b>automatique</b> · 🚗 4 pièces pour réparer la voiture et fuir · 💉 1re réanimation offerte</div>
      </div>`;
  },

  /* ------------------------------ défi du jour ------------------------------ */
  showDaily() {
    this.screen = 'daily';
    const d = Daily.today(), best = Daily.best(), hist = Daily.history();
    const fmt = k => { const [y, m, dd] = k.split('-'); return `${dd}/${m}`; };
    this.open(`
      <h2>🗓️ Défi du jour</h2>
      <p class="sub">${fmt(d.key)} · les mêmes règles pour tout le monde aujourd'hui</p>
      <div class="mods">${d.mods.map(m => `<div class="mod"><span class="ic">${m.icon}</span><span><b>${m.name}</b><small>${m.desc}</small></span></div>`).join('')}</div>
      <p class="best">${best ? `Votre meilleur score aujourd'hui : <b>${best.score}</b> pts · vague ${best.wave}` : 'Pas encore joué aujourd\'hui'}</p>
      ${hist.length ? `<div class="daily-hist">${hist.map(([k, v]) => `<div class="${k === d.key ? 'on' : ''}"><span>${fmt(k)}</span><b>${v.score}</b><small>vague ${v.wave}</small></div>`).join('')}</div>` : ''}
      <button class="btn" data-action="playDaily">Lancer le défi · ${CHARACTERS[Save.data.char].name}</button>
      <button class="btn small ghost" data-action="menu">← Préparation</button>
    `, 250, 'daily');
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
  showUpgrade(choices, levels, wave, coins, cost, free, weapons) {
    const cards = choices.map((u, i) => {
      const lv = levels[u.id] || 0;
      const lvTxt = u.max === Infinity ? '' : u.kind === 'evo' ? 'ÉVOLUTION' : `Niv. ${lv} → ${lv + 1} / ${u.max}`;
      const desc = u.descFn ? u.descFn(lv) : u.desc;
      const tag = u.kind === 'weapon' ? (lv ? 'ARME' : 'NOUVELLE ARME') : '';
      return `<button class="card ${u.kind || ''}" data-action="pick" data-i="${i}">
        <span class="key">${i + 1}</span>
        ${tag ? `<span class="ribbon">${tag}</span>` : ''}
        <span class="ic">${u.icon}</span>
        <span class="txt"><span class="nm">${u.name}</span><span class="ds">${desc}</span>
        ${lvTxt ? `<span class="lv">${lvTxt}</span>` : ''}</span>
      </button>`;
    }).join('');
    const canReroll = free > 0 || coins >= cost;
    this.open(`
      <h2>Vague ${wave} repoussée</h2>
      <p class="sub">Choisissez une amélioration</p>
      <div class="cards">${cards}</div>
      <button class="btn small ghost" data-action="reroll" ${canReroll ? '' : 'disabled'}>
        🎲 Relancer — ${free > 0 ? `gratuit (${free})` : `${cost} 🔩`} <span class="muted">(vous : ${coins})</span>
      </button>
    `, 450, 'wide');
  },

  showPause(g) {
    this.open(`
      <h2>Pause</h2>
      <p class="sub">Vague ${g.wave.num} · ${g.stats.score} pts · 🔩 ${g.coins}</p>
      ${this.buildChips(g.upLevels)}
      <button class="btn" data-action="resume">Reprendre</button>
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
    const touch = Input.mode === 'touch', def = GUN_PARTS[gs.gun], guns = Gunsmith.guns(g);
    const roman = ['0', 'I', 'II', 'III'];
    const gunTabs = guns.length > 1 ? `<div class="gs-guns">${guns.map(id => `<button class="${id === gs.gun ? 'on' : ''}" data-action="gsGun" data-id="${id}">${GUN_PARTS[id].icon} ${GUN_PARTS[id].name}</button>`).join('')}</div>` : '';
    const tabs = `<div class="gs-tabs"><button class="${gs.tab === 'parts' ? 'on' : ''}" data-action="gsTab" data-tab="parts">🔧 Pièces</button><button class="${gs.tab === 'paint' ? 'on' : ''}" data-action="gsTab" data-tab="paint">🎨 Peinture</button></div>`;
    let body;
    if (gs.tab === 'parts') {
      const sel = Gunsmith.part(gs.gun, gs.part), selL = Gunsmith.lvl(g, gs.gun, gs.part);
      // barres de caractéristiques : actuel + gain de la pièce sélectionnée (en vert)
      const now = Gunsmith.stats(g, gs.gun), next = selL < 3 ? Gunsmith.stats(g, gs.gun, gs.part) : now;
      const fmt = (v, u) => (u === '%' || u === '°' ? `${Math.round(v)}${u === '%' ? ' %' : '°'}` : v >= 20 ? Math.round(v) : Math.round(v * 10) / 10);
      const bars = now.map(([n, v, max, u], i) => {
        const nv = next[i][1], a = U.clamp(v / max, 0.03, 1), b = U.clamp(nv / max, 0.03, 1), up = nv > v + 1e-6;
        return `<div class="gs-stat ${up ? 'up' : ''}"><span>${n}</span><div class="gs-bar"><i style="width:${a * 100}%"></i>${up ? `<em style="left:${a * 100}%;width:${(b - a) * 100}%"></em>` : ''}</div><b>${fmt(v, u)}${up ? ` <small>→ ${fmt(nv, u)}</small>` : ''}</b></div>`;
      }).join('');
      const rows = def.parts.map(pt => {
        const l = Gunsmith.lvl(g, gs.gun, pt.id), on = pt.id === gs.part, cost = l < 3 ? GUN_COST[l] : 0;
        const pips = [1, 2, 3].map(k => `<i class="${k <= l ? 'on' : ''}"></i>`).join('');
        return `<button class="gs-part ${on ? 'on' : ''} ${l >= 3 ? 'max' : ''}" data-action="gsPart" data-id="${pt.id}" data-gs-hover="${pt.id}">
          <span class="ic">${pt.icon}</span>
          <span class="txt"><b>${pt.name} <small>· ${pt.stat}</small></b><span class="cur">${pt.lv[l]}</span></span>
          <span class="pips">${pips}</span>
          <span class="price">${l >= 3 ? 'MAX' : `${cost} 🔩`}</span>
        </button>`;
      }).join('');
      const can = selL < 3 && g.coins >= GUN_COST[selL];
      const detail = selL < 3
        ? `<div class="gs-next"><div><span class="lbl">Niveau ${roman[selL + 1]} · ${sel.lv[selL + 1]}</span><span class="fx">${sel.fx}</span></div>
            <button class="btn small" data-action="gsBuy" data-id="${sel.id}" ${can ? '' : 'disabled'}>${can ? 'Monter' : 'Pas assez'} · ${GUN_COST[selL]} 🔩</button></div>`
        : `<div class="gs-next max"><span class="lbl">✔ ${sel.lv[3]} · pièce au maximum</span></div>`;
      body = `<div class="gs-stats">${bars}</div>${detail}<div class="gs-parts">${rows}</div>`;
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
        <div><h2>🔧 Établi</h2><span class="sub">${def.icon} ${def.name} · partie en pause</span></div>
        <span class="bank">🔩 <b>${g.coins}</b></span>
      </div>
      ${gunTabs}${tabs}
      <div class="gs-body">${body}</div>
      <div class="gs-foot">
        <button class="btn" data-action="gsClose">▶ Reprendre${touch ? '' : ` <span class="muted">(Échap)</span>`}</button>
        ${touch ? '<span class="hint">Faites glisser l\'arme pour la tourner</span>' : '<span class="hint">↑↓ pièce · Entrée acheter · ←→ arme · Tab peinture · glisser pour tourner</span>'}
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
      const cost = it.cost(g), ok = !it.ok || it.ok(g);
      return `<div class="card static">
        <span class="ic">${it.icon}</span>
        <span class="txt"><span class="nm">${it.name}</span><span class="ds">${it.desc}</span>
        ${ok ? `<button class="btn small" data-action="shelterBuy" data-id="${it.id}" ${g.coins < cost ? 'disabled' : ''}>Acheter · ${cost} 🔩</button>` : '<span class="tagline">Indisponible</span>'}
        </span></div>`;
    }).join('');
    const heal = def.heal ? `<p class="sub">❤️ Vous récupérez ${def.heal} PV/s à l'abri · <b class="sh-hp">${Math.ceil(p.hp)} / ${p.maxHp}</b></p>` : '<p class="sub">À l\'abri : les zombies ne vous voient plus, mais ils assiègent la porte.</p>';
    this.open(`
      <h2>${def.icon} ${def.name}</h2>
      ${heal}
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
      <div class="stats">
        <div><span>Score</span><b>${s.score}</b></div>
        <div><span>Vague</span><b>${g.wave.num}</b></div>
        <div><span>Zombies abattus</span><b>${s.kills}</b></div>
        <div><span>Temps</span><b>${U.formatTime(s.time)}</b></div>
      </div>
      <p class="banked">Prime d'évasion : +${bonus} 🔩</p>
      <button class="btn" data-action="continue">Continuer en mode sans fin</button>
      <button class="btn small ghost" data-action="quit">Terminer la partie (encaisser)</button>
    `, 900);
  },

  showGameOver(g, best, isNewBest, banked, newAch) {
    this.screen = 'main';
    const s = g.stats, bank = Save.data.bank;
    // ce que la ferraille versée vient de rendre achetable (et ce qui l'était déjà)
    const before = new Set(this.affordable(bank - banked).map(i => i.name));
    const now = this.affordable(bank), fresh = now.filter(i => !before.has(i.name));
    const cheap = this.cheapest();
    let tip = '';
    if (fresh.length) tip = `<div class="unlock-tip"><b>💡 Nouveau à l'Entraînement</b>${fresh.slice(0, 3).map(i => `<span>${i.icon} ${i.name} · ${i.cost} 🔩</span>`).join('')}${fresh.length > 3 ? `<span class="muted">+ ${fresh.length - 3} autre(s)</span>` : ''}</div>`;
    else if (now.length) tip = `<div class="unlock-tip"><b>💡 Toujours achetable</b><span>${now[0].icon} ${now[0].name} · ${now[0].cost} 🔩</span></div>`;
    else if (cheap) tip = `<p class="hint center">Encore <b>${cheap.cost - bank} 🔩</b> pour ${cheap.it.icon} ${cheap.it.name} à l'Entraînement.</p>`;
    this.open(`
      <h2>${g.victory ? 'Partie terminée · survivante !' : 'La horde vous a eue'}</h2>
      <p class="who center">${Cosmetics.playerName()} · <span>${Cosmetics.title()}</span></p>
      ${g.daily ? `<p class="newbest">🗓️ Défi du jour : ${s.score} pts${g.dailyBest ? ' · meilleur score du jour !' : ` · record du jour ${Daily.best().score}`}</p>` : ''}
      ${isNewBest ? '<p class="newbest">🏆 Nouveau record !</p>' : ''}
      <div class="stats">
        <div><span>Score</span><b>${s.score}</b></div>
        <div><span>Vague</span><b>${g.wave.num}</b></div>
        <div><span>Zombies abattus</span><b>${s.kills}</b></div>
        <div><span>Temps</span><b>${U.formatTime(s.time)}</b></div>
      </div>
      <p class="banked">+${banked} 🔩 versés dans la réserve (total ${bank})</p>
      <p class="hint center">${g.victory ? 'Évasion réussie : toute la ferraille est conservée.' : `Vague ${g.wave.num} atteinte : ${Math.round(g.bankShare * 100)} % de la ferraille conservée${g.coinsLost ? ` (${g.coinsLost} 🔩 perdus)` : ''}. Plus vous tenez, plus vous gardez.`}</p>
      ${tip}
      ${newAch.length ? `<div class="chips">${newAch.map(a => `<span class="chip evo">${a.icon} ${a.name}</span>`).join('')}</div>` : ''}
      ${this.buildChips(g.upLevels)}
      <button class="btn" data-action="${g.daily ? 'playDaily' : 'play'}">${g.daily ? 'Retenter le défi' : 'Rejouer'}</button>
      <div class="menu-grid two">
        <button class="btn small ${now.length ? 'glow' : 'ghost'}" data-action="shop">💪 Entraînement</button>
        <button class="btn small ghost" data-action="menu">🧍 Préparation</button>
      </div>
      <p class="best">Record : <b>${best.score}</b> pts · vague ${best.wave}</p>
    `, 700);
  },
};
