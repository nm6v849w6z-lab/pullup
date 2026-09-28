// =====================================================================
// SIMULATION AUTOMATIQUE — le cœur du "calendrier réel" (retour
// utilisateur, 2026-09) : fait avancer une ligue TOUTE SEULE, jusqu'à
// l'instant réel `now`, sans qu'un manager ait besoin de cliquer sur quoi
// que ce soit. Généralisé multi-manager (2026-09, "jusqu'à 10 vrais
// managers humains dans une ligue partagée") : ne connaît plus "le club du
// joueur" (un seul, forcément à l'index 0) — toute la logique raisonne
// maintenant sur LA LIGUE entière (voir Team.isHuman, League.liveMatches) ;
// server/liveMatch.js:finalizeRound règle une journée entière (chaque match
// humain — live ou rattrapé — et chaque match CPU-vs-CPU) d'un coup, quel
// que soit le nombre de managers humains impliqués (0 à 10).
//
// Deux différences assumées par rapport au clic "Verrouiller & simuler" +
// "Valider la semaine" côté navigateur historique :
//   1) SANS l'écran de lecture en direct pour un match jamais démarré en
//      direct (rien à animer, personne ne regarde) — seul le score final
//      compte, via simulateOrForfeit comme pour un match CPU-vs-CPU.
//   2) N'importe quelle équipe humaine peut se retrouver forfait comme
//      n'importe quel CPU (voir simulateOrForfeit) plutôt que de passer par
//      l'écran "🏳️ Déclarer forfait" dédié — logique, un manager absent au
//      moment du match ne peut pas cliquer sur un bouton.
//
// Module UMD (comme engine.js/calendar.js) : `now` est TOUJOURS un
// paramètre explicite, jamais un Date.now() implicite à l'intérieur de ces
// fonctions (même règle que TRANSFER_AUCTION_DURATION_MS côté moteur), pour
// rester testable de façon déterministe — voir server/autoSim_test.js.
// =====================================================================
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../engine.js"), require("./calendar.js"), require("./liveMatch.js"));
  } else {
    root.BasketAutoSim = factory(root.BasketEngine, root.BasketCalendar, root.BasketLiveMatch);
  }
})(typeof self !== "undefined" ? self : this, function (Engine, Calendar, LiveMatch) {

const {
  realWeekIndexForRound, isLastRoundOfRealWeek, scheduledTimeForLeagueRound,
  scheduledTimeForLeagueCupRound, scheduledTimeForLeagueEconomyTick, MATCH_BROADCAST_DURATION_MS,
  dailyAnchoredDayIndexForChampionshipRound, dailyAnchoredSlotIndexForChampionshipRound,
  DAILY_ANCHORED_CHAMPIONSHIP_HOURS,
} = Calendar;
const {
  ensureLiveMatchStarted, ensureCupLiveMatchStarted, finalizeRound, finalizeCupRound,
  ensurePlayoffLiveMatchStarted, finalizePlayoffRound,
} = LiveMatch;
const { seasonObjectiveSurprisePlayoffsBonus } = Engine;
// Dernier créneau de championnat du jour (19h — voir DAILY_ANCHORED_CHAMPIONSHIP_HOURS
// dans server/calendar.js) : c'est APRÈS celui-ci que se déclenche
// l'entraînement + l'économie quotidiens (voir catchUpDailyAnchored ci-dessous
// et le retour utilisateur, 2026-09 : "toutes les 3 matchs" pour le nouveau
// rythme, lu comme "une fois par jour civil, juste après le créneau de 19h" —
// couvre 2 matchs de championnat + 1 de coupe un jour normal, dégrade
// proprement à "quand même une fois ce jour-là" un jour sans coupe due).
const LAST_DAILY_CHAMPIONSHIP_SLOT_INDEX = DAILY_ANCHORED_CHAMPIONSHIP_HOURS.length - 1;

// Fait avancer `league` de tout ce qui est dû à l'instant réel `now` :
// journées de championnat (2/semaine réelle), entraînement hebdomadaire (une
// fois par semaine réelle, après le 2e match de la semaine, POUR CHAQUE
// équipe humaine — voir Team.isHuman), rafraîchissement du marché des
// transferts (enchères réelles de 3 jours, indépendantes du calendrier de
// championnat), et matchs de play-offs (voir catchUpPlayoffs plus bas) une
// fois la saison régulière terminée. Peut rattraper PLUSIEURS semaines d'un
// coup (manager absent un moment) : chaque itération de chaque boucle ne
// traite qu'UNE journée (ou UN match de play-offs) à la fois, dans l'ordre
// chronologique.
//
// N'appelle PAS elle-même ensureLiveMatchStarted (voir server/liveMatch.js)
// — c'est fait AVANT, une fois par requête, dans server/index.js — mais SI
// des diffusions en direct sont déjà en cours pour la journée courante
// (league.liveMatches), attend la fin de la fenêtre de diffusion
// (MATCH_BROADCAST_DURATION_MS après l'heure programmée, commune à TOUTE la
// journée — un seul coup d'envoi par journée, voir scheduledTimeForLeagueRound)
// avant de les finaliser avec leur score DÉJÀ déterminé (voir
// LiveMatch.finalizeRound) plutôt que de resimuler un match une seconde fois.
//
// Ne démarre PAS automatiquement une nouvelle saison une fois les play-offs
// joués : ça reste un choix (manuel, via l'API admin) — pas encore
// d'auto-renouvellement de saison ici, à dessein (portée volontairement
// limitée pour cette itération du calendrier réel).
function catchUpLeague(league, now) {
  const events = [];
  if (!league || typeof league.calendarStartAt !== "number") {
    // Ligue sans calendrier réel configuré (ancienne sauvegarde, ou ligue
    // volontairement laissée en mode "à la demande") : rien à rattraper —
    // ce n'est pas une erreur, juste un no-op.
    return events;
  }
  // Rythme hebdomadaire : la mise à jour du lundi qui suit la finale reste
  // à régler (fin de saison, voir runWeeklyEconomyTick plus bas).
  // Rythme hebdomadaire : la fin de saison, l'intersaison ET la nouvelle
  // saison automatique sont gérées par catchUpWeeklyRhythm (voir
  // League.startNextSeason) — et les marchés continuent de tourner pendant
  // l'intersaison.
  const weeklyRhythm = league.calendarDailyAnchored && league.calendarWeeklyRhythm;
  if (league.isPlayoffsDone() && !weeklyRhythm) {
    // Saison réelle déjà arrivée à son terme (champion de play-offs connu,
    // voir League.isPlayoffsDone) : on attend un nouveau départ de saison
    // (voir l'API admin new-multi-league/reset-multi-league), voir le
    // commentaire ci-dessus. Contrairement à l'ancienne v1 synchrone, la
    // simple EXISTENCE de league.playoffs (posée dès la fin de la saison
    // régulière, voir League.startPlayoffsIfNeeded) ne suffit plus à
    // arrêter ce rattrapage : les play-offs eux-mêmes doivent encore être
    // rattrapés match par match, voir catchUpPlayoffs plus bas.
    return events;
  }

  // Calendrier ancré quotidien (retour utilisateur, 2026-09 — voir le grand
  // commentaire dans server/calendar.js) : réservé à la ligue multi-manager
  // (League.calendarDailyAnchored) — rythme, déclenchement de
  // l'entraînement/économie ET tour de coupe éventuel entièrement DIFFÉRENTS
  // du calendrier classique ci-dessous (voir catchUpDailyAnchored). La
  // carrière solo historique passe TOUJOURS par la branche classique
  // (calendarDailyAnchored jamais vrai pour elle) — zéro changement de
  // comportement pour elle.
  if (league.calendarDailyAnchored && league.calendarWeeklyRhythm) {
    catchUpWeeklyRhythm(league, now, events);
  } else if (league.calendarDailyAnchored) {
    catchUpDailyAnchored(league, now, events);
  } else {
    catchUpClassic(league, now, events);
  }

  // Marché des transferts : ses enchères tournent sur leur PROPRE horloge
  // réelle (3 jours, voir TRANSFER_AUCTION_DURATION_MS), indépendante du
  // calendrier de championnat — toujours rafraîchi, même une semaine sans
  // aucune journée due (une enchère peut se conclure un jour sans match).
  league.refreshMarket(now);
  // Alertes du marché (Premium : liste de suivi, recherches enregistrées),
  // voir League.checkMarketAlerts.
  if (league.checkMarketAlerts) league.checkMarketAlerts(now);
  // Marché des entraîneurs (voir League.refreshCoachMarket) : même logique
  // et même raison — sinon un candidat resterait aux enchères indéfiniment,
  // et un club ne recevrait jamais de nouveaux candidats, pendant toute une
  // absence prolongée.
  league.refreshCoachMarket(now);
  // Marché des analystes vidéo (voir League.refreshAnalystMarket) : même
  // logique/raison que refreshCoachMarket ci-dessus — DEUXIÈME marché de
  // staff, tout aussi indépendant du calendrier de championnat.
  league.refreshAnalystMarket(now);
  // Marché des recruteurs (voir League.refreshRecruiterMarket) : TROISIÈME
  // marché de staff, ajouté après coup côté moteur (voir engine.js) mais
  // OUBLIÉ ici jusqu'à ce correctif (2026-09, retour utilisateur Discord :
  // "Sur la page staff, reset des enchères et du temps à chaque refresh de
  // la page") : sans cet appel, league.recruiterListings n'était JAMAIS
  // rafraîchi côté serveur : seul le navigateur le faisait localement (voir
  // TAB_HANDLERS.staff côté moteurbasket3.html), sur un état jamais renvoyé
  // au serveur (saveMyTeam() est un no-op en ligue partagée), donc reparti
  // de zéro à CHAQUE ouverture de l'onglet Staff ou rechargement de page.
  league.refreshRecruiterMarket(now);
  // Marchés du staff médical (médecin/kiné, voir League.refreshMedicalMarket) :
  // même logique/raison que les trois marchés de staff ci-dessus.
  league.refreshDoctorMarket(now);
  league.refreshPhysioMarket(now);
  // Marché des entraîneurs adjoints (voir League.refreshAssistantCoachMarket).
  if (league.refreshAssistantCoachMarket) league.refreshAssistantCoachMarket(now);

  catchUpPlayoffs(league, now, events);

  return events;
}

// Rattrapage des PLAY-OFFS (retour utilisateur, 2026-09 : "les play offs
// doivent être comme les matchs de saisons régulières, avec un live [...]
// sur plusieurs jours réels") : une fois la saison régulière terminée, les
// démarre (League.startPlayoffsIfNeeded, tirage au sort des têtes de série)
// puis rattrape CHAQUE match de play-offs dû, un par un, exactement comme
// catchUpClassic/catchUpDailyAnchored ci-dessus le font pour le championnat
// (même garde-fou MATCH_BROADCAST_DURATION_MS, même délégation à
// LiveMatch.finalizePlayoffRound pour reprendre le score d'un match déjà
// diffusé en direct plutôt que d'en resimuler un second). Émet
// `{type:"regular-season-end"}` une fois, à la transition saison régulière
// -> play-offs (barrage de relégation compris à ce moment-là, indépendant du
// résultat des play-offs, voir League.runRelegationBarrage), puis, plus tard
// (parfois plusieurs jours réels après), `{type:"season-end"}` une fois le
// champion connu. Appelée par catchUpLeague APRÈS catchUpClassic/
// catchUpDailyAnchored (jamais avant : la toute dernière journée de
// championnat doit d'abord être réglée pour que le classement final/les
// têtes de série soient corrects).
function catchUpPlayoffs(league, now, events) {
  if (!league.isRegularSeasonDone()) return;
  startPlayoffsPhase(league, now, events);

  while (!league.isPlayoffsDone()) {
    const round = league.playoffs.round;
    const dueAt = scheduledTimeForLeagueRound(league, round);
    // Même garde-fou que catchUpClassic/catchUpDailyAnchored : laisse
    // d'abord passer la fenêtre de diffusion en direct avant de résoudre
    // "en coulisses".
    if (dueAt + MATCH_BROADCAST_DURATION_MS > now) break;
    const ev = finalizePlayoffRound(Engine, league, now);
    if (!ev) break; // garde-fou défensif, ne devrait jamais arriver ici
    events.push(ev);
  }

  if (league.isPlayoffsDone()) {
    // Lot de fin de saison des pronostics (voir DEV_NOTES.md point 11,
    // server/shows.js:grantSeasonPrizeSync — "1 mois de Premium" au
    // vainqueur du classement mondial) : ajout ADDITIF, `require` paresseux
    // (voir le même choix et pourquoi dans server/liveMatch.js:finalizeRound)
    // et protégé par try/catch — ne doit jamais empêcher la détection de fin
    // de saison ci-dessus.
    try {
      require("./shows.js").grantSeasonPrizeSync(league, now);
    } catch (e) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(`[hoop-shows] lot de fin de saison échoué : ${e && e.message}`);
      }
    }
    events.push({ type: "season-end" });
  }
}

