# Production audio du direct : suivi

Méthode : un son à la fois (3 pistes au plus, validation, intégration,
vérification). Licences : `AUDIO_LICENSES.md`. Moteur : `assets/live/sfx.js`
(clés du manifeste `assets/audio/sfx/manifest.json` ; sans fichier, la
synthèse prend le relais). Accès réseau de l'environnement : freesound.org /
cdn.freesound.org autorisés (pixabay.com refusé : 403).

## Fait
- [x] A. Brouhaha permanent → `amb_bed.mp3` (Freesound 635492, kyles, CC0) — 2026-10-10
- [x] D. Clameur après un panier à domicile → `amb_cheer_1..3.mp3` + `amb_cheer_big.mp3`
  (Freesound 678544, mglennsound, CC0) — 2026-10-10. Joue aussi, plus bas, sur un
  tir ou lancer adverse manqué et une interception à domicile.
- [x] C. Chant « Defense! Defense! » → `amb_chant_1..2.mp3` (fichier fourni, match Miami
  Heat 2022, **sans licence vérifiée**, utilisé sur décision du propriétaire — à remplacer
  par un chant sous licence à terme) — 2026-10-10
- [x] D/E. Déception → `amb_groan_1..3.mp3` + `amb_groan_big.mp3` (Freesound 829452,
  stade FC St. Pauli, CC0) — 2026-10-10 : panier adverse (grand « ohhh » sur 3 pts ou
  fin serrée), tir manqué et lancer franc manqué à domicile
- [x] A/E. Applaudissements → `amb_applause_1..4.mp3` + `amb_applause_big.mp3` (Freesound
  706732, Rogers Arena, CC0) — 2026-10-10 : lancer franc réussi à domicile, temps mort,
  fin de quart-temps (version longue)
- [x] E. Huées sur lancer franc adverse → `amb_boo.mp3` (Freesound 678537, mglennsound, CC0,
  fichier original fourni ; 8 couches empilées pour une plus grande salle) — 2026-10-10
- [x] B. Encouragements en attaque → `amb_offense.mp3` (Freesound 637468, kyles, CC0) — 2026-10-10
- [x] A. Salle calme → `amb_bed_calm.mp3` (Freesound 360703, eguobyte, CC0) ; salle en
  ébullition (fin de match serrée) → `amb_bed_hot.mp3` (Freesound 629884, kyles, CC0, empilé)
  — 2026-10-10


## Pistes refusées
- Chant défensif : LS 11537 (CC-BY), craigsmith 438396 (CC0), johnnyguitar01 424793
  (CC0) refusés à l'écoute (2026-10-10)
- Déception : ShangusBurger 763880 et mrrap4food 619007 (CC0) non retenus (2026-10-10)
- Applaudissements : mglennsound 678543 et craigsmith 480692 (CC0) non retenus (2026-10-10)
- Freesound 412160 « Fans at Basketball Game » (phillyfan972) : speaker,
  creux de bruit, applaudissements → pas un fond continu (refusée 2026-10-10)

## Priorité 1 — Indispensable (prochains)
- [ ] B. « Let's go [équipe] ! » scandé (aucune source libre trouvée pour l'instant)

## Priorité 2 — Immersion
- [x] Contestation arbitrale : faute sifflée contre le domicile → `amb_jeer_1..3` (extraits
  de `amb_boo`), plus fort sur technique / antisportive — 2026-10-10
- [x] Contre du domicile → grande clameur ; contre-attaque conclue → grand moment ;
  interception → clameur (sons existants) — 2026-10-10
- [x] Montée à l'approche des 24 s (défense, ≤ 6 s) — 2026-10-10
- [x] « Ooooh ! » d'émerveillement → `amb_wow_1..3` (324890 + IENBA 488472, superposés) :
  contre du domicile, puis clameur — 2026-10-10
- [x] Public qui retient son souffle → `amb_gasp` (HowardV 264376) : tir décisif imminent,
  blessure — 2026-10-10
- [x] Huées contre le meilleur marqueur adverse (≥ 20 pts) quand il va tirer ; dernière
  possession défensive serrée : salle debout (tension) — 2026-10-10
- [ ] Dunk / alley-oop : le moteur ne les distingue pas (types : three, jumper, fastbreak,
  layup, post, floater)
- [ ] Variantes faible / moyenne / forte / exceptionnelle des réactions fréquentes

## Priorité 3 — Finition
- [ ] Présentation des joueurs, entrée des équipes, speaker, mi-temps / reprise
- [x] Victoire à domicile / défaite au coup de sifflet final (sons existants) — 2026-10-10
- [ ] Shows (pom-pom girls, mascotte, lancer de t-shirts) : musiques fournies, sons de foule à ajouter
- [ ] Événements rares : blessure, expulsion, antisportive, remontée, playoffs, titre
