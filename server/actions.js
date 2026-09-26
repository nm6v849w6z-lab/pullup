// =====================================================================
// ACTIONS DU MANAGER — reçoit et valide les décisions envoyées par le
// client (feuille de match, tactiques, entraînement, marché) avant de les
// appliquer à l'équipe/la ligue en mémoire. Jusqu'ici (voir index.js avant
// ce fichier) le serveur ne faisait que LIRE l'état et forcer un
// rattrapage — ces fonctions sont ce qui manquait pour que le calendrier
// réel ait quelque chose à appliquer au moment programmé plutôt que de
// rejouer indéfiniment les réglages par défaut.
//
// Chaque fonction prend (team, teamIndex, league, body, now) et renvoie
// { ok: true, ... } ou { ok: false, error }. Volontairement séparé de
// index.js (pur, sans rien savoir de HTTP) pour rester testable directement
// — voir server/actions_test.js.
//
// MULTI-MANAGER (retour utilisateur, 2026-09) : `teamIndex` est désormais un
// paramètre explicite — plus jamais un `0` supposé implicitement (voir
// League.listPlayerForSale/placeBid/placeCoachBid, qui ont besoin de
// l'INDEX, pas seulement de l'objet `team`). La vérification "cette requête
// a-t-elle le droit d'agir sur CETTE équipe" (résolution du jeton privé du
// manager, voir server/store.js:resolveManagerTeam) a lieu AVANT ces
// fonctions, côté server/index.js : `team`/`teamIndex` reçus ici sont donc
// déjà ceux, et UNIQUEMENT ceux, que l'appelant a le droit de piloter — ces
// fonctions elles-mêmes n'ont plus qu'à appliquer la décision, exactement
// comme avant.
// =====================================================================
const Engine = require("../engine.js");
const Scouting = require("./scouting.js");
const Shows = require("./shows.js");
const Calendar = require("./calendar.js");

const {
  POSITIONS, OFFENSE_PROFILES, DEFENSES, RHYTHMS,
  TRAINING_PROGRAMS, SEAT_CATEGORIES, CLUB_FACILITIES,
  // Tactique confirmée (voir engine.js, grand commentaire au-dessus de
  // SCREEN_DEFENSES) : mêmes tables que côté moteur/UI, réutilisées ici
  // pour valider les réglages envoyés par le client plutôt que de dupliquer
  // les listes de noms valides en dur.
  SCREEN_DEFENSES, HELP_DEFENSE_LEVELS, WATCH_FOCUS_EFFECTS, MAX_WATCH_ASSIGNMENTS,
  POST_DEFENSES, CLOSEOUT_STYLES, OFF_REBOUND_STYLES, ENDGAME_MANAGEMENT,
  // Interviews de jalon (retour utilisateur, 2026-09 : l'interview classique
  // d'après-match a été retirée, seules les interviews de jalon subsistent,
  // voir le grand commentaire au-dessus de MILESTONE_INTERVIEW_TYPES côté
  // moteur) : mêmes tons (Agressif/Mesuré/Humble) que l'ancien système,
  // réutilisés ici pour valider le ton envoyé par le client.
  MILESTONE_INTERVIEW_TONES,
} = Engine;

const MAX_OFFENSIVE_PRIORITIES = 3;

function fail(error) {
  return { ok: false, error };
}

// ---------------------------------------------------------------------
// Validateurs PURS (ne mutent rien) pour les champs feuille de match/
// tactiques — factorisés pour être partagés par setLineup/setTactics
// ci-dessous (ordres EN DIRECT) ET par setPlan plus bas (préparation à
// l'AVANCE d'une journée future, voir Team.stagePlanForRound côté moteur) :
// même règles de validation des deux côtés, jamais dupliquées séparément au
// risque de diverger. Chacun renvoie soit { ok: true, value }, soit
// { ok: false, error } (même convention que fail()/les actions elles-mêmes).
// ---------------------------------------------------------------------
function validateOffensivePriorities(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "offensivePriorities doit être un tableau non vide." };
  }
  if (raw.length > MAX_OFFENSIVE_PRIORITIES) {
    return { ok: false, error: `Au maximum ${MAX_OFFENSIVE_PRIORITIES} priorités offensives.` };
  }
  if (raw.some(t => !OFFENSE_PROFILES[t])) {
    return { ok: false, error: `Priorité offensive inconnue parmi : ${raw.join(", ")}.` };
  }
  if (new Set(raw).size !== raw.length) {
    return { ok: false, error: "Une même priorité offensive ne peut pas être choisie deux fois." };
  }
  return { ok: true, value: [...raw] };
}

function validateDefense(raw) {
  if (!DEFENSES[raw]) return { ok: false, error: `Défense inconnue : ${raw}.` };
  return { ok: true, value: raw };
}

function validateRhythm(raw) {
  if (!RHYTHMS[raw]) return { ok: false, error: `Rythme inconnu : ${raw}.` };
  return { ok: true, value: raw };
}

// ---------------------------------------------------------------------
// Tactique confirmée (voir engine.js/Team.constructor) : validateurs des
// sept réglages supplémentaires, factorisés ici de la même façon que
// validateOffensivePriorities/validateDefense/validateRhythm ci-dessus —
// partagés par setTactics (ordres en direct) et setPlan (préparation à
// l'avance) pour ne jamais laisser les deux chemins diverger.
// ---------------------------------------------------------------------
function validateTacticalTier(raw) {
  if (raw !== "débutant" && raw !== "confirmée") return { ok: false, error: `Niveau tactique inconnu : ${raw}.` };
  return { ok: true, value: raw };
}

function validateScreenDefense(raw) {
  if (!SCREEN_DEFENSES[raw]) return { ok: false, error: `Défense sur écrans inconnue : ${raw}.` };
  return { ok: true, value: raw };
}

function validateHelpDefense(raw) {
  if (!HELP_DEFENSE_LEVELS[raw]) return { ok: false, error: `Aide défensive inconnue : ${raw}.` };
  return { ok: true, value: raw };
}

function validatePostDefense(raw) {
  if (!POST_DEFENSES[raw]) return { ok: false, error: `Gestion du post-up inconnue : ${raw}.` };
  return { ok: true, value: raw };
}

function validateCloseoutStyle(raw) {
  if (!CLOSEOUT_STYLES[raw]) return { ok: false, error: `Style de close-out inconnu : ${raw}.` };
  return { ok: true, value: raw };
}

function validateOffRebStyle(raw) {
  if (!OFF_REBOUND_STYLES[raw]) return { ok: false, error: `Style de rebond offensif inconnu : ${raw}.` };
  return { ok: true, value: raw };
}

function validateEndgameManagement(raw) {
  if (!ENDGAME_MANAGEMENT[raw]) return { ok: false, error: `Gestion de fin de match inconnue : ${raw}.` };
  return { ok: true, value: raw };
}

// Jusqu'à MAX_WATCH_ASSIGNMENTS affectations { position, focus } — chaque
// position doit être un poste connu, chaque focus une clé connue de
// WATCH_FOCUS_EFFECTS. Tableau vide accepté (= aucune affectation).
function validateWatchAssignments(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: "watchAssignments doit être un tableau." };
  if (raw.length > MAX_WATCH_ASSIGNMENTS) {
    return { ok: false, error: `Au maximum ${MAX_WATCH_ASSIGNMENTS} affectations "Surveiller".` };
  }
  const value = [];
  for (const w of raw) {
    if (!w || typeof w !== "object" || !POSITIONS.includes(w.position) || !WATCH_FOCUS_EFFECTS[w.focus]) {
      return { ok: false, error: `Affectation "Surveiller" invalide : ${JSON.stringify(w)}.` };
    }
    value.push({ position: w.position, focus: w.focus });
  }
  return { ok: true, value };
}

