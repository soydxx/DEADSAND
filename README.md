# Deadsand 🧟

Jeu de survie par vagues en 3D (Three.js), univers post-apo. Votre voiture tombe en panne
sur le parking d'un supermarché perdu dans le désert ; la carte s'agrandit au fil des
vagues, des refuges permettent de souffler, et 4 pièces détachées vous séparent de la fuite.
PC (clavier + souris) et téléphone (joystick tactile). Aucun build, fonctionne hors ligne, installable.

## Lancer
Servez le dossier avec un petit serveur web (modules + modèles 3D ne se chargent pas
en `file://`) : `npx serve`, `python -m http.server`… puis ouvrez l'adresse.
Tout est embarqué (Three.js dans `vendor/`), aucune connexion nécessaire.

**Installer sur téléphone** : ouvrez la page dans Chrome (Android) → menu → « Installer
l'application », ou Safari (iOS) → Partager → « Sur l'écran d'accueil ».

## Publier sur Netlify
Site 100 % statique : aucune compilation. `netlify.toml` règle le cache (service worker
toujours revérifié, modèles 3D et Three.js mis en cache) et les types MIME.
- **Le plus simple (Netlify Drop)** : connectez-vous sur https://app.netlify.com/drop et glissez
  `deploy/deadsand-netlify.zip` (ou le dossier du jeu entier) dans la page. L'adresse publique
  s'affiche en quelques secondes ; renommez-la dans *Site configuration → Change site name*.
- **Mise à jour** : sur la page du site → *Deploys* → glissez la nouvelle version dans la zone
  « Drag and drop ». Pensez d'abord à changer `VERSION` dans `sw.js` pour que les joueurs
  reçoivent la mise à jour.
- **En ligne de commande** : `npx netlify-cli deploy --prod --dir .`
- **Depuis GitHub** : poussez le dossier dans un dépôt, puis *Add new site → Import an existing
  project* ; laissez la commande de build vide et le dossier de publication sur `.`.

## Contrôles
| | Déplacement | Ciblage | Roulade | Autres |
|---|---|---|---|---|
| PC | ZQSD / WASD / flèches | clic sur un zombie ou un fût · clic droit / Tab pour relâcher | Espace ou Maj | 1-2-3 armes · R / molette arme suivante · G grenade (vers la souris) · F mine · 4-5-6 objets · E refuge · N vague · Échap pause |
| Mobile | pouce à gauche | toucher un zombie ou un fût (moitié droite) | bouton 🌀 | inventaire à droite · boutons « Entrer » et « ▶ Vague » |

Toutes les touches se changent dans **Options → Touches** (`BINDINGS` dans inventory.js).

Le tir reste automatique : sans cible verrouillée, la survivante vise le zombie visible le
plus proche. Une cible verrouillée est prioritaire (portée ×1,3) et les grenades la visent.

**Inventaire** (barre en bas, à droite sur mobile) : fusil d'assaut, fusil à pompe et
lance-flammes s'équipent (un seul tire à la fois) ; les mines se posent avec leur touche
(temps de recharge) ; tourelles, barbelés et fûts achetés à l'Atelier des refuges se posent
devant vous, où vous voulez. Grenades et drone restent automatiques.

**Roulade** : courte, avec une jauge d'endurance de 3 charges (sous la survivante) qui se
recharge en ~1 s par charge (`CONFIG.roll`).

## Menus
- **Écran titre** : le parking en 3D, votre personnage à côté de la voiture → « Commencer ».
- **Préparation** : onglets Équipe (personnages, aperçu 3D, caractéristiques),
  Entraînement (bonus permanents achetés avec la réserve, avec un encart d'explication tant
  que rien n'est achetable), Succès, Options (+ rappel des commandes), puis « Lancer la partie ».
  En fin de partie, un encart signale ce que la ferraille versée vient de rendre achetable.
- **Téléphone** : le jeu se joue à l'horizontale (plein écran + verrouillage quand le navigateur
  le permet ; en vertical, un écran demande de tourner le téléphone et la partie se met en pause).
- **Conseils** : bulles d'aide contextuelles, une seule fois chacune (`js/tips.js`) ; « Revoir les
  conseils » dans Options.
- **Boss** à tour de rôle toutes les 5 vagues : Mastodonte, Reine (fait naître des zombies),
  Bélier (charge en ligne droite, sonné contre un mur), Gerbeuse (bile et flaques acides).
  **Événements** (vagues 3+) : horde de coureurs, ravitaillement parachuté.
- **Défi du jour** (`js/daily.js`) : 2 règles tirées de la date, les mêmes pour tous ; meilleurs
  scores des 7 derniers jours.
- **Son** : tirs, explosions et impacts en couches, grognements selon la distance de la horde,
  vent du désert (plus fort pendant les tempêtes).
- **Qualité auto** : si les images ralentissent, la résolution, le halo puis les ombres sont réduits.
- **Garage** (personnalisation, aperçu 3D en direct) : tenues par personnage, peintures
  d'armes, voiture (peinture, autocollants, pare-buffle, galerie, blindage), race et
  accessoire de Rex, couleur des balles traçantes, effet de mort des zombies, traînée de
  roulade, titre affiché avec le pseudo, ambiance du menu. Déblocage avec la ferraille, les
  succès, des défis de personnage (500 zombies) ou un record de vague (`js/cosmetics.js`).
- **Ferraille conservée** : en fin de partie, seule une part de la ferraille restante va en
  réserve — 25 % à la vague 1, +5 % par vague, 80 % max, 100 % après une évasion
  (`BANKING` dans config.js). Économiser puis abandonner tôt ne rapporte donc presque rien.
