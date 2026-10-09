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
| `miss`    | tir ou lancer franc raté de l'équipe à l'extérieur     | « wah-wah » comique, < 1 s              |

Formats : MP3 (ou OGG/WAV), mono, 44,1 kHz, normalisé autour de -14 LUFS.
Un fichier absent ou illisible retombe automatiquement sur le son synthétique.
