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
