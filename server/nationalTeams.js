"use strict";
// =====================================================================
// SÉLECTIONS NATIONALES (2026-10-05) — PHASE A : élections et mandats.
//
// Chaque pays du jeu (Engine.WORLD_COUNTRIES, 17 pays à championnat, choix
// de l'utilisateur) a deux sélections indépendantes : A et U21. Chacune a
// son sélectionneur, élu par les managers selon des règles configurables :
//   élection (candidatures → vote) → nomination → mandat → fin du mandat
//   (terme, démission, destitution, inactivité, club perdu) → élection.
//
// Stockage À PART des championnats (store « nationalteams » du monde, lu en
// mode strict, écrit seulement s'il a changé) — rien dans les sauvegardes
// de ligue, rien dans le registre du monde réécrit à chaque passage :
//   { version, config?, seq, teams: { "<pays>-<A|U21>": { id, country,
//     cat, mandateId } }, elections: [...], mandates: [...] }
// Les joueurs, managers, clubs et pays ne sont JAMAIS dupliqués : un
// manager est identifié par l'empreinte de son jeton (Messages.
// participantKey, comme le chat et la messagerie) + la place de son club
// { leagueId, idx } (revérifiée à chaque passage) ; pseudo et nom de club
// ne sont que des copies d'affichage, rafraîchies.
//
// Avancement par le rattrapage du monde (server/world.js:catchUpWorld, qui
// a toutes les ligues en main) : step() ouvre / fait avancer / clôt les
// élections, vérifie les mandats ; les échéances sont renvoyées pour
// nextDeadlineAt. Les routes (server/index.js, /api/national/*) appellent
// les actions ci-dessous puis enregistrent le stock.
// =====================================================================
const Engine = require("../engine.js");
const Messages = require("./messages.js");

const STORE_NAME = "nationalteams";
const CATEGORIES = ["A", "U21"];
const DAY = 24 * 3600 * 1000;

// Réglages par défaut (surchargés par store.config, voir configOf).
const DEFAULT_CONFIG = {
  u21MaxAge: 21,
  // Cycle international (retour utilisateur 2026-10-05) : 2 saisons = un
  // mandat. Saison 1 : compétition continentale (Euro en Europe, AmeriCup,
  // Coupe d'Asie). Saison 2 : Coupe du monde pour les sélections qualifiées
  // au classement de la compétition continentale de la saison 1, tournoi
  // consolante pour les autres. Calendrier (retour utilisateur 2026-10-05) :
  // 3 fenêtres internationales le dimanche chaque saison ; phases finales
  // pendant la dernière semaine (intersaison, seule la Supercoupe s'y joue
  // côté clubs), du lundi au dimanche à 20h : continentale en saison 1,
  // Coupe du monde / consolante en saison 2.
  cycle: [{ kind: "continental" }, { kind: "world" }],
  mandateSeasons: 2,
  // Retour utilisateur 2026-10-05 : « l'élection nationale A et U21 ne doit
  // pas être la même saison » → cycle des U21 décalé d'une saison ; « doit
  // avoir lieu lors de la première semaine d'une saison » → candidatures du
  // jour 0 au jour 3 de la saison, vote du jour 3 au jour 6 (avant le
  // premier lundi). Poste libéré en cours de mandat : intérim (IA) jusqu'à
  // la prochaine élection de la catégorie.
  categoryOffset: { A: 0, U21: 1 },
  // Première saison du cycle (posée à la création du stock : la saison qui
  // suit, pour que la première élection tombe bien en 1re semaine).
  cycleStartSeason: null,
  candidacyMs: 3 * DAY,
  voteMs: 3 * DAY,
  // Règles d'éligibilité (any = au moins une, all = toutes ; imbricables).
  // Types : clubInCountry (club dans le pays de la sélection), anyManager,
  // formerCoach (ancien sélectionneur de cette sélection), list (keys).
  voterRules: { any: [{ type: "clubInCountry" }] },
  candidateRules: { any: [{ type: "anyManager" }] },
  maxMandatesPerManager: 1,
  maxCandidaciesPerManager: 1,
  allowVoteChange: false,
  // Départage d'une égalité, dans l'ordre : note des managers (Elo),
  // candidature la plus ancienne, puis tirage stable (jamais d'élection
  // sans vainqueur).
  tieBreak: ["managerRating", "earliestCandidacy", "draw"],
  inactivityDays: 14,
  titleMax: 90,
  projectMax: 2000,
  // Groupe : 12 joueurs (intérim : 2 meilleurs par poste puis les meilleurs
  // restants), recalculé au plus toutes les heures (forme, stats à jour).
  squadSize: 12,
  squadRefreshMs: 3600 * 1000,
  // Calendrier (retour utilisateur 2026-10-05, définitif) : 3 fenêtres
  // internationales le dimanche des semaines 2, 4 et 6 (la semaine 5 est
  // celle de l'All-Star) ; phase finale pendant la dernière semaine, du
  // lundi (jour 76 de la saison) au dimanche (jour 82), à 20h.
  windowWeeks: [2, 4, 6],
  // Matchs internationaux (phase C) et gel automatique des convocations
  // (notifications aux clubs) : réglable par l'administration (« config »).
  matchesLive: true,
  finalFirstDay: 76,
  matchHour: 20,
};

