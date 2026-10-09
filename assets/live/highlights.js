// =====================================================================
// MOMENTS FORTS DU DIRECT (demande du 2026-10-09) : grandes animations par-
// dessus la vue du match, sans bloquer les commandes (pointer-events: none),
// dans la vue (donc aussi en plein écran). Système d'événements unique et
// réutilisable : detect(events, state) → déclenche() ; ajouter un moment
// fort = une règle de plus.
//   - « 3 POINTS » : tir à 3 points RÉUSSI (événement shot, zone three) ;
//   - « ON FIRE » : un joueur enchaîne 6 paniers sans tir manqué entre eux
//     et au moins 14 points sur la série (règle tirée des événements
//     existants : tirs réussis / manqués, lancers non comptés ; voir
//     ON_FIRE) ; une seule fois par série, la série s'arrête au premier tir
//     manqué ;
//   - « TITRE » / « COUPE » : au coup de sifflet final, si le match décide
//     un trophée (opts.trophyFor(state) → { kind: "title" | "cup", label }).
// Jamais rejoué : chaque moment a une clé (id d'événement, série, match),
// gardée pour la vue (reconnexion, re-rendu, retour en arrière d'une
// rediffusion) ; au premier affichage (arrivée en cours de match), les
// événements déjà passés ne déclenchent rien. Mouvement réduit : bandeau
// fixe et bref, sans feux d'artifice.
// =====================================================================
// Calibré sur 40 matchs simulés du moteur (2026-10-09) : 3 paniers / 7 pts
// = 8,5 « ON FIRE » par match (trop) ; 6 paniers d'affilée / 14 pts ≈ 1,7.
const ON_FIRE = { makes: 6, points: 14 };
// Points d'un tir réussi (le moteur envoie made: true, la zone dit 2 ou 3).
const ptsOf = e => (typeof e.made === "number" && e.made > 1 ? e.made : e.zone === "three" ? 3 : 2);

export function createHighlights(root, opts = {}) {
  const doc = root.ownerDocument;
  const seen = new Set();
  const fired = [];             // moments réellement déclenchés { kind, key } (diagnostic, tests)
  const streak = new Map();     // joueur → { makes, points, fired }
  let layer = null, busyUntil = 0, queue = [];
  const reduced = (() => { try { return !!(doc.defaultView.matchMedia && doc.defaultView.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } })();
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    layer = doc.createElement("div");
    layer.className = "hl-layer"; layer.setAttribute("aria-live", "polite");
    root.appendChild(layer);
    return layer;
  }
  function playerName(state, id) {
    for (const t of (state && state.teams) || []) for (const p of t.players || []) if (p.id === id) return p.name;
    return "";
  }
  function teamOf(state, i) { const t = state && state.teams && state.teams[i]; return t ? { name: t.name, short: t.short, color: t.color || (opts.colors && opts.colors[i]) || "#f0a23c" } : { name: "", short: "", color: "#f0a23c" }; }

  // --- déclenchement (un à la fois, file courte) -------------------------
  function trigger(kind, data) {
    if (!data || seen.has(data.key)) return false;
    seen.add(data.key);
    fired.push({ kind, key: data.key });
    queue.push({ kind, data });
    if (queue.length > 3) queue = queue.slice(-3);   // jamais d'accumulation
    pump();
    if (typeof opts.onMoment === "function") { try { opts.onMoment(kind, data); } catch (e) { /* rien */ } }
    return true;
  }
  function pump() {
    const now = Date.now();
    if (!queue.length || now < busyUntil) { if (queue.length) setTimeout(pump, busyUntil - now + 20); return; }
    const { kind, data } = queue.shift();
    const ms = show(kind, data);
    busyUntil = now + ms;
    if (queue.length) setTimeout(pump, ms + 20);
  }
  function show(kind, d) {
    const L = ensureLayer();
    const el = doc.createElement("div");
    const col = d.team ? d.team.color : "#f0a23c";
    el.className = "hl hl-" + kind + (reduced ? " is-reduced" : "");
    el.style.setProperty("--hl-c", col);
    let ms = 2600;
    if (kind === "three") {
      el.innerHTML = '<div class="hl-burst"></div><div class="hl-big hl-big--three">3 P' + ["O", "O", "O", "I", "I", "I", "N", "N", "N", "T", "T", "T", "S", "S", "S"].map(c => "<span>" + c + "</span>").join("") + ' !</div>' +
        '<div class="hl-sub">' + esc(d.player || "") + (d.team && d.team.short ? " · " + esc(d.team.short) : "") + "</div>";
    } else if (kind === "fire") {
      el.innerHTML = '<div class="hl-flames"><i></i><i></i><i></i><i></i><i></i></div><div class="hl-big">ON FIRE</div>' +
        '<div class="hl-sub">' + esc(d.player || "") + " · " + esc(d.makes) + " paniers d'affilée, " + esc(d.points) + " pts</div>";
      ms = 3000;
    } else {
      // Titre / coupe : trophée, feux d'artifice, équipe et compétition.
      const sparks = reduced ? "" : '<div class="hl-fireworks">' + Array.from({ length: 9 }, (_, i) => '<i style="--i:' + i + '"></i>').join("") + "</div>";
      el.innerHTML = sparks + '<div class="hl-trophy" aria-hidden="true">' + (kind === "cup" ? CUP_SVG : TROPHY_SVG) + "</div>" +
        '<div class="hl-big">' + esc(kind === "cup" ? "VAINQUEUR !" : "CHAMPION !") + '</div><div class="hl-sub">' + esc(d.team ? d.team.name : "") + "</div>" +
        '<div class="hl-comp">' + esc(d.label || "") + "</div>";
      ms = 6500;
    }
    if (reduced) ms = Math.min(ms, 2200);
    L.appendChild(el);
    setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 450); }, ms - 450);
    return ms;
  }

  // --- règles --------------------------------------------------------------
  // `events` : NOUVEAUX événements du fil (live-view), dans l'ordre.
  function detect(events, state) {
    for (const e of events || []) {
      if (e.kind === "shot" && e.team != null) {
        const shooter = e.actors && e.actors.shooter;
        const made = e.made === true || Number(e.made) > 0;
        if (made && e.zone === "three") trigger("three", { key: "3:" + e.id, player: playerName(state, shooter), team: teamOf(state, e.team) });
        if (shooter) {
          const s = streak.get(shooter) || { makes: 0, points: 0, fired: false, start: e.id };
          if (made) {
            s.makes++; s.points += ptsOf(e);
            if (!s.fired && s.makes >= ON_FIRE.makes && s.points >= ON_FIRE.points) {
              s.fired = true;
              trigger("fire", { key: "fire:" + shooter + ":" + s.start, player: playerName(state, shooter), team: teamOf(state, e.team), makes: s.makes, points: s.points });
            }
          } else { s.makes = 0; s.points = 0; s.fired = false; s.start = e.id; }
          if (!made) s.start = e.id + 1;
          streak.set(shooter, s);
        }
      }
    }
  }
  function onFinal(state) {
    if (!state || state.status !== "final" || typeof opts.trophyFor !== "function") return;
    let tr = null;
    try { tr = opts.trophyFor(state); } catch (e) { tr = null; }
    if (!tr) return;
    const sc = state.teams.map(t => t.score);
    if (sc[0] === sc[1]) return;
    const w = sc[0] > sc[1] ? 0 : 1;
    trigger(tr.kind === "cup" ? "cup" : "title", { key: "trophy:" + (tr.key || "match"), team: teamOf(state, w), label: tr.label || "" });
  }
  // Premier affichage (arrivée en cours de match, reconnexion) : on apprend
  // les séries en cours sans rien célébrer.
  function prime(events) {
    for (const e of events || []) {
      if (e.kind === "shot" && e.id != null && (e.made === true || Number(e.made) > 0) && e.zone === "three") seen.add("3:" + e.id);
    }
    const save = trigger;
    detectSilently(events);
    return save;
  }
  function detectSilently(events) {
    for (const e of events || []) {
      if (e.kind !== "shot" || e.team == null) continue;
      const shooter = e.actors && e.actors.shooter; if (!shooter) continue;
      const made = e.made === true || Number(e.made) > 0, s = streak.get(shooter) || { makes: 0, points: 0, fired: false, start: e.id };
      if (made) { s.makes++; s.points += ptsOf(e); if (s.makes >= ON_FIRE.makes && s.points >= ON_FIRE.points) { s.fired = true; seen.add("fire:" + shooter + ":" + s.start); } }
      else { s.makes = 0; s.points = 0; s.fired = false; s.start = e.id + 1; }
      streak.set(shooter, s);
    }
  }
  return {
    detect, onFinal, prime, trigger,
    reset() { streak.clear(); },
    get seen() { return seen; },
    get fired() { return fired; },
    destroy() { if (layer) layer.remove(); queue = []; },
  };
}

