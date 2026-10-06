/* Mémoire historique des franchises (2026-10-06, maquette validée).
   Module partagé serveur (require) / navigateur (window.HM_HISTORY).

   Règle : aucune histoire inventée. Chaque événement naît d'un fait du jeu
   (résultat, trophée, transfert, retraite, record…) au moment où il se
   produit ; la narration ne fait que relire ces événements.

   - Journal : les événements sont mis en file (`queue`) par le moteur, puis
     rangés À PART de la ligue, un journal par club (server/store.js :
     appendClubHistory), pour ne jamais alourdir la sauvegarde de la ligue.
   - Rivalités : Team.rivalryScores[clé du club adverse] = { name, s (0-100),
     season, w, l, created, moments: [{ season, type, text }] }, partagées
     (les deux clubs sont mis à jour ensemble), avec déclin entre saisons.
   - Légendes : calculées à partir de Team.allTimePlayers (matchs, points,
     saisons, titres, distinctions, formé au club). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HM_HISTORY = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TYPES = {
    FIRST_TITLE: "Premier titre", TITLE: "Titre", FINAL_LOSS: "Finale perdue", PLAYOFF_UPSET: "Exploit en play-offs",
    BUZZER_BEATER: "Buzzer-beater", RECORD: "Record de franchise", LEGEND_CREATED: "Nouvelle légende",
    LEGEND_RETIREMENT: "Retraite d'une légende", MAJOR_TRANSFER: "Transfert majeur", CONTROVERSIAL_TRANSFER: "Transfert controversé",
    RIVALRY_CREATED: "Naissance d'une rivalité", RIVALRY_MATCH: "Match de rivalité", COACH_LEGACY: "Fin d'une ère",
    YOUTH_GRADUATE: "Formé au club", COMEBACK: "Remontée", HISTORICAL_GAME: "Match historique",
  };

  const CFG = {
    clubMax: 400,               // événements gardés par club
    queueMax: 3000,
    rivalryDecay: 0.85,         // par « saison » (rivalryDecayMs) sans épisode
    rivalryDecayMs: 45 * 24 * 3600 * 1000,
    rivalryCreatedAt: 40,       // seuil de « naissance » d'une rivalité
    comebackMin: 15,            // retard comblé par le vainqueur
    buzzerSeconds: 3,           // dernier panier gagnant dans les 3 dernières secondes
    majorTransferFee: 750000,
    legendTiers: [[450, "Légende"], [250, "Joueur emblématique"], [120, "Joueur important"]],
    recordMinGames: 10,         // pas de « record » tant que le club n'a pas d'histoire
  };

  const clubKey = name => String(name || "").trim().toLowerCase();
  let seq = 0;
  const queue = [];

  // Événement au format du journal (voir la spec : event_id, season, date,
  // event_type, importance 1-4, team_ids, player_ids, coach_ids,
  // competition, match_id, description, statistics, rivalry_impact,
  // records_affected, historical_tags).
  function makeEvent(o) {
    const at = o.at || Date.now();
    seq = (seq + 1) % 1e6;
    return {
      event_id: at.toString(36) + "-" + seq.toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36),
      season: o.season || null, date: at, event_type: o.type, importance: Math.max(1, Math.min(4, o.importance || 1)),
      team_ids: (o.teams || []).filter(Boolean), player_ids: (o.players || []).filter(Boolean), coach_ids: (o.coaches || []).filter(Boolean),
      competition: o.competition || null, match_id: o.matchId || null, description: o.description || TYPES[o.type] || o.type,
      statistics: o.statistics || null, rivalry_impact: o.rivalryImpact || 0, records_affected: o.records || [], historical_tags: o.tags || [],
    };
  }
  function push(o) {
    const ev = makeEvent(o);
    queue.push(ev);
    if (queue.length > CFG.queueMax) queue.splice(0, queue.length - CFG.queueMax);
    return ev;
  }
  function drain() { return queue.splice(0); }
  // Rangement par club (clé = nom en minuscules) : un événement partagé va
  // dans le journal des deux clubs.
  function byClub(events) {
    const out = {};
    (events || []).forEach(ev => (ev.team_ids || []).forEach(n => { const k = clubKey(n); (out[k] = out[k] || []).push(ev); }));
    return out;
  }
  function mergeClubLog(list, events) {
    const seen = new Set((list || []).map(e => e.event_id));
    const out = (list || []).concat((events || []).filter(e => !seen.has(e.event_id)));
    out.sort((a, b) => a.date - b.date);
    return out.slice(-CFG.clubMax);
  }

  // ---------------------------------------------------------------------
  // Match : ce qui s'est réellement passé, lu dans le fil des événements
  // du moteur (score courant à chaque action, quart-temps, horloge).
  function secondsLeft(clock) {
    const m = /^(\d+):(\d+)$/.exec(String(clock || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function dramaFromEvents(events, finalA, finalB) {
    if (!Array.isArray(events) || !events.length || finalA === finalB) return null;
    const winA = finalA > finalB;
    let prevA = 0, prevB = 0, maxDeficit = 0, lastQ = 0;
    let last = null;
    events.forEach(ev => {
      if (!ev || !ev.score) return;
      if (ev.quarter > lastQ) lastQ = ev.quarter;
      const a = ev.score.A, b = ev.score.B;
      const deficit = winA ? b - a : a - b;
      if (deficit > maxDeficit) maxDeficit = deficit;
      if (a !== prevA || b !== prevB) last = { ev, beforeA: prevA, beforeB: prevB };
      prevA = a; prevB = b;
    });
    let buzzer = null;
    if (last && last.ev.quarter === lastQ) {
      const left = secondsLeft(last.ev.clock);
      const winnerWasAhead = winA ? last.beforeA > last.beforeB : last.beforeB > last.beforeA;
      const scorerSide = last.ev.score.A !== last.beforeA ? "A" : "B";
      if (left != null && left <= CFG.buzzerSeconds && !winnerWasAhead && (scorerSide === "A") === winA) {
        buzzer = { side: scorerSide, playerId: last.ev.shooterId || last.ev.playerId || null, player: last.ev.shooter || last.ev.player || null, clock: last.ev.clock, quarter: last.ev.quarter };
      }
    }
    return { winner: winA ? "A" : "B", maxDeficit, overtimes: Math.max(0, lastQ - 4), buzzer };
  }
  // Mémorisé par graine (simulateOrForfeit → recordMatchStatsAndAwardMvp).
  const dramaBySeed = new Map();
  function rememberDrama(seed, drama) {
    if (seed == null || !drama) return;
    dramaBySeed.set(seed, drama);
    if (dramaBySeed.size > 500) dramaBySeed.delete(dramaBySeed.keys().next().value);
  }
  function takeDrama(seed) {
    if (seed == null) return null;
    const d = dramaBySeed.get(seed) || null;
    dramaBySeed.delete(seed);
    return d;
  }

  // ---------------------------------------------------------------------
  // Rivalités émergentes (0-100), partagées entre les deux clubs.
  function rivalryLabel(s) {
    return s >= 85 ? "Légendaire" : s >= 65 ? "Intense" : s >= 40 ? "Forte" : s >= 20 ? "Modérée" : "Faible";
  }
  // Déclin au temps réel (les clubs IA n'ont pas de numéro de saison à eux).
  const decayed = (s, from, now) => from && now > from ? s * Math.pow(CFG.rivalryDecay, (now - from) / CFG.rivalryDecayMs) : s;
  function rivalryEntry(team, opp, now) {
    team.rivalryScores = team.rivalryScores && typeof team.rivalryScores === "object" ? team.rivalryScores : {};
    const k = clubKey(opp.name);
    const r = team.rivalryScores[k] || { name: opp.name, s: 0, at: now, w: 0, l: 0, created: false, moments: [] };
    r.s = Math.round(decayed(r.s, r.at, now) * 10) / 10;
    r.name = opp.name; r.at = now;
    team.rivalryScores[k] = r;
    return r;
  }
  // `pts` : intensité ajoutée ; `moment` : { type, text } gardé (5 au plus)
  // pour la narration. Renvoie true si la rivalité vient de « naître ».
  function bumpRivalry(a, b, pts, now, season, moment, result) {
    if (!a || !b || a === b) return false;
    const ra = rivalryEntry(a, b, now), rb = rivalryEntry(b, a, now);
    const s = Math.min(100, Math.max(ra.s, rb.s) + pts);
    ra.s = rb.s = Math.round(s * 10) / 10;
    if (result === "a") { ra.w++; rb.l++; } else if (result === "b") { ra.l++; rb.w++; }
    if (moment) {
      ra.moments = [{ season, ...moment }].concat(ra.moments || []).slice(0, 5);
      rb.moments = [{ season, ...moment }].concat(rb.moments || []).slice(0, 5);
    }
    if (!ra.created && s >= CFG.rivalryCreatedAt) {
      ra.created = rb.created = true;
      push({ type: "RIVALRY_CREATED", importance: 3, season, at: now, teams: [a.name, b.name], description: `Naissance d'une rivalité : ${a.name} – ${b.name}`, rivalryImpact: pts, statistics: { score: Math.round(s), w: ra.w, l: ra.l } });
      return true;
    }
    return false;
  }
  function rivalryOf(team, oppName, now) {
    const r = team && team.rivalryScores && team.rivalryScores[clubKey(oppName)];
    if (!r) return null;
    const s = decayed(r.s, r.at, now || Date.now());
    return { ...r, s: Math.round(s), label: rivalryLabel(s) };
  }

  // ---------------------------------------------------------------------
  // Légendes : score de carrière au club → palier.
  function legendScore(e) {
    if (!e) return 0;
    const seasons = Array.isArray(e.seasons) ? e.seasons.length : (e.seasons || 0);
    return Math.round((e.games || 0) + (e.pts || 0) / 25 + seasons * 12 + (e.titles || 0) * 30 + (e.awards || 0) * 15 + (e.homegrown ? 20 : 0));
  }
  function legendTier(e) {
    const s = legendScore(e);
    for (let i = 0; i < CFG.legendTiers.length; i++) if (s >= CFG.legendTiers[i][0]) return { rank: CFG.legendTiers.length - i, label: CFG.legendTiers[i][1], score: s };
    return null;
  }
  function legendsOf(allTimePlayers) {
    return Object.values(allTimePlayers || {}).map(e => ({ ...e, tier: legendTier(e) })).filter(e => e.tier)
      .sort((a, b) => b.tier.score - a.tier.score);
  }

  // ---------------------------------------------------------------------
  // Narration (seulement à partir de faits enregistrés). `ctx` : { me,
  // opp (Team), season, oppPlayers }. Renvoie des phrases ; vide si rien.
  function prematchLines(me, opp, now) {
    const out = [];
    if (!me || !opp) return out;
    const r = rivalryOf(me, opp.name, now);
    // Retour d'un ancien joueur marquant du club.
    (opp.players || []).forEach(p => {
      const e = me.allTimePlayers && me.allTimePlayers[p.id];
      const t = e && legendTier(e);
      if (t) out.push(`${p.name} (${t.label.toLowerCase()} de ${me.name}) affronte son ancien club.`);
    });
    if (r) {
      const last = (r.moments || []).find(m => m.type === "FINAL" || m.type === "SERIES");
      if (last) out.push(last.text);
      if (r.s >= 20) out.push(`Rivalité ${r.label.toLowerCase()} (${r.s}/100) · ${r.w} V – ${r.l} D pour ${me.name}.`);
      else if (r.w + r.l >= 3) out.push(`Bilan face à ${opp.name} : ${r.w} V – ${r.l} D.`);
    }
    return out;
  }

  return {
    TYPES, CFG, clubKey, makeEvent, push, drain, byClub, mergeClubLog, queue,
    dramaFromEvents, rememberDrama, takeDrama,
    rivalryLabel, rivalryEntry, bumpRivalry, rivalryOf,
    legendScore, legendTier, legendsOf, prematchLines,
  };
});
