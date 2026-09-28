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

- **💡 Idées pour plus tard (non faites)** :
  - Sponsors : carton dans les émissions, section dans le Guide.
  - Messagerie : cartes « offre de transfert » dans le fil, notification
    push mobile, écran de modération dans l'appli.

### À investiguer

- **lineup_minutes_test.js** : échec ponctuel constaté le 2026-09-28
  ("Arrière : titulaire trop loin de sa cible"), repassé 3/3 ensuite —
  aléatoire du moteur, flaky.
- **cup_ordres_planning_test.js échoue** (constaté le 2026-09-27, aussi sur
  une copie git archive du HEAD d'alors, donc antérieur aux amicaux) :
  "❌ Pas de <select> « Ajouter un remplaçant » pour le poste Pivot" — écran
  Ordres (refonte cinq/rotation/convocation), pas creusé.

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
