'use strict';
/* =====================================================================
   GESTION DES VAGUES : composition, apparitions avec avertissement, fin.
   ===================================================================== */

class WaveManager {
  constructor(game) {
    this.g = game;
    this.num = 0;
    this.queue = [];
    this.warnings = [];
  }

  start(n) {
    const wc = WAVE_CONFIG;
    this.num = n;
    this.isBoss = n % wc.bossEvery === 0;
    this.bossType = this.isBoss ? bossFor(n) : null;
    let count = wc.count(n);
    if (this.isBoss) count = Math.round(count * wc.bossWaveCountFactor);
    if (n >= STORY.nightEvery && n % STORY.nightEvery === 0) count = Math.round(count * 1.3); // la nuit, ils sont plus nombreux
    if (this.g.parts >= OBJECTIVES.length && !this.g.victory) count = Math.round(count * 1.4); // la horde finale

    const entries = Object.entries(wc.weights(n)).filter(([, w]) => w > 0);
    this.queue = [];
    for (let i = 0; i < count; i++) this.queue.push(U.weightedPick(entries));
    if (this.isBoss) this.queue.unshift(this.bossType);

    this.warnings = [];
    this.spawnTimer = wc.startDelay;
  }

  /** Ajoute un indicateur d'apparition ; l'ennemi apparaît à la fin du compte à rebours */
  addWarning(type, x, y, time) {
    const r = ENEMY_TYPES[type].radius, o = { x, y, r };
    World.resolve(o); x = o.x; y = o.y;
    const elite = !ENEMY_TYPES[type].boss && Math.random() < WAVE_CONFIG.eliteChance(this.num) * (this.g.mods && this.g.mods.elites ? 3 : 1) + (this.g.mods && this.g.mods.elites ? 0.06 : 0);
    this.warnings.push({ type, x, y, r, t: time, max: time, elite });
  }

  /** Point d'apparition dans les zones ouvertes, hors de vue (plus près pendant les tempêtes) */
  pickSpawnPoint() {
    const g = this.g, p = g.player;
    const minD = g.storm ? 170 : 330, maxD = g.storm ? 420 : 760;
    return World.randomPoint(p.x, p.y, minD, maxD, 24);
  }

  update(dt) {
    const g = this.g, wc = WAVE_CONFIG;
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && g.enemies.length + this.warnings.length < wc.maxAlive) {
      const size = Math.min(this.queue.length, wc.groupSize(this.num));
      const base = this.pickSpawnPoint();
      for (let i = 0; i < size; i++) {
        const type = this.queue.shift();
        if (ENEMY_TYPES[type].boss) {
          this.addWarning(type, base.x, base.y, wc.bossWarningTime);
          break;
        }
        this.addWarning(type, base.x + U.rand(-45, 45), base.y + U.rand(-45, 45), wc.warningTime);
      }
      this.spawnTimer = wc.spawnInterval(this.num);
    }

    for (const w of this.warnings) {
      w.t -= dt;
      if (w.t <= 0) Entities.spawnEnemy(g, w.type, w.x, w.y, { elite: w.elite });
    }
    U.compact(this.warnings, w => w.t > 0);
  }

  get remaining() { return this.queue.length + this.warnings.length + this.g.enemies.length + (this.g.burrowers || []).length; }
  isCleared() { return !this.queue.length && !this.warnings.length && !this.g.enemies.length && !(this.g.burrowers || []).length; }
}
