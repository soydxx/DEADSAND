'use strict';
/* =====================================================================
   ARMES ET ÉQUIPEMENTS (choisis dans la classe, js/loadout.js)
   - fusil à pompe / lance-flammes : armes principales (les fusils utilisent p.weapon, entities.js)
   - létal (grenade, molotov, mines) et tactique (drone, tourelle, barbelés) : niveaux 1→5 puis
     une ÉVOLUTION, achetés aux établis (onglet « Équipement », js/gunsmith.js).
   Leurs dégâts profitent des bonus de dégâts de l'arme principale (chargeur de l'établi…).
   ===================================================================== */

/* type : 'main'    → arme qu'on équipe à la place du fusil d'assaut (touches / inventaire)
          'passive' → fonctionne toute seule en permanence
          'manual'  → se déclenche avec une touche, avec un temps de recharge */
const WEAPONS = {
  shotgun: {
    name: 'Fusil à pompe', icon: '💢', max: 5, type: 'main',
    stats: l => ({ cd: 0.85 * Math.pow(0.92, l - 1), pellets: 5 + l, dmg: 8 * (1 + 0.2 * (l - 1)), range: 230, spread: 0.6 }),
    desc: l => (l === 0 ? 'Nouvelle arme à équiper : salve de plombs en éventail, dévastatrice de près' : '+1 plomb, +20 % dégâts, tire plus vite'),
  },
  flamer: {
    name: 'Lance-flammes', icon: '🔥', max: 5, type: 'main',
    stats: l => ({ tick: 0.1, range: 135 + l * 8, cone: 0.5, dmg: 3.4 * (1 + 0.25 * (l - 1)) }),
    desc: l => (l === 0 ? 'Nouvelle arme à équiper : cône de flammes continu, touche toute la horde devant vous' : '+25 % dégâts, +8 de portée'),
  },
  grenade: {
    name: 'Grenades', icon: '💣', max: 5, type: 'manual',
    stats: l => ({ cd: 2.6 * Math.pow(0.9, l - 1), count: 1 + Math.floor((l - 1) / 2), radius: 70 + l * 6, dmg: 40 * (1 + 0.25 * (l - 1)), range: 340 }),
    desc: l => (l === 0 ? 'Nouvelle arme : grenades à lancer avec leur touche, vers la cible ou la souris' : '+25 % dégâts, rayon plus grand, recharge plus courte'),
  },
  drone: {
    name: 'Drone de combat', icon: '🛸', max: 5, type: 'passive',
    stats: l => ({ count: l >= 4 ? 2 : 1, cd: 0.9 * Math.pow(0.9, l - 1), dmg: 9 * (1 + 0.2 * (l - 1)), range: 300 }),
    desc: l => (l === 0 ? 'Nouvelle arme : un drone tourne autour de vous et tire seul' : l === 3 ? '+1 drone, +20 % dégâts' : '+20 % dégâts, tire plus vite'),
  },
  molotov: {
    name: 'Cocktail Molotov', icon: '🍾', max: 5, type: 'manual',
    stats: l => ({ cd: 7 * Math.pow(0.92, l - 1), count: 1, radius: 55 + l * 5, dmg: 18 * (1 + 0.2 * (l - 1)), range: 300, fire: 5 + l * 0.5 }),
    desc: l => (l === 0 ? 'Petite explosion puis un brasier qui brûle la horde' : '+20 % dégâts, brasier plus grand et plus long, recharge plus courte'),
  },
  turretkit: {
    name: 'Tourelle portable', icon: '🗼', max: 5, type: 'manual',
    stats: l => ({ cd: 40 * Math.pow(0.9, l - 1), life: 22 + l * 4 }),
    desc: l => (l === 0 ? 'Pose une tourelle automatique devant vous' : 'Recharge plus courte, la tourelle tient plus longtemps'),
  },
  wirekit: {
    name: 'Barbelés portables', icon: '🕸️', max: 5, type: 'manual',
    stats: l => ({ cd: 24 * Math.pow(0.88, l - 1) }),
    desc: l => (l === 0 ? 'Déroule des barbelés qui ralentissent et blessent' : 'Recharge plus courte'),
  },
  /* armes secondaires (js/loadout.js, SECONDARIES) : le tir est géré par entities.js, ici seulement les niveaux de l'établi */
  pistol: { name: 'Pistolet', icon: '🔫', max: 5, type: 'secondary',
    stats: l => ({ dmg: 8 * (1 + 0.2 * (l - 1)), rate: 2.6 * (1 + 0.06 * (l - 1)) }), desc: () => '+20 % dégâts, +6 % cadence' },
  revolver: { name: 'Revolver', icon: '🤠', max: 5, type: 'secondary',
    stats: l => ({ dmg: 28 * (1 + 0.2 * (l - 1)), rate: 1.0 * (1 + 0.06 * (l - 1)) }), desc: () => '+20 % dégâts, +6 % cadence' },
  mpistol: { name: 'Pistolet-mitrailleur', icon: '⚡', max: 5, type: 'secondary',
    stats: l => ({ dmg: 4.5 * (1 + 0.2 * (l - 1)), rate: 6 * (1 + 0.06 * (l - 1)) }), desc: () => '+20 % dégâts, +6 % cadence' },
  flaregun: { name: 'Lance-fusées', icon: '🎆', max: 5, type: 'secondary',
    stats: l => ({ dmg: 14 * (1 + 0.2 * (l - 1)), rate: 0.85 * (1 + 0.06 * (l - 1)) }), desc: () => '+20 % dégâts et brûlure, +6 % cadence' },
  mines: {
    name: 'Mines', icon: '☢️', max: 5, type: 'manual',
    // rééquilibrées (jugées trop fortes) : recharge plus longue, dégâts et rayon réduits, 3 sur le terrain, durée de vie 30 s
    stats: l => ({ cd: 6 * Math.pow(0.92, l - 1), radius: 50 + l * 5, dmg: 36 * (1 + 0.18 * (l - 1)) }),
    desc: l => (l === 0 ? 'Nouvelle arme : posez une mine avec sa touche (3 sur le terrain, elles durent 30 s)' : '+18 % dégâts, rayon plus grand, recharge plus courte'),
  },
};

