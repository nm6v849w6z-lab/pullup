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

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Émissions
  avant-match / mi-temps dans l'esprit du jeu + pronostics de mi-temps** —
  retour utilisateur (captures du show de la mi-temps Lyon-Rennes) : "mets
  un vrai petit avatar pour le journaliste" puis "pour l'avatar, pioche dans
  ceux qu'on a pour les joueurs", "reprends le logo hoop manager plutot
  qu'un fait maison", "reprends l'esprit de la DA des autres pages du jeu",
  "pourquoi il n'y a qu'une question dans le prono ?". Cause de la question
  unique : à la mi-temps seuls les matchs DIFFUSÉS en direct sont connus
  (CPU contre CPU simulés à la fin de la journée), donc pas de "match à
  suivre" ni d'autres matchs → seule restait "Qui gagne la 2e mi-temps".
  Livré : server/shows/showData.js (3 questions de plus sur TON match :
  vainqueur si écart ≤ 15 sinon écart final, plus/moins de points projetés,
  meilleur marqueur parmi les 3 meilleurs à la pause — types déjà résolus
  par resolveShowQuestion ; multiplex retiré quand ton match est seul ;
  versus avec ids d'équipes) ; assets/hoop-shows/showPlayer.js/.css
  (palette/police du tableau de bord et du live, titres en capitales,
  bandeau façon "Prochain match" avec écussons, liserés maillot et badge
  Mon club, carte des tirs avec écusson au rond central, avatars joueurs
  dans meilleur joueur/compos/duel, écussons multiplex/classement/affiches,
  questions numérotées + "Valider x/n", police Exo 2 plus chargée) ;
  moteurbasket3.html (hoopShowDressOpts : écussons teamLogoHtml, couleurs
  JERSEY_COLORS, avatars AvatarGen, logo de la barre latérale ; le
  présentateur s'appelle Nicolas Cosset ("ce serait mieux s'il est blanc",
  "on va l'appeler : Nicolas Cosset") = tête d'avatar AvatarGen graine 1388
  (peau claire, brun), en costume — "utilise la tete de
  l'avatar mais mets lui un costume quand meme" : option AvatarGen
  `outfit: "suit"` (renderSuit : veste marine, chemise, cravate ambre ;
  joueurs inchangés)). Tests : hoop_show_player_test.js et
  presenter_suit_test.js (nouveaux) + hoop_shows, prematch_lock_ui,
  mvp_avatar, tabs, dashboard_e2e, live_view_game_style, server/actions,
  liveMatch, index verts. Rendu vérifié dans Chromium (1440 px). Note : une
  émission de mi-temps déjà publiée garde ses questions (publication
  idempotente). Incident : 3243d71 a committé un moteurbasket3.html VIDE
  (fichier écrasé par une autre session pendant le commit), rétabli par
  151e5aa sans le costume ; costume réappliqué dans le commit suivant.
  Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26, 3e9b073) —
  Feuille de statistiques refaite** — retours utilisateur : "améliore les
  feuilles de stats, elles ne sont pas très belles", "respecte plus
  l'esprit de la DA des autres pages", "refais tout, c'est horrible".
  showMatchBoxscore / matchMvpCalloutHtml / boxscoreTableHtml /
  boxscoreQuarterScoresHtml (moteurbasket3.html) : en-tête compétition ·
  tour · date + bouton ×, tableau de score (logos, score, pastille
  Victoire/Défaite de mon club), quarts-temps collés dessous, carte MVP
  (avatar, 4 tuiles, ligne de tirs, citation), "Face à face" (8 totaux
  d'équipe), onglets en pilule, tableau individuel (nom figé, groupes de
  colonnes, zéros estompés, +/- coloré, badge MVP, % sur la ligne Total).
  Profite aussi à la fin de match en direct. mvp_avatar_test.js lit
  MVP_CALLOUT_AVATAR_SIZE. Tests sandbox verts (calendrier_boxscore,
  boxscore_quarter_scores, mvp_avatar, live_boxscore(_minutes_totals) +
  suite complète). Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26, 9ea5c60) —
  Coupe : score cliquable dans l'arbre de la phase finale** — retour
  utilisateur : "pouvoir cliquer et ouvrir les box scores des matchs
  directement dans les briques des phases finales, en cliquant sur le
  score". cupTeamRowHtml/cupMatchCardHtml : le score d'un match joué devient
  un bouton data-boxscore-* (délégation existante de #coupeContent →
  showMatchBoxscore). Test : cup_bracket_boxscore_test.js (nouveau) ;
  cup_bracket_card_alignment, cup_bracket_order, cup_redesign verts.
  Reste : `git push`.
- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Fiche joueur :
  colonne Forme/Motivation 280 → 340 px** (+ text-wrap:pretty sur la
  citation) — retour : "élargi un peu la colonne [...] comme ça la citation
  n'aura pas 3 caractères sur la ligne du dessous". Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Page live :
  bouton Retour, score du topbar et liseré jaune retirés** — retour
  utilisateur (capture du direct) : "enlève le bouton retour", "enlève le
  score dans la barre quand on est sur cette page, ça fait doublon", "il y
  a un petit truc jaune au dessus de la barre de recherche enlève aussi".
  (La refonte « esprit du jeu », le dernier tir qui clignote et le correctif
  de cache sont poussés.) Retour : #liveSection.hm-live-on
  .playback-controls masqué (bouton gardé dans le DOM : tests, forfait) ;
  mini-bandeau #topbarLiveStrip masqué via :has() quand la page live est
  affichée, toujours visible ailleurs ; le « truc jaune » était le bas du
  bandeau d'événement (.toast) de la vue live, caché hors écran mais pas
  assez → visibility:hidden quand il n'est pas affiché.
  HM_LIVE_ASSET_VERSION 20260926-4. Vérifié dans Chromium sur un vrai
  direct ; live_view_game_style, dashboard_live_match, live_match_names,
  live_boxscore, tabs, spectate verts. Reste : `git push`.
  ⚠️ Incident pendant ce commit (08:53) : une écriture ratée a vidé
  moteurbasket3.html sur le Mac quelques secondes, et le commit 3243d71
  (costume du présentateur, autre session) l'a enregistré vide. Rétabli
  par 151e5aa (version de 7961232). Perdu : le code du costume
  (AvatarGen outfit « suit », renderSuit, appel du présentateur) —
  presenter_suit_test.js échoue tant qu'il n'est pas refait.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Rotation : les
  10 titulaires jouaient tout le 1er quart-temps** — retour utilisateur
  (boxscore Lyon-Rennes en direct, début Q2, tous les titulaires à 10-11
  min) : "que tu aies un ou deux joueurs qui jouent tout le premier quart
  temps ça peut arriver. Mais les 5 des deux équipes non jamais". Cause
  (league.json, 300 matchs) : 1er repos déclenché uniquement par la
  fatigue (seuil 20-50) alors qu'un Q1 complet n'en apporte que ~20-25 →
  59 % des équipes sans changement en Q1, 33 % des matchs sans changement
  des deux côtés ; en plus un titulaire sorti ne revenait quasiment jamais
  (titulaire moyen ~16 min). Correctif engine.js : Player.firstRestAt
  (65 % sortent entre 4,5 et 9,5 min, 35 % enchaînent tout le Q1),
  nextRestAt (pauses suivantes 7-12 min après chaque retour), relais court
  du remplaçant (returnStarterId/stintEndAt, 2,5-5,5 min) puis retour du
  titulaire s'il est dispo (pas exclu/blessé, < 4 fautes, reposé). Après :
  0 % d'équipes sans changement en Q1, ~0,85 titulaire/équipe joue tout le
  Q1, minutes par rang 32/29/28/26/23/14/12/11/9/7, points/passes
  inchangés. Copie navigateur moteurbasket3.html NON touchée (déjà sans le
  correctif rotations précédent ; matchs simulés côté serveur).
  training_progression_test.js : point 7 résolu — les débutants n'étaient
  ajoutés qu'à `saved.team` alors que le serveur lit l'équipe `isHuman` de
  `saved.league.teams`, et la page pouvait écraser le fichier (flush
  manquant) ; le test ne passait que par hasard, désormais déterministe.
  Tests verts : training_progression, lineup, engine_live_events,
  live_boxscore(+minutes_totals), milestone_interview_and_mvp,
  disciplinary_ejection, injury_duration, forfeit, cpu_training,
  bench_frustration, team_chemistry, chemistry_gain, tactical_knowledge,
  player_condition, league_stats, boxscore_quarter_scores,
  calendrier_boxscore, stats_hebdo, player_season_stats_modal,
  live_view_game_style, scouting_advanced_stats, tous les server/*_test.js.
  Reste : `git push` + redéploiement.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Verrou des
  ordres à T-5 min + accès à l'émission d'avant-match** — retour
  utilisateur (capture tableau de bord à 07:56 pour un match à 07:57) :
  "les ordres ne sont pas bloqués 5 min avant le match et il n'y a pas
  l'émission de l'avant match qui est proposée". Causes : verrou calculé
  une seule fois au rendu de l'écran Ordres, aucun verrou serveur, bouton
  de l'émission présent UNIQUEMENT sur l'écran Ordres. Correctif :
  server/actions.js (ordersLockedFor/liveOrdersLocked : /api/lineup,
  /api/tactics, /api/plan refusés dans les 5 dernières minutes, Coupe
  comprise) ; moteurbasket3.html (ordresRoundLocked/
  currentMatchLineupLocked/prematchShowAvailable, onLineupLockReached
  déclenché par startCountdown à T-5 min page ouverte ; tableau de bord :
  bouton "Émission d'avant-match" + tâche dédiée ; topbar : bouton
  "Émission d'avant-match" / "Ordres verrouillés" ; écran Ordres figé
  aussi pour un tour de Coupe immédiat ; mountDashboard ne cumule plus
  ses écouteurs de clic). Tests : server/orders_lock_test.js et
  prematch_lock_ui_test.js (nouveaux) + 28 tests ordres/tableau de
  bord/Coupe/direct/émissions verts. Émission de Coupe toujours hors
  périmètre. Reste : `git push` + redéploiement.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Alchimie : leviers
  à la hausse** — retour utilisateur : "faisons la vivre davantage à la
  hausse, ça tire trop vers le bas là" (avant : seules les 5 interviews de
  jalon la faisaient monter, +2 max chacune, contre jusqu'à -8 par
  transfert). Désormais +1 par match réellement joué
  (CHEMISTRY_MATCH_TOGETHER_GAIN) et +1 de plus si le cinq de départ est
  le même qu'au match précédent (CHEMISTRY_SAME_FIVE_GAIN,
  Team.lastStartersKey sauvegardé) — valeurs doublées ("on a une vingtaine
  de matchs par saison, double tes ratios") : ~+40/saison pour un effectif
  stable, ~+20 s'il tourne. engine.js : Team.updateChemistryAfterMatch appelée par
  recordMatchStatsForTeam ; valeurs décimales arrondies à l'affichage
  (tableau de bord, fil d'actu). Guide (visite Effectif) mis à jour.
  Tests : chemistry_gain_test.js (nouveau), team_chemistry_test.js adapté
  (section 6 neutralise le gain par match), tactical_knowledge,
  dashboard_feed, milestone_interview_and_mvp, server/actions, autoSim,
  cup verts. Transferts (-8 max) et interviews inchangés. Reste :
  `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Entraînement :
  bilan entièrement replié à l'ouverture** — retour utilisateur : "quand on
  ouvre la page d'entrainement, l'onglet du premier s'ouvre tjrs, il
  faudrait le laisser fermer comme ceux des autres [...] on ouvre en
  cliquant dessus uniquement". renderLastTrainingReport :
  trainingReportOpenKeys démarre vide. daily_training_cycle vert. Reste :
  `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Connaissance
  tactique : perte adoucie** — remarque d'un joueur relayée par
  l'utilisateur : "la perte pour les entraînements collectifs est énorme
  non ?", puis "ralentir la perte alors oui" (option 1 sur 3 proposées).
  Avant : 0/-4/-8/-12/-16 par match d'absence (plafond -16 > gain max
  +12), soit -88 en 8 matchs (4 jours à 2 matchs/jour). Après :
  0/0/-2/-4/-6 (TACTICAL_KNOWLEDGE_LOSS_GRACE=2, STEP=2, MAX=6), soit -30
  en 8 matchs. Fichiers : engine.js ET moteurbasket3.html (copie
  navigateur), tactical_knowledge_test.js adapté (courbe, trajectoire,
  retour après 5 matchs d'absence au lieu de 3). Tests verts :
  tactical_knowledge, team_chemistry, trained_tactic_dropdown,
  attr_color_scheme_everywhere. Non traité (proposé, pas retenu pour
  l'instant) : bonus d'entraînement tactique compté par jour, quasi nul
  au rythme de 2 matchs/jour ; plancher de maîtrise. Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Entraînement :
  avatars des joueurs dans le bilan** — retour utilisateur (capture "Bilan
  de la semaine dernière") : "onglet entrainement, ajoute les avatars des
  joueurs". trainingReportAvatarHtml (vrai avatar AvatarGen via
  playerAvatarHtml, initiales en repli si le joueur a quitté l'effectif),
  utilisé par le bilan (renderLastTrainingReport) ET le récap de rattrapage
  (.cu-rp). CSS .tp-avatar--img. daily_training_cycle vert ;
  training_progression échoue aussi sur HEAD sans ce changement (flaky
  connu). Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Salle et
  Académie : bouton texte au lieu de la flèche d'amélioration** — retour
  utilisateur (capture Salle) : "plutot que de mettre des fleches qui
  monte pour améliorer les infrastructures ou la salle, ce serait pas mieux
  un plus ? ou autre chose, tu peux proposer (idem sur l'onglet academie
  des jeunes)". Option choisie : bouton pleine largeur "Améliorer ·
  80 000 €" / "Construire · …" (contour ambre, plein au survol) ; bandeau
  de la salle : "Nom du palier suivant / Niveau N · coût" + bouton plein
  "Agrandir". buildUpgradeArrow(confirmOpts, btnOpts) ; classe
  .facility-upgrade-arrow conservée (tests, tutoriel). Tests
  salle_upgrade_confirm, salle_redesign, club_facilities,
  academie_progression_hidden, academie_redesign, tabs, onboarding_tour
  verts. Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Académie de
  jeunes : refonte visuelle** — retour utilisateur (capture) : "améliore
  l'onglet académie de jeunes" (code direct, pas de maquette). Bandeau de
  synthèse (places x/15, stagiaires €/sem., recruteur + chance/jour,
  promus), décision 18 ans en carte, prospects en CARTES (avatar, badge
  potentiel 3 bandes, compte à rebours rouge < 12 h, moyennes Technique/
  Physique/Mental, 3 points forts / 2 à travailler, 28 caracs repliées,
  Recruter/Ignorer visibles — avant cachés au bout d'un tableau à
  défilement horizontal), effectif jeunes en cartes (moyenne vers le
  plafond 50, caracs au plafond, saisons avant la décision ; tri par âge,
  jamais par potentiel), Centre de formation + historique des promus côte à
  côte en bas, états vides utiles (bouton "Engager un recruteur" → Staff).
  Visite guidée réordonnée dans l'ordre de la page (ids conservés).
  Fichiers : moteurbasket3.html (renderAcademieSection & co, CSS .ac-*),
  nouveau academie_redesign_test.js. Tests académie/tour/tabs verts ;
  suite complète : seuls player_detail_test et training_progression_test
  échouent, et ils échouent AUSSI sur HEAD (sans lien). Commit limité aux
  hunks Académie (moteurbasket3.html contient d'autres chantiers en cours
  d'autres sessions). Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Fiche équipe
  adverse : refonte des sous-onglets Effectif et Calendrier** — retour
  utilisateur (captures Rennes/Devil May Care) : "améliore les pages
  effectifs et calendrier des adversaires. à noter que sur les pages
  effectifs, on peut être amené à voir certaines caracs des joueurs".
  Effectif : bandeau KPI (+ jauge caracs révélées X/28), vues Général
  (groupes Cinq/Rotation/Réserve, infos publiques + moyennes) /
  Caractéristiques (UNIQUEMENT les caracs révélées, groupées Tir/Jeu/
  Défense/Physique/Mental, liste des cachées ; encart vers Analyse si rien
  n'est révélé) / Statistiques. Calendrier : briques du calendrier du club
  vues depuis CETTE équipe (mois, V/D, filtres, cartes Prochain match +
  Saison, "Contre vous" + carte "Contre votre club", bouton "Préparer ce
  match"). Tests : team_detail_calendar_test.js (nouveau),
  team_detail_effectif_sort_test.js et client_scouting_test.js adaptés,
  + suites voisines vertes sur le Mac. Commit limité à ces hunks (le
  chantier Coupe en cours d'une autre session reste non committé).
  Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Onglet Marché :
  refonte** — retours utilisateur : "améliore l'onglet marché" (priorités :
  filtres et tri, suivi de mes enchères, lisibilité, comparer/décider),
  "recherche par carac avec 5 carac max (par exemple tir à 3 pts entre 70
  et 90 + tir à mi distance entre 80 et 95)", "ce n'est pas trop dans
  l'esprit des autres pages" ; maquette validée ("ça me va") :
  https://claude.ai/artifact/SD4DVTUfPNSf7h3jtojvbQ. Livré : 4 tuiles KPI
  (budget disponible = budget − enchères en tête, indicatif car placeBid
  ne réserve rien ; achats en cours ; mes ventes ; effectif/places libres),
  "Mes enchères" (Tout/Achats/Ventes, "Dépassé" = on a déjà enchéri via
  listing.bids mais un autre est en tête, Relancer/Ouvrir → carte + focus
  du montant), recherche (nom/club sans accents, postes, âge, potentiel
  min PAR PALIER, prix max/dans mon budget, bonnes affaires, masquer mes
  annonces, tri), 5 critères de caractéristiques max (min–max, ET), cartes
  façon en-tête de fiche joueur (avatar, pastille de poste, anneau NOTE =
  overall(), moyennes Tir/Jeu/Défense/Physique/Mental, valeur estimée +
  verdict vs enchère minimale, montants rapides, 28 caracs dépliables),
  Comparer → comparateur existant (showPlayerComparePicker). Pas de
  "Retirer l'annonce" (aucune route serveur d'annulation). Grille des
  cartes pilotée par @container (la barre latérale réduit la largeur).
  Classes/ids historiques gardés pour les tests. Fichier :
  moteurbasket3.html (#marcheSection, renderMarcheSection et suivantes,
  CSS .mk-*). Tests transfer_market, team_detail_page,
  attr_color_scheme_everywhere, dashboard_feed, tabs verts (aussi sur HEAD +
  ce seul changement, worktree isolé). Commit construit à partir de HEAD
  + ce seul patch (d'autres sessions ont des changements non commités
  dans le même fichier, laissés intacts). Puis retirés (retour
  utilisateur) : sous-titre "Enchères de 1 jour · le plus offrant [...]"
  et note de bas de page "Le potentiel affiché n'est qu'une estimation
  [...]". Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Comparateur de
  joueurs : alignement sur le style du jeu** — la refonte dea27d3 (poussée)
  jugée "mieux mais un peu éloignée de l'esprit des autres pages". Reprise
  dans le langage de la fiche joueur (pdp2 : cartes, titres majuscules,
  pastille de poste ambre, chips, barres par palier, légende en barre,
  radar à anneaux) et du bandeau Prochain match (hm-hero : fond scindé,
  cercle de terrain, gros VS ambre). Retirés sur demande : la note
  "Postes différents / Même poste" et le libellé "caractéristiques
  dominées" sous le score. player_compare_test adapté. Tests
  player_compare, attr_color_scheme_everywhere, radar_chart_colors,
  pdp_color_scheme, player_detail_topbar_nav verts. Commit isolé (les
  changements non commités d'une autre session — Coupe/Académie/Marché —
  restent dans l'arbre de travail). Reste : `git push`.

- **✅ COMMITTÉ, À POUSSER PAR L'UTILISATEUR (2026-09-26) — Calendrier :
  deux textes retirés** — retours utilisateur : "enlève: Ordres non
  définis pour ce match" (carte Prochain match ; « Ordres enregistrés »
  conservé) et "enlève: 18 matchs · 6 V – 2 D" (résumé à droite de
  l'en-tête de chaque mois ; bilan déjà dans la carte Saison). Fichier :
  moteurbasket3.html (calendarNextMatchCardHtml, renderCalendrierSection,
  CSS .cal-next-orders.is-missing et .cal-month-summary retirées). Tests
  calendar_redesign, calendar_merge, calendar verts. Commits 288a433 +
  suivant. Reste : `git push`.

- **⏳ À REPRENDRE — Tableau de bord : vrai logo d'un adversaire payant**
  (issu de `livrer_dashboard_fixes.sh`, jamais committé) :
  `dashboardTeamRef()` ne résout pas `logoUrl` pour l'adversaire, donc un
  adversaire isPaying avec `customLogoDataUrl` affiche le ballon générique
  au lieu de son logo. Le test correspondant (partie 5 ter de
  dashboard_e2e_test.js) est dans la sauvegarde ci-dessus ; à re-porter
  proprement sur HEAD (la copie de moteurbasket3.html sauvegardée est
  périmée, ne pas la réutiliser telle quelle).

- **🚧 EN COURS (2026-09-25) — Ordres : refonte visuelle d'après la maquette
  "Hoop Manager — Ordres (refonte)"** (canvas Design claude.ai
  H4qJesrwzYg7DWyp9Qkzq4) — retour utilisateur : "code ça stp". Barre
  d'action collante (titre + raccourcis Attaque/Défense/Cinq/Adversaires +
  Valider), carte match (journée, date, domicile/extérieur, les deux clubs,
  sélecteur de journée, jauges alchimie/connaissance), deux colonnes :
  Attaque (3 priorités classées + réserve), Défense, Adversaires à
  surveiller | Cinq de départ (terrain, pastilles) + Rotation (alerte
  joueurs listés à plusieurs postes). Rythme / aide défensive / close-out /
  rebond offensif en boutons segmentés (le <select> d'origine reste dans le
  DOM, masqué, comme source de vérité). Pas de bouton "Annuler" ni de
  "modifications non enregistrées" (tout s'enregistre déjà à chaque
  changement). Fichiers : moteurbasket3.html (#prepSection, buildTeamPanel,
  renderLineupEditor, renderOrdresRoundDateTime, CSS #prepSection),
  tests adaptés (sélecteur Défense par id). Statut : en cours de code.

0. **✅ TRANCHÉ (2026-09-24) — Écran mi-temps : PAS de choix tactiques à la
   mi-temps** — ce point était EN PAUSE depuis le 2026-09-24 matin, retour
   utilisateur : "Couper le match en deux doit être discuté avec les
   joueurs. Tout le monde n'est pas forcément sur le live et ça peut être
   vu comme un désavantage dans le jeu." Tranché le même jour, après-midi :
   "on ne laissera pas la possibilité de changer la tactique à la
   mi-temps" — **le problème d'équité est donc réglé par construction** :
   la mi-temps devient purement un contenu de divertissement/pronostics
   (voir point 11 ci-dessous, le pack "émissions" livré ensuite couvre
   exactement ça), sans aucune décision de jeu qui pénaliserait un manager
   non connecté à ce moment précis — un manager qui rate la mi-temps ne
   perd RIEN de plus qu'aujourd'hui (comme rater le direct lui-même).
   **Conséquence importante, qui simplifie ÉNORMÉMENT ce chantier** :
   l'ancien "obstacle moteur" ci-dessous (découper `MatchEngine.simulate()`
   en deux passes résumables pour qu'un choix tactique à la mi-temps ait un
   effet réel) **n'a plus lieu d'être** — puisqu'aucune décision ne doit
   plus influencer la suite du match, le match reste calculé d'un coup
   comme aujourd'hui (`computeLiveMatch`), et la mi-temps n'a besoin que de
   LIRE l'état déjà connu à ce stade (score, `quarterScores`, événements
   filtrés `q<=2`) — exactement le design "anti-spoiler" déjà prévu par le
   pack émissions du point 11. L'idée originale de pubs/Premium/analyse à
   la mi-temps reste valable comme CONTENU de l'émission (voir point 11),
   simplement sans le volet "choix tactiques" ni le découpage moteur qui
   allait avec — ancien texte de ce point conservé ci-dessous seulement
   pour la trace historique de la décision, ne plus s'y référer pour le
   plan d'implémentation (voir point 11 désormais).

   <details><summary>Ancien texte (avant tranchage, gardé pour mémoire)</summary>

   Idée validée par l'utilisateur (2026-09-23, maquette cliquable faite dans un
   artifact Claude "Écran mi-temps"), pour monétiser la pause sans faire
   fuir les joueurs. Déroulé initialement envisagé : 0:00–0:30 pub
   partenaire (30s, passable en Premium) puis bandeau sponsor persistant ;
   0:30–14:00 analyse + ~~choix tactiques (défense/rythme/discours/cinq de
   départ)~~ (abandonné, voir ci-dessus), gratuit = score par quart + 3
   faits marquants + fautes/fatigue, Premium = analyse complète (conseil
   assistant, comparaison équipes, rapport adversaire) ; 14:00–15:00 pub/
   scores des autres matchs ; reprise à 15:00 + notif push.

   Prérequis toujours valables pour la version "contenu seul" (voir aussi
   point 11) : aucune notion de "Premium" n'existe encore dans le modèle de
   données (`Team`/manager) — à créer. Aucune intégration pub (régie/SDK)
   n'existe dans le code — à choisir avec l'utilisateur avant d'écrire le
   moindre appel.

   </details>

1. **✅ CODE ÉCRIT, TESTÉ EN SANDBOX, pas encore livré sur le Mac — BUG CORRIGÉ : "impossible de mettre un
   remplaçant"** (retour utilisateur relayé via capture d'écran, 2026-09-24,
   poste Pivot, puis précisé : "ça ne le ferait que pour le match de coupe,
   pour le championnat j'ai testé sur 2 matchs ça marche") — **cause
   racine trouvée et corrigée** : `Team.prototype.toggleBackupPosition`
   (engine.js) appelle en interne `this.starterPosition(playerId)` (garde-
   fou : un titulaire ne peut pas aussi être remplaçant) ; `planProxyForRound`
   (moteurbasket3.html — utilisé pour TOUTE journée préparée à l'avance, donc
   TOUJOURS pour un tour de Coupe puisqu'un tour de Coupe n'est jamais "le
   match immédiat", voir son propre commentaire dans renderOrdresGrid) ne
   copiait que `setStarter`/`toggleBackupPosition` sur son proxy, jamais
   `starterPosition` : cliquer "+ Ajouter un remplaçant…" sur une journée
   future levait `TypeError: this.starterPosition is not a function` DANS
   le gestionnaire d'évènement (exception non interceptée → silencieuse
   pour le manager, aucun changement appliqué). Le championnat "marchait"
   parce que le retour utilisateur l'a testé sur le tout prochain match
   (teamA en direct, jamais ce proxy) — un championnat PLUS LOIN dans le
   calendrier aurait le même bug. **Correctif** : ajout de
   `proxy.starterPosition = function (playerId) { return
   Team.prototype.starterPosition.call(proxy, playerId); };` dans
   `planProxyForRound`. **Reproduit puis vérifié corrigé** avec un script ad
   hoc (harnais identique à cup_ordres_planning_test.js, effacé après usage),
   et **nouvelle assertion permanente ajoutée** dans
   `cup_ordres_planning_test.js` (bloc B4bis, choisit explicitement la ligne
   "Pivot" — même poste que la capture d'écran — avec un candidat déjà
   remplaçant ailleurs pour un diff sans ambiguïté) pour que cette régression
   ne puisse plus repasser inaperçue. Suite complète relancée après le
   correctif : 115 passent/1 échec (`ordres_validate_without_edit_test.js`,
   bug pré-existant déjà documenté séparément, sans lien).

2. **⏳ PAS COMMENCÉ — idée à scoper : détail de "comment ils marquent leurs
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

3. **✅ CODE ÉCRIT, TESTÉ EN SANDBOX — pas encore livré sur le Mac — Scouting Pro : analyse des équipes adverses,
   payant + accès gratuit via pub récompensée** — spec détaillée fournie
   par l'utilisateur le 2026-09-24 (rapports de scouting, heatmaps,
   recommandations tactiques auto, simulation d'avant-match, classements
   avancés ORtg/DRtg/pace, accès gratuit via pub récompensée avec
   vérification serveur SSV façon AdMob/AppLovin/Unity Ads). Décisions déjà
   prises par l'utilisateur : **pubs = écran gris de remplacement pour
   l'instant** ("on connectera comme il faut plus tard", donc PAS
   d'intégration réelle AdMob/SSV en v1) ; le découpage mi-temps (point 0
   ci-dessus) est un chantier séparé, en pause.

   **Adaptation à la stack réelle** (la spec fournie suppose une vraie DB/
   backend TypeScript type Mongo — ce dépôt n'a ni l'un ni l'autre) :
   - Pas de `db.unlocks`/`db.tickets` Mongo : persister dans la sauvegarde
     JSON existante (voir server/store.js, `serializeTeam`/`teamFromSave` —
     tout nouveau champ doit être ajouté aux DEUX, sinon régression connue
     du projet, voir l'historique "mes joueurs ne progressent pas").
   - Pas de `userId` : c'est un index d'équipe (`teamIndex`) au sein d'une
     ligue (solo `teams[0]`, ou multi-manager via `X-TipIn-Token`, voir
     `resolvePlayerContext` dans server/index.js).
   - Pas de `matchId` littéral : à composer comme les clés déjà utilisées
     pour `league.liveMatches` (`${round}:${homeIdx}:${awayIdx}`,
     `competition`), voir server/liveMatch.js.
   - "Premium" n'existe nulle part dans le modèle actuel : nouveau champ à
     créer sur Team (ex. `team.scoutingPremium`), avec le MÊME besoin
     d'ajout aux deux fonctions de sérialisation que ci-dessus.
   - Le "SSV + régie pub" complet (AdMob/AppLovin/Unity + CMP RGPD/ATT) est
     HORS SCOPE v1 par décision utilisateur (écran gris) — la logique
     serveur d'accès (plafond quotidien, expiration au coup d'envoi,
     idempotence) doit quand même être construite pour de vrai dès
     maintenant, seul le VRAI appel régie/callback signé est stubé.

   **CORRECTION IMPORTANTE (2026-09-24, après retour utilisateur) — une
   bonne partie de ce chantier existe déjà, à ne pas reconstruire :**
   `computeScoutingTendencies(team)`/`tacticalReportHtml(opponent)`
   (moteurbasket3.html ~L18484+, onglet "Analyse d'équipe" d'une fiche
   équipe adverse) calcule déjà de VRAIES tendances tactiques depuis
   `matchLog` (part de tirs dans la raquette, part de tirs à 3pts + meilleur
   tireur, dépendance du pivot/meneur, part de rebonds offensifs + meilleur
   rebondeur) et les traduit déjà en VRAIS conseils tactiques actionnables
   ("recommandations tactiques auto" de la spec = déjà livré, gratuit pour
   l'instant). Son propre texte dit déjà "Accès gratuit pour l'instant (une
   version payante est prévue)" : ce chantier consiste en grande partie à
   ENFIN construire cette version payante/gratuite-avec-pub autour de
   l'existant, pas à repartir de zéro.

   De même, `Player.emptyStats()`/matchLog persistent déjà PAR JOUEUR ET PAR
   MATCH : `paintAtt`/`paintMade` (sous-ensemble intérieur de fga2/fgm2) ET
   `plusMinus` (engine.js ~L2965). Conséquence sur les 2 points discutés
   avec l'utilisateur :
   - *"Heatmap" redéfinie par l'utilisateur* (tirs intérieur/mi-distance/
     3pts, pas de vraie carte spatiale) : **100% construisible dès
     maintenant, zéro changement moteur.** Intérieur = `paintAtt`/
     `paintMade` (déjà trackés) ; 3pts = `fga3`/`fgm3` (déjà trackés) ;
     mi-distance = `fga2 - paintAtt` / `fgm2 - paintMade` (simple soustraction,
     ces deux zones sont aujourd'hui fondues dans fga2/fgm2). Agrégeable par
     joueur ou par équipe, sur n'importe quelle fenêtre (5/10 derniers
     matchs, ou historique vs un adversaire donné).
   - *+/- par lineup de 5 la plus efficace* : l'utilisateur a raison, le +/-
     PAR JOUEUR existe déjà et est même déjà affiché sur les box scores.
     Ce qui manque vraiment est plus étroit que ce que Claude avait dit :
     seulement "quelle COMBINAISON précise de 5 joueurs" (pas le +/- en
     lui-même). Les événements bruts d'un match (substitutions, qui était
     sur le terrain avec qui) sont JETÉS à la finalisation du match
     (`delete league.liveMatches[key]`) — pas fabriqué, mais pas non plus
     conservé nulle part aujourd'hui : il faudrait calculer et persister ce
     regroupement par lineup AU MOMENT de la finalisation (même famille de
     travail que l'ajout de `quarterScores` ce mois-ci), avant que les
     événements bruts ne disparaissent. **Recommandation Claude (pas encore
     validée par l'utilisateur) : ne pas faire ça en v1** — le +/- par
     JOUEUR (déjà réel, déjà là) suffit largement pour un premier rapport de
     scouting ; le +/- par lineup de 5 peut revenir dans une v2 si le besoin
     se confirme.
   - *Efficacité par type d'action (pick&roll/isolation/poste bas/
     transition/catch&shoot)* : **RETIRÉ du périmètre par l'utilisateur**
     (aucun événement de tir n'est tagué par type d'action aujourd'hui,
     seulement par zone). `team.offensivePriorities` (ex. "Pick & Roll")
     reste utilisable pour le "profil tactique" (donnée réelle = priorité
     configurée par le coach adverse), mais ce n'est pas une efficacité
     MESURÉE par type d'action.
   - *Simulation d'avant-match (probabilité de victoire selon la
     tactique)* : faisable (Monte Carlo via plusieurs appels à
     `MatchEngine.simulate()` avec des réglages tactiques différents) mais
     coûteux en CPU si fait en direct à chaque consultation — à calculer à
     la demande et mettre en cache, pas à chaque affichage.

   Tout le reste de la spec (forme récente, bilan domicile/extérieur,
   séries, rotations réelles depuis matchLog, joueurs clés/blessures/
   fatigue, historique des confrontations, classements avancés ORtg/DRtg/
   Net Rating/pace dérivés des stats déjà trackées) est construisible
   directement depuis les données déjà produites par le moteur, sans
   instrumentation supplémentaire.

   **Décisions confirmées par l'utilisateur (2026-09-24)** : Premium en v1
   = bouton "Passer Pro" factice (flag activé directement, aucun paiement
   réel, à connecter plus tard) ; pubs en v1 = écran gris de remplacement
   (pas de vraie régie/SSV) ; efficacité par type d'action = hors périmètre ;
   +/- par lineup de 5 = exclu de la v1 ("Ok pour le +-").

   **Décision de conception prise par Claude, pas explicitement validée par
   l'utilisateur** : la spec d'origine parlait d'un déblocage "par match à
   venir" (expiration au coup d'envoi) — adapté ici en un déblocage PAR
   ADVERSAIRE (comme le rapport tactique gratuit existant et
   `runVideoSession`, ni l'un ni l'autre lié à un match précis), qui expire
   dès que l'adversaire a rejoué (les données ont changé) plutôt qu'à une
   heure de coup d'envoi précise — plus simple, ne dépend pas du calendrier/
   de la Coupe, et le rapport porte de toute façon sur TOUTE la saison de
   l'adversaire, pas sur un match isolé. À corriger si l'utilisateur préfère
   le calage sur un coup d'envoi précis.

   **Implémenté (2026-09-24)** — vertical slice complet, testé en sandbox :
   - Modèle de données : `Team.scoutingPremium`/`scoutingUnlocks`/
     `scoutingAdWatchLog`/`scoutingAdTickets` (engine.js ET son miroir
     moteurbasket3.html — constructeur + `serializeTeam`/`teamFromSave` des
     DEUX côtés, comme d'habitude pour ce projet).
   - `server/scouting.js` (nouveau, calqué sur le style de
     `server/liveMatch.js`) : accès/péremption, tickets de pub (création +
     complétion idempotente), quota quotidien de 3, bascule Premium,
     construction du rapport (classement, forme récente, bilan domicile/
     extérieur, série en cours, confrontations directes, zones de tir
     intérieur/mi-distance/3pts, joueurs clés avec forme/blessure).
   - Routes serveur : `GET /api/scouting/access`, `GET /api/scouting/report`
     (403 tant que verrouillé — VRAIMENT gaté côté serveur, contrairement au
     rapport gratuit déjà transporté tel quel dans `/api/save`),
     `POST /api/scouting/ad-ticket`, `/ad-complete`, `/set-premium` (via
     server/actions.js + ACTION_ROUTES, server/index.js).
   - UI client (moteurbasket3.html) : panneau "Scouting Pro" sous le rapport
     tactique gratuit existant (sous-onglet Analyse d'une fiche équipe
     adverse) — teaser verrouillé (boutons "Regarder une pub"/"Passer Pro"),
     écran gris de pub factice (15s, décompte calé sur Date.now(), même
     patron que `startCountdown`), rapport complet une fois débloqué, lien
     "Repasser en gratuit (test)". Fonctionne À LA FOIS en solo (logique
     `scoutingLocal*` dupliquée sciemment, même convention "miroir EXACTE"
     que le reste du fichier pour le moteur) et en ligue partagée (routes
     HTTP ci-dessus).
   - Tests : `scouting_pro_test.js` (nouveau) — Partie A moteur pur (quota,
     péremption, idempotence, Premium, contenu du rapport recoupé
     indépendamment depuis league.results/matchLog), Partie B serveur HTTP
     bout en bout, Partie C navigateur jsdom (teaser → pub → débloqué →
     Premium). Tout est vert en sandbox.
   - Visuels réels capturés (Playwright, vrai Chromium headless, pas une
     maquette) et envoyés à l'utilisateur : verrouillé, écran gris, débloqué,
     Premium.

   **Round 2 — "trop simple pour le moment" (retour utilisateur, 2026-09-24,
   3 captures d'écran d'un jeu type BuzzerBeater en référence) — IMPLÉMENTÉ,
   TESTÉ EN SANDBOX, pas encore livré sur le Mac :**
   Décisions confirmées par l'utilisateur (AskUserQuestion + messages
   immédiats) : tableau complet du roster adverse (recommandé) ET graphiques
   stratégies offensive/défensive — OUI ; courbes DMI/forme — NON ("on a pas
   ça dans le jeu") ; en plus, spontanément : carrés rouges/verts pour les
   résultats (au lieu de "V"/"D" texte), carte du terrain pour les zones de
   tir (au lieu du paragraphe texte), carte "5 majeur" de l'adversaire.
   - **Nouveau suivi moteur** (aucun tracking de ce type n'existait avant) :
     `matchLog[].tacticsUsed = {defense, offense, rhythm}` par match et par
     joueur — capturé au moment RÉEL de la simulation
     (`Engine.tacticsSnapshotFor`, appelé dans `simulateOrForfeit`), JAMAIS
     relu depuis `team.defense/offensivePriorities/rhythm` à la finalisation
     (même principe que `quarterScores`, pour éviter qu'un manager qui a déjà
     changé ses ordres pour son PROCHAIN match ne pollue rétroactivement
     l'historique du match précédent). Fil complet :
     `simulateOrForfeit`/`computeLiveMatch` (capture) →
     `finalizeCupRound`/`finalizePlayoffRound`/`finalizeRound`
     (server/liveMatch.js, threadé depuis `live.tacticsUsed` ou
     `sim.tacticsUsed`) → `recordMatchStatsAndAwardMvp`/
     `recordMatchStatsForTeam` (persisté sur chaque `matchLog[]`).
   - `server/scouting.js:aggregateStrategyUsage(team)` (+ mirroir
     `scoutingLocalAggregateStrategyUsage` côté moteurbasket3.html) :
     fréquence attaque/défense/rythme, dédoublonnée par (competition, round)
     — exposée dans `buildScoutingReport` sous `strategyUsage`.
   - Nouveaux visuels côté client (moteurbasket3.html) : carrés colorés
     `.scouting-form-sq` (forme récente + confrontations directes), demi-
     terrain SVG `scoutingShotZoneCourtSvg`/`scoutingShotZoneCourtHtml`
     (3 zones ombrées, remplace le paragraphe texte "Zones de tir : ..."),
     barres de fréquence `scoutingStrategyBarsHtml`, carte "5 majeur"
     `scoutingStartingFiveCardHtml` (réutilise `team.lineup.starters`), et
     réutilisation telle quelle de `teamSeasonStatsTableHtml(opponentIdx)`
     (déjà existante, déjà utilisée pour N'IMPORTE QUELLE équipe sur sa fiche
     détail — pas une donnée nouvellement exposée) pour le tableau complet du
     roster adverse.
   - Tests : `scouting_pro_test.js` étendu — A6 (nouveau, moteur pur :
     `aggregateStrategyUsage` recoupé indépendamment depuis
     `matchLog[].tacticsUsed`, ET vérifie explicitement que changer les
     réglages ACTUELS de l'équipe après coup n'altère pas l'historique déjà
     agrégé) ; C2bis (nouveau, jsdom : les 5 nouveaux visuels sont bien
     rendus, l'ancien paragraphe texte des zones de tir a bien disparu).
     `playRounds` (test + script de captures) threade désormais
     `res.tacticsUsed` comme le fait `finalizeRound` en production. Tout est
     vert en sandbox (scouting_pro_test.js seul, ET suite complète
     `run_final.sh` : 114 passent/2 échecs — les 2 échecs sont
     `disciplinary_ejection_test.js` et `full_run_test.js`, déjà dans la
     liste des tests connus flaky sous charge ci-dessous, confirmés
     indépendants de ce chantier en relançant chacun seul avec succès ;
     `ordres_validate_without_edit_test.js`, échec pré-existant documenté
     séparément, n'a pas non plus de lien avec ce chantier).
   - Nouvelles captures d'écran réelles (Playwright) envoyées à
     l'utilisateur, dont un gros plan dédié sur les nouveaux visuels
     (`scouting-pro-3bis-visuels.png`) — `scouting_pro_screenshots.js` fait
     désormais tourner les réglages tactiques de l'adversaire d'une journée
     à l'autre (démo uniquement) pour peupler le graphique de stratégies de
     plusieurs barres, une IA CPU ne changeant normalement jamais ses
     réglages seule.

   **Round 3 — "pas très beau visuellement" (retour utilisateur, 2026-09-24,
   2 captures d'écran de Football Manager — écran "Centre des données /
   Rapport du recruteur" — en référence) — IMPLÉMENTÉ, TESTÉ EN SANDBOX, pas
   encore livré sur le Mac :**
   Refonte visuelle PURE (mêmes données de rapport qu'au Round 2, rien de
   nouveau côté serveur pour cet écran sauf l'ajout de `id` sur les entrées
   `keyPlayers`/`scoutingLocalKeyPlayers`, nécessaire pour générer l'avatar
   du joueur) — le Round 2 empilait trop de listes en boîtes lourdes
   (réutilisait `.tactical-report-list`, pensée pour des conseils longs, pas
   des lignes de stat courtes) et un mur de texte brut. Inspiré de l'écran
   FM fourni par l'utilisateur (titres de section en majuscules colorées,
   tuiles chiffrées, rangée de cartes avatar avec légende, listes fines sans
   fond) :
   - Titres de section cohérents dans tout le panneau
     (`.scouting-section-title`, majuscules ambre + liseré), remplace les
     usages ponctuels de `.field-label`.
   - Classement/Bilan/Série transformés en 3 tuiles chiffrées
     (`.scouting-kpi-grid`, réutilise `.stat-card` déjà utilisé ailleurs
     dans l'app — pas de nouveau composant visuel) au lieu de 3 paragraphes
     `<p><b>...</b></p>` séparés.
   - Forme récente / confrontations directes : la liste boîte lourde
     dupliquée sous les carrés colorés est remplacée par une liste fine à
     liseré (`.scouting-clean-list`, sans fond, une ligne par match).
   - Zones de tir : le demi-terrain SVG passe de 3 couleurs sans rapport de
     sens (ambre/encre/gris selon un seuil arbitraire) à une SEULE teinte
     (ambre, déjà la couleur d'accent de l'app) dont l'intensité varie avec
     la part de tirs — plus sobre, plus proche de l'esthétique FM (rouge/
     vert réservés à un vrai signal directionnel, jamais utilisés ici pour
     un simple classement à 3 couleurs). **Bug corrigé en cours de route** :
     la première version empilait 3 formes pleines superposées (raquette
     PAR-DESSUS mi-distance PAR-DESSUS 3pts), donc la raquette cumulait
     toujours les 3 opacités et paraissait la plus foncée quelle que soit sa
     vraie part de tirs — corrigé en peignant chaque zone comme un vrai
     ANNEAU par soustraction (fill-rule evenodd, deux sous-tracés), même
     principe que `radarChartSvg`/`ringPolygonPath` déjà utilisé ailleurs
     dans ce fichier pour le radar de caractéristiques.
   - Joueurs clés : passe d'une liste texte boîte lourde à une rangée de
     cartes avatar (`scoutingKeyPlayersRowHtml`, réutilise `playerAvatarHtml`
     déjà utilisé ailleurs dans l'app) avec légende "Meilleur marqueur" sur
     le n°1 uniquement — AUCUNE nouvelle catégorie inventée (le jeu ne
     distingue pas meilleur passeur/rebondeur séparément, contrairement à
     FM ; les autres cartes restent juste ordonnées par pts/match, sans
     légende fictive).
   - Tests : `scouting_pro_test.js` (Partie A6, Partie C2bis) tous verts
     sans modification — la refonte ne change que la présentation, pas les
     données. Suite complète relancée : 115 passent/1 échec
     (`ordres_validate_without_edit_test.js`, bug pré-existant documenté
     séparément, sans lien avec ce chantier — voir "Repères techniques"
     ci-dessous).
   - Nouvelles captures d'écran (Playwright) envoyées à l'utilisateur.

   **Round 4 — 3 retours ciblés sur le Round 3 (2026-09-24)** —
   IMPLÉMENTÉ, TESTÉ EN SANDBOX, pas encore livré sur le Mac :
   - **"le terrain avec les zones de tirs est affreux, prend le terrain
     qu'on a dans ordres (mais réduis la taille)"** : `scoutingShotZoneCourtSvg`
     réécrite pour réutiliser EXACTEMENT le tracé FIBA de `COURT_SVG` (déjà
     utilisé par la feuille de match `.lineup-court` ET par le profil joueur
     `.pdp-court` — mêmes 7 lignes de tracé, mêmes coordonnées, viewBox
     "0 0 150 140", panier en haut), au lieu d'un demi-terrain "maison" aux
     proportions/couleurs ratées. Les 3 zones restent peintes en anneaux
     (fill-rule evenodd, héritage du Round 3) mais désormais DANS le même
     repère de coordonnées que `COURT_SVG`, dessinées AVANT son tracé (donc
     sous les lignes). Nouvelle classe `.scouting-shot-court` (largeur fixe
     130px) enveloppe `.pdp-court` (déjà le variant compact/lecture-seule
     existant) pour réduire sa taille — `.pdp-court` seul remplit 100% de
     son conteneur, beaucoup trop large ici tel quel.
   - **"les conseils tactiques mets les en bas"** : dans
     `teamDetailAnalyseHtml`, le rapport tactique gratuit
     (`tacticalReportHtml`) et le panneau Scouting Pro
     (`#scoutingProPanel`) ont simplement échangé leur ordre — Scouting Pro
     ouvre maintenant le sous-onglet Analyse, le rapport tactique gratuit le
     ferme. Nouvelle assertion `scouting_pro_test.js` (C1) : vérifie
     l'ordre DOM réel via `compareDocumentPosition` (pas juste la présence
     des deux blocs), pour que ce choix reste testé et ne régresse pas
     silencieusement à un futur refactor.
   - **"évite d'avoir des trucs au dessus de la barre du haut"** — PAS un
     bug de rendu du jeu lui-même : `.topbar` est `position:sticky` (voir
     son CSS), et `scouting_pro_screenshots.js` prenait la capture
     "3bis" via `page.locator("#scoutingProPanel").screenshot(...)` — un
     élément plus haut que le viewport, que Playwright capture en
     défilant/recomposant par morceaux (comportement documenté), ce qui
     pouvait laisser la barre du haut "recollée" en double dans l'image
     recomposée. Corrigé en agrandissant temporairement le viewport
     (hauteur = position du panneau + sa hauteur totale, mesurée après un
     `scrollTo(0,0)`) juste avant CETTE capture précise, pour que tout le
     panneau tienne d'un coup sans le moindre défilement — remis à la
     taille normale juste après pour ne pas affecter les autres captures.
   - Tests : `scouting_pro_test.js` — assertion mise à jour pour le nouveau
     sélecteur du terrain (`.scouting-shot-court svg` au lieu de l'ancienne
     `.scouting-court-svg`, classe qui n'existe plus), nouvelle assertion
     d'ordre DOM (C1, ci-dessus). Suite complète relancée : 114 passent/2
     échecs (`disciplinary_ejection_test.js` + `ordres_validate_without_edit_test.js`,
     tous deux déjà connus/documentés séparément, confirmés indépendants de
     ce chantier).
   - Nouvelles captures d'écran envoyées à l'utilisateur.

   **Round 5 — 4 retours ciblés (2026-09-24)** — IMPLÉMENTÉ, TESTÉ EN
   SANDBOX, pas encore livré sur le Mac :
   - **"il faudrait que la zone de tir soit à côté de la forme récente pour
     boucher le vide qu'il y a à cet endroit"** : dans `scoutingProReportHtml`,
     "Forme récente" et "Zones de tir" sont sorties de leurs sections
     séparées et placées côte à côte dans une même rangée flex
     (`.scouting-two-col`/`.scouting-two-col-item`, repasse en pile
     verticale sous ~640px). La carte de terrain reste étroite (130px,
     héritage du Round 4) donc laissait un grand vide à droite de la liste
     de forme — comblé.
   - **"le rapport tactique doit être en bas après les stats des joueurs.
     mais il faudrait l'étoffer un peu plus et surtout le rendre plus
     beau"** : l'ordre (Scouting Pro puis rapport tactique) était déjà bon
     depuis le Round 4 (assertion C1). `tacticalReportHtml` était resté au
     style Round 2 (`.tactical-report-list`, `<li>` boîtes lourdes), jamais
     mis à jour lors de la refonte FM du Round 3 — corrigé : chaque tendance
     (part de tirs raquette, dépendance pivot/meneur/tir à 3pts, part de
     rebonds offensifs) s'affiche maintenant avec une barre chiffrée
     (réutilise `.scouting-strategy-row/-track/-fill`, déjà construit pour
     "Stratégies utilisées") + son conseil en dessous, sous un titre
     `.scouting-section-title` cohérent avec le reste du panneau — même
     langage visuel partout sur la page. CSS : labels de barre élargis pour
     ce contexte (`.tactical-insight .scouting-strategy-label`, 230px au
     lieu de 150px) car les libellés ("Tirs raquette venant du pivot"...)
     sont plus longs que les noms de réglages tactiques courts d'origine —
     sans ça ils étaient tronqués ("Tirs raquette venant du pi…").
     `.tactical-report-list`/`li` (CSS mort, plus aucun usage) retirées.
   - **"et il faut ajouter une suggestion de compo aussi"** : nouvelle
     fonction `suggestTacticalSetup(t)` — synthétise une défense d'équipe
     recommandée + jusqu'à `MAX_WATCH_ASSIGNMENTS` (3) consignes de
     surveillance ciblées par poste, à partir des MÊMES seuils déjà utilisés
     dans les conseils texte historiques (rien de nouveau inventé, juste
     rassemblé en une recommandation actionnable unique) : défense Zone
     intérieure/extérieure/Homme à homme selon `paintSharePct`, consignes
     "Empêcher le post-up" (pivot), "Coller sur les pénétrations" (meneur),
     "Harceler le tir extérieur" (meilleur tireur à 3pts, seuil ≥40%),
     "Priorité au rebond" (poste le plus actif au rebond offensif, seuil
     ≥32%) — dédoublonnées par poste. Ajout mineur à
     `computeScoutingTendencies` : `topShooterPosition` (le poste du
     meilleur tireur à 3pts, déjà présent dans l'agrégation `byPlayer`
     interne, juste jamais exposé) — nécessaire car une consigne de
     surveillance cible un POSTE (`Team.watchAssignments`), pas un nom de
     joueur seul. Rendu en `.tactical-suggestion` (encart) + `.scouting-clean-list`
     (déjà utilisé ailleurs) pour les consignes.
   - **"et mets des couleurs pour la carte zone de tir (couleur par
     zone)"** : revient sur le choix Round 3 d'une teinte ambre unique —
     `scoutingShotZoneCourtSvg`/`scoutingShotZoneCourtHtml` utilisent
     maintenant `SCOUTING_ZONE_COLORS` (intérieur = `var(--teamB)` corail,
     mi-distance = `var(--amber)`, 3 points = `var(--teamA)` turquoise) —
     3 couleurs DÉJÀ définies dans le thème (`:root`), aucune couleur
     inventée. La légende utilise les mêmes couleurs que la carte (pastille
     assortie). La technique d'anneaux par soustraction (fill-rule evenodd,
     correctif Round 3) est inchangée, seule la couleur de remplissage
     change par zone au lieu d'une teinte unique.
   - Tests : `scouting_pro_test.js` — aucune assertion cassée par ces 4
     changements (aucun test n'inspectait le contenu interne de
     `tacticalReportHtml`/l'ordre Forme récente vs Zones de tir). Suite
     complète relancée : 115 passent/1 échec
     (`ordres_validate_without_edit_test.js`, bug pré-existant documenté
     séparément, confirmé indépendant de ce chantier).
   - Nouvelles captures d'écran (Playwright) envoyées à l'utilisateur.

   **Round 6 — 2 retours ciblés sur les visuels du Round 5 (2026-09-24)** —
   IMPLÉMENTÉ, TESTÉ EN SANDBOX, pas encore livré sur le Mac :
   - **"enlève la légende, mets juste la carte en plus grand"** (carte
     "Zones de tir") : `scoutingShotZoneCourtHtml` ne rend plus que la carte
     (la légende texte à côté — part de tirs + % réussite détaillé par
     zone — est retirée ; les % par zone restent lisibles directement SUR la
     carte, étiquettes déjà peintes par `scoutingShotZoneCourtSvg`).
     `.scouting-shot-court` élargie de 130px à 240px pour occuper l'espace
     libéré. CSS mortes retirées : `.scouting-court-wrap`/
     `.scouting-court-legend(-row)`/`.scouting-court-swatch` (plus aucun
     usage).
   - **"les joueurs clés doivent être centré sur la page (pas tout à
     gauche)"** : `.scouting-leaders-row` passe de gauche (par défaut, pas
     de `justify-content`) à `justify-content:center` — la rangée ne
     remplit pas forcément toute la largeur (1 à 3 cartes selon l'effectif
     adverse), donc restait collée à gauche sans ça.
   - **Question utilisateur (pas un bug) : "5 matchs suivi ? c'est pour
     l'exemple ou c'est tjrs 5 matchs ? il faudrait qu'il y ait tous les
     matchs de la saison hors matchs amicaux"** — vérifié dans le code,
     AUCUN changement nécessaire : `aggregateStrategyUsage`/
     `scoutingLocalAggregateStrategyUsage` (server/scouting.js /
     moteurbasket3.html) agrègent déjà l'INTÉGRALITÉ de `matchLog` (jamais
     tronqué/pruné, voir `recordMatchStatsAndAwardMvp` — uniquement des
     `push`, aucun `slice`/`shift`), championnat ET coupe confondus (dédupe
     par `${competition}|${round}`). Le "5" affiché dans les captures vient
     uniquement de `scouting_pro_screenshots.js` : la sauvegarde de démo n'a
     que 5 journées jouées (`playRounds(lg, 5, ...)`), pur artefact de
     données de démo. Les "matchs amicaux" ne sont PAS encore une
     fonctionnalité du jeu (onglet "Matchs amicaux" du menu, explicitement
     marqué "Pas encore disponibles" — voir `PLACEHOLDER_TEXT.amicaux`) :
     `matchLog[].competition` ne vaut aujourd'hui que `"championship"` ou
     `"cup"`, jamais `"friendly"`/`"amical"` — rien à exclure pour l'instant.
     À REVISITER quand les matchs amicaux seront implémentés : leur ajouter
     un tag de compétition dédié et l'exclure explicitement de
     `aggregateStrategyUsage` (et des autres agrégations `matchLog` de ce
     panneau) à ce moment-là.
   - Tests : `scouting_pro_test.js` vert (aucune assertion sur les classes
     de légende retirées). Suite complète relancée : 115 passent/1 échec
     (`ordres_validate_without_edit_test.js`, toujours le même bug
     pré-existant documenté séparément).
   - Nouvelle capture d'écran envoyée à l'utilisateur.

   **Round 7 — couleurs des zones de tir reprises + 5 de départ suggéré
   (2026-09-24)** — IMPLÉMENTÉ, TESTÉ EN SANDBOX, pas encore livré sur le
   Mac :
   - **"mets des couleurs plus sympa sur les zones de tir, ça ne va pas
     avec le reste je trouve"** — la palette du Round 5
     (`--teamB`/`--amber`/`--teamA`, réutilisant tels quels des tokens déjà
     chargés de sens ailleurs — identité domicile/extérieur, victoire/
     défaite via `--ok`/`--danger`) est remplacée par une palette DÉDIÉE
     (`--court-zone-inside/-mid/-three`, voir `:root`) : ocre brûlé pour
     l'intérieur (même famille chaude que l'ambre de l'app), l'ambre de
     l'app inchangé pour la mi-distance, un bleu pour le tir à 3 points
     (contraste chaud/froid intentionnel, sans reprendre le teal saturé
     rejeté). Validée avec `scripts/validate_palette.js` de la skill
     `dataviz` (mode dark, surface `--panel`) : séparation CVD/vision
     normale/contraste toutes au vert (seul l'ambre ressort de la bande de
     luminosité générique du validateur — sans surprise, c'est la couleur
     d'accent établie de toute l'app, déjà éprouvée ailleurs sur ce même
     fond, pas une raison de la changer ici). `scoutingShotZoneCourtSvg`
     et sa légende utilisent maintenant ces mêmes tokens (couleur de
     légende assortie à sa zone).
   - **"dans la suggestion de compo, il faut aussi suggérer un 5 de
     départ"** — nouvelle fonction `suggestStartingFive(team, now)` :
     meilleur joueur DISPONIBLE (non blessé) par poste dans `teamA` (JAMAIS
     l'équipe analysée — une suggestion de compo porte toujours sur MES
     propres joueurs), même logique que `Team.autoAssignLineup()` côté
     moteur (meilleur `.overall()` par poste) mais purement EN LECTURE
     (ne modifie jamais `team.lineup`, contrairement à `autoAssignLineup`)
     et qui exclut en plus les joueurs blessés. Affichée dans
     "Composition tactique recommandée" en réutilisant le même tableau que
     "5 majeur" (`scoutingStartingFiveCardHtml`, désormais paramétrable via
     un `startersOverride` optionnel au lieu de toujours lire
     `team.lineup.starters`).
   - Questions utilisateur (pas des bugs) traitées en texte, sans code :
     précision sur "off+déf" (rebonds totaux = offensifs + défensifs
     confondus, dénominateur du % de rebonds offensifs) ; ré-explication
     des jauges de "Tendances observées" (chaque jauge = un % indépendant
     sur 100, pas relatif aux autres). Voir aussi l'item "À faire" séparé
     pour la demande "comment ils marquent leurs points" (pas réalisable
     avec les données actuelles, nécessite une vraie instrumentation du
     moteur — PAS traité ce round).
   - Tests : `scouting_pro_test.js` vert. Suite complète relancée deux fois
     (après les couleurs, puis après le 5 suggéré) : 115 passent/1 échec à
     chaque fois (`ordres_validate_without_edit_test.js`, même bug
     pré-existant documenté séparément — sans lien avec ces changements).
   - Nouvelles captures d'écran envoyées à l'utilisateur.

   **Round 8 — nouvelle section "Comment les attaquer" (2026-09-24)** —
   IMPLÉMENTÉ, TESTÉ EN SANDBOX, pas encore livré sur le Mac :
   - **"je trouve que ça manque d'un vrai conseil tactique en fait, là on
     voit des stats mais on ne nous dit pas quoi faire"**, avec l'exemple
     "sur les aides défensives il n'aident, il faut forcer la pénétration
     et provoquer des fautes" — jusqu'ici tout le rapport tactique ne
     disait QUE comment DÉFENDRE l'adversaire (à partir de SES tendances
     OFFENSIVES). Ajout de l'autre moitié : comment l'ATTAQUER, à partir
     de ce qu'il produit RÉELLEMENT en défense cette saison (`matchLog`
     suit déjà `pf`/`blk`/`stl`/`dreb` par match, voir `emptyStats()` côté
     moteur — jamais exploité côté scouting jusqu'ici).
   - Nouveaux champs dans `computeScoutingTendencies` :
     `foulsPerGame`/`blocksPerGame`/`stealsPerGame`/`drebPerGame` (moyennes
     par match, agrégées depuis `matchLog`). Nouvelle fonction
     `suggestOffensiveApproach(t)` qui en tire jusqu'à 4 conseils
     actionnables : fautes fréquentes → forcer la pénétration/provoquer la
     faute (l'exemple exact de l'utilisateur) ; défense disciplinée → ne
     pas compter sur la ligne ; faible protection du cercle → attaquer la
     raquette sans crainte ; protection du cercle solide → privilégier tir
     extérieur/kick-out ; interceptions fréquentes → sécuriser la balle ;
     rebond défensif faible/solide → crasher ou lever le pied au rebond
     offensif. Seuils calibrés avec un script jetable simulant une saison
     complète (10 équipes × 16 matchs) pour caler les bornes basses/hautes
     sur des valeurs réellement observées, pas inventées au hasard.
   - Délibérément PAS basé sur le réglage actuel `team.helpDefense` (ce
     serait lire le panneau Ordres de l'adversaire en direct, jamais fait
     nulle part ailleurs dans Scouting Pro) — uniquement des stats
     défensives RÉELLEMENT produites, cohérent avec le principe déjà en
     place pour tout le reste du rapport.
   - Nouvelle section "Comment les attaquer", même langage visuel
     (`.tactical-insight`, `.scouting-section-title`) mais sans barre
     chiffrée (ce sont des rythmes par match, pas des parts en %).
   - **Correction (même jour, retour utilisateur juste après) : "Comment
     les attaquer doit être sur le scouting pro en bas après les carac de
     l'effectif"** — déplacée de `tacticalReportHtml` (carte "Rapport
     tactique" séparée, affichée SOUS le panneau Scouting Pro) vers
     `scoutingProReportHtml`, en tout dernier, après "Effectif complet —
     statistiques de la saison" (juste avant `scoutingProDowngradeHtml()`).
     Recalculée dans `scoutingProReportHtml` via
     `suggestOffensiveApproach(computeScoutingTendencies(oppTeam))` (mêmes
     fonctions, jamais dupliquées) ; retirée de `tacticalReportHtml`, donc
     absente de la vue "Analyse" de sa PROPRE équipe (pas de panneau
     Scouting Pro pour soi-même — cohérent, on ne s'attaque pas soi-même).
   - Tests : `scouting_pro_test.js` et `tactical_scouting_report_test.js`
     verts. Suite complète relancée deux fois (ajout initial, puis
     déplacement) : 115 passent/1 échec à chaque fois
     (`ordres_validate_without_edit_test.js`, même bug pré-existant
     documenté séparément — sans lien).
   - Nouvel aperçu HTML statique + captures envoyés à l'utilisateur.

   **Round 9 — stats collectives avancées (2026-09-24)** — IMPLÉMENTÉ, TESTÉ
   EN SANDBOX, pas encore livré sur le Mac. Demande initiale en 10 points :
   "1. Ajouter les stats collectives avancées [...] 2. Ajouter un bloc 'ADN
   de l'équipe' [...] 3. Montrer la dépendance aux joueurs [...] 4. Ajouter
   les performances par contexte [...] 5. Ajouter les 'matchups' [...] 6.
   Ajouter une vraie analyse des tirs [...] 7. Ajouter les tendances
   récentes [...] 8. Ajouter 'comment Rennes marque/encaisse' [...] 9.
   Ajouter un 'indice de danger' [...] 10. 'Points à surveiller'" — après
   évaluation de la faisabilité (voir ci-dessous), retour utilisateur : "Tu
   dois faire ce pour quoi on a les données. Le reste on verra plus tard."

   **Ce qui EST fait**, tout dans une nouvelle fonction
   `computeScoutingAdvancedStats(team, teamIdx)` (moteurbasket3.html, juste
   après `computeScoutingTendencies`) + fonctions de rendu dédiées, appelées
   depuis `scoutingProReportHtml` :
   - **Point 1 (stats avancées)** : eFG%, TS%, % LF, TOV% (formule Dean
     Oliver), ratio passes/pertes, points dans la raquette (`paintMade`
     existait déjà côté moteur mais n'était utilisé nulle part), ORtg/DRtg/
     Net Rating/Pace (Poss ≈ FGA−OREB+TOV+0,44×FTA, formule standard).
     Tuiles `.scouting-kpi-grid`/`.stat-card` (mêmes briques que Classement/
     Bilan/Série).
   - **Point 2 (ADN de l'équipe)** : carte "Profil <équipe>" — Rythme
     (depuis Pace), Orientation intérieur/extérieur (depuis `paintSharePct`,
     mêmes seuils que `suggestTacticalSetup`), Dépendance au tir à 3 pts,
     Jeu intérieur, Création (meilleur passeur), Force/Faiblesse (seuils
     calibrés empiriquement, script jetable simulant une saison complète de
     10 équipes). **PAS de "Défense : mix homme-à-homme/zone"** malgré
     l'exemple fourni : ce serait exposer le réglage tactique ACTUEL de
     l'adversaire, jamais fait nulle part ailleurs dans Scouting Pro par
     décision explicite antérieure — expliqué à l'utilisateur.
   - **Point 3 (dépendance aux joueurs)** : "Répartition offensive" (top 3
     scoreurs, % des points/tirs de l'équipe, +/- moyen sur le terrain
     depuis `Player.matchLog[].plusMinus` — **PAS un vrai split avec/sans
     lui**, ce n'est pas tracké, documenté comme tel).
   - **Point 4 (contexte)** : Domicile/Extérieur (points marqués/encaissés,
     %tir, %3pts, pertes, rebonds) ET 1re/2e mi-temps (points uniquement —
     bonne surprise : `quarterScores` est déjà stocké de façon PERMANENTE
     dans chaque `matchLog`, jamais exploité côté scouting jusqu'ici ; pas
     de détail %tir/pertes par mi-temps, non tracké).
   - **Point 6 (analyse des tirs)** : table volume/%/points-par-tir pour les
     3 zones déjà utilisées par la carte de terrain (Cercle/raquette,
     Mi-distance, 3 points), affichée juste sous elle.
   - **Point 7 (tendance récente)** : 3 derniers matchs de championnat vs
     moyenne saison (même scope), points marqués/encaissés/%tir/%3pts.
   - **Point 10 (points à surveiller)** : synthèse texte combinant les
     signaux déjà calculés (dépendance au top scoreur, meilleur tireur à 3
     pts, dépendance équipe au 3pts, joueur avec beaucoup de rebonds mais
     faible %2pts, équipe qui encaisse plus qu'elle ne marque à domicile,
     série de défaites en championnat) — jamais toutes générées
     systématiquement, une phrase par signal qui dépasse un seuil notable.
     Placée juste avant "Comment les attaquer", en toute fin de rapport.

   **Portée à deux vitesses, assumée et documentée dans le code** (voir le
   grand commentaire de `computeScoutingAdvancedStats`) : tout ce qui ne
   regarde QUE la propre production de l'équipe (eFG%/TS%/TOV%/zones/
   répartition joueurs) reste toute-compétition confondue, comme
   `computeScoutingTendencies` déjà en place ; tout ce qui a besoin du score
   adverse ou du statut domicile/extérieur (ORtg/DRtg/Pace/splits dom-ext/
   mi-temps/tendance récente) se limite au CHAMPIONNAT — même restriction
   déjà en place pour `recentFormFor`/`homeAwayRecordFor`/`streakFor`
   (server/scouting.js, commentaire déjà existant : "la Coupe ne tient pas
   ce même registre à plat, hors scope v1").

   **Ce qui n'est PAS fait, explicitement, avec la raison donnée à
   l'utilisateur** :
   - **Points 8 ("comment ils marquent/encaissent" par type d'action —
     pick&roll/transition/2nd chance/pertes adverses)** : le moteur ne tague
     JAMAIS l'origine d'un tir, seulement sa zone — déjà documenté comme
     chantier séparé (voir item "À faire" #2 plus haut), nécessite une vraie
     instrumentation du moteur de simulation. PAS traité.
   - **Point 5 (matchups avec étoiles ⭐)** : demanderait d'inventer une
     méthode de notation subjective (pas une vraie donnée trackée) — mis de
     côté pour une discussion de conception séparée plutôt que de sortir un
     chiffre arbitraire.
   - **Point 9 (indice de danger, "Menaces"/"Vulnérabilités")** : délibérément
     PAS fait en tant que section séparée — aurait fortement dupliqué le
     contenu de "Force/Faiblesse" (ADN) et "Comment les attaquer" (Round 8)
     sans info nouvelle réelle. Expliqué à l'utilisateur plutôt que livré en
     doublon.

   **Nouveaux champs par joueur** (moteurbasket3.html,
   `computeScoutingAdvancedStats`) : `fga2/fgm2/fga3/fgm3/oreb/dreb` PAR
   JOUEUR (jamais trackés par joueur avant, seulement au niveau équipe par
   `computeScoutingTendencies`) — utilisés pour les % de tir individuels
   affichés dans "Répartition offensive"/"Points à surveiller".

   **Refactor mineur** : `matchResultForLogEntry` délègue maintenant à une
   nouvelle `matchContextForLogEntry` (même recherche round/compétition,
   expose en plus `isHome`) au lieu de dupliquer la recherche — nécessaire
   pour les splits domicile/extérieur/mi-temps.

   **Tests** : nouveau fichier permanent `scouting_advanced_stats_test.js` —
   scénario à la main (2 matchs de championnat + 1 match de Coupe aux
   chiffres délibérément énormes) avec calcul INDÉPENDANT (jamais comparer
   la production à elle-même), vérifie explicitement que le match de Coupe
   est bien INCLUS dans eFG%/TS%/%LF mais bien EXCLU de Pace/ORtg/DRtg/Net
   Rating/splits domicile-extérieur/mi-temps/tendance récente (la portée à
   deux vitesses). `scouting_pro_test.js`/`tactical_scouting_report_test.js`
   toujours verts. Suite complète : 116 passent/1 échec
   (`ordres_validate_without_edit_test.js`, même bug pré-existant documenté
   séparément — sans lien).
   - Nouvel aperçu HTML statique + captures envoyés à l'utilisateur.

   **Refonte visuelle (même jour, retour utilisateur juste après avoir vu
   les captures) : "faut refaire la partie là, c'est pas beau. fais un truc
   plus sexy"** (tuiles "Stats avancées" + liste "Profil <équipe>"), suivi
   de **"enlève ça, on les a déjà après"** (capture recadrée sur une rangée
   de carrés V/D teal en double dans "Forme récente") :
   - `scoutingTeamProfileHtml` refondue : abandon de la liste empilée de 7
     blocs `.tactical-insight` identiques, remplacée par une grille de 5
     puces compactes `.scouting-profile-grid`/`.scouting-profile-chip`
     (Rythme/Orientation/Dépendance 3pts/Jeu intérieur/Création) + 2 cartes
     pleine largeur `.scouting-profile-callout` colorées pour Force
     (bordure gauche verte, "▲ Force") et Faiblesse (bordure gauche rouge,
     "▼ Faiblesse"). Skill `dataviz` appliquée (couleur jamais seule :
     toujours associée à un chevron + libellé).
   - Tuile Net Rating dans `scoutingAdvancedStatsTilesHtml` mise en avant
     conditionnellement (`.stat-card-highlight` + bordure/texte `-ok`/
     `-danger` selon le signe de la note).
   - Suppression de la rangée compacte de carrés `.scouting-form-seq` dans
     "Forme récente" (doublonnait les mêmes carrés déjà affichés dans la
     liste détaillée `.scouting-clean-list` juste en dessous — bug
     pré-existant, pas introduit ce round, devenu plus visible avec un
     rapport désormais bien plus long) ; CSS morte `.scouting-form-seq{...}`
     retirée aussi.
   - Tests : `scouting_pro_test.js` et `scouting_advanced_stats_test.js`
     verts. Suite complète relancée deux fois (un faux-négatif
     `disciplinary_ejection_test.js` au premier passage — déjà documenté
     flaky ci-dessous, confirmé passant seul et sans lien) : 116 passent/1
     échec connu (`ordres_validate_without_edit_test.js`).
   - Nouvel aperçu HTML + captures envoyés à l'utilisateur.

   **Refonte v4 (même jour, retour utilisateur après avoir vu le rendu
   complet) : "y a encore du boulot, ce n'est pas très beau" / "ça fait
   trop IA et trop vieux en même temps"** — diagnostic (pas juste un
   ravalement) : la v3 empilait ~15 mini-sections identiques (même
   triptyque libellé tout-caps ambre + ligne fine + contenu, répété en
   boucle du haut en bas de la page — le réflexe "dashboard générique"
   qu'une IA produit par défaut) et une grille de 7 tuiles `.stat-card`
   carrées identiques pour "Stats avancées" (LE cliché le plus
   reconnaissable du genre) ; barres plates + lignes fines partout
   donnaient en plus un côté daté (BI/admin 2015). Rien de nouveau côté
   données, uniquement la présentation :
   - nouveau niveau "panneau" (`.scouting-panel`, fond `--panel-2`, coins
     arrondis 14px) qui regroupe les sections par thème au lieu de les
     enchaîner à plat : **Profil & style de jeu** (stats avancées + ADN) /
     **Forme & confrontations** (forme récente + zones de tir + tendance +
     confrontations) / **Contexte & stratégies** (domicile-extérieur +
     mi-temps + stratégies utilisées) / **Effectif** (joueurs clés +
     répartition offensive + 5 majeur + effectif complet) / **Analyse
     tactique** (points à surveiller + comment les attaquer) —
     `scoutingProReportHtml` réorganisée en conséquence, mêmes fonctions de
     rendu réutilisées telles quelles ;
   - `.scouting-panel-title` (nouveau) porte la vraie rupture visuelle :
     liseré vertical ambre + libellé en casse normale (pas tout-caps) —
     avant répété identiquement à CHAQUE sous-titre ;
   - `.scouting-section-title` (sous-titre à l'intérieur d'un panneau)
     redevient discret : majuscules et ligne de séparation retirées, juste
     un petit libellé ambre qui ponctue sans crier ;
   - `scoutingAdvancedStatsTilesHtml` refondue : abandon de la grille de 7
     boîtes carrées identiques (`.scouting-kpi-grid`) au profit de Net
     Rating + Pace en grand format (`.scouting-hero-stat`, les 2 chiffres
     qui résument le style de l'adversaire) puis le reste (ORtg/DRtg/eFG%/
     TS%/%LF/TOV%/Passes-pertes/Pts raquette) en bandeau compact de puces
     (`.scouting-stat-strip`, grille avec bordures fines façon "ticker" de
     stats plutôt que des boîtes répétées). Détail passes/match·pertes/
     match qui accompagnait "Passes/Pertes" en v3 retiré du libellé pour
     garder la puce dense (donnée toujours disponible ailleurs dans le
     rapport, rien perdu).
   - Tests : suite complète relancée après la refonte, **116 passent/1
     échec connu** (`ordres_validate_without_edit_test.js`, sans lien),
     aucune régression.
   - Nouvel aperçu HTML + captures envoyés à l'utilisateur pour retour.

   **⏸️ Retour visuel mis en pause (retour utilisateur, 2026-09-24) : "note
   ce qu'on s'est dit on en reparle plus tard"** — la refonte v4 ci-dessus
   est livrée et testée, mais l'utilisateur n'a pas encore validé le rendu
   (envoyé pour retour, pas de réponse avant qu'il ne passe à d'autres
   sujets) — NE PAS relancer une nouvelle itération visuelle sans qu'il en
   reparle explicitement.

   **Reste à faire** : synchroniser sur le Mac (pont déconnecté pendant
   toute cette session, y compris les deux refontes — à revérifier à la
   prochaine connexion), puis donner les commandes commit/push à
   l'utilisateur (le push reste toujours fait par lui-même). Fichiers
   concernés à synchroniser : `moteurbasket3.html`,
   `scouting_advanced_stats_test.js` (nouveau), `DEV_NOTES.md`.

4. **✅ LIVRÉ SUR LE MAC** (statut corrigé le 2026-09-25 : `pas encore
   livré` ci-dessous était périmé — confirmé déjà en production par grep
   direct sur `engine.js` du Mac, `assistChanceByQuality`/0.78-0.42-0.12
   présent, et par `git log` : plusieurs commits déjà poussés depuis)
   **— Taux d'assists (passes décisives) beaucoup trop faible** — retour utilisateur
   (2026-09-24) : "c'est très très faible. je veux bien que les joueurs ne
   soient pas forts, mais ils jouent contre d'autres joueurs pas forts. en
   euroleague la saison dernière les 5 premiers avait entre 7,4 pd et 5,7
   pd" (capture d'écran : meneur à 2.0 pd/match, le reste du top 5 à 1.7).
   Deux causes cumulées trouvées dans `engine.js`, corrigées ensemble :
   - une passe décisive n'était JAMAIS créditée sur un tir "contesté"/"très
     contesté" (seul "ouvert", ~40% des tirs marqués, était éligible) —
     élargi aux 3 paliers avec une probabilité dégressive par qualité
     (0.78/0.42/0.12, calibrée empiriquement) ;
   - le choix du "créateur" du tir (qui peut être crédité de la passe)
     était un tirage QUASI-UNIFORME entre les 4 coéquipiers sur le terrain,
     pondéré linéairement par Passe+Vision — beaucoup trop plat comparé au
     choix du tireur (déjà concentré via une puissance 2.1). Passé à une
     concentration comparable (puissance 2.3) : le meneur/meilleur passeur
     du cinq domine maintenant nettement le tirage, comme en vrai.
   - Calibration (script jetable, 20 équipes × 38 matchs, jamais commité) :
     top 5 passeurs mesuré à 7.32/6.13/5.24/5.13/4.95 pd/match (moyenne
     5.75) contre le repère utilisateur 5.7-7.4 — même ordre de grandeur,
     meilleur passeur quasi identique au repère réel. Taux d'équipe passé
     de ~27.6% à ~55.3% des tirs marqués assistés (repère toutes ligues
     confondues : ~55-65%).
   - Tests : suite complète relancée, 116 passent/1 échec connu
     (`ordres_validate_without_edit_test.js`, sans lien), aucune régression.
   - **Reste à faire** : synchroniser sur le Mac (pont déconnecté), donner
     les commandes commit/push à l'utilisateur.

5. **✅ LIVRÉ SUR LE MAC** (statut corrigé le 2026-09-25, même vérification
   que le point 4 : `nonShootingFoulChance` confirmé présent dans
   `engine.js` du Mac) **— Nombre de fautes par match trop faible** —
   retour utilisateur (2026-09-24) :
   "il y a généralement très peu de fautes par match. on est plutôt à
   18/20 par matchs en moyenne", puis précisé plus tard : "après faut pas
   être toujours à 19/20 fautes, ça peut être 10 comme 30 mais en moyenne
   c'est 18/20" (variance attendue, pas un plateau figé). Cause racine :
   aucun mécanisme de faute HORS TIR n'existait dans `engine.js`
   (`grep -n "\.pf++"` ne trouvait que `shootingFoul` et le mécanisme de
   faute intentionnelle de fin de match) — seules les fautes sur tir
   étaient possibles.
   - Ajout de `nonShootingFoulChance` dans `playPossession` (probabilité
     0.125 par possession, calibrée empiriquement) : cible un attaquant
     (pondéré dribble+passe), un défenseur (pondéré par ses fautes
     restantes avant l'exclusion), logue la faute, PUIS laisse l'action se
     poursuivre vers le tir dans la MÊME itération (pas de `return` —
     contrairement au rebond offensif). **Bug découvert et corrigé en
     cours de route** : la première version faisait `return
     { possessionOffense: true }` comme un rebond offensif — mesuré :
     régression de ~11.5% des points/équipe/match (66.5 → 58.9) et du
     pace (76.3 → 68.0), parce que `possessionLength` (donc le nombre
     d'itérations de la boucle par quart-temps) est calculé EN DEHORS de
     `playPossession` et indépendamment de son résultat — un "redo"
     consomme silencieusement un créneau du budget d'itérations fixe sans
     produire de tir. Corrigé en retirant le `return` : la faute est
     enregistrée mais le tir a quand même lieu au même battement
     d'horloge (comme un and-one qui empile plusieurs événements sur un
     seul tick), points/pace revenus à la normale.
   - **Deuxième bug découvert et corrigé** (crash, pas juste une
     régression) : `TypeError: Cannot read properties of undefined
     (reading 'eff')`, tracé au mécanisme pré-existant "banc épuisé
     (rare)" de `substituteIfNeeded` (une équipe peut jouer en infériorité
     si aucun remplaçant n'est disponible pour un poste) — devenu
     atteignable EN PRATIQUE après le doublement du volume de fautes
     (peut vider tout un poste en cours de match). Garde-fou ajouté en
     tête de `playPossession` : `if (!onCourtOff.length ||
     !onCourtDef.length) return { possessionOffense: false };`.
   - Calibration (16 équipes × 18-30 matchs, script jetable) : 19.4-20.3
     fautes/équipe/match (cible 18-20), points/pace inchangés vs. la
     référence sans ce correctif. **Variance vérifiée séparément**
     (retour utilisateur du 2026-09-24 après-midi) : sur 480 matchs
     simulés, min 7, max 35, écart-type ~4.6, P10=14/P90=26 pour une
     moyenne à 20.4 — la variance demandée ("10 comme 30") est déjà là,
     c'est le comportement NATUREL d'une probabilité par possession sur
     ~90-100 possessions/match, rien à ajouter.
   - Tests : suite complète relancée après ce correctif ET celui des
     rotations (point 6 ci-dessous) : 115 passent/2 échecs, tous deux
     déjà dans "Tests connus flaky" (`ordres_validate_without_edit_test.js`
     — bug pré-existant documenté séparément — et
     `training_progression_test.js`), aucune régression nouvelle en dehors
     de ce qui est noté au point 6.
   - **Reste à faire** : synchroniser sur le Mac (pont déconnecté), donner
     les commandes commit/push à l'utilisateur.

6. **✅ LIVRÉ SUR LE MAC** (statut corrigé le 2026-09-25, même vérification
   que les points 4-5 : `firstRestThreshold` confirmé présent dans
   `engine.js` du Mac) **— Temps de jeu / rotations irréalistes** — retour
   utilisateur (2026-09-24),
   captures d'écran boxscore à l'appui : "il y a un travail sur les temps
   de jeu aussi à faire. ils sont bizarre : pas un seul changement au bout
   de 13 min ? et ils sont trop propres, très souvent tous les remplaçants
   ont le même temps de jeu."
   - **Cause racine trouvée** (diagnostic par instrumentation temporaire,
     scripts jetables `sub_diag2/3.js`) : `substituteIfNeeded` ne se
     déclenchait QUE sur `fatigue >= 82` (constante partagée par TOUS les
     joueurs) ou `fouls >= 4`. Le seuil de fatigue à 82 n'était quasiment
     JAMAIS le vrai déclencheur (0 fois sur 20 matchs testés avec le taux
     de fautes déjà corrigé au point 5) — ce sont les fautes personnelles
     qui déclenchaient presque tous les premiers changements, souvent tard
     (médiane ~17-18 min) ET de façon groupée : les titulaires accumulent
     des minutes identiques depuis l'entre-deux, donc une fatigue quasi
     identique à endurance égale (formule 100% déterministe) — un seuil
     UNIQUE partagé fait donc franchir la limite à plusieurs titulaires en
     même temps, d'où le banc qui rentre "en bloc" avec des temps de jeu
     identiques.
   - **Premier correctif essayé, abandonné** : un seul seuil de fatigue
     bas (30-60) tiré au sort par joueur, appliqué à CHAQUE sortie du
     match. Corrigeait bien le symptôme signalé (1er changement ramené à
     une médiane ~9 min) mais en cassait un autre, découvert seulement en
     revérifiant les passes décisives (point 4) déjà calibrées : le
     titulaire le plus utilisé d'une équipe tombait à ~20 min/match en
     moyenne au lieu de ~28-34 pour un titulaire réaliste — un seuil bas
     appliqué à TOUTE sortie (y compris celle d'un remplaçant qui vient à
     peine d'entrer) aplatit tout le temps de jeu de l'effectif au lieu
     d'avancer seulement le premier changement des titulaires. Forcer
     l'exposant de concentration des passes décisives (2.3 → 7, une valeur
     absurde) n'a compensé qu'à moitié (5.09 pd/match, sous la cible
     5.7-7.4) — signe qu'il fallait corriger la vraie cause plutôt que de
     forcer le symptôme en aval.
   - **Correctif retenu** : deux seuils de fatigue par joueur
     (`Player.firstRestThreshold`/`restThreshold`, tirés au sort à chaque
     match) — le seuil bas (20-50) ne s'applique QU'À LA TOUTE PREMIÈRE
     sortie d'un TITULAIRE du match (`Team.isStarterThisMatch`, posé au
     coup d'envoi) ; tout le reste (remplaçant qui vient d'entrer, ou
     n'importe quel joueur après sa première sortie) utilise le seuil haut
     (75-90, proche de l'ancienne constante à 82, jitté pour rester
     désynchronisé). Fait intervenir la fatigue tôt pour LE PREMIER
     changement (un vrai coach fait souffler un titulaire vers 5-8 min)
     sans aplatir le reste de la rotation.
   - Exposant de concentration des passes décisives réajusté à 4.6 (au
     lieu de 2.3) pour compenser la réduction réelle (mais modérée, ~15%)
     des minutes du titulaire le plus utilisé une fois la rotation
     précoce en place.
   - Calibration finale (40 matchs pour le timing, 380 pour les passes,
     scripts jetables) : 1er changement à une médiane de 8.6 min, 100% des
     matchs simulés ont au moins un changement avant 13 min (repère
     utilisateur) ; titulaire le plus utilisé à ~28-29 min/match en
     moyenne (repère réaliste 28-34) ; top 5 passeurs autour de 5.5-6.7
     pd/match sur plusieurs runs (cible 5.7-7.4, un peu de bruit
     d'échantillonnage résiduel comme pour le calibrage initial du point
     4) ; fautes/points/pace inchangés (20.1 fautes/équipe/match, 69.6
     pts, 77.3 de pace estimé) ; répartition des minutes vérifiée
     visuellement sur 10 matchs — vraie variété (ex. 31.7/30/26.5/24.6/
     22.2/17.8/15.4/13.5/10/8.3 min), plus de blocs identiques.
   - **Effet de bord découvert en creusant ce chantier, PAS causé par ce
     correctif, PAS encore investigué** : `training_progression_test.js`
     (déjà dans "Tests connus flaky" ci-dessous, donc pas une régression
     nouvellement introduite) échoue désormais un peu plus souvent — la
     rotation plus active fait que même un groupe de 3 joueurs à un même
     poste peut tous voir un peu de temps de jeu sur 2 matchs, ce que le
     test suppose impossible. Creusé plus loin : `inflateRosterWithRookies`
     (le scénario du test, qui ajoute 15 débutants supplémentaires
     directement dans la sauvegarde) semble ne PLUS survivre à une
     réouverture de la page (le roster retombe à sa taille d'origine après
     `openGame`, vérifié avec un script jetable) — un bug distinct,
     probablement pré-existant et sans lien avec ce chantier (aucun code
     de sauvegarde/chargement touché ici), à investiguer séparément lors
     d'une session dédiée aux Ordres/à l'entraînement.
   - Tests : voir le résumé de suite complète au point 5 ci-dessus (même
     run).
   - **Reste à faire** : synchroniser sur le Mac (pont déconnecté), donner
     les commandes commit/push à l'utilisateur.

8. **✅ FILET DE SÉCURITÉ AJOUTÉ (code écrit, testé en sandbox, pas encore
   livré sur le Mac) — cause EXACTE toujours pas identifiée — Crash
   pendant un match de Coupe en direct, site irrécupérable** — retour
   Discord relayé par l'utilisateur (2026-09-24, capture d'écran, pseudo
   Diablue/CRWL) : "J'ai pas pu voir la fin du match de coupe, ça a crash
   au 4ème QT et impossible de recharger le site." Confirmé ensuite par
   l'utilisateur : "c'était un match de coupe".
   - **Investigué sans pouvoir reproduire** (pas de message d'erreur, pas
     de détails suffisants) : la simulation ENTIÈRE d'un match est
     calculée d'un coup côté serveur avant même le début de la diffusion
     (`computeLiveMatch`), donc un crash "au 4e QT" ne peut pas venir d'un
     calcul serveur en cours à ce moment précis — c'est forcément soit un
     bug de RENDU client pendant la lecture différée des événements déjà
     connus (voir `schedulePlayback`), soit un problème de resynchro-
     nisation client/serveur en fin de match (piste : `viewLiveMatchForTeam`
     retire l'entrée de `league.liveMatches` une fois le tour de Coupe
     finalisé — si le timer client a pris du retard, ex. onglet en
     arrière-plan, il pourrait redemander l'état APRÈS cette suppression et
     ne plus savoir gérer une transition "en direct" → "terminé" à ce
     moment précis). Piste non vérifiée, pas assez de temps/repro pour
     confirmer.
   - **Cause structurelle trouvée en creusant** : la page n'avait AUCUN
     gestionnaire d'erreur global (`window.onerror`/`unhandledrejection`)
     — une exception JS non interceptée N'IMPORTE OÙ laisse donc la page
     bloquée SANS AUCUN message, et recharger retombe sur les mêmes
     données donc **replante de façon identique** (recharger ne corrige
     rien si la même donnée en sauvegarde redéclenche le même bug de
     rendu) — explique le symptôme "impossible de recharger le site" même
     si ce n'est techniquement qu'un bug de rendu réparable.
   - **Correctif ajouté** (`moteurbasket3.html`, tout début du script) :
     gestionnaires `window.addEventListener("error"/"unhandledrejection")`
     génériques → affichent un écran de secours plein écran (même patron
     que `showInvalidManagerLinkMessage`, déjà existant) avec un message
     clair, LE VRAI détail de l'erreur affiché à l'écran (pour qu'un
     prochain signalement en capture d'écran donne enfin de quoi
     diagnostiquer précisément), et un bouton "Recharger la page". Ne
     corrige PAS la cause du crash signalé — évite seulement qu'un futur
     bug de ce genre bloque complètement quelqu'un sans aucune info.
   - Tests : suite complète relancée après ce correctif : 115 passent/2
     échecs, mêmes deux échecs connus qu'avant ce correctif (aucune
     régression introduite par le gestionnaire d'erreur global).
   - **Reste à faire** : si le crash se reproduit, récupérer le nouveau
     message d'erreur affiché à l'écran (capture) pour enfin identifier la
     vraie cause ; vérifier la piste resynchronisation client/serveur
     ci-dessus avec un scénario de test dédié (onglet mis en arrière-plan
     pendant la fenêtre de diffusion d'un match de Coupe) ; synchroniser
     sur le Mac (pont déconnecté), donner les commandes commit/push à
     l'utilisateur.

9. **✅ CODE ÉCRIT, TESTÉ EN SANDBOX — pas encore livré sur le Mac —
   Scouting Pro : refonte visuelle v2 (maquette HTML fournie par
   l'utilisateur, 2026-09-24)** — maquette validée `scouting-pro-apercu-v2`
   reportée dans le vrai code : rendu généré DYNAMIQUEMENT (jamais de
   valeur copiée en dur depuis la maquette) par un nouveau
   `scoutingProReportHtml(report)` (moteurbasket3.html), appelé depuis
   `refreshScoutingProPanel` exactement comme avant (aucun changement côté
   appelant). L'ancienne implémentation est conservée sous
   `scoutingProReportHtmlLegacyV3` (non appelée nulle part — filet de
   sécurité, candidate à suppression dans un chantier de nettoyage séparé
   une fois la v2 validée par l'utilisateur), ses propres helpers devenus
   orphelins aussi (`scoutingAdvancedStatsTilesHtml`/`scoutingShotZoneEfficiencyTableHtml`/
   `scoutingHomeAwayHtml`/`scoutingHalvesHtml`/`scoutingRecentTrendHtml`/
   `scoutingPlayerShareHtml`/`scoutingPointsToWatchHtml`).
   - **CSS** : nouveau bloc préfixé `sp2-` inséré dans le `<style>` principal
     (juste après `.scouting-ad-gray-block::after`), ne réutilise QUE des
     tokens `:root` déjà existants — les quelques couleurs codées en dur de
     la maquette ont été remplacées (`#5a4212` → `rgba(240,162,60,.35)`,
     déjà la convention établie ailleurs dans l'app pour un liseré ambre ;
     `#6f7f98`/`#9fb0c8`/`#5c6b82` → `var(--ink-dim)`/`var(--ink-faint)` ;
     le tint de raquette du diagramme "5 majeur" → `var(--court-zone-inside)`
     en `fill-opacity`, qui correspondait déjà exactement à cette couleur).
     Police "Barlow Condensed" embarquée en base64 dans la maquette **PAS
     reprise** (aucun web-font, embarqué ou CDN, n'existe ailleurs dans ce
     fichier — tout tourne sur la pile système) : `--display` retombe sur
     cette même pile système, par cohérence et pour ne pas alourdir un
     fichier déjà énorme d'un blob de police.
   - **Version mobile PAS reprise** (retour utilisateur : "mets pour
     l'instant de côté") — les 3 `@media(max-width:...)` de la maquette
     (repli mobile du diagramme "5 majeur", des tuiles KPI, du bandeau
     d'équipe) ont été volontairement omises, à ajouter dans un chantier
     séparé si redemandé.
   - **Données** : tout dérive des fonctions déjà existantes et déjà
     testées — `computeScoutingTendencies`/`computeScoutingAdvancedStats`
     calculés UNE SEULE FOIS dans `scoutingProReportHtml`, réutilisés par
     TOUTES les sections. En particulier (demande explicite de
     l'utilisateur) : "À neutraliser" (Plan de match) = EXACTEMENT
     `suggestTacticalSetup(t).assignments` (même fonction que "Composition
     tactique recommandée" du rapport tactique gratuit) ; "Comment les
     battre" = EXACTEMENT `suggestOffensiveApproach(t)` (même fonction que
     "Comment les attaquer") ; les callouts "Forces"/"Faiblesses" =
     EXACTEMENT `scoutingTeamProfileForce`/`scoutingTeamProfileWeakness` —
     donc Plan de match ET Forces/Faiblesses partagent bien la même paire
     `t`/`adv`, jamais deux analyses séparées. `suggestTacticalSetup`/
     `suggestOffensiveApproach` légèrement étendues (champs additifs
     `stat`/`statLabel` par item, pour le grand chiffre affiché à droite de
     chaque conseil) — aucun changement de seuil/logique, juste exposé ce
     qui était déjà dans `reason`/`headline`.
   - **Logo du club** : `teamLogoHtml(oppTeam, 92)` dans `.sp2-crest` à la
     place de l'écusson "REN" placeholder de la maquette.
   - **Seuil de 10 tentatives** : `sp2RosterTableHtml`
     (`SP2_LOW_ATTEMPTS_THRESHOLD = 10`) — colonnes 2pts/3pts/LF du tableau
     "Effectif complet", grisées + astérisque (`.sp2-shot.low`, classe déjà
     prévue par le CSS de la maquette) dès que les tentatives SAISON pour
     ce joueur sont < 10 ; 0 tentative affiche "–" (`.sp2-na`) plutôt qu'un
     0%. Réutilise `teamSeasonStatsRows` (nouvellement extrait de
     `teamSeasonStatsTableHtml`, même agrégation partagée par les deux
     tableaux, jamais dupliquée).
   - **Bouton "Appliquer à mes ordres"** : écrit `teamA.defense`/
     `teamA.watchAssignments` avec `suggestTacticalSetup(t)` recalculé à la
     volée au clic (jamais une valeur figée), `saveMyTeam()` +
     `syncTacticsToServer(...)` (même mécanique que l'écran Ordres) —
     visible immédiatement à la prochaine ouverture de l'onglet Ordres.
     Désactivé si aucune analyse disponible (adversaire sans match joué).
   - **Non branché, données manquantes (à valider avec l'utilisateur plutôt
     que deviné)** : le détail "86 % aux lancers" du 1er exemple "À
     neutraliser" de la maquette n'est PAS reproduit — `computeScoutingAdvancedStats`
     ne suit le % aux lancers qu'au niveau ÉQUIPE (`adv.ftPct`), jamais PAR
     JOUEUR (contrairement à `twoPct`/`threePct` dans `adv.playerShare`) ;
     ajouter ce suivi par joueur serait un petit chantier d'instrumentation
     séparé si souhaité. Les icônes du "Plan de match" sont génériques (une
     par colonne "À neutraliser"/"Comment les battre"), pas une icône
     différente par item précis comme la maquette (les items sont
     entièrement dynamiques, aucune association fixe icône↔texte prédéfinie
     n'aurait de sens).
   - **Tests** : `scouting_pro_test.js` (assertion C2bis mise à jour,
     `.scouting-strategy-row` → `.sp2-strat-row` — ce sélecteur n'existe
     plus dans CE panneau, seule la présentation change, mêmes données),
     `scouting_advanced_stats_test.js`, `tactical_scouting_report_test.js`,
     `client_scouting_test.js` tous verts individuellement. Suite complète
     (`run_final.sh`) en cours de vérification.
   - **Reste à faire** : confirmer le résultat de la suite complète
     ci-dessus, synchroniser sur le Mac (pont déconnecté), donner les
     commandes commit/push à l'utilisateur ; envisager (séparément, pas
     demandé) un nettoyage de `scoutingProReportHtmlLegacyV3` et ses
     helpers orphelins une fois la v2 validée visuellement par
     l'utilisateur.

10. **✅ CODE ÉCRIT, TESTÉ EN SANDBOX — pas encore livré sur le Mac —
    Refonte du tableau de bord (direction « A · Soir de match »)** —
    l'utilisateur a fourni un zip (`tableau-de-bord.zip`) contenant un
    tableau de bord livré par un prestataire SANS accès au dépôt (modules
    ES vanilla, zéro dépendance, testé en navigateur headless desktop
    1440px/mobile 390px). Brief complet dans `tableau-de-bord/
    INTEGRATION.md` (dossier du zip).

    **Version mobile** : CSS du prestataire laissé tel quel (concaténé
    avec le reste, non retiré chirurgicalement — trop de règles
    entremêlées pour un tri sûr) mais **aucune UI/branchement mobile
    n'a été construit** — le jeu reste desktop-only comme avant, conforme
    à la consigne.

    **Ce qui a été fait, dans l'ordre demandé :**
    1. *Compréhension de l'existant* : déjà fait au point de recherche
       précédent (repris tel quel, voir historique de ce point plus bas
       dans le fichier si besoin).
    2. *Adaptateur de données* : `dashboardDataFromGameState()`
       (moteurbasket3.html, section "Adaptateur" juste après le montage
       de `mountDashboard`) — fonction pure, recalculée à chaque
       affichage (jamais mise en cache), lit `teamA`/`league`/
       `currentMatch` et construit l'objet attendu par `mountDashboard`.
    3. *Fil d'actualité* : module `newsFeed.js` du prestataire porté tel
       quel (renommé pour éviter les collisions d'identifiants avec les
       ~29 000 lignes existantes, voir "Choix faits" ci-dessous) dans
       `engine.js` (juste avant `class Team`) ET son miroir EXACT dans
       moteurbasket3.html (mêmes lignes, commentaire "MIROIR EXACT").
       `Team.feed` créé au constructeur, persisté (`feed` ajouté à
       `serializeTeam`/`teamFromSave` des deux côtés).
    4. *Routage* : `dashResolveNavigate(href)` (moteurbasket3.html) —
       table fixe `DASH_ROUTE_TO_TAB` pour les routes simples (`/staff`,
       `/economie`, `/effectif`, `/salle`, `/humeur`, `/ordres`...) vers
       `TAB_HANDLERS`, plus des routes paramétrées
       (`/interview/:id`, `/joueur/:id`, `/equipe/:id`, `/match/:matchId`)
       vers les fonctions d'affichage existantes (`showInterviewModal`,
       `showPlayerDetail`, `showTeamDetail`, `showMatchBoxscore`), avec
       repli sur l'onglet le plus proche si l'id ne résout à rien.
       `renderClubSection()` remonte le tableau de bord via
       `mountDashboard()` (remplace l'ancien panneau statique) ; l'ancienne
       carte "Identité du club" est retirée du tableau de bord, son accès
       relocalisé dans un bouton d'en-tête ouvrant la modale
       `showClubIdentityModal()` déjà existante (pas de nouvel écran de
       paramètres créé — jugé hors de proportion pour ce chantier).
    5. *Tests* : voir plus bas.

    **Points d'émission du fil d'actualité (8 types demandés)** :
    - `match_played`, `league_round` : **UNIQUEMENT côté serveur**
      (`server/liveMatch.js`, `finalizeRound`/`finalizeCupRound`) —
      confirmé par archéologie de code que la finalisation d'un match
      n'est JAMAIS dupliquée côté client, même en solo (client et serveur
      tournent toujours ensemble). Pas de `league_round` pour la Coupe
      (bracket à élimination, pas une "journée" à plat).
    - `injury` : `MatchEngine.applyFatigue` (engine.js + miroir), au
      moment réel de la blessure.
    - `injury_healed` : **pas de "tick" dédié** dans le moteur pour la
      guérison (`isCurrentlyInjured` est recalculée à la demande, jamais
      annoncée) — détecté PAR DIFF dans `Team.trainWeek` (chaque semaine
      réelle) : toute entrée `injury_<id>` encore dans le fil pour un
      joueur qui n'est plus courramment blessé signale une guérison.
    - `transfer_in`/`transfer_out` : `League._resolveListing` (marché des
      transferts).
    - `staff_hired` : `League._resolveCoachListing`/
      `_resolveAnalystListing`/`_resolveRecruiterListing` (résolution
      d'enchère staff).
    - `interview`/`interview_done` : `Team.applyMoraleForResult` (jalon
      de mi-saison), `Team.queueSeasonPreviewInterview` (avant-saison),
      `Team.resolveInterview` (réponse donnée).
    - `checkThresholds` (alertes budget/staff/humeur, pas un type
      d'événement à proprement parler) : appelé chaque semaine dans
      `Team.trainWeek`, juste à côté de la détection `injury_healed`
      ci-dessus.
    - **`offer_received`/`offer_closed` : NON branchés.** Confirmé par
      recherche exhaustive (`grep`) qu'AUCUN mécanisme d'"offre
      spontanée d'un club adverse" n'existe dans le jeu — l'économie
      (transferts ET staff) est intégralement basée sur des enchères
      (`League.placeBid`/`placeCoachBid`/...), jamais une offre à
      accepter/refuser. `dashResolveNavigate` garde un repli
      (`/marche/...` → onglet Marché) au cas où un tel lien apparaîtrait
      un jour, mais ce chemin est mort aujourd'hui — documenté comme tel
      dans le code.

    **Choix faits sur les champs de données manquants (aucune donnée
    inventée, chaque choix documenté dans le code ET ici)** :
    - Couleurs de marque (`club.colors`) : PAS de champ dédié dans le
      modèle → couleur primaire = maillot domicile (`jerseyColor`),
      secondaire = maillot extérieur (`awayJerseyColor`) — deux VRAIES
      couleurs déjà choisies par le club, aucune valeur inventée.
    - Saison (`club.season`) : PAS de compteur de saison dans le modèle
      actuel → figé à `1` (constante littérale documentée en commentaire
      comme un placeholder, pas une vraie fonctionnalité "saison N").
    - Staff nommé (`staff.coach.name` etc.) : PAS de nom sur les membres
      du staff, seulement un niveau → placeholder `"Niveau N"`, MÊME
      convention utilisée côté émission du fil (`staff_hired`,
      `feedStaffPlaceholderName`) et côté adaptateur (`staffRef`),
      explicitement croisées en commentaire pour rester cohérentes.
    - Masse salariale hebdomadaire (`finances.weeklyWages`) :
      **corrige une affirmation erronée de la recherche précédente** — un
      calcul existait déjà ailleurs (`renderEconomieSection`,
      `totalPayroll`) ; calculé pour de vrai via un nouveau helper
      `dashboardWeeklyWages(team)` (même formule), PAS laissé à `null`
      puisque la vraie donnée était disponible.
    - Écran de paramètres du club : n'existe toujours pas — le bouton
      "Identité du club" du tableau de bord ouvre directement la modale
      `showClubIdentityModal()` déjà existante (accès relocalisé, pas de
      nouvel écran construit).
    - Bug d'horaire "07:57" repéré par le prestataire : **non
      investigué, hors périmètre de ce chantier** (consigne explicite de
      l'utilisateur : ne pas corriger de bug pré-existant sans rapport
      direct avec l'intégration).

    **Bugs réels trouvés et corrigés en cours de route** (repérés en
    écrivant les tests, pas dans le scope initial mais nécessaires pour
    que le fil fonctionne correctement) :
    - `Team.trainWeek` (engine.js + miroir) : la détection par diff de
      `injury_healed` comparait `p.id` (numérique) à l'id extrait de la
      clé du fil (chaîne) avec `===` strict → ne trouvait jamais le
      joueur, et retombait silencieusement sur le nom générique
      "Le joueur" au lieu du vrai nom à chaque guérison. Corrigé en
      comparant via `String(p.id) === playerId`.
    - `dashResolveNavigate`, route `/joueur/:id` (moteurbasket3.html) :
      même piège (comparait l'id de joueur extrait de l'URL, une chaîne,
      à `p.id` numérique) → le lien "Voir le joueur" d'une entrée de fil
      transfert retombait toujours sur l'onglet Effectif au lieu d'ouvrir
      la vraie fiche joueur. Corrigé en convertissant l'id en `Number`
      avant comparaison (même convention que les autres appels à
      `showPlayerDetail` déjà présents dans ce fichier).

    **Limitation connue, documentée, non résolue** : le marquage
    "lu"/"non lu" du fil (`markAllRead` en quittant le tableau de bord)
    passe par `saveMyTeam()`, qui est un no-op en ligue partagée
    (`managerToken` actif) — aucune route serveur dédiée n'existe pour
    ça. En mode multi-manager, le fil redevient donc "tout non lu" à
    chaque rechargement. Jugé disproportionné de créer une route serveur
    dédiée juste pour cette nuance d'UX dans ce chantier.

    **Tests** :
    - `dashboard_feed_test.js` (nouveau) — logique pure du fil (15 blocs :
      handleGameEvent par type, dédoublonnage, checkThresholds,
      sérialisation) PUIS les VRAIS points de branchement dans le moteur
      (staff_hired via une vraie résolution d'enchère, transfer_in/out via
      un vrai marché des transferts à deux équipes humaines,
      interview/interview_done via les vraies méthodes Team, trainWeek
      réel). Réécrit dans le style du projet (assertions manuelles),
      PAS `node --test` comme les `.test.mjs` du prestataire.
    - `dashboard_e2e_test.js` (nouveau) — bout en bout façon
      `lineup_test.js` (JSDOM + vrai petit serveur local) : montage réel
      avec de vraies données (nom/budget/effectif vérifiés contre
      `teamA`), navigation depuis un lien du tableau de bord vers une
      vraie page du jeu, bouton "Identité du club" → vraie modale, entrée
      de fil "interview" → vraie modale d'interview, un événement RÉEL
      émis par le moteur (recrutement d'entraîneur via une vraie enchère)
      apparaît dans le fil affiché ET survit à un rechargement complet
      (nouveau serveur relisant son fichier), marquage "lu" en quittant
      le tableau de bord.
    - `salary_test.js` (existant, corrigé) : le passage sur l'onglet
      Économie pendant que des sauvegardes `saveMyTeam()` fire-and-forget
      d'`initGame()` étaient encore en vol, suivi d'une manipulation
      directe du fichier de sauvegarde (`fastForwardCalendar`) SANS
      attendre ces sauvegardes, pouvait écraser le calendrier décalé —
      symptôme : plus aucune transaction/changement de budget après
      rattrapage. Bug de course PRÉ-EXISTANT (reproduit sans toucher au
      tableau de bord), pas une régression de ce chantier, mais devenu
      déterministe dans cet environnement → corrigé en ajoutant un
      `await flush(dom)` avant la manipulation directe du fichier, même
      garde-fou déjà documenté dans `lineup_test.js`.
    - `deficit_test.js` (existant) : le bandeau critique de déficit
      (`#clubDeficitBanner`, "tout l'effectif mis en vente forcée à 1 €")
      vivait dans l'ancien panneau statique du tableau de bord, disparu
      avec son remplacement par `mountDashboard()` — la tâche générique
      "Budget dans le rouge" du nouveau tableau de bord ne mentionne PAS
      la mise en vente forcée. Restauré en gardant `#clubDeficitBanner`
      comme élément à part (hors du root géré par `mountDashboard`,
      qui réécrit tout son contenu à chaque rendu), alimenté par
      `deficitBannerHtml()` (déjà utilisée sur l'onglet Économie) —
      aucune UI reconstruite, juste le même mécanisme réutilisé aux deux
      endroits comme son propre commentaire le prévoyait déjà.
    - `attr_color_scheme_everywhere_test.js` (existant, dans la liste des
      flaky connus MAIS avec un tout autre mode d'échec d'habitude —
      celui-ci ("Carte 'Alchimie' introuvable") était une VRAIE régression :
      l'ancien `#clubStatsGrid` (carte "Alchimie" colorée par seuil,
      rouge/orange/blanc/vert, même convention que partout ailleurs dans le
      jeu) a disparu avec l'ancien panneau, et la jauge "Alchimie" du
      nouveau tableau de bord (`dashRenderPulse`/`dashGauge`) n'appliquait
      aucune couleur par seuil sur le chiffre. Corrigé en ajoutant cette
      coloration (réutilise `moraleGaugeColor`, la même fonction que
      Ordres/Effectif/Humeur) dans `dashGauge`, et en migrant le test vers
      le nouveau sélecteur (`.hm-gauge` avec le libellé "Alchimie").
    - `post_match_interview_button_test.js` (existant, également dans la
      liste des flaky connus, également une VRAIE régression structurelle
      en plus de sa flakiness habituelle — un échec ponctuel de socket
      "other side closed" pendant le rattrapage de 9 journées persiste,
      déjà connu) : testait `#clubInterviewPanel`/`.interview-widget`/
      `[data-interview-open]`, entièrement disparus avec l'ancien panneau.
      L'accès à l'interview de jalon depuis le tableau de bord existe
      toujours (tâche "Répondre" dans "Cette semaine", même popup
      `showInterviewModal`), mais SANS le mécanisme `data-interview-trigger`
      de mise à jour en place de l'ancien panneau — `finishInterviewTrigger`
      (appelé après Valider/Sans commentaire) a donc été complété pour
      remonter tout le tableau de bord (`renderClubSection()`) quand il est
      la page affichée, faisant naturellement disparaître la tâche une fois
      l'interview traitée. Test réécrit avec les nouveaux sélecteurs
      (`[data-dash-href^="/interview/"]`), même couverture fonctionnelle
      qu'avant (interview "début de saison" accessible avant le premier
      match, interview de mi-saison manquée par le direct accessible depuis
      le tableau de bord, "Plus tard" ne résout rien, "Sans commentaire"
      retire bien l'interview ET la tâche).
    - Suite complète (`run_final.sh`, 119 fichiers désormais — 117 + les
      2 nouveaux) : voir "Repères techniques" plus bas pour le résultat
      et la comparaison avec la référence.

    **Fichiers modifiés/créés** : `engine.js`, `moteurbasket3.html`,
    `server/liveMatch.js`, `dashboard_feed_test.js` (nouveau),
    `dashboard_e2e_test.js` (nouveau), `salary_test.js`,
    `attr_color_scheme_everywhere_test.js` et
    `post_match_interview_button_test.js` (correctifs de tests existants —
    seul `salary_test.js` est sans rapport avec le tableau de bord, un bug
    de course pré-existant ; les deux autres corrigent de vraies
    régressions du remplacement du panneau).

11. **✅ CODE ÉCRIT, TESTÉ EN SANDBOX (moteur ET navigateur) — pas encore
    livré sur le Mac — Émissions avant-match et mi-temps + pronostics** —
    maquette validée par l'utilisateur (2026-09-24) : "à intégrer également
    émission d'avant match et de la mi temps. il faudra bloquer les compos
    quelques minutes avant le match". Portée : **championnat uniquement**
    (décision Claude, pas demandée explicitement pour la Coupe — un tour de
    Coupe n'a pas la même notion de "journée"/bracket à élimination ;
    ajoutable plus tard sans réécriture, `showsAdapter.js` est déjà
    paramétré par `round`/`competition`).

    Conflit avec le point 0 (mi-temps sans choix tactique) : **réglé** dès
    le 2026-09-24, voir ce point — la mi-temps est un pur contenu de
    divertissement/pronostics, aucune décision de jeu.

    **Fichiers** — `server/showsAdapter.js` (nouveau, adaptateur
    engine.js → format `showData.js` : compos/forme/confrontations/
    absents/tirs, coordonnées en repère 0-1 EXACTEMENT comme
    `moteurbasket3.html:randomPointForZone` du terrain live, même graine
    `ev.airAt` pour que les tirs affichés en mi-temps soient au même
    endroit que ceux déjà vus en direct) ; `server/shows.js` (nouveau,
    orchestration : fenêtres, pronostics, résolution, lot de saison —
    **entièrement SYNCHRONE à dessein**, voir son grand commentaire d'en-tête :
    `server/shows/pronostics.js`, livré et copié tel quel, est asynchrone
    par construction, mais `resolveRoundShowsSync`/`grantSeasonPrizeSync`
    sont appelées depuis du code synchrone — `finalizeRound`/
    `catchUpPlayoffs` — juste avant la sauvegarde de la ligue ; un appel
    fire-and-forget à une fonction async n'aurait pas garanti que la
    mutation soit appliquée avant ce point de sauvegarde) ; livrable copié
    tel quel dans `server/shows/{showData,pronostics,sampleData}.js` et
    `assets/hoop-shows/{showPlayer.js,showPlayer.css,fonts/}` ; routes GET
    `/api/shows/prematch|halftime` + `/api/pronostics/me|leaderboard` et
    route POST `/api/pronostics/submit` (`server/index.js`/`actions.js`) ;
    verrou des compos + bouton d'accès aux émissions dans
    `moteurbasket3.html` (`renderOrdresGrid`, `showPauseBanner`,
    `openHoopShow`/`hoopShowOnAd`, `#hoopShowSection` en plein écran
    `position:fixed`, HORS de `PAGE_IDS`/`showPage()` — une parenthèse par-
    dessus l'appli, pas un onglet de plus) ; `engine.js`/miroir
    `moteurbasket3.html` : `Team.premiumUntil`/`hasActivePremium()`/
    `grantTemporaryPremium()` (nouveau champ, générique — réutilisable par
    d'autres futurs lots) et `League.showsPronostics` (persisté dans la
    MÊME sauvegarde JSON que le reste, jamais un stockage séparé).
    `server/scouting.js` : `recentFormFor`/`homeAwayRecordFor`/
    `streakFor`/`headToHeadFor`/`standingFor` étaient déjà écrites (utilisées
    en interne par `buildScoutingReport`) mais pas exportées — ajoutées à
    `module.exports` pour que l'adaptateur puisse les réutiliser (aucun
    changement de comportement).

    **Décisions sur les valeurs non spécifiées** (documentées, jamais
    inventées silencieusement) : verrou 5 min avant coup d'envoi — valeur
    EXPLICITE de `hoop-shows/INTEGRATION.md` ("T − 5 min"), pas une
    estimation ; lot de fin de saison = 30 jours de Premium pour "1 mois"
    (le jeu ne connaît que des jours/semaines réels, pas de mois
    calendaire) ; clé de saison du classement mondial = `"1"` (même
    convention placeholder que `club.season`, point 10) ; pub factice =
    même écran gris répété que Scouting Pro (point 3), pas de vraie régie
    publicitaire.

    **3 bugs trouvés et corrigés en testant** (aucun signalé par
    l'utilisateur, découverts en écrivant les tests d'intégration ci-dessous) :
    (1) `showsAdapter.js:randomPointForZone`, zone "inside" — coordonnées
    renvoyées en pixels bruts (jusqu'à ~1100) au lieu d'être normalisées en
    [0,1] comme les autres zones, détecté par un test de bornes sur de
    vrais tirs simulés ; (2) `server/scouting.js` n'exportait pas les 5
    fonctions dont l'adaptateur avait besoin (voir ci-dessus) ; (3) le
    nouveau `<script src="assets/hoop-shows/showPlayer.js">` dans `<head>`
    était "parser-blocking" (spec HTML) et retardait l'exécution du dernier
    `<script>` inline de `moteurbasket3.html` (celui qui pose
    `window.__gameReady`) — inoffensif dans un vrai navigateur, mais
    `new JSDOM()` revient AVANT la fin de ce chargement réseau différé dans
    `test_helpers.js:openGame`, donc `await dom.window.__gameReady`
    résolvait sur `undefined` bien avant qu'`initGame()` n'ait tourné : 78
    des 122 tests cassaient en cascade (tout ce qui dépend de teamA/league/
    currentMatch). Corrigé avec l'attribut `defer` (HoopShowPlayer n'est de
    toute façon utilisé qu'au clic sur un bouton, jamais au chargement).

    **Tests** : `server/hoop_shows_test.js` (nouveau) — les 9 tests livrés
    (`hoop-shows/test/shows.test.js`) réécrits en style projet (assertions
    manuelles, pas `node:test`) contre les copies verbatim de
    `showData.js`/`pronostics.js`/`sampleData.js`, PLUS 5 tests
    d'intégration contre le VRAI adaptateur et `server/shows.js` sur une
    ligue `engine.js` réelle (`generateLeague`) : fenêtre de verrou = fenêtre
    d'ouverture de l'émission (T-5min exact), compos/tirs réels bien
    adaptés, anti-spoiler sur les vrais événements convertis, validations
    des pronostics, et résolution + lot de saison via le VRAI
    `finalizeRound` (pas une fonction isolée) — confirme que le point
    d'accroche dans `server/liveMatch.js` fonctionne réellement de bout en
    bout. Suite complète : 120/122 (`run_final.sh`), les 2 échecs restants
    sont les deux déjà documentés dans "Tests connus flaky" ci-dessous
    (`ordres_validate_without_edit_test.js`, `training_progression_test.js`)
    — **zéro régression**.

    **Non fait / hors périmètre de cette session** : Coupe (voir portée
    ci-dessus) ; solo hors-ligne — non concerné, ce jeu est TOUJOURS servi
    par `server/index.js` (voir README.md), y compris en solo (simple
    sauvegarde par défaut plutôt que multi-manager), donc les mêmes routes
    serveur couvrent déjà les deux modes sans code séparé.

12. **✅ CODE ÉCRIT, TESTÉ EN SANDBOX (moteur ET navigateur) — pas encore
    livré sur le Mac — Le "prochain match" (bandeau du haut, écran de
    préparation, échéance des ordres) ignorait la Coupe** — retour
    utilisateur (2026-09-24, capture d'écran du calendrier à l'appui) :
    "le match devrait s'afficher en haut pour la coupe aussi (il faut tjrs
    afficher le prochain match, et pas uniquement le prochain match de
    championnat)". Cas concret montré : jeudi 24/09, un match de Coupe
    (Quarts, 15:00) programmé AVANT le match de Championnat du même jour
    (19:00), mais le bandeau du haut affichait quand même "Journée 4/18"
    (championnat) comme prochain match.
    - **Cause confirmée** : `League.nextUserMatch(teamIdx)` (engine.js ET
      son miroir moteurbasket3.html) ne parcourait QUE `this.schedule`
      (championnat), jamais `this.cup`. Alimente `currentMatch` via
      `enterNextMatchOrShowSeasonEnd()`, qui pilote `updateTopbar()`,
      `renderPrep`/`defaultOrdresRound` et l'échéance de validation des
      ordres.
    - **Correctif moteur** : `nextUserMatch` cherche désormais AUSSI le
      tour de Coupe en attente (`pendingCupRound()`) pour ce club, et
      compare l'horaire RÉEL programmé des deux (`dailyAnchoredScheduledTimeForChampionshipRound`/
      `dailyAnchoredScheduledTimeForCupRound`/`calendarScheduledTimeForRound`,
      déjà présentes dans engine.js) pour renvoyer le plus proche
      chronologiquement. Forme de retour inchangée pour le championnat
      (`{round, isHome, opponent}`, sans clé `competition`) ; un tour de
      Coupe porte en plus `competition: "cup"` (même convention que
      `league.liveMatch.competition`) — appliqué identiquement dans
      engine.js et le miroir `class League` de moteurbasket3.html.
    - **Piège du "isImmediate" évité** : un tour de Coupe garde SON PROPRE
      mécanisme de validation déjà existant (`teamA.hasPlanForRound(round,
      "cup")`/`stagePlanForRound`, alimente déjà le bouton "Modifier vos
      ordres" par ligne du calendrier, voir `cup_ordres_planning_test.js`)
      — jamais fusionné avec `teamA.ordresValidatedRound` (qui suppose un
      round de championnat). `isImmediate`
      (`renderOrdresGrid`/`validateOrdres`/`renderOrdresRoundSelector`) et
      `isImmediateRound` (`renderCalendrierSection`) gardent donc
      `competition === "championship"` comme condition, avec un garde-fou
      supplémentaire `currentMatch.competition !== "cup"` partout où
      `currentMatch.round` est comparé à un numéro de round : un tour de
      Coupe et une journée de championnat partagent le même espace de
      numérotation à partir de 0 (`Team.planKey`), donc sans ce garde-fou
      une sélection de championnat au même numéro qu'un `currentMatch` de
      Coupe aurait pu être prise à tort pour "le match immédiat".
    - **Bouton d'ordres du bandeau du haut pour un prochain match de
      Coupe** (point resté ambigu dans la spec, choix pris ici) : réutilise
      `teamA.hasPlanForRound(currentMatch.round, "cup")` (mécanisme déjà
      en place) plutôt que `teamA.ordresValidatedRound` — cohérent avec le
      piège ci-dessus, pas de nouveau champ `ordresValidatedCupRound`
      inventé. Même choix appliqué au widget "ordres donnés" du tableau de
      bord (`dashboardDataFromGameState`/`ordersGiven`).
    - **Libellés** : "Journée X/18" remplacé par `Coupe · <tour>`
      (`cupStageLabelForRoundIndex`, même patron que "Finale"/"Demi-finale"
      déjà utilisé pour les play-offs) dans `updateTopbar`, le tableau de
      bord (`dashboardDataFromGameState`/`dashRenderNextMatch`, nouveau
      champ `nextMatch.roundLabel`) et `describeMatchup` (fonction morte,
      corrigée par cohérence). Comportement play-offs INCHANGÉ partout.
    - **Autres correctifs de cohérence entraînés par le même changement** :
      `defaultOrdresRound()` (compétition du direct comparée à
      `currentMatch.competition`, plus seulement "championship" en dur) ;
      `scheduledTimeForCurrentMatch()`/`currentMatchAlreadyLive()`
      (Coupe gérée, `round.index === round.dayIndex` par construction —
      voir `generateCupBracket`/`buildNextCupRound` — donc
      `currentMatch.round` réutilisable tel quel pour
      `scheduledTimeForCupRound`) ; `enterNextMatchOrShowSeasonEnd` pose
      `currentMatch.competition = "cup"` aussi pour un DIRECT de Coupe déjà
      en cours (`league.liveMatch.competition`), pas seulement pour un tour
      pas encore commencé.
    - **Non touché, volontairement** : `league.liveMatch`/
      `league.nextUserPlayoffMatch`/`currentMatch.seriesId` (live et
      play-offs, chemins séparés déjà corrects) ; le bouton "Modifier vos
      ordres" par ligne de Coupe du calendrier (déjà correct, indépendant
      de `currentMatch`).
    - **Fichiers touchés** : `engine.js` (`League.prototype.nextUserMatch`),
      `moteurbasket3.html` (miroir `nextUserMatch`, `enterNextMatchOrShowSeasonEnd`,
      `updateTopbar`, `defaultOrdresRound`, `renderOrdresRoundSelector`,
      `renderOrdresGrid`, `validateOrdres`, `renderCalendrierSection`,
      `scheduledTimeForCurrentMatch`, `currentMatchAlreadyLive`,
      `describeMatchup`, `dashboardDataFromGameState`, `dashRenderNextMatch`).
    - **Tests** : nouveau `server/next_user_match_cup_priority_test.js`
      (moteur pur : Coupe 15h avant championnat 19h le même jour → Coupe
      renvoyée avec `competition:"cup"` ; non-régression championnat 10h
      avant Coupe 15h ; équipe exemptée au 1er tour garde le championnat).
      Nouveau `next_match_cup_priority_ui_test.js` (navigateur/jsdom, vraie
      ligue multi-manager + vrai serveur de test : bandeau du haut affiche
      "Coupe · Huitièmes", écran de préparation s'ouvre directement dessus,
      bouton d'ordres du bandeau passe à "Modifier vos ordres" via
      `hasPlanForRound` sans jamais toucher `ordresValidatedRound`). Les
      deux verts. `cup_ordres_planning_test.js`/`next_user_match_multi_manager_test.js`/
      `cup_test.js` toujours verts (non-régression). Suite complète
      relancée (8 jobs en parallèle puis re-vérification individuelle des
      échecs) : 111-120 verts au premier passage parallèle, les 9 échecs
      reproduits TOUS individuellement hors charge sauf
      `training_progression_test.js` (déjà dans "Tests connus flaky",
      confirmé flaky indépendamment de ce chantier — échoue aussi sur un
      scénario purement calendrier CLASSIQUE sans Coupe, où le correctif
      est un no-op prouvé) — 8 des 9 étaient déjà dans la liste "Tests
      connus flaky"/ECONNRESET sous charge documentée ci-dessous
      (`calendrier_ordres_stale_live_redirect_test.js`,
      `attr_color_scheme_everywhere_test.js`, `full_run_test.js`,
      `onboarding_tour_test.js`, `post_match_interview_button_test.js`,
      `end_to_end_test.js`), les 2 nouveaux à surveiller
      (`ordres_during_live_test.js`, `spectate_live_match_test.js`) passent
      systématiquement seuls — faux échecs sous charge parallèle, pas des
      régressions. **Confirmation finale** : `run_final.sh` (120 fichiers,
      séquentiel, sans charge parallèle) relancé intégralement : 118
      passent/2 échecs, EXACTEMENT les deux déjà documentés
      (`ordres_validate_without_edit_test.js` — bug pré-existant séparé —
      et `training_progression_test.js` — flaky) — **zéro régression**.
      `next_match_cup_priority_ui_test.js` (créé après le lancement de ce
      run séquentiel, donc absent de son compte de 120) revérifié seul
      juste après, vert.

13. **✅ CODE ÉCRIT, TESTÉ EN SANDBOX — pas encore livré sur le Mac — bug
    Ordres/synchronisation : les ordres validés peuvent se perdre si un
    rechargement automatique survient en concurrence** — investigation
    demandée par l'utilisateur suite à un signalement Discord ("Diablue",
    2026-09-24, ~19h50, à propos du match de CHAMPIONNAT de 19h) : « les
    ordres que j'avais établis n'ont pas été pris en compte, alors que
    c'était bien enregistré ». **On ne peut pas confirmer à 100 % que c'est
    EXACTEMENT son cas** (pas de sa sauvegarde ni de logs serveur exacts
    pour ce match précis), mais l'investigation a identifié un mécanisme
    réel et plausible, désormais corrigé.

    **Root cause** : `refreshFromServerAndReenter()` (moteurbasket3.html)
    remplace ENTIÈREMENT l'objet global `teamA` par un objet fraîchement
    rechargé depuis le serveur (`teamA = loaded.team;`), et peut se
    déclencher À TOUT MOMENT — countdown (`startCountdown`/`tick`), retour
    d'onglet (`visibilitychange`), navigation vers Live/Ordres
    (`goToLiveTab`/`goToOrdresTab`) — y compris PENDANT qu'une
    `validateOrdres()` est en train de confirmer une validation auprès du
    serveur (journée immédiate : POST `/api/tactics` + `/api/lineup` ;
    journée future : POST `/api/plan`). Si ce remplacement survient alors
    que la validation vient tout juste d'aboutir localement (ou pendant
    l'attente réseau elle-même), le GET `/api/save` du rechargement peut
    être traité par le serveur avant que la validation n'ait fini d'y être
    persistée (ou sa réponse simplement traitée localement après coup) : le
    remplacement écrase alors `teamA` avec un instantané qui ne reflète pas
    encore la validation — perdue silencieusement, sans erreur visible pour
    le joueur. Un manager qui valide ses ordres juste avant/au moment du
    coup d'envoi (exactement le cas du match de 19h de Diablue) se trouve
    précisément dans la fenêtre où le countdown peut déclencher ce
    rechargement en concurrence avec sa validation.

    **Découvert en creusant `ordres_validate_without_edit_test.js`**, qui
    échouait de façon répétable depuis plusieurs sessions (voir l'ancienne
    entrée "Repères techniques" ci-dessous, retirée) : sa partie "LIGUE
    PARTAGÉE" utilisait l'horloge RÉELLE du navigateur jsdom (jamais
    patchée) alors que l'horloge SERVEUR de test est fixée dans le passé
    (`T0`) — un décalage qui grandit chaque jour où le test tourne. Ce
    décalage déclenchait un `refreshFromServerAndReenter()` PARASITE dès le
    chargement initial de la page (avant même que le test n'agisse), qui
    concourait avec la validation faite par le test juste après — exposant
    par accident le vrai bug de concurrence ci-dessus. **Correctif de
    test** (bug de test réel — horloges désynchronisées — pas un simple
    contournement) : `patchDateNow(win, () => T0)` appliqué via
    `extraBeforeParse` d'`openGame()` (donc AVANT que le moindre script de
    la page ne s'exécute — l'appliquer seulement APRÈS `openGame()`, comme
    fait initialement, arrive trop tard : le premier tick() synchrone du
    countdown a déjà eu lieu avec l'horloge réelle pendant le chargement).
    La partie "SOLO" du même test a été vérifiée non concernée : elle
    utilise `startTestServer()` sans `nowFn` (horloge serveur réelle par
    défaut), donc déjà cohérente avec l'horloge client réelle — confirmé,
    pas juste supposé.

    **Correctif retenu** (le plus ciblé/le moins risqué parmi les pistes
    évaluées, voir ci-dessous pourquoi) : `ordresValidationInFlight`, une
    promesse posée au tout début de CHAQUE appel à `validateOrdres()`
    (avant le moindre `await`, donc sans fenêtre de course à la pose) et
    résolue dans son `finally` (succès ET échec confondus, pour ne jamais
    bloquer indéfiniment un rechargement si la validation échoue).
    `refreshFromServerAndReenter()` l'attend tout au début, avant même
    d'appeler `loadMyTeam()` — ça SÉQUENCE les deux au lieu de les laisser
    courir en concurrence : le rechargement a TOUJOURS lieu (jamais annulé
    ni sauté), simplement reporté jusqu'à ce que la validation en cours
    soit entièrement terminée (réseau ET mutation locale). Une fois le
    rechargement autorisé à continuer, le serveur a nécessairement déjà
    traité la validation (le POST a reçu sa réponse 200 avant que le
    `finally` ne libère la promesse), donc l'état qu'il renvoie la reflète
    déjà — aucun risque de la perdre par un remplacement de `teamA` fondé
    sur un instantané antérieur. Couvre les DEUX branches de
    `validateOrdres()` (journée immédiate ET journée future) sans les
    distinguer : le point d'étranglement est dans `refreshFromServerAndReenter()`,
    un seul endroit, plutôt que de dupliquer une garde dans chacun des 4
    appelants de cette fonction. `validateOrdres()` elle-même a été
    minimalement redécoupée (renommée `validateOrdresImpl`, appelée depuis
    un nouveau `validateOrdres()` qui pose/lève la garde) — AUCUN de ses 4
    appelants existants n'attend son retour (déjà "fire-and-forget"),
    aucun changement de comportement pour eux.

    **Pistes envisagées et écartées** : un verrou "skip ce tick" dans
    `startCountdown()` seul aurait laissé passer les 3 AUTRES appelants de
    `refreshFromServerAndReenter()` (visibilitychange, goToLiveTab,
    goToOrdresTab) sans protection, et aurait pu faire "sauter" un
    rechargement légitime plutôt que de le reporter (risque de régression
    sur les scénarios déjà fragiles que `refreshFromServerAndReenter()`
    gère — direct qui vient de se terminer, rattrapage après absence,
    voir ses 4 appelants et leurs commentaires) ; le point d'étranglement
    unique dans `refreshFromServerAndReenter()` évite les deux problèmes.

    **Fichiers touchés** :
    - `moteurbasket3.html` : `ordresValidationInFlight` +
      `validateOrdres()`/`validateOrdresImpl()` (redécoupage), garde dans
      `refreshFromServerAndReenter()`.
    - `ordres_validate_without_edit_test.js` : `patchDateNow` via
      `extraBeforeParse` sur les DEUX `openGame()` de la partie "LIGUE
      PARTAGÉE" (session principale et session de vérification indépendante
      — sans quoi cette seconde fenêtre déclenchait elle aussi un
      rechargement parasite en tâche de fond après la fermeture du
      serveur, bruit inoffensif pour l'assertion mais évitable).
    - Nouveau `ordres_validate_concurrent_refresh_test.js` : reproduit
      EXPLICITEMENT la concurrence (plutôt que de dépendre d'une vraie
      course réseau non déterministe) — appelle `validateOrdres()` puis,
      dans le même tour de boucle d'événements (avant le moindre `await`
      résolu), `refreshFromServerAndReenter()`, pour la journée IMMÉDIATE
      (scénario le plus proche du cas de Diablue) ET la journée FUTURE.
      Instrumente `window.fetch` pour vérifier, dans l'ordre réel des
      requêtes réseau, que le GET `/api/save` du rechargement ne démarre
      JAMAIS avant que les requêtes de validation n'aient reçu leur
      réponse — la garantie structurelle du correctif, pas seulement l'état
      final. **Vérifié activement régressif sans le correctif** : la ligne
      de garde retirée temporairement (`git` absent de ce dépôt, retrait/
      restauration manuels du fichier) fait échouer ce nouveau test de
      façon reproductible (`ordresValidatedRound` perdu, GET `/api/save`
      démarré avant la fin de `/api/lineup`), confirmant qu'il détecterait
      une régression future.

    **Tests** : `ordres_validate_without_edit_test.js` passe désormais
    (les deux parties, SOLO et LIGUE PARTAGÉE) — n'est PLUS un échec
    "attendu". `ordres_validate_concurrent_refresh_test.js` (nouveau) passe.
    Suite complète (`run_final.sh`, 123 fichiers avec le nouveau test,
    séquentiel) relancée intégralement : **123 passent/0 échec** — y
    compris tous les tests historiquement flaky de la liste ci-dessous
    (aucun n'a échoué sur cette passe, coup de chance de timing, pas une
    preuve qu'ils ne sont plus flaky).

    **Reste à faire** : livrer sur le Mac (comme tout le reste de ce
    fichier) ; pas de moyen de confirmer avec certitude que c'est bien CE
    QUI est arrivé à Diablue sans sa sauvegarde/les logs serveur exacts de
    ce match précis — à garder à l'esprit s'il resignale un cas similaire
    après ce correctif (chercher alors une AUTRE cause).

14. **✅ LIVRÉ SUR LE MAC ET POUSSÉ (commit `5e6d722`) — bug tailles de
    police du tableau de bord (refonte "Soir de match", point 10)** — retour
    utilisateur avec captures de la page live (pullup-030q.onrender.com) :
    "retravaille les tailles de police stp, c'est trop grand", puis "tu peux
    prendre aussi plus de largeur sur la page je pense".

    **Root cause, vérifiée par capture d'écran réelle (vrai serveur local +
    Playwright, PAS jsdom, sur `moteurbasket3.html` tel quel)** : le nom du
    club dans le bandeau "Prochain match" (`.hm-hero__name`) retournait à la
    ligne LETTRE PAR LETTRE même pour un nom COURT ("Lyon", 4 lettres, pas
    besoin d'un nom long pour reproduire) — pas juste "trop gros", un vrai
    bug de mise en page. Cause exacte : `.hm-hero__teams` est une grille à 3
    pistes (`minmax(0,1fr) auto minmax(0,1fr)`) dans une page plafonnée à
    960px (`.wrap`, `clubSection` absent de `WIDE_PAGE_IDS`) ; une fois le
    blason (104px) et l'espace (22px) retirés de la colonne restante, il ne
    restait qu'une centaine de pixels pour un nom à 54px — largeur
    insuffisante même pour "LYON" sans coupure. `overflow-wrap:anywhere`
    (nécessaire au cas où un nom déborde) a un effet de bord connu en
    flex/grid : il autorise le moteur de mise en page à réduire la largeur
    "min-content" de la boîte jusqu'à UN SEUL caractère plutôt que de
    respecter la largeur du mot le plus long — d'où l'empilement vertical.

    **Correctif (les deux retours utilisateur, tailles ET largeur)** :
    - `clubSection` ajouté à `WIDE_PAGE_IDS` (voir `showPage`) — même
      mécanisme déjà utilisé par Effectif/Coupe/Ordres/Fiche joueur/
      Comparateur, le tableau de bord n'y était pour aucune raison
      particulière (juste pas encore fait lors de la refonte). `.hm-main`
      (conteneur réel du contenu, `flex:1; min-width:0`) s'étend déjà
      correctement à la largeur disponible, aucun autre changement de mise
      en page nécessaire pour ça.
    - `overflow-wrap:anywhere` → `overflow-wrap:break-word` sur
      `.hm-hero__name` (coupe seulement un mot isolé trop long en dernier
      recours, ne réduit plus le min-content de la boîte à un caractère) +
      `flex-shrink:0` sur le blason + `min-width:0` sur le bloc nom/bilan
      (pour que `break-word` puisse s'appliquer sans forcer un débordement).
    - Tailles réduites dans `.hm-dash` (toutes proportionnelles, breakpoints
      `@media` associés mis à jour dans le même sens) : nom du club hero
      54px→30px (1200px : 42→24), "VS" 88px→48px (700px : 56→38), date
      22px→15px, blason hero 104px→76px (1200px : 80→60, SVG du dégradé
      inchangé, juste la taille CSS de l'écusson), titres de carte (`.hm-h2`,
      fil d'actualité) 26px→19px, chiffres clés (`.hm-kpi__value`) 44px→28px
      (le "small" à côté 22px→16px), jauges rondes Supporters/Alchimie
      (`.hm-gauge__value`) 40px→28px avec l'anneau SVG lui-même redimensionné
      en cohérence (112px→92px, rayon 46→38, épaisseur 10→8 — sans ce
      changement le cercle SVG à taille fixe aurait débordé du conteneur
      réduit en CSS).

    **Vérifié visuellement** (pas seulement lu le CSS) : script Playwright
    jetable contre un VRAI petit serveur local (mêmes `startTestServer`/
    sauvegarde par défaut que les tests, club renommé directement dans le
    fichier de sauvegarde pour rejouer EXACTEMENT le cas signalé) —
    captures avant/après avec "Gotham Knights" (le nom du signalement
    utilisateur) à 1440px et 1800px de large : le nom tient maintenant sur
    une seule ligne, budget/effectif/salle ne débordent plus de leur
    carte. Testé aussi un nom délibérément absurde (9 mots) pour confirmer
    que le pire cas fait un retour à la ligne normal, MOT par mot (jamais
    plus lettre par lettre) — script jetable supprimé après usage, jamais
    committé.

    **Tests** : `dashboard_e2e_test.js` et `dashboard_feed_test.js`
    repassés individuellement, tous verts (CSS pur, aucune assertion sur
    des tailles/classes calculées n'a été touchée) ; suite complète
    (`run_final.sh`) relancée en fond pour confirmer aucune régression
    ailleurs.

    **Complément (même retour utilisateur, même session, 2026-09-25)** :
    "pour les jauges, il faudrait reprendre les règles de couleur qu'on a
    sur les jauges et les nombres ailleurs (rouge, orange, blanc, vert)" —
    les jauges rondes Supporters/Alchimie du bloc "Pouls du club" gardaient
    une couleur d'anneau FIXE par jauge (orange pour Supporters, bleu pour
    Alchimie — choix visuel d'origine du prestataire), alors que le CHIFFRE
    au centre suivait déjà `moraleGaugeColor` (mêmes 4 paliers que partout
    ailleurs — Ordres, Effectif, Marché, Humeur des supporters, voir
    `attr_color_scheme_everywhere_test.js`). `dashGauge()` colore
    maintenant l'anneau ET le chiffre avec `moraleGaugeColor(value)` ; le
    paramètre `color` fixe retiré de sa signature et des deux appels dans
    `dashRenderPulse()`. Vérifié visuellement (capture ci-jointe à
    l'utilisateur) : Supporters=10 → anneau + chiffre rouges, Alchimie=90 →
    anneau + chiffre verts.

    **Fichiers touchés** : `moteurbasket3.html` uniquement (CSS `.hm-*`
    dans le `<style>` du tableau de bord + `WIDE_PAGE_IDS` + `dashGauge()`/
    `dashRenderPulse()`).

    **Complément 2 (même session, 2026-09-25, sur capture de la page live)**
    :
    - "enlève le donnez vos ordres à côté d'identité du club et décale le
      bouton identité du club à sa place" — le bouton "Donnez vos ordres" de
      l'en-tête du tableau de bord (`dashRenderHeader`) faisait doublon avec
      celui du topbar global ET celui du bandeau "Prochain match"
      ("Préparer le match"). Retiré ; `.hm-head__identity-btn` a déjà
      `margin-left:auto` (CSS existante), donc "Identité du club" prend
      naturellement sa place à droite sans changement CSS.
    - "les jauges effectifs et staff doivent reprendre le meme code couleur"
      — même logique que le complément 1 ci-dessus (`moraleGaugeColor`),
      appliquée cette fois aux DEUX KPI restants qui en étaient dépourvus :
      Effectif (niveau moyen, déjà une échelle 0-100 : couleur du texte
      "Niveau X" ET de la barre `.hm-bar__fill`) et Staff (postes pourvus,
      ramené sur une échelle 0-100 via `filled/total*100` puisqu'il n'a que
      `DASH_STAFF_ROLES.length + 1` valeurs possibles — remplace l'ancien
      tout-ou-rien rouge/neutre ; couleur appliquée au chiffre ET aux
      pastilles pourvues).
    - "dans la brique salle mets plutôt le nombre de spectateur moyen (au
      global) éventuellement avec le %[...] ça permettra de réduire la
      hauteur de toutes les briques [...] et de ne pas avoir du vide" — la
      carte KPI "Salle" affichait 3 chips de prix (Gradins/Tribune/Loges)
      qui passaient sur 2-3 lignes et étiraient TOUTE la rangée de cartes
      (grille CSS, hauteur alignée sur la plus haute) : remplacés par une
      seule ligne d'affluence moyenne à domicile, calculée sur le même
      historique que l'onglet Salle (`teamA.attendanceHistory`, jusqu'aux 10
      derniers matchs à domicile — aucune donnée inventée, repli "Aucun
      match à domicile joué" tant que l'historique est vide, nouveau champ
      `data.arena.avgAttendance` dans `dashboardDataFromGameState()`). Les
      prix de billets restent modifiables sur la vraie page Salle
      (inchangée), simplement plus dupliqués ici.

    **Vérifié visuellement** (captures à 1440px et 1800px, historique
    d'affluence simulé sur 2 matchs) : les 4 cartes KPI ont maintenant la
    même hauteur, plus de vide sous Effectif/Staff.

    **Tests** : `dashboard_e2e_test.js`/`dashboard_feed_test.js` repassés,
    verts ; aucun test existant ne référençait les chips de prix retirées ni
    le bouton d'en-tête retiré. Suite complète relancée en fond.

    **Fichiers touchés** : `moteurbasket3.html` uniquement
    (`dashRenderHeader`, `dashRenderKpis`, `dashboardDataFromGameState`).

    **Complément 3 (même session, 2026-09-25) — doublon "Cette semaine" /
    "Fil d'actualité"** : retour utilisateur "fil d'actualité et cette
    semaine, ça ne fait pas un peu doublon ?", confirmé dans le code (pas
    qu'une impression) : Interview en attente, Staff vide et Budget négatif
    poussaient CHACUN à la fois une tâche dans "Cette semaine"
    (`dashBuildTasks`) ET une entrée strictement identique (même titre, même
    bouton) dans le fil (`handleGameEvent` case "interview", et
    `checkThresholds` clés `alert_staff`/`alert_budget`) — les deux
    disparaissant ensemble une fois réglées. Seule "Ordres de match" n'était
    pas dupliquée (pas d'équivalent côté fil). Option choisie par
    l'utilisateur parmi 3 proposées : retirer le doublon DU FIL, "Cette
    semaine" reste la seule liste actionnable en haut, le fil redevient un
    historique pur.

    **Ce qui reste donc dans le fil** (inchangé, jamais dupliqué avec "Cette
    semaine") : résultat de match (`match_played`), récap de journée
    (`league_round`), blessure/retour (`injury`/`injury_healed`), arrivée/
    départ de joueur (`transfer_in`/`transfer_out`), recrutement de staff
    (`staff_hired`), et les alertes d'humeur Supporters/Alchimie hors zone
    confortable (`mood_supporters`/`mood_chemistry`, via `feedMoodEntry` —
    PAS affichées dans "Cette semaine", donc légitimement propres au fil).
    `offer_received`/`offer_closed` existent aussi dans le code mais ne sont
    jamais émis aujourd'hui (aucune offre spontanée d'un club adverse,
    question déjà ouverte ailleurs dans ce fichier).

    **Correctif** : `handleGameEvent` case `"interview"` (engine.js ET son
    miroir moteurbasket3.html) retourne désormais `null` sans pousser
    d'entrée ; `checkThresholds` ne pousse plus `alert_staff`/`alert_budget`
    mais continue de les nettoyer SANS CONDITION (`removeByKey`, plus de
    branche `else`) à chaque passage — migration : toute entrée déjà
    poussée AVANT ce correctif sur une sauvegarde existante se nettoie
    d'elle-même au prochain rafraîchissement hebdomadaire (`trainWeek`) ou à
    la résolution de l'interview concernée (`interview_done` reste
    inchangé), plutôt que de rester coincée indéfiniment dans le fil.

    **Tests** : `dashboard_feed_test.js` largement réécrit sur ce point
    (assertions inversées : plus aucune entrée `interview_<id>`/
    `alert_staff`/`alert_budget` créée ; nouveaux tests dédiés au nettoyage
    migration, entrée pré-poussée manuellement puis vérifiée nettoyée) ;
    `dashboard_e2e_test.js` (partie 4) réécrit pour vérifier l'ABSENCE
    d'entrée de fil ET que le bouton "Répondre" de la tâche "Cette semaine"
    ouvre toujours la vraie modale d'interview. `post_match_interview_button_test.js`/
    `milestone_interview_and_mvp_test.js` (ne touchent pas le fil) repassés
    par sécurité, verts. Suite complète relancée en fond.

    **Fichiers touchés** : `engine.js`, `moteurbasket3.html` (miroir),
    `dashboard_feed_test.js`, `dashboard_e2e_test.js`.

    **Livré sur le Mac et poussé** (commit `5e6d722`).

    **Complément 4 (2026-09-25, sur capture de la page live) — logo de
    l'adversaire non chargé** : retour utilisateur avec 2 captures du
    bandeau "Prochain match" en production (match vs "BC Dia") — l'écusson
    adverse s'affichait en simple rond de couleur uni avec les initiales
    "BD", pas une image de logo. "le logo de l'adversaire n'est pas chargé,
    il faudrait qu'il le soit".

    **Ce n'était pas un problème de chargement réseau** : un adversaire
    généré par le moteur n'a JAMAIS de logo personnalisé —
    `customLogoDataUrl` n'existe que pour un club `isPaying`
    (`club.logoUrl` dans `dashboardDataFromGameState()` ne le résout que
    pour `teamA`), et seul le joueur humain peut passer payant (voir
    `Team.setPaying`) ; `dashboardTeamRef()` (utilisé pour l'adversaire) ne
    résout même pas de `logoUrl` du tout. Il n'y avait donc rien à
    "charger". **Le vrai bug** : `dashCrest()` retombait sur un simple rond
    de couleur + texte d'initiales à la place — alors que le reste du jeu
    (calendrier, live, etc.) a déjà un logo générique "ballon" dédié à ce
    cas (`defaultTeamLogoSvg`/`teamLogoHtml`, voir leur commentaire d'origine
    : retour utilisateur "faut un ballon avec le nom de l'équipe dedans,
    un truc pas trop moche") — le tableau de bord avait réinventé un
    fallback différent (et plus pauvre) au lieu de réutiliser celui déjà
    en place. Incohérence visuelle, pas un bug de chargement.

    **Correctif** : `dashCrest()` appelle désormais `dashDefaultCrestSvg()`
    (nouvelle fonction) quand il n'y a pas de `logoUrl` — même dessin
    SVG que `defaultTeamLogoSvg` (ballon orange, coutures, anneau coloré,
    initiales au centre), adapté pour prendre les valeurs déjà résolues par
    le tableau de bord (`colors.primary`, `shortName`) plutôt qu'une
    instance `Team` complète, car `dashCrest` est aussi appelé pour
    l'adversaire (un simple `dashboardTeamRef`, pas un `Team`, donc pas de
    `jerseyColor` brut disponible). Le logo personnalisé d'un club payant
    (`<img>`) reste inchangé.

    **Vérifié** : script Playwright jetable contre un vrai petit serveur
    local (capture ci-jointe à l'utilisateur) — club ET adversaire
    affichent maintenant le ballon générique avec initiales, anneau coloré
    par équipe ; plus aucun rond plat. Nouveau test dédié ajouté à
    `dashboard_e2e_test.js` (partie 5 bis) : vérifie qu'aucun `<img>` n'est
    utilisé tant qu'aucun club n'est payant, que le SVG générique est
    présent pour les deux écussons, et que l'`aria-label` nomme le bon
    club. Suite complète relancée en fond.

    **Fichiers touchés** : `moteurbasket3.html` uniquement (`dashCrest()`
    nouvelle fonction `dashDefaultCrestSvg()`), `dashboard_e2e_test.js`.

    **Livré sur le Mac et poussé** (commit `70e1f31`).

    **Complément 5 (2026-09-25, sur nouvelle capture de la page live) —
    vrai bug trouvé APRÈS le Complément 4 : le fallback était corrigé, mais
    un adversaire avec un VRAI logo personnalisé ne l'affichait toujours
    pas** : retour utilisateur avec capture de la fiche équipe "BC Dia"
    (onglet "Aperçu") montrant un logo personnalisé bien réel (image
    distincte, pas le ballon générique), alors que le bandeau "Prochain
    match" du tableau de bord affichait toujours le ballon générique pour
    ce même club. "ça ne charge pas son logo personnalisé".

    **Root cause** : `dashboardTeamRef(idx, team)` (le petit gabarit
    `{id,name,shortName,colors}` construit pour l'adversaire, voir
    `dashboardDataFromGameState()`) ne résolvait `logoUrl` dans AUCUN cas —
    contrairement à `club` (le joueur), qui lui résout bien
    `(teamA.isPaying && teamA.customLogoDataUrl) ? ... : null`. Le
    Complément 4 avait corrigé le fallback (ballon générique au lieu d'un
    rond plat) sans remarquer que le VRAI logo de l'adversaire n'était
    jamais transmis à `dashCrest()` en premier lieu, quel que soit son
    état. Comme `isPaying`/`customLogoDataUrl` existent sur CHAQUE `Team`
    (pas un champ réservé à `teamA`), un adversaire peut légitimement en
    avoir un — notamment en ligue partagée multi-manager, où l'"adversaire"
    est le club d'un autre vrai manager, qui peut passer payant et charger
    son propre logo exactement comme le joueur.

    **Correctif** : `dashboardTeamRef()` résout désormais `logoUrl` avec
    EXACTEMENT la même expression que `club.logoUrl`, appliquée à `team`
    (l'adversaire) au lieu de `teamA`. `dashCrest()` n'a pas eu besoin de
    changer : il utilisait déjà `team.logoUrl` en priorité sur le ballon
    générique, c'est juste que ce champ n'arrivait jamais jusqu'à lui pour
    l'adversaire.

    **Vérifié** : script Playwright jetable — adversaire forcé `isPaying`
    avec un `customLogoDataUrl` factice (simule un autre manager payant) :
    son écusson devient bien un `<img>` pointant vers CE logo, tandis que
    le club du joueur (toujours gratuit) garde le ballon générique. Nouveau
    test dédié (`dashboard_e2e_test.js`, partie 5 ter) : force `teamB` à
    être payant avec un logo, re-rend via `renderClubSection()`, vérifie
    que SEUL l'écusson adversaire devient un `<img>` avec la bonne `src`.

    **Fichiers touchés** : `moteurbasket3.html` uniquement
    (`dashboardTeamRef()`), `dashboard_e2e_test.js`.

    **Même retour utilisateur, deux demandes de forme de bouton** :
    - "modifie la forme des boutons préparer le match (renomme en modifier
      vos ordres) et scouter bc dia pourqu'il ait la meme forme que les
      autres boutons du jeu (modifier vos ordres en haut à droite)" — les
      2 boutons d'action du bandeau "Prochain match" (`.hm-btn--display`)
      avaient un `border-radius:12px` propre au tableau de bord, différent
      de la pilule (`border-radius:999px`) de `button.topbar-cta` (le VRAI
      bouton "Modifier vos ordres"/"Donnez vos ordres" en haut à droite,
      référence de forme citée par l'utilisateur) utilisée partout ailleurs
      dans le jeu. `.hm-btn--display` passé à `border-radius:999px` (seul
      utilisateur de cette classe : les 2 boutons du bandeau, aucun effet de
      bord ailleurs) ; "Préparer le match" renommé en "Modifier vos ordres"
      (libellé statique, comme demandé — pas de logique dynamique
      "Donnez"/"Modifier" ajoutée, non demandée).
    - "idem pour identité du club stp" — même correctif de forme sur
      `.hm-head__identity-btn` (10px hérité de `.hm-btn` → 999px).

    **Vérifié** : capture Playwright + lecture de `getComputedStyle(...).borderRadius`
    des 3 boutons contre celui de `#topbarOrdersBtn` (référence) : les 4
    valeurs sont identiques (`999px`). Même test `dashboard_e2e_test.js`
    (partie 5 quater) que ci-dessus, vérifie aussi le nouveau libellé.

    **Fichiers touchés** : `moteurbasket3.html` uniquement (CSS
    `.hm-btn--display`/`.hm-head__identity-btn`, libellé dans
    `dashRenderNextMatch`), `dashboard_e2e_test.js`.

    **Livré sur le Mac** (synchronisé et vérifié identique octet pour
    octet à la sandbox). **Reste à faire** : committer + pousser — script
    prêt : `livrer_dashboard_fixes.sh` (à la racine du dépôt sur le Mac),
    à lancer par l'utilisateur depuis son terminal.

    **⚠️ NOTE 2026-09-25 (incident DEV_NOTES.md)** : ce fichier a été trouvé
    VIDE (0 octet) dans l'arborescence de travail alors que ce Complément 5
    n'avait pas encore été committé — probablement écrasé par une autre
    session travaillant en parallèle sur le même dossier (Économie/Salle/
    Analyse d'équipe, voir commits `b59ba7c`..`d6ba5a9`). Reconstruit ici à
    partir du dernier `HEAD` commité (qui, lui, était intact) + réapplication
    de ce Complément 5 depuis une copie de sauvegarde. Si ce fichier venait
    à sembler tronqué ou à perdre du contenu récent une nouvelle fois,
    comparer d'abord avec `git show HEAD:DEV_NOTES.md` avant de supposer
    qu'une entrée a été perdue pour de bon — et éviter que deux sessions
    committent DEV_NOTES.md en parallèle sans avoir relu l'état de l'autre
    au préalable.

    **Complément 6 (2026-09-25) — polices du tableau de bord pas alignées
    sur le reste du jeu** : retour utilisateur, sur une capture du tableau
    de bord après les correctifs ci-dessus : "on a bien les mêmes polices
    que sur le reste du jeu ?". Question légitime : NON, pas tout à fait.

    **Root cause** : `.hm-dash` définit ses propres `--display`/`--body`
    (`"Barlow Condensed", "Arial Narrow", sans-serif` et `"DM Sans",
    system-ui, sans-serif`), jamais chargées (aucun lien Google Fonts dans
    ce projet). Le commentaire d'origine au-dessus de `.hm-dash` affirmait
    que ça "retombe automatiquement sur la pile système" — FAUX pour
    `--display` : son deuxième choix, `"Arial Narrow"`, est une VRAIE
    police étroite installée sur la plupart des systèmes (pas un simple nom
    de repli générique comme `sans-serif`), donc les titres/chiffres du
    tableau de bord (noms d'équipe, chiffres clés, boutons `--display`)
    s'affichaient réellement dans une police plus condensée que le reste du
    jeu — PAS la même pile que `body{}` tout en haut du fichier. Même
    incohérence de nature que celle déjà corrigée sur la page Économie (voir
    commit `b59ba7c`, "police système du jeu à la place de la Barlow
    Condensed") : le tableau de bord n'avait juste pas reçu le même
    traitement. `--body` était moins grave (`system-ui` ≈ souvent le même
    rendu que la pile explicite ailleurs) mais gardait quand même un nom de
    police (`"DM Sans"`) sans rapport avec le reste de l'appli.

    **Correctif** : `--display`/`--body` sur `.hm-dash` remplacés par
    EXACTEMENT la même pile que `body{}` (et que `.eco-page`/
    `#scoutingProPanel`, déjà alignées) :
    `-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif`.
    Commentaire au-dessus de `.hm-dash` corrigé (il affirmait à tort un
    repli déjà correct).

    **Vérifié** : script Playwright jetable contre un vrai Chromium (pas
    seulement jsdom, qui ne résout pas `var(--display)` À L'INTÉRIEUR d'un
    raccourci `font-family`) — `getComputedStyle(...).fontFamily` du nom de
    club, des chiffres clés et des boutons du bandeau valent maintenant
    TOUS exactement `-apple-system, BlinkMacSystemFont, "Segoe UI",
    Helvetica, Arial, sans-serif`, identique à `body{}`. Capture
    avant/après jointe à l'utilisateur. Nouveau test dédié dans
    `dashboard_e2e_test.js` (partie 5 quinquies) : vérifie la valeur BRUTE
    de la custom property `--display`/`--body` sur `.hm-dash` (ce que jsdom
    résout correctement, contrairement au raccourci `font-family`).

    **Fichiers touchés** : `moteurbasket3.html` uniquement (`--display`/
    `--body` de `.hm-dash` + commentaire), `dashboard_e2e_test.js`.

    **Livré sur le Mac** (synchronisé et vérifié identique octet pour
    octet à la sandbox, `dashboard_e2e_test.js` relancé en sandbox : vert).
    **Reste à faire** : committer + pousser — même script que le
    Complément 5 ci-dessus (`livrer_dashboard_fixes.sh`, commit unique
    couvrant logo/boutons/polices), à lancer par l'utilisateur.

    **Note (nettoyage, fait)** : `push_logo_fix.sh`, `push_dashboard_fixes.sh`
    et `_devnotes_head_scratch.md` (scripts/scratch devenus obsolètes
    d'échanges précédents) supprimés du dépôt sur le Mac à la demande de
    l'utilisateur ("Supprime ce qui ne sert à rien"), après autorisation
    explicite de suppression (`device_request_delete_permission`,
    normalement refusée par défaut dans un dossier connecté). `"Claude
    outputs/"`, d'origine incertaine (peut-être propre à l'utilisateur),
    volontairement laissé en place.

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
  CORRIGÉ (voir point 13 ci-dessus)** : ce n'était pas le bug Ordres qu'il
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