// Valide un corps { starters, backupPositions } CONTRE l'effectif de `team`
// (les id de joueurs doivent exister dans CET effectif) sans rien muter —
// voir setLineup ci-dessous (application aux ordres en direct) et setPlan
// plus bas (application à un plan futur via Team.stagePlanForRound) pour les
// deux seuls appelants.
function validateLineupBody(team, raw) {
  if (!raw || typeof raw !== "object" || !raw.starters || typeof raw.starters !== "object") {
    return { ok: false, error: "Feuille de match invalide : 'starters' est requis (un id de joueur, ou null, par poste)." };
  }
  const byId = new Map(team.players.map(p => [p.id, p]));
  const starters = {};
  for (const pos of POSITIONS) {
    const value = raw.starters[pos];
    if (value == null) { starters[pos] = null; continue; }
    const player = byId.get(Number(value));
    if (!player) return { ok: false, error: `Joueur inconnu pour le poste ${pos} : ${value}.` };
    starters[pos] = player.id;
  }
  const backupPositions = {};
  if (raw.backupPositions && typeof raw.backupPositions === "object") {
    for (const [idStr, positions] of Object.entries(raw.backupPositions)) {
      const player = byId.get(Number(idStr));
      if (!player) return { ok: false, error: `Joueur inconnu dans backupPositions : ${idStr}.` };
      if (!Array.isArray(positions) || positions.some(p => !POSITIONS.includes(p))) {
        return { ok: false, error: `Postes de remplacement invalides pour le joueur ${idStr}.` };
      }
      if (positions.length) backupPositions[player.id] = [...positions];
    }
  }
  // Temps de jeu cible par poste (facultatif, voir Team.slotMinuteShares) :
  // { poste: { id: minutes 0-40 } }. Un poste absent = rotation automatique.
  let minutes = null;
  if (raw.minutes != null) {
    if (typeof raw.minutes !== "object") return { ok: false, error: "Temps de jeu invalides : objet { poste: { id: minutes } } attendu." };
    minutes = {};
    for (const [pos, m] of Object.entries(raw.minutes)) {
      if (!POSITIONS.includes(pos)) return { ok: false, error: `Poste inconnu dans les temps de jeu : ${pos}.` };
      if (!m || typeof m !== "object") return { ok: false, error: `Temps de jeu invalides pour le poste ${pos}.` };
      const out = {};
      for (const [idStr, v] of Object.entries(m)) {
        const player = byId.get(Number(idStr));
        if (!player) return { ok: false, error: `Joueur inconnu dans les temps de jeu : ${idStr}.` };
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 40) return { ok: false, error: `Temps de jeu hors limites (0-40 min) pour le joueur ${idStr}.` };
        out[player.id] = Math.round(n);
      }
      const total = Object.values(out).reduce((a, b) => a + b, 0);
      if (total > 40) return { ok: false, error: `Temps de jeu : ${total} min au poste ${pos}, 40 au maximum.` };
      minutes[pos] = out;
    }
    if (!Object.keys(minutes).length) minutes = null;
  }
  // Convocation (facultative, voir Team.convokedIds) : 12 joueurs au maximum.
  let convoked = null;
  if (raw.convoked != null) {
    if (!Array.isArray(raw.convoked)) return { ok: false, error: "Convocation invalide : liste d'ids attendue." };
    convoked = [];
    for (const idStr of raw.convoked) {
      const player = byId.get(Number(idStr));
      if (!player) return { ok: false, error: `Joueur inconnu dans la convocation : ${idStr}.` };
      if (!convoked.includes(player.id)) convoked.push(player.id);
    }
    if (convoked.length > 12) return { ok: false, error: "Convocation : 12 joueurs au maximum." };
  }
  const value = { starters, backupPositions };
  if (minutes) value.minutes = minutes;
  if (convoked) value.convoked = convoked;
  return { ok: true, value };
}

// Feuille de match : titulaires (un par poste, ou null) + remplacements de
// poste éventuels. Même format que team.lineup (voir teamFromSave côté
// moteur) — validation minimale mais réelle : postes connus, joueurs
// existants dans CET effectif (pas d'id fantôme). Voir validateLineupBody
// ci-dessus pour la validation elle-même (partagée avec setPlan).
function setLineup(team, teamIndex, league, body, now) {
  if (liveOrdersLocked(league, teamIndex, now)) return fail(ORDERS_LOCKED_ERROR);
  const v = validateLineupBody(team, body);
  if (!v.ok) return fail(v.error);
  team.lineup = v.value;
  return { ok: true, lineup: team.lineup, hasValidLineup: team.hasValidLineup() };
}

// Tactiques : jusqu'à 3 priorités offensives (parmi OFFENSE_PROFILES),
// une défense (DEFENSES), un rythme (RHYTHMS) — mêmes réglages que l'écran
// "Ordres" côté navigateur, ici préparés À L'AVANCE puisque le match se
// jouera tout seul au moment programmé. Voir validateOffensivePriorities/
// validateDefense/validateRhythm ci-dessus pour la validation elle-même
// (partagée avec setPlan).
function setTactics(team, teamIndex, league, body, now) {
  if (!body || typeof body !== "object") return fail("Tactiques invalides.");
  if (liveOrdersLocked(league, teamIndex, now)) return fail(ORDERS_LOCKED_ERROR);
  if (body.offensivePriorities !== undefined) {
    const v = validateOffensivePriorities(body.offensivePriorities);
    if (!v.ok) return fail(v.error);
    team.offensivePriorities = v.value;
  }
  if (body.defense !== undefined) {
    const v = validateDefense(body.defense);
    if (!v.ok) return fail(v.error);
    team.defense = v.value;
  }
  if (body.rhythm !== undefined) {
    const v = validateRhythm(body.rhythm);
    if (!v.ok) return fail(v.error);
    team.rhythm = v.value;
  }
  // Tactique confirmée (voir Team.constructor/SCREEN_DEFENSES et consorts
  // côté moteur) — mêmes champs, appliqués un par un exactement comme les
  // trois réglages historiques ci-dessus.
  if (body.tacticalTier !== undefined) {
    const v = validateTacticalTier(body.tacticalTier);
    if (!v.ok) return fail(v.error);
    team.tacticalTier = v.value;
  }
  if (body.screenDefense !== undefined) {
    const v = validateScreenDefense(body.screenDefense);
    if (!v.ok) return fail(v.error);
    team.screenDefense = v.value;
  }
  if (body.helpDefense !== undefined) {
    const v = validateHelpDefense(body.helpDefense);
    if (!v.ok) return fail(v.error);
    team.helpDefense = v.value;
  }
  if (body.watchAssignments !== undefined) {
    const v = validateWatchAssignments(body.watchAssignments);
    if (!v.ok) return fail(v.error);
    team.watchAssignments = v.value;
  }
  if (body.postDefense !== undefined) {
    const v = validatePostDefense(body.postDefense);
    if (!v.ok) return fail(v.error);
    team.postDefense = v.value;
  }
  if (body.closeoutStyle !== undefined) {
    const v = validateCloseoutStyle(body.closeoutStyle);
    if (!v.ok) return fail(v.error);
    team.closeoutStyle = v.value;
  }
  if (body.offRebStyle !== undefined) {
    const v = validateOffRebStyle(body.offRebStyle);
    if (!v.ok) return fail(v.error);
    team.offRebStyle = v.value;
  }
  if (body.endgameManagement !== undefined) {
    const v = validateEndgameManagement(body.endgameManagement);
    if (!v.ok) return fail(v.error);
    team.endgameManagement = v.value;
  }
  // Badge "Modifier vos ordres" (retour utilisateur, 2026-09, voir
  // Team.ordresValidatedRound côté moteur) : signal purement cosmétique,
  // envoyé UNIQUEMENT par le bouton explicite "✅ Valider les ordres" (jamais
  // par l'autosave-par-changement, qui appelle ce même endpoint à chaque
  // réglage modifié, voir syncTacticsToServer côté navigateur), donc
  // volontairement optionnel et sans effet sur le reste de cette fonction.
  // `isValidFutureRoundForTeam` (plus bas dans ce fichier) accepte aussi bien
  // la journée immédiate qu'une journée future : la seule chose qui compte
  // ici est "un match pas encore joué existe bien pour cette équipe à cette
  // journée", jamais une lecture qui déciderait quoi que ce soit côté moteur.
  if (body.markOrdresValidated === true && isValidFutureRoundForTeam(league, teamIndex, body.round)) {
    team.ordresValidatedRound = body.round;
  }
  return {
    ok: true, offensivePriorities: team.offensivePriorities, defense: team.defense, rhythm: team.rhythm,
    tacticalTier: team.tacticalTier, screenDefense: team.screenDefense, helpDefense: team.helpDefense,
    watchAssignments: team.watchAssignments, postDefense: team.postDefense, closeoutStyle: team.closeoutStyle,
    offRebStyle: team.offRebStyle, endgameManagement: team.endgameManagement,
    ordresValidatedRound: team.ordresValidatedRound,
  };
}

