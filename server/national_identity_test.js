// Identité nationale (2026-10-09) : écussons aux couleurs du drapeau,
// drapeau au centre au lieu des initiales, bannières et maillots
// nationaux — générique (palette calculée à partir des drapeaux du jeu),
// compatible avec les anciens choix, droits contrôlés par le serveur.
const V = require("../assets/national-visuals.js");
const X = require("./nationalExtras.js");
const PAL = require("../assets/flags/palette.json");
function check(c, msg) { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const now = 1_800_000_000_000;
function makeStore() {
  return {
    seasonNo: 3,
    teams: { "de-A": { id: "de-A", country: "de", cat: "A", mandateId: "m1" }, "fr-A": { id: "fr-A", country: "fr", cat: "A", mandateId: "m2" } },
    mandates: [
      { id: "m1", teamId: "de-A", key: "COACH", ref: { leagueId: "L1", idx: 2 }, pseudo: "Coach", endedAt: null, staffV: 2, staff: [{ key: "ADJ", role: "assistant", status: "active", ref: { leagueId: "L1", idx: 5 } }, { key: "HELP", role: "helper", status: "active", ref: { leagueId: "L2", idx: 1 } }] },
      { id: "m2", teamId: "fr-A", key: "FR", ref: { leagueId: "L3", idx: 0 }, pseudo: "FR", endedAt: null, staffV: 2, staff: [] },
    ],
    convocations: {}, caps: {}, intl: {}, finals: {}, honours: {}, intlFriendlies: [],
  };
}
const me = (key, leagueId, idx) => ({ key, ref: { leagueId, idx }, pseudo: key, clubName: key + " club" });

// Palette : tous les drapeaux du jeu, 2 ou 3 couleurs chacun.
check(Object.keys(PAL).length >= 90 && Object.values(PAL).every(p => p.length >= 2 && p.length <= 3 && p.every(h => /^#[0-9a-f]{6}$/.test(h))), `palette : ${Object.keys(PAL).length} drapeaux, 2 à 3 couleurs chacun`);
check(PAL.de.join() === "#000001,#ff0000,#ffcc00", "Allemagne : noir, rouge, or (lus sur le drapeau)");

// Maillots nationaux : générique pour tous les pays.
const keys = Object.keys(V.JERSEY_HEX);
for (const id of ["nat-uni", "nat-bandes", "nat-split"]) {
  const it = V.itemOf("jersey", id);
  check(Object.keys(PAL).every(c => { const j = V.nationJersey(it, PAL[c]); return keys.includes(j.color) && keys.includes(j.second) && j.color !== j.second && /^#[0-9a-f]{6}\/#[0-9a-f]{6}$/.test(j.pair); }), `maillot « ${it.label} » : couleurs valides pour les ${Object.keys(PAL).length} pays`);
}
const de = V.nationJersey(V.itemOf("jersey", "nat-bandes"), PAL.de), fr = V.nationJersey(V.itemOf("jersey", "nat-uni"), PAL.fr);
check(de.color === "noir" && de.second === "rouge" && fr.color === "bleu", "Allemagne : noir et rouge ; France : bleu (pas noir)");

// Compatibilité : anciens choix inchangés, centre = initiales par défaut.
const legacy = V.resolve({ logo: "shield", banner: "flag", jersey: "rouge", court: "erable" }, { played: 0 });
check(legacy.logo === "shield" && legacy.center === "code" && legacy.jersey === "rouge", "anciens choix conservés, initiales au centre par défaut");

// Droits et déblocages (serveur).
{
  const st = makeStore();
  const r = X.setVisuals(st, me("ADJ", "L1", 5), { teamId: "de-A", visuals: { logo: "nat-shield", center: "flag", banner: "nat-bands", jersey: "nat-bandes" } }, now);
  check(r.ok && r.visuals.logo === "nat-shield" && r.visuals.center === "flag" && r.visuals.banner === "nat-bands" && r.visuals.jersey === "nat-bandes", "adjoint : écusson national, drapeau au centre, bannière et maillot nationaux enregistrés");
  const h = X.setVisuals(st, me("HELP", "L2", 1), { teamId: "de-A", visuals: { logo: "nat-round" } }, now);
  check(!h.ok && h.status === 403, "personne aidante : refus 403 (API)");
  const fr2 = X.setVisuals(st, me("FR", "L3", 0), { teamId: "de-A", visuals: { logo: "nat-round" } }, now);
  check(!fr2.ok && fr2.status === 403, "sélectionneur d'une autre nation : refus 403");
  const locked = X.setVisuals(st, me("COACH", "L1", 2), { teamId: "de-A", visuals: { logo: "nat-star" } }, now);
  check(!locked.ok && locked.status === 403, "écusson étoilé : verrouillé tant que la sélection n'a pas disputé de phase finale");
  check(!X.setVisuals(st, me("COACH", "L1", 2), { teamId: "de-A", visuals: { center: "smiley" } }, now).ok, "centre inconnu refusé");
  // Match : maillot = aperçu (couleurs exactes du drapeau en deux tons).
  const dress = X.matchDress(st, "de-A", now);
  check(dress.jerseyColor === "noir" && dress.jerseyPattern === "bandes" && dress.jerseyTwoTone === "#000001/#ff0000", "match : maillot noir à bandes rouges (couleurs du drapeau)");
}
console.log("\n🏁 national_identity_test.js : identité nationale conforme.");
