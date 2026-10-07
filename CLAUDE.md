# Hoop Manager : règles permanentes du projet

## Règle UI mobile (globale, permanente, priorité élevée — 2026-10-07)

Sur téléphone (`@media (max-width: 768px), (max-height: 520px) and (pointer: coarse)`),
**aucun menu, panneau, modale, dropdown, sélecteur ou popup n'apparaît ni ne se
repositionne au milieu de l'écran.** Tout s'ancre **en bas** (bottom sheet) :

- `position: fixed; bottom: 0;` pleine largeur, coins arrondis en haut ;
- hauteur max 85–90 vh (`dvh`), défilement **interne**, le panneau lui-même ne
  bouge pas ;
- zone sûre respectée : `env(safe-area-inset-bottom)` ;
- jamais de centrage vertical, jamais de dropdown flottant au milieu de la
  page, jamais de modale classique centrée pour un menu ou une sélection.

Mise en œuvre (à réutiliser, ne pas recréer) : `assets/mobile/mobile.css`,
bloc « RÈGLE UI MOBILE ».
- Modale : toujours `.upgrade-confirm-overlay` + une boîte enfant
  (`.upgrade-confirm-box …`) → bottom sheet automatiquement.
- Menu / popover ancré à un bouton : ajouter la classe `.m-sheet` (ou étendre
  la liste du bloc) → bottom sheet sur mobile, comportement d'origine sur
  ordinateur.
- Suggestions d'un champ de recherche : dans le flux, sous le champ.

À chaque création ou modification d'interface : vérifier le rendu sur
téléphone (390×844) ; si un composant partagé est en cause, le corriger à la
source. Desktop / tablette large : comportement actuel conservé.

## Ordre d'affichage des caractéristiques (2026-10-07)

Partout où des caractéristiques de joueur sont affichées, un SEUL ordre :
`DISPLAY_FUNDAMENTALS` (mi-distance, 3 pts, intérieur, LF, passe, dribble,
création, pénétration, déf. extérieure, déf. intérieure, interceptions,
rebond, contre), puis `DISPLAY_PHYSICAL`, puis `DISPLAY_MENTAL`
(moteurbasket3.html, près d'`ATTRS` ; copie dans server/playerPage.js).
Ne jamais afficher dans l'ordre d'`ATTRS` / `PHYSICAL_ATTRS` /
`MENTAL_ATTRS` (réservés aux calculs).

## Autres repères

Voir `DEV_NOTES.md` (suivi de développement, repères techniques).
