"use strict";
// Sélections nationales : vitrine publique (demande du 2026-10-07).
//  - Message du staff sur la page de la sélection (sélectionneur et
//    adjoints) : store.teams[id].message = { text, at, by, role }.
//  - Personnalisation visuelle (sélectionneur seul) : logo, bannière,
//    maillot, terrain ; store.teams[id].visuals = { logo, banner, jersey,
//    court } (ids de assets/national-visuals.js, certains à débloquer).
//  - Fonctions nationales d'un manager (profil public) : mandats en cours
//    et staff actif dont la place de club ({leagueId, idx}) est la sienne.
//  - Sélection actuelle d'un joueur (fiche joueur) : dernière liste de
//    convoqués FIGÉE de « <nationalité>-A » / « <nationalité>-U21 ».
// Tout est stocké sur store.teams (la sélection), donc survit aux changements
// de sélectionneur et de saison ; purement visuel, aucun effet sportif.
const Visuals = require("../assets/national-visuals.js");
// Palettes des drapeaux (assets/flags/palette.json, tools/build_flag_palettes.js) :
// maillots « nationaux » des matchs. Lues une fois.
let flagPalettes = null;
function paletteOf(country) {
  if (!flagPalettes) { try { flagPalettes = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "assets", "flags", "palette.json"), "utf8")); } catch (e) { flagPalettes = {}; } }
  return flagPalettes[String(country || "").toLowerCase()] || null;
}

const MESSAGE_MAX = 500;
const NT = () => require("./nationalTeams.js");
const NC = () => require("./nationalCoach.js");
const NM = () => require("./nationalMatches.js");

function fail(error, status = 400) { return { ok: false, status, error }; }
function roleOf(store, me, teamId) {
  if (!me) return null;
  const a = NC().accessOf(store, me, teamId);
  return a ? a.role : null;
}
function canEditMessage(role) { return role === "coach" || role === "assistant"; }
// Personnalisation (logo, bannière, maillot, terrain) : sélectionneur ET
// adjoints (demande du 2026-10-09 ; mêmes droits que le message de la
// page). Contrôlé ici, côté serveur : l'API refuse les autres rôles.
function canEditVisuals(role) { return role === "coach" || role === "assistant"; }

