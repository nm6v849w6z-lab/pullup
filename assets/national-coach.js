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
    var h = headHtml(v) + tabsHtml(v);
    if (ui.error) h += '<p class="nc-err">' + esc(ui.error) + "</p>";
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
    holder.innerHTML = html();
  }

  // --- Données / actions ----------------------------------------------------
  function load() {
    return api("/api/national/coach?id=" + encodeURIComponent(ui.teamId)).then(function (d) { ui.view = d; ui.error = ""; }).catch(function (e) { ui.error = e.message; });
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
    holder.addEventListener("click", onClick);
    holder.addEventListener("change", onChange);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();

  window.HM_NATIONAL_COACH = { open: function (id, tab) { bind(); return open(id, tab); }, state: ui, html: html };
})();
