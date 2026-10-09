// Mode Sélection — bugs P0 du 2026-10-09 (navigateur simulé, vrai serveur) :
//  1. une convocation met à jour l'effectif de la Tactique SANS recharger
//     (avant : équipe des Ordres gardée en cache tant que le match affiché
//     ne changeait pas) ; les nouveaux convoqués entrent sur la feuille ;
//  2. la page Sélections ouvre la sélection DU MANDAT (et pas celle du pays
//     du championnat du club) et propose un lien « Mode Sélection » valide ;
//  3. le réglage TC / GEN est respecté dans les listes du mode Sélection.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-p0";
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const ok = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 100)); } throw new Error("❌ attente : " + label); };

(async () => {
  const { server, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const club = dom.window.eval("teamA.name");
  const leagueCountry = dom.window.eval("(typeof league !== 'undefined' && league && league.country) || 'fr'");
  // Sélectionneur d'une AUTRE nation que le pays du championnat du club.
  const nation = leagueCountry === "de" ? "it" : "de";
  const teamId = nation + "-A";
  const api = baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/admin/national";
  const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId, club }) }).then(r => r.json());
  ok(res.ok, `nomination de test : ${club} (championnat « ${leagueCountry} ») sélectionneur de ${teamId}`);
  dom.window.close();
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  let win = dom.window, doc = win.document;

  // ---------- BUG 2 : la page Sélections ouvre la bonne nation ----------
  win.eval("TAB_HANDLERS.selections()");
  await wait(() => win.HM_NATIONAL && doc.querySelector("#nationalContent [data-nc-enter]"), "page Sélections : lien Mode Sélection");
  await wait(() => /Allemagne|Italie/.test(doc.getElementById("nationalContent").textContent), "page Sélections : nation du mandat");
  const links = [...doc.querySelectorAll("#nationalContent [data-nc-enter]")];
  ok(links.length && links.every(b => b.dataset.ncEnter === teamId), `page Sélections : « Mode Sélection » pointe vers ${teamId} (jamais vide, jamais la France) — ${links.map(b => b.dataset.ncEnter).join(", ")}`);
  ok(!/France A/.test((doc.querySelector("#nationalContent .nat-team-head, #nationalContent h2") || {}).textContent || ""), "page Sélections : pas la France affichée par défaut");
  links[0].click();
  await wait(() => doc.body.classList.contains("nc-mode") && win.HM_NATIONAL_COACH.state.view, "entrée dans le mode depuis la page Sélections");
  const st = win.HM_NATIONAL_COACH.state;
  ok(st.teamId === teamId && st.view.team && st.view.team.id === teamId, `mode Sélection de ${teamId} (et pas fr-A)`);
  await flush(dom); await new Promise(r => setTimeout(r, 300));

  // ---------- BUG 1 : convocation → Tactique à jour sans rechargement ----------
  const rosterOf = (v, k) => { const e = k === "default" ? null : (v.upcoming || []).find(x => String(x.id) === String(k)); return ((e ? e.players : v.tacticsPlayers) || []).map(x => String(x.nid)); };
  doc.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
  await wait(() => st.tq && doc.getElementById("ncTqGrid") || /Aucun joueur/.test(doc.getElementById("nationalContent").textContent), "tactique affichée");
  const cur = st.view.gatherings && st.view.gatherings.find(g => String(g.gid) === String(st.view.currentGid));
  const pool = (st.view.pool && st.view.pool.players) || [];
  if (cur && !cur.frozen && pool.length) {
    const k0 = st.tq ? st.tq.key : null;
    const before = st.tq ? st.tq.proxy.players.map(p => String(p.id)) : [];
    // Un joueur du vivier pas encore convoqué : convocation depuis la Liste des joueurs.
    doc.querySelector('#ncSidebar [data-nc-nav="joueurs"]').click();
    await wait(() => doc.querySelector('#nationalContent [data-nc-conv="1"]:not([disabled])'), "bouton Convoquer");
    const b = doc.querySelector('#nationalContent [data-nc-conv="1"]:not([disabled])');
    const who = b.dataset.ncN;
    b.click();
    await win.__lastNationalCoach; await flush(dom);
    doc.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
    await wait(() => st.tq && doc.getElementById("ncTqGrid") && doc.getElementById("ncTqGrid").children.length, "tactique après convocation");
    const k = st.tq.key, server = rosterOf(st.view, k), shown = st.tq.proxy.players.map(p => String(p.id));
    ok(server.join(",") === shown.join(","), `Tactique : effectif = celui du serveur après la convocation, sans rechargement (${shown.length} joueurs, avant ${before.length})`);
    ok(new RegExp(who.split(" ").pop()).test(doc.getElementById("ncTqGrid").textContent), `Tactique : ${who}, tout juste convoqué, apparaît dans l'effectif`);
    if (k0 === k && before.length) ok(shown.length !== before.length || shown.join() !== before.join(), "l'équipe des Ordres a été reconstruite (plus l'ancienne copie)");
    const conv = st.tq.proxy.convokedIds().map(String);
    const added = shown.filter(id => !before.includes(id));
    ok(added.every(id => conv.includes(id) || conv.length >= 12), "les nouveaux convoqués entrent sur la feuille de match (s'il reste de la place)");
    // Retrait : il disparaît aussi de la Tactique.
    doc.querySelector('#ncSidebar [data-nc-nav="convocations"]').click();
    await wait(() => doc.querySelector('#nationalContent [data-nc-conv="0"]'), "bouton Retirer");
    const rm = [...doc.querySelectorAll('#nationalContent [data-nc-conv="0"]')].find(x => x.dataset.ncN === who) || doc.querySelector('#nationalContent [data-nc-conv="0"]');
    const gone = rm.dataset.ncN;
    rm.click(); await win.__lastNationalCoach; await flush(dom);
    doc.querySelector('#ncSidebar [data-nc-nav="tactique"]').click();
    await wait(() => doc.querySelector('.nc-side-link.on[data-nc-nav="tactique"]'), "tactique après retrait");
    const k2 = st.tq ? st.tq.key : st.tqMatch, server2 = rosterOf(st.view, k2);
    const after2 = st.tq ? st.tq.proxy.players.map(p => String(p.id)) : [];
    ok(server2.join(",") === after2.join(",") && !after2.includes(added[0]), `retrait de ${gone} : effectif de la Tactique à jour aussi (${after2.length} joueur(s))`);
    if (!server2.length) ok(/Aucun joueur/.test(doc.getElementById("nationalContent").textContent), "plus aucun convoqué : la Tactique l'indique");
  } else console.log("ℹ️  aucun rassemblement ouvert dans ce monde de test : convocation non rejouée.");

  // ---------- BUG 3 : réglage TC / GEN respecté dans le mode Sélection ----------
  {
    const heads = () => [...doc.querySelectorAll("#nationalContent th")].map(th => th.textContent.trim());
    const tcOf = p => win.eval("ATTRS").reduce((s, k) => s + (Number(p.attrs && p.attrs[k]) || 0), 0);
    win.setRatingDisplayMode("tc", false);
    doc.querySelector('#ncSidebar [data-nc-nav="joueurs"]').click();
    await wait(() => heads().includes("TC"), "Liste des joueurs en TC");
    ok(heads().includes("TC") && !heads().includes("GEN"), "réglage TC : la Liste des joueurs affiche « TC » (plus « GEN »)");
    const rows = [...doc.querySelectorAll("#nationalContent tbody tr.eff-row")];
    const pool = st.view.pool.players;
    let checked = 0;
    for (const tr of rows.slice(0, 5)) {
      const name = tr.querySelector("[data-nc-profile]") ? tr.querySelector("[data-nc-profile]").textContent.trim() : "";
      const p = pool.find(x => x.name === name);
      if (!p || !p.attrs) continue;
      const shown = Number(tr.querySelector(".eff-td-rating").textContent.trim());
      if (shown !== tcOf(p)) throw new Error(`❌ ${name} : TC affiché ${shown}, attendu ${tcOf(p)}`);
      checked++;
    }
    ok(checked > 0, `TC = total des caractéristiques, même calcul que l'Effectif du club (${checked} joueurs vérifiés)`);
    for (const nav of ["suivis", "convocations"]) {
      doc.querySelector(`#ncSidebar [data-nc-nav="${nav}"]`).click();
      await wait(() => doc.querySelector(`.nc-side-link.on[data-nc-nav="${nav}"]`), nav);
      const txt = doc.getElementById("nationalContent").textContent;
      ok(!/\bGEN\b/.test(txt), `réglage TC : « ${nav} » n'affiche plus GEN`);
    }
    // Changement de réglage pendant le mode : redessin immédiat.
    doc.querySelector('#ncSidebar [data-nc-nav="joueurs"]').click();
    await wait(() => heads().includes("TC"), "joueurs en TC");
    win.setRatingDisplayMode("gen", false);
    await wait(() => heads().includes("GEN"), "retour en GEN sans navigation");
    ok(heads().includes("GEN") && !heads().includes("TC"), "réglage GEN : retour immédiat (sans rechargement ni navigation)");
  }

  dom.window.close(); server.close();
  console.log("\n🏁 national_nt_p0_test.js : bugs P0 du mode Sélection corrigés.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
