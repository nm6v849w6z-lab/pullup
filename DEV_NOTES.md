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

- **🛠 EN COURS (2026-09-29, cette session) — lot demandé par l'utilisateur** :
  1. ✅ Légende/zones du classement selon les divisions réellement ouvertes
     (World.divisionMovesFor → league.divisionMoves dans GET /api/save ;
     leagueDivisionMoves/standingsRowZone/standingsLegendItems côté jeu ;
     standings_zones_test.js). Barrage 7e-8e supprimé quand il n'a pas
     d'enjeu (< 3 championnats ouverts dessous, décision utilisateur) :
     league.barrageHasStakes (transitoire, posé par catchUpWorld et
     resolvePlayerContext), autoSim ne le programme pas / annule un barrage
     programmé non commencé. barrage_stakes_test.js ; barrage_live_test.js
     déclare 3 championnats dessous.
     ⚠️ Rien n'est poussé : l'utilisateur veut UN SEUL push à la fin du lot.
  2. ✅ Chargement mobile : 8 visuels de salle → assets/arena/niveau-N.jpg,
     logo → /assets/brand/logo-hoop-manager.png (page 4,8 → 2,9 Mo) ;
     compression brotli/gzip (server/index.js sendBody : HTML, JS, CSS,
     JSON ; version compressée des fichiers gardée en mémoire) → 0,65 Mo
     transférés. load_size_test.js. Au passage : départage des postes à
     égalité d'aptitude à l'entraînement = poste « naturel » d'avant
     (trainingTieBreak ; jeu intérieur → Pivot, 3 pts → Arrière), le
     tableau du 2026-09-29 avait rendu Ailier fort/Meneur par défaut.
  3. ✅ Rivalités : Engine.recordHumanRivalry (appelé par
     recordMatchStatsAndAwardMvp, donc tous les matchs officiels ; amicaux
     et IA exclus) → Team.rivalries[nom du club en minuscules] {w,l,pf,pa,
     recent (5)} ; ligne « Face à face : 3 V – 1 D · dernier match » +
     badge « Derby » (≥ DERBY_MIN_GAMES = 3, valeur choisie par Claude) sur
     la carte du match des Ordres et le bandeau du tableau de bord
     (rivalryLineHtml) ; « Première confrontation entre managers » ;
     émission d'avant-match « LE DERBY » + bilan dans la bulle
     (showsAdapter rivalry → showData). Score = quarts-temps (sans le
     handicap de Coupe nationale).
  4. ✅ Classement mondial des managers : Team.managerRating (Elo, départ
     1500, K = 24, valeurs choisies par Claude), managerRatedGames ;
     leagueSummary.managers → World.managerRanking → GET
     /api/world/managers ; carte « Classement mondial des managers » en tête
     de Planète Hoop (10 premiers + sa place). rivalry_ranking_test.js.
  5. Propositions Premium : salle personnalisée, avatars des jeunes.

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

- **training_progression_test.js** : échec ponctuel le 2026-09-29 (nombre
  de lignes « aucune minute » 3 au lieu de 4), repassé 3/3 ensuite — flaky.
- **lineup_minutes_test.js** : échec ponctuel constaté le 2026-09-28
  ("Arrière : titulaire trop loin de sa cible"), repassé 3/3 ensuite —
  aléatoire du moteur, flaky.
- Également flaky en sandbox : mobile_viewport_meta_test.js (fetch failed).

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