// Une journée valide pour une PRÉPARATION À L'AVANCE (voir setPlan plus bas) :
// un entier dans les bornes du calendrier, pour laquelle CETTE équipe a
// effectivement un match programmé, pas encore résolu — exactement la même
// définition que upcomingRoundsForOrders() côté navigateur (moteurbasket3.html,
// écran Ordres), pour que le serveur n'accepte jamais une journée que
// l'écran lui-même ne proposerait pas (déjà jouée, ou sans match pour cette
// équipe, ex. bye d'un tour impair).
function isValidFutureRoundForTeam(league, teamIndex, round) {
  if (!Number.isInteger(round) || round < 0 || round >= league.totalRounds) return false;
  const match = (league.schedule[round] || []).find(x => x.home === teamIndex || x.away === teamIndex);
  if (!match) return false;
  const alreadyPlayed = league.results.some(r => r.round === round && (r.home === teamIndex || r.away === teamIndex));
  return !alreadyPlayed;
}

// Équivalent, côté COUPE, de isValidFutureRoundForTeam ci-dessus (correctif
// 2026-09, retour utilisateur : "il faut pouvoir donner ses ordres pour
// chaque match [...] pour la Coupe") : un `round` valide pour une
// préparation à l'avance de Coupe est le tour ACTUELLEMENT en attente
// (League.pendingCupRound — les tours suivants n'existent pas encore, voir
// buildNextCupRound côté moteur, engendrés seulement une fois ce tour-ci
// résolu), pour lequel cette équipe a un match réel (jamais un bye, déjà
// résolu à la création du tour) pas encore résolu.
function isValidFutureCupRoundForTeam(league, teamIndex, round) {
  if (!Number.isInteger(round) || !league.pendingCupRound) return false;
  const pending = league.pendingCupRound();
  if (!pending || pending.index !== round) return false;
  const match = pending.matches.find(m => (m.home === teamIndex || m.away === teamIndex) && !m.bye);
  if (!match) return false;
  return !match.resolved;
}

// Verrou des ordres à T − 5 min (retour utilisateur, 2026-09-26 : "les ordres
// ne sont pas bloqués 5 min avant le match") — jusqu'ici le verrou n'existait
// QUE dans l'affichage de l'écran Ordres (moteurbasket3.html:renderOrdresGrid),
// jamais ici : /api/lineup, /api/tactics et /api/plan acceptaient tout
// jusqu'au coup d'envoi. MÊME fenêtre que l'ouverture de l'émission
// d'avant-match (Shows.lineupLocked, une seule source de vérité), appliquée
// au match pas encore joué de `competition`/`round` pour cette équipe.
const ORDERS_LOCKED_ERROR = "Ordres verrouillés : le coup d'envoi est dans moins de 5 minutes.";
function ordersLockedFor(league, teamIndex, competition, round, now) {
  if (typeof now !== "number" || typeof league.calendarStartAt !== "number") return false;
  let kickoffAt = null;
  if (competition === "cup") {
    if (!league.calendarDailyAnchored || !isValidFutureCupRoundForTeam(league, teamIndex, round)) return false;
    kickoffAt = Calendar.scheduledTimeForLeagueCupRound(league, round);
  } else {
    if (!isValidFutureRoundForTeam(league, teamIndex, round)) return false;
    kickoffAt = Calendar.scheduledTimeForLeagueRound(league, round);
  }
  return Shows.lineupLocked(now, kickoffAt);
}

// Ordres "en direct" (team.lineup/tactiques, voir setLineup/setTactics) :
// ils s'appliquent au prochain match de CHAMPIONNAT pas encore joué.
function liveOrdersLocked(league, teamIndex, now) {
  for (let r = league.round; r < league.totalRounds; r++) {
    if (isValidFutureRoundForTeam(league, teamIndex, r)) return ordersLockedFor(league, teamIndex, "championship", r, now);
  }
  return false;
}

// Préparation à l'avance des ordres d'une journée FUTURE (retour utilisateur,
// 2026-09 : "sur buzzerbeater on peut faire pour tous les matchs de la
// saison [...] pratique de pouvoir préparer sa semaine en avance") — c'est
// l'équivalent, pour un PLAN, de ce que setTactics/setLineup sont pour les
// ordres EN DIRECT. Jusqu'à ce correctif, la préparation d'une journée future
// ne mutait QUE l'état local du navigateur (teamA.stagePlanForRound) puis
// appelait saveMyTeam(), devenu un no-op dès qu'un jeton manager est actif —
// exactement le même trou de persistance que Salle/billets/boutique avant
// leur correctif : silencieusement perdu au prochain chargement, ou jamais
// vu par l'auto-simulation du serveur au moment programmé du match (voir
// server/autoSim.js/liveMatch.js -> Team.applyPlannedTacticsForRound).
//
// body: { round: <entier>, competition?: "championship"|"cup", patch: {
// offensivePriorities?, defense?, rhythm?, lineup?: { starters,
// backupPositions } } } — mêmes champs, au même format, que setTactics/
// setLineup ci-dessus (un patch PARTIEL est accepté, comme le panneau Ordres
// qui envoie un champ à la fois à chaque changement) ; réutilise les MÊMES
// validateurs pour ne jamais laisser les deux chemins diverger, puis
// applique via Team.stagePlanForRound (voir engine.js) qui porte déjà toute
// la logique de fusion avec le plan déjà en place pour cette journée/ce tour.
// `competition` (correctif 2026-09, retour utilisateur : "il faut pouvoir
// donner ses ordres pour chaque match [...] pour la Coupe") : omis ou toute
// valeur autre que "cup" retombe sur "championship" (comportement
// historique) — voir Team.plannedTactics/planKey côté moteur pour la clé
// composite qui évite qu'un tour de Coupe et une journée de championnat
// portant le même numéro ne s'écrasent l'un l'autre.
function setPlan(team, teamIndex, league, body, now) {
  if (!body || typeof body !== "object") return fail("Plan invalide.");
  const round = body.round;
  const competition = body.competition === "cup" ? "cup" : "championship";
  const validRound = competition === "cup"
    ? isValidFutureCupRoundForTeam(league, teamIndex, round)
    : isValidFutureRoundForTeam(league, teamIndex, round);
  if (!validRound) {
    return fail(`Journée invalide pour une préparation à l'avance (${competition}) : ${JSON.stringify(round)}.`);
  }
  if (ordersLockedFor(league, teamIndex, competition, round, now)) return fail(ORDERS_LOCKED_ERROR);
  const patchBody = body.patch;
  if (!patchBody || typeof patchBody !== "object") return fail("'patch' est requis.");
  const patch = {};
  if (patchBody.offensivePriorities !== undefined) {
    const v = validateOffensivePriorities(patchBody.offensivePriorities);
    if (!v.ok) return fail(v.error);
    patch.offensivePriorities = v.value;
  }
  if (patchBody.defense !== undefined) {
    const v = validateDefense(patchBody.defense);
    if (!v.ok) return fail(v.error);
    patch.defense = v.value;
  }
  if (patchBody.rhythm !== undefined) {
    const v = validateRhythm(patchBody.rhythm);
    if (!v.ok) return fail(v.error);
    patch.rhythm = v.value;
  }
  if (patchBody.lineup !== undefined) {
    const v = validateLineupBody(team, patchBody.lineup);
    if (!v.ok) return fail(v.error);
    patch.lineup = v.value;
  }
  // Tactique confirmée — mêmes champs/validateurs que setTactics ci-dessus,
  // pour qu'un plan préparé à l'avance puisse porter les mêmes réglages que
  // les ordres en direct.
  if (patchBody.tacticalTier !== undefined) {
    const v = validateTacticalTier(patchBody.tacticalTier);
    if (!v.ok) return fail(v.error);
    patch.tacticalTier = v.value;
  }
  if (patchBody.screenDefense !== undefined) {
    const v = validateScreenDefense(patchBody.screenDefense);
    if (!v.ok) return fail(v.error);
    patch.screenDefense = v.value;
  }
  if (patchBody.helpDefense !== undefined) {
    const v = validateHelpDefense(patchBody.helpDefense);
    if (!v.ok) return fail(v.error);
    patch.helpDefense = v.value;
  }
  if (patchBody.watchAssignments !== undefined) {
    const v = validateWatchAssignments(patchBody.watchAssignments);
    if (!v.ok) return fail(v.error);
    patch.watchAssignments = v.value;
  }
  if (patchBody.postDefense !== undefined) {
    const v = validatePostDefense(patchBody.postDefense);
    if (!v.ok) return fail(v.error);
    patch.postDefense = v.value;
  }
  if (patchBody.closeoutStyle !== undefined) {
    const v = validateCloseoutStyle(patchBody.closeoutStyle);
    if (!v.ok) return fail(v.error);
    patch.closeoutStyle = v.value;
  }
  if (patchBody.offRebStyle !== undefined) {
    const v = validateOffRebStyle(patchBody.offRebStyle);
    if (!v.ok) return fail(v.error);
    patch.offRebStyle = v.value;
  }
  if (patchBody.endgameManagement !== undefined) {
    const v = validateEndgameManagement(patchBody.endgameManagement);
    if (!v.ok) return fail(v.error);
    patch.endgameManagement = v.value;
  }
  if (Object.keys(patch).length === 0) return fail("'patch' ne contient aucun champ reconnu (offensivePriorities/defense/rhythm/lineup/tacticalTier/screenDefense/helpDefense/watchAssignments/postDefense/closeoutStyle/offRebStyle/endgameManagement).");
  const plan = team.stagePlanForRound(round, patch, competition);
  return { ok: true, round, competition, plan };
}

