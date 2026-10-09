"use strict";

// =====================================================================
// PARTAGE D'UN MATCH / D'UNE REDIFFUSION (P3, 2026-10-09) : depuis le jeu,
// un manager crée un lien court et public `/m/<code>` vers un match de SON
// championnat (en direct ou déjà joué) ou vers un match de sélections
// nationales. Le destinataire, connecté ou non, ouvre une page dédiée
// (server/matchPage.js) qui montre le match sur le terrain 2D, en lecture
// seule, sans rien chercher dans le jeu.
//
// Droits (mêmes règles que dans le jeu, voir /api/spectate, /api/replay,
// /api/national/live) :
//  - match officiel (championnat, coupe, play-offs, barrage, coupe
//    nationale, supercoupe) : seulement un match du championnat du manager ;
//    en direct, pour tout manager de la ligue ; une rediffusion (match
//    terminé) exige le Premium, comme « Revoir le direct » ;
//  - sélections nationales : tout manager (ces directs sont ouverts à tous
//    dans le jeu) ;
//  - ligues privées : PAS de lien public (matchs réservés aux membres).
// La page ne montre que ce qu'un spectateur voit déjà : noms, numéros,
// événements du match. Jamais de caractéristiques, de tactiques, de jeton
// ni d'action : aucune donnée n'est modifiable via le lien. Pendant un
// direct, ni le score final ni les actions à venir ne sont envoyés.
//
// - Code : 8 caractères URL-safe (48 bits), comme les liens de joueur.
// - Un seul code par match (le même lien pour tous ceux qui le partagent).
// - Stockage : store.loadMatchLinks/saveMatchLinks
//   { codes: { code: { kind, leagueId, liveKey, season, natId, kickoffAt,
//     createdAt, by: { leagueId, teamIdx } } } }.
// - Match purgé des rediffusions (REPLAYS_MAX par championnat, emplacements
//   des sélections recyclés) : page « Ce match n'est plus disponible ».
// =====================================================================

const store = require("./store.js");
const LiveMatch = require("./liveMatch.js");
const Engine = require("../engine.js");
const { newCode, CODE_RE } = require("./playerLinks.js");

const LIVE_LOOKAHEAD_MS = 5000;   // direct : on n'envoie que ce qui est (presque) diffusé

async function loadAll(savePath) {
  const data = await store.loadMatchLinks(savePath);
  if (!data || typeof data !== "object" || !data.codes || typeof data.codes !== "object") return { codes: {} };
  return data;
}

const sameTarget = (a, b) => a && b && a.kind === b.kind && (a.kind === "national"
  ? a.natId === b.natId
  : a.leagueId === b.leagueId && a.liveKey === b.liveKey && a.season === b.season);

// Recherche du match officiel visé dans la ligue du manager : direct en
// cours (league.liveMatches), sinon rediffusion archivée (même recherche
// que /api/replay : `key` de diffusion, sinon journée + compétition + clubs).
function matchesFields(entry, q) {
  const comp = q.competition === "cup" ? "cup" : "championship";
  return entry && entry.round === Number(q.round) && (entry.competition || "championship") === comp
    && entry.homeIdx === Number(q.home) && entry.awayIdx === Number(q.away);
}
const keyMatches = (k, key) => typeof key === "string" && key && (k === key || k.endsWith(":" + key));

async function findOfficial(league, leagueId, q, savePath) {
  const season = league.seasonNumber || 1;
  const lives = Object.entries(league.liveMatches || {});
  const live = lives.find(([k, e]) => e && !e.forfeit && (keyMatches(k, q.key) || (!q.key && matchesFields(e, q))))
    || lives.find(([, e]) => e && !e.forfeit && matchesFields(e, q));
  if (live) return { liveKey: live[0], season, entry: live[1], archived: false };
  const data = await store.loadReplays(leagueId, savePath);
  const list = ((data && data.list) || []).slice().reverse();
  const item = (q.key && list.find(x => keyMatches(x.key, q.key))) || list.find(x => matchesFields(x.entry, q)) || null;
  if (!item) return null;
  const s = String(item.season || item.key.split(":")[0]);
  return { liveKey: item.key.slice(s.length + 1), season: Number(s) || item.season, entry: item.entry, archived: true };
}

