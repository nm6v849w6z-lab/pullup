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

## amb_groan_1.mp3 · amb_groan_2.mp3 · amb_groan_3.mp3 · amb_groan_big.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_groan_{1,2,3}.mp3` (clé `amb_groan`, variantes tirées au hasard) et `amb_groan_big.mp3` (clé `amb_groan_big`, 3 points adverse / fin de match serrée) |
| Ressource originale | « CRWDReac-SOCCER_Millerntor Stadium Crowd Reaction Chance Missed 01_PHILIPP FEIT_FCSP 29.546_Sound Of Sankt Pauli » (Freesound n° 829452) |
| Auteur | itmightgetloud (Philipp Feit, « Sound Of Sankt Pauli ») |
| Source | https://freesound.org/people/itmightgetloud/sounds/829452/ |
| Licence | Creative Commons 0 (CC0 1.0, dédicace au domaine public) |
| Conditions | https://creativecommons.org/publicdomain/zero/1.0/ |
| Vérifiée le | 2026-10-10 (page Freesound de la ressource, champ licence) |
| Attribution requise | Non (crédit facultatif : « itmightgetloud / Freesound ») |
| Usage commercial / jeu | Autorisé (copie, modification, distribution, même commerciale) |
| Modifications | Aperçu HQ MP3 (1 min 01, 6 réactions séparées par des silences) ; réactions 2, 4 et 5 (13,75–18,9 s, 38,55–44,1 s, 45,45–49,25 s) → variantes de 3,7 à 5,4 s ; réaction 1 (0–9 s) → version longue ; départ calé sur la réaction (fondu 30 ms), fondu final cos² ; corps à −16 dBFS RMS ; MP3 96 kb/s stéréo 44,1 kHz (45–110 Ko) |
| Restrictions | Aucune connue (foule de stade, pas de parole identifiable, pas de musique) |

## amb_applause_1.mp3 · amb_applause_2.mp3 · amb_applause_3.mp3 · amb_applause_4.mp3 · amb_applause_big.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_applause_{1..4}.mp3` (clé `amb_applause`, variantes tirées au hasard : lancer franc réussi à domicile, temps mort) et `amb_applause_big.mp3` (clé `amb_applause_big`, fin de quart-temps) |
| Ressource originale | « Hockey arena pregame applause.wav » (Freesound n° 706732) — Rogers Arena, Vancouver, 2014 |
| Auteur | SEF7 |
| Source | https://freesound.org/people/SEF7/sounds/706732/ |
| Licence | Creative Commons 0 (CC0 1.0, dédicace au domaine public) |
| Conditions | https://creativecommons.org/publicdomain/zero/1.0/ |
| Vérifiée le | 2026-10-10 (page Freesound de la ressource, champ licence) |
| Attribution requise | Non (crédit facultatif : « SEF7 / Freesound ») |
| Usage commercial / jeu | Autorisé (copie, modification, distribution, même commerciale) |
| Modifications | Aperçu HQ MP3 (48 s, 48 kHz) ; passages sans son tonal (corne / sono évitées vers 4 s, 13 s, 24,5 s, 41,5 s) : 5–8,5 s, 8,4–11,8 s, 26–29,5 s, 34,3–37,8 s (variantes de 3,5 s) et 26–33 s (version longue de 7 s) ; montée 0,25 s, extinction cos² 1,2 s / 2 s ; −17 dBFS RMS (crête limitée à −1 dBFS) ; MP3 96 kb/s stéréo 44,1 kHz (40–85 Ko) |
| Restrictions | Aucune connue (applaudissements de foule, pas de parole ni de musique dans les extraits gardés) |

## Musiques des séquences (assets/audio/music/)

