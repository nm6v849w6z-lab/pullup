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

1. **[Prêt à committer] Troncature des noms d'équipe longs (classements de
   stats)** — retour utilisateur (2026-09-24, capture) : "pour les longs
   nom d'équipe il faut affiche les 10 premières lettres quand meme, ça ne
   ressemble à rien là" — "Gotham Knights" (14 caractères, forte proportion
   de majuscules) passait au travers de l'ancien seuil de troncature
   (maxChars=14, comparaison en NOMBRE de caractères) tout en débordant
   quand même de la colonne fixe 92px en pixels réels, redéclenchant le bug
   d'origine (bouton de nom d'équipe entièrement effacé, "(…)" tout seul).
   Statut : CODE FAIT + TESTÉ (sandbox), prêt à livrer sur le Mac.
   - `truncateTeamNameForColumn` : seuil abaissé de 14 à 11 (10 lettres +
     "…") — marge de sécurité plus large plutôt que retenté au pixel près.
   - Filet de sécurité CSS supplémentaire (découvert en testant le pire cas
     pathologique, un nom fait uniquement de "W" : même tronqué à 10
     lettres, ça peut encore déborder des 92px) : le bouton `.team-link`
     reçoit sa PROPRE ellipsis CSS (au lieu de compter sur celle du
     parent), et `text-overflow:ellipsis` est retiré de
     `.stats-leader-team`/`.stats-leader-first-team` (qui gardent juste
     `overflow:hidden`) — sinon le bouton redevient une boîte atomique du
     point de vue de l'ellipsis du PARENT une fois `display:inline-block`,
     et se refait effacer entièrement (vérifié avec Playwright : reproduit
     exactement le bug).
   - Fichiers touchés : `moteurbasket3.html` (fonction + CSS),
     `league_stats_test.js` (nouvelles assertions : troncature JS +
     garde-fou texte brut sur le CSS, voir Partie 4).
   - Tests : suite complète des 94 tests relancée (individuellement, pas en
     parallèle) — tout passe. Vérification visuelle pixel par pixel faite
     hors suite avec Playwright (bouton toujours visible, y compris pour le
     nom pathologique "WWWWWWWWWWWW").
   - Reste à faire : livrer sur le Mac (device_commit_files), donner les
     commandes git à l'utilisateur (jamais de push par Claude).