- **Réanimation** : à la mort, la première réanimation est offerte (+1 par niveau
  d'« Adrénaline » à l'Entraînement) ; les suivantes coûtent 150, 300, 600… 🔩 (ferraille de la
  partie d'abord, puis la réserve). 9 s pour décider ; vous repartez à 60 % de vie avec une
  onde de choc. Réglages dans `REVIVE` (config.js).

## Déroulé d'une partie
- **Intro** : la voiture arrive en dérapage sur le parking (une touche ou un toucher pour passer).
- **Carte en 4 zones** : Parking (départ) → Centre commercial (vague 5) → Quartier abandonné
  et station-service (vague 10) → Hôpital & base militaire (vague 15). Les barricades sautent,
  les zombies contournent les bâtiments (champ de flux sur grille), mini-carte en haut à droite.
- **Pause tactique** de 20 s entre les vagues (lançable plus tôt).
- **Refuges** : Pharmacie (soins), Armurerie (armes, munitions), Atelier (tourelles, barbelés,
  portes renforcées, fûts piégés), Hôpital (PV max, régénération). À l'intérieur on ne tire plus
  et les zombies ne vous voient plus… mais ils assiègent la porte : si elle cède, vous êtes éjectée.
- **Objectifs → pièces de la voiture** : bidon d'essence (vague 3), défendre le générateur (7),
  tenir la station-service (12), batterie de l'hôpital (16). Avec les 4 pièces : réparer la
  voiture sous la pression de la horde finale, puis **fuir** (victoire) — ou continuer en sans fin.
- **Établis d'armurier** (`js/gunsmith.js`) : 5 établis sur la carte (2 sur le parking, 1 par autre zone),
  carré orange sur la mini-carte. Près d'un établi, E (ou « Améliorer ») met la partie en pause et ouvre
  l'armurier : l'arme tourne en 3D, étiquettes sur chaque pièce, tir d'essai au rythme de la cadence.
  Pièces à 3 niveaux, payées avec la ferraille de la partie (50 / 100 / 170) et visibles sur le modèle :
  fusil d'assaut (lunette → portée, canon → cadence, chargeur → dégâts, bouche → perforation, rail laser →
  critique), fusil à pompe (canons, pompe, cartouchière), lance-flammes (buse, réservoir, allumeur).
  Onglet Peinture : essai en direct des peintures du Garage. Modèles des pièces : `applyGunMods` (render3d.js).
- **Crachats des zombies** : boule verte lumineuse, traînée et anneau au sol qui montre la trajectoire.
- **Nuit** une vague sur 4 (lampe torche, plus de zombies) et **tempêtes de sable** (visibilité réduite).
- **Rex le chien** : compagnon à débloquer à l'Entraînement, il mord les zombies proches.

## Contenu
- **Armes secondaires** (4 max) : fusil à pompe, lance-flammes, grenades, drone, mines — niv. 1→5,
  avec **évolutions** surpuissantes.
- **Zombies** : Rôdeur, Coureur, Rampant, Brute, Cracheur, Kamikaze, Blindé, Mastodonte (boss) + élites.
- **Fûts explosifs**, **bonus** (soin, bombe, aimant), **ferraille** en réserve → **Entraînement**
  (bonus permanents) et **personnages** (Mia, Kira, Brick), **succès**, options graphiques et sonores.

## Structure
```
index.html            page, import map (Three.js local), ordre des scripts
style.css             menus, cartes, boutons
manifest.webmanifest  appli installable          sw.js   cache hors ligne
assets/models/        personnages et zombie animés (glTF) ; world/ : bâtiments, véhicules, chien
vendor/three/         Three.js r160 (copie locale)
js/config.js          ★ DONNÉES : joueur, ennemis, vagues, améliorations, personnages, atelier, succès
js/world.js           ★ CARTE : zones, bâtiments, refuges, obstacles ; collisions, ligne de vue, navigation
js/story.js           ★ SCÉNARIO : intro, pauses, ouverture des zones, objectifs, refuges, fuite
js/allies.js          chien, tourelles, barbelés
js/weapons.js         ★ armes secondaires + évolutions
js/gunsmith.js        ★ établis d'armurier : emplacements, pièces par arme, prix
js/entities.js        logique : joueur, ciblage, roulade, zombies, explosions, fûts, bonus
js/waves.js           vagues (nuit, horde finale), élites, tirage des améliorations
js/ui.js              écrans (menus, refuges, victoire, boutons contextuels)
js/main.js            machine à états + boucle de jeu + service worker
js/render3d.js        rendu 3D : carte, éclairage jour/nuit/tempête, personnages, HUD, mini-carte
```

## Faire évoluer
- **Zone / bâtiment / refuge** : `MAP.zones`, `MAP.buildings`, `SHELTERS` (world.js) ; achats dans `SHELTER_ITEMS` (story.js).
- **Objectif** : entrée dans `OBJECTIVES` (story.js) — types `fetch`, `defend`, `hold`.
- **Ennemi** : `ENEMY_TYPES` + `WAVE_CONFIG.weights` ; variante visuelle dans `ZOMBIE_TYPES` (render3d.js).
- **Arme** : `WEAPONS` (weapons.js) + méthode du même nom dans `Weapons`.
- Après une mise à jour publiée, changez `VERSION` dans `sw.js`.

## Crédits
Modèles 3D par **Quaternius** (quaternius.com), licence **CC0**, via Poly Pizza :
« Adventurer » (Mia), « Animated Woman » (Kira), « SWAT » (Brick), « Zombie », « Husky » (Rex),
« SUV », « Police Car », « Car », « Big Building », « Business Building », « Barracks »,
« Containers », « Gas Can », « Gas Tank » ; bâtiments **Kenney** (City Kit, CC0).
Three.js (MIT).
