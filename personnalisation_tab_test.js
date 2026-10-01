// Onglet Personnalisation (retour utilisateur 2026-09-30 : "ajouter un
// onglet personnalisation (terrain, nom de la salle, maillot, trigramme)",
// sous Planète Hoop et Guide). Vérifie :
// 1) le bouton de la barre latérale, juste sous Guide (avant Premium) ;
// 2) les trois cartes (identité, maillots, parquet) et le sommaire ;
// 3) chaque action appelle toujours la même route serveur qu'avant
//    (/api/club/set-trigram, set-arena-name, set-jersey*, set-away-jersey*,
//    set-court-style) ;
// 4) les règles Premium inchangées (logo, motifs, parquet) ;
// 5) aucun doublon : plus de formulaire dans Paramètres ni sur la page
//    Salle, aucun id en double dans la page.
// 6) les 34 motifs de maillot (2026-09-30, façon BuzzerBeater) : rendu SVG
//    de chacun sans erreur ni id en double, validation, grille aux couleurs
//    du club avec cadenas pour un club gratuit.
const fs = require("fs");
const Engine = require("./engine.js");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, msg, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* pas encore */ } await sleep(40); }
  throw new Error("❌ délai dépassé : " + msg);
}
function duplicateIds(doc) {
  const seen = new Map();
  doc.querySelectorAll("[id]").forEach(el => seen.set(el.id, (seen.get(el.id) || 0) + 1));
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
}

