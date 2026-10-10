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

## amb_chant_1.mp3 · amb_chant_2.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_chant_{1,2}.mp3` (clé `amb_chant`, une variante tirée au hasard par match, bouclée pendant les défenses de l'équipe à domicile) |
| Ressource originale | « Miami_Heat_2022_playoffs_defense_chant_louder.mp3 » (fichier fourni par le propriétaire du jeu, 24,3 s) — chant « DE-FENSE » d'un match de playoffs NBA 2022 (Miami Heat) |
| Auteur | Inconnu (enregistrement de match ; source d'origine non identifiée) |
| Source | Fichier transmis le 2026-10-10 par le propriétaire du jeu ; URL d'origine inconnue |
| Licence | **AUCUNE LICENCE VÉRIFIÉE** — utilisation décidée par le propriétaire du jeu en connaissance du risque (2026-10-10) |
| Conditions | Non applicables / inconnues. Droits probables : auteur de l'enregistrement (spectateur, ou NBA / diffuseur si tiré de la retransmission) |
| Vérifiée le | 2026-10-10 : métadonnées (encodeur Lavf, version « louder » saturée) ; aucune licence trouvée |
| Attribution requise | Inconnue |
| Modifications | Désécrêtage (ffmpeg adeclip), −6 dB, passe-haut 90 Hz, égalisation (−2,5 dB à 3,5 kHz, −1,5 dB à 250 Hz) ; extrait 8,28–21,52 s (6 cycles « DE-FENSE ») bouclé avec fondu de 0,3 s dans un creux ; −18 dBFS RMS ; 2 variantes de hauteur/tempo (×0,955 → 13,9 s ; ×1,035 → 12,8 s) ; MP3 112 kb/s stéréo |
| Restrictions | **À REMPLACER** par un chant sous licence (achat ou enregistrement maison) avant toute exploitation où le risque n'est pas accepté ; remplacement = déposer d'autres fichiers sous la même clé `amb_chant` |
