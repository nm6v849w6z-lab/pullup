/* Sélections nationales — mode Sélectionneur (phases B et E, refonte du
   2026-10-06). Fichier à part (limite de taille de la page, voir
   load_size_test.js). Côté serveur : server/nationalCoach.js (vue et droits
   par rôle), server/nationalFriendlies.js (amicaux internationaux), routes
   /api/national/coach*.

   Environnement séparé du mode Club, ouvert depuis le tableau de bord du
   club (bouton « Mode Sélectionneur » à côté de « Analyse de mon équipe »,
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
  var ROLE_LABEL = { coach: "Sélectionneur", assistant: "Adjoint", scout: "Recruteur" };
  var ui = { teamId: null, view: null, tab: "joueurs", pos: "", filter: "", shown: 50, gid: null, error: "", busy: false, replaceOut: null, draft: null,
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
    ".nc-table{width:100%;border-collapse:collapse;font-size:13px}",
    ".nc-table th{color:var(--ink-faint);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;text-align:center;padding:6px 4px;border-bottom:1px solid var(--line);white-space:nowrap}",
    ".nc-table td{padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.04);text-align:center;font-variant-numeric:tabular-nums}",
    ".nc-table .l{text-align:left}",
    ".nc-nm{background:none;border:0;padding:0;color:var(--ink);font:inherit;font-weight:700;cursor:pointer;text-align:left}",
    ".nc-club{color:var(--ink-dim);font-size:12px}",
    ".nc-gen{display:inline-block;min-width:30px;padding:2px 6px;border-radius:6px;background:rgba(79,209,139,.14);color:#4FD18B;font-weight:800}",
    ".nc-bar{width:54px;height:6px;border-radius:3px;background:rgba(255,255,255,.08);display:inline-block;vertical-align:middle;overflow:hidden}.nc-bar i{display:block;height:100%}",
    ".nc-form{white-space:nowrap}.nc-form span{display:inline-block;width:7px;height:16px;margin:0 1px;border-radius:2px;vertical-align:middle;background:rgba(255,255,255,.08)}",
    ".nc-ic{width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2);display:inline-grid;place-items:center;color:var(--ink-dim);cursor:pointer;padding:0;margin:0 1px}",
    ".nc-ic.on-watch{color:var(--amber);border-color:rgba(240,162,60,.5)}.nc-ic.on-pre{color:#4FD18B;border-color:rgba(79,209,139,.5)}.nc-ic.on-conv{color:#6FB6FF;border-color:rgba(111,182,255,.55)}",
    ".nc-ic:disabled{opacity:.4;cursor:default}",
    ".nc-sec{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin:2px 0 10px}",
    ".nc-next{padding:10px 12px;border-radius:10px;background:rgba(111,182,255,.08);border:1px solid rgba(111,182,255,.3);margin-bottom:12px;font-size:13px}",
    ".nc-slot{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;background:var(--panel-2);margin-bottom:6px;font-size:13px}",
    ".nc-slot .nc-grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".nc-tag{font-size:11px;padding:2px 7px;border-radius:6px;white-space:nowrap}.nc-tag.ok{background:rgba(79,209,139,.12);color:#4FD18B}.nc-tag.bad{background:rgba(226,105,79,.15);color:#E2694F}.nc-tag.mid{background:rgba(240,162,60,.14);color:var(--amber)}.nc-tag.info{background:rgba(111,182,255,.14);color:#6FB6FF}",
    ".nc-btn{background:var(--amber);color:#1A0F02;border-radius:9px;padding:9px 14px;font:inherit;font-weight:800;border:0;cursor:pointer}",
    ".nc-btn2{background:transparent;border:1px solid rgba(240,162,60,.5);color:var(--amber);border-radius:8px;padding:5px 9px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}",
    ".nc-btn:disabled,.nc-btn2:disabled{opacity:.5;cursor:default}",
    ".nc-small{font-size:12px;color:var(--ink-faint);margin:8px 0 0}",
    ".nc-err{color:#E2694F;font-size:13px;margin:8px 0}",
    ".nc-gath{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:16px}",
    ".nc-g{text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px 12px;color:var(--ink);font:inherit;cursor:pointer}",
    ".nc-g.on{border-color:var(--amber)}.nc-g.past{opacity:.6}.nc-g b{display:block;font-size:13.5px}.nc-g span{font-size:12px;color:var(--ink-dim)}.nc-g b .nat-flag{width:18px;height:12px;vertical-align:-1px}.nc-g .nc-g-comp{color:var(--amber);font-weight:700}",
    ".nc-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}@media(max-width:900px){.nc-two{grid-template-columns:minmax(0,1fr)}}",
    ".nc-set{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px 14px}",
    ".nc-set label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink-dim);font-weight:700}",
    ".nc-set select,.nc-sheet select,.nc-sheet input,.nc-in{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:7px 8px;font:inherit;font-size:13px}",
    ".nc-sheet{width:100%;border-collapse:collapse;font-size:13px}.nc-sheet td,.nc-sheet th{padding:6px;border-bottom:1px solid rgba(255,255,255,.05);text-align:left}",
    ".nc-sheet th{font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em}.nc-sheet input[type=number]{width:62px}",
    ".nc-stack>*+*{margin-top:14px}",
    ".nc-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    ".nc-fr{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);flex-wrap:wrap}.nc-fr:first-child{border-top:0}.nc-fr .nc-grow{flex:1;min-width:180px}",
    ".nc-fr .nat-flag,.nc-opp-head .nat-flag{width:26px;height:18px;border-radius:3px;object-fit:cover}",
    ".nc-opp-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.nc-opp-head .nat-flag{width:42px;height:28px}.nc-opp-head h3{margin:0;font-size:19px}",
    ".nc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}@media(max-width:700px){.nc-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}",
    ".nc-kpis>div{background:var(--panel-2);border-radius:10px;padding:10px 12px}.nc-kpis b{display:block;font-size:18px}.nc-kpis span{font-size:12px;color:var(--ink-dim)}",
    "#selectionsSection .nc-players th.eff-th{cursor:pointer}",
    // Rapport d'analyse : drapeau dans l'écusson rond du bandeau (sp2-crest).
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
        if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || "Mode Sélectionneur indisponible pour l'instant.");
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

  // --- Tableau des joueurs (Sélectionnables, Présélection, Suivis) ---------
  // Même rendu que l'Effectif (en-têtes triables, cases colorées des
  // caractéristiques, badges de poste) ; un clic sur un en-tête trie, un
  // second inverse.
  function formBars(x) {
    var l = x.last5 || [];
    var out = "";
    for (var i = 0; i < 5; i++) {
      var e = l[l.length - 5 + i];
      out += e ? '<span style="background:' + effColor(e.eff) + '" title="' + esc((e.opp ? "vs " + e.opp + " : " : "") + e.pts + " pts, " + e.reb + " reb, " + e.ast + " pd, éval. " + e.eff) + '"></span>' : "<span></span>";
    }
    return out;
  }
  function recentForm(x) {
    var l = (x.last5 || []).slice(-5);
    return l.length ? l.reduce(function (s, e) { return s + (e.eff || 0); }, 0) / l.length : -1;
  }
  function columns() {
    var cols = [
      { key: "name", label: "Nom", cls: "eff-th-name", dir: 1, sort: function (x) { return String(x.name || "").toLowerCase(); } },
      { key: "age", label: "Âge", dir: 1, sort: function (x) { return x.age; } },
      { key: "position", label: "Poste", dir: 1, sort: function (x) { return POS.indexOf(x.position); } },
      { key: "height", label: "Taille", sort: function (x) { return x.height || 0; } },
      { key: "gen", label: "GEN", title: "Note du meilleur poste", sort: genOf },
    ];
    attrGroups().forEach(function (gr, gi) {
      gr.keys.forEach(function (k, ki) { cols.push({ key: k, label: attrShort(k), title: attrTitle(k), attr: true, gstart: ki === 0, sort: function (x) { var v = attrVal(x, k); return v == null ? -1 : v; } }); });
    });
    cols.push(
      { key: "gp", label: "MJ", title: "Matchs joués en club cette saison", gstart: true, sort: function (x) { return x.season.gp; } },
      { key: "min", label: "Min", title: "Minutes par match", sort: function (x) { return x.season.min; } },
      { key: "pts", label: "Pts", title: "Points par match", sort: function (x) { return x.season.pts; } },
      { key: "reb", label: "Reb", title: "Rebonds par match", sort: function (x) { return x.season.reb; } },
      { key: "ast", label: "Pd", title: "Passes décisives par match", sort: function (x) { return x.season.ast; } },
      { key: "eff", label: "Éval.", title: "Évaluation moyenne par match", sort: function (x) { return x.season.eff; } },
      { key: "form", label: "Forme récente", title: "Évaluation des 5 derniers matchs en club", sort: recentForm },
      { key: "condition", label: "État", title: "État physique", sort: function (x) { return x.injuryUntil ? -1 : (x.condition || 0); } }
    );
    return cols;
  }
  function sortList(list) {
    var c = columns().filter(function (x) { return x.key === ui.sort.key; })[0] || columns()[4];
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
    var r = { p: x.p, n: x.n }, cur = curGathering(), out = "";
    if (can("watch")) {
      var w = inList(v.watchlist, r);
      out += '<button type="button" class="nc-ic' + (w ? " on-watch" : "") + '" data-nc-list="watchlist" data-nc-on="' + (w ? 0 : 1) + '" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '" title="' + (w ? "Ne plus suivre" : "Suivre ce joueur") + '">' + icon("star", w) + "</button>";
    }
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
      "<td>" + esc(x.age) + "</td><td>" + posBadge(x.position) + "</td><td>" + (x.height ? esc(x.height) + " cm" : "–") + "</td>" +
      '<td><span class="nc-gen">' + esc(genOf(x)) + "</span></td>";
    attrGroups().forEach(function (gr) {
      gr.keys.forEach(function (k, ki) {
        var val = attrVal(x, k);
        h += '<td class="' + (ki === 0 ? "eff-gstart" : "") + '">' + (val == null ? "–" : '<span class="attr-cell eff-attr ' + tier(val) + '"><span class="attr-val">' + esc(Math.round(val)) + "</span></span>") + "</td>";
      });
    });
    h += '<td class="eff-gstart">' + esc(x.season.gp) + "</td><td>" + esc(x.season.min) + "</td><td>" + esc(x.season.pts) + "</td><td>" + esc(x.season.reb) + "</td><td>" + esc(x.season.ast) + "</td><td>" + esc(x.season.eff) + "</td>" +
      '<td class="nc-form">' + formBars(x) + "</td>" +
      '<td title="État physique ' + esc(x.condition) + '/100">' + (x.injuryUntil ? '<span class="nc-tag bad">Blessé</span>' : '<span class="nc-bar"><i style="width:' + Math.max(4, x.condition || 0) + "%;background:" + condColor(x.condition || 0) + '"></i></span>') + "</td>" +
      (acts ? '<td class="nc-act" style="white-space:nowrap">' + acts + "</td>" : "") + "</tr>";
    return h;
  }
  function playersTableHtml(list, v, opts) {
    opts = opts || {};
    var cols = columns();
    var withActs = can("watch") || can("preselect") || can("convoke");
    var total = list.length;
    list = sortList(list);
    if (opts.limit) list = list.slice(0, ui.shown);
    var groups = attrGroups();
    var fam = '<tr class="eff-family-row"><td colspan="5"></td>' + groups.map(function (gr) { return '<td colspan="' + gr.keys.length + '" class="eff-family"><span>' + esc(gr.label) + "</span></td>"; }).join("") +
      '<td colspan="8" class="eff-family"><span>Saison en club</span></td>' + (withActs ? "<td></td>" : "") + "</tr>";
    var h = '<div class="eff-table-wrap eff-table-wrap-caracs roster-table-frozen-col"><table class="roster-table eff-table eff-caracs nc-players"><thead>' + fam + "<tr>" + cols.map(headCell).join("") + (withActs ? "<th></th>" : "") + "</tr></thead><tbody>" +
      (list.length ? list.map(function (x) { return playerRow(x, v); }).join("") : '<tr><td colspan="40" class="l nc-club">' + esc(opts.empty || "Aucun joueur.") + "</td></tr>") + "</tbody></table></div>";
    if (opts.limit && total > list.length) h += '<div style="text-align:center;margin-top:10px"><button type="button" class="nc-btn2" data-nc-more="1">Afficher plus (' + (total - list.length) + " joueurs)</button></div>";
    return h;
  }
  function filtersHtml(v) {
    var f = function (attr, val, on, label) { return '<button type="button" class="cal-filter' + (on ? " active" : "") + '" ' + attr + '="' + esc(val) + '">' + esc(label) + "</button>"; };
    return '<div class="cal-toolbar">' + f("data-nc-pos", "", !ui.pos, "Tous les postes") +
      POS.map(function (p) { return f("data-nc-pos", p, ui.pos === p, posShort(p)); }).join("") +
      f("data-nc-filter", "dispo", ui.filter === "dispo", "Disponibles") + f("data-nc-filter", "u23", ui.filter === "u23", "23 ans et moins") +
      (v.watchlist.length ? f("data-nc-filter", "suivis", ui.filter === "suivis", "Suivis") : "") + "</div>";
  }
  function joueursHtml(v) {
    var list = ((v.pool && v.pool.players) || []).filter(function (x) {
      return (!ui.pos || x.position === ui.pos) && (ui.filter !== "dispo" || !x.injuryUntil) && (ui.filter !== "u23" || x.age <= 23) && (ui.filter !== "suivis" || inList(v.watchlist, x));
    });
    return '<div class="nc-card">' + filtersHtml(v) + playersTableHtml(list, v, { limit: true }) +
      '<p class="nc-small">Caractéristiques, état physique et stats : visibles du staff de la sélection seulement, jamais le salaire, le contrat ni le potentiel. Stats de la saison en club, mises à jour toutes les heures.</p></div>';
  }
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
  // Présélection : la liste de travail centrale (présélection + joueurs suivis).
  function preselectionHtml(v) {
    var h = '<div class="nc-stack">';
    if (can("preselectView")) {
      h += '<div class="nc-card"><div class="nc-sec"><span>Présélection</span><span>' + v.preselection.length + " / " + v.limits.preselection + "</span></div>" +
        playersTableHtml(refsToPlayers(v.preselection), v, { empty: can("preselect") ? "Présélection vide : ajoutez des joueurs (coche) depuis Joueurs sélectionnables ou depuis vos joueurs suivis ci-dessous." : "Présélection vide pour l'instant." }) + missingNote(v.preselection) + "</div>";
    }
    h += '<div class="nc-card"><div class="nc-sec"><span>Joueurs suivis</span><span>' + v.watchlist.length + " / " + v.limits.watchlist + "</span></div>" +
      playersTableHtml(refsToPlayers(v.watchlist), v, { empty: "Aucun joueur suivi : utilisez l'étoile dans Joueurs sélectionnables." }) + missingNote(v.watchlist) + "</div>";
    return h + "</div>";
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
      '</select><button type="button" class="nc-btn2" data-nc-replace-go="1">Valider</button><button type="button" class="nc-ic" data-nc-replace-cancel="1" title="Annuler">' + icon("cross") + "</button></div></div>";
  }
  function convocationsHtml(v) {
    if (!v.gatherings.length) return '<div class="nc-card"><p class="nc-club">Aucun rassemblement cette saison.</p></div>';
    var h = '<div class="nc-gath">' + v.gatherings.map(function (x) {
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
    h += '<div class="nc-two"><div class="nc-card"><div class="nc-sec"><span>Convoqués</span><span>' + cur.players.length + " / " + v.limits.convocation + "</span></div>";
    if (!rows.length) h += '<p class="nc-club">Aucun joueur convoqué pour l\'instant.</p>';
    else {
      h += '<div class="nc-scroll"><table class="nc-table"><thead><tr><th>Poste</th><th class="l">Joueur</th><th>Âge</th><th>GEN</th><th>État</th><th>Disponibilité</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
        var x = r.x, c = r.c;
        return "<tr><td>" + (x ? posBadge(x.position) : "–") + '</td><td class="l"><b>' + esc(c.ref.n) + "</b>" + (x ? '<div class="nc-club">' + esc(x.club.name) + "</div>" : "") + "</td><td>" + (x ? esc(x.age) : "–") + "</td><td>" + (x ? '<span class="nc-gen">' + esc(genOf(x)) + "</span>" : "–") + "</td>" +
          "<td>" + (x && !x.injuryUntil ? '<span class="nc-bar"><i style="width:' + Math.max(4, x.condition || 0) + "%;background:" + condColor(x.condition || 0) + '"></i></span>' : "–") + "</td><td>" + statusTag(c.status, x) + "</td><td style=\"white-space:nowrap\">" +
          (edit ? '<button type="button" class="nc-ic" data-nc-conv="0" data-nc-p="' + esc(c.ref.p) + '" data-nc-n="' + esc(c.ref.n) + '" title="Retirer">' + icon("cross") + "</button>" :
            can("convoke") && cur.frozen && !cur.past && c.status !== "ok" ? '<button type="button" class="nc-btn2" data-nc-replace="' + esc(key(c.ref)) + '">Remplacer</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    }
    if (ui.replaceOut) h += replaceHtml(v, cur);
    h += '<p class="nc-small">' + (cur.frozen ? "Liste figée 3 jours avant le premier match : seul un joueur blessé ou devenu inéligible peut être remplacé. Pour chaque match, 12 joueurs sont choisis parmi ces 15 dans Tactique." :
      "Au gel de la liste (3 jours avant le premier match), les places libres sont complétées (présélection d'abord) et chaque manager de club concerné est prévenu.") + "</p></div>";
    // Préparer le groupe : présélection à convoquer.
    h += '<div class="nc-card">';
    if (can("preselectView")) {
      var pre = refsToPlayers(v.preselection).filter(function (x) { return !inList(conv, x); }).sort(function (a, b) { return POS.indexOf(a.position) - POS.indexOf(b.position) || genOf(b) - genOf(a); });
      h += '<div class="nc-sec"><span>Présélection non convoquée</span><span>' + pre.length + "</span></div>";
      if (!pre.length) h += '<p class="nc-club">' + (v.preselection.length ? "Toute la présélection est convoquée." : "Présélection vide.") + "</p>";
      pre.forEach(function (x) {
        h += '<div class="nc-slot">' + posBadge(x.position) + '<span class="nc-grow">' + esc(x.name) + ' <span class="nc-club">· GEN ' + esc(genOf(x)) + " · " + esc(x.club.name) + "</span></span>" + (x.injuryUntil ? statusTag("injured", x) : "") +
          (edit ? '<button type="button" class="nc-ic" data-nc-conv="1" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '" title="Convoquer"' + (conv.length >= v.limits.convocation ? " disabled" : "") + ">" + icon("plus") + "</button>" : "") + "</div>";
      });
    }
    if (cur.changes && cur.changes.length) {
      h += '<div class="nc-sec" style="margin-top:14px"><span>Remplacements</span></div>' + cur.changes.map(function (c) {
        return '<div class="nc-slot">' + icon("swap") + '<span class="nc-grow">' + esc(c.in.n) + " remplace " + esc(c.out.n) + ' <span class="nc-club">(' + (c.reason === "injured" ? "blessé" : "plus éligible") + ")</span></span></div>";
      }).join("");
    }
    return h + "</div></div>";
  }

  // --- Tactique -------------------------------------------------------------
  function draftOrders(v) {
    if (!ui.draft) ui.draft = JSON.parse(JSON.stringify(v.tactics));
    var d = ui.draft;
    d.lineup = d.lineup || { starters: {}, backupPositions: {} };
    d.lineup.starters = d.lineup.starters || {};
    d.lineup.backupPositions = d.lineup.backupPositions || {};
    d.watchAssignments = d.watchAssignments || [];
    return d;
  }
  function sel(name, opts, value, attrs) {
    return '<select ' + (attrs || "") + ' data-nc-set="' + name + '">' + opts.map(function (o) { var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(val) + '"' + (String(val) === String(value) ? " selected" : "") + ">" + esc(lab) + "</option>"; }).join("") + "</select>";
  }
  function tactiqueHtml(v) {
    var d = draftOrders(v), pm = poolByKey(), o = v.options;
    var roster = v.tacticsPlayers.map(function (x) { return { nid: x.nid, ref: x.ref, p: pm[key(x.ref)] }; });
    var sheet = d.lineup.convoked && d.lineup.convoked.length ? d.lineup.convoked : roster.slice(0, v.limits.matchSquad).map(function (x) { return x.nid; });
    d.lineup.convoked = sheet;
    var onSheet = roster.filter(function (x) { return sheet.indexOf(x.nid) >= 0; });
    var startOf = {};
    POS.forEach(function (p) { if (d.lineup.starters[p] != null) startOf[d.lineup.starters[p]] = p; });
    var minsOf = function (nid) { var pos = startOf[nid] || ((d.lineup.backupPositions[nid] || [])[0]); var mm = d.lineup.minutes && pos && d.lineup.minutes[pos]; return mm && mm[nid] != null ? mm[nid] : ""; };
    var cur = curGathering();
    var h = '<div class="nc-two"><div class="nc-card"><div class="nc-sec"><span>Feuille de match</span><span>' + sheet.length + " / " + v.limits.matchSquad + "</span></div>";
    if (!roster.length) h += '<p class="nc-club">Aucun joueur : convoquez (ou présélectionnez) des joueurs d\'abord.</p>';
    else {
      h += '<p class="nc-small" style="margin:0 0 8px">' + (cur && cur.players.length ? "Les " + roster.length + " convoqués de « " + esc(gTitleText(cur)) + " » : cochez les 12 du match." : "Pas encore de convoqués : la tactique se prépare avec la présélection.") + "</p>";
      h += '<div class="nc-scroll"><table class="nc-sheet"><thead><tr><th></th><th>Joueur</th><th>Poste</th><th>Titulaire</th><th>Remplaçant à</th><th>Minutes</th></tr></thead><tbody>';
      roster.forEach(function (x) {
        var on = sheet.indexOf(x.nid) >= 0;
        h += "<tr><td><input type=\"checkbox\" data-nc-sheet=\"" + x.nid + "\"" + (on ? " checked" : "") + (!on && sheet.length >= v.limits.matchSquad ? " disabled" : "") + "></td>" +
          "<td>" + esc(x.ref.n) + (x.p && x.p.injuryUntil ? ' <span class="nc-tag bad">Blessé</span>' : "") + "</td><td>" + (x.p ? posBadge(x.p.position) : "–") + "</td>" +
          "<td>" + (startOf[x.nid] ? posBadge(startOf[x.nid]) : "") + "</td>" +
          "<td>" + (on && !startOf[x.nid] ? sel("backup:" + x.nid, [["", "Auto"]].concat(POS.map(function (p) { return [p, p]; })), (d.lineup.backupPositions[x.nid] || [])[0] || "") : "") + "</td>" +
          "<td>" + (on ? '<input type="number" min="0" max="40" data-nc-min="' + x.nid + '" value="' + esc(minsOf(x.nid)) + '" placeholder="auto">' : "") + "</td></tr>";
      });
      h += "</tbody></table></div>";
      h += '<div class="nc-sec" style="margin-top:14px"><span>Cinq majeur</span></div><div class="nc-set">' + POS.map(function (p) {
        return "<label>" + esc(p) + sel("starter:" + p, [["", "Aucun"]].concat(onSheet.map(function (x) { return [x.nid, x.ref.n + (x.p ? " (" + posShort(x.p.position) + ")" : "")]; })), d.lineup.starters[p] != null ? d.lineup.starters[p] : "") + "</label>";
      }).join("") + "</div>";
    }
    h += "</div><div class=\"nc-card\"><div class=\"nc-sec\"><span>Systèmes de jeu</span></div><div class=\"nc-set\">";
    for (var i = 0; i < o.maxOffense; i++) h += "<label>Priorité offensive " + (i + 1) + sel("offense:" + i, (i ? [["", "Aucune"]] : []).concat(o.offense.map(function (x) { return [x, x]; })), (d.offensivePriorities || [])[i] || "") + "</label>";
    h += "<label>Défense" + sel("defense", o.defense, d.defense) + "</label><label>Rythme" + sel("rhythm", o.rhythm, d.rhythm) + "</label>" +
      "<label>Défense sur écrans" + sel("screenDefense", o.screenDefense, d.screenDefense) + "</label><label>Aide défensive" + sel("helpDefense", o.helpDefense, d.helpDefense) + "</label>" +
      "<label>Défense au poste" + sel("postDefense", o.postDefense, d.postDefense) + "</label><label>Sortie sur le tireur" + sel("closeoutStyle", o.closeoutStyle, d.closeoutStyle) + "</label>" +
      "<label>Rebond offensif" + sel("offRebStyle", o.offRebStyle, d.offRebStyle) + "</label><label>Fin de match" + sel("endgameManagement", o.endgameManagement, d.endgameManagement) + "</label>" +
      "<label>Niveau tactique" + sel("tacticalTier", [["débutant", "Débutant"], ["confirmée", "Confirmée"]], d.tacticalTier) + "</label></div>";
    h += '<div class="nc-sec" style="margin-top:14px"><span>Consignes individuelles (marquage)</span><span>' + d.watchAssignments.filter(Boolean).length + " / " + o.maxWatch + "</span></div><div class=\"nc-set\">";
    for (var w = 0; w < o.maxWatch; w++) {
      var wa = d.watchAssignments[w] || {};
      h += "<label>Consigne " + (w + 1) + sel("watchPos:" + w, [["", "Aucune"]].concat(POS.map(function (p) { return [p, { "Meneur": "Sur le meneur", "Arrière": "Sur l'arrière", "Ailier shooteur": "Sur l'ailier shooteur", "Ailier fort": "Sur l'ailier fort", "Pivot": "Sur le pivot" }[p]]; })), wa.position || "") +
        (wa.position ? sel("watchFocus:" + w, o.watchFocus.map(function (f) { return [f, WATCH_LABELS[f] || f]; }), wa.focus || o.watchFocus[0]) : "") + "</label>";
    }
    h += '</div><div class="nc-row" style="margin-top:16px"><button type="button" class="nc-btn" data-nc-save-tactics="1"' + (ui.busy ? " disabled" : "") + ">Enregistrer la tactique</button>" +
      '<span class="nc-small" style="margin:0">' + (v.tactics && v.tactics.updatedAt ? "Enregistrée le " + esc(when(v.tactics.updatedAt, true)) : "Pas encore enregistrée") + "</span></div>" +
      '<p class="nc-small">Tactique propre à la sélection, sans lien avec celle de votre club. Mêmes réglages que les Ordres d\'un club ; minutes laissées vides = rotation automatique.</p></div></div>';
    return h;
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
    h += '<div class="nc-card"><div class="nc-sec"><span>Proposer un match amical</span><span>' + fr.limits.used + " / " + fr.limits.perSeason + " cette saison</span></div>";
    if (full) h += '<p class="nc-club">Nombre maximum de matchs amicaux atteint pour cette saison.</p>';
    else {
      h += '<div class="nc-set"><label>Adversaire<select class="nc-in" data-nc-fr="opp"><option value="">Choisir une sélection</option>' + opps.map(function (o) {
        return '<option value="' + esc(o.id) + '"' + (ui.frOpp === o.id ? " selected" : "") + ">" + esc(teamLab(o.id) + (o.interim ? " · intérim (accepte d'office)" : " · " + o.coach) + (o.used >= fr.limits.perSeason ? " · complet" : "")) + "</option>";
      }).join("") + "</select></label>" +
        '<label>Fenêtre internationale<select class="nc-in" data-nc-fr="at"><option value="">' + (dates.length ? "Choisir une fenêtre" : "Aucune fenêtre libre") + "</option>" + dates.map(function (d) {
          return '<option value="' + d.at + '"' + (String(ui.frAt) === String(d.at) ? " selected" : "") + ">" + esc("Fenêtre internationale " + d.window + " · " + when(d.at, true)) + "</option>";
        }).join("") + "</select></label>" +
        '<label>Lieu<select class="nc-in" data-nc-fr="venue"><option value="home"' + (ui.frVenue === "home" ? " selected" : "") + '>À domicile</option><option value="away"' + (ui.frVenue === "away" ? " selected" : "") + ">À l'extérieur</option></select></label></div>" +
        '<div class="nc-row" style="margin-top:12px"><button type="button" class="nc-btn" data-nc-fr-send="1"' + (!ui.frOpp || !ui.frAt || ui.busy ? " disabled" : "") + ">Envoyer la demande</button></div>";
    }
    h += '<p class="nc-small">' + (fr.dates.length ? "" : "Votre sélection joue ses qualifications à chaque fenêtre restante. ") + "Les amicaux se jouent uniquement pendant les fenêtres internationales (dimanche à 20h), entre deux sélections sans match de qualification ce jour-là. Réponse attendue avant le gel des convocations (3 jours avant le match).</p></div>";
    var sec = function (title, list, actsFn, empty) {
      return '<div class="nc-card"><div class="nc-sec"><span>' + esc(title) + "</span><span>" + list.length + "</span></div>" + (list.length ? list.map(function (f) { return frLine(f, actsFn ? actsFn(f) : ""); }).join("") : '<p class="nc-club">' + esc(empty) + "</p>") + "</div>";
    };
    h += sec("Demandes reçues", fr.received, function (f) {
      return '<button type="button" class="nc-btn2" data-nc-fr-accept="' + esc(f.id) + '">Accepter</button><button type="button" class="nc-btn2" data-nc-fr-refuse="' + esc(f.id) + '">Refuser</button>';
    }, "Aucune demande reçue.");
    h += sec("Demandes envoyées", fr.sent, function (f) { return '<button type="button" class="nc-btn2" data-nc-fr-cancel="' + esc(f.id) + '">Annuler</button>'; }, "Aucune demande en attente.");
    h += sec("Matchs programmés", fr.scheduled, function (f) {
      return '<button type="button" class="nc-btn2" data-nc-gid-go="' + esc(f.gid) + '">Convocations</button>' + (now < f.freezeAt ? '<button type="button" class="nc-btn2" data-nc-fr-cancel="' + esc(f.id) + '">Annuler</button>' : "");
    }, "Aucun match amical programmé.");
    h += sec("Matchs joués", fr.played, function (f) { return '<button type="button" class="nc-btn2" data-nc-match="' + esc(f.id) + '">Feuille de match</button>'; }, "Aucun match amical joué.");
    if (fr.closed.length) h += sec("Refusées et annulées", fr.closed, null, "");
    return h + "</div>";
  }

  // --- Staff (2 adjoints, 2 recruteurs, de vrais managers) -------------------
  function staffHtml(v) {
    var staff = v.staff || [], max = v.staffMax || { assistant: 2, scout: 2 };
    var desc = { assistant: "Joueurs, présélection et convoqués en consultation, tactique, préparation des matchs, analyse des adversaires. Aucun pouvoir d'administration.", scout: "Joueurs (suivi) et analyse des adversaires seulement." };
    var h = '<div class="nc-two">';
    ["assistant", "scout"].forEach(function (role) {
      var list = staff.filter(function (s) { return s.role === role; });
      h += '<div class="nc-card"><div class="nc-sec"><span>' + (role === "assistant" ? "Adjoints" : "Recruteurs") + "</span><span>" + list.length + " / " + max[role] + "</span></div>" +
        '<p class="nc-small" style="margin:0 0 10px">' + esc(desc[role]) + "</p>" +
        (list.length ? list.map(function (s) {
          return '<div class="nc-slot"><span class="nc-grow"><b>' + esc(s.pseudo || s.clubName) + '</b> <span class="nc-club">· ' + esc(s.clubName || "") + "</span></span>" +
            (s.status === "active" ? '<span class="nc-tag ok">En poste</span>' : '<span class="nc-tag mid">Invitation envoyée</span>') +
            (can("staff") ? '<button type="button" class="nc-btn2" data-nc-staff-remove="' + esc(s.mid) + '">' + (s.status === "active" ? "Retirer" : "Annuler") + "</button>" : "") + "</div>";
        }).join("") : '<p class="nc-club">Personne pour l\'instant.</p>') + "</div>";
    });
    h += "</div>";
    if (!can("staff")) return h;
    var q = ui.staffQ.trim().toLowerCase();
    var mgrs = (v.managers || []).filter(function (m) { return !q || String(m.pseudo || "").toLowerCase().indexOf(q) >= 0 || String(m.clubName || "").toLowerCase().indexOf(q) >= 0; });
    mgrs.sort(function (a, b) { return (a.busy - b.busy) || String(a.pseudo || a.clubName).localeCompare(String(b.pseudo || b.clubName), "fr"); });
    var taken = {}; staff.forEach(function (s) { taken[s.mid] = 1; });
    var count = function (role) { return staff.filter(function (s) { return s.role === role; }).length; };
    h += '<div class="nc-card" style="margin-top:16px"><div class="nc-sec"><span>Inviter un manager</span><span>' + (v.managers || []).length + " managers</span></div>" +
      '<input type="search" class="nc-in" data-nc-staff-q="1" placeholder="Rechercher un manager ou un club" value="' + esc(ui.staffQ) + '" style="width:100%;max-width:420px;margin-bottom:10px">' +
      (mgrs.length ? mgrs.slice(0, 25).map(function (m) {
        var off = m.busy || taken[m.mid];
        return '<div class="nc-fr">' + flag(m.country) + '<div class="nc-grow"><b>' + esc(m.pseudo || m.clubName) + '</b><br><span class="nc-club">' + esc(m.clubName || "") + (m.division ? " · " + esc(m.division) : "") + (m.busy ? " · déjà sélectionneur ou dans un staff" : taken[m.mid] ? " · déjà dans votre staff" : "") + "</span></div>" +
          '<button type="button" class="nc-btn2" data-nc-staff-invite="' + esc(m.mid) + '" data-nc-role="assistant"' + (off || count("assistant") >= max.assistant ? " disabled" : "") + ">Inviter comme adjoint</button>" +
          '<button type="button" class="nc-btn2" data-nc-staff-invite="' + esc(m.mid) + '" data-nc-role="scout"' + (off || count("scout") >= max.scout ? " disabled" : "") + ">Inviter comme recruteur</button></div>";
      }).join("") : '<p class="nc-club">Aucun manager trouvé.</p>') +
      '<p class="nc-small">L\'invité reçoit une notification et répond depuis la page Sélections. Le staff prend fin avec votre mandat.</p></div>';
    return h;
  }

  // --- Analyse des adversaires ------------------------------------------------
  // Retour utilisateur 2026-10-06 : MÊME rapport que l'analyse Premium
  // (Scouting Pro) du Mode Club, pour l'adversaire choisi ou pour sa propre
  // sélection (« Analyse de ma sélection », comme « Analyse de mon équipe »).
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
    var h = '<div class="nc-card"><div class="nc-row"><label class="nc-club" style="display:flex;flex-direction:column;gap:4px;font-weight:700">Sélection analysée<select class="nc-in" data-nc-opp="1">' +
      (a.next ? '<option value="">Prochain adversaire</option>' : '<option value="">Choisir une sélection</option>') +
      '<option value="__self"' + (ui.anaSelf ? " selected" : "") + ">Ma sélection · " + esc(teamLab(v.team.id)) + "</option>" +
      a.choices.map(function (c) { return '<option value="' + esc(c.id) + '"' + (!ui.anaSelf && ui.opp === c.id ? " selected" : "") + ">" + esc(teamLab(c.id)) + "</option>"; }).join("") + "</select></label>" +
      (ui.anaSelf ? "" : '<button type="button" class="nc-btn2" data-nc-own-analysis="1" title="Comment vos adversaires vous voient">Analyse de ma sélection</button>') +
      (a.next ? '<div class="nc-next" style="margin:0;flex:1;min-width:220px"><b>Prochain match</b><br><span>' + esc(a.next.label) + '</span><br><span class="nc-club">' + esc(when(a.next.at, true)) + '</span> <span class="nc-club">' + (a.next.venue === "home" ? "· à domicile contre " : "· à l'extérieur contre ") + esc(teamLab(a.next.opponent)) + "</span></div>" : "") + "</div></div>";
    var target = anaTarget(v);
    if (target) loadAnalysis(target);
    if (ui.anaSelf) return h + anaBlockHtml(v, target);
    if (!o) return h + '<div class="nc-card" style="margin-top:14px"><p class="nc-club">' + (a.next ? "Adversaire à déterminer." : "Aucun match à venir : choisissez une sélection à analyser.") + "</p></div>";
    h += anaBlockHtml(v, target);
    // Effectif de référence (fiches publiques).
    var squad = (o.squad || []).slice().sort(function (x, y) { return POS.indexOf(x.position) - POS.indexOf(y.position) || y.pts - x.pts; });
    h += '<div class="nc-two" style="margin-top:14px"><div class="nc-card"><div class="nc-sec"><span>Joueurs de référence</span><span>' + squad.length + "</span></div>" +
      (squad.length ? '<div class="nc-scroll"><table class="nc-table"><thead><tr><th>Poste</th><th class="l">Joueur</th><th>Âge</th><th>MJ</th><th>Min</th><th>Pts</th><th>Reb</th><th>Pd</th><th>Éval.</th></tr></thead><tbody>' + squad.map(function (x) {
        var conv = o.convoked && o.convoked.indexOf(x.name) >= 0;
        return "<tr><td>" + posBadge(x.position) + '</td><td class="l"><b>' + esc(x.name) + "</b>" + (x.injured ? ' <span class="nc-tag bad">Blessé</span>' : "") + (conv ? ' <span class="nc-tag info">Convoqué</span>' : "") + (x.club ? '<div class="nc-club">' + esc(x.club.name) + "</div>" : "") + "</td><td>" + esc(x.age) + "</td><td>" + esc(x.gp) + "</td><td>" + esc(x.min) + "</td><td>" + esc(x.pts) + "</td><td>" + esc(x.reb) + "</td><td>" + esc(x.ast) + "</td><td>" + esc(x.eff) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<p class="nc-club">Pas encore de groupe de référence.</p>') +
      '<p class="nc-small">' + (o.convoked ? "Liste des convoqués figée : les joueurs convoqués sont signalés." : "Leurs convoqués apparaîtront une fois leur liste figée (3 jours avant le match).") + " Stats publiques de la saison en club, jamais les caractéristiques.</p></div>";
    var res = function (list) {
      return list.map(function (m) {
        return '<div class="nc-slot"><span class="nc-grow">' + esc(teamLab(m.home)) + " " + esc(m.scoreHome) + " – " + esc(m.scoreAway) + " " + esc(teamLab(m.away)) + ' <span class="nc-club">· ' + esc(m.label || when(m.at)) + "</span></span>" +
          '<button type="button" class="nc-btn2" data-nc-match="' + esc(m.id) + '">Feuille</button></div>';
      }).join("");
    };
    h += '<div class="nc-card"><div class="nc-sec"><span>Derniers résultats</span></div>' + (o.results.length ? res(o.results) : '<p class="nc-club">Aucun match international joué.</p>') +
      '<div class="nc-sec" style="margin-top:14px"><span>Confrontations directes</span></div>' + (o.headToHead.length ? res(o.headToHead) : '<p class="nc-club">Aucune confrontation.</p>') +
      (o.honours.length ? '<div class="nc-sec" style="margin-top:14px"><span>Palmarès</span></div>' + o.honours.map(function (x) { return '<div class="nc-slot"><span class="nc-grow">Saison ' + esc(x.season) + " · " + esc(x.label) + "</span><span class=\"nc-tag ok\">Classement final : " + esc(x.rank) + "e sur " + esc(x.of) + ".</span></div>"; }).join("") : "") + "</div></div>";
    return h;
  }

  // --- Mode Sélectionneur ------------------------------------------------------
  var MODE_KEY = "hm-nat-mode";
  var mine = [];
  // [rubrique, libellé, droit requis]
  var NAV = [
    ["dashboard", "Tableau de bord", "view"],
    ["#", "Joueurs"],
    ["joueurs", "Joueurs sélectionnables", "view"], ["preselection", "Présélection", "watch"], ["convocations", "Convoqués", "convocView"],
    ["#", "Sélection"],
    ["tactique", "Tactique", "tactics"], ["calendrier", "Calendrier", "calendar"], ["qualifications", "Qualifications", "calendar"], ["competition", "Compétitions", "calendar"],
    ["amicaux", "Matchs amicaux", "friendlies"], ["analyse", "Analyse des adversaires", "analysis"], ["stats", "Statistiques", "stats"],
    ["#", "Suivi"],
    ["notifications", "Notifications", "feed"], ["staff", "Staff", "staff"], ["mandat", "Mandat", "mandate"], ["palmares", "Palmarès", "calendar"],
  ];
  function navAllowed(n) { return !n[2] || can(n[2]); }
  var MODE_CSS = [
    "body.nc-mode #sidebar > :not(.sidebar-brand):not(#ncSidebar){display:none!important}",
    "body.nc-mode .topbar-right > :not(#ncModeBtn):not(#topbarBackBtn):not(#topbarPlayerNav){display:none!important}",
    "body.nc-mode .topbar-search, body.nc-mode .topbar-left > :not(#ncTopTitle){display:none!important}",
    "body.nc-mode #mTabbar .tab-btn{display:none!important}",
    "body.nc-mode #selectionsSection .page-title{display:none}",
    "#ncTopTitle{display:flex;align-items:center;gap:10px}#ncTopTitle .nat-flag{width:28px;height:19px;border-radius:3px;object-fit:cover}#ncTopTitle b{font-size:15px}#ncTopTitle span{display:block;font-size:12px;color:var(--ink-dim)}",
    "#ncModeBtn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;border:1px solid var(--line);background:var(--panel-2);color:var(--ink);white-space:nowrap}",
    ".hm-head__nc{display:inline-flex}.hm-head__nc:empty{display:none}",
    ".hm-head__nc-btn{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.hm-head__nc-btn .nat-flag{width:22px;height:15px;border-radius:2px;object-fit:cover}",
    ".nc-badge{min-width:18px;height:18px;border-radius:9px;background:#E2694F;color:#fff;font-size:11px;display:inline-grid;place-items:center;padding:0 5px}",
    "@media(max-width:680px){.hm-head__nc-btn span.nc-lbl{display:none}}",
    "#ncSidebar{display:flex;flex-direction:column;gap:2px;padding:6px 10px 16px}",
    "#ncSidebar .nc-side-head{display:flex;align-items:center;gap:10px;padding:10px 8px 12px;border-bottom:1px solid var(--line);margin-bottom:8px}#ncSidebar .nc-side-head .nat-flag{width:30px;height:20px;border-radius:3px;object-fit:cover}#ncSidebar .nc-side-head b{font-size:15px}",
    "#ncSidebar .nc-side-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);padding:12px 8px 4px}",
    ".nc-side-link{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;background:none;border:0;color:var(--ink-dim);font:inherit;font-size:14px;font-weight:700;padding:8px 10px;border-radius:9px;cursor:pointer}",
    ".nc-side-link:hover{color:var(--ink);background:var(--panel-2)}.nc-side-link.on{color:var(--amber);background:rgba(240,162,60,.1);box-shadow:inset 0 0 0 1px rgba(240,162,60,.5)}.nc-side-link.hot{color:var(--ink)}",
    ".nc-side-back{margin:14px 8px 0;display:flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line);background:var(--panel-2);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}",
    ".nc-dash{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}@media(max-width:900px){.nc-dash{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.nc-dash{grid-template-columns:1fr}}",
    ".nc-kpi .nc-k{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint)}.nc-kpi .nc-v{font-size:22px;font-weight:900;margin:8px 0 2px}.nc-kpi .nc-s{font-size:12.5px;color:var(--ink-dim)}",
    ".nc-hero{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:4px 0 16px}.nc-hero .nat-flag{width:60px;height:40px;border-radius:5px;object-fit:cover;box-shadow:0 0 0 1px rgba(255,255,255,.15)}.nc-hero h1{margin:0;font-size:26px}",
    ".nc-feed-item{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--line)}.nc-feed-item:first-child{border-top:0}.nc-feed-item b{display:block;font-size:13.5px}.nc-feed-item span{font-size:12.5px;color:var(--ink-dim)}.nc-feed-item.unread b{color:var(--amber)}",
    ".nc-feed-dot{width:8px;height:8px;border-radius:50%;margin-top:6px;flex-shrink:0;background:var(--line)}.nc-feed-item.unread .nc-feed-dot{background:var(--amber)}",
    ".nc-mode-title{font-size:24px;font-weight:900;margin:4px 0 14px}",
    "@media(max-width:900px){body.nc-mode .topbar-m-logo{display:none!important}#ncModeBtn{padding:6px 11px;font-size:12px}}",
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
      '<span class="nc-lbl">Mode Sélectionneur</span>' + (m.unread ? '<span class="nc-badge">' + m.unread + "</span>" : "") + "</button>";
  }
  function syncDashButton() {
    var slot = document.getElementById("ncDashSlot");
    if (slot) slot.innerHTML = dashButtonHtml();
  }
  // « Retour au mode Club » : dans l'environnement Sélectionneur seulement
  // (barre du haut et menu latéral du mode).
  function syncModeButton() {
    var right = document.querySelector(".topbar-right");
    var btn = document.getElementById("ncModeBtn");
    if (!ui.mode || !right) { if (btn) btn.remove(); syncDashButton(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.id = "ncModeBtn";
      right.insertBefore(btn, right.firstChild);
      btn.addEventListener("click", function () { exitMode(); });
    }
    btn.innerHTML = icon("back") + " Retour au mode Club";
    btn.title = "Revenir à la gestion de votre club";
    syncDashButton();
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
    if (side) side.innerHTML = '<div class="nc-side-head">' + flag(m.country) + "<div><b>" + esc(m.teamId ? teamLab(m.teamId) : "") + '</b><div class="nc-club">' + esc(ROLE_LABEL[role] || role) + "</div></div></div>" + navs.map(function (n) {
      if (n[0] === "#") return '<div class="nc-side-label">' + esc(n[1]) + "</div>";
      var badge = n[0] === "notifications" && v && v.unread ? '<span class="nc-badge">' + v.unread + "</span>" :
        n[0] === "convocations" && curGathering() ? '<span class="nc-club">' + curGathering().players.length + "</span>" :
        n[0] === "amicaux" && v && v.friendlies && v.friendlies.received.length ? '<span class="nc-badge">' + v.friendlies.received.length + "</span>" : "";
      return '<button type="button" class="nc-side-link' + (ui.nav === n[0] ? " on" : "") + (n[0] === "competition" && inFinals ? " hot" : "") + '" data-nc-nav="' + n[0] + '"><span>' + esc(n[1]) + (n[0] === "competition" && inFinals ? " · en cours" : "") + "</span>" + badge + "</button>";
    }).join("") + '<button type="button" class="nc-side-back" data-nc-exit="1">' + icon("back") + " Retour au mode Club</button>";
    var left = document.querySelector(".topbar-left");
    if (left && !document.getElementById("ncTopTitle")) { var tt = document.createElement("div"); tt.id = "ncTopTitle"; left.appendChild(tt); }
    var top = document.getElementById("ncTopTitle");
    if (top && v) top.innerHTML = flag(v.team.country) + "<div><b>" + esc(teamLab(v.team.id)) + "</b><span>" + esc(ROLE_LABEL[role] || "") + (role === "coach" ? "" : " · sélectionneur : " + esc(coachName(v))) + "</span></div>";
  }
  function coachName(v) { var m = v && v.mandate; return m ? (m.pseudo || (m.clubName ? "Manager de " + m.clubName : "Sélectionneur")) : ""; }
  function isFinalsPeriod() {
    var gg = ((ui.view && ui.view.gatherings) || []).filter(function (x) { return x.kind === "final"; })[0];
    return !!(gg && Date.now() >= gg.freezeAt && Date.now() < gg.endAt + DAY);
  }
  function load() {
    var a = api("/api/national/coach?id=" + encodeURIComponent(ui.teamId) + (ui.opp ? "&opp=" + encodeURIComponent(ui.opp) : "")).then(function (d) { ui.view = d; ui.error = ""; }).catch(function (e) { ui.error = e.message; });
    // Page de la sélection aussi (calendrier, qualifications, phase finale).
    var b = api("/api/national/team?id=" + encodeURIComponent(ui.teamId)).then(function (d) { ui.tv = d; }).catch(function () { /* rubriques sans données */ });
    return Promise.all([a, b]);
  }
  function enterMode(teamId) {
    ensureCss(); ensureModeCss();
    ui.mode = teamId; ui.teamId = teamId; ui.nav = "dashboard"; ui.tv = null; ui.match = null; ui.view = null; ui.gid = null; ui.draft = null; ui.replaceOut = null; ui.opp = null; ui.error = "";
    ui.ana = null; ui.anaSelf = false; ui.anaTeam = null;
    lsSet(teamId);
    document.body.classList.add("nc-mode");
    showModePage();
    if (window.HM_NATIONAL && window.HM_NATIONAL.state) window.HM_NATIONAL.state.coachOpen = teamId;
    paint();
    var p = load().then(paint);
    window.__lastNationalCoach = p;
    return p;
  }
  function exitMode() {
    ui.mode = null; ui.teamId = null; ui.view = null;
    lsSet(null);
    document.body.classList.remove("nc-mode");
    ["ncSidebar", "ncTopTitle"].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
    if (window.HM_NATIONAL && window.HM_NATIONAL.state) window.HM_NATIONAL.state.coachOpen = null;
    syncModeButton();
    var h = typeof TAB_HANDLERS !== "undefined" && TAB_HANDLERS.club;
    if (typeof h === "function") h();
    setTimeout(syncDashButton, 0);
  }
  function titleHtml(nav) {
    var lab = (NAV.filter(function (n) { return n[0] === nav; })[0] || [0, ""])[1];
    return '<h2 class="nc-mode-title">' + esc(lab) + "</h2>";
  }
  function modeHtml() {
    var v = ui.view;
    if (!v) return '<p class="training-empty">' + (ui.error ? esc(ui.error) : "Chargement de votre sélection…") + "</p>";
    var nav = ui.nav || "dashboard";
    var cur = NAV.filter(function (n) { return n[0] === nav; })[0];
    if (cur && !navAllowed(cur)) nav = ui.nav = "dashboard";
    var err = ui.error ? '<p class="nc-err">' + esc(ui.error) + "</p>" : "";
    var poolMissing = '<div class="nc-card"><p class="nc-club">Vivier en cours de préparation (calculé au prochain passage du monde, quelques minutes au plus).</p></div>';
    if (nav === "joueurs") return titleHtml(nav) + err + (v.pool ? joueursHtml(v) : poolMissing);
    if (nav === "preselection") return titleHtml(nav) + err + (v.pool ? preselectionHtml(v) : poolMissing);
    if (nav === "convocations") return titleHtml(nav) + err + convocationsHtml(v);
    if (nav === "tactique") return titleHtml(nav) + err + tactiqueHtml(v);
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
    var kpi = function (k, val, sub, nav) { return '<button type="button" class="nc-card nc-kpi" style="text-align:left;cursor:pointer;color:inherit;font:inherit" data-nc-nav="' + nav + '"><div class="nc-k">' + k + '</div><div class="nc-v">' + val + '</div><div class="nc-s">' + sub + "</div></button>"; };
    var h = '<div class="nc-hero">' + flag(v.team.country) + '<div><div class="nc-club">' + esc(ROLE_LABEL[v.role] || "") + (v.role === "coach" ? " · " + esc(coachName(v)) : " · sélectionneur : " + esc(coachName(v))) + "</div><h1>" + esc(teamLab(v.team.id)) + "</h1></div></div>";
    h += '<div class="nc-dash">';
    h += kpi("Prochain match", nx ? flag(oppOf(nx).split("-")[0]) + " " + esc(teamLab(oppOf(nx))) : "–", nx ? esc(nx.label || (nx.w ? "Fenêtre " + nx.w + " · qualifications" : "")) + " · " + esc(when(nx.at, true)) : "Aucun match programmé", can("analysis") ? "analyse" : "calendrier");
    if (can("calendar")) h += kpi("Qualifications", rank ? rank + (rank === 1 ? "er" : "e") + " du groupe" : "–", tv && tv.qualif && tv.qualif.group ? esc(tv.qualif.group.label) + " · " + esc(tv.qualif.group.continent) : "Groupes à venir", "qualifications");
    if (can("convocView")) h += kpi("Convoqués", (cur ? cur.players.length : 0) + " / " + v.limits.convocation, cur ? esc(gTitleText(cur)) + (cur.frozen ? " · liste figée" : " · liste ouverte jusqu'au " + esc(when(cur.freezeAt))) : "Aucun rassemblement à venir", "convocations");
    h += kpi("Joueurs suivis", v.watchlist.length, can("preselectView") ? v.preselection.length + " en présélection" : "Joueurs sélectionnables", can("watch") ? "preselection" : "joueurs");
    if (can("mandate")) h += kpi("Mandat", "Saison " + seasonNo + " / 2", "Saisons " + esc(v.mandate.fromSeason) + " à " + esc(v.mandate.toSeason) + (r.played ? " · " + r.wins + " V – " + r.losses + " D" : ""), "mandat");
    if (can("friendlies") && v.friendlies) h += kpi("Matchs amicaux", v.friendlies.scheduled.length + " programmé" + (v.friendlies.scheduled.length > 1 ? "s" : ""), v.friendlies.received.length ? v.friendlies.received.length + " demande" + (v.friendlies.received.length > 1 ? "s" : "") + " à traiter" : v.friendlies.limits.used + " / " + v.friendlies.limits.perSeason + " cette saison", "amicaux");
    h += kpi("Dernier résultat", last ? esc(teamLab(last.home)) + " " + esc(last.scoreHome) + " – " + esc(last.scoreAway) + " " + esc(teamLab(last.away)) : "–", last ? esc(when(last.at)) : "Aucun match joué", "calendrier");
    h += "</div>";
    // Prochain match en direct ou imminent : bouton du direct (écran des clubs).
    var nxLive = nx ? liveBtn(nx) : "";
    if (nxLive) h += '<div class="nc-card" style="margin-top:16px"><div class="nc-sec"><span>' + (nx.status === "live" ? "Match en cours" : "Coup d'envoi imminent") + "</span></div>" +
      '<div class="nc-slot"><span class="nc-grow">' + flag(nx.home.split("-")[0]) + " " + esc(teamLab(nx.home)) + " – " + flag(nx.away.split("-")[0]) + " " + esc(teamLab(nx.away)) + ' <span class="nc-club">· ' + esc(when(nx.at, true)) + "</span></span>" + nxLive + "</div></div>";
    h += '<div class="nc-two" style="margin-top:16px">';
    if (can("feed")) h += '<div class="nc-card"><div class="nc-sec"><span>Notifications</span><button type="button" class="nc-btn2" data-nc-nav="notifications">Tout voir</button></div>' + feedHtml(v, 5) + "</div>";
    if (can("convocView")) h += '<div class="nc-card"><div class="nc-sec"><span>Convoqués · ' + esc(cur ? gTitleText(cur) : "") + "</span><span>" + (cur ? cur.players.length : 0) + " / " + v.limits.convocation + "</span></div>" +
      (cur && cur.players.length ? cur.players.slice(0, 15).map(function (c) { return '<div class="nc-slot"><span class="nc-grow">' + esc(c.ref.n) + "</span>" + statusTag(c.status) + "</div>"; }).join("") : '<p class="nc-club">Aucun joueur convoqué pour l\'instant.</p>') + "</div>";
    return h + "</div>";
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
    var k = function (tt, v, s) { return '<div class="nc-card nc-kpi"><div class="nc-k">' + tt + '</div><div class="nc-v">' + v + '</div><div class="nc-s">' + (s || "") + "</div></div>"; };
    var h = '<div class="nc-card" style="margin-bottom:12px"><b>' + (live ? "Bilan en cours" : "Bilan du mandat") + " · " + esc(r.label) + " · " + esc(r.coach) + '</b><div class="nc-club">Saisons ' + esc(r.fromSeason) + " à " + esc(r.toSeason) + " (" + r.seasons + " saison" + (r.seasons > 1 ? "s" : "") + ")</div></div>";
    h += '<div class="nc-report">' + k("Matchs", r.played, r.played ? r.wins + (r.wins > 1 ? " victoires, " : " victoire, ") + r.losses + (r.losses > 1 ? " défaites" : " défaite") : "") + k("Victoires", r.winPct != null ? r.winPct + " %" : "–", r.played ? "Points : " + r.pf + " pour, " + r.pa + " contre" : "") +
      k("Joueurs utilisés", r.playersUsed, "") + k("Nouveaux internationaux", r.newInternationals, (r.newNames || []).slice(0, 6).map(esc).join(", ")) + "</div>";
    h += '<div class="nc-card" style="margin-top:12px"><div class="nc-sec"><span>Compétitions</span></div>' + (r.seasonsDetail || []).map(function (s) {
      var comp = s.comp === "continental" ? "Compétition continentale" : s.comp === "world" ? "Coupe du monde" : "Compétition";
      return '<div class="nc-slot"><span class="nc-grow">Saison ' + esc(s.season) + " · " + comp + "</span>" +
        (s.comp === "continental" && s.qualified != null ? '<span class="nc-tag ' + (s.qualified ? "ok" : "bad") + '">Qualification : ' + (s.qualified ? "oui" : "non") + "</span>" : "") +
        (s.tournament && s.tournament.rank ? '<span class="nc-tag ok">' + esc(s.tournament.label) + " : " + esc(s.tournament.stage) + "</span>" : s.tournament ? '<span class="nc-tag ok">' + esc(s.tournament.label) + " en cours</span>" : '<span class="nc-club">à venir</span>') + "</div>";
    }).join("") + (r.bestFinish ? '<p class="nc-small">Meilleur résultat : ' + esc(r.bestFinish) + "</p>" : "") + "</div>";
    if (r.results && r.results.length) h += '<div class="nc-card" style="margin-top:12px"><div class="nc-sec"><span>Principaux résultats</span></div>' + r.results.map(function (m) {
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
    syncModeChrome();
    // Rapport Scouting Pro : placement adaptatif des blocs (comme le club).
    var sp = document.getElementById("ncScoutingPanel");
    if (sp && g("sp2WatchMasonry")) { try { window.sp2WatchMasonry(sp); } catch (e) { /* mise en page par défaut */ } }
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
    var p = api(path, body).then(function (d) { if (d.team) ui.view = d; ui.error = ""; if (okMsg) toast(okMsg); }).catch(function (e) { ui.error = e.message; }).then(function () { ui.busy = false; paint(); });
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
  function collectOrders() {
    var d = ui.draft;
    var orders = JSON.parse(JSON.stringify(d));
    orders.offensivePriorities = (d.offensivePriorities || []).filter(Boolean);
    orders.watchAssignments = (d.watchAssignments || []).filter(function (w) { return w && w.position && w.focus; });
    var L = orders.lineup;
    var mins = {};
    Object.keys(d.__mins || {}).forEach(function (nid) {
      var n = d.__mins[nid];
      if (n === "" || n == null) return;
      var pos = null;
      POS.forEach(function (p) { if (String(L.starters[p]) === String(nid)) pos = p; });
      pos = pos || (L.backupPositions[nid] || [])[0];
      if (!pos) return;
      mins[pos] = mins[pos] || {};
      mins[pos][nid] = Number(n);
    });
    if (d.__mins) L.minutes = Object.keys(mins).length ? mins : undefined;
    delete orders.__mins; delete orders.updatedAt;
    return orders;
  }
  function onClick(e) {
    if (!ui.mode) return;
    var b = e.target.closest ? e.target.closest("button,input[type=checkbox],th[data-nc-sort]") : null;
    if (!b) return;
    var d = b.dataset;
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
    if (d.ncSheet) {
      var dd = draftOrders(ui.view), nid = Number(d.ncSheet), L = dd.lineup;
      L.convoked = (L.convoked || []).filter(function (x) { return x !== nid; });
      if (b.checked) L.convoked.push(nid);
      else { POS.forEach(function (p) { if (L.starters[p] === nid) L.starters[p] = null; }); delete L.backupPositions[nid]; }
      paint();
      return;
    }
    if (d.ncOwnAnalysis) { ui.anaSelf = true; paint(); return; }
    // « Appliquer à ma tactique » (équivalent de « Appliquer à mes ordres »
    // du club) : le Plan de match (scoutingGamePlanPatch, recalculé au
    // clic) écrit dans la tactique de la sélection, puis la rubrique Tactique.
    if (d.ncApplyPlan) {
      var fb = document.getElementById("scoutingApplyOrdresFeedback");
      var plan = ui.anaTeam && g("scoutingGamePlanPatch") ? window.scoutingGamePlanPatch(ui.anaTeam, ui.view.tactics) : null;
      if (!plan || !ui.view.tactics) { if (fb) fb.textContent = t("Pas encore assez de données sur cet adversaire pour préremplir votre tactique."); return; }
      var orders = JSON.parse(JSON.stringify(ui.view.tactics));
      Object.keys(plan.patch).forEach(function (k) { orders[k] = plan.patch[k]; });
      delete orders.updatedAt;
      post("/api/national/coach/tactics", { orders: orders }, "Plan de match appliqué à la tactique de la sélection. Vérifiez-la.").then(function () {
        if (ui.error) return;
        ui.draft = null; ui.nav = "tactique"; paint();
      });
      return;
    }
    if (d.ncSaveTactics) { post("/api/national/coach/tactics", { orders: collectOrders() }, "Tactique de la sélection enregistrée.").then(function () { if (!ui.error) ui.draft = null; paint(); }); return; }
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
    if (d.ncStaffInvite) { post("/api/national/coach/staff/invite", { mid: d.ncStaffInvite, role: d.ncRole }, "Invitation envoyée."); return; }
    if (d.ncStaffRemove) {
      if (!window.confirm(t("Retirer ce membre du staff ?"))) return;
      post("/api/national/coach/staff/remove", { mid: d.ncStaffRemove }, "Staff mis à jour.");
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
      var p = api("/api/national/coach?id=" + encodeURIComponent(ui.teamId) + (ui.opp ? "&opp=" + encodeURIComponent(ui.opp) : "")).then(function (d) { ui.view = d; }).catch(function (err) { ui.error = err.message; }).then(paint);
      window.__lastNationalCoach = p;
      return;
    }
    var dd = draftOrders(ui.view);
    if (ds.ncMin) { dd.__mins = dd.__mins || {}; dd.__mins[ds.ncMin] = el.value; return; }
    var name = ds.ncSet;
    if (!name) return;
    var v = el.value, parts = name.split(":");
    if (parts[0] === "offense") { dd.offensivePriorities = dd.offensivePriorities || []; dd.offensivePriorities[Number(parts[1])] = v || null; }
    else if (parts[0] === "starter") {
      var nid = v === "" ? null : Number(v);
      POS.forEach(function (pp) { if (nid != null && dd.lineup.starters[pp] === nid) dd.lineup.starters[pp] = null; });
      dd.lineup.starters[parts[1]] = nid;
      if (nid != null) delete dd.lineup.backupPositions[nid];
    } else if (parts[0] === "backup") { if (v) dd.lineup.backupPositions[parts[1]] = [v]; else delete dd.lineup.backupPositions[parts[1]]; }
    else if (parts[0] === "watchPos") { var i = Number(parts[1]); dd.watchAssignments[i] = v ? { position: v, focus: (dd.watchAssignments[i] && dd.watchAssignments[i].focus) || ui.view.options.watchFocus[0] } : null; }
    else if (parts[0] === "watchFocus") { var j = Number(parts[1]); if (dd.watchAssignments[j]) dd.watchAssignments[j].focus = v; }
    else dd[parts[0]] = v;
    paint();
  }
  function onInput(e) {
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
      mine = (d.mandates || []).map(function (m) { return Object.assign({ role: "coach" }, m); })
        .concat((d.staffRoles || []).map(function (s) { return { teamId: s.teamId, label: s.label, country: s.country, role: s.role, unread: 0 }; }));
      ensureModeCss();
      syncModeButton();
      var saved = lsGet();
      if (saved && myMandate(saved)) { if (ui.mode !== saved) enterMode(saved); }
      else { if (saved) lsSet(null); if (ui.mode) exitMode(); }
    }).catch(function () { /* hors ligne ou monde absent */ });
  }
  function bind() {
    var holder = document.getElementById("nationalContent");
    if (!holder || holder.__ncBound) return;
    holder.__ncBound = true;
    holder.addEventListener("click", onModeClick, true);
    // Menu latéral du mode (hors de #nationalContent) et bouton d'entrée du
    // tableau de bord / de la page Sélections.
    document.addEventListener("click", function (e) {
      var enter = e.target.closest && e.target.closest("[data-nc-enter]");
      if (enter) { e.preventDefault(); e.stopPropagation(); ensureModeCss(); enterMode(enter.dataset.ncEnter); return; }
      if (ui.mode && e.target.closest && e.target.closest("#ncSidebar")) onModeClick(e);
    }, true);
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
    dashButtonHtml: dashButtonHtml, state: ui,
    // Ancien point d'entrée (« Gérer la sélection ») : ouvre le mode.
    open: function (id) { bind(); return enterMode(id); },
  };
})();
