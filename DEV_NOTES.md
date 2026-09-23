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

### Retrait de "Mental" comme caractéristique indépendante du moteur
- Signalé (2026-09-23) : "et la caractéristique mental (ici 27) n'a plus
  lieu d'exister [...] le mental c'est désormais la moyenne de toutes ces
  lignes", puis confirmé sans ambiguïté : "j'espère que tu n'as pas gardé
  une ligne de code mental dans le moteur de jeu".
- Contexte : `mental` est actuellement l'UNE des 9 `MENTAL_ATTRS`, stockée/
  persistée comme les 8 autres (decision/focus/composure/anticipation/
  determination/leadership/discipline/vision), avec ses propres mécanismes
  de match dédiés (boost clutch fin de match serrée + malus de "tilt" après
  une série de ratés, voir le grand commentaire au-dessus d'ATTRS dans
  engine.js) — décision DÉLIBÉRÉE prise lors d'une session précédente de la
  garder ainsi (contrairement au bac à sable de référence qui l'avait déjà
  éclatée en 8 traits séparés), désormais inversée par ce retour
  utilisateur.
- **Objectif** : `mental` disparaît d'ATTRS/MENTAL_ATTRS/TRAINING_LABELS (29
  → 28 caractéristiques au total) ; partout où le moteur avait besoin d'une
  valeur "mental" (bonus clutch, malus de tilt, chance de discussion de
  demande de transfert), la calculer désormais à la volée comme la moyenne
  des 8 traits mentaux restants, plutôt que de lire un champ indépendant.