// Transition saison régulière -> play-offs (une seule fois par saison) :
// tirage des têtes de série, barrage de relégation, bonus de qualification
// surprise, événement "regular-season-end". Extrait de catchUpPlayoffs pour
// être aussi appelé par catchUpWeeklyRhythm (qui intercale les play-offs
// avec les mises à jour économiques du lundi, dans l'ordre chronologique).
function startPlayoffsPhase(league, now, events) {
  if (!league.isRegularSeasonDone()) return;
  if (!league.playoffs) {
    league.startPlayoffsIfNeeded(now);
    // Barrage de relégation (7e vs 8e de la saison régulière) : indépendant
    // du résultat des play-offs (voir League.runRelegationBarrage/
    // divisionOutcomeForUserTeam côté moteur), donc résolu ici, tout de
    // suite, plutôt que d'attendre que la finale de play-offs (parfois
    // plusieurs jours réels plus tard) soit jouée.
    if (!league.relegationBarrage) league.runRelegationBarrage();
    // Bonus de qualification surprise en play-offs (retour utilisateur,
    // 2026-09 : "une équipe qui est en PO alors que le CA ne visait que le
    // milieu de tableau/maintien doit avoir un petit surplus des
    // supporters [...] au moment des PO pas à la fin de la saison" ; voir
    // engine.js:seasonObjectiveSurprisePlayoffsBonus) : ce bloc `if
    // (!league.playoffs)` ne s'exécute qu'UNE SEULE fois par saison (garde
    // déjà en place pour l'événement "regular-season-end" ci-dessous),
    // donc pas besoin d'un drapeau "déjà réglé" séparé comme pour le
    // verdict d'objectif de saison. Pour CHAQUE équipe humaine parmi les 4
    // têtes de série tout juste tirées au sort (league.playoffs.seeds),
    // jamais pour une équipe CPU.
    league.playoffs.seeds.forEach(teamIdx => {
      const team = league.teams[teamIdx];
      if (!team.isHuman) return;
      const bonus = seasonObjectiveSurprisePlayoffsBonus(league, teamIdx);
      if (!bonus) return;
      team.recordMoraleEvent(bonus.label, bonus.delta);
    });
    events.push({ type: "regular-season-end" });
  }
}

