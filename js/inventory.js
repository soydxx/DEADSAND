'use strict';
/* =====================================================================
   INVENTAIRE + TOUCHES
   - armes à équiper (fusil d'assaut, fusil à pompe, lance-flammes) : une seule tire
   - mines : posées avec leur touche, temps de recharge
   - objets achetés à l'Atelier des refuges (tourelle, barbelés, fûts) : posés où l'on veut
   - touches configurables dans Options (Save.data.settings.keys)
   ===================================================================== */

/** Actions configurables : [code de touche par défaut, libellé de la touche, description] */
/* Les cases de l'inventaire se déclenchent par leur position (case 1 = touche 1…),
   grenade et mine ont en plus leur raccourci direct. */
const BINDINGS = {
  slot1:    ['Digit1', '1', 'Case 1 de l\'inventaire'],
  slot2:    ['Digit2', '2', 'Case 2'],
  slot3:    ['Digit3', '3', 'Case 3'],
  slot4:    ['Digit4', '4', 'Case 4'],
  slot5:    ['Digit5', '5', 'Case 5'],
  slot6:    ['Digit6', '6', 'Case 6'],
  slot7:    ['Digit7', '7', 'Case 7'],
  slot8:    ['Digit8', '8', 'Case 8'],
  next:     ['KeyR', 'R', 'Changer d\'arme (principale / secondaire)'],
  grenade:  ['KeyG', 'G', 'Létal (grenade, molotov, mine)'],
  mine:     ['KeyF', 'F', 'Tactique (tourelle, barbelés)'],
  roll:     ['Space', 'Espace', 'Roulade'],
  interact: ['KeyE', 'E', 'Entrer / sortir d\'un refuge'],
  wave:     ['KeyN', 'N', 'Lancer la vague suivante'],
  ability:  ['KeyC', 'C', 'Capacité spéciale du personnage'],
  build:    ['KeyB', 'B', 'Fortifier (pendant la pause)'],
};

/** Objets posables (achetés à l'Atelier des refuges) */
const ITEMS = {
  turret:  { icon: '🗼', name: 'Tourelle' },
  wire:    { icon: '🕸️', name: 'Barbelés' },
  barrels: { icon: '🛢️', name: 'Fûts piégés ×3' },
};

const MAIN_WEAPONS = ['rifle', 'shotgun', 'flamer']; // familles d'armes principales (modèles 3D)

