// =====================================================================
// Règles de jeu PARTAGÉES (FIBA) — source unique pour le moteur serveur
// (engine.js, require), la page du jeu (moteurbasket3.html, <script>) et
// le direct (assets/live/adapter.js, import). Aucune dépendance, aucun
// tirage interne : chaque fonction est PURE (le hasard est passé en
// paramètre `rand`), donc testable et identique partout.
//
// Contenu (2026-10-10, « rebonds, violations, possessions ») :
//  - chronomètre des tirs : 24 s / 14 s (remises réglementaires) ;
//  - violations : 8 secondes, 24 secondes, retour en zone arrière ;
//  - possession alternée (flèche) au début des périodes ;
//  - choix d'un rebondeur pondéré (un seul tirage, réutilisé partout).
// Exposé en Node (module.exports) ET sur l'objet global (HM_RULES) : le
// même fichier est chargé en <script>, importé par un module ES ou requis.
// =====================================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.HM_RULES = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  const SHOT_CLOCK = 24;
  const SHOT_CLOCK_RESET = 14;
  const BACKCOURT_SECONDS = 8;

  // ---------- chronomètre des tirs ----------
  // Valeur du chronomètre des tirs après une situation de jeu. `remaining` :
  // secondes restantes avant la situation.
  //  - newPossession (panier encaissé, rebond défensif, perte, violation,
  //    début de période) : 24 ;
  //  - offensiveRebound (le ballon a touché l'anneau, l'attaque le reprend) : 14 ;
  //  - defensiveFoul / kickedBall (l'attaque garde le ballon) : le restant
  //    s'il en reste 14 ou plus, sinon 14 ;
  //  - defenseOutOfBounds (sortie provoquée par la défense) : le restant ;
  //    en zone arrière : 24 ;
  //  - technical / unsportsmanlike (possession conservée après les lancers) : 24
  //    en zone arrière, sinon le restant ramené à au moins 14.
  function shotClockAfter(kind, remaining = SHOT_CLOCK, opts = {}) {
    const r = Number.isFinite(remaining) ? Math.max(0, Math.min(SHOT_CLOCK, remaining)) : SHOT_CLOCK;
    switch (kind) {
      case "offensiveRebound": return SHOT_CLOCK_RESET;
      case "defensiveFoul": case "kickedBall": return opts.backcourt ? SHOT_CLOCK : Math.max(SHOT_CLOCK_RESET, r);
      case "defenseOutOfBounds": return opts.backcourt ? SHOT_CLOCK : r;
      case "technical": case "unsportsmanlike": return opts.backcourt ? SHOT_CLOCK : Math.max(SHOT_CLOCK_RESET, r);
      case "newPossession": default: return SHOT_CLOCK;
    }
  }
  // Le chronomètre des tirs n'est affiché/appliqué que s'il reste plus de
  // temps de jeu que de temps de possession (règle FIBA : éteint sinon).
  const shotClockOn = (gameClock, shotClock) => gameClock > shotClock;

  // Chrono du quart-temps entre deux événements du moteur (mission live
  // 2026-10-10, « le chrono remonte ») : le moteur date tous les événements
  // d'une possession au chrono de son DÉBUT ; le chrono défile de `prevSec`
  // (premier événement de la série, `t0`) vers `nextSec` (prochain chrono
  // différent, `t1`). Chaque arrêt de jeu de la série (`stops` : { at,
  // hold } — hold = Infinity tant que des lancers francs restent à tirer)
  // FIGE le chrono à la valeur atteinte à cet instant ; il repart après la
  // remise en jeu et rejoint `nextSec` à `t1`. Calcul par segments, dans
  // l'ordre des arrêts : un arrêt connu plus tard ne change jamais ce qui a
  // déjà été affiché → le chrono ne remonte JAMAIS. Renvoie le chrono
  // (secondes, non arrondi) et `frozenAt` (valeur au dernier arrêt, ou null).
  function clockBetween({ prevSec, nextSec, t0, t1, now, stops = [] }) {
    let v = prevSec, from = t0, frozenAt = null;   // segment en cours : (from, v) → (t1, nextSec)
    const at = t => (t >= t1 ? nextSec : v - (v - nextSec) * Math.min(1, Math.max(0, (t - from) / Math.max(1, t1 - from))));
    for (const st of stops) {
      if (!(st.at >= t0) || st.at > now) continue;
      const a = Math.min(st.at, t1);
      if (a < from) { frozenAt = v; continue; }   // arrêt pendant un arrêt : déjà figé
      v = at(a); frozenAt = v;
      // Reprise après la remise en jeu, au plus tard à 60 % du temps restant
      // (le chrono doit avoir le temps de rejoindre `nextSec`).
      from = Math.min(a + (Number.isFinite(st.hold) ? Math.max(0, st.hold) : Infinity), a + (t1 - a) * 0.6);
    }
    if (now <= from) return { clock: v, frozenAt };
    return { clock: at(now), frozenAt };
  }

  // ---------- violations ----------
  // 8 secondes : contrôle en zone arrière sans franchissement légal.
  function isEightSecondViolation({ backcourtStart, crossedAt }) {
    if (!backcourtStart) return false;
    return !(Number.isFinite(crossedAt) && crossedAt < BACKCOURT_SECONDS);
  }
  // 24 secondes : aucun tir parti avant la fin du chronomètre, ou tir parti
  // à temps qui ne touche pas l'anneau et que l'attaque récupère (si la
  // défense en prend immédiatement le contrôle, pas de violation : jeu
  // continue avec elle).
  function isShotClockViolation({ shotReleased, releasedBeforeExpiry, touchedRim, defenseControl }) {
    if (!shotReleased || !releasedBeforeExpiry) return true;
    if (touchedRim) return false;
    return !defenseControl;
  }
  // Retour en zone arrière : l'équipe avait le CONTRÔLE en zone avant, le
  // ballon revient en zone arrière en ayant été touché EN DERNIER par
  // l'attaque en zone avant, et c'est encore l'attaque qui le touche la
  // première en zone arrière. Une déviation défensive, une remise en jeu
  // ou un ballon jamais contrôlé en zone avant ne sont pas des violations.
  function isBackcourtViolation({ frontcourtControl, lastTouchInFrontcourt, firstTouchInBackcourt, throwIn = false }) {
    if (!frontcourtControl || throwIn) return false;
    return lastTouchInFrontcourt === "offense" && firstTouchInBackcourt === "offense";
  }

  // Probabilités (par possession concernée) — calées sur le haut niveau :
  // ≈0,2-0,5 violation des 8 s, ≈0,1-0,3 retour en zone arrière et
  // ≈0,5-1 violation des 24 s par équipe et par match (≈75 possessions).
  // `pressure` : écart pression défensive − maîtrise du porteur (≈ −20…+20),
  // `press` : défense pressante (Zone press : > 0).
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function violationChances({ pressure = 0, press = 0, creation = 0, defenseQuality = 0 } = {}) {
    return {
      eightSeconds: clamp(0.0035 * (1 + pressure / 25) * (1 + press * 30), 0.0005, 0.03),
      backcourtSituation: clamp(0.003 * (1 + pressure / 30), 0.0005, 0.02),
      shotClock: clamp(0.026 * (1 + defenseQuality / 40) * (1 - creation / 60), 0.006, 0.06),
    };
  }
  // Tirage des violations d'UNE possession (ordre réglementaire : 8 s
  // d'abord, puis retour en zone arrière, puis 24 s). Renvoie
  // { kind, clockUsed, crossedAt, ... } ou { kind: null, crossedAt }.
  //  - `backcourtStart` : la possession commence en zone arrière ;
  //  - `gameClock` : temps de jeu restant AVANT la possession ;
  //  - `shotClock` : valeur de départ du chronomètre des tirs (24 / 14) ;
  //  - `budget` : durée prévue de la possession (secondes).
  function rollViolations(rand, { backcourtStart, gameClock, shotClock = SHOT_CLOCK, budget, chances }) {
    const c = chances || violationChances();
    // Franchissement de la ligne médiane : 2 à 6,5 s après le début (dans
    // les 8 s), jamais plus tard que la possession elle-même.
    const crossedAt = backcourtStart ? Math.min(Math.max(1.5, (budget || 8) - 0.5), 2 + rand() * 4.5) : 0;
    if (backcourtStart && gameClock > BACKCOURT_SECONDS && rand() < c.eightSeconds) {
      return { kind: "eightSeconds", clockUsed: BACKCOURT_SECONDS, crossedAt: null };
    }
    if (backcourtStart && gameClock > 10 && budget > crossedAt + 2 && rand() < c.backcourtSituation) {
      // Le ballon revient en zone arrière : déviation de la défense (≈35 %)
      // → pas de violation ; sinon touché en dernier par l'attaque.
      const lastTouch = rand() < 0.35 ? "defense" : "offense";
      const at = Math.min(budget, crossedAt + 1.5 + rand() * Math.max(0.5, budget - crossedAt - 2));
      const violation = isBackcourtViolation({ frontcourtControl: true, lastTouchInFrontcourt: lastTouch, firstTouchInBackcourt: "offense" });
      if (violation) return { kind: "backcourt", clockUsed: Math.round(at * 10) / 10, crossedAt };
      // déviation : la possession continue normalement
    }
    if (shotClockOn(gameClock, shotClock) && rand() < c.shotClock) {
      // Possession qui arrive au bout du chronomètre : 40 % sans tir
      // (violation), sinon un tir forcé part juste avant la sirène.
      if (rand() < 0.4) return { kind: "shotClock", clockUsed: shotClock, crossedAt };
      return { kind: null, crossedAt, buzzerShot: true, clockUsed: shotClock };
    }
    return { kind: null, crossedAt };
  }

  // ---------- possession alternée ----------
  // Flèche FIBA : après l'entre-deux, elle désigne l'équipe qui n'a PAS
  // obtenu le contrôle. Chaque situation de possession alternée (début des
  // périodes 2+, prolongations comprises) donne le ballon à l'équipe
  // désignée, puis la flèche change de sens. Équipes : "A" / "B".
  const other = k => (k === "A" ? "B" : "A");
  function arrowAfterTipoff(tipWinner) { return other(tipWinner); }
  function alternatingPossession(arrow) { return { possession: arrow, arrow: other(arrow) }; }
  // Équipe qui commence la période `period` (2+) pour un vainqueur
  // d'entre-deux donné (calcul direct, pour les vérifications).
  function periodStartTeam(tipWinner, period) {
    if (period <= 1) return tipWinner;
    return period % 2 === 0 ? other(tipWinner) : tipWinner;
  }

  // ---------- rebond ----------
  // Choix pondéré du rebondeur parmi `candidates` (UN seul tirage) : le
  // résultat est l'identité unique transmise à l'événement, aux
  // statistiques et à la possession.
  function pickWeighted(candidates, weight, rand) {
    const ws = candidates.map(c => Math.max(0, weight(c)));
    const tot = ws.reduce((a, b) => a + b, 0);
    if (!(tot > 0)) return candidates[0] || null;
    let r = rand() * tot;
    for (let i = 0; i < candidates.length; i++) { r -= ws[i]; if (r <= 0) return candidates[i]; }
    return candidates[candidates.length - 1] || null;
  }
  // Part de rebonds offensifs sur un lancer franc manqué : la défense tient
  // les deux premiers emplacements de la raquette (repère ≈ 12-15 %).
  const FT_OFFENSIVE_REBOUND_FACTOR = 0.33;

  return {
    SHOT_CLOCK, SHOT_CLOCK_RESET, BACKCOURT_SECONDS, FT_OFFENSIVE_REBOUND_FACTOR,
    shotClockAfter, shotClockOn, clockBetween,
    isEightSecondViolation, isShotClockViolation, isBackcourtViolation, violationChances, rollViolations,
    arrowAfterTipoff, alternatingPossession, periodStartTeam,
    pickWeighted,
  };
});
