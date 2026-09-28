"use strict";

// =====================================================================
// LE MONDE : PAYS ET CHAMPIONNATS (2026-09-28) — retours utilisateur :
// "divisions par pays", "chaque pays a ses propres horaires", "partons sur
// France et US pour voir comment ça marche pour commencer", "pas de limite
// de joueurs étrangers", "on va dans la division la plus haute où il y a un
// bot".
//
// Chaque championnat est une ligue COMPLÈTE et indépendante (même moteur,
// même code qu'avant : 10 clubs, calendrier, play-offs, marché…),
// sauvegardée séparément (voir store.leagueStorage). Ce module tient le
// REGISTRE qui les relie :
//   { version: 1,
//     leagues: [{ id, country, level, group, createdAt }],
//     tokens: { <jeton manager>: <id du championnat> } }
// - "fr-1" = la ligue partagée historique, devenue Division I française.
// - Un pays s'agrandit à la demande : quand plus aucun club CPU n'est
//   libre, le championnat suivant est créé (groupes B, C de la Division II,
//   puis la Division III…), voir nextSlot.
// - `tokens` : index jeton → championnat, pour ne charger QUE la ligue du
//   manager à chaque requête. Reconstruit au besoin (jeton inconnu : on
//   cherche dans tous les championnats, puis on le mémorise).
// =====================================================================

const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const store = require("./store.js");
const Accounts = require("./accounts.js");
const AutoSim = require("./autoSim.js");

const WORLD_VERSION = 1;
const DEFAULT_COUNTRY = "fr";

function isValidWorld(w) {
  return !!(w && w.version === WORLD_VERSION && Array.isArray(w.leagues) && w.tokens && typeof w.tokens === "object");
}

function countryCodes() {
  return Object.keys(Engine.WORLD_COUNTRIES);
}

function isOpenCountry(code) {
  return typeof code === "string" && !!Engine.WORLD_COUNTRIES[code];
}

// Championnats d'un pays, du plus haut (Division I) au plus bas, groupe A
// avant B : l'ordre dans lequel un nouveau manager est placé.
function leaguesOfCountry(world, country) {
  return world.leagues
    .filter(l => l.country === country)
    .sort((a, b) => a.level - b.level || a.group - b.group);
}

// Charge le registre, le crée au besoin (la ligue historique devient "fr-1")
// et s'assure que chaque pays ouvert a au moins sa Division I. Ne fait rien
// tant qu'aucune ligue partagée n'existe (mode solo, tests historiques) :
// renvoie alors `null`. `dirty` : à sauvegarder (saveWorld).
async function loadWorld(savePath, now = Date.now()) {
  let world = await store.loadWorldRaw(savePath);
  let dirty = false;
  if (!isValidWorld(world)) {
    const historic = await store.loadMultiLeague(savePath);
    if (!historic) return null;
    world = { version: WORLD_VERSION, leagues: [], tokens: {} };
    world.leagues.push({ id: store.HISTORIC_LEAGUE_ID, country: "fr", level: historic.league.divisionLevel || 1, group: 0, createdAt: now });
    historic.league.teams.forEach(t => { if (t.isHuman && t.managerLinkToken) world.tokens[t.managerLinkToken] = store.HISTORIC_LEAGUE_ID; });
    dirty = true;
  }
  for (const code of countryCodes()) {
    if (!leaguesOfCountry(world, code).length) {
      await createLeague(world, savePath, code, 1, 0, now);
      dirty = true;
    }
  }
  if (dirty) await saveWorld(world, savePath);
  return world;
}

async function saveWorld(world, savePath) {
  await store.saveWorldRaw(world, savePath);
}

async function loadLeague(world, id, savePath) {
  const loaded = await store.loadMultiLeague(savePath, id);
  if (!loaded) return null;
  if (!loaded.league.leagueId) loaded.league.leagueId = id;
  return loaded.league;
}

