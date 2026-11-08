'use strict';
/* =====================================================================
   PLAISIR EN PARTIE
   - Séries (combos) : chaque élimination prolonge la série ; paliers annoncés,
     la série multiplie la ferraille ramassée ; un coup reçu la casse.
   - Bonus temporaires (15 s) : Frénésie (cadence ×2), Balles explosives, Adrénaline (vitesse).
   - Coffres dorés lâchés par les élites et les boss : gerbe de ferraille + parfois un bonus.
   - Défis de vague : un petit défi pendant certaines vagues, avec une prime.
   - Ralenti sur les gros moments (boss abattu, grosse explosion).
   ===================================================================== */
const FUN = {
  combo: {
    window: 2.6,                 // secondes pour enchaîner l'élimination suivante
    tiers: [[10, 'SÉRIE !', '#ffd24a'], [25, 'CARNAGE !', '#ff9a3a'], [50, 'MASSACRE !', '#ff4a3a'], [100, 'APOCALYPSE !', '#c77dff'], [200, 'LÉGENDAIRE !', '#3ad6ff']],
    scrap: n => 1 + Math.min(1, Math.floor(n / 10) * 0.1), // +10 % de ferraille par tranche de 10, ×2 max
  },
  buffs: {
    frenzy:    { name: 'FRÉNÉSIE', icon: '🔥', desc: 'Cadence ×2', color: '#ff8a2a', dur: 15 },
    explosive: { name: 'BALLES EXPLOSIVES', icon: '💥', desc: 'Chaque balle explose', color: '#ff4a3a', dur: 15 },
    haste:     { name: 'ADRÉNALINE', icon: '⚡', desc: 'Vitesse +40 %', color: '#4ab8ff', dur: 15 },
  },
  buffChance: 0.0045,            // par zombie abattu
  chestCoins: w => 14 + Math.round(w * 1.6),
  eliteChest: 0.4,               // probabilité qu'un zombie élite lâche un coffre (les boss en lâchent toujours 2)
  challengeChance: 0.5,          // vagues 2+ (hors boss)
};

/* Capacité spéciale de chaque personnage (touche C / bouton à l'écran), avec recharge */
const ABILITIES = {
  survivor: { icon: '💫', name: 'Grenade aveuglante', desc: 'Les zombies proches sont aveuglés 3 s', cd: 22,
    use(g) { const p = g.player; let n = 0; for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 240) { e.stunT = e.def.boss ? 1.2 : 3; n++; }
      g.flash = 0.25; g.fx.push({ t: 'ring', x: p.x, y: p.y, r: 240 }); Entities.burst(g, p.x, p.y, '#fff6c8', 36, 380, 4, 0.5); Entities.addText(g, p.x, p.y - 50, `AVEUGLÉS ×${n}`, '#fff6c8', 18); } },
  scout: { icon: '💨', name: 'Sprint', desc: 'Vitesse ×1,8 pendant 4 s, intouchable au départ', cd: 16,
    use(g) { const p = g.player; p.sprintT = 4; p.invuln = Math.max(p.invuln, 0.6); Entities.puff(g, p.x, p.y, 6, 14, true); Entities.addText(g, p.x, p.y - 50, 'SPRINT !', '#4ab8ff', 18); } },
  swat: { icon: '🛡️', name: 'Bouclier', desc: '−80 % de dégâts pendant 5 s et onde de recul', cd: 24,
    use(g) { const p = g.player; p.shieldT = 5; for (const e of g.enemies) { const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; if (d < 170) { e.kbx += dx / d * 600; e.kby += dy / d * 600; } }
      g.fx.push({ t: 'ring', x: p.x, y: p.y, r: 170 }); Entities.burst(g, p.x, p.y, '#3ad6ff', 30, 300, 3.5, 0.5); Entities.addText(g, p.x, p.y - 50, 'BOUCLIER !', '#3ad6ff', 18); } },
  mechanic: { icon: '🔧', name: 'Tourelle express', desc: 'Pose aussitôt une tourelle devant vous', cd: 26,
    use(g) { const p = g.player, x = p.x + Math.cos(p.aimAngle) * 40, y = p.y + Math.sin(p.aimAngle) * 40; Allies.addTurret(g, x, y); Entities.puff(g, x, y, 6, 12, true); Entities.addText(g, p.x, p.y - 50, 'TOURELLE !', '#ffc21a', 18); } },
};

