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

  const TYP = {};
  {
    const acc = {};
    for (let i = 0; i < 120; i++) E.generateTeam("T" + i, 0.92).players.filter(p => p.age > 21).forEach(p => { const a = acc[p.position] = acc[p.position] || { n: 0 }; a.n++; E.ATTRS.forEach(k => { a[k] = (a[k] || 0) + p.attrs[k]; }); });
    Object.keys(acc).forEach(pos => { TYP[pos] = {}; E.ATTRS.forEach(k => { TYP[pos][k] = Math.round(acc[pos][k] / acc[pos].n); }); });
  }
  // Exemple de la spécification : 91 tir à 3, 87 défense extérieure.
  const base = Object.assign({}, TYP["Ailier shooteur"]);
  Object.assign(base, { threePoint: 91, defOutside: 87, speed: 82 });
  const p1 = R.profileOf(base, E.positionRatings({ attrs: base }), 4, "Ailier shooteur");
  check(p1.primary.role === "three_and_d" && p1.primary.mastery >= 70, `exemple de la spécification : ${p1.primary.name} ${p1.primary.mastery}%`);
  const sw = R.strengthsOf(base);
  check(sw.strengths.includes("Tir extérieur") && sw.strengths.includes("Défense extérieure"), "forces : tir extérieur, défense extérieure");
  // Deux profils au même niveau, rôles différents.
  const pass = Object.assign({}, TYP["Meneur"]); Object.assign(pass, { pass: 90, vision: 88, decision: 82 });
  const score = Object.assign({}, TYP["Arrière"]); Object.assign(score, { shotCreation: 90, dribble: 88, penetration: 82, threePoint: 80 });
  check(["pass_first", "floor_general"].includes(R.profileOf(pass, E.positionRatings({ attrs: pass }), 4, "Meneur").primary.role), "passeur → Pass-first / Floor General");
  check(["scorer_sg", "combo_guard", "slasher"].includes(R.profileOf(score, E.positionRatings({ attrs: score }), 4, "Arrière").primary.role), "créateur balle en main → Scoreur arrière / Combo Guard / Slasher");

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

  // Correctifs du 2026-10-06 (« Correctifs — Système de rôles des
  // joueurs ») : profils synthétiques (section 17) et non-régression
  // (section 18). Caractéristiques non citées : celles d'un joueur typique
  // du poste (joueurs générés de haut niveau).
  const synth = (pos, o) => {
    const attrs = Object.assign({}, TYP[pos], o);
    const pr = E.positionRatings({ attrs, position: pos });
    const best = {};
    R.roleFits(attrs, pr, pos).forEach(f => { if (!best[f.role] || f.mastery > best[f.role].mastery) best[f.role] = f; });
    const prof = R.profileOf(attrs, pr, 6, pos);
    const m = id => (best[id] ? best[id].mastery : 0);
    return { m, prof, best, primary: prof.primary.role };
  };
  const offBall = { agility: 90, anticipation: 88, decision: 80 };
  const A = synth("Meneur", { pass: 90, dribble: 88, shotCreation: 92, threePoint: 85, midRange: 85, defOutside: 60 });
  check(A.primary === "scorer_pg" && A.m("scorer_pg") >= 88, `profil A : Scoreur meneur ${A.m("scorer_pg")} (rôle principal)`);
  const B = synth("Arrière", { pass: 55, dribble: 60, shotCreation: 50, threePoint: 95, midRange: 90, ...offBall });
  check(B.primary === "sharpshooter" && B.m("sharpshooter") >= 88 && B.m("scorer_pg") <= 50, `profil B : Gâchette ${B.m("sharpshooter")}, Scoreur meneur ${B.m("scorer_pg")}`);
  const C = synth("Arrière", { pass: 82, dribble: 86, shotCreation: 84, threePoint: 83, midRange: 83 });
  check(C.primary === "combo_guard" && C.m("combo_guard") >= 85, `profil C : Combo Guard ${C.m("combo_guard")} (rôle principal)`);
  const D = synth("Arrière", { pass: 59, dribble: 88, shotCreation: 84, threePoint: 91, midRange: 91 });
  check(D.primary === "scorer_sg" && D.m("scorer_sg") >= 85 && D.m("scorer_sg") - D.m("scorer_pg") >= 12 && D.m("scorer_sg") - D.m("combo_guard") >= 6,
    `profil D : Scoreur arrière ${D.m("scorer_sg")} > Scoreur meneur ${D.m("scorer_pg")}, Combo Guard ${D.m("combo_guard")}`);
  const Ep = synth("Arrière", { threePoint: 85, midRange: 85, defOutside: 91, shotCreation: 50, pass: 65, ...offBall });
  check(Ep.primary === "three_and_d" && Ep.m("three_and_d") >= 88 && Ep.m("scorer_pg") <= 50, `profil E : 3&D ${Ep.m("three_and_d")}, Scoreur meneur ${Ep.m("scorer_pg")}`);
  const n1 = synth("Arrière", { threePoint: 85, defOutside: 85 });
  check(n1.primary === "three_and_d" && n1.m("three_and_d") >= 85, `SG + tir + défense → 3&D ${n1.m("three_and_d")}`);
  const n2 = synth("Meneur", { pass: 88, vision: 85, shotCreation: 82, decision: 80 });
  check(n2.primary === "floor_general" && n2.m("floor_general") >= 88, `PG + passe + création → Floor General ${n2.m("floor_general")}`);
  const n3 = synth("Arrière", { threePoint: 88, midRange: 85, pass: 45, dribble: 70, shotCreation: 72 });
  check(["sharpshooter", "scorer_sg"].includes(n3.primary) && n3.m("combo_guard") <= Math.max(n3.m("sharpshooter"), n3.m("scorer_sg")) - 25, `SG + tir + passe faible → ${n3.prof.primary.name}, Combo Guard pénalisé (${n3.m("combo_guard")})`);
  const n4 = synth("Pivot", { defInside: 88, block: 85, rebound: 75, strength: 75 });
  check(n4.primary === "rim_protector", `C + défense intérieure → Rim Protector ${n4.m("rim_protector")}`);
  const n5 = synth("Ailier fort", { threePoint: 85, midRange: 80, speed: 80, agility: 80, rebound: 65 });
  check(n5.primary === "stretch_four", `PF + tir + mobilité → Stretch 4 ${n5.m("stretch_four")}`);
  // Meneur slasher (demande du 2026-10-06) : meneur pénétrant avec une passe
  // correcte ; sans passe, il n'est pas meneur slasher.
  const ms = synth("Meneur", { penetration: 90, acceleration: 88, dribble: 85, speed: 85, pass: 66, shotCreation: 55, threePoint: 35 });
  check(ms.primary === "slasher_pg" && ms.m("slasher_pg") >= 85, `meneur pénétrant → Meneur slasher ${ms.m("slasher_pg")}`);
  const msNoPass = synth("Meneur", { penetration: 90, acceleration: 88, dribble: 85, speed: 85, pass: 40, shotCreation: 55, threePoint: 35 });
  check(msNoPass.m("slasher_pg") <= ms.m("slasher_pg") - 15, `meneur pénétrant sans passe : Meneur slasher ${msNoPass.m("slasher_pg")} (pénalisé)`);
  // Le rôle mesure un profil, pas une puissance générale (section 16) : un
  // excellent scoreur reste un mauvais 3&D.
  check(D.m("three_and_d") <= D.m("scorer_sg") - 25, `scoreur pur : 3&D ${D.m("three_and_d")} loin de Scoreur arrière ${D.m("scorer_sg")}`);
  // Poste naturel (sections 1, 7, 8) : même profil, SG seul → Scoreur
  // arrière devant Scoreur meneur ; la note de poste pèse vraiment.
  const sgFits = R.roleFits(Object.assign({}, TYP["Arrière"], { shotCreation: 85, dribble: 85, threePoint: 85, pass: 70 }), null, "Arrière");
  const at = (id, pos) => sgFits.find(f => f.role === id && f.position === pos);
  check(at("scorer_sg", "Arrière").detail.positionModifier > at("scorer_pg", "Meneur").detail.positionModifier, `modificateur de poste : poste de carte ${at("scorer_sg", "Arrière").detail.positionModifier} > autre poste ${at("scorer_pg", "Meneur").detail.positionModifier}`);
  check(R.positionModifier("Meneur", ["Pivot"], "Pivot", null) <= -20, "un pivot évalué comme meneur : malus très important");
  // Détail de chaque note (section 14).
  const fA = A.best.scorer_pg;
  ["roleScore", "withoutPosition", "positionModifier", "essentialModifier", "weakAttributePenalty"].forEach(k => { if (typeof fA.detail[k] !== "number") throw new Error("❌ détail : " + k); });
  check(fA.detail.roleScore === fA.mastery, `détail : Scoreur meneur ${fA.mastery} = sans poste ${fA.detail.withoutPosition}, poste ${fA.detail.positionModifier >= 0 ? "+" : ""}${fA.detail.positionModifier}, essentielles +${fA.detail.essentialModifier}, faiblesses ${fA.detail.weakAttributePenalty}`);
  const fD = D.best.combo_guard;
  check(fD.detail.weakAttributePenalty < 0 && fD.detail.below.some(b => b.attr === "pass"), `Combo Guard avec Passe 59 : pénalité ${fD.detail.weakAttributePenalty} (Passe sous le seuil)`);
  // Seuils configurables (section 5) : souple / dur par caractéristique.
  check(Object.values(R.ROLES).every(r => r.essential && r.essential.length && Object.values(r.min || {}).every(t => t.length === 2 && t[0] > t[1])), "chaque rôle : essentielles, seuils souple > dur");
  const passWeak = Object.assign({}, TYP["Arrière"], { pass: 70, dribble: 80, shotCreation: 80, threePoint: 80 });
  const cg = v => R.roleFits(Object.assign({}, passWeak, { pass: v }), null, "Arrière").find(f => f.role === "combo_guard" && f.position === "Arrière").detail.weakAttributePenalty;
  check(cg(65) === 0 && cg(57) <= -4 && cg(47) < cg(57) - 15, `Combo Guard : Passe 65 → ${cg(65)}, 57 → ${cg(57)}, 47 → ${cg(47)} (seuils souple 60 / dur 50)`);
  // Audit sur toute une population (règles 1 à 8 de scripts/roles_audit.js).
  const audit = require("child_process").execFileSync(process.execPath, ["scripts/roles_audit.js", "--n", "1500"], { encoding: "utf-8" });
  const pct = Number((audit.match(/au moins une anomalie : \*\*\d+\*\* \(([\d.]+) %\)/) || [])[1]);
  const high = Number((audit.match(/criticité haute : (\d+)/) || [])[1]);
  check(pct < 8 && high < 40, `audit des rôles : ${pct} % des joueurs avec une anomalie, ${high} de criticité haute (avant correctifs : 36,8 %, 375 sur 4 500)`);

  // Phase 2 : cohérence d'un cinq (exemples de la spécification).
  const mk = (role, pos, lvl, hi) => { const a = {}; E.ATTRS.forEach(k => { a[k] = lvl; }); Object.keys(R.ROLES[role].weights).forEach(k => { a[k] = hi; }); const pr = {}; E.POSITIONS.forEach(x => { pr[x] = x === pos ? 70 : 60; }); return { pos, attrs: a, positionRatings: pr, name: role, id: role + pos }; };
  const teamA5 = [mk("scorer_pg", "Meneur", 55, 88), mk("scorer_sg", "Arrière", 55, 88), mk("shot_creator", "Ailier shooteur", 55, 88), mk("interior_scorer", "Ailier fort", 55, 88), mk("interior_scorer", "Pivot", 55, 88)];
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

  // Phase 5 : tactiques et rôles, évolution des rôles.
  const lob = [mk("scorer_pg", "Meneur", 55, 85), mk("sharpshooter", "Arrière", 55, 85), mk("three_and_d", "Ailier shooteur", 55, 85), mk("stretch_four", "Ailier fort", 55, 85), mk("lob_threat", "Pivot", 55, 85)];
  const stat = lob.slice(0, 4).concat([mk("interior_scorer", "Pivot", 55, 85)]);
  const tLob = R.tacticalFit(lob, ["Pick & Roll"], "Normal").score, tStat = R.tacticalFit(stat, ["Pick & Roll"], "Normal").score;
  check(tLob > tStat + 5, `Pick & Roll : pivot Lob Threat ${tLob} > pivot statique ${tStat}`);
  check(R.tacticalFit(teamB5, ["Jeu extérieur"], "Normal").score > R.tacticalFit(teamA5, ["Jeu extérieur"], "Normal").score, "Jeu extérieur : le cinq de tireurs s'y prête mieux");
  const vet = E.generateTeam("V", 0.9).players[0];
  vet.roleHistory = [];
  E.recordRoleHistory(vet, 1);
  const first = vet.roleHistory[0].role;
  // Carrière : la vitesse baisse, le tir progresse.
  ["speed", "acceleration", "penetration", "agility"].forEach(k => { vet.attrs[k] = 25; });
  ["threePoint", "midRange", "freeThrow"].forEach(k => { vet.attrs[k] = 95; });
  E.recordRoleHistory(vet, 2);
  E.recordRoleHistory(vet, 3);
  check(vet.roleHistory.length === 2 && vet.roleHistory[1].role !== first, `évolution du rôle : ${vet.roleHistory.map(x => x.name).join(" → ")} (noté seulement quand il change)`);
  const saved = E.playerFromSave(JSON.parse(JSON.stringify(E.serializePlayerRecord(vet))));
  check(saved.roleHistory.length === 2, "historique des rôles sauvegardé");

  // Fiche joueur : bloc « Rôle ».
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  await new Promise(r => setTimeout(r, 300));
  check(!!win.HM_ROLES, "module des rôles chargé dans le navigateur");
  win.eval("showPlayerDetail(myTeamIndex, teamA.players[0].id)");
  const card = doc.querySelector("#playerDetailSection [data-pdp-role]");
  check(!!card && /Rôle principal/.test(card.textContent) && /maîtrise/.test(card.querySelector(".pdp-role2-ring").textContent) && /Autres rôles/.test(card.textContent) && card.querySelectorAll(".pdp-role-fit").length >= 1, `fiche joueur : rôle « ${card && card.querySelector(".pdp-role-name").textContent.trim()} », anneau de maîtrise et autres rôles (refonte 2026-10-07)`);
  check(/Forces/.test(doc.querySelector("#playerDetailSection .pdp2-row--role").textContent) && doc.querySelector("#playerDetailSection .pdp-sw-row--ok") && doc.querySelector("#playerDetailSection .pdp-sw-row--bad"), "forces et faiblesses affichées (pastilles)");
  win.eval(`(() => { const p = teamA.players[0]; p.roleHistory = [{ season: 1, age: 21, role: "slasher", name: "Slasher" }, { season: 3, age: 24, role: "shot_creator", name: "Shot Creator" }]; showPlayerDetail(myTeamIndex, p.id); })()`);
  const card2 = doc.querySelector("#playerDetailSection [data-pdp-role]");
  check(/Évolution/.test(card2.textContent) && /Slasher/.test(card2.textContent) && /Pour progresser/.test(card2.textContent) && card2.querySelector(".pdp-role2-chip"), "fiche joueur : évolution du rôle et programmes qui le développent");
  win.eval(`showPlayerDetail(myTeamIndex, Object.values(teamA.lineup.starters)[0])`);
  const row3 = () => doc.querySelector("#playerDetailSection .pdp2-row--role");
  check(row3().querySelector(".pdp-role-card") && row3().querySelector(".pdp-sw-card") && row3().querySelector(".pdp-compat-card [data-pdp-compat]") && !row3().querySelector(".pdp-role-card [data-pdp-compat]"), "fiche joueur : 3 briques (Rôle, Forces/faiblesses, Compatibilité)");
  check(/Titulaire : cohérence actuelle du cinq/.test(row3().querySelector(".pdp-compat-card").textContent), "fiche joueur d'un titulaire : compatibilité = cohérence actuelle du cinq");
  win.eval(`(() => { const ids = new Set(Object.values(teamA.lineup.starters)); showPlayerDetail(myTeamIndex, teamA.players.find(p => !ids.has(p.id)).id); })()`);
  check(/Compatibilité avec votre cinq majeur/.test(row3().querySelector(".pdp-compat-card").textContent) && /→/.test(row3().querySelector(".pdp-compat-card").textContent), "fiche joueur d'un remplaçant : compatibilité avec le cinq majeur (effet s'il entrait dans le cinq)");
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
  check(!!coh && coh.querySelectorAll(".coh-slot").length === 5 && /Offensive/.test(coh.textContent) && /Team Fit/.test(coh.textContent), "composition : cohérence du cinq (5 titulaires, offensive / défensive / Team Fit)");
  check(!coh.querySelector(".coh-tac-chip") && coh.querySelector(".coh-col--sum .coh-kpis + .coh2-roster .coh-slot"), "composition : pas de pastilles de tactique, cinq sous les scores");
  // Refonte 2026-10-07 : note globale, carte des frictions, points de friction.
  check(/^[A-E][+-]?$/.test(coh.querySelector("[data-coh-grade]").textContent) && coh.querySelectorAll(".coh2-court [data-coh-spot]").length === 5 && /Points de friction/.test(coh.textContent) && /Carte des frictions/.test(coh.textContent), "cohérence : note globale, carte des frictions (5 joueurs), points de friction");
  const nConf = Number(coh.dataset.cohConflicts);
  check(coh.querySelectorAll(".coh2-conf").length === nConf && coh.querySelectorAll(".coh2-court [data-coh-link]").length === nConf, `cohérence : ${nConf} conflit(s), autant de liens sur la carte que de points de friction`);
  dom.window.close(); server.close();
  console.log("\n🏁 roles_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
