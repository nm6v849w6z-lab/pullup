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
  scheduledTimeForLeagueCupRound, MATCH_BROADCAST_DURATION_MS,
  dailyAnchoredDayIndexForChampionshipRound, dailyAnchoredSlotIndexForChampionshipRound,
  DAILY_ANCHORED_CHAMPIONSHIP_HOURS,
} = Calendar;
const { ensureLiveMatchStarted, ensureCupLiveMatchStarted, finalizeRound, finalizeCupRound } = LiveMatch;
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
// championnat), et calcul des play-offs/barrage de relégation dès que la
// saison régulière est terminée. Peut rattraper PLUSIEURS semaines d'un coup
// (manager absent un moment) — chaque itération de la boucle ne traite
// qu'UNE journée à la fois, dans l'ordre chronologique.
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
  if (league.playoffs) {
    // Saison réelle déjà arrivée à son terme (play-offs déjà calculés) :
    // on attend un nouveau départ de saison (voir l'API admin
    // new-multi-league/reset-multi-league), voir le commentaire ci-dessus.
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
  if (league.calendarDailyAnchored) {
    catchUpDailyAnchored(league, now, events);
  } else {
    catchUpClassic(league, now, events);
  }

  // Marché des transferts : ses enchères tournent sur leur PROPRE horloge
  // réelle (3 jours, voir TRANSFER_AUCTION_DURATION_MS), indépendante du
  // calendrier de championnat — toujours rafraîchi, même une semaine sans
  // aucune journée due (une enchère peut se conclure un jour sans match).
  league.refreshMarket(now);
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

  if (league.isRegularSeasonDone() && !league.playoffs) {
    league.runPlayoffs(now);
    // Interview de jalon "demi-finale de PO" (retour utilisateur, 2026-09,
    // voir le grand commentaire de League.queuePlayoffSemiInterviews côté
    // moteur) : DOIT être appelée juste après runPlayoffs() ci-dessus, tant
    // que league.playoffs.semiPlayerIds reflète encore les DEMI-finales,
    // rien d'autre ne s'exécute entre les deux qui pourrait invalider cet
    // instantané.
    league.queuePlayoffSemiInterviews(now);
    league.runRelegationBarrage();
    events.push({ type: "season-end" });
  }

  return events;
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
// classique). Les deux jeux de clés (championnat/coupe, voir
// LiveMatch.liveMatchKey/cupLiveMatchKey) cohabitent sans collision dans le
// même league.liveMatches.
function ensureLiveMatch(league, now) {
  const championshipKeys = ensureLiveMatchStarted(Engine, league, now, scheduledTimeForLeagueRound);
  const cupKeys = league.cup ? ensureCupLiveMatchStarted(Engine, league, now, scheduledTimeForLeagueCupRound) : [];
  return [...championshipKeys, ...cupKeys];
}

return {
  catchUpLeague, ensureLiveMatch,
  finalizeRound: (league, round, now) => finalizeRound(Engine, league, round, now),
  finalizeCupRound: (league) => finalizeCupRound(Engine, league),
};

});
