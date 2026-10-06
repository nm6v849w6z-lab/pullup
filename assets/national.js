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
  var ui = { overview: null, election: null, electionId: null, error: "", busy: false, formOpen: false, holder: null, teamId: null, team: null, teamTab: "apercu" };
  // Les 17 pays du jeu (une sélection A et une U21 chacun) et leur continent.
  var COUNTRIES = ["fr", "us", "it", "es", "de", "gr", "lt", "pl", "pt", "be", "ch", "br", "ar", "ca", "cn", "hk", "tw"];
  var CONTINENT = { us: "Amérique", br: "Amérique", ar: "Amérique", ca: "Amérique", cn: "Asie", hk: "Asie", tw: "Asie" };
  function continentOf(c) { return CONTINENT[c] || "Europe"; }
  function continentalComp(c) { var k = continentOf(c); return k === "Amérique" ? "AmeriCup" : k === "Asie" ? "Coupe d'Asie" : "Euro"; }

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
    ".nt-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 14px}",
    ".nt-tab{background:transparent;border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:7px 14px;font-size:12.5px;cursor:pointer}",
    ".nt-tab.on{border-color:var(--amber);color:var(--amber)}",
    ".nt-hero{border:1px solid var(--line);border-radius:18px;padding:24px 26px;display:flex;align-items:center;gap:24px;background:linear-gradient(100deg,#13306f 0%,#1b2a52 35%,var(--panel) 72%);flex-wrap:wrap}",
    ".nt-hero .nat-flag{width:120px;height:80px;border-radius:10px;object-fit:cover;box-shadow:0 0 0 2px rgba(255,255,255,.2),0 12px 30px -10px #000}",
    ".nt-kicker{font-size:11.5px;letter-spacing:.08em;color:#b8c6ee;font-weight:800;text-transform:uppercase}",
    ".nt-hero h1{font-size:36px;margin:4px 0 10px;color:#fff;line-height:1.1}",
    ".nt-pill{display:inline-block;background:rgba(255,255,255,.09);border-radius:999px;padding:4px 11px;font-size:12.5px;color:#dbe3f3;margin:0 6px 6px 0}",
    ".nt-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}",
    ".nt-two{display:grid;grid-template-columns:1.2fr 1fr;gap:12px;margin-top:12px}",
    "@media (max-width:820px){.nt-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.nt-two{grid-template-columns:1fr}.nt-hero{padding:18px}.nt-hero .nat-flag{width:84px;height:56px}.nt-hero h1{font-size:28px}}",
    ".nt-k{font-size:11.5px;letter-spacing:.08em;color:var(--ink-dim);font-weight:800;text-transform:uppercase;display:flex;gap:8px}.nt-k .nt-link{margin-left:auto;color:var(--amber);text-transform:none;letter-spacing:0;font-weight:700;text-decoration:none}",
    ".nt-big{font-size:24px;font-weight:900;margin:10px 0 4px}",
    ".nt-next{display:flex;align-items:center;gap:12px;margin-top:14px;font-size:17px;font-weight:800;flex-wrap:wrap}",
    ".nt-av{display:inline-flex;vertical-align:middle;margin-right:8px}",
    ".nt-tag2{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:6px;background:rgba(111,182,255,.15);color:#6FB6FF;white-space:nowrap}",
    ".nt-tag2.is-final{background:rgba(240,162,60,.16);color:var(--amber)}",
    ".nt-ko{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}.nt-ko:first-child{border-top:0}.nt-ko-team{min-width:150px}.nt-ko-team.is-win{font-weight:800}",
    ".nt-win{color:#4FD18B}.nt-loss{color:#E2694F}.nt-res{display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line);font-size:13.5px}.nt-res:first-child{border-top:0}",
    ".nt-eff td{white-space:nowrap}",
    ".nt-eff .eff-player .nt-link{text-decoration:none;font-weight:700}",
    ".nt-teamlinks{display:inline-flex;gap:6px;margin-left:8px}",
    ".nt-teamlink{background:var(--panel-2);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:700;cursor:pointer}",
    ".nt-chips{display:flex;flex-wrap:wrap;gap:8px}",
    ".nt-chip{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);color:var(--ink);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer}",
    ".nt-chip .nat-flag{width:20px;height:14px;border-radius:2px;object-fit:cover}.nt-chip .nt-small{margin:0}",
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
    // Staff des sélections (retour utilisateur 2026-10-06) : invitations à
    // accepter ou refuser, rôle d'adjoint / recruteur en cours.
    var meInfo = ov.me || {}, roleLab = { assistant: "Adjoint", scout: "Recruteur" };
    if ((meInfo.staffInvites || []).length || (meInfo.staffRoles || []).length) {
      h += '<div class="nt-h">Staff des sélections</div><div class="nt-grid">';
      (meInfo.staffInvites || []).forEach(function (s) {
        h += '<div class="nt-card is-mine"><div class="nt-row">' + flag(s.country) + "<b>Invitation · " + esc(roleLab[s.role] || s.role) + " de " + esc(s.label) + "</b></div>" +
          '<p class="nt-small">Proposée par ' + esc(s.coach) + ". " + (s.role === "assistant" ? "Adjoint : joueurs, présélection en consultation, tactique et préparation des matchs." : "Recruteur : joueurs, joueurs suivis et analyse des adversaires.") + "</p>" +
          '<div class="nt-row"><button type="button" class="nt-btn" data-nt-staff-accept="' + esc(s.teamId) + '">Accepter</button><button type="button" class="nt-btn2" data-nt-staff-decline="' + esc(s.teamId) + '">Refuser</button></div></div>';
      });
      (meInfo.staffRoles || []).forEach(function (s) {
        h += '<div class="nt-card is-mine"><div class="nt-row">' + flag(s.country) + "<b>" + esc(roleLab[s.role] || s.role) + " · " + esc(s.label) + "</b></div>" +
          '<p class="nt-small">Sélectionneur : ' + esc(s.coach) + "</p>" +
          '<div class="nt-row"><button type="button" class="nt-btn" data-nc-enter="' + esc(s.teamId) + '">Mode Sélectionneur</button><button type="button" class="nt-btn2" data-nt-staff-leave="' + esc(s.teamId) + '">Quitter le staff</button></div></div>';
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
      h += '<tr class="' + (r.code === mc ? "is-mine" : "") + '"><td>' + flag(r.code) + " " + esc(r.name) + '<span class="nt-teamlinks"><button type="button" class="nt-teamlink" data-nt-team="' + esc(r.code) + '-A">A</button><button type="button" class="nt-teamlink" data-nt-team="' + esc(r.code) + '-U21">U21</button></span>' + "</td><td>" + a.who + "</td><td>" + a.end + "</td><td>" + u.who + "</td><td>" + u.end + "</td></tr>";
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
    h += '<div class="nt-card" style="margin-top:10px"><div class="nt-row nt-head">' + flag(el.country) + '<div><b style="font-size:18px"><button type="button" class="nt-link" data-nt-team="' + esc(el.teamId) + '">' + teamNameHtml(t) + "</button> : <span>Élection du sélectionneur</span></b>" +
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
        // Expérience (bilans des mandats précédents, phase E).
        ((c.experience || []).length ? '<div class="nt-small">Ancien sélectionneur : ' + c.experience.map(function (x) { return "<span>" + esc(x.label) + " (saisons " + esc(x.fromSeason) + "–" + esc(x.toSeason) + (x.played ? ", " + esc(x.wins) + " V – " + esc(x.losses) + " D" : "") + (x.best ? ", " + esc(x.best) : "") + ")</span>"; }).join(" · ") + "</div>" : "") +
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

  // --- Page équipe d'une sélection (2026-10-05) ------------------------------
  // Comme la fiche d'un club : Aperçu, Groupe, Calendrier, Sélectionneurs,
  // Palmarès. Données : /api/national/team (server/nationalTeams.js:teamView).
  var POS_SHORT_NT = { "Meneur": "M", "Arrière": "A", "Ailier shooteur": "AS", "Ailier fort": "AF", "Pivot": "P" };
  function posBadge(pos) { var f = g("effPosBadgeHtml"); return f ? f(pos) : '<span class="nt-tag2">' + esc(POS_SHORT_NT[pos] || pos) + "</span>"; }
  function shortDate(ts) {
    try { return new Date(ts).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function dayDate(ts) {
    try { return new Date(ts).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); } catch (e) { return ""; }
  }
  function compName(tv, kind) { return kind === "world" ? "Coupe du monde" : continentalComp(tv.team.country); }
  // Phase C : matchs des fenêtres (adversaire, score, feuille de match).
  function teamLabelOf(id) { var p = String(id).split("-"); var nf = g("nationName") ? window.nationName(p[0]) : p[0]; return t(nf) + " " + catLabel(p[1]); }
  function windowMatch(tv, n) { return ((tv.qualif && tv.qualif.matches) || []).filter(function (m) { return m.w === n; })[0] || null; }
  function oppSide(tv, m) { var home = m.home === tv.team.id; return { id: home ? m.away : m.home, home: home, pf: home ? m.scoreHome : m.scoreAway, pa: home ? m.scoreAway : m.scoreHome }; }
  function matchLine(tv, m) {
    var o = oppSide(tv, m), cc = o.id.split("-")[0];
    var played = m.status === "played";
    return (o.home ? "" : "@ ") + flag(cc) + " " + esc(teamLabelOf(o.id)) +
      (played ? ' <button type="button" class="nt-link" data-nt-match="' + esc(m.id) + '"><b class="' + (o.pf > o.pa ? "nt-win" : "nt-loss") + '">' + (o.pf > o.pa ? "V " : "D ") + esc(o.pf) + "-" + esc(o.pa) + "</b></button>" : liveBtnHtml(m));
  }
  // Direct d'un match international (même écran que les clubs, voir
  // openNationalLive) : « Voir le direct » pendant la diffusion, « Suivre le
  // match » dans l'heure qui précède le coup d'envoi. Score caché jusqu'à la
  // fin du direct (status « live » envoyé par le serveur).
  var LIVE_SOON_MS = 3600e3;
  function liveBtnHtml(m) {
    var now = Date.now();
    if (m.status === "live") return ' <button type="button" class="nt-btn2 nt-live-btn" data-nt-live="' + esc(m.id) + '">Voir le direct</button>';
    if ((m.status === "scheduled" || m.status === "accepted") && m.at - now <= LIVE_SOON_MS && m.at + 3 * 3600e3 > now) return ' <button type="button" class="nt-btn2 nt-live-btn" data-nt-live="' + esc(m.id) + '">Suivre le match</button>';
    return "";
  }
  // Match de la sélection en direct ou imminent (qualifications, phase
  // finale, amical), sinon null.
  function liveMatchOf(tv) {
    var id = tv.team.id, ms = [];
    ((tv.qualif && tv.qualif.matches) || []).forEach(function (m) { ms.push(m); });
    ((tv.finals && tv.finals.tournaments) || []).forEach(function (tt) { tt.matches.forEach(function (m) { if (m.home === id || m.away === id) ms.push(m); }); });
    (tv.friendlies || []).forEach(function (f) { ms.push(f); });
    return ms.filter(function (m) { return liveBtnHtml(m); }).sort(function (a, b) { return a.at - b.at; })[0] || null;
  }
  function openLive(id) {
    var f = g("openNationalLive");
    var p = f ? f({ id: id }) : Promise.resolve(false);
    window.__lastNationalLive = p;
    return p;
  }
  function recordOf(tv) {
    var w = 0, l = 0;
    (tv.results || []).filter(function (r) { return r.season === tv.season; }).forEach(function (r) { var o = oppSide(tv, r); if (o.pf > o.pa) w++; else l++; });
    return { w: w, l: l };
  }
  function objectiveLabel(tv) {
    if (!tv.phase) return "";
    return tv.phase.kind === "world" ? "Coupe du monde ou consolante (fin de saison)" : continentalComp(tv.team.country) + " (fin de saison)";
  }
  // Échéance affichée par son vrai match (qualifications) plutôt que par la
  // fenêtre internationale qui le contient (retour utilisateur 2026-10-06).
  function calItemLabel(tv, c) { if (c.kind === "friendly") return "Match amical international"; return c.kind === "final" ? compName(tv, c.comp) : tv.qualif ? "Qualifications" + (tv.qualif.group ? " · " + tv.qualif.group.label : "") : "Fenêtre " + c.n; }
  function itemStart(c) { return c.kind === "final" ? c.from : c.at; }
  // Prochaine échéance = prochain VRAI match (qualifications, phase finale
  // ou amical) : une fenêtre sans match n'en est pas une (2026-10-06).
  function nextItem(tv, now) {
    var items = (tv.calendar || []).filter(function (c) { return c.kind === "final" || windowMatch(tv, c.n); });
    (tv.friendlies || []).forEach(function (f) {
      if (f.season === tv.season && (f.status === "accepted" || f.status === "scheduled" || f.state === "live")) items.push({ kind: "friendly", at: f.at, match: { id: f.id, at: f.at, home: f.home, away: f.away, status: f.status } });
    });
    items.sort(function (a, b) { return itemStart(a) - itemStart(b); });
    for (var i = 0; i < items.length; i++) { var end = items[i].kind === "final" ? items[i].to : items[i].at; if (end + 3 * 3600e3 > now) return items[i]; }
    return null;
  }
  function coachPill(tv) {
    var c = tv.coach;
    if (!c) return '<span class="nt-pill">Intérim (IA)</span>';
    return '<span class="nt-pill">Sélectionneur : <b>' + esc(c.pseudo || c.clubName || "") + "</b>" + (c.pseudo && c.clubName ? " (" + esc(c.clubName) + ")" : "") + " · saisons " + esc(c.fromSeason) + " – " + esc(c.toSeason) + "</span>";
  }
  function playerBtn(p) {
    return '<button type="button" class="nt-link" data-nt-player="' + esc(p.club.leagueId) + "|" + esc(p.club.idx) + "|" + esc(p.id) + '">' + esc(p.name) + "</button>";
  }
  function clubOfPlayer(p) {
    return flag(p.club.country) + ' <button type="button" class="nt-link" data-nt-club="' + esc(p.club.leagueId) + "|" + esc(p.club.idx) + '">' + esc(p.club.name) + "</button>" + (p.club.division ? ' <span class="nt-small">(' + esc(p.club.division) + ")</span>" : "");
  }
  function teamApercuHtml(tv, now) {
    var sq = tv.squad, players = sq ? sq.players : [];
    var avgAge = players.length ? players.reduce(function (a, p) { return a + (p.age || 0); }, 0) / players.length : null;
    var inj = players.filter(function (p) { return p.pub && typeof p.pub.injuryUntil === "number" && p.pub.injuryUntil > now; }).length;
    var nx = nextItem(tv, now);
    var h = '<div class="nt-stats">';
    h += '<div class="nt-card"><div class="nt-k">Groupe</div><div class="nt-big">' + (players.length ? esc(players.length) + " joueurs" : "–") + '</div><div class="nt-small">' + (avgAge != null ? "moyenne " + esc(avgAge.toFixed(1).replace(".", ",")) + " ans" : "Groupe en préparation") + (inj ? " · " + esc(inj) + (inj > 1 ? " blessés" : " blessé") : "") + "</div></div>";
    var rec = recordOf(tv);
    h += '<div class="nt-card"><div class="nt-k">Bilan</div><div class="nt-big">' + (rec.w + rec.l ? esc(rec.w) + " V – " + esc(rec.l) + " D" : "–") + '</div><div class="nt-small">' + (rec.w + rec.l ? "Saison " + esc(tv.season) : "Aucun match joué") + "</div></div>";
    h += '<div class="nt-card"><div class="nt-k">Prochaine échéance</div><div class="nt-big">' + (nx ? esc(dayDate(itemStart(nx))) : "–") + '</div><div class="nt-small">' + (nx ? esc(calItemLabel(tv, nx)) + " · dans " + esc(dur(itemStart(nx) - now)) : "Saison terminée") + "</div></div>";
    h += '<div class="nt-card"><div class="nt-k">Joueurs éligibles</div><div class="nt-big">' + (sq ? esc(sq.eligible) : "–") + '</div><div class="nt-small">' + (sq ? "dans " + esc(sq.leagues) + (sq.leagues > 1 ? " championnats" : " championnat") : "") + "</div></div>";
    h += "</div>";
    h += '<div class="nt-two"><div class="nt-card"><div class="nt-k">Prochain match' + (nx ? " · " + esc(calItemLabel(tv, nx)) : "") + '<button type="button" class="nt-link" data-nt-tab="calendrier">Calendrier →</button></div>';
    if (nx) {
      var nxm = nx.kind === "window" ? windowMatch(tv, nx.n) : nx.kind === "friendly" ? nx.match : null;
      h += '<div class="nt-next"><span>' + flag(tv.team.country) + " " + teamNameHtml(tv.team) + '</span> <span class="nt-small" style="margin:0 auto;text-align:center">' + (nx.kind === "final" ? "Phase finale<br>" + esc(dayDate(nx.from)) + " → " + esc(dayDate(nx.to)) : (nxm ? "face à" : "Adversaire à déterminer") + "<br>" + esc(when(nx.at))) + "</span>" + (nxm ? "<span>" + flag(oppSide(tv, nxm).id.split("-")[0]) + " " + esc(teamLabelOf(oppSide(tv, nxm).id)) + "</span>" : "") + "</div>";
      // Match en direct ou imminent (fenêtre, phase finale, amical) : bouton du direct.
      var lm = liveMatchOf(tv);
      if (lm) h += '<div style="margin-top:10px;text-align:center">' + liveBtnHtml(lm) + "</div>";
    } else h += '<p class="nt-small">Aucune échéance cette saison.</p>';
    var res = (tv.results || []).slice(0, 5);
    h += '</div><div class="nt-card"><div class="nt-k">Derniers résultats<button type="button" class="nt-link" data-nt-tab="calendrier">Calendrier →</button></div>' +
      (res.length ? '<div style="margin-top:10px">' + res.map(function (r) { return '<div class="nt-res"><span class="nt-small">' + esc(shortDate(r.at)) + "</span> " + matchLine(tv, r) + "</div>"; }).join("") + "</div>" : '<p class="nt-small" style="margin-top:14px">Aucun match joué pour l\'instant.</p>') + "</div></div>";
    return h;
  }
  // Groupe : mêmes colonnes que l'effectif d'une équipe (fiche club), plus
  // le club de chaque joueur ; vue Statistiques = stats de la saison en club.
  // Joueurs reconstruits avec playerFromSave (fiche publique, comme un club
  // d'un autre championnat : jamais de caractéristiques ni de note).
  function squadPlayers(tv) {
    if (tv.__players) return tv.__players;
    var f = g("playerFromSave");
    tv.__players = (tv.squad && tv.squad.players || []).map(function (x) {
      var p = null;
      try { p = f && x.pub ? f(x.pub) : null; } catch (e) { p = null; }
      return p ? { p: p, x: x } : null;
    }).filter(Boolean);
    return tv.__players;
  }
  function nameCell(o) {
    var p = o.p, cross = g("injuryCrossHtml") ? window.injuryCrossHtml(p, Date.now()) : "";
    return '<td class="eff-td-name"><span class="eff-player">' + (g("playerAvatarHtml") ? window.playerAvatarHtml(p, null, 26) : "") + flag(p.nationality) + playerBtn(o.x) + (cross || "") + "</span></td>";
  }
  function seasonLine(p) {
    var log = p.matchLog || [], sum = { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0 };
    log.forEach(function (m) { Object.keys(sum).forEach(function (k) { sum[k] += m[k] || 0; }); });
    return { gp: log.length, sum: sum };
  }
  function fmt1(v) { return v.toFixed(1).replace(".", ","); }
  // Tri des colonnes (comme l'effectif d'une équipe) : clic sur un en-tête,
  // second clic = sens inverse. Partagé par les vues Général et Statistiques
  // (une colonne absente de la vue affichée laisse l'ordre par défaut).
  var POS_ORDER = ["Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
  var GENERAL_KEYS = ["name", "club", "position", "age", "height", "salary", "condition", "evaluation", "gp", "pts", "reb", "ast"];
  var STATS_KEYS = ["name", "club", "position", "gp", "min", "pts", "reb", "ast", "stl", "blk", "tov", "pf", "fg2", "fg3", "ft"];
  function recoveryOf(o) { return o.x.club && typeof o.x.club.recovery === "number" ? o.x.club.recovery : 10; }
  function sortValue(o, key) {
    var p = o.p, l = seasonLine(p), s = l.sum;
    var pctOf = function (m, a) { return a > 0 ? m / a : -1; };
    switch (key) {
      case "name": return String(p.name || "");
      case "club": return String(o.x.club && o.x.club.name || "");
      case "position": return POS_ORDER.indexOf(p.position);
      case "age": return p.age || 0;
      case "height": return p.height || 0;
      case "salary": return p.salary || 0;
      case "condition": return g("currentCondition") ? window.currentCondition(p, Date.now(), recoveryOf(o)) : (p.condition || 0);
      case "evaluation": {
        var recent = (p.matchLog || []).slice(-5);
        if (!recent.length || !g("statEvaluation")) return -999;
        return recent.reduce(function (a, m) { return a + window.statEvaluation(m); }, 0) / recent.length;
      }
      case "gp": return l.gp;
      case "fg2": return pctOf(s.fgm2, s.fga2);
      case "fg3": return pctOf(s.fgm3, s.fga3);
      case "ft": return pctOf(s.ftm, s.fta);
      default: return l.gp ? (s[key] || 0) / l.gp : -1;
    }
  }
  function sortList(list, keys, defaultCmp) {
    var st = ui.groupSort;
    if (!st || !st.key || keys.indexOf(st.key) < 0) return list.slice().sort(defaultCmp);
    return list.slice().sort(function (a, b) {
      var va = sortValue(a, st.key), vb = sortValue(b, st.key);
      var c = typeof va === "string" ? va.localeCompare(vb, "fr") : va - vb;
      return c * st.dir || defaultCmp(a, b);
    });
  }
  function sortTh(key, label, opts) {
    opts = opts || {};
    var st = ui.groupSort || {};
    var active = opts.forceActive || st.key === key;
    var dir = opts.forceActive ? -1 : st.dir;
    var cls = ["sortable-th", "eff-th", opts.cls || "", active ? "sorted" : "", active && dir === 1 ? "asc" : ""].filter(Boolean).join(" ");
    var chev = active && g("effChevronSvg") ? window.effChevronSvg() : "";
    return '<th class="' + cls + '" data-nt-sort="' + key + '" aria-sort="' + (active ? (dir === 1 ? "ascending" : "descending") : "none") + '"' + (opts.title ? ' title="' + esc(opts.title) + '"' : "") + ">" + esc(label) + chev + "</th>";
  }
  function groupeGeneralHtml(list) {
    var now = Date.now();
    var h = '<div class="eff-table-wrap roster-table-frozen-col"><table class="roster-table eff-table eff-general tde-general nt-eff"><thead><tr>' +
      sortTh("name", "Nom", { cls: "eff-th-name" }) + sortTh("club", "Club") + sortTh("position", "Poste") + sortTh("age", "Âge", { cls: "eff-th-age" }) + sortTh("height", "Taille", { cls: "eff-th-height" }) + sortTh("salary", "Salaire/sem.", { cls: "eff-th-salary" }) +
      sortTh("condition", "Forme", { cls: "eff-th-condition" }) + sortTh("evaluation", "Évaluation", { title: "Évaluation des 5 derniers matchs" }) + sortTh("gp", "MJ", { cls: "tde-th-stat", title: "Matchs joués" }) + sortTh("pts", "Pts", { cls: "tde-th-stat", title: "Points par match" }) + sortTh("reb", "Reb", { cls: "tde-th-stat", title: "Rebonds par match" }) + sortTh("ast", "Pas", { cls: "tde-th-stat", title: "Passes décisives par match" }) +
      '</tr></thead><tbody class="eff-list">';
    sortList(list, GENERAL_KEYS, function (a, b) { return POS_ORDER.indexOf(a.p.position) - POS_ORDER.indexOf(b.p.position) || String(a.p.name).localeCompare(String(b.p.name), "fr"); }).forEach(function (o) {
      var p = o.p, line = seasonLine(p), gp = line.gp;
      var stat = function (k) { return gp ? fmt1(line.sum[k] / gp) : "–"; };
      var rec = o.x.club && typeof o.x.club.recovery === "number" ? o.x.club.recovery : 10;
      h += '<tr class="eff-row' + (g("isCurrentlyInjured") && window.isCurrentlyInjured(p, now) ? " injured" : "") + '">' + nameCell(o) +
        "<td>" + clubOfPlayer(o.x) + "</td><td>" + posBadge(p.position) + '</td><td class="eff-num">' + esc(p.age) + '</td><td class="eff-num">' + esc(p.height) + ' cm</td><td class="eff-num">' + (g("formatMoney") ? esc(window.formatMoney(p.salary)) : esc(p.salary)) + "</td>" +
        '<td class="eff-td-condition">' + (g("effConditionHtml") ? window.effConditionHtml(p, now, rec) : "") + "</td>" +
        "<td>" + (g("evaluationSquaresHtml") ? window.evaluationSquaresHtml(p) : "") + "</td>" +
        '<td class="eff-num tde-stat">' + gp + '</td><td class="eff-num tde-stat tde-stat-main">' + stat("pts") + '</td><td class="eff-num tde-stat">' + stat("reb") + '</td><td class="eff-num tde-stat">' + stat("ast") + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function groupeStatsHtml(list) {
    var played = list.filter(function (o) { return (o.p.matchLog || []).length; });
    if (!played.length) return "<p class='training-empty'>Aucun match joué cette saison pour l'instant.</p>";
    var noSort = !ui.groupSort || !ui.groupSort.key || STATS_KEYS.indexOf(ui.groupSort.key) < 0;
    played = sortList(played, STATS_KEYS, function (a, b) { return sortValue(b, "pts") - sortValue(a, "pts"); });
    var cols = [["gp", "MJ", "Matchs joués"], ["min", "Min", "Minutes par match"], ["pts", "Pts", "Points par match"], ["reb", "Reb", "Rebonds par match"], ["ast", "Pas", "Passes décisives par match"], ["stl", "Int", "Interceptions par match"], ["blk", "Ctr", "Contres par match"], ["tov", "Perte", "Balles perdues par match"], ["pf", "Faute", "Fautes par match"], ["fg2", "2 pts", "Tirs à 2 points"], ["fg3", "3 pts", "Tirs à 3 points"], ["ft", "LF", "Lancers francs"]];
    var keys = ["min", "pts", "reb", "ast", "stl", "blk", "tov", "pf"];
    var leaders = {};
    ["min", "pts", "reb", "ast", "stl", "blk"].forEach(function (k) { leaders[k] = Math.max.apply(null, played.map(function (o) { var l = seasonLine(o.p); return l.sum[k] / l.gp; })); });
    var pct = function (m, a) { return a > 0 ? Math.round(m / a * 100) + "%" : "–"; };
    var h = '<div class="eff-table-wrap eff-table-wrap-caracs roster-table-frozen-col"><table class="roster-table eff-table tde-stats nt-eff"><thead><tr>' + sortTh("name", "Nom", { cls: "eff-th-name" }) + sortTh("club", "Club") + sortTh("position", "Poste") +
      cols.map(function (c) { return sortTh(c[0], c[1], { cls: "tde-th-stat", title: c[2], forceActive: noSort && c[0] === "pts" }); }).join("") + "</tr></thead><tbody>";
    played.forEach(function (o) {
      var l = seasonLine(o.p), s = l.sum;
      h += '<tr class="eff-row">' + nameCell(o) + "<td>" + clubOfPlayer(o.x) + "</td><td>" + posBadge(o.p.position) + '</td><td class="eff-num tde-stat">' + l.gp + "</td>" +
        keys.map(function (k) { var v = s[k] / l.gp, lead = leaders[k] !== undefined && v > 0 && v === leaders[k]; return '<td class="eff-num tde-stat' + (lead ? " tde-lead" : "") + (k === "pts" ? " tde-stat-main" : "") + '">' + fmt1(v) + "</td>"; }).join("") +
        [[s.fgm2, s.fga2], [s.fgm3, s.fga3], [s.ftm, s.fta]].map(function (x) { return '<td class="eff-num tde-stat tde-shot"><b>' + pct(x[0], x[1]) + "</b><span>" + x[0] + "/" + x[1] + "</span></td>"; }).join("") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }
  function teamGroupeHtml(tv) {
    var sq = tv.squad;
    if (!sq || !sq.players.length) return '<p class="training-empty">Groupe en préparation : il sera disponible sous peu.</p>';
    var list = squadPlayers(tv);
    var view = ui.groupView === "stats" ? "stats" : "general";
    var h = '<div class="tde-effectif"><div class="eff-toolbar"><div class="eff-seg" role="tablist" aria-label="Vues du groupe">' +
      [["general", "Général"], ["stats", "Statistiques"]].map(function (x) { return '<button type="button" role="tab" aria-selected="' + (view === x[0]) + '" class="eff-seg-btn' + (view === x[0] ? " active" : "") + '" data-nt-group-view="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div></div>";
    h += view === "stats" ? groupeStatsHtml(list) : groupeGeneralHtml(list);
    h += "</div>";
    if (sq.source === "interim") h += '<p class="nt-small">Groupe de l\'intérim : les meilleurs joueurs éligibles (2 par poste, puis les meilleurs restants), mis à jour régulièrement.</p>';
    return h;
  }
  function teamCalendrierHtml(tv) {
    var cal = tv.calendar || [];
    if (!cal.length) return '<p class="training-empty">Calendrier indisponible.</p>';
    var h = '<div class="nt-h" style="margin-top:6px">Saison ' + esc(tv.season) + '</div><div class="nt-card nt-tablewrap"><table class="nt-table"><tbody>';
    cal.forEach(function (c) {
      if (c.kind === "final") {
        h += '<tr><td class="nt-small">' + esc(dayDate(c.from)) + " → " + esc(dayDate(c.to)) + '</td><td><span class="nt-tag2 is-final">' + esc(compName(tv, c.comp)) + "</span></td><td>" + (c.comp === "world" ? "Phase finale (consolante pour les non-qualifiés)" : "Phase finale") + " : poules du lundi au jeudi, quarts vendredi, demi-finales samedi, finale dimanche (20:00)</td></tr>";
      } else {
        var wm = windowMatch(tv, c.n);
        // Seuls les vrais matchs (retour utilisateur 2026-10-06) : une
        // fenêtre sans match de qualification n'est pas un match (un amical
        // programmé ce jour-là a sa propre ligne).
        if (!wm) return;
        h += '<tr><td class="nt-small">' + esc(shortDate(c.at)) + '</td><td><span class="nt-tag2">' + (wm || tv.qualif ? "Qualifications" : "Fenêtre " + esc(c.n)) + "</span></td><td>" + (wm ? matchLine(tv, wm) : tv.qualif ? '<span class="nt-small">Exempt</span>' : flag(tv.team.country) + " " + teamNameHtml(tv.team) + ' <span class="nt-small">– adversaire à déterminer</span>') + "</td></tr>";
      }
    });
    // Matchs amicaux internationaux programmés et joués (dimanche 20:00).
    (tv.friendlies || []).filter(function (f) { return f.season === tv.season; }).forEach(function (f) {
      h += '<tr><td class="nt-small">' + esc(shortDate(f.at)) + '</td><td><span class="nt-tag2">Amical</span></td><td>' + matchLine(tv, { id: f.id, at: f.at, home: f.home, away: f.away, status: f.status, scoreHome: f.scoreHome, scoreAway: f.scoreAway }) + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  // Phase C : groupe de qualification (classement) et matchs du groupe.
  function teamQualifHtml(tv) {
    var q = tv.qualif;
    if (!q || !q.group) return '<p class="training-empty">Pas de qualifications cette saison pour cette sélection.</p>';
    var g = q.group;
    var h = '<div class="nt-h" style="margin-top:6px">' + esc(g.label) + " · " + esc(g.continent) + " · " + esc(q.comp === "continental" ? "qualifications " + continentalComp(tv.team.country) : "têtes de série de la Coupe du monde") + "</div>";
    h += '<div class="nt-card nt-tablewrap"><table class="nt-table"><thead><tr><th>#</th><th>Sélection</th><th>MJ</th><th>V</th><th>D</th><th>Pts</th><th>Diff.</th><th></th></tr></thead><tbody>';
    g.standings.forEach(function (r) {
      var tag = r.status === "qualified" ? '<span class="nt-tag nt-t-res">Qualifié</span>' : r.status === "consolation" ? '<span class="nt-tag nt-t-none">Consolation</span>' : "";
      h += "<tr" + (r.teamId === tv.team.id ? ' class="is-mine"' : "") + "><td>" + esc(r.rank) + '</td><td><button type="button" class="nt-link" data-nt-team="' + esc(r.teamId) + '">' + flag(r.country) + " " + esc(teamLabelOf(r.teamId)) + "</button></td><td>" + esc(r.played) + "</td><td>" + esc(r.wins) + "</td><td>" + esc(r.losses) + "</td><td><b>" + esc(r.points) + "</b></td><td>" + (r.diff > 0 ? "+" : "") + esc(r.diff) + "</td><td>" + tag + "</td></tr>";
    });
    h += "</tbody></table></div>";
    h += '<p class="nt-small">Victoire 2 points, défaite 1. Départage : confrontations directes, différence de points, points marqués. ' +
      (q.comp === "continental" ? (g.continent === "Europe" ? "Phase finale : les 2 premiers de chaque groupe et les 2 meilleurs troisièmes ; les autres jouent le tournoi de consolation." : "Toutes les sélections du continent vont en phase finale ; le classement donne les têtes de série.") : "Le classement fixe les têtes de série de la Coupe du monde et du tournoi de consolation.") + "</p>";
    return h;
  }
  // Phase D : phases finales (poules, tableau, classement) et palmarès.
  var STAGE_LABELS = { qf: "Quarts de finale", sf: "Demi-finales", final: "Finale", third: "Match pour la 3e place" };
  function honoursSummary(tv) {
    var h = tv.honours || [];
    if (!h.length) return "encore vierge";
    var titles = h.filter(function (x) { return x.rank === 1 && x.kind !== "consolation"; }).length;
    return titles ? titles + (titles > 1 ? " titres" : " titre") : h.length + (h.length > 1 ? " participations" : " participation");
  }
  function teamHonoursHtml(tv) {
    var h = tv.honours || [];
    if (!h.length) return '<p class="training-empty">Aucun titre pour l\'instant.</p>';
    var out = '<div class="nt-card nt-tablewrap"><table class="nt-table"><thead><tr><th>Saison</th><th>Compétition</th><th>Classement</th></tr></thead><tbody>';
    h.forEach(function (x) {
      var place = x.rank === 1 ? "<b>Vainqueur</b>" : x.rank === 2 ? "Finaliste" : x.rank === 3 ? "3e" : x.rank + "e sur " + x.of;
      out += "<tr><td>" + esc(x.season) + "</td><td>" + esc(x.label) + "</td><td>" + place + "</td></tr>";
    });
    return out + "</tbody></table></div>";
  }
  function stdTable(rows, tv) {
    var h = '<div class="nt-card nt-tablewrap"><table class="nt-table"><thead><tr><th>#</th><th>Sélection</th><th>MJ</th><th>V</th><th>D</th><th>Pts</th><th>Diff.</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      h += "<tr" + (r.teamId === tv.team.id ? ' class="is-mine"' : "") + "><td>" + esc(r.rank) + '</td><td><button type="button" class="nt-link" data-nt-team="' + esc(r.teamId) + '">' + flag(r.country) + " " + esc(teamLabelOf(r.teamId)) + "</button></td><td>" + esc(r.played) + "</td><td>" + esc(r.wins) + "</td><td>" + esc(r.losses) + "</td><td><b>" + esc(r.points) + "</b></td><td>" + (r.diff > 0 ? "+" : "") + esc(r.diff) + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function koLine(m) {
    var played = m.status === "played";
    var side = function (id, pts, win) { return '<span class="nt-ko-team' + (played && win ? " is-win" : "") + '">' + flag(id.split("-")[0]) + " " + esc(teamLabelOf(id)) + (played ? " <b>" + esc(pts) + "</b>" : "") + "</span>"; };
    var hw = played && m.scoreHome > m.scoreAway;
    return '<div class="nt-ko">' + side(m.home, m.scoreHome, hw) + side(m.away, m.scoreAway, played && !hw) +
      '<span class="nt-small">' + esc(when(m.at)) + (played ? ' · <button type="button" class="nt-link" data-nt-match="' + esc(m.id) + '">Feuille de match</button>' : liveBtnHtml(m)) + "</span></div>";
  }
  function teamFinalsHtml(tv) {
    var f = tv.finals;
    if (!f || !f.tournaments.length) {
      var cal = (tv.calendar || []).filter(function (c) { return c.kind === "final"; })[0];
      return '<p class="training-empty">' + (f ? "Cette sélection ne participe pas à une phase finale cette saison." : "Les tournois de la dernière semaine sont tirés à la fin des qualifications" + (cal ? " (phase finale du " + esc(dayDate(cal.from)) + " au " + esc(dayDate(cal.to)) + ")" : "") + ".") + "</p>";
    }
    var h = "";
    f.tournaments.forEach(function (t) {
      h += '<div class="nt-h" style="margin-top:6px">' + esc(t.label) + (t.champion ? " · vainqueur : " + esc(teamLabelOf(t.champion)) : "") + "</div>";
      t.groups.forEach(function (g) { h += '<div class="nt-small" style="margin:10px 0 6px;font-weight:700">' + esc(g.label) + "</div>" + stdTable(g.standings, tv); });
      ["qf", "sf", "third", "final"].forEach(function (st) {
        var ms = t.matches.filter(function (m) { return m.stage === st; });
        if (!ms.length) return;
        h += '<div class="nt-small" style="margin:14px 0 6px;font-weight:700">' + esc(STAGE_LABELS[st]) + '</div><div class="nt-card">' + ms.map(koLine).join("") + "</div>";
      });
      if (t.ranking) h += '<p class="nt-small">Classement final : ' + t.ranking.map(function (id, i) { return (i + 1) + ". " + esc(teamLabelOf(id)); }).join(" · ") + "</p>";
    });
    h += '<p class="nt-small">Un match par jour à 20h, du lundi au dimanche ; récupération améliorée pendant la phase finale (la fatigue existe toujours). Un joueur dont la sélection est encore en course ne joue pas la Supercoupe du samedi.</p>';
    if (f.others && f.others.length) h += '<p class="nt-small">Autres tournois : ' + f.others.map(function (o) { return "<span>" + esc(o.label) + (o.champion ? " (vainqueur : " + esc(teamLabelOf(o.champion)) + ")" : "") + "</span>"; }).join(" · ") + "</p>";
    return h;
  }
  // Feuille d'un match international : la feuille de statistiques des
  // matchs de club (showNationalBoxscore → openMatchBoxscoreModal, 2026-10-06),
  // plus de tableau propre aux sélections. Match encore en direct : le direct.
  // Aussi utilisée par le mode Sélectionneur (HM_NATIONAL.openMatch).
  function openMatch(id) {
    var p = api("/api/national/match?id=" + encodeURIComponent(id)).then(function (d) {
      var m = d.match;
      if (m && m.status === "live") return openLive(m.id);
      var f = g("showNationalBoxscore");
      if (f) f(m);
    }).catch(function (e) { toast(e.message); });
    window.__lastNational = p;
    return p;
  }
  function teamCoachesHtml(tv) {
    var list = tv.coaches || [];
    if (!list.length) return '<p class="training-empty">Aucun sélectionneur élu pour l\'instant : la sélection est dirigée par intérim.</p>';
    var h = '<div class="nt-card nt-tablewrap"><table class="nt-table"><thead><tr><th>Saisons</th><th>Sélectionneur</th><th>Voix</th><th>Fin</th></tr></thead><tbody>';
    list.forEach(function (m) {
      h += "<tr><td>" + esc(m.fromSeason) + " – " + esc(m.toSeason) + "</td><td>" + clubBtn(m.ref, m.pseudo, m.clubName) + "</td><td>" + esc(m.votes || 0) + "</td><td>" + (m.endedAt ? esc(endReasonLabel(m.endReason)) : "En cours") + "</td></tr>";
    });
    return h + "</tbody></table></div>";
  }
  function teamHtml() {
    var back = '<button type="button" class="lg-back" data-nt-back>← Sélections nationales</button>';
    var tv = ui.team, now = Date.now();
    if (!tv) return back + '<p class="training-empty">' + (ui.error ? esc(ui.error) : "Chargement de la sélection…") + "</p>";
    var tabs = [["apercu", "Aperçu"], ["groupe", "Groupe"], ["calendrier", "Calendrier"], ["qualifications", "Qualifications"], ["finale", "Phase finale"], ["selectionneurs", "Sélectionneurs"], ["palmares", "Palmarès"]];
    var h = back + '<div class="nt-tabs">' + tabs.map(function (x) { return '<button type="button" class="nt-tab' + (ui.teamTab === x[0] ? " on" : "") + '" data-nt-tab="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>";
    h += '<div class="nt-hero">' + flag(tv.team.country) + '<div><div class="nt-kicker">Sélection nationale · ' + esc(continentOf(tv.team.country)) + "</div><h1>" + teamNameHtml(tv.team) + "</h1>" +
      coachPill(tv) + (tv.phase ? '<span class="nt-pill">Objectif : ' + esc(objectiveLabel(tv)) + "</span>" : "") + '<span class="nt-pill">Palmarès : ' + esc(honoursSummary(tv)) + "</span>" +
      (tv.election ? ' <button type="button" class="nt-btn2" data-nt-open="' + esc(tv.election.id) + '">Élection en cours</button>' : "") +
      // Phase B : espace du sélectionneur (assets/national-coach.js).
      // Mode Sélectionneur : sélectionneur et membres de son staff.
      (tv.isCoach || tv.myRole ? ' <button type="button" class="nt-btn" data-nc-enter="' + esc(tv.team.id) + '">Mode Sélectionneur</button>' : "") + "</div></div>";
    if (ui.error) h += '<p class="nt-err">' + esc(ui.error) + "</p>";
    if (ui.teamTab === "groupe") h += '<div style="margin-top:14px">' + teamGroupeHtml(tv) + "</div>";
    else if (ui.teamTab === "calendrier") h += '<div style="margin-top:14px">' + teamCalendrierHtml(tv) + "</div>";
    else if (ui.teamTab === "selectionneurs") h += '<div style="margin-top:14px">' + teamCoachesHtml(tv) + "</div>";
    else if (ui.teamTab === "qualifications") h += '<div style="margin-top:14px">' + teamQualifHtml(tv) + "</div>";
    else if (ui.teamTab === "palmares") h += '<div style="margin-top:14px">' + teamHonoursHtml(tv) + "</div>";
    else if (ui.teamTab === "finale") h += '<div style="margin-top:14px">' + teamFinalsHtml(tv) + "</div>";
    else h += teamApercuHtml(tv, now);
    return h;
  }
  function loadTeam(id) {
    return api("/api/national/team?id=" + encodeURIComponent(id)).then(function (d) { ui.team = d; ui.error = ""; }).catch(function (e) { ui.error = e.message; });
  }
  function openTeam(id, tab) {
    ensureCss();
    // Depuis la recherche du haut : affiche d'abord la page Sélections.
    var sec = document.getElementById("selectionsSection");
    if (sec && sec.classList.contains("hidden")) {
      try { window.showPage("selectionsSection"); window.setActiveTab("selections"); } catch (e) { /* page sans ces fonctions */ }
    }
    ui.teamId = id; ui.team = null; ui.teamTab = tab || "apercu"; ui.electionId = null; ui.election = null; ui.error = "";
    paint();
    var p = loadTeam(id).then(paint);
    window.__lastNational = p;
    return p;
  }
  function openPlayer(lid, idx, id) {
    var lg = typeof league !== "undefined" ? league : null;
    var pid = /^-?\d+$/.test(id) ? Number(id) : id;
    if (lg && lg.leagueId === lid && g("showPlayerDetail")) { window.showPlayerDetail(idx, pid); return; }
    if (g("showForeignPlayerDetail")) window.showForeignPlayerDetail(lid, idx, pid);
  }
  // Barre de recherche du haut : sélections dont le pays correspond
  // (« France », « france u21 », « sélection espagne », « Germany »…).
  function norm(x) { return String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
  function searchTeams(q) {
    q = norm(q);
    if (q.length < 2) return [];
    var catWanted = null;
    var words = q.split(/\s+/).filter(function (w) {
      if (w === "u21" || w === "espoirs") { catWanted = "U21"; return false; }
      if (w === "a") { catWanted = catWanted || "A"; return false; }
      return w && !/^(selections?|equipes?|de|du|des|la|le|l|nationale?s?|team)$/.test(w);
    });
    var generic = /selection|equipe nat|national/.test(q);
    var out = [];
    COUNTRIES.forEach(function (c) {
      var nf = g("nationName") ? window.nationName(c) : c;
      var names = [norm(nf), norm(t(nf))];
      var ok = words.length ? words.every(function (w) { return names.some(function (n) { return n.indexOf(w) === 0 || n.indexOf(" " + w) >= 0; }); }) : generic;
      if (!ok) return;
      ["A", "U21"].forEach(function (cat) { if (!catWanted || catWanted === cat) out.push({ id: c + "-" + cat, country: c, countryName: nf, cat: cat }); });
    });
    return out.slice(0, 6);
  }
  function searchHtml(q) {
    var list = searchTeams(q);
    if (!list.length) return "";
    return '<div class="topbar-search-group-label">Sélections nationales</div>' + list.map(function (x) {
      return '<button type="button" class="topbar-search-result" data-nat-team="' + esc(x.id) + '"><span class="tsr-name">' + flag(x.country) + " " + teamNameHtml(x) + '</span><span class="tsr-meta">Sélection nationale</span></button>';
    }).join("");
  }

  // --- Rendu / données ------------------------------------------------------
  function paint() {
    var holder = document.getElementById("nationalContent");
    // Mode Sélectionneur : le contenu appartient à assets/national-coach.js.
    if (!holder || document.body.classList.contains("nc-mode")) return;
    holder.innerHTML = ui.teamId ? teamHtml() : ui.electionId ? electionHtml() : overviewHtml();
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
    ui.electionId = null; ui.election = null; ui.formOpen = false; ui.teamId = null; ui.team = null;
    paint();
    var p = loadOverview().then(paint);
    window.__lastNational = p;
    return p;
  }
  function openElection(id, wantForm) {
    ensureCss();
    ui.electionId = id; ui.election = null; ui.formOpen = !!wantForm; ui.error = ""; ui.teamId = null; ui.team = null;
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
    if (document.body.classList.contains("nc-mode")) return;
    var th = e.target.closest ? e.target.closest("th[data-nt-sort]") : null;
    if (th && ui.teamId) {
      var k = th.dataset.ntSort, st = ui.groupSort || {};
      ui.groupSort = st.key === k ? { key: k, dir: -st.dir } : { key: k, dir: (k === "name" || k === "club" || k === "position") ? 1 : -1 };
      paint();
      return;
    }
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    var d = b.dataset;
    if (d.ntOpen) { openElection(d.ntOpen, d.ntRun === "1"); return; }
    if (d.ntTeam) { openTeam(d.ntTeam); return; }
    if (d.ntTab && ui.teamId) { ui.teamTab = d.ntTab; paint(); return; }
    if (d.ntMatch) { openMatch(d.ntMatch); return; }
    if (d.ntLive) { openLive(d.ntLive); return; }
    if (d.ntGroupView && ui.teamId) { ui.groupView = d.ntGroupView; paint(); return; }
    if (d.ntPlayer) { var q = d.ntPlayer.split("|"); openPlayer(q[0], Number(q[1]), q[2]); return; }
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
    if (d.ntStaffAccept || d.ntStaffDecline || d.ntStaffLeave) {
      var tid = d.ntStaffAccept || d.ntStaffDecline || d.ntStaffLeave;
      if (d.ntStaffLeave && !window.confirm(t("Quitter le staff de cette sélection ?"))) return;
      var path = d.ntStaffLeave ? "/api/national/coach/staff/remove" : "/api/national/coach/staff/respond";
      act(path, { teamId: tid, accept: !!d.ntStaffAccept }, d.ntStaffAccept ? "Vous rejoignez le staff de la sélection." : d.ntStaffLeave ? "Vous avez quitté le staff." : "Invitation refusée.").then(function () {
        // Bouton du mode Sélectionneur (tableau de bord) mis à jour.
        if (window.HM_NATIONAL_COACH && window.HM_NATIONAL_COACH.boot) window.HM_NATIONAL_COACH.boot();
        return loadOverview().then(paint);
      });
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

  // Écrans de la page d'une sélection, réutilisés par le mode Sélectionneur
  // (assets/national-coach.js) : même rendu, mêmes règles.
  function sectionHtml(tv, tab) {
    ensureCss();
    if (tab === "calendrier") return teamCalendrierHtml(tv);
    if (tab === "qualifications") return teamQualifHtml(tv);
    if (tab === "finale") return teamFinalsHtml(tv);
    if (tab === "palmares") return teamHonoursHtml(tv);
    if (tab === "selectionneurs") return teamCoachesHtml(tv);
    return teamApercuHtml(tv, Date.now());
  }
  window.HM_NATIONAL = { render: function () { bind(); return render(); }, openElection: function (id) { bind(); return openElection(id); }, openTeam: function (id, tab) { bind(); return openTeam(id, tab); }, searchHtml: searchHtml, searchTeams: searchTeams, state: ui, teamHtml: teamHtml, sectionHtml: sectionHtml, openMatch: openMatch, openLive: openLive, liveBtnHtml: liveBtnHtml, liveMatchOf: liveMatchOf, teamLabelOf: teamLabelOf, overviewHtml: overviewHtml, electionHtml: electionHtml };
})();
