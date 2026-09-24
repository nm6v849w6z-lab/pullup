# Suivi de développement — Pull Up / Hoop Manager

Ce fichier liste UNIQUEMENT ce qu'il reste à faire (retour utilisateur,
2026-09-23 soir : "tu enleveras des notes toutes les mises à jour qu'on a
passé ce soir. je veux dans la note que ce qu'on doit faire"). Il ne
raconte plus l'historique des chantiers déjà livrés — une fois un point
committé ET poussé par l'utilisateur, il est simplement RETIRÉ de ce
fichier (l'historique Git du dépôt fait déjà ce travail, pas la peine de le
dupliquer ici). Il vit dans le dépôt (`pullup-real/DEV_NOTES.md` côté
sandbox, `~/Documents/PullUp/DEV_NOTES.md` côté Mac) et doit être commité
avec le code qu'il décrit.

**Règle de tenue à jour** : avant de démarrer un nouveau chantier, ajouter
une entrée dans "À faire" ; à chaque étape significative, la mettre à jour
(en cours / code fait / testé / committé) ; une fois committé ET poussé par
l'utilisateur, SUPPRIMER l'entrée de ce fichier plutôt que de l'archiver.
Ne jamais laisser ce fichier désynchro de l'état réel du code.

---

## Prêt à committer (code fait + testé en sandbox, PAS ENCORE livré sur le Mac)

**2026-09-23, tard le soir** : l'utilisateur est allé se coucher ("fais tout
ce que tu as à faire et on pousse demain matin") pendant que je finissais le
point ci-dessous et démarrais le suivant (intégration avatars/salle) — au
moment de livrer sur le Mac via le pont `device_bash`/`device_commit_files`,
la connexion à son ordinateur s'est coupée (normal, il est en train de se
mettre en veille/se fermer). **Les deux chantiers ci-dessous sont donc CODE
FAIT + TESTÉS EN SANDBOX mais PAS livrés sur le Mac** — la prochaine session
(demain matin, ou dès que le pont se reconnecte) doit d'abord réessayer
`device_commit_files` (précaution nom de fichier neuf + vérif md5sum
habituelle) avant de donner les commandes git à l'utilisateur.

- **Classements de stats de la Ligue : numéros de rang 2-5/2-20 + colonnes
  toujours alignées** — retour utilisateur (2026-09-23, captures) :
  1. "si le nom est trop long, faut au moins mettre le début du nom de
     l'équipe" (le nom d'équipe s'affichait comme "(...)" vide dès qu'il
     était trop long pour tenir dans le `<button>` — un `<button>` est une
     boîte inline atomique, `text-overflow:ellipsis` ne peut pas le couper
     partiellement, il disparaît en entier). Corrigé en tronquant la
     CHAÎNE elle-même en JS avant de l'insérer dans le bouton
     (`truncateTeamNameForColumn`, 14 caractères max) plutôt que de
     compter sur l'ellipsis CSS.
  2. "les colonnes doivent tjrs avoir la meme largeur, c'est plus
     harmonieux" — colonne nom d'équipe à largeur FIXE
     (`--stats-leader-team-w: 92px`, même valeur n°1 et rangs 2-20, même
     valeur mobile/desktop — une largeur mobile réduite avait été essayée
     puis retirée, elle cassait à nouveau la troncature JS ci-dessus).
  3. "pour les classements de stats pour les joueurs à partir du 2e mets
     2. 3. 4. 5. etc" (capture Safari) — les rangs 2+ n'affichaient AUCUN
     numéro dans Safari (Chrome/Chromium les affichait correctement).
     Cause : le numéro reposait sur le compteur natif `<ol start="2">` +
     `<li>` (`list-style`), et Safari a un bug de rendu de ce compteur
     natif quand un `<li>` voisin (le n°1, `.stats-leader-first`) passe en
     `display:flex`. Corrigé en abandonnant complètement le compteur natif :
     le rang 2-20 est maintenant du texte explicite
     (`<span class="stats-leader-rank">2.</span>`, etc.), qui s'affiche
     pareil dans tous les navigateurs.
  Fichiers : `moteurbasket3.html` (CSS `.stats-leader-card`/-rank/-team,
  JS `renderLeagueStatsPanel`), `league_stats_test.js` (nouvelles
  assertions : rangs 2-5 explicites, rangs 2-20 une fois dépliée).
  Statut : code fait, `league_stats_test.js` vert, suite complète (94
  fichiers) verte (les 4 échecs de la première passe —
  `calendrier_ordres_stale_live_redirect_test.js`, `end_to_end_test.js`,
  `onboarding_tour_test.js`, `thirteen_attrs_test.js` — sont tous passés
  individuellement au retry, flakiness connue sous charge, pas des
  régressions). **PAS ENCORE livré sur le Mac** (pont coupé, voir note en
  tête de section) — livrer `moteurbasket3.html` + `league_stats_test.js` +
  `DEV_NOTES.md`, puis :

  ```
  cd ~/Documents/PullUp
  git add moteurbasket3.html league_stats_test.js DEV_NOTES.md
  git commit -m "Numéros de rang 2-20 des classements de stats (fix Safari) + troncature/alignement des colonnes"
  git push
  ```

  Une fois ce commit poussé, retirer cette entrée de DEV_NOTES.md (elle
  n'a plus rien à faire ici, l'historique Git suffit).

