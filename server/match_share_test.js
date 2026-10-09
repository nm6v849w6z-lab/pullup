"use strict";
// Partage d'un match / d'une rediffusion (P3, 2026-10-09, voir
// server/matchLinks.js et server/matchPage.js) :
// - lien stable `/m/<code>` créé par un manager du championnat (le même pour
//   tous) ; rediffusion = Premium (comme « Revoir le direct ») ; ligue privée
//   refusée ; sans jeton → 401 ;
// - page publique sans connexion : contexte (compétition, journée, équipes,
//   score final), terrain 2D, noindex, aucun jeton ;
// - données publiques en lecture seule : ni caractéristiques, ni tactiques,
//   ni statistiques de la feuille ; pendant le direct, ni score final ni
//   actions à venir ;
// - lien inconnu ou match purgé : page « plus disponible » (404) ;
// - aucune route d'écriture derrière /m/.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Engine = require("../engine.js");
const { createHandler } = require("./index.js");
const store = require("./store.js");
const World = require("./world.js");
const LiveMatch = require("./liveMatch.js");

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
      res.on("end", () => { let body = null; try { body = JSON.parse(raw); } catch (e) { /* HTML */ } resolve({ status: res.statusCode, body, raw, headers: res.headers }); });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  process.env.BASKET_ADMIN_TOKEN = "admin-match-share-test";
  let now = Date.UTC(2026, 9, 9, 18);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basket-match-share-test-"));
  const multiSavePath = path.join(dir, "multi-league.json");
  const accountsPath = path.join(dir, "accounts.json");
  const server = http.createServer(createHandler(path.join(dir, "league.json"), () => now, multiSavePath, accountsPath));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try {
    const boot = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon", "Paris"] }, { "X-Admin-Token": "admin-match-share-test" });
    check(boot.status === 200, "ligue partagée créée (2 managers)");
    const M = {};
    boot.body.managers.forEach(m => { M[m.name] = { idx: m.teamIndex, h: { "X-TipIn-Token": m.token } }; });

    // Un match déjà joué (rediffusion archivée) et un match en direct.
    let world = await World.loadWorld(multiSavePath, now);
    let lg = await World.loadLeague(world, store.HISTORIC_LEAGUE_ID, multiSavePath);
    const H = M.Lyon.idx, A = M.Paris.idx;
    const past = LiveMatch.computeLiveMatchForTeams(Engine, lg.teams[H], lg.teams[A], 2, H, A, now - 6 * 3600e3, "championship");
    const season = lg.seasonNumber || 1;
    await store.appendReplays(store.HISTORIC_LEAGUE_ID, [{ key: `${season}:2:${H}:${A}`, season, savedAt: now, entry: past }], multiSavePath);
    const cpu = lg.teams.findIndex((t, i) => i !== H && i !== A);
    const liveEntry = LiveMatch.computeLiveMatchForTeams(Engine, lg.teams[A], lg.teams[cpu], 3, A, cpu, now - 15 * 60e3, "championship");
    lg.liveMatches = { ...(lg.liveMatches || {}), [`3:${A}:${cpu}`]: liveEntry };
    lg.teams[H].isPaying = false; lg.teams[H].premiumUntil = 0;
    await store.saveMultiLeague(lg, multiSavePath);

    // ---------- création ----------
    let r = await request(server, "POST", "/api/match/share-link", { kind: "official", round: 2, competition: "championship", home: H, away: A });
    check(r.status === 401, "sans jeton : refusé (401)");
    r = await request(server, "POST", "/api/match/share-link", { kind: "official", round: 2, competition: "championship", home: H, away: A }, M.Lyon.h);
    check(r.status === 403 && r.body.code === "premium-required", "rediffusion sans Premium : refusée (même règle que « Revoir le direct »)");
    r = await request(server, "POST", "/api/match/share-link", { kind: "official", lp: "abc", round: 0, home: 0, away: 1 }, M.Lyon.h);
    check(r.status === 403, "ligue privée : pas de lien public");
    r = await request(server, "POST", "/api/match/share-link", { kind: "official", round: 3, competition: "championship", home: A, away: cpu }, M.Lyon.h);
    check(r.status === 200 && /^\/?.*\/m\/[A-Za-z0-9_-]{8}$/.test(r.body.url), `match en direct : lien créé sans Premium (${r.body.url})`);
    const liveCode = r.body.code;
    const r2 = await request(server, "POST", "/api/match/share-link", { kind: "official", round: 3, competition: "championship", home: A, away: cpu }, M.Paris.h);
    check(r2.status === 200 && r2.body.code === liveCode, "même match : même lien, quel que soit le manager (lien stable)");

    world = await World.loadWorld(multiSavePath, now);
    lg = await World.loadLeague(world, store.HISTORIC_LEAGUE_ID, multiSavePath);
    lg.teams[H].premiumUntil = now + 30 * 86400e3;
    await store.saveMultiLeague(lg, multiSavePath);
    r = await request(server, "POST", "/api/match/share-link", { kind: "official", round: 2, competition: "championship", home: H, away: A }, M.Lyon.h);
    check(r.status === 200 && r.body.code, "rediffusion avec Premium : lien créé");
    const repCode = r.body.code;

    // ---------- page publique (rediffusion) ----------
    const page = await request(server, "GET", `/m/${repCode}`);
    check(page.status === 200 && /text\/html/.test(page.headers["content-type"]), "page publique servie sans connexion");
    const lyonName = lg.teams[H].name, parisName = lg.teams[A].name;
    check(page.raw.includes(lyonName) && page.raw.includes(parisName) && page.raw.includes("Championnat") && page.raw.includes("Journée 3"),
      "contexte du match : équipes, compétition, journée");
    check(page.raw.includes(`${past.finalScore.home} – ${past.finalScore.away}`) && /id="mlScore" hidden/.test(page.raw) && page.raw.includes("Voir le score final") && !/<title>[^<]*\d+ – \d+/.test(page.raw), `score final présent mais masqué derrière « Voir le score final », absent du titre (${past.finalScore.home} – ${past.finalScore.away})`);
    check(page.raw.includes('name="robots" content="noindex"') && page.headers["x-robots-tag"] === "noindex", "noindex");
    check(!Object.values(M).some(m => page.raw.includes(m.h["X-TipIn-Token"])) && !/managerLinkToken|X-TipIn-Token/.test(page.raw), "aucun jeton dans la page");
    check(/import \{ createLiveView \} from "\/assets\/live\/live-view\.js\?v=/.test(page.raw) && page.raw.includes("live.css"), "terrain 2D du jeu (mêmes modules)");

    const en = await request(server, "GET", `/m/${repCode}?lang=en`);
    check(en.status === 200 && en.raw.includes("Show the final score") && en.raw.includes("Watch from the start"), "page traduite (anglais)");

    // ---------- données publiques ----------
    const data = await request(server, "GET", `/m/${repCode}/data`);
    check(data.status === 200 && data.body.ok && data.body.status === "replay", "données : rediffusion");
    const d = data.body;
    check(d.live.events.length === past.events.length && d.live.finalScore, "rediffusion : tout le match et le score final");
    const json = data.raw;
    check(!/"attrs"|"potential"|"hiddenPotential"|tacticsUsed|managerLinkToken|"salary"/.test(json), "ni caractéristiques, ni potentiel, ni tactiques, ni salaire, ni jeton");
    check(d.live.boxScoreA.every(row => Object.keys(row).every(k => ["id", "name", "position", "startPos", "starter"].includes(k))), "feuille réduite aux cinq de départ (pas de stats finales)");
    check(d.teams.A.name === lyonName && d.teams.A.players.length > 0 && d.teams.A.players.every(p => Object.keys(p).every(k => ["id", "name", "pos", "number"].includes(k))), "équipes : noms, postes, numéros seulement");

    // ---------- direct : pas de divulgation ----------
    const ld = await request(server, "GET", `/m/${liveCode}/data`);
    check(ld.status === 200 && ld.body.status === "live", "direct en cours : statut « live »");
    check(!ld.body.live.finalScore, "direct : pas de score final");
    check(ld.body.live.events.length > 0 && ld.body.live.events.every(e => e.airAt <= now + 5000) && ld.body.live.events.length < liveEntry.events.length,
      `direct : seulement les actions déjà diffusées (${ld.body.live.events.length}/${liveEntry.events.length})`);
    const lp = await request(server, "GET", `/m/${liveCode}`);
    check(lp.status === 200 && lp.raw.includes("EN DIRECT") && !lp.raw.includes(`${liveEntry.finalScore.home} – ${liveEntry.finalScore.away}`), "page du direct : badge EN DIRECT, pas de score final");
    now += 3 * 3600e3;
    const ld2 = await request(server, "GET", `/m/${liveCode}/data`);
    check(ld2.status === 200 && ld2.body.status === "replay" && ld2.body.live.finalScore, "après le match, le même lien devient la rediffusion");
    now -= 3 * 3600e3;

    // ---------- sélections nationales ----------
    {
      const NationalTeams = require("./nationalTeams.js");
      const nat = (await NationalTeams.loadStore(multiSavePath)) || {};
      const id = "nf-share-test";
      nat.intlFriendlies = [...(nat.intlFriendlies || []), { id, status: "played", season: 1, at: now - 5 * 3600e3, liveUntil: now - 3 * 3600e3, home: "fr-A", away: "de-A" }];
      await NationalTeams.saveStore(nat, multiSavePath);
      const plain = t => ({ name: t === H ? "France" : "Allemagne", jerseyColor: lg.teams[t].jerseyColor, players: lg.teams[t].players.map(p => ({ id: p.id, name: p.name, position: p.position, number: p.number, attrs: p.attrs })) });
      const e = LiveMatch.computeLiveMatchForTeams(Engine, lg.teams[H], lg.teams[A], 0, 0, 1, now - 5 * 3600e3, "friendly");
      e.intl = { label: "Match amical" };
      await store.saveNationalLives([{ id, entry: e, teams: { home: plain(H), away: plain(A) } }], multiSavePath);
      const nr = await request(server, "POST", "/api/match/share-link", { kind: "national", id }, M.Paris.h);
      check(nr.status === 200 && nr.body.code, "sélections : lien créé par n'importe quel manager (directs ouverts à tous)");
      const np = await request(server, "GET", `/m/${nr.body.code}`);
      check(np.status === 200 && np.raw.includes("France") && np.raw.includes("Allemagne") && np.raw.includes("Sélections nationales"), "sélections : page publique avec le contexte");
      const nd = await request(server, "GET", `/m/${nr.body.code}/data`);
      check(nd.status === 200 && nd.body.status === "replay" && !/"attrs"/.test(nd.raw), "sélections : rediffusion, sans caractéristiques");
      check((await request(server, "POST", "/api/match/share-link", { kind: "national", id: "inconnu" }, M.Paris.h)).status === 404, "sélections : match inconnu → 404");
    }

    // ---------- lien inconnu, purgé, lecture seule ----------
    const nf = await request(server, "GET", "/m/ZZZZZZZZ");
    check(nf.status === 404 && /plus disponible/.test(nf.raw), "lien inconnu : page « plus disponible » (404)");
    check((await request(server, "GET", "/m/ZZZZZZZZ/data")).status === 404, "données d'un lien inconnu : 404");
    check((await request(server, "GET", "/m/%3Cscript%3E")).status === 404, "code mal formé : 404");
    const post = await request(server, "POST", `/m/${repCode}`, { anything: 1 });
    check(post.status !== 200 || !post.body || !post.body.ok, "aucune écriture possible via /m/");
    await store.appendReplays(store.HISTORIC_LEAGUE_ID, [], multiSavePath);
    const rep = await store.loadReplays(store.HISTORIC_LEAGUE_ID, multiSavePath);
    rep.list = rep.list.filter(x => x.key !== `${season}:2:${H}:${A}`);
    const file = multiSavePath.replace(/\.json$/, "");
    // Purge simulée (rediffusion remplacée par des matchs plus récents).
    const replaysFile = fs.readdirSync(dir).find(f => /replays/.test(f) && !/lp/.test(f));
    if (replaysFile) fs.writeFileSync(path.join(dir, replaysFile), JSON.stringify(rep));
    const gone = await request(server, "GET", `/m/${repCode}`);
    check(!replaysFile || gone.status === 404, `rediffusion purgée : page « plus disponible »${replaysFile ? "" : " (stockage non fichier, non vérifié)"}`);
    void file;
  } finally {
    server.close();
  }
  console.log("\n🏁 match_share_test.js : partage des matchs et des rediffusions vérifié.");
}

main().catch(e => { console.error(e); process.exit(1); });
