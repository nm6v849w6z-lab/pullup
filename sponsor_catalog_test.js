// Catalogue des sponsors (retour utilisateur 2026-10-01 : noms fictifs +
// logos générés, ~30 par palier en français, ~20 par palier en anglais pour
// les clubs hors France / Belgique). Vérifie :
// A) le catalogue (tailles, noms uniques, icônes, couleurs, miroir du moteur
//    dans moteurbasket3.html) et le choix du catalogue selon le pays ;
// B) la migration des anciens noms au chargement d'une sauvegarde ;
// C) le navigateur : logos sur la page Sponsors (offres, contrats,
//    historique), maillot, salle ; jamais traduits ; secteurs dans les
//    9 dictionnaires.
const fs = require("fs");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const store = require("./server/store.js");
const { startTestServer, openGame } = require("./test_helpers.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");
function check(cond, msg) { if (!cond) throw new Error("❌ " + msg); console.log("✅ " + msg); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, tries = 100) { for (let i = 0; i < tries; i++) { try { const v = fn(); if (v) return v; } catch (e) { /* pas encore */ } await sleep(50); } throw new Error("❌ délai dépassé : " + label); }
const DAY = 24 * 3600 * 1000;

// Anciens noms (avant le catalogue) et leur palier.
const OLD = {
  local: ["Boulangerie Martin", "Garage Dupuis", "Pizzeria Da Marco", "Pharmacie du Centre", "Bar des Sports", "Auto-école Lefèvre", "Fleurs & Co", "Café de la Gare", "Menuiserie Roche", "Cycles Bertrand"],
  regional: ["Brasserie du Nord", "Banque Régionale", "Fromagerie Bel Air", "Transports Roux", "Immo Sud-Ouest", "Énergie Plateau", "Coopérative Val d'Or", "Radio Horizon"],
  national: ["Volt Énergie", "Nexo Télécom", "Atlas Assurances", "Mistral Airlines", "Kilo Sport", "Orion Banque", "Nova Boissons", "Zenith Auto"],
};

