// Musiques des séquences (2026-10-08) : émissions d'avant-match / de
// mi-temps (emission.mp3) et entrée des joueurs du direct 2D
// (entree-joueurs.mp3). Fichiers fournis utilisés tels quels.
//  - lancement automatique avec fondu d'entrée, arrêt avec fondu de sortie ;
//  - jamais deux musiques en même temps ; passage → fondu court ;
//  - entrée des joueurs : bail renouvelé par la mise en scène, s'arrête
//    seule quand la séquence n'est plus suivie ; l'émission ouverte garde
//    la main ;
//  - pub sonore : musique coupée puis reprise ; onglet masqué : silence ;
//  - lecture bloquée : démarre au premier toucher ;
//  - branchements : openHoopShow / closeHoopShow / pub, mise en scène ;
//  - serveur : mp3 servis avec requêtes partielles (Range, iPhone).
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { startTestServer } = require("./test_helpers.js");

function fail(msg) { throw new Error("❌ " + msg); }
const ok = msg => console.log("✅ " + msg);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // Fichiers fournis, intacts.
  const up = "/root/.claude/uploads/c939ee43-4ee9-577a-8871-07f47979dac5/";
  for (const f of ["emission.mp3", "entree-joueurs.mp3", "pompom.mp3", "mascotte-1.mp3", "mascotte-2.mp3", "mascotte-3.mp3", "lanceur-maillot.mp3"]) {
    const p = path.join(__dirname, "assets/audio/music", f);
    if (!fs.existsSync(p) || fs.statSync(p).size < 100000) fail(`musique manquante : ${f}`);
    if (fs.readFileSync(p).subarray(0, 3).toString("hex") !== "494433" && fs.readFileSync(p)[0] !== 0xff) fail(`${f} n'est pas un mp3`);
  }
  if (fs.existsSync(up + "837c1693-e_mission_de_la_mi_temps.mp3") && !fs.readFileSync(up + "837c1693-e_mission_de_la_mi_temps.mp3").equals(fs.readFileSync(path.join(__dirname, "assets/audio/music/emission.mp3")))) fail("emission.mp3 doit être le fichier fourni, tel quel.");
  for (const [u, f] of [["2af1efac-pompom_girl.mp3", "pompom.mp3"], ["4c8dcd23-lanceur_maillot.mp3", "lanceur-maillot.mp3"]])
    if (fs.existsSync(up + u) && !fs.readFileSync(up + u).equals(fs.readFileSync(path.join(__dirname, "assets/audio/music", f)))) fail(`${f} doit être le fichier fourni, tel quel.`);
  const mjs = fs.readFileSync(path.join(__dirname, "assets/audio/music.js"), "utf8");
  if (!/pompom: "pompom\.mp3", mascotte1: "mascotte-1\.mp3", mascotte2: "mascotte-2\.mp3", mascotte3: "mascotte-3\.mp3", lanceur: "lanceur-maillot\.mp3"/.test(mjs)) fail("music.js : pistes des shows déclarées.");
  if (fs.existsSync(path.join(__dirname, "assets/audio/music/mascotte.mp3")) || /"mascotte\.mp3"/.test(mjs)) fail("ancienne musique de mascotte supprimée (2026-10-10).");
  ok("Fichiers en place : emission, entree-joueurs, pompom, mascotte-1 / -2 / -3 (l'ancienne mascotte.mp3 supprimée), lanceur-maillot.");

  // ---------- Module HMMusic, audio simulé ----------
  const dom = new JSDOM(`<!doctype html><body></body>`, { runScripts: "outside-only", url: "http://localhost/" });
  const { window } = dom;
  const els = [];
  let allowPlay = true;
  window.Audio = function (src) {
    const a = { src, loop: false, preload: "", volume: 1, paused: true, plays: 0,
      play() { if (!allowPlay) return Promise.reject(new Error("NotAllowedError")); a.paused = false; a.plays++; return Promise.resolve(); },
      pause() { a.paused = true; }, removeAttribute(k) { if (k === "src") a.src = ""; }, load() {} };
    els.push(a); return a;
  };
  let vis = "visible";
  Object.defineProperty(window.document, "hidden", { configurable: true, get: () => vis === "hidden" });
  const setVis = v => { vis = v; window.document.dispatchEvent(new window.Event("visibilitychange")); };
  // Sans AudioContext (JSDOM) : fondus par element.volume — même logique.
  window.eval(fs.readFileSync(path.join(__dirname, "assets/audio/music.js"), "utf8"));
  const M = window.HMMusic;
  const playing = () => els.filter(a => !a.paused && a.src);
  const vol = a => Math.round(a.volume * 100) / 100;

  M.play("emission");
  await sleep(80);
  const em = els[0];
  if (!/\/music\/emission\.mp3(\?v=\w+)?$/.test(em.src) || !em.loop || em.paused) fail("émission : emission.mp3 lancé automatiquement, en boucle.");
  if (!(em.volume > 0 && em.volume < 0.3)) fail(`émission : fondu d'entrée attendu (volume ${em.volume} après 80 ms).`);
  await sleep(1600);
  if (vol(em) !== 0.55) fail(`émission : volume final 0,55 après le fondu, obtenu ${em.volume}.`);
  ok("Émission : emission.mp3 démarre automatiquement, en boucle, fondu d'entrée (≈ 1,5 s).");

  // Même émission redemandée (autre émission ouverte) : pas de relance.
  M.play("emission"); await sleep(50);
  if (els.length !== 1) fail("une même musique déjà en cours ne doit pas être relancée.");

  // Pub sonore : coupée puis reprise.
  let endAd; const ad = new Promise(r => { endAd = r; });
  const ducked = M.duck(ad);
  await sleep(400);
  if (!em.paused) fail("pub sonore : la musique doit s'effacer puis se mettre en pause.");
  endAd(); await ducked; await sleep(1700);
  if (em.paused || vol(em) !== 0.55) fail("après la pub : la musique reprend (fondu d'entrée).");
  ok("Pub sonore de l'émission : musique effacée pendant la pub, reprise ensuite.");

  // Onglet masqué : silence, retour : reprise.
  setVis("hidden"); await sleep(30);
  if (!em.paused) fail("onglet masqué : silence.");
  setVis("visible"); await sleep(1700);
  if (em.paused) fail("retour sur l'onglet : la musique de l'émission reprend.");
  ok("Onglet masqué : silence ; retour : reprise.");

  // Entrée des joueurs demandée pendant l'émission ouverte : l'émission garde la main.
  M.play("entree", { lease: 1500 }); await sleep(100);
  if (els.length !== 1 || M.current !== "emission") fail("l'entrée des joueurs ne doit pas couper une émission ouverte.");
  ok("Entrée des joueurs demandée pendant une émission ouverte : l'émission garde la main.");

  // Fermeture de l'émission (« Quitter », « Voir le match », fin) : fondu de sortie puis arrêt.
  M.stop("emission");
  await sleep(300);
  if (em.paused || !(em.volume < 0.55)) fail("fermeture : fondu de sortie en cours (pas de coupure brutale).");
  await sleep(800);
  if (!em.paused || em.src) fail("fermeture : musique arrêtée et libérée après le fondu.");
  ok("Fermeture de l'émission : fondu de sortie (≈ 0,9 s) puis arrêt.");

  // Entrée des joueurs : bail renouvelé → joue ; plus renouvelé → s'arrête seule.
  const renew = setInterval(() => M.play("entree", { lease: 1500 }), 400);
  M.play("entree", { lease: 1500 });
  await sleep(2500);
  const en = els[els.length - 1];
  if (!/entree-joueurs\.mp3(\?v=\w+)?$/.test(en.src) || en.paused || vol(en) !== 0.55) fail("entrée des joueurs : entree-joueurs.mp3 joué pendant la séquence.");
  clearInterval(renew);
  await sleep(1500 + 300 + 1000);
  if (!en.paused) fail("entrée des joueurs : sans renouvellement (coup d'envoi, page quittée), la musique s'arrête seule.");
  ok("Entrée des joueurs : entree-joueurs.mp3 tant que la séquence est suivie, puis fondu et arrêt d'elle-même.");

  // Jamais deux musiques simultanées : passage entrée → émission.
  M.play("entree", { lease: 5000 }); await sleep(1600);
  const en2 = els[els.length - 1];
  let overlap = 0;
  const watch = setInterval(() => { if (playing().length > 1) overlap++; }, 20);
  M.play("emission");                          // l'utilisateur ouvre l'émission
  await sleep(200);
  if (en2.paused || !(en2.volume < 0.55)) fail("passage : la musique précédente s'efface d'abord (fondu court).");
  await sleep(1800);
  clearInterval(watch);
  const em2 = els[els.length - 1];
  if (overlap) fail(`jamais deux musiques en même temps (${overlap} relevés à deux).`);
  if (!en2.paused || em2.paused || !/emission/.test(em2.src)) fail("passage : la nouvelle musique démarre après la fin du fondu de la précédente.");
  ok("Jamais deux musiques à la fois : la précédente finit son fondu court (≈ 0,4 s) avant que la suivante démarre.");
  M.stop(); await sleep(1100);

  // Lecture automatique bloquée : démarre au premier toucher.
  allowPlay = false;
  M.play("emission"); await sleep(50);
  if (playing().length) fail("lecture bloquée par le navigateur : rien ne joue encore.");
  allowPlay = true;
  window.document.dispatchEvent(new window.Event("pointerdown"));
  await sleep(50);
  if (!playing().length) fail("lecture bloquée : la musique démarre au premier toucher.");
  ok("Lecture automatique bloquée par le navigateur : la musique démarre au premier toucher.");
  M.stop(); await sleep(1100);

  // ---------- Branchements dans le jeu ----------
  const html = require("./test_game_html.js").readGameHtml();
  const fnOf = name => { const m = new RegExp(`(?:async )?function ${name}\\([^]*?\\n}\\n`).exec(html); return m ? m[0] : ""; };
  if (!/<script src="assets\/audio\/music\.js\?v=\d+" defer><\/script>/.test(html)) fail("music.js chargé par la page du jeu.");
  if (!/HMMusic\.play\("emission"\)/.test(fnOf("openHoopShow"))) fail("openHoopShow lance la musique de l'émission (avant-match et mi-temps).");
  if (!/HMMusic\.stop\("emission"\)/.test(fnOf("closeHoopShow"))) fail("closeHoopShow arrête la musique de l'émission.");
  if (!/HMMusic\.duck\(/.test(fnOf("hoopShowOnAd"))) fail("pub sonore de l'émission : musique coupée.");
  const stg = fs.readFileSync(path.join(__dirname, "assets/live/staging.js"), "utf8");
  if (!/M\.play\("entree", \{ lease: 1500 \}\)/.test(stg) || !/ph\.kind === "intro"/.test(stg)) fail("mise en scène : musique de l'entrée des joueurs pendant la phase intro.");
  ok("Branchements : ouverture / fermeture des émissions (toutes sorties : Quitter, Voir le match, fin), pub, phase « entrée des joueurs » de la mise en scène (bêta direct 2D).");

  // Mise en scène réelle : la phase intro demande la musique, le coup d'envoi l'arrête.
  {
    const d2 = new JSDOM(`<!doctype html><div id="host"></div>`, { pretendToBeVisual: true, runScripts: "outside-only" });
    const w = d2.window;
    const strip = src => src.replace(/^import .*$/mg, "").replace(/^export\s+(function|const|let|class)/mg, "$1").replace(/^export\s*\{[^}]*\};?/mg, "");
    w.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/format.js"), "utf8")));
    w.eval(strip(fs.readFileSync(path.join(__dirname, "assets/live/court2d.js"), "utf8")));
    w.eval("window.__staging = (function(){" + strip(fs.readFileSync(path.join(__dirname, "assets/live/characters.js"), "utf8")) + "; const mascotSvg = mascot;" +
      strip(fs.readFileSync(path.join(__dirname, "assets/live/staging.js"), "utf8")) + "; return { createStaging }; })();");
    const calls = [];
    w.HMMusic = { play: (k, o) => calls.push(["play", k, o && o.lease]), stop: k => calls.push(["stop", k]) };
    let NOW = 1_900_000_000_000;
    const avatar = id => `<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" data-avatar="${id}"><circle cx="60" cy="60" r="40"/></svg>`;
    const mk = (k, c) => ({ name: k, short: k.slice(0, 3).toUpperCase(), score: 0, color: c, players: [0, 1, 2, 3, 4, 5].map(i => ({ id: k + i, name: k + " " + i, pos: ["M", "AS", "A", "AF", "P"][i % 5], onCourt: i < 5, avatar: avatar(k + i), number: 4 + i })) });
    const S = { status: "pregame", kickoffAt: NOW + 60000, quarter: 1, clock: 600, teams: [mk("Krakens", "#F26B1D"), mk("Rennes", "#3B8FE0")], events: [], shots: [], referees: [0, 1, 2].map(i => ({ id: "ref" + i })) };
    const cfg = { coach: true, playerIntro: true, shows: true };
    const host = w.document.getElementById("host");
    // JSDOM n'a pas de mise en page : le terrain est considéré affiché.
    host.getClientRects = () => [1];
    const court = w.createCourt2D(host, { raster: false, now: () => NOW, staging: () => cfg, stagingModule: w.__staging });
    court.update(S, []); await sleep(700);
    if (calls.some(c => c[0] === "play")) fail("pas de musique d'entrée plus de 30 s avant le coup d'envoi.");
    NOW = S.kickoffAt - 29000; court.update(S, []); await sleep(700);
    if (!calls.some(c => c[0] === "play" && c[1] === "entree" && c[2] === 1500)) fail(`entrée des joueurs (30 s avant le coup d'envoi) : musique demandée, obtenu ${JSON.stringify(calls)}.`);
    const n = calls.length;
    host.getClientRects = () => [];   // page du direct quittée
    await sleep(700);
    if (!calls.slice(n).some(c => c[0] === "stop" && c[1] === "entree")) fail("page du direct quittée pendant l'entrée : musique arrêtée.");
    host.getClientRects = () => [1]; await sleep(700);
    NOW = S.kickoffAt + 100; S.status = "live"; court.update(S, []); await sleep(700);
    const last = calls.filter(c => c[1] === "entree").pop();
    if (!last || last[0] !== "stop") fail("coup d'envoi : fin de la séquence, musique arrêtée.");
    ok("Mise en scène : musique demandée pendant les 30 s d'entrée des joueurs seulement, arrêtée au coup d'envoi ou si la page du direct est quittée.");
    // Shows : une musique par show, le temps du show seulement.
    S.events = [{ id: 0, kind: "tipoff", type: "period", quarter: 1, clock: 600, airAt: NOW - 1000, text: "" }];
    const mascotKeys = [];
    for (const [st, key0] of [[{ kind: "timeout", team: 0, quarter: 1 }, "pompom"], [{ kind: "quarter-break", quarter: 1 }, "mascotte"], [{ kind: "quarter-break", quarter: 1 }, "mascotte"], [{ kind: "quarter-break", quarter: 1 }, "mascotte"], [{ kind: "quarter-break", quarter: 3 }, "lanceur"]]) {
      let key = key0;
      S.quarter = st.quarter; S.stoppage = { ...st, startAt: NOW, endsAt: NOW + 60000 };
      NOW += 2000; court.update(S, []); await sleep(900);
      if (key === "mascotte") {
        const p = calls.filter(c => c[0] === "play" && /^mascotte[123]$/.test(c[1])).pop();
        if (!p) fail(`show mascotte seule : une des deux musiques de mascotte attendue, obtenu ${JSON.stringify(calls.slice(-4))}.`);
        key = p[1]; mascotKeys.push(key);
      }
      const mine = calls.filter(c => c[0] === "play" && c[1] === key && c[2] === 1500);
      if (!mine.length) fail(`show « ${key} » : musique demandée, obtenu ${JSON.stringify(calls.slice(-4))}.`);
      if (calls.slice(-3).some(c => c[0] === "play" && c[1] !== key)) fail(`show « ${key} » : une seule musique à la fois.`);
      NOW = S.stoppage.endsAt - 500; court.update(S, []); await sleep(700);
      if (!calls.slice(-3).some(c => c[0] === "stop" && c[1] === key)) fail(`show « ${key} » : musique arrêtée avec le fondu de sortie du show.`);
      NOW = S.stoppage.endsAt + 10; S.stoppage = null; court.update(S, []); await sleep(500);
    }
    if (new Set(mascotKeys).size !== 3 || mascotKeys.some((k, i) => i && k === mascotKeys[i - 1])) fail("mascotte seule : les trois musiques à tour de rôle, obtenu " + mascotKeys.join(", "));
    S.stoppage = { kind: "quarter-break", quarter: 2, startAt: NOW, endsAt: NOW + 60000 }; S.quarter = 2;
    const before = calls.length; NOW += 2000; court.update(S, []); await sleep(800);
    if (calls.slice(before).some(c => c[0] === "play")) fail("pas de show en fin de Q2 : aucune musique.");
    S.stoppage = null; NOW += 60000; court.update(S, []);
    court.destroy();
    ok(`Shows : pompom.mp3 aux temps morts, mascotte seule en fin de Q1 avec ses 3 musiques à tour de rôle (${mascotKeys.join(" → ")}), lanceur-maillot.mp3 en fin de Q3, le temps du show seulement.`);
  }

  // ---------- Serveur : mp3 avec requêtes partielles ----------
  process.chdir(__dirname);
  const srv = await startTestServer();
  const base = "http://127.0.0.1:" + srv.server.address().port;
  const full = await fetch(base + "/assets/audio/music/emission.mp3");
  const size = fs.statSync(path.join(__dirname, "assets/audio/music/emission.mp3")).size;
  if (full.status !== 200 || full.headers.get("content-type") !== "audio/mpeg" || full.headers.get("accept-ranges") !== "bytes" || Number(full.headers.get("content-length")) !== size) fail(`mp3 complet : 200 audio/mpeg, Accept-Ranges, taille exacte (obtenu ${full.status} ${full.headers.get("content-type")}).`);
  const part = await fetch(base + "/assets/audio/music/emission.mp3", { headers: { Range: "bytes=100-199" } });
  const body = Buffer.from(await part.arrayBuffer());
  if (part.status !== 206 || part.headers.get("content-range") !== `bytes 100-199/${size}` || body.length !== 100 || !body.equals(fs.readFileSync(path.join(__dirname, "assets/audio/music/emission.mp3")).subarray(100, 200))) fail("requête partielle : 206, Content-Range et octets exacts.");
  const bad = await fetch(base + "/assets/audio/music/emission.mp3", { headers: { Range: `bytes=${size + 10}-` } });
  if (bad.status !== 416) fail("plage hors fichier : 416.");
  const js = await fetch(base + "/assets/audio/music.js");
  if (js.status !== 200) fail("music.js servi.");
  if (srv.server.close) srv.server.close();
  ok("Serveur : mp3 servis en audio/mpeg avec requêtes partielles (206, 416) — lecture possible sur iPhone.");

  console.log("Musiques des séquences : tout est vert.");
  process.exit(0);
})().catch(e => { console.error(e.message || e); process.exit(1); });