// Boucle CLASSIQUE (calendrier hebdomadaire, carrière solo historique — voir
// League.calendarWeekMs/calendarSlotOffsetsMs) : comportement INCHANGÉ,
// extrait tel quel de catchUpLeague pour cohabiter avec la nouvelle branche
// ci-dessous (voir catchUpDailyAnchored) sans jamais l'affecter.
function catchUpClassic(league, now, events) {
  while (!league.isRegularSeasonDone()) {
    const round = league.round;
    const dueAt = scheduledTimeForLeagueRound(league, round);
    // Ne résout PAS dès l'heure programmée elle-même : laisse d'abord passer
    // MATCH_BROADCAST_DURATION_MS (la durée de diffusion "en direct" des
    // matchs humains de cette journée, voir server/liveMatch.js) — si
    // aucun manager concerné ne s'est connecté du tout dans ce délai, la
    // journée est jouée automatiquement, comme n'importe quelle autre
    // journée qu'il aurait manquée.
    if (dueAt + MATCH_BROADCAST_DURATION_MS > now) break; // pas encore due (ou encore en cours de diffusion)

    events.push(finalizeRound(Engine, league, round, now));

    if (isLastRoundOfRealWeek(round)) {
      const weekIndex = realWeekIndexForRound(round);
      // Ne s'applique qu'une fois par semaine réelle — Team.trainWeek fait
      // bien plus que progresser des caractéristiques (finances, moral,
      // vieillissement en fin de saison...), l'appeler deux fois pour la
      // même semaine romprait ce rythme. Une entrée par équipe HUMAINE (voir
      // Team.isHuman) — plus seulement "le club du joueur" à l'index 0.
      if (weekIndex > league.lastAutoTrainedWeek) {
        const results = [];
        league.teams.forEach((team, teamIdx) => {
          if (!team.isHuman) return;
          // `now` explicite (voir Team.trainWeek/refreshYouthCandidates côté
          // moteur) : c'est ce qui fait vivre le pipeline privé de
          // l'académie de jeunes (recruteur sous contrat) au même rythme que
          // le reste de ce tick d'entraînement.
          results.push({ teamIdx, result: team.trainWeek(league.divisionLevel, now) });
        });
        league.trainCpuTeams();
        league.lastAutoTrainedWeek = weekIndex;
        events.push({ type: "training", week: weekIndex, results });
      }
    }
  }
}