(async () => {
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;

  // Journal des appels serveur (on laisse passer la vraie requête).
  const calls = [];
  const realFetch = win.fetch;
  win.fetch = (input, init) => { calls.push({ url: String(input), body: init && init.body ? String(init.body) : "" }); return realFetch.call(win, input, init); };
  const called = path => calls.some(c => c.url.includes(path));

  // --- 1) Barre latérale.
  // Plus d'onglet dans la barre latérale : petit bouton sur le tableau de
  // bord, à côté de « Analyse de mon équipe » (2026-09-30).
  assert(!doc.querySelector('.sidebar [data-tab="personnalisation"]'), "plus d'onglet Personnalisation dans la barre latérale");
  const persoBtn = doc.querySelector('.hm-head [data-tab="personnalisation"]');
  assert(persoBtn && persoBtn.previousElementSibling && persoBtn.previousElementSibling.hasAttribute("data-own-analysis"), "bouton Personnalisation à côté de « Analyse de mon équipe »");
  persoBtn.click();
  await flush(dom);
  const section = doc.getElementById("personnalisationSection");
  assert(!section.classList.contains("hidden"), "le clic affiche la page Personnalisation");
  assert(section.querySelector("h2.page-title").textContent === "Personnalisation", "titre de page « Personnalisation »");

  // --- 2) Cartes.
  assert([...section.querySelectorAll("[data-pz-anchor]")].map(a => a.dataset.pzAnchor).join() === "persoIdentite,persoMaillots,persoParquet,persoSalle", "sommaire Identité · Maillots · Parquet · Salle");
  const idCard = doc.getElementById("persoIdentityCard");
  assert(idCard.querySelector(".club-logo-preview svg, .club-logo-preview img") && doc.getElementById("clubTrigramInput") && doc.getElementById("salleArenaNameInput"), "carte Identité : logo, trigramme, nom de la salle");
  assert(idCard.querySelector(".pz-scorebug"), "aperçu du tableau d'affichage (trigramme + salle)");
  const jerseys = doc.getElementById("clubIdentityPanel");
  assert(jerseys.querySelector('[data-pz-jersey="home"] .pz-jersey-stage svg') && jerseys.querySelector('[data-pz-jersey="away"] .pz-jersey-stage svg'), "maillots domicile et extérieur avec aperçu");
  assert(jerseys.querySelectorAll("[data-jersey-shape]").length === 2 && !jerseys.querySelector("[data-away-jersey-shape]"), "une seule coupe, partagée");
  assert(doc.querySelector("#persoCourtHolder .sl-court-svg"), "carte Parquet avec aperçu");
  assert(duplicateIds(doc).length === 0, "aucun id en double (page Personnalisation affichée) " + duplicateIds(doc).join(","));

  // --- 4a) Club gratuit : gating.
  assert(!win.eval("teamA.isPaying"), "(setup) club gratuit");
  assert(!doc.getElementById("clubLogoFileInput") && /Premium/.test(idCard.textContent), "gratuit : pas de chargement de logo, mention Premium");
  assert(!jerseys.querySelector("[data-jersey-pattern], [data-away-jersey-pattern], [data-jersey-twotone]"), "gratuit : pas de motif ni de combinaison");
  assert(!doc.querySelector("#persoCourtHolder [data-court-wood]") && doc.querySelector('#persoCourtHolder [data-tab="premium"]'), "gratuit : parquet en aperçu seul + « Passer Premium »");
  assert(doc.querySelector('#persoStatus [data-tab="premium"]'), "gratuit : bouton « Passer Premium » en tête de page");

  // --- 6a) Motifs : rendu de chacun, ids uniques, listes cohérentes.
  const patterns = win.eval("JERSEY_PATTERNS");
  assert(patterns.length === 34 && JSON.stringify(patterns) === JSON.stringify(Engine.JERSEY_PATTERNS), "34 motifs, même liste côté client et moteur");
  assert(patterns.every(p => typeof win.eval("JERSEY_PATTERN_LABELS")[p] === "string"), "un libellé par motif");
  const lab = doc.createElement("div");
  doc.body.appendChild(lab);
  lab.innerHTML = win.eval(`[0, 1, 2].map(i => JERSEY_PATTERNS.map(p => jerseySvgHtml(i ? "B" : "A", ["rouge", "blanc", "noir"][i], 60, i ? "away" : "home", p, i === 2 ? JERSEY_TWO_TONE_SETS.bleu_jaune : null, i === 1 ? "Sponsor" : null, i ? 7 : null)).join("")).join("")`);
  const svgs = lab.querySelectorAll("svg");
  assert(svgs.length === 34 * 3 && !/undefined|NaN/.test(lab.innerHTML), "les 34 motifs se dessinent (3 variantes), sans valeur indéfinie");
  const badRefs = [...lab.querySelectorAll("svg")].flatMap(svg => [...svg.outerHTML.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1]).filter(id => !svg.querySelector(`[id="${id}"]`)));
  assert(badRefs.length === 0, "chaque url(#…) pointe vers un id du même maillot " + badRefs.slice(0, 3).join(","));
  patterns.slice(4).forEach(p => {
    const one = win.eval(`jerseySvgHtml("A", "bleu", 60, "home", ${JSON.stringify(p)}, null)`);
    const norm = h => h.replace(/jersey\d+/g, "J").replace(/aria-label="[^"]*"/, "");
    if (norm(one) === norm(win.eval(`jerseySvgHtml("A", "bleu", 60, "home", "uni", null)`))) throw new Error("❌ motif sans effet : " + p);
    // Silhouette réaliste (2026-10-01) : ombrage/liserés communs à tous, on compare donc au maillot uni.
    const count = h => (h.match(/<(rect|path|circle|linearGradient|radialGradient|pattern)/g) || []).length;
    if (count(one) <= count(win.eval(`jerseySvgHtml("A", "bleu", 60, "home", "uni", null)`))) throw new Error("❌ motif vide : " + p);
  });
  assert(duplicateIds(doc).length === 0, "aucun id en double avec 102 maillots sur la page");
  lab.remove();

  // --- 6b) Grille des motifs, club gratuit : cadenas, aucune requête.
  const homeGrid = doc.querySelector('[data-pz-jersey="home"] .jersey-pattern-picker');
  assert(homeGrid.querySelectorAll(".jersey-pattern-btn").length === 34 && homeGrid.querySelectorAll("[data-pattern-locked]").length === 33, "gratuit : 34 vignettes, 33 verrouillées (domicile)");
  assert(doc.querySelectorAll('[data-pz-jersey="away"] [data-pattern-locked]').length === 33, "gratuit : 33 vignettes verrouillées (extérieur)");
  assert(homeGrid.querySelectorAll(".pz-lock").length === 33, "cadenas sur chaque motif Premium");
  const redHex = win.eval("JERSEY_COLORS[teamA.jerseyColor]");
  assert(homeGrid.querySelector('[data-pattern-locked="bande_centrale"] > svg > path').getAttribute("fill") === redHex, "vignettes dessinées aux couleurs du club");
  const before = calls.length, patternBefore = win.eval("teamA.jerseyPattern");
  homeGrid.querySelector('[data-pattern-locked="nid_abeille"]').click();
  await flush(dom);
  const cta = doc.querySelector('[data-pz-pattern-cta="home"]');
  assert(/Nid d'abeille/.test(cta.textContent) && cta.querySelector('[data-tab="premium"]'), "clic sur un motif verrouillé : invitation « Passer Premium »");
  assert(calls.slice(before).every(c => !/jersey/.test(c.url)) && win.eval("teamA.jerseyPattern") === patternBefore, "aucune requête envoyée, motif inchangé");

  // --- 3) Actions → mêmes routes serveur.
  const trigramInput = doc.getElementById("salleArenaNameInput");
  trigramInput.value = "Le Chaudron";
  doc.getElementById("salleArenaNameSaveBtn").click();
  await waitFor(() => win.eval("teamA.arenaName") === "Le Chaudron", "nom de salle appliqué");
  assert(called("/api/club/set-arena-name"), "nom de salle → /api/club/set-arena-name");
  assert(/Le Chaudron/.test(doc.querySelector("#persoIdentityCard .pz-scorebug").textContent), "aperçu mis à jour avec le nom de la salle");
  doc.getElementById("clubTrigramInput").value = "LYX";
  doc.getElementById("clubTrigramSaveBtn").click();
  await waitFor(() => win.eval("teamA.trigram") === "LYX", "trigramme appliqué");
  assert(called("/api/club/set-trigram"), "trigramme → /api/club/set-trigram");
  assert(/LYX/.test(doc.getElementById("clubTrigramFeedback").textContent), "message de confirmation du trigramme");

  // Saisie en cours préservée par un clic sur un maillot (cartes séparées).
  doc.getElementById("salleArenaNameInput").value = "brouillon";
  const homeColor = [...doc.querySelectorAll("[data-jersey-color]")].find(b => b.dataset.jerseyColor !== win.eval("teamA.jerseyColor"));
  homeColor.click();
  assert(win.eval("teamA.jerseyColor") === homeColor.dataset.jerseyColor && called("/api/club/set-jersey"), "couleur domicile → /api/club/set-jersey");
  assert(doc.getElementById("salleArenaNameInput").value === "brouillon", "un clic sur un maillot n'efface pas la saisie en cours");
  doc.querySelector('[data-jersey-shape="B"]').click();
  assert(win.eval("teamA.jerseyShape") === "B" && doc.querySelector('[data-jersey-shape="B"]').classList.contains("active"), "coupe B appliquée et reflétée");
  const awayColor = [...doc.querySelectorAll("[data-away-jersey-color]")].find(b => b.dataset.awayJerseyColor !== win.eval("teamA.awayJerseyColor"));
  awayColor.click();
  assert(win.eval("teamA.awayJerseyColor") === awayColor.dataset.awayJerseyColor && called("/api/club/set-away-jersey"), "couleur extérieure → /api/club/set-away-jersey");
  assert(doc.querySelector('[data-pz-jersey="away"] .jersey-color-swatch.active').dataset.awayJerseyColor === awayColor.dataset.awayJerseyColor, "aperçu extérieur redessiné");

  // --- 4b) Premium.
  win.eval("renderPremiumSection()");
  doc.getElementById("premiumToggleBtn").click();
  await flush(dom);
  assert(win.eval("teamA.isPaying"), "(setup) club Premium");
  win.eval("TAB_HANDLERS.personnalisation()");
  await flush(dom);
  assert(doc.getElementById("clubLogoFileInput"), "Premium : chargement de logo proposé");
  assert(/Premium/.test(doc.getElementById("persoStatus").textContent) && !doc.querySelector('#persoStatus [data-tab="premium"]'), "Premium : statut affiché, plus de bouton « Passer Premium »");
  doc.querySelector('[data-jersey-pattern="rayures"]').click();
  assert(win.eval("teamA.jerseyPattern") === "rayures" && called("/api/club/set-jersey-pattern"), "motif domicile → /api/club/set-jersey-pattern");
  const tt = doc.querySelector("[data-jersey-twotone]");
  assert(tt, "combinaison de 2 couleurs proposée pour un motif");
  tt.click();
  assert(called("/api/club/set-jersey-two-tone"), "combinaison domicile → /api/club/set-jersey-two-tone");
  assert(doc.querySelectorAll('[data-pz-jersey="home"] [data-jersey-pattern]').length === 34 && !doc.querySelector("[data-pattern-locked]"), "Premium : les 34 motifs cliquables, plus de cadenas");
  doc.querySelector('[data-jersey-pattern="nid_abeille"]').click();
  assert(win.eval("teamA.jerseyPattern") === "nid_abeille" && calls.some(c => c.url.includes("/api/club/set-jersey-pattern") && c.body.includes("nid_abeille")), "nouveau motif domicile → /api/club/set-jersey-pattern");
  assert(/nid d'abeille/.test(doc.querySelector('[data-pz-jersey="home"] .pz-jersey-stage svg').getAttribute("aria-label")), "grand aperçu redessiné avec le nouveau motif");
  doc.querySelector('[data-away-jersey-pattern="rayons"]').click();
  assert(win.eval("teamA.awayJerseyPattern") === "rayons" && calls.some(c => c.url.includes("/api/club/set-away-jersey-pattern") && c.body.includes("rayons")), "nouveau motif extérieur → /api/club/set-away-jersey-pattern");
  assert(win.eval("teamA.setJerseyPattern('inconnu').ok") === false, "motif inconnu refusé");
  doc.querySelector('[data-jersey-pattern="rayures"]').click();
  doc.querySelector('[data-away-jersey-pattern="bandes"]').click();
  assert(win.eval("teamA.awayJerseyPattern") === "bandes" && called("/api/club/set-away-jersey-pattern"), "motif extérieur → /api/club/set-away-jersey-pattern");
  doc.querySelector("[data-away-jersey-twotone]").click();
  assert(called("/api/club/set-away-jersey-two-tone"), "combinaison extérieure → /api/club/set-away-jersey-two-tone");

  const woods = doc.querySelectorAll("#persoCourtHolder [data-court-wood]");
  assert(woods.length > 1, "Premium : choix du bois");
  assert(doc.getElementById("persoCourtSaveBtn").disabled, "enregistrer désactivé tant que rien ne change");
  doc.querySelector('#persoCourtHolder [data-court-wood="erable"]').click();
  doc.querySelector('#persoCourtHolder [data-court-paint="bleu"]').click();
  assert(!doc.getElementById("persoCourtSaveBtn").disabled, "brouillon : bouton Enregistrer actif");
  doc.getElementById("persoCourtSaveBtn").click();
  await waitFor(() => { const s = win.eval("teamA.courtStyle"); return s && s.wood === "erable" && s.paint === "bleu"; }, "parquet enregistré");
  assert(called("/api/club/set-court-style"), "parquet → /api/club/set-court-style");
  assert(/enregistré/.test(doc.getElementById("persoCourtFeedback").textContent), "confirmation du parquet");
  assert(duplicateIds(doc).length === 0, "aucun id en double (Premium)");

  // --- 6c) Premium perdu : motif conservé mais affichage retombé sur « uni ».
  win.eval("teamA.jerseyPattern = 'chevrons'; teamA.isPaying = false;");
  assert(win.eval("effectiveJerseyPattern(teamA)") === "uni" && win.eval("teamA.jerseyPattern") === "chevrons", "Premium perdu : affiché en uni, choix conservé pour une réactivation");
  win.eval("teamA.isPaying = true; teamA.jerseyPattern = 'rayures';");

  // --- 5) Plus de doublons ailleurs.
  win.eval("showSettingsModal('club')");
  assert(!doc.querySelector("#settingsModalOverlay #clubTrigramInput, #settingsModalOverlay #salleArenaNameInput") && doc.getElementById("settingsOpenPersoBtn"), "Paramètres → Club : un simple renvoi");
  assert(duplicateIds(doc).length === 0, "aucun id en double avec Paramètres ouverts");
  doc.getElementById("settingsOpenPersoBtn").click();
  assert(!doc.getElementById("settingsModalOverlay") && !section.classList.contains("hidden"), "« Ouvrir Personnalisation » ferme Paramètres et ouvre l'onglet");
  win.eval("showClubIdentityModal()");
  assert(!doc.getElementById("clubIdentityModalOverlay") && !section.classList.contains("hidden"), "showClubIdentityModal redirige vers l'onglet (plus de fenêtre)");
  doc.querySelector('.tab-btn[data-tab="salle"]').click();
  await flush(dom);
  assert(!doc.querySelector("#salleSection .sl-court-svg, #salleSection [data-court-wood], #salleSection #salleCourtHolder"), "page Salle : plus de carte parquet");
  assert(!/Réglage sur la page Salle/.test(html) && !/page Salle, carte « Votre terrain »/.test(html), "textes Premium/Guide à jour");

  win.close(); server.close();
  console.log("\n🏁 personnalisation_tab_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