// Entraînement : une compétence (ou null pour arrêter) + les postes couverts
// (voir TRAINING_DILUTION_BY_POSITION_COUNT côté moteur — 1 à 5 postes,
// plus le nombre est grand, plus le rendement par poste est dilué). Prend
// effet à la fin de la semaine réelle en cours (voir autoSim.js) — pas
// besoin de cliquer "Valider la semaine", ce réglage RESTE actif tant qu'il
// n'est pas changé.
function setTraining(team, teamIndex, league, body, now = Date.now()) {
  if (!body || typeof body !== "object") return fail("Réglage d'entraînement invalide.");
  // Retour utilisateur (2026-09) : "enleve l'entrainement aucune
  // (entrainement général uniquement)" — une compétence d'entraînement
  // individuel est TOUJOURS requise désormais, `null` n'est plus une valeur
  // acceptée (contrairement à avant ce correctif).
  if (body.trainingSkill !== undefined && !TRAINING_PROGRAMS[body.trainingSkill]) {
    return fail(`Compétence d'entraînement inconnue : ${body.trainingSkill}.`);
  }
  if (body.trainingPositions !== undefined) {
    if (!Array.isArray(body.trainingPositions) || body.trainingPositions.length < 1 || body.trainingPositions.length > POSITIONS.length) {
      return fail(`trainingPositions doit être un tableau de 1 à ${POSITIONS.length} poste(s).`);
    }
    if (body.trainingPositions.some(p => !POSITIONS.includes(p))) {
      return fail(`Poste d'entraînement inconnu parmi : ${body.trainingPositions.join(", ")}.`);
    }
    if (new Set(body.trainingPositions).size !== body.trainingPositions.length) {
      return fail("Un même poste ne peut pas être sélectionné deux fois pour l'entraînement.");
    }
  }
  // Entraînement collectif (retour utilisateur, 2026-09, voir Team.
  // collectiveTraining côté moteur) : réglage SÉPARÉ de trainingSkill/
  // trainingPositions ci-dessus, transmis dans le même appel pour éviter un
  // aller-retour réseau supplémentaire depuis la page Entraînement.
  if (body.collectiveTraining !== null && body.collectiveTraining !== undefined
    && body.collectiveTraining !== "tactique" && body.collectiveTraining !== "recuperation") {
    return fail(`Entraînement collectif inconnu : ${body.collectiveTraining}.`);
  }
  // Tactique précisément travaillée à l'entraînement (retour utilisateur,
  // 2026-09, voir Team.trainedTactics côté moteur) : UN SEUL aspect à la
  // fois depuis ce correctif ("un seul aspect et pas tous les aspects") —
  // { category, value }, category parmi offense/defense/rhythm, value une
  // priorité offensive/défense/rythme CONNUE pour cette catégorie.
  let trainedTacticsValue;
  if (body.trainedTactics !== undefined) {
    const raw = body.trainedTactics;
    if (raw === null) {
      trainedTacticsValue = null;
    } else {
      if (typeof raw !== "object" || !raw) return fail("trainedTactics invalide.");
      const { category, value } = raw;
      if (!["offense", "defense", "rhythm"].includes(category)) {
        return fail(`trainedTactics.category invalide (attendu offense/defense/rhythm) : ${category}.`);
      }
      if (typeof value !== "string") return fail("trainedTactics.value doit être une chaîne.");
      if (category === "offense" && !OFFENSE_PROFILES[value]) {
        return fail(`Priorité offensive inconnue dans trainedTactics.value : ${value}.`);
      }
      if (category === "defense" && !DEFENSES[value]) {
        return fail(`Défense inconnue dans trainedTactics.value : ${value}.`);
      }
      if (category === "rhythm" && !RHYTHMS[value]) {
        return fail(`Rythme inconnu dans trainedTactics.value : ${value}.`);
      }
      trainedTacticsValue = { category, value };
    }
  }
  // Historique quotidien de l'entraînement collectif (voir Team.
  // syncCollectiveTrainingLog côté moteur) : comble d'abord tout jour
  // manqué depuis la dernière synchro avec la config ENCORE ACTUELLE (avant
  // mutation ci-dessous), puis, une fois la nouvelle config appliquée,
  // enregistre AUJOURD'HUI avec elle, sinon un changement de tactique
  // entraînée EN COURS DE JOURNÉE écraserait à tort le jour en cours avec
  // une config qui n'a été active qu'une partie de la journée.
  if (team.syncCollectiveTrainingLog) team.syncCollectiveTrainingLog(now);
  if (body.trainingSkill !== undefined) team.trainingSkill = body.trainingSkill;
  if (body.trainingPositions !== undefined) team.trainingPositions = [...body.trainingPositions];
  if (body.collectiveTraining !== undefined) team.collectiveTraining = body.collectiveTraining || null;
  if (body.trainedTactics !== undefined) team.trainedTactics = trainedTacticsValue;
  if (team.syncCollectiveTrainingLog) team.syncCollectiveTrainingLog(now);
  return {
    ok: true,
    trainingSkill: team.trainingSkill,
    trainingPositions: team.trainingPositions,
    collectiveTraining: team.collectiveTraining,
    trainedTactics: team.trainedTactics,
  };
}

// Marché : mettre un de ses joueurs aux enchères, à un prix choisi (voir
// League.listPlayerForSale) — l'équipe de l'appelant, `teamIndex` (voir
// note en tête de fichier ; plus jamais l'index 0 supposé implicitement).
function listPlayer(team, teamIndex, league, body, now) {
  if (!body || typeof body.playerId !== "number") return fail("playerId requis.");
  if (typeof body.price !== "number" || !(body.price > 0)) return fail("price doit être un nombre positif.");
  if (!team.players.some(p => p.id === body.playerId)) return fail(`Joueur inconnu dans cet effectif : ${body.playerId}.`);
  const listing = league.listPlayerForSale(teamIndex, body.playerId, body.price, now);
  if (!listing) return fail("Impossible de mettre ce joueur aux enchères (déjà listé ?).");
  return { ok: true, listing };
}

// Marché : enchérir sur une annonce ouverte (la sienne ou celle d'un
// adversaire — voir League.placeBid pour le détail des refus possibles).
// `listingId` est un id numérique (voir uid() côté moteur) — accepté aussi
// bien en nombre qu'en chaîne numérique (un identifiant peut voyager sous
// l'une ou l'autre forme selon le client JSON).
function bidOnListing(team, teamIndex, league, body, now) {
  if (!body || (typeof body.listingId !== "number" && typeof body.listingId !== "string") || body.listingId === "") {
    return fail("listingId requis.");
  }
  const listingId = typeof body.listingId === "string" && /^-?\d+$/.test(body.listingId) ? Number(body.listingId) : body.listingId;
  if (typeof body.amount !== "number" || !(body.amount > 0)) return fail("amount doit être un nombre positif.");
  const result = league.placeBid(listingId, teamIndex, body.amount, now);
  if (!result.ok) return fail(`Enchère refusée : ${result.reason}${result.minBid ? ` (minimum ${result.minBid})` : ""}.`);
  return { ok: true, listing: result.listing };
}