- **À faire, dans engine.js ET son miroir dans moteurbasket3.html (les deux
  DOIVENT rester identiques, voir le grand commentaire "moteur mirroré" déjà
  en place)** :
  - ATTRS (retirer "mental"), TRAINING_LABELS (retirer l'entrée), MENTAL_ATTRS
    (retirer "mental", 9 → 8).
  - Nouvelle fonction `mentalAverage(player)` (moyenne des 8 `MENTAL_ATTRS`
    restants) — remplace les 3 lectures directes de `attrs.mental` trouvées :
    `TRANSFER_REQUEST_DISCUSS_MENTAL_BONUS` (chance de discuter une demande
    de transfert), et les 2 formules clutch/tilt de `MatchEngine.
    playPossession` (`mentalClutchBoost`/`tiltPenalty`).
  - Migration des sauvegardes (`playerFromSave`) : `missingNewAttrs`/
    `attrs13Keys` retirent "mental" de la liste (12 clés au lieu de 13 pour
    ce palier de migration, pas de backfill pour un champ qui n'existe plus).
    Les sauvegardes existantes garderont un champ `attrs.mental` orphelin
    (jamais lu/écrit par le moteur désormais) — inoffensif, pas de nettoyage
    actif nécessaire.
  - Nettoyer les commentaires les plus trompeurs (le grand commentaire
    au-dessus d'ATTRS présente encore "mental" comme un trait à part, la
    section MENTAL (9, ...) doit devenir (8, ...), POSITION_ATTR_PROFILE
    mentionne encore "Mental" dans son énumération des traits généralistes).
  - Vérifié : `TRAINING_SYNERGY`, `POSITION_ATTR_PROFILE`, `TACTICAL_ATTRS`
    n'ont AUCUNE entrée "mental" à retirer (déjà absent, confirmé par grep).
    Les boucles `mentalPotential`/progression naturelle
    (`mentalGrowthFactorForAge`) itèrent déjà génériquement sur
    `MENTAL_ATTRS` : rien à changer là, elles s'ajustent automatiquement à
    8 entrées.
- **Tests à mettre à jour** : `thirteen_attrs_test.js` (overall() attendu sur
  28 caractéristiques et non 29, migration mental/endurance/freeThrow →
  endurance/freeThrow seulement, formules clutch/tilt à retester via les 8
  sous-attributs plutôt que `attrs.mental` directement, en-tête "Mental" de
  la fiche joueur qui ne doit PLUS apparaître comme ligne individuelle).
  Vérifier aussi `training_progression_test.js`/`salary_test.js`/
  `synergy_training_test.js`/`tactical_knowledge_test.js` pour toute
  référence directe à `attrs.mental` ou à un total de 29 caractéristiques.
- **Pas encore commencé le code** (uniquement l'investigation/le plan
  ci-dessus à ce stade) — reprendre par l'édition d'engine.js.

---

## Historique (terminé, committé ou en attente de commit)

### 2026-09-23 — pas encore commité — 4 correctifs fiche joueur + tri effectif adverse
- **Plus de couleurs sur les pastilles/note globale** ("on a plus du tout les
  couleurs sur les carac et la note globale") : le palier "lo" (< 45)
  utilisait `var(--ink-faint)` (gris très sourd, quasi invisible sur fond
  sombre) au lieu d'une vraie couleur — contrairement à `attrCellHtml`
  (Effectif/Marché) où la mini-barre (déjà colorée en rouge pour "lo") porte
  le signal visuel pendant que le texte reste discret ; sur la fiche joueur,
  la pastille EST le seul signal. Corrigé : `.pdp-pill.attr-lo`/
  `.pdp-overall-num.attr-lo` passent à `var(--danger)` (rouge), comme
  "good"/"elite" ont déjà leur propre couleur.
- **Texte "Mise en vente" trop gros** ("il est plus grand que le titre MISE
  EN VENTE") : `<p class="sub">` (estimation par ventes comparables) n'avait
  ici AUCUNE règle CSS scopée `.pdp-card .sub` (contrairement à CHAQUE
  autre usage de "sub" dans ce fichier, toujours scopé à son conteneur) et
  retombait donc sur la taille par défaut d'un `<p>`. Ajouté
  `.pdp-card .sub{font-size:12px;color:var(--ink-dim);}`.
- **Grand vide à gauche ET à droite de la fiche joueur** ("pourquoi c'est
  aussi serré ? [...] gros trou [...] à gauche [...] à droite il y a aussi
  de la perte de place") — PAS un bug du schéma de terrain (vérifié
  identique au fichier de référence), le vrai coupable :
  `playerDetailSection` était dans `NARROW_PAGE_IDS` (gabarit plafonné à
  700px, voir `.wrap-narrow`), réglage hérité de l'ANCIEN format à plat
  (chips + grille plafonnée à 420px, où 700px avait justement été choisi
  pour éviter un vide à DROITE). La refonte "pdp-card" (grille 280px+1fr,
  elle-même avec un bloc à 3 colonnes Fondamentaux/Physique/Mental à
  droite) est maintenant aussi dense que l'Effectif — 700px la comprimait
  des deux côtés. Corrigé : `playerDetailSection` déplacée de
  `NARROW_PAGE_IDS` vers `WIDE_PAGE_IDS` (comme Effectif/Coupe/Ordres, voir
  showPage/.wrap-wide). `NARROW_PAGE_IDS` est désormais vide (conservé pour
  un futur besoin).
- **Effectif d'une équipe adverse non triable** ("il faut aussi pouvoir
  trier sur la page effectif de qqun", juste après le correctif du tri sur
  SON PROPRE Effectif) : `teamDetailEffectifHtml` avait le même défaut
  (`<th>` bruts, aucun `data-sort`). Corrigé en réutilisant le même schéma
  que `rosterHeaderCellHtml`/`rosterSortState` (nouvel état dédié
  `teamDetailEffectifSortState`, écouteur délégué sur `[data-team-sort]`
  dans `#teamDetailContent`) — MAIS avec un garde-fou spécifique au
  scoutisme : une colonne de caractéristique n'est triable QUE si sa valeur
  est déjà révélée pour CETTE équipe précise (`teamDetailSortAllowed`),
  jamais pour un adversaire non scouté (trier révèle un ORDRE, donc de
  l'information sur des valeurs censées rester cachées) ; et si un tri
  choisi sur une équipe où la colonne était révélée reste actif en
  changeant d'équipe où elle ne l'est plus, repli automatique sur le tri
  par défaut (poste + note globale) plutôt que de trier silencieusement sur
  la vraie valeur cachée.
- **Testé** : `player_detail_test.js` étendu (vérifie `wrap-wide` sur la
  fiche joueur) ; nouveau `team_detail_effectif_sort_test.js` (colonnes
  triables sur sa propre équipe, verrouillées pour un adversaire non
  scouté, garde-fou anti-fuite en changeant d'équipe). Suite complète
  (84/84, avec ce nouveau fichier) confirmée verte en sandbox.
- **Pas encore déployé sur le Mac** au moment de l'écriture de cette
  entrée — en cours.

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
