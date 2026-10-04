// Refonte visuelle de l'onglet Effectif (retour utilisateur, 2026-09-25 :
// "code ces pages effectifs stp", maquette "Hoop Manager – Effectif
// retravaillé") : groupes Cinq de départ / Rotation, bandeau d'en-tête,
// menu "⋯" des actions, sous-onglet Caractéristiques trié par Moy. avec le
// meilleur de l'équipe cerclé dans chaque colonne.
const fs = require("fs");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {
const { server, baseUrl } = await startTestServer();
try {
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "effectif").click();

  // En-tête.
  const sub = doc.getElementById("rosterSubtitle").textContent;
  if (!/15 joueurs$/.test(sub)) throw new Error(`❌ Sous-titre attendu "<club>, 15 joueurs", obtenu "${sub}".`);
  if (!/€/.test(doc.getElementById("rosterPayrollValue").textContent)) throw new Error("❌ La masse salariale devrait être affichée dans l'en-tête.");
  console.log("✅ En-tête : sous-titre + masse salariale.");

  // Un seul bloc de joueurs (retour utilisateur 2026-09-30 : plus de blocs
  // Cinq de départ / Rotation / Réserve) : une seule liste, titulaires
  // d'abord (dans l'ordre des postes de la feuille de match), puis rotation,
  // puis réserve ; rôle signalé discrètement (liseré + « 5 », nom estompé).
  {
    const win = dom.window;
    if (doc.querySelectorAll("#rosterContent .eff-group-row, #rosterContent .eff-group-title").length) throw new Error("❌ Plus aucune ligne de titre de groupe attendue.");
    const bodies = doc.querySelectorAll("#rosterContent table.eff-general tbody");
    if (bodies.length !== 1) throw new Error(`❌ Un seul bloc (tbody) de joueurs attendu, obtenu ${bodies.length}.`);
    const rows = [...bodies[0].querySelectorAll("tr.eff-row")];
    const ids = rows.map(r => Number(r.querySelector(".player-link").dataset.playerId));
    const roles = ids.map(id => win.eval(`playerRoleLabel(teamA, teamA.players.find(p => p.id === ${id}))`));
    const rank = r => ["Titulaire", "Joueur de rotation", "Réserviste"].indexOf(r);
    if (!roles.every((r, i) => i === 0 || rank(roles[i - 1]) <= rank(r))) throw new Error(`❌ Ordre par défaut attendu : titulaires, rotation, réserve — obtenu ${roles.join(", ")}.`);
    const starterSlots = ids.slice(0, 5).map(id => win.eval(`teamA.starterPosition(${id})`));
    if (JSON.stringify(starterSlots) !== JSON.stringify(win.eval("POSITIONS"))) throw new Error(`❌ Titulaires attendus dans l'ordre M, A, AS, AF, P, obtenu ${starterSlots.join(", ")}.`);
    const starters = rows.filter(r => r.classList.contains("eff-row-starter"));
    // Liseré seul : la pastille « 5 » a été retirée (retour utilisateur 2026-10-03).
    if (starters.length !== 5 || starters.some(r => r.querySelector(".eff-starter-mark"))) throw new Error(`❌ 5 titulaires marqués (liseré seul, sans « 5 ») attendus, obtenu ${starters.length}.`);
    const reserves = rows.filter((r, i) => roles[i] === "Réserviste");
    if (reserves.some(r => !r.classList.contains("eff-row-reserve"))) throw new Error("❌ Les réservistes devraient porter .eff-row-reserve.");
    const avatarSizes = new Set(rows.map(r => r.querySelector(".player-avatar").style.width));
    if (avatarSizes.size !== 1) throw new Error(`❌ Une seule taille d'avatar attendue, obtenu ${[...avatarSizes].join(", ")}.`);
    console.log(`✅ Un seul bloc de ${rows.length} joueurs : ${starters.length} titulaires en tête (M→P), puis rotation, puis réserve ; avatar ${[...avatarSizes][0]}.`);
    // Tri de colonne : s'applique à TOUTE la liste.
    win.eval("rosterSortState.key = 'age'; rosterSortState.dir = 1; renderEffectifSection();");
    const ages = [...doc.querySelectorAll("#rosterContent table.eff-general tr.eff-row")].map(r => Number(r.children[4].textContent)); // +1 : colonne GEN/TC (2026-10-04)
    if (ages.length !== rows.length || !ages.every((v, i) => i === 0 || ages[i - 1] <= v)) throw new Error(`❌ Tri par âge attendu sur toute la liste : ${ages.join(", ")}.`);
    console.log("✅ Tri par âge appliqué à toute la liste :", ages.join(" "));
    win.eval("rosterSortState.key = null; renderEffectifSection();");
  }

  // Une seule notion de meilleur poste (retour utilisateur 2026-09-30) : la
  // flèche « → X » de la colonne Poste = bestPosition (même règle que la
  // fiche joueur), affichée seulement quand elle diffère du poste de carte.
  {
    const win = dom.window;
    const p = win.eval("teamA.players[0]");
    win.eval(`(() => { const p = teamA.players[0]; ATTRS.forEach(a => { p.attrs[a] = 30; }); Object.keys(POSITION_KEY_WEIGHTS[p.position === "Pivot" ? "Meneur" : "Pivot"]).forEach(k => { p.attrs[k] = 31; }); renderEffectifSection(); })()`);
    const expected = win.eval("(() => { const p = teamA.players[0]; const b = bestPosition(p); return b !== p.position ? POS_SHORT[b] : null; })()");
    const row = [...doc.querySelectorAll("#rosterContent tr.eff-row")].find(r => Number(r.querySelector(".player-link").dataset.playerId) === p.id);
    const arrow = row.querySelector(".eff-position");
    if (!expected || !arrow || arrow.textContent !== `→ ${expected}`) throw new Error(`❌ Flèche de meilleur poste attendue « → ${expected} », obtenu « ${arrow && arrow.textContent} ».`);
    const others = [...doc.querySelectorAll("#rosterContent tr.eff-row .eff-position")].length;
    const expectedCount = win.eval("teamA.players.filter(p => bestPosition(p) !== p.position).length");
    if (others !== expectedCount) throw new Error(`❌ ${expectedCount} flèche(s) attendue(s) (meilleur poste ≠ poste de carte), obtenu ${others}.`);
    console.log(`✅ Flèche de meilleur poste = bestPosition (${arrow.textContent}), seulement quand il diffère du poste de carte (${others}).`);
  }

  // Menu "⋯" : fermé par défaut, s'ouvre, se referme sur un clic ailleurs.
  const btn = doc.querySelector("#rosterContent [data-eff-menu]");
  const menu = doc.getElementById(`effMenu_${btn.dataset.effMenu}`);
  if (!menu.hidden) throw new Error("❌ Le menu d'actions devrait être fermé par défaut.");
  btn.click();
  if (menu.hidden || btn.getAttribute("aria-expanded") !== "true") throw new Error("❌ Le clic sur ⋯ devrait ouvrir le menu.");
  if (!menu.querySelector("[data-list-player]")) throw new Error("❌ Le menu devrait proposer la mise aux enchères.");
  doc.querySelector("#effectifSection h2").click();
  if (!menu.hidden) throw new Error("❌ Un clic ailleurs devrait refermer le menu.");
  console.log("✅ Menu ⋯ : ouverture, mise aux enchères, fermeture au clic extérieur.");

  // Caractéristiques : tri par défaut sur Moy. (décroissant), cadre "meilleur".
  [...doc.querySelectorAll("[data-effectif-subview]")].find(b => b.dataset.effectifSubview === "caracteristiques").click();
  const avgs = [...doc.querySelectorAll("#rosterContent .eff-td-avg")].map(td => Number(td.textContent.replace(",", ".")));
  if (!avgs.every((v, i) => i === 0 || avgs[i - 1] >= v)) throw new Error(`❌ Tri par défaut attendu sur Moy. décroissante : ${avgs.join(", ")}`);
  const families = [...doc.querySelectorAll("#rosterContent .eff-family")].map(el => el.textContent.trim());
  if (families.join("/") !== "Tir/Jeu/Défense/Condition") throw new Error(`❌ Familles attendues Tir/Jeu/Défense/Condition, obtenu ${families.join("/")}.`);
  const colCount = doc.querySelectorAll("#rosterContent thead th.eff-th-attr").length;
  const bestCount = doc.querySelectorAll("#rosterContent .eff-best").length;
  if (colCount !== 15 || bestCount < colCount) throw new Error(`❌ 15 colonnes et au moins un "meilleur" par colonne attendus (${colCount} colonnes, ${bestCount} cadres).`);
  console.log(`✅ Caractéristiques : tri Moy. décroissant, familles, ${bestCount} cadres "meilleur" sur ${colCount} colonnes.`);

  // Colonne Joueur figée au défilement horizontal (retour utilisateur
  // 2026-09-30 (téléphone) : "une fois qu'on scrolle vers la droite, on ne
  // voit plus quel joueur c'est la ligne"), Général ET Caractéristiques.
  // jsdom ne calcule pas la mise en page : on vérifie le balisage (conteneur
  // .roster-table-frozen-col, 1re cellule = Nom sur chaque ligne d'en-tête et
  // de joueur), les règles CSS sticky + fonds opaques, et l'ombre
  // (.is-scrolled) posée au défilement. Le rendu réel est vérifié dans
  // Chromium (390 / 360 px).
  const checkFrozen = label => {
    const wrap = doc.querySelector("#rosterContent .eff-table-wrap");
    if (!wrap || !wrap.classList.contains("roster-table-frozen-col")) throw new Error(`❌ ${label} : le conteneur du tableau devrait porter .roster-table-frozen-col.`);
    const headRow = [...wrap.querySelectorAll("thead tr")].pop();
    if (!headRow.firstElementChild.classList.contains("eff-th-name")) throw new Error(`❌ ${label} : la 1re colonne d'en-tête devrait être Nom.`);
    const rows = [...wrap.querySelectorAll("tbody tr.eff-row")];
    if (!rows.length || rows.some(r => !r.firstElementChild.classList.contains("eff-td-name") || !r.firstElementChild.querySelector(".player-link"))) throw new Error(`❌ ${label} : chaque ligne joueur devrait commencer par la cellule Nom.`);
    wrap.scrollLeft = 120;
    wrap.dispatchEvent(new dom.window.Event("scroll"));
    if (!wrap.classList.contains("is-scrolled")) throw new Error(`❌ ${label} : .is-scrolled attendu après défilement horizontal.`);
    wrap.scrollLeft = 0;
    wrap.dispatchEvent(new dom.window.Event("scroll"));
    if (wrap.classList.contains("is-scrolled")) throw new Error(`❌ ${label} : .is-scrolled devrait disparaître revenu à gauche.`);
    console.log(`✅ ${label} : colonne Joueur figée (${rows.length} lignes), ombre au défilement.`);
  };
  checkFrozen("Caractéristiques");
  [...doc.querySelectorAll("[data-effectif-subview]")].find(b => b.dataset.effectifSubview === "general").click();
  checkFrozen("Général");
  const css = html.replace(/\s+/g, " ");
  [
    [".roster-table-frozen-col table.eff-table tr > :first-child{position:sticky; left:0; z-index:1;}", "cellule Nom sticky left:0"],
    [".roster-table-frozen-col table.eff-table thead th:first-child{z-index:3; background:var(--bg);}", "en-tête Nom opaque"],
    [".roster-table-frozen-col.eff-table-wrap-caracs table.eff-table tbody td:first-child{background:var(--eff-row-2);}", "Caractéristiques : fond de ligne opaque"],
    [".roster-table-frozen-col .eff-general tr.eff-row.injured td:first-child{background:linear-gradient(", "blessé : teinte posée sur un fond opaque"],
    [".roster-table-frozen-col .eff-player .player-link{display:block; min-width:0; max-width:104px; overflow:hidden; text-overflow:ellipsis;", "téléphone : nom tronqué"],
    [".roster-table-frozen-col .eff-player .nat-flag{display:none;}", "téléphone : drapeau masqué"],
  ].forEach(([rule, what]) => { if (!css.includes(rule)) throw new Error(`❌ Règle CSS manquante (${what}) : ${rule}`); });
  console.log("✅ Règles CSS : sticky, fonds opaques (ligne, survol, blessé, en-tête), version téléphone raccourcie.");

  await flush(dom);
  dom.window.close();
  console.log("\n🏁 Refonte Effectif : tous les contrôles sont passés.");
} finally {
  server.close();
}
})().catch(e => { console.error(e); process.exit(1); });