// Règle le fuseau horaire du calendrier (moteur + serveur) sur celui de ce
// championnat — voir Engine.setCalendarTimeZone. Une requête à la fois
// (verrou de server/index.js), donc sans risque de mélange.
function useLeagueTimeZone(league) {
  const tz = (league && league.timeZone) || Engine.countryInfo((league && league.country) || DEFAULT_COUNTRY).timeZone;
  Engine.setCalendarTimeZone(tz);
  Calendar.setCalendarTimeZone(tz);
  return tz;
}

// Retrouve le club d'un jeton manager : { league, teamIndex, leagueId } ou
// null. Met à jour l'index `tokens` si besoin (sauvegarde le registre).
async function findTeamByToken(world, token, savePath) {
  if (!world || !token) return null;
  const known = world.tokens[token];
  if (known) {
    const league = await loadLeague(world, known, savePath);
    const r = league && store.resolveManagerTeam(league, token);
    if (r) return { league, teamIndex: r.teamIndex, leagueId: known };
  }
  for (const entry of world.leagues) {
    if (entry.id === known) continue;
    const league = await loadLeague(world, entry.id, savePath);
    const r = league && store.resolveManagerTeam(league, token);
    if (r) {
      world.tokens[token] = entry.id;
      await saveWorld(world, savePath);
      return { league, teamIndex: r.teamIndex, leagueId: entry.id };
    }
  }
  return null;
}

// Prochain championnat à ouvrir dans un pays : le groupe suivant du niveau
// le plus bas déjà ouvert (3^(niveau-1) groupes par niveau, comme la
// pyramide historique), sinon le 1er groupe du niveau d'en dessous. `null`
// si la pyramide est complète (Division VI pleine).
function nextSlot(world, country) {
  const list = leaguesOfCountry(world, country);
  if (!list.length) return { level: 1, group: 0 };
  const lowest = list[list.length - 1].level;
  const count = list.filter(l => l.level === lowest).length;
  if (count < Math.pow(3, lowest - 1)) return { level: lowest, group: count };
  if (lowest + 1 > Engine.MAX_DIVISION_LEVEL) return null;
  return { level: lowest + 1, group: 0 };
}

async function teamNamesOfCountry(world, savePath, country) {
  const names = new Set();
  for (const entry of leaguesOfCountry(world, country)) {
    const league = await loadLeague(world, entry.id, savePath);
    if (league) league.teams.forEach(t => names.add(t.name));
  }
  return names;
}

async function createLeague(world, savePath, country, level, group, now) {
  const usedNames = await teamNamesOfCountry(world, savePath, country);
  const league = Engine.generateCountryLeague(country, level, group, now, usedNames);
  // Même calendrier que le reste du pays (saisons synchronisées, voir
  // catchUpWorld) : dates et numéro de saison de la ligue de référence
  // (la plus haute), journées déjà passées simulées d'un coup entre clubs
  // de l'IA AVANT l'arrivée du manager.
  // Référence : la ligue la plus haute du pays, sinon celle d'un autre pays
  // (Division I française) — TOUS les pays suivent les mêmes semaines, pour
  // que la fin de saison (vieillissement, retraites) tombe au même instant
  // partout (marché mondial : un joueur ne vieillit ni deux fois ni jamais).
  const refEntry = leaguesOfCountry(world, country)[0] || world.leagues.find(l => l.id === store.HISTORIC_LEAGUE_ID) || world.leagues[0];
  const ref = refEntry ? await loadLeague(world, refEntry.id, savePath) : null;
  league.autoNextSeason = false;
  if (ref && typeof ref.calendarStartAt === "number" && ref.calendarDailyAnchored && ref.calendarWeeklyRhythm) {
    syncCalendarTo(league, ref);
    useLeagueTimeZone(league);
    try { AutoSim.catchUpLeague(league, now); } finally { useLeagueTimeZone(null); }
  }
  await store.saveMultiLeague(league, savePath);
  world.leagues.push({ id: league.leagueId, country, level, group, createdAt: now });
  return league;
}

