// Marché : pays au choix (avec recherche) et barres âge / potentiel / prix
// (retour utilisateur 2026-10-01 : « il faut pouvoir choisir le pays de son
// choix (mets une petite recherche dans l'onglet) » et « pour l'âge, le
// potentiel et le prix, mets un système de barres »). Vérifie aussi la
// conversion des anciennes alertes (tranches d'âge, seuil de potentiel,
// prix "budget"/montant) côté moteur/serveur et côté page.
const fs = require("fs");
const E = require("./engine.js");
const actions = require("./server/actions.js");
function check(cond, msg) { if (!cond) throw new Error(`❌ ${msg}`); console.log(`✅ ${msg}`); }

// 1) Moteur / serveur : anciennes alertes converties en fourchettes.
{
  const a = E.sanitizeMarketAlert({ pos: "Pivot", age: "22-25", pot: 40, price: "150000" });
  check(a.ageMin === 22 && a.ageMax === 25 && a.potMin === E.potentialTierIndex(40) && a.potMax === null && a.priceMax === 150000 && a.priceMin === null && a.budget === false,
    "ancienne alerte (22–25 ans, Starter et plus, 150 000 $) convertie en fourchettes");
  const b = E.sanitizeMarketAlert({ age: "30+", price: "budget" });
  check(b.ageMin === 30 && b.ageMax === null && b.budget === true, "« 30 ans et plus » + « Dans mon budget » convertis");
  check(E.sanitizeMarketAlert({ age: "u21" }).ageMax === 21, "« 21 ans et moins » converti");
  check(E.sanitizeMarketAlert({ age: "all", pot: 0, price: "0" }) === null && E.sanitizeMarketAlert({ potMin: 1, potMax: 10 }) === null, "fourchettes complètes = aucune condition (alerte refusée)");
  const c = E.sanitizeMarketAlert({ ageMin: 28, ageMax: 20, potMin: 7, potMax: 3, priceMin: 5000, priceMax: 1000 });
  check(c.ageMin === 20 && c.ageMax === 28 && c.potMin === 3 && c.potMax === 7 && c.priceMin === 1000 && c.priceMax === 5000, "bornes inversées remises dans l'ordre");
  check(E.marketAlertLabel(a).replace(/[\u00a0\u202f]/g, " ") === "Pivot · 22–25 ans · Potentiel : Starter et plus · Prix : jusqu'à 150 000 $", "libellé lisible des fourchettes");

  const T0 = Date.UTC(2026, 9, 1, 9);
  const lg = E.generateMultiManagerLeague(["A", "B"], 1, T0, { dailyAnchored: true });
  const me = lg.teams.findIndex(t => t.isHuman);
  const team = lg.teams[me];
  team.setPaying(true);
  const cpuIdx = lg.teams.findIndex(t => !t.isHuman);
  const cpu = lg.teams[cpuIdx];
  const p = cpu.players[0];
  const tier = E.potentialTierIndex(p.potential);
  const l = lg.listPlayerForSale(cpuIdx, p.id, 5000, T0 + 1000);
  const next = E.minNextBidFor(l);
  check(E.marketAlertMatches({ ageMin: p.age, ageMax: p.age, potMin: tier, potMax: tier, priceMin: next, priceMax: next }, p, l), "correspondance : bornes incluses");
  check(!E.marketAlertMatches({ potMax: Math.max(1, tier - 1) }, p, l) || tier === 1, "potentiel au-dessus du palier maximum : exclu");
  check(!E.marketAlertMatches({ priceMax: next - 1 }, p, l) && !E.marketAlertMatches({ priceMin: next + 1 }, p, l), "prix hors fourchette : exclu");
  check(E.marketAlertMatches({ age: p.age <= 21 ? "u21" : p.age >= 30 ? "30+" : p.age <= 25 ? "22-25" : "26-29" }, p, l), "une alerte à l'ancien format (non convertie) fonctionne encore");
  // Alerte enregistrée au nouveau format par la route serveur, puis vérifiée à chaque passage.
  const r = actions.setMarketAlert(team, me, lg, { op: "save", alert: { pos: p.position, ageMin: p.age, ageMax: p.age } }, T0);
  check(r.ok && r.alert.ageMin === p.age && r.alert.ageMax === p.age, "route /api/market/alert : fourchette d'âge enregistrée");
  const l2 = lg.listPlayerForSale(cpuIdx, cpu.players.find(x => x.id !== p.id && x.position === p.position && x.age === p.age)?.id ?? cpu.players[1].id, 5000, T0 + 2000);
  lg.checkMarketAlerts(T0 + 3000);
  const l2p = lg.listingPlayer(l2);
  check(team.feed.entries.some(e => e.key === `mkt_alert_${l2.id}`) === (l2p.position === p.position && l2p.age === p.age), "alerte « fourchette » évaluée par le serveur");
  // Sauvegarde ancienne : alertes converties au chargement.
  const raw = JSON.parse(JSON.stringify(E.serializeTeam(team)));
  raw.marketAlerts = [{ id: "al_old", createdAt: 1, pos: "all", age: "u21", pot: 50, price: "budget", crit: [] }];
  const back = E.teamFromSave(raw);
  const m = back.marketAlerts[0];
  check(m && m.ageMax === 21 && m.potMin === E.potentialTierIndex(50) && m.budget === true && !("age" in m) && !("price" in m), "sauvegarde ancienne : alerte convertie au chargement");
}

