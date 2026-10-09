// Émissions sans défilement (retour utilisateur) : l'émission se comporte
// comme une image TV — scène à taille fixe 1200×720 mise à l'échelle de
// l'écran (letterbox), mise en page verticale dédiée sur téléphone en
// portrait étroit, « Ton meilleur joueur » dans la bande basse du bandeau,
// carte des tirs à la hauteur restante de son panneau. Vérifié aussi :
// l'encart « présenté par » (réservé à l'annonceur) est intact, le bouton
// « Voir l'émission » disparaît une fois l'émission vue, 4 pronostics max.
// Rendu réel vérifié à part dans Chromium (Playwright) aux tailles 1440×900,
// 1280×720, 1024×640, 844×390 et 390×844.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const LiveMatch = require("./server/liveMatch.js");
const Shows = require("./server/shows.js");

function fail(msg) { throw new Error("❌ " + msg); }
const near = (a, b) => Math.abs(a - b) < 1e-6;

const dom = new JSDOM("<!doctype html><div id=m></div>", { pretendToBeVisual: true, runScripts: "outside-only" });
const win = dom.window;
win.eval(fs.readFileSync(path.join(__dirname, "assets/hoop-shows/showPlayer.js"), "utf8"));
const HSP = win.HoopShowPlayer;

// --- 1) calcul de l'échelle
{
  if (HSP.DESIGN_W !== 1200 || HSP.DESIGN_H !== 720) fail("taille de conception attendue : 1200×720.");
  if (HSP.PORTRAIT_MIN_SCALE !== 0.5) fail("seuil du mode portrait attendu à 0,5.");
  const cases = [
    // [largeur, hauteur, mode, échelle attendue]
    [1440, 900, "tv", 1.2],
    [1280, 720, "tv", 1],
    [1024, 640, "tv", 1024 / 1200],
    [844, 390, "tv", 390 / 720],
    [390, 844, "portrait", 1],
    [568, 320, "tv", 320 / 720], // paysage minuscule : on garde l'image TV
    [3840, 2160, "tv", HSP.MAX_SCALE], // très grand écran : plafonné
  ];
  for (const [w, h, mode, scale] of cases) {
    const f = HSP.fitStage(w, h);
    if (f.mode !== mode) fail(`${w}×${h} : mode ${mode} attendu, obtenu ${f.mode}.`);
    if (!near(f.scale, scale)) fail(`${w}×${h} : échelle ${scale} attendue, obtenu ${f.scale}.`);
    if (mode === "tv") {
      if (f.width > w + 1e-6 || f.height > h + 1e-6) fail(`${w}×${h} : l'image TV dépasse l'écran (${f.width}×${f.height}).`);
      if (!near(f.width / f.height, 1200 / 720)) fail(`${w}×${h} : proportions 1200×720 non conservées.`);
      if (!near(f.left, (w - f.width) / 2) || !near(f.top, (h - f.height) / 2)) fail(`${w}×${h} : image non centrée.`);
    } else if (f.width !== w || f.height !== h) fail(`${w}×${h} : le mode portrait occupe tout l'écran.`);
  }
  const z = HSP.fitStage(0, 0);
  if (z.mode !== "tv" || z.scale !== 1) fail("sans mise en page (jsdom, conteneur masqué) : taille de conception.");
  console.log("✅ Échelle : min(l/1200, h/720), centrée, plafonnée ; portrait sous 0,5 uniquement en hauteur > largeur.");
}

