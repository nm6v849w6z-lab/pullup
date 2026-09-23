# Suivi de développement — Pull Up / Hoop Manager

Ce fichier est tenu à jour en permanence par Claude à chaque session de travail,
pour ne plus jamais perdre le fil d'une modification en cours (retour
utilisateur, 2026-09-23 : "je veux que tu tiennes à jour un document où tu
notes les modifications à faire sur le code [...] pour éviter de tout oublier
comme tu l'as fait hier"). Il vit dans le dépôt (`pullup-real/DEV_NOTES.md`
côté sandbox, `~/Documents/PullUp/DEV_NOTES.md` côté Mac) et doit être commité
avec le code qu'il décrit, pas laissé de côté.

**Règle de tenue à jour** : avant de démarrer un nouveau chantier, ajouter une
entrée dans "En cours" ; à chaque étape significative (port terminé, tests
verts, déploiement Mac, commit), mettre cette entrée à jour ; une fois
committé et poussé par l'utilisateur, déplacer l'entrée vers "Historique" avec
la date et le hash de commit si connu. Ne jamais laisser "En cours" désynchro
de l'état réel du code.

---

## En cours

### teamDetailEffectifHtml (effectif d'une équipe adverse) — non triable, pas dans le périmètre de ce correctif
- Repéré en creusant le bug ci-dessous (Historique) : `teamDetailEffectifHtml`
  (vue de l'effectif d'une équipe adverse, `#teamDetailContent`) a le même
  genre de tableau `<th>` bruts, sans `data-sort`, donc non triable non
  plus — mais PAS ce que l'utilisateur a signalé (ses captures montraient
  bien son propre Effectif). Laissé de côté volontairement cette fois pour
  rester focalisé sur le bug réellement signalé ; pas de demande
  utilisateur dessus pour l'instant.
- **Prochaine étape (si demandé)** : même traitement que ci-dessous
  (`rosterHeaderCellHtml`-like + état de tri dédié, `#teamDetailContent` a
  son propre écouteur délégué séparé de `#rosterContent`) — mais attention,
  ce tableau peut afficher un adversaire NON scouté (verrou de scoutisme à
  respecter, contrairement à `renderEffectifSection` qui n'affiche que sa
  propre équipe).

---

## Historique (terminé, committé ou en attente de commit)

### 2026-09-23 — pas encore commité — Effectif > Caractéristiques : colonnes triables
- Signalé (2 captures d'écran, onglet Effectif > sous-onglet Caractéristiques,
  équipe "Gotham Knights") : "les colonnes ne peuvent de nouveau plus être
  triées".
- **Cause** : ce sous-onglet (`renderEffectifSection()`, branche
  `effectifSubView === "caracteristiques"`, colonnes MI-D/3PTS/INT/PASSE/
  REB/CTR/DRIB/DEF EXT/DEF INT/LF/PÉN/CRÉA/INTC/PHYSIQUE/MENTAL) était
  rendu avec des `<th>` bruts, aucun `data-sort` — jamais câblé pour le tri
  dans le code actuel, contrairement au sous-onglet "Général" qui, lui,
  utilise déjà `ROSTER_SORT_COLUMNS`/`rosterHeaderCellHtml`/
  `rosterSortState`/`rosterSortValue` + l'écouteur délégué sur
  `th[data-sort]` (déjà présent sur `#rosterContent`, fonctionne quel que
  soit le sous-onglet affiché — il ne manquait que des en-têtes
  cliquables).
