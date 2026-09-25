/*
 * showPlayer.js — Hoop Manager · Lecteur d'émission (navigateur, sans dépendance)
 *
 *   const player = HoopShowPlayer.mount(container, show, {
 *     premium: false,                          // Premium : pas de page de pub
 *     onAd: ({ slot, element }) => Promise,    // affiche une pub dans element, résout quand elle est finie
 *     onSubmitPronostics: (answers, { showId }) => Promise,
 *     submission: { answers } | null,          // réponses déjà envoyées (reprise de session)
 *     leaderboard: { rank, points } | null,    // position du joueur au classement mondial
 *     prizeText: 'Le n°1 en fin de saison gagne 1 mois de Premium',
 *     onExit: () => {},                        // bouton « Quitter l'émission »
 *     onGoLive: () => {},                      // bouton « Aller au direct » (avant-match)
 *     onClockEnd: () => {},                    // la reprise / le coup d'envoi est atteint
 *     now: () => Date.now(),                   // horloge (à caler sur l'heure serveur)
 *   });
 *   player.destroy();
 *
 * `show` vient de HoopShowData.buildHalftimeShow / buildPrematchShow (JSON, peut transiter par le réseau).
 */
(function (root) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ordinal = (n) => (n === 1 ? '1re' : n + 'e');
  const fmtClock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  const AVATAR = '<svg viewBox="0 0 52 52" aria-hidden="true"><rect width="52" height="52" fill="#e8892f"/><path d="M6 54c2-11 10-16 20-16s18 5 20 16z" fill="#1f2a3d"/><path d="M21 38l5 7 5-7z" fill="#e6ebf2"/><path d="M24.5 40l1.5 5 1.5-5z" fill="#ec6a55"/><rect x="22" y="31" width="8" height="8" fill="#d9a57c"/><ellipse cx="26" cy="23" rx="9.5" ry="11" fill="#f1c29a"/><path d="M16.5 22c0-8 4.5-12.5 10-12.5s9.5 4 9.5 11.5c-2-4-5.5-6.5-10-6.5-4 0-7 2.5-9.5 7.5z" fill="#2b1d14"/><circle cx="22.5" cy="24" r="1.2" fill="#1b1206"/><circle cx="29.5" cy="24" r="1.2" fill="#1b1206"/><path d="M22.5 28.5c2 2 5 2 7 0" stroke="#1b1206" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M15.2 23a10.8 10.8 0 0 1 21.6 0" stroke="#1b1206" stroke-width="2" fill="none"/><rect x="13.2" y="20.5" width="4" height="7.5" rx="2" fill="#1b1206"/><rect x="34.8" y="20.5" width="4" height="7.5" rx="2" fill="#1b1206"/><path d="M15.5 27.5c0 4.5 2.5 6.5 6.5 6.5" stroke="#1b1206" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="22.5" cy="34" r="1.8" fill="#1b1206"/></svg>';
  const ICON = {
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>',
    ball: '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#e8892f" stroke="#b8621c" stroke-width="2.5"/><path d="M2 20h36M20 2v36M7 7c7 6 7 20 0 26M33 7c-7 6-7 20 0 26" stroke="#1b1206" stroke-width="1.6" fill="none"/></svg>',
  };

  const KICKER_TONE = { myMatch: 'mine', poster: 'mine', lineups: 'mine', duel: 'mine', ad: 'muted' };

  function head(seg) {
    const tone = KICKER_TONE[seg.type] || 'accent';
    return '<div class="hs-head"><span class="hs-kicker hs-tone-' + tone + '">' + esc(seg.kicker) + '</span>' +
      '<span class="hs-title">' + esc(seg.title) + '</span>' +
      (seg.subtitle ? '<span class="hs-subtitle">' + esc(seg.subtitle) + '</span>' : '') + '</div>';
  }

  function quarterBoxes(quarters) {
    return '<div class="hs-quarters">' + [0, 1, 2, 3].map((i) => {
      const q = quarters && quarters[i];
      return '<div class="hs-q"><span>Q' + (i + 1) + '</span><b>' + (q ? esc(q[0]) + '–' + esc(q[1]) : '–') + '</b></div>';
    }).join('') + '</div>';
  }

  function court(shots) {
    const W = 600, H = 300;
    let marks = '';
    for (const s of shots || []) {
      const x = (s.x * W).toFixed(1), y = (s.y * H).toFixed(1);
      const cls = s.side === 'home' ? 'hs-shot-home' : 'hs-shot-away';
      marks += s.made
        ? '<circle class="' + cls + '" cx="' + x + '" cy="' + y + '" r="5"/>'
        : '<path class="' + cls + '" d="M' + (x - 4) + ' ' + (y - 4) + 'l8 8M' + (+x + 4) + ' ' + (y - 4) + 'l-8 8"/>';
    }
    return '<svg class="hs-court" viewBox="0 0 600 300" role="img" aria-label="Carte des tirs de la 1re mi-temps">' +
      '<g class="hs-court-lines"><rect x="1" y="1" width="598" height="298" rx="6"/><path d="M300 1V299"/>' +
      '<rect class="hs-paint-home" x="1" y="95" width="100" height="110"/><rect class="hs-paint-away" x="499" y="95" width="100" height="110"/>' +
      '<circle cx="101" cy="150" r="34"/><circle cx="499" cy="150" r="34"/>' +
      '<path d="M1 22L92 22A146 146 0 0 1 92 278L1 278"/><path d="M599 22L508 22A146 146 0 0 0 508 278L599 278"/>' +
      '<circle cx="20" cy="150" r="5"/><path d="M10 140V160"/><circle cx="580" cy="150" r="5"/><path d="M590 140V160"/>' +
      '<circle cx="300" cy="150" r="34"/></g>' +
      '<g class="hs-shots">' + marks + '</g></svg>';
  }

  /* ------------------------------------------------------------ rubriques */

  const R = {};

  R.intro = (seg, st, ctx) =>
    '<div class="hs-center hs-intro">' +
    '<div class="hs-overline">' + esc(seg.kicker) + '</div>' +
    '<div class="hs-mega">' + esc(seg.title) + (seg.titleAccent ? (seg.title.endsWith('-') ? '' : '<br>') + '<span class="hs-accent">' + esc(seg.titleAccent) + '</span>' : '') + '</div>' +
    (seg.versus ? '<div class="hs-versus"><span class="hs-c-home">' + esc(seg.versus.home) + '</span><span class="hs-dim">vs</span><span class="hs-c-away">' + esc(seg.versus.away) + '</span></div>' : '') +
    (seg.subtitle ? '<div class="hs-lead">' + esc(seg.subtitle) + '</div>' : '') +
    '<div class="hs-presented"><span>PRÉSENTÉ PAR</span>' + sponsorBig(ctx.sponsor) + '</div></div>';

  function sponsorBig(sp) {
    return '<div class="hs-sponsor-big">' + ICON.ball + '<span><b>' + esc(sp.name) + '</b>' + (sp.badge ? '<i>' + esc(sp.badge) + '</i>' : '') + '</span></div>';
  }
  function sponsorSmall(sp) {
    return '<span class="hs-sponsor-small"><b>' + esc(sp.name) + '</b>' + (sp.badge ? '<i>' + esc(sp.badge) + '</i>' : '') + '</span>';
  }

  R.myMatch = (seg) =>
    head(seg) +
    '<div class="hs-card hs-score">' +
    '<div class="hs-team"><span class="hs-tname">' + esc(seg.home.name) + '</span><span class="hs-big hs-c-home">' + esc(seg.home.score) + '</span></div>' +
    '<div class="hs-mid"><span class="hs-label">MI-TEMPS</span>' + quarterBoxes(seg.quarters) + '</div>' +
    '<div class="hs-team"><span class="hs-tname">' + esc(seg.away.name) + '</span><span class="hs-big hs-c-away">' + esc(seg.away.score) + '</span></div></div>' +
    '<div class="hs-grid hs-grid-court">' +
    '<div class="hs-card"><div class="hs-row-between"><span class="hs-label">CARTE DES TIRS · 1RE MI-TEMPS</span><span class="hs-legend">○ réussi · ✕ raté</span></div>' + court(seg.shots) + '</div>' +
    '<div class="hs-col">' +
    '<div class="hs-card"><span class="hs-label">FAITS MARQUANTS</span><ul class="hs-facts">' +
    seg.facts.map((f) => '<li><i class="hs-dot hs-tone-' + esc(f.tone) + '"></i><span>' + esc(f.text) + '</span></li>').join('') + '</ul></div>' +
    (seg.bestPlayer ? '<div class="hs-card hs-best"><div class="hs-avatar-initials hs-mine">' + esc(seg.bestPlayer.initials) + '</div><div class="hs-col-tight"><span class="hs-small">Ton meilleur joueur</span><b>' + esc(seg.bestPlayer.name) + '</b><span class="hs-small hs-light">' + esc(seg.bestPlayer.line) + '</span></div></div>' : '') +
    '</div></div>';

  R.multiplex = (seg) =>
    head(seg) + '<div class="hs-grid hs-grid-2">' +
    seg.matches.map((m) => {
      const lead = m.home.score === m.away.score ? null : m.home.score > m.away.score ? 'home' : 'away';
      const cH = m.mine ? 'hs-c-home' : lead === 'home' ? '' : 'hs-dim2';
      const cA = m.mine ? 'hs-c-away' : lead === 'away' ? '' : 'hs-dim2';
      return '<div class="hs-card hs-mx' + (m.mine ? ' hs-mine-border' : '') + '">' +
        '<div class="hs-mx-line"><span class="hs-tname">' + esc(m.home.name) + '</span>' +
        '<span class="hs-mx-score"><span class="' + cH + '">' + esc(m.home.score) + '</span><span class="hs-dim"> – </span><span class="' + cA + '">' + esc(m.away.score) + '</span></span>' +
        '<span class="hs-tname hs-right">' + esc(m.away.name) + '</span></div>' +
        '<div class="hs-mx-sub">Q1 ' + esc(m.quarters[0][0]) + '–' + esc(m.quarters[0][1]) + ' · Q2 ' + esc(m.quarters[1][0]) + '–' + esc(m.quarters[1][1]) +
        (m.mine ? ' <b class="hs-c-home">· TON MATCH</b>' : '') + '</div></div>';
    }).join('') + '</div>';

  R.matchToWatch = (seg) =>
    head(seg) +
    '<div class="hs-card hs-feature"><span class="hs-tag">' + esc(seg.tag) + '</span>' +
    '<div class="hs-feature-line"><span class="hs-tname-lg">' + esc(seg.home.name) + '</span><span class="hs-huge">' + esc(seg.home.score) + ' <span class="hs-dim">–</span> ' + esc(seg.away.score) + '</span><span class="hs-tname-lg">' + esc(seg.away.name) + '</span></div>' +
    '<div class="hs-quarters">' + seg.quarters.map((q, i) => '<div class="hs-q"><span>Q' + (i + 1) + '</span><b>' + esc(q[0]) + '–' + esc(q[1]) + '</b></div>').join('') + '</div></div>' +
    '<div class="hs-grid hs-grid-3">' + seg.stats.map((s) => '<div class="hs-card hs-col-tight"><span class="hs-small">' + esc(s.label) + '</span><b class="hs-lg">' + esc(s.value) + '</b></div>').join('') + '</div>';

  R.oddStat = (seg) =>
    head(seg) + '<div class="hs-card hs-odd"><div class="hs-odd-big">' + esc(seg.big) + '</div><div class="hs-odd-text">' + esc(seg.text) + '</div><div class="hs-small">' + esc(seg.sub) + '</div></div>';

  R.table = (seg) => {
    const extra = !!seg.extraLabel;
    const trend = (r) => {
      if (extra) return '<span class="hs-small">' + esc(r.extra) + '</span>';
      if (r.trend === 'suspended') return '<b class="hs-accent">En suspens</b>';
      if (r.trend === 'up') return '<b class="hs-c-home">▲ ' + r.move + '</b>';
      if (r.trend === 'down') return '<b class="hs-c-away">▼ ' + r.move + '</b>';
      return '<span class="hs-dim2">=</span>';
    };
    return head(seg) + '<div class="hs-card hs-table"><table><thead><tr><th>#</th><th>ÉQUIPE</th><th>V</th><th>D</th><th>%</th><th class="hs-right">' + (extra ? esc(seg.extraLabel) : 'ÉVOLUTION') + '</th></tr></thead><tbody>' +
      seg.rows.map((r) => '<tr class="' + (r.mine ? 'hs-row-mine' : r.opponentToday ? 'hs-row-opp' : '') + '"><td class="hs-dim2">' + r.pos + '</td><td class="hs-teamcell">' + esc(r.name) + '</td><td>' + r.w + '</td><td>' + r.l + '</td><td class="hs-dim2">' + r.pct + ' %</td><td class="hs-right">' + trend(r) + '</td></tr>').join('') +
      '</tbody></table></div>' + (seg.note ? '<div class="hs-note">' + esc(seg.note) + '</div>' : '');
  };

  R.ad = (seg, st, ctx) =>
    head(seg) + '<div class="hs-ad"><div class="hs-ad-slot" data-hs-ad-slot>' + (ctx.opts.onAd ? '' : ICON.play + '<span>[PUB VIDÉO]</span>') + '</div>' +
    '<div class="hs-progress"><i data-hs-adbar></i></div><div class="hs-small">Premium : pas de page de pub</div></div>';

  R.pronostics = (seg, st, ctx) => {
    const p = ctx.pron;
    const locked = p.status === 'done' || ctx.clockOver;
    const lb = ctx.opts.leaderboard;
    return head(seg) +
      '<div class="hs-grid hs-grid-2">' +
      '<div class="hs-card hs-row-between"><span class="hs-iconline">' + ICON.globe + 'Classement mondial des pronostiqueurs</span><b class="hs-accent hs-lg">' + (lb ? esc(lb.rank) + 'e · ' + esc(lb.points) + ' pts' : '—') + '</b></div>' +
      '<div class="hs-card hs-prize">' + ICON.trophy + '<span>' + esc(ctx.opts.prizeText || 'Le n°1 en fin de saison gagne 1 mois de Premium') + '</span></div></div>' +
      '<div class="hs-grid hs-grid-3">' + seg.questions.map((q) =>
        '<div class="hs-card hs-question"><b>' + esc(q.label) + '</b>' + (q.note ? '<span class="hs-small">' + esc(q.note) + '</span>' : '') +
        '<div class="hs-options">' + q.options.map((o) => {
          const sel = p.answers[q.id] === String(o.id);
          return '<button type="button" class="hs-opt' + (sel ? ' is-on' : '') + '"' + (locked ? ' disabled' : '') + ' data-hs-action="answer" data-q="' + esc(q.id) + '" data-o="' + esc(o.id) + '" aria-pressed="' + sel + '">' + esc(o.label) + '</button>';
        }).join('') + '</div></div>').join('') + '</div>' +
      '<div class="hs-actions">' +
      (p.status === 'done'
        ? '<span class="hs-ok">✓ Pronostics enregistrés</span>'
        : ctx.clockOver ? '<span class="hs-small">Pronostics verrouillés.</span>'
          : '<button type="button" class="hs-btn-outline" data-hs-action="validate"' + (p.status === 'sending' ? ' disabled' : '') + '>Valider</button>') +
      (p.error ? '<span class="hs-err">' + esc(p.error) + '</span>' : '') +
      '<span class="hs-small">+10 points par bon pronostic. Aucun effet sur ton club.</span></div>';
  };

  R.poster = (seg) => {
    const side = (t, cls) => '<div class="hs-team"><span class="hs-tname-lg">' + esc(t.name) + '</span><span class="hs-big ' + cls + '">' + (t.rank ? esc(ordinal(t.rank)) : '–') + '</span><span class="hs-small">' + t.w + ' victoire' + (t.w > 1 ? 's' : '') + ' · ' + t.l + ' défaite' + (t.l > 1 ? 's' : '') + '</span></div>';
    const form = (t) => '<div class="hs-row-between"><b>' + esc(t.name) + '</b><span class="hs-form">' + (t.form.length ? t.form.map((r) => '<i class="' + (r === 'V' ? 'hs-w' : 'hs-l') + '">' + esc(r) + '</i>').join('') : '<span class="hs-small">—</span>') + '</span></div>';
    const lm = seg.lastMeeting;
    return head(seg) +
      '<div class="hs-card hs-score hs-poster">' + side(seg.home, 'hs-c-home') + '<div class="hs-mid"><span class="hs-vs">VS</span><span class="hs-label">' + (seg.home.isMine ? 'À DOMICILE' : 'À L’EXTÉRIEUR') + '</span></div>' + side(seg.away, 'hs-c-away') + '</div>' +
      '<div class="hs-grid hs-grid-2"><div class="hs-card hs-col"><span class="hs-label">FORME · 5 DERNIERS MATCHS</span>' + form(seg.home) + form(seg.away) + '</div>' +
      (lm ? '<div class="hs-card hs-col"><span class="hs-label">' + esc(lm.label) + '</span><div class="hs-row-between"><b>' + esc(lm.home.name) + '</b><span class="hs-mx-score">' + esc(lm.home.score) + '<span class="hs-dim"> – </span>' + esc(lm.away.score) + '</span><b>' + esc(lm.away.name) + '</b></div><span class="hs-small hs-light">' + esc(lm.line) + '</span></div>'
        : '<div class="hs-card hs-col"><span class="hs-label">DERNIÈRE CONFRONTATION</span><span class="hs-small">Première rencontre entre ces deux équipes.</span></div>') +
      '</div>';
  };

  R.lineups = (seg, st) => {
    const revealed = st.elapsed >= (seg.revealAfter || 0) || st.revealAll;
    const list = (t) => t.players.map((p) => '<li><span class="hs-pos">' + esc(p.pos) + '</span><b>' + esc(p.name) + '</b><span>' + esc(p.ppg) + '</span></li>').join('');
    const block = (t, cls, hide) => '<div class="hs-card hs-lineup ' + cls + '"><div class="hs-row-between"><b class="' + (cls === 'hs-side-home' ? 'hs-c-home' : 'hs-c-away') + '">' + esc(t.name) + '</b><span class="hs-small">pts / match</span></div>' +
      (hide ? '<div class="hs-reveal"><b class="hs-c-away" data-hs-reveal>' + Math.max(1, Math.ceil((seg.revealAfter || 0) - st.elapsed)) + '</b><span class="hs-small">Révélation de la compo adverse…</span></div>' : '<ul>' + list(t) + '</ul>') + '</div>';
    // La compo de MON équipe est visible tout de suite, celle de l'adversaire est « révélée ».
    const hideHome = !revealed && !seg.home.isMine, hideAway = !revealed && !seg.away.isMine;
    return head(seg) + '<div class="hs-grid hs-grid-2">' + block(seg.home, 'hs-side-home', hideHome) + block(seg.away, 'hs-side-away', hideAway) + '</div>' +
      (seg.absents && seg.absents.length ? '<div class="hs-card hs-absents"><span class="hs-label">ABSENTS</span>' + seg.absents.map((a) => '<span class="hs-chip hs-chip-' + esc(a.side) + '">' + esc(a.name) + ' · ' + esc(a.reason) + '</span>').join('') + '</div>' : '');
  };

  R.duel = (seg) =>
    head(seg) + '<div class="hs-card hs-duel">' +
    '<div class="hs-duel-top"><div class="hs-duel-p"><div class="hs-avatar-initials hs-mine">' + esc(seg.home.initials) + '</div><div class="hs-col-tight"><b class="hs-lg">' + esc(seg.home.name) + '</b><span class="hs-small">' + esc(seg.home.pos) + ' · ' + esc(seg.home.team) + '</span></div></div>' +
    '<span class="hs-vs">VS</span>' +
    '<div class="hs-duel-p hs-rev"><div class="hs-col-tight hs-right"><b class="hs-lg">' + esc(seg.away.name) + '</b><span class="hs-small">' + esc(seg.away.pos) + ' · ' + esc(seg.away.team) + '</span></div><div class="hs-avatar-initials hs-opp">' + esc(seg.away.initials) + '</div></div></div>' +
    seg.rows.map((r) => '<div class="hs-duel-row"><b class="' + (r.best === 'home' ? 'hs-c-home' : 'hs-dim2') + '">' + esc(r.a) + '</b><span class="hs-bar hs-bar-l"><i style="width:' + r.wa + '%"></i></span><span class="hs-small hs-center-t">' + esc(r.label) + '</span><span class="hs-bar"><i style="width:' + r.wb + '%"></i></span><b class="hs-right ' + (r.best === 'away' ? 'hs-c-away' : 'hs-dim2') + '">' + esc(r.b) + '</b></div>').join('') +
    '</div>';

  R.fixtures = (seg) =>
    head(seg) + '<div class="hs-col">' + seg.fixtures.map((f) =>
      '<div class="hs-card hs-fixture' + (f.tag === 'CHOC AU SOMMET' ? ' hs-gold-border' : '') + '"><span>' + (f.tag ? '<span class="hs-tag hs-tag-sm">' + esc(f.tag) + '</span>' : '') + '</span>' +
      '<span class="hs-right"><b>' + esc(f.home.name) + '</b> <span class="hs-dim2">' + esc(f.home.rank) + '</span></span><span class="hs-vs hs-vs-sm">VS</span><span><span class="hs-dim2">' + esc(f.away.rank) + '</span> <b>' + esc(f.away.name) + '</b></span></div>').join('') + '</div>';

  R.kickoff = (seg, st, ctx) =>
    '<div class="hs-center"><div class="hs-overline">' + esc(seg.kicker) + '</div><div class="hs-bigclock" data-hs-clock>' + esc(ctx.clockText) + '</div>' +
    (seg.versus ? '<div class="hs-versus"><span class="hs-c-home">' + esc(seg.versus.home) + '</span><span class="hs-dim">vs</span><span class="hs-c-away">' + esc(seg.versus.away) + '</span></div>' : '') +
    '<button type="button" class="hs-btn-live" data-hs-action="golive">Aller au direct</button></div>';

  /* -------------------------------------------------------------- montage */

  function mount(container, show, opts) {
    opts = opts || {};
    const now = opts.now || (() => Date.now());
    const segs = show.segments || [];
    const st = { i: 0, elapsed: 0, last: now(), adPending: false, revealAll: false, destroyed: false };
    const pron = {
      answers: Object.assign({}, (opts.submission && opts.submission.answers) || {}),
      status: opts.submission ? 'done' : 'idle', error: '',
    };
    let clockEndFired = false;
    const sponsor = show.sponsor || { name: 'HOOP MANAGER', badge: 'PREMIUM' };

    container.innerHTML = '';
    const rootEl = document.createElement('div');
    rootEl.className = 'hs-root';
    rootEl.innerHTML =
      '<header class="hs-top"><div class="hs-brand"><div class="hs-brand-title">' + esc(show.brand) + '</div><div class="hs-brand-sub" data-hs-sub></div></div>' +
      '<nav class="hs-bars" aria-label="Rubriques">' + segs.map((s, i) => '<button type="button" class="hs-barbtn" data-hs-action="go" data-i="' + i + '" aria-label="' + esc(s.label || s.title || s.type) + '"><span><i></i></span></button>').join('') + '</nav>' +
      '<div class="hs-top-right">' + (show.badge ? '<span class="hs-pill hs-pill-muted">' + ICON.lock + esc(show.badge) + '</span>' : '') +
      '<span class="hs-pill hs-mono" data-hs-topclock></span>' +
      '<button type="button" class="hs-btn-ghost" data-hs-action="exit">Quitter l’émission</button></div></header>' +
      '<main class="hs-stage"><div class="hs-inner" data-hs-body aria-live="polite"></div></main>' +
      '<footer class="hs-bottom"><div class="hs-avatar">' + AVATAR + '</div>' +
      '<div class="hs-bubble"><b>Max · présentateur</b><span data-hs-bubble></span></div>' +
      '<div class="hs-presented-small"><span>Présenté par</span>' + sponsorSmall(sponsor) + '</div>' +
      '<div class="hs-nav"><button type="button" class="hs-btn-ghost" data-hs-action="prev">← Précédent</button><button type="button" class="hs-btn-next" data-hs-action="next"></button></div></footer>';
    container.appendChild(rootEl);

    const $ = (sel) => rootEl.querySelector(sel);
    const body = $('[data-hs-body]');

    function clockMs() { return show.clock && show.clock.at ? show.clock.at - now() : null; }
    function clockText() { const ms = clockMs(); return ms == null ? '--:--' : fmtClock(ms); }

    function ctx() { const ms = clockMs(); return { opts, pron, sponsor, clockText: clockText(), clockOver: ms != null && ms <= 0 }; }

    function render() {
      const seg = segs[st.i];
      if (!seg) return;
      body.innerHTML = '<section class="hs-seg hs-seg-' + esc(seg.type) + '">' + (R[seg.type] ? R[seg.type](seg, st, ctx()) : head(seg)) + '</section>';
      $('[data-hs-sub]').textContent = (st.i + 1) + '/' + segs.length + ' · ' + (seg.label || seg.title || '');
      $('[data-hs-bubble]').textContent = seg.bubble || '';
      const next = $('.hs-btn-next');
      next.textContent = seg.type === 'ad' ? (opts.premium ? 'Suivant →' : 'Passer (Premium) →') : st.i === segs.length - 1 ? (show.kind === 'prematch' ? 'Aller au direct →' : 'Retour au match →') : 'Suivant →';
      next.disabled = seg.type === 'ad' && !opts.premium && st.adPending;
      $('[data-hs-action="prev"]').disabled = st.i === 0;
      paintBars(); paintClock();
      if (seg.type === 'ad') startAd(seg);
    }

    function paintBars() {
      const seg = segs[st.i];
      const cur = seg && seg.duration ? Math.min(100, (st.elapsed / seg.duration) * 100) : 100;
      rootEl.querySelectorAll('.hs-barbtn i').forEach((el, i) => { el.style.width = (i < st.i ? 100 : i === st.i ? cur : 0) + '%'; });
      const adbar = rootEl.querySelector('[data-hs-adbar]');
      if (adbar) adbar.style.width = cur + '%';
    }
    function paintClock() {
      const t = (show.clock && show.clock.label ? show.clock.label + ' ' : '') + clockText();
      $('[data-hs-topclock]').textContent = t;
      rootEl.querySelectorAll('[data-hs-clock]').forEach((el) => { el.textContent = clockText(); });
      const rv = rootEl.querySelector('[data-hs-reveal]');
      const seg = segs[st.i];
      if (rv && seg) rv.textContent = Math.max(1, Math.ceil((seg.revealAfter || 0) - st.elapsed));
    }

    function goTo(i) {
      if (i < 0 || i >= segs.length) return;
      st.i = i; st.elapsed = 0; st.adPending = false;
      render();
    }

    function startAd(seg) {
      if (opts.premium) { goTo(st.i + 1); return; } // pas de pub pour les Premium
      if (!opts.onAd) return; // placeholder + minuteur (duration)
      st.adPending = true;
      const idx = st.i;
      Promise.resolve()
        .then(() => opts.onAd({ slot: seg.slot, element: rootEl.querySelector('[data-hs-ad-slot]'), kind: show.kind }))
        .catch(() => {})
        .then(() => { if (!st.destroyed && st.i === idx) { st.adPending = false; goTo(idx + 1); } });
    }

    async function sendPronostics() {
      const seg = segs[st.i];
      if (!Object.keys(pron.answers).length) { pron.error = 'Choisis au moins une réponse.'; render(); return; }
      pron.error = ''; pron.status = 'sending'; render();
      try {
        if (opts.onSubmitPronostics) await opts.onSubmitPronostics(Object.assign({}, pron.answers), { showId: seg.showId });
        pron.status = 'done';
      } catch (e) {
        pron.status = 'idle'; pron.error = (e && e.message) || 'Envoi impossible, réessaie.';
      }
      render();
    }

    rootEl.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-hs-action]');
      if (!b || b.disabled) return;
      const a = b.getAttribute('data-hs-action');
      if (a === 'go') goTo(+b.getAttribute('data-i'));
      else if (a === 'prev') goTo(st.i - 1);
      else if (a === 'next') {
        if (st.i === segs.length - 1) { if (show.kind === 'prematch') { if (opts.onGoLive) opts.onGoLive(); } else if (opts.onExit) opts.onExit(); }
        else goTo(st.i + 1);
      } else if (a === 'exit') { if (opts.onExit) opts.onExit(); }
      else if (a === 'golive') { if (opts.onGoLive) opts.onGoLive(); }
      else if (a === 'answer') {
        if (pron.status === 'done') return;
        pron.answers[b.getAttribute('data-q')] = b.getAttribute('data-o');
        pron.error = ''; render();
      } else if (a === 'validate') sendPronostics();
    });

    const timer = setInterval(() => {
      const t = now();
      const dt = (t - st.last) / 1000;
      st.last = t;
      const seg = segs[st.i];
      if (!seg) return;
      const wasHidden = seg.type === 'lineups' && st.elapsed < (seg.revealAfter || 0);
      if (!st.adPending) st.elapsed += dt;
      if (wasHidden && st.elapsed >= (seg.revealAfter || 0)) render();
      if (seg.duration > 0 && st.elapsed >= seg.duration && !st.adPending && st.i < segs.length - 1) goTo(st.i + 1);
      paintBars(); paintClock();
      const ms = clockMs();
      if (ms != null && ms <= 0 && !clockEndFired) {
        clockEndFired = true;
        if (segs[st.i] && segs[st.i].type === 'pronostics') render();
        if (opts.onClockEnd) opts.onClockEnd();
      }
    }, 250);

    render();

    return {
      goTo,
      destroy() { st.destroyed = true; clearInterval(timer); container.innerHTML = ''; },
      setLeaderboard(lb) { opts.leaderboard = lb; if (segs[st.i] && segs[st.i].type === 'pronostics') render(); },
      get index() { return st.i; },
    };
  }

  root.HoopShowPlayer = { mount };
})(typeof window !== 'undefined' ? window : this);
