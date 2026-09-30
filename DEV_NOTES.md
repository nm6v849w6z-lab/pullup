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
  textes jeu/site/en.js) ; prime de Supercoupe **200 000 €**.

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
