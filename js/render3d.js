/* =====================================================================
   RENDU 3D (Three.js) — post-apo, désert, zombies
   - terrain désertique + carrefour d'asphalte envahi par le sable
   - soleil rasant avec ombres portées, brume, halo lumineux (bloom)
   - modèles 3D stylisés construits par code (aucun fichier à charger)
   - HUD, chiffres de dégâts et joystick sur un canvas 2D par-dessus
   La logique du jeu (entities.js, waves.js, main.js) est inchangée :
   ce module ne fait que LIRE l'état du jeu et le mettre en scène.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const W = CONFIG.world.width, H = CONFIG.world.height, WALL = CONFIG.arena.wall;
const toX = x => x - W / 2, toZ = y => y - H / 2;
const MOBILE = window.matchMedia && matchMedia('(pointer: coarse)').matches;
const LOW = Save.quality() === 'low'; // qualité « Économie » : sans ombres portées ni halo, résolution réduite
const easeOut = t => 1 - Math.pow(1 - U.clamp(t, 0, 1), 3);
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ------------------------------ caches ------------------------------ */
const GC = {};
const geo = (k, fn) => GC[k] || (GC[k] = fn());
const f2 = v => v.toFixed(2);
const G = {
  box: (w, h, d) => geo(`b${f2(w)},${f2(h)},${f2(d)}`, () => new THREE.BoxGeometry(w, h, d)),
  sphere: (r, ws = 18, hs = 14) => geo(`s${f2(r)},${ws}`, () => new THREE.SphereGeometry(r, ws, hs)),
  hemi: r => geo(`h${f2(r)}`, () => new THREE.SphereGeometry(r, 18, 8, 0, TAU, 0, Math.PI / 2)),
  capsule: (r, l) => geo(`c${f2(r)},${f2(l)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.01, l), 5, 12)),
  cyl: (rt, rb, h, s = 14) => geo(`y${f2(rt)},${f2(rb)},${f2(h)},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)),
  torus: (r, t) => geo(`t${f2(r)},${f2(t)}`, () => new THREE.TorusGeometry(r, t, 8, 18)),
};
const MC = {};
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (MC[k]) return MC[k];
  return (MC[k] = new THREE.MeshStandardMaterial({
    color, roughness: o.r ?? 0.8, metalness: o.m ?? 0, flatShading: !!o.flat,
    emissive: o.e || '#000000', emissiveIntensity: o.ei ?? 1,
  }));
}
/** Couleur "HDR" (> 1) pour les objets lumineux qui déclenchent le halo */
function glowMat(hex, k) { const c = new THREE.Color(hex).multiplyScalar(k); return new THREE.MeshBasicMaterial({ color: c, toneMapped: true }); }
function mesh(g, m, cast = true, recv = false) { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = recv; return o; }
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  return t;
}
function softDot(size = 64) { // texture ronde douce (particules, ombres de contact)
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/* =====================================================================
   TEXTURES PEINTES
   ===================================================================== */
function sandTexture() {
  return canvasTex(1024, (x, S) => {
    const R = rng(5);
    x.fillStyle = '#d2a66c'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 50; i++) {
      const px = R() * S, py = R() * S, r = 60 + R() * 180, g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, R() < 0.5 ? 'rgba(240,205,150,0.35)' : 'rgba(150,100,55,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    for (let i = 0; i < 70; i++) { // rides de vent
      const y0 = R() * S, amp = 4 + R() * 8, len = 150 + R() * 300, x0 = R() * S;
      x.beginPath();
      for (let k = 0; k <= len; k += 8) x.lineTo(x0 + k, y0 + Math.sin(k * 0.03 + i) * amp);
      x.strokeStyle = `rgba(140,95,50,${0.08 + R() * 0.08})`; x.lineWidth = 1.5 + R() * 2; x.stroke();
    }
    for (let i = 0; i < 22000; i++) {
      x.fillStyle = R() < 0.5 ? `rgba(110,72,35,${0.06 + R() * 0.12})` : `rgba(255,238,205,${0.06 + R() * 0.14})`;
      x.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
    }
  }, 4);
}

function asphaltTexture() {
  return canvasTex(LOW ? 1024 : 2048, (x, S0) => {
    const S = 1024; x.scale(S0 / S, S0 / S); // dessin en repère 1024, résolution réelle 2048 sur PC
    const R = rng(9);
    x.fillStyle = '#5e5952'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) { // plaques plus claires / plus foncées, discrètes
      const px = R() * S, py = R() * S, r = 40 + R() * 110, g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, R() < 0.5 ? 'rgba(140,132,120,0.14)' : 'rgba(30,28,26,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    for (let i = 0; i < 160000; i++) { x.fillStyle = R() < 0.5 ? `rgba(20,18,16,${R() * 0.3})` : `rgba(185,175,160,${R() * 0.22})`; x.fillRect(R() * S, R() * S, 0.6 + R() * 1.1, 0.6 + R() * 1.1); }
    // marquages : carrefour, lignes jaunes pointillées, passages piétons
    x.globalAlpha = 0.55;
    x.fillStyle = '#d9b64a';
    for (let k = 40; k < S - 40; k += 70) { x.fillRect(k, S / 2 - 4, 40, 8); x.fillRect(S / 2 - 4, k, 8, 40); }
    x.fillStyle = '#e6e0d4';
    for (const [cx, cy, horiz] of [[S / 2, S * 0.27, true], [S / 2, S * 0.73, true], [S * 0.27, S / 2, false], [S * 0.73, S / 2, false]])
      for (let k = -4; k <= 4; k++) horiz ? x.fillRect(cx + k * 22 - 7, cy - 30, 14, 60) : x.fillRect(cx - 30, cy + k * 22 - 7, 60, 14);
    x.globalAlpha = 1;
    // taches d'huile
    for (let i = 0; i < 9; i++) {
      const px = R() * S, py = R() * S, r = 18 + R() * 40, g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(15,12,10,0.55)'); g.addColorStop(1, 'rgba(15,12,10,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(px, py, r, r * (0.6 + R() * 0.4), R() * 3, 0, TAU); x.fill();
    }
    // traces de pneus
    for (let i = 0; i < 6; i++) {
      const x0 = R() * S, y0 = R() * S, a0 = R() * TAU;
      for (const off of [-10, 10]) {
        x.beginPath();
        for (let k = 0; k < 40; k++) { const a = a0 + k * 0.03, px = x0 + Math.cos(a) * k * 9 + Math.cos(a + Math.PI / 2) * off, py = y0 + Math.sin(a) * k * 9 + Math.sin(a + Math.PI / 2) * off; x.lineTo(px, py); }
        x.strokeStyle = 'rgba(20,18,16,0.35)'; x.lineWidth = 6; x.stroke();
      }
    }
    // fissures
    for (let i = 0; i < 45; i++) {
      let px = R() * S, py = R() * S, a = R() * TAU;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 10; k++) { a += (R() - 0.5) * 1.2; px += Math.cos(a) * (8 + R() * 18); py += Math.sin(a) * (8 + R() * 18); x.lineTo(px, py); }
      x.strokeStyle = 'rgba(18,16,14,0.8)'; x.lineWidth = 1.5 + R() * 1.5; x.stroke();
      x.strokeStyle = 'rgba(190,180,165,0.15)'; x.lineWidth = 1; x.stroke();
    }
    // sable soufflé sur l'asphalte (bords + amas)
    const sand = (px, py, r, a) => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(214,170,110,${a})`); g.addColorStop(1, 'rgba(214,170,110,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); };
    for (let i = 0; i < 70; i++) { const side = i % 4, t = R() * S, d = R() * 30; sand(side === 0 ? t : side === 1 ? S - d : side === 2 ? t : d, side === 0 ? d : side === 1 ? t : side === 2 ? S - d : t, 40 + R() * 70, 0.85); }
    for (let i = 0; i < 7; i++) sand(R() * S, R() * S, 25 + R() * 50, 0.45);
    // grains de sable épars, nets
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(225,185,125,${0.15 + R() * 0.4})`; x.fillRect(R() * S, R() * S, 1 + R(), 1 + R()); }
  }, 1);
}

