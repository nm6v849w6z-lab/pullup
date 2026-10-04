// Négociation depuis la fiche joueur (retour utilisateur 2026-10-04 :
// « pouvoir négocier avec le joueur sur la TL directement quand on est sur
// son profil […] éviter de devoir faire des allers-retours entre les
// pages »). Fiche d'un joueur d'un autre club en vente : carte « Liste des
// transferts » avec la négociation du Marché ; offre trop basse refusée sans
// révéler de fourchette ; accord au salaire demandé ; bouton vers l'annonce.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const assert = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 25)); } return false; };

(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await flush(dom);
  const win = dom.window, doc = win.document;
  const l = win.eval(`league.transferListings.find(x => x.status === "open" && !x.foreign && x.sellerIdx != null && x.sellerIdx !== myTeamIndex)`);
  assert(!!l, "une annonce d'un autre club est ouverte");
  win.showPlayerDetail(l.sellerIdx, l.playerId);
  const card = () => doc.getElementById("pdpTransferCard");
  assert(!!card() && /Liste des transferts/.test(card().textContent), "fiche : carte « Liste des transferts »");
  assert(!!doc.getElementById(`negoSalary_${l.id}`) && !doc.getElementById(`negoSalary_${l.id}`).hasAttribute("min"), "fiche : champ de salaire, sans borne basse affichée");

  doc.getElementById(`negoSalary_${l.id}`).value = "10";
  card().querySelector(`[data-mk-negotiate="${l.id}"]`).click();
  assert(await waitFor(() => card() && card().querySelector(".mk-nego-msg.no")), "offre trop basse : message de refus sur la fiche");
  assert(!/\d/.test(card().querySelector(".mk-nego-msg.no").textContent), "le refus ne révèle aucune borne chiffrée");

  doc.getElementById(`negoSalary_${l.id}`).value = String(l.askedSalary);
  card().querySelector(`[data-mk-negotiate="${l.id}"]`).click();
  assert(await waitFor(() => card() && card().querySelector(".mk-deal-ok")), "offre au salaire demandé : accord affiché sur la fiche");
  assert(!doc.getElementById("playerDetailSection").classList.contains("hidden"), "on reste sur la fiche joueur");

  card().querySelector("[data-pdp-market-goto]").click();
  assert(!doc.getElementById("marcheSection").classList.contains("hidden") && !!doc.getElementById(`bid_${l.id}`), "« Enchérir sur le Marché » ouvre l'annonce, champ d'enchère prêt");

  await flush(dom);
  await dom.window.close();
  server.close();
  console.log("🏁 pdp_transfer_negotiation_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