// 2) Page Marché.
(async () => {
  const { startTestServer, openGame, flush } = require("./test_helpers.js");
  const html = fs.readFileSync("moteurbasket3.html", "utf-8");
  const { server } = await startTestServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const dom = await openGame(html, baseUrl);
    const doc = dom.window.document;
    const win = dom.window;
    // Six annonces CPU à des prix très différents ; deux deviennent des
    // annonces « italiennes » (marché mondial, l.foreign).
    win.eval(`(() => {
      const cpu = league.teams.findIndex((t, i) => i !== myTeamIndex);
      const prices = [1, 800, 5000, 40000, 250000, 900000];
      league.teams[cpu].players.slice(0, 6).forEach((p, i) => league.listPlayerForSale(cpu, p.id, prices[i], Date.now()));
      mkOpenListings().slice(0, 2).forEach(l => { l.foreign = { leagueId: "it-1", label: "Division I", country: "it", sellerName: "Roma" }; });
      teamA.budget = 100000;
    })()`);
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "marche").click();
    await flush(dom);
    const cards = () => [...doc.querySelectorAll("#marketListings .mk-lst")];
    const shown = () => win.eval("mkFilteredListings().map(r => ({ id: r.l.id, age: r.player.age, tier: potentialTierIndex(r.player.potential), next: minNextBidFor(r.l), country: mkListingCountry(r.l) }))");
    const total = win.eval("mkOpenListings().length");
    check(cards().length === total && total >= 6, `${total} annonces affichées au départ`);
    check(!doc.getElementById("marketOrigin") && !doc.getElementById("marketAge") && !doc.getElementById("marketPot") && !doc.getElementById("marketPrice"), "anciennes listes déroulantes retirées");

    // Pays au choix.
    const btn = () => doc.querySelector("[data-mk-origin-btn]");
    const menu = () => doc.querySelector("#marketOriginBox .pc-picker-menu");
    check(/Monde entier/.test(btn().textContent), "pays : « Monde entier » par défaut");
    btn().click();
    check(!menu().classList.contains("hidden") && btn().getAttribute("aria-expanded") === "true", "clic : la liste des pays s'ouvre");
    const opts = [...doc.querySelectorAll("#marketOriginList .pc-picker-opt")];
    const codes = opts.map(o => o.dataset.mkOrigin);
    check(codes[0] === "all" && codes[1] === "league" && codes[2] === win.eval("mkHomeCountry()") && /Votre pays/.test(opts[2].textContent), "« Monde entier », « Mon championnat », puis votre pays en tête");
    check(["us", "it", "de", "es", "cn", "tw"].every(c => codes.includes(c)) && opts.slice(2).every(o => o.querySelector(".nat-flag")), "tous les pays du marché mondial, avec leur drapeau");
    const filter = doc.getElementById("marketOriginFilter");
    filter.value = "ital"; filter.dispatchEvent(new win.Event("input", { bubbles: true }));
    const vis = opts.filter(o => !o.hidden).map(o => o.dataset.mkOrigin);
    check(vis.length === 1 && vis[0] === "it", "recherche « ital » : seule l'Italie reste");
    filter.value = "allemagne"; filter.dispatchEvent(new win.Event("input", { bubbles: true }));
    check(opts.filter(o => !o.hidden).map(o => o.dataset.mkOrigin).join() === "de", "recherche « allemagne » : l'Allemagne");
    filter.value = "ital"; filter.dispatchEvent(new win.Event("input", { bubbles: true }));
    filter.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    check(menu().classList.contains("hidden") && /Italie/.test(btn().textContent), "Entrée : l'Italie est choisie, la liste se ferme");
    const byCountry = c => win.eval(`mkOpenListings().filter(l => mkListingCountry(l) === "${c}").length`);
    check(shown().length === byCountry("it") && shown().length >= 2 && shown().every(r => r.country === "it"), "pays « Italie » : seules les annonces italiennes");
    btn().click(); doc.querySelector('[data-mk-origin="league"]').click();
    const nLocal = win.eval("mkOpenListings().filter(l => !l.foreign).length");
    check(shown().length === nLocal && nLocal >= 2 && shown().every(r => r.country === win.eval("mkHomeCountry()")), "« Mon championnat » : les annonces des autres championnats disparaissent");
    btn().click(); doc.querySelector(`[data-mk-origin="${win.eval("mkHomeCountry()")}"]`).click();
    check(shown().length === byCountry(win.eval("mkHomeCountry()")) && shown().length >= nLocal, "votre pays : les annonces des championnats de votre pays");
    // Annonces mondiales tirées au hasard : on prend n'importe quel pays sans annonce.
    const empty = win.eval("MK_WORLD_COUNTRIES").find(c => !byCountry(c) && doc.querySelector(`[data-mk-origin="${c}"]`));
    if (empty) {
      btn().click(); doc.querySelector(`[data-mk-origin="${empty}"]`).click();
      check(cards().length === 0 && /Aucun joueur/.test(doc.getElementById("marketListings").textContent), "pays sans annonce : liste vide");
    }
    btn().click();
    doc.getElementById("marketOriginFilter").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    check(menu().classList.contains("hidden"), "Échap : la liste se ferme");
    btn().click(); doc.querySelector('[data-mk-origin="all"]').click();
    check(shown().length === total, "« Monde entier » : tout revient");

    // Barres.
    const range = k => doc.querySelector(`.mk-range[data-mk-range="${k}"]`);
    const ins = k => [...range(k).querySelectorAll(".mk-range-in")];
    const slide = (el, v) => { el.value = String(v); el.dispatchEvent(new win.Event("input", { bubbles: true })); };
    const settle = () => new Promise(r => setTimeout(r, 200));
    const ages = shown().map(r => r.age);
    const [aLo, aHi] = ins("age");
    check(Number(aLo.min) === Math.min(...ages) && Number(aLo.max) === Math.max(...ages) && aLo.value === aLo.min && aHi.value === aHi.max, "âge : bornes = âges extrêmes des annonces");
    check(range("age").querySelector(".mk-range-val").textContent === `${Math.min(...ages)} - ${Math.max(...ages)}`, "âge : fourchette affichée « min - max »");
    const sorted = ages.slice().sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    slide(aLo, mid); await settle();
    check(shown().every(r => r.age >= mid) && cards().length === shown().length && shown().length < total, `âge minimum ${mid} : appliqué aux annonces`);
    slide(aHi, mid - 1);
    check(aHi.value === String(mid) && win.eval("marketUi.ageMax") === (mid === Math.max(...ages) ? null : mid), "les poignées ne se croisent pas");
    range("age").querySelector("[data-mk-range-reset]").click();
    check(win.eval("marketUi.ageMin === null && marketUi.ageMax === null") && aLo.value === aLo.min && aHi.value === aHi.max && shown().length === total, "bouton de remise à zéro : fourchette d'âge complète");

    const [pLo, pHi] = ins("pot");
    check(pLo.min === "1" && pLo.max === "10" && /Débutant/.test(range("pot").querySelector(".mk-range-ends").textContent) && /Générationnel/.test(range("pot").querySelector(".mk-range-ends").textContent), "potentiel : barre sur les 10 paliers (libellés, jamais le chiffre)");
    const tiers = shown().map(r => r.tier);
    const tMax = Math.max(...tiers);
    slide(pHi, tMax - 1); await settle();
    check(shown().every(r => r.tier <= tMax - 1) && shown().length < total && range("pot").querySelector(".mk-range-val").textContent.includes(win.eval(`POTENTIAL_TIERS[${tMax - 2}].label`)), "potentiel maximum : appliqué par palier, libellé affiché");
    range("pot").querySelector("[data-mk-range-reset]").click();

    const [rLo, rHi] = ins("price");
    const steps = win.eval("mkRangeBounds().priceSteps");
    const nexts = win.eval("mkOpenListings().map(l => minNextBidFor(l))");
    const maxNext = Math.max(...nexts);
    check(steps[0] === 0 && steps.every((v, k) => k === 0 || v > steps[k - 1]) && steps[steps.length - 1] >= maxNext && Number(rHi.max) === steps.length - 1, "prix : paliers croissants de 0 au prix le plus haut (arrondi)");
    // Paliers répartis selon les annonces (retour 2026-10-01) : aucun
    // intervalle ne concentre la majorité des annonces.
    // (en prix distincts : plusieurs annonces à 1 $ tombent forcément ensemble).
    const uniq = [...new Set(nexts)];
    const per = steps.slice(1).map((v, k) => uniq.filter(n => n > steps[k] && n <= v).length);
    check(Math.max(...per) <= Math.max(3, Math.ceil(uniq.length * 0.35)), `prix : paliers répartis selon les annonces (max ${Math.max(...per)} / ${uniq.length} prix distincts par palier)`);
    const iHi = Math.floor(steps.length * 0.6), iLo = Math.floor(steps.length * 0.25);
    slide(rHi, iHi); await settle();
    check(shown().every(r => r.next <= steps[iHi]) && shown().length >= 1 && shown().length < total, "prix maximum : appliqué (prochaine enchère)");
    check(/\$/.test(range("price").querySelector(".mk-range-val").textContent), "prix : fourchette affichée avec le format monétaire du jeu");
    slide(rLo, iLo); await settle();
    check(shown().every(r => r.next >= steps[iLo] && r.next <= steps[iHi]), "prix minimum + maximum");
    doc.getElementById("marketBudgetBtn").click();
    check(win.eval("marketUi.budget") && doc.getElementById("marketBudgetBtn").getAttribute("aria-pressed") === "true", "« Dans mon budget » : interrupteur");

    // Alerte avec ces filtres (Premium), puis remise à zéro générale.
    win.eval("teamA.setPaying(true); renderMarcheSection();");
    doc.querySelector("[data-mk-alert-save]").click();
    await win.__lastMarketAlertSync;
    const al = win.eval("JSON.stringify(teamA.marketAlerts[0])");
    const alert = JSON.parse(al);
    check(alert.priceMin === steps[iLo] && alert.priceMax === steps[iHi] && alert.budget === true && alert.ageMin === null, "alerte enregistrée avec les fourchettes des barres");
    check(/Prix : .+ \$ à .+ \$/.test(doc.getElementById("marketAlertsBar").textContent.replace(/[\u00a0\u202f]/g, " ")), "alerte affichée avec sa fourchette de prix");
    doc.querySelector("[data-mk-alert-del]").click();
    await win.__lastMarketAlertSync;
    btn().click(); doc.querySelector('[data-mk-origin="it"]').click();
    doc.querySelector("[data-mk-reset]").click();
    check(win.eval("marketUi.origin === 'all' && marketUi.priceMin === null && marketUi.priceMax === null && !marketUi.budget") && rHi.value === rHi.max && /Monde entier/.test(btn().textContent) && shown().length === total,
      "« Réinitialiser les filtres » : pays, barres et budget remis à zéro");
    dom.window.close();
  } finally {
    server.close();
  }
  console.log("\n🏁 market_filters_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
