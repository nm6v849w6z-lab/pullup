// Vérifie le correctif du "prochain match" ignorant la Coupe (retour
// utilisateur, 2026-09-24, capture d'écran du calendrier : "le match devrait
// s'afficher en haut pour la coupe aussi (il faut tjrs afficher le prochain
// match, et pas uniquement le prochain match de championnat)" — cas concret
// montré : un match de Coupe (Quarts, 15h) programmé AVANT le match de
// Championnat du même jour (19h), mais le bandeau du haut affichait quand
// même la journée de championnat). Voir DEV_NOTES.md point 12 pour le
// diagnostic complet et le correctif (League.prototype.nextUserMatch,
// engine.js ET son miroir moteurbasket3.html).
//
// Calendrier ancré quotidien (seul rythme qui ait jamais une Coupe, voir
// cup_test.js) : championnat aux créneaux 10h/19h (CALENDAR_DAILY_ANCHORED_
// CHAMPIONSHIP_HOURS), Coupe à 15h (CALENDAR_DAILY_ANCHORED_CUP_HOUR) — donc
// round de championnat PAIR (slot 10h) < Coupe (15h) < round de championnat
// IMPAIR (slot 19h) le MÊME jour civil.
const Engine = require("../engine.js");
const { generateMultiManagerLeague, generateCupBracket } = Engine;
const Calendar = require("./calendar.js");
const { dailyAnchoredCalendarConfig } = Calendar;

const T0 = Date.UTC(2026, 8, 16, 7, 0, 0); // 16 septembre 2026, un mercredi arbitraire

// Reconstruit le tableau de Coupe (tirage aléatoire des byes/appariements,
// voir generateCupBracket) jusqu'à ce que `teamIdx` tombe sur un VRAI match
// de 1er tour (pas un bye) — nécessaire pour tester le cas qui nous
// intéresse (un match de Coupe réel à jouer), le tirage étant délibérément
// aléatoire (voir cup_test.js, partie 1).
function cupBracketWithRealMatchFor(teamIdxs, teamIdx, maxTries = 200) {
  for (let i = 0; i < maxTries; i++) {
    const round0 = generateCupBracket(teamIdxs);
    const m = round0.matches.find(x => (x.home === teamIdx || x.away === teamIdx) && !x.bye);
    if (m) return round0;
  }
  throw new Error("❌ (setup) impossible d'obtenir un vrai match de Coupe pour teamIdx après " + maxTries + " tirages.");
}

function freshDailyLeagueWithCupMatchFor(teamIdx) {
  const league = generateMultiManagerLeague(["Lyon Cup Prio", "Marseille Cup Prio"], 1, T0, dailyAnchoredCalendarConfig());
  if (!league.calendarDailyAnchored || !league.cup) {
    throw new Error("❌ (setup) la ligue devrait être au calendrier ancré quotidien avec une Coupe fraîche.");
  }
  const teamIdxs = league.teams.map((_, i) => i);
  league.cup.rounds = [cupBracketWithRealMatchFor(teamIdxs, teamIdx)];
  return league;
}

// ---------------------------------------------------------------------
// 1) Cas rapporté : le tour de Coupe en attente (round.dayIndex=0, 15h) est
//    programmé AVANT le prochain match de championnat de teamIdx quand celui-
//    ci tombe sur le créneau du SOIR (round impair, 19h, même jour civil) —
//    nextUserMatch doit renvoyer la Coupe, avec `competition: "cup"`.
// ---------------------------------------------------------------------
{
  const teamIdx = 0;
  const league = freshDailyLeagueWithCupMatchFor(teamIdx);
  // Fait avancer directement league.round au créneau du soir (round 1 = jour
  // 0, 19h) — inutile de simuler le round 0, nextUserMatch part de
  // `this.round` tel quel (voir son commentaire).
  league.round = 1;
  const champMatch = league.schedule[1].find(m => m.home === teamIdx || m.away === teamIdx);
  if (!champMatch) throw new Error("❌ (setup) teamIdx devrait avoir un match de championnat à la journée 1.");
  const cupMatch = league.cup.rounds[0].matches.find(m => (m.home === teamIdx || m.away === teamIdx) && !m.bye);

  const next = league.nextUserMatch(teamIdx);
  console.log("Cas 1 (Coupe 15h avant Championnat 19h) -> nextUserMatch:", next);
  if (!next) throw new Error("❌ nextUserMatch ne devrait pas être null.");
  if (next.competition !== "cup") {
    throw new Error(`❌ BUG NON CORRIGÉ : nextUserMatch devrait renvoyer le match de Coupe (competition="cup"), obtenu ${JSON.stringify(next)}.`);
  }
  if (next.round !== league.cup.rounds[0].index) {
    throw new Error(`❌ round incorrect pour le match de Coupe : obtenu ${next.round}, attendu ${league.cup.rounds[0].index}.`);
  }
  const expectedOpponent = cupMatch.home === teamIdx ? cupMatch.away : cupMatch.home;
  if (next.opponent !== expectedOpponent) {
    throw new Error(`❌ opponent incorrect pour le match de Coupe : obtenu ${next.opponent}, attendu ${expectedOpponent}.`);
  }
  if (next.isHome !== (cupMatch.home === teamIdx)) {
    throw new Error(`❌ isHome incorrect pour le match de Coupe : obtenu ${next.isHome}, attendu ${cupMatch.home === teamIdx}.`);
  }
  console.log("✅ Un match de Coupe programmé avant le prochain match de championnat est bien renvoyé comme prochain match.");
}

