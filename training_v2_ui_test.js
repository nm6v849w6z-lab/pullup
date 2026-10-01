// Entraînement v2 (retour utilisateur 2026-10-01) — écran : message sans
// entraîneur (lien vers le marché), places selon l'entraîneur, rendement %
// avec détail au survol/clic (sans facteur de poste), jauge de plafond,
// conseil « Appliquer » (sous le plan et dans le bilan du lundi), bande de
// la semaine (amical : tactique grisée), parrainage, persistance serveur.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, editSave } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const D = 24 * 60 * 60 * 1000;

(async () => {
  const { server, savePath, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  let win = dom.window, doc = win.document;
  const open = () => [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "entrainement").click();
  open();

  // 1) Sans entraîneur
  assert(/Aucun entraîneur/.test(doc.getElementById("trainingCoachCard").textContent), "en-tête : aucun entraîneur");
  assert(!!doc.querySelector('#trainingPlansCard [data-staff-market="coach"]') && /Engagez un entraîneur/.test(doc.getElementById("trainingPlansCard").textContent), "sans entraîneur : message et lien vers le marché des entraîneurs");
  assert(!doc.getElementById("trainingAddPlayer"), "sans entraîneur : aucune place de plan");
  assert(!!doc.querySelector('#collectiveTrainingConfig [data-day-option="tactique"]'), "le collectif reste disponible sans entraîneur");

  // 2) Entraîneur niveau 1 (3 places), spécialité Attaque
  await flush(dom);
  win.close();
  editSave(savePath, t => {
    t.hireTrainer(1, 800, "offense");
    t.players.forEach((p, i) => { p.trainingSecondsPlayedByPosition = { [p.position]: i % 2 ? 900 : 3600 }; });
    // Duo de parrainage possible (vérifié aussi côté serveur) : jeune 20 ans, vétéran 32 ans, même poste.
    t.players[3].age = 20; t.players[4].age = 32; t.players[4].position = t.players[3].position;
  });
  dom = await openGame(html, baseUrl);
  win = dom.window; doc = win.document;
  open();
  assert(/Entraîneur niveau 1/.test(doc.getElementById("trainingCoachCard").textContent) && /Spécialité Attaque/.test(doc.getElementById("trainingCoachCard").textContent), "en-tête : niveau et spécialité de l'entraîneur");
  const add = id => { const sel = doc.getElementById("trainingAddPlayer"); sel.value = String(id); sel.dispatchEvent(new win.Event("change", { bubbles: true })); };
  const ids = win.eval("teamA.players.map(p => p.id)");
  add(ids[0]); add(ids[1]);
  assert(doc.querySelectorAll("#trainingPlansCard .tm-slot").length === 2 && /1 place libre/.test(doc.getElementById("trainingPlansCard").textContent), "2 plans ajoutés, 1 place libre (niveau 1 : 3 places)");
  add(ids[2]);
  assert(!doc.getElementById("trainingAddPlayer"), "3 places remplies : plus de sélecteur d'ajout");

  // Rendement et détail
  const effBtn = doc.querySelector("#trainingPlansCard .tm-eff-btn");
  assert(/^\d+ %$/.test(effBtn.textContent), `rendement affiché en % (${effBtn.textContent})`);
  effBtn.click();
  const tip = effBtn.closest(".tm-eff");
  assert(tip.classList.contains("open") && effBtn.getAttribute("aria-expanded") === "true", "clic : le détail du rendement s'ouvre");
  const tipText = tip.querySelector(".tm-tip").textContent;
  assert(/Âge/.test(tipText) && /Minutes/.test(tipText) && /Taille/.test(tipText) && /Entraîneur niveau 1/.test(tipText) && /Intensité Normale/.test(tipText), "détail : âge, minutes, taille, entraîneur, intensité");
  assert(!/[Pp]oste/.test(tipText), "détail : aucun facteur de poste");
  doc.body.dispatchEvent(new win.Event("click", { bubbles: true }));
  assert(!tip.classList.contains("open"), "clic ailleurs : le détail se referme");
  assert(doc.querySelectorAll("#trainingPlansCard .tm-ceil .tm-track").length >= 3, "jauge de plafond pour chaque compétence travaillée");
  assert([...doc.querySelectorAll(".tm-room-label")].every(el => /^(Marge forte|Marge faible|Plafond atteint)$/.test(el.textContent)), "jauge : marge forte / faible / plafond atteint (jamais le potentiel chiffré)");

  // Intensité
  doc.querySelector('#trainingPlansCard [data-slot-intensity="0"][data-int="intense"]').click();
  assert(win.eval("teamA.trainingSlots[0].intensity") === "intense" && win.eval("teamA.trainingSlots[1].intensity") === "normale"
    && doc.querySelector('[data-slot-intensity="0"][data-int="intense"]').classList.contains("on"), "intensité Intense choisie pour le premier joueur seulement");
  assert(/Intensité Intense/.test(doc.querySelectorAll("#trainingPlansCard .tm-tip")[0].textContent) && /Intensité Normale/.test(doc.querySelectorAll("#trainingPlansCard .tm-tip")[1].textContent), "rendement : intensité propre à chaque joueur");

  // 3) Conseil sous un plan qui ne progresse plus + « Appliquer »
  win.eval(`(() => { const p = teamA.players.find(x => x.id === ${ids[0]}); p.attrs.threePoint = 99; teamA.trainingSlots[0].program = "threePoint"; renderTrainingPage(); })()`);
  const hint = doc.querySelector("#trainingPlansCard .tm-hint");
  assert(!!hint && /ne semble plus progresser en Tir à 3 points/.test(hint.textContent), "conseil affiché sous le plan du joueur au plafond");
  const target = hint.querySelector("[data-apply-advice]").dataset.program;
  hint.querySelector("[data-apply-advice]").click();
  assert(win.eval("teamA.trainingSlots[0].program") === target && doc.querySelector('[data-slot-program="0"]').value === target, `« Appliquer » passe le joueur sur le programme conseillé (${target})`);
  await flush(dom);
  const saved = readRawSave(savePath).team;
  assert(saved.trainingSlots.length === 3 && saved.trainingSlots[0].program === target && saved.trainingSlots[0].intensity === "intense" && saved.trainingSlots[1].intensity === "normale", "plans et intensité par joueur enregistrés côté serveur");

  // 4) Bande de la semaine : jour d'amical → tactique grisée
  const days = [...doc.querySelectorAll("#collectiveTrainingConfig [data-train-day]")];
  assert(days.length === 7, "bande de 7 jours (lundi → dimanche)");
  const free = days.find(b => !b.disabled && !b.classList.contains("today"));
  if (free) {
    const day = Number(free.dataset.trainDay);
    win.eval(`league.friendlies = [{ id: "fx", homeIdx: myTeamIndex, awayIdx: (myTeamIndex + 1) % league.teams.length, proposerIdx: myTeamIndex, at: ${day + 18 * 3600 * 1000}, status: "accepted" }]; renderCollectivePlan();`);
    doc.querySelector(`[data-train-day="${day}"]`).click();
    assert(doc.querySelector(`[data-train-day="${day}"]`).classList.contains("friendly"), "jour d'amical signalé dans la bande");
    assert(doc.querySelector('[data-day-option="tactique"]').disabled && /impossible \(amical\)/.test(doc.querySelector('[data-day-option="tactique"]').textContent), "jour d'amical : tactique grisée");
    doc.querySelector('[data-day-option="physique"]').click();
    assert(win.eval(`teamA.collectiveDayConfig(${day}).collectiveTraining`) === "physique" && /S'applique aux joueurs non retenus/.test(doc.getElementById("collectiveTrainingConfig").textContent), "jour d'amical : physique pour les non-retenus");
  } else {
    console.log("(pas de jour libre futur cette semaine : vérification de l'amical sautée)");
  }
  assert(/Connaissance tactique en cours/.test(doc.getElementById("collectiveTrainingConfig").textContent) && !!doc.querySelector(".tm-tier")
    && [...doc.querySelectorAll(".tm-gain")].every(g => /^\+\d+ × \d+ j$|^en match$/.test(g.textContent)), "jauges tactiques : palier, gain sur les jours travaillés sinon « en match »");

  // 5) Bilan du lundi
  win.eval(`(() => {
    const [a, b] = teamA.players;
    teamA.lastTrainingReport = { players: {}, slots: [
      { playerId: a.id, name: a.name, program: "threePoint", changes: [{ attr: "threePoint", before: 69, after: 71 }], delta: 2 },
      { playerId: b.id, name: b.name, program: "defInside", changes: [{ attr: "defInside", before: 78, after: 78 }], delta: 0 },
    ], advice: [{ playerId: b.id, name: b.name, fromProgram: "defInside", stalledAttr: "defInside", toProgram: "block" }],
      collective: { days: { tactique: 2, recuperation: 1, physique: 1 }, tactics: [], physicalPoints: 1 } };
    renderLastTrainingReport();
  })()`);
  const rep = doc.getElementById("lastTrainingReportHolder");
  assert(/Bilan du lundi/.test(rep.textContent), "bilan du lundi affiché");
  const kpis = [...rep.querySelectorAll(".tr-kpi b")].map(b => b.textContent);
  assert(kpis[0] === "+2" && kpis[1] === "2" && kpis[kpis.length - 1] === "1", `chiffres clés : points, joueurs suivis, conseils (${kpis.join(", ")})`);
  assert(rep.querySelectorAll(".tr-grid .tr-card").length === 2 && !!rep.querySelector(".tr-big.flat") && !!rep.querySelector(".tr-team") && rep.querySelectorAll(".tr-grid .tr-bar").length >= 2, "une carte par joueur suivi avec barres avant → après (+N ou =) et une carte Collectif");
  assert(/Tactique\s*× 2/.test(rep.textContent) && /Récupération\s*× 1/.test(rep.textContent), "carte Collectif : jours tactique / récupération / physique");
  assert(/ne semble plus progresser en Défense intérieure\. Vous devriez l'entraîner en Contre\./.test(rep.textContent), "conseil du bilan");
  const bId = win.eval("teamA.players[1].id");
  rep.querySelector("[data-apply-advice]").click();
  assert(win.eval(`teamA.activeTrainingSlots().find(s => s.playerId === ${bId}).program`) === "block", "« Appliquer » du bilan bascule le plan du joueur");

  // 6) Parrainage
  win.eval(`(() => { teamA.mentorships = []; renderMentorshipCard(); })()`);
  const ySel = doc.getElementById("mentorYoungSelect");
  ySel.value = String(win.eval("teamA.players[3].id"));
  ySel.dispatchEvent(new win.Event("change", { bubbles: true }));
  const vSel = doc.getElementById("mentorVeteranSelect");
  assert(!!vSel && [...vSel.options].some(o => o.value === String(win.eval("teamA.players[4].id"))), "choix du parrain parmi les vétérans du même poste");
  vSel.value = String(win.eval("teamA.players[4].id"));
  vSel.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(doc.querySelectorAll("#mentorshipCard .tm-pair").length === 1 && /1 \/ 2/.test(doc.getElementById("mentorshipCard").textContent), "parrainage créé (1 / 2)");
  await flush(dom);
  assert(readRawSave(savePath).team.mentorships.length === 1, "parrainage enregistré côté serveur");
  assert(doc.querySelectorAll("#experienceCard .tm-xp-row").length === win.eval("teamA.players.length"), "carte Expérience : une ligne par joueur");

  dom.window.close();
  server.close();
  console.log("\n✅ Écran Entraînement v2 vérifié.");
})().catch(e => { console.error(e); process.exit(1); });
