// Vérifie le correctif racine 2026-09 (retour utilisateur Discord répété :
// "Cette enchère est déjà terminée" en cliquant Enchérir sur une annonce
// affichée avec un temps restant pourtant positif) : `__uid` (engine.js,
// `let __uid = 1`) repart de 1 à CHAQUE redémarrage du PROCESS SERVEUR
// (chaque déploiement Render), pas seulement à chaque rechargement de page
// navigateur — dd27f48 (dossier "Fix : enchere staff...") n'empêchait que la
// génération locale côté navigateur en ligue partagée, jamais ce cas-ci,
// nettement plus fréquent (un déploiement change le process serveur, une
// simple session utilisateur non). Si le marché doit se réapprovisionner
// juste après un redémarrage, les nouveaux id générés (1, 2, 3...) peuvent
// entrer en collision avec ceux, bien plus élevés, déjà utilisés par
// d'anciennes entités (joueurs, annonces déjà closes...) de la même
// sauvegarde — `Array.prototype.find(l => l.id === listingId)` renvoie
// alors la MAUVAISE entité.
//
// Reproduit FIDÈLEMENT un vrai redémarrage de process (pas seulement un
// nouvel appel dans le MÊME process, où `__uid` ne redescend jamais) : deux
// VRAIS process Node distincts, communiquant via un fichier de sauvegarde
// multi-manager sur disque, exactement comme deux déploiements Render
// successifs du même service.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uid-reseed-test-"));
const savePath = path.join(tmpDir, "multi-league.json");
const scriptsDir = tmpDir;

// --- Process 1 ("avant le redémarrage") : crée une ligue partagée, pousse
// une ancienne annonce d'entraîneur déjà CLOSE avec un petit id (comme en
// aurait une ligue qui vit depuis un moment), et sauvegarde sur disque.
const script1 = `
  const Engine = require(${JSON.stringify(path.join(__dirname, "engine.js"))});
  const store = require(${JSON.stringify(path.join(__dirname, "server/store.js"))});
  const T0 = Date.UTC(2026, 8, 1, 9, 0, 0);
  const league = Engine.generateMultiManagerLeague(["Ancienne Ligue"], 1, T0, { calendarWeekMs: 7 * 24 * 3600 * 1000 });
  // Ancienne annonce déjà résolue, avec un TOUT PETIT id (exactement le
  // genre d'id qu'un __uid frais recommencerait à générer sans le correctif).
  // id volontairement TRÈS supérieur à ce qu'un __uid frais (1, 2, 3...) ou
  // même la reconstruction incidente des joueurs (playerFromSave crée un
  // Player() "à blanc" avant d'écraser son id avec pdata.id, ce qui consomme
  // discrètement quelques dizaines/centaines de uid() SANS rapport avec le
  // correctif testé ici) pourrait atteindre — pour ne tester QUE le
  // correctif lui-même (reseedUidFromSave), pas cette protection accidentelle
  // et non garantie.
  const OLD_LISTING_ID = 100000;
  const oldClosedListing = {
    id: OLD_LISTING_ID, level: 2, startPrice: 1600, currentBid: 1600, currentBidderIdx: 3,
    bids: [{ bidderIdx: 3, amount: 1600, at: T0 }], createdAt: T0, closesAt: T0 + 1000,
    lastCpuCheckAt: T0, status: "closed", result: "sold", finalPrice: 1600,
  };
  league.coachListings.push(oldClosedListing);
  (async () => {
    await store.saveMultiLeague(league, ${JSON.stringify(savePath)});
    console.log("PROCESS1_OK");
  })();
`;
const script1Path = path.join(scriptsDir, "p1.js");
fs.writeFileSync(script1Path, script1, "utf-8");
const out1 = execFileSync(process.execPath, [script1Path], { encoding: "utf-8" });
if (!out1.includes("PROCESS1_OK")) throw new Error("❌ (setup) échec du process 1 : " + out1);
console.log("✅ Process 1 (avant redémarrage) : ligue sauvegardée avec une ancienne annonce id=100000.");

// --- Process 2 ("après le redémarrage") : VRAI nouveau process Node, donc
// `__uid` y repart bien de 1 (comme sur un vrai redémarrage serveur). Charge
// la sauvegarde via store.loadMultiLeague (le même chemin que
// server/index.js à chaque requête) puis génère un nouveau candidat
// entraîneur — sans le correctif, celui-ci recevrait l'id 1, en collision
// directe avec l'ancienne annonce déjà fermée.
const script2 = `
  const Engine = require(${JSON.stringify(path.join(__dirname, "engine.js"))});
  const store = require(${JSON.stringify(path.join(__dirname, "server/store.js"))});
  (async () => {
    const { league } = await store.loadMultiLeague(${JSON.stringify(savePath)});
    // Plus haut id RÉELLEMENT présent dans la ligue rechargée (annonces,
    // joueurs, historique...) — c'est CE plancher-là que uid() doit
    // impérativement dépasser pour tout nouvel id généré à partir de
    // maintenant, quel que soit le nombre de uid() incidemment consommés
    // pendant la reconstruction des joueurs.
    const maxIdBefore = Engine.scanMaxId(Engine.serializeLeague(league));
    const now = Date.UTC(2026, 8, 1, 9, 0, 0) + 24 * 3600 * 1000;
    const fresh = league.generateCoachCandidate(now);
    console.log("RESULT " + JSON.stringify({
      maxIdBefore,
      newListingId: fresh.id,
      newListingStatus: fresh.status,
      allIds: league.coachListings.map(l => l.id),
    }));
  })();
`;
const script2Path = path.join(scriptsDir, "p2.js");
fs.writeFileSync(script2Path, script2, "utf-8");
const out2 = execFileSync(process.execPath, [script2Path], { encoding: "utf-8" });
const resultLine = out2.split("\n").find(l => l.startsWith("RESULT "));
if (!resultLine) throw new Error("❌ (process 2) pas de résultat : " + out2);
const result = JSON.parse(resultLine.slice("RESULT ".length));
console.log("Process 2 (après redémarrage) —", result);

if (result.newListingId <= result.maxIdBefore) {
  throw new Error(`❌ RÉGRESSION : le nouveau candidat entraîneur généré juste après un redémarrage du process a reçu l'id ${result.newListingId}, INFÉRIEUR OU ÉGAL au plus haut id déjà présent dans la ligue rechargée (${result.maxIdBefore}, l'ancienne annonce déjà fermée) — collision possible, exactement le bug "Cette enchère est déjà terminée".`);
}
const ids = result.allIds;
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length > 0) {
  throw new Error("❌ RÉGRESSION : id dupliqués dans league.coachListings après redémarrage : " + JSON.stringify(duplicates));
}
console.log(`✅ Le nouveau candidat entraîneur généré juste après un redémarrage du process reçoit l'id ${result.newListingId}, strictement supérieur au plus haut id déjà présent dans la ligue rechargée (${result.maxIdBefore}, l'ancienne annonce déjà fermée) — plus de collision possible, plus de risque de résoudre "Array.find" vers la mauvaise annonce.`);

console.log("\n✅ uid_reseed_after_restart_test.js : le plancher de uid() est bien reconstitué à chaque chargement de sauvegarde (server/store.js:deserialize/deserializeMultiLeague → Engine.reseedUidFromSave), même à travers un vrai redémarrage du process serveur.");