// Marché des entraîneurs (voir League.placeCoachBid) : même forme que
// bidOnListing ci-dessus — pas d'équivalent de listPlayer côté entraîneurs,
// puisque les candidats sont générés par le marché lui-même (voir
// League.generateCoachCandidate/refreshCoachMarket), personne ne "vend" son
// entraîneur.
function bidOnCoachListing(team, teamIndex, league, body, now) {
  if (!body || (typeof body.listingId !== "number" && typeof body.listingId !== "string") || body.listingId === "") {
    return fail("listingId requis.");
  }
  const listingId = typeof body.listingId === "string" && /^-?\d+$/.test(body.listingId) ? Number(body.listingId) : body.listingId;
  if (typeof body.amount !== "number" || !(body.amount > 0)) return fail("amount doit être un nombre positif.");
  const result = league.placeCoachBid(listingId, teamIndex, body.amount, now);
  if (!result.ok) return fail(`Enchère refusée : ${result.reason}${result.minBid ? ` (minimum ${result.minBid})` : ""}.`);
  return { ok: true, listing: result.listing };
}

// Salle : agrandissement d'UN palier (voir Team.upgradeArena/nextArenaLevel
// côté moteur — même méthode que celle appelée jusqu'ici directement côté
// navigateur sur `teamA`, ici appliquée au VRAI `team` reçu du serveur pour
// qu'elle persiste en mode multi-manager). Aucun corps de requête attendu
// (le client ne choisit pas un palier arbitraire, seulement "le suivant"
// exactement comme le bouton "Agrandir" de l'écran Salle) — `body` n'est
// donc pas utilisé ici, gardé dans la signature uniquement pour rester
// cohérent avec les autres actions.
function upgradeArena(team, teamIndex, league, body, now) {
  const next = team.nextArenaLevel();
  if (!next) return fail("Salle déjà au niveau maximum.");
  if (team.budget < next.upgradeCost) {
    return fail(`Budget insuffisant pour agrandir la salle (coût ${next.upgradeCost}, budget actuel ${team.budget}).`);
  }
  // team.upgradeArena() referifie les mêmes conditions et effectue la MÊME
  // mutation (recordTransaction + arenaLevel) que le code navigateur
  // remplacé ici — voir Team.upgradeArena dans engine.js.
  const applied = team.upgradeArena();
  if (!applied) return fail("Agrandissement de la salle refusé.");
  return { ok: true, arenaLevel: team.arenaLevel, budget: team.budget };
}

// Prix des billets : mise à jour partielle (une ou plusieurs catégories à
// la fois, voir SEAT_CATEGORIES) — même forme que setTactics ci-dessus (ne
// touche que ce qui est explicitement fourni). Aucun coût, donc pas de
// vérification de budget ici ; Team.setTicketPrice borne elle-même chaque
// prix à [minPrice, maxPrice] de sa catégorie (même comportement que le
// curseur <input type="range"> côté navigateur, qui empêche déjà
// physiquement de sortir de ces bornes) — seules une catégorie inconnue ou
// une valeur non numérique sont ici rejetées avant application.
function setTicketPrices(team, teamIndex, league, body) {
  if (!body || typeof body !== "object" || !body.prices || typeof body.prices !== "object") {
    return fail("Prix des billets invalides : 'prices' est requis (un prix par catégorie à modifier).");
  }
  const validKeys = new Set(SEAT_CATEGORIES.map(c => c.key));
  for (const [key, price] of Object.entries(body.prices)) {
    if (!validKeys.has(key)) return fail(`Catégorie de place inconnue : ${key}.`);
    if (typeof price !== "number" || !Number.isFinite(price)) return fail(`Prix invalide pour la catégorie ${key}.`);
  }
  for (const [key, price] of Object.entries(body.prices)) {
    team.setTicketPrice(key, price);
  }
  return { ok: true, ticketPrices: { ...team.ticketPrices } };
}

// Boutique des supporters : même logique que upgradeArena ci-dessus, voir
// Team.upgradeFanShop/nextFanShopLevel côté moteur.
function upgradeFanShop(team, teamIndex, league, body, now) {
  const next = team.nextFanShopLevel();
  if (!next) return fail("Boutique des supporters déjà au niveau maximum.");
  if (team.budget < next.cost) {
    return fail(`Budget insuffisant pour la boutique des supporters (coût ${next.cost}, budget actuel ${team.budget}).`);
  }
  const applied = team.upgradeFanShop();
  if (!applied) return fail("Achat de la boutique des supporters refusé.");
  return { ok: true, fanShopLevel: team.fanShopLevel, budget: team.budget };
}

// Congédiement de l'entraîneur (retour utilisateur, 2026-09 : "dès qu'un
// staff est viré parce que devenu trop cher, il faut qu'il retourne sur le
// marché avec un salaire baissé de 30%") — aucun corps de requête attendu
// (comme upgradeArena/upgradeFanShop ci-dessus : rien à choisir côté client,
// juste "congédier l'entraîneur actuel"), `body` gardé dans la signature
// uniquement pour rester cohérent avec les autres actions. Toute la règle
// (congédiement + relistage à -30%) vit sur League.fireTeamTrainer (voir
// engine.js, PARTAGÉE avec le bouton "Congédier" côté navigateur en solo) —
// cette action se contente de l'appeler avec le bon teamIndex/now et de
// remonter son résultat. Jamais d'échec métier possible ici (fireTeamTrainer
// est un no-op propre s'il n'y a pas d'entraîneur en poste), donc pas de
// fail() dans le cas normal — gardé quand même en défense (teamIndex hors
// bornes, ne devrait jamais arriver : resolvePlayerContext l'a déjà garanti
// valide avant d'appeler cette action).
function fireTrainer(team, teamIndex, league, body, now) {
  const result = league.fireTeamTrainer(teamIndex, now);
  if (!result.ok) return fail("Congédiement de l'entraîneur refusé.");
  return { ok: true, relisted: result.relisted };
}

// Marché des analystes vidéo (voir League.placeAnalystBid) : même forme que
// bidOnCoachListing ci-dessus — DEUXIÈME marché de staff, structurellement
// identique (voir engine.js), juste une liste (analystListings) et une
// méthode League différentes.
function bidOnAnalystListing(team, teamIndex, league, body, now) {
  if (!body || (typeof body.listingId !== "number" && typeof body.listingId !== "string") || body.listingId === "") {
    return fail("listingId requis.");
  }
  const listingId = typeof body.listingId === "string" && /^-?\d+$/.test(body.listingId) ? Number(body.listingId) : body.listingId;
  if (typeof body.amount !== "number" || !(body.amount > 0)) return fail("amount doit être un nombre positif.");
  const result = league.placeAnalystBid(listingId, teamIndex, body.amount, now);
  if (!result.ok) return fail(`Enchère refusée : ${result.reason}${result.minBid ? ` (minimum ${result.minBid})` : ""}.`);
  return { ok: true, listing: result.listing };
}

// Congédiement de l'analyste vidéo — même forme que fireTrainer ci-dessus
// (aucun corps de requête attendu, toute la règle vit sur
// League.fireTeamVideoAnalyst, PARTAGÉE avec le bouton "Congédier" côté
// navigateur en solo — voir engine.js).
function fireVideoAnalyst(team, teamIndex, league, body, now) {
  const result = league.fireTeamVideoAnalyst(teamIndex, now);
  if (!result.ok) return fail("Congédiement de l'analyste vidéo refusé.");
  return { ok: true, relisted: result.relisted };
}

// Séance vidéo (retour utilisateur, 2026-09 : "il faudrait pouvoir scouter
// l'effectif de son adversaire [...] en faisant une séance vidéo de
// l'adversaire") : action DÉLIBÉRÉE du manager, à la différence de
// fireTrainer/fireVideoAnalyst ci-dessus elle PREND un corps de requête —
// `body.opponentIdx`, l'équipe ADVERSE choisie pour cette séance. Validé ici
// (entier, dans les bornes de la ligue, différent de teamIndex) AVANT
// d'appeler League.runVideoSession — qui revalide de toute façon la même
// chose (défense en profondeur, comme isValidFutureRoundForTeam/setPlan plus
// haut), mais un message d'erreur HTTP explicite ("opponentIdx invalide")
// est plus utile qu'un "invalid-opponent" générique remonté tel quel si le
// client envoie n'importe quoi (string, flottant, absent...).
// Marché des recruteurs (voir League.placeRecruiterBid) : TROISIÈME marché
// de staff, même forme que bidOnCoachListing/bidOnAnalystListing ci-dessus.
function bidOnRecruiterListing(team, teamIndex, league, body, now) {
  if (!body || (typeof body.listingId !== "number" && typeof body.listingId !== "string") || body.listingId === "") {
    return fail("listingId requis.");
  }
  const listingId = typeof body.listingId === "string" && /^-?\d+$/.test(body.listingId) ? Number(body.listingId) : body.listingId;
  if (typeof body.amount !== "number" || !(body.amount > 0)) return fail("amount doit être un nombre positif.");
  const result = league.placeRecruiterBid(listingId, teamIndex, body.amount, now);
  if (!result.ok) return fail(`Enchère refusée : ${result.reason}${result.minBid ? ` (minimum ${result.minBid})` : ""}.`);
  return { ok: true, listing: result.listing };
}

