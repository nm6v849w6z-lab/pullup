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

### Bug staff "Cette enchère est déjà terminée" — cause RACINE trouvée et corrigée
- Signalé à nouveau (2026-09-23, capture d'écran page Staff·entraîneur) :
  "ce probleme là n'est tjrs pas résolu non plus" — le bug persistait malgré
  le commit `dd27f48` ("déjà corrigé"), preuve que ce commit n'avait traité
  qu'UNE partie du problème.
- **Vraie cause racine trouvée** : `uid()` (engine.js, `let __uid = 1`) est
  un compteur GLOBAL AU PROCESS, jamais persisté. Il repart de 1 à chaque
  redémarrage du **process serveur** (donc à CHAQUE déploiement Render — pas
  seulement à chaque rechargement de page navigateur, le seul cas que
  `dd27f48` avait couvert en désactivant la génération LOCALE côté
  navigateur en ligue partagée). Si le marché (transferts/entraîneurs/
  analystes/recruteurs) doit se réapprovisionner juste après un redémarrage
  serveur, les nouveaux id générés (1, 2, 3...) peuvent entrer en collision
  avec ceux, bien plus élevés, déjà utilisés par d'anciennes entités
  (joueurs, annonces déjà closes...) de la ligue — `Array.prototype.find(l
  => l.id === listingId)` renvoie alors la MAUVAISE entité (souvent une
  annonce déjà fermée), même si l'annonce affichée à l'écran (filtrée sur
  "open", temps restant bien positif) est la bonne.
- **Corrigé** : `Engine.reseedUidFromSave(data)` — relit tout objet de
  sauvegarde brut à CHAQUE chargement (recherche générique du plus grand
  champ numérique `id`, où qu'il soit niché) et relève le plancher de
  `__uid` en conséquence, AVANT toute reconstruction d'objets. Câblé :
  - `server/store.js` : `deserialize`/`deserializeMultiLeague` (chemin
    serveur, solo ET ligue partagée).
  - `moteurbasket3.html` : `loadMyTeam()` (miroir côté navigateur, pour le
    solo qui génère lui aussi des candidats localement).
  - Fonctions ajoutées en miroir exact dans `engine.js` ET
    `moteurbasket3.html` : `scanMaxId`, `bumpUidFloor`, `reseedUidFromSave`.
- **Testé** : nouveau test `uid_reseed_after_restart_test.js` — reproduit un
  VRAI redémarrage de process serveur (deux process Node distincts via
  `child_process.execFileSync`, communiquant par un vrai fichier de
  sauvegarde) et vérifie qu'un nouveau candidat entraîneur généré juste
  après ce redémarrage reçoit un id strictement supérieur au plus haut déjà
  présent dans la ligue. Confirmé : échoue bien SANS le correctif (id
  colle en dessous du plancher), passe AVEC. 82/82 tests verts (sandbox).
- **Statut** : terminé et testé (sandbox), **pas encore déployé sur le
  Mac/production** — voir section Git ci-dessous, à committer avec les
  entraînements combo.
- Fichiers modifiés : `engine.js`, `moteurbasket3.html`, `server/store.js`,
  `uid_reseed_after_restart_test.js` (nouveau).

### Entraînements combo — commit PAS PASSÉ la première fois, à refaire (avec uid() ci-dessus)
- Statut : **terminé et testé (sandbox), pas encore committé sur le Mac**.
- Signalé (2026-09-23) : "j'ai mis ta commande et c'est tjrs pas à jour les
  entrainements" — vérification sur le Mac (`git log`/`git status`) :
  **la commande donnée précédemment n'a jamais réellement committé.**
  `git log` s'arrête à `bd33907` (l'entraînement des fondamentaux, déjà
  committé — voir Historique), et `git status` montre encore
  `DEV_NOTES.md`, `engine.js`, `moteurbasket3.html` en `modified` (non
  indexés). Rien n'a donc été poussé, cause probable : mauvais dossier ou
  copier-coller incomplet dans le terminal — pas un bug côté jeu.
- **À committer maintenant** (regroupe les entraînements combo ET le
  correctif uid() ci-dessus, tous deux prêts) : voir la commande à la fin de
  cette section (§ État Git côté Mac).
- Demande (2026-09-23) : "et il manque les nouveaux entrainements combo" —
  3 programmes déjà conçus dans le fichier de référence
  (`moteurbasket3-1.html`) mais jamais portés dans le jeu réel :
  - `creativeScoring` ("Scoreur créatif" : Création de tir + Dribble)
  - `perimeterDefense` ("Défense de périmètre" : Interceptions + Défense
    extérieure)
  - `rimAttack` ("Attaque du cercle" : Pénétration + Lancer franc)
- Bonus cohérence : `quickShots` ("Tirs rapides") retrouve son 4e
  ingrédient — "dribble" à la place de l'ancien "agility" (retiré plus tôt
  cette session car devenu Physique) — pour matcher exactement la version
  de référence.
