// Prénoms et noms enrichis (2026-10-07) : réservoirs agrandis par culture
// (NAME_POOLS_EXTRA, namePoolOf), génération cohérente avec la nationalité,
// beaucoup moins de répétitions, joueurs existants et staff inchangés.
const fs = require("fs");
const E = require("./engine.js");
function check(c, msg) { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); }

const keys = Object.keys(E.NAME_POOLS);
check(keys.every(k => E.NAME_POOLS_EXTRA[k]) && Object.keys(E.NAME_POOLS_EXTRA).every(k => E.NAME_POOLS[k]), `ajouts pour les ${keys.length} cultures, aucune culture inconnue`);
const big = ["fr", "anglo", "hisp", "luso", "westaf", "centraf", "balkan", "italian", "german", "slavic", "chinese", "turkish", "greek", "arab", "nordic", "baltic", "dutch"];
check(big.every(k => E.namePoolOf(k).first.length >= 70 && E.namePoolOf(k).last.length >= 90), "grandes cultures : au moins 70 prénoms et 90 noms chacune");
check(keys.every(k => E.namePoolOf(k).first.length >= 30 && E.namePoolOf(k).last.length >= 40), "toutes les cultures : au moins 30 prénoms et 40 noms");
check(keys.every(k => E.namePoolOf(k).first.every(f => !/\s/.test(f) && f.length > 1)), "prénoms d'un seul mot (le nom de famille se relit après le premier espace)");
check(keys.every(k => { const p = E.namePoolOf(k); return new Set(p.first).size === p.first.length && new Set(p.last).size === p.last.length; }), "aucun doublon dans un réservoir");
check(keys.every(k => E.NAME_POOLS[k].first.every(f => E.namePoolOf(k).first.includes(f)) && E.NAME_POOLS[k].last.every(l => E.namePoolOf(k).last.includes(l))), "tous les anciens noms restent possibles");

// Cohérence nationalité / nom.
let bad = 0;
for (let i = 0; i < 5000; i++) {
  const id = E.generatePlayerIdentity(null, ["fr", "es", "it", "de", "us", "cn", "lt", "rs"][i % 8]);
  const pool = E.namePoolOf(E.NATION_BY_CODE[id.nationality].pool);
  const [first, ...rest] = id.name.split(" ");
  if (!pool.first.includes(first) || !pool.last.includes(rest.join(" "))) bad++;
}
check(bad === 0, "5 000 joueurs : prénom ET nom toujours tirés dans la culture de leur nationalité");

// Répétitions : deux « générations » successives de 300 joueurs (un
// championnat) partagent rarement un prénom + nom identique.
const gen = () => { const s = []; for (let i = 0; i < 300; i++) s.push(E.generatePlayerIdentity(null, "fr").name); return s; };
let shared = 0, runs = 40;
for (let r = 0; r < runs; r++) { const a = new Set(gen()); shared += gen().filter(n => a.has(n)).length; }
check(shared / runs < 4, `deux générations de 300 joueurs : ${(shared / runs).toFixed(2)} nom(s) complet(s) en commun en moyenne (< 4)`);

// Joueurs existants : nom conservé tel quel au rechargement.
const team = E.generateTeam("Test", 1, "fr");
const names = team.players.map(p => p.name);
const back = E.teamFromSave(JSON.parse(JSON.stringify(E.serializeTeam(team))));
check(back.players.map(p => p.name).join("|") === names.join("|"), "joueurs déjà créés : noms inchangés après sauvegarde/rechargement");

// Staff : nom déterministe calculé sur NAME_POOLS, intact.
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
check(/function staffIdentity[\s\S]{0,1500}NAME_POOLS\[/.test(html) && !/function staffIdentity[\s\S]{0,1500}namePoolOf/.test(html), "staff : toujours nommé depuis NAME_POOLS (noms existants inchangés)");
console.log("\n🏁 names_variety_test.js : réservoirs de noms enrichis conformes.");
