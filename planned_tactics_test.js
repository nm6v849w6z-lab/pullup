// Vérifie la planification des ordres à l'avance (retour utilisateur,
// 2026-09 : "les liens pour donner ses ordres sur la page calendrier ne
// fonctionnent pas, ils renvoient tjrs vers le prochain match [...] sur
// buzzerbeater on peut faire pour tous les matchs de la saison [...] donc
// je pense qu'il faut pouvoir le faire sur plusieurs matchs") — la partie
// MOTEUR pure (Team.plannedTactics et ses méthodes), indépendante du
// serveur/de l'UI : voir server/planned_tactics_test.js pour le câblage
// des deux chemins de simulation (autoSim/liveMatch).
const E = require("./engine.js");
const { generateStartingRoster, serializeTeam, teamFromSave, POSITIONS, planKey } = E;

function freshTeam() {
  return generateStartingRoster("Plan Test");
}

// ---------------------------------------------------------------------
// 1) stagePlanForRound : la première écriture pour une journée part des
//    ordres EN DIRECT actuels (snapshot), pas d'un objet vide.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  team.offensivePriorities = ["Jeu en pénétration", "Contre-attaque", "Poste bas"];
  team.defense = "Zone";
  team.rhythm = "Rapide";

  team.stagePlanForRound(5, { rhythm: "Lent" });
  const plan = team.getPlanForRound(5);
  console.log("Plan journée 5 après 1er patch partiel :", JSON.stringify({
    offensivePriorities: plan.offensivePriorities, defense: plan.defense, rhythm: plan.rhythm,
  }));
  if (plan.rhythm !== "Lent") throw new Error("❌ Le patch (rhythm: 'Lent') aurait dû s'appliquer.");
  if (plan.defense !== "Zone") throw new Error("❌ Le premier stagePlanForRound aurait dû hériter les ordres en direct actuels (defense).");
  if (JSON.stringify(plan.offensivePriorities) !== JSON.stringify(["Jeu en pénétration", "Contre-attaque", "Poste bas"])) {
    throw new Error("❌ Le premier stagePlanForRound aurait dû hériter les priorités offensives en direct actuelles.");
  }
  console.log("✅ stagePlanForRound (1er appel) part bien d'un instantané des ordres en direct actuels.");
}

// ---------------------------------------------------------------------
// 2) stagePlanForRound : un second patch partiel FUSIONNE (ne repart pas
//    de zéro), et ne touche jamais aux ordres en direct.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  team.defense = "Homme à homme";
  team.stagePlanForRound(3, { defense: "Zone" });
  team.stagePlanForRound(3, { rhythm: "Rapide" });
  const plan = team.getPlanForRound(3);
  console.log("Plan journée 3 après 2 patchs successifs :", JSON.stringify({ defense: plan.defense, rhythm: plan.rhythm }));
  if (plan.defense !== "Zone") throw new Error("❌ Le premier patch (defense: 'Zone') aurait dû être conservé après le second.");
  if (plan.rhythm !== "Rapide") throw new Error("❌ Le second patch (rhythm: 'Rapide') aurait dû s'appliquer.");
  if (team.defense !== "Homme à homme") throw new Error("❌ Les ordres EN DIRECT ne doivent jamais être modifiés par stagePlanForRound.");
  console.log("✅ Les patchs partiels successifs fusionnent sur le même plan, sans toucher aux ordres en direct.");
}

// ---------------------------------------------------------------------
// 2bis) Un plan staged doit être une copie indépendante : modifier les
//    ordres en direct APRÈS coup ne doit pas rejaillir sur le plan déjà
//    sauvegardé (et vice-versa).
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  team.offensivePriorities = ["Équilibrée", "Pick & Roll", "Jeu en mouvement"];
  team.stagePlanForRound(2, {});
  team.offensivePriorities.push("Poste bas"); // mutation de l'array en direct
  const plan = team.getPlanForRound(2);
  console.log("Priorités du plan après mutation de l'array en direct :", plan.offensivePriorities.length, "(attendu 3, pas 4)");
  if (plan.offensivePriorities.length !== 3) throw new Error("❌ Le plan stocké ne doit PAS partager la référence de l'array en direct (deep clone attendu).");
  console.log("✅ snapshotTactics/stagePlanForRound clonent bien (pas de référence partagée).");
}

