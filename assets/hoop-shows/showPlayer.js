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
 *     // Habillage du jeu (tous optionnels, voir makeDress) :
 *     team: (id) => ({ logo: (size) => html, color, altColor }) | null,
 *     player: (id, size) => html de l'avatar | '',
 *     logo: 'url du logo Hoop Manager',
 *     presenter: 'html de l'avatar du présentateur',
 *     presenterName: 'Nicolas Cosset',
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

  /* ------------------------------------------------ habillage « du jeu »
   * Retour utilisateur (2026-09-26) : « reprends l'esprit de la DA des autres
   * pages du jeu pour le show d'avant-match et de la mi-temps ». Le jeu
   * fournit (tous optionnels, repli propre sans) :
   *   opts.team(id)    -> { logo(size) : html de l'écusson, color, altColor } | null
   *   opts.player(id)  -> html de l'avatar du joueur | ''
   *   opts.logo        -> URL du logo Hoop Manager
   *   opts.presenter   -> html de l'avatar du présentateur
   * Couleurs d'équipe : maillot du club qui reçoit, maillot extérieur de
   * l'autre en cas de même couleur, maillot trop sombre éclairci (même règle
   * que la page live, assets/live/live-view.js:readable).
   * ------------------------------------------------------------------- */
  const DEFAULT_COLORS = ['#F26B1D', '#3B8FE0'];
  function hexRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function readable(hex) {
    const rgb = hexRgb(hex);
    if (!rgb) return null;
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    if (L >= 0.16) return hex;
    const k = L < 0.03 ? 0.6 : 0.38;
    return '#' + rgb.map((c) => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0')).join('');
  }
  const initialsOf = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  function makeDress(opts) {
    const teamCache = new Map(), avCache = new Map(), crestCache = new Map();
    const team = (id) => {
      if (id == null) return null;
      if (!teamCache.has(id)) { let t = null; try { t = opts.team ? opts.team(String(id)) : null; } catch (e) { t = null; } teamCache.set(id, t); }
      return teamCache.get(id);
    };
    return {
      team,
      crest(id, size, name) {
        const key = id + '|' + size;
        if (!crestCache.has(key)) {
          const t = team(id);
          let inner = '';
          try { inner = t && t.logo ? t.logo(size) : ''; } catch (e) { inner = ''; }
          crestCache.set(key, inner
            ? '<span class="hs-crest" style="width:' + size + 'px;height:' + size + 'px">' + inner + '</span>'
            : '<span class="hs-crest hs-crest-txt" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.32) + 'px">' + esc(initialsOf(name)) + '</span>');
        }
        return crestCache.get(key);
      },
      avatar(id, name, size) {
        const key = id + '|' + size;
        if (!avCache.has(key)) {
          let html = '';
          try { html = opts.player && id != null ? opts.player(String(id), size) : ''; } catch (e) { html = ''; }
          const h = Math.round(size * 130 / 120);
          avCache.set(key, html
            ? '<span class="hs-pav" style="width:' + size + 'px;height:' + h + 'px">' + html + '</span>'
            : '<span class="hs-pav hs-pav-txt" style="width:' + size + 'px;height:' + h + 'px;font-size:' + Math.round(size * 0.34) + 'px">' + esc(initialsOf(name)) + '</span>');
        }
        return avCache.get(key);
      },
      // Variables CSS de couleur pour un duel domicile/extérieur.
      pair(homeId, awayId) {
        const h = team(homeId), a = team(awayId);
        let c0 = (h && h.color) || null, c1 = (a && a.color) || null;
        if (c0 && c1 && c0.toLowerCase() === c1.toLowerCase()) c1 = (a && a.altColor && a.altColor.toLowerCase() !== c0.toLowerCase()) ? a.altColor : null;
        c0 = c0 || DEFAULT_COLORS[0]; c1 = c1 || DEFAULT_COLORS[1];
        const i0 = readable(c0) || DEFAULT_COLORS[0], i1 = readable(c1) || DEFAULT_COLORS[1];
        return ' style="--hs-stripe0:' + c0 + ';--hs-stripe1:' + c1 + ';--hs-home:' + i0 + ';--hs-away:' + i1 + '"';
      },
    };
  }

  function head(seg) {
    const tone = KICKER_TONE[seg.type] || 'accent';
    return '<div class="hs-head"><span class="hs-kicker hs-tone-' + tone + '">' + esc(seg.kicker) + '</span>' +
      '<span class="hs-title">' + esc(seg.title) + '</span>' +
      (seg.subtitle ? '<span class="hs-subtitle">' + esc(seg.subtitle) + '</span>' : '') + '</div>';
  }

  function quarterTable(seg, D) {
    const qs = [0, 1, 2, 3];
    const cell = (i, side) => { const q = seg.quarters && seg.quarters[i]; return '<td>' + (q ? esc(q[side]) : '–') + '</td>'; };
    const row = (t, side, cls) => '<tr><td><i class="hs-qdot ' + cls + '"></i>' + esc(t.name) + '</td>' + qs.map((i) => cell(i, side)).join('') + '<td class="hs-qtot">' + esc(t.score) + '</td></tr>';
    return '<table class="hs-qt"><thead><tr><th></th>' + qs.map((i) => '<th>Q' + (i + 1) + '</th>').join('') + '<th>Total</th></tr></thead><tbody>' +
      row(seg.home, 0, 'hs-bg-home') + row(seg.away, 1, 'hs-bg-away') + '</tbody></table>';
  }

  // Bandeau façon « Prochain match » / page live : fond scindé, liserés aux
  // couleurs de maillot, écussons, noms en capitales, badge « Mon club ».
  function board(seg, D, o) {
    const side = (t, cls) => '<div class="hs-bteam ' + cls + '">' + D.crest(t.id, 76, t.name) +
      '<div class="hs-binfo"><div class="hs-bname">' + esc(t.name) + (t.isMine ? '<span class="hs-mine-badge">Mon club</span>' : '') + '</div>' +
      (o.meta ? '<div class="hs-bmeta">' + o.meta(t) + '</div>' : '') + '</div></div>';
    const lead = seg.home.score === seg.away.score ? null : seg.home.score > seg.away.score ? 'home' : 'away';
    const score = (t, which) => o.noScore ? '' : '<div class="hs-bscore' + (lead && lead !== which ? ' hs-trail' : '') + '">' + esc(t.score) + '</div>';
    return '<div class="hs-board"' + D.pair(seg.home.id, seg.away.id) + '><div class="hs-board-split"></div>' +
      '<svg class="hs-board-court" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true"><circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="100" cy="100" r="30" fill="none" stroke="currentColor" stroke-width="3"/><path d="M100 0V200" stroke="currentColor" stroke-width="3"/></svg>' +
      '<div class="hs-board-kicker"><span class="hs-comp">' + esc(o.kicker || '') + '</span><span>' + esc(o.kickerRight || '') + '</span></div>' +
      '<div class="hs-board-top">' + side(seg.home, 'hs-home-side') + score(seg.home, 'home') +
      '<div class="hs-bcenter"><div class="hs-bclock">' + esc(o.center) + '</div>' + (o.period ? '<div class="hs-bperiod">' + esc(o.period) + '</div>' : '') + '</div>' +
      score(seg.away, 'away') + side(seg.away, 'hs-away-side') + '</div>' +
      (o.bottom ? '<div class="hs-board-bottom">' + o.bottom + '</div>' : '') + '</div>';
  }

  function court(shots, D, homeId, homeName) {
    const W = 600, H = 300;
    let marks = '';
    for (const s of shots || []) {
      const x = (s.x * W).toFixed(1), y = (s.y * H).toFixed(1);
      const cls = s.side === 'home' ? 'hs-shot-home' : 'hs-shot-away';
      marks += s.made
        ? '<circle class="' + cls + ' hs-made" cx="' + x + '" cy="' + y + '" r="5.5"/>'
        : '<path class="' + cls + ' hs-miss" d="M' + (x - 4) + ' ' + (y - 4) + 'l8 8M' + (+x + 4) + ' ' + (y - 4) + 'l-8 8"/>';
    }
    return '<div class="hs-court-wrap"><svg class="hs-court" viewBox="0 0 600 300" role="img" aria-label="Carte des tirs de la 1re mi-temps">' +
      '<g class="hs-court-lines"><rect x="1" y="1" width="598" height="298" rx="6"/><path d="M300 1V299"/>' +
      '<rect class="hs-paint-home" x="1" y="95" width="100" height="110"/><rect class="hs-paint-away" x="499" y="95" width="100" height="110"/>' +
      '<circle cx="101" cy="150" r="34"/><circle cx="499" cy="150" r="34"/>' +
      '<path d="M1 22L92 22A146 146 0 0 1 92 278L1 278"/><path d="M599 22L508 22A146 146 0 0 0 508 278L599 278"/>' +
      '<circle cx="20" cy="150" r="5"/><path d="M10 140V160"/><circle cx="580" cy="150" r="5"/><path d="M590 140V160"/>' +
      '<circle cx="300" cy="150" r="34"/></g>' +
      '<g class="hs-shots">' + marks + '</g></svg>' +
      (homeId != null ? '<div class="hs-court-logo">' + D.crest(homeId, 60, homeName) + '</div>' : '') + '</div>';
  }

  /* ------------------------------------------------------------ rubriques */

  const R = {};

  function logoBlock(ctx, big) {
    const sp = ctx.sponsor;
    if (ctx.opts.logo) {
      return '<span class="' + (big ? 'hs-sponsor-big' : 'hs-sponsor-small') + '"><img class="hs-logo" src="' + esc(ctx.opts.logo) + '" alt="' + esc(sp.name) + '">' +
        (sp.badge ? '<i>' + esc(sp.badge) + '</i>' : '') + '</span>';
    }
    return big
      ? '<div class="hs-sponsor-big">' + ICON.ball + '<span><b>' + esc(sp.name) + '</b>' + (sp.badge ? '<i>' + esc(sp.badge) + '</i>' : '') + '</span></div>'
      : '<span class="hs-sponsor-small"><b>' + esc(sp.name) + '</b>' + (sp.badge ? '<i>' + esc(sp.badge) + '</i>' : '') + '</span>';
  }

  function versus(v, D) {
    if (!v) return '';
    const ids = v.homeId != null ? [v.homeId, v.awayId] : [null, null];
    return '<div class="hs-versus"' + (ids[0] != null ? D.pair(ids[0], ids[1]) : '') + '>' +
      '<span class="hs-vteam">' + (ids[0] != null ? D.crest(ids[0], 44, v.home) : '') + '<span class="hs-c-home">' + esc(v.home) + '</span></span>' +
      '<span class="hs-dim">vs</span>' +
      '<span class="hs-vteam"><span class="hs-c-away">' + esc(v.away) + '</span>' + (ids[1] != null ? D.crest(ids[1], 44, v.away) : '') + '</span></div>';
  }

  R.intro = (seg, st, ctx) =>
    '<div class="hs-center hs-intro">' +
    '<div class="hs-overline">' + esc(seg.kicker) + '</div>' +
    '<div class="hs-mega">' + esc(seg.title) + (seg.titleAccent ? (seg.title.endsWith('-') ? '' : '<br>') + '<span class="hs-accent">' + esc(seg.titleAccent) + '</span>' : '') + '</div>' +
    versus(seg.versus, ctx.D) +
    (seg.subtitle ? '<div class="hs-lead">' + esc(seg.subtitle) + '</div>' : '') +
    '<div class="hs-presented"><span>PRÉSENTÉ PAR</span>' + logoBlock(ctx, true) + '</div></div>';

  R.myMatch = (seg, st, ctx) => {
    const D = ctx.D;
    const bp = seg.bestPlayer;
    return head(seg) +
      board(seg, D, { kicker: 'Championnat · Journée ' + ctx.show.day, kickerRight: seg.home.isMine ? 'À domicile' : 'À l’extérieur', center: 'Mi-temps', period: 'Reprise au 3e quart', bottom: quarterTable(seg, D) }) +
      '<div class="hs-grid hs-grid-court"' + D.pair(seg.home.id, seg.away.id) + '>' +
      '<div class="hs-card"><div class="hs-row-between"><span class="hs-label">Carte des tirs · 1re mi-temps</span><span class="hs-legend"><i class="hs-lg-made"></i>réussi <i class="hs-lg-miss">✕</i>raté</span></div>' + court(seg.shots, D, seg.home.id, seg.home.name) + '</div>' +
      '<div class="hs-col">' +
      '<div class="hs-card"><span class="hs-label">Faits marquants</span><ul class="hs-facts">' +
      seg.facts.map((f) => '<li class="hs-tone-' + esc(f.tone) + '"><span>' + esc(f.text) + '</span></li>').join('') + '</ul></div>' +
      (bp ? '<div class="hs-card hs-best"><span class="hs-label">Ton meilleur joueur</span><div class="hs-best-row">' + D.avatar(bp.id, bp.name, 56) +
        '<div class="hs-col-tight"><b class="hs-lg">' + esc(bp.name) + '</b><span class="hs-small hs-light">' + esc(bp.line) + '</span></div></div></div>' : '') +
      '</div></div>';
  };

  R.multiplex = (seg, st, ctx) => {
    const D = ctx.D;
    return head(seg) + '<div class="hs-grid hs-grid-2">' +
      seg.matches.map((m) => {
        const lead = m.home.score === m.away.score ? null : m.home.score > m.away.score ? 'home' : 'away';
        return '<div class="hs-card hs-mx' + (m.mine ? ' hs-mine-border' : '') + '"' + D.pair(m.home.id, m.away.id) + '>' +
          (m.mine ? '<span class="hs-mine-badge hs-mx-badge">Ton match</span>' : '') +
          '<div class="hs-mx-line"><span class="hs-mx-team">' + D.crest(m.home.id, 34, m.home.name) + '<span class="hs-tname">' + esc(m.home.name) + '</span></span>' +
          '<span class="hs-mx-score"><span class="' + (lead === 'away' ? 'hs-trail' : '') + '">' + esc(m.home.score) + '</span><span class="hs-dim"> – </span><span class="' + (lead === 'home' ? 'hs-trail' : '') + '">' + esc(m.away.score) + '</span></span>' +
          '<span class="hs-mx-team hs-right"><span class="hs-tname">' + esc(m.away.name) + '</span>' + D.crest(m.away.id, 34, m.away.name) + '</span></div>' +
          '<div class="hs-mx-sub">Q1 ' + esc(m.quarters[0][0]) + '–' + esc(m.quarters[0][1]) + ' · Q2 ' + esc(m.quarters[1][0]) + '–' + esc(m.quarters[1][1]) + '</div></div>';
      }).join('') + '</div>';
  };

  R.matchToWatch = (seg, st, ctx) =>
    head(seg) +
    board(seg, ctx.D, { kicker: seg.tag, kickerRight: 'Le match à suivre', center: 'Mi-temps',
      bottom: '<div class="hs-quarters">' + seg.quarters.map((q, i) => '<div class="hs-q"><span>Q' + (i + 1) + '</span><b>' + esc(q[0]) + '–' + esc(q[1]) + '</b></div>').join('') + '</div>' }) +
    '<div class="hs-grid hs-grid-3">' + seg.stats.map((s) => '<div class="hs-card hs-tile"><span class="hs-label">' + esc(s.label) + '</span><b class="hs-lg">' + esc(s.value) + '</b></div>').join('') + '</div>';

  R.oddStat = (seg) =>
    head(seg) + '<div class="hs-card hs-odd"><div class="hs-odd-big">' + esc(seg.big) + '</div><div class="hs-odd-text">' + esc(seg.text) + '</div><div class="hs-small">' + esc(seg.sub) + '</div></div>';

  R.table = (seg, st, ctx) => {
    const D = ctx.D;
    const extra = !!seg.extraLabel;
    const trend = (r) => {
      if (extra) return '<span class="hs-small">' + esc(r.extra) + '</span>';
      if (r.trend === 'suspended') return '<span class="hs-pill-sm hs-pill-amber">En suspens</span>';
      if (r.trend === 'up') return '<span class="hs-pill-sm hs-pill-good">▲ ' + r.move + '</span>';
      if (r.trend === 'down') return '<span class="hs-pill-sm hs-pill-bad">▼ ' + r.move + '</span>';
      return '<span class="hs-dim2">=</span>';
    };
    return head(seg) + '<div class="hs-card hs-table"><table><thead><tr><th>#</th><th>Équipe</th><th>V</th><th>D</th><th>%</th><th class="hs-right">' + (extra ? esc(seg.extraLabel) : 'Évolution') + '</th></tr></thead><tbody>' +
      seg.rows.map((r) => '<tr class="' + (r.mine ? 'hs-row-mine' : r.opponentToday ? 'hs-row-opp' : '') + '"><td class="hs-dim2">' + r.pos + '</td><td><span class="hs-teamcell">' + D.crest(r.teamId, 26, r.name) + '<span>' + esc(r.name) + '</span>' + (r.mine ? '<span class="hs-mine-badge">Mon club</span>' : '') + '</span></td><td>' + r.w + '</td><td>' + r.l + '</td><td class="hs-dim2">' + r.pct + ' %</td><td class="hs-right">' + trend(r) + '</td></tr>').join('') +
      '</tbody></table></div>' + (seg.note ? '<div class="hs-note">' + esc(seg.note) + '</div>' : '');
  };

  R.ad = (seg, st, ctx) =>
    head(seg) + '<div class="hs-ad"><div class="hs-ad-slot" data-hs-ad-slot>' + (ctx.opts.onAd ? '' : ICON.play + '<span>[PUB VIDÉO]</span>') + '</div>' +
    '<div class="hs-progress"><i data-hs-adbar></i></div><div class="hs-small">Premium : pas de page de pub</div></div>';

  R.pronostics = (seg, st, ctx) => {
    const p = ctx.pron;
    const locked = p.status === 'done' || ctx.clockOver;
    const lb = ctx.opts.leaderboard;
    const n = seg.questions.length;
    const answered = seg.questions.filter((q) => p.answers[q.id] != null).length;
    return head(seg) +
      '<div class="hs-grid hs-grid-2">' +
      '<div class="hs-card hs-row-between"><span class="hs-iconline">' + ICON.globe + 'Classement mondial des pronostiqueurs</span><b class="hs-accent hs-lg">' + (lb ? esc(lb.rank) + 'e · ' + esc(lb.points) + ' pts' : '—') + '</b></div>' +
      '<div class="hs-card hs-prize">' + ICON.trophy + '<span>' + esc(ctx.opts.prizeText || 'Le n°1 en fin de saison gagne 1 mois de Premium') + '</span></div></div>' +
      '<div class="hs-grid hs-grid-q">' + seg.questions.map((q, qi) =>
        '<div class="hs-card hs-question' + (p.answers[q.id] != null ? ' is-answered' : '') + '"><span class="hs-qnum">Question ' + (qi + 1) + '/' + n + '</span><b>' + esc(q.label) + '</b>' + (q.note ? '<span class="hs-small">' + esc(q.note) + '</span>' : '') +
        '<div class="hs-options">' + q.options.map((o) => {
          const sel = p.answers[q.id] === String(o.id);
          return '<button type="button" class="hs-opt' + (sel ? ' is-on' : '') + '"' + (locked ? ' disabled' : '') + ' data-hs-action="answer" data-q="' + esc(q.id) + '" data-o="' + esc(o.id) + '" aria-pressed="' + sel + '">' + esc(o.label) + '</button>';
        }).join('') + '</div></div>').join('') + '</div>' +
      '<div class="hs-actions">' +
      (p.status === 'done'
        ? '<span class="hs-ok">✓ Pronostics enregistrés</span>'
        : ctx.clockOver ? '<span class="hs-small">Pronostics verrouillés.</span>'
          : '<button type="button" class="hs-btn-fill" data-hs-action="validate"' + (p.status === 'sending' ? ' disabled' : '') + '>Valider ' + answered + '/' + n + '</button>') +
      (p.error ? '<span class="hs-err">' + esc(p.error) + '</span>' : '') +
      '<span class="hs-small">+10 points par bon pronostic. Aucun effet sur ton club.</span></div>';
  };

  R.poster = (seg, st, ctx) => {
    const D = ctx.D;
    const form = (t) => '<span class="hs-form">' + (t.form.length ? t.form.map((r) => '<i class="' + (r === 'V' ? 'hs-w' : 'hs-l') + '">' + esc(r) + '</i>').join('') : '<span class="hs-small">—</span>') + '</span>';
    const meta = (t) => (t.rank ? '<b>' + esc(ordinal(t.rank)) + '</b> · ' : '') + t.w + ' V · ' + t.l + ' D';
    const lm = seg.lastMeeting;
    return head(seg) +
      board(seg, D, { noScore: true, kicker: 'Championnat · Journée ' + ctx.show.day, kickerRight: seg.home.isMine ? 'À domicile' : 'À l’extérieur', center: 'VS', meta,
        bottom: '<div class="hs-form-row"><span class="hs-label">Forme · 5 derniers matchs</span><span class="hs-form-side">' + form(seg.home) + '</span><span class="hs-form-side hs-right">' + form(seg.away) + '</span></div>' }) +
      (lm ? '<div class="hs-card hs-lastmeet"' + D.pair(lm.home.id, lm.away.id) + '><span class="hs-label">' + esc(lm.label) + '</span><div class="hs-mx-line"><span class="hs-mx-team">' + D.crest(lm.home.id, 30, lm.home.name) + '<b>' + esc(lm.home.name) + '</b></span><span class="hs-mx-score">' + esc(lm.home.score) + '<span class="hs-dim"> – </span>' + esc(lm.away.score) + '</span><span class="hs-mx-team hs-right"><b>' + esc(lm.away.name) + '</b>' + D.crest(lm.away.id, 30, lm.away.name) + '</span></div><span class="hs-small hs-light">' + esc(lm.line) + '</span></div>'
        : '<div class="hs-card"><span class="hs-label">Dernière confrontation</span><div class="hs-small" style="margin-top:6px">Première rencontre entre ces deux équipes.</div></div>');
  };

  R.lineups = (seg, st, ctx) => {
    const D = ctx.D;
    const revealed = st.elapsed >= (seg.revealAfter || 0) || st.revealAll;
    const list = (t) => t.players.map((p) => '<li>' + D.avatar(p.id, p.name, 34) + '<span class="hs-pos">' + esc(p.pos) + '</span><b>' + esc(p.name) + '</b><span class="hs-ppg">' + esc(p.ppg) + '</span></li>').join('');
    const block = (t, cls, hide) => '<div class="hs-card hs-lineup ' + cls + '"><div class="hs-row-between"><span class="hs-lu-team">' + D.crest(t.id, 36, t.name) + '<b>' + esc(t.name) + '</b>' + (t.isMine ? '<span class="hs-mine-badge">Mon club</span>' : '') + '</span><span class="hs-small">pts / match</span></div>' +
      (hide ? '<div class="hs-reveal"><b data-hs-reveal>' + Math.max(1, Math.ceil((seg.revealAfter || 0) - st.elapsed)) + '</b><span class="hs-small">Révélation de la compo adverse…</span></div>' : '<ul>' + list(t) + '</ul>') + '</div>';
    // La compo de MON équipe est visible tout de suite, celle de l'adversaire est « révélée ».
    const hideHome = !revealed && !seg.home.isMine, hideAway = !revealed && !seg.away.isMine;
    return head(seg) + '<div class="hs-grid hs-grid-2"' + D.pair(seg.home.id, seg.away.id) + '>' + block(seg.home, 'hs-side-home', hideHome) + block(seg.away, 'hs-side-away', hideAway) + '</div>' +
      (seg.absents && seg.absents.length ? '<div class="hs-card hs-absents"' + D.pair(seg.home.id, seg.away.id) + '><span class="hs-label">Absents</span>' + seg.absents.map((a) => '<span class="hs-chip hs-chip-' + esc(a.side) + '">' + esc(a.name) + ' · ' + esc(a.reason) + '</span>').join('') + '</div>' : '');
  };

  R.duel = (seg, st, ctx) => {
    const D = ctx.D;
    return head(seg) + '<div class="hs-card hs-duel">' +
      '<div class="hs-duel-top"><div class="hs-duel-p">' + D.avatar(seg.home.id, seg.home.name, 76) + '<div class="hs-col-tight"><b class="hs-duel-name">' + esc(seg.home.name) + '</b><span class="hs-small">' + esc(seg.home.pos) + ' · ' + esc(seg.home.team) + '</span></div></div>' +
      '<span class="hs-vs">VS</span>' +
      '<div class="hs-duel-p hs-rev"><div class="hs-col-tight hs-right"><b class="hs-duel-name">' + esc(seg.away.name) + '</b><span class="hs-small">' + esc(seg.away.pos) + ' · ' + esc(seg.away.team) + '</span></div>' + D.avatar(seg.away.id, seg.away.name, 76) + '</div></div>' +
      seg.rows.map((r) => '<div class="hs-duel-row"><b class="' + (r.best === 'home' ? 'hs-accent' : 'hs-dim2') + '">' + esc(r.a) + '</b><span class="hs-bar hs-bar-l"><i style="width:' + r.wa + '%"></i></span><span class="hs-small hs-center-t">' + esc(r.label) + '</span><span class="hs-bar"><i style="width:' + r.wb + '%"></i></span><b class="hs-right ' + (r.best === 'away' ? 'hs-accent' : 'hs-dim2') + '">' + esc(r.b) + '</b></div>').join('') +
      '</div>';
  };

  R.fixtures = (seg, st, ctx) => {
    const D = ctx.D;
    return head(seg) + '<div class="hs-col">' + seg.fixtures.map((f) =>
      '<div class="hs-card hs-fixture' + (f.tag === 'CHOC AU SOMMET' ? ' hs-gold-border' : '') + '"><span>' + (f.tag ? '<span class="hs-tag hs-tag-sm">' + esc(f.tag) + '</span>' : '') + '</span>' +
      '<span class="hs-mx-team hs-right"><span class="hs-dim2">' + esc(f.home.rank) + '</span><b>' + esc(f.home.name) + '</b>' + D.crest(f.home.id, 32, f.home.name) + '</span><span class="hs-vs hs-vs-sm">VS</span><span class="hs-mx-team">' + D.crest(f.away.id, 32, f.away.name) + '<b>' + esc(f.away.name) + '</b><span class="hs-dim2">' + esc(f.away.rank) + '</span></span></div>').join('') + '</div>';
  };

  R.kickoff = (seg, st, ctx) =>
    '<div class="hs-center"><div class="hs-overline">' + esc(seg.kicker) + '</div><div class="hs-bigclock" data-hs-clock>' + esc(ctx.clockText) + '</div>' +
    versus(seg.versus, ctx.D) +
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
    const D = makeDress(opts);

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
      '<footer class="hs-bottom"><div class="hs-avatar' + (opts.presenter ? ' hs-avatar-real' : '') + '">' + (opts.presenter || AVATAR) + '</div>' +
      '<div class="hs-bubble"><b>' + esc(opts.presenterName || 'Nicolas Cosset') + ' · présentateur</b><span data-hs-bubble></span></div>' +
      '<div class="hs-presented-small"><span>Présenté par</span>' + logoBlock({ opts, sponsor }, false) + '</div>' +
      '<div class="hs-nav"><button type="button" class="hs-btn-ghost" data-hs-action="prev">← Précédent</button><button type="button" class="hs-btn-next" data-hs-action="next"></button></div></footer>';
    container.appendChild(rootEl);

    const $ = (sel) => rootEl.querySelector(sel);
    const body = $('[data-hs-body]');

    function clockMs() { return show.clock && show.clock.at ? show.clock.at - now() : null; }
    function clockText() { const ms = clockMs(); return ms == null ? '--:--' : fmtClock(ms); }

    function ctx() { const ms = clockMs(); return { opts, pron, sponsor, D, show, clockText: clockText(), clockOver: ms != null && ms <= 0 }; }

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
