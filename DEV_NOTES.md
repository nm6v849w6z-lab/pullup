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

### Entraînement des fondamentaux (asymétrie Fondamentaux/Physique/Mental)
- Statut : **terminé et testé (95/95, sandbox + Mac), prêt à committer**,
  pas encore committé sur le Mac.
- Demande initiale : "on ne dit plus entrainement individuel mais
  entrainement des fondamentaux [...] et ça ne doit entrainer que les
  fondamentaux".
- Clarification obtenue : "le physique ne bouge qu'un peu au cours de la
  carrière du joueur, alors que le mental peut bien évoluer et progresse
  durant toute la carrière du joueur".
- Fichiers modifiés (sandbox ET Mac, identiques) : `engine.js`,
  `moteurbasket3.html`, `client_scouting_test.js`,
  `training_progression_test.js`.
- Reste à faire : rien côté code — juste committer + pousser depuis le Mac
  (voir section Git ci-dessous).

### Bug page Staff (enchère entraîneur) — À INVESTIGUER
- Signalé par capture d'écran (2026-09-22) : page Staff affiche "Cette
  enchère est déjà terminée" alors que "Temps restant" indique encore
  "9h 4min" et que le bouton "Enchérir" reste actif — incohérence visible.
- Pas encore regardé, pas de contexte dans les sessions précédentes.
- **Prochaine étape** : ouvrir `renderStaffSection`/logique d'enchère
  entraîneur dans `moteurbasket3.html` + `server/actions.js` côté enchères,
  comprendre pourquoi l'état "terminée" et le minuteur divergent.

---

## Historique (terminé, committé ou en attente de commit)

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
  les tableaux Effectif), déployé sur le Mac, tests majoritairement
  vérifiés (un test flaky connu, `league_stats_test.js`, sans rapport avec
  ce port).
- **Statut Git** : modifications présentes sur le Mac mais **jamais
  committées** — à committer en même temps que l'entraînement des
  fondamentaux (mêmes fichiers : `moteurbasket3.html`,
  `client_scouting_test.js`).

---

## État Git côté Mac (dernier point de contrôle connu)

```
 M client_scouting_test.js
 M engine.js
 M moteurbasket3.html
 M training_progression_test.js
```

Tout est testé et vert (95/95). Rappel permanent : **le push reste toujours
fait par l'utilisateur depuis son propre terminal Mac authentifié** — Claude
ne pousse jamais lui-même (le shell `device_bash` n'a pas les identifiants
GitHub).

---

## Tests connus flaky (pas des régressions, sûrs à ignorer sur un seul échec)
- `league_stats_test.js`
- `training_progression_test.js` (rare, simulation de match aléatoire)
- `player_detail_test.js` (rare, dépend du MVP tiré aléatoirement après
  quelques journées simulées)

Si un de ces tests échoue seul, le relancer une fois avant de creuser.
