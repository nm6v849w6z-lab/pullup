// =====================================================================
// DYNAMIQUE DE GROUPE (« Vestiaire », 2026-10-06) — module PARTAGÉ entre
// engine.js (require) et moteurbasket3.html (window.HM_VESTIAIRE), même
// convention que assets/achievements.js. Voir docs/dynamique-de-groupe.md.
//
// Principe : AUCUN système parallèle. Tout est calculé à partir des données
// existantes du jeu :
//   - Team.chemistry (cohésion, 40-100, seul écrivain applyChemistryDelta),
//   - Player.form (motivation / moral individuel : frustration du banc,
//     interviews, demandes de transfert, contrats),
//   - attributs mentaux (leadership...), âge, nationalité, ancienneté
//     (clubSinceSeason), formés au club (homegrownClub), tutorat
//     (Team.mentorships), compo officielle (lineup), matchLog, blessures.
// Une seule donnée persistée en plus, Team.locker :
//   history   : un relevé par semaine (cohésion, moral, satisfaits/frustrés)
//               pour la tendance et la courbe — impossible à recalculer après
//               coup (26 semaines max) ;
//   log       : les derniers événements de vestiaire (40 max), qui expliquent
//               le « pourquoi » ;
//   last      : l'état compact de chaque joueur la semaine précédente, pour
//               DÉTECTER les événements par différence (arrivée, perte de
//               place, blessure, prolongation...) sans brancher chaque action ;
//   relations : uniquement les liens forts nés de l'histoire réelle (tutorat,
//               concurrence au poste, titulaires ensemble), 40 paires max,
//               effacées une fois retombées à 0 ; le reste est recalculé.
// Effets en retour (bornés, jamais d'emballement) : voir weeklyUpdate.
// =====================================================================
(function (root) {
  "use strict";

  const POSITIONS = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
  const MENTAL = ["decision", "focus", "composure", "anticipation", "determination", "leadership", "discipline", "vision"];
  const HISTORY_MAX = 26;
  const LOG_MAX = 40;
  const RELATIONS_MAX = 40;
  const RELATION_KEEP = 1; // |v| minimal conservé (retombée à 0 = oubliée)
  const CHEM_MIN = 40;
  const EDGE_MIN = 0.4;
  const GROUP_MAX = 6;
  const RECENT_MATCHES = 5;
  // Seuils de moral (Player.form) — alignés sur la demande de transfert
  // (TRANSFER_REQUEST_MOTIVATION_THRESHOLD = 20) et « Démotivé » (25).
  const MOOD_LEVELS = [
    { min: 70, key: "happy", label: "Épanoui" },
    { min: 52, key: "content", label: "Satisfait" },
    { min: 38, key: "neutral", label: "Mitigé" },
    { min: 22, key: "frustrated", label: "Frustré" },
    { min: -1, key: "unhappy", label: "Malheureux" },
  ];
  const LEVELS = {
    leader: { label: "Leader", order: 0 },
    cadre: { label: "Cadre", order: 1 },
    important: { label: "Joueur important", order: 2 },
    member: { label: "Membre", order: 3 },
    young: { label: "Jeune / nouveau", order: 4 },
    marginal: { label: "Marginalisé", order: 5 },
  };
  const STATE_LEVELS = [
    { min: 78, key: "united", label: "Vestiaire uni" },
    { min: 63, key: "good", label: "Bonne ambiance" },
    { min: 48, key: "ok", label: "Ambiance correcte" },
    { min: 35, key: "tense", label: "Vestiaire tendu" },
    { min: -1, key: "crisis", label: "Vestiaire en crise" },
  ];
  // Effets en retour, par semaine (voir weeklyUpdate).
  // Renforcés le 2026-10-06 (retour utilisateur : « ne peut-on pas avoir
  // un peu plus d'influence ? »), toujours bornés.
  const PLAYTIME_FORM_GAIN = 3;        // joueur qui a vraiment joué, moral bas
  const PLAYTIME_FORM_CAP = 65;        // ... jusqu'à ce plafond seulement
  const PLAYTIME_MIN_SECONDS = 20 * 60; // ~20 min cumulées dans la semaine
  const CONTAGION_MAX = 2;             // |delta| d'alchimie max par semaine
  const LEADER_FORM_EFFECT = 1;        // un leader épanoui relève les frustrés, un leader en rupture tire son groupe vers le bas
  const LEADER_HAPPY_FORM = 65;
  const LEADER_DOWN_FORM = 30;
  const LEADER_PULL_FLOOR = 25;        // jamais sous ce seuil par l'effet du leader (demande de transfert à 20)

  const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round1 = v => Math.round(v * 10) / 10;
  const sid = v => String(v);
  const pairKey = (a, b) => (sid(a) < sid(b) ? `${sid(a)}|${sid(b)}` : `${sid(b)}|${sid(a)}`);

  function seasonOf(team) { return ((team && team.seasonHistory) || []).length + 1; }
  function overallOf(p) { return typeof p.overall === "function" ? p.overall() : num(p.ovr, 50); }
  function attr(p, k) { return num(p && p.attrs && p.attrs[k], 50); }
  function mentalAvg(p) { return MENTAL.reduce((s, k) => s + attr(p, k), 0) / MENTAL.length; }
  function isInjured(p, now) { return typeof p.injuryUntil === "number" && now < p.injuryUntil; }
  function moodOf(form) { const f = num(form, 50); return MOOD_LEVELS.find(l => f >= l.min); }
  function stateOf(score) { return STATE_LEVELS.find(l => score >= l.min); }

  // ---------------------------------------------------------------------
  // Donnée persistée : création / nettoyage tolérant (sauvegardes anciennes,
  // joueurs partis, valeurs corrompues).
  // ---------------------------------------------------------------------
  function emptyLocker() { return { history: [], log: [], last: null, relations: {} }; }
  function sanitize(data) {
    const out = emptyLocker();
    if (!data || typeof data !== "object") return out;
    if (Array.isArray(data.history)) {
      out.history = data.history.filter(h => h && Number.isFinite(h.w)).slice(-HISTORY_MAX)
        .map(h => ({ w: h.w, s: num(h.s, 1), chem: num(h.chem, 50), mood: num(h.mood, 50), score: num(h.score, 50), sat: num(h.sat, 0), frus: num(h.frus, 0), n: num(h.n, 0) }));
    }
    if (Array.isArray(data.log)) {
      out.log = data.log.filter(e => e && typeof e.t === "string").slice(0, LOG_MAX)
        .map(e => ({ t: e.t, w: num(e.w, 0), s: num(e.s, 1), ...(e.p != null ? { p: e.p } : {}), ...(e.n ? { n: String(e.n) } : {}), ...(e.q != null ? { q: e.q } : {}), ...(e.m ? { m: String(e.m) } : {}), ...(e.x != null ? { x: e.x } : {}) }));
    }
    if (data.last && typeof data.last === "object" && data.last.p && typeof data.last.p === "object") {
      const p = {};
      Object.entries(data.last.p).forEach(([k, v]) => { if (Array.isArray(v)) p[k] = v.slice(0, 7); });
      out.last = { w: num(data.last.w, 0), s: num(data.last.s, 1), p, ment: Array.isArray(data.last.ment) ? data.last.ment.map(String) : [], streak: num(data.last.streak, 0) };
    }
    if (data.relations && typeof data.relations === "object") {
      Object.entries(data.relations).forEach(([k, r]) => {
        if (!/^[^|]+\|[^|]+$/.test(k) || !r || !Number.isFinite(r.v)) return;
        out.relations[k] = { v: clamp(Math.round(r.v), -100, 100), since: num(r.since, 0), why: typeof r.why === "string" ? r.why : "" };
      });
      trimRelations(out.relations);
    }
    if (data.coach && typeof data.coach === "object") out.coach = sanitizeCoach(data.coach);
    return out;
  }
  function ensure(team) {
    if (!team.locker || typeof team.locker !== "object" || !Array.isArray(team.locker.log)) team.locker = sanitize(team.locker);
    return team.locker;
  }
  function serialize(team) {
    const l = team && team.locker;
    if (!l) return emptyLocker();
    return JSON.parse(JSON.stringify({ history: l.history || [], log: l.log || [], last: l.last || null, relations: l.relations || {}, ...(l.coach ? { coach: l.coach } : {}) }));
  }
  function trimRelations(rel) {
    Object.keys(rel).forEach(k => { if (Math.abs(rel[k].v) < RELATION_KEEP) delete rel[k]; });
    const keys = Object.keys(rel);
    if (keys.length > RELATIONS_MAX) {
      keys.sort((a, b) => Math.abs(rel[a].v) - Math.abs(rel[b].v));
      keys.slice(0, keys.length - RELATIONS_MAX).forEach(k => delete rel[k]);
    }
  }
  function pushLog(team, ev) {
    const l = ensure(team);
    l.log.unshift({ w: num(team.week, 0), s: seasonOf(team), ...ev });
    if (l.log.length > LOG_MAX) l.log.length = LOG_MAX;
  }

  // ---------------------------------------------------------------------
  // Contexte de calcul (une passe sur l'effectif, réutilisée par toutes les
  // vues) : rangs, minutes récentes, rôles, tutorats.
  // ---------------------------------------------------------------------
  function roleOf(team, p) {
    const starters = (team.lineup && team.lineup.starters) || {};
    if (POSITIONS.some(pos => starters[pos] != null && sid(starters[pos]) === sid(p.id))) return "starter";
    const backups = (team.lineup && team.lineup.backupPositions) || {};
    return (backups[p.id] || []).length ? "rotation" : "reserve";
  }
  function recentMinutes(team, p) {
    const log = (Array.isArray(p.matchLog) ? p.matchLog : []).filter(m => m && (!m.team || m.team === team.name) && m.competition !== "national");
    const last = log.slice(-RECENT_MATCHES);
    return { avg: last.length ? last.reduce((s, m) => s + num(m.min), 0) / last.length : 0, games: last.length, starts: last.filter(m => m.starter).length };
  }
  function buildContext(team, opts = {}) {
    const now = num(opts.now, Date.now());
    const season = seasonOf(team);
    const players = (team.players || []).filter(Boolean);
    const sorted = [...players].sort((a, b) => overallOf(b) - overallOf(a));
    const rank = new Map(sorted.map((p, i) => [sid(p.id), i + 1]));
    const minutes = new Map(players.map(p => [sid(p.id), recentMinutes(team, p)]));
    const maxMin = Math.max(1, ...[...minutes.values()].map(m => m.avg));
    const club = String(team.name || "").trim().toLowerCase();
    const mentors = new Map(); const mentees = new Map();
    (team.mentorships || []).forEach(m => {
      if (!m) return;
      mentors.set(sid(m.veteranId), sid(m.youngId));
      mentees.set(sid(m.youngId), sid(m.veteranId));
    });
    const natCount = {};
    players.forEach(p => { if (p.nationality) natCount[p.nationality] = (natCount[p.nationality] || 0) + 1; });
    const mainNat = Object.entries(natCount).sort((a, b) => b[1] - a[1])[0];
    const maxLead = Math.max(1, ...players.map(p => attr(p, "leadership")));
    return {
      team, now, season, players, rank, minutes, maxMin, maxLead, club, mentors, mentees,
      mainNat: mainNat ? mainNat[0] : null,
      byId: new Map(players.map(p => [sid(p.id), p])),
      role: new Map(players.map(p => [sid(p.id), roleOf(team, p)])),
      relations: ((team.locker && team.locker.relations) || {}),
      nationName: opts.nationName || null,
    };
  }
  function tenureOf(ctx, p) {
    return typeof p.clubSinceSeason === "number" ? Math.max(0, ctx.season - p.clubSinceSeason) : 1;
  }
  function isHomegrown(ctx, p) { return !!(p.homegrownClub && p.homegrownClub === ctx.club); }
  function bigGamesThisSeason(ctx, p) {
    return (Array.isArray(p.historyLog) ? p.historyLog : []).filter(e => e && e.type === "game" && e.season === ctx.season && (!e.team || e.team === ctx.team.name)).length;
  }

  // ---------------------------------------------------------------------
  // Joueur : influence (0-100), satisfaction et raisons, attente de rôle.
  // ---------------------------------------------------------------------
  function influenceOf(ctx, p) {
    const id = sid(p.id);
    const rank = ctx.rank.get(id) || ctx.players.length;
    const parts = {
      // Relatif à l'effectif : le plus fort leadership du groupe vaut 30.
      leadership: attr(p, "leadership") / ctx.maxLead * 30,
      minutes: (ctx.minutes.get(id) || { avg: 0 }).avg / ctx.maxMin * 20,
      tenure: Math.min(4, tenureOf(ctx, p)) / 4 * 15,
      age: clamp((num(p.age, 25) - 20) / 12, 0, 1) * 10,
      rank: clamp(1 - (rank - 1) / 11, 0, 1) * 10,
      homegrown: isHomegrown(ctx, p) ? 5 : 0,
      mentor: ctx.mentors.has(id) ? 5 : 0,
      bigGames: Math.min(3, bigGamesThisSeason(ctx, p)) / 3 * 5,
    };
    return { value: Math.round(Object.values(parts).reduce((s, v) => s + v, 0)), parts };
  }
  function expectedRole(ctx, p) {
    const r = ctx.rank.get(sid(p.id)) || 99;
    return r <= 5 ? "starter" : r <= 9 ? "rotation" : "reserve";
  }
  const ROLE_ORDER = { starter: 0, rotation: 1, reserve: 2 };
  function satisfactionOf(ctx, p) {
    const id = sid(p.id);
    const form = num(p.form, 50);
    const role = ctx.role.get(id);
    const expected = expectedRole(ctx, p);
    const min = ctx.minutes.get(id) || { avg: 0, games: 0 };
    const reasons = [];
    if (p.transferRequestActive) reasons.push({ key: "request", tone: -1, text: "Demande son transfert" });
    if (isInjured(p, ctx.now)) reasons.push({ key: "injury", tone: -1, text: "Blessé, à l'écart du groupe" });
    if (ROLE_ORDER[role] > ROLE_ORDER[expected]) reasons.push({ key: "role", tone: -1, text: expected === "starter" ? "Se voit titulaire" : "Attend plus de temps de jeu" });
    else if (ROLE_ORDER[role] < ROLE_ORDER[expected]) reasons.push({ key: "role", tone: 1, text: "Rôle au-dessus de ses attentes" });
    else if (role === "starter") reasons.push({ key: "role", tone: 1, text: "Titulaire indiscutable" });
    if (min.games >= 2 && min.avg >= 24) reasons.push({ key: "minutes", tone: 1, text: "Beaucoup de temps de jeu" });
    else if (min.games >= 2 && min.avg < 6 && role !== "starter") reasons.push({ key: "minutes", tone: -1, text: "Joue très peu" });
    if (p.retiringAfterSeason) reasons.push({ key: "retire", tone: 0, text: "Dernière saison annoncée" });
    if (typeof p.contractUntilSeason === "number" && p.contractUntilSeason <= ctx.season) reasons.push({ key: "contract", tone: 0, text: "Fin de contrat cette saison" });
    if (ctx.mentees.has(id)) reasons.push({ key: "mentee", tone: 1, text: "Encadré par un ancien" });
    const mood = moodOf(form);
    return { form: Math.round(form), mood: mood.key, label: mood.label, role, expected, minutes: round1(min.avg), reasons };
  }

  // ---------------------------------------------------------------------
  // Hiérarchie automatique.
  // ---------------------------------------------------------------------
  function hierarchy(ctx) {
    const rows = ctx.players.map(p => ({ p, inf: influenceOf(ctx, p), sat: satisfactionOf(ctx, p) }));
    rows.sort((a, b) => b.inf.value - a.inf.value || (ctx.rank.get(sid(a.p.id)) - ctx.rank.get(sid(b.p.id))));
    // Hiérarchie RELATIVE au groupe : il y a toujours un leader s'il existe
    // un joueur éligible (ni marginalisé, ni jeune/nouveau) ; un second
    // seulement s'il pèse presque autant ; puis 3 cadres au plus.
    let leaders = 0, cadres = 0, top = 0;
    rows.forEach(r => {
      const p = r.p;
      const id = sid(p.id);
      const young = num(p.age, 25) <= 21 || (typeof p.clubSinceSeason === "number" && p.clubSinceSeason === ctx.season && tenureOf(ctx, p) === 0 && r.sat.role !== "starter");
      const marginal = p.transferRequestActive || (num(p.form, 50) < 30 && r.sat.role !== "starter") || (r.sat.role === "reserve" && r.sat.minutes < 3 && num(p.form, 50) < 45 && !young);
      let level;
      if (!marginal && !young && r.inf.value > 0 && (leaders === 0 || (leaders === 1 && r.inf.value >= top * 0.92))) { level = "leader"; leaders++; top = top || r.inf.value; }
      else if (!marginal && !young && cadres < 3 && top && r.inf.value >= top * 0.7 && num(p.age, 25) >= 23) { level = "cadre"; cadres++; }
      else if (marginal) level = "marginal";
      else if (r.sat.role === "starter" || (ctx.rank.get(id) || 99) <= 7) level = "important";
      else if (young) level = "young";
      else level = "member";
      r.level = level;
    });
    return rows;
  }

  // ---------------------------------------------------------------------
  // Affinités (structurelles + relation persistée) et groupes émergents.
  // ---------------------------------------------------------------------
  function affinity(ctx, a, b) {
    const why = [];
    let v = 0;
    const ida = sid(a.id), idb = sid(b.id);
    if (a.nationality && a.nationality === b.nationality && a.nationality !== ctx.mainNat) { v += 0.35; why.push("nation"); }
    else if (a.nationality && a.nationality === b.nationality) { v += 0.1; }
    if (Math.abs(num(a.age, 25) - num(b.age, 25)) <= 3) { v += 0.25; why.push("age"); }
    const ta = tenureOf(ctx, a), tb = tenureOf(ctx, b);
    if (ta >= 2 && tb >= 2) { v += 0.2; why.push("tenure"); }
    else if (ta === 0 && tb === 0) { v += 0.15; why.push("newcomers"); }
    if (isHomegrown(ctx, a) && isHomegrown(ctx, b)) { v += 0.2; why.push("homegrown"); }
    if (ctx.mentors.get(ida) === idb || ctx.mentors.get(idb) === ida) { v += 0.3; why.push("mentor"); }
    const ra = ctx.role.get(ida), rb = ctx.role.get(idb);
    if (ra === "starter" && rb === "starter") { v += 0.15; why.push("starters"); }
    if (a.position === b.position && ra !== rb && (ra === "starter" || rb === "starter")) { v -= 0.25; why.push("rivals"); }
    const rel = ctx.relations[pairKey(ida, idb)];
    if (rel) { v += rel.v / 100 * 0.6; why.push(rel.v > 0 ? "history+" : "history-"); }
    return { v: round1(clamp(v, -1, 1.5)), why, rel: rel ? rel.v : 0 };
  }
  const WHY_TEXT = {
    nation: "même nationalité", age: "même génération", tenure: "anciens du club", newcomers: "arrivés ensemble",
    homegrown: "formés au club", mentor: "tutorat", starters: "titulaires ensemble", rivals: "concurrents au même poste",
    "history+": "vécu commun", "history-": "contentieux",
  };
  function allPairs(ctx) {
    const out = [];
    const ps = ctx.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const af = affinity(ctx, ps[i], ps[j]);
      out.push({ a: ps[i], b: ps[j], ...af });
    }
    return out;
  }
  function components(ids, edges, min) {
    const adj = new Map(ids.map(id => [id, []]));
    edges.forEach(e => { if (e.v >= min && adj.has(e.ia) && adj.has(e.ib)) { adj.get(e.ia).push(e.ib); adj.get(e.ib).push(e.ia); } });
    const seen = new Set(); const out = [];
    ids.forEach(id => {
      if (seen.has(id)) return;
      const comp = []; const stack = [id]; seen.add(id);
      while (stack.length) { const c = stack.pop(); comp.push(c); adj.get(c).forEach(n => { if (!seen.has(n)) { seen.add(n); stack.push(n); } }); }
      out.push(comp);
    });
    return out;
  }
  function detectGroups(ctx, pairs, rows) {
    const edges = pairs.map(e => ({ ia: sid(e.a.id), ib: sid(e.b.id), v: e.v, why: e.why }));
    const result = [];
    const split = (ids, min) => {
      components(ids, edges, min).forEach(comp => {
        if (comp.length < 2) return;
        if (comp.length > GROUP_MAX && min < 1.2) split(comp, round1(min + 0.1));
        else if (comp.length <= GROUP_MAX) result.push(comp);
      });
    };
    split(ctx.players.map(p => sid(p.id)), EDGE_MIN);
    const levelOf = new Map(rows.map(r => [sid(r.p.id), r]));
    const used = new Set();
    return result.map(ids => {
      const members = ids.map(id => ctx.byId.get(id));
      const inner = edges.filter(e => ids.includes(e.ia) && ids.includes(e.ib) && e.v >= EDGE_MIN);
      const whyCount = {};
      inner.forEach(e => e.why.forEach(w => { whyCount[w] = (whyCount[w] || 0) + 1; }));
      const mood = members.reduce((s, p) => s + num(p.form, 50), 0) / members.length;
      const influence = ids.reduce((s, id) => s + ((levelOf.get(id) || {}).inf || { value: 0 }).value, 0);
      const head = [...ids].sort((x, y) => ((levelOf.get(y) || {}).inf || { value: 0 }).value - ((levelOf.get(x) || {}).inf || { value: 0 }).value)[0];
      const name = groupName(ctx, members, whyCount, ctx.byId.get(head), used);
      used.add(name);
      const strength = inner.length ? inner.reduce((s, e) => s + e.v, 0) / inner.length : 0;
      const status = mood < 38 ? { key: "frustrated", label: "Groupe frustré" } : strength >= 0.75 ? { key: "tight", label: "Soudé" } : { key: "ok", label: "Proches" };
      return {
        id: ids.slice().sort().join("-"), name, ids, head, mood: Math.round(mood), influence,
        strength: round1(strength), status,
        bonds: Object.entries(whyCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => WHY_TEXT[k] || k),
      };
    }).sort((a, b) => b.influence - a.influence);
  }
  function groupName(ctx, members, why, head, used) {
    const n = members.length;
    const share = k => (why[k] || 0) / Math.max(1, n - 1);
    const avgAge = members.reduce((s, p) => s + num(p.age, 25), 0) / n;
    const allNat = members.every(p => p.nationality && p.nationality === members[0].nationality);
    const cands = [];
    if (allNat && members[0].nationality !== ctx.mainNat) {
      const nat = members[0].nationality;
      const label = typeof ctx.nationName === "function" ? (ctx.nationName(nat) || nat.toUpperCase()) : nat.toUpperCase();
      cands.push({ name: `Le clan ${label}` });
    }
    if (share("mentor") > 0 && n === 2) cands.push({ name: "Le duo mentor-élève" });
    if (members.every(p => isHomegrown(ctx, p))) cands.push({ name: "Les enfants du club" });
    if (share("starters") >= 1 && members.every(p => ctx.role.get(sid(p.id)) === "starter")) cands.push({ name: "Le cinq majeur" });
    if (avgAge >= 29) cands.push({ name: "Les anciens" });
    if (avgAge <= 22.5) cands.push({ name: "La jeune garde" });
    if (members.every(p => tenureOf(ctx, p) === 0)) cands.push({ name: "Les nouveaux venus" });
    if (members.every(p => ctx.role.get(sid(p.id)) !== "starter")) cands.push({ name: "Le banc" });
    cands.push({ name: head ? `Le cercle de ${String(head.name || "").split(" ").slice(-1)[0]}` : "Un groupe" });
    const pick = cands.find(c => !used.has(c.name)) || cands[cands.length - 1];
    return pick.name;
  }

  // ---------------------------------------------------------------------
  // État global.
  // ---------------------------------------------------------------------
  function confidenceOf(team, recent) {
    const streak = num(team.chemistryResultStreak, 0);
    let c = 50 + clamp(streak, -5, 5) * 7;
    if (Array.isArray(recent) && recent.length) {
      const wins = recent.filter(r => r && r.won).length;
      c = 0.5 * c + 0.5 * (20 + 60 * wins / recent.length);
    }
    return Math.round(clamp(c, 5, 95));
  }
  function moodScore(rows) {
    if (!rows.length) return 50;
    const w = rows.reduce((s, r) => s + 10 + r.inf.value, 0);
    return Math.round(rows.reduce((s, r) => s + num(r.p.form, 50) * (10 + r.inf.value), 0) / w);
  }
  // Cohésion = l'alchimie telle qu'affichée partout ailleurs (40-100) : le
  // score global est la moyenne pondérée des trois jauges VISIBLES (retour
  // utilisateur 2026-10-06 : « vestiaire tendu à 36 alors que les briques ne
  // sont jamais sous 40 »).
  function cohesionScore(team) {
    return Math.round(clamp(num(team.chemistry, 50), CHEM_MIN, 100));
  }
  function overallScore(cohesion, mood, confidence) {
    return Math.round(0.4 * cohesion + 0.4 * mood + 0.2 * confidence);
  }

  // ---------------------------------------------------------------------
  // Vue complète de l'onglet (pure, aucune écriture).
  // opts : { now, recent: [{ won, margin }] }
  // ---------------------------------------------------------------------
  function buildView(team, opts = {}) {
    const ctx = buildContext(team, opts);
    const rows = hierarchy(ctx);
    const pairs = allPairs(ctx);
    const groups = detectGroups(ctx, pairs, rows);
    const groupOf = new Map();
    groups.forEach(g => g.ids.forEach(id => groupOf.set(id, g.id)));
    const cohesion = cohesionScore(team);
    const mood = moodScore(rows);
    const confidence = confidenceOf(team, opts.recent);
    const score = overallScore(cohesion, mood, confidence);
    const state = stateOf(score);
    const locker = (team.locker && Array.isArray(team.locker.history)) ? team.locker : emptyLocker();
    const hist = locker.history;
    const ref = hist.length >= 3 ? hist[hist.length - 3] : hist[0];
    const delta = ref ? score - num(ref.score, score) : 0;
    const trend = !ref ? { key: "new", label: "Pas encore d'historique" } : delta >= 4 ? { key: "up", label: "En progrès" } : delta <= -4 ? { key: "down", label: "En baisse" } : { key: "flat", label: "Stable" };

    const players = rows.map(r => ({
      id: r.p.id, name: r.p.name, age: r.p.age, position: r.p.position, nationality: r.p.nationality || null,
      level: r.level, levelLabel: LEVELS[r.level].label, influence: r.inf.value, influenceParts: r.inf.parts,
      leadership: Math.round(attr(r.p, "leadership")), mental: Math.round(mentalAvg(r.p)),
      group: groupOf.get(sid(r.p.id)) || null, injured: isInjured(r.p, ctx.now),
      transferRequest: !!r.p.transferRequestActive, ...r.sat,
    }));
    const byId = new Map(players.map(p => [sid(p.id), p]));
    // Une concurrence au même poste n'est une TENSION que si elle se vit mal
    // (remplaçant frustré) ou s'il y a un contentieux : deux concurrents
    // satisfaits ne se disputent pas (retour utilisateur 2026-10-06).
    const realTension = e => e.rel <= -10 || (e.why.includes("rivals") &&
      [e.a, e.b].some(p => ctx.role.get(sid(p.id)) !== "starter" && num(p.form, 50) < 45));
    const relations = pairs
      .map(e => ({ e, kind: e.v >= 0.6 ? "good" : (e.v < 0 && realTension(e)) ? "tension" : "neutral" }))
      .filter(({ e, kind }) => kind !== "neutral" || Math.abs(e.rel) >= 15)
      .map(({ e, kind }) => ({ a: e.a.id, b: e.b.id, v: e.v, kind, why: e.why.map(w => WHY_TEXT[w] || w), history: e.rel }))
      .sort((x, y) => Math.abs(y.v) - Math.abs(x.v)).slice(0, 30);

    const problems = []; const positives = [];
    const leaders = players.filter(p => p.level === "leader");
    players.filter(p => p.transferRequest).forEach(p => problems.push({ key: "request", sev: 3, player: p.id, text: `${p.name} demande son transfert`, action: "talk" }));
    leaders.filter(p => p.form < 40).forEach(p => problems.push({ key: "leader-down", sev: 3, player: p.id, text: `${p.name}, leader du vestiaire, est ${p.label.toLowerCase()}`, action: "profile" }));
    const frustrated = players.filter(p => !p.transferRequest && (p.mood === "frustrated" || p.mood === "unhappy"));
    if (frustrated.length) problems.push({ key: "frustrated", sev: frustrated.length >= 3 ? 2 : 1, players: frustrated.map(p => p.id), text: frustrated.length === 1 ? `${frustrated[0].name} est ${frustrated[0].label.toLowerCase()} (${(frustrated[0].reasons.find(x => x.tone < 0) || { text: "moral en berne" }).text.toLowerCase()})` : `${frustrated.length} joueurs frustrés ou malheureux`, action: "lineup" });
    const rivals = relations.filter(r => r.kind === "tension").slice(0, 2);
    rivals.forEach(r => problems.push({ key: "tension", sev: r.v <= -0.4 ? 2 : 1, players: [r.a, r.b], text: `Tension entre ${byId.get(sid(r.a)).name} et ${byId.get(sid(r.b)).name} (${r.why.filter(w => w === WHY_TEXT.rivals || w === WHY_TEXT["history-"]).join(", ") || "rivalité"})`, action: "lineup" }));
    groups.filter(g => g.status.key === "frustrated").forEach(g => problems.push({ key: "group", sev: 2, players: g.ids, text: `${g.name} : groupe frustré`, action: "lineup" }));
    if (num(team.chemistryResultStreak) <= -3) problems.push({ key: "streak", sev: 2, text: `${-team.chemistryResultStreak} défaites de suite pèsent sur le groupe` });
    if (cohesion < 50) problems.push({ key: "cohesion", sev: 2, text: "Le groupe manque de repères (cohésion faible)" });
    if (!leaders.length && players.length >= 5) problems.push({ key: "no-leader", sev: 1, text: "Aucun leader naturel dans le vestiaire" });

    leaders.filter(p => p.form >= 52).forEach(p => positives.push({ key: "leader", player: p.id, text: `${p.name} tient le vestiaire` }));
    if (num(team.chemistryResultStreak) >= 3) positives.push({ key: "streak", text: `${team.chemistryResultStreak} victoires de suite : le groupe y croit` });
    if (cohesion >= 80) positives.push({ key: "cohesion", text: "Groupe très soudé" });
    const happy = players.filter(p => p.mood === "happy" || p.mood === "content").length;
    if (players.length && happy / players.length >= 0.6) positives.push({ key: "happy", text: `${happy} joueurs sur ${players.length} satisfaits de leur situation` });
    if ((team.mentorships || []).length) positives.push({ key: "mentor", text: `${team.mentorships.length} tutorat${team.mentorships.length > 1 ? "s" : ""} en cours entre anciens et jeunes` });
    groups.filter(g => g.status.key === "tight").slice(0, 1).forEach(g => positives.push({ key: "group", players: g.ids, text: `${g.name} : un noyau soudé` }));
    problems.sort((a, b) => b.sev - a.sev);

    return {
      state: { key: state.key, label: state.label, score },
      cohesion, mood, confidence,
      chemistry: Math.round(num(team.chemistry, 50)),
      trend: { ...trend, delta },
      counts: {
        players: players.length,
        satisfied: happy,
        frustrated: players.filter(p => p.mood === "frustrated" || p.mood === "unhappy").length,
      },
      positives: positives.slice(0, 4), problems: problems.slice(0, 6),
      players, groups, relations,
      history: hist.slice(), log: (locker.log || []).slice(0, 20),
      levels: LEVELS,
    };
  }

  // ---------------------------------------------------------------------
  // Mise à jour hebdomadaire (Team.trainWeek, APRÈS applyBenchFrustration/
  // updateTransferRequests et AVANT la remise à zéro du temps de jeu de la
  // semaine) : détecte les événements par différence, fait vivre les
  // relations, applique les effets en retour bornés et enregistre le relevé.
  // opts : { now, applyChemistry: delta => void }
  // ---------------------------------------------------------------------
  function snapshotOf(ctx) {
    const p = {};
    ctx.players.forEach(pl => {
      const role = ctx.role.get(sid(pl.id));
      p[sid(pl.id)] = [role === "starter" ? 2 : role === "rotation" ? 1 : 0, Math.round(num(pl.form, 50)), pl.transferRequestActive ? 1 : 0, isInjured(pl, ctx.now) ? 1 : 0, num(pl.contractUntilSeason, 0), String(pl.name || "").slice(0, 40)];
    });
    return p;
  }
  function weeklyUpdate(team, opts = {}) {
    const l = ensure(team);
    const ctx = buildContext(team, opts);
    const prev = l.last;
    const events = [];
    const log = ev => { pushLog(team, ev); events.push(ev); };
    const cur = snapshotOf(ctx);
    if (prev && prev.p) {
      Object.keys(cur).forEach(id => {
        const p = ctx.byId.get(id); const c = cur[id]; const o = prev.p[id];
        if (!o) {
          const promoted = isHomegrown(ctx, p) && num(p.age, 25) <= 21 && (p.historyLog || []).some(e => e && e.type === "promotion" && e.season === ctx.season);
          log({ t: promoted ? "youth" : "arrival", p: p.id, n: p.name });
          return;
        }
        if (c[0] === 2 && o[0] < 2) log({ t: "starter", p: p.id, n: p.name });
        else if (c[0] < 2 && o[0] === 2 && !c[3]) log({ t: "benched", p: p.id, n: p.name });
        if (c[2] && !o[2]) log({ t: "request", p: p.id, n: p.name });
        else if (!c[2] && o[2]) log({ t: "request-end", p: p.id, n: p.name });
        else if (c[1] < 22 && o[1] >= 22) log({ t: "unhappy", p: p.id, n: p.name });
        else if (c[1] >= 52 && o[1] < 38) log({ t: "happy-again", p: p.id, n: p.name });
        if (c[3] && !o[3]) log({ t: "injury", p: p.id, n: p.name });
        else if (!c[3] && o[3]) log({ t: "injury-return", p: p.id, n: p.name });
        if (c[4] > o[4] && o[4] > 0) log({ t: "extension", p: p.id, n: p.name, x: c[4] });
      });
      Object.keys(prev.p).forEach(id => { if (!cur[id]) log({ t: "departure", p: id, n: prev.p[id][5] || "" }); });
      const ment = (team.mentorships || []).map(m => `${m.youngId}|${m.veteranId}`);
      ment.filter(k => !(prev.ment || []).includes(k)).forEach(k => {
        const [y, v] = k.split("|"); const py = ctx.byId.get(y); const pv = ctx.byId.get(v);
        if (py && pv) log({ t: "mentor", p: pv.id, n: pv.name, q: py.id, m: py.name });
      });
    }

    // Relations : nées de l'histoire réelle, décroissent sans entretien.
    const rel = l.relations;
    const touched = new Set();
    const bump = (a, b, d, why) => {
      const k = pairKey(a.id, b.id);
      const r = rel[k] || { v: 0, since: num(team.week, 0), why };
      const before = r.v;
      r.v = clamp(r.v + d, -100, 100);
      if (Math.sign(d) === Math.sign(r.v)) r.why = why;
      rel[k] = r; touched.add(k);
      if (before > -25 && r.v <= -25) log({ t: "conflict", p: a.id, n: a.name, q: b.id, m: b.name });
      if (before < 25 && r.v >= 25) log({ t: "bond", p: a.id, n: a.name, q: b.id, m: b.name });
    };
    (team.mentorships || []).forEach(m => {
      const a = ctx.byId.get(sid(m.veteranId)); const b = ctx.byId.get(sid(m.youngId));
      if (a && b) bump(a, b, 3, "tutorat");
    });
    const starters = ctx.players.filter(p => ctx.role.get(sid(p.id)) === "starter");
    for (let i = 0; i < starters.length; i++) for (let j = i + 1; j < starters.length; j++) {
      const k = pairKey(starters[i].id, starters[j].id);
      if (rel[k] || (Math.abs(num(starters[i].age) - num(starters[j].age)) <= 4)) bump(starters[i], starters[j], 1, "titulaires ensemble");
    }
    // Concurrence : un remplaçant frustré face au titulaire de SON poste.
    const startersMap = (team.lineup && team.lineup.starters) || {};
    ctx.players.forEach(p => {
      if (ctx.role.get(sid(p.id)) === "starter" || num(p.form, 50) >= 40 || isInjured(p, ctx.now)) return;
      const sId = startersMap[p.position];
      const s = sId != null ? ctx.byId.get(sid(sId)) : null;
      if (s && s !== p) bump(p, s, -3, "concurrence au poste");
    });
    Object.keys(rel).forEach(k => {
      const [a, b] = k.split("|");
      if (!ctx.byId.has(a) || !ctx.byId.has(b)) { delete rel[k]; return; }
      if (!touched.has(k)) rel[k].v = rel[k].v > 0 ? Math.max(0, rel[k].v - 1) : Math.min(0, rel[k].v + 1);
    });
    trimRelations(rel);

    // Effets en retour (bornés) :
    // 1) le temps de jeu remotive un peu (pendant de la frustration du banc,
    //    qui ne faisait que descendre) — seulement jusqu'à PLAYTIME_FORM_CAP ;
    ctx.players.forEach(p => {
      const secs = Object.values(p.trainingSecondsPlayedByPosition || {}).reduce((s, v) => s + num(v), 0);
      if (secs >= PLAYTIME_MIN_SECONDS && num(p.form, 50) < PLAYTIME_FORM_CAP) p.form = clamp(Math.round(num(p.form, 50) + PLAYTIME_FORM_GAIN), 1, PLAYTIME_FORM_CAP);
    });
    // 2) les leaders pèsent sur le moral : un leader épanoui relève les
    //    joueurs frustrés (+1), un leader en rupture (moral très bas ou
    //    demande de transfert) entraîne son groupe (−1, jamais sous 25) ;
    const rows = hierarchy(ctx);
    const pairsNow = allPairs(ctx);
    const groupsNow = detectGroups(ctx, pairsNow, rows);
    rows.filter(r => r.level === "leader").forEach(r => {
      const lf = num(r.p.form, 50);
      if (lf >= LEADER_HAPPY_FORM && !r.p.transferRequestActive) {
        ctx.players.forEach(p => { if (p !== r.p && num(p.form, 50) < 40) p.form = clamp(Math.round(num(p.form, 50) + LEADER_FORM_EFFECT), 1, 100); });
      } else if (lf < LEADER_DOWN_FORM || r.p.transferRequestActive) {
        const g = groupsNow.find(gr => gr.ids.includes(sid(r.p.id)));
        (g ? g.ids : []).forEach(id => {
          const p = ctx.byId.get(id);
          if (p && p !== r.p && num(p.form, 50) > LEADER_PULL_FLOOR) p.form = clamp(Math.round(num(p.form, 50) - LEADER_FORM_EFFECT), LEADER_PULL_FLOOR, 100);
        });
      }
    });
    // 3) contagion du moral sur la cohésion, ±2 par semaine au plus.
    const mood = moodScore(rows);
    const leaderDown = rows.some(r => r.level === "leader" && (num(r.p.form, 50) < 35 || r.p.transferRequestActive));
    let chemDelta = 0;
    // Neutre autour du moral « normal » d'un effectif (≈ 55-75) : seuls un
    // vestiaire vraiment épanoui ou vraiment abattu pèsent (simulation d'une
    // saison, 2026-10-06 : un bonus dès 62 faisait monter l'alchimie à 100).
    if (mood < 35 || (mood < 45 && leaderDown)) chemDelta = -2;
    else if (mood < 45 || leaderDown) chemDelta = -1;
    else if (mood >= 85) chemDelta = 2;
    else if (mood >= 78) chemDelta = 1;
    chemDelta = clamp(chemDelta, -CONTAGION_MAX, CONTAGION_MAX);
    if (chemDelta && rows.length >= 5) {
      if (typeof opts.applyChemistry === "function") opts.applyChemistry(chemDelta);
      else team.chemistry = clamp(num(team.chemistry, 50) + chemDelta, CHEM_MIN, 100);
    }

    // 4) entretiens : promesses vérifiées, poids de la confiance.
    const coach = weeklyCoach(team, opts);
    // Relevé de la semaine.
    const cohesion = cohesionScore(team);
    const confidence = confidenceOf(team, null);
    const moods = ctx.players.map(p => moodOf(p.form).key);
    l.history.push({
      w: num(team.week, 0), s: ctx.season, chem: Math.round(num(team.chemistry, 50)), mood,
      score: overallScore(cohesion, mood, confidence),
      sat: moods.filter(k => k === "happy" || k === "content").length,
      frus: moods.filter(k => k === "frustrated" || k === "unhappy").length,
      n: ctx.players.length,
    });
    if (l.history.length > HISTORY_MAX) l.history.splice(0, l.history.length - HISTORY_MAX);
    l.last = { w: num(team.week, 0), s: ctx.season, p: cur, ment: (team.mentorships || []).map(m => `${m.youngId}|${m.veteranId}`), streak: num(team.chemistryResultStreak, 0) };
    return { events, chemDelta, promises: coach.resolved };
  }

  // Mouvement d'effectif IMMÉDIAT (transfert, vente, agent libre, promotion
  // d'un jeune, licenciement) : journalisé tout de suite plutôt qu'à la
  // semaine suivante, et reporté dans `last` pour que weeklyUpdate ne le
  // compte pas deux fois. Clubs humains seulement. kind : "arrival" |
  // "departure" | "youth".
  function noteRoster(team, player, kind, now) {
    if (!team || !player || !team.isHuman) return;
    const l = ensure(team);
    const id = sid(player.id);
    if (kind === "departure") {
      if (l.last && l.last.p) delete l.last.p[id];
      Object.keys(l.relations).forEach(k => { if (k.split("|").includes(id)) delete l.relations[k]; });
      pushLog(team, { t: "departure", p: player.id, n: player.name });
      return;
    }
    if (l.last && l.last.p) {
      const role = roleOf(team, player);
      l.last.p[id] = [role === "starter" ? 2 : role === "rotation" ? 1 : 0, Math.round(num(player.form, 50)), player.transferRequestActive ? 1 : 0, isInjured(player, num(now, Date.now())) ? 1 : 0, num(player.contractUntilSeason, 0), String(player.name || "").slice(0, 40)];
    }
    pushLog(team, { t: kind === "youth" ? "youth" : "arrival", p: player.id, n: player.name });
  }

  // Résultat d'un match officiel (Team.applyChemistryResult) : séries et
  // gros écarts seulement, le reste est déjà porté par l'alchimie.
  function onResult(team, pf, pa) {
    if (!Number.isFinite(pf) || !Number.isFinite(pa) || pf === pa) return;
    ensure(team);
    const s = num(team.chemistryResultStreak, 0);
    if (s === 3 || s === 5 || s === 8) pushLog(team, { t: "win-streak", x: s });
    else if (s === -3 || s === -5) pushLog(team, { t: "loss-streak", x: -s });
    if (pf - pa >= 25) pushLog(team, { t: "big-win", x: pf - pa });
    else if (pa - pf >= 25) pushLog(team, { t: "big-loss", x: pa - pf });
  }

  // Texte français d'un événement (traduit côté client par t()).
  function eventText(ev) {
    const n = ev.n || "Un joueur";
    switch (ev.t) {
      case "arrival": return `${n} rejoint le groupe`;
      case "youth": return `${n} monte du centre de formation`;
      case "departure": return `${n} quitte le club`;
      case "starter": return `${n} gagne sa place de titulaire`;
      case "benched": return `${n} perd sa place de titulaire`;
      case "request": return `${n} demande son transfert`;
      case "request-end": return `${n} retire sa demande de transfert`;
      case "unhappy": return `${n} est malheureux`;
      case "happy-again": return `${n} retrouve le sourire`;
      case "injury": return `${n} se blesse`;
      case "injury-return": return `${n} fait son retour de blessure`;
      case "extension": return `${n} prolonge son contrat`;
      case "mentor": return `${n} prend ${ev.m || "un jeune"} sous son aile`;
      case "conflict": return `Le torchon brûle entre ${n} et ${ev.m || "un coéquipier"}`;
      case "bond": return `${n} et ${ev.m || "un coéquipier"} sont devenus proches`;
      case "win-streak": return `${ev.x} victoires de suite`;
      case "loss-streak": return `${ev.x} défaites de suite`;
      case "big-win": return `Large victoire (+${ev.x})`;
      case "big-loss": return `Lourde défaite (−${ev.x})`;
      case "interview-up": return "Le discours du coach en conférence de presse soude le groupe";
      case "interview-down": return "Le discours du coach en conférence de presse passe mal dans le vestiaire";
      case "interview": return "Le coach s'exprime en conférence de presse";
      case "talk-ok": return ev.m ? `Entretien (${String(ev.m).toLowerCase()}) : ${n} repart rassuré` : `Discussion réussie avec ${n}`;
      case "talk-ko": return ev.m ? `Entretien (${String(ev.m).toLowerCase()}) : ${n} le prend mal` : `Discussion sans effet avec ${n}`;
      case "talk": return `Entretien (${String(ev.m || "point").toLowerCase()}) avec ${n}, sans effet net`;
      case "promise": return `Le coach promet ${ev.m || "quelque chose"} à ${n}`;
      case "promise-public": return `Promesse publique : ${ev.m || "quelque chose"} pour ${n}`;
      case "promise-kept": return `Promesse tenue envers ${n} (${ev.m || ""})`;
      case "promise-broken": return `Promesse non tenue envers ${n} (${ev.m || ""})`;
      case "contradiction": return `${n} relève une contradiction entre vos propos publics et privés`;
      case "statement-up": return `Déclaration publique : ${n} se sent soutenu`;
      case "statement-down": return `Déclaration publique : ${n} est touché`;
      case "statement": return `Le coach s'exprime publiquement sur ${n}`;
      default: return n;
    }
  }
  const EVENT_TONE = {
    arrival: 0, youth: 1, departure: 0, starter: 1, benched: -1, request: -1, "request-end": 1, unhappy: -1,
    "happy-again": 1, injury: -1, "injury-return": 1, extension: 1, mentor: 1, conflict: -1, bond: 1,
    "win-streak": 1, "loss-streak": -1, "big-win": 1, "big-loss": -1, "talk-ok": 1, "talk-ko": -1, "interview-up": 1, "interview-down": -1, interview: 0,
    talk: 0, promise: 0, "promise-public": 0, "promise-kept": 1, "promise-broken": -1, contradiction: -1, "statement-up": 1, "statement-down": -1, statement: 0,
  };

  // =====================================================================
  // ENTRETIENS ET COMMUNICATION DU COACH (2026-10-08, phases 1 à 5 de la
  // maquette « Vestiaire · Entretiens et communication ») — UN SEUL système
  // pour les entretiens privés ET les déclarations publiques (interviews de
  // jalon) : même confiance joueur ↔ coach, même mémoire, mêmes promesses,
  // mêmes réactions selon la personnalité (les 8 caractéristiques mentales,
  // pas de traits parallèles), même propagation joueur → proches → groupe →
  // vestiaire. Tout est DÉTERMINISTE (graine = joueur, choix, date) : le
  // navigateur et le serveur calculent la même chose.
  //
  // Persisté dans Team.locker.coach :
  //   trust    { id: 0-100 }  confiance du joueur envers le coach ;
  //   talks    [{at,w,s,p,n,topic,c,out}]   historique des discussions (30) ;
  //   comms    [{at,w,s,k,lbl,q,p,n,imp,fx}] communication publique (20) ;
  //   promises [{id,p,n,k,src,at,w,s,due,base,target,ok,st,end}] (20) ;
  //   stance   { id: { pv:{v,at}, pb:{v,at} } }  dernier message privé /
  //            public sur le joueur (+1 « on compte sur toi », −1 critique) ;
  //   contra   [{at,w,s,p,n,txt}] contradictions relevées (10).
  // =====================================================================
  const DAY_MS = 24 * 3600 * 1000;
  const TALK_COOLDOWN_MS = 12 * DAY_MS;      // ~2 semaines par joueur
  const TALK_URGENT_COOLDOWN_MS = 4 * DAY_MS; // urgence : crise, demande de transfert, promesse en retard
  const TALKS_PER_WEEK = 3;                  // quota glissant sur 7 jours (urgences hors quota)
  const TALKS_MAX = 30, COMMS_MAX = 20, PROMISES_MAX = 20, CONTRA_MAX = 10;
  const STANCE_WINDOW_MS = 60 * DAY_MS;      // une contradiction se remarque sur ~2 mois
  const PROMISE_WEEKS = { minutes: 3, starter: 3, role: 4, extend: 6 };
  const TOPICS = {
    intervention: { label: "Intervention", color: "bad" },
    prevention: { label: "Prévention", color: "warn" },
    integration: { label: "Intégration", color: "blue" },
    leadership: { label: "Leadership", color: "good" },
    development: { label: "Développement", color: "blue" },
    conflict: { label: "Conflit", color: "bad" },
    recadrage: { label: "Recadrage", color: "warn" },
    promise: { label: "Promesse", color: "purple" },
    checkin: { label: "Point individuel", color: "mid" },
  };
  const CHOICES = ["reassure", "transparent", "objective", "firm", "promise"];
  const CHOICE_LABEL = { reassure: "Le rassurer", transparent: "Être transparent", objective: "Lui fixer un objectif", firm: "Être ferme", promise: "Promettre" };
  // Base de réaction (avant personnalité, confiance et contexte).
  const TALK_BASE = {
    intervention: { reassure: 0.35, transparent: 0.2, objective: 0.5, firm: -0.8, promise: 1.3 },
    prevention: { reassure: 0.7, transparent: 0.4, objective: 0.5, firm: -0.5, promise: 1.0 },
    integration: { reassure: 1.0, transparent: 0.5, objective: 0.4, firm: -0.6 },
    leadership: { reassure: 0.5, transparent: 0.8, objective: 0.6, firm: -0.4, promise: 0.9 },
    development: { reassure: 0.5, transparent: 0.3, objective: 1.0, firm: -0.2, promise: 0.8 },
    conflict: { reassure: 0.2, transparent: 0.6, objective: 0.3, firm: 0.4 },
    recadrage: { reassure: -0.3, transparent: 0.5, objective: 0.5, firm: 0.7 },
    promise: { reassure: -0.2, transparent: 0.7, objective: 0.2, firm: -1.0 },
    checkin: { reassure: 0.6, transparent: 0.6, objective: 0.5, firm: -0.5 },
  };
  // Position privée prise sur le joueur (pour les contradictions).
  const PRIVATE_STANCE = { reassure: 1, promise: 1, transparent: -1, firm: -1 };
  const IMPORTANCE = { "finale-po": 1.5, "demi-finale-po": 1.3, "fin-saison-reguliere": 1.2, "mi-saison": 1, "debut-saison": 1 };

  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(key) { let a = hashStr(String(key)) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const m01 = (p, k) => (attr(p, k) - 50) / 50;   // caractéristique centrée : −1 … +1

  function emptyCoach() { return { trust: {}, talks: [], comms: [], promises: [], stance: {}, contra: [] }; }
  function sanitizeCoach(c) {
    const out = emptyCoach();
    if (!c || typeof c !== "object") return out;
    if (c.trust && typeof c.trust === "object") Object.entries(c.trust).forEach(([k, v]) => { if (Number.isFinite(v)) out.trust[k] = clamp(Math.round(v), 0, 100); });
    const str = (v, n = 160) => (typeof v === "string" ? v.slice(0, n) : "");
    if (Array.isArray(c.talks)) out.talks = c.talks.filter(t => t && TOPICS[t.topic] && CHOICES.includes(t.c)).slice(0, TALKS_MAX)
      .map(t => ({ at: num(t.at), w: num(t.w), s: num(t.s, 1), p: t.p, n: str(t.n, 60), topic: t.topic, c: t.c, out: ["pos", "neu", "neg"].includes(t.out) ? t.out : "neu" }));
    if (Array.isArray(c.comms)) out.comms = c.comms.filter(x => x && typeof x.q === "string").slice(0, COMMS_MAX)
      .map(x => ({ at: num(x.at), w: num(x.w), s: num(x.s, 1), k: str(x.k, 30), lbl: str(x.lbl, 80), q: str(x.q, 600), ...(x.p != null ? { p: x.p, n: str(x.n, 60) } : {}), imp: ["pos", "neg", "col", "neu"].includes(x.imp) ? x.imp : "neu", fx: str(x.fx, 200) }));
    if (Array.isArray(c.promises)) out.promises = c.promises.filter(x => x && PROMISE_WEEKS[x.k] && x.p != null).slice(0, PROMISES_MAX)
      .map(x => ({ id: str(x.id, 40), p: x.p, n: str(x.n, 60), k: x.k, src: x.src === "public" ? "public" : "private", at: num(x.at), w: num(x.w), s: num(x.s, 1), due: num(x.due), base: num(x.base), target: num(x.target), ok: num(x.ok), st: ["open", "kept", "broken"].includes(x.st) ? x.st : "open", ...(x.end ? { end: num(x.end) } : {}) }));
    if (c.stance && typeof c.stance === "object") Object.entries(c.stance).forEach(([k, v]) => {
      if (!v || typeof v !== "object") return;
      const one = o => (o && Number.isFinite(o.v) && Number.isFinite(o.at) ? { v: Math.sign(o.v), at: o.at } : null);
      const pv = one(v.pv), pb = one(v.pb);
      if (pv || pb) out.stance[k] = { ...(pv ? { pv } : {}), ...(pb ? { pb } : {}) };
    });
    if (Array.isArray(c.contra)) out.contra = c.contra.filter(x => x && x.p != null).slice(0, CONTRA_MAX).map(x => ({ at: num(x.at), w: num(x.w), s: num(x.s, 1), p: x.p, n: str(x.n, 60), txt: str(x.txt, 200) }));
    return out;
  }
  function coachOf(team) { const l = ensure(team); if (!l.coach || typeof l.coach !== "object" || !Array.isArray(l.coach.talks)) l.coach = sanitizeCoach(l.coach); return l.coach; }

  function defaultTrust(p) { return clamp(Math.round(48 + (num(p.form, 50) - 50) * 0.3), 25, 70); }
  function trustOf(team, p) { const c = team && team.locker && team.locker.coach; const v = c && c.trust ? c.trust[sid(p.id)] : undefined; return Number.isFinite(v) ? v : defaultTrust(p); }
  function addTrust(team, p, d) { const c = coachOf(team); const v = clamp(Math.round(trustOf(team, p) + d), 0, 100); c.trust[sid(p.id)] = v; return v; }
  function addForm(p, d, floor = 1) { const before = num(p.form, 50); p.form = clamp(Math.round(before + d), d < 0 ? Math.min(floor, before) : 1, 100); return p.form - before; }
  function trustWord(v) { return v >= 75 ? "Totale" : v >= 58 ? "Solide" : v >= 42 ? "Réservée" : v >= 25 ? "Fragile" : "Rompue"; }

  // Cohérence du coach : promesses tenues / non tenues et contradictions des
  // deux dernières saisons.
  function consistency(team) {
    const c = (team.locker && team.locker.coach) || emptyCoach();
    const season = seasonOf(team);
    const recent = x => num(x.s, season) >= season - 1;
    const kept = c.promises.filter(x => x.st === "kept" && recent(x)).length;
    const broken = c.promises.filter(x => x.st === "broken" && recent(x)).length;
    const contra = c.contra.filter(recent).length;
    const score = clamp(Math.round(70 + kept * 4 - broken * 10 - contra * 8), 0, 100);
    const label = score >= 82 ? "Très fiable" : score >= 65 ? "Plutôt fiable" : score >= 45 ? "Parole fragile" : "Peu crédible";
    return { score, label, kept, broken, contra, open: c.promises.filter(x => x.st === "open").length };
  }

  // ---------- sujets d'entretien tirés de la situation réelle ----------
  // Matchs joués depuis une promesse : par date quand le match la porte
  // (matchLog.at), sinon par semaine d'entraînement.
  function minutesSince(team, p, w, s, at) {
    const log = (Array.isArray(p.matchLog) ? p.matchLog : []).filter(m => m && (!m.team || m.team === team.name) && m.competition !== "national" && (Number.isFinite(m.at) && Number.isFinite(at) ? m.at >= at : num(m.week, -1) >= w));
    return { games: log.length, avg: log.length ? log.reduce((a, m) => a + num(m.min), 0) / log.length : 0, starts: log.filter(m => m.starter).length };
  }
  function promiseProgress(team, pr, p) {
    if (!p) return { late: false, txt: "" };
    if (pr.k === "minutes") { const m = minutesSince(team, p, pr.w, pr.s, pr.at); return { late: num(team.week) >= pr.w + 2 && m.avg < pr.target, txt: m.games ? `${Math.round(m.avg)} min / match (objectif ${pr.target})` : `objectif ${pr.target} min / match` }; }
    if (pr.k === "starter") { const st = roleOf(team, p) === "starter"; return { late: num(team.week) >= pr.w + 2 && !st, txt: st ? "titulaire actuellement" : "pas encore titulaire" }; }
    if (pr.k === "role") { const st = roleOf(team, p) === "starter"; return { late: !st, txt: st ? "toujours dans le cinq" : "sorti du cinq" }; }
    const ext = num(p.contractUntilSeason) > pr.base; return { late: num(team.week) >= pr.w + 4 && !ext, txt: ext ? "contrat prolongé" : "pas encore prolongé" };
  }
  function lastTalkWith(c, id) { return c.talks.find(t => sid(t.p) === id) || null; }
  function talkQuota(team, now) {
    const c = (team.locker && team.locker.coach) || emptyCoach();
    const used = c.talks.filter(t => now - num(t.at) < 7 * DAY_MS && !t.u).length;
    return { used, max: TALKS_PER_WEEK, left: Math.max(0, TALKS_PER_WEEK - used) };
  }
  function topicFor(ctx, row, view, c) {
    const p = row.p, id = sid(p.id);
    const pr = c.promises.find(x => x.st === "open" && sid(x.p) === id);
    if (pr) { const g = promiseProgress(ctx.team, pr, p); if (g.late) return { topic: "promise", urgent: true, sev: 5, why: `Vous lui avez promis ${promiseText(pr)}${pr.src === "public" ? " publiquement" : ""} : ${g.txt}. Il commence à douter de votre parole.` }; }
    const sat = row.sat, form = num(p.form, 50);
    if (p.transferRequestActive) return { topic: "intervention", urgent: true, sev: 5, why: "Demande son transfert dans la presse : il faut le recevoir rapidement." };
    if (form < 38) {
      const r = (sat.reasons || []).find(x => x.tone < 0) || { text: "moral en berne" };
      return { topic: "intervention", urgent: form < 22, sev: form < 22 ? 4 : 3, why: `${sat.label} (${r.text.toLowerCase()})${sat.minutes != null ? ` : ${Math.round(sat.minutes)} min par match récemment` : ""}${sat.expected === "starter" && sat.role !== "starter" ? ", alors qu'il attend un rôle de titulaire" : ""}.` };
    }
    const tension = view.relations.find(r => r.kind === "tension" && (sid(r.a) === id || sid(r.b) === id));
    if (tension) { const other = ctx.byId.get(sid(sid(tension.a) === id ? tension.b : tension.a)); return { topic: "conflict", urgent: false, sev: 3, why: `Tension avec ${other ? other.name : "un coéquipier"} (${tension.why.join(", ") || "rivalité"}).` }; }
    const last = ctx.team.locker && ctx.team.locker.last && ctx.team.locker.last.p && ctx.team.locker.last.p[id];
    if (last && last[1] - form >= 8 && form < 60) return { topic: "prevention", urgent: false, sev: 2, why: `Son moral baisse (${last[1]} → ${Math.round(form)} en une semaine)${sat.role !== "starter" && last[0] === 2 ? " depuis sa sortie du cinq" : ""}.` };
    if (tenureOf(ctx, p) === 0 && !Object.keys(ctx.relations).some(k => k.split("|").includes(id) && ctx.relations[k].v >= 25)) return { topic: "integration", urgent: false, sev: 2, why: "Arrivé cette saison, aucune relation forte dans le vestiaire pour l'instant." };
    if (attr(p, "discipline") < 28 && form >= 55 && row.level !== "leader") return { topic: "recadrage", urgent: false, sev: 1, why: "Discipline fragile : un rappel du cadre peut éviter un écart." };
    if (row.level === "leader" || row.level === "cadre") return { topic: "leadership", urgent: false, sev: 1, why: `${LEVELS[row.level].label} du vestiaire${ctx.mentors.has(id) ? ", tuteur d'un jeune" : ""} : un échange positif peut renforcer votre relation et son influence.` };
    if (num(p.age, 25) <= 22 && sat.role !== "starter") return { topic: "development", urgent: false, sev: 1, why: `${Math.round(num(p.age, 20))} ans, ${sat.role === "rotation" ? "dans la rotation" : "peu utilisé"} : parlez de sa progression.` };
    return null;
  }
  // Liste des entretiens recommandés + disponibilité de chacun.
  function recommendTalks(team, opts = {}) {
    const now = num(opts.now, Date.now());
    const ctx = buildContext(team, opts);
    const view = buildView(team, opts);
    const rows = hierarchy(ctx);
    const c = (team.locker && team.locker.coach) || emptyCoach();
    const quota = talkQuota(team, now);
    const out = [];
    rows.forEach(row => {
      const t = topicFor(ctx, row, view, c); if (!t) return;
      out.push({ ...t, ...availability(team, row.p, t.urgent, now, quota), id: row.p.id, name: row.p.name, label: TOPICS[t.topic].label });
    });
    out.sort((a, b) => b.sev - a.sev || (b.urgent - a.urgent));
    // Un seul recadrage proposé à la fois (le plus fragile en premier).
    let rec1 = 0;
    const list = out.filter(r => r.topic !== "recadrage" || rec1++ === 0);
    return { list: list.slice(0, num(opts.max, 6)), quota };
  }
  function availability(team, p, urgent, now, quota) {
    const c = (team.locker && team.locker.coach) || emptyCoach();
    const last = lastTalkWith(c, sid(p.id));
    const cd = urgent ? TALK_URGENT_COOLDOWN_MS : TALK_COOLDOWN_MS;
    const nextAt = last ? num(last.at) + cd : 0;
    if (nextAt > now) return { available: false, nextAt, block: "cooldown" };
    if (!urgent && quota.left <= 0) return { available: false, nextAt: 0, block: "quota" };
    return { available: true, nextAt: 0 };
  }

  // ---------- un entretien : ouverture, choix, réaction ----------
  function promiseText(pr) {
    if (pr.k === "minutes") return "plus de minutes";
    if (pr.k === "starter") return "une place de titulaire";
    if (pr.k === "role") return "un rôle majeur dans le cinq";
    return "une prolongation de contrat";
  }
  function promiseKindFor(team, p, topic) {
    if (topic === "leadership") return roleOf(team, p) === "starter" ? "role" : null;
    if (topic === "intervention" || topic === "prevention" || topic === "development") {
      if (typeof p.contractUntilSeason === "number" && p.contractUntilSeason <= seasonOf(team) && num(p.form, 50) >= 30) return "extend";
      const ctx = buildContext(team); return expectedRole(ctx, p) === "starter" && roleOf(team, p) !== "starter" ? "starter" : "minutes";
    }
    return null;
  }
  const OPEN = {
    intervention: ["Coach, je ne comprends pas pourquoi je joue si peu. Je pense mériter plus de minutes.", "Franchement, je ne me sens plus à ma place ici.", "J'ai l'impression que vous ne comptez plus sur moi."],
    prevention: ["Ça va… enfin, ces derniers temps c'est un peu dur.", "Je ne sais pas trop où j'en suis en ce moment.", "J'essaie de rester positif, mais ce n'est pas simple."],
    integration: ["Je découvre encore le groupe, tout va très vite.", "Je ne connais pas encore grand monde dans le vestiaire.", "Je veux m'intégrer, mais je cherche encore mes repères."],
    leadership: ["Coach, le groupe a besoin de repères en ce moment.", "Je sens que les jeunes me regardent, je veux être à la hauteur.", "Dites-moi ce que vous attendez de moi dans ce vestiaire."],
    development: ["Je veux progresser, dites-moi sur quoi travailler.", "Je me sens prêt à jouer plus, qu'est-ce qu'il me manque ?", "Je bosse dur à l'entraînement, j'espère que ça se voit."],
    conflict: ["Il y a des tensions avec un coéquipier, je préfère vous en parler.", "Ça ne passe pas avec certains, et ça commence à se voir.", "Je ne veux pas de problème, mais je ne vais pas me laisser faire."],
    recadrage: ["Vous vouliez me voir, coach ?", "Il y a un souci ?", "Je vous écoute."],
    promise: ["Vous m'aviez promis quelque chose, coach. Je ne vois rien venir.", "J'attends toujours ce que vous m'aviez dit.", "Je commence à douter de votre parole."],
    checkin: ["Tout va bien, coach. Vous vouliez faire le point ?", "Je vous écoute, coach.", "On fait le point ?"],
  };
  const CHOICE_QUOTE = {
    reassure: { intervention: "Tu restes un joueur important pour cette équipe.", prevention: "Je vois tes efforts, ne lâche rien : tu comptes pour nous.", integration: "Prends ton temps, tu as toute ta place ici.", leadership: "Le groupe a confiance en toi, et moi aussi.", development: "Tu progresses bien, continue comme ça.", conflict: "Je suis sûr que ça va s'arranger entre vous.", recadrage: "Ce n'est pas grave, on passe à autre chose.", promise: "Patience, ça va venir, je te le garantis.", checkin: "Je suis content de ce que tu montres." },
    transparent: { intervention: "Pour l'instant, d'autres joueurs sont devant toi dans la rotation.", prevention: "Je vais être honnête : ta place n'est pas garantie en ce moment.", integration: "Les premières semaines sont dures, c'est normal, voilà ce que j'attends.", leadership: "Voilà franchement où en est le groupe, et ce que j'attends de toi.", development: "Tu n'es pas encore prêt pour plus de minutes, voilà pourquoi.", conflict: "Je sais ce qui se passe, et ça doit s'arrêter.", recadrage: "Ton comportement pose problème, voilà ce que j'ai vu.", promise: "Je n'ai pas pu tenir ce que j'avais dit, et je te dois une explication.", checkin: "Voilà ce qui va et ce qui doit progresser." },
    objective: { intervention: "Montre-moi à l'entraînement que tu mérites davantage de minutes.", prevention: "Fixons-nous un objectif clair pour les prochaines semaines.", integration: "Ton objectif : trouver ta place dans le groupe d'ici un mois.", leadership: "J'ai besoin que tu tires les jeunes vers le haut.", development: "Voilà deux points précis à travailler ce mois-ci.", conflict: "Concentre-toi sur le terrain, c'est là que tout se règle.", recadrage: "Je veux voir un vrai changement d'ici la semaine prochaine.", promise: "Gagne ta place à l'entraînement, et elle sera à toi.", checkin: "On se fixe un objectif pour la suite ?" },
    firm: { intervention: "La rotation est ma décision. Tu dois l'accepter.", prevention: "Je n'ai pas de temps pour les états d'âme.", integration: "Ici, on s'adapte vite ou on reste sur le banc.", leadership: "Un leader ne se plaint pas, il montre l'exemple.", development: "Travaille et tais-toi, les minutes viendront.", conflict: "Je ne tolérerai aucune division dans ce vestiaire.", recadrage: "C'est la dernière fois. La prochaine, il y aura des sanctions.", promise: "J'ai d'autres priorités pour l'équipe, c'est comme ça.", checkin: "Je veux plus d'implication, point." },
  };
  const PROMISE_QUOTE = { minutes: "Tu auras plus de minutes dans les 3 prochaines semaines.", starter: "Tu seras titulaire d'ici 3 semaines.", role: "Tu restes un pilier du cinq, je te le garantis.", extend: "On va prolonger ton contrat dans les prochaines semaines." };
  const PROMISE_CHECK = { minutes: "Vérifiée automatiquement (minutes par match).", starter: "Vérifiée automatiquement (titularisations).", role: "Vérifiée automatiquement (place dans le cinq).", extend: "Vérifiée automatiquement (prolongation du contrat)." };
  const REPLY = {
    pos: ["D'accord, je vais vous le prouver.", "Merci coach, ça me fait du bien d'entendre ça.", "Compris. Vous pouvez compter sur moi.", "Ça me motive, je ne vous décevrai pas."],
    neu: ["D'accord… on verra bien.", "Je vais y réfléchir.", "Si vous le dites.", "OK, j'ai compris."],
    neg: ["Je m'attendais à autre chose de votre part.", "Vous ne m'écoutez pas, coach.", "Très bien. Je retiens.", "Ce n'est pas ce que j'avais besoin d'entendre."],
  };
  const OUT_LABEL = { pos: "accepte", neu: "reste prudent", neg: "le prend mal" };
  function talkOptions(team, playerId, topic, opts = {}) {
    const p = (team.players || []).find(x => sid(x.id) === sid(playerId)); if (!p || !TOPICS[topic]) return null;
    const ctx = buildContext(team, opts); const inf = influenceOf(ctx, p); const sat = satisfactionOf(ctx, p);
    const rnd = seeded(`${p.id}|${topic}|${num(team.week)}`);
    const open = OPEN[topic][Math.floor(rnd() * OPEN[topic].length)];
    const pk = promiseKindFor(team, p, topic);
    const c = (team.locker && team.locker.coach) || emptyCoach();
    const hasOpen = c.promises.some(x => x.st === "open" && sid(x.p) === sid(p.id));
    const choices = ["reassure", "transparent", "objective", "firm"].map((k, i) => ({ key: k, letter: "ABCD"[i], label: CHOICE_LABEL[k], quote: CHOICE_QUOTE[k][topic] }));
    if (pk && !hasOpen && TALK_BASE[topic].promise != null) choices.push({ key: "promise", letter: "E", label: CHOICE_LABEL.promise, quote: PROMISE_QUOTE[pk], promise: pk, check: PROMISE_CHECK[pk] });
    const last = lastTalkWith(c, sid(p.id));
    return {
      id: p.id, name: p.name, age: p.age, position: p.position, topic, topicLabel: TOPICS[topic].label, open, choices,
      form: Math.round(num(p.form, 50)), trust: trustOf(team, p), trustLabel: trustWord(trustOf(team, p)),
      minutes: Math.round(sat.minutes), role: sat.role, influence: inf.value, level: hierarchy(ctx).find(r => r.p === p).level,
      tenure: tenureOf(ctx, p), lastTalkAt: last ? last.at : null,
    };
  }
  function reactionScore(team, p, topic, choice, rnd, ctx) {
    const base = num((TALK_BASE[topic] || {})[choice], 0);
    const trust = (trustOf(team, p) - 50) / 50;
    const comp = m01(p, "composure"), det = m01(p, "determination"), disc = m01(p, "discipline"), dec = m01(p, "decision"), foc = m01(p, "focus");
    const inf = (influenceOf(ctx, p).value - 50) / 50;
    const young = num(p.age, 25) <= 21 ? 0.15 : 0;
    const c = (team.locker && team.locker.coach) || emptyCoach();
    const last = lastTalkWith(c, sid(p.id));
    let s = base;
    if (choice === "reassure") { s += -0.45 * comp + 0.5 * trust + young; if (last && last.c === "reassure" && num(last.at) > Date.now() - 60 * DAY_MS) s -= 0.6; }
    if (choice === "transparent") s += 0.5 * disc + 0.3 * dec + 0.25 * comp;
    if (choice === "objective") s += 0.9 * det + 0.2 * foc + young;
    if (choice === "firm") { s += 0.6 * disc + 0.5 * comp - 0.45 * inf; if (num(p.form, 50) < 30) s -= 0.5; }
    if (choice === "promise") { const cons = consistency(team).score; s += 0.6 * trust + (cons - 60) / 40 * 0.5; }
    s += (rnd() - 0.5) * 0.7;
    return s;
  }
  // Propagation : joueur → proches → groupe → vestiaire.
  function closeOf(ctx, p) {
    const id = sid(p.id);
    return ctx.players.filter(q => q !== p && (num((ctx.relations[pairKey(id, q.id)] || {}).v) >= 25 || affinity(ctx, p, q).v >= 0.6));
  }
  function spread(team, ctx, p, sign, weight, opts = {}) {
    const out = { close: [], group: null, chem: 0 };
    if (!sign) return out;
    const close = closeOf(ctx, p);
    close.forEach(q => { const d = addForm(q, sign * Math.max(1, Math.round(2 * weight)), 25); if (d) out.close.push({ id: q.id, n: q.name, d }); });
    if (sign < 0 && opts.trustHit) close.forEach(q => addTrust(team, q, -Math.round(2 * weight)));
    const rows = hierarchy(ctx);
    const groups = detectGroups(ctx, allPairs(ctx), rows);
    const g = groups.find(gr => gr.ids.includes(sid(p.id)));
    if (g && g.ids.length >= 3 && Math.abs(weight) >= 1) out.group = g.name;
    const lvl = (rows.find(r => r.p === p) || {}).level;
    if ((lvl === "leader" || lvl === "cadre" || (g && g.ids.length >= 3)) && weight >= 1) {
      out.chem = sign;
      if (typeof opts.applyChemistry === "function") opts.applyChemistry(sign);
      else team.chemistry = clamp(num(team.chemistry, 50) + sign, CHEM_MIN, 100);
    }
    return out;
  }
  function setStance(team, p, channel, v, now, label) {
    if (!v) return null;
    const c = coachOf(team); const id = sid(p.id);
    const st = c.stance[id] || {};
    const other = st[channel === "pv" ? "pb" : "pv"];
    let contra = null;
    if (other && Math.sign(other.v) !== Math.sign(v) && now - num(other.at) < STANCE_WINDOW_MS) {
      const betrayal = (channel === "pb" && v < 0) || (channel === "pv" && v < 0);
      const txt = channel === "pb"
        ? (v < 0 ? `En privé, vous comptiez sur ${p.name} ; en public, vous l'avez critiqué.` : `En privé, vous aviez été dur avec ${p.name} ; en public, vous le portez aux nues.`)
        : (v < 0 ? `En public, vous aviez soutenu ${p.name} ; en privé, vous lui tenez un autre discours.` : `En public, vous aviez critiqué ${p.name} ; en privé, vous le rassurez.`);
      addTrust(team, p, betrayal ? -12 : -5); addForm(p, betrayal ? -5 : -2, 25);
      contra = { at: now, w: num(team.week), s: seasonOf(team), p: p.id, n: p.name, txt };
      c.contra.unshift(contra); if (c.contra.length > CONTRA_MAX) c.contra.length = CONTRA_MAX;
      pushLog(team, { t: "contradiction", p: p.id, n: p.name });
    }
    st[channel] = { v: Math.sign(v), at: now };
    c.stance[id] = st;
    return contra;
  }
  function makePromise(team, p, kind, src, now) {
    const c = coachOf(team);
    const ctx = buildContext(team);
    const base = kind === "minutes" ? Math.round((ctx.minutes.get(sid(p.id)) || { avg: 0 }).avg) : kind === "extend" ? num(p.contractUntilSeason) : 0;
    const pr = { id: `${sid(p.id)}-${now}`, p: p.id, n: p.name, k: kind, src, at: now, w: num(team.week), s: seasonOf(team), due: num(team.week) + PROMISE_WEEKS[kind], base, target: kind === "minutes" ? clamp(base + 6, 14, 34) : 0, ok: 0, st: "open" };
    c.promises.unshift(pr);
    // On garde toutes les promesses ouvertes, puis les plus récentes résolues.
    const open = c.promises.filter(x => x.st === "open"), done = c.promises.filter(x => x.st !== "open");
    c.promises = open.concat(done).slice(0, PROMISES_MAX);
    pushLog(team, { t: src === "public" ? "promise-public" : "promise", p: p.id, n: p.name, m: promiseText(pr) });
    return pr;
  }
  // Entretien : applique le choix du coach. opts : { now, applyChemistry }.
  function talk(team, playerId, topic, choice, opts = {}) {
    const now = num(opts.now, Date.now());
    const p = (team.players || []).find(x => sid(x.id) === sid(playerId));
    if (!p) return { ok: false, reason: "not-found" };
    if (!TOPICS[topic] || TALK_BASE[topic][choice] == null) return { ok: false, reason: "bad-choice" };
    const ctx = buildContext(team, { now });
    const c = coachOf(team);
    // Le sujet doit correspondre à la situation (sinon : point individuel).
    const view = buildView(team, { now });
    const row = hierarchy(ctx).find(r => r.p === p);
    const rec = topicFor(ctx, row, view, c);
    const allowed = rec ? rec.topic : "checkin";
    if (topic !== allowed && topic !== "checkin") return { ok: false, reason: "topic" };
    const urgent = !!(rec && rec.topic === topic && rec.urgent);
    const av = availability(team, p, urgent, now, talkQuota(team, now));
    if (!av.available) return { ok: false, reason: av.block, nextAt: av.nextAt };
    const options = talkOptions(team, p.id, topic, { now });
    const opt = options.choices.find(x => x.key === choice);
    if (!opt) return { ok: false, reason: "bad-choice" };
    const rnd = seeded(`${p.id}|${topic}|${choice}|${Math.floor(now / 60000)}`);
    const score = reactionScore(team, p, topic, choice, rnd, ctx);
    const out = score >= 0.6 ? "pos" : score <= -0.3 ? "neg" : "neu";
    const w = urgent ? 1.2 : topic === "checkin" ? 0.6 : 1;
    const formBefore = Math.round(num(p.form, 50)), trustBefore = trustOf(team, p);
    if (out === "pos") { addForm(p, Math.round((topic === "intervention" || topic === "promise" ? 7 : 5) * w)); addTrust(team, p, Math.round(8 * w)); }
    else if (out === "neu") { addForm(p, 1); addTrust(team, p, 1); }
    else { addForm(p, -Math.round(6 * w), 15); addTrust(team, p, -Math.round((choice === "firm" ? 10 : 8) * w)); }
    let promise = null;
    if (choice === "promise") {
      promise = makePromise(team, p, opt.promise, "private", now);
      if (out !== "neg") addForm(p, out === "pos" ? 3 : 4);
    }
    // Promesse en retard : l'entretien la renégocie (transparence) ou l'enfonce.
    if (topic === "promise") {
      const pr = c.promises.find(x => x.st === "open" && sid(x.p) === sid(p.id));
      if (pr && choice === "transparent" && out !== "neg") { pr.st = "broken"; pr.end = now; pr.soft = 1; addTrust(team, p, 4); }
    }
    // Demande de transfert : un entretien réussi la fait retirer.
    let requestWithdrawn = false;
    if (out === "pos" && p.transferRequestActive && topic === "intervention") {
      p.transferRequestActive = false; p.transferRequestQuote = null; p.transferRequestDiscussed = false; p.weeksAtLowMotivation = 0; requestWithdrawn = true;
    }
    const contra = setStance(team, p, "pv", PRIVATE_STANCE[choice] || 0, now);
    const sp = spread(team, ctx, p, out === "pos" && (topic === "intervention" || topic === "conflict" || topic === "leadership") ? 1 : out === "neg" ? -1 : 0, out === "neg" && (row.level === "leader" || row.level === "cadre") ? 1 : 0.5, { applyChemistry: opts.applyChemistry, trustHit: out === "neg" });
    const entry = { at: now, w: num(team.week), s: seasonOf(team), p: p.id, n: p.name, topic, c: choice, out, ...(urgent ? { u: 1 } : {}) };
    c.talks.unshift(entry); if (c.talks.length > TALKS_MAX) c.talks.length = TALKS_MAX;
    pushLog(team, { t: out === "pos" ? "talk-ok" : out === "neg" ? "talk-ko" : "talk", p: p.id, n: p.name, m: TOPICS[topic].label });
    const reply = REPLY[out][Math.floor(rnd() * REPLY[out].length)];
    return {
      ok: true, out, reply, outLabel: OUT_LABEL[out], topic, choice, urgent, requestWithdrawn,
      form: { before: formBefore, after: Math.round(num(p.form, 50)) }, trust: { before: trustBefore, after: trustOf(team, p) },
      spread: sp, promise, contradiction: contra,
    };
  }

  // ---------- semaine : promesses, poids de la confiance ----------
  function weeklyCoach(team, opts = {}) {
    if (!team.locker || !team.locker.coach) return { resolved: [] };
    const now = num(opts.now, Date.now());
    const c = coachOf(team);
    const ctx = buildContext(team, opts);
    const resolved = [];
    c.promises = c.promises.filter(pr => pr.st !== "open" || ctx.byId.has(sid(pr.p)));
    c.promises.filter(pr => pr.st === "open").forEach(pr => {
      const p = ctx.byId.get(sid(pr.p));
      const seasonOver = seasonOf(team) !== pr.s;
      const due = seasonOver || num(team.week) >= pr.due;
      let kept = false, broken = false;
      if (pr.k === "minutes") { const m = minutesSince(team, p, pr.w, pr.s, pr.at); if (m.games >= 2 && m.avg >= pr.target) kept = true; else if (due) broken = true; }
      else if (pr.k === "starter") { if (roleOf(team, p) === "starter") pr.ok = num(pr.ok) + 1; if (pr.ok >= 2) kept = true; else if (due) broken = true; }
      else if (pr.k === "role") { if (roleOf(team, p) !== "starter" && !isInjured(p, now)) broken = true; else if (due) kept = true; }
      else if (pr.k === "extend") { if (num(p.contractUntilSeason) > pr.base) kept = true; else if (due) broken = true; }
      if (!kept && !broken) return;
      const pub = pr.src === "public" ? 1.5 : 1;
      pr.st = kept ? "kept" : "broken"; pr.end = now;
      if (kept) { addTrust(team, p, Math.round(10 * pub)); addForm(p, 5); }
      else { addTrust(team, p, -Math.round(18 * pub)); addForm(p, -Math.round(10 * pub), 15); closeOf(ctx, p).forEach(q => addForm(q, -2, 25)); }
      pushLog(team, { t: kept ? "promise-kept" : "promise-broken", p: p.id, n: p.name, m: promiseText(pr) });
      resolved.push({ id: pr.id, p: p.id, kept });
    });
    // Une confiance très haute porte un peu le moral, une confiance rompue le mine.
    ctx.players.forEach(p => {
      const v = c.trust[sid(p.id)]; if (!Number.isFinite(v)) return;
      if (v >= 75 && num(p.form, 50) < 60) addForm(p, 1);
      else if (v <= 25 && num(p.form, 50) > 25) addForm(p, -1, 25);
    });
    Object.keys(c.trust).forEach(k => { if (!ctx.byId.has(k)) delete c.trust[k]; });
    Object.keys(c.stance).forEach(k => { if (!ctx.byId.has(k)) delete c.stance[k]; });
    return { resolved };
  }

  // ---------- interviews : question tirée du vestiaire (phase 5) ----------
  const IVQ = {
    leader: { text: "On dit que {x} est devenu le patron de ce vestiaire. Vous confirmez ?", opts: [["praise", "Le désigner comme leader", "{x} est clairement notre leader."], ["collective", "Mettre le groupe en avant", "Le groupe est plus important que les individualités."], ["pressure", "Lui mettre la pression", "Nous attendons encore davantage de {x}."]] },
    tension: { text: "Plusieurs observateurs évoquent des tensions entre {x} et {y}. Que leur répondez-vous ?", opts: [["collective", "Défendre le groupe", "Il n'y a aucun problème, ce groupe est soudé."], ["back", "Soutenir {xs}", "{x} est un cadre, il aura son rôle."], ["pressure2", "Mettre la pression", "J'attends des deux qu'ils règlent ça entre eux."]] },
    frustrated: { text: "{x} semble frustré par son temps de jeu. Que lui dites-vous ?", opts: [["promise", "Promettre publiquement", "{x} aura davantage de temps de jeu."], ["competition", "Parler de concurrence", "La concurrence est saine, à lui de saisir sa chance."], ["criticize", "Le critiquer", "Il doit encore progresser pour mériter plus."]] },
    young: { text: "{x} fait beaucoup parler de lui. Quel avenir lui voyez-vous ?", opts: [["praise", "L'encenser", "{x} a un bel avenir ici."], ["patience", "Prôner la patience", "Il doit rester patient, son heure viendra."], ["pressure", "Le mettre au défi", "Il doit encore tout prouver."]] },
    group: { text: "Comment décririez-vous l'état d'esprit de votre vestiaire ?", opts: [["collective", "Mettre le groupe en avant", "Le groupe est plus important que les individualités."], ["praise", "Saluer {x}", "{x} montre l'exemple à tout le monde."], ["pressure", "Secouer le groupe", "Certains doivent se remettre en question."]] },
  };
  function interviewQuestion(team, opts = {}) {
    if (!team || !(team.players || []).length) return null;
    const ctx = buildContext(team, opts);
    const view = buildView(team, opts);
    const byId = new Map(view.players.map(p => [sid(p.id), p]));
    let kind = "group", x = null, y = null;
    const ten = view.relations.find(r => r.kind === "tension");
    const frus = view.players.filter(p => (p.mood === "frustrated" || p.mood === "unhappy") && p.influence >= 35).sort((a, b) => b.influence - a.influence)[0];
    const leader = view.players.find(p => p.level === "leader");
    const young = view.players.filter(p => num(p.age, 25) <= 22 && p.level !== "marginal").sort((a, b) => (ctx.rank.get(sid(a.id)) || 99) - (ctx.rank.get(sid(b.id)) || 99))[0];
    if (ten) { kind = "tension"; x = byId.get(sid(ten.a)); y = byId.get(sid(ten.b)); if (x && y && x.influence < y.influence) { const t = x; x = y; y = t; } }
    else if (frus) { kind = "frustrated"; x = frus; }
    else if (leader && (num(team.week) + seasonOf(team)) % 2 === 0) { kind = "leader"; x = leader; }
    else if (young && (ctx.rank.get(sid(young.id)) || 99) <= 8) { kind = "young"; x = young; }
    else { kind = "group"; x = leader || view.players[0]; }
    if (!x) return null;
    const fill = s => s.replace(/\{xs\}/g, lastNameOf(x.name)).replace(/\{x\}/g, x.name).replace(/\{y\}/g, y ? y.name : "");
    const def = IVQ[kind];
    return { kind, pid: x.id, pid2: y ? y.id : null, n: x.name, m: y ? y.name : null, text: fill(def.text), options: def.opts.map(([key, label, quote], i) => ({ key, letter: "ABC"[i], label: fill(label), quote: fill(quote) })) };
  }
  function lastNameOf(name) { const s = String(name || "").split(" "); return s.length > 1 ? s.slice(1).join(" ") : s[0]; }
  // Réaction à une déclaration publique. ans : { kind, pid, pid2, choice }.
  // meta : { milestone, label, now, applyChemistry }.
  function applyStatement(team, ans, meta = {}) {
    if (!ans || !IVQ[ans.kind]) return null;
    const def = IVQ[ans.kind];
    const opt = def.opts.find(o => o[0] === ans.choice); if (!opt) return null;
    const now = num(meta.now, Date.now());
    const ctx = buildContext(team, { now });
    const x = ctx.byId.get(sid(ans.pid)); if (!x) return null;
    const y = ans.pid2 != null ? ctx.byId.get(sid(ans.pid2)) : null;
    if (ans.kind === "tension" && !y) return null;
    const wgt = IMPORTANCE[meta.milestone] || 1;
    const rows = hierarchy(ctx);
    const levelOf = p => (rows.find(r => r.p === p) || {}).level;
    const infOf = p => influenceOf(ctx, p).value;
    const rx = []; // réactions lisibles
    const note = (p, txt) => rx.push({ id: p.id, n: p.name, txt });
    const resilient = p => m01(p, "determination") + m01(p, "composure") > 0.4;
    const praise = (p, k = 1) => { addForm(p, Math.round(5 * wgt * k)); addTrust(team, p, Math.round(6 * wgt * k)); note(p, "confiance ↑"); setStance(team, p, "pb", 1, now); };
    const criticize = (p, k = 1) => {
      if (resilient(p)) { addForm(p, 1); addTrust(team, p, -2); note(p, "piqué au vif, veut prouver"); }
      else { addForm(p, -Math.round(5 * wgt * k), 15); addTrust(team, p, -Math.round(7 * wgt * k)); note(p, "touché, confiance ↓"); }
      setStance(team, p, "pb", -1, now);
    };
    const jealousy = target => {
      rows.filter(r => r.p !== target && (r.level === "leader" || r.level === "cadre")).forEach(r => {
        if (m01(r.p, "leadership") > 0.2 && infOf(r.p) >= infOf(target) * 0.85) {
          addForm(r.p, -3, 25); addTrust(team, r.p, -2); note(r.p, `${r.level === "leader" ? "autre leader" : "cadre"}, un peu frustré`);
          const l = ensure(team); const k = pairKey(r.p.id, target.id); const rel = l.relations[k] || { v: 0, since: num(team.week), why: "déclaration du coach" }; rel.v = clamp(rel.v - 6, -100, 100); l.relations[k] = rel;
        } else if (r.level === "leader" || r.level === "cadre") note(r.p, "respecte ce choix");
      });
      ctx.players.filter(q => q !== target && q.position === target.position && roleOf(team, q) !== "starter" && num(q.form, 50) < 55).slice(0, 1).forEach(q => { addForm(q, -2, 25); note(q, "concurrent, se sent sous-estimé"); });
    };
    const proches = (p, sign) => { const cl = closeOf(ctx, p).filter(q => q !== x && q !== y); if (!cl.length) return; cl.forEach(q => { addForm(q, sign * 2, 25); if (sign < 0) addTrust(team, q, -2); }); const many = cl.length > 1; rx.push({ id: null, n: `${cl.length} proche${many ? "s" : ""} de ${p.name}`, txt: sign > 0 ? (many ? "fiers pour lui" : "fier pour lui") : (many ? "prennent sa défense" : "prend sa défense") }); };
    let imp = "neu", chem = 0, promise = null;
    const choice = ans.choice;
    if (choice === "praise") { praise(x); jealousy(x); proches(x, 1); imp = "pos"; }
    else if (choice === "pressure") {
      if (ans.kind === "group") { ctx.players.forEach(p => { if (resilient(p)) addForm(p, 1); else addForm(p, -2, 25); }); rx.push({ id: null, n: "Le groupe", txt: "les plus solides réagissent, les autres doutent" }); imp = "neg"; }
      else { criticize(x, 0.8); proches(x, -1); imp = "neg"; }
    }
    else if (choice === "collective") {
      const tensionNow = ans.kind === "tension";
      chem = tensionNow ? 0 : 1;
      if (tensionNow) { [x, y].forEach(p => { if (num(p.form, 50) < 45) { addForm(p, -2, 25); note(p, "se sent ignoré"); } }); }
      rx.push({ id: null, n: "Le vestiaire", txt: tensionNow ? "le message passe à moitié" : "cohésion ↑" }); imp = "col";
    }
    else if (choice === "back") { praise(x); criticize(y, 1); proches(y, -1); imp = "neg"; }
    else if (choice === "pressure2") { criticize(x, 0.6); criticize(y, 0.6); imp = "neg"; }
    else if (choice === "promise") { addForm(x, Math.round(6 * wgt)); addTrust(team, x, Math.round(5 * wgt)); note(x, "y croit, confiance ↑"); setStance(team, x, "pb", 1, now); promise = makePromise(team, x, "minutes", "public", now); imp = "pos"; }
    else if (choice === "competition") { addForm(x, -2, 25); note(x, "attendait un geste"); setStance(team, x, "pb", -1, now); imp = "neu"; }
    else if (choice === "criticize") { criticize(x); proches(x, -1); imp = "neg"; }
    else if (choice === "patience") { addForm(x, -1, 25); note(x, "patiente"); imp = "neu"; }
    // Groupe et vestiaire : une critique d'un joueur bien entouré se propage.
    if (imp === "neg" && choice !== "pressure2") {
      const target = choice === "back" ? y : x;
      const groups = detectGroups(ctx, allPairs(ctx), rows);
      const g = groups.find(gr => gr.ids.includes(sid(target.id)));
      if (g && g.ids.length >= 3) { g.ids.forEach(id => { const q = ctx.byId.get(id); if (q && q !== target) addForm(q, -1, 25); }); chem = -1; rx.push({ id: null, n: g.name, txt: "le groupe fait bloc, tension ↑" }); }
    }
    if (chem) { if (typeof meta.applyChemistry === "function") meta.applyChemistry(chem); else team.chemistry = clamp(num(team.chemistry, 50) + chem, CHEM_MIN, 100); }
    const c = coachOf(team);
    const contras = c.contra.filter(k => num(k.at) === now);
    const quote = opt[2].replace(/\{x\}/g, x.name).replace(/\{y\}/g, y ? y.name : "");
    const fx = rx.slice(0, 3).map(r => `${r.id != null ? lastNameOf(r.n) : r.n} : ${r.txt}`).join(" · ") + (contras.length ? " · contradiction relevée" : "");
    const entry = { at: now, w: num(team.week), s: seasonOf(team), k: meta.milestone || "", lbl: meta.label || "Interview", q: quote, p: x.id, n: x.name, imp, fx };
    c.comms.unshift(entry); if (c.comms.length > COMMS_MAX) c.comms.length = COMMS_MAX;
    pushLog(team, { t: imp === "pos" ? "statement-up" : imp === "neg" ? "statement-down" : "statement", p: x.id, n: x.name });
    return { ok: true, quote, imp, reactions: rx, chem, promise, contradictions: contras };
  }
  // Interview de jalon sans question de vestiaire : seulement mémorisée.
  function recordComm(team, meta = {}) {
    const c = coachOf(team);
    const q = String(meta.quote || "").slice(0, 600); if (!q) return;
    c.comms.unshift({ at: num(meta.now, Date.now()), w: num(team.week), s: seasonOf(team), k: meta.milestone || "", lbl: meta.label || "Interview", q, imp: meta.chem > 0 ? "col" : meta.chem < 0 ? "neg" : "neu", fx: meta.chem > 0 ? "Cohésion ↑" : meta.chem < 0 ? "Cohésion ↓" : "" });
    if (c.comms.length > COMMS_MAX) c.comms.length = COMMS_MAX;
  }
  // Vue de l'onglet Entretiens.
  function coachView(team, opts = {}) {
    const now = num(opts.now, Date.now());
    const c = (team.locker && team.locker.coach) || emptyCoach();
    const rec = recommendTalks(team, opts);
    const byId = new Map((team.players || []).map(p => [sid(p.id), p]));
    const promises = c.promises.filter(pr => pr.st === "open" || now - num(pr.end) < 21 * DAY_MS).slice(0, 6).map(pr => {
      const p = byId.get(sid(pr.p)); const g = pr.st === "open" ? promiseProgress(team, pr, p) : { late: false, txt: "" };
      return { ...pr, what: promiseText(pr), progress: g.txt, status: pr.st === "open" ? (g.late ? "late" : "open") : pr.st, weeksLeft: Math.max(0, pr.due - num(team.week)) };
    });
    return {
      quota: rec.quota, recommended: rec.list, consistency: consistency(team), promises,
      comms: c.comms.slice(0, 6), talks: c.talks.slice(0, 8), contra: c.contra.slice(0, 3),
      others: (team.players || []).filter(p => !rec.list.some(r => sid(r.id) === sid(p.id))).map(p => ({ id: p.id, name: p.name, ...availability(team, p, false, now, rec.quota) })),
    };
  }

  const api = {
    HISTORY_MAX, LOG_MAX, RELATIONS_MAX, RELATION_KEEP, LEVELS, MOOD_LEVELS, STATE_LEVELS, EVENT_TONE,
    PLAYTIME_FORM_GAIN, PLAYTIME_FORM_CAP, PLAYTIME_MIN_SECONDS, CONTAGION_MAX, LEADER_FORM_EFFECT, LEADER_PULL_FLOOR,
    emptyLocker, sanitize, ensure, serialize, pushLog,
    buildContext, influenceOf, satisfactionOf, hierarchy, affinity, detectGroups, allPairs,
    moodOf, stateOf, buildView, weeklyUpdate, onResult, noteRoster, eventText, pairKey,
    TOPICS, CHOICE_LABEL, TALKS_PER_WEEK, TALK_COOLDOWN_MS, emptyCoach, sanitizeCoach, coachOf, trustOf, trustWord, consistency,
    recommendTalks, talkOptions, talk, weeklyCoach, interviewQuestion, applyStatement, recordComm, coachView,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HM_VESTIAIRE = api;
})(typeof window !== "undefined" ? window : null);
