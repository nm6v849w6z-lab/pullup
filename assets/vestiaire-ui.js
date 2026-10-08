// =====================================================================
// Onglet « Vestiaire » (2026-10-06, refonte visuelle du 2026-10-07 d'après
// les maquettes « Vestiaire — refonte » : Vue générale, Hiérarchie,
// Groupes, Relations, Évolution) : rendu de la vue calculée par
// assets/vestiaire.js (window.HM_VESTIAIRE.buildView) sur le club du
// manager (teamA). Aucune logique de jeu ici : uniquement de l'affichage et
// des liens vers les actions QUI EXISTENT déjà (fiche joueur, où se
// trouvent discussion / contrat / mise en vente ; Tactiques pour la compo
// et les rôles ; Entraînement pour le tutorat).
// Couleurs : fonds et textes du thème du jeu (clair / sombre), accents des
// maquettes (vert = bien, ambre = moyen, rouge = problème).
// =====================================================================
(function () {
  "use strict";
  var state = { tab: "overview", allRows: false };
  // Contexte d'affichage : null = club du manager (teamA). Le mode
  // Sélectionneur passe sa propre équipe (même vue, même calcul, voir
  // assets/national-coach.js:vestiaireMount) : { holder, team, recent,
  // link(p), playerAttrs(p), noTalk, lineupAttrs }.
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
  function nation(code) { var f = g("nationName"); return code ? (f ? f(code) : String(code).toUpperCase()) : ""; }
  function initials(name) { return String(name || "").split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }
  function lastName(name) { var s = String(name || "").split(" "); return s.length > 1 ? s.slice(1).join(" ") : s[0]; }

  // Couleurs des maquettes.
  var C = { good: "#34D399", ok: "#A3E635", mid: "#FBBF24", warn: "#FB923C", bad: "#F87171", purple: "#A78BFA", blue: "#60A5FA" };
  var MOOD_COLOR = { happy: C.good, content: C.ok, neutral: C.mid, frustrated: C.warn, unhappy: C.bad };
  var STATE_COLOR = { united: C.good, good: C.ok, ok: C.mid, tense: C.warn, crisis: C.bad };
  var GROUP_COLORS = ["#60A5FA", "#38BDF8", "#A78BFA", "#F87171", "#34D399", "#F472B6", "#FBBF24", "#2DD4BF"];
  function levelWord(v) { return v >= 75 ? "Très haut" : v >= 58 ? "Bon" : v >= 42 ? "Moyen" : v >= 25 ? "Bas" : "Très bas"; }
  // Mode Club (2026-10-07) : les 4 indicateurs (ambiance, cohésion, moral,
  // confiance) suivent le barème commun du jeu, radarTierColor (rouge ≤ 20,
  // jaune ≤ 50, blanc ≤ 80, vert au-delà ; attributs, Cohérence du cinq),
  // avec un mot par palier. Le Mode Sélection garde son rendu.
  function clubTier(v) {
    var f = !ctx && g("radarTierColor");
    if (!f) return null;
    return { color: f(v), word: v <= 20 ? "Faible" : v <= 50 ? "Moyen" : v <= 80 ? "Bon" : "Élevé" };
  }
  function soft(col, pct) { return /^#/.test(col) ? tint(col, pct / 100) : "color-mix(in srgb, " + col + " " + pct + "%, transparent)"; }
  function toneColor(v) { return v >= 75 ? C.good : v >= 58 ? C.ok : v >= 42 ? C.mid : v >= 25 ? C.warn : C.bad; }
  function tint(col, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(col);
    if (!m) return "rgba(255,255,255,.08)";
    var n = parseInt(m[1], 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function svgIcon(path, col, size, sw) { return '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="' + (col || "currentColor") + '" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>"; }
  var P = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    lever: '<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    up: '<path d="M4 16l6-6 4 4 6-7"/><path d="M15 7h5v5"/>',
    down: '<path d="M4 8l6 6 4-4 6 7"/><path d="M15 17h5v-5"/>',
    flat: '<path d="M4 12h16"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  };

  function ensureCss() {
    if (document.getElementById("vsCss")) return;
    var s = document.createElement("style");
    s.id = "vsCss";
    s.textContent = [
      ".vs-root{--vs-card:var(--panel,#121826);--vs-in:var(--panel-2,#0E1420);--vs-line:var(--line,#222B3E);--vs-dim:var(--ink-dim,#A3ACBF);--vs-faint:var(--ink-faint,#8A94A8);--vs-acc:var(--amber,#F59E0B);display:flex;flex-direction:column;gap:18px;color:var(--ink)}",
      ".vs-root .vs-cond{font-family:'Barlow Condensed','Arial Narrow','Roboto Condensed',system-ui,sans-serif;font-stretch:condensed}",
      ".vs-card{background:var(--vs-card);border:1px solid var(--vs-line);border-radius:18px;padding:22px;box-sizing:border-box;min-width:0}",
      ".vs-eyebrow{font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;text-transform:uppercase;letter-spacing:.14em;font-size:13px;font-weight:700;color:var(--vs-faint);margin:0}",
      ".vs-h2{margin:0;font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:800;font-size:28px;text-transform:uppercase;line-height:1.05}",
      ".vs-h3{margin:0;font-size:18px;font-weight:700}",
      ".vs-big{font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:800;line-height:1}",
      ".vs-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px}",
      // Onglets : composant commun .vs-tabs (CSS dans moteurbasket3.html).
      ".vs-head h1{margin:2px 0 0;font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:800;font-size:42px;text-transform:uppercase;line-height:1}",
      ".vs-hero{display:flex;flex-wrap:wrap;gap:28px;align-items:center}",
      ".vs-ring{position:relative;width:156px;height:156px;flex:none}.vs-ring>div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}",
      ".vs-ring b{font-size:56px}.vs-ring small{font-size:12px;color:var(--vs-faint);font-weight:600}",
      ".vs-hero-main{flex:1 1 300px;display:flex;flex-direction:column;gap:9px;min-width:0}",
      ".vs-state{margin:0;font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:800;font-size:38px;line-height:1.05}",
      ".vs-why{margin:0;font-size:16px;color:var(--vs-dim);line-height:1.5;max-width:540px}",
      ".vs-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}",
      ".vs-pill{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;background:var(--vs-in);color:var(--vs-dim)}",
      ".vs-lever{flex:1 1 280px;max-width:420px;background:var(--vs-in);border:1px solid var(--vs-line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:9px}",
      ".vs-lever p{margin:0;font-size:15px;line-height:1.55}",
      ".vs-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}",
      ".vs-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}",
      ".vs-pillar{display:flex;flex-direction:column;gap:12px}",
      ".vs-row{display:flex;justify-content:space-between;align-items:center;gap:10px}",
      ".vs-verdict{font-size:13px;font-weight:700;padding:4px 10px;border-radius:999px}",
      ".vs-seg{position:relative;height:10px;border-radius:999px;background:var(--vs-in);overflow:hidden}.vs-seg>i{display:block;height:100%;border-radius:999px}",
      ".vs-seg::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 2px),var(--vs-card) calc(10% - 2px) 10%)}",
      ".vs-text{margin:0;font-size:14px;line-height:1.5;color:var(--vs-dim)}",
      ".vs-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}",
      ".vs-li{display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--vs-in);border-radius:12px;font-size:15px}",
      ".vs-ic{width:28px;height:28px;flex:none;border-radius:8px;display:grid;place-items:center}",
      ".vs-alert{padding:16px;border-radius:14px;display:flex;gap:14px;align-items:flex-start}",
      ".vs-alert strong{display:block;font-size:15px;margin-bottom:4px}.vs-alert .vs-act{margin-left:auto;flex:none;align-self:center}",
      ".vs-btn{min-height:36px;border:1px solid var(--vs-line);background:var(--vs-card);color:var(--ink);border-radius:10px;padding:0 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}",
      ".vs-btn:hover{border-color:var(--vs-acc)}",
      ".vs-empty{color:var(--vs-dim);font-size:14px;margin:0}",
      ".vs-av{width:34px;height:34px;border-radius:18%;background:var(--vs-in);display:inline-grid;place-items:end center;overflow:hidden;flex:none;font-weight:700;font-size:12px;box-sizing:border-box}",
      ".vs-av .player-avatar{width:30px!important;height:33px!important;border-radius:0!important}",
      ".vs-av.vs-av-ini{place-items:center}",
      ".vs-person{display:flex;align-items:center;gap:10px;padding:6px 14px 6px 6px;background:var(--vs-in);border:1px solid var(--vs-line);border-radius:999px;min-width:0}",
      ".vs-person>div{display:flex;flex-direction:column;min-width:0}.vs-person small{font-size:12px;color:var(--vs-faint)}",
      ".vs-person .player-link,.vs-chip .player-link{font-weight:600;font-size:14px}",
      ".vs-chips{display:flex;flex-wrap:wrap;gap:8px}",
      ".vs-chip{display:inline-flex;align-items:center;gap:8px;padding:4px 12px 4px 4px;border-radius:999px;background:var(--vs-card);border:1px solid var(--vs-line);font-size:14px}",
      ".vs-chip .vs-av{width:30px;height:30px}.vs-chip .vs-av .player-avatar{width:27px!important;height:29px!important}",
      ".vs-gchip{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border-radius:10px;background:var(--vs-in);border:1px solid var(--vs-line);color:var(--ink);font:inherit;font-size:14px;font-weight:500;cursor:pointer}",
      ".vs-dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}",
      ".vs-wk{font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:700;font-size:14px;padding:6px 10px;border-radius:8px;background:var(--vs-in);color:var(--vs-dim);white-space:nowrap}",
      ".vs-pyr{display:flex;flex-direction:column;gap:10px;align-items:center}",
      ".vs-tier{width:100%;display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:13px 16px;border-radius:16px;background:var(--vs-in);border:1px solid var(--vs-line);box-sizing:border-box}",
      ".vs-tier-name{display:flex;align-items:center;gap:12px;flex:0 0 210px}.vs-tier-name strong{display:block;font-size:15px}.vs-tier-name small{font-size:12px;color:var(--vs-faint)}",
      ".vs-rank{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-size:20px;flex:none}",
      ".vs-legend{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;font-size:13px;color:var(--vs-dim)}.vs-legend span{display:inline-flex;align-items:center;gap:8px}",
      ".vs-ring-dot{width:12px;height:12px;border-radius:50%;border:2px solid;box-sizing:border-box}",
      ".vs-moodbar{display:flex;height:12px;border-radius:999px;overflow:hidden;gap:2px}",
      ".vs-wrap{overflow-x:auto}",
      ".vs-table{width:100%;border-collapse:collapse;min-width:760px}",
      ".vs-table th{font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;text-transform:uppercase;letter-spacing:.12em;font-size:12px;font-weight:700;color:var(--vs-faint);text-align:left;padding:0 12px 10px}",
      ".vs-table td{padding:11px 12px;border-top:1px solid var(--vs-line);font-size:14px;vertical-align:middle}",
      ".vs-table .vs-reasons{color:var(--vs-dim);font-size:13px;white-space:normal;max-width:300px}",
      ".vs-who{display:flex;align-items:center;gap:12px}.vs-who>div{display:flex;flex-direction:column}.vs-who small{font-size:12px;color:var(--vs-faint)}",
      ".vs-infl{display:flex;align-items:center;gap:10px}.vs-infl>span:first-child{width:90px;height:6px;border-radius:999px;background:var(--vs-in);overflow:hidden}.vs-infl i{display:block;height:100%;background:var(--vs-acc)}",
      ".vs-mood{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-weight:600;font-size:13px;white-space:nowrap}",
      ".vs-more{align-self:center;min-height:44px;padding:0 22px;border-radius:12px;border:1px solid var(--vs-line);background:var(--vs-card);color:var(--ink);font:inherit;font-weight:600;font-size:14px;cursor:pointer}",
      ".vs-kpi{display:flex;flex-direction:column;gap:6px}.vs-kpi b{font-size:42px}.vs-kpi b small{font-size:21px;color:var(--vs-faint)}",
      ".vs-groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px}",
      ".vs-group{padding:0;overflow:hidden;display:flex;flex-direction:column}.vs-group>i{display:block;height:6px}",
      ".vs-group>div{padding:20px;display:flex;flex-direction:column;gap:14px;flex:1}",
      ".vs-group h4{margin:0;font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:800;font-size:24px;line-height:1.05;text-transform:uppercase}",
      ".vs-stack{display:flex;align-items:center}.vs-stack .vs-av{width:44px;height:44px;margin-right:-10px;border:3px solid var(--vs-card)}.vs-stack .vs-av .player-avatar{width:38px!important;height:41px!important}",
      ".vs-members{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:15px}.vs-members li{display:flex;align-items:center;gap:8px}",
      ".vs-bond{font-size:12px;font-weight:600;padding:5px 10px;border-radius:8px;background:var(--vs-in);color:var(--vs-dim)}",
      ".vs-gfoot{margin-top:auto;display:flex;flex-direction:column;gap:8px;padding-top:14px;border-top:1px solid var(--vs-line)}",
      ".vs-bar6{height:6px;border-radius:999px;background:var(--vs-in);overflow:hidden}.vs-bar6>i{display:block;height:100%}",
      ".vs-solo{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}",
      ".vs-solo>div{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:12px;background:var(--vs-in);border:1px solid var(--vs-line)}.vs-solo small{display:block;font-size:12px;color:var(--vs-faint)}",
      ".vs-split{display:flex;flex-wrap:wrap;gap:18px;align-items:stretch}.vs-split>.vs-main{flex:999 1 600px;min-width:0}.vs-split>.vs-side{flex:1 1 320px;display:flex;flex-direction:column;gap:18px;min-width:0}",
      ".vs-fig{margin:0;background:var(--vs-in);border:1px solid var(--vs-line);border-radius:14px;padding:8px}",
      ".vs-graph{display:block;width:100%;height:auto}.vs-graph text{font-size:12px;font-weight:600;fill:var(--ink)}.vs-graph text.dim{fill:var(--vs-faint);font-weight:500;font-size:11px}.vs-graph text.zone{font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:12px}",
      ".vs-graph g[data-player-id],.vs-graph g[data-nc-profile]{cursor:pointer}",
      ".vs-pair{display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:12px;background:var(--vs-in)}.vs-pair>div:last-child{display:flex;flex-direction:column;min-width:0;font-size:14px}.vs-pair small{font-size:12px;color:var(--vs-faint)}",
      ".vs-pair .vs-duo{display:flex;flex:none}.vs-pair .vs-duo .vs-av{width:32px;height:32px;border:2px solid var(--vs-card)}.vs-pair .vs-duo .vs-av+.vs-av{margin-left:-8px}",
      ".vs-calm{display:flex;align-items:center;gap:14px;padding:16px;border-radius:12px;border:1px dashed var(--vs-line);font-size:14px;color:var(--vs-dim);line-height:1.5}",
      ".vs-chart{display:block;width:100%;height:auto}.vs-chart text{font-size:12px;fill:var(--vs-faint)}",
      ".vs-tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}",
      ".vs-tl li{display:grid;grid-template-columns:62px 22px 1fr;gap:12px;align-items:start}",
      ".vs-tl .vs-tl-w{font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;font-stretch:condensed;font-weight:700;font-size:15px;color:var(--vs-dim);padding-top:14px}",
      ".vs-tl .vs-tl-dot{display:flex;flex-direction:column;align-items:center;height:100%}.vs-tl .vs-tl-dot>span:first-child{width:13px;height:13px;margin-top:16px;border-radius:50%}.vs-tl .vs-tl-dot>span:last-child{flex:1;width:2px;min-height:18px;background:var(--vs-line)}",
      ".vs-tl .vs-tl-card{padding:12px 16px;border-radius:14px;background:var(--vs-in);border:1px solid var(--vs-line);display:flex;align-items:center;gap:12px;margin-bottom:10px;font-size:15px}",
      ".vs-driver{display:flex;gap:12px;align-items:flex-start}.vs-driver>span{width:10px;height:10px;margin-top:6px;flex:none;border-radius:3px}.vs-driver strong{display:block;font-size:15px}",
      // Mode Club : même police que les autres pages (pile système du jeu,
      // var(--display)), titres comme h2.page-title / .lg-panel-title h2,
      // petits intitulés comme .cal-card-kicker. Mode Sélection inchangé.
      ".vs-root.vs-club,.vs-root.vs-club .vs-cond,.vs-root.vs-club .vs-eyebrow,.vs-root.vs-club .vs-h2,.vs-root.vs-club .vs-big,.vs-root.vs-club .vs-head h1,.vs-root.vs-club .vs-state,.vs-root.vs-club .vs-table th,.vs-root.vs-club .vs-wk,.vs-root.vs-club .vs-tl .vs-tl-w,.vs-root.vs-club .vs-group h4,.vs-root.vs-club button{font-family:var(--display,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif);font-stretch:normal}",
      ".vs-root.vs-club .vs-head h1{font-size:40px;font-weight:800;letter-spacing:-.01em;text-transform:none}",
      ".vs-root.vs-club .vs-h2{font-size:22px;font-weight:800;text-transform:none;letter-spacing:0}.vs-root.vs-club .vs-group h4{font-size:20px;text-transform:none}",
      ".vs-root.vs-club .vs-eyebrow,.vs-root.vs-club .vs-table th{font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--ink-dim)}",
      ".vs-root.vs-club .vs-state{font-size:32px;letter-spacing:-.01em}.vs-root.vs-club .vs-big{font-variant-numeric:tabular-nums;letter-spacing:-.01em}",
      "@media (max-width:720px){.vs-root.vs-club .vs-head h1{font-size:32px}}",
      // Entretiens et communication (2026-10-08).
      ".vs-tk{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-top:1px solid var(--vs-line)}.vs-tk:first-of-type{border-top:0}",
      ".vs-tk>.vs-dot{margin-top:7px;width:10px;height:10px}.vs-tk>div{flex:1;min-width:0}.vs-tk strong{font-size:15px}",
      ".vs-tag{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;vertical-align:1px}",
      ".vs-tk .vs-text{font-size:13px;margin-top:3px}",
      ".vs-btn.vs-go{background:var(--vs-acc);border-color:var(--vs-acc);color:#1A1205;font-weight:800}.vs-btn[disabled]{opacity:.55;cursor:default}",
      ".vs-cons{display:flex;align-items:baseline;gap:8px}.vs-cons b{font-size:34px}",
      ".vs-gauge{height:8px;border-radius:999px;background:var(--vs-in);overflow:hidden}.vs-gauge>i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#F87171,#FBBF24 45%,#34D399)}",
      ".vs-mini{display:flex;flex-direction:column;gap:2px;padding:10px 0;border-top:1px solid var(--vs-line);font-size:14px}.vs-mini:first-of-type{border-top:0}.vs-mini small{color:var(--vs-faint);font-size:12px}",
      ".vs-mini .vs-row{align-items:flex-start}",
      ".vs-hist{display:grid;grid-template-columns:90px 1fr auto;gap:10px;padding:8px 0;border-top:1px solid var(--vs-line);font-size:13px}.vs-hist:first-of-type{border-top:0}",
      ".vs-talk-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.vs-talk-kpis>div{background:var(--vs-in);border-radius:10px;padding:8px 10px}.vs-talk-kpis small{display:block;font-size:11px;color:var(--vs-faint)}.vs-talk-kpis b{font-size:16px}",
      ".vs-quote{margin:0;padding:10px 14px;border-left:3px solid var(--vs-acc);background:var(--vs-in);border-radius:8px;font-style:italic;font-size:14px}",
      ".vs-choice{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:11px 12px;border-radius:12px;border:1px solid var(--vs-line);background:var(--vs-card);color:var(--ink);font:inherit;cursor:pointer}",
      ".vs-choice:hover,.vs-choice.on{border-color:var(--vs-acc)}.vs-choice>span{flex:none;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;background:var(--vs-in);color:var(--vs-acc);font-weight:800}",
      ".vs-choice strong{display:block;font-size:14px}.vs-choice small{display:block;font-size:12.5px;color:var(--vs-dim);margin-top:2px}",
      ".vs-talk-box{display:flex;flex-direction:column;gap:12px;max-width:620px;width:100%;text-align:left}",
      "@media (max-width:720px){.vs-talk-kpis{grid-template-columns:repeat(2,1fr)}.vs-hist{grid-template-columns:70px 1fr auto}}",
      "@media (max-width:720px){.vs-root{gap:14px}.vs-card{padding:16px;border-radius:14px}.vs-head h1{font-size:34px}.vs-tabs{width:100%}.vs-tabs button{flex:1 1 auto;padding:0 10px;font-size:13px}.vs-ring{width:120px;height:120px}.vs-ring b{font-size:42px}.vs-state{font-size:30px}.vs-tier-name{flex-basis:100%}.vs-grid2{grid-template-columns:1fr}.vs-tl li{grid-template-columns:50px 18px 1fr;gap:8px}}",
    ].join("\n");
    document.head.appendChild(s);
  }

  // --- Composants -------------------------------------------------------------
  function teamPlayer(p) { var t = myTeam(); return t && Array.isArray(t.players) ? t.players.find(function (x) { return String(x.id) === String(p.id); }) : null; }
  // Avatar du joueur (même visage que partout dans le jeu), initiales à défaut.
  function avatar(p, ring, size) {
    var f = g("playerAvatarHtml"), real = teamPlayer(p);
    // Plus de contour coloré autour de l'avatar (règle du jeu, 2026-10-07).
    var st = "";
    if (f && real) { try { return '<span class="vs-av"' + st + ">" + f(real, myTeam(), size || 30) + "</span>"; } catch (e) { /* initiales */ } }
    return '<span class="vs-av vs-av-ini"' + st + ">" + esc(initials(p.name)) + "</span>";
  }
  function chip(p) { return '<span class="vs-chip">' + avatar(p, MOOD_COLOR[p.mood]) + link(p) + "</span>"; }
  function moodPill(p) { var c = MOOD_COLOR[p.mood] || C.mid; return '<span class="vs-mood" style="background:' + tint(c, 0.13) + ";color:" + c + '"><span class="vs-dot" style="background:' + c + '"></span>' + esc(p.label) + "</span>"; }
  function seg(v, col) { return '<div class="vs-seg"><i style="width:' + Math.max(2, Math.min(100, v)) + "%;background:" + col + '"></i></div>'; }
  function actionBtn(item, v) {
    var pid = item.player != null ? item.player : (item.players && item.players[0]);
    var p = pid != null ? v.players.find(function (x) { return String(x.id) === String(pid); }) : null;
    if (item.action === "talk" && p) return '<button type="button" class="vs-btn" ' + playerAttrs(p) + ">" + (ctx && ctx.noTalk ? "Voir le joueur" : "Lui parler") + "</button>";
    if (item.action === "profile" && p) return '<button type="button" class="vs-btn" ' + playerAttrs(p) + ">Voir le joueur</button>";
    if (item.action === "lineup") return '<button type="button" class="vs-btn" ' + ((ctx && ctx.lineupAttrs) || 'data-tab="tactiques"') + ">Revoir les rôles</button>";
    return "";
  }
  function ringSvg(score, col) {
    var r = 64, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score));
    return '<div class="vs-ring"><svg viewBox="0 0 156 156" width="100%" height="100%" aria-hidden="true">' +
      '<circle cx="78" cy="78" r="' + r + '" fill="none" stroke="var(--vs-in)" stroke-width="13"/>' +
      '<circle cx="78" cy="78" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="13" stroke-linecap="round" stroke-dasharray="' + (c * v / 100).toFixed(1) + " " + c.toFixed(1) + '" transform="rotate(-90 78 78)"/>' +
      '<circle cx="78" cy="78" r="49" fill="none" stroke="var(--vs-line)" stroke-width="1"/></svg>' +
      '<div><b class="vs-big">' + Math.round(v) + "</b><small>sur 100</small></div></div>";
  }
  // Levier prioritaire : la jauge la plus basse dit quoi faire.
  function leverText(v) {
    if (v.counts.frustrated >= 2 && v.mood < v.cohesion) return "Plusieurs joueurs sont frustrés : parlez-leur (fiche du joueur) et revoyez les rôles et le temps de jeu dans les Tactiques.";
    var low = [["cohesion", v.cohesion], ["mood", v.mood], ["confidence", v.confidence]].sort(function (a, b) { return a[1] - b[1]; })[0][0];
    if (low === "cohesion") return "La cohésion se construit en jouant et en gagnant ensemble. Évitez de chambouler l'effectif dans les semaines qui viennent.";
    if (low === "mood") return "Le moral dépend de la place de chacun : temps de jeu, rôle, contrat. Commencez par les joueurs influents qui ne sont pas satisfaits.";
    return "La confiance revient avec les résultats : gardez un cinq stable et appuyez-vous sur vos leaders pour enchaîner les victoires.";
  }

  // --- Vue générale ------------------------------------------------------------
  function overviewHtml(v) {
    var ct = clubTier(v.state.score);
    var col = ct ? ct.color : (STATE_COLOR[v.state.key] || C.mid);
    var why = v.problems.length ? v.problems[0].text : v.positives.length ? v.positives[0].text : "Rien à signaler pour l'instant.";
    var trendIc = v.trend.key === "up" ? P.up : v.trend.key === "down" ? P.down : v.trend.key === "flat" ? P.flat : "";
    var fr = v.counts.frustrated;
    var hero = '<section class="vs-card vs-hero">' + ringSvg(v.state.score, col) +
      '<div class="vs-hero-main"><p class="vs-eyebrow">Ambiance du vestiaire</p><p class="vs-state" style="color:' + col + '">' + esc(v.state.label) + "</p>" +
      '<p class="vs-why">' + esc(why) + "</p>" +
      '<div class="vs-pills"><span class="vs-pill">' + (trendIc ? svgIcon(trendIc, null, 15, 2.4) : "") + esc(v.trend.label) + "</span>" +
      '<span class="vs-pill" style="background:' + tint(fr ? C.warn : C.good, 0.13) + ";color:" + (fr ? C.warn : C.good) + '">' + fr + " joueur" + (fr > 1 ? "s" : "") + " frustré" + (fr > 1 ? "s" : "") + "</span></div></div>" +
      '<div class="vs-lever"><div class="vs-row" style="justify-content:flex-start">' + svgIcon(P.lever, "var(--vs-acc)", 20) + '<p class="vs-eyebrow" style="color:var(--vs-acc)">Levier prioritaire</p></div><p>' + esc(leverText(v)) + "</p></div></section>";
    var pillar = function (label, value, text, shown) {
      var ct = clubTier(value), c = ct ? ct.color : toneColor(value);
      return '<article class="vs-card vs-pillar"><div class="vs-row"><p class="vs-eyebrow">' + esc(label) + '</p><span class="vs-verdict" style="background:' + soft(c, 14) + ";color:" + c + '">' + esc(ct ? ct.word : levelWord(value)) + "</span></div>" +
        '<div style="display:flex;align-items:baseline;gap:6px"><b class="vs-big" style="font-size:54px">' + Math.round(shown != null ? shown : value) + '</b><span style="color:var(--vs-faint);font-weight:600">/100</span></div>' +
        seg(value, c) + '<p class="vs-text">' + esc(text) + "</p></article>";
    };
    var pillars = '<section class="vs-grid3">' +
      pillar("Cohésion", v.cohesion, "L'alchimie du groupe (de 40 à 100) : se construit en jouant et en gagnant ensemble, s'abîme quand l'effectif change.") +
      pillar("Moral", v.mood, v.counts.satisfied + " satisfait" + (v.counts.satisfied > 1 ? "s" : "") + ", " + fr + " frustré" + (fr > 1 ? "s" : "") + ". Les joueurs influents pèsent plus.") +
      pillar("Confiance", v.confidence, "Portée par les derniers résultats.") + "</section>";
    var good = v.positives.length ? v.positives.map(function (x) {
      return '<li class="vs-li"><span class="vs-ic" style="background:' + tint(C.good, 0.14) + '">' + svgIcon(P.check, C.good, 16, 2.5) + "</span><span>" + esc(x.text) + "</span></li>";
    }).join("") : '<li class="vs-li"><span class="vs-empty">Pas encore de point fort marquant.</span></li>';
    var alerts = v.problems.length ? v.problems.map(function (x) {
      var c = x.sev >= 3 ? C.bad : C.mid;
      return '<div class="vs-alert" style="background:' + tint(c, 0.08) + ";border:1px solid " + tint(c, 0.3) + '">' + svgIcon(P.warn, c, 22) + "<div><strong>" + esc(x.text) + "</strong></div>" + (actionBtn(x, v) ? '<span class="vs-act">' + actionBtn(x, v) + "</span>" : "") + "</div>";
    }).join("") : '<div class="vs-calm">' + svgIcon(P.shield, C.good, 24) + "<span>Aucune tension notable dans le vestiaire.</span></div>";
    var leaders = v.players.filter(function (p) { return p.level === "leader"; });
    var lead = '<div style="margin-top:auto;display:flex;flex-direction:column;gap:12px;padding-top:4px"><p class="vs-eyebrow">Qui mène le groupe</p>' +
      (leaders.length ? '<div class="vs-chips">' + leaders.map(function (p) { return '<div class="vs-person">' + avatar(p, MOOD_COLOR[p.mood]) + "<div>" + link(p) + "<small>Leader · " + esc(p.label) + "</small></div></div>"; }).join("") + "</div>"
        : '<p class="vs-empty">Aucun leader naturel : un joueur d\'expérience au fort leadership changerait la donne.</p>') + "</div>";
    var two = '<section class="vs-grid2"><article class="vs-card" style="display:flex;flex-direction:column;gap:14px"><div class="vs-row"><h3 class="vs-h3">Ce qui va bien</h3><b class="vs-big" style="font-size:22px;color:' + C.good + '">' + v.positives.length + "</b></div>" +
      '<ul class="vs-list">' + good + "</ul></article>" +
      '<article class="vs-card" style="display:flex;flex-direction:column;gap:14px"><div class="vs-row"><h3 class="vs-h3">À surveiller</h3><b class="vs-big" style="font-size:22px;color:' + (v.problems.length ? C.mid : "var(--vs-faint)") + '">' + v.problems.length + "</b></div>" + alerts + lead + "</article></section>";
    var last = (v.log || [])[0];
    var V = window.HM_VESTIAIRE;
    var lastHtml = last ? '<div class="vs-row" style="justify-content:flex-start;gap:14px"><span class="vs-wk">SEM. ' + esc(last.w) + '</span><span style="font-size:15px;font-weight:600">' + esc(V.eventText(last)) + "</span>" + toneMark(last) + "</div>" : '<p class="vs-empty">Le journal se remplit au fil des semaines.</p>';
    var bottom = '<section class="vs-card" style="display:flex;flex-wrap:wrap;gap:22px;align-items:center;justify-content:space-between">' +
      '<div style="display:flex;flex-direction:column;gap:10px;flex:1 1 420px"><p class="vs-eyebrow">' + (v.groups.length ? v.groups.length + " groupe" + (v.groups.length > 1 ? "s" : "") + " dans le vestiaire" : "Groupes") + "</p>" +
      (v.groups.length ? '<div class="vs-chips">' + v.groups.map(function (gr, i) { return '<button type="button" class="vs-gchip" data-vs-tab="groups"><span class="vs-dot" style="background:' + GROUP_COLORS[i % GROUP_COLORS.length] + '"></span>' + esc(gr.name) + "</button>"; }).join("") + "</div>" : '<p class="vs-empty">Pas encore de groupe marqué.</p>') + "</div>" +
      '<div style="display:flex;flex-direction:column;gap:10px;flex:0 1 380px"><p class="vs-eyebrow">Dernier événement</p>' + lastHtml + "</div></section>";
    return hero + pillars + two + bottom;
  }
  function toneMark(e) {
    var V = window.HM_VESTIAIRE, tone = V.EVENT_TONE[e.t] || 0;
    var col = tone > 0 ? C.good : tone < 0 ? C.bad : "var(--vs-faint)";
    if ((e.t === "big-win" || e.t === "big-loss") && e.x != null) return '<b class="vs-big" style="margin-left:auto;font-size:24px;color:' + col + '">' + (e.t === "big-win" ? "+" : "−") + esc(e.x) + "</b>";
    return '<span style="margin-left:auto;color:' + col + '">' + svgIcon(tone > 0 ? P.up : tone < 0 ? P.down : P.flat, col, 18, 2.4) + "</span>";
  }

  // --- Hiérarchie --------------------------------------------------------------
  var TIER_HINT = { leader: "Donnent le ton", cadre: "Relais du coach", important: "Comptent sur le terrain", member: "Font partie du groupe", young: "Doivent trouver leur place", marginal: "En marge du groupe" };
  var TIER_W = { leader: "56%", cadre: "68%", important: "84%", member: "100%", young: "100%", marginal: "100%" };
  var ROW_LIMIT = 9;
  function hierarchyHtml(v) {
    var V = window.HM_VESTIAIRE;
    var rank = 0;
    var tiers = Object.keys(V.LEVELS).map(function (k) {
      var ps = v.players.filter(function (p) { return p.level === k; });
      if (!ps.length) return "";
      rank++;
      var top = k === "leader";
      return '<div class="vs-tier" style="max-width:' + TIER_W[k] + (top ? ";background:" + tint("#F59E0B", 0.07) + ";border-color:" + tint("#F59E0B", 0.3) : "") + '">' +
        '<div class="vs-tier-name"><span class="vs-rank vs-big" style="' + (top ? "background:var(--vs-acc);color:#1A1205" : "background:var(--vs-line);color:var(--ink)") + '">' + rank + "</span><div><strong>" + esc(V.LEVELS[k].label) + "</strong><small>" + esc(TIER_HINT[k] || "") + "</small></div></div>" +
        '<div class="vs-chips" style="flex:1 1 300px">' + ps.map(chip).join("") + "</div></div>";
    }).join("");
    var moods = V.MOOD_LEVELS || [];
    var counts = moods.map(function (m) { return { m: m, n: v.players.filter(function (p) { return p.mood === m.key; }).length }; }).filter(function (x) { return x.n; });
    var legend = '<div class="vs-legend">' + moods.map(function (m) { return '<span><span class="vs-ring-dot" style="border-color:' + MOOD_COLOR[m.key] + '"></span>' + esc(m.label) + "</span>"; }).join("") + "</div>";
    var pyramid = '<section class="vs-card" style="display:flex;flex-direction:column;gap:22px"><div class="vs-row" style="flex-wrap:wrap;align-items:baseline"><h2 class="vs-h2">La pyramide du vestiaire</h2><p class="vs-text">Du haut vers le bas : qui donne le ton, qui suit</p></div>' +
      (tiers ? '<div class="vs-pyr">' + tiers + "</div>" + legend : '<p class="vs-empty">Effectif vide.</p>') + "</section>";
    var sat = v.counts.satisfied, fr = v.counts.frustrated;
    var bar = '<div style="display:flex;flex-direction:column;gap:8px;flex:0 1 380px;min-width:240px"><div class="vs-moodbar">' +
      counts.map(function (x) { return '<div style="flex:' + x.n + ";background:" + MOOD_COLOR[x.m.key] + '" title="' + esc(x.n + " " + x.m.label.toLowerCase()) + '"></div>'; }).join("") + "</div>" +
      '<div class="vs-row" style="font-size:13px;color:var(--vs-dim)"><span><b style="color:var(--ink)">' + sat + "</b> satisfait" + (sat > 1 ? "s" : "") + "</span><span><b style=\"color:var(--ink)\">" + fr + "</b> frustré" + (fr > 1 ? "s" : "") + "</span></div></div>";
    var all = state.allRows || v.players.length <= ROW_LIMIT + 2;
    var list = all ? v.players : v.players.slice(0, ROW_LIMIT);
    var rows = list.map(function (p) {
      var reasons = (p.reasons || []).map(function (r) { return esc(r.text); }).join(" · ");
      return "<tr><td><div class=\"vs-who\">" + avatar(p) + "<div>" + link(p) + "<small>" + flag(p.nationality) + " " + esc(nation(p.nationality)) + "</small></div></div></td><td>" + pos(p.position) + "</td><td style=\"color:var(--vs-dim)\">" + esc(p.levelLabel) + "</td>" +
        '<td><div class="vs-infl" title="' + p.influence + '/100"><span><i style="width:' + p.influence + '%"></i></span><span style="font-size:13px;color:var(--vs-dim)">' + p.influence + "</span></div></td>" +
        "<td>" + moodPill(p) + '</td><td class="vs-reasons">' + (reasons || "—") + "</td></tr>";
    }).join("");
    var table = '<section class="vs-card" style="display:flex;flex-direction:column;gap:20px"><div class="vs-row" style="flex-wrap:wrap;gap:20px"><h2 class="vs-h2">Qui est satisfait, qui est frustré</h2>' + bar + "</div>" +
      '<div class="vs-wrap"><table class="vs-table"><thead><tr><th>Joueur</th><th>Poste</th><th>Statut</th><th>Influence</th><th>Moral</th><th>Pourquoi</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      (all ? "" : '<button type="button" class="vs-more" data-vs-all="1">Afficher les ' + (v.players.length - ROW_LIMIT) + " autres joueurs</button>") +
      '<p class="vs-text">L\'influence vient du leadership, du temps de jeu, de l\'ancienneté, de l\'âge, du niveau et du vécu au club. Pour agir : la fiche du joueur (discussion, contrat), les Tactiques (rôles et temps de jeu), l\'Entraînement (tutorat).</p></section>';
    return pyramid + table;
  }

  // --- Groupes -----------------------------------------------------------------
  function groupColor(v, id) { var i = v.groups.findIndex(function (x) { return x.id === id; }); return GROUP_COLORS[(i < 0 ? 0 : i) % GROUP_COLORS.length]; }
  function groupsHtml(v) {
    var byId = {}; v.players.forEach(function (p) { byId[String(p.id)] = p; });
    var inGroups = v.players.filter(function (p) { return p.group; }).length;
    var alone = v.players.filter(function (p) { return !p.group; });
    var isolated = alone.filter(function (p) { return p.mood === "frustrated" || p.mood === "unhappy"; }).length;
    var kpi = function (label, val, col) { return '<div class="vs-card vs-kpi"><p class="vs-eyebrow">' + esc(label) + '</p><b class="vs-big"' + (col ? ' style="color:' + col + '"' : "") + ">" + val + "</b></div>"; };
    var kpis = '<section class="vs-grid3" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">' + kpi("Groupes formés", v.groups.length) + kpi("Joueurs dans un groupe", inGroups + "<small>/" + v.players.length + "</small>") +
      kpi("Indépendants", alone.length) + kpi("Isolés et frustrés", isolated, isolated ? C.bad : C.good) + "</section>";
    var cards = v.groups.map(function (gr, i) {
      var col = GROUP_COLORS[i % GROUP_COLORS.length];
      var stCol = gr.status.key === "frustrated" ? C.bad : col;
      var ms = gr.ids.map(function (id) { return byId[id]; }).filter(Boolean);
      var mc = toneColor(gr.mood);
      return '<article class="vs-card vs-group"><i style="background:' + col + '"></i><div>' +
        '<div class="vs-row" style="align-items:flex-start"><h4>' + esc(gr.name) + '</h4><span class="vs-verdict" style="border:1px solid ' + stCol + ";color:" + stCol + ';white-space:nowrap">' + esc(gr.status.label) + "</span></div>" +
        '<div class="vs-stack">' + ms.slice(0, 5).map(function (p) { return avatar(p, col, 38); }).join("") + '<span style="margin-left:22px;font-size:13px;color:var(--vs-faint)">' + ms.length + " joueurs</span></div>" +
        '<ul class="vs-members">' + ms.map(function (p) { return '<li><span class="vs-dot" style="width:7px;height:7px;background:' + (MOOD_COLOR[p.mood] || C.mid) + '"></span>' + link(p) + "</li>"; }).join("") + "</ul>" +
        (gr.bonds.length ? '<div class="vs-chips" style="gap:6px">' + gr.bonds.map(function (b) { return '<span class="vs-bond">' + esc(b) + "</span>"; }).join("") + "</div>" : "") +
        '<div class="vs-gfoot"><div class="vs-row" style="font-size:13px"><span style="color:var(--vs-faint)">Moral du groupe</span><b style="color:' + mc + '">' + esc(levelWord(gr.mood)) + "</b></div>" +
        '<div class="vs-bar6"><i style="width:' + Math.max(3, Math.min(100, gr.mood)) + "%;background:" + mc + '"></i></div></div></div></article>';
    }).join("");
      '<p class="vs-text" style="font-size:15px">Même nationalité, même génération, du temps passé ensemble : les affinités se créent d\'elles-mêmes. Un groupe soudé et heureux tire le moral vers le haut.</p></article>';
    var groups = '<section class="vs-groups">' + (cards || '<article class="vs-card"><p class="vs-empty">Pas encore de groupe marqué : les affinités se créent avec le temps passé ensemble.</p></article>') + "</section>";
    var solo = alone.length ? '<section class="vs-card" style="display:flex;flex-direction:column;gap:16px"><div class="vs-row" style="flex-wrap:wrap;align-items:baseline"><h2 class="vs-h2" style="font-size:24px">Hors des groupes</h2>' +
      '<p class="vs-text" style="max-width:560px">Pas forcément un problème. Un joueur isolé <em>et</em> frustré, en revanche, mérite qu\'on s\'en occupe.</p></div>' +
      '<div class="vs-solo">' + alone.map(function (p) { return "<div>" + avatar(p, MOOD_COLOR[p.mood]) + "<div>" + link(p) + "<small>" + esc(p.label) + "</small></div></div>"; }).join("") + "</div></section>" : "";
    return kpis + groups + solo;
  }

  // --- Relations ---------------------------------------------------------------
  // Carte : chaque groupe dans sa zone (couleur du groupe), les indépendants
  // au centre ; taille = influence, contour = moral, anneau = leader.
  function graphSvg(v) {
    var ps = v.players, n = ps.length;
    if (n < 2) return "";
    var W = 760, H = 500, cx = 380, cy = 250;
    var at = {}, zones = "", zc = [];
    var k = v.groups.length;
    v.groups.forEach(function (gr, i) {
      var m = gr.ids.length, r = 40 + 25 * Math.sqrt(m);
      var a = -Math.PI * 0.75 + 2 * Math.PI * i / Math.max(1, k);
      // Un seul groupe : à gauche, les indépendants occupent le reste.
      var zx = k === 1 ? 210 : cx + 255 * Math.cos(a), zy = k === 1 ? cy : cy + 150 * Math.sin(a);
      zx = Math.max(r + 6, Math.min(W - r - 6, zx)); zy = Math.max(r + 24, Math.min(H - r - 22, zy));
      zc.push({ x: zx, y: zy, r: r });
      var col = GROUP_COLORS[i % GROUP_COLORS.length];
      zones += '<circle cx="' + zx.toFixed(1) + '" cy="' + zy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + col + '" fill-opacity=".07" stroke="' + col + '" stroke-opacity=".4" stroke-dasharray="4 6"/>' +
        '<text class="zone" x="' + zx.toFixed(1) + '" y="' + (zy - r - 8).toFixed(1) + '" text-anchor="middle" style="fill:' + col + '">' + esc(gr.name.replace(/^(Le clan|Les|La|Le) /, "")) + "</text>";
      gr.ids.forEach(function (id, j) {
        var b = 2 * Math.PI * j / m - Math.PI / 2;
        var rr = m === 1 ? 0 : r * 0.58;
        at[id] = { x: zx + rr * Math.cos(b), y: zy + rr * Math.sin(b), grouped: true };
      });
    });
    // Indépendants : cases libres d'une grille (hors des zones), les plus
    // proches du centre de l'espace restant d'abord.
    var solo = ps.filter(function (p) { return !at[String(p.id)]; });
    var hx = k === 1 ? 520 : cx, cells = [];
    var sx = k ? 82 : 116, sy = k ? 64 : 84, row = 0;
    for (var gy = 50; gy <= H - 40; gy += sy, row++) for (var gx = 50; gx <= W - 50; gx += sx) {
      var ox = gx + (row % 2 ? sx / 2 : 0);
      if (ox > W - 40) continue;
      if (zc.some(function (z) { return Math.hypot(ox - z.x, gy - z.y) < z.r + 34; })) continue;
      cells.push({ x: ox, y: gy, d: Math.hypot((ox - hx) * 0.8, gy - cy) });
    }
    cells.sort(function (a, b) { return a.d - b.d; });
    solo.forEach(function (p, i) {
      var c = cells[i] || { x: 40 + (i * 53) % (W - 80), y: H - 30 };
      at[String(p.id)] = { x: c.x, y: c.y, grouped: false };
    });
    var lines = v.relations.map(function (r) {
      var A = at[String(r.a)], B = at[String(r.b)]; if (!A || !B || r.kind === "neutral") return "";
      var col = r.kind === "good" ? C.good : C.bad;
      return '<line x1="' + A.x.toFixed(1) + '" y1="' + A.y.toFixed(1) + '" x2="' + B.x.toFixed(1) + '" y2="' + B.y.toFixed(1) + '" stroke="' + col + '" stroke-width="' + (r.kind === "good" ? 3 : 2.5) + '" stroke-linecap="round" stroke-opacity=".8"' + (r.kind === "tension" ? ' stroke-dasharray="6 5"' : "") + "/>";
    }).join("");
    var nodes = ps.map(function (p) {
      var o = at[String(p.id)], rr = 8 + p.influence / 11;
      var col = MOOD_COLOR[p.mood] || C.mid;
      return "<g " + playerAttrs(p) + "><title>" + esc(p.name + " · " + p.levelLabel + " · " + p.label) + "</title>" +
        '<circle cx="' + o.x.toFixed(1) + '" cy="' + o.y.toFixed(1) + '" r="' + rr.toFixed(1) + '" fill="' + (o.grouped ? "var(--vs-line)" : "var(--vs-card)") + '" stroke="' + col + '" stroke-width="3"/>' +
        (p.level === "leader" ? '<circle cx="' + o.x.toFixed(1) + '" cy="' + o.y.toFixed(1) + '" r="' + (rr + 7).toFixed(1) + '" fill="none" stroke="#F59E0B" stroke-opacity=".7" stroke-width="1.5"/>' : "") +
        '<text x="' + o.x.toFixed(1) + '" y="' + (o.y + rr + 14).toFixed(1) + '" text-anchor="middle"' + (o.grouped || p.level === "leader" ? "" : ' class="dim"') + ">" + esc(lastName(p.name)) + "</text></g>";
    }).join("");
    var good = v.relations.filter(function (r) { return r.kind === "good"; }).length, bad = v.relations.filter(function (r) { return r.kind === "tension"; }).length;
    return '<figure class="vs-fig"><svg class="vs-graph" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Carte des relations : ' + good + " bonne" + (good > 1 ? "s" : "") + " entente" + (good > 1 ? "s" : "") + ", " + bad + " tension" + (bad > 1 ? "s" : "") + '">' + zones + lines + nodes + "</svg></figure>" +
      '<div class="vs-legend" style="justify-content:flex-start"><span><span style="width:22px;height:3px;border-radius:2px;background:' + C.good + '"></span>Bonne entente</span><span><span style="width:22px;border-top:3px dashed ' + C.bad + '"></span>Tension</span>' +
      '<span><span class="vs-ring-dot" style="width:14px;height:14px;border:1.5px solid #F59E0B"></span>Leader</span><span><span class="vs-ring-dot" style="width:14px;height:14px;border:2px dashed var(--vs-line)"></span>Zone de groupe</span></div>';
  }
  function relationsHtml(v) {
    var byId = {}; v.players.forEach(function (p) { byId[String(p.id)] = p; });
    function pair(r) {
      var a = byId[String(r.a)], b = byId[String(r.b)]; if (!a || !b) return "";
      var col = r.kind === "tension" ? C.bad : (a.group && a.group === b.group ? groupColor(v, a.group) : C.good);
      return '<li class="vs-pair"><div class="vs-duo">' + avatar(a, col) + avatar(b, col) + "</div><div><span>" + link(a) + " &amp; " + link(b) + "</span><small>" + esc(r.why.join(", ")) + "</small></div></li>";
    }
    var good = v.relations.filter(function (r) { return r.kind === "good"; }), bad = v.relations.filter(function (r) { return r.kind === "tension"; });
    var map = '<section class="vs-card vs-main" style="display:flex;flex-direction:column;gap:14px"><div class="vs-row" style="flex-wrap:wrap;align-items:baseline"><h2 class="vs-h2">Carte des relations</h2><p class="vs-text" style="font-size:13px">Taille = influence · contour = moral</p></div>' +
      (graphSvg(v) || '<p class="vs-empty">Pas assez de joueurs.</p>') + "</section>";
    var side = '<aside class="vs-side"><section class="vs-card" style="display:flex;flex-direction:column;gap:14px"><div class="vs-row"><h3 class="vs-h3">Bonnes ententes</h3><b class="vs-big" style="font-size:22px;color:' + C.good + '">' + good.length + "</b></div>" +
      (good.length ? '<ul class="vs-list">' + good.slice(0, 8).map(pair).join("") + "</ul>" : '<p class="vs-empty">Aucune pour l\'instant : les affinités se créent avec le temps passé ensemble.</p>') + "</section>" +
      '<section class="vs-card" style="display:flex;flex-direction:column;gap:14px"><div class="vs-row"><h3 class="vs-h3">Tensions</h3><b class="vs-big" style="font-size:22px;color:' + (bad.length ? C.bad : "var(--vs-faint)") + '">' + bad.length + "</b></div>" +
      (bad.length ? '<ul class="vs-list">' + bad.slice(0, 8).map(pair).join("") + "</ul>" : '<div class="vs-calm">' + svgIcon(P.shield, C.good, 26) + "<span>Aucun conflit dans le vestiaire. Les tensions apparaîtront ici dès qu'elles se déclarent.</span></div>") + "</section></aside>";
    return '<div class="vs-split">' + map + side + "</div>";
  }

  // --- Évolution ---------------------------------------------------------------
  var SERIES = [["score", "Ambiance", "#F59E0B"], ["chem", "Cohésion", C.purple], ["mood", "Moral", C.good]];
  function chartSvg(v) {
    var hist = v.history || [];
    var W = 1000, H = 280, L = 50, R = 20, T = 30, B = 30;
    var n = hist.length, slots = Math.max(n + 4, 10);
    function x(i) { return L + 30 + (W - L - R - 60) * i / (slots - 1); }
    function y(val) { return T + (H - T - B) * (1 - Math.max(0, Math.min(100, val)) / 100); }
    var grid = [100, 75, 50, 25, 0].map(function (val) { return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(val) + '" y2="' + y(val) + '" stroke="var(--vs-line)"/><text x="' + (L - 12) + '" y="' + (y(val) + 4) + '" text-anchor="end">' + val + "</text>"; }).join("");
    var lastX = n ? x(n - 1) : x(0);
    var future = '<rect x="' + lastX + '" y="' + T + '" width="' + (W - R - lastX) + '" height="' + (H - T - B) + '" fill="#F59E0B" fill-opacity=".04"/><line x1="' + lastX + '" x2="' + lastX + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--vs-line)" stroke-dasharray="4 5"/>' +
      (slots - n >= 3 ? '<text x="' + ((lastX + W - R) / 2) + '" y="' + (T + (H - T - B) / 2) + '" text-anchor="middle" style="font-size:14px">Semaines à venir</text>' : "");
    var labels = "";
    for (var i = 0; i < slots; i++) {
      var w = n ? hist[0].w + i : i + 1;
      if (i < n) w = hist[i].w;
      if (slots > 14 && i % 2 && i !== n - 1) continue;
      labels += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle"' + (i === n - 1 ? ' style="fill:var(--ink);font-weight:700"' : "") + ">S" + esc(w) + "</text>";
    }
    var paths = SERIES.map(function (s) {
      if (n < 2) return "";
      var d = hist.map(function (h, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(s[0] === "chem" ? h.chem : h[s[0]]).toFixed(1); }).join(" ");
      return '<path d="' + d + '" fill="none" stroke="' + s[2] + '" stroke-width="' + (s[0] === "score" ? 3 : 2) + '" stroke-linejoin="round" stroke-linecap="round"/>';
    }).join("");
    var now = { score: v.state.score, chem: v.cohesion, mood: v.mood, conf: v.confidence };
    var px = lastX;
    var dots = '<circle cx="' + px + '" cy="' + y(now.mood) + '" r="6" fill="' + C.good + '"/><circle cx="' + px + '" cy="' + y(now.conf) + '" r="6" fill="' + C.blue + '"/><circle cx="' + px + '" cy="' + y(now.chem) + '" r="6" fill="' + C.purple + '"/>' +
      '<circle cx="' + px + '" cy="' + y(now.score) + '" r="16" fill="#F59E0B" fill-opacity=".18"/><circle cx="' + px + '" cy="' + y(now.score) + '" r="8" fill="#F59E0B" stroke="var(--vs-in)" stroke-width="3"/>' +
      '<rect x="' + (px - 90) + '" y="' + (y(now.score) - 44) + '" width="72" height="28" rx="8" fill="#F59E0B"/><text x="' + (px - 54) + '" y="' + (y(now.score) - 24) + '" text-anchor="middle" class="vs-cond" style="fill:#1A1205;font-weight:800;font-size:17px">' + now.score + "</text>";
    return '<figure class="vs-fig" style="padding:12px 8px 4px"><svg class="vs-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Ambiance ' + now.score + ", cohésion " + now.chem + ", moral " + now.mood + ", confiance " + now.conf + '">' + grid + future + labels + paths + dots + "</svg></figure>";
  }
  var EVENT_ICON = { "big-win": P.trophy, "win-streak": P.trophy, "big-loss": P.down, "loss-streak": P.down, arrival: P.user, youth: P.user, departure: P.user, injury: P.warn, conflict: P.bolt, request: P.warn };
  function evolutionHtml(v) {
    var V = window.HM_VESTIAIRE, n = (v.history || []).length;
    var sub = n >= 2 ? "Ambiance, cohésion et moral semaine après semaine ; la confiance (résultats récents) est indiquée pour cette semaine." : n === 1 ? "Premier relevé enregistré. La courbe se dessine à partir de deux semaines d'entraînement." : "La courbe se dessine à partir de deux semaines d'entraînement.";
    var legend = '<div class="vs-legend" style="justify-content:flex-start;gap:16px">' + SERIES.concat([["conf", "Confiance", C.blue]]).map(function (s) { return '<span><span style="width:18px;height:3px;border-radius:2px;background:' + s[2] + '"></span>' + esc(s[1]) + "</span>"; }).join("") + "</div>";
    var chart = '<section class="vs-card" style="display:flex;flex-direction:column;gap:16px"><div class="vs-row" style="flex-wrap:wrap;align-items:flex-end"><div style="display:flex;flex-direction:column;gap:6px"><h2 class="vs-h2">Évolution de l\'ambiance</h2><p class="vs-text">' + esc(sub) + "</p></div>" + legend + "</div>" + chartSvg(v) +
      (n ? '<p class="vs-text">Cette semaine : ' + v.counts.satisfied + " joueurs satisfaits, " + v.counts.frustrated + " frustrés sur " + v.counts.players + ".</p>" : "") + "</section>";
    var items = (v.log || []).slice(0, 20);
    var tl = items.length ? '<ol class="vs-tl">' + items.map(function (e, i) {
      var tone = V.EVENT_TONE[e.t] || 0, col = tone > 0 ? C.good : tone < 0 ? C.bad : "var(--vs-faint)";
      return '<li><span class="vs-tl-w">SEM. ' + esc(e.w) + '</span><div class="vs-tl-dot"><span style="background:' + col + ";box-shadow:0 0 0 4px " + (tone ? tint(tone > 0 ? C.good : C.bad, 0.18) : "transparent") + '"></span>' + (i < items.length - 1 ? "<span></span>" : "") + "</div>" +
        '<div class="vs-tl-card">' + svgIcon(EVENT_ICON[e.t] || (tone > 0 ? P.up : tone < 0 ? P.down : P.flat), col, 20) + '<strong style="flex:1;font-weight:600">' + esc(V.eventText(e)) + "</strong>" + ((e.t === "big-win" || e.t === "big-loss") ? toneMark(e) : "") + "</div></li>";
    }).join("") + "</ol>" : '<p class="vs-empty">Le journal se remplit au fil des semaines (arrivées, départs, places de titulaire, blessures, séries...).</p>';
    var journal = '<section class="vs-card vs-main" style="display:flex;flex-direction:column;gap:16px"><h2 class="vs-h2" style="font-size:24px">Journal du vestiaire</h2>' + tl +
      '<p class="vs-text" style="font-size:13px">Les prochains matchs, transferts et changements de rôle s\'ajouteront ici.</p></section>';
    var drivers = [["Cohésion", C.purple, "Monte quand on joue et gagne ensemble, baisse quand l'effectif change."], ["Moral", C.good, "Suit la satisfaction de chacun (temps de jeu, rôle, contrat) ; les joueurs influents pèsent plus."], ["Confiance", C.blue, "Portée par les derniers résultats."]];
    var aside = '<aside class="vs-card vs-side" style="gap:16px"><h2 class="vs-h2" style="font-size:24px">Ce qui fait bouger les jauges</h2>' + drivers.map(function (d) {
      return '<div class="vs-driver"><span style="background:' + d[1] + '"></span><div><strong>' + esc(d[0]) + '</strong><span class="vs-text">' + esc(d[2]) + "</span></div></div>";
    }).join("") + "</aside>";
    return chart + '<div class="vs-split">' + journal + aside + "</div>";
  }


  // =====================================================================
  // Entretiens et communication (2026-10-08) : vue calculée par
  // HM_VESTIAIRE.coachView ; l'entretien passe par le serveur
  // (POST /api/locker/talk, qui fait autorité), en solo par le moteur local.
  // =====================================================================
  var TOPIC_COLOR = { bad: C.bad, warn: C.warn, blue: C.blue, good: C.good, purple: C.purple, mid: "var(--vs-faint)" };
  function topicColor(k) { var V = window.HM_VESTIAIRE; var tp = V && V.TOPICS[k]; return TOPIC_COLOR[tp ? tp.color : "mid"] || C.mid; }
  function tag(text, col) { return '<span class="vs-tag" style="background:' + tint(col, 0.16) + ";color:" + col + '">' + esc(text) + "</span>"; }
  function dateFr(at) { try { return new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }); } catch (e) { return ""; } }
  function daysUntil(at) { return Math.max(1, Math.ceil((at - Date.now()) / 86400000)); }
  var IMP = { pos: ["Positif", C.good], neg: ["Négatif", C.bad], col: ["Collectif", C.blue], neu: ["Neutre", "var(--vs-faint)"] };
  var OUTW = { pos: ["Positif", C.good], neu: ["Neutre", "var(--vs-faint)"], neg: ["Négatif", C.bad] };
  function talksHtml() {
    var V = window.HM_VESTIAIRE, t = myTeam();
    var cv = V.coachView(t, { now: Date.now(), recent: recent() });
    var rec = cv.recommended.map(function (r) {
      var col = topicColor(r.topic);
      var btn = r.available ? '<button type="button" class="vs-btn vs-go" data-vs-talk="' + esc(r.id) + '" data-vs-topic="' + esc(r.topic) + '">Lui parler</button>'
        : '<button type="button" class="vs-btn" disabled>' + (r.block === "quota" ? "Quota atteint" : "Dans " + daysUntil(r.nextAt) + " j") + "</button>";
      return '<div class="vs-tk"><span class="vs-dot" style="background:' + col + '"></span><div><strong>' + link({ id: r.id, name: r.name }) + "</strong>" + tag(r.label, col) + (r.urgent ? tag("Urgent", C.bad) : "") + '<p class="vs-text">' + esc(r.why) + "</p></div>" + btn + "</div>";
    }).join("") || '<p class="vs-empty">Aucun entretien à prévoir : le vestiaire va bien.</p>';
    var others = cv.others.filter(function (o) { return o.available; });
    var pick = others.length ? '<div class="vs-row" style="gap:8px;flex-wrap:wrap;justify-content:flex-start"><select class="vs-btn" id="vsTalkOther" aria-label="Autre joueur">' + others.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.name) + "</option>"; }).join("") + '</select><button type="button" class="vs-btn" data-vs-talk-other>Faire le point</button></div>' : "";
    var left = '<section class="vs-card vs-main" style="display:flex;flex-direction:column;gap:6px"><div class="vs-row"><h2 class="vs-h2">Entretiens recommandés</h2><span class="vs-text">' + cv.quota.left + " entretien" + (cv.quota.left > 1 ? "s" : "") + " possible" + (cv.quota.left > 1 ? "s" : "") + " cette semaine</span></div>" + rec +
      '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px"><p class="vs-eyebrow">Parler à un autre joueur</p>' + (pick || '<p class="vs-empty">Personne d\'autre de disponible pour l\'instant.</p>') + "</div>" +
      '<p class="vs-text" style="font-size:12.5px;margin-top:8px">Environ un entretien toutes les deux semaines par joueur, ' + V.TALKS_PER_WEEK + " par semaine ; les urgences (crise, demande de transfert, promesse en retard) passent avant.</p></section>";
    var c = cv.consistency;
    var cons = '<section class="vs-card" style="display:flex;flex-direction:column;gap:10px"><h2 class="vs-h2">Cohérence du coach</h2><div class="vs-cons"><b class="vs-big">' + c.score + '</b><span class="vs-text">/ 100 · <span>' + esc(c.label) + '</span></span></div><div class="vs-gauge"><i style="width:' + c.score + '%"></i></div><p class="vs-text"><span>' +
      c.kept + " promesse" + (c.kept > 1 ? "s" : "") + " tenue" + (c.kept > 1 ? "s" : "") + "</span> · <span>" + c.broken + " non tenue" + (c.broken > 1 ? "s" : "") + "</span> · <span>" + c.contra + " contradiction" + (c.contra > 1 ? "s" : "") + " relevée" + (c.contra > 1 ? "s" : "") + "</span></p></section>";
    var ST = { late: ["En retard", C.warn], open: ["En cours", C.blue], kept: ["Tenue", C.good], broken: ["Non tenue", C.bad] };
    var prom = '<section class="vs-card" style="display:flex;flex-direction:column;gap:4px"><h2 class="vs-h2">Promesses en cours</h2>' + (cv.promises.map(function (pr) {
      var st = ST[pr.status] || ST.open;
      var bits = ["<span>Faite le " + esc(dateFr(pr.at)) + "</span>"];
      if (pr.status === "open" || pr.status === "late") bits.push("<span>échéance dans " + pr.weeksLeft + " semaine" + (pr.weeksLeft > 1 ? "s" : "") + "</span>");
      if (pr.progress) bits.push("<span>" + esc(pr.progress) + "</span>");
      return '<div class="vs-mini"><div class="vs-row"><span><strong>' + esc(pr.n) + "</strong> · <span>" + esc(pr.what) + "</span>" + tag(pr.src === "public" ? "Publique" : "Privée", pr.src === "public" ? C.blue : C.purple) + "</span>" + tag(st[0], st[1]) + "</div><small>" + bits.join(" · ") + "</small></div>";
    }).join("") || '<p class="vs-empty">Aucune promesse en cours.</p>') + "</section>";
    var comms = '<section class="vs-card" style="display:flex;flex-direction:column;gap:4px"><h2 class="vs-h2">Communication récente</h2>' + (cv.comms.map(function (x) {
      var im = IMP[x.imp] || IMP.neu;
      return '<div class="vs-mini"><div class="vs-row"><small><span>' + esc(dateFr(x.at)) + "</span> · <span>" + esc(x.lbl) + "</span></small>" + tag(im[0], im[1]) + "</div><span>« " + esc(x.q) + " »</span>" + (x.fx ? "<small>" + String(x.fx).split(" · ").map(function (f) { return "<span>" + esc(f) + "</span>"; }).join(" · ") + "</small>" : "") + "</div>";
    }).join("") || '<p class="vs-empty">Vos déclarations publiques (interviews) apparaîtront ici.</p>') + "</section>";
    var V2 = window.HM_VESTIAIRE;
    var hist = '<section class="vs-card" style="display:flex;flex-direction:column;gap:4px"><h2 class="vs-h2">Historique des discussions</h2>' + (cv.talks.map(function (x) {
      var o = OUTW[x.out] || OUTW.neu;
      return '<div class="vs-hist"><span class="vs-text">' + esc(dateFr(x.at)) + "</span><span><span>" + esc(x.n) + "</span> · <span>" + esc((V2.TOPICS[x.topic] || {}).label || "") + '</span></span><b style="color:' + o[1] + '">' + o[0] + "</b></div>";
    }).join("") || '<p class="vs-empty">Aucune discussion pour l\'instant.</p>') + "</section>";
    return '<div class="vs-split">' + left + '<aside class="vs-side">' + cons + prom + comms + hist + "</aside></div>";
  }
  // Boîte d'entretien : .upgrade-confirm-overlay + .upgrade-confirm-box
  // (bottom sheet sur téléphone, règle UI mobile du projet).
  function closeTalk() { var o = document.getElementById("vsTalkOverlay"); if (o) o.remove(); }
  function openTalk(pid, topic, rerender) {
    var V = window.HM_VESTIAIRE, t = myTeam();
    var o = V.talkOptions(t, pid, topic, { now: Date.now() });
    if (!o) return;
    closeTalk();
    var tp = teamPlayer({ id: pid }) || {};
    var lvl = V.LEVELS[o.level] ? V.LEVELS[o.level].label : "";
    var head = '<div class="vs-row" style="justify-content:flex-start;gap:12px">' + avatar({ id: pid, name: o.name }, topicColor(topic), 52) + '<div><strong style="font-size:17px">' + esc(o.name) + '</strong> <span class="vs-text">' + [o.position, o.age ? o.age + " ans" : "", o.tenure ? (o.tenure + 1) + "e saison au club" : "nouveau au club"].filter(Boolean).map(function (x) { return "<span>" + esc(x) + "</span>"; }).join(" · ") + '</span><br><span class="vs-text" style="font-size:12.5px"><span>' +
      (o.lastTalkAt ? "Dernier entretien : " + esc(dateFr(o.lastTalkAt)) : "Premier entretien") + "</span> · <span>" + esc(o.topicLabel) + "</span></span></div></div>";
    var roleWord = { starter: "Titulaire", rotation: "Rotation", reserve: "Réserve" };
    var kpis = '<div class="vs-talk-kpis"><div><small>Moral</small><b style="color:' + toneColor(o.form) + '">' + o.form + '</b></div><div><small>Confiance en vous</small><b style="color:' + toneColor(o.trust) + '">' + o.trust + '</b></div><div><small>Temps de jeu</small><b>' + o.minutes + ' min</b></div><div><small>Influence</small><b>' + esc(lvl || roleWord[o.role] || "") + "</b></div></div>";
    var choices = o.choices.map(function (c) {
      return '<button type="button" class="vs-choice" data-vs-choice="' + c.key + '"><span>' + c.letter + "</span><div><strong>" + esc(c.label) + (c.promise ? tag("Promesse", C.purple) : "") + "</strong><small>« " + esc(c.quote) + " »</small>" + (c.check ? "<small><em>" + esc(c.check) + "</em></small>" : "") + "</div></button>";
    }).join("");
    var ov = document.createElement("div");
    ov.className = "upgrade-confirm-overlay"; ov.id = "vsTalkOverlay";
    ov.innerHTML = '<div class="upgrade-confirm-box vs-root vs-club vs-talk-box" role="dialog" aria-label="Entretien">' + head + kpis + '<p class="vs-quote">« ' + esc(o.open) + " »</p>" +
      '<div id="vsTalkBody" style="display:flex;flex-direction:column;gap:8px">' + choices + '<p class="vs-text" style="font-size:12.5px">Aucun chiffre n\'est affiché à l\'avance : la réaction dépend de sa personnalité (sang-froid, détermination, discipline, leadership), de son moral, de sa confiance en vous et de la situation.</p></div>' +
      '<div class="vs-row" style="justify-content:flex-end"><button type="button" class="vs-btn" data-vs-close>Fermer</button></div></div>';
    document.body.appendChild(ov);
    var busy = false;
    ov.addEventListener("click", function (e) {
      if (e.target === ov || e.target.closest("[data-vs-close]")) { closeTalk(); if (rerender) rerender(); return; }
      var ch = e.target.closest("[data-vs-choice]");
      if (!ch || busy) return;
      busy = true;
      ov.querySelectorAll("[data-vs-choice]").forEach(function (b) { b.disabled = true; b.classList.toggle("on", b === ch); });
      doTalk(pid, topic, ch.getAttribute("data-vs-choice")).then(function (r) {
        var body = document.getElementById("vsTalkBody"); if (!body) return;
        if (!r || !r.ok) { body.insertAdjacentHTML("beforeend", '<p class="vs-text" style="color:' + C.bad + '">' + esc((r && r.error) || "Entretien impossible pour l'instant.") + "</p>"); return; }
        body.innerHTML = reactionHtml(o, r);
      });
    });
  }
  function arrow(d) { return d > 0 ? "↑" : d < 0 ? "↓" : "="; }
  function reactionHtml(o, r) {
    var col = r.out === "pos" ? C.good : r.out === "neg" ? C.bad : "var(--vs-faint)";
    var bits = ['<b style="color:' + col + '">Moral ' + arrow(r.form.after - r.form.before) + "</b>", '<b style="color:' + col + '">Confiance en vous ' + arrow(r.trust.after - r.trust.before) + "</b>"];
    var sp = r.spread || {};
    if (sp.close && sp.close.length) { var many = sp.close.length > 1; bits.push(sp.close.length + " proche" + (many ? "s" : "") + " (" + esc(sp.close.slice(0, 3).map(function (x) { return lastName(x.n); }).join(", ")) + ") " + (sp.close[0].d > 0 ? (many ? "rassurés" : "rassuré") : (many ? "solidaires de lui" : "solidaire de lui"))); }
    if (sp.group) bits.push("« " + esc(sp.group) + " » " + (r.out === "neg" ? "fait bloc" : "apaisé"));
    if (sp.chem) bits.push("Vestiaire : " + (sp.chem > 0 ? "cohésion ↑" : "tension ↑"));
    var chain = ['<span class="vs-pill">' + esc(lastName(o.name)) + "</span>"];
    if (sp.close && sp.close.length) chain.push('<span class="vs-pill">→ ' + sp.close.length + " proche" + (sp.close.length > 1 ? "s" : "") + "</span>");
    if (sp.group) chain.push('<span class="vs-pill">→ ' + esc(sp.group) + "</span>");
    if (sp.chem) chain.push('<span class="vs-pill">→ Vestiaire : ' + (sp.chem > 0 ? "cohésion ↑" : "tension ↑") + "</span>");
    return '<p class="vs-eyebrow">Réaction</p><p class="vs-quote"><span>« ' + esc(r.reply) + " »</span> — <span>" + esc(lastName(o.name)) + "</span> <span>" + esc(r.outLabel) + "</span>.</p>" +
      '<p class="vs-text">' + bits.join(" · ") + "</p>" + '<div class="vs-chips">' + chain.join("") + "</div>" +
      (r.promise ? '<p class="vs-text">Promesse enregistrée (' + esc(r.promise.k === "minutes" ? "plus de minutes" : r.promise.k === "starter" ? "place de titulaire" : r.promise.k === "role" ? "rôle majeur" : "prolongation") + ") : elle sera vérifiée automatiquement.</p>" : "") +
      (r.requestWithdrawn ? '<p class="vs-text" style="color:' + C.good + '">Il retire sa demande de transfert.</p>' : "") +
      (r.contradiction ? '<p class="vs-text" style="color:' + C.warn + '">Contradiction relevée : ' + esc(r.contradiction.txt) + "</p>" : "");
  }
  function doTalk(pid, topic, choice) {
    var V = window.HM_VESTIAIRE, t = myTeam();
    var token = null; try { token = typeof managerToken !== "undefined" ? managerToken : null; } catch (e) { token = null; }
    if (token && typeof fetchApi === "function") {
      return fetchApi("/api/locker/talk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: pid, topic: topic, choice: choice }) })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; }); })
        .then(function (x) {
          if (!x.res.ok || !x.data.ok) return { ok: false, error: x.data.error };
          t.locker = V.sanitize(x.data.locker);
          (x.data.players || []).forEach(function (q) { var p = t.players.find(function (y) { return String(y.id) === String(q.id); }); if (p) { p.form = q.form; if (!q.transferRequestActive && p.transferRequestActive) { p.transferRequestActive = false; p.transferRequestQuote = null; } } });
          if (typeof x.data.chemistry === "number") t.chemistry = x.data.chemistry;
          return x.data.result;
        }).catch(function () { return { ok: false, error: "Serveur indisponible, réessayez." }; });
    }
    var r = V.talk(t, pid, topic, choice, { now: Date.now(), applyChemistry: function (d) { if (typeof t.applyChemistryDelta === "function") t.applyChemistryDelta(d); } });
    if (r.ok && typeof saveMyTeam === "function") saveMyTeam();
    return Promise.resolve(r.ok ? r : { ok: false, error: "Entretien impossible pour l'instant." });
  }
  // Question de l'interview de jalon tirée du vestiaire (popup d'interview).
  function interviewBlock(q, choice) {
    if (!q) return "";
    ensureCss();
    return '<div class="vs-root vs-club" style="gap:8px;margin-top:10px"><p class="vs-eyebrow">Question tirée du vestiaire · facultative</p><p class="vs-quote" style="font-style:normal">« ' + esc(q.text) + " »</p>" +
      q.options.map(function (o) { return '<button type="button" class="vs-choice' + (choice === o.key ? " on" : "") + '" data-ivq="' + o.key + '"><span>' + o.letter + "</span><div><strong>" + esc(o.label) + "</strong><small>« " + esc(o.quote) + " »</small></div></button>"; }).join("") +
      '<p class="vs-text" style="font-size:12.5px">Ce qui est dit en public est mémorisé : une phrase qui contredit un entretien privé, ou une promesse publique non tenue, fait baisser la confiance et la cohérence.</p></div>';
  }

  var TABS = [["overview", "Vue générale"], ["hierarchy", "Hiérarchie"], ["groups", "Groupes"], ["relations", "Relations"], ["talks", "Entretiens"], ["evolution", "Évolution"]];
  function render(opts) {
    ctx = opts || null;
    var holder = (ctx && ctx.holder) || document.getElementById("vestiaireContent");
    if (!holder) return null;
    ensureCss();
    var V = window.HM_VESTIAIRE; var t = myTeam();
    if (!V || !t) { holder.innerHTML = '<p class="vs-empty">Chargement du vestiaire…</p>'; return null; }
    var view;
    try { view = V.buildView(t, { now: Date.now(), recent: recent(), nationName: g("nationName") }); } catch (e) { holder.innerHTML = '<p class="vs-empty">Vestiaire indisponible pour le moment.</p>'; return null; }
    // Entretiens : club du manager seulement (pas en mode Sélection).
    var tabList = TABS.filter(function (x) { return x[0] !== "talks" || (!ctx && V.coachView); });
    if (state.tab === "talks" && tabList.length !== TABS.length) state.tab = "overview";
    var tabs = '<nav class="vs-tabs" role="tablist" aria-label="Sections du vestiaire">' + tabList.map(function (x) {
      var on = state.tab === x[0];
      return '<button type="button" role="tab" class="' + (on ? "active" : "") + '" data-vs-tab="' + x[0] + '" aria-selected="' + on + '">' + esc(x[1]) + "</button>";
    }).join("") + "</nav>";
    // En-tête des maquettes : semaine et effectif, titre, onglets. Le mode
    // Sélection a déjà son titre de page (pas de second « Vestiaire »).
    var eyebrow = (!ctx && t.week != null ? "Semaine " + esc(t.week) + " · " : "") + view.players.length + " joueur" + (view.players.length > 1 ? "s" : "");
    var head = '<header class="vs-head"><div><p class="vs-eyebrow">' + eyebrow + "</p>" + (ctx ? "" : "<h1>Vestiaire</h1>") + "</div>" + tabs + "</header>";
    var body = state.tab === "talks" ? talksHtml() : state.tab === "hierarchy" ? hierarchyHtml(view) : state.tab === "groups" ? groupsHtml(view) : state.tab === "relations" ? relationsHtml(view) : state.tab === "evolution" ? evolutionHtml(view) : overviewHtml(view);
    // Police du Mode Club dans les deux modes (demande du 2026-10-08 : le
    // Vestiaire du mode Sélection doit avoir la même police que celui du club).
    holder.innerHTML = '<div class="vs-root vs-club">' + head + body + "</div>";
    // Page du club : le titre est dans l'en-tête (pas de doublon avec celui de la section).
    if (!ctx) { var sec = document.getElementById("vestiaireSection"), pt = sec && sec.querySelector(".page-title"); if (pt) pt.style.display = "none"; }
    holder.__vsCtx = ctx;
    if (!holder.__vsBound) {
      holder.__vsBound = true;
      holder.addEventListener("click", function (e) {
        var tb = e.target.closest("[data-vs-tab]");
        if (tb) { state.tab = tb.getAttribute("data-vs-tab"); state.allRows = false; render(holder.__vsCtx || null); return; }
        if (e.target.closest("[data-vs-all]")) { state.allRows = true; render(holder.__vsCtx || null); }
        var again = function () { render(holder.__vsCtx || null); };
        var tk = e.target.closest("[data-vs-talk]");
        if (tk) { openTalk(tk.getAttribute("data-vs-talk"), tk.getAttribute("data-vs-topic"), again); return; }
        if (e.target.closest("[data-vs-talk-other]")) { var sel = document.getElementById("vsTalkOther"); if (sel && sel.value) openTalk(sel.value, "checkin", again); }
      });
    }
    return view;
  }
  window.HM_VESTIAIRE_UI = { render: render, setTab: function (k) { state.tab = k; }, interviewBlock: interviewBlock, openTalk: openTalk };
})();
