// =====================================================================
// HOOP SHOWS — orchestration serveur (émissions avant-match/mi-temps +
// pronostics). Voir DEV_NOTES.md point 11, hoop-shows/INTEGRATION.md.
//
// Construit les émissions À LA DEMANDE (fonctions pures de
// server/shows/showData.js — "quelques millisecondes par émission" par
// construction du prestataire) plutôt que de les mettre en cache : plus
// simple, pas d'invalidation à gérer, et l'échelle de ce jeu (quelques
// dizaines de joueurs par ligue partagée au plus) rend le coût de
// reconstruction négligeable. À revisiter si ça devient un jour un vrai
// problème de performance (pas constaté à ce stade).
//
// Persistance des pronostics : `league.showsPronostics` (voir
// engine.js:serializeLeague/leagueFromSave) — la MÊME sauvegarde JSON que le
// reste de la ligue, jamais un fichier/une base séparée (DEV_NOTES.md point
// 11, exigence explicite). TOUT ce fichier est délibérément SYNCHRONE : ce
// serveur (server/index.js) n'a que des handlers HTTP natifs sans
// framework, et deux points d'appel critiques (la résolution des
// pronostics à la finalisation d'une journée, voir resolveRoundShowsSync ;
// l'octroi du lot de fin de saison, voir grantSeasonPrizeSync) sont
// eux-mêmes appelés SYNCHRONES depuis server/liveMatch.js/server/autoSim.js.
// server/shows/pronostics.js (livré par le prestataire, `store` abstrait
// {get,set} enveloppé dans des Promises pour supporter un store distant
// plus tard) N'EST DONC PAS utilisé tel quel ici pour les MUTATIONS : un
// appel "fire-and-forget" à une fonction `async` depuis du code synchrone ne
// garantit PAS que la mutation soit appliquée avant que l'appelant ne
// sérialise/sauvegarde la ligue juste après (les continuations `await` sont
// mises en file de micro-tâches, qui ne se vide qu'une fois la pile d'appels
// SYNCHRONE entièrement retombée — potentiellement APRÈS le point de
// sauvegarde). Les fonctions ci-dessous lisent/écrivent donc DIRECTEMENT
// `league.showsPronostics`, avec EXACTEMENT les mêmes clés et la même
// logique que server/shows/pronostics.js (`pr:show:<id>`/`pr:subs:<id>`/
// `pr:sub:<id>:<user>`/`pr:lb:<saison>`, même formule de points) — testé
// indépendamment contre le fichier livré (voir hoop_shows_test.js) pour
// rester en phase avec lui. server/shows/pronostics.js reste copié tel quel
// dans le dépôt (voir INTEGRATION.md, "le reste se copie tel quel") pour
// référence/tests de sa propre logique pure (resolveQuestion notamment,
// repris à l'identique côté Adapter), simplement pas instancié ici via
// createPronosticsService.
// =====================================================================
const Calendar = require("./calendar.js");
const { HALFTIME_BREAK_MS } = require("./liveMatch.js");
const ShowData = require("./shows/showData.js");
const Pronostics = require("./shows/pronostics.js");
const Adapter = require("./showsAdapter.js");

const POINTS_PER_CORRECT = Pronostics.DEFAULTS.pointsPerCorrect;

// Fenêtre de verrouillage des compositions avant le coup d'envoi (retour
// utilisateur : "il faudra bloquer les compos quelques minutes avant le
// match") — hoop-shows/INTEGRATION.md §2/§4 précise EXPLICITEMENT "5 min"
// ("compos verrouillées 5 min avant le coup d'envoi", "T − 5 min
// (verrouillage des compos)") : valeur reprise telle quelle, pas une
// estimation de Claude. Exportée pour être réutilisée à l'identique côté
// client (voir moteurbasket3.html:renderOrdresGrid) — UNE SEULE source de
// vérité pour cette fenêtre.
const LINEUP_LOCK_BEFORE_KICKOFF_MS = 5 * 60 * 1000;

