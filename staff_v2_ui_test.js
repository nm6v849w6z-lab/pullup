// Page Staff v2 + Marché en mode Staff (retour utilisateur 2026-10-01 : « la
// page staff est fade et ne ressemble pas au reste du jeu », le recrutement
// passe dans le Marché, onglet Staff sous Économie, avatars en polo sans
// bandeau ni crête, pas d'emoji). Vérifie :
// 1) barre latérale : Staff dans le groupe Club, juste sous Économie ;
// 2) page Staff : une carte par poste, seulement le staff en poste (plus
//    aucune enchère sur la page), carte vide avec « Recruter un … » qui
//    ouvre le Marché en mode Staff filtré sur ce rôle ;
// 3) Marché : bascule Joueurs | Staff (mode Joueurs inchangé), filtres du
//    staff (rôle, spécialité, niveau, salaire, dans mon budget) ;
// 4) embauche depuis le Marché, avec confirmation quand le poste est
//    pourvu ; le membre engagé garde le nom et le visage du candidat ;
// 5) avatars : SVG en polo (couleurs du club en poste, polo neutre pour les
//    candidats), sans bandeau ni crête pour le staff, joueurs inchangés ;
// 6) aucun emoji dans ces vues.
const fs = require("fs");
const assert = require("assert");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = m => console.log("✅ " + m);
const EMOJI = /\p{Extended_Pictographic}/u;
const POLO_PATH = "M41 86 Q48 92 58 95"; // pan de col du polo (voir renderPolo)