// Crée (ou retrouve) le lien d'un match. `body` : { kind: "official",
// round, competition, home, away, key } ou { kind: "national", id }.
// `deps.natStore` : registre des sélections (match national).
async function createLink(savePath, ctx, body = {}, now = Date.now(), deps = {}) {
  const team = ctx.league && ctx.league.teams ? ctx.league.teams[ctx.teamIndex] : null;
  if (!team || !team.isHuman) return { ok: false, status: 403, error: "Réservé aux managers." };
  let target;
  if (body.kind === "national") {
    const NationalMatches = require("./nationalMatches.js");
    const hit = deps.natStore ? NationalMatches.findMatch(deps.natStore, String(body.id || "")) : null;
    if (!hit || hit.m.status !== "played" || typeof hit.m.liveUntil !== "number") return { ok: false, status: 404, error: "Ce match n'a pas de direct." };
    target = { kind: "national", natId: hit.m.id, kickoffAt: hit.m.at || null };
  } else if (body.kind === "official" || body.kind == null) {
    if (body.lp != null) return { ok: false, status: 403, error: "Les matchs de ligue privée ne se partagent pas : ils sont réservés aux membres." };
    const found = await findOfficial(ctx.league, ctx.leagueId || null, body, savePath);
    if (!found) return { ok: false, status: 404, error: "Ce match n'est plus disponible." };
    const ended = found.archived || now >= (found.entry.kickoffAt || 0) + (found.entry.totalDurationMs || 0);
    if (ended) {
      const premium = typeof team.hasActivePremium === "function" ? team.hasActivePremium(now) : !!team.isPaying;
      if (!premium) return { ok: false, status: 403, code: "premium-required", error: "Partager une rediffusion est réservé au Premium, comme « Revoir le direct »." };
    }
    target = { kind: "official", leagueId: ctx.leagueId || null, liveKey: found.liveKey, season: found.season, kickoffAt: found.entry.kickoffAt || null };
  } else return { ok: false, status: 400, error: "Type de match inconnu." };
  const data = await loadAll(savePath);
  let code = Object.keys(data.codes).find(c => sameTarget(data.codes[c], target));
  if (!code) {
    code = newCode(data.codes);
    data.codes[code] = { ...target, createdAt: now, by: { leagueId: ctx.leagueId || null, teamIdx: ctx.teamIndex } };
    await store.saveMatchLinks(data, savePath);
  }
  return { ok: true, code, kind: target.kind };
}

// ---------- vue publique (lecture seule) ----------
const POS_SHORT = { "Meneur": "M", "Arrière": "A", "Ailier shooteur": "AS", "Ailier fort": "AF", "Pivot": "P" };
function trigram(name) {
  const words = String(name || "").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const s = words.length >= 3 ? words.slice(0, 3).map(w => w[0]).join("") : words.length === 2 ? words[0].slice(0, 2) + words[1][0] : (words[0] || "?").slice(0, 3);
  return s.toUpperCase();
}
function teamDisplay(team, color) {
  if (!team) return { name: "?", short: "?", color, players: [] };
  const players = (team.players || []).map(p => ({ id: p.id, name: p.name, pos: POS_SHORT[p.matchPosition || p.position] || "", number: Number.isInteger(p.number) ? p.number : null }));
  return { name: team.name || "?", short: team.shortName || trigram(team.name), color, players };
}
// Tenues du match : même choix que le jeu (assets/live/kits.js, ΔE 2000).
function colorsFor(home, away) {
  const hex = k => (k && typeof Engine.jerseyHex === "function" ? Engine.jerseyHex(k) : null);
  const kitOf = t => ({ primary: hex(t && t.jerseyColor), secondary: hex(t && t.awayJerseyColor) });
  const k = require("../assets/live/kits.js").pickMatchKits(kitOf(home), kitOf(away));
  const h = k.colors[0], a = k.colors[1];
  return [h || "#e08a2e", a && a !== h ? a : "#3b8fe0"];
}