function emptyStore() { return { version: 1, seq: 1, teams: {}, elections: [], mandates: [] }; }
function isValidStore(s) { return !!(s && typeof s === "object" && s.teams && typeof s.teams === "object" && Array.isArray(s.elections) && Array.isArray(s.mandates)); }
function configOf(store) { return { ...DEFAULT_CONFIG, ...((store && store.config) || {}) }; }
function nextId(store, prefix) { store.seq = (store.seq || 1) + 1; return `${prefix}${store.seq}`; }

async function loadStore(savePath) {
  const store = require("./store.js");
  const raw = await store.loadWorldAuxStrict(STORE_NAME, savePath);
  if (raw === store.WORLD_READ_FAILED) return null;
  if (raw == null) return emptyStore();
  if (!isValidStore(raw)) { console.warn("[sélections] données du monde inattendues : laissées telles quelles."); return null; }
  return raw;
}
async function saveStore(data, savePath) {
  const store = require("./store.js");
  await store.saveWorldAuxRaw(STORE_NAME, data, savePath, { strict: true });
}

// --- Pays, sélections, saison internationale -------------------------
function countryName(code) { const c = Engine.WORLD_COUNTRIES[code]; return c ? c.name : code; }
function teamIdOf(country, cat) { return `${country}-${cat}`; }
function teamLabel(teamId) {
  const [country, cat] = String(teamId).split("-");
  return `${countryName(country)} ${cat}`;
}
// Saisons synchronisées entre pays (server/world.js:syncCalendarTo) : la
// saison internationale est la plus avancée des championnats.
function intlSeasonOf(leagues) {
  let s = 1;
  for (const lg of leagues.values()) if (lg && typeof lg.seasonNumber === "number" && lg.seasonNumber > s) s = lg.seasonNumber;
  return s;
}
// Position dans le cycle international d'une catégorie (0..longueur-1), décalage
// des U21 compris ; négative avant le début du cycle.
function cyclePos(config, season, cat = "A") {
  const n = config.cycle.length || 2;
  const start = (config.cycleStartSeason || 1) + ((config.categoryOffset || {})[cat] || 0);
  const d = season - start;
  return d < 0 ? -1 : d % n;
}
// Saison d'élection d'une catégorie : 1re saison de chaque mandat.
function isElectionSeason(config, season, cat) {
  const pos = cyclePos(config, season, cat);
  return pos >= 0 && pos % (config.mandateSeasons || 2) === 0;
}
// Dernière saison du mandat qui commence.
function mandateEndSeason(config, season, cat = "A") {
  const len = config.mandateSeasons || 2;
  const pos = Math.max(0, cyclePos(config, season, cat)) % len;
  return season + (len - 1 - pos);
}
// Début de la saison en cours (jour 0, synchronisé entre pays).
function seasonStartOf(leagues) {
  let best = null;
  for (const lg of leagues.values()) {
    if (!lg || typeof lg.calendarStartAt !== "number") continue;
    if (!best || (lg.seasonNumber || 1) > (best.seasonNumber || 1)) best = lg;
  }
  return best ? best.calendarStartAt : null;
}
function ensureTeams(store) {
  let changed = false;
  Object.keys(Engine.WORLD_COUNTRIES).forEach(country => CATEGORIES.forEach(cat => {
    const id = teamIdOf(country, cat);
    if (!store.teams[id]) { store.teams[id] = { id, country, cat, mandateId: null }; changed = true; }
  }));
  return changed;
}

// --- Managers --------------------------------------------------------
// Club du manager (ctx d'une requête, ou place { leagueId, idx } dans les
// ligues chargées) → identité affichable.
function managerOf(leagueId, league, idx, world) {
  const team = league && league.teams[idx];
  if (!team || !team.isHuman || !team.managerLinkToken) return null;
  const entry = world && (world.leagues || []).find(e => e.id === leagueId);
  return {
    key: Messages.participantKey(team.managerLinkToken),
    ref: { leagueId, idx },
    pseudo: Engine.managerPseudoOf ? Engine.managerPseudoOf(team) : null,
    clubName: team.name,
    country: (entry && entry.country) || league.country || team.country || null,
    division: entry ? divisionLabelOf(entry) : null,
    rating: typeof team.managerRating === "number" ? team.managerRating : 1500,
    lastSeenAt: typeof team.lastSeenAt === "number" ? team.lastSeenAt : null,
  };
}
function divisionLabelOf(entry) {
  try { return require("./world.js").divisionLabel(entry.level, entry.group); } catch (e) { return null; }
}
function managerAt(ref, leagues, world) {
  if (!ref) return null;
  const lg = leagues.get(ref.leagueId);
  return lg ? managerOf(ref.leagueId, lg, ref.idx, world) : null;
}
function displayName(m) { return (m && (m.pseudo || (m.clubName ? `Manager de ${m.clubName}` : null))) || "Manager"; }

