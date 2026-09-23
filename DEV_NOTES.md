# Suivi de développement — Pull Up / Hoop Manager

Ce fichier est tenu à jour en permanence par Claude à chaque session de travail,
pour ne plus jamais perdre le fil d'une modification en cours (retour
utilisateur, 2026-09-23 : "je veux que tu tiennes à jour un document où tu
notes les modifications à faire sur le code [...] pour éviter de tout oublier
comme tu l'as fait hier"). Il vit dans le dépôt (`pullup-real/DEV_NOTES.md`
côté sandbox, `~/Documents/PullUp/DEV_NOTES.md` côté Mac) et doit être commité
avec le code qu'il décrit, pas laissé de côté.

**Règle de tenue à jour** : avant de démarrer un nouveau chantier, ajouter une
entrée dans "En cours" ; à chaque étape significative (port terminé, tests
verts, déploiement Mac, commit), mettre cette entrée à jour ; une fois
committé et poussé par l'utilisateur, déplacer l'entrée vers "Historique" avec
la date et le hash de commit si connu. Ne jamais laisser "En cours" désynchro
de l'état réel du code.

---

## En cours

*(rien en ce moment — voir "⏰ À FAIRE CE SOIR" pour le commit/push en
attente, et Historique pour le détail de chaque lot terminé.)*

### ⏰ À FAIRE CE SOIR (2026-09-23, demande explicite : "on le fera ce soir")
- **Commit + push en attente** : QUINZE lots de travail sont terminés,
  testés, mais PAS ENCORE poussés sur le dépôt Git (aucun n'a été confirmé
  comme committé par l'utilisateur) :
  1. Lot "4 correctifs fiche joueur + tri effectif adverse" (couleurs
     pastilles/note globale, taille du texte "Mise en vente", gabarit large
     de la fiche joueur, tri de l'Effectif d'un adversaire) — voir
     l'entrée Historique du même nom plus bas.
  2. Lot "Retrait de Mental comme caractéristique indépendante" — voir
     l'entrée Historique juste en dessous. Fichiers modifiés : `engine.js`,
     `moteurbasket3.html`, `DEV_NOTES.md`, `thirteen_attrs_test.js`,
     `transfer_request_test.js`, `salary_test.js`.
  3. Lot "Test d'exclusion pour indiscipline + fautes antisportives" :
     nouveau fichier `disciplinary_ejection_test.js`, `engine.js`/
     `moteurbasket3.html` mis à jour (nouveau mécanisme de faute
     antisportive), `DEV_NOTES.md`.
  4. Lot "Fiche joueur : nom/Caractéristiques + Forme/Motivation + temps
     mort sans emoji" : `moteurbasket3.html`, `server/liveMatch.js`,
     `DEV_NOTES.md`.
  5. Lot "Box score en direct" : nouveau fichier `live_boxscore_test.js`,
     `engine.js`/`moteurbasket3.html` mis à jour (champs structurés +
     tableau live), `DEV_NOTES.md`.
  6. Lot "Dashboard Effectif (nombre de joueurs, pas la note) + colonne
     Potentiel sur les 2 sous-onglets de l'Effectif" (nouveau, voir
     l'entrée Historique correspondante) : `moteurbasket3.html`,
     `potential_tier_test.js` (réécrit — l'ancienne assertion attendait
     l'ABSENCE de cette colonne), `DEV_NOTES.md`.
  7. Lot "Jauges de connaissance tactique intégrées DANS le menu déroulant
     de l'aspect travaillé" (nouveau, voir l'entrée Historique
     correspondante) : `moteurbasket3.html`, nouveau fichier
     `trained_tactic_dropdown_test.js`, `DEV_NOTES.md`.
  8. Lot "Logo de l'équipe qui reçoit au centre du terrain (direct)"
     (nouveau, voir l'entrée Historique correspondante) :
     `moteurbasket3.html`, nouveau fichier `live_court_home_logo_test.js`,
     `DEV_NOTES.md`.
  9. Lot "Avatar du joueur MVP sur les box scores" (nouveau, voir l'entrée
     Historique correspondante) : `engine.js`, `moteurbasket3.html`, nouveau
     fichier `mvp_avatar_test.js`, `DEV_NOTES.md`.
  10. Lot "Nouveau schéma de couleur rouge/orange/blanc/vert, sans halo, sur
      la fiche joueur" (nouveau, voir l'entrée Historique correspondante) :
      `moteurbasket3.html`, `player_detail_test.js` (sélecteur mis à jour),
      nouveau fichier `pdp_color_scheme_test.js`, `DEV_NOTES.md`.
  11. Lot "Menus déroulants natifs en thème sombre (color-scheme: dark)"
      (nouveau, voir l'entrée Historique correspondante) :
      `moteurbasket3.html`, nouveau fichier `select_dark_dropdown_test.js`,
      `DEV_NOTES.md`.
  12. Lot "Extension du schéma rouge/orange/blanc/vert à l'Effectif, au
      Marché, à l'Humeur des supporters, à l'Alchimie et à la Connaissance
      tactique" (nouveau, voir l'entrée Historique correspondante) :
      `moteurbasket3.html`, `pdp_color_scheme_test.js` (une assertion
      obsolète retirée), nouveau fichier
      `attr_color_scheme_everywhere_test.js`, `DEV_NOTES.md`.
  13. Lot "Effectif : le tableau débordait horizontalement depuis l'ajout de
      la colonne Potentiel" (nouveau, voir l'entrée Historique
      correspondante) : `moteurbasket3.html` uniquement, `DEV_NOTES.md`.
  14. Lot "Comparateur de joueurs" (nouveau, voir l'entrée Historique
      correspondante) : `moteurbasket3.html`, `player_detail_test.js`
      (inchangé fonctionnellement, revérifié après extraction de
      `computePlayerVisibility`), nouveau fichier `player_compare_test.js`,
      `DEV_NOTES.md`. Mockup de validation (`mockup_player_compare.html`,
      jamais destiné à être commité, juste utilisé pour valider le rendu
      avant implémentation) laissé de côté de l'`add` ci-dessous.
  15. Lot "Mobile : le texte passait au-dessus de la barre du haut (balise
      viewport manquante)" (nouveau, voir l'entrée Historique
      correspondante) : `moteurbasket3.html` (balise `<meta name="viewport">`
      ajoutée + correctif du débordement horizontal du bouton "Donnez vos
      ordres" sous 560px qu'elle a révélé), nouveau fichier
      `mobile_viewport_meta_test.js`, `DEV_NOTES.md`.
- **Point de blocage : RÉSOLU** — la liaison avec le Mac de l'utilisateur
  s'est reconnectée en fin de session et les 21 fichiers des 15 lots
  ci-dessus (tous ceux de la commande `git add` plus bas, plus
  `server/liveMatch.js`) ont été déposés DIRECTEMENT dans
  `~/Documents/PullUp/` sur le Mac (plus besoin de les récupérer un par un
  depuis la conversation). Au passage :
  - le verrou Git périmé `.git/index.lock` (déjà repéré plus tôt dans la
    session, voir aussi le rappel technique tout en bas de ce fichier) a été
    nettoyé — confirmé en vérifiant qu'un `git add`/`git reset` de test
    fonctionne à nouveau normalement ;
  - `git status --short` sur le Mac confirme exactement les fichiers
    attendus : 9 modifiés (`DEV_NOTES.md`, `engine.js`, `moteurbasket3.html`,
    `player_detail_test.js`, `potential_tier_test.js`, `salary_test.js`,
    `server/liveMatch.js`, `thirteen_attrs_test.js`,
    `transfer_request_test.js`) + 10 nouveaux fichiers de test non suivis
    (`attr_color_scheme_everywhere_test.js`, `disciplinary_ejection_test.js`,
    `live_boxscore_test.js`, `live_court_home_logo_test.js`,
    `mobile_viewport_meta_test.js`, `mvp_avatar_test.js`,
    `pdp_color_scheme_test.js`, `player_compare_test.js`,
    `select_dark_dropdown_test.js`, `trained_tactic_dropdown_test.js`) —
    rien d'inattendu, rien manquant. (`effectif_caracteristiques_sort_test.js`
    et `team_detail_effectif_sort_test.js`, présents dans la commande `git
    add` ci-dessous pour mémoire du lot 1, sont déjà identiques au commit
    HEAD actuel — ce lot est déjà committé, `git add` sur ces deux-là sera un
    no-op inoffensif) ;
  - **suite de tests REJOUÉE EN ENTIER SUR LE MAC LUI-MÊME** (pas seulement
    dans le bac à sable), les 94 fichiers `*_test.js`, par lots de ~19 pour
    tenir dans le temps imparti par appel : 93 vert, seul
    `ordres_validate_without_edit_test.js` échoue — même bug pré-existant
    déjà documenté plus bas dans "À investiguer", sans lien avec cette
    session. Le repo Mac est donc dans un état identique (fonctionnellement)
    au bac à sable où tout a été développé et testé.
  Plus aucune étape de préparation nécessaire : les commandes ci-dessous
  peuvent être lancées telles quelles, ce soir, directement depuis le
  terminal Mac.
- **Commandes à donner ce soir** (les fichiers sont déjà en place dans
  `~/Documents/PullUp/`, rien à copier) :
  ```
  cd ~/Documents/PullUp
  git add engine.js moteurbasket3.html DEV_NOTES.md thirteen_attrs_test.js \
    transfer_request_test.js salary_test.js effectif_caracteristiques_sort_test.js \
    team_detail_effectif_sort_test.js player_detail_test.js \
    disciplinary_ejection_test.js live_boxscore_test.js server/liveMatch.js \
    potential_tier_test.js trained_tactic_dropdown_test.js \
    live_court_home_logo_test.js mvp_avatar_test.js pdp_color_scheme_test.js \
    select_dark_dropdown_test.js attr_color_scheme_everywhere_test.js \
    player_compare_test.js mobile_viewport_meta_test.js
  git commit -m "Retire 'Mental', ajoute fautes antisportives + box score en direct + retouches fiche joueur/temps mort, 4 correctifs fiche joueur/tri effectif adverse, dashboard/colonne Potentiel, jauges dans le menu déroulant tactique, logo au centre du terrain, avatar du MVP sur les box scores, palette rouge/orange/blanc/vert sans halo sur la fiche joueur, menus déroulants natifs en thème sombre, meme palette etendue a l'Effectif/Marché/Humeur/Alchimie/Connaissance tactique, correctif debordement horizontal Effectif (colonne Potentiel), comparateur de joueurs, balise viewport mobile manquante (texte qui passait au-dessus de la barre du haut) + correctif de debordement du bouton Ordres sous 560px"
  git push
  ```
  (les lots 13, 14 et 15 ne touchent que `moteurbasket3.html` + un nouveau
  fichier de test chacun (déjà dans la liste `git add` ci-dessus) — rien de
  plus à y ajouter. `mockup_player_compare.html`, utilisé uniquement pour
  valider le rendu du comparateur avant implémentation, n'est volontairement
  PAS dans cette liste : jetable, pas destiné à rester dans le dépôt.)
  (adapter la liste de fichiers si l'utilisateur préfère committer les lots
  séparément — voir chaque entrée Historique pour le détail exact des
  fichiers touchés par lot.)
- **Non encore fait** : néant à ce stade — la palette rouge/orange/blanc/
  vert sans halo, décidée via les mockups, est maintenant RÉELLEMENT
  appliquée à `moteurbasket3.html`, D'ABORD sur la fiche joueur (lot 10),
  PUIS étendue à l'Effectif, au Marché, à l'Humeur des supporters, à
  l'Alchimie et à la Connaissance tactique (lot 12) — il n'y a donc plus
  qu'UNE seule échelle de couleur dans tout le jeu. Le débordement
  horizontal de l'Effectif causé par la colonne Potentiel (lot 6) est
  également corrigé (lot 13), le nouveau comparateur de joueurs (lot 14)
  est implémenté et testé, et le texte qui passait au-dessus de la barre du
  haut sur mobile (lot 15, balise viewport manquante) est corrigé. Toutes
  les autres demandes reçues pendant cette session ont été traitées (voir
  Historique). Repartir de la conversation en cours pour toute nouvelle
  demande.
- **Suite de tests re-vérifiée intégralement** après les lots 6 à 15
  ci-dessus (passage complet, séquentiel, des 94 fichiers `*_test.js` à la
  racine, `player_compare_test.js` et `mobile_viewport_meta_test.js`
  inclus) : seul `ordres_validate_without_edit_test.js` (bug pré-existant
  documenté plus bas dans "À investiguer", sans lien avec cette session,
  ni avec les lots 13/14/15) échoue sur le dernier passage complet — aucune
  régression détectée.

---

## Discussions de la session (pas de code livré, à garder en mémoire)