(async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const dom = await openGame(html, baseUrl);
    const win = dom.window, doc = win.document;
    if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();

    // 1) Barre latérale.
    const club = doc.querySelector('.sidebar-group[data-sidebar-group="club"]');
    const links = [...club.querySelectorAll(".tab-btn[data-tab]")].map(b => b.dataset.tab);
    assert.strictEqual(links.indexOf("staff"), links.indexOf("economie") + 1, links.join(","));
    assert.ok(!doc.querySelector('.sidebar-group[data-sidebar-group="recrutement"] [data-tab="staff"]'), "plus de Staff dans Recrutement");
    ok("barre latérale : Staff dans Club, juste sous Économie");

    // 2) Page Staff : entraîneur en poste, le reste vacant.
    win.eval(`teamA.hireTrainer(3, 3000, "defense"); teamA.trainer.weeksEmployed = 6;`);
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "staff").click();
    const cards = [...doc.querySelectorAll("#staffSlots .stf-card")];
    assert.strictEqual(cards.length, 6, "6 postes");
    assert.deepStrictEqual(cards.map(c => c.dataset.staffRole), ["coach", "assistant", "recruiter", "doctor", "physio", "analyst"]);
    const sec = doc.getElementById("staffSection");
    assert.ok(!sec.querySelector("table, .mk-stf, [data-mk-staff-bid], [data-staff-bid], input[type=number]"), "aucune enchère sur la page Staff");
    const coach = sec.querySelector('.stf-card[data-staff-role="coach"]');
    assert.ok(coach.classList.contains("is-filled") && coach.querySelector('[data-staff-fire="coach"]') && coach.querySelector('[data-staff-recruit="coach"]'), "entraîneur en poste : Congédier + Changer");
    assert.ok(/Rendement ×1,18/.test(coach.textContent) && /4 places individuelles/.test(coach.textContent), "effet en clair : " + coach.textContent.replace(/\s+/g, " ").slice(0, 200));
    assert.ok(/6 sem\./.test(coach.textContent) && /3\s\d{3} \$/.test(coach.textContent) && /Sans échéance/.test(coach.textContent), "salaire, ancienneté, contrat");
    const coachSvg = coach.querySelector(".staff-avatar svg");
    const clubColor = win.eval("teamAvatarColors(teamA)[0]");
    assert.ok(coachSvg && coachSvg.innerHTML.includes(POLO_PATH) && coachSvg.innerHTML.includes(`fill="${clubColor}"`), "avatar SVG en polo aux couleurs du club (" + clubColor + ")");
    assert.strictEqual(coachSvg.getAttribute("aria-label"), "Avatar du membre du staff");
    const physio = sec.querySelector('.stf-card[data-staff-role="physio"]');
    assert.ok(physio.classList.contains("is-vacant") && physio.querySelector(".staff-none"), "kiné : poste à pourvoir");
    const recruit = physio.querySelector('[data-staff-recruit="physio"]');
    assert.strictEqual(recruit.textContent.trim(), "Recruter un kiné");
    ok("page Staff : 6 cartes, staff en poste seulement, avatar polo aux couleurs du club, effet/salaire/ancienneté");

    // 3) Lien profond « Recruter un kiné » → Marché, mode Staff, filtré.
    recruit.click();
    assert.strictEqual(win.eval("currentVisiblePageId()"), "marcheSection");
    assert.strictEqual(win.eval("marketUi.mode"), "staff");
    const staffCards = () => [...doc.querySelectorAll("#marketListings .mk-stf")];
    assert.ok(staffCards().length > 0 && staffCards().every(c => c.dataset.staffListing.startsWith("physio:")), "seulement des kinés");
    assert.ok(doc.querySelector('[data-mk-staff-role="physio"]').classList.contains("on"));
    assert.ok(doc.querySelector('[data-mk-mode="staff"]').classList.contains("on") && doc.querySelector('[data-mk-mode="staff"]').getAttribute("aria-selected") === "true");
    assert.ok(!doc.getElementById("marketStaffFilters").hidden && doc.getElementById("marketPlayerFilters").hidden, "filtres du staff affichés");
    const candSvg = staffCards()[0].querySelector(".staff-avatar svg");
    assert.ok(candSvg.innerHTML.includes(POLO_PATH) && candSvg.innerHTML.includes(`fill="${win.eval("STAFF_NEUTRAL_POLO[0]")}"`), "candidat : polo neutre");
    ok("« Recruter un kiné » → Marché en mode Staff filtré sur le kiné ; candidats en polo neutre");

    // Bascule Joueurs : marché des joueurs inchangé.
    doc.querySelector('[data-mk-mode="players"]').click();
    assert.strictEqual(win.eval("marketUi.mode"), "players");
    assert.ok(doc.getElementById("marketStaffFilters").hidden && !doc.getElementById("marketPlayerFilters").hidden && !doc.getElementById("marketSort").hidden);
    assert.ok(doc.querySelector("#marketListings .market-card[data-listing-id]") && !doc.querySelector("#marketListings .mk-stf"), "annonces de joueurs");
    assert.strictEqual(doc.getElementById("marketSearchTitle").textContent, "Joueurs sur le marché");
    doc.querySelector('[data-mk-mode="staff"]').click();
    assert.ok(staffCards().every(c => c.dataset.staffListing.startsWith("physio:")), "filtre de rôle gardé au retour");
    ok("bascule Joueurs | Staff : mode Joueurs inchangé, filtres du staff gardés");

    // Filtres : rôle, niveau, salaire, budget.
    doc.querySelector('[data-mk-staff-role="all"]').click();
    const all = staffCards().length;
    assert.strictEqual(all, win.eval("mkStaffOpenAll().length"), "Tous");
    doc.querySelector('[data-mk-staff-role="doctor"]').click();
    assert.ok(staffCards().length && staffCards().every(c => c.dataset.staffListing.startsWith("doctor:")), "rôle Médecin");
    doc.querySelector('[data-mk-staff-role="all"]').click();
    const lvMin = doc.getElementById("marketStaffLevelMin");
    lvMin.value = "3"; lvMin.dispatchEvent(new win.Event("input", { bubbles: true }));
    win.eval("clearTimeout(mkRangeTimer); renderMarketListings();");
    const levelOf = c => { const [k, id] = c.dataset.staffListing.split(":"); return win.eval(`league[STAFF_ROLE_BY_KEY.${k}.listKey].find(l => l.id === ${id}).level`); };
    const priceOf = c => { const [k, id] = c.dataset.staffListing.split(":"); return win.eval(`minNextBidFor(league[STAFF_ROLE_BY_KEY.${k}.listKey].find(l => l.id === ${id}))`); };
    assert.strictEqual(win.eval("marketUi.sLevelMin"), 3);
    assert.ok(staffCards().every(c => levelOf(c) >= 3), "niveau ≥ 3");
    assert.strictEqual(staffCards().length, win.eval("mkStaffOpenAll().filter(x => x.l.level >= 3).length"));
    doc.querySelector('[data-mk-range-reset="slevel"]').click();
    assert.strictEqual(staffCards().length, all, "niveau réinitialisé");
    const salMax = doc.getElementById("marketStaffSalMax");
    salMax.value = "1"; salMax.dispatchEvent(new win.Event("input", { bubbles: true }));
    win.eval("clearTimeout(mkRangeTimer); renderMarketListings();");
    const cap = win.eval("marketUi.sSalMax");
    assert.ok(cap !== null && staffCards().every(c => priceOf(c) <= cap), "salaire ≤ " + cap);
    doc.querySelector('[data-mk-range-reset="ssal"]').click();
    win.eval("teamA.budget = 1500;");
    doc.getElementById("marketStaffBudgetBtn").click();
    assert.ok(staffCards().length < all && staffCards().every(c => priceOf(c) <= 1500), "dans mon budget (1 500 $)");
    doc.getElementById("marketStaffBudgetBtn").click();
    win.eval("teamA.budget = 300000;");
    assert.strictEqual(staffCards().length, all);
    ok("filtres du staff : rôle, niveau (barre), salaire (barre), dans mon budget");

    // 6) Pas d'emoji (page Staff + Marché en mode Staff).
    const views = [sec, doc.getElementById("marketModeToggle"), doc.getElementById("marketKpis"), doc.getElementById("marketStaffFilters"), doc.getElementById("marketListings")];
    views.forEach(v => assert.ok(!EMOJI.test(v.textContent) && !EMOJI.test(v.innerHTML), "emoji dans " + (v.id || v.className)));
    ok("aucun emoji sur la page Staff ni dans le Marché en mode Staff");

    // 4) Embauche : poste d'entraîneur déjà pourvu → confirmation, puis enchère.
    doc.querySelector('[data-mk-staff-role="coach"]').click();
    const target = win.eval("staffOpenListings(STAFF_ROLE_BY_KEY.coach).find(l => l.currentBidderIdx == null)");
    const keyId = `coach:${target.id}`;
    const card = () => doc.getElementById(`marketStaffCard_coach_${target.id}`);
    assert.ok(/Remplacera votre entraîneur actuel/.test(card().textContent), "le candidat remplacera l'entraîneur actuel");
    const name = card().querySelector(".mk-pname").textContent;
    doc.getElementById(`coachBid_${target.id}`).value = String(target.startPrice + 200);
    card().querySelector(`[data-mk-staff-bid="${keyId}"]`).click();
    assert.ok(card().querySelector(".mk-stf-confirm") && win.eval(`league.coachListings.find(l => l.id === ${target.id}).currentBidderIdx == null`), "confirmation avant d'enchérir");
    card().querySelector(`[data-mk-staff-cancel="${keyId}"]`).click();
    assert.ok(!card().querySelector(".mk-stf-confirm"), "Annuler");
    doc.getElementById(`coachBid_${target.id}`).value = String(target.startPrice + 200);
    card().querySelector(`[data-mk-staff-bid="${keyId}"]`).click();
    card().querySelector(`[data-mk-staff-confirm="${keyId}"]`).click();
    await flush(dom);
    assert.ok(win.eval(`league.coachListings.find(l => l.id === ${target.id}).currentBidderIdx === myTeamIndex`), "enchère posée");
    assert.ok(card().classList.contains("is-lead") && /Vous êtes en tête/.test(card().textContent));
    // Clôture : les clubs IA ont déjà un entraîneur 5★ (pas d'enchère IA).
    win.eval(`(() => { const l = league.coachListings.find(x => x.id === ${target.id}); league.teams.forEach(t => { if (!t.isHuman) t.trainer = { level: 5, weeksEmployed: 0, baseSalary: 1 }; }); league.refreshCoachMarket(l.closesAt + 1); })()`);
    assert.strictEqual(win.eval("teamA.trainer.baseSalary"), target.startPrice + 200, "embauché au salaire de l'enchère");
    assert.strictEqual(win.eval("teamA.trainer.sid"), target.id, "identité de l'annonce transmise");
    [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "staff").click();
    assert.strictEqual(doc.querySelector('.stf-card[data-staff-role="coach"] .stf-name').textContent, name, "même nom que le candidat : " + name);
    ok("embauche depuis le Marché : confirmation (poste pourvu), enchère, embauche, même identité");

    // Congédier → de retour sur le marché sous la même identité.
    doc.querySelector('[data-staff-fire="coach"]').click();
    assert.ok(!win.eval("teamA.trainer"));
    assert.ok(win.eval(`league.coachListings.some(l => l.status === "open" && l.sid === ${target.id})`), "relisté avec la même identité");
    assert.ok(doc.querySelector('.stf-card[data-staff-role="coach"]').classList.contains("is-vacant"));
    ok("Congédier : poste vacant, membre remis sur le marché sous la même identité");

    // « Mes enchères » → Relancer un staff ouvre le Marché en mode Staff.
    win.eval("mkGotoStaff('physio', staffOpenListings(STAFF_ROLE_BY_KEY.physio)[0].id)");
    assert.ok(win.eval("currentVisiblePageId() === 'marcheSection' && marketUi.mode === 'staff' && marketUi.sRole === 'physio'"));
    ok("mkGotoStaff : Marché en mode Staff, filtré sur le rôle");

    // 5) AvatarGen : staff sans bandeau ni crête, joueurs inchangés.
    const r = win.eval(`(() => {
      let banned = 0, band = 0, mohawkPlayers = 0, bandPlayers = 0, same = 0;
      for (let s = 1; s <= 600; s++) {
        const p = AvatarGen.generateAppearance(s, {});
        const st = AvatarGen.generateAppearance(s, { staff: true, age: 50 });
        if (["mohawk", "frohawk"].includes(st.hairStyle)) banned++;
        if (st.headband || st.durag) band++;
        if (p.hairStyle === "mohawk") mohawkPlayers++;
        if (p.headband) bandPlayers++;
        if (JSON.stringify(p) === JSON.stringify(AvatarGen.generateAppearance(s))) same++;
      }
      return { banned, band, mohawkPlayers, bandPlayers, same };
    })()`);
    assert.strictEqual(r.banned, 0, "aucune crête pour le staff");
    assert.strictEqual(r.band, 0, "aucun bandeau pour le staff");
    assert.ok(r.mohawkPlayers > 0 && r.bandPlayers > 0 && r.same === 600, "joueurs inchangés : " + JSON.stringify(r));
    const svg = win.eval(`AvatarGen.generateAvatar(4242, { outfit: "polo", staff: true, age: 55, suitColors: ["#123456", "#abcdef"] })`);
    assert.ok(svg.includes(POLO_PATH) && svg.includes('fill="#123456"') && !svg.includes('M49 94 Q60 107 71 94'), "polo sans chaîne");
    const id1 = win.eval("JSON.stringify(staffIdentity(12345))"), id2 = win.eval("staffIdentityCache.clear(); JSON.stringify(staffIdentity(12345))");
    assert.strictEqual(id1, id2, "identité déterministe");
    const ages = win.eval("Array.from({ length: 200 }, (_, i) => staffIdentity('t' + i).age)");
    assert.ok(Math.min(...ages) >= 35 && Math.max(...ages) <= 65, "âge 35-65");
    const firsts = win.eval("Object.values(NAME_POOLS).flatMap(p => p.first)");
    assert.ok(win.eval("Array.from({ length: 100 }, (_, i) => staffIdentity('n' + i).name.split(' ')[0])").every(f => firsts.includes(f)), "prénoms tirés des réservoirs (masculins) des joueurs");
    ok("AvatarGen : staff sans bandeau ni crête, polo sans chaîne, joueurs inchangés ; identité déterministe, 35-65 ans");

    dom.window.close();
  } finally {
    server.close();
  }
  console.log("\n🏁 staff_v2_ui_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
