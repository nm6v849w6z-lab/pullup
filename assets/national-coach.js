/* Sélections nationales — espace du sélectionneur (phase B, 2026-10-05).
   Fichier à part (limite de taille de la page, voir load_size_test.js).
   Côté serveur : server/nationalCoach.js, routes /api/national/coach*.

   Réservé au sélectionneur en poste, ouvert par « Gérer la sélection » sur
   la page de sa sélection (assets/national.js). Rubriques :
   - Joueurs sélectionnables : tous les éligibles (GEN, caractéristiques,
     forme, état physique, stats et 5 derniers matchs en club ; jamais
     salaire, contrat ni potentiel), filtres par poste ;
   - Présélection (24 au plus) et Joueurs suivis ;
   - Convocations : un rassemblement par fenêtre internationale et un pour
     la phase finale, 15 joueurs au plus, liste figée 3 jours avant le
     premier match (ensuite : remplacer un joueur indisponible seulement) ;
   - Tactique : propre à la sélection (réglages des Ordres des clubs), 12
     joueurs par match pris parmi les 15 convoqués.
   Ces écrans deviendront les rubriques du mode Sélectionneur (phase E).
   Aucun emoji : pictogrammes SVG, drapeaux en images. */
(function () {
  "use strict";
  var DAY = 24 * 3600 * 1000;
  var POS = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
  var POS_SHORT = { "Meneur": "MEN", "Arrière": "ARR", "Ailier shooteur": "AIS", "Ailier fort": "AIF", "Pivot": "PIV" };
  var ATTR_LABELS = [["midRange", "Mi-distance"], ["threePoint", "3 points"], ["inside", "Intérieur"], ["pass", "Passe"], ["rebound", "Rebond"], ["block", "Contre"], ["dribble", "Dribble"], ["agility", "Agilité"], ["defOutside", "Déf. extérieure"], ["defInside", "Déf. intérieure"]];
  var WATCH_LABELS = { denyPostUp: "Empêcher le post-up", denyDrive: "Coller sur les pénétrations", harassOutsideShot: "Harceler le tir extérieur", reboundPriority: "Priorité au rebond", denyEntry: "Couper du ballon" };
  var ui = { teamId: null, view: null, tab: "joueurs", pos: "", filter: "", shown: 40, gid: null, error: "", busy: false, open: null, replaceOut: null, draft: null };

  var ICON = {
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  };
  function icon(name, fill) { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="' + (fill ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + "</svg>"; }

  var CSS = [
    ".nc-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:6px 0 14px}",
    ".nc-head .nat-flag{width:36px;height:24px;border-radius:4px;object-fit:cover;box-shadow:0 0 0 1px rgba(255,255,255,.15)}",
    ".nc-head h1{margin:0;font-size:22px}.nc-sub{color:var(--ink-dim);font-size:13px}",
    ".nc-pill{padding:5px 11px;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);font-size:12px;color:var(--ink-dim);white-space:nowrap}",
    ".nc-pill.am{color:var(--amber);border-color:rgba(240,162,60,.45)}.nc-head .nc-pill{margin-left:auto}",
    ".nc-tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:16px;overflow-x:auto}",
    ".nc-tab{background:none;border:0;border-bottom:2px solid transparent;color:var(--ink-dim);font:inherit;font-weight:700;padding:10px 14px;cursor:pointer;white-space:nowrap}",
    ".nc-tab.on{color:var(--ink);border-color:var(--amber)}.nc-tab b{color:var(--ink-faint);font-size:12px;margin-left:6px}",
    ".nc-grid{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;align-items:start}",
    "@media(max-width:1100px){.nc-grid{grid-template-columns:minmax(0,1fr)}}",
    ".nc-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0}",
    ".nc-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}",
    ".nc-f{padding:6px 11px;border-radius:8px;background:var(--panel-2);border:1px solid var(--line);color:var(--ink-dim);font:inherit;font-size:12.5px;cursor:pointer}",
    ".nc-f.on{color:var(--ink);border-color:var(--amber)}",
    ".nc-scroll{overflow-x:auto}",
    ".nc-table{width:100%;border-collapse:collapse;font-size:13px;min-width:700px}",
    ".nc-table td.nc-act{white-space:nowrap;width:1%;padding-right:0}",
    ".nc-table th{color:var(--ink-faint);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;text-align:center;padding:6px 4px;border-bottom:1px solid var(--line);white-space:nowrap}",
    ".nc-table td{padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.04);text-align:center;font-variant-numeric:tabular-nums}",
    ".nc-table .l{text-align:left}.nc-nm{font-weight:700;background:none;border:0;padding:0;color:var(--ink);font:inherit;font-weight:700;cursor:pointer;text-align:left}",
    ".nc-club{color:var(--ink-dim);font-size:12px}",
    ".nc-gen{display:inline-block;min-width:30px;padding:2px 6px;border-radius:6px;background:rgba(79,209,139,.14);color:#4FD18B;font-weight:800}",
    ".nc-bar{width:54px;height:6px;border-radius:3px;background:rgba(255,255,255,.08);display:inline-block;vertical-align:middle;overflow:hidden}.nc-bar i{display:block;height:100%}",
    ".nc-form span{display:inline-block;width:7px;height:16px;margin:0 1px;border-radius:2px;vertical-align:middle;background:rgba(255,255,255,.08)}",
    ".nc-ic{width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2);display:inline-grid;place-items:center;color:var(--ink-dim);cursor:pointer;padding:0;margin:0 1px}",
    ".nc-ic.on-watch{color:var(--amber);border-color:rgba(240,162,60,.5)}.nc-ic.on-pre{color:#4FD18B;border-color:rgba(79,209,139,.5)}.nc-ic.on-conv{color:#6FB6FF;border-color:rgba(111,182,255,.55)}",
    ".nc-ic:disabled{opacity:.4;cursor:default}",
    ".nc-sec{display:flex;justify-content:space-between;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);margin:2px 0 8px}",
    ".nc-next{padding:10px 12px;border-radius:10px;background:rgba(111,182,255,.08);border:1px solid rgba(111,182,255,.3);margin-bottom:12px;font-size:13px}",
    ".nc-slot{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:9px;background:var(--panel-2);margin-bottom:6px;font-size:13px}",
    ".nc-slot .nc-pos{width:32px;font-size:11px;font-weight:800;color:var(--ink-dim)}.nc-slot .nc-grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".nc-slot.empty{background:none;border:1px dashed var(--line);color:var(--ink-faint)}",
    ".nc-tag{font-size:11px;padding:2px 7px;border-radius:6px;white-space:nowrap}.nc-tag.ok{background:rgba(79,209,139,.12);color:#4FD18B}.nc-tag.bad{background:rgba(226,105,79,.15);color:#E2694F}",
    ".nc-btn{background:var(--amber);color:#1A0F02;font-weight:800;border-radius:9px;padding:9px 14px;font:inherit;font-weight:800;border:0;cursor:pointer}",
    ".nc-btn2{background:transparent;border:1px solid rgba(240,162,60,.5);color:var(--amber);border-radius:8px;padding:5px 9px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}",
    ".nc-btn:disabled,.nc-btn2:disabled{opacity:.5;cursor:default}",
    ".nc-small{font-size:12px;color:var(--ink-faint);margin:8px 0 0}",
    ".nc-err{color:#E2694F;font-size:13px;margin:8px 0}",
    ".nc-gath{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:16px}",
    ".nc-g{text-align:left;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px 12px;color:var(--ink);font:inherit;cursor:pointer}",
    ".nc-g.on{border-color:var(--amber)}.nc-g.past{opacity:.6}.nc-g b{display:block;font-size:13.5px}.nc-g span{font-size:12px;color:var(--ink-dim)}",
    ".nc-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}@media(max-width:900px){.nc-two{grid-template-columns:minmax(0,1fr)}}",
    ".nc-set{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px 14px}",
    ".nc-set label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--ink-dim);font-weight:700}",
    ".nc-set select,.nc-sheet select,.nc-sheet input{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:7px 8px;font:inherit;font-size:13px}",
    ".nc-sheet{width:100%;border-collapse:collapse;font-size:13px}.nc-sheet td,.nc-sheet th{padding:6px;border-bottom:1px solid rgba(255,255,255,.05);text-align:left}",
    ".nc-sheet th{font-size:11px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em}.nc-sheet input[type=number]{width:62px}",
    ".nc-detail{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 14px;margin:6px 0 2px;font-size:12px;color:var(--ink-dim)}",
    ".nc-detail b{color:var(--ink)}",
  ].join("\n");

  function g(name) { return typeof window[name] === "function" ? window[name] : null; }
  function esc(s) { var f = g("escapeHtml"); return f ? f(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function flag(code) { var f = g("nationFlagHtml"); return f ? f(code) : ""; }
  function t(msg) { return window.hmI18n && typeof window.hmI18n.t === "function" ? window.hmI18n.t(msg) : msg; }
  function toast(msg) { var f = g("showToast"); if (f) f(t(msg)); }
  function when(ts, withHour) {
    try { return new Date(ts).toLocaleString("fr-FR", withHour ? { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" } : { weekday: "long", day: "numeric", month: "long" }); } catch (e) { return ""; }
  }
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
        if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || "Espace du sélectionneur indisponible pour l'instant.");
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
  function compLabel(gg) {
    if (!gg) return "";
    if (gg.kind === "final") return gg.label;
    return gg.label + (gg.comp === "continental" ? " · qualifications continentales" : gg.comp === "world" ? " · qualifications Coupe du monde" : "");
  }
  function statusTag(st, x, gg) {
    if (st === "injured") return '<span class="nc-tag bad">Blessé' + (x && x.injuryUntil ? " " + Math.max(1, Math.ceil((x.injuryUntil - Date.now()) / DAY)) + " j" : "") + "</span>";
    if (st === "ineligible") return '<span class="nc-tag bad">Plus éligible</span>';
    return '<span class="nc-tag ok">Apte</span>';
  }
  function condColor(c) { return c >= 80 ? "#4FD18B" : c >= 60 ? "var(--amber)" : "#E2694F"; }
  function effColor(e) { return e >= 15 ? "#4FD18B" : e >= 7 ? "var(--amber)" : "#E2694F"; }

  // --- Rendu ------------------------------------------------------------------
  function headHtml(v) {
    var m = v.mandate, cur = curGathering();
    var seasonNo = m ? Math.min(2, Math.max(1, v.season - m.fromSeason + 1)) : 1;
    var pill = "";
    if (cur && !cur.frozen) pill = '<span class="nc-pill am">Convocations à finaliser avant ' + esc(when(cur.freezeAt, true)) + "</span>";
    else if (cur && cur.frozen) pill = '<span class="nc-pill">' + icon("lock") + " Liste figée · " + esc(cur.label) + "</span>";
    return '<button type="button" class="lg-back" data-nt-team="' + esc(v.team.id) + '">← ' + esc(v.team.label) + "</button>" +
      '<div class="nc-head">' + flag(v.team.country) + '<div><h1>' + esc(v.team.label) + " · Gestion de la sélection</h1>" +
      '<div class="nc-sub">Mandat : saison ' + seasonNo + " / 2 (saisons " + esc(m.fromSeason) + " à " + esc(m.toSeason) + ")</div></div>" + pill + "</div>";
  }
  function tabsHtml(v) {
    var cur = curGathering();
    var tabs = [
      ["joueurs", "Joueurs sélectionnables", v.pool ? v.pool.eligible : 0],
      ["preselection", "Présélection", (v.preselection.length) + " / " + v.limits.preselection],
      ["convocations", "Convocations", (cur ? cur.players.length : 0) + " / " + v.limits.convocation],
      ["suivis", "Joueurs suivis", v.watchlist.length],
      ["tactique", "Tactique", null],
    ];
    return '<div class="nc-tabs">' + tabs.map(function (x) {
      return '<button type="button" class="nc-tab' + (ui.tab === x[0] ? " on" : "") + '" data-nc-tab="' + x[0] + '">' + x[1] + (x[2] != null ? "<b>" + esc(x[2]) + "</b>" : "") + "</button>";
    }).join("") + "</div>";
  }
  function formBars(x) {
    var l = x.last5 || [];
    var out = "";
    for (var i = 0; i < 5; i++) {
      var e = l[l.length - 5 + i];
      out += e ? '<span style="background:' + effColor(e.eff) + '" title="' + esc((e.opp ? "vs " + e.opp + " : " : "") + e.pts + " pts, " + e.reb + " reb, " + e.ast + " pd, éval. " + e.eff) + '"></span>' : "<span></span>";
    }
    return out;
  }
  function actionsHtml(x, v) {
    var r = { p: x.p, n: x.n }, cur = curGathering();
    var w = inList(v.watchlist, r), p = inList(v.preselection, r), c = cur && inList(convRefs(cur), r);
    var canConv = cur && !cur.frozen && (c || cur.players.length < v.limits.convocation);
    return '<button type="button" class="nc-ic' + (w ? " on-watch" : "") + '" data-nc-list="watchlist" data-nc-on="' + (w ? 0 : 1) + '" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '" title="' + (w ? "Ne plus suivre" : "Suivre ce joueur") + '">' + icon("star", w) + "</button>" +
      '<button type="button" class="nc-ic' + (p ? " on-pre" : "") + '" data-nc-list="preselection" data-nc-on="' + (p ? 0 : 1) + '" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '" title="' + (p ? "Retirer de la présélection" : "Ajouter à la présélection") + '">' + icon("check") + "</button>" +
      '<button type="button" class="nc-ic' + (c ? " on-conv" : "") + '" data-nc-conv="' + (c ? 0 : 1) + '" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '"' + (canConv ? "" : " disabled") + ' title="' + (!cur ? "Aucun rassemblement à venir" : cur.frozen ? "Liste figée" : !canConv ? "15 joueurs déjà convoqués" : c ? "Retirer des convoqués" : "Convoquer") + '">' + icon(c ? "cross" : "plus") + "</button>";
  }
  function playerRows(list, v) {
    if (!list.length) return '<tr><td colspan="12" class="l nc-club">Aucun joueur.</td></tr>';
    return list.map(function (x) {
      var open = ui.open === key(x);
      var row = '<tr><td class="l"><button type="button" class="nc-nm" data-nc-detail="' + esc(key(x)) + '">' + esc(x.name) + '</button><div class="nc-club">' + esc(x.club.name) + (x.club.division ? " · " + esc(x.club.division) : "") + "</div></td>" +
        "<td>" + esc(x.age) + "</td><td>" + esc(POS_SHORT[x.position] || x.position) + "</td><td>" + (x.height ? (x.height / 100).toFixed(2).replace(".", ",") : "–") + "</td>" +
        '<td><span class="nc-gen">' + esc(x.ovr) + "</span></td><td>" + esc(x.season.pts) + "</td><td>" + esc(x.season.reb) + "</td><td>" + esc(x.season.ast) + "</td><td>" + esc(x.season.gp) + "</td>" +
        '<td title="État physique ' + esc(x.condition) + '/100' + (x.injuryUntil ? " · blessé" : "") + '">' + (x.injuryUntil ? '<span class="nc-tag bad">Blessé</span>' : '<span class="nc-bar"><i style="width:' + Math.max(4, x.condition || 0) + "%;background:" + condColor(x.condition || 0) + '"></i></span>') + "</td>" +
        '<td class="nc-form">' + formBars(x) + '</td><td class="nc-act">' + actionsHtml(x, v) + "</td></tr>";
      if (open) {
        row += '<tr><td colspan="12" class="l"><div class="nc-detail">' + ATTR_LABELS.map(function (a) { return "<span>" + a[1] + " <b>" + esc(x.attrs && x.attrs[a[0]] != null ? x.attrs[a[0]] : "–") + "</b></span>"; }).join("") +
          "<span>Minutes <b>" + esc(x.season.min) + "</b></span><span>Éval. moyenne <b>" + esc(x.season.eff) + "</b></span></div>" +
          '<button type="button" class="nc-btn2" data-nc-profile="' + esc(x.club.leagueId + "|" + x.club.idx + "|" + x.p) + '">Fiche du joueur</button></td></tr>';
      }
      return row;
    }).join("");
  }
  function tableHtml(list, v, withFilters) {
    var h = "";
    if (withFilters) {
      h += '<div class="nc-filters"><button type="button" class="nc-f' + (!ui.pos ? " on" : "") + '" data-nc-pos="">Tous les postes</button>' +
        POS.map(function (p) { return '<button type="button" class="nc-f' + (ui.pos === p ? " on" : "") + '" data-nc-pos="' + esc(p) + '">' + esc(p) + "</button>"; }).join("") +
        '<button type="button" class="nc-f' + (ui.filter === "dispo" ? " on" : "") + '" data-nc-filter="dispo">Disponibles</button>' +
        '<button type="button" class="nc-f' + (ui.filter === "u23" ? " on" : "") + '" data-nc-filter="u23">23 ans et moins</button></div>';
      list = list.filter(function (x) { return (!ui.pos || x.position === ui.pos) && (ui.filter !== "dispo" || !x.injuryUntil) && (ui.filter !== "u23" || x.age <= 23); });
    }
    var total = list.length;
    if (withFilters) list = list.slice(0, ui.shown);
    return h + '<div class="nc-scroll"><table class="nc-table"><thead><tr><th class="l">Joueur</th><th>Âge</th><th>Poste</th><th>Taille</th><th>GEN</th><th>Pts</th><th>Reb</th><th>Pd</th><th>MJ</th><th>Forme</th><th>5 derniers</th><th></th></tr></thead><tbody>' +
      playerRows(list, v) + "</tbody></table></div>" +
      (withFilters && total > list.length ? '<div style="text-align:center;margin-top:10px"><button type="button" class="nc-btn2" data-nc-more="1">Afficher plus (' + (total - list.length) + " joueurs)</button></div>" : "") +
      '<p class="nc-small">GEN, caractéristiques, forme et état physique : visibles du sélectionneur seulement. Jamais le salaire, le contrat ni le potentiel. 5 derniers : évaluation des matchs en club (vert bon, orange moyen, rouge faible). Stats de la saison en club, mises à jour toutes les heures.</p>';
  }
  function sideHtml(v) {
    var cur = curGathering(), pm = poolByKey();
    if (!cur) return '<div class="nc-card"><p class="nc-club">Aucun rassemblement à venir cette saison.</p></div>';
    var h = '<div class="nc-card"><div class="nc-next"><b>' + esc(compLabel(cur)) + '</b><br><span class="nc-club">' +
      (cur.kind === "window" ? esc(when(cur.startAt, true)) : "Du " + esc(when(cur.startAt)) + " au " + esc(when(cur.endAt))) + "</span><br>" +
      '<span class="nc-club">' + (cur.frozen ? icon("lock") + " Liste figée" : "Liste modifiable jusqu'au " + esc(when(cur.freezeAt, true))) + "</span></div>" +
      '<div class="nc-sec"><span>Convoqués</span><span>' + cur.players.length + " / " + v.limits.convocation + "</span></div>";
    cur.players.forEach(function (c) {
      var x = pm[key(c.ref)];
      h += '<div class="nc-slot"><span class="nc-pos">' + esc(x ? POS_SHORT[x.position] : "–") + '</span><span class="nc-grow">' + esc(c.ref.n) + "</span>" + statusTag(c.status, x, cur) +
        (!cur.frozen ? '<button type="button" class="nc-ic" data-nc-conv="0" data-nc-p="' + esc(c.ref.p) + '" data-nc-n="' + esc(c.ref.n) + '" title="Retirer">' + icon("cross") + "</button>" :
          c.status !== "ok" ? '<button type="button" class="nc-btn2" data-nc-replace="' + esc(key(c.ref)) + '">Remplacer</button>' : "") + "</div>";
    });
    for (var i = cur.players.length; i < v.limits.convocation; i++) h += '<div class="nc-slot empty"><span class="nc-pos">–</span><span class="nc-grow">' + "Place libre" + "</span></div>";
    if (ui.replaceOut) h += replaceHtml(v, cur);
    h += '<p class="nc-small">' + (cur.frozen ? "Liste figée 3 jours avant le premier match : seul un joueur blessé ou devenu inéligible peut être remplacé. Pour chaque match, choisissez 12 joueurs parmi ces 15 dans Tactique." :
      "Au gel de la liste (3 jours avant le premier match), les places libres sont complétées (présélection d'abord) et chaque manager de club concerné est prévenu.") + "</p></div>";
    return h;
  }
  function replaceHtml(v, cur) {
    var pm = poolByKey(), conv = convRefs(cur);
    var cands = ((v.pool && v.pool.players) || []).filter(function (x) { return !inList(conv, x) && !x.injuryUntil; });
    cands.sort(function (a, b) { return (inList(v.preselection, b) - inList(v.preselection, a)) || b.ovr - a.ovr; });
    var out = pm[ui.replaceOut];
    return '<div class="nc-next" style="margin-top:10px"><b>Remplacer ' + esc(ui.replaceOut.split("|").slice(1).join("|")) + "</b>" + (out ? " (" + esc(out.position) + ")" : "") +
      '<div style="display:flex;gap:8px;margin-top:8px"><select id="ncReplaceIn" style="flex:1;background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:6px">' +
      cands.slice(0, 60).map(function (x) { return '<option value="' + esc(key(x)) + '">' + esc(x.name + " · " + (POS_SHORT[x.position] || x.position) + " · GEN " + x.ovr + (inList(v.preselection, x) ? " · présélection" : "")) + "</option>"; }).join("") +
      '</select><button type="button" class="nc-btn2" data-nc-replace-go="1">Valider</button><button type="button" class="nc-ic" data-nc-replace-cancel="1" title="Annuler">' + icon("cross") + "</button></div></div>";
  }
  function refsToPlayers(list) {
    var pm = poolByKey();
    return list.map(function (r) { return pm[key(r)] || null; }).filter(Boolean).sort(function (a, b) { return POS.indexOf(a.position) - POS.indexOf(b.position) || b.ovr - a.ovr; });
  }
  function missingNote(list) {
    var pm = poolByKey(), miss = list.filter(function (r) { return !pm[key(r)]; });
    return miss.length ? '<p class="nc-small">' + miss.length + " joueur" + (miss.length > 1 ? "s" : "") + " de la liste ne " + (miss.length > 1 ? "sont" : "est") + " plus sélectionnable" + (miss.length > 1 ? "s" : "") + " : " + miss.map(function (r) { return esc(r.n); }).join(", ") + ".</p>" : "";
  }
  function convocationsHtml(v) {
    var h = '<div class="nc-gath">' + v.gatherings.map(function (x) {
      var on = (ui.gid || v.currentGid) === x.gid;
      return '<button type="button" class="nc-g' + (on ? " on" : "") + (x.past ? " past" : "") + '" data-nc-gid="' + esc(x.gid) + '"><b>' + esc(x.label) + "</b><span>" + esc(x.kind === "window" ? when(x.startAt, true) : "Du " + when(x.startAt) + " au " + when(x.endAt)) + "</span><br><span>" +
        (x.past ? "Terminé" : x.frozen ? "Liste figée · " + x.players.length + " convoqués" : "Ouverte · " + x.players.length + " / " + v.limits.convocation) + "</span></button>";
    }).join("") + "</div>";
    var cur = curGathering();
    if (!cur) return h + '<p class="nc-club">Aucun rassemblement cette saison.</p>';
    var conv = convRefs(cur);
    var pre = refsToPlayers(v.preselection).filter(function (x) { return !inList(conv, x); });
    h += '<div class="nc-two"><div>' + sideHtml(v) + "</div><div class=\"nc-card\"><div class=\"nc-sec\"><span>Présélection à convoquer</span><span>" + pre.length + "</span></div>";
    if (!pre.length) h += '<p class="nc-club">' + (v.preselection.length ? "Toute la présélection est convoquée." : "Présélection vide : ajoutez des joueurs depuis Joueurs sélectionnables.") + "</p>";
    pre.forEach(function (x) {
      h += '<div class="nc-slot"><span class="nc-pos">' + esc(POS_SHORT[x.position]) + '</span><span class="nc-grow">' + esc(x.name) + ' <span class="nc-club">· GEN ' + esc(x.ovr) + "</span></span>" + (x.injuryUntil ? statusTag("injured", x) : "") +
        (!cur.frozen ? '<button type="button" class="nc-ic" data-nc-conv="1" data-nc-p="' + esc(x.p) + '" data-nc-n="' + esc(x.n) + '" title="Convoquer"' + (conv.length >= v.limits.convocation ? " disabled" : "") + ">" + icon("plus") + "</button>" : "") + "</div>";
    });
    if (cur.changes && cur.changes.length) {
      h += '<div class="nc-sec" style="margin-top:14px"><span>Remplacements</span></div>' + cur.changes.map(function (c) {
        return '<div class="nc-slot">' + icon("swap") + '<span class="nc-grow">' + esc(c.in.n) + " remplace " + esc(c.out.n) + ' <span class="nc-club">(' + (c.reason === "injured" ? "blessé" : "plus éligible") + ")</span></span></div>";
      }).join("");
    }
    return h + "</div></div>";
  }
  // --- Tactique -----------------------------------------------------------
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
      h += '<p class="nc-small" style="margin:0 0 8px">' + (cur && cur.players.length ? "Les " + roster.length + " convoqués de « " + esc(cur.label) + " » : cochez les 12 du match." : "Pas encore de convoqués : la tactique se prépare avec la présélection.") + "</p>";
      h += '<div class="nc-scroll"><table class="nc-sheet"><thead><tr><th></th><th>Joueur</th><th>Poste</th><th>Titulaire</th><th>Remplaçant à</th><th>Minutes</th></tr></thead><tbody>';
      roster.forEach(function (x) {
        var on = sheet.indexOf(x.nid) >= 0;
        h += "<tr><td><input type=\"checkbox\" data-nc-sheet=\"" + x.nid + "\"" + (on ? " checked" : "") + (!on && sheet.length >= v.limits.matchSquad ? " disabled" : "") + "></td>" +
          "<td>" + esc(x.ref.n) + (x.p && x.p.injuryUntil ? ' <span class="nc-tag bad">Blessé</span>' : "") + "</td><td>" + esc(x.p ? POS_SHORT[x.p.position] : "–") + "</td>" +
          "<td>" + esc(startOf[x.nid] || "") + "</td>" +
          "<td>" + (on && !startOf[x.nid] ? sel("backup:" + x.nid, [["", "Auto"]].concat(POS.map(function (p) { return [p, p]; })), (d.lineup.backupPositions[x.nid] || [])[0] || "") : "") + "</td>" +
          "<td>" + (on ? '<input type="number" min="0" max="40" data-nc-min="' + x.nid + '" value="' + esc(minsOf(x.nid)) + '" placeholder="auto">' : "") + "</td></tr>";
      });
      h += "</tbody></table></div>";
      h += '<div class="nc-sec" style="margin-top:14px"><span>Cinq majeur</span></div><div class="nc-set">' + POS.map(function (p) {
        return "<label>" + esc(p) + sel("starter:" + p, [["", "Aucun"]].concat(onSheet.map(function (x) { return [x.nid, x.ref.n + (x.p ? " (" + POS_SHORT[x.p.position] + ")" : "")]; })), d.lineup.starters[p] != null ? d.lineup.starters[p] : "") + "</label>";
      }).join("") + "</div>";
    }
    h += "</div><div class=\"nc-card\"><div class=\"nc-sec\"><span>Systèmes de jeu</span></div><div class=\"nc-set\">";
    for (var i = 0; i < o.maxOffense; i++) h += "<label>Priorité offensive " + (i + 1) + sel("offense:" + i, (i ? [["", "Aucune"]] : []).concat(o.offense.map(function (x) { return [x, x]; })), (d.offensivePriorities || [])[i] || "") + "</label>";
    h += "<label>Défense" + sel("defense", o.defense, d.defense) + "</label><label>Rythme" + sel("rhythm", o.rhythm, d.rhythm) + "</label>" +
      "<label>Défense sur écrans" + sel("screenDefense", o.screenDefense, d.screenDefense) + "</label><label>Aide défensive" + sel("helpDefense", o.helpDefense, d.helpDefense) + "</label>" +
      "<label>Défense au poste" + sel("postDefense", o.postDefense, d.postDefense) + "</label><label>Sortie sur le tireur" + sel("closeoutStyle", o.closeoutStyle, d.closeoutStyle) + "</label>" +
      "<label>Rebond offensif" + sel("offRebStyle", o.offRebStyle, d.offRebStyle) + "</label><label>Fin de match" + sel("endgameManagement", o.endgameManagement, d.endgameManagement) + "</label>" +
      "<label>Niveau tactique" + sel("tacticalTier", [["débutant", "Débutant"], ["confirmée", "Confirmée"]], d.tacticalTier) + "</label></div>";
    h += '<div class="nc-sec" style="margin-top:14px"><span>Consignes individuelles (marquage)</span><span>' + d.watchAssignments.length + " / " + o.maxWatch + "</span></div><div class=\"nc-set\">";
    for (var w = 0; w < o.maxWatch; w++) {
      var wa = d.watchAssignments[w] || {};
      h += "<label>Consigne " + (w + 1) + sel("watchPos:" + w, [["", "Aucune"]].concat(POS.map(function (p) { return [p, "Sur le " + p.toLowerCase()]; })), wa.position || "") +
        (wa.position ? sel("watchFocus:" + w, o.watchFocus.map(function (f) { return [f, WATCH_LABELS[f] || f]; }), wa.focus || o.watchFocus[0]) : "") + "</label>";
    }
    h += '</div><div style="display:flex;gap:10px;align-items:center;margin-top:16px"><button type="button" class="nc-btn" data-nc-save-tactics="1"' + (ui.busy ? " disabled" : "") + ">Enregistrer la tactique</button>" +
      '<span class="nc-small" style="margin:0">' + (v.tactics && v.tactics.updatedAt ? "Enregistrée le " + esc(when(v.tactics.updatedAt, true)) : "Pas encore enregistrée") + "</span></div>" +
      '<p class="nc-small">Tactique propre à la sélection, sans lien avec celle de votre club. Mêmes réglages que les Ordres d\'un club ; minutes laissées vides = rotation automatique.</p></div></div>';
    return h;
  }
  function html() {
    var v = ui.view;
    if (!v) return '<p class="training-empty">' + (ui.error ? esc(ui.error) : "Chargement de l'espace du sélectionneur…") + "</p>";
    return headHtml(v) + tabsHtml(v) + bodyHtml(v);
  }
  // Contenu d'une rubrique (page « Gérer la sélection » et mode Sélectionneur).
  function bodyHtml(v) {
    var h = ui.error ? '<p class="nc-err">' + esc(ui.error) + "</p>" : "";
    var players = (v.pool && v.pool.players) || [];
    if (!v.pool) return h + '<div class="nc-card"><p class="nc-club">Vivier en cours de préparation (calculé au prochain passage du monde, quelques minutes au plus).</p></div>';
    if (ui.tab === "convocations") return h + convocationsHtml(v);
    if (ui.tab === "tactique") return h + tactiqueHtml(v);
    var body;
    if (ui.tab === "preselection") body = '<div class="nc-card"><div class="nc-sec"><span>Présélection</span><span>' + v.preselection.length + " / " + v.limits.preselection + "</span></div>" + tableHtml(refsToPlayers(v.preselection), v, false) + missingNote(v.preselection) + "</div>";
    else if (ui.tab === "suivis") body = '<div class="nc-card"><div class="nc-sec"><span>Joueurs suivis</span><span>' + v.watchlist.length + " / " + v.limits.watchlist + "</span></div>" + tableHtml(refsToPlayers(v.watchlist), v, false) + missingNote(v.watchlist) + "</div>";
    else body = '<div class="nc-card">' + tableHtml(players, v, true) + "</div>";
    return h + '<div class="nc-grid">' + body + sideHtml(v) + "</div>";
  }
  function paint() {
    var holder = document.getElementById("nationalContent");
    if (!holder || !ui.teamId) return;
    holder.innerHTML = ui.mode ? modeHtml() : html();
    if (ui.mode) syncModeChrome();
  }

  // --- Données / actions ----------------------------------------------------
  function load() {
    var a = api("/api/national/coach?id=" + encodeURIComponent(ui.teamId)).then(function (d) { ui.view = d; ui.error = ""; }).catch(function (e) { ui.error = e.message; });
    // Mode Sélectionneur : page de la sélection aussi (calendrier, qualifications, phase finale).
    var b = ui.mode ? api("/api/national/team?id=" + encodeURIComponent(ui.teamId)).then(function (d) { ui.tv = d; }).catch(function () { /* rubriques sans données */ }) : null;
    return Promise.all([a, b]);
  }
  function open(teamId, tab) {
    ensureCss();
    ui.teamId = teamId; ui.view = null; ui.tab = tab || "joueurs"; ui.gid = null; ui.error = ""; ui.open = null; ui.replaceOut = null; ui.draft = null;
    // national.js garde la main sur la page : son état d'équipe est vidé
    // pour qu'un retour (« ← France A ») recharge la page de la sélection.
    if (window.HM_NATIONAL && window.HM_NATIONAL.state) window.HM_NATIONAL.state.coachOpen = teamId;
    paint();
    var p = load().then(paint);
    window.__lastNationalCoach = p;
    return p;
  }
  function post(path, body, okMsg) {
    if (ui.busy) return Promise.resolve();
    ui.busy = true;
    body.teamId = ui.teamId;
    var p = api(path, body).then(function (d) { ui.view = d; ui.error = ""; if (okMsg) toast(okMsg); }).catch(function (e) { ui.error = e.message; }).then(function () { ui.busy = false; paint(); });
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
    // Minutes : rangées sous le poste du joueur (titulaire ou remplaçant).
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
    var b = e.target.closest ? e.target.closest("button,input[type=checkbox]") : null;
    if (!b || !ui.teamId) return;
    var d = b.dataset;
    if (d.ncOpen) return; // ouverture gérée par onOpenClick
    if (d.ncTab) { ui.tab = d.ncTab; ui.replaceOut = null; paint(); return; }
    if (d.ncPos !== undefined) { ui.pos = d.ncPos; ui.shown = 40; paint(); return; }
    if (d.ncMore) { ui.shown += 40; paint(); return; }
    if (d.ncFilter) { ui.filter = ui.filter === d.ncFilter ? "" : d.ncFilter; paint(); return; }
    if (d.ncDetail) { ui.open = ui.open === d.ncDetail ? null : d.ncDetail; paint(); return; }
    if (d.ncGid) { ui.gid = d.ncGid; ui.replaceOut = null; paint(); return; }
    if (d.ncProfile) {
      var q = d.ncProfile.split("|"), lg = window.league || (typeof league !== "undefined" ? league : null);
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
    if (d.ncSaveTactics) { post("/api/national/coach/tactics", { orders: collectOrders() }, "Tactique de la sélection enregistrée.").then(function () { if (!ui.error) ui.draft = null; paint(); }); }
  }
  function onChange(e) {
    var el = e.target;
    if (!ui.teamId || !ui.view) return;
    var dd = draftOrders(ui.view);
    if (el.dataset && el.dataset.ncMin) { dd.__mins = dd.__mins || {}; dd.__mins[el.dataset.ncMin] = el.value; return; }
    var name = el.dataset && el.dataset.ncSet;
    if (!name) return;
    var v = el.value, parts = name.split(":");
    if (parts[0] === "offense") { dd.offensivePriorities = dd.offensivePriorities || []; dd.offensivePriorities[Number(parts[1])] = v || null; }
    else if (parts[0] === "starter") {
      var nid = v === "" ? null : Number(v);
      POS.forEach(function (p) { if (nid != null && dd.lineup.starters[p] === nid) dd.lineup.starters[p] = null; });
      dd.lineup.starters[parts[1]] = nid;
      if (nid != null) delete dd.lineup.backupPositions[nid];
    } else if (parts[0] === "backup") { if (v) dd.lineup.backupPositions[parts[1]] = [v]; else delete dd.lineup.backupPositions[parts[1]]; }
    else if (parts[0] === "watchPos") { var i = Number(parts[1]); dd.watchAssignments[i] = v ? { position: v, focus: (dd.watchAssignments[i] && dd.watchAssignments[i].focus) || ui.view.options.watchFocus[0] } : null; }
    else if (parts[0] === "watchFocus") { var j = Number(parts[1]); if (dd.watchAssignments[j]) dd.watchAssignments[j].focus = v; }
    else dd[parts[0]] = v;
    paint();
  }
  // =====================================================================
  // MODE SÉLECTIONNEUR (phase E) : environnement séparé du mode Club.
  // Bouton dans la barre du haut (seulement avec un mandat en cours) ; en
  // mode Sélectionneur, la barre latérale du club, la barre du haut du club
  // (budget, prochain match, ordres, recherche) et la barre d'onglets mobile
  // sont masquées : menu latéral propre, tableau de bord, notifications
  // propres (fil du mandat), bilan. Retour au mode Club par le même bouton.
  // =====================================================================
  var MODE_KEY = "hm-nat-mode";
  var mine = [];
  var NAV = [
    ["dashboard", "Tableau de bord"],
    ["#", "Effectif"],
    ["joueurs", "Joueurs sélectionnables"], ["preselection", "Présélection"], ["convoques", "Convoqués"], ["suivis", "Joueurs suivis"],
    ["#", "Sélection"],
    ["convocations", "Convocations"], ["tactique", "Tactique"], ["calendrier", "Calendrier"], ["qualifications", "Qualifications"], ["competition", "Compétition"], ["stats", "Statistiques"],
    ["#", "Sélectionneur"],
    ["notifications", "Notifications"], ["mandat", "Mandat"], ["palmares", "Palmarès"],
  ];
  var MODE_CSS = [
    "body.nc-mode #sidebar > :not(.sidebar-brand):not(#ncSidebar){display:none!important}",
    "body.nc-mode .topbar-right > :not(#ncModeBtn){display:none!important}",
    "body.nc-mode .topbar-search, body.nc-mode .topbar-left > :not(#ncTopTitle){display:none!important}",
    "body.nc-mode #mTabbar .tab-btn{display:none!important}",
    "body.nc-mode #selectionsSection .page-title{display:none}",
    "#ncTopTitle{display:flex;align-items:center;gap:10px}#ncTopTitle .nat-flag{width:28px;height:19px;border-radius:3px;object-fit:cover}#ncTopTitle b{font-size:15px}#ncTopTitle span{display:block;font-size:12px;color:var(--ink-dim)}",
    "#ncModeBtn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;border:1px solid rgba(111,182,255,.55);background:rgba(111,182,255,.12);color:var(--ink);white-space:nowrap}",
    "#ncModeBtn .nat-flag{width:22px;height:15px;border-radius:2px;object-fit:cover}#ncModeBtn.in{border-color:var(--line);background:var(--panel-2)}",
    "#ncModeBtn .nc-badge,.nc-side-link .nc-badge{min-width:18px;height:18px;border-radius:9px;background:#E2694F;color:#fff;font-size:11px;display:inline-grid;place-items:center;padding:0 5px}",
    "#ncSidebar{display:flex;flex-direction:column;gap:2px;padding:6px 10px 16px}",
    "#ncSidebar .nc-side-head{display:flex;align-items:center;gap:10px;padding:10px 8px 12px;border-bottom:1px solid var(--line);margin-bottom:8px}#ncSidebar .nc-side-head .nat-flag{width:30px;height:20px;border-radius:3px;object-fit:cover}#ncSidebar .nc-side-head b{font-size:15px}",
    "#ncSidebar .nc-side-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);padding:12px 8px 4px}",
    ".nc-side-link{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;background:none;border:0;color:var(--ink-dim);font:inherit;font-size:14px;font-weight:700;padding:8px 10px;border-radius:9px;cursor:pointer}",
    ".nc-side-link:hover{color:var(--ink);background:var(--panel-2)}.nc-side-link.on{color:var(--amber);background:rgba(240,162,60,.1);box-shadow:inset 0 0 0 1px rgba(240,162,60,.5)}.nc-side-link.hot{color:var(--ink)}",
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
  // Bouton de bascule dans la barre du haut (seulement avec un mandat).
  function syncModeButton() {
    var right = document.querySelector(".topbar-right");
    var btn = document.getElementById("ncModeBtn");
    if (!mine.length || !right) { if (btn) btn.remove(); return; }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.id = "ncModeBtn";
      right.insertBefore(btn, right.firstChild);
      btn.addEventListener("click", function () { if (ui.mode) exitMode(); else enterMode(mine[0].teamId); });
    }
    var m = mine[0], unread = ui.view && ui.mode ? ui.view.unread : m.unread;
    btn.className = ui.mode ? "in" : "";
    btn.innerHTML = ui.mode ? "← Retour au mode Club" : flag(m.country) + " Mode Sélectionneur" + (unread ? ' <span class="nc-badge">' + unread + "</span>" : "");
    btn.title = ui.mode ? "Revenir à la gestion de votre club" : "Gérer " + m.label;
  }
  function syncModeChrome() {
    syncModeButton();
    var sb = document.getElementById("sidebar");
    if (sb && !document.getElementById("ncSidebar")) { var d = document.createElement("div"); d.id = "ncSidebar"; sb.appendChild(d); }
    var side = document.getElementById("ncSidebar");
    var v = ui.view, m = myMandate(ui.mode) || {};
    var inFinals = isFinalsPeriod();
    if (side) side.innerHTML = '<div class="nc-side-head">' + flag(m.country) + "<div><b>" + esc(m.label || "") + '</b><div class="nc-club">Sélectionneur</div></div></div>' + NAV.map(function (n) {
      if (n[0] === "#") return '<div class="nc-side-label">' + esc(n[1]) + "</div>";
      var badge = n[0] === "notifications" && v && v.unread ? '<span class="nc-badge">' + v.unread + "</span>" : n[0] === "convoques" && curGathering() ? '<span class="nc-club">' + curGathering().players.length + "</span>" : "";
      return '<button type="button" class="nc-side-link' + (ui.nav === n[0] ? " on" : "") + (n[0] === "competition" && inFinals ? " hot" : "") + '" data-nc-nav="' + n[0] + '"><span>' + esc(n[1]) + (n[0] === "competition" && inFinals ? " · en cours" : "") + "</span>" + badge + "</button>";
    }).join("");
    var left = document.querySelector(".topbar-left");
    if (left && !document.getElementById("ncTopTitle")) { var tt = document.createElement("div"); tt.id = "ncTopTitle"; left.appendChild(tt); }
    var top = document.getElementById("ncTopTitle");
    if (top && v) top.innerHTML = flag(v.team.country) + "<div><b>" + esc(v.team.label) + "</b><span>Sélectionneur : " + esc(coachName(v)) + "</span></div>";
  }
  function coachName(v) { var m = v && v.mandate; return m ? (m.pseudo || (m.clubName ? "Manager de " + m.clubName : "Sélectionneur")) : ""; }
  function isFinalsPeriod() {
    var g = ((ui.view && ui.view.gatherings) || []).filter(function (x) { return x.kind === "final"; })[0];
    return !!(g && Date.now() >= g.freezeAt && Date.now() < g.endAt + DAY);
  }
  function enterMode(teamId) {
    ensureCss(); ensureModeCss();
    ui.mode = teamId; ui.nav = "dashboard"; ui.tv = null; ui.match = null;
    lsSet(teamId);
    document.body.classList.add("nc-mode");
    try { window.showPage("selectionsSection"); window.setActiveTab(""); } catch (e) { /* page sans navigation */ }
    var p = open(teamId, "joueurs");
    syncModeChrome();
    return p;
  }
  function exitMode() {
    ui.mode = null; ui.teamId = null;
    lsSet(null);
    document.body.classList.remove("nc-mode");
    ["ncSidebar", "ncTopTitle"].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
    syncModeButton();
    var h = window.TAB_HANDLERS && window.TAB_HANDLERS.club;
    if (typeof h === "function") h(); else if (typeof TAB_HANDLERS !== "undefined" && TAB_HANDLERS.club) TAB_HANDLERS.club();
  }
  var NAV_TAB = { joueurs: "joueurs", preselection: "preselection", convoques: "convocations", suivis: "suivis", convocations: "convocations", tactique: "tactique" };
  function modeHtml() {
    var v = ui.view;
    if (!v) return '<p class="training-empty">' + (ui.error ? esc(ui.error) : "Chargement de votre sélection…") + "</p>";
    var nav = ui.nav || "dashboard";
    if (nav === "match") return '<button type="button" class="lg-back" data-nc-nav="' + esc(ui.backNav || "dashboard") + '">← Retour</button>' + (ui.match ? window.HM_NATIONAL.matchSheetHtml(ui.match) : '<p class="training-empty">Chargement du match…</p>');
    if (NAV_TAB[nav]) { ui.tab = NAV_TAB[nav]; return titleHtml(nav) + bodyHtml(v); }
    if (nav === "calendrier" || nav === "qualifications" || nav === "competition" || nav === "palmares") {
      if (!ui.tv) return titleHtml(nav) + '<p class="training-empty">Chargement…</p>';
      return titleHtml(nav) + window.HM_NATIONAL.sectionHtml(ui.tv, nav === "competition" ? "finale" : nav);
    }
    if (nav === "stats") return titleHtml(nav) + statsHtml(v);
    if (nav === "notifications") return titleHtml(nav) + feedHtml(v, 40);
    if (nav === "mandat") return titleHtml(nav) + mandatHtml(v);
    return dashboardHtml(v);
  }
  function titleHtml(nav) {
    var lab = (NAV.filter(function (n) { return n[0] === nav; })[0] || [0, ""])[1];
    return '<h2 class="nc-mode-title">' + esc(lab) + "</h2>";
  }
  function nextMatch() {
    var tv = ui.tv, now = Date.now();
    var ms = [];
    if (tv && tv.qualif) tv.qualif.matches.forEach(function (m) { ms.push(m); });
    if (tv && tv.finals) tv.finals.tournaments.forEach(function (t) { t.matches.forEach(function (m) { if (m.home === tv.team.id || m.away === tv.team.id) ms.push(Object.assign({ label: t.label }, m)); }); });
    return ms.filter(function (m) { return m.status === "scheduled" && m.at > now - 3 * 3600 * 1000; }).sort(function (a, b) { return a.at - b.at; })[0] || null;
  }
  function dashboardHtml(v) {
    var tv = ui.tv, nx = nextMatch(), cur = curGathering(), r = v.report || {};
    var last = (tv && tv.results || [])[0];
    var oppOf = function (m) { return m.home === v.team.id ? m.away : m.home; };
    var lab = function (id) { return window.HM_NATIONAL && window.HM_NATIONAL.teamLabelOf ? window.HM_NATIONAL.teamLabelOf(id) : id; };
    var rank = tv && tv.qualif && tv.qualif.group ? (tv.qualif.group.standings.filter(function (s) { return s.teamId === v.team.id; })[0] || {}).rank : null;
    var seasonNo = v.mandate ? Math.min(2, Math.max(1, v.season - v.mandate.fromSeason + 1)) : 1;
    var kpi = function (k, val, sub, nav) { return '<button type="button" class="nc-card nc-kpi" style="text-align:left;cursor:pointer;color:inherit;font:inherit" data-nc-nav="' + nav + '"><div class="nc-k">' + k + '</div><div class="nc-v">' + val + '</div><div class="nc-s">' + sub + "</div></button>"; };
    var h = '<div class="nc-hero">' + flag(v.team.country) + '<div><div class="nc-club">Sélectionneur · ' + esc(coachName(v)) + "</div><h1>" + esc(v.team.label) + "</h1></div></div>";
    h += '<div class="nc-dash">';
    h += kpi("Prochain match", nx ? flag(oppOf(nx).split("-")[0]) + " " + esc(lab(oppOf(nx))) : "–", nx ? esc(nx.label || (nx.w ? "Fenêtre " + nx.w + " · qualifications" : "")) + " · " + esc(when(nx.at, true)) : "Aucun match programmé", "calendrier");
    h += kpi("Qualifications", rank ? rank + (rank === 1 ? "er" : "e") + " du groupe" : "–", tv && tv.qualif && tv.qualif.group ? esc(tv.qualif.group.label) + " · " + esc(tv.qualif.group.continent) : "Groupes à venir", "qualifications");
    h += kpi("Effectif", (cur ? cur.players.length : 0) + " convoqués", cur ? esc(cur.label) + (cur.frozen ? " · liste figée" : " · liste ouverte jusqu'au " + esc(when(cur.freezeAt))) : "Aucun rassemblement à venir", "convocations");
    h += kpi("Joueurs suivis", v.watchlist.length, v.preselection.length + " en présélection", "suivis");
    h += kpi("Mandat", "Saison " + seasonNo + " / 2", "Saisons " + esc(v.mandate.fromSeason) + " à " + esc(v.mandate.toSeason) + (r.played ? " · " + r.wins + " V – " + r.losses + " D" : ""), "mandat");
    h += kpi("Dernier résultat", last ? esc(lab(last.home)) + " " + esc(last.scoreHome) + " – " + esc(last.scoreAway) + " " + esc(lab(last.away)) : "–", last ? esc(when(last.at)) : "Aucun match joué", "calendrier");
    h += "</div>";
    h += '<div class="nc-two" style="margin-top:16px"><div class="nc-card"><div class="nc-sec"><span>Notifications</span><button type="button" class="nc-btn2" data-nc-nav="notifications">Tout voir</button></div>' + feedHtml(v, 5) + "</div>";
    h += '<div class="nc-card"><div class="nc-sec"><span>Convoqués · ' + esc(cur ? cur.label : "") + "</span><span>" + (cur ? cur.players.length : 0) + " / " + v.limits.convocation + "</span></div>" +
      (cur && cur.players.length ? cur.players.slice(0, 15).map(function (c) { return '<div class="nc-slot"><span class="nc-grow">' + esc(c.ref.n) + "</span>" + statusTag(c.status) + "</div>"; }).join("") : '<p class="nc-club">Aucun joueur convoqué pour l\'instant.</p>') + "</div></div>";
    return h;
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
    var r1 = function (x, gp) { return (Math.round((x / gp) * 10) / 10).toString().replace(".", ","); };
    return '<div class="nc-card nc-scroll"><table class="nc-table"><thead><tr><th class="l">Joueur</th><th>Club</th><th>MJ</th><th>Min</th><th>Pts</th><th>Reb</th><th>Pd</th><th>Int</th><th>Ctr</th></tr></thead><tbody>' +
      s.map(function (x) { return '<tr><td class="l"><b>' + esc(x.name) + '</b></td><td class="nc-club">' + esc(x.club || "") + "</td><td>" + x.gp + "</td><td>" + r1(x.min, x.gp) + "</td><td>" + r1(x.pts, x.gp) + "</td><td>" + r1(x.reb, x.gp) + "</td><td>" + r1(x.ast, x.gp) + "</td><td>" + r1(x.stl, x.gp) + "</td><td>" + r1(x.blk, x.gp) + "</td></tr>"; }).join("") +
      '</tbody></table></div><p class="nc-small">Moyennes par match en sélection, sous votre mandat.</p>';
  }
  function reportHtml(r, live) {
    var lab = function (id) { return window.HM_NATIONAL && window.HM_NATIONAL.teamLabelOf ? window.HM_NATIONAL.teamLabelOf(id) : id; };
    var k = function (t, v, s) { return '<div class="nc-card nc-kpi"><div class="nc-k">' + t + '</div><div class="nc-v">' + v + '</div><div class="nc-s">' + (s || "") + "</div></div>"; };
    var h = '<div class="nc-card" style="margin-bottom:12px"><b>' + (live ? "Bilan en cours" : "Bilan du mandat") + " · " + esc(r.label) + " · " + esc(r.coach) + '</b><div class="nc-club">Saisons ' + esc(r.fromSeason) + " à " + esc(r.toSeason) + " (" + r.seasons + " saison" + (r.seasons > 1 ? "s" : "") + ")</div></div>";
    h += '<div class="nc-report">' + k("Matchs", r.played, r.played ? r.wins + (r.wins > 1 ? " victoires, " : " victoire, ") + r.losses + (r.losses > 1 ? " défaites" : " défaite") : "") + k("Victoires", r.winPct != null ? r.winPct + " %" : "–", r.played ? "Points : " + r.pf + " pour, " + r.pa + " contre" : "") +
      k("Joueurs utilisés", r.playersUsed, "") + k("Nouveaux internationaux", r.newInternationals, (r.newNames || []).slice(0, 6).map(esc).join(", ")) + "</div>";
    h += '<div class="nc-card" style="margin-top:12px"><div class="nc-sec"><span>Compétitions</span></div>' + (r.seasonsDetail || []).map(function (s) {
      var comp = s.comp === "continental" ? "Compétition continentale" : s.comp === "world" ? "Coupe du monde" : "Compétition";
      return '<div class="nc-slot"><span class="nc-grow"><b>Saison ' + esc(s.season) + "</b> · " + comp + "</span>" +
        (s.comp === "continental" && s.qualified != null ? '<span class="nc-tag ' + (s.qualified ? "ok" : "bad") + '">Qualification : ' + (s.qualified ? "oui" : "non") + "</span>" : "") +
        (s.tournament && s.tournament.rank ? '<span class="nc-tag ok">' + esc(s.tournament.label) + " : " + esc(s.tournament.stage) + "</span>" : s.tournament ? '<span class="nc-tag ok">' + esc(s.tournament.label) + " en cours</span>" : '<span class="nc-club">à venir</span>') + "</div>";
    }).join("") + (r.bestFinish ? '<p class="nc-small">Meilleur résultat : ' + esc(r.bestFinish) + "</p>" : "") + '<p class="nc-small">Classement international : pas encore de classement mondial dans le jeu.</p></div>';
    if (r.results && r.results.length) h += '<div class="nc-card" style="margin-top:12px"><div class="nc-sec"><span>Principaux résultats</span></div>' + r.results.map(function (m) {
      return '<div class="nc-slot"><span class="nc-grow">' + esc(lab(m.home)) + " " + esc(m.scoreHome) + " – " + esc(m.scoreAway) + " " + esc(lab(m.away)) + ' <span class="nc-club">· ' + esc(m.label || "") + "</span></span>" + '<button type="button" class="nt-link" data-nc-match="' + esc(m.id) + '">Feuille</button></div>';
    }).join("") + "</div>";
    return h;
  }
  function mandatHtml(v) {
    var h = reportHtml(v.report || {}, true);
    (v.pastMandates || []).forEach(function (r) { h += '<div style="margin-top:22px">' + reportHtml(r, false) + "</div>"; });
    return h + '<p class="nc-small">À la fin du mandat, ce bilan est conservé dans l\'historique des sélectionneurs et affiché aux électeurs lors des élections suivantes.</p>';
  }
  function openModeMatch(id) {
    ui.backNav = ui.nav === "match" ? ui.backNav : ui.nav; ui.nav = "match"; ui.match = null; paint();
    api("/api/national/match?id=" + encodeURIComponent(id)).then(function (d) { ui.match = d.match; }).catch(function (e) { ui.error = e.message; }).then(paint);
  }
  function onModeClick(e) {
    if (!ui.mode) return;
    var b = e.target.closest ? e.target.closest("[data-nc-nav],[data-nc-match],[data-nt-match]") : null;
    if (!b) return;
    e.stopPropagation(); e.preventDefault();
    if (b.dataset.ncMatch || b.dataset.ntMatch) { openModeMatch(b.dataset.ncMatch || b.dataset.ntMatch); return; }
    ui.nav = b.dataset.ncNav; ui.replaceOut = null;
    if (ui.nav === "notifications" && ui.view && ui.view.unread) {
      ui.view.feedSeen = ui.view.feed[0] ? ui.view.feed[0].id - ui.view.unread : 0;
      api("/api/national/coach/seen", { teamId: ui.teamId }).then(function () { if (ui.view) { ui.view.unread = 0; syncModeChrome(); } }).catch(function () { /* hors ligne */ });
    }
    try { var sc = document.querySelector(".content-scroll"); if (sc) sc.scrollTop = 0; } catch (err) { /* rien */ }
    if (window.innerWidth < 900 && document.body.classList.contains("m-drawer-open")) { var c = document.querySelector("[data-m-drawer-close],.m-drawer-backdrop"); if (c) c.click(); }
    paint();
  }
  // Démarrage : mandats en cours du manager → bouton (et mode retrouvé).
  function bootMode() {
    api("/api/national/me").then(function (d) {
      mine = d.mandates || [];
      ensureModeCss();
      syncModeButton();
      var saved = lsGet();
      if (saved && myMandate(saved)) enterMode(saved);
      else if (saved) lsSet(null);
    }).catch(function () { /* hors ligne ou monde absent */ });
  }

  // « Gérer la sélection » (page de la sélection, assets/national.js).
  function onOpenClick(e) {
    var b = e.target.closest ? e.target.closest("[data-nc-open]") : null;
    if (b) { e.stopPropagation(); open(b.dataset.ncOpen); return; }
    // Retour vers la page de la sélection : l'espace du sélectionneur se ferme.
    if (e.target.closest && e.target.closest("[data-nt-team],[data-nt-back]")) ui.teamId = null;
  }
  function bind() {
    var holder = document.getElementById("nationalContent");
    if (!holder || holder.__ncBound) return;
    holder.__ncBound = true;
    holder.addEventListener("click", onOpenClick, true);
    holder.addEventListener("click", onModeClick, true);
    // Menu latéral du mode Sélectionneur (hors de #nationalContent).
    document.addEventListener("click", function (e) { if (ui.mode && e.target.closest && e.target.closest("#ncSidebar")) onModeClick(e); }, true);
    holder.addEventListener("click", onClick);
    holder.addEventListener("change", onChange);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();

  // Bouton du mode Sélectionneur : une fois le jeu chargé.
  (function waitGame(n) {
    if (window.__gameReady) { Promise.resolve(window.__gameReady).then(function () { bind(); bootMode(); }, function () { /* jeu non chargé */ }); return; }
    if (n > 600) return;
    setTimeout(function () { waitGame(n + 1); }, 500);
  })(0);
  window.HM_NATIONAL_COACH = { open: function (id, tab) { bind(); return open(id, tab); }, enterMode: function (id) { bind(); return enterMode(id); }, exitMode: exitMode, boot: bootMode, state: ui, html: html };
})();
