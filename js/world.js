'use strict';
/* =====================================================================
   MONDE : carte en zones qui se débloquent, bâtiments, obstacles,
   collisions et navigation des zombies (champ de flux sur une grille).

   Repère : x vers la droite, y vers le bas (unités monde).
   ┌────────────┬────────────┬────────────┐
   │            │  Centre    │  Hôpital & │
   │  Quartier  │ commercial │    base    │
   │ abandonné  ├────────────┤ militaire  │
   │            │  Parking   │            │
   └────────────┴────────────┴────────────┘
   On démarre sur le parking ; les autres zones s'ouvrent aux vagues 5, 10, 15.
   ===================================================================== */

const MAP_DESERT = {
  id: 'desert', name: 'Supermarché du désert', icon: '🏜️',
  W: 2400, H: 1600, cell: 25, wallT: 26,

  zones: [
    { id: 'parking', name: 'Parking du supermarché', x0: 800, y0: 800, x1: 1600, y1: 1600, unlock: 1, ground: 'parking' },
    { id: 'mall', name: 'Centre commercial', x0: 800, y0: 0, x1: 1600, y1: 800, unlock: 5, ground: 'plaza' },
    { id: 'slums', name: 'Quartier abandonné', x0: 0, y0: 0, x1: 800, y1: 1600, unlock: 10, ground: 'ruins' },
    { id: 'base', name: 'Hôpital & base militaire', x0: 1600, y0: 0, x1: 2400, y1: 1600, unlock: 15, ground: 'base' },
  ],

  // Séparations entre zones : segment + passage (gate) qui saute quand la zone s'ouvre
  separators: [
    { x0: 800, y0: 800, x1: 1600, y1: 800, gate: [1110, 1290], zone: 'mall' },
    { x0: 800, y0: 800, x1: 800, y1: 1600, gate: [1110, 1290], zone: 'slums' },
    { x0: 800, y0: 0, x1: 800, y1: 800, gate: [310, 490], zone: 'slums' },
    { x0: 1600, y0: 800, x1: 1600, y1: 1600, gate: [1110, 1290], zone: 'base' },
    { x0: 1600, y0: 0, x1: 1600, y1: 800, gate: [310, 490], zone: 'base' },
  ],

  // Bâtiments : rectangle au sol + modèle 3D + porte (pour les refuges)
  buildings: [
    { id: 'pharmacy', model: 'bld_c', x0: 850, y0: 826, x1: 1070, y1: 930, h: 95, door: 'S', zone: 'parking' },
    { id: 'mall', model: 'bld_big', x0: 1010, y0: 70, x1: 1390, y1: 330, h: 190, door: 'S', zone: 'mall' },
    { id: 'market1', model: 'bld_business', x0: 850, y0: 500, x1: 990, y1: 600, h: 70, zone: 'mall' },
    { id: 'market2', model: 'bld_business', x0: 1410, y0: 500, x1: 1550, y1: 600, h: 70, zone: 'mall', rot: Math.PI },
    { id: 'workshop', model: 'bld_a', x0: 150, y0: 200, x1: 470, y1: 390, h: 150, door: 'S', zone: 'slums' },
    { id: 'tower', model: 'bld_b', x0: 560, y0: 880, x1: 680, y1: 1010, h: 190, zone: 'slums' },
    { id: 'house1', model: 'barracks', x0: 90, y0: 640, x1: 230, y1: 770, h: 85, zone: 'slums' },
    { id: 'hospital', model: 'bld_c', x0: 1830, y0: 120, x1: 2190, y1: 330, h: 120, door: 'S', zone: 'base', tint: '#f2f2f2' },
    { id: 'barracks1', model: 'barracks', x0: 1760, y0: 1060, x1: 1900, y1: 1180, h: 80, zone: 'base' },
    { id: 'barracks2', model: 'barracks', x0: 2000, y0: 1060, x1: 2140, y1: 1180, h: 80, zone: 'base' },
  ],

  // Petits obstacles (épaves, conteneurs…) : bloquent comme les bâtiments
  props: [
    { model: 'police', x: 1000, y: 1120, w: 44, d: 92, rot: 0.4 },
    { model: 'car', x: 1430, y: 1050, w: 40, d: 82, rot: -1.2 },
    { model: 'suv_wreck', x: 1480, y: 1450, w: 46, d: 92, rot: 2.6 },
    { model: 'container_red', x: 930, y: 1460, w: 150, d: 66, rot: 0 },
    { model: 'container_green', x: 1080, y: 700, w: 150, d: 66, rot: 0 },
    { model: 'container_red', x: 1320, y: 700, w: 150, d: 66, rot: 0 },
    { model: 'car', x: 400, y: 560, w: 40, d: 82, rot: 1.7 },
    { model: 'container_green', x: 300, y: 1480, w: 150, d: 66, rot: Math.PI / 2 },
    { model: 'gastank', x: 230, y: 1150, w: 46, d: 46, rot: 0 },
    { model: 'gastank', x: 400, y: 1150, w: 46, d: 46, rot: 0 },
    { model: 'container_red', x: 2250, y: 700, w: 150, d: 66, rot: Math.PI / 2 },
    { model: 'container_green', x: 2100, y: 1400, w: 150, d: 66, rot: 0 },
    { model: 'container_red', x: 1850, y: 1400, w: 150, d: 66, rot: 0 },
    { model: 'police', x: 1950, y: 560, w: 44, d: 92, rot: -0.3 },
    // véhicules construits par code (préfixe p_) : bloquent aussi les déplacements
    { model: 'p_bus', x: 1460, y: 1240, w: 50, d: 150, rot: 0.35 },
    { model: 'p_ambulance', x: 1140, y: 905, w: 44, d: 96, rot: Math.PI / 2 },
    { model: 'p_heli', x: 920, y: 250, w: 70, d: 150, rot: 0.2, burning: true },
    { model: 'p_semi', x: 1500, y: 220, w: 46, d: 190, rot: 0 },
    { model: 'p_tanker', x: 600, y: 1440, w: 48, d: 180, rot: 0.3 },
    { model: 'p_bus', x: 150, y: 1000, w: 50, d: 150, rot: 0, burnt: true },
    { model: 'p_heli', x: 2270, y: 420, w: 70, d: 150, rot: -0.3, medic: true },
    { model: 'p_army', x: 1760, y: 820, w: 48, d: 150, rot: 0 },
    { model: 'p_army', x: 2060, y: 840, w: 48, d: 150, rot: 0.2 },
    { model: 'p_ambulance', x: 1780, y: 380, w: 44, d: 96, rot: Math.PI / 2 },
    { model: 'p_tank', x: 2220, y: 1230, w: 60, d: 120, rot: 0.6 },
  ],

  // Détails sans collision : la vie (et la fin du monde) sur la carte
  decor: [
    // parking : caddies, cônes, sacs poubelle, barrage de police, panneau d'évacuation
    { kind: 'carts', x: 1330, y: 960 }, { kind: 'carts', x: 880, y: 1380 },
    { kind: 'cones', x: 1200, y: 1560, rot: 0 }, { kind: 'cones', x: 1035, y: 1170, rot: 0.4 },
    { kind: 'bags', x: 1090, y: 960 }, { kind: 'bags', x: 1560, y: 1560 },
    { kind: 'sign', x: 1290, y: 1545, text: 'ÉVACUATION', sub: '→ BASE MILITAIRE' },
    { kind: 'bodybags', x: 1020, y: 1020 },
    // centre commercial : étals renversés, caisses, graffiti
    { kind: 'crates', x: 960, y: 430 }, { kind: 'crates', x: 1460, y: 650 },
    { kind: 'carts', x: 1300, y: 420 }, { kind: 'bags', x: 960, y: 690 },
    { kind: 'graffiti', x: 1200, y: 600, text: 'ILS SONT PARTOUT', rot: 0.08 },
    // quartier : campement de survivants, feu de camp, linge, matelas
    { kind: 'tent', x: 560, y: 230, color: '#4a6a3a', rot: 0.3 }, { kind: 'tent', x: 660, y: 250, color: '#8a5a2a', rot: -0.4 },
    { kind: 'campfire', x: 610, y: 320 }, { kind: 'barrelfire', x: 520, y: 330 },
    { kind: 'mattress', x: 700, y: 330, rot: 0.5 }, { kind: 'crates', x: 470, y: 470 },
    { kind: 'tires', x: 120, y: 1300 }, { kind: 'tires', x: 700, y: 760 },
    { kind: 'graffiti', x: 330, y: 830, text: 'PLUS DE MUNITIONS', rot: 0.2 },
    // base : tentes médicales, sacs de sable, mirador, caisses militaires, feux de fûts
    { kind: 'tent', x: 2080, y: 560, color: '#e8e4dc', medic: true, rot: 0 }, { kind: 'tent', x: 2170, y: 610, color: '#e8e4dc', medic: true, rot: 0.2 },
    { kind: 'watchtower', x: 2330, y: 1080 }, { kind: 'watchtower', x: 1680, y: 80 },
    { kind: 'crates', x: 1920, y: 960, military: true }, { kind: 'crates', x: 2300, y: 860, military: true },
    { kind: 'barrelfire', x: 1960, y: 1290 }, { kind: 'barrelfire', x: 2330, y: 560 },
    { kind: 'bodybags', x: 1900, y: 470 },
    { kind: 'graffiti', x: 1950, y: 1500, text: 'ZONE QUARANTAINE', rot: 0 },
  ],
  // Points d'où montent les corbeaux (tournent en cercle)
  crows: [{ x: 1020, y: 1030 }, { x: 920, y: 250 }, { x: 1900, y: 470 }, { x: 150, y: 1000 }],

  // La voiture de la survivante (en panne au départ)
  car: { x: 1200, y: 1330, w: 46, d: 96 },
  gasStation: { x: 315, y: 1225 },   // zone à tenir (objectif) sous l'auvent
  startPos: { x: 1250, y: 1330 },
  generator: { x: 1200, y: 470 },    // objectif « Défendre le générateur »
  // établis (gunsmith.js) : un par zone
  benches: [
    { x: 875, y: 1250, zone: 'parking', rot: Math.PI / 2 },
    { x: 1110, y: 368, zone: 'mall', rot: 0 },
    { x: 610, y: 640, zone: 'slums', rot: 0 },
    { x: 1900, y: 700, zone: 'base', rot: 0 },
  ],
  lamps: [[880, 1060], [1520, 1060], [880, 1540], [1520, 1540], [880, 380], [1520, 380], [1700, 700], [2300, 300]],
  sandbags: [[1700, 1350], [1720, 1380], [2250, 1000], [2270, 1030], [1650, 300], [1670, 330]],
};

