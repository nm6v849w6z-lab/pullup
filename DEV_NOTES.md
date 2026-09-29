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

- **✅ COMMITTÉ, À POUSSER (2026-09-29) — Page d'accueil (/bienvenue) : compteur
  « clubs encore disponibles dans la ligue en cours » retiré** (retour : « t'enlèveras
  ça sur la page d'accueil ») — assets/site/index.html : encadré, style,
  traductions FR/EN et renderSlots supprimés ; openSlots reste renvoyé par
  /api/account/config (non utilisé par le site). RESTE : pousser.

- **🟡 CODÉ, À POUSSER (2026-09-29) — Ajouts aux récompenses + amicaux à huis
  clos** — par-dessus awardSeasonHonours (autre session) : récompenses
  décernées dès la fin de la saison régulière (awardRegularSeasonAwards,
  appelée par League.startPlayoffsIfNeeded ; carrière et succès toujours à
  la clôture, league.seasonHonoursId), 6e homme (matchLog.starter), MVP des
  play-offs (équipe championne), All-Star Game de mi-saison (nationaux du
  pays de la ligue contre étrangers, 10 contre 10, dimanche 20h heure de la
  ligue, sur des copies : League.allStarGame, server/autoSim.js), cartes
  « Récompenses de la saison » et « All-Star Game » sur la page Ligue,
  profil du manager sur la fiche d'un club humain, succès sans émoji.
  Amicaux (ligue et monde) : score caché jusqu'à coup d'envoi + 1h30
  (revealAt), résultat annoncé à ce moment-là, « Résultat à venir » ;
  calendrier ; plus de note sous la feuille de match. Tests :
  season_honors_extra_test.js, season_honors_extra_ui_test.js, tests amicaux.

- **✅ COMMITTÉ, À POUSSER (2026-09-28) — Ordres (iPhone) : onglets sous
  l'heure/la batterie** — retour « Tjrs ce bug » (capture). Le commit
  6791d2d portait le bon titre mais ne contenait QUE les largeurs de
  colonnes d'Effectif : le correctif n'avait jamais été committé. Cause :
  topbar masqué sur Ordres → --topbar-h = 0 → barre d'action collée à top:0
  sous la barre d'état ; seul le topbar réservait env(safe-area-inset-top).
  moteurbasket3.html (bloc ≤768px des Ordres) : padding-top +
  safe-area quand .topbar-hidden-on-page ; ordres_notch_test.js.
  RESTE : pousser, vérifier sur l'iPhone. Test flaky connu :
  mobile_viewport_meta_test.js échoue en sandbox (fetch failed) avec ou
  sans ce changement.
- **✅ COMMITTÉ, À POUSSER (nuit du 2026-09-28) — Premium : les 4 « Bientôt »
  livrés** (reste en « Bientôt » : salle personnalisée / avatars des jeunes)
  - Notifications : server/webpush.js (Web Push sans dépendance : RFC 8291
    aes128gcm + VAPID ES256), server/push.js (coup d'envoi des matchs en
    direct, blessures, arrivées/départs, fins d'enchère des joueurs suivis ;
    envoyées à chaque sauvegarde d'un championnat, Premium seulement,
    abonnements expirés retirés ; coups d'envoi de championnat ajoutés aux
    échéances du monde), routes /api/push/config|subscribe|unsubscribe,
    service worker (push, notificationclick), Paramètres → Mon compte →
    Notifications. **À configurer par l'utilisateur** : générer les clés
    avec `node server/webpush.js --generate` puis mettre VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY (et VAPID_SUBJECT=mailto:…) dans Render. Sur iPhone :
    iOS 16.4+ et jeu ajouté à l'écran d'accueil.
  - Courbe de progression : Player.progressLog (note à chaque trainWeek,
    30 semaines), carte « Progression » de la fiche (joueurs de son club).
  - Statistiques avancées + export CSV : onglet Statistiques (TS%, eFG%,
    3PA%, LF%, PD/BP, par 36 min, +/-, éval), bouton CSV (séparateur « ; »,
    BOM pour Excel).
  - Revoir le direct : LiveMatch.archiveReplay met de côté chaque direct
    terminé (league.pendingReplays, non sérialisé) ; store.saveMultiLeague
    le range dans « replays » du championnat (60 derniers) ; GET /api/replay
    (Premium, clubs du match, horaires recalés à maintenant) ; bouton
    « ▶ Revoir le direct » dans la feuille de statistiques.
  - Tests : premium_features_test.js (+ premium_test : 13 avantages).

- **✅ COMMITTÉ, À POUSSER (nuit du 2026-09-28) — Comptes : mot de passe
  oublié, suppression du compte, confidentialité, anti-triche**
  - Mot de passe oublié : /api/account/password-forgot (réponse identique
    que le compte existe ou non) → lien /bienvenue#reinit=… à usage unique,
    1 h (empreinte SHA-256 sur le compte) ; /api/account/password-reset →
    connexion directe. Envoi par email via server/mailer.js (Resend) **à
    configurer par l'utilisateur** : RESEND_API_KEY + MAIL_FROM (domaine à
    vérifier chez Resend). Sans ça : lien écrit dans les journaux Render et
    POST /api/admin/accounts/password-reset-link {email} (X-Admin-Token)
    pour le transmettre à la main ; le site affiche « écris-nous sur
    Discord ». Site : « Mot de passe oublié ? », vues viewForgot/viewReset.
  - Suppression : Paramètres → Mon compte → « Supprimer mon compte »
    (SUPPRIMER + mot de passe) → /api/account/delete : compte effacé, club
    confié à l'IA (World.releaseClubToCpu).
  - Confidentialité : politique mise à jour (empreinte IP, journal des
    transferts, suppression, inactivité, Resend) ; FAQ mise à jour.
  - Anti-triche : empreinte d'IP (sel ANTI_CHEAT_SALT, jamais l'IP en clair,
    5 dernières par compte), League.humanTransferLog (ventes entre managers,
    prix + valeur estimée), GET /api/admin/accounts/anticheat : comptes
    partageant une IP, ventes < 40 % de la valeur, ≥ 3 ventes entre deux
    clubs en 30 jours. Signalement seulement, aucune sanction automatique.
  - Tests : server/account_security_test.js, site_password_reset_test.js.

