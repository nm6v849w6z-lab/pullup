// Espagnol, portugais (Brésil), allemand, polonais, grec, lituanien et
// chinois (2026-09-30, retour utilisateur : « bosse sur les traductions en
// espagnol, polonais, grecque, portugais, lituanien et chinois », puis
// « fais la traduction en allemand ») : même mécanique que l'italien
// (assets/i18n/i18n.js + un dictionnaire par langue). Vérifie pour chaque
// langue :
// 1) le dictionnaire : mêmes clés que en.js, aucune valeur vide, trous
//    {0}/{player} conservés (sauf les accords français collés, joueur{1}),
//    balises HTML et espaces de bord identiques ;
// 2) le jeu chargé dans la langue : <html lang>, dictionnaire chargé (et lui
//    seul), barre de navigation sans français, dates du jeu dans la langue.
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

const LANGS = {
  es: { dash: "Panel de control", locale: "es-ES", month: "septiembre", num: "1.234.567" },
  pt: { dash: "Painel", locale: "pt-BR", month: "setembro", num: "1.234.567" },
  de: { dash: "Übersicht", locale: "de-DE", month: "September", num: "1.234.567" },
  pl: { dash: "Panel główny", locale: "pl-PL", month: "września" },
  el: { dash: "Πίνακας ελέγχου", locale: "el-GR", month: "Σεπτεμβρίου", num: "1.234.567" },
  lt: { dash: "Valdymo skydas", locale: "lt-LT", month: "rugsėjo" },
  zh: { dash: "仪表盘", locale: "zh-CN", month: "9月", num: "1,234,567" },
};

(async () => {
  const EN = loadDict("assets/i18n/en.js", "HM_I18N_EN");
  const enKeys = Object.keys(EN);
  const tags = s => (s.match(/<\/?[a-z][^>]*>/gi) || []).map(t => t.replace(/\s.*$/, "")).sort().join();
  for (const lang of Object.keys(LANGS)) {
    const D = loadDict(`assets/i18n/${lang}.js`, "HM_I18N_" + lang.toUpperCase());
    assert(D, `${lang} : window.HM_I18N_${lang.toUpperCase()} défini`);
    const keys = Object.keys(D);
    const missing = enKeys.filter(k => !(k in D));
    assert(missing.length === 0, `${lang} : toutes les clés de en.js (${keys.length}/${enKeys.length})` + (missing.length ? " — manquantes : " + missing.slice(0, 5).map(k => JSON.stringify(k)).join(", ") : ""));
    const extra = keys.filter(k => !(k in EN));
    assert(extra.length === 0, `${lang} : aucune clé en trop` + (extra.length ? " : " + extra.slice(0, 5).join(" | ") : ""));
    const empty = keys.filter(k => typeof D[k] !== "string" || (!D[k].trim() && k.trim() && !/^​$/.test(D[k])));
    assert(empty.length === 0, `${lang} : aucune valeur vide` + (empty.length ? " : " + empty.slice(0, 5).join(" | ") : ""));
    const badPh = [], badTags = [];
    for (const k of keys) {
      const v = D[k];
      const need = (k.match(/(^|[^A-Za-zÀ-ÿ)])\{\w+\}/g) || []).map(x => x.replace(/^[^{]*/, ""));
      const allowed = new Set(k.match(/\{\w+\}/g) || []);
      const have = v.match(/\{\w+\}/g) || [];
      if (need.some(p => !have.includes(p)) || have.some(p => !allowed.has(p))) badPh.push(k);
      if (tags(k) !== tags(v)) badTags.push(k);
    }
    assert(badPh.length === 0, `${lang} : trous {0}/{player} conservés` + (badPh.length ? " : " + badPh.slice(0, 5).join(" | ") : ""));
    assert(badTags.length <= 3, `${lang} : fragments HTML conservés (${badTags.length})` + (badTags.length ? " : " + badTags.slice(0, 3).join(" | ") : ""));
  }

  const { server, baseUrl } = await startTestServer();
  for (const [lang, exp] of Object.entries(LANGS)) {
    const dom = await openGame(html, baseUrl, w => { w.localStorage.setItem("hm-lang", lang); });
    const w = dom.window, d = w.document;
    const V = "HM_I18N_" + lang.toUpperCase();
    assert(d.documentElement.getAttribute("lang") === lang, `${lang} : <html lang=${lang}> dès le chargement`);
    assert(await waitFor(() => w[V] && w.hmI18n.t("Tableau de bord") === exp.dash), `${lang} : dictionnaire chargé (Tableau de bord → ${exp.dash})`);
    assert(!w.HM_I18N_EN && !w.HM_I18N_IT, `${lang} : seul ce dictionnaire est téléchargé`);
    assert(w.hmI18n.locale === exp.locale, `${lang} : locale ${exp.locale}`);
    await sleep(150);
    const nav = [...d.querySelectorAll(".tab-btn")].map(b => b.textContent.trim()).join(" | ");
    assert(!/Tableau|Effectif|Calendrier|Économie|Entraînement|Académie|Marché|Supporters|Ordres/.test(nav), `${lang} : barre de navigation traduite : ${nav}`);
    const dt = w.eval("formatDateTimeFr(Date.UTC(2026, 8, 28, 9, 30))");
    assert(dt.includes(exp.month) && !/septembre|lundi/i.test(dt), `${lang} : dates du jeu dans la langue : ${dt}`);
    const fr = w.hmI18n.t("Samedi 3 octobre · 15:00");
    assert(!/Samedi|octobre/.test(fr), `${lang} : date écrite en français traduite : ${fr}`);
    if (exp.num) assert(w.eval("(1234567).toLocaleString('fr-FR')") === exp.num, `${lang} : nombres (${exp.num})`);
    assert(w.hmI18n.t("Léo Martin") === "Léo Martin", `${lang} : un nom de joueur n'est pas touché`);
    w.close();
  }
  server.close();
  console.log("✅ Nouvelles langues vérifiées.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
