// Traduction anglaise (retour utilisateur, 2026-09-26 : « il faut maintenant
// traduire le jeu en anglais, on pourra activer l'anglais en allant
// paramètre dans le tableau de bord »). Vérifie :
// 1) le choix de langue dans Paramètres (Français / English), mémorisé dans
//    le navigateur (localStorage "hm-lang") ;
// 2) en français (défaut), rien n'est touché ;
// 3) en anglais, la page est traduite à l'affichage (assets/i18n/i18n.js +
//    dictionnaire en.js) : menus, pages, attributs, rendus dynamiques,
//    dates, postes abrégés, commentaires du direct (gabarits + élision).
const fs = require("fs");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

function assert(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { /* pas encore */ } await sleep(50); }
  return false;
}

(async () => {
  const { server, baseUrl } = await startTestServer();

  // ------------------------------------------------------------------
  // 1) Français par défaut + choix de langue dans Paramètres
  // ------------------------------------------------------------------
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  await waitFor(() => win.hmI18n);
  assert(doc.documentElement.getAttribute("lang") === "fr", "français par défaut (<html lang=fr>)");
  assert(win.hmI18n && win.hmI18n.getLang() === "fr", "hmI18n chargé, langue fr");
  assert(!win.HM_I18N_EN, "en français, le dictionnaire anglais n'est pas téléchargé");

  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "club").click();
  doc.querySelector(".hm-head__settings-btn").click();
  const overlay = doc.getElementById("settingsModalOverlay");
  const langs = [...overlay.querySelectorAll("[data-lang-choice]")];
  assert(langs.map(b => b.dataset.langChoice).join() === "fr,en", "Paramètres : choix Français / English");
  assert(langs[0].getAttribute("aria-pressed") === "true", "Français coché au départ");
  assert(/Français/.test(langs[0].textContent) && /English/.test(langs[1].textContent), "chaque langue écrite dans sa propre langue");
  assert(overlay.querySelector("#settingsThemeChoices"), "le choix du thème est toujours là");
  let reloaded = 0;
  win.hmI18n.setLang = (l) => { win.localStorage.setItem("hm-lang", l); reloaded++; }; // jsdom ne sait pas recharger
  langs[1].click();
  assert(win.localStorage.getItem("hm-lang") === "en", "clic sur English : mémorisé dans le navigateur");
  assert(reloaded === 1, "changer de langue recharge la page");
  assert(langs[1].getAttribute("aria-pressed") === "true", "English coché après le clic");
  assert(/Tableau de bord/.test(doc.querySelector(".tab-btn[data-tab=club]").textContent), "en français, les onglets restent en français");

  // ------------------------------------------------------------------
  // 2) Rechargement en anglais
  // ------------------------------------------------------------------
  const dom2 = await openGame(html, baseUrl, w => { w.localStorage.setItem("hm-lang", "en"); });
  const w2 = dom2.window, d2 = w2.document;
  assert(d2.documentElement.getAttribute("lang") === "en", "anglais : <html lang=en> dès le chargement");
  assert(await waitFor(() => w2.HM_I18N_EN && w2.hmI18n.t("Tableau de bord") === "Dashboard"), "dictionnaire anglais chargé");
  await sleep(100);
  const tab = k => d2.querySelector(`.tab-btn[data-tab=${k}]`);
  assert(/Dashboard/.test(tab("club").textContent), "onglet Tableau de bord → Dashboard");
  assert(/Squad/.test(tab("effectif").textContent) && /Orders/.test(tab("ordres").textContent), "onglets Effectif / Ordres traduits");
  assert(/Schedule/.test(tab("calendrier").textContent) && /League/.test(tab("ligue").textContent), "onglets Calendrier / Ligue traduits");

  // Rendu dynamique après coup (la page Ordres est reconstruite au clic).
  tab("ordres").click();
  await sleep(150);
  const prep = d2.getElementById("prepSection");
  assert(prep && /Match orders/.test(prep.textContent), "page Ordres (rendue au clic) : « Match orders »");
  assert(!/Ordres de match/.test(prep.textContent), "plus de « Ordres de match » en français");

  // Attributs visibles (placeholder de la recherche du haut).
  const search = d2.querySelector("input[placeholder]");
  assert(search && !/Rechercher/.test(search.getAttribute("placeholder")), "placeholder traduit : " + (search && search.getAttribute("placeholder")));

  // Dates formatées par le jeu en "fr-FR" → à l'anglaise ; nombres 1,234.
  assert(/^[A-Z][a-z]+day \d+ [A-Z][a-z]+ at \d\d:\d\d$/.test(w2.eval("formatDateTimeFr(Date.UTC(2026, 8, 28, 9, 30))")), "dates du jeu en anglais (Monday 28 September at 11:30)");
  assert(w2.eval("(1234567).toLocaleString('fr-FR')") === "1,234,567", "nombres à l'anglaise (1,234,567)");

  // Postes abrégés : M/A/AS/AF/P → PG/SG/SF/PF/C
  assert(w2.eval("POS_SHORT['Meneur'] + POS_SHORT['Pivot']") === "PGC", "postes abrégés : Meneur → PG, Pivot → C");

  // Traducteur : exact, gabarit + élision, trous traduits, prose refusée, dates.
  const t = w2.hmI18n.t;
  assert(t("Tir manqué d'Yanis Fournier. Rebond offensif de Sacha Camara.").indexOf("Yanis Fournier") !== -1 && !/Tir manqué/.test(t("Tir manqué d'Yanis Fournier. Rebond offensif de Sacha Camara.")), "commentaire du direct (gabarit + élision d') traduit : " + t("Tir manqué d'Yanis Fournier. Rebond offensif de Sacha Camara."));
  assert(t("Journée 7") === "Matchday 7", "gabarit simple : Journée 7 → Matchday 7");
  assert(t("  Tableau de bord  ") === "  Dashboard  ", "espaces de bord conservés");
  assert(t("Léo Martin") === "Léo Martin", "un nom de joueur n'est pas touché");
  assert(t("Samedi 3 octobre · 15:00") === "Saturday 3 October · 15:00", "date écrite en français → anglais");
  assert(t("Léo Martin (P, 29)") === "Léo Martin (C, 29)", "« (P, 29) » → « (C, 29) »");
  const half = t("Un texte inventé et une autre phrase qui n'existe pas");
  assert(!/ and /.test(half), "pas de phrase à moitié traduite par un gabarit trop large");

  // Aucun libellé de navigation resté en français.
  const nav = [...d2.querySelectorAll(".tab-btn")].map(b => b.textContent.trim()).join(" | ");
  assert(!/Tableau|Effectif|Calendrier|Économie|Entraînement|Académie|Marché/.test(nav), "barre de navigation entièrement en anglais : " + nav);

  // Paramètres en anglais : les noms de langue ne sont pas traduits.
  tab("club").click();
  d2.querySelector(".hm-head__settings-btn").click();
  await sleep(50);
  const ov2 = d2.getElementById("settingsModalOverlay");
  assert(/Settings/.test(ov2.textContent) && /Language/.test(ov2.textContent), "fenêtre Paramètres en anglais (Settings / Language)");
  assert(/Français/.test(ov2.textContent), "« Français » reste écrit en français");
  assert(ov2.querySelector('[data-lang-choice="en"]').getAttribute("aria-pressed") === "true", "English coché");

  server.close();
  console.log("✅ Traduction anglaise vérifiée.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