// ---------------------------------------------------------------------
// 3) getPlanForRound : sans plan préparé, renvoie un instantané des ordres
//    en direct (lecture seule — ne crée PAS d'entrée dans plannedTactics).
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  team.rhythm = "Lent";
  const plan = team.getPlanForRound(9);
  console.log("getPlanForRound(9) sans plan préparé — rhythm :", plan.rhythm, "| entrée créée :", team.hasPlanForRound(9));
  if (plan.rhythm !== "Lent") throw new Error("❌ Sans plan préparé, getPlanForRound devrait renvoyer un instantané des ordres en direct actuels.");
  if (team.hasPlanForRound(9)) throw new Error("❌ getPlanForRound ne doit PAS créer d'entrée dans plannedTactics (lecture seule).");
  console.log("✅ getPlanForRound : lecture seule, pré-remplit avec les ordres en direct actuels sans rien écrire.");

  team.stagePlanForRound(9, { rhythm: "Rapide" });
  const plan2 = team.getPlanForRound(9);
  if (plan2.rhythm !== "Rapide") throw new Error("❌ Avec un plan déjà préparé, getPlanForRound devrait le renvoyer tel quel.");
  console.log("✅ getPlanForRound renvoie bien le plan déjà préparé quand il existe.");
}

// ---------------------------------------------------------------------
// 4) clearPlanForRound : supprime le plan, sans effet sur les autres
//    journées ni sur les ordres en direct.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  team.stagePlanForRound(1, { defense: "Zone" });
  team.stagePlanForRound(2, { defense: "Zone" });
  team.clearPlanForRound(1);
  console.log("Après clearPlanForRound(1) — journée 1 présente :", team.hasPlanForRound(1), "| journée 2 présente :", team.hasPlanForRound(2));
  if (team.hasPlanForRound(1)) throw new Error("❌ clearPlanForRound(1) aurait dû supprimer le plan de la journée 1.");
  if (!team.hasPlanForRound(2)) throw new Error("❌ clearPlanForRound(1) n'aurait pas dû affecter le plan de la journée 2.");
  console.log("✅ clearPlanForRound cible bien uniquement la journée demandée.");
}

// ---------------------------------------------------------------------
// 5) applyPlannedTacticsForRound : avec un plan préparé, écrase les ordres
//    en direct ET consomme (supprime) le plan.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  team.offensivePriorities = ["Équilibrée", "Pick & Roll", "Jeu en mouvement"];
  team.defense = "Homme à homme";
  team.rhythm = "Normal";
  const starterMeneur = team.lineup.starters["Meneur"];
  const otherMeneur = team.players.find(p => p.position === "Meneur" && p.id !== starterMeneur);

  team.stagePlanForRound(4, { defense: "Zone", rhythm: "Rapide" });
  // Modifie aussi la feuille de match DANS le plan (via le proxy réel
  // Team.setStarter appliqué au plan, comme le fera l'UI plus tard) :
  // getPlanForRound(4) renvoie ICI la référence RÉELLEMENT stockée dans
  // plannedTactics (un plan existe déjà pour cette journée, voir son
  // commentaire), donc muter `plan` en place suffit, sans réaffectation.
  const plan = team.getPlanForRound(4);
  if (otherMeneur) {
    E.Team.prototype.setStarter.call(plan, "Meneur", otherMeneur.id);
  }

  team.applyPlannedTacticsForRound(4);
  console.log("Après applyPlannedTacticsForRound(4) — defense:", team.defense, "| rhythm:", team.rhythm, "| plan consommé :", !team.hasPlanForRound(4));
  if (team.defense !== "Zone") throw new Error("❌ applyPlannedTacticsForRound aurait dû écraser 'defense' en direct avec la valeur planifiée.");
  if (team.rhythm !== "Rapide") throw new Error("❌ applyPlannedTacticsForRound aurait dû écraser 'rhythm' en direct avec la valeur planifiée.");
  if (otherMeneur && team.lineup.starters["Meneur"] !== otherMeneur.id) throw new Error("❌ applyPlannedTacticsForRound aurait dû écraser la feuille de match en direct avec celle planifiée.");
  if (team.hasPlanForRound(4)) throw new Error("❌ Le plan de la journée 4 aurait dû être consommé (supprimé) après application.");
  console.log("✅ applyPlannedTacticsForRound applique le plan aux ordres en direct puis le consomme.");
}

