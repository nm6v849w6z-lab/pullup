# Onglet « Dynamique de groupe » — audit, conception et feuille de route

> Document de conception, aucune ligne de code modifiée. Références vérifiées dans le code le 2026-10-05 : les numéros de ligne sont approximatifs (ils dérivent à chaque commit), seuls les noms de fonctions font foi.

---

## 0. En une page

**Tu as déjà environ 55 à 60 % des briques.** Le jeu sait déjà mesurer la cohésion collective (`Team.chemistry`), la motivation individuelle (`Player.form`), le temps de jeu réel (match par match et semaine par semaine), le statut dans la rotation (`playerRoleKey`), l'ancienneté au club (`clubSinceSeason`), la formation maison (`homegrownClub`), la nationalité, l'âge, le leadership (attribut mental), un premier lien inter-joueurs (`Team.mentorships`), les tensions contractuelles (demandes d'augmentation, refus) et un fil d'actualité capable de porter des événements. Il manque surtout trois choses :

1. **une vue qui assemble tout ça** (hiérarchie, groupes, raisons de l'humeur) — c'est presque entièrement du calcul à la volée, sans nouvelle donnée ;
2. **une mémoire des relations entre deux joueurs** (le seul vrai « nouveau système » à créer) ;
3. **des événements de vestiaire et des actions du coach** qui transforment les chiffres en situations jouables.

**Principe directeur : une seule source de vérité par concept.**

| Concept | Source unique | Ce qu'on interdit |
|---|---|---|
| Cohésion du groupe | `Team.chemistry` (écrite uniquement par `applyChemistryDelta`) | Une deuxième jauge « cohésion du vestiaire » |
| Satisfaction / moral individuel | `Player.form` (libellé « Motivation ») | Une variable `satisfaction` parallèle ; on **explique** `form` par des raisons calculées |
| Statut / hiérarchie | Calculé à la volée (minutes, rôle, rang, âge, ancienneté, leadership) | Un champ `squadStatus` saisi à la main en phase 1 |
| Groupes / clans | Calculés à la volée (affinités) | Des clans persistés |
| Relation A ↔ B | **Nouveau** : `Team.relations` (creux, seulement les paires notables) | Recalculer une relation persistante à partir de rien à chaque affichage |
| Événements de vestiaire | Le fil existant (`Team.feed`) + un petit journal dédié | Un deuxième système de notifications |

**MVP réaliste** : la phase 1 (vue dérivée + hiérarchie + groupes + motivation expliquée + événements existants regroupés) n'ajoute presque aucune donnée persistée et se livre en 1 à 2 semaines de travail. La phase 2 (relations par paires + événements de vestiaire + discussions et promesses) est celle qui rend l'onglet vivant. La phase 3 (personnalités, capitaine, contagion, réseau qui évolue) est la profondeur « à la Football Manager ».

---

## 1. Audit

### 1.A — Ce qui existe

Légende de la dernière colonne : **Tel quel** = réutilisable sans modification ; **Adapter** = à étendre ou à corriger ; **Lecture** = sert uniquement d'entrée au calcul.

#### Cohésion collective

| Système | Où | Rôle actuel | Données exposées | Apport à la dynamique de groupe | Réutilisable |
|---|---|---|---|---|---|
| Alchimie d'équipe | `engine.js` : `Team.chemistry` (0-100, plancher `CHEMISTRY_MIN = 40`, l.~5314), `applyChemistryDelta` (l.~7131, **seul point d'écriture**), `chemistryFactor()` (0,94 → 1,06, l.~7172), lu par `Player.eff()` via `matchChemistryFactor` (l.~5217, posé dans `Team.resetForMatch` l.~10039) | Bonus/malus collectif de performance | Valeur, libellé `chemistryLabel` (l.~5817) | **C'est la cohésion de l'onglet.** Tous les impacts « groupe » passent par `applyChemistryDelta` | Tel quel (+ historique à ajouter) |
| Gains « jouer ensemble » | `Team.updateChemistryAfterMatch` (l.~7143), `lastStartersKey` | +0,5 par match, +1 si même cinq | Clé du cinq précédent | Signal de stabilité du cinq | Tel quel |
| Résultats | `Team.applyChemistryResult` (l.~7155), `chemistryResultStreak`, appelé par `recordMatchStatsAndAwardMvp` (l.~12867) hors amicaux | Victoire +2/+3 en série, défaite −1/−2, −1 si écart > 20 | Série en cours (signée) | « Dynamique récente » et déclencheurs « série de défaites fragilise le vestiaire » / « grosse victoire soude » | Tel quel |
| Changements d'effectif | `transferPlayerBetweenTeams` (l.~2189), `Team.sellPlayer` (l.~8072), `League.signFreeAgentFromListing` (l.~14332), pondérés par `chemistryRosterImportance(rosterRankOf(...))` (l.~5798-5810) | Malus au départ (plein) et à l'arrivée (moitié) | Rang du joueur dans l'effectif | Déclencheur « départ d'un cadre », « recrue qui doit s'intégrer » | Tel quel |
| Alerte de fil | `checkThresholds` → `feedMoodEntry` (l.~6125-6170), appelé chaque semaine depuis `Team.trainWeek` (l.~9244) | « Tensions dans le vestiaire » (< 30) / « Un groupe soudé » (> 70) | Entrée de fil `mood_chemistry` | Point d'entrée naturel vers le nouvel onglet | **Adapter** (voir incohérence ci-dessous) |
| Interviews de jalon | `MILESTONE_INTERVIEW_TYPES` (l.~2762), `Team.resolveInterview` (l.~7039), tons `chemistryWin/chemistryLoss` | Le ton du coach bouge l'alchimie et la motivation de **tout** l'effectif | `pendingInterviews` | Modèle d'« action du coach à choix de ton » à dupliquer pour les discussions individuelles et la réunion d'équipe | Tel quel (modèle) |
| UI | `moteurbasket3.html` : `renderEffectifHeader` (l.~47908), `renderOrdresChemistryGauge` (l.~29718), `dashRenderPulse`/`dashMoodLabel` (l.~45836/45354) | Jauge et libellé | — | Réutiliser le composant jauge dans la vue générale | Tel quel |
| Tests | `team_chemistry_test.js`, `chemistry_gain_test.js`, `chemistry_result_test.js` | | | | À étendre |

**Incohérence relevée (à corriger en étape 1).** Depuis l'ajout du plancher `CHEMISTRY_MIN = 40`, l'alerte « Tensions dans le vestiaire » (seuil `value < 30` dans `feedMoodEntry`) ne peut **plus jamais** se déclencher, et les libellés « Tensions dans le groupe » (25-44) et « Vestiaire fracturé » (< 25) de `chemistryLabel` sont devenus quasi ou totalement inatteignables. Un onglet de dynamique de groupe a besoin d'une échelle qui couvre réellement la plage 40-100 : soit on recale les seuils (par exemple 40-49 « Vestiaire fracturé », 50-59 « Tensions », 60-74 « Correct », 75-89 « Bonne cohésion », 90+ « Alchimie parfaite »), soit on affiche une valeur normalisée `(chemistry − 40) / 60`. À trancher, mais ne pas laisser en l'état.

#### Motivation individuelle

| Système | Où | Rôle actuel | Apport | Réutilisable |
|---|---|---|---|---|
| `Player.form` (1-100), libellé `motivationLabel` (l.~4018) | `Player` ; effet `formFactor` 0,85 → 1,15 dans `eff()` (l.~5200) | Motivation = performance ±15 % | **C'est la satisfaction de l'onglet.** | Tel quel |
| Frustration de banc | `Team.applyBenchFrustration` (l.~8695), constantes `BENCH_FRUSTRATION_*` (l.~1021) : −0,6/semaine si ≤ 7,5 min cumulées, ×3 si le joueur note mieux que le titulaire à son poste | Le seul moteur « temps de jeu → humeur » | Raison n°1 d'insatisfaction ; détecteur « mérite d'être titulaire » | Adapter (rendre la logique d'attente réutilisable) |
| Demande de transfert | `Team.updateTransferRequests` (l.~8724) : `form ≤ 20` pendant 3 semaines → `transferRequestActive`, `transferRequestQuote` ; `Team.discussTransferRequest` (l.~8759) : 35-65 % de succès, +25 de motivation | Crise individuelle et réponse du coach | Modèle de « discussion » à généraliser | Tel quel |
| Contrats | `offerContractExtension` (l.~9348, refus −2 à −8), `respondToRaiseRequest` (l.~9389, refus −10), `League.weeklyContractsTick` (l.~14268) | Tension contractuelle | Raison « contrat » | Tel quel (lecture) |
| Planchers | `TRANSFER_NEW_CLUB_MOTIVATION_FLOOR = 55` (l.~4040), `INTERSAISON_MOTIVATION_FLOOR = 55` (l.~4043, appliqué l.~13952/14198) | Remise à niveau | — | Tel quel |
| Lecteurs | `contractMoraleFactor` (l.~3713), `contractAcceptanceChance` (l.~3757), `retirementTalkChance` (l.~4567) | La motivation a déjà des conséquences hors terrain | Montre que `form` est déjà « l'humeur » du joueur | Tel quel |
| UI | `motivationBadgeHtml` (l.~26703), `effMotivationHtml` (l.~47859), `transferRequestBadgeHtml` (l.~26734), `retirementBadgeHtml` (l.~26743) | Badges | Réutiliser dans les cartes de joueurs | Tel quel |
| Confidentialité | `server/publicPlayers.js` : `HIDDEN_PLAYER_FIELDS` (l.~31) cache `form`, `weeksAtLowMotivation`, `transferRequest*` | Privé au club | L'onglet est **propre au club du manager** | Tel quel |
| Tests | `bench_frustration_test.js`, `transfer_request_test.js`, `transfer_new_club_motivation_test.js` | | | À étendre |

**Constat de design important.** La liste exhaustive des écritures de `Player.form` (grep `\.form = ` dans `engine.js`) montre qu'en dehors des planchers de transfert/intersaison, des interviews et de la discussion réussie, **la motivation ne fait que baisser** : il n'existe aucun regain naturel quand un joueur retrouve du temps de jeu, et les victoires ne la touchent pas. Une dynamique de groupe crédible a besoin d'un **levier à la hausse** symétrique (voir § 4, « attentes de temps de jeu satisfaites »). Ce n'est pas une nouvelle variable, c'est un nouveau terme dans le même calcul hebdomadaire.

#### Temps de jeu et rôle

| Système | Où | Données | Apport | Réutilisable |
|---|---|---|---|---|
| Compo | `Team.lineup` `{ starters, backupPositions, minutes, convoked }`, `CONVOCATION_MAX = 12` (l.~6201), `plannedMinutesByPlayer()` (l.~7729), `starterPosition()` (l.~9690) | Rôle prévu | Hiérarchie prévue par le coach | Lecture |
| Rôle explicite | `Team.playerRoleKey(id)` (l.~8785) → `starter` / `rotation` / `reserve` | Utilisé par la retraite et les amicaux | Brique de base du statut | Tel quel |
| Minutes réelles | `Player.secondsPlayed` (dernier match), `trainingSecondsPlayedByPosition` (semaine, remis à zéro dans `trainWeek`), `playerWeekSeconds` (l.~1536), `matchLog[].min` et `matchLog[].starter` | Temps de jeu effectif | **Part des minutes** = colonne vertébrale de la hiérarchie basket | Lecture |

Manque : aucune notion d'**attente** de minutes (statut promis/attendu), aucune promesse.

#### Attributs mentaux et leadership

`MENTAL_ATTRS` (l.~180) : `decision, focus, composure, anticipation, determination, leadership, discipline, vision`, moyenne `mentalAverage`. Le leadership n'a qu'un usage sur le terrain : `captainLeadership` / `leadershipRelief` (l.~19494) prend le **meilleur leadership du cinq en jeu** pour amortir les séries de tirs ratés — c'est déjà, implicitement, un « capitaine sur le terrain ». `Player.aggressiveness` (caché) sert aux fautes. **Aucune personnalité** (ego, ambition, loyauté, professionnalisme). `leadership`, `discipline` et `determination` sont des **proxys de personnalité** réutilisables en phase 1 et 2 sans rien créer.

#### Relations inter-joueurs

| Système | Où | Apport | Réutilisable |
|---|---|---|---|
| Parrainages | `Team.mentorships [{youngId, veteranId}]` (constructeur l.~6363), `MENTORSHIP_MAX_PAIRS = 2`, jeune ≤ 22 ans, vétéran ≥ 29 ans, même poste, mental ×1,3 (`MENTORSHIP_*` l.~1552, `activeMentorships` l.~7484, `sanitizeMentorships` l.~1589) ; UI `renderMentorshipCard` (l.~44500) ; action serveur `server/actions.js` (l.~594) | **Seule relation individuelle existante** : arête forte « vétéran aide un jeune » | Tel quel (arête du graphe) |
| Rivalités de clubs | `Team.rivalries`, derbys | Niveau club, pas joueurs | Non pertinent ici |
| Ancienneté | `Player.clubSinceSeason` (posé par `recordPlayerEvent` l.~5698, lu l.~11644) | Les « anciens » ; recouvrement d'ancienneté entre deux joueurs | Lecture |
| Formé au club | `Player.homegrownClub` (l.~3372, `promoteYouthPlayer` l.~8636) | Groupe « enfants du club » | Lecture |
| Nationalité | `Player.nationality` (code ISO, l.~4089), drapeaux `nationFlagHtml` côté client (l.~32066, `assets/flags/<code>.png`) | Groupe « même nationalité », joueurs étrangers isolés | Lecture |

Aucune affinité par paire, aucun compteur « minutes passées ensemble sur le terrain ».

#### Performance, statut, historique

- `Player.matchLog[]` (poussé dans `recordMatchStatsForTeam`, l.~12655-12720) : `min, pts, reb, oreb, dreb, ast, stl, blk, tov, pf, fgm2, fga2, fgm3, fga3, ftm, fta, paintAtt, ptsPaint, ptsMid, pts3, ptsAssisted, ptsSolo, plusMinus, starter, isMvp, competition, opponent, isHome, week, team…`. **Attention** : il n'y a pas de champ `fga` agrégé, il faut sommer `fga2 + fga3` (+ `0,44 × fta` pour une vraie part d'utilisation).
- MVP : `awardMatchMvp` (l.~12737), `statEvaluation` (PIR, l.~3116).
- Gros matchs : `BIG_GAME_THRESHOLDS` (l.~5528) + `recordPlayerEvent` → `Player.historyLog` (max 60).
- `Player.weeklyHistory` (l.~16860) : instantané hebdomadaire de la note et des attributs — **ne contient pas `form`**, donc pas d'historique de motivation aujourd'hui.
- Importance : `overall()`, `rosterRankOf`, `weightedRatingForPosition`, potentiel, valeur marchande. Pas de réputation ni de statut de star.

#### Passes décisives entre coéquipiers

Le moteur **connaît** le passeur : dans `MatchEngine` (l.~19606-19618), chaque panier assisté produit un événement `{ type: "shot", shooterId, assisterId, … }`, et `ptsAssisted`/`ptsSolo` sont comptés par tireur. Mais **aucun agrégat « A a servi B » n'est conservé** : ni dans `p.stats`, ni dans `matchLog`, et `recordMatchStatsForTeam` ne reçoit pas les événements. Une matrice des passes est donc faisable à coût faible (compteur `p.stats.astTo[shooterId]++` au même endroit que `assistCandidate.stats.ast++`), mais c'est une modification du moteur de match → phase 3.

#### Résultats, blessures, fil, interactions

- `Team.fanMorale` + `moraleHistory` (`recordMoraleEvent` l.~6897, max 40) : humeur des **supporters**, à ne pas confondre avec le vestiaire. Les demandes de transfert y sont aussi journalisées avec un delta 0 (détournement pratique mais conceptuellement mal rangé).
- Blessures : `injuryType`/`injuryUntil`, `Team.recordInjury` → `injuryLog`, `Player.injuryHistory`.
- Fil : `Team.feed`, `FEED_CATEGORIES = ["club","ligue","presse","marche","supporters"]` (l.~5844), `pushEntry` (l.~5865, déduplication par `key`), `FEED_MAX_ENTRIES = 40`. Masqué aux autres clubs (`PRIVATE_TEAM_FIELDS` dans `server/publicPlayers.js`, l.~45).
- Actions du coach existantes : interviews (tons), `discussTransferRequest`, discussions de retraite (`talkRetirement`), contrats, parrainages. L'entraîneur adjoint n'agit que sur l'entraînement. **Aucun** message joueur → manager, aucune promesse, aucune réunion, aucun éloge/recadrage.

#### Traitements périodiques et persistance

- Hebdomadaire humain : `Team.trainWeek` (l.~8858) — appelle `applyBenchFrustration` puis `updateTransferRequests` **avant** la remise à zéro des secondes de la semaine, puis `checkThresholds`.
- Hebdomadaire IA : `Team.trainWeekCPU` (l.~9443) via `League.trainCpuTeams` (l.~13513) — **saute** frustration et demandes de transfert.
- Par match : `recordMatchStatsForTeam` (l.~12614) puis `recordMatchStatsAndAwardMvp` (l.~12867).
- Intersaison : `League.startNextSeason` (l.~13983).
- Persistance : `serializeTeam` (l.~17022) / `teamFromSave` (l.~17488) ; `serializePlayerRecord` (l.~16715) / `playerFromSave` (l.~17315). **Miroir client** : `moteurbasket3.html` contient une copie partielle de `Player` (l.~15612), `Team` (l.~16664), `chemistryLabel`, `motivationLabel`, `rosterRankOf`, `applyBenchFrustration`, `playerRoleKey`… mais pas `updateChemistryAfterMatch` (serveur seul).
- **Précédent précieux** : `assets/achievements.js` est un module UMD partagé, `require` par `engine.js` (l.~11409) et chargé par le navigateur en `window.HM_ACHIEVEMENTS`. C'est exactement le patron à reprendre pour éviter de dupliquer la logique de vestiaire dans le miroir.

### 1.B — Ce qui manque

| Manque | Classe | Commentaire |
|---|---|---|
| Vue agrégée (hiérarchie, groupes, raisons de la motivation) | **Indispensable** | 95 % calculable à la volée |
| Historique de l'alchimie et de la motivation (pour « dynamique récente ») | **Indispensable** | Aujourd'hui aucune trace : `weeklyHistory` n'a pas `form`, l'alchimie n'a pas d'historique |
| Recalage des seuils d'alchimie (plancher 40) | **Indispensable** | Sinon « Tensions »/« Fracturé » n'apparaissent jamais |
| Levier de motivation à la hausse lié au temps de jeu | **Indispensable** | Sans lui, l'onglet ne montrera que des joueurs qui se dégradent |
| Relations par paires persistées | Utile (phase 2) | Le cœur « FM » ; seule vraie nouvelle structure |
| Événements de vestiaire et messages joueur → coach | Utile (phase 2) | Ce qui rend l'onglet jouable |
| Actions du coach : discussion individuelle, promesse de temps de jeu, réunion d'équipe, éloge/recadrage | Utile (phase 2) | Généraliser `discussTransferRequest` et les interviews |
| Attente de temps de jeu / statut attendu | Utile (phase 2) | Dérivée en phase 1, figée par promesse en phase 2 |
| Capitaine désigné | Optionnel (phase 3) | Le « capitaine implicite » existe déjà sur le terrain |
| Personnalité (ego, ambition, loyauté, professionnalisme) | Optionnel (phase 3) | Proxys mentaux suffisants avant |
| Comparaison salariale entre coéquipiers | Optionnel (phase 2-3) | Très basket (« pourquoi lui gagne plus ? ») |
| Matrice des passes A → B | Optionnel (phase 3) | Le moteur l'a, il suffit de compter |
| Minutes jouées ensemble par paire | Optionnel (phase 3) | Nécessite de suivre les cinq en jeu |
| Réputation / popularité / statut de star | Optionnel (phase 3) | Approximable par note, MVP, prestige |
| Visualisation de réseau | Utile (phase 1 simple, phase 2 relations) | Aucun code de graphe aujourd'hui ; SVG fait main |

---

## 2. Proposition UX/UI

### 2.1 Emplacement

Nouvel onglet **« Vestiaire »** (titre de page « Dynamique de groupe ») dans le groupe de barre latérale `equipe` (`data-sidebar-group="equipe"`, l.~8429), juste après « Effectif ». Route `/vestiaire` ajoutée à `DASH_ROUTE_TO_TAB` (l.~46501) et `TAB_HANDLERS` (l.~57765). L'alerte de fil `mood_chemistry`, aujourd'hui dirigée vers `/effectif`, pointe vers `/vestiaire`. La jauge d'alchimie de l'en-tête Effectif et du tableau de bord devient un lien vers l'onglet.

**Contraintes visuelles** : aucun emoji ; pictogrammes SVG en trait 1,8 sur `viewBox 24×24` (même convention que `assets/achievements.js`), drapeaux via `nationFlagHtml`. Couleurs d'état reprises des jauges existantes.

### 2.2 Structure en quatre sous-vues

Barre d'onglets internes : **Vue générale · Hiérarchie · Groupes · Relations**. Sur mobile, ce sont des segments horizontaux défilants.

#### Vue générale

Disposition en grille de cartes (une colonne sur mobile) :

1. **Bandeau d'état** : libellé d'état du vestiaire (« Groupe soudé », « Vestiaire sous tension »…) calculé à partir de l'alchimie **et** de la répartition des motivations (un vestiaire à 80 d'alchimie avec deux joueurs à 15 n'est pas « parfait »). Une phrase d'explication générée (« La série de 4 victoires a resserré le groupe, mais Diallo ne digère pas sa place sur le banc »).
2. **Quatre indicateurs** (pictogramme + valeur qualitative + tendance sur 4 semaines) :
   - **Cohésion** = `Team.chemistry` (la même jauge que partout ailleurs) ;
   - **Confiance** = dérivée de la série de résultats et de l'écart au `seasonObjective` (pas une nouvelle variable : une lecture) ;
   - **Ambiance** = moyenne pondérée par l'influence des `form` de l'effectif ;
   - **Satisfaction** = part des joueurs « contents » / « neutres » / « mécontents » (barre empilée).
3. **Dynamique récente** : mini-courbe de l'alchimie et de l'ambiance sur les 10-12 dernières semaines (réutiliser `humeurChartHtml`, l.~53734, déjà utilisé pour les supporters), avec les 5 derniers résultats en pastilles V/D.
4. **Problèmes à traiter** (triés par gravité, chacun avec un bouton d'action) : demande de transfert active, joueur « mérite d'être titulaire » sous 30 de motivation, promesse non tenue (phase 2), tension forte entre deux joueurs (phase 2), recrue isolée, groupe fracturé.
5. **Événements récents** : les 8 derniers événements de vestiaire (alchimie, motivation, demandes, interviews, transferts, parrainages, puis événements de phase 2), chacun avec date, pictogramme, joueurs concernés et impact qualitatif (« cohésion en baisse », pas « −2,4 »).

#### Hiérarchie du vestiaire

Pyramide en cinq étages (cartes de joueurs avec photo/avatar, poste, drapeau, badge de motivation, badges contextuels) :

| Étage | Règle de détection (phase 1, à la volée) |
|---|---|
| **Leaders** | Influence ≥ seuil haut ; typiquement leadership élevé + ancienneté + temps de jeu ou âge ≥ 29 |
| **Cadres** | Titulaires ou top 5 en minutes depuis plusieurs semaines, rang `rosterRankOf` ≤ 5 |
| **Joueurs importants** | Rotation régulière (part des minutes ≥ 12 %) |
| **Secondaires** | Rotation courte ou réserve |
| **Marges** (sous-catégories transverses, affichées en badges) | **Jeunes** (≤ 22 ans), **Nouveaux** (arrivés cette saison, `clubSinceSeason`), **Marginalisés** (part des minutes très inférieure à leur rang de note, ou `form` < 30), **Influents sans gros temps de jeu** (influence haute mais minutes faibles : le vétéran respecté en bout de banc, le cas le plus « FM ») |

Un panneau latéral au clic sur un joueur : sa ligne d'influence décomposée, ses raisons de motivation, ses relations (phase 2), ses actions possibles.

#### Groupes et clans

Liste de groupes détectés automatiquement, chacun présenté comme une carte : nom généré (« Les anciens », « La colonie serbe », « Les jeunes pousses », « Le cinq de départ », « Le banc »), membres, leader du groupe (membre le plus influent), humeur moyenne du groupe, attitude envers le coach (moyenne de `form` du groupe), et une phrase d'état (« Groupe solide, plutôt satisfait »). Un indicateur de **fracture** si deux groupes de taille comparable ont des humeurs moyennes très écartées.

#### Relations individuelles

- **Bureau** : graphe en SVG. Disposition **circulaire groupée par clan** (pas de simulation de forces : déterministe, légère, stable d'une visite à l'autre). Les joueurs d'un même groupe sont contigus sur le cercle, le leader au plus près du centre de son arc. Arêtes : épaisseur = intensité, couleur = signe (affinité / tension), trait plein = relation persistée (phase 2), pointillé = affinité structurelle calculée (phase 1), double trait = parrainage. Survol d'un nœud : on estompe tout ce qui ne le concerne pas.
- **Mobile** : pas de graphe. Une liste par joueur : « Apprécie : X, Y · En froid avec : Z · Influencé par : W », avec un sélecteur de joueur.
- **Fiche d'une paire** (au clic sur une arête) : type (apprécie, s'entend mal, influence, respect, proximité, tension), valeur qualitative, **raisons** (« Même nationalité », « Parrainage depuis 8 semaines », « Concurrents au poste d'ailier », « Altercation semaine 12 »), et **évolution** (mini-sparkline, phase 2).

### 2.3 Intégrations ailleurs

- Fiche joueur (`renderPlayerDetail`, l.~33510) : bloc « Vestiaire » (statut, influence, 3 relations principales, raisons de motivation).
- Effectif : colonne optionnelle « Statut » (Leader / Cadre / …).
- Tableau de bord : le « pouls » (`dashRenderPulse`) ajoute une ligne « Vestiaire » quand un problème est ouvert.

---

## 3. Modèle logique : Événement → individu → relations → groupe

### 3.1 Le pipeline

```
Événement (match, compo, transfert, contrat, action du coach, temps)
   │
   ├─▶ Impact individuel   : Player.form (via les écritures existantes ou un nouveau terme hebdo)
   │                         + raison journalisée (pour l'explication)
   ├─▶ Impact relationnel  : Team.relations (phase 2) via applyRelationDelta(a, b, delta, reason)
   │
   └─▶ Impact de groupe    : Team.chemistry via applyChemistryDelta (seul point d'écriture)
                             + contagion : la moyenne de form pondérée par l'influence
                               produit un petit delta d'alchimie hebdomadaire (phase 2-3)
                     │
                     ▼
            Événements futurs (seuils franchis → message, demande, conflit, opportunité)
```

Deux règles d'implémentation :

- **Les écritures restent là où elles sont.** `applyBenchFrustration` continue d'écrire `form`, `applyChemistryResult` continue d'écrire `chemistry`. Le module de vestiaire **lit** et, en phase 2, ajoute des effets via des points d'écriture uniques (`applyRelationDelta`, `applyChemistryDelta`, et un nouvel `applyFormDelta(p, delta, reason)` qui ne fait que factoriser le `clamp` existant et poser une raison).
- **Les effets de groupe sont bornés et lents.** L'alchimie est déjà bornée (40-100, ±6 % de performance) : la contagion ne doit jamais dépasser ±1 par semaine pour ne pas écraser les leviers actuels (résultats, transferts).

### 3.2 Chaînes de conséquences concrètes

**Chaîne 1 — Un jeune prend la place d'un titulaire historique.**
1. *Événement* : le manager met Kevin (20 ans) titulaire au poste d'ailier à la place de Marc (31 ans, au club depuis 5 saisons, leadership 78).
2. *Individuel* : Marc passe `starter` → `rotation`. En phase 1, `applyBenchFrustration` ne le touche pas tant qu'il joue plus de 7,5 min — c'est voulu. En phase 2, on compare **minutes attendues** (dérivées de son statut des 6 dernières semaines : cadre) et **minutes reçues** : écart fort → −2/semaine de `form`, raison « Perte de sa place de titulaire ».
3. *Relationnel* : relation Marc ↔ Kevin −4 (« Concurrence au poste »), sauf si Marc est **parrain** de Kevin, auquel cas la relation reste positive et la perte de motivation est divisée par deux (« Il accepte de passer le témoin »).
4. *Groupe* : si Marc est leader et que le groupe « Les anciens » a une humeur moyenne qui chute sous 45 pendant 2 semaines, delta d'alchimie −1/semaine (contagion).
5. *Coach* : message de Marc « Je veux comprendre mon nouveau rôle » → discussion (tons : rassurer / être franc / promettre). Promettre « 20 minutes par match » crée une promesse suivie.
6. *Futur* : promesse tenue 4 semaines → +5 `form`, relation Marc ↔ coach (implicite via `form`) ; promesse rompue → −10, et le groupe des anciens perd confiance (−1 alchimie). Si Kevin brille (gros match via `BIG_GAME_THRESHOLDS`), le respect Marc → Kevin peut monter (« Le petit le mérite »).

**Chaîne 2 — Série de défaites.**
1. *Événement* : 4 défaites d'affilée, dont une de plus de 20 points.
2. *Groupe* : déjà géré (`applyChemistryResult` : −1, −1, −2, −3).
3. *Individuel* (nouveau, phase 2) : les joueurs à faible `composure`/`determination` perdent −1 de `form` par défaite au-delà de la 3e ; les leaders n'en perdent pas.
4. *Relationnel* : apparition d'une tension « tireur égoïste » si un joueur a une part de tirs très au-dessus de sa part de minutes pendant la série (lu depuis `matchLog`).
5. *Événement futur* : « Réunion de crise réclamée par le capitaine » → réunion d'équipe (action du coach, tons collectifs, même mécanique que `resolveInterview`).

**Chaîne 3 — Recrutement d'une star au même poste qu'un cadre.**
1. *Événement* : `signFreeAgentFromListing` ou `transferPlayerBetweenTeams` → malus d'arrivée existant.
2. *Individuel* : l'ancien titulaire voit son rang `rosterRankOf` reculer ; si sa note est proche de la recrue, raison « Menacé par une recrue ».
3. *Relationnel* : la recrue démarre avec des relations neutres sauf affinités structurelles (même nationalité → proximité initiale).
4. *Groupe* : étiquette « Nouveau » pendant 8 semaines ; si aucune relation positive au-delà de 8 semaines → problème « Recrue isolée », −3 de `form` étalés, et suggestion « Organiser un parrainage » (si âge compatible) ou « Le titulariser pour l'intégrer ».

**Chaîne 4 — Un joueur mécontent contamine.**
1. *Individuel* : un cadre reste sous 25 de motivation 3 semaines (demande de transfert existante).
2. *Relationnel* : ses proches (relation ≥ +40) perdent −1 de `form` par semaine (contagion amortie par leur propre `discipline`).
3. *Groupe* : si l'influence du joueur est haute, −1 d'alchimie par semaine tant que la demande est active.
4. *Coach* : `discussTransferRequest` existant, ou le vendre (malus de départ existant **mais** remonte l'ambiance de ses opposants).

**Chaîne 5 — Grosse victoire (derby, finale, victoire contre plus fort).**
1. *Groupe* : `applyChemistryResult` (déjà) + bonus exceptionnel de phase 2 si l'adversaire était un rival (`Team.rivalries`) ou en play-offs.
2. *Relationnel* : +2 sur toutes les paires de joueurs ayant joué ≥ 20 minutes ensemble ce match (approximation phase 2 : tous les joueurs à ≥ 20 min).
3. *Individuel* : le MVP du match gagne de l'influence (dérivée, via MVP récents) ; les remplaçants n'ayant pas joué sont **exclus** du bonus — un vrai contraste de vestiaire.

---

## 4. Existe / Adapter / Créer — mécanique par mécanique

| Mécanique | Statut | Détail |
|---|---|---|
| Cohésion du groupe | **Existe déjà → réutiliser** | `Team.chemistry`, `applyChemistryDelta`. Ajouter seulement un historique |
| Seuils et libellés de cohésion | **Existe partiellement → adapter** | Recaler pour le plancher 40 (`chemistryLabel`, `feedMoodEntry`) — mirroir client inclus |
| Satisfaction individuelle | **Existe déjà → réutiliser** | `Player.form` |
| Raisons de la satisfaction | **N'existe pas → créer (pur, calculé)** | `satisfactionReasons(player, team)` : temps de jeu vs rang, rôle, contrat (refus récents, demande d'augmentation), demande de transfert, nouveau, isolement, relation, promesse |
| Regain de motivation avec le temps de jeu | **Existe partiellement → adapter** | Étendre `applyBenchFrustration` en `applyPlayingTimeMorale` : même passage hebdo, terme positif si minutes ≥ attente |
| Effet des résultats sur la motivation | **N'existe pas → créer** | Petit terme dans le même passage hebdo, modulé par `composure`/`determination` |
| Hiérarchie | **N'existe pas → créer (pur, calculé)** | À partir de `playerRoleKey`, part des minutes (`matchLog`), `rosterRankOf`, âge, ancienneté, leadership |
| Influence | **N'existe pas → créer (pur, calculé)** | Score 0-100 dérivé, non persisté |
| Groupes / clans | **N'existe pas → créer (pur, calculé)** | Graphe d'affinités structurelles + composantes connexes |
| Relations par paires | **N'existe pas → créer (persisté, creux)** | `Team.relations` ; les parrainages y sont lus, pas copiés |
| Parrainage | **Existe déjà → réutiliser** | Devient une arête forte du graphe et un modérateur de conflit |
| Capitaine | **Existe partiellement → adapter** | Implicite sur le terrain (`captainLeadership`) ; en phase 3, un `Team.captainId` optionnel qui, s'il est sur le terrain, remplace le max |
| Événements de vestiaire | **Existe partiellement → adapter** | Fil (`pushEntry`) avec une nouvelle catégorie `vestiaire` + un journal court `Team.lockerLog` |
| Messages joueur → coach | **Existe partiellement → adapter** | Généraliser le mécanisme de `pendingInterviews` en `pendingTalks` |
| Discussion individuelle | **Existe partiellement → adapter** | Généraliser `discussTransferRequest` (chance dépendant du mental) à plusieurs sujets |
| Réunion d'équipe | **Existe partiellement → adapter** | Reprendre `resolveInterview` (tons → delta `form` collectif + delta alchimie) |
| Promesses | **N'existe pas → créer (persisté)** | `Player.promise` unique : `{ type, target, untilWeek, madeWeek }` |
| Personnalités | **N'existe pas → créer (phase 3)** | En phase 1-2, proxys `leadership`, `discipline`, `determination`, `composure`, `aggressiveness` |
| Comparaison salariale | **N'existe pas → créer (pur)** | Lecture de `salary` vs rang ; raison de mécontentement |
| Part d'utilisation (tirs) | **Existe partiellement → adapter (lecture)** | `fga2 + fga3 + 0,44 × fta` depuis `matchLog` |
| Passes entre joueurs | **Existe partiellement → adapter (phase 3)** | `assisterId` dans les événements, pas agrégé |
| Historique de motivation | **N'existe pas → créer (persisté, petit)** | Ajouter `form` aux instantanés hebdo (voir § 5) |
| Visualisation réseau | **N'existe pas → créer** | SVG circulaire groupé, aucune bibliothèque |

Garde-fou anti-doublon : il n'existera **aucune** fonction qui calcule une « satisfaction » numérique concurrente de `form`. `satisfactionReasons` renvoie une liste explicative (avec des poids indicatifs pour trier), et la seule valeur affichée reste `form`. De même, l'« ambiance » de la vue générale est une **agrégation** de `form`, pas un état.

---

## 5. Architecture technique

### 5.1 Un module pur partagé : `assets/vestiaire.js`

Même patron qu'`assets/achievements.js` : fichier UMD, `require("./assets/vestiaire.js")` dans `engine.js`, `<script src="assets/vestiaire.js" defer>` dans `moteurbasket3.html` exposant `window.HM_VESTIAIRE`. Avantages :

- **zéro duplication** dans le miroir client (le problème récurrent de ce projet) ;
- testable en Node sans DOM ;
- aucune dépendance circulaire : le module ne connaît **ni** `Team` **ni** `Player` en tant que classes, il reçoit des objets simples et des fonctions injectées (`overall`, `weightedRatingForPosition`, `roleKey`) via un contexte.

API proposée (toutes pures, sans écriture) :

```js
// ctx = { season, week, now, roleKey(id), overall(p), positionRating(p, pos), clubName }
buildLockerRoomView(team, ctx)       // → { summary, hierarchy, groups, edges, issues, events }
playerStanding(player, team, ctx)    // → { tier, badges[], influence, minutesShare, usageShare, tenure }
playerInfluence(player, team, ctx)   // → 0..100 + décomposition
satisfactionReasons(player, team, ctx) // → [{ key, label, sign, weight }]
expectedMinutesShare(player, team, ctx) // → attente dérivée (phase 1) ou promesse (phase 2)
structuralAffinity(a, b, team, ctx)  // → { score: -1..1, reasons[] }
detectGroups(players, edges, opts)   // → [{ id, members, leaderId, name, traits }]
relationLabel(value)                 // → "apprécie" | "proche" | "neutre" | "en froid" | "en conflit"
lockerStateLabel(chemistry, forms)   // → libellé d'état du vestiaire
```

Les **mutations** restent dans `Team` (engine.js + miroir quand le client en a besoin), toutes avec un point d'écriture unique, à l'image de `applyChemistryDelta` :

```js
Team.applyRelationDelta(aId, bId, delta, reason, now)   // phase 2
Team.applyFormDelta(playerId, delta, reason)            // factorise les clamp existants
Team.recordLockerEvent(ev)                              // journal + éventuelle entrée de fil
Team.updateLockerRoomWeekly(now)                        // orchestrateur hebdo, appelé par trainWeek
Team.updateLockerRoomAfterMatch(won, margin, meta)      // appelé par recordMatchStatsAndAwardMvp
```

`updateLockerRoomWeekly` appelle le module pur pour **décider** (qui est en attente de minutes, quelles paires changent, quel événement déclencher) puis applique via les points d'écriture. Le module n'écrit jamais.

### 5.2 Persisté vs calculé

| Donnée | Persistée ? | Où | Taille | Phase |
|---|---|---|---|---|
| Hiérarchie, influence, groupes, affinités structurelles, raisons | **Non** — calculées à l'affichage | — | 0 | 1 |
| Historique hebdo vestiaire | Oui | `Team.lockerHistory = [[season, week, chemistry, avgForm]]`, 26 entrées max | < 1 Ko | 1 |
| Motivation hebdo par joueur | Oui | Ajouter `form` en fin du tuple `weeklyHistory` (rétrocompatible : lecture par index, absent = inconnu) — ou, plus simple, `lockerHistory` stocke `{id: form}` | < 2 Ko | 1 |
| Journal de vestiaire | Oui | `Team.lockerLog`, 40 entrées max (même borne que `moraleHistory`) | ~4 Ko | 1 (alimenté par les événements existants) |
| Relations par paires | Oui | `Team.relations = { "idA|idB": { v, since, last, why } }`, clé triée, **seulement si `|v| ≥ 10`** ou parrainage, ~20-30 paires max | ~3 Ko | 2 |
| Promesses | Oui | `Player.promise` (une seule à la fois) | négligeable | 2 |
| Discussions en attente | Oui | `Team.pendingTalks` (même forme que `pendingInterviews`) | négligeable | 2 |
| Personnalité | Oui | `Player.traits = { ego, ambition, loyalty, professionalism }` générés une fois | ~50 o/joueur | 3 |
| Capitaine | Oui | `Team.captainId` | négligeable | 3 |
| Passes A → B | Oui (agrégat saison) | `Player.assistsTo = { id: n }` réinitialisé à l'intersaison | petit | 3 |

**Compatibilité des sauvegardes** : chaque nouveau champ suit la convention existante — valeur par défaut dans le constructeur, sérialisation conditionnelle dans `serializeTeam`/`serializePlayerRecord`, défaut tolérant dans `teamFromSave`/`playerFromSave` (`Array.isArray(...) ? ... : []`). `Team.relations` est **purgé** des identifiants absents de l'effectif à chaque chargement et à chaque départ (dans `transferPlayerBetweenTeams` et `Team.sellPlayer`, à côté des malus d'alchimie), comme `sanitizeMentorships` le fait déjà pour les parrainages.

**Confidentialité** : ajouter `lockerHistory`, `lockerLog`, `relations`, `pendingTalks` à `PRIVATE_TEAM_FIELDS` et `promise`, `traits` à `HIDDEN_PLAYER_FIELDS` dans `server/publicPlayers.js`. Mettre à jour la liste attendue dans `server/world_country_test.js` (l.~192) qui vérifie les champs cachés.

### 5.3 Systèmes existants à modifier

| Fichier / fonction | Modification | Phase |
|---|---|---|
| `engine.js` `chemistryLabel`, `feedMoodEntry` (seuils), et miroirs `moteurbasket3.html` | Recalage plancher 40 | 1 |
| `engine.js` `Team.trainWeek` | Appeler `updateLockerRoomWeekly(now)` **après** `applyBenchFrustration`/`updateTransferRequests` et **avant** la remise à zéro des secondes ; pousser `lockerHistory` | 1 |
| `engine.js` `Team.applyBenchFrustration` | Phase 2 : devenir `applyPlayingTimeMorale` (garde l'ancien nom en alias pour les tests) avec terme positif et attente/promesse | 2 |
| `engine.js` `recordMatchStatsAndAwardMvp` | Appeler `updateLockerRoomAfterMatch` après `applyChemistryResult` (hors amicaux) | 2 |
| `engine.js` `transferPlayerBetweenTeams`, `Team.sellPlayer`, `signFreeAgentFromListing` | Purge des relations ; `recordLockerEvent` (« Départ d'un cadre », « Arrivée de X ») | 1 (événements) / 2 (purge) |
| `engine.js` `updateTransferRequests`, `discussTransferRequest`, `resolveInterview`, `respondToRaiseRequest`, `offerContractExtension` | `recordLockerEvent` en plus de ce qu'ils font (sans changer leurs effets) | 1 |
| `engine.js` `FEED_CATEGORIES` (+ miroir + filtres du fil client) | Ajouter `vestiaire` | 1 |
| `engine.js` `serializeTeam`/`teamFromSave`/`serializePlayerRecord`/`playerFromSave` (+ miroir) | Nouveaux champs | 1-3 |
| `server/actions.js` | Actions `lockerTalk`, `lockerMeeting`, `lockerPromise`, `lockerSetCaptain` sur le modèle de `discussTransferRequest` (l.~1200) | 2-3 |
| `server/publicPlayers.js` | Champs privés | 1-2 |
| `MatchEngine` (l.~19606) | Compteur `stats.astTo[shooterId]` | 3 |
| `moteurbasket3.html` | Onglet, route, rendu, intégration fiche joueur | 1-3 |

### 5.4 Clubs IA

- **Vue** : jamais calculée pour un autre club (l'onglet est privé, et les données sous-jacentes comme `form` sont masquées).
- **Simulation** : `trainWeekCPU` ne traite pas la frustration ; on garde ce choix. Les clubs IA n'ont **pas** de `relations` ni de `pendingTalks` (champs vides, zéro coût). Seule exception utile en phase 3 : quand un joueur IA est recruté par un humain, ses relations démarrent à zéro — ce qui est de toute façon le cas pour tout transfert.
- Les clubs humains d'une même ligue partagent le serveur : le coût est O(n²) sur 12-15 joueurs ≈ 100 paires par club et par semaine, négligeable.

### 5.5 Dépendances et maintenabilité

```
assets/vestiaire.js (pur, aucune dépendance)
        ▲                     ▲
        │ require             │ window.HM_VESTIAIRE
   engine.js (Team : orchestrateurs + points d'écriture)
        ▲                     ▲
   server/actions.js     moteurbasket3.html (rendu uniquement)
```

- Le module pur ne `require` rien. `engine.js` lui injecte les fonctions dont il a besoin via `ctx` — c'est ce qui évite la circularité.
- Toutes les constantes de réglage (seuils de hiérarchie, poids d'affinité, deltas de relation) vivent dans le module et sont exportées, comme `MENTORSHIP_*` ou `CHEMISTRY_*`, pour être assertées par les tests.
- Le client **ne réimplémente pas** les orchestrateurs hebdomadaires (le serveur fait foi, comme `updateChemistryAfterMatch` aujourd'hui) ; il n'a besoin que des fonctions pures pour l'affichage.

---

## 6. MVP en trois phases

### Phase 1 — Indispensable : « rendre visible ce qui existe » (complexité : faible à moyenne, ~6-9 jours)

- Recalage des seuils d'alchimie (plancher 40).
- Module `assets/vestiaire.js` : `playerStanding`, `playerInfluence`, `satisfactionReasons`, `structuralAffinity`, `detectGroups`, `lockerStateLabel`.
- Persistance minimale : `lockerHistory` (alchimie + motivation hebdo), `lockerLog` alimenté par les événements **déjà existants** (résultats en série, transferts, demandes de transfert, discussions, interviews, refus de contrat, parrainages, blessures longues d'un cadre).
- Catégorie de fil `vestiaire`.
- Onglet avec Vue générale, Hiérarchie, Groupes, Relations (arêtes structurelles en pointillé + parrainages), liste mobile.
- Bloc « Vestiaire » dans la fiche joueur.

Valeur pour le joueur : il **comprend** pourquoi un joueur est démotivé et qui pèse dans le groupe. Aucun nouvel équilibrage du jeu, donc risque faible.

### Phase 2 — Rend l'onglet intéressant (complexité : moyenne à élevée, ~12-18 jours)

- `Team.relations` + `applyRelationDelta` + règles de relation (concurrence au poste, parrainage, victoire ensemble, temps passé, même groupe, conflit après défaite, dérive lente vers 0).
- Levier de motivation à la hausse (`applyPlayingTimeMorale`) et attente de minutes dérivée.
- Événements de vestiaire générés (catalogue de ~12 événements, voir § 7) avec cooldowns.
- Actions du coach : discussion individuelle (tons), réunion d'équipe (tons), promesse de temps de jeu, éloge/recadrage public après un match.
- Contagion **simple** : la moyenne de `form` pondérée par l'influence produit un delta d'alchimie hebdo borné à ±1.
- Sparklines d'évolution des relations.

### Phase 3 — Profondeur « à la FM » (complexité : élevée, ~15-25 jours)

- Personnalités (`Player.traits`), générées à la création, révélées progressivement (scouting / temps au club).
- Capitaine désigné (`Team.captainId`), lien avec `captainLeadership` sur le terrain.
- Contagion par le réseau (propagation sur les arêtes), clans qui se forment / se fracturent dans le temps, événement « le vestiaire se divise ».
- Matrice des passes et duo meneur ↔ intérieur ; minutes jouées ensemble.
- Comparaison salariale, ego de star, exigences de responsabilités (« je veux plus de tirs »).
- Influence persistée et réputation (statut de star, popularité).

---

## 7. Game design : des situations, pas des chiffres

Chaque situation ci-dessous suit le même gabarit : **déclencheur** (lisible dans les données), **message** (ce que le manager voit), **choix** (ce qu'il peut faire), **conséquences** (ce qui suit). Toutes ont un *cooldown* par joueur (pas plus d'un événement de vestiaire par joueur toutes les 3 semaines) et un plafond global (2 par semaine) pour éviter le spam — même philosophie que la déduplication par `key` de `pushEntry`.

| Situation | Déclencheur | Choix proposés | Conséquences |
|---|---|---|---|
| **Un leader conteste une décision** | Un joueur d'influence ≥ 70 voit un coéquipier de son groupe perdre sa place, ou une recrue arriver à son poste | Expliquer (chance selon `discipline` du leader), Maintenir (autorité), Revenir sur la décision | Expliquer réussi : relation neutre ; maintenir : −`form` du leader, −1 alchimie si son groupe est grand ; céder : +`form`, mais le jeune concerné perd en motivation |
| **Un jeune devient influent** | Jeune ≤ 22 ans, part de minutes ≥ 20 % depuis 6 semaines, au moins un gros match ou un MVP | Le féliciter publiquement, Le recadrer pour qu'il reste humble | Monte d'un étage de hiérarchie ; tension possible avec un vétéran au même poste (sauf parrainage) |
| **Deux joueurs se rapprochent** | Relation ≥ +50 (phase 2) ou même nationalité + même groupe d'âge + titulaires ensemble 8 semaines | Aucun (information), éventuellement les associer en entraînement | Arête forte ; si l'un part, l'autre perd −8 de `form` (« a perdu son ami ») |
| **Un groupe se fracture** | Deux groupes ≥ 3 joueurs avec un écart d'humeur moyenne ≥ 30 pendant 3 semaines | Réunion d'équipe (tons : fédérateur / autoritaire / sanctionner le meneur de la fronde) | Réunion réussie : écart réduit, +2 alchimie ; ratée : −2 alchimie et un leader du groupe mécontent demande à partir |
| **Un joueur se sent mis à l'écart** | Écart minutes reçues / attendues pendant 3 semaines (l'actuel `applyBenchFrustration` détecte déjà le cas extrême) | Discuter, Promettre des minutes, Le mettre sur la liste des transferts | Promesse : suivie ; vente : malus d'alchimie existant mais fin du problème |
| **Un vétéran aide un jeune** | Parrainage actif depuis 6 semaines, ou vétéran et jeune au même poste avec relation positive | Officialiser le parrainage (s'il n'existe pas encore) | Le parrainage existant devient visible et valorisé ; +influence du vétéran même s'il joue peu (« influent sans temps de jeu ») |
| **Une série de défaites fragilise le vestiaire** | `chemistryResultStreak ≤ −3` | Réunion de crise, Interview pour protéger le groupe, Rien | Tons : protéger → les joueurs à faible `composure` récupèrent ; accuser → +`form` des leaders, −`form` des fragiles |
| **Une grande victoire soude l'équipe** | Victoire en play-offs, derby, ou contre un club mieux classé de plus de 6 places | Aucun (récompense) | +2 sur les paires ayant joué ≥ 20 min ; les joueurs non utilisés **n'en profitent pas** |
| **Une recrue peine à s'intégrer** | Arrivée depuis 8 semaines, aucune relation ≥ +20, aucun compatriote | Parrainage, Titularisation, Discussion | Faute de réponse : −3 de `form` étalés, risque de demande de transfert |
| **Un mécontent influence les autres** | Joueur d'influence haute avec `form ≤ 25` et demande de transfert active | Discuter (existant), Vendre (existant), L'isoler (sortir du groupe : convocation retirée) | Ses proches perdent −1/semaine ; l'isoler coupe la contagion mais −2 alchimie immédiat |
| **Le meneur réclame plus de responsabilités** | Meneur avec `vision`/`decision` élevées et part de tirs + passes dans le bas de l'effectif | Changer de tactique, Promettre un rôle de « premier créateur » | Lien vers l'onglet Tactiques ; promesse suivie sur la part d'utilisation |
| **Tension salariale** | Un titulaire mieux noté gagne moins qu'un remplaçant (phase 2-3) | Anticiper une prolongation, Ignorer | `raiseRequest` existant déclenché plus tôt ; refus = tension avec le mieux payé |

**Gameplay résultant.** Le manager a désormais des **arbitrages** : titulariser le jeune talent ou ménager le cadre ; recruter la star ou protéger l'équilibre ; vendre le mécontent influent (malus d'alchimie immédiat) ou le garder (contagion lente). L'onglet doit toujours proposer **une action** à côté de chaque problème.

---

## 8. Comparaison avec Football Manager

### 8.1 Principes de FM intéressants

- **Hiérarchie visible** (leaders d'équipe, joueurs très influents, influents, autres) : très pertinent, et plus facile au basket car un effectif fait 12-15 joueurs au lieu de 25-30.
- **Groupes sociaux** nommés par leurs traits : pertinent, à condition qu'ils soient explicables.
- **Promesses** (temps de jeu, recrutements, contrat) avec suivi et sanction : très pertinent.
- **Discussions avec tons** et réactions du groupe : déjà amorcé par les interviews.
- **Statut dans l'effectif** (indispensable, titulaire, rotation, remplaçant, espoir) attendu vs reçu : c'est le moteur n°1 de l'insatisfaction dans FM, et le plus naturel ici.
- **Personnalités** (professionnel, ambitieux, loyal, tempérament) : intéressant mais coûteux.

### 8.2 Trop complexe ou peu pertinent ici

- Les **dizaines** d'attributs cachés de personnalité : 4 traits suffisent.
- Les interactions avec la presse joueur par joueur : les interviews de jalon suffisent.
- Les **réunions d'équipe à chaque match** (avant-match, mi-temps) : redondant avec la tactique et lourd pour un jeu à rythme hebdomadaire.
- La dynamique au niveau de **tout le club** (staff, direction) : hors périmètre.

### 8.3 Adaptable tel quel

Statut attendu/reçu (via `playerRoleKey` + part de minutes), promesses (une par joueur), groupes nommés, leaders, discussions à tons, effet de contagion du mécontentement.

### 8.4 Spécifiquement basket — aller plus loin que FM

| Mécanique | Pourquoi c'est basket | Données disponibles |
|---|---|---|
| **Hiérarchie des minutes** | Le basket se lit en minutes (36 / 28 / 18 / 8 / 0), pas en titularisation binaire | `matchLog[].min`, `plannedMinutesByPlayer`, `lineup.minutes` |
| **Rôle dans la rotation** | 6e homme, rotation courte, fin de banc : des statuts reconnus | `playerRoleKey`, `backupPositions` |
| **Partage du ballon** (*usage*) | « Qui prend les tirs » est la source n°1 de tension en NBA/EuroLeague | `fga2`, `fga3`, `fta`, `tov`, `ast` dans `matchLog` : `usage ≈ (fga2 + fga3 + 0,44·fta + tov) / minutes`, comparé à la moyenne de l'équipe |
| **Tireur égoïste / joueur sacrifié** | Part de tirs vs efficacité | `ptsSolo` vs `ptsAssisted`, `fgm/fga` |
| **Statut de star** | Une star exige le ballon en fin de match et un salaire cohérent | `rosterRankOf` = 1, MVP récents, `salary` |
| **Bataille pour le cinq par poste** | Cinq postes, concurrence lisible deux à deux | `lineup.starters[pos]`, `weightedRatingForPosition` (déjà utilisé par `applyBenchFrustration` pour « mérite d'être titulaire ») |
| **Espoirs** | Jeunes à fort potentiel qui veulent jouer | `potential`, âge, académie (`homegrownClub`) |
| **Joueurs étrangers** | Quotas et isolement linguistique, très présent en Europe | `nationality` ; groupe de compatriotes, recrue étrangère isolée |
| **Leadership sur le terrain** | Le meneur « parle », le capitaine calme le jeu | `captainLeadership`/`leadershipRelief` existent déjà ; brancher `Team.captainId` en phase 3 |
| **Duo meneur ↔ intérieur** | Le pick-and-roll crée une relation de jeu concrète | **N'existe pas comme agrégat** : le moteur produit `assisterId` par panier mais ne le compte pas. Phase 3 : `stats.astTo[shooterId]` puis `Player.assistsTo` ; une paire avec beaucoup de passes réussies gagne en proximité, et le meneur qui « ignore » un intérieur crée une tension |
| **Complémentarité** | Un créateur et un finisseur s'apprécient | Profils dérivés : `vision` + `ast` vs `ptsAssisted` élevé |
| **Tensions contractuelles** | Les fins de contrat pèsent dans la saison | `contractUntilSeason`, `raiseRequest`, `contractRefusals` |
| **Vouloir plus de responsabilités** | Un joueur en progression réclame plus de tirs | Progression récente (`weeklyHistory` : note en hausse) + usage stagnant |

---

## 9. Algorithmes clés (phase 1)

### 9.1 Influence (0-100, calculée)

```
influence = 30 · norm(leadership)
          + 20 · partDesMinutes (6 dernières semaines, matchLog)
          + 15 · ancienneté (saisons au club, plafonnée à 5) / 5
          + 10 · âge ≥ 29 ? 1 : (âge − 20)/9 borné
          + 10 · (1 − (rosterRankOf − 1)/(n − 1))
          +  5 · formé au club
          +  5 · parrain actif
          +  5 · MVP/gros matchs récents (historyLog, 8 semaines)
```

Les poids sont exportés comme constantes, la décomposition est renvoyée pour l'affichage (« Influent grâce à : leadership, ancienneté »). Le cas « influent sans gros temps de jeu » est simplement `influence ≥ 55 && partDesMinutes < 10 %`.

### 9.2 Satisfaction expliquée

`satisfactionReasons(p)` empile des raisons, chacune avec un signe et un poids, **sans** produire de nouveau score :

- *Temps de jeu* : part des minutes reçue vs attendue (attente = celle de son étage de hiérarchie, ou la promesse en phase 2) ; signal « mérite d'être titulaire » repris de `applyBenchFrustration` (`weightedRatingForPosition` comparé au titulaire).
- *Contrat* : refus récents (`contractRefusals`), `raiseRequest` en cours, fin de contrat proche.
- *Situation* : demande de transfert active, retraite annoncée, nouveau au club, blessé longue durée.
- *Résultats* : série en cours (`chemistryResultStreak`).
- *Social* (phase 2) : meilleure relation, pire relation, isolement.

La liste est triée par poids et limitée à 3 raisons dans les cartes, toutes dans le panneau détaillé. C'est ce qui transforme le badge « Démotivé » en « Démotivé : joue 4 min alors qu'il est meilleur que le titulaire ; demande d'augmentation refusée ».

### 9.3 Affinité structurelle et groupes

```
affinité(a, b) =  0,35 · même nationalité
               +  0,25 · même tranche d'âge (≤ 22, 23-28, ≥ 29)
               +  0,20 · recouvrement d'ancienneté (arrivés la même saison ou ≥ 2 saisons ensemble)
               +  0,20 · formés au club tous les deux
               +  0,30 · parrainage entre eux
               +  0,15 · titulaires ensemble ≥ 60 % des 8 derniers matchs (matchLog.starter)
               −  0,25 · concurrents directs au même poste (même position, écart de note < 5)
               + (phase 2) 0,5 · relation persistée normalisée
```

Détection : on garde les arêtes d'affinité ≥ 0,4, puis **composantes connexes** (ou propagation d'étiquettes en 5 itérations si les composantes sont trop grosses — au-delà de 6 membres, on relève le seuil de 0,05 jusqu'à scinder). Les joueurs seuls ne forment pas de groupe ; un groupe compte 2 à 6 joueurs.

**Nommage automatique** : on calcule pour chaque groupe le trait le plus partagé (≥ 60 % des membres) et on choisit dans une table :

| Trait dominant | Nom |
|---|---|
| Nationalité (étrangère au club) | « La colonie {adjectif} » / « Le clan {pays} » avec drapeau |
| Âge ≥ 29 + ancienneté | « Les anciens » |
| Âge ≤ 22 | « Les jeunes pousses » |
| Formés au club | « Les enfants du club » |
| Titulaires ensemble | « Le cinq majeur » |
| Rotation/réserve | « Le banc » |
| Arrivés cette saison | « Les nouveaux » |
| Aucun trait ≥ 60 % | « Le groupe de {leader} » |

### 9.4 Rendu du graphe

Cercle de rayon R ; chaque groupe occupe un arc proportionnel à sa taille, séparé par un petit vide ; les isolés occupent le dernier arc. Arêtes en courbes de Bézier quadratiques passant par le centre réduit (`0,4·R`) pour la lisibilité. Moins de 15 nœuds et 40 arêtes : aucun besoin de bibliothèque ni de simulation de forces. Le rendu suit `radarChartSvg` (l.~33153) : SVG généré en chaîne, couleurs via variables CSS du thème.

---

## 10. Feuille de route concrète

### Étape 1 — Fondations et corrections (phase 1)

- **Fichiers** : `engine.js`, `moteurbasket3.html` (miroirs `chemistryLabel`, `FEED_CATEGORIES`, filtres du fil), `server/publicPlayers.js`.
- **Systèmes** : recaler les seuils de `chemistryLabel` et de `feedMoodEntry` (clé `chemistry`) sur la plage 40-100 ; ajouter la catégorie de fil `vestiaire` ; créer `Team.lockerHistory` et `Team.lockerLog` + `Team.recordLockerEvent` ; pousser l'instantané hebdo dans `Team.trainWeek`.
- **Données** : deux tableaux bornés, sérialisés et relus avec défauts.
- **Logique** : brancher `recordLockerEvent` dans `updateTransferRequests`, `discussTransferRequest`, `resolveInterview`, `respondToRaiseRequest`, `offerContractExtension`, `transferPlayerBetweenTeams`, `Team.sellPlayer`, `signFreeAgentFromListing`, et sur les séries de résultats (`applyChemistryResult` renvoie déjà le delta).
- **UI** : rien de visible hors catégorie de fil.
- **Risques** : le recalage des seuils change des libellés que les joueurs connaissent ; les tests qui assertent « Cohésion correcte » à une valeur donnée devront suivre. Le miroir client doit rester identique.
- **Tests** : étendre `team_chemistry_test.js` (nouveaux seuils, alerte basse atteignable au-dessus du plancher), `dashboard_feed_test.js` (catégorie `vestiaire`), `persistence_test.js` (aller-retour `lockerHistory`/`lockerLog`, sauvegarde ancienne sans ces champs) ; nouveau `locker_log_test.js` (chaque déclencheur existant produit exactement un événement, plafond de 40).

### Étape 2 — Module pur et vue dérivée (phase 1)

- **Fichiers** : nouveau `assets/vestiaire.js` ; `engine.js` (`require` + réexport des constantes dans `module.exports`, l.~20230) ; `moteurbasket3.html` (`<script defer>` à côté de `assets/achievements.js`, l.~8357).
- **Systèmes** : `playerStanding`, `playerInfluence`, `satisfactionReasons`, `structuralAffinity`, `detectGroups`, `lockerStateLabel`, `buildLockerRoomView`.
- **Données** : aucune nouvelle donnée persistée.
- **Logique** : § 9.1-9.3.
- **Risques** : `matchLog` vide en début de saison (prévoir un repli sur `playerRoleKey` et `plannedMinutesByPlayer`) ; joueurs arrivés en cours de saison avec des lignes `matchLog` d'un autre club (filtrer sur `entry.team === team.name`, comme le correctif du 2026-10-03) ; sauvegardes sans `clubSinceSeason` (repli existant l.~11644).
- **Tests** : nouveau `vestiaire_view_test.js` — hiérarchie (un titulaire à 34 min est cadre, un vétéran à leadership 85 et 3 min est « influent sans temps de jeu »), groupes (trois Serbes forment « La colonie serbe », un parrain et son filleul sont dans le même groupe), raisons (le cas « mérite d'être titulaire » ressort en premier), stabilité (même entrée → même sortie, aucun aléa), pureté (l'objet `team` n'est pas modifié).

### Étape 3 — Onglet « Vestiaire » (phase 1)

- **Fichiers** : `moteurbasket3.html` (barre latérale, `DASH_ROUTE_TO_TAB`, `TAB_HANDLERS`, rendu), entrée de guide (`data-guide-id`, l.~9770 pour le modèle).
- **Systèmes** : `renderVestiaireTab` avec quatre sous-vues ; réutiliser `humeurChartHtml`, les badges de motivation et `nationFlagHtml` ; graphe SVG circulaire ; liste mobile ; bloc « Vestiaire » dans `renderPlayerDetail` ; lien depuis la jauge de `renderEffectifHeader` et l'alerte de fil.
- **Risques** : poids du fichier HTML (déjà ~59 000 lignes) — garder le rendu compact ; lisibilité mobile du graphe (d'où la liste).
- **Tests** : nouveau `vestiaire_ui_test.js` (jsdom, sur le modèle de `effectif_redesign_test.js` et `humeur_test.js`) : l'onglet s'affiche, aucune chaîne emoji dans le rendu (vérification par plage Unicode), les drapeaux sont des `<img>`, la vue mobile n'injecte pas de SVG de graphe ; étendre `tabs_test.js` et `sidebar_order_test.js` pour le nouvel onglet ; étendre `guide_content_test.js`.

### Étape 4 — Motivation à double sens (début de phase 2)

- **Fichiers** : `engine.js` (+ miroir de `applyBenchFrustration` côté client).
- **Systèmes** : `applyPlayingTimeMorale` (remplace en interne `applyBenchFrustration`, qui reste un alias) : terme négatif existant inchangé pour le cas extrême, nouveau terme négatif modéré si minutes < attente, terme **positif** (+0,5 à +1/semaine, plafonné à 75) si minutes ≥ attente ; petit terme lié aux résultats modulé par `composure` ; `Team.applyFormDelta` comme point d'écriture factorisé.
- **Risques** : équilibrage — un regain trop rapide rend les demandes de transfert impossibles ; garder le chemin vers `TRANSFER_REQUEST_MOTIVATION_THRESHOLD` atteignable en ~6-8 semaines pour un joueur vraiment lésé.
- **Tests** : étendre `bench_frustration_test.js` (comportement historique inchangé pour un joueur ≤ 7,5 min), `transfer_request_test.js` (délai de déclenchement) ; nouveau `playing_time_morale_test.js` (regain plafonné, joueur blessé neutre, CPU non concerné via `cpu_training_test.js`).

### Étape 5 — Relations par paires (phase 2)

- **Fichiers** : `assets/vestiaire.js` (règles), `engine.js` (`Team.relations`, `applyRelationDelta`, purge aux départs, sérialisation), `server/publicPlayers.js`.
- **Systèmes** : règles hebdo (concurrence au poste, même groupe, parrainage, dérive vers 0 de 10 %/mois), règles par match (victoire importante, défaite lourde + usage), règles d'événement (départ d'un proche).
- **Données** : `Team.relations` creux, stockage seulement si `|v| ≥ 10`.
- **Risques** : croissance de la sauvegarde (borner à 40 paires, garder les plus fortes) ; identifiants de joueurs comparés en chaîne (convention `String(id)` déjà utilisée par `mentoredYoung`).
- **Tests** : nouveau `locker_relations_test.js` (clé de paire symétrique, borne −100/+100, purge au transfert, persistance, dérive) ; étendre `persistence_test.js` et `transfer_market_test.js` (purge).

### Étape 6 — Événements de vestiaire et actions du coach (phase 2)

- **Fichiers** : `engine.js` (`pendingTalks`, `resolveLockerTalk`, `resolveTeamMeeting`, `Player.promise`, `updateLockerRoomWeekly`), `server/actions.js` (nouvelles actions sur le modèle de `discussTransferRequest`), `moteurbasket3.html` (modale de discussion réutilisant la modale d'interview).
- **Systèmes** : catalogue d'événements (§ 7) avec cooldowns ; discussions à tons ; promesses suivies (statut « tenue / en cours / rompue ») ; contagion bornée ±1 alchimie par semaine.
- **Risques** : spam d'événements (plafonds) ; interactions avec les interviews de jalon (ne jamais ouvrir une discussion et une interview la même semaine pour le même joueur) ; actions serveur concurrentes (même verrouillage que les autres actions).
- **Tests** : nouveaux `locker_events_test.js` (déclencheurs, cooldowns, plafond global), `locker_talk_test.js` (issues par ton, chance dépendant du mental comme `discussTransferRequest`), `locker_promise_test.js` (tenue/rompue) ; étendre `server/actions_test.js` (validation des entrées, joueur introuvable) et `milestone_interview_and_mvp_test.js` (non-collision).

### Étape 7 — Profondeur (phase 3)

- **Personnalités** : `Player.traits` générés dans le constructeur de `Player` et par `playerFromSave` pour les anciennes sauvegardes (tirage déterministe sur l'id, comme `nationalityFromName` le fait pour la nationalité), révélés progressivement. Tests : `player_traits_test.js`, extension de `hidden_attrs_ui_test.js`.
- **Capitaine** : `Team.captainId`, action serveur, prise en compte dans `captainLeadership` si présent sur le terrain. Tests : extension de `engine_invariants_test.js` (pas de régression d'équilibre), nouveau `captain_test.js`.
- **Passes A → B** : compteur dans `MatchEngine` à côté de `assistCandidate.stats.ast++`, agrégé dans `recordMatchStatsForTeam`. Tests : extension de `scoring_origins_test.js` (cohérence `Σ astTo = ast`), `engine_balance_test.js` (aucun effet sur les résultats).
- **Contagion par le réseau et clans dynamiques** : propagation sur les arêtes, événement de fracture. Tests : `locker_contagion_test.js` (convergence, bornes).
- **Comparaison salariale et exigences de rôle** : lecture de `salary`, `matchLog` (usage). Tests : `locker_salary_tension_test.js`.

### Étape 8 — Équilibrage et observabilité (transverse)

- Ajouter au script `simulate.js` une option qui simule une saison complète avec un manager « passif » et un manager « qui fait tourner » et exporte la distribution de `form`, `chemistry`, du nombre d'événements de vestiaire et de demandes de transfert. Objectif : 2 à 5 événements de vestiaire par mois, au plus 1 demande de transfert par saison pour un manager raisonnable.
- Mettre à jour `DEV_NOTES.md` à chaque étape (convention du projet).

---

## 11. Risques transverses et points d'attention

1. **Double comptage** : un même événement ne doit pas toucher deux fois l'alchimie (exemple : un départ applique déjà un malus dans `transferPlayerBetweenTeams` ; l'événement « départ d'un proche » doit agir sur la **motivation** des proches, pas de nouveau sur l'alchimie).
2. **Miroir client** : tout ce qui est pur va dans `assets/vestiaire.js` ; seuls les ajouts à `Team`/`Player` nécessaires à l'affichage ou à la sauvegarde passent dans le miroir, avec le commentaire « miroir identique » habituel.
3. **Clubs IA** : aucun coût, aucune donnée ; ne pas brancher `updateLockerRoomWeekly` dans `trainWeekCPU`.
4. **Lisibilité** : toujours montrer des **raisons** et des **libellés qualitatifs**, jamais des valeurs internes (même règle que `chemistryLabel` aujourd'hui : « la valeur exacte reste interne »). Les relations s'affichent en mots (« apprécie », « en froid »).
5. **Contrôle du joueur** : chaque problème affiché doit avoir au moins une action proposée, sinon l'onglet devient anxiogène.
6. **Rythme** : le jeu est hebdomadaire ; tout effet social doit être lisible à l'échelle de 2-4 semaines, pas d'un match.
