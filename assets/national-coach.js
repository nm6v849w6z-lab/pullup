/* Sélections nationales — mode Sélection (phases B et E, refonte du
   2026-10-06). Fichier à part (limite de taille de la page, voir
   load_size_test.js). Côté serveur : server/nationalCoach.js (vue et droits
   par rôle), server/nationalFriendlies.js (amicaux internationaux), routes
   /api/national/coach*.

   Environnement séparé du mode Club, ouvert depuis le tableau de bord du
   club (bouton « Mode Sélection » à côté de « Analyse de mon équipe »,
   seulement avec un mandat ou un rôle de staff en cours) ; « Retour au mode
   Club » vit à l'intérieur du mode. Rubriques filtrées par rôle :
   - sélectionneur : tout (amicaux, staff, analyse, stats, mandat) ;
   - adjoint : joueurs, présélection en consultation, convoqués en
     consultation, tactique, calendrier, analyse, notifications ;
   - recruteur : joueurs (suivi) et analyse des adversaires.
   Aucun emoji : pictogrammes SVG, drapeaux en images. */
(function () {
  "use strict";
  var DAY = 24 * 3600 * 1000;
  var POS = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
  var WATCH_LABELS = { denyPostUp: "Empêcher le post-up", denyDrive: "Coller sur les pénétrations", harassOutsideShot: "Harceler le tir extérieur", reboundPriority: "Priorité au rebond", denyEntry: "Couper du ballon" };
  // Rôles (refonte du 2026-10-07, mêmes clés que server/nationalCoach.js :
  // PERMS / APPOINT) : staff NT (sélectionneur, adjoints, personnes
  // aidantes) et DTN (recruteurs, scouts).
  var ROLE_LABEL = { coach: "Sélectionneur", assistant: "Adjoint", helper: "Personne aidante", recruiter: "Recruteur", scout: "Scout" };
  // Rôles cumulables (2026-10-07) : toutes les casquettes, « Adjoint ·
  // Recruteur · Scout ».
  function rolesLabel(v, fallback) {
    var rs = (v && v.roles && v.roles.length) ? v.roles : [(v && v.role) || fallback || "coach"];
    return rs.map(function (r) { return ROLE_LABEL[r] || r; }).join(" · ");
  }
  function hasRole(v) { var rs = (v && (v.roles || [v.role])) || []; for (var i = 1; i < arguments.length; i++) if (rs.indexOf(arguments[i]) >= 0) return true; return false; }
  var ui = { teamId: null, view: null, tab: "joueurs", pos: "", filter: "", shown: 50, gid: null, error: "", busy: false, replaceOut: null, tq: null, tqMatch: null,
    sort: { key: "gen", dir: -1 }, nav: "dashboard", opp: null, frOpp: "", frAt: "", frVenue: "home", staffQ: "" };

  var ICON = {
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
  };
  function icon(name, fill) { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="' + (fill ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + "</svg>"; }

  var CSS = [
    ".nc-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}",
    ".nc-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;align-items:center}",
    ".nc-scroll{overflow-x:auto}",
    ".nc-table{width:100%;border-collapse:collapse;font-size:14px}",
    ".nc-table th{color:var(--ink-dim);font-weight:600;font-size:12px;text-align:center;padding:6px 4px;border-bottom:1px solid var(--line);white-space:nowrap}",
    ".nc-table td{padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.04);text-align:center;font-variant-numeric:tabular-nums}",
    ".nc-table .l{text-align:left}",
    ".nc-nm{background:none;border:0;padding:0;color:var(--ink);font:inherit;font-weight:600;cursor:pointer;text-align:left}",
    ".nc-club{color:var(--ink-dim);font-size:13px}",
    ".nc-bar{width:54px;height:6px;border-radius:3px;background:rgba(255,255,255,.08);display:inline-block;vertical-align:middle;overflow:hidden}.nc-bar i{display:block;height:100%}",
    ".nc-ic{width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2);display:inline-grid;place-items:center;color:var(--ink-dim);cursor:pointer;padding:0;margin:0 1px}",
    ".nc-ic.on-watch{color:var(--amber);border-color:rgba(240,162,60,.5)}.nc-ic.on-pre{color:#4FD18B;border-color:rgba(79,209,139,.5)}.nc-ic.on-conv{color:#6FB6FF;border-color:rgba(111,182,255,.55)}",
    ".nc-ic:disabled{opacity:.4;cursor:default}",
    ".nc-sec{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0 0 12px}.nc-sec>.lp-card-title{margin:0}",
    ".nc-next{padding:10px 12px;border-radius:10px;background:rgba(111,182,255,.08);border:1px solid rgba(111,182,255,.3);margin-bottom:12px;font-size:13px}",
    ".nc-slot{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;background:var(--panel-2);margin-bottom:6px;font-size:14px}",
    ".nc-slot .nc-grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".nc-tag{font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;white-space:nowrap}.nc-tag.ok{background:rgba(79,209,139,.12);color:#4FD18B}.nc-tag.bad{background:rgba(226,105,79,.15);color:#E2694F}.nc-tag.mid{background:rgba(240,162,60,.14);color:var(--amber)}.nc-tag.info{background:rgba(111,182,255,.14);color:#6FB6FF}",
    ":is(#selectionsSection,.nc-msg-acts) .tq-btn{white-space:nowrap}:is(#selectionsSection,.nc-msg-acts) .tq-btn:disabled{opacity:.5;cursor:default}",
    ".nc-small{font-size:13px;color:var(--ink-faint);margin:8px 0 0}",
    ".nc-err{color:#E2694F;font-size:13px;margin:8px 0}",
    ".nc-gath{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:16px}",
    ".nc-g{text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px 12px;color:var(--ink);font:inherit;cursor:pointer}",
    ".nc-g.on{border-color:var(--amber)}.nc-g.past{opacity:.6}.nc-g b{display:block;font-size:13.5px}.nc-g span{font-size:12px;color:var(--ink-dim)}.nc-g b .nat-flag{width:18px;height:12px;vertical-align:-1px}.nc-g .nc-g-comp{color:var(--amber);font-weight:700}",
    ".nc-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}@media(max-width:900px){.nc-two{grid-template-columns:minmax(0,1fr)}}",
    ".nc-set{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px 14px}",
    ".nc-set label{display:flex;flex-direction:column;min-width:0}.nc-set .lp-input{width:100%}",
    ".nc-set select,.nc-sheet select,.nc-sheet input,.nc-in{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:7px 8px;font:inherit;font-size:13px}",
    ".nc-sheet{width:100%;border-collapse:collapse;font-size:13px}.nc-sheet td,.nc-sheet th{padding:6px;border-bottom:1px solid rgba(255,255,255,.05);text-align:left}",
    ".nc-sheet th{font-size:12px;font-weight:600;color:var(--ink-dim)}.nc-sheet input[type=number]{width:62px}",
    ".nc-stack>*+*{margin-top:14px}",
    ".nc-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    ".nc-fr{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);flex-wrap:wrap}.nc-fr:first-child{border-top:0}.nc-fr .nc-grow{flex:1;min-width:180px}",
    ".nc-fr .nat-flag,.nc-opp-head .nat-flag{width:26px;height:18px;border-radius:3px;object-fit:cover}",
    ".nc-opp-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.nc-opp-head .nat-flag{width:42px;height:28px}.nc-opp-head h3{margin:0;font-size:19px}",
    "#selectionsSection .nc-players th.eff-th{cursor:pointer}",
    // Tableau des joueurs sans défilement horizontal (2026-10-07) : toutes
    // les colonnes tiennent dès ~1200 px d'écran (cellules resserrées, nom
    // et club tronqués, libellés courts).
    "#selectionsSection table.nc-players{width:100%;table-layout:fixed;font-size:14px}",
    "#selectionsSection table.nc-players th,#selectionsSection table.nc-players td{padding:0 2px!important;text-align:center}",
    "#selectionsSection table.nc-players th.eff-th-attr{min-width:0!important;font-size:10.5px!important;padding:0 1px!important}",
    "#selectionsSection table.nc-players .nc-c-name{width:168px;text-align:left!important;padding-left:10px!important}",
    "#selectionsSection table.nc-players .nc-c-age{width:34px}#selectionsSection table.nc-players .nc-c-pos{width:40px}#selectionsSection table.nc-players .nc-c-h{width:40px}#selectionsSection table.nc-players .nc-c-gen{width:42px}",
    "#selectionsSection table.nc-players .nc-c-attr{width:auto}#selectionsSection table.nc-players .nc-c-cond{width:52px}#selectionsSection table.nc-players .nc-c-act{width:64px}",
    "#selectionsSection table.nc-players td.eff-td-name .eff-player,#selectionsSection table.nc-players td.eff-td-name .nc-club{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}",
    "#selectionsSection table.nc-players td.eff-td-name .eff-player{display:flex;align-items:center;gap:6px}#selectionsSection table.nc-players .nc-nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
    "#selectionsSection table.nc-players .attr-cell{min-width:0}",
    "#selectionsSection table.nc-players .nc-bar{width:100%;max-width:44px}#selectionsSection table.nc-players .nc-ic{width:26px;height:26px}",
    "#selectionsSection table.nc-players td.eff-td-name{text-align:left!important;padding-left:10px!important}",
    "#selectionsSection table.nc-players td.nc-club{white-space:normal;text-align:left;padding:10px!important}",
    "#selectionsSection table.nc-players.eff-caracs .eff-gstart{padding-left:2px!important}",
    // Téléphone : 23 colonnes ne tiennent pas, défilement horizontal comme avant.
    "@media(max-width:768px){#selectionsSection table.nc-players{width:auto;table-layout:auto}#selectionsSection table.nc-players .nc-c-attr{width:36px}}",
    // Petit écran d'ordinateur : nom plus étroit, chiffres un peu plus petits.
    "@media(max-width:1250px){#selectionsSection table.nc-players .nc-c-name{width:132px}#selectionsSection table.nc-players .nc-c-pos{width:34px}#selectionsSection table.nc-players .nc-c-gen{width:36px}#selectionsSection table.nc-players .nc-c-cond{width:40px}#selectionsSection table.nc-players .nc-c-act{width:58px}#selectionsSection table.nc-players{font-size:13px}#selectionsSection table.nc-players th.eff-th-attr{font-size:9.5px!important}#selectionsSection table.nc-players .nc-ic{width:24px;height:24px}#selectionsSection table.nc-players .eff-pos{padding:2px 4px;font-size:11px}}",
    // Rapport d'analyse : drapeau dans l'écusson rond du bandeau (sp2-crest).
    "@media(max-width:768px){#selectionsSection table.nc-players{font-size:14px}}",
    ".nc-ana-crest{display:block;width:100%;height:100%}.nc-ana-crest .nat-flag{width:100%;height:100%;object-fit:cover}",
  ].join("\n");

  function g(name) { return typeof window[name] === "function" ? window[name] : null; }
  function esc(s) { var f = g("escapeHtml"); return f ? f(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function flag(code) { var f = g("nationFlagHtml"); return f && code ? f(code) : ""; }
  function t(msg) { return window.hmI18n && typeof window.hmI18n.t === "function" ? window.hmI18n.t(msg) : msg; }
  function toast(msg) { var f = g("showToast"); if (f) f(t(msg)); }
  function when(ts, withHour) {
    try { return new Date(ts).toLocaleString("fr-FR", withHour ? { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" } : { weekday: "long", day: "numeric", month: "long" }); } catch (e) { return ""; }
  }
  // Postes, caractéristiques : mêmes abréviations et composants que l'Effectif.
  function posShort(p) { try { if (typeof POS_SHORT !== "undefined" && POS_SHORT[p]) return POS_SHORT[p]; } catch (e) { /* hors jeu */ } return p || "–"; }
  function posBadge(p) { var f = g("effPosBadgeHtml"); return f && p ? f(p) : esc(posShort(p)); }
  function attrGroups() {
    try { if (typeof EFF_ATTR_GROUPS !== "undefined") return EFF_ATTR_GROUPS; } catch (e) { /* hors jeu */ }
    return [{ label: "Tir", keys: ["midRange", "threePoint", "inside", "freeThrow"] }, { label: "Jeu", keys: ["pass", "dribble", "shotCreation", "penetration"] },
      { label: "Défense", keys: ["defOutside", "defInside", "steal", "rebound", "block"] }, { label: "Condition", keys: ["physicalAvg", "mentalAvg"] }];
  }
  function attrShort(k) {
    try { if (k === "physicalAvg" || k === "mentalAvg") return EFF_AVG_LABELS[k]; if (typeof ATTR_SHORT !== "undefined" && ATTR_SHORT[k]) return ATTR_SHORT[k]; } catch (e) { /* hors jeu */ }
    return k === "physicalAvg" ? "Physique" : k === "mentalAvg" ? "Mental" : k;
  }
  function attrTitle(k) {
    if (k === "physicalAvg") return "Moyenne physique";
    if (k === "mentalAvg") return "Moyenne mentale";
    try { if (typeof TRAINING_LABELS !== "undefined" && TRAINING_LABELS[k]) return TRAINING_LABELS[k]; } catch (e) { /* hors jeu */ }
    return k;
  }
  function tier(v) { var f = g("attrColorTier"); return f ? f(v) : ""; }
  function attrVal(x, k) { return k === "physicalAvg" ? x.physAvg : k === "mentalAvg" ? x.mentAvg : (x.attrs ? x.attrs[k] : null); }
  function genOf(x) { return x.gen != null ? x.gen : x.ovr; }
  // GEN comme l'Effectif du Club : attr-cell par palier (td.eff-td-rating).
  function genHtml(x) { var v = genOf(x); return v == null ? "–" : '<span class="attr-cell eff-attr ' + tier(v) + '"><span class="attr-val">' + esc(Math.round(v)) + "</span></span>"; }
  function can(perm) { return !!(ui.view && (ui.view.perms || []).indexOf(perm) >= 0); }
  function ensureCss() {
    if (document.getElementById("ncCss")) return;
    var s = document.createElement("style");
    s.id = "ncCss"; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function api(path, body) {
    var f = g("fetchApi");
    if (!f) return Promise.reject(new Error("Hors ligne."));
    var opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return f(path, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || "Mode Sélection indisponible pour l'instant.");
        return data;
      });
    });
  }
  function key(r) { return r.p + "|" + r.n; }
  function inList(list, r) { return (list || []).some(function (x) { return x.p === r.p && x.n === r.n; }); }
  function poolByKey() {
    var m = {};
    ((ui.view && ui.view.pool && ui.view.pool.players) || []).forEach(function (x) { m[key(x)] = x; });
    return m;
  }
  function gathering(gid) { return ((ui.view && ui.view.gatherings) || []).filter(function (x) { return x.gid === gid; })[0] || null; }
  function curGathering() { return gathering(ui.gid || (ui.view && ui.view.currentGid)) || null; }
  function convRefs(gg) { return gg ? gg.players.map(function (x) { return x.ref; }) : []; }
  // Vrai match d'un rassemblement (retour utilisateur 2026-10-06) : la
  // fenêtre internationale reste interne, l'interface montre le match.
  function gMatch(gg) { return gg && gg.matches && gg.matches.length === 1 ? gg.matches[0] : null; }
  function matchTitleHtml(m) {
    return flag(m.home.split("-")[0]) + " " + esc(teamLab(m.home)) + " – " + flag(m.away.split("-")[0]) + " " + esc(teamLab(m.away));
  }
  function gTitleHtml(gg) {
    var m = gMatch(gg);
    return m ? matchTitleHtml(m) : esc(gg.label);
  }
  function gTitleText(gg) {
    var m = gMatch(gg);
    return m ? teamLab(m.home) + " – " + teamLab(m.away) : gg.label;
  }
  function compLabel(gg) {
    if (!gg) return "";
    var m = gMatch(gg);
    if (m) return teamLab(m.home) + " – " + teamLab(m.away) + " · " + m.comp;
    if (gg.kind === "final") return gg.label;
    return gg.label + (gg.comp === "continental" ? " · qualifications continentales" : gg.comp === "world" ? " · qualifications Coupe du monde" : "");
  }
  function statusTag(st, x) {
    if (st === "injured") return '<span class="nc-tag bad">Blessé' + (x && x.injuryUntil ? " " + Math.max(1, Math.ceil((x.injuryUntil - Date.now()) / DAY)) + " j" : "") + "</span>";
    if (st === "ineligible") return '<span class="nc-tag bad">Plus éligible</span>';
    return '<span class="nc-tag ok">Apte</span>';
  }
  function condColor(c) { return c >= 80 ? "#4FD18B" : c >= 60 ? "var(--amber)" : "#E2694F"; }
  function effColor(e) { return e >= 15 ? "#4FD18B" : e >= 7 ? "var(--amber)" : "#E2694F"; }
  function teamLab(id) { return window.HM_NATIONAL && window.HM_NATIONAL.teamLabelOf ? window.HM_NATIONAL.teamLabelOf(id) : id; }
  // Nom cliquable → fiche joueur existante (showPlayerDetail /
  // showForeignPlayerDetail, voir onClick data-nc-profile).
  function profileBtn(x, label, bold) {
    var txt = bold ? "<b>" + esc(label) + "</b>" : esc(label);
    if (!x || !x.club) return txt;
    return '<button type="button" class="nc-nm player-link" data-nc-profile="' + esc(x.club.leagueId + "|" + x.club.idx + "|" + x.p) + '">' + txt + "</button>";
  }

  // --- Tableau des joueurs (Sélectionnables, Présélection, Suivis) ---------
  // Même rendu que l'Effectif (en-têtes triables, cases colorées des
  // caractéristiques, badges de poste) ; un clic sur un en-tête trie, un
  // second inverse.
  function columns() {
    var cols = [
      { key: "name", label: "Nom", cls: "eff-th-name", dir: 1, sort: function (x) { return String(x.name || "").toLowerCase(); } },
      { key: "age", label: "Âge", dir: 1, sort: function (x) { return x.age; } },
      { key: "position", label: "Poste", dir: 1, sort: function (x) { return POS.indexOf(x.position); } },
      { key: "height", label: "Taille", title: "Taille (cm)", sort: function (x) { return x.height || 0; } },
      { key: "gen", label: "GEN", title: "Note du meilleur poste", sort: genOf },
    ];
    // Caractéristiques uniquement : onglet « Statistiques » et « Forme
    // récente » retirés (demande utilisateur du 2026-10-06).
    attrGroups().forEach(function (gr, gi) {
      gr.keys.forEach(function (k, ki) { cols.push({ key: k, label: k === "physicalAvg" ? "PHY" : k === "mentalAvg" ? "MEN" : attrShort(k), title: attrTitle(k), attr: true, gstart: ki === 0, sort: function (x) { var v = attrVal(x, k); return v == null ? -1 : v; } }); });
    });
    cols.push({ key: "condition", label: "État", title: "État physique", gstart: true, sort: function (x) { return x.injuryUntil ? -1 : (x.condition || 0); } });
    return cols;
  }
  function sortList(list) {
    var c = columns().filter(function (x) { return x.key === ui.sort.key; })[0] || columns()[4];
    if (c.key !== ui.sort.key) ui.sort = { key: "gen", dir: -1 };
    var dir = ui.sort.dir;
    return list.slice().sort(function (a, b) {
      var va = c.sort(a), vb = c.sort(b);
      if (va < vb) return -dir; if (va > vb) return dir;
      return genOf(b) - genOf(a);
    });
  }
  function headCell(c) {
    var on = ui.sort.key === c.key;
    var chev = '<svg class="eff-sort-ico" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"></path></svg>';
    var cls = ["sortable-th", "eff-th", c.cls || "", c.attr ? "eff-th-attr" : "", c.gstart ? "eff-gstart" : "", on ? "sorted" : "", on && ui.sort.dir === 1 ? "asc" : ""].filter(Boolean).join(" ");
    return '<th class="' + cls + '" data-nc-sort="' + c.key + '" aria-sort="' + (on ? (ui.sort.dir === 1 ? "ascending" : "descending") : "none") + '"' + (c.title ? ' title="' + esc(c.title) + '"' : "") + ">" + esc(c.label) + (on ? chev : "") + "</th>";
  }
  function actionsHtml(x, v) {
    // Plus de bouton Suivre dans les tableaux (demande utilisateur du
    // 2026-10-07) : présélection et convocation seulement.
    var r = { p: x.p, n: x.n }, cur = curGathering(), out = "";
    if (can("preselect")) {
      var p = inList(v.preselection, r);
      out += '<button type="button" class="nc-ic' + (p ? " on-pre" : "") + '" data-nc-list="preselection" data-nc-on="' + (p ? 0 : 1) + '" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '" title="' + (p ? "Retirer de la présélection" : "Ajouter à la présélection") + '">' + icon("check") + "</button>";
    }
    if (can("convoke")) {
      var c = cur && inList(convRefs(cur), r);
      var canConv = cur && !cur.frozen && (c || cur.players.length < v.limits.convocation);
      out += '<button type="button" class="nc-ic' + (c ? " on-conv" : "") + '" data-nc-conv="' + (c ? 0 : 1) + '" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '"' + (canConv ? "" : " disabled") + ' title="' + (!cur ? "Aucun rassemblement à venir" : cur.frozen ? "Liste figée" : !canConv ? "15 joueurs déjà convoqués" : c ? "Retirer des convoqués" : "Convoquer") + '">' + icon(c ? "cross" : "plus") + "</button>";
    }
    return out;
  }
  function playerRow(x, v) {
    var acts = actionsHtml(x, v);
    var h = '<tr class="eff-row"><td class="eff-td-name l"><span class="eff-player">' + flag(x.nationality) + '<button type="button" class="nc-nm player-link" data-nc-profile="' + esc(x.club.leagueId + "|" + x.club.idx + "|" + x.p) + '">' + esc(x.name) + "</button></span>" +
      '<div class="nc-club">' + esc(x.club.name) + (x.club.division ? " · " + esc(x.club.division) : "") + "</div></td>" +
      "<td>" + esc(x.age) + "</td><td>" + posBadge(x.position) + "</td><td title=\"cm\">" + (x.height ? esc(x.height) : "–") + "</td>" +
      '<td class="eff-td-rating">' + genHtml(x) + "</td>";
    attrGroups().forEach(function (gr) {
      gr.keys.forEach(function (k, ki) {
        var val = attrVal(x, k);
        h += '<td class="' + (ki === 0 ? "eff-gstart" : "") + '">' + (val == null ? "–" : '<span class="attr-cell eff-attr ' + tier(val) + '"><span class="attr-val">' + esc(Math.round(val)) + "</span></span>") + "</td>";
      });
    });
    h += '<td class="eff-gstart" title="État physique ' + esc(x.condition) + '/100">' + (x.injuryUntil ? '<span class="nc-tag bad">Blessé</span>' : '<span class="nc-bar"><i style="width:' + Math.max(4, x.condition || 0) + "%;background:" + condColor(x.condition || 0) + '"></i></span>') + "</td>";
    h += (acts ? '<td class="nc-act" style="white-space:nowrap">' + acts + "</td>" : "") + "</tr>";
    return h;
  }
  function playersTableHtml(list, v, opts) {
    opts = opts || {};
    var cols = columns();
    var withActs = can("preselect") || can("convoke");
    var total = list.length;
    list = sortList(list);
    if (opts.limit) list = list.slice(0, ui.shown);
    var groups = attrGroups();
    var fam = '<tr class="eff-family-row"><td colspan="5"></td>' +
      groups.map(function (gr) { return '<td colspan="' + gr.keys.length + '" class="eff-family"><span>' + esc(gr.label) + "</span></td>"; }).join("") + "<td></td>" + (withActs ? "<td></td>" : "") + "</tr>";
    var colCls = { name: "nc-c-name", age: "nc-c-age", position: "nc-c-pos", height: "nc-c-h", gen: "nc-c-gen", condition: "nc-c-cond" };
    var cg = "<colgroup>" + cols.map(function (c) { return '<col class="' + (colCls[c.key] || "nc-c-attr") + '">'; }).join("") + (withActs ? '<col class="nc-c-act">' : "") + "</colgroup>";
    var h = '<div class="eff-table-wrap eff-table-wrap-caracs roster-table-frozen-col"><table class="roster-table eff-table eff-caracs nc-players">' + cg + "<thead>" + fam + "<tr>" + cols.map(headCell).join("") + (withActs ? "<th></th>" : "") + "</tr></thead><tbody>" +
      (list.length ? list.map(function (x) { return playerRow(x, v); }).join("") : '<tr><td colspan="40" class="l nc-club">' + esc(opts.empty || "Aucun joueur.") + "</td></tr>") + "</tbody></table></div>";
    if (opts.limit && total > list.length) h += '<div style="text-align:center;margin-top:10px"><button type="button" class="tq-btn" data-nc-more="1">Afficher plus (' + (total - list.length) + " joueurs)</button></div>";
    return h;
  }
  function filtersHtml(v) {
    var f = function (attr, val, on, label) { return '<button type="button" class="cal-filter' + (on ? " active" : "") + '" ' + attr + '="' + esc(val) + '">' + esc(label) + "</button>"; };
    return '<div class="cal-toolbar vs-tabs">' + f("data-nc-pos", "", !ui.pos, "Tous les postes") +
      POS.map(function (p) { return f("data-nc-pos", p, ui.pos === p, posShort(p)); }).join("") +
      f("data-nc-filter", "dispo", ui.filter === "dispo", "Disponibles") + f("data-nc-filter", "u23", ui.filter === "u23", "23 ans et moins") +
      ((v.followed || []).length ? f("data-nc-filter", "suivis", ui.filter === "suivis", "Suivis") : "") + "</div>";
  }
  function joueursHtml(v) {
    var list = ((v.pool && v.pool.players) || []).filter(function (x) {
      return (!ui.pos || x.position === ui.pos) && (ui.filter !== "dispo" || !x.injuryUntil) && (ui.filter !== "u23" || x.age <= 23) && (ui.filter !== "suivis" || inList(followedRefs(v), x));
    });
    var empty = can("assigned") ? "Aucun joueur ne vous est attribué pour l'instant : le sélectionneur, un adjoint ou un recruteur vous en confiera." : "Aucun joueur.";
    return '<div class="nc-card">' + filtersHtml(v) + playersTableHtml(list, v, { limit: true, empty: empty }) +
      '<p class="nc-small">' + (can("assigned") ? "Vous ne voyez que les joueurs qui vous sont attribués." : "Caractéristiques et état physique : visibles du staff de la sélection seulement, jamais le salaire, le contrat ni le potentiel.") + "</p></div>";
  }
  function followedRefs(v) { return ((v && v.followed) || []).map(function (e) { return e.ref; }); }
  function refsToPlayers(list) {
    var pm = poolByKey();
    return list.map(function (r) { return pm[key(r)] || null; }).filter(Boolean);
  }
  function missingNote(list) {
    var pm = poolByKey(), miss = list.filter(function (r) { return !pm[key(r)]; });
    if (!miss.length) return "";
    var names = miss.map(function (r) { return esc(r.n); }).join(", ");
    return '<p class="nc-small">' + (miss.length > 1 ? miss.length + " joueurs de la liste ne sont plus sélectionnables : " + names + "." : "1 joueur de la liste n'est plus sélectionnable : " + names + ".") + "</p>";
  }
  // Présélection : la liste de travail centrale.
  function preselectionHtml(v) {
    return '<div class="nc-stack"><div class="nc-card"><div class="nc-sec"><span class="lp-card-title">Présélection</span><span class="nc-club">' + v.preselection.length + " / " + v.limits.preselection + "</span></div>" +
      playersTableHtml(refsToPlayers(v.preselection), v, { empty: can("preselect") ? "Présélection vide : ajoutez des joueurs (coche) depuis Liste des joueurs ou Joueurs suivis." : "Présélection vide pour l'instant." }) + missingNote(v.preselection) + "</div></div>";
  }
  // Joueurs suivis (onglet à part, 2026-10-07) : serveur = followedOf.
  // Un scout (sans autre rôle) ne reçoit que les joueurs qu'il suit ; les
  // autres voient tous les joueurs suivis et qui les suit.
  function suivisHtml(v) {
    var pm = poolByKey(), list = v.followed || [], own = can("assigned");
    var rows = list.map(function (e) { return { e: e, x: pm[key(e.ref)] || null }; })
      .sort(function (a, b) { return (a.x ? POS.indexOf(a.x.position) : 9) - (b.x ? POS.indexOf(b.x.position) : 9) || (b.x ? genOf(b.x) : 0) - (a.x ? genOf(a.x) : 0); });
    var who = function (e) {
      if (!e.by.length) return '<span class="nc-club">Staff</span>';
      return '<span class="nc-chips" style="justify-content:flex-start">' + e.by.map(function (b) {
        return '<span class="nc-chip" style="padding:3px 9px">' + esc(b.mine ? "Vous" : (b.name || "Membre du staff")) + (b.role ? ' <span class="nc-club">· ' + esc(ROLE_LABEL[b.role] || b.role) + "</span>" : "") + "</span>";
      }).join("") + "</span>";
    };
    var h = '<div class="nc-card"><div class="nc-sec"><span class="lp-card-title">' + (own ? "Joueurs que vous suivez" : "Joueurs suivis par le staff") + '</span><span class="nc-club">' + list.length + "</span></div>";
    if (!rows.length) h += '<p class="nc-club">' + (own ? "Vous ne suivez aucun joueur pour l'instant : les joueurs qui vous sont attribués apparaîtront ici." : "Aucun joueur suivi : attribuez des joueurs aux scouts (page Staff ou fiche du joueur).") + "</p>";
    else {
      h += '<div class="nc-scroll"><table class="nc-table nc-followed"><thead><tr><th>Poste</th><th class="l">Joueur</th><th>Âge</th><th>GEN</th><th>État</th>' + (own ? "" : '<th class="l">Suivi par</th>') + (can("preselect") ? "<th></th>" : "") + "</tr></thead><tbody>" + rows.map(function (r) {
        var x = r.x, e = r.e;
        return "<tr><td>" + (x ? posBadge(x.position) : "–") + '</td><td class="l">' + (x ? profileBtn(x, x.name, true) : "<b>" + esc(e.ref.n) + "</b>") + (x ? '<div class="nc-club">' + esc(x.club.name) + "</div>" : '<div class="nc-club">Plus sélectionnable</div>') + "</td>" +
          "<td>" + (x ? esc(x.age) : "–") + '</td><td class="eff-td-rating">' + (x ? genHtml(x) : "–") + "</td><td>" + (x ? (x.injuryUntil ? statusTag("injured", x) : '<span class="nc-bar"><i style="width:' + Math.max(4, x.condition || 0) + "%;background:" + condColor(x.condition || 0) + '"></i></span>') : "–") + "</td>" +
          (own ? "" : '<td class="l">' + who(e) + "</td>") + (can("preselect") ? '<td style="white-space:nowrap">' + (x ? actionsHtml(x, v) : "") + "</td>" : "") + "</tr>";
      }).join("") + "</tbody></table></div>";
    }
    return h + '<p class="nc-small">' + (own ? "Vous ne voyez que les joueurs que vous suivez vous-même." : "Un joueur est suivi quand il est attribué à un scout (il le suit) ou ajouté aux joueurs suivis.") + "</p></div>";
  }

  // --- Convocations (page unique : convoqués, ajout, remplacement) -------
  function replaceHtml(v, cur) {
    var conv = convRefs(cur), pm = poolByKey();
    var cands = ((v.pool && v.pool.players) || []).filter(function (x) { return !inList(conv, x) && !x.injuryUntil; });
    cands.sort(function (a, b) { return (inList(v.preselection, b) - inList(v.preselection, a)) || genOf(b) - genOf(a); });
    var out = pm[ui.replaceOut];
    return '<div class="nc-next" style="margin-top:10px"><b>Remplacer ' + esc(ui.replaceOut.split("|").slice(1).join("|")) + "</b>" + (out ? " (" + esc(posShort(out.position)) + ")" : "") +
      '<div class="nc-row" style="margin-top:8px"><select id="ncReplaceIn" class="nc-in" style="flex:1">' +
      cands.slice(0, 80).map(function (x) { return '<option value="' + esc(key(x)) + '">' + esc(x.name + " · " + posShort(x.position) + " · GEN " + genOf(x) + (inList(v.preselection, x) ? " · présélection" : "")) + "</option>"; }).join("") +
      '</select><button type="button" class="tq-btn" data-nc-replace-go="1">Valider</button><button type="button" class="nc-ic" data-nc-replace-cancel="1" title="Annuler">' + icon("cross") + "</button></div></div>";
  }
  function convocationsHtml(v) {
    if (!v.gatherings.length) return '<div class="nc-card"><p class="nc-club">Aucun rassemblement cette saison.</p></div>';
    // Fenêtres sans match (exemptée) : rien à afficher, seul le vrai match compte.
    var h = '<div class="nc-gath">' + v.gatherings.filter(function (x) { return !x.bye; }).map(function (x) {
      var on = (ui.gid || v.currentGid) === x.gid;
      var gm = gMatch(x);
      // Phase finale : plusieurs matchs pour un même rassemblement, listés.
      var sub = gm ? '<span class="nc-g-comp">' + esc(gm.comp) + "</span><br>" : x.matches && x.matches.length > 1 ? '<span class="nc-g-comp">' + x.matches.map(function (m) { return esc(teamLab(m.opponent)); }).join(" · ") + "</span><br>" : "";
      return '<button type="button" class="nc-g' + (on ? " on" : "") + (x.past ? " past" : "") + '" data-nc-gid="' + esc(x.gid) + '"><b>' + gTitleHtml(x) + "</b>" + sub + "<span>" + esc(x.kind === "final" ? "Du " + when(x.startAt) + " au " + when(x.endAt) : when(x.startAt, true)) + "</span><br><span>" +
        (x.past ? "Terminé" : x.bye ? "Exempt" : x.frozen ? "Liste figée · " + x.players.length + " convoqués" : "Ouverte · " + x.players.length + " / " + v.limits.convocation) + "</span></button>";
    }).join("") + "</div>";
    var cur = curGathering();
    if (!cur) return h + '<div class="nc-card"><p class="nc-club">Choisissez un rassemblement.</p></div>';
    var pm = poolByKey(), conv = convRefs(cur), edit = can("convoke") && !cur.frozen && !cur.past;
    h += '<div class="nc-next"><b>' + esc(compLabel(cur)) + '</b><br><span class="nc-club">' + (cur.frozen ? icon("lock") + " Liste figée" : "Liste modifiable jusqu'au " + esc(when(cur.freezeAt, true))) + "</span></div>";
    // Convoqués : infos joueur et disponibilité.
    var rows = cur.players.map(function (c) { return { c: c, x: pm[key(c.ref)] || null }; })
      .sort(function (a, b) { return (a.x ? POS.indexOf(a.x.position) : 9) - (b.x ? POS.indexOf(b.x.position) : 9) || (b.x ? genOf(b.x) : 0) - (a.x ? genOf(a.x) : 0); });
    h += '<div class="nc-two"><div class="nc-card"><div class="nc-sec"><span class="lp-card-title">Convoqués</span><span class="nc-club">' + cur.players.length + " / " + v.limits.convocation + "</span></div>";
    if (!rows.length) h += '<p class="nc-club">Aucun joueur convoqué pour l\'instant.</p>';
    else {
      h += '<div class="nc-scroll"><table class="nc-table"><thead><tr><th>Poste</th><th class="l">Joueur</th><th>Âge</th><th>GEN</th><th>État</th><th>Disponibilité</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
        var x = r.x, c = r.c;
        return "<tr><td>" + (x ? posBadge(x.position) : "–") + '</td><td class="l">' + profileBtn(x, c.ref.n, true) + (x ? '<div class="nc-club">' + esc(x.club.name) + "</div>" : "") + "</td><td>" + (x ? esc(x.age) : "–") + '</td><td class="eff-td-rating">' + (x ? genHtml(x) : "–") + "</td>" +
          "<td>" + (x && !x.injuryUntil ? '<span class="nc-bar"><i style="width:' + Math.max(4, x.condition || 0) + "%;background:" + condColor(x.condition || 0) + '"></i></span>' : "–") + "</td><td>" + statusTag(c.status, x) + "</td><td style=\"white-space:nowrap\">" +
          (edit ? '<button type="button" class="nc-ic" data-nc-conv="0" data-nc-p="' + esc(c.ref.p) + '" data-nc-n="' + esc(c.ref.n) + '" title="Retirer">' + icon("cross") + "</button>" :
            can("convoke") && cur.frozen && !cur.past && c.status !== "ok" ? '<button type="button" class="tq-btn" data-nc-replace="' + esc(key(c.ref)) + '">Remplacer</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    }
    if (ui.replaceOut) h += replaceHtml(v, cur);
    h += '<p class="nc-small">' + (cur.frozen ? "Liste figée 3 jours avant le premier match : seul un joueur blessé ou devenu inéligible peut être remplacé. Pour chaque match, 12 joueurs sont choisis parmi ces 15 dans Tactique." :
      "Au gel de la liste (3 jours avant le premier match), les places libres sont complétées (présélection d'abord) et chaque manager de club concerné est prévenu.") + "</p></div>";
    // Préparer le groupe : présélection à convoquer.
    h += '<div class="nc-card">';
    if (can("preselectView")) {
      var pre = refsToPlayers(v.preselection).filter(function (x) { return !inList(conv, x); }).sort(function (a, b) { return POS.indexOf(a.position) - POS.indexOf(b.position) || genOf(b) - genOf(a); });
      h += '<div class="nc-sec"><span class="cal-card-kicker">Présélection non convoquée</span><span class="nc-club">' + pre.length + "</span></div>";
      if (!pre.length) h += '<p class="nc-club">' + (v.preselection.length ? "Toute la présélection est convoquée." : "Présélection vide.") + "</p>";
      pre.forEach(function (x) {
        h += '<div class="nc-slot">' + posBadge(x.position) + '<span class="nc-grow">' + profileBtn(x, x.name) + ' <span class="nc-club">· GEN ' + esc(genOf(x)) + " · " + esc(x.club.name) + "</span></span>" + (x.injuryUntil ? statusTag("injured", x) : "") +
          (edit ? '<button type="button" class="nc-ic" data-nc-conv="1" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '" title="Convoquer"' + (conv.length >= v.limits.convocation ? " disabled" : "") + ">" + icon("plus") + "</button>" : "") + "</div>";
      });
    }
    if (cur.changes && cur.changes.length) {
      h += '<div class="nc-sec" style="margin-top:14px"><span class="cal-card-kicker">Remplacements</span></div>' + cur.changes.map(function (c) {
        return '<div class="nc-slot">' + icon("swap") + '<span class="nc-grow">' + esc(c.in.n) + " remplace " + esc(c.out.n) + ' <span class="nc-club">(' + (c.reason === "injured" ? "blessé" : "plus éligible") + ")</span></span></div>";
      }).join("");
    }
    return h + "</div></div>";
  }

  // --- Tactique (retour utilisateur 2026-10-06) -------------------------------
  // Même page que les Ordres d'un club (moteurbasket3.html : buildTeamPanel,
  // renderLineupEditor, renderPlayingTimeCard), sur un « proxy » d'équipe
  // (tqProxyFrom, comme une tactique enregistrée du club) construit avec les
  // joueurs du match : fiches du vivier (caractéristiques, forme, poste…),
  // ids = numéros propres à la sélection (`nid`). Ordres PAR MATCH (sélecteur
  // des matchs à venir, comme les journées du club), enregistrés côté serveur
  // (m.plans[matchId]) et verrouillés à T − 5 min ; « Tactique par défaut »
  // = ordres des matchs sans ordres.
  var TQ_DEFAULT = "default";
  var TQ_TABS = [["ordresCardCinq", "Composition"], ["ordresCardAttaque", "Attaque"], ["ordresCardDefense", "Défense"], ["ordresCardMinutes", "Temps de jeu"], ["ordresCardAdversaires", "Adversaires"]];
  function tqUpcoming(v) { return (v && v.upcoming) || []; }
  function tqLocked(x) { return !!x && (x.locked || Date.now() >= x.lockAt); }
  function tqEntry(v, k) { return tqUpcoming(v).filter(function (x) { return String(x.id) === String(k); })[0] || null; }
  // Match affiché : celui choisi, sinon le prochain qui n'est pas verrouillé.
  function tqKey(v) {
    if (ui.tqMatch === TQ_DEFAULT || tqEntry(v, ui.tqMatch)) return ui.tqMatch;
    var list = tqUpcoming(v), open = list.filter(function (x) { return !tqLocked(x); })[0];
    ui.tqMatch = open ? String(open.id) : list[0] ? String(list[0].id) : TQ_DEFAULT;
    return ui.tqMatch;
  }
  // Prochain match (bouton de la barre du haut).
  function tqNext(v) { return tqUpcoming(v)[0] || null; }
  // Joueur du match pour le moteur des Ordres, depuis sa fiche du vivier.
  // Objet Player du jeu (méthodes overall…, sans le constructeur qui tire
  // une nouvelle identité au hasard).
  function tqPlayer(x, f) {
    var data = {
      id: x.nid, name: (f && f.name) || x.ref.n, position: (f && f.position) || "Meneur", age: f ? f.age : null, height: f ? f.height : null,
      nationality: f ? f.nationality : null, attrs: f && f.attrs ? Object.assign({}, f.attrs) : {}, form: f && typeof f.form === "number" ? f.form : 70,
      condition: f && typeof f.condition === "number" ? f.condition : 100, conditionUpdatedAt: Date.now(),
      injuryUntil: f ? f.injuryUntil : null, injuryType: f ? f.injuryType : null, look: f ? f.look : null, matchLog: [],
    };
    return typeof Player === "function" ? Object.assign(Object.create(Player.prototype), data) : data;
  }
  // Ordres envoyés au serveur (même forme que snapshotTactics d'un club) :
  // les 12 de la feuille de match toujours explicites.
  function tqSnap(px) {
    var o = {};
    ["offensivePriorities", "defense", "rhythm", "tacticalTier", "screenDefense", "helpDefense", "postDefense", "closeoutStyle", "offRebStyle", "endgameManagement"].forEach(function (k) { o[k] = Array.isArray(px[k]) ? px[k].slice() : px[k]; });
    o.watchAssignments = (px.watchAssignments || []).map(function (w) { return { position: w.position, focus: w.focus }; });
    var L = px.lineup || {};
    o.lineup = JSON.parse(JSON.stringify({ starters: L.starters || {}, backupPositions: L.backupPositions || {}, minutes: L.minutes || undefined }));
    o.lineup.convoked = px.convokedIds();
    return o;
  }
  // Joueurs de la feuille d'un match (ou des ordres par défaut) dans une vue.
  function tqRosterIds(v, k) {
    var e = k === TQ_DEFAULT ? null : tqEntry(v, k), r = e ? e.players : v && v.tacticsPlayers;
    return (r || []).map(function (x) { return String(x.nid); });
  }
  // Nouvelle vue du serveur (BUG 2026-10-09 : « après une convocation,
  // l'effectif des Tactiques ne se met à jour qu'en rechargeant la page ») :
  // ui.tq (équipe des Ordres construite une fois) était réutilisé tel quel
  // tant que le match affiché ne changeait pas. Toute action qui renvoie la
  // vue passe par ici : si l'effectif du match affiché a changé
  // (convocation, remplacement, présélection, attribution…), l'équipe des
  // Ordres est reconstruite depuis la nouvelle vue — en gardant les
  // modifications en cours non enregistrées — et les nouveaux convoqués
  // entrent sur la feuille de match s'il reste de la place (12).
  function setView(d) {
    var old = ui.view, tq = ui.tq;
    ui.view = d;
    if (!tq || !old) return;
    var k = tq.key;
    if (k !== TQ_DEFAULT && !tqEntry(d, k)) { ui.tq = null; return; }
    var before = tqRosterIds(old, k), after = tqRosterIds(d, k);
    if (before.join(",") === after.join(",")) return;
    var keep = tq.dirty ? tqSnap(tq.proxy) : null;
    var next = tqMake(d, k, keep);
    var L = next.proxy.lineup || {};
    if (Array.isArray(L.convoked)) after.forEach(function (id) {
      if (before.indexOf(id) >= 0) return;
      var p = next.proxy.players.filter(function (x) { return String(x.id) === id; })[0];
      if (p && L.convoked.indexOf(p.id) < 0 && L.convoked.length < 12) L.convoked.push(p.id);
    });
    if (keep) next.saved = tq.saved;
    next.dirty = JSON.stringify(tqSnap(next.proxy)) !== next.saved;
    ui.tq = next;
  }
  function tqBuild(v, k) {
    ui.tq = tqMake(v, k);
    return ui.tq;
  }
  // Équipe de la sélection (joueurs de la feuille, ordres, cinq) sans
  // toucher à l'état de l'écran Tactique : sert aussi au Vestiaire.
  function tqMake(v, k, ordersOverride) {
    var e = k === TQ_DEFAULT ? null : tqEntry(v, k);
    var orders = ordersOverride || (e && v.plans && v.plans[e.id]) || v.tactics;
    var roster = e ? e.players : v.tacticsPlayers;
    var pm = poolByKey(), fiches = {};
    var players = roster.map(function (x) { fiches[x.nid] = pm[key(x.ref)] || null; return tqPlayer(x, fiches[x.nid]); });
    var px = window.tqProxyFrom(JSON.parse(JSON.stringify(orders)), players, teamLab(v.team.id));
    // tqProxyFrom laisse les consignes de marquage vides (tactiques du
    // club) : celles des ordres de la sélection sont reprises.
    px.watchAssignments = (orders.watchAssignments || []).map(function (w) { return { position: w.position, focus: w.focus }; });
    // Aucun titulaire choisi : cinq proposé comme le fait le serveur au
    // coup d'envoi (NationalMatches.buildSide : poste de carte, puis note).
    if (players.length >= 5 && POS.every(function (p) { return px.lineup.starters[p] == null; })) {
      var conv = px.convokedIds(), used = {};
      POS.forEach(function (pos) {
        var c = players.filter(function (p) { return conv.indexOf(p.id) >= 0 && !used[p.id]; })
          .sort(function (a, b) { return ((b.position === pos) - (a.position === pos)) || (genOf(fiches[b.id] || {}) || 0) - (genOf(fiches[a.id] || {}) || 0); })[0];
        if (c) { used[c.id] = 1; px.setStarter(pos, c.id); }
      });
    }
    return { key: k, proxy: px, fiches: fiches, dirty: false, saved: JSON.stringify(tqSnap(px)), feedback: "" };
  }
  // Vestiaire de la sélection (demande utilisateur du 2026-10-06) : la
  // dynamique de groupe du club (assets/vestiaire.js:buildView, rendu
  // assets/vestiaire-ui.js) appliquée aux joueurs de la sélection, avec le
  // cinq des ordres. Aucun second système : mêmes calculs, même affichage.
  function vestiaireMount() {
    var holder = document.getElementById("ncVestiaire"), v = ui.view;
    if (!holder || !v || !window.HM_VESTIAIRE_UI || !g("tqProxyFrom")) return;
    var tq = ui.tq && ui.tq.key === TQ_DEFAULT ? ui.tq : tqMake(v, TQ_DEFAULT);
    if (!tq.proxy.players.length) { holder.innerHTML = '<p class="vs-empty">Aucun joueur dans la sélection pour le moment : convoquez des joueurs pour voir la dynamique du groupe.</p>'; return; }
    var team = Object.assign(tq.proxy, { chemistry: 50 });
    var prof = function (p) { var f = tq.fiches[p.id]; return f && f.club ? f.club.leagueId + "|" + f.club.idx + "|" + f.p : null; };
    window.__lastVestiaire = window.HM_VESTIAIRE_UI.render({
      holder: holder, team: team, recent: null, noTalk: true,
      lineupAttrs: 'data-nc-nav="tactique"',
      link: function (p) { var r = prof(p); return r ? '<button type="button" class="nc-nm player-link" data-nc-profile="' + esc(r) + '">' + esc(p.name) + "</button>" : esc(p.name); },
      playerAttrs: function (p) { var r = prof(p); return r ? 'data-nc-profile="' + esc(r) + '"' : ""; },
    });
  }
  // Adversaire pour la carte « Postes à surveiller » : nom et titulaires
  // pressentis (ordres de l'autre sélection), comme le titulaire adverse
  // actuel côté club.
  function tqOpponent(e) {
    if (!e || !e.opponent) return null;
    var players = [], starters = {};
    Object.keys(e.pressentis || {}).forEach(function (pos, i) { players.push({ id: i + 1, name: e.pressentis[pos] }); starters[pos] = i + 1; });
    return { name: teamLab(e.opponent), players: players, lineup: { starters: starters } };
  }
  // Effectif hors club pour renderLineupEditor (voir compoRosterRowsData) :
  // stats de la saison en club et 5 derniers matchs des fiches du vivier.
  function tqRosterCtx(tq) {
    var fiche = function (p) { return tq.fiches[p.id] || null; };
    return {
      seasonLine: function (p) {
        var s = (fiche(p) || {}).season || { gp: 0 }, gp = s.gp || 0, sum = {};
        ["min", "pts", "reb", "ast"].forEach(function (k) { sum[k] = (s[k] || 0) * gp; });
        return { gp: gp, sum: sum };
      },
      evalAvg: function (p) { var l = (fiche(p) || {}).last5 || []; return l.length ? l.reduce(function (s, e) { return s + (e.eff || 0); }, 0) / l.length : -Infinity; },
      evalHtml: function (p) {
        var l = ((fiche(p) || {}).last5 || []).slice(-5), h = '<span class="eval-squares">';
        for (var i = l.length; i < 5; i++) h += '<span class="eval-square"></span>';
        l.forEach(function (e) {
          var col = typeof pirTier === "function" && typeof PIR_TIER_COLORS !== "undefined" ? PIR_TIER_COLORS[pirTier(e.eff || 0)] : effColor(e.eff || 0);
          h += '<span class="eval-square" style="background:' + col + '" title="' + esc(t("Évaluation") + " " + ((e.eff || 0) >= 0 ? "+" : "") + (e.eff || 0) + (e.opp ? " · " + e.opp : "")) + '"></span>';
        });
        return h + "</span>";
      },
      linkHtml: function (p) {
        var f = fiche(p);
        return f && f.club ? '<button type="button" class="nc-nm" data-nc-profile="' + esc(f.club.leagueId + "|" + f.club.idx + "|" + f.p) + '">' + esc(p.name) + "</button>" : esc(p.name);
      },
    };
  }
  function tqMatchLabel(x) { return teamLab(x.opponent) + " · " + x.comp + " · " + when(x.at, true); }
  function tqStatus(tq, e) {
    if (tqLocked(e)) return ["locked", "Ordres verrouillés"];
    if (tq && tq.dirty) return ["dirty", "Modifications à valider"];
    if (!e) return ["ok", "Tactique par défaut"];
    return e.hasPlan ? ["ok", "Ordres validés"] : ["todo", "Ordres pas encore validés"];
  }
  function tactiqueHtml(v) {
    var k = tqKey(v), e = k === TQ_DEFAULT ? null : tqEntry(v, k), locked = tqLocked(e);
    var tq = ui.tq && ui.tq.key === k ? ui.tq : null;
    var st = tqStatus(tq, e), readOnly = !can("tactics");
    var h = '<div id="ncOrdres"><div class="ordres-actionbar"><div class="oab-left"><h1 class="oab-title">' + esc(t("Tactique")) + '</h1><nav class="oab-tabs" aria-label="' + esc(t("Sections des ordres")) + '">' +
      TQ_TABS.map(function (x) { return '<button type="button" class="oab-tab" data-nc-jump="' + x[0] + '">' + esc(t(x[1])) + "</button>"; }).join("") + "</nav></div>";
    var pill = "";
    if (e) {
      var left = e.lockAt - Date.now();
      pill = locked ? '<span class="ordres-lock-pill is-locked">' + esc(t("Verrouillé")) + "</span>"
        : '<span class="ordres-lock-pill' + (left < 3600e3 ? " is-soon" : "") + '">' + esc(t("Verrouillage dans") + " " + (typeof window.formatLockDelay === "function" ? window.formatLockDelay(left) : when(e.lockAt, true))) + "</span>";
    }
    h += '<div class="oab-right">' + pill + "</div></div>";
    // Carte du match : compétition, date, lieu, affiche ; sélecteur des matchs.
    h += '<section class="ordres-match-card nc-omc"><div class="omc-match"><div class="ordres-round-datetime">';
    if (e) {
      var me = '<span class="omc-team omc-team-me">' + flag(v.team.country) + " " + esc(teamLab(v.team.id)) + "</span>", them = '<span class="omc-team">' + esc(teamLab(e.opponent)) + "</span>";
      h += '<div class="omc-meta"><span class="omc-badge">' + esc(e.comp) + "</span><span>" + esc(when(e.at, true)) + '</span><span aria-hidden="true">·</span><span>' + esc(t(e.venue === "home" ? "À domicile" : "À l'extérieur")) + "</span></div>" +
        '<div class="omc-teams">' + (e.venue === "home" ? me + '<span class="omc-vs">vs</span>' + them : them + '<span class="omc-vs">vs</span>' + me) + "</div>";
    } else {
      h += '<div class="omc-meta"><span class="omc-badge">' + esc(t("Tactique par défaut")) + '</span></div><p class="nc-small">' + esc(t("Appliquée aux matchs pour lesquels aucun ordre n'a été donné.")) + "</p>";
    }
    h += '</div><div class="ordres-round-selector"><label class="field-label" for="ncTqMatch">' + esc(t("Préparer le match")) + '</label><select id="ncTqMatch" data-nc-tq-match="1">' +
      tqUpcoming(v).map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (String(x.id) === k ? " selected" : "") + ">" + esc(tqMatchLabel(x)) + (tqLocked(x) ? " (" + esc(t("verrouillé")) + ")" : x.hasPlan ? " (" + esc(t("préparé")) + ") ●" : "") + "</option>";
      }).join("") + '<option value="' + TQ_DEFAULT + '"' + (k === TQ_DEFAULT ? " selected" : "") + ">" + esc(t("Tactique par défaut")) + "</option></select></div></div></section>";
    if (locked) h += '<p class="ordres-lock-note">' + esc(t("Compositions verrouillées : le coup d'envoi est imminent.")) + "</p>";
    else if (readOnly) h += '<p class="ordres-lock-note">' + esc(t("Consultation : le sélectionneur et ses adjoints décident des ordres.")) + "</p>";
    var roster = e ? e.players : v.tacticsPlayers;
    h += roster.length ? '<div class="prep-grid" id="ncTqGrid"></div>' : '<div class="nc-card"><p class="nc-club">' + esc(t("Aucun joueur : convoquez (ou présélectionnez) des joueurs d'abord.")) + "</p></div>";
    if (readOnly) return h + "</div>";
    h += '<div class="ordres-savebar' + (st[0] === "dirty" ? " is-dirty" : "") + '"><div class="osb-left"><span class="ordres-status ' + st[0] + '" id="ncTqStatus" role="status"><span class="ordres-status-dot" aria-hidden="true"></span><span>' + esc(t(st[1])) + "</span></span>" +
      '<p class="ordres-validate-feedback ok" role="status">' + esc(tq && tq.feedback ? t(tq.feedback) : "") + "</p></div>" +
      '<div class="osb-actions"><button type="button" class="osb-cancel" data-nc-tq-revert="1"' + (!tq || !tq.dirty || locked ? " disabled" : "") + ">" + esc(t("Annuler")) + "</button>" +
      '<button type="button" class="ordres-validate-btn" data-nc-tq-save="1"' + (locked || ui.busy || !roster.length ? " disabled" : "") + ">" + esc(t("Enregistrer")) + "</button></div></div></div>";
    return h;
  }
  // Panneau des Ordres du club monté dans la page (après chaque rendu).
  function tqMount() {
    var grid = document.getElementById("ncTqGrid"), v = ui.view;
    if (!grid || !v || typeof window.buildTeamPanel !== "function" || typeof window.tqProxyFrom !== "function") return;
    ensureOrdresCss();
    var k = tqKey(v), e = k === TQ_DEFAULT ? null : tqEntry(v, k);
    var tq = ui.tq && ui.tq.key === k ? ui.tq : tqBuild(v, k);
    grid.appendChild(window.buildTeamPanel(tq.proxy, "b", {
      editable: !tqLocked(e) && can("tactics"), opponent: tqOpponent(e), roster: tqRosterCtx(tq),
      onDirty: function () { tq.dirty = JSON.stringify(tqSnap(tq.proxy)) !== tq.saved; tq.feedback = ""; tqPaintStatus(); },
    }));
    tqPaintTabs();
  }
  function tqPaintStatus() {
    var v = ui.view, k = tqKey(v), e = k === TQ_DEFAULT ? null : tqEntry(v, k), tq = ui.tq;
    var st = tqStatus(tq, e), el = document.getElementById("ncTqStatus");
    if (el) { el.className = "ordres-status " + st[0]; el.lastChild.textContent = t(st[1]); }
    var bar = el && el.closest(".ordres-savebar");
    if (bar) bar.classList.toggle("is-dirty", st[0] === "dirty");
    var fb = document.querySelector("#ncOrdres .ordres-validate-feedback");
    if (fb) fb.textContent = tq && tq.feedback ? t(tq.feedback) : "";
    var rv = document.querySelector("[data-nc-tq-revert]");
    if (rv) rv.disabled = !tq || !tq.dirty || tqLocked(e);
    tqPaintTabs();
  }
  // Onglet « Adversaires » masqué en niveau tactique débutant (comme le club).
  function tqPaintTabs() {
    Array.prototype.forEach.call(document.querySelectorAll("#ncOrdres [data-nc-jump]"), function (b) {
      var target = document.querySelector("#ncOrdres .area-" + b.dataset.ncJump);
      b.classList.toggle("hidden", !target || target.classList.contains("hidden"));
    });
  }
  // Styles des Ordres du club, écrits pour #prepSection : repris tels quels
  // pour #ncOrdres (une seule source, rien de recopié à la main).
  function ensureOrdresCss() {
    if (document.getElementById("ncOrdresCss")) return;
    var out = [];
    var walk = function (rules, into) {
      Array.prototype.forEach.call(rules || [], function (r) {
        if (r.cssRules && r.media) { var inner = []; walk(r.cssRules, inner); if (inner.length) out.push("@media " + r.media.mediaText + "{" + inner.join("\n") + "}"); return; }
        if (r.selectorText && r.selectorText.indexOf("#prepSection") >= 0) into.push(r.cssText.replace(/#prepSection/g, "#ncOrdres"));
      });
    };
    Array.prototype.forEach.call(document.styleSheets || [], function (sh) { try { walk(sh.cssRules, out); } catch (err) { /* feuille d'un autre domaine */ } });
    out.push("#ncOrdres .ordres-match-card.nc-omc{grid-template-columns:minmax(0,1fr)}#ncOrdres .omc-team .nat-flag{width:34px;height:23px;border-radius:3px;object-fit:cover;vertical-align:middle}#ncOrdres .oab-tab.hidden{display:none}");
    var s = document.createElement("style"); s.id = "ncOrdresCss"; s.textContent = out.join("\n"); document.head.appendChild(s);
  }
  function tqSave() {
    var tq = ui.tq;
    if (!ui.view || !tq || ui.busy) return Promise.resolve();
    var body = { orders: tqSnap(tq.proxy) };
    if (tq.key !== TQ_DEFAULT) body.matchId = tq.key;
    var k0 = tq.key;
    return post("/api/national/coach/tactics", body, k0 === TQ_DEFAULT ? "Tactique par défaut enregistrée." : "Ordres enregistrés.").then(function () {
      if (ui.error) return;
      // Ordres relus depuis la réponse du serveur (vue à jour).
      ui.tq = null; ui.tqMatch = k0;
      paint();
      if (ui.tq) { ui.tq.feedback = "Ordres enregistrés."; tqPaintStatus(); }
    });
  }
  // Bouton « Donnez / Modifier vos ordres » de la barre du haut (même style
  // et mêmes états que #topbarOrdersBtn du club) : ordres du prochain match.
  function syncOrdersButton() {
    var right = document.querySelector(".topbar-right");
    var btn = document.getElementById("ncOrdersBtn");
    var nx = ui.mode && can("tactics") ? tqNext(ui.view) : null;
    if (!nx || !right) { if (btn) btn.remove(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.id = "ncOrdersBtn"; btn.className = "topbar-cta";
      var meta = document.getElementById("ncNextMeta");
      right.insertBefore(btn, meta ? meta.nextSibling : right.firstChild);
      btn.addEventListener("click", openNextOrders);
    }
    var locked = tqLocked(nx);
    btn.textContent = t(locked ? "Ordres verrouillés" : nx.hasPlan ? "Modifier vos ordres" : "Donnez vos ordres");
    btn.classList.toggle("topbar-cta-validated", !!nx.hasPlan && !locked);
    btn.disabled = locked;
    btn.classList.toggle("is-locked", locked);
    btn.title = locked ? t("Coup d'envoi dans moins de 5 minutes : les ordres ne sont plus modifiables.") : teamLab(nx.opponent) + " · " + when(nx.at, true);
  }
  function openNextOrders() {
    var n = tqNext(ui.view);
    if (!n || tqLocked(n)) return;
    if (ui.tq && ui.tq.dirty && String(n.id) !== ui.tq.key && !window.confirm(t("Abandonner les modifications non enregistrées ?"))) return;
    ui.nav = "tactique"; ui.tqMatch = String(n.id); ui.error = "";
    if (ui.tq && ui.tq.key !== ui.tqMatch) ui.tq = null;
    showModePage(); paint();
    try { var sc = document.querySelector(".content-scroll"); if (sc) sc.scrollTop = 0; } catch (err) { /* rien */ }
  }

  // --- Amicaux internationaux ------------------------------------------------
  var FR_STATE = { sent: ["Envoyée", "info"], received: ["Reçue", "mid"], scheduled: ["Programmé", "ok"], played: ["Joué", "ok"], refused: ["Refusée", "bad"], cancelled: ["Annulée", "bad"], live: ["En direct", "info"] };
  function frLine(f, acts) {
    var st = FR_STATE[f.state] || [f.state, ""];
    var why = f.state === "cancelled" ? (f.reason === "expired" ? " · sans réponse avant le gel des convocations" : f.reason === "conflict" ? " · date prise par un autre amical" : "") : "";
    var score = f.state === "played" && f.scoreHome != null ? '<span class="nc-club"> · ' + esc(teamLab(f.home)) + " " + esc(f.scoreHome) + " – " + esc(f.scoreAway) + " " + esc(teamLab(f.away)) + "</span>" : "";
    return '<div class="nc-fr">' + flag(f.opponentCountry) + '<div class="nc-grow"><b>' + esc(teamLab(f.opponent)) + '</b> <span class="nc-club">' + (f.venue === "home" ? "· à domicile" : "· à l'extérieur") + "</span><br>" +
      '<span class="nc-club">' + esc(when(f.at, true)) + "</span>" + score + (why ? '<span class="nc-club"> ' + why + "</span>" : "") + "</div>" + '<span class="nc-tag ' + st[1] + '">' + esc(st[0]) + "</span>" + liveBtn(f) + (acts || "") + "</div>";
  }
  // Bouton du direct (match en cours ou imminent), commun aux pages
  // Sélections (assets/national.js) : même écran de direct que les clubs.
  function liveBtn(m) { return window.HM_NATIONAL && window.HM_NATIONAL.liveBtnHtml ? window.HM_NATIONAL.liveBtnHtml(m) : ""; }
  function amicauxHtml(v) {
    var fr = v.friendlies;
    if (!fr) return '<div class="nc-card"><p class="nc-club">Réservé au sélectionneur.</p></div>';
    var now = Date.now();
    var h = '<div class="nc-stack">';
    if (!fr.live) h += '<div class="nc-card"><p class="nc-club">Les matchs internationaux ne sont pas encore en service.</p></div>';
    // Envoyer une demande.
    var opps = fr.opponents, dates = fr.dates.filter(function (d) { return !ui.frOpp || d.busy.indexOf(ui.frOpp) < 0; });
    var full = fr.limits.used >= fr.limits.perSeason;
    h += '<div class="nc-card"><div class="nc-sec"><span class="lp-card-title">Proposer un match amical</span><span class="nc-club">' + fr.limits.used + " / " + fr.limits.perSeason + " cette saison</span></div>";
    if (full) h += '<p class="nc-club">Nombre maximum de matchs amicaux atteint pour cette saison.</p>';
    else {
      h += '<div class="nc-set"><label><span class="field-label">Adversaire</span><select class="lp-input" data-nc-fr="opp"><option value="">Choisir une sélection</option>' + opps.map(function (o) {
        return '<option value="' + esc(o.id) + '"' + (ui.frOpp === o.id ? " selected" : "") + ">" + esc(teamLab(o.id) + (o.interim ? " · intérim (accepte d'office)" : " · " + o.coach) + (o.used >= fr.limits.perSeason ? " · complet" : "")) + "</option>";
      }).join("") + "</select></label>" +
        '<label><span class="field-label">Fenêtre internationale</span><select class="lp-input" data-nc-fr="at"><option value="">' + (dates.length ? "Choisir une fenêtre" : "Aucune fenêtre libre") + "</option>" + dates.map(function (d) {
          return '<option value="' + d.at + '"' + (String(ui.frAt) === String(d.at) ? " selected" : "") + ">" + esc("Fenêtre internationale " + d.window + " · " + when(d.at, true)) + "</option>";
        }).join("") + "</select></label>" +
        '<label><span class="field-label">Lieu</span><select class="lp-input" data-nc-fr="venue"><option value="home"' + (ui.frVenue === "home" ? " selected" : "") + '>À domicile</option><option value="away"' + (ui.frVenue === "away" ? " selected" : "") + ">À l'extérieur</option></select></label></div>" +
        '<div class="lp-actions" style="margin-top:14px"><button type="button" class="cal-next-btn lp-btn" data-nc-fr-send="1"' + (!ui.frOpp || !ui.frAt || ui.busy ? " disabled" : "") + ">Envoyer la demande</button></div>";
    }
    h += '<p class="nc-small">' + (fr.dates.length ? "" : "Votre sélection joue ses qualifications à chaque fenêtre restante. ") + "Les amicaux se jouent uniquement pendant les fenêtres internationales (dimanche à 20h), entre deux sélections sans match de qualification ce jour-là. Réponse attendue avant le gel des convocations (3 jours avant le match).</p></div>";
    var sec = function (title, list, actsFn, empty) {
      return '<div class="nc-card"><div class="nc-sec"><span class="lp-card-title">' + esc(title) + '</span><span class="nc-club">' + list.length + "</span></div>" + (list.length ? list.map(function (f) { return frLine(f, actsFn ? actsFn(f) : ""); }).join("") : '<p class="nc-club">' + esc(empty) + "</p>") + "</div>";
    };
    h += sec("Demandes reçues", fr.received, function (f) {
      return '<button type="button" class="tq-btn" data-nc-fr-accept="' + esc(f.id) + '">Accepter</button><button type="button" class="tq-btn" data-nc-fr-refuse="' + esc(f.id) + '">Refuser</button>';
    }, "Aucune demande reçue.");
    h += sec("Demandes envoyées", fr.sent, function (f) { return '<button type="button" class="tq-btn" data-nc-fr-cancel="' + esc(f.id) + '">Annuler</button>'; }, "Aucune demande en attente.");
    h += sec("Matchs programmés", fr.scheduled, function (f) {
      return '<button type="button" class="tq-btn" data-nc-gid-go="' + esc(f.gid) + '">Convocations</button>' + (now < f.freezeAt ? '<button type="button" class="tq-btn" data-nc-fr-cancel="' + esc(f.id) + '">Annuler</button>' : "");
    }, "Aucun match amical programmé.");
    h += sec("Matchs joués", fr.played, function (f) { return '<button type="button" class="tq-btn" data-nc-match="' + esc(f.id) + '">Feuille de match</button>'; }, "Aucun match amical joué.");
    if (fr.closed.length) h += sec("Refusées et annulées", fr.closed, null, "");
    return h + "</div>";
  }

  // --- Staff (refonte du 2026-10-07) ---------------------------------------
  // Une seule page, adaptée au rôle : chacun ne voit que les sections et les
  // actions qu'il peut exercer (v.appoint = rôles qu'il nomme / retire,
  // perm « assign » = affecter des joueurs aux scouts). Mêmes règles côté
  // serveur (nationalCoach.PERMS / APPOINT).
  var STAFF_GROUPS = [
    ["Staff NT", [["assistant", "Adjoints", "Mêmes accès que le sélectionneur (joueurs, convocations, ordres, amicaux, staff), sauf nommer ou retirer un adjoint."],
      ["helper", "Personnes aidantes", "Aident aux décisions de roster et d'ordres : consultent les joueurs, la présélection, les convoqués et la tactique, et suivent des joueurs."]]],
    ["DTN", [["recruiter", "Recruteurs", "Gèrent les joueurs suivis, nomment les scouts et leur attribuent des joueurs."],
      ["scout", "Scouts", "Ne voient que les joueurs qui leur sont attribués : ils les suivent et les analysent."]]],
  ];
  var INVITE_LABEL = { assistant: "Adjoint", helper: "Personne aidante", recruiter: "Recruteur", scout: "Scout" };
  function assignHtml(v, s) {
    var mine = (v.assign && v.assign[s.mid]) || [], max = v.assignMax || 50;
    var h = '<div class="nc-assign"><div class="nc-small" style="margin:6px 0">Joueurs attribués · ' + mine.length + " / " + max + "</div>";
    h += mine.length ? '<div class="nc-chips">' + mine.map(function (r) {
      return '<span class="nc-chip">' + esc(r.n) + (can("assign") ? '<button type="button" class="nc-chip-x" data-nc-assign="' + esc(s.mid) + '" data-nc-on="0" data-nc-p="' + esc(r.p) + '" data-nc-n="' + esc(r.n) + '" aria-label="Retirer">×</button>' : "") + "</span>";
    }).join("") + "</div>" : '<p class="nc-club" style="margin:0">Aucun joueur attribué.</p>';
    if (can("assign") && s.status === "active" && mine.length < max) {
      var taken = {}; mine.forEach(function (r) { taken[key(r)] = 1; });
      var opts = ((v.pool && v.pool.players) || []).filter(function (x) { return !taken[key(x)]; }).slice()
        .sort(function (a, b) { return (inList(v.watchlist, b) - inList(v.watchlist, a)) || (genOf(b) - genOf(a)); });
      // Recherche (nom, club, poste) qui filtre la liste en direct.
      h += '<div class="nc-row" style="margin-top:8px;flex-wrap:wrap;gap:8px"><input type="search" class="nc-in" data-nc-assign-q="' + esc(s.mid) + '" placeholder="Rechercher un joueur, un club, un poste" style="max-width:260px">' +
        '<select class="nc-in" id="ncAssignSel-' + esc(s.mid) + '" style="max-width:320px">' +
        opts.map(function (x) { return '<option value="' + esc(x.p + "|" + x.n) + '" data-q="' + esc((x.name + " " + ((x.club && x.club.name) || "") + " " + (x.position || "")).toLowerCase()) + '">' + esc((inList(v.watchlist, x) ? "★ " : "") + x.name + " · " + (x.position || "") + " · " + genOf(x)) + "</option>"; }).join("") +
        '</select><button type="button" class="tq-btn" data-nc-assign-add="' + esc(s.mid) + '">Attribuer</button></div>';
    }
    return h + "</div>";
  }
  function staffHtml(v) {
    var staff = v.staff || [], max = v.staffMax || {}, appoint = v.appoint || [];
    var h = "";
    STAFF_GROUPS.forEach(function (gr) {
      // Un recruteur ne voit que la DTN ; le staff NT voit les deux.
      var roles = gr[1].filter(function (r) { return gr[0] === "DTN" || appoint.indexOf(r[0]) >= 0; });
      if (!roles.length) return;
      h += '<h3 class="nc-sec" style="margin:18px 0 8px"><span class="cal-card-kicker">' + esc(gr[0]) + "</span></h3><div class=\"nc-two\">";
      roles.forEach(function (r) {
        var role = r[0], list = staff.filter(function (s) { return s.role === role; });
        h += '<div class="nc-card"><div class="nc-sec"><span class="lp-card-title">' + esc(r[1]) + '</span><span class="nc-club">' + list.length + " / " + (max[role] || 0) + "</span></div>" +
          '<p class="nc-small" style="margin:0 0 10px">' + esc(r[2]) + "</p>" +
          (list.length ? list.map(function (s) {
            return '<div class="nc-slot-wrap"><div class="nc-slot"><span class="nc-grow"><b>' + esc(s.pseudo || s.clubName) + '</b> <span class="nc-club">· ' + esc(s.clubName || "") + (s.byName ? " · nommé par " + esc(s.byName) : "") + "</span></span>" +
              (s.status === "active" ? '<span class="nc-tag ok">En poste</span>' : '<span class="nc-tag mid">Invitation envoyée</span>') +
              (appoint.indexOf(role) >= 0 ? '<button type="button" class="tq-btn" data-nc-staff-remove="' + esc(s.mid) + '" data-nc-role="' + role + '">' + (s.status === "active" ? "Retirer" : "Annuler") + "</button>" : "") + "</div>" +
              (role === "scout" && (can("assign") || s.status === "active") ? assignHtml(v, s) : "") + "</div>";
          }).join("") : '<p class="nc-club">Personne pour l\'instant.</p>') + "</div>";
      });
      h += "</div>";
    });
    if (!appoint.length) return h;
    var q = ui.staffQ.trim().toLowerCase();
    var mgrs = (v.managers || []).filter(function (m) { return !q || String(m.pseudo || "").toLowerCase().indexOf(q) >= 0 || String(m.clubName || "").toLowerCase().indexOf(q) >= 0; });
    mgrs.sort(function (a, b) { return (a.busy - b.busy) || String(a.pseudo || a.clubName).localeCompare(String(b.pseudo || b.clubName), "fr"); });
    var count = function (role) { return staff.filter(function (s) { return s.role === role; }).length; };
    // Rôles cumulables : un seul rôle du staff NT (sélectionneur, adjoint,
    // personne aidante), recruteur et scout en plus de n'importe quel rôle.
    var NT_ROLES = ["coach", "assistant", "helper"];
    var blocked = function (m, role) {
      var rs = m.roles || [];
      if (rs.indexOf(role) >= 0) return "déjà " + INVITE_LABEL[role].toLowerCase();
      if ((role === "assistant" || role === "helper") && rs.some(function (r) { return NT_ROLES.indexOf(r) >= 0; })) return "déjà dans le staff NT";
      return "";
    };
    h += '<div class="nc-card" style="margin-top:16px"><div class="nc-sec"><span class="lp-card-title">Nommer un manager</span><span class="nc-club">' + (v.managers || []).length + " managers</span></div>" +
      '<input type="search" class="nc-in" data-nc-staff-q="1" placeholder="Rechercher un manager ou un club" value="' + esc(ui.staffQ) + '" style="width:100%;max-width:420px;margin-bottom:10px">' +
      (mgrs.length ? mgrs.slice(0, 25).map(function (m) {
        var rs = (m.roles || []).map(function (r) { return ROLE_LABEL[r] || r; });
        return '<div class="nc-fr">' + flag(m.country) + '<div class="nc-grow"><b>' + esc(m.pseudo || m.clubName) + '</b><br><span class="nc-club">' + esc(m.clubName || "") + (m.division ? " · " + esc(m.division) : "") + (m.busy ? " · déjà sélectionneur ou dans le staff d'une autre sélection" : rs.length ? " · ici : " + esc(rs.join(", ")) : "") + "</span></div>" +
          appoint.map(function (role) {
            var why = m.busy ? "Pris par une autre sélection" : blocked(m, role);
            return '<button type="button" class="tq-btn" data-nc-staff-invite="' + esc(m.mid) + '" data-nc-role="' + role + '"' + (why || count(role) >= (max[role] || 0) ? ' disabled title="' + esc(why || "Places complètes") + '"' : "") + ">" + esc(INVITE_LABEL[role]) + "</button>";
          }).join("") + "</div>";
      }).join("") : '<p class="nc-club">Aucun manager trouvé.</p>') +
      '<p class="nc-small">Le manager nommé reçoit la proposition dans sa messagerie (bouton « Accepter le poste ») et sur la page Sélections. Une même personne peut cumuler un rôle du staff NT avec recruteur et scout ; vous pouvez aussi vous nommer vous-même recruteur ou scout. Le staff prend fin avec le mandat du sélectionneur.</p></div>';
    return h;
  }

  // --- Analyse des adversaires ------------------------------------------------
  // Retour utilisateur 2026-10-06 : MÊME rapport que l'analyse Premium
  // (Scouting Pro) du Mode Club, pour l'adversaire choisi ou pour sa propre
  // sélection (option « Ma sélection » du sélecteur).
  // Données : /api/national/coach/analysis-data (matchs internationaux de la
  // saison en cours et de la précédente, en « équipe virtuelle »), rendues
  // par les fonctions du club (scoutingProReportHtml et ses blocs sp2*),
  // paramétrées par `report.virtual` (voir moteurbasket3.html).
  function anaTarget(v) {
    if (ui.anaSelf) return v.team.id;
    var o = v.analysis && v.analysis.opponent;
    return o ? o.id : null;
  }
  function loadAnalysis(target) {
    if (!target || (ui.ana && ui.ana.key === target)) return null;
    ui.ana = { key: target, data: null, error: "" };
    var p = api("/api/national/coach/analysis-data?teamId=" + encodeURIComponent(ui.teamId) + (target !== ui.teamId ? "&opp=" + encodeURIComponent(target) : ""))
      .then(function (d) { if (ui.ana && ui.ana.key === target) ui.ana.data = d; })
      .catch(function (e) { if (ui.ana && ui.ana.key === target) ui.ana.error = e.message; })
      .then(paint);
    window.__lastNationalCoach = p;
    return p;
  }
  function shortDate(ts) { try { return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }); } catch (e) { return ""; } }
  // Lien vers la fiche du joueur dans son club (même chemin que les listes).
  function profileLink(p, cls) {
    var c = p && p.club;
    if (!p || !c || c.leagueId == null || c.idx == null || !p.ref) return '<span class="' + (cls || "") + '">' + esc(p ? p.name : "") + "</span>";
    return '<button type="button" class="player-link' + (cls ? " " + cls : "") + '" data-nc-profile="' + esc(c.leagueId + "|" + c.idx + "|" + p.ref.p) + '">' + esc(p.name) + "</button>";
  }
  // Effectif du sélectionneur pour le « 5 de départ suggéré » : convoqués
  // du rassemblement en cours, sinon la présélection (fiches du vivier).
  function anaMine(v) {
    var cur = curGathering(), pm = poolByKey();
    var refs = cur && cur.players.length ? convRefs(cur) : (v.preselection || []);
    var list = refs.map(function (r) { return pm[key(r)]; }).filter(Boolean).map(function (x) {
      var g0 = genOf(x) || 0;
      return { id: x.p, ref: { p: x.p, n: x.n }, name: x.n, position: x.position, age: x.age, look: x.look || null, condition: x.condition, injuryUntil: x.injuryUntil, club: x.club, season: x.season || {}, matchLog: [], overall: function () { return g0; } };
    });
    if (!list.length) return null;
    return {
      team: { name: v.team.label, players: list },
      intro: cur && cur.players.length ? "Votre meilleur convoqué disponible à chaque poste (stats de la saison en club)." : "Votre meilleur joueur présélectionné disponible à chaque poste (stats de la saison en club).",
      link: function (p) { return profileLink(p); },
      sub: function (p) { return p.club ? p.club.name : ""; },
      avg: function (p, k) { var s = p.season || {}; return Number(s[k] || 0).toFixed(1); },
    };
  }
  function anaReportHtml(v, d) {
    var players = d.team.players;
    var byId = {};
    players.forEach(function (p) { byId[p.id] = p; });
    var vt = { name: d.label, players: players, lineup: d.team.lineup };
    var byRound = {};
    d.matches.forEach(function (m) { byRound[m.round] = m; });
    var label = function (g) { return Object.assign({}, g, { label: shortDate(g.at) }); };
    var o = v.analysis && v.analysis.opponent;
    var report = Object.assign({}, d.report, {
      opponentIdx: -1,
      recentForm: (d.report.recentForm || []).map(label),
      headToHead: (d.report.headToHead || []).map(label),
      virtual: {
        team: vt, own: d.own,
        crestHtml: '<span class="nc-ana-crest">' + flag(d.country) + "</span>",
        heroSub: d.own ? "Saisons " + d.seasons[0] + " et " + d.seasons[1] : (o && o.id === d.teamId ? (o.coach ? "Sélectionneur : " + o.coach : "Sélection en intérim") : ""),
        h2hLabel: "Face à vous (2 saisons)",
        matchSource: {
          competition: "national",
          contextFor: function (e) { var m = byRound[e.round]; return m ? { isHome: m.isHome, myScore: m.scoreFor, oppScore: m.scoreAgainst, win: m.scoreFor > m.scoreAgainst } : null; },
          recentRounds: d.matches.slice(-3).map(function (m) { return m.round; }),
        },
        apply: !d.own && can("tactics") ? { attrs: 'data-nc-apply-plan="1"', label: "Appliquer à ma tactique", sub: "Préremplit la tactique de la sélection avec ces consignes" } : null,
        mine: d.own ? null : anaMine(v),
        playerLink: function (p, cls) { return profileLink(byId[p.id] || p, cls); },
      },
    });
    ui.anaTeam = vt;
    return window.scoutingProReportHtml(report);
  }
  function anaBlockHtml(v, target) {
    var ana = ui.ana && ui.ana.key === target ? ui.ana : null;
    var name = esc(teamLab(target));
    var body;
    if (!ana || (!ana.data && !ana.error)) body = '<p class="nc-club">Chargement de l\'analyse…</p>';
    else if (ana.error) body = '<p class="nc-err">' + esc(ana.error) + "</p>";
    else if (!ana.data.report.gamesPlayed) body = "<h3>Scouting Pro · " + name + '</h3><p class="sub">' + (ana.data.own ? "Votre sélection n'a encore joué aucun match international cette saison ni la précédente : pas encore de données pour ce rapport." : name + " n'a joué aucun match international cette saison ni la précédente : pas encore de données pour ce rapport.") + "</p>";
    else if (typeof window.scoutingProReportHtml !== "function") body = '<p class="nc-club">Analyse indisponible.</p>';
    else body = anaReportHtml(v, ana.data);
    return '<div id="ncScoutingPanel" class="sp2-host" style="margin-top:14px">' + body + "</div>";
  }
  function analyseHtml(v) {
    var a = v.analysis;
    if (!a) return '<div class="nc-card"><p class="nc-club">Analyse indisponible.</p></div>';
    var o = a.opponent;
    var h = '<div class="nc-card"><div class="nc-row"><label style="display:flex;flex-direction:column;min-width:0"><span class="field-label">Sélection analysée</span><select class="lp-input" data-nc-opp="1">' +
      (a.next ? '<option value="">Prochain adversaire</option>' : '<option value="">Choisir une sélection</option>') +
      '<option value="__self"' + (ui.anaSelf ? " selected" : "") + ">Ma sélection · " + esc(teamLab(v.team.id)) + "</option>" +
      a.choices.map(function (c) { return '<option value="' + esc(c.id) + '"' + (!ui.anaSelf && ui.opp === c.id ? " selected" : "") + ">" + esc(teamLab(c.id)) + "</option>"; }).join("") + "</select></label>" +
      (a.next ? '<div class="nc-next" style="margin:0;flex:1;min-width:220px"><b>Prochain match</b><br><span>' + esc(a.next.label) + '</span><br><span class="nc-club">' + esc(when(a.next.at, true)) + '</span> <span class="nc-club">' + (a.next.venue === "home" ? "· à domicile contre " : "· à l'extérieur contre ") + esc(teamLab(a.next.opponent)) + "</span></div>" : "") + "</div></div>";
    var target = anaTarget(v);
    if (target) loadAnalysis(target);
    if (ui.anaSelf) return h + anaBlockHtml(v, target);
    if (!o) return h + '<div class="nc-card" style="margin-top:14px"><p class="nc-club">' + (a.next ? "Adversaire à déterminer." : "Aucun match à venir : choisissez une sélection à analyser.") + "</p></div>";
    h += anaBlockHtml(v, target);
    // Effectif de référence (fiches publiques).
    var squad = (o.squad || []).slice().sort(function (x, y) { return POS.indexOf(x.position) - POS.indexOf(y.position) || y.pts - x.pts; });
    h += '<div class="nc-two" style="margin-top:14px"><div class="nc-card"><div class="nc-sec"><span class="lp-card-title">Joueurs de référence</span><span class="nc-club">' + squad.length + "</span></div>" +
      (squad.length ? '<div class="nc-scroll"><table class="nc-table"><thead><tr><th>Poste</th><th class="l">Joueur</th><th>Âge</th><th>MJ</th><th>Min</th><th>Pts</th><th>Reb</th><th>Pd</th><th>Éval.</th></tr></thead><tbody>' + squad.map(function (x) {
        var conv = o.convoked && o.convoked.indexOf(x.name) >= 0;
        return "<tr><td>" + posBadge(x.position) + '</td><td class="l"><b>' + esc(x.name) + "</b>" + (x.injured ? ' <span class="nc-tag bad">Blessé</span>' : "") + (conv ? ' <span class="nc-tag info">Convoqué</span>' : "") + (x.club ? '<div class="nc-club">' + esc(x.club.name) + "</div>" : "") + "</td><td>" + esc(x.age) + "</td><td>" + esc(x.gp) + "</td><td>" + esc(x.min) + "</td><td>" + esc(x.pts) + "</td><td>" + esc(x.reb) + "</td><td>" + esc(x.ast) + "</td><td>" + esc(x.eff) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<p class="nc-club">Pas encore de groupe de référence.</p>') +
      '<p class="nc-small">' + (o.convoked ? "Liste des convoqués figée : les joueurs convoqués sont signalés." : "Leurs convoqués apparaîtront une fois leur liste figée (3 jours avant le match).") + " Stats publiques de la saison en club, jamais les caractéristiques.</p></div>";
    var res = function (list) {
      return list.map(function (m) {
        return '<div class="nc-slot"><span class="nc-grow">' + esc(teamLab(m.home)) + " " + esc(m.scoreHome) + " – " + esc(m.scoreAway) + " " + esc(teamLab(m.away)) + ' <span class="nc-club">· ' + esc(m.label || when(m.at)) + "</span></span>" +
          '<button type="button" class="tq-btn" data-nc-match="' + esc(m.id) + '">Feuille</button></div>';
      }).join("");
    };
    h += '<div class="nc-card"><div class="nc-sec"><span class="lp-card-title">Derniers résultats</span></div>' + (o.results.length ? res(o.results) : '<p class="nc-club">Aucun match international joué.</p>') +
      '<div class="nc-sec" style="margin-top:14px"><span class="cal-card-kicker">Confrontations directes</span></div>' + (o.headToHead.length ? res(o.headToHead) : '<p class="nc-club">Aucune confrontation.</p>') +
      (o.honours.length ? '<div class="nc-sec" style="margin-top:14px"><span class="cal-card-kicker">Palmarès</span></div>' + o.honours.map(function (x) { return '<div class="nc-slot"><span class="nc-grow">Saison ' + esc(x.season) + " · " + esc(x.label) + "</span><span class=\"nc-tag ok\">Classement final : " + esc(x.rank) + "e sur " + esc(x.of) + ".</span></div>"; }).join("") : "") + "</div></div>";
    return h;
  }

  // --- Mode Sélection ------------------------------------------------------
  var MODE_KEY = "hm-nat-mode";
  var mine = [];
  // [rubrique, libellé, droit requis]
  var NAV = [
    ["dashboard", "Tableau de bord", "dashboard"],
    ["#", "Joueurs"],
    ["joueurs", "Liste des joueurs", "view"], ["suivis", "Joueurs suivis", "watch"], ["preselection", "Présélection", "preselectView"], ["convocations", "Convoqués", "convocView"],
    ["#", "Sélection"],
    ["tactique", "Tactique", "tacticsView"], ["vestiaire", "Vestiaire", "tacticsView"], ["calendrier", "Calendrier", "calendar"], ["qualifications", "Qualifications", "calendar"], ["competition", "Compétitions", "calendar"],
    ["amicaux", "Matchs amicaux", "friendlies"], ["analyse", "Analyse des adversaires", "analysis"], ["stats", "Statistiques", "stats"],
    ["#", "Suivi"],
    ["notifications", "Notifications", "feed"], ["staff", "Staff", "staffView"], ["mandat", "Mandat", "mandate"], ["palmares", "Palmarès", "calendar"],
  ];
  function navAllowed(n) { return !n[2] || can(n[2]); }
  var MODE_CSS = [
    "body.nc-mode #sidebar > :not(.sidebar-brand):not(#ncSidebar){display:none!important}",
    "body.nc-mode .topbar-right > :not(#topbarOnline):not(#ncNextMeta):not(#ncOrdersBtn):not(#topbarBackBtn):not(#topbarPlayerNav){display:none!important}",
    "body.nc-mode .topbar-left > :not(#ncTopTitle){display:none!important}",
    "body.nc-mode #mTabbar .tab-btn{display:none!important}",
    "body.nc-mode #selectionsSection .section > .page-title{display:none}",
    "#ncTopTitle{display:flex;align-items:center;gap:10px}#ncTopTitle .nat-flag{width:28px;height:19px;border-radius:3px;object-fit:cover}#ncTopTitle b{font-size:15px;font-weight:700}#ncTopTitle span{display:block;font-size:12px;color:var(--ink-dim)}",
    ".hm-head__nc{display:inline-flex}.hm-head__nc:empty{display:none}",
    ".hm-head__nc-btn{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.hm-head__nc-btn .nat-flag{width:22px;height:15px;border-radius:2px;object-fit:cover}",
    ".nc-badge{min-width:18px;height:18px;border-radius:9px;background:#E2694F;color:#fff;font-size:11px;display:inline-grid;place-items:center;padding:0 5px}",
    "@media(max-width:680px){.hm-head__nc-btn span.nc-lbl{display:none}}",
    "#ncSidebar{display:flex;flex-direction:column;gap:2px;padding:6px 10px 16px}",
    "#ncSidebar .nc-side-head{display:flex;align-items:center;gap:10px;padding:10px 8px 12px;border-bottom:1px solid var(--line);margin-bottom:8px}#ncSidebar .nc-side-head .nat-flag{width:30px;height:20px;border-radius:3px;object-fit:cover}#ncSidebar .nc-side-head b{font-size:15px;font-weight:700}#ncSidebar .nc-side-head .nc-club{font-size:12px}",
    "#ncSidebar .sidebar-section-label{margin:12px 0 4px}",
    ".nc-side-link{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;background:none;border:1px solid transparent;color:var(--ink-dim);font:inherit;font-size:13px;font-weight:600;padding:9px 10px;border-radius:8px;cursor:pointer;white-space:nowrap}",
    ".nc-side-link:hover{color:var(--ink);background:var(--panel-2)}.nc-side-link.on{color:var(--amber);background:rgba(240,162,60,.14);border-color:rgba(240,162,60,.35);font-weight:700}.nc-side-link.hot{color:var(--ink)}",
    ".nc-side-back{margin:14px 8px 0;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);background:var(--panel-2);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}",
    ".nc-dash{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}@media(max-width:900px){.nc-dash{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.nc-dash{grid-template-columns:1fr}}",
    ".nc-kpi .nc-v{margin:10px 0 6px}",
    ".nc-hero{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:4px 0 16px}.nc-hero .nat-flag{width:60px;height:40px;border-radius:5px;object-fit:cover;box-shadow:0 0 0 1px rgba(255,255,255,.15)}.nc-hero h1{margin:2px 0 0;font-size:26px;font-weight:700;line-height:1}",
    ".nc-feed-item{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--line)}.nc-feed-item:first-child{border-top:0}.nc-feed-item b{display:block;font-size:13.5px}.nc-feed-item span{font-size:13px;color:var(--ink-dim)}.nc-feed-item.unread b{color:var(--amber)}",
    ".nc-feed-dot{width:8px;height:8px;border-radius:50%;margin-top:6px;flex-shrink:0;background:var(--line)}.nc-feed-item.unread .nc-feed-dot{background:var(--amber)}",
    "@media(max-width:900px){body.nc-mode .topbar-m-logo{display:none!important}}",
    ".nc-notes{margin-top:18px}.nc-notes-form{display:flex;flex-direction:column;gap:8px;align-items:flex-end;margin-top:4px}.nc-notes-form textarea{width:100%;resize:vertical;min-height:70px;font:inherit;font-size:14px;padding:10px 12px;border-radius:10px}.nc-notes-list{display:flex;flex-direction:column;gap:8px;margin-top:14px}.nc-note{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,.025)}.nc-note-head{display:flex;align-items:center;gap:8px}.nc-note-head .nc-club{flex:1}.nc-note-text{margin:6px 0 0;white-space:pre-wrap;font-size:14px;line-height:1.45}",
    ".nc-chips{display:flex;flex-wrap:wrap;gap:6px}.nc-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:99px;border:1px solid var(--line);font-size:12.5px;font-weight:700}.nc-chip-x{border:0;background:none;color:var(--ink-dim);cursor:pointer;font-size:15px;line-height:1;padding:0 4px}.nc-slot-wrap{border-top:1px solid var(--line);padding:6px 0}.nc-slot-wrap:first-of-type{border-top:0}.nc-assign{padding:2px 0 6px 2px}",
    ".nc-report{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}@media(max-width:900px){.nc-report{grid-template-columns:repeat(2,minmax(0,1fr))}}",
  ].join("\n");
  function ensureModeCss() {
    if (document.getElementById("ncModeCss")) return;
    var s = document.createElement("style"); s.id = "ncModeCss"; s.textContent = MODE_CSS; document.head.appendChild(s);
  }
  function lsGet() { try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; } }
  function lsSet(v) { try { if (v) localStorage.setItem(MODE_KEY, v); else localStorage.removeItem(MODE_KEY); } catch (e) { /* stockage indisponible */ } }
  function myMandate(id) { return mine.filter(function (m) { return m.teamId === id; })[0] || null; }
  // Bouton du tableau de bord du club (à côté de « Analyse de mon équipe ») :
  // seulement avec un mandat ou un rôle de staff en cours.
  function dashButtonHtml() {
    if (!mine.length || ui.mode) return "";
    var m = mine[0];
    return '<button type="button" class="hm-btn hm-btn--ghost hm-head__nc-btn" data-nc-enter="' + esc(m.teamId) + '" title="' + esc((m.role === "coach" ? "Gérer " : "Staff de ") + teamLab(m.teamId)) + '">' + flag(m.country) +
      '<span class="nc-lbl">Mode Sélection</span>' + (m.unread ? '<span class="nc-badge">' + m.unread + "</span>" : "") + "</button>";
  }
  function syncDashButton() {
    var slot = document.getElementById("ncDashSlot");
    if (slot) slot.innerHTML = dashButtonHtml();
  }
  // Barre du haut du Mode Sélection (2026-10-07) : plus de « Retour au mode
  // Club » (il est dans le menu de gauche) ; prochain adversaire et type de
  // match à côté de « Donnez / Modifier vos ordres », même composant que le
  // club (.topbar-meta / .topbar-next-opp).
  function syncModeButton() {
    var old = document.getElementById("ncModeBtn");
    if (old) old.remove();
    syncNextMeta();
    syncOrdersButton();
    syncDashButton();
  }
  function matchKindLabel(m) { return m.label || (m.w ? "Qualification" : "Match international"); }
  function syncNextMeta() {
    var right = document.querySelector(".topbar-right");
    var el = document.getElementById("ncNextMeta");
    var nx = ui.mode && ui.view ? nextMatch() : null;
    if (!nx || !right) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "ncNextMeta"; el.className = "topbar-meta";
      var ob = document.getElementById("ncOrdersBtn");
      right.insertBefore(el, ob || null);
    }
    var me = ui.view.team.id, home = nx.home === me, opp = home ? nx.away : nx.home;
    el.innerHTML = '<span class="topbar-next-opp">' + (home ? "vs " : "@ ") + flag(String(opp).split("-")[0]) + " " + esc(teamLab(opp)) + "</span>" +
      "<span>" + esc(t(matchKindLabel(nx))) + (nx.status === "live" ? " · " + esc(t("en direct")) : " · " + esc(when(nx.at, true))) + "</span>";
    el.title = t("Prochain adversaire") + " : " + teamLab(opp) + " · " + t(matchKindLabel(nx));
  }
  // Recherche de la barre du haut en Mode Sélection : même champ et même
  // rendu que le club (.topbar-search-result), sur les joueurs du vivier
  // accessibles (le scout ne reçoit que les siens) et les sélections.
  function normQ(x) { return String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
  function topSearchHtml(raw) {
    var q = normQ(raw), v = ui.view;
    if (!q || !v) return "";
    var pl = ((v.pool && v.pool.players) || []).filter(function (x) { return normQ(x.name).indexOf(q) >= 0 || normQ(x.club && x.club.name).indexOf(q) >= 0; });
    var h = '<div class="topbar-search-group-label">' + esc(t("Joueurs")) + (pl.length ? " (" + pl.length + ")" : "") + "</div>";
    h += pl.length ? pl.slice(0, 8).map(function (x) {
      return '<button type="button" class="topbar-search-result" data-nc-profile="' + esc(x.club.leagueId + "|" + x.club.idx + "|" + x.p) + '"><span class="tsr-name"> ' + esc(x.name) + '</span><span class="tsr-meta">' + esc((x.position || "") + " · " + ((x.club && x.club.name) || "") + " · " + genOf(x)) + "</span></button>";
    }).join("") + (pl.length > 8 ? '<div class="topbar-search-more">+ ' + (pl.length - 8) + " " + esc(t("autre(s), affinez la recherche")) + "</div>" : "")
      : '<div class="topbar-search-empty">' + esc(t("Aucun joueur ne correspond.")) + "</div>";
    // Managers : même recherche que le mode Club (moteurbasket3.html:topbarManagerSearchHtml).
    if (g("topbarManagerSearchHtml")) h += window.topbarManagerSearchHtml(raw);
    if (window.HM_NATIONAL && window.HM_NATIONAL.searchHtml) h += window.HM_NATIONAL.searchHtml(raw);
    return h;
  }
  function onTopSearch(e) {
    if (!ui.mode || !e.target || e.target.id !== "topbarSearchInput") return;
    e.stopImmediatePropagation();
    var box = document.getElementById("topbarSearchResults");
    if (!box) return;
    var h = topSearchHtml(e.target.value);
    box.innerHTML = h;
    box.classList.toggle("hidden", !h);
    if (h && g("scheduleTopbarWorldSearch")) window.scheduleTopbarWorldSearch(e.target.value);
  }
  function syncModeChrome() {
    syncModeButton();
    var sb = document.getElementById("sidebar");
    if (sb && !document.getElementById("ncSidebar")) { var d = document.createElement("div"); d.id = "ncSidebar"; sb.appendChild(d); }
    var side = document.getElementById("ncSidebar");
    var v = ui.view, m = myMandate(ui.mode) || {};
    var inFinals = isFinalsPeriod();
    var role = (v && v.role) || m.role || "coach";
    var navs = v ? NAV.filter(function (n, i) {
      if (n[0] !== "#") return navAllowed(n);
      for (var j = i + 1; j < NAV.length && NAV[j][0] !== "#"; j++) if (navAllowed(NAV[j])) return true;
      return false;
    }) : [];
    if (side) side.innerHTML = '<div class="nc-side-head">' + flag(m.country) + "<div><b>" + esc(m.teamId ? teamLab(m.teamId) : "") + '</b><div class="nc-club">' + esc(v ? rolesLabel(v) : (m.roles || [role]).map(function (r) { return ROLE_LABEL[r] || r; }).join(" · ")) + "</div></div></div>" + navs.map(function (n) {
      if (n[0] === "#") return '<div class="sidebar-section-label">' + esc(n[1]) + "</div>";
      var badge = n[0] === "notifications" && v && v.unread ? '<span class="nc-badge">' + v.unread + "</span>" :
        n[0] === "convocations" && curGathering() ? '<span class="nc-club">' + curGathering().players.length + "</span>" :
        n[0] === "amicaux" && v && v.friendlies && v.friendlies.received.length ? '<span class="nc-badge">' + v.friendlies.received.length + "</span>" : "";
      return '<button type="button" class="nc-side-link' + (ui.nav === n[0] ? " on" : "") + (n[0] === "competition" && inFinals ? " hot" : "") + '" data-nc-nav="' + n[0] + '"><span>' + esc(navLabel(n)) + (n[0] === "competition" && inFinals ? " · en cours" : "") + "</span>" + badge + "</button>";
    }).join("") + '<button type="button" class="nc-side-back" data-nc-exit="1">' + icon("back") + " Retour au mode Club</button>";
    var left = document.querySelector(".topbar-left");
    if (left && !document.getElementById("ncTopTitle")) { var tt = document.createElement("div"); tt.id = "ncTopTitle"; left.appendChild(tt); }
    var top = document.getElementById("ncTopTitle");
    if (top && v) top.innerHTML = flag(v.team.country) + "<div><b>" + esc(teamLab(v.team.id)) + "</b><span>" + esc(rolesLabel(v)) + (role === "coach" ? "" : " · sélectionneur : " + esc(coachName(v))) + "</span></div>";
  }
  function coachName(v) { var m = v && v.mandate; return m ? (m.pseudo || (m.clubName ? "Manager de " + m.clubName : "Sélectionneur")) : ""; }
  function isFinalsPeriod() {
    var gg = ((ui.view && ui.view.gatherings) || []).filter(function (x) { return x.kind === "final"; })[0];
    return !!(gg && Date.now() >= gg.freezeAt && Date.now() < gg.endAt + DAY);
  }
  function load() {
    var a = api("/api/national/coach?id=" + encodeURIComponent(ui.teamId) + (ui.opp ? "&opp=" + encodeURIComponent(ui.opp) : "")).then(function (d) { setView(d); ui.error = ""; }).catch(function (e) { ui.error = e.message; });
    // Page de la sélection aussi (calendrier, qualifications, phase finale).
    var b = api("/api/national/team?id=" + encodeURIComponent(ui.teamId)).then(function (d) { ui.tv = d; }).catch(function () { /* rubriques sans données */ });
    return Promise.all([a, b]);
  }
  function enterMode(teamId) {
    // Jamais de mode sans sélection (lien vide) : rien à ouvrir.
    if (!teamId || !/^[a-z]{2}-(A|U21)$/.test(String(teamId))) return Promise.resolve();
    ensureCss(); ensureModeCss();
    ui.mode = teamId; ui.teamId = teamId; ui.nav = "dashboard"; ui.tv = null; ui.match = null; ui.view = null; ui.gid = null; ui.tq = null; ui.tqMatch = null; ui.replaceOut = null; ui.opp = null; ui.error = "";
    ui.ana = null; ui.anaSelf = false; ui.anaTeam = null;
    lsSet(teamId);
    document.body.classList.add("nc-mode");
    showModePage();
    if (window.HM_NATIONAL && window.HM_NATIONAL.state) window.HM_NATIONAL.state.coachOpen = teamId;
    paint();
    var p = load().then(paint);
    window.__lastNationalCoach = p;
    // Verrou T − 5 min : bouton de la barre du haut et page Tactique à jour
    // sans recharger (comme la pastille de verrou des Ordres du club).
    if (!ui.lockTimer) ui.lockTimer = setInterval(function () {
      if (!ui.mode || !ui.view) return;
      syncOrdersButton();
      if (ui.nav !== "tactique" || !document.getElementById("ncOrdres")) return;
      var e = tqEntry(ui.view, tqKey(ui.view));
      if (!!document.querySelector("#ncOrdres .ordres-lock-note") !== tqLocked(e)) paint();
    }, 30000);
    return p;
  }
  function exitMode(quiet) {
    ui.mode = null; ui.teamId = null; ui.view = null; ui.tq = null;
    if (ui.lockTimer) { clearInterval(ui.lockTimer); ui.lockTimer = null; }
    lsSet(null);
    document.body.classList.remove("nc-mode");
    ["ncSidebar", "ncTopTitle"].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
    if (window.HM_NATIONAL && window.HM_NATIONAL.state) window.HM_NATIONAL.state.coachOpen = null;
    syncModeButton();
    // `quiet` : sortie par le bouton Retour (historique), la page à
    // réafficher est choisie par la navigation, pas le tableau de bord.
    var h = !quiet && typeof TAB_HANDLERS !== "undefined" && TAB_HANDLERS.club;
    if (typeof h === "function") h();
    setTimeout(syncDashButton, 0);
  }
  // Libellés selon le rôle : un scout (sans autre rôle) ne voit que ses
  // joueurs attribués.
  function navLabel(n) {
    if (n[0] === "joueurs" && can("assigned")) return "Mes joueurs attribués";
    return n[1];
  }
  function firstNav() { var n = NAV.filter(function (x) { return x[0] !== "#" && navAllowed(x); })[0]; return n ? n[0] : "dashboard"; }
  function titleHtml(nav) {
    var cur = NAV.filter(function (n) { return n[0] === nav; })[0];
    var lab = cur ? navLabel(cur) : "";
    return '<h2 class="page-title">' + esc(lab) + "</h2>";
  }
  function modeHtml() {
    var v = ui.view;
    if (!v) return '<p class="training-empty">' + (ui.error ? esc(ui.error) : "Chargement de votre sélection…") + "</p>";
    var nav = ui.nav || "dashboard";
    var cur = NAV.filter(function (n) { return n[0] === nav; })[0];
    if (!cur || !navAllowed(cur)) nav = ui.nav = firstNav();
    var err = ui.error ? '<p class="nc-err">' + esc(ui.error) + "</p>" : "";
    var poolMissing = '<div class="nc-card"><p class="nc-club">Vivier en cours de préparation (calculé au prochain passage du monde, quelques minutes au plus).</p></div>';
    if (nav === "joueurs") return titleHtml(nav) + err + (v.pool ? joueursHtml(v) : poolMissing);
    if (nav === "preselection") return titleHtml(nav) + err + (v.pool ? preselectionHtml(v) : poolMissing);
    if (nav === "suivis") return titleHtml(nav) + err + (v.pool ? suivisHtml(v) : poolMissing);
    if (nav === "convocations") return titleHtml(nav) + err + convocationsHtml(v);
    if (nav === "tactique") return err + tactiqueHtml(v);
    if (nav === "vestiaire") return titleHtml(nav) + err + '<div id="ncVestiaire"><p class="vs-empty">Chargement du vestiaire…</p></div>';
    if (nav === "amicaux") return titleHtml(nav) + err + amicauxHtml(v);
    if (nav === "staff") return titleHtml(nav) + err + staffHtml(v);
    if (nav === "analyse") return titleHtml(nav) + err + analyseHtml(v);
    if (nav === "calendrier" || nav === "qualifications" || nav === "competition" || nav === "palmares") {
      if (!ui.tv) return titleHtml(nav) + '<p class="training-empty">Chargement…</p>';
      return titleHtml(nav) + window.HM_NATIONAL.sectionHtml(ui.tv, nav === "competition" ? "finale" : nav);
    }
    if (nav === "stats") return titleHtml(nav) + statsHtml(v);
    if (nav === "notifications") return titleHtml(nav) + '<div class="nc-card">' + feedHtml(v, 40) + "</div>";
    if (nav === "mandat") return titleHtml(nav) + mandatHtml(v);
    return err + dashboardHtml(v);
  }
  function nextMatch() {
    var tv = ui.tv, now = Date.now();
    var ms = [];
    if (tv && tv.qualif) tv.qualif.matches.forEach(function (m) { ms.push(m); });
    if (tv && tv.finals) tv.finals.tournaments.forEach(function (tt) { tt.matches.forEach(function (m) { if (m.home === tv.team.id || m.away === tv.team.id) ms.push(Object.assign({ label: tt.label }, m)); }); });
    if (tv && tv.friendlies) tv.friendlies.forEach(function (f) { if (f.status === "accepted" || f.status === "live") ms.push({ id: f.id, at: f.at, home: f.home, away: f.away, status: f.status === "live" ? "live" : "scheduled", label: "Match amical" }); });
    // Match en direct (status « live » : score caché jusqu'à la fin de la
    // diffusion) : toujours le prochain match tant qu'il se joue.
    return ms.filter(function (m) { return (m.status === "scheduled" || m.status === "live") && m.at > now - 3 * 3600 * 1000; }).sort(function (a, b) { return a.at - b.at; })[0] || null;
  }
  function dashboardHtml(v) {
    var tv = ui.tv, nx = nextMatch(), cur = curGathering(), r = v.report || {};
    var last = (tv && tv.results || [])[0];
    var oppOf = function (m) { return m.home === v.team.id ? m.away : m.home; };
    var rank = tv && tv.qualif && tv.qualif.group ? (tv.qualif.group.standings.filter(function (s) { return s.teamId === v.team.id; })[0] || {}).rank : null;
    var seasonNo = v.mandate ? Math.min(2, Math.max(1, v.season - v.mandate.fromSeason + 1)) : 1;
    var kpi = function (k, val, sub, nav) { return '<button type="button" class="nc-card nc-kpi" style="text-align:left;cursor:pointer;color:inherit;font:inherit" data-nc-nav="' + nav + '"><div class="cal-card-kicker">' + k + '</div><div class="nc-v eff-kpi-num">' + val + '</div><div class="eff-kpi-label">' + sub + "</div></button>"; };
    var h = '<div class="nc-hero">' + flag(v.team.country) + '<div><div class="nc-club">' + esc(rolesLabel(v)) + (v.role === "coach" ? " · " + esc(coachName(v)) : " · sélectionneur : " + esc(coachName(v))) + "</div><h1>" + esc(teamLab(v.team.id)) + "</h1></div></div>";
    h += '<div class="nc-dash">';
    h += kpi("Prochain match", nx ? flag(oppOf(nx).split("-")[0]) + " " + esc(teamLab(oppOf(nx))) : "–", nx ? esc(nx.label || (nx.w ? "Qualifications" + (tv && tv.qualif && tv.qualif.group ? " · " + tv.qualif.group.label : "") : "")) + " · " + esc(when(nx.at, true)) : "Aucun match programmé", can("analysis") ? "analyse" : "calendrier");
    if (can("calendar")) h += kpi("Qualifications", rank ? rank + (rank === 1 ? "er" : "e") + " du groupe" : "–", tv && tv.qualif && tv.qualif.group ? esc(tv.qualif.group.label) + " · " + esc(tv.qualif.group.continent) : "Groupes à venir", "qualifications");
    if (can("convocView")) h += kpi("Convoqués", (cur ? cur.players.length : 0) + " / " + v.limits.convocation, cur ? esc(gTitleText(cur)) + (cur.frozen ? " · liste figée" : " · liste ouverte jusqu'au " + esc(when(cur.freezeAt))) : "Aucun rassemblement à venir", "convocations");
    if (can("watch")) h += kpi("Joueurs suivis", (v.followed || []).length, can("preselectView") ? v.preselection.length + " en présélection" : can("assigned") ? "Vos joueurs" : "Liste des joueurs", "suivis");
    if (can("mandate")) h += kpi("Mandat", "Saison " + seasonNo + " / 2", "Saisons " + esc(v.mandate.fromSeason) + " à " + esc(v.mandate.toSeason) + (r.played ? " · " + r.wins + " V – " + r.losses + " D" : ""), "mandat");
    if (can("friendlies") && v.friendlies) h += kpi("Matchs amicaux", v.friendlies.scheduled.length + " programmé" + (v.friendlies.scheduled.length > 1 ? "s" : ""), v.friendlies.received.length ? v.friendlies.received.length + " demande" + (v.friendlies.received.length > 1 ? "s" : "") + " à traiter" : "", "amicaux");
    h += kpi("Dernier résultat", last ? esc(teamLab(last.home)) + " " + esc(last.scoreHome) + " – " + esc(last.scoreAway) + " " + esc(teamLab(last.away)) : "–", last ? esc(when(last.at)) : "Aucun match joué", "calendrier");
    h += "</div>";
    // Prochain match en direct ou imminent : bouton du direct (écran des clubs).
    var nxLive = nx ? liveBtn(nx) : "";
    if (nxLive) h += '<div class="nc-card" style="margin-top:16px"><div class="nc-sec"><span class="lp-card-title">' + (nx.status === "live" ? "Match en cours" : "Coup d'envoi imminent") + "</span></div>" +
      '<div class="nc-slot"><span class="nc-grow">' + flag(nx.home.split("-")[0]) + " " + esc(teamLab(nx.home)) + " – " + flag(nx.away.split("-")[0]) + " " + esc(teamLab(nx.away)) + ' <span class="nc-club">· ' + esc(when(nx.at, true)) + "</span></span>" + nxLive + "</div></div>";
    h += showcaseHtml();
    h += '<div class="nc-two" style="margin-top:16px">';
    if (can("feed")) h += '<div class="nc-card"><div class="nc-sec"><span class="lp-card-title">Notifications</span><button type="button" class="tq-btn" data-nc-nav="notifications">Tout voir</button></div>' + feedHtml(v, 5) + "</div>";
    if (can("convocView")) h += '<div class="nc-card"><div class="nc-sec"><span class="lp-card-title">Convoqués · ' + esc(cur ? gTitleText(cur) : "") + '</span><span class="nc-club">' + (cur ? cur.players.length : 0) + " / " + v.limits.convocation + "</span></div>" +
      (cur && cur.players.length ? cur.players.slice(0, 15).map(function (c) { return '<div class="nc-slot"><span class="nc-grow">' + profileBtn(poolByKey()[key(c.ref)] || null, c.ref.n) + "</span>" + statusTag(c.status) + "</div>"; }).join("") : '<p class="nc-club">Aucun joueur convoqué pour l\'instant.</p>') + "</div>";
    return h + "</div>";
  }
  // Vitrine publique (2026-10-07) : aperçu de la page publique, message du
  // staff (sélectionneur et adjoints) et personnalisation (sélectionneur),
  // éditeurs partagés avec la page publique (HM_NATIONAL.showcase).
  function showcaseHtml() {
    var S = window.HM_NATIONAL && window.HM_NATIONAL.showcase, tv = ui.tv;
    if (!S || !tv || !tv.extras) return "";
    var x = tv.extras;
    if (!x.canEditMessage && !x.canEditVisuals && !x.message) return "";
    return '<div class="nc-card" id="ncShowcase" style="margin-top:16px"><div class="nc-sec"><span class="lp-card-title">Vitrine publique</span><span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' +
      (x.canEditVisuals ? '<button type="button" class="tq-btn" data-nt-visuals>Personnaliser</button> ' : "") +
      '<button type="button" class="tq-btn" data-nc-public>Voir la page publique</button></span></div>' +
      S.previewHtml(tv) + S.messageHtml(tv, onShowcaseUpdate) +
      (x.canEditVisuals ? "" : '<p class="nc-small">Seul le sélectionneur peut personnaliser le logo, la bannière, le maillot et le terrain.</p>') + "</div>";
  }
  function onShowcaseUpdate(tv, err) {
    if (tv) ui.tv = tv;
    if (err) ui.error = err;
    if (ui.mode && (ui.nav || "dashboard") === "dashboard") paint();
  }
  function onShowcaseClick(b) {
    var S = window.HM_NATIONAL && window.HM_NATIONAL.showcase, d = b.dataset;
    if (!S || !ui.tv) return false;
    if (d.ntVisuals !== undefined) { S.openVisuals(ui.tv, onShowcaseUpdate); return true; }
    if (d.ntMsgEdit !== undefined) { S.edit(); paint(); var ta = document.getElementById("ntMsgInput"); if (ta) ta.focus(); return true; }
    if (d.ntMsgCancel !== undefined) { S.cancel(); paint(); return true; }
    if (d.ntMsgSave !== undefined) { var inp = document.getElementById("ntMsgInput"); window.__lastNational = S.save(inp ? inp.value.trim() : ""); return true; }
    if (d.ntMsgDelete !== undefined) { if (window.confirm(t("Supprimer le message de la sélection ?"))) window.__lastNational = S.save(""); return true; }
    if (d.ncPublic !== undefined) {
      // Page publique : on quitte le mode (sans passer par le tableau de bord du club).
      var id = ui.teamId;
      exitMode(true);
      if (window.HM_NATIONAL && window.HM_NATIONAL.openTeam) window.__lastNational = window.HM_NATIONAL.openTeam(id);
      return true;
    }
    return false;
  }
  function feedHtml(v, n) {
    var list = (v.feed || []).slice(0, n);
    if (!list.length) return '<p class="nc-club">Aucune notification pour l\'instant.</p>';
    var seen = v.feedSeen != null ? v.feedSeen : (v.feed[0] ? v.feed[0].id - v.unread : 0);
    return list.map(function (e) {
      return '<div class="nc-feed-item' + (e.id > seen ? " unread" : "") + '"><i class="nc-feed-dot"></i><div><b>' + esc(e.title) + "</b><span>" + esc(e.text || "") + " · " + esc(when(e.at, true)) + "</span>" +
        (e.matchId ? ' <button type="button" class="nt-link" data-nc-match="' + esc(e.matchId) + '">Feuille de match</button>' : "") + "</div></div>";
    }).join("");
  }
  function statsHtml(v) {
    var s = v.stats || [];
    if (!s.length) return '<p class="training-empty">Aucun match joué sous votre mandat.</p>';
    var r1 = function (x, gp) { return (Math.round((x / gp) * 10) / 10).toString(); };
    return '<div class="nc-card nc-scroll"><table class="nc-table"><thead><tr><th class="l">Joueur</th><th>Club</th><th>MJ</th><th>Min</th><th>Pts</th><th>Reb</th><th>Pd</th><th>Int</th><th>Ctr</th></tr></thead><tbody>' +
      s.map(function (x) { return '<tr><td class="l"><b>' + esc(x.name) + '</b></td><td class="nc-club">' + esc(x.club || "") + "</td><td>" + x.gp + "</td><td>" + r1(x.min, x.gp) + "</td><td>" + r1(x.pts, x.gp) + "</td><td>" + r1(x.reb, x.gp) + "</td><td>" + r1(x.ast, x.gp) + "</td><td>" + r1(x.stl, x.gp) + "</td><td>" + r1(x.blk, x.gp) + "</td></tr>"; }).join("") +
      '</tbody></table></div><p class="nc-small">Moyennes par match en sélection, sous votre mandat.</p>';
  }
  function reportHtml(r, live) {
    var k = function (tt, v, s) { return '<div class="nc-card nc-kpi"><div class="cal-card-kicker">' + tt + '</div><div class="nc-v eff-kpi-num">' + v + '</div><div class="eff-kpi-label">' + (s || "") + "</div></div>"; };
    var h = '<div class="nc-card" style="margin-bottom:12px"><b>' + (live ? "Bilan en cours" : "Bilan du mandat") + " · " + esc(r.label) + " · " + esc(r.coach) + '</b><div class="nc-club">Saisons ' + esc(r.fromSeason) + " à " + esc(r.toSeason) + " (" + r.seasons + " saison" + (r.seasons > 1 ? "s" : "") + ")</div></div>";
    h += '<div class="nc-report">' + k("Matchs", r.played, r.played ? r.wins + (r.wins > 1 ? " victoires, " : " victoire, ") + r.losses + (r.losses > 1 ? " défaites" : " défaite") : "") + k("Victoires", r.winPct != null ? r.winPct + " %" : "–", r.played ? "Points : " + r.pf + " pour, " + r.pa + " contre" : "") +
      k("Joueurs utilisés", r.playersUsed, "") + k("Nouveaux internationaux", r.newInternationals, (r.newNames || []).slice(0, 6).map(esc).join(", ")) + "</div>";
    h += '<div class="nc-card" style="margin-top:12px"><div class="nc-sec"><span class="lp-card-title">Compétitions</span></div>' + (r.seasonsDetail || []).map(function (s) {
      var comp = s.comp === "continental" ? "Compétition continentale" : s.comp === "world" ? "Coupe du monde" : "Compétition";
      return '<div class="nc-slot"><span class="nc-grow">Saison ' + esc(s.season) + " · " + comp + "</span>" +
        (s.comp === "continental" && s.qualified != null ? '<span class="nc-tag ' + (s.qualified ? "ok" : "bad") + '">Qualification : ' + (s.qualified ? "oui" : "non") + "</span>" : "") +
        (s.tournament && s.tournament.rank ? '<span class="nc-tag ok">' + esc(s.tournament.label) + " : " + esc(s.tournament.stage) + "</span>" : s.tournament ? '<span class="nc-tag ok">' + esc(s.tournament.label) + " en cours</span>" : '<span class="nc-club">à venir</span>') + "</div>";
    }).join("") + (r.bestFinish ? '<p class="nc-small">Meilleur résultat : ' + esc(r.bestFinish) + "</p>" : "") + "</div>";
    if (r.results && r.results.length) h += '<div class="nc-card" style="margin-top:12px"><div class="nc-sec"><span class="lp-card-title">Principaux résultats</span></div>' + r.results.map(function (m) {
      return '<div class="nc-slot"><span class="nc-grow">' + esc(teamLab(m.home)) + " " + esc(m.scoreHome) + " – " + esc(m.scoreAway) + " " + esc(teamLab(m.away)) + ' <span class="nc-club">· ' + esc(m.label || "") + "</span></span>" + '<button type="button" class="nt-link" data-nc-match="' + esc(m.id) + '">Feuille</button></div>';
    }).join("") + "</div>";
    return h;
  }
  function mandatHtml(v) {
    var h = reportHtml(v.report || {}, true);
    (v.pastMandates || []).forEach(function (r) { h += '<div style="margin-top:22px">' + reportHtml(r, false) + "</div>"; });
    return h + '<p class="nc-small">À la fin du mandat, ce bilan est conservé dans l\'historique des sélectionneurs et affiché aux électeurs lors des élections suivantes.</p>';
  }
  // Page du mode : réaffichée dès qu'on revient d'une autre page (fiche
  // joueur, fiche club…), sinon le menu latéral redessinait une section
  // masquée (retour utilisateur 2026-10-06 : menu inutilisable depuis une
  // fiche joueur). Même navigation que le reste du jeu (showPage).
  function showModePage() {
    var sec = document.getElementById("selectionsSection");
    if (sec && !sec.classList.contains("hidden") && sec.style.display !== "none") return;
    try { window.showPage("selectionsSection"); window.setActiveTab(""); } catch (e) { /* page sans navigation */ }
  }
  function paint() {
    var holder = document.getElementById("nationalContent");
    if (!holder || !ui.mode) return;
    holder.innerHTML = modeHtml();
    if (ui.nav === "tactique") tqMount();
    if (ui.nav === "vestiaire") vestiaireMount();
    syncModeChrome();
    // Rapport Scouting Pro : placement adaptatif des blocs (comme le club).
    var sp = document.getElementById("ncScoutingPanel");
    if (sp && g("sp2WatchMasonry")) { try { window.sp2WatchMasonry(sp); } catch (e) { /* mise en page par défaut */ } }
    // Chaque page du mode est une étape de l'historique (bouton Retour du
    // jeu et du navigateur, voir hmNavCurrent) : avant (retour utilisateur
    // 2026-10-07), « Retour » depuis « Mes joueurs attribués » sautait
    // directement à la dernière page du CLUB visitée avant le mode.
    if (g("hmNavSchedule")) { try { window.hmNavSchedule(); } catch (e) { /* rien */ } }
  }
  // Étape d'historique de la page du mode affichée (null hors du mode).
  function navKey() { return ui.mode ? ui.mode + "|" + ui.nav : null; }
  // Retour/Avancer : réaffiche la page du mode enregistrée.
  function restoreNav(key) {
    var i = String(key || "").lastIndexOf("|");
    if (i <= 0) return;
    var team = key.slice(0, i), nav = key.slice(i + 1);
    if (ui.mode !== team) enterMode(team);
    ui.nav = nav; ui.replaceOut = null; ui.error = "";
    showModePage(); paint();
  }
  function openModeMatch(id) {
    // Feuille de statistiques des matchs de club (fenêtre par-dessus la page,
    // voir HM_NATIONAL.openMatch) ; match encore en direct : le direct.
    window.__lastNcMatch = window.HM_NATIONAL.openMatch(id);
    return window.__lastNcMatch;
  }

  // --- Actions ------------------------------------------------------------------
  function post(path, body, okMsg) {
    if (ui.busy) return Promise.resolve();
    ui.busy = true;
    body.teamId = body.teamId || ui.teamId;
    if (ui.opp) body.opp = ui.opp;
    var p = api(path, body).then(function (d) { if (d.team) setView(d); ui.error = ""; if (okMsg) toast(okMsg); }).catch(function (e) { ui.error = e.message; }).then(function () { ui.busy = false; paint(); });
    window.__lastNationalCoach = p;
    return p;
  }
  // Fiche joueur (retour utilisateur 2026-10-06) : sous la note, « Ajouter à
  // la présélection » et « Ajouter aux joueurs suivis » pour un joueur
  // sélectionnable de la sélection en cours. Même route que les icônes des
  // tableaux (/api/national/coach/list).
  function pdpActionsHtml(player) {
    if (!ui.mode || !ui.view || !player || player.id == null) return "";
    var r = { p: Number(player.id), n: player.name };
    if (!poolByKey()[key(r)]) return "";
    var v = ui.view, lim = v.limits || {}, out = "";
    var btn = function (list, on, label, full) {
      return '<button type="button" class="pdp2-btn' + (on ? "" : " pdp2-btn--accent") + '" data-nc-pdp-list="' + list + '" data-nc-on="' + (on ? 0 : 1) + '" data-nc-p="' + esc(r.p) + '" data-nc-n="' + esc(r.n) + '"' +
        (!on && full ? ' disabled title="Liste complète"' : "") + ">" + esc(label) + "</button>";
    };
    if (can("preselect")) {
      var p = inList(v.preselection, r);
      out += btn("preselection", p, p ? "Retirer de la présélection" : "Ajouter à la présélection", (v.preselection || []).length >= (lim.preselection || Infinity));
    }
    // Qui peut attribuer (sélectionneur, adjoints, recruteurs) : « Attribuer
    // à un scout » à la place de Suivre / Ne plus suivre (demande
    // utilisateur du 2026-10-07) ; l'attribution présélectionne le joueur.
    if (can("assign")) {
      var scouts = (v.staff || []).filter(function (s) { return s.role === "scout" && s.status === "active"; });
      var owner = scouts.filter(function (s) { return inList((v.assign || {})[s.mid] || [], r); })[0];
      var attrs = ' data-nc-p="' + esc(r.p) + '" data-nc-n="' + esc(r.n) + '"';
      if (owner) {
        out += '<div class="nc-small" style="text-align:center">Attribué à <b>' + esc(owner.pseudo || owner.clubName) + "</b></div>" +
          '<button type="button" class="pdp2-btn" data-nc-pdp-assign="' + esc(owner.mid) + '" data-nc-on="0"' + attrs + ">Retirer l'attribution</button>";
      } else if (!scouts.length) {
        out += '<button type="button" class="pdp2-btn pdp2-btn--accent" disabled title="Aucun scout en poste : nommez-en un dans Staff">Attribuer à un scout</button>';
      } else {
        out += (scouts.length > 1 ? '<select class="nc-in" data-nc-pdp-scout="1" style="width:100%">' + scouts.map(function (s) {
          var n = ((v.assign || {})[s.mid] || []).length;
          return '<option value="' + esc(s.mid) + '"' + (n >= (v.assignMax || 50) ? " disabled" : "") + ">" + esc((s.pseudo || s.clubName) + " · " + n + " / " + (v.assignMax || 50)) + "</option>";
        }).join("") + "</select>" : "") +
          '<button type="button" class="pdp2-btn pdp2-btn--accent" data-nc-pdp-assign="' + esc(scouts[0].mid) + '" data-nc-on="1"' + attrs + ">Attribuer à un scout" + (scouts.length === 1 ? " (" + esc(scouts[0].pseudo || scouts[0].clubName) + ")" : "") + "</button>";
      }
    }
    // Plus de bouton Suivre sur la fiche (personnes aidantes et scouts
    // compris, demande utilisateur du 2026-10-07).
    return out ? '<div class="pdp2-actions nc-pdp-acts" style="flex-direction:column;margin-top:10px">' + out + "</div>" : "";
  }
  function onPdpListClick(b) {
    var d = b.dataset, box = b.closest(".nc-pdp-acts");
    if (ui.busy) return;
    ui.busy = true;
    b.disabled = true;
    var player = { id: Number(d.ncP), name: d.ncN };
    var p = api("/api/national/coach/list", { teamId: ui.teamId, list: d.ncPdpList, on: d.ncOn === "1", player: { p: player.id, n: player.name } })
      .then(function (data) {
        if (data.team) setView(data);
        toast(d.ncPdpList === "preselection" ? (d.ncOn === "1" ? "Ajouté à la présélection." : "Retiré de la présélection.") : (d.ncOn === "1" ? "Ajouté aux joueurs suivis." : "Retiré des joueurs suivis."));
      })
      .catch(function (e) { toast(e.message); })
      .then(function () {
        ui.busy = false;
        if (box && box.isConnected) { var tmp = document.createElement("div"); tmp.innerHTML = pdpActionsHtml(player); box.replaceWith(tmp.firstChild || document.createTextNode("")); }
      });
    window.__lastNationalCoach = p;
    return p;
  }
  // --- Notes sur un joueur (bas de la fiche, demande du 2026-10-07) ---------
  // Visibles du seul staff de la sélection ; jamais sur un joueur de son
  // propre club (le serveur ne les envoie pas non plus, voir notesFor).
  function ownClubPlayer(x) {
    try { return !!(x && x.club && typeof league !== "undefined" && league && x.club.leagueId === league.leagueId && x.club.idx === myTeamIndex); } catch (e) { return false; }
  }
  function pdpNotesHtml(player) {
    if (!ui.mode || !ui.view || !player || player.id == null || !can("notes")) return "";
    var r = { p: Number(player.id), n: player.name }, x = poolByKey()[key(r)];
    if (!x || ownClubPlayer(x)) return "";
    var v = ui.view, list = ((v.notes || {})[key(r)] || []).slice().sort(function (a, b) { return b.at - a.at; });
    var canMod = hasRole(v, "coach", "assistant");
    var h = '<section class="pdp2-card nc-notes" data-nc-notes="' + esc(r.p + "|" + r.n) + '"><div class="pdp2-head"><h3>Notes de la sélection</h3><span class="pdp2-meta">' + esc(teamLab(v.team.id)) + " · visibles du staff seulement</span></div>";
    h += '<div class="nc-notes-form"><textarea class="nc-in" data-nc-note-text="1" maxlength="600" rows="3" placeholder="Votre commentaire sur ce joueur (niveau, comportement, disponibilité…)"></textarea>' +
      '<button type="button" class="pdp2-btn pdp2-btn--accent" data-nc-note-add="1" data-nc-p="' + esc(r.p) + '" data-nc-n="' + esc(r.n) + '">Ajouter la note</button></div>';
    h += list.length ? '<div class="nc-notes-list">' + list.map(function (n) {
      return '<div class="nc-note"><div class="nc-note-head"><b>' + esc(n.byName || "") + '</b><span class="nc-club">' + esc(ROLE_LABEL[n.role] || "") + " · " + esc(when(n.at, true)) + "</span>" +
        (n.mine || canMod ? '<button type="button" class="nc-chip-x" data-nc-note-del="' + esc(n.id) + '" data-nc-p="' + esc(r.p) + '" data-nc-n="' + esc(r.n) + '" title="Supprimer" aria-label="Supprimer">×</button>' : "") + "</div>" +
        '<p class="nc-note-text">' + esc(n.text) + "</p></div>";
    }).join("") + "</div>" : '<p class="nc-club" style="margin:8px 0 0">Aucune note pour l\'instant.</p>';
    return h + "</section>";
  }
  function onNoteClick(b) {
    var d = b.dataset, box = b.closest(".nc-notes");
    if (ui.busy || !box) return;
    var body = { teamId: ui.teamId, player: { p: Number(d.ncP), n: d.ncN } };
    if (d.ncNoteDel) body.remove = Number(d.ncNoteDel);
    else {
      var ta = box.querySelector("[data-nc-note-text]");
      body.text = ta ? ta.value : "";
      if (!body.text.trim()) { if (ta) ta.focus(); return; }
    }
    ui.busy = true; b.disabled = true;
    var player = { id: Number(d.ncP), name: d.ncN };
    var p = api("/api/national/coach/note", body)
      .then(function (data) { if (data.team) setView(data); toast(d.ncNoteDel ? "Note supprimée." : "Note ajoutée."); })
      .catch(function (e) { toast(e.message); })
      .then(function () {
        ui.busy = false;
        if (box.isConnected) { var tmp = document.createElement("div"); tmp.innerHTML = pdpNotesHtml(player); box.replaceWith(tmp.firstChild || document.createTextNode("")); }
      });
    window.__lastNationalCoach = p;
    return p;
  }
  function onPdpAssignClick(b) {
    var d = b.dataset, box = b.closest(".nc-pdp-acts");
    if (ui.busy) return;
    var sel = box && box.querySelector("[data-nc-pdp-scout]");
    var mid = d.ncOn === "1" && sel ? sel.value : d.ncPdpAssign;
    ui.busy = true;
    b.disabled = true;
    var player = { id: Number(d.ncP), name: d.ncN };
    var p = api("/api/national/coach/staff/assign", { teamId: ui.teamId, mid: mid, on: d.ncOn === "1", player: { p: player.id, n: player.name } })
      .then(function (data) {
        if (data.team) setView(data);
        toast(d.ncOn === "1" ? "Joueur attribué et présélectionné." : "Attribution retirée.");
      })
      .catch(function (e) { toast(e.message); })
      .then(function () {
        ui.busy = false;
        if (box && box.isConnected) { var tmp = document.createElement("div"); tmp.innerHTML = pdpActionsHtml(player); box.replaceWith(tmp.firstChild || document.createTextNode("")); }
      });
    window.__lastNationalCoach = p;
    return p;
  }
  function setConv(r, on) {
    var cur = curGathering();
    if (!cur) return;
    var list = convRefs(cur).filter(function (x) { return !(x.p === r.p && x.n === r.n); });
    if (on) list.push(r);
    post("/api/national/coach/convocation", { gatheringId: cur.gid, players: list }, on ? "Joueur convoqué." : "Joueur retiré des convoqués.");
  }
  function onClick(e) {
    if (!ui.mode) return;
    var b = e.target.closest ? e.target.closest("button,input[type=checkbox],th[data-nc-sort],[data-nc-profile]") : null;
    if (!b) return;
    var d = b.dataset;
    if (b.closest && b.closest("#ncShowcase") && onShowcaseClick(b)) return;
    if (d.ncSort) {
      var c = columns().filter(function (x) { return x.key === d.ncSort; })[0];
      ui.sort = ui.sort.key === d.ncSort ? { key: d.ncSort, dir: -ui.sort.dir } : { key: d.ncSort, dir: (c && c.dir) || -1 };
      paint(); return;
    }
    if (d.ncPos !== undefined) { ui.pos = d.ncPos; ui.shown = 50; paint(); return; }
    if (d.ncMore) { ui.shown += 50; paint(); return; }
    if (d.ncFilter) { ui.filter = ui.filter === d.ncFilter ? "" : d.ncFilter; paint(); return; }
    if (d.ncGid) { ui.gid = d.ncGid; ui.replaceOut = null; paint(); return; }
    if (d.ncGidGo) { ui.gid = d.ncGidGo; ui.nav = "convocations"; paint(); return; }
    if (d.ncProfile) {
      var q = d.ncProfile.split("|"), lg = null;
      try { lg = typeof league !== "undefined" ? league : null; } catch (err) { lg = null; }
      if (lg && lg.leagueId === q[0] && g("showPlayerDetail")) window.showPlayerDetail(Number(q[1]), Number(q[2]));
      else if (g("showForeignPlayerDetail")) window.showForeignPlayerDetail(q[0], Number(q[1]), Number(q[2]));
      return;
    }
    if (d.ncList) { post("/api/national/coach/list", { list: d.ncList, on: d.ncOn === "1", player: { p: Number(d.ncP), n: d.ncN } }); return; }
    if (d.ncConv !== undefined && d.ncP) { setConv({ p: Number(d.ncP), n: d.ncN }, d.ncConv === "1"); return; }
    if (d.ncReplace) { ui.replaceOut = d.ncReplace; paint(); return; }
    if (d.ncReplaceCancel) { ui.replaceOut = null; paint(); return; }
    if (d.ncReplaceGo) {
      var s = document.getElementById("ncReplaceIn"), cur = curGathering();
      if (!s || !s.value || !cur) return;
      var outK = ui.replaceOut.split("|"), inK = s.value.split("|");
      ui.replaceOut = null;
      post("/api/national/coach/replace", { gatheringId: cur.gid, out: { p: Number(outK[0]), n: outK.slice(1).join("|") }, in: { p: Number(inK[0]), n: inK.slice(1).join("|") } }, "Remplacement enregistré, le club du joueur est prévenu.");
      return;
    }
    // Tactique (ordres du match affiché).
    if (d.ncJump) {
      var target = document.querySelector("#ncOrdres .area-" + d.ncJump);
      Array.prototype.forEach.call(document.querySelectorAll("#ncOrdres [data-nc-jump]"), function (x) { x.classList.toggle("active", x === b); });
      if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (d.ncTqSave) { tqSave(); return; }
    if (d.ncTqRevert) { ui.tq = null; paint(); return; }
    // « Appliquer à ma tactique » (équivalent de « Appliquer à mes ordres »
    // du club) : le Plan de match (scoutingGamePlanPatch, recalculé au clic)
    // prérempli dans les ordres du PROCHAIN match non verrouillé (sinon la
    // tactique par défaut), puis la Tactique ouverte sur ce match : rien
    // n'est enregistré avant « Enregistrer ».
    if (d.ncApplyPlan) {
      var fb = document.getElementById("scoutingApplyOrdresFeedback");
      var nx = tqUpcoming(ui.view).filter(function (x) { return !tqLocked(x); })[0] || null;
      var tk = nx ? String(nx.id) : TQ_DEFAULT;
      var base = (nx && ui.view.plans && ui.view.plans[nx.id]) || ui.view.tactics;
      var plan = ui.anaTeam && base && g("scoutingGamePlanPatch") ? window.scoutingGamePlanPatch(ui.anaTeam, base) : null;
      if (!plan) { if (fb) fb.textContent = t("Pas encore assez de données sur cet adversaire pour préremplir votre tactique."); return; }
      if (ui.tq && ui.tq.dirty && !window.confirm(t("Abandonner les modifications non enregistrées ?"))) return;
      ui.tqMatch = tk;
      var tq = tqBuild(ui.view, tk);
      Object.keys(plan.patch).forEach(function (k) { tq.proxy[k] = Array.isArray(plan.patch[k]) ? JSON.parse(JSON.stringify(plan.patch[k])) : plan.patch[k]; });
      tq.dirty = JSON.stringify(tqSnap(tq.proxy)) !== tq.saved;
      tq.feedback = "Plan de match prérempli : vérifiez puis enregistrez.";
      ui.nav = "tactique"; ui.error = "";
      showModePage(); paint();
      try { var sc2 = document.querySelector(".content-scroll"); if (sc2) sc2.scrollTop = 0; } catch (err) { /* rien */ }
      return;
    }
    // Amicaux.
    if (d.ncFrSend) {
      post("/api/national/coach/friendly/request", { opponent: ui.frOpp, at: Number(ui.frAt), venue: ui.frVenue }, "Demande de match amical envoyée.").then(function () { if (!ui.error) { ui.frOpp = ""; ui.frAt = ""; } paint(); });
      return;
    }
    if (d.ncFrAccept || d.ncFrRefuse) { post("/api/national/coach/friendly/respond", { id: d.ncFrAccept || d.ncFrRefuse, accept: !!d.ncFrAccept }, d.ncFrAccept ? "Match amical accepté." : "Demande refusée."); return; }
    if (d.ncFrCancel) {
      if (!window.confirm(t("Annuler ce match amical ?"))) return;
      post("/api/national/coach/friendly/cancel", { id: d.ncFrCancel }, "Match amical annulé.");
      return;
    }
    // Staff.
    if (d.ncAssign) { post("/api/national/coach/staff/assign", { mid: d.ncAssign, on: d.ncOn !== "0", player: { p: Number(d.ncP), n: d.ncN } }, d.ncOn === "0" ? "Joueur retiré du scout." : "Joueur attribué."); return; }
    if (d.ncAssignAdd) {
      var sel = document.getElementById("ncAssignSel-" + d.ncAssignAdd);
      if (!sel || !sel.value) return;
      var pv = sel.value.split("|");
      post("/api/national/coach/staff/assign", { mid: d.ncAssignAdd, on: true, player: { p: Number(pv[0]), n: pv.slice(1).join("|") } }, "Joueur attribué et présélectionné.");
      return;
    }
    if (d.ncStaffInvite) { post("/api/national/coach/staff/invite", { mid: d.ncStaffInvite, role: d.ncRole }, "Invitation envoyée."); return; }
    if (d.ncStaffRemove) {
      if (!window.confirm(t("Retirer ce membre du staff ?"))) return;
      post("/api/national/coach/staff/remove", { mid: d.ncStaffRemove, role: d.ncRole || undefined }, "Staff mis à jour.");
    }
  }
  function onChange(e) {
    var el = e.target;
    if (!ui.mode || !ui.view) return;
    var ds = el.dataset || {};
    if (ds.ncFr) {
      if (ds.ncFr === "opp") { ui.frOpp = el.value; ui.frAt = ""; }
      else if (ds.ncFr === "at") ui.frAt = el.value;
      else ui.frVenue = el.value;
      paint(); return;
    }
    if (ds.ncOpp !== undefined) {
      // « Ma sélection » : même rapport, appliqué à sa propre sélection.
      if (el.value === "__self") { ui.anaSelf = true; paint(); return; }
      ui.anaSelf = false;
      ui.opp = el.value || null;
      var p = api("/api/national/coach?id=" + encodeURIComponent(ui.teamId) + (ui.opp ? "&opp=" + encodeURIComponent(ui.opp) : "")).then(function (d) { setView(d); }).catch(function (err) { ui.error = err.message; }).then(paint);
      window.__lastNationalCoach = p;
      return;
    }
    if (ds.ncTqMatch) {
      if (ui.tq && ui.tq.dirty && !window.confirm(t("Abandonner les modifications non enregistrées ?"))) { el.value = ui.tq.key; return; }
      ui.tqMatch = el.value; ui.tq = null; ui.error = "";
      paint();
    }
  }
  // Filtre la liste d'attribution d'un scout sans repeindre la page.
  function filterAssign(input) {
    var sel = document.getElementById("ncAssignSel-" + input.dataset.ncAssignQ);
    if (!sel) return;
    var q = input.value.trim().toLowerCase(), first = null;
    Array.prototype.forEach.call(sel.options, function (o) {
      var hit = !q || (o.getAttribute("data-q") || "").indexOf(q) >= 0;
      o.hidden = !hit; o.disabled = !hit;
      if (hit && !first) first = o;
    });
    if (first && (sel.selectedOptions[0] || {}).hidden !== false) sel.value = first.value;
    else if (!first) sel.value = "";
  }
  function onInput(e) {
    if (ui.mode && e.target.dataset && e.target.dataset.ncAssignQ) { filterAssign(e.target); return; }
    if (!ui.mode || !e.target.dataset || !e.target.dataset.ncStaffQ) return;
    ui.staffQ = e.target.value;
    var pos = e.target.selectionStart;
    paint();
    var el = document.querySelector("[data-nc-staff-q]");
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (err) { /* rien */ } }
  }
  function onModeClick(e) {
    if (!ui.mode) return;
    var b = e.target.closest ? e.target.closest("[data-nc-nav],[data-nc-match],[data-nt-match],[data-nt-live],[data-nc-exit]") : null;
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    // Direct d'un match international (même écran que les clubs).
    if (b.dataset.ntLive) { window.__lastNationalLive = window.HM_NATIONAL.openLive(b.dataset.ntLive); return; }
    if (b.dataset.ncExit) { exitMode(); return; }
    if (b.dataset.ncMatch || b.dataset.ntMatch) { openModeMatch(b.dataset.ncMatch || b.dataset.ntMatch); return; }
    ui.nav = b.dataset.ncNav; ui.replaceOut = null; ui.error = "";
    if (ui.nav === "notifications" && ui.view && ui.view.unread) {
      ui.view.feedSeen = ui.view.feed[0] ? ui.view.feed[0].id - ui.view.unread : 0;
      api("/api/national/coach/seen", { teamId: ui.teamId }).then(function () { if (ui.view) { ui.view.unread = 0; syncModeChrome(); } }).catch(function () { /* hors ligne */ });
    }
    try { var sc = document.querySelector(".content-scroll"); if (sc) sc.scrollTop = 0; } catch (err) { /* rien */ }
    if (window.innerWidth < 900 && document.body.classList.contains("m-drawer-open")) { var c = document.querySelector("[data-m-drawer-close],.m-drawer-backdrop"); if (c) c.click(); }
    showModePage();
    paint();
  }
  // Démarrage : mandats et rôles de staff en cours → bouton du tableau de
  // bord (et mode retrouvé après un rechargement).
  function bootMode() {
    return api("/api/national/me").then(function (d) {
      // Rôles cumulables : une entrée par sélection, toutes ses casquettes.
      mine = (d.mandates || []).map(function (m) { return Object.assign({ role: "coach", roles: ["coach"] }, m); });
      (d.staffRoles || []).forEach(function (s) {
        var cur = myMandate(s.teamId);
        if (cur) { if (cur.roles.indexOf(s.role) < 0) cur.roles.push(s.role); return; }
        mine.push({ teamId: s.teamId, label: s.label, country: s.country, role: s.role, roles: [s.role], unread: 0 });
      });
      ensureModeCss();
      syncModeButton();
      var saved = lsGet();
      if (saved && myMandate(saved)) { if (ui.mode !== saved) enterMode(saved); }
      else { if (saved) lsSet(null); if (ui.mode) exitMode(); }
    }).catch(function () { /* hors ligne ou monde absent */ });
  }
  // --- Proposition de poste dans la messagerie (demande du 2026-10-07) ----
  // Le serveur envoie, de la part de celui qui nomme, un message portant
  // meta = { kind: "natStaffInvite", teamId, role, label } ; ici le bouton
  // « Accepter le poste » (même route que la page Sélections :
  // /api/national/coach/staff/respond) et l'état réel de la proposition,
  // lu dans /api/national/me (invitations en attente, rôles en cours).
  var natMsg = { at: 0, invites: null, roles: null, busy: false, loading: null };
  function natMsgRefresh(force) {
    if (natMsg.loading) return natMsg.loading;
    if (!force && natMsg.invites && Date.now() - natMsg.at < 20000) return Promise.resolve();
    natMsg.loading = api("/api/national/me").then(function (d) { natMsg.invites = d.staffInvites || []; natMsg.roles = (d.staffRoles || []).concat((d.mandates || []).map(function (m) { return { teamId: m.teamId, role: "coach" }; })); natMsg.at = Date.now(); })
      .catch(function () { natMsg.invites = natMsg.invites || []; natMsg.roles = natMsg.roles || []; })
      .then(function () { natMsg.loading = null; if (g("renderMsgThread")) window.renderMsgThread({ keepScroll: true }); });
    return natMsg.loading;
  }
  function msgActionHtml(meta) {
    if (!meta || meta.kind !== "natStaffInvite") return "";
    var head = '<div class="nc-msg-act" style="margin:6px 0 2px;padding:10px 12px;border:1px solid rgba(240,162,60,.35);border-radius:12px;background:rgba(240,162,60,.07);max-width:420px">' +
      '<div style="font-size:12px;color:var(--ink-dim);margin-bottom:8px">' + flag(String(meta.teamId).split("-")[0]) + " " + esc(teamLab(meta.teamId)) + " · " + esc(ROLE_LABEL[meta.role] || meta.role) + "</div>";
    if (!natMsg.invites) { natMsgRefresh(); return head + '<span class="nc-club">Chargement…</span></div>'; }
    natMsgRefresh();
    var same = function (x) { return x.teamId === meta.teamId && x.role === meta.role; };
    var attrs = ' data-nc-msg-team="' + esc(meta.teamId) + '" data-nc-msg-role="' + esc(meta.role) + '"';
    if (natMsg.invites.some(same)) return head + '<div class="lp-actions nc-msg-acts"><button type="button" class="cal-next-btn lp-btn" data-nc-msg-accept' + attrs + (natMsg.busy ? " disabled" : "") + ">Accepter le poste</button>" +
      '<button type="button" class="tq-btn" data-nc-msg-decline' + attrs + (natMsg.busy ? " disabled" : "") + ">Refuser</button></div></div>";
    if (natMsg.roles.some(same)) return head + '<span class="nc-tag ok">Poste accepté</span> <button type="button" class="tq-btn" data-nc-enter="' + esc(meta.teamId) + '">Mode Sélection</button></div>';
    return head + '<span class="nc-club">Proposition expirée ou retirée.</span></div>';
  }
  function onMsgAction(b) {
    if (natMsg.busy) return null;
    var d = b.dataset, accept = d.ncMsgAccept !== undefined;
    natMsg.busy = true;
    if (g("renderMsgThread")) window.renderMsgThread({ keepScroll: true });
    var p = api("/api/national/coach/staff/respond", { teamId: d.ncMsgTeam, role: d.ncMsgRole, accept: accept })
      .then(function () { toast(accept ? "Poste accepté : vous rejoignez le staff de la sélection." : "Proposition refusée."); bootMode(); })
      .catch(function (e) { toast(e.message); })
      .then(function () { natMsg.busy = false; return natMsgRefresh(true); });
    window.__lastNationalCoach = p;
    return p;
  }
  function bind() {
    var holder = document.getElementById("nationalContent");
    if (!holder || holder.__ncBound) return;
    holder.__ncBound = true;
    holder.addEventListener("click", onModeClick, true);
    // Menu latéral du mode (hors de #nationalContent) et bouton d'entrée du
    // tableau de bord / de la page Sélections.
    document.addEventListener("click", function (e) {
      var msgAct = e.target.closest && e.target.closest("[data-nc-msg-accept],[data-nc-msg-decline]");
      if (msgAct) { e.preventDefault(); e.stopPropagation(); onMsgAction(msgAct); return; }
      var enter = e.target.closest && e.target.closest("[data-nc-enter]");
      if (enter) { e.preventDefault(); e.stopPropagation(); ensureModeCss(); enterMode(enter.dataset.ncEnter); return; }
      if (ui.mode && e.target.closest && e.target.closest("#ncSidebar")) onModeClick(e);
      var res = ui.mode && e.target.closest && e.target.closest(".topbar-search-result[data-nc-profile]");
      if (res) {
        e.preventDefault(); e.stopPropagation();
        var box = document.getElementById("topbarSearchResults"), inp = document.getElementById("topbarSearchInput");
        if (box) { box.classList.add("hidden"); box.innerHTML = ""; }
        if (inp) inp.value = "";
        var q = res.dataset.ncProfile.split("|"), lg = null;
        try { lg = typeof league !== "undefined" ? league : null; } catch (err) { lg = null; }
        if (lg && lg.leagueId === q[0] && g("showPlayerDetail")) window.showPlayerDetail(Number(q[1]), Number(q[2]));
        else if (g("showForeignPlayerDetail")) window.showForeignPlayerDetail(q[0], Number(q[1]), Number(q[2]));
        return;
      }
      var pdpList = ui.mode && e.target.closest && e.target.closest("[data-nc-pdp-list]");
      if (pdpList) { e.preventDefault(); e.stopPropagation(); onPdpListClick(pdpList); }
      var noteBtn = ui.mode && e.target.closest && e.target.closest("[data-nc-note-add],[data-nc-note-del]");
      if (noteBtn) { e.preventDefault(); e.stopPropagation(); onNoteClick(noteBtn); return; }
      var pdpAssign = ui.mode && e.target.closest && e.target.closest("[data-nc-pdp-assign]");
      if (pdpAssign) { e.preventDefault(); e.stopPropagation(); onPdpAssignClick(pdpAssign); }
    }, true);
    document.addEventListener("input", onTopSearch, true);
    document.addEventListener("focus", function (e) { if (e.target && e.target.id === "topbarSearchInput" && e.target.value) onTopSearch(e); }, true);
    holder.addEventListener("click", onClick);
    holder.addEventListener("change", onChange);
    holder.addEventListener("input", onInput);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();

  (function waitGame(n) {
    if (window.__gameReady) { Promise.resolve(window.__gameReady).then(function () { bind(); bootMode(); }, function () { /* jeu non chargé */ }); return; }
    if (n > 600) return;
    setTimeout(function () { waitGame(n + 1); }, 500);
  })(0);
  window.HM_NATIONAL_COACH = {
    enterMode: function (id) { bind(); return enterMode(id); }, exitMode: exitMode, boot: function () { return bootMode(); },
    dashButtonHtml: dashButtonHtml, state: ui, msgActionHtml: msgActionHtml, navKey: navKey, restoreNav: restoreNav, pdpActionsHtml: pdpActionsHtml, pdpNotesHtml: pdpNotesHtml,
    // Ancien point d'entrée (« Gérer la sélection ») : ouvre le mode.
    open: function (id) { bind(); return enterMode(id); },
  };
})();