// Boucle du calendrier ANCRÉ QUOTIDIEN (retour utilisateur, 2026-09 —
// "3 matchs par jour : Championnat 10h, Coupe 15h (si due), Championnat
// 19h") : à chaque itération, résout QUELQUE QUE SOIT le prochain créneau DÛ
// et CHRONOLOGIQUEMENT le plus proche entre (a) la prochaine journée de
// championnat et (b) le tour de coupe actuellement en attente (s'il y en a
// un — voir League.pendingCupRound) : puisque le créneau de coupe d'un jour
// (15h) tombe TOUJOURS entre les deux créneaux de championnat de ce même
// jour (10h/19h), comparer simplement les deux horaires dus suffit à obtenir
// l'ordre chronologique correct — pas besoin de raisonner "jour par jour"
// explicitement. Avant que la coupe ne démarre ou après qu'elle soit
// terminée (league.pendingCupRound() === null), cupDueAt reste `Infinity` :
// seul le championnat avance, le créneau de 15h ne bloque jamais rien.
function catchUpDailyAnchored(league, now, events) {
  for (;;) {
    const champDone = league.isRegularSeasonDone();
    const pendingCup = league.pendingCupRound ? league.pendingCupRound() : null;

    const champDueAt = champDone ? Infinity : scheduledTimeForLeagueRound(league, league.round);
    const cupDueAt = pendingCup ? scheduledTimeForLeagueCupRound(league, pendingCup.dayIndex) : Infinity;

    if (champDueAt === Infinity && cupDueAt === Infinity) break; // plus rien à rattraper

    if (champDueAt <= cupDueAt) {
      // Même garde-fou que la boucle classique : laisse d'abord passer la
      // fenêtre de diffusion en direct avant de résoudre "en coulisses".
      if (champDueAt + MATCH_BROADCAST_DURATION_MS > now) break;
      const round = league.round;
      events.push(finalizeRound(Engine, league, round, now));

      // Entraînement + économie : une fois par JOUR CIVIL, juste après le
      // DERNIER créneau de championnat du jour (19h — voir
      // LAST_DAILY_CHAMPIONSHIP_SLOT_INDEX) — jamais après celui de 10h,
      // même un jour sans tour de coupe (dégrade proprement à "une fois quand
      // même ce jour-là", voir en-tête de fichier).
      if (dailyAnchoredSlotIndexForChampionshipRound(round) === LAST_DAILY_CHAMPIONSHIP_SLOT_INDEX) {
        const dayIndex = dailyAnchoredDayIndexForChampionshipRound(round);
        if (dayIndex > league.lastAutoTrainedDay) {
          const results = [];
          league.teams.forEach((team, teamIdx) => {
            if (!team.isHuman) return;
            // `now` explicite (voir Team.trainWeek/refreshYouthCandidates
            // côté moteur) : c'est CE tick, une fois par jour civil en ligue
            // multi-manager ancrée quotidienne, qui fait vivre le pipeline
            // privé de l'académie de jeunes.
            results.push({ teamIdx, result: team.trainWeek(league.divisionLevel, now) });
          });
          league.trainCpuTeams();
          league.lastAutoTrainedDay = dayIndex;
          events.push({ type: "training", day: dayIndex, results });
        }
      }
    } else {
      if (cupDueAt + MATCH_BROADCAST_DURATION_MS > now) break;
      const cupEvent = finalizeCupRound(Engine, league);
      if (cupEvent) events.push(cupEvent);
    }
  }
}

