# Page « Match en direct » — refonte

Vue autonome en JavaScript natif (modules ES), sans dépendance. Elle s'intègre
dans n'importe quelle page : un conteneur vide, une feuille de style, un appel
à `update(state)` à chaque nouvelle donnée du match.

## Fichiers

| Fichier | Rôle | À livrer |
|---|---|---|
| `live-view.js` | Rendu complet de la page live | oui |
| `live.css` | Styles, tous scopés sous `.hm-live`, thème sombre uniquement | oui |
| `format.js` | Helpers (chrono, pourcentages, évaluation, élision `de()`) | oui |
| `demo-sim.js` | Simulateur de match pour tester la vue | non |
| `demo.html` | Page de démo (servir le dossier en HTTP, les modules ES ne marchent pas en `file://`) | non |

Tester la démo : `cd assets/live && python3 -m http.server 8000` puis ouvrir `http://localhost:8000/demo.html`.

## Intégration

Dans le jeu, c'est déjà branché : voir `hmLiveReset` / `hmLiveBuildState`
dans `moteurbasket3.html` (adaptateur qui traduit les événements du direct
dans le contrat ci-dessous). Si le module ne se charge pas, l'ancienne vue
reste affichée. Exemple d'intégration ailleurs :

```html
<link rel="stylesheet" href="/assets/live/live.css">
<div id="live"></div>
<script type="module">
  import { createLiveView } from "/assets/live/live-view.js";
  const view = createLiveView(document.getElementById("live"), {
    quarterLength: 600,               // secondes par quart-temps
    onShowHalftime: state => { /* ouvrir la vraie émission */ },
  });
  // à chaque tick / message du serveur :
  view.update(state);
</script>
```

La police Barlow est recommandée (Google Fonts) mais optionnelle : sans elle,
la vue retombe sur la police système.

`update()` peut être appelé aussi souvent que nécessaire. La vue détecte
toute seule les nouveautés en comparant les `id` : nouveaux paniers
(animation du score), nouveaux tirs (onde sur la carte), nouvelles actions
(surlignage, pastille « nouvelles actions » si l'utilisateur relit plus bas),
temps morts et fins de quart (bandeau en haut de l'écran).

Sans `onShowHalftime`, le bouton « Voir l'émission » ouvre un récapitulatif
intégré (meilleurs marqueurs, adresse, rebonds, pertes, plus gros écart).

## Contrat de données

```js
{
  status: "live" | "halftime" | "final",
  quarter: 2,                 // 1 à 4 (5+ pour les prolongations)
  clock: 163,                 // secondes restantes dans le quart
  possession: 0 | 1 | null,   // index de l'équipe en attaque
  halftimeResumeIn: 45,       // secondes avant la reprise, ou null

  teams: [                    // [0] = équipe qui attaque le panier de DROITE (domicile)
    {
      name: "Venomous", short: "VEN", score: 14,
      quarterScores: [11, 3, null, null],   // null = pas encore joué
      teamFouls: 3,                         // fautes d'équipe du quart en cours
      timeoutsLeft: 4, timeoutsTotal: 5,
      players: [{
        id, name, pos,                      // pos : "M", "AS", "A", "AF", "P"
        starter: true, onCourt: true,
        seconds: 1020,                      // temps de jeu en secondes
        pts, reb, ast, stl, blk, tov, pf,   // pf = fautes personnelles
        fg2m, fg2a, fg3m, fg3a, ftm, fta
      }]
    },
    { /* équipe [1], attaque le panier de GAUCHE */ }
  ],

  shots: [{
    id, team: 0 | 1, quarter, made: true,
    zone: "paint" | "mid" | "three",
    x: 81.4, y: 22.0          // en pieds : x 0→94 (gauche→droite), y 0→50 (haut→bas)
  }],

  events: [{
    id,                       // unique et stable
    team: 0 | 1 | null,       // null pour les séparateurs de période
    type: "made" | "miss" | "ft" | "foul" | "turnover" | "timeout" | "sub" | "period",
    quarter, clock,           // moment de l'action
    text: "Adama Diallo marque à 3 points, passe d'Hugo Garcia.",
    score: [14, 21] | null,   // score APRÈS l'action si elle a rapporté des points
    highlight: false,         // action marquante (exclusion, temps mort…)
    toast: "Temps mort Venomous"   // optionnel : texte court du bandeau
  }]
}
```

### Habillage du jeu (facultatif)

Ajouté le 2026-09-26 (« coller à l'esprit du jeu ») ; sans ces champs, la
vue retombe sur des initiales et des couleurs par défaut.

```js
{
  meta: { competition: "Championnat", round: "Journée 1/18", venue: "À domicile · 8 000 places" },
  courtLogo: "<g>…</g>",      // SVG du club qui reçoit, dessiné pour un cercle de rayon 52 centré en (470, 250)
  teams: [{
    color: "#d6473f",         // couleur de maillot ; éclaircie par la vue si trop sombre pour le fond
    logo: "<svg>…</svg>",     // écusson (HTML produit par le jeu, injecté tel quel)
    mine: true,               // mon club : badge « Mon club », feuille de match ouverte dessus
    players: [{
      avatar: "<span>…</span>",       // avatar SVG du jeu
      link: { team: 0, id: 12 },      // ouvre la fiche (attributs data-player-team / data-player-id)
    }]
  }]
}
```

La courbe d'écart, la série en cours (« Série 8-0 pour CBT ») et les totaux
d'équipe sont **calculés par la vue** à partir de `events[].score` et des
stats joueurs : rien à fournir en plus.

Si les coordonnées de tir du moteur sont dans un autre repère (pixels,
pourcentages, demi-terrain), il suffit de les convertir en pieds avant
`update()`.

## À corriger côté moteur (textes d'actions)

- Élision : « Tir manqué de Adama Diallo » → utiliser `de(nom)` de `format.js`
  pour obtenir « Tir manqué d'Adama Diallo ».
- Rebond du tireur : « Rayan Brooks manque son tir, Rayan Brooks suit et
  récupère » → « Rayan Brooks manque son tir, il reprend son propre rebond. »

## Entrée pour DEV_NOTES.md (section « En cours »)

```
### Refonte de l'affichage des matchs en direct
- Quoi : nouvelle vue live (tableau d'affichage + courbe d'écart, bandeau et
  bouton de mi-temps, carte des tirs filtrable, fil du match avec défilement
  soigné, face-à-face, feuille de match sans défilement horizontal).
- Pourquoi : « rendre l'affichage des lives plus sympa » (captures du 25/09),
  « faire un plus beau bouton » (mi-temps), pas de bouton d'accélération,
  thème sombre uniquement, pas de scroll sur la feuille de match.
- Fichiers : live/live-view.js, live/live.css, live/format.js
  (+ live/demo-sim.js, live/demo.html pour tester, non livrés).
- Statut : code prêt, démo testée en sandbox (desktop 1280, tablette 700,
  mobile 390, aucun débordement, aucune erreur console). Pas encore branché
  sur le vrai moteur.
- Reste à faire : adapter l'état du moteur au contrat (README), brancher
  view.update() sur le flux live, relier onShowHalftime à la vraie émission,
  corriger l'élision et le texte du rebond du tireur côté moteur, supprimer
  l'ancienne vue live, tester sur Mac, committer.
```
