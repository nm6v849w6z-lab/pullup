// Nationalités des joueurs (retour utilisateur, 2026-09 : "un petit drapeau
// sur la fiche joueur", "étoffe la liste des pays, il faut la Chine et même
// les petits pays") — voir NATIONS/generatePlayerIdentity/nationalityFromName
// dans engine.js (+ miroir moteurbasket3.html).
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");

function fail(msg) { console.error("❌ " + msg); process.exit(1); }

// 1. Liste des pays : ~90, dont la Chine et des petits pays, un drapeau par pays.
const codes = E.NATIONS.map(n => n.code);
if (codes.length < 80) fail(`Seulement ${codes.length} pays.`);
if (new Set(codes).size !== codes.length) fail("Code pays en double.");
for (const c of ["fr", "us", "cn", "lu", "mc", "ad", "mt", "is", "cy", "me", "xk", "ge", "am", "ss", "cv"]) {
  if (!E.NATION_BY_CODE[c]) fail(`Pays manquant : ${c}`);
}
for (const n of E.NATIONS) {
  if (!fs.existsSync(path.join(__dirname, "assets", "flags", n.code + ".png"))) fail(`Drapeau manquant : ${n.code}`);
  if (!E.NAME_POOLS[n.pool]) fail(`Réservoir de noms inconnu pour ${n.code} : ${n.pool}`);
}
console.log(`✅ ${codes.length} pays, chacun avec son drapeau et son réservoir de noms.`);

// 2. ~60 % de Français parmi les nouveaux joueurs.
let fr = 0; const N = 20000; const seen = new Set();
for (let i = 0; i < N; i++) {
  const id = E.generatePlayerIdentity();
  if (!E.NATION_BY_CODE[id.nationality]) fail(`Nationalité invalide : ${id.nationality}`);
  seen.add(id.nationality);
  if (id.nationality === "fr") fr++;
  const pool = E.namePoolOf(E.NATION_BY_CODE[id.nationality].pool); // réservoir enrichi (2026-10-07)
  const last = id.name.split(" ").slice(1).join(" ");
  if (!pool.last.includes(last)) fail(`Nom ${id.name} hors du réservoir de ${id.nationality}`);
}
const share = fr / N;
if (share < 0.57 || share > 0.63) fail(`Part de Français : ${(share * 100).toFixed(1)} %`);
console.log(`✅ ${(share * 100).toFixed(1)} % de Français, ${seen.size} pays différents sur ${N} tirages.`);

// 3. Génération d'effectifs : chaque joueur a une nationalité.
const team = E.generateTeam("Test");
const rookies = E.generateStartingRoster("Test2");
for (const p of [...team.players, ...rookies.players]) {
  if (!E.NATION_BY_CODE[p.nationality]) fail(`${p.name} sans nationalité valide`);
}
console.log("✅ generateTeam / generateStartingRoster : nationalité posée sur chaque joueur.");

// 4. Anciennes sauvegardes : nationalité déduite du nom, déterministe, stable.
const p0 = team.players[0];
const rec = E.serializePlayerRecord(p0);
if (rec.nationality !== p0.nationality) fail("serializePlayerRecord n'écrit pas la nationalité");
const back = E.playerFromSave(JSON.parse(JSON.stringify(rec)));
if (back.nationality !== p0.nationality) fail("playerFromSave ne relit pas la nationalité");
const legacy = { ...rec, nationality: undefined, name: "Kevin Nakamura" };
const a = E.playerFromSave(JSON.parse(JSON.stringify(legacy)));
const b = E.playerFromSave(JSON.parse(JSON.stringify(legacy)));
if (a.nationality !== "jp" || b.nationality !== "jp") fail(`Kevin Nakamura → ${a.nationality}/${b.nationality}, attendu jp`);
const x1 = E.nationalityFromName("Léo Zzzz"), x2 = E.nationalityFromName("Léo Zzzz");
if (x1 !== x2) fail("nationalityFromName non déterministe");
if (E.nationalityFromName("Tom Jokic") && !["rs", "hr", "si", "ba", "me", "mk"].includes(E.nationalityFromName("Tom Jokic"))) fail("Jokic devrait venir des Balkans");
// Nom inconnu → répartition ~ globale (France majoritaire).
let frLegacy = 0;
for (let i = 0; i < 4000; i++) if (E.nationalityFromName(`Joueur Inconnu${i}`) === "fr") frLegacy++;
if (frLegacy / 4000 < 0.55 || frLegacy / 4000 > 0.65) fail(`Noms inconnus : ${(frLegacy / 40).toFixed(1)} % de Français`);
console.log("✅ Anciennes sauvegardes : nationalité déduite du nom (déterministe), puis sauvegardée/relue telle quelle.");

// 5. Miroir navigateur identique.
const html = require("./test_game_html.js").readGameHtml();
const js = fs.readFileSync(path.join(__dirname, "engine.js"), "utf8");
const cut = src => { const i = src.indexOf("const FRANCE_SHARE"); const j = src.indexOf("function nationName"); return src.slice(i, j); };
if (!cut(html) || cut(html) !== cut(js)) fail("Le bloc NATIONS de moteurbasket3.html diffère de celui d'engine.js");
for (const needle of ["function nationFlagHtml", "nationality: p.nationality", "nationality: pdata.nationality", "${nationFlagHtml(p.nationality)}", "nat-flag--name"]) {
  if (!html.includes(needle)) fail(`Client : "${needle}" introuvable`);
}
console.log("✅ Miroir navigateur identique (NATIONS, sauvegarde, drapeaux Effectif/Marché/fiche).");
console.log("\n🏁 Nationalités : tous les tests sont passés.");
