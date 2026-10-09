"use strict";
// Permaliens des joueurs + historique de progression (demande validée le
// 2026-10-01, voir server/playerLinks.js, server/playerPage.js et
// PLAYER_HISTORY_SEASONS dans engine.js) :
// - instantané hebdomadaire de chaque joueur (humains et IA), plafonné à
//   3 saisons, sauvegardé et rechargé ;
// - jamais envoyé pour un joueur d'un autre club (/api/save, Planète Hoop) ;
// - lien créé / coupé seulement par le manager du club ;
// - page publique /j/<code> : tout (potentiel compris), aperçu og:, courbe ;
// - lien mort dès que le joueur quitte le club ; 404 « Lien expiré ».
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Engine = require("../engine.js");
const AutoSim = require("./autoSim.js");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const World = require("./world.js");
const PublicPlayers = require("./publicPlayers.js");
const PlayerLinks = require("./playerLinks.js");

function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }

function request(server, method, urlPath, jsonBody, headers) {
  const { port } = server.address();
  const payload = jsonBody !== undefined ? JSON.stringify(jsonBody) : null;
  const h = { ...(headers || {}) };
  if (payload) { h["Content-Type"] = "application/json"; h["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers: h }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", c => { raw += c; });
      res.on("end", () => { let body = null; try { body = JSON.parse(raw); } catch (e) { /* page HTML */ } resolve({ status: res.statusCode, body, raw, headers: res.headers }); });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  // ---------------------------------------------------------------------
  // 1) Moteur : instantané hebdomadaire, plafond de 3 saisons, sauvegarde.
  // ---------------------------------------------------------------------
  {
    const career = store.createMultiManagerCareer(["Lyon Histo", "Paris Histo"], Date.UTC(2026, 8, 1));
    const lg = career.league;
    const human = lg.teams[0], cpu = lg.teams.find(t => !t.isHuman);
    const p = human.players[0];
    const before = (p.weeklyHistory || []).length;
    const events = [];
    AutoSim.runWeeklyEconomyTick(lg, 1, Date.UTC(2026, 8, 7), false, events);
    AutoSim.runWeeklyEconomyTick(lg, 2, Date.UTC(2026, 8, 14), false, events);
    check(before === 0 && p.weeklyHistory.length === 2, "lundi : un instantané par semaine (club humain)");
    check(cpu.players.every(x => x.weeklyHistory.length === 2), "lundi : clubs IA aussi");
    const [s, w, o, ...attrs] = p.weeklyHistory[1];
    check(s === (lg.seasonNumber || 1) && w === 2 && o === Math.round(p.overall() * 10) / 10, `clé saison + semaine (S${s} sem. ${w}) et note (${o})`);
    check(attrs.length === Engine.ATTRS.length && attrs.every(Number.isInteger) && attrs[0] === Math.round(p.attrs[Engine.ATTRS[0]]), "toutes les caractéristiques en entiers, dans l'ordre d'ATTRS");
    // Plafond : 3 saisons.
    for (let season = 2; season <= 5; season++) {
      lg.seasonNumber = season;
      for (let k = 0; k < 3; k++) lg.recordPlayerHistory();
    }
    const seasons = [...new Set(p.weeklyHistory.map(e => e[0]))];
    check(JSON.stringify(seasons) === "[3,4,5]", `3 saisons au plus, les plus anciennes retirées (${seasons})`);
    check(p.weeklyHistory.filter(e => e[0] === 5).map(e => e[1]).join() === "1,2,3", "la semaine repart à 1 à chaque saison");
    lg.seasonNumber = 6;
    for (let k = 0; k < 200; k++) { lg.playerHistoryWeek = { s: 6, w: k }; lg.recordPlayerHistory(); }
    check(p.weeklyHistory.length <= Engine.PLAYER_HISTORY_MAX_ENTRIES, `garde-fou du nombre d'entrées (${p.weeklyHistory.length})`);
    lg.playerHistoryWeek = { s: 6, w: 3 };
    // Sauvegarde / rechargement.
    const json = JSON.parse(JSON.stringify(store.serializeMultiLeague(lg)));
    const back = store.deserializeMultiLeague(json).league;
    const p2 = back.teams[0].players.find(x => x.id === p.id);
    check(JSON.stringify(p2.weeklyHistory) === JSON.stringify(p.weeklyHistory), "historique sauvegardé puis rechargé à l'identique");
    check(back.playerHistoryWeek && back.playerHistoryWeek.s === 6 && back.playerHistoryWeek.w === 3, "semaine courante de l'historique sauvegardée");
    const bytes = JSON.stringify(p.weeklyHistory.slice(0, 1)).length;
    check(bytes < 140, `instantané compact (${bytes} octets)`);
    // Miroir navigateur : sérialisation identique.
    const html = require("../test_game_html.js").readGameHtml();
    check(html.includes("weeklyHistory: Array.isArray(p.weeklyHistory) ? p.weeklyHistory.map(e => e.slice()) : [],")
      && html.includes("p.weeklyHistory = Array.isArray(pdata.weeklyHistory)"), "miroir moteurbasket3.html : historique sérialisé et restauré");
    const fnSrc = src => { const i = src.indexOf("function ppChartHtml("); return src.slice(i, src.indexOf("\n}\n", i) + 2); };
    const serverSrc = fs.readFileSync(path.join(__dirname, "playerPage.js"), "utf-8");
    check(fnSrc(serverSrc).length > 500 && fnSrc(serverSrc) === fnSrc(html), "courbe : ppChartHtml identique dans server/playerPage.js et moteurbasket3.html");

    // Joueurs d'autres clubs : jamais d'historique.
    const out = JSON.parse(JSON.stringify(store.serializeMultiLeague(lg))).league;
    PublicPlayers.sanitizeOwnLeagueForViewer(out, 0, { scouted: {}, levels: {}, attrKeys: Engine.ATTRS });
    check(out.teams[0].players.every(x => Array.isArray(x.weeklyHistory) && x.weeklyHistory.length > 0), "/api/save : historique gardé pour ses propres joueurs");
    check(out.teams.slice(1).every(t => t.players.every(x => !("weeklyHistory" in x))), "/api/save : historique retiré pour tous les adversaires");
    const listed = lg.teams[3].players[0].id;
    const out2 = JSON.parse(JSON.stringify(store.serializeMultiLeague(lg))).league;
    out2.transferListings = [{ id: 1, playerId: listed, status: "open", sellerIdx: 3 }];
    PublicPlayers.sanitizeOwnLeagueForViewer(out2, 0, { scouted: {}, levels: {}, attrKeys: Engine.ATTRS });
    const lp = out2.teams[3].players.find(x => x.id === listed);
    check(lp.attrs && !lp.attrsHidden && !("weeklyHistory" in lp), "joueur adverse sur le marché : caractéristiques visibles mais pas d'historique");
    const out3 = JSON.parse(JSON.stringify(store.serializeMultiLeague(lg))).league;
    PublicPlayers.sanitizeForeignLeague(out3);
    check(out3.teams.every(t => t.players.every(x => !("weeklyHistory" in x))), "autre championnat (Planète Hoop) : aucun historique");
  }

  // ---------------------------------------------------------------------
  // 2) Serveur : création / révocation / page publique.
  // ---------------------------------------------------------------------
  process.env.BASKET_ADMIN_TOKEN = "admin-permalink-test";
  let now = Date.UTC(2026, 8, 30, 10);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-permalink-test-"));
  const multiSavePath = path.join(dir, "multi-league.json");
  const accountsPath = path.join(dir, "accounts.json");
  const server = http.createServer(createHandler(path.join(dir, "league.json"), () => now, multiSavePath, accountsPath));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    const boot = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon", "Paris"] }, { "X-Admin-Token": "admin-permalink-test" });
    check(boot.status === 200, "ligue partagée créée (2 managers)");
    const M = {};
    boot.body.managers.forEach(m => { M[m.name] = { idx: m.teamIndex, h: { "X-TipIn-Token": m.token } }; });

    let world = await World.loadWorld(multiSavePath, now);
    let lg = await World.loadLeague(world, store.HISTORIC_LEAGUE_ID, multiSavePath);
    const lyon = lg.teams[M.Lyon.idx];
    const star = lyon.players[0], solo = lyon.players[1];
    // Trois semaines d'historique pour `star` (progression visible), une
    // seule pour `solo` (message d'attente).
    star.weeklyHistory = []; solo.weeklyHistory = [];
    [[1, 0], [2, 2], [3, 5]].forEach(([w, gain]) => {
      const saved = { ...star.attrs };
      Engine.ATTRS.forEach(a => { star.attrs[a] = Math.min(99, saved[a] + gain); });
      Engine.pushPlayerHistory(star, 1, w);
      star.attrs = saved;
    });
    Engine.pushPlayerHistory(solo, 1, 1);
    star.number = 23;
    lyon.isPaying = true; // courbe réservée aux clubs Premium
    await store.saveMultiLeague(lg, multiSavePath);

    // Création : jeton obligatoire, joueur de SON club uniquement.
    let r = await request(server, "POST", "/api/player/share-link", { playerId: star.id });
    check(r.status === 401, "sans jeton : création refusée (401)");
    r = await request(server, "POST", "/api/player/share-link", { playerId: star.id }, M.Paris.h);
    check(r.status === 404 && !r.body.code, "un autre manager ne peut pas créer de lien pour ce joueur (404)");
    r = await request(server, "POST", "/api/player/share-link", { playerId: star.id }, M.Lyon.h);
    check(r.status === 200 && PlayerLinks.CODE_RE.test(r.body.code), `lien créé par le manager du club (code ${r.body.code})`);
    const code = r.body.code;
    check(/\/j\/[A-Za-z0-9_-]{8}$/.test(r.body.url) && r.body.url.endsWith(`/j/${code}`), `adresse complète renvoyée (${r.body.url})`);
    r = await request(server, "POST", "/api/player/share-link", { playerId: star.id }, M.Lyon.h);
    check(r.body.code === code, "deuxième demande : même code (un seul lien par joueur)");
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "multi-league.playerlinks.json"), "utf-8"));
    const entry = stored.codes[code];
    check(entry && entry.leagueId === store.HISTORIC_LEAGUE_ID && entry.teamIdx === M.Lyon.idx && entry.playerId === star.id && typeof entry.createdAt === "number",
      "lien stocké à part : { leagueId, teamIdx, playerId, createdAt }");
    const codes = new Set();
    for (let i = 0; i < 500; i++) codes.add(PlayerLinks.newCode({}));
    check(codes.size === 500 && [...codes].every(c => PlayerLinks.CODE_RE.test(c)), "codes aléatoires de 8 caractères URL-safe, sans collision sur 500 tirages");

    // /api/save : liens actifs du club ; adversaires sans historique.
    r = await request(server, "GET", "/api/save", undefined, M.Lyon.h);
    check(r.status === 200 && r.body.playerShareLinks && r.body.playerShareLinks[star.id] === code, "/api/save : lien actif renvoyé au manager du club");
    const lyonOut = r.body.league.teams[M.Lyon.idx].players.find(p => p.id === star.id);
    check(lyonOut.weeklyHistory.length === 3, "/api/save : historique de ses propres joueurs");
    r = await request(server, "GET", "/api/save", undefined, M.Paris.h);
    const seenByParis = r.body.league.teams[M.Lyon.idx].players.find(p => p.id === star.id);
    check(!("weeklyHistory" in seenByParis) && !Object.keys(r.body.playerShareLinks || {}).length, "/api/save d'un autre manager : ni historique ni lien de Lyon");
    r = await request(server, "GET", `/api/world/player-page?league=${store.HISTORIC_LEAGUE_ID}&team=${M.Lyon.idx}&id=${star.id}`, undefined, M.Paris.h);
    const viaWorld = r.body && r.body.league ? r.body.league.teams[M.Lyon.idx].players.find(p => p.id === star.id) : null;
    check(r.status === 200 && viaWorld && !("weeklyHistory" in viaWorld) && !viaWorld.attrs, "Planète Hoop (fiche joueur) : ni historique ni caractéristiques");

    // Page publique : tout, sans connexion.
    r = await request(server, "GET", `/j/${code}`, undefined, { "Accept-Language": "fr-FR,fr;q=0.9" });
    check(r.status === 200 && /text\/html/.test(r.headers["content-type"]), "page publique servie sans connexion (200, HTML)");
    const overall = Math.round(star.overall());
    const ogTitle = `${star.name} · ${star.position}, ${star.age} ans · Note ${overall} · ${lyon.name}`;
    const escAttr = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    check(r.raw.includes(`<meta property="og:title" content="${escAttr(ogTitle)}">`), `og:title « ${ogTitle} »`);
    check(/<meta property="og:description" content="[^"]+">/.test(r.raw) && r.raw.includes(`og:url" content="http://127.0.0.1:`), "og:description et og:url");
    check(r.raw.includes(Engine.potentialTierLabel(star.potential)) && r.raw.includes("data-potential"), `potentiel affiché (${Engine.potentialTierLabel(star.potential)})`);
    check(Engine.ATTRS.every(a => r.raw.includes(`data-attr="${a}"`)), "les 28 caractéristiques en barres");
    check(r.raw.includes(`class="attr-v">${Math.round(star.attrs.threePoint)}<`), "valeurs réelles des caractéristiques");
    check(r.raw.includes('class="pp-line"') && r.raw.includes('id="ppSel"') && r.raw.includes('value="threePoint"'), "courbe de progression + sélecteur de caractéristique");
    check(r.raw.includes("S1 · sem. 1") && r.raw.includes("S1 · sem. 3"), "semaines de la courbe");
    check(r.raw.includes('name="robots" content="noindex"') && !r.raw.includes(M.Lyon.h["X-TipIn-Token"]), "noindex, aucun jeton dans la page");
    check(r.raw.includes(">23<") || r.raw.includes("<b>23</b>"), "maillot floqué du numéro");
    // Langue des pages publiques (Accept-Language).
    r = await request(server, "GET", `/j/${code}`, undefined, { "Accept-Language": "en-GB,en;q=0.9" });
    check(r.status === 200 && r.raw.includes('<html lang="en"') && r.raw.includes(">Potential<") && !r.raw.includes(">Potentiel<"), "page en anglais selon Accept-Language");
    r = await request(server, "GET", `/j/${code}?lang=it`);
    check(r.raw.includes('<html lang="it"'), "?lang=it : page en italien");

    // Club non Premium : pas de courbe, message Premium.
    {
      const w2 = await World.loadWorld(multiSavePath, now);
      const lg2 = await World.loadLeague(w2, store.HISTORIC_LEAGUE_ID, multiSavePath);
      lg2.teams[M.Lyon.idx].isPaying = false;
      await store.saveMultiLeague(lg2, multiSavePath);
      r = await request(server, "GET", `/j/${code}`);
      check(r.status === 200 && r.raw.includes("La courbe de progression est réservée aux clubs Premium.") && !r.raw.includes('id="ppSel"') && !r.raw.includes('class="pp-line"'), "club non Premium : caractéristiques visibles, courbe réservée au Premium");
      lg2.teams[M.Lyon.idx].isPaying = true;
      await store.saveMultiLeague(lg2, multiSavePath);
    }

    // Un seul point : message d'attente.
    r = await request(server, "POST", "/api/player/share-link", { playerId: solo.id }, M.Lyon.h);
    const soloCode = r.body.code;
    r = await request(server, "GET", `/j/${soloCode}`);
    check(r.status === 200 && r.raw.includes("La progression s&#39;affichera au fil des semaines") && !r.raw.includes('id="ppSel"'), "un seul point : « La progression s'affichera au fil des semaines »");

    // Révocation : seul le manager du club.
    r = await request(server, "POST", "/api/player/share-link/revoke", { playerId: solo.id }, M.Paris.h);
    check(r.status === 200 && r.body.revoked === false, "un autre manager ne coupe rien");
    r = await request(server, "GET", `/j/${soloCode}`);
    check(r.status === 200, "le lien reste actif");
    r = await request(server, "POST", "/api/player/share-link/revoke", { playerId: solo.id }, M.Lyon.h);
    check(r.status === 200 && r.body.revoked === true, "« Couper le lien » par le manager du club");
    r = await request(server, "GET", `/j/${soloCode}`);
    check(r.status === 404 && r.raw.includes("Lien expiré ou introuvable") && r.raw.includes('href="/bienvenue"'), "lien coupé : page 404 « Lien expiré ou introuvable » avec lien vers le jeu");

    // Départ du club (vente, transfert…) : lien mort et supprimé.
    world = await World.loadWorld(multiSavePath, now);
    lg = await World.loadLeague(world, store.HISTORIC_LEAGUE_ID, multiSavePath);
    const from = lg.teams[M.Lyon.idx], to = lg.teams[M.Paris.idx];
    const moving = from.players.find(p => p.id === star.id);
    from.players = from.players.filter(p => p.id !== star.id);
    to.players.push(moving);
    await store.saveMultiLeague(lg, multiSavePath);
    r = await request(server, "GET", `/api/save`, undefined, M.Lyon.h);
    check(!r.body.playerShareLinks[star.id], "/api/save : plus de lien actif pour un joueur parti");
    r = await request(server, "GET", `/j/${code}`);
    check(r.status === 404 && r.raw.includes("Lien expiré ou introuvable"), "joueur parti dans un autre club : lien expiré (404)");
    const after = JSON.parse(fs.readFileSync(path.join(dir, "multi-league.playerlinks.json"), "utf-8"));
    check(!after.codes[code], "mapping supprimé à la lecture");
    r = await request(server, "POST", "/api/player/share-link", { playerId: star.id }, M.Paris.h);
    check(r.status === 200 && r.body.code !== code, "le nouveau club peut créer SON propre lien (nouveau code)");
    check(moving.weeklyHistory.length === 3, "l'historique suit le joueur dans son nouveau club");

    // Club rendu à l'IA (manager parti) : lien coupé.
    {
      r = await request(server, "POST", "/api/player/share-link", { playerId: solo.id }, M.Lyon.h);
      const c2 = r.body.code;
      const w3 = await World.loadWorld(multiSavePath, now);
      const lg3 = await World.loadLeague(w3, store.HISTORIC_LEAGUE_ID, multiSavePath);
      lg3.teams[M.Lyon.idx].isHuman = false;
      await store.saveMultiLeague(lg3, multiSavePath);
      r = await request(server, "GET", `/j/${c2}`);
      check(r.status === 404 && r.raw.includes("Lien expiré ou introuvable"), "club rendu à l'IA : lien coupé (404)");
    }

    // Codes inconnus / mal formés.
    for (const bad of ["/j/AAAAAAAA", "/j/xx", "/j/%E0%A4%A", "/j/"]) {
      r = await request(server, "GET", bad);
      check(r.status === 404 && r.raw.includes("Lien expiré ou introuvable"), `code inconnu ou invalide ${bad} : 404 propre`);
    }
  } finally {
    server.close();
  }
  console.log("\nTous les tests des permaliens joueur passent.");
}

main().catch(e => { console.error(e); process.exit(1); });