/* Deuxième carte (débloquée par une évasion) : une autoroute ensablée, un péage, un village
   et une raffinerie. Mêmes zones, mêmes passages : seuls le décor et les obstacles changent. */
const MAP_HIGHWAY = {
  id: 'highway', name: 'Autoroute ensablée', icon: '🛣️',
  W: 2400, H: 1600, cell: 25, wallT: 26,
  zones: [
    { id: 'parking', name: 'Aire d\'autoroute', x0: 800, y0: 800, x1: 1600, y1: 1600, unlock: 1, ground: 'ruins' },
    { id: 'mall', name: 'Péage', x0: 800, y0: 0, x1: 1600, y1: 800, unlock: 5, ground: 'parking' },
    { id: 'slums', name: 'Village fantôme', x0: 0, y0: 0, x1: 800, y1: 1600, unlock: 10, ground: 'plaza' },
    { id: 'base', name: 'Raffinerie', x0: 1600, y0: 0, x1: 2400, y1: 1600, unlock: 15, ground: 'base' },
  ],
  separators: MAP_DESERT.separators,
  buildings: [
    { id: 'pharmacy', model: 'bld_c', x0: 1380, y0: 845, x1: 1560, y1: 950, h: 90, door: 'S', zone: 'parking' },
    { id: 'mall', model: 'bld_big', x0: 1010, y0: 60, x1: 1390, y1: 270, h: 170, zone: 'mall' },
    { id: 'market1', model: 'bld_business', x0: 850, y0: 540, x1: 990, y1: 640, h: 70, zone: 'mall' },
    { id: 'market2', model: 'bld_business', x0: 1410, y0: 540, x1: 1550, y1: 640, h: 70, zone: 'mall', rot: Math.PI },
    { id: 'workshop', model: 'bld_a', x0: 120, y0: 150, x1: 440, y1: 340, h: 140, door: 'S', zone: 'slums' },
    { id: 'tower', model: 'bld_b', x0: 530, y0: 860, x1: 650, y1: 990, h: 170, zone: 'slums' },
    { id: 'house1', model: 'barracks', x0: 80, y0: 620, x1: 220, y1: 750, h: 80, zone: 'slums' },
    { id: 'hospital', model: 'bld_c', x0: 1830, y0: 120, x1: 2190, y1: 330, h: 120, door: 'S', zone: 'base', tint: '#f2f2f2' },
    { id: 'barracks1', model: 'barracks', x0: 1760, y0: 1080, x1: 1900, y1: 1200, h: 80, zone: 'base' },
    { id: 'barracks2', model: 'barracks', x0: 2020, y0: 1080, x1: 2160, y1: 1200, h: 80, zone: 'base' },
  ],
  props: [
    // bouchon sur l'aire d'autoroute
    { model: 'p_semi', x: 980, y: 1050, w: 46, d: 190, rot: Math.PI / 2 },
    { model: 'car', x: 1350, y: 1150, w: 40, d: 82, rot: 0.3 },
    { model: 'police', x: 1050, y: 1300, w: 44, d: 92, rot: 2.9 },
    { model: 'p_bus', x: 1470, y: 1380, w: 50, d: 150, rot: 0.1 },
    { model: 'suv_wreck', x: 920, y: 1450, w: 46, d: 92, rot: 1.9 },
    // péage
    { model: 'p_semi', x: 1480, y: 160, w: 46, d: 190, rot: 0 },
    { model: 'container_green', x: 960, y: 700, w: 150, d: 66, rot: 0 },
    { model: 'container_red', x: 1440, y: 700, w: 150, d: 66, rot: 0 },
    { model: 'car', x: 900, y: 120, w: 40, d: 82, rot: 0.4 },
    // village
    { model: 'p_tanker', x: 600, y: 1450, w: 48, d: 180, rot: 0.3 },
    { model: 'gastank', x: 180, y: 1000, w: 46, d: 46, rot: 0 },
    { model: 'gastank', x: 260, y: 1000, w: 46, d: 46, rot: 0 },
    { model: 'p_bus', x: 650, y: 600, w: 50, d: 150, rot: 0, burnt: true },
    { model: 'car', x: 420, y: 560, w: 40, d: 82, rot: 1.7 },
    // raffinerie : cuves, citerne, convoi militaire
    { model: 'gastank', x: 1780, y: 620, w: 46, d: 46, rot: 0 }, { model: 'gastank', x: 1860, y: 620, w: 46, d: 46, rot: 0 },
    { model: 'gastank', x: 1780, y: 700, w: 46, d: 46, rot: 0 }, { model: 'gastank', x: 1860, y: 700, w: 46, d: 46, rot: 0 },
    { model: 'gastank', x: 2200, y: 650, w: 46, d: 46, rot: 0 }, { model: 'gastank', x: 2280, y: 650, w: 46, d: 46, rot: 0 },
    { model: 'p_tanker', x: 2050, y: 820, w: 48, d: 180, rot: Math.PI / 2 },
    { model: 'p_army', x: 1720, y: 1420, w: 48, d: 150, rot: 0 },
    { model: 'p_tank', x: 2250, y: 1400, w: 60, d: 120, rot: 0.6 },
    { model: 'p_heli', x: 2270, y: 420, w: 70, d: 150, rot: -0.3, medic: true },
    { model: 'container_red', x: 2250, y: 1000, w: 150, d: 66, rot: Math.PI / 2 },
  ],
  decor: [
    { kind: 'cones', x: 1300, y: 1000, rot: 0.2 }, { kind: 'cones', x: 1200, y: 760, rot: 0 }, { kind: 'tires', x: 1150, y: 1000 },
    { kind: 'bags', x: 900, y: 1560 }, { kind: 'bodybags', x: 1300, y: 1250 },
    { kind: 'sign', x: 1290, y: 1545, text: 'ÉVACUATION', sub: '→ RAFFINERIE' },
    { kind: 'crates', x: 1300, y: 380 }, { kind: 'carts', x: 900, y: 420 },
    { kind: 'graffiti', x: 1200, y: 610, text: 'PÉAGE FERMÉ', rot: 0.05 },
    { kind: 'tent', x: 520, y: 230, color: '#5a5a3a', rot: 0.3 }, { kind: 'campfire', x: 600, y: 300 }, { kind: 'barrelfire', x: 480, y: 470 },
    { kind: 'tires', x: 120, y: 1300 }, { kind: 'mattress', x: 700, y: 760, rot: 0.4 },
    { kind: 'graffiti', x: 330, y: 830, text: 'ILS VIENNENT DE L\'AUTOROUTE', rot: 0.15 },
    { kind: 'watchtower', x: 2330, y: 1080 }, { kind: 'watchtower', x: 1680, y: 80 },
    { kind: 'crates', x: 1950, y: 960, military: true }, { kind: 'barrelfire', x: 2000, y: 1300 }, { kind: 'barrelfire', x: 1700, y: 900 },
    { kind: 'graffiti', x: 2000, y: 980, text: 'DANGER · GAZ', rot: 0 },
  ],
  crows: [{ x: 980, y: 1050 }, { x: 600, y: 1450 }, { x: 2050, y: 820 }],
  car: { x: 1200, y: 1470, w: 46, d: 96 },
  gasStation: { x: 330, y: 1250 },
  startPos: { x: 1250, y: 1470 },
  generator: { x: 1200, y: 470 },
  benches: [
    { x: 950, y: 880, zone: 'parking', rot: 0 },
    { x: 1110, y: 305, zone: 'mall', rot: 0 },
    { x: 560, y: 420, zone: 'slums', rot: 0 },
    { x: 2050, y: 560, zone: 'base', rot: 0 },
  ],
  lamps: [[880, 1150], [1520, 1100], [880, 420], [1520, 420], [1700, 900], [2300, 300], [600, 1100], [300, 700]],
  sandbags: [[1700, 1300], [1720, 1330], [2250, 900], [1650, 300], [1680, 330], [2300, 1250]],
};
/* Troisième carte (débloquée en atteignant la vague 15) : un centre-ville où il fait toujours nuit
   (night: true). Lampadaires partout, tours, gare, rues encombrées de voitures abandonnées. */
