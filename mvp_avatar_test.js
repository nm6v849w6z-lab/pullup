// Vérifie l'avatar du joueur MVP sur les box scores (retour utilisateur,
// 2026-09 : "ajoute l'avatar du joueur MVP sur les box scores", capture
// d'écran de l'encart "MVP du match" au-dessus d'une feuille de
// statistiques). Voir matchMvpCalloutHtml/boxscoreMatchMvp dans
// moteurbasket3.html — le champ `id` (additif) ajouté aux lignes de box
// score (buildBoxScore côté moteur, boxscoreRowsFromMatchLog côté client)
// est ce qui permet de retrouver le VRAI Player (donc son avatar procédural,
// voir playerAvatarHtml/AvatarGen) depuis une simple ligne de statistiques.
// Couvre les DEUX endroits où l'encart "MVP du match" existe : la feuille
// de stats FINALE d'un match qui vient de se jouer (#boxscoreMvpHolder,
// renderBoxScore) et celle d'un match déjà passé rouverte depuis le
// Calendrier (#matchBoxscoreMvpHolder, showMatchBoxscore) — voir
// calendrier_boxscore_test.js/live_boxscore_test.js pour les mêmes
// scénarios de base, sans l'avatar.
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar, readRawSave, patchDateNow } = require("./test_helpers.js");
const { scheduledTimeForRound, MATCH_BROADCAST_DURATION_MS } = require("./server/calendar.js");
const html = fs.readFileSync("moteurbasket3.html", "utf-8");

// AvatarGen (voir son grand commentaire, moteurbasket3.html) incrémente un
// compteur MODULE-LEVEL (`UID`) pour générer des ids SVG uniques sur la
// page (gradients/clip-paths : `hd123`, `eye124`, `mo125`, `bs126`,
// `tx127` (texture peau/maillot/barbe), `arm128` (tatouages de bras)...) à
// CHAQUE rendu — deux appels de playerAvatarHtml pour le MÊME joueur
// produisent donc un SVG visuellement identique mais textuellement
// différent (ids différents), confirmé en isolant generateAppearance
// (déterministe, JSON identique à seed égal) de renderAvatar (les seuls ids
// bougent). On neutralise ces ids avant de comparer deux rendus, pour
// vérifier le VRAI joueur sans dépendre d'un compteur global qui avance à
// chaque appel. Liste tenue à jour avec les préfixes `${++UID}` du
// générateur (2026-09-23 : ajout de `tx`/`arm` lors de l'intégration de la
// version étendue d'avatar-generator.js — texture de peau/maillot/barbe et
// tatouages de bras).
function normalizeAvatarHtml(s) {
  return s.replace(/(hd|eye|mo|bs|tx|arm)\d+/g, "$1X");
}