// --- Règles d'éligibilité ---------------------------------------------
// `me` = managerOf(...) ; `team` = sélection ; `store` pour formerCoach.
function evalRule(rule, me, team, store) {
  if (!rule || !me) return false;
  if (Array.isArray(rule.any)) return rule.any.some(r => evalRule(r, me, team, store));
  if (Array.isArray(rule.all)) return rule.all.every(r => evalRule(r, me, team, store));
  switch (rule.type) {
    case "anyManager": return true;
    case "clubInCountry": return me.country === team.country;
    case "formerCoach": return (store.mandates || []).some(m => m.teamId === team.id && m.key === me.key && m.endedAt);
    case "list": return Array.isArray(rule.keys) && rule.keys.includes(me.key);
    default: return false;
  }
}
function canVote(store, team, me) { return evalRule(configOf(store).voterRules, me, team, store); }
function canRun(store, team, me) { return evalRule(configOf(store).candidateRules, me, team, store); }

// --- Mandats -----------------------------------------------------------
function activeMandate(store, teamId) {
  const t = store.teams[teamId];
  const m = t && t.mandateId ? store.mandates.find(x => x.id === t.mandateId) : null;
  return m && !m.endedAt ? m : null;
}
function mandatesOfKey(store, key) { return store.mandates.filter(m => m.key === key && !m.endedAt); }
function endMandate(store, mandate, reason, now, leagues) {
  if (!mandate || mandate.endedAt) return false;
  mandate.endedAt = now;
  mandate.endReason = reason;
  const t = store.teams[mandate.teamId];
  if (t && t.mandateId === mandate.id) t.mandateId = null;
  notify(leagues, mandate.ref, {
    key: `nat_end_${mandate.id}`,
    title: `Fin de votre mandat : ${teamLabel(mandate.teamId)}`,
    text: ({ term: "Votre mandat est arrivé à son terme.", resigned: "Vous avez démissionné.", dismissed: "Vous avez été démis de vos fonctions.", inactive: "Mandat terminé pour inactivité.", clubLost: "Vous n'avez plus de club : mandat terminé." })[reason] || "Mandat terminé.",
  }, now);
  return true;
}

// --- Notifications (fil du club) ----------------------------------------
function notify(leagues, ref, entry, now) {
  if (!leagues || !ref) return;
  const lg = leagues.get(ref.leagueId);
  const team = lg && lg.teams[ref.idx];
  if (!team || !team.isHuman || !team.feed) return;
  try {
    Engine.pushEntry(team.feed, {
      key: entry.key, category: "club", week: team.week, createdAt: now,
      title: entry.title, text: entry.text, push: true,
      action: { label: "Sélections nationales", href: "/selections" },
    });
  } catch (e) { /* confort */ }
}
// Tous les clubs humains d'un pays (électeurs par défaut).
function notifyCountry(leagues, world, country, entry, now) {
  for (const [id, lg] of leagues) {
    const e = (world.leagues || []).find(x => x.id === id);
    if (!e || e.country !== country) continue;
    lg.teams.forEach((t, idx) => { if (t && t.isHuman) notify(leagues, { leagueId: id, idx }, entry, now); });
  }
}