// Cale le calendrier de `league` sur celui de `ref` : mêmes semaines, mardi
// 20:00 dans le fuseau de `league` (même date civile que le mardi de `ref`).
function syncCalendarTo(league, ref) {
  const tz = league.timeZone || null;
  const DAY = 24 * 3600 * 1000;
  const sameTuesday = at => Calendar.weeklyRhythmCalendarStartAt(at - DAY, tz);
  league.calendarDailyAnchored = ref.calendarDailyAnchored;
  league.calendarWeeklyRhythm = ref.calendarWeeklyRhythm;
  if (ref.calendarWeeklySwitch && typeof ref.calendarWeeklySwitch.anchorAt === "number") {
    league.calendarStartAt = ref.calendarStartAt;
    league.calendarWeeklySwitch = { ...ref.calendarWeeklySwitch, anchorAt: sameTuesday(ref.calendarWeeklySwitch.anchorAt) };
  } else {
    league.calendarStartAt = sameTuesday(ref.calendarStartAt);
    league.calendarWeeklySwitch = null;
  }
  league.seasonNumber = typeof ref.seasonNumber === "number" ? ref.seasonNumber : 1;
}

// Un nom de club est pris s'il existe déjà dans N'IMPORTE QUEL championnat
// (tous pays confondus) ou fait partie des noms CPU par défaut.
async function isClubNameTakenInWorld(world, savePath, name) {
  if (Accounts.isClubNameTaken(name, null)) return true;
  if (!world) return false;
  const key = name.toLocaleLowerCase("fr");
  for (const code of countryCodes()) {
    if ((Engine.COUNTRY_CPU_TEAM_NAMES[code] || []).some(n => n.toLocaleLowerCase("fr") === key)) return true;
  }
  for (const entry of world.leagues) {
    const league = await loadLeague(world, entry.id, savePath);
    if (league && Accounts.isClubNameTaken(name, league)) return true;
  }
  return false;
}

// Donne un club à un nouveau manager dans `country` : reprise du club CPU le
// plus faible du championnat le plus HAUT qui en a encore un ; si le pays
// est plein, ouvre le championnat suivant (voir nextSlot) et y place le
// manager. { ok, token, leagueId, teamIndex } ou { ok:false, reason }.
async function assignClub(world, savePath, { country, clubName, now }) {
  const code = isOpenCountry(country) ? country : DEFAULT_COUNTRY;
  for (const entry of leaguesOfCountry(world, code)) {
    const league = await loadLeague(world, entry.id, savePath);
    if (!league || !league.teams.some(t => !t.isHuman)) continue;
    const taken = Accounts.takeOverCpuClub(league, clubName);
    if (!taken.ok) continue;
    league.teams[taken.teamIndex].country = code;
    await store.saveMultiLeague(league, savePath);
    world.tokens[taken.token] = entry.id;
    await saveWorld(world, savePath);
    return { ok: true, token: taken.token, leagueId: entry.id, teamIndex: taken.teamIndex };
  }
  const slot = nextSlot(world, code);
  if (!slot) return { ok: false, reason: "full" };
  const league = await createLeague(world, savePath, code, slot.level, slot.group, now);
  const taken = Accounts.takeOverCpuClub(league, clubName);
  if (!taken.ok) return { ok: false, reason: taken.reason };
  league.teams[taken.teamIndex].country = code;
  await store.saveMultiLeague(league, savePath);
  world.tokens[taken.token] = league.leagueId;
  await saveWorld(world, savePath);
  return { ok: true, token: taken.token, leagueId: league.leagueId, teamIndex: taken.teamIndex };
}

