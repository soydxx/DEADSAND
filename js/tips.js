'use strict';
/* =====================================================================
   CONSEILS (premiers pas) : une bulle apparaît au bon moment, une seule fois.
   Chaque conseil : quand l'afficher (when), quand il est réussi (done),
   texte PC / téléphone. Vu → Save.data.tips[id] = true.
   « Revoir les conseils » dans Options remet tout à zéro.
   ===================================================================== */
const tipKey = id => `<b>${Inventory.label(id)}</b>`;
const TIPS = [
  { id: 'move', icon: '🕹️', when: g => g.stats.time > 1, done: g => g._moved > 80,
    pc: () => `Déplacez-vous avec <b>ZQSD</b> (ou les flèches)`, touch: () => 'Posez le <b>pouce gauche</b> n\'importe où pour bouger' },
  { id: 'auto', icon: '🔫', when: g => g.enemies.length > 0, dur: 5,
    pc: () => 'Le tir est <b>automatique</b> : la survivante vise le zombie le plus proche', touch: () => 'Le tir est <b>automatique</b> : concentrez-vous sur vos déplacements' },
  { id: 'roll', icon: '🌀', when: g => g.enemies.some(e => Math.hypot(e.x - g.player.x, e.y - g.player.y) < 150), done: g => g.stats.rolls > 0,
    pc: () => `Trop près ! ${tipKey('roll')} pour une <b>roulade</b> (invincible). La jauge bleue montre vos charges`, touch: () => 'Trop près ! Touchez <b>🌀</b> pour une <b>roulade</b> (invincible)' },
  { id: 'lock', icon: '🎯', when: g => g.enemies.length >= 4 && g.stats.time > 20, done: g => !!g.lock,
    pc: () => '<b>Cliquez</b> sur un zombie ou un fût pour le <b>cibler</b> en priorité (clic droit : relâcher)', touch: () => '<b>Touchez</b> un zombie ou un fût (moitié droite) pour le <b>cibler</b> en priorité' },
  { id: 'barrel', icon: '🛢️', when: g => g.barrels.some(b => g.enemies.some(e => Math.hypot(e.x - b.x, e.y - b.y) < 70)), dur: 6,
    pc: () => 'Des zombies près d\'un <b>fût rouge</b> : ciblez-le pour le faire exploser', touch: () => 'Des zombies près d\'un <b>fût rouge</b> : touchez-le pour le faire exploser' },
  { id: 'break', icon: '⏸️', when: g => g.phase === 'break', dur: 7,
    pc: () => `Pause entre les vagues : visitez les <b>refuges</b> (porte lumineuse), puis ${tipKey('wave')} pour lancer la suite`, touch: () => 'Pause entre les vagues : visitez les <b>refuges</b> (porte lumineuse), puis <b>▶</b> pour lancer la suite' },
  { id: 'shelter', icon: '🚪', when: g => !!World.nearDoor(g.player.x, g.player.y, 90), done: g => !!g.player.inside,
    pc: () => `Un refuge ! ${tipKey('interact')} pour entrer : soins et achats, à l'abri des zombies`, touch: () => 'Un refuge ! Touchez <b>Entrer</b> : soins et achats, à l\'abri des zombies' },
  { id: 'bench', icon: '🔧', when: g => Gunsmith.near(g.player.x, g.player.y, 140) >= 0, done: g => g.state === 'gunsmith',
    pc: () => `Un <b>établi</b> ! ${tipKey('interact')} pour améliorer votre arme pièce par pièce (la partie se met en pause)`, touch: () => 'Un <b>établi</b> ! Touchez <b>Améliorer</b> pour monter de nouvelles pièces sur votre arme' },
  { id: 'objective', icon: '🎯', when: g => !!g.objective, dur: 7,
    pc: () => 'Nouvel <b>objectif</b> : suivez la flèche jaune. Chaque objectif rapporte une <b>pièce de la voiture</b>', touch: () => 'Nouvel <b>objectif</b> : suivez la flèche jaune. Chaque objectif rapporte une <b>pièce de la voiture</b>' },
  { id: 'boss', icon: '💀', when: g => g.enemies.some(e => e.def.boss), dur: 6,
    pc: () => '<b>Boss</b> en approche : gardez vos distances, utilisez grenades et fûts', touch: () => '<b>Boss</b> en approche : gardez vos distances, utilisez grenades et fûts' },
  { id: 'crate', icon: '📦', when: g => (g.crates || []).some(c => c.landed), dur: 6,
    pc: () => '<b>Ravitaillement</b> largué ! Marchez dessus pour récupérer soins et ferraille', touch: () => '<b>Ravitaillement</b> largué ! Marchez dessus pour récupérer soins et ferraille' },
];

const Tips = {
  cur: null, t: 0,
  seen(id) { return !!(Save.data.tips && Save.data.tips[id]); },
  mark(id) { Save.data.tips = Save.data.tips || {}; Save.data.tips[id] = true; Save.save(); },
  reset() { Save.data.tips = {}; Save.save(); },

  update(g, dt) {
    const p = g.player;
    if (!p) return;
    // distance parcourue (pour le conseil « se déplacer »)
    if (g._lastP) g._moved = (g._moved || 0) + Math.hypot(p.x - g._lastP.x, p.y - g._lastP.y);
    g._lastP = { x: p.x, y: p.y };
    if (this.cur) {
      const tip = this.cur;
      this.t += dt;
      const ok = tip.done ? tip.done(g) : this.t > (tip.dur || 6);
      if (ok || this.t > 14 || g.state !== 'playing') this.hide();
      return;
    }
    if (g.state !== 'playing' || p.inside) return;
    this.gap = (this.gap || 0) - dt;
    if (this.gap > 0) return;
    for (const tip of TIPS) {
      if (this.seen(tip.id)) continue;
      let ok = false;
      try { ok = tip.when(g); } catch (e) { ok = false; }
      if (ok) { this.show(tip); break; }
    }
  },
  show(tip) {
    this.cur = tip; this.t = 0; this.mark(tip.id);
    const el = document.getElementById('tip');
    el.innerHTML = `<span class="ic">${tip.icon}</span><span>${Input.mode === 'touch' ? tip.touch() : tip.pc()}</span>`;
    el.classList.remove('hidden');
  },
  hide() {
    this.cur = null; this.gap = 2.5;
    document.getElementById('tip').classList.add('hidden');
  },
};