// Congédiement du recruteur — même forme que fireTrainer/fireVideoAnalyst
// ci-dessus (toute la règle vit sur League.fireTeamRecruiter, PARTAGÉE avec
// le bouton "Congédier" côté navigateur en solo — voir engine.js).
function fireRecruiter(team, teamIndex, league, body, now) {
  const result = league.fireTeamRecruiter(teamIndex, now);
  if (!result.ok) return fail("Congédiement du recruteur refusé.");
  return { ok: true, relisted: result.relisted };
}

// Centre de formation : agrandissement d'UN palier — même forme que
// upgradeArena/upgradeFanShop ci-dessus (voir Team.upgradeTrainingCenter/
// nextTrainingCenterLevel côté moteur). Aucun corps de requête attendu.
function upgradeTrainingCenter(team, teamIndex, league, body, now) {
  const next = team.nextTrainingCenterLevel();
  if (!next) return fail("Centre de formation déjà au niveau maximum.");
  if (team.budget < next.upgradeCost) {
    return fail(`Budget insuffisant pour le Centre de formation (coût ${next.upgradeCost}, budget actuel ${team.budget}).`);
  }
  const applied = team.upgradeTrainingCenter();
  if (!applied) return fail("Agrandissement du Centre de formation refusé.");
  return { ok: true, trainingCenterLevel: team.trainingCenterLevel, budget: team.budget };
}

// Autres infrastructures du club (station TV, salle de musculation, espace
// bien-être — voir CLUB_FACILITIES/Team.upgradeFacility côté moteur) : même
// forme que upgradeArena/upgradeFanShop/upgradeTrainingCenter ci-dessus (un
// palier à la fois, vérifié par le budget), sauf qu'une SEULE fonction sert
// les trois infrastructures — `body.facility` choisit laquelle (clé de
// CLUB_FACILITIES), au lieu de dupliquer trois fois ce même petit bloc.
function upgradeFacility(team, teamIndex, league, body, now) {
  const key = body && body.facility;
  const cfg = CLUB_FACILITIES[key];
  if (!cfg) return fail("Infrastructure inconnue.");
  const next = team.nextFacilityLevel(key);
  if (!next) return fail(`${cfg.name} déjà au niveau maximum.`);
  if (team.budget < next.cost) {
    return fail(`Budget insuffisant pour ${cfg.name} (coût ${next.cost}, budget actuel ${team.budget}).`);
  }
  const applied = team.upgradeFacility(key);
  if (!applied) return fail(`Achat de ${cfg.name} refusé.`);
  return { ok: true, facilityLevels: { ...team.facilityLevels }, budget: team.budget };
}

// Académie de jeunes : signer un candidat en attente (voir
// Team.signYouthCandidate) — déplace vers l'effectif jeunes (youthPlayers,
// plafonné à MAX_YOUTH_ROSTER_SIZE), fixe le salaire de stagiaire.
function signYouthCandidate(team, teamIndex, league, body, now) {
  if (!body || (typeof body.candidateId !== "number" && typeof body.candidateId !== "string") || body.candidateId === "") {
    return fail("candidateId requis.");
  }
  const candidateId = typeof body.candidateId === "string" && /^-?\d+$/.test(body.candidateId) ? Number(body.candidateId) : body.candidateId;
  const result = team.signYouthCandidate(candidateId);
  if (!result.ok) {
    const reasons = {
      "not-found": "Candidat introuvable (déjà signé, ignoré ou expiré ?).",
      "youth-roster-full": "L'effectif jeunes est déjà complet (15 stagiaires).",
    };
    return fail(reasons[result.reason] || "Signature refusée.");
  }
  return { ok: true, player: result.player };
}

// Académie de jeunes : ignorer/décliner un candidat en attente (voir
// Team.declineYouthCandidate) — aucune place d'effectif consommée.
function declineYouthCandidate(team, teamIndex, league, body, now) {
  if (!body || (typeof body.candidateId !== "number" && typeof body.candidateId !== "string") || body.candidateId === "") {
    return fail("candidateId requis.");
  }
  const candidateId = typeof body.candidateId === "string" && /^-?\d+$/.test(body.candidateId) ? Number(body.candidateId) : body.candidateId;
  const result = team.declineYouthCandidate(candidateId);
  if (!result.ok) return fail("Candidat introuvable (déjà traité ou expiré ?).");
  return { ok: true };
}

// Académie de jeunes : décision du manager sur un jeune de 18 ans en attente
// (voir Team.pendingYouthDecisions/promoteYouthPlayer) — PROMOTION vers
// l'effectif pro.
function promoteYouthPlayer(team, teamIndex, league, body, now) {
  if (!body || (typeof body.playerId !== "number" && typeof body.playerId !== "string") || body.playerId === "") {
    return fail("playerId requis.");
  }
  const playerId = typeof body.playerId === "string" && /^-?\d+$/.test(body.playerId) ? Number(body.playerId) : body.playerId;
  // `now`, déjà reçu explicitement en paramètre ci-dessus (voir l'appelant),
  // transmis tel quel : c'est lui qui date l'entrée d'historique ajoutée par
  // Team.promoteYouthPlayer (retour utilisateur, 2026-09 : "ajoute la date à
  // laquelle le joueur est passé pro").
  const result = team.promoteYouthPlayer(playerId, now);
  if (!result.ok) {
    const reasons = {
      "not-found": "Jeune introuvable dans l'académie.",
      "roster-full": "Effectif pro déjà au plafond (impossible de promouvoir).",
    };
    return fail(reasons[result.reason] || "Promotion refusée.");
  }
  return { ok: true, player: result.player };
}

// Académie de jeunes : LIBÉRATION d'un jeune de 18 ans en attente (voir
// Team.releaseYouthPlayer) — retiré définitivement, libère sa place.
function releaseYouthPlayer(team, teamIndex, league, body, now) {
  if (!body || (typeof body.playerId !== "number" && typeof body.playerId !== "string") || body.playerId === "") {
    return fail("playerId requis.");
  }
  const playerId = typeof body.playerId === "string" && /^-?\d+$/.test(body.playerId) ? Number(body.playerId) : body.playerId;
  const result = team.releaseYouthPlayer(playerId);
  if (!result.ok) return fail("Jeune introuvable dans l'académie.");
  return { ok: true };
}

// ---------------------------------------------------------------------
// MÉDIAS : interviews de jalon en attente (voir Team.pendingInterviews/
// resolveInterview/skipInterview/MILESTONE_INTERVIEW_TONES côté moteur),
// même esprit de file d'attente que signYouthCandidate/declineYouthCandidate
// plus haut.
// ---------------------------------------------------------------------
// Correctif 2026-09 (retour utilisateur : "tu as mis plus de question avec
// la possibilité de choisir le ton pour chacune d'entre elle et pas
// uniquement un ton pour toutes les questions ?") : `body.tones` (tableau,
// un ton par question, voir Team.resolveInterview/interviewTranscriptFor
// côté moteur) est désormais le format normal envoyé par le client ;
// `body.tone` (chaîne unique, ancien format, appliquée aux deux questions)
// reste accepté en compatibilité ascendante.
function respondToInterview(team, teamIndex, league, body, now) {
  if (!body || (typeof body.id !== "number" && typeof body.id !== "string") || body.id === "") {
    return fail("id requis.");
  }
  const id = typeof body.id === "string" && /^-?\d+$/.test(body.id) ? Number(body.id) : body.id;
  let tones = body.tones !== undefined ? body.tones : body.tone;
  const toneList = Array.isArray(tones) ? tones : [tones];
  if (!toneList.length || toneList.some(t => typeof t !== "string" || !MILESTONE_INTERVIEW_TONES[t])) {
    return fail(`Ton inconnu, attendu parmi : ${Object.keys(MILESTONE_INTERVIEW_TONES).join(", ")}.`);
  }
  const result = team.resolveInterview(id, tones, now);
  // "délai dépassé" générique (retour utilisateur, 2026-09 : les interviews
  // de jalon (mi-saison/fin de saison régulière/demi-finale de PO)
  // utilisent désormais un délai de 3 jours plutôt que 2h, voir
  // MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS côté moteur) : ce message ne
  // peut plus annoncer une durée fixe sans risquer d'être faux selon le type
  // d'interview concerné.
  if (!result || !result.ok) return fail("Interview introuvable (déjà traitée, ou délai de réponse dépassé).");
  return { ok: true, delta: result.delta, fanMorale: team.fanMorale, formDelta: result.formDelta };
}