2. **[Prêt à committer] Couleurs du radar (profil joueur) pas assez
   vives** — retour utilisateur (2026-09-24, capture "PROFIL (VUE
   D'ENSEMBLE)") : "les zones rouge et orange sur le profil ne sont tjrs
   pas vives". Déjà "corrigé" deux fois avant sans satisfaire pleinement
   l'utilisateur (commits `91ea530` "Corrige couleurs radar" et `06d282d`
   "Radar plus vif") — ces deux tentatives n'avaient éclairci que les
   COULEURS elles-mêmes, sans jamais toucher à la vraie cause.
   Statut : CODE FAIT + TESTÉ (sandbox), prêt à livrer sur le Mac.
   - Vraie cause enfin trouvée : `radarChartSvg` empilait 4 DISQUES PLEINS
     (du plus grand au plus petit) à fill-opacity 0.5 chacun — la bande
     rouge (la plus petite, au centre) se composait donc par-dessus le
     vert PUIS le blanc PUIS l'orange déjà empilés en dessous, ce qui la
     diluait en orange/saumon terne (mesuré au pixel avec Playwright :
     rgb(226,111,63) au lieu du rouge #ff3b30 attendu).
   - Corrigé en dessinant chaque bande comme un VRAI ANNEAU indépendant
     (path SVG à deux sous-tracés + `fill-rule="evenodd"`, voir le grand
     commentaire de `radarChartSvg`) au lieu d'un disque plein empilé :
     chaque bande n'est composée qu'UNE SEULE FOIS avec le fond sombre,
     plus de dilution en cascade. Opacité remontée de 0.5 à 0.65 au passage
     (retour utilisateur "pas assez vives"), sans revenir à un aplat plein
     jugé "trop agressif" à l'origine.
   - Vérifié visuellement sur la vraie fiche joueur (Playwright) : rouge et
     orange nettement vifs et distincts maintenant.
   - Fichiers touchés : `moteurbasket3.html` (`radarChartSvg` + commentaire
     `:root`), nouveau `radar_chart_colors_test.js` (structure du SVG :
     vrais anneaux creux vs disques pleins, couleurs, opacité, seuils
     `radarTierColor`).
   - Tests : suite complète (95 fichiers désormais) relancée
     individuellement — tout passe.
   - Reste à faire : livrer sur le Mac (device_commit_files), donner les
     commandes git à l'utilisateur.

3. **Box score en direct : ligne total + tous les joueurs + minutes
   jouées** — retour utilisateur : actuellement `liveBoxScore` ne crée une
   ligne que pour un joueur ayant déjà généré une statistique (lazy), pas
   de colonne MIN (volontairement absente à l'origine, voir le commentaire
   existant dans `moteurbasket3.html`), pas de ligne total. En cours —
   investigation démarrée (`resetLiveBoxScore`/`liveBoxScore`/flux
   d'événements `type: "substitution"`).
   Pistes : pré-remplir toutes les lignes à `resetLiveBoxScore()` à partir
   de la feuille de match (titulaires + remplaçants désignés) plutôt que
   lazy ; pour les minutes, suivre les événements de substitution déjà
   présents dans le flux (`type: "substitution"`) + les titulaires de
   départ pour calculer le temps réellement passé sur le terrain par
   joueur.

4. **Feuille de match : score par quart-temps** — retour Discord (Ariane,
   relayé par l'utilisateur) : afficher le score par quart-temps sur la
   boxscore du match. `quarterScores` existe déjà côté moteur
   (`{A:[...4], B:[...4]}`, voir engine.js `simulate()`) — pas encore
   affiché sur la feuille de stats. Pas commencé.

5. **Augmenter le pool de noms de famille générés** — retour Discord
   (Ariane, relayé par l'utilisateur) : trop de doublons de noms de
   famille dans un même effectif (ex. "3 Fontaine, 2 Novak, 2 Petit, c'est
   la galère pour m'y retrouver"). Élargir la liste de noms de famille
   utilisée à la génération des joueurs. Pas commencé.

6. **Pouvoir regarder le live d'une autre équipe depuis son calendrier** —
   retour utilisateur : actuellement l'écran Live ne montre que le match du
   club du joueur (`league.liveMatch`, calculé pour son propre club). Il
   faudrait un accès au direct d'un match d'une AUTRE équipe depuis la page
   Calendrier de cette équipe (fiche équipe adverse). Pas commencé — à
   creuser : le direct est aujourd'hui pré-calculé et rejoué avec des délais
   réels UNIQUEMENT pour le club du joueur (voir `computeLiveMatch`/
   `schedulePlayback` côté serveur) ; regarder le match d'une autre équipe
   nécessitera probablement la même mécanique mais déclenchée/adressée
   différemment (par équipe/journée plutôt qu'implicite au club du joueur).

7. **[Prêt à committer] Fiche joueur : bouton "Comparer" déplacé + flèches
   de navigation entre joueurs de l'effectif** — retour utilisateur
   (2026-09-24, capture annotée d'un cercle rouge en haut à droite de la
   fiche joueur, zone vide à droite de "Modifier vos ordres") : "mets le
   bouton comparer dans la zone gribouillée en rouge et juste à côté de ce
   bouton, mets des flèches de navigation pour passer d'un joueur à l'autre
   de son effectif".
   Statut : CODE FAIT + TESTÉ (sandbox), prêt à livrer sur le Mac.
   - Bouton "Comparer" déplacé du bas de la fiche (à côté de "← Retour")
     vers le topbar GLOBAL, dans la zone vide à côté de "Modifier vos
     ordres" (`#topbarPlayerNav`, voir son grand commentaire CSS) — cachée
     par défaut, révélée uniquement quand la fiche joueur est la page
     active (un seul point de bascule dans `showPage()`, attrape tous les
     chemins d'entrée/sortie).
   - Flèches précédent/suivant ajoutées juste à côté (`playerDetailRosterOrder`/
     `navigatePlayerDetail`) : parcourent l'effectif de l'équipe actuellement
     affichée, dans le même ordre par défaut que l'onglet Effectif (poste,
     puis note globale décroissante) — stable même si l'Effectif a été
     retrié entre-temps. Désactivées en bout de liste (pas de bouclage).
   - Fichiers touchés : `moteurbasket3.html` (topbar HTML/CSS, `showPage`,
     `renderPlayerDetail`), `player_compare_test.js` (id du bouton mis à
     jour : `topbarComparePlayerBtn`), nouveau
     `player_detail_topbar_nav_test.js` (visibilité liée à la page active,
     flèches, ordre de navigation).
   - Tests : suite complète relancée individuellement — tout passe.
     Vérifié visuellement (Playwright) : placement conforme à la capture
     annotée, comportement correct en largeur mobile (même repli que le
     reste du topbar).
   - Reste à faire : livrer sur le Mac, donner les commandes git.

8. **[Prêt à committer] Fiche joueur : bloc "Derniers matchs" → fenêtre
   "toute la saison" + réordonnancement des blocs** — retour utilisateur
   (2026-09-24, 2 captures) : "dans derniers matchs, ajoute un bouton pour
   voir plus que les 5 derniers matchs et voir toute la saison (ça pourrait
   ouvrir une fenetre qui se superpose et qui montre toutes les stats (pas
   juste point rebond passse) de la saison avec une moyenne en bas. enleve
   le match par match en bas" + "il faut remonter le bloc moyenne de la
   saison au dessus du bloc mise en vente".
   Statut : CODE FAIT + TESTÉ (sandbox), prêt à livrer sur le Mac.
   - Bouton "Voir toute la saison (N matchs)" ajouté dans la carte
     "Derniers matchs" (visible seulement si plus de 5 matchs joués, même
     principe que "Afficher tout" des classements de stats) — ouvre
     `showPlayerSeasonStatsModal` : une fenêtre superposée (même patron que
     `showMatchBoxscore`/`showClubIdentityModal` : `.upgrade-confirm-overlay`
     + boîte centrée) listant TOUS les matchs de la saison avec TOUTES les
     stats (15 colonnes : Journée/Adversaire/Résultat/Min/Pts/Reb/Pas/Int/
     Ctr/Perte/Faute/2pts/3pts/LF/Éval, pas seulement Pts/Reb/Pd comme
     l'aperçu), avec la ligne de moyennes en bas (réutilise
     `playerSeasonAveragesTableHtml`, la même fonction que celle du bloc
     "Moyennes de la saison" affiché par ailleurs — pas de second calcul
     qui pourrait diverger).
   - Tableau "Match par match" (historique complet, en bas de la fiche)
     entièrement RETIRÉ — remplacé par cette fenêtre.
   - Bloc "Moyennes de la saison" REMONTÉ au-dessus de "Mise en vente"
     (juste après la grille de cartes, avant elle désormais).
   - Fichiers touchés : `moteurbasket3.html` (`renderPlayerDetail` +
     nouvelles `playerSeasonAveragesTableHtml`/
     `playerFullSeasonMatchesTableHtml`/`showPlayerSeasonStatsModal` + CSS
     `.player-season-stats-box`), `player_detail_test.js` (assertions sur
     l'ancien tableau "Match par match" adaptées à la nouvelle structure +
     vérification de l'ordre), nouveau
     `player_season_stats_modal_test.js` (bouton, contenu complet de la
     fenêtre, fermeture, ordre garanti sur son propre effectif).
   - Tests : suite complète relancée individuellement — tout passe.
     Vérifié visuellement (Playwright, desktop + mobile) : fenêtre lisible,
     défilement horizontal correct sur petit écran (`table-scroll`).
   - Reste à faire : livrer sur le Mac, donner les commandes git.

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
  `attr_color_scheme_everywhere_test.js`, `full_run_test.js`.
- **`ordres_validate_without_edit_test.js` échoue de façon RÉPÉTABLE**
  (pas flaky, pas causé par les sessions récentes) : en ligue partagée,
  valider un plan sans édition préalable ne l'enregistre pas localement
  tout de suite (message du test : "BUG NON CORRIGÉ"). La partie "SOLO" du
  même test passe. Semble être un bug de longue date déjà connu du code
  (test-TODO existant). À creuser lors d'une session dédiée aux Ordres, pas
  traité jusqu'ici.
- **Lancer la suite de tests avec trop de jobs en parallèle cause de faux
  échecs** : `end_to_end_test.js`/`visibility_refresh_test.js` (minuteurs
  réels sous charge CPU) et `persistence_test.js`/`promotion_test.js`
  (`ECONNRESET`, trop de connexions HTTP locales simultanées). Tous passent
  individuellement — limiter à ~8 jobs en parallèle max, et relancer seul
  avant de conclure à une régression.
