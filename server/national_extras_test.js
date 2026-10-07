// Sélections : vitrine (2026-10-07, server/nationalExtras.js) — message du
// staff, personnalisation visuelle, fonctions nationales d'un manager,
// sélection actuelle d'un joueur. Droits stricts : message = sélectionneur
// et adjoints ; visuels = sélectionneur seul ; éléments verrouillés refusés.
const X = require("./nationalExtras.js");
const Visuals = require("../assets/national-visuals.js");
function check(c, msg) { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); }

const now = Date.now();
function makeStore() {
  return {
    seq: 1,
    teams: {
      "fr-A": { id: "fr-A", country: "fr", cat: "A", mandateId: "m1" },
      "fr-U21": { id: "fr-U21", country: "fr", cat: "U21", mandateId: "m2" },
      "es-A": { id: "es-A", country: "es", cat: "A", mandateId: null },
    },
    mandates: [
      { id: "m1", teamId: "fr-A", key: "COACH", ref: { leagueId: "L1", idx: 2 }, pseudo: "Coach", clubName: "BC Dia", endedAt: null, staffV: 2,
        staff: [
          { key: "ADJ", ref: { leagueId: "L1", idx: 5 }, pseudo: "Adj", role: "assistant", status: "active" },
          { key: "HELP", ref: { leagueId: "L2", idx: 1 }, pseudo: "Help", role: "helper", status: "active" },
          { key: "INV", ref: { leagueId: "L2", idx: 3 }, pseudo: "Inv", role: "assistant", status: "invited" },
        ] },
      { id: "m2", teamId: "fr-U21", key: "U21C", ref: { leagueId: "L3", idx: 0 }, pseudo: "U21 coach", endedAt: null, staffV: 2, staff: [] },
      { id: "m0", teamId: "es-A", key: "OLD", ref: { leagueId: "L1", idx: 9 }, endedAt: now - 1000, staff: [] },
    ],
    convocations: {}, caps: {}, intl: {}, finals: {}, honours: {}, intlFriendlies: [],
  };
}
const me = (key, leagueId, idx) => ({ key, ref: { leagueId, idx }, pseudo: key, clubName: key + " club" });

// --- Message ---
{
  const st = makeStore();
  check(!X.setMessage(st, null, { teamId: "fr-A", text: "x" }, now).ok, "message : visiteur non connecté refusé");
  const r0 = X.setMessage(st, me("HELP", "L2", 1), { teamId: "fr-A", text: "Salut" }, now);
  check(!r0.ok && r0.status === 403, "message : personne aidante refusée (403)");
  check(!X.setMessage(st, me("INV", "L2", 3), { teamId: "fr-A", text: "Salut" }, now).ok, "message : adjoint seulement invité refusé");
  check(!X.setMessage(st, me("U21C", "L3", 0), { teamId: "fr-A", text: "Salut" }, now).ok, "message : sélectionneur d'une AUTRE sélection refusé");
  const r1 = X.setMessage(st, me("COACH", "L1", 2), { teamId: "fr-A", text: "  Bienvenue !\n\n\n\nObjectif : le titre.<b>x</b>\u0007 " }, now);
  check(r1.ok && st.teams["fr-A"].message.text === "Bienvenue !\n\nObjectif : le titre.<b>x</b>" && st.teams["fr-A"].message.role === "coach", "message : sélectionneur, texte nettoyé (pas de HTML interprété : échappé à l'affichage)");
  const r2 = X.setMessage(st, me("ADJ", "L1", 5), { teamId: "fr-A", text: "Mot de l'adjoint" }, now + 5);
  check(r2.ok && st.teams["fr-A"].message.role === "assistant" && st.teams["fr-A"].message.at === now + 5, "message : l'adjoint peut le modifier (date de modification)");
  check(!X.setMessage(st, me("COACH", "L1", 2), { teamId: "fr-A", text: "x".repeat(X.MESSAGE_MAX + 1) }, now).ok, `message : limite de ${X.MESSAGE_MAX} caractères`);
  const pub = X.publicExtras(st, "fr-A", null, now);
  check(pub.message.text === "Mot de l'adjoint" && !pub.canEditMessage && !pub.canEditVisuals, "visiteur : voit le message, aucun bouton de modification");
  check(X.publicExtras(st, "fr-A", me("ADJ", "L1", 5), now).canEditMessage && !X.publicExtras(st, "fr-A", me("ADJ", "L1", 5), now).canEditVisuals, "adjoint : message oui, personnalisation non");
  check(X.setMessage(st, me("COACH", "L1", 2), { teamId: "fr-A", text: "   " }, now).ok && st.teams["fr-A"].message === null && X.publicExtras(st, "fr-A", null, now).message === null, "message : suppression (texte vide)");
  check(X.setMessage(st, me("U21C", "L3", 0), { teamId: "fr-U21", text: "Les Espoirs" }, now).ok, "message : fonctionne aussi pour une sélection U21");
}