// --- Élections ------------------------------------------------------------
function openElection(store, team, now, season, seasonStart = null) {
  const cfg = configOf(store);
  // Calée sur la 1re semaine de la saison (jour 0 → jour 6).
  const base = typeof seasonStart === "number" ? seasonStart : now;
  const el = {
    id: nextId(store, "e"), teamId: team.id, status: "candidacy", season,
    opensAt: now, voteAt: Math.max(now, base + cfg.candidacyMs), closesAt: Math.max(now, base + cfg.candidacyMs + cfg.voteMs),
    mandate: { fromSeason: season, toSeason: mandateEndSeason(cfg, season, team.cat) },
    candidates: [], votes: {}, result: null,
  };
  store.elections.push(el);
  return el;
}
function currentElection(store, teamId) {
  return store.elections.find(e => e.teamId === teamId && (e.status === "candidacy" || e.status === "vote")) || null;
}
function validCandidates(el) { return el.candidates.filter(c => !c.withdrawn); }
// Égalité : règles configurables, toujours un vainqueur.
function breakTie(store, el, tied, leagues, world) {
  const cfg = configOf(store);
  let pool = tied.slice();
  for (const rule of cfg.tieBreak || []) {
    if (pool.length <= 1) break;
    if (rule === "managerRating") {
      const r = c => { const m = managerAt(c.ref, leagues, world); return m ? m.rating : 0; };
      const best = Math.max(...pool.map(r));
      pool = pool.filter(c => r(c) === best);
    } else if (rule === "earliestCandidacy") {
      const first = Math.min(...pool.map(c => c.at || 0));
      pool = pool.filter(c => (c.at || 0) === first);
    } else if (rule === "draw") {
      // Tirage stable (même résultat si l'on recalcule) : empreinte de l'élection.
      const h = c => { let x = 2166136261; for (const ch of `${el.id}:${c.id}`) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };
      pool = [pool.slice().sort((a, b) => h(a) - h(b))[0]];
    }
  }
  return pool[0];
}
function closeElection(store, el, now, leagues, world) {
  const team = store.teams[el.teamId];
  // Candidats encore valables (même manager, toujours un club humain).
  const cands = validCandidates(el).filter(c => {
    const m = managerAt(c.ref, leagues, world);
    const ok = m && m.key === c.key && canRun(store, team, m) && mandatesOfKey(store, c.key).length < configOf(store).maxMandatesPerManager;
    if (!ok) { c.withdrawn = true; c.withdrawReason = "invalid"; }
    return ok;
  });
  // Votes encore valables (électeur toujours éligible, candidat toujours là).
  const counts = new Map(cands.map(c => [c.id, 0]));
  let voters = 0;
  Object.values(el.votes || {}).forEach(v => {
    if (!counts.has(v.c)) return;
    const m = managerAt(v.ref, leagues, world);
    if (!m || m.key !== v.k || !canVote(store, team, m)) return;
    counts.set(v.c, counts.get(v.c) + 1);
    voters++;
  });
  if (!cands.length) {
    el.status = "noCandidate";
    el.result = { at: now, winnerId: null, voters, candidates: 0, counts: [] };
    return null;
  }
  const max = Math.max(...counts.values());
  const tied = cands.filter(c => counts.get(c.id) === max);
  const winner = tied.length === 1 ? tied[0] : breakTie(store, el, tied, leagues, world);
  el.status = "closed";
  el.result = {
    at: now, winnerId: winner.id, voters, candidates: cands.length, tie: tied.length > 1,
    counts: cands.map(c => ({ id: c.id, votes: counts.get(c.id) })).sort((a, b) => b.votes - a.votes),
  };
  const mandate = {
    id: nextId(store, "m"), teamId: el.teamId, key: winner.key, ref: winner.ref,
    pseudo: winner.pseudo, clubName: winner.clubName, electionId: el.id, votes: counts.get(winner.id),
    fromSeason: el.mandate.fromSeason, toSeason: el.mandate.toSeason, startedAt: now, endedAt: null, endReason: null,
  };
  store.mandates.push(mandate);
  team.mandateId = mandate.id;
  notify(leagues, winner.ref, {
    key: `nat_elected_${mandate.id}`, title: `Vous êtes élu sélectionneur : ${teamLabel(el.teamId)}`,
    text: `${mandate.votes} voix. Mandat de la saison ${mandate.fromSeason} à la saison ${mandate.toSeason}.`,
  }, now);
  cands.filter(c => c.id !== winner.id).forEach(c => notify(leagues, c.ref, {
    key: `nat_lost_${el.id}`, title: `Élection ${teamLabel(el.teamId)} : résultat`,
    text: `${displayName(winner)} est élu sélectionneur (${mandate.votes} voix).`,
  }, now));
  return mandate;
}

