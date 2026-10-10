// =====================================================================
// Noyau audio partagé du direct (mission live 2026-10-10, « le son ne
// revient plus après un changement d'onglet ») : UN SEUL AudioContext pour
// tout le jeu (bruitages et ambiance sfx.js, commentaire commentary.js,
// musiques music.js), jamais fermé, jamais recréé à chaque vue.
//
// Causes corrigées (audit) :
//   - chaque vue du direct créait SON contexte (sfx), le commentaire et la
//     musique le leur : jusqu'à 3-4 contextes. Un direct recréé (retour sur
//     l'onglet, autre direct, rechargement) créait un contexte HORS d'un
//     geste → « suspended » pour le navigateur, sans rien dire : seuls les
//     sons qui ne passent pas par Web Audio (synthèse vocale du
//     commentateur) restaient audibles ;
//   - au retour sur l'onglet, la reprise (resume) pouvait être refusée
//     (iPhone : état « interrupted », reprise seulement dans un geste) et
//     rien ne le signalait ;
//   - iPhone : un contexte peut se dire « running » sans plus rien jouer
//     après une interruption (son horloge ne progresse plus) : il faut le
//     recréer DANS un geste.
//
// API (window.HMAudio, créé à la demande par HMAudioCore.get()) :
//   context()          → l'AudioContext partagé (créé une fois)
//   want(owner, on)    → un module veut (ou non) du son ; personne → pause
//   status             → "none" | "idle" | "running" | "blocked"
//   resume()           → reprise simple (jamais de recréation hors geste)
//   forceResume()      → reprise explicite (bouton « Activer le son », dans un geste)
//   onChange(fn), onReset(fn) → abonnements (fn() ; renvoient un désabonnement)
// Onglet masqué : contexte en pause (la simulation, elle, continue) ;
// retour : reprise ; refusée → statut « blocked » (le direct affiche un
// bouton explicite) ; au premier geste, reprise (ou recréation si le
// contexte est bloqué / figé) puis onReset → chaque module reconstruit
// son graphe sur le nouveau contexte.
// =====================================================================
(function () {
  const G = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : {});
  if (G.HMAudioCore) return;
  const GESTURES = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
  const BLOCK_CHECK_MS = 700;      // reprise demandée : toujours pas « running » après ce délai → bloqué
  const HEALTH_MS = 2000;
  const IDLE_SUSPEND_MS = 4000;    // plus aucun module ne veut de son : pause après ce délai          // contrôle « horloge figée » (iPhone)

  function create(w) {
    const AC = w && (w.AudioContext || w.webkitAudioContext);
    if (!AC) return null;
    const doc = () => (typeof document !== "undefined" ? document : null);
    const hidden = () => { const d = doc(); return !!(d && d.hidden); };
    let ctx = null, generation = 0, stalled = false, blockedSince = 0, lastTime = -1, health = 0, checkTimer = 0, gestureTry = 0, gestureFailed = false;
    const wants = new Map();
    const changeFns = new Set(), resetFns = new Set();
    const log = [];
    const note = (k, x) => { log.push({ k, x, at: Date.now() }); if (log.length > 60) log.shift(); };
    const wanted = () => { for (const v of wants.values()) if (v) return true; return false; };
    const emit = () => { for (const f of [...changeFns]) { try { f(); } catch (e) { /* rien */ } } };
    function make() {
      try { ctx = new AC(); } catch (e) { ctx = null; return null; }
      generation++; stalled = false; lastTime = -1; gestureFailed = false; gestureTry = 0;
      try { if (ctx.addEventListener) ctx.addEventListener("statechange", () => { if (ctx && ctx.state === "running") { stalled = false; blockedSince = 0; } emit(); }); } catch (e) { /* rien */ }
      note("create", generation);
      return ctx;
    }
    function context() {
      if (ctx && ctx.state !== "closed") return ctx;
      const had = !!ctx;
      make();
      if (had && ctx) for (const f of [...resetFns]) { try { f(ctx); } catch (e) { /* rien */ } }
      if (ctx && wanted() && !hidden()) tryResume();   // créé hors geste : bloqué ? → signalé
      emit();
      return ctx;
    }
    const running = () => !!ctx && ctx.state === "running" && !stalled;
    function status() {
      if (!ctx) return wanted() ? "idle" : "none";
      if (!wanted() || hidden()) return "idle";
      if (running()) return "running";
      return blockedSince ? "blocked" : "idle";
    }
    // Un seul contrôle en attente (des reprises répétées ne le repoussent pas).
    function scheduleBlockCheck() {
      if (checkTimer) return;
      checkTimer = setTimeout(() => {
        checkTimer = 0;
        if (ctx && wanted() && !hidden() && !running()) {
          if (!blockedSince) { blockedSince = Date.now(); note("blocked", ctx.state); }
          if (gestureTry) gestureFailed = true;   // reprise refusée même dans un geste → recréation au prochain
        } else { blockedSince = 0; gestureFailed = false; }
        gestureTry = 0;
        emit();
      }, BLOCK_CHECK_MS);
    }
    function tryResume() {
      if (!ctx || ctx.state === "closed") return;
      if (ctx.state !== "running") { try { const q = ctx.resume(); if (q && q.then) q.then(emit, () => {}); } catch (e) { /* rien */ } }
      scheduleBlockCheck();
    }
    function trySuspend() {
      clearTimeout(checkTimer); checkTimer = 0; blockedSince = 0;
      if (ctx && ctx.state === "running" && typeof ctx.suspend === "function") { try { const q = ctx.suspend(); if (q && q.then) q.then(emit, () => {}); } catch (e) { /* rien */ } }
      emit();
    }
    // Contexte bloqué ou figé : on en crée un neuf (dans un geste → il démarre).
    function recreate(why) {
      const old = ctx;
      note("recreate", why);
      make();
      if (old) { try { old.close(); } catch (e) { /* rien */ } }
      for (const f of [...resetFns]) { try { f(ctx); } catch (e) { /* rien */ } }
      tryResume();
      emit();
    }
    // Plus personne ne veut de son : pause DIFFÉRÉE — une vue du direct
    // remplacée par une autre (re-entrée, autre match) passe le relais sans
    // que le contexte soit suspendu entre les deux (sa reprise, hors d'un
    // geste, serait refusée sur iPhone). Onglet masqué : pause immédiate.
    let idleTimer = 0;
    function sync() {
      clearTimeout(idleTimer); idleTimer = 0;
      if (!ctx) { emit(); return; }
      if (hidden()) { trySuspend(); return; }
      if (wanted()) { tryResume(); return; }
      idleTimer = setTimeout(() => { idleTimer = 0; if (!wanted() || hidden()) trySuspend(); }, IDLE_SUSPEND_MS);
      emit();
    }
    function want(owner, on) {
      const was = wants.get(owner) || false;
      if (on) wants.set(owner, true); else wants.delete(owner);
      if (was !== !!on) sync();
    }
    // Recréation seulement si une simple reprise ne peut pas suffire : horloge
    // figée, état « interrupted » (iPhone) ou reprise déjà refusée dans un geste.
    const needsRecreate = () => stalled || ctx.state === "interrupted" || ctx.state === "closed" || gestureFailed;
    // Geste de l'utilisateur : seul moment où le navigateur accepte de
    // (re)démarrer le son.
    function onGesture() {
      if (!ctx || !wanted() || hidden()) return;
      if (needsRecreate()) { recreate(stalled ? "stalled" : ctx.state); return; }
      if (ctx.state !== "running") { gestureTry = Date.now(); tryResume(); }
    }
    // Reprise simple (modules : retour d'onglet, nouveau son) : jamais de
    // recréation hors d'un geste (le nouveau contexte serait lui aussi bloqué).
    function resume() {
      if (!ctx) context();
      if (!ctx) return false;
      tryResume();
      return true;
    }
    // Reprise explicite (bouton « Activer le son », dans un geste) : contexte
    // bloqué / figé / interrompu → recréé, sinon simple reprise.
    function forceResume() {
      if (!ctx) context();
      if (!ctx) return false;
      if (needsRecreate()) recreate("bouton");
      else if (ctx.state !== "running") { gestureTry = Date.now(); tryResume(); }
      return true;
    }
    // Horloge figée alors que le contexte se dit « running » (iPhone après
    // une interruption) : signalé, recréé au prochain geste.
    function healthCheck() {
      if (!ctx || hidden() || !wanted() || ctx.state !== "running") { lastTime = -1; return; }
      const t = ctx.currentTime;
      if (lastTime >= 0 && t === lastTime && !stalled) { stalled = true; blockedSince = Date.now(); note("stalled", t); emit(); }
      lastTime = t;
    }
    const onVis = () => { lastTime = -1; if (hidden()) trySuspend(); else sync(); };
    const d = doc();
    if (d && typeof d.addEventListener === "function") {
      d.addEventListener("visibilitychange", onVis);
      GESTURES.forEach(g => d.addEventListener(g, onGesture, true));
    }
    if (typeof setInterval === "function") { health = setInterval(healthCheck, HEALTH_MS); if (health && health.unref) health.unref(); }
    return {
      context, want, resume, forceResume,
      get status() { return status(); },
      get generation() { return generation; },
      onChange(fn) { changeFns.add(fn); return () => changeFns.delete(fn); },
      onReset(fn) { resetFns.add(fn); return () => resetFns.delete(fn); },
      debug: () => ({ state: ctx ? ctx.state : null, generation, stalled, blockedSince, wants: [...wants.keys()], status: status(), log: log.slice() }),
      _dispose() { clearInterval(health); clearTimeout(checkTimer); if (d && typeof d.removeEventListener === "function") { d.removeEventListener("visibilitychange", onVis); GESTURES.forEach(g => d.removeEventListener(g, onGesture, true)); } },
    };
  }

  G.HMAudioCore = {
    // Noyau de la fenêtre `w` (créé une fois par fenêtre) ; null sans Web Audio.
    get(w) {
      w = w || (typeof window !== "undefined" ? window : null);
      if (!w) return null;
      if (w.HMAudio && w.HMAudio.__win === w) return w.HMAudio;
      const core = create(w);
      if (!core) return null;
      core.__win = w;
      try { w.HMAudio = core; } catch (e) { /* rien */ }
      return core;
    },
  };
})();