/** Bruit commun des sols : grains, plaques, fissures, sable soufflé sur les bords */
function groundNoise(x, S, R, base, grains = 60000) {
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 24; i++) {
    const px = R() * S, py = R() * S, r = 40 + R() * 120, g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, R() < 0.5 ? 'rgba(150,140,125,0.14)' : 'rgba(25,22,20,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < grains; i++) { x.fillStyle = R() < 0.5 ? `rgba(20,18,16,${R() * 0.25})` : `rgba(190,180,165,${R() * 0.18})`; x.fillRect(R() * S, R() * S, 0.8 + R(), 0.8 + R()); }
}
function cracks(x, S, R, n) {
  for (let i = 0; i < n; i++) {
    let px = R() * S, py = R() * S, a = R() * TAU;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 9; k++) { a += (R() - 0.5) * 1.2; px += Math.cos(a) * (8 + R() * 16); py += Math.sin(a) * (8 + R() * 16); x.lineTo(px, py); }
    x.strokeStyle = 'rgba(18,16,14,0.7)'; x.lineWidth = 1.2 + R() * 1.4; x.stroke();
  }
}
function sandEdges(x, S, R, n, a = 0.8) {
  const sand = (px, py, r, al) => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(214,170,110,${al})`); g.addColorStop(1, 'rgba(214,170,110,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); };
  for (let i = 0; i < n; i++) { const side = i % 4, t = R() * S, d = R() * 24; sand(side === 0 ? t : side === 1 ? S - d : side === 2 ? t : d, side === 0 ? d : side === 1 ? t : side === 2 ? S - d : t, 30 + R() * 60, a); }
  for (let i = 0; i < 6; i++) sand(R() * S, R() * S, 20 + R() * 40, 0.4);
}
/** Parking : places délimitées, flèches, taches d'huile */
function parkingTexture() {
  return canvasTex(LOW ? 1024 : 2048, (x, S0) => {
    const S = 1024; x.scale(S0 / S, S0 / S);
    const R = rng(21);
    groundNoise(x, S, R, '#55524d', 120000);
    x.globalAlpha = 0.7; x.fillStyle = '#e8e2d6';
    // rangées de places (bandes horizontales), allées entre elles
    for (const row of [120, 430, 760]) {
      for (let k = 40; k < S - 40; k += 58) { if (Math.abs(k - S / 2) < 80) continue; x.fillRect(k, row - 70, 4, 140); }
      x.fillRect(40, row - 2, S - 80, 4);
    }
    x.fillStyle = '#d9b64a';
    for (let k = 30; k < S; k += 60) { x.fillRect(S / 2 - 3, k, 6, 32); }
    x.fillStyle = '#e8e2d6';
    for (const [ax, ay] of [[300, 280], [720, 600], [300, 900]]) { x.beginPath(); x.moveTo(ax, ay - 30); x.lineTo(ax + 16, ay); x.lineTo(ax + 6, ay); x.lineTo(ax + 6, ay + 30); x.lineTo(ax - 6, ay + 30); x.lineTo(ax - 6, ay); x.lineTo(ax - 16, ay); x.closePath(); x.fill(); }
    x.globalAlpha = 1;
    for (let i = 0; i < 12; i++) { const px = R() * S, py = R() * S, r = 14 + R() * 30, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(12,10,8,0.5)'); g.addColorStop(1, 'rgba(12,10,8,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
    cracks(x, S, R, 40);
    sandEdges(x, S, R, 60);
  }, 1);
}
/** Parvis du centre commercial : dalles claires */
function plazaTexture() {
  return canvasTex(LOW ? 1024 : 2048, (x, S0) => {
    const S = 1024; x.scale(S0 / S, S0 / S);
    const R = rng(33);
    groundNoise(x, S, R, '#9a9184', 50000);
    const T = 64;
    for (let i = 0; i < S / T; i++) for (let j = 0; j < S / T; j++) {
      const v = R(); x.fillStyle = v < 0.15 ? 'rgba(40,34,28,0.14)' : v > 0.85 ? 'rgba(255,245,225,0.1)' : 'rgba(0,0,0,0)';
      x.fillRect(i * T, j * T, T, T);
      if (R() < 0.06) { x.fillStyle = 'rgba(30,26,22,0.35)'; x.fillRect(i * T + 4, j * T + 4, T - 8, T - 8); } // dalle manquante
    }
    x.strokeStyle = 'rgba(40,34,28,0.4)'; x.lineWidth = 2;
    for (let k = 0; k <= S; k += T) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, S); x.stroke(); x.beginPath(); x.moveTo(0, k); x.lineTo(S, k); x.stroke(); }
    cracks(x, S, R, 30);
    sandEdges(x, S, R, 70);
  }, 1);
}
/** Base militaire : béton coulé en plaques, marquage jaune */
function concreteTexture() {
  return canvasTex(LOW ? 1024 : 2048, (x, S0) => {
    const S = 1024; x.scale(S0 / S, S0 / S);
    const R = rng(55);
    groundNoise(x, S, R, '#8c877c', 70000);
    x.strokeStyle = 'rgba(40,36,30,0.45)'; x.lineWidth = 3;
    for (let k = 0; k <= S; k += 128) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, S); x.stroke(); x.beginPath(); x.moveTo(0, k); x.lineTo(S, k); x.stroke(); }
    x.globalAlpha = 0.6; x.fillStyle = '#e0b020';
    for (let k = 0; k < S; k += 40) { x.fillRect(k, 600, 22, 10); }
    x.strokeStyle = '#e0b020'; x.lineWidth = 8; x.beginPath(); x.arc(760, 820, 90, 0, TAU); x.stroke();
    x.font = '900 120px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', 760, 824);
    x.globalAlpha = 1;
    cracks(x, S, R, 35);
    sandEdges(x, S, R, 70);
  }, 1);
}

/* =====================================================================
   PERSONNAGES — modèles 3D animés (glTF, Quaternius, licence CC0)
   assets/models/survivor.glb : survivante (animations de tir, course, mort…)
   assets/models/zombie.glb   : zombie décliné en 5 variantes (taille, teinte,
                                accessoires) pour les 5 types d'ennemis.
   ===================================================================== */
const ASSETS = {};

async function loadAssets() {
  const loader = new GLTFLoader();
  const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const names = ['survivor', 'scout', 'swat', 'zombie'];
  const world = ['barracks', 'bld_a', 'bld_b', 'bld_big', 'bld_business', 'bld_c', 'car', 'container_green', 'container_red', 'dog', 'gascan', 'gastank', 'police', 'suv'];
  const [files, wfiles] = await Promise.all([
    Promise.all(names.map(n => load(`assets/models/${n}.glb`))),
    Promise.all(world.map(n => load(`assets/models/world/${n}.glb`).catch(() => null))),
  ]);
  names.forEach((n, i) => { ASSETS[n] = prepAsset(files[i]); });
  world.forEach((n, i) => { if (wfiles[i]) WORLD_ASSETS[n] = prepStatic(wfiles[i], n === 'dog'); });
  if (WORLD_ASSETS.dog) ASSETS.dog = prepAsset(wfiles[world.indexOf('dog')]);
}
const WORLD_ASSETS = {};
/** Modèle statique : mesures de la boîte englobante (taille, centre, base) */
function prepStatic(gltf, skinned) {
  const scene = gltf.scene;
  scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, !skinned);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  return { scene, size, center, minY: box.min.y };
}
/** Instancie un modèle statique ajusté à une emprise au sol (w selon x, d selon z) et une hauteur */
function placeModel(name, w, d, h, tint) {
  const A = WORLD_ASSETS[name];
  if (!A) return null;
  const root = new THREE.Group(), m = A.scene.clone(true);
  const sx = w / A.size.x, sz = d / A.size.z, sy = h ? h / A.size.y : (sx + sz) / 2;
  m.scale.set(sx, sy, sz);
  m.position.set(-A.center.x * sx, -A.minY * sy, -A.center.z * sz);
  const mats = [];
  m.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (tint) o.material.color.multiply(new THREE.Color(tint));
    mats.push(o.material);
  });
  root.add(m);
  root.userData.mats = mats;
  return root;
}

/** Mesure le modèle et indexe ses animations par nom court ("CharacterArmature|Run" → "Run") */
function prepAsset(gltf) {
  const scene = gltf.scene;
  scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const clips = {};
  for (const a of gltf.animations) { const n = a.name.split('|').pop(); if (!clips[n]) clips[n] = a; }
  return { scene, height: box.max.y - box.min.y, minY: box.min.y, clips };
}

/**
 * Instancie un personnage : clone du squelette, mise à l'échelle à la hauteur
 * voulue (unités monde), matériaux propres (teinte + éclair d'impact), mixer.
 */
function makeActor(asset, height, tint) {
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(asset.scene);
  const k = height / asset.height;
  model.scale.setScalar(k); model.position.y = -asset.minY * k;
  root.add(model);
  const mats = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (tint) o.material.color.multiply(tint);
    o.material.emissive = new THREE.Color(0, 0, 0);
    mats.push(o.material);
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [n, c] of Object.entries(asset.clips)) actions[n] = mixer.clipAction(c);
  const bones = {};
  model.traverse(o => { if (o.isBone) bones[o.name] = o; });
  return { root, model, mixer, actions, mats, bones, cur: null, height, k };
}

/** Enchaîne vers une animation avec fondu (ne relance pas si déjà en cours) */
function play(a, name, { fade = 0.18, once = false, speed = 1 } = {}) {
  const act = a.actions[name];
  if (!act) return;
  act.setEffectiveTimeScale(speed);
  if (a.cur === name) return;
  act.reset();
  if (once) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; } else act.setLoop(THREE.LoopRepeat, Infinity);
  act.fadeIn(fade).play();
  if (a.cur && a.actions[a.cur]) a.actions[a.cur].fadeOut(fade);
  a.cur = name;
}

/** Accroche un objet à un os en annulant l'échelle du squelette */
function attachToBone(a, boneName, obj) {
  const b = a.bones[boneName];
  if (!b) return false;
  a.root.updateMatrixWorld(true);
  const ws = new THREE.Vector3(); b.getWorldScale(ws);
  const rs = new THREE.Vector3(); a.root.getWorldScale(rs);
  obj.scale.multiplyScalar(rs.x / ws.x);
  b.add(obj);
  return true;
}

/* =====================================================================
   ARMES : une base + des pièces montables (établi d'armurier, js/gunsmith.js).
   Chaque pièce a 4 formes (niveau 0 à 3) : la lunette grossit avec la portée,
   le canon s'allonge puis devient rotatif avec la cadence, le chargeur
   devient un tambour avec les dégâts… Repère : canon vers +z, haut vers +y.
   Matériaux « metal » / « wood » partagés : les peintures du Garage s'y appliquent.
   ===================================================================== */
const GUN_BASE = { rifle: ['#3a3e46', '#7a4a28', 0.4, 0.55], shotgun: ['#3a342e', '#8a5228', 0.4, 0.6], flamer: ['#4a4a4c', '#b8321e', 0.42, 0.6] };
function gunMats() {
  const out = {};
  for (const [id, [mc, wc, r, m]] of Object.entries(GUN_BASE)) {
    const metal = new THREE.MeshStandardMaterial({ color: mc, roughness: r, metalness: m });
    const wood = new THREE.MeshStandardMaterial({ color: wc, roughness: id === 'flamer' ? 0.4 : 0.7, metalness: id === 'flamer' ? 0.3 : 0 });
    metal.userData = { base: { color: metal.color.clone(), r: metal.roughness, m: metal.metalness }, role: 'metal' };
    wood.userData = { base: { color: wood.color.clone(), r: wood.roughness, m: wood.metalness }, role: 'wood' };
    out[id] = { metal, wood };
  }
  return out;
}
/** Matériaux d'accessoires (non repeints) */
const GACC = {};
function gacc() {
  if (GACC.dark) return GACC;
  const add = (c, o) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending });
  Object.assign(GACC, {
    dark: mat('#141416', { r: 0.55, m: 0.5 }), lens: mat('#10202c', { r: 0.05, m: 0.9 }), chrome: mat('#d8dce2', { r: 0.18, m: 0.9 }),
    red: glowMat('#ff2a1a', 4), green: glowMat('#5aff3a', 4), amber: glowMat('#ffb030', 2.6), blue: glowMat('#5ac8ff', 3.2), white: glowMat('#fff4dc', 3), orange: glowMat('#ff6a10', 1.8),
    shell: mat('#b8281e', { r: 0.5 }), shellBlack: mat('#1a1a1c', { r: 0.4, m: 0.3 }), brass: mat('#d8a840', { r: 0.3, m: 0.85 }), gold: mat('#ffcc40', { r: 0.2, m: 0.9, e: '#5a3a00' }),
    tape: mat('#c8a050', { r: 0.95 }), leather: mat('#5a3a22', { r: 0.85 }), gauge: mat('#ece6d6', { r: 0.6 }),
    beamR: add('#ff2a1a', 0.5), beamG: add('#5aff3a', 0.5),
  });
  return GACC;
}
const PI2 = Math.PI / 2;

/** Construit une arme (base + emplacements vides), puis monte les pièces d'origine */
function buildGun(id, M) {
  const gun = new THREE.Group(), u = gun.userData = { id, M, slots: {}, anchors: {} };
  if (id === 'rifle') {
    box(gun, 2.2, 3.2, 12, M.metal, 0, 0, 0);              // boîtier
    box(gun, 1.2, 0.5, 9, M.metal, 0, 1.85, 0.5);          // rail supérieur
    box(gun, 1.5, 3.4, 1.8, M.wood, 0, -2.6, -3.4, -0.3);  // poignée
    box(gun, 2, 3, 5.5, M.wood, 0, -0.7, -8);              // crosse
    box(gun, 1.7, 2.2, 1, M.wood, 0, -0.4, -11.2);         // plaque de couche
  } else if (id === 'shotgun') {
    box(gun, 2.6, 3.4, 9, M.metal, 0, 0, 0);
    box(gun, 1.6, 3.2, 1.8, M.wood, 0, -2.8, -3.2, -0.35);
    box(gun, 2.2, 3.6, 7, M.wood, 0, -1.2, -7.5, 0.12);
  } else {
    box(gun, 2.4, 3, 10, M.metal, 0, 0, 0);
    box(gun, 1.5, 3.2, 1.8, M.metal, 0, -2.6, -3.6, -0.3);
    box(gun, 1.4, 1.4, 4, M.metal, 0, 0.4, -6.5);
  }
  for (const pt of GUN_PARTS[id].parts) { const s = new THREE.Group(); gun.add(s); u.slots[pt.id] = s; }
  u.flash = mesh(G.sphere(id === 'rifle' ? 1.3 : id === 'shotgun' ? 2 : 2.4, 10, 8), glowMat(id === 'flamer' ? '#ff8a2a' : '#ffd27a', 4), false);
  u.flash.visible = false; gun.add(u.flash);
  applyGunMods(gun, {});
  return gun;
}

/** Monte les pièces correspondant aux niveaux (mods = { scope: 2, barrel: 1… }) */
function applyGunMods(gun, mods = {}) {
  const u = gun.userData, a = gacc(), M = u.M, S = u.slots, L = k => mods[k] || 0;
  for (const s of Object.values(S)) { s.clear(); s.scale.setScalar(1); }
  const A = (k, x, y, z) => { u.anchors[k] = new THREE.Vector3(x, y, z); };
  const beam = (slot, m, x, y, z) => { const b = mesh(G.cyl(0.07, 0.07, 60, 6), m, false); b.rotation.x = PI2; b.position.set(x, y, z + 30); b.userData.noBox = true; slot.add(b); };
  if (u.id === 'rifle') {
    // --- canon (cadence)
    const bl = L('barrel'), B = S.barrel; let mz;
    if (bl === 0) { cyl(B, 0.6, 0.6, 9, M.metal, 0, 0.5, 10.4, PI2, 0, 0, 8); box(B, 2.4, 2.4, 5, M.wood, 0, 0, 8); mz = 14.9; }
    else if (bl === 1) {
      cyl(B, 0.6, 0.6, 11, M.metal, 0, 0.5, 11.4, PI2, 0, 0, 8); cyl(B, 1.25, 1.25, 7, M.metal, 0, 0.5, 9.5, PI2, 0, 0, 10);
      for (let i = 0; i < 4; i++) box(B, 0.9, 0.3, 0.9, a.dark, 0, 1.78, 7.2 + i * 1.6);
      mz = 16.9;
    } else if (bl === 2) {
      cyl(B, 0.7, 0.7, 12, M.metal, 0, 0.5, 12, PI2, 0, 0, 10); box(B, 2.6, 2.4, 6, M.wood, 0, 0, 8.5); box(B, 1.6, 0.4, 6, a.dark, 0, 1.4, 8.5);
      for (let i = 0; i < 3; i++) cyl(B, 0.95, 0.95, 0.5, a.dark, 0, 0.5, 12.6 + i * 1.8, PI2, 0, 0, 10);
      mz = 18;
    } else { // triple canon rotatif
      for (let k = 0; k < 3; k++) { const an = k * TAU / 3; cyl(B, 0.45, 0.45, 12, M.metal, Math.cos(an) * 0.85, 0.5 + Math.sin(an) * 0.85, 12, PI2, 0, 0, 8); }
      for (const z of [7.5, 12.5, 17.4]) cyl(B, 1.6, 1.6, 0.6, a.dark, 0, 0.5, z, PI2, 0, 0, 12);
      box(B, 2.6, 2.6, 3, M.wood, 0, -0.2, 7); cyl(B, 0.45, 0.45, 3.2, a.dark, 1.4, -0.9, 5.6, PI2, 0, 0, 6);
      mz = 18;
    }
    A('barrel', 0, 0.5, mz - 4);
    // --- bouche (perforation)
    const ml = L('muzzle'), Mu = S.muzzle; let mlen = 0;
    if (ml === 1) { cyl(Mu, 0.85, 0.75, 1.8, a.dark, 0, 0.5, mz + 0.9, PI2, 0, 0, 8); for (let k = 0; k < 4; k++) box(Mu, 0.2, 0.2, 1.4, M.metal, Math.cos(k * PI2) * 0.82, 0.5 + Math.sin(k * PI2) * 0.82, mz + 0.9); mlen = 1.8; }
    else if (ml === 2) { box(Mu, 1.9, 1.9, 2.8, M.metal, 0, 0.5, mz + 1.4); for (let k = 0; k < 3; k++) box(Mu, 1.2, 0.3, 0.45, a.dark, 0, 1.48, mz + 0.5 + k * 0.85); mlen = 2.8; }
    else if (ml === 3) {
      box(Mu, 2.8, 1.7, 3.2, M.metal, 0, 0.5, mz + 1.6); for (const s of [-1, 1]) box(Mu, 0.4, 1.3, 2.6, a.dark, s * 1.55, 0.5, mz + 1.6);
      box(Mu, 0.25, 0.9, 7, a.chrome, 0, -0.8, mz + 3.2); const tip = mesh(new THREE.ConeGeometry(0.45, 1.6, 4), a.chrome); tip.rotation.x = PI2; tip.position.set(0, -0.8, mz + 7.4); tip.scale.x = 0.5; Mu.add(tip);
      mlen = 3.2;
    }
    A('muzzle', 0, 0.5, mz + Math.max(mlen, 1) / 2);
    u.mz = mz + mlen; u.my = 0.5;
    // --- lunette (portée)
    const sl = L('scope'), Sc = S.scope;
    if (sl === 0) { box(Sc, 0.35, 1.3, 0.35, M.metal, 0, 2.6, 4.6); box(Sc, 1.1, 0.8, 0.4, M.metal, 0, 2.4, -3.6); }
    else if (sl === 1) { box(Sc, 1.5, 1.8, 2.4, M.metal, 0, 3, 0.5); box(Sc, 1.1, 1.2, 0.15, a.lens, 0, 3.1, 1.75); box(Sc, 0.35, 0.35, 0.12, a.red, 0, 3.15, -0.75); }
    else if (sl === 2) {
      cyl(Sc, 1, 1, 5.4, M.metal, 0, 3.3, 0.6, PI2, 0, 0, 12); cyl(Sc, 1.35, 1.05, 1.6, M.metal, 0, 3.3, 3.9, PI2, 0, 0, 12);
      for (const z of [-1, 2]) box(Sc, 0.8, 1.1, 0.8, a.dark, 0, 2.4, z);
      cyl(Sc, 1.15, 1.15, 0.1, a.amber, 0, 3.3, 4.72, PI2, 0, 0, 12); cyl(Sc, 0.85, 0.85, 0.1, a.lens, 0, 3.3, -2.15, PI2, 0, 0, 12);
    } else {
      cyl(Sc, 1, 1, 10, M.metal, 0, 3.7, 0.5, PI2, 0, 0, 12); cyl(Sc, 1.75, 1.05, 2.6, M.metal, 0, 3.7, 6.8, PI2, 0, 0, 14); cyl(Sc, 1.05, 1.35, 1.6, M.metal, 0, 3.7, -5.3, PI2, 0, 0, 12);
      cyl(Sc, 0.55, 0.55, 1.3, a.dark, 0, 5, 0.5, 0, 0, 0, 10); cyl(Sc, 0.55, 0.55, 1.3, a.dark, 1.25, 3.7, 0.5, 0, 0, PI2, 10);
      for (const z of [-2.5, 3]) box(Sc, 0.8, 1.6, 0.9, a.dark, 0, 2.6, z);
      cyl(Sc, 1.6, 1.6, 0.1, a.blue, 0, 3.7, 8.12, PI2, 0, 0, 14); cyl(Sc, 1.2, 1.2, 0.1, a.lens, 0, 3.7, -6.12, PI2, 0, 0, 12);
    }
    A('scope', 0, sl ? 3.4 : 2.6, 0.5);
    // --- chargeur (dégâts)
    const gl = L('mag'), Mg = S.mag;
    if (gl === 0) box(Mg, 1.7, 4.2, 2.2, M.metal, 0, -3.4, 2, 0.25);
    else if (gl === 1) { box(Mg, 1.7, 3.6, 2.3, M.metal, 0, -3.2, 2, 0.2); box(Mg, 1.7, 3.6, 2.3, M.metal, 0, -6.2, 2.9, 0.45); }
    else if (gl === 2) { for (const s of [-1, 1]) box(Mg, 1.5, 5, 2.2, M.metal, s * 0.8, -3.8, 2, 0.25); box(Mg, 3.4, 1, 2.5, a.tape, 0, -4.1, 2.1, 0.25); }
    else { cyl(Mg, 3.3, 3.3, 2.6, M.metal, 0, -5.4, 2.2, 0, 0, PI2, 20); cyl(Mg, 1.2, 1.2, 2.9, a.dark, 0, -5.4, 2.2, 0, 0, PI2, 10); box(Mg, 1.6, 2.2, 2, M.metal, 0, -2.4, 2); }
    A('mag', 0, gl === 3 ? -5.4 : -4.2, 2.2);
    // --- rail inférieur (critique) : laser, lampe, poignée avant
    const ll = L('laser'), La = S.laser, lz = 6.5;
    if (ll === 0) box(La, 0.9, 0.4, 3, M.metal, 0, -1.4, lz);
    else {
      const glow = ll === 3 ? a.green : a.red;
      box(La, 1.2, 1.1, 2.8, a.dark, 0, -1.9, lz);
      const dot = mesh(G.sphere(0.3, 8, 6), glow, false); dot.position.set(0, -1.9, lz + 1.45); La.add(dot);
      beam(La, ll === 3 ? a.beamG : a.beamR, 0, -1.9, lz + 1.45);
      if (ll >= 2) { cyl(La, 0.9, 0.9, 3.2, M.metal, 1.35, -1.5, lz, PI2, 0, 0, 10); cyl(La, 0.78, 0.78, 0.1, a.white, 1.35, -1.5, lz + 1.65, PI2, 0, 0, 10); }
      if (ll === 3) box(La, 1, 3.2, 1.3, M.wood, 0, -3.3, lz - 2.8);
    }
    A('laser', 0, -1.9, lz);
  } else if (u.id === 'shotgun') {
    // --- canons (portée)
    const bl = L('barrel'), B = S.barrel, len = [11, 14, 15, 17][bl], z0 = 4.2 + len / 2, mz = 4.2 + len;
    for (const x of [-0.75, 0.75]) cyl(B, 0.75, 0.75, len, M.metal, x, 0.7, z0, PI2, 0, 0, 10);
    if (bl >= 2) { box(B, 0.5, 0.3, len - 1, M.metal, 0, 1.75, z0); for (let i = 0; i < 4; i++) box(B, 0.3, 0.35, 0.3, a.dark, 0, 1.5, 6 + i * (len - 4) / 3); }
    if (bl === 3) { for (const x of [-0.75, 0.75]) cyl(B, 0.88, 0.88, 0.9, a.dark, x, 0.7, mz - 0.45, PI2, 0, 0, 10); const bead = mesh(G.sphere(0.3, 8, 6), a.amber, false); bead.position.set(0, 2, mz - 0.4); B.add(bead); }
    A('barrel', 0, 0.7, mz - len * 0.3);
    u.mz = mz; u.my = 0.7;
    // --- pompe (cadence)
    const pl = L('pump'), P = S.pump;
    if (pl === 0) box(P, 2.8, 2.2, 5, M.wood, 0, -0.8, 8);
    else if (pl === 1) { box(P, 2.8, 2.2, 5, M.wood, 0, -0.8, 8); for (let i = 0; i < 5; i++) box(P, 2.95, 2.35, 0.35, a.dark, 0, -0.8, 6 + i); }
    else { box(P, 2.9, 2.4, 5.6, M.metal, 0, -0.8, 8); for (let i = 0; i < 6; i++) box(P, 3.05, 0.3, 0.4, a.dark, 0, 0.45, 5.8 + i * 0.9); }
    if (pl === 3) { cyl(P, 0.65, 0.65, mz - 6, M.metal, 0, -1.3, 4.5 + (mz - 6) / 2, PI2, 0, 0, 10); cyl(P, 0.8, 0.8, 0.8, a.dark, 0, -1.3, mz - 1.2, PI2, 0, 0, 10); for (let i = 0; i < 6; i++) cyl(P, 0.72, 0.72, 0.2, a.chrome, 0, -1.3, 11.5 + i * 0.7, PI2, 0, 0, 8); }
    A('pump', 0, -0.8, 8);
    // --- cartouchière (plombs)
    const sl = L('shells'), Sh = S.shells, sm = sl === 3 ? a.shellBlack : a.shell, cap = sl === 3 ? a.gold : a.brass;
    const shell = (x, y, z) => { cyl(Sh, 0.42, 0.42, 2.2, sm, x, y, z, 0, 0, 0, 8); cyl(Sh, 0.45, 0.45, 0.5, cap, x, y - 1.25, z, 0, 0, 0, 8); };
    if (sl >= 1) { box(Sh, 0.35, 2.9, 5, a.leather, 1.15, -1.2, -7.6, 0.12); for (let i = 0; i < 4; i++) shell(1.5, -1, -9.4 + i * 1.15); }
    if (sl >= 2) { box(Sh, 0.3, 2.4, 4.8, a.dark, 1.4, 0.2, 0); for (let i = 0; i < 4; i++) shell(1.75, 0.4, -1.75 + i * 1.15); }
    if (sl === 3) for (let i = 0; i < 4; i++) shell(-1.5, -1, -9.4 + i * 1.15);
    A('shells', 1.4, -0.4, -4.5);
  } else {
    // --- buse (portée)
    const nl = L('nozzle'), N = S.nozzle, len = [12, 15, 15, 16][nl], z0 = 4 + len / 2; let mz = 4 + len;
    cyl(N, 0.9, 1.2, len, M.metal, 0, 0.6, z0, PI2, 0, 0, 10);
    if (nl === 0) { cyl(N, 1.4, 1.1, 2, a.dark, 0, 0.6, mz + 1, PI2, 0, 0, 10); mz += 2; }
    else if (nl === 1) { for (let i = 0; i < 3; i++) cyl(N, 1.35, 1.35, 0.5, a.dark, 0, 0.6, 7 + i * 3.5, PI2, 0, 0, 10); cyl(N, 1.4, 1.1, 2, a.dark, 0, 0.6, mz + 1, PI2, 0, 0, 10); mz += 2; }
    else {
      const r = nl === 3 ? 2.7 : 2.2; cyl(N, r, 1.1, 3, M.metal, 0, 0.6, mz + 1.5, PI2, 0, 0, 14); mz += 3;
      if (nl === 3) { for (let k = 0; k < 4; k++) { const an = k * PI2 + Math.PI / 4; box(N, 0.3, 0.3, 10, M.metal, Math.cos(an) * 1.9, 0.6 + Math.sin(an) * 1.9, mz - 8.5); } for (const z of [mz - 13, mz - 4]) cyl(N, 2.15, 2.15, 0.5, a.dark, 0, 0.6, z, PI2, 0, 0, 14); }
    }
    A('nozzle', 0, 0.6, mz - len * 0.4);
    u.mz = mz; u.my = 0.6;
    // --- réservoir (dégâts)
    const tl = L('tank'), T = S.tank;
    if (tl === 0) { cyl(T, 2.2, 2.2, 9, M.wood, 0, -3.2, 0, PI2, 0, 0, 14); for (const z of [-4.5, 4.5]) cyl(T, 1.4, 1.4, 0.6, a.dark, 0, -3.2, z, PI2, 0, 0, 10); }
    else if (tl === 1) { cyl(T, 2.7, 2.7, 11, M.wood, 0, -3.7, 0, PI2, 0, 0, 16); for (const z of [-2.5, 2.5]) cyl(T, 2.8, 2.8, 0.5, a.dark, 0, -3.7, z, PI2, 0, 0, 16); }
    else {
      for (const s of [-1, 1]) cyl(T, tl === 3 ? 2.3 : 2, tl === 3 ? 2.3 : 2, 10, M.wood, s * 2.1, -3.5, 0, PI2, 0, 0, 14);
      box(T, 6.4, 0.6, 1.2, a.leather, 0, -3.5, -2); box(T, 6.4, 0.6, 1.2, a.leather, 0, -3.5, 2.5);
      if (tl === 3) {
        cyl(T, 1.1, 1.1, 0.5, a.dark, 0, -0.9, -2, 0, 0, 0, 14); cyl(T, 0.9, 0.9, 0.55, a.gauge, 0, -0.85, -2, 0, 0, 0, 14);
        box(T, 0.15, 0.1, 0.7, a.red, 0.2, -0.55, -2.1, 0, 0.6); const hose = mesh(G.torus(2.2, 0.3), a.dark); hose.rotation.y = PI2; hose.position.set(0, -1.6, 3.5); hose.scale.set(1, 0.7, 1); T.add(hose);
      }
    }
    A('tank', 0, -3.5, 0);
    // --- allumeur (largeur du cône)
    const il = L('igniter'), I = S.igniter;
    const pilot = mesh(G.sphere(0.7, 8, 6), a.blue, false); pilot.position.set(0, -0.6, mz - 0.4); I.add(pilot);
    if (il >= 1) { const c = mesh(G.torus(1.5, 0.28), a.orange, false); c.position.set(0, 0.6, mz - 2.2); I.add(c); }
    if (il >= 2) { const c = mesh(G.torus(1.5, 0.28), a.orange, false); c.position.set(0, 0.6, mz - 3.4); I.add(c); }
    if (il === 3) { const c = mesh(G.torus(2.4, 0.38), a.blue, false); c.position.set(0, 0.6, mz + 0.2); I.add(c); for (let k = 0; k < 3; k++) { const sp = mesh(G.box(0.15, 0.15, 1.6), a.white, false); sp.position.set(Math.cos(k * 2.1) * 2.2, 0.6 + Math.sin(k * 2.1) * 2.2, mz + 0.9); I.add(sp); } }
    A('igniter', 0, 0.6, mz - 2);
  }
  u.flash.position.set(0, u.my, u.mz + 1.3);
  // boîte englobante (hors faisceaux laser) : pour cadrer l'arme dans l'établi
  gun.updateMatrixWorld(true);
  const bx = new THREE.Box3(), tmp = new THREE.Box3(), inv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
  gun.traverse(o => { if (o.isMesh && !o.userData.noBox && o !== u.flash) { o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); bx.union(tmp); } });
  u.box = bx;
}

/** Variantes de zombies : hauteur (unités monde), teinte, vitesse d'anim, accessoires */
const ZOMBIE_TYPES = {
  walker:   { h: 50, tint: '#ffffff', walk: 'Walk', speed: 1.0 },
  runner:   { h: 40, tint: '#d8e8b8', walk: 'Run', speed: 1.25 },
  brute:    { h: 74, tint: '#9aa882', walk: 'Walk', speed: 0.7 },
  spitter:  { h: 50, tint: '#e8f070', walk: 'Walk', speed: 0.9 },
  behemoth: { h: 150, tint: '#8a9a78', walk: 'Walk', speed: 0.55 },
  crawler:  { h: 44, tint: '#b8a888', walk: 'Crawl', speed: 1.3, idle: 'Crawl' },
  bomber:   { h: 48, tint: '#ffb078', walk: 'Run', speed: 1.05 },
  armored:  { h: 58, tint: '#8a98a8', walk: 'Walk', speed: 0.75 },
  queen:    { h: 128, tint: '#b89ad8', walk: 'Walk', speed: 0.6, glow: '#7a2aff' },
  charger:  { h: 136, tint: '#a8805a', walk: 'Walk', speed: 0.55, glow: '#ff5a1a' },
  spewer:   { h: 124, tint: '#c8d860', walk: 'Walk', speed: 0.5, glow: '#9aff2a' },
  howler:   { h: 54, tint: '#c8a8e8', walk: 'Walk', speed: 0.95 },
  shield:   { h: 56, tint: '#a8aa98', walk: 'Walk', speed: 0.7 },
  burrower: { h: 46, tint: '#d8b080', walk: 'Run', speed: 1.1 },
};

function makeZombie(kind, elite) {
  const t = ZOMBIE_TYPES[kind];
  const tint = new THREE.Color(elite ? '#ffd24a' : t.tint);
  if (kind === 'walker' && !elite) tint.offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.12);
  const a = makeActor(ASSETS.zombie, t.h * (elite ? 1.2 : 1), tint);
  a.kind = kind; a.type = t; a.elite = elite;
  if (elite) { a.keepEmissive = false; for (const m of a.mats) { m.emissive.set('#8a5a00'); m.emissiveIntensity = 0.35; } }
  if (kind === 'armored') { // casque anti-émeute + plastron
    const helm = new THREE.Group();
    const dome = mesh(G.hemi(6.8), mat('#2a3038', { r: 0.35, m: 0.6 })); helm.add(dome);
    const visor = mesh(G.box(9, 3, 1), new THREE.MeshStandardMaterial({ color: '#4a6a8a', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.7 })); visor.position.set(0, -1.5, 5.5); helm.add(visor);
    helm.position.set(0, 8, 0);
    attachToBone(a, 'Head', helm);
    const plate = mesh(G.box(13, 11, 4), mat('#3a424c', { r: 0.4, m: 0.6 })); plate.position.set(0, 4, 5);
    attachToBone(a, 'Torso', plate) || a.root.add(plate);
  }
  if (kind === 'bomber') { // charge explosive lumineuse sur le ventre
    const bellyMat = new THREE.MeshStandardMaterial({ color: '#ff9a3a', roughness: 0.3, emissive: '#ff5a10', emissiveIntensity: 1.2 });
    const belly = mesh(G.sphere(8), bellyMat, false);
    belly.position.set(0, 2, 6);
    attachToBone(a, 'Abdomen', belly) || a.root.add(belly);
    a.belly = belly; a.bellyMat = bellyMat; a.fuse = true;
  }
  if (kind === 'brute') { // casque de chantier
    const hat = new THREE.Group();
    const dome = mesh(G.hemi(6.5), mat('#ffc21a', { r: 0.45 })); hat.add(dome);
    const brim = mesh(G.cyl(8, 8, 0.6, 18), mat('#e8a810', { r: 0.45 })); brim.position.y = 0.2; hat.add(brim);
    hat.position.set(0, 9, 0);
    a.hat = hat; attachToBone(a, 'Head', hat);
  }
  if (kind === 'spitter') { // ventre d'acide luminescent
    const bellyMat = new THREE.MeshStandardMaterial({ color: '#c6d65a', roughness: 0.35, emissive: '#7aff2a', emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
    const belly = mesh(G.sphere(9), bellyMat, false);
    belly.position.set(0, 2, 6);
    attachToBone(a, 'Abdomen', belly) || a.root.add(belly);
    a.belly = belly; a.bellyMat = bellyMat;
  }
  if (kind === 'behemoth') { for (const m of a.mats) { m.emissive.set('#3a8a10'); m.emissiveIntensity = 0.25; } }
  if (kind === 'queen') { // couronne de pointes osseuses + lueur violette
    const crown = new THREE.Group(), bone = mat('#e8dcc8', { r: 0.6 });
    for (let i = 0; i < 7; i++) { const sp = mesh(new THREE.ConeGeometry(1.2, 6 + (i % 2) * 3, 6), bone); const an = i / 7 * TAU; sp.position.set(Math.cos(an) * 5, 3, Math.sin(an) * 5); sp.rotation.set(Math.sin(an) * 0.3, 0, -Math.cos(an) * 0.3); crown.add(sp); }
    crown.position.set(0, 8, 0); attachToBone(a, 'Head', crown);
  }
  if (kind === 'charger') { // casque à cornes + plaques d'épaule
    const helm = new THREE.Group(), iron = mat('#3a3430', { r: 0.4, m: 0.6 }), horn = mat('#d8ccb0', { r: 0.6 });
    helm.add(mesh(G.hemi(7.2), iron));
    for (const s of [-1, 1]) { const h2 = mesh(new THREE.ConeGeometry(1.8, 10, 8), horn); h2.position.set(s * 7, 2, 1); h2.rotation.set(0, 0, -s * 1.1); helm.add(h2); }
    helm.position.set(0, 7, 0); attachToBone(a, 'Head', helm);
  }
  if (kind === 'spewer') { // énorme ventre de bile
    const bellyMat = new THREE.MeshStandardMaterial({ color: '#b8c84a', roughness: 0.3, emissive: '#7aff2a', emissiveIntensity: 0.7, transparent: true, opacity: 0.94 });
    const belly = mesh(G.sphere(13), bellyMat, false); belly.position.set(0, 2, 8);
    attachToBone(a, 'Abdomen', belly) || a.root.add(belly);
    a.belly = belly; a.bellyMat = bellyMat;
  }
  if (kind === 'howler') { // gorge violette lumineuse + longs cheveux en mèches
    const throat = mesh(G.sphere(3.4, 10, 8), glowMat('#c88aff', 2.4), false); throat.position.set(0, 2, 4);
    attachToBone(a, 'Head', throat) || a.root.add(throat);
    for (let i = 0; i < 5; i++) { const s = mesh(G.box(1, 9, 1), mat('#2a1a30', { r: 0.9 })); s.position.set(-4 + i * 2, 1, -4); s.rotation.x = 0.4; attachToBone(a, 'Head', s); }
  }
  if (kind === 'shield') { // bouclier anti-émeute tenu devant (dans le repère du zombie : avant = +z)
    const sh = new THREE.Group(), plate = mesh(G.box(22, 30, 2), new THREE.MeshStandardMaterial({ color: '#2a3036', roughness: 0.35, metalness: 0.5 }));
    const glass = mesh(G.box(14, 6, 2.2), new THREE.MeshStandardMaterial({ color: '#6a8aa8', roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.7 })); glass.position.y = 9;
    const txt = mesh(G.box(16, 3, 2.3), mat('#e8e8e8', { r: 0.6 })); txt.position.y = -2;
    sh.add(plate, glass, txt); sh.position.set(0, 20, 13); a.root.add(sh); a.shieldObj = sh;
  }
  if (kind === 'burrower') { // couvert de sable, griffes
    for (const m of a.mats) m.color.lerp(new THREE.Color('#c8a070'), 0.35);
  }
  if (t.glow) { for (const m of a.mats) { m.emissive.set(t.glow); m.emissiveIntensity = 0.2; } }
  return a;
}

/* =====================================================================
   DÉCOR
   ===================================================================== */
function jerseyGeometry(len) {
  return geo(`jersey${len}`, () => {
    const sh = new THREE.Shape();
    sh.moveTo(-6.5, 0); sh.lineTo(6.5, 0); sh.lineTo(5.5, 3); sh.lineTo(2.6, 6.5); sh.lineTo(2.1, 17); sh.lineTo(-2.1, 17); sh.lineTo(-2.6, 6.5); sh.lineTo(-5.5, 3); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.5, bevelSegments: 1 });
    g.translate(0, 0, -len / 2);
    return g;
  });
}
function car(color, R) {
  const g = new THREE.Group(), paint = mat(color, { r: 0.55, m: 0.3 }), rust = mat('#7a3e1e', { r: 0.9 });
  const body = mesh(G.box(44, 11, 21), paint, true, true); body.position.y = 9; g.add(body);
  const cab = mesh(G.box(24, 9, 19), paint, true, true); cab.position.set(-3, 19, 0); g.add(cab);
  const glass = mat('#1a2026', { r: 0.15, m: 0.4 });
  for (const z of [-9.6, 9.6]) { const w = mesh(G.box(20, 6, 0.6), glass); w.position.set(-3, 19.5, z); g.add(w); }
  const ws = mesh(G.box(0.6, 6.5, 16), glass); ws.position.set(9.2, 19.5, 0); ws.rotation.z = 0.35; g.add(ws);
  for (let i = 0; i < 4; i++) { const r = mesh(G.box(6 + R() * 8, 0.4, 4 + R() * 6), rust); r.position.set(-16 + R() * 32, 14.7, -8 + R() * 16); g.add(r); }
  const tire = mat('#1e1c1a', { r: 0.95 });
  for (const [x, z] of [[-14, -11], [14, -11], [-14, 11], [14, 11]]) { const w = mesh(G.cyl(5, 5, 4, 14), tire); w.rotation.x = Math.PI / 2; w.position.set(x, 4.2, z); g.add(w); }
  const bumper = mesh(G.box(2, 3, 20), mat('#9a9890', { m: 0.6, r: 0.4 })); bumper.position.set(22.5, 6, 0); g.add(bumper);
  return g;
}
function barrel(color) {
  const g = new THREE.Group();
  const b = mesh(G.cyl(5, 5, 13, 16), mat(color, { r: 0.6, m: 0.3 }), true, true); b.position.y = 6.5; g.add(b);
  for (const y of [3, 10]) { const r = mesh(G.cyl(5.25, 5.25, 0.8, 16), mat('#3a3430', { m: 0.5, r: 0.5 })); r.position.y = y; g.add(r); }
  return g;
}

/* =====================================================================
   DÉCOR CONSTRUIT PAR CODE : hélicoptères, camions, bus, ambulances, char,
   tentes, mirador, caddies, cônes… (low-poly, dans le style des modèles CC0)
   Chaque objet est « cuit » : ses pièces sont fusionnées par matériau
   (1 appel de dessin par matériau au lieu d'un par pièce).
   ===================================================================== */
function bake(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map(), keep = [];
  group.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.keep) { keep.push(o); return; }
    let gg = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (gg.index) gg = gg.toNonIndexed();
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(gg);
  });
  const out = new THREE.Group();
  for (const [m, list] of byMat) out.add(mesh(mergeGeometries(list, false), m, !m.transparent, true));
  for (const o of keep) { o.parent.remove(o); out.add(o); }
  return out;
}
const pm = (c, o) => mat(c, o);
function box(gr, w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) { const o = mesh(G.box(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); gr.add(o); return o; }
function cyl(gr, rt, rb, h, m, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) { const o = mesh(G.cyl(rt, rb, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); gr.add(o); return o; }
function wheels(gr, w, zs, r = 6) { const t = pm('#1e1c1a', { r: 0.95 }); for (const z of zs) for (const s of [-1, 1]) cyl(gr, r, r, 4, t, s * (w / 2 - 1), r, z, 0, 0, Math.PI / 2, 12); }

/** Hélicoptère militaire écrasé (ou médical : blanc à croix rouge) — longueur selon z */
function propHeli(w, d, opt) {
  const gr = new THREE.Group(), body = pm(opt.medic ? '#e8e4dc' : '#4a5a3a', { r: 0.6, m: 0.2 }), dark = pm('#22241f', { r: 0.6, m: 0.4 }), glass = pm('#1a2a30', { r: 0.15, m: 0.5 });
  const L = d, k = w / 70;
  box(gr, 30 * k, 26 * k, L * 0.45, body, 0, 16 * k, L * 0.08);
  box(gr, 26 * k, 20 * k, L * 0.14, glass, 0, 18 * k, L * 0.33, -0.25);
  cyl(gr, 5 * k, 8 * k, L * 0.42, body, 0, 22 * k, -L * 0.26, Math.PI / 2 - 0.08);
  box(gr, 2 * k, 16 * k, 10 * k, body, 0, 30 * k, -L * 0.47);
  // pales du rotor tordues
  const blade = pm('#2a2c28', { r: 0.5, m: 0.4 });
  cyl(gr, 3 * k, 3 * k, 5 * k, dark, 0, 32 * k, L * 0.06);
  box(gr, 4 * k, 0.8, L * 0.55, blade, 0, 34 * k, L * 0.06 + L * 0.27, 0.12, 0.3, 0.05);
  box(gr, L * 0.5, 0.8, 4 * k, blade, -L * 0.2, 31 * k, L * 0.02, 0, 0.5, -0.35);
  box(gr, 4 * k, 0.8, L * 0.35, blade, 8 * k, 6 * k, -L * 0.1, 1.1, 0.8, 0.2); // pale tombée au sol
  // patins
  for (const s of [-1, 1]) { box(gr, 2 * k, 2 * k, L * 0.42, dark, s * 16 * k, 2, L * 0.06); }
  if (opt.medic) { const red = pm('#c8201a', { r: 0.6 }); for (const s of [-1, 1]) { box(gr, 0.6, 10 * k, 3 * k, red, s * 15.2 * k, 17 * k, L * 0.05); box(gr, 0.6, 3 * k, 10 * k, red, s * 15.2 * k, 17 * k, L * 0.05); } }
  else { const star = pm('#d8d2c6', { r: 0.7 }); for (const s of [-1, 1]) box(gr, 0.6, 6 * k, 6 * k, star, s * 15.2 * k, 18 * k, L * 0.0, 0, 0, Math.PI / 4); }
  gr.rotation.z = opt.medic ? -0.08 : 0.22; // posé de travers après le crash
  const g2 = new THREE.Group(); g2.add(gr); return g2;
}
/** Bus scolaire (ou carcasse calcinée) */
function propBus(w, d, opt) {
  const gr = new THREE.Group(), paint = pm(opt.burnt ? '#3a2e26' : '#e8a818', { r: 0.6, m: 0.1 }), black = pm('#1e1c1a', { r: 0.8 }), win = pm(opt.burnt ? '#120e0c' : '#1a2228', { r: 0.2, m: 0.4 });
  box(gr, w - 2, 32, d - 6, paint, 0, 22, 0);
  box(gr, w - 4, 10, 20, paint, 0, 14, d / 2 - 8);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) box(gr, 0.6, 10, (d - 30) / 8, win, s * (w / 2 - 0.8), 30, -d / 2 + 18 + i * (d - 30) / 7);
  box(gr, w - 2, 2, d - 6, black, 0, 14, 0);
  if (!opt.burnt) { const stop = pm('#c8201a', { r: 0.6 }); box(gr, 0.6, 7, 7, stop, -(w / 2), 26, d / 2 - 30); }
  wheels(gr, w, [d / 2 - 22, -d / 2 + 26], 7);
  return gr;
}
/** Ambulance */
function propAmbulance(w, d) {
  const gr = new THREE.Group(), white = pm('#ecebe6', { r: 0.5, m: 0.1 }), red = pm('#c8201a', { r: 0.6 }), glass = pm('#1a2228', { r: 0.2, m: 0.4 });
  box(gr, w - 2, 30, d * 0.62, white, 0, 21, -d * 0.16);
  box(gr, w - 4, 20, d * 0.3, white, 0, 16, d * 0.32);
  box(gr, w - 5, 9, 2, glass, 0, 22, d * 0.47, -0.3);
  for (const s of [-1, 1]) { box(gr, 0.6, 4, d * 0.6, red, s * (w / 2 - 1), 22, -d * 0.16); box(gr, 0.6, 9, 3, red, s * (w / 2 - 1), 28, -d * 0.2); box(gr, 0.6, 3, 9, red, s * (w / 2 - 1), 28, -d * 0.2); }
  const bar = box(gr, 16, 3, 5, pm('#3a6aff', { r: 0.3, e: '#1a3aff', ei: 0.8 }), 0, 37.5, d * 0.1);
  wheels(gr, w, [d * 0.3, -d * 0.32], 6);
  void bar; return gr;
}
/** Semi-remorque */
function propSemi(w, d) {
  const gr = new THREE.Group(), cab = pm('#a8321e', { r: 0.5, m: 0.2 }), trailer = pm('#c9c4b8', { r: 0.8 }), rust = pm('#7a4a2a', { r: 0.9 }), glass = pm('#1a2228', { r: 0.2, m: 0.4 });
  box(gr, w - 2, 30, d * 0.2, cab, 0, 22, d * 0.39);
  box(gr, w - 6, 9, 2, glass, 0, 30, d * 0.49, -0.15);
  box(gr, w, 40, d * 0.7, trailer, 0, 30, -d * 0.12);
  for (let i = 0; i < 5; i++) box(gr, w + 0.4, 6 + i * 2, 10 + i * 4, rust, 0, 14 + i * 5, -d * 0.3 + i * 18);
  box(gr, 1, 30, d * 0.3, pm('#5a5650', { r: 0.9 }), w / 2 + 0.3, 30, -d * 0.2); // bâche arrachée
  wheels(gr, w, [d * 0.4, -d * 0.3, -d * 0.4], 7);
  gr.rotation.z = 0.04;
  return gr;
}
/** Camion-citerne couché sur le flanc */
function propTanker(w, d) {
  const gr = new THREE.Group(), cab = pm('#e8e4dc', { r: 0.5 }), tank = pm('#c8c8c4', { r: 0.35, m: 0.6 }), stripe = pm('#e8a818', { r: 0.6 });
  box(gr, w - 2, 28, d * 0.2, cab, 0, 20, d * 0.4);
  cyl(gr, w / 2, w / 2, d * 0.72, tank, 0, w / 2 + 4, -d * 0.1, Math.PI / 2, 0, 0, 16);
  cyl(gr, w / 2 + 0.3, w / 2 + 0.3, 6, stripe, 0, w / 2 + 4, -d * 0.1, Math.PI / 2, 0, 0, 16);
  wheels(gr, w, [d * 0.42, -d * 0.3, -d * 0.4], 7);
  const g2 = new THREE.Group(); gr.rotation.z = Math.PI / 2 * 0.92; gr.position.set(-w * 0.25, 4, 0); g2.add(gr); return g2;
}
/** Camion militaire bâché */
function propArmy(w, d) {
  const gr = new THREE.Group(), olive = pm('#4a5a3a', { r: 0.8 }), canvas = pm('#6a7050', { r: 1 }), glass = pm('#1a2228', { r: 0.2, m: 0.4 });
  box(gr, w - 4, 26, d * 0.26, olive, 0, 20, d * 0.36);
  box(gr, w - 8, 9, 2, glass, 0, 26, d * 0.49, -0.1);
  box(gr, w, 6, d * 0.68, olive, 0, 12, -d * 0.12);
  const tarp = mesh(new THREE.CylinderGeometry(w / 2, w / 2, d * 0.66, 12, 1, false, 0, Math.PI), canvas); tarp.rotation.set(Math.PI / 2, Math.PI / 2, 0); tarp.position.set(0, 15, -d * 0.12); tarp.scale.set(1, 1, 0.9); gr.add(tarp);
  const white = pm('#d8d2c6', { r: 0.7 }); for (const s of [-1, 1]) box(gr, 0.6, 7, 7, white, s * (w / 2 - 1.5), 22, d * 0.36, 0, 0, Math.PI / 4);
  wheels(gr, w, [d * 0.36, -d * 0.2, -d * 0.36], 7);
  return gr;
}
/** Char d'assaut abandonné */
function propTank(w, d) {
  const gr = new THREE.Group(), olive = pm('#59603f', { r: 0.8, m: 0.2 }), dark = pm('#2a2c24', { r: 0.9 });
  box(gr, w, 16, d, olive, 0, 14, 0);
  for (const s of [-1, 1]) box(gr, 12, 14, d + 6, dark, s * (w / 2 - 4), 8, 0);
  box(gr, w * 0.6, 12, d * 0.45, olive, 0, 28, -d * 0.05, 0, 0.5, 0);
  cyl(gr, 1.8, 2.2, d * 0.6, dark, Math.sin(0.5) * d * 0.3, 29, Math.cos(0.5) * d * 0.3, Math.PI / 2 - 0.1, 0, 0, 10).rotation.y = 0.5;
  return gr;
}

/** Détails sans collision */
function decorProp(k, opt, R) {
  const gr = new THREE.Group();
  if (k === 'carts') {
    const wire = pm('#9a9a9a', { r: 0.4, m: 0.8 });
    for (let i = 0; i < 3; i++) { const c = new THREE.Group(); box(c, 10, 8, 14, wire, 0, 9, 0); box(c, 10, 1, 1, wire, 0, 14, -8); c.position.set((R() - 0.5) * 30, 0, (R() - 0.5) * 30); c.rotation.set(0, R() * 6, i === 2 ? Math.PI / 2 : 0); if (i === 2) c.position.y = 5; gr.add(c); }
  } else if (k === 'cones') {
    const or = pm('#ff6a1a', { r: 0.6 }), wh = pm('#eeeae0', { r: 0.6 });
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 22; cyl(gr, 1, 4, 11, or, x, 5.5, (R() - 0.5) * 6, i === 3 ? Math.PI / 2 : 0, 0, 0, 8); cyl(gr, 2.4, 3, 2, wh, x, 6, 0, 0, 0, 0, 8); }
  } else if (k === 'bags') {
    const b = pm('#1c1c1e', { r: 0.35 }); for (let i = 0; i < 6; i++) { const s = mesh(G.sphere(5 + R() * 2, 8, 6), b); s.scale.y = 0.7; s.position.set((R() - 0.5) * 26, 3, (R() - 0.5) * 20); gr.add(s); }
  } else if (k === 'bodybags') {
    const b = pm('#2a3a2a', { r: 0.5 }); for (let i = 0; i < 4; i++) { const s = mesh(G.capsule(4, 14), b); s.rotation.set(Math.PI / 2, 0, (R() - 0.5) * 0.4); s.position.set(i * 12 - 18, 3.5, (R() - 0.5) * 6); gr.add(s); }
  } else if (k === 'crates') {
    const wood = pm(opt.military ? '#4a5a3a' : '#9a6a3a', { r: 0.9 }), dk = pm('#2a2622', { r: 0.9 });
    for (let i = 0; i < 5; i++) { const s = 10 + R() * 4; const c = box(gr, s, s, s, wood, (i % 3) * 13 - 13, s / 2 + (i > 2 ? 14 : 0), (i % 2) * 4, 0, R() * 0.4); void c; }
    box(gr, 2, 1, 30, dk, 0, 0.5, -12);
  } else if (k === 'tent') {
    const cl = pm(opt.color, { r: 1 }), geo2 = new THREE.ConeGeometry(30, 34, 4, 1); geo2.rotateY(Math.PI / 4);
    const t = mesh(geo2, cl); t.scale.set(1, 1, 1.4); t.position.y = 17; gr.add(t);
    box(gr, 10, 16, 1, pm('#1a1612', { r: 1 }), 0, 8, 29);
    if (opt.medic) { const red = pm('#c8201a', { r: 0.6 }); box(gr, 1, 8, 2.5, red, 0, 22, 18, -0.6); box(gr, 8, 2.5, 1, red, 0, 22, 18.5, -0.6); }
  } else if (k === 'watchtower') {
    const wood = pm('#6a5038', { r: 0.9 });
    for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) box(gr, 2.5, 80, 2.5, wood, x, 40, z);
    box(gr, 34, 3, 34, wood, 0, 80, 0);
    for (const s of [-1, 1]) { box(gr, 34, 12, 2, wood, 0, 87, s * 16); box(gr, 2, 12, 34, wood, s * 16, 87, 0); }
    const roof = mesh(new THREE.ConeGeometry(28, 14, 4), pm('#4a3a2a', { r: 1 })); roof.rotation.y = Math.PI / 4; roof.position.y = 104; gr.add(roof);
    for (const x of [-6, 6]) box(gr, 1.5, 1.5, 2, wood, x, 95, 0);
  } else if (k === 'campfire' || k === 'barrelfire') {
    if (k === 'campfire') { const st = pm('#6a6458', { r: 1, flat: true }); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, s = mesh(new THREE.DodecahedronGeometry(3, 0), st); s.position.set(Math.cos(a) * 10, 1.5, Math.sin(a) * 10); gr.add(s); } const lg = pm('#3a2a1a', { r: 1 }); box(gr, 16, 2.5, 2.5, lg, 0, 2, 0, 0, 0.6); box(gr, 16, 2.5, 2.5, lg, 0, 3, 0, 0, -0.6); }
    else { cyl(gr, 7, 7, 18, pm('#5a3a2a', { r: 0.8, m: 0.4 }), 0, 9, 0, 0, 0, 0, 14); }
    const ember = mesh(G.sphere(k === 'campfire' ? 4 : 5, 8, 6), glowMat('#ff7a2a', 3), false); ember.position.y = k === 'campfire' ? 3 : 18; ember.userData.keep = true; gr.add(ember);
  } else if (k === 'mattress') {
    box(gr, 30, 5, 44, pm('#c8b89a', { r: 1 }), 0, 2.5, 0); box(gr, 12, 3, 8, pm('#8a8070', { r: 1 }), 0, 6, -14);
  } else if (k === 'tires') {
    const rub = pm('#1c1a18', { r: 0.95 }); for (let i = 0; i < 5; i++) { const t = mesh(G.torus(5.5, 2.4), rub); t.rotation.x = Math.PI / 2; t.position.set((i % 3) * 13 - 13, 2.4 + (i > 2 ? 4.6 : 0), Math.floor(i / 3) * 4); gr.add(t); }
  } else if (k === 'sign') {
    const pole = pm('#5a5650', { r: 0.6, m: 0.5 }); box(gr, 2, 40, 2, pole, -22, 20, 0); box(gr, 2, 40, 2, pole, 22, 20, 0);
  }
  return gr;
}
/** Établi d'armurier : table, étau, caisse à outils, panneau perforé, lampe (face avant = +z) */
function propBench(w, d) {
  const gr = new THREE.Group(), wood = pm('#7a5434', { r: 0.85 }), steel = pm('#3a3c40', { r: 0.5, m: 0.6 }), board = pm('#9a7a54', { r: 0.95 }), dk = pm('#1c1c1e', { r: 0.6, m: 0.4 });
  box(gr, w, 2.5, d, wood, 0, 20, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(gr, 2.5, 19, 2.5, steel, x * (w / 2 - 3), 9.5, z * (d / 2 - 3));
  box(gr, w - 6, 1.5, d - 6, steel, 0, 6, 0);
  box(gr, w, 30, 1.5, board, 0, 36, -d / 2 + 1);                       // panneau perforé
  for (let i = 0; i < 5; i++) box(gr, 1.2, 8 + (i % 2) * 4, 0.8, dk, -w / 2 + 8 + i * 6, 38, -d / 2 + 2.2, 0, 0, (i - 2) * 0.15); // outils accrochés
  box(gr, 14, 2, 0.8, dk, w / 2 - 12, 44, -d / 2 + 2.2); box(gr, 2, 7, 0.8, dk, w / 2 - 18, 40, -d / 2 + 2.2);
  box(gr, 6, 5, 5, pm('#2a5a8a', { r: 0.5, m: 0.4 }), -w / 2 + 8, 24, 4); box(gr, 1.5, 3, 6, steel, -w / 2 + 11.5, 25, 4); // étau
  box(gr, 11, 6, 7, pm('#b8281e', { r: 0.5, m: 0.2 }), w / 2 - 9, 24.2, 3); box(gr, 6, 1, 1, dk, w / 2 - 9, 27.8, 3); // caisse à outils
  box(gr, 22, 2, 3, dk, -2, 22.3, 5, 0, 0.12); box(gr, 4, 3, 2, pm('#7a4a28', { r: 0.8 }), -12, 22.6, 4); // fusil démonté
  box(gr, 9, 5, 7, pm('#4a5a3a', { r: 0.9 }), -10, 9.3, 0); box(gr, 8, 4, 6, pm('#4a5a3a', { r: 0.9 }), 8, 8.8, 2); // caisses de munitions
  box(gr, 1.2, 16, 1.2, steel, w / 2 - 4, 29, -d / 2 + 4); box(gr, 1.2, 1.2, 10, steel, w / 2 - 4, 37, -d / 2 + 8.5); // lampe d'atelier
  const bulb = mesh(G.sphere(2, 10, 8), glowMat('#ffd28a', 3), false); bulb.position.set(w / 2 - 4, 35.5, -d / 2 + 13); bulb.userData.keep = true; gr.add(bulb);
  return gr;
}
const PROPS = { p_bench: propBench, p_heli: propHeli, p_bus: propBus, p_ambulance: propAmbulance, p_semi: propSemi, p_tanker: propTanker, p_army: propArmy, p_tank: propTank };

/** Hélicoptère en vol (passe au-dessus de la carte de temps en temps) */
function flyingHeli() {
  const gr = new THREE.Group(), body = pm('#3e4a34', { r: 0.6, m: 0.3 }), dark = pm('#1e201c', { r: 0.6, m: 0.4 }), glass = pm('#1a2a30', { r: 0.15, m: 0.6 });
  box(gr, 26, 24, 64, body, 0, 0, 0);
  box(gr, 22, 16, 18, glass, 0, 2, 36, -0.3);
  cyl(gr, 4, 7, 70, body, 0, 4, -60, Math.PI / 2 - 0.05);
  box(gr, 2, 16, 10, body, 0, 12, -94);
  for (const s of [-1, 1]) box(gr, 2, 2, 50, dark, s * 14, -16, 4);
  const baked = bake(gr);
  const rotor = new THREE.Group(), blade = pm('#2a2c28', { r: 0.5 });
  for (let i = 0; i < 4; i++) { const b = mesh(G.box(4, 0.8, 70), blade, false); b.position.z = 35; const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2; arm.add(b); rotor.add(arm); }
  rotor.position.y = 16;
  const tail = new THREE.Group(); for (let i = 0; i < 2; i++) { const b = mesh(G.box(0.6, 16, 2), blade, false); b.rotation.x = i * Math.PI / 2; tail.add(b); } tail.position.set(3, 12, -94);
  const lamp = mesh(G.sphere(2, 8, 6), glowMat('#ff2a1a', 4), false); lamp.position.set(0, -12, 10);
  baked.add(rotor, tail, lamp);
  baked.userData = { rotor, tail, lamp };
  return baked;
}

/* =====================================================================
   PARTICULES (2 nuages de points : normal + additif) — un seul appel de dessin chacun
   ===================================================================== */
class PointCloud {
  constructor(cap, additive, tex) {
    this.cap = cap; this.n = 0;
    const gm = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    gm.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    gm.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    gm.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    gm.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { map: { value: tex }, scale: { value: 800 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 pcolor; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC=pcolor; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ float a=texture2D(map,gl_PointCoord).a*vA; if(a<0.004) discard; gl_FragColor=vec4(vC,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(gm, m); this.points.frustumCulled = false; this.gm = gm;
  }
  begin() { this.n = 0; }
  add(x, y, z, color, size, alpha) {
    if (this.n >= this.cap) return;
    const i = this.n++, c = color;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = size; this.alpha[i] = alpha;
  }
  end() {
    this.gm.setDrawRange(0, this.n);
    for (const k of ['position', 'pcolor', 'size', 'alpha']) this.gm.attributes[k].needsUpdate = true;
  }
}
const _colCache = {};
const col = hex => _colCache[hex] || (_colCache[hex] = new THREE.Color(hex));

/* =====================================================================
   RENDER
   ===================================================================== */
const FONT = '"Segoe UI Black", "Arial Black", Impact, system-ui, sans-serif';
const FONT_UI = '"Segoe UI", system-ui, -apple-system, sans-serif';

const Render = {
  init(canvas) {
    this.c = canvas;
    this.hud = document.getElementById('hud');
    this.h = this.hud.getContext('2d');
    this.probe = document.getElementById('safe-probe');

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1.25 : 2));
    r.shadowMap.enabled = !LOW; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#d9b88c');
    scene.fog = new THREE.Fog('#d9b88c', 900, 2400);
    this.camera = new THREE.PerspectiveCamera(36, 1, 10, 6000);
    this.camTarget = new THREE.Vector3();


    this.buildLights();
    this.gunM = gunMats(); // matériaux des armes, partagés jeu / établi (peintures)
    this.gunMatList = Object.values(this.gunM).flatMap(m => [m.metal, m.wood]);
    this.buildWorld();
    this.buildPools();

    if (!LOW) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.45, 0.9);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.enemyModels = new Set();
    this.dying = [];
    this.lastT = 0;
    this.resize();
  },

  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#ffeacc', '#8a6440', 1.15); s.add(this.hemi);
    // lampe torche de la survivante + halo autour d'elle (la nuit seulement)
    const torch = this.torch = new THREE.SpotLight('#fff0d0', 0, 520, 0.5, 0.55, 0);
    s.add(torch); s.add(torch.target);
    this.aura = new THREE.PointLight('#ffd9a0', 0, 170, 0); s.add(this.aura);
    this.env = { night: 0, storm: 0 };
    const sun = this.sun = new THREE.DirectionalLight('#ffd7a0', 2.6);
    sun.position.set(-380, 620, 300); sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    const sz = MOBILE ? 1024 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera; sc.left = -560; sc.right = 560; sc.top = 560; sc.bottom = -560; sc.near = 50; sc.far = 1600;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    s.add(sun); s.add(sun.target);
    const fill = this.fill = new THREE.DirectionalLight('#9ec4ff', 0.35); fill.position.set(400, 300, -300); s.add(fill);
  },

  buildWorld() {
    const s = this.scene, R = rng(42), rnd = (a, b) => a + R() * (b - a);
    // terrain : plat sur la carte, dunes autour
    const gGeo = new THREE.PlaneGeometry(W + 3600, H + 3600, 170, 140); gGeo.rotateX(-Math.PI / 2);
    const p = gGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = Math.max(Math.abs(x) - W / 2, Math.abs(z) - H / 2);
      const k = U.clamp((d - 60) / 500, 0, 1);
      const n = Math.sin(x * 0.006 + 1.3) * Math.cos(z * 0.005) * 0.6 + Math.sin(x * 0.013 + z * 0.009) * 0.4;
      p.setY(i, k * k * (n * 70 + 40) - 0.4);
    }
    gGeo.computeVertexNormals();
    const sandT = sandTexture(); sandT.repeat.set((W + 3600) / 1050, (H + 3600) / 1050);
    s.add(mesh(gGeo, new THREE.MeshStandardMaterial({ map: sandT, roughness: 1 }), false, true));

    // sols des zones (parking, parvis, rues défoncées, béton militaire)
    const texFor = { parking: parkingTexture, plaza: plazaTexture, ruins: asphaltTexture, base: concreteTexture };
    for (const z of MAP.zones) {
      const w = z.x1 - z.x0, h = z.y1 - z.y0, t = texFor[z.ground]();
      t.repeat.set(w / 800, h / 800);
      const m = mesh(new THREE.PlaneGeometry(w + 2, h + 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }), false, true);
      m.rotation.x = -Math.PI / 2; m.position.set(toX((z.x0 + z.x1) / 2), 0.3, toZ((z.y0 + z.y1) / 2)); s.add(m);
    }

    // fondu entre les sols : bandes de sable soufflé le long des jonctions et du bord de la carte
    const strip = canvasTex(256, (x, S) => {
      const R2 = rng(91);
      for (let y = 0; y < S; y++) { // profil : opaque au centre, transparent sur les bords
        const v = 1 - Math.abs(y / S - 0.5) * 2, a = Math.pow(U.clamp(v * 1.25, 0, 1), 1.6);
        x.fillStyle = `rgba(206,164,108,${a * 0.92})`; x.fillRect(0, y, S, 1);
      }
      for (let i = 0; i < 260; i++) { // bords déchiquetés + rides
        const px = R2() * S, py = R2() * S, r = 4 + R2() * 18, edge = Math.abs(py / S - 0.5) * 2;
        const gg = x.createRadialGradient(px, py, 0, px, py, r);
        const c0 = R2() < 0.5 ? `rgba(226,186,130,${0.5 * (1 - edge)})` : `rgba(160,118,70,${0.3 * (1 - edge)})`;
        gg.addColorStop(0, c0); gg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gg; x.fillRect(px - r, py - r, r * 2, r * 2);
      }
      for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(120,84,46,${R2() * 0.25})`; x.fillRect(R2() * S, R2() * S, 1.2, 1.2); }
    });
    strip.wrapT = THREE.ClampToEdgeWrapping;
    const stripMat = new THREE.MeshStandardMaterial({ map: strip, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
    const sandStrip = (x0, y0, x1, y1, width) => {
      const len = Math.hypot(x1 - x0, y1 - y0), horiz = Math.abs(y1 - y0) < 1;
      const t = strip.clone(); t.needsUpdate = true; t.repeat.set(len / 260, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width), stripMat.clone()); m.material.map = t;
      m.rotation.x = -Math.PI / 2; if (!horiz) m.rotation.z = Math.PI / 2;
      m.position.set(toX((x0 + x1) / 2), 0.36, toZ((y0 + y1) / 2)); m.receiveShadow = true; m.renderOrder = 1;
      s.add(m);
    };
    for (const sp of MAP.separators) sandStrip(sp.x0, sp.y0, sp.x1, sp.y1, 170);
    sandStrip(0, 0, W, 0, 220); sandStrip(0, H, W, H, 220); sandStrip(0, 0, 0, H, 220); sandStrip(W, 0, W, H, 220);
    // dunettes de sable au pied des murs (un seul objet instancié : ~200 dunettes, 1 appel de dessin)
    const duneMats = [];
    const dunes = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / 55), horiz = Math.abs(y1 - y0) < 1;
      for (let i = 0; i < n; i++) {
        const k = (i + R()) / n, px = x0 + (x1 - x0) * k, py = y0 + (y1 - y0) * k, side = R() < 0.5 ? -1 : 1, off = side * rnd(14, 26), r = rnd(10, 22);
        const o = new THREE.Object3D();
        o.scale.set(horiz ? r * 2.2 : r * 0.9, r * 0.28, horiz ? r * 0.9 : r * 2.2);
        o.position.set(toX(px + (horiz ? 0 : off)), -r * 0.08, toZ(py + (horiz ? off : 0)));
        o.updateMatrix(); duneMats.push(o.matrix.clone());
      }
    };
    for (const sp of MAP.separators) dunes(sp.x0, sp.y0, sp.x1, sp.y1);
    dunes(0, 14, W, 14); dunes(0, H - 14, W, H - 14); dunes(14, 0, 14, H); dunes(W - 14, 0, W - 14, H);
    const duneIM = new THREE.InstancedMesh(G.sphere(1, 10, 6), mat('#cca067', { r: 1 }), duneMats.length);
    duneMats.forEach((m, i) => duneIM.setMatrixAt(i, m)); duneIM.receiveShadow = true; s.add(duneIM);

    // barrières de béton (instanciées) : bord de la carte + séparations entre zones
    const slots = [];
    const run = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / 36)), horiz = Math.abs(y1 - y0) < 1;
      for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; slots.push([x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, horiz ? Math.PI / 2 : 0]); }
    };
    const e = 8;
    // bord bas : entrée du parking laissée ouverte (la voiture arrive par là)
    run(0, e, W, e); run(0, H - e, MAP.car.x - 70, H - e); run(MAP.car.x + 70, H - e, W, H - e); run(e, 0, e, H); run(W - e, 0, W - e, H);
    for (const sp of MAP.separators) {
      const horiz = sp.y0 === sp.y1, [g0, g1] = sp.gate;
      if (horiz) { run(sp.x0, sp.y0, g0, sp.y0); run(g1, sp.y0, sp.x1, sp.y0); } else { run(sp.x0, sp.y0, sp.x0, g0); run(sp.x0, g1, sp.x0, sp.y1); }
    }
    const conc = [mat('#c2baad', { r: 0.95 }), mat('#b3ab9e', { r: 0.95 }), mat('#a8483a', { r: 0.85 }), mat('#d8d2c6', { r: 0.9 })];
    const groups = conc.map(() => []);
    for (const sl of slots) groups[Math.floor(R() * conc.length)].push(sl);
    const dummy = new THREE.Object3D();
    groups.forEach((list, ci) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(jerseyGeometry(34), conc[ci], list.length);
      im.castShadow = true; im.receiveShadow = true;
      // à moitié ensablées, légèrement de travers : moins « posées là »
      list.forEach(([x, y, r], i) => { dummy.position.set(toX(x) + rnd(-2.5, 2.5), -rnd(0, 4), toZ(y) + rnd(-2.5, 2.5)); dummy.rotation.set(rnd(-0.05, 0.05), r + rnd(-0.12, 0.12), rnd(-0.05, 0.05)); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      s.add(im);
    });

    // barricades sur les passages fermés (elles sautent quand la zone s'ouvre)
    this.gates = [];
    const stripeRed = mat('#c8321e', { r: 0.6 }), stripeW = mat('#eeeae0', { r: 0.6 }), plank = mat('#8a6a42', { r: 0.9 }), sandbag = mat('#b09a6a', { r: 1 });
    for (const sp of MAP.separators) {
      const horiz = sp.y0 === sp.y1, [g0, g1] = sp.gate, mid = (g0 + g1) / 2, len = g1 - g0;
      const gr = new THREE.Group();
      // barrières rayées rouge/blanc
      for (let k = 0; k < 5; k++) {
        const off = -len / 2 + (k + 0.5) * len / 5, b = mesh(jerseyGeometry(30), k % 2 ? stripeRed : stripeW, true, true);
        b.position.set(off, 0, 0); b.rotation.y = Math.PI / 2 + rnd(-0.1, 0.1); gr.add(b);
      }
      // palissade de planches clouées en croix
      for (let k = 0; k < 4; k++) {
        const pl = mesh(G.box(len / 4 + 8, 5, 2), plank); pl.position.set(-len / 2 + (k + 0.5) * len / 4, 26 + rnd(-2, 2), -4); pl.rotation.z = (k % 2 ? 1 : -1) * 0.35; gr.add(pl);
      }
      for (let k = 0; k < 6; k++) { const sb = mesh(G.capsule(4.5, 9), sandbag, true, true); sb.rotation.z = Math.PI / 2; sb.position.set(-len / 2 + 10 + k * (len - 20) / 5, 4, 12); gr.add(sb); }
      const bar = barrel('#c9a227'); bar.position.set(len / 2 - 14, 0, 14); gr.add(bar);
      // panneau « zone fermée · vague N »
      const z = MAP.zones.find(zz => zz.id === sp.zone);
      const sign = this.makeSign(`⛔ VAGUE ${z.unlock}`, z.name.toUpperCase(), '#ff5a3a');
      sign.position.set(0, 42, 4); sign.scale.setScalar(0.9); gr.add(sign);
      if (horiz) gr.position.set(toX(mid), 0, toZ(sp.y0)); else { gr.position.set(toX(sp.x0), 0, toZ(mid)); gr.rotation.y = Math.PI / 2; }
      s.add(gr);
      this.gates.push({ zone: sp.zone, group: gr });
    }

    // bâtiments (modèles CC0 ajustés à leur emprise) + enseignes des refuges
    this.blds = [];
    this.doors = {};
    const shelterOf = id => Object.entries(SHELTERS).find(([, v]) => v.building === id);
    for (const b of MAP.buildings) {
      const w = b.x1 - b.x0, d = b.y1 - b.y0;
      const root = placeModel(b.model, w, d, b.h, b.tint) || mesh(G.box(w, b.h, d), mat('#9a8a7a'));
      if (b.rot) root.rotation.y = b.rot;
      root.position.set(toX((b.x0 + b.x1) / 2), 0, toZ((b.y0 + b.y1) / 2));
      s.add(root);
      this.blds.push({ b, root, mats: root.userData.mats || [], fade: 1 });
      const sh = shelterOf(b.id);
      if (sh) {
        const [sid, def] = sh, colr = { clinic: '#7dff6a', hospital: '#7dff6a', armory: '#ffc21a', workshop: '#3ad6ff' }[def.type];
        const dp = b.doorPos, door = new THREE.Group();
        const frame = mesh(G.box(40, 34, 3), mat('#2a2622', { r: 0.6, m: 0.4 })); frame.position.set(0, 17, 0); door.add(frame);
        const leaf = mesh(G.box(32, 30, 3.6), mat('#5a6068', { r: 0.4, m: 0.6 })); leaf.position.set(0, 15, 0.5); door.add(leaf);
        const lamp = mesh(G.box(30, 2, 2), glowMat(colr, 2.2), false); lamp.position.set(0, 36, 2); door.add(lamp);
        door.position.set(toX(dp.x), 0, toZ(b.y1) + 1.5);
        s.add(door);
        const sign = this.makeSign(`${def.icon} ${def.name.toUpperCase()}`, def.type === 'armory' ? 'ARMES · MUNITIONS' : def.type === 'workshop' ? 'TOURELLES · PIÈGES' : 'SOINS', colr);
        sign.position.set(toX(dp.x), Math.min(b.h * 0.7, 70), toZ(b.y1) + 3);
        s.add(sign);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(colr).multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false }));
        ring.position.set(toX(dp.x), 0.8, toZ(dp.y)); s.add(ring);
        this.doors[sid] = { ring, leaf, lamp, color: colr, zone: b.zone };
      }
    }

    // obstacles (épaves, conteneurs, citernes)
    this.fires = [];
    for (const pr of MAP.props) {
      const name = pr.model === 'suv_wreck' ? 'suv' : pr.model;
      const o = PROPS[name] ? bake(PROPS[name](pr.w, pr.d, pr)) : placeModel(name, pr.w, pr.d, null, pr.model === 'suv_wreck' ? '#8a6a5a' : null);
      if (!o) continue;
      o.position.set(toX(pr.x), 0, toZ(pr.y)); o.rotation.y = pr.rot;
      s.add(o);
      if (pr.burning) this.fires.push({ x: pr.x, y: pr.y, h: 26, size: 1.4, flame: true });
      if (pr.burnt || pr.medic) this.fires.push({ x: pr.x, y: pr.y, h: 30, size: 1, flame: false });
    }
    // établis : anneau orange au sol + fusil holographique qui tourne au-dessus + enseigne
    this.benchFx = [];
    const holo = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffa030').multiplyScalar(1.6), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const b of BENCHES) {
      const f = Math.sin(b.rot), c = Math.cos(b.rot), fx = b.x + f * 30, fy = b.y + c * 30; // devant l'établi
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a2a').multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false }));
      ring.position.set(toX(fx), 0.8, toZ(fy)); s.add(ring);
      const gh = buildGun('rifle', { metal: holo, wood: holo }); gh.traverse(o => { if (o.isMesh) { o.material = holo; o.castShadow = false; } });
      gh.scale.setScalar(1.15); gh.position.set(toX(b.x), 52, toZ(b.y)); s.add(gh);
      const sign = b.big ? this.makeSign('🔫 ARMURERIE', 'ARMES · PIÈCES · PEINTURES', '#ffc21a') : this.makeSign('🔧 ÉTABLI', 'AMÉLIORER L\'ARME', '#ff9a2a');
      sign.scale.setScalar(b.big ? 0.85 : 0.55); sign.position.set(toX(b.x), b.big ? 78 : 70, toZ(b.y) + 2); s.add(sign);
      if (b.big) gh.scale.setScalar(1.6);
      this.benchFx.push({ b, ring, holo: gh, sign });
    }
    // détails sans collision : caddies, cônes, tentes, mirador, feux, graffitis, panneaux…
    for (const dc of MAP.decor) {
      if (dc.kind === 'graffiti') { s.add(this.makeGraffiti(dc)); continue; }
      const o = bake(decorProp(dc.kind, dc, R));
      o.position.set(toX(dc.x), 0, toZ(dc.y)); o.rotation.y = dc.rot || R() * TAU;
      if (dc.kind === 'sign') { o.rotation.y = 0; const sg = this.makeSign(dc.text, dc.sub, '#ffc21a'); sg.position.set(toX(dc.x), 46, toZ(dc.y) + 1.5); s.add(sg); }
      s.add(o);
      if (dc.kind === 'campfire') this.fires.push({ x: dc.x, y: dc.y, h: 4, size: 0.8, flame: true });
      if (dc.kind === 'barrelfire') this.fires.push({ x: dc.x, y: dc.y, h: 19, size: 0.7, flame: true });
    }
    // corbeaux qui tournoient au-dessus des charniers
    this.crows = [];
    const crowM = new THREE.MeshBasicMaterial({ color: '#141210', side: THREE.DoubleSide });
    for (const c of MAP.crows) for (let i = 0; i < 4; i++) {
      const bird = new THREE.Group();
      for (const sd of [-1, 1]) { const wing = new THREE.Mesh(G.box(9, 0.4, 3.5), crowM); wing.position.x = sd * 4.5; const piv = new THREE.Group(); piv.add(wing); bird.add(piv); }
      bird.add(new THREE.Mesh(G.box(2, 1.6, 6), crowM));
      s.add(bird);
      this.crows.push({ o: bird, cx: c.x, cy: c.y, r: 40 + R() * 50, h: 90 + R() * 60, sp: (0.5 + R() * 0.4) * (R() < 0.5 ? -1 : 1), ph: R() * TAU });
    }
    // hélicoptère qui survole la carte de temps en temps
    this.heli = flyingHeli(); this.heli.visible = false; s.add(this.heli);
    this.heliShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', alphaMap: softDot(64), transparent: true, opacity: 0.35, depthWrite: false }));
    this.heliShadow.scale.set(70, 1, 140); this.heliShadow.visible = false; s.add(this.heliShadow);
    this.flyT = 25; this.fly = null;
    // la voiture de la survivante
    this.carObj = placeModel('suv', MAP.car.w, MAP.car.d, null) || car('#3f6f7a', R);
    this.carObj.userData.lights = [];
    for (const sx of [-14, 14]) { const l = mesh(G.sphere(3, 10, 8), glowMat('#fff2c0', 3), false); l.position.set(sx, 13, 47); this.carObj.add(l); this.carObj.userData.lights.push(l); }
    s.add(this.carObj);

    // station-service : auvent, pompes, totem
    const gs = MAP.gasStation, st = new THREE.Group();
    // matériaux propres à l'auvent : il devient transparent quand la survivante passe dessous / derrière
    const roofM = new THREE.MeshStandardMaterial({ color: '#d8d2c6', roughness: 0.7 }), bandM = new THREE.MeshStandardMaterial({ color: '#c8321e', roughness: 0.6 });
    const pillarM = new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.7 });
    const roof = mesh(G.box(210, 8, 130), roofM, true, true); roof.position.y = 64; st.add(roof);
    const band = mesh(G.box(212, 6, 132), bandM); band.position.y = 58; st.add(band);
    for (const [x, z] of [[-90, -50], [90, -50], [-90, 50], [90, 50]]) { const c2 = mesh(G.box(6, 60, 6), pillarM); c2.position.set(x, 30, z); st.add(c2); }
    this.blds.push({ b: { x0: gs.x - 105, y0: gs.y - 65, x1: gs.x + 105, y1: gs.y + 65, h: 64, under: true }, root: st, mats: [roofM, bandM, pillarM], fade: 1 });
    for (const x of [-40, 40]) { const pump = mesh(G.box(12, 22, 8), mat('#c8321e', { r: 0.5, m: 0.2 })); pump.position.set(x, 11, 0); st.add(pump); const scr = mesh(G.box(8, 6, 8.4), mat('#1a2026', { r: 0.2 })); scr.position.set(x, 17, 0); st.add(scr); }
    st.position.set(toX(gs.x), 0, toZ(gs.y)); s.add(st);
    const pole = mesh(G.box(4, 80, 4), mat('#6a6458')); pole.position.set(toX(gs.x + 150), 40, toZ(gs.y - 70)); s.add(pole);
    const gsign = this.makeSign('⛽ GAZ', 'STATION', '#ffc21a'); gsign.position.set(toX(gs.x + 150), 86, toZ(gs.y - 70)); s.add(gsign);

    // détails sans collision : lampadaires, gravats, arbres morts, sacs de sable
    const lampM = mat('#4a4844', { r: 0.6, m: 0.5 });
    this.lamps = [];
    for (const [x, y] of MAP.lamps) {
      const lp = new THREE.Group();
      const post = mesh(G.cyl(1.4, 2, 80, 8), lampM); post.position.y = 40; lp.add(post);
      const arm = mesh(G.box(22, 2, 2), lampM); arm.position.set(10, 80, 0); lp.add(arm);
      const bulb = mesh(G.box(8, 2, 5), glowMat('#ffe2a0', 0.4), false); bulb.position.set(20, 78.5, 0); lp.add(bulb);
      lp.position.set(toX(x), 0, toZ(y)); lp.rotation.y = x > 1200 ? Math.PI : 0; s.add(lp);
      this.lamps.push(bulb);
    }
    const rubble = [mat('#8a8478', { r: 1, flat: true }), mat('#6a6458', { r: 1, flat: true }), mat('#9a6a4a', { r: 1, flat: true })];
    for (let i = 0; i < 70; i++) {
      const zoneIds = ['slums', 'slums', 'slums', 'base', 'mall'], zid = zoneIds[i % zoneIds.length], z = MAP.zones.find(q => q.id === zid);
      const x = rnd(z.x0 + 40, z.x1 - 40), y = rnd(z.y0 + 40, z.y1 - 40), r = rnd(3, 9);
      const rk = mesh(new THREE.DodecahedronGeometry(r, 0), rubble[i % 3], true, true);
      rk.position.set(toX(x), r * 0.3, toZ(y)); rk.scale.set(rnd(0.8, 1.6), rnd(0.4, 0.9), rnd(0.8, 1.5)); rk.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); s.add(rk);
    }
    for (const [x, y] of MAP.sandbags) {
      for (let k = 0; k < 4; k++) { const sb = mesh(G.capsule(4.5, 9), sandbag, true, true); sb.rotation.set(0, 0.2, Math.PI / 2); sb.position.set(toX(x) + k * 16 - 24, 4 + (k % 2) * 0.5, toZ(y)); s.add(sb); }
    }

    // zones fermées : voile sombre qui se dissipe à l'ouverture
    this.veils = {};
    for (const z of MAP.zones) {
      if (z.unlock <= 1) continue;
      const w = z.x1 - z.x0, h = z.y1 - z.y0;
      const v = new THREE.Mesh(new THREE.BoxGeometry(w - 4, 230, h - 4), new THREE.MeshBasicMaterial({ color: '#0b0907', transparent: true, opacity: 0.6, depthWrite: false }));
      v.position.set(toX((z.x0 + z.x1) / 2), 115, toZ((z.y0 + z.y1) / 2)); v.renderOrder = 5;
      s.add(v); this.veils[z.id] = v;
    }

    // clôture de barbelés autour de la carte
    const postM = mat('#5a4a3a', { r: 0.9 }), wireM = new THREE.LineBasicMaterial({ color: '#3a3430' });
    const fence = (x0, z0, x1, z1) => {
      const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 70), pts = [[], []];
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n, tilt = rnd(-0.12, 0.12);
        const post = mesh(G.cyl(1.1, 1.3, 30, 6), postM); post.position.set(x, 15, z); post.rotation.z = tilt; s.add(post);
        pts[0].push(new THREE.Vector3(x, 13, z)); pts[1].push(new THREE.Vector3(x, 24, z));
      }
      for (const row of pts) s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(row), wireM));
    };
    const fo = 70;
    fence(-W / 2 - fo, -H / 2 - fo, W / 2 + fo, -H / 2 - fo); fence(-W / 2 - fo, H / 2 + fo, W / 2 + fo, H / 2 + fo);
    fence(-W / 2 - fo, -H / 2 - fo, -W / 2 - fo, H / 2 + fo); fence(W / 2 + fo, -H / 2 - fo, W / 2 + fo, H / 2 + fo);

    // décor extérieur : épaves, fûts, pneus, rochers, arbres morts, mesas
    const outside = (minD, maxD) => {
      for (;;) {
        const x = rnd(-W / 2 - maxD, W / 2 + maxD), z = rnd(-H / 2 - maxD, H / 2 + maxD);
        const d = Math.max(Math.abs(x) - W / 2, Math.abs(z) - H / 2);
        if (d > minD && d < maxD) return [x, z];
      }
    };
    const carCols = ['#3f6f7a', '#a8452f', '#c9b38a', '#4a5a3a', '#6a6a70', '#8a7a2a'];
    for (let i = 0; i < 22; i++) {
      const [x, z] = outside(90, 420), c2 = car(carCols[i % carCols.length], R);
      c2.position.set(x, 0, z); c2.rotation.y = rnd(0, TAU);
      if (R() < 0.2) { c2.rotation.z = Math.PI / 2 * 0.95; c2.position.y = 10; }
      s.add(c2);
    }
    const barCols = ['#a8322a', '#c9a227', '#2f5a8a', '#4a5a3a'];
    for (let i = 0; i < 40; i++) {
      const [x, z] = outside(80, 300), b = barrel(barCols[Math.floor(R() * 4)]);
      b.position.set(x, 0, z); if (R() < 0.25) { b.rotation.z = Math.PI / 2; b.position.y = 5; b.rotation.y = rnd(0, TAU); }
      s.add(b);
    }
    const rubber = mat('#1c1a18', { r: 0.95 });
    for (let i = 0; i < 14; i++) {
      const [x, z] = outside(85, 300), n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) { const t = mesh(G.torus(5.5, 2.4), rubber); t.rotation.x = Math.PI / 2; t.position.set(x + rnd(-1, 1), 2.4 + k * 4.6, z + rnd(-1, 1)); s.add(t); }
    }
    const rockM = mat('#b88a5a', { r: 0.95, flat: true }), rockM2 = mat('#9a7048', { r: 0.95, flat: true });
    for (let i = 0; i < 60; i++) {
      const [x, z] = outside(90, 900), r = rnd(6, 26);
      const rk = mesh(new THREE.DodecahedronGeometry(r, 0), R() < 0.5 ? rockM : rockM2, true, true);
      rk.position.set(x, r * 0.3, z); rk.scale.set(rnd(0.8, 1.6), rnd(0.5, 1), rnd(0.8, 1.5)); rk.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); s.add(rk);
    }
    const wood = mat('#5a4632', { r: 0.95 });
    const tree = (x, z) => {
      const t = new THREE.Group();
      const trunk = mesh(G.cyl(1.6, 3, 40, 7), wood); trunk.position.y = 20; t.add(trunk);
      for (let k = 0; k < 4; k++) { const br = mesh(G.cyl(0.6, 1.3, 18, 6), wood); br.position.set(0, 26 + k * 4, 0); br.rotation.set(rnd(-1, 1), rnd(0, TAU), rnd(0.6, 1.1) * (k % 2 ? 1 : -1)); t.add(br); }
      t.position.set(x, 0, z); t.rotation.y = rnd(0, TAU); s.add(t);
    };
    for (let i = 0; i < 12; i++) { const [x, z] = outside(110, 700); tree(x, z); }
    for (const [x, y] of [[120, 1000], [700, 1350], [520, 120], [2300, 1250]]) tree(toX(x), toZ(y));
    const mesaM = mat('#c08458', { r: 1, flat: true });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + rnd(-0.2, 0.2), r = rnd(140, 280);
      const me = mesh(new THREE.CylinderGeometry(r * 0.85, r, rnd(140, 280), 7), mesaM, false, false);
      me.position.set(Math.cos(a) * (W / 2 + rnd(900, 1300)), 60, Math.sin(a) * (H / 2 + rnd(900, 1300))); s.add(me);
    }
    // château d'eau rouillé
    const tw = new THREE.Group(), metalR = mat('#7a6a5a', { r: 0.7, m: 0.4 });
    for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) { const l = mesh(G.cyl(1.3, 1.3, 90, 6), metalR); l.position.set(x, 45, z); tw.add(l); }
    const tank = mesh(G.cyl(26, 26, 34, 16), mat('#8a5a3a', { r: 0.7, m: 0.3 })); tank.position.y = 105; tw.add(tank);
    const troof = mesh(new THREE.ConeGeometry(28, 16, 16), metalR); troof.position.y = 130; tw.add(troof);
    tw.position.set(-W / 2 - 260, 0, -H / 2 - 220); s.add(tw);
  },

  /** Graffiti peint à la bombe au sol */
  makeGraffiti(dc) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
    const x = c.getContext('2d'), R = rng(dc.x + dc.y);
    x.font = '900 120px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(190,24,20,0.85)'; x.fillText(dc.text, 512, 100, 980);
    for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(190,24,20,0.5)'; x.fillRect(R() * 1024, 120 + R() * 60, 3, 10 + R() * 30); } // coulures
    for (let i = 0; i < 1500; i++) { x.clearRect(R() * 1024, R() * 192, 2 + R() * 4, 2 + R() * 4); } // usure
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const w = Math.min(320, dc.text.length * 22);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.set(-Math.PI / 2, 0, dc.rot || 0); m.position.set(toX(dc.x), 0.5, toZ(dc.y)); m.renderOrder = 2; m.receiveShadow = true;
    return m;
  },

  /** Panneau peint (canvas) : titre + sous-titre, bordure colorée, lumineux la nuit */
  makeSign(title, sub, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#16130f'; x.fillRect(0, 0, 512, 160);
    x.strokeStyle = color; x.lineWidth = 10; x.strokeRect(8, 8, 496, 144);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff'; x.font = '900 58px "Segoe UI Black", "Arial Black", sans-serif'; x.fillText(title, 256, 62, 470);
    x.fillStyle = color; x.font = '800 30px "Segoe UI", sans-serif'; x.fillText(sub, 256, 118, 470);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(64, 20), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    m.rotation.x = -0.25;
    return m;
  },

  buildPools() {
    this.dotTex = softDot(64);
    this.pNormal = new PointCloud(1600, false, this.dotTex);
    this.pAdd = new PointCloud(1200, true, this.dotTex);
    this.scene.add(this.pNormal.points); this.scene.add(this.pAdd.points);
    // ombres de contact (disque sombre doux sous chaque personnage)
    this.contactMat = new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: this.dotTex, transparent: true, opacity: 0.45, depthWrite: false });
    this.contactGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // pools d'objets réutilisés
    this.pools = { tracer: [], orb: [], nut: [], warn: [], barrel: [], grenade: [], mine: [], drone: [], fire: [], medkit: [], bomb: [], magnet: [], chest: [], frenzy: [], explosive: [], haste: [], ring: [], turret: [], trap: [], gascan: [], battery: [], gen: [], zone: [], crate: [], acid: [] };
    // traces au sol (zombies abattus, explosions) : persistent puis s'estompent
    this.decals = [];
    this.splatTex = canvasTex(128, (x, S) => {
      const R = rng(3);
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(S / 2, S / 2, S * 0.3, 0, TAU); x.fill();
      for (let i = 0; i < 14; i++) { const a = R() * TAU, d = S * (0.25 + R() * 0.2), r = S * (0.04 + R() * 0.08); x.beginPath(); x.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, TAU); x.fill(); }
    });
    this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.rings = [];
    this.tracerMat = glowMat('#ffd27a', 5); this.tracerCrit = glowMat('#ff8a3a', 6);
    this.orbMat = glowMat('#9cff3a', 3);
    this.orbHalo = new THREE.MeshBasicMaterial({ color: '#7aff2a', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
    this.nutMat = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.55, roughness: 0.3, emissive: '#5a4410', emissiveIntensity: 0.6 });
    this.nutBig = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.5, roughness: 0.25, emissive: '#8a6a10', emissiveIntensity: 0.9 });
    // anneau sous la survivante + rayon de collecte
    this.pRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3ad6ff').multiplyScalar(1.6), transparent: true, opacity: 0.85, depthWrite: false }));
    this.pRing.position.y = 0.7; this.scene.add(this.pRing);
    this.magRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.18, depthWrite: false }));
    this.magRing.position.y = 0.6; this.scene.add(this.magRing);
  },

  take(kind, make) {
    const pool = this.pools[kind];
    if (pool.used >= pool.length) { const o = make(); this.scene.add(o); pool.push(o); }
    const o = pool[pool.used++]; o.visible = true; return o;
  },
  beginPools() { for (const k in this.pools) this.pools[k].used = 0; },
  endPools() { for (const k in this.pools) { const p = this.pools[k]; for (let i = p.used; i < p.length; i++) p[i].visible = false; } },

  /* ------------------------------ caméra ------------------------------ */
  fitCamera() {
    const cam = this.camera, pitch = 56 * Math.PI / 180;
    cam.aspect = this.vw / this.vh; cam.updateProjectionMatrix();
    const narrow = this.vw < this.vh;
    const topLimit = narrow ? 0.9 : 0.8; // place pour le HUD en haut
    // caméra rapprochée : on cadre une zone carrée autour de la survivante (et non toute l'arène)
    // téléphone à l'horizontale (écran peu haut) : on cadre un peu plus serré pour garder des personnages lisibles
    const S = this.viewSize = narrow ? 320 : this.vh < 520 ? 390 : 460;
    const pts = [];
    for (const [x, z] of [[-S / 2, -S / 2], [S / 2, -S / 2], [-S / 2, S / 2], [S / 2, S / 2]]) { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x, 26, z)); }
    let tz = 0, d = 1200;
    const v = new THREE.Vector3();
    for (let pass = 0; pass < 4; pass++) {
      let lo = 200, hi = 8000;
      for (let it = 0; it < 32; it++) {
        d = (lo + hi) / 2;
        cam.position.set(0, Math.sin(pitch) * d, tz + Math.cos(pitch) * d); cam.lookAt(0, 0, tz); cam.updateMatrixWorld();
        let ok = true;
        for (const p of pts) { v.copy(p).project(cam); if (Math.abs(v.x) > 0.97 || v.y > topLimit || v.y < -0.97) { ok = false; break; } }
        if (ok) hi = d; else lo = d;
      }
      d = hi;
      cam.position.set(0, Math.sin(pitch) * d, tz + Math.cos(pitch) * d); cam.lookAt(0, 0, tz); cam.updateMatrixWorld();
      let minY = 1, maxY = -1;
      for (const p of pts) { v.copy(p).project(cam); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
      const mid = (minY + maxY) / 2, want = (topLimit - 0.97) / 2;
      tz += (mid - want) * d * 0.25;
    }
    // étendue réellement visible au sol (pour ne pas trop montrer l'extérieur de l'arène)
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
    const ground = (nx, ny) => { ray.setFromCamera(new THREE.Vector2(nx, ny), cam); return ray.ray.intersectPlane(plane, hit) ? hit.clone() : new THREE.Vector3(); };
    this.viewExt = { zTop: ground(0, topLimit).z, zBot: ground(0, -1).z, xL: ground(-1, 0).x, xR: ground(1, 0).x };
    this.camOffset = cam.position.clone().sub(new THREE.Vector3(0, 0, tz)); // caméra relative au point suivi
    this.lookShift = tz;
    if (!this.focus) this.focus = new THREE.Vector3();
    this.fogBase = { near: d * 1.6, far: d * 4.5 };
    this.scene.fog.near = d * 1.6; this.scene.fog.far = d * 4.5;
    const scale = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(cam.fov * Math.PI / 360));
    this.pNormal.uniforms.scale.value = scale; this.pAdd.uniforms.scale.value = scale;
  },

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    this.vw = vw; this.vh = vh;
    this.renderer.setSize(vw, vh, false);
    if (this.composer) { this.composer.setSize(vw, vh); this.bloom.resolution.set(vw / 2, vh / 2); }
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hud.width = Math.round(vw * this.dpr); this.hud.height = Math.round(vh * this.dpr);
    this.ui = U.clamp(Math.min(vw, vh) / 520, 0.8, 1.3);
    const cs = this.probe ? getComputedStyle(this.probe) : null;
    this.safe = { t: cs ? parseFloat(cs.paddingTop) || 0 : 0, l: cs ? parseFloat(cs.paddingLeft) || 0 : 0, b: cs ? parseFloat(cs.paddingBottom) || 0 : 0 };
    this.fitCamera();
  },

  /* ------------------------------ acteurs ------------------------------ */
  addContact(a, size) {
    const c = new THREE.Mesh(this.contactGeo, this.contactMat); c.scale.set(size, 1, size * 0.8); c.position.y = 0.8; a.root.add(c);
  },

  setFlash(a, r, g, b) { for (const m of a.mats) if (!a.keepEmissive) m.emissive.setRGB(r, g, b); },

  syncPlayer(g, dt) {
    const p = g.player;
    const charId = (p && g.charId) || UI.previewChar || Save.data.char;
    if (!this.player || this.player.charId !== charId) { // (re)crée le modèle du personnage choisi
      if (this.player) this.scene.remove(this.player.root);
      const model = CHARACTERS[charId].model;
      const a = this.player = makeActor(ASSETS[model] || ASSETS.survivor, charId === 'swat' ? 58 : 54);
      a.charId = charId;
      this.addContact(a, 22);
      a.gun = new THREE.Group(); a.root.add(a.gun);
      // armes modulaires (pièces de l'établi) ; matériaux partagés avec l'établi (peintures du Garage)
      a.guns = { rifle: buildGun('rifle', this.gunM.rifle), shotgun: buildGun('shotgun', this.gunM.shotgun), flamer: buildGun('flamer', this.gunM.flamer) };
      for (const gm of Object.values(a.guns)) { gm.visible = false; a.gun.add(gm); }
      a.guns.rifle.visible = true; a.gunId = 'rifle';
      a.gunMats = this.gunMatList; a.modSig = null;
      a.face = 0; this.scene.add(a.root);
      play(a, 'Idle_Gun');
    }
    const a = this.player;
    if (a.cosV !== Cosmetics.version) { a.cosV = Cosmetics.version; this.applyOutfit(a); this.applyWeaponSkin(a); }
    // pièces achetées à l'établi : visibles sur l'arme tenue
    const gm = p && g.gunMods, sig = gm ? JSON.stringify(gm) : '';
    if (a.modSig !== sig) { a.modSig = sig; for (const [id, o] of Object.entries(a.guns)) applyGunMods(o, (gm && gm[id]) || {}); }
    a.mixer.update(dt);
    if (!p && g.state === 'menu') { this.showcase(g, a, dt); return; }
    a.showing = false;
    const alive = p && g.state !== 'gameover' && g.state !== 'dying' && g.state !== 'revive';
    const shown = !!p && g.showPlayer !== false && !p.inside;
    a.root.visible = shown && !(g.state === 'gameover' && (a.deadT || 0) > 2.5);
    this.pRing.visible = this.magRing.visible = alive && shown && g.state !== 'intro' && g.state !== 'escape';
    if (!p) return;
    a.root.position.set(toX(p.x), 0, toZ(p.y));
    this.pRing.position.x = this.magRing.position.x = toX(p.x); this.pRing.position.z = this.magRing.position.z = toZ(p.y);
    this.pRing.scale.setScalar(16 + Math.sin(g.time * 4) * 0.8); this.magRing.scale.setScalar(p.magnet);
    if (!alive) {
      a.deadT = (a.deadT || 0) + dt;
      a.gun.visible = false;
      play(a, 'Death', { once: true, fade: 0.1 });
      return;
    }
    a.deadT = 0; a.gun.visible = true;
    // la survivante fait face à sa cible, ses jambes suivent le déplacement
    a.face = lerpAngle(a.face, Math.atan2(Math.cos(p.aimAngle), Math.sin(p.aimAngle)), Math.min(1, dt * 16));
    a.root.rotation.y = a.face;
    const moving = Math.hypot(p.vx, p.vy) > 5;
    const recoil = U.clamp(p.fireTimer * p.weapon.fireRate, 0, 1);
    const firing = g.enemies.length > 0 && recoil > 0.05;
    const runSpeed = Math.hypot(p.vx, p.vy) / 200;
    a.gun.visible = p.rollT <= 0;
    if (p.rollT > 0) { // roulade : on se tourne dans le sens de la roulade
      a.face = Math.atan2(p.rollDirX, p.rollDirY); a.root.rotation.y = a.face;
      play(a, 'Roll', { once: true, fade: 0.05, speed: 1.9 });
    } else if (moving) {
      const rel = ((Math.atan2(p.vx, p.vy) - a.face + Math.PI) % TAU + TAU) % TAU - Math.PI;
      const ar = Math.abs(rel);
      const anim = ar < 0.8 ? (firing ? 'Run_Shoot' : 'Run') : ar > 2.35 ? 'Run_Back' : rel > 0 ? 'Run_Left' : 'Run_Right';
      play(a, anim, { speed: U.clamp(runSpeed, 0.8, 1.6) });
    } else play(a, firing ? 'Idle_Gun_Shoot' : 'Idle_Gun');
    // arme équipée (fusil d'assaut / fusil à pompe / lance-flammes)
    this.setGun(a, g.active || 'rifle');
    const fl = a.guns[a.gunId].userData.flash;
    fl.visible = a.gunId === 'flamer' ? recoil > 0.2 : recoil > 0.8;
    if (fl.visible) { const k = 0.7 + Math.random() * 0.6; fl.scale.set(k, k, k * 2.2); }
    this.holdGun(a, recoil);
    const blink = p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0;
    this.setFlash(a, blink ? 0.7 : 0, blink ? 0.1 : 0, blink ? 0.05 : 0);
  },

  /** Menus : le personnage choisi pose à côté de la voiture, sur le parking */
  showcase(g, a, dt) {
    const S = this.SHOW;
    a.root.visible = true; this.pRing.visible = this.magRing.visible = false;
    a.deadT = 0; a.gun.visible = true;
    if (!a.showing) { a.showing = true; a.showT = 0; play(a, a.actions.Wave ? 'Wave' : 'Idle_Gun', { once: !!a.actions.Wave, fade: 0.15 }); } // petit salut à l'apparition
    a.showT += dt;
    if (a.cur === 'Wave' && a.showT > 1.8) play(a, 'Idle_Gun', { fade: 0.4 });
    a.root.position.set(toX(S.x), 0, toZ(S.y));
    a.face = -0.45 + Math.sin(g.time * 0.5) * 0.12;
    a.root.rotation.y = a.face;
    this.setFlash(a, 0, 0, 0);
    this.setGun(a, 'rifle');
    a.guns.rifle.userData.flash.visible = false;
    this.holdGun(a, 0);
  },

  /* ------------------------------ Garage : apparences ------------------------------ */
  /** Tenue : recolore les vêtements selon leur rôle (haut, pantalon, équipement…) */
  applyOutfit(a) {
    const it = Cosmetics.eq('outfit_' + a.charId), pal = it && it.palette && OUTFIT_PALETTES[it.palette], roles = OUTFIT_ROLES[a.charId] || {};
    for (const m of a.mats) {
      if (!m.userData.base) m.userData.base = m.color.clone();
      m.color.copy(m.userData.base);
      const role = roles[m.name];
      if (!pal || !role) continue;
      if (pal.mult) m.color.multiply(col(pal.mult)); else if (pal[role]) m.color.set(pal[role]);
    }
  },
  /** Peinture d'arme : métal / bois recolorés, rayures de danger, or brillant */
  applyWeaponSkin(a) { this.applyGunSkin(Cosmetics.eq('weapon').skin); this._gsSkin = null; },
  /** Peinture appliquée aux matériaux partagés de toutes les armes (jeu + établi) */
  applyGunSkin(key) {
    const sk = WEAPON_SKINS[key];
    if (sk && sk.stripes && !this.hazardTex) this.hazardTex = canvasTex(64, (x, S) => { x.fillStyle = '#ffc21a'; x.fillRect(0, 0, S, S); x.fillStyle = '#141210'; for (let k = -S; k < S * 2; k += 16) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 8, 0); x.lineTo(k + 8 - S, S); x.lineTo(k - S, S); x.closePath(); x.fill(); } }, 1);
    for (const m of this.gunMatList) {
      const b = m.userData.base, hadMap = !!m.map;
      m.color.copy(b.color); m.roughness = b.r; m.metalness = b.m; m.map = null; m.emissive.set('#000000');
      if (sk) {
        m.color.set(sk[m.userData.role]); m.roughness = sk.r; m.metalness = sk.m;
        if (sk.stripes && m.userData.role === 'metal') { m.map = this.hazardTex; m.color.set('#ffffff'); }
        if (sk.glow) m.emissive.set(sk.glow);
      }
      if (hadMap !== !!m.map) m.needsUpdate = true;
    }
  },
  /** Voiture : peinture, autocollants, équipements (pare-buffle, galerie, blindage) */
  applyCar() {
    const co = this.carObj, paint = Cosmetics.eq('car_paint'), decal = Cosmetics.eq('car_decal'), kit = Cosmetics.eq('car_kit');
    for (const m of co.userData.mats || []) {
      if (m.name !== 'White') continue;
      if (!m.userData.base) m.userData.base = m.color.clone();
      if (paint.color) m.color.set(paint.color); else m.color.copy(m.userData.base);
    }
    if (co.userData.extras) { co.remove(co.userData.extras); co.userData.extras.traverse(o => { if (o.material && o.material.map) o.material.map.dispose(); }); }
    const ex = co.userData.extras = new THREE.Group(); co.add(ex);
    // autocollants
    if (decal.decal) {
      const tex = this.decalTex(decal.decal), dm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
      const plane = (w, h, x, y, z, rx, ry) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dm); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); ex.add(o); };
      if (decal.decal === 'stripes') { plane(14, 26, 0, 24, 36, -Math.PI / 2 + 0.06, 0); plane(14, 38, 0, 34.1, -10, -Math.PI / 2, 0); plane(14, 14, 0, 28.6, -40, -Math.PI / 2 + 0.3, 0); }
      else if (decal.decal === 'flames') { for (const s of [-1, 1]) plane(60, 13, s * 24.6, 14, 4, 0, s * Math.PI / 2); plane(28, 16, 0, 24, 36, -Math.PI / 2 + 0.06, 0); }
      else { plane(22, 22, 0, 24, 37, -Math.PI / 2 + 0.06, Math.PI); for (const s of [-1, 1]) plane(14, 14, s * 24.6, 14, -10, 0, s * Math.PI / 2); }
    }
    // équipements
    const steel = mat('#2a2c30', { r: 0.4, m: 0.7 });
    const B = (w, h, d, m, x, y, z) => { const o = mesh(G.box(w, h, d), m); o.position.set(x, y, z); ex.add(o); return o; };
    if (kit.kit.includes('bullbar')) {
      for (const x of [-13, 13]) B(2.4, 18, 2.4, steel, x, 12, 55);
      B(30, 2.4, 2.4, steel, 0, 20, 55.5); B(36, 2.4, 2.4, steel, 0, 9, 56); B(2, 12, 2, steel, 0, 14, 56);
    }
    if (kit.kit.includes('rack')) {
      for (const x of [-15, 15]) B(1.6, 1.6, 44, steel, x, 36, -6);
      for (const z of [-26, -6, 14]) B(31, 1.4, 1.6, steel, 0, 36, z);
      B(8, 10, 6, mat('#b8281e', { r: 0.5 }), -7, 41.5, -18); B(8, 10, 6, mat('#3a6a2a', { r: 0.5 }), 3, 41.5, -18);
      const tire = mesh(G.torus(6, 2.6), mat('#1c1a18', { r: 0.95 })); tire.rotation.x = Math.PI / 2; tire.position.set(0, 39, 6); ex.add(tire);
    }
    if (kit.kit.includes('armor')) {
      const plate = mat('#4a4c48', { r: 0.7, m: 0.5 });
      for (const s of [-1, 1]) { B(1.5, 9, 70, plate, s * 25.2, 13, -4); for (let i = 0; i < 6; i++) B(1, 1, 1, steel, s * 26, 16, -36 + i * 13); }
      for (let i = 0; i < 6; i++) B(1, 12, 1, steel, -12 + i * 4.8, 28, 30); // grille de pare-brise
      B(34, 1.2, 1.2, steel, 0, 34, 30);
    }
  },
  /** Textures d'autocollants (canvas) */
  decalTex(kind) {
    const c = document.createElement('canvas'); c.width = 256; c.height = kind === 'flames' ? 96 : 256;
    const x = c.getContext('2d'), W2 = c.width, H2 = c.height;
    if (kind === 'stripes') { x.fillStyle = '#f2f0ea'; x.fillRect(W2 * 0.18, 0, W2 * 0.22, H2); x.fillRect(W2 * 0.6, 0, W2 * 0.22, H2); }
    else if (kind === 'flames') {
      const gr = x.createLinearGradient(0, 0, W2, 0); gr.addColorStop(0, '#ffe04a'); gr.addColorStop(0.5, '#ff8a1a'); gr.addColorStop(1, '#c81e10');
      x.fillStyle = gr; x.beginPath(); x.moveTo(0, H2 * 0.25); x.lineTo(0, H2 * 0.85);
      for (let i = 0; i < 6; i++) { const bx = 40 + i * 36; x.quadraticCurveTo(bx, H2 * 0.95, bx + 18, H2 * (0.55 + (i % 2) * 0.1)); x.quadraticCurveTo(bx + 28, H2 * 0.35, bx + 36, H2 * (0.15 + (i % 2) * 0.2)); }
      x.quadraticCurveTo(W2 * 0.6, H2 * 0.05, 0, H2 * 0.25); x.fill();
    } else if (kind === 'bio') {
      x.strokeStyle = '#ffc21a'; x.lineWidth = 16; x.fillStyle = '#ffc21a';
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3 - Math.PI / 2; x.beginPath(); x.arc(128 + Math.cos(a) * 46, 128 + Math.sin(a) * 46, 48, 0, TAU); x.stroke(); }
      x.beginPath(); x.arc(128, 128, 20, 0, TAU); x.fill();
      x.lineWidth = 6; x.strokeStyle = '#141210'; x.beginPath(); x.arc(128, 128, 118, 0, TAU); x.stroke();
    } else if (kind === 'skull') {
      x.fillStyle = '#f2f0ea'; x.beginPath(); x.arc(128, 110, 70, Math.PI, 0); x.lineTo(198, 150); x.quadraticCurveTo(190, 190, 160, 192); x.lineTo(160, 220); x.lineTo(96, 220); x.lineTo(96, 192); x.quadraticCurveTo(66, 190, 58, 150); x.closePath(); x.fill();
      x.fillStyle = '#141210'; x.beginPath(); x.ellipse(100, 130, 20, 24, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(156, 130, 20, 24, 0, 0, TAU); x.fill();
      x.beginPath(); x.moveTo(128, 158); x.lineTo(118, 178); x.lineTo(138, 178); x.closePath(); x.fill();
      for (let i = 0; i < 4; i++) x.fillRect(102 + i * 14, 198, 4, 22);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  },
  /** Rex : race (pelage) + accessoire */
  applyDog(a) {
    const br = DOG_BREEDS[Cosmetics.eq('dog_breed').breed], acc = Cosmetics.eq('dog_acc').acc;
    for (const m of a.mats) {
      if (!m.userData.base) m.userData.base = m.color.clone();
      m.color.copy(m.userData.base);
      if (br && br[m.name]) m.color.set(br[m.name]);
    }
    if (a.acc) { a.acc.parent && a.acc.parent.remove(a.acc); a.acc = null; }
    if (!acc) return;
    const gr = new THREE.Group();
    if (acc === 'bandana') {
      const red = mat('#c81e1a', { r: 0.8 });
      const tri = mesh(new THREE.ConeGeometry(5, 7, 3), red); tri.rotation.set(Math.PI, 0, 0); tri.scale.set(1, 1, 0.35); tri.position.set(0, -3, 3); gr.add(tri);
      const band = mesh(G.torus(4.2, 0.9), red); band.rotation.x = Math.PI / 2; gr.add(band);
    } else {
      const lea = mat('#2a1a10', { r: 0.7 }), spike = mat('#c8ccd0', { r: 0.25, m: 0.8 });
      const band = mesh(G.torus(4.4, 1), lea); band.rotation.x = Math.PI / 2; gr.add(band);
      for (let i = 0; i < 8; i++) { const an = i / 8 * TAU, sp = mesh(new THREE.ConeGeometry(0.7, 2.4, 6), spike); sp.position.set(Math.cos(an) * 5.4, 0, Math.sin(an) * 5.4); sp.rotation.set(0, 0, -Math.PI / 2); sp.rotation.y = -an; gr.add(sp); }
    }
    // collier autour du cou, dans le repère du personnage (suivi à chaque image)
    a.acc = gr; a.root.add(gr);
  },

  setGun(a, id) {
    if (a.gunId === id || !a.guns[id]) return;
    a.guns[a.gunId].visible = false; a.guns[id].visible = true; a.gunId = id;
  },

  /** L'arme est tenue dans la main droite et pointe vers la main gauche (prise à deux mains),
      ou droit devant quand les mains sont écartées (course, salut) */
  holdGun(a, recoil) {
    const wr = a.bones.WristR || a.bones['Wrist.R'], wl = a.bones.WristL || a.bones['Wrist.L'];
    if (!wr) return;
    a.root.updateMatrixWorld(true);
    const vr = this._wr || (this._wr = new THREE.Vector3()), vl = this._wl || (this._wl = new THREE.Vector3());
    const dir = this._wd || (this._wd = new THREE.Vector3()), fwd = this._wf || (this._wf = new THREE.Vector3(0, 0, 1));
    wr.getWorldPosition(vr); a.root.worldToLocal(vr);
    dir.set(0, 0, 1);
    if (wl) {
      wl.getWorldPosition(vl); a.root.worldToLocal(vl);
      dir.subVectors(vl, vr);
      const d = dir.length();
      // prise à deux mains : main gauche devant la droite, à distance raisonnable
      if (d > 2 && d < a.height * 0.45 && dir.z > 0) dir.multiplyScalar(1 / d).lerp(fwd, 0.35).normalize();
      else dir.set(0, 0, 1);
    }
    const q = this._wq || (this._wq = new THREE.Quaternion());
    q.setFromUnitVectors(fwd, dir);
    a.gun.quaternion.slerp(q, 0.5);
    const kick = recoil > 0.6 ? (recoil - 0.6) * 5 : 0;
    a.gun.position.set(vr.x - dir.x * kick, vr.y + 1.2 - dir.y * kick, vr.z - dir.z * kick);
  },
  SHOW: { x: MAP.car.x + 58, y: MAP.car.y + 12 },

  syncEnemies(g, dt) {
    const seen = new Set();
    for (const e of g.enemies) {
      let a = e._m;
      if (!a) {
        a = makeZombie(e.def.model, e.elite);
        this.addContact(a, e.r * 2);
        a.root.rotation.y = Math.atan2(g.player ? g.player.x - e.x : 0, g.player ? g.player.y - e.y : 1);
        e._m = a; this.scene.add(a.root); this.enemyModels.add(a);
        play(a, a.type.walk, { fade: 0, speed: a.type.speed });
        a.mixer.setTime(Math.random() * 2); // désynchronise les démarches
      }
      seen.add(a);
      this.animateEnemy(a, e, g, dt);
    }
    // morts : animation de chute, puis ils s'enfoncent dans le sable
    for (const a of this.enemyModels) if (!seen.has(a)) {
      this.enemyModels.delete(a); a.dieT = 0; this.dying.push(a);
      this.setFlash(a, 0, 0, 0);
      play(a, 'Death', { once: true, fade: 0.08, speed: 1.4 });
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const a = this.dying[i];
      a.dieT += dt; a.mixer.update(dt);
      if (a.dieT > 1.1) a.root.position.y -= dt * 40;
      if (a.dieT > 2) {
        this.scene.remove(a.root);
        for (const m of a.mats) m.dispose();
        if (a.bellyMat) a.bellyMat.dispose();
        this.dying.splice(i, 1);
      }
    }
  },

  animateEnemy(a, e, g, dt) {
    const p = g.player, t = a.type, sp = Math.hypot(e.vx, e.vy), moving = sp > 4;
    a.root.position.set(toX(e.x), 0, toZ(e.y));
    const tx = e.def.behavior === 'chase' && moving ? e.vx : (p ? p.x - e.x : e.vx);
    const tz = e.def.behavior === 'chase' && moving ? e.vy : (p ? p.y - e.y : e.vy);
    a.root.rotation.y = lerpAngle(a.root.rotation.y, Math.atan2(tx, tz), Math.min(1, dt * 8));
    // sortie de terre
    const rise = easeOut(e.age / 0.55);
    a.root.position.y = (rise - 1) * a.height * 0.9;
    // choix de l'animation
    const near = p && Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r + 22;
    if (a.kind === 'charger' && e.cstate === 'windup') play(a, 'Idle_Attack', { speed: 1.6 });
    else if (a.kind === 'charger' && e.cstate === 'charge') play(a, 'Run', { speed: 2.4 });
    else if (a.kind === 'charger' && e.cstate === 'stun') play(a, 'Idle', { speed: 0.5 });
    else if (a.kind === 'queen' && e.screamT > 0) play(a, 'Idle_Attack', { speed: 1.4 });
    else if (a.kind === 'spewer' && e.cooldown > e.def.fireCooldown - 0.4) play(a, 'Punch', { speed: 1.1 });
    else if (a.kind === 'spitter' && e.cooldown < 0.45) play(a, 'Punch', { speed: 1.2 });
    else if (a.kind === 'behemoth' && e.cooldown > e.def.fireCooldown * (e.hp < e.maxHp * 0.5 ? 0.65 : 1) - 0.35) play(a, 'Idle_Attack', { speed: 1.3 });
    else if (near) play(a, 'Punch', { speed: 1.3 });
    else if (moving) play(a, t.walk, { speed: t.speed * U.clamp(sp / (e.def.speed || 60), 0.6, 1.6) });
    else play(a, t.idle || 'Idle');
    a.mixer.update(dt);
    // kamikaze : la charge clignote de plus en plus vite à l'approche
    if (a.fuse) {
      const d = p ? Math.hypot(p.x - e.x, p.y - e.y) : 999, rate = d < 120 ? 22 : d < 250 ? 12 : 6;
      const on = Math.sin(g.time * rate) > 0;
      a.bellyMat.emissiveIntensity = on ? 3.2 : 0.6;
      a.belly.scale.setScalar((a.bellyBase || (a.bellyBase = a.belly.scale.x)) * (on ? 1.12 : 1));
    }
    // cracheur : le ventre gonfle avant le tir
    else if (a.belly) {
      const ch = e.cooldown < 0.5 ? 1 - Math.max(0, e.cooldown) / 0.5 : 0;
      a.belly.scale.setScalar((1 + ch * 0.35 + Math.sin(g.time * 6) * 0.04) * (a.bellyBase || (a.bellyBase = a.belly.scale.x)));
      a.bellyMat.emissiveIntensity = 0.6 + ch * 2.4;
    }
    // Mastodonte : lueur verte, rouge quand il enrage
    if (a.kind === 'behemoth') {
      const rage = e.hp < e.maxHp * 0.5, pulse = 0.25 + 0.15 * Math.sin(g.time * (rage ? 9 : 3));
      if (e.flash <= 0) for (const m of a.mats) { m.emissive.set(rage ? '#ff3a10' : '#3a8a10'); m.emissiveIntensity = pulse * (rage ? 1.6 : 1); }
    }
    // éclair d'impact + petit écrasement
    if (e.flash > 0) { for (const m of a.mats) { m.emissive.setRGB(1, 1, 1); m.emissiveIntensity = 0.8; } }
    else if (a.elite) { for (const m of a.mats) { m.emissive.set('#8a5a00'); m.emissiveIntensity = 0.3 + 0.15 * Math.sin(g.time * 5); } }
    else if (t.glow) { // nouveaux boss : lueur qui pulse (rouge vif quand le Bélier charge)
      const hot = e.cstate === 'windup' || e.cstate === 'charge';
      for (const m of a.mats) { m.emissive.set(hot ? '#ff2a10' : t.glow); m.emissiveIntensity = hot ? 0.5 + 0.3 * Math.sin(g.time * 20) : 0.18 + 0.1 * Math.sin(g.time * 3); }
    }
    else if (a.kind !== 'behemoth') this.setFlash(a, 0, 0, 0);
    const sq = e.flash > 0 ? 1.07 : 1;
    a.model.scale.set(a.k * sq, a.k * (2 - sq), a.k * sq);
  },

  /* ------------------------------ fabrication des objets ------------------------------ */
  makeBarrel() {
    const gr = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#c8321e', roughness: 0.5, metalness: 0.35 });
    const b = mesh(G.cyl(9, 9, 22, 18), m, true, true); b.position.y = 11; gr.add(b);
    for (const y of [5, 17]) { const r = mesh(G.cyl(9.4, 9.4, 1.4, 18), mat('#2a2622', { m: 0.5, r: 0.5 })); r.position.y = y; gr.add(r); }
    const band = mesh(G.cyl(9.2, 9.2, 4, 18), mat('#ffc21a', { r: 0.6 })); band.position.y = 11; gr.add(band);
    const top = mesh(G.cyl(8.8, 8.8, 0.6, 18), mat('#8a2a1a', { r: 0.6, m: 0.3 })); top.position.y = 22.2; gr.add(top);
    const c = new THREE.Mesh(this.contactGeo, this.contactMat); c.scale.set(26, 1, 22); c.position.y = 0.8; gr.add(c);
    gr.userData.mat = m;
    return gr;
  },
  /** Crachat de bile : paquet vert acide lumineux (halo + cœur brillant), gouttes qui suivent,
      et au sol une ombre + un anneau vert qui montrent clairement sa trajectoire */
  makeBile() {
    if (!this.bileGeo) {
      const geo2 = new THREE.IcosahedronGeometry(1, 1), pos = geo2.attributes.position, R = rng(77);
      for (let i = 0; i < pos.count; i++) { const k = 0.75 + R() * 0.45; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k); }
      geo2.computeVertexNormals();
      this.bileGeo = geo2;
      this.bileMat = new THREE.MeshStandardMaterial({ color: '#b4f03a', roughness: 0.2, metalness: 0.05, emissive: '#6ab814', emissiveIntensity: 1.6, flatShading: true });
      this.bileDark = new THREE.MeshStandardMaterial({ color: '#3a4a12', roughness: 0.6, flatShading: true });
      this.bileCore = glowMat('#d8ff5a', 3.2);
      this.bileHalo = new THREE.MeshBasicMaterial({ color: '#9cff2a', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
      this.dropMat = new THREE.MeshStandardMaterial({ color: '#a0d82a', roughness: 0.3, emissive: '#4a8a0a', emissiveIntensity: 1.2, transparent: true, opacity: 0.9 });
      this.bileShadow = new THREE.MeshBasicMaterial({ color: '#0a1404', alphaMap: this.dotTex, transparent: true, opacity: 0.55, depthWrite: false });
      this.bileRing = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9cff2a').multiplyScalar(1.8), transparent: true, opacity: 0.75, depthWrite: false });
    }
    const gr = new THREE.Group(), blob = new THREE.Group(), body = new THREE.Group(); gr.add(blob); blob.add(body);
    body.add(mesh(this.bileGeo, this.bileMat, false));
    const core = mesh(G.sphere(0.55, 10, 8), this.bileCore, false); body.add(core);
    for (let i = 0; i < 3; i++) { const ch = mesh(G.box(0.45, 0.35, 0.4), this.bileDark, false); ch.position.set(Math.cos(i * 2.1) * 0.7, Math.sin(i * 1.7) * 0.5, Math.sin(i * 2.1) * 0.7); body.add(ch); }
    const halo = mesh(G.sphere(1, 14, 10), this.bileHalo, false); blob.add(halo);
    const drops = [];
    for (let i = 0; i < 3; i++) { const d = mesh(G.sphere(0.45 - i * 0.1, 8, 6), this.dropMat, false); blob.add(d); drops.push(d); }
    // repère au sol (non mis à l'échelle avec la boule)
    const shadow = new THREE.Mesh(this.contactGeo, this.bileShadow); shadow.position.y = 0.9; gr.add(shadow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 28).rotateX(-Math.PI / 2), this.bileRing); ring.position.y = 1; gr.add(ring);
    gr.userData = { drops, body, blob, halo, shadow, ring };
    return gr;
  },
  makeDrone() {
    const gr = new THREE.Group(), metal = mat('#3a3e44', { r: 0.4, m: 0.6 });
    gr.add(mesh(G.box(9, 3, 9), metal));
    const eye = mesh(G.sphere(1.6, 8, 6), glowMat('#3ad6ff', 4), false); eye.position.set(0, -1, 4.6); gr.add(eye);
    const rotors = [];
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const arm = mesh(G.box(1, 1, 1), metal); arm.position.set(x * 0.6, 0, z * 0.6); arm.scale.set(Math.abs(x) * 0.8, 1, 1); gr.add(arm);
      const r = mesh(G.box(9, 0.3, 1.2), mat('#1a1a1a', { r: 0.6 }), false); r.position.set(x, 1.8, z); gr.add(r); rotors.push(r);
    }
    gr.userData.rotors = rotors;
    return gr;
  },
  makePowerup(kind) {
    const gr = new THREE.Group(), body = new THREE.Group(); gr.add(body);
    if (kind === 'medkit') {
      body.add(mesh(G.box(12, 9, 8), mat('#f2f2ee', { r: 0.5 })));
      for (const [w, h] of [[2.5, 7], [7, 2.5]]) { const c = mesh(G.box(w, h, 8.4), glowMat('#ff2a2a', 1.6), false); body.add(c); }
    } else if (kind === 'bomb') {
      body.add(mesh(G.sphere(6, 14, 10), mat('#222222', { r: 0.35, m: 0.4 })));
      const f = mesh(G.cyl(0.6, 0.6, 4, 6), mat('#8a6a3a')); f.position.y = 7; body.add(f);
      const sp = mesh(G.sphere(1.4, 8, 6), glowMat('#ffb030', 5), false); sp.position.y = 9.2; body.add(sp);
    } else if (kind === 'chest') { // coffre doré : caisse dorée cerclée de métal, lueur sous le couvercle
      const gold = mat('#e8b030', { r: 0.3, m: 0.75, e: '#5a3a00' }), band = mat('#3a2a1a', { r: 0.6, m: 0.4 });
      body.add(mesh(G.box(14, 8, 10), gold));
      const lid = mesh(G.box(14.4, 3, 10.4), gold); lid.position.y = 5.6; body.add(lid);
      for (const x of [-5, 5]) { const b = mesh(G.box(1.4, 11.4, 10.8), band); b.position.set(x, 1.4, 0); body.add(b); }
      const lock = mesh(G.box(2.4, 3, 1), mat('#2a2a2a', { m: 0.6 })); lock.position.set(0, 3, 5.4); body.add(lock);
      const glow = mesh(G.box(13, 0.8, 9.6), glowMat('#ffe08a', 4), false); glow.position.y = 4.2; body.add(glow);
      body.scale.setScalar(1.15);
    } else if (FUN.buffs[kind]) { // bonus temporaire : cristal lumineux qui tourne
      const b = FUN.buffs[kind], cr = mesh(new THREE.OctahedronGeometry(6, 0), glowMat(b.color, 2.6), false); cr.scale.y = 1.5; body.add(cr);
      const core = mesh(new THREE.OctahedronGeometry(3, 0), glowMat('#ffffff', 3), false); core.scale.y = 1.5; body.add(core);
    } else { // aimant
      const red = mat('#d8282a', { r: 0.4, m: 0.3 }), steel = mat('#d8d8d8', { r: 0.3, m: 0.7 });
      const u = mesh(new THREE.TorusGeometry(5, 1.8, 8, 16, Math.PI), red); u.rotation.z = Math.PI; body.add(u);
      for (const s of [-1, 1]) { const tip = mesh(G.box(3.6, 3, 3.6), steel); tip.position.set(s * 5, 1.5, 0); body.add(tip); }
    }
    const colors = { medkit: '#7dff6a', bomb: '#ff8a3a', magnet: '#ffd24a', chest: '#ffd24a', frenzy: FUN.buffs.frenzy.color, explosive: FUN.buffs.explosive.color, haste: FUN.buffs.haste.color };
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[kind]).multiplyScalar(1.8), transparent: true, opacity: 0.8, depthWrite: false }));
    halo.position.y = 0.9; gr.add(halo);
    gr.userData = { body, halo };
    return gr;
  },

  /** Trace au sol (flaque verte, brûlure d'explosion) qui s'estompe lentement */
  addDecal(x, y, r, color) {
    let d;
    if (this.decals.length >= 45) d = this.decals.shift();
    else { d = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({ alphaMap: this.splatTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); this.scene.add(d); }
    const scorch = color === '#2a221a';
    d.material.color.set(color);
    d.position.set(toX(x), 0.45 + this.decals.length * 0.002, toZ(y));
    d.rotation.y = Math.random() * TAU;
    const s = scorch ? Math.min(r, 40) * 1.6 : r * 1.5;
    d.scale.set(s, 1, s);
    d.userData.base = scorch ? 0.3 : 0.45;
    d.userData.life = 16; d.material.opacity = d.userData.base;
    this.decals.push(d);
  },
  updateDecals() {
    for (const d of this.decals) { d.userData.life -= 1 / 60; d.material.opacity = d.userData.base * U.clamp(d.userData.life / 5, 0, 1); }
  },
  clearDecals() { for (const d of this.decals) { this.scene.remove(d); d.material.dispose(); } this.decals.length = 0; },

  /* ------------------------------ projectiles, ferraille, alertes ------------------------------ */
  syncObjects(g) {
    this.beginPools();
    for (const b of g.pBullets) {
      const o = this.take('tracer', () => { const gr = new THREE.Group(); const t = new THREE.Mesh(G.cyl(0.8, 0.8, 1, 6), this.tracerMat); t.rotation.x = Math.PI / 2; gr.add(t); gr.userData.t = t; return gr; });
      const k = b.r / 4.5;
      o.position.set(toX(b.x), 19, toZ(b.y)); o.rotation.y = Math.atan2(b.vx, b.vy);
      o.userData.t.material = b.crit ? this.tracerCrit : this.tracerMat;
      o.userData.t.scale.set(1.3 * k, 22 * k, 1.3 * k); o.userData.t.position.z = -6 * k;
    }
    // crachats de bile des zombies : paquet visqueux qui tournoie, gouttes qui suivent
    for (const b of g.eBullets) {
      const o = this.take('orb', () => this.makeBile());
      const sp = Math.hypot(b.vx, b.vy) || 1, dx = b.vx / sp, dz = b.vy / sp;
      const u = o.userData, s = Math.max(4.5, b.r * 1.05);
      o.position.set(toX(b.x), 0, toZ(b.y));
      u.blob.position.y = 17 + Math.sin(g.time * 14 + b.x) * 1.2;
      u.blob.scale.setScalar(s);
      u.body.rotation.set(g.time * 7 + b.x, g.time * 5, 0);
      u.body.scale.set(1 + Math.sin(g.time * 18) * 0.12, 1 - Math.sin(g.time * 18) * 0.1, 1); // ça gigote
      u.halo.scale.setScalar(1.9 + Math.sin(g.time * 22 + b.y) * 0.25);
      u.drops.forEach((dr, i) => { const k = 1.6 + i * 1.5; dr.position.set(-dx * k + Math.sin(g.time * 20 + i) * 0.3, -0.5 * i, -dz * k); });
      u.shadow.scale.set(s * 2.6, 1, s * 2.6);
      u.ring.scale.setScalar(s * 1.7 + Math.sin(g.time * 12) * 0.8);
    }
    for (const c of g.pickups) {
      const life = c.kind === 'coin' ? CONFIG.pickups.life : CONFIG.powerups.life;
      if (!c.attract && c.age > life - 3 && Math.floor(c.age * 8) % 2) continue;
      const y = 4 + (c.z || 0) * 0.8 + Math.sin(g.time * 4 + c.x) * 1.2;
      if (c.kind === 'coin') {
        const o = this.take('nut', () => { const gr = new THREE.Group(); const n = mesh(G.cyl(3, 3, 1.8, 6), this.nutMat, true); n.rotation.x = Math.PI / 2; gr.add(n); gr.userData.n = n; return gr; });
        const big = c.value > 2;
        o.userData.n.material = big ? this.nutBig : this.nutMat;
        o.scale.setScalar(big ? 1.5 : 1.1);
        o.position.set(toX(c.x), y, toZ(c.y));
        o.rotation.set(0.5, g.time * 3 + c.x, 0);
      } else { // bonus : trousse de soin, bombe, aimant (avec halo au sol)
        const o = this.take(c.kind, () => this.makePowerup(c.kind));
        o.position.set(toX(c.x), 0, toZ(c.y));
        o.userData.body.position.y = 10 + y;
        o.userData.body.rotation.y = g.time * 2;
        o.userData.halo.scale.setScalar(16 + Math.sin(g.time * 6) * 2);
      }
    }
    // fûts explosifs
    for (const b of g.barrels) {
      const o = this.take('barrel', () => this.makeBarrel());
      o.position.set(toX(b.x), 0, toZ(b.y));
      const lit = b.flash > 0 || (b.fuse != null && Math.sin(g.time * 60) > 0);
      o.userData.mat.emissive.setRGB(lit ? 1 : 0, lit ? 0.6 : 0, lit ? 0.2 : 0);
      o.scale.setScalar(b.fuse != null ? 1.1 : 1);
    }
    // grenades en vol
    for (const n of g.grenades) {
      const o = this.take('grenade', () => { const gr = new THREE.Group(); gr.add(mesh(G.sphere(3, 10, 8), mat('#3a4a2a', { r: 0.5, m: 0.3 }))); const l = mesh(G.sphere(1, 6, 4), glowMat('#ff4a1a', 4), false); l.position.y = 2.6; gr.add(l); return gr; });
      o.position.set(toX(n.x), n.z, toZ(n.y)); o.rotation.set(g.time * 9, g.time * 7, 0);
    }
    // mines posées
    for (const m of g.mines) {
      const o = this.take('mine', () => {
        const gr = new THREE.Group();
        gr.add(mesh(G.cyl(6, 7, 2.5, 14), mat('#4a4a3a', { r: 0.5, m: 0.5 }), true, true));
        const led = mesh(G.sphere(1.3, 8, 6), glowMat('#ff2a1a', 4), false); led.position.y = 1.8; gr.add(led); gr.userData.led = led;
        return gr;
      });
      o.position.set(toX(m.x), 1.3, toZ(m.y));
      o.userData.led.visible = m.arm > 0 ? Math.sin(g.time * 10) > 0 : m.age > MINE_LIFE - 5 ? Math.sin(g.time * 18) > 0 : Math.sin(g.time * 4 + m.x) > 0; // clignote vite avant de s'éteindre
    }
    // drones en orbite
    for (const d of g.drones) {
      const o = this.take('drone', () => this.makeDrone());
      o.position.set(toX(d.x), 46 + Math.sin(g.time * 5 + d.i) * 3, toZ(d.y));
      o.rotation.y = g.time * 1.5 + d.i;
      for (const r of o.userData.rotors) r.rotation.y += 1.2;
    }
    // brasiers au sol (évolution des grenades)
    for (const z of g.fireZones) {
      const o = this.take('fire', () => new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a1a').multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      o.position.set(toX(z.x), 0.8, toZ(z.y)); o.scale.setScalar(z.r);
      o.material.opacity = 0.35 * Math.min(1, z.t / 0.6) * (0.8 + 0.2 * Math.sin(g.time * 20));
    }
    // effets ponctuels envoyés par la logique : traces au sol, ondes de choc
    for (const f of g.fx) {
      if (f.t === 'decal') this.addDecal(f.x, f.y, f.r, f.color);
      else if (f.t === 'ring') this.rings.push({ x: f.x, y: f.y, r: f.r, t: 0 });
    }
    g.fx.length = 0;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const rg = this.rings[i]; rg.t += 1 / 60;
      if (rg.t > 0.35) { this.rings.splice(i, 1); continue; }
      const o = this.take('ring', () => new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2.5), transparent: true, depthWrite: false })));
      const k = rg.t / 0.35;
      o.position.set(toX(rg.x), 2, toZ(rg.y)); o.scale.setScalar(rg.r * (0.3 + k * 0.9)); o.material.opacity = 1 - k;
    }
    this.updateDecals();
    this.syncAllies(g);
    if (g.wave) for (const w of g.wave.warnings) {
      const o = this.take('warn', () => {
        const gr = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3a2a').multiplyScalar(2), transparent: true, depthWrite: false }));
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3a2a', transparent: true, opacity: 0.25, depthWrite: false }));
        const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a120c', transparent: true, opacity: 0.8, depthWrite: false }));
        gr.add(ring, disc, hole); gr.userData = { ring, disc, hole }; return gr;
      });
      const prog = 1 - w.t / w.max, R = w.r + 10, u = o.userData;
      o.position.set(toX(w.x), 0.9, toZ(w.y));
      u.ring.scale.setScalar(R); u.ring.material.opacity = 0.5 + 0.5 * Math.sin(g.time * 14);
      u.disc.scale.setScalar(R * prog); u.hole.scale.setScalar(w.r * 0.8 * prog);
    }
    this.endPools();
  },

  /* ------------------------------ monde vivant ------------------------------ */
  syncWorld(g, dt) {
    const p = g.player, t = g.time;
    // voiture
    if (this.cosV !== Cosmetics.version) { // Garage : voiture + couleur des balles traçantes
      this.cosV = Cosmetics.version;
      this.applyCar();
      this.tracerMat.color.copy(col(Cosmetics.eq('tracer').color)).multiplyScalar(5);
    }
    const c = p && g.car ? g.car : { x: MAP.car.x, y: MAP.car.y, yaw: Math.PI }, co = this.carObj;
    co.visible = c.show !== false;
    if (co.visible) {
      co.position.set(toX(c.x), 0, toZ(c.y)); co.rotation.y = c.yaw;
      const lit = g.state === 'intro' || g.state === 'escape' || this.env.night > 0.3;
      for (const l of co.userData.lights) l.visible = lit;
    }
    // zones : barricades et voiles
    for (const gt of this.gates) gt.group.visible = !World.isUnlocked(gt.zone);
    for (const [id, v] of Object.entries(this.veils)) {
      const target = World.isUnlocked(id) ? 0 : 0.6;
      v.material.opacity += (target - v.material.opacity) * Math.min(1, dt * 1.5);
      v.visible = v.material.opacity > 0.01;
    }
    // portes des refuges
    for (const [id, d] of Object.entries(this.doors)) {
      const open = World.isUnlocked(d.zone), sh = g.shelters && g.shelters[id];
      d.ring.visible = open && !!p;
      const broken = sh && sh.broken;
      d.ring.material.color.set(broken ? '#ff3a2a' : d.color).multiplyScalar(1.6);
      d.ring.scale.setScalar(22 + Math.sin(t * 3) * 2);
      d.ring.material.opacity = (g.phase === 'break' ? 0.95 : 0.55) * (0.7 + 0.3 * Math.sin(t * 3));
      d.leaf.position.x = p && p.inside === id ? 12 : 0;
      d.leaf.rotation.z = broken ? 0.5 : 0; d.leaf.position.y = broken ? 9 : 15;
    }
    // bâtiments : transparents quand ils cachent la survivante
    if (p) for (const B of this.blds) {
      const b = B.b, hide = p.x > b.x0 - 20 && p.x < b.x1 + 20 && p.y < (b.under ? b.y1 + 10 : b.y0 + 10) && p.y > b.y0 - b.h * 0.75 - 30;
      const target = hide ? 0.32 : 1;
      if (Math.abs(B.fade - target) < 0.01) continue;
      B.fade += (target - B.fade) * Math.min(1, dt * 8);
      if (Math.abs(B.fade - target) < 0.01) B.fade = target;
      const tr = B.fade < 0.99;
      for (const m of B.mats) { if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = B.fade; m.depthWrite = !tr; }
    }
    // lampadaires allumés la nuit
    for (const l of this.lamps) l.material.color.copy(col('#ffe2a0')).multiplyScalar(0.4 + this.env.night * 3);
    this.syncDog(g, dt);
    this.syncLife(g, dt);
  },

  /** Vie du décor : corbeaux qui tournoient, hélicoptère de passage */
  syncLife(g, dt) {
    const t = g.time;
    for (const c of this.crows) {
      const a = c.ph + t * c.sp;
      c.o.position.set(toX(c.cx + Math.cos(a) * c.r), c.h + Math.sin(t * 1.3 + c.ph) * 6, toZ(c.cy + Math.sin(a) * c.r));
      c.o.rotation.y = -a + (c.sp > 0 ? 0 : Math.PI);
      const flap = Math.sin(t * 9 + c.ph) * 0.6;
      c.o.children[0].rotation.z = flap; c.o.children[1].rotation.z = -flap;
    }
    // hélicoptère : traverse la carte en ligne droite toutes les ~1 à 2 minutes (pas dans les menus)
    const playing = g.player && g.state !== 'menu';
    if (!this.fly) {
      this.flyT -= dt;
      if (this.flyT <= 0 && playing) {
        const f = this.focus || { x: 0, z: 0 }, a = Math.random() * TAU, side = Math.random() < 0.5 ? 1 : -1;
        const cx = f.x + U.rand(-150, 150), cz = f.z + U.rand(-150, 150), L = 1600;
        this.fly = { x0: cx - Math.cos(a) * L, z0: cz - Math.sin(a) * L, x1: cx + Math.cos(a) * L, z1: cz + Math.sin(a) * L, t: 0, dur: 11, a, side };
        this.heli.visible = this.heliShadow.visible = true;
      }
    } else {
      const F = this.fly; F.t += dt;
      const k = F.t / F.dur, x = F.x0 + (F.x1 - F.x0) * k, z = F.z0 + (F.z1 - F.z0) * k, h = 210 + Math.sin(k * Math.PI) * 30;
      this.heli.position.set(x, h, z);
      this.heli.rotation.set(0.12, Math.atan2(F.x1 - F.x0, F.z1 - F.z0), Math.sin(t * 0.8) * 0.05);
      const u = this.heli.userData; u.rotor.rotation.y += dt * 40; u.tail.rotation.x += dt * 50; u.lamp.visible = Math.sin(t * 8) > 0;
      this.heliShadow.position.set(x + 60, 0.6, z + 40); this.heliShadow.rotation.y = this.heli.rotation.y;
      // bruit de rotor quand il est proche
      const f = this.focus, d = f ? Math.hypot(x - f.x, z - f.z) : 9999;
      if (d < 900 && (this._thump = (this._thump || 0) - dt) <= 0) { this._thump = 0.11; Sfx.play('heli'); }
      if (k >= 1) { this.fly = null; this.flyT = U.rand(60, 110); this.heli.visible = this.heliShadow.visible = false; }
    }
  },

  syncDog(g, dt) {
    const garageDog = UI.screen === 'lobby' && UI.tab === 'garage' && UI.garageCat === 'dog';
    const menuDog = !g.player && g.state === 'menu' && (Save.data.perm.dog || garageDog);
    const d = menuDog ? { x: this.SHOW.x - 4, y: this.SHOW.y + 34, vx: 0, vy: 0, biting: 0 } : g.dog;
    if (!d || !ASSETS.dog || (!g.player && !menuDog)) { if (this.dog) this.dog.root.visible = false; return; }
    if (menuDog && this.dog) this.dog.face = 0.5;
    if (!this.dog) {
      const a = this.dog = makeActor(ASSETS.dog, 30, new THREE.Color('#e8e4dc'));
      this.addContact(a, 22); this.scene.add(a.root); a.face = 0;
      play(a, 'Idle');
    }
    const a = this.dog;
    a.root.visible = true;
    a.root.position.set(toX(d.x), 0, toZ(d.y));
    const sp = Math.hypot(d.vx, d.vy);
    if (sp > 5) a.face = lerpAngle(a.face, Math.atan2(d.vx, d.vy), Math.min(1, dt * 10));
    a.root.rotation.y = a.face;
    if (d.biting > 0) play(a, 'Attack', { speed: 1.5, fade: 0.08 });
    else if (sp > 200) play(a, 'Gallop', { speed: 1.1 });
    else if (sp > 5) play(a, 'Walk', { speed: U.clamp(sp / 120, 0.7, 1.6) });
    else play(a, 'Idle');
    a.mixer.update(dt);
    if (a.cosV !== Cosmetics.version) { a.cosV = Cosmetics.version; this.applyDog(a); }
    // l'accessoire suit le cou
    const neck = a.bones.Neck2 || a.bones.Neck1;
    if (a.acc && neck) {
      a.root.updateMatrixWorld(true);
      const v = this._nv || (this._nv = new THREE.Vector3());
      neck.getWorldPosition(v); a.root.worldToLocal(v);
      a.acc.position.copy(v); a.acc.rotation.set(0.5, 0, 0);
    }
  },

  /** Caisses de ravitaillement (parachute pendant la chute) et flaques acides */
  syncDrops(g) {
    for (const c of g.crates || []) {
      const o = this.take('crate', () => {
        const gr = new THREE.Group(), wood = mat('#8a6a3a', { r: 0.85 }), band = mat('#3a5a2a', { r: 0.7 });
        const box2 = new THREE.Group(); gr.add(box2);
        box2.add(mesh(G.box(20, 16, 20), wood)); for (const y of [-5, 5]) { const b = mesh(G.box(20.6, 2.5, 20.6), band); b.position.y = y; box2.add(b); }
        const red = mesh(G.box(6, 6, 20.8), mat('#e8e4dc', { r: 0.7 })); box2.add(red); const cr = mesh(G.box(2, 6.2, 21), mat('#c8201a', { r: 0.6 })); box2.add(cr);
        const chute = new THREE.Group(); gr.add(chute);
        const canopy = mesh(new THREE.SphereGeometry(26, 14, 6, 0, TAU, 0, Math.PI / 2), mat('#e8a818', { r: 0.9 }), true); canopy.position.y = 60; chute.add(canopy);
        const lineM = new THREE.LineBasicMaterial({ color: '#3a3026' });
        for (const [x, z] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) chute.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 60, z), new THREE.Vector3(x * 0.4, 8, z * 0.4)]), lineM));
        const beam = new THREE.Mesh(G.cyl(6, 9, 140, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7dff6a').multiplyScalar(1.3), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
        beam.position.y = 70; gr.add(beam);
        gr.userData = { box: box2, chute, beam };
        return gr;
      });
      const u = o.userData, k = U.clamp(c.t / c.fall, 0, 1);
      o.position.set(toX(c.x), c.landed ? 0 : (1 - k) * 420, toZ(c.y));
      u.box.position.y = 8; u.box.rotation.y = g.time * (c.landed ? 0 : 0.6);
      u.chute.visible = !c.landed && c.t > 0; o.visible = c.t > -0.01;
      u.beam.visible = c.landed; u.chute.rotation.z = Math.sin(g.time * 2 + c.x) * 0.08;
    }
    for (const a of g.acid || []) {
      const o = this.take('acid', () => new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9aff2a').multiplyScalar(1.2), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
      o.position.set(toX(a.x), 0.7, toZ(a.y));
      o.scale.setScalar(a.r * (0.8 + 0.08 * Math.sin(g.time * 6 + a.x)) * Math.min(1, (a.max - a.t) * 4));
      o.material.opacity = 0.45 * Math.min(1, a.t / 1.2);
    }
  },

  /** Objets d'objectif, tourelles, barbelés */
  syncAllies(g) {
    this.syncDrops(g);
    for (const tu of g.turrets || []) {
      const o = this.take('turret', () => {
        const gr = new THREE.Group(), metal = mat('#3a3e44', { r: 0.4, m: 0.6 }), dark = mat('#1e2024', { r: 0.5, m: 0.5 });
        for (let k = 0; k < 3; k++) { const leg = mesh(G.cyl(0.9, 0.9, 20, 6), dark); const a = k * TAU / 3; leg.position.set(Math.cos(a) * 6, 8, Math.sin(a) * 6); leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); gr.add(leg); }
        const head = new THREE.Group(); head.position.y = 19; gr.add(head);
        head.add(mesh(G.box(10, 8, 12), metal));
        const brl = mesh(G.cyl(1, 1, 14, 8), dark); brl.rotation.x = Math.PI / 2; brl.position.set(0, 1, 10); head.add(brl);
        const led = mesh(G.sphere(1.2, 8, 6), glowMat('#3ad6ff', 4), false); led.position.set(0, 5, 3); head.add(led);
        const fl = mesh(G.sphere(2.2, 8, 6), glowMat('#ffd27a', 5), false); fl.position.set(0, 1, 18); head.add(fl);
        gr.userData = { head, fl };
        return gr;
      });
      o.position.set(toX(tu.x), 0, toZ(tu.y));
      o.userData.head.rotation.y = Math.atan2(Math.cos(tu.aim), Math.sin(tu.aim));
      o.userData.fl.visible = tu.fire > 0;
      o.scale.setScalar(tu.t < 3 && Math.floor(tu.t * 8) % 2 ? 0.92 : 1);
    }
    for (const tr of g.traps || []) {
      const o = this.take('trap', () => {
        const gr = new THREE.Group(), wire = mat('#6a6a6a', { r: 0.35, m: 0.8 });
        for (let k = 0; k < 3; k++) { const coil = mesh(new THREE.TorusGeometry(1, 0.05, 4, 40), wire); coil.rotation.x = Math.PI / 2; coil.position.y = 4 + k * 2; coil.scale.setScalar(0.75 + k * 0.12); gr.add(coil); }
        for (let k = 0; k < 6; k++) { const st = mesh(G.cyl(0.6, 0.6, 12, 5), mat('#5a4632')); const a = k * TAU / 6; st.position.set(Math.cos(a) * 0.9, 6, Math.sin(a) * 0.9); gr.add(st); }
        return gr;
      });
      o.position.set(toX(tr.x), 0, toZ(tr.y));
      o.children.forEach((ch, i) => { if (i < 3) ch.scale.setScalar(tr.r * (0.75 + i * 0.12)); else { const a = (i - 3) * TAU / 6; ch.position.set(Math.cos(a) * tr.r * 0.9, 6, Math.sin(a) * tr.r * 0.9); } });
    }
    const ob = g.objective;
    if (!ob) return;
    if (ob.type === 'fetch') {
      const it = ob.item;
      const o = this.take(it.kind, () => {
        const gr = new THREE.Group();
        const model = it.kind === 'gascan' ? placeModel('gascan', 14, 6, 18, null) : null;
        if (model) gr.add(model);
        else { const box = mesh(G.box(16, 11, 10), mat('#2a2d32', { r: 0.4, m: 0.4 })); box.position.y = 5.5; gr.add(box); for (const x of [-4, 4]) { const tm = mesh(G.cyl(1.4, 1.4, 3, 8), mat(x < 0 ? '#d8282a' : '#e8e8e8', { m: 0.5 })); tm.position.set(x, 12, 0); gr.add(tm); } const lbl = mesh(G.box(16.4, 4, 10.4), mat('#ffc21a')); lbl.position.y = 5; gr.add(lbl); }
        const beam = new THREE.Mesh(G.cyl(5, 8, 160, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc21a').multiplyScalar(1.4), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
        beam.position.y = 80; gr.add(beam);
        const halo = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc21a').multiplyScalar(1.8), transparent: true, opacity: 0.8, depthWrite: false }));
        halo.position.y = 0.9; gr.add(halo);
        gr.userData = { beam, halo, body: gr.children[0] };
        return gr;
      });
      const u = o.userData;
      if (it.carried) { o.position.set(toX(g.player.x), 26, toZ(g.player.y) - 2); o.rotation.y = this.player ? this.player.face : 0; o.scale.setScalar(0.7); u.beam.visible = u.halo.visible = false; }
      else { o.position.set(toX(it.x), 2 + Math.sin(g.time * 3) * 1.5, toZ(it.y)); o.rotation.y = g.time; o.scale.setScalar(1); u.beam.visible = u.halo.visible = true; u.halo.scale.setScalar(18 + Math.sin(g.time * 5) * 2); }
      // la voiture devient la cible quand on porte l'objet
      if (it.carried) { const r = this.take('zone', () => this.makeZoneRing()); r.position.set(toX(MAP.car.x), 0.9, toZ(MAP.car.y)); r.userData.ring.scale.setScalar(80); r.userData.disc.scale.setScalar(80 * (0.5 + 0.5 * Math.sin(g.time * 4))); }
    } else if (ob.type === 'defend') {
      const gn = ob.gen;
      const o = this.take('gen', () => {
        const gr = new THREE.Group();
        const m = placeModel('gastank', 40, 40, 52, '#c8d0a0') || mesh(G.box(40, 50, 40), mat('#6a7a4a'));
        gr.add(m);
        const lamp = mesh(G.sphere(3, 10, 8), glowMat('#7dff6a', 4), false); lamp.position.y = 56; gr.add(lamp);
        gr.userData = { lamp, mats: m.userData ? m.userData.mats || [] : [] };
        return gr;
      });
      o.position.set(toX(gn.x), 0, toZ(gn.y));
      o.visible = !ob.failed;
      o.userData.lamp.visible = Math.sin(g.time * 6) > 0;
      for (const m of o.userData.mats) m.emissive.setRGB(gn.flash > 0 ? 0.8 : 0, gn.flash > 0 ? 0.3 : 0, 0);
    } else if (ob.at) {
      const o = this.take('zone', () => this.makeZoneRing());
      const k = ob.progress / ob.time;
      o.position.set(toX(ob.at.x), 0.9, toZ(ob.at.y));
      o.userData.ring.scale.setScalar(ob.r); o.userData.disc.scale.setScalar(Math.max(0.01, ob.r * k));
    }
  },
  makeZoneRing() {
    const gr = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc21a').multiplyScalar(1.8), transparent: true, opacity: 0.9, depthWrite: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffc21a', transparent: true, opacity: 0.22, depthWrite: false }));
    gr.add(ring, disc); gr.userData = { ring, disc };
    return gr;
  },

  /** Ambiance : jour, nuit (lampe torche), tempête de sable (brume orangée) */
  syncEnv(g, dt) {
    const E = this.env, k = Math.min(1, dt * 0.8);
    // dans les menus : ambiance choisie au Garage (jour, crépuscule, nuit, tempête)
    const theme = g.state === 'menu' && !g.player ? Cosmetics.eq('theme').theme : null;
    const wantNight = theme ? theme === 'night' : !!g.night && g.state !== 'menu';
    const wantStorm = theme ? theme === 'storm' : !!g.storm;
    E.night += ((wantNight ? 1 : 0) - E.night) * k;
    E.storm += ((wantStorm ? 1 : 0) - E.storm) * Math.min(1, dt * 1.2);
    E.dusk = (E.dusk || 0) + ((theme === 'dusk' ? 1 : 0) - (E.dusk || 0)) * k;
    const n = E.night, st = E.storm, du = E.dusk;
    if ((this._ambT = (this._ambT || 0) - dt) <= 0) { this._ambT = 0.3; Sfx.ambience(st, n); } // vent du désert
    this.hemi.intensity = 1.15 * (1 - 0.8 * n) * (1 - 0.25 * st) * (1 - 0.3 * du);
    this.sun.intensity = 2.6 * (1 - 0.9 * n) * (1 - 0.55 * st) * (1 - 0.3 * du);
    this.sun.color.copy(col('#ffd7a0')).lerp(col('#7a9aff'), n).lerp(col('#ff7a3a'), du);
    this.fill.intensity = 0.35 + n * 0.25;
    const fogC = this._fogC || (this._fogC = new THREE.Color());
    fogC.copy(col('#d9b88c')).lerp(col('#0d1320'), n).lerp(col('#c48a52'), st * (1 - n * 0.5)).lerp(col('#b86a4a'), du * 0.8);
    this.scene.fog.color.copy(fogC); this.scene.background.copy(fogC);
    const f = this.fogBase || { near: 1000, far: 3000 };
    // la caméra est à ~f.near/1.6 du sol : la brume ne doit jamais commencer avant
    this.scene.fog.near = f.near * (1 - 0.2 * n) * (1 - 0.42 * st);
    this.scene.fog.far = f.far * (1 - 0.3 * n) * (1 - 0.58 * st);
    this.renderer.toneMappingExposure = 1.05 + n * 0.25;
    // lampe torche dans la direction du tir
    const p = g.player;
    this.torch.intensity = n * 5.5; this.aura.intensity = n * 1.6;
    if (p && n > 0.01) {
      const vis = !p.inside && g.showPlayer !== false;
      this.torch.visible = this.aura.visible = vis;
      this.torch.position.set(toX(p.x), 42, toZ(p.y));
      this.torch.target.position.set(toX(p.x + Math.cos(p.aimAngle) * 220), 0, toZ(p.y + Math.sin(p.aimAngle) * 220));
      this.aura.position.set(toX(p.x), 60, toZ(p.y));
    } else this.torch.visible = this.aura.visible = false;
  },

  /** Point du sol sous la souris (coordonnées monde), ou null */
  cursorWorld() {
    const m = Input.mouse;
    if (!m.has) return null;
    const ray = this._ray || (this._ray = new THREE.Raycaster()), v = this._cv || (this._cv = new THREE.Vector2());
    const plane = this._gp || (this._gp = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)), hit = this._ch || (this._ch = new THREE.Vector3());
    v.set(m.x / this.vw * 2 - 1, -(m.y / this.vh) * 2 + 1);
    ray.setFromCamera(v, this.camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x + W / 2, y: hit.z + H / 2 };
  },

  /** Cible sous le doigt / la souris (zombie ou fût), en coordonnées écran CSS */
  pick(g, sx, sy) {
    const thr = 46 * this.ui;
    let best = null, bd = thr * thr;
    const test = (o, h) => {
      const [x0, y0] = this.project(o.x, o.y, 0), [x1, y1] = this.project(o.x, o.y, h);
      const mx = Math.max(Math.min(sx, Math.max(x0, x1)), Math.min(x0, x1)), my = Math.max(Math.min(sy, Math.max(y0, y1)), Math.min(y0, y1));
      const d = (sx - mx) ** 2 + (sy - my) ** 2;
      if (d < bd) { bd = d; best = o; }
    };
    for (const e of g.enemies) if (!e.dead && e.age > 0.4) test(e, e.def.boss ? 130 : 44);
    for (const b of g.barrels) if (!b.dead) test(b, 22);
    return best;
  },

  /* ------------------------------ particules ------------------------------ */
  syncParticles(g) {
    const N = this.pNormal, A = this.pAdd, t = g.time;
    N.begin(); A.begin();
    for (const q of g.particles) {
      const a = Math.max(0, q.life / q.max), x = toX(q.x), z = toZ(q.y);
      if (q.puff) N.add(x, q.ground ? 3 : 10 + (1 - a) * 12, z, col(q.pc || '#f2dcb6'), q.size * (q.ground ? 3.2 : 3.6), a * (q.ground ? 0.4 : 0.55));
      else if (q.star) { A.add(x, 20, z, col(q.color), q.size * 3.5 * (1.2 - a), a * 0.9); }
      else if (q.petal) A.add(x, 10 + 90 * a, z, col(q.color), q.size * 2.2, Math.min(1, a * 3) * 0.9); // braises qui retombent
      else if (q.casing) N.add(x, 1 + q.z, z, col(q.color), q.gib ? q.size * 2.8 : 4.5, Math.min(1, a * 3)); // douilles et morceaux
      else if (q.flame) {
        A.add(x, 14 + (1 - a) * 10, z, col(q.color), q.size * 3.2, a * 0.85);
        if (Math.random() < 0.15) N.add(x, 22 + (1 - a) * 18, z, col('#3a3028'), q.size * 4, a * 0.25); // fumée
      }
      else {
        const isGoo = q.color.toLowerCase() !== '#ffd24a';
        (isGoo ? N : A).add(x, 8 + a * 14, z, col(q.color), q.size * 2.6, a);
      }
    }
    // traînée lumineuse derrière les crachats des zombies (bien visibles sur le sable)
    for (const b of g.eBullets) {
      const sp = Math.hypot(b.vx, b.vy) || 1, dx = b.vx / sp, dy = b.vy / sp, s = Math.max(4.5, b.r * 1.05);
      for (let i = 1; i <= 7; i++) {
        const k = 1 - i / 8, w = Math.sin(t * 30 + i * 1.7) * 1.5;
        A.add(toX(b.x - dx * i * s * 0.9) - dy * w, 17 - i * 0.4, toZ(b.y - dy * i * s * 0.9) + dx * w, col(i % 2 ? '#b8ff3a' : '#e8ff7a'), s * 2.4 * k, 0.75 * k);
      }
    }
    // brume de sable qui dérive au ras du sol + poussière dorée dans la lumière
    const fx0 = this.focus ? this.focus.x : 0, fz0 = this.focus ? this.focus.z : 0, night = this.env.night, storm = this.env.storm;
    const light = LOW || this.lite; // téléphones modestes : moins de particules d'ambiance
    for (let i = 0; i < (light ? 18 : 50); i++) {
      const x = fx0 + ((i * 97.3 + t * (10 + (i % 4) * 4)) % 1000) - 500, z = fz0 + ((i * 61.7 + t * 6) % 800) - 400;
      A.add(x, 20 + (i % 5) * 14 + Math.sin(t + i) * 6, z, col(night > 0.5 ? '#9ab8ff' : '#ffe6b0'), 3 + (i % 3), (0.35 + 0.25 * Math.sin(t * 1.7 + i)) * (1 - night * 0.6));
    }
    // feux (épaves, feux de camp, fûts) : flammes + colonne de fumée, seulement près de la caméra
    for (const F of this.fires) {
      const fx = toX(F.x), fz = toZ(F.y);
      if (Math.abs(fx - fx0) > 900 || Math.abs(fz - fz0) > 800) continue;
      if (F.flame) for (let i = 0; i < 7; i++) {
        const ph = (t * (1.6 + (i % 3) * 0.3) + i * 0.37) % 1, sw = Math.sin(t * 6 + i * 2.1) * 4 * F.size;
        A.add(fx + sw * (i % 2 ? 1 : -1), F.h + ph * 26 * F.size, fz + Math.cos(i * 1.7) * 4 * F.size, col(i % 3 ? '#ff7a1a' : '#ffc23a'), (9 - ph * 6) * F.size, (1 - ph) * 0.9);
      }
      for (let i = 0; i < (light ? 4 : 9); i++) { // fumée qui monte et s'élargit, poussée par le vent
        const ph = (t * 0.22 + i / 9) % 1;
        N.add(fx + ph * 50 + Math.sin(t + i) * 6, F.h + 10 + ph * 170, fz - ph * 20, col(F.flame ? '#2a2420' : '#4a4440'), (10 + ph * 30) * F.size, (1 - ph) * 0.45 * (ph < 0.1 ? ph * 10 : 1));
      }
    }
    // tempête : rafales de sable qui balaient l'écran
    if (storm > 0.02) for (let i = 0; i < (light ? 110 : 260); i++) {
      const sp = 260 + (i % 7) * 40, x = fx0 + ((i * 131.7 + t * sp) % 1100) - 550, z = fz0 + ((i * 71.3 + t * sp * 0.25) % 900) - 450;
      N.add(x, 6 + (i % 9) * 9, z, col(i % 3 ? '#d8a868' : '#b88048'), 2.5 + (i % 4) * 1.5, storm * (0.3 + (i % 5) * 0.08));
    }
    N.end(); A.end();
  },

  /* ------------------------------ image ------------------------------ */
  /** Qualité « Auto » : si les images ralentissent (< ~35 i/s) pendant la partie, on allège par paliers :
      résolution réduite → sans halo lumineux → sans ombres → résolution minimale */
  autoQuality(g) {
    const now = performance.now(), ft = now - (this._lastFrame || now); this._lastFrame = now;
    if (Save.data.settings.quality !== 'auto' || g.state !== 'playing' || ft > 250) { this._aqT = 0; this._aqSum = 0; this._aqN = 0; return; }
    this._aqT = (this._aqT || 0) + ft; this._aqSum = (this._aqSum || 0) + ft; this._aqN = (this._aqN || 0) + 1;
    if (this._aqT < 2500) return;
    const avg = this._aqSum / this._aqN; this._aqT = 0; this._aqSum = 0; this._aqN = 0;
    if (avg < 28) return;
    this.aqLevel = (this.aqLevel || 0) + 1;
    const r = this.renderer;
    if (this.aqLevel === 1) r.setPixelRatio(Math.max(1, r.getPixelRatio() * 0.75));
    else if (this.aqLevel === 2 && this.composer) this.composer = null;
    else if (this.aqLevel === 3) this.sun.castShadow = false;
    else if (this.aqLevel === 4) { r.setPixelRatio(0.75); this.lite = true; }
    else return;
    this.resize();
  },

  /* ------------------------------ établi d'armurier ------------------------------ */
  initGunsmith() {
    const s = this.gsScene = new THREE.Scene();
    s.background = new THREE.Color('#15110d');
    // reflets du métal : petite « pièce » lumineuse (néons + lampe chaude) convertie en carte d'environnement
    const env = new THREE.Scene(), em = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12), em('#2a2018', 1)));
    for (const [x, y, z, w, h, c, k] of [[0, 40, 0, 60, 4, '#fff4e0', 6], [-45, 10, 0, 4, 30, '#ffd8a0', 4], [30, 5, -40, 30, 20, '#ff9a3a', 2.5], [0, -30, 30, 50, 6, '#5a8aff', 1.5]]) {
      const pnl = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.min(w, h)), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
      pnl.position.set(x, y, z); env.add(pnl);
    }
    const pm2 = new THREE.PMREMGenerator(this.renderer);
    s.environment = pm2.fromScene(env, 0.04).texture; s.environmentIntensity = 0.9; pm2.dispose();
    s.add(new THREE.HemisphereLight('#fff0d8', '#3a2a1a', 1.2));
    const key = this.gsKey = new THREE.DirectionalLight('#fff2e0', 2.6); key.position.set(-30, 40, 25); s.add(key);
    const rim = new THREE.DirectionalLight('#ffa040', 2.4); rim.position.set(30, 18, -40); s.add(rim);
    const fill = new THREE.DirectionalLight('#6aa8ff', 0.9); fill.position.set(-20, -25, -10); s.add(fill);
    // fond : panneau perforé d'atelier éclairé par une lampe, pochoir DEADSAND
    const tex = canvasTex(1024, (x, S) => {
      const gr = x.createRadialGradient(S * 0.42, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.75);
      gr.addColorStop(0, '#5a4630'); gr.addColorStop(0.55, '#2e2418'); gr.addColorStop(1, '#100c08');
      x.fillStyle = gr; x.fillRect(0, 0, S, S);
      x.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 16; i < S; i += 32) for (let j = 16; j < S; j += 32) { x.beginPath(); x.arc(i, j, 4.5, 0, TAU); x.fill(); }
      x.globalAlpha = 0.12; x.fillStyle = '#ffc21a'; x.font = '900 120px Arial Black, Arial'; x.textAlign = 'center';
      x.fillText('DEADSAND', S / 2, S * 0.86); x.font = '900 40px Arial'; x.fillText('ARMURERIE DE FORTUNE', S / 2, S * 0.93);
      x.globalAlpha = 1;
    }, 1);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    back.position.set(70, 10, 0); back.rotation.y = -Math.PI / 2; s.add(back);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(300, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.9 }));
    table.position.y = -11; s.add(table);
    this.gsShadow = new THREE.Mesh(this.contactGeo, new THREE.MeshBasicMaterial({ color: '#000', alphaMap: this.dotTex, transparent: true, opacity: 0.45, depthWrite: false }));
    this.gsShadow.position.y = -10.9; s.add(this.gsShadow);
    this.gsCam = new THREE.PerspectiveCamera(28, 1, 1, 2000);
    this.gsPivot = new THREE.Group(); s.add(this.gsPivot);
    this.gsGuns = {};
    this.gsFocus = new THREE.Vector3(); this.gsDist = 0; this.gsShot = 0;
  },
  /** L'arme tourne lentement de profil (canon vers la droite), la caméra s'approche de la pièce choisie */
  drawGunsmith(g) {
    if (!this.gsScene) this.initGunsmith();
    const gs = g.gs, now = performance.now() / 1000, dt = U.clamp(now - (this._gsT || now), 0, 0.1); this._gsT = now;
    const id = gs.gun;
    let gun = this.gsGuns[id];
    if (!gun) { gun = this.gsGuns[id] = buildGun(id, this.gunM[id]); this.gsPivot.add(gun); }
    for (const [k, o] of Object.entries(this.gsGuns)) o.visible = k === id;
    const sig = JSON.stringify(g.gunMods[id] || {});
    if (gun.userData.sig !== sig) { gun.userData.sig = sig; applyGunMods(gun, g.gunMods[id] || {}); }
    // peinture : survol > aperçu choisi > peinture équipée
    const hv = gs.hover && gs.hover.startsWith('skin:') ? gs.hover.slice(5) : null;
    const skinId = gs.tab === 'paint' ? (hv || gs.skin || Cosmetics.eq('weapon').id) : Cosmetics.eq('weapon').id;
    const skinKey = (Cosmetics.get(skinId) || {}).skin;
    if (this._gsSkin !== skinKey) { this._gsSkin = skinKey; this.applyGunSkin(skinKey); }
    // cadrage : l'arme est centrée dans la partie gauche de l'écran (le panneau est à droite)
    const u = gun.userData, bx = u.box, size = bx.getSize(new THREE.Vector3()), ctr = bx.getCenter(new THREE.Vector3());
    gun.position.copy(ctr).multiplyScalar(-1);
    // achat : la pièce « saute » + éclair de lumière
    gs.pulse = Math.max(0, (gs.pulse || 0) - dt * 2.2);
    for (const [k, sl] of Object.entries(u.slots)) sl.scale.setScalar(k === gs.part ? 1 + Math.sin(gs.pulse * Math.PI) * 0.18 : 1);
    this.gsKey.intensity = 2.6 + gs.pulse * 3;
    // tir d'essai : rafale au rythme de la cadence (on voit la cadence augmenter)
    const rate = id === 'rifle' ? g.player.weapon.fireRate : id === 'shotgun' ? 1 / Gunsmith.tune(g, 'shotgun', WEAPONS.shotgun.stats((g.weapons.shotgun || { lvl: 1 }).lvl)).cd : 10;
    const cyc = now % 3.2, shooting = cyc > 2.2 && gs.tab === 'parts';
    const phase = shooting ? ((cyc - 2.2) * rate) % 1 : 1;
    u.flash.visible = shooting && phase < (id === 'flamer' ? 0.8 : 0.3);
    if (u.flash.visible) { const k = 0.8 + Math.random() * 0.5; u.flash.scale.set(k, k, k * (id === 'flamer' ? 3 : 2)); }
    const kick = shooting && phase < 0.3 ? (0.3 - phase) * (id === 'shotgun' ? 3 : 1.6) : 0;
    gun.position.z -= kick;
    this.gsPivot.rotation.set(0, (gs.yaw || 0) + Math.sin(now * 0.45) * 0.22, Math.sin(now * 0.3) * 0.03);
    this.gsShadow.scale.set(size.x * 2 + 5, 1, size.z * 0.85);
    // caméra : cadre l'arme entière, ou s'approche de la pièce survolée / sélectionnée
    const vw = this.vw, vh = this.vh, cam = this.gsCam;
    const panel = document.querySelector('.panel.gunsmith'), pw = panel ? panel.getBoundingClientRect().width + 12 : 0;
    const narrow = vw - pw < vw * 0.3; // écran trop étroit : l'arme passe au-dessus
    cam.aspect = vw / vh;
    cam.setViewOffset(vw, vh, narrow ? 0 : pw / 2, narrow ? vh * 0.25 : 0, vw, vh);
    const t = Math.tan(cam.fov * Math.PI / 360), areaW = narrow ? vw : vw - pw;
    const dFit = Math.max(size.z / (0.6 * areaW / vw * 2 * t * cam.aspect), size.y / (0.42 * 2 * t * (narrow ? 0.5 : 1)));
    const ph = gs.tab === 'parts' ? (gs.hover && !gs.hover.startsWith('skin:') ? gs.hover : gs.part) : null;
    const target = new THREE.Vector3(), anc = ph && u.anchors[ph];
    if (anc) { this.gsPivot.updateMatrixWorld(true); target.copy(anc); gun.localToWorld(target); target.multiplyScalar(0.4); }
    const dWant = dFit * (anc ? 0.86 : 1);
    const k = this.gsDist ? Math.min(1, dt * 5) : 1;
    this.gsFocus.lerp(target, k); this.gsDist += (dWant - this.gsDist) * k;
    const dir = new THREE.Vector3(-1, 0.22, 0.2).normalize();
    cam.position.copy(this.gsFocus).addScaledVector(dir, this.gsDist);
    cam.lookAt(this.gsFocus); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    this.renderer.render(this.gsScene, cam);
  },
  /** Étiquettes des pièces (comme un écran de personnalisation d'arme) : trait + nom + niveau */
  drawGunsmithLabels(c, g) {
    const gs = g.gs, gun = this.gsGuns && this.gsGuns[gs.gun];
    if (!gun || gs.tab !== 'parts') return;
    const u = gun.userData, v = new THREE.Vector3(), roman = ['', ' I', ' II', ' III'];
    const panel = document.querySelector('.panel.gunsmith'), right = panel ? panel.getBoundingClientRect().left - 8 : this.vw;
    const placed = []; // étiquettes déjà posées (pour éviter qu'elles se chevauchent)
    GUN_PARTS[gs.gun].parts.forEach((pt, i) => {
      const a = u.anchors[pt.id]; if (!a) return;
      v.copy(a); gun.localToWorld(v); v.project(this.gsCam);
      const x = (v.x + 1) / 2 * this.vw, y = (1 - v.y) / 2 * this.vh;
      if (x < 0 || x > right || y < 0 || y > this.vh) return;
      const on = pt.id === gs.part || pt.id === gs.hover, lv = Gunsmith.lvl(g, gs.gun, pt.id);
      const up = a.y > 0.4 || (a.y > -1 && i % 2 === 0), lx = x + (i % 2 ? 26 : -26) * this.ui;
      let ly = y + (up ? -1 : 1) * (40 + (i % 2) * 18) * this.ui;
      const txt = `${pt.name.toUpperCase()}${roman[lv]}`, size = (on ? 14 : 11.5) * this.ui;
      c.font = `900 ${size}px ${FONT}`; const w = c.measureText(txt).width + 14, h = size * 1.9;
      for (let k = 0; k < 6 && placed.some(r => Math.abs(r.x - lx) < (r.w + w) / 2 && Math.abs(r.y - ly) < h); k++) ly += (up ? -1 : 1) * h;
      placed.push({ x: lx, y: ly, w });
      c.strokeStyle = on ? '#ffc21a' : 'rgba(255,240,210,0.55)'; c.lineWidth = on ? 2 : 1.2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(lx, ly); c.stroke();
      c.fillStyle = on ? '#ffc21a' : '#fff0d2'; c.beginPath(); c.arc(x, y, on ? 4.5 : 3, 0, TAU); c.fill();
      this.plate(c, lx - w / 2, ly - size * 0.85, w, size * 1.7, 6);
      this.label(c, txt, lx, ly, size, on ? '#ffc21a' : '#f2e6d0', FONT, 0.18);
    });
  },
  /** Établis : hologramme qui tourne, anneau qui pulse (visibles quand leur zone est ouverte) */
  syncBenches(g) {
    if (!this.benchFx) return;
    const p = g.player, t = g.time;
    for (const f of this.benchFx) {
      const open = World.isUnlocked(f.b.zone);
      f.ring.visible = f.holo.visible = f.sign.visible = open;
      if (!open) continue;
      const near = p && Math.hypot(p.x - f.b.x, p.y - f.b.y) < 62;
      f.holo.rotation.y = t * 1.2; f.holo.position.y = 50 + Math.sin(t * 2 + f.b.x) * 2.5;
      f.ring.scale.setScalar((near ? 26 : 20) + Math.sin(t * 4 + f.b.y) * 1.5);
      f.ring.material.opacity = near ? 1 : 0.7;
    }
  },

  draw(g) {
    this.autoQuality(g);
    if (g.state === 'gunsmith' && g.gs) { this.drawGunsmith(g); this.drawOverlay(g); return; } // partie en pause : seule l'arme est rendue
    this._gsSkin = null;
    const dt = U.clamp(g.time - this.lastT, 0, 0.1); this.lastT = g.time;
    this.syncBenches(g);
    if (g.stats !== this._runStats) { this._runStats = g.stats; this.clearDecals(); } // nouvelle partie : sol propre
    this.syncPlayer(g, dt);
    this.syncEnemies(g, dt);
    this.syncObjects(g);
    this.syncWorld(g, dt);
    this.syncEnv(g, dt);
    this.syncParticles(g);
    // caméra qui suit la survivante (ou la voiture pendant les cinématiques), sans trop sortir de la carte
    const cam = this.camera, p = g.player, ve = this.viewExt, M = 45;
    const cine = (g.state === 'intro' || g.state === 'escape' || g.state === 'victory') && g.car;
    // évasion : la caméra reste sur le parking et l'image passe au noir (on ne voit jamais l'extérieur)
    const fol = !p ? null : cine ? (g.state === 'intro' ? g.car : MAP.car) : p.inside ? World.doorOf(p.inside) : p;
    const lim = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : U.clamp(v, lo, hi));
    // menus : gros plan sur le personnage, décalé pour laisser la place au panneau
    const menu = !p && g.state === 'menu', lobby = menu && UI.screen === 'lobby', portrait = this.vw < this.vh;
    const zTarget = menu ? (lobby ? 0.42 : 0.55) : (g.camZoom || 1);
    const zoom = this.zoom = (this.zoom || 1) + (zTarget - (this.zoom || 1)) * Math.min(1, dt * 3);
    let fx, fz;
    if (menu) {
      fx = toX(this.SHOW.x - 18); fz = toZ(this.SHOW.y) - 14;
      if (lobby && !portrait) { const pw = Math.min(440, this.vw * 0.48) + 16; fx += pw / 2 * (ve.xR - ve.xL) * zoom / this.vw; }
      if (lobby && portrait) fz += 0.2 * (ve.zBot - ve.zTop) * zoom;
      if (!lobby && portrait) fz += 0.04 * (ve.zBot - ve.zTop) * zoom;
    } else {
      // la caméra reste dans la carte (marge M), en tenant compte du zoom
      fx = fol ? lim(toX(fol.x), -W / 2 - M - ve.xL * zoom, W / 2 + M - ve.xR * zoom) : 0;
      fz = fol ? lim(toZ(fol.y), -H / 2 - M - ve.zTop * zoom, H / 2 + M - ve.zBot * zoom) : toZ(MAP.startPos.y);
    }
    const k = Math.hypot(fx - this.focus.x, fz - this.focus.z) > 400 ? 1 : Math.min(1, dt * (cine ? 4 : 6));
    this.focus.x += (fx - this.focus.x) * k; this.focus.z += (fz - this.focus.z) * k;
    cam.position.copy(this.camOffset).multiplyScalar(zoom).add(this.focus);
    // le soleil (et sa carte d'ombres) suit la caméra
    this.sun.position.set(this.focus.x - 380, 620, this.focus.z + 300); this.sun.target.position.set(this.focus.x, 0, this.focus.z);
    if (CONFIG.screenShake && g.shake > 0) { cam.position.x += U.rand(-1, 1) * g.shake * 0.5; cam.position.y += U.rand(-1, 1) * g.shake * 0.5; }
    this.camTarget.set(this.focus.x, 0, this.focus.z + this.lookShift * zoom);
    cam.lookAt(this.camTarget);
    cam.updateMatrixWorld();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, cam);
    this.drawOverlay(g);
  },

  /* =====================================================================
     HUD 2D (par-dessus la 3D)
     ===================================================================== */
  project(x, y, h) {
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(toX(x), h, toZ(y)).project(this.camera);
    return [(v.x + 1) / 2 * this.vw, (1 - v.y) / 2 * this.vh];
  },

  rr(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, r); return; }
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  },
  label(c, txt, x, y, size, color = '#ffffff', font = FONT, stroke = 0.28) {
    c.font = `900 ${size}px ${font}`; c.lineJoin = 'round';
    c.lineWidth = Math.max(3, size * stroke); c.strokeStyle = 'rgba(12,10,8,0.95)'; c.strokeText(txt, x, y);
    c.fillStyle = color; c.fillText(txt, x, y);
  },
  plate(c, x, y, w, h, r = 8) {
    this.rr(c, x, y, w, h, r);
    const gr = c.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(38,36,34,0.88)'); gr.addColorStop(1, 'rgba(14,13,12,0.88)');
    c.fillStyle = gr; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.14)'; c.stroke();
  },

  drawOverlay(g) {
    const c = this.h, d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.hud.width, this.hud.height);
    c.setTransform(d, 0, 0, d, 0, 0);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (g.state === 'gunsmith') { if (g.gs) this.drawGunsmithLabels(c, g); return; }
    // chiffres de dégâts projetés
    if (g.player) for (const t of g.texts) {
      const age = t.max - t.life;
      const [sx, sy] = this.project(t.x, t.y, 34 + age * 30);
      const pop = age < 0.1 ? 0.6 + age / 0.1 * 0.7 : 1.3 - Math.min(0.3, (age - 0.1) * 1.5);
      c.globalAlpha = Math.min(1, t.life / 0.25);
      this.label(c, t.text, sx, sy, Math.max(13, t.size) * pop * this.ui, t.color);
    }
    c.globalAlpha = 1;
    // vignette de dégâts / vie basse
    const p = g.player, low = p && p.hp / p.maxHp < 0.3 && g.state === 'playing';
    const vA = Math.max(g.hurtFlash > 0 ? g.hurtFlash / 0.3 * 0.45 : 0, low ? 0.22 + 0.12 * Math.sin(g.time * 6) : 0);
    if (g.flash > 0) { c.fillStyle = `rgba(255,240,210,${g.flash / 0.35 * 0.7})`; c.fillRect(0, 0, this.vw, this.vh); } // éclair de la bombe
    if (vA > 0) {
      const gr = c.createRadialGradient(this.vw / 2, this.vh / 2, Math.min(this.vw, this.vh) * 0.32, this.vw / 2, this.vh / 2, Math.max(this.vw, this.vh) * 0.75);
      gr.addColorStop(0, 'rgba(180,0,0,0)'); gr.addColorStop(1, `rgba(180,0,0,${vA})`);
      c.fillStyle = gr; c.fillRect(0, 0, this.vw, this.vh);
    }
    const inGame = p && ['playing', 'paused', 'upgrade', 'dying'].includes(g.state);
    if (inGame) this.drawWorldMarks(c, g);
    if (p && (g.state === 'playing' || g.state === 'paused')) this.drawOffscreen(c, g);
    if (inGame) { this.drawHud(c, g); this.drawObjective(c, g); this.drawMinimap(c, g); this.drawFun(c, g); }
    if (p && (g.state === 'intro' || g.state === 'escape')) this.drawCinema(c, g);
    if (g.state === 'victory') { c.fillStyle = '#000'; c.fillRect(0, 0, this.vw, this.vh); }
    if (g.banner) this.drawBanner(c, g.banner);
    if (g.state === 'playing') this.drawJoystick(c);  },

  /** Flèches au bord de l'écran vers les zombies hors champ (le boss toujours, en gros) */
  drawOffscreen(c, g) {
    const u = this.ui, m = 22 * u, top = 64 * u + this.safe.t, bot = this.vh - m - this.safe.b;
    const cx = this.vw / 2, cy = (top + bot) / 2, p = g.player;
    const list = [];
    for (const e of g.enemies) {
      const [sx, sy] = this.project(e.x, e.y, 20);
      if (sx > m && sx < this.vw - m && sy > top && sy < bot) continue;
      list.push({ sx, sy, boss: e.def.boss, d: Math.hypot(e.x - p.x, e.y - p.y) });
    }
    for (const w of g.wave.warnings) {
      const [sx, sy] = this.project(w.x, w.y, 0);
      if (sx > m && sx < this.vw - m && sy > top && sy < bot) continue;
      list.push({ sx, sy, boss: !!ENEMY_TYPES[w.type].boss, d: Math.hypot(w.x - p.x, w.y - p.y), warn: true });
    }
    list.sort((a, b) => (b.boss - a.boss) || a.d - b.d);
    list.length = Math.min(list.length, 12);
    const o = g.objective, op = o && (o.type === 'fetch' ? (o.item.carried ? MAP.car : o.item) : o.gen || o.at);
    if (op && !(o.type === 'defend' && o.failed)) {
      const [sx, sy] = this.project(op.x, op.y, 10);
      if (!(sx > m && sx < this.vw - m && sy > top && sy < bot)) list.push({ sx, sy, obj: true, d: Math.hypot(op.x - p.x, op.y - p.y) });
    }
    for (const it of list) {
      const dx = it.sx - cx, dy = it.sy - cy;
      const tx = dx > 0 ? (this.vw - m - cx) / dx : dx < 0 ? (m - cx) / dx : Infinity;
      const ty = dy > 0 ? (bot - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
      const t = Math.min(tx, ty), x = cx + dx * t, y = cy + dy * t, a = Math.atan2(dy, dx);
      const near = U.clamp(1 - it.d / 900, 0.35, 1);
      const sz = (it.boss ? 15 : it.obj ? 13 : 8) * u * (it.obj ? 1 : 0.8 + near * 0.4);
      c.save(); c.translate(x, y); c.rotate(a);
      c.globalAlpha = it.obj ? 0.8 + 0.2 * Math.sin(g.time * 6) : it.warn ? 0.55 + 0.45 * Math.sin(g.time * 12) : 0.55 + near * 0.45;
      c.beginPath(); c.moveTo(sz, 0); c.lineTo(-sz * 0.7, -sz * 0.75); c.lineTo(-sz * 0.35, 0); c.lineTo(-sz * 0.7, sz * 0.75); c.closePath();
      c.fillStyle = it.obj ? '#ffc21a' : it.boss ? '#ff5a1a' : '#ff3a2a'; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(10,8,6,0.9)'; c.stroke();
      c.restore();
      if (it.boss) { c.globalAlpha = 1; c.font = `${16 * u}px ${FONT_UI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('💀', x - Math.cos(a) * 22 * u, y - Math.sin(a) * 22 * u); }
    }
    c.globalAlpha = 1;
  },

  /** Marqueurs dans le monde : endurance, cible verrouillée, PV des portes et du générateur */
  drawWorldMarks(c, g) {
    const u = this.ui, L = g.lock, P = g.player;
    // jauge d'endurance (charges de roulade) sous la survivante, visible quand elle n'est pas pleine
    if (P && !P.inside && g.state === 'playing') {
      const full = P.stamina >= P.staminaMax;
      this.stamA = U.clamp((this.stamA || 0) + (full ? -0.04 : 0.15), 0, 1);
      if (this.stamA > 0) {
        const [sx, sy] = this.project(P.x, P.y, 0), n = P.staminaMax, w = 13 * u, h = 4 * u, gap = 3 * u, tot = n * w + (n - 1) * gap;
        c.globalAlpha = this.stamA;
        for (let i = 0; i < n; i++) {
          const x = sx - tot / 2 + i * (w + gap), y = sy + 14 * u, f = U.clamp(P.stamina - i, 0, 1);
          this.rr(c, x - 1, y - 1, w + 2, h + 2, 3); c.fillStyle = 'rgba(10,8,6,0.85)'; c.fill();
          if (f > 0) { this.rr(c, x, y, w * f, h, 2); c.fillStyle = f >= 1 ? '#3ad6ff' : 'rgba(58,214,255,0.55)'; c.fill(); }
        }
        c.globalAlpha = 1;
      }
    }
    if (L && !L.dead && g.enemies.concat(g.barrels).includes(L)) {
      const boss = !!(L.def && L.def.boss), h = L.def ? (boss ? 70 : 22) : 11;
      const [sx, sy] = this.project(L.x, L.y, h);
      const [, sTop] = this.project(L.x, L.y, h * 2);
      const R = Math.max(18 * u, Math.abs(sy - sTop) * 1.05), a = g.time * 2.2, col2 = L.def ? '#ff3a2a' : '#ffc21a';
      c.save(); c.translate(sx, sy); c.rotate(a);
      c.lineWidth = 3 * u; c.strokeStyle = 'rgba(10,8,6,0.85)';
      for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, 0, R, k * Math.PI / 2 + 0.25, k * Math.PI / 2 + 1.3); c.stroke(); }
      c.lineWidth = 2 * u; c.strokeStyle = col2;
      for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, 0, R, k * Math.PI / 2 + 0.25, k * Math.PI / 2 + 1.3); c.stroke(); }
      c.rotate(-a);
      for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2; c.beginPath(); c.moveTo(Math.cos(an) * (R + 7 * u), Math.sin(an) * (R + 7 * u)); c.lineTo(Math.cos(an) * (R - 3 * u), Math.sin(an) * (R - 3 * u)); c.stroke(); }
      c.restore();
      if (L.def && L.hp != null) { const w = 34 * u, r = U.clamp(L.hp / L.maxHp, 0, 1); c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(sx - w / 2, sy - R - 12 * u, w, 4 * u); c.fillStyle = col2; c.fillRect(sx - w / 2, sy - R - 12 * u, w * r, 4 * u); }
    }
    // Bélier : bande rouge au sol pendant qu'il vise, juste avant de charger
    for (const e of g.enemies) {
      if (e.cstate !== 'windup') continue;
      const L2 = e.def.chargeSpeed * e.def.chargeTime, cx = Math.cos(e.cdir), cy = Math.sin(e.cdir), nx = -cy, ny = cx, w = e.r * 0.9;
      const pts = [[e.x + nx * w, e.y + ny * w], [e.x + cx * L2 + nx * w, e.y + cy * L2 + ny * w], [e.x + cx * (L2 + 30), e.y + cy * (L2 + 30)], [e.x + cx * L2 - nx * w, e.y + cy * L2 - ny * w], [e.x - nx * w, e.y - ny * w]].map(([x, y]) => this.project(x, y, 1));
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
      c.fillStyle = `rgba(255,40,20,${0.18 + 0.14 * Math.sin(g.time * 18)})`; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,60,30,0.8)'; c.stroke();
    }
    const bar = (x, y, h, r, label, color) => {
      const [sx, sy] = this.project(x, y, h), w = 60 * u, bh = 7 * u;
      if (sx < -w || sx > this.vw + w || sy < -20 || sy > this.vh + 20) return;
      this.rr(c, sx - w / 2 - 2, sy - 2, w + 4, bh + 4, 4); c.fillStyle = 'rgba(10,8,6,0.85)'; c.fill();
      this.rr(c, sx - w / 2, sy, Math.max(2, w * r), bh, 3); c.fillStyle = color; c.fill();
      if (label) { c.textAlign = 'center'; this.label(c, label, sx, sy - 9 * u, 10.5 * u, '#ffffff', FONT_UI); }
    };
    if (g.shelters) for (const [id, s] of Object.entries(g.shelters)) {
      if (!World.isUnlocked(MAP.buildings.find(b => b.id === SHELTERS[id].building).zone)) continue;
      const d = World.doorOf(id), inside = g.player.inside === id;
      if (s.broken) { const [sx, sy] = this.project(d.x, d.y, 40); c.textAlign = 'center'; this.label(c, '🚫 Porte enfoncée', sx, sy, 11 * u, '#ff6a5a', FONT_UI); }
      else if (inside || s.hp < s.max) bar(d.x, d.y, 48, s.hp / s.max, inside ? '🚪 Vous êtes ici' : '🚪', s.hp / s.max > 0.4 ? '#c9d2da' : '#ff6a5a');
    }
    const o = g.objective;
    if (o && o.type === 'defend' && !o.failed) bar(o.gen.x, o.gen.y, 70, o.gen.hp / o.gen.max, '⚡ Générateur', o.gen.hp / o.gen.max > 0.4 ? '#7dff6a' : '#ff6a5a');
    if (o && o.at && o.type !== 'defend') { const [sx, sy] = this.project(o.at.x, o.at.y, 6); c.textAlign = 'center'; this.label(c, `${Math.floor(o.progress / o.time * 100)} %`, sx, sy, 14 * u, '#ffc21a'); }
  },

  /** Panneau d'objectif (sous la barre de vie) + pièces de la voiture */
  drawObjective(c, g) {
    const u = this.ui, x = 12 + this.safe.l, y = 10 + this.safe.t + 58 * u, o = g.objective;
    let line1 = null, line2 = '';
    if (o) {
      line1 = `🎯 ${o.name}`;
      if (o.type === 'fetch') line2 = o.item.carried ? '🚗 Rapportez-le à la voiture' : `📍 À ${Math.round(Math.hypot(o.item.x - g.player.x, o.item.y - g.player.y) / 10)} m`;
      else if (o.type === 'defend') line2 = o.failed ? '❌ Détruit · nouvel essai à la prochaine vague' : `Tenez jusqu'à la fin de la vague · ${Math.ceil(o.gen.hp / o.gen.max * 100)} %`;
      else line2 = g.phase === 'break' ? 'Commence avec la vague' : `Restez dans le cercle · ${Math.ceil(Math.max(0, o.time - o.progress))} s`;
    } else if (g.phase === 'break') { line1 = `⏸ Pause · ${Math.ceil(g.breakT)} s`; line2 = 'Refuges ouverts · soignez-vous, équipez-vous'; }
    const parts = `🚗 Pièces ${g.parts || 0}/${OBJECTIVES.length}`;
    c.font = `800 ${12 * u}px ${FONT_UI}`;
    const w = Math.max(c.measureText(line1 || '').width, c.measureText(line2).width * 0.92, c.measureText(parts).width) + 22 * u, h = (line1 ? 50 : 24) * u;
    this.plate(c, x, y, w, h, 9);
    c.textAlign = 'left';
    this.label(c, parts, x + 10 * u, y + 12 * u, 11 * u, '#7dff6a', FONT_UI, 0.2);
    if (line1) {
      this.label(c, line1, x + 10 * u, y + 28 * u, 12 * u, '#ffc21a', FONT_UI, 0.2);
      this.label(c, line2, x + 10 * u, y + 42 * u, 10.5 * u, '#e8e2d6', FONT_UI, 0.2);
    }
    // défi de vague : sous l'objectif
    const ch = g.challenge;
    if (ch) {
      const t1 = `${ch.def.icon} ${ch.text}`, t2 = ch.done ? `✔ Réussi · +${ch.reward} 🔩` : `${Math.floor(ch.n)} / ${ch.goal} · prime ${ch.reward} 🔩`;
      c.font = `800 ${11 * u}px ${FONT_UI}`;
      const cw = Math.max(c.measureText(t1).width, c.measureText(t2).width) + 22 * u, cy2 = y + h + 6 * u, chh = 38 * u;
      this.plate(c, x, cy2, cw, chh, 9);
      c.fillStyle = ch.done ? '#7dff6a' : '#3ad6ff'; this.rr(c, x, cy2, 3.5 * u, chh, 2); c.fill();
      if (!ch.done) { const k = U.clamp(ch.n / ch.goal, 0, 1); c.fillStyle = 'rgba(58,214,255,0.25)'; this.rr(c, x + 4 * u, cy2 + chh - 5 * u, (cw - 8 * u) * k, 3 * u, 1.5); c.fill(); }
      c.textAlign = 'left';
      this.label(c, t1, x + 10 * u, cy2 + 12 * u, 11 * u, '#e8f8ff', FONT_UI, 0.2);
      this.label(c, t2, x + 10 * u, cy2 + 26 * u, 10.5 * u, ch.done ? '#7dff6a' : '#8adcff', FONT_UI, 0.2);
    }
    if (g.night) { c.textAlign = 'left'; this.label(c, '🌙 Nuit', x + w + 8 * u, y + 12 * u, 11 * u, '#9ab8ff', FONT_UI, 0.2); }
    const ms = Object.keys(g.mods || {}); // règles choisies
    if (ms.length) { c.textAlign = 'left'; this.label(c, `⚙️ ${RUN_MODS.filter(m => g.mods[m.id]).map(m => m.icon).join('')} +${Math.round((g.modBonus || 0) * 100)} %`, x + w + 8 * u, y + 44 * u, 11 * u, '#ffb070', FONT_UI, 0.2); }
    if (g.storm) { c.textAlign = 'left'; this.label(c, '🌪️ Tempête', x + w + 8 * u, y + (g.night ? 28 : 12) * u, 11 * u, '#ffb070', FONT_UI, 0.2); }
  },

  /** Mini-carte en haut à droite */
  drawMinimap(c, g) {
    const u = this.ui, narrow = this.vw < 600, mw = (narrow ? 104 : 150) * u, mh = mw * MAP.H / MAP.W;
    const x = this.vw - mw - 12 - (this.safe.r || 0), y = 10 + this.safe.t + 50 * u, k = mw / MAP.W;
    this.plate(c, x - 4, y - 4, mw + 8, mh + 8, 8);
    for (const z of MAP.zones) {
      const open = World.isUnlocked(z.id);
      c.fillStyle = open ? { parking: '#4e4a44', plaza: '#6e665a', ruins: '#4a4038', base: '#5e5a50' }[z.ground] : '#16130f';
      c.fillRect(x + z.x0 * k, y + z.y0 * k, (z.x1 - z.x0) * k, (z.y1 - z.y0) * k);
      if (!open) { c.font = `${10 * u}px ${FONT_UI}`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillText(`🔒${z.unlock}`, x + (z.x0 + z.x1) / 2 * k, y + (z.y0 + z.y1) / 2 * k); }
    }
    c.fillStyle = '#9a9080';
    for (const b of MAP.buildings) c.fillRect(x + b.x0 * k, y + b.y0 * k, (b.x1 - b.x0) * k, (b.y1 - b.y0) * k);
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1;
    c.strokeRect(x, y, mw, mh);
    // refuges
    for (const [id, s] of Object.entries(SHELTERS)) {
      const b = MAP.buildings.find(bb => bb.id === s.building);
      if (!World.isUnlocked(b.zone)) continue;
      const d = b.doorPos, br = g.shelters && g.shelters[id] && g.shelters[id].broken;
      c.beginPath(); c.arc(x + d.x * k, y + d.y * k, 3.2 * u, 0, TAU); c.fillStyle = br ? '#ff3a2a' : this.doors[id] ? this.doors[id].color : '#fff'; c.fill();
      c.lineWidth = 1; c.strokeStyle = '#0c0a08'; c.stroke();
    }
    // établis (carrés orange)
    for (const b of BENCHES) if (World.isUnlocked(b.zone)) { c.fillStyle = '#ff9a2a'; c.fillRect(x + b.x * k - 2.6 * u, y + b.y * k - 2.6 * u, 5.2 * u, 5.2 * u); c.lineWidth = 1; c.strokeStyle = '#0c0a08'; c.strokeRect(x + b.x * k - 2.6 * u, y + b.y * k - 2.6 * u, 5.2 * u, 5.2 * u); }
    c.fillStyle = '#e8e8e8'; c.fillRect(x + (MAP.car.x - 10) * k, y + (MAP.car.y - 20) * k, 20 * k, 40 * k);
    c.fillStyle = '#ff3a2a';
    for (const e of g.enemies) { const s = e.def.boss ? 3.5 : 1.6; c.fillRect(x + e.x * k - s / 2 * u, y + e.y * k - s / 2 * u, s * u, s * u); }
    for (const b2 of g.burrowers || []) { c.fillStyle = '#c8a070'; c.fillRect(x + b2.x * k - 1.2 * u, y + b2.y * k - 1.2 * u, 2.4 * u, 2.4 * u); } // enfouisseurs
    for (const cr of g.crates || []) { c.fillStyle = '#7dff6a'; c.fillRect(x + cr.x * k - 2.5 * u, y + cr.y * k - 2.5 * u, 5 * u, 5 * u); } // ravitaillement
    const o = g.objective;
    const op = o && (o.type === 'fetch' ? (o.item.carried ? MAP.car : o.item) : o.gen || o.at);
    if (op) { c.beginPath(); c.arc(x + op.x * k, y + op.y * k, (3 + Math.sin(g.time * 6) * 1.2) * u, 0, TAU); c.fillStyle = '#ffc21a'; c.fill(); c.strokeStyle = '#0c0a08'; c.stroke(); }
    const p = g.player;
    c.save(); c.translate(x + p.x * k, y + p.y * k); c.rotate(p.aimAngle);
    c.beginPath(); c.moveTo(5 * u, 0); c.lineTo(-3.5 * u, -3.5 * u); c.lineTo(-3.5 * u, 3.5 * u); c.closePath();
    c.fillStyle = '#3ad6ff'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#0c0a08'; c.stroke(); c.restore();
  },

  /** Bandes noires de cinéma + invite à passer */
  drawCinema(c, g) {
    const t = g.state === 'intro' ? g.introT : g.escapeT, a = Math.min(1, t / 0.5), bh = this.vh * 0.1 * a;
    c.fillStyle = '#000'; c.fillRect(0, 0, this.vw, bh); c.fillRect(0, this.vh - bh, this.vw, bh);
    if (g.state === 'escape') { // la voiture démarre… fondu au noir avant qu'elle ne quitte le parking
      c.globalAlpha = U.clamp((t - 1.1) / 1.1, 0, 1); c.fillRect(0, 0, this.vw, this.vh); c.globalAlpha = 1;
    }
    if (g.state === 'intro') {
      c.textAlign = 'center';
      if (t > 0.4) this.label(c, 'Parking du supermarché · 17 h 42', this.vw / 2, this.vh * 0.1 + 26 * this.ui, 15 * this.ui, '#ffc21a', FONT_UI);
      c.globalAlpha = 0.55 + 0.45 * Math.sin(g.time * 4);
      this.label(c, Input.mode === 'touch' ? 'Touchez pour passer' : 'Une touche pour passer', this.vw / 2, this.vh - bh / 2, 12 * this.ui, '#ffffff', FONT_UI);
      c.globalAlpha = 1;
    }
  },

  hpColor(r) { return r > 0.5 ? ['#7dff6a', '#2fae3a'] : r > 0.25 ? ['#ffe14a', '#e0a010'] : ['#ff6a5a', '#c01818']; },

  drawHud(c, g) {
    const u = this.ui, p = g.player, x = 12 + this.safe.l, y = 10 + this.safe.t;
    c.textBaseline = 'middle';
    // barre de vie
    const bw = 170 * u, bh = 20 * u;
    this.plate(c, x, y, bw + 52 * u, bh + 30 * u, 10);
    const ix = x + 22 * u, iy = y + (bh + 30 * u) / 2;
    c.fillStyle = '#e8322a'; c.beginPath(); c.arc(ix, iy, 13 * u, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.fillRect(ix - 2.6 * u, iy - 8 * u, 5.2 * u, 16 * u); c.fillRect(ix - 8 * u, iy - 2.6 * u, 16 * u, 5.2 * u);
    const bx = x + 42 * u, by = y + 8 * u, r = U.clamp(p.hp / p.maxHp, 0, 1), [c1, c2] = this.hpColor(r);
    this.rr(c, bx, by, bw, bh, bh / 2); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fill();
    if (r > 0) { this.rr(c, bx, by, Math.max(bh, bw * r), bh, bh / 2); const gr = c.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, c1); gr.addColorStop(1, c2); c.fillStyle = gr; c.fill(); c.fillStyle = 'rgba(255,255,255,0.3)'; this.rr(c, bx + 3, by + 2, Math.max(bh - 6, bw * r - 6), bh * 0.35, bh * 0.2); c.fill(); }
    c.textAlign = 'center';
    this.label(c, `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`, bx + bw / 2, by + bh / 2 + 0.5, 12 * u);
    c.textAlign = 'left';
    this.label(c, `VAGUE ${g.wave.num}`, bx, by + bh + 13 * u, 13 * u, '#ffc21a');
    c.textAlign = 'right';
    this.label(c, `🧟 ${g.wave.remaining}`, bx + bw, by + bh + 13 * u, 12 * u, '#e8e8e8', FONT_UI);

    // armes passives (grenades, drone) en bas à gauche — les autres sont dans la barre d'inventaire
    const ws = Object.entries(g.weapons).filter(([id]) => WEAPONS[id].type === 'passive'), sz = 30 * u, wy = this.vh - sz - 14 * u - this.safe.b;
    let wx = 12 + this.safe.l;
    for (const [id, w] of ws) {
      const def = WEAPONS[id];
      this.plate(c, wx, wy, sz, sz, 8);
      if (w.evo) { this.rr(c, wx, wy, sz, sz, 8); c.lineWidth = 2; c.strokeStyle = '#ffc21a'; c.stroke(); }
      c.font = `${16 * u}px ${FONT_UI}`; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(def.icon, wx + sz / 2, wy + sz / 2 + 1);
      for (let i = 0; i < def.max; i++) { c.fillStyle = i < w.lvl ? '#ffc21a' : 'rgba(255,255,255,0.2)'; c.fillRect(wx + 3 * u + i * (sz - 6 * u) / def.max, wy + sz - 4 * u, (sz - 6 * u) / def.max - 1.5, 2.5 * u); }
      wx += sz + 6 * u;
    }

    // score + ferraille
    const sw = 112 * u, plateW = bw + 52 * u;
    const cx = Math.max(this.vw / 2, x + plateW + 8 * u + sw / 2);
    this.plate(c, cx - sw / 2, y, sw, bh + 30 * u, 10);
    c.textAlign = 'center';
    this.label(c, String(g.stats.score), cx, y + 17 * u, 18 * u, '#ffffff');
    this.label(c, `🔩 ${g.coins}`, cx, y + 37 * u, 12.5 * u, '#ffd24a', FONT_UI);

    // boss
    const boss = g.enemies.find(e => e.def.boss);
    if (boss) {
      const w = Math.min(this.vw * 0.7, 480), h = 16 * u, bx2 = this.vw / 2 - w / 2, by2 = y + bh + 40 * u;
      this.plate(c, bx2 - 6, by2 - 6, w + 12, h + 30 * u, 10);
      const r2 = boss.hp / boss.maxHp;
      this.rr(c, bx2, by2 + 18 * u, w, h - 4 * u, 5); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fill();
      this.rr(c, bx2, by2 + 18 * u, Math.max(8, w * r2), h - 4 * u, 5);
      const gr = c.createLinearGradient(0, by2 + 18 * u, 0, by2 + 18 * u + h); gr.addColorStop(0, r2 < 0.5 ? '#ff8a3a' : '#c6ff3a'); gr.addColorStop(1, r2 < 0.5 ? '#c02a10' : '#4a9a10');
      c.fillStyle = gr; c.fill();
      c.textAlign = 'center';
      this.label(c, boss.def.name.toUpperCase(), this.vw / 2, by2 + 7 * u, 12 * u, '#ffffff');
    }

    if (g.state === 'playing' && Input.mode === 'touch' && !Input.joy.used) {
      c.globalAlpha = 0.75 + 0.25 * Math.sin(g.time * 4);
      c.font = `900 ${14 * u}px ${FONT_UI}`;
      const msg = '👆 Posez le pouce ici pour bouger', half = c.measureText(msg).width / 2 + 12;
      const hx = U.clamp(CONFIG.touch.zone === 'left' ? this.vw / 4 : this.vw / 2, half, this.vw - half);
      c.textAlign = 'center';
      this.label(c, msg, hx, this.vh - 70 - this.safe.b, 14 * u, '#ffffff', FONT_UI);
      c.globalAlpha = 1;
    }
  },

  /** Série (combo), bonus temporaires (sous la mini-carte) et grande annonce des paliers au centre */
  drawFun(c, g) {
    const u = this.ui, narrow = this.vw < 600, mw = (narrow ? 104 : 150) * u, right = this.vw - 12 - (this.safe.r || 0);
    let y = 10 + this.safe.t + 50 * u + mw * MAP.H / MAP.W + 14 * u;
    const cb = g.combo;
    if (cb && cb.n >= 3) {
      const tier = [...FUN.combo.tiers].reverse().find(([n]) => cb.n >= n), col = tier ? tier[2] : '#ffffff';
      const s = 1 + cb.pop * 0.35, w = 138 * u, h = 44 * u, x = right - w;
      this.plate(c, x, y, w, h, 10);
      c.textAlign = 'center';
      this.label(c, `×${cb.n}`, x + w / 2, y + 16 * u, 20 * u * s, col);
      this.label(c, `SÉRIE · 🔩 ×${FUN.combo.scrap(cb.n).toFixed(1)}`, x + w / 2, y + 32 * u, 9.5 * u, '#e8e2d6', FONT_UI, 0.2);
      c.fillStyle = col; this.rr(c, x + 6 * u, y + h - 5 * u, (w - 12 * u) * U.clamp(cb.t / FUN.combo.window, 0, 1), 3 * u, 1.5); c.fill();
      y += h + 6 * u;
    }
    for (const [k, t] of Object.entries(g.buffs || {})) {
      const b = FUN.buffs[k], w = 138 * u, h = 26 * u, x = right - w;
      this.plate(c, x, y, w, h, 8);
      c.fillStyle = b.color; this.rr(c, x, y + h - 4 * u, w * U.clamp(t / b.dur, 0, 1), 4 * u, 2); c.fill();
      c.textAlign = 'left';
      this.label(c, `${b.icon} ${b.name}`, x + 7 * u, y + 11 * u, 9.5 * u, b.color, FONT_UI, 0.2);
      c.textAlign = 'right'; this.label(c, `${Math.ceil(t)} s`, x + w - 7 * u, y + 11 * u, 10 * u, '#ffffff', FONT_UI, 0.2);
      y += h + 5 * u;
    }
    // palier de série / bonus / défi réussi : grand texte au centre qui claque puis s'efface
    const pp = g.comboPop;
    if (pp) {
      const t = pp.t, a = Math.min(1, t / 0.08, (1.8 - t) / 0.4), s = t < 0.15 ? 1.6 - t / 0.15 * 0.6 : 1;
      c.globalAlpha = Math.max(0, a); c.textAlign = 'center';
      const cy = this.vh * 0.3;
      this.label(c, pp.text, this.vw / 2, cy, 30 * u * s, pp.color, FONT, 0.22);
      if (pp.sub) this.label(c, pp.sub, this.vw / 2, cy + 26 * u, 12.5 * u, '#ffffff', FONT_UI, 0.22);
      c.globalAlpha = 1;
    }
  },

  /** Annonce discrète (vague, objectif, zone…) : petite plaque sous le HUD, qui glisse et s'efface */
  drawBanner(c, b) {
    const t = b.t, d = b.dur;
    const a = Math.min(1, t / 0.2, (d - t) / 0.5);
    if (a <= 0) return;
    const u = this.ui, color = b.color || '#ffc21a';
    const top = 10 + this.safe.t + (this.vw < 600 ? 120 : 64) * u;
    const drop = t < 0.3 ? (1 - easeOut(t / 0.3)) * -14 * u : 0;
    c.font = `900 ${17 * u}px ${FONT}`;
    const tw = c.measureText(b.text).width;
    c.font = `700 ${12 * u}px ${FONT_UI}`;
    const sw = b.sub ? c.measureText(b.sub).width : 0;
    const w = Math.min(this.vw - 24, Math.max(tw, sw) + 34 * u), h = (b.sub ? 46 : 30) * u, x = this.vw / 2 - w / 2, y = top + drop;
    c.globalAlpha = a * 0.92;
    this.rr(c, x, y, w, h, 9 * u); c.fillStyle = 'rgba(14,12,10,0.78)'; c.fill();
    c.fillStyle = color; this.rr(c, x, y, 4 * u, h, 2); c.fill(); // liseré de couleur à gauche
    c.textAlign = 'center'; c.textBaseline = 'middle';
    this.label(c, b.text, this.vw / 2, y + 15 * u, 17 * u, '#ffffff', FONT, 0.18);
    if (b.sub) this.label(c, b.sub, this.vw / 2, y + 33 * u, 12 * u, color, FONT_UI, 0.18);
    c.globalAlpha = 1;
  },

  drawJoystick(c) {
    const j = Input.joy;
    if (!j.active) return;
    const R = CONFIG.touch.radius;
    c.beginPath(); c.arc(j.bx, j.by, R, 0, TAU); c.fillStyle = 'rgba(10,10,10,0.35)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.45)'; c.stroke();
    let dx = j.x - j.bx, dy = j.y - j.by;
    const dd = Math.hypot(dx, dy);
    if (dd > R) { dx = dx / dd * R; dy = dy / dd * R; }
    c.beginPath(); c.arc(j.bx + dx, j.by + dy, R * 0.42, 0, TAU);
    const gr = c.createLinearGradient(0, j.by + dy - R * 0.42, 0, j.by + dy + R * 0.42); gr.addColorStop(0, '#ffd84a'); gr.addColorStop(1, '#e09a10');
    c.fillStyle = gr; c.fill(); c.lineWidth = 3; c.strokeStyle = '#0c0a08'; c.stroke();
  },
};

// Charge les modèles 3D, puis démarre le jeu
await loadAssets();
window.Render = Render;
window.bootGame();
