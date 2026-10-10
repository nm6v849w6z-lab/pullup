// Terrain 2D v2 (2026-09-30, style BuzzerBeater) côté client : l'adaptateur
// (hmLiveBuildState) doit fournir au terrain la PROCHAINE action du fil
// (`nextAction`, calée sur son airAt) sans dévoiler son résultat, des
// événements horodatés (airAt) avec des acteurs identifiés par la même clé
// que players[].id (« clé:#id »), et les commentaires du présentateur
// (Nicolas Cosset) dans le fil. Reconnexion à mi-diffusion comme
// live_boxscore_test.js.
const fs = require("fs");
const { startTestServer, openGame, flush, readRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = require("./test_game_html.js").readGameHtml();
function fail(msg) { throw new Error("❌ " + msg); }

(async () => {
const clock = { now: Date.now() };
const { server, savePath, baseUrl } = await startTestServer(() => clock.now);
let dom = await openGame(html, baseUrl);
patchDateNow(dom.window, () => clock.now);
await flush(dom);
const saved = readRawSave(savePath);
const scheduledAt = scheduledTimeForRound(saved.league.calendarStartAt, saved.league.round);
await dom.window.close();

clock.now = scheduledAt + Math.round(MATCH_BROADCAST_DURATION_MS / 2);
dom = await openGame(html, baseUrl, (window) => patchDateNow(window, () => clock.now));
await flush(dom);
const w = dom.window;
const hm = w.eval("hmLive");
if (!hm || !hm.match) fail("hmLive doit être initialisé à mi-diffusion.");
const S = w.eval("hmLiveBuildState()");

// 1. Événements horodatés, acteurs identifiés comme players[].id.
const ids = new Set(S.teams.flatMap(t => t.players.map(p => p.id)));
const withActors = S.events.filter(e => e.actors && Object.values(e.actors).some(Boolean));
if (!withActors.length) fail("des événements avec acteurs sont attendus à mi-match.");
for (const e of withActors) {
  if (!(e.airAt > 0)) fail(`chaque événement du fil doit porter son airAt (événement #${e.id}).`);
  for (const [role, id] of Object.entries(e.actors)) {
    if (id && !ids.has(id)) fail(`acteur ${role}=${id} inconnu de players[].id (attendu « clé:#id »).`);
  }
}
if (!withActors.some(e => /:#\d+$/.test(e.actors.shooter || e.actors.player || ""))) fail("les acteurs doivent être identifiés par l'id du joueur (« A:#12 »), pas par son nom.");
console.log(`✅ ${withActors.length} événements horodatés, acteurs identifiés par « clé:#id » et tous présents dans players[].`);

// 2. Prochaine action : dans le futur, sans résultat.
const na = S.nextAction;
if (!na) fail("nextAction attendue pendant le direct.");
if (!(na.airAt > clock.now)) fail("nextAction.airAt doit être dans le futur.");
const lastAir = Math.max(...S.events.map(e => e.airAt || 0));
if (!(na.airAt > lastAir)) fail("nextAction doit suivre le dernier événement diffusé.");
if ("made" in na || "text" in na || "score" in na) fail("nextAction ne doit pas dévoiler le résultat (made/text/score).");
if (!na.kind) fail("nextAction.kind attendu.");
if (na.actors) for (const id of Object.values(na.actors)) if (id && !ids.has(id)) fail(`acteur de nextAction inconnu : ${id}.`);
const raw = hm.match.events.find(e => e.airAt === na.airAt);
if (!raw || raw.type !== na.kind) fail("nextAction doit correspondre au prochain événement de la timeline.");
if (na.shot) {
  // Même endroit que celui qui sera journalisé à l'arrivée de l'événement
  // (graine = identité de l'événement, mission live 2026-10-10 : jamais
  // l'heure de diffusion, décalée en rediffusion).
  const zone = raw.zone === "inside" ? "paint" : raw.zone;
  const t = na.kind === "rebound" ? (raw.offensive ? na.team : 1 - na.team) : na.team;
  const p = w.eval("hmLiveShotSpot")(zone, t, w.eval("hmLiveEventSeed")(raw), raw.spot);
  if (Math.abs(p.x - na.shot.x) > 1e-9 || Math.abs(p.y - na.shot.y) > 1e-9) fail("l'endroit du tir de nextAction doit être celui qui sera journalisé (graine de l'événement).");
}
console.log(`✅ nextAction = ${na.kind} à +${Math.round((na.airAt - clock.now) / 1000)} s, sans résultat, acteurs valides.`);

// 2b. Faits de possession (moteur 2026-10-07) : chaîne de passes réelle,
// type de tir, qualité, durée — présents sur les tirs, jamais le résultat.
const shots = S.events.filter(e => e.kind === "shot" || e.kind === "rebound");
if (!shots.length) fail("des tirs sont attendus à mi-match.");
for (const e of shots) {
  if (!Array.isArray(e.passes) || !e.passes.length) fail(`chaque tir doit porter sa chaîne de passes réelle (événement #${e.id}).`);
  if (e.passes[e.passes.length - 1] !== e.actors.shooter) fail("la chaîne de passes doit finir par le tireur.");
  for (const id of e.passes) if (!ids.has(id)) fail(`passeur inconnu dans la chaîne : ${id}.`);
  if (!["three", "jumper", "layup", "fastbreak", "post", "floater"].includes(e.shotType)) fail(`type de tir inattendu : ${e.shotType}.`);
  if (!["ouvert", "contesté", "très contesté"].includes(e.quality)) fail(`qualité inattendue : ${e.quality}.`);
  if (!(e.possLen > 0 && e.possLen <= 24.5)) fail(`durée de possession invalide : ${e.possLen}.`);
  // (un tir contré porte son contreur ; depuis la mission live 2026-10-10 il
  // n'hérite plus du « défenseur » du contexte, lu comme une faute sur tir)
  if (!e.actors.defender && !e.actors.blocker) fail("le défenseur du tir doit être identifié.");
}
const chainLens = shots.map(e => e.passes.length);
// Le moteur désigne toujours un créateur distinct du tireur : 2 joueurs
// (créateur = porteur) ou 3 (porteur → créateur → tireur, ou passe et va).
if (!chainLens.every(n => n >= 2 && n <= 3)) fail(`chaînes de passes attendues de 2 ou 3 joueurs, obtenu ${[...new Set(chainLens)]}.`);
if (!chainLens.some(n => n === 3)) fail("on attend au moins une possession à deux passes.");
console.log(`✅ ${shots.length} tirs avec chaîne de passes réelle (1 à ${Math.max(...chainLens)} joueurs), type, qualité, durée, défenseur.`);
if (na.kind === "shot" || na.kind === "rebound") {
  if (!na.passes || !na.shotType || !na.quality) fail("nextAction doit porter passes / shotType / quality.");
}
// Deltas : la feuille en direct vient du moteur (somme des points = score).
const sumPts = S.teams.map(t => t.players.reduce((s, p) => s + (p.pts || 0), 0));
if (sumPts[0] !== S.teams[0].score || sumPts[1] !== S.teams[1].score) fail(`la feuille (deltas moteur) doit sommer au score : ${sumPts} vs ${S.teams.map(t => t.score)}.`);
if (!hm.match.events.some(e => e.delta)) fail("les événements doivent porter les deltas de statistiques du moteur.");
console.log("✅ Feuille de match alimentée par les deltas du moteur, cohérente avec le score.");

// 3. Commentaires du présentateur : au moins le coup d'envoi, jamais dans la vue terrain.
const quotes = S.events.filter(e => e.type === "quote");
if (!quotes.length) fail("au moins un commentaire du présentateur attendu (coup d'envoi).");
if (!quotes.every(q => q.speaker === "Nicolas Cosset" && q.text)) fail("chaque commentaire doit porter speaker = Nicolas Cosset et un texte.");
const first = S.events.findIndex(e => e.type === "quote");
const q1 = S.events.find(e => e.type === "period");
if (q1 && S.events.indexOf(q1) > first) fail("le premier commentaire doit suivre le début du match, pas le précéder.");
console.log(`✅ ${quotes.length} commentaire(s) de Nicolas Cosset dans le fil.`);

// 3b. Possession (audit possession live 2026-10-07) : le direct de son club
// expose la possession du moteur — possessionAfter du dernier événement
// diffusé —, chaque action porte possessionTeam (pendant) et possessionAfter
// (après), et la prochaine action est jouée par l'équipe qui a le ballon.
{
  const evs = hm.match.events;
  let last = -1; evs.forEach((e, i) => { if (e.airAt <= clock.now) last = i; });
  const expected = w.eval("livePossessionAt")(evs, last);
  const idx = k => w.eval("hmLiveIdx")(k);
  w.eval("updateLiveClockTick && updateLiveClockTick()");
  const P = w.eval("hmLiveBuildState()");
  if (P.possession !== idx(expected)) fail(`possession du direct de son club : ${P.possession}, moteur : ${expected} (${idx(expected)}).`);
  const plays = P.events.filter(e => ["shot", "rebound", "turnover", "foul", "freeThrow"].includes(e.kind));
  if (!plays.length || !plays.every(e => (e.possessionTeam === 0 || e.possessionTeam === 1) && (e.possessionAfter === 0 || e.possessionAfter === 1))) fail("chaque action doit porter possessionTeam et possessionAfter.");
  const lastPlay = plays[plays.length - 1];
  if (lastPlay.possessionAfter !== P.possession) fail("la possession du direct doit être celle laissée par la dernière action.");
  if (P.nextAction && P.nextAction.possessionTeam != null && P.nextAction.possessionTeam !== P.possession) fail(`la prochaine action (${P.nextAction.kind}) doit être jouée par l'équipe en possession (${P.nextAction.possessionTeam} ≠ ${P.possession}).`);
  console.log(`✅ Possession du direct de son club = moteur (${expected}) ; ${plays.length} actions avec possession pendant / après ; prochaine action jouée par l'équipe qui a le ballon.`);
}

// 4. Fin du direct : plus de nextAction, commentaire final.
w.eval("finishPlayback()");
await flush(dom);
const F = w.eval("hmLiveBuildState()");
if (F.nextAction) fail("plus de nextAction une fois le match terminé.");
if (!F.events.some(e => e.type === "quote" && /Fin du match|terminé/.test(e.text))) fail("un commentaire de fin de match est attendu.");
console.log("✅ Fin du direct : plus d'action à venir, commentaire final du présentateur.");

await dom.window.close();
server.close();
console.log("\n✅ Terrain 2D v2 côté client vérifié : événements horodatés et acteurs par id, prochaine action sans spoiler, commentaires du présentateur.");
})().catch(err => { console.error(err); process.exit(1); });