function skipInterview(team, teamIndex, league, body, now) {
  if (!body || (typeof body.id !== "number" && typeof body.id !== "string") || body.id === "") {
    return fail("id requis.");
  }
  const id = typeof body.id === "string" && /^-?\d+$/.test(body.id) ? Number(body.id) : body.id;
  const removed = team.skipInterview(id, now);
  if (!removed) return fail("Interview introuvable (déjà traitée ?).");
  return { ok: true };
}

// Demande de transfert (retour utilisateur, 2026-09 : "un joueur très
// frustré [...] peut demander son transfert dans la presse [...] ouvrir la
// discussion avec lui pour le remotiver", voir le grand commentaire au-
// dessus de TRANSFER_REQUEST_MOTIVATION_THRESHOLD côté moteur) : action
// "discuter", chance de succès non garantie (voir Team.
// discussTransferRequest). Vendre le joueur concerné n'a besoin d'aucune
// action dédiée : c'est déjà listPlayer ci-dessus (marché des transferts).
function discussTransferRequest(team, teamIndex, league, body, now) {
  if (!body || (typeof body.playerId !== "number" && typeof body.playerId !== "string") || body.playerId === "") {
    return fail("playerId requis.");
  }
  const playerId = typeof body.playerId === "string" && /^-?\d+$/.test(body.playerId) ? Number(body.playerId) : body.playerId;
  const result = team.discussTransferRequest(playerId, now);
  if (!result.ok) {
    const reasons = {
      "not-found": "Joueur introuvable dans cet effectif.",
      "not-requesting": "Ce joueur n'a pas demandé son transfert.",
    };
    return fail(reasons[result.reason] || "Discussion refusée.");
  }
  return { ok: true, success: result.success, formBefore: result.formBefore, formAfter: result.formAfter };
}

// ---------------------------------------------------------------------
// IDENTITÉ DU CLUB : logo et maillots (retour utilisateur, 2026-09 : "une
// petite page d'accueil pour les autres équipes [...] le logo et les
// maillots doivent pouvoir être modifiés dans le tableau de bord"). Voir
// Team.setJersey/setCustomLogo/setPaying côté moteur pour la validation de
// fond (ces fonctions-ci ne font que vérifier la FORME du corps de requête
// avant de leur déléguer la décision, même patron que le reste de ce
// fichier).
// ---------------------------------------------------------------------
function setTeamJersey(team, teamIndex, league, body, now) {
  if (!body || typeof body.shape !== "string" || typeof body.color !== "string") {
    return fail("'shape' et 'color' sont requis.");
  }
  const result = team.setJersey(body.shape, body.color);
  if (!result.ok) return fail(result.error);
  return { ok: true, jerseyShape: team.jerseyShape, jerseyColor: team.jerseyColor };
}

// Motif de maillot (retour utilisateur, 2026-09 : "Pour le mode payant
// ajoute des maillots avec des dessins particuliers (rayure, degrade...)") :
// voir Team.setJerseyPattern pour la validation de fond (réservé aux clubs
// `isPaying`, sauf retour à "uni" toujours autorisé).
function setTeamJerseyPattern(team, teamIndex, league, body, now) {
  if (!body || typeof body.pattern !== "string") return fail("'pattern' est requis.");
  const result = team.setJerseyPattern(body.pattern);
  if (!result.ok) return fail(result.error);
  return { ok: true, jerseyPattern: team.jerseyPattern };
}

// Combinaison de 2 couleurs de maillot (retour utilisateur, 2026-09 : "ajoute
// un peu plus de couleur pour le mode payant, et mets le choix de 2
// couleurs [...] mets plus de choix") : même patron que setTeamJerseyPattern
// ci-dessus.
function setTeamJerseyTwoTone(team, teamIndex, league, body, now) {
  if (!body || typeof body.key !== "string") return fail("'key' est requis.");
  const result = team.setJerseyTwoTone(body.key);
  if (!result.ok) return fail(result.error);
  return { ok: true, jerseyTwoTone: team.jerseyTwoTone };
}

// Maillot extérieur (retour utilisateur, 2026-09 : "sur les maillots, il y
// a un problème, c'est qu'on ne peut choisir que les maillots domiciles, il
// faudrait changer ça" puis "Travaille sur les maillots extérieurs
// également") : même patron que setTeamJersey/setTeamJerseyPattern/
// setTeamJerseyTwoTone ci-dessus, sur Team.setAwayJerseyColor/
// setAwayJerseyPattern/setAwayJerseyTwoTone (validation de fond côté
// engine.js). Pas de forme séparée : le maillot extérieur partage
// Team.jerseyShape avec le maillot domicile (un club n'a qu'une seule coupe
// de maillot).
function setTeamAwayJersey(team, teamIndex, league, body, now) {
  if (!body || typeof body.color !== "string") return fail("'color' est requis.");
  const result = team.setAwayJerseyColor(body.color);
  if (!result.ok) return fail(result.error);
  return { ok: true, awayJerseyColor: team.awayJerseyColor };
}

function setTeamAwayJerseyPattern(team, teamIndex, league, body, now) {
  if (!body || typeof body.pattern !== "string") return fail("'pattern' est requis.");
  const result = team.setAwayJerseyPattern(body.pattern);
  if (!result.ok) return fail(result.error);
  return { ok: true, awayJerseyPattern: team.awayJerseyPattern };
}

function setTeamAwayJerseyTwoTone(team, teamIndex, league, body, now) {
  if (!body || typeof body.key !== "string") return fail("'key' est requis.");
  const result = team.setAwayJerseyTwoTone(body.key);
  if (!result.ok) return fail(result.error);
  return { ok: true, awayJerseyTwoTone: team.awayJerseyTwoTone };
}

function setTeamLogo(team, teamIndex, league, body, now) {
  if (!body || !("dataUrl" in body)) return fail("'dataUrl' requis (ou null pour retirer le logo personnalisé).");
  const result = team.setCustomLogo(body.dataUrl === null ? null : body.dataUrl);
  if (!result.ok) return fail(result.error);
  return { ok: true };
}

// Interrupteur manuel "club payant" (voir le grand commentaire sur
// JERSEY_COLORS dans engine.js : aucun vrai système de paiement pour
// l'instant). Volontairement AUCUNE restriction ici sur qui peut se
// l'accorder : ce n'est qu'un statut de démonstration en attendant un vrai
// système de paiement, pas un droit à protéger.
function setTeamPaying(team, teamIndex, league, body, now) {
  if (!body || typeof body.isPaying !== "boolean") return fail("'isPaying' (booléen) requis.");
  team.setPaying(body.isPaying);
  return { ok: true, isPaying: team.isPaying };
}

// Trigramme personnalisé (retour communauté 2026-09 : "Pouvoir choisir son
// trigramme", "qui peut être que 2 lettres") : 2 ou 3 lettres A-Z, pas d'insulte, unique dans la ligue (face aux
// trigrammes choisis comme aux sigles calculés des autres clubs), un
// changement tous les 30 jours. `null`/"" = retour au sigle calculé.
function setTeamTrigram(team, teamIndex, league, body, now) {
  const raw = body && body.trigram;
  if (raw == null || raw === "") {
    team.trigram = null;
    return { ok: true, trigram: null };
  }
  const value = String(raw).trim().toUpperCase();
  if (!Engine.isValidTrigram(value)) return fail("Le trigramme doit faire 2 ou 3 lettres (A-Z).");
  if (Engine.TRIGRAM_BANNED.has(value)) return fail("Ce trigramme n'est pas autorisé.");
  if (value === team.trigram) return { ok: true, trigram: value };
  if (typeof team.trigramChangedAt === "number" && now - team.trigramChangedAt < Engine.TRIGRAM_CHANGE_COOLDOWN_MS) {
    const days = Math.ceil((Engine.TRIGRAM_CHANGE_COOLDOWN_MS - (now - team.trigramChangedAt)) / (24 * 3600 * 1000));
    return fail(`Trigramme déjà modifié récemment : prochain changement possible dans ${days} jour${days > 1 ? "s" : ""}.`);
  }
  const taken = league.teams.some((t, i) => i !== teamIndex && Engine.teamTrigram(t) === value);
  if (taken) return fail("Ce trigramme est déjà utilisé par un autre club de la ligue.");
  team.trigram = value;
  team.trigramChangedAt = now;
  return { ok: true, trigram: value };
}

