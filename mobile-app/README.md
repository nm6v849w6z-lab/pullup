# Hoop Manager — application mobile

Deux façons d'avoir le jeu sur téléphone, qui partagent **le même code** (le
jeu servi par le serveur Render) :

## 1. Tout de suite : l'appli installable (PWA)

Rien à publier. Le jeu est déjà adapté au téléphone (barre d'onglets en bas,
menu en tiroir, calendrier en cartes…) et installable :

- **iPhone** : ouvrir son lien de manager dans **Safari** → bouton Partager →
  « Sur l'écran d'accueil ».
- **Android** : ouvrir son lien dans **Chrome** → menu ⋮ → « Installer
  l'application ».

L'icône ouvre le jeu en plein écran, directement sur le bon club (le jeton
`?m=` est recopié dans le manifest, voir `server/index.js`). Le code est dans
`assets/mobile/` (mobile.css, mobile.js, sw.js, icônes).

## 2. Plus tard : les stores (ce dossier, Capacitor)

Ce dossier emballe le jeu dans une vraie appli iOS/Android. Au lancement,
`www/index.html` demande **une seule fois** le lien d'invitation du manager,
le retient, puis ouvre le jeu sur Render (`allowNavigation` dans
`capacitor.config.json`).

### Prérequis

- Node.js 22 ou plus
- iOS : un Mac avec **Xcode**, et un compte **Apple Developer** (99 $/an)
- Android : **Android Studio**, et un compte **Google Play Console**
  (25 $ une fois)

### Générer les projets natifs (une seule fois)

```bash
cd mobile-app
npm install
npx cap add ios
npx cap add android
npm run icons      # icônes + écrans de démarrage depuis resources/
npx cap sync
```

`npm run icons` utilise `@capacitor/assets` (`npx @capacitor/assets` s'il
n'est pas installé). Il attend une image `resources/icon.png` d'au moins
1024×1024 : `resources/icon-source-512.png` est un point de départ, à
remplacer par une version haute définition du logo avant publication.

### Ouvrir et tester

```bash
npm run ios        # ouvre Xcode → choisir un iPhone → ▶
npm run android    # ouvre Android Studio → ▶
```

### À savoir avant de publier

- **Apple peut refuser une appli qui n'est qu'un site dans une coquille**
  (règle 4.2 de l'App Store). Pour passer, il faudra ajouter au moins une
  vraie fonction native, la plus utile ici étant les **notifications push**
  (« ton match commence dans 10 min », « enchère dépassée »…). Google Play
  est beaucoup moins strict.
- L'adresse du serveur est écrite à deux endroits : `www/index.html`
  (`SERVER`) et `capacitor.config.json` (`allowNavigation`). À changer
  ensemble si le jeu change d'adresse (nom de domaine à soi, par exemple).
- Identifiant de l'appli : `fr.hoopmanager.app` (dans
  `capacitor.config.json`). Il ne peut plus changer une fois publié.
