// Correctifs du 2026-10-07 :
//  - statut « blessé » cohérent entre l'Effectif et la fiche joueur (une
//    seule source : playerInjuryStatus, dérivée de injuryUntil/injuryType),
//    retour automatique à « disponible » à la guérison ;
//  - « Trier par note » du marché : tri numérique sur la note AFFICHÉE
//    (mkListingRating, GEN du meilleur poste), départage stable.
// Cas vérifiés (demande utilisateur) :
//  1. joueur blessé → blessure visible dans l'Effectif ET sur sa fiche ;
//  2. joueur guéri → disponible dans les deux écrans (sans recharger) ;
//  3. marché, notes différentes → ordre parfaitement décroissant ;
//  4. même tri avec des filtres actifs → toujours correct ;
//  5. notes égales → ordre secondaire stable.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, writeRawSave } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

(async () => {
  const { server, savePath, baseUrl } = await startTestServer();
  try {
    let dom = await openGame(html, baseUrl);
    await flush(dom);
    dom.window.close();

    const now = Date.now();
    const save = readRawSave(savePath);
    const p0 = save.team.players[0];
    p0.injuryType = "Entorse de la cheville";
    p0.injuryUntil = now + 4 * 86400000 + 3600000;
    p0.injuryHistory = []; // blessure absente du journal : la fiche doit quand même l'afficher
    save.team.injuryLog = [];
    writeRawSave(savePath, save);

    dom = await openGame(html, baseUrl);
    const win = dom.window, doc = win.document;
    const pid = JSON.stringify(p0.id);
    const tab = k => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === k).click();

    // ---- 1. Joueur blessé : Effectif ET fiche. ----
    tab("effectif"); await flush(dom);
    const effRow = () => doc.querySelector(`#effectifSection tr.eff-row[data-player-id="${p0.id}"]`);
    check(effRow() && effRow().dataset.injuryStatus === "injured" && effRow().classList.contains("injured") && effRow().querySelector(".injury-cross"),
      "1. Effectif : le joueur blessé est marqué (ligne rouge, croix)");
    win.eval(`showPlayerDetail(myTeamIndex, ${pid})`); await flush(dom);
    const pdp = () => doc.getElementById("playerDetailContent");
    check(pdp().querySelector(".pdp-injury-notice") && /Entorse de la cheville/.test(pdp().querySelector(".pdp-injury-notice").textContent) && /5 jours restants/.test(pdp().querySelector(".pdp-injury-notice").textContent),
      "1. Fiche : bandeau « Blessé » avec type et durée restante");
    check(pdp().querySelector(".pdp2-cond").dataset.injuryStatus === "injured" && /Blessé · 5 j/.test(pdp().querySelector(".pdp2-cond").textContent) && !/Pas de fatigue/.test(pdp().querySelector(".pdp2-cond").textContent),
      "1. Fiche : la tuile Forme annonce la blessure (plus de « Pas de fatigue »)");
    const cur = pdp().querySelector(".pdp2-inj-card [data-injury-current]");
    check(cur && /En cours/.test(cur.textContent) && /Entorse de la cheville/.test(cur.textContent) && !/Aucune blessure/.test(pdp().querySelector(".pdp2-inj-card").textContent),
      "1. Fiche : la carte Blessures montre la blessure en cours, même absente du journal");
    const st = win.eval(`JSON.stringify(playerInjuryStatus(teamA.players.find(p => p.id === ${pid})))`);
    const sObj = JSON.parse(st);
    check(sObj.injured && !sObj.available && sObj.type === "Entorse de la cheville" && sObj.days === 5, "1. source unique : playerInjuryStatus (blessé, type, 5 jours)");

    // ---- 2. Guérison : les deux écrans reviennent à « disponible » tout seuls. ----
    tab("effectif"); await flush(dom);
    win.eval("injuryWatchTick()"); // état de référence
    win.eval(`teamA.players.find(p => p.id === ${pid}).injuryUntil = Date.now() - 1000`);
    check(win.eval("injuryWatchTick()") === true, "2. guérison détectée sans rechargement");
    check(effRow() && effRow().dataset.injuryStatus === "available" && !effRow().classList.contains("injured") && !effRow().querySelector(".injury-cross"),
      "2. Effectif : redessiné, joueur disponible");
    win.eval(`showPlayerDetail(myTeamIndex, ${pid})`); await flush(dom);
    check(!pdp().querySelector(".pdp-injury-notice") && pdp().querySelector(".pdp2-cond").dataset.injuryStatus === "available" && !pdp().querySelector("[data-injury-current]"),
      "2. Fiche : joueur disponible, plus de blessure en cours");
    // Fiche ouverte au moment où le joueur se blesse puis guérit : suit aussi.
    win.eval(`teamA.players.find(p => p.id === ${pid}).injuryUntil = Date.now() + 86400000`);
    win.eval("injuryWatchTick()");
    check(pdp().querySelector(".pdp2-cond").dataset.injuryStatus === "injured", "2. fiche ouverte : la nouvelle blessure apparaît");
    win.eval(`teamA.players.find(p => p.id === ${pid}).injuryUntil = Date.now() - 1`);
    win.eval("injuryWatchTick()");
    check(pdp().querySelector(".pdp2-cond").dataset.injuryStatus === "available", "2. fiche ouverte : la guérison apparaît");

    // ---- 3 à 5. Marché : tri par note. ----
    win.eval(`(() => {
      const cpus = league.teams.map((t, i) => i).filter(i => i !== myTeamIndex);
      cpus.slice(0, 3).forEach(ci => league.teams[ci].players.slice(0, 6).forEach((p, k) => league.listPlayerForSale(ci, p.id, 1000 + k * 7000, Date.now())));
    })()`);
    tab("marche"); await flush(dom);
    const sel = doc.getElementById("marketSort");
    sel.value = "ovr"; sel.dispatchEvent(new win.Event("change", { bubbles: true }));
    await flush(dom);
    const rows = () => JSON.parse(win.eval("JSON.stringify(mkFilteredListings().map(r => ({ id: String(r.l.id), note: mkListingRating(r.player), ovr: r.player.overall(), pot: potentialTierIndex(r.player.potential), age: r.player.age, name: r.player.name, pos: r.player.position, next: minNextBidFor(r.l) })))"));
    const decreasing = list => list.every((r, i) => i === 0 || list[i - 1].note >= r.note);
    const all = rows();
    check(all.length >= 12, `${all.length} annonces sur le marché`);
    check(all.every(r => typeof r.note === "number" && Number.isFinite(r.note)), "3. la note triée est un nombre");
    check(decreasing(all), "3. « Trier par note » : ordre parfaitement décroissant");
    check(all[0].note === Math.max(...all.map(r => r.note)), "3. la meilleure note est en tête");
    // La note affichée sur chaque carte = la note triée, dans le même ordre.
    const shownNotes = [...doc.querySelectorAll("#marketListings .mk-lst .mk-lst-prof .pdp-overall-num")].map(e => Number(e.textContent));
    check(shownNotes.length === all.length && shownNotes.every((n, i) => n === all[i].note), "3. notes affichées sur les cartes = ordre trié");
    check(all.some(r => Math.round(r.ovr) !== r.note), "3. (la note affichée diffère d'overall() pour certains joueurs : l'ancien tri était faux)");
    check(sel.value === "ovr" && win.eval("marketUi.sort") === "ovr", "3. le tri choisi reste sélectionné après rendu");

    // 4. Filtres actifs : poste, prix, âge.
    const pos = all[0].pos;
    win.eval(`marketUi.pos = ${JSON.stringify(pos)}; renderMarketListings();`);
    const byPos = rows();
    check(byPos.length > 0 && byPos.every(r => r.pos === pos) && decreasing(byPos), `4. filtre poste (${pos}) : toujours décroissant`);
    win.eval("marketUi.pos = 'all'");
    const prices = all.map(r => r.next).sort((a, b) => a - b);
    win.eval(`marketUi.priceMax = ${prices[Math.floor(prices.length / 2)]}; renderMarketListings();`);
    const byPrice = rows();
    check(byPrice.length > 0 && byPrice.length < all.length && decreasing(byPrice), "4. filtre prix : toujours décroissant");
    win.eval("marketUi.priceMax = null");
    const ages = all.map(r => r.age).sort((a, b) => a - b);
    win.eval(`marketUi.ageMin = ${ages[Math.floor(ages.length / 3)]}; renderMarketListings();`);
    const byAge = rows();
    check(byAge.length > 0 && decreasing(byAge), "4. filtre âge : toujours décroissant");
    win.eval("mkResetFilters(); renderMarketListings();");
    check(win.eval("marketUi.sort") === "ovr" && sel.value === "ovr" && decreasing(rows()), "4. réinitialiser les filtres ne change pas le tri choisi");

    // 5. Notes égales : départage stable (potentiel, âge, nom, annonce).
    win.eval(`(() => {
      const ls = mkOpenListings().slice(0, 4);
      ls.forEach(l => { const p = league.listingPlayer(l); p.attrs = { ...league.listingPlayer(ls[0]).attrs }; p.position = league.listingPlayer(ls[0]).position; });
    })()`);
    const tieIds = JSON.parse(win.eval("JSON.stringify(mkOpenListings().slice(0, 4).map(l => String(l.id)))"));
    const order1 = rows().filter(r => tieIds.includes(r.id));
    check(order1.length === 4 && new Set(order1.map(r => r.note)).size === 1, "5. quatre joueurs à la même note");
    const tieOk = order1.every((r, i) => {
      if (!i) return true;
      const a = order1[i - 1];
      return a.pot > r.pot || (a.pot === r.pot && (a.age < r.age || (a.age === r.age && (a.name.localeCompare(r.name, "fr") < 0 || (a.name === r.name && a.id.localeCompare(r.id) <= 0)))));
    });
    check(tieOk, "5. à note égale : potentiel, puis âge, puis nom, puis annonce");
    // Ordre identique quel que soit l'ordre d'entrée.
    win.eval("league.transferListings.reverse()");
    const order2 = rows().filter(r => tieIds.includes(r.id));
    check(order2.map(r => r.id).join() === order1.map(r => r.id).join(), "5. ordre secondaire stable (indépendant de l'ordre des annonces)");
    check(decreasing(rows()), "5. le classement principal par note reste décroissant");
  } finally {
    server.close();
  }
  console.log("\nTous les tests statut blessé / tri du marché passent.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