- **Nouveaux générateurs d'avatars et de salle (fichiers fournis par
  l'utilisateur, 2026-09-23 soir : "j'en profite pour te donner les nouveaux
  fichiers avatar et salle à intégrer à la place de ce qui est existant")**
  — `avatar-generator.js` et `arena-generator.js` (+ `INTEGRATION.md`)
  remplacent les corps des IIFE `AvatarGen`/`ArenaGen` existantes dans
  `moteurbasket3.html` (mêmes points d'entrée exposés, `AvatarGen.
  generateAvatar`/`ArenaGen.generateArena`, donc les DEUX seuls appelants du
  jeu — `playerAvatarHtml` et le rendu de la page Salle — n'ont pas eu à
  changer). Nouveautés apportées par cette version par rapport à
  l'ancienne :
  - Avatars : plus de styles de cheveux/barbes, tatouages de bras
    (`armTattoo`/`armSide`), fossette au menton (`cleft`), textures fines de
    peau/maillot/barbe (motifs `tx${UID}...`).
  - Salle : nouveau mode **`dusk`** (soir de match, éclairage nocturne —
    vitrages allumés, lampadaires, projecteurs, bandeau du club lumineux),
    **DÉFAUT** de `generateArena` désormais (`options.mood` vaut `'dusk'`
    sauf si `'day'` est passé explicitement) — l'ancienne version n'avait
    QUE le mode jour. L'appel existant (page Salle) ne précise pas `mood`,
    donc la salle s'affiche maintenant de nuit par défaut (vérifié
    visuellement, rendu correct, voir capture prise pendant la session).
  Intégration : mêmes conventions que la version précédente déjà en place
  (voir le commentaire au-dessus de `AvatarGen` dans `moteurbasket3.html`) —
  maillots aléatoires du module d'origine (tableau `JERSEYS`, champ `team`
  de `generateAppearance`) et catalogue de planches artiste
  (`partInfo`/`partSVG`/`PART_COUNTS`, utile seulement pour
  `planche-avatars.html`, pas pour le jeu) retirés ; `options.teamColors`
  reste la seule source de couleurs de maillot, avec un repli gris neutre
  (`['#3a3a40', '#55555c']`) si jamais un appel oublie de le fournir, comme
  avant.
  Correctif collatéral : `mvp_avatar_test.js` neutralise les ids SVG
  générés par le compteur `UID` module-level (`hd123`, `eye124`...) avant
  de comparer deux rendus du même joueur — la nouvelle version ajoute deux
  nouveaux préfixes d'id (`tx` pour les textures, `arm` pour les tatouages
  de bras) qui n'étaient pas dans la liste, corrigé
  (`normalizeAvatarHtml`).
  Fichiers : `moteurbasket3.html` (corps de `AvatarGen`/`ArenaGen`
  remplacés), `mvp_avatar_test.js` (regex de normalisation étendue).
  Statut : code fait, suite complète (94 fichiers) verte (3 échecs de la
  première passe — `calendrier_ordres_stale_live_redirect_test.js`,
  `end_to_end_test.js`, `onboarding_tour_test.js` — tous passés
  individuellement au retry, flakiness connue), vérifié visuellement
  (Playwright : page Effectif — avatars variés, cohérents — et page Salle —
  rendu nocturne propre, enseigne du club lisible, aucun artefact). **PAS
  ENCORE livré sur le Mac** (pont coupé, voir note en tête de section) —
  livrer `moteurbasket3.html` + `mvp_avatar_test.js` + `DEV_NOTES.md`, puis :

  ```
  cd ~/Documents/PullUp
  git add moteurbasket3.html mvp_avatar_test.js DEV_NOTES.md
  git commit -m "Nouveaux générateurs avatars/salle (plus de styles, tatouages, salle en mode soir par défaut)"
  git push
  ```

  Une fois ce commit poussé, retirer cette entrée de DEV_NOTES.md.

  **Non traité intentionnellement (hors scope avatars/salle avatars du
  jeu)** : `demo.html`, `planche-avatars.html`, `planche-salles.html` (outils
  autonomes pour l'artiste, pas des fichiers du jeu — comme la version
  précédente, seuls `avatar-generator.js`/`arena-generator.js` sont
  intégrés). Si l'utilisateur veut repasser en mode jour par défaut pour la
  Salle (`mood: 'day'`), c'est un choix produit à lui demander, pas fait
  d'office ici — le mode nuit a été gardé car explicitement décrit comme
  l'amélioration principale du nouveau générateur (voir INTEGRATION.md :
  "'dusk' (soir de match, par défaut)").

---

## À faire

1. **Box score en direct : ligne total + tous les joueurs + minutes
   jouées** — retour utilisateur : actuellement `liveBoxScore` ne crée une
   ligne que pour un joueur ayant déjà généré une statistique (lazy), pas
   de colonne MIN (volontairement absente à l'origine, voir le commentaire
   existant dans `moteurbasket3.html`), pas de ligne total. En cours —
   investigation démarrée (`resetLiveBoxScore`/`liveBoxScore`/flux
   d'événements `type: "substitution"`).
   Pistes : pré-remplir toutes les lignes à `resetLiveBoxScore()` à partir
   de la feuille de match (titulaires + remplaçants désignés) plutôt que
   lazy ; pour les minutes, suivre les événements de substitution déjà
   présents dans le flux (`type: "substitution"`) + les titulaires de
   départ pour calculer le temps réellement passé sur le terrain par
   joueur.

2. **Feuille de match : score par quart-temps** — retour Discord (Ariane,
   relayé par l'utilisateur) : afficher le score par quart-temps sur la
   boxscore du match. `quarterScores` existe déjà côté moteur
   (`{A:[...4], B:[...4]}`, voir engine.js `simulate()`) — pas encore
   affiché sur la feuille de stats. Pas commencé.

3. **Augmenter le pool de noms de famille générés** — retour Discord
   (Ariane, relayé par l'utilisateur) : trop de doublons de noms de
   famille dans un même effectif (ex. "3 Fontaine, 2 Novak, 2 Petit, c'est
   la galère pour m'y retrouver"). Élargir la liste de noms de famille
   utilisée à la génération des joueurs. Pas commencé.

4. **Pouvoir regarder le live d'une autre équipe depuis son calendrier** —
   retour utilisateur : actuellement l'écran Live ne montre que le match du
   club du joueur (`league.liveMatch`, calculé pour son propre club). Il
   faudrait un accès au direct d'un match d'une AUTRE équipe depuis la page
   Calendrier de cette équipe (fiche équipe adverse). Pas commencé — à
   creuser : le direct est aujourd'hui pré-calculé et rejoué avec des délais
   réels UNIQUEMENT pour le club du joueur (voir `computeLiveMatch`/
   `schedulePlayback` côté serveur) ; regarder le match d'une autre équipe
   nécessitera probablement la même mécanique mais déclenchée/adressée
   différemment (par équipe/journée plutôt qu'implicite au club du joueur).

---

## Repères techniques (pour ne pas perdre de temps à re-découvrir)

- **Le push reste toujours fait par l'utilisateur** depuis son propre
  terminal Mac authentifié — Claude ne pousse jamais lui-même (le shell
  `device_bash` n'a pas les identifiants GitHub).
- **`.git/index.lock` périmé** : bloque `git` avec "Another git process
  seems to be running". Si aucun autre `git` ne tourne réellement, `rm -f
  .git/index.lock` puis relancer la commande suffit (vécu plusieurs fois
  côté Mac ce 2026-09-23).
- **Tests connus flaky** (pas des régressions, sûrs à ignorer sur un seul
  échec, relancer avant de creuser) : `league_stats_test.js`,
  `training_progression_test.js`, `player_detail_test.js`,
  `thirteen_attrs_test.js`, `disciplinary_ejection_test.js`,
  `onboarding_tour_test.js`, `post_match_interview_button_test.js`,
  `season_objective_endreg_client_test.js`,
  `calendrier_ordres_stale_live_redirect_test.js`,
  `attr_color_scheme_everywhere_test.js`, `full_run_test.js`.
- **`ordres_validate_without_edit_test.js` échoue de façon RÉPÉTABLE**
  (pas flaky, pas causé par les sessions récentes) : en ligue partagée,
  valider un plan sans édition préalable ne l'enregistre pas localement
  tout de suite (message du test : "BUG NON CORRIGÉ"). La partie "SOLO" du
  même test passe. Semble être un bug de longue date déjà connu du code
  (test-TODO existant). À creuser lors d'une session dédiée aux Ordres, pas
  traité jusqu'ici.
- **Lancer la suite de tests avec trop de jobs en parallèle cause de faux
  échecs** : `end_to_end_test.js`/`visibility_refresh_test.js` (minuteurs
  réels sous charge CPU) et `persistence_test.js`/`promotion_test.js`
  (`ECONNRESET`, trop de connexions HTTP locales simultanées). Tous passent
  individuellement — limiter à ~8 jobs en parallèle max, et relancer seul
  avant de conclure à une régression.