// ---------------------------------------------------------------------
// 6) applyPlannedTacticsForRound : no-op complet si rien n'a été préparé
//    pour cette journée (comportement inchangé pour qui ne planifie pas).
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  team.defense = "Homme à homme";
  team.rhythm = "Normal";
  const lineupBefore = JSON.stringify(team.lineup);
  team.applyPlannedTacticsForRound(7);
  console.log("Après applyPlannedTacticsForRound(7) sans plan préparé — defense:", team.defense, "| rhythm:", team.rhythm);
  if (team.defense !== "Homme à homme" || team.rhythm !== "Normal") throw new Error("❌ Sans plan préparé, applyPlannedTacticsForRound ne doit RIEN changer aux ordres en direct.");
  if (JSON.stringify(team.lineup) !== lineupBefore) throw new Error("❌ Sans plan préparé, applyPlannedTacticsForRound ne doit pas toucher à la feuille de match.");
  console.log("✅ applyPlannedTacticsForRound est un no-op quand aucun plan n'est préparé pour la journée.");
}

// ---------------------------------------------------------------------
// 7) serializeTeam/teamFromSave : round-trip de plannedTactics.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  team.stagePlanForRound(6, { defense: "Zone" });
  team.stagePlanForRound(11, { rhythm: "Lent" });
  const data = serializeTeam(team);
  // serializeTeam copie plannedTactics tel quel (voir engine.js) : les clés
  // restent la forme composite "championship:<round>" (voir Team.planKey).
  const key6 = planKey(6);
  const key11 = planKey(11);
  console.log("plannedTactics sérialisé — journées présentes :", Object.keys(data.plannedTactics));
  if (!data.plannedTactics[key6] || !data.plannedTactics[key11]) throw new Error("❌ serializeTeam devrait inclure les plans préparés (journées 6 et 11).");

  const reloaded = teamFromSave(JSON.parse(JSON.stringify(data)));
  console.log("Après round-trip save/load — journée 6 defense :", reloaded.plannedTactics[key6] && reloaded.plannedTactics[key6].defense, "| journée 11 rhythm :", reloaded.plannedTactics[key11] && reloaded.plannedTactics[key11].rhythm);
  if (!reloaded.plannedTactics[key6] || reloaded.plannedTactics[key6].defense !== "Zone") throw new Error("❌ Le plan de la journée 6 ne survit pas au round-trip save/load.");
  if (!reloaded.plannedTactics[key11] || reloaded.plannedTactics[key11].rhythm !== "Lent") throw new Error("❌ Le plan de la journée 11 ne survit pas au round-trip save/load.");
  console.log("✅ plannedTactics survit à un round-trip serializeTeam/teamFromSave.");
}

// ---------------------------------------------------------------------
// 8) teamFromSave : sauvegarde ANTÉRIEURE à cette fonctionnalité (pas de
//    champ plannedTactics du tout) — doit retomber sur {} par défaut, sans
//    planter.
// ---------------------------------------------------------------------
{
  const team = freshTeam();
  const data = serializeTeam(team);
  delete data.plannedTactics; // simule une sauvegarde d'avant cette fonctionnalité
  const reloaded = teamFromSave(JSON.parse(JSON.stringify(data)));
  console.log("teamFromSave sur une sauvegarde sans plannedTactics — type :", typeof reloaded.plannedTactics, "| vide :", Object.keys(reloaded.plannedTactics).length === 0);
  if (typeof reloaded.plannedTactics !== "object" || reloaded.plannedTactics === null) throw new Error("❌ Une sauvegarde sans plannedTactics devrait retomber sur un objet (le défaut du constructeur).");
  if (Object.keys(reloaded.plannedTactics).length !== 0) throw new Error("❌ Une sauvegarde sans plannedTactics devrait retomber sur {} (aucune journée future préparée).");
  console.log("✅ Rétro-compatible avec une sauvegarde antérieure à cette fonctionnalité (plannedTactics absent → {}).");
}

console.log("\n✅ Tous les tests planned_tactics_test.js sont passés.");
