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

- **✅ COMMITTÉ, À POUSSER (2026-09-27) — Premium, lot 2 : badge +
  historique de l'entraînement** — retour utilisateur : "oui vas y".
  - Badge ★ (premiumBadgeHtml) à côté du nom d'un club Premium : classements
    (standingsTableHtml, lgStandingsTableHtml) et fiche équipe.
  - Team.trainingHistory (TRAINING_HISTORY_MAX = 13 bilans allégés, sauvegardé,
    alimenté par trainWeek) ; page Entraînement : boutons « Semaine N » en
    Premium, note verrouillée sinon. Avantages listés dans l'onglet Premium.
  - Tests : premium_test.js étendu. Reste : liste de suivi du marché +
    alertes (lot suivant).

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Amicaux : invitation invisible sans recharger** — retour d'un joueur :
  "j'ai reçu la notification pour le match amical mais pas d'invitation
  dans match amical" (league.friendlies chargé une seule fois). GET
  /api/friendly/list (lecture seule) ; frRefreshList à l'ouverture de
  l'onglet + toutes les 30 s (page visible), pastille et page mises à jour.
  amicaux_ui_test.js : scénario page déjà ouverte.

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Amicaux : vrai onglet Ordres** — retour utilisateur : "pour le match
  amical, il faut pouvoir avoir un vrai onglet ordres". Bouton « Donner /
  Modifier les ordres » → page Ordres en mode édition (même mécanisme que
  l'éditeur de tactique, tqEdit.kind = "friendly", openFriendlyOrders),
  effectif = pros + jeunes (étiquette « Jeune » dans la convocation),
  « Partir de » (ordres de l'amical, ordres du club, tactiques, derniers
  matchs), enregistrer / revenir aux ordres du club / annuler. Serveur :
  POST /api/friendly/lineup { id, orders } validé par
  actions.validateOrdersSnapshot (extrait de setTacticPresets), stocké
  f.orders[teamIdx], appliqué par applyFriendlyOrders (tactiques + feuille,
  titulaire toujours convoqué, titulaire parti remplacé). Ancienne compo
  simple (lineups) encore lue. Tests : amicaux_ui_test.js,
  server/friendlies_test.js (8bis).

- **✅ COMMITTÉ, À POUSSER (2026-09-27) — Premium, premier lot** — retours
  utilisateur : "il faut un onglet en dessous de guide [...] on y laissera
  le bouton passer en version payante (gratuitement) tout doit se passer
  par là", "ne dis plus supporter mais premium", "pour l'analyse de sa
  propre équipe c'est aussi un avantage premium", pas d'avantage sportif.
  - Onglet Premium sous Guide (renderPremiumSection) : statut, bouton unique
    « Passer Premium » / « Arrêter le Premium » (isPaying, route
    /api/club/set-paying), 6 avantages, liste « Bientôt ».
  - Un seul statut : Team.hasActivePremium() (isPaying ou premiumUntil) ;
    scoutingPremium fusionné dans isPaying au chargement ; server/scouting.js
    et le Scouting local lisent hasActivePremium ; maillots/logo aussi
    (teamIsPremium côté page). Boutons « Passer en payant » (identité du
    club) et « Passer Pro (test) » / « Repasser en gratuit » retirés →
    liens data-tab="premium".
  - Analyse de sa propre équipe : Premium (carte verrouillée sinon).
  - Tactiques : 6 en Premium, 3 sinon (Team.tacticPresetsMax,
    TACTIC_PRESETS_FREE_MAX) ; celles enregistrées restent après.
  - Tests : premium_test.js (nouveau) ; scouting_pro_test C3,
    tactic_presets, team_home_page, away_jersey, sidebar_order (Tactiques
    manquait déjà), tactical_scouting_report adaptés.
  - Reste (lots suivants) : badge Premium, historique d'entraînement de la
    saison, liste de suivi du marché, notifications, courbes, stats, replay.

- **✅ COMMITTÉ, À POUSSER (2026-09-27) — Entraîneur adjoint** — retours
  utilisateur : "recruter des assistants avec une spécialité [...] les
  joueurs progressent passivement sur les attributs liés à la spécialité",
  "si un adjoint a moins de carac [...] elles doivent monter plus vite",
  "1 adjoint par équipe", accessible à tous (pas Supporter).
  - engine.js (+ miroir) : ASSISTANT_SPECIALTIES (tir 3 carac, meneurs 4,
    intérieurs 4, défensif 2), ASSISTANT_WEIGHT_BY_LEVEL (0,12→0,28),
    ASSISTANT_BASE_SALARY (500→6 000 €), assistantAttrWeightsFor (× taille de
    spécialité WEIGHT_BY_PROGRAM_SIZE × poste × gabarit) ; Team.assistantCoach
    (un seul) ; Team.trainWeek ajoute ce poids à tous les joueurs NON BLESSÉS,
    minutes jouées ou non (choix par défaut, à confirmer), × bonus de
    l'entraîneur principal ; paie hebdo « Salaire du staff (entraîneur
    adjoint) » ; marché aux enchères League.assistantCoachListings
    (spécialité tirée au hasard, plancher 2× celui des autres staffs, CPU,
    congédiement relisté à 70 %).
  - Serveur : /api/market/assistant-bid, /api/staff/fire-assistant,
    refreshAssistantCoachMarket à chaque passage. Page Staff : 6e poste
    (spécialité affichée sur chaque candidat et sur l'adjoint en poste),
    tableau de bord N/6, Guide + visite guidée + en.js.
  - Tests : assistant_coach_test.js (nouveau), medical_staff_test.js (6
    postes) ; server/*_test.js + tests staff/entraînement/i18n verts.
  - À voir : filtre par spécialité sur le marché, rappel de l'adjoint sur la
    page Entraînement.

- **✅ COMMITTÉ, À POUSSER (2026-09-27) — Forme : +10 par jour civil sans
  jouer ; amical = pas de jour de repos** — retours utilisateur : "la forme
  remonte par 10 uniquement s'ils n'ont pas joué" ("c'était le but qu'un
  joueur fatigue bien et qu'il ne puisse pas être titulaire à 35 min sur 3
  matchs par semaine sans conséquence") ; un amical "empêche de faire
  l'entraînement collectif tactique ou de récupération".
  - engine.js (+ miroir) : conditionRestDays/currentCondition = jours civils
    (Paris) entièrement écoulés depuis le jour du dernier match joué, ce
    jour et aujourd'hui exclus (mardi → jeudi = +10, avant +20).
    Team.friendlyDayIndexes/markFriendlyDay/isFriendlyDay (sauvegardé),
    exclus de daysTrainedForTarget et applyRestDayRecovery ;
    server/friendlies.js marque le jour sur les vrais clubs.
  - Page Entraînement : l'aperçu « jours banqués » ne compte plus
    aujourd'hui si un match officiel ou un amical accepté a lieu aujourd'hui.
  - Tests : player_condition_test.js adapté, weekly_calendar_test.js
    (test 12) ; server/*_test.js + 12 tests liés verts. Reste : push.
  - Amical → connaissance tactique (validé : "oui c'est top comme ça") :
    Team.gainTacticalKnowledgeFromFriendly — gain d'un match × part des
    minutes pondérées par le rôle (Titulaire 1, Joueur de rotation 0,5,
    Réserviste/jeune 0, FRIENDLY_TACTICAL_ROLE_WEIGHTS), sans perte ni
    séries, jours d'entraînement accumulés intacts. « banqué » remplacé par
    « jours d'entraînement tactique depuis le dernier match » (+ en.js).

- **✅ COMMITTÉ, À POUSSER (2026-09-27) —
  Entraînement : jauge de forme moyenne sous
  « Travailler la récupération » + bilan de la semaine dernière en bas** —
  retour utilisateur (capture page Entraînement) : "quand on met travailler
  la récupération, une petite jauge en dessous avec la forme moyenne de
  l'équipe" ; "Bilan de la semaine dernière en dessous des trois autres
  briques de la page". moteurbasket3.html : #recoveryFormGauge dans la
  carte Collectif (renderRecoveryFormGauge, currentCondition moyenne avec
  conditionRecoveryPerDay), #lastTrainingReportHolder déplacé après
  « Qui profite… ». Test : training_recovery_gauge_test.js (+ onboarding_tour,
  tabs, daily_training_cycle, synergy_training, trained_tactic_dropdown
  verts). Reste : push.

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Analyse d'équipe gratuite + rythme dans Stratégies + « Statistiques par
  joueur »** — retour utilisateur : "mettre en place l'analyse d'équipe
  pour les joueurs gratuits [...] que Stratégies utilisées [...] le rythme
  plutôt que dans identité (idem payant) [...] effectif complet à renommer
  en statistiques par joueur (idem payant)". moteurbasket3.html :
  sp2StrategyBlockHtml (attaque/défense/rythme, partagé Pro + gratuit),
  scoutingFreeAnalysisHtml (#scoutingFreeReport, au-dessus du teaser
  verrouillé, calculé depuis matchLog côté navigateur), Rythme retiré des
  puces Identité (grille 4 colonnes), titres renommés. scouting_pro_test.js
  adapté (C1 gratuit, C2bis rythme/renommage).

- **✅ EN PROD (ae45239, ADSENSE_CLIENT posé sur Render, /ads.txt OK) — EN ATTENTE D'EXAMEN ADSENSE (2026-09-27) — Vraies pubs
  (Google H5 Games Ads) aux emplacements prévus** — demande : "ajouter les
  pubs aux endroits prévus dans mon jeu hoop-manager.com" ; régie choisie :
  H5 Games Ads ; ID éditeur : ca-pub-1405059336303894 (à mettre dans ADSENSE_CLIENT sur Render).
  - server/ads.js (nouveau) : ADSENSE_CLIENT (ca-pub-…) + ADSENSE_TEST=1 ;
    injection avant </head> du jeu (window.HM_ADS + shim adBreak/adConfig +
    adsbygoogle.js) et de /bienvenue (script seul, vérif. du site) ; route
    /ads.txt (404 sans config). server/index.js branché.
  - moteurbasket3.html : hmAdsEnabled/hmAdsShowBreak/hmAdsShowRewarded ;
    Scouting Pro → showScoutingRealAdOverlay (ticket serveur inchangé,
    bouton « Regarder la pub » = opt-in exigé par Google, complété
    seulement sur adViewed ; messages « fermée » / « aucune pub ») ; Hoop
    Shows → hoopShowOnAd = adBreak 'pause' hoopshow-prematch/halftime,
    segment sauté si Google n'a rien. Sans ADSENSE_CLIENT ou dans l'appli
    Capacitor (AdSense interdit en WebView) : écrans gris factices inchangés.
  - Tests : ads_integration_test.js (nouveau) ; scouting_pro,
    hoop_show_player, server/hoop_shows, server/index verts.
  - Reste (utilisateur) : compte AdSense + inscription H5 Games Ads,
    ADSENSE_CLIENT (+ ADSENSE_TEST=1 d'abord) sur Render, message RGPD dans
    AdSense « Confidentialité et messages ». Reformuler « Aucune publicité »
    dans assets/site/index.html (texte sur l'email). Appli stores : AdMob
    plus tard. NB : moteurbasket3.html/server/index.js ont aussi des
    modifs d'autres sessions non committées → commit par hunks.

- **✅ COMMITTÉ, À POUSSER (2026-09-27) — Play-offs mardi/jeudi/samedi +
  Récupération seulement les jours de repos** — retours utilisateur : "les
  PO doivent se jouer le mardi jeudi et samedi", "la coupe sera tjrs
  terminée pour les PO car max 512 équipes", bonus « Récupération »
  "uniquement les jours de repos".
  - Calendrier (4 copies identiques : server/calendar.js, engine.js,
    moteurbasket3.html, live_2d_demo.html) : journées >= totalRounds (PO)
    = mardi/jeudi/samedi à partir du mardi qui suit la saison régulière
    (WEEKLY_RHYTHM_PLAYOFF_DAY_OFFSETS, paramètre poFromRound) → 2 semaines
    de PO max, saison = 11 semaines pile. scheduledTimeForLeagueRound
    (serveur + page) passe league.totalRounds.
  - Récupération : taux continu = 10/jour (+ kiné) quoi qu'il arrive ; +5 à
    tout l'effectif une fois par jour de repos ÉCOULÉ passé en
    « récupération » (Team.applyRestDayRecovery, entrée du journal marquée
    recoveryApplied, sauvegardée), appelée par syncCollectiveTrainingLog,
    elle-même appelée juste avant chaque match (Team.resetForMatch, équipes
    humaines) ; coquille d'amical neutralisée (server/friendlies.js).
  - Tests : server/weekly_calendar_test.js (tests 10 et 11 + saison = 11
    lundis pile), medical_staff_test.js adapté ; tous les server/*_test.js
    + ~18 tests UI liés verts. Reste : push.
  - Question ouverte : un jour d'amical compte-t-il comme jour de repos pour
    l'entraînement collectif ? (aujourd'hui oui).

- **✅ DÉPLOYÉ SUR LE MAC, À COMMITTER/POUSSER (2026-09-27) — Amicaux :
  formulaire de proposition** — retour utilisateur : "mets une barre de
  recherche plus sympa [...] la même que celle dans la barre de page tout en
  haut" + "adversaire, jour (enlève de repos) et heure sur la même ligne".
  moteurbasket3.html : champ adversaire = .topbar-search-input (pilule),
  libellé « Jour », ligne .fr-propose-row en grille 3 colonnes (2 sur
  mobile, adversaire pleine largeur). amicaux_ui_test.js vert.

- **✅ COMMITTÉ, À POUSSER (2026-09-27) — Matchs amicaux : recherche
  d'adversaire + délais des invitations** — retours : "dans adversaire, il
  faudrait plutôt que ce soit une recherche, qu'un menu déroulant", enlever
  "Le manager reçoit un message privé et doit accepter avant l'heure du
  match.", "l'invitation reste max 3 jours, et après elle s'annule", "si pas
  validé 1h avant le match, ça s'annule aussi". Client : champ
  #frOpponentSearch + suggestions (frOppResultsHtml : accents ignorés,
  managers d'abord, 8 max), plus de #frOpponentSelect ni de texte d'aide ;
  invitation reçue = « répondre avant le … » (frInviteDeadline). Serveur
  (server/friendlies.js) : FRIENDLY_INVITE_TTL_MS (3 j),
  FRIENDLY_ACCEPT_DEADLINE_MS (1 h), inviteDeadline ; catchUpFriendlies
  annule les invitations dépassées (message au proposant), respondFriendly
  refuse d'accepter après, proposeFriendly refuse un amical contre un
  manager à moins d'1 h. Tests : server/friendlies_test.js (section 8),
  amicaux_ui_test.js (recherche). friendlies_test a échoué 1 fois sur 6
  lancé en parallèle d'autres tests (vert seul, 5/5) : à surveiller.

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Salle : graphique d'affluence à l'échelle de la plus forte affluence** —
  retour utilisateur : "au dessus des barres de affluences, c'est pas un
  peu vide ? [...] si ça venait à être trop haut [...] il faut que la
  brique soit plus grande automatiquement". salleAttendanceChartSvg :
  échelle = affluence max × 1,08 (au lieu de la capacité), hauteur du tracé
  140 px jusqu'à 7 000 spectateurs puis jusqu'à 280 px vers 30 000 ; ligne
  de capacité seulement si elle tient dans l'échelle. Reste : commit + push.

- **✅ COMMITTÉ, À POUSSER (2026-09-27) — Saison à 11 semaines +
  entraînement collectif hors jours de match** — retours utilisateur : "une
  saison devrait plutôt faire 11 que 10 semaines (9 semaines de championnat
  + 2 de PO)", "corrige sur la ligue actuelle, si l'entrainement des
  fondamentaux est par jour de match, ça doit aussi être dans la nuit du
  dimanche au lundi", "les matchs de coupe et PO doivent avoir le même
  impact que les matchs de saison régulière. Idem pour les amicaux", "les
  entrainements collectifs eux, sont uniquement sur les jours de repos".
  - Vérifié, rien à changer : la ligue en ligne est déjà basculée au rythme
    hebdomadaire (8770250, en prod) → fondamentaux le lundi 0h ; minutes de
    coupe, play-offs et amicaux déjà comptées comme le championnat.
  - engine.js (+ miroir moteurbasket3.html, committé par erreur avec
    d29f93c par l'autre session) : SEASON_LENGTH_WEEKS = 11 ;
    Team.trainWeek(divisionLevel, now, { seasonEnd }) — seasonEnd explicite
    remplace le modulo team.week ; League.seasonEndTickDone (sauvegardé) ;
    daysTrainedForTarget(target, matchDayIndex) : le jour du match ne compte
    plus comme jour d'entraînement collectif.
  - server/autoSim.js : runWeeklyEconomyTick ; lundis de saison
    seasonEnd:false ; lundi qui suit la finale = seasonEnd:true
    (vieillissement, salaires, stats remises à zéro), puis plus rien.
    Avant : vieillissement au 9e lundi AVANT les play-offs, en pleine saison
    pour la ligue basculée, et la dernière mise à jour n'avait jamais lieu.
  - Tests : server/weekly_calendar_test.js (saison complète 11 lundis,
    ligue basculée, jour de match) + tous les server/*_test.js et ~20 tests
    liés verts (club_history/end_to_end : flaky sous charge, verts seuls).
  - Limites connues : play-offs sur 3 semaines si séries au 3e match ; bonus
    « Récupération » de la forme appliqué en continu (jours de match
    compris) ; l'aperçu « jours banqués » de la page Entraînement compte
    encore aujourd'hui un jour de match. Reste : push.
- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Tactiques : « Partir de » + plancher de connaissance tactique** —
  retours utilisateur : "dans partir de : ajoute aussi les 5 derniers
  matchs en proposition. enlève le prochain match" ; "ça reste des joueurs
  pro, peut être pas besoin de descendre aussi bas, sinon on change jamais
  de tactique".
  - moteurbasket3.html (tqOrdersSources) : plus d'« Ordres du prochain
    match » ; tactiques enregistrées + les 5 derniers matchs joués
    (TQ_SOURCE_MATCHES). Team.ordersHistory (ordres complets) complété par
    les matchs plus anciens reconstitués depuis matchLog
    (tqMatchLogMatches/tqOrdersFromMatchLog : tactique jouée, cinq et
    rotation d'après les minutes). Repli « Réglages actuels » si rien.
  - engine.js + miroir html : TACTICAL_KNOWLEDGE_FLOOR = 40 (« Système
    encore hésitant ») : la perte s'arrête à 40, sauvegardes plus basses
    remontées au chargement. tactical_knowledge_test.js adapté (oracle +
    2 valeurs de round-trip).
  - Reste : commit + push.

- **✅ COMMITTÉ, À POUSSER (2026-09-27) — Onglet Tactiques (tactiques enregistrées +
  maîtrise)** — demande : "pouvoir programmer 3 tactiques max, qu'on pourra
  retrouver très facilement dans ordres et mettre en place en 1 seconde",
  "voir les tactiques maîtrisées", contenu = "tout, joueurs compris",
  "pouvoir donner un nom à la tactique". Moteur (engine.js + miroir) :
  Team.tacticPresets (3 max, nom 30 car.), save/rename/delete/
  tacticPresetPatch (joueurs partis retirés)/tacticPresetKnowledge ;
  postes à surveiller exclus (propres à un adversaire). Serveur :
  setTacticPresets (/api/tactic-presets, op save/rename/delete, mêmes
  validateurs que setTactics/setLineup). Client : onglet Tactiques (Équipe,
  après Ordres) = 3 cartes (nom, maîtrise, résumé des ordres, Appliquer au
  prochain match / Renommer / Supprimer en 2 clics / Remplacer) + «
  Tactiques maîtrisées » (jauge par option 10/5/3, « En place ») ; barre «
  Mes tactiques » en haut des Ordres (1 clic = tactique appliquée à la
  journée affichée, ordres en direct ou plan ; « + Enregistrer ces ordres »
  avec nom + emplacement). Boutons en classe .tq-btn (PAS
  .calendar-order-btn : tabs_test prend le 1er .calendar-order-btn de la
  page). Tests : tactic_presets_test.js (nouveau) ; verts aussi : tabs,
  ordres_redesign, planned_tactics, confirmed_tactics, persistence,
  i18n_english, ordres_validate_without_edit, tactical_knowledge,
  end_to_end, onboarding_tour, dashboard_e2e, calendar_redesign,
  ordres_round_planning, tous les server/*_test.js (cup_ordres_planning
  échoue déjà avant, voir plus bas). Statut : committé, à pousser.
  - 39f5e75 était CASSÉ (bloc mal placé par un découpage de hunks à la
    main, page qui ne se chargeait plus) et a été poussé ; corrigé par
    6f4abeb. Leçon : après un commit partiel, TOUJOURS vérifier la version
    committée seule (git checkout-index -a --prefix=… puis tests).
  - Éditeur (retour : "quand on crée une tactique, il faut qu'on puisse
    faire comme si on était sur les ordres et pourquoi pas aussi choisir
    une tactique d'un des matchs précédents") : « Créer une tactique » /
    « Modifier » ouvrent la page Ordres en mode édition
    (#prepSection.tq-editing, tqEdit, openTacticEditor/
    renderTacticEditorBar, brouillon tqProxyFrom = même principe que
    planProxyForRound) avec nom + « Partir de » (ordres du prochain match,
    tactique enregistrée, ou un des 10 derniers matchs). Moteur :
    Team.ordersHistory (ORDERS_HISTORY_MAX = 10, clubs humains) rempli par
    recordOrdersHistory dans recordMatchStatsAndAwardMvp (championnat +
    coupe ; pas les amicaux). Rempli à partir de ce commit seulement.
  NB : une autre session travaille en parallèle (Matchs amicaux, fichiers
  engine.js/moteurbasket3.html/server/index.js) — ne committer que mes
  hunks.

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Matchs amicaux** — demande : "on doit pouvoir les faire quand on veut sur
  les jours de repos. on doit pouvoir faire jouer les jeunes. quand
  quelqu'un propose un match amical, on devrait recevoir un petit message
  privé." Choix validés : humains (invitation à accepter) + CPU (acceptent
  tout de suite) ; jour de repos ET heure au choix (demi-heures 08h-23h30,
  Paris) ; "comme un vrai match" (fatigue, blessures, minutes
  d'entraînement) mais rien sur classement/économie/matchLog/MVP ; 1 amical
  par jour par club.
  - server/friendlies.js (nouveau) : League.friendlies (JSON brut, miroir
    engine.js + moteurbasket3.html), jours de repos = jours sans
    championnat/play-offs (si qualifié)/coupe (si encore en lice)/ligue
    privée, pour les 2 clubs ; routes /api/friendly/propose|respond|cancel|
    lineup + GET /api/friendly/days ; catchUpFriendlies au tick (joue à
    l'heure, périme les invitations sans réponse, annule si un officiel
    tombe le même jour) ; simulation dans une coquille d'équipe garnie des
    VRAIS joueurs (pros + jeunes de la compo), entrée matchLog "friendly"
    retirée après coup, blessures reportées dans le carnet du vrai club.
  - Message privé : action → `notify` → messages.send dans le gestionnaire
    générique de server/index.js (ligue partagée seulement).
  - Client : onglet Matchs amicaux (remplace le placeholder), pastille des
    invitations reçues, composition (Titulaire/Remplaçant/Tribune, section
    Académie), feuille de match (jeunes « (J) »), lignes « Amical » dans le
    Calendrier (hors bilan de saison), entrée du Guide.
  - PAS de direct pour un amical (résultat + feuille de match à l'heure
    prévue, comme les ligues privées) — à proposer si l'utilisateur le veut.
  - Tests : server/friendlies_test.js, server/friendlies_http_test.js,
    amicaux_ui_test.js ; tabs_test.js adapté. NB : les tests UI qui
    affichent des heures doivent tourner avec TZ=Europe/Paris
    (private_league_ui_test.js échoue sinon, sans rapport).
  - Suite lancée : tous les tests server/ + ~20 tests UI liés verts.
    `cup_ordres_planning_test.js` échoue ("Pas de <select> Ajouter un
    remplaçant pour le poste Pivot") MAIS échoue aussi sur le HEAD sans ce
    chantier (vérifié sur une copie git archive) → à investiguer côté
    Ordres/Tactiques, sans rapport avec les amicaux.
  - Reste : commit + push (main puis prod).

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Barre latérale réorganisée** — proposition validée ("vas y fais comme
  ça") : accueil sans titre (Tableau de bord, Messagerie) ; Équipe
  (Effectif, Ordres, Entraînement, Centre médical, Statistiques — ce sont
  les stats hebdo de l'effectif) ; Compétitions (Calendrier, Ligue, Coupe,
  Matchs amicaux, Ligues privées) ; Recrutement (Marché, Staff, Académie) ;
  Club (Économie, Sponsors, Salle, Supporters, Histoire du club) ; en bas
  Guide, Discord ↗, Se déconnecter. moteurbasket3.html (HTML de la
  sidebar seul, data-tab inchangés), en.js (+ Recrutement, Discord ↗).
  Test : sidebar_order_test.js. Reste : commit + push (main puis prod).

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Effectif : demi-barres de potentiel pour les paliers impairs** — retour
  utilisateur (capture Effectif) : "des demi barres remplies pour les
  nombres impairs (1/3/5/7/9)". effPotentialHtml (moteurbasket3.html) :
  palier 1 → 0,5 barre, 3 → 1,5 … 9 → 4,5 (classe .eff-pip.half, dégradé
  moitié couleur du palier / moitié fond) ; au passage, en thème clair les
  barres pleines n'étaient pas colorées (règle .eff-pip du thème clair plus
  spécifique que .eff-pip.on) → corrigé. Test : potential_tier_test.js
  vérifie pleines + demi par ligne. Reste : commit + push.

- **✅ DÉPLOYÉ SUR LE MAC, À COMMITTER/POUSSER (2026-09-27) — Économie :
  mention « Journal limité aux 40 dernières opérations » retirée** — retour
  utilisateur (capture page Économie) : "enleve ça". moteurbasket3.html
  (bas de l'Historique) : le span de gauche reste vide quand le journal est
  incomplet ; « Total du journal » reste à droite. Aucun test ne portait sur
  ce texte (clé i18n en.js laissée, inutilisée). Reste : commit + push.

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Salle : agrandissement libre, place par place** — retours utilisateur :
  "ajouter librement les places dans les gradins et pas les constructions
  par niveau", "plafonner le nombre de places", "le prix de construction
  doit tjrs être le même, de la première à la dernière place", coûts façon
  BuzzerBeater "100, 500, 5000 pour vip", loges plafonnées ("6500 place vip
  ? ça paraît démentiel"), bouton Agrandir du bandeau retiré, billetterie
  resserrée + brique « Agrandir la salle » juste dessous (maquette v3
  validée). engine.js + miroir : SEAT_CATEGORY_MAX_SEATS (27 500 / 15 000 /
  2 500 = 45 000), SEAT_BUILD_COST_PER_SEAT (100 / 500 / 5 000 €),
  Team.seats/currentSeats/buildSeats, capacité = somme des places, nom de
  salle selon la capacité (arenaLevelForCapacity) ; anciennes salles gardent
  la répartition de leur palier. Serveur : /api/arena/build-seats.
  Client : renderArenaBuild, salleArenaInfo. Tests : arena_seats_test.js ;
  salle_redesign/salle_upgrade_confirm adaptés. NB : moteurbasket3.html
  contient aussi, non committé, le travail Ordres d'une autre session.

- **✅ COMMITTÉ (583219c), À POUSSER PAR L'UTILISATEUR (2026-09-27) —
  Tableau de bord : plus de tâche « Staff : N/5 postes pourvus »** — retour
  utilisateur : "si on ne veut pas prendre de médecin, rien n'y oblige".
  dashBuildTasks ne crée plus la tâche staff (ni la pastille « ! » sur
  Staff dans la barre latérale) ; la carte KPI Staff N/5 reste.
  moteurbasket3.html + assertion négative dans dashboard_e2e_test.js.
  Reste : `git push`.

- **✅ DÉPLOYÉ SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER (2026-09-27) —
  Calendrier au rythme hebdomadaire** — retours utilisateur : championnat
  "mardi et samedi, la coupe le jeudi", "matchs à 20h", "l'économie est à
  mettre à jour dans la nuit du dimanche au lundi (on paie donc le staff et
  les joueurs à ce moment là)", "l'entrainement fondamental, c'est une fois
  par semaine selon le temps de jeu", "l'entrainement collectif c'est sur
  les jours de repos", play-offs "2 matchs par semaine" (mardi/samedi, le
  jeudi reste à la coupe), vieillissement en fin de saison.
  - Règle (server/calendar.js, copies identiques dans engine.js,
    moteurbasket3.html, live_2d_demo.html) : `League.calendarWeeklyRhythm`
    (+ `lastEconomyTick`), weeklyRhythm* : jour 0 = mardi 20h, journée r =
    semaine floor(r/2) mardi/samedi 20h (play-offs compris), tour de coupe
    k = jeudi de la semaine k 20h, mise à jour k = lundi 0h00.
  - server/autoSim.js : catchUpWeeklyRhythm (championnat, coupe, play-offs
    et mise à jour du lundi dans l'ordre chronologique ; Team.trainWeek =
    économie + entraînement fondamental sur les minutes de la semaine ;
    vieillissement inchangé à la semaine 10 = lundi après la dernière
    journée). startPlayoffsPhase extrait de catchUpPlayoffs. Entraînement
    collectif : déjà compté jour par jour sur les jours sans match
    (syncCollectiveTrainingLog), rien à changer.
  - IMPORTANT : seules les ligues CRÉÉES après ce changement ont le rythme
    hebdomadaire (dailyAnchoredCalendarConfig renvoie weekly: true). La
    ligue en ligne actuelle garde le rythme quotidien (dates recalculées
    depuis calendarStartAt, les changer en cours de saison déplacerait tous
    les matchs) → bascule au prochain reset de la ligue.
  - Textes du guide/tutoriel + en.js mis à jour (statiques : ils décrivent
    déjà le nouveau rythme même avant le reset).
  - Tests : nouveau server/weekly_calendar_test.js (dates, DST, 4 copies
    identiques, saison complète, paies, minutes hebdo) ; autoSim_test et
    cup_test gardent l'ancien rythme quotidien ({ dailyAnchored: true }).
  - Bascule EN PLEINE SAISON (retour utilisateur : "bascule en pleine
    saison oui") — DÉPLOYÉE SUR LE MAC, TESTS VERTS, À COMMITTER/POUSSER :
    Engine.migrateLeagueToWeeklyRhythm, appelée par server/index.js:tick
    pour toute ligue encore au rythme quotidien. League.calendarWeeklySwitch
    = { fromRound, fromCupRound, anchorAt } : journées/tours déjà joués
    gardent leur date, la suite repart du prochain mardi 20h (match en cours
    de diffusion terminé à son heure). Si poussé avant 19h le 27/09 : J10
    le mardi 29/09 20h, J11 samedi 3/10… J18 mardi 27/10, play-offs ensuite ;
    1re mise à jour du lundi le 5/10 (pas de paie entre-temps). Plus besoin
    de reset. Test : section 6 de server/weekly_calendar_test.js.
  - À signaler à l'autre session : cup_ordres_planning_test.js échoue depuis
    a2b0493 (« 3 joueurs max par poste » : plus de select « Ajouter un
    remplaçant » au Pivot), sans rapport avec le calendrier.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-27) — Ordres : carte
  « Temps de jeu » plus compacte + 3 joueurs max par poste** — retours
  utilisateur : "réduis la brique de droite [...] ça fait trop de place",
  "limite à 3 joueurs par poste (titu, remplacant, reserviste)".
  Team.backupCountAt + MAX_BACKUPS_PER_POSITION = 2 (engine.js, miroirs
  moteurbasket3.html et live_2d_demo.html) : toggleBackupPosition refuse un
  3e remplaçant ; « + Ajouter » masqué dans Rotation et Temps de jeu quand
  le poste est plein. Carte : une ligne par joueur (pastille T / R / Rés
  + nom), marges et cases réduites. Anciennes sauvegardes avec plus de
  remplaçants : gardées telles quelles. lineup_test et lineup_minutes_test
  adaptés. Reste : `git push` (+ `main:prod`) et coup d'œil dans le vrai jeu.
  Suite (même jour) : carte « Postes à surveiller » déplacée SOUS Temps de
  jeu (zone de grille "adv", Défense sur deux rangées) pour supprimer le
  vide de la colonne de droite ; sur téléphone elle reste sous Défense.
  Puis : carte Défense étirée à la hauteur de la colonne de droite → les
  boutons segmentés grandissent (flex 2/5) plutôt qu'un vide en bas ou de
  grands écarts ("trop aéré").
- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-27) — Fiche joueur :
  triangle ▲ vert sur les caractéristiques en hausse au dernier
  entraînement** (Team.lastTrainingReport.players[id].gains, infobulle
  « +N au dernier entraînement »). pdpLastTrainingUps/pdpAttrRowHtml,
  test player_attr_up_test.js. Code parti dans le commit f56c0ae de
  l'autre session (elle a committé tout moteurbasket3.html). Reste :
  `git push` (+ `main:prod`).

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-27) — Avatars à l'âge
  réel + boutons de Défense à taille normale** — retours : "il a 15 ans et
  déjà des cheveux et la barbe grise", "les mêmes tailles partout [...] mais
  conserver l'alignement des briques en bas". playerAvatarHtml et le
  résolveur d'avatars des émissions passent `age: player.age` à AvatarGen
  (avant : âge tiré au hasard 19-35 depuis l'id) ; pas de barbe (ni ombre)
  avant 18 ans, barbe de quelques jours au plus avant 21 ans. Défense : plus
  d'agrandissement des boutons, l'espace va entre les rubriques (bas aligné
  avec Postes à surveiller). Note : certains avatars existants changent
  légèrement (coiffure « receding » liée à l'âge, barbe des jeunes).

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-27) — Ordres : deux
  colonnes indépendantes** (maquette validée par l'utilisateur : "c'est ok
  pour moi comme ça"). Gauche : Convocation, Attaque, Défense ; droite :
  Cinq, Rotation, Temps de jeu, Postes à surveiller. Plus de grille à
  rangées communes (grid-template-areas supprimées) : aucune carte étirée,
  boutons tous à la même taille, pas de vide sous Pivot dans Rotation ;
  les colonnes peuvent finir à des hauteurs différentes (temps de jeu en
  automatique). Remplace les réglages successifs de la journée sur Défense.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-27) — Onglet Centre
  médical (v1)** — demande : "commence à travailler sur l'onglet Centre
  médical". Contenu validé : Infirmerie, Risque de blessure, Encadrement
  médical, Historique ; onglet dans Gestion après Staff.
  - Moteur (engine.js + miroir moteurbasket3.html) : Team.injuryLog (60
    entrées max, INJURY_LOG_MAX) alimenté par Team.recordInjury depuis
    MatchEngine.applyFatigue (saison, semaine, date, joueur, type, durée,
    adversaire), persisté par serializeTeam/teamFromSave.
  - Page (moteurbasket3.html) : #medicalSection, renderMedicalSection,
    medicalRiskFor (forme physique × salle de musculation × kiné, mêmes
    multiplicateurs que applyFatigue ; paliers Faible <0,85 / Normal <1,15 /
    Élevé <1,5 / Très élevé), CSS .med-*, version mobile (colonnes Poste et
    Forme masquées). Traductions en.js ajoutées.
  - Tests : medical_center_test.js (nouveau) ; verts aussi :
    medical_staff, injury_duration, persistence, tabs, i18n_english,
    sidebar_logo, player_condition, onboarding_tour, dashboard_e2e,
    end_to_end, mobile_pwa, guide_nav, tous les server/*_test.js.
  - Pistes v2 (non demandées) : ajouter le Centre médical au Guide et au
    tutoriel, alerte au tableau de bord quand un joueur passe en risque
    Très élevé, historique des saisons passées.
  - Refonte (retour utilisateur, 2026-09-27 : "ça ne ressemble pas au
    reste du site", "grand vide sous infirmerie", "si on a trop de monde,
    ça va tout décaler") : gabarit du Calendrier (.cal-layout, filtres
    Tous/Blessés/À risque/Historique, tableaux .cal-month, colonne
    .cal-side de hauteur fixe : Infirmerie en chiffres + Encadrement
    médical). Les blessés sont des lignes en tête de liste ; l'historique
    est un filtre, groupé par mois. Page ajoutée à WIDE_PAGE_IDS. La
    première partie de la refonte est partie dans le commit ec6479d
    (Effectif) d'une autre session ; le reste est committé à part.
  - Facteurs de risque retirés de l'affichage (retour utilisateur : "je ne
    mettrai pas les facteurs de risque") : plus de ×1,38 ni d'infobulle de
    détail ni de note explicative ; seul le palier (Faible → Très élevé) et
    sa barre restent.
  - Colonne de droite alignée sur le haut de la liste (retour : "infirmerie
    ne doit pas monter au dessus de joueurs disponibles") : filtres sortis
    de la colonne principale, grille .med-layout (zones bar/main/side) ; sur
    mobile, cartes puis filtres puis liste.
  - Tableau à 3 colonnes : palier + jauge alignés à droite sous « Risque
    pour le prochain match » (ex « avant ») ; les blessures n'arrivent
    qu'en match (rollInjury appelé seulement par applyFatigue) et un blessé
    ne peut pas jouer (matchInjuryLocked). Filtre « Blessés » gardé
    (retiré puis rétabli : "il a du sens [...] il affiche la brique
    infirmerie"). « Jours d'indisponibilité » (ex « Jours perdus ») / « Disponibles »
    sur deux lignes pleine largeur (plus de texte collé).
  Reste : `git push`.
- **📋 CHANTIER SUIVANT** — Matchs amicaux.

- **📝 DÉCIDÉ, À CODER QUAND LES DIVISIONS MULTIPLES ARRIVERONT (2026-09-27)
  — Coupes nationales** — retours utilisateur :
  - Coupe nationale limitée à 512 équipes ("on ira jusqu'à 5 division ou 6
    pour faire les 512, les autres iront dans la coupe de france amateur") :
    9 tours = 9 jeudis, tient dans la saison régulière. Suggestion Claude à
    valider : fixer la limite en nombre de places (les 512 meilleures de la
    pyramide, exemptions au 1er tour pour les divisions supérieures si ça ne
    tombe pas pile) ; vainqueur de la Coupe de France amateur qualifié pour
    la coupe nationale suivante. Même créneau (jeudi 20h) pour les deux
    coupes. Si la coupe amateur dépasse 512 équipes : la découper par région.
  - Handicap : "+7 points par division d'écart", plafonné à +21 ("oui
    plafonne l'écart à +21"). Points au tableau d'affichage dès le coup
    d'envoi pour l'équipe de division inférieure, ligne « Handicap +N » dans
    le résumé/box score, jamais comptés dans les stats joueurs ni les
    records. Calibrage à vérifier par simulation (écart de score moyen entre
    deux divisions) avant de figer les 7 points.
  - Aujourd'hui : coupe à 10 équipes d'une seule division, rien à faire.

- **⏳ À REPRENDRE — Tableau de bord : vrai logo d'un adversaire payant** :
  `dashboardTeamRef()` ne résout pas `logoUrl` pour l'adversaire, donc un
  adversaire isPaying avec `customLogoDataUrl` affiche le ballon générique
  au lieu de son logo (toujours le cas sur HEAD au 2026-09-27). Ajouter le
  test correspondant dans dashboard_e2e_test.js.

- **🌐 Hébergement — à vérifier/faire côté utilisateur** :
  - CNAME `www` chez IONOS → hoop-manager-test.onrender.com (adresse
    technique de la PROD, malgré son nom).
  - Ancien service Oregon (`hoopmanager-test`, pullup-030q.onrender.com) :
    repasser en Free, redéployer avec ses variables de test.
  - Plus tard : envoi d'emails (mot de passe oublié), politique de
    confidentialité, comptes en base SQL et plusieurs ligues au-delà de
    quelques centaines de joueurs.

- **👀 À vérifier visuellement dans le vrai jeu** (testés en jsdom/Chromium
  seulement) : Ordres > temps de jeu cible par poste ; page live qui ne
  « saute » plus sur les tirs (Safari) ; version claire sur les écrans
  rares (fin de saison, rattrapage, interviews, Scouting Pro).

- **⏳ PAS COMMENCÉ — idée à scoper : détail de "comment ils marquent leurs
  points" dans le rapport tactique gratuit** — retour utilisateur
  (2026-09-24), en réaction aux jauges de "Tendances observées" : "ce qui
  serait mieux, ce serait de dire comment ils larquent leur point : après
  rebond offensif, après pénétration du meneur, après prise de position au
  poste du pivot...". **PAS réalisable avec les données actuellement
  trackées** : `Player.emptyStats()`/`matchLog` (engine.js) suit déjà
  fga2/fga3/paintAtt/pts/oreb/dreb/ast/ftm/fta PAR MATCH, mais ne tague
  JAMAIS l'ORIGINE d'un panier précis (putback après rebond offensif,
  panier après pénétration, panier après prise de position poste...) —
  contrairement à `tacticsUsed` (capturé au moment de la simulation, voir
  Engine.tacticsSnapshotFor), rien d'équivalent n'existe pour "ce shot
  vient d'où". Implémenter ça demanderait une VRAIE instrumentation du
  moteur de simulation (taguer chaque tir généré avec son origine au
  moment où `MatchEngine` le génère), pas juste une nouvelle agrégation
  côté UI comme tout ce qui a été fait jusqu'ici pour Scouting Pro/le
  rapport tactique — chantier plus lourd, à scoper avec l'utilisateur
  (quelles origines de tir le moteur peut distinguer aujourd'hui dans sa
  logique de génération de tirs ? lesquelles vaudrait-il la peine
  d'exposer ?) avant de coder quoi que ce soit. Ne PAS fabriquer une fausse
  version de cette stat avec les champs existants.

- **💡 Idées pour plus tard (non faites)** :
  - Sponsors : carton dans les émissions, section dans le Guide.
  - Messagerie : cartes « offre de transfert » dans le fil, notification
    push mobile, écran de modération dans l'appli.

### À investiguer

- **player_detail_test.js échoue systématiquement** (constaté le
  2026-09-26, sur HEAD sans les changements en cours aussi) : "❌ (setup) la
  fiche équipe adverse devrait afficher des liens joueur cliquables".
  Probablement lié à la refonte de la feuille de stats / fiche équipe
  (commits 3e9b073 et suivants), pas creusé.

---

## Repères techniques (pour ne pas perdre de temps à re-découvrir)

- **Hébergement (2026-09-27)** : PROD = service Render `hoop-manager`
  (Frankfurt, Starter, branche `prod`, domaine hoop-manager.com, adresse
  technique hoop-manager-test.onrender.com), base Upstash `pullup`
  (Irlande, clés `pullup:*`), BASKET_PUBLIC_SITE=1, Discord activé. TEST =
  service `hoopmanager-test` (Oregon, Free, branche `main`,
  pullup-030q.onrender.com), SANS Upstash (fichiers éphémères). Livrer en
  prod : `git push origin main:prod`. DNS chez IONOS (A @ → 216.24.57.1).
  Variables : voir server/README.md "Comptes joueurs".

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
  `attr_color_scheme_everywhere_test.js`, `full_run_test.js`,
  `milestone_interview_and_mvp_test.js` (ajouté 2026-09-24, refonte du
  tableau de bord : variance normale de rotation sur un match simulé,
  confirmé passant seul à 3/3, sans rapport avec le tableau de bord),
  `ordres_during_live_test.js`, `spectate_live_match_test.js` (ajoutés
  2026-09-24, chantier point 12 "prochain match ignore la Coupe" : échouent
  UNIQUEMENT sous charge parallèle ~8 jobs — même symptôme ECONNRESET que
  `end_to_end_test.js`/`persistence_test.js` ci-dessous, confirmés passant
  seuls à chaque fois, sans rapport avec ce chantier),
  `cpu_training_test.js` (ajouté 2026-09-24, run complet de vérification
  après les 3 chantiers de la session — vu échouer une fois sur la suite
  complète, confirmé passant seul, test de simulation probabiliste sans
  rapport avec l'un des 3 chantiers).
- **`ordres_validate_without_edit_test.js` échouait de façon RÉPÉTABLE,
  CORRIGÉ (historique Git)** : ce n'était pas le bug Ordres qu'il
  semblait signaler — c'était un bug de TEST (horloge client jsdom jamais
  patchée dans la partie "LIGUE PARTAGÉE", désynchronisée de l'horloge
  serveur mockée), qui déclenchait par accident un rechargement parasite
  exposant un VRAI bug de concurrence dans `refreshFromServerAndReenter()`
  (peut écraser `teamA` pendant qu'une validation d'ordres est en cours).
  Les deux sont corrigés. Ne plus lister ce test comme échec attendu — un
  nouvel échec ici serait désormais une vraie régression.
- **Lancer la suite de tests avec trop de jobs en parallèle cause de faux
  échecs** : `end_to_end_test.js`/`visibility_refresh_test.js` (minuteurs
  réels sous charge CPU) et `persistence_test.js`/`promotion_test.js`
  (`ECONNRESET`, trop de connexions HTTP locales simultanées). Tous passent
  individuellement — limiter à ~8 jobs en parallèle max, et relancer seul
  avant de conclure à une régression.