const MAP_CITY = {
  id: 'city', name: 'Centre-ville de nuit', icon: '🌃', night: true,
  W: 2400, H: 1600, cell: 25, wallT: 26,
  zones: [
    { id: 'parking', name: 'Place de la mairie', x0: 800, y0: 800, x1: 1600, y1: 1600, unlock: 1, ground: 'plaza' },
    { id: 'mall', name: 'Gare centrale', x0: 800, y0: 0, x1: 1600, y1: 800, unlock: 5, ground: 'parking' },
    { id: 'slums', name: 'Quartier des bars', x0: 0, y0: 0, x1: 800, y1: 1600, unlock: 10, ground: 'ruins' },
    { id: 'base', name: 'Commissariat & hôpital', x0: 1600, y0: 0, x1: 2400, y1: 1600, unlock: 15, ground: 'base' },
  ],
  separators: MAP_DESERT.separators,
  buildings: [
    { id: 'pharmacy', model: 'bld_c', x0: 850, y0: 826, x1: 1070, y1: 930, h: 100, door: 'S', zone: 'parking' },
    { id: 'cityhall', model: 'bld_b', x0: 1420, y0: 830, x1: 1560, y1: 960, h: 230, zone: 'parking' },
    { id: 'mall', model: 'bld_big', x0: 1010, y0: 70, x1: 1390, y1: 330, h: 210, zone: 'mall' },
    { id: 'market1', model: 'bld_business', x0: 850, y0: 480, x1: 990, y1: 600, h: 90, zone: 'mall' },
    { id: 'market2', model: 'bld_business', x0: 1410, y0: 480, x1: 1550, y1: 600, h: 90, zone: 'mall', rot: Math.PI },
    { id: 'workshop', model: 'bld_a', x0: 150, y0: 200, x1: 470, y1: 390, h: 160, door: 'S', zone: 'slums' },
    { id: 'tower', model: 'bld_b', x0: 560, y0: 880, x1: 680, y1: 1010, h: 240, zone: 'slums' },
    { id: 'bar', model: 'bld_business', x0: 520, y0: 600, x1: 680, y1: 720, h: 80, zone: 'slums' },
    { id: 'house1', model: 'barracks', x0: 90, y0: 640, x1: 230, y1: 770, h: 85, zone: 'slums' },
    { id: 'hospital', model: 'bld_c', x0: 1830, y0: 120, x1: 2190, y1: 330, h: 130, door: 'S', zone: 'base', tint: '#f2f2f2' },
    { id: 'police1', model: 'barracks', x0: 1760, y0: 1060, x1: 1900, y1: 1180, h: 90, zone: 'base', tint: '#a8b8d8' },
    { id: 'police2', model: 'barracks', x0: 2000, y0: 1060, x1: 2140, y1: 1180, h: 90, zone: 'base', tint: '#a8b8d8' },
    { id: 'tower3', model: 'bld_b', x0: 2220, y0: 700, x1: 2350, y1: 830, h: 220, zone: 'base' },
  ],
  props: [
    // place de la mairie : embouteillage, police, ambulance
    { model: 'police', x: 1000, y: 1120, w: 44, d: 92, rot: 0.4 },
    { model: 'car', x: 1430, y: 1080, w: 40, d: 82, rot: -1.2 },
    { model: 'p_bus', x: 1470, y: 1300, w: 50, d: 150, rot: 0.1 },
    { model: 'p_ambulance', x: 1140, y: 905, w: 44, d: 96, rot: Math.PI / 2 },
    { model: 'suv_wreck', x: 920, y: 1460, w: 46, d: 92, rot: 1.9 },
    { model: 'car', x: 1380, y: 1500, w: 40, d: 82, rot: 2.8 },
    // gare : bus, semi-remorque, voitures abandonnées
    { model: 'p_semi', x: 1500, y: 200, w: 46, d: 190, rot: 0 },
    { model: 'car', x: 900, y: 200, w: 40, d: 82, rot: 0.4 },
    { model: 'p_bus', x: 950, y: 700, w: 50, d: 150, rot: Math.PI / 2, burnt: true },
    { model: 'container_red', x: 1440, y: 700, w: 150, d: 66, rot: 0 },
    // quartier des bars
    { model: 'p_tanker', x: 600, y: 1440, w: 48, d: 180, rot: 0.3 },
    { model: 'gastank', x: 230, y: 1150, w: 46, d: 46, rot: 0 },
    { model: 'gastank', x: 400, y: 1150, w: 46, d: 46, rot: 0 },
    { model: 'car', x: 380, y: 560, w: 40, d: 82, rot: 1.7 },
    { model: 'police', x: 160, y: 1000, w: 44, d: 92, rot: 0.2 },
    // commissariat & hôpital
    { model: 'police', x: 1950, y: 560, w: 44, d: 92, rot: -0.3 },
    { model: 'police', x: 2080, y: 940, w: 44, d: 92, rot: 1.4 },
    { model: 'p_ambulance', x: 1780, y: 380, w: 44, d: 96, rot: Math.PI / 2 },
    { model: 'p_heli', x: 2270, y: 420, w: 70, d: 150, rot: -0.3, medic: true },
    { model: 'p_army', x: 1760, y: 820, w: 48, d: 150, rot: 0 },
    { model: 'container_green', x: 2100, y: 1400, w: 150, d: 66, rot: 0 },
  ],
  decor: [
    { kind: 'cones', x: 1200, y: 1560, rot: 0 }, { kind: 'cones', x: 1035, y: 1170, rot: 0.4 },
    { kind: 'bags', x: 1090, y: 960 }, { kind: 'bags', x: 1560, y: 1560 }, { kind: 'bodybags', x: 1020, y: 1020 },
    { kind: 'sign', x: 1290, y: 1545, text: 'COUVRE-FEU', sub: '→ COMMISSARIAT' },
    { kind: 'graffiti', x: 1200, y: 1010, text: 'LA VILLE EST MORTE', rot: 0.05 },
    { kind: 'crates', x: 960, y: 430 }, { kind: 'carts', x: 1300, y: 420 },
    { kind: 'graffiti', x: 1200, y: 610, text: 'DERNIER TRAIN PARTI', rot: 0.06 },
    { kind: 'barrelfire', x: 520, y: 330 }, { kind: 'barrelfire', x: 300, y: 860 }, { kind: 'campfire', x: 610, y: 470 },
    { kind: 'mattress', x: 700, y: 330, rot: 0.5 }, { kind: 'tires', x: 120, y: 1300 },
    { kind: 'graffiti', x: 330, y: 830, text: 'HAPPY HOUR ÉTERNEL', rot: 0.2 },
    { kind: 'tent', x: 2080, y: 560, color: '#e8e4dc', medic: true, rot: 0 },
    { kind: 'crates', x: 1920, y: 960, military: true }, { kind: 'barrelfire', x: 1960, y: 1290 }, { kind: 'barrelfire', x: 2330, y: 560 },
    { kind: 'watchtower', x: 2330, y: 1080 },
    { kind: 'graffiti', x: 1950, y: 1500, text: 'POLICE · NE PAS ENTRER', rot: 0 },
  ],
  crows: [{ x: 1200, y: 1000 }, { x: 600, y: 1440 }, { x: 2050, y: 900 }],
  car: { x: 1200, y: 1330, w: 46, d: 96 },
  gasStation: { x: 315, y: 1225 },
  startPos: { x: 1250, y: 1330 },
  generator: { x: 1200, y: 470 },
  benches: [
    { x: 875, y: 1250, zone: 'parking', rot: Math.PI / 2 },
    { x: 1110, y: 368, zone: 'mall', rot: 0 },
    { x: 400, y: 470, zone: 'slums', rot: 0 },
    { x: 1900, y: 700, zone: 'base', rot: 0 },
  ],
  // beaucoup de lampadaires : c'est toujours la nuit en ville
  lamps: [[880, 1060], [1520, 1060], [880, 1540], [1520, 1540], [1200, 1180], [1200, 1480], [880, 380], [1520, 380], [1200, 640],
    [300, 480], [700, 480], [300, 1080], [700, 1300], [1700, 700], [2300, 300], [1700, 1300], [2300, 1300], [2000, 950]],
  sandbags: [[1700, 1350], [1720, 1380], [2250, 1000], [2270, 1030], [1650, 300], [1670, 330]],
};
const MAPS = { desert: MAP_DESERT, highway: MAP_HIGHWAY, city: MAP_CITY };
/** Conditions pour jouer sur une carte (Préparation → Équipe → Carte) */
const MAP_REQ = {
  highway: { ok: S => !!S.ach.escape, text: '🔒 Évadez-vous une fois' },
  city: { ok: S => !!S.ach.w15, text: '🔒 Atteignez la vague 15' },
};
const mapOpen = id => !MAP_REQ[id] || MAP_REQ[id].ok(Save.data);
/* Carte choisie dans la Préparation (lue directement dans la sauvegarde : save.js n'est pas encore chargé) */
const MAP = (() => { try { const s = JSON.parse(localStorage.getItem('deadsand.save')); return MAPS[s && s.settings && s.settings.map] || MAP_DESERT; } catch (e) { return MAP_DESERT; } })();

