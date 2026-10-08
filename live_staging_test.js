// Mise en scène du direct 2D (assets/live/staging.js, 2026-10-08, bêta
// liveShows) : entrée des joueurs 30 s avant le coup d'envoi et 30 s avant
// la reprise de la 2e mi-temps sans jamais retarder le jeu, regroupement
// autour du coach à chaque temps mort puis retour en position, bon show au
// bon moment (temps mort → pompom girls, fin Q1 → mascotte, fin Q3 → canon
// à t-shirts, rien ailleurs), durée du show bornée par l'arrêt, chorégraphie
// jamais répétée deux fois de suite, arrivée en retard = chacun à sa place.
// Horloge simulée (opts.now) : on se place à chaque instant voulu.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function fail(msg) { throw new Error("❌ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dom = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
const { window } = dom;
const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
window.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
// staging.js + characters.js dans une même portée (les import sont retirés).
window.eval("window.__staging = (function(){" + strip(fs.readFileSync(path.join(__dirname, "assets/live/characters.js"), "utf8")) + "; const mascotSvg = mascot;" +
  strip(fs.readFileSync(path.join(__dirname, "assets/live/staging.js"), "utf8")) + "; return { createStaging, showFor, SHOW_FOR, CHOREOS, INTRO_MS }; })();");

const avatar = id => `<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" data-avatar="${id}"><circle cx="60" cy="60" r="40"/></svg>`;
const POS = ["M", "AS", "A", "AF", "P"];
const mkTeam = (key, color) => ({ name: key, short: key.slice(0, 3).toUpperCase(), score: 0, color,
  players: [0, 1, 2, 3, 4].map(i => ({ id: key + ":#" + i, name: key + " Joueur" + i, pos: POS[i], onCourt: true, starter: true, avatar: avatar(key + i), number: 10 + i, pf: 0 })) });