// Nom de salle personnalisé (retour communauté 2026-09 : "Modifier le nom de
// sa salle") : 3 à 30 caractères, lettres/chiffres/espaces/'-., pas
// d'insulte. `null`/"" = retour au nom du palier.
function setTeamArenaName(team, teamIndex, league, body, now) {
  const raw = body && body.arenaName;
  if (raw == null || String(raw).trim() === "") {
    team.arenaName = null;
    return { ok: true, arenaName: null };
  }
  const value = String(raw).replace(/\s+/g, " ").trim();
  if (value.length < 3 || value.length > Engine.ARENA_NAME_MAX_LENGTH) return fail(`Le nom de la salle doit faire entre 3 et ${Engine.ARENA_NAME_MAX_LENGTH} caractères.`);
  if (!/^[\p{L}\p{N} '\-.&]+$/u.test(value)) return fail("Le nom de la salle contient des caractères non autorisés.");
  if (Engine.containsBannedWord(value)) return fail("Ce nom de salle n'est pas autorisé.");
  team.arenaName = value;
  return { ok: true, arenaName: value };
}

// Tutoriel d'accueil (retour utilisateur, 2026-09 : "on est d'accord qu'on
// ne peut le faire qu'une fois ? [...] le bouton dans le guide doit
// s'enlever") : nécessaire côté serveur pour la ligue partagée, où
// saveMyTeam() (seul point d'écriture jusqu'ici, solo uniquement) ne peut
// pas persister ce champ (voir moteurbasket3.html:saveMyTeam) : sans ce
// point d'entrée, le bouton "Lancer le tutoriel" réapparaissait à chaque
// rechargement de page pour un manager de ligue partagée.
function setOnboardingTourCompleted(team, teamIndex, league, body, now) {
  team.markOnboardingTourCompleted();
  return { ok: true, onboardingTourCompleted: team.onboardingTourCompleted };
}

// Prime d'un thème du tutoriel d'accueil terminé (retour utilisateur,
// 2026-09 : "Mets les vrais primes sur le tutoriel") : voir
// Team.claimTutorialReward côté moteur pour le montant par thème
// (TOUR_REWARD_BY_TOPIC) et la protection anti-doublon
// (tutorialRewardsClaimed) : cette fonction-ci ne fait que valider la FORME
// du corps de requête avant de déléguer la décision, même patron que le
// reste de ce fichier. Le serveur reste la seule source de vérité sur le
// montant réellement crédité (`amount`) : le client (voir performTutorialRewardClaim
// côté moteurbasket3.html) n'envoie jamais de montant, seulement le `topic`.
function claimTutorialReward(team, teamIndex, league, body, now) {
  if (!body || typeof body.topic !== "string" || !body.topic) {
    return fail("'topic' requis.");
  }
  const result = team.claimTutorialReward(body.topic);
  if (!result.ok) return fail(result.error || "Thème de tutoriel inconnu.");
  return { ok: true, amount: result.amount, alreadyClaimed: result.alreadyClaimed, budget: team.budget };
}

function runVideoSession(team, teamIndex, league, body, now) {
  if (!body || typeof body !== "object") return fail("Corps de requête invalide : 'opponentIdx' est requis.");
  const opponentIdx = body.opponentIdx;
  if (!Number.isInteger(opponentIdx) || opponentIdx < 0 || opponentIdx >= league.teams.length || opponentIdx === teamIndex) {
    return fail(`opponentIdx invalide : ${JSON.stringify(body.opponentIdx)}.`);
  }
  const result = league.runVideoSession(teamIndex, opponentIdx, now);
  if (!result.ok) {
    const reasons = {
      "no-analyst": "Aucun analyste vidéo sous contrat.",
      "already-scouted": "Cette équipe a déjà été scoutée cette saison.",
      "cooldown": "Une séance vidéo a déjà été utilisée aujourd'hui, réessayez demain.",
      "invalid-opponent": "Adversaire invalide.",
      "invalid-team": "Équipe invalide.",
    };
    return fail(reasons[result.reason] || "Séance vidéo refusée.");
  }
  return { ok: true, opponentIdx: result.opponentIdx, revealed: result.revealed, analystLevel: result.analystLevel };
}

// Scouting Pro (retour utilisateur, 2026-09 — voir le grand commentaire en
// tête de server/scouting.js) : ces 3 fonctions ne font qu'adapter la
// signature commune (team, teamIndex, league, body, now) attendue par
// ACTION_ROUTES (voir index.js) vers server/scouting.js, qui porte toute la
// vraie logique (validation, quota, péremption) et reste testable seul.
function createScoutingAdTicket(team, teamIndex, league, body, now) {
  const opponentIdx = body && body.opponent;
  if (!Number.isInteger(opponentIdx)) return fail(`opponent invalide : ${JSON.stringify(body && body.opponent)}.`);
  return Scouting.createAdTicket(league, teamIndex, opponentIdx, now);
}

function completeScoutingAdTicket(team, teamIndex, league, body, now) {
  const ticketId = body && body.ticketId;
  if (typeof ticketId !== "string" || !ticketId) return fail("ticketId invalide.");
  return Scouting.completeAdTicket(league, teamIndex, ticketId, now);
}

// Bouton "Passer Pro" factice (voir Team.scoutingPremium côté moteur) :
// body.premium true/false bascule l'abonnement, AUCUN paiement réel.
function setScoutingPremium(team, teamIndex, league, body) {
  return Scouting.setPremium(team, !!(body && body.premium));
}

// Hoop Shows — envoi des réponses aux pronostics d'une émission (voir
// server/shows.js:submitPronosticsSync, DEV_NOTES.md point 11).
// `body.showId`/`body.answers` (objet questionId -> optionId, voir
// showPlayer.js onSubmitPronostics).
function submitPronostics(team, teamIndex, league, body, now) {
  const showId = body && body.showId;
  if (typeof showId !== "string" || !showId) return fail("showId invalide.");
  const answers = body && body.answers;
  if (!answers || typeof answers !== "object") return fail("answers invalide.");
  return Shows.submitPronosticsSync(league, teamIndex, showId, answers, now);
}

module.exports = {
  setLineup, setTactics, setTraining, setPlan, listPlayer, bidOnListing, bidOnCoachListing,
  upgradeArena, setTicketPrices, upgradeFanShop, fireTrainer,
  bidOnAnalystListing, fireVideoAnalyst, runVideoSession,
  // Académie de jeunes (recruteur + centre de formation + pipeline privé de
  // prospects, voir engine.js) :
  bidOnRecruiterListing, fireRecruiter, upgradeTrainingCenter,
  signYouthCandidate, declineYouthCandidate, promoteYouthPlayer, releaseYouthPlayer,
  // Autres infrastructures du club (station TV, salle de musculation, espace
  // bien-être, voir CLUB_FACILITIES côté moteur) :
  upgradeFacility,
  // Médias : interviews d'après-match (voir Team.pendingInterviews côté
  // moteur) :
  respondToInterview, skipInterview,
  // Demande de transfert (voir le grand commentaire au-dessus de
  // TRANSFER_REQUEST_MOTIVATION_THRESHOLD côté moteur) :
  discussTransferRequest,
  setTeamJersey, setTeamJerseyPattern, setTeamJerseyTwoTone,
  setTeamAwayJersey, setTeamAwayJerseyPattern, setTeamAwayJerseyTwoTone,
  setTeamLogo, setTeamPaying, setTeamTrigram, setTeamArenaName,
  // Tutoriel d'accueil (voir engine.js:Team.markOnboardingTourCompleted/
  // claimTutorialReward) :
  setOnboardingTourCompleted, claimTutorialReward,
  // Scouting Pro (voir server/scouting.js) :
  createScoutingAdTicket, completeScoutingAdTicket, setScoutingPremium,
  submitPronostics,
};