const EVOLUTIONS = [
  { id: 'evo_grenade', weapon: 'grenade', icon: '🌋', name: 'Bombes incendiaires', desc: 'ÉVOLUTION : les grenades laissent un brasier au sol', requires: { w_grenade: 3, damage: 2 } },
  { id: 'evo_drone', weapon: 'drone', icon: '🐝', name: 'Essaim de drones', desc: 'ÉVOLUTION : +2 drones qui tirent deux fois plus vite', requires: { w_drone: 3, firerate: 2 } },
  { id: 'evo_shotgun', weapon: 'shotgun', icon: '🌪️', name: 'Canon à mitraille', desc: 'ÉVOLUTION : deux fois plus de plombs, qui traversent les zombies', requires: { w_shotgun: 3, multishot: 1 } },
  { id: 'evo_flamer', weapon: 'flamer', icon: '🐉', name: 'Souffle du dragon', desc: 'ÉVOLUTION : portée ×1,6, cône élargi, dégâts ×1,5', requires: { w_flamer: 3, range: 1 } },
  { id: 'evo_molotov', weapon: 'molotov', icon: '☄️', name: 'Napalm', desc: 'ÉVOLUTION : brasier deux fois plus grand et plus brûlant' },
  { id: 'evo_turretkit', weapon: 'turretkit', icon: '🏰', name: 'Tourelles jumelles', desc: 'ÉVOLUTION : pose deux tourelles à la fois' },
  { id: 'evo_wirekit', weapon: 'wirekit', icon: '⛓️', name: 'Champ de barbelés', desc: 'ÉVOLUTION : déroule deux barbelés à la fois' },
  { id: 'evo_mines', weapon: 'mines', icon: '💠', name: 'Champ de mines', desc: 'ÉVOLUTION : les mines tombent par 2, explosent plus fort, 5 sur le terrain', requires: { w_mines: 3, magnet: 1 } },
];

const MAX_SIDE_WEAPONS = 4;
const MINES_MAX = 3;      // mines posées en même temps sur le terrain (5 avec l'évolution)
const MINE_LIFE = 30;     // secondes avant qu'une mine non déclenchée ne s'éteigne

