/*
 * showData.js — Hoop Manager · Émissions (avant-match et mi-temps)
 *
 * Construit, à partir des données de la ligue, le contenu des deux émissions :
 *   - buildPrematchShow(input)  → l'avant-match (compos verrouillées 5 min avant)
 *   - buildHalftimeShow(input)  → le show de la mi-temps
 *
 * Fonctions PURES : aucune I/O, aucun accès au DOM. Utilisable côté serveur
 * (Node, require) et côté navigateur (window.HoopShowData).
 *
 * RÈGLE ANTI-SPOILER : la mi-temps ne lit QUE les événements des quart-temps 1 et 2
 * (filtre e.q <= 2), même si le moteur a déjà simulé tout le match. L'avant-match ne
 * lit AUCUN événement de match, seulement les données d'avant-journée.
 *
 * Le format d'entrée "normalisé" est décrit dans INTEGRATION.md (et en JSDoc plus bas).
 * Un adaptateur doit convertir les données du moteur (engine.js) vers ce format.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HoopShowData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HALF_LAST_QUARTER = 2;

  /* ------------------------------------------------------------------ utils */

  function hashStr(s) {
    let h = 2166136261;
    const str = String(s);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** Générateur pseudo-aléatoire déterministe (même entrée → même émission). */
  function seeded(seed) {
    let a = hashStr(seed);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
  const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const ordinal = (n) => (n === 1 ? '1re' : n + 'e');
  const frNum = (n) => String(n).replace('.', ',');
  function initials(name) {
    const parts = String(name || '').replace(/\./g, ' ').split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ------------------------------------------------------------- box score */

  function emptyTeam() {
    return { pts: 0, q: [0, 0, 0, 0], fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, tov: 0, pf: 0 };
  }
  function emptyPlayer(id, teamId) {
    return { id, teamId, pts: 0, reb: 0, ast: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tov: 0, pf: 0 };
  }

  /**
   * Box score calculé à partir des événements, en ne gardant que les quart-temps
   * compris dans [fromQuarter, toQuarter] (prolongations = q 5, 6…).
   * @param {Match} match
   * @param {{fromQuarter?:number,toQuarter?:number}} [range]
   */
  function boxScore(match, range) {
    const from = (range && range.fromQuarter) || 1;
    const to = (range && range.toQuarter) || 99;
    const events = (match.events || []).filter((e) => e.q >= from && e.q <= to);
    const teams = {};
    const players = {};
    const T = (id) => teams[id] || (teams[id] = emptyTeam());
    const P = (id, teamId) => players[id] || (players[id] = emptyPlayer(id, teamId));
    T(match.homeId); T(match.awayId);
    const flow = [];
    let h = 0, a = 0;
    for (const e of events) {
      const t = T(e.teamId);
      const p = e.playerId != null ? P(e.playerId, e.teamId) : null;
      const qi = Math.min(3, Math.max(0, e.q - 1));
      let scored = 0;
      switch (e.type) {
        case 'shot': {
          const three = e.pts === 3;
          t.fga++; if (three) t.tpa++;
          if (p) { p.fga++; if (three) p.tpa++; }
          if (e.made) {
            scored = e.pts || 2;
            t.fgm++; if (three) t.tpm++;
            if (p) { p.fgm++; if (three) p.tpm++; }
            if (e.assistId != null) { P(e.assistId, e.teamId).ast++; t.ast++; }
          }
          break;
        }
        case 'ft':
          t.fta++; if (p) p.fta++;
          if (e.made) { scored = 1; t.ftm++; if (p) p.ftm++; }
          break;
        case 'rebound': t.reb++; if (p) p.reb++; break;
        case 'turnover': t.tov++; if (p) p.tov++; break;
        case 'foul': t.pf++; if (p) p.pf++; break;
        default: break;
      }
      if (scored) {
        t.pts += scored; t.q[qi] += scored;
        if (p) p.pts += scored;
        if (e.teamId === match.homeId) h += scored; else a += scored;
        flow.push({ teamId: e.teamId, pts: scored, diff: h - a });
      }
    }
    return { teams, players, flow, events };
  }

  /** Plus longue série (x-0) et série en cours. */
  function runs(flow) {
    let best = { teamId: null, pts: 0 };
    let cur = { teamId: null, pts: 0 };
    for (const f of flow) {
      if (f.teamId === cur.teamId) cur = { teamId: cur.teamId, pts: cur.pts + f.pts };
      else cur = { teamId: f.teamId, pts: f.pts };
      if (cur.pts > best.pts) best = { teamId: cur.teamId, pts: cur.pts };
    }
    return { best, current: cur };
  }
  /** Plus gros écart de chaque côté (en points). */
  function leads(flow) {
    let maxHome = 0, maxAway = 0;
    for (const f of flow) { maxHome = Math.max(maxHome, f.diff); maxAway = Math.max(maxAway, -f.diff); }
    return { maxHome, maxAway };
  }

  /* -------------------------------------------------------------- classement */

  const winPct = (r) => (r.w + r.l ? r.w / (r.w + r.l) : 0);

  /**
   * Trie un classement : % de victoires, puis nombre de victoires, puis ordre d'origine
   * (qui sert de départage : l'adaptateur peut passer le classement déjà départagé).
   */
  function rankTable(rows, tieBreakOrder) {
    const idx = new Map((tieBreakOrder || rows.map((r) => r.teamId)).map((id, i) => [id, i]));
    return rows.slice().sort((x, y) => {
      const d = winPct(y) - winPct(x);
      if (Math.abs(d) > 1e-9) return d;
      if (y.w !== x.w) return y.w - x.w;
      return (idx.has(x.teamId) ? idx.get(x.teamId) : 999) - (idx.has(y.teamId) ? idx.get(y.teamId) : 999);
    });
  }

  /* ------------------------------------------------------------ vocabulaire */

  function ctxHelpers(input) {
    const teams = input.teams || {};
    const players = input.players || {};
    return {
      tname: (id) => (teams[id] && teams[id].name) || String(id),
      tshort: (id) => (teams[id] && (teams[id].short || teams[id].name)) || String(id),
      pname: (id) => (players[id] && players[id].name) || String(id),
      player: (id) => players[id] || { id, name: String(id) },
    };
  }

  /* ======================================================================
   *                              MI-TEMPS
   * ==================================================================== */

  /**
   * @typedef {Object} HalftimeInput
   * @property {string|number} day              numéro de journée
   * @property {string|number} [leagueId]
   * @property {string} myTeamId               équipe du joueur qui regarde
   * @property {Object<string,{name:string,short?:string,city?:string}>} teams
   * @property {Object<string,{name:string,pos?:string,teamId?:string}>} [players]
   * @property {Match[]} matches               matchs de la journée (événements complets OK : filtrés à q<=2)
   * @property {{teamId:string,w:number,l:number}[]} standings  classement AVANT la journée, déjà ordonné
   * @property {number} [resumeAt]             timestamp (ms) de la reprise
   * @property {{name:string,badge?:string}} [sponsor]
   */

  function buildHalftimeShow(input) {
    const H = ctxHelpers(input);
    const my = input.myTeamId;
    const rnd = seeded('ht|' + input.leagueId + '|' + input.day + '|' + my);
    const showId = ['ht', input.leagueId || 'L', input.day, my].join(':');

    const ms = (input.matches || []).map((m) => {
      const b = boxScore(m, { toQuarter: HALF_LAST_QUARTER });
      const hs = b.teams[m.homeId], as = b.teams[m.awayId];
      return {
        m, b, id: m.id, home: m.homeId, away: m.awayId,
        hs: hs.pts, as: as.pts,
        q1: [hs.q[0], as.q[0]], q2: [hs.q[1], as.q[1]],
        mine: m.homeId === my || m.awayId === my,
        runs: runs(b.flow), leads: leads(b.flow),
      };
    });
    const mine = ms.find((x) => x.mine) || null;

    const before = rankTable(input.standings || []);
    const posBefore = new Map(before.map((r, i) => [r.teamId, i + 1]));

    const segments = [];

    // 1. Générique
    segments.push({
      type: 'intro', duration: 6, label: 'Générique',
      kicker: 'JOURNÉE ' + input.day + ' · MI-TEMPS',
      title: 'LE SHOW', titleAccent: 'DE LA MI-TEMPS',
      subtitle: mine ? 'Ton match, puis toute la ligue, en 2 minutes' : 'Toute la ligue en 2 minutes',
      bubble: fill(pick(rnd, [
        'Bonsoir à tous ! Mi-temps de la journée {day} : on commence par ton match, puis on fait le tour de la ligue.',
        'Bienvenue dans le show de la mi-temps ! Journée {day}, et il s’en passe des choses.',
      ]), { day: input.day }),
    });

    // 2. Ton match
    let myMatchData = null;
    if (mine) {
      myMatchData = halftimeMyMatch(mine, my, H, rnd);
      segments.push(Object.assign({ type: 'myMatch', duration: 14, kicker: 'TON MATCH', title: 'À la mi-temps' }, myMatchData));
    }

    // 3. Multiplex
    const ordered = mine ? [mine].concat(ms.filter((x) => x !== mine)) : ms.slice();
    let biggest = null;
    for (const x of ms) {
      if (x === mine) continue;
      const d = Math.abs(x.hs - x.as);
      if (!biggest || d > biggest.d) biggest = { x, d };
    }
    segments.push({
      type: 'multiplex', duration: 10, kicker: 'LA LIGUE', title: 'Multiplex',
      matches: ordered.map((x) => ({
        id: x.id, mine: x.mine,
        home: { id: x.home, name: H.tname(x.home), score: x.hs },
        away: { id: x.away, name: H.tname(x.away), score: x.as },
        quarters: [x.q1, x.q2],
      })),
      bubble: biggest && biggest.d >= 8
        ? fill('Place au multiplex : {n} matchs, et {t} mène déjà de {d} points face à {o}.', {
          n: ms.length, d: biggest.d,
          t: H.tname(biggest.x.hs > biggest.x.as ? biggest.x.home : biggest.x.away),
          o: H.tname(biggest.x.hs > biggest.x.as ? biggest.x.away : biggest.x.home),
        })
        : fill('Place au multiplex : {n} matchs, et beaucoup de suspense.', { n: ms.length }),
    });

    // 4. Le match à suivre
    const watch = pickMatchToWatch(ms.filter((x) => !x.mine), posBefore, H);
    if (watch) segments.push(Object.assign({ type: 'matchToWatch', duration: 9, kicker: 'LA LIGUE', title: 'Le match à suivre' }, watch));

    // 5. La stat insolite
    const odd = pickOddStat(ms, H, rnd);
    if (odd) segments.push(Object.assign({ type: 'oddStat', duration: 7, kicker: 'LA LIGUE', title: 'La stat insolite' }, odd, {
      bubble: pick(rnd, ['Et voici la stat qui fait parler…', 'La stat insolite de la mi-temps !', 'Petite curiosité statistique…']),
    }));

    // 6. Classement en direct
    const table = liveTable(input.standings || [], before, posBefore, ms, my, H);
    segments.push(Object.assign({ type: 'table', duration: 9, kicker: 'LA LIGUE', title: 'Classement en direct', subtitle: 'si les scores de la mi-temps ne bougent plus' }, table));

    // 7. Pub
    segments.push({ type: 'ad', duration: 20, kicker: 'COUPURE', title: 'Page de pub', slot: 'halftime', bubble: 'On se retrouve après une courte pause…' });

    // 8. Pronostics
    const questions = halftimeQuestions(showId, mine, watch, ms, H);
    if (questions.length) {
      segments.push({
        type: 'pronostics', duration: 0, kicker: 'À TOI DE JOUER', title: 'Pronostics de la 2e mi-temps',
        showId, questions, bubble: 'À toi de jouer : fais tes pronostics avant la reprise !',
      });
    }

    return {
      kind: 'halftime', showId, day: input.day, myTeamId: my,
      brand: 'LE SHOW DE LA MI-TEMPS',
      clock: { label: 'Reprise', at: input.resumeAt || null },
      sponsor: input.sponsor || { name: 'HOOP MANAGER', badge: 'PREMIUM' },
      pronostics: questions.length ? { showId, lockAt: input.resumeAt || null, questions } : null,
      segments,
    };
  }

  function halftimeMyMatch(x, my, H, rnd) {
    const opp = x.home === my ? x.away : x.home;
    const b = x.b;
    const myT = b.teams[my], opT = b.teams[opp];
    const plist = Object.values(b.players);
    const mineP = plist.filter((p) => p.teamId === my);
    const oppP = plist.filter((p) => p.teamId === opp);

    // Faits marquants : candidats pondérés, on garde les 3 plus forts.
    const facts = [];
    const add = (w, text, tone) => facts.push({ w, text, tone });
    for (const p of mineP) if (p.tpm >= 3) add(5 + p.tpm, fill('{p} : {m}/{a} à 3 points', { p: H.pname(p.id), m: p.tpm, a: p.tpa }), 'good');
    for (const p of oppP) if (p.pts >= 10) add(3 + p.pts / 3, fill('{p} ({o}) a déjà {n} points', { p: H.pname(p.id), o: H.tshort(opp), n: p.pts }), 'bad');
    const dt = myT.tov - opT.tov;
    if (dt >= 3) add(4 + dt, fill('{n} ballons perdus, contre {o} pour {t}', { n: myT.tov, o: opT.tov, t: H.tshort(opp) }), 'bad');
    if (dt <= -3) add(4 - dt, fill('{t} a perdu {o} ballons, contre {n} pour toi', { n: myT.tov, o: opT.tov, t: H.tshort(opp) }), 'good');
    const topReb = (arr) => arr.reduce((best, p) => (!best || p.reb > best.reb ? p : best), null);
    const rOpp = topReb(oppP), rMe = topReb(mineP);
    if (rOpp && rOpp.reb >= 6) add(3 + rOpp.reb / 2, fill('{p} ({o}) domine au rebond ({n})', { p: H.pname(rOpp.id), o: H.tshort(opp), n: rOpp.reb }), 'bad');
    if (rMe && rMe.reb >= 6) add(3 + rMe.reb / 2, fill('{p} domine au rebond ({n})', { p: H.pname(rMe.id), n: rMe.reb }), 'good');
    for (const p of mineP) if (p.pf >= 3) add(4 + p.pf, fill('{p} a déjà {n} fautes', { p: H.pname(p.id), n: p.pf }), 'bad');
    for (const p of oppP) if (p.pf >= 3) add(3 + p.pf, fill('{p} ({o}) a déjà {n} fautes', { p: H.pname(p.id), o: H.tshort(opp), n: p.pf }), 'good');
    if (x.runs.best.pts >= 8) {
      const good = x.runs.best.teamId === my;
      add(4 + x.runs.best.pts / 2, fill('Série de {n}-0 pour {t}', { n: x.runs.best.pts, t: H.tshort(x.runs.best.teamId) }), good ? 'good' : 'bad');
    }
    if (myT.fta >= 6) add(2, fill('{m}/{a} aux lancers francs pour toi', { m: myT.ftm, a: myT.fta }), myT.ftm / myT.fta >= 0.75 ? 'good' : 'bad');
    facts.sort((u, v) => v.w - u.w);
    const topFacts = facts.slice(0, 3).map((f) => ({ text: f.text, tone: f.tone }));
    if (!topFacts.length) topFacts.push({ text: fill('{m} % de réussite au tir pour toi, {o} % pour {t}', { m: pct(myT.fgm, myT.fga), o: pct(opT.fgm, opT.fga), t: H.tshort(opp) }), tone: 'neutral' });

    // Meilleur joueur de mon équipe
    const score = (p) => p.pts + 0.7 * p.reb + 0.7 * p.ast;
    const best = mineP.reduce((bst, p) => (!bst || score(p) > score(bst) ? p : bst), null);
    let bestPlayer = null;
    if (best) {
      const parts = [best.pts + ' pts'];
      if (best.reb >= 3) parts.push(best.reb + ' reb');
      if (best.ast >= 3) parts.push(best.ast + ' passes');
      if (best.tpm >= 2) parts.push(best.tpm + '/' + best.tpa + ' à 3 pts');
      bestPlayer = { id: best.id, name: H.pname(best.id), initials: initials(H.pname(best.id)), line: parts.join(' · ') };
    }

    // Carte des tirs (coordonnées normalisées 0..1, voir INTEGRATION.md)
    const shots = b.events
      .filter((e) => e.type === 'shot' && e.x != null && e.y != null)
      .map((e) => ({ x: e.x, y: e.y, made: !!e.made, side: e.teamId === x.home ? 'home' : 'away' }));

    const myScore = my === x.home ? x.hs : x.as;
    const opScore = my === x.home ? x.as : x.hs;
    const diff = Math.abs(myScore - opScore);
    let bubble;
    if (myScore > opScore) bubble = fill(pick(rnd, ['{t} mène de {d} points à la pause.', 'Avantage {t} à la mi-temps : +{d}.']), { t: H.tshort(my), d: diff });
    else if (myScore < opScore) bubble = fill(diff >= 10 ? 'Grosse entame à rattraper : {t} est mené de {d} points.' : pick(rnd, ['{t} est mené de {d} points. Tout reste possible !', 'Petit retard de {d} points pour {t}, rien d’irréparable.']), { t: H.tshort(my), d: diff });
    else bubble = fill('Égalité parfaite entre {t} et {o} à la pause !', { t: H.tshort(my), o: H.tshort(opp) });
    if (topFacts[0] && topFacts[0].tone !== 'neutral') bubble += ' ' + (topFacts[0].tone === 'good' ? 'Point fort : ' : 'Attention : ') + lcFirst(topFacts[0].text) + '.';

    return {
      matchId: x.id,
      home: { id: x.home, name: H.tname(x.home), score: x.hs, isMine: x.home === my },
      away: { id: x.away, name: H.tname(x.away), score: x.as, isMine: x.away === my },
      quarters: [x.q1, x.q2, null, null],
      shots, facts: topFacts, bestPlayer, bubble,
    };
  }
  function lcFirst(s) {
    // Ne pas toucher aux noms propres (« O. Adeyemi », « Cerberus… »)
    if (!s || /^[A-ZÀ-Ý]\.|^[A-ZÀ-Ý][a-zà-ÿ]+ [A-ZÀ-Ý]/.test(s) || /^[A-ZÀ-Ý]{2}/.test(s)) return s;
    const first = s.split(' ')[0];
    return /^(Série|Leur|Tes|Ton)$/.test(first) ? s[0].toLowerCase() + s.slice(1) : s;
  }

  function pickMatchToWatch(list, posBefore, H) {
    if (!list.length) return null;
    const scored = list.map((x) => {
      const margin = Math.abs(x.hs - x.as);
      const leader = x.hs > x.as ? x.home : x.hs < x.as ? x.away : null;
      const trailedHome = x.leads.maxAway; // retard max subi par l'équipe à domicile
      const trailedAway = x.leads.maxHome;
      let comeback = 0;
      if (leader === x.home || leader === null) comeback = Math.max(comeback, trailedHome);
      if (leader === x.away || leader === null) comeback = Math.max(comeback, trailedAway);
      const pa = posBefore.get(x.home) || 99, pb = posBefore.get(x.away) || 99;
      let tag = 'À SUIVRE', score = 10 - margin;
      if (pa <= 3 && pb <= 3) { tag = 'CHOC AU SOMMET'; score = 50 - margin; }
      if (margin <= 3) { tag = 'AU COUDE À COUDE'; score = Math.max(score, 60 - margin); }
      if (comeback >= 8 && margin <= comeback) { tag = 'REMONTADA EN COURS'; score = Math.max(score, 80 + comeback); }
      if (margin === 0) { tag = 'ÉGALITÉ PARFAITE'; score = Math.max(score, 100 + comeback); }
      return { x, tag, score, comeback, pa, pb };
    });
    scored.sort((u, v) => v.score - u.score);
    const w = scored[0];
    const x = w.x;
    const maxLeadTeam = x.leads.maxHome >= x.leads.maxAway ? x.home : x.away;
    const maxLead = Math.max(x.leads.maxHome, x.leads.maxAway);
    const stats = [];
    if (maxLead > 0) stats.push({ label: 'Plus gros écart', value: '+' + maxLead + ' pour ' + H.tshort(maxLeadTeam) });
    if (x.runs.best.pts >= 6) stats.push({ label: 'Plus longue série', value: x.runs.best.pts + '-0 pour ' + H.tshort(x.runs.best.teamId) });
    stats.push({ label: 'Enjeu', value: H.tshort(x.home) + ' ' + ordinal(w.pa) + ' · ' + H.tshort(x.away) + ' ' + ordinal(w.pb) });
    const t = { home: H.tshort(x.home), away: H.tshort(x.away), c: w.comeback };
    const bubbles = {
      'ÉGALITÉ PARFAITE': w.comeback >= 8 ? 'Entre {home} et {away}, rien n’est joué : {c} points de retard effacés !' : 'Entre {home} et {away}, rien n’est joué : égalité parfaite !',
      'REMONTADA EN COURS': 'Quel retour ! Menés de {c} points, ils sont revenus dans le match.',
      'AU COUDE À COUDE': '{home} et {away} se rendent coup pour coup.',
      'CHOC AU SOMMET': 'Choc au sommet entre {home} et {away} : ça vaut le détour.',
      'À SUIVRE': 'Gardez un œil sur {home} – {away}.',
    };
    return {
      matchId: x.id, tag: w.tag,
      home: { id: x.home, name: H.tname(x.home), score: x.hs },
      away: { id: x.away, name: H.tname(x.away), score: x.as },
      quarters: [x.q1, x.q2],
      stats: stats.slice(0, 3),
      bubble: fill(bubbles[w.tag], t),
    };
  }

  function pickOddStat(ms, H, rnd) {
    const cands = [];
    for (const x of ms) {
      for (const tid of [x.home, x.away]) {
        const t = x.b.teams[tid];
        if (t.tpm === 0 && t.tpa >= 6) cands.push({ r: 90 + t.tpa, big: '0/' + t.tpa, text: H.tname(tid) + ' n’a réussi aucun tir à 3 points', sub: 'Rien ne rentre derrière l’arc pour l’instant.' });
        if (t.fta >= 8 && t.ftm === t.fta) cands.push({ r: 60 + t.fta, big: t.ftm + '/' + t.fta, text: H.tname(tid) + ' : 100 % aux lancers francs', sub: 'Une adresse parfaite sur la ligne.' });
        if (t.tov >= 11) cands.push({ r: 55 + t.tov, big: String(t.tov), text: 'ballons perdus par ' + H.tname(tid), sub: 'Il va falloir soigner la conservation du ballon.' });
        if (t.pts >= 55) cands.push({ r: 50 + (t.pts - 55), big: String(t.pts), text: 'points marqués par ' + H.tname(tid) + ' en une mi-temps', sub: 'L’attaque tourne à plein régime.' });
        if (t.pts <= 25) cands.push({ r: 50 + (25 - t.pts), big: String(t.pts), text: 'points seulement pour ' + H.tname(tid), sub: 'Une mi-temps très compliquée en attaque.' });
      }
      for (const p of Object.values(x.b.players)) {
        if (p.tpm >= 5) cands.push({ r: 70 + p.tpm * 2, big: p.tpm + '/' + p.tpa, text: H.pname(p.id) + ' (' + H.tshort(p.teamId) + ') : ' + p.tpm + ' tirs à 3 points en une mi-temps', sub: 'Un vrai récital derrière l’arc.' });
        if (p.pts >= 20) cands.push({ r: 65 + p.pts - 20, big: String(p.pts), text: 'points pour ' + H.pname(p.id) + ' (' + H.tshort(p.teamId) + ') en une mi-temps', sub: 'Intenable.' });
        if (p.reb >= 10) cands.push({ r: 62 + p.reb - 10, big: String(p.reb), text: 'rebonds pour ' + H.pname(p.id) + ' (' + H.tshort(p.teamId) + ') en une mi-temps', sub: 'Il ramasse tout sous les panneaux.' });
      }
    }
    if (!cands.length) return null;
    cands.forEach((c) => { c.r += rnd() * 0.5; });
    cands.sort((a, b) => b.r - a.r);
    const c = cands[0];
    return { big: c.big, text: c.text, sub: c.sub };
  }

  function liveTable(standings, before, posBefore, ms, my, H) {
    const rec = new Map(standings.map((r) => [r.teamId, { teamId: r.teamId, w: r.w, l: r.l, suspended: false }]));
    const suspended = [];
    for (const x of ms) {
      const a = rec.get(x.home), b = rec.get(x.away);
      if (!a || !b) continue;
      if (x.hs > x.as) { a.w++; b.l++; } else if (x.as > x.hs) { b.w++; a.l++; } else { a.suspended = b.suspended = true; suspended.push(x); }
    }
    const now = rankTable(Array.from(rec.values()), before.map((r) => r.teamId));
    const rows = now.map((r, i) => {
      const pb = posBefore.get(r.teamId) || i + 1;
      const move = pb - (i + 1);
      return {
        pos: i + 1, teamId: r.teamId, name: H.tname(r.teamId), w: r.w, l: r.l,
        pct: Math.round(winPct(r) * 100), mine: r.teamId === my,
        trend: r.suspended ? 'suspended' : move > 0 ? 'up' : move < 0 ? 'down' : 'same',
        move: Math.abs(move),
      };
    });
    const me = rows.find((r) => r.mine);
    let bubble = 'Voici le classement si les scores de la mi-temps ne bougent plus.';
    if (me) {
      const t = H.tshort(my);
      if (me.trend === 'up') bubble = fill('Si ça se termine comme ça, {t} grimpe à la {p} place !', { t, p: ordinal(me.pos) });
      else if (me.trend === 'down') bubble = fill('Si ça se termine comme ça, {t} recule à la {p} place.', { t, p: ordinal(me.pos) });
      else if (me.trend === 'suspended') bubble = fill('Égalité dans ton match : {t} reste {p} pour l’instant.', { t, p: ordinal(me.pos) });
      else bubble = fill('Si ça se termine comme ça, {t} garde sa {p} place.', { t, p: ordinal(me.pos) });
    }
    const note = suspended.length
      ? 'Classement au % de victoires. ' + suspended.map((x) => H.tshort(x.home) + ' – ' + H.tshort(x.away)).join(', ') +
        (suspended.length > 1 ? ' sont à égalité : matchs comptés' : ' est à égalité : match compté') + ' comme non joué pour l’instant.'
      : 'Classement au % de victoires.';
    return { rows, note, bubble };
  }

  function halftimeQuestions(showId, mine, watch, ms, H) {
    const qs = [];
    if (mine) {
      qs.push({
        id: showId + ':q:w2h', kind: 'secondHalfWinner', matchId: mine.id,
        label: 'Qui gagne la 2e mi-temps de ton match ?',
        options: [{ id: mine.home, label: H.tshort(mine.home) }, { id: mine.away, label: H.tshort(mine.away) }],
      });
    }
    if (watch) {
      qs.push({
        id: showId + ':q:win:' + watch.matchId, kind: 'matchWinner', matchId: watch.matchId,
        label: H.tshort(watch.home.id) + ' – ' + H.tshort(watch.away.id) + ' : qui l’emporte ?',
        options: [{ id: watch.home.id, label: H.tshort(watch.home.id) }, { id: watch.away.id, label: H.tshort(watch.away.id) }],
      });
    }
    const others = ms.filter((x) => !x.mine && (!watch || x.id !== watch.matchId));
    if (others.length) {
      const x = others.reduce((b, y) => (y.hs + y.as > b.hs + b.as ? y : b), others[0]);
      const line = Math.round((x.hs + x.as) * 2) + 0.5;
      qs.push({
        id: showId + ':q:tot:' + x.id, kind: 'totalPoints', matchId: x.id, line,
        label: 'Plus ou moins de ' + frNum(line) + ' points dans ' + H.tshort(x.home) + ' – ' + H.tshort(x.away) + ' ?',
        options: [{ id: 'over', label: 'Plus' }, { id: 'under', label: 'Moins' }],
      });
    }
    return qs;
  }

  /* ======================================================================
   *                              AVANT-MATCH
   * ==================================================================== */

  /**
   * @typedef {Object} PrematchInput
   * @property {string|number} day
   * @property {string|number} [leagueId]
   * @property {string} myTeamId
   * @property {Object<string,{name:string,short?:string,city?:string}>} teams
   * @property {Object<string,PlayerInfo>} players   infos + stats de saison (season.pts, ast, reb, tpPct, tov)
   * @property {{id:string,homeId:string,awayId:string}[]} fixtures   matchs de la journée (sans résultat !)
   * @property {{teamId:string,w:number,l:number}[]} standings        classement avant la journée, ordonné
   * @property {Object<string,('V'|'D')[]>} [form]                     5 derniers résultats, du plus ancien au plus récent
   * @property {{day:any,homeId:string,awayId:string,homeScore:number,awayScore:number}[]} [headToHead]
   * @property {Object<string,string[]>} lineups     cinq de départ VERROUILLÉS, par équipe (ids joueurs)
   * @property {{playerId:string,teamId:string,reason:string}[]} [absents]
   * @property {number} [kickoffAt]                  timestamp (ms) du coup d'envoi
   * @property {{name:string,badge?:string}} [sponsor]
   */
  function buildPrematchShow(input) {
    const H = ctxHelpers(input);
    const my = input.myTeamId;
    const rnd = seeded('pm|' + input.leagueId + '|' + input.day + '|' + my);
    const showId = ['pm', input.leagueId || 'L', input.day, my].join(':');
    const fixtures = input.fixtures || [];
    const fx = fixtures.find((f) => f.homeId === my || f.awayId === my) || null;
    const before = rankTable(input.standings || []);
    const pos = new Map(before.map((r, i) => [r.teamId, i + 1]));
    const recOf = new Map(before.map((r) => [r.teamId, r]));
    const n = before.length;
    const segments = [];

    segments.push({
      type: 'intro', duration: 6, label: 'Générique',
      kicker: 'JOURNÉE ' + input.day + ' · AVANT-MATCH',
      title: 'L’AVANT-', titleAccent: 'MATCH',
      versus: fx ? { home: H.tname(fx.homeId), away: H.tname(fx.awayId) } : null,
      bubble: fill('Bonsoir et bienvenue ! Journée {day} : on commence par ton match, puis on fait le tour de la ligue.', { day: input.day }),
    });

    let lineupSeg = null, duel = null;
    if (fx) {
      const home = fx.homeId, away = fx.awayId;
      const rh = recOf.get(home) || { w: 0, l: 0 }, ra = recOf.get(away) || { w: 0, l: 0 };
      const h2h = (input.headToHead || []).filter((g) => (g.homeId === home && g.awayId === away) || (g.homeId === away && g.awayId === home));
      const last = h2h.length ? h2h[h2h.length - 1] : null;
      let lastLine = '', lastBubble = '';
      if (last) {
        const winner = last.homeScore > last.awayScore ? last.homeId : last.awayId;
        lastLine = winner === my ? H.tshort(my) + ' avait gagné la dernière fois.' : H.tshort(my) + ' a une revanche à prendre.';
        lastBubble = ' ' + H.tshort(winner) + ' avait remporté la dernière confrontation.';
      }
      const form = input.form || {};
      segments.push({
        type: 'poster', duration: 11, kicker: 'TON MATCH', title: 'L’affiche',
        home: { id: home, name: H.tname(home), rank: pos.get(home) || null, w: rh.w, l: rh.l, form: (form[home] || []).slice(-5), isMine: home === my },
        away: { id: away, name: H.tname(away), rank: pos.get(away) || null, w: ra.w, l: ra.l, form: (form[away] || []).slice(-5), isMine: away === my },
        lastMeeting: last ? {
          label: 'DERNIÈRE CONFRONTATION' + (last.day != null ? ' · JOURNÉE ' + last.day : ''),
          home: { id: last.homeId, name: H.tshort(last.homeId), score: last.homeScore },
          away: { id: last.awayId, name: H.tshort(last.awayId), score: last.awayScore },
          line: lastLine,
        } : null,
        bubble: (pos.get(home) && pos.get(away)
          ? fill('{h}, {rh}, reçoit {a}, {ra}.', { h: H.tshort(home), a: H.tshort(away), rh: ordinal(pos.get(home)), ra: ordinal(pos.get(away)) })
          : fill('{h} reçoit {a}.', { h: H.tshort(home), a: H.tshort(away) })) + lastBubble,
      });

      const lu = input.lineups || {};
      const five = (tid) => (lu[tid] || []).map((pid) => {
        const p = H.player(pid);
        return { id: pid, name: p.name || String(pid), pos: p.pos || '', ppg: p.season && p.season.pts != null ? frNum(round1(p.season.pts)) : '–' };
      });
      const absents = (input.absents || []).filter((a) => a.teamId === home || a.teamId === away)
        .map((a) => ({ name: H.pname(a.playerId), reason: a.reason, side: a.teamId === home ? 'home' : 'away' }));
      lineupSeg = {
        type: 'lineups', duration: 12, kicker: 'TON MATCH', title: 'Les compos officielles', revealAfter: 4,
        home: { id: home, name: H.tname(home), players: five(home), isMine: home === my },
        away: { id: away, name: H.tname(away), players: five(away), isMine: away === my },
        absents,
        bubble: 'Les compos sont tombées ! Découvrons les deux cinq de départ.',
      };
      segments.push(lineupSeg);

      duel = pickDuel(lu[home] || [], lu[away] || [], H);
      if (duel) segments.push(Object.assign({ type: 'duel', duration: 10, kicker: 'TON MATCH', title: 'Le duel à suivre' }, duel));
    }

    // Les affiches de la journée
    const others = fixtures.filter((f) => f !== fx);
    if (others.length) {
      let choc = null;
      const list = others.map((f) => {
        const pa = pos.get(f.homeId) || 99, pb = pos.get(f.awayId) || 99;
        let tag = '';
        const ta = (input.teams || {})[f.homeId] || {}, tb = (input.teams || {})[f.awayId] || {};
        if (pa <= 3 && pb <= 3) tag = 'CHOC AU SOMMET';
        else if (ta.city && ta.city === tb.city) tag = 'DERBY';
        else if (n >= 6 && pa > n - 3 && pb > n - 3) tag = 'BAS DE TABLEAU';
        if (tag === 'CHOC AU SOMMET' && !choc) choc = f;
        return { id: f.id, tag, home: { id: f.homeId, name: H.tname(f.homeId), rank: pa < 99 ? ordinal(pa) : '' }, away: { id: f.awayId, name: H.tname(f.awayId), rank: pb < 99 ? ordinal(pb) : '' }, _k: Math.min(pa, pb) + (tag ? -100 : 0) };
      });
      list.sort((u, v) => u._k - v._k);
      list.forEach((l) => delete l._k);
      segments.push({
        type: 'fixtures', duration: 9, kicker: 'LA LIGUE', title: 'Les affiches de la journée', fixtures: list,
        bubble: choc ? fill('Dans le reste de la ligue, choc au sommet entre {a} et {b}.', { a: H.tshort(choc.homeId), b: H.tshort(choc.awayId) }) : 'Tour d’horizon des autres affiches de la journée.',
      });
    }

    // Classement avant la journée
    const oppOf = new Map();
    for (const f of fixtures) { oppOf.set(f.homeId, f.awayId); oppOf.set(f.awayId, f.homeId); }
    const myPos = pos.get(my);
    segments.push({
      type: 'table', duration: 9, kicker: 'LA LIGUE', title: 'Le classement avant la journée',
      rows: before.map((r, i) => ({
        pos: i + 1, teamId: r.teamId, name: H.tname(r.teamId), w: r.w, l: r.l, pct: Math.round(winPct(r) * 100),
        mine: r.teamId === my, opponentToday: fx && r.teamId === (fx.homeId === my ? fx.awayId : fx.homeId),
        extra: oppOf.has(r.teamId) ? H.tshort(oppOf.get(r.teamId)) : '—',
      })),
      extraLabel: 'ADVERSAIRE DU JOUR',
      note: '',
      bubble: myPos ? fill('Avant cette journée, {t} pointe à la {p} place.', { t: H.tshort(my), p: ordinal(myPos) }) : 'Voici le classement avant cette journée.',
    });

    segments.push({ type: 'ad', duration: 20, kicker: 'COUPURE', title: 'Page de pub', slot: 'prematch', bubble: 'Petite pause avant le coup d’envoi…' });

    const questions = fx ? prematchQuestions(showId, fx, input, H) : [];
    if (questions.length) {
      segments.push({
        type: 'pronostics', duration: 0, kicker: 'À TOI DE JOUER', title: 'Pronostics du match',
        showId, questions, bubble: 'À toi de jouer : fais tes pronostics avant le coup d’envoi !',
      });
    }

    segments.push({
      type: 'kickoff', duration: 0, label: 'Coup d\u2019envoi', kicker: 'COUP D’ENVOI DANS',
      versus: fx ? { home: H.tname(fx.homeId), away: H.tname(fx.awayId) } : null,
      bubble: 'C’est bientôt l’heure ! Bon match à tous.',
    });

    void rnd;
    return {
      kind: 'prematch', showId, day: input.day, myTeamId: my,
      brand: 'L’AVANT-MATCH',
      clock: { label: 'Coup d’envoi', at: input.kickoffAt || null },
      badge: 'Compos verrouillées',
      sponsor: input.sponsor || { name: 'HOOP MANAGER', badge: 'PREMIUM' },
      pronostics: questions.length ? { showId, lockAt: input.kickoffAt || null, questions } : null,
      segments,
    };
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  function pickDuel(homeIds, awayIds, H) {
    const ppg = (id) => { const p = H.player(id); return (p.season && p.season.pts) || 0; };
    if (!homeIds.length || !awayIds.length) return null;
    let best = null;
    for (const a of homeIds) {
      const pa = H.player(a);
      for (const b of awayIds) {
        const pb = H.player(b);
        const samePos = pa.pos && pa.pos === pb.pos;
        const s = ppg(a) + ppg(b) + (samePos ? 8 : 0);
        if (!best || s > best.s) best = { a, b, s };
      }
    }
    const A = H.player(best.a), B = H.player(best.b);
    const sa = A.season || {}, sb = B.season || {};
    const rowsDef = [
      ['Points', 'pts', false, ''], ['Passes décisives', 'ast', false, ''], ['Rebonds', 'reb', false, ''],
      ['Réussite à 3 pts', 'tpPct', false, ' %'], ['Balles perdues', 'tov', true, ''],
    ];
    const rows = [];
    for (const [label, key, lowBetter, unit] of rowsDef) {
      if (sa[key] == null || sb[key] == null) continue;
      const va = round1(sa[key]), vb = round1(sb[key]);
      const m = Math.max(va, vb) || 1;
      const aBest = va === vb ? null : lowBetter ? va < vb : va > vb;
      rows.push({ label, a: frNum(va) + unit, b: frNum(vb) + unit, wa: Math.round((va / m) * 100), wb: Math.round((vb / m) * 100), best: aBest === null ? 'none' : aBest ? 'home' : 'away' });
    }
    return {
      home: { id: best.a, name: A.name, initials: initials(A.name), pos: posLabel(A.pos), team: H.tshort(A.teamId) },
      away: { id: best.b, name: B.name, initials: initials(B.name), pos: posLabel(B.pos), team: H.tshort(B.teamId) },
      rows: rows.slice(0, 4),
      bubble: fill('Le duel de la soirée : {a} contre {b}.', { a: A.name, b: B.name }),
    };
  }
  function posLabel(p) {
    return ({ MEN: 'Meneur', ARR: 'Arrière', AIL: 'Ailier', AF: 'Ailier fort', PIV: 'Pivot', PG: 'Meneur', SG: 'Arrière', SF: 'Ailier', PF: 'Ailier fort', C: 'Pivot' })[p] || p || '';
  }

  function prematchQuestions(showId, fx, input, H) {
    const qs = [];
    qs.push({
      id: showId + ':q:win', kind: 'matchWinner', matchId: fx.id, label: 'Qui gagne le match ?',
      options: [{ id: fx.homeId, label: H.tshort(fx.homeId) }, { id: fx.awayId, label: H.tshort(fx.awayId) }],
    });
    qs.push({
      id: showId + ':q:margin', kind: 'margin', matchId: fx.id, label: 'Quel écart à la fin du match ?',
      options: [{ id: '1-5', label: '1 à 5 points' }, { id: '6-10', label: '6 à 10 points' }, { id: '11+', label: '11 points ou plus' }],
    });
    const lu = input.lineups || {};
    const cands = (lu[fx.homeId] || []).concat(lu[fx.awayId] || [])
      .map((id) => ({ id, ppg: ((H.player(id).season || {}).pts) || 0 }))
      .sort((a, b) => b.ppg - a.ppg).slice(0, 3);
    if (cands.length >= 2) {
      qs.push({
        id: showId + ':q:top', kind: 'topScorer', matchId: fx.id, label: 'Meilleur marqueur du match ?',
        note: 'Parmi ces joueurs',
        options: cands.map((c) => ({ id: c.id, label: H.pname(c.id) })),
      });
    }
    return qs;
  }

  return {
    buildHalftimeShow,
    buildPrematchShow,
    // utilitaires exposés (tests, pronostics, adaptateur)
    boxScore,
    rankTable,
    winPct,
    runs,
    leads,
    initials,
    seeded,
    HALF_LAST_QUARTER,
  };
});
