// Bloc « Tactiques » en cartes d'équipe (retour utilisateur 2026-10-04 :
// « présente les tactiques de manière un peu plus joli sur les box scores et
// sur les lives », variante A retenue). Vérifie le direct
// (assets/live/live-view.js) et la feuille de match (matchTacticsHtml).
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };

const TAC = [
  { offenses: ["Transition rapide", "Jeu en pénétration", "Jeu intérieur"], defense: "Homme à homme", rhythm: "Normal" },
  { offense: "Jeu extérieur", defense: "Zone press", rhythm: "Rapide" }, // ancien format : priorité n° 1 seule
];

(async () => {
  // --- Direct ---------------------------------------------------------------
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const root = dom.window.document.getElementById("root");
  const { createLiveView } = await import(pathToFileURL(path.join(__dirname, "assets/live/live-view.js")).href);
  const view = createLiveView(root, { quarterLength: 600 });
  const team = (name, short, color, tactics) => ({ name, short, score: 0, quarterScores: [0, null, null, null], teamFouls: 0, timeoutsLeft: 0, timeoutsTotal: 0, color, logo: "", mine: false, tactics,
    players: [{ id: short + ":1", name: "Joueur " + short, pos: "M", starter: true, onCourt: true, seconds: 60, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 }] });
  view.update({ status: "live", quarter: 1, clock: 500, possession: 0, halftimeResumeIn: null, meta: null, courtLogo: "",
    teams: [team("BC Dia", "BCD", "#e08a2e", TAC[0]), team("Gotham", "GOT", "#f4f4f4", TAC[1])], shots: [], events: [] });
  const cards = root.querySelectorAll(".tactics .tac-card");
  assert(cards.length === 2, "direct : une carte de tactiques par équipe");
  assert(!root.querySelector(".tactics table"), "direct : plus d'ancien tableau");
  assert(cards[0].querySelector(".tac-name").textContent === "BC Dia", "direct : nom du club en tête de carte");
  const offs = [...cards[0].querySelectorAll(".tac-off > div")];
  assert(offs.length === 3 && offs[0].classList.contains("main") && offs[0].textContent.includes("Transition rapide"), "direct : 3 priorités offensives, la n° 1 mise en avant");
  assert(cards[1].querySelectorAll(".tac-off > div").length === 1 && cards[1].textContent.includes("Jeu extérieur"), "direct : ancien format (priorité n° 1 seule) géré");
  assert(cards[0].querySelectorAll(".tac-speed i.on").length === 2 && cards[1].querySelectorAll(".tac-speed i.on").length === 3, "direct : jauge de rythme (Normal 2 barres, Rapide 3)");
  assert(cards[1].getAttribute("style").includes("--tc-ink"), "direct : maillot clair → chiffre n° 1 foncé");
  assert(!cards[0].getAttribute("style").includes("--tc-ink"), "direct : maillot foncé → chiffre blanc");

  // --- Feuille de match -----------------------------------------------------
  const html = fs.readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf-8");
  const src = html.slice(html.indexOf("const TACTIC_RHYTHM_LEVEL"), html.indexOf("function matchQuarterScoresFromTeam"));
  const fn = new Function("escapeHtml", "teamLogoHtml", "hmLiveColors", src + "; return matchTacticsHtml;")(
    s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"), t => `<svg data-logo="${t.name}"></svg>`, () => ["#e08a2e", "#f4f4f4"]);
  const out = new JSDOM(`<div>${fn({ home: TAC[0], away: TAC[1] }, { name: "BC Dia" }, { name: "Gotham" })}</div>`).window.document;
  const bc = out.querySelectorAll(".mbx-tactics .tac-card");
  assert(bc.length === 2 && out.querySelector('[data-logo="BC Dia"]'), "feuille de match : deux cartes avec l'écusson du club");
  assert(bc[0].querySelector(".tac-off .main").textContent.includes("Transition rapide"), "feuille de match : priorité n° 1 mise en avant");
  assert(bc[1].getAttribute("style").includes("--tc-ink"), "feuille de match : maillot clair → chiffre foncé");
  assert(fn(null, { name: "A" }, { name: "B" }) === "", "feuille de match : rien sans tactiques enregistrées");
  console.log("🏁 tactics_block_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
