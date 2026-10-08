// Terrain 2D animé du direct (assets/live/court2d.js — retour utilisateur,
// 2026-09-29 : « transformer le live actuel en ce format de live avec les
// joueurs qui bougent », « rendu parquet », « le vrai visage des joueurs »,
// « il manque les remises en jeu »). Niveau 1 : mise en scène par-dessus le
// moteur (rien n'est simulé ici). Vérifie, sur un état au contrat de
// live-view.js (README.md) : dix sprites (les joueurs sur le terrain), le
// vrai avatar de chaque joueur dans son sprite, le ballon dans les mains
// d'un joueur, la chorégraphie d'un panier (le tireur va à l'endroit du
// tir, +2 affiché, remise en jeu par l'équipe qui encaisse), le
// remplacement (le sortant quitte le terrain, l'entrant apparaît) et le
// commentaire de l'action sous le terrain.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function fail(msg) { throw new Error("❌ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
const { window } = dom;
// Modules ES chargés « à la main » (JSDOM ne charge pas les modules) : les
// import/export sont retirés, format.js d'abord.
const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
// SVGElement.getComputedTextLength n'existe pas dans JSDOM : le module ne doit
// pas en dépendre (largeur d'étiquette estimée).

const avatar = (id) => `<span class="player-avatar"><svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" data-avatar="${id}"><circle cx="60" cy="60" r="40"/></svg></span>`;
const mkTeam = (key, names, poss) => ({
  name: key, short: key.slice(0, 3).toUpperCase(), score: 0, color: key === "Gotham" ? "#F26B1D" : "#3B8FE0",
  players: names.map((n, i) => ({ id: key + ":" + n, name: n, pos: poss[i % 5], onCourt: i < 5, avatar: avatar(key + i), pts: 0, reb: 0, ast: 0, number: 4 + i, fatigue: i * 20, pf: i === 1 ? 4 : 0 })),
});
const POS = ["M", "AS", "A", "AF", "P"];
const S = {
  status: "live", quarter: 1, clock: 600, possession: 0,
  teams: [mkTeam("Gotham", ["Ali Kane", "Ben Moro", "Cal Ito", "Dan Vidal", "Eli Nakamura", "Fab Roux", "Gus Lee"], POS),
          mkTeam("Rennes", ["Hal Novak", "Ian Brooks", "Jo Wright", "Kai Ferreira", "Leo Ramos", "Max Silva", "Ned Diallo"], POS)],
  shots: [], events: [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: Date.now() - 120000, text: "" }],
};
// Match en cours : l'entre-deux du moteur a déjà été diffusé (avant lui,
// personne n'a le ballon — voir live_court2d_clock_test.js).