/** Refuges : bâtiments où l'on entre (on y est à l'abri, on n'y tire pas) : achats pour SURVIVRE.
    (L'Armurerie du centre commercial est un grand établi : voir BENCHES dans gunsmith.js) */
const SHELTERS = {
  pharmacy: { type: 'clinic', name: 'Pharmacie', icon: '💊', building: 'pharmacy' }, // plus de soin passif à l'abri (on pouvait se soigner à l'infini)
  workshop: { type: 'workshop', name: 'Atelier', icon: '🔧', building: 'workshop' },
  hospital: { type: 'hospital', name: 'Hôpital', icon: '🏥', building: 'hospital' },
};

/* --------------------------------------------------------------------- */
const World = {
  obstacles: [],      // {x0,y0,x1,y1, kind, ref}
  unlocked: new Set(),
  cols: 0, rows: 0,
  solid: null,        // grille brute (balles, visibilité)
  walk: null,         // grille gonflée (déplacements des zombies)
  dist: null,         // champ de flux vers la cible courante
  flowTarget: { cx: -1, cy: -1 }, flowT: 0,

  init() {
    this.cols = Math.ceil(MAP.W / MAP.cell); this.rows = Math.ceil(MAP.H / MAP.cell);
    this.solid = new Uint8Array(this.cols * this.rows);
    this.walk = new Uint8Array(this.cols * this.rows);
    this.dist = new Int32Array(this.cols * this.rows);
    for (const b of MAP.buildings) {
      if (!b.door) continue;
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      b.doorPos = b.door === 'S' ? { x: cx, y: b.y1 + 22 } : b.door === 'N' ? { x: cx, y: b.y0 - 22 } : b.door === 'E' ? { x: b.x1 + 22, y: cy } : { x: b.x0 - 22, y: cy };
    }
  },

  /** Réinitialise la carte pour une nouvelle partie (seul le parking est ouvert) */
  reset() {
    this.unlocked = new Set(['parking']);
    this.rebuild();
  },

  zone(id) { return MAP.zones.find(z => z.id === id); },
  zoneAt(x, y) { return MAP.zones.find(z => x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1); },
  isUnlocked(id) { return this.unlocked.has(id); },

  unlock(id) { this.unlocked.add(id); this.rebuild(); },

  rebuild() {
    const T = MAP.wallT / 2, obs = [];
    for (const s of MAP.separators) {
      const horiz = s.y0 === s.y1, [g0, g1] = s.gate, open = this.unlocked.has(s.zone);
      const segs = horiz ? [[s.x0, g0], [g1, s.x1]] : [[s.y0, g0], [g1, s.y1]];
      for (const [a, b] of segs) obs.push(horiz ? { x0: a, y0: s.y0 - T, x1: b, y1: s.y0 + T, kind: 'wall' } : { x0: s.x0 - T, y0: a, x1: s.x0 + T, y1: b, kind: 'wall' });
      if (!open) obs.push(horiz ? { x0: g0, y0: s.y0 - T, x1: g1, y1: s.y0 + T, kind: 'gate', ref: s } : { x0: s.x0 - T, y0: g0, x1: s.x0 + T, y1: g1, kind: 'gate', ref: s });
    }
    for (const b of MAP.buildings) obs.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, kind: 'building', ref: b });
    for (const p of MAP.props) {
      const sw = Math.abs(Math.cos(p.rot)) > 0.7 ? p.w : p.d, sd = Math.abs(Math.cos(p.rot)) > 0.7 ? p.d : p.w;
      obs.push({ x0: p.x - sw / 2, y0: p.y - sd / 2, x1: p.x + sw / 2, y1: p.y + sd / 2, kind: 'prop', ref: p });
    }
    const c = MAP.car; obs.push({ x0: c.x - c.w / 2, y0: c.y - c.d / 2, x1: c.x + c.w / 2, y1: c.y + c.d / 2, kind: 'car' });
    this.obstacles = obs;
    // grilles
    const C = MAP.cell;
    this.solid.fill(0); this.walk.fill(0);
    const mark = (grid, r, pad) => {
      const cx0 = Math.max(0, Math.floor((r.x0 - pad) / C)), cx1 = Math.min(this.cols - 1, Math.floor((r.x1 + pad) / C));
      const cy0 = Math.max(0, Math.floor((r.y0 - pad) / C)), cy1 = Math.min(this.rows - 1, Math.floor((r.y1 + pad) / C));
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) grid[y * this.cols + x] = 1;
    };
    for (const r of obs) { mark(this.solid, r, -C * 0.3); mark(this.walk, r, 10); }
    // bords du monde : infranchissables
    for (let x = 0; x < this.cols; x++) { this.walk[x] = 1; this.walk[(this.rows - 1) * this.cols + x] = 1; }
    for (let y = 0; y < this.rows; y++) { this.walk[y * this.cols] = 1; this.walk[y * this.cols + this.cols - 1] = 1; }
    this.flowTarget.cx = -1;
  },

  /* ---------------------------- collisions ---------------------------- */
  /** Repousse un cercle {x,y,r} hors des obstacles et le garde dans le monde */
  resolve(o) {
    const m = MAP.wallT;
    for (const r of this.obstacles) {
      if (o.x < r.x0 - o.r || o.x > r.x1 + o.r || o.y < r.y0 - o.r || o.y > r.y1 + o.r) continue;
      const px = U.clamp(o.x, r.x0, r.x1), py = U.clamp(o.y, r.y0, r.y1);
      let dx = o.x - px, dy = o.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0) {
        if (d2 >= o.r * o.r) continue;
        const d = Math.sqrt(d2), k = (o.r - d) / d;
        o.x += dx * k; o.y += dy * k;
      } else { // centre à l'intérieur : sortie par le côté le plus proche
        const l = o.x - r.x0, rr = r.x1 - o.x, t = o.y - r.y0, b = r.y1 - o.y, mn = Math.min(l, rr, t, b);
        if (mn === l) o.x = r.x0 - o.r; else if (mn === rr) o.x = r.x1 + o.r; else if (mn === t) o.y = r.y0 - o.r; else o.y = r.y1 + o.r;
      }
    }
    o.x = U.clamp(o.x, m + o.r, MAP.W - m - o.r);
    o.y = U.clamp(o.y, m + o.r, MAP.H - m - o.r);
  },

  /** Le point est-il dans un obstacle (ou hors du monde) ? — pour les balles */
  solidAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP.W || y >= MAP.H) return true;
    for (const r of this.obstacles) if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return true;
    return false;
  },

  cellOf(x, y) { return [U.clamp(Math.floor(x / MAP.cell), 0, this.cols - 1), U.clamp(Math.floor(y / MAP.cell), 0, this.rows - 1)]; },

  /** Ligne de vue dégagée entre deux points (grille brute) */
  los(x0, y0, x1, y1) {
    let [cx, cy] = this.cellOf(x0, y0); const [tx, ty] = this.cellOf(x1, y1);
    const dx = Math.abs(tx - cx), dy = Math.abs(ty - cy), sx = cx < tx ? 1 : -1, sy = cy < ty ? 1 : -1;
    let err = dx - dy, n = 0;
    while (!(cx === tx && cy === ty) && n++ < 200) {
      if (this.walk[cy * this.cols + cx] && n > 1) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
    return true;
  },

  /* ---------------------------- navigation ---------------------------- */
  /** Champ de flux (distances BFS) vers la cible ; recalculé quand elle change de case */
  updateFlow(tx, ty, dt) {
    this.flowT -= dt;
    const [cx, cy] = this.cellOf(tx, ty);
    if (cx === this.flowTarget.cx && cy === this.flowTarget.cy && this.flowT > 0) return;
    this.flowTarget.cx = cx; this.flowTarget.cy = cy; this.flowT = 0.5;
    const W = this.cols, N = W * this.rows, dist = this.dist;
    dist.fill(-1);
    const q = this._q || (this._q = new Int32Array(N));
    let h = 0, t = 0;
    const s = cy * W + cx; dist[s] = 0; q[t++] = s;
    while (h < t) {
      const i = q[h++], x = i % W, y = (i / W) | 0, d = dist[i] + 1;
      if (x > 0 && dist[i - 1] < 0 && !this.walk[i - 1]) { dist[i - 1] = d; q[t++] = i - 1; }
      if (x < W - 1 && dist[i + 1] < 0 && !this.walk[i + 1]) { dist[i + 1] = d; q[t++] = i + 1; }
      if (y > 0 && dist[i - W] < 0 && !this.walk[i - W]) { dist[i - W] = d; q[t++] = i - W; }
      if (y < this.rows - 1 && dist[i + W] < 0 && !this.walk[i + W]) { dist[i + W] = d; q[t++] = i + W; }
    }
  },

  /** Direction à suivre depuis (x,y) d'après le champ de flux (null si inaccessible) */
  flowDir(x, y) {
    const [cx, cy] = this.cellOf(x, y), W = this.cols, dist = this.dist;
    let best = dist[cy * W + cx], bx = 0, by = 0;
    if (best < 0) best = 1e9;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= this.rows) continue;
      const d = dist[ny * W + nx];
      if (d < 0) continue;
      if (ox && oy && (dist[cy * W + nx] < 0 || dist[ny * W + cx] < 0)) continue; // pas de coupe d'angle
      const dd = d + (ox && oy ? 0.4 : 0);
      if (dd < best) { best = dd; bx = ox; by = oy; }
    }
    if (!bx && !by) return null;
    const tx = (cx + bx + 0.5) * MAP.cell, ty = (cy + by + 0.5) * MAP.cell, d = Math.hypot(tx - x, ty - y) || 1;
    return { x: (tx - x) / d, y: (ty - y) / d };
  },

  /* ---------------------------- placements ---------------------------- */
  /** Point libre aléatoire dans les zones ouvertes, à une distance [dMin, dMax] d'un point */
  randomPoint(nearX, nearY, dMin, dMax, r = 20, zoneId = null) {
    const zones = MAP.zones.filter(z => zoneId ? z.id === zoneId : this.unlocked.has(z.id));
    for (let i = 0; i < 60; i++) {
      const z = zones[Math.floor(Math.random() * zones.length)];
      const x = U.rand(z.x0 + 50, z.x1 - 50), y = U.rand(z.y0 + 50, z.y1 - 50);
      const d = Math.hypot(x - nearX, y - nearY);
      if (d < dMin || d > dMax) continue;
      const [cx, cy] = this.cellOf(x, y);
      if (this.walk[cy * this.cols + cx]) continue;
      const o = { x, y, r }; this.resolve(o);
      if (Math.hypot(o.x - x, o.y - y) > 2) continue;
      return { x, y };
    }
    const z = zones[0];
    return { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 + 120 };
  },

  /** Porte de refuge proche du joueur (pour le bouton « Entrer ») */
  nearDoor(x, y, maxD = 46) {
    for (const [id, s] of Object.entries(SHELTERS)) {
      const b = MAP.buildings.find(bb => bb.id === s.building);
      if (!b || !this.unlocked.has(b.zone)) continue;
      if (Math.hypot(b.doorPos.x - x, b.doorPos.y - y) < maxD) return id;
    }
    return null;
  },

  doorOf(shelterId) { return MAP.buildings.find(b => b.id === SHELTERS[shelterId].building).doorPos; },
};
World.init();
