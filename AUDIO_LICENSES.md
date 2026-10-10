# Registre des ressources audio

Un sous-titre par fichier intégré au jeu. Avant chaque ajout, vérifier la
licence sur la page précise de la ressource (pas sur la page de recherche) :
usage commercial, intégration et redistribution dans un jeu, modification,
attribution. Licence ambiguë → pas d'intégration.
Fichiers : `assets/audio/sfx/` (déclarés dans `manifest.json`).
Test : `audio_assets_license_test.js` (chaque fichier du manifeste existe et
figure ici).

## amb_bed.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_bed.mp3` (clé `amb_bed` du manifeste) |
| Ressource originale | « crowd int large dense arena stadium hall with cool shouting scalper left.flac » (Freesound n° 635492) |
| Auteur | kyles |
| Source | https://freesound.org/people/kyles/sounds/635492/ |
| Licence | Creative Commons 0 (CC0 1.0, dédicace au domaine public) |
| Conditions | https://creativecommons.org/publicdomain/zero/1.0/ |
| Vérifiée le | 2026-10-10 (page Freesound de la ressource, champ licence) |
| Attribution requise | Non (crédit facultatif : « kyles / Freesound ») |
| Usage commercial / jeu | Autorisé (copie, modification, distribution, même commerciale) |
| Modifications | Aperçu HQ MP3 (1 min 23, 48 kHz, l'original FLAC demande un compte) ; seul l'extrait 0,3–64 s gardé (après 64 s, un homme crie à gauche) ; nivellement doux ±3 dB ; boucle de 61,2 s avec fondu enchaîné de 2,5 s ; −23 dBFS RMS ; MP3 96 kb/s stéréo 44,1 kHz (0,7 Mo) |
| Restrictions | Aucune connue (foule dense en intérieur, pas de voix isolée identifiable dans l'extrait gardé, pas de musique) |

## amb_cheer_1.mp3 · amb_cheer_2.mp3 · amb_cheer_3.mp3 · amb_cheer_big.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_cheer_{1,2,3}.mp3` (clé `amb_cheer`, variantes tirées au hasard) et `amb_cheer_big.mp3` (clé `amb_cheer_big`, 3 points / panier décisif) |
| Ressource originale | « AF Crowd Cheer LOOP .wav » (Freesound n° 678544), « crowd cheering, generic shouts though originally recorded for a basketball game » |
| Auteur | mglennsound |
| Source | https://freesound.org/people/mglennsound/sounds/678544/ |
| Licence | Creative Commons 0 (CC0 1.0, dédicace au domaine public) |
| Conditions | https://creativecommons.org/publicdomain/zero/1.0/ |
| Vérifiée le | 2026-10-10 (page Freesound de la ressource, champ licence) |
| Attribution requise | Non (crédit facultatif : « mglennsound / Freesound ») |
| Usage commercial / jeu | Autorisé (copie, modification, distribution, même commerciale) |
| Modifications | Aperçu HQ MP3 (20,7 s, 48 kHz) ; extraits 1,75–5,25 s, 10,75–14,25 s, 5,5–9 s (3,5 s chacun) et 15–20,6 s (version longue 5,6 s) ; enveloppe « éruption » (montée 0,12 s, surplus +25 % qui retombe, extinction 1,3 s / 2,2 s) ; corps à −16 dBFS RMS ; MP3 96 kb/s stéréo 44,1 kHz (40–70 Ko) |
| Restrictions | Aucune connue (cris de foule génériques, pas de parole identifiable, pas de musique) |
