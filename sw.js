/* Service worker : met tout le jeu en cache pour jouer hors ligne.
   Changez VERSION à chaque mise à jour du jeu pour forcer le rafraîchissement. */
const VERSION = 'deadsand-v18';
const WORLD_MODELS = ['barracks', 'bld_a', 'bld_b', 'bld_big', 'bld_business', 'bld_c', 'car', 'container_green', 'container_red', 'dog', 'gascan', 'gastank', 'police', 'suv'];
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'assets/audio/manifest.json', 'js/config.js', 'js/utils.js', 'js/world.js', 'js/save.js', 'js/cosmetics.js', 'js/input.js', 'js/music.js', 'js/audio.js',
  'js/entities.js', 'js/weapons.js', 'js/story.js', 'js/waves.js', 'js/allies.js', 'js/inventory.js', 'js/gunsmith.js', 'js/fun.js', 'js/progress.js', 'js/ui.js', 'js/main.js', 'js/render3d.js',
  'assets/models/survivor.glb', 'assets/models/scout.glb', 'assets/models/swat.glb', 'assets/models/zombie.glb',
  ...WORLD_MODELS.map(n => `assets/models/world/${n}.glb`),
  'vendor/three/build/three.module.js',
  'vendor/three/examples/jsm/postprocessing/EffectComposer.js', 'vendor/three/examples/jsm/postprocessing/RenderPass.js',
  'vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js', 'vendor/three/examples/jsm/postprocessing/OutputPass.js',
  'vendor/three/examples/jsm/postprocessing/ShaderPass.js', 'vendor/three/examples/jsm/postprocessing/MaskPass.js',
  'vendor/three/examples/jsm/postprocessing/Pass.js',
  'vendor/three/examples/jsm/shaders/CopyShader.js', 'vendor/three/examples/jsm/shaders/LuminosityHighPassShader.js',
  'vendor/three/examples/jsm/shaders/OutputShader.js',
  'vendor/three/examples/jsm/loaders/GLTFLoader.js', 'vendor/three/examples/jsm/utils/SkeletonUtils.js',
  'vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