/* Défis de vague. ok(g) : proposé seulement si possible. on : événement suivi. */
const CHALLENGES = [
  { id: 'boom', icon: '💥', text: n => `Tuez ${n} zombies avec des explosions`, goal: w => 8 + Math.floor(w / 2), on: 'kill', test: k => k.src === 'boom' },
  { id: 'combo', icon: '🔗', text: n => `Atteignez une série de ${n}`, goal: w => 20 + w * 2, on: 'combo' },
  { id: 'nohit', icon: '🛡️', text: n => `Ne prenez aucun coup pendant ${n} s`, goal: () => 25, on: 'time' },
  { id: 'barrels', icon: '🛢️', text: n => `Faites exploser ${n} fûts`, goal: () => 3, on: 'barrel' },
  { id: 'crit', icon: '🎯', text: n => `Achevez ${n} zombies d'un coup critique`, goal: w => 8 + w, on: 'kill', test: k => k.crit },
  { id: 'shotgun', icon: '💢', text: n => `Tuez ${n} zombies au fusil à pompe`, goal: w => 15 + w * 2, on: 'kill', test: k => k.src === 'shotgun', ok: g => !!g.weapons.shotgun },
  { id: 'flamer', icon: '🔥', text: n => `Tuez ${n} zombies au lance-flammes`, goal: w => 15 + w * 2, on: 'kill', test: k => k.src === 'flamer', ok: g => !!g.weapons.flamer },
  { id: 'roll', icon: '🌀', text: n => `Faites ${n} roulades`, goal: () => 12, on: 'roll' },
];

