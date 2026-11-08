# Deadsand 🧟

Jeu de survie par vagues en 3D (Three.js), univers post-apo. Votre voiture tombe en panne
sur le parking d'un supermarché perdu dans le désert ; la carte s'agrandit au fil des
vagues, des refuges permettent de souffler, et 4 pièces détachées vous séparent de la fuite.
PC (clavier + souris) et téléphone (joystick tactile). Aucun build, fonctionne hors ligne, installable.

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

## Déroulé d'une partie
- **Intro** : la voiture arrive en dérapage sur le parking (une touche ou un toucher pour passer).
- **Carte en 4 zones** : Parking (départ) → Centre commercial (vague 5) → Quartier abandonné
  et station-service (vague 10) → Hôpital & base militaire (vague 15). Les barricades sautent,
  les zombies contournent les bâtiments (champ de flux sur grille), mini-carte en haut à droite.
- **Pause tactique** de 45 s entre les vagues (lançable plus tôt).
- **Refuges** (SHELTER_ITEMS dans story.js) : Pharmacie (trousse, rations, seringue de rage), Atelier
  (tourelles, barbelés, fûts piégés, portes renforcées, baskets, aimant), Hôpital (soins complets, PV max,
  blindage, réflexes). À l'intérieur on ne tire plus
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
  Onglet Armes : acheter les armes secondaires (150), les monter jusqu'au niveau 5, puis les faire évoluer.
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

## Crédits
Modèles 3D par **Quaternius** (quaternius.com), licence **CC0**, via Poly Pizza :
« Adventurer » (Mia), « Animated Woman » (Kira), « SWAT » (Brick), « Zombie », « Husky » (Rex),
« SUV », « Police Car », « Car », « Big Building », « Business Building », « Barracks »,
« Containers », « Gas Can », « Gas Tank » ; bâtiments **Kenney** (City Kit, CC0).
Sons : **Kenney** (kenney.nl), packs « Impact Sounds », « Sci-fi Sounds », « Music Jingles », licence **CC0**
(ssets/audio/, liste dans ssets/audio/manifest.json). Les tirs restent synthétisés.
Three.js (MIT).
