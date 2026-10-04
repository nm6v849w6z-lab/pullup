// =====================================================================
// SIGNETS (retour utilisateur 2026-10-04) — joueurs mis de côté par un
// manager, n'importe lesquels : son effectif, un adversaire, un agent libre,
// un joueur d'un autre championnat. Stockés sur le club du manager
// (Team.bookmarks : [{ playerId, leagueId, since }], données privées, voir
// server/publicPlayers.js PRIVATE_TEAM_FIELDS) et identifiés par l'id
// unique du joueur, jamais par son nom.
//
// Le joueur peut changer de club ou de championnat : `leagueId` n'est que
// le dernier endroit connu. À la lecture (GET /api/bookmarks), on le
// cherche d'abord là, puis dans le championnat du manager, puis — s'il
// reste introuvable — dans tout le monde de jeu ; la position trouvée est
// enregistrée. Un signet n'est supprimé automatiquement que si le joueur
// n'existe plus nulle part (retraite) ET que tous les championnats ont pu
// être lus (un échec de lecture ne supprime jamais rien).
// =====================================================================
const { HIDDEN_PLAYER_FIELDS } = require("./publicPlayers.js");

function normId(v) {
  return typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : v;
}

// Où est ce joueur dans ce championnat ? { teamIdx, status, player } ;
// status : "club" (effectif), "youth" (académie), "fa" (agent libre).
function locatePlayer(league, playerId) {
  if (!league) return null;
  const id = normId(playerId);
  const teams = league.teams || [];
  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    if (!t) continue;
    const p = (t.players || []).find(x => x && x.id === id);
    if (p) return { teamIdx: i, status: "club", player: p };
    const y = (t.youthPlayers || []).find(x => x && x.id === id);
    if (y) return { teamIdx: i, status: "youth", player: y };
  }
  const fa = (league.freeAgents || []).find(x => x && x.id === id);
  if (fa) return { teamIdx: null, status: "fa", player: fa };
  return null;
}

// Joueur d'un autre championnat : fiche publique (comme un adversaire non
// scouté — aucune caractéristique, ni potentiel ni données privées).
function publicPlayerRecord(Engine, p) {
  const rec = JSON.parse(JSON.stringify(Engine.serializePlayerRecord(p)));
  HIDDEN_PLAYER_FIELDS.forEach(k => { delete rec[k]; });
  delete rec.aggressiveness;
  delete rec.matchLog; delete rec.archivedMatchLog; delete rec.weeklyHistory; delete rec.history;
  rec.attrs = {};
  rec.attrsHidden = true;
  return rec;
}

// Liste résolue des signets de ctx.league.teams[ctx.teamIndex].
// `opts` : { Engine, world, loadLeague(id) → league|null (peut lever),
// labelOf(entry) }. Renvoie { items, changed, removed }.
async function resolveBookmarks(ctx, opts) {
  const { Engine, world } = opts;
  const team = ctx.league.teams[ctx.teamIndex];
  const list = Array.isArray(team.bookmarks) ? team.bookmarks : [];
  const ownId = ctx.leagueId || null;
  const cache = new Map();
  if (ownId) cache.set(ownId, ctx.league);
  const entries = world ? (world.leagues || []) : [];
  let loadFailed = false;
  const load = async id => {
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    let lg = null;
    try { lg = await opts.loadLeague(id); } catch (e) { lg = null; }
    if (!lg) loadFailed = true;
    cache.set(id, lg);
    return lg;
  };
  const items = [];
  const removed = [];
  let changed = false;
  for (const bm of list.slice()) {
    let hit = null, hitId = null;
    const tried = new Set();
    const tryIn = async id => {
      if (hit || tried.has(id)) return;
      tried.add(id);
      const lg = id === ownId || (!id && !ownId) ? ctx.league : await load(id);
      const r = locatePlayer(lg, bm.playerId);
      if (r) { hit = r; hitId = id; }
    };
    await tryIn(bm.leagueId || ownId);
    await tryIn(ownId);
    if (!hit && world) for (const e of entries) { await tryIn(e.id); if (hit) break; }
    if (!hit) {
      // Introuvable partout (et tout a pu être lu) : joueur retiré du jeu.
      if (!loadFailed && (world || !bm.leagueId || bm.leagueId === ownId)) {
        team.bookmarks = team.bookmarks.filter(b => String(b.playerId) !== String(bm.playerId));
        removed.push(bm.playerId);
        changed = true;
      } else {
        items.push({ playerId: bm.playerId, leagueId: bm.leagueId, missing: true });
      }
      continue;
    }
    if ((bm.leagueId || null) !== (hitId || null)) { bm.leagueId = hitId || null; changed = true; }
    const mine = !hitId || hitId === ownId;
    const item = { playerId: hit.player.id, leagueId: hitId || null, mine, teamIdx: hit.teamIdx, status: hit.status, since: bm.since || 0 };
    if (!mine) {
      const lg = cache.get(hitId);
      const entry = entries.find(e => e.id === hitId);
      const t = hit.teamIdx != null ? lg.teams[hit.teamIdx] : null;
      item.teamName = t ? t.name : null;
      item.label = entry && opts.labelOf ? opts.labelOf(entry) : null;
      item.country = (entry && entry.country) || lg.country || null;
      item.player = publicPlayerRecord(Engine, hit.player);
    }
    items.push(item);
  }
  return { items, changed, removed };
}

// Ajout / retrait. body { playerId, on, leagueId? } — à l'ajout, le joueur
// doit exister (dans `leagueId` s'il est donné, sinon dans le championnat
// du manager). Aucune autre restriction (club, niveau, marché…).
async function toggleBookmark(ctx, body, opts, now = Date.now()) {
  if (!body || body.playerId == null || typeof body.on !== "boolean") return { ok: false, status: 400, error: "playerId et on (booléen) requis." };
  const team = ctx.league.teams[ctx.teamIndex];
  const playerId = normId(body.playerId);
  if (!body.on) {
    const r = team.setBookmark(playerId, false, null, now);
    return { ok: true, bookmarked: r.bookmarked, bookmarks: team.bookmarks };
  }
  const ownId = ctx.leagueId || null;
  const wanted = typeof body.leagueId === "string" && body.leagueId ? body.leagueId : ownId;
  let found = null, foundId = null;
  if (!wanted || wanted === ownId) { found = locatePlayer(ctx.league, playerId); foundId = ownId; }
  else if (opts.world && (opts.world.leagues || []).some(e => e.id === wanted)) {
    let lg = null;
    try { lg = await opts.loadLeague(wanted); } catch (e) { lg = null; }
    found = locatePlayer(lg, playerId); foundId = wanted;
  }
  if (!found) return { ok: false, status: 404, error: "Joueur introuvable." };
  const r = team.setBookmark(playerId, true, foundId, now);
  if (!r.ok) return { ok: false, status: 400, error: r.error };
  return { ok: true, bookmarked: r.bookmarked, bookmarks: team.bookmarks };
}

module.exports = { locatePlayer, resolveBookmarks, toggleBookmark, publicPlayerRecord };