(async () => {
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { colors: ["#F26B1D", "#3B8FE0"], raster: false });   // pas de canvas sous JSDOM
  S.referees = [0, 1, 2].map(i => ({ id: "ref" + i, avatar: avatar("ref" + i) }));
  court.update(S, []);
  await sleep(120);

  const sprites = () => [...host.querySelectorAll(".c2d-p")];
  if (sprites().length !== 10) fail(`10 joueurs attendus sur le terrain (les onCourt), obtenu ${sprites().length}.`);
  if (sprites().filter(g => g.classList.contains("t0")).length !== 5) fail("5 sprites par équipe attendus.");
  console.log("✅ Dix sprites, cinq par équipe (players[].onCourt).");
  const refEls = [...host.querySelectorAll(".c2d-ref")];
  if (refEls.length !== 3) fail(`3 arbitres attendus, obtenu ${refEls.length}.`);
  if (!refEls.every(g => g.querySelector('svg[data-avatar^="ref"]'))) fail("chaque arbitre doit porter son avatar.");
  console.log("✅ Trois arbitres avec avatar sur le terrain.");

  const g0 = host.querySelector('.c2d-p[data-id="Gotham:Ali Kane"]');
  if (!g0 || !g0.querySelector('svg[data-avatar="Gotham0"]')) fail("le sprite doit embarquer le vrai avatar SVG du joueur (players[].avatar).");
  if (!/KANE/.test(g0.textContent)) fail("l'étiquette du sprite doit porter le nom de famille en capitales.");
  console.log("✅ Chaque sprite embarque l'avatar du joueur et son nom.");

  if (!host.querySelector(".c2d-p.has-ball")) fail("après le premier update en direct, un joueur doit avoir le ballon (meneur de l'équipe en possession).");
  const holder = host.querySelector(".c2d-p.has-ball").dataset.id;
  if (!holder.startsWith("Gotham:")) fail(`le ballon doit être à l'équipe en possession (0 = Gotham), obtenu ${holder}.`);
  console.log("✅ Ballon dans les mains du meneur de l'équipe en possession.");

  // Panier de Gotham (attaque le panier de droite) : passe de Kane, tir de
  // Moro à l'endroit indiqué, +2, puis remise en jeu par Rennes.
  S.events.push({ id: 1, team: 0, type: "made", kind: "shot", quarter: 1, clock: 585, made: true, zone: "mid",
    text: "Ben Moro ajuste son tir à mi-distance.", score: [2, 0], shot: { x: 78, y: 18 },
    actors: { shooter: "Gotham:Ben Moro", assister: "Gotham:Ali Kane" } });
  // Priorité 3 : on relève les traces créées (passe, arc du tir).
  const trailsSeen = new Set();
  const trailObs = new window.MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.classList && n.classList.contains("c2d-trail")) trailsSeen.add(n.getAttribute("class")); })));
  trailObs.observe(host, { childList: true, subtree: true });
  // Public : on relève les réactions déclenchées (classe du groupe des spectateurs).
  const reactions = new Set();
  const crowdObs = new window.MutationObserver(ms => ms.forEach(m => { const c = m.target.getAttribute && m.target.getAttribute("class"); if (c && /react-/.test(c)) c.split(" ").forEach(x => /react-/.test(x) && reactions.add(x)); }));
  crowdObs.observe(host, { attributes: true, attributeFilter: ["class"], subtree: true });
  S.teams[0].score = 2; S.possession = 1; S.teams[0].players[1].pts = 2;
  court.update(S, [1]);
  await sleep(150);
  if (!/Ben Moro/.test(host.querySelector(".c2d-caption").textContent)) fail("le commentaire de l'action doit s'afficher sous le terrain.");
  const moro = host.querySelector('.c2d-p[data-id="Gotham:Ben Moro"]');
  // JSDOM ne cadence pas requestAnimationFrame comme un navigateur : on
  // vérifie que le tireur se RAPPROCHE de l'endroit du tir, pas qu'il y
  // arrive à la milliseconde.
  const pos = () => { const m = /translate\(([\d.-]+) ([\d.-]+)\)/.exec(moro.getAttribute("transform") || ""); return m ? [+m[1], +m[2]] : null; };
  const d = p => Math.hypot(p[0] - 780, p[1] - 180);
  const p0 = pos();
  await sleep(1100);
  const p1 = pos();
  if (!p0 || !p1) fail("le sprite du tireur doit être positionné par un transform translate(x y).");
  if (!(d(p1) < d(p0) - 20)) fail(`le tireur doit se déplacer vers l'endroit du tir (≈780,180) : ${p0} → ${p1}.`);
  await sleep(1200);
  const ptsf = moro.querySelectorAll(".c2d-ptsf");
  if (ptsf.length !== 1 || ptsf[0].textContent !== "+2") fail(`un seul « +2 » attendu au-dessus du tireur après le panier, obtenu ${ptsf.length} (« ${ptsf[0] && ptsf[0].textContent} »).`);
  console.log("✅ Panier : le tireur va à l'endroit du tir et le +2 s'affiche.");
  if (!/\bt0\b/.test(ptsf[0].getAttribute("class"))) fail(`le « +2 » doit être aux couleurs de l'équipe (t0), obtenu « ${ptsf[0].getAttribute("class")} ».`);
  if (moro.querySelector(".c2d-stat").textContent) fail("le « +2 » ne passe plus par l'étiquette d'action du jeton (plus de clignotement prolongé).");
  if (!reactions.has("react-cheer-h")) fail(`panier du club qui reçoit : ses supporters doivent réagir (react-cheer-h), obtenu ${[...reactions]}.`);
  // Fluidité (2026-10-08) : le public est rangé en feuilles (une par
  // cohorte de mouvement × camp, calques composés), spectateurs regroupés
  // en tracés par couleur ; le nombre de spectateurs est porté par data-fans.
  const crowdEl = host.querySelector(".c2d-crowd");
  const nFans = +(crowdEl && crowdEl.getAttribute("data-fans") || 0);
  const sheets = [...host.querySelectorAll(".c2d-crowd > svg.c2d-fans")];
  const motions = new Set(sheets.map(sv => (/\bm-(\w+)/.exec(sv.getAttribute("class")) || [])[1]));
  if (nFans < 150 || sheets.length < 6 || motions.size < 3 || !host.querySelector(".c2d-fans .arms path") || !host.querySelector(".c2d-fans.s-a") || !host.querySelector(".c2d-fans.s-h")) fail(`public : des spectateurs (bras, supporters des deux clubs) répartis en cohortes de mouvement, obtenu ${nFans} spectateurs, ${sheets.length} feuilles, ${motions.size} mouvements.`);
  if (host.querySelectorAll(".c2d-crowd .fan").length) fail("public : plus d'élément par spectateur (tracés regroupés par couleur).");
  console.log(`✅ Public : ${nFans} spectateurs en ${sheets.length} feuilles (${motions.size} mouvements) ; les supporters du club qui marque célèbrent.`);
  if (![...trailsSeen].some(c => /pass/.test(c))) fail("la passe décisive doit laisser une traînée (.c2d-trail.pass).");
  if (![...trailsSeen].some(c => /shot t0/.test(c))) fail("le tir doit laisser sa traînée de mouvement aux couleurs de l'équipe (.c2d-trail.shot.t0).");
  console.log("✅ Traînée de mouvement derrière la passe et le tir (plus de pointillés), « +2 » aux couleurs de l'équipe.");

  await sleep(2200);
  const holder2 = host.querySelector(".c2d-p.has-ball");
  if (!holder2 || !holder2.dataset.id.startsWith("Rennes:")) fail(`après un panier encaissé, Rennes doit remettre en jeu et avoir le ballon, obtenu ${holder2 && holder2.dataset.id}.`);
  console.log("✅ Remise en jeu : le ballon passe à l'équipe qui a encaissé.");
  trailObs.disconnect();
  if (moro.querySelector(".c2d-ptsf")) fail("le « +2 » doit avoir disparu (supprimé) après ~2 s.");
  console.log("✅ « +2 » : visible ~2 s puis supprimé, aucun résidu.");
  if (host.querySelector(".c2d-trail.shot")) fail("l'arc du tir doit s'effacer après l'arrivée du ballon.");

  // Arène (2026-10-08) : plus de cartes en haut ; tableau suspendu (score,
  // quart-temps, chrono, 24 s), énergie et fautes sous chaque jeton,
  // remplaçants assis sur le banc.
  if (host.querySelector(".c2d-medal, .c2d-medals")) fail("les cartes joueurs du haut doivent avoir disparu.");
  if (host.querySelectorAll(".c2d-p .c2d-num").length !== 10) fail("numéro de maillot attendu sur chaque jeton.");
  if (host.querySelector('.c2d-p[data-id="Gotham:Ali Kane"] .c2d-num text').textContent !== "4") fail("pastille du numéro : 4 attendu pour Ali Kane.");
  const scores = [...host.querySelectorAll(".c2d-score")].map(t => t.textContent);
  if (scores.length !== 2 || scores.some(x => !/^\d+$/.test(x))) fail(`score des deux équipes attendu dans le tableau suspendu, obtenu ${scores}.`);
  if (!/^Q\d · \d+:\d\d$/.test(host.querySelector(".c2d-period").textContent)) fail(`quart-temps et chrono attendus, obtenu « ${host.querySelector(".c2d-period").textContent} ».`);
  const moroTok = host.querySelector('.c2d-p[data-id="Gotham:Ben Moro"]');
  if (moroTok.querySelector(".c2d-foul").getAttribute("opacity") !== "1" || moroTok.querySelector(".c2d-foul text").textContent !== "4") fail("pastille « 4 » fautes attendue sous le jeton de Ben Moro.");
  if (host.querySelector('.c2d-p[data-id="Gotham:Ali Kane"] .c2d-foul').getAttribute("opacity") !== "0") fail("pas de pastille de fautes sous 4 fautes.");
  const barW = id => +host.querySelector(`.c2d-p[data-id="${id}"] .c2d-energy rect:last-child`).getAttribute("width");
  if (!(Math.abs(barW("Gotham:Ali Kane") - 28) < 0.1 && barW("Gotham:Ali Kane") > barW("Gotham:Ben Moro"))) fail(`barre d'énergie attendue sous les jetons (100 − fatigue), obtenu ${barW("Gotham:Ali Kane")} / ${barW("Gotham:Ben Moro")}.`);
  const subs = host.querySelectorAll(".c2d-bench .c2d-sub");
  const benchExpected = S.teams.reduce((n, t) => n + t.players.filter(p => !p.onCourt).length, 0);
  if (subs.length !== benchExpected) fail(`${benchExpected} remplaçants attendus sur les bancs, obtenu ${subs.length}.`);
  if (subs.length && !subs[0].querySelector(".c2d-energy")) fail("les remplaçants affichent aussi leur énergie.");
  const clock = host.querySelector(".c2d-clock-val").textContent;
  if (!/^\d+(\.\d)?$/.test(clock) || +clock > 24) fail(`chrono des 24 s attendu, obtenu « ${clock} ».`);
  console.log("✅ Arène : tableau suspendu, énergie et fautes sous les jetons, remplaçants sur les bancs.");

  // Possession jouée À L'AVANCE (state.nextAction) : Rennes attaque à
  // gauche, Wright tire à 3 pts ; le ballon doit être en l'air avant que
  // l'événement n'arrive, et le résultat (+3) s'afficher dès son arrivée.
  const airAt = Date.now() + 2800;
  S.nextAction = { kind: "shot", team: 1, zone: "three", airAt, shot: { x: 20, y: 40 }, actors: { shooter: "Rennes:Jo Wright" } };
  court.update(S, []);
  await sleep(2600);
  if (host.querySelector(".c2d-p.has-ball")) fail("pendant le tir planifié, le ballon doit être en l'air (aucun porteur).");
  S.events.push({ id: 2, team: 1, type: "made", kind: "shot", quarter: 1, clock: 560, made: true, zone: "three", airAt,
    text: "Jo Wright de loin !", score: [2, 3], shot: { x: 20, y: 40 }, actors: { shooter: "Rennes:Jo Wright" } });
  S.teams[1].score = 3; S.nextAction = null;
  await sleep(250);
  court.update(S, [2]);
  await sleep(120);
  const wright = host.querySelector('.c2d-p[data-id="Rennes:Jo Wright"] .c2d-ptsf');
  if (!wright || wright.textContent !== "+3") fail(`tir joué à l'avance : « +3 » attendu dès l'arrivée de l'événement, obtenu « ${wright && wright.textContent} ».`);
  console.log("✅ Possession jouée à l'avance : tir parti avant l'événement, résultat révélé à son arrivée.");

  // Tir manqué : une croix à l'endroit du tir, un commentaire du présentateur ignoré par le terrain.
  await sleep(2800);
  S.events.push({ id: 3, team: 0, type: "miss", kind: "rebound", quarter: 1, clock: 540, made: false, zone: "mid", offensive: false, text: "Cal Ito manque, Hal Novak prend le rebond.", shot: { x: 70, y: 30 }, actors: { shooter: "Gotham:Cal Ito", rebounder: "Rennes:Hal Novak" } });
  S.shots.push({ id: 3, team: 0, quarter: 1, made: false, zone: "mid", x: 70, y: 30 });
  S.events.push({ id: 4, type: "quote", kind: "quote", team: null, quarter: 1, clock: 540, text: "Quel début de match !", speaker: "Nicolas Cosset" });
  court.update(S, [3, 4]);
  await sleep(200);
  // Retour utilisateur 2026-10-08 : plus aucune marque de tir manqué sur le
  // terrain (la carte des tirs les montre) — ni croix, ni onde rouge, ni texte.
  if (host.querySelectorAll(".c2d-miss").length !== 0) fail("un tir manqué ne doit laisser aucune croix sur le terrain.");
  if ([...host.querySelectorAll(".c2d-wave")].some(w => w.getAttribute("stroke") !== "#5fd6ae")) fail("aucune onde rouge au cercle sur un tir manqué.");
  if (/RAT|MANQU/i.test([...host.querySelectorAll(".c2d-stat")].map(e => e.textContent).join("|"))) fail("aucun texte « raté » sur les joueurs.");
  if (S.shots.filter(s => !s.made).length !== 1) fail("la donnée du tir manqué reste dans shots[] pour la carte des tirs.");
  if (/Quel début/.test(host.querySelector(".c2d-caption").textContent)) fail("un commentaire du présentateur ne doit pas remplacer la légende de l'action.");
  console.log("✅ Tir manqué : aucune marque sur le terrain (carte des tirs seule) ; commentaire du présentateur réservé au fil.");
  await sleep(2600);

  // Lancer franc marqué joué à l'avance (plan calé sur airAt) : la remise en
  // jeu de l'équipe qui encaisse doit suivre, même si la possession suivante
  // est déjà annoncée (retour 2026-10-01).
  const ftAt = Date.now() + 2600;
  S.nextAction = { kind: "freeThrow", team: 0, airAt: ftAt, actors: { shooter: "Gotham:Cal Ito" } };
  court.update(S, []);
  await sleep(2700);
  S.events.push({ id: 6, team: 0, type: "ft", kind: "freeThrow", quarter: 1, clock: 530, made: 1, attempts: 1, airAt: ftAt, text: "Cal Ito 1/1 aux lancers francs.", score: [3, 3], actors: { shooter: "Gotham:Cal Ito" } });
  S.teams[0].score = 3;
  S.nextAction = { kind: "shot", team: 1, zone: "mid", airAt: Date.now() + 9000, shot: { x: 20, y: 20 }, actors: { shooter: "Rennes:Leo Ramos" } };
  court.update(S, [6]);
  await sleep(1700);
  const inb = [...host.querySelectorAll(".c2d-p.t1")].map(g => /translate\(([\d.-]+)/.exec(g.getAttribute("transform"))).filter(Boolean).map(m => +m[1]);
  if (!inb.some(x => x > 940)) fail(`le remiseur doit être sorti derrière la ligne de fond (x > 94 pieds), positions ${inb.map(x => x.toFixed(0))}.`);
  await sleep(1900);
  const h3 = host.querySelector(".c2d-p.has-ball");
  if (!h3 || !h3.dataset.id.startsWith("Rennes:")) fail(`après un lancer franc marqué, Rennes doit remettre en jeu, obtenu ${h3 && h3.dataset.id}.`);
  console.log("✅ Lancer franc marqué (joué à l'avance) : remise en jeu derrière la ligne de fond par l'équipe qui encaisse.");
  // La possession suivante est annoncée loin dans le futur : le plan du tir
  // précédent est remplacé (ses minuteries ne partent plus).
  S.nextAction = { kind: "shot", team: 1, zone: "mid", airAt: Date.now() + 60000, shot: { x: 20, y: 20 }, actors: { shooter: "Rennes:Leo Ramos" } };
  court.update(S, []);
  await sleep(2500);

  // Remplacement : Kane sort, Roux entre.
  S.teams[0].players.find(p => p.name === "Ali Kane").onCourt = false;
  S.teams[0].players.find(p => p.name === "Fab Roux").onCourt = true;
  S.events.push({ id: 5, team: 0, type: "sub", kind: "substitution", quarter: 1, clock: 560, text: "Fab Roux remplace Ali Kane.", actors: { player: "Gotham:Ali Kane", replacement: "Gotham:Fab Roux" } });
  court.update(S, [5]);
  await sleep(1900);
  if (host.querySelector('.c2d-p[data-id="Gotham:Ali Kane"]')) fail("le joueur sorti doit avoir quitté le terrain.");
  if (!host.querySelector('.c2d-p[data-id="Gotham:Fab Roux"]')) fail("le remplaçant doit être entré.");
  if (sprites().length !== 10) fail(`toujours 10 sprites après un remplacement, obtenu ${sprites().length}.`);
  console.log("✅ Remplacement : le sortant disparaît, l'entrant apparaît, toujours dix joueurs.");

  // Dribble continu (2026-10-08) : le ballon rebondit dans les mains d'un
  // porteur même immobile ; il ne s'arrête qu'en vol (passe / tir).
  await sleep(300);
  const ballBody = host.querySelector(".c2d-ball > g");
  const zs = new Set();
  for (let i = 0; i < 8; i++) { await sleep(45); const m = /translate\(0 ([\d.-]+)\)/.exec(ballBody.getAttribute("transform") || ""); if (m) zs.add(m[1]); }
  if (!host.querySelector(".c2d-p.has-ball")) fail("un porteur est attendu pour le test du dribble.");
  if (zs.size < 3) fail(`le dribble doit être continu (hauteur du ballon qui varie), valeurs vues : ${[...zs]}.`);
  console.log("✅ Dribble continu dans les mains du porteur.");

  // Règle des 8 s / retour en zone (représentation) : un porteur placé en
  // zone arrière plus de 5,5 s après le début de la possession repart vers
  // la zone avant ; une fois la ligne franchie, sa cible reste en zone avant.
  const holderEl = host.querySelector(".c2d-p.has-ball");
  const dbg0 = court.debug();
  const holderTeam = dbg0.holderTeam;
  court.test.setHolderPosition(holderTeam === 0 ? 20 : 74, 25);
  court.test.resetPossessionClock(-6000);
  await sleep(400);
  const tgt = court.test.holderTarget();
  if (!tgt || (holderTeam === 0 ? tgt.x < 47 : tgt.x > 47)) fail(`après 6 s en zone arrière, le porteur doit viser la zone avant (cible ${JSON.stringify(tgt)}).`);
  await sleep(2500);
  const tgt2 = court.test.holderTarget();
  if (!tgt2 || (holderTeam === 0 ? tgt2.x < 47 : tgt2.x > 47)) fail(`ligne franchie : la cible du porteur ne revient pas en zone arrière (${JSON.stringify(tgt2)}).`);
  console.log("✅ 8 secondes : le porteur traverse ; retour en zone : il ne revient pas derrière la ligne.");

  // Bannière CONTRE sur un vrai contre du moteur, à l'arrivée de l'événement.
  S.events.push({ id: 7, team: 1, type: "miss", kind: "shot", quarter: 1, clock: 500, made: false, blocked: true, zone: "paint", airAt: Date.now(), text: "Contre !", shot: { x: 10, y: 25 }, actors: { shooter: "Rennes:Leo Ramos", blocker: "Gotham:Cal Ito" } });
  court.update(S, [7]);
  // Version courte sans plan : passes (~0,9 s) puis vol du ballon (~0,5 s), la bannière suit.
  await sleep(2100);
  const bn = host.querySelector(".c2d-banner .c2d-banner-text");
  if (!bn || bn.textContent !== "CONTRE") fail(`bannière « CONTRE » attendue sur un contre, obtenu ${bn && bn.textContent}.`);
  console.log("✅ Bannière CONTRE sur un contre du moteur.");
  await sleep(1700);

  // Arbitre de ligne de fond : toujours DERRIÈRE la ligne (x > 94 ou x < 0),
  // jamais dessus ni sur le terrain (retour utilisateur 2026-10-08).
  {
    const posR = g => { const m = /translate\(([\d.-]+) ([\d.-]+)\)/.exec(g.getAttribute("transform") || ""); return m ? [+m[1] / 10, +m[2] / 10] : null; };
    const samples = [];
    for (let i = 0; i < 6; i++) { await sleep(300); samples.push(...[...host.querySelectorAll(".c2d-ref")].map(posR)); }
    const bad = samples.filter(p => p && ((p[0] > 91 && p[0] < 95.5) || (p[0] < 3 && p[0] > -1.5)));
    if (bad.length) fail(`arbitre sur ou devant la ligne de fond : ${JSON.stringify(bad.slice(0, 3))}.`);
    if (!samples.some(p => p && (p[0] >= 95.5 || p[0] <= -1.5))) fail(`un arbitre doit se tenir derrière la ligne de fond : ${JSON.stringify(samples.slice(-3))}.`);
    console.log("✅ Arbitre de ligne de fond : derrière la ligne, jamais dessus ni sur le terrain.");
  }
  crowdObs.disconnect();
  if (!reactions.has("react-groan-h") && !reactions.has("react-groan-a")) fail(`tir raté : les supporters de l'équipe qui rate doivent montrer leur déception, obtenu ${[...reactions]}.`);

  // Temps mort : chaque équipe rejoint SON banc (Gotham à gauche du centre, Rennes à droite).
  S.events.push({ id: 8, type: "timeout", kind: "timeout", team: 0, quarter: 1, clock: 480, text: "Temps mort Gotham", durationMs: 6000, actors: {} });
  court.update(S, [8]);
  await sleep(4200);
  const posOf = g => { const m = /translate\(([\d.-]+) ([\d.-]+)\)/.exec(g.getAttribute("transform") || ""); return m ? [+m[1] / 10, +m[2] / 10] : null; };
  const tg0 = [...host.querySelectorAll(".c2d-p.t0")].map(posOf), tg1 = [...host.querySelectorAll(".c2d-p.t1")].map(posOf);
  if (!tg0.every(p => p && p[0] < 47 && p[1] > 40)) fail(`Gotham doit être à son banc (gauche du centre, ligne de touche basse) : ${JSON.stringify(tg0)}.`);
  if (!tg1.every(p => p && p[0] > 47 && p[1] > 40)) fail(`Rennes doit être à son banc (droite du centre) : ${JSON.stringify(tg1)}.`);
  const refPos = [...host.querySelectorAll(".c2d-ref")].map(posOf);
  if (!refPos.every(p => p && p[1] > 44)) fail("les arbitres rejoignent la table de marque pendant le temps mort.");
  console.log("✅ Temps mort : chaque équipe à son banc, arbitres à la table.");

  // Priorité 1 terrain (2026-10-08) : paniers vus de dessus, ballon plus
  // gros, halo du porteur aux couleurs de son équipe, anti-chevauchement
  // de RENDU (positions de scène inchangées), porteur au premier plan.
  if (host.querySelectorAll(".c2d-hoop").length !== 2) fail("deux paniers vus de dessus attendus (.c2d-hoop).");
  if (host.querySelectorAll(".c2d-hoop .c2d-rim").length !== 2) fail("chaque panier doit avoir son cercle (.c2d-rim).");
  const ballR = host.querySelector(".c2d-ball circle");
  if (!ballR || +ballR.getAttribute("r") < 9) fail("ballon plus gros attendu (rayon ≥ 9).");
  const ringT0 = host.querySelector('.c2d-p.t0 .c2d-carrier-ring');
  if (!ringT0 || ringT0.getAttribute("stroke") !== "#F26B1D") fail("halo du porteur aux couleurs de son équipe attendu.");
  await sleep(4000);   // fin du temps mort
  const dbg = court.debug();
  const ids = [...host.querySelectorAll(".c2d-p")].map(g => g.dataset.id);
  const holderId = dbg.holder || ids[0];
  const crowd = ids.filter(id => id !== holderId).slice(0, 4);
  court.test.placeAt(holderId, 60, 25);
  crowd.forEach((id, i) => court.test.placeAt(id, 60 + (i % 2 ? 0.4 : -0.4), 25 + (i < 2 ? 0.3 : -0.3)));
  await sleep(900);
  const lay = court.test.layout();
  const pts = [holderId, ...crowd].map(id => lay.sprites[id]);
  if (!pts.every(p => p && p.sx >= 59 && p.sx <= 61)) fail("l'anti-chevauchement ne doit pas toucher aux positions de scène.");
  let minD = 99;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minD = Math.min(minD, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  if (minD < 1.8) fail(`jetons encore empilés à l'écran (écart minimal ${minD.toFixed(2)} pied).`);
  if (lay.holder === holderId) {
    const h = lay.sprites[holderId];
    if (Math.hypot(h.x - h.sx, h.y - h.sy) > 0.01) fail("le porteur ne doit pas être déplacé par l'anti-chevauchement.");
    if (h.lab === "off") fail("le nom du porteur ne doit jamais être masqué.");
    await sleep(300);
    const layerKids = [...host.querySelector(".c2d-players").children].filter(g => g.classList.contains("c2d-p") || g.classList.contains("c2d-ref"));
    if (layerKids[layerKids.length - 1].dataset.id !== holderId) fail("le porteur doit passer au premier plan.");
  }
  if (!pts.some(p => p.lab === "off" || p.lab === "sm")) fail("dans un groupe serré, des étiquettes doivent être réduites ou masquées.");
  console.log(`✅ Paniers, ballon, halo du porteur ; anti-chevauchement (écart min ${minD.toFixed(1)} pied), étiquettes réduites, porteur devant.`);

  court.destroy();
  if (host.innerHTML !== "") fail("destroy() doit vider le conteneur.");
  console.log("✅ Tous les tests du terrain 2D sont passés.");
  window.close();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