// Passage du rattrapage du monde. Renvoie { changed, nextDeadlineAt }.
function step(store, leagues, world, now) {
  let changed = ensureTeams(store);
  const season = intlSeasonOf(leagues);
  const seasonStart = seasonStartOf(leagues);
  // Premier passage : le cycle commence à la saison suivante (ou à celle-ci
  // si l'on est encore dans sa première semaine).
  if (!store.config || typeof store.config.cycleStartSeason !== "number") {
    const inWeek1 = seasonStart != null && now >= seasonStart && now < seasonStart + 6 * DAY;
    store.config = { ...(store.config || {}), cycleStartSeason: inWeek1 ? season : season + 1 };
    changed = true;
  }
  const cfg = configOf(store);
  let nextDeadlineAt = null;
  const due = at => { if (at > now && (nextDeadlineAt == null || at < nextDeadlineAt)) nextDeadlineAt = at; };
  for (const team of Object.values(store.teams)) {
    // 1) Mandat en cours : terme, club perdu, inactivité.
    const m = activeMandate(store, team.id);
    if (m) {
      const cur = managerAt(m.ref, leagues, world);
      if (season > m.toSeason) changed = endMandate(store, m, "term", now, leagues) || changed;
      else if (!cur || cur.key !== m.key) changed = endMandate(store, m, "clubLost", now, leagues) || changed;
      else if (cur.lastSeenAt != null && now - cur.lastSeenAt > cfg.inactivityDays * DAY) changed = endMandate(store, m, "inactive", now, leagues) || changed;
      else {
        // Copies d'affichage rafraîchies (pseudo, club).
        if (cur.pseudo !== m.pseudo || cur.clubName !== m.clubName) { m.pseudo = cur.pseudo; m.clubName = cur.clubName; changed = true; }
        continue;
      }
    }
    // 2) Élection en cours : candidatures → vote → résultat.
    let el = currentElection(store, team.id);
    if (el && el.status === "candidacy" && now >= el.voteAt) {
      if (!validCandidates(el).length) { el.status = "noCandidate"; el.result = { at: now, winnerId: null, voters: 0, candidates: 0, counts: [] }; el = null; }
      else el.status = "vote";
      changed = true;
    }
    if (el && el.status === "vote" && now >= el.closesAt) {
      closeElection(store, el, now, leagues, world);
      changed = true;
      if (activeMandate(store, team.id)) continue;
      el = null;
    }
    // 3) Sans sélectionneur ni élection : élection pendant la 1re semaine
    // d'une saison d'élection de sa catégorie (une par saison au plus).
    const week1 = seasonStart != null && now >= seasonStart && now < seasonStart + cfg.candidacyMs + cfg.voteMs;
    const already = store.elections.some(e => e.teamId === team.id && e.season === season);
    if (!el && !activeMandate(store, team.id) && week1 && isElectionSeason(cfg, season, team.cat) && !already) {
      el = openElection(store, team, now, season, seasonStart);
      changed = true;
      notifyCountry(leagues, world, team.country, {
        key: `nat_open_${el.id}`, title: `Élection du sélectionneur : ${teamLabel(team.id)}`,
        text: "Les candidatures sont ouvertes. Présentez votre projet ou attendez le vote.",
      }, now);
    }
    if (el) due(el.status === "candidacy" ? el.voteAt : el.closesAt);
  }
  // Prochaine ouverture : début de la saison suivante (prochaine 1re semaine).
  if (seasonStart != null && now < seasonStart) due(seasonStart);
  // Groupes (intérim) : recalculés au plus toutes les heures.
  if (refreshSquads(store, leagues, world, now)) changed = true;
  // Phase B (server/nationalCoach.js) : vivier des sélectionneurs, gel des
  // convocations 3 jours avant le premier match, notifications en attente.
  const coach = require("./nationalCoach.js").step(store, leagues, world, now, season, seasonStart);
  if (coach.changed) changed = true;
  coach.due.forEach(due);
  // Phase C (server/nationalMatches.js) : groupes de qualification et
  // matchs des fenêtres internationales.
  const intl = require("./nationalMatches.js").step(store, leagues, world, now, season, seasonStart);
  if (intl.changed) changed = true;
  intl.due.forEach(due);
  // Historique borné : élections closes de plus de 2 cycles.
  if (store.elections.length > 400) { store.elections.splice(0, store.elections.length - 400); changed = true; }
  return { changed, nextDeadlineAt, pools: coach.pools };
}

// --- Groupe et calendrier ----------------------------------------------
const POSITIONS = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
function isEligible(cfg, team, p) {
  return p && p.nationality === team.country && (team.cat !== "U21" || (typeof p.age === "number" && p.age <= cfg.u21MaxAge));
}
function overallOf(p) {
  try { return typeof p.overall === "function" ? p.overall() : null; } catch (e) { return null; }
}
// Joueurs éligibles d'une sélection dans tous les championnats chargés
// (effectifs pros seulement : jamais l'académie).
function eligiblePlayers(cfg, team, leagues, world, now) {
  const out = [];
  const leagueIds = new Set();
  for (const [leagueId, lg] of leagues) {
    if (!lg || !Array.isArray(lg.teams)) continue;
    const entry = world && (world.leagues || []).find(e => e.id === leagueId);
    lg.teams.forEach((t, idx) => {
      if (!t || t.isGuest || !Array.isArray(t.players)) return;
      for (const p of t.players) {
        if (!isEligible(cfg, team, p)) continue;
        const ovr = overallOf(p);
        if (ovr == null) continue;
        leagueIds.add(leagueId);
        // `ovr` sert seulement au choix du groupe (jamais envoyé) ; `src` =
        // le joueur lui-même, transformé en fiche publique pour le groupe.
        out.push({
          id: p.id, name: p.name, position: p.position, age: p.age, ovr,
          club: {
            leagueId, idx, name: t.name, country: (entry && entry.country) || lg.country || null,
            division: entry ? divisionLabelOf(entry) : null,
            recovery: typeof t.conditionRecoveryPerDay === "function" ? t.conditionRecoveryPerDay() : null,
          },
          src: p,
        });
      }
    });
  }
  out.sort((a, b) => b.ovr - a.ovr || String(a.name).localeCompare(String(b.name)));
  return { players: out, leagues: leagueIds.size };
}
// Groupe de l'intérim : les 2 meilleurs à chaque poste, puis les meilleurs
// restants jusqu'à `size`.
function pickSquad(players, size) {
  const chosen = new Set();
  for (const pos of POSITIONS) players.filter(p => p.position === pos).slice(0, 2).forEach(p => chosen.add(p));
  for (const p of players) { if (chosen.size >= size) break; chosen.add(p); }
  return [...chosen].slice(0, size).sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || b.ovr - a.ovr);
}
// Fiche publique d'un joueur (comme la fiche d'un club d'un autre
// championnat, server/publicPlayers.js) : identité, âge, taille, salaire,
// forme physique, blessure, stats et journal des matchs de la saison en
// club. Jamais ses caractéristiques, son potentiel, sa motivation, sa note.
const SQUAD_PUBLIC_FIELDS = ["id", "name", "nationality", "position", "height", "age", "number", "look", "salary",
  "condition", "conditionUpdatedAt", "injuryType", "injuryUntil", "matchLog", "retiringAfterSeason", "homegrownClub", "clubSinceSeason"];