| Champ | Valeur |
|---|---|
| Fichiers | `entree-joueurs.mp3` (remplacée le 2026-10-10), `mascotte-1.mp3`, `mascotte-2.mp3`, `mascotte-3.mp3` (2026-10-10) ; plus anciennes : `emission.mp3`, `pompom.mp3`, `lanceur-maillot.mp3` |
| Ressource originale | Fichiers fournis par le propriétaire du jeu (entre_e_des_joueurs.mp3, mascotte1.mp3, mascotte2.flac, mascotte3.ogg, …) |
| Auteur | Non communiqué |
| Source | Fichiers transmis par le propriétaire du jeu |
| Licence | Non vérifiée par Claude — fournis et choisis par le propriétaire du jeu, sous sa responsabilité |
| Conditions | Non communiquées |
| Vérifiée le | 2026-10-10 (format, durée, volume uniquement) |
| Attribution requise | Non communiquée |
| Modifications | entree-joueurs : réencodée MP3 192 kb/s (volume d'origine) ; mascotte-1..3 : volume aligné à ≈ −16,5 LUFS (loudnorm, crête −1,5 dBTP), MP3 192 kb/s |
| Restrictions | À confirmer par le propriétaire (droits sur les musiques) |

## amb_boo.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_boo.mp3` (clé `amb_boo`, boucle montée pendant les lancers francs adverses) |
| Ressource originale | « AF Crowd Boo Hiss LOOP 2.wav » (Freesound n° 678537), « originally recorded for a basketball game » ; fichier original WAV 24 bits / 48 kHz téléchargé par le propriétaire du jeu |
| Auteur | mglennsound |
| Source | https://freesound.org/people/mglennsound/sounds/678537/ |
| Licence | Creative Commons 0 (CC0 1.0, dédicace au domaine public) — même auteur et même série que `amb_cheer` (678544, CC0 vérifié) ; licence CC0 contrôlée par le propriétaire lors du téléchargement |
| Conditions | https://creativecommons.org/publicdomain/zero/1.0/ |
| Vérifiée le | 2026-10-10 |
| Attribution requise | Non (crédit facultatif : « mglennsound / Freesound ») |
| Usage commercial / jeu | Autorisé (copie, modification, distribution, même commerciale) |
| Modifications | « Salle plus grande » : 8 couches empilées (décalages aléatoires, hauteur ×0,92 à ×1,08, panoramique, filtrage des aigus pour les couches lointaines, micro-retards) ; extrait 6–30 s du mélange bouclé avec fondu enchaîné de 1,5 s (boucle de 24 s) ; −20 dBFS RMS ; MP3 112 kb/s stéréo 44,1 kHz (0,34 Mo) |
| Restrictions | Aucune connue (huées et sifflets de foule, pas de parole identifiable) |

## amb_offense.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_offense.mp3` (clé `amb_offense`, boucle montée quand l'équipe à domicile attaque, remplace les applaudissements synthétisés) |
| Ressource originale | « crowd partying cheering applause all around.flac » (Freesound n° 637468), fichier original FLAC fourni par le propriétaire du jeu |
| Auteur | kyles |
| Source | https://freesound.org/people/kyles/sounds/637468/ |
| Licence | Creative Commons 0 (CC0 1.0) — **à reconfirmer sur la page** : Freesound inaccessible depuis l'environnement le 2026-10-10 ; tous les autres sons de cet auteur vérifiés (635492, 629884, 451600) sont CC0 |
| Conditions | https://creativecommons.org/publicdomain/zero/1.0/ |
| Attribution requise | Non (crédit facultatif) |
| Usage commercial / jeu | Autorisé (copie, modification, distribution, même commerciale) |
| Vérifiée le | 2026-10-10 (indirectement, voir Licence) |
| Modifications | Extrait 0,2–28,6 s (sifflet vers 29 s retiré) ; boucle de 26,9 s, fondu enchaîné 1,5 s ; −21 dBFS RMS ; MP3 112 kb/s stéréo 44,1 kHz |
| Restrictions | Aucune connue |

## amb_bed_calm.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_bed_calm.mp3` (clé `amb_bed_calm`, salle calme : avant-match, pauses, fin de match, murmure des lancers francs à domicile) |
| Ressource originale | « Large_crowd_medium_distance_stereo.wav » (Freesound n° 360703), fichier original WAV fourni par le propriétaire du jeu |
| Auteur | eguobyte |
| Source | https://freesound.org/people/eguobyte/sounds/360703/ |
| Licence | Creative Commons 0 (CC0 1.0) |
| Conditions | https://creativecommons.org/publicdomain/zero/1.0/ |
| Attribution requise | Non (crédit facultatif) |
| Usage commercial / jeu | Autorisé (copie, modification, distribution, même commerciale) |
| Vérifiée le | 2026-10-10 (page Freesound, avant le blocage) |
| Modifications | Boucle de 55,1 s (fichier entier, fondu enchaîné 2 s) ; −23 dBFS RMS ; MP3 112 kb/s stéréo 44,1 kHz |
| Restrictions | Aucune connue (≈ 1 000 personnes qui discutent, pas de parole distincte) |

## amb_bed_hot.mp3

| Champ | Valeur |
|---|---|
| Fichier | `assets/audio/sfx/amb_bed_hot.mp3` (clé `amb_bed_hot`, salle en ébullition : 4e quart-temps ou prolongation, ≤ 2 min, écart ≤ 6) |
| Ressource originale | « crowd large cheer arena stadium hockey game Montreal Canadiens Habs chant applause whistle.flac » (Freesound n° 629884), fichier original FLAC fourni par le propriétaire du jeu |
| Auteur | kyles |
| Source | https://freesound.org/people/kyles/sounds/629884/ |
| Licence | Creative Commons 0 (CC0 1.0) (résultat de recherche Freesound filtrée CC0) |
| Conditions | https://creativecommons.org/publicdomain/zero/1.0/ |
| Attribution requise | Non (crédit facultatif) |
| Usage commercial / jeu | Autorisé (copie, modification, distribution, même commerciale) |
| Vérifiée le | 2026-10-10 |
| Modifications | Passage « chaud » 8–16,8 s (avant : salle calme ; après : sifflet et coupure) nivelé puis empilé en 7 couches (décalages, hauteur ×0,93 à ×1,07, panoramique, aigus adoucis pour les couches lointaines) ; boucle de 22,5 s, fondu 1,5 s ; −20 dBFS RMS ; MP3 112 kb/s |
| Restrictions | Aucune connue |

