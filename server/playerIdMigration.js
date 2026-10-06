// Migration des IDs de joueurs vers 10 chiffres (demande utilisateur du
// 2026-10-06 : « chaque joueur doit avoir un ID de 10 caractères ; si un ID
// est déjà pris par un joueur, il ne peut pas être réattribué » ; choix :
// 10 chiffres, TOUS les joueurs existants migrés).
//
// Une seule passe, au démarrage du serveur, sous le verrou de sauvegarde
// (server/index.js:startServer), marquée faite dans le registre du monde
// (`world.playerIdsV2`) :
//  1. Inventaire : chaque joueur actuel (effectifs, centre de formation,
//     candidats, agents libres) de chaque championnat reçoit un nouvel ID
//     (Engine.newPlayerId, registre jamais réattribué). Les anciens IDs
//     n'étaient uniques que dans un championnat (et pas toujours, voir le
//     bug « aux enchères sans raison ») : la table de correspondance est
//     donc (championnat, club, ancien ID, nom) → nouvel ID.
//  2. Réécriture de toutes les références (inventaire du 2026-10-06) :
//     ligues, sélections nationales, liens publics, ligues privées, amicaux
//     du monde, archives de saison, journaux d'histoire, directs à revoir.
//     Une référence ambiguë ou introuvable (joueur parti à la retraite…)
//     garde son ancien ID : jamais d'attribution au hasard.
//  3. Copie de sauvegarde de chaque donnée avant réécriture
//     (store.saveMigrationBackup).
const Engine = require("../engine.js");
const store = require("./store.js");

const isNew = id => Engine.isPlayerIdFormat(id);
const numOf = v => (typeof v === "number" ? v : (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null));

// -------------------------------------------------------------------------
// Table de correspondance
// -------------------------------------------------------------------------
function createIndex() {
  const byOld = new Map();      // ancien ID → [{ lid, idx, name, to }]
  const byTeam = new Map();     // "lid|idx|ancien" → nouvel ID
  const byLeague = new Map();   // "lid|ancien" → nouvel ID (null si ambigu)
  const clubOf = new Map();     // nom de club (minuscules) → { lid, idx }
  function add(lid, idx, name, from, to) {
    const list = byOld.get(from) || [];
    list.push({ lid, idx, name, to });
    byOld.set(from, list);
    if (idx != null) byTeam.set(`${lid}|${idx}|${from}`, { to, name });
    const lk = `${lid}|${from}`;
    byLeague.set(lk, byLeague.has(lk) ? null : to);
  }
  // ctx : { lid?, idx?, name? }. Renvoie le nouvel ID ou null (inchangé).
  function resolve(value, ctx = {}) {
    const id = numOf(value);
    if (id == null || isNew(id)) return null;
    const { lid = null, idx = null } = ctx;
    const name = typeof ctx.name === "string" && ctx.name ? ctx.name : null;
    const own = lid != null && idx != null ? byTeam.get(`${lid}|${idx}|${id}`) : null;
    if (own && (!name || own.name === name)) return own.to;
    const cands = byOld.get(id) || [];
    if (!cands.length) return null;
    if (name) {
      const named = cands.filter(c => c.name === name);
      if (lid != null) {
        const here = named.filter(c => c.lid === lid);
        if (here.length === 1) return here[0].to;
      }
      if (named.length === 1) return named[0].to;
      if (named.length === 0) return null; // même ancien ID, autre joueur : on ne devine pas
    }
    if (lid != null) {
      const v = byLeague.get(`${lid}|${id}`);
      if (v) return v;
    }
    if (!name && lid == null && cands.length === 1) return cands[0].to;
    return null;
  }
  return { add, resolve, byOld, clubOf, size: () => byTeam.size + [...byOld.values()].filter(l => l.some(c => c.idx == null)).length };
}

