'use strict';
/* =====================================================================
   ENTRÉES : clavier (PC) + joystick virtuel flottant (tactile)
   Les deux sont actifs en permanence : aucun réglage nécessaire.
   e.code = position physique de la touche → WASD sur QWERTY = ZQSD sur AZERTY.
   ===================================================================== */

const Input = {
  keys: new Set(),
  mode: (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'touch' : 'keyboard',
  joy: { active: false, id: null, bx: 0, by: 0, x: 0, y: 0, used: false },
  mouse: { x: 0, y: 0, has: false },
  onKey: null,          // callback(code) pour les actions (pause, choix…)
  canStartJoystick: () => true,

  UP: ['KeyW', 'ArrowUp'],
  DOWN: ['KeyS', 'ArrowDown'],
  LEFT: ['KeyA', 'ArrowLeft'],
  RIGHT: ['KeyD', 'ArrowRight'],

  init(canvas) {
    window.addEventListener('keydown', e => {
      // capture d'une touche pour la personnaliser (écran Options)
      if (this.capture) { e.preventDefault(); if (!e.repeat) { const f = this.capture; this.capture = null; f(e); } return; }
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { if (e.key === 'Enter') e.target.blur(); return; } // saisie du pseudo
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      this.mode = 'keyboard';
      if (!e.repeat && this.onKey) this.onKey(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    // Souris : clic gauche = verrouiller une cible, clic droit = la relâcher.
    // Tactile : moitié gauche = joystick, moitié droite = toucher une cible.
    canvas.addEventListener('pointerdown', e => {
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (touch) this.mode = 'touch';
      if (!touch) { if (this.onAim) this.onAim(e.clientX, e.clientY, e.button === 2); return; }
      if (e.clientX > window.innerWidth / 2) { if (this.onAim) this.onAim(e.clientX, e.clientY, false); return; }
      if (this.joy.active || !this.canStartJoystick()) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
      const j = this.joy;
      j.active = true; j.used = true; j.id = e.pointerId;
      j.bx = j.x = e.clientX; j.by = j.y = e.clientY;
    });
    // position de la souris (visée des grenades sur PC)
    window.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.has = true;
      this.mouse.overUI = !!(e.target.closest && e.target.closest('button, #hotbar, #overlay'));
    });
    document.addEventListener('mouseleave', () => { this.mouse.has = false; });
    canvas.addEventListener('pointermove', e => {
      const j = this.joy;
      if (!j.active || e.pointerId !== j.id) return;
      j.x = e.clientX; j.y = e.clientY;
      // joystick "flottant" : la base suit le doigt s'il dépasse le rayon
      const R = CONFIG.touch.radius;
      const dx = j.x - j.bx, dy = j.y - j.by, d = Math.hypot(dx, dy);
      if (d > R) { j.bx = j.x - dx / d * R; j.by = j.y - dy / d * R; }
    });
    // molette : arme suivante
    canvas.addEventListener('wheel', e => { if (this.onWheel) { e.preventDefault(); this.onWheel(Math.sign(e.deltaY)); } }, { passive: false });
    const end = e => { if (e.pointerId === this.joy.id) this.releaseJoystick(); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
  },

  releaseJoystick() { this.joy.active = false; this.joy.id = null; },
  reset() { this.keys.clear(); this.releaseJoystick(); },

  any(list) { for (const k of list) if (this.keys.has(k)) return true; return false; },

  /* ---------------- manette (Xbox / PlayStation, API Gamepad) ----------------
     Jeu : stick gauche = bouger, A/✕ roulade, B/○ entrer, X/□ grenade, Y/△ capacité,
     LB/L1 mine, RB/R1 arme suivante, Select vague suivante, Start pause.
     Menus : A/Start = valider, B = retour, croix directionnelle = flèches. */
  padMove: { x: 0, y: 0 }, padPrev: [],
  pollPad(state) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.gp = gp;
    if (!gp) { this.padMove = { x: 0, y: 0 }; return; }
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, m = Math.hypot(ax, ay);
    this.padMove = m > 0.22 ? { x: ax / Math.max(1, m), y: ay / Math.max(1, m) } : { x: 0, y: 0 };
    if (m > 0.4) this.mode = 'pad';
    const B = typeof Inventory !== 'undefined' ? id => Inventory.bind(id).code : () => '';
    const play = state === 'playing';
    const map = play
      ? { 0: B('roll'), 1: B('interact'), 2: B('grenade'), 3: B('ability'), 4: B('mine'), 5: B('next'), 8: B('wave'), 9: 'Escape', 12: 'Digit1', 13: 'Digit2' }
      : { 0: 'Enter', 9: 'Enter', 1: 'Escape', 2: 'Tab', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 4: 'ArrowLeft', 5: 'ArrowRight' };
    gp.buttons.forEach((b, i) => {
      const down = b.pressed;
      if (down && !this.padPrev[i] && map[i]) { this.mode = 'pad'; if (this.onKey) this.onKey(map[i]); }
      this.padPrev[i] = down;
    });
  },
  padRumble(ms) {
    const a = this.gp && this.gp.vibrationActuator;
    if (a && a.playEffect) a.playEffect('dual-rumble', { duration: Math.min(ms, 400), strongMagnitude: 0.7, weakMagnitude: 0.5 }).catch(() => {});
  },

  /** Vecteur de déplacement, norme ≤ 1 */
  getMove() {
    let x = 0, y = 0;
    if (this.any(this.LEFT)) x -= 1;
    if (this.any(this.RIGHT)) x += 1;
    if (this.any(this.UP)) y -= 1;
    if (this.any(this.DOWN)) y += 1;
    if (x || y) { const d = Math.hypot(x, y); return { x: x / d, y: y / d }; }
    if (this.padMove.x || this.padMove.y) return this.padMove;

    const j = this.joy;
    if (j.active) {
      const R = CONFIG.touch.radius;
      let dx = (j.x - j.bx) / R, dy = (j.y - j.by) / R;
      let m = Math.hypot(dx, dy);
      if (m < CONFIG.touch.deadZone) return { x: 0, y: 0 };
      if (m > 1) { dx /= m; dy /= m; m = 1; }
      // remap après zone morte pour une montée progressive
      const k = (m - CONFIG.touch.deadZone) / (1 - CONFIG.touch.deadZone) / m;
      return { x: dx * k, y: dy * k };
    }
    return { x: 0, y: 0 };
  },
};
