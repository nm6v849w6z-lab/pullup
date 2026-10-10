# Bruitages du direct (assets/live/sfx.js)

Les bruitages sont aujourd'hui **synthétisés** (Web Audio) : aucun fichier n'est
fourni. Pour remplacer un son par un fichier, déposer le fichier ici et le
déclarer dans `manifest.json` (augmenter `version` pour vider les caches) :

```json
{ "version": 2, "files": { "siren": "sirene.mp3", "cash": "caisse.mp3" } }
```

| Clé       | Événement                                              | Fichier conseillé                       |
|-----------|--------------------------------------------------------|-----------------------------------------|
| `cash`    | lancer franc réussi de l'équipe à domicile             | « cha-ching » de caisse, < 1 s          |
| `siren`   | panier à 3 points de l'équipe à domicile               | sirène de pompier arcade, ~1 s          |
| `whistle` | faute sifflée                                          | coup de sifflet bref, < 0,5 s           |
| `steal`   | interception de l'équipe à domicile                    | jingle arcade, < 0,5 s                  |
| `miss`    | lancer franc raté de l'équipe à l'extérieur (jamais un tir classique, 2026-10-10) | « wah-wah » comique, < 1 s |

Formats : MP3 (ou OGG/WAV), mono, 44,1 kHz, normalisé autour de -14 LUFS.
Un fichier absent ou illisible retombe automatiquement sur le son synthétique.

## Ambiance du public (2026-10-10)

L'ambiance de salle est elle aussi **synthétisée** par défaut ; ces fichiers
facultatifs la remplacent (même manifeste). Réglage séparé « Ambiance » dans
le direct : elle se coupe sans couper les bruitages.

| Clé          | Rôle                                                      | Fichier conseillé                                 |
|--------------|-----------------------------------------------------------|---------------------------------------------------|
| `amb_bed`    | fond de public permanent (bouclé, volume selon l'humeur)  | brouhaha de salle 20–40 s, bouclable, sans pic    |
| `amb_boo`    | huées sur un lancer franc adverse (bouclé)                | huées 8–15 s, bouclables                          |
| `amb_chant`  | « DE-FENSE ! » quand l'équipe à domicile défend           | une prise de 2–3 s (« de-fense » + 2 frappes)     |
| `amb_cheer`  | clameur après un panier à domicile / tir adverse manqué   | clameur 2–3 s                                     |
| `amb_groan`  | déception (panier adverse, tir domicile manqué)           | « ohhh » 1–2 s                                    |
| `amb_applause` | applaudissements (lancer réussi, temps mort, fin de quart) | applaudissements 2–3 s                      |

Recommandé en priorité : `amb_bed` et `amb_chant` (la synthèse imite des voix,
un vrai enregistrement de salle sera nettement plus réaliste). Formats : MP3
ou OGG, stéréo possible, 44,1 kHz, -20 LUFS pour le fond, -16 LUFS pour les
réactions.
