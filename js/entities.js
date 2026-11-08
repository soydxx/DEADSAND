'use strict';
/* =====================================================================
   ENTITÉS : joueur, ennemis (comportements), projectiles, ferraille,
   bonus, fûts explosifs, explosions, effets.
   Les entités sont de simples objets ; la logique est dans des fonctions.
   Les effets visuels ponctuels (onde de choc, flaque au sol…) sont
   signalés au rendu via la file g.fx.
   ===================================================================== */

/** Garde une entité hors des murs/bâtiments et dans le monde */
function clampToArena(o) { World.resolve(o); }

/** Un projectile sort-il du monde ou touche-t-il un obstacle ? */
function outOfArena(o) { return World.solidAt(o.x, o.y); }

/**
 * Déplacement d'un zombie vers sa cible : tout droit s'il la voit,
 * sinon en suivant le champ de flux (contourne bâtiments et murs).
 */
function seek(e, g, dt) {
  const t = Entities.targetOf(g, e);
  e.losT = (e.losT || 0) - dt;
  if (e.losT <= 0) { e.losT = 0.22 + Math.random() * 0.12; e.los = World.los(e.x, e.y, t.x, t.y); }
  const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
  let nx = dx / d, ny = dy / d;
  if (!e.los && d > 40) { const f = World.flowDir(e.x, e.y); if (f) { nx = f.x; ny = f.y; } }
  return { nx, ny, d, t };
}

/** Repousse un cercle hors d'un autre (obstacles : fûts) */
function pushOut(o, b, minD) {
  const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD || d2 === 0) return;
  const d = Math.sqrt(d2), k = (minD - d) / d;
  o.x += dx * k; o.y += dy * k;
}

/* ---------------- Comportements ennemis (clé = ENEMY_TYPES[x].behavior) ---------------- */
const BEHAVIORS = {
  // Fonce sur le joueur (option wobble : trajectoire en zigzag)
  chase(e, g, dt) {
    const s = seek(e, g, dt);
    let a = Math.atan2(s.ny, s.nx);
    if (e.def.wobble && e.los) a += Math.sin(e.age * 6 + e.phase) * 0.55;
    const sp = e.speed * (e.slowT > 0 ? ALLIES.trap.slow : 1);
    e.vx = Math.cos(a) * sp;
    e.vy = Math.sin(a) * sp;
  },

  // Hurleur : garde ses distances et hurle régulièrement (accélère les zombies proches)
  howler(e, g, dt) {
    const s = seek(e, g, dt), pref = e.def.preferredDist;
    e.phase += dt * 0.5;
    const f = !e.los ? 1 : s.d > pref + 30 ? 1 : s.d < pref - 30 ? -0.7 : 0, sg = Math.sin(e.phase) > 0 ? 1 : -1;
    e.vx = (s.nx * f - s.ny * 0.5 * sg) * e.speed; e.vy = (s.ny * f + s.nx * 0.5 * sg) * e.speed;
    e.howl = (e.howl == null ? 2 + Math.random() * 2 : e.howl) - dt;
    if (e.howl <= 0 && s.d < 600) {
      e.howl = e.def.howlEvery;
      let n = 0;
      for (const o of g.enemies) if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < e.def.howlRadius) { o.howlT = 4; n++; Entities.burst(g, o.x, o.y, '#c88aff', 3, 90, 2, 0.4); }
      g.fx.push({ t: 'ring', x: e.x, y: e.y, r: e.def.howlRadius });
      Entities.addText(g, e.x, e.y - 40, n ? `HURLEMENT ×${n}` : 'HURLEMENT', '#c88aff', 14);
      Sfx.groanAt(0.28, 0.6);
    }
  },

  // Kamikaze : fonce et explose au contact (l'explosion blesse aussi les autres zombies)
  bomber(e, g, dt) {
    BEHAVIORS.chase(e, g, dt);
    const p = g.player, t = Entities.targetOf(g, e), rr = e.r + (p.inside ? 30 : p.r + 6);
    if (U.dist2(e.x, e.y, t.x, t.y) < rr * rr && e.age > 0.5) {
      if (p.inside) { const s = g.shelters[p.inside]; s.hp -= 80; }
      Entities.killEnemy(g, e, true);
    }
  },

  // Garde ses distances, tourne autour du joueur et tire (seulement s'il le voit)
  ranged(e, g, dt) {
    const p = g.player;
    const s = seek(e, g, dt);
    const d = s.d, pref = e.def.preferredDist;
    e.phase += dt * 0.35;
    if (!e.los || p.inside) {
      e.vx = s.nx * e.speed; e.vy = s.ny * e.speed;
    } else {
      const nx = s.nx, ny = s.ny, f = d > pref + 30 ? 1 : d < pref - 30 ? -1 : 0, sg = Math.sin(e.phase) > 0 ? 1 : -1;
      e.vx = (nx * f - ny * 0.6 * sg) * e.speed;
      e.vy = (ny * f + nx * 0.6 * sg) * e.speed;
    }
    const dx = p.x - e.x, dy = p.y - e.y;
    e.cooldown -= dt;
    if (e.cooldown <= 0 && d < pref + 160 && e.los && !p.inside) {
      e.cooldown = e.def.fireCooldown * U.rand(0.85, 1.15);
      shootEnemyBullet(g, e, Math.atan2(dy, dx), e.def.bulletSpeed, e.bulletDamage);
      Sfx.play('enemyShot');
    }
  },

  // Boss : avance lentement, alterne anneau de balles / salve visée, invoque des renforts
  boss(e, g, dt) {
    const p = g.player;
    const s = seek(e, g, dt);
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    const enraged = e.hp < e.maxHp * 0.5;
    const sp = e.speed * (enraged ? 1.35 : 1);
    e.vx = s.nx * sp;
    e.vy = s.ny * sp;

    e.cooldown -= dt;
    if (e.cooldown <= 0 && !p.inside && Math.hypot(p.x - e.x, p.y - e.y) < 650) {
      e.pattern = (e.pattern || 0) + 1;
      const bs = e.def.bulletSpeed, dmg = e.bulletDamage;
      if (e.pattern % 2) {
        const n = enraged ? 20 : 14, off = e.age;
        for (let i = 0; i < n; i++) shootEnemyBullet(g, e, off + i * TAU / n, bs, dmg);
      } else {
        for (let k = -2; k <= 2; k++) shootEnemyBullet(g, e, a + k * 0.18, bs * 1.3, dmg);
      }
      e.cooldown = e.def.fireCooldown * (enraged ? 0.65 : 1);
      g.shake = Math.max(g.shake, 5);
      Sfx.play('bossShot');
    }

    e.summon = (e.summon == null ? e.def.summonEvery : e.summon) - dt;
    if (e.summon <= 0) {
      e.summon = e.def.summonEvery;
      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * TAU;
        g.wave.addWarning(enraged ? (i === 0 ? 'bomber' : 'fast') : 'basic', e.x + Math.cos(ang) * 70, e.y + Math.sin(ang) * 70, 0.7);
      }
    }
  },
};

