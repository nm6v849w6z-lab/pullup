// =====================================================================
// CENTRE MÉDICAL (2026-09-27, refonte visuelle du 2026-10-07 d'après la
// maquette « Centre médical ») : en-tête + onglets (Tous, Blessés, À risque,
// Historique), bandeau de 4 chiffres (disponibles, blessés, à risque,
// saison), liste de l'effectif groupée par état de fatigue (fatigue en 5
// segments, risque de blessure au prochain match), infirmerie, historique
// de la saison par mois ; à droite l'encadrement médical (médecin, kiné,
// musculation) et la répartition de la fatigue.
// Fichier à part (limite de taille de la page, voir load_size_test.js) ;
// utilise les fonctions du jeu (teamA, currentCondition, conditionStateFor,
// playerAvatarHtml, playerLinkHtml…). Point d'entrée de la page :
// renderMedicalSection() → HM_MEDICAL_UI.render().
// Le risque reprend EXACTEMENT les multiplicateurs de
// MatchEngine.applyFatigue qui dépendent du joueur avant le match (forme
// physique × salle de musculation × kiné) ; 1,00 = joueur en pleine forme
// dans un club sans kiné ni salle de musculation.
// =====================================================================
(function () {
  "use strict";
  var state = { filter: "all" }; // "all" | "injured" | "risk" | "history"
  var RISK_TIERS = [
    { max: 0.85, key: "low", label: "Faible", color: "#34D399" },
    { max: 1.15, key: "normal", label: "Normal", color: "#9AA6BF" },
    { max: 1.5, key: "high", label: "Élevé", color: "#F5A524" },
    { max: Infinity, key: "veryhigh", label: "Très élevé", color: "#F87171" },
  ];
  // États de forme du jeu (CONDITION_STATES), du plus frais au plus épuisé.
  var FATIGUE = [
    { segs: 0, color: "#34D399", group: "En pleine forme" },
    { segs: 2, color: "#F5C04A", group: "Légèrement fatigués" },
    { segs: 3, color: "#F59E0B", group: "Fatigués" },
    { segs: 4, color: "#FB923C", group: "Très fatigués" },
    { segs: 5, color: "#F87171", group: "Épuisés" },
  ];
  var POS_NAME = { Meneur: "Meneur", "Arrière": "Arrière", "Ailier shooteur": "Ailier shooteur", "Ailier fort": "Ailier fort", Pivot: "Pivot" };

  // Constantes et variables du jeu (déclarations const/let de la page :
  // pas sur window, lues par leur nom).
  var GLOBALS = {
    teamA: function () { return typeof teamA !== "undefined" ? teamA : undefined; },
    myTeamIndex: function () { return typeof myTeamIndex !== "undefined" ? myTeamIndex : undefined; },
    POS_SHORT: function () { return typeof POS_SHORT !== "undefined" ? POS_SHORT : undefined; },
    CONDITION_STATES: function () { return typeof CONDITION_STATES !== "undefined" ? CONDITION_STATES : undefined; },
    CONDITION_RECOVERY_PER_DAY: function () { return typeof CONDITION_RECOVERY_PER_DAY !== "undefined" ? CONDITION_RECOVERY_PER_DAY : undefined; },
    DOCTOR_INJURY_DURATION_REDUCTION_BY_LEVEL: function () { return typeof DOCTOR_INJURY_DURATION_REDUCTION_BY_LEVEL !== "undefined" ? DOCTOR_INJURY_DURATION_REDUCTION_BY_LEVEL : undefined; },
    TAB_HANDLERS: function () { return typeof TAB_HANDLERS !== "undefined" ? TAB_HANDLERS : undefined; },
  };
  function G(name) { try { return GLOBALS[name] ? GLOBALS[name]() : window[name]; } catch (e) { return undefined; } }
  function fn(name) { var f = window[name]; return typeof f === "function" ? f : null; }
  function esc(s) { var f = fn("escapeHtml"); return f ? f(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function plural(n, a, b) { return n + " " + (n > 1 ? (b || a + "s") : a); }
  function icon(path, col, size, sw) { return '<svg viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) + '" fill="none" stroke="' + col + '" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>"; }
  var P = {
    cross: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
    warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    steth: '<path d="M6 3v6a6 6 0 0 0 12 0V3"/><path d="M12 15v2a4 4 0 0 0 8 0v-2"/><circle cx="20" cy="13" r="2"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-3a2 2 0 0 0-4 0"/>',
    gym: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
    heart: '<path d="M12 21s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6.5 5.2 5.2 0 0 1 21.3 12C19 16.6 12 21 12 21z"/><path d="M8 12h2.5l1.5-2.5 2 5 1.5-2.5H17"/>',
  };

  function ensureCss() {
    if (document.getElementById("medCss")) return;
    var s = document.createElement("style");
    s.id = "medCss";
    s.textContent = [
      ".md-root{--md-card:var(--panel,#111A2C);--md-in:var(--panel-2,#0D1525);--md-line:var(--line,#1E2A42);--md-dim:var(--ink-dim,#9AA6BF);--md-faint:var(--ink-faint,#6F7C96);--md-acc:var(--amber,#F5A524);display:flex;flex-direction:column;gap:24px;color:var(--ink)}",
      ".md-cond{font-family:'Barlow Condensed','Arial Narrow','Roboto Condensed',system-ui,sans-serif;font-stretch:condensed;font-weight:800;line-height:1}",
      ".md-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:18px}",
      ".md-kicker{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--md-acc)}",
      ".md-head h1{margin:4px 0;font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:800;font-size:50px;line-height:1;text-transform:uppercase}",
      ".md-sub{font-size:15px;color:var(--md-dim)}",
      ".md-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:4px;background:var(--md-card);border:1px solid var(--md-line);border-radius:14px}",
      ".md-tabs button{min-height:40px;padding:0 14px;border:0;border-radius:10px;background:transparent;color:var(--md-dim);font:inherit;font-size:14px;font-weight:700;display:flex;align-items:center;gap:8px;cursor:pointer}",
      ".md-tabs button span{font-size:12px;padding:1px 7px;border-radius:999px;background:var(--md-in);color:var(--ink)}",
      ".md-tabs button.active{background:var(--md-acc);color:#1A1206}.md-tabs button.active span{background:rgba(0,0,0,.18);color:#1A1206}",
      ".md-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}",
      ".md-kpi{display:flex;flex-direction:column;justify-content:space-between;gap:10px;padding:20px 22px;background:var(--md-card);border:1px solid var(--md-line);border-radius:18px;min-width:0}",
      ".md-kpi.md-ring{flex-direction:row;align-items:center;justify-content:flex-start;gap:18px}",
      ".md-kpi .md-l{font-size:13px;font-weight:600;color:var(--md-dim)}.md-kpi .md-n{font-size:44px}.md-kpi .md-n small{font-size:24px;color:var(--md-faint)}.md-kpi .md-s{font-size:13px;color:var(--md-faint)}",
      ".md-kpi .md-top{display:flex;align-items:center;justify-content:space-between}",
      ".md-kpi .md-n small.md-unit{font-size:18px;letter-spacing:0}",
      ".md-main{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}",
      ".md-panel{flex:999 1 620px;min-width:0;background:var(--md-card);border:1px solid var(--md-line);border-radius:20px;overflow:hidden}",
      ".md-panel-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid var(--md-line)}",
      ".md-h2{margin:0;font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:800;font-size:23px;letter-spacing:.04em;text-transform:uppercase}",
      ".md-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--md-dim)}.md-legend span{display:flex;align-items:center;gap:6px}.md-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}",
      ".md-scroll{overflow-x:auto}.md-table{min-width:600px}",
      ".md-grid{display:grid;grid-template-columns:minmax(210px,2fr) minmax(190px,1.4fr) minmax(170px,1fr);gap:16px;align-items:center;padding:11px 22px}",
      ".md-th{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--md-faint);padding-top:12px;padding-bottom:8px}",
      ".md-group{display:flex;align-items:center;gap:10px;padding:9px 22px;background:var(--md-in);border-top:1px solid var(--md-line);border-bottom:1px solid var(--md-line);font-size:13px;font-weight:700}",
      ".md-group b{font-size:12px;color:var(--md-dim);background:var(--md-card);padding:2px 8px;border-radius:999px}.md-group i{width:8px;height:8px;border-radius:50%;display:inline-block}",
      ".md-row{border-bottom:1px solid var(--md-line)}.md-row:last-child{border-bottom:0}",
      ".md-row.is-injured{background:rgba(248,113,113,.05);box-shadow:inset 3px 0 0 #F87171}",
      ".md-who{display:flex;align-items:center;gap:13px;min-width:0}",
      ".md-av{width:42px;height:42px;flex:none;border-radius:12px;background:var(--md-in);display:grid;place-items:end center;overflow:hidden}.md-av .player-avatar{width:38px!important;height:41px!important;border-radius:0!important}",
      ".md-who>div:last-child{display:flex;flex-direction:column;gap:3px;min-width:0}.md-who .player-link,.md-who>div>b{font-size:15px;font-weight:700;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".md-pos{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--md-faint)}.md-pos b{font-size:11px;font-weight:700;color:var(--md-acc);border:1px solid rgba(245,165,36,.35);background:rgba(245,165,36,.08);padding:1px 7px;border-radius:6px}",
      ".md-segs{display:flex;gap:4px}.md-segs span{flex:1;height:8px;border-radius:3px;background:var(--md-line)}",
      ".md-fat{display:flex;flex-direction:column;gap:7px}.md-fat div:last-child{font-size:12px;font-weight:600}",
      ".md-risk{display:flex;align-items:center;gap:10px}.md-risk .md-pill{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap}",
      ".md-bar{flex:1;height:6px;border-radius:999px;background:var(--md-line);overflow:hidden}.md-bar i{display:block;height:100%;border-radius:999px}",
      ".md-tag{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px;background:rgba(248,113,113,.14);color:#F87171}",
      ".md-days{font-weight:800;color:#F87171;font-variant-numeric:tabular-nums}.md-back{font-size:12px;color:var(--md-dim)}",
      ".md-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:64px 22px;text-align:center}.md-empty b{font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:800;font-size:25px;text-transform:uppercase}.md-empty span{font-size:14px;color:var(--md-dim);max-width:380px}",
      ".md-side{flex:1 1 330px;display:flex;flex-direction:column;gap:24px;min-width:0}",
      ".md-card{background:var(--md-card);border:1px solid var(--md-line);border-radius:20px;padding:22px;display:flex;flex-direction:column;gap:16px}",
      ".md-staff{display:flex;gap:14px;padding:15px;background:var(--md-in);border:1px solid var(--md-line);border-radius:14px}",
      ".md-staff.is-off{border-style:dashed}",
      ".md-staff-ic{width:42px;height:42px;flex:none;border-radius:12px;display:grid;place-items:center}",
      ".md-staff>div:last-child{flex:1;display:flex;flex-direction:column;gap:8px;min-width:0}.md-staff .md-top{display:flex;justify-content:space-between;align-items:center;gap:8px}.md-staff .md-top span:first-child{font-size:15px;font-weight:700}.md-staff .md-top span:last-child{font-size:12px;font-weight:700;color:var(--md-dim)}",
      ".md-lvl{display:flex;gap:4px}.md-lvl span{flex:1;height:6px;border-radius:3px;background:var(--md-line)}.md-lvl span.on{background:var(--md-acc)}",
      ".md-chips{display:flex;flex-wrap:wrap;gap:6px}.md-chip{font-size:12px;font-weight:600;color:var(--md-dim);background:var(--md-card);padding:3px 9px;border-radius:8px}.md-chip b{color:#34D399}",
      ".md-missing{font-size:12px;font-weight:700;color:#F87171}",
      ".md-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.md-btns button{min-height:44px;border-radius:12px;border:1px solid var(--md-line);background:var(--md-in);color:var(--ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer}.md-btns button.md-primary{border:0;background:var(--md-acc);color:#1A1206}",
      ".md-split{display:flex;height:14px;border-radius:999px;overflow:hidden;gap:3px;background:var(--md-line)}",
      ".md-dist{display:flex;flex-direction:column;gap:8px;font-size:13px}.md-dist>div{display:flex;justify-content:space-between}.md-dist span{display:flex;align-items:center;gap:8px;color:var(--md-dim)}.md-dist i{width:10px;height:10px;border-radius:3px;display:inline-block}",
      ".md-tip{font-size:12px;color:var(--md-faint);border-top:1px solid var(--md-line);padding-top:12px;line-height:1.5}",
      ".md-next{font-size:13px;color:var(--md-dim)}.md-next b{color:var(--ink);font-weight:600}",
      "@media (max-width:720px){.md-root{gap:16px}.md-head h1{font-size:38px}.md-tabs{width:100%}.md-tabs button{flex:1 1 auto;justify-content:center;padding:0 8px;font-size:13px}.md-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.md-kpi{padding:14px}.md-kpi .md-n{font-size:34px}.md-kpi.md-ring{flex-direction:column;align-items:flex-start;gap:8px}.md-kpi.md-ring svg{width:52px;height:52px}",
      ".md-table{min-width:0}.md-grid{grid-template-columns:minmax(0,1fr) 112px;gap:10px;padding:10px 14px}.md-grid>.md-c-fat{display:none}.md-th>.md-c-fat{display:none}.md-group{padding:9px 14px}.md-panel-head{padding:14px}.md-bar{display:none}.md-risk{justify-content:flex-end}.md-c-end{text-align:right}}",
    ].join("\n");
    document.head.appendChild(s);
  }

  function riskFor(team, p, now) {
    var CR = G("CONDITION_RECOVERY_PER_DAY") || 10;
    var recovery = team.conditionRecoveryPerDay ? team.conditionRecoveryPerDay() : CR;
    var condition = fn("currentCondition") ? fn("currentCondition")(p, now, recovery) : (p.condition || 100);
    var states = G("CONDITION_STATES") || [];
    var stateIdx = Math.max(0, states.findIndex(function (s) { return condition >= s.min; }));
    var st = states[stateIdx] || { label: "", injuryMult: 1 };
    var gym = team.facilityInjuryRiskMult ? team.facilityInjuryRiskMult() : 1;
    var physio = team.physioInjuryRiskMult ? team.physioInjuryRiskMult() : 1;
    var mult = st.injuryMult * gym * physio;
    var tier = RISK_TIERS.find(function (t) { return mult < t.max; }) || RISK_TIERS[RISK_TIERS.length - 1];
    return { mult: mult, tier: tier, condition: condition, stateIdx: Math.min(4, stateIdx), stateLabel: st.label };
  }
  function pct(delta) { return (delta > 0 ? "+" : "−") + Math.round(Math.abs(delta) * 100) + " %"; }
  function tint(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  function day(at) { var f = fn("formatCalendarDayFr"); return f ? f(at) : new Date(at).toLocaleDateString("fr-FR"); }
  function shortPos(p) { var m = G("POS_SHORT") || {}; return m[p.position] || p.position || ""; }

  function whoHtml(team, p, sub, youth) {
    var av = fn("playerAvatarHtml"), link = fn("playerLinkHtml"), idx = G("myTeamIndex");
    var face = !youth && av ? av(p, team, 38) : "";
    var name = !youth && link ? link(idx, p.id, p.name) : "<b>" + esc(p.name) + "</b>";
    return '<div class="md-who"><span class="md-av">' + face + "</span><div>" + name + '<div class="md-pos">' + sub + "</div></div></div>";
  }
  function posSub(p, extra) { return "<b>" + esc(shortPos(p)) + "</b><span>" + esc(POS_NAME[p.position] || p.position || "") + (extra ? " · " + esc(extra) : "") + "</span>"; }
  function segsHtml(i) { var f = FATIGUE[i]; var h = ""; for (var k = 0; k < 5; k++) h += '<span style="' + (k < f.segs ? "background:" + f.color : "") + '"></span>'; return '<div class="md-segs">' + h + "</div>"; }
  function riskHtml(r) {
    var w = Math.max(6, Math.min(100, Math.round(r.mult / 2 * 100))), c = r.tier.color;
    return '<div class="md-risk md-risk-' + r.tier.key + '"><span class="md-pill" style="color:' + c + ";background:" + tint(c, 0.12) + ";border:1px solid " + tint(c, 0.3) + '">' + esc(r.tier.label) + '</span><div class="md-bar"><i style="width:' + w + "%;background:" + c + '"></i></div></div>';
  }
  function head3(a, b, c) { return '<div class="md-grid md-th"><div>' + a + '</div><div class="md-c-fat">' + b + '</div><div class="md-c-end">' + c + "</div></div>"; }
  function emptyHtml(title, text) { return '<div class="md-empty">' + icon(P.heart, "#34D399", 56, 1.6) + "<b>" + esc(title) + "</b><span>" + esc(text) + "</span></div>"; }

  function render() {
    var holder = document.getElementById("medicalContent");
    var team = G("teamA");
    if (!holder || !team) return;
    ensureCss();
    var now = Date.now();
    var isInj = fn("isCurrentlyInjured") || function (p) { return p.injuryUntil && p.injuryUntil > now; };
    var daysLeft = fn("injuryDaysRemaining") || function (p) { return Math.max(1, Math.ceil((p.injuryUntil - now) / 864e5)); };
    var players = team.players || [];
    var injuredPros = players.filter(function (p) { return isInj(p, now); });
    // Jeunes du centre de formation blessés (retour utilisateur 2026-10-03) :
    // dans l'infirmerie et le compteur, pas dans « Disponibles » (pros).
    var injuredYouth = (team.youthPlayers || []).filter(function (p) { return isInj(p, now); });
    var injured = injuredPros.concat(injuredYouth).sort(function (a, b) { return a.injuryUntil - b.injuryUntil; });
    var fit = players.filter(function (p) { return !isInj(p, now); }).map(function (p) { return { p: p, r: riskFor(team, p, now) }; })
      .sort(function (a, b) { return b.r.mult - a.r.mult || a.p.name.localeCompare(b.p.name); });
    var atRisk = fit.filter(function (x) { return x.r.tier.key === "high" || x.r.tier.key === "veryhigh"; });
    var seasonNo = (team.seasonHistory || []).length + 1;
    var log = (team.injuryLog || []).filter(function (e) { return e.seasonNo === seasonNo; });
    var daysLost = log.reduce(function (s, e) { return s + (e.days || 0); }, 0);
    var counts = { all: players.length, injured: injured.length, risk: atRisk.length, history: log.length };
    var f = state.filter;

    // En-tête + onglets.
    var tabs = [["all", "Tous"], ["injured", "Blessés"], ["risk", "À risque"], ["history", "Historique"]].map(function (x) {
      var on = f === x[0];
      return '<button type="button" class="' + (on ? "active" : "") + '" data-med-filter="' + x[0] + '" aria-pressed="' + on + '">' + esc(x[1]) + " <span>" + counts[x[0]] + "</span></button>";
    }).join("");
    var h = '<header class="md-head"><div><div class="md-kicker">Équipe · Santé</div><h1>Centre médical</h1><div class="md-sub">Bilan physique de l\'effectif avant le prochain match</div></div>' +
      '<div class="md-tabs" role="group" aria-label="Filtrer">' + tabs + "</div></header>";

    // Bandeau de chiffres.
    var avail = players.length - injuredPros.length, ratio = players.length ? avail / players.length : 1;
    var rc = ratio >= 1 ? "#34D399" : ratio >= 0.85 ? "#F5C04A" : "#F87171", C2 = 2 * Math.PI * 31;
    var nextBack = injured[0];
    h += '<section class="md-kpis" id="medicalSummary">' +
      '<div class="md-kpi md-ring"><svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="31" fill="none" stroke="var(--md-line)" stroke-width="9"/>' +
      '<circle cx="38" cy="38" r="31" fill="none" stroke="' + rc + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + (C2 * ratio).toFixed(1) + " " + C2.toFixed(1) + '" transform="rotate(-90 38 38)"/>' +
      (ratio >= 1 ? '<path d="M27 38l7 7 14-15" fill="none" stroke="#34D399" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' : "") + "</svg>" +
      '<div><div class="md-l">Disponibles</div><div class="md-n md-cond">' + avail + "<small>/" + players.length + '</small></div><div class="md-s" style="color:' + rc + ';font-weight:600">' + (injuredPros.length ? plural(injuredPros.length, "indisponible") : "Effectif complet") + "</div></div></div>" +
      '<div class="md-kpi"><div class="md-top"><span class="md-l">Blessés</span>' + icon(P.cross, "#F87171") + '</div><div class="md-n md-cond" id="medicalInjuredCount"' + (injured.length ? ' style="color:#F87171"' : "") + ">" + injured.length + "</div>" +
      '<div class="md-s md-next">' + (nextBack ? "Prochain retour : <b>" + esc(nextBack.name) + " · " + esc(day(nextBack.injuryUntil)) + "</b>" : "Aucun joueur à l'infirmerie") + "</div></div>" +
      '<div class="md-kpi"><div class="md-top"><span class="md-l">À risque</span>' + icon(P.warn, "#F5A524") + '</div><div class="md-n md-cond" id="medicalHighRiskCount"' + (atRisk.length ? ' style="color:#F5A524"' : "") + ">" + atRisk.length + '</div><div class="md-s">Risque élevé au prochain match</div></div>' +
      '<div class="md-kpi"><div class="md-top"><span class="md-l">Saison</span>' + icon(P.cal, "#7DA2FF") + '</div><div class="md-n md-cond"><span id="medicalSeasonCount">' + log.length + "</span> <small class=\"md-unit\">" + (log.length > 1 ? "blessures" : "blessure") + " · " + daysLost + " j d'indispo.</small></div>" +
      '<div class="md-s">Cumul depuis le début de saison</div></div></section>';

    // Liste principale.
    var titles = { all: "Joueurs disponibles", injured: "Infirmerie", risk: "Joueurs à risque", history: "Historique des blessures" };
    var legend = f === "history" ? "" : '<div class="md-legend"><span><i style="background:#34D399"></i>En forme</span><span><i style="background:#F5C04A"></i>Fatigue</span><span><i style="background:#F87171"></i>Épuisé</span></div>';
    var body = "";
    var infirmary = function () {
      var out = '<div class="md-group"><i style="background:#F87171"></i>Infirmerie <b>' + injured.length + "</b></div>";
      injured.forEach(function (p) {
        var youth = injuredYouth.indexOf(p) >= 0, d = daysLeft(p, now);
        out += '<div class="md-grid md-row is-injured" data-player-row="' + esc(p.id) + '" data-med-kind="injured"><div>' + whoHtml(team, p, posSub(p, youth ? "centre de formation" : ""), youth) + "</div>" +
          '<div class="md-c-fat"><span class="md-tag" title="' + esc(p.injuryType || "Blessure") + '">' + esc(p.injuryType || "Blessure") + "</span></div>" +
          '<div class="md-c-end"><div class="md-days">' + plural(d, "jour") + '</div><div class="md-back">retour ' + esc(day(p.injuryUntil)) + "</div></div></div>";
      });
      return out;
    };
    var fitRows = function (list) {
      var out = "";
      // Les plus fatigués d'abord (comme la maquette), puis les plus frais.
      [4, 3, 2, 1, 0].forEach(function (i) {
        var fs = FATIGUE[i];
        var g = list.filter(function (x) { return x.r.stateIdx === i; });
        if (!g.length) return;
        out += '<div class="md-group"><i style="background:' + fs.color + '"></i>' + esc(fs.group) + " <b>" + g.length + "</b></div>";
        g.forEach(function (x) {
          var risky = x.r.tier.key === "high" || x.r.tier.key === "veryhigh";
          out += '<div class="md-grid md-row" data-player-row="' + esc(x.p.id) + '" data-risk="' + x.r.tier.key + '" data-med-kind="' + (risky ? "risk" : "fit") + '"><div>' + whoHtml(team, x.p, posSub(x.p)) + "</div>" +
            '<div class="md-c-fat md-fat">' + segsHtml(i) + '<div style="color:' + fs.color + '">' + esc(x.r.stateLabel) + "</div></div>" +
            '<div class="md-c-end">' + riskHtml(x.r) + "</div></div>";
        });
      });
      return out;
    };
    if (f === "all") {
      body = head3("Joueur", "État de fatigue", "Risque de blessure") + (injured.length ? infirmary() : "") + (fit.length ? fitRows(fit) : '<p class="md-s" style="padding:18px 22px">Aucun joueur disponible.</p>');
    } else if (f === "injured") {
      body = injured.length ? head3("Joueur", "Blessure", "Retour") + infirmary() : emptyHtml("Infirmerie vide", "Aucun joueur blessé. Tout l'effectif est apte à jouer.");
    } else if (f === "risk") {
      body = atRisk.length ? head3("Joueur", "État de fatigue", "Risque de blessure") + fitRows(atRisk) : emptyHtml("Aucun joueur à risque", "Le risque de blessure est faible pour l'ensemble de l'effectif.");
    } else {
      // Historique de la saison, groupé par mois.
      var groups = [];
      log.forEach(function (e) {
        var key = e.at && fn("calendarMonthKey") ? fn("calendarMonthKey")(e.at) : "saison";
        var gr = groups.find(function (x) { return x.key === key; });
        if (!gr) { gr = { key: key, title: e.at && fn("calendarMonthTitle") ? fn("calendarMonthTitle")(e.at) : "Saison", rows: [] }; groups.push(gr); }
        gr.rows.push(e);
      });
      body = groups.length ? head3("Joueur", "Blessure", "Durée") + groups.map(function (gr) {
        return '<div class="md-group"><i style="background:#7DA2FF"></i>' + esc(gr.title) + " <b>" + gr.rows.length + "</b></div>" + gr.rows.map(function (e) {
          var p = players.find(function (x) { return x.id === e.playerId; });
          // Jeune de l'académie blessé (retour utilisateur 2026-10-02) : cherché aussi parmi les jeunes.
          var youth = !p ? (team.youthPlayers || []).find(function (x) { return String(x.id) === String(e.playerId); }) : null;
          var sub = "<span>Semaine " + esc(e.week) + (e.opponentName ? " · contre " + esc(e.opponentName) : "") + (youth ? " · centre de formation" : !p ? " · a quitté le club" : "") + "</span>";
          var who = p ? whoHtml(team, p, sub) : whoHtml(team, { name: youth ? youth.name : e.playerName }, sub, true);
          return '<div class="md-grid md-row md-hist-row" data-med-kind="history"><div>' + who + "</div>" +
            '<div class="md-c-fat"><span class="md-tag">' + esc(e.injuryType || "Blessure") + "</span></div>" +
            '<div class="md-c-end"><div class="md-days" style="color:var(--ink)">' + plural(e.days, "jour") + "</div>" + (e.at ? '<div class="md-back">' + esc(day(e.at)) + "</div>" : "") + "</div></div>";
        }).join("");
      }).join("") : emptyHtml("Saison sans blessure", "Aucune blessure enregistrée depuis le début de la saison.");
    }
    h += '<div class="md-main"><section class="md-panel"><div class="md-panel-head"><h2 class="md-h2">' + esc(titles[f]) + "</h2>" + legend + '</div><div class="md-scroll"><div class="md-table">' + body + "</div></div></section>";

    // Colonne de droite : encadrement médical.
    var doctor = team.doctor, physio = team.physio;
    var gymLevel = (team.facilityLevels && team.facilityLevels.gym) || 0;
    var gym = fn("facilityInfo") ? fn("facilityInfo")("gym", gymLevel) : null;
    var red = G("DOCTOR_INJURY_DURATION_REDUCTION_BY_LEVEL") || {};
    var lvl = function (n) { var o = ""; for (var k = 1; k <= 5; k++) o += '<span class="' + (k <= n ? "on" : "") + '"></span>'; return '<div class="md-lvl">' + o + "</div>"; };
    var staffRow = function (key, on, ic, icCol, label, right, chips, extra) {
      return '<div class="md-staff' + (on ? "" : " is-off") + '" data-med-staff="' + key + '"><div class="md-staff-ic" style="background:' + tint(icCol, 0.14) + '">' + icon(ic, icCol) + "</div><div>" +
        '<div class="md-top"><span>' + esc(label) + "</span>" + right + "</div>" + lvl(on ? on : 0) + (extra || "") + '<div class="md-chips">' + chips + "</div></div></div>";
    };
    var chip = function (label, val) { return '<span class="md-chip">' + esc(label) + " <b>" + esc(val) + "</b></span>"; };
    h += '<aside class="md-side"><section class="md-card" id="medicalStaffCard"><h2 class="md-h2" style="font-size:21px">Encadrement médical</h2>' +
      staffRow("doctor", doctor ? doctor.level : 0, P.steth, "#7DA2FF", "Médecin", doctor ? "<span>" + doctor.level + " / 5</span>" : '<span class="md-missing">À recruter</span>',
        doctor ? chip("Durée des blessures", pct(-(red[doctor.level] || 0))) : '<span class="md-chip">Raccourcit les blessures (jusqu\'à −35 %)</span>') +
      staffRow("physio", physio ? physio.level : 0, P.hand, "#34D399", "Kiné", physio ? "<span>" + physio.level + " / 5</span>" : '<span class="md-missing">À recruter</span>',
        physio ? chip("Risque", pct(team.physioInjuryRiskMult() - 1)) + chip("Forme", "+" + team.physioRecoveryBonus() + " / jour") : '<span class="md-chip">Moins de blessures, meilleure récupération</span>') +
      staffRow("gym", gymLevel, P.gym, "#F5A524", "Musculation", gymLevel ? "<span>Niveau " + gymLevel + "</span>" : '<span class="md-missing">À construire</span>',
        gymLevel && gym ? chip("Risque", pct(gym.injuryRiskMult - 1)) : '<span class="md-chip">Moins de blessures en match (jusqu\'à −52 %)</span>',
        gymLevel && gym ? '<div class="md-s" style="font-size:12px;color:var(--md-dim)">' + esc(gym.name) + "</div>" : "") +
      '<div class="md-btns"><button type="button" id="medicalGoStaff">Gérer le staff</button><button type="button" class="md-primary" id="medicalGoSalle">Équipements</button></div></section>';

    // Répartition de la fatigue (joueurs disponibles).
    var dist = FATIGUE.map(function (fs, i) { return { fs: fs, n: fit.filter(function (x) { return x.r.stateIdx === i; }).length, label: ((G("CONDITION_STATES") || [])[i] || {}).label || fs.group }; });
    var tired = fit.filter(function (x) { return x.r.stateIdx >= 1; }).length;
    h += '<section class="md-card"><h2 class="md-h2" style="font-size:21px">Répartition de la fatigue</h2><div class="md-split">' +
      dist.filter(function (d) { return d.n; }).map(function (d) { return '<span style="flex:' + d.n + ";background:" + d.fs.color + '"></span>'; }).join("") + "</div>" +
      '<div class="md-dist">' + dist.map(function (d) { return "<div><span><i style=\"background:" + d.fs.color + '"></i>' + esc(d.label) + "</span><b>" + d.n + "</b></div>"; }).join("") + "</div>" +
      '<div class="md-tip">' + (tired ? "Conseil : faire tourner " + (tired > 1 ? "les " + tired + " joueurs fatigués" : "le joueur fatigué") + " pour garder le risque au plus bas." : "Tout l'effectif disponible est frais.") + "</div></section></aside></div>";

    holder.innerHTML = '<div class="md-root">' + h + "</div>";
    // Le titre est dans l'en-tête (pas de doublon avec celui de la section).
    var sec = document.getElementById("medicalSection"), pt = sec && sec.querySelector(".page-title");
    if (pt) pt.style.display = "none";
    if (!holder.__mdBound) {
      holder.__mdBound = true;
      holder.addEventListener("click", function (e) {
        var b = e.target.closest("[data-med-filter]");
        if (b) { state.filter = b.dataset.medFilter; render(); return; }
        var H = G("TAB_HANDLERS") || {};
        if (e.target.closest("#medicalGoStaff") && H.staff) H.staff();
        else if (e.target.closest("#medicalGoSalle") && H.salle) H.salle();
      });
    }
  }
  window.HM_MEDICAL_UI = { render: render, setFilter: function (k) { state.filter = k; }, riskFor: riskFor };
})();