(async () => {
  // --- A : catalogue.
  const C = Engine.SPONSOR_CATALOG;
  const count = (lang, tier) => C.filter(s => s.lang === lang && s.tier === tier).length;
  check(["local", "regional", "national"].every(t => count("fr", t) >= 28 && count("fr", t) <= 32), `catalogue français : ~30 par palier (${["local", "regional", "national"].map(t => count("fr", t)).join(" / ")})`);
  check(["local", "regional", "national"].every(t => count("en", t) >= 18 && count("en", t) <= 22), `catalogue anglais : ~20 par palier (${["local", "regional", "national"].map(t => count("en", t)).join(" / ")})`);
  check(new Set(C.map(s => s.name)).size === C.length, "noms uniques (les deux catalogues confondus)");
  check(C.every(s => Engine.SPONSOR_ICONS[s.icon] && /currentColor/.test(Engine.SPONSOR_ICONS[s.icon])), "chaque icône existe et suit la couleur (currentColor)");
  check(C.every(s => /^#[0-9a-f]{6}$/i.test(s.bg) && /^#[0-9a-f]{6}$/i.test(s.ink) && s.bg.toLowerCase() !== s.ink.toLowerCase()), "couleurs [fond, encre] valides et distinctes");
  check(C.every(s => ["badge", "tile", "word"].includes(s.shape) && s.short && s.short.length <= 12 && s.sector), "forme, nom court (≤ 12) et secteur renseignés");
  check(C.filter(s => s.tier === "national").every(s => s.shape === "word"), "marques nationales en logotype");
  check(["local", "regional", "national"].every(t => Engine.SPONSOR_NAMES[t].length === count("fr", t) && Engine.SPONSOR_NAMES_EN[t].length === count("en", t)), "SPONSOR_NAMES / SPONSOR_NAMES_EN dérivés du catalogue");
  const block = s => s.slice(s.indexOf("const SPONSOR_ICONS = {"), s.indexOf("function migrateSponsorList"));
  check(block(fs.readFileSync("engine.js", "utf-8")) === block(html), "catalogue identique dans engine.js et son miroir moteurbasket3.html");
  check(Engine.sponsorCatalogLangFor("fr") === "fr" && Engine.sponsorCatalogLangFor("be") === "fr" && Engine.sponsorCatalogLangFor(undefined) === "fr", "France, Belgique et pays inconnu : catalogue français");
  check(["us", "it", "es", "de", "gr", "lt", "pl", "pt", "ch", "br", "ar", "ca", "cn", "hk", "tw"].every(c => Engine.sponsorCatalogLangFor(c) === "en"), "tous les autres pays : catalogue anglais");

  // Offres selon le pays du championnat.
  const T0 = Calendar.parisEpochForLocalTime(2026, 10, 1, 9);
  const offersFor = (country) => {
    const lg = Engine.generateLeague(Engine.generateStartingRoster("Pays " + (country || "x")), 1, T0);
    if (country) lg.country = country; else delete lg.country;
    const t = lg.teams[0]; t.isHuman = true; t.sponsorReputation = 80;
    if (country) t.country = country;
    const all = [];
    for (let i = 0; i < 6; i++) { t.sponsorOffers = []; t.lastSponsorOfferAt = 0; all.push(...Engine.refreshSponsorOffers(t, lg, T0 + i * 4 * DAY)); }
    return all;
  };
  const inLang = (offers, lang) => offers.length > 0 && offers.every(o => { const e = Engine.sponsorCatalogEntry(o.sponsorName); return e && e.lang === lang && e.tier === o.tier; });
  check(inLang(offersFor("fr"), "fr"), "club français : offres de marques du catalogue français, du bon palier");
  check(inLang(offersFor("be"), "fr"), "club belge : catalogue français");
  check(inLang(offersFor("it"), "en"), "club italien : offres de marques à nom anglais");
  check(inLang(offersFor("us"), "en"), "club américain : offres de marques à nom anglais");
  check(inLang(offersFor(null), "fr"), "pays inconnu : catalogue français par défaut");

  // --- B : migration des anciens noms au chargement.
  Object.entries(OLD).forEach(([tier, list]) => list.forEach(n => {
    const m = Engine.migrateSponsorName(n), e = Engine.sponsorCatalogEntry(m);
    if (!e || e.tier !== tier || e.lang !== "fr") throw new Error(`❌ ${n} → ${m} : pas un sponsor français du palier ${tier}`);
  }));
  check(true, "chaque ancien nom correspond à un sponsor français du même palier");
  check(Engine.migrateSponsorName("Volt Énergie") === "Voltéo" && Engine.migrateSponsorName("Radio Horizon") === "Swish FM" && Engine.migrateSponsorName("Kilo Sport") === "Kilo Sport" && Engine.migrateSponsorName("Inconnu SARL") === "Inconnu SARL", "correspondances attendues (Volt Énergie → Voltéo, Radio Horizon → Swish FM, Kilo Sport inchangé, nom inconnu gardé)");

  const names = ["Alpha CAT", "Bravo CAT"];
  const multi = Engine.generateMultiManagerLeague(names, names.length, T0, Calendar.dailyAnchoredCalendarConfig());
  const hIdx = multi.teams.findIndex(t => t.isHuman);
  const team = multi.teams[hIdx];
  team.sponsorReputation = 50;
  Engine.refreshSponsorOffers(team, multi, T0);
  const pick = slot => team.sponsorOffers.find(o => o.slot === slot);
  const jersey = pick("maillot"), salle = pick("salle"), panneau = pick("panneau");
  Engine.acceptSponsorOffer(team, multi, jersey.id, T0);
  Engine.acceptSponsorOffer(team, multi, salle.id, T0);
  team.sponsorContracts.find(c => c.slot === "maillot").sponsorName = "Garage Dupuis";
  team.sponsorContracts.find(c => c.slot === "salle").sponsorName = "Transports Roux";
  team.sponsorOffers.forEach((o, i) => { o.sponsorName = ["Boulangerie Martin", "Café de la Gare"][i % 2]; o.tier = "local"; o.expiresAt = T0 + 30 * DAY; });
  team.sponsorHistory = [{ ...team.sponsorContracts[0], id: "spc_old", sponsorName: "Volt Énergie", status: "completed", reputationDelta: 6 }];
  const raw = JSON.parse(JSON.stringify(Engine.serializeLeague(multi)));
  const rebuilt = Engine.leagueFromSave(raw).teams[hIdx];
  const allNames = t => [...t.sponsorOffers, ...t.sponsorContracts, ...t.sponsorHistory].map(x => x.sponsorName);
  check(allNames(rebuilt).every(n => Engine.sponsorCatalogEntry(n)), "après chargement : offres, contrats et historique n'ont plus que des noms du catalogue");
  check(rebuilt.sponsorContracts.find(c => c.slot === "maillot").sponsorName === "Garage Turbo" && rebuilt.sponsorContracts.find(c => c.slot === "salle").sponsorName === "Roulez Transports" && rebuilt.sponsorHistory[0].sponsorName === "Voltéo", "Garage Dupuis → Garage Turbo, Transports Roux → Roulez Transports, Volt Énergie → Voltéo");
  check(rebuilt.sponsorOffers.length === 2 && rebuilt.sponsorOffers.every(o => ["Le Fournil d'Or", "Café du Parquet"].includes(o.sponsorName)), "offres en cours migrées (Le Fournil d'Or, Café du Parquet)");

  // --- C : navigateur (sauvegarde AVEC les anciens noms, migrée par le serveur au chargement).
  let now = T0;
  const { server, multiSavePath, baseUrl } = await startTestServer(() => now);
  await store.saveMultiLeague(multi, multiSavePath);
  const token = team.managerLinkToken;
  const dom = await openGame(html, `${baseUrl}?m=${token}`);
  const doc = dom.window.document, win = dom.window;
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "sponsors").click();
  const section = doc.getElementById("economieSponsors");
  await waitFor(() => section.querySelector(".spl"), "logos sur la page Sponsors");
  const txt = section.textContent;
  check(!/Garage Dupuis|Transports Roux|Volt Énergie|Boulangerie Martin|Café de la Gare/.test(txt), "page Sponsors : plus aucun ancien nom");
  check(section.querySelectorAll(".spo-offer .spl").length === 2 && [...section.querySelectorAll(".spo-offer .spl-name")].every(n => ["Le Fournil d'Or", "Café du Parquet"].includes(n.textContent)), "offres : logo du sponsor (icône + nom)");
  const offerLogo = section.querySelector(".spo-offer .spl");
  check(offerLogo.querySelector("svg path, svg circle, svg rect") && /--spl-bg:#/.test(offerLogo.getAttribute("style")), "logo d'offre : icône SVG et couleurs de la marque");
  check(/Boulangerie|Café/.test(section.querySelector(".spo-offer .spo-meta").textContent), "offres : secteur d'activité affiché");
  const jerseySvg = section.querySelector(".spo-jersey svg");
  check(jerseySvg && jerseySvg.querySelector('rect[fill="#1d2533"]') && /TURBO/.test(jerseySvg.textContent) && jerseySvg.querySelector("svg"), "maillot : bandeau aux couleurs de Garage Turbo, icône + nom court");
  check([...section.querySelectorAll(".spo-contract-id .spo-contract-txt .spl-name")].map(n => n.textContent).sort().join("|") === "Garage Turbo|Roulez Transports", "contrats en cours : logos Garage Turbo et Roulez Transports");
  check(section.querySelector(".spl-mark"), "contrat hors maillot : carré du logo à la place des initiales");
  check(section.querySelector(".spo-history .spl-compact .spl-name").textContent === "Voltéo", "historique : logo compact de Voltéo");
  check([...section.querySelectorAll(".spl")].every(el => el.hasAttribute("data-no-i18n")), "logos marqués data-no-i18n (noms de marque jamais traduits)");
  const fallback = win.eval('sponsorLogoHtml("Quincaillerie Inconnue", { size: "compact" })');
  check(/spl-initials/.test(fallback) && /QI/.test(fallback) && /hsl\(/.test(fallback), "nom inconnu : initiales sur une couleur tirée du nom");

  // Salle : sponsor peint sur le mur aux couleurs de la marque, avec l'icône.
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "salle").click();
  const card = await waitFor(() => doc.getElementById("arenaVisualCard"), "salle");
  await waitFor(() => /ROULEZ TRANSPORTS/.test(card.textContent), "panneau de la salle");
  check(card.innerHTML.includes('fill="#f59e0b"') && card.innerHTML.includes('color="#1f2937"'), "salle : panneau aux couleurs de Roulez Transports, icône dessinée");

  // Vue live : couleurs du sponsor salle transmises.
  const st = win.eval(`(() => { hmLive = { match: { isHome: true, pregame: true, kickoffAt: Date.now() + 60000 }, dress: undefined, events: [], shots: [], fouls: [], raw: [], quarter: 1, final: false }; teamB = league.teams.find((t, i) => i !== myTeamIndex); const s = hmLiveBuildState(); return s.arenaSponsorStyle; })()`);
  check(st && st.bg === "#f59e0b" && st.ink === "#1f2937", "vue live : couleurs du sponsor salle transmises (arenaSponsorStyle)");
  dom.window.close();

  // i18n : aucun nom de marque dans les dictionnaires, secteurs traduits partout.
  const langs = ["en", "it", "es", "pt", "de", "pl", "el", "lt", "zh"];
  const sectors = [...new Set(C.map(s => s.sector))];
  langs.forEach(l => {
    global.window = {};
    const f = require.resolve(`./assets/i18n/${l}.js`);
    delete require.cache[f]; require(f);
    const d = global.window[`HM_I18N_${l.toUpperCase()}`];
    const brandKeys = C.filter(s => Object.prototype.hasOwnProperty.call(d, s.name)).map(s => s.name);
    const oldKeys = Object.values(OLD).flat().filter(n => Object.prototype.hasOwnProperty.call(d, n));
    const missing = sectors.filter(s => !Object.prototype.hasOwnProperty.call(d, s));
    if (brandKeys.length || oldKeys.length || missing.length) throw new Error(`❌ ${l}.js : marques ${brandKeys} / anciens noms ${oldKeys} / secteurs manquants ${missing}`);
  });
  delete global.window;
  check(true, "dictionnaires : aucun nom de marque (ancien ou nouveau), tous les secteurs traduits dans les 9 langues");

  server.close();
  console.log("\n✅ sponsor_catalog_test.js : tout est vert");
})().catch(e => { console.error(e); process.exit(1); });
