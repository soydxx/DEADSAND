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
| PC | ZQSD / WASD / flèches | clic sur un zombie ou un fût · clic droit / Tab pour relâcher | Espace ou Maj | 1 arme principale · 2 arme secondaire · R / molette changer d'arme · G létal (vers la souris) · F tactique · 5-6-7 objets · E refuge · N vague · Échap pause |
| Mobile | pouce à gauche | toucher un zombie ou un fût (moitié droite) | bouton 🌀 | inventaire à droite · boutons « Entrer » et « ▶ Vague » |

Toutes les touches se changent dans **Options → Touches** (`BINDINGS` dans inventory.js).

Le tir reste automatique : sans cible verrouillée, la survivante vise le zombie visible le
plus proche. Une cible verrouillée est prioritaire (portée ×1,3) et les grenades la visent.

**Inventaire** (barre en bas) : arme principale (case 1), arme secondaire (case 2 : touchez-la pour changer d'arme),
létal et tactique (temps de recharge), puis tourelles, barbelés et fûts achetés à l'Atelier des refuges, à poser devant vous.

**Roulade** : courte, avec une jauge d'endurance de 3 charges (sous la survivante) qui se
recharge en ~1 s par charge (`CONFIG.roll`).

## Classes (création de classe, `js/loadout.js`)
Avant la partie, onglet **Classes** de la Préparation : « Classe 1 » toute prête, et un bouton « + » pour en créer\njusqu'à 5 (nommables, supprimables), chacune avec
- une **arme principale** : fusil d'assaut, fusil à pompe (niv. 1), mitraillette (3), fusil de précision (8), lance-flammes (12) ;
- une **arme secondaire** (touche 2 ou R, molette) : pistolet (1), revolver (5), pistolet-mitrailleur (7), lance-fusées (10).
  Changer d'arme prend 0,3 s ; avec la secondaire en main, on court 10 à 15 % plus vite (SECONDARIES). Niveaux 1→5 à l'établi ;
- un **létal** (touche G) : grenades (1), cocktail Molotov (3), mines (5) ;
- un **tactique** (touche F) : drone (1), tourelle portable (4), barbelés portables (9) ;
- **3 atouts** (bleu / rouge / jaune), débloqués eux aussi par le niveau de survivante.
En partie, les **établis** (un par zone) améliorent l'arme principale (pièces ; « Calibre » / « Pression » pour le pompe et
le lance-flammes, dont le dernier niveau est l'évolution) et l'équipement (onglet Équipement : niveaux 1→5 puis évolution).
Il n'y a plus d'Armurerie ni d'achat d'armes en partie.

Les bonus de dégâts de l'équipement (grenades, drone…) ne dépendent plus des dégâts propres de l'arme principale
(p.dmgBase) : les grenades du fusil de précision faisaient ×3,5, celles de la mitraillette ×0,5.

## Tutoriel (js/tutorial.js)
Bouton « 🎓 Tutoriel » sur l'écran titre et dans la Préparation. Partie guidée d'environ 2 minutes sur le parking, en 9 étapes :
bouger, tir automatique, cibler un fût, roulade, létal, arme secondaire, établi, refuge, petite horde. Pas de vagues
(phase = 'tut'), impossible de mourir, pas d'XP ni de record. Flèche jaune vers l'endroit où aller. 150 🔩 la première fois.

## Cause de la mort
En fin de partie : le dernier coup reçu (zombie et type d'attaque, kamikaze, fût, acide), le nombre de zombies autour,
la part des dégâts subis par origine (stats.hurtBy) et un conseil. Les causes sont cumulées dans Save.data.deathBy.

**Économie** : ferraille des zombies réduite de 5 % par vague après la vague 8 (`CONFIG.scrapFade`), prime de fin de vague
plafonnée à la vague 12, série ×1,5 max, pièces et équipement plus chers. Ravitaillements : 30 % des événements, 2 colis,
+12 PV / +15 🔩 (`STORY.supply`).
## Objectifs variés, vagues spéciales, survivants (`js/story.js`)
- **Objectifs tirés au hasard** : les 4 étapes (vagues 3, 7, 12, 16) gardent leur zone et leur pièce, mais le type change à
  chaque partie (`OBJECTIVES[].pool`, `OBJ_TYPES`, sans doublon) : bidon / batterie, générateur, station-service, et 3 nouveaux :
  - **Fusées de détresse** : en allumer 3 en restant 2,5 s à côté de chacune, pendant la vague ;
  - **Escorte** : un survivant à rejoindre pendant la vague ; il vous suit, la horde s'en prend à lui ; à ramener à la voiture
    (s'il meurt, un autre attend à la vague suivante) ;
  - **Colis largué** : tombe en parachute au milieu d'une horde, à rapporter à la voiture.
- **Vagues spéciales** (prime de fin de vague ×1,5) : *Coureurs* (vague 5+, que des coureurs et des rampants),
  *Panne de courant* (vague 6+, nuit sans lampe torche ni lampadaires), *Double boss* (vagues de boss à partir de la 20).
- **Survivants à sauver** (`RESCUE`) : à partir de la vague 3, 40 % des vagues ; un survivant appelle à l'aide (flèche bleue, 45 s).
  Rejoint, il donne de la ferraille ou se bat à vos côtés pendant 45 s (`Allies.updateHelpers`).

## Progression des armes et prestige (`js/progress.js`)
- **Niveau d'arme** (1 → 10, `WLEVELS`) : chaque arme principale ou secondaire monte avec ses éliminations, cumulées
  d'une partie à l'autre (celles de la partie en cours comptent tout de suite, annonce à chaque niveau).
  Les pièces de niveau III demandent le niveau d'arme 3, le niveau IV (Calibre / Pression) le niveau 5 (`PART_REQ`).
  Détail dans l'onglet Missions, sur l'éditeur de classes, à l'établi et en fin de partie.
- **Camouflages par défis** (`cosmetics.js`, `wchal`) : Tigre (300 élim. fusil d'assaut), Cobalt (400 mitraillette),
  Toxique (300 pompe), Arctique (120 critiques mortels au fusil de précision), Lave (400 lance-flammes),
  Ivoire (200 à l'arme secondaire), Carbone (une arme au niveau 10).
- **Prestige** (`PRESTIGE`) : au niveau 50, retour au niveau 1 en gardant tous les déblocages, +500 🔩, insigne ⭐,
  récompenses exclusives : camouflages Prestige (1), Obsidienne (3), Aurore (5), titres Immortelle (2) et Éternelle (10).

## Contenu et finition
- **3ᵉ carte : Centre-ville de nuit** (`MAP_CITY`, world.js) : toujours la nuit (`night: true`), 18 lampadaires, place de la mairie,
  gare, quartier des bars, commissariat & hôpital. Débloquée en atteignant la vague 15 (`MAP_REQ`).
- **5ᵉ personnage : Nora, médecin** (700 🔩) : +1 réanimation offerte, trousses et soins ×1,5, Rations deux fois plus longues,
  −10 PV. Capacité **Adrénaline** : soigne 30 % de la vie, sprint de 2 s, intouchable 1 s. Tenues au Garage.
- **2 nouveaux boss** (`BOSS_ORDER` : vague 5 Mastodonte, 10 Reine, 15 Brûleur, 20 Bélier, 25 Gerbeuse, 30 Abomination) :
  - **Le Brûleur** : lance des bombes incendiaires qui laissent des brasiers, et une traînée de feu derrière lui ;
  - **L'Abomination** : frappe le sol (cercle d'avertissement puis onde de choc) ; à sa mort, se divise en 3 brutes et 6 coureurs.
- **Écran de chargement** avec le logo et des astuces qui défilent ; **nouvelle icône** (main de zombie qui sort du sable devant
  un soleil couchant, `icons/icon.svg` + PNG 192 et 512).

## Classement en ligne entre amis (facultatif, gratuit)
Sans configuration, le jeu reste 100 % hors ligne et l'onglet Succès indique que le classement n'est pas activé.
Pour l'activer (environ 5 minutes) :
1. Créer un compte et un projet gratuit sur https://supabase.com.
2. Dans le projet, **SQL Editor** → coller et exécuter :
   ```sql
   create table scores (
     id bigint generated always as identity primary key,
     created_at timestamptz default now(),
     group_code text not null check (char_length(group_code) between 3 and 24),
     name text not null check (char_length(name) <= 16),
     score int not null check (score >= 0 and score < 10000000),
     wave int, kills int, char text, map text, win boolean, prestige int
   );
   alter table scores enable row level security;
   create policy "lecture" on scores for select using (true);
   create policy "ajout" on scores for insert with check (true);
   create index on scores (group_code, score desc);
   ```
3. **Project Settings → API** : copier l'URL du projet et la clé **anon public** dans `js/online.js` (`ONLINE.url`, `ONLINE.key`),
   puis republier le jeu.
4. En jeu : Préparation → Succès → **Code du groupe** (le même pour tous les amis, ex. `LES-POTES`). Chaque fin de partie
   envoie le score ; le classement affiche les 20 meilleurs du groupe.

La clé « anon » est faite pour être publique ; les règles ci-dessus n'autorisent qu'à lire et ajouter des scores. Comme tout
classement de jeu dans le navigateur, un joueur malin pourrait envoyer un faux score : c'est fait pour jouer entre amis.

## Fortifications, IA des zombies, hordes sur la carte graphique
- **Fortifications** (`js/forts.js`) : pendant la pause, bouton « 🧱 Fortifier » ou touche **B**. Barricade (40 🔩), sacs de sable
  (90 🔩, très solides), pieux (50 🔩 : blessent et ralentissent, s'usent). 14 au maximum, 1-2-3 pour choisir.
  PC : clic pour poser à la souris (aperçu vert / rouge), clic droit pour démonter (50 % remboursés) ; mobile : se pose devant
  la survivante avec « Poser ». Les zombies ne les contournent pas : ils tapent dedans jusqu'à les casser (les boss 3× plus vite) ;
  la survivante les enjambe (ralentie) et les balles passent par-dessus. Interdit devant les portes, établis et objectifs.
- **Zombies plus malins** (entities.js) : dès la vague 6, 30 % des zombies **contournent** pour arriver par le côté ;
  dès la vague 4, les **coureurs chassent en meute** (un coureur seul rôde jusqu'à ce que 2 autres le rejoignent, puis charge
  générale plus rapide) ; nouveau **Grimpeur** (vague 8+) qui passe par-dessus toits et véhicules, hors d'atteinte tant qu'il est perché.
- **Hordes sur la carte graphique** (render3d.js, `bakeVAT`) : au chargement, les animations du zombie sont précalculées dans
  deux textures (65 ms) ; les zombies ordinaires (rôdeurs, coureurs, rampants, hors élites) sont dessinés en un seul appel,
  sans squelette à animer. Mesure avec 150 zombies : 9 ms → 1,5 ms de processeur par image, 16,8 ms → 5,9 ms au total.
  Les zombies à accessoires, élites et boss gardent le modèle animé classique. Interrupteur : Paramètres → « Hordes optimisées ».

## Où améliorer quoi (une règle simple)
| Où | Quand | Quoi | Monnaie |
|---|---|---|---|
| **Établis** 🔧 + **Armurerie** (sur la carte) | en partie | **les armes** : pièces, nouvelles armes, niveaux, évolutions, peinture | ferraille de la partie |
| **Refuges** (Pharmacie, Atelier, Hôpital) | en partie | **la survie** : soins, régénération, PV max, blindage, réflexes, vitesse, pièges, tourelles | ferraille de la partie |

Il n'y a plus de choix d'amélioration en fin de vague : chaque vague repoussée rapporte une prime de
ferraille (25 + 8 × n° de vague, CONFIG.waveScrap) à dépenser pendant la pause tactique.

## Plaisir de jeu et envie de revenir
- **Séries** (`js/fun.js`) : chaque élimination prolonge la série (2,6 s pour enchaîner) ; paliers annoncés
  (SÉRIE 10, CARNAGE 25, MASSACRE 50, APOCALYPSE 100, LÉGENDAIRE 200) ; +10 % de ferraille par tranche de 10
  (×2 max). Un coup reçu casse la série.
- **Impacts** : morceaux qui volent, tête qui saute sur un coup critique fatal (HEADSHOT), ralenti sur la mort
  d'un boss ou une explosion qui en tue 8+, léger tremblement à chaque tir.
- **Coffres dorés** : les boss en lâchent deux, les élites parfois (`FUN.eliteChest`) → gerbe de ferraille.
- **Bonus temporaires** (15 s, cristaux lumineux, `FUN.buffs`) : Frénésie (cadence ×2), Balles explosives, Adrénaline (vitesse).
- **Défis de vague** (`CHALLENGES`) : une vague sur deux environ (vague 2+, hors boss), un petit défi avec prime.
- **Établis** : en ressortant, onde dorée « ARME AMÉLIORÉE ! » et annonce de l'évolution débloquée.
- **Niveau de survivante 1 → 50** (`js/progress.js`) : XP à chaque partie (même perdue), ferraille à chaque niveau,
  objets du Garage débloqués par niveau (`level: N` dans cosmetics.js : peintures Nuit noire, Sang séché, Néon,
  Diamant, traçantes violettes, mort « Plasma », peintures de voiture, titres).
- **Missions** : 3 par jour + 1 par semaine (onglet 🎯 Missions), tirées de la date ; elles avancent à la fin de
  chaque partie et la récompense est versée automatiquement.
- **Bilan de fin de partie** : statistiques qui apparaissent une à une (meilleure série, dégâts, arme préférée,
  coffres, défis), barre d'XP, niveaux gagnés, missions accomplies.
- **Vega la mécano** : 4ᵉ personnage, débloqué en s'évadant : établis −25 %, tourelle offerte, +10 % de ferraille.
- Outil de test (non publié) : `tools/autoplay.js`, un bot qui joue une partie accélérée et note les problèmes.

## Contenu ajouté (zombies, capacités, cartes, manette, audio)
- **Nouveaux zombies** (config.js) : Hurleur (vague 6+, hurle → zombies proches +50 % de vitesse 4 s), Porte-bouclier
  (vague 8+, les balles de face font 12 % des dégâts : contournez-le ou faites-le sauter), Enfouisseur (vague 9+,
  avance sous le sable, traînée visible, surgit près de vous). Les 3 derniers zombies d'une vague qui traîne s'enragent.
- **Capacités** (`ABILITIES`, fun.js ; touche C / bouton à l'écran) : Mia grenade aveuglante, Kira sprint, Brick bouclier,
  Vega tourelle express.
- **Règles de partie** (onglet Équipe, `RUN_MODS` dans progress.js) : zombies enragés, élites, nuit éternelle, tempêtes,
  refuges fermés, fragile, fusil à pompe imposé → bonus de ferraille et d'XP cumulés.
- **Meilleures parties** : les 10 meilleures (onglet Succès).
- **2ᵉ carte « Autoroute ensablée »** (`MAP_HIGHWAY` dans world.js), débloquée par une évasion ; choix dans l'onglet
  Équipe (le jeu se recharge). Chaque carte définit ses établis, son générateur, ses lampadaires…
- **Manette** (Xbox / PlayStation) : stick gauche, A roulade, B entrer, X grenade, Y capacité, LB mine, RB arme
  suivante, Select vague, Start pause ; dans les menus A valider, B retour. Vibrations de la manette.
- **Sons** des gros moments (série, coffre, bonus, capacité, niveau). **Vrais fichiers audio facultatifs** :
  `assets/audio/manifest.json` → `{ "sfx": { "shoot": "sfx/shoot.ogg", … }, "volumes": {…}, "music": { "calm": "…", "action": "…" } }`.
  Sans ce fichier, tout reste synthétisé.
- **Soins** : plus de soin passif dans les refuges ; Rations limitées à 35 % de la vie par vague ; Seringue de rage
  +1 PV / 3 zombies (4 PV/s max).
## Menus
- **Écran titre** : le parking en 3D, votre personnage à côté de la voiture → « Commencer ».
- **Préparation** : onglets Équipe (personnages, aperçu 3D, caractéristiques),
  Entraînement (bonus permanents achetés avec la réserve, avec un encart d'explication tant
  que rien n'est achetable), Succès, Options (+ rappel des commandes), puis « Lancer la partie ».
  En fin de partie, un encart signale ce que la ferraille versée vient de rendre achetable.
- **Téléphone** : le jeu se joue à l'horizontale (plein écran + verrouillage quand le navigateur
  le permet ; en vertical, un écran demande de tourner le téléphone et la partie se met en pause).
- **Boss** à tour de rôle toutes les 5 vagues : Mastodonte, Reine (fait naître des zombies),
  Bélier (charge en ligne droite, sonné contre un mur), Gerbeuse (bile et flaques acides).
  **Événements** (vagues 3+) : horde de coureurs, ravitaillement parachuté.
- **Son** : tirs, explosions et impacts en couches, grognements selon la distance de la horde,
  vent du désert (plus fort pendant les tempêtes).
- **Performances** : le décor fixe est fusionné en quelques maillages (`mergeStatic`), les zombies hors écran ne sont ni
  dessinés ni animés, leurs ombres de contact sont instanciées. **Qualité auto** (`applyAq`, 6 niveaux, retenu d'une
  session à l'autre) : ombres fixes → résolution −25 % → sans halo → sans ombres → résolution 70 % → 50 %.
  Option « Afficher les images/s » ; les Paramètres indiquent la carte graphique et préviennent si le navigateur
  dessine sans accélération matérielle.
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
- **Pause tactique** de 45 s entre les vagues (lançable plus tôt).
- **Refuges** (SHELTER_ITEMS dans story.js) : Pharmacie (trousse, rations, seringue de rage), Atelier
  (tourelles, barbelés, fûts piégés, portes renforcées, baskets, aimant), Hôpital (soins complets, PV max,
  blindage, réflexes). À l'intérieur on ne tire plus
  et les zombies ne vous voient plus… mais ils assiègent la porte : si elle cède, vous êtes éjectée.
- **Objectifs → pièces de la voiture** : bidon d'essence (vague 3), défendre le générateur (7 : restez à côté pour le réparer ; plus solide à chaque échec, 2 tourelles de renfort après 2 échecs),
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
- **Rex le chien** : rejoint la survivante au niveau 6 de survivante (morsure plus forte aux niveaux 15 et 30).

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
Sons : **Kenney** (kenney.nl), packs « Impact Sounds », « Sci-fi Sounds », « Music Jingles », licence **CC0**
(ssets/audio/, liste dans ssets/audio/manifest.json). Les tirs restent synthétisés.
Three.js (MIT).


**L'Entraînement (bonus permanents achetés avec la réserve) est retiré** : la réserve dépensée est remboursée au lancement.
La réserve sert aux personnages, au Garage et aux réanimations payantes.
