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

- **🟡 EN COURS (2026-10-08) — Commentaire audio du direct 2D (voix d'un
  ami clonée par IA, avec son accord écrit)**. Lecteur livré :
  `assets/live/commentary.js` (MOMENTS = 23 moments × 3–4 phrases ; ces
  phrases SONT la liste à générer avec la voix). Le terrain (`court2d.js`,
  `opts.onMoment`) annonce chaque moment à l'instant où il l'anime, jamais
  onglet masqué (pas de rattrapage). Bouton « Commentaire » (haut-parleur)
  dans l'en-tête du terrain, désactivé par défaut, préférence dans le
  navigateur (`localStorage hm-commentary`). Règles : une voix à la fois,
  moment fort coupe un petit, délai mini entre phrases ordinaires
  (GAP_MS), pas deux fois la même variante. Fichiers :
  `assets/audio/commentary/fr/<moment>_<n>.mp3` + `manifest.json`
  (`files: { moment: nbVariantes }`, `version` = cache des mp3, à monter à
  chaque nouvelle génération) ; sans fichier → voix de synthèse du
  navigateur (provisoire). Lecture Web Audio (débloquée par le geste du
  bouton, iPhone OK, pas de Range côté serveur) ; serveur : .mp3/.json
  ajoutés à la liste blanche des assets. Test : `live_commentary_test.js`.
  **Reste** : déposer les mp3 générés + remplir le manifest ; puis
  éventuellement noms des joueurs (phrases génériques pour l'instant),
  anglais / italien.

- **🟢 LIVRÉ (2026-10-08) — Entretiens et communication du coach
  (dynamique de groupe, phases 1 à 5, maquette « talks » validée)**. Un
  seul système dans `assets/vestiaire.js` (section ENTRETIENS ET
  COMMUNICATION) : `Team.locker.coach` = confiance joueur ↔ coach, historique
  des discussions, communication publique, promesses (privées ET publiques,
  même mécanisme, vérifiées chaque semaine par `weeklyCoach` dans
  `weeklyUpdate` sur les vraies minutes / titularisations / prolongations),
  positions privée / publique par joueur → contradictions, indicateur de
  cohérence du coach. Réactions déterministes selon la personnalité (les 8
  caractéristiques mentales), propagation joueur → proches → groupe →
  vestiaire (`spread`). Entretiens recommandés (`recommendTalks` : crise,
  demande de transfert, promesse en retard = urgences hors quota ; ~12 j par
  joueur ; 3 par semaine). Interviews de jalon : question tirée du vestiaire
  (`interviewQuestion` : tension, joueur frustré, leader, jeune, groupe ;
  facultative) → `applyStatement` ; chaque réponse est mémorisée
  (`recordComm`). Serveur : `POST /api/locker/talk` (actions.lockerTalk, fait
  autorité), `/api/media/interview` accepte `locker`. UI : onglet
  « Entretiens » du Vestiaire (assets/vestiaire-ui.js, club seulement),
  boîte d'entretien en bottom sheet sur téléphone, bloc de la question dans
  le popup d'interview. Tests : vestiaire_talks_test.js.
  Traductions EN / IT faites (bloc en tête de en.js / it.js, aussi la bulle
  des jetons de l'arène). Ancienneté au club : même règle que le moteur
  (playerClubSinceSeason), plus de « 2e saison » par défaut.
  RESTE : équilibrage après quelques semaines de jeu réel (poids des
  réactions, seuils) ; autres langues (es, de, pt, pl, el, lt, zh).

- **🔵 EN COURS (2026-10-08) — Terrain 2D (rendu) puis mise en scène du
  live (coach, entrée des joueurs, shows)**. Décisions utilisateur : bêta
  `liveShows` par club (Gotham Knights + BC Dia, comme `live2d`) ;
  personnalisation du coach ouverte à tous, proposée en dernière étape du
  tutoriel de première partie ; pub non premium = interstitiel H5 existant
  (cache le show) ; PAS de stats sous les portraits du haut, PAS de
  marqueurs de tirs ✕/○, jetons restent carrés arrondis ; pause fin
  Q1/Q3 ramenée de 4 à 2 min. Ordre : terrain priorité 1 (anti-chevauchement,
  porteur mis en évidence, paniers vus de dessus) → mise en scène.
  Priorité 1 terrain FAITE (court2d.js / live.css, rendu seul) :
  anti-chevauchement `declutter()` (décalage d'affichage sp.ox/oy, 4 passes,
  porteur fixe, arbitres cèdent en premier, positions de scène inchangées),
  étiquettes `lab-sm` / `lab-off` (nom caché sous un jeton de devant via
  `labelUnder`), porteur toujours devant (tri z), halo pulsant aux couleurs
  de l'équipe (`.c2d-carrier-ring`, coupé si reduced-motion), ballon r 9.5
  posé sur le bord du jeton, paniers vus de dessus (`.c2d-hoop` : ombre,
  support, planche, cercle, filet). Crochets de test `placeAt` / `layout`.
  `QUARTER_BREAK_MS` 2 min. Version des fichiers du live : 20261008-3.
  Priorité 2 FAITE : lattes au ton alterné, ombre douce des jetons
  (dégradé), raquettes / zones à 3 pts aux couleurs du club qui reçoit
  (sans parquet Premium), pastille du numéro de maillot (`p.number`),
  tableau central (sigles, score, 24 s, « Q2 · 7:32 ») avec cartes des cinq
  à 76 px, fautes (5 pastilles, rouges à 4+) et barre d'énergie (100 -
  fatigue) sur les cartes. Fatigue : `MatchEngine.fatigueDelta()` (engine.js,
  lecture seule, paliers de 5, ~6 Ko par match) → `ev.fat` → `hmLive.fat` /
  adapter `st.fat` → `players[].fatigue`. Matchs déjà calculés : pas de barre.
  Version des fichiers du live : 20261008-4.
  ARÈNE LOT 1 (2026-10-08, validé et déployé) : court2d.js — plus de cartes joueurs en haut ni de cadre bleu ;
  géométrie SIDE/TOP/BOT autour du terrain (OX, OY) ; `drawArena` (statique,
  une fois par club) : tribunes (sièges en motif + spectateurs déterministes,
  ~48 % aux couleurs du club qui reçoit, sections `.c2d-fans` qui oscillent,
  sautent sur un panier à domicile), fondu au noir, panneaux LED (textes
  `state.arena.boards`), apron, supports des paniers, table de marque,
  chaises des bancs ; tableau d'affichage suspendu ; énergie (barre) et
  fautes (pastille ≥ 4) sous chaque jeton, bulle au toucher/survol ; banc
  des remplaçants (`.c2d-sub`, grisé si 5 fautes / blessé) ; changements :
  l'entrant marche banc → table → jeu, le sortant retourne à sa place
  (instantané hors direct / onglet masqué / reduced-motion) ; ombre du
  ballon selon sa hauteur ; reflets « vernis » ; flash + public debout sur
  3 pts / dunk / buzzer ; `ambience("show")` (salle tamisée + projecteurs)
  appelé par staging.js pendant l'entrée des joueurs et les shows.
  `state.arena` = hmLiveArena(club qui reçoit) : fill estimé
  (0.35 + humeur/110) et textes LED ; couleurs apron/sièges/LED
  surchargeables (`arena.apron/seats/led`). Bancs : BENCH (coach) x 22/72,
  SEAT_Y 58.6 ; table y 52.4 ; officiels STOP_Y 50.7 ; COACH_Y 55
  (staging). Téléphone : viewBox rogné (tribunes) sous 640 px de large ;
  paysage tactile : hauteur bornée à l'écran.
  RETOURS 2026-10-08 (faits) : tir = courte traînée de mouvement comme la
  passe (plus de pointillés) ; « +1/+2/+3 » = élément `.c2d-ptsf` attaché au
  jeton, 2 s (apparition, stable, fondu) puis supprimé, dédoublonné (plan +
  événement) ; public = spectateurs individuels (`.c2d-crowd .fan`, corps,
  tête, bras) en 12 cohortes mélangées, supporters h / a / n, mouvements de
  repos variés (balancement, déplacement, penché, bras), réactions
  `crowdReact` : panier (supporters de l'équipe qui marque debout bras en
  l'air, les autres s'affaissent), tir raté (déception), contre / 3 pts /
  dunk / buzzer (agitation plus forte, plus longue) ; arbitre de ligne de
  fond DERRIÈRE la ligne (REF_BEHIND 2,5 pieds, `bl`, borné après
  l'anti-chevauchement), en coordonnées terrain donc indépendant du zoom.
  CHANGEMENTS SUR ARRÊT DE JEU (2026-10-08) : engine.js `isDeadBall` (la
  possession doit SE TERMINER sur faute / lancers / ballon perdu hors
  interception / temps mort / blessure / exclusion) + pause entre deux
  quarts ; sinon le changement voulu (fatigue, fautes, minutes cibles)
  attend le prochain arrêt. Même règle dans le moteur miroir de
  moteurbasket3.html. ~34 changements / match (35,8 avant). Test :
  engine_dead_ball_subs_test.js. Pas de changement manuel en direct dans le
  jeu (les ordres sont fixés avant le match).
  ONGLET MASQUÉ / REPRISE (2026-10-08) : court2d.js `suspend` / `resync`.
  Cause : rAF s'arrête onglet masqué mais update() et la chorégraphie à
  minuteries (`later`) continuent (bridées, par paquets) → vols jamais
  finis, passes sur état figé, tout se déclenche au retour. Correctif :
  `visibilitychange` hidden → suspend (minuteries de mise en scène
  annulées, file vidée, événements seulement absorbés) ; visible → resync
  (recalage sur l'état du moteur : possession, `stoppage`, statut, cinq en
  jeu ; positions de formation / bancs posées, ballon au meneur de
  l'équipe du moteur, horloge de rendu remise à maintenant, aucun événement
  rejoué). Filets : trou d'images > 1,5 s → resync ; images bridées
  > 0,7 s (page visible mais rAF ralenti) → suspend jusqu'au retour
  d'images normales ; événement arrivé > 6 s après son airAt → absorbé +
  resync. `later` suit ses minuteries dans un Set (plus de liste qui
  grossit). Un seul rAF, un seul écouteur (retiré à destroy). Test :
  live_court2d_visibility_test.js.
  RESTE arène : polissage (tape dans la main plus
  visible, durée des déplacements selon la vitesse de lecture).
  PRIORITÉ 3 FAITE (2026-10-08) : court2d.js `traceTrail`/`endTrail`
  (groupe `.c2d-trails` sous le ballon) — chaque vol porte un `kind` :
  "pass" (traînée blanche pointillée) ou "shot0/1" (arc du tir, hauteur
  comprise, couleur de l'équipe) ; fondu puis suppression à l'arrivée ;
  rien si prefers-reduced-motion. « +1/+2/+3 » : classe `.pts tN`, plus
  gros, couleur de l'équipe, monte en flottant (c2dPtsFloat). PAS de
  marqueurs de tirs (décision utilisateur). Test : live_court2d_test.
  MISE EN SCÈNE FAITE (bêta liveShows, en prod pour Gotham Knights + BC Dia
  via la liste par défaut de server/featureFlags.js) :
  - Drapeaux : `server/featureFlags.js` (store « featureflags »),
    `GET /api/features`, `POST /api/admin/feature-flags` (correctif partiel),
    bêta par club `liveShows` (/api/admin/beta-feature). Client :
    `hmLoadFeatures` / `hmLiveShowsFlags` ; exige aussi `live2d`.
  - Module `assets/live/staging.js` (+ `characters.js`) branché sur
    court2d (`opts.staging` / `stagingModule`, calques `stg-coaches` sous les
    joueurs et `stg-front` au-dessus, `sp.stage` = position imposée à
    l'affichage). Piloté par `state.stoppage` (pauses serveur, quart fini
    dans `pause.quarter`) et `state.kickoffAt` : entrée 30 s avant le coup
    d'envoi (titulaires via `hmLiveIntroRoster`, ids « A:#id ») et 30 s avant
    la reprise, regroupement au temps mort, banc en fin de quart, shows
    `SHOW_FOR` (temps mort → pompom, fin Q1 → mascotte, fin Q3 → canon),
    durée = l'arrêt, arrivée en retard / saut = chacun à sa place.
  - Coach : `Team.coachLook` (tous, `/api/club/set-coach-look`),
    `AvatarGen.coachAvatar` (tenues costume / survêtement / polo, lunettes,
    casquette, clipboard, tablette), défaut stable (`coachSeedFor`, nom du
    club). Mascotte : `Team.mascot` (Premium, `/api/club/set-mascot`,
    `mascotFor` l'ignore sans Premium sans l'effacer), défaut = sigle.
    UI Personnalisation : `assets/club-staging-ui.js` (sorti de la page :
    limite 4 Mo). Tutoriel : étape « Votre coach » avant la fin.
  - Pub non premium : interstitiel H5 (`hmLiveShowAd`), une par arrêt,
    plafond `ads.maxPerMatch` (3), arrêt ≥ `ads.minStoppageMs` (25 s), repli
    silencieux ; suivi `/api/ads/track` (store « adsstats », compteurs du
    jour ; le clic n'est pas exposé par l'API H5).
  - Tests : live_staging_test.js, live_shows_access_test.js (+ court2d,
    onboarding_tour_test.js mis à jour).
  RESTE : traductions des nouveaux libellés (Coach, Mascotte, cartes de
  présentation) dans assets/i18n/* ; sur les matchs déjà calculés, pas de
  `pause.quarter` (repli sur state.quarter) ; mode spectateur sans entrée
  des joueurs ; remplaçants pas dessinés sur le banc (pas de jetons de banc).
  SORTIE DE BÊTA (sans redéploiement) :
    1. ouvrir le terrain 2D à tous (prérequis : `live2d`, voir plus haut) ;
    2. `POST /api/admin/feature-flags` avec `{"liveShows":{"mode":"all"}}`
       (en-tête X-Admin-Token) ; retour arrière : `"mode":"whitelist"` ou
       `"off"` ; couper une brique : `{"liveShows":{"shows":false}}`.

- **🟡 EN BÊTA EN PROD (2026-10-08) — live 2D v2, activé pour Gotham
  Knights et BC Dia seulement** (poussé 79b1fce, drapeaux posés en prod le
  2026-10-08, `betaFeatures:["live2d"]`, ligue fr-1). Sans bêta : carte des
  tirs, comportement inchangé. RESTE :
  1. Revue en conditions réelles (match de club ; un match de sélection ou
     d'un autre club via le mode spectateur affiche la même vue).
  2. Après validation : ouvrir à tous (poser le drapeau club par club via
     `POST /api/admin/beta-feature`, ou retirer le `court2d:` conditionnel
     dans hmLiveReset / spectateMountLiveView). Retrait : même appel avec
     `"enabled": false`.
  2026-10-08 : plus aucune marque de tir manqué sur le terrain 2D (croix,
  onde rouge, texte) — la carte des tirs reste la source ; `addMiss` /
  `syncMisses` retirés de court2d, `rimFx` ne joue que sur panier.
  2026-10-08 (lot arbitres) : 3 arbitres (avatars gris `AvatarGen` polo
  staff, `hmLiveReferees` → `dress.referees`, chef / queue / centre côté
  ballon, table de marque aux arrêts), éclairage (dégradés SVG sous les
  lignes, 1 couche, 58 fps), dribble continu, représentation 8 s / retour
  en zone (le moteur n'a PAS de règle des 8 s ni de retour en zone : rien
  d'inventé, le porteur traverse avant 5,5 s et ne revient pas), bannière
  CONTRE / BLOCK (`hmI18n.t("Contre")`, uniquement sur `blocked` moteur à
  l'arrivée de l'événement), cartes des cinq = nom seul contenu
  (`textLength`), temps mort : bancs de part et d'autre de la table
  (`BENCH[team]`), plan / remise en jeu / `giveBall` neutralisés pendant un
  arrêt (`stopUntil`). Vérifié navigateur (Playwright `lot7.js` sandbox) :
  temps morts A et B, 2 contres à airAt, passage Q1 → Q2, reprise.
  Détails livrés : `liveState` centralisé ; contexte de possession + delta
  de stats sur chaque événement moteur (`MatchEngine.statsDelta`) ; feuille
  en direct par deltas ; chrono des 24 s source unique ; court2d guidé par
  les faits (passes réelles, type de tir, défenseur, rebond, faute,
  célébration) ; `assets/live/adapter.js` + mode spectateur / sélections sur
  la même vue. Non fait (secondaire) : pause / vitesse en rediffusion,
  navigation par événement, sons, mesure Safari / iPhone, migration du
  direct de son propre club (hmLive*) vers l'adaptateur partagé. Suite
  complète : 291 / 312 verts ; les 21 autres échouent aussi sur origin/main
  (préexistants : attr_color_scheme, club_history, cup_ordres_planning,
  engine_balance (statistique), personnalisation_tab, premium_features,
  private_league_ui, server/actions, italy, national_cup, world_season,
  staff_v2_ui, super_cup, world_market) ou passent seuls (délais sous
  charge).
- **🟠 À FAIRE — Économie, masse salariale en 3 lignes** (retour
  2026-09-30 : « joueurs, staff, centre de formation, ça fait trop de lignes
  sinon ») : agréger le staff (entraîneur, analyste, recruteur, médecin,
  kiné, adjoint) en une ligne « Staff » dans `renderEconomieSection`
  (moteurbasket3.html, `payroll`) ; détail par poste dans l'onglet Staff.
  Code prêt côté sandbox (mis de côté le 2026-10-07 à la demande de
  l'utilisateur : livrer le live seul).
- **🔵 Audit des attributs (2026-10-06) — FAIT ET POUSSÉ ; reste à suivre.**
  Rôles distincts (engine.js, en-tête « Audit des attributs ») : pari
  d'Interception, Pénétration = volume d'attaques du cercle, dissuasion du
  Contre, Vitesse seule en transition / Accélération seule au premier pas,
  Décision = refus d'un tir très contesté, Sang-froid = pression + money-time
  (plus de moyenne mentale en match), Détermination = entraînement + moral
  après défaite, Puissance gardée (duel contre la Force). Génération
  corrélée (ATTR_FAMILIES). POSITION_KEY_WEIGHTS : 75 % effet mesuré × profil
  du poste + 25 % anciens poids. Mesure (+20, toute l'équipe, 1 200 matchs) :
  Déf. ext. +4,7, Rebond +3,4, Dribble +3,3, Agilité +3,1, Jeu int. +2,8,
  Interceptions +2,6, Force +2,2 … Pénétration ≈ +0,6, Passe +0,4,
  Leadership ≈ 0. Reste : la Passe et la Pénétration pèsent peu en match ;
  le moteur miroir de moteurbasket3.html (mode local, très divergent) n'a
  pas reçu ces mécaniques.

- **🟡 Sélections nationales (2026-10-05) — phase A FAITE ET POUSSÉE
  (élections, mandats, page Sélections : server/nationalTeams.js,
  assets/national.js) ; phases B à E À FAIRE.** Décisions de l'utilisateur :
  - 17 pays du jeu, sélections A et U21 (pros de 21 ans au plus, pas
    l'académie). Le sélectionneur voit attributs, forme et condition des
    éligibles ; jamais salaire, contrat, finances ni potentiel exact.
  - Mandat de 2 saisons ; élection en semaine 1 (3 j candidatures + 3 j
    vote) ; A et U21 élues en alternance (jamais la même saison) ; candidat
    dans n'importe quel pays, vote seulement dans le pays de son club.
  - Chaque saison : 3 fenêtres internationales le dimanche (éviter le
    dimanche de l'All-Star, semaine 4, et les amicaux), fatigue normale.
  - Phase finale pendant la DERNIÈRE semaine (intersaison, seule la
    Supercoupe s'y joue côté clubs), du lundi au dimanche à 20h :
    saison 1 du mandat = compétition continentale (Euro, AmeriCup, Coupe
    d'Asie) ; saison 2 = Coupe du monde pour les qualifiés AU CLASSEMENT
    de la compétition continentale, tournoi consolante pour les autres.
  - Supercoupe (samedi 20h de cette semaine) : un joueur dont la sélection
    est encore en course en demi-finale ne la joue pas ; un joueur dont la
    sélection est éliminée avant les demi-finales (poules, quarts) la joue
    normalement (retour utilisateur 2026-10-05).
  - **Semaines de compétition internationale : récupération des joueurs
    MAXIMISÉE** (matchs quotidiens sans usure cumulée).
  - Jamais déplacer ni supprimer un match de club ; matchs nationaux avec
    leur propre clé de compétition, exclus des stats de club.
  - FAIT (2026-10-05) : page équipe de chaque sélection (Aperçu, Groupe,
    Calendrier, Sélectionneurs, Palmarès ; `/api/national/team`,
    `teamView`), groupe de l'intérim recalculé ≤ 1 h dans `step`
    (`store.squads`, 2 meilleurs par poste puis les meilleurs, 12 au plus),
    calendrier (`seasonCalendar` : dimanches des semaines 3, 7, 10 ; phase
    finale jours 76 → 82), recherche du haut (`HM_NATIONAL.searchHtml`).
  - FAIT (2026-10-05) phase B (server/nationalCoach.js,
    assets/national-coach.js) : vivier du sélectionneur, présélection (24),
    joueurs suivis (40), convocations par rassemblement (15 au plus, figées
    3 jours avant le premier match, complétées au gel, remplacement d'un
    blessé/inéligible seulement, clubs prévenus), tactique propre (12 par
    match parmi les 15) ; admin « appoint ».
  - FAIT (2026-10-05) phase C (server/nationalMatches.js) : fenêtres
    dimanches semaines 2, 4, 6 ; groupes de 4 au plus par continent
    (serpentin par niveau) ; matchs avec le moteur des clubs sur les vrais
    joueurs (ids provisoires, fatigue normale, retirés du matchLog) ;
    classement 2/1 pt ; qualif continentale Europe 8/10 (2 premiers + 2
    meilleurs 3es), Amérique et Asie tous ; saison Coupe du monde : groupes
    = têtes de série. Onglet Qualifications, feuille de match. Config
    `matchesLive`. Amical du dimanche d'une fenêtre : convoqués exclus (2026-10-06).
  - FAIT (2026-10-05) phase D (server/nationalMatches.js, store.finals) :
    tournois de la dernière semaine (lundi → dimanche 20h ; poules, quarts
    vendredi à 8, demies samedi, finale + 3e place dimanche ; format selon
    le nombre d'équipes), consolation, récupération améliorée (moitié de la
    fatigue d'un match rendue, phases finales seulement), classement final,
    palmarès (store.honours), Coupe du monde = 5 Europe + 2 Amérique + 1
    Asie d'après le classement continental de la saison précédente,
    consolation des 9 autres. Règle Supercoupe : joueurs encore en course
    avec leur sélection écartés le temps du match (unavailableAt →
    NationalCup.stepSuperCup opts.unavailable), club prévenu.
  - FAIT (2026-10-05) phase E : mode Sélectionneur (assets/national-coach.js,
    bouton dans la barre du haut avec un mandat, /api/national/me ; menu
    latéral propre, barre du haut de la sélection, rubriques du club
    masquées, tableau de bord, notifications du mandat m.feed jamais dans le
    fil du club : résultats, blessures/performances des joueurs suivis,
    convocations à finaliser ; statistiques en sélection ; bilan de mandat
    m.report à la fin, caps store.caps ; expérience des candidats aux
    élections). Exemptés d'une fenêtre : pas de rassemblement.
  - FAIT (2026-10-06) : convoqué retenu par sa sélection (Player.nationalDuty,
    posé au gel, retiré au remplacement, Engine.isOnNationalDuty) → absent
    des amicaux de son club ce jour-là (toute la semaine en phase finale).
  - FAIT (2026-10-06) : Analyse du mode Sélectionneur = MÊME rapport que le
    Scouting Pro du club (adversaire ou « Ma sélection »). Route
    `/api/national/coach/analysis-data?teamId=&opp=` (droit "analysis",
    nationalCoach.analysisData) : matchs joués saison en cours + précédente
    (NM.playedMatchesOf) en « équipe virtuelle » (matchLog competition
    "national", round = rang chronologique) + agrégats de server/scouting.js
    sur une ligue de résultats équivalente. Client : scoutingProReportHtml
    et blocs sp2* paramétrés par `report.virtual` (computeScoutingAdvancedStats
    accepte une `source` de matchs) ; « Appliquer à ma tactique » écrit le
    plan de match dans la tactique de la sélection (/coach/tactics).
    Tests : server/national_analysis_test.js, national_analysis_ui_test.js.
  - FAIT (2026-10-07) : rôles cumulables (une entrée m.staff par rôle, même
    key/mid ; au plus un rôle NT parmi sélectionneur/adjoint/personne
    aidante + recruteur et/ou scout ; accessOf → { role principal, roles,
    perms = union } ; « assigned » seulement pour qui n'est QUE scout ; se
    nommer soi-même = en poste tout de suite). Onglet « Joueurs suivis »
    (followedOf : attributions aux scouts + m.watchlist/m.watchBy, noms
    jamais de clé). « Liste des joueurs » (ex-Sélectionnables). Proposition
    de poste = message de la messagerie (messages.send opts.meta
    natStaffInvite, envoyé par la route staff/invite) + bouton « Accepter le
    poste » (national-coach.js msgActionHtml, état lu dans /api/national/me ;
    respond par `role`, 409 si déjà accepté). Onglet Sélections : arrive sur
    <pays du club>-A, sélecteur de pays, bascule Équipe A / U21,
    « Toutes les sélections » = vue d'ensemble (render({ overview: true })).
    Tests : server/national_multirole_test.js,
    national_selection_roles_ui_test.js.
  - Reste : traductions des écrans B à E ; pas de classement mondial FIBA
    (le bilan le signale). UI dans des fichiers assets/ séparés (limite 4 Mo
    de la page).

- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-02), committé localement — Ligues
  privées mondiales (retour utilisateur 2026-10-02 : « n'importe quel joueur
  du monde qui est premium [doit pouvoir] rejoindre la LP »)**. Les LP sont
  rangées au niveau du monde (données annexes `privateleagues`,
  `store.loadWorldAuxStrict` : lecture en échec ≠ absent, jamais réécrit
  après un échec), membres = références `{ leagueId, idx, name, country,
  label, look }`, matchs notés par place dans `members`. Création / adhésion
  par code / départ / lancement : route dédiée de server/index.js
  (PRIVATE_LEAGUE_ACTIONS), Premium et « une LP active par club » vérifiés
  dans le monde entier, codes uniques dans le monde. Journées jouées par
  `World.catchUpWorld` (toutes les ligues en main ; championnat d'un membre
  illisible = journée reportée, jamais un forfait), toujours sur des copies ;
  directs rangés par LP (`store.appendLpReplays`, clé
  `pullup:lpreplays:world:<id>`) ; montées/descentes suivies
  (`remapMoves`) ; vendredis de LP = jours de match via
  `league.worldPrivateLeagueTimes` (Friendlies.officialMatchTimesFor).
  Navigateur : projection dans le repère de sa ligue (`projectForViewer`,
  ancienne forme teamIndices/home/away), clubs étrangers = invités légers
  4000+ (nom, pays, division, logo/maillot), drapeau + division sur la page
  LP ; direct d'un club étranger : effectif complet renvoyé par
  /api/private-league/live. Migration des anciennes LP (`league.privateLeagues`,
  ex. « Coupe des champions » 59LDVG) : même id, code, membres, journées,
  résultats ; écrite puis RELUE avant de vider la copie du championnat
  (`migrateAndSave`, au rattrapage du monde et à chaque requête du
  championnat) ; anciens directs retrouvés sous leur ancienne clé
  (`legacyKey`). Tests : server/private_league_test.js (adapté),
  world_private_league_test.js (nouveau : France/USA/Italie/Espagne D2,
  refus non Premium et « déjà dans une LP », J1 au rattrapage, migration,
  stockage illisible). Reste à surveiller en prod : la migration de 59LDVG au
  premier rattrapage après déploiement (journal « rangée(s) au niveau du
  monde »).

- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-01), committé localement — Staff v2 +
  Marché du staff (retour utilisateur 2026-10-01 : « la page staff est fade
  et ne ressemble pas au reste du jeu »)**. Page Staff = staff EN POSTE
  seulement : une carte par rôle (bandeau coloré, avatar en polo aux
  couleurs du club, étoiles, spécialité, effet en clair, salaire, hausse,
  ancienneté, « Sans échéance », Changer / Congédier) ; poste vide = carte
  « Poste à pourvoir » + « Recruter un … » → Marché en mode Staff filtré sur
  le rôle (mkOpenStaffMarket). Marché : bascule Joueurs | Staff
  (marketUi.mode ; mode Joueurs inchangé), filtres du staff (rôle,
  spécialité, niveau et salaire en barres doubles, dans mon budget, fin
  < 24 h, mes enchères), cartes .mk-stf, enchères inchangées (staffPlaceBid,
  setAutoBidFor) + confirmation quand le poste est pourvu. Onglet Staff
  déplacé dans Club sous Économie. AvatarGen : renderPolo +
  options.outfit "polo", options.staff (ni bandeau, ni crête/durag/motifs,
  ni tatouage/chaîne, cheveux gris avec l'âge ; tirage des joueurs
  inchangé). Identité du staff (nom masculin des NAME_POOLS, âge 35-65,
  visage) dérivée de `sid` : engine.js + miroir (tagStaffIdentity) passent
  l'id de l'annonce au membre engagé et au membre congédié relisté ;
  restauré par teamFromSave. Pas de nombre de caracs révélées pour
  l'analyste (retour 2026-09). Traductions ×9. Tests : nouveau
  staff_v2_ui_test.js ; adaptés medical_staff, assistant_coach,
  client_scouting, my_auctions, auto_bid, persistence, end_to_end,
  sidebar_order, training_v2_ui. Rebasé sur claude/kind-shannon-8nx9sq (90f45a6), 89 tests liés verts (planete_hoop_test : instable, échoue aussi sur la base). Reste : push par l'utilisateur ; le texte du Guide sur
  l'entraîneur dit encore « marché aux enchères (onglet Staff) ».

- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-01), committé localement — Refonte de
  l'entraînement (spécification validée par le propriétaire, retour
  utilisateur 2026-10-01)**. engine.js (+ bloc miroir « ENTRAÎNEMENT V2 »
  identique dans moteurbasket3.html, vérifié par training_v2_test.js) :
  plans individuels `Team.trainingSlots` (places : sans entraîneur 0, niv.1-2
  → 3, niv.3-4 → 4, niv.5 → 5), taux d'entraîneur inchangés (×1,06 à ×1,30)
  appliqués au meilleur cas d'avant (programme pur, sans dilution), plus
  aucun effet du poste (adjoint compris), plein rendement à 30 min sur la
  semaine (tous postes), intensité Légère/Normale/Intense (−25 % + 2/jour de
  récupération ; +25 %, −8 de forme et 2 % de blessure par joueur en plan),
  plafond souple (`trainingProgressRoom`, diviseur 45, échelle 8 ; académie
  et IA gardent le diviseur 20) + bonus de plafond +2..+6, spécialités
  (`trainer.specialty` : attaque/défense +15 %, physique +25 % sur les jours
  Physique, jeunes +15 % ≤ 21 ans et académie ; spécialité aléatoire sur le
  marché, déterministe pour les anciennes sauvegardes), jour « Physique »
  (`applyPhysicalDayTo`), mental 45 % automatique + expérience (minutes de
  la semaine, courbe quadratique), parrainage (2 duos, mental ×1,3), plan
  collectif jour par jour (`collectiveDayPlan`, `setCollectiveDay`), gain
  tactique selon le niveau (40 → +12 … 100 → +3, crédité dès le jour écoulé,
  plus de bonus de jours banqués), effet en match ±8 %, jour d'amical (pas de
  tactique ; récupération/physique pour les non-retenus,
  `friendlyPlayersByDay`), bilan du lundi (`slots`, `advice`, `collective`)
  et conseils, IA (`cpuTrainingSlots`, entraîneur implicite niveau 3, travail
  de fond 0,95 calibré), migration (`migrateTrainingSlots`). Serveur :
  /api/training (plans, intensité, parrainages, `day`) validé ;
  friendlies.js transmet les joueurs de l'amical. Écran Entraînement refait
  (maquette v2 + rendement % avec détail, jauge de plafond ; ordre depuis le
  2026-10-02 : Plans | Collectif (colonnes de même hauteur, dernière carte
  étirée), Bilan du lundi, Expérience, Parrainage ; menu « Semaine du … au … »
  du Collectif = semaine en cours + TRAINING_PLAN_WEEKS_AHEAD (3), jours
  officiels envoyés par /api/save → myOfficialDays), Staff (spécialité
  de l'entraîneur), Guide, tutoriel. Traductions ×9. Tests : nouveaux
  training_v2_test.js et training_v2_ui_test.js ; adaptés :
  synergy_training_test, tactical_knowledge_test (point 4),
  training_progression_test, trained_tactic_dropdown_test,
  training_recovery_gauge_test, persistence_test, end_to_end_test,
  attr_color_scheme_everywhere_test, my_auctions_test, premium_test,
  server/weekly_calendar_test (points 9 et 12). Guide « Connaissance
  tactique » mis à jour (±8 %, gain selon le niveau). Suite complète verte
  (italy/national_cup/world_season : lents sous charge, verts seuls).
  Reste : push par l'utilisateur.
- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-01), committé localement — Permaliens
  joueur + historique de progression** (conception validée par l'utilisateur
  le 2026-10-01). engine.js (+ miroir de la sérialisation dans
  moteurbasket3.html) : `Player.weeklyHistory` = [saison, semaine, note,
  ...28 caractéristiques dans l'ordre d'ATTRS], pris à chaque mise à jour du
  lundi pour TOUS les joueurs de la ligue (`League.recordPlayerHistory`,
  appelé par server/autoSim.js après `trainCpuTeams` dans les 3 rythmes),
  3 saisons max (+ garde-fou 60 entrées), suit le joueur de club en club.
  Retiré pour tout autre club (`HIDDEN_PLAYER_FIELDS`), de l'index du
  marché mondial et des invités de Coupe. server/playerLinks.js (codes de
  8 caractères base64url, stockage `store.loadPlayerLinks` →
  `<multi>.playerlinks.json` / clé Redis `pullup:playerlinks`), routes
  `POST /api/player/share-link` et `/revoke`, `playerShareLinks` dans
  /api/save, page publique `GET /j/<code>` (server/playerPage.js, sans
  connexion, noindex, og:, 10 langues via le dictionnaire du jeu) ; lien
  mort (404 « Lien expiré ou introuvable ») dès que le joueur n'est plus
  dans le club qui l'a créé (vérifié à la lecture, mapping supprimé).
  Fiche joueur : bouton « Partager » (copie + feuille de partage du
  téléphone), « Lien public actif · Couper le lien », courbe de
  progression (note + sélecteur de caractéristique, toujours Premium en
  jeu). Tests : server/player_permalink_test.js,
  player_permalink_ui_test.js (nouveaux), world_country_test.js (liste des
  champs cachés). Reste : push par l'utilisateur.
- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-01), committé localement — Résumé
  de la semaine par e-mail** (demande du propriétaire 2026-10-01).
  server/weeklyDigest.js (nouveau, serveur seul) : chaque lundi à partir de
  9h Paris (mise à jour hebdo à 6h), jusqu'au mercredi 9h (sinon semaine
  sautée), un e-mail HTML + texte par manager humain ayant un compte avec
  e-mail : résultats officiels de la semaine (championnat via
  league.results, Coupe/play-offs via Team.ordersHistory), classement,
  joueurs RÉELLEMENT entraînés aux fondamentaux (tous, et eux seuls :
  `digestTrainedPlayers`, lit Team.lastTrainingReport.effectiveFocus,
  programme + ses fondamentaux montés d'au moins 1 point, avant → après ;
  entraînés sans montée non listés, « Aucune progression visible… » si
  aucun n'a monté ; À ADAPTER aux plans
  individuels / slots du nouvel entraînement), bilan de la semaine
  (Team.financeLedger) et budget, marché (gagnées/perdues/en cours,
  surenchéri, ventes), contrats (dernière saison sans retraite,
  raiseRequest), prochains matchs (heure de Paris), bouton vers le jeu,
  lien de désinscription signé. 10 langues (STRINGS du module, langue du
  compte). Accroché à index.js:maybeCatchUpWorld (jamais attendu ; préparé
  sous le verrou, envoyé hors verrou par lots de 5). Garde-fous : rien sans
  RESEND_API_KEY/MAIL_FROM ; `account.lastDigestWeekKey` (noté avant
  l'envoi), `account.digestOptOut`, clubs IA, absents > 28 jours. Routes GET
  /api/email/unsubscribe-digest et /resubscribe-digest?token=. Variables
  optionnelles : BASKET_SITE_URL (défaut https://hoop-manager.com),
  EMAIL_LINK_SECRET (sinon BASKET_ADMIN_TOKEN). Test :
  server/weekly_digest_test.js. Reste : push par l'utilisateur.

- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-01), committé localement — Marché :
  pays au choix + barres âge/potentiel/prix** (retour utilisateur
  2026-10-01 : « il faut pouvoir choisir le pays de son choix (mets une
  petite recherche dans l'onglet) » et « pour l'âge, le potentiel et le
  prix, mets un système de barres »). moteurbasket3.html : `#marketOriginBox`
  (sélecteur à drapeaux + recherche, mêmes classes `.pc-picker*` et
  `planeteFilterCountries` que Planète Hoop ; « Monde entier », « Mon
  championnat », votre pays, puis les 17 pays `MK_WORLD_COUNTRIES` triés par
  nom traduit) ; 3 cartes `.mk-range` à deux poignées (âge : bornes des
  annonces ; potentiel : 10 paliers ; prix : paliers ronds 0/100/150/…
  jusqu'au prix max) ; chip « Dans mon budget ». engine.js (+ miroir) :
  alertes en fourchettes (`marketAlertRanges`, anciennes alertes converties
  au chargement et à l'évaluation). Traductions ×9. Tests :
  market_filters_test.js (nouveau), world_market_test.js. Aussi : « ☆ Suivre »
  déplacé dans le pied de carte à côté de « Comparer » (bouton mk-btn,
  market_watch_test.js). Reste : push par l'utilisateur.

- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-01), committé localement — Contrats
  des joueurs** (conception validée par le propriétaire le 2026-10-01, puis
  simplifiée : transferts et agents libres TOUJOURS au salaire demandé, la
  marge de -10 % ne vaut que pour les prolongations). engine.js (+ miroir
  moteurbasket3.html) : `contractUntilSeason` (1 à 5 saisons),
  `askedSalary` (niveau + âge + motivation), salaire FIXE pendant le contrat
  (`recalculateSalaries` n'applique plus que `nextSalary`), prolongation en
  dernière saison (`Team.offerContractExtension` : durée 1-5, salaire entre
  demandé -10 % et demandé, chance cachée selon motivation + renommée, refus
  = motivation -3 et une offre par semaine de jeu ; nouveau salaire à partir
  de la saison suivante), demande d'augmentation en semaine 6
  (`League.weeklyContractsTick`, réponse sous 3 jours sinon refus, -10 de
  motivation, jamais de demande de transfert ; IA : accordée), fin de
  contrat au lundi de clôture (`League.processContractExpiries` : départ
  libre, annonce « agent libre » à 1 $, mise = prime de signature débitée
  sans contrepartie, catégorie « Primes de signature » du bilan ; ancien
  club exclu ; invendu → club IA de la ligue, ou retraite à 33 ans et plus ;
  IA : prolonge la plupart de ses joueurs, complète son effectif), vente
  interdite en seconde moitié de dernière saison (`contractSaleBlocked`),
  durée choisie avec l'enchère et l'enchère auto (`listing.contractTerms`,
  jamais renvoyées aux autres clubs ; IA : 2 à 4 saisons), salaire demandé
  gelé sur l'annonce, message de confirmation à l'acheteur. Migration :
  `League.ensureContracts` (au chargement, à la création, chaque lundi) selon
  l'âge, déterministe par id, salaire inchangé ; promotion de l'académie =
  3 saisons. Serveur : /api/player/contract-extension,
  /api/player/raise-response, `seasons` sur /api/market/bid et auto-bid
  (marché mondial compris, agents libres visibles et signables d'ailleurs).
  Client : carte « Contrat » de la fiche joueur (prolongation, augmentation),
  colonne « Contrat » de l'Effectif, carte du marché (salaire demandé, « Fin
  de contrat », « Agent libre », prime de signature, durée du contrat), chat
  de la ligue. i18n : 73 textes dans les 9 dictionnaires (+ guide). Tests :
  contracts_test.js, contracts_ui_test.js ; adaptés : server/new_season_test
  et server/weekly_calendar_test (contrats longs pour garder l'effectif),
  position_change_test (salaire fixé par le contrat à l'intersaison),
  server/world_country_test (champs privés des contrats). Reste : suite
  complète verte (239/240, engine_balance_test statistique, vert seul), committé
  localement, à pousser.

- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-01), à committer — Sponsors :
  catalogue de marques fictives avec logos générés** (proposition validée,
  « plus de sponsors », ~30 par niveau, puis noms anglais hors France).
  engine.js (+ miroir moteurbasket3.html) : `SPONSOR_ICONS` (≈90 icônes
  24×24), `SPONSOR_CATALOG` = 90 marques françaises (30/30/30, France +
  Belgique) + 60 anglaises (20/20/20, tous les autres pays, choix par
  `sponsorCatalogLangFor(league.country || team.country)`) ;
  `SPONSOR_NAMES` (fr) / `SPONSOR_NAMES_EN` dérivés ; anciens noms migrés
  au chargement (teamFromSave, `SPONSOR_LEGACY_NAMES`). Client :
  `sponsorLogoHtml(name, {size})` (normal / compact / mark, repli
  initiales), page Sponsors (offres, contrats, historique + secteur),
  maillot (bandeau couleurs + icône + nom court), salle ArenaGen (mur et
  panneau aux couleurs + icône, `logoOnFaceX`), vue live (pub au sol dans
  un cartouche aux couleurs, `arenaSponsorStyle`, assets live en
  v=20261001-1). i18n : anciens noms retirés des 10 dictionnaires,
  87 secteurs ajoutés ; logos en `data-no-i18n`. Nouveau test
  sponsor_catalog_test.js.

- **🟡 CODE FAIT, TESTS SANDBOX VERTS (2026-10-01), à committer — Direct :
  plus jamais l'ancien format** (« quand je charge un live, il y a encore
  l'ancien format de live au début [...] on peut désormais enlever
  l'ancien »). `moteurbasket3.html` : vue live (assets/live/) affichée
  d'emblée (live.css + modulepreload dans <head>, hmLiveLoadModule() au
  démarrage, squelette dans #hmLiveRoot, message si le module échoue) ;
  classe .hm-live-on supprimée ; anciens nœuds regroupés dans
  #liveLegacyState (toujours masqué, supports d'état pour applyEvent/tests
  JSDOM) ; ancien terrain SVG (#liveCourtView, addCourtMark,
  randomPointForZone, infobulle, CSS .live-court/.lcv-*) retiré ; forfait
  affiché dans la vue live ; « Rediffusion » dans le bandeau des replays ;
  rappel du handicap de Coupe au-dessus de la vue. Tests adaptés :
  live_court_view / live_court_shot_position_stability /
  live_court_home_logo (vérifient hmLive.shots / hmLiveDress().courtLogo).
  i18n : 4 nouvelles chaînes dans les 9 dictionnaires.
- **🟡 POUSSÉ SUR claude/kind-shannon-8nx9sq (2026-09-30), à passer en
  prod — Salle, vide sous « Construire »** : au-delà de 1100 px, la colonne
  de droite (chiffres clés + Affluence) ne fixe plus la hauteur de la grille
  (`contain:size`), c'est la colonne de gauche qui la donne ; la liste
  d'affluence dépliée (10 matchs) défile dans sa carte. Vérifié au
  navigateur (colonnes 699/699 px, replié et déplié). La capture de prod
  montrait encore « Votre terrain » dans la colonne de droite : vérifier
  que le déploiement de la carte pleine largeur (déjà sur main/prod) est
  bien en ligne.
- **🟡 POUSSÉ SUR claude/kind-shannon-8nx9sq (2026-09-30), à passer en
  prod — lot « inspiré de BuzzerBeater »** :
  - Ordres : vue « Composition » sur terrain (titulaire / remplaçant /
    réserviste par poste, alertes, cinq vs banc, effectif compact, pastille
    de verrouillage, barre Annuler / Enregistrer). Verrouillé = tout
    désactivé ; « Annuler » restaure l'état d'ouverture (`/api/plan`
    `{ clear: true }` pour retirer un plan).
  - Note par poste : Engine.positionRating / positionRatings / bestPosition
    (pondération weightedRatingForPosition), affichage seul. Le moteur de
    match NE pénalise PAS le hors-poste (à décider). Seuil d'alerte
    COMPO_OFF_POSITION_GAP = 3.
  - Chat de la ligue (server/leagueChat.js, /api/league-chat…) : panneau
    par-dessus la page depuis un bouton de la page Ligue, pastille de non-lus
    sur ce bouton seulement, messages automatiques (résultats de championnat,
    transferts, classement). Pas encore : résultats de coupe / play-offs.
  - Onglet Personnalisation (sous Guide) : identité (logo, trigramme, nom de
    salle), maillots, parquet ; modale d'identité, bloc Club des Paramètres
    et carte « Votre terrain » de la Salle retirés. 34 motifs de maillot
    (Uni gratuit, 33 Premium).
  - Planète Hoop : aperçu du pays (sélecteur + recherche, divisions, leaders,
    meilleures performances, titres, classement Elo, historique),
    `/api/world/country`.
  - Ligue : résultats de la journée sur une seule ligne. Fiche joueur :
    boutons sous la note. Centre de formation 100 % national.
  - Suite du lot (2026-09-30) : Italie (Division I, inscription, divisions
    automatiques au-delà de MAX_HUMANS_PER_LEAGUE = 10, tous pays) ;
    traduction italienne (assets/i18n/it.js, `node scripts/i18n_missing.js it`
    liste les clés manquantes après chaque ajout de texte) ; page Ligue
    réelle des autres championnats (`/api/world/league-page`) et fiche joueur
    étrangère (`/api/world/player-page`), filtrées par server/publicPlayers.js ;
    Ordres en grille 2 × 2, terrain aux cotes FIBA ; All-Star Game en bas de
    la page Ligue, récompenses retirées de l'Histoire du club ; profil du
    manager (#managerProfileSection, avatar en haut à droite) et pseudo
    (Team.managerPseudo, `/api/manager/set-pseudo`, Paramètres › Mon compte) ;
    bouton « Identité du club » du tableau de bord retiré.
  - Tests réparés : private_league_ui_test.js (dépendait du fuseau horaire),
    visibility_refresh_test.js (pause fixe de 300 ms), world_country_test.js
    (adversaire d'un record de coupe en 1re saison, corrigé dans world.js).

- **✅ EN PROD (2026-09-30) — Poste de carte qui suit les caractéristiques** :
  changement dès 1 point d'écart au meilleur poste (POSITION_CHANGE_MARGIN),
  retour au poste quitté dès 1 point aussi (POSITION_RETURN_MARGIN,
  Player.previousCardPosition, 1 point aussi, règle utilisateur) ; chaque semaine + au chargement ; salaire
  seulement à l'intersaison ; nouvelle dans le fil (clubs humains) ;
  composition automatique qui comble un poste sans joueur de carte (plus de
  forfait pour « pas de pivot » avec au moins 5 joueurs, validé par
  l'utilisateur). Effectif en un seul bloc.

- **✅ EN PROD (2026-09-30) — panneau publicitaire, parquet dans la salle, divers** :
  nouvel emplacement sponsor « panneau » (SPONSOR_SLOTS, mult 0.6, engine.js
  + miroir) dessiné par ArenaGen (options.billboard, flanc droit de la salle,
  « ESPACE À LOUER » sans contrat) ; la salle dessinée suit le parquet
  (options.court depuis arenaGenStyleOptions : parquet Premium enregistré ou
  brouillon de Personnalisation, re-rendu à chaque essai) ; arrondi des
  petits montants sponsor à la dizaine ; onglet Paramètres dans la barre
  latérale ; Analyse de mon équipe = Scouting Pro complet en Premium (sans
  « Appliquer à mes ordres ») ; chat : équipes / joueurs / scores
  cliquables, mention IA ; Guide et profil manager sans largeur bridée.
  Maquette « vue quartier » (autres bâtiments du club) validée sur le
  principe, pas encore codée.

- **✅ EN PROD (2026-09-30) — Aperçu variante A, Scouting Pro pleine largeur** :
  teamDetailApercuHtml refait (bannière aux couleurs du club, 4 tuiles
  classement / bilan / points par match / manager ou renommée, prochain
  match mis en avant « Contre toi », 5 derniers résultats, joueur en forme,
  dernière interview ; CSS .ov-*). Remplace le modèle E « Aperçu en liste ».
  #scoutingProPanel sans max-width ; « Profil et style de jeu » sur 3
  colonnes (.sp2-grid-3, 2 sous 1500 px, 1 sous 900 px).

- **✅ EN PROD (2026-09-30) — zones de tir détaillées (scouting)** : le
  moteur note l'emplacement de chaque tir parmi 12 (engine.js:shotSpotFor :
  cercle restrictif, raquette, 5 mi-distance, 5 à 3 pts), tiré selon le
  poste du tireur par hash déterministe — aucun effet sur la réussite ni sur
  le générateur du match. matchLog.spots = { clé: [tentés, réussis] },
  agrégé par server/scouting.js:aggregateShotZones (spots, spotGames) ;
  carte détaillée scoutingDetailedCourtSvg dans les deux rapports, repli sur
  la carte à 3 zones tant qu'aucun match n'a d'emplacements. Aussi :
  optgroups traduits (attribut label dans i18n.js), rendement polyvalent
  (62 % par caractéristique) expliqué dans l'Entraînement et le Guide.

- **✅ EN PROD (2026-09-30) — langue des e-mails/notifications, maillot** :
  un compte sans langue choisie ne reçoit plus tout en français. Ordre
  (server/accounts.js:langFor) : choix du compte → langue du navigateur
  notée automatiquement (`detectedLang` : inscription, connexion, Discord,
  ouverture du jeu) → langue de la requête → pays du club (fr/it/us→en) →
  anglais. Fiche joueur : maillot floqué en pastille au coin de l'avatar
  (plus empilé dessous).

- **✅ EN PROD (2026-09-30, abfa17d) — suite du jour** : /api/save n'envoie plus
  que les caractéristiques révélées des autres clubs (niveau adverse et
  « ventes comparables » calculés côté serveur) ; stats de la Supercoupe
  (comptées avec la coupe) ; fin de saison / objectifs selon les vraies
  divisions au-dessus/en dessous ; Discord sur iPhone (liaison sans cookie
  hm_oauth acceptée pour l'intent « link », navigateur système dans
  l'appli) — À TESTER PAR L'UTILISATEUR sur iPhone ; chat : play-offs
  (jamais la coupe) et messages système écrits même sans lecteur ; pseudos
  (Discord, bandeau, libellé traduit) ; langue dans le compte
  (Accounts.langFor) ; e-mails, notifications et pages publiques en EN/IT ;
  salle personnalisée et avatars des jeunes (Premium) ; infos joueurs et
  comparateur dans la composition ; Hoop Show en image TV sans défilement.

- **🟡 CODÉ, À POUSSER (2026-09-29) — Entraînement des fondamentaux, 2e
  passe du tableau d'aptitudes** : Passe et Création de tir sans malus de
  poste (Pivot 80 / 75) ; DI Ailier shooteur 80, DE Ailier fort 70 ;
  Lancer franc 100 % partout avec dilution réduite de moitié
  (TRAINING_DILUTION_MULT_BY_PROGRAM) ; Interceptions 75 % pour AF/P ;
  Défense polyvalente = chaque caractéristique suit sa propre ligne
  (TRAINING_PER_ATTR_ROWS) ; « Tirs rapides » séparé en Tir rapide
  extérieur (3 pts + dribble) / intérieur (mi-distance + jeu intérieur),
  anciennes sauvegardes → extérieur ; Attaque du cercle = Pénétration +
  Jeu intérieur. Miroir engine.js ⇄ moteurbasket3.html, en.js,
  training_table_test.js.

- **🟡 CODÉ, À FUSIONNER (2026-09-29) — Transmettre le club d'un bêta-testeur à un
  remplaçant** (« j'ai des beta testers qui ne sont pas suffisamment dispo
  donc je vais les remplacer » ; choix : club transmis tel quel, ancien
  compte supprimé). Nouvelle route POST /api/admin/accounts/transfer-club
  (X-Admin-Token, {club, newName?, leagueId?}) dans server/accountRoutes.js :
  nouveau jeton/lien privé (l'ancien ne marche plus), renommage (références
  par nom mises à jour : enchères d'ailleurs, amicaux entre ligues, coupes),
  tutoriel d'accueil relancé, trigramme/nom de salle par défaut, compte(s)
  de l'ancien testeur supprimé(s). Test : server/transfer_club_test.js
  (vert, ainsi que accounts, account_security, world, inactive_manager,
  index). Poussé sur la branche claude/upbeat-mccarthy-rarl9a. RESTE :
  fusionner, déployer, puis appeler la route pour chaque testeur remplacé.

- **🟡 CODÉ, À POUSSER (2026-09-29) — Plus de carrière solo : le jeu est
  uniquement en ligne** (retour : « le jeu n'a pas à être un jeu solo mais
  un jeu online contre d'autres managers, même seul face à 9 bots ») —
  serveur : /api/* sans jeton → 401 (sauf santé, admin, comptes),
  /api/save-raw et /api/new-career supprimés, sauvegarde toujours
  multi-ligue ; navigateur : sans jeton → /bienvenue, plus de bouton
  « Nouvelle saison » ni « Recommencer », plus de marchés/scouting calculés
  en local ; anciennes sauvegardes solo ignorées (store.js garde les
  fonctions solo pour les scripts/tests existants). Corrigés au passage :
  récapitulatif d'absence gardé sur l'équipe (team.pendingRecapEvents)
  quand le rattrapage de fond du monde simule les ticks, vente forcée
  persistée côté serveur (/api/roster/sell-listed), trainingPositions vide
  n'est plus envoyé. Tests : aides de test sur une ligue multi (jeton
  injecté), save_ordering_test et promotion_test supprimés. RESTE : pousser.

- **⏳ À REVOIR PAR L'UTILISATEUR AVANT PUSH (2026-09-29) — Terrain 2D animé
  du direct** (« je veux revoir avant que tu pousses quoi que ce soit »).
  Fichiers dans le dossier Mac, PAS committés : assets/live/court2d.js
  (nouveau), assets/live/live-view.js, assets/live/live.css,
  live_court2d_test.js, et dans moteurbasket3.html la partie hmLiveOnEvent
  (kind/zone/made/offensive/shot/actors « clé:nom », HM_LIVE_ASSET_VERSION
  20260929-1). Sprites = vrais avatars des joueurs, formations attaque/
  défense selon la possession, chorégraphies par événement (passe →
  tireur → tir en cloche → +2 / rebond, interception, faute, LF avec
  alignement, remise en jeu après panier, temps mort, remplacements),
  commentaire sous le terrain ; remplace la carte des tirs avec bascule
  « Terrain / Carte des tirs » (applyView, toggleAttribute car un <svg>
  n'a pas .hidden), terrain pleine largeur et fil du match en dessous
  (.grid.view-2d). court2d importé avec ?v=20260929-1 dans live-view.js
  (à incrémenter s'il change). Demandé ensuite : une vidéo de démo avec le
  fil du match et la feuille de match pour vérifier la cohérence.
  Moteur : deux lots poussés le 2026-09-29 soir (b3926b9 puis le lot
  « béton ») — voir l'historique Git et le doc « Audit du moteur de match »
  (artefact Claude Docs, rapport complet : fonctionnement, correctifs,
  formules, réalisme, tests A–H, tactiques, hasard, priorités). Mesures
  après : ≈82 pts/équipe en D1 (moyenne ≈42), FG2 49 %, FG3 32 %, intérieur
  50 / mi-distance 42 / 3 pts 32 %, OREB 28 %, 20 LF, domicile ≈57-63 %.
  Tests ajoutés : engine_invariants_test.js (cas limites, invariants),
  engine_balance_test.js (A–H + tactiques, seuils larges).
  RESTE de l'audit : rien (voir l'entrée « fin de l'audit » ci-dessous).

- **🟡 CODÉ, BRANCHE claude/vibrant-curie-xbaxxw, À POUSSER (2026-09-29) —
  Moteur, fin de l'audit** (points 2, 3, 7, 8, 9, 10, 11) :
  - Ids de joueurs dans les événements (shooterId, playerId…) ; feuille en
    direct, vue spectateur et émissions (showsAdapter) lisent les ids,
    repli sur le nom pour un vieux direct. Le terrain 2D (Mac) peut
    utiliser ces ids (ev.shooterId…).
  - Exclusions 5 fautes 0,05 → ≈0,17/équipe (fautes simples selon
    Discipline et poste, 4 fautes : retour dans les 5 dernières minutes).
  - Plancher de Player.eff à 50 % (EFF_FACTOR_FLOOR).
  - Mental : Concentration (fatigue), Vision (création du tir), Sang-froid
    (pertes sous pression), Vitesse (contre-attaques) : ≈0 → +0,7 à +1,7 pt
    pour +20.
  - Isolation / Box and one mesurés avec une star : Isolation −1,5 sans
    star, +4,9 avec ; Box and one −3,3 sans star, +4,6 face à une star.
  - Six réglages confirmés mesurés : Aide, Post-up (perimLeak, tovMod
    branché), Close-out, Rebond Prudent (transitionGuard), Adaptatif (repos
    des titulaires à 18 pts) rééquilibrés ; écrans inchangés. Tables
    miroir HTML et textes d'aide FR/EN à jour.
  - Recalibrage admin : POST /api/admin/recalibrate-cpu (X-Admin-Token),
    dryRun par défaut, { "dryRun": false } pour appliquer.
  - Tests : engine_seed_timeouts_test.js (ids, fautes, plancher),
    engine_balance_test.js (star, compromis), server/recalibrate_cpu_test.js.
  RESTE : pousser, puis lancer le recalibrage en prod (dryRun d'abord).

- **Note moteur (poussé le 2026-09-29)** : graine par match (rand01,
  `seed` dans matchLog/résultats/directs), temps morts simulés, rotation
  ≈20 changements, fins de match plus serrées — voir l'historique Git.
  Limite : l'état d'avant-match n'est pas stocké (il faut une sauvegarde
  d'avant le match pour rejouer un signalement). Le MatchEngine miroir de
  moteurbasket3.html n'est plus tenu à jour (matchs simulés côté serveur).
  Le terrain 2D (Mac) touchera hmLiveOnPause/hmLiveTimeouts : fusion à
  surveiller.

- **✅ POUSSÉ SUR LA BRANCHE claude/elegant-johnson-n0zz21 (2026-09-29),
  à passer en prod** (`git push origin origin/claude/elegant-johnson-n0zz21:main`
  puis `…:prod`) :
  - Fiche joueur : numéro floqué en grand sur le maillot domicile du club
    (jerseySvgHtml, 8e argument `number`), sous l'avatar, sans libellé ;
    écart entre les cartes Personnalisation et Mise en vente.
  - Ligue : « Résultats de la journée N » (lgLastRoundResultsHtml) entre le
    classement et les leaders, score → feuille de match.
  - Salle : carte « Votre terrain » en pleine largeur sous la grille.
  - Inscription sur invitation, code par défaut **BuzzerBeater**
    (DEFAULT_INVITE_CODE, server/accountRoutes.js) ; BASKET_INVITE_CODE le
    remplace (codes séparés par des virgules), `off` = ouvert ; email et 1re
    connexion Discord, lien `/?invite=CODE` prérempli. Les tests qui
    inscrivent des comptes posent BASKET_INVITE_CODE=off.
  - Messagerie MONDIALE (2026-09-30) : bouton « Envoyer un message » aussi
    sur la fiche d'un club d'un autre championnat ; correspondant désigné
    par `who` ("3" ou "us-1:3") côté navigateur et API ; annuaire
    `contacts` (empreinte → championnat/index/nom) dans messages.json, tenu
    à jour à chaque appel ; l'envoi vérifie le championnat de l'autre club
    (loadLeague). Test : planete_hoop_test.js (5).
  - Aperçu d'une équipe : Palmarès / Interviews séparés par des traits.
  - Planète Hoop : un club d'un autre championnat ouvre sa fiche équipe
    habituelle (showForeignTeamDetail, GET /api/world/team-page nettoyé :
    jetons, push, tactiques prévues, marché, directs retirés) ; rendu avec
    son championnat à la place de `league` (withTeamDetailLeague,
    myTeamIndex = -1, aucun scouting) ; pas d'Analyse, pas de fiche joueur.
    Même chemin pour la recherche du haut et les clubs invités de la Coupe.

- **⏳ EN ATTENTE DE VALIDATION VISUELLE (2026-09-27) — Émissions sans
  défilement** (assets/hoop-shows/showPlayer.js/.css, stash sandbox) :
  mise à l'échelle façon TV sous 1200×720 (fit), « Ton meilleur joueur »
  dans la bande basse du bandeau, carte des tirs à la hauteur restante.
  Visuel envoyé, pas de réponse → ne pas livrer avant le feu vert.
  Livrés à part et à pousser : bouton « Voir l'émission » masqué une fois
  l'émission vue (hoopShowHalftimeSeen, localStorage hm-ht-show-seen),
  4 pronostics max à la mi-temps (showData.js MAX_QUESTIONS).

- **🔎 À INVESTIGUER — Discord sur iPhone (Safari) : page discord.com
  blanche** au clic sur « Lier Discord ». Le jeu ne fait que rediriger vers
  discord.com/oauth2/authorize ; tests demandés à l'utilisateur (recharger,
  navigation privée, bloqueur de contenu, version iOS, app Discord
  installée). Piste côté jeu si retour dans un autre navigateur : assouplir
  le contrôle du cookie hm_oauth pour l'intent « link » uniquement.


- **✅ COMMITTÉ, À POUSSER (2026-09-29) — Suivre ses enchères (joueurs ET staff)**
  (retour : « il faudrait un endroit où on peut suivre ses enchères […] si
  qqun a surenchéri, comment je retrouve rapidement ? » puis « ou le marché
  des staffs ») :
  - « Mes enchères » (page Marché) : onglets Tout / Joueurs / Staff / Ventes,
    staff inclus (mkStaffBids), dépassées en premier ; « Relancer » d'une
    ligne staff → page Staff, rôle déplié, filtré sur le niveau (et la
    spécialité) du candidat, champ d'offre sélectionné (mkGotoStaff) ;
  - pastille rouge sur « Marché » dans le menu = nombre d'enchères dépassées
    (mkUpdateBadge, myOutbidAuctions) ;
  - tableau de bord « Cette semaine » : une tâche « Dépassé sur … » par
    enchère (2–3 au plus + renvoi), CTA /enchere/joueur/:id ou
    /enchere/staff/:role/:id, /encheres ;
  - notification Premium « Enchère dépassée : … » à chaque surenchère d'un
    autre club (server/push.js auctionNotes, clé out:<champ>:<id>:<nb
    d'offres>), y compris sur une annonce d'un autre championnat (via
    catchUpWorld, flushLeague(lg, now, { leagueId, leagues })) ; lien
    /#encheres (mkHandleAuctionsHash ; sw.js prévient une page déjà ouverte
    par postMessage « hm-open ») ;
  - GET /api/auctions/mine (server/myAuctions.js), interrogé toutes les 60 s
    et au retour sur la page (myAuctionsRefresh) : met à jour les champs
    d'enchère des annonces déjà connues.
  - Test : my_auctions_test.js. RESTE : pousser.
- **✅ COMMITTÉ, À POUSSER (2026-09-29) — Enchère automatique, pour TOUS les clubs**
  (retour : « on fixe un seuil et ça enchérit jusqu'à ce seuil si on se fait
  dépasser », puis « mets l'enchère auto pour tous ») — pas Premium : ce
  serait un avantage sportif acheté. Moteur (engine.js + miroir html) :
  AUTO_BID_FIELDS, listing.autoBids [{ bidderIdx, bidderRef?, max, at }],
  League.setAutoBid / _applyAutoBids (appelé après CHAQUE offre : humaine,
  CPU, autre championnat ; duel de plafonds réglé aussitôt, le plus haut
  gagne au plafond de l'autre + un palier, égalité : celui qui menait ;
  plafond effectif = min(plafond, budget du moment), effectif plein exclu ;
  offres posées marquées auto: true ; place*Bid renvoient autoOutbid).
  Serveur : POST /api/market/auto-bid { market, listingId, max } (max 0 =
  arrêt ; id négatif = autre championnat, WorldMarket.setForeignAutoBid,
  index : autoRefs, projectForLeague → myAutoMax) ; plafonds des autres
  JAMAIS envoyés (MyAuctions.sanitizeAutoBids sur /api/save,
  actions.viewListing sur les réponses d'enchère) ; notification « Plafond
  dépassé ». Navigateur : bouton « Enchère auto » à côté de « Enchérir »
  (marché et Staff, le montant saisi devient le plafond), état « Enchère
  automatique jusqu'à … · Arrêter », « auto jusqu'à … » dans Mes enchères.
  Test : auto_bid_test.js. RESTE : pousser.

Nettoyé le 2026-09-29 : `main` et `prod` étaient identiques, donc tous les
chantiers marqués « committé, à pousser » étaient en fait en prod et ont
été retirés (l'historique Git les garde). Restent ci-dessous uniquement les
points réellement ouverts.

- **Valeurs validées (2026-09-29)** : derby = affluence ×1,15 et humeur
  ×1,5 ; note des managers départ 1500, K = 24.

- **🌐 Côté utilisateur (hébergement, services)** :
  - Google Search Console : domaine validé par TXT chez IONOS le
    2026-09-29 ; envoyer sitemap.xml, demander l'indexation de / et
    /bienvenue ; vérifier sous quelques jours que Google affiche « Hoop
    Manager » (plus « Pull Up · Basket Manager »).
  - AdSense : en attente du 2e examen ; appli des stores : AdMob plus tard
    (AdSense interdit en WebView).
  - Faits (ne plus demander) : clés VAPID des notifications, Resend
    (RESEND_API_KEY, MAIL_FROM).

- **📱 Stores (App Store / Play Store) — plus tard, décidé le 2026-09-29** :
  l'utilisateur veut d'abord finir les modifs de l'appli actuelle, puis
  publier. Avant publication (voir mobile-app/README.md) : icône haute
  définition 1024×1024 (resources/icon.png, logo jaune) puis `npm run
  icons` + `npx cap sync` ; comptes Apple Developer (99 $/an) et Google
  Play Console (25 $) ; règle 4.2 d'Apple → au moins une vraie fonction
  native (notifications push natives) ; AdMob au lieu d'AdSense dans l'appli.
  Ancien service Render de test Oregon : déjà en Free (ne plus demander).

- **✔ Valeurs validées par l'utilisateur (2026-09-29)** : club d'un manager
  inactif rendu à l'IA après **45 jours** (était 28 ; server/world.js,
  textes jeu/site/en.js) ; prime de Supercoupe **200 000 $**.

- **Limites connues (à reprendre si besoin)** :
  - Supercoupe : pas de stats de joueurs ni d'ordres préparés (ordres du
    moment).
  - Marché mondial : index rafraîchi au plus toutes les 10 min ; pas
    d'enchère de l'IA d'un championnat sur l'annonce d'un autre.
  - Légende du classement : « Relégation directe (9e, 10e) » affichée
    aussi en ligue unique sans pyramide.
  - Premium : « salle personnalisée » et « avatars des jeunes » encore en
    « Bientôt ».
  - Postgres plus tard si le stockage Upstash ne suffit plus.

- **👀 À vérifier visuellement dans le vrai jeu** (testés en jsdom/Chromium
  seulement) : Ordres > temps de jeu cible par poste ; page live qui ne
  « saute » plus sur les tirs (Safari) ; version claire sur les écrans
  rares (fin de saison, rattrapage, interviews, Scouting Pro) ; iPhone :
  onglets des Ordres et Hoop Show sous l'encoche.

- **💡 Idées**
  - Messagerie : cartes « offre de transfert » dans le fil, notification
    push, écran de modération — **gardé au chaud**, l'utilisateur veut en
    reparler plus tard.

- **Rappel produit — encart « présenté par » des émissions (Hoop Show)** :
  espace RÉSERVÉ par l'utilisateur à un vrai annonceur (décision du
  2026-09-29). Ne jamais y mettre les sponsors des clubs du jeu ni autre
  chose ; aujourd'hui logo Hoop Manager Premium (sponsorLogo dans
  hoopShowDressOpts) en attendant l'annonceur.

- **Rappel produit — pas de coaching pendant le direct** (décision du
  2026-09-29, « surtout pas ») : ni temps morts, ni changements, ni
  réglages pendant un match en direct. Tout se décide dans les Ordres
  avant le match. Ne plus le proposer.

- **Rappel produit** : il n'y a PAS de carrière solo. Le jeu est toujours
  multijoueur dans l'univers partagé (une ligue peut être complétée par des
  clubs de l'IA faute de managers). Ne pas investiguer de bugs « carrière
  solo ».

### À investiguer

- **persistence_test.js** : échoue le 2026-09-29 sur origin/main AUSSI
  (« Les postes entraînés n'ont pas été sauvegardés correctement »,
  ligne 123) — sans rapport avec l'audit moteur/le live 2D, à regarder.
- **training_progression_test.js** : échec ponctuel le 2026-09-29 (nombre
  de lignes « aucune minute » 3 au lieu de 4), repassé 3/3 ensuite — flaky.
- **lineup_minutes_test.js** : échec ponctuel constaté le 2026-09-28
  ("Arrière : titulaire trop loin de sa cible"), repassé 3/3 ensuite —
  aléatoire du moteur, flaky.
- Également flaky en sandbox : mobile_viewport_meta_test.js (fetch failed) ;
  server/inactive_manager_test.js (ECONNRESET sous charge, passe seul).

---

## Repères techniques (pour ne pas perdre de temps à re-découvrir)

- **Recherche de managers (2026-10-07)** : `topbarManagerSearchHtml`
  (moteurbasket3.html) est LA section « Managers » de la barre du haut,
  appelée par le mode Club (renderTopbarSearchResults) ET le mode Sélection
  (national-coach.js:topSearchHtml). Son championnat en local (pseudo, sinon
  « Manager de <club> », partie du nom, sans casse ni accents), les autres
  via `/api/world/search` → `managers` (World.searchWorld, d'après
  `summaries[].managers[].pseudo` ; résumé rafraîchi au changement de pseudo).
- **Pastilles de fonctions nationales (2026-10-07)** : composant unique
  `natRolesSlotHtml(clé "ligue:place")` + `loadNatRolesSlots()`
  (source `/api/national/roles`, rendu `mpNatRolesHtml`, classe
  `.mp-natrole`), utilisé par le profil du manager ET la page du club
  (bandeau « Manager : » de l'aperçu, en-tête des autres onglets).
- **Plein écran du Live + temps mort (2026-10-07)** : dans
  `assets/live/live-view.js` (donc tous les directs) : bouton
  `[data-ref=fsBtn]`, barre `.fsbar`, classe `.is-full` (Fullscreen API ou
  repli CSS). `state.timeout` = `activeTimeout(pauses, now)`
  (adapter.js ; copie `liveActiveTimeout` dans moteurbasket3.html pour le
  direct de son club) : la pause « timeout » du moteur, aucun minuteur à part.

- **Avatar joueur : format unique (2026-10-07, règle permanente)** : carré
  aux coins arrondis à 18 % de la largeur (référence fiche Joueur /
  Effectif, `playerAvatarHtml`), JAMAIS de cercle, ni de contour (bordure,
  anneau coloré, ombre en anneau, cadre SVG du terrain 2D) — sauf le petit
  contour jaune des MVP (match, journée, saison, play-offs) et du meilleur jeune. Bloc « AVATAR JOUEUR :
  FORMAT UNIQUE » à la fin du grand `<style>` de moteurbasket3.html :
  `.player-avatar` seul porte la forme ; dans un cadre (liste `:is(...)`,
  ou classe `.player-av-frame` pour tout nouveau composant) c'est le cadre
  qui la porte. Modules à part alignés (vestiaire-ui, medical-ui,
  live.css, showPlayer.css, court2d). Test : `player_avatar_shape_test.js`
  (statique + audit Chromium de toutes les pages, ordinateur et 390 px).

- **Possession du ballon dans le direct (audit du 2026-10-07)** : SOURCE DE
  VÉRITÉ = le moteur. Chaque événement de jeu porte `possession` (équipe qui
  a le ballon PENDANT l'action) et `possessionAfter` (APRÈS), posés par
  `markPossessionEvents` (engine.js, fin de chaque possession) ; idem
  `quarterStart` / `quarterEnd` / `tipoff`. ⚠ `rebound.possession` = équipe
  qui TIRAIT (avant : celle du rebond). Le serveur réoriente
  `possessionAfter` (viewLiveMatchForTeam). Côté client, la possession du
  direct = `possessionAfter` du dernier événement diffusé :
  `assets/live/adapter.js:possessionAt` (spectateur, autre match,
  sélections, rediffusions) et sa copie `livePossessionAt` dans
  moteurbasket3.html (direct de son club) — garder les deux identiques.
  `court2d.js` ne tient plus de possession concurrente : `giveBall` refuse
  un joueur de l'autre équipe (ou sortant), `enforcePossession` lâche le
  ballon dès que l'état change, passes guidées (`flyTo`/`pass`, cible qui
  suit le receveur), rebondeur / intercepteur du moteur. Tests :
  `engine_possession_chain_test.js` (moteur) et
  `live_possession_sync_test.js` (moteur → serveur → adaptateur → terrain,
  horloge virtuelle, `court.debug()`).

- **Règle UI mobile (2026-10-07, permanente, voir aussi CLAUDE.md)** : sur
  téléphone, AUCUN menu / modale / dropdown / popup au milieu de l'écran,
  tout en bottom sheet (fixed, bottom 0, 90dvh max, scroll interne, zone
  sûre). Appliquée à la source dans `assets/mobile/mobile.css` (bloc
  « RÈGLE UI MOBILE ») : `.upgrade-confirm-overlay > *` (toutes les
  modales), `.m-sheet` (classe pour tout futur menu), `.pc-picker-menu`,
  `.trained-tactic-menu`, `.eff-menu`, `.tm-tip`, `.tour-callout`,
  `.tour-center-overlay`, chat de ligue `.lgc`, menu principal `.sidebar`
  (monte du bas). Suggestions de recherche (`.pc-search-results`,
  `.fr-opp-results`) dans le flux sous leur champ.

- **Staff des sélections : rôles et droits (refonte du 2026-10-07)** : UNE
  seule table, `server/nationalCoach.js` : `PERMS[rôle]` (droits) et
  `APPOINT[rôle]` (rôles qu'il nomme / retire). Staff NT : `coach`
  (sélectionneur), `assistant` (adjoint, `PERMS` identiques au coach),
  `helper` (personne aidante : consultation roster / présélection /
  convoqués / tactique via `tacticsView`, suit des joueurs). DTN :
  `recruiter` (joueurs suivis, `assign`, nomme des scouts), `scout`
  (`assigned` : `coachView` ne lui envoie QUE ses joueurs, `m.assign[mid]`,
  et `setListMember` refuse les autres). Nominations : adjoint ← coach ;
  aidant, recruteur ← coach, adjoint ; scout ← coach, adjoint, recruteur.
  Retrait = même règle, départ volontaire toujours possible. Pas de rôle
  « Entraîneur ». Ancien modèle : `scout` = recruteur, migré par
  `migrateStaff` (`m.staffV = 2`), appelé par `accessOf` / `staffOf`.
  Client (`assets/national-coach.js`) : menu filtré par `v.perms`, page
  Staff unique filtrée par `v.appoint` / perm `assign`. Test :
  `server/national_staff_test.js`. Attribuer un joueur à un scout le met
  aussi en présélection (s'il reste de la place) ; plus de bouton Suivre
  (tableaux, fiche joueur). Notes privées sur un joueur (perm `notes`,
  `m.notes[refKey]`, route `/api/national/coach/note`) : `notesFor` ne les
  envoie qu'au staff, jamais pour les joueurs du club du lecteur, scout =
  ses joueurs ; bloc en bas de la fiche (`pdpNotesHtml`). Le mode s'affiche
  « Mode Sélection » (anciennement « Mode Sélectionneur »).
  Typographie (2026-10-08) : le Mode Sélection réutilise celle du Club, ne
  pas recréer de variante `.nc-*` / `.nt-*` : titre `h2.page-title`
  (`titleHtml`), titre de carte `.lp-card-title` + méta `.nc-club` dans
  `.nc-sec` (mise en page seule), sur-titres `.cal-card-kicker`, KPI
  `.eff-kpi-num` / `.eff-kpi-label`, boutons `.cal-next-btn` (+ `.lp-btn`
  dans `.lp-actions`, ou `.nt-btn` pour la version en ligne) et `.tq-btn`,
  champs `.field-label` + `.lp-input`, filtres `.cal-toolbar.vs-tabs`, GEN
  `attr-cell` dans `td.eff-td-rating`, barre latérale aux valeurs de
  `.tab-btn.sidebar-link` (classe propre `.nc-side-link` gardée : la classe
  Club est remise à zéro par `switchTab`) + `.sidebar-section-label`.
  Aucune graisse 900 propre au mode.

- **Analyse d'équipe (Scouting Pro, sa propre équipe en Premium) — mise en
  page dense (2026-10-05)** : seuils en requêtes de CONTENEUR sur
  `#scoutingProPanel` (`container-name:sp2`). Plan de match en rangées de
  cartes (une rangée par famille, `auto-fit`) ; 5 de départ = 5 cartes
  joueurs (`.sp2-fcards`, flex qui remplit la dernière ligne) + carte
  « Défense conseillée » (`setup.defenseReason`) ; le test exige que
  `.sp2-five` suive immédiatement `.sp2-plan` (dans `.sp2-row-plan`).
  Profil et Forme : placement adaptatif `sp2LayoutMasonry` (colonnes via
  `--m-cols` en CSS, bloc `data-mpin=first/last`, les autres dans la
  colonne la plus courte mesurée ; une colonne = ordre `data-mo1` ;
  ResizeObserver). Effectif `.sp2-eff-top` (l joueurs clés, s qui marque,
  c 5 majeur).

- **Direct des ligues privées (2026-10-01)** : le match reste simulé d'un
  coup sur des copies (server/privateLeague.js), mais sa diffusion est calée
  sur round.dueAt (schedulePlayback) et rangée dans le store des directs à
  revoir (clé « lp:<id>:<journée>:<dom>:<ext> », via league.pendingReplays).
  match.liveUntil : tant qu'il n'est pas atteint, sanitizePrivateLeaguesForViewer
  cache le score (live: true) et le fil d'actu attend (round.feedPushed).
  Route GET /api/private-league/live (membres) : en cours = horaires réels,
  fini = replay recalé. Émissions avant-match / mi-temps sans pronostics :
  /api/shows/lp/prematch|halftime (Shows.getLpPrematchShow/getLpHalftimeShow).
  Test : private_league_live_test.js.

- **Pays proposé d'après l'IP (2026-10-01)** : server/geoip.js lit la table
  locale server/geodata/geoip.bin (17 pays ouverts, données NRO CC BY 4.0,
  aucun service externe) ; /api/account/config renvoie `suggestedCountry`,
  que la page d'inscription présélectionne (prioritaire sur la langue du
  navigateur, sauf si le manager a déjà cliqué). Nouveau pays ouvert →
  relancer `node scripts/build_geoip.js <paquet npm>` (mode d'emploi en tête
  du script), sinon il ne sera jamais proposé par IP.

- **Hébergement (2026-09-27)** : PROD = service Render `hoop-manager`
  (Frankfurt, Starter, branche `prod`, domaine hoop-manager.com, adresse
  technique hoop-manager-test.onrender.com), base Upstash `pullup`
  (Irlande, clés `pullup:*`), BASKET_PUBLIC_SITE=1, Discord activé. TEST =
  service `hoopmanager-test` (Oregon, Free, branche `main`,
  pullup-030q.onrender.com), SANS Upstash (fichiers éphémères). Livrer en
  prod : `git push origin main:prod`. DNS chez IONOS (A @ → 216.24.57.1).
  Variables : voir server/README.md "Comptes joueurs".

- **Push** : Claude committe mais ne pousse QUE sur demande explicite de
  l'utilisateur (« pousse », « pousse en prod »). `main` = serveur de test,
  `prod` = hoop-manager.com (`git push origin main:prod`). Après un push,
  l'utilisateur fait `git pull` sur son Mac.
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
  `engine_balance_test.js` (statistique, sous charge ; vert seul, 2026-10-01),
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

- **Infrastructures à 5 niveaux (2026-10-02)** : Boutique, Station TV,
  Musculation et Bien-être passent de 3 à 5 niveaux construisibles (+ 0 =
  rien), comme le centre de formation. Niveaux 1-3 inchangés (aucune
  migration) ; 4 et 5 : boutique 600 k/33 k, 1,1 M/66 k par semaine ; TV
  800 k/43 k, 1,4 M/83 k ; musculation 550 k (blessures ×0,56), 900 k
  (×0,48) ; bien-être 550 k (fatigue ×0,68), 900 k (×0,62). Quartier du
  club (clubDistrictBuilder) : tailles et détails répartis sur 5 niveaux.

- **Statut blessé et tri du marché (2026-10-07)** :
  - Blessure : SOURCE UNIQUE `playerInjuryStatus(player, now)` (dérivée de
    `injuryUntil`/`injuryType`, jamais de `Player.injured` qui ne dure qu'un
    match ni de l'historique). La fiche joueur l'affiche dans la tuile Forme
    (« Blessé · N j ») et en tête de la carte Blessures (« En cours », même
    si le journal ne la contient pas), plus le bandeau. `injuryWatchTick`
    (toutes les minutes) redessine l'Effectif / la fiche / le Centre médical
    ouverts quand un joueur se blesse ou guérit : avant, un écran déjà
    affiché gardait l'ancien statut. Les tests « injuryUntil > now » épars
    passent par `isCurrentlyInjured`.
  - Marché, « Trier par note » : trie sur `mkListingRating` (GEN du meilleur
    poste, la note AFFICHÉE sur la carte) et non plus `overall()` ; départage
    potentiel, âge, nom, identifiant d'annonce. Test :
    `injury_status_market_sort_test.js`.

- **Retour en Mode Sélection (2026-10-07)** : chaque rubrique du mode est
  une étape de l'historique (`hmNavCurrent` porte `ncMode`/`nc`, voir
  `HM_NATIONAL_COACH.navKey/restoreNav` ; `paint()` appelle
  `hmNavSchedule`). « Retour » (barre du haut ou navigateur) revient à la
  rubrique précédente du mode ; avant le mode, il le quitte proprement
  (`exitMode(true)`, sans renvoyer au tableau de bord). Le « ‹ Retour » des
  pages de détail remonte l'historique (`history.back()`) au lieu de
  cliquer la fermeture (qui empilait une étape en avant). Test :
  `national_mode_back_test.js`.

- **Social, sélections, noms (2026-10-07)** :
  - **Parrainage / badge « Amis »** (`server/referrals.js`) : code personnel
    `account.referralCode`, lien `/bienvenue?ref=<code>` (gardé 30 j dans le
    navigateur, envoyé par `/api/account/signup` et `discord-complete`).
    `account.referredBy = { id, at, fp, status: pending|validated|blocked,
    reason, clubName, seasonsDone, validatedAt }`, posé UNE fois à la
    création. Validé quand le club du filleul a `achStats.seasons >= 2`
    (première saison prise en cours = incomplète). Anti-abus : même empreinte
    IP que le parrain (à l'inscription ET à la validation), même email (alias
    Gmail/+étiquette), 10 invitations en attente max, jamais après coup.
    `GET /api/account/referral` (réévaluation au plus toutes les 10 min) ;
    le nombre validé est recopié sur `team.friendsReferrals` (sérialisé dans
    les deux miroirs, remis à 0 à la reprise/libération d'un club).
    Récompenses PUREMENT cosmétiques (FRIENDS_TIERS) : cadre bronze/argent/or
    de l'avatar, titres « Rassembleur » / « Ambassadeur », pastille « Amis ».
    UI : bloc « Amis » du profil (`managerFriendsHtml`), Réglages > Compte
    « Inviter un ami » (`hmReferralSectionHtml`).
  - **Vitrine des sélections** (`server/nationalExtras.js`, catalogue
    partagé `assets/national-visuals.js`) : `store.teams[id].message`
    (sélectionneur + adjoints, 500 car., `POST /api/national/message`) et
    `store.teams[id].visuals` (sélectionneur seul, logo/bannière/maillot/
    terrain, certains débloqués : 1er match, 5 victoires, phase finale,
    podium, titre ; `POST /api/national/visuals`). `teamView.extras`.
    Maillot et parquet appliqués aux matchs (`matchDress` dans `buildSide`).
  - **Fonction nationale du manager** : `GET /api/national/roles?league=&idx=`
    (mandats et staff ACTIFS par place de club) → puces du profil
    (`mpLoadNationalRoles`).
  - **International** : `GET /api/national/player?id=&name=&nat=` = dernière
    liste de convoqués FIGÉE (A/U21) + sélections (caps) ; tuile de la fiche
    joueur (`pdpLoadInternational`) et puce du permalien `/j/<code>`.
  - **Noms** : `NAME_POOLS_EXTRA` + `namePoolOf(key)` (bloc identique dans
    engine.js et moteurbasket3.html, voir nationality_test). `NAME_POOLS`
    inchangé car il nomme le staff par hash (`staffIdentity`) et sert à
    `nationalityFromName`. Tests : `names_variety_test.js`.
  - Tests : `server/referrals_test.js`, `server/national_extras_test.js`,
    `national_showcase_ui_test.js`.

- **Refonte visuelle (2026-10-07, maquettes « Cohérence du cinq — refonte »
  et « Rôle & forces/faiblesses — refonte »)** : `compoCohesionHtml` (Ordres
  du club ET Tactique des sélections) = note globale en lettre (`cohGrade`,
  Team Fit), 3 jauges, cinq avec maîtrise du rôle et conflits, carte des
  frictions sur demi-terrain (`cohCourtHtml`, liens par paire), points de
  friction (tag Ballon / Raquette / Rôles), avertissements globaux, points
  forts. `lineupCohesion` ajoute `pair`/`kind` aux remarques de paires et
  `key` aux remarques globales (affichage seulement, scores inchangés).
  `pdpRoleRowHtml` : anneau de maîtrise, rôle principal, « Pour progresser »
  en pastilles, autres rôles + compatibilité avec le cinq ; carte Profil
  (forces / faiblesses en pastilles). Polices du jeu (pas celles de la maquette).

- **Ordres, Temps de jeu (2026-10-07)** : la carte n'apparaît qu'en niveau
  tactique Confirmé (club et sélections, `confirmedEls`), dans la colonne de
  gauche sous Attaque ; son onglet suit (`updateOrdresSectionTabs` regarde
  la carte et son conteneur direct, jamais la page).
- **Fiche joueur, bloc Rôle (refonte 2, 2026-10-07)** : une seule carte
  `.pdp-rx`, 3 colonnes séparées (identité | autres rôles + compatibilité
  cinq majeur | profil forces/faiblesses), pastilles de taille unique. Mise
  en page par container query (`pdprx`) : 3 colonnes ≥ 1380 px, identité
  en haut puis 2 colonnes, empilé < 820 px. Jauge de maîtrise, barres des
  autres rôles, compatibilité ET cohérence du cinq (jauges, barres) :
  `radarTierColor` (code couleur des caractéristiques).