// -------------------------------------------------------------------------
// Réécriture générique d'un objet JSON
// -------------------------------------------------------------------------
const ID_VALUE_KEYS = new Set(["playerId", "shooterId", "assisterId", "rebounderId", "stealerId", "blockerId", "defenderId", "replacementId",
  "youngId", "veteranId", "transferRequestPlayerId", "playerOutId", "playerInId", "outId", "inId", "fouledId", "mvpId", "scorerId"]);
const ID_ARRAY_KEYS = new Set(["playerIds", "player_ids", "bench", "convoked", "pendingYouthDecisions", "bookmarked", "allStarHG"]);
// Objets indexés par ID de joueur (clé = ID).
const ID_KEYED_MAPS = new Set(["allTimePlayers", "trainingStalls", "backupPositions", "p", "roleMismatchWeek"]);
const FEED_KEY_RE = /^((?:poschange|injury|retiring|contract_signed|contract_left|contract_ext|contract_raise)_)(\d+)$/;

function rewriter(index) {
  let changed = 0;
  const R = (v, ctx) => {
    const to = index.resolve(v, ctx);
    if (to == null) return v;
    changed++;
    return typeof v === "string" ? String(to) : to;
  };
  const nameOf = o => (o && typeof o === "object" ? (typeof o.name === "string" ? o.name : typeof o.n === "string" ? o.n : (o.player && typeof o.player.name === "string" ? o.player.name : (typeof o.player === "string" ? o.player : (typeof o.playerName === "string" ? o.playerName : null)))) : null);
  const remapKeys = (obj, ctx, nameFromValue = true) => {
    const out = {};
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      const nk = R(k, { ...ctx, name: nameFromValue ? nameOf(v) : null });
      out[nk] = v;
    });
    Object.keys(obj).forEach(k => { delete obj[k]; });
    Object.assign(obj, out);
  };
  const pairKey = (a, b) => (String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`);
  function walk(node, ctx, parentKey = null, depth = 0) {
    if (!node || typeof node !== "object" || depth > 60) return;
    if (Array.isArray(node)) {
      if (ID_ARRAY_KEYS.has(parentKey)) {
        for (let i = 0; i < node.length; i++) {
          if (typeof node[i] === "number" || typeof node[i] === "string") node[i] = R(node[i], ctx);
          else walk(node[i], ctx, null, depth + 1);
        }
        return;
      }
      // Ligne d'archive de saison : [id, name, …] (ARCHIVE_ROW_COLS).
      if (parentKey === "rows") {
        node.forEach(row => { if (Array.isArray(row) && typeof row[1] === "string") row[0] = R(row[0], { ...ctx, name: row[1] }); else walk(row, ctx, null, depth + 1); });
        return;
      }
      node.forEach(x => walk(x, ctx, null, depth + 1));
      return;
    }
    const nm = nameOf(node);
    // Fiche joueur / ligne de feuille de match : { id, name }.
    if ((typeof node.id === "number" || typeof node.id === "string") && typeof node.name === "string" && parentKey !== "team") node.id = R(node.id, { ...ctx, name: node.name });
    // Référence de sélection : { p, n }.
    if (typeof node.p === "number" && typeof node.n === "string") node.p = R(node.p, { ...ctx, name: node.n });
    Object.keys(node).forEach(k => {
      const v = node[k];
      if (ID_VALUE_KEYS.has(k) && (typeof v === "number" || typeof v === "string")) { node[k] = R(v, { ...ctx, name: nm }); return; }
      if (k === "starters" && v && typeof v === "object" && !Array.isArray(v)) { Object.keys(v).forEach(pos => { v[pos] = R(v[pos], ctx); }); return; }
      if (k === "minutes" && v && typeof v === "object") {
        Object.keys(v).forEach(pos => { if (v[pos] && typeof v[pos] === "object") remapKeys(v[pos], ctx, false); });
        remapKeys(v, ctx, false);
        return;
      }
      if (k === "lastStartersKey" && typeof v === "string") {
        node[k] = v.split("|").map(x => String(R(x, ctx))).sort().join("|");
        return;
      }
      if (k === "relations" && v && typeof v === "object" && !Array.isArray(v)) {
        const out = {};
        Object.keys(v).forEach(pk => { const [a, b] = pk.split("|"); out[b == null ? pk : pairKey(R(a, ctx), R(b, ctx))] = v[pk]; walk(v[pk], ctx, null, depth + 1); });
        node[k] = out;
        return;
      }
      if (k === "ment" && Array.isArray(v)) { node[k] = v.map(s => (typeof s === "string" && s.includes("|") ? s.split("|").map(x => R(x, ctx)).join("|") : s)); return; }
      if (k === "key" && typeof v === "string" && FEED_KEY_RE.test(v)) { node[k] = v.replace(FEED_KEY_RE, (m, pre, id) => pre + R(id, ctx)); return; }
      if ((k === "href" || k === "url") && typeof v === "string") { node[k] = v.replace(/\/joueur\/(\d+)/, (m, id) => `/joueur/${R(id, ctx)}`); return; }
      if (ID_KEYED_MAPS.has(k) && v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(x => /^\d+$/.test(x))) {
        remapKeys(v, ctx);
        Object.keys(v).forEach(x => walk(v[x], ctx, null, depth + 1));
        return;
      }
      // Rapports d'entraînement : players indexé par ID.
      if (k === "players" && v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length && Object.keys(v).every(x => /^\d+$/.test(x))) {
        remapKeys(v, ctx);
        Object.keys(v).forEach(x => walk(v[x], ctx, null, depth + 1));
        return;
      }
      walk(v, ctx, k, depth + 1);
    });
  }
  return { walk, R, changed: () => changed };
}

// Ligue (JSON de sauvegarde) : contexte club pour chaque équipe.
function rewriteLeagueJson(data, lid, index) {
  const w = rewriter(index);
  const lg = data.league;
  (lg.teams || []).forEach((t, idx) => w.walk(t, { lid, idx }, "teamroot"));
  Object.keys(lg).forEach(k => {
    if (k === "teams") return;
    if (k === "freeAgents") { w.walk(lg[k], { lid }, k); return; }
    if (k === "transferListings") {
      (lg[k] || []).forEach(l => {
        if (!l) return;
        const ctx = l.freeAgent ? { lid } : { lid, idx: l.sellerIdx };
        l.playerId = w.R(l.playerId, ctx);
      });
      return;
    }
    if (k === "playoffs" && lg[k] && lg[k].semiPlayerIds && typeof lg[k].semiPlayerIds === "object") {
      Object.keys(lg[k].semiPlayerIds).forEach(ti => { const arr = lg[k].semiPlayerIds[ti]; if (Array.isArray(arr)) lg[k].semiPlayerIds[ti] = arr.map(x => w.R(x, { lid, idx: Number(ti) })); });
    }
    if (k === "friendlies" && Array.isArray(lg[k])) {
      lg[k].forEach(f => {
        if (!f) return;
        ["lineups", "orders"].forEach(part => { if (f[part] && typeof f[part] === "object") Object.keys(f[part]).forEach(ti => w.walk(f[part][ti], { lid, idx: Number(ti) }, null)); });
        w.walk(f.result, { lid }, "result");
      });
      return;
    }
    w.walk(lg[k], { lid }, k);
  });
  return w.changed();
}

// -------------------------------------------------------------------------
// Passe complète
// -------------------------------------------------------------------------
async function runIfNeeded(savePath, { now = Date.now(), log = console.log } = {}) {
  const World = require("./world.js");
  const world = await World.loadWorld(savePath, now);
  if (!world) return { skipped: "monde indisponible" };
  if (world.playerIdsV2) return { skipped: "déjà fait" };
  const index = createIndex();
  const leagues = [];
  // 1) Inventaire et nouveaux IDs.
  for (const entry of world.leagues || []) {
    const loaded = await store.loadMultiLeague(savePath, entry.id);
    if (!loaded) continue;
    const lid = entry.id;
    const data = JSON.parse(JSON.stringify(store.serializeMultiLeague(loaded.league)));
    const backup = JSON.stringify(data);
    const give = (p, idx) => {
      if (!p || isNew(p.id) || p.id == null) return;
      const to = Engine.newPlayerId();
      index.add(lid, idx, p.name, p.id, to);
      p.id = to;
    };
    (data.league.teams || []).forEach((t, idx) => {
      const club = String(t.name || "").trim().toLowerCase();
      if (club) index.clubOf.set(club, { lid, idx });
      ["players", "youthPlayers", "youthCandidates"].forEach(k => (t[k] || []).forEach(p => give(p, idx)));
    });
    (data.league.freeAgents || []).forEach(p => give(p, null));
    leagues.push({ lid, data, backup });
  }
  if (!index.byOld.size) {
    // Aucun ancien ID (monde créé après la migration) : rien à réécrire.
    world.playerIdsV2 = { at: now, players: 0, refs: 0 };
    await World.saveWorld(world, savePath);
    return world.playerIdsV2;
  }
  // 2) Ligues.
  let refs = 0;
  for (const { lid, data, backup } of leagues) {
    await store.saveMigrationBackup(`league-${lid}`, JSON.parse(backup), savePath);
    refs += rewriteLeagueJson(data, lid, index);
    const { league } = store.deserializeMultiLeague(data);
    if (!league.leagueId) league.leagueId = lid;
    await store.saveMultiLeague(league, savePath);
  }
  // 3) Stockages à part.
  const ext = await rewriteSeparateStores(world, index, savePath);
  await store.flushPlayerIdRegistry(savePath);
  world.playerIdsV2 = { at: now, players: [...index.byOld.values()].reduce((a, l) => a + l.length, 0), refs: refs + ext };
  await World.saveWorld(world, savePath);
  log(`[ids joueurs] migration faite : ${world.playerIdsV2.players} joueur(s), ${world.playerIdsV2.refs} référence(s) réécrite(s).`);
  return world.playerIdsV2;
}

async function rewriteSeparateStores(world, index, savePath) {
  let n = 0;
  const safe = async (label, fn) => { try { n += (await fn()) || 0; } catch (e) { console.warn(`[ids joueurs] ${label} : ${e.message}`); } };
  // Sélections nationales : références { p, n } et clés « id|nom ».
  await safe("sélections", async () => {
    const NT = require("./nationalTeams.js");
    const data = await NT.loadStore(savePath);
    if (!data) return 0;
    await store.saveMigrationBackup("nationalteams", data, savePath);
    const w = rewriter(index);
    const pairs = new Map();
    (function collect(node, depth = 0) {
      if (!node || typeof node !== "object" || depth > 60) return;
      if (Array.isArray(node)) { node.forEach(x => collect(x, depth + 1)); return; }
      if (typeof node.p === "number" && typeof node.n === "string") {
        const to = index.resolve(node.p, { name: node.n });
        if (to != null) pairs.set(`${node.p}|${node.n}`, `${to}|${node.n}`);
      }
      Object.keys(node).forEach(k => collect(node[k], depth + 1));
    })(data);
    w.walk(data, {}, null);
    // Clés et textes « id|nom » (nids, caps, alertState, clés du fil).
    const swap = s => { let out = s; pairs.forEach((to, from) => { if (out.includes(from)) out = out.split(from).join(to); }); return out; };
    (function deep(node, depth = 0) {
      if (!node || typeof node !== "object" || depth > 60) return;
      if (Array.isArray(node)) { node.forEach((x, i) => { if (typeof x === "string") node[i] = swap(x); else deep(x, depth + 1); }); return; }
      Object.keys(node).forEach(k => {
        const v = node[k];
        const nk = swap(k);
        if (nk !== k) { node[nk] = v; delete node[k]; }
        if (typeof v === "string") node[nk] = swap(v); else deep(v, depth + 1);
      });
    })(data);
    await NT.saveStore(data, savePath);
    return w.changed() + pairs.size;
  });
  // Liens publics /j/<code>.
  await safe("liens publics", async () => {
    const data = await store.loadPlayerLinks(savePath);
    if (!data || !data.codes) return 0;
    await store.saveMigrationBackup("playerlinks", data, savePath);
    let c = 0;
    Object.values(data.codes).forEach(e => {
      if (!e) return;
      const to = index.resolve(e.playerId, { lid: e.leagueId, idx: e.teamIdx, name: e.name });
      if (to != null) { e.playerId = to; c++; }
    });
    await store.savePlayerLinks(data, savePath);
    return c;
  });
  // Ligues privées, amicaux du monde : contexte championnat/club des membres.
  for (const name of ["privateleagues", "friendlies"]) {
    await safe(name, async () => {
      const data = await store.loadWorldAuxStrict(name, savePath);
      if (!data || data === store.WORLD_READ_FAILED) return 0;
      await store.saveMigrationBackup(name, data, savePath);
      const w = rewriter(index);
      w.walk(data, {}, null);
      await store.saveWorldAuxRaw(name, data, savePath, { strict: true });
      return w.changed();
    });
  }
  // Index du marché mondial et viviers des sélections : recalculés.
  // Archives de saison.
  const archives = world.seasonArchives || {};
  for (const country of Object.keys(archives)) {
    for (const season of Object.keys(archives[country] || {})) {
      for (const lid of Object.keys(archives[country][season] || {})) {
        await safe(`archive ${lid}/${season}`, async () => {
          const data = await store.loadSeasonArchive(lid, Number(season), savePath);
          if (!data) return 0;
          await store.saveMigrationBackup(`archive-${lid}-${season}`, data, savePath);
          const w = rewriter(index);
          w.walk(data, { lid }, null);
          await store.saveSeasonArchive(lid, Number(season), data, savePath);
          return w.changed();
        });
      }
    }
  }
  // Journaux d'histoire (un par club).
  for (const [club, at] of index.clubOf) {
    await safe(`histoire ${club}`, async () => {
      const events = await store.loadClubHistory(club, savePath);
      if (!events || !events.length) return 0;
      const w = rewriter(index);
      events.forEach(ev => {
        if (!Array.isArray(ev.player_ids)) return;
        ev.player_ids = ev.player_ids.map(id => w.R(id, { lid: at.lid, idx: at.idx }));
      });
      if (!w.changed()) return 0;
      await store.replaceClubHistory(club, events, savePath);
      return w.changed();
    });
  }
  // Directs à revoir (ligues et ligues privées).
  for (const entry of world.leagues || []) {
    for (const kind of ["", "lp"]) {
      await safe(`directs ${entry.id}${kind}`, async () => {
        const data = await store.loadReplays(entry.id, savePath, kind);
        if (!data || !Array.isArray(data.list) || !data.list.length) return 0;
        const w = rewriter(index);
        w.walk(data.list, { lid: entry.id }, null);
        if (!w.changed()) return 0;
        await store.appendReplays(entry.id, data.list, savePath, kind);
        return w.changed();
      });
    }
  }
  // Table de correspondance gardée pour les vieux liens (/joueur/<ancien>).
  await safe("table", async () => {
    const rows = [];
    index.byOld.forEach((list, from) => list.forEach(c => rows.push([c.lid, c.idx, from, c.to, c.name])));
    await store.saveWorldAuxRaw("playeridmap", { version: 1, rows }, savePath);
    return 0;
  });
  return n;
}

module.exports = { runIfNeeded, createIndex, rewriter, rewriteLeagueJson };