// ---------------------------------------------------------------------
// 2) Non-régression : à la création de la ligue (round 0 = jour 0, 10h),
//    le championnat reste AVANT la Coupe (15h) le même jour — même si une
//    Coupe est en attente, nextUserMatch doit renvoyer le championnat, sans
//    `competition` (forme historique {round, isHome, opponent} inchangée).
// ---------------------------------------------------------------------
{
  const teamIdx = 0;
  const league = freshDailyLeagueWithCupMatchFor(teamIdx);
  // league.round vaut déjà 0 (ligue fraîche) : rien à changer.
  const champMatch = league.schedule[0].find(m => m.home === teamIdx || m.away === teamIdx);
  if (!champMatch) throw new Error("❌ (setup) teamIdx devrait avoir un match de championnat à la journée 0.");

  const next = league.nextUserMatch(teamIdx);
  console.log("Cas 2 (Championnat 10h avant Coupe 15h) -> nextUserMatch:", next);
  if (!next) throw new Error("❌ nextUserMatch ne devrait pas être null.");
  if (next.competition === "cup") {
    throw new Error(`❌ RÉGRESSION : le championnat du matin (10h) devrait rester prioritaire sur la Coupe (15h) le même jour, obtenu ${JSON.stringify(next)}.`);
  }
  if ("competition" in next) {
    throw new Error(`❌ Un match de championnat ne devrait PAS porter de champ "competition" (forme historique inchangée), obtenu ${JSON.stringify(next)}.`);
  }
  if (next.round !== 0) throw new Error(`❌ round incorrect : obtenu ${next.round}, attendu 0.`);
  console.log("✅ Le championnat du matin reste bien prioritaire sur la Coupe de l'après-midi le même jour (non-régression).");
}

// ---------------------------------------------------------------------
// 3) Une équipe SANS match de Coupe ce tour-ci (bye ou déjà éliminée) garde
//    le comportement historique (championnat seul), même si league.cup
//    existe pour d'autres équipes de la ligue.
// ---------------------------------------------------------------------
{
  const league = generateMultiManagerLeague(["Lyon Cup Prio 2", "Marseille Cup Prio 2"], 1, T0, dailyAnchoredCalendarConfig());
  const teamIdxs = league.teams.map((_, i) => i);
  // Cherche une équipe avec un BYE au 1er tour (qualification directe, donc
  // aucun match de Coupe réel à jouer ce tour-ci).
  let byeTeamIdx = null;
  for (let i = 0; i < 200 && byeTeamIdx == null; i++) {
    const round0 = generateCupBracket(teamIdxs);
    const bye = round0.matches.find(m => m.bye);
    if (bye) {
      league.cup.rounds = [round0];
      byeTeamIdx = bye.home;
    }
  }
  if (byeTeamIdx == null) throw new Error("❌ (setup) impossible d'obtenir une équipe avec un bye après 200 tirages.");

  const next = league.nextUserMatch(byeTeamIdx);
  console.log(`Cas 3 (teamIdx=${byeTeamIdx} exempt au 1er tour) -> nextUserMatch:`, next);
  if (!next || next.competition === "cup") {
    throw new Error(`❌ Une équipe exemptée (bye) ne devrait jamais se voir attribuer un match de Coupe, obtenu ${JSON.stringify(next)}.`);
  }
  console.log("✅ Une équipe exemptée au 1er tour de Coupe garde le championnat comme prochain match (comportement historique).");
}

console.log("\n🏁 Tous les tests next_user_match_cup_priority_test.js sont passés.");