- **Corrigé** en réutilisant EXACTEMENT ce même mécanisme plutôt que d'en
  inventer un second : en-têtes remplacés par `rosterHeaderCellHtml(key,
  label)` pour Nom/Poste/Taille/Salaire + chaque caractéristique de
  `FUNDAMENTAL_ATTRS` (clé = la caractéristique elle-même, déjà supportée
  par la branche `default: return p.attrs[key]` de `rosterSortValue`) ;
  deux nouvelles clés `"physicalAvg"`/`"mentalAvg"` ajoutées à
  `rosterSortValue` pour les colonnes moyennées Physique/Mental (même
  calcul arrondi que `categoryAverageCellHtml`, pour trier exactement sur
  la valeur affichée à l'écran). `sorted` (déjà calculé en tête de
  `renderEffectifSection` à partir de `rosterSortState`) alimentait déjà
  cette table correctement — seules les en-têtes cliquables manquaient.
- `teamDetailEffectifHtml` (effectif d'une équipe ADVERSE) a le même défaut
  mais n'est pas ce que l'utilisateur a signalé — laissé de côté
  volontairement, voir l'entrée "En cours" plus haut.
- **Testé** : nouveau fichier `effectif_caracteristiques_sort_test.js` —
  vérifie que les 19 colonnes sont bien `data-sort`, que le tri sur une
  caractéristique brute (MI-D) et sur les deux moyennes (Physique/Mental)
  fonctionne dans les deux sens (1er clic = plus fort au moins fort,
  re-clic = inverse), que la colonne Nom trie alphabétiquement, et que le
  sous-onglet "Général" n'a pas régressé. Suite complète (83/83, avec ce
  nouveau fichier) confirmée verte en sandbox.
- **Pas encore déployé sur le Mac, pas encore commité.**