### Idées de développement évoquées (aucune décision de les faire, juste pour ne pas les perdre)
- **Origine** : "d'autres idées de développement intéressantes ?" — Claude a
  proposé plusieurs pistes, catégorisées :
  - Profondeur de scouting (aller plus loin que le système actuel).
  - Système de rééducation/fatigue (blessures, gestion physique long terme).
  - Draft à l'échelle de la ligue.
  - Palmarès du manager (historique des trophées/saisons du joueur humain).
  - Réputation du manager (auprès des autres clubs/joueurs).
  - Rivalités entre clubs.
  - Comparateur de joueurs côte à côte — **celle-ci a été choisie, affinée,
    maquettée puis RÉELLEMENT implémentée** cette même session (voir lot 14
    dans l'Historique ci-dessous).
- **Statut** : les autres pistes (scouting, rééducation/fatigue, draft,
  palmarès, réputation, rivalités) restent de simples idées non retenues à
  ce stade — à ressortir si l'utilisateur veut explorer la suite du
  développement du jeu.

### Question posée : "mes seconds remplaçants à tous les postes n'ont pas joué, sont-ils bien pris en compte ?"
- **Réponse apportée (pas un bug, aucun code changé)** : le moteur
  (`MatchEngine.substituteIfNeeded`/`Team.backupsForSlot`, engine.js) ne fait
  entrer un remplaçant que sur fatigue ≥82, ≥4 fautes, exclusion ou
  blessure — il n'y a aucune rotation programmée qui garantit des minutes à
  tout le monde. Sur un match de 40 minutes à endurance moyenne, un
  titulaire n'atteint généralement le seuil de fatigue qu'une seule fois
  (vers la 28e-33e minute) : un seul changement par poste suffit alors à
  finir le match, et le "2e" remplaçant n'a jamais l'occasion d'entrer.
  Vérifié empiriquement en simulant 30 matchs (script jetable, pas un fichier
  de test committé) : le 2e remplaçant termine à 0 seconde de jeu dans 45 %
  des cas (poste × match), et il est fréquent qu'un même match laisse 3, 4
  voire 5 postes sur 5 sans le moindre 2e remplaçant utilisé — cohérent avec
  ce que l'utilisateur a observé. Sur la durée (plusieurs matchs), ils
  finissent quand même par jouer en moyenne 3,5 à 6,4 minutes/match (fautes,
  variance d'endurance, etc.), donc le mécanisme fonctionne bien, il est
  juste peu sollicité match par match.
- **Piste évoquée, PAS demandée par l'utilisateur pour l'instant** : un
  mécanisme de rotation minimale (temps de jeu garanti) pour que le banc
  profond tourne plus systématiquement. L'utilisateur a répondu "laisse de
  côté pour le moment" — à reprendre seulement s'il en fait la demande.

---

## Historique (terminé, committé ou en attente de commit)

### 2026-09-23 — pas encore commité — Mobile : le texte passait au-dessus de la barre du haut (balise viewport manquante)
- **Origine** : capture d'écran envoyée par l'utilisateur (téléphone, page
  Guide) + retour "Le texte passe au dessus de la barre du haut du site".
  Sur la capture, les icônes système du téléphone (5G, batterie 100 %)
  recouvraient une partie du texte du Guide EN PLEIN MILIEU d'une phrase
  ("...visible sur l'onglet [icônes]recalculés au début de chaque
  nouvelle saison...").
- **Diagnostic** : aucune balise `<meta name="viewport">` n'était présente
  dans `moteurbasket3.html` (`<head>` ne contenait que `<meta charset>` et
  `<title>`). Sans elle, les navigateurs mobiles simulent un viewport large
  façon desktop (~980px) puis mettent toute la page à l'échelle pour la
  faire tenir à l'écran. Deux conséquences confirmées :
  1. Toutes les `@media(max-width:900px/680px/560px/...)` déjà présentes
     dans la feuille de style (menu latéral, `.topbar`, grilles diverses)
     ne se déclenchaient JAMAIS sur un vrai téléphone (mesuré via
     Playwright + émulation mobile 390×844 : largeur de viewport effective
     390px AVANT la balise, mais aucune media query mobile active).
  2. `position:sticky` sur `.topbar` (censée rester fixe en haut pendant le
     défilement) se comporte de façon non fiable sur iOS Safari quand la
     page n'est pas rendue à l'échelle 1:1 — cause la plus probable du
     texte qui "passait au-dessus" de la barre du haut au lieu de rester
     dessous.
- **Correctif** : ajout de `<meta name="viewport" content="width=device-width,
  initial-scale=1">` dans le `<head>` de `moteurbasket3.html`.
- **Effet de bord découvert et corrigé dans la foulée** : une fois la page
  enfin rendue à sa vraie largeur sur téléphone, un problème PRÉ-EXISTANT
  mais jusque-là masqué par le zoom arrière automatique est devenu visible :
  la sidebar (largeur FIXE 236px, volontairement jamais réduite à un rail
  compact à aucune taille d'écran — choix délibéré antérieur, voir le
  commentaire CSS "la sidebar garde donc désormais sa largeur... à toutes
  les tailles d'écran") ne laisse plus que ~150px à la zone de contenu sur
  un téléphone étroit (mesuré à 390px de large). Le bouton "Donnez vos
  ordres" (`button.topbar-cta`, en une seule ligne `white-space:nowrap`)
  débordait alors du cadre de ~19px, provoquant un défilement horizontal de
  toute la page. Corrigé en l'autorisant à passer sur deux lignes et en
  réduisant son remplissage/sa taille de police sous 560px de large
  (`@media(max-width:560px)`), SANS toucher à la largeur de la sidebar (hors
  sujet, décision utilisateur antérieure). Débordement horizontal repassé à
  0 après ce correctif (vérifié via Playwright, mesure réelle
  `scrollWidth`/`clientWidth`).
- **Repéré en passant, PAS corrigé (hors scope de ce correctif)** : les
  pages à tableaux denses (Effectif, Ordres) débordent elles aussi
  horizontalement sur un téléphone aussi étroit que 390px (mesuré : ~59px
  sur Effectif, ~174px sur Ordres) une fois la page rendue à sa vraie
  largeur — ce n'est PAS une régression introduite par ce correctif (ces
  pages n'ont jamais été pensées pour tenir dans ~150px de large, avec ou
  sans la balise viewport ; avant le correctif, tout était simplement zoomé
  arrière en bloc par le navigateur, masquant le problème comme pour le
  bouton "Donnez vos ordres" ci-dessus). Nécessiterait une vraie refonte
  responsive de ces pages (colonnes à masquer, scroll horizontal contenu
  dans le tableau plutôt que sur toute la page, etc.) — à discuter avec
  l'utilisateur si l'usage mobile de ces pages spécifiques devient
  prioritaire.
- **Fichiers touchés** : `moteurbasket3.html` (balise viewport + correctif
  `button.topbar-cta`), nouveau fichier `mobile_viewport_meta_test.js`
  (garde-fou automatisé : vérifie la présence et le contenu correct de la
  balise viewport, et la présence du correctif de débordement du bouton —
  jsdom ne calculant pas de vraie mise en page CSS, la vérification visuelle
  réelle a été faite via Playwright, pas par ce test), `DEV_NOTES.md`.
- **Tests** : `mobile_viewport_meta_test.js` (nouveau, 2 vérifications, vert)
  + vérification visuelle réelle via Playwright (émulation mobile 390×844,
  Chromium) : largeur de viewport effective = largeur de l'appareil, media
  query `.topbar-meta{display:none}` bien active, `.topbar` reste
  correctement épinglée en haut pendant le défilement, texte du Guide
  affiché intégralement et lisiblement sans chevauchement (capture
  comparée directement au passage signalé par l'utilisateur — la phrase
  "Les salaires (masse salariale visible sur l'onglet Économie)..."
  s'affiche maintenant complète), 0px de débordement horizontal du document
  (`scrollWidth === clientWidth`, à 2px près). Suite complète des 94 fichiers
  `*_test.js` repassée en entier après ce lot (voir plus haut) : aucune
  régression, seul l'échec pré-existant `ordres_validate_without_edit_test.js`
  subsiste.
- **Statut** : PAS ENCORE testé sur le Mac ni committé/poussé (le push reste
  toujours à faire par l'utilisateur lui-même).

### 2026-09-23 — pas encore commité — Comparateur de joueurs
- **Origine** : suggestion de Claude parmi une liste d'idées de
  développement demandée par l'utilisateur ("d'autres idées de
  développement intéressantes ?"), retenue explicitement : "Un comparateur
  de joueurs côte à côte (marché des transferts et effectif) / reflechis à
  ça, ça me plait bien". Deux décisions de cadrage validées via question à
  choix avant de coder : page dédiée (pas de fenêtre superposée), 2 joueurs
  comparés à la fois. Un mockup HTML statique a été construit et VALIDÉ
  avant d'écrire la moindre ligne de vrai code : d'abord un format "feuille"
  (deux colonnes empilant tout verticalement), jugé pas idéal ("c'est pas
  mal je trouve. Mais c'est format feuille. Il vaudrait mieux un format
  paysage non ?"), puis un format "paysage" (3 colonnes de caractéristiques
  côte à côte + bandeau de 4 mini-cartes de profil, tout tenant sur la
  hauteur d'un écran), validé sans réserve ("parfait ça").
- **Ce qui a été construit** (`moteurbasket3.html` uniquement) :
  - Bouton "Comparer" ajouté à la fiche joueur existante (à côté de
    "← Retour"), visible pour n'importe quel joueur (le vôtre, un joueur du
    marché, ou un adversaire). `currentPlayerDetailRef` (nouvelle variable
    globale) mémorise le dernier joueur affiché sur la fiche, mis à jour à
    CHAQUE rendu de `renderPlayerDetail` — le bouton sait donc toujours qui
    est le "joueur A" sans avoir à faire remonter teamIdx/playerId depuis
    chaque appelant de `showPlayerDetail` (topbar, effectif, marché,
    classements, fiche équipe adverse...).
  - Nouvelle page dédiée `playerCompareSection` (ajoutée à `PAGE_IDS` et
    `WIDE_PAGE_IDS`, comme `playerDetailSection`), avec son propre
    plafond de largeur (1440px, sur `.section` plutôt que sur `.wrap` pour
    ne pas priver les autres pages larges de leur propre comportement) —
    le format "paysage" validé n'a pas besoin de s'étirer davantage sur un
    très grand écran.
  - Sélecteur du 2e joueur : réutilise l'index de recherche déjà en place
    pour la barre de recherche globale (`normalizeSearchText`/
    `league.teams`, voir `renderTopbarSearchResults`) plutôt que d'en
    reconstruire un second — même gabarit visuel (`.topbar-search-result`),
    exclut systématiquement le joueur A de ses propres résultats.
  - `computePlayerVisibility(teamIdx, player)` : NOUVELLE fonction,
    extraite de `renderPlayerDetail` (pure extraction, comportement
    strictement identique à avant — revérifié par `player_detail_test.js`,
    toujours vert) pour que la fiche joueur ET le comparateur partagent la
    MÊME règle de verrouillage par scoutisme, sans dupliquer la logique.
  - `pdpCompareAttrRowHtml` : une ligne de caractéristique du comparateur
    (valeur A / libellé / valeur B), réutilise `attrColorTier` (déjà en
    place) pour la couleur de palier, ajoute une classe `.win` sur la
    meilleure valeur des deux — JAMAIS si un des deux côtés est verrouillé
    (comparaison non pertinente dans ce cas), chaque côté affichant alors
    "?" indépendamment, exactement comme `pdpAttrRowHtml` sur la fiche
    joueur.
  - Bandeau de profil (4 mini-cartes) : Évaluation globale (verrouillée tant
    qu'un des deux côtés n'est pas ENTIÈREMENT scouté, même règle que
    `overall()` sur la fiche joueur), Potentiel (jamais montré pour un
    joueur qui n'est pas dans votre effectif — même règle que la fiche
    joueur, pas même pour un joueur du marché), Salaire (réel uniquement
    pour votre joueur ; pour un joueur mis aux enchères, affiche l'enchère
    en cours ou le prix de départ — décision volontaire : cette information
    est déjà PUBLIQUE ailleurs dans le jeu, sur les cartes du Marché,
    contrairement au salaire d'un adversaire qui lui n'est montré nulle
    part ; sert le cas d'usage principal du comparateur, évaluer le coût
    d'une cible de transfert), Forme (toujours visible des deux côtés, même
    règle que `conditionBadgeHtml` sur la fiche joueur).
  - Une note de poste ("Même poste" / "Postes différents") sous les deux
    en-têtes, pour garder ce recul lors de la comparaison.
- **Fichiers touchés** : `moteurbasket3.html` uniquement pour le code réel ;
  nouveau fichier `player_compare_test.js`. `mockup_player_compare.html`
  (mockup de validation) volontairement PAS commité, jetable.
- **Tests** : nouveau fichier `player_compare_test.js` (18 vérifications,
  4 parties : ouverture depuis la fiche joueur + sélecteur, contenu complet
  entre deux joueurs de son propre effectif avec vérification indépendante
  du palier de couleur ET de la mise en avant de la meilleure valeur sur les
  28 caractéristiques, comparaison avec un joueur du marché [verrou levé,
  potentiel cependant caché, prix = enchère en cours], comparaison avec un
  adversaire non scouté [tout verrouillé côté B, aucune mise en avant]) —
  tous verts. `player_detail_test.js` revérifié après l'extraction de
  `computePlayerVisibility` (pure extraction, aucune régression). Suite
  complète des 93 fichiers `*_test.js` repassée après ce lot : aucune
  régression (voir "À FAIRE CE SOIR" plus haut). Vérifié aussi par de vrais
  screenshots Playwright/Chromium (serveur de test réel, données réelles) :
  aucun débordement horizontal à 1366px ni 1440px, rendu conforme au mockup
  validé, y compris pour un vrai joueur mis aux enchères (annonce injectée
  dans la sauvegarde).
- **Statut** : code écrit, testé (automatisé + captures d'écran réelles),
  PAS ENCORE testé sur le Mac ni committé/poussé.

### 2026-09-23 — pas encore commité — Effectif : le tableau débordait horizontalement depuis l'ajout de la colonne Potentiel
- **Origine** : "il y a besoin de scrolelr vers la droite maintenant ? tout
  ne rentre plus dans l'affichge ?" — l'utilisateur a remarqué que le
  tableau de l'Effectif (sous-onglet Général) semble déborder depuis l'ajout
  de la colonne Potentiel (lot 6, "Dashboard Effectif + colonne Potentiel").
- **Diagnostic (mesures réelles, pas de supposition)** : plutôt que de
  deviner, un vrai navigateur Chromium (Playwright, pré-installé dans le
  sandbox) a été piloté contre un vrai serveur de test pour MESURER le
  débordement à 5 largeurs d'écran courantes (1280/1366/1440/1536/1920px) :
  confirmé, le tableau débordait de 135px à 1280px et de 49px à 1366px (deux
  résolutions d'ordinateur portable très courantes), et tenait sans scroll
  seulement à partir de 1440px. Une mesure colonne par colonne a ensuite
  isolé la cause : la colonne "Potentiel" (~151px) était la 2e plus large du
  tableau, uniquement à cause de `white-space:nowrap` (CSS existant, ligne
  ~1254) qui force les libellés longs ("Très bon joueur", "Joueur correct")
  sur une seule ligne au lieu de les laisser revenir à la ligne.
- **Correctif** (`moteurbasket3.html`, CSS uniquement, aucun changement de
  comportement/données) :
  - Nouvelle règle `table.roster-table .potential-tier` (scopée aux
    tableaux denses : Effectif Général/Caractéristiques + Academy — PAS la
    carte Marché ni la fiche joueur, qui gardent l'affichage sur une seule
    ligne, ayant largement la place) : `white-space:normal` +
    `display:inline-block` + `max-width:58px` + `font-size:10.5px` pour
    laisser le libellé revenir sur 2 lignes dans une largeur plafonnée
    (l'info reste complète, juste réarrangée — pas de troncature/ellipse) ;
    `overflow-wrap:break-word`/`word-break:break-word` en filet de sécurité
    pour que même le mot le plus long d'un seul tenant ("Générationnel", 13
    lettres) ne puisse jamais dépasser cette largeur.
  - Le padding horizontal des cellules de `table.roster-table` (`th`/`td`,
    partagé par TOUTES les colonnes) est réduit de `7px 5px` à `7px 3px`
    pour regagner un peu de place partout, une fois constaté que la colonne
    Potentiel elle-même plafonnait désormais à la largeur de son EN-TÊTE
    ("POTENTIEL", ~60px) plutôt qu'à celle de son contenu — rétrécir encore
    le contenu n'aurait donc plus rien changé sans aussi toucher ce
    padding partagé.
- **Résultat mesuré** (re-mesuré avec le même script Playwright, sur données
  aléatoires ET sur un cas volontairement pire — tous les joueurs au palier
  "Générationnel", le libellé le plus contraignant) :
  - 1366px et au-delà : 0px de débordement (contre 49px avant) — la
    résolution d'ordinateur portable la plus courante est donc pleinement
    corrigée, y compris dans le pire des cas.
  - 1280px : débordement ramené à 36-58px selon les données (contre 135px
    avant), soit une réduction d'environ 60 à 75%, mais PAS totalement
    éliminé. Investigation plus poussée : même en supprimant complètement la
    colonne Potentiel, à 1280px le reste du tableau (dominé par la colonne
    "Marché", ~266-270px à elle seule) suffit déjà à dépasser la largeur
    disponible d'environ 50px — cette largeur d'écran était donc déjà
    tendue avant l'ajout de Potentiel, pour des raisons indépendantes de ce
    lot (probablement déjà scrollable avant, sans que ce soit remarqué —
    à confirmer avec l'utilisateur si besoin). Corriger complètement 1280px
    demanderait de retravailler d'autres colonnes (Marché en particulier),
    ce qui sort du périmètre de cette demande ponctuelle.
- **Fichiers touchés** : `moteurbasket3.html` uniquement (2 règles CSS
  modifiées/ajoutées, aucun changement de logique JS ni de données).
- **Tests** : aucun fichier `*_test.js` nouveau — jsdom ne fait pas de vrai
  layout/mesure de boîtes, donc ce type de régression (débordement
  horizontal) ne peut pas être vérifié de façon fiable par les tests jsdom
  existants ; la vérification s'est faite via Playwright (scripts
  ponctuels, non commités, dans `/tmp` côté sandbox) plutôt que par un
  nouveau fichier de test permanent, pour éviter d'ajouter une dépendance
  lourde (Playwright + Chromium) à la suite de tests habituelle sans
  confirmation que l'utilisateur la veuille côté Mac. Suite complète des 92
  fichiers `*_test.js` existants re-passée après le correctif : aucune
  régression (voir "À FAIRE CE SOIR" plus haut pour le détail).
- **Statut** : code modifié et vérifié par mesure réelle (Playwright), tests
  de non-régression complets passés, PAS ENCORE testé sur le Mac ni
  committé/poussé.

### 2026-09-23 — pas encore commité — Extension du schéma rouge/orange/blanc/vert (sans halo) à l'Effectif, au Marché, à l'Humeur des supporters, à l'Alchimie et à la Connaissance tactique
- **Origine** : suite du lot précédent (voir "Nouveau schéma de couleur
  rouge/orange/blanc/vert... (implémentation réelle)" juste en dessous) —
  "reprends le meme code couleur pour les pages effectifs, les joueurs sur
  le marché des transferts, l'humeur des supporters, alchimie, connaissance
  tactique".
- **Contexte** : ce lot referme, dans l'AUTRE sens, la boucle ouverte par le
  grand commentaire CSS "REVIRTEMENT VOLONTAIRE (2026-09-23)" de
  `moteurbasket3.html` (juste avant `.pdp-grid`) : la toute première version
  de ce commentaire expliquait pourquoi la fiche joueur RÉUTILISAIT
  délibérément l'échelle attr-lo/mid/good/elite de l'Effectif/du Marché,
  pour ne pas introduire une deuxième échelle incohérente ; le lot suivant
  avait renversé cette décision UNIQUEMENT pour la fiche joueur ; ce lot-ci
  va au bout de ce renversement en propageant la NOUVELLE échelle partout
  ailleurs — il n'y a donc plus qu'UNE SEULE échelle de couleur (rouge/
  orange/blanc/vert, 0-20/21-50/51-80/81+) dans tout le jeu, plus aucune
  trace d'attr-lo/mid/good/elite.
- **Deux mécanismes distincts, chacun mis à jour séparément** (voir leurs
  commentaires respectifs dans `moteurbasket3.html`) :
  - `attrColorTier` (ex-`pdpColorTier`, RENOMMÉE à cette occasion — plus
    seulement "player detail page", devenue le nom de classe CSS partagé
    par tout le jeu ; classes `attr-tier-red/orange/white/green`, ex-
    `pdp-tier-*`) : maintenant utilisée aussi par `attrCellHtml` (la
    fonction UNIQUE qui affiche une caractéristique chiffrée + mini-barre,
    remplace l'ancien calcul de palier codé en dur 45/65/80 dans
    `attrCellHtml` elle-même). `attrCellHtml` étant un composant PARTAGÉ,
    ce changement se propage naturellement (et cohéremment) à TOUS ses
    appelants : Effectif (sous-onglet Caractéristiques) et Marché
    (explicitement nommés dans la demande), mais AUSSI la fiche équipe d'un
    adversaire et l'Académie de jeunes (effectif jeunes + prospects), non
    nommés explicitement mais partageant le même composant — les exclure
    aurait recréé l'incohérence que ce lot vise justement à éliminer.
  - `moraleGaugeColor` : mêmes seuils/couleurs qu'`attrColorTier`, mais
    renvoie une couleur LITTÉRALE ("var(--danger)"/"var(--amber)"/
    "var(--ink)"/"#3ecf67") plutôt qu'un nom de classe — tous ses appelants
    l'utilisent en style inline dynamique, jamais via une classe CSS posée
    sur l'élément. Remplace l'ancienne échelle à 3 paliers (65/45, vert-teal/
    orange/rouge, sans palier "blanc" intermédiaire). Appelants concernés :
    Humeur des supporters (jauge de l'onglet dédié + carte "Supporters" du
    Tableau de bord), Alchimie (jauge de l'onglet Ordres + carte "Alchimie"
    du Tableau de bord + jauge compacte de l'Effectif), Connaissance
    tactique (jauge de l'onglet Ordres + les 18 jauges par option du menu
    déroulant d'entraînement, `optionGaugeHtml`).
- **CSS** : nouvelles règles `.attr-cell.attr-tier-red/orange/white/green`
  (remplacent `.attr-cell.attr-lo/mid/good/elite`), même structure que les
  règles déjà posées pour `.pdp-attr-value`/`.pdp-overall-num` (couleur du
  texte ET de la mini-barre). Rouge/orange/blanc réutilisent les variables
  déjà existantes (`var(--danger)`/`var(--amber)`/`var(--ink)`) ; vert
  (`#3ecf67`) reste la même couleur codée en dur qu'ailleurs, faute de
  variable existante pour ce vert précis.
- **Nouveau fichier `attr_color_scheme_everywhere_test.js`** : vérifie les 5
  écrans nommés dans la demande, chacun contre un calcul de palier
  indépendant (jamais en appelant `attrColorTier`/`moraleGaugeColor`
  elles-mêmes) : Effectif (Caractéristiques, ~225 `.attr-cell` sur un
  effectif complet), Marché (annonce injectée directement dans la
  sauvegarde pour une carte déterministe), Humeur des supporters (4 valeurs
  de `fanMorale` patchées, une par palier), Alchimie (3 emplacements :
  Ordres, Tableau de bord, Effectif), Connaissance tactique (2
  emplacements : jauge Ordres, 18 jauges du menu déroulant d'entraînement —
  qui s'est avéré construit PARESSEUSEMENT, vide tant que le bouton
  déclencheur n'a pas été cliqué au moins une fois, piège documenté en
  commentaire). Piège rencontré et documenté en commentaire : jsdom
  NORMALISE une couleur hex assignée en style inline (`"#3ecf67"` devient
  `"rgb(62, 207, 103)"` une fois relue), mais laisse un `var(--xxx)` tel
  quel — sans en tenir compte, la comparaison aurait échoué uniquement sur
  le palier vert, pour une raison purement liée à jsdom et pas à un vrai
  bug (helper `colorMatches` ajouté pour couvrir les deux formes). Tous
  verts, relancé 3 fois sans échec.
- **Fichier existant mis à jour** : `pdp_color_scheme_test.js` — la partie 5
  affirmait que l'Effectif GARDAIT volontairement l'ancienne échelle
  (vrai au moment où ce fichier a été écrit, avant ce lot-ci) ; retirée
  (devenue incorrecte par construction) et remplacée par un renvoi vers
  `attr_color_scheme_everywhere_test.js`, qui couvre maintenant ce cas.
- **Suite complète re-passée** (sandbox + serveur) après ce lot : aucune
  régression, seul `ordres_validate_without_edit_test.js` (bug pré-existant
  documenté plus bas) échoue.

### 2026-09-23 — pas encore commité — Menus déroulants natifs (`<select>`) en thème sombre partout dans le jeu
- **Origine** : "sur tous les menus déroulants dans le jeu, pourrais tu
  enlever le cadre blanc qu'il y a autour des propositions ? ça ferait un
  peu plus moderne je pense".
- **Diagnostic** : le "cadre blanc autour des propositions" n'est PAS du CSS
  d'app classique qu'on aurait mal réglé — c'est le POPUP NATIF d'un
  `<select>` (la liste qui s'ouvre au clic) qui n'est pas un élément DOM
  stylable normalement : sans indication contraire, le navigateur/OS
  l'affiche dans son thème CLAIR par défaut (fond blanc), même si toute la
  page autour est sombre. Confirmé qu'aucune règle `option{...}` n'existait
  nulle part dans le fichier avant ce lot, et qu'aucun `color-scheme`
  n'était déclaré non plus.
- **Solution** : `color-scheme: dark;` posé sur `:root` (bascule TOUS les
  contrôles de formulaire natifs — popups de `<select>`, scrollbars, cases à
  cocher — sur le thème sombre de l'OS/navigateur plutôt que le clair par
  défaut ; c'est le seul levier CSS standard qui agit vraiment sur le popup
  natif) et répété explicitement sur la règle `select{}` elle-même (certains
  navigateurs n'appliquent le thème sombre au popup que si la propriété est
  aussi présente directement sur l'élément, pas seulement héritée). Ajout
  d'une règle `select option{background:var(--panel-2); color:var(--ink);}`
  en complément, pour les navigateurs (Firefox notamment) qui respectent
  aussi le style direct des `<option>`. Portée : les ~28 `<select>` natifs du
  jeu (Ordres, Entraînement, Préparation de match, poste d'un remplaçant sur
  le terrain live, etc.) — le dropdown CUSTOM des tactiques travaillées
  (`.trained-tactic-*`, voir son entrée Historique plus bas) n'est pas un
  `<select>` natif et n'était de toute façon pas concerné (déjà stylé en
  sombre depuis sa création).
- **Nouveau fichier `select_dark_dropdown_test.js`** : jsdom ne rend jamais
  le popup natif d'un `<select>` (aucun outil de test DOM-only ne le fait),
  donc le test vérifie la cause structurelle plutôt que l'effet visuel —
  `getComputedStyle(...).colorScheme === "dark"` sur la racine du document
  ET sur chaque `<select>` trouvé, balayé sur 3 écrans différents (Écran
  initial, Ordres, Entraînement — 28 `<select>` à chaque fois, 84 au total).
  Tous verts, relancé 3 fois sans échec.
- **Suite complète re-passée** (sandbox + serveur) après ce lot : aucune
  régression, seuls `ordres_validate_without_edit_test.js` (bug pré-existant
  documenté plus bas) et `training_progression_test.js` (déjà connu flaky,
  vert au re-run individuel) échouent.

### 2026-09-23 — pas encore commité — Nouveau schéma de couleur rouge/orange/blanc/vert, sans halo, sur la fiche joueur (implémentation réelle)
- **Origine** : suite de l'exploration/mockup ci-dessous — "on va partir sur
  la version sans mockup avec les couleurs rouges orange blanc vert".
- **Contexte** : voir l'entrée "Mockups palette de couleurs..." juste en
  dessous pour la décision et les deux mockups jetables qui y ont mené. Ce
  lot est l'implémentation RÉELLE dans `moteurbasket3.html`, qui n'existait
  pas encore avant ce lot. Ceci REVIENT DÉLIBÉRÉMENT sur une décision de
  design documentée plus tôt dans ce même fichier (voir le grand commentaire
  CSS "REVIRTEMENT VOLONTAIRE (2026-09-23)" dans moteurbasket3.html, juste
  avant `.pdp-grid`) : à l'origine, la fiche joueur réutilisait
  délibérément l'échelle attr-lo/mid/good/elite (seuils 45/65/80) de
  l'Effectif/du Marché (.attr-cell) pour éviter DEUX échelles de couleur
  incohérentes dans le jeu pour les mêmes valeurs. L'utilisateur choisit
  maintenant EXPLICITEMENT de réintroduire cette deuxième échelle,
  UNIQUEMENT sur la fiche joueur — l'Effectif/le Marché gardent
  volontairement leur ancienne échelle 45/65/80, inchangée.
- **Solution** : `pdpPillTier` renommée `pdpColorTier` (elle-même RE-renommée
  `attrColorTier` au lot suivant, "Extension du schéma... à l'Effectif, au
  Marché..." juste au-dessus, quand son usage a dépassé la seule fiche
  joueur — nom qui n'existe donc plus tel quel dans le code actuel, gardé
  ici tel quel pour l'exactitude historique du récit), nouveaux seuils
  (<=20 rouge, <=50 orange, <=80 blanc, >80 vert) et nouvelles classes
  `pdp-tier-red/orange/white/green` (idem, devenues `attr-tier-*` au lot
  suivant — au lieu de attr-lo/mid/good/elite, réservées à .attr-cell À CE
  MOMENT-LÀ). Rouge/orange/blanc réutilisent exactement les
  variables déjà existantes (`var(--danger)`, `var(--amber)`, `var(--ink)`)
  qui correspondaient déjà pixel pour pixel aux couleurs validées sur les
  mockups ; vert (`#3ecf67`) est une couleur codée en dur reprise telle
  quelle des mockups, faute de variable existante (`--ok` est un teal, pas
  ce vert-là). SANS halo : nouvelle classe `.pdp-attr-value` (juste le
  chiffre en gras coloré à droite, sans padding/fond) remplace `.pdp-pill`
  pour les valeurs révélées — `.pdp-pill` (pastille/fond) reste utilisée
  UNIQUEMENT pour le badge "?" d'une caractéristique verrouillée/non
  révélée (signal différent, garde son fond). Même échelle appliquée à la
  note globale (`.pdp-overall-num`), déjà sans fond auparavant (juste du
  texte coloré, donc pas de changement de halo là, seulement de couleurs).
- **Nouveau fichier `pdp_color_scheme_test.js`** : vérifie, sur les
  caractéristiques d'un joueur de son propre effectif, que (1) plus aucune
  valeur ne porte la classe `pdp-pill` (halo), (2) chaque valeur affichée a
  la bonne classe de palier contre un calcul indépendant des seuils 0-20/
  21-50/51-80/81+, (3) plus aucune trace de l'ancienne échelle attr-elite/
  good/mid/lo sur la fiche joueur, (4) la note globale suit la même échelle,
  (5) l'Effectif (.attr-cell, sous-onglet Caractéristiques) garde bien SA
  propre échelle 45/65/80, non contaminée par le changement. Tous verts,
  relancé 3 fois sans échec. Point (5) devenu FAUX au lot suivant (extension
  volontaire à .attr-cell) : retiré de ce fichier de test à cette occasion,
  remplacé par attr_color_scheme_everywhere_test.js — voir son entrée
  Historique juste au-dessus pour le détail.
- **Fichier existant mis à jour** : `player_detail_test.js` — l'assertion
  "caractéristiques déverrouillées visibles" cherchait `.pdp-pill:not(.locked)`
  (n'existe plus pour les valeurs révélées), mise à jour vers
  `.pdp-attr-value`.
- **Suite complète re-passée** (sandbox + serveur) après ce lot : aucune
  régression, seuls `ordres_validate_without_edit_test.js` (bug pré-existant
  documenté plus bas) et `training_progression_test.js` (déjà connu flaky,
  vert au re-run individuel) échouent.

### 2026-09-23 — exploration/mockup, PAS de code réel touché — Mockups palette de couleurs des caractéristiques (fiche joueur)
- **Origine** : "petite mission intermédiaire — simule une page d'un joueur
  avec les carac de cette couleur : 0-20 rouge, 21-50 orange, 51-80 blanc et
  +81 vert / et une autre avec les carac de cette couleur : rouge / orange /
  vert / bleu", puis suite : "sur les pages joueurs, refais des visuels sans
  le halo : je préfère le premier oui, ça serait possible de présenter les
  valeurs sans halo autour ?"
- **Ce qui a été livré** : deux fichiers HTML autonomes (mockups, hors dépôt
  de jeu, PAS des artifacts persistés — signal explicite "simule"/one-off) :
  `color_scheme_comparison.html` (schéma A rouge/orange/blanc/vert vs schéma
  B rouge/orange/vert/bleu, mêmes valeurs de caractéristiques fictives côte
  à côte, réutilisant les vraies classes CSS/structure `.pdp-attr-grid` /
  `.pdp-attr-row` / `.pdp-pill` de la fiche joueur réelle pour une fidélité
  visuelle correcte) puis `color_scheme_no_halo.html` (schéma A uniquement,
  "avec halo" en rappel vs "sans halo" — juste le chiffre en gras coloré,
  sans pastille/fond — mêmes valeurs d'exemple pour comparaison directe).
- **Décision de l'utilisateur** : schéma A (0-20 rouge / 21-50 orange / 51-80
  blanc / 81+ vert), présentation SANS halo (texte coloré brut, pas de
  pilule/fond).
- **Statut** : décision prise ici via mockups jetables (jamais intégrés au
  jeu eux-mêmes) — l'implémentation RÉELLE dans `moteurbasket3.html` a
  suivi le même jour, voir l'entrée Historique "Nouveau schéma de couleur
  rouge/orange/blanc/vert, sans halo, sur la fiche joueur (implémentation
  réelle)" juste au-dessus.

### 2026-09-23 — pas encore commité — Avatar du joueur MVP sur les box scores
- **Origine** : "ajoute l'avatar du joueur MVP sur les box scores" — capture
  d'écran de l'encart "MVP du match" (feuille de stats d'un match terminé,
  citation comprise).
- **Obstacle** : les lignes de box score (`buildBoxScore` côté moteur pour
  un match qui vient de se jouer, `boxscoreRowsFromMatchLog` côté client
  pour un match déjà passé rouvert depuis le Calendrier) ne portaient QUE
  des stats à plat (nom, poste, minutes, stats de comptage) — aucune
  référence au VRAI `Player` (donc à son id, nécessaire pour régénérer son
  avatar procédural existant, voir `playerAvatarHtml`/`AvatarGen`) ni à son
  équipe (nécessaire pour les couleurs de maillot de l'avatar).
- **Solution** : champ `id: p.id` ajouté, ADDITIF, aux deux (engine.js
  `buildBoxScore` + son miroir dans moteurbasket3.html, ET
  `boxscoreRowsFromMatchLog`, celle-ci client-only donc sans miroir moteur).
  `boxscoreMatchMvp` renvoie désormais aussi `side` ("A"/"B", quelle équipe
  a fourni la ligne gagnante), ADDITIF également. `matchMvpCalloutHtml(mvp,
  teamForSideA, teamForSideB)` reçoit désormais les VRAIS objets Team en
  plus de `mvp` : elle retrouve le joueur (`team.players.find(p => p.id
  === r.id)`) et affiche son avatar (`playerAvatarHtml`, taille 44,
  couleurs de son club) à côté de ses stats, dans un nouveau conteneur
  `.mvp-callout-body` (scopé à `.match-mvp-callout`, jamais à `.mvp-callout`
  lui-même — partagé avec le MVP de la journée sur l'onglet Ligue et le
  bandeau Académie, qui n'ont pas d'avatar et ne doivent pas en hériter).
  Reste robuste sans casser si `id`/`side` sont absents (très ancienne
  sauvegarde) : `player` retombe simplement à `null`, aucun avatar affiché,
  le reste de l'encart inchangé.
- **Deux appelants mis à jour** : `renderBoxScore` (match qui vient de
  jouer, `matchMvpCalloutHtml(mvp, teamA, teamB)`) et
  `renderMatchBoxscoreTab` (match déjà passé, Calendrier — `matchBoxscoreState`
  porte désormais aussi `teamHome`/`teamAway`, les vrais objets Team, en plus
  de `rowsHome`/`rowsAway`/`nameHome`/`nameAway` déjà présents).
- **Nouveau fichier `mvp_avatar_test.js`** : couvre les DEUX box scores
  (match qui vient de se jouer et match passé rouvert depuis le Calendrier).
  Vérifie la présence de l'avatar et surtout sa CORRECTION — même joueur,
  mêmes couleurs de club — en comparant le HTML affiché à un avatar
  régénéré indépendamment côté moteur pour le VRAI joueur MVP. Piège
  rencontré et documenté en commentaire : `AvatarGen` incrémente un
  compteur module-level (`UID`) pour générer des ids SVG uniques
  (gradients/clip-paths) à CHAQUE rendu — deux rendus du MÊME joueur sont
  donc visuellement identiques mais textuellement différents (ids
  différents) ; la comparaison normalise ces ids avant de comparer, avec un
  test de non-régression dédié (l'avatar d'un AUTRE joueur reste bien
  distinct après normalisation, pour être sûr que la comparaison n'est pas
  devenue vide de sens). Deuxième piège : `.outerHTML` du DOM restitue les
  balises SVG auto-fermantes différemment d'une chaîne brute non insérée
  dans le DOM (`<rect .../>` vs `<rect ...></rect>`) — corrigé en faisant
  passer l'avatar "attendu" par le même aller-retour DOM avant de comparer.
  Vérifie aussi qu'aucune colonne parasite "id" n'apparaît dans le tableau
  (BOXSCORE_COLS reste une liste explicite). Tous verts, relancé 3 fois
  (MVP différent à chaque partie générée aléatoirement) sans échec.
- **Suite complète re-passée** (sandbox + serveur) après ce lot : aucune
  régression, seul `ordres_validate_without_edit_test.js` (bug pré-existant
  documenté plus bas) échoue.

### 2026-09-23 — pas encore commité — Logo de l'équipe qui reçoit au centre du terrain (direct)
- **Origine** : "maintenant qu'on a des logos (meme pour les joueurs non
  payant) ce serait pas mal si le logo apparaissait au milieu du terrain
  [...] logo de l'équipe qui recoit forcement".
- **Rendu** : nouveau groupe `<g id="liveCourtHomeLogo">` dans le SVG du
  terrain (`#liveCourtView`, juste après le rond central `cx=500 cy=220
  r=45`), rempli dynamiquement dans `enterLiveMatch()` (juste après
  `resetCourtView()`) via la nouvelle fonction `liveCourtHomeLogoSvg(team,
  cx, cy, r)`. L'équipe affichée est toujours celle qui REÇOIT — `homeTeam =
  liveMatch.isHome ? teamA : teamB` (mon équipe, teamA, n'est pas toujours à
  domicile ; même calcul que `liveMatchScoreAB`, déjà dans ce fichier) —,
  jamais systématiquement "mon équipe".
- **Pourquoi pas `teamLogoHtml()` telle quelle** : cette fonction existante
  (tableau de bord, fiche club) renvoie soit un `<img>` HTML (pas un enfant
  direct valide d'un `<svg>` sans `<foreignObject>`, volontairement évité —
  mal supporté par jsdom dans cette suite de tests), soit déjà un `<svg>`
  complet (`defaultTeamLogoSvg`, le ballon généré avec les initiales du
  club — "même pour les joueurs non payant"). `liveCourtHomeLogoSvg()` gère
  les deux mêmes cas que `teamLogoHtml` en SVG natif : le `<svg>` de
  `defaultTeamLogoSvg` simplement repositionné via un `<g
  transform="translate(...)">` englobant (un `<svg>` imbriqué dans un autre
  est valide, spec SVG2) pour un club gratuit ; un `<image>` SVG (équivalent
  natif d'un `<img>`) découpé en cercle via `<clipPath>` (cohérent avec le
  rendu rond `.team-logo-img{border-radius:50%}` utilisé partout ailleurs)
  pour un club payant avec logo personnalisé.
- **Nouveau fichier `live_court_home_logo_test.js`** : même principe de
  reconnexion à mi-diffusion que `live_court_view_test.js`. Vérifie que le
  logo affiché correspond TOUJOURS à l'équipe qui reçoit (jamais la
  visiteuse, quel que soit `liveMatch.isHome`), qu'il est bien centré sur le
  rond central, qu'un club gratuit affiche le logo type (`<svg>` imbriqué,
  `aria-label` avec son nom) et qu'un club payant avec logo personnalisé
  (patché directement dans la sauvegarde de test) affiche bien une `<image>`
  découpée en cercle avec le bon `href`, à la place du logo type. Piège
  rencontré et documenté en commentaire dans le test : la sauvegarde brute
  porte DEUX copies distinctes de "mon équipe" (`data.team`, utilisée pour
  construire `teamA` côté client, et `league.teams[0]`, un objet DIFFÉRENT)
  — patcher `isPaying`/`customLogoDataUrl` sur la bonne source selon que
  l'équipe qui reçoit est la mienne ou l'adversaire. Tous verts (relancé 3
  fois pour écarter toute flakiness liée au tirage domicile/extérieur de la
  journée 1 — stable).

### 2026-09-23 — pas encore commité — Jauges de connaissance tactique intégrées DANS le menu déroulant de l'aspect travaillé
- **Origine** : "tu n'as pas intégré les jauges de niveau de connaissance
  tactique directement dans le menu déroulant" — capture d'écran du
  `<select>` natif (page Entraînement, choix de l'aspect tactique
  précisément travaillé) montrant les options en texte brut, et de la
  section de jauges existante plus bas sur la page (insuffisante : la
  demande porte sur le menu LUI-MÊME, pas sur son environnement).
- **Obstacle technique** : un `<option>` HTML natif ne peut afficher QUE du
  texte brut — aucune barre colorée possible à l'intérieur. Confirmé sans
  précédent équivalent ailleurs dans l'appli (recherché via grep
  "custom-select"/"dropdown-menu" avant d'écrire quoi que ce soit ; même la
  page Ordres, avec ses propres réglages tactiques, utilise encore des
  `<select>` classiques).
- **Solution** : `renderTrainedTacticsPicker()` (page Entraînement)
  remplace l'ancien `<select id="trainedTacticSelect">` par un bouton
  déclencheur (`#trainedTacticTrigger`) + un menu `<div>` personnalisé
  (`#trainedTacticMenu`, un `<button class="trained-tactic-option">` par
  choix), même gabarit flottant que `#topbarSearchResults` (déjà dans
  l'appli) pour rester cohérent visuellement. CHAQUE ligne du menu (et le
  déclencheur, pour l'option actuellement choisie) embarque une mini-jauge
  (barre + valeur/100) tirée directement de `teamA.tacticalKnowledge[cat]
  [key]` — même source que `renderTacticalKnowledgeTrainingGauges` juste
  au-dessus dans le fichier. Modèle de données et effets de bord
  INCHANGÉS : `teamA.trainedTactics = {category, value}`, mêmes appels
  (`saveMyTeam`/`syncTrainingToServer`/`renderOrdresChemistryGauge`/
  `renderOrdresTacticalKnowledgeGauge`) qu'avant, simplement déclenchés par
  le clic sur une ligne du menu plutôt que par l'`onchange` d'un `<select>`.
  Fermeture au clic en dehors gérée par UN SEUL écouteur `document`
  global, posé une fois près de celui de `#topbarSearchResults` (pas dans
  `renderTrainedTacticsPicker()` elle-même, réappelée à chaque rendu de
  l'onglet — un `addEventListener` posé là s'empilerait à chaque fois).
- **Nouveau fichier `trained_tactic_dropdown_test.js`** : vérifie que
  l'ancien `<select>` n'existe plus, que le menu s'ouvre/se ferme
  correctement (déclencheur, clic en dehors), que les 19 lignes (1 "Rien de
  précis" + 10 priorités offensives + 5 défenses + 3 rythmes) sont
  présentes avec les bons groupes, que CHAQUE ligne de tactique embarque
  bien une jauge cohérente avec sa valeur affichée, que sélectionner une
  option met à jour `teamA.trainedTactics`, persiste côté serveur et marque
  la ligne `.selected` à la réouverture, et que revenir à "Rien de précis"
  efface bien le choix. Tous verts.
- **Non demandé, pas touché** : la page Ordres garde ses propres `<select>`
  natifs (`ordresDefenseSelect`/`ordresRhythmSelect`) — la demande portait
  spécifiquement sur le sélecteur de la page Entraînement.
- **Suite (même jour) — "pas mal le menu déroulant, enleve ce qu'il y a en
  dessous"** (capture d'écran de l'ancienne section "Connaissance tactique
  de l'équipe" sous le sélecteur) : cette section (18 jauges,
  `#tacticalKnowledgeGaugesRow`/`tkGaugeRow*`, fonction
  `renderTacticalKnowledgeTrainingGauges`) est devenue redondante une fois
  les mêmes jauges intégrées dans le menu lui-même — entièrement retirée
  (HTML, CSS `.tactical-knowledge-gauges-groups`/`.tactical-knowledge-
  gauge-*`, fonction JS et son appel dans `showTrainingSection`).
  `trained_tactic_dropdown_test.js` mis à jour avec une assertion dédiée
  (`#tacticalKnowledgeGaugesRow` doit avoir disparu du DOM). Script
  utilitaire `take_tactical_knowledge_shot.js` (capture d'écran manuelle,
  PAS un fichier `_test.js`, hors suite automatisée) référence encore ces
  ids retirés — obsolète, pas mis à jour (hors périmètre, script de
  développement jetable, pas un test committé). Suite complète re-passée
  (tests liés à l'entraînement/tactique un par un, puis la suite entière) :
  aucune régression, seul `ordres_validate_without_edit_test.js` (bug
  pré-existant déjà documenté ci-dessous) échoue.

### 2026-09-23 — pas encore commité — Dashboard Effectif (nombre de joueurs) + colonne Potentiel sur les 2 sous-onglets de l'Effectif
- **Origine** : reprend directement le retour beta-testeur Discord déjà
  noté ci-dessus ("29 vs 15 joueurs confond, remettre Potentiel") — cette
  fois avec des instructions explicites et une capture d'écran, au lieu
  d'une simple suggestion à retrouver dans le code.
- **"enleve le bouton donner mes ordres" / "là il faut plus mettre le
  niveau moyen, mais mettre le nombre de joueur dans l'équipe"** (case
  "Effectif" du tableau de bord) : la case affiche désormais
  `teamA.players.length` (nombre réel de joueurs) au lieu de la note
  moyenne de l'effectif — résout exactement la confusion "29 vs 15"
  remontée par la testeuse Ariane. Le bouton "Donner mes ordres" (en plus
  de "Voir l'effectif") est retiré de la case.
- **"ajoute le potentiel juste après le poste" (sous-onglet "Général") /
  "idem là, juste après le poste" (sous-onglet "Caractéristiques")** : la
  colonne "Potentiel" (nom du palier uniquement — "All-Star", jamais le
  chiffre caché 1-99 — même convention que partout ailleurs, voir
  `potentialTierLabel`/`.potential-tier`) est réintégrée sur LES DEUX
  tableaux de l'Effectif, juste après la colonne "Poste" (position choisie
  explicitement par l'utilisateur, PAS "à la place de Rôle" comme suggéré
  par la testeuse — la colonne Rôle n'a pas été touchée). `ROSTER_SORT_
  COLUMNS` (tri de la colonne "Général") récupère une entrée `{key:
  "potential", label: "Potentiel"}` juste après "Poste" ; le rendu HTML des
  deux tableaux (`potentialCell`) insère la cellule au même endroit.
- **`potential_tier_test.js` réécrit** (fichier pré-existant d'une session
  antérieure) : son ancienne Partie 2 attendait l'ABSENCE de toute colonne
  "Potentiel" dans l'Effectif — décision de design inversée depuis par
  cette demande explicite. Réécrite pour vérifier sa PRÉSENCE, sa position
  exacte (juste après "Poste") et l'affichage du seul nom de palier
  (jamais le chiffre caché), sur les deux sous-onglets. Vert.

### 2026-09-23 — pas encore commité — Box score en direct
- **Origine** : "il n'y a pas de box score en direct. il faut l'ajouter".
  Jusqu'ici, la feuille de stats complète (`#boxscoreSection`, feuille
  FINALE avec MIN/+/-/MVP) n'était affichée qu'à la toute fin du direct
  (`finishPlayback`) ou en cas de forfait, alors même que `matchResult.
  boxScoreA/B` (résultat déjà simulé EN ENTIER par le serveur/moteur) est
  disponible côté client dès l'entrée sur l'écran Live — l'afficher tel quel
  PENDANT la diffusion aurait donc spoilé le résultat du match en cours.
- **Solution retenue** : un second tableau, `#liveBoxscoreSection`,
  RECONSTRUIT événement par événement au fur et à mesure qu'ils sont
  appliqués à l'écran (voir `applyLiveBoxScoreEvent`/`renderLiveBoxScore`
  dans moteurbasket3.html, appelées depuis `applyEvent`), donc ne reflète
  jamais que ce qui a déjà été montré. Colonnes : PTS/REB/PD/INT/CTR/PDB/
  FTS/2PTS/3PTS/LF/ÉVAL (évaluation PIR, ne dépend que des stats de
  comptage) — volontairement SANS minutes jouées ni +/- (nécessiteraient de
  suivre les 10 joueurs sur le terrain à tout instant, pas seulement
  l'auteur de chaque action, hors périmètre de cette demande). Onglets
  Domicile/Extérieur dédiés (`.live-bs-tab`, id `liveBsTabA`/`liveBsTabB`)
  — volontairement PAS la classe `.bs-tab` existante : elle est câblée une
  seule fois au chargement du script directement vers `renderBoxScore` (la
  feuille FINALE), la réutiliser aurait donc affiché les mauvaises données
  (spoiler) en plus du câblage dédié. Masqué pendant un forfait (rien à
  diffuser) et à la fin du direct (`finishPlayback` : la feuille finale,
  complète, prend le relais).
- **`engine.js`/miroir `moteurbasket3.html`** : ajout de champs structurés
  ADDITIFS (rien de retiré, rien de renommé) aux événements déjà loggués par
  `MatchEngine.log(...)` dans `playPossession`/`freeThrows` — nécessaires
  car les événements ne portaient jusque-là que `type`/`team`/`zone`/`made`/
  `shooter`/`possession` (voir `engine_live_events_test.js`), pas assez pour
  reconstituer un vrai box score (passeur, contreur, défenseur fautif,
  rebondeur, auteur de perte de balle, intercepteur, lancers francs) :
  `shot` porte désormais `assister` (nom du passeur crédité, ou `null`),
  `blocker` (nom du contreur), `defender` (nom du défenseur sur une faute
  sur tir manqué) ; `rebound` porte `rebounder` (+ `offensive`, non
  utilisé pour l'instant côté live, gardé pour une éventuelle finesse
  future oreb/dreb) ; `freeThrow` porte `shooter`/`made`/`attempts` ;
  `turnover` porte `player` (auteur) et `stealer` (intercepteur, ou `null`)
  ; `foul` (faute intentionnelle et faute sur "and-one") porte désormais
  `defender`. Vérifié additif et sans régression : `engine_live_events_test.
  js` (déjà existant, vérifie seulement la PRÉSENCE de certains champs, pas
  une forme exhaustive) et toute la suite de tests passent inchangés.
- **Nouveau fichier `live_boxscore_test.js`** : reconnexion à mi-diffusion
  (même principe que `live_court_view_test.js`/`end_to_end_test.js` partie
  4) — vérifie que `#liveBoxscoreSection` est visible et `#boxscoreSection`
  caché pendant la diffusion, un invariant FORT (somme des PTS de toutes
  les lignes du box score en direct d'une équipe === score affiché de cette
  équipe à cet instant précis, vérifié pour les DEUX équipes via la bascule
  d'onglet), l'isolation du câblage `.live-bs-tab` vis-à-vis de
  `renderBoxScore`, et le relais vers la feuille finale une fois
  `finishPlayback` déclenché. Tous verts.
- **Limite connue, documentée en commentaire** : un joueur qui manque LA
  TOTALITÉ de ses lancers francs sur un même passage à la ligne (0 réussi
  sur n) ne génère aucun événement `freeThrow` (voir `MatchEngine.
  freeThrows`, `if (made > 0)`, déjà le cas pour le fil de commentaires
  existant, pas une régression introduite ici) — ses tentatives manquantes
  manquent donc au FTA du box score EN DIRECT dans ce cas précis (rare).
  Aucun impact sur la feuille FINALE (`buildBoxScore` lit directement
  `p.stats.fta`, incrémenté à chaque tentative indépendamment du log).

### 2026-09-23 — pas encore commité — Fiche joueur : nom/Caractéristiques + Forme/Motivation + temps mort sans emoji
- **Origine** : trois retours successifs de l'utilisateur, avec captures
  d'écran, pendant la même session que les fautes antisportives ci-dessous.
- **"enlève le nom en blanc sur la page joueur au dessus de la brique,
  laisse uniquement celui qui est dans la brique mais grossis le un peu et
  mets le en blanc. enleve égalemeent caractéristiques, ça ne sert à
  rien"** : le titre `<h2 id="playerDetailName">` au-dessus de la grille de
  cartes (rempli avec le nom du joueur par `renderPlayerDetail`) est
  maintenant masqué (`style="display:none"`, JS inchangé — pas nécessaire
  de toucher `renderPlayerDetail`, l'élément continue juste d'exister,
  invisible). Dans la première `pdp-card`, le nom du joueur (un `<h3>` qui
  héritait du style générique `.pdp-card h3` : 11px, majuscules, gris sourd
  — pensé pour des titres de section comme "Profils", pas pour un nom de
  joueur) est maintenant surchargé en 16px, blanc (`var(--ink)`), casse
  normale ; le sous-titre "Caractéristiques" en dessous est supprimé.
- **"garde la même structure: forme : pas de fatigue (avec une étiquette
  verte) / motivation: motivé (avec une étiquette verte)"** : la ligne
  "Forme" (pastille `conditionBadgeHtml`) n'avait pas d'étiquette "Forme" à
  gauche (seule la pastille apparaissait, juste sous le titre "Condition"),
  contrairement à la ligne "Motivation" qui suit depuis toujours la
  structure `.pdp-kv` (libellé à gauche, pastille à droite). Alignée sur la
  même structure `.pdp-kv` que Motivation. Les deux pastilles étaient déjà
  identiquement vertes pour leur meilleur palier (`cond-great`/
  `motiv-great`, même CSS `rgba(63,174,98,...)`/`var(--ok)`) — seule la
  structure d'affichage manquait de cohérence, pas la couleur.
- **"enlève l'emoji"** (bandeau + fil de commentaires "Temps mort demandé
  par ...") : le libellé (`server/liveMatch.js:schedulePlayback`, propagé à
  la fois à la banderole temporaire `#pauseBanner` et au repère permanent
  dans le fil `#feed`, voir `appendPauseFeedItem`) portait un préfixe
  "⏱️ " — retiré, aucun test ne vérifiait ce préfixe exact (recherché sur
  tout le dépôt), donc aucun test à mettre à jour.

### 2026-09-23 — pas encore commité — Test d'exclusion pour indiscipline + fautes antisportives
- **Origine** : en réponse à "les exclusions ont bien été intégrées dans le
  jeu ?", vérification du mécanisme existant (2e faute technique = exclusion,
  voir `MatchEngine.maybeEjectForComposure`) : bien câblé de bout en bout
  (engine.js + miroir moteurbasket3.html, phrases dédiées, réutilise
  `disqualified`/`substituteIfNeeded` comme foulOut), MAIS repéré comme
  n'ayant AUCUN test automatisé dédié, contrairement à la plupart des autres
  mécanismes de match. L'utilisateur a demandé de corriger ce manque, puis
  d'enchaîner sur un nouveau mécanisme : "les fautes antisportives [...]
  Comme pour les fautes techniques 2 antisportives c'est exclusion. 1
  antisportive et une technique c'est exclusion aussi".
- **Nouveau fichier `disciplinary_ejection_test.js`** : couvre le mécanisme
  de faute technique déjà en place ET le nouveau mécanisme de faute
  antisportive (voir ci-dessous) - table de vérité complète de
  `shouldEjectForFouls` (2 techniques / 2 antisportives / 1+1, jamais 1 seule
  d'un type), 1ère/2e faute technique isolée (Sang-froid bas), 1ère/2e faute
  antisportive isolée (Discipline basse), règle mélangée dans les 2 ordres
  (technique puis antisportive, et l'inverse), garde-fous (Sang-froid/
  Discipline neutres = jamais de faute, joueur déjà exclu = plus rien ne se
  déclenche), une simulation de match RÉELLE (playPossession, pas
  d'appel direct) confirmant que les 2 mécanismes et l'exclusion sont bien
  atteints depuis le flot normal du jeu, et la sortie effective du terrain
  via `substituteIfNeeded` (comme foulOut). 9/9 assertions vertes, re-testé 5
  fois de suite pour écarter toute flakiness (aucune, malgré la partie
  statistique).
- **Nouveau mécanisme, faute antisportive** (engine.js ET moteurbasket3.html,
  toujours identiques) :
  - `Player.unsportsmanlikeFouls` (nouveau compteur, même traitement que
    `technicalFouls` : remis à zéro à chaque match dans `resetForMatch`,
    jamais persisté - stat de match uniquement).
  - `MatchEngine.shouldEjectForFouls(p)` (nouvelle méthode PARTAGÉE) :
    `technical >= 2 || unsportsmanlike >= 2 || (technical >= 1 &&
    unsportsmanlike >= 1)` - exactement la règle demandée. `
    maybeEjectForComposure` (faute technique, existant) l'utilise désormais
    à la place de son ancien test `technicalFouls >= 2` en dur.
  - `MatchEngine.maybeCommitUnsportsmanlikeFoul(...)` (nouvelle méthode,
    même structure que `maybeEjectForComposure`) : déclenchée par une
    Discipline basse plutôt qu'un Sang-froid bas (cohérent avec le rôle déjà
    établi de Discipline - "un défenseur peu discipliné commet davantage de
    fautes en défendant un tir", voir `disciplineFoulMod`) - contact excessif
    EN JEU plutôt qu'une dissipation hors ballon. Plafond de chance
    volontairement plus bas que la technique (3% contre 5%, choix de design
    non demandé explicitement par l'utilisateur : une faute antisportive est
    un évènement plus grave dans la vraie règle du basket, donc plus rare
    ici aussi - à ajuster si l'utilisateur trouve la fréquence mal calibrée
    une fois observée en jeu). Sanctionnée de 2 lancers francs adverses
    (contre 1 pour la technique, règle réelle simplifiée), qu'elle mène ou
    non à l'exclusion. Appelée aux 2 MÊMES points que
    `maybeEjectForComposure` (fautes personnelles "en jeu" : tir manqué avec
    faute, and-one), juste après elle - les 2 se gardent via
    `defender.disqualified` en tête de fonction, donc pas de double
    traitement si l'une exclut déjà le joueur.
  - `PHRASES.unsportsmanlikeFoul`/`unsportsmanlikeEjection` (nouvelles) :
    `technicalEjection`/`unsportsmanlikeEjection` reformulées en "Nouvelle
    faute [...] : cumul de fautes disciplinaires, exclusion !" plutôt que
    l'ancien "Deuxième faute technique [...] : exclusion !" - devenu FAUX
    dans le cas d'une exclusion par mélange (1 technique + 1 antisportive,
    où le compteur qui vient de franchir le seuil n'est pas forcément à 2).
  - Type d'évènement de l'exclusion par antisportive : `"technicalEjection"`
    (le même que l'exclusion technique, pas un nouveau `"unsportsmanlikeEjection"`)
    - choix délibéré pour que tout code/UI qui filtrerait déjà sur
    `"technicalEjection"` capture aussi ce cas sans modification. La faute
    antisportive NON suivie d'exclusion a en revanche son propre type,
    `"unsportsmanlikeFoul"`, distinct de `"technicalFoul"`.
  - Commentaires mis à jour : grand commentaire au-dessus d'ATTRS
    (composure/determination ET discipline, engine.js), texte d'aide de la
    fiche "Discipline"/attributs (moteurbasket3.html, `training-intro`).
- **Vérifié sans changement nécessaire** : les 2 points d'appel dans
  `playPossession` (tir manqué avec faute, and-one) recevaient déjà
  `maybeEjectForComposure` - juste ajouté `maybeCommitUnsportsmanlikeFoul`
  juste après, dans les 2 fichiers.
- **Tests** : `disciplinary_ejection_test.js` (nouveau, 9/9) + suite complète
  (84 fichiers) exécutée par lots de ≤6 en parallèle, tout vert. 2 échecs
  observés en parallèle (`end_to_end_test.js`, `post_match_interview_button_test.js`)
  confirmés comme la flakiness déjà documentée (timers sous charge
  parallèle), verts en re-run individuel, aucun lien avec ce changement.
- **Question posée juste après (2026-09-23)** : "Le stress est bien pris en
  compte aussi ? Il peut pousser un joueur à faire une mauvaise série ?" —
  vérifié (grep exhaustif "stress" dans engine.js/moteurbasket3.html/
  DEV_NOTES.md) : AUCUN attribut ni mécanisme nommé "stress" n'existe dans le
  jeu. Réponse donnée : le mécanisme de "tilt" (`Player.consecutiveMisses`,
  malus après 3 tirs manqués/pertes de balle d'affilée, atténué par
  `mentalAverage`/Sang-froid/Leadership du meilleur joueur du cinq) fait
  déjà conceptuellement ce que "stress" décrirait, sans être nommé/modélisé
  comme un attribut séparé. **Confirmé par l'utilisateur ("Non c'est bien
  comme tel") : PAS de nouveau concept de "stress" à ajouter** - le
  "tilt" existant couvre déjà le besoin, considérer cette question comme
  définitivement classée plutôt que d'y revenir plus tard.
- **État Git côté Mac** : pas encore déployé sur le Mac à ce stade (prochaine
  étape) ni committé/poussé.

---

### 2026-09-23 — pas encore commité — Retrait de "Mental" comme caractéristique indépendante du moteur
- Signalé : "et la caractéristique mental (ici 27) n'a plus lieu d'exister
  [...] le mental c'est désormais la moyenne de toutes ces lignes", puis
  confirmé sans ambiguïté : "j'espère que tu n'as pas gardé une ligne de
  code mental dans le moteur de jeu".
- Contexte : `mental` était l'UNE des 9 `MENTAL_ATTRS`, stockée/persistée
  comme les 8 autres (decision/focus/composure/anticipation/determination/
  leadership/discipline/vision), avec ses propres mécanismes de match dédiés
  (boost clutch fin de match serrée + malus de "tilt" après une série de
  ratés) — décision DÉLIBÉRÉE prise lors d'une session précédente de la
  garder ainsi (contrairement au bac à sable de référence qui l'avait déjà
  éclatée en 8 traits séparés), désormais inversée par ce retour
  utilisateur.
- **Fait, dans engine.js ET son miroir dans moteurbasket3.html** (les deux
  restent identiques, voir le grand commentaire "moteur mirroré" déjà en
  place) :
  - `mental` retiré d'ATTRS (29 → 28), TRAINING_LABELS et MENTAL_ATTRS
    (9 → 8 : decision/focus/composure/anticipation/determination/leadership/
    discipline/vision).
  - Nouvelle fonction `mentalAverage(player)` (moyenne des 8 `MENTAL_ATTRS`
    restants), exportée par engine.js — remplace les 3 lectures directes de
    `attrs.mental` : chance de discuter une demande de transfert
    (`TRANSFER_REQUEST_DISCUSS_MENTAL_BONUS`), et les 2 formules clutch/tilt
    de `MatchEngine.playPossession` (`mentalClutchBoost`/`tiltPenalty`).
  - Migration des sauvegardes (`playerFromSave`) : `missingNewAttrs`/
    `attrs13Keys` ne mentionnent plus "mental" (12 clés au lieu de 13 pour ce
    palier de migration — noms de variables gardés tels quels, purement
    historiques désormais, sans impact car ils ne servent qu'à une moyenne).
    Les sauvegardes existantes gardent un éventuel champ `attrs.mental`
    orphelin (jamais lu/écrit par le moteur désormais) — inoffensif.
  - Commentaires nettoyés : le grand commentaire au-dessus d'ATTRS/
    PHYSICAL_ATTRS explique le retrait et pointe vers `mentalAverage()`, la
    section "MENTAL (9, ...)" est devenue "(8, ...)", POSITION_ATTR_PROFILE
    et ATTR_SHORT (moteurbasket3.html) ne mentionnent plus "mental" dans
    leurs énumérations/libellés courts.
  - **Écart trouvé par rapport au plan initial** : le plan pensait
    `TACTICAL_ATTRS` (moteurbasket3.html, utilisé par l'onglet "Profils" de
    la fiche joueur — quelles tactiques conviennent le mieux à ce joueur)
    sans aucune entrée "mental" — FAUX, il en avait bien une. Deux bugs
    potentiels corrigés à la volée : (1) `tacticalFitScore` lisait
    `attrs["mental"]` directement (objet attrs brut, pas un joueur complet,
    donc `mentalAverage()` inutilisable tel quel) → cas particulier ajouté
    qui recalcule la moyenne des `MENTAL_ATTRS` directement depuis `attrs`
    quand la clé vaut "mental" ; (2) le verrou de scoutisme des "Profils"
    (`TACTICAL_ATTRS.every(a => visibleAttrsSet.has(a))`) aurait été fermé à
    vie pour tout le monde, `visibleAttrsSet` étant calculé sur ATTRS qui ne
    contient plus jamais "mental" → cas particulier ajouté exigeant que les
    8 `MENTAL_ATTRS` soient révélés avant de considérer "mental" comme
    visible. Repéré en auditant TOUTES les occurrences de "mental" restantes
    après les remplacements du plan (`grep` exhaustif), pas par le plan
    lui-même — d'où l'intérêt de ce grep final systématique.
  - Vérifié sans changement nécessaire : `TRAINING_SYNERGY`/
    `POSITION_ATTR_PROFILE` (logique fonctionnelle) n'avaient aucune entrée
    "mental" ; les boucles `mentalPotential`/progression naturelle
    (`mentalGrowthFactorForAge`), `overall()`, `generateAttrsForPosition`,
    `weightedRatingForPosition` itèrent déjà génériquement sur `ATTRS`/
    `MENTAL_ATTRS`, donc se sont ajustées automatiquement à 28/8 entrées
    sans code à toucher.
- **Tests mis à jour** :
  - `thirteen_attrs_test.js` : `overall()` attendu sur les 28 caractéristiques
    (retiré "mental" de l'objet `values`) ; migration testée sur
    endurance/freeThrow seulement (plus de `delete p.attrs.mental`, plus
    jamais généré) ; les 2 tests de formule clutch/tilt fixent désormais les
    8 `MENTAL_ATTRS` à la même valeur (au lieu de `p.attrs.mental` en dur)
    pour obtenir `mentalAverage(p) === mentalValue` exactement ; l'assertion
    finale vérifie maintenant que "Mental" n'apparaît PLUS comme ligne
    individuelle sur la fiche joueur (`.pdp-attr-grid .lbl`), tout en gardant
    Endurance/Lancer franc.
  - `transfer_request_test.js` : `testMentalAttributeShiftsSuccessChance`
    fixe désormais les 8 `MENTAL_ATTRS` à la même valeur plutôt que
    `p.attrs.mental` directement.
  - `salary_test.js` : retiré les 4 occurrences orphelines `mental: 50,` des
    fixtures d'attrs construites à la main (n'étaient plus lues par
    `weightedRatingForPosition`/`overall()`, mais autant nettoyer).
  - `training_progression_test.js`/`synergy_training_test.js`/
    `tactical_knowledge_test.js` : aucune référence à `attrs.mental` ni à un
    total de 29 caractéristiques trouvée, aucun changement nécessaire.
- **Tests** : suite complète (84 fichiers) exécutée par lots de ≤8 en
  parallèle (voir la note plus bas sur la flakiness attendue sous charge
  parallèle) — tout vert. 3 échecs observés en parallèle
  (`end_to_end_test.js`, `player_detail_test.js`, `training_progression_test.js`)
  confirmés comme la flakiness déjà documentée (timers/minutes jouées
  aléatoires), tous verts en re-run individuel, aucun lien avec ce
  changement.
- **État Git côté Mac** : pas encore déployé sur le Mac à ce stade (prochaine
  étape) ni committé/poussé.

---

### 2026-09-23 — pas encore commité — 4 correctifs fiche joueur + tri effectif adverse
- **Plus de couleurs sur les pastilles/note globale** ("on a plus du tout les
  couleurs sur les carac et la note globale") : le palier "lo" (< 45)
  utilisait `var(--ink-faint)` (gris très sourd, quasi invisible sur fond
  sombre) au lieu d'une vraie couleur — contrairement à `attrCellHtml`
  (Effectif/Marché) où la mini-barre (déjà colorée en rouge pour "lo") porte
  le signal visuel pendant que le texte reste discret ; sur la fiche joueur,
  la pastille EST le seul signal. Corrigé : `.pdp-pill.attr-lo`/
  `.pdp-overall-num.attr-lo` passent à `var(--danger)` (rouge), comme
  "good"/"elite" ont déjà leur propre couleur.
- **Texte "Mise en vente" trop gros** ("il est plus grand que le titre MISE
  EN VENTE") : `<p class="sub">` (estimation par ventes comparables) n'avait
  ici AUCUNE règle CSS scopée `.pdp-card .sub` (contrairement à CHAQUE
  autre usage de "sub" dans ce fichier, toujours scopé à son conteneur) et
  retombait donc sur la taille par défaut d'un `<p>`. Ajouté
  `.pdp-card .sub{font-size:12px;color:var(--ink-dim);}`.
- **Grand vide à gauche ET à droite de la fiche joueur** ("pourquoi c'est
  aussi serré ? [...] gros trou [...] à gauche [...] à droite il y a aussi
  de la perte de place") — PAS un bug du schéma de terrain (vérifié
  identique au fichier de référence), le vrai coupable :
  `playerDetailSection` était dans `NARROW_PAGE_IDS` (gabarit plafonné à
  700px, voir `.wrap-narrow`), réglage hérité de l'ANCIEN format à plat
  (chips + grille plafonnée à 420px, où 700px avait justement été choisi
  pour éviter un vide à DROITE). La refonte "pdp-card" (grille 280px+1fr,
  elle-même avec un bloc à 3 colonnes Fondamentaux/Physique/Mental à
  droite) est maintenant aussi dense que l'Effectif — 700px la comprimait
  des deux côtés. Corrigé : `playerDetailSection` déplacée de
  `NARROW_PAGE_IDS` vers `WIDE_PAGE_IDS` (comme Effectif/Coupe/Ordres, voir
  showPage/.wrap-wide). `NARROW_PAGE_IDS` est désormais vide (conservé pour
  un futur besoin).
- **Effectif d'une équipe adverse non triable** ("il faut aussi pouvoir
  trier sur la page effectif de qqun", juste après le correctif du tri sur
  SON PROPRE Effectif) : `teamDetailEffectifHtml` avait le même défaut
  (`<th>` bruts, aucun `data-sort`). Corrigé en réutilisant le même schéma
  que `rosterHeaderCellHtml`/`rosterSortState` (nouvel état dédié
  `teamDetailEffectifSortState`, écouteur délégué sur `[data-team-sort]`
  dans `#teamDetailContent`) — MAIS avec un garde-fou spécifique au
  scoutisme : une colonne de caractéristique n'est triable QUE si sa valeur
  est déjà révélée pour CETTE équipe précise (`teamDetailSortAllowed`),
  jamais pour un adversaire non scouté (trier révèle un ORDRE, donc de
  l'information sur des valeurs censées rester cachées) ; et si un tri
  choisi sur une équipe où la colonne était révélée reste actif en
  changeant d'équipe où elle ne l'est plus, repli automatique sur le tri
  par défaut (poste + note globale) plutôt que de trier silencieusement sur
  la vraie valeur cachée.
- **Testé** : `player_detail_test.js` étendu (vérifie `wrap-wide` sur la
  fiche joueur) ; nouveau `team_detail_effectif_sort_test.js` (colonnes
  triables sur sa propre équipe, verrouillées pour un adversaire non
  scouté, garde-fou anti-fuite en changeant d'équipe). Suite complète
  (84/84, avec ce nouveau fichier) confirmée verte en sandbox.
- **Pas encore déployé sur le Mac** au moment de l'écriture de cette
  entrée — en cours.

### 2026-09-23 — pas encore commité — Effectif > Caractéristiques : colonnes triables
- Signalé (2 captures d'écran, onglet Effectif > sous-onglet Caractéristiques,
  équipe "Gotham Knights") : "les colonnes ne peuvent de nouveau plus être
  triées".
- **Cause** : ce sous-onglet (`renderEffectifSection()`, branche
  `effectifSubView === "caracteristiques"`, colonnes MI-D/3PTS/INT/PASSE/
  REB/CTR/DRIB/DEF EXT/DEF INT/LF/PÉN/CRÉA/INTC/PHYSIQUE/MENTAL) était
  rendu avec des `<th>` bruts, aucun `data-sort` — jamais câblé pour le tri
  dans le code actuel, contrairement au sous-onglet "Général" qui, lui,
  utilise déjà `ROSTER_SORT_COLUMNS`/`rosterHeaderCellHtml`/
  `rosterSortState`/`rosterSortValue` + l'écouteur délégué sur
  `th[data-sort]` (déjà présent sur `#rosterContent`, fonctionne quel que
  soit le sous-onglet affiché — il ne manquait que des en-têtes
  cliquables).
- **Corrigé** en réutilisant EXACTEMENT ce même mécanisme plutôt que d'en
  inventer un second : en-têtes remplacés par `rosterHeaderCellHtml(key,
  label)` pour Nom/Poste/Taille/Salaire + chaque caractéristique de
  `FUNDAMENTAL_ATTRS` (clé = la caractéristique elle-même, déjà supportée
  par la branche `default: return p.attrs[key]` de `rosterSortValue`) ;
  deux nouvelles clés `"physicalAvg"`/`"mentalAvg"` ajoutées à
  `rosterSortValue` pour les colonnes moyennées Physique/Mental (même
  calcul arrondi que `categoryAverageCellHtml`, pour trier exactement sur
  la valeur affichée à l'écran). `sorted` (déjà calculé en tête de
  `renderEffectifSection` à partir de `rosterSortState`) alimentait déjà
  cette table correctement — seules les en-têtes cliquables manquaient.
- `teamDetailEffectifHtml` (effectif d'une équipe ADVERSE) a le même défaut
  mais n'est pas ce que l'utilisateur a signalé — laissé de côté
  volontairement, voir l'entrée "En cours" plus haut.
- **Testé** : nouveau fichier `effectif_caracteristiques_sort_test.js` —
  vérifie que les 19 colonnes sont bien `data-sort`, que le tri sur une
  caractéristique brute (MI-D) et sur les deux moyennes (Physique/Mental)
  fonctionne dans les deux sens (1er clic = plus fort au moins fort,
  re-clic = inverse), que la colonne Nom trie alphabétiquement, et que le
  sous-onglet "Général" n'a pas régressé. Suite complète (83/83, avec ce
  nouveau fichier) confirmée verte en sandbox.
- **Pas encore déployé sur le Mac, pas encore commité.**

### 2026-09-23 — pas encore commité — Fiche joueur : refonte "pdp-card"
- Reprend le chantier laissé "À FAIRE" ci-dessus lors de la session
  précédente ("je n'ai tjrs pas les bonnes fiches joueurs" / "passe aux
  fiches joueurs stp") : port complet de `renderPlayerDetail` depuis le
  fichier de référence `moteurbasket3-1.html` (déjà entièrement dessiné
  là-bas) vers le jeu réel — remplace l'ancien tableau brut de 29
  caractéristiques par une mise en page en cartes (`.pdp-grid` 2 colonnes,
  `.pdp-card`, note globale + étoiles, terrain avec poste mis en évidence,
  `.pdp-attr-grid` 3 blocs Fondamentaux/Physique/Mental, statut
  Condition/Statistiques/Records, radar de profil, 5 derniers matchs).
- **Porté verbatim** (fonctions autonomes, aucune incompatibilité) :
  `comparableSalesValuation` (estimation par ventes comparables sur 60
  jours), `matchResultForLogEntry`, `RADAR_AXES`/`playerRadarCategories`/
  `radarChartSvg`.
- **Adapté** (mécanismes différents entre le fichier de référence et le
  jeu réel) :
  - Scoutisme : la référence utilise un système de fourchettes
    (`scoutingInfo`/marge) — remplacé partout par le mécanisme RÉEL du jeu
    (révélation binaire tout-ou-rien par caractéristique via
    `teamA.scoutedAttrs`), pas de variante `.range`.
  - Paliers de couleur : nouvel helper `pdpPillTier` réutilisant les MÊMES
    seuils que `attrCellHtml` (attr-lo/mid/good/elite) plutôt que la
    palette incompatible de la référence (rouge/orange/blanc/vert) — pour
    garder une palette cohérente entre Effectif/Marché/fiche joueur.
  - Confidentialité de l'enchérisseur : contrairement à la référence
    (affiche l'identité via `teamLinkHtml`), la carte "Mise en vente"
    reprend la règle déjà en place ailleurs dans le jeu (montant SEUL,
    jamais le nom de l'équipe enchérisseuse — règle explicite déjà en
    place sur le marché des transferts).
- **Volontairement pas repris cette fois** : `player.nationality` (champ
  inexistant côté jeu réel — ligne Nationalité simplement omise, pas
  affichée en "?"). `player.lastAttrTrend` (champ inexistant — la flèche de
  tendance reste dans le code, lit le champ de façon défensive exactement
  comme la référence, affiche juste "·" (stable) en permanence tant qu'un
  futur suivi de tendance n'existe pas — dégradation propre, pas bloquant).
- **Testé** : `player_detail_test.js` et `thirteen_attrs_test.js` mis à
  jour (sélecteurs `.attr-cell`/`.player-attr-grid` remplacés par
  `.pdp-pill`/`.pdp-attr-grid`, markup intentionnellement changé). Suite
  complète (82/82 fichiers de tests) confirmée verte en sandbox — 5 échecs
  observés lors d'un premier passage à forte parallélisation
  (`end_to_end_test.js`, `persistence_test.js`, `promotion_test.js`,
  `visibility_refresh_test.js`, `training_progression_test.js`) tous
  confirmés être de la contention de ressources (trop de serveurs de test
  locaux lancés en même temps → `ECONNRESET`/minuteurs qui ratent leur
  fenêtre), pas des régressions : tous passent individuellement en série.
- **Déployé sur le Mac, 82/82 tests verts là-bas aussi** (un échec isolé de
  `player_detail_test.js` au premier passage sur le Mac — MVP tiré sans
  matchLog complet à 3 journées, flakiness déjà documentée ci-dessous —
  confirmé transitoire en le relançant seul : vert). **Reste à commiter et
  pousser** (toujours depuis le terminal Mac de l'utilisateur).

### 2026-09-23 — commit `831a99c` — Entraînements combo + correctif définitif uid()
- **Entraînements combo** : 3 programmes composites portés depuis le fichier
  de référence (`moteurbasket3-1.html`) vers le jeu réel — `creativeScoring`
  ("Scoreur créatif" : Création de tir + Dribble), `perimeterDefense`
  ("Défense de périmètre" : Interceptions + Défense extérieure),
  `rimAttack` ("Attaque du cercle" : Pénétration + Lancer franc). Bonus
  cohérence : `quickShots` ("Tirs rapides") retrouve son 4e ingrédient
  "dribble" (à la place de l'ancien "agility", devenu Physique).
- **Bug staff "Cette enchère est déjà terminée" — cause RACINE corrigée**
  (signalé à nouveau 2026-09-23 : "ce probleme là n'est tjrs pas résolu non
  plus", malgré `dd27f48` qui n'avait traité qu'une partie du problème).
  Vraie cause : `uid()` (engine.js, `let __uid = 1`) est un compteur GLOBAL
  AU PROCESS, jamais persisté — il repart de 1 à CHAQUE redémarrage du
  process serveur (donc à chaque déploiement Render, pas seulement à chaque
  rechargement de page navigateur, le seul cas que `dd27f48` couvrait). Si
  le marché doit se réapprovisionner juste après un redémarrage, les
  nouveaux id (1, 2, 3...) peuvent entrer en collision avec ceux, bien plus
  élevés, déjà utilisés par d'anciennes entités de la ligue —
  `Array.prototype.find` renvoie alors la mauvaise entité (souvent une
  annonce déjà fermée), même si l'annonce affichée à l'écran (temps restant
  positif) est la bonne. Corrigé via `Engine.reseedUidFromSave(data)`
  (nouvelles fonctions `scanMaxId`/`bumpUidFloor`/`reseedUidFromSave`,
  miroir exact `engine.js`/`moteurbasket3.html`) : relit toute sauvegarde
  chargée pour relever le plancher de `uid()` au-dessus du plus grand id
  déjà utilisé, AVANT toute reconstruction d'objets. Câblé dans
  `server/store.js` (`deserialize`/`deserializeMultiLeague`, solo et ligue
  partagée) et `moteurbasket3.html` (`loadMyTeam()`).
- **Testé** : nouveau test `uid_reseed_after_restart_test.js` — reproduit un
  VRAI redémarrage de process serveur (deux process Node distincts,
  communiquant par un vrai fichier de sauvegarde) ; confirmé qu'il échoue
  sans le correctif et passe avec.
- **Committé et poussé** (`831a99c`, confirmé par l'utilisateur — push
  réussi après un fichier `.git/index.lock` périmé supprimé côté Mac).
  82/82 tests verts en sandbox ET sur le Mac avant le commit.
- **Confirmé résolu en production** (2026-09-23) : déploiement Render
  effectif (entraînements combo visibles en jeu), et après un rechargement
  complet de la page (Cmd+Maj+R — un premier test sur un onglet resté ouvert
  depuis avant le déploiement avait encore montré le bug, simple cache
  navigateur de l'ancien JS, pas une régression du correctif), "c'est bon ça
  marche" côté Staff.

### 2026-09-23 — commit `bd33907` — Entraînement des fondamentaux + avatars/arène
- Demande initiale : "on ne dit plus entrainement individuel mais
  entrainement des fondamentaux [...] et ça ne doit entrainer que les
  fondamentaux".
- Clarification obtenue : "le physique ne bouge qu'un peu au cours de la
  carrière du joueur, alors que le mental peut bien évoluer et progresse
  durant toute la carrière du joueur" — Fondamentaux (13, entraînables),
  Physique (7, évolue à peine seul), Mental (9, progresse en continu, jamais
  de déclin).
- **Committé et poussé** (`bd33907`, confirmé via `git log` côté Mac) —
  regroupé avec le port avatars/arène (voir ci-dessous).

### 2026-09-22 — Reset onboarding tour "Skyzer10" (production)
- Bug Discord : joueur bloqué hors du tutoriel après un aller-retour, plus
  d'accès au bouton "Lancer le tutoriel".
- Route déjà existante utilisée : `POST /api/admin/reset-onboarding-tour`
  (`server/index.js`, header `X-Admin-Token`).
- **Confirmé résolu en production** : reset effectué sur l'équipe "Cerberus
  Basketball Team" → `{"ok":true,"onboardingTourCompleted":false}`.
- Pas de changement de code nécessaire (route déjà en place).

### Avatars / Arène / Mental-Physique 2-colonnes
- Port terminé (AvatarGen, ArenaGen, affichage moyenné Physique/Mental sur
  les tableaux Effectif) — **committé avec `bd33907` ci-dessus**.

---

## État Git côté Mac (dernier point de contrôle connu — 2026-09-23)

Dernier commit poussé : `831a99c` (voir Historique ci-dessus). Rien en
attente actuellement.

Rappel permanent : **le push reste toujours fait par l'utilisateur depuis
son propre terminal Mac authentifié** — Claude ne pousse jamais lui-même (le
shell `device_bash` n'a pas les identifiants GitHub).

Rappel technique (vécu deux fois ce 2026-09-23, une fois côté pont
`device_bash`, une fois pour de vrai sur le Mac) : un fichier
`.git/index.lock` périmé bloque `git` avec "Another git process seems to be
running" — si aucun autre `git` ne tourne réellement, `rm -f
.git/index.lock` puis relancer la commande suffit.

---

## Tests connus flaky (pas des régressions, sûrs à ignorer sur un seul échec)
- `league_stats_test.js`
- `training_progression_test.js` (rare, simulation de match aléatoire)
- `player_detail_test.js` (rare, dépend du MVP tiré aléatoirement après
  quelques journées simulées)
- `thirteen_attrs_test.js`, `disciplinary_ejection_test.js` (ajoutés
  2026-09-23, observés en échec une fois chacun lors d'un passage complet de
  la suite en série (~100 fichiers), verts au re-run individuel juste après
  — cause exacte pas creusée, mais confirmés sans lien avec les
  changements de cette session (box score en direct/fiche joueur/temps
  mort), qui ne touchent ni l'un ni l'autre de ces mécanismes).

Si un de ces tests échoue seul, le relancer une fois avant de creuser.

## À investiguer (repéré en passant, pas encore creusé, pas causé par cette session)
- **`ordres_validate_without_edit_test.js` échoue de façon RÉPÉTABLE** (pas
  flaky — 2 lancements de suite, même échec précis à chaque fois) :
  ```
  LIGUE PARTAGÉE - hasPlanForRound(1) juste après validation (sans édition
  préalable) : false
  ❌ BUG NON CORRIGÉ (ligue partagée) : valider sans avoir rien modifié
  devrait quand même enregistrer le plan localement, tout de suite, sans
  attendre un rechargement.
  ```
  (la partie "SOLO" du même test, elle, passe.) Repéré en lançant la suite
  complète pendant la session "box score en direct" (2026-09-23), sans
  aucun rapport avec les Ordres/la validation de plan — aucun fichier touché
  par cette session ne concerne ce mécanisme. Semble documenter un bug de
  longue date déjà connu du code (le message "BUG NON CORRIGÉ" suggère un
  test-TODO existant, pas une régression fraîche) — pas encore confirmé côté
  historique Git faute d'accès au dépôt complet depuis la sandbox. À
  signaler à l'utilisateur/à creuser lors d'une prochaine session dédiée aux
  Ordres, pas traité ici (hors périmètre de ce qui a été demandé).

**Lancer la suite complète en parallèle avec trop de jobs à la fois est une
source de faux échecs** (constaté 2026-09-23, ~15 tests lancés en parallèle
d'un coup) : `end_to_end_test.js`/`visibility_refresh_test.js` (minuteurs
réels qui ratent leur fenêtre sous charge CPU) et
`persistence_test.js`/`promotion_test.js` (`ECONNRESET` sur les serveurs de
test HTTP locaux, trop de connexions simultanées). Tous passent
individuellement. Limiter à ~8 jobs en parallèle max, et en cas d'échec sur
un de ces 4 fichiers précisément, le relancer seul avant de conclure à une
régression.