const TROPHY_SVG = '<svg viewBox="0 0 120 140" width="120" height="140"><defs><linearGradient id="hlg" x1="0" x2="1"><stop offset="0" stop-color="#b8860b"/><stop offset=".45" stop-color="#ffe08a"/><stop offset="1" stop-color="#c9971c"/></linearGradient></defs>' +
  '<path d="M30 10h60v28c0 22-13 38-30 42-17-4-30-20-30-42Z" fill="url(#hlg)" stroke="#7a5a10" stroke-width="2"/><path d="M30 18H14c0 20 8 30 18 32M90 18h16c0 20-8 30-18 32" fill="none" stroke="url(#hlg)" stroke-width="7" stroke-linecap="round"/>' +
  '<rect x="53" y="80" width="14" height="22" fill="url(#hlg)"/><rect x="36" y="102" width="48" height="12" rx="3" fill="url(#hlg)"/><rect x="28" y="114" width="64" height="16" rx="4" fill="#3a2a10" stroke="#c9971c" stroke-width="2"/>' +
  '<path d="M60 26l4.7 9.5 10.5 1.5-7.6 7.4 1.8 10.4L60 49.9l-9.4 4.9 1.8-10.4-7.6-7.4 10.5-1.5Z" fill="#fff6d6"/></svg>';
const CUP_SVG = '<svg viewBox="0 0 120 140" width="120" height="140"><defs><linearGradient id="hlc" x1="0" x2="1"><stop offset="0" stop-color="#8e9aab"/><stop offset=".45" stop-color="#f4f7fb"/><stop offset="1" stop-color="#a7b2c2"/></linearGradient></defs>' +
  '<path d="M22 12h76l-6 34c-4 20-16 30-32 32-16-2-28-12-32-32Z" fill="url(#hlc)" stroke="#5d6878" stroke-width="2"/><path d="M24 22C8 22 6 44 26 52M96 22c16 0 18 22-2 30" fill="none" stroke="url(#hlc)" stroke-width="7" stroke-linecap="round"/>' +
  '<rect x="54" y="78" width="12" height="24" fill="url(#hlc)"/><path d="M38 102h44l6 14H32Z" fill="url(#hlc)"/><rect x="30" y="116" width="60" height="14" rx="4" fill="#26303f" stroke="#a7b2c2" stroke-width="2"/>' +
  '<circle cx="60" cy="40" r="11" fill="none" stroke="#5d6878" stroke-width="3"/><path d="M49 40h22M60 29v22" stroke="#5d6878" stroke-width="2"/></svg>';
