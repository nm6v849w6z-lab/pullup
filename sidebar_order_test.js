// Vérifie l'organisation de la barre latérale (retour utilisateur
// 2026-09-27, proposition validée "vas y fais comme ça") : accueil sans
// titre, puis Équipe / Compétitions / Recrutement / Club, et en bas Guide,
// Discord (lien externe) et Se déconnecter.
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
const doc = new JSDOM(html).window.document;
const sections = [...doc.querySelectorAll("#sidebar .sidebar-section, .sidebar .sidebar-section")];
const got = sections.map(sec => {
  const label = sec.querySelector(".sidebar-section-label");
  const items = [...sec.querySelectorAll(".sidebar-link .sidebar-label")].map(e => e.textContent.trim());
  return (label ? label.textContent.trim() : "") + ": " + items.join(", ");
});
const expected = [
  ": Tableau de bord, Messagerie",
  "Équipe: Effectif, Ordres, Tactiques, Entraînement, Centre médical, Statistiques",
  "Compétitions: Calendrier, Ligue, Coupe, Matchs amicaux, Ligues privées",
  "Recrutement: Marché, Staff, Académie de jeunes",
  "Club: Économie, Sponsors, Salle, Supporters, Histoire du club",
  ": Guide, Premium, Discord ↗, Se déconnecter",
];
if (JSON.stringify(got) !== JSON.stringify(expected)) {
  throw new Error("❌ Barre latérale inattendue :\n" + got.join("\n") + "\n\nattendu :\n" + expected.join("\n"));
}
console.log("✅ Barre latérale : Tableau de bord/Messagerie, Équipe, Compétitions, Recrutement, Club, puis Guide/Premium/Discord/Déconnexion.");
