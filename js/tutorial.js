'use strict';
/* =====================================================================
   TUTORIEL JOUABLE (environ 2 minutes) : une partie guidée sur le parking.
   Étapes : bouger → tir automatique → cibler un fût → roulade → létal → arme secondaire
            → établi → refuge → petite horde finale.
   Pas de vagues (g.phase = 'tut'), pas de règles de partie, impossible de mourir (PV min. 1),
   pas d'XP ni de record. Fin : écran récapitulatif + 150 🔩 dans la réserve la première fois.
   Lancé par Game.newRun({ tutorial: true }) ; consigne affichée par UI.tickTutorial,
   flèche jaune vers la cible par Render.drawOffscreen (Tutorial.target).
   ===================================================================== */

const TUT_REWARD = 150;

const Tutorial = {
  touch() { return Input.mode === 'touch'; },
  key(id) { return Inventory.label(id); },

  /** Les étapes : title, text (consigne), start (mise en place), done (réussie ?), target (où aller), count (progression) */
  steps: [
    {
      title: 'Se déplacer',
      text: T => (T.touch() ? 'Posez le pouce sur la moitié gauche de l\'écran et faites-le glisser pour bouger.' : 'Bougez avec ZQSD (ou les flèches).'),
      done: (g, t) => t.dist > 380,
    },
    {
      title: 'Tirer',
      text: () => 'Votre arme tire toute seule sur le zombie le plus proche. Approchez-vous et éliminez-les !',
      start: (g, T) => T.spawn(g, 'basic', 3, { min: 260, max: 340, spread: 60 }),
      done: (g, t) => t.group.every(e => e.dead),
      count: (g, t) => `${t.group.filter(e => e.dead).length} / ${t.group.length}`,
    },
    {
      title: 'Cibler',
      text: T => (T.touch() ? 'Touchez le fût rouge (moitié droite de l\'écran) pour le viser : il explose sur les zombies autour.'
        : 'Cliquez sur le fût rouge pour le viser en priorité : il explose sur les zombies autour. (Clic droit : annuler la cible.)'),
      start: (g, T) => {
        // fût bien en vue (pas derrière une voiture ou un mur)
        const p = g.player; let c = null;
        for (let i = 0; i < 25 && !c; i++) { const q = World.randomPoint(p.x, p.y, 230, 300, 30); if (World.los(p.x, p.y, q.x, q.y)) c = q; }
        c = c || World.randomPoint(p.x, p.y, 230, 300, 30);
        const b = { x: c.x, y: c.y, r: CONFIG.barrels.radius, hp: CONFIG.barrels.hp, flash: 0, fuse: null };
        g.barrels.push(b); g.tut.barrel = b;
        T.spawn(g, 'basic', 4, { at: c, spread: 48, ring: true, stun: 6 });
      },
      done: (g, t) => t.group.every(e => e.dead), // le fût n'est pas obligatoire (s'il a été raté, on continue)
      target: (g, t) => (!t.barrel.dead ? { x: t.barrel.x, y: t.barrel.y, h: 30, label: 'Fût' } : null),
    },
    {
      title: 'Esquiver',
      text: T => (T.touch() ? 'Touchez le bouton de roulade (en bas à droite) : vous êtes invincible pendant la roulade. Faites-en 2.'
        : `Appuyez sur ${T.key('roll')} pour faire une roulade : vous êtes invincible pendant la roulade. Faites-en 2.`),
      start: g => { g.tut.rolls0 = g.stats.rolls; },
      done: (g, t) => g.stats.rolls - t.rolls0 >= 2,
      count: (g, t) => `${Math.min(2, g.stats.rolls - t.rolls0)} / 2`,
    },
    {
      title: 'Explosif',
      text: (T, g) => {
        const id = g.loadout.lethal, w = WEAPONS[id], mine = id === 'mines';
        return T.touch() ? `Touchez la case ${w.icon} en bas de l'écran : ${mine ? 'une mine se pose derrière vous' : `${w.name.toLowerCase()} vers le zombie le plus proche`}. Visez le groupe !`
          : `Touche ${T.key('grenade')} : ${mine ? 'posez une mine sur le chemin du groupe' : `lancez ${id === 'molotov' ? 'le cocktail' : 'la grenade'} vers la souris`}. Visez le groupe !`;
      },
      start: (g, T) => { g.tut.lethal = false; T.spawn(g, 'basic', 6, { min: 250, max: 310, spread: 34, stun: 3 }); },
      update: (g, t, T) => { if (t.group.every(e => e.dead) && !t.lethal) { t.group = []; T.spawn(g, 'basic', 5, { min: 250, max: 310, spread: 34, stun: 3 }); } },
      done: (g, t) => t.lethal && t.group.every(e => e.dead),
      target: (g, t) => { const a = t.group.filter(e => !e.dead); return a.length && !t.lethal ? { x: a.reduce((s, e) => s + e.x, 0) / a.length, y: a.reduce((s, e) => s + e.y, 0) / a.length, h: 50, label: 'Groupe' } : null; },
    },
    {
      title: 'Arme secondaire',
      text: (T, g) => {
        const S = SECONDARIES[g.secondary], t = g.tut, pct = Math.round((S.speed - 1) * 100);
        if (!t.swapped) return T.touch() ? `Touchez la case ${S.icon} (2ᵉ case) pour sortir votre ${S.name.toLowerCase()}. En main, vous courez ${pct} % plus vite !`
          : `Touche ${T.key('slot2')} ou ${T.key('next')} (ou la molette) : sortez votre ${S.name.toLowerCase()}. En main, vous courez ${pct} % plus vite !`;
        if (!t.group.every(e => e.dead)) return `Abattez ces coureurs avec votre ${S.name.toLowerCase()}.`;
        return T.touch() ? `Bien ! Reprenez l'arme principale : touchez la 1ʳᵉ case.` : `Bien ! Reprenez l'arme principale : touche ${T.key('slot1')} ou ${T.key('next')}.`;
      },
      start: g => { g.tut.swapped = false; g.tut.spawned = false; if (g.active === 'secondary') Loadout.swap(g, 'primary'); g.tut.swapped = false; },
      update: (g, t, T) => { if (t.swapped && !t.spawned) { t.spawned = true; T.spawn(g, 'fast', 3, { min: 300, max: 380, spread: 50 }); } },
      done: (g, t) => t.spawned && t.group.every(e => e.dead) && g.active !== 'secondary',
    },
    {
      title: 'Améliorer son arme',
      text: T => `Voici de la ferraille ! Allez à l'établi 🔧 (flèche jaune) et ${T.touch() ? 'touchez « Établi »' : `appuyez sur ${T.key('interact')}`}. Montez une pièce, puis reprenez la partie.`,
      start: g => { g.tut.bench = false; g.coins += 250; Entities.addText(g, g.player.x, g.player.y - 46, '+250 🔩', '#ffc21a', 20); Sfx.play('chest'); },
      done: (g, t) => t.bench && g.state === 'playing',
      target: g => {
        const p = g.player; let best = null, bd = 1e9;
        for (const b of BENCHES) { if (!World.isUnlocked(b.zone)) continue; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; best = b; } }
        return best ? { x: best.x, y: best.y, h: 30, label: '🔧 Établi' } : null;
      },
    },
    {
      title: 'Les refuges',
      text: T => `Entrez dans un refuge (flèche jaune, ${T.touch() ? 'bouton « Entrer »' : `touche ${T.key('interact')}`}) : on s'y met à l'abri, on s'y soigne et on y achète de quoi survivre. Puis ressortez.`,
      start: g => { g.tut.inShelter = false; },
      update: g => { if (g.player.inside) g.tut.inShelter = true; },
      done: (g, t) => t.inShelter && !g.player.inside,
      target: g => {
        const p = g.player; let best = null, bd = 1e9;
        for (const [id, s] of Object.entries(SHELTERS)) {
          const b = MAP.buildings.find(bb => bb.id === s.building); if (!b || !World.isUnlocked(b.zone)) continue;
          const d = Math.hypot(b.doorPos.x - p.x, b.doorPos.y - p.y); if (d < bd) { bd = d; best = { x: b.doorPos.x, y: b.doorPos.y, h: 30, label: `${s.icon} ${s.name}` }; }
        }
        return best;
      },
    },
    {
      title: 'Dernière épreuve',
      text: () => 'Une petite horde arrive ! Utilisez tout ce que vous avez appris : roulade, explosif, cible, arme secondaire.',
      start: (g, T) => { T.spawn(g, 'basic', 7, { min: 330, max: 450, spread: 70 }); T.spawn(g, 'fast', 3, { min: 380, max: 480, spread: 50 }); g.showBanner('DERNIÈRE ÉPREUVE', 'Une petite horde arrive', 1.8, '#ffc21a'); Sfx.play('wave'); },
      done: (g, t) => t.group.every(e => e.dead),
      count: (g, t) => `${t.group.filter(e => e.dead).length} / ${t.group.length}`,
    },
  ],

  begin(g) {
    g.tut = { step: -1, wait: 0, dist: 0, group: [] };
    g.phase = 'tut'; g.wave.num = 1;
    // pas de cinématique : la voiture est déjà garée
    g.car.x = MAP.car.x; g.car.y = MAP.car.y; g.car.yaw = Math.PI; g.car.smoke = true;
    g.showPlayer = true; g.camZoom = 1; g.state = 'playing';
    g.showBanner('TUTORIEL', 'Suivez les consignes en haut de l\'écran', 2.2, '#ffc21a');
    this.next(g);
  },
  cur(g) { return g.tut && this.steps[g.tut.step]; },
  next(g) {
    const t = g.tut;
    t.step++; t.group = []; t.wait = 0;
    if (t.step >= this.steps.length) { this.finish(g); return; }
    const s = this.steps[t.step];
    if (s.start) s.start(g, this);
  },
  /** Zombies de l'étape (t.group) : opts.at (centre), min/max (distance), spread, ring (en cercle), stun (immobiles quelques secondes) */
  spawn(g, type, n, opts = {}) {
    const p = g.player, c = opts.at || World.randomPoint(p.x, p.y, opts.min || 260, opts.max || 340, 30);
    for (let i = 0; i < n; i++) {
      const a = opts.ring ? i / n * TAU : Math.random() * TAU, d = opts.ring ? opts.spread : Math.random() * (opts.spread || 40);
      const e = Entities.spawnEnemy(g, type, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d);
      World.resolve(e);
      if (opts.stun) e.stunT = opts.stun;
      g.tut.group.push(e);
    }
  },
  update(g, dt) {
    const t = g.tut, s = this.cur(g), p = g.player;
    if (!s) return;
    if (!p.inside) t.dist += Math.hypot(p.vx, p.vy) * dt;
    if (t.wait > 0) { t.wait -= dt; if (t.wait <= 0) this.next(g); return; }
    if (s.update) s.update(g, t, this);
    if (s.done(g, t)) {
      t.wait = 0.9;
      Entities.addText(g, p.x, p.y - 48, '✔ Bien joué !', '#7dff6a', 20);
      Sfx.play('buy');
    }
  },
  target(g) { const s = this.cur(g); return s && s.target && !(g.tut.wait > 0) ? s.target(g, g.tut) : null; },
  /** Consigne affichée en haut de l'écran */
  info(g) {
    const s = this.cur(g); if (!s) return null;
    return { n: g.tut.step + 1, of: this.steps.length, title: s.title, text: s.text(this, g), count: s.count ? s.count(g, g.tut) : '', ok: g.tut.wait > 0 };
  },
  finish(g) {
    const first = !Save.data.tutDone;
    Save.data.tutDone = true;
    if (first) Save.data.bank += TUT_REWARD;
    Save.save();
    g.state = 'tutend';
    Input.releaseJoystick();
    UI.setHudButtons(false);
    Sfx.play('clear');
    UI.showTutorialEnd(g, first ? TUT_REWARD : 0);
  },
};
