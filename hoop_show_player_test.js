// Lecteur d'émission Hoop Shows (assets/hoop-shows/showPlayer.js) habillé
// « esprit du jeu » — retours utilisateur 2026-09-26 : « mets un vrai petit
// avatar pour le journaliste » / « pour l'avatar, pioche dans ceux qu'on a
// pour les joueurs », « reprends le logo hoop manager plutot qu'un fait
// maison », « reprends l'esprit de la DA des autres pages du jeu »,
// « pourquoi il n'y a qu'une question dans le prono ? ».
// Vérifie sur de VRAIES émissions (server/shows.js sur une ligue engine.js)
// que le lecteur utilise les écussons, avatars, logo et présentateur fournis
// par le jeu, et que la mi-temps propose plusieurs pronostics même quand ton
// match est le seul diffusé en direct.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const Engine = require("./engine.js");
const Calendar = require("./server/calendar.js");
const LiveMatch = require("./server/liveMatch.js");
const Shows = require("./server/shows.js");

function fail(msg) { throw new Error("❌ " + msg); }

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

// --- 1) plusieurs pronostics à la mi-temps, même avec un seul match en direct
{
  const q = halftime.pronostics.questions;
  if (q.length < 3) fail(`au moins 3 pronostics attendus à la mi-temps (ton match seul en direct), obtenu ${q.length}.`);
  const kinds = q.map(x => x.kind);
  ["secondHalfWinner", "totalPoints"].forEach(k => { if (!kinds.includes(k)) fail(`pronostic « ${k} » attendu sur ton match.`); });
  if (!kinds.includes("matchWinner") && !kinds.includes("margin")) fail("pronostic vainqueur OU écart attendu sur ton match.");
  if (new Set(q.map(x => x.id)).size !== q.length) fail("ids de questions en double.");
  const mine = halftime.segments.find(s => s.type === "myMatch");
  q.forEach(x => { if (x.matchId !== mine.matchId) fail("les questions ajoutées doivent porter sur ton match."); });
  if (halftime.segments.some(s => s.type === "multiplex")) fail("pas de multiplex quand ton match est le seul connu à la pause (doublon « 1 matchs »).");
  console.log(`✅ Mi-temps : ${q.length} pronostics sur ton match, plus de multiplex à un seul match.`);
}

