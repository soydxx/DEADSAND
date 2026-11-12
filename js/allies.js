'use strict';
/* =====================================================================
   ALLIÉS : Rex le chien (débloqué par le niveau de survivante), tourelles et
   barbelés (achetés à l'Atelier des refuges).
   ===================================================================== */

const ALLIES = {
  dog: { speed: 290, follow: 50, aggro: 190, bite: 9, biteCd: 0.6, radius: 10 },
  turret: { life: 45, range: 270, cd: 0.32, dmg: 9 },
  trap: { life: 60, r: 48, slow: 0.45, dps: 6 },
};

const Allies = {
  init(g) {
    g.turrets = []; g.traps = []; g.helpers = []; g.rescues = [];
    const lvl = dogLevel(); // débloqué par le niveau de survivante (progress.js)
    g.dog = lvl ? { x: g.player.x - 40, y: g.player.y + 20, r: ALLIES.dog.radius, vx: 0, vy: 0, lvl, cd: 0, target: null, biting: 0 } : null;
  },

  addTurret(g, x, y, life) { const o = { x, y, r: 12 }; World.resolve(o); g.turrets.push({ x: o.x, y: o.y, t: life || ALLIES.turret.life, cd: 0, aim: 0, fire: 0 }); },
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
      g.pBullets.push({ x: t.x, y: t.y, vx: Math.cos(t.aim) * 620, vy: Math.sin(t.aim) * 620, r: 3.4, dmg: r.dmg, crit: r.crit, pierce: 0, life: T.range / 620, hits: [], kb: 0.5, src: 'turret' });
      Sfx.play('droneShot');
    }
    U.compact(g.turrets, t => t.t > 0);
    const P = ALLIES.trap;
    for (const tr of g.traps) {
      tr.t -= dt;
      for (const e of g.enemies) {
        if (e.dead || Math.hypot(e.x - tr.x, e.y - tr.y) > tr.r + e.r) continue;
        e.slowT = 0.2;
        Entities.damageEnemy(g, e, P.dps * dt, false, 0, 0, { noText: true, ignoreArmor: true, src: 'trap' });
      }
    }
    U.compact(g.traps, t => t.t > 0);
    this.updateHelpers(g, dt);
  },

  /** Survivants sauvés (story.js, RESCUE) : suivent la survivante et tirent sur la horde pendant un temps limité */
  updateHelpers(g, dt) {
    const p = g.player, R = RESCUE;
    for (const h of g.helpers || []) {
      h.t -= dt; h.cd -= dt; if (h.fire > 0) h.fire -= dt;
      if (h.t <= 0) { Entities.puff(g, h.x, h.y, 6, 14, true); Entities.addText(g, h.x, h.y - 36, 'Bonne chance !', '#3ad6ff', 13); continue; }
      // place autour de la survivante (de part et d'autre)
      const a = p.aimAngle + Math.PI + (h.slot % 2 ? 1.2 : -1.2), home = p.inside ? World.doorOf(p.inside) : { x: p.x + Math.cos(a) * 52, y: p.y + Math.sin(a) * 52 };
      const dx = home.x - h.x, dy = home.y - h.y, d = Math.hypot(dx, dy) || 1, sp = d < 10 ? 0 : Math.min(260, d * 4);
      h.vx = dx / d * sp; h.vy = dy / d * sp; h.x += h.vx * dt; h.y += h.vy * dt; h.r = 10; World.resolve(h);
      if (d > 600) { h.x = p.x - 30; h.y = p.y + 20; World.resolve(h); }
      if (h.cd > 0 || p.inside) continue;
      const e = Weapons.nearest(g, h.x, h.y, R.helperRange);
      if (!e || !World.los(h.x, h.y, e.x, e.y)) { h.cd = 0.15; continue; }
      h.cd = 1 / R.helperRate; h.aim = Math.atan2(e.y - h.y, e.x - h.x); h.fire = 0.08;
      const r = Weapons.roll(g, R.helperDmg * (1 + 0.05 * g.wave.num));
      g.pBullets.push({ x: h.x, y: h.y, vx: Math.cos(h.aim) * 640, vy: Math.sin(h.aim) * 640, r: 3.4, dmg: r.dmg, crit: r.crit, pierce: 0, life: R.helperRange / 640, hits: [], kb: 0.5, src: 'ally' });
      Sfx.play('droneShot');
    }
    if (g.helpers) U.compact(g.helpers, h => h.t > 0);
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
          Entities.damageEnemy(g, e, D.bite * d.lvl * Weapons.dmgMult(g), false, (e.x - d.x) / dd * 80, (e.y - d.y) / dd * 80, { src: 'dog' });
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