const Fun = {
  init(g) {
    g.combo = { n: 0, t: 0, tier: 0, pop: 0 };
    g.buffs = {}; g.challenge = null; g.slowmo = 0; g.comboPop = null; g.lastHit = 0;
    Object.assign(g.stats, { bestCombo: 0, dmg: 0, dmgBy: {}, chests: 0, challenges: 0, buffs: 0 });
  },

  /* ---------------- séries ---------------- */
  onKill(g, e, k) {
    const c = g.combo;
    c.n++; c.t = FUN.combo.window; c.pop = 1;
    if (c.n > g.stats.bestCombo) g.stats.bestCombo = c.n;
    const tier = FUN.combo.tiers.findIndex(([n]) => c.n === n);
    if (tier >= 0) {
      const [, txt, col] = FUN.combo.tiers[tier];
      g.comboPop = { text: txt, sub: `Série de ${c.n} · ferraille ×${FUN.combo.scrap(c.n).toFixed(1)}`, color: col, t: 0 };
      Sfx.play('combo'); U.haptic(80);
    }
    this.track(g, 'kill', k); this.track(g, 'combo', c.n);
    if (e.def.boss) this.slow(g, 0.9);
    // bonus temporaire au hasard
    if (!e.def.boss && !e.elite && Math.random() < FUN.buffChance) Entities.dropPowerup(g, e.x, e.y, this.randomBuff());
  },
  onHurt(g) {
    const c = g.combo;
    if (c.n >= 10) Entities.addText(g, g.player.x, g.player.y - 46, `Série perdue (${c.n})`, '#ff8a7a', 14);
    c.n = 0; c.t = 0;
    g.lastHit = g.stats.time;
    if (g.challenge && g.challenge.def.on === 'time' && !g.challenge.done) g.challenge.n = 0;
  },
  scrapMult(g) { return g.combo ? FUN.combo.scrap(g.combo.n) : 1; },

  /* ---------------- bonus temporaires ---------------- */
  randomBuff() { const k = Object.keys(FUN.buffs); return k[Math.floor(Math.random() * k.length)]; },
  buff(g, kind) {
    const b = FUN.buffs[kind], p = g.player;
    g.buffs[kind] = b.dur; g.stats.buffs++;
    g.comboPop = { text: `${b.icon} ${b.name}`, sub: `${b.desc} · ${b.dur} s`, color: b.color, t: 0 };
    Entities.burst(g, p.x, p.y, b.color, 24, 260, 3.5, 0.6);
    g.fx.push({ t: 'ring', x: p.x, y: p.y, r: 90 });
    Sfx.play('buff'); U.haptic(60);
  },
  on(g, kind) { return g.buffs && g.buffs[kind] > 0; },
  rateMult(g) { return this.on(g, 'frenzy') ? 2 : 1; },
  speedMult(g) { return (this.on(g, 'haste') ? 1.4 : 1) * (g.player && g.player.sprintT > 0 ? 1.8 : 1); },
  /** Balle explosive : petite déflagration (sans tremblement d'écran) */
  miniBoom(g, x, y, dmg) {
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < 42 + e.r) Entities.damageEnemy(g, e, dmg, false, (e.x - x) / (d || 1) * 160, (e.y - y) / (d || 1) * 160, { noText: true, ignoreArmor: true, src: 'boom' });
    }
    Entities.burst(g, x, y, '#ffb03a', 6, 200, 3, 0.3);
    if (g.particles.length < CONFIG.maxParticles) g.particles.push({ x, y, vx: 0, vy: 0, flame: true, color: '#ff8a2a', size: 12, grow: 60, life: 0.22, max: 0.22 });
  },

  /* ---------------- coffres dorés ---------------- */
  openChest(g, c) {
    const p = g.player, n = FUN.chestCoins(g.wave.num);
    for (let i = 0; i < Math.min(n, 18); i++) {
      const a = Math.random() * TAU, s = U.rand(90, 260);
      g.pickups.push({ kind: 'coin', x: c.x, y: c.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 7, z: 10, vz: U.rand(220, 380),
        value: Math.max(1, Math.round(n / Math.min(n, 18))), age: 0, attract: false, spd: 0, dead: false });
    }
    g.stats.chests++;
    g.flash = Math.max(g.flash, 0.2);
    Entities.burst(g, c.x, c.y, '#ffd24a', 40, 340, 4, 0.8);
    Entities.star(g, c.x, c.y, 2.4, '#fff3b0');
    g.fx.push({ t: 'ring', x: c.x, y: c.y, r: 110 });
    Entities.addText(g, c.x, c.y - 40, 'COFFRE !', '#ffd24a', 24);
    if (Math.random() < 0.45) Entities.dropPowerup(g, c.x, c.y, Fun.randomBuff());
    Sfx.play('chest'); U.haptic(100);
  },

  /* ---------------- capacité spéciale ---------------- */
  ability(g) { return ABILITIES[g.charId] || ABILITIES.survivor; },
  useAbility(g) {
    const p = g.player;
    if (g.state !== 'playing' || !p || p.inside || (p.abilityT || 0) > 0) { if (p && p.abilityT > 0) Sfx.play('click'); return false; }
    const a = this.ability(g);
    a.use(g); p.abilityT = a.cd * (p.abilityCdMult || 1);
    g.stats.abilities = (g.stats.abilities || 0) + 1;
    Sfx.play('ability'); U.haptic(70); g.shake = Math.max(g.shake, 6);
    return true;
  },

  /* ---------------- ralenti ---------------- */
  slow(g, t) { g.slowmo = Math.max(g.slowmo || 0, t); },

  /* ---------------- défis de vague ---------------- */
  startChallenge(g, n) {
    g.challenge = null;
    if (n < 2 || g.wave.isBoss || Math.random() > FUN.challengeChance) return;
    const pool = CHALLENGES.filter(c => !c.ok || c.ok(g));
    const def = pool[Math.floor(Math.random() * pool.length)];
    const goal = def.goal(n);
    g.challenge = { def, goal, n: 0, done: false, reward: 45 + n * 6, text: def.text(goal) };
  },
  track(g, ev, k) {
    const ch = g.challenge;
    if (!ch || ch.done || ch.def.on !== ev || g.phase !== 'wave') return;
    if (ev === 'kill') { if (!ch.def.test || ch.def.test(k)) ch.n++; }
    else if (ev === 'combo') ch.n = Math.max(ch.n, k);
    else ch.n++;
    if (ch.n >= ch.goal) this.winChallenge(g);
  },
  winChallenge(g) {
    const ch = g.challenge; ch.done = true; ch.n = ch.goal;
    g.coins += ch.reward; g.stats.challenges++;
    g.comboPop = { text: 'DÉFI RÉUSSI !', sub: `${ch.def.icon} ${ch.text} · +${ch.reward} 🔩`, color: '#7dff6a', t: 0 };
    Entities.burst(g, g.player.x, g.player.y, '#7dff6a', 30, 280, 3.5, 0.7);
    Sfx.play('achieve');
  },
  endWave(g) {
    const ch = g.challenge;
    if (ch && !ch.done) Entities.addText(g, g.player.x, g.player.y - 50, `Défi raté : ${ch.text}`, '#ff8a7a', 13);
    g.challenge = null;
  },

  /* ---------------- chaque image ---------------- */
  update(g, dt) {
    // fin de vague qui traîne (≤ 3 zombies, plus rien à venir) : ils s'énervent et foncent sur vous
    if (g.phase === 'wave' && !g.wave.queue.length && !g.wave.warnings.length && g.enemies.length && g.enemies.length + (g.burrowers || []).length <= 3) {
      g.lastStand = (g.lastStand || 0) + dt;
      if (g.lastStand > 8 && !g.enemies.every(e => e.enraged)) {
        for (const e of g.enemies) if (!e.enraged) { e.enraged = true; Entities.burst(g, e.x, e.y, '#ff3a2a', 12, 200, 3, 0.5); }
        Entities.addText(g, g.player.x, g.player.y - 50, 'Les derniers zombies enragent !', '#ff6a4a', 14);
      }
    } else g.lastStand = 0;
    // capacités : recharge et effets en cours
    const p = g.player;
    if (p) {
      if (p.abilityT > 0) p.abilityT -= dt;
      if (p.sprintT > 0) { p.sprintT -= dt; if (Math.random() < 0.4) Entities.puff(g, p.x, p.y + p.r, 1, 8, true); }
      if (p.shieldT > 0) { p.shieldT -= dt; if (Math.random() < 0.35) { const a = Math.random() * TAU; Entities.star(g, p.x + Math.cos(a) * 26, p.y + Math.sin(a) * 26, 0.6, '#3ad6ff'); } }
    }
    const c = g.combo;
    if (c.t > 0) { c.t -= dt; if (c.t <= 0) c.n = 0; }
    if (c.pop > 0) c.pop = Math.max(0, c.pop - dt * 5);
    for (const k in g.buffs) { g.buffs[k] -= dt; if (g.buffs[k] <= 0) delete g.buffs[k]; }
    if (g.comboPop) { g.comboPop.t += dt; if (g.comboPop.t > 1.8) g.comboPop = null; }
    const ch = g.challenge;
    if (ch && !ch.done && ch.def.on === 'time' && g.phase === 'wave' && !g.player.inside) { ch.n = Math.min(ch.goal, g.stats.time - Math.max(g.lastHit || 0, g.waveStartTime || 0)); if (ch.n >= ch.goal) this.winChallenge(g); }
  },
};