// Données du direct vues du club à domicile, sans rien de privé : pas de
// tactiques, feuille de départ réduite aux cinq de départ (le score final
// n'en fait pas partie), et pendant le direct seulement les événements déjà
// diffusés (pas de score final).
function publicLive(entry, key, now) {
  const view = LiveMatch.viewLiveMatchForTeam({ liveMatches: { [key]: entry } }, entry.homeIdx);
  if (!view) return null;
  const end = (view.kickoffAt || 0) + (view.totalDurationMs || 0);
  const live = now < end;
  delete view.tacticsUsed;
  const slim = rows => (Array.isArray(rows) ? rows.map(r => ({ id: r.id, name: r.name, position: r.position, startPos: r.startPos, starter: !!r.starter })) : []);
  view.boxScoreA = slim(view.boxScoreA);
  view.boxScoreB = slim(view.boxScoreB);
  if (live) {
    view.events = (view.events || []).filter(ev => typeof ev.airAt === "number" && ev.airAt <= now + LIVE_LOOKAHEAD_MS);
    view.pauses = (view.pauses || []).filter(p => typeof p.airAt === "number" && p.airAt <= now + LIVE_LOOKAHEAD_MS);
    delete view.finalScore;
  }
  return { view, status: live ? (now < (view.kickoffAt || 0) ? "upcoming" : "live") : "replay" };
}

const competitionLabel = e => (e.nationalCup ? "Coupe nationale" : e.barrage ? "Barrage" : e.competition === "cup" ? "Coupe"
  : e.playoff || e.playoffs ? "Play-offs" : e.competition === "friendly" ? "Match amical" : "Championnat");

// Résout un code : { link, status, live, teams, meta } ou null (code inconnu
// ou match plus disponible). `deps` : { loadLeague(leagueId), loadNatStore() }.
async function resolveLink(savePath, code, deps = {}, now = Date.now()) {
  if (typeof code !== "string" || !CODE_RE.test(code)) return null;
  const data = await loadAll(savePath);
  const link = data.codes[code];
  if (!link) return null;
  if (link.kind === "national") {
    const saved = await store.loadNationalLive(link.natId, savePath);
    if (!saved || !saved.entry || !saved.teams) return null;
    const entry = saved.entry;
    if (link.kickoffAt && entry.kickoffAt && Math.abs(entry.kickoffAt - link.kickoffAt) > 6 * 3600e3) return null;   // emplacement recyclé
    const pub = publicLive(entry, link.natId, now);
    if (!pub) return null;
    const [ch, ca] = colorsFor(saved.teams.home, saved.teams.away);
    let competition = "Sélections nationales";
    if (entry.intl && entry.intl.label) competition += " · " + entry.intl.label;
    return { link, status: pub.status, live: { ...pub.view, intl: entry.intl || null },
      teams: { A: teamDisplay(saved.teams.home, ch), B: teamDisplay(saved.teams.away, ca) },
      meta: { competition, round: "", kickoffAt: entry.kickoffAt || null, home: (saved.teams.home || {}).name || "", away: (saved.teams.away || {}).name || "" } };
  }
  const league = deps.loadLeague ? await deps.loadLeague(link.leagueId) : null;
  if (!league) return null;
  let entry = null;
  const cur = league.liveMatches && league.liveMatches[link.liveKey];
  if (cur && (league.seasonNumber || 1) === link.season && (!link.kickoffAt || cur.kickoffAt === link.kickoffAt)) entry = cur;
  if (!entry) {
    const rep = await store.loadReplays(link.leagueId, savePath);
    const item = ((rep && rep.list) || []).find(x => x.key === `${link.season}:${link.liveKey}`);
    if (item && (!link.kickoffAt || item.entry.kickoffAt === link.kickoffAt)) entry = item.entry;
  }
  if (!entry || entry.forfeit) return null;
  const pub = publicLive(entry, link.liveKey, now);
  if (!pub) return null;
  const guest = entry.guest && entry.guest.team ? entry.guest.team : null;
  // Club invité (coupe nationale, supercoupe) : hors de league.teams.
  const home = league.teams[entry.homeIdx] || guest;
  const away = league.teams[entry.awayIdx] || guest;
  const [ch, ca] = colorsFor(home, away);
  const round = entry.competition === "cup" || entry.nationalCup || entry.barrage ? "" : (Number.isInteger(entry.round) ? `Journée ${entry.round + 1}` : "");
  return { link, status: pub.status, live: pub.view,
    teams: { A: teamDisplay(home, ch), B: teamDisplay(away, ca) },
    meta: { competition: competitionLabel(entry), round, season: link.season, kickoffAt: entry.kickoffAt || null, home: (home || {}).name || "", away: (away || {}).name || "" } };
}

module.exports = { createLink, resolveLink, publicLive, findOfficial, trigram, colorsFor, LIVE_LOOKAHEAD_MS };