// Lot de fin de saison pour le vainqueur du classement mondial des
// pronostics (retour utilisateur : "1 mois de Premium") — 30 jours, valeur
// raisonnable pour "1 mois" en l'absence d'une notion calendaire de mois
// dans le jeu (qui ne connaît que des jours/semaines réels) ; à ajuster si
// Antony préfère une autre convention (28/31 jours).
const SEASON_PRIZE_PREMIUM_MS = 30 * 24 * 60 * 60 * 1000;

// Clé de saison pour le classement mondial des pronostics — pas de vrai
// compteur de "saison N" dans le modèle actuel (voir DEV_NOTES.md point 10,
// même constat déjà fait pour le tableau de bord : `club.season` figé à 1) —
// reprend la MÊME convention placeholder ici plutôt que d'en inventer une
// nouvelle : "1" tant que le jeu ne compte pas vraiment les saisons.
function currentSeasonKey() { return "1"; }

function storeRoot(league) {
  if (!league.showsPronostics || typeof league.showsPronostics !== "object") league.showsPronostics = {};
  return league.showsPronostics;
}

// --------------------------------------------------------------- fenêtres
function prematchWindowOpen(now, kickoffAt) {
  return typeof kickoffAt === "number" && now >= kickoffAt - LINEUP_LOCK_BEFORE_KICKOFF_MS;
}

// Vrai si MAINTENANT tombe dans (ou après) la fenêtre de verrouillage des
// compos — voir moteurbasket3.html:renderOrdresGrid, seul consommateur.
function lineupLocked(now, kickoffAt) {
  return typeof kickoffAt === "number" && now >= kickoffAt - LINEUP_LOCK_BEFORE_KICKOFF_MS;
}

// --------------------------------------------------------------- publication
// Publie (si pas déjà fait/résolu) les questions d'une émission — même
// sémantique que server/shows/pronostics.js:publishQuestions (idempotent),
// version synchrone directe sur `league.showsPronostics`.
function publishQuestionsSync(league, showId, { season, lockAt, questions }, now) {
  const root = storeRoot(league);
  const key = "pr:show:" + showId;
  const existing = root[key];
  if (existing && existing.resolved) return existing;
  if (existing) return existing; // déjà publiée (même question set attendu, jamais réécrite)
  const rec = {
    showId, season: season != null ? String(season) : "default", lockAt: lockAt || null,
    questions: questions.map(q => ({ id: q.id, kind: q.kind, matchId: q.matchId, line: q.line, label: q.label, options: q.options.map(o => ({ id: String(o.id), label: o.label })) })),
    resolved: false, correct: null,
  };
  root[key] = rec;
  return rec;
}

// --------------------------------------------------------------- construction
// Construit (si la fenêtre est ouverte) et publie les pronostics de
// l'émission avant-match de `teamIdx` pour `round`. Renvoie `null` si la
// fenêtre n'est pas encore ouverte (404 côté route, voir INTEGRATION.md §5).
function getPrematchShow(league, teamIdx, round, now) {
  const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, round);
  if (!prematchWindowOpen(now, kickoffAt)) return null;
  const input = Adapter.buildPrematchInput(league, teamIdx, round, kickoffAt);
  const show = ShowData.buildPrematchShow(input);
  if (show.pronostics) {
    publishQuestionsSync(league, show.pronostics.showId, { season: currentSeasonKey(), lockAt: show.pronostics.lockAt, questions: show.pronostics.questions }, now);
  }
  return show;
}

