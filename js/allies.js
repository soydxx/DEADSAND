'use strict';
/* =====================================================================
   ALLIÉS : Rex le chien (débloqué à l'Entraînement), tourelles et
   barbelés (achetés à l'Atelier des refuges).
   ===================================================================== */

const ALLIES = {
  dog: { speed: 290, follow: 50, aggro: 190, bite: 9, biteCd: 0.6, radius: 10 },
  turret: { life: 45, range: 270, cd: 0.32, dmg: 9 },
  trap: { life: 60, r: 48, slow: 0.45, dps: 6 },
};

const Allies = {
  init(g) {
    g.turrets = []; g.traps = [];
    const lvl = Save.data.perm.dog || 0;
    g.dog = lvl ? { x: g.player.x - 40, y: g.player.y + 20, r: ALLIES.dog.radius, vx: 0, vy: 0, lvl, cd: 0, target: null, biting: 0 } : null;
  },

  addTurret(g, x, y) { const o = { x, y, r: 12 }; World.resolve(o); g.turrets.push({ x: o.x, y: o.y, t: ALLIES.turret.life, cd: 0, aim: 0, fire: 0 }); },
  addTrap(g, x, y) { g.traps.push({ x, y, r: ALLIES.trap.r, t: ALLIES.trap.life }); },

  update(g, dt) {
    this.updateDog(g, dt);
    const T = ALLIES.turret;
    for (const t of g.turrets) {
      t.t -= dt; t.cd -= dt; if (t.fire > 0) t.fire -= dt;
      if (t.cd > 0) continue;
      const e = Weapons.nearest(g, t.x, t.y, T.range);
      if (!e || !World.los(t.x, t.y, e.x, e.y)) { t.cd = 0.15; continue; }
      t.cd = T.cd; t.aim = Math.atan2(e.y - t.y, e.x - t.x); t.fire = 0.06;
      const r = Weapons.roll(g, T.dmg);
      g.pBullets.push({ x: t.x, y: t.y, vx: Math.cos(t.aim) * 620, vy: Math.sin(t.aim) * 620, r: 3.4, dmg: r.dmg, crit: r.crit, pierce: 0, life: T.range / 620, hits: [], kb: 0.5 });
      Sfx.play('droneShot');
    }
    U.compact(g.turrets, t => t.t > 0);
    const P = ALLIES.trap;
    for (const tr of g.traps) {
      tr.t -= dt;
      for (const e of g.enemies) {
        if (e.dead || Math.hypot(e.x - tr.x, e.y - tr.y) > tr.r + e.r) continue;
        e.slowT = 0.2;
        Entities.damageEnemy(g, e, P.dps * dt, false, 0, 0, { noText: true, ignoreArmor: true });
      }
    }
    U.compact(g.traps, t => t.t > 0);
  },

  /** Rex suit la survivante, attaque les zombies qui s'approchent, attend devant les refuges */
  updateDog(g, dt) {
    const d = g.dog, p = g.player, D = ALLIES.dog;
    if (!d) return;
    d.cd -= dt; if (d.biting > 0) d.biting -= dt;
    let tx, ty, sp = D.speed;
    if (d.target && (d.target.dead || Math.hypot(d.target.x - p.x, d.target.y - p.y) > D.aggro * 1.6)) d.target = null;
    if (!d.target && !p.inside) {
      let best = D.aggro;
      for (const e of g.enemies) { const dd = Math.hypot(e.x - p.x, e.y - p.y); if (dd < best && e.age > 0.5) { best = dd; d.target = e; } }
    }
    if (d.target) {
      const e = d.target; tx = e.x; ty = e.y;
      const dd = Math.hypot(e.x - d.x, e.y - d.y);
      if (dd < e.r + d.r + 6) {
        sp = 0;
        if (d.cd <= 0) {
          d.cd = D.biteCd; d.biting = 0.3;
          Entities.damageEnemy(g, e, D.bite * d.lvl * Weapons.dmgMult(g), false, (e.x - d.x) / dd * 80, (e.y - d.y) / dd * 80);
          Sfx.play('bite');
        }
      }
    } else {
      const home = p.inside ? World.doorOf(p.inside) : { x: p.x - Math.cos(p.aimAngle) * D.follow, y: p.y - Math.sin(p.aimAngle) * D.follow };
      tx = home.x; ty = home.y;
      const dd = Math.hypot(tx - d.x, ty - d.y);
      sp = dd < 12 ? 0 : dd < 80 ? p.speed * 0.9 : D.speed;
    }
    const dx = tx - d.x, dy = ty - d.y, dd = Math.hypot(dx, dy) || 1;
    d.vx = dx / dd * sp; d.vy = dy / dd * sp;
    d.x += d.vx * dt; d.y += d.vy * dt;
    World.resolve(d);
    // trop loin (bloqué) : il rejoint la survivante
    if (Math.hypot(d.x - p.x, d.y - p.y) > 600) { d.x = p.x - 30; d.y = p.y + 20; World.resolve(d); }
  },
};