- Fichiers modifiés : `engine.js`, `moteurbasket3.html` (TRAINING_PROGRAMS
  dans les deux, aucun code de rendu UI à changer — le sélecteur est
  générique).

### Fiche joueur (page détail) — pas la bonne version, À FAIRE
- Signalé (2026-09-23, capture d'écran "Adama Kovac") : "je n'ai tjrs pas
  les bonnes fiches joueurs" — la fiche joueur en ligne affiche encore
  l'ancien format brut (29 attributs listés un par un en 2 colonnes, avatar
  simplement ajouté en haut) au lieu de la refonte "pdp-card" déjà dessinée
  dans le fichier de référence `moteurbasket3-1.html` (grille
  `.pdp-attr-grid` à 3 colonnes, pastilles `.pdp-pill` à 4 paliers de
  couleur, tendance `.pdp-trend`, etc. — repérée mais volontairement PAS
  portée lors du travail précédent sur les avatars, faute de temps : "adapté
  puisque la mise en page réelle diffère de la refonte 'pdp-card' de
  l'orphelin — utilisé un wrapper flex autour de la ligne
  '.training-intro' existante à la place").
- **Pas encore commencé.** Prochaine étape : lire en détail la structure
  JS de rendu de la fiche joueur dans `moteurbasket3-1.html` (chercher la
  fonction qui génère le HTML `.pdp-*`) et la comparer à
  `renderPlayerDetail` (ou équivalent) dans le fichier réel, pour porter la
  refonte complète (pas juste un rapiéçage) — même méthodologie que le port
  avatars/arène (copier, adapter aux données réelles, tester).

---

## Historique (terminé, committé ou en attente de commit)

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

Dernier commit poussé : `bd33907`. Depuis, en attente de commit (confirmé
via `git status` sur le Mac) :

```
 M DEV_NOTES.md
 M engine.js
 M moteurbasket3.html
```

Regroupe DEUX chantiers terminés et testés (82/82, sandbox) : les
entraînements combo ET le correctif uid()/"Cette enchère est déjà terminée".
Commande à lancer sur le Mac (`~/Documents/PullUp`) :

```
git add DEV_NOTES.md engine.js moteurbasket3.html server/store.js uid_reseed_after_restart_test.js
git commit -m "Entrainements combo + correctif definitif de l'id des annonces de marche apres redemarrage serveur"
git push
```

Rappel permanent : **le push reste toujours fait par l'utilisateur depuis
son propre terminal Mac authentifié** — Claude ne pousse jamais lui-même (le
shell `device_bash` n'a pas les identifiants GitHub). Après le push, un
redéploiement Render est nécessaire pour que le correctif atteigne la
production (auto-déploiement habituel sur push, à confirmer si le
comportement persiste après quelques minutes).

---

## Tests connus flaky (pas des régressions, sûrs à ignorer sur un seul échec)
- `league_stats_test.js`
- `training_progression_test.js` (rare, simulation de match aléatoire)
- `player_detail_test.js` (rare, dépend du MVP tiré aléatoirement après
  quelques journées simulées)

Si un de ces tests échoue seul, le relancer une fois avant de creuser.
