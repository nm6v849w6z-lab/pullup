# Serveur — calendrier réel & diffusion en direct

Le championnat avance tout seul, sur un vrai rythme calendaire (retour
utilisateur, 2026-09 : "le jeu va être online, donc il faudra mettre un
calendrier réel / dans une vraie semaine, 2 matchs de championnat + 1 de
coupe") — 2 matchs de championnat par semaine réelle, un match du club du
joueur diffusé "en direct" à l'heure programmée, entraînement hebdomadaire
automatique — plutôt qu'au clic ("Verrouiller & simuler"/"Valider la
semaine"), comme dans les toutes premières versions du prototype navigateur
(`moteurbasket3.html`). L'interface elle-même a été entièrement adaptée à ce
fonctionnement (tâche #21 : préparation à l'avance — feuille de match,
tactiques, entraînement — au lieu d'actions immédiates ; tâche #22 :
rafraîchissement automatique de la page ; tâche #23 : test de bout en bout
du scénario réel, voir `../end_to_end_test.js` et le README à la racine du
projet) ; voir "État actuel" ci-dessous pour ce qui reste hors-scope.

**Portée volontairement limitée à cette étape** (décidé avec l'utilisateur) :

- une seule ligue = un manager humain (`teams[0]`) + 9 adversaires CPU —
  pas encore le multijoueur à 10 managers ;
- pas encore de vrai match de coupe/amical (voir "Prochaines étapes").

Hébergement en ligne : voir "Persistance en ligne (Render + Upstash Redis)"
plus bas — `node server/index.js` reste par ailleurs identique qu'on le
lance en local ou en ligne.

**Mode accéléré (tests/démo solo)** : le calendrier classique ci-dessus
prend ~9 semaines réelles pour une saison de 18 journées — trop long pour
tester seul avant d'ouvrir le jeu à plusieurs managers. Démarrer le serveur
avec `BASKET_FAST_CALENDAR=1` simule un match de championnat toutes les 3h
(intervalle glissant depuis l'instant de création — pas d'heure de la
journée fixe à respecter) au lieu d'être espacés sur plusieurs jours ; tous
les deux matchs (fin de la "semaine" de 6h), l'entraînement et la semaine
économique se mettent à jour comme d'habitude. Une saison complète de 18
journées se joue alors en ~54h (2-3 jours réels) :

```bash
BASKET_FAST_CALENDAR=1 node server/index.js
```

Ce réglage n'affecte QUE les nouvelles ligues générées à partir de ce
démarrage (nouvelle carrière, nouvelle saison) — voir
`League.calendarWeekMs`/`calendarSlotOffsetsMs` (engine.js) : une carrière
déjà en cours garde son propre rythme, et une nouvelle saison hérite
explicitement du rythme de la précédente plutôt que de relire ce réglage.
Relancer le serveur sans la variable revient au calendrier classique pour
toute NOUVELLE carrière — sans jamais changer le rythme d'une carrière déjà
créée en mode accéléré. Voir `server/calendar.js` (section "MODE ACCÉLÉRÉ")
pour le détail, et `../fast_calendar_test.js`/`calendar_test.js` pour les
tests correspondants.

## Fichiers

- `calendar.js` — calculs purs (aucun accès disque/réseau, aucune
  dépendance à `engine.js`) : à quel instant réel chaque journée de
  championnat doit se jouer (2 par semaine réelle, espacées — pas dos à
  dos), et `MATCH_BROADCAST_DURATION_MS` (1h30, comme sur BuzzerBeater), la
  durée réelle de la diffusion en direct du match du club du joueur. Le 3e
  match visé par le retour utilisateur (coupe/amical) n'est pas encore
  dedans — la compétition de coupe elle-même n'existe pas encore côté
  moteur (onglet "Coupe" toujours un placeholder). Expose aussi le "mode
  accéléré" (tests/démo solo — voir plus haut) : `setFastTestMode`/
  `isFastTestModeEnabled`/`getDefaultCalendarConfig` pilotent le réglage
  GLOBAL utilisé pour GÉNÉRER une nouvelle ligue, tandis que
  `scheduledTimeForRound`/`scheduledTimeForLeagueRound` restent des
  fonctions pures paramétrées par `weekMs`/`slotOffsetsMs` — c'est
  `League.calendarWeekMs`/`calendarSlotOffsetsMs` (engine.js), figés à la
  création de CHAQUE ligue, qui décident réellement du rythme appliqué,
  jamais ce réglage global relu après coup.
- `liveMatch.js` — diffusion en direct du match du club du joueur (retour
  utilisateur : "il faut que le match se joue tout seul à 19h / si je me
  connecte à 19h30 je dois reprendre le match là où il en est, jamais depuis
  le début" + "ça doit durer 1h30" + "une vraie mi-temps, des pauses de
  quart-temps et des temps morts" + "je ne dois pas pouvoir accélérer le
  direct"). Le match est simulé EN UNE FOIS dès l'heure programmée, avec le
  moteur complet (`Engine.MatchEngine`) : le résultat est donc figé dès cet
  instant, mais chaque événement reçoit un horaire réel de diffusion
  (`airAt`) étalé sur `MATCH_BROADCAST_DURATION_MS`, pauses "spectacle"
  comprises (mi-temps, quart-temps, temps morts — purement narratives,
  n'affectent jamais le score). Le navigateur ne fait que LIRE `airAt`/les
  pauses pour savoir ce qui est déjà "passé à l'antenne" à l'instant présent
  (`Date.now()`) — jamais de vitesse de lecture réglable côté client. Expose
  `ensureLiveMatchStarted` (démarre la diffusion si l'heure est atteinte et
  qu'elle n'a pas déjà commencé) et `finalizeLiveMatch` (une fois la fenêtre
  de diffusion entièrement écoulée, enregistre le résultat déjà déterminé —
  sans le resimuler).
- `autoSim.js` — `catchUpLeague(league, team, now)` : fait avancer une ligue
  jusqu'à l'instant `now` — journées dues (résolues via `liveMatch.js` si
  une diffusion était en cours, ou simulées "en coulisses" sinon, comme les
  4 autres rencontres CPU vs CPU de la même journée), entraînement
  hebdomadaire (une fois par semaine réelle — joueur ET rattrapage
  automatique des adversaires CPU, voir `League.trainCpuTeams`/
  `Team.trainWeekCPU` côté moteur), marché des transferts, et calcul
  automatique des play-offs/barrage une fois la saison régulière terminée.
  Peut rattraper plusieurs semaines (voire plusieurs mois) d'un coup si
  personne n'est venu depuis longtemps — c'est ce mécanisme qui alimente
  l'écran "Pendant votre absence" côté navigateur. `ensureLiveMatch` est un
  pass-through vers `liveMatch.js`, appelé séparément (voir `index.js`,
  AVANT `catchUpLeague`, qui lui finalise une diffusion déjà terminée).
- `store.js` — persistance sur disque (un fichier JSON), même format que la
  sauvegarde navigateur (réutilise `serializeTeam`/`teamFromSave`/
  `serializeLeague`/`leagueFromSave` d'`engine.js` — une seule copie de
  cette logique, partagée). `SAVE_VERSION` est toujours réécrit à la
  sauvegarde, quelle que soit la version envoyée par le client.
- `actions.js` — validation + application des décisions du manager (feuille
  de match, tactiques, entraînement, plan à l'avance, marché, congédiement
  du staff), derrière `/api/lineup`, `/api/tactics`, `/api/training`,
  `/api/plan`, `/api/market/list`, `/api/market/bid`, `/api/market/coach-bid`,
  `/api/staff/fire-trainer` — voir plus bas ("désormais appelées par le
  navigateur") pour le détail de qui les appelle et depuis quel écran.
- `messages.js` — messagerie privée entre managers de la ligue PARTAGÉE
  (2026-09-26 ; pas de chat de ligue, les forums sont sur Discord). Stockée
  à part de la ligue (`data/messages.json`, ou clé Redis `pullup:messages`
  si Upstash est configuré). Routes : `GET /api/messages/summary` (non-lus,
  conversations, annuaire des managers), `GET /api/messages/thread?with=<index
  d'équipe>`, `POST /api/messages/send {to, text}`, `/read {with, upTo}`,
  `/block {teamIndex, blocked}`, `/report {with, messageId, reason,
  comment}`. Modération : `GET /api/admin/message-reports` (liste) et `POST
  {id}` (clore), avec `X-Admin-Token`. En solo, `summary` renvoie
  `available:false` et les autres routes 404.
- `index.js` — serveur HTTP minimal (module natif `http`, aucune
  dépendance) :
  - `GET /` — sert `moteurbasket3.html` directement (relu à chaque requête,
    pas de cache) : la page tourne à une vraie adresse
    (`http://localhost:4000`) au lieu d'être ouverte en double-clic
    (`file://`), nécessaire pour qu'elle puisse faire `fetch()` vers cette
    même API. Ne touche pas à la sauvegarde, comme `/api/health`.
  - `GET /api/health` — sonde de vie, ne touche pas à la sauvegarde.
  - `GET /api/state` — démarre une diffusion en direct si due
    (`ensureLiveMatch`), rattrape tout ce qui est dû (`catchUpLeague`),
    sauvegarde si besoin, renvoie un résumé lisible (`buildStateSnapshot` —
    classement, prochain match programmé, budget...) + les événements
    survenus pendant ce rattrapage (`type: "match"`, `"training"`,
    `"season-end"` — c'est ce que le navigateur affiche dans l'écran
    "Pendant votre absence").
  - `GET /api/save` — même rattrapage, mais renvoie la sauvegarde COMPLÈTE
    (forme `store.serialize`) : c'est ce dont le navigateur a besoin pour
    reconstruire de vrais objets `Team`/`League` et continuer à utiliser
    tout son code d'affichage existant. C'est l'appel principal du
    navigateur au chargement (voir `loadMyTeam()`).
  - `POST /api/save-raw` — remplace INTÉGRALEMENT la sauvegarde par celle
    envoyée par le client (`saveMyTeam()`, fire-and-forget, à chaque
    changement d'état côté navigateur). Volontairement "brut" (aucune
    validation métier, contrairement aux routes `/api/lineup` etc.) : reste
    le mécanisme de persistance pour tout ce qui n'a pas (encore) sa propre
    route d'action validée (staff, achats divers...) EN MODE SOLO
    uniquement — `moteurbasket3.html` appelle désormais bien les routes
    d'actions validées ci-dessus pour feuille de match/tactiques/
    entraînement/marché (voir plus bas). En mode multi-manager (jeton
    `X-TipIn-Token` présent), cette route est purement et simplement
    refusée (410) — voir `resolvePlayerContext`/la vérification dédiée plus
    bas dans ce fichier : personne ne peut écraser l'état de tout le monde
    d'un coup dans une ligue partagée, seules les routes d'actions ci-dessous
    peuvent y agir, chacune sur SA SEULE équipe.
  - `POST /api/new-career` — réinitialise la carrière (effectif de
    débutants, Division I, calendrier qui redémarre à `now`).
  - `POST /api/simulate-tick` — force un rattrapage immédiat (utile pour
    tester/démontrer sans attendre le vrai temps réel).
  - `POST /api/lineup`, `/api/tactics`, `/api/training`, `/api/market/list`,
    `/api/market/bid`, `/api/market/coach-bid` — voir `actions.js`
    ci-dessus : désormais appelées par le navigateur (2026-09, voir
    syncLineupToServer/syncTacticsToServer/syncTrainingToServer/
    syncMarketListToServer/syncMarketBidToServer/syncCoachBidToServer dans
    `moteurbasket3.html`), fire-and-forget EN PLUS de la mutation locale déjà
    appliquée par le code appelant, exactement comme
    syncArenaUpgradeToServer/syncTicketPriceToServer/
    syncFanShopUpgradeToServer pour Salle/billets/boutique — sans effet en
    mode solo (`managerToken` nul, comportement inchangé). Feuille de
    match/tactiques ne synchronisent QUE les ordres EN DIRECT de l'équipe du
    joueur (jamais un plan préparé à l'avance pour une autre journée via
    `stagePlanForRound`/`plannedTactics` — voir `/api/plan` juste en dessous
    pour CE cas-là).
  - `POST /api/plan` — préparation à l'avance d'une journée FUTURE (retour
    utilisateur, 2026-09 : "pratique de pouvoir préparer sa semaine en
    avance") : valide `{round, patch}` avec les MÊMES règles que
    `/api/tactics`/`/api/lineup` (voir les validateurs partagés dans
    `actions.js`), puis applique via `Team.stagePlanForRound` — appelée par
    `syncPlanToServer` dans `moteurbasket3.html`, depuis le panneau Ordres
    d'une journée qui n'est PAS le tout prochain match. Corrige un trou de
    persistance réel : avant cette route, préparer une journée future en
    ligue partagée ne survivait qu'en local (silencieusement perdu au
    rechargement, jamais vu par l'auto-simulation du serveur).
  - `POST /api/staff/fire-trainer` — congédie l'entraîneur du manager
    appelant ET le reliste aussitôt sur le marché des entraîneurs, à un prix
    de départ réduit de 30% (retour utilisateur, 2026-09 : "dès qu'un staff
    est viré parce que devenu trop cher, il faut qu'il retourne sur le
    marché avec un salaire baissé de 30%") — voir `League.fireTeamTrainer`
    dans `engine.js` (règle de gameplay partagée solo/multi-manager, pas
    seulement côté serveur), appelée par `syncFireTrainerToServer` dans
    `moteurbasket3.html`.

## État actuel (côté navigateur)

Depuis la tâche #21 ("préparation à l'avance"), `moteurbasket3.html` ne
propose plus aucune action "immédiate" liée au calendrier — plus de bouton
"Verrouiller & simuler", "Valider la semaine" ou "Déclarer forfait" : le
manager RÈGLE les choses à l'avance (feuille de match, tactiques,
entraînement de la semaine) et le serveur les applique tout seul au moment
programmé.

- **Match du club du joueur** : à l'heure programmée, sa diffusion démarre
  en direct (voir `liveMatch.js`) — le navigateur, en se connectant à
  n'importe quel moment de la fenêtre de 1h30, reprend exactement où en est
  la diffusion (jamais depuis le début, jamais accéléré). Absent pendant
  TOUTE la fenêtre de diffusion : le match se joue en coulisses comme
  n'importe quelle autre rencontre (forfait automatique compris, si
  l'effectif ne permet plus d'aligner une feuille de match valide). En plus
  du fil de texte événement par événement, l'écran de direct affiche une
  **vue 2D du terrain façon "shot chart"** (retour utilisateur, 2026-09,
  inspiré du "Action-par-action" de BuzzerBeater, repris "en plus moderne"
  après un premier essai fond vert puis fond parquet, tous deux rejetés) :
  un vrai terrain dessiné en SVG sur fond sombre dégradé reprenant les
  teintes déjà utilisées ailleurs dans l'appli (raquette, cercle de lancers
  francs, ligne à 3 points, rond central — voir le
  `<svg viewBox="0 0 1000 440">` dans `moteurbasket3.html`), sur lequel
  s'accumule un symbole par tir tenté pendant tout le match : un rond pour un
  tir réussi, une croix pour un tir raté, dans la bonne zone (intérieur/
  mi-distance/3 points) avec une part de hasard sur la position exacte (le
  moteur ne modélise pas de coordonnées de tir réelles). Aucun nom d'équipe
  superposé sur le terrain (retiré à la demande de l'utilisateur — le
  tableau de bord au-dessus suffit) ; en revanche, survoler un symbole à la
  souris affiche une infobulle avec le nom du joueur qui a pris le tir
  (retour utilisateur : "sur buzzerbeater, quand on passe la souris sur la
  croix ou rond, on voit qui a pris le tir" — voir `#liveCourtTooltip`/
  `addCourtMark` dans `moteurbasket3.html`). Ça repose sur des champs
  structurés ajoutés aux événements du moteur (`type`/`team`/`zone`/`made`/
  `shooter`, voir `engine.js:MatchEngine.log/teamKey`) EN PLUS du texte
  narratif existant — `schedulePlayback` (ci-dessus) les propage tel quel
  (`{...ev, airAt}`), sans rien à changer côté diffusion. Convention fixe et
  documentée dans `moteurbasket3.html` : l'équipe A (toujours le club du
  joueur sur cet écran, quel que soit domicile/extérieur, ET toujours
  affichée à gauche du tableau de bord) attaque toujours le panier de
  gauche — même côté que son score (retour utilisateur : "il faudrait que
  les shoots soient du même côté que le score [...], moins compliqué à
  comprendre comme ça") —, pas de changement de camp à la mi-temps — une
  simplification assumée pour cette v1, qui ne modélise que les tirs/
  rebonds (pas les 10 joueurs sur le terrain, le moteur n'ayant aucune
  donnée de position hors tir). Voir
  `engine_live_events_test.js`/`live_court_view_test.js` (racine du projet).
  Toujours sur cet écran, un chrono de match qui défile en continu et un
  chrono des 24 secondes (retour utilisateur : "le chrono ne défile pas en
  fait" + "ce serait bien si on voyait les secondes s'égrener ainsi que le
  chrono des 24 sec") : le moteur ne notifie qu'à la fin de chaque
  possession (un événement = un instant précis, `airAt`/`clock`), donc rien
  n'apparaissait à l'écran entre deux événements (souvent 15-30s d'écart en
  temps réel). Plutôt que de changer le moteur pour modéliser un temps
  continu, `updateLiveClockTick` (client, `moteurbasket3.html`) INTERPOLE le
  chrono affiché entre le dernier événement diffusé et le suivant (tous deux
  déjà connus à l'avance), à intervalle régulier (`setInterval`, 200 ms), et
  en déduit un chrono des 24 secondes qui redémarre à chaque nouvel
  événement (secondes de jeu "consommées" depuis le dernier événement,
  plafonné à 24) — masqué pendant les pauses (mi-temps/entre quarts-temps/
  temps morts), où le jeu est arrêté. Purement un habillage visuel côté
  client, sans impact sur le résultat déjà déterminé au coup d'envoi ni
  aucun nouveau champ côté moteur/serveur.
- **Au retour après une absence** (`GET /api/state`) : un écran "Pendant
  votre absence" récapitule tout ce qui a été rattrapé (matchs joués,
  entraînement hebdomadaire, éventuelle fin de saison) avant de proposer
  l'écran normal (préparation du prochain match, ou fin de saison).
- **Persistance** : sauvegarde complète envoyée par le navigateur à chaque
  changement (`POST /api/save-raw`, fire-and-forget) — pas encore les
  routes d'actions validées d'`actions.js` (voir ci-dessus).
- **Rafraîchissement automatique de la page** (tâche #22) : le compte à
  rebours jusqu'au coup d'envoi se met à jour tout seul côté client, une
  fois par seconde, et bascule de lui-même sur le direct dès l'heure
  atteinte (sans requête réseau tant que rien n'est dû) ; un
  `visibilitychange` couvre en plus le cas d'un onglet laissé en
  arrière-plan (navigateur minimisé, changement d'onglet) dont les
  `setInterval`/`setTimeout` ont été throttlés par le navigateur pendant ce
  temps : au retour sur l'onglet, l'état est revérifié immédiatement plutôt
  que d'attendre le réveil du timer throttlé — voir
  `visibility_refresh_test.js` (racine du projet). Le manager n'a donc
  jamais besoin de recharger la page à la main pour voir un événement dû.

## Persistance en ligne (Render + Upstash Redis)

Par défaut (aucune variable d'environnement particulière définie), la
persistance reste EXACTEMENT celle décrite plus haut (`store.js`) : un
fichier JSON local par sauvegarde (`server/data/league.json` pour la
carrière solo, `server/data/multi-league.json` pour la ligue multi-manager),
écrit atomiquement (fichier temporaire puis renommage). C'est ce que fait
tourner le serveur en local, et c'est aussi ce qu'exerce toute la suite de
tests — aucun changement de comportement pour ces deux usages.

Ce mode fichier local ne convient en revanche PAS à un hébergement sur le
plan gratuit de Render : son système de fichiers est ÉPHÉMÈRE — tout ce qui
a été écrit sur disque est perdu à chaque redéploiement, redémarrage, ou
simple réveil du service après ses 15 minutes d'inactivité (le service
s'endort automatiquement sur ce plan). Pour continuer à tourner sur ce plan
sans perdre la vraie saison de test à 10 managers à chaque réveil, `store.js`
sait aussi écrire sur **Upstash Redis** (base clé-valeur hébergée, plan
gratuit, TOUJOURS persistante, jointe en HTTPS pur — aucune dépendance npm,
juste le `fetch` global de Node) :

- **`UPSTASH_REDIS_REST_URL`** — l'URL REST de la base Upstash (tableau de
  bord Upstash, onglet "REST API") ;
- **`UPSTASH_REDIS_REST_TOKEN`** — le jeton d'accès associé (même onglet).

Bascule PUREMENT par ces deux variables d'environnement — jamais par un
réglage explicite dans le code : dès que les DEUX sont définies,
`load`/`save`/`loadOrCreate`/`loadMultiLeague`/`saveMultiLeague` lisent et
écrivent sur Redis (deux clés fixes, `pullup:league` et
`pullup:multi-league`) au lieu du disque. **Si l'une des deux (ou les deux)
est absente — le cas par défaut, celui de tout test et de tout lancement en
local sans rien changer — le comportement fichier local décrit plus haut
s'applique de façon rigoureusement identique à avant, au bit près.** Un
échec de lecture/écriture Redis (réseau, base indisponible) n'interrompt
jamais le serveur : il est journalisé (`console.warn`) et traité comme une
sauvegarde absente/illisible (jamais comme un feu vert pour écraser une
sauvegarde existante par une carrière neuve).

### Déploiement sur Render

1. Créer une base Upstash Redis gratuite (upstash.com), récupérer son URL et
   son jeton REST (onglet "REST API" du tableau de bord).
2. Sur Render, créer un "Web Service" pointé vers ce dépôt :
   - **Répertoire racine (root directory)** : la racine du dépôt (celle qui
     contient `package.json` et le dossier `server/`) ;
   - **Commande de démarrage (start command)** : `node server/index.js` ;
   - **Variables d'environnement** à définir dans les réglages Render :
     `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` (valeurs
     récupérées à l'étape 1), et éventuellement `BASKET_ADMIN_TOKEN` (voir
     plus bas, "ADMIN") ;
   - **`PORT`** : à NE PAS définir soi-même — Render la fournit
     automatiquement à chaque déploiement, et `server/index.js` la lit déjà
     (`DEFAULT_PORT = process.env.PORT || 4000`, voir plus haut dans ce
     fichier) : aucun changement de code nécessaire pour que le serveur
     écoute sur le bon port en ligne.
3. Déployer : Render exécute `npm install` (aucune dépendance de production
   à ce jour — `jsdom` n'est qu'une dépendance de test) puis
   `node server/index.js`. Le plan gratuit endort le service après 15
   minutes d'inactivité et le réveille à la requête suivante (délai de
   démarrage à froid) — la sauvegarde, elle, survit grâce à Upstash Redis
   (voir ci-dessus), contrairement à un fichier local qui serait perdu à ce
   réveil.

## Lancer le serveur

```bash
cd server
node index.js
# Serveur basket (calendrier réel) démarré sur http://localhost:4000
# Sauvegarde : server/data/league.json
```

Puis ouvrir **http://localhost:4000/** dans un navigateur (la page
`moteurbasket3.html` elle-même) — ou, pour inspecter l'état brut :

```bash
curl http://localhost:4000/api/state
```

Chaque appel à `/api/state` (ou `/api/save`, ou `/api/simulate-tick`)
rattrape tout seul ce qui est dû depuis le dernier appel — pas besoin d'un
process qui tourne en permanence pour que le calendrier avance : le
rattrapage se fait "à l'accès", comme le marché des transferts côté
navigateur.

Pour repartir d'une sauvegarde neuve sans supprimer le fichier à la main :
`curl -X POST http://localhost:4000/api/new-career`.

## Tests

Côté serveur (logique pure, sans navigateur) :

```bash
cd server
node calendar_test.js
node liveMatch_test.js
node autoSim_test.js
node store_test.js
node upstash_store_test.js
node index_test.js
node actions_test.js
node fast_calendar_env_test.js
```

Côté navigateur (parcours UI complets, dans un vrai petit serveur HTTP local
+ JSDOM — voir `../test_helpers.js`), depuis la racine du projet :

```bash
node bonus_test.js
node calendar_test.js
node cpu_training_test.js
node deficit_test.js
node devtools_test.js
node end_to_end_test.js
node engine_live_events_test.js
node fast_calendar_test.js
node forfeit_test.js
node full_run_test.js
node humeur_test.js
node lineup_test.js
node live_court_view_test.js
node persistence_test.js
node potential_tier_test.js
node promotion_test.js
node salary_test.js
node synergy_training_test.js
node tabs_test.js
node training_progression_test.js
node transfer_market_test.js
node tv_rights_test.js
node visibility_refresh_test.js
```

(`../calendar_test.js`, à la racine, est distinct de `calendar_test.js`
ci-dessus, côté serveur — même nom, portée différente : l'un teste
l'intégration UI/calendrier réel de bout en bout, l'autre les calculs purs
d'horaires.) La plupart de ces tests utilisent
`fastForwardCalendar(savePath, N)` (voir `../test_helpers.js`) pour simuler
une longue absence — N journées déjà entièrement écoulées — plutôt que de
cliquer un bouton "instantané" désormais disparu : une seule requête au
serveur rattrape alors tout d'un coup, exactement comme un vrai retour après
absence.

`end_to_end_test.js` (tâche #23) est le seul à enchaîner TOUT le scénario
réel dans un seul parcours, plutôt que de tester un mécanisme isolé : nouvelle
carrière, réglages à l'avance (tactiques/entraînement) sans action
immédiate, compte à rebours qui bascule tout seul sur le direct au coup
d'envoi, reconnexion en cours de diffusion (reprise sans resimulation),
absence couvrant toute la diffusion (résultat fidèle à celui déjà déterminé
par le serveur), rattrapage automatique du reste de la saison, fin de saison
(play-offs/relégation/prime) sans action du joueur, nouvelle saison, puis
persistance complète au rechargement. Il combine `fastForwardCalendar` (pour
sauter des journées entières) et `patchDateNow` (voir `../test_helpers.js`)
pour contrôler le temps réel côté navigateur ET côté serveur (via `nowFn`,
voir `startTestServer`) de concert, notamment pour tester la reconnexion en
plein milieu d'une diffusion. Comme `promotion_test.js`, ses assertions de
fin de saison restent volontairement robustes à un tirage aléatoire
(classement, champion, relégation) puisqu'aucun résultat n'y est forcé.

## Prochaines étapes (pas encore faites)

1. Un vrai match de coupe/amical (3e match de la semaine réelle) — la
   compétition de coupe n'existe pas encore côté moteur.

(Hébergement en ligne — Render + Upstash Redis pour une persistance qui
survit au système de fichiers éphémère du plan gratuit — est désormais FAIT,
voir "Persistance en ligne (Render + Upstash Redis)" plus haut.
Multijoueur à 10 — token/lien privé par équipe, `POST /api/save-raw`
restreint en mode partagé (410), et le navigateur enfin rebranché sur les
routes d'actions validées d'`actions.js` pour feuille de match/tactiques/
entraînement/marché — est désormais FAIT, voir plus haut dans ce fichier et
`moteurbasket3.html`.)
