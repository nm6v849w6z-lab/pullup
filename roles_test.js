// Rôles de jeu (assets/roles.js, phase 1, maquette validée le 2026-10-06) :
// rôles déterminés par les caractéristiques, maîtrise par (rôle, poste),
// identité variée par poste, bloc « Rôle » de la fiche joueur.
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-roles";
const fs = require("fs");
const E = require("./engine.js");
const R = require("./assets/roles.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const check = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };

(async () => {
  // Données : chaque rôle a des poids sur de vraies caractéristiques, des
  // postes du jeu et des tendances complètes.
  const ROLES = Object.entries(R.ROLES);
  check(ROLES.length >= 20 && ROLES.every(([, r]) => Object.keys(r.weights).every(k => E.ATTRS.includes(k)) && r.positions.every(p => E.POSITIONS.includes(p)) && Object.keys(r.tendencies).length === 10),
    `${ROLES.length} rôles : caractéristiques et postes du jeu, tendances complètes`);
  check(R.PAIRS.every(([a, b, s]) => R.ROLES[a] && R.ROLES[b] && s >= -3 && s <= 3), "matrice de compatibilité : rôles connus, scores -3 à +3");

  // Exemple de la spécification : 91 tir à 3, 87 défense extérieure.
  const base = {}; E.ATTRS.forEach(a => { base[a] = 60; });
  Object.assign(base, { threePoint: 91, defOutside: 87, speed: 82, dribble: 75, pass: 70 });
  const p1 = R.profileOf(base, E.positionRatings({ attrs: base }), 4, "Ailier shooteur");
  check(p1.primary.role === "three_and_d" && p1.primary.mastery >= 70, `exemple de la spécification : ${p1.primary.name} ${p1.primary.mastery}%`);
  const sw = R.strengthsOf(base);
  check(sw.strengths.includes("Tir extérieur") && sw.strengths.includes("Défense extérieure"), "forces : tir extérieur, défense extérieure");
  // Deux profils au même niveau, rôles différents.
  const pass = {}; E.ATTRS.forEach(a => { pass[a] = 60; }); Object.assign(pass, { pass: 90, vision: 88, decision: 82 });
  const score = {}; E.ATTRS.forEach(a => { score[a] = 60; }); Object.assign(score, { shotCreation: 90, dribble: 88, penetration: 82, threePoint: 80 });
  check(["pass_first", "floor_general"].includes(R.profileOf(pass, E.positionRatings({ attrs: pass }), 4, "Meneur").primary.role), "passeur → Pass-first / Floor General");
  check(["scorer_guard", "shot_creator", "combo_guard", "slasher"].includes(R.profileOf(score, E.positionRatings({ attrs: score }), 4, "Arrière").primary.role), "créateur balle en main → Scoreur / Shot Creator / Combo Guard / Slasher");

  // Population : identité variée à chaque poste (au moins 4 rôles), rôle
  // principal joué à un poste naturel.
  const ps = [];
  for (let i = 0; i < 60; i++) ps.push(...E.generateTeam("R" + i, 0.92).players.filter(p => p.age > 21));
  const by = {};
  let natural = 0;
  ps.forEach(p => {
    const pr = E.positionRatings(p);
    const prof = R.profileOf(p.attrs, pr, 4, p.position);
    (by[p.position] = by[p.position] || new Set()).add(prof.primary.role);
    const best = Math.max(...E.POSITIONS.map(x => pr[x]));
    if (pr[prof.primary.position] >= best - 6) natural++;
  });
  check(E.POSITIONS.every(pos => by[pos] && by[pos].size >= 4), "au moins 4 rôles différents à chaque poste");
  check(natural / ps.length > 0.97, `rôle principal à un poste naturel (${Math.round(100 * natural / ps.length)} %)`);

  // Fiche joueur : bloc « Rôle ».
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 300));
  check(!!win.HM_ROLES, "module des rôles chargé dans le navigateur");
  win.eval("showPlayerDetail(myTeamIndex, teamA.players[0].id)");
  const card = doc.querySelector("#playerDetailSection [data-pdp-role]");
  check(!!card && /Maîtrise des rôles/.test(card.textContent) && card.querySelectorAll(".pdp-role-fit").length >= 2, `fiche joueur : rôle « ${card && card.querySelector(".pdp-role-name").textContent.trim()} » et maîtrise des rôles`);
  check(/Forces/.test(doc.querySelector("#playerDetailSection .pdp2-row--role").textContent), "forces et faiblesses affichées");
  dom.window.close(); server.close();
  console.log("\n🏁 roles_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
