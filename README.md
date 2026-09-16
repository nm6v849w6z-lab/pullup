# Basket Manager — jeu de gestion de basket-ball dans le navigateur

Un jeu de gestion façon BuzzerBeater : vous gérez un club de basket
(effectif, tactiques, entraînement, marché des transferts, finances) au fil
d'un vrai calendrier réel — le championnat avance tout seul, semaine après
semaine, y compris quand vous n'êtes pas connecté.

## Démarrage rapide

```bash
cd server
node index.js
```

Puis ouvrez **http://localhost:4000/** dans un navigateur. C'est tout : le
serveur sert la page (`moteurbasket3.html`) et son API sur la même adresse,
et crée automatiquement une sauvegarde neuve (`server/data/league.json`) au
premier lancement.

Aucune installation de dépendance n'est nécessaire pour *jouer* — seul
Node.js (v18+, pour `fetch` natif) est requis. Seuls les tests des parcours
UI (voir plus bas) ont besoin de JSDOM ; si `node_modules/` n'est pas déjà
présent, `npm install` la récupère (seule dépendance : `jsdom`, voir
`package.json`).

Pour repartir d'une carrière neuve sans supprimer le fichier de sauvegarde à
la main :

```bash
curl -X POST http://localhost:4000/api/new-career
```

## Comment fonctionne le jeu (en bref)

Contrairement à un prototype "au clic" (bouton "Verrouiller & simuler",
"Valider la semaine"...), tout se joue en préparant les choses **à
l'avance** : feuille de match, tactiques, entraînement de la semaine. Le
serveur applique ensuite tout cela tout seul, au moment programmé :

- **2 matchs de championnat par semaine réelle**, espacés (pas dos à dos) ;
  le match de votre club est diffusé "en direct" à l'heure programmée —
  connectez-vous à ce moment-là pour le suivre événement par événement (une
  vraie mi-temps, des pauses de quart-temps, des temps morts), avec une
  **vue 2D du terrain** façon "shot chart" (un vrai terrain dessiné —
  raquette, ligne à 3 points, rond central — sur fond sombre façon
  BuzzerBeater, avec un rond pour chaque tir réussi et une croix pour chaque
  tir raté, à l'emplacement approximatif du tir ; survolez un symbole pour
  voir qui a pris le tir), un chrono de match qui défile en continu (pas
  seulement à chaque événement) et un chrono des 24 secondes qui redémarre à
  chaque nouvelle possession, en plus du fil de texte, ou plus tard pour
  voir directement le résultat. Le résultat est déterminé une seule
  fois, dès le coup d'envoi : se reconnecter en cours de diffusion reprend
  exactement là où elle en est (jamais depuis le début, jamais accéléré) ;
  être absent pendant toute la diffusion ne change jamais le résultat déjà
  fixé.
- **Entraînement hebdomadaire automatique**, une fois par semaine réelle,
  selon le poste et la compétence choisis à l'avance.
- **Rattrapage automatique** en cas d'absence, même longue (plusieurs
  semaines ou mois) : à la reconnexion, un écran "Pendant votre absence"
  récapitule tout ce qui a été joué et décidé entre-temps, avant de proposer
  l'écran normal (préparation du prochain match, ou fin de saison si la
  saison régulière s'est terminée pendant l'absence — play-offs, éventuelle
  relégation, prime annoncée, tout est calculé automatiquement).
- **Rafraîchissement automatique de la page** : pas besoin de recharger à la
  main, même après avoir laissé l'onglet en arrière-plan un moment.

Détails d'implémentation (calendrier, diffusion en direct, rattrapage,
persistance, routes de l'API) : voir [`server/README.md`](server/README.md).

**Envie de tester plus vite qu'en ~9 semaines réelles ?** Démarrez le
serveur avec `BASKET_FAST_CALENDAR=1 node server/index.js` : un match de
championnat se simule toutes les 3h (au lieu d'être espacés sur plusieurs
jours), et tous les deux matchs l'entraînement + la semaine économique se
mettent à jour — une saison complète de 18 journées se joue alors en ~54h
(2-3 jours) au lieu de ~9 semaines. Ne s'applique qu'aux nouvelles
carrières/saisons démarrées sous ce réglage — voir "Mode accéléré" dans
`server/README.md` pour le détail.