/* --------------------------------------------------------------------- */
const Weapons = {
  levelUp(g, id) {
    const isNew = !g.weapons[id];
    const w = g.weapons[id] || (g.weapons[id] = { lvl: 0, t: id === 'mines' ? 0 : 0.6, evo: false, aux: [] });
    w.lvl++;
    if (isNew && typeof Inventory !== 'undefined') Inventory.announce(g, id);
  },

  /** Cible d'une arme équipée : la cible verrouillée si possible, sinon le zombie visible le plus proche */
  target(g, p, range) {
    const L = g.lock;
    if (L && !L.dead && U.dist2(p.x, p.y, L.x, L.y) < (range * 1.3) ** 2 && World.los(p.x, p.y, L.x, L.y)) return L;
    let best = range * range, t = null;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d2 = U.dist2(p.x, p.y, e.x, e.y);
      if (d2 < best && World.los(p.x, p.y, e.x, e.y)) { best = d2; t = e; }
    }
    return t;
  },
  /** Sans cible, la survivante regarde là où elle va */
  idleAim(p) { const m = Input.getMove(); if (m.x || m.y) p.aimAngle = Math.atan2(m.y, m.x); },

  /** Pose manuelle de mine(s) — renvoie false si en recharge */
  placeMine(g) {
    const w = g.weapons.mines, p = g.player;
    if (!w || w.t > 0 || p.inside) return false;
    const max = this.minesMax(g);
    if (g.mines.length >= max) { Entities.addText(g, p.x, p.y - 30, `${max} mines max sur le terrain`, '#ff6a5a', 13); return false; }
    const s = WEAPONS.mines.stats(w.lvl);
    w.t = w.cdMax = s.cd * (p.equipCd || 1); // atout Ingénieur
    const n = Math.min(w.evo ? 2 : 1, max - g.mines.length);
    for (let i = 0; i < n; i++) {
      const a = p.aimAngle + Math.PI + (i - (n - 1) / 2) * 0.9, d = n > 1 ? 30 : 8;
      g.mines.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, arm: 1.1, r: s.radius * (w.evo ? 1.2 : 1), dmg: s.dmg * this.dmgMult(g) * (w.evo ? 1.25 : 1), age: 0 });
    }
    Sfx.play('mine');
    return true;
  },

  minesMax(g) { return g.weapons.mines && g.weapons.mines.evo ? 5 : MINES_MAX; },
  /** Armes de départ (grenades, mines) offertes au début de chaque partie, niveau 1 */
  giveStarters(g) {
    for (const [id, def] of Object.entries(WEAPONS)) if (def.starter && !g.weapons[id]) {
      g.weapons[id] = { lvl: 1, t: 0, evo: false, aux: [] };
      g.upLevels['w_' + id] = 1;
    }
  },
  /** Armes en plus de l'équipement de départ (limite MAX_SIDE_WEAPONS) */
  sideCount(g) { return Object.keys(g.weapons).filter(id => !WEAPONS[id].starter).length; },

  /** Lance une grenade : cible verrouillée, sinon le curseur (PC), sinon le zombie le plus proche, sinon droit devant */
  throwGrenade(g, id = 'grenade') {
    const w = g.weapons[id], p = g.player;
    if (!w || w.t > 0 || p.inside) return false;
    const s = WEAPONS[id].stats(w.lvl), R = s.range;
    let tx, ty;
    const L = g.lock, cur = Input.mode === 'keyboard' && typeof Render !== 'undefined' && Render.cursorWorld ? Render.cursorWorld() : null;
    if (L && !L.dead && U.dist2(p.x, p.y, L.x, L.y) < R * R * 1.4) { tx = L.x; ty = L.y; }
    else if (cur) { tx = cur.x; ty = cur.y; }
    else { const t = this.nearest(g, p.x, p.y, R); if (t) { tx = t.x; ty = t.y; } else { tx = p.x + Math.cos(p.aimAngle) * 200; ty = p.y + Math.sin(p.aimAngle) * 200; } }
    // portée maximale
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > R) { tx = p.x + dx / d * R; ty = p.y + dy / d * R; }
    w.t = w.cdMax = s.cd * (p.equipCd || 1);
    const fire = id === 'molotov' ? { t: s.fire * (w.evo ? 1.3 : 1), r: s.radius * (w.evo ? 1.7 : 1.1), dps: s.dmg * (w.evo ? 1.6 : 1) } : w.evo ? { t: 3, r: s.radius * 0.75, dps: s.dmg * 0.45 } : null;
    for (let i = 0; i < s.count; i++) {
      const sx = i ? U.rand(-30, 30) : 0, sy = i ? U.rand(-30, 30) : 0;
      g.grenades.push({ x0: p.x, y0: p.y, x: p.x, y: p.y, tx: tx + sx, ty: ty + sy, t: -i * 0.12, dur: 0.55 + Math.min(d, R) / R * 0.35,
        r: s.radius, dmg: s.dmg * this.dmgMult(g), fire, molotov: id === 'molotov', z: 0 });
    }
    p.aimAngle = Math.atan2(dy, dx);
    Sfx.play('throw');
    return true;
  },

  /** Bonus de dégâts de l'équipement : personnage, atouts et pièces de l'établi, mais pas les dégâts propres
      de l'arme principale (sinon les grenades du fusil de précision faisaient ×3,5) */
  dmgMult(g) { return g.player.weapon.damage / (g.player.dmgBase || CONFIG.player.weapon.damage); },

  roll(g, base) { // critique partagé avec le fusil principal
    const w = g.player.weapon, crit = Math.random() < w.critChance;
    return { dmg: base * this.dmgMult(g) * (crit ? w.critMult : 1), crit };
  },

  nearest(g, x, y, range) {
    let best = range * range, t = null;
    for (const e of g.enemies) { if (e.dead) continue; const d2 = U.dist2(x, y, e.x, e.y); if (d2 < best) { best = d2; t = e; } }
    return t;
  },

  update(g, dt) {
    const p = g.player;
    for (const [id, w] of Object.entries(g.weapons)) {
      const type = WEAPONS[id].type;
      if (type === 'secondary') continue; // tir géré avec le fusil (entities.js)
      if (type === 'main' && (g.active !== id || g.swapT > 0)) { w.t = Math.min(w.t, 0.25); continue; } // rangée dans l'inventaire
      const s = WEAPONS[id].stats(w.lvl);
      if (type === 'main') { Gunsmith.tune(g, id, s); if (s.cd && Fun.on(g, 'frenzy')) s.cd /= 2; } // pièces de l'établi + Frénésie
      this[id](g, p, w, s, dt);
    }
    this.updateGrenades(g, dt);
    this.updateMines(g, dt);
    this.updateFireZones(g, dt);
  },

  /* ---------------- fusil à pompe ---------------- */
  shotgun(g, p, w, s, dt) {
    w.t -= dt;
    const t = this.target(g, p, s.range);
    if (t) p.aimAngle = Math.atan2(t.y - p.y, t.x - p.x); else this.idleAim(p);
    if (w.t > 0) return;
    if (!t) { w.t = 0.1; return; }
    w.t = s.cd;
    p.fireTimer = 1 / p.weapon.fireRate; // recul + flash du rendu
    const a = Math.atan2(t.y - p.y, t.x - p.x), n = s.pellets * (w.evo ? 2 : 1), sp = 520;
    for (let i = 0; i < n; i++) {
      const ang = a + (n > 1 ? (i / (n - 1) - 0.5) : 0) * s.spread * (w.evo ? 1.3 : 1) + U.rand(-0.04, 0.04);
      const r = this.roll(g, s.dmg);
      g.pBullets.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp * U.rand(0.9, 1.1), vy: Math.sin(ang) * sp * U.rand(0.9, 1.1),
        r: 3.2, dmg: r.dmg, crit: r.crit, pierce: (w.evo ? 2 : 0) + (p.extraPierce || 0), life: s.range / sp, hits: [], pellet: true, kb: 0.6 });
    }
    g.shake = Math.max(g.shake, 3);
    Sfx.play('shotgun');
  },

  /* ---------------- lance-flammes ---------------- */
  flamer(g, p, w, s, dt) {
    w.active = Math.max(0, (w.active || 0) - dt);
    w.t -= dt;
    const range = s.range * (w.evo ? 1.6 : 1), cone = s.cone * (w.evo ? 1.4 : 1), dmg = s.dmg * (w.evo ? 1.5 : 1);
    const t = this.target(g, p, range);
    if (t) p.aimAngle = Math.atan2(t.y - p.y, t.x - p.x); else this.idleAim(p);
    if (w.t > 0) return;
    w.t = s.tick;
    if (!t) return;
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    w.aim = a; w.active = 0.15; w.tick = (w.tick || 0) + 1;
    p.fireTimer = 0.5 / p.weapon.fireRate;
    // les flammes enflamment aussi les fûts dans le cône
    for (const b of g.barrels) {
      if (b.dead || b.fuse != null) continue;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      let da = Math.abs(Math.atan2(dy, dx) - a); if (da > Math.PI) da = TAU - da;
      if (d < range && da < cone) b.fuse = 0.4;
    }
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > range + e.r) continue;
      let da = Math.abs(Math.atan2(dy, dx) - a); if (da > Math.PI) da = TAU - da;
      if (da > cone + e.r / Math.max(d, 1)) continue;
      const r = this.roll(g, dmg);
      Entities.damageEnemy(g, e, r.dmg, r.crit, Math.cos(a) * 30, Math.sin(a) * 30, { noText: w.tick % 4 !== 0, ignoreArmor: true, src: 'flamer' });
    }
    // flammes visuelles
    for (let i = 0; i < 4 && g.particles.length < CONFIG.maxParticles; i++) {
      const ang = a + U.rand(-cone, cone) * 0.8, sp = range * U.rand(2.2, 3.2);
      g.particles.push({ x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        flame: true, color: Math.random() < 0.5 ? '#ff7a1a' : '#ffc23a', size: U.rand(6, 10), grow: 40, life: 0.32, max: 0.32 });
    }
    Sfx.play('flame');
  },

  /* ---------------- grenades ---------------- */
  /** Grenades : lancées à la main (Weapons.throwGrenade) ; ici on ne fait que la recharge */
  grenade(g, p, w, s, dt) {
    if (w.t > 0) w.t -= dt;
  },
  updateGrenades(g, dt) {
    for (const n of g.grenades) {
      n.t += dt;
      const k = U.clamp(n.t / n.dur, 0, 1);
      n.x = n.x0 + (n.tx - n.x0) * k; n.y = n.y0 + (n.ty - n.y0) * k; n.z = 22 + Math.sin(k * Math.PI) * 70 - k * 18;
      if (n.t >= n.dur) {
        n.dead = true;
        Entities.explode(g, n.tx, n.ty, n.r, n.dmg, { color: '#ff7a1a' });
        if (n.fire) g.fireZones.push({ x: n.tx, y: n.ty, r: n.fire.r, t: n.fire.t, max: n.fire.t, dps: n.fire.dps * this.dmgMult(g), tick: 0 });
      }
    }
    U.compact(g.grenades, n => !n.dead);
  },
  updateFireZones(g, dt) {
    for (const z of g.fireZones) {
      z.t -= dt; z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.25;
        for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - z.x, e.y - z.y) < z.r + e.r) Entities.damageEnemy(g, e, z.dps * 0.25, false, 0, 0, { noText: true, ignoreArmor: true, src: 'boom' });
      }
      if (Math.random() < 0.6 && g.particles.length < CONFIG.maxParticles) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * z.r;
        g.particles.push({ x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, vx: 0, vy: -20, flame: true, color: '#ff8a2a', size: U.rand(6, 11), grow: 14, life: 0.45, max: 0.45 });
      }
    }
    U.compact(g.fireZones, z => z.t > 0);
  },

  /* ---------------- drones ---------------- */
  drone(g, p, w, s, dt) {
    const n = s.count + (w.evo ? 2 : 0), cd = s.cd / (w.evo ? 2 : 1);
    g.drones.length = 0;
    for (let i = 0; i < n; i++) {
      const a = g.time * 2.2 + i * TAU / n;
      const d = { x: p.x + Math.cos(a) * 48, y: p.y + Math.sin(a) * 48, i };
      g.drones.push(d);
      w.aux[i] = (w.aux[i] == null ? Math.random() * cd : w.aux[i]) - dt;
      if (w.aux[i] > 0) continue;
      const t = this.nearest(g, d.x, d.y, s.range);
      if (!t) { w.aux[i] = 0.1; continue; }
      w.aux[i] = cd;
      const ang = Math.atan2(t.y - d.y, t.x - d.x), r = this.roll(g, s.dmg);
      g.pBullets.push({ x: d.x, y: d.y, vx: Math.cos(ang) * 600, vy: Math.sin(ang) * 600, r: 3, dmg: r.dmg, crit: r.crit,
        pierce: 0, life: s.range / 600, hits: [], drone: true, kb: 0.4 });
      Sfx.play('droneShot');
    }
  },

  /* ---------------- mines ---------------- */
  /** Mines : posées à la main (Weapons.placeMine) ; ici on ne fait que la recharge */
  mines(g, p, w, s, dt) {
    if (w.t > 0) w.t -= dt;
  },
  molotov(g, p, w, s, dt) { if (w.t > 0) w.t -= dt; },
  turretkit(g, p, w, s, dt) { if (w.t > 0) w.t -= dt; },
  wirekit(g, p, w, s, dt) { if (w.t > 0) w.t -= dt; },
  updateMines(g, dt) {
    for (const m of g.mines) {
      m.age += dt; m.arm -= dt;
      if (m.age > MINE_LIFE) { m.dead = true; Entities.puff(g, m.x, m.y, 3, 10, true); continue; } // s'éteint
      if (m.arm > 0) continue;
      for (const e of g.enemies) {
        if (!e.dead && Math.hypot(e.x - m.x, e.y - m.y) < 24 + e.r) { m.dead = true; Entities.explode(g, m.x, m.y, m.r, m.dmg, { color: '#ffb03a' }); break; }
      }
    }
    U.compact(g.mines, m => !m.dead);
  },
};
