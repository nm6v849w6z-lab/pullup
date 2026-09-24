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
