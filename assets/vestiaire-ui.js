// =====================================================================
// Onglet « Vestiaire » (Dynamique de groupe, 2026-10-06) : rendu de la vue
// calculée par assets/vestiaire.js (window.HM_VESTIAIRE.buildView) sur le
// club du manager (teamA). Aucune logique de jeu ici : uniquement de
// l'affichage et des liens vers les actions QUI EXISTENT déjà (fiche joueur,
// où se trouvent discussion / contrat / mise en vente ; Tactiques pour la
// compo et les rôles ; Entraînement pour le tutorat).
// Lecture : situation → problèmes → groupes → joueurs → détails.
// =====================================================================
(function () {
  "use strict";
  var state = { tab: "overview" };
  // Contexte d'affichage : null = club du manager (teamA). Le mode
  // Sélectionneur passe sa propre équipe (même vue, même calcul, voir
  // assets/national-coach.js:vestiaireMount) : { holder, team, recent,
  // link(p), playerAttrs(p) }.
  var ctx = null;
  function g(name) { return typeof window[name] === "function" ? window[name] : null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function myTeam() { if (ctx) return ctx.team || null; try { return typeof teamA !== "undefined" ? teamA : null; } catch (e) { return null; } }
  function myLeague() { try { return typeof league !== "undefined" ? league : null; } catch (e) { return null; } }
  function teamIdx() {
    try { if (typeof myTeamIndex === "number" && myTeamIndex >= 0) return myTeamIndex; } catch (e) { /* hors jeu */ }
    var l = myLeague(), t = myTeam(); return l && t && Array.isArray(l.teams) ? l.teams.indexOf(t) : -1;
  }
  function recent() {
    if (ctx) return ctx.recent || null;
    var f = g("recentFormForTeam"); var i = teamIdx();
    if (!f || i < 0) return null;
    try { return f(i, 5); } catch (e) { return null; }
  }
  function link(p) {
    if (ctx && ctx.link) return ctx.link(p);
    var f = g("playerLinkHtml"); var i = teamIdx();
    return f && i >= 0 ? f(i, p.id, p.name) : esc(p.name);
  }
  function playerAttrs(p) {
    if (ctx && ctx.playerAttrs) return ctx.playerAttrs(p);
    return 'data-player-team="' + teamIdx() + '" data-player-id="' + p.id + '"';
  }
  function flag(code) { var f = g("nationFlagHtml"); return f && code ? f(code) : ""; }
  function pos(position) { var f = g("effPosBadgeHtml"); return f ? f(position) : esc(position || ""); }

  var MOOD_COLOR = { happy: "var(--vs-good)", content: "var(--vs-ok)", neutral: "var(--vs-mid)", frustrated: "var(--vs-warn)", unhappy: "var(--vs-bad)" };
  var STATE_COLOR = { united: "var(--vs-good)", good: "var(--vs-ok)", ok: "var(--vs-mid)", tense: "var(--vs-warn)", crisis: "var(--vs-bad)" };
  function levelWord(v) { return v >= 75 ? "Très haut" : v >= 58 ? "Bon" : v >= 42 ? "Moyen" : v >= 25 ? "Bas" : "Très bas"; }
  function toneColor(v) { return v >= 75 ? "var(--vs-good)" : v >= 58 ? "var(--vs-ok)" : v >= 42 ? "var(--vs-mid)" : v >= 25 ? "var(--vs-warn)" : "var(--vs-bad)"; }

  var ICON = {
    up: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16l6-6 4 4 6-7"/><path d="M15 7h5v5"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8l6 6 4-4 6 7"/><path d="M15 17h5v-5"/></svg>',
    flat: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 12h16"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
    dot: '<svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="currentColor"/></svg>',
  };

  function ensureCss() {
    if (document.getElementById("vsCss")) return;
    var s = document.createElement("style");
    s.id = "vsCss";
    s.textContent = [
      "#vestiaireSection{--vs-good:#3fbf7f;--vs-ok:#8ccf5b;--vs-mid:#d6b84a;--vs-warn:#e8913a;--vs-bad:#e2694f;--vs-card:var(--panel,#151d2c);--vs-line:var(--line,#24304a);}",
      ".vs-card{background:var(--vs-card);border:1px solid var(--vs-line);border-radius:14px;padding:16px;margin-bottom:14px;}",
      ".vs-card h3{margin:0 0 10px;font-size:15px;color:var(--ink-dim);font-weight:600;}",
      ".vs-hero{display:flex;gap:18px;align-items:center;flex-wrap:wrap;}",
      ".vs-hero-ring{flex:none;}",
      ".vs-hero-main{flex:1 1 240px;min-width:0;}",
      ".vs-state{font-size:24px;font-weight:800;margin:0;}",
      ".vs-why{margin:6px 0 0;color:var(--ink-dim);font-size:14.5px;line-height:1.4;}",
      ".vs-trend{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.06);margin-top:8px;}",
      ".vs-gauges{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}",
      ".vs-gauge{background:rgba(255,255,255,.03);border:1px solid var(--vs-line);border-radius:12px;padding:12px;}",
      ".vs-gauge-top{display:flex;justify-content:space-between;align-items:baseline;gap:6px;font-size:13px;color:var(--ink-dim);}",
      ".vs-gauge-word{font-size:16px;font-weight:700;color:var(--ink);margin:4px 0 8px;}",
      ".vs-bar{height:7px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;}",
      ".vs-bar>span{display:block;height:100%;border-radius:99px;}",
      ".vs-gauge small{display:block;color:var(--ink-dim);font-size:12px;margin-top:7px;line-height:1.35;}",
      ".vs-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;}",
      ".vs-list{list-style:none;margin:0;padding:0;}",
      ".vs-list li{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--vs-line);font-size:14px;line-height:1.35;}",
      ".vs-list li:first-child{border-top:0;}",
      ".vs-list .vs-ico{flex:none;margin-top:2px;}",
      ".vs-list .vs-act{margin-left:auto;flex:none;}",
      ".vs-btn{border:1px solid var(--vs-line);background:transparent;color:var(--ink);border-radius:8px;padding:5px 10px;font-size:12.5px;cursor:pointer;white-space:nowrap;}",
      ".vs-btn:hover{border-color:var(--amber,#f0a330);}",
      ".vs-empty{color:var(--ink-dim);font-size:14px;margin:0;}",
      ".vs-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.05);border:1px solid var(--vs-line);border-radius:999px;padding:4px 10px 4px 8px;font-size:13.5px;margin:3px;}",
      ".vs-chip .player-link{font-size:13.5px;}",
      ".vs-mood{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none;}",
      ".vs-tier{display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--vs-line);}",
      ".vs-tier:first-of-type{border-top:0;}",
      ".vs-tier-name{font-weight:700;font-size:14px;padding-top:6px;}",
      ".vs-tier-name small{display:block;color:var(--ink-dim);font-weight:400;font-size:12px;}",
      ".vs-table{width:100%;border-collapse:collapse;font-size:13.5px;}",
      ".vs-table th{font-size:12px;color:var(--ink-dim);font-weight:600;text-align:left;padding:6px 8px;border-bottom:1px solid var(--vs-line);}",
      ".vs-table td{padding:8px;border-bottom:1px solid var(--vs-line);vertical-align:middle;}",
      ".vs-table .vs-reasons{color:var(--ink-dim);font-size:12.5px;white-space:normal;}",
      ".vs-wrap{overflow-x:auto;}",
      ".vs-groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;}",
      ".vs-group h4{margin:0;font-size:16px;}",
      ".vs-group .vs-status{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;}",
      ".vs-group-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;}",
      ".vs-bonds{color:var(--ink-dim);font-size:12.5px;margin:4px 0 8px;}",
      ".vs-graph{display:block;width:100%;max-width:560px;margin:0 auto;}",
      ".vs-graph text{font-size:11px;fill:var(--ink);}",
      ".vs-legend{display:flex;gap:14px;justify-content:center;font-size:12.5px;color:var(--ink-dim);margin-top:6px;flex-wrap:wrap;}",
      ".vs-legend i{display:inline-block;width:18px;height:3px;border-radius:2px;vertical-align:middle;margin-right:5px;}",
      ".vs-chart{display:block;width:100%;height:auto;}",
      ".vs-chart text{font-size:10px;fill:var(--ink-dim);}",
      ".vs-log li .vs-week{color:var(--ink-dim);font-size:12px;flex:none;width:58px;}",
      "@media (max-width:720px){.vs-gauges{gap:8px;}.vs-gauge{padding:10px 9px;}.vs-gauge small{display:none;}.vs-gauge-word{font-size:14.5px;}.vs-two{grid-template-columns:1fr;}.vs-tier{grid-template-columns:1fr;gap:4px;}.vs-state{font-size:20px;}.vs-hide-m{display:none;}}",
    ].join("\n");
    document.head.appendChild(s);
  }

  function ring(score, color) {
    var r = 34, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score));
    return '<svg class="vs-hero-ring" viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">' +
      '<circle cx="42" cy="42" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>' +
      '<circle cx="42" cy="42" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 42 42)"/>' +
      '<text x="42" y="48" text-anchor="middle" font-size="20" font-weight="800" fill="currentColor">' + Math.round(v) + '</text></svg>';
  }
  // `shown` : valeur affichée si différente de l'échelle de la barre (alchimie
  // 40-100 : la barre et le mot suivent sa position dans CETTE plage).
  function gauge(label, value, hint, shown) {
    return '<div class="vs-gauge"><div class="vs-gauge-top"><span>' + esc(label) + '</span><span>' + Math.round(shown != null ? shown : value) + '/100</span></div>' +
      '<div class="vs-gauge-word">' + esc(levelWord(value)) + '</div>' +
      '<div class="vs-bar"><span style="width:' + Math.max(2, Math.min(100, value)) + '%;background:' + toneColor(value) + '"></span></div>' +
      '<small>' + esc(hint) + '</small></div>';
  }
  function actionBtn(item, v) {
    var pid = item.player != null ? item.player : (item.players && item.players[0]);
    var p = pid != null ? v.players.find(function (x) { return String(x.id) === String(pid); }) : null;
    if (item.action === "talk" && p) return '<button type="button" class="vs-btn" ' + playerAttrs(p) + '>' + (ctx && ctx.noTalk ? "Voir le joueur" : "Lui parler") + '</button>';
    if (item.action === "profile" && p) return '<button type="button" class="vs-btn" ' + playerAttrs(p) + '>Voir le joueur</button>';
    if (item.action === "lineup") return '<button type="button" class="vs-btn" ' + ((ctx && ctx.lineupAttrs) || 'data-tab="tactiques"') + '>Revoir les rôles</button>';
    return "";
  }
  // Infobulle : libellé du moral (« Mitigé »…), traduit par la page — jamais la clé interne.
  function moodDot(key, label) { return '<span class="vs-mood" style="background:' + (MOOD_COLOR[key] || "var(--vs-mid)") + '"' + (label ? ' title="' + esc(label) + '"' : "") + '></span>'; }
  function chip(p) { return '<span class="vs-chip">' + moodDot(p.mood, p.label) + link(p) + '</span>'; }

  function overviewHtml(v) {
    var why = v.problems.length ? v.problems[0].text : v.positives.length ? v.positives[0].text : "Rien à signaler pour l'instant.";
    var trendIcon = v.trend.key === "up" ? ICON.up : v.trend.key === "down" ? ICON.down : v.trend.key === "flat" ? ICON.flat : "";
    var leaders = v.players.filter(function (p) { return p.level === "leader"; });
    var hero = '<div class="vs-card"><div class="vs-hero">' + ring(v.state.score, STATE_COLOR[v.state.key]) +
      '<div class="vs-hero-main"><p class="vs-state" style="color:' + STATE_COLOR[v.state.key] + '">' + esc(v.state.label) + '</p>' +
      '<p class="vs-why">' + esc(why) + '</p>' +
      '<span class="vs-trend">' + trendIcon + esc(v.trend.label) + '</span></div></div></div>';
    var gauges = '<div class="vs-card"><div class="vs-gauges">' +
      gauge("Cohésion", v.cohesion, "L'alchimie du groupe (de 40 à 100) : se construit en jouant et en gagnant ensemble, s'abîme quand l'effectif change.") +
      gauge("Moral", v.mood, v.counts.satisfied + " satisfait" + (v.counts.satisfied > 1 ? "s" : "") + ", " + v.counts.frustrated + " frustré" + (v.counts.frustrated > 1 ? "s" : "") + ". Les joueurs influents pèsent plus.") +
      gauge("Confiance", v.confidence, "Portée par les derniers résultats.") + '</div></div>';
    var pos = v.positives.length ? v.positives.map(function (x) { return '<li><span class="vs-ico" style="color:var(--vs-good)">' + ICON.plus + '</span><span>' + esc(x.text) + '</span></li>'; }).join("") : '<li><span class="vs-empty">Pas encore de point fort marquant.</span></li>';
    var neg = v.problems.length ? v.problems.map(function (x) { return '<li><span class="vs-ico" style="color:' + (x.sev >= 3 ? "var(--vs-bad)" : "var(--vs-warn)") + '">' + ICON.warn + '</span><span>' + esc(x.text) + '</span><span class="vs-act">' + actionBtn(x, v) + '</span></li>'; }).join("") : '<li><span class="vs-empty">Aucune tension notable.</span></li>';
    var two = '<div class="vs-two"><div class="vs-card"><h3>Ce qui va bien</h3><ul class="vs-list">' + pos + '</ul></div>' +
      '<div class="vs-card"><h3>Alertes</h3><ul class="vs-list">' + neg + '</ul></div></div>';
    var who = '<div class="vs-card"><h3>Qui mène le groupe</h3>' + (leaders.length ? leaders.map(chip).join("") : '<p class="vs-empty">Aucun leader naturel : un joueur d\'expérience au fort leadership changerait la donne.</p>') +
      (v.groups.length ? '<p class="vs-why">' + v.groups.length + ' groupe' + (v.groups.length > 1 ? "s" : "") + ' dans le vestiaire : ' + v.groups.map(function (gr) { return esc(gr.name); }).join(", ") + '.</p>' : "") + '</div>';
    return hero + gauges + two + who + logCard(v, 6, "Derniers événements");
  }

  function logCard(v, n, title) {
    var V = window.HM_VESTIAIRE;
    var items = (v.log || []).slice(0, n);
    var body = items.length ? items.map(function (e) {
      var tone = V.EVENT_TONE[e.t] || 0;
      var col = tone > 0 ? "var(--vs-good)" : tone < 0 ? "var(--vs-bad)" : "var(--ink-dim)";
      return '<li><span class="vs-week">Sem. ' + esc(e.w) + '</span><span class="vs-ico" style="color:' + col + '">' + ICON.dot + '</span><span>' + esc(V.eventText(e)) + '</span></li>';
    }).join("") : '<li><span class="vs-empty">Le journal se remplit au fil des semaines (arrivées, départs, places de titulaire, blessures, séries...).</span></li>';
    return '<div class="vs-card"><h3>' + esc(title) + '</h3><ul class="vs-list vs-log">' + body + '</ul></div>';
  }

  function hierarchyHtml(v) {
    var V = window.HM_VESTIAIRE;
    var hint = { leader: "Donnent le ton", cadre: "Relais du coach", important: "Comptent sur le terrain", member: "Font partie du groupe", young: "Doivent trouver leur place", marginal: "En marge du groupe" };
    var tiers = Object.keys(V.LEVELS).map(function (k) {
      var ps = v.players.filter(function (p) { return p.level === k; });
      if (!ps.length) return "";
      return '<div class="vs-tier"><div class="vs-tier-name">' + esc(V.LEVELS[k].label) + '<small>' + esc(hint[k]) + '</small></div><div>' + ps.map(chip).join("") + '</div></div>';
    }).join("");
    var rows = v.players.map(function (p) {
      var reasons = (p.reasons || []).map(function (r) { return esc(r.text); }).join(" · ");
      return '<tr><td>' + flag(p.nationality) + ' ' + link(p) + '</td><td class="vs-hide-m">' + pos(p.position) + '</td><td>' + esc(p.levelLabel) + '</td>' +
        '<td><div class="vs-bar" style="width:70px" title="' + p.influence + '/100"><span style="width:' + p.influence + '%;background:var(--amber,#f0a330)"></span></div></td>' +
        '<td>' + moodDot(p.mood, p.label) + ' ' + esc(p.label) + '</td><td class="vs-reasons vs-hide-m">' + reasons + '</td></tr>';
    }).join("");
    return '<div class="vs-card"><h3>Hiérarchie du vestiaire</h3>' + (tiers || '<p class="vs-empty">Effectif vide.</p>') + '</div>' +
      '<div class="vs-card"><h3>Qui est satisfait, qui est frustré</h3><div class="vs-wrap"><table class="vs-table"><thead><tr><th>Joueur</th><th class="vs-hide-m">Poste</th><th>Statut</th><th>Influence</th><th>Moral</th><th class="vs-hide-m">Pourquoi</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="vs-why">L\'influence vient du leadership, du temps de jeu, de l\'ancienneté, de l\'âge, du niveau et du vécu au club. Pour agir : la fiche du joueur (discussion, contrat), les Tactiques (rôles et temps de jeu), l\'Entraînement (tutorat).</p></div>';
  }

  function groupsHtml(v) {
    var byId = {}; v.players.forEach(function (p) { byId[String(p.id)] = p; });
    var cards = v.groups.map(function (gr) {
      var col = gr.status.key === "frustrated" ? "var(--vs-bad)" : gr.status.key === "tight" ? "var(--vs-good)" : "var(--vs-mid)";
      return '<div class="vs-card vs-group"><div class="vs-group-head"><h4>' + esc(gr.name) + '</h4><span class="vs-status" style="color:' + col + ';border:1px solid ' + col + '">' + esc(gr.status.label) + '</span></div>' +
        '<p class="vs-bonds">Liés par : ' + esc(gr.bonds.join(", ") || "affinités") + '</p>' +
        gr.ids.map(function (id) { return byId[id] ? chip(byId[id]) : ""; }).join("") +
        '<p class="vs-bonds" style="margin-top:8px">Moral du groupe : ' + esc(levelWord(gr.mood).toLowerCase()) + '</p></div>';
    }).join("");
    var alone = v.players.filter(function (p) { return !p.group; });
    return (cards ? '<div class="vs-groups">' + cards + '</div>' : '<div class="vs-card"><p class="vs-empty">Pas encore de groupe marqué : les affinités se créent avec le temps passé ensemble.</p></div>') +
      (alone.length ? '<div class="vs-card"><h3>Hors des groupes</h3>' + alone.map(chip).join("") + '<p class="vs-why">Pas forcément un problème : un joueur isolé et frustré, en revanche, mérite qu\'on s\'en occupe.</p></div>' : "");
  }

  function graphSvg(v) {
    var ps = v.players; var n = ps.length;
    if (n < 2) return "";
    var W = 520, H = 440, cx = W / 2, cy = H / 2, R = 165;
    var at = {};
    ps.forEach(function (p, i) { var a = -Math.PI / 2 + 2 * Math.PI * i / n; at[String(p.id)] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a: a, p: p }; });
    var lines = v.relations.map(function (r) {
      var A = at[String(r.a)], B = at[String(r.b)]; if (!A || !B) return "";
      var col = r.kind === "good" ? "var(--vs-good)" : r.kind === "tension" ? "var(--vs-bad)" : "rgba(255,255,255,.25)";
      var w = Math.max(1, Math.min(5, Math.abs(r.v) * 4));
      return '<line x1="' + A.x.toFixed(1) + '" y1="' + A.y.toFixed(1) + '" x2="' + B.x.toFixed(1) + '" y2="' + B.y.toFixed(1) + '" stroke="' + col + '" stroke-width="' + w.toFixed(1) + '" stroke-opacity=".8"' + (r.kind === "tension" ? ' stroke-dasharray="5 4"' : "") + '/>';
    }).join("");
    var nodes = Object.keys(at).map(function (id) {
      var o = at[id]; var p = o.p;
      var lx = cx + (R + 20) * Math.cos(o.a), ly = cy + (R + 20) * Math.sin(o.a);
      var anchor = Math.abs(Math.cos(o.a)) < 0.2 ? "middle" : Math.cos(o.a) > 0 ? "start" : "end";
      var name = String(p.name || "").split(" ").slice(-1)[0];
      var rr = 6 + p.influence / 14;
      return '<g ' + playerAttrs(p) + ' style="cursor:pointer"><circle cx="' + o.x.toFixed(1) + '" cy="' + o.y.toFixed(1) + '" r="' + rr.toFixed(1) + '" fill="' + (MOOD_COLOR[p.mood] || "#888") + '" stroke="#0d1320" stroke-width="2"/>' +
        '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(name) + '</text></g>';
    }).join("");
    return '<svg class="vs-graph" viewBox="-40 0 ' + (W + 80) + ' ' + H + '" role="img" aria-label="Carte des relations">' + lines + nodes + '</svg>' +
      '<div class="vs-legend"><span><i style="background:var(--vs-good)"></i>Bonne entente</span><span><i style="background:var(--vs-bad)"></i>Tension</span><span>Taille = influence · couleur = moral</span></div>';
  }
  function relationsHtml(v) {
    var byId = {}; v.players.forEach(function (p) { byId[String(p.id)] = p; });
    function item(r) {
      var a = byId[String(r.a)], b = byId[String(r.b)]; if (!a || !b) return "";
      return '<li><span class="vs-ico" style="color:' + (r.kind === "tension" ? "var(--vs-bad)" : "var(--vs-good)") + '">' + ICON.dot + '</span><span>' + link(a) + ' et ' + link(b) + '<br><small style="color:var(--ink-dim)">' + esc(r.why.join(", ")) + '</small></span></li>';
    }
    var good = v.relations.filter(function (r) { return r.kind === "good"; }).slice(0, 8);
    var bad = v.relations.filter(function (r) { return r.kind === "tension"; }).slice(0, 8);
    return '<div class="vs-card"><h3>Carte des relations</h3>' + (graphSvg(v) || '<p class="vs-empty">Pas assez de joueurs.</p>') + '</div>' +
      '<div class="vs-two"><div class="vs-card"><h3>Bonnes ententes</h3><ul class="vs-list">' + (good.map(item).join("") || '<li><span class="vs-empty">Aucune pour l\'instant.</span></li>') + '</ul></div>' +
      '<div class="vs-card"><h3>Tensions</h3><ul class="vs-list">' + (bad.map(item).join("") || '<li><span class="vs-empty">Aucune tension.</span></li>') + '</ul></div></div>';
  }

  function chartSvg(hist) {
    if (hist.length < 2) return '<p class="vs-empty">La courbe apparaît après deux semaines d\'entraînement.</p>';
    var W = 560, H = 200, L = 30, B = 22, T = 10, Rt = 10;
    var n = hist.length;
    function x(i) { return L + (W - L - Rt) * i / (n - 1); }
    function y(v) { return T + (H - T - B) * (1 - v / 100); }
    function path(key, f) { return hist.map(function (h, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(f ? f(h) : h[key]).toFixed(1); }).join(" "); }
    var grid = [0, 25, 50, 75, 100].map(function (v) { return '<line x1="' + L + '" x2="' + (W - Rt) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(255,255,255,.07)"/><text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + '</text>'; }).join("");
    var labels = hist.map(function (h, i) { return (i === 0 || i === n - 1 || i % 4 === 0) ? '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">J' + h.w + '</text>' : ""; }).join("");
    var cohesion = function (h) { return Math.max(0, Math.min(100, h.chem)); };
    return '<svg class="vs-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Évolution du vestiaire">' + grid + labels +
      '<path d="' + path("score") + '" fill="none" stroke="var(--amber,#f0a330)" stroke-width="2.6"/>' +
      '<path d="' + path(null, cohesion) + '" fill="none" stroke="var(--vs-good)" stroke-width="1.6" stroke-dasharray="4 3"/>' +
      '<path d="' + path("mood") + '" fill="none" stroke="#6aa8ff" stroke-width="1.6" stroke-dasharray="2 3"/></svg>' +
      '<div class="vs-legend"><span><i style="background:var(--amber,#f0a330)"></i>État général</span><span><i style="background:var(--vs-good)"></i>Cohésion</span><span><i style="background:#6aa8ff"></i>Moral</span></div>';
  }
  function evolutionHtml(v) {
    var last = v.history[v.history.length - 1];
    var sat = last ? '<p class="vs-why">Cette semaine : ' + last.sat + ' joueurs satisfaits, ' + last.frus + ' frustrés sur ' + last.n + '.</p>' : "";
    return '<div class="vs-card"><h3>Évolution sur les dernières semaines</h3>' + chartSvg(v.history) + sat + '</div>' + logCard(v, 20, "Journal du vestiaire");
  }

  var TABS = [["overview", "Vue générale"], ["hierarchy", "Hiérarchie"], ["groups", "Groupes"], ["relations", "Relations"], ["evolution", "Évolution"]];
  function render(opts) {
    ctx = opts || null;
    var holder = (ctx && ctx.holder) || document.getElementById("vestiaireContent");
    if (!holder) return null;
    ensureCss();
    var V = window.HM_VESTIAIRE; var t = myTeam();
    if (!V || !t) { holder.innerHTML = '<p class="vs-empty">Chargement du vestiaire…</p>'; return null; }
    var view;
    try { view = V.buildView(t, { now: Date.now(), recent: recent(), nationName: g("nationName") }); } catch (e) { holder.innerHTML = '<p class="vs-empty">Vestiaire indisponible pour le moment.</p>'; return null; }
    // Même forme de menu que le Calendrier et la Coupe (.cal-toolbar / .cal-filter).
    var tabs = '<div class="cal-toolbar vs-tabs" role="tablist" aria-label="Vues du vestiaire">' + TABS.map(function (x) {
      var on = state.tab === x[0];
      return '<button type="button" role="tab" class="cal-filter' + (on ? " active" : "") + '" data-vs-tab="' + x[0] + '" aria-selected="' + on + '">' + esc(x[1]) + '</button>';
    }).join("") + '</div>';
    var body = state.tab === "hierarchy" ? hierarchyHtml(view) : state.tab === "groups" ? groupsHtml(view) : state.tab === "relations" ? relationsHtml(view) : state.tab === "evolution" ? evolutionHtml(view) : overviewHtml(view);
    holder.innerHTML = tabs + body;
    holder.__vsCtx = ctx;
    if (!holder.__vsBound) {
      holder.__vsBound = true;
      holder.addEventListener("click", function (e) {
        var tb = e.target.closest("[data-vs-tab]");
        if (tb) { state.tab = tb.getAttribute("data-vs-tab"); render(holder.__vsCtx || null); return; }
      });
    }
    return view;
  }
  window.HM_VESTIAIRE_UI = { render: render, setTab: function (k) { state.tab = k; } };
})();