// Boucle du RYTHME HEBDOMADAIRE (retour utilisateur, 2026-09-27, voir
// League.calendarWeeklyRhythm et le bloc "RYTHME HEBDOMADAIRE" de
// server/calendar.js) : championnat mardi et samedi à 20h, coupe le jeudi à
// 20h, play-offs mardi et samedi, et UNE mise à jour économique par semaine,
// dans la nuit du dimanche au lundi ("on paie donc le staff et les joueurs à
// ce moment là") — Team.trainWeek, qui applique aussi l'entraînement
// fondamental ("une fois par semaine selon le temps de jeu", minutes
// cumulées sur les matchs de la semaine, coupe, play-offs et amicaux
// compris). Le vieillissement a lieu au lundi qui suit la finale des
// play-offs (voir runWeeklyEconomyTick ci-dessus). L'entraînement
// collectif, lui, compte déjà jour par jour sur les jours sans match (voir
// Team.syncCollectiveTrainingLog/conditionRecoveryPerDay), rien à faire ici.
// À chaque itération, résout l'événement DÛ le plus ancien parmi : journée
// de championnat, tour de coupe, match de play-offs, mise à jour du lundi.
// Fin de saison (retour utilisateur, 2026-09-27 : "une saison devrait
// plutôt faire 11 que 10 semaines (9 semaines de championnat + 2 de PO)") :
// une fois le champion connu, la mise à jour du lundi SUIVANT a encore lieu
// (salaires, entraînement sur les minutes des play-offs) et c'est ELLE qui
// clôt la saison (vieillissement, salaires recalculés, stats remises à zéro
// — `seasonEnd: true`, voir Team.trainWeek) ; les lundis de la saison
// passent `seasonEnd: false` (avant : vieillissement au 9e lundi, AVANT les
// play-offs, et cette dernière mise à jour n'avait jamais lieu). Ensuite
// plus rien jusqu'à la saison suivante (League.seasonEndTickDone).
function runWeeklyEconomyTick(league, tick, ecoAt, seasonEnd, events) {
  const results = [];
  const seasonNo = typeof league.seasonNumber === "number" ? league.seasonNumber : 1;
  if (seasonEnd) {
    // Histoire du club et sponsors AVANT que la mise à jour de fin de saison
    // ne remette à zéro les stats de saison des joueurs (idempotent : déjà
    // fait si server/index.js:tick est passé entre la finale et ce lundi).
    league.teams.forEach((t, i) => {
      if (!t.isHuman) return;
      if (Engine.settleSponsorsAtSeasonEnd) Engine.settleSponsorsAtSeasonEnd(league, i, ecoAt);
      if (Engine.archiveSeasonForTeam) Engine.archiveSeasonForTeam(league, i, ecoAt);
    });
  }
  // Retraite (voir RETIREMENT_ANNOUNCE_CHANCE_BY_AGE côté moteur) : les
  // joueurs qui avaient annoncé leur dernière saison partent AVANT le
  // vieillissement de fin de saison.
  const retired = seasonEnd && typeof league.retireAnnouncedPlayers === "function" ? league.retireAnnouncedPlayers(ecoAt) : [];
  league.teams.forEach((team, teamIdx) => {
    if (!team.isHuman) return;
    // Horodatage de la mise à jour elle-même (lundi 0h), pas `now` :
    // un rattrapage groupé garde ainsi l'ordre réel des semaines.
    results.push({ teamIdx, result: team.trainWeek(league.divisionLevel, ecoAt, { seasonEnd, seasonNo }) });
  });
  league.trainCpuTeams();
  // Fin de saison : l'IA vieillit aussi, puis les vétérans peuvent annoncer
  // leur dernière saison (âge atteint APRÈS ce vieillissement) ; primes de
  // fin de saison ; début de l'intersaison (forme 100, motivation « Neutre »
  // au minimum, voir League.startIntersaison).
  let retirementsAnnounced = [];
  let bonuses = [];
  if (seasonEnd) {
    if (typeof league.ageCpuPlayers === "function") league.ageCpuPlayers(seasonNo);
    if (typeof league.announceRetirements === "function") retirementsAnnounced = league.announceRetirements(ecoAt);
    if (typeof league.paySeasonEndBonuses === "function") bonuses = league.paySeasonEndBonuses(ecoAt);
    if (typeof league.startIntersaison === "function") league.startIntersaison(ecoAt);
  }
  league.lastEconomyTick = tick;
  events.push(seasonEnd ? { type: "training", week: tick, results, seasonEnd: true, retired, retirementsAnnounced, bonuses } : { type: "training", week: tick, results });
}