// --- émissions réelles (même préparation que hoop_show_player_test.js)
const league = Engine.generateLeague(Engine.generateStartingRoster("Test FC"));
const kickoffAt = Calendar.scheduledTimeForLeagueRound(league, 0);
const fx = league.matchesForRound(0).find(m => m.home === 0 || m.away === 0);
const prematch = Shows.getPrematchShow(league, 0, 0, kickoffAt - 60000);
league.liveMatches = {};
const lm = LiveMatch.computeLiveMatch(Engine, league, 0, fx.home, fx.away, kickoffAt, "championship");
league.liveMatches[LiveMatch.liveMatchKey(0, fx.home, fx.away, "championship")] = lm;
const half = lm.pauses.find(p => p.kind === "halftime");
const halftime = Shows.getHalftimeShow(league, 0, 0, half.airAt + 1000);
if (!halftime) fail("émission de mi-temps attendue pendant la pause.");
const dress = {
  sponsorLogo: "assets/brand/logo-hoop-manager-premium.png",
  team: (id) => ({ logo: (s) => `<svg data-test="crest-${id}" width="${s}"></svg>`, color: "#F26B1D" }),
  player: (id) => `<svg data-test="av-${id}"></svg>`,
  now: () => Date.now(), onAd: () => new Promise(() => {}),
};
const el = win.document.getElementById("m");

