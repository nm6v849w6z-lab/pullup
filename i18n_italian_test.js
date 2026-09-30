// Traduction italienne (2026-09-30) : même mécanique que l'anglais
// (assets/i18n/i18n.js), dictionnaire assets/i18n/it.js. Vérifie :
// 1) le dictionnaire : mêmes clés que en.js (dans les deux sens), aucune
//    valeur vide, trous {0}/{player} conservés (seuls les trous « collés »
//    d'un accord français, joueur{1}, peuvent disparaître), balises HTML et
//    espaces de bord identiques ;
// 2) le choix « Italiano » dans Paramètres (Français / English / Italiano),
//    mémorisé dans le navigateur (localStorage "hm-lang" = "it") ;
// 3) en italien : <html lang=it>, onglets, page Ordres, attributs, dates et
//    nombres à l'italienne (it-IT), postes abrégés (PM/G/AP/AG/C),
//    commentaires du direct (gabarits + élision) ;
// 4) un passage sur tous les onglets principaux : aucun texte visible de la
//    navigation ni des titres de page resté en français, et la liste des
//    textes français non traduits vus (mode debug) reste marginale.
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
function loadDict(file, name) {
  const sandbox = {};
  new Function("window", fs.readFileSync(file, "utf-8"))(sandbox);
  return sandbox[name];
}

