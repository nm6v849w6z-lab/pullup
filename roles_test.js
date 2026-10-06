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

  // Phase 2 : cohérence d'un cinq (exemples de la spécification).
  const mk = (role, pos, lvl, hi) => { const a = {}; E.ATTRS.forEach(k => { a[k] = lvl; }); Object.keys(R.ROLES[role].weights).forEach(k => { a[k] = hi; }); const pr = {}; E.POSITIONS.forEach(x => { pr[x] = x === pos ? 70 : 60; }); return { pos, attrs: a, positionRatings: pr, name: role, id: role + pos }; };
  const teamA5 = [mk("scorer_guard", "Meneur", 55, 88), mk("scorer_guard", "Arrière", 55, 88), mk("shot_creator", "Ailier shooteur", 55, 88), mk("interior_scorer", "Ailier fort", 55, 88), mk("interior_scorer", "Pivot", 55, 88)];
  const teamB5 = [mk("pass_first", "Meneur", 52, 82), mk("sharpshooter", "Arrière", 52, 82), mk("three_and_d", "Ailier shooteur", 52, 82), mk("stretch_four", "Ailier fort", 52, 82), mk("rim_protector", "Pivot", 52, 82)];
  const cA = R.lineupCohesion(teamA5), cB = R.lineupCohesion(teamB5);
  check(cB.overall - cA.overall >= 20 && cA.offense < 60 && cB.offense > 75, `cinq de créateurs ${cA.overall}% (attaque ${cA.offense}%) < cinq complémentaire ${cB.overall}% (attaque ${cB.offense}%)`);
  check(cA.notes.some(x => /besoin du ballon/.test(x.text)) && cA.slots.some(x => x.warn), "cinq de créateurs : « trop de joueurs ont besoin du ballon », titulaires signalés");
  check(cB.notes.some(x => x.tone === "ok" && /Gâchette/.test(x.text)), "cinq complémentaire : le meneur alimente la Gâchette");
  // Compatibilité dynamique : un Pass-first à la place du Scoreur.
  const comp = R.compatibilityWith(teamA5, { ...mk("pass_first", "Meneur", 52, 82), position: "Meneur", id: "nouveau" });
  check(comp && comp.after > comp.before, `recrue Pass-first : cohérence ${comp.before}% → ${comp.after}%`);

  // Phase 4 : rôle préféré stable, motivation et message hebdomadaire.
  const somePlayer = ps[0];
  const pr0 = E.positionRatings(somePlayer);
  const pref1 = R.preferredRole(somePlayer.attrs, pr0, somePlayer.position, somePlayer.id);
  check(pref1 && JSON.stringify(pref1) === JSON.stringify(R.preferredRole(somePlayer.attrs, pr0, somePlayer.position, somePlayer.id)), `rôle préféré stable (${pref1.name})`);
  let prefOther = 0;
  ps.forEach(p => { const a = R.preferredRole(p.attrs, E.positionRatings(p), p.position, p.id), b = R.profileOf(p.attrs, E.positionRatings(p), 4, p.position).primary; if (a.role !== b.role) prefOther++; });
  check(prefOther > 0 && prefOther < ps.length * 0.45, `préféré ≠ rôle principal pour ${Math.round(100 * prefOther / ps.length)} % des joueurs`);
  let team = null, mm = null;
  for (let i = 0; i < 200 && !mm; i++) {
    const t = E.generateTeam("P" + i, 0.9);
    t.isHuman = true; t.feed = { entries: [] };
    const res = t.applyRolePreferences(Date.now());
    if (res.length) { team = t; mm = res[0]; }
  }
  check(!!mm, "un titulaire hors de son rôle préféré est détecté");
  const victim = team.players.find(p => p.id === mm.playerId);
  const formBefore = victim.form;
  check(team.feed.entries.some(e => e.key === `role_${victim.id}` && /ne correspond pas à son profil/.test(e.title)), `fil d'actualité : « ${team.feed.entries.find(e => e.key === "role_" + victim.id).text.slice(0, 70)}… »`);
  check(!team.applyRolePreferences(Date.now()).some(x => x.playerId === victim.id) && victim.form === formBefore, "au plus une fois toutes les 2 semaines");
  team.week += 2;
  team.applyRolePreferences(Date.now());
  check(victim.form < formBefore, `motivation en baisse (${formBefore} → ${victim.form})`);

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
  check(!!doc.querySelector("#playerDetailSection [data-pdp-compat]") && /Compatibilité avec votre cinq majeur/.test(doc.querySelector("#playerDetailSection .pdp2-row--role").textContent), "fiche joueur : compatibilité avec le cinq majeur");
  // Marché : rôle et compatibilité avec le cinq majeur.
  // (Joueurs d'autres clubs : caractéristiques masquées côté navigateur,
  // donc pas de compatibilité ; un remplaçant du club pour le calcul.)
  const chip = win.eval("(() => { const ids = new Set(Object.values(teamA.lineup.starters)); return mkRoleChipHtml(teamA.players.find(p => !ids.has(p.id))); })()");
  check(/mk-chip-role/.test(chip) && /\d+%/.test(chip) && /\([+-]?\d+\)/.test(chip), `marché : rôle, compatibilité et effet sur le cinq (${chip.replace(/<[^>]+>/g, "")})`);
  const hiddenChip = win.eval("(() => { const p = league.teams.flatMap(t => t.players).find(x => x.attrsHidden || x.fog); return p ? mkRoleChipHtml(p) : null; })()");
  check(hiddenChip === null || hiddenChip === "", "joueur aux caractéristiques masquées ou estimées : pas de compatibilité affichée");
  win.eval("renderLineupEditor && TAB_HANDLERS.ordres && TAB_HANDLERS.ordres()");
  await new Promise(r => setTimeout(r, 200));
  const coh = doc.getElementById("compoCohesion");
  check(!!coh && coh.querySelectorAll(".coh-slot").length === 5 && /Offensive/.test(coh.textContent), "composition : cohérence du cinq (5 titulaires, offensive / défensive / globale)");
  dom.window.close(); server.close();
  console.log("\n🏁 roles_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
