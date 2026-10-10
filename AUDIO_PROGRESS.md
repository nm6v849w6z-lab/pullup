# Production audio du direct : suivi

Méthode : un son à la fois (3 pistes au plus, validation, intégration,
vérification). Licences : `AUDIO_LICENSES.md`. Moteur : `assets/live/sfx.js`
(clés du manifeste `assets/audio/sfx/manifest.json` ; sans fichier, la
synthèse prend le relais). Accès réseau de l'environnement : freesound.org /
cdn.freesound.org autorisés (pixabay.com refusé : 403).

## Fait
- [x] A. Brouhaha permanent → `amb_bed.mp3` (Freesound 635492, kyles, CC0) — 2026-10-10

## Retenu pour plus tard
- Freesound 678544 « AF Crowd Cheer LOOP » (mglennsound, CC0, 21 s, enregistré
  à un match de basket) : l'utilisateur le voit après un panier à domicile
  (`amb_cheer`) — à proposer au prochain tour.

## Pistes refusées
- Freesound 412160 « Fans at Basketball Game » (phillyfan972) : speaker,
  creux de bruit, applaudissements → pas un fond continu (refusée 2026-10-10)

## Priorité 1 — Indispensable (prochains)
- [ ] C. Chant « Defense! Defense! » → `amb_chant` (actuellement synthétisé)
- [ ] D. Clameur panier à domicile (2 pts / 3 pts, intensités) → `amb_cheer` (piste pressentie : 678544)
- [ ] D/E. Déception (panier adverse, tir ou lancer manqué à domicile) → `amb_groan`
- [ ] A/E. Applaudissements (lancer réussi, temps mort, fin de quart) → `amb_applause`
- [ ] E. Huées sur lancer franc adverse (boucle) → `amb_boo`
- [ ] B. Applaudissements rythmiques / « Let's go » en attaque
- [ ] A. Variantes de fond : salle calme, salle en ébullition

## Priorité 2 — Immersion
- [ ] Huées contre le porteur adverse, contestation arbitrale, grognements
- [ ] Interception, contre, dunk, alley-oop (réactions dédiées)
- [ ] Montée à l'approche des 24 s, dernière possession, public qui retient son souffle
- [ ] Variantes faible / moyenne / forte / exceptionnelle des réactions fréquentes

## Priorité 3 — Finition
- [ ] Présentation des joueurs, entrée des équipes, speaker, mi-temps / reprise
- [ ] Shows (pom-pom girls, mascotte, lancer de t-shirts), victoire à domicile
- [ ] Événements rares : blessure, expulsion, antisportive, remontée, playoffs, titre