**Portée volontairement limitée à cette étape** (décidé avec l'utilisateur) :
une seule ligue = un manager humain + 9 adversaires CPU (pas encore le
multijoueur) ; hébergé nulle part, tourne en local ; pas encore de vrai
match de coupe/amical. Voir "Prochaines étapes" dans `server/README.md`.

## Lancer les tests

Le projet n'a pas de framework de test ni de script `npm test` : chaque
fichier `*_test.js` est un script autonome (`assert`/`throw` maison,
sortie console) qui s'exécute avec `node <fichier>.js` et se termine en
erreur (code de sortie non nul) si une vérification échoue.

Deux familles de tests :

- **Côté serveur** (logique pure, sans navigateur — calendrier, diffusion en
  direct, rattrapage, persistance, routes validées) : à lancer depuis
  `server/`.
- **Côté navigateur** (parcours UI complets : un vrai petit serveur HTTP
  local + une page JSDOM qui se comporte comme un vrai navigateur, voir
  `test_helpers.js`) : à lancer depuis la racine du projet.

```bash
# --- côté serveur ---
cd server
node calendar_test.js
node liveMatch_test.js
node autoSim_test.js
node store_test.js
node index_test.js
node actions_test.js
node fast_calendar_env_test.js
cd ..

# --- côté navigateur (parcours UI) ---
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

Pour lancer toute la suite d'un coup et s'arrêter au premier échec :

```bash
for f in *_test.js; do
  echo "=== $f ==="
  node "$f" || { echo "❌ ÉCHEC : $f"; break; }
done
```

Notes utiles pour lire/déboguer ces tests :

- La plupart utilisent `fastForwardCalendar(savePath, N)` (voir
  `test_helpers.js`) pour simuler une longue absence — N journées déjà
  entièrement écoulées, y compris leur fenêtre de diffusion — plutôt que de
  cliquer un bouton "instantané" (qui n'existe plus dans l'interface). Une
  seule requête au serveur suffit ensuite à tout rattraper d'un coup, comme
  un vrai retour après absence.
- `end_to_end_test.js` est le seul à enchaîner tout le scénario réel dans un
  seul parcours (nouvelle carrière → réglages à l'avance → compte à rebours
  → diffusion en direct avec reconnexion en cours de match → absence totale
  → rattrapage du reste de la saison → fin de saison → nouvelle saison →
  persistance complète) plutôt que de tester un mécanisme isolé — voir le
  détail dans `server/README.md`.
- `fast_calendar_test.js` (racine) et `server/fast_calendar_env_test.js`
  vérifient le mode accéléré (`BASKET_FAST_CALENDAR=1`, voir plus haut) : le
  premier un parcours UI complet (nouvelle carrière au bon rythme, compte à
  rebours navigateur, saison complète rattrapée, héritage entre saisons), le
  second uniquement le branchement de la variable d'environnement elle-même
  au démarrage du serveur (nécessite un sous-process, voir son commentaire).
- `engine_live_events_test.js` et `live_court_view_test.js` couvrent la vue
  2D du terrain affichée pendant le direct — un "shot chart" cumulatif
  façon BuzzerBeater, un symbole rond/croix par tir tenté, infobulle au
  survol avec le nom du tireur (voir plus haut) : le premier les champs
  structurés ajoutés aux événements du moteur (`type`/`team`/`zone`/`made`/
  `shooter`, sans navigateur — même principe que `server/calendar_test.js`),
  le second que les symboles affichés correspondent bien, dans l'ordre et
  avec la bonne forme/couleur/côté, à tous les tirs/rebonds déjà diffusés à
  la reconnexion, ainsi que le comportement de l'infobulle au survol (même
  principe que `end_to_end_test.js`, partie reconnexion en cours de
  diffusion).
- Certains résultats dépendent de tirages aléatoires (simulation de match,
  play-offs) : ces tests sont écrits pour rester corrects quel que soit le
  tirage (comme `promotion_test.js`), sauf `bonus_test.js` qui force
  volontairement le club du joueur comme champion pour pouvoir vérifier la
  prime annoncée (voir le commentaire dans ce fichier).
- `../calendar_test.js` (racine) et `server/calendar_test.js` portent le
  même nom mais testent des choses différentes : l'un l'intégration
  UI/calendrier réel de bout en bout, l'autre les calculs purs d'horaires
  côté serveur.

## Structure du projet

```
moteurbasket3.html   Page unique du jeu (HTML/CSS/JS), servie par le serveur
engine.js            Moteur de simulation (règles du jeu, dupliqué en partie
                      dans moteurbasket3.html — voir commentaires dans le
                      fichier pour le mécanisme de synchronisation)
simulate.js           Utilitaires de simulation en ligne de commande
server/               Serveur HTTP (calendrier réel, diffusion en direct,
                      rattrapage automatique, persistance) — voir
                      server/README.md pour le détail
*_test.js              Tests des parcours UI (racine du projet)
server/*_test.js       Tests de la logique serveur
```
