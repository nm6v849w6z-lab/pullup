// =====================================================================
// SERVEUR — retour utilisateur (2026-09) : "jusqu'à 10 vrais managers
// humains dans une ligue partagée à la fois, le reste comblé par des
// adversaires CPU" (le reste de la pyramide n'est pas simulé). Portée de
// CETTE étape : l'architecture multi-manager elle-même (identité par jeton
// privé, ligue partagée, diffusions en direct simultanées) — PAS le nouveau
// calendrier à horaires fixes ni une vraie compétition de Coupe (une étape
// suivante, une fois celle-ci posée).
//
// DEUX modes, choisis PAR REQUÊTE, uniquement par la présence d'un jeton
// `X-TipIn-Token` (voir getManagerToken/resolvePlayerContext plus bas) :
//   - AUCUN jeton : comportement HISTORIQUE inchangé — un seul manager
//     humain (teams[0]) dans server/data/league.json (voir
//     store.defaultSavePath), EXACTEMENT comme avant ce chantier. C'est la
//     carrière solo réelle d'Antony (jamais touchée par ce travail) et
//     c'est aussi ce que continue d'exercer toute la suite de tests
//     existante (aucune ne parle de jeton) — zéro régression par
//     construction : ces requêtes ne passent JAMAIS par le nouveau code
//     multi-manager.
//   - Un jeton : ligue PARTAGÉE (server/data/multi-league.json, voir
//     store.defaultMultiLeaguePath), l'équipe résolue via
//     store.resolveManagerTeam — 404 si aucune ligue partagée n'existe
//     encore (voir /api/admin/new-multi-league), 401 si le jeton ne
//     correspond à personne.
// Les DEUX modes partagent tout le reste (buildStateSnapshot, tick,
// actions.js, server/liveMatch.js/autoSim.js) : ce n'est PAS une deuxième
// implémentation parallèle, juste un aiguillage sur QUEL fichier de
// sauvegarde et QUEL index d'équipe une requête donnée doit utiliser — voir
// resolvePlayerContext. C'est ce même aiguillage qui garantit qu'aucune
// route ne peut jamais faire fuiter ou écraser les données de l'AUTRE mode.
//
// Aucune dépendance externe (Express, etc.) : juste `http`, le module
// natif de Node, pour rester simple à auditer et à faire tourner n'importe
// où sans étape d'installation.
// =====================================================================
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const store = require("./store.js");
const AutoSim = require("./autoSim.js");
const Calendar = require("./calendar.js");
const LiveMatch = require("./liveMatch.js");
const { scheduledTimeForLeagueRound } = Calendar;
const actions = require("./actions.js");
const Scouting = require("./scouting.js");
const Shows = require("./shows.js");

// MODE ACCÉLÉRÉ (tests/démo) — voir le commentaire détaillé dans
// server/calendar.js. Activé en lançant le serveur avec la variable
// d'environnement BASKET_FAST_CALENDAR=1 ; jamais activé par défaut, ne
// s'applique qu'aux NOUVELLES ligues générées à partir de maintenant
// (nouvelle carrière solo, ou nouvelle ligue multi-manager via l'API admin)
// — une ligue déjà en cours garde le rythme qu'elle a déjà.
if (process.env.BASKET_FAST_CALENDAR === "1") {
  Calendar.setFastTestMode(true);
}

const DEFAULT_PORT = process.env.PORT || 4000;
const MAX_BODY_BYTES = 1024 * 1024; // 1 Mo — largement suffisant pour une feuille de match/des tactiques, évite un corps de requête sans fin d'écrouler le serveur.

// ---------------------------------------------------------------------
// Assets statiques (visuels de la Salle, voir arenaImageUrl côté HTML) :
// jusqu'ici le serveur ne servait QUE la page elle-même et des routes JSON,
// aucun fichier statique — un simple dossier server/../assets, servi par
// une route dédiée plutôt qu'un module externe (retour utilisateur 2026-09,
// "récupère les visuels là pour les intégrer" : remplacement du dessin SVG
// de la salle par de vraies images). Liste blanche d'extensions + résolution
// realpath vérifiée sous ASSETS_DIR (pas juste un .. dans l'URL bloqué :
// aussi les liens symboliques) pour empêcher toute traversée de
// répertoire — donc AUCUNE dépendance à express.static, juste `fs`/`path`.
// ---------------------------------------------------------------------
const ASSETS_DIR = path.join(__dirname, "..", "assets");
// Extensions "hoop-shows" (émissions avant-match/mi-temps, voir DEV_NOTES.md
// point 11) ajoutées au même mécanisme générique — assets/hoop-shows/ sert le
// lecteur (showPlayer.js/.css) et la police Exo 2 auto-hébergée (fonts/*),
// jamais de logique nouvelle : même liste blanche par extension, même
// résolution realpath sous ASSETS_DIR ci-dessous.
const ASSET_CONTENT_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

function serveAsset(res, pathname) {
  const relative = pathname.replace(/^\/assets\//, "");
  const contentType = ASSET_CONTENT_TYPES[path.extname(relative).toLowerCase()];
  if (!contentType) { sendJson(res, 404, { error: "Type de fichier non servi" }); return; }
  const resolved = path.resolve(ASSETS_DIR, relative);
  // path.relative ne remonte jamais hors d'ASSETS_DIR pour un chemin sain ;
  // "traite/.." reste malgré tout un chemin relatif qui commence par ".."
  // une fois sorti — c'est exactement ce qu'on rejette ici.
  if (path.relative(ASSETS_DIR, resolved).startsWith("..")) { sendJson(res, 403, { error: "Chemin invalide" }); return; }
  fs.readFile(resolved, (err, data) => {
    if (err) { sendJson(res, 404, { error: "Fichier introuvable" }); return; }
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": data.length,
      "Cache-Control": "public, max-age=86400",
    });
    res.end(data);
  });
}

// La page elle-même : servie depuis ICI, et relue à chaque requête (pas de
// cache) — reste vrai quel que soit le mode (solo ou multi-manager) ni la
// présence d'un `?m=<jeton>` dans l'URL : la route "/" ne dépend jamais de
// la query string (voir moteurbasket3.html, qui lit `location.search`
// lui-même une fois chargé), donc aucun changement de routage ici.
const HTML_PATH = path.join(__dirname, "..", "moteurbasket3.html");