// --- Personnalisation ---
{
  const st = makeStore();
  check(!X.setVisuals(st, me("ADJ", "L1", 5), { teamId: "fr-A", visuals: { logo: "shield" } }, now).ok, "visuels : adjoint refusé");
  check(X.publicExtras(st, "fr-A", null, now).visuals.logo === "flag", "visuels : défaut = drapeau, nuit bleue");
  const ok = X.setVisuals(st, me("COACH", "L1", 2), { teamId: "fr-A", visuals: { logo: "shield", banner: "flag", jersey: "rouge", court: "erable" } }, now);
  check(ok.ok && ok.visuals.logo === "shield" && ok.visuals.banner === "flag" && ok.visuals.jersey === "rouge" && ok.visuals.court === "erable", "visuels : sélectionneur, éléments libres enregistrés");
  const locked = X.setVisuals(st, me("COACH", "L1", 2), { teamId: "fr-A", visuals: { logo: "crown" } }, now);
  check(!locked.ok && locked.status === 403 && /pas encore débloqué/.test(locked.error), "visuels : élément verrouillé refusé (Couronne : titre)");
  check(!X.setVisuals(st, me("COACH", "L1", 2), { teamId: "fr-A", visuals: { logo: "pirate" } }, now).ok, "visuels : élément inconnu refusé");
  // Déblocage : un match officiel gagné → « Étoile », « Bandes ».
  st.intl = { c1: { season: 1, comp: "qualif", cat: "A", matches: [{ id: 1, home: "fr-A", away: "es-A", at: now - 3 * 86400000, status: "played", scoreHome: 80, scoreAway: 70, liveUntil: now - 2 * 86400000 }] } };
  const stats = X.visualStats(st, "fr-A", now);
  check(stats.played === 1 && stats.wins === 1, "statistiques de déblocage : 1 match, 1 victoire");
  check(X.setVisuals(st, me("COACH", "L1", 2), { teamId: "fr-A", visuals: { logo: "star", banner: "stripes" } }, now).ok, "visuels : « Étoile » et « Bandes » débloqués après un match");
  st.honours = { "fr-A": [{ season: 1, key: "eu", kind: "euro", label: "Euro", rank: 1, of: 8 }] };
  check(X.setVisuals(st, me("COACH", "L1", 2), { teamId: "fr-A", visuals: { logo: "crown", jersey: "jaune-eclats", banner: "gold" } }, now).ok, "visuels : titre → Couronne, Or éclatant, bannière Or");
  const dress = X.matchDress(st, "fr-A", now);
  check(dress && dress.jerseyColor === "jaune" && dress.jerseyPattern === "eclats" && dress.court.wood === "erable", "habillage de match : maillot et parquet choisis");
  // Choix devenu verrouillé (données effacées) : retombe sur le défaut.
  st.honours = {};
  check(Visuals.resolve(st.teams["fr-A"].visuals, X.visualStats(st, "fr-A", now)).logo === "flag", "élément re-verrouillé : jamais affiché, défaut à la place");
  check(X.setVisuals(st, me("U21C", "L3", 0), { teamId: "fr-U21", visuals: { banner: "flag" } }, now).ok, "visuels : fonctionne aussi pour une sélection U21");
}

// --- Fonctions nationales d'un manager ---
{
  const st = makeStore();
  const c = X.rolesOf(st, "L1", 2);
  check(c.length === 1 && c[0].role === "coach" && c[0].cat === "A" && c[0].country === "fr", "profil : sélectionneur de France A");
  check(X.rolesOf(st, "L1", 5)[0].role === "assistant", "profil : adjoint (staff actif)");
  check(X.rolesOf(st, "L2", 3).length === 0, "profil : invitation en attente = aucune fonction");
  check(X.rolesOf(st, "L1", 9).length === 0, "profil : mandat terminé = aucune fonction");
  const u = X.rolesOf(st, "L3", 0);
  check(u.length === 1 && u[0].cat === "U21" && u[0].role === "coach", "profil : sélectionneur U21");
  check(X.rolesOf(st, "L9", 0).length === 0, "profil : manager sans fonction");
}

// --- Sélection actuelle d'un joueur ---
{
  const st = makeStore();
  const ref = { p: 1234567890, n: "Hugo Martin" };
  st.convocations = {
    "fr-A": {
      s1w1: { gid: "s1w1", startAt: now - 30 * 86400000, frozenAt: now - 31 * 86400000, players: [ref] },
      s1w2: { gid: "s1w2", startAt: now - 2 * 86400000, frozenAt: now - 5 * 86400000, players: [{ p: 1, n: "Autre" }] },
      s1w3: { gid: "s1w3", startAt: now + 20 * 86400000, frozenAt: null, players: [ref] },
    },
    "fr-U21": { s1w2: { gid: "s1w2", startAt: now - 2 * 86400000, frozenAt: now - 5 * 86400000, label: "Fenêtre 2", players: [ref] } },
  };
  st.caps = { "1234567890|Hugo Martin": { n: 4 } };
  const r = X.playerSelection(st, 1234567890, "Hugo Martin", "fr");
  check(r.teams.length === 1 && r.teams[0].cat === "U21" && r.caps === 4, "joueur : U21 actuel (dernière liste figée), pas l'équipe A (absent de la dernière liste, liste non figée ignorée)");
  check(X.playerSelection(st, 1234567890, "Hugo Martin", "es").teams.length === 0, "joueur : autre nationalité, aucune sélection");
  check(X.playerSelection(st, 42, "Inconnu", "fr").teams.length === 0 && X.playerSelection(st, 42, "Inconnu", "fr").caps === 0, "joueur : sans sélection");
}
console.log("\n🏁 national_extras_test.js : vitrine des sélections conforme.");