function publicSquadPlayer(x) {
  const PublicPlayers = require("./publicPlayers.js");
  // Liste blanche : seulement ce que le groupe affiche (léger à stocker).
  const src = JSON.parse(JSON.stringify(x.src));
  const pub = {};
  for (const k of SQUAD_PUBLIC_FIELDS) if (src[k] !== undefined) pub[k] = src[k];
  for (const k of PublicPlayers.HIDDEN_PLAYER_FIELDS.concat(PublicPlayers.FOREIGN_EXTRA_PLAYER_FIELDS)) delete pub[k];
  pub.attrsHidden = true;
  return { id: x.id, name: x.name, position: x.position, age: x.age, club: x.club, pub };
}
function refreshSquads(store, leagues, world, now, force = false) {
  const cfg = configOf(store);
  store.squads = store.squads || {};
  let changed = false;
  for (const team of Object.values(store.teams)) {
    const cur = store.squads[team.id];
    if (!force && cur && cur.v === 2 && now - cur.at < cfg.squadRefreshMs) continue;
    const el = eligiblePlayers(cfg, team, leagues, world, now);
    store.squads[team.id] = { v: 2, at: now, source: "interim", players: pickSquad(el.players, cfg.squadSize).map(publicSquadPlayer), eligible: el.players.length, leagues: el.leagues };
    changed = true;
  }
  return changed;
}
// Calendrier d'une saison : 3 fenêtres le dimanche + phase finale (lundi →
// dimanche de la dernière semaine). `calendarStartAt` = jour 0 (mardi).
function seasonCalendar(cfg, calendarStartAt, season, cat) {
  if (typeof calendarStartAt !== "number") return [];
  const Calendar = require("./calendar.js");
  // Jour 0 ramené au mardi de sa semaine (rythme hebdomadaire : la saison
  // démarre un mardi ; sinon, on se cale quand même sur la semaine).
  const p0 = Calendar.zonedLocalDateParts(calendarStartAt, "Europe/Paris");
  const wd = new Date(Date.UTC(p0.year, p0.month - 1, p0.day)).getUTCDay();
  const day0 = Calendar.addParisCalendarDays(p0, -((wd - 2 + 7) % 7));
  const at = day => { const d = Calendar.addParisCalendarDays(day0, day); return Calendar.zonedEpochForLocalTime("Europe/Paris", d.year, d.month, d.day, cfg.matchHour); };
  const pos = cyclePos(cfg, season, cat);
  const phase = pos >= 0 ? cfg.cycle[pos] : null;
  const out = (cfg.windowWeeks || []).map((w, i) => ({ kind: "window", n: i + 1, at: at(7 * (w - 1) + 5) }));
  if (phase) {
    const days = [];
    for (let d = 0; d < 7; d++) days.push(at(cfg.finalFirstDay + d));
    out.push({ kind: "final", comp: phase.kind, from: days[0], to: days[6], days });
  }
  return out;
}
function teamView(store, teamId, me, season, now, calendarStartAt) {
  ensureTeams(store);
  const team = store.teams[teamId];
  if (!team) return null;
  const cfg = configOf(store);
  const pos = cyclePos(cfg, season, team.cat);
  const el = currentElection(store, team.id);
  const sq = (store.squads || {})[team.id] || null;
  return {
    ok: true, season,
    team: { id: team.id, country: team.country, countryName: countryName(team.country), cat: team.cat },
    coach: publicMandate(activeMandate(store, team.id)),
    // Phase B : bouton « Gérer la sélection » pour le sélectionneur en poste.
    isCoach: !!(me && activeMandate(store, team.id) && activeMandate(store, team.id).key === me.key),
    election: el ? publicElection(store, el, me, false) : null,
    phase: pos >= 0 ? cfg.cycle[pos] : null,
    squad: sq ? { at: sq.at, source: sq.source, players: sq.players, eligible: sq.eligible, leagues: sq.leagues } : null,
    calendar: seasonCalendar(cfg, calendarStartAt, season, team.cat),
    coaches: store.mandates.filter(m => m.teamId === team.id).slice(-20).reverse().map(publicMandate),
    // Phase C : qualifications (groupe, classement, matchs) et résultats.
    qualif: require("./nationalMatches.js").qualifView(store, team.id, season),
    results: require("./nationalMatches.js").resultsOf(store, team.id).slice(0, 20), honours: [],
  };
}

