'use strict';
/* =====================================================================
   FORTIFICATIONS : pendant la pause entre deux vagues, on pose des barricades,
   des murs de sacs de sable et des pieux (ferraille de la partie).
   - Les zombies ne les contournent pas : ils tapent dedans jusqu'à les casser.
   - La survivante les enjambe (ralentie), les balles passent par-dessus.
   - Les pieux ne bloquent pas : ils blessent et ralentissent ceux qui passent, et s'usent.
   Commandes : B (ou bouton « Fortifier ») ouvre le mode construction ; 1-2-3 choisissent ;
   PC : clic pour poser à la souris, clic droit sur un élément pour le démonter (50 % remboursés) ;
   mobile : l'élément se pose devant la survivante avec le bouton « Poser ».
   Données : g.forts = [{ kind, x, y, hw, hd, hp, max, flash }] (rectangles alignés sur les axes)
   ===================================================================== */
const FORTS = {
  wood: { icon: '🪵', name: 'Barricade', desc: 'Bloque la horde un moment', cost: 40, hp: 260, w: 64, d: 14, solid: true },
  sand: { icon: '🧱', name: 'Sacs de sable', desc: 'Très solide', cost: 90, hp: 650, w: 64, d: 22, solid: true },
  spikes: { icon: '📍', name: 'Pieux', desc: 'Blessent et ralentissent ceux qui passent', cost: 50, hp: 40, w: 56, d: 30, solid: false, dps: 12 },
};
const FORT_MAX = 14;
const FORT_GRID = 16; // aimantation de la position

