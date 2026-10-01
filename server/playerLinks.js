"use strict";

// =====================================================================
// PERMALIENS DES JOUEURS (demande validée le 2026-10-01) : depuis la fiche
// d'un joueur de SON club, le manager crée un lien court et public
// (`/j/<code>`) qui montre tout du joueur (caractéristiques, potentiel,
// progression), sans connexion. Un seul lien par joueur ; seul le manager
// du club peut le créer ou le couper.
//
// - Code : 8 caractères URL-safe (6 octets aléatoires en base64url, 48 bits
//   d'entropie), impossible à deviner ou à énumérer.
// - Stockage : store.loadPlayerLinks/savePlayerLinks, un bloc
//   { codes: { code: { leagueId, teamIdx, playerId, name, createdAt } } }
//   à côté du registre du monde.
// - Lien coupé au départ du joueur (vente, transfert, libération,
//   retraite…) : vérifié à la LECTURE (resolveLink) — si le joueur n'est
//   plus dans le club qui a créé le lien (même ligue, même index de club,
//   même identifiant ET même nom), le lien est supprimé et la page « lien
//   expiré » est servie. L'index d'un club est fixe dans sa ligue : un
//   joueur parti dans un autre club ne peut donc jamais être retrouvé par
//   l'ancien lien.
// =====================================================================

const crypto = require("crypto");
const store = require("./store.js");

const CODE_LENGTH = 8;
const CODE_RE = /^[A-Za-z0-9_-]{8}$/;

function newCode(taken) {
  for (let i = 0; i < 20; i++) {
    const code = crypto.randomBytes(6).toString("base64url");
    if (code.length === CODE_LENGTH && !taken[code]) return code;
  }
  throw new Error("Impossible de générer un code de lien.");
}

async function loadAll(savePath) {
  const data = await store.loadPlayerLinks(savePath);
  if (!data || typeof data !== "object" || !data.codes || typeof data.codes !== "object") return { codes: {} };
  return data;
}

function sameTarget(link, leagueId, teamIdx, playerId) {
  return link && link.leagueId === leagueId && link.teamIdx === teamIdx && link.playerId === playerId;
}

function findCodeFor(data, leagueId, teamIdx, playerId) {
  return Object.keys(data.codes).find(c => sameTarget(data.codes[c], leagueId, teamIdx, playerId)) || null;
}

// Le joueur visé est-il toujours au club qui a créé le lien ?
function playerStillThere(league, link) {
  const team = league && Array.isArray(league.teams) ? league.teams[link.teamIdx] : null;
  const player = team && (team.players || []).find(p => p.id === link.playerId);
  if (!player) return null;
  if (link.name && player.name !== link.name) return null;
  return { team, player };
}

// Lien du manager pour un de SES joueurs (crée le code s'il n'existe pas).
// `ctx` : contexte résolu par le jeton (league, leagueId, teamIndex).
async function createLink(savePath, ctx, playerId, now = Date.now()) {
  const team = ctx.league.teams[ctx.teamIndex];
  if (!team || !team.isHuman) return { ok: false, status: 403, error: "Réservé aux managers." };
  const id = Number(playerId);
  const player = Number.isFinite(id) ? (team.players || []).find(p => p.id === id) : null;
  if (!player) return { ok: false, status: 404, error: "Ce joueur n'est pas dans votre effectif." };
  const leagueId = ctx.leagueId || null;
  const data = await loadAll(savePath);
  let code = findCodeFor(data, leagueId, ctx.teamIndex, player.id);
  if (code && data.codes[code].name && data.codes[code].name !== player.name) {
    delete data.codes[code];
    code = null;
  }
  if (!code) {
    code = newCode(data.codes);
    data.codes[code] = { leagueId, teamIdx: ctx.teamIndex, playerId: player.id, name: player.name, createdAt: now };
    await store.savePlayerLinks(data, savePath);
  }
  return { ok: true, code, playerId: player.id };
}

// Coupe le lien d'un de SES joueurs (sans effet s'il n'y en a pas).
async function revokeLink(savePath, ctx, playerId) {
  const team = ctx.league.teams[ctx.teamIndex];
  if (!team || !team.isHuman) return { ok: false, status: 403, error: "Réservé aux managers." };
  const id = Number(playerId);
  const data = await loadAll(savePath);
  const code = findCodeFor(data, ctx.leagueId || null, ctx.teamIndex, id);
  if (code) {
    delete data.codes[code];
    await store.savePlayerLinks(data, savePath);
  }
  return { ok: true, revoked: !!code, playerId: id };
}

// Liens actifs du club { playerId: code } (fiche joueur, /api/save) —
// seulement pour des joueurs encore dans l'effectif.
async function linksForTeam(savePath, leagueId, teamIdx, league = null) {
  const data = await loadAll(savePath);
  const out = {};
  Object.keys(data.codes).forEach(code => {
    const l = data.codes[code];
    if (!l || l.leagueId !== (leagueId || null) || l.teamIdx !== teamIdx) return;
    if (league && !playerStillThere(league, l)) return;
    out[l.playerId] = code;
  });
  return out;
}

// Résout un code : { link, league, team, player } ou null (code inconnu,
// mal formé, ou joueur parti — le lien est alors supprimé).
// `loadLeague(leagueId)` : charge la ligue (null si introuvable).
async function resolveLink(savePath, code, loadLeague) {
  if (typeof code !== "string" || !CODE_RE.test(code)) return null;
  const data = await loadAll(savePath);
  const link = data.codes[code];
  if (!link) return null;
  const league = await loadLeague(link.leagueId);
  const found = league ? playerStillThere(league, link) : null;
  if (!found) {
    // Ligue introuvable (erreur de lecture ?) : on ne supprime rien.
    if (league) {
      delete data.codes[code];
      await store.savePlayerLinks(data, savePath);
    }
    return null;
  }
  return { link, league, team: found.team, player: found.player };
}

module.exports = { CODE_LENGTH, CODE_RE, newCode, createLink, revokeLink, linksForTeam, resolveLink, playerStillThere };
