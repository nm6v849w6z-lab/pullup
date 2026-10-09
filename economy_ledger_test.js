// Bilan économique par poste (retour communauté 2026-09-30, « Economy
// weekly report ») : transactions rangées par catégorie et cumulées par
// semaine (Team.financeLedger), carte « Bilan » de l'Économie avec la
// semaine en cours, la précédente et la saison.
const fs = require("fs");
const Engine = require("./engine.js");
const { startTestServer, openGame } = require("./test_helpers.js");
function check(c, m) { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); }
(async () => {
  const cat = Engine.financeCategoryOf;
  check(cat("Billetterie vs Nice (3000 spect.)", 1) === "tickets" && cat("Prime de victoire Bar", 1) === "sponsors" && cat("Salaire du staff (médecin)", -1) === "staff"
    && cat("Station TV : Studio local", -1) === "works" && cat("Achat de X (enchères)", -1) === "purchases" && cat("Subvention de démarrage", 1) === "other_in" && cat("Sponsor Fnac (Maillot)", 1) === "sponsors", "catégories des transactions (subvention dans Autres recettes, sponsors à part)");
  const lg = Engine.generateLeague(Engine.generateStartingRoster("X"));
  const t = lg.teams[0];
  t.week = 4; t.recordTransaction("Salaires des joueurs", -1000); t.recordTransaction("Droits TV (Division I)", 5000); t.recordTransaction("Droits TV (Division I)", 5000);
  check(t.financeLedger["1:4"].wages === -1000 && t.financeLedger["1:4"].tv === 10000, "cumul par semaine et par poste");
  check(Engine.serializeTeam(t).financeLedger["1:4"].tv === 10000, "bilan sauvegardé");

  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(require("./test_game_html.js").readGameHtml(), baseUrl);
  const win = dom.window, doc = win.document;
  win.eval(`teamA.financeLedger = {}; teamA.week = 2;
    teamA.recordTransaction("Salaires des joueurs", -40000); teamA.recordTransaction("Billetterie vs A (3000 spect.)", 90000);
    teamA.week = 3; teamA.recordTransaction("Salaires des joueurs", -40000); teamA.recordTransaction("Sponsor B (Maillot)", 20000);`);
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "economie").click();
  const card = doc.getElementById("economieLedger");
  const txt = () => card.textContent.replace(/\s+/g, " ");
  check(/Semaine 3/.test(txt()) && /Semaine 2/.test(txt()) && /Saison/.test(txt()), "trois vues : semaine en cours, précédente, saison");
  check(/Sponsors/.test(txt()) && /Salaires des joueurs/.test(txt()) && /sem\. 2/.test(txt()), "semaine en cours comparée à la précédente");
  // Semaine en cours (retour utilisateur 2026-10-02) : ce qui n'est pas
  // encore versé est PRÉVU d'après la situation actuelle (salaires, droits TV,
  // produits dérivés, contrats de sponsors en cours), jamais 0.
  win.eval(`teamA.week = 4; teamA.sponsorContracts = [{ id: "s1", status: "active", weekly: 12345, sponsorName: "Test", slotLabel: "Maillot" }]; teamA.recordTransaction("Billetterie vs C (3000 spect.)", 50000);`);
  win.eval("ecoRenderLedger()");
  // Montant inséré dans une RegExp : « $ » (monnaie du jeu) échappé.
  const fmt = n => win.eval(`ecoMoney(${n})`).replace(/\u202f|\u00a0/g, " ").replace(/^[-−+]/, "").replace(/\$/g, "\\$");
  const t4 = txt().replace(/\u202f|\u00a0/g, " ");
  const wages = win.eval("teamA.players.reduce((s, p) => s + p.salary, 0)");
  const merch = win.eval("ecoRecurring().merch");
  check(new RegExp("Salaires des joueurs ?−" + fmt(wages)).test(t4) && /Sponsors ?\+12 345/.test(t4) && (!merch || new RegExp("Produits dérivés ?\\+" + fmt(merch)).test(t4))
    && /Solde prévu de la semaine/.test(t4) && /prévus d'après la situation actuelle/.test(t4) && !/≈/.test(t4), "semaine en cours : salaires, sponsors et produits dérivés prévus d'après la situation actuelle : " + t4.slice(0, 500));
  check(!/Subvention/.test(t4), "plus de ligne Subvention de démarrage (dans Autres recettes)");
  win.eval(`teamA.recordTransaction("Salaires des joueurs", -41000);`);
  win.eval("ecoRenderLedger()");
  check(/Salaires des joueurs ?−41 000/.test(txt().replace(/\u202f|\u00a0/g, " ")), "montant versé : vrai chiffre à la place du prévu");
  win.eval(`teamA.sponsorContracts = []`);
  win.eval(`teamA.week = 3`); win.eval("ecoRenderLedger()");
  card.querySelector('[data-eco-ledger="prev"]').click();
  check(/Sponsors/.test(txt()) && /Droits TV/.test(txt()) && /Boutique des supporters/.test(txt()), "semaine sans sponsor : ligne Sponsors (et Droits TV, Boutique) affichée quand même");
  card.querySelector('[data-eco-ledger="season"]').click();
  check(/Solde de la saison ?\+39\s?000/.test(txt().replace(/\u202f|\u00a0/g," ")) && /Billetterie/.test(txt()), "vue saison : cumul");
  server.close();
  console.log("\n🏁 economy_ledger_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
