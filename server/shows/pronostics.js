/*
 * pronostics.js — Hoop Manager · Pronostics et classement mondial
 *
 * - publishQuestions : enregistre les questions d'une émission + l'heure de verrouillage
 * - submit           : enregistre / modifie les réponses d'un joueur AVANT le verrouillage
 * - resolve          : calcule les bonnes réponses à partir des matchs terminés,
 *                      attribue les points (idempotent : une émission n'est résolue qu'une fois)
 * - leaderboard      : classement mondial d'une saison (top + ma position)
 * - seasonWinner     : n°1 de la saison (lot : 1 mois de Premium)
 *
 * AUCUN EFFET SUR L'ÉCONOMIE DU JEU : ces points sont séparés de l'argent des clubs.
 *
 * Le stockage est abstrait : { get(key), set(key, value) } (sync ou async).
 * Par défaut : mémoire (Map). À remplacer par la persistance du serveur (fichier JSON,
 * base de données…). Voir INTEGRATION.md.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./showData'));
  else root.HoopPronostics = factory(root.HoopShowData);
})(typeof self !== 'undefined' ? self : this, function (ShowData) {
  'use strict';

  const DEFAULTS = {
    pointsPerCorrect: 10,
  };

  function memoryStore() {
    const m = new Map();
    return {
      get: (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : undefined),
      set: (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); },
    };
  }

  class PronosticError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }

  function createPronosticsService(options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    const store = opts.store || memoryStore();
    const now = () => (opts.now ? opts.now() : Date.now());
    const K = {
      show: (id) => 'pr:show:' + id,
      sub: (id, u) => 'pr:sub:' + id + ':' + u,
      subs: (id) => 'pr:subs:' + id,
      lb: (season) => 'pr:lb:' + season,
    };

    async function publishQuestions(showId, { season, lockAt, questions }) {
      if (!showId || !Array.isArray(questions) || !questions.length) throw new PronosticError('bad_request', 'questions manquantes');
      const existing = await store.get(K.show(showId));
      if (existing && existing.resolved) return existing; // déjà terminé : on ne touche plus
      const rec = {
        showId, season: season != null ? String(season) : 'default', lockAt: lockAt || null,
        questions: questions.map((q) => ({ id: q.id, kind: q.kind, matchId: q.matchId, line: q.line, label: q.label, options: q.options.map((o) => ({ id: String(o.id), label: o.label })) })),
        resolved: false, correct: null,
      };
      await store.set(K.show(showId), rec);
      return rec;
    }

    async function getShow(showId) { return store.get(K.show(showId)); }

    async function submit({ userId, showId, answers }) {
      if (!userId) throw new PronosticError('bad_request', 'userId manquant');
      const show = await store.get(K.show(showId));
      if (!show) throw new PronosticError('not_found', 'émission inconnue');
      if (show.resolved) throw new PronosticError('locked', 'pronostics terminés');
      if (show.lockAt && now() >= show.lockAt) throw new PronosticError('locked', 'pronostics verrouillés');
      const clean = {};
      for (const q of show.questions) {
        const a = answers && answers[q.id];
        if (a == null) continue;
        if (!q.options.some((o) => o.id === String(a))) throw new PronosticError('bad_answer', 'réponse invalide pour ' + q.id);
        clean[q.id] = String(a);
      }
      if (!Object.keys(clean).length) throw new PronosticError('bad_request', 'aucune réponse');
      const prev = await store.get(K.sub(showId, userId));
      const rec = { userId, showId, answers: clean, at: now() };
      await store.set(K.sub(showId, userId), rec);
      if (!prev) {
        const list = (await store.get(K.subs(showId))) || [];
        list.push(userId);
        await store.set(K.subs(showId), list);
      }
      return rec;
    }

    async function getSubmission(showId, userId) { return store.get(K.sub(showId, userId)); }

    /**
     * @param {string} showId
     * @param {Object<string,string|null>} correct  questionId → bonne option (null = question annulée)
     *        Utiliser resolveQuestions(questions, matchesById) pour le calculer.
     */
    async function resolve(showId, correct) {
      const show = await store.get(K.show(showId));
      if (!show) throw new PronosticError('not_found', 'émission inconnue');
      if (show.resolved) return { alreadyResolved: true, results: [] };
      const users = (await store.get(K.subs(showId))) || [];
      const lb = (await store.get(K.lb(show.season))) || {};
      const results = [];
      for (const u of users) {
        const sub = await store.get(K.sub(showId, u));
        if (!sub) continue;
        let good = 0, answered = 0;
        for (const q of show.questions) {
          const c = correct[q.id];
          if (c == null || sub.answers[q.id] == null) continue; // question annulée ou non répondue
          answered++;
          if (String(c) === sub.answers[q.id]) good++;
        }
        // Tout le monde est à égalité : pas de bonus lié aux pubs.
        const points = good * opts.pointsPerCorrect;
        const row = lb[u] || { userId: u, points: 0, correct: 0, answered: 0, shows: 0, updatedAt: 0 };
        row.points += points; row.correct += good; row.answered += answered; row.shows += 1; row.updatedAt = now();
        lb[u] = row;
        sub.result = { good, answered, points };
        await store.set(K.sub(showId, u), sub);
        results.push({ userId: u, good, answered, points });
      }
      await store.set(K.lb(show.season), lb);
      show.resolved = true; show.correct = correct; show.resolvedAt = now();
      await store.set(K.show(showId), show);
      return { alreadyResolved: false, results };
    }

    function sortRows(rows) {
      // points ↓, bonnes réponses ↓, moins de réponses (meilleure précision) ↑, le plus ancien à ce total ↑
      return rows.sort((a, b) => b.points - a.points || b.correct - a.correct || a.answered - b.answered || a.updatedAt - b.updatedAt);
    }

    async function leaderboard(season, { limit = 50, userId } = {}) {
      const lb = (await store.get(K.lb(String(season)))) || {};
      const rows = sortRows(Object.values(lb)).map((r, i) => Object.assign({ rank: i + 1 }, r));
      return { total: rows.length, top: rows.slice(0, limit), me: userId ? rows.find((r) => r.userId === userId) || null : null };
    }

    async function seasonWinner(season) {
      const { top } = await leaderboard(season, { limit: 1 });
      return top[0] || null;
    }

    return { publishQuestions, getShow, submit, getSubmission, resolve, leaderboard, seasonWinner, options: opts };
  }

  /* --------------------------------------------------------- résolution */

  /** Bonne réponse d'une question, à partir du match TERMINÉ (événements complets). null = annulée. */
  function resolveQuestion(q, match) {
    if (!match) return null;
    if (q.kind === 'secondHalfWinner') {
      const b = ShowData.boxScore(match, { fromQuarter: 3 }); // 3e, 4e quart-temps et prolongations
      const h = b.teams[match.homeId].pts, a = b.teams[match.awayId].pts;
      return h === a ? null : String(h > a ? match.homeId : match.awayId);
    }
    const full = ShowData.boxScore(match);
    const h = full.teams[match.homeId].pts, a = full.teams[match.awayId].pts;
    switch (q.kind) {
      case 'matchWinner': return h === a ? null : String(h > a ? match.homeId : match.awayId);
      case 'totalPoints': return h + a === q.line ? null : h + a > q.line ? 'over' : 'under';
      case 'margin': {
        const d = Math.abs(h - a);
        if (d === 0) return null;
        return d <= 5 ? '1-5' : d <= 10 ? '6-10' : '11+';
      }
      case 'topScorer': {
        // Le joueur qui marque le plus PARMI LES CHOIX proposés. Égalité → annulée.
        const pts = q.options.map((o) => ({ id: String(o.id), pts: (full.players[o.id] && full.players[o.id].pts) || 0 }));
        pts.sort((x, y) => y.pts - x.pts);
        if (pts.length > 1 && pts[0].pts === pts[1].pts) return null;
        return pts[0].id;
      }
      default: return null;
    }
  }

  /** @returns {Object<string,string|null>} questionId → bonne réponse */
  function resolveQuestions(questions, matchesById) {
    const out = {};
    for (const q of questions) out[q.id] = resolveQuestion(q, matchesById[q.matchId]);
    return out;
  }

  return { createPronosticsService, resolveQuestion, resolveQuestions, memoryStore, PronosticError, DEFAULTS };
});