// Équivalent pour la mi-temps — "ouverte" dès le tout début de la pause de
// mi-temps déjà calculée par schedulePlayback (voir
// Adapter.buildHalftimeInput/halftimeResumeAt : `resumeAt` non nul
// UNIQUEMENT si le match est en direct et sa pause déjà calculée), jusqu'à
// la reprise elle-même. `null` (404) si `teamIdx` n'a pas de match en
// direct cette journée, ou si sa pause de mi-temps n'a pas commencé.
function getHalftimeShow(league, teamIdx, round, now) {
  const input = Adapter.buildHalftimeInput(league, teamIdx, round);
  if (!input.resumeAt || now < (input.resumeAt - HALFTIME_BREAK_MS) || now >= input.resumeAt) return null;
  const show = ShowData.buildHalftimeShow(input);
  if (show.pronostics) {
    publishQuestionsSync(league, show.pronostics.showId, { season: currentSeasonKey(), lockAt: show.pronostics.lockAt, questions: show.pronostics.questions }, now);
  }
  return show;
}

// --------------------------------------------------------------- pronostics (lecture/écriture)
// Envoi des réponses d'un manager — même validations que
// server/shows/pronostics.js:submit (émission connue, pas résolue, pas
// verrouillée, réponses parmi les options proposées), version synchrone
// directe. `userId` = TOUJOURS `String(teamIndex)` (voir son commentaire
// dans resolveRoundShowsSync/grantSeasonPrizeSync).
function submitPronosticsSync(league, teamIndex, showId, answers, now) {
  const root = storeRoot(league);
  const show = root["pr:show:" + showId];
  if (!show) return { ok: false, error: "Émission inconnue." };
  if (show.resolved) return { ok: false, error: "Pronostics terminés." };
  if (show.lockAt && now >= show.lockAt) return { ok: false, error: "Pronostics verrouillés." };
  const clean = {};
  for (const q of show.questions) {
    const a = answers && answers[q.id];
    if (a == null) continue;
    if (!q.options.some(o => o.id === String(a))) return { ok: false, error: `Réponse invalide pour ${q.id}.` };
    clean[q.id] = String(a);
  }
  if (!Object.keys(clean).length) return { ok: false, error: "Aucune réponse." };
  const userId = String(teamIndex);
  const subKey = "pr:sub:" + showId + ":" + userId;
  const prev = root[subKey];
  const rec = { userId, showId, answers: clean, at: now };
  root[subKey] = rec;
  if (!prev) {
    const listKey = "pr:subs:" + showId;
    const list = root[listKey] || [];
    list.push(userId);
    root[listKey] = list;
  }
  return { ok: true, submission: rec };
}

function getSubmissionSync(league, teamIndex, showId) {
  const root = storeRoot(league);
  return root["pr:sub:" + showId + ":" + String(teamIndex)] || null;
}

function leaderboardSync(league, season, { userId, limit = 50 } = {}) {
  const root = storeRoot(league);
  const lb = root["pr:lb:" + String(season)] || {};
  const rows = Object.values(lb).sort((a, b) => b.points - a.points || b.correct - a.correct || a.answered - b.answered || a.updatedAt - b.updatedAt)
    .map((r, i) => Object.assign({ rank: i + 1 }, r));
  return { total: rows.length, top: rows.slice(0, limit), me: userId ? (rows.find(r => r.userId === userId) || null) : null };
}