function catchUpWeeklyRhythm(league, now, events) {
  for (;;) {
    if (league.isRegularSeasonDone()) startPlayoffsPhase(league, now, events);
    if (league.isPlayoffsDone()) {
      if (!league.seasonEndTickDone) {
        const tick = (league.lastEconomyTick || 0) + 1;
        const ecoAt = scheduledTimeForLeagueEconomyTick(league, tick);
        if (ecoAt != null && ecoAt <= now) {
          runWeeklyEconomyTick(league, tick, ecoAt, true, events);
          league.seasonEndTickDone = true;
          continue; // la semaine d'intersaison a peut-être déjà passé aussi
        }
        break;
      }
      // Intersaison (voir League.startNextSeason côté moteur) : le lundi
      // suivant, mise à jour hebdomadaire normale (salaires, entraînement
      // sur les amicaux d'intersaison), puis nouvelle saison avec les mêmes
      // clubs et effectifs. `league.autoNextSeason === false` : ancien
      // comportement (on attend un reset manuel).
      if (league.autoNextSeason === false || typeof league.startNextSeason !== "function") break;
      const tick = (league.lastEconomyTick || 0) + 1;
      const ecoAt = scheduledTimeForLeagueEconomyTick(league, tick);
      if (ecoAt == null || ecoAt > now) break;
      runWeeklyEconomyTick(league, tick, ecoAt, false, events);
      const seasonNumber = league.startNextSeason(ecoAt);
      events.push({ type: "new-season", seasonNumber, at: ecoAt });
      continue;
    }
    const champDone = league.isRegularSeasonDone();
    const pendingCup = league.pendingCupRound ? league.pendingCupRound() : null;
    const inPlayoffs = champDone && league.playoffs && !league.isPlayoffsDone();

    const champAt = !champDone ? scheduledTimeForLeagueRound(league, league.round) : Infinity;
    const playoffAt = inPlayoffs ? scheduledTimeForLeagueRound(league, league.playoffs.round) : Infinity;
    const cupAt = pendingCup ? scheduledTimeForLeagueCupRound(league, pendingCup.dayIndex) : Infinity;
    const tick = (league.lastEconomyTick || 0) + 1;
    const ecoAt = scheduledTimeForLeagueEconomyTick(league, tick);

    const next = Math.min(champAt, playoffAt, cupAt, ecoAt);
    if (next === Infinity) break;

    if (next === ecoAt) {
      if (ecoAt > now) break;
      runWeeklyEconomyTick(league, tick, ecoAt, false, events);
      continue;
    }
    // Matchs : même garde-fou que les autres boucles, on laisse d'abord
    // passer la fenêtre de diffusion en direct.
    if (next + MATCH_BROADCAST_DURATION_MS > now) break;
    if (next === champAt) {
      events.push(finalizeRound(Engine, league, league.round, now));
    } else if (next === cupAt) {
      const cupEvent = finalizeCupRound(Engine, league);
      if (cupEvent) events.push(cupEvent); else break;
    } else {
      const ev = finalizePlayoffRound(Engine, league, now);
      if (ev) events.push(ev); else break;
    }
  }
}