const Inventory = {
  init(g) {
    g.active = 'rifle'; // remplacé par l'arme de la classe (Loadout.equip)
    g.inv = { turret: 0, wire: 0, barrels: 0 };
  },

  /* ---------------- touches ---------------- */
  bind(id) {
    const k = Save.data.settings.keys && Save.data.settings.keys[id];
    return k || { code: BINDINGS[id][0], label: BINDINGS[id][1] };
  },
  label(id) { return this.bind(id).label; },
  actionFor(code) {
    for (const id of Object.keys(BINDINGS)) if (this.bind(id).code === code) return id;
    return null;
  },
  /** Assigne une touche ; si elle était déjà prise, les deux actions échangent leurs touches */
  setBind(id, code, label) {
    const keys = Save.data.settings.keys = Object.assign({}, Save.data.settings.keys);
    const other = this.actionFor(code), prev = this.bind(id);
    if (other && other !== id) keys[other] = { code: prev.code, label: prev.label };
    keys[id] = { code, label };
    Save.save();
  },
  resetBinds() { Save.data.settings.keys = {}; Save.save(); },
  keyLabel(e) {
    if (e.code === 'Space') return 'Espace';
    if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
    if (/^Numpad\d$/.test(e.code)) return 'Pavé ' + e.code.slice(6);
    const named = { ShiftLeft: 'Maj G', ShiftRight: 'Maj D', ControlLeft: 'Ctrl G', ControlRight: 'Ctrl D', AltLeft: 'Alt', Tab: 'Tab', Enter: 'Entrée', Backspace: 'Retour', CapsLock: 'Verr. Maj' };
    if (named[e.code]) return named[e.code];
    return e.key && e.key.length === 1 ? e.key.toUpperCase() : e.code.replace(/^Key/, '');
  },

  /* ---------------- contenu ---------------- */
  /** Cases de la barre d'inventaire : arme principale, létal, tactique, puis objets de l'Atelier */
  slots(g) {
    const out = [], L = g.loadout;
    if (!L) return out;
    const P = PRIMARIES[L.primary], pw = g.weapons[P.kind];
    const sec = g.active === 'secondary';
    out.push({ id: 'primary', kind: 'weapon', icon: P.icon, name: `${P.name} (arme principale)`, active: !sec, lvl: pw ? pw.lvl : 0, evo: pw && pw.evo });
    if (g.secondary) { const S = SECONDARIES[g.secondary], sw = g.weapons[g.secondary]; out.push({ id: 'secondary', kind: 'weapon', icon: S.icon, name: `${S.name} (arme secondaire : on court plus vite)`, active: sec, lvl: sw ? sw.lvl : 0 }); }
    const eq = (slot, wid) => {
      const w = g.weapons[wid], def = WEAPONS[wid];
      if (!w) return;
      const mines = wid === 'mines', max = mines ? Weapons.minesMax(g) : 0;
      out.push({ id: slot, kind: def.type === 'passive' ? 'item' : 'mine', icon: def.icon, name: def.name + (mines ? ` (${max} max sur le terrain, 30 s)` : def.type === 'passive' ? ' (automatique)' : ''),
        cd: mines && g.mines.length >= max ? 1 : w.t > 0 ? w.t / (w.cdMax || 1) : 0, lvl: w.lvl, evo: w.evo, extra: mines ? `${g.mines.length}/${max}` : '' });
    };
    eq('lethal', L.lethal); eq('tactical', L.tactical);
    for (const [id, it] of Object.entries(ITEMS)) if (g.inv[id] > 0) out.push({ id, kind: 'item', icon: it.icon, name: it.name, count: g.inv[id] });
    return out;
  },

  /** Touche d'une case selon sa position dans la barre */
  slotLabel(g, id) {
    const i = this.slots(g).findIndex(s => s.id === id);
    return i >= 0 && i < 8 ? this.label('slot' + (i + 1)) : '';
  },

  /** Utilise une case : sortir l'arme principale / secondaire, létal, tactique ou objet à poser */
  use(g, id) {
    if (g.state !== 'playing' || !g.player || g.player.inside) return false;
    if (/^slot\d$/.test(id)) { const s = this.slots(g)[Number(id.slice(4)) - 1]; return s ? this.use(g, s.id) : false; }
    if (id === 'primary' || id === 'secondary') return Loadout.swap(g, id);
    if (id === 'lethal' || id === 'grenade') return Loadout.useLethal(g);
    if (id === 'tactical' || id === 'mine') return Loadout.useTactical(g);
    if (ITEMS[id]) return this.place(g, id);
    return false;
  },
  equip() { return false; },
  /** Touche « Changer d'arme » (R, molette, RB) : principale ⇄ secondaire */
  next(g) { return Loadout.swap(g); },
  /** Pose un objet devant la survivante */
  place(g, id) {
    if (!(g.inv[id] > 0)) return false;
    const p = g.player, a = p.aimAngle, x = p.x + Math.cos(a) * 46, y = p.y + Math.sin(a) * 46;
    if (World.solidAt(x, y)) { Entities.addText(g, p.x, p.y - 30, 'Pas de place ici', '#ff6a5a', 13); return false; }
    if (id === 'turret') Allies.addTurret(g, x, y);
    else if (id === 'wire') Allies.addTrap(g, x, y);
    else if (id === 'barrels') {
      const nx = -Math.sin(a), ny = Math.cos(a);
      for (let i = -1; i <= 1; i++) {
        const o = { x: x + nx * i * 30, y: y + ny * i * 30, r: 12 }; World.resolve(o);
        g.barrels.push({ x: o.x, y: o.y, r: 12, hp: CONFIG.barrels.hp, flash: 0, fuse: null });
      }
    }
    g.inv[id]--;
    Entities.puff(g, x, y, 4, 10, true);
    Sfx.play('mine');
    return true;
  },
  /** Ajoute un objet acheté à l'Atelier */
  add(g, id, n = 1) {
    g.inv[id] = (g.inv[id] || 0) + n;
    UI.toast(`${ITEMS[id].icon} ${ITEMS[id].name} dans l'inventaire`, `${this.how(g, id)} pour le poser devant vous`);
  },
  how(g, id) { return Input.mode === 'touch' ? 'Touchez sa case' : `Touche ${this.slotLabel(g, id)} ou cliquez sur sa case`; },
  announce() {},
};