/* ---------------- Boss supplémentaires ---------------- */
Object.assign(BEHAVIORS, {
  // La Reine : garde ses distances, tire des salves violettes et fait naître des zombies en continu
  queen(e, g, dt) {
    const p = g.player, s = seek(e, g, dt), pref = e.def.preferredDist, enraged = e.hp < e.maxHp * 0.5;
    e.phase += dt * 0.4;
    const f = s.d > pref + 40 ? 1 : s.d < pref - 40 ? -1 : 0, sg = Math.sin(e.phase) > 0 ? 1 : -1;
    e.vx = (s.nx * f - s.ny * 0.5 * sg) * e.speed; e.vy = (s.ny * f + s.nx * 0.5 * sg) * e.speed;
    if (!e.los) { e.vx = s.nx * e.speed; e.vy = s.ny * e.speed; }
    e.cooldown -= dt;
    if (e.cooldown <= 0 && e.los && !p.inside && s.d < 600) {
      e.cooldown = e.def.fireCooldown * (enraged ? 0.7 : 1);
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      for (let k = -1; k <= 1; k++) shootEnemyBullet(g, e, a + k * 0.22, e.def.bulletSpeed, e.bulletDamage);
      Sfx.play('enemyShot');
    }
    e.summon = (e.summon == null ? 1.5 : e.summon) - dt;
    if (e.summon <= 0) {
      e.summon = e.def.summonEvery * (enraged ? 0.7 : 1);
      e.screamT = 0.6; g.shake = Math.max(g.shake, 4); Sfx.play('groan');
      for (let i = 0; i < (enraged ? 5 : 4); i++) {
        const ang = Math.random() * TAU;
        g.wave.addWarning(i % 2 ? 'crawler' : 'fast', e.x + Math.cos(ang) * 60, e.y + Math.sin(ang) * 60, 0.6);
      }
    }
    if (e.screamT > 0) e.screamT -= dt;
  },

  // Le Bélier : marche, s'arrête pour viser (avertissement au sol), puis charge en ligne droite.
  // S'il percute un mur ou un bâtiment, il est sonné et prend plus de dégâts.
  charger(e, g, dt) {
    const p = g.player, D = e.def;
    e.cstate = e.cstate || 'walk';
    if (e.cstate === 'walk') {
      const s = seek(e, g, dt), enraged = e.hp < e.maxHp * 0.5;
      e.vx = s.nx * e.speed; e.vy = s.ny * e.speed;
      e.ct = (e.ct == null ? 2 : e.ct) - dt;
      if (e.ct <= 0 && e.los && s.d < 560 && !p.inside) {
        e.cstate = 'windup'; e.wt = D.windup * (enraged ? 0.7 : 1); e.cdir = Math.atan2(p.y - e.y, p.x - e.x);
        Sfx.play('groan');
      }
    } else if (e.cstate === 'windup') {
      e.vx = e.vy = 0; e.wt -= dt;
      e.cdir += U.clamp(((Math.atan2(p.y - e.y, p.x - e.x) - e.cdir + Math.PI * 3) % TAU) - Math.PI, -dt * 1.2, dt * 1.2); // ajuste un peu sa visée
      if (e.wt <= 0) { e.cstate = 'charge'; e.ctime = D.chargeTime; g.shake = Math.max(g.shake, 6); Sfx.play('charge'); }
    } else if (e.cstate === 'charge') {
      const cx = Math.cos(e.cdir), cy = Math.sin(e.cdir);
      e.vx = cx * D.chargeSpeed; e.vy = cy * D.chargeSpeed; e.ctime -= dt;
      if (Math.random() < 0.6) Entities.puff(g, e.x - cx * e.r, e.y - cy * e.r, 1, 16, true);
      if (World.solidAt(e.x + cx * (e.r + 8), e.y + cy * (e.r + 8))) { // percute un mur : sonné
        e.cstate = 'stun'; e.st = 1.8; e.vx = e.vy = 0;
        g.shake = Math.max(g.shake, 16); Entities.puff(g, e.x + cx * e.r, e.y + cy * e.r, 8, 22); Sfx.play('boom');
        Entities.addText(g, e.x, e.y - e.r * 1.8, 'SONNÉ !', '#ffd24a', 18);
      } else if (e.ctime <= 0) { e.cstate = 'walk'; e.ct = D.chargeEvery; }
    } else { // sonné
      e.vx = e.vy = 0; e.st -= dt;
      if (Math.random() < 0.2) Entities.star(g, e.x + U.rand(-20, 20), e.y - e.r, 0.6, '#ffe08a');
      if (e.st <= 0) { e.cstate = 'walk'; e.ct = D.chargeEvery * 0.6; }
    }
  },

  // La Gerbeuse : avance lentement et arrose de bile en éventail (flaques acides à l'impact)
  spewer(e, g, dt) {
    const p = g.player, s = seek(e, g, dt), enraged = e.hp < e.maxHp * 0.5;
    e.vx = s.nx * e.speed * (s.d < 160 ? 0.3 : 1); e.vy = s.ny * e.speed * (s.d < 160 ? 0.3 : 1);
    e.cooldown -= dt;
    if (e.cooldown <= 0 && e.los && !p.inside && s.d < 560) {
      e.cooldown = e.def.fireCooldown * (enraged ? 0.7 : 1);
      const a = Math.atan2(p.y - e.y, p.x - e.x), n = enraged ? 9 : 7;
      for (let i = 0; i < n; i++) shootEnemyBullet(g, e, a + (i / (n - 1) - 0.5) * 1.0, e.def.bulletSpeed * U.rand(0.8, 1.15), e.bulletDamage);
      Sfx.play('splat'); g.shake = Math.max(g.shake, 3);
    }
  },
});

