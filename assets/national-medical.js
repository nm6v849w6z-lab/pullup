// =====================================================================
// CENTRE MÉDICAL DU MODE SÉLECTION (2026-10-09) : état physique des
// convoqués, des présélectionnés et de tout le vivier sélectionnable, avant
// de choisir la liste et les ordres. Mêmes repères que le Centre médical du
// club (assets/medical-ui.js : états de fatigue, couleurs, styles .md-*),
// UNIQUEMENT à partir des données médicales existantes envoyées par le
// serveur pour chaque joueur du vivier (server/nationalCoach.js:coachPlayer) :
//   - condition (fatigue du jour, récupération du club comprise),
//   - injuryUntil / injuryType (blessure en cours et date de retour),
//   - form (moral en club), club, âge, poste.
// Disponibilité au prochain match = retour de blessure avant / après la
// date du match. Risque de blessure = multiplicateur de l'état de fatigue
// (CONDITION_STATES.injuryMult, comme le moteur) ; les installations du club
// du joueur (salle, kiné) ne sont pas connues ici : non comptées (indiqué).
// Rien n'est inventé : sans donnée, la case reste « – ».
// Chargé à la demande par assets/national-coach.js (rubrique « Centre
// médical ») : window.HM_NATIONAL_MEDICAL.html(ctx).
// =====================================================================
(function () {
  "use strict";
  var state = { tab: "conv" };   // "conv" | "pre" | "pool" | "injured"
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function M() { return window.HM_MEDICAL_UI || null; }
  function states() { try { return typeof CONDITION_STATES !== "undefined" ? CONDITION_STATES : []; } catch (e) { return []; } }
  function day(at) { var f = window.formatCalendarDayFr; return typeof f === "function" ? f(at) : new Date(at).toLocaleDateString("fr-FR"); }
  function plural(n, a, b) { return n + " " + (n > 1 ? (b || a + "s") : a); }
  // État de fatigue (index 0 = pas de fatigue … 4 = épuisé) et risque.
  function stateOf(x) {
    var st = states(), c = typeof x.condition === "number" ? x.condition : null;
    if (c == null || !st.length) return null;
    var i = Math.max(0, st.findIndex(function (s) { return c >= s.min; }));
    var m = M(), tiers = (m && m.RISK_TIERS) || [];
    var mult = st[i] ? st[i].injuryMult : 1;
    var tier = tiers.filter(function (t) { return mult < t.max; })[0] || tiers[tiers.length - 1] || { key: "normal", label: "Normal", color: "#9AA6BF" };
    return { idx: Math.min(4, i), label: st[i] ? st[i].label : "", mult: mult, tier: tier, condition: c };
  }
  function injured(x, now) { return typeof x.injuryUntil === "number" && x.injuryUntil > now; }
  // Disponible pour le prochain match ? (retour avant le coup d'envoi)
  function availability(x, next, now) {
    if (!injured(x, now)) return { key: "ok", label: "Apte", color: "#34D399" };
    if (next && x.injuryUntil <= next.at) return { key: "back", label: "De retour pour le match", color: "#F5C04A" };
    return { key: "out", label: next ? "Forfait pour le match" : "Indisponible", color: "#F87171" };
  }

  function html(ctx) {
    var m = M();
    if (m && m.css) m.css();
    var now = Date.now(), v = ctx.view, next = ctx.next || null;
    var pool = (v.pool && v.pool.players) || [];
    var byKey = {}; pool.forEach(function (x) { byKey[x.p + "|" + x.n] = x; });
    var refs = function (list) { return (list || []).map(function (r) { return byKey[r.p + "|" + r.n]; }).filter(Boolean); };
    var conv = refs(ctx.convRefs), pre = refs(v.preselection);
    var inConv = {}; conv.forEach(function (x) { inConv[x.p + "|" + x.n] = 1; });
    var inPre = {}; pre.forEach(function (x) { inPre[x.p + "|" + x.n] = 1; });
    var hurt = pool.filter(function (x) { return injured(x, now); });
    var lists = { conv: conv, pre: pre, pool: pool, injured: hurt };
    var tab = lists[state.tab] ? state.tab : "conv";
    var list = lists[tab].slice();

    // Bandeau : convoqués disponibles, blessés (convoqués / présélection / vivier), à risque, prochain match.
    var convOut = conv.filter(function (x) { return availability(x, next, now).key === "out"; });
    var watchHurt = hurt.filter(function (x) { return inConv[x.p + "|" + x.n] || inPre[x.p + "|" + x.n]; });
    var risky = conv.concat(pre.filter(function (x) { return !inConv[x.p + "|" + x.n]; })).filter(function (x) { var s = stateOf(x); return !injured(x, now) && s && (s.tier.key === "high" || s.tier.key === "veryhigh"); });
    var kpi = function (lab, n, sub, col, id) { return '<div class="md-kpi"' + (id ? ' id="' + id + '"' : "") + '><div class="md-l">' + esc(lab) + '</div><div class="md-n md-cond"' + (col ? ' style="color:' + col + '"' : "") + ">" + n + '</div><div class="md-s">' + sub + "</div></div>"; };
    var h = '<div class="md-root nc-med">';
    h += '<section class="md-kpis">' +
      kpi("Convoqués aptes", (conv.length - convOut.length) + "<small>/" + conv.length + "</small>", next ? "pour " + esc(next.label || "le prochain match") : "Aucun match à venir", convOut.length ? "#F5A524" : "", "ncMedAvail") +
      kpi("Blessés suivis", watchHurt.length, "convoqués et présélectionnés", watchHurt.length ? "#F87171" : "", "ncMedHurt") +
      kpi("À risque", risky.length, "fatigue élevée (convoqués, présélection)", risky.length ? "#F5A524" : "", "ncMedRisk") +
      kpi("Vivier", pool.length, plural(hurt.length, "blessé") + " parmi les sélectionnables", "", "ncMedPool") + "</section>";

    var tabs = [["conv", "Convoqués", conv.length], ["pre", "Présélection", pre.length], ["injured", "Blessés", hurt.length], ["pool", "Tout le vivier", pool.length]].map(function (t) {
      var on = tab === t[0];
      return '<button type="button" class="' + (on ? "active" : "") + '" data-nc-med-tab="' + t[0] + '" aria-pressed="' + on + '">' + esc(t[1]) + " <span>" + t[2] + "</span></button>";
    }).join("");
    h += '<div class="vs-tabs" role="group" aria-label="Filtrer">' + tabs + "</div>";

    // Liste : blessés d'abord (retour le plus lointain en tête), puis les plus fatigués.
    list.sort(function (a, b) {
      var ia = injured(a, now), ib = injured(b, now);
      if (ia !== ib) return ib - ia;
      if (ia) return b.injuryUntil - a.injuryUntil;
      return (a.condition == null ? 999 : a.condition) - (b.condition == null ? 999 : b.condition);
    });
    var rows = list.map(function (x) {
      var s = stateOf(x), av = availability(x, next, now), k = x.p + "|" + x.n, hurtNow = injured(x, now);
      var tag = inConv[k] ? '<span class="nc-med-tag is-conv">Convoqué</span>' : inPre[k] ? '<span class="nc-med-tag">Présélection</span>' : "";
      var who = '<div class="md-who"><div>' + (ctx.profile ? ctx.profile(x) : "<b>" + esc(x.name) + "</b>") + tag +
        '<div class="md-pos"><b>' + esc(ctx.pos ? ctx.pos(x.position) : x.position || "") + "</b><span>" + esc(x.age != null ? x.age + " ans" : "") + (x.club && x.club.name ? " · " + esc(x.club.name) : "") + "</span></div></div></div>";
      var mid = hurtNow
        ? '<span class="md-tag" title="' + esc(x.injuryType || "Blessure") + '">' + esc(x.injuryType || "Blessure") + "</span>"
        : s ? '<div class="md-fat">' + (m && m.segsHtml ? m.segsHtml(s.idx) : "") + '<div style="color:' + ((m && m.FATIGUE && m.FATIGUE[s.idx].color) || "inherit") + '">' + esc(s.label) + " · " + Math.round(s.condition) + " %</div></div>" : "–";
      var end = hurtNow
        ? '<div class="md-days">' + plural(Math.max(1, Math.ceil((x.injuryUntil - now) / 864e5)), "jour") + '</div><div class="md-back">retour ' + esc(day(x.injuryUntil)) + "</div>"
        : (s && m && m.riskHtml ? m.riskHtml(s) : "");
      var avail = '<span class="nc-med-av" style="color:' + av.color + '" data-nc-med-av="' + av.key + '">' + esc(av.label) + "</span>";
      // Téléphone : la colonne fatigue est masquée (styles du club) → rappel sous la disponibilité.
      if (!hurtNow && s) avail += '<span class="nc-med-mob" style="color:' + ((m && m.FATIGUE && m.FATIGUE[s.idx].color) || "inherit") + '">' + esc(s.label) + " · " + Math.round(s.condition) + " %</span>";
      return '<div class="md-grid md-row nc-med-row' + (hurtNow ? " is-injured" : "") + '" data-nc-med-row="' + esc(k) + '"><div>' + who + '</div><div class="md-c-fat">' + mid + '</div><div class="md-c-end">' + end + avail + "</div></div>";
    }).join("");
    var empty = { conv: "Aucun joueur convoqué pour le moment.", pre: "Présélection vide.", injured: "Aucun joueur blessé dans le vivier.", pool: "Vivier en cours de préparation." }[tab];
    h += '<section class="md-panel"><div class="md-table"><div class="md-grid md-th"><div>Joueur</div><div class="md-c-fat">Fatigue / blessure</div><div class="md-c-end">Risque · disponibilité</div></div>' +
      (rows || '<p class="md-s" style="padding:18px 22px">' + esc(empty) + "</p>") + "</div></section>";
    h += '<p class="md-s nc-med-note">Données du jour (fatigue après récupération dans le club, blessures en cours). Risque de blessure selon la fatigue, comme le moteur de match ; les installations du club du joueur ne sont pas prises en compte ici.' +
      (next ? " Disponibilité calculée pour le " + esc(String(day(next.at)).replace(/\.$/, "")) + "." : "") + "</p></div>";
    return h;
  }
  var CSS = ".nc-med .md-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.nc-med-tag{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:5px;font-size:10.5px;font-weight:700;background:rgba(125,162,255,.14);color:#7DA2FF;vertical-align:1px}.nc-med-tag.is-conv{background:rgba(240,162,60,.16);color:#F0A23C}" +
    ".nc-med-av{display:block;margin-top:4px;font-size:11.5px;font-weight:700}.nc-med .vs-tabs{margin:4px 0 12px}.nc-med-note{margin:10px 2px 0;font-size:12.5px;line-height:1.45;color:var(--ink-dim)}" +
    ".nc-med .md-who>div{min-width:0}.nc-med-tag{width:fit-content}.nc-med-mob{display:none;margin-top:2px;font-size:11px;font-weight:600}" +
    "@media (max-width:720px){.nc-med .md-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.nc-med-mob{display:block}}";
  function ensureCss() { if (document.getElementById("ncMedCss")) return; var s = document.createElement("style"); s.id = "ncMedCss"; s.textContent = CSS; document.head.appendChild(s); }
  window.HM_NATIONAL_MEDICAL = {
    html: function (ctx) { ensureCss(); return html(ctx); },
    setTab: function (t) { state.tab = t; },
    get tab() { return state.tab; },
    availability: availability, stateOf: stateOf,
  };
})();