// ---------------------------------------------------------------------
// MONTÉES / DESCENTES ET SAISONS SYNCHRONISÉES (retour utilisateur,
// 2026-09-28 : champion des play-offs monte, 9e et 10e descendent, barrage
// 7e-8e en match sec dont le perdant descend ; divisions ouvertes à la
// demande ; mise à jour unique le lundi 6h à Paris ; une semaine
// d'intersaison pour recruter après une montée).
//
// Toutes les ligues d'un pays suivent le MÊME calendrier (une ligue ouverte
// en cours de saison s'y cale, ses journées passées simulées d'un coup entre
// clubs de l'IA, voir createLeague). La ligue (niveau n, groupe g) a pour
// « parente » (n-1, floor(g/3)) et pour « filles » les groupes 3g, 3g+1,
// 3g+2 du niveau n+1 QUI EXISTENT. Chaque ligue fait descendre autant de
// clubs qu'elle a de filles ouvertes (10e, puis 9e, puis perdant du barrage)
// et chaque fille fait monter son champion des play-offs : le nombre de
// clubs par ligue reste toujours 10. La dernière division ouverte ne
// descend jamais.
//  1) lundi d'intersaison (toutes les ligues du pays ont passé leur mise à
//     jour de fin de saison) : computeCountryMoves — pendingDivisionMove sur
//     chaque club concerné, fil d'actualité, prime de montée ;
//  2) lundi suivant : mise à jour hebdomadaire normale de chaque ligue,
//     ÉCHANGE des clubs (même index dans les deux ligues : les autres clubs
//     gardent le leur), puis League.startNextSeason pour toutes.
// C'est CE module qui fait redémarrer les ligues du monde (autoNextSeason =
// false sur chacune), via catchUpWorld, appelé en tâche de fond par le
// serveur (voir server/index.js) : même une ligue sans manager connecté
// avance.
// ---------------------------------------------------------------------
function divisionLabel(level, group) {
  const name = Engine.divisionInfo(level).name;
  return level > 1 ? `${name} · Groupe ${String.fromCharCode(65 + (group || 0))}` : name;
}

function childrenEntries(world, entry) {
  return world.leagues
    .filter(l => l.country === entry.country && l.level === entry.level + 1 && Math.floor(l.group / 3) === entry.group)
    .sort((a, b) => a.group - b.group);
}

// Ordre de descente : 10e, 9e, puis perdant du barrage (7e-8e).
function relegationOrder(league) {
  const table = league.standings();
  const order = [];
  if (table[9]) order.push(table[9].idx);
  if (table[8]) order.push(table[8].idx);
  if (league.relegationBarrage && league.relegationBarrage.loser != null) order.push(league.relegationBarrage.loser);
  return order;
}

