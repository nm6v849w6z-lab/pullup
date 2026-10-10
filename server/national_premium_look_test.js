// Personnalisation Premium complète des sélections (mission 2026-10-10) :
// maillot (coupe, couleurs libres, motif, deux tons), parquet (bois ou
// couleur libre, raquette), logo importé — validation identique aux
// réglages Premium du club, droits (sélectionneur / adjoint d'un club
// Premium), retour au catalogue, stockage à part (stock national), priorité
// sur le catalogue, habillage de l'équipe du match (direct compris).
const fs = require("fs");
const os = require("os");
const path = require("path");
const X = require("./nationalExtras.js");
const NT = require("./nationalTeams.js");
function check(c, msg) { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const now = 1_800_000_000_000;
function makeStore() {
  return {
    seasonNo: 3,
    teams: { "de-A": { id: "de-A", country: "de", cat: "A", mandateId: "m1", visuals: { jersey: "rouge", court: "erable", logo: "nat-shield", center: "flag" } }, "fr-A": { id: "fr-A", country: "fr", cat: "A", mandateId: "m2" } },
    mandates: [
      { id: "m1", teamId: "de-A", key: "COACH", ref: { leagueId: "L1", idx: 2 }, pseudo: "Coach", endedAt: null, staffV: 2, staff: [{ key: "ADJ", role: "assistant", status: "active", ref: { leagueId: "L1", idx: 5 } }, { key: "HELP", role: "helper", status: "active", ref: { leagueId: "L2", idx: 1 } }] },
      { id: "m2", teamId: "fr-A", key: "FR", ref: { leagueId: "L3", idx: 0 }, pseudo: "FR", endedAt: null, staffV: 2, staff: [] },
    ],
    convocations: {}, caps: {}, intl: {}, finals: {}, honours: {}, intlFriendlies: [],
  };
}
const me = (key, leagueId, idx, premium) => ({ key, ref: { leagueId, idx }, pseudo: key, clubName: key + " club", premium: !!premium });
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const FULL = { jerseyShape: "B", jerseyColor: "#123abc", jerseyPattern: "rayures", jerseyTwoTone: "#123abc/#ffcc00", courtStyle: { wood: "#334455", paint: "#aa0000" }, logoDataUrl: LOGO };

(async () => {
  // 1) Droits : Premium obligatoire, rôle sélectionneur / adjoint.
  {
    const st = makeStore();
    const r = X.setLook(st, me("COACH", "L1", 2, false), { teamId: "de-A", look: FULL }, now);
    check(!r.ok && r.status === 403 && /Premium/.test(r.error) && !st.teams["de-A"].look, "club non Premium : refus 403, rien d'enregistré");
    check(X.setLook(st, me("HELP", "L2", 1, true), { teamId: "de-A", look: FULL }, now).status === 403, "personne aidante (même Premium) : refus 403");
    check(X.setLook(st, me("FR", "L3", 0, true), { teamId: "de-A", look: FULL }, now).status === 403, "sélectionneur d'une autre nation : refus 403");
    check(X.setLook(st, null, { teamId: "de-A", look: FULL }, now).status === 403, "sans compte : refus");
    const a = X.setLook(st, me("ADJ", "L1", 5, true), { teamId: "de-A", look: FULL }, now);
    check(a.ok && JSON.stringify(st.teams["de-A"].look) === JSON.stringify(FULL), "adjoint d'un club Premium : personnalisation complète enregistrée (coupe, couleurs libres, motif, deux tons, parquet, logo)");
    check(st.teams["de-A"].lookBy === "ADJ" && st.teams["de-A"].lookAt === now, "auteur et date gardés");
    check(st.teams["de-A"].visuals.jersey === "rouge", "choix du catalogue conservés à côté (stockage distinct)");
  }
  // 2) Validation : mêmes règles que les réglages Premium du club.
  {
    const st = makeStore(), coach = me("COACH", "L1", 2, true);
    const bad = [
      [{ jerseyShape: "Z" }, "coupe inconnue"], [{ jerseyColor: "#12" }, "couleur invalide"], [{ jerseyPattern: "licorne" }, "motif inconnu"],
      [{ jerseyTwoTone: "#zzzzzz/#000000" }, "deux tons invalides"], [{ courtStyle: { wood: "bambou" } }, "bois inconnu"], [{ courtStyle: { paint: "#12345" } }, "raquette invalide"],
      [{ logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }, "logo SVG refusé"], [{ logoDataUrl: "data:image/png;base64," + "A".repeat(400001) }, "logo trop lourd"],
      [{ logoDataUrl: "javascript:alert(1)" }, "logo non image refusé"],
    ];
    for (const [look, label] of bad) check(!X.setLook(st, coach, { teamId: "de-A", look }, now).ok && !st.teams["de-A"].look, "refusé : " + label);
    check(!X.setLook(st, coach, { teamId: "de-A" }, now).ok, "requête sans personnalisation : refusée");
    const ok = X.setLook(st, coach, { teamId: "de-A", look: { jerseyColor: "vert", courtStyle: { wood: "noyer", paint: "" } } }, now);
    check(ok.ok && st.teams["de-A"].look.jerseyColor === "vert" && st.teams["de-A"].look.courtStyle.wood === "noyer", "couleurs du jeu et bois du catalogue acceptés aussi");
    // Retour au catalogue : permis sans Premium (rien de Premium ajouté).
    const r = X.setLook(st, me("COACH", "L1", 2, false), { teamId: "de-A", look: null }, now);
    check(r.ok && st.teams["de-A"].look === null, "retour au catalogue : permis sans Premium");
  }
  // 3) Page publique : la personnalisation est exposée (visiteurs compris).
  {
    const st = makeStore();
    X.setLook(st, me("COACH", "L1", 2, true), { teamId: "de-A", look: FULL }, now);
    const pub = X.publicExtras(st, "de-A", null, now);
    check(pub && pub.look && pub.look.logoDataUrl === LOGO && pub.visuals.jersey === "rouge", "page de la sélection : personnalisation + catalogue transmis");
  }
  // 4) Habillage du match : prioritaire sur le catalogue ; sans, catalogue
  //    (deux tons de l'aperçu) ; écusson du catalogue pour le direct.
  {
    const st = makeStore();
    const cat = X.matchDress(st, "de-A", now);
    check(cat.jerseyColor === "rouge" && cat.jerseyTwoTone === "#d6473f/#f2f2f0" && cat.court.wood === "erable" && cat.logo.id === "nat-shield" && cat.logo.center === "flag" && !cat.logoDataUrl, "sans personnalisation : catalogue (maillot, deux tons de l'aperçu, parquet, écusson)");
    X.setLook(st, me("COACH", "L1", 2, true), { teamId: "de-A", look: FULL }, now);
    const d = X.matchDress(st, "de-A", now);
    check(d.jerseyShape === "B" && d.jerseyColor === "#123abc" && d.jerseyPattern === "rayures" && d.jerseyTwoTone === "#123abc/#ffcc00" && d.court.wood === "#334455" && d.court.paint === "#aa0000" && d.logoDataUrl === LOGO, "avec personnalisation : maillot, parquet et logo Premium");
    check(X.matchDress(st, "fr-A", now) === null, "sélection sans aucun choix : rien");
    const st2 = makeStore(); delete st2.teams["fr-A"].visuals;
    X.setLook(st2, me("FR", "L3", 0, true), { teamId: "fr-A", look: { logoDataUrl: LOGO } }, now);
    const d2 = X.matchDress(st2, "fr-A", now);
    check(d2 && d2.logoDataUrl === LOGO && d2.jerseyColor === "bleu", "logo seul : le reste vient du catalogue par défaut");
  }
  // 5) Persistance : stock national (fichier à part), relu à l'identique.
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "natlook-"));
    const multi = path.join(dir, "multi-league.json");
    const st = NT.emptyStore();
    st.teams["de-A"] = st.teams["de-A"] || { id: "de-A", country: "de", cat: "A" };
    st.teams["de-A"].look = JSON.parse(JSON.stringify(FULL));
    await NT.saveStore(st, multi);
    const back = await NT.loadStore(multi);
    check(back && JSON.stringify(back.teams["de-A"].look) === JSON.stringify(FULL), "enregistrée dans le stock national puis relue à l'identique");
    check(!fs.existsSync(multi) || !/123abc/.test(fs.readFileSync(multi, "utf8")), "rien dans la sauvegarde des clubs");
  }
  console.log("\n🏁 national_premium_look_test.js : personnalisation Premium des sélections conforme.");
})().catch(e => { console.error(e); process.exit(1); });