// --- 2) lecteur habillé par le jeu
const dom = new JSDOM("<!doctype html><div id=m></div>", { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
dom.window.eval(fs.readFileSync(path.join(__dirname, "assets/hoop-shows/showPlayer.js"), "utf8"));
const HSP = dom.window.HoopShowPlayer;
const calls = { team: new Set(), player: new Set() };
const dress = {
  logo: "data:image/png;base64,LOGO",
  presenter: '<svg data-test="presenter"></svg>',
  team: (id) => { calls.team.add(id); return { logo: (s) => `<svg data-test="crest-${id}" width="${s}"></svg>`, color: "#000000", altColor: "#ffffff" }; },
  player: (id) => { calls.player.add(id); return `<svg data-test="av-${id}"></svg>`; },
};
function mountAt(show, i) {
  const el = dom.window.document.getElementById("m");
  const p = HSP.mount(el, show, Object.assign({}, dress, { now: () => Date.now(), onAd: () => new Promise(() => {}) }));
  p.goTo(i);
  const html = el.innerHTML;
  p.destroy();
  return { html, el };
}
{
  const { html } = mountAt(halftime, 0);
  if (!html.includes("Nicolas Cosset · présentateur")) fail("le présentateur s'appelle Nicolas Cosset.");
  if (!html.includes('data-test="presenter"')) fail("l'avatar du présentateur fourni par le jeu doit remplacer le dessin fait maison.");
  if (!html.includes('class="hs-logo" src="data:image/png;base64,LOGO"')) fail("le logo Hoop Manager du jeu doit être utilisé (générique + bandeau du bas).");
  if ((html.match(/class="hs-logo"/g) || []).length < 2) fail("logo attendu au générique ET dans « Présenté par ».");
  if (html.includes('data-hs-action="prev"') || /Précédent/.test(html)) fail("plus de bouton « Précédent » dans les émissions.");
  console.log("✅ Présentateur et logo Hoop Manager fournis par le jeu.");
}
{
  const i = halftime.segments.findIndex(s => s.type === "myMatch");
  const seg = halftime.segments[i];
  const { html } = mountAt(halftime, i);
  if (!html.includes(`data-test="crest-${seg.home.id}"`) || !html.includes(`data-test="crest-${seg.away.id}"`)) fail("écussons des deux clubs attendus dans le bandeau.");
  if (!html.includes("hs-board")) fail("bandeau façon « Prochain match » attendu.");
  if (!/Mon club/.test(html)) fail("badge « Mon club » attendu.");
  if (seg.bestPlayer && !html.includes(`data-test="av-${seg.bestPlayer.id}"`)) fail("avatar du meilleur joueur attendu.");
  // Deux maillots identiques (#000000) : l'extérieur passe en maillot extérieur, le noir est éclairci.
  if (!/--hs-stripe1:#ffffff/.test(html)) fail("même couleur de maillot : l'équipe à l'extérieur doit passer en maillot extérieur.");
  if (/--hs-home:#000000/.test(html)) fail("un maillot noir doit être éclairci pour rester lisible.");
  console.log("✅ Ton match : bandeau du jeu, écussons, couleurs de maillot lisibles, avatar du meilleur joueur.");
}
{
  const i = halftime.segments.findIndex(s => s.type === "pronostics");
  const n = halftime.segments[i].questions.length;
  const { html } = mountAt(halftime, i);
  if (!html.includes(`Question 1/${n}`) || !html.includes(`Question ${n}/${n}`)) fail("numérotation des questions attendue.");
  if (!html.includes(`Valider 0/${n}`)) fail("compteur de réponses sur le bouton Valider attendu.");
  console.log("✅ Pronostics : questions numérotées, compteur de réponses.");
}
{
  // Classement : plus de badge « Mon club » (retour utilisateur, 2026-09-26 :
  // « enleve mon club dans l'avant match et show de la mi temps dans le
  // classement ») — la ligne reste mise en évidence (hs-row-mine).
  [halftime, prematch].forEach(show => {
    const i = show.segments.findIndex(s => s.type === "table");
    const { html } = mountAt(show, i);
    const row = /<tr class="hs-row-mine">[\s\S]*?<\/tr>/.exec(html);
    if (!row) fail("ligne de mon club attendue (mise en évidence) dans le classement.");
    if (/Mon club/.test(row[0])) fail("plus de badge « Mon club » dans le classement des émissions.");
  });
  console.log("✅ Classement des émissions : ligne de mon club mise en évidence, sans badge « Mon club ».");
}
{
  const i = prematch.segments.findIndex(s => s.type === "lineups");
  const seg = prematch.segments[i];
  const mineSide = seg.home.isMine ? seg.home : seg.away;
  const { html } = mountAt(prematch, i);
  mineSide.players.forEach(p => { if (!html.includes(`data-test="av-${p.id}"`)) fail(`avatar attendu pour ${p.name} dans les compos.`); });
  const d = prematch.segments.findIndex(s => s.type === "duel");
  const dseg = prematch.segments[d];
  const dh = mountAt(prematch, d).html;
  if (!dh.includes(`data-test="av-${dseg.home.id}"`) || !dh.includes(`data-test="av-${dseg.away.id}"`)) fail("avatars attendus dans le duel.");
  console.log("✅ Avant-match : avatars des joueurs dans les compos et le duel.");
}
{
  // Sans habillage (autre intégration) : replis propres, aucune erreur.
  const el = dom.window.document.getElementById("m");
  halftime.segments.forEach((s, i) => { const p = HSP.mount(el, halftime, { onAd: () => new Promise(() => {}) }); p.goTo(i); p.destroy(); });
  console.log("✅ Lecteur sans habillage : replis (initiales, dessin par défaut) sans erreur.");
}
console.log("✅ Tous les tests du lecteur d'émission sont passés.");
process.exit(0);