(async () => {

// ---------------------------------------------------------------------
// Partie 1 : feuille de stats d'un match déjà passé (onglet Calendrier).
// ---------------------------------------------------------------------
{
  const { server, savePath, baseUrl } = await startTestServer();
  const domInit = await openGame(html, baseUrl);
  await flush(domInit);
  await domInit.window.close();
  fastForwardCalendar(savePath, 1);
  const dom = await openGame(html, baseUrl);
  const doc = dom.window.document;
  const win = dom.window;
  doc.getElementById("catchupContinueBtn").click();
  [...doc.querySelectorAll(".tab-btn")].find(b => b.dataset.tab === "calendrier").click();

  const scoreBtn = doc.querySelector("#calendrierContent .calendar-score-btn");
  if (!scoreBtn) throw new Error("❌ (setup) Aucun score cliquable après une journée jouée.");
  scoreBtn.click();

  const mvpHolder = doc.getElementById("matchBoxscoreMvpHolder");
  if (!mvpHolder) throw new Error("❌ #matchBoxscoreMvpHolder introuvable.");
  const body = mvpHolder.querySelector(".mvp-callout-body");
  if (!body) throw new Error("❌ L'encart MVP devrait avoir un conteneur .mvp-callout-body (nom + avatar).");
  const avatarEl = body.querySelector(".player-avatar");
  if (!avatarEl) throw new Error("❌ Un avatar (.player-avatar) devrait être affiché à côté du nom du MVP.");
  if (!avatarEl.querySelector("svg")) throw new Error("❌ L'avatar du MVP devrait contenir un <svg> généré (voir AvatarGen).");
  console.log("✅ Un avatar est bien affiché dans l'encart MVP de la feuille de stats d'un match passé.");

  // Vérification FORTE : l'avatar affiché correspond EXACTEMENT (même HTML)
  // à celui du VRAI joueur MVP, régénéré indépendamment côté moteur avec
  // les couleurs de SON club — pas un avatar générique ni celui d'un autre
  // joueur.
  const mvpName = mvpHolder.querySelector(".mvp-callout-body b").textContent;
  const expectedAvatarHtml = win.eval(`
    (function() {
      const state = matchBoxscoreState;
      const mvp = boxscoreMatchMvp(state.rowsHome, state.rowsAway);
      const team = mvp.side === "A" ? state.teamHome : state.teamAway;
      const player = team.players.find(p => p.id === mvp.row.id);
      const rawHtml = playerAvatarHtml(player, team, 44);
      // Round-trip par le DOM (même sérialisation que .outerHTML côté
      // affiché) : sinon une balise SVG auto-fermante dans la chaîne brute
      // ne correspond jamais textuellement à sa forme restituée par le DOM,
      // alors que c'est exactement le même élément.
      const tmp = document.createElement("div");
      tmp.innerHTML = rawHtml;
      return { name: mvp.row.name, html: tmp.firstElementChild.outerHTML };
    })()
  `);
  if (mvpName !== expectedAvatarHtml.name) {
    throw new Error(`❌ (setup) Nom du MVP affiché ("${mvpName}") ne correspond pas au MVP recalculé ("${expectedAvatarHtml.name}").`);
  }
  if (normalizeAvatarHtml(avatarEl.outerHTML) !== normalizeAvatarHtml(expectedAvatarHtml.html)) {
    throw new Error(`❌ L'avatar affiché ne correspond pas à celui régénéré pour le vrai joueur MVP (${mvpName}) avec les couleurs de son club.`);
  }
  console.log(`✅ L'avatar affiché correspond bien à celui du vrai joueur MVP ("${mvpName}"), couleurs de club incluses.`);

  // Sanity check : normalizeAvatarHtml ne doit PAS être si permissive
  // qu'elle rendrait deux avatars DIFFÉRENTS indistinguables (auquel cas la
  // vérification ci-dessus serait vide de sens) — comparée à l'avatar d'un
  // AUTRE joueur de la même équipe, la normalisation doit encore les
  // distinguer.
  const otherPlayerAvatarHtml = win.eval(`
    (function() {
      const state = matchBoxscoreState;
      const mvp = boxscoreMatchMvp(state.rowsHome, state.rowsAway);
      const team = mvp.side === "A" ? state.teamHome : state.teamAway;
      const other = team.players.find(p => p.id !== mvp.row.id);
      return other ? playerAvatarHtml(other, team, 44) : null;
    })()
  `);
  if (otherPlayerAvatarHtml && normalizeAvatarHtml(avatarEl.outerHTML) === normalizeAvatarHtml(otherPlayerAvatarHtml)) {
    throw new Error("❌ (sanity) L'avatar du MVP et celui d'un autre joueur de la même équipe ne devraient normalement pas être identiques après normalisation — la comparaison serait vide de sens.");
  }
  console.log("✅ (sanity) La normalisation ne masque pas une vraie différence : l'avatar d'un autre joueur reste bien distinct.");

  // La ligne du tableau (Joueur/Poste/...) ne doit PAS avoir gagné de
  // colonne parasite : `id` est un champ de DONNÉES sur la ligne, jamais
  // rendu comme colonne à part (voir BOXSCORE_COLS, liste explicite).
  const headers = [...doc.querySelectorAll("#matchBoxscoreHolder table.boxscore thead th")].map(th => th.textContent.trim());
  if (headers.includes("id") || headers.includes("Id") || headers.includes("ID")) {
    throw new Error(`❌ Le champ id ne devrait jamais apparaître comme colonne du tableau — en-têtes : ${headers.join(", ")}`);
  }
  console.log("✅ Le nouveau champ `id` (données) n'apparaît pas comme colonne parasite dans le tableau.");

  await flush(dom);
  dom.window.close();
  server.close();
}

// ---------------------------------------------------------------------
// Partie 2 : feuille de stats FINALE d'un match qui vient de se jouer
// (fin du direct, renderBoxScore) — même principe que live_boxscore_test.js
// pour atteindre finishPlayback().
// ---------------------------------------------------------------------
{
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
  const doc = dom.window.document;
  const win = dom.window;

  win.eval("finishPlayback()");

  const mvpHolder = doc.getElementById("boxscoreMvpHolder");
  if (!mvpHolder) throw new Error("❌ #boxscoreMvpHolder introuvable.");
  const avatarEl = mvpHolder.querySelector(".mvp-callout-body .player-avatar");
  if (!avatarEl) throw new Error("❌ Un avatar devrait être affiché dans l'encart MVP de la feuille de stats finale d'un match qui vient de se jouer.");
  if (!avatarEl.querySelector("svg")) throw new Error("❌ L'avatar du MVP (match qui vient de se jouer) devrait contenir un <svg> généré.");

  const expectedAvatarHtml = win.eval(`
    (function() {
      const mvp = boxscoreMatchMvp(matchResult.boxScoreA, matchResult.boxScoreB);
      const team = mvp.side === "A" ? teamA : teamB;
      const player = team.players.find(p => p.id === mvp.row.id);
      const rawHtml = playerAvatarHtml(player, team, 44);
      // Round-trip par le DOM (même raison que la partie 1 ci-dessus).
      const tmp = document.createElement("div");
      tmp.innerHTML = rawHtml;
      return { name: mvp.row.name, html: tmp.firstElementChild.outerHTML };
    })()
  `);
  const mvpName = mvpHolder.querySelector(".mvp-callout-body b").textContent;
  if (normalizeAvatarHtml(avatarEl.outerHTML) !== normalizeAvatarHtml(expectedAvatarHtml.html)) {
    throw new Error(`❌ L'avatar affiché (fin de direct) ne correspond pas à celui régénéré pour le vrai joueur MVP (${mvpName}).`);
  }
  console.log(`✅ L'avatar du MVP est aussi correct sur la feuille de stats finale d'un match qui vient de se jouer ("${mvpName}").`);

  await flush(dom);
  await dom.window.close();
  server.close();
}

console.log("\n✅ Avatar du joueur MVP vérifié sur les deux box scores (match qui vient de se jouer et match déjà passé rouvert depuis le Calendrier) : présent, correct (même joueur, mêmes couleurs de club), aucune colonne parasite.");
})().catch(err => {
  console.error(err);
  process.exit(1);
});