- **✅ COMMITTÉ, À POUSSER (nuit du 2026-09-28) — Récompenses de fin de
  saison, carrière des joueurs, succès du manager** : Engine.
  awardSeasonHonours (appelée quand le champion est connu et au lundi de
  fin de saison, idempotente) : league.seasonAwards (MVP à l'évaluation,
  meilleur jeune ≤ 21 ans, meilleurs marqueur / rebondeur / passeur /
  défenseur, cinq majeur par poste ; saison régulière, au moins la moitié
  des matchs), Player.awards, Player.careerSeasons (une ligne par saison :
  club, division, moyennes), Team.achievements (14 succès, MANAGER_
  ACHIEVEMENTS ; montée débloquée par computeCountryMoves, Coupe nationale
  et Supercoupe par server/nationalCup.js), fil d'actualité. Navigateur :
  Histoire du club (Récompenses de la saison, Succès du manager), fiche
  joueur (Carrière, Distinctions), écran de fin de saison. Test :
  season_awards_test.js.

- **✅ COMMITTÉ, À POUSSER (nuit du 2026-09-28) — Managers inactifs** :
  Team.lastSeenAt (enregistré par resolvePlayerContext au plus toutes les
  6 h) ; World.releaseInactiveManagers (catchUpWorld) rend le club à l'IA
  après INACTIVE_RELEASE_DAYS = 28 jours (**valeur choisie par Claude, à
  valider** ; variable d'environnement BASKET_INACTIVE_RELEASE_DAYS) : nom,
  effectif, palmarès gardés, jeton supprimé, amicaux et enchères en tête
  annulés ; le compte garde releasedClub → à la reconnexion,
  World.reclaimClub lui rend son club s'il est toujours à l'IA (sinon
  nouveau club, flux habituel). Un club jamais vu depuis ce déploiement
  démarre son horloge au premier rattrapage. Guide + en.js. Test :
  server/inactive_manager_test.js (les tests qui simulent une saison entière
  sans visite fixent BASKET_INACTIVE_RELEASE_DAYS très haut).

- **✅ COMMITTÉ, À POUSSER (nuit du 2026-09-28) — Amicaux entre championnats
  et entre pays** : server/worldFriendlies.js (données annexes du monde
  « friendlies », mêmes règles que server/friendlies.js : jour de repos des
  deux clubs, heure de Paris, invitation 3 jours / 1 h avant, un amical par
  jour — jours « monde » ajoutés aux conflits via league.worldFriendlyDays),
  joués par catchUpWorld (Friendlies.playFriendlyMatch, extrait de
  simulateFriendly) ; routes /api/friendly/* : proposition avec
  opponentRef {leagueId, idx}, actions sur un id « w… », jours
  ?league=&club= ; liste fusionnée + clubs invités légers (3000 + k).
  Navigateur : la recherche d'adversaire interroge aussi /api/world/search
  (clubs des autres championnats, drapeau et division), étiquette de
  championnat sur les lignes. Test : world_friendly_test.js. Limite : pas
  de message privé (messagerie par championnat), l'adversaire est prévenu
  dans son fil d'actualité.

- **✅ COMMITTÉ, À POUSSER (nuit du 2026-09-28) — Barrage (7e contre 8e) en
  direct** : rythme hebdomadaire → League.scheduleRelegationBarrage au
  premier créneau des play-offs (mardi 20:00, les 7e et 8e n'y jouent pas),
  le 7e reçoit ; server/autoSim.js:stepRelegationBarrage (appelé par
  ensureLiveMatch et catchUpLeague) : diffusion « barrage:<saison> » si un
  manager joue, résultat à la fin de la fenêtre (ou d'un coup si en retard),
  fil d'actualité ; runRelegationBarrage résout un barrage en attente avec
  les mêmes clubs (montées/descentes). Navigateur : écran de préparation
  « Barrage (7e contre 8e) » (ordres du moment), ligne au calendrier, texte
  de fin de saison « en direct … ». Pas de stats de joueurs (comme avant).
  Test : barrage_live_test.js.

- **✅ COMMITTÉ, À POUSSER (nuit du 2026-09-28) — Marché des transferts
  mondial + rattrapage du monde qui n'écrit que les ligues modifiées**
  - server/worldMarket.js : index de toutes les annonces ouvertes du monde
    (données annexes « market », store.loadWorldAuxRaw/saveWorldAuxRaw),
    reconstruit à chaque catchUpWorld ; identifiant global stable (gid) ;
    GET /api/save ajoute au marché de chaque manager les annonces des AUTRES
    championnats (150 au plus, joueurs allégés, les plus proches de la clôture + celles où il
    a enchéri ; id = −gid, vendeur = club invité léger 1000 + k) et montre
    les enchérisseurs d'ailleurs sur ses propres annonces (invités 2000 + k).
  - Enchère sur une annonce d'ailleurs : POST /api/market/bid avec id
    négatif → League.placeForeignBid dans la ligue du vendeur
    (currentBidderIdx = Engine.FOREIGN_BIDDER_IDX, currentBidderRef) ;
    clôture → « foreign-pending » puis transfert au rattrapage suivant
    (resolveForeignTransfers, Engine.transferPlayerBetweenTeams, extrait de
    _resolveListing), déclenché pile à la clôture (échéance du monde).
  - catchUpWorld garde toutes les ligues en main et ne réécrit que celles
    dont la sérialisation a changé (hors horodatages informatifs des marchés
    de staff) → point 5 de la liste fait.
  - Navigateur : filtre « Monde entier / Mon pays / Mon championnat »,
    drapeau + division du vendeur sur la carte, refus serveur affiché puis
    état rechargé (reloadLeagueOnly) ; guide + en.js.
  - Test : world_market_test.js.
  - Limites : index rafraîchi au plus toutes les 10 min (une nouvelle
    annonce d'un autre championnat peut mettre ce temps à apparaître) ; pas
    d'enchère CPU d'un championnat sur l'annonce d'un autre.

- **✅ COMMITTÉ, À POUSSER (nuit du 2026-09-28) — Coupe nationale en direct
  + Supercoupe (option (b) « tout d'un coup avec le direct »)**
  - server/nationalCup.js : une Coupe PAR PAYS (world.cups[country]) qui
    remplace la Coupe interne des championnats du monde à partir de la
    saison suivant la création du monde ; 512 clubs max (divisions les plus
    hautes d'abord), tableau à la puissance de 2, exempts aux divisions les
    plus hautes ; handicap +7/division d'écart (plafond +21) ajouté au score
    (et au tableau d'affichage du direct, withHandicap) ; un tour le jeudi
    20:00 (tour k = semaine k) ; au coup d'envoi, match calculé une fois,
    diffusion déposée dans la ligue de CHAQUE manager concerné (clé
    « ncup:… »), adversaire d'une autre ligue = club invité (index 100 +
    numéro du tour) ; fin de diffusion : stats/MVP des deux côtés, primes,
    fil, tour suivant ; champion au palmarès (history.cupWinner).
  - server/world.js : step de la Coupe dans catchUpWorld, nouvelle Coupe à
    la reprise commune, League.nationalCupAlive (clubs en course → jeudis
    réservés pour les amicaux, server/friendlies.js), échéance suivante
    (events.nextDeadlineAt) → server/index.js relance le rattrapage pile au
    coup d'envoi / à la fin de diffusion (minuterie de fond toutes les
    minutes, rattrapage réel toutes les 10 min sinon).
  - server/index.js : GET /api/save projette la Coupe nationale dans la
    forme de la Coupe interne (NationalCup.projectForLeague : le match du
    club à chaque tour, scores handicap compris) + guestTeams ;
    resolvePlayerContext pose league.nationalCupPending (ordres préparés du
    tour, verrou T − 5 min, server/actions.js) ; routes /api/world/cup et
    /api/world/cup/round (tableau complet d'un tour, pagination, « à jouer ») ;
    scouting Pro du club invité (attachNationalCupGuests, rapport tiré de
    son propre championnat) ; /api/spectate tolère l'invité.
  - Navigateur : installGuestTeams (league.teams devient un Proxy qui ne
    répond aux index invités qu'en lecture directe : longueur/boucles
    inchangées) ; clic sur un club invité → Planète Hoop ; page Coupe
    nationale (renderNationalCupSection : intro handicap, onglets de tours
    jusqu'aux 256es, tableau du tour demandé au serveur avec niveau D.x et
    pastille +7, exempts, phase finale alignée) ; rappel du handicap sous le
    score du direct ; guide + en.js.
  - Supercoupe (world.superCups[country]) : programmée à l'intersaison
    (samedi 20:00 heure locale avant la reprise), champion de D I contre
    vainqueur de la Coupe (finaliste si même club), direct (competition
    "cup", tour SUPERCUP_ROUND = 99, invité 199), handicap, prime 200 000 €
    (montant choisi par Claude, à valider), trophées Coupe nationale et
    Supercoupe, palmarès du pays (history.cupWinner/superCupWinner, affichés
    dans Planète Hoop) ; carte en tête de la page Coupe, ligne au calendrier.
  - Tests : server/national_cup_test.js, national_cup_ui_test.js,
    super_cup_test.js.
  - Limites connues : pas de stats de joueurs pour la Supercoupe (match de
    gala, pas de feuille de match après coup) ; pas d'ordres préparés pour
    la Supercoupe (ordres du moment).

- **✅ COMMITTÉ, À POUSSER (2026-09-28) — Championnats par pays (France/USA),
  divisions ouvertes à la demande, montées/descentes, saisons synchronisées**
  — reprise du travail d'une autre session (arrêtée par l'utilisateur) +
  décisions utilisateur : « on va dans la division la plus haute où il y a un
  bot », divisions ouvertes quand la précédente est pleine, champion des PO
  monte, 9e/10e + perdant du barrage descendent, mise à jour unique lundi 6h
  Paris, une semaine d'intersaison.
  - server/world.js : registre du monde (pays, championnats, jeton → ligue),
    fr-1 = ligue historique (même clé/fichier), us-1 créée automatiquement,
    une sauvegarde PAR championnat (store.leagueStorage/worldStorage) ;
    assignClub (division la plus haute avec un club de l'IA, sinon ouverture
    du championnat suivant : 2a, 2b, 2c, 3a…) ; createLeague CALE la nouvelle
    ligue sur le calendrier du pays (et tous les pays sur les mêmes semaines,
    syncCalendarTo), journées passées simulées avant l'arrivée du manager ;
    computeCountryMoves (autant de descentes que de ligues filles ouvertes :
    10e, 9e, perdant du barrage ; champion de chaque fille monte ; prime de
    montée ; fil ; pendingDivisionMove) ; applyCountryMoves (échange à index
    égal, annonces/amicaux annulés, jetons mis à jour) ; catchUpWorld (toutes
    les ligues avancent, reprise commune de tout le pays le lundi 6h).
  - server/index.js : maybeCatchUpWorld au plus toutes les 10 min (requête
    avec jeton + minuterie de fond), resolvePlayerContext charge SEULEMENT le
    championnat du manager ; autoNextSeason = false sur les ligues du monde.
  - Fuseau : League.timeZone explicite pour les horaires ET la mise à jour
    unique (zoned* ; la mise à jour est calculée en heure de Paris quoi
    qu'il arrive) ; le fuseau « courant » (setCalendarTimeZone/
    useLeagueTimeZone) reste pour les calculs au jour près (repos, amicaux).
  - Inscription : choix du pays (site), nom de club unique dans le monde.
  - UI : page Ligue « drapeau · Division II · Groupe B » ; encadré
    d'intersaison « vous jouerez en … ».
  - Tests : server/world_test.js, server/world_season_test.js,
    server/timezone_test.js ; new_season_ui_test (horloge serveur figée).
  - Planète Hoop (retours : nom validé, « en bas du menu avec le guide et
    premium », « choisir le pays (son pays par défaut) », un autre
    championnat se trouve « via la barre de recherche en haut ») : onglet
    data-tab="planete" ; pays (drapeaux), le pays en chiffres (divisions
    ouvertes en liens, palmarès = champion de D I par saison, meilleurs de
    la saison pts/reb/pas/éval), championnat affiché (le sien par défaut) :
    classement, derniers résultats, effectif d'un club en lecture seule ;
    barre de recherche du haut étendue au monde (championnats + clubs).
    Serveur : /api/world/overview|league|club|search ; résumés, stats et
    palmarès tenus dans le registre par catchUpWorld. Numérotation
    BuzzerBeater des groupes : fr-2.1 / « Division II.1 » … VI.243.
    Guide « Pays, divisions et Planète Hoop », en.js, planete_hoop_test.js.
  - RESTE : marché des transferts
    MONDIAL ; Coupe nationale (512) et Supercoupe D I ; barrage en direct ;
    amicaux entre pays ; optimisation (ne sauvegarder que les ligues
    modifiées dans catchUpWorld) ; Postgres plus tard si besoin.

- **🛠 CODÉ, TESTS VERTS, À COMMITTER/POUSSER (2026-09-28) — Nationalités + drapeaux** — retours
  utilisateur : "un petit drapeau sur la fiche joueur", "étoffe la liste
  des pays, il faut la Chine et même les petits pays (équipes nationales
  plus tard)". ~90 pays (NATIONS, engine.js + miroir html), France = 60 %
  des nouveaux joueurs, prénom/nom tirés dans le réservoir du pays
  (NAME_POOLS). Joueurs existants : nationalityFromName (hash du nom,
  pays dont le réservoir contient le nom de famille), puis sauvegardée.
  Drapeaux : assets/flags/xx.png (64×48, générés depuis flag-icons, MIT).
  Affichage : fiche joueur (drapeau + pastille du pays), Effectif et
  effectif d'un autre club, Marché (nom du pays au survol) ; noms des pays
  traduits dans assets/i18n/en.js. Test : nationality_test.js. Suite :
  équipes nationales / divisions par pays (à discuter).

- **✅ COMMITTÉ, À POUSSER (2026-09-28) — Toutes les pages en pleine
  largeur** — retours : "certaines pages ne prennent pas toute la largeur à
  l'écran", "il faudra faire attention à tout bien paramétrer", Effectif :
  "les colonnes sont toutes entassées à droite sauf celle des noms".
  WIDE_PAGE_IDS = new Set(PAGE_IDS) (plus de gabarit 960px) ; plafonds
  retirés : Ligue (#standingsSection 1180px), Ordres (#prepSection
  1240px), Comparateur (1440px) ; Effectif/fiche équipe : nom ≈ 24 % (min
  200px), autres colonnes réparties, « … » au plus juste. Restent plafonnés
  exprès : direct (live.css, 1180px, maquette dédiée) et écran de
  rattrapage (760px, texte court). Vérifié en capture à 1920 et 1366 px sur
  22 pages, aucun débordement horizontal. NB : player_detail_test.js échoue
  AUSSI sur HEAD sans ce changement ("la fiche équipe adverse devrait
  afficher des liens joueur cliquables") → à investiguer à part. Autre
  trouvaille : en carrière solo, après 4 journées rattrapées,
  goToOrdresTab → renderPrep plante (teamB indéfini) — à investiguer.

- **✅ COMMITTÉ (b792edd), À POUSSER SI PAS FAIT (2026-09-28) —
  Scouting : « Comment ils marquent » + contre-attaques recalibrées** —
  retours utilisateur : "comment ils marquent leur point" puis, sur la
  maquette validée, deux blocs "par type de tir" (raquette / mi-distance /
  3 pts / lancers francs, total 100 %, mêmes zones que la carte des tirs)
  et "par situation" (sur passe décisive, sur action individuelle, seconde
  chance, contre-attaque — cumulables ; seconde chance et contre-attaque
  jamais cumulées entre elles, lancers francs de la possession compris).
  Moteur (engine.js + miroir html) : Player.stats ptsPaint/ptsMid/pts3,
  ptsAssisted/ptsSolo, ptsSecondChance (drapeau _secondChance posé sur
  rebond offensif) / ptsTransition, via this._possSituation (relu par
  freeThrows) ; copiés dans matchLog. transitionChanceFromSpeed recalibré
  ((vitesse-50)/250 + 0.22, bornes 0.12-0.40) : ~10 % des points en
  contre-attaque (4 % avant, 0,5 % pour les effectifs de départ ; ~6 %
  désormais pour eux), ~+3 pts/match. Client : computeScoringOrigins /
  sp2ScoringOriginsHtml (Profil et style, sous les zones de tir). Tests :
  scoring_origins_test.js, scouting_pro_test.js (C2bis).
  + Secondes chances réduites (retour utilisateur : "réduis les secondes
  chances") : OFF_REBOUND_BASE_WEIGHT = 0.5 sur l'effort de rebond
  offensif (engine.js + miroir) : 45 % → ~29 % de rebonds offensifs
  (18 → ~11,5 par équipe et par match), secondes chances 20 % → ~13 % des
  points ; points/match inchangés (~91), contre-attaques ~11 %.

- **✅ EN PROD (bde7bed, poussé) — EN ATTENTE DU 2e EXAMEN ADSENSE (2026-09-28) — AdSense refusé :
  « annonces sur des pages sans contenu d'éditeur »** — un visiteur sans
  compte ne voyait que /bienvenue (inscription) et la coquille du jeu.
  - server/site.js (nouveau) : pages publiques /le-jeu, /guide (+ 24
    /guide/<id> lues dans #guideSection de moteurbasket3.html, une seule
    source), /faq, /a-propos, /contact, /confidentialite,
    /mentions-legales (éditeur Antony Szatmari, contact@hoop-manager.com),
    robots.txt, sitemap.xml. ~7 000 mots. Script AdSense sur ces pages
    seulement.
  - server/ads.js : le jeu ne reçoit plus que window.HM_ADS + shim ;
    adsbygoogle.js chargé par hmAdsLoadScript (moteurbasket3.html) une fois
    le manager connecté. /bienvenue sans script, avec liens vers le contenu
    + pied de page ; « Aucune publicité » retiré.
  - Tests : site_pages_test.js (nouveau), ads_integration_test.js adapté ;
    scouting_pro, hoop_show_player, server/index, server/accounts verts.
  - Fait (utilisateur, 2026-09-28) : contact@hoop-manager.com (IONOS, reçu
    OK) ; 2e examen AdSense demandé. Après approbation : vérifier Annonces
    automatiques = Désactivé, s'inscrire à H5 Games Ads, retirer
    ADSENSE_TEST sur Render.

- **✅ COMMITTÉ, À POUSSER (2026-09-28) — Retraite des joueurs + une seule
  discussion par demande de transfert** — retours utilisateur : annonce une
  saison à l'avance, « il faudrait pouvoir le convaincre de jouer un peu
  plus », « 3 par saisons c'est bien, au début, à la moitié, à la fin »,
  « gratuit », indice plutôt que pourcentage ; demande de transfert : « il
  faut pouvoir le faire une seule fois, sinon c'est abusé ».
  - Moteur (engine.js + miroir) : RETIREMENT_* ; annonce à la mise à jour de
    fin de saison APRÈS vieillissement (34 ans 10 %, 35 25 %, 36 45 %, 37
    65 %, 38 85 %, 39 certain ; titulaire ×2/3, réserviste ×1,5) ;
    Team.retirementTalkStatus/talkRetirement (1 tentative par tiers de
    saison, 4 semaines chacun ; chance 30 % + Mental jusqu'à +20 % + rôle
    +15/+5/-10 % + motivation +10/-15 % - 10 %/an au-delà de 36 ; 0 à 39
    ans) ; League.retireAnnouncedPlayers (AVANT vieillissement, enchère
    annulée, IA remplacée par un jeune 20-23 ans de niveau comparable,
    humain complété à MIN_ROSTER_SIZE), ageCpuPlayers (l'IA ne vieillissait
    jamais), announceRetirements. Player.transferRequestDiscussed.
  - Serveur : autoSim.runWeeklyEconomyTick (fin de saison), route
    /api/player/retirement-talk.
  - UI : pastille « Dernière saison » (effectif, fiche adverse, marché),
    encadré fiche joueur (citation, indice, bouton), guide « Demandes de
    transfert et retraite », en.js.
  - Tests : retirement_test.js, retirement_ui_test.js.
  - NB : n'a d'effet réel qu'avec une nouvelle saison qui GARDE les
    effectifs (aujourd'hui le reset régénère tout).

- **✅ COMMITTÉ, À POUSSER (2026-09-28) — Lot A : nouvelle saison automatique
  qui garde les effectifs** — League.startIntersaison (forme 100,
  motivation >= 55, demandes de transfert refermées), paySeasonEndBonuses
  (champion de D1), startNextSeason (saison n+1, nouveau calendrier le mardi
  20h, nouvelle Coupe, classement/PO/stats remis à zéro, objectifs,
  interview d'avant-saison, fil « La saison N est lancée »),
  divisionOutcomeForTeam ; garde-fou de vieillissement par numéro de saison
  (Player.lastAgedSeasonNo, opts.seasonNo de trainWeek/ageCpuPlayers) ;
  League.seasonNumber/intersaisonStartedAt/autoNextSeason (false = ancien
  comportement) sérialisés. server/autoSim.js : archive + sponsors AVANT la
  remise à zéro des stats, puis intersaison ; lundi suivant : mise à jour
  normale puis startNextSeason ; les marchés tournent pendant l'intersaison.
  UI : écran de fin de saison en ligue partagée (plus de bouton « Démarrer
  une nouvelle saison », encadré d'intersaison, verdict pour myTeamIndex,
  pas de montée/descente sans pyramide) ; guide + tutoriel + en.js. Tests :
  server/new_season_test.js, new_season_ui_test.js ; weekly_calendar_test
  adapté (intersaison). NB : la légende du classement affiche encore
  « Relégation directe (9e, 10e) » en ligue unique (vrai avec la pyramide).
  NB 2 : calendrier_ordres_stale_live_redirect_test.js est instable
  (passe 1 fois sur 2, déjà avant ce lot).

- **✅ COMMITTÉ, À POUSSER (2026-09-28) — Fuseau horaire par ligue et mise à
  jour hebdomadaire UNIQUE** (décision utilisateur : « garde ce que t'as pour
  le point 4 ») — League.timeZone (null = Paris ; « America/New_York » aux
  USA : matchs à 20:00 heure locale), passé EXPLICITEMENT aux fonctions du
  calendrier dans les 4 copies (zonedLocalDateParts/zonedEpochForLocalTime/
  zonedScheduledTimeForSlot ; weeklyRhythm*(…, timeZone)) ; la mise à jour
  hebdomadaire et de fin de saison tombe au MÊME instant pour tous les pays :
  lundi 6h à Paris (WEEKLY_RHYTHM_ECONOMY_HOUR = 6, s'applique aussi à la
  ligue actuelle), sinon joueurs qui vieillissent deux fois ou pas du tout.
  ⚠️ Pour les championnats par pays (server/world.js) : poser
  `league.timeZone` à la création d'une ligue américaine, et NE PAS passer
  par un fuseau global (setCalendarTimeZone) qui changerait aussi l'heure de
  la mise à jour unique. Textes guide/tutoriel/en.js (« lundi à 6h »).
  Montées/descentes par pyramide : en attente (seront rebranchées sur le
  système de championnats par pays de l'autre session : ouverture à la
  demande calée sur le calendrier du pays, montées/descentes au prorata des
  ligues filles ouvertes, reprise commune après l'intersaison).

- **📝 DÉCIDÉ, À CODER (2026-09-28) — Nouvelle saison qui garde les effectifs
  + divisions / pays / montées-descentes** — décisions utilisateur :
  - Pays : France ET USA au lancement (une pyramide chacun + Coupe
    nationale + Supercoupe) ; matchs à l'heure locale (20:00 Paris / 20:00
    New York) ; marché des transferts MONDIAL ; un manager choisit
    librement son pays (un Italien va où il veut ; ouvrir un pays plus tard
    selon la demande).
  - 10 clubs par ligue, pyramide ×3 (DIVISIONS existant), divisions I à III
    au lancement (13 ligues par pays, complétées par l'IA).
  - Montées/descentes : champion des PO monte ; 9e et 10e descendent ;
    barrage 7e-8e en UN match sec (proposition : mardi de la semaine 10),
    le perdant descend.
  - Mise à jour hebdomadaire ET de fin de saison à une heure UNIQUE pour
    tous les pays : lundi 6h00 Paris (sinon joueurs qui vieillissent deux
    fois ou pas du tout) ; garde-fou par joueur (dernière saison de
    vieillissement).
  - Cycle de 12 semaines : 9 championnat + 2 PO + 1 semaine d'INTERSAISON
    (lundi : vieillissement, salaires, retraites, montées/descentes,
    nouvelles ligues, sponsors, archive ; forme physique remise à 100 ;
    marché ouvert ; amicaux possibles et comptés pour l'entraînement des
    fondamentaux ; samedi : Supercoupe du pays, Division I seulement,
    champion vs vainqueur de Coupe).
  - Motivation ramenée à « Neutre » (55) pour ceux qui sont en dessous, à
    l'intersaison (validé 2026-09-28) ; les demandes de transfert en cours
    se referment donc aussi.

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

- **💡 Idées pour plus tard (non faites)** :
  - Sponsors : carton dans les émissions, section dans le Guide.
  - Messagerie : cartes « offre de transfert » dans le fil, notification
    push mobile, écran de modération dans l'appli.

### À investiguer

- **lineup_minutes_test.js** : échec ponctuel constaté le 2026-09-28
  ("Arrière : titulaire trop loin de sa cible"), repassé 3/3 ensuite —
  aléatoire du moteur, flaky.
- ✅ RÉGLÉ (2026-09-28) : cup_ordres_planning_test.js (test antérieur à la
  règle « 3 joueurs max par poste » : libère une place de remplaçant Pivot
  avant de tester l'ajout), player_detail_test.js (la fiche équipe s'ouvre
  sur « Aperçu », les liens joueur sont dans « Effectif »),
  calendrier_ordres_stale_live_redirect_test.js (attente de l'aller-retour
  serveur au lieu d'un délai fixe de 300 ms).
- ✅ RÉGLÉ (nuit du 2026-09-28) : les 4 tests instables sous charge.
  Cause principale : « read ECONNRESET » — le serveur de test fermait les
  connexions keep-alive inactives après 5 s (défaut Node) pendant que
  fetch (undici) les réutilisait ; test_helpers.startTestServer porte
  keepAliveTimeout à 65 s (onboarding_tour, post_match_interview_button,
  et tous les tests qui passent par startTestServer). end_to_end et
  post_match_interview_button : attente par sondage (jusqu'à 10 s) au lieu
  d'un délai fixe. player_season_stats_modal : le joueur testé est celui
  qui a joué le plus (le premier de l'effectif pouvait avoir 0 match).

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