const Forts = {
  init(g) { g.forts = []; g.build = { on: false, kind: 'wood', ghost: null }; },
  /** Le mode construction n'est possible que pendant la pause, dehors */
  canBuild(g) { return g.state === 'playing' && g.phase === 'break' && !g.tut && g.player && !g.player.inside; },
  toggle(g, on) {
    const B = g.build; if (!B) return;
    B.on = on == null ? !B.on : on;
    if (B.on && !this.canBuild(g)) { B.on = false; Entities.addText(g, g.player.x, g.player.y - 40, 'Fortifications : pendant la pause', '#ffb070', 14); return; }
    g.lock = null;
    Sfx.play('click');
  },
  select(g, kind) { if (FORTS[kind]) { g.build.kind = kind; Sfx.play('click'); } },
  cost(g, kind) { return Gunsmith.price(g, FORTS[kind].cost); },

  /** Rectangle proposé : à la souris (PC) ou devant la survivante (tactile / manette) ; orienté face à la survivante */
  ghost(g) {
    const p = g.player, F = FORTS[g.build.kind];
    let x, y;
    const cur = Input.mode === 'keyboard' && typeof Render !== 'undefined' && Render.cursorWorld && !Input.mouse.overUI ? Render.cursorWorld() : null;
    if (cur && Math.hypot(cur.x - p.x, cur.y - p.y) < 420) { x = cur.x; y = cur.y; }
    else { x = p.x + Math.cos(p.aimAngle) * 64; y = p.y + Math.sin(p.aimAngle) * 64; }
    x = Math.round(x / FORT_GRID) * FORT_GRID; y = Math.round(y / FORT_GRID) * FORT_GRID;
    const horiz = Math.abs(y - p.y) >= Math.abs(x - p.x); // mur perpendiculaire à la direction survivante → élément
    const hw = (horiz ? F.w : F.d) / 2, hd = (horiz ? F.d : F.w) / 2;
    const gh = { x, y, hw, hd, kind: g.build.kind };
    gh.ok = this.valid(g, gh);
    return gh;
  },
  /** Emplacement libre ? (pas dans un obstacle, une autre fortification, devant une porte, un établi ou l'objectif) */
  valid(g, r) {
    const x0 = r.x - r.hw, x1 = r.x + r.hw, y0 = r.y - r.hd, y1 = r.y + r.hd, m = MAP.wallT;
    if (x0 < m || y0 < m || x1 > MAP.W - m || y1 > MAP.H - m) return false;
    const z = World.zoneAt(r.x, r.y); if (!z || !World.isUnlocked(z.id)) return false;
    for (const o of World.obstacles) if (x1 > o.x0 && x0 < o.x1 && y1 > o.y0 && y0 < o.y1) return false;
    for (const f of g.forts) if (x1 > f.x - f.hw && x0 < f.x + f.hw && y1 > f.y - f.hd && y0 < f.y + f.hd) return false;
    const near = (q, d) => q && Math.max(Math.abs(q.x - r.x) - r.hw, 0) ** 2 + Math.max(Math.abs(q.y - r.y) - r.hd, 0) ** 2 < d * d;
    for (const b of MAP.buildings) if (b.doorPos && near(b.doorPos, 46)) return false;
    for (const b of BENCHES) if (near(b, 50)) return false;
    if (g.objective && near(Story.objPoint(g), 70)) return false;
    return true;
  },
  /** Pose l'élément choisi (ghost) */
  place(g) {
    if (!g.build.on || !this.canBuild(g)) return false;
    const gh = this.ghost(g), F = FORTS[gh.kind], cost = this.cost(g, gh.kind), p = g.player;
    if (g.forts.length >= FORT_MAX) { Entities.addText(g, p.x, p.y - 40, `${FORT_MAX} fortifications au maximum`, '#ff6a5a', 14); Sfx.play('clang'); return false; }
    if (!gh.ok) { Entities.addText(g, gh.x, gh.y - 30, 'Pas de place ici', '#ff6a5a', 14); Sfx.play('clang'); return false; }
    if (g.coins < cost) { Entities.addText(g, p.x, p.y - 40, `Il faut ${cost} 🔩`, '#ff6a5a', 14); Sfx.play('clang'); return false; }
    g.coins -= cost;
    const hp = Math.round(F.hp * (1 + 0.06 * g.wave.num)); // plus solides au fil des vagues (la horde frappe plus fort)
    g.forts.push({ kind: gh.kind, x: gh.x, y: gh.y, hw: gh.hw, hd: gh.hd, hp, max: hp, flash: 0, paid: cost });
    g.stats.forts = (g.stats.forts || 0) + 1;
    Entities.puff(g, gh.x, gh.y, 5, 14, true); Sfx.play('mine');
    return true;
  },
  /** Démonte l'élément sous la souris (50 % remboursés) */
  removeAt(g, x, y) {
    const i = g.forts.findIndex(f => Math.abs(f.x - x) < f.hw + 6 && Math.abs(f.y - y) < f.hd + 6);
    if (i < 0) return false;
    const f = g.forts[i], back = Math.round(f.paid * 0.5 * f.hp / f.max);
    g.forts.splice(i, 1); g.coins += back;
    Entities.addText(g, f.x, f.y - 30, `Démonté · +${back} 🔩`, '#ffc21a', 14); Entities.puff(g, f.x, f.y, 4, 12, true); Sfx.play('reload');
    return true;
  },

  /** Collision d'un cercle {x,y,r} avec les fortifications solides : renvoie l'élément percuté (ou null) */
  collide(g, o) {
    let hit = null;
    for (const f of g.forts) {
      if (!FORTS[f.kind].solid) continue;
      const px = U.clamp(o.x, f.x - f.hw, f.x + f.hw), py = U.clamp(o.y, f.y - f.hd, f.y + f.hd);
      const dx = o.x - px, dy = o.y - py, d2 = dx * dx + dy * dy;
      if (d2 >= o.r * o.r) continue;
      if (d2 > 0) { const d = Math.sqrt(d2), k = (o.r - d) / d; o.x += dx * k; o.y += dy * k; }
      else { // centre à l'intérieur : sortie par le côté le plus proche
        const l = o.x - (f.x - f.hw), rr = f.x + f.hw - o.x, t = o.y - (f.y - f.hd), b = f.y + f.hd - o.y, mn = Math.min(l, rr, t, b);
        if (mn === l) o.x = f.x - f.hw - o.r; else if (mn === rr) o.x = f.x + f.hw + o.r; else if (mn === t) o.y = f.y - f.hd - o.r; else o.y = f.y + f.hd + o.r;
      }
      hit = f;
    }
    return hit;
  },
  /** La survivante enjambe les barricades : ralentie quand elle est dessus */
  slowOf(g, p) {
    for (const f of g.forts || []) if (FORTS[f.kind].solid && Math.abs(p.x - f.x) < f.hw + p.r * 0.5 && Math.abs(p.y - f.y) < f.hd + p.r * 0.5) return 0.55;
    return 1;
  },

  /** Zombies contre les fortifications (appelé après leur déplacement) */
  updateEnemy(g, e, dt) {
    if (!g.forts || !g.forts.length || e.def.climb) return;
    const f = this.collide(g, e);
    if (f) { f.hp -= e.damage * (e.def.boss ? 3 : 1) * 0.9 * dt; f.flash = 0.08; e.bashing = 0.2; if (Math.random() < dt * 2) Sfx.play('thud'); }
    for (const s of g.forts) { // pieux
      if (FORTS[s.kind].solid || Math.abs(e.x - s.x) > s.hw + e.r || Math.abs(e.y - s.y) > s.hd + e.r) continue;
      e.slowT = 0.25; s.hp -= dt * (e.def.boss ? 4 : 1); s.flash = 0.05;
      Entities.damageEnemy(g, e, FORTS.spikes.dps * (1 + 0.08 * g.wave.num) * dt, false, 0, 0, { noText: true, ignoreArmor: true, src: 'trap' });
    }
  },
  update(g, dt) {
    const B = g.build;
    if (B && B.on && !this.canBuild(g)) B.on = false; // la vague commence, ou on entre dans un refuge
    if (B) B.ghost = B.on ? this.ghost(g) : null;
    for (const f of g.forts) {
      if (f.flash > 0) f.flash -= dt;
      if (f.hp <= 0 && !f.dead) {
        f.dead = true;
        Entities.puff(g, f.x, f.y, 10, 22, true); Entities.burst(g, f.x, f.y, f.kind === 'sand' ? '#c8a070' : '#8a5a2a', 18, 220, 3.5, 0.6);
        Entities.addText(g, f.x, f.y - 30, `${FORTS[f.kind].name} détruit${f.kind === 'wood' ? 'e' : 's'} !`, '#ff8a5a', 14);
        g.shake = Math.max(g.shake, 5); Sfx.play('boom');
      }
    }
    U.compact(g.forts, f => !f.dead);
  },
};