// Étape 1 : qui monte, qui descend. `leagues` : Map id → League (chargées).
// Renvoie la liste des échanges [{ up, down }].
function computeCountryMoves(world, country, leagues, now) {
  const moves = [];
  const entries = leaguesOfCountry(world, country);
  const intersaisonAt = Math.max(...entries.map(e => (leagues.get(e.id) || {}).intersaisonStartedAt || 0));
  entries.forEach(entry => {
    const parent = leagues.get(entry.id);
    if (!parent) return;
    // Une ligue ouverte PENDANT l'intersaison n'a pas vraiment joué la
    // saison : ni montée ni descente pour elle cette fois.
    const kids = childrenEntries(world, entry).filter(k => leagues.get(k.id) && (k.createdAt || 0) < intersaisonAt);
    if (!kids.length) return;
    if (!parent.relegationBarrage && kids.length >= 3 && parent.isRegularSeasonDone()) parent.runRelegationBarrage();
    const down = relegationOrder(parent);
    kids.forEach((kidEntry, k) => {
      const kid = leagues.get(kidEntry.id);
      const champ = kid.playoffs ? kid.playoffs.champion : null;
      if (champ == null || down[k] == null) return;
      moves.push({
        up: { leagueId: kidEntry.id, idx: champ, toLeagueId: entry.id, toIdx: down[k], toLevel: entry.level, toLabel: divisionLabel(entry.level, entry.group) },
        down: { leagueId: entry.id, idx: down[k], toLeagueId: kidEntry.id, toIdx: champ, toLevel: kidEntry.level, toLabel: divisionLabel(kidEntry.level, kidEntry.group) },
      });
    });
  });
  moves.forEach(m => {
    const upTeam = leagues.get(m.up.leagueId).teams[m.up.idx];
    const downTeam = leagues.get(m.down.leagueId).teams[m.down.idx];
    upTeam.pendingDivisionMove = { kind: "promoted", toLevel: m.up.toLevel, toLeagueId: m.up.toLeagueId, toLabel: m.up.toLabel };
    downTeam.pendingDivisionMove = { kind: "relegated", toLevel: m.down.toLevel, toLeagueId: m.down.toLeagueId, toLabel: m.down.toLabel };
    if (upTeam.isHuman) {
      const bonus = Engine.seasonEndBonusFor({ outcome: "promoted", toLevel: m.up.toLevel });
      if (bonus) upTeam.recordTransaction(bonus.label, bonus.amount);
      if (upTeam.feed) {
        Engine.pushEntry(upTeam.feed, {
          key: "division_move", category: "ligue", week: upTeam.week, createdAt: now,
          title: `Montée en ${m.up.toLabel} !`,
          text: bonus
            ? `Champion de sa ligue, ${upTeam.name} jouera en ${m.up.toLabel} la saison prochaine (prime de montée : ${bonus.amount.toLocaleString("fr-FR")} €). Profitez de l'intersaison pour renforcer l'effectif.`
            : `Champion de sa ligue, ${upTeam.name} jouera en ${m.up.toLabel} la saison prochaine. Profitez de l'intersaison pour renforcer l'effectif.`,
          action: { label: "Marché", href: "/marche" },
        });
      }
    }
    if (downTeam.isHuman && downTeam.feed) {
      Engine.pushEntry(downTeam.feed, {
        key: "division_move", category: "ligue", week: downTeam.week, createdAt: now,
        title: `Relégation en ${m.down.toLabel}`,
        text: `${downTeam.name} jouera en ${m.down.toLabel} la saison prochaine.`,
        action: { label: "Ligue", href: "/ligue" },
      });
    }
  });
  return moves;
}

// Annonces du marché et amicaux à venir d'un club qui change de ligue :
// annulés (ils visaient son ancienne ligue).
function cancelTeamCommitments(league, teamIdx) {
  (league.transferListings || []).forEach(l => {
    if (l.status === "open" && (l.sellerIdx === teamIdx || l.currentBidderIdx === teamIdx)) { l.status = "cancelled"; l.result = "division-move"; }
  });
  (league.friendlies || []).forEach(f => {
    if ((f.homeIdx === teamIdx || f.awayIdx === teamIdx) && (f.status === "pending" || f.status === "accepted")) f.status = "cancelled";
  });
}

// Étape 2 : échanges. Met à jour l'index des jetons du registre.
function applyCountryMoves(world, moves, leagues) {
  moves.forEach(m => {
    const kid = leagues.get(m.up.leagueId);
    const parent = leagues.get(m.down.leagueId);
    const upTeam = kid.teams[m.up.idx];
    const downTeam = parent.teams[m.down.idx];
    cancelTeamCommitments(kid, m.up.idx);
    cancelTeamCommitments(parent, m.down.idx);
    parent.teams[m.down.idx] = upTeam;
    kid.teams[m.up.idx] = downTeam;
    [upTeam, downTeam].forEach(t => {
      t.pendingDivisionMove = null;
      if (!t.isHuman && typeof t.autoAssignLineup === "function") t.autoAssignLineup();
    });
    if (upTeam.isHuman && upTeam.managerLinkToken) world.tokens[upTeam.managerLinkToken] = m.down.leagueId;
    if (downTeam.isHuman && downTeam.managerLinkToken) world.tokens[downTeam.managerLinkToken] = m.up.leagueId;
  });
}