// --- Actions des managers (routes) -----------------------------------------
function fail(error, status = 400) { return { ok: false, status, error }; }
function cleanText(v, max) { return String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, max); }

function runForElection(store, me, body, now) {
  const cfg = configOf(store);
  const team = store.teams[body && body.teamId];
  if (!team) return fail("Sélection inconnue.", 404);
  const el = currentElection(store, team.id);
  if (!el || el.status !== "candidacy") return fail("Les candidatures ne sont pas ouvertes pour cette sélection.");
  if (!me) return fail("Réservé aux managers.", 403);
  if (!canRun(store, team, me)) return fail("Vous ne remplissez pas les conditions pour vous présenter.", 403);
  if (el.candidates.some(c => c.key === me.key && !c.withdrawn)) return fail("Vous êtes déjà candidat.");
  const open = store.elections.filter(e => (e.status === "candidacy" || e.status === "vote") && e.candidates.some(c => c.key === me.key && !c.withdrawn));
  if (open.length >= cfg.maxCandidaciesPerManager) return fail("Vous êtes déjà candidat à une autre élection.");
  if (mandatesOfKey(store, me.key).length >= cfg.maxMandatesPerManager) return fail("Vous êtes déjà sélectionneur.");
  const title = cleanText(body.title, cfg.titleMax);
  const project = cleanText(body.project, cfg.projectMax);
  if (title.length < 3) return fail("Donnez un titre à votre projet.");
  if (project.length < 20) return fail("Décrivez votre projet (20 caractères au moins).");
  const cand = { id: nextId(store, "c"), key: me.key, ref: me.ref, pseudo: me.pseudo, clubName: me.clubName, country: me.country, division: me.division, title, project, at: now, withdrawn: false };
  el.candidates.push(cand);
  return { ok: true, electionId: el.id, candidateId: cand.id };
}
function withdrawCandidacy(store, me, body, now) {
  const el = store.elections.find(e => e.id === (body && body.electionId));
  if (!el || (el.status !== "candidacy" && el.status !== "vote")) return fail("Élection introuvable ou terminée.", 404);
  const c = me && el.candidates.find(x => x.key === me.key && !x.withdrawn);
  if (!c) return fail("Vous n'êtes pas candidat à cette élection.");
  c.withdrawn = true; c.withdrawnAt = now;
  // Électeurs de ce candidat : vote rendu (ils peuvent revoter).
  Object.keys(el.votes || {}).forEach(k => { if (el.votes[k].c === c.id) delete el.votes[k]; });
  return { ok: true };
}
function castVote(store, me, body, now) {
  const cfg = configOf(store);
  const el = store.elections.find(e => e.id === (body && body.electionId));
  if (!el) return fail("Élection introuvable.", 404);
  if (el.status !== "vote" || now < el.voteAt || now >= el.closesAt) return fail("Le vote n'est pas ouvert.");
  const team = store.teams[el.teamId];
  if (!me || !canVote(store, team, me)) return fail("Vous ne faites pas partie des électeurs de cette sélection.", 403);
  const cand = validCandidates(el).find(c => c.id === (body && body.candidateId));
  if (!cand) return fail("Candidat inconnu.");
  el.votes = el.votes || {};
  if (el.votes[me.key] && !cfg.allowVoteChange) return fail("Vous avez déjà voté (vote définitif).");
  el.votes[me.key] = { c: cand.id, at: now, k: me.key, ref: me.ref };
  return { ok: true };
}
function resign(store, me, body, now, leagues) {
  const m = activeMandate(store, body && body.teamId);
  if (!m || !me || m.key !== me.key) return fail("Vous n'êtes pas le sélectionneur de cette sélection.", 403);
  endMandate(store, m, "resigned", now, leagues);
  return { ok: true };
}
// Administration : destitution, annulation d'une élection.
function adminDismiss(store, teamId, now, leagues) {
  const m = activeMandate(store, teamId);
  if (!m) return fail("Aucun sélectionneur en fonction.", 404);
  endMandate(store, m, "dismissed", now, leagues);
  return { ok: true };
}
function adminCancelElection(store, electionId, now) {
  const el = store.elections.find(e => e.id === electionId && (e.status === "candidacy" || e.status === "vote"));
  if (!el) return fail("Élection introuvable ou terminée.", 404);
  el.status = "cancelled"; el.result = { at: now, cancelled: true };
  return { ok: true };
}