// Texte brut : retours à la ligne gardés (2 au plus d'affilée), caractères
// de contrôle retirés ; jamais de HTML (échappé à l'affichage).
function cleanMessage(v) {
  return String(v == null ? "" : v)
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function visualStats(store, teamId, now) {
  return Visuals.statsOf(teamId, NM().resultsOf(store, teamId, now), NM().honoursOf(store, teamId));
}

// Données publiques ajoutées à la page de la sélection (teamView).
function publicExtras(store, teamId, me, now) {
  const team = store.teams[teamId];
  if (!team) return null;
  const role = roleOf(store, me, teamId);
  const stats = visualStats(store, teamId, now);
  const m = team.message && team.message.text ? team.message : null;
  return {
    message: m ? { text: m.text, at: m.at, by: m.by || null, role: m.role || null } : null,
    messageMax: MESSAGE_MAX,
    visuals: Visuals.resolve(team.visuals || null, stats),
    visualStats: stats,
    canEditMessage: canEditMessage(role),
    canEditVisuals: canEditVisuals(role),
  };
}

// POST /api/national/message { teamId, text } (texte vide = suppression).
function setMessage(store, me, body, now) {
  const team = store.teams[body && body.teamId];
  if (!team) return fail("Sélection inconnue.", 404);
  if (!me) return fail("Réservé aux managers.", 403);
  const role = roleOf(store, me, team.id);
  if (!canEditMessage(role)) return fail("Seuls le sélectionneur et ses adjoints peuvent modifier ce message.", 403);
  const text = cleanMessage(body.text);
  if (text.length > MESSAGE_MAX) return fail(`Message trop long (${MESSAGE_MAX} caractères au plus).`);
  if (!text) { team.message = null; return { ok: true, message: null }; }
  team.message = { text, at: now, by: me.pseudo || me.clubName || null, role };
  return { ok: true, message: team.message };
}

// POST /api/national/visuals { teamId, visuals: { logo?, banner?, jersey?, court? } }
function setVisuals(store, me, body, now) {
  const team = store.teams[body && body.teamId];
  if (!team) return fail("Sélection inconnue.", 404);
  if (!me) return fail("Réservé aux managers.", 403);
  if (!canEditVisuals(roleOf(store, me, team.id))) return fail("Seuls le sélectionneur et ses adjoints peuvent personnaliser la sélection.", 403);
  const want = (body && body.visuals) || {};
  const stats = visualStats(store, team.id, now);
  const next = { ...(team.visuals || {}) };
  for (const k of Visuals.KINDS) {
    if (want[k] == null) continue;
    const it = Visuals.itemOf(k, want[k]);
    if (!it) return fail("Élément inconnu.");
    if (!Visuals.isUnlocked(it, stats)) return fail(`« ${it.label} » n'est pas encore débloqué : ${Visuals.NEEDS[it.need].label.toLowerCase()}.`, 403);
    next[k] = it.id;
  }
  team.visuals = next;
  team.visualsAt = now;
  return { ok: true, visuals: Visuals.resolve(next, stats) };
}

// Habillage d'une sélection pour un match (direct, feuille de match) :
// maillot et terrain choisis (null = rien de personnalisé).
function matchDress(store, teamId, now) {
  const team = store.teams[teamId];
  if (!team || !team.visuals) return null;
  const v = Visuals.resolve(team.visuals, visualStats(store, teamId, now));
  const j = Visuals.itemOf("jersey", v.jersey), c = Visuals.itemOf("court", v.court);
  // Maillot aux couleurs du drapeau : couleurs de maillot les plus proches.
  if (j.nation) {
    const nj = Visuals.nationJersey(j, paletteOf(team.country || String(teamId).split("-")[0]));
    return { jerseyColor: nj.color, jerseyPattern: nj.pattern, jerseyTwoTone: nj.pair, court: { wood: c.wood, paint: c.paint } };
  }
  return { jerseyColor: j.color, jerseyPattern: j.pattern, court: { wood: c.wood, paint: c.paint } };
}

// GET /api/national/roles?league=&idx= : fonctions nationales EN COURS du
// manager de cette place de club (sélectionneur ou staff actif).
function rolesOf(store, leagueId, idx) {
  const out = [];
  const same = ref => ref && String(ref.leagueId) === String(leagueId) && Number(ref.idx) === Number(idx);
  for (const m of store.mandates || []) {
    if (m.endedAt) continue;
    const team = store.teams[m.teamId];
    if (!team || team.mandateId !== m.id) continue;
    if (same(m.ref)) out.push({ teamId: team.id, country: team.country, cat: team.cat, role: "coach" });
    (m.staff || []).forEach(x => {
      if (x && x.status === "active" && same(x.ref)) out.push({ teamId: team.id, country: team.country, cat: team.cat, role: x.role });
    });
  }
  const order = { coach: 0, assistant: 1, helper: 2, recruiter: 3, scout: 4 };
  return out.sort((a, b) => (order[a.role] - order[b.role]) || (a.cat === b.cat ? 0 : a.cat === "A" ? -1 : 1));
}

// GET /api/national/player?id=&name=&nat= : sélection ACTUELLE du joueur =
// présent dans la dernière liste de convoqués figée (publique) de la
// sélection A ou U21 de sa nationalité. Plus nombre de sélections (caps).
function playerSelection(store, id, name, nat) {
  const key = `${id}|${name}`;
  const teams = [];
  if (nat) {
    for (const cat of ["A", "U21"]) {
      const teamId = `${nat}-${cat}`;
      const team = store.teams[teamId];
      if (!team) continue;
      const convs = Object.values((store.convocations || {})[teamId] || {})
        .filter(c => c && c.frozenAt && Array.isArray(c.players))
        .sort((a, b) => (b.startAt || 0) - (a.startAt || 0));
      const last = convs[0];
      if (last && last.players.some(r => NC().refKey(r) === key)) {
        teams.push({ teamId, country: team.country, cat: team.cat, label: last.label || null, startAt: last.startAt || null });
      }
    }
  }
  const cap = (store.caps || {})[key];
  return { ok: true, teams, caps: cap ? cap.n : 0 };
}

module.exports = { paletteOf, MESSAGE_MAX, cleanMessage, publicExtras, setMessage, setVisuals, matchDress, rolesOf, playerSelection, visualStats };
