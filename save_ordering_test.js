// Vérifie que les sauvegardes "brutes" fire-and-forget (voir saveMyTeam,
// /api/save-raw) arrivent TOUJOURS sur disque dans l'ordre où elles ont été
// déclenchées côté navigateur, même si plusieurs sont en vol en même temps.
//
// Bug constaté (2026-09), au moment d'ajouter le journal de matchs (voir
// club_facilities_test.js / Player.matchLog) : initGame() enchaîne
// refreshTransferMarket()/refreshCoachMarket()/refreshAnalystMarket(), qui
// appellent CHACUN saveMyTeam() séparément, en rafale, sans s'attendre les
// uns les autres. saveMyTeam() n'exposait qu'UNE seule promesse
// (window.__lastSave, écrasée à chaque appel) — rien ne garantissait que ces
// requêtes /api/save-raw arrivaient au serveur, et donc s'écrivaient sur le
// fichier de sauvegarde, DANS L'ORDRE où elles avaient été envoyées. Avec un
// état de sauvegarde devenu plus volumineux (journal de matchs sur toute la
// saison), une requête plus ANCIENNE (état plus périmé, ex. juste après le
// chargement de la page) pouvait répondre APRÈS une requête plus RÉCENTE
// (ex. juste après avoir touché son budget) et écraser sur disque un état à
// jour avec un état périmé — observé concrètement avec la prime de fin de
// saison ("Nouvelle saison") : le budget revenait silencieusement en arrière
// juste après l'avoir vu augmenter. Corrigé en sérialisant les ENVOIS (pas
// la préparation du corps de requête, capturée immédiatement) via une file
// d'attente (`saveChain`, voir moteurbasket3.html) : chaque nouvelle
// sauvegarde n'est ENVOYÉE qu'une fois la précédente terminée.
//
// Ce test simule directement le scénario qui a révélé le bug : plusieurs
// appels à saveMyTeam() coup sur coup, avec un budget DIFFÉRENT à chaque
// fois (comme un chargement de page qui enchaîne plusieurs rafraîchissements
// avant qu'un clic utilisateur ne change le budget) — et une latence réseau
// ARTIFICIELLEMENT INVERSÉE (la toute première requête est la plus LENTE à
// répondre) pour reproduire délibérément le pire cas de dépassement.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

const { server, savePath, baseUrl } = await startTestServer();
const dom = await openGame(html, baseUrl);
await flush(dom);
const doc = dom.window.document;
const win = dom.window;

// Ralentit ARTIFICIELLEMENT la toute PREMIÈRE requête /api/save-raw (celle
// qui porte le budget le plus ANCIEN) pour qu'elle réponde APRÈS toutes les
// suivantes si rien ne les sérialise — le pire cas possible pour ce bug.
const origFetch = win.fetch;
let saveRawCount = 0;
win.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (String(url).includes("save-raw")) {
    saveRawCount++;
    if (saveRawCount === 1) {
      return new Promise(resolve => {
        setTimeout(() => resolve(origFetch(input, init)), 150);
      });
    }
  }
  return origFetch(input, init);
};

// 5 appels à saveMyTeam() coup sur coup (comme initGame() qui enchaîne
// plusieurs refreshXMarket()), avec un budget CROISSANT et DISTINCT à
// chaque appel pour pouvoir vérifier sans ambiguïté lequel a fini par
// s'écrire sur disque.
const budgets = [];
for (let i = 1; i <= 5; i++) {
  const b = 1000000 + i * 111111;
  budgets.push(b);
  win.eval(`teamA.budget = ${b}; saveMyTeam();`);
}
const expectedFinal = budgets[budgets.length - 1];

await flush(dom);

const saved = readRawSave(savePath);
console.log("Budgets envoyés dans l'ordre :", budgets.join(", "));
console.log("Budget final attendu (le DERNIER appel) :", expectedFinal);
console.log("Budget final sur disque :", saved.team.budget);
if (saved.team.budget !== expectedFinal) {
  throw new Error(`❌ Le budget final sur disque (${saved.team.budget}) devrait être celui du DERNIER appel à saveMyTeam() (${expectedFinal}), pas un état plus ancien écrasé après coup.`);
}
console.log("✅ Les sauvegardes en rafale (avec la toute première artificiellement ralentie) s'écrivent bien sur disque dans l'ordre d'appel, jamais écrasées par une requête plus ancienne arrivée en retard.");

// Vérifie aussi que chaque requête a bien atteint le serveur (rien perdu en
// route) : autant de POST /api/save-raw effectivement envoyés que d'appels.
if (saveRawCount !== budgets.length) {
  throw new Error(`❌ ${budgets.length} appels à saveMyTeam() devraient produire ${budgets.length} requêtes /api/save-raw, obtenu ${saveRawCount}.`);
}
console.log(`✅ Les ${budgets.length} appels à saveMyTeam() ont bien produit ${saveRawCount} requêtes /api/save-raw distinctes (aucune perdue).`);

win.close();
server.close();
console.log("\n✅ Ordre des sauvegardes vérifié : jamais d'état périmé qui écrase un état plus récent, même en rafale avec latence réseau défavorable.");

})().catch(e => { console.error(e); process.exit(1); });