// --- Vues (navigateur) ---------------------------------------------------
function publicCandidate(c, full) {
  return {
    id: c.id, pseudo: c.pseudo, clubName: c.clubName, country: c.country, division: c.division,
    ref: c.ref, title: c.title, at: c.at, withdrawn: !!c.withdrawn, ...(full ? { project: c.project } : {}),
  };
}
function publicElection(store, el, me, full) {
  const team = store.teams[el.teamId];
  const closed = !(el.status === "candidacy" || el.status === "vote");
  const mine = me && el.votes && el.votes[me.key];
  return {
    id: el.id, teamId: el.teamId, country: team.country, cat: team.cat, status: el.status,
    opensAt: el.opensAt, voteAt: el.voteAt, closesAt: el.closesAt, mandate: el.mandate,
    candidates: el.candidates.filter(c => full || !c.withdrawn).map(c => publicCandidate(c, full)),
    // Décompte : seulement une fois le scrutin clos.
    voterCount: Object.keys(el.votes || {}).length,
    result: closed ? el.result : null,
    me: me ? {
      canVote: !!canVote(store, team, me), canRun: !!canRun(store, team, me),
      votedFor: mine ? mine.c : null, candidateId: (el.candidates.find(c => c.key === me.key && !c.withdrawn) || {}).id || null,
    } : null,
  };
}
function publicMandate(m) {
  return m ? { id: m.id, teamId: m.teamId, pseudo: m.pseudo, clubName: m.clubName, ref: m.ref, fromSeason: m.fromSeason, toSeason: m.toSeason, startedAt: m.startedAt, endedAt: m.endedAt, endReason: m.endReason, votes: m.votes } : null;
}
function overview(store, me, season, now) {
  ensureTeams(store);
  const cfg = configOf(store);
  const pos = Math.max(0, cyclePos(cfg, season, "A"));
  const teams = Object.values(store.teams).sort((a, b) => countryName(a.country).localeCompare(countryName(b.country), "fr") || a.cat.localeCompare(b.cat)).map(t => {
    const el = currentElection(store, t.id);
    const p = cyclePos(cfg, season, t.cat);
    // Prochaine saison d'élection de cette sélection.
    let nextElection = season;
    while (!isElectionSeason(cfg, nextElection, t.cat) || nextElection < season) nextElection++;
    if (nextElection === season && !el && store.elections.some(e => e.teamId === t.id && e.season === season)) { nextElection++; while (!isElectionSeason(cfg, nextElection, t.cat)) nextElection++; }
    return {
      id: t.id, country: t.country, countryName: countryName(t.country), cat: t.cat,
      coach: publicMandate(activeMandate(store, t.id)), election: el ? publicElection(store, el, me, false) : null,
      phase: p >= 0 ? cfg.cycle[p] : null, nextElectionSeason: nextElection,
    };
  });
  const recent = store.elections.filter(e => e.result && e.result.at && now - e.result.at < 7 * DAY && e.status === "closed").map(e => publicElection(store, e, me, false));
  return {
    ok: true, season, cycle: { pos, phase: cfg.cycle[pos], length: cfg.cycle.length, mandateSeasons: cfg.mandateSeasons, startSeason: cfg.cycleStartSeason, categoryOffset: cfg.categoryOffset },
    teams, recentResults: recent,
    me: me ? { myMandates: mandatesOfKey(store, me.key).map(publicMandate), country: me.country } : null,
    history: store.mandates.filter(m => m.endedAt).slice(-60).map(publicMandate),
  };
}

module.exports = {
  STORE_NAME, CATEGORIES, DEFAULT_CONFIG, emptyStore, isValidStore, configOf, loadStore, saveStore,
  teamIdOf, teamLabel, countryName, intlSeasonOf, cyclePos, isElectionSeason, mandateEndSeason, seasonStartOf, ensureTeams,
  managerOf, managerAt, notify, evalRule, canVote, canRun, activeMandate, mandatesOfKey, endMandate,
  openElection, currentElection, closeElection, breakTie, step,
  runForElection, withdrawCandidacy, castVote, resign, adminDismiss, adminCancelElection,
  publicElection, publicMandate, overview,
  POSITIONS, isEligible, eligiblePlayers, pickSquad, publicSquadPlayer, refreshSquads, seasonCalendar, teamView,
};