// --------------------------------------------------------------- résolution
// Résout, pour CHAQUE équipe humaine, les pronostics avant-match ET mi-temps
// déjà publiés pour cette journée de CHAMPIONNAT (no-op si jamais publiés —
// un manager qui n'a pas ouvert l'émission n'a simplement aucune question à
// résoudre). Appelée depuis server/liveMatch.js:finalizeRound, juste après
// qu'une journée entière a été réglée (voir le grand commentaire d'en-tête
// de fichier pour pourquoi c'est SYNCHRONE). `results` :
// `{homeIdx, awayIdx, scoreHome, scoreAway, quarterScores}` construite par
// l'appelant pendant sa PROPRE boucle de finalisation (voir
// Adapter.resolveShowQuestion, qui n'a besoin que de ce résumé, jamais des
// événements bruts déjà jetés à ce stade). Entièrement défensive (try/catch
// autour de CHAQUE émission) : un souci ici ne doit JAMAIS empêcher la
// finalisation d'une journée de match, qui reste la priorité absolue (voir
// DEV_NOTES.md, prudence sur tout ce qui touche à la diffusion en direct).
function resolveRoundShowsSync(league, round, results, now = Date.now()) {
  if (!results || !results.length) return;
  const root = storeRoot(league);

  const resultsById = new Map();
  results.forEach(r => {
    resultsById.set(Adapter.matchId(round, r.homeIdx, r.awayIdx), {
      homeIdx: r.homeIdx, awayIdx: r.awayIdx, scoreHome: r.scoreHome, scoreAway: r.scoreAway,
      quarterScores: r.quarterScores,
      topScorerByPlayerId: Adapter.topScorerMapForMatch(league, round, "championship", r.homeIdx, r.awayIdx),
    });
  });

  const humanTeamIdxs = league.teams.map((t, i) => (t.isHuman ? i : -1)).filter(i => i >= 0);
  for (const kind of ["pm", "ht"]) {
    for (const teamIdx of humanTeamIdxs) {
      const showId = [kind, "main", round + 1, String(teamIdx)].join(":");
      try {
        const show = root["pr:show:" + showId];
        if (!show || show.resolved) continue;
        const correct = {};
        show.questions.forEach(q => { correct[q.id] = Adapter.resolveShowQuestion(q, resultsById.get(q.matchId)); });
        const users = root["pr:subs:" + showId] || [];
        const lb = root["pr:lb:" + show.season] || {};
        users.forEach(u => {
          const sub = root["pr:sub:" + showId + ":" + u];
          if (!sub) return;
          let good = 0, answered = 0;
          show.questions.forEach(q => {
            const c = correct[q.id];
            if (c == null || sub.answers[q.id] == null) return;
            answered++;
            if (String(c) === sub.answers[q.id]) good++;
          });
          const points = good * POINTS_PER_CORRECT;
          const row = lb[u] || { userId: u, points: 0, correct: 0, answered: 0, shows: 0, updatedAt: 0 };
          row.points += points; row.correct += good; row.answered += answered; row.shows += 1; row.updatedAt = now;
          lb[u] = row;
          sub.result = { good, answered, points };
          root["pr:sub:" + showId + ":" + u] = sub;
        });
        root["pr:lb:" + show.season] = lb;
        show.resolved = true; show.correct = correct; show.resolvedAt = now;
        root["pr:show:" + showId] = show;
      } catch (e) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(`[hoop-shows] résolution ${showId} échouée : ${e && e.message}`);
        }
      }
    }
  }
}

// --------------------------------------------------------------- lot de saison
// Accorde 1 mois de Premium (voir Team.grantTemporaryPremium) au vainqueur du
// classement mondial des pronostics de la saison — appelée depuis
// server/autoSim.js au moment où l'événement "season-end" est émis. Aucun
// effet si personne n'a jamais soumis le moindre pronostic cette saison.
function grantSeasonPrizeSync(league, now = Date.now()) {
  try {
    const { top } = leaderboardSync(league, currentSeasonKey(), { limit: 1 });
    const winner = top[0];
    if (!winner) return null;
    // `winner.userId` est l'identifiant utilisé au moment de submit() (voir
    // submitPronosticsSync ci-dessus) : TOUJOURS `String(teamIndex)`.
    const idx = Number(winner.userId);
    const team = Number.isInteger(idx) ? league.teams[idx] : null;
    if (!team) return null;
    team.grantTemporaryPremium(SEASON_PRIZE_PREMIUM_MS, now);
    return { teamIdx: idx, points: winner.points };
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) console.warn(`[hoop-shows] lot de saison échoué : ${e && e.message}`);
    return null;
  }
}

module.exports = {
  LINEUP_LOCK_BEFORE_KICKOFF_MS, SEASON_PRIZE_PREMIUM_MS,
  lineupLocked, prematchWindowOpen, currentSeasonKey,
  getPrematchShow, getHalftimeShow,
  submitPronosticsSync, getSubmissionSync, leaderboardSync,
  resolveRoundShowsSync, grantSeasonPrizeSync,
};