// --- 2) cadre TV : balisage, mise à l'échelle posée en JS, écoute du redimensionnement
{
  const added = [], removed = [];
  const oa = win.addEventListener.bind(win), or = win.removeEventListener.bind(win);
  win.addEventListener = (t, f, o) => { added.push(t); return oa(t, f, o); };
  win.removeEventListener = (t, f, o) => { removed.push(t); return or(t, f, o); };
  const p = HSP.mount(el, halftime, dress);
  const root = el.querySelector(".hs-root");
  const frame = root.querySelector(":scope > .hs-frame[data-hs-frame]");
  if (!frame) fail("la scène doit être enveloppée dans un cadre .hs-frame (mis à l'échelle d'un bloc).");
  ["header.hs-top", "main.hs-stage", "footer.hs-bottom"].forEach(s => { if (!frame.querySelector(":scope > " + s)) fail(`${s} doit être dans le cadre TV.`); });
  if (root.getAttribute("data-hs-mode") !== "tv") fail("mode TV par défaut.");
  ["resize", "orientationchange"].forEach(t => { if (!added.includes(t)) fail(`échelle à recalculer sur « ${t} ».`); });

  // Écran simulé : 1024×640 puis téléphone en portrait 390×844.
  const setSize = (w, h) => {
    Object.defineProperty(root, "clientWidth", { configurable: true, get: () => w });
    Object.defineProperty(root, "clientHeight", { configurable: true, get: () => h });
    win.dispatchEvent(new win.Event("resize"));
  };
  setSize(1024, 640);
  const s = 1024 / 1200;
  if (!/scale\(0\.853/.test(frame.style.transform) || !/translate\(0px,\s*13px\)/.test(frame.style.transform)) fail(`transform attendu translate(0px,13px) scale(${s}), obtenu « ${frame.style.transform} ».`);
  if (root.style.getPropertyValue("--hs-scale") !== "0.853") fail("--hs-scale attendu à 0.853.");
  setSize(390, 844);
  if (root.getAttribute("data-hs-mode") !== "portrait" || !root.classList.contains("hs-portrait")) fail("téléphone en portrait : mise en page verticale attendue.");
  if (frame.style.transform) fail("mode portrait : pas de mise à l'échelle.");
  setSize(844, 390);
  if (root.getAttribute("data-hs-mode") !== "tv" || root.classList.contains("hs-portrait")) fail("rotation en paysage : retour à l'image TV.");
  p.destroy();
  ["resize", "orientationchange"].forEach(t => { if (!removed.includes(t)) fail(`« ${t} » doit être désabonné à la fermeture.`); });
  win.addEventListener = oa; win.removeEventListener = or;
  console.log("✅ Cadre TV : scène enveloppée, échelle recalculée au redimensionnement/à la rotation, portrait sur téléphone, écouteurs retirés.");
}

// --- 3) « Ton meilleur joueur » dans la bande basse, carte des tirs à la hauteur restante
{
  const i = halftime.segments.findIndex(s => s.type === "myMatch");
  const seg = halftime.segments[i];
  if (!seg.bestPlayer) fail("meilleur joueur attendu dans « Ton match ».");
  const p = HSP.mount(el, halftime, dress);
  p.goTo(i);
  const band = el.querySelector(".hs-board .hs-board-bottom .hs-bottom-band");
  if (!band) fail("bande basse attendue dans le bas du bandeau.");
  if (!band.querySelector(".hs-qt")) fail("le tableau des quarts reste dans la bande basse.");
  const lt = band.querySelector(".hs-lower-third[data-hs-lower-third]");
  if (!lt) fail("« Ton meilleur joueur » doit être dans la bande basse (lower third).");
  if (lt.querySelector(".hs-lt-kicker").textContent !== "Ton meilleur joueur") fail("titre « Ton meilleur joueur » attendu.");
  if (lt.querySelector(".hs-lt-name").textContent !== seg.bestPlayer.name) fail("nom du meilleur joueur attendu dans la bande basse.");
  if (lt.querySelector(".hs-lt-line").textContent !== seg.bestPlayer.line) fail("ligne de stats du meilleur joueur attendue.");
  if (!lt.querySelector(`[data-test="av-${seg.bestPlayer.id}"]`)) fail("avatar du meilleur joueur attendu dans la bande basse.");
  if (el.querySelectorAll(".hs-best, .hs-lower-third").length !== 1) fail("« Ton meilleur joueur » affiché une seule fois (plus de carte à part).");
  const grid = el.querySelector(".hs-grid-court");
  if (!grid.classList.contains("hs-fill")) fail("la grille carte des tirs / faits marquants prend la hauteur restante.");
  const svg = el.querySelector(".hs-court-card .hs-court-wrap svg.hs-court");
  if (!svg || svg.getAttribute("preserveAspectRatio") !== "xMidYMid meet") fail("carte des tirs en « meet » (jamais déformée).");
  if (svg.hasAttribute("height") || svg.hasAttribute("style")) fail("pas de hauteur fixe sur la carte des tirs.");
  p.destroy();
  console.log("✅ Ton match : meilleur joueur en bande basse du bandeau, carte des tirs à la hauteur restante.");
}

// --- 4) feuille de style : pas de débordement, pas de tailles dépendant de l'écran
{
  const css = fs.readFileSync(path.join(__dirname, "assets/hoop-shows/showPlayer.css"), "utf8");
  const rule = (sel) => {
    const re = new RegExp("(^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}");
    const m = re.exec(css);
    if (!m) fail(`règle ${sel} absente.`);
    return m[2];
  };
  const root = rule(".hs-root");
  if (/min-width|min-height/.test(root)) fail(".hs-root ne doit plus imposer de taille minimale (source du défilement).");
  if (!/overflow:\s*hidden/.test(root)) fail(".hs-root : overflow hidden.");
  const frame = rule(".hs-frame");
  if (!/width:\s*1200px/.test(frame) || !/height:\s*720px/.test(frame) || !/transform-origin:\s*0 0/.test(frame)) fail(".hs-frame : scène 1200×720, origine en haut à gauche.");
  if (!/overflow:\s*hidden/.test(rule(".hs-stage"))) fail("la rubrique ne défile pas dans l'image TV.");
  if (/\d\s*v[wh]\b/.test(css)) fail("aucune taille en vw/vh dans le cadre TV (la scène est mise à l'échelle d'un bloc).");
  const wrap = rule(".hs-court-wrap");
  if (!/flex:\s*1 1 0/.test(wrap) || /(^|;)\s*height:\s*\d/.test(wrap)) fail("la carte des tirs prend la hauteur restante, sans hauteur fixe.");
  if (!/position:\s*absolute/.test(rule(".hs-court")) || !/height:\s*100%/.test(rule(".hs-court"))) fail("SVG de la carte des tirs à 100 % de son panneau.");
  const portraitStage = rule(".hs-portrait .hs-stage");
  if (!/overflow-y:\s*auto/.test(portraitStage) || !/overflow-x:\s*hidden/.test(portraitStage)) fail("portrait : défilement vertical de la rubrique seulement.");
  if (!/grid-template-columns:\s*minmax\(0, 1fr\)/.test(css.slice(css.indexOf(".hs-portrait .hs-grid-2")))) fail("portrait : grilles sur une colonne.");
  console.log("✅ Feuille de style : scène 1200×720 sans taille minimale ni vw/vh, rubrique sans défilement, portrait en une colonne.");
}

// --- 5) encart « présenté par » intact (réservé à l'annonceur)
{
  [prematch, halftime].forEach(show => {
    const p = HSP.mount(el, show, dress);
    p.goTo(0);
    const html = el.innerHTML;
    if (!/<span>PRÉSENTÉ PAR<\/span><span class="hs-sponsor-big hs-sponsor-has-img"><img class="hs-logo hs-sponsor-img" src="assets\/brand\/logo-hoop-manager-premium.png"/.test(html)) fail("générique : encart « PRÉSENTÉ PAR » + logo sponsor attendu.");
    if (!/<div class="hs-presented-small"><span>Présenté par<\/span><span class="hs-sponsor-small hs-sponsor-has-img"><img class="hs-logo hs-sponsor-img" src="assets\/brand\/logo-hoop-manager-premium.png"/.test(html)) fail("barre du bas : « Présenté par » + logo sponsor attendu.");
    p.destroy();
  });
  console.log("✅ Encart « présenté par » inchangé (générique et barre du bas).");
}

// --- 6) intégration dans le jeu : page figée pendant l'émission, encoches, acquis conservés
{
  const html = require("./test_game_html.js").readGameHtml();
  const sec = html.match(/#hoopShowSection\{position:fixed;[^}]*\}/);
  if (!sec || !/env\(safe-area-inset-left/.test(sec[0]) || !/env\(safe-area-inset-right/.test(sec[0])) fail("iPhone en paysage : encoches gauche/droite réservées.");
  if (!/html\.hoop-show-open, html\.hoop-show-open body\{overflow:hidden;/.test(html)) fail("la page du jeu ne doit plus défiler sous l'émission.");
  if (!/html\.hoop-show-open\{scrollbar-gutter:auto;\}/.test(html)) fail("pas de gouttière de barre de défilement pendant l'émission.");
  const open = html.slice(html.indexOf("async function openHoopShow("), html.indexOf("function hoopShowDressOpts("));
  if (!/classList\.add\("hoop-show-open"\)/.test(open)) fail("openHoopShow doit figer la page.");
  const close = html.slice(html.indexOf("function closeHoopShow("), html.indexOf("function hoopShowOnAd("));
  if (!/classList\.remove\("hoop-show-open"\)/.test(close)) fail("closeHoopShow doit libérer la page.");
  if (!/hoopShowMarkHalftimeSeen\(\)/.test(close)) fail("l'émission de mi-temps doit être notée « vue » à la fermeture.");
  if (!/pause\.kind === "halftime" && !hoopShowHalftimeSeen\(\)/.test(html)) fail("le bouton « Voir l'émission » doit disparaître une fois l'émission vue.");
  const data = fs.readFileSync(path.join(__dirname, "server/shows/showData.js"), "utf8");
  if (!/const MAX_QUESTIONS = 4;/.test(data)) fail("4 pronostics maximum à la mi-temps.");
  if (halftime.pronostics.questions.length > 4) fail(`au plus 4 pronostics à la mi-temps, obtenu ${halftime.pronostics.questions.length}.`);
  console.log("✅ Jeu : page figée pendant l'émission, encoches réservées, « Voir l'émission » masqué une fois vu, 4 pronostics max.");
}

console.log("\n🏁 Émissions sans défilement : tous les tests sont passés.");