function shootEnemyBullet(g, e, angle, speed, dmg) {
  g.eBullets.push({
    x: e.x + Math.cos(angle) * e.r, y: e.y + Math.sin(angle) * e.r,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: 6, dmg, life: 6, color: e.def.bulletColor || '#ffb347', acid: !!e.def.acid,
  });
}

/* ---------------------------------------------------------------------------------------- */
const Entities = {
  /** Ce que vise un zombie : la survivante, la porte du refuge où elle se cache, ou le générateur à défendre */
  targetOf(g, e) {
    const p = g.player;
    let t = p.inside ? World.doorOf(p.inside) : p;
    const o = g.objective;
    if (o && o.type === 'defend' && !o.failed) {
      const dg = Math.hypot(o.gen.x - e.x, o.gen.y - e.y), dp = Math.hypot(t.x - e.x, t.y - e.y);
      if (dg < 300 && dg < dp) t = o.gen;
    }
    return t;
  },

  createPlayer() {
    const c = CONFIG.player;
    return {
      x: CONFIG.world.width / 2, y: CONFIG.world.height / 2, r: c.radius,
      vx: 0, vy: 0,
      hp: c.maxHp, maxHp: c.maxHp, speed: c.speed,
      invuln: 0, magnet: c.magnet, regen: c.regen, armor: c.armor, lifeOnKill: c.lifeOnKill,
      weapon: Object.assign({}, c.weapon),
      fireTimer: 0, aimAngle: -Math.PI / 2,
      rollCdMax: CONFIG.roll.cooldown, rollT: 0, rollDirX: 0, rollDirY: 1,
      stamina: CONFIG.roll.charges, staminaMax: CONFIG.roll.charges, staminaDelay: 0,
      scrapMult: 1, freeRerolls: 0,
    };
  },

  spawnEnemy(g, typeId, x, y, opts = {}) {
    const def = ENEMY_TYPES[typeId], w = g.wave.num, wc = WAVE_CONFIG;
    const hpMul = ENEMY_TYPES[typeId].boss ? wc.bossHpMult(w) : wc.hpMult(w);
    const dmgMul = wc.damageMult(w);
    const elite = !!opts.elite;
    const e = {
      type: typeId, def, x, y, r: def.radius * (elite ? 1.15 : 1), elite,
      vx: 0, vy: 0, kbx: 0, kby: 0,
      hp: def.hp * hpMul * (elite ? 3 : 1), maxHp: def.hp * hpMul * (elite ? 3 : 1),
      speed: def.speed * wc.speedMult(w) * (ENEMY_TYPES[typeId].boss ? 1 : U.rand(0.9, 1.1)) * (elite ? 1.1 : 1),
      damage: def.damage * dmgMul * (elite ? 1.3 : 1),
      bulletDamage: (def.bulletDamage || 0) * dmgMul,
      armor: def.armor || 0,
      cooldown: def.fireCooldown ? def.fireCooldown * U.rand(0.5, 1) : 0,
      phase: Math.random() * 10, age: 0, flash: 0, dead: false,
    };
    clampToArena(e);
    if (g.mods && g.mods.fast) e.speed *= 1.3; // modificateur : zombies enragés
    if (def.burrow) { e.burrowed = true; (g.burrowers = g.burrowers || []).push(e); return e; } // Enfouisseur : sous le sable
    g.enemies.push(e);
    Entities.burst(g, e.x, e.y, '#d9b273', ENEMY_TYPES[typeId].boss ? 30 : 8, 150, ENEMY_TYPES[typeId].boss ? 5 : 3, 0.45);
    Entities.puff(g, e.x, e.y, ENEMY_TYPES[typeId].boss ? 8 : 3, e.r);
    return e;
  },

  /* ------------------------------ Joueur ------------------------------ */
  /** Déclenche une roulade d'esquive (invincible pendant la roulade) */
  roll(g) {
    const p = g.player;
    if (!p || p.stamina < 1 || p.rollT > 0 || p.inside) return false;
    const m = Input.getMove();
    let dx = m.x, dy = m.y;
    if (!dx && !dy) { dx = Math.cos(p.aimAngle); dy = Math.sin(p.aimAngle); }
    const d = Math.hypot(dx, dy) || 1;
    p.rollDirX = dx / d; p.rollDirY = dy / d;
    p.rollT = CONFIG.roll.duration; p.stamina -= 1; p.staminaDelay = CONFIG.roll.delay;
    g.stats.rolls++; Fun.track(g, 'roll');
    Entities.rollTrail(g, p.x, p.y + p.r * 1.2, 4, 10);
    Sfx.play('roll');
    return true;
  },

  updatePlayer(g, dt) {
    const p = g.player, m = Input.getMove();
    // endurance : les charges de roulade reviennent une à une
    if (p.staminaDelay > 0) p.staminaDelay -= dt;
    else if (p.stamina < p.staminaMax) p.stamina = Math.min(p.staminaMax, p.stamina + dt / p.rollCdMax);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.inside) { p.vx = p.vy = 0; return; } // à l'abri dans un refuge : ni déplacement ni tir
    const carry = g.objective && g.objective.item && g.objective.item.carried ? 0.85 : 1;
    if (p.rollT > 0) {
      p.rollT -= dt;
      const sp = p.speed * CONFIG.roll.speedMult;
      p.vx = p.rollDirX * sp; p.vy = p.rollDirY * sp;
      if (Math.random() < 0.5) Entities.rollTrail(g, p.x, p.y + p.r * 1.3, 1, 7);
    } else {
      const hs = Fun.speedMult(g);
      p.vx = m.x * p.speed * carry * hs; p.vy = m.y * p.speed * carry * hs;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    for (const b of g.barrels) pushOut(p, b, p.r + b.r);
    clampToArena(p);
    if (m.x || m.y) {
      p.stepT = (p.stepT || 0) + dt;
      if (p.stepT > 0.16) { p.stepT = 0; Entities.puff(g, p.x - m.x * 8, p.y + p.r * 1.35, 1, 6, true); }
    }
    // régénération (Rations) : réserve limitée à 35 % de la vie par vague (sinon soin infini en gardant un zombie en vie)
    if (p.regen > 0 && (p.regenPool || 0) > 0 && p.hp < p.maxHp) { const h = Math.min(p.regen * dt, p.regenPool, p.maxHp - p.hp); p.hp += h; p.regenPool -= h; }
    p.lsBudget = Math.min(4, (p.lsBudget || 0) + 4 * dt);

    // Tir : sur la cible verrouillée (zombie ou fût) si elle est à portée et visible,
    // sinon automatiquement sur le zombie visible le plus proche
    p.fireTimer -= dt;
    const w = p.weapon;
    let target = null, best = w.range * w.range;
    const L = g.lock;
    if (L && (L.dead || (L.fuse != null) || (L.hp != null && L.hp <= 0 && !L.def))) g.lock = null;
    if (g.active && g.active !== 'rifle') return; // fusil à pompe / lance-flammes équipé : géré par weapons.js
    if (g.lock && U.dist2(p.x, p.y, L.x, L.y) < (w.range * 1.3) ** 2 && World.los(p.x, p.y, L.x, L.y)) target = L;
    if (!target) for (const e of g.enemies) {
      if (e.dead) continue;
      const d2 = U.dist2(p.x, p.y, e.x, e.y);
      if (d2 < best && World.los(p.x, p.y, e.x, e.y)) { best = d2; target = e; }
    }
    if (target) {
      if (p.fireTimer <= 0) { Entities.fire(g, p, target); p.fireTimer += 1 / (w.fireRate * Fun.rateMult(g)); g.shake = Math.max(g.shake, 1.2); }
      if (p.fireTimer < 0) p.fireTimer = 0;
    } else {
      if (p.fireTimer < 0) p.fireTimer = 0;
      if (m.x || m.y) p.aimAngle = Math.atan2(m.y, m.x);
    }
  },

  fire(g, p, t) {
    const w = p.weapon;
    const d = Math.sqrt(U.dist2(p.x, p.y, t.x, t.y));
    const tt = d / w.projSpeed * 0.8;
    const base = Math.atan2(t.y + (t.vy || 0) * tt - p.y, t.x + (t.vx || 0) * tt - p.x);
    p.aimAngle = base;
    const n = w.projCount, life = w.range * 1.15 / w.projSpeed;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * w.spread;
      const crit = Math.random() < w.critChance;
      g.pBullets.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * w.projSpeed, vy: Math.sin(a) * w.projSpeed,
        r: w.projRadius * (crit ? 1.25 : 1), dmg: w.damage * (crit ? w.critMult : 1), crit,
        pierce: w.pierce, life, hits: [],
      });
    }
    // douille éjectée sur le côté
    if (g.particles.length < CONFIG.maxParticles) {
      const s = base + Math.PI / 2 + U.rand(-0.3, 0.3);
      g.particles.push({ x: p.x, y: p.y, vx: Math.cos(s) * U.rand(50, 90), vy: Math.sin(s) * U.rand(50, 90),
        casing: true, z: 22, vz: U.rand(80, 140), color: '#e8b84a', size: 2.2, life: 1.4, max: 1.4 });
    }
    Sfx.play('shoot');
  },

  hurtPlayer(g, dmg) {
    const p = g.player;
    if (p.invuln > 0 || p.rollT > 0 || p.inside || g.state !== 'playing') return;
    Fun.onHurt(g);
    if (p.shieldT > 0) dmg *= 0.2; // Bouclier de Brick
    const d = Math.max(1, Math.round(dmg - p.armor));
    p.hp -= d;
    p.invuln = CONFIG.player.invulnTime;
    g.shake = Math.max(g.shake, 9);
    g.hurtFlash = 0.3;
    g.hitStop = Math.max(g.hitStop || 0, 0.05);
    Entities.addText(g, p.x, p.y - p.r - 8, `-${d}`, '#ff6b7a', 18);
    Entities.burst(g, p.x, p.y, '#c8323a', 10, 180, 3.5, 0.45);
    Sfx.play('hurt');
    U.haptic(40);
    if (p.hp <= 0) { p.hp = 0; g.onPlayerDeath(); }
  },

  /* ------------------------------ Ennemis ------------------------------ */
  updateEnemies(g, dt) {
    const p = g.player, list = g.enemies;
    const o = g.objective, gen = o && o.type === 'defend' && !o.failed ? o.gen : null;
    for (const e of list) {
      e.age += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      BEHAVIORS[e.def.behavior](e, g, dt);
      if (gen && Math.hypot(gen.x - e.x, gen.y - e.y) < e.r + 30) { gen.hp -= e.damage * 0.8 * dt; gen.flash = 0.08; }
      if (e.dead) continue;
      // modificateurs de vitesse : dernier carré enragé, cri du Hurleur, aveuglé (capacité de Mia)
      if (e.enraged) { e.vx *= 1.7; e.vy *= 1.7; }
      if (e.howlT > 0) { e.howlT -= dt; e.vx *= 1.5; e.vy *= 1.5; }
      if (e.stunT > 0) { e.stunT -= dt; e.vx = 0; e.vy = 0; e.cooldown = Math.max(e.cooldown || 0, 0.3); }
      e.x += (e.vx + e.kbx) * dt;
      e.y += (e.vy + e.kby) * dt;
      const decay = Math.exp(-8 * dt);
      e.kbx *= decay; e.kby *= decay;
    }
    // Séparation (évite que les ennemis s'empilent) — pondérée par la masse
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), push = (min - d);
        const ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push * (mb / tot); a.y -= ny * push * (mb / tot);
        b.x += nx * push * (ma / tot); b.y += ny * push * (ma / tot);
      }
    }
    for (const e of list) {
      if (e.dead) continue;
      for (const b of g.barrels) {
        // contourne le fût au lieu de rester bloqué face à lui (glisse sur le côté)
        const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy) || 1, min = e.r + b.r + 2;
        if (d < min && (e.vx * dx + e.vy * dy) < 0) {
          let tx = -dy / d, ty = dx / d;
          if (tx * e.vx + ty * e.vy < 0) { tx = -tx; ty = -ty; }
          const sp = Math.max(30, Math.hypot(e.vx, e.vy)) * 0.9 * dt;
          e.x += tx * sp; e.y += ty * sp;
        }
        pushOut(e, b, e.r + b.r);
      }
      clampToArena(e);
      // filet de sécurité : un zombie immobile depuis 10 s (coincé quelque part) est replacé plus près
      if (e.ax == null || Math.hypot(e.x - e.ax, e.y - e.ay) > 30) { e.ax = e.x; e.ay = e.y; e.stillT = 0; }
      else if ((e.stillT += dt) > 10 && !e.los && !p.inside && g.phase === 'wave' && !(gen && Math.hypot(gen.x - e.x, gen.y - e.y) < e.r + 50)) {
        const q = World.randomPoint(p.x, p.y, 260, 520, e.r);
        e.x = q.x; e.y = q.y; e.ax = e.x; e.ay = e.y; e.stillT = 0;
      }
      const rr = e.r + p.r * 0.85;
      if (e.damage > 0 && !p.inside && U.dist2(e.x, e.y, p.x, p.y) < rr * rr) Entities.hurtPlayer(g, e.damage);
    }
    U.compact(list, e => !e.dead);
  },

  /** opts.noText : pas de chiffre (dégâts continus) | opts.ignoreArmor */
  damageEnemy(g, e, dmg, crit, kx, ky, opts = {}) {
    if (e.dead) return;
    if (e.armor && !opts.ignoreArmor) dmg = Math.max(1, dmg - (crit ? e.armor / 2 : e.armor));
    if (e.cstate === 'stun') dmg *= 1.6; // Bélier sonné : point faible
    const real = Math.min(dmg, Math.max(0, e.hp)), src = opts.src || 'rifle';
    g.stats.dmg = (g.stats.dmg || 0) + real; if (g.stats.dmgBy) g.stats.dmgBy[src] = (g.stats.dmgBy[src] || 0) + real;
    e.hp -= dmg;
    e.flash = 0.08;
    const res = e.def.knockbackResist || 0;
    e.kbx += (kx || 0) * (1 - res); e.kby += (ky || 0) * (1 - res);
    if (!opts.noText) {
      Entities.addText(g, e.x + U.rand(-6, 6), e.y - e.r * 1.6, `-${Math.round(dmg)}`,
        crit ? '#ffd000' : e.armor && !opts.ignoreArmor ? '#b8c4d0' : '#ff5a2a', crit ? 19 : 14);
      Sfx.play(e.armor ? 'clang' : 'hit');
    }
    if (e.hp <= 0) Entities.killEnemy(g, e, false, { crit, src });
  },

  /** exploded = le kamikaze s'est fait sauter lui-même au contact */
  killEnemy(g, e, exploded = false, k = {}) {
    if (e.dead) return;
    e.dead = true;
    Fun.onKill(g, e, k);
    const def = e.def, p = g.player;
    g.stats.kills++;
    g.stats.score += def.score * (e.elite ? 4 : 1);
    if (e.def.boss) g.stats.bosses++;
    if (e.elite) g.stats.elites++;
    // vol de vie (Seringue de rage) : plafonné à 4 PV/s pour ne pas rendre invincible au milieu de la horde
    if (p.lifeOnKill) { const h = Math.min(p.lifeOnKill, p.lsBudget || 0); p.hp = Math.min(p.maxHp, p.hp + h); p.lsBudget = (p.lsBudget || 0) - h; }
    // ferraille
    const total = def.coins * (e.elite ? 5 : 1);
    const n = Math.min(total, 10);
    let left = total;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.max(1, Math.floor(total / n));
      left -= v;
      const a = Math.random() * TAU, s = U.rand(40, 140);
      g.pickups.push({ kind: 'coin', x: e.x, y: e.y + e.r * 0.8, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, r: v > 2 ? 7 : 5,
        z: e.r, vz: U.rand(140, 230), value: v, age: 0, attract: false, spd: 0, dead: false });
    }
    // bonus
    const pc = CONFIG.powerups;
    // coffre doré : élites et boss (le boss en lâche deux + une trousse)
    if (e.def.boss) { Entities.dropPowerup(g, e.x - 30, e.y, 'chest'); Entities.dropPowerup(g, e.x + 30, e.y, 'chest'); Entities.dropPowerup(g, e.x, e.y + 30, 'medkit'); }
    else if (e.elite) Entities.dropPowerup(g, e.x, e.y, Math.random() < FUN.eliteChest ? 'chest' : ['medkit', 'magnet', 'bomb'][Math.floor(Math.random() * 3)]);
    else {
      const r = Math.random();
      if (r < pc.medkit.chance) Entities.dropPowerup(g, e.x, e.y, 'medkit');
      else if (r < pc.medkit.chance + pc.magnet.chance) Entities.dropPowerup(g, e.x, e.y, 'magnet');
      else if (r < pc.medkit.chance + pc.magnet.chance + pc.bomb.chance) Entities.dropPowerup(g, e.x, e.y, 'bomb');
    }
    // kamikaze : explose (même s'il est abattu à distance)
    if (def.explodeRadius) {
      Entities.explode(g, e.x, e.y, def.explodeRadius, def.explodeDamage * WAVE_CONFIG.damageMult(g.wave.num) * 2.5,
        { hurtPlayer: true, playerDamage: def.explodeDamage * WAVE_CONFIG.damageMult(g.wave.num), color: '#ff8a3a' });
    }
    const big = e.def.boss || e.type === 'tank' || e.elite;
    Entities.puff(g, e.x, e.y, big ? 9 : 5, e.r * 1.1);
    Entities.star(g, e.x, e.y - e.r * 0.3, big ? 1.8 : 1.2, '#fff3b0');
    Entities.burst(g, e.x, e.y, def.color, big ? 28 : 10, big ? 260 : 190, big ? 4.5 : 3, 0.55);
    Entities.gibs(g, e, k.crit);
    if (e.elite) Entities.burst(g, e.x, e.y, '#ffd24a', 24, 260, 3, 0.7);
    g.fx.push({ t: 'decal', x: e.x, y: e.y, r: e.r * (big ? 1.6 : 1.2), color: def.color });
    Entities.killFx(g, e);
    if (e.def.boss) { g.shake = Math.max(g.shake, 24); g.hitStop = 0.28; Entities.petals(g, 90); U.haptic(120); }
    else if (big) { g.shake = Math.max(g.shake, 7); g.hitStop = Math.max(g.hitStop || 0, 0.05); }
    Sfx.play('kill');
  },

  /** Enfouisseurs : filent sous le sable vers la survivante (traînée de sable), puis surgissent */
  updateBurrowers(g, dt) {
    const list = g.burrowers; if (!list || !list.length) return;
    for (const e of list) {
      const t = Entities.targetOf(g, e), dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.x += dx / d * e.def.burrowSpeed * dt; e.y += dy / d * e.def.burrowSpeed * dt; e.age += dt;
      clampToArena(e);
      if ((e.trail = (e.trail || 0) - dt) <= 0) { e.trail = 0.07; Entities.puff(g, e.x, e.y, 1, 9, true, '#c8a070'); }
      if (d < 75 || e.age > 25) { // surgit (bref temps de réaction)
        e.burrowed = false; e.emerged = true; e.stunT = 0.4;
        World.resolve(e);
        g.enemies.push(e);
        Entities.puff(g, e.x, e.y, 10, 22, true, '#d8b480'); Entities.burst(g, e.x, e.y, '#a88050', 16, 220, 3.5, 0.5);
        g.shake = Math.max(g.shake, 4); Sfx.play('thud');
      }
    }
    U.compact(list, e => e.burrowed);
  },

  /* ---------------------------- Explosions ---------------------------- */
  /** Dégâts de zone (zombies, fûts en chaîne, joueur si opts.hurtPlayer) + effets */
  explode(g, x, y, r, dmg, opts = {}) {
    const k0 = g.stats.kills;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > r + e.r) continue;
      const k = 1 - 0.5 * Math.min(1, d / r), nx = (e.x - x) / (d || 1), ny = (e.y - y) / (d || 1);
      Entities.damageEnemy(g, e, dmg * k, false, nx * 380, ny * 380, { ignoreArmor: true, src: 'boom' });
    }
    for (const b of g.barrels) {
      if (b.fuse == null && Math.hypot(b.x - x, b.y - y) < r + b.r) b.fuse = 0.14;
    }
    const p = g.player;
    if (opts.hurtPlayer && p && Math.hypot(p.x - x, p.y - y) < r + p.r) Entities.hurtPlayer(g, opts.playerDamage || dmg * 0.3);
    // effets
    g.fx.push({ t: 'ring', x, y, r });
    g.fx.push({ t: 'decal', x, y, r: r * 0.55, color: '#2a221a' });
    for (let i = 0; i < 18 && g.particles.length < CONFIG.maxParticles; i++) {
      const a = Math.random() * TAU, s = U.rand(40, 220) * r / 90;
      g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, flame: true, color: i % 3 ? (opts.color || '#ff8a2a') : '#ffd24a',
        size: U.rand(10, 20) * Math.min(r, 120) / 90, grow: 20, life: U.rand(0.25, 0.5), max: 0.5 });
    }
    Entities.puff(g, x, y, 8, Math.min(r * 0.5, 36));
    Entities.burst(g, x, y, '#ffd24a', 16, 320, 3, 0.5);
    g.shake = Math.max(g.shake, Math.min(18, 6 + r / 10));
    g.hitStop = Math.max(g.hitStop || 0, 0.035);
    const n = g.stats.kills - k0;
    if (n >= 8) { Fun.slow(g, 0.5); Entities.addText(g, x, y - 40, `×${n} !`, '#ffb03a', 26); } // grosse explosion : ralenti
    Sfx.play('boom');
    U.haptic(30);
  },

  /* ---------------------------- Fûts explosifs ---------------------------- */
  placeBarrels(g) {
    const cfg = CONFIG.barrels, target = (cfg.perWave + 2 * (World.unlocked.size - 1)) * (g.mods && g.mods.barrels ? 3 : 1);
    let tries = 0;
    while (g.barrels.length < target && tries++ < 60) {
      const { x, y } = World.randomPoint(g.player.x, g.player.y, 150, 900, 16);
      if (g.barrels.some(b => Math.hypot(b.x - x, b.y - y) < 90)) continue;
      g.barrels.push({ x, y, r: cfg.radius, hp: cfg.hp, flash: 0, fuse: null });
    }
  },

  updateBarrels(g, dt) {
    const cfg = CONFIG.barrels;
    for (const b of g.barrels) {
      if (b.flash > 0) b.flash -= dt;
      if (b.fuse != null) {
        b.fuse -= dt;
        if (b.fuse <= 0 && !b.dead) {
          b.dead = true;
          g.stats.barrels++; Fun.track(g, 'barrel');
          Entities.explode(g, b.x, b.y, cfg.blast, cfg.damage + g.wave.num * 6,
            { hurtPlayer: true, playerDamage: cfg.playerDamage, color: '#ff6a1a' });
        }
      }
    }
    U.compact(g.barrels, b => !b.dead);
  },

  /* ---------------------------- Projectiles ---------------------------- */
  updateBullets(g, dt) {
    for (const b of g.pBullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (outOfArena(b)) b.life = 0;
      if (b.life <= 0) continue;
      for (const br of g.barrels) {
        const rr = br.r + b.r;
        if (br.fuse == null && U.dist2(b.x, b.y, br.x, br.y) < rr * rr) {
          br.hp -= b.dmg; br.flash = 0.08; b.life = 0;
          Sfx.play('clang');
          if (br.hp <= 0) br.fuse = 0.05;
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const e of g.enemies) {
        if (e.dead || b.hits.includes(e)) continue;
        const rr = e.r + b.r;
        if (U.dist2(b.x, b.y, e.x, e.y) >= rr * rr) continue;
        b.hits.push(e);
        const sp = Math.hypot(b.vx, b.vy) || 1, kb = g.player.weapon.knockback * (b.kb || 1);
        // Porte-bouclier : une balle qui arrive de face ricoche sur le bouclier
        let bd = b.dmg, blocked = false;
        if (e.def.shield) {
          const fl = Math.hypot(e.vx, e.vy) || 1;
          if ((b.vx / sp) * (e.vx / fl) + (b.vy / sp) * (e.vy / fl) < -0.35) { bd *= 0.12; blocked = true; Entities.burst(g, b.x, b.y, '#ffe08a', 5, 160, 2, 0.25); Sfx.play('clang'); }
        }
        Entities.damageEnemy(g, e, bd, b.crit && !blocked, b.vx / sp * kb * (blocked ? 0.2 : 1), b.vy / sp * kb * (blocked ? 0.2 : 1), { src: b.src || (b.pellet ? 'shotgun' : b.drone ? 'drone' : 'rifle'), noText: blocked });
        if (blocked) { b.life = 0; break; }
        if (Fun.on(g, 'explosive') && (!b.pellet || Math.random() < 0.34)) Fun.miniBoom(g, b.x, b.y, b.dmg * 0.6);
        Entities.star(g, b.x, b.y, b.crit ? 1.1 : 0.7, b.crit ? '#ffd24a' : '#ffffff');
        Entities.burst(g, b.x, b.y, e.def.color, 3, 120, 2.5, 0.25);
        if (b.pierce > 0) b.pierce--;
        else { b.life = 0; break; }
      }
    }
    U.compact(g.pBullets, b => b.life > 0);

    const p = g.player;
    for (const b of g.eBullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let splat = outOfArena(b);
      if (splat) b.life = 0;
      if (b.life > 0) {
        const rr = b.r + p.r * 0.8;
        if (!p.inside && U.dist2(b.x, b.y, p.x, p.y) < rr * rr && p.invuln <= 0 && p.rollT <= 0) { b.life = 0; splat = true; Entities.hurtPlayer(g, b.dmg); }
      }
      // crachat de bile : éclaboussure verdâtre au sol à l'impact
      // bile de la Gerbeuse : laisse une flaque acide (ou en fin de course)
      if (b.acid && (splat || b.life <= 0) && (g.acid = g.acid || []).length < 24) g.acid.push({ x: b.x, y: b.y, r: 30, t: 5, max: 5, tick: 0 });
      if (splat) {
        g.fx.push({ t: 'decal', x: b.x, y: b.y, r: b.r * 2.4, color: '#5a6a1a' });
        Entities.burst(g, b.x, b.y, '#8a9a2a', 6, 120, 3, 0.35);
        Sfx.play('splat');
      }
    }
    U.compact(g.eBullets, b => b.life > 0);
    // flaques acides : brûlent la survivante qui marche dedans
    if (g.acid) {
      for (const a of g.acid) {
        a.t -= dt; a.tick -= dt;
        if (a.tick <= 0 && !p.inside && Math.hypot(p.x - a.x, p.y - a.y) < a.r + p.r * 0.5) { a.tick = 0.45; Entities.hurtPlayer(g, 5); }
      }
      U.compact(g.acid, a => a.t > 0);
    }
  },

  /* ------------------------------ Ferraille & bonus ------------------------------ */
  dropPowerup(g, x, y, kind) {
    const a = Math.random() * TAU;
    g.pickups.push({ kind, x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 40, r: 9, z: 20, vz: 200,
      value: 0, age: 0, attract: false, spd: 0, dead: false });
  },

  collectPowerup(g, c) {
    const p = g.player, pc = CONFIG.powerups;
    if (c.kind === 'medkit') {
      const h = Math.min(pc.medkit.heal, p.maxHp - p.hp);
      p.hp += h;
      Entities.addText(g, p.x, p.y - p.r - 10, `+${Math.round(h)} PV`, '#7dff6a', 18);
      Sfx.play('heal');
    } else if (c.kind === 'magnet') {
      g.magnetT = pc.magnet.duration;
      Entities.addText(g, p.x, p.y - p.r - 10, 'AIMANT !', '#ffd24a', 18);
      Sfx.play('upgrade');
    } else if (c.kind === 'chest') {
      Fun.openChest(g, c);
    } else if (FUN.buffs[c.kind]) {
      Fun.buff(g, c.kind);
    } else if (c.kind === 'bomb') {
      g.flash = 0.35;
      Entities.addText(g, p.x, p.y - p.r - 10, 'BOUM !', '#ff8a3a', 22);
      Entities.explode(g, p.x, p.y, pc.bomb.radius, pc.bomb.damage + g.wave.num * 10, { color: '#ffd24a' });
    }
  },

  updatePickups(g, dt) {
    const p = g.player, mr2 = p.magnet * p.magnet, cfg = CONFIG.pickups;
    if (g.magnetT > 0) g.magnetT -= dt;
    for (const c of g.pickups) {
      c.age += dt;
      if (c.z > 0 || c.vz) {
        c.vz -= 700 * dt; c.z += c.vz * dt;
        if (c.z <= 0) { c.z = 0; c.vz = Math.abs(c.vz) > 60 ? -c.vz * 0.38 : 0; }
      }
      if (c.attract) { c.z = Math.max(0, (c.z || 0) - 200 * dt); c.vz = 0; }
      const isCoin = c.kind === 'coin';
      if (!c.attract) {
        const f = Math.exp(-5 * dt);
        c.vx *= f; c.vy *= f;
        c.x += c.vx * dt; c.y += c.vy * dt;
        clampToArena(c);
        if ((isCoin && (g.vacuum || g.magnetT > 0)) || U.dist2(c.x, c.y, p.x, p.y) < mr2) { c.attract = true; c.spd = cfg.magnetSpeed; }
        if (c.age > (isCoin ? cfg.life : CONFIG.powerups.life)) c.dead = true;
      } else {
        c.spd += cfg.magnetAccel * dt;
        const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
        const step = Math.min(d, c.spd * dt);
        c.x += dx / d * step; c.y += dy / d * step;
      }
      if (!c.dead && U.dist2(c.x, c.y, p.x, p.y) < (p.r + c.r) * (p.r + c.r)) {
        c.dead = true;
        if (isCoin) {
          let v = c.value * (p.scrapMult || 1) * Fun.scrapMult(g); // la série multiplie la ferraille
          g.coins += Math.floor(v) + (Math.random() < v % 1 ? 1 : 0);
          Sfx.play('coin');
        } else Entities.collectPowerup(g, c);
      }
    }
    U.compact(g.pickups, c => !c.dead);
  },

  /* ------------------------------ Effets ------------------------------ */
  burst(g, x, y, color, count, speed, size, life) {
    for (let i = 0; i < count && g.particles.length < CONFIG.maxParticles; i++) {
      const a = Math.random() * TAU, s = U.rand(0.3, 1) * speed;
      g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color,
        size: size * U.rand(0.6, 1.3), life: life * U.rand(0.6, 1.2), max: life });
    }
  },

  /** Nuages de poussière qui gonflent puis s'estompent (ground = au ras du sol) */
  puff(g, x, y, count, size, ground = false, pc = null) {
    for (let i = 0; i < count && g.particles.length < CONFIG.maxParticles; i++) {
      const a = Math.random() * TAU, s = ground ? U.rand(5, 15) : U.rand(15, 55);
      const life = U.rand(0.35, 0.6);
      g.particles.push({ x: x + Math.cos(a) * size * 0.4, y: y + Math.sin(a) * size * 0.3, ground,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - (ground ? 4 : 12), color: '#f6e6c4', pc, puff: true, seed: Math.random() * 100,
        size: size * U.rand(0.5, 0.8), grow: size * 1.4, life, max: life });
    }
  },

  /** Traînée de roulade (Garage) : sable, fumée noire ou étincelles */
  rollTrail(g, x, y, n, size) {
    const t = Cosmetics.eq('trail').trail;
    if (t === 'smoke') Entities.puff(g, x, y, n, size * 1.1, true, '#2a2624');
    else if (t === 'sparks') { Entities.burst(g, x, y, '#ffd24a', n * 3, 160, 2, 0.35); Entities.puff(g, x, y, Math.max(1, n >> 1), size * 0.7, true); }
    else Entities.puff(g, x, y, n, size, true);
  },

  /** Effet supplémentaire à la mort d'un zombie (Garage) */
  killFx(g, e) {
    const k = Cosmetics.eq('kill').kfx;
    if (k === 'sparks') { Entities.burst(g, e.x, e.y, '#ffd24a', 14, 280, 2.5, 0.45); Entities.star(g, e.x, e.y, 1.6, '#ffe08a'); }
    else if (k === 'plasma') { Entities.burst(g, e.x, e.y, '#3ad6ff', 16, 300, 3, 0.5); Entities.star(g, e.x, e.y, 1.8, '#bff4ff'); }
    else if (k === 'confetti') for (const c of ['#ff4a6a', '#4ad0ff', '#7dff6a', '#ffd24a', '#c87aff']) Entities.burst(g, e.x, e.y, c, 4, 240, 3, 0.8);
  },

  /** Morceaux qui volent et retombent au sol ; coup critique fatal : la tête saute */
  gibs(g, e, crit) {
    const big = e.def.boss || e.type === 'tank' || e.elite, n = big ? 10 : 5;
    const cols = [e.def.color, '#5a1410', '#3a2a1a', '#7a2a1a'];
    for (let i = 0; i < n && g.particles.length < CONFIG.maxParticles; i++) {
      const a = Math.random() * TAU, s = U.rand(60, 230), life = U.rand(1.8, 3);
      g.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, casing: true, gib: true, z: e.r, vz: U.rand(150, 330),
        color: cols[i % cols.length], size: U.rand(1.4, 2.4) * (big ? 1.6 : 1), life, max: life });
    }
    if (crit && !big && g.particles.length < CONFIG.maxParticles) { // tête qui saute
      const a = Math.random() * TAU;
      g.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60, casing: true, gib: true, z: e.r * 1.8, vz: 420, color: e.def.color, size: 3.4, life: 2.6, max: 2.6 });
      Entities.burst(g, e.x, e.y - e.r, '#a01a12', 12, 220, 3.5, 0.5);
      Entities.addText(g, e.x, e.y - e.r * 2.2, 'HEADSHOT', '#ffd000', 15);
    }
  },

  /** Éclat d'impact bref */
  star(g, x, y, scale, color) {
    if (g.particles.length >= CONFIG.maxParticles) return;
    g.particles.push({ x, y, vx: 0, vy: 0, star: true, color, size: 14 * scale, rot: Math.random() * TAU, life: 0.16, max: 0.16 });
  },

  /** Pluie de braises/cendres sur l'arène (fin de vague, mort du boss) */
  petals(g, n) {
    const W = CONFIG.world.width, H = CONFIG.world.height;
    const cols = ['#ff8a3a', '#ffd24a', '#ffb070', '#fff0c0'];
    for (let i = 0; i < n && g.particles.length < CONFIG.maxParticles; i++) {
      const life = U.rand(2.5, 4.5);
      g.particles.push({ x: U.rand(20, W - 20), y: U.rand(20, H - 20), vx: U.rand(-20, 20), vy: U.rand(-10, 10),
        petal: true, color: cols[i % cols.length], size: U.rand(3, 6), rot: Math.random() * TAU, spin: U.rand(-6, 6),
        seed: Math.random() * 10, life, max: life });
    }
  },

  addText(g, x, y, text, color, size) {
    if (g.texts.length > 60) g.texts.shift();
    g.texts.push({ x, y, text: String(text), color, size, life: 0.7, max: 0.7 });
  },

  updateEffects(g, dt) {
    const f = Math.exp(-4 * dt);
    for (const q of g.particles) {
      q.life -= dt;
      if (q.petal) {
        q.x += (q.vx + Math.sin(q.life * 3 + q.seed) * 30) * dt; q.y += q.vy * dt; q.rot += q.spin * dt;
        continue;
      }
      if (q.casing) { // douilles : petite parabole puis rebond
        q.vz -= 600 * dt; q.z += q.vz * dt;
        if (q.z <= 0) { q.z = 0; q.vz = Math.abs(q.vz) > 40 ? -q.vz * 0.3 : 0; q.vx *= 0.5; q.vy *= 0.5; }
        q.x += q.vx * dt; q.y += q.vy * dt;
        continue;
      }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= f; q.vy *= f;
      if (q.grow) q.size += q.grow * dt;
    }
    U.compact(g.particles, q => q.life > 0);
    for (const t of g.texts) { t.y -= 40 * dt; t.life -= dt; }
    U.compact(g.texts, t => t.life > 0);
  },
};