### 2026-09-23 — pas encore commité — Fiche joueur : refonte "pdp-card"
- Reprend le chantier laissé "À FAIRE" ci-dessus lors de la session
  précédente ("je n'ai tjrs pas les bonnes fiches joueurs" / "passe aux
  fiches joueurs stp") : port complet de `renderPlayerDetail` depuis le
  fichier de référence `moteurbasket3-1.html` (déjà entièrement dessiné
  là-bas) vers le jeu réel — remplace l'ancien tableau brut de 29
  caractéristiques par une mise en page en cartes (`.pdp-grid` 2 colonnes,
  `.pdp-card`, note globale + étoiles, terrain avec poste mis en évidence,
  `.pdp-attr-grid` 3 blocs Fondamentaux/Physique/Mental, statut
  Condition/Statistiques/Records, radar de profil, 5 derniers matchs).
- **Porté verbatim** (fonctions autonomes, aucune incompatibilité) :
  `comparableSalesValuation` (estimation par ventes comparables sur 60
  jours), `matchResultForLogEntry`, `RADAR_AXES`/`playerRadarCategories`/
  `radarChartSvg`.
- **Adapté** (mécanismes différents entre le fichier de référence et le
  jeu réel) :
  - Scoutisme : la référence utilise un système de fourchettes
    (`scoutingInfo`/marge) — remplacé partout par le mécanisme RÉEL du jeu
    (révélation binaire tout-ou-rien par caractéristique via
    `teamA.scoutedAttrs`), pas de variante `.range`.
  - Paliers de couleur : nouvel helper `pdpPillTier` réutilisant les MÊMES
    seuils que `attrCellHtml` (attr-lo/mid/good/elite) plutôt que la
    palette incompatible de la référence (rouge/orange/blanc/vert) — pour
    garder une palette cohérente entre Effectif/Marché/fiche joueur.
  - Confidentialité de l'enchérisseur : contrairement à la référence
    (affiche l'identité via `teamLinkHtml`), la carte "Mise en vente"
    reprend la règle déjà en place ailleurs dans le jeu (montant SEUL,
    jamais le nom de l'équipe enchérisseuse — règle explicite déjà en
    place sur le marché des transferts).
- **Volontairement pas repris cette fois** : `player.nationality` (champ
  inexistant côté jeu réel — ligne Nationalité simplement omise, pas
  affichée en "?"). `player.lastAttrTrend` (champ inexistant — la flèche de
  tendance reste dans le code, lit le champ de façon défensive exactement
  comme la référence, affiche juste "·" (stable) en permanence tant qu'un
  futur suivi de tendance n'existe pas — dégradation propre, pas bloquant).
- **Testé** : `player_detail_test.js` et `thirteen_attrs_test.js` mis à
  jour (sélecteurs `.attr-cell`/`.player-attr-grid` remplacés par
  `.pdp-pill`/`.pdp-attr-grid`, markup intentionnellement changé). Suite
  complète (82/82 fichiers de tests) confirmée verte en sandbox — 5 échecs
  observés lors d'un premier passage à forte parallélisation
  (`end_to_end_test.js`, `persistence_test.js`, `promotion_test.js`,
  `visibility_refresh_test.js`, `training_progression_test.js`) tous
  confirmés être de la contention de ressources (trop de serveurs de test
  locaux lancés en même temps → `ECONNRESET`/minuteurs qui ratent leur
  fenêtre), pas des régressions : tous passent individuellement en série.
- **Déployé sur le Mac, 82/82 tests verts là-bas aussi** (un échec isolé de
  `player_detail_test.js` au premier passage sur le Mac — MVP tiré sans
  matchLog complet à 3 journées, flakiness déjà documentée ci-dessous —
  confirmé transitoire en le relançant seul : vert). **Reste à commiter et
  pousser** (toujours depuis le terminal Mac de l'utilisateur).

### 2026-09-23 — commit `831a99c` — Entraînements combo + correctif définitif uid()
- **Entraînements combo** : 3 programmes composites portés depuis le fichier
  de référence (`moteurbasket3-1.html`) vers le jeu réel — `creativeScoring`
  ("Scoreur créatif" : Création de tir + Dribble), `perimeterDefense`
  ("Défense de périmètre" : Interceptions + Défense extérieure),
  `rimAttack` ("Attaque du cercle" : Pénétration + Lancer franc). Bonus
  cohérence : `quickShots` ("Tirs rapides") retrouve son 4e ingrédient
  "dribble" (à la place de l'ancien "agility", devenu Physique).
- **Bug staff "Cette enchère est déjà terminée" — cause RACINE corrigée**
  (signalé à nouveau 2026-09-23 : "ce probleme là n'est tjrs pas résolu non
  plus", malgré `dd27f48` qui n'avait traité qu'une partie du problème).
  Vraie cause : `uid()` (engine.js, `let __uid = 1`) est un compteur GLOBAL
  AU PROCESS, jamais persisté — il repart de 1 à CHAQUE redémarrage du
  process serveur (donc à chaque déploiement Render, pas seulement à chaque
  rechargement de page navigateur, le seul cas que `dd27f48` couvrait). Si
  le marché doit se réapprovisionner juste après un redémarrage, les
  nouveaux id (1, 2, 3...) peuvent entrer en collision avec ceux, bien plus
  élevés, déjà utilisés par d'anciennes entités de la ligue —
  `Array.prototype.find` renvoie alors la mauvaise entité (souvent une
  annonce déjà fermée), même si l'annonce affichée à l'écran (temps restant
  positif) est la bonne. Corrigé via `Engine.reseedUidFromSave(data)`
  (nouvelles fonctions `scanMaxId`/`bumpUidFloor`/`reseedUidFromSave`,
  miroir exact `engine.js`/`moteurbasket3.html`) : relit toute sauvegarde
  chargée pour relever le plancher de `uid()` au-dessus du plus grand id
  déjà utilisé, AVANT toute reconstruction d'objets. Câblé dans
  `server/store.js` (`deserialize`/`deserializeMultiLeague`, solo et ligue
  partagée) et `moteurbasket3.html` (`loadMyTeam()`).
- **Testé** : nouveau test `uid_reseed_after_restart_test.js` — reproduit un
  VRAI redémarrage de process serveur (deux process Node distincts,
  communiquant par un vrai fichier de sauvegarde) ; confirmé qu'il échoue
  sans le correctif et passe avec.
- **Committé et poussé** (`831a99c`, confirmé par l'utilisateur — push
  réussi après un fichier `.git/index.lock` périmé supprimé côté Mac).
  82/82 tests verts en sandbox ET sur le Mac avant le commit.
- **Confirmé résolu en production** (2026-09-23) : déploiement Render
  effectif (entraînements combo visibles en jeu), et après un rechargement
  complet de la page (Cmd+Maj+R — un premier test sur un onglet resté ouvert
  depuis avant le déploiement avait encore montré le bug, simple cache
  navigateur de l'ancien JS, pas une régression du correctif), "c'est bon ça
  marche" côté Staff.

### 2026-09-23 — commit `bd33907` — Entraînement des fondamentaux + avatars/arène
- Demande initiale : "on ne dit plus entrainement individuel mais
  entrainement des fondamentaux [...] et ça ne doit entrainer que les
  fondamentaux".
- Clarification obtenue : "le physique ne bouge qu'un peu au cours de la
  carrière du joueur, alors que le mental peut bien évoluer et progresse
  durant toute la carrière du joueur" — Fondamentaux (13, entraînables),
  Physique (7, évolue à peine seul), Mental (9, progresse en continu, jamais
  de déclin).
- **Committé et poussé** (`bd33907`, confirmé via `git log` côté Mac) —
  regroupé avec le port avatars/arène (voir ci-dessous).

### 2026-09-22 — Reset onboarding tour "Skyzer10" (production)
- Bug Discord : joueur bloqué hors du tutoriel après un aller-retour, plus
  d'accès au bouton "Lancer le tutoriel".
- Route déjà existante utilisée : `POST /api/admin/reset-onboarding-tour`
  (`server/index.js`, header `X-Admin-Token`).
- **Confirmé résolu en production** : reset effectué sur l'équipe "Cerberus
  Basketball Team" → `{"ok":true,"onboardingTourCompleted":false}`.
- Pas de changement de code nécessaire (route déjà en place).

### Avatars / Arène / Mental-Physique 2-colonnes
- Port terminé (AvatarGen, ArenaGen, affichage moyenné Physique/Mental sur
  les tableaux Effectif) — **committé avec `bd33907` ci-dessus**.

---

## État Git côté Mac (dernier point de contrôle connu — 2026-09-23)

Dernier commit poussé : `831a99c` (voir Historique ci-dessus). Rien en
attente actuellement.

Rappel permanent : **le push reste toujours fait par l'utilisateur depuis
son propre terminal Mac authentifié** — Claude ne pousse jamais lui-même (le
shell `device_bash` n'a pas les identifiants GitHub).

Rappel technique (vécu deux fois ce 2026-09-23, une fois côté pont
`device_bash`, une fois pour de vrai sur le Mac) : un fichier
`.git/index.lock` périmé bloque `git` avec "Another git process seems to be
running" — si aucun autre `git` ne tourne réellement, `rm -f
.git/index.lock` puis relancer la commande suffit.

---

## Tests connus flaky (pas des régressions, sûrs à ignorer sur un seul échec)
- `league_stats_test.js`
- `training_progression_test.js` (rare, simulation de match aléatoire)
- `player_detail_test.js` (rare, dépend du MVP tiré aléatoirement après
  quelques journées simulées)

Si un de ces tests échoue seul, le relancer une fois avant de creuser.

**Lancer la suite complète en parallèle avec trop de jobs à la fois est une
source de faux échecs** (constaté 2026-09-23, ~15 tests lancés en parallèle
d'un coup) : `end_to_end_test.js`/`visibility_refresh_test.js` (minuteurs
réels qui ratent leur fenêtre sous charge CPU) et
`persistence_test.js`/`promotion_test.js` (`ECONNRESET` sur les serveurs de
test HTTP locaux, trop de connexions simultanées). Tous passent
individuellement. Limiter à ~8 jobs en parallèle max, et en cas d'échec sur
un de ces 4 fichiers précisément, le relancer seul avant de conclure à une
régression.