// Fait avancer TOUTES les ligues du monde jusqu'à `now`, puis gère le
// passage de saison de chaque pays. `tickLeague(league, now)` : rattrapage
// complet d'une ligue (server/index.js:tick — matchs, amicaux, ligues
// privées, sponsors…) ; par défaut AutoSim.catchUpLeague. Sauvegarde les
// ligues et le registre. Renvoie les événements.
async function catchUpWorld(savePath, now = Date.now(), { tickLeague = null } = {}) {
  const world = await loadWorld(savePath, now);
  if (!world) return [];
  const events = [];
  const tick = tickLeague || ((lg, t) => AutoSim.catchUpLeague(lg, t));
  let worldDirty = false;
  for (const country of countryCodes()) {
    const entries = leaguesOfCountry(world, country);
    const leagues = new Map();
    for (const e of entries) {
      const lg = await loadLeague(world, e.id, savePath);
      if (lg) leagues.set(e.id, lg);
    }
    for (let guard = 0; guard < 10; guard++) {
      for (const [id, lg] of leagues) {
        lg.autoNextSeason = false;
        useLeagueTimeZone(lg);
        (tick(lg, now) || []).forEach(ev => events.push({ leagueId: id, ...ev }));
      }
      useLeagueTimeZone(null);
      const all = [...leagues.values()];
      if (!all.length || !all.every(lg => lg.isPlayoffsDone() && lg.seasonEndTickDone)) break;
      const seasonNumber = all[0].seasonNumber || 1;
      world.seasons = world.seasons || {};
      const state = world.seasons[country] || {};
      if (state.movesSeason !== seasonNumber) {
        state.moves = computeCountryMoves(world, country, leagues, now);
        state.movesSeason = seasonNumber;
        world.seasons[country] = state;
        worldDirty = true;
        events.push({ type: "division-moves", country, seasonNumber, moves: state.moves.length });
      }
      // Reprise : le lundi qui suit le lundi d'intersaison, même instant
      // pour toutes les ligues du pays.
      const first = all[0];
      const ecoAt = Calendar.scheduledTimeForLeagueEconomyTick(first, (first.lastEconomyTick || 0) + 1);
      if (ecoAt == null || ecoAt > now) break;
      for (const lg of all) {
        useLeagueTimeZone(lg);
        AutoSim.runWeeklyEconomyTick(lg, (lg.lastEconomyTick || 0) + 1, ecoAt, false, []);
      }
      useLeagueTimeZone(null);
      applyCountryMoves(world, state.moves || [], leagues);
      let next = null;
      for (const lg of all) { next = lg.startNextSeason(ecoAt); }
      state.moves = [];
      worldDirty = true;
      events.push({ type: "country-new-season", country, seasonNumber: next, at: ecoAt });
    }
    for (const lg of leagues.values()) await store.saveMultiLeague(lg, savePath);
  }
  if (worldDirty) await saveWorld(world, savePath);
  return events;
}

// Résumé public des pays ouverts (page d'inscription).
function publicCountries() {
  return countryCodes().map(code => ({ code, name: Engine.WORLD_COUNTRIES[code].name, timeZone: Engine.WORLD_COUNTRIES[code].timeZone }));
}

module.exports = {
  WORLD_VERSION, DEFAULT_COUNTRY,
  loadWorld, saveWorld, loadLeague, useLeagueTimeZone, findTeamByToken,
  leaguesOfCountry, nextSlot, createLeague, assignClub, isClubNameTakenInWorld,
  isOpenCountry, publicCountries,
  divisionLabel, syncCalendarTo, computeCountryMoves, applyCountryMoves, catchUpWorld, relegationOrder,
};