(async () => {
  // ------------------------------------------------------------------
  // 1) Dictionnaire
  // ------------------------------------------------------------------
  const EN = loadDict("assets/i18n/en.js", "HM_I18N_EN");
  const IT = loadDict("assets/i18n/it.js", "HM_I18N_IT");
  const enKeys = Object.keys(EN), itKeys = Object.keys(IT);
  const missing = enKeys.filter(k => !(k in IT));
  const extra = itKeys.filter(k => !(k in EN));
  assert(missing.length === 0, `toutes les clés de en.js sont dans it.js (${itKeys.length}/${enKeys.length})` + (missing.length ? " — manquantes : " + missing.slice(0, 5).map(k => JSON.stringify(k)).join(", ") + " (node scripts/i18n_missing.js)" : ""));
  assert(extra.length === 0, "aucune clé de it.js absente de en.js" + (extra.length ? " : " + extra.slice(0, 5).join(" | ") : ""));
  const empty = itKeys.filter(k => typeof IT[k] !== "string" || (!IT[k].trim() && k.trim()));
  assert(empty.length === 0, "aucune valeur vide" + (empty.length ? " : " + empty.slice(0, 5).join(" | ") : ""));
  const badPh = [], badTags = [], badEdge = [];
  const tags = s => (s.match(/<\/?[a-z][^>]*>/gi) || []).map(t => t.replace(/\s.*$/, "")).sort().join();
  for (const k of itKeys) {
    const v = IT[k];
    // Trous obligatoires : tous sauf ceux collés à un mot (accord français).
    const need = (k.match(/(^|[^A-Za-zÀ-ÿ)])\{\w+\}/g) || []).map(x => x.replace(/^[^{]*/, ""));
    const allowed = new Set(k.match(/\{\w+\}/g) || []);
    const have = v.match(/\{\w+\}/g) || [];
    if (need.some(p => !have.includes(p)) || have.some(p => !allowed.has(p))) badPh.push(k);
    if (tags(k) !== tags(v)) badTags.push(k);
    const lead = s => /^\s*/.exec(s)[0], trail = s => /\s*$/.exec(s)[0];
    if ((lead(k) !== lead(v) && !/^\s[;:!?]/.test(k)) || trail(k) !== trail(v)) badEdge.push(k);
  }
  assert(badPh.length === 0, "trous {0}/{player} conservés" + (badPh.length ? " : " + badPh.slice(0, 5).join(" | ") : ""));
  assert(badTags.length === 0, "fragments HTML conservés" + (badTags.length ? " : " + badTags.slice(0, 5).join(" | ") : ""));
  assert(badEdge.length === 0, "espaces de bord conservés (fragments collés à du texte en gras)" + (badEdge.length ? " : " + badEdge.slice(0, 5).map(k => JSON.stringify(k)).join(" | ") : ""));
  const glossary = { "Tableau de bord": "Panoramica", "Effectif": "Rosa", "Marché": "Mercato", "Entraînement": "Allenamento", "Tactiques": "Tattiche",
    "Calendrier": "Calendario", "Classement": "Classifica", "Coupe": "Coppa", "Économie": "Economia", "Salle": "Palazzetto", "Supporters": "Tifosi",
    "Personnalisation": "Personalizzazione", "Guide": "Guida", "Meneur": "Playmaker", "Arrière": "Guardia", "Ailier shooteur": "Ala piccola",
    "Ailier fort": "Ala grande", "Pivot": "Centro", "Rebonds": "Rimbalzi", "Contres": "Stoppate", "Lancers francs": "Tiri liberi", "Balles perdues": "Palle perse" };
  const offGloss = Object.keys(glossary).filter(k => IT[k] !== glossary[k]);
  assert(offGloss.length === 0, "vocabulaire du glossaire respecté (Rosa, Mercato, Palazzetto, Playmaker, Stoppate…)" + (offGloss.length ? " : " + offGloss.join(", ") : ""));

  // ------------------------------------------------------------------
  // 2) Choix de la langue dans Paramètres
  // ------------------------------------------------------------------
  const { server, baseUrl } = await startTestServer();
  const dom = await openGame(html, baseUrl);
  const win = dom.window, doc = win.document;
  await waitFor(() => win.hmI18n);
  assert(!win.HM_I18N_IT, "en français, le dictionnaire italien n'est pas téléchargé");
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "club").click();
  doc.querySelector("#sidebarSettingsBtn").click();
  const overlay = doc.getElementById("settingsModalOverlay");
  const langs = [...overlay.querySelectorAll("[data-lang-choice]")];
  assert(langs.map(b => b.dataset.langChoice).join() === "fr,en,it", "Paramètres : Français / English / Italiano");
  const itBtn = langs[2];
  assert(/Italiano/.test(itBtn.textContent) && itBtn.getAttribute("lang") === "it", "« Italiano » écrit en italien (lang=it)");
  let reloaded = 0;
  win.hmI18n.setLang = (l) => { win.localStorage.setItem("hm-lang", l); reloaded++; }; // jsdom ne sait pas recharger
  itBtn.click();
  await win.__lastLangSave; // langue enregistrée dans le compte avant le rechargement
  assert(win.localStorage.getItem("hm-lang") === "it" && reloaded === 1, "clic sur Italiano : mémorisé dans le navigateur, la page se recharge");
  assert(itBtn.getAttribute("aria-pressed") === "true", "Italiano coché après le clic");

  // ------------------------------------------------------------------
  // 3) Rechargement en italien
  // ------------------------------------------------------------------
  const dom2 = await openGame(html, baseUrl, w => { w.localStorage.setItem("hm-lang", "it"); w.localStorage.setItem("hm-i18n-debug", "1"); });
  const w2 = dom2.window, d2 = w2.document;
  assert(d2.documentElement.getAttribute("lang") === "it", "italien : <html lang=it> dès le chargement");
  assert(await waitFor(() => w2.HM_I18N_IT && w2.hmI18n.t("Tableau de bord") === "Panoramica"), "dictionnaire italien chargé");
  assert(!w2.HM_I18N_EN, "en italien, le dictionnaire anglais n'est pas téléchargé");
  assert(w2.hmI18n.getLang() === "it" && w2.hmI18n.locale === "it-IT", "hmI18n : langue it, locale it-IT");
  await sleep(100);
  const tab = k => d2.querySelector(`.tab-btn[data-tab=${k}]`);
  assert(/Panoramica/.test(tab("club").textContent) && /Rosa/.test(tab("effectif").textContent), "onglets Panoramica / Rosa");
  assert(/Ordini/.test(tab("ordres").textContent) && /Calendario/.test(tab("calendrier").textContent) && /Lega/.test(tab("ligue").textContent), "onglets Ordini / Calendario / Lega");

  tab("ordres").click();
  await sleep(150);
  const prep = d2.getElementById("prepSection");
  assert(prep && /Ordini partita/.test(prep.textContent) && !/Ordres de match/.test(prep.textContent), "page Ordres (rendue au clic) : « Ordini partita »");
  // Éditeur de tactique (retour testeur 2026-09-30, voir i18n_english_test).
  w2.eval("openTacticEditor(0)");
  await sleep(150);
  const tqBar = d2.getElementById("tqEditorBar").textContent;
  assert(/Parti da/.test(tqBar) && /Salva la tattica/.test(tqBar) && /Imposta tutto come negli Ordini/.test(tqBar), "barre de l'éditeur de tactique en italien");
  assert(!/Partir de|Réglages actuels|Enregistrer la tactique|Réglez tout/.test(tqBar), "plus de français dans l'éditeur de tactique (italien)");
  assert(/Elenco compatto/.test(prep.textContent), "effectif de la composition en italien");
  w2.eval("closeTacticEditor()");
  tab("ordres").click();
  await sleep(100);
  const search = d2.querySelector("input[placeholder]");
  assert(search && /Cerca/.test(search.getAttribute("placeholder")), "placeholder traduit : " + (search && search.getAttribute("placeholder")));

  // Dates et nombres (formatés par le jeu en "fr-FR") → it-IT.
  const dt = w2.eval("formatDateTimeFr(Date.UTC(2026, 8, 28, 9, 30))");
  assert(/^[Ll]unedì 28 settembre alle (ore )?\d\d:\d\d$/.test(dt), "dates du jeu en italien : " + dt);
  assert(w2.eval("(1234567).toLocaleString('fr-FR')") === "1.234.567", "nombres à l'italienne (1.234.567)");
  assert(w2.eval("POS_SHORT['Meneur'] + '/' + POS_SHORT['Ailier fort'] + '/' + POS_SHORT['Pivot']") === "PM/AG/C", "postes abrégés : Meneur → PM, Ailier fort → AG, Pivot → C");

  const t = w2.hmI18n.t;
  const live = t("Tir manqué d'Yanis Fournier. Rebond offensif de Sacha Camara.");
  assert(live === "Tiro sbagliato di Yanis Fournier. Rimbalzo offensivo di Sacha Camara.", "commentaire du direct (gabarit + élision) : " + live);
  assert(t("Journée 7") === "Giornata 7", "gabarit simple : Journée 7 → Giornata 7");
  assert(t("  Tableau de bord  ") === "  Panoramica  ", "espaces de bord conservés");
  assert(t("Léo Martin") === "Léo Martin", "un nom de joueur n'est pas touché");
  assert(t("Samedi 3 octobre · 15:00") === "Sabato 3 ottobre · 15:00", "date écrite en français → italien : " + t("Samedi 3 octobre · 15:00"));
  assert(t("Léo Martin (P, 29)") === "Léo Martin (C, 29)" && t("Léo Martin (M, 22)") === "Léo Martin (PM, 22)", "« (M, 22) » → « (PM, 22) »");
  // Cases isolées des tableaux : poste abrégé, J(oués)/D(éfaites), rang « 10<sup>e</sup> ».
  const probe = d2.createElement("table");
  probe.innerHTML = '<tr><th>J</th><th>D</th></tr><tr><td class="pos">AF</td><td>10<sup>e</sup></td></tr>';
  d2.body.appendChild(probe);
  await sleep(50);
  const cells = [...probe.querySelectorAll("th, td")].map(c => c.textContent).join(",");
  assert(cells === "G,S,AG,10º", "cases de tableau : J → G, D → S, AF → AG, 10e → 10º (" + cells + ")");
  probe.remove();
  assert(t("Poste : Meneur") === "Ruolo: Playmaker", "trou traduit + typographie italienne (pas d'espace avant « : ») : " + t("Poste : Meneur"));
  const half = t("Un texte inventé et une autre phrase qui n'existe pas");
  assert(!/ e una /.test(half), "pas de phrase à moitié traduite par un gabarit trop large");

  // ------------------------------------------------------------------
  // 4) Passage sur les onglets principaux
  // ------------------------------------------------------------------
  // Mots français qu'on ne doit plus voir (hors noms propres).
  const FRENCH = /\b(Tableau de bord|Effectif|Calendrier|Classement|Marché|Entraînement|Économie|Salle|Supporters|Ordres|Journée|Joueurs?|Équipe|Victoire|Défaite|Enchères?|Budget disponible|Semaine|Saison|Prochain match|Voir|Aucun|Aucune|Retour)\b/;
  const heads = [];
  const TABS = ["club", "effectif", "ordres", "tactiques", "entrainement", "calendrier", "ligue", "coupe", "marche", "staff", "economie", "salle", "personnalisation", "guide"];
  for (const k of TABS) {
    const b = tab(k);
    if (!b) continue;
    b.click();
    await sleep(200);
    const sec = [...d2.querySelectorAll("section, .tab-section, [id$=Section]")].find(s => s.offsetParent !== null || !s.classList.contains("hidden"));
    d2.querySelectorAll("h1, h2, h3, .section-title, .hm-page-title").forEach(h => {
      if (h.closest("[data-no-i18n]") || h.closest(".hidden")) return;
      const txt = h.textContent.replace(/\s+/g, " ").trim();
      if (txt && FRENCH.test(txt)) heads.push(k + " → " + txt);
    });
    void sec;
  }
  assert(heads.length === 0, "titres des onglets principaux traduits" + (heads.length ? " : " + heads.slice(0, 10).join(" | ") : ""));
  const nav = [...d2.querySelectorAll(".tab-btn")].map(b => b.textContent.trim()).join(" | ");
  assert(!/Tableau|Effectif|Calendrier|Économie|Entraînement|Académie|Marché|Personnalisation|Supporters/.test(nav), "barre de navigation entièrement en italien : " + nav);
  // Textes français non traduits vus pendant le passage (mode debug) :
  // seules des phrases françaises (mots-outils) comptent, pas les noms.
  const PROSE = /(^|\s)(le|la|les|des|du|un|une|et|est|pour|avec|sur|dans|vos|votre|ton|tes)(\s|$)/i;
  const left = [...(w2.hmI18n.missing || [])].filter(s => PROSE.test(s) && /[a-zà-ÿ]{3}/.test(s));
  if (left.length) console.log("ℹ️  textes français encore vus (" + left.length + ") :\n   " + left.slice(0, 30).join("\n   "));
  assert(left.length <= 5, `au plus 5 phrases françaises non traduites sur tous les onglets (${left.length})`);

  // Paramètres en italien : les noms de langue restent dans leur langue.
  tab("club").click();
  d2.querySelector("#sidebarSettingsBtn").click();
  await sleep(50);
  const ov2 = d2.getElementById("settingsModalOverlay");
  assert(/Impostazioni/.test(ov2.textContent) && /Lingua/.test(ov2.textContent), "fenêtre Paramètres en italien (Impostazioni / Lingua)");
  assert(/Français/.test(ov2.textContent) && /English/.test(ov2.textContent), "« Français » et « English » restent écrits dans leur langue");
  assert(ov2.querySelector('[data-lang-choice="it"]').getAttribute("aria-pressed") === "true", "Italiano coché");

  server.close();
  console.log("✅ Traduction italienne vérifiée.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