// Point d'entrée appelé à CHAQUE requête, AVANT catchUpLeague (voir
// server/index.js) : démarre la diffusion en direct de chaque match de la
// journée courante impliquant au moins un côté humain, si son heure est
// atteinte et qu'il n'a pas déjà commencé — pur pass-through vers
// server/liveMatch.js, qui a besoin d'Engine (pour MatchEngine) et de
// scheduledTimeForLeagueRound (pour l'heure programmée, qui tient compte du
// rythme propre à CETTE ligue — voir "MODE ACCÉLÉRÉ" dans
// server/calendar.js), tous deux déjà résolus ici. Renvoie la liste des
// clés nouvellement démarrées (voir LiveMatch.ensureLiveMatchStarted).
// Démarre AUSSI la diffusion en direct du tour de coupe en attente, s'il y
// en a un et que son créneau (15h) est atteint (voir
// LiveMatch.ensureCupLiveMatchStarted) — no-op pour toute ligue sans coupe
// (league.cup absent, carrière solo ou ligue multi-manager au calendrier
// classique). Démarre ENFIN la diffusion en direct du tour de play-offs en
// attente, s'il y en a un (voir LiveMatch.ensurePlayoffLiveMatchStarted) :
// no-op tant que la saison régulière n'est pas terminée, ou une fois le
// champion connu. Les trois jeux de clés (championnat/coupe/play-offs, voir
// LiveMatch.liveMatchKey/cupLiveMatchKey, les play-offs réutilisant
// liveMatchKey sans collision possible, voir son commentaire) cohabitent
// sans collision dans le même league.liveMatches.
function ensureLiveMatch(league, now) {
  const championshipKeys = ensureLiveMatchStarted(Engine, league, now, scheduledTimeForLeagueRound);
  const cupKeys = league.cup ? ensureCupLiveMatchStarted(Engine, league, now, scheduledTimeForLeagueCupRound) : [];
  const playoffKeys = league.playoffs ? ensurePlayoffLiveMatchStarted(Engine, league, now, scheduledTimeForLeagueRound) : [];
  return [...championshipKeys, ...cupKeys, ...playoffKeys];
}

return {
  catchUpLeague, ensureLiveMatch,
  // Exporté pour les tests (voir retirement_test.js).
  runWeeklyEconomyTick,
  finalizeRound: (league, round, now) => finalizeRound(Engine, league, round, now),
  finalizeCupRound: (league) => finalizeCupRound(Engine, league),
  finalizePlayoffRound: (league, now) => finalizePlayoffRound(Engine, league, now),
};

});