(async () => {
  const STG = window.__staging;
  let NOW = 1_800_000_000_000;
  const shows = [];
  const S = { status: "live", quarter: 2, clock: 400, possession: 0, events: [], shots: [], referees: [0, 1, 2].map(i => ({ id: "ref" + i, avatar: avatar("ref" + i) })),
    teams: [mkTeam("Krakens", "#d6473f"), mkTeam("Rennes", "#2f7fd8")] };
  const cfg = { coach: true, playerIntro: true, shows: true, coaches: [avatar("coach0"), avatar("coach1")], homeColors: ["#d6473f", "#ffd34d"], homeShort: "KRA", mascot: null,
    onShow: info => shows.push(info.show) };
  const host = window.document.getElementById("host");
  const court = window.createCourt2D(host, { raster: false, now: () => NOW, staging: () => cfg, stagingModule: STG });
  const go = async (ms = 260) => { court.update(S, []); await sleep(ms); };
  const dbg = () => court.debug().staging;
  const pos = id => court.test.layout().sprites[id];
  await go(300);

  // --- Table des shows ---
  if (STG.showFor({ kind: "timeout" }) !== "pompom") fail("temps mort → pompom girls.");
  if (STG.showFor({ kind: "quarter-break", quarter: 1 }) !== "mascot") fail("fin Q1 → mascotte.");
  if (STG.showFor({ kind: "quarter-break", quarter: 3 }) !== "tshirt") fail("fin Q3 → canon à t-shirts.");
  if (STG.showFor({ kind: "quarter-break", quarter: 2 }) || STG.showFor({ kind: "halftime", quarter: 2 }) || STG.showFor({ kind: "quarter-break", quarter: 5 })) fail("pas de show à la mi-temps, en fin de Q2 ni en prolongation.");
  console.log("✅ Table moment → show (temps mort, fin Q1, fin Q3 ; rien ailleurs).");

  // --- Coach devant chaque banc ---
  const coachEls = host.querySelectorAll(".stg-coach");
  if (coachEls.length !== 2) fail(`deux coachs attendus devant les bancs, obtenu ${coachEls.length}.`);
  const cs = dbg().coaches;
  if (!(cs[0].x < 47 && cs[1].x > 47 && cs[0].y > 50 && cs[1].y > 50)) fail(`coachs devant leur banc (domicile à gauche, hors du terrain) : ${JSON.stringify(cs)}.`);
  if (!host.querySelector('.stg-coach svg[data-avatar="coach0"]')) fail("le coach porte l'avatar du club.");
  console.log("✅ Coachs devant leur banc, avatar du club, hors du terrain.");

  // --- Temps mort : regroupement autour du coach, show, retour ---
  S.stoppage = { kind: "timeout", team: 0, quarter: 2, startAt: NOW, endsAt: NOW + 60000 };
  NOW += 2500; await go(1700);
  const huddle = [0, 1].every(t => S.teams[t].players.every(p => { const q = pos(p.id); const bx = [33, 61][t]; return q && Math.hypot(q.sx - bx, q.sy - 51.4) < 9.5; }));
  if (!huddle) fail("au temps mort, chaque équipe se regroupe autour de son coach.");
  if (dbg().show !== "pompom" || !host.querySelector(".stg-show-pompom")) fail("temps mort : show des pompom girls attendu.");
  const nDancers = host.querySelectorAll(".stg-dancer").length;
  if (nDancers < 6 || nDancers > 8) fail(`6 à 8 pompom girls attendues, obtenu ${nDancers}.`);
  if (shows.join() !== "pompom") fail(`un seul déclenchement (pub : une par arrêt) attendu, obtenu ${shows}.`);
  const firstChoreo = dbg().choreo;
  NOW += 20000; await go(); if (shows.length !== 1) fail("pas de second déclenchement pendant le même arrêt.");
  // Fin de l'arrêt : le show s'arrête à endsAt, les joueurs sont relâchés.
  NOW = S.stoppage.endsAt + 50; S.stoppage = null; await go(300);
  if (host.querySelector(".stg-show") || dbg().show) fail("le show doit être retiré à la fin de l'arrêt (jamais rallongé).");
  if (dbg().held !== 0) fail("après le temps mort, plus aucun joueur tenu par la mise en scène.");
  console.log(`✅ Temps mort : regroupement autour du coach, ${nDancers} pompom girls, show arrêté à la reprise, joueurs relâchés.`);

  // Deuxième temps mort : jamais la même chorégraphie deux fois de suite.
  S.stoppage = { kind: "timeout", team: 1, quarter: 2, startAt: NOW, endsAt: NOW + 60000 }; NOW += 1500; await go();
  if (dbg().choreo === firstChoreo) fail("la chorégraphie ne doit pas se répéter deux fois de suite.");
  NOW = S.stoppage.endsAt + 10; S.stoppage = null; await go();
  console.log("✅ Chorégraphie différente au temps mort suivant.");

  // --- Fin du 1er quart : mascotte ; joueurs au banc ---
  S.quarter = 1; S.stoppage = { kind: "quarter-break", quarter: 1, startAt: NOW, endsAt: NOW + 120000 };
  NOW += 4000; await go(1300);
  if (dbg().show !== "mascot" || !host.querySelector(".stg-mascot")) fail("fin du 1er quart : show de la mascotte attendu.");
  const bench = S.teams[0].players.every(p => { const q = pos(p.id); return q && q.sy > 41; });
  if (!bench) fail("en fin de quart-temps, les joueurs vont s'asseoir sur leur banc.");
  NOW = S.stoppage.endsAt + 10; S.stoppage = null; await go();
  console.log("✅ Fin Q1 : mascotte, joueurs au banc.");

  // --- Fin du 3e quart : canon à t-shirts ---
  S.quarter = 3; S.stoppage = { kind: "quarter-break", quarter: 3, startAt: NOW, endsAt: NOW + 120000 };
  NOW += 5000; await go();
  if (dbg().show !== "tshirt" || host.querySelectorAll(".stg-launcher").length !== 2) fail("fin du 3e quart : deux lanceurs de t-shirts attendus.");
  // Saut dans le temps (replay) au-delà de l'arrêt : coupure propre.
  NOW += 500000; S.stoppage = null; await go();
  if (host.querySelector(".stg-show")) fail("un saut après l'arrêt coupe le show proprement.");
  console.log("✅ Fin Q3 : canon à t-shirts ; saut dans le temps = show coupé.");

  // --- Pas de show à la mi-temps ni en fin de Q2 ---
  S.quarter = 2; S.stoppage = { kind: "quarter-break", quarter: 2, startAt: NOW, endsAt: NOW + 120000 }; NOW += 3000; await go();
  if (dbg().show) fail("pas de show en fin de Q2.");
  S.stoppage = null;

  // --- Entrée des joueurs : 30 s avant le coup d'envoi, finit au coup d'envoi ---
  S.status = "pregame"; S.kickoffAt = NOW + 31000; await go();
  if (dbg().phase === "intro") fail("l'entrée ne commence pas plus de 30 s avant le coup d'envoi.");
  NOW = S.kickoffAt - 29500; await go(200);
  if (dbg().phase !== "intro") fail("entrée des joueurs attendue 30 s avant le coup d'envoi.");
  // Présentation : extérieur d'abord (vers 5-13 s), puis domicile (13-21 s).
  NOW = S.kickoffAt - 30000 + 5800; await go(200);
  const card1 = host.querySelector(".stg-card-name");
  if (!card1 || !/RENNES/.test(card1.textContent)) fail(`présentation de l'équipe extérieure d'abord, obtenu « ${card1 && card1.textContent} ».`);
  NOW = S.kickoffAt - 30000 + 14000; await go(200);
  const card2 = host.querySelector(".stg-card-name");
  if (!card2 || !/KRAKENS/.test(card2.textContent)) fail("puis présentation de l'équipe à domicile.");
  const sub = host.querySelector(".stg-card-sub").textContent;
  if (!/#1\d/.test(sub)) fail(`la carte montre le numéro et le poste, obtenu « ${sub} ».`);
  // Fin de l'entrée : mise en place pour l'entre-deux, au centre.
  NOW = S.kickoffAt - 1500; await go(1200);
  const jumpers = [S.teams[0].players[4], S.teams[1].players[4]].map(p => pos(p.id));
  if (!jumpers.every(q => q && Math.abs(q.sx - 47) < 3 && Math.abs(q.sy - 25) < 2)) fail(`les pivots se placent au centre pour l'entre-deux : ${JSON.stringify(jumpers)}.`);
  // Coup d'envoi : la mise en scène lâche tout, à l'heure exacte (jamais de retard).
  NOW = S.kickoffAt; S.status = "live"; await go(150);
  if (dbg().phase !== "live" || dbg().held !== 0) fail("au coup d'envoi, plus rien n'est tenu par la mise en scène (le jeu n'est jamais retardé).");
  console.log("✅ Entrée : 30 s avant, extérieur puis domicile présentés (nom, numéro, poste), entre-deux en place, finie au coup d'envoi.");

  // --- Arrivée en retard pendant l'entrée : chacun directement à sa place ---
  S.status = "pregame"; S.kickoffAt = NOW + 4000; await go(80);
  const q = pos(S.teams[0].players[4].id);
  if (!(Math.abs(q.sx - 47) < 3)) fail("arrivée en retard : les joueurs apparaissent directement à leur place.");
  NOW = S.kickoffAt; S.status = "live"; await go(100);
  console.log("✅ Arrivée en retard : entrée coupée, joueurs directement en place.");

  // --- Reprise de la 2e mi-temps : 30 s avant, version courte ---
  S.status = "halftime"; S.stoppage = { kind: "halftime", quarter: 2, startAt: NOW - 570000, endsAt: NOW + 25000 }; await go(300);
  if (dbg().phase.indexOf("return:") !== 0) fail("retour des équipes 30 s avant la reprise de la 2e mi-temps.");
  if (host.querySelector(".stg-card")) fail("pas de présentation individuelle à la reprise.");
  NOW = S.stoppage.endsAt; S.status = "live"; S.stoppage = null; await go(150);
  if (dbg().held !== 0) fail("à la reprise, la mise en scène lâche tout.");
  console.log("✅ Reprise : retour ensemble 30 s avant, sans présentation, fini à la reprise.");

  // --- Hors bêta : rien ---
  court.destroy();
  const host2 = window.document.createElement("div"); window.document.body.appendChild(host2);
  const plain = window.createCourt2D(host2, { raster: false, now: () => NOW, staging: () => null, stagingModule: STG });
  S.stoppage = { kind: "timeout", team: 0, quarter: 2, startAt: NOW, endsAt: NOW + 60000 }; NOW += 2000;
  plain.update(S, []); await sleep(300);
  if (host2.querySelector(".stg-coach, .stg-show, .stg-intro")) fail("sans configuration (hors bêta), aucune mise en scène.");
  plain.destroy();
  console.log("✅ Hors bêta : aucun coach, aucun show.");

  console.log("✅ Tous les tests de la mise en scène sont passés.");
  window.close();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
