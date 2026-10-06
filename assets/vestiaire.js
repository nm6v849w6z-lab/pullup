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
  const PLAYTIME_FORM_GAIN = 1.5;      // joueur qui a vraiment joué, moral bas
  const PLAYTIME_FORM_CAP = 60;        // ... jusqu'à ce plafond seulement
  const PLAYTIME_MIN_SECONDS = 20 * 60; // ~20 min cumulées dans la semaine
  const CONTAGION_MAX = 1;             // |delta| d'alchimie max par semaine

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
    return out;
  }
  function ensure(team) {
    if (!team.locker || typeof team.locker !== "object" || !Array.isArray(team.locker.log)) team.locker = sanitize(team.locker);
    return team.locker;
  }
  function serialize(team) {
    const l = team && team.locker;
    if (!l) return emptyLocker();
    return JSON.parse(JSON.stringify({ history: l.history || [], log: l.log || [], last: l.last || null, relations: l.relations || {} }));
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
  function cohesionScore(team) {
    return Math.round(clamp((num(team.chemistry, 50) - CHEM_MIN) / (100 - CHEM_MIN) * 100, 0, 100));
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
    const relations = pairs
      .filter(e => e.v >= 0.6 || e.v <= -0.15 || Math.abs(e.rel) >= 15)
      .map(e => ({ a: e.a.id, b: e.b.id, v: e.v, kind: e.v >= 0.6 ? "good" : e.v < 0 ? "tension" : "neutral", why: e.why.map(w => WHY_TEXT[w] || w), history: e.rel }))
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
    if (cohesion < 25) problems.push({ key: "cohesion", sev: 2, text: "Le groupe manque de repères (cohésion faible)" });
    if (!leaders.length && players.length >= 5) problems.push({ key: "no-leader", sev: 1, text: "Aucun leader naturel dans le vestiaire" });

    leaders.filter(p => p.form >= 52).forEach(p => positives.push({ key: "leader", player: p.id, text: `${p.name} tient le vestiaire` }));
    if (num(team.chemistryResultStreak) >= 3) positives.push({ key: "streak", text: `${team.chemistryResultStreak} victoires de suite : le groupe y croit` });
    if (cohesion >= 65) positives.push({ key: "cohesion", text: "Groupe très soudé" });
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
    // 2) contagion du moral sur la cohésion, ±1 par semaine au plus.
    const rows = hierarchy(ctx);
    const mood = moodScore(rows);
    const leaderDown = rows.some(r => r.level === "leader" && num(r.p.form, 50) < 35);
    let chemDelta = 0;
    if (mood < 35 || leaderDown) chemDelta = -CONTAGION_MAX;
    else if (mood >= 68) chemDelta = CONTAGION_MAX;
    if (chemDelta && rows.length >= 5) {
      if (typeof opts.applyChemistry === "function") opts.applyChemistry(chemDelta);
      else team.chemistry = clamp(num(team.chemistry, 50) + chemDelta, CHEM_MIN, 100);
    }

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
    return { events, chemDelta };
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
      case "talk-ok": return `Discussion réussie avec ${n}`;
      case "talk-ko": return `Discussion sans effet avec ${n}`;
      default: return n;
    }
  }
  const EVENT_TONE = {
    arrival: 0, youth: 1, departure: 0, starter: 1, benched: -1, request: -1, "request-end": 1, unhappy: -1,
    "happy-again": 1, injury: -1, "injury-return": 1, extension: 1, mentor: 1, conflict: -1, bond: 1,
    "win-streak": 1, "loss-streak": -1, "big-win": 1, "big-loss": -1, "talk-ok": 1, "talk-ko": -1, "interview-up": 1, "interview-down": -1, interview: 0,
  };

  const api = {
    HISTORY_MAX, LOG_MAX, RELATIONS_MAX, RELATION_KEEP, LEVELS, MOOD_LEVELS, STATE_LEVELS, EVENT_TONE,
    PLAYTIME_FORM_GAIN, PLAYTIME_FORM_CAP, PLAYTIME_MIN_SECONDS, CONTAGION_MAX,
    emptyLocker, sanitize, ensure, serialize, pushLog,
    buildContext, influenceOf, satisfactionOf, hierarchy, affinity, detectGroups, allPairs,
    moodOf, stateOf, buildView, weeklyUpdate, onResult, eventText, pairKey,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HM_VESTIAIRE = api;
})(typeof window !== "undefined" ? window : null);
