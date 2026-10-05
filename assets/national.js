/* Sélections nationales — interface (2026-10-05, phase A : élections et
   mandats). Fichier à part pour ne pas alourdir moteurbasket3.html (limite
   de taille de la page, voir load_size_test.js). Côté serveur :
   server/nationalTeams.js et les routes /api/national/*.

   Page « Sélections » (barre latérale) :
   - mes mandats (démission) ;
   - élections en cours et résultats récents (cartes) ;
   - tableau des 17 pays : sélectionneur A / U21, fin de mandat, intérim ;
   - page d'une élection : étapes, candidats et projets, vote, candidature.
   Utilise les fonctions globales de la page : fetchApi, escapeHtml,
   nationFlagHtml, formatDuration, showToast, showTeamDetail,
   showForeignTeamDetail. Aucun emoji (drapeaux en images). */
(function () {
  "use strict";
  var DAY = 24 * 3600 * 1000;
  var ui = { overview: null, election: null, electionId: null, error: "", busy: false, formOpen: false, holder: null };

  var CSS = [
    ".nt-sub{color:var(--ink-dim);margin:-4px 0 14px;font-size:13.5px}",
    ".nt-h{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-dim);margin:22px 0 10px;font-weight:800}",
    ".nt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}",
    ".nt-card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;min-width:0}",
    ".nt-card.is-mine{border-color:var(--amber)}",
    ".nt-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.nt-sp{flex:1}",
    ".nt-card .nat-flag,.nt-table .nat-flag,.nt-head .nat-flag{width:24px;height:16px;border-radius:3px;object-fit:cover;vertical-align:-3px;box-shadow:0 0 0 1px rgba(255,255,255,.15)}",
    ".nt-head .nat-flag{width:36px;height:24px}",
    ".nt-tag{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:6px;white-space:nowrap}",
    ".nt-t-cand{background:rgba(111,182,255,.15);color:#6FB6FF}.nt-t-vote{background:rgba(240,162,60,.16);color:var(--amber)}.nt-t-res{background:rgba(79,209,139,.14);color:#4FD18B}.nt-t-none{background:rgba(154,168,189,.14);color:var(--ink-dim)}",
    ".nt-small{font-size:12.5px;color:var(--ink-dim);margin:8px 0}",
    ".nt-btn{background:var(--amber);color:#1A0F02;font-weight:800;border-radius:8px;padding:7px 12px;font-size:13px;border:0;cursor:pointer}",
    ".nt-btn2{background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer}",
    ".nt-btn:disabled,.nt-btn2:disabled{opacity:.55;cursor:default}",
    ".nt-link{background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(154,168,189,.4);text-underline-offset:2px}",
    ".nt-tablewrap{overflow-x:auto;padding:0}",
    ".nt-table{width:100%;border-collapse:collapse;min-width:560px}",
    ".nt-table td,.nt-table th{padding:9px 10px;border-top:1px solid var(--line);text-align:left;font-size:13px;vertical-align:middle}",
    ".nt-table th{color:var(--ink-dim);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-top:0}",
    ".nt-table tr.is-mine td{background:rgba(240,162,60,.06)}",
    ".nt-coach{font-weight:700}.nt-cpu{color:var(--ink-faint);font-style:italic}",
    ".nt-cand{border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:10px;background:var(--panel-2)}",
    ".nt-cand.is-win{border-color:#4FD18B}.nt-cand.is-out{opacity:.55}",
    ".nt-cand b{font-size:15px}.nt-quote{font-style:italic;margin:6px 0}",
    ".nt-cand details summary{cursor:pointer;color:var(--ink-dim);font-size:12.5px}",
    ".nt-project{white-space:pre-wrap;margin:8px 0 0;font-size:13.5px;line-height:1.45}",
    ".nt-steps{display:flex;gap:6px;margin:12px 0 4px;flex-wrap:wrap}",
    ".nt-step{flex:1;min-width:110px;text-align:center;padding:7px;border-radius:8px;background:var(--panel-2);font-size:12px;color:var(--ink-dim)}",
    ".nt-step.on{background:var(--amber);color:#1A0F02;font-weight:800}.nt-step.done{color:#4FD18B}",
    ".nt-form{display:flex;flex-direction:column;gap:8px;margin-top:12px}",
    ".nt-form input,.nt-form textarea{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px}",
    ".nt-form textarea{min-height:140px;resize:vertical}",
    ".nt-mine-badge{font-size:11px;font-weight:800;color:var(--amber);text-transform:uppercase;letter-spacing:.05em}",
    ".nt-bar{height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin-top:6px}.nt-bar i{display:block;height:100%;background:var(--amber)}",
    ".nt-err{color:var(--danger,#e2694f);font-size:13px;margin:8px 0}",
    ".nt-chips{display:flex;flex-wrap:wrap;gap:8px}",
    ".nt-chip{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer}",
    ".nt-chip .nat-flag{width:20px;height:14px;border-radius:2px;object-fit:cover}.nt-chip .nt-small{margin:0}",
    ".nt-rules{font-size:12.5px;color:var(--ink-dim);line-height:1.5;margin-top:18px}",
  ].join("\n");

  function g(name) { return typeof window[name] === "function" ? window[name] : null; }
  function esc(s) { var f = g("escapeHtml"); return f ? f(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function flag(code) { var f = g("nationFlagHtml"); return f ? f(code) : ""; }
  function dur(ms) { var f = g("formatDuration"); return f ? f(ms) : Math.ceil(ms / DAY) + " j"; }
  function when(ts) {
    try { return new Date(ts).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  // Fenêtres de confirmation (hors DOM, donc hors traduction automatique).
  function t(msg) { return window.hmI18n && typeof window.hmI18n.t === "function" ? window.hmI18n.t(msg) : msg; }
  function toast(msg) { var f = g("showToast"); if (f) f(msg); }
  function ensureCss() {
    if (document.getElementById("ntCss")) return;
    var s = document.createElement("style");
    s.id = "ntCss"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Libellés.
  function catLabel(cat) { return cat === "U21" ? "U21" : "A"; }
  function teamName(t) { return (t.countryName || "") + " " + catLabel(t.cat); }
  // Nom du pays dans son propre nœud (traduit tel quel), catégorie à côté.
  function teamNameHtml(t) { return "<span>" + esc(t.countryName || "") + "</span> <span>" + esc(catLabel(t.cat)) + "</span>"; }
  // Cycle (2 saisons = un mandat) : compétition continentale, puis Coupe
  // du monde (qualifiés au classement continental) ou tournoi consolante.
  function phaseLabel(ph) {
    if (!ph) return "";
    return ph.kind === "world" ? "Coupe du monde ou consolante" : "compétition continentale";
  }
  function statusTag(el) {
    if (!el) return "";
    if (el.status === "candidacy") return '<span class="nt-tag nt-t-cand">Candidatures ouvertes</span>';
    if (el.status === "vote") return '<span class="nt-tag nt-t-vote">Vote ouvert</span>';
    if (el.status === "closed") return '<span class="nt-tag nt-t-res">Résultat</span>';
    if (el.status === "noCandidate") return '<span class="nt-tag nt-t-none">Sans candidat</span>';
    if (el.status === "cancelled") return '<span class="nt-tag nt-t-none">Annulée</span>';
    return "";
  }
  function teamById(id) { return ui.overview && (ui.overview.teams || []).find(function (t) { return t.id === id; }) || null; }
  function myCountry() { return ui.overview && ui.overview.me ? ui.overview.me.country : null; }
  function clubBtn(ref, pseudo, clubName) {
    // Sans pseudo (compte sans nom de manager) : le club seul.
    if (!pseudo && clubName) {
      if (!ref || ref.leagueId == null) return '<span class="nt-coach">' + esc(clubName) + "</span>";
      return '<button type="button" class="nt-link nt-coach" data-nt-club="' + esc(ref.leagueId) + "|" + esc(ref.idx) + '">' + esc(clubName) + "</button>";
    }
    var who = '<span class="nt-coach">' + esc(pseudo || "") + "</span>";
    if (!ref || ref.leagueId == null) return who + (clubName ? ' <span class="nt-small">· ' + esc(clubName) + "</span>" : "");
    return who + (clubName ? ' <span class="nt-small">· <button type="button" class="nt-link" data-nt-club="' + esc(ref.leagueId) + "|" + esc(ref.idx) + '">' + esc(clubName) + "</button></span>" : "");
  }
  function winnerOf(el) {
    if (!el || !el.result || !el.result.winnerId) return null;
    return (el.candidates || []).find(function (c) { return c.id === el.result.winnerId; }) || null;
  }

  // --- Page « Sélections » ------------------------------------------------
  function votersTxt(n) { return n === 1 ? "1 votant" : n + " votants"; }
  function ballotsTxt(n) { return n <= 1 ? n + " vote exprimé" : n + " votes exprimés"; }
  function candCount(n) { return n === 0 ? "aucun candidat" : n === 1 ? "1 candidat" : n + " candidats"; }
  function electionCard(el, now) {
    var t = teamById(el.teamId) || { countryName: "", cat: el.cat };
    var me = el.me || {};
    var n = (el.candidates || []).length;
    var info = "", btns = "";
    if (el.status === "candidacy") {
      info = "Candidatures jusqu'au " + esc(when(el.voteAt)) + " · " + candCount(n);
      if (me.candidateId) btns += '<span class="nt-mine-badge">Vous êtes candidat</span>';
      else if (me.canRun) btns += '<button type="button" class="nt-btn" data-nt-open="' + esc(el.id) + '" data-nt-run="1">Se présenter</button>';
      btns += '<button type="button" class="nt-btn2" data-nt-open="' + esc(el.id) + '">Voir l\'élection</button>';
    } else if (el.status === "vote") {
      info = "Vote jusqu'au " + esc(when(el.closesAt)) + " · " + candCount(n);
      if (me.votedFor) info += " · vous avez voté";
      else if (me.canVote) info += " · vous pouvez voter";
      btns += '<button type="button" class="' + (me.canVote && !me.votedFor ? "nt-btn" : "nt-btn2") + '" data-nt-open="' + esc(el.id) + '">' + (me.canVote && !me.votedFor ? "Voter" : "Lire les projets") + "</button>";
    } else {
      var w = winnerOf(el);
      info = w ? "Nouveau sélectionneur : <b>" + esc(w.pseudo) + "</b> · " + esc(el.result.counts && el.result.counts[0] ? el.result.counts[0].votes : 0) + " voix sur " + esc(votersTxt(el.result.voters || 0)) : "Aucun candidat élu";
      btns += '<button type="button" class="nt-btn2" data-nt-open="' + esc(el.id) + '">Voir le résultat</button>';
    }
    var mine = el.country === myCountry();
    return '<div class="nt-card' + (mine ? " is-mine" : "") + '"><div class="nt-row">' + flag(el.country) + "<b>" + teamNameHtml(t) + '</b><span class="nt-sp"></span>' + statusTag(el) + "</div>" +
      '<p class="nt-small">' + info + '</p><div class="nt-row">' + btns + "</div></div>";
  }
  function coachCell(t, season) {
    if (t.coach) return { who: clubBtn(t.coach.ref, t.coach.pseudo, t.coach.clubName), end: "Saison " + esc(t.coach.toSeason) };
    if (t.election) return { who: '<button type="button" class="nt-link nt-cpu" data-nt-open="' + esc(t.election.id) + '">Élection en cours</button>', end: "–" };
    return { who: '<span class="nt-cpu">Intérim (IA)</span>', end: '<span class="nt-small">Élection saison ' + esc(t.nextElectionSeason) + "</span>" };
  }
  function overviewHtml() {
    var ov = ui.overview, now = Date.now();
    if (!ov) return '<p class="training-empty">' + (ui.error ? esc(ui.error) : "Chargement des sélections…") + "</p>";
    var h = "";
    var nCountries = {}, phA = null, phU = null;
    (ov.teams || []).forEach(function (t) { nCountries[t.country] = 1; if (t.cat === "A" && t.phase) phA = t.phase; if (t.cat === "U21" && t.phase) phU = t.phase; });
    h += '<p class="nt-sub">' + Object.keys(nCountries).length + " pays · saison " + esc(ov.season) + "</p>";
    if (phA || phU) h += '<p class="nt-sub">' + (phA ? "Sélections A : " + esc(phaseLabel(phA)) : "") + (phA && phU ? " · " : "") + (phU ? "U21 : " + esc(phaseLabel(phU)) : "") + "</p>";
    if (ui.error) h += '<p class="nt-err">' + esc(ui.error) + "</p>";
    // Mes mandats.
    var active = ov.me && (ov.me.myMandates || []).filter(function (m) { return !m.endedAt; });
    if (active && active.length) {
      h += '<div class="nt-h">Mon mandat</div><div class="nt-grid">';
      active.forEach(function (m) {
        var t = teamById(m.teamId) || { countryName: "", cat: "" };
        h += '<div class="nt-card is-mine"><div class="nt-row">' + flag(t.country) + "<b>Sélectionneur · " + teamNameHtml(t) + "</b></div>" +
          '<p class="nt-small">Mandat de la saison ' + esc(m.fromSeason) + " à la saison " + esc(m.toSeason) + " · élu avec " + esc(m.votes || 0) + " voix</p>" +
          '<div class="nt-row"><button type="button" class="nt-btn2" data-nt-resign="' + esc(m.teamId) + '">Démissionner</button></div></div>';
      });
      h += "</div>";
    }
    // Élections en cours + résultats récents (son pays d'abord).
    var mc = myCountry();
    var els = (ov.teams || []).map(function (t) { return t.election; }).filter(Boolean);
    var recent = (ov.recentResults || []).filter(function (r) { return !els.some(function (e) { return e.id === r.id; }); });
    var all = els.concat(recent).sort(function (a, b) {
      return (b.country === mc) - (a.country === mc) || (a.status === "closed") - (b.status === "closed") || String(a.teamId).localeCompare(String(b.teamId));
    });
    h += '<div class="nt-h">Élections</div>';
    // Cartes : son pays, les élections où l'on est candidat / a voté, les
    // résultats récents ; les autres pays en liste compacte.
    var big = all.filter(function (el) { var m = el.me || {}; return el.country === mc || m.candidateId || m.votedFor || el.status === "closed"; });
    var small = all.filter(function (el) { return big.indexOf(el) < 0; });
    if (big.length) h += '<div class="nt-grid">' + big.map(function (el) { return electionCard(el, now); }).join("") + "</div>";
    if (small.length) {
      h += '<p class="nt-small" style="margin-top:12px">Élections en cours dans les autres pays (tout manager peut s\'y présenter) :</p><div class="nt-chips">' +
        small.map(function (el) { var t = teamById(el.teamId) || { countryName: el.country, cat: el.cat }; return '<button type="button" class="nt-chip" data-nt-open="' + esc(el.id) + '">' + flag(el.country) + " " + teamNameHtml(t) + ' <span class="nt-small">' + (el.status === "vote" ? "vote" : "candidatures") + " · " + esc(candCount((el.candidates || []).length)) + "</span></button>"; }).join("") + "</div>";
    }
    if (!all.length) {
      var nextA = null, nextU = null;
      (ov.teams || []).forEach(function (t) {
        if (t.cat === "A" && (nextA == null || t.nextElectionSeason < nextA)) nextA = t.nextElectionSeason;
        if (t.cat === "U21" && (nextU == null || t.nextElectionSeason < nextU)) nextU = t.nextElectionSeason;
      });
      h += '<p class="training-empty">Aucune élection en cours. Prochaines élections : sélections A saison ' + esc(nextA) + ", U21 saison " + esc(nextU) + ", pendant la première semaine de la saison.</p>";
    }
    // Tableau des pays.
    var byCountry = {};
    (ov.teams || []).forEach(function (t) { (byCountry[t.country] = byCountry[t.country] || { name: t.countryName, code: t.country })[t.cat] = t; });
    var rows = Object.keys(byCountry).map(function (k) { return byCountry[k]; }).sort(function (a, b) { return (b.code === mc) - (a.code === mc) || String(a.name).localeCompare(String(b.name), "fr"); });
    h += '<div class="nt-h">Sélections</div><div class="nt-card nt-tablewrap"><table class="nt-table"><thead><tr><th>Pays</th><th>Sélection A</th><th>Fin du mandat</th><th>Sélection U21</th><th>Fin du mandat</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var a = r.A ? coachCell(r.A, ov.season) : { who: "–", end: "–" };
      var u = r.U21 ? coachCell(r.U21, ov.season) : { who: "–", end: "–" };
      h += '<tr class="' + (r.code === mc ? "is-mine" : "") + '"><td>' + flag(r.code) + " " + esc(r.name) + "</td><td>" + a.who + "</td><td>" + a.end + "</td><td>" + u.who + "</td><td>" + u.end + "</td></tr>";
    });
    h += "</tbody></table></div>";
    // Anciens sélectionneurs.
    var hist = (ov.history || []).slice(-12).reverse();
    if (hist.length) {
      h += '<div class="nt-h">Anciens sélectionneurs</div><div class="nt-card nt-tablewrap"><table class="nt-table"><thead><tr><th>Sélection</th><th>Sélectionneur</th><th>Saisons</th><th>Fin</th></tr></thead><tbody>';
      hist.forEach(function (m) {
        var t = teamById(m.teamId) || { countryName: m.teamId, cat: "" };
        h += "<tr><td>" + flag(t.country) + " " + teamNameHtml(t) + "</td><td>" + clubBtn(m.ref, m.pseudo, m.clubName) + "</td><td>" + esc(m.fromSeason) + " – " + esc(m.toSeason) + "</td><td>" + esc(endReasonLabel(m.endReason)) + "</td></tr>";
      });
      h += "</tbody></table></div>";
    }
    h += '<p class="nt-rules">Chaque pays a deux sélections, A et U21 (joueurs de 21 ans au plus), élues des saisons différentes. L\'élection a lieu pendant la première semaine de la saison : 3 jours de candidatures, puis 3 jours de vote. Tout manager peut se présenter dans le pays de son choix ; seuls les managers d\'un club du pays votent, une fois, sans retour en arrière. Le mandat dure 2 saisons : la première se termine par la compétition continentale (Euro, AmeriCup, Coupe d\'Asie), jouée à l\'intersaison ; son classement qualifie pour la Coupe du monde, jouée le dimanche pendant la seconde saison (tournoi consolante pour les non-qualifiés). Sans sélectionneur, la sélection est dirigée par intérim jusqu\'à l\'élection suivante.</p>';
    return h;
  }
  function endReasonLabel(r) {
    return { term: "Fin du mandat", resigned: "Démission", dismissed: "Destitution", inactive: "Inactivité", clubLost: "Club quitté" }[r] || "";
  }

  // --- Page d'une élection --------------------------------------------------
  function electionHtml() {
    var el = ui.election, now = Date.now();
    var back = '<button type="button" class="lg-back" data-nt-back>← Sélections nationales</button>';
    if (!el) return back + '<p class="training-empty">' + (ui.error ? esc(ui.error) : "Chargement de l'élection…") + "</p>";
    var t = teamById(el.teamId) || { countryName: el.country, cat: el.cat };
    var me = el.me || {};
    var h = back;
    h += '<div class="nt-card" style="margin-top:10px"><div class="nt-row nt-head">' + flag(el.country) + '<div><b style="font-size:18px">' + teamNameHtml(t) + " — <span>Élection du sélectionneur</span></b>" +
      '<div class="nt-small" style="margin:2px 0 0">Mandat : saison ' + esc(el.mandate ? el.mandate.fromSeason : "") + " → saison " + esc(el.mandate ? el.mandate.toSeason : "") + "</div><div class=\"nt-small\" style=\"margin:2px 0 0\">Saison " + esc(el.mandate ? el.mandate.fromSeason : "") + " : compétition continentale · saison " + esc(el.mandate ? el.mandate.toSeason : "") + " : Coupe du monde ou consolante</div></div></div>";
    // Étapes.
    var st = el.status, closed = !(st === "candidacy" || st === "vote");
    function stp(label, state) { return '<span class="nt-step ' + state + '">' + label + "</span>"; }
    h += '<div class="nt-steps">' +
      stp(st === "candidacy" ? "Candidatures · " + esc(dur(el.voteAt - now)) : "Candidatures", st === "candidacy" ? "on" : "done") +
      stp(st === "vote" ? "Vote ouvert · " + esc(dur(el.closesAt - now)) : "Vote", st === "vote" ? "on" : closed && st === "closed" ? "done" : "") +
      stp("Résultat", st === "closed" ? "on" : "") + stp("Mandat", "") + "</div>";
    if (st === "candidacy") h += '<p class="nt-small">Candidatures jusqu\'au ' + esc(when(el.voteAt)) + ", puis vote jusqu'au " + esc(when(el.closesAt)) + ".</p>";
    else if (st === "vote") h += '<p class="nt-small">Vote jusqu\'au ' + esc(when(el.closesAt)) + " · " + esc(ballotsTxt(el.voterCount || 0)) + ".</p>";
    if (ui.error) h += '<p class="nt-err">' + esc(ui.error) + "</p>";
    // Résultat.
    var counts = {};
    if (el.result && el.result.counts) el.result.counts.forEach(function (c) { counts[c.id] = c.votes; });
    if (st === "closed") {
      var w = winnerOf(el);
      h += '<p class="nt-small">' + (w ? "Élu : <b>" + esc(w.pseudo) + "</b>" + (el.result.tie ? " (égalité, départagé selon le règlement)" : "") + " · " + esc(votersTxt(el.result.voters || 0)) : "Aucun élu.") + "</p>";
    } else if (st === "noCandidate") h += '<p class="nt-small">Aucun candidat : la sélection est dirigée par intérim jusqu\'à la prochaine élection.</p>';
    else if (st === "cancelled") h += '<p class="nt-small">Élection annulée par l\'administration.</p>';
    // Candidats.
    var cands = (el.candidates || []).slice();
    if (st === "closed") cands.sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0); });
    if (!cands.length && !closed) h += '<p class="training-empty">Aucun candidat pour l\'instant.</p>';
    var maxV = Math.max.apply(null, [1].concat(Object.keys(counts).map(function (k) { return counts[k]; })));
    cands.forEach(function (c) {
      var isWin = el.result && el.result.winnerId === c.id;
      var right = "";
      if (c.withdrawn) right = '<span class="nt-small">Candidature retirée</span>';
      else if (st === "vote" && me.votedFor === c.id) right = '<span class="nt-mine-badge">Votre vote</span>';
      else if (st === "vote" && me.canVote && !me.votedFor) right = '<button type="button" class="nt-btn" data-nt-vote="' + esc(c.id) + '" data-nt-name="' + esc(c.pseudo || c.clubName || "") + '">Voter</button>';
      else if (st === "closed") right = "<b>" + esc(counts[c.id] || 0) + "</b> voix";
      if (me.candidateId === c.id && !closed) right += ' <button type="button" class="nt-btn2" data-nt-withdraw="1">Retirer ma candidature</button>';
      h += '<div class="nt-cand' + (isWin ? " is-win" : "") + (c.withdrawn ? " is-out" : "") + '"><div class="nt-row"><span>' + flag(c.country) + " " + clubBtn(c.ref, c.pseudo, c.clubName) + (c.division ? ' <span class="nt-small">(' + esc(c.division) + ")</span>" : "") + '</span><span class="nt-sp"></span>' + right + "</div>" +
        '<div class="nt-quote">« ' + esc(c.title) + " »</div>" +
        (c.project ? "<details><summary>Voir le projet complet</summary><p class=\"nt-project\">" + esc(c.project) + "</p></details>" : "") +
        (st === "closed" ? '<div class="nt-bar"><i style="width:' + Math.round(100 * (counts[c.id] || 0) / maxV) + '%"></i></div>' : "") + "</div>";
    });
    // Candidature.
    if (st === "candidacy" && me.canRun && !me.candidateId) {
      if (ui.formOpen) {
        h += '<form class="nt-form" data-nt-form><b>Ma candidature · ' + teamNameHtml(t) + "</b>" +
          '<input name="title" maxlength="90" placeholder="Titre de votre projet (une phrase)" required>' +
          '<textarea name="project" maxlength="2000" placeholder="Votre projet : style de jeu, joueurs, objectifs (20 caractères au moins)" required></textarea>' +
          '<div class="nt-row"><button type="submit" class="nt-btn"' + (ui.busy ? " disabled" : "") + '>Déposer ma candidature</button><button type="button" class="nt-btn2" data-nt-cancel-form>Annuler</button></div></form>';
      } else h += '<div class="nt-row" style="margin-top:12px"><button type="button" class="nt-btn" data-nt-show-form>Se présenter</button></div>';
    }
    if (!closed) {
      var voters = me.canVote ? "Vous faites partie des électeurs." : "Vous ne votez pas dans ce pays (seuls les managers d'un club du pays votent).";
      h += '<p class="nt-small" style="margin-top:12px">Un seul vote, définitif. ' + voters + "</p>";
    }
    h += "</div>";
    return h;
  }

  // --- Rendu / données ------------------------------------------------------
  function paint() {
    var holder = document.getElementById("nationalContent");
    if (!holder) return;
    holder.innerHTML = ui.electionId ? electionHtml() : overviewHtml();
  }
  function api(path, body) {
    var f = g("fetchApi");
    if (!f) return Promise.reject(new Error("Hors ligne."));
    var opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    return f(path, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || "Sélections nationales indisponibles pour l'instant.");
        return data;
      });
    });
  }
  function loadOverview() {
    return api("/api/national/overview").then(function (d) { ui.overview = d; ui.error = ""; }).catch(function (e) { ui.error = e.message; });
  }
  function loadElection(id) {
    return api("/api/national/election?id=" + encodeURIComponent(id)).then(function (d) { ui.election = d.election; ui.error = ""; }).catch(function (e) { ui.error = e.message; });
  }
  function render() {
    ensureCss();
    ui.electionId = null; ui.election = null; ui.formOpen = false;
    paint();
    var p = loadOverview().then(paint);
    window.__lastNational = p;
    return p;
  }
  function openElection(id, wantForm) {
    ensureCss();
    ui.electionId = id; ui.election = null; ui.formOpen = !!wantForm; ui.error = "";
    paint();
    var p = Promise.all([ui.overview ? null : loadOverview(), loadElection(id)]).then(paint);
    window.__lastNational = p;
    return p;
  }
  function act(path, body, okMsg) {
    if (ui.busy) return Promise.resolve();
    ui.busy = true;
    return api(path, body).then(function (d) {
      if (d.overview) ui.overview = d.overview;
      ui.error = "";
      if (okMsg) toast(okMsg);
      return ui.electionId ? loadElection(ui.electionId) : null;
    }).catch(function (e) { ui.error = e.message; }).then(function () { ui.busy = false; paint(); });
  }
  function openClub(lid, idx) {
    var lg = window.league || (typeof league !== "undefined" ? league : null);
    if (lg && lg.leagueId === lid && g("showTeamDetail")) { window.showTeamDetail(idx); return; }
    if (g("showForeignTeamDetail")) window.showForeignTeamDetail(lid, idx);
  }

  function onClick(e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    var d = b.dataset;
    if (d.ntOpen) { openElection(d.ntOpen, d.ntRun === "1"); return; }
    if (d.ntBack !== undefined) { render(); return; }
    if (d.ntClub) { var p = d.ntClub.split("|"); openClub(p[0], Number(p[1])); return; }
    if (d.ntShowForm !== undefined) { ui.formOpen = true; paint(); return; }
    if (d.ntCancelForm !== undefined) { ui.formOpen = false; paint(); return; }
    if (d.ntVote) {
      if (!window.confirm(t("Voter pour " + d.ntName + " ? Le vote est définitif."))) return;
      act("/api/national/vote", { electionId: ui.electionId, candidateId: d.ntVote }, "Vote enregistré.");
      return;
    }
    if (d.ntWithdraw) {
      if (!window.confirm(t("Retirer votre candidature ?"))) return;
      act("/api/national/withdraw", { electionId: ui.electionId }, "Candidature retirée.");
      return;
    }
    if (d.ntResign) {
      if (!window.confirm(t("Démissionner de votre poste de sélectionneur ? La sélection passera en intérim jusqu'à la prochaine élection."))) return;
      act("/api/national/resign", { teamId: d.ntResign }, "Démission enregistrée.");
    }
  }
  function onSubmit(e) {
    var f = e.target;
    if (!f || !f.matches || !f.matches("[data-nt-form]")) return;
    e.preventDefault();
    var el = ui.election;
    if (!el) return;
    act("/api/national/candidacy", { teamId: el.teamId, title: f.elements.title.value, project: f.elements.project.value }, "Candidature déposée.").then(function () {
      if (!ui.error) ui.formOpen = false;
      paint();
    });
  }
  function bind() {
    var holder = document.getElementById("nationalContent");
    if (!holder || holder.__ntBound) return;
    holder.__ntBound = true;
    holder.addEventListener("click", onClick);
    holder.addEventListener("submit", onSubmit);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();

  window.HM_NATIONAL = { render: function () { bind(); return render(); }, openElection: function (id) { bind(); return openElection(id); }, state: ui, overviewHtml: overviewHtml, electionHtml: electionHtml };
})();
