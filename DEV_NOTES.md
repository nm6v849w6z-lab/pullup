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

Les 4 chantiers ci-dessous sont **codés et testés en sandbox** (suite
complète relancée : 113/115 verts, les 2 échecs restants sont les
problèmes déjà connus listés plus bas, sans rapport avec ce travail — voir
"Tests connus flaky"/"ordres_validate_without_edit_test.js" ci-dessous).
**Pas encore déployés sur le Mac ni committés.** Fichiers touchés : `engine.js`,
`server/liveMatch.js`, `server/index.js`, `moteurbasket3.html`,
`live_boxscore_test.js` (édité) + `roster_surname_pool_test.js`,
`boxscore_quarter_scores_test.js`, `live_boxscore_minutes_totals_test.js`,
`spectate_live_match_test.js` (nouveaux tests).

1. **Box score en direct : ligne total + tous les joueurs + minutes
   jouées** — retour utilisateur : `liveBoxScore` ne créait une ligne que
   pour un joueur ayant déjà généré une statistique (lazy), pas de colonne
   MIN, pas de ligne total. Fait : `resetLiveBoxScore()` pré-remplit
   maintenant toute la feuille de match (titulaires + remplaçants
   désignés, voir `matchdayRosterPlayers`) ; les minutes sont suivies via
   `liveCourtState`/`elapsedSecondsAt`/`closeCourtInterval`/
   `openCourtInterval`, à partir des événements `substitution`/
   `shortHanded` (désormais structurés avec `player`/`replacement`, voir
   `MatchEngine.substituteIfNeeded` dans engine.js) ; ligne `.boxscore-totals`
   ajoutée (`liveBoxscoreTableHtml`). Bug pré-existant corrigé au passage
   (nécessaire pour des minutes correctes) : une blessure laissait l'équipe
   à 4 sur 5 en permanence (`applyFatigue` posait `p.onCourt = false`
   directement, empêchant `substituteIfNeeded` de trouver un remplaçant —
   voir le commentaire dans engine.js). Tests : `live_boxscore_test.js`
   (mis à jour) + `live_boxscore_minutes_totals_test.js` (nouveau,
   reconstitution indépendante depuis le flux d'événements brut). Statut :
   **tests sandbox verts, prêt à déployer sur le Mac.**

2. **Feuille de match : score par quart-temps** — retour Discord (Ariane,
   relayé par l'utilisateur). Fait : `quarterScores` (déjà calculé côté
   moteur, `MatchEngine.simulate()`) propagé de bout en bout —
   `simulateOrForfeit`/`recordMatchStatsAndAwardMvp` (engine.js) →
   `computeLiveMatch`/`finalizeRound`/`finalizeCupRound`/
   `finalizePlayoffRound` (server/liveMatch.js, persisté dans
   `league.liveMatches[...].quarterScores` pour survivre à la diffusion
   différée) → matchLog de chaque joueur → `boxscoreQuarterScoresHtml`
   côté client, affiché au-dessus des onglets domicile/extérieur de la
   feuille de stats. Test : `boxscore_quarter_scores_test.js` (nouveau).
   Statut : **tests sandbox verts, prêt à déployer sur le Mac.**

3. **Augmenter le pool de noms de famille générés** — retour Discord
   (Ariane, relayé par l'utilisateur). Fait : pool `LAST_NAMES` élargi de
   22 à 105 noms, + anti-doublon actif par effectif (`pickUniqueLastName`,
   utilisé par `generatePlayer`/`generateRookiePlayer` via un
   `usedLastNames` Set propre à chaque génération d'équipe/effectif). Test :
   `roster_surname_pool_test.js` (nouveau, 300 effectifs générés sans aucun
   doublon). Statut : **tests sandbox verts, prêt à déployer sur le Mac.**

4. **Pouvoir regarder le live d'une autre équipe depuis son calendrier** —
   retour utilisateur. Décision utilisateur (AskUserQuestion, 2026-09-24) :
   **portée limitée aux matchs DÉJÀ en direct** (au moins un côté humain,
   déjà dans `league.liveMatches`) — aucun changement à l'architecture
   délibérée "un match CPU-vs-CPU n'est jamais diffusé" (voir
   `server/autoSim_test.js`). Fait : nouvelle route `GET /api/live-status`
   (liste allégée `{homeIdx, awayIdx, round, competition}` de tous les
   matchs en direct, sans contenu — `LiveMatch.liveMatchesLiteFor`) et
   `GET /api/spectate?team=<idx>` (réutilise TEL QUEL
   `LiveMatch.viewLiveMatchForTeam` avec l'index de l'équipe SUIVIE, 404 si
   pas en direct). Côté client : pastille "🔴 En direct — Suivre" sur le
   sous-onglet Calendrier d'une fiche équipe adverse actuellement en direct
   (`refreshTeamDetailLiveBanner`), fenêtre spectateur dédiée et ISOLÉE de
   l'état du propre direct du manager (`showSpectateMatch`/`spectateState`,
   jamais `currentLiveMatch`/`teamA`/`teamB`/`liveBoxScore`) — score/quart-
   temps/fil d'événements/box score reconstitués depuis les événements déjà
   diffusés (`computeSpectateBoxScore`, ne lit jamais le résultat final déjà
   connu côté serveur), rafraîchissement MANUEL (bouton "🔄 Actualiser",
   pas de replay animé, décision utilisateur explicite). Test :
   `spectate_live_match_test.js` (nouveau, serveur HTTP + navigateur).
   Statut : **tests sandbox verts, prêt à déployer sur le Mac.**

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