function serveIndexHtml(res) {
  let html;
  try {
    html = fs.readFileSync(HTML_PATH, "utf-8");
  } catch (e) {
    sendJson(res, 500, { error: `Impossible de lire moteurbasket3.html : ${e.message}` });
    return;
  }
  const body = Buffer.from(html, "utf-8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}

// Lit et parse le corps JSON d'une requête POST. Rejette (via l'erreur) un
// corps trop volumineux ou du JSON invalide plutôt que de planter le
// serveur — chaque route appelante décide ensuite du code HTTP à renvoyer.
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Corps de requête trop volumineux."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch (e) {
        reject(new Error("JSON invalide."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// ---------------------------------------------------------------------
// Identité manager (voir en-tête de fichier) — le jeton privé voyage dans un
// en-tête HTTP dédié (X-TipIn-Token) plutôt que dans l'URL de chaque requête
// : le lien privé lui-même (`?m=<jeton>`) ne sert qu'à faire entrer CE
// jeton dans le navigateur une première fois (voir moteurbasket3.html, qui
// le persiste ensuite en localStorage et l'attache à chaque fetch()).
// ---------------------------------------------------------------------
function getManagerToken(req) {
  const header = req.headers["x-tipin-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  return null;
}

// Résout, pour CETTE requête, {ok:true, league, teamIndex, isMulti,
// savePath} ou {ok:false, status, error} — le point d'entrée UNIQUE par
// lequel TOUTES les routes joueur (/api/state, /api/save, /api/lineup, ...)
// déterminent sur quelle ligue et quelle équipe agir. Voir le grand
// commentaire en tête de fichier pour le détail des deux modes.
// `async` (voir server/store.js — load/save/loadMultiLeague/saveMultiLeague
// sont désormais toutes des fonctions asynchrones, pour offrir la MÊME
// interface qu'on écrive sur disque localement ou sur Redis/Upstash en
// ligne) : tous les appelants ci-dessous `await`ent déjà cette fonction.
async function resolvePlayerContext(req, legacySavePath, multiSavePath, now) {
  const token = getManagerToken(req);
  if (!token) {
    const state = await store.loadOrCreate(legacySavePath, now);
    return { ok: true, league: state.league, teamIndex: 0, isMulti: false, savePath: legacySavePath };
  }
  const multi = await store.loadMultiLeague(multiSavePath);
  if (!multi) {
    return { ok: false, status: 404, error: "Aucune ligue multi-manager n'existe encore (voir /api/admin/new-multi-league)." };
  }
  const resolved = store.resolveManagerTeam(multi.league, token);
  if (!resolved) {
    return { ok: false, status: 401, error: "Jeton de manager inconnu ou invalide." };
  }
  return { ok: true, league: multi.league, teamIndex: resolved.teamIndex, isMulti: true, savePath: multiSavePath };
}

// `async` — voir resolvePlayerContext juste au-dessus, même raison.
async function persistContext(ctx) {
  if (ctx.isMulti) {
    await store.saveMultiLeague(ctx.league, ctx.savePath);
    return;
  }
  // Confort historique (mode solo UNIQUEMENT) : contrairement au mode
  // multi-manager (où stocker un `liveMatch` résolu pour UN destinataire sur
  // l'objet ligue PARTAGÉ serait ambigu — lequel des N managers ?), le solo
  // n'a jamais qu'UN SEUL match en direct pertinent (teams[0]) — on le
  // reflète aussi sur l'objet ligue persisté (pas seulement dans la réponse
  // HTTP, voir /api/save), pour rester fidèle à la forme historique de
  // server/data/league.json que d'anciens outils/tests peuvent inspecter
  // directement.
  ctx.league.liveMatch = LiveMatch.viewLiveMatchForTeam(ctx.league, 0);
  await store.save(ctx.league.teams[0], ctx.league, ctx.savePath);
}

// Rattrape la ligue jusqu'à `now` (matchs dus, entraînement hebdomadaire,
// marché...) — voir server/autoSim.js:catchUpLeague — et démarre toute
// diffusion en direct due (voir server/autoSim.js:ensureLiveMatch). C'est le
// point de passage obligé de chaque requête joueur : on ne compte pas sur un
// cron qui tournerait en permanence, on rattrape à chaque accès. Ne persiste
// PAS lui-même (voir `changed` dans le résultat) — c'est à l'appelant de
// décider, puisqu'il connaît le bon fichier/la bonne forme de sauvegarde
// pour CE contexte (solo ou multi-manager, voir persistContext).
//
// BUG corrigé (2026-09, retour utilisateur Discord : "Sur la page staff,
// reset des enchères et du temps à chaque refresh de la page") : `changed`
// se basait UNIQUEMENT sur `events`/`startedKeys`/`prunedAny`, mais
// catchUpLeague appelle aussi INCONDITIONNELLEMENT (à chaque tick, voir son
// commentaire) League.refreshMarket/refreshCoachMarket/refreshAnalystMarket
// (et refreshRecruiterMarket depuis ce même correctif), qui GÉNÈRENT de
// nouveaux candidats, font enchérir les CPU et résolvent les enchères
// échues, sans jamais pousser quoi que ce soit dans `events`. Résultat :
// une requête en lecture seule (/api/state, /api/save) qui ne faisait QUE
// rafraîchir un marché de staff (le cas le plus courant) voyait `changed`
// rester `false`, donc jamais persistée : le prochain chargement de page
// repartait du MÊME fichier non modifié et régénérait un tout AUTRE lot de
// candidats/enchères/échéances, qui semblait donc "se réinitialiser" à
// chaque refresh alors que le serveur avait bien calculé quelque chose,
// juste jamais sauvegardé. Ces 3 (4) rafraîchissements de marché tournant
// SANS EXCEPTION à chaque appel de catchUpLeague, la seule persistance
// fiable est de toujours considérer la ligue comme modifiée après un tick :
// coûte une écriture disque de plus par requête (fichier JSON minuscule),
// largement acceptable pour la correction que ça garantit.
function tick(league, now) {
  AutoSim.ensureLiveMatch(league, now);
  const events = AutoSim.catchUpLeague(league, now);
  // Médias : purge toute interview de jalon en attente depuis plus de 3
  // jours, pour TOUTES les équipes humaines de la ligue (voir
  // Team.pruneExpiredInterviews/MILESTONE_INTERVIEW_RESPONSE_DEADLINE_MS
  // côté moteur) : filet de sécurité indépendant du navigateur (qui purge
  // déjà côté client, voir showCatchupSummaryIfAny), pour un manager qui
  // n'ouvrirait plus jamais l'écran de rattrapage mais continuerait
  // d'appeler d'autres routes.
  league.teams.forEach(t => { if (t.isHuman) t.pruneExpiredInterviews(now); });
  // Entraînement collectif : fait avancer le journal jour par jour
  // (Team.collectiveTrainingLog, voir Team.syncCollectiveTrainingLog côté
  // moteur) pour TOUTES les équipes humaines, à chaque passage ici, tout
  // comme pruneExpiredInterviews ci-dessus. C'est nécessaire car les jours
  // de repos entre deux matchs doivent s'accumuler avec le simple écoulement
  // du temps réel, même si le manager ne retouche jamais la page
  // entraînement (sinon un manager qui règle "tactique" une fois puis
  // n'ouvre plus jamais cette page ne banquerait jamais aucun jour).
  league.teams.forEach(t => { if (t.isHuman && t.syncCollectiveTrainingLog) t.syncCollectiveTrainingLog(now); });
  // `changed` : toujours `true` (voir le grand commentaire ci-dessus) —
  // ensureLiveMatch/catchUpLeague/pruneExpiredInterviews tournent tous les
  // trois SANS CONDITION à chaque appel et peuvent chacun muter `league`
  // sans que ça se voie dans `events`, donc plus aucune façon bon marché de
  // savoir avec certitude que RIEN n'a changé.
  return { events, changed: true };
}

// Ramène les événements "bruts" de catchUpLeague (potentiellement plusieurs
// équipes HUMAINES concernées par un même match/une même semaine
// d'entraînement, voir server/liveMatch.js:finalizeRound et
// server/autoSim.js) à la forme HISTORIQUE, PERSONNELLE, qu'un manager donné
// attend ({type:"match", round, userResult} / {type:"training", week,
// result} — un seul résultat, le SIEN) : c'est exactement la forme que
// moteurbasket3.html sait déjà afficher (voir showCatchupSummaryIfAny), zéro
// changement requis côté navigateur pour ce point précis. Un match/une
// semaine qui ne concerne pas du tout `teamIndex` est simplement omis de SON
// récapitulatif (mais reste bien résolu pour tout le monde par ailleurs).
function personalizeEventsForTeam(events, teamIndex) {
  const out = [];
  events.forEach(ev => {
    if (ev.type === "match") {
      const mine = (ev.userResults || []).find(r => r.teamIdx === teamIndex);
      if (mine) {
        const { teamIdx, ...userResult } = mine;
        out.push({ type: "match", round: ev.round, userResult });
      }
    } else if (ev.type === "playoff-match") {
      // Même principe que "match" ci-dessus (voir LiveMatch.finalizePlayoffRound
      // côté server/liveMatch.js, retour utilisateur 2026-09 : les play-offs
      // se jouent maintenant match par match, en direct, comme la saison
      // régulière) : un match de play-offs qui ne concerne pas `teamIndex`
      // (CPU-vs-CPU, ou deux AUTRES managers humains) est simplement omis de
      // SON récapitulatif. `seasonEnded` (true seulement pour le match de la
      // finale qui couronne le champion) transporté tel quel : c'est ce qui
      // dit au navigateur d'enchaîner sur l'événement "season-end" séparé,
      // émis juste après par server/autoSim.js:catchUpPlayoffs.
      // `userResult.seriesResolved` (voir LiveMatch.finalizePlayoffRound) :
      // transporté tel quel, ce n'est PAS un champ global comme
      // `seasonEnded` (chaque équipe humaine peut voir SA série se décider à
      // un tour différent de celle d'un autre manager).
      const mine = (ev.userResults || []).find(r => r.teamIdx === teamIndex);
      if (mine) {
        const { teamIdx, ...userResult } = mine;
        out.push({ type: "playoff-match", round: ev.round, userResult, seasonEnded: !!ev.seasonEnded });
      }
    } else if (ev.type === "training") {
      const mine = (ev.results || []).find(r => r.teamIdx === teamIndex);
      if (mine) {
        // `ev.week` (calendrier classique, une fois par semaine réelle) OU
        // `ev.day` (calendrier ancré quotidien, une fois par jour civil —
        // voir catchUpDailyAnchored côté server/autoSim.js) : JAMAIS les
        // deux à la fois, selon le rythme de LA ligue qui a émis l'événement
        // — transporté tel quel, à charge pour l'affichage (voir
        // showCatchupSummaryIfAny côté moteurbasket3.html) de choisir le bon
        // libellé ("semaine" vs "jour").
        const out_ev = { type: "training", result: mine.result };
        if (typeof ev.week === "number") out_ev.week = ev.week;
        if (typeof ev.day === "number") out_ev.day = ev.day;
        out.push(out_ev);
      }
    } else {
      out.push(ev); // "season-end" etc. : global, identique pour tout le monde
    }
  });
  return out;
}

// Résumé JSON lisible de l'état courant, PERSONNALISÉ pour `teamIndex` — pas
// la sauvegarde brute (bien trop volumineuse/interne), juste de quoi
// afficher un tableau de bord : classement, prochain match programmé,
// budget, semaine d'entraînement en cours.
function buildStateSnapshot(league, teamIndex, now) {
  const team = league.teams[teamIndex];
  const standings = league.standings();
  const userRow = standings.find(r => r.idx === teamIndex);
  const nextRound = league.isRegularSeasonDone() ? null : league.round;
  const nextMatch = nextRound == null ? null : league.matchesForRound(nextRound).find(m => m.home === teamIndex || m.away === teamIndex);

  const openListings = (league.transferListings || []).filter(l => l.status === "open");
  // Résolu depuis league.liveMatches (voir server/liveMatch.js), jamais lu
  // directement : c'est CE calcul qui garantit qu'un manager ne voit jamais
  // que SA PROPRE diffusion, jamais celle d'un autre.
  const myLive = LiveMatch.viewLiveMatchForTeam(league, teamIndex);

  return {
    now,
    myTeamIndex: teamIndex,
    team: {
      name: team.name,
      week: team.week,
      // Droit d'administration de ligue (voir Team.isAdmin, engine.js) :
      // exposé ICI pour que le navigateur sache s'il doit afficher l'action
      // "Réinitialiser la ligue" (voir POST /api/reset-multi-league) — sans
      // ce champ, seule la sauvegarde complète (GET /api/save) le porterait,
      // qu'on ne veut pas devoir charger juste pour savoir si ce bouton doit
      // apparaître.
      isAdmin: !!team.isAdmin,
      budget: team.budget,
      fanMorale: Math.round(team.fanMorale),
      trainingSkill: team.trainingSkill,
      trainingPositions: team.trainingPositions,
      offensivePriorities: team.offensivePriorities,
      defense: team.defense,
      rhythm: team.rhythm,
      lineup: team.lineup,
      hasValidLineup: team.hasValidLineup(),
      playersCount: team.players.length,
      players: team.players.map(p => ({
        id: p.id, name: p.name, position: p.position, age: p.age,
        height: p.height, attrs: p.attrs, salary: p.salary,
      })),
    },
    league: {
      divisionLevel: league.divisionLevel,
      round: league.round,
      totalRounds: league.totalRounds,
      regularSeasonDone: league.isRegularSeasonDone(),
      playoffs: league.playoffs,
      // Confort d'affichage (voir League.isPlayoffsDone côté moteur) :
      // `league.playoffs` existe dès la fin de la saison régulière (voir
      // League.startPlayoffsIfNeeded), avant le moindre match de play-offs
      // joué. C'est CE champ, pas la simple présence de `playoffs`
      // ci-dessus, qui dit si la saison est VRAIMENT terminée (champion
      // connu, écran de fin de saison accessible).
      playoffsDone: league.isPlayoffsDone(),
      relegationBarrage: league.relegationBarrage,
      calendarStartAt: league.calendarStartAt,
      lastAutoTrainedWeek: league.lastAutoTrainedWeek,
      // Rythme de calendrier figé pour CETTE ligue (voir "MODE ACCÉLÉRÉ"
      // dans server/calendar.js) : `null` = calendrier classique. Purement
      // informatif ici — le navigateur lit calendarWeekMs/
      // calendarSlotOffsetsMs directement depuis la sauvegarde complète
      // (voir GET /api/save, store.serialize(Multi)League).
      calendarWeekMs: league.calendarWeekMs,
      calendarSlotOffsetsMs: league.calendarSlotOffsetsMs,
      standings,
      userStanding: userRow || null,
      nextMatch: nextMatch
        ? {
            round: nextRound,
            isHome: nextMatch.home === teamIndex,
            opponent: league.teams[nextMatch.home === teamIndex ? nextMatch.away : nextMatch.home].name,
            scheduledAt: league.calendarStartAt != null ? scheduledTimeForLeagueRound(league, nextRound) : null,
          }
        : null,
      // Diffusion en direct en cours de CE manager (voir server/liveMatch.js)
      // — juste de quoi savoir SANS charger la sauvegarde complète si SON
      // match est actuellement en train de se jouer ; le détail (chaque
      // événement + son horaire) reste dans GET /api/save.
      liveMatch: myLive ? { round: myLive.round, kickoffAt: myLive.kickoffAt, forfeit: myLive.forfeit } : null,
    },
    market: {
      listings: openListings.map(l => ({
        id: l.id,
        playerId: l.playerId,
        playerName: (league.playerById ? league.playerById(l.playerId) : null)?.name || null,
        sellerIdx: l.sellerIdx,
        sellerName: league.teams[l.sellerIdx].name,
        isMine: l.sellerIdx === teamIndex,
        startPrice: l.startPrice,
        currentBid: l.currentBid,
        currentBidderIsMe: l.currentBidderIdx === teamIndex,
        closesAt: l.closesAt,
      })),
    },
  };
}

// Points d'entrée "action" — chacun reçoit (team, teamIndex, league, body,
// now) et renvoie { ok: true, ... } ou { ok: false, error } (voir
// actions.js). Un seul chemin de traitement générique ci-dessous pour
// toutes : résout le contexte joueur (voir resolvePlayerContext — solo OU
// multi-manager, selon le jeton), valide le corps JSON, applique l'action si
// elle est acceptée, sauvegarde, renvoie l'instantané à jour.
//
// Salle/prix des billets/boutique des supporters (retour utilisateur,
// 2026-09, veille du premier vrai test à 10 managers) : ces trois écrans
// mutaient jusqu'ici `teamA` en local puis appelaient saveMyTeam() — devenu
// un no-op dès qu'un jeton manager est actif (voir /api/save-raw plus bas),
// donc ces achats étaient silencieusement perdus au prochain chargement en
// mode multi-manager. upgradeArena/setTicketPrices/upgradeFanShop
// reproduisent EXACTEMENT la même logique de validation/coût que
// Team.upgradeArena/setTicketPrice/upgradeFanShop côté moteur (voir
// actions.js) — ce ne sont pas de nouvelles règles, juste le même calcul
// déplacé côté serveur pour qu'il persiste réellement.
const ACTION_ROUTES = {
  "/api/lineup": actions.setLineup,
  "/api/tactics": actions.setTactics,
  "/api/training": actions.setTraining,
  "/api/plan": actions.setPlan,
  "/api/market/list": actions.listPlayer,
  "/api/market/bid": actions.bidOnListing,
  "/api/market/coach-bid": actions.bidOnCoachListing,
  "/api/arena": actions.upgradeArena,
  "/api/ticket-prices": actions.setTicketPrices,
  "/api/fan-shop": actions.upgradeFanShop,
  // Autres infrastructures du club (station TV, salle de musculation, espace
  // bien-être — voir CLUB_FACILITIES côté moteur et actions.upgradeFacility)
  // : UNE seule route, `body.facility` choisit laquelle, comme côté
  // actions.js.
  "/api/facility": actions.upgradeFacility,
  "/api/staff/fire-trainer": actions.fireTrainer,
  // Marché des analystes vidéo + séance vidéo (voir server/actions.js et
  // League.analystListings/runVideoSession côté moteur) — mêmes conventions
  // de nommage que les routes entraîneur ci-dessus.
  "/api/market/analyst-bid": actions.bidOnAnalystListing,
  "/api/staff/fire-analyst": actions.fireVideoAnalyst,
  "/api/staff/video-session": actions.runVideoSession,
  // Scouting Pro (voir server/scouting.js et le grand commentaire de
  // Team.scoutingPremium/scoutingUnlocks dans engine.js) : les 2 routes
  // GET (accès/rapport) sont gérées à part plus bas, comme /api/live-status
  // et /api/spectate ci-dessus (lecture pure, jamais de mutation).
  "/api/scouting/ad-ticket": actions.createScoutingAdTicket,
  "/api/scouting/ad-complete": actions.completeScoutingAdTicket,
  "/api/scouting/set-premium": actions.setScoutingPremium,
  // Hoop Shows — émissions avant-match/mi-temps + pronostics (voir
  // server/shows.js, DEV_NOTES.md point 11) : envoi des réponses. Les GET
  // (émission elle-même/mes réponses déjà envoyées/classement mondial) sont
  // gérées à part plus bas, même convention que Scouting Pro ci-dessus.
  "/api/pronostics/submit": actions.submitPronostics,
  // Académie de jeunes (recruteur + centre de formation + pipeline privé de
  // prospects, voir server/actions.js et Team.recruiter/youthCandidates/
  // youthPlayers/trainingCenterLevel/pendingYouthDecisions côté moteur) —
  // mêmes conventions de nommage que les routes entraîneur/analyste
  // ci-dessus pour le marché du recruteur ; nouvelles routes /api/youth/* et
  // /api/training-center pour ce qui n'a pas d'équivalent staff-market.
  "/api/market/recruiter-bid": actions.bidOnRecruiterListing,
  "/api/staff/fire-recruiter": actions.fireRecruiter,
  "/api/training-center": actions.upgradeTrainingCenter,
  "/api/youth/sign": actions.signYouthCandidate,
  "/api/youth/decline": actions.declineYouthCandidate,
  "/api/youth/promote": actions.promoteYouthPlayer,
  "/api/youth/release": actions.releaseYouthPlayer,
  // Médias : interviews d'après-match en attente (voir Team.pendingInterviews
  // côté moteur et server/actions.js).
  "/api/media/interview": actions.respondToInterview,
  "/api/media/interview-skip": actions.skipInterview,
  // Demande de transfert (voir server/actions.js et le grand commentaire
  // au-dessus de TRANSFER_REQUEST_MOTIVATION_THRESHOLD côté moteur).
  "/api/media/transfer-request-discuss": actions.discussTransferRequest,
  "/api/club/set-jersey": actions.setTeamJersey,
  "/api/club/set-jersey-pattern": actions.setTeamJerseyPattern,
  "/api/club/set-jersey-two-tone": actions.setTeamJerseyTwoTone,
  // Maillot extérieur (voir actions.js, miroir identique des routes
  // domicile ci-dessus, retour utilisateur, 2026-09 : "Travaille sur les
  // maillots extérieurs également").
  "/api/club/set-away-jersey": actions.setTeamAwayJersey,
  "/api/club/set-away-jersey-pattern": actions.setTeamAwayJerseyPattern,
  "/api/club/set-away-jersey-two-tone": actions.setTeamAwayJerseyTwoTone,
  "/api/club/set-logo": actions.setTeamLogo,
  "/api/club/set-paying": actions.setTeamPaying,
  // Tutoriel d'accueil (voir engine.js:Team.markOnboardingTourCompleted/
  // claimTutorialReward et server/actions.js) :
  "/api/club/onboarding-tour-completed": actions.setOnboardingTourCompleted,
  "/api/club/claim-tutorial-reward": actions.claimTutorialReward,
};

// ---------------------------------------------------------------------
// ADMIN — bootstrap/reset de la ligue PARTAGÉE (retour utilisateur, 2026-09 :
// jusqu'à 10 vrais managers). Protégé par un secret partagé lu depuis
// l'environnement (BASKET_ADMIN_TOKEN, comparé à l'en-tête X-Admin-Token) —
// jamais ouvert par défaut : si la variable n'est PAS définie, TOUTE requête
// admin est refusée, quel que soit l'en-tête envoyé. API seulement pour
// l'instant (pas d'écran dédié côté navigateur) : Antony est technique,
// c'est suffisant pour cette étape.
// ---------------------------------------------------------------------
function isAdminAuthorized(req) {
  const expected = process.env.BASKET_ADMIN_TOKEN;
  if (!expected) return false;
  const got = req.headers["x-admin-token"];
  return typeof got === "string" && got === expected;
}

function validateManagerTeamNames(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10) {
    return { error: "'teamNames' doit être un tableau de 1 à 10 noms de club." };
  }
  const names = raw.map(n => (typeof n === "string" ? n.trim() : ""));
  if (names.some(n => !n)) return { error: "Chaque nom de club doit être une chaîne non vide." };
  if (new Set(names).size !== names.length) return { error: "Les noms de club doivent être uniques." };
  return { value: names };
}

// `adminTeamName` optionnel du corps de /api/admin/new-multi-league et
// /api/admin/reset-multi-league (voir store.createMultiManagerCareer) : s'il
// est fourni, DOIT correspondre à l'un des noms déjà validés dans
// `names` (sinon 400 — jamais un admin silencieusement absent ou mal
// assigné). Absent/`null` : `{ value: undefined }`, laissé à
// store.createMultiManagerCareer de retomber sur `teamNames[0]`.
function validateAdminTeamName(raw, names) {
  if (raw === undefined || raw === null) return { value: undefined };
  if (typeof raw !== "string" || !raw.trim()) {
    return { error: "'adminTeamName' doit être une chaîne non vide si fourni." };
  }
  const trimmed = raw.trim();
  if (!names.includes(trimmed)) {
    return { error: "'adminTeamName' doit correspondre à l'un des noms de 'teamNames'." };
  }
  return { value: trimmed };
}

// Origine publique (protocole + hôte) à partir de laquelle construire un
// lien privé complet (`<origine>/?m=<jeton>`) — lue depuis les en-têtes de
// LA REQUÊTE qui a appelé l'API admin (Host, X-Forwarded-Proto si derrière
// un proxy) : ce serveur ne connaît pas lui-même sa propre adresse publique.
function originFor(req) {
  const proto = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = req.headers.host || `localhost:${DEFAULT_PORT}`;
  return `${proto}://${host}`;
}

function managerLinksFor(league, req) {
  const origin = originFor(req);
  return league.teams
    .map((t, teamIndex) => ({ t, teamIndex }))
    .filter(x => x.t.isHuman)
    .map(({ t, teamIndex }) => ({ teamIndex, name: t.name, token: t.managerLinkToken, link: `${origin}/?m=${t.managerLinkToken}` }));
}

// Logique de réinitialisation PARTAGÉE entre les deux routes de reset (voir
// POST /api/admin/reset-multi-league — secret X-Admin-Token brut, pour un
// appel direct en API — et POST /api/reset-multi-league — jeton manager
// X-TipIn-Token + Team.isAdmin, pour l'action en un clic dans l'app, voir
// moteurbasket3.html) : UNE SEULE implémentation plutôt que deux copies qui
// risqueraient de diverger (voir le commentaire sur serializeTeam/
// teamFromSave dans engine.js pour pourquoi ça compte ici aussi).
// `adminTeamNameInput` : déjà validé par l'appelant (voir
// validateAdminTeamName) — si absent, retombe sur l'admin de la ligue
// PRÉCÉDENTE (identifié par nom de club, comme managerLinkToken un peu plus
// bas) si ce nom existe encore dans `teamNames`, sinon sur `teamNames[0]`
// (voir store.createMultiManagerCareer).
async function performMultiLeagueReset({ teamNames, adminTeamNameInput, multiSavePath, now, req }) {
  const previous = await store.loadMultiLeague(multiSavePath);
  let adminTeamName = adminTeamNameInput;
  if (!adminTeamName && previous) {
    const prevAdmin = previous.league.teams.find(t => t.isHuman && t.isAdmin);
    if (prevAdmin && teamNames.includes(prevAdmin.name)) adminTeamName = prevAdmin.name;
  }
  const created = store.createMultiManagerCareer(teamNames, now, adminTeamName);
  // Préserve le jeton privé de chaque manager déjà connu (identifié par nom
  // de club) d'une saison à l'autre — voir le commentaire historique sur
  // cette route plus bas pour le détail du retour utilisateur derrière ce
  // choix.
  if (previous) {
    const prevTokenByName = new Map();
    previous.league.teams.forEach(t => { if (t.isHuman && t.managerLinkToken) prevTokenByName.set(t.name, t.managerLinkToken); });
    created.league.teams.forEach(t => {
      if (t.isHuman && prevTokenByName.has(t.name)) t.managerLinkToken = prevTokenByName.get(t.name);
    });
  }
  await store.saveMultiLeague(created.league, multiSavePath);
  return { ok: true, managers: managerLinksFor(created.league, req) };
}

// Fabrique le handler HTTP. `savePath`/`multiSavePath` et `nowFn`
// injectables — indispensable pour tester ce serveur sans dépendre du vrai
// disque/de la vraie horloge (voir server/index_test.js).
function createHandler(savePath = store.defaultSavePath(), nowFn = Date.now, multiSavePath = store.defaultMultiLeaguePath()) {
  return async function handler(req, res) {
    try {
      let route;
      try {
        route = new URL(req.url, "http://localhost");
      } catch (e) {
        sendJson(res, 400, { error: "URL invalide" });
        return;
      }

      // Sert la page elle-même — avant même de calculer `now` ou de toucher
      // à une sauvegarde, exactement comme /api/health : ouvrir la page ne
      // devrait jamais, à lui seul, créer une carrière. La query string
      // (`?m=<jeton>`) ne change rien ici : c'est purement une affaire
      // client (voir moteurbasket3.html).
      if (route.pathname === "/" && req.method === "GET") {
        serveIndexHtml(res);
        return;
      }

      // Assets statiques (visuels de la Salle) — voir serveAsset plus haut ;
      // avant `now`/toute sauvegarde, exactement comme "/", puisque charger
      // une image n'a aucune raison de toucher à une carrière.
      if (route.pathname.startsWith("/assets/") && req.method === "GET") {
        serveAsset(res, route.pathname);
        return;
      }

      const now = nowFn();

      // Simple sonde de vie : ne touche à AUCUNE sauvegarde (ni lecture ni
      // création) — sinon un load-balancer/orchestrateur qui ping
      // /api/health en boucle créerait une carrière neuve pour rien avant
      // même qu'un manager n'ait joué.
      if (route.pathname === "/api/health") {
        sendJson(res, 200, { ok: true, now });
        return;
      }

      // ---------------------------------------------------------------
      // ADMIN — voir le bloc dédié plus haut. Totalement indépendant du
      // jeton manager (X-TipIn-Token) : ces deux routes n'agissent JAMAIS
      // sur la sauvegarde solo, uniquement sur la ligue multi-manager.
      // ---------------------------------------------------------------
      if (route.pathname === "/api/admin/new-multi-league" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        if (await store.loadMultiLeague(multiSavePath)) {
          sendJson(res, 409, { ok: false, error: "Une ligue multi-manager existe déjà, utilisez /api/admin/reset-multi-league pour en repartir." });
          return;
        }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const names = validateManagerTeamNames(body && body.teamNames);
        if (names.error) { sendJson(res, 400, { ok: false, error: names.error }); return; }
        const adminName = validateAdminTeamName(body && body.adminTeamName, names.value);
        if (adminName.error) { sendJson(res, 400, { ok: false, error: adminName.error }); return; }
        const created = store.createMultiManagerCareer(names.value, now, adminName.value);
        await store.saveMultiLeague(created.league, multiSavePath);
        sendJson(res, 200, { ok: true, managers: managerLinksFor(created.league, req) });
        return;
      }

      // Reset ADMIN (secret X-Admin-Token brut) — retour utilisateur implicite
      // sur la préservation des jetons manager d'une saison à l'autre (pas
      // envie de redistribuer 10 nouveaux liens si le même groupe continue) :
      // voir le grand commentaire sur performMultiLeagueReset ci-dessus, qui
      // porte maintenant aussi cette logique.
      if (route.pathname === "/api/admin/reset-multi-league" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const names = validateManagerTeamNames(body && body.teamNames);
        if (names.error) { sendJson(res, 400, { ok: false, error: names.error }); return; }
        const adminName = validateAdminTeamName(body && body.adminTeamName, names.value);
        if (adminName.error) { sendJson(res, 400, { ok: false, error: adminName.error }); return; }
        const result = await performMultiLeagueReset({ teamNames: names.value, adminTeamNameInput: adminName.value, multiSavePath, now, req });
        sendJson(res, 200, result);
        return;
      }

      // Reset EN UN CLIC depuis l'app (Phase B, 2026-09 : "Antony veut pouvoir
      // réinitialiser la ligue lui-même, sans le secret BASKET_ADMIN_TOKEN
      // brut") — authentifié par le jeton manager de l'APPELANT
      // (X-TipIn-Token, voir resolveManagerTeam), pas par X-Admin-Token :
      // réservé au SEUL manager qui porte Team.isAdmin (voir
      // store.createMultiManagerCareer/moteurbasket3.html). Reconduit
      // exactement le même groupe de managers que la ligue courante (aucun
      // 'teamNames' à fournir : pas question de faire saisir 10 noms de club
      // à Antony pour un simple bouton "réinitialiser") et la même logique de
      // reset que la route admin ci-dessus, via performMultiLeagueReset.
      if (route.pathname === "/api/reset-multi-league" && req.method === "POST") {
        const token = getManagerToken(req);
        if (!token) { sendJson(res, 401, { ok: false, error: "Jeton manager manquant (X-TipIn-Token)." }); return; }
        const multi = await store.loadMultiLeague(multiSavePath);
        if (!multi) { sendJson(res, 404, { ok: false, error: "Aucune ligue multi-manager n'existe encore." }); return; }
        const resolved = store.resolveManagerTeam(multi.league, token);
        if (!resolved) { sendJson(res, 401, { ok: false, error: "Jeton manager inconnu ou invalide." }); return; }
        if (!resolved.team.isAdmin) {
          sendJson(res, 403, { ok: false, error: "Seul le manager administrateur de la ligue peut la réinitialiser." });
          return;
        }
        const teamNames = multi.league.teams.filter(t => t.isHuman).map(t => t.name);
        const result = await performMultiLeagueReset({ teamNames, adminTeamNameInput: resolved.team.name, multiSavePath, now, req });
        sendJson(res, 200, result);
        return;
      }

      // Crédit administratif ponctuel (retour utilisateur, 2026-09 : Ariane a
      // terminé le tutoriel d'accueil AVANT le correctif "Mets les vrais
      // primes sur le tutoriel", voir engine.js:Team.claimTutorialReward) :
      // la prime totale n'a donc jamais été créditée, et
      // onboardingTourCompleted déjà à `true` l'empêche de relancer le
      // tutoriel pour la toucher normalement. Route générique de rattrapage
      // manuel (montant/motif libres) plutôt qu'un correctif à usage unique
      // codé en dur : réutilisable pour toute situation similaire à
      // l'avenir (retard de version, erreur de support...). Passe par
      // Team.recordTransaction, donc apparaît normalement dans le journal
      // "Économie" du club concerné. Même authentification que les deux
      // routes admin ci-dessus (X-Admin-Token) ; agit UNIQUEMENT sur la
      // ligue PARTAGÉE, jamais sur une carrière solo.
      if (route.pathname === "/api/admin/credit-team" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        const multi = await store.loadMultiLeague(multiSavePath);
        if (!multi) { sendJson(res, 404, { ok: false, error: "Aucune ligue multi-manager n'existe encore." }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        if (!body || typeof body.teamName !== "string" || !body.teamName.trim()) {
          sendJson(res, 400, { ok: false, error: "'teamName' (chaîne non vide) requis." });
          return;
        }
        if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount === 0) {
          sendJson(res, 400, { ok: false, error: "'amount' (nombre non nul, positif ou négatif) requis." });
          return;
        }
        const team = multi.league.teams.find(t => t.name === body.teamName.trim());
        if (!team) { sendJson(res, 404, { ok: false, error: `Aucune équipe nommée "${body.teamName}" dans la ligue partagée.` }); return; }
        const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "Ajustement manuel (support)";
        team.recordTransaction(label, body.amount);
        await store.saveMultiLeague(multi.league, multiSavePath);
        sendJson(res, 200, { ok: true, teamName: team.name, amount: body.amount, budget: team.budget });
        return;
      }

      // Réinitialisation administrative de "onboardingTourCompleted" (retour
      // utilisateur Discord, 2026-09 : "Skyzer10" bloqué hors du tutoriel
      // après un aller-retour dedans, plus aucun accès au bouton "Lancer le
      // tutoriel" dans le Guide) : ce drapeau est à SENS UNIQUE par design
      // (voir Team.markOnboardingTourCompleted, engine.js) - jusqu'ici, le
      // seul recours en cas de blocage était un bricolage manuel via
      // /api/admin/credit-team ci-dessus (voir son commentaire, déjà utilisé
      // une première fois pour Ariane), qui ne fait que compenser en argent
      // sans jamais redonner l'accès réel au tutoriel. Route générique de
      // rattrapage (voir Team.resetOnboardingTour, engine.js) plutôt qu'un
      // correctif ponctuel, pour ne plus avoir à rejouer ce bricolage à
      // chaque nouveau cas similaire. Ne touche JAMAIS
      // Team.tutorialRewardsClaimed : les primes déjà réellement créditées
      // restent acquises, seul le parcours peut être refait, jamais l'argent
      // regagné (protection anti-double-dépense inchangée côté
      // claimTutorialReward). Même authentification (X-Admin-Token) et même
      // portée (ligue PARTAGÉE uniquement, jamais la carrière solo) que
      // /api/admin/credit-team ci-dessus.
      if (route.pathname === "/api/admin/reset-onboarding-tour" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        const multi = await store.loadMultiLeague(multiSavePath);
        if (!multi) { sendJson(res, 404, { ok: false, error: "Aucune ligue multi-manager n'existe encore." }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        if (!body || typeof body.teamName !== "string" || !body.teamName.trim()) {
          sendJson(res, 400, { ok: false, error: "'teamName' (chaîne non vide) requis." });
          return;
        }
        const team = multi.league.teams.find(t => t.name === body.teamName.trim());
        if (!team) { sendJson(res, 404, { ok: false, error: `Aucune équipe nommée "${body.teamName}" dans la ligue partagée.` }); return; }
        team.resetOnboardingTour();
        await store.saveMultiLeague(multi.league, multiSavePath);
        sendJson(res, 200, { ok: true, teamName: team.name, onboardingTourCompleted: team.onboardingTourCompleted });
        return;
      }

      // ---------------------------------------------------------------
      // ROUTES JOUEUR — solo OU multi-manager selon la présence d'un jeton
      // (voir resolvePlayerContext, en tête de fichier).
      // ---------------------------------------------------------------

      if (route.pathname === "/api/state" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const { events, changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        sendJson(res, 200, { ...buildStateSnapshot(ctx.league, ctx.teamIndex, now), events: personalizeEventsForTeam(events, ctx.teamIndex) });
        return;
      }

      // Sauvegarde complète (même forme que store.serialize(Multi)League) —
      // c'est ce dont le navigateur a besoin pour reconstruire de VRAIS
      // objets Team/League (via teamFromSave/leagueFromSave) et continuer à
      // utiliser tel quel tout son code d'affichage existant, plutôt que le
      // résumé allégé de buildStateSnapshot ci-dessus (pensé pour un tableau
      // de bord, pas pour être re-désérialisé). `myTeamIndex` (nouveau) dit
      // au navigateur QUELLE équipe, parmi league.teams, est la SIENNE —
      // plus jamais forcément teams[0] une fois plusieurs managers humains
      // en jeu (voir moteurbasket3.html). `league.liveMatch` est résolu ICI
      // pour CE destinataire précis (voir LiveMatch.viewLiveMatchForTeam) —
      // `league.liveMatches` (le pluriel, TOUTES les diffusions en cours,
      // potentiellement celles d'AUTRES managers) n'est jamais exposé par
      // cette route.
      if (route.pathname === "/api/save" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const payload = ctx.isMulti
          ? store.serializeMultiLeague(ctx.league)
          : store.serialize(ctx.league.teams[0], ctx.league);
        payload.myTeamIndex = ctx.teamIndex;
        payload.league.liveMatch = LiveMatch.viewLiveMatchForTeam(ctx.league, ctx.teamIndex);
        delete payload.league.liveMatches;
        sendJson(res, 200, payload);
        return;
      }

      // Remplace INTÉGRALEMENT la sauvegarde SOLO par celle envoyée par le
      // client — filet de secours temporaire pour ce qui n'a pas encore son
      // propre point d'entrée validé (staff, salle, budget, vente de
      // joueur...), voir README.md "Prochaines étapes". SUPPRIMÉ pour une
      // ligue PARTAGÉE (retour explicite, 2026-09) : n'importe quel appelant
      // pourrait sinon écraser l'état de TOUS les autres managers — toute
      // requête porteuse d'un jeton manager est donc refusée ici, quel que
      // soit son contenu ; SANS jeton, le comportement reste EXACTEMENT
      // celui d'avant (carrière solo, jamais concernée par le risque
      // ci-dessus).
      if (route.pathname === "/api/save-raw" && req.method === "POST") {
        if (getManagerToken(req)) {
          sendJson(res, 410, {
            ok: false,
            error: "Supprimé pour une ligue partagée : utilisez les points d'entrée dédiés (/api/lineup, /api/tactics, /api/training, /api/market/...).",
          });
          return;
        }
        let body;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
          return;
        }
        let restored;
        try {
          if (!body || typeof body !== "object" || !body.team || !body.league) {
            throw new Error("'team' et 'league' sont requis.");
          }
          restored = store.deserialize(body);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: `Sauvegarde invalide : ${e.message}` });
          return;
        }
        await store.save(restored.team, restored.league, savePath);
        sendJson(res, 200, { ok: true, state: buildStateSnapshot(restored.league, 0, now) });
        return;
      }

      // Réinitialise la carrière SOLO (voir resetCareer() côté navigateur) :
      // remplace la sauvegarde solo par une toute nouvelle. Pour une ligue
      // PARTAGÉE, seul l'organisateur peut la réinitialiser (voir
      // /api/admin/reset-multi-league) — une requête porteuse d'un jeton
      // manager est donc refusée ici plutôt que de silencieusement
      // réinitialiser la carrière solo (qui n'a rien à voir avec elle).
      if (route.pathname === "/api/new-career" && req.method === "POST") {
        if (getManagerToken(req)) {
          sendJson(res, 403, { ok: false, error: "Seul l'organisateur peut réinitialiser une ligue partagée (voir /api/admin/reset-multi-league)." });
          return;
        }
        const created = store.createNewCareer(now);
        await store.save(created.team, created.league, savePath);
        sendJson(res, 200, store.serialize(created.team, created.league));
        return;
      }

      if (route.pathname === "/api/simulate-tick" && req.method === "POST") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const { events, changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        sendJson(res, 200, { events: personalizeEventsForTeam(events, ctx.teamIndex), state: buildStateSnapshot(ctx.league, ctx.teamIndex, now) });
        return;
      }

      // Liste allégée des matchs actuellement en direct (retour utilisateur,
      // 2026-09-24 : "pouvoir regarder le live d'une autre équipe depuis son
      // calendrier" — voir DEV_NOTES.md) : ne renvoie QUE {homeIdx, awayIdx,
      // round, competition} pour chaque match en cours (voir
      // LiveMatch.liveMatchesLiteFor) — jamais son contenu (événements/
      // scores), pour que le navigateur sache QUELLES équipes sont
      // actuellement en direct (afficher un bouton "🔴 En direct" sur la
      // fiche d'une équipe adverse) sans rien révéler du match tant que le
      // manager ne clique pas explicitement dessus (voir /api/spectate juste
      // après). Route JOUEUR (nécessite resolvePlayerContext) simplement pour
      // rattraper la ligue (tick) avant de lire league.liveMatches — pas de
      // restriction supplémentaire ensuite : cette liste est volontairement
      // la même pour tout manager de la ligue (aucune donnée de match dedans).
      if (route.pathname === "/api/live-status" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        sendJson(res, 200, { ok: true, live: LiveMatch.liveMatchesLiteFor(ctx.league) });
        return;
      }

      // Suivre le direct d'une AUTRE équipe (même retour utilisateur que
      // ci-dessus, "depuis son calendrier") : ?team=<index dans
      // league.teams>. Portée VOLONTAIREMENT limitée (voir DEV_NOTES.md,
      // décision utilisateur du 2026-09-24 : "Limiter aux matchs déjà en
      // direct") aux matchs DÉJÀ présents dans league.liveMatches — jamais un
      // match CPU-vs-CPU (jamais diffusé, voir server/autoSim_test.js) :
      // aucun changement à cette architecture délibérée. Réutilise TEL QUEL
      // viewLiveMatchForTeam (voir son grand commentaire) avec l'index de
      // l'équipe SUIVIE (pas celui de l'appelant) — la restriction "un
      // manager ne voit que SON propre match" reste appliquée ailleurs
      // (buildStateSnapshot/POST /api/save), jamais dans
      // viewLiveMatchForTeam elle-même, donc rien à modifier côté moteur
      // pour ce point précis.
      if (route.pathname === "/api/spectate" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const teamParam = route.searchParams.get("team");
        const teamIdx = teamParam === null ? NaN : Number(teamParam);
        if (!Number.isInteger(teamIdx) || teamIdx < 0 || teamIdx >= ctx.league.teams.length) {
          sendJson(res, 400, { ok: false, error: "'team' (index d'équipe valide) requis." });
          return;
        }
        const live = LiveMatch.viewLiveMatchForTeam(ctx.league, teamIdx);
        if (!live) {
          sendJson(res, 404, { ok: false, error: "Cette équipe n'est pas actuellement en direct." });
          return;
        }
        const watchedTeam = ctx.league.teams[teamIdx];
        const opponent = ctx.league.teams[live.opponentIdx];
        sendJson(res, 200, { ok: true, teamName: watchedTeam.name, opponentName: opponent.name, live });
        return;
      }

      // Scouting Pro — accès (verrouillé/débloqué/périmé, quota de pubs
      // restant) et rapport complet (voir server/scouting.js, le grand
      // commentaire en tête de ce fichier) : ?opponent=<index dans
      // league.teams>. Routes GET pures (aucune mutation, contrairement à
      // ad-ticket/ad-complete/set-premium ci-dessus, gérées par
      // ACTION_ROUTES) — pas de persistContext nécessaire au-delà du tick
      // déjà fait par resolvePlayerContext/tick.
      if (route.pathname === "/api/scouting/access" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const opponentParam = route.searchParams.get("opponent");
        const opponentIdx = opponentParam === null ? NaN : Number(opponentParam);
        const access = Scouting.getScoutingAccess(ctx.league, ctx.teamIndex, opponentIdx, now);
        if (!access.ok) { sendJson(res, 400, access); return; }
        sendJson(res, 200, access);
        return;
      }

      if (route.pathname === "/api/scouting/report" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const opponentParam = route.searchParams.get("opponent");
        const opponentIdx = opponentParam === null ? NaN : Number(opponentParam);
        const access = Scouting.getScoutingAccess(ctx.league, ctx.teamIndex, opponentIdx, now);
        if (!access.ok) { sendJson(res, 400, access); return; }
        // Rapport JAMAIS renvoyé sans accès "full" (Premium ou pub déjà
        // regardée, pas périmée) — voir le grand commentaire en tête de
        // server/scouting.js : contrairement au rapport tactique gratuit
        // déjà existant (transporté tel quel dans /api/save pour toute la
        // ligue), CE rapport est bien gated côté serveur, jamais envoyé au
        // navigateur avant que l'accès ne soit acquis.
        if (access.level !== "full") { sendJson(res, 403, { ok: false, error: "Rapport verrouillé.", access }); return; }
        const report = Scouting.buildScoutingReport(ctx.league, ctx.teamIndex, opponentIdx, now);
        if (!report.ok) { sendJson(res, 400, report); return; }
        sendJson(res, 200, { ...report, access });
        return;
      }

      // Hoop Shows — émissions avant-match/mi-temps + pronostics (voir
      // server/shows.js, DEV_NOTES.md point 11). `round` toujours celui DE LA
      // LIGUE côté serveur (ctx.league.round), jamais un paramètre fourni par
      // le client : la journée concernée n'est jamais ambiguë ("mon prochain
      // match de championnat"), pas besoin qu'un manager la précise ni de
      // risque de désynchronisation avec ce que le serveur sait réellement.
      // 404 tant que la fenêtre n'est pas ouverte (voir INTEGRATION.md §5) —
      // PAS une erreur, le client repasse simplement plus tard (voir
      // moteurbasket3.html, bouton "Voir l'émission"/ouverture automatique).
      if (route.pathname === "/api/shows/prematch" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        if (ctx.league.isRegularSeasonDone()) { sendJson(res, 404, { ok: false, error: "Aucune émission disponible." }); return; }
        const show = Shows.getPrematchShow(ctx.league, ctx.teamIndex, ctx.league.round, now);
        if (!show) { sendJson(res, 404, { ok: false, error: "Émission pas encore ouverte." }); return; }
        // Publication des pronostics = mutation de league.showsPronostics
        // (voir Shows.getPrematchShow) : persistée explicitement ici (jamais
        // fire-and-forget, voir le grand commentaire d'en-tête de
        // server/shows.js) pour ne pas dépendre d'une prochaine requête.
        await persistContext(ctx);
        sendJson(res, 200, show);
        return;
      }

      if (route.pathname === "/api/shows/halftime" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        if (ctx.league.isRegularSeasonDone()) { sendJson(res, 404, { ok: false, error: "Aucune émission disponible." }); return; }
        const show = Shows.getHalftimeShow(ctx.league, ctx.teamIndex, ctx.league.round, now);
        if (!show) { sendJson(res, 404, { ok: false, error: "Émission pas encore ouverte." }); return; }
        await persistContext(ctx);
        sendJson(res, 200, show);
        return;
      }

      // Mes réponses déjà envoyées pour une émission (reprise de session
      // après rechargement, voir showPlayer.js `submission`) — `?showId=`.
      if (route.pathname === "/api/pronostics/me" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const showId = route.searchParams.get("showId");
        if (!showId) { sendJson(res, 400, { ok: false, error: "showId manquant." }); return; }
        const sub = Shows.getSubmissionSync(ctx.league, ctx.teamIndex, showId);
        if (!sub) { sendJson(res, 404, { ok: false, error: "Aucune réponse envoyée." }); return; }
        sendJson(res, 200, sub);
        return;
      }

      // Classement mondial des pronostics — `?season=` optionnel (saison
      // courante par défaut, voir Shows.currentSeasonKey).
      if (route.pathname === "/api/pronostics/leaderboard" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const season = route.searchParams.get("season") || Shows.currentSeasonKey();
        const lb = Shows.leaderboardSync(ctx.league, season, { userId: String(ctx.teamIndex), limit: 50 });
        sendJson(res, 200, { ok: true, ...lb });
        return;
      }

      const actionFn = req.method === "POST" ? ACTION_ROUTES[route.pathname] : null;
      if (actionFn) {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }

        let body;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: e.message });
          return;
        }

        const result = actionFn(ctx.league.teams[ctx.teamIndex], ctx.teamIndex, ctx.league, body, now);
        if (!result.ok) {
          sendJson(res, 400, result);
          return;
        }

        // Une action peut changer ce que le calendrier réel va appliquer
        // (nouvel entraînement, nouvelle feuille de match...) — pas besoin
        // de rattraper ici (rien n'est dû tant que now ne dépasse pas
        // l'échéance suivante), mais on sauvegarde immédiatement pour ne
        // rien perdre si le process redémarre avant le prochain accès.
        await persistContext(ctx);
        sendJson(res, 200, { ...result, state: buildStateSnapshot(ctx.league, ctx.teamIndex, now) });
        return;
      }

      sendJson(res, 404, { error: "Route inconnue", path: route.pathname });
    } catch (e) {
      sendJson(res, 500, { error: `Erreur serveur inattendue : ${e.message}` });
    }
  };
}

function startServer(port = DEFAULT_PORT, savePath = store.defaultSavePath(), multiSavePath = store.defaultMultiLeaguePath()) {
  const server = http.createServer(createHandler(savePath, Date.now, multiSavePath));
  server.listen(port, () => {
    console.log(`Serveur basket (calendrier réel) démarré sur http://localhost:${port}`);
    console.log(`Sauvegarde solo : ${savePath}`);
    console.log(`Sauvegarde multi-manager : ${multiSavePath}`);
    if (!process.env.BASKET_ADMIN_TOKEN) {
      console.log("BASKET_ADMIN_TOKEN non défini : les routes /api/admin/* sont désactivées (toute requête sera refusée).");
    }
    if (Calendar.isFastTestModeEnabled()) {
      console.log("MODE ACCÉLÉRÉ (TEST) ACTIVÉ (BASKET_FAST_CALENDAR=1) : un match toutes les 5h, entraînement + semaine économique tous les 2 matchs — les nouvelles carrières/ligues démarrées à partir de maintenant en profitent ; une ligue déjà en cours garde son rythme actuel.");
    }
  });
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createHandler, buildStateSnapshot, tick, startServer,
  personalizeEventsForTeam, resolvePlayerContext, getManagerToken,
};
