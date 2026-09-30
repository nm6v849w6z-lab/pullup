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
const World = require("./world.js");
const AutoSim = require("./autoSim.js");
const Calendar = require("./calendar.js");
const LiveMatch = require("./liveMatch.js");
const { scheduledTimeForLeagueRound } = Calendar;
const actions = require("./actions.js");
const Scouting = require("./scouting.js");
const Shows = require("./shows.js");
// Ligues privées (Premium) — voir server/privateLeague.js.
const PrivateLeague = require("./privateLeague.js");
// Matchs amicaux — voir server/friendlies.js.
const Friendlies = require("./friendlies.js");
// Messagerie privée entre managers (2026-09-26) — voir server/messages.js.
const Messages = require("./messages.js");
// Chat de la ligue (2026-09-30) — voir server/leagueChat.js.
const LeagueChat = require("./leagueChat.js");
// Comptes joueurs + connexion Discord (2026-09-26) — voir server/accounts.js
// et server/accountRoutes.js.
const AccountRoutes = require("./accountRoutes.js");
const Accounts = require("./accounts.js");
const Push = require("./push.js");
const PublicPlayers = require("./publicPlayers.js");
const MyAuctions = require("./myAuctions.js");
const WebPush = require("./webpush.js");
const Ads = require("./ads.js");
const Site = require("./site.js");
const Engine = require("../engine.js");

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

// ---------------------------------------------------------------------
// Compression HTTP (2026-09-29, chargement sur téléphone) : le jeu (≈2,9 Mo
// de HTML/JS) partait sans aucune compression. Brotli si le navigateur le
// propose, sinon gzip ; rien pour les images (déjà compressées) ni les
// petites réponses. Le résultat des gros fichiers statiques est gardé en
// mémoire (clé = empreinte du contenu) pour ne pas recompresser à chaque
// visite. `res.req` donne la requête sans changer la signature des appelants.
// ---------------------------------------------------------------------
const zlib = require("zlib");
const cryptoForCompression = require("crypto");
const COMPRESSED_CACHE = new Map();
const COMPRESSED_CACHE_MAX = 40;
function pickEncoding(req) {
  const ae = String((req && req.headers && req.headers["accept-encoding"]) || "");
  if (/\bbr\b/.test(ae)) return "br";
  if (/\bgzip\b/.test(ae)) return "gzip";
  return null;
}
function compressBody(body, encoding, cacheable) {
  if (!cacheable) {
    return encoding === "br"
      ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
      : zlib.gzipSync(body, { level: 6 });
  }
  const key = encoding + ":" + cryptoForCompression.createHash("sha1").update(body).digest("hex");
  const hit = COMPRESSED_CACHE.get(key);
  if (hit) return hit;
  const out = encoding === "br"
    ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length } })
    : zlib.gzipSync(body, { level: 9 });
  COMPRESSED_CACHE.set(key, out);
  if (COMPRESSED_CACHE.size > COMPRESSED_CACHE_MAX) COMPRESSED_CACHE.delete(COMPRESSED_CACHE.keys().next().value);
  return out;
}
// Envoie `body` (Buffer ou texte), compressé si utile. `cacheable` : contenu
// stable (fichier), dont la version compressée peut être gardée en mémoire.
function sendBody(res, statusCode, headers, body, cacheable = false) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf-8");
  const type = String(headers["Content-Type"] || "");
  const compressible = buf.length > 1400 && /^(text\/|application\/(javascript|json|xml)|image\/svg)/.test(type);
  const encoding = compressible ? pickEncoding(res.req) : null;
  const out = { ...headers };
  delete out["Content-Length"];
  if (compressible) out["Vary"] = "Accept-Encoding";
  if (!encoding || (res.req && res.req.method === "HEAD")) {
    out["Content-Length"] = buf.length;
    res.writeHead(statusCode, out);
    res.end(buf);
    return;
  }
  const zipped = compressBody(buf, encoding, cacheable);
  out["Content-Encoding"] = encoding;
  out["Content-Length"] = zipped.length;
  res.writeHead(statusCode, out);
  res.end(zipped);
}
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
    sendBody(res, 200, {
      "Content-Type": contentType,
      // Scripts et styles toujours revalidés (2026-09-26 : la nouvelle page
      // live restait invisible, l'ancien live.css/live-view.js étant gardé
      // 24 h par le navigateur) ; images et polices gardées 24 h.
      "Cache-Control": /\.(js|css)$/i.test(relative) ? "no-cache" : "public, max-age=86400",
    }, data, true);
  });
}

// ---------------------------------------------------------------------
// Application mobile (PWA, 2026-09-25 — retour utilisateur : "réfléchis à
// l'application mobile et prépare le code") : deux fichiers qui DOIVENT
// être servis à la racine plutôt que sous /assets/ :
// - /sw.js : un service worker ne contrôle que les pages sous son propre
//   chemin, donc il faut /sw.js pour couvrir "/" ;
// - /manifest.webmanifest : généré à la volée pour y recopier le jeton
//   manager (`?m=`) dans start_url. Sans ça, une appli installée sur l'écran
//   d'accueil (qui a son PROPRE stockage sur iOS, séparé de Safari) se
//   rouvrirait sans jeton, donc hors de la ligue partagée du manager.
// Contenu des fichiers : assets/mobile/ (voir aussi mobile.css/mobile.js).
// ---------------------------------------------------------------------
const MOBILE_SW_PATH = path.join(ASSETS_DIR, "mobile", "sw.js");

function serveServiceWorker(res) {
  fs.readFile(MOBILE_SW_PATH, (err, data) => {
    if (err) { sendJson(res, 404, { error: "Service worker introuvable" }); return; }
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Content-Length": data.length,
      // Toujours revalidé : une nouvelle version du service worker doit
      // être prise en compte au prochain chargement, pas dans 24 h.
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    });
    res.end(data);
  });
}

function mobileManifest(token) {
  const safeToken = typeof token === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(token) ? token : null;
  return {
    name: "Hoop Manager",
    short_name: "Hoop Manager",
    description: "Gère ton club de basket en temps réel : ordres, matchs en direct, économie.",
    lang: "fr",
    id: "/",
    start_url: safeToken ? `/?m=${safeToken}` : "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d131d",
    theme_color: "#0f1728",
    icons: [
      { src: "/assets/mobile/icon-192.png?v=3", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/mobile/icon-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/assets/mobile/icon-maskable-512.png?v=3", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

function serveManifest(res, token) {
  const body = Buffer.from(JSON.stringify(mobileManifest(token)), "utf-8");
  res.writeHead(200, {
    "Content-Type": "application/manifest+json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
  });
  res.end(body);
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
  // Un visiteur SANS jeton manager (ni `?m=` dans l'URL, ni jeton déjà
  // rangé par ce navigateur) est envoyé vers la page d'accueil/inscription.
  // Script placé tout en haut de <head> pour partir avant le moindre
  // affichage. Même clé localStorage que le jeu (MANAGER_TOKEN_STORAGE_KEY
  // dans moteurbasket3.html).
  // Plus de carrière solo (retour utilisateur 2026-09-29 : "le jeu n'a pas a
  // etre un jeu solo mais un jeu online contre d'autres managers") : tout
  // visiteur sans jeton est envoyé vers l'inscription, partout.
  {
    const guard = `<script>window.HM_PUBLIC_SITE=true;(function(){try{if(new URLSearchParams(location.search).get("m"))return;if(localStorage.getItem("tipinManagerToken_v1"))return;}catch(e){}location.replace("/bienvenue");})();</script>`;
    html = html.replace(/<head([^>]*)>/i, m => `${m}${guard}`);

    // Référencement (2026-09-29, retour : Google affichait encore « Pull Up ·
    // Basket Manager » et le texte du jeu pour hoop-manager.com) : « / » est
    // le jeu, pas une page à indexer. On désigne la page d'accueil comme
    // page officielle (canonical) et on donne le bon nom + une description.
    const seo = `<link rel="canonical" href="https://hoop-manager.com/bienvenue">` +
      `<meta name="description" content="Hoop Manager : jeu de gestion de basket en ligne. Matchs diffusés en direct, ligue de 10 managers, entraînement, transferts aux enchères. Gratuit, dans le navigateur.">` +
      `<meta property="og:site_name" content="Hoop Manager"><meta property="og:title" content="Hoop Manager">`;
    html = html.replace(/<\/head>/i, `${seo}</head>`);
  }
  // Vraies pubs (voir server/ads.js) : rien sans ADSENSE_CLIENT.
  html = Ads.injectHead(html, Ads.adsConfig());
  // Même contenu pour tous les visiteurs → version compressée gardée en
  // mémoire (sendBody, cacheable).
  sendBody(res, 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }, Buffer.from(html, "utf-8"), true);
}

// Page d'accueil / inscription (assets/site/index.html) — voir
// server/accountRoutes.js pour les routes qu'elle appelle.
const SITE_HTML_PATH = path.join(ASSETS_DIR, "site", "index.html");
function serveSiteHtml(res) {
  let body;
  try {
    // Plus de script AdSense ici (écran d'inscription = pas de contenu
    // d'éditeur, refus AdSense du 2026-09-28) : voir server/site.js.
    body = fs.readFileSync(SITE_HTML_PATH);
  } catch (e) {
    sendJson(res, 500, { error: `Impossible de lire la page d'accueil : ${e.message}` });
    return;
  }
  sendBody(res, 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }, body, true);
}

// ---------------------------------------------------------------------
// VERROU DE SAUVEGARDE (2026-09-26) : chaque requête qui touche une
// sauvegarde fait "charger toute la ligue -> modifier -> tout réécrire".
// Deux requêtes simultanées (deux managers, ou deux onglets) pouvaient donc
// s'écraser : la seconde réécrivait une copie qui ne contenait pas la
// modification de la première. Les requêtes à état passent désormais une
// par une (un seul process Node : un simple verrou en mémoire suffit). Les
// fichiers statiques (page, images, sw.js) ne sont jamais bloqués.
// ---------------------------------------------------------------------
let saveLockTail = Promise.resolve();
function acquireSaveLock() {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const previous = saveLockTail;
  saveLockTail = saveLockTail.then(() => held);
  return previous.then(() => {
    let done = false;
    return () => { if (!done) { done = true; release(); } };
  });
}

// Monde (championnats par pays, voir server/world.js:catchUpWorld) : fait
// avancer TOUTES les ligues (même sans manager connecté) et bascule les
// saisons de chaque pays ensemble (montées/descentes, reprise). Au plus une
// fois toutes les WORLD_CATCHUP_INTERVAL_MS par fichier de ligue ; appelée
// sous le verrou de sauvegarde (requête avec jeton, ou minuterie de
// startServer).
const WORLD_CATCHUP_INTERVAL_MS = 10 * 60 * 1000;
// Chat de la ligue de chaque fichier de ligue (voir createHandler) : le
// rattrapage de fond y écrit les messages automatiques dus.
const leagueChatServices = new Map();
const lastWorldCatchUpAt = new Map();
// Échéance de Coupe nationale (coup d'envoi du jeudi 20:00, fin de
// diffusion) : rattrapage forcé dès qu'elle est passée, pour que le direct
// démarre à l'heure et pas jusqu'à 10 minutes plus tard.
const nextWorldDeadlineAt = new Map();
async function maybeCatchUpWorld(multiSavePath, now, force = false, accountsPath = store.defaultAccountsPath()) {
  const last = lastWorldCatchUpAt.get(multiSavePath) || 0;
  const deadline = nextWorldDeadlineAt.get(multiSavePath);
  const due = deadline != null && now >= deadline;
  if (!force && !due && now - last < WORLD_CATCHUP_INTERVAL_MS && now >= last) return [];
  lastWorldCatchUpAt.set(multiSavePath, now);
  try {
    const chat = leagueChatServices.get(multiSavePath);
    const events = await World.catchUpWorld(multiSavePath, now, {
      tickLeague: (lg, t) => { const evs = tick(lg, t).events; stashRecapEvents(lg, evs); return evs; },
      // Chat de la ligue : messages automatiques écrits même sans lecteur.
      flushLeague: chat ? (id, lg, world) => chat.flushSystem({ league: lg, leagueId: id, world }, now) : null,
    });
    nextWorldDeadlineAt.set(multiSavePath, events.nextDeadlineAt == null ? null : events.nextDeadlineAt);
    // Clubs rendus à l'IA (managers inactifs) : le compte garde la trace du
    // club pour le lui rendre s'il revient (voir World.reclaimClub).
    const released = events.filter(e => e.type === "club-released" && e.token);
    if (released.length) {
      try {
        const data = await Accounts.loadAccounts(accountsPath);
        let dirty = false;
        released.forEach(ev => {
          const acc = Accounts.findByManagerToken(data, ev.token);
          if (!acc) return;
          acc.managerToken = null;
          acc.releasedClub = { leagueId: ev.leagueId, idx: ev.idx, name: ev.name, at: ev.at, reason: ev.reason };
          dirty = true;
        });
        if (dirty) await Accounts.saveAccounts(data, accountsPath);
      } catch (e) { console.warn("[monde] mise à jour des comptes après libération de clubs échouée :", e.message); }
    }
    return events;
  } catch (e) {
    console.warn("[monde] rattrapage des championnats échoué :", e.message);
    return [];
  }
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
  // Compressé si le navigateur l'accepte (la sauvegarde d'une ligue pèse
  // plusieurs centaines de Ko), voir sendBody.
  sendBody(res, statusCode, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify(payload));
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
  if (!token) return { ok: false, status: 401, error: "Connexion requise." };
  // Championnats par pays (2026-09-28, voir server/world.js) : le jeton
  // désigne un club dans UN des championnats du monde (Division I
  // française = la ligue partagée historique) ; seul celui-là est chargé,
  // et le calendrier passe dans le fuseau horaire de son pays.
  const world = await World.loadWorld(multiSavePath, now);
  if (!world) {
    return { ok: false, status: 404, error: "Aucune ligue multi-manager n'existe encore (voir /api/admin/new-multi-league)." };
  }
  const found = await World.findTeamByToken(world, token, multiSavePath);
  if (!found) {
    return { ok: false, status: 401, error: "Jeton de manager inconnu ou invalide." };
  }
  // Ligues du monde : c'est server/world.js:catchUpWorld (tâche de fond)
  // qui fait redémarrer toutes les ligues d'un pays ensemble.
  found.league.autoNextSeason = false;
  World.useLeagueTimeZone(found.league);
  // Présence en mémoire pour le chat de la ligue (« N en ligne »), sans
  // écriture disque — voir server/leagueChat.js.
  LeagueChat.touchPresence(token, now);
  // Dernière visite du manager (managers inactifs, voir
  // World.releaseInactiveManagers) : enregistrée au plus toutes les 6 h.
  {
    const me = found.league.teams[found.teamIndex];
    if (me && (typeof me.lastSeenAt !== "number" || now - me.lastSeenAt > 6 * 3600 * 1000)) {
      me.lastSeenAt = now;
      await store.saveMultiLeague(found.league, multiSavePath);
    }
  }
  // Coupe nationale : tour en attente du club (ordres préparés, verrou).
  {
    const cup = (world.cups || {})[found.league.country || World.DEFAULT_COUNTRY];
    found.league.nationalCupPending = cup && !found.league.cup && cup.season === (found.league.seasonNumber || 1)
      ? World.NationalCup.pendingViewFor(cup, found.leagueId, found.teamIndex) : null;
  }
  // Barrage 7e-8e seulement s'il a un enjeu (voir World.divisionMovesFor).
  found.league.barrageHasStakes = World.divisionMovesFor(world, found.leagueId).barrage;
  return { ok: true, league: found.league, teamIndex: found.teamIndex, isMulti: true, savePath: multiSavePath, world, leagueId: found.leagueId };
}

// Coupe nationale du pays d'un manager, projetée pour sa ligue (voir
// NationalCup.projectForLeague) — null hors ligue du monde ou sans Coupe
// pour la saison en cours.
async function nationalCupProjection(ctx, multiSavePath) {
  const world = ctx.world;
  const country = ctx.league.country || World.DEFAULT_COUNTRY;
  const season = ctx.league.seasonNumber || 1;
  const cup = world && (world.cups || {})[country];
  const sc = world && (world.superCups || {})[country];
  const hasCup = cup && cup.season === season;
  const hasSc = sc && !sc.none && sc.season === season;
  if (!hasCup && !hasSc) return null;
  const cache = new Map([[ctx.leagueId, ctx.league]]);
  const loadTeam = async ref => {
    if (!cache.has(ref.leagueId)) cache.set(ref.leagueId, await World.loadLeague(world, ref.leagueId, multiSavePath));
    const lg = cache.get(ref.leagueId);
    return lg ? lg.teams[ref.idx] || null : null;
  };
  const out = hasCup ? await World.NationalCup.projectForLeague(Engine, cup, ctx.leagueId, ctx.teamIndex, loadTeam) : { cup: null, guests: [] };
  if (hasSc) {
    const p = await World.NationalCup.projectSuperCup(Engine, sc, ctx.leagueId, ctx.teamIndex, loadTeam);
    out.superCup = p.superCup;
    if (p.guest) out.guests.push(p.guest);
  }
  return out;
}

// Clubs invités de la Coupe nationale pour le scouting (routes
// /api/scouting/*) : l'adversaire d'un autre championnat du tour en attente,
// rangé dans ctx.league.guestTeamsByIdx (jamais sauvegardé) avec sa ligue
// d'origine (classement, forme) — voir server/scouting.js:teamAt.
async function attachNationalCupGuests(ctx, multiSavePath) {
  const pending = ctx.league && ctx.league.nationalCupPending;
  const m = pending && pending.matches[0];
  if (!m || m.bye) return;
  const guestIdx = World.NationalCup.guestIdxForRound(pending.index);
  if (m.home !== guestIdx && m.away !== guestIdx) return;
  const cup = (ctx.world.cups || {})[ctx.league.country || World.DEFAULT_COUNTRY];
  const round = cup && cup.rounds[pending.index];
  const mine = ref => ref && ref.leagueId === ctx.leagueId && ref.idx === ctx.teamIndex;
  const real = round && round.matches.find(x => mine(x.home) || mine(x.away));
  const oppRef = real && (mine(real.home) ? real.away : real.home);
  if (!oppRef) return;
  const lg = await World.loadLeague(ctx.world, oppRef.leagueId, multiSavePath);
  const team = lg && lg.teams[oppRef.idx];
  if (!team) return;
  team.guestLeague = lg;
  team.guestIdx = oppRef.idx;
  ctx.league.guestTeamsByIdx = new Map([[guestIdx, team]]);
}

// Amicaux entre championnats (server/worldFriendlies.js) : données annexes
// du monde, jours d'amicaux « monde » posés sur la ligue (conflits), liste
// fusionnée pour le navigateur.
async function loadWorldFriendlies(multiSavePath) {
  return (await store.loadWorldAuxRaw("friendlies", multiSavePath)) || World.WorldFriendlies.emptyStore();
}
function attachWorldFriendlyDays(league, leagueId, fstore) {
  league.worldFriendlyDays = World.WorldFriendlies.friendlyDaysByIdx(fstore, leagueId);
}
function mergedFriendlies(ctx, fstore, now = Date.now()) {
  const own = Friendlies.sanitizeFriendliesForViewer(ctx.league.friendlies, ctx.teamIndex, now);
  if (!ctx.world || !fstore) return { friendlies: own, guests: [] };
  const w = World.WorldFriendlies.projectForViewer(fstore, ctx.leagueId, ctx.teamIndex, now);
  return { friendlies: own.concat(w.friendlies), guests: w.guests };
}
function worldRefOf(world, leagueId, league, idx) {
  const e = world.leagues.find(x => x.id === leagueId);
  const t = league.teams[idx];
  return { leagueId, idx, name: t ? t.name : "?", country: league.country || (e && e.country) || "fr", label: e ? World.divisionLabel(e.level, e.group) : "" };
}

// Pseudo du manager (voir /api/manager/set-pseudo et
// Engine.checkManagerPseudo). Même règle de délai que le trigramme (voir
// actions.js:setTeamTrigram) : le premier choix est libre
// (managerPseudoChangedAt = 0), puis un changement tous les 30 jours.
// Réponse : jamais que le pseudo et sa date, rien du compte.
async function setManagerPseudo(ctx, body, now, multiSavePath) {
  const team = ctx.league.teams[ctx.teamIndex];
  if (!team || !team.isHuman) return { ok: false, status: 403, error: "Réservé aux managers." };
  const view = () => ({ ok: true, pseudo: team.managerPseudo || null, pseudoChangedAt: typeof team.managerPseudoChangedAt === "number" ? team.managerPseudoChangedAt : null, displayName: Engine.managerDisplayName(team) });
  const checked = Engine.checkManagerPseudo(body && body.pseudo);
  if (checked.error) return { ok: false, code: "pseudo-invalid", error: checked.error };
  const value = checked.value;
  if (team.managerPseudo === value) return view();
  const sameKey = team.managerPseudo && Engine.managerPseudoKey(team.managerPseudo) === Engine.managerPseudoKey(value);
  const changedAt = team.managerPseudoChangedAt;
  // Simple changement de casse/accents de son propre pseudo : toujours permis.
  if (!sameKey && typeof changedAt === "number" && changedAt > 0 && now - changedAt < Engine.MANAGER_PSEUDO_CHANGE_COOLDOWN_MS) {
    const days = Math.ceil((Engine.MANAGER_PSEUDO_CHANGE_COOLDOWN_MS - (now - changedAt)) / (24 * 3600 * 1000));
    return { ok: false, status: 429, code: "pseudo-cooldown", error: `Pseudo déjà modifié récemment : prochain changement possible dans ${days} jour${days > 1 ? "s" : ""}.` };
  }
  const key = Engine.managerPseudoKey(value);
  const takenHere = ctx.league.teams.some((t, i) => i !== ctx.teamIndex && t && t.isHuman && t.managerPseudo && Engine.managerPseudoKey(t.managerPseudo) === key);
  let taken = takenHere;
  if (!taken && ctx.world) {
    taken = await World.isManagerPseudoTakenInWorld(ctx.world, multiSavePath, value, { leagueId: ctx.leagueId, idx: ctx.teamIndex });
    World.useLeagueTimeZone(ctx.league);
  }
  if (taken) return { ok: false, status: 409, code: "pseudo-taken", error: "Ce pseudo est déjà pris par un autre manager." };
  team.managerPseudo = value;
  if (!sameKey) team.managerPseudoChangedAt = typeof changedAt === "number" ? now : 0;
  return view();
}

// `async` — voir resolvePlayerContext juste au-dessus, même raison.
async function persistContext(ctx) {
  try { await Push.flushLeague(ctx.league, Date.now()); } catch (e) { console.warn("[notifications]", e.message); }
  await store.saveMultiLeague(ctx.league, ctx.savePath);
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
  // Bascule en pleine saison vers le rythme hebdomadaire (retour
  // utilisateur, 2026-09-27 : "bascule en pleine saison oui") : toute ligue
  // encore au rythme quotidien passe au rythme mardi/samedi (coupe le jeudi)
  // dès la première requête, sans rien perdre de ce qui est déjà joué — voir
  // Engine.migrateLeagueToWeeklyRhythm. No-op ensuite (idempotente).
  if (Engine.migrateLeagueToWeeklyRhythm && league && league.calendarDailyAnchored && !league.calendarWeeklyRhythm) {
    const sw = Engine.migrateLeagueToWeeklyRhythm(league, now);
    if (sw) console.log(`[calendrier] Ligue basculée au rythme hebdomadaire : journée ${sw.fromRound + 1} le ${new Date(sw.anchorAt).toISOString()}, coupe à partir du tour ${sw.fromCupRound + 1}.`);
  }
  // Remise à 100 de la forme physique de tous les joueurs, une seule fois
  // (retour utilisateur, 2026-09-27 : "peux-tu réinitialiser les formes des
  // joueurs ?"), seulement pour la ligue partagée qui a connu le rythme
  // quotidien — voir Engine.resetAllPlayerConditionsOnce.
  if (Engine.resetAllPlayerConditionsOnce && league && league.calendarWeeklySwitch) {
    const n = Engine.resetAllPlayerConditionsOnce(league, "conditionReset-2026-09-27", now);
    if (n) console.log(`[maintenance] Forme physique remise à 100 pour ${n} joueurs.`);
  }
  AutoSim.ensureLiveMatch(league, now);
  const events = AutoSim.catchUpLeague(league, now);
  // Ligues privées (voir server/privateLeague.js) : journées du vendredi
  // (heure choisie par le créateur) dues, simulées sur des copies des équipes — indépendantes du
  // rattrapage officiel ci-dessus (rien en commun, ni saison ni play-offs).
  PrivateLeague.catchUpPrivateLeagues(Engine, league, now);
  // Matchs amicaux (voir server/friendlies.js) : joués à l'heure choisie,
  // sur les vrais joueurs (fatigue, blessures, progression).
  Friendlies.catchUpFriendlies(Engine, league, now);
  // Histoire du club (voir Engine.archiveSeasonForTeam) : la saison est
  // archivée sur chaque club humain dès que le champion est connu —
  // idempotent, donc sans risque de la répéter à chaque requête.
  if (league.isPlayoffsDone && league.isPlayoffsDone()) {
    // Récompenses de fin de saison, carrière, succès (idempotent).
    if (Engine.awardSeasonHonours) Engine.awardSeasonHonours(league, now);
    league.teams.forEach((t, i) => {
      if (!t.isHuman) return;
      // Sponsors d'abord (bonus/rupture selon l'objectif), puis archive.
      Engine.settleSponsorsAtSeasonEnd(league, i, now);
      Engine.archiveSeasonForTeam(league, i, now);
    });
  }
  // Sponsors : nouvelles offres pour les clubs humains (voir
  // Engine.refreshSponsorOffers). Signalées par une TÂCHE du tableau de bord
  // (retour utilisateur 2026-09-26), pas par le fil d'actu.
  league.teams.forEach(t => { if (t.isHuman) Engine.refreshSponsorOffers(t, league, now); });
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
  // Ordres préparés à l'avance : promus en ordres en direct dès que leur
  // journée devient le prochain match du club (voir
  // League.promoteImmediatePlan côté moteur — "les ordres sautent").
  if (league.promoteImmediatePlan) league.teams.forEach((t, i) => { if (t.isHuman) league.promoteImmediatePlan(i); });
  // Trigramme (2026-09-27) : un trigramme "personnalisé" identique au
  // trigramme par défaut n'en est pas un — on le remet à null et on annule
  // le délai de 30 jours qu'il avait déclenché à tort (clubs bloqués avant
  // le correctif de actions.setTeamTrigram).
  league.teams.forEach(t => {
    if (t.isHuman && t.trigram && t.trigram === Engine.defaultTrigramForName(t.name)) {
      t.trigram = null;
      t.trigramChangedAt = null;
    }
  });
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
// Récapitulatif d'absence (écran « Pendant votre absence ») : les
// évènements joués par un rattrapage de FOND (maybeCatchUpWorld, sans
// requête du manager) sont gardés sur chaque club humain et rendus à sa
// prochaine requête /api/state — sinon ils étaient perdus et le manager ne
// voyait jamais le résumé de ce qui s'était joué en son absence.
const PENDING_RECAP_MAX = 60;
function stashRecapEvents(league, events) {
  if (!league || !Array.isArray(events) || !events.length) return;
  league.teams.forEach((team, idx) => {
    if (!team || !team.isHuman) return;
    const mine = personalizeEventsForTeam(events, idx);
    if (!mine.length) return;
    team.pendingRecapEvents = [...(team.pendingRecapEvents || []), ...mine].slice(-PENDING_RECAP_MAX);
  });
}
function takePendingRecapEvents(league, teamIndex) {
  const team = league && league.teams[teamIndex];
  if (!team || !Array.isArray(team.pendingRecapEvents) || !team.pendingRecapEvents.length) return [];
  const out = team.pendingRecapEvents;
  team.pendingRecapEvents = [];
  return out;
}

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
// Ligues privées (voir server/privateLeague.js) : mêmes signatures que les
// autres actions, Engine résolu ici ; chaque réponse renvoie AUSSI la liste
// des ligues privées telle que ce manager a le droit de la voir (code
// d'invitation masqué hors membres), pour que le navigateur se mette à jour
// sans recharger toute la sauvegarde.
function privateLeagueAction(fn) {
  return (team, teamIndex, league, body, now) => {
    const result = fn(Engine, team, teamIndex, league, body, now);
    if (!result.ok) return result;
    return { ...result, privateLeagues: PrivateLeague.sanitizePrivateLeaguesForViewer(league.privateLeagues, teamIndex) };
  };
}

// Matchs amicaux (voir server/friendlies.js) : même principe que les ligues
// privées, chaque réponse renvoie la liste des amicaux de CE manager.
// `notify` (invitation à un club humain) est traité par le gestionnaire
// générique plus bas : message privé envoyé de la part du club qui invite.
function friendlyAction(fn) {
  return (team, teamIndex, league, body, now) => {
    const result = fn(Engine, team, teamIndex, league, body, now);
    if (!result.ok) return result;
    return { ...result, friendlies: Friendlies.sanitizeFriendliesForViewer(league.friendlies, teamIndex, now) };
  };
}

const ACTION_ROUTES = {
  "/api/friendly/propose": friendlyAction(Friendlies.proposeFriendly),
  "/api/friendly/respond": friendlyAction(Friendlies.respondFriendly),
  "/api/friendly/cancel": friendlyAction(Friendlies.cancelFriendly),
  "/api/friendly/lineup": friendlyAction(Friendlies.setFriendlyLineup),
  "/api/lineup": actions.setLineup,
  "/api/private-league/create": privateLeagueAction(PrivateLeague.createPrivateLeague),
  "/api/private-league/join": privateLeagueAction(PrivateLeague.joinPrivateLeague),
  "/api/private-league/leave": privateLeagueAction(PrivateLeague.leavePrivateLeague),
  "/api/private-league/start": privateLeagueAction(PrivateLeague.startPrivateLeague),
  "/api/tactics": actions.setTactics,
  "/api/training": actions.setTraining,
  "/api/plan": actions.setPlan,
  "/api/tactic-presets": actions.setTacticPresets,
  "/api/market/list": actions.listPlayer,
  "/api/roster/sell-listed": actions.sellListedPlayer,
  "/api/market/bid": actions.bidOnListing,
  "/api/market/coach-bid": actions.bidOnCoachListing,
  // Enchère automatique (plafond), tous marchés — voir actions.setAutoBid.
  "/api/market/auto-bid": actions.setAutoBid,
  "/api/arena": actions.upgradeArena,
  "/api/arena/build-seats": actions.buildArenaSeats,
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
  // Staff médical (médecin/kiné, voir server/actions.js makeMedicalBidAction).
  "/api/market/doctor-bid": actions.bidOnDoctorListing,
  "/api/staff/fire-doctor": actions.fireDoctor,
  "/api/market/physio-bid": actions.bidOnPhysioListing,
  "/api/staff/fire-physio": actions.firePhysio,
  "/api/market/assistant-bid": actions.bidOnAssistantCoachListing,
  "/api/market/watch": actions.setMarketWatch,
  "/api/market/alert": actions.setMarketAlert,
  "/api/staff/fire-assistant": actions.fireAssistantCoach,
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
  // Retraite : convaincre un joueur de repousser sa retraite d'un an (voir
  // server/actions.js et RETIREMENT_ANNOUNCE_CHANCE_BY_AGE côté moteur).
  "/api/player/retirement-talk": actions.talkRetirement,
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
  "/api/club/set-trigram": actions.setTeamTrigram,
  "/api/sponsors/accept": actions.acceptSponsor,
  "/api/sponsors/decline": actions.declineSponsor,
  "/api/sponsors/terminate": actions.terminateSponsor,
  "/api/club/set-arena-name": actions.setTeamArenaName,
  "/api/club/set-court-style": actions.setTeamCourtStyle,
  "/api/player/set-jersey-number": actions.setPlayerJerseyNumber,
  "/api/player/set-look": actions.setPlayerLook,
  // Hall of Fame + maillots retirés (voir Team.inductHallOfFame).
  "/api/club/hall-of-fame/induct": actions.inductHallOfFame,
  "/api/club/hall-of-fame/retire-jersey": actions.setRetiredJersey,
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
    const prevTeamByName = new Map();
    previous.league.teams.forEach((t, i) => {
      if (!t.isHuman) return;
      // Histoire du club : la saison qui s'achève est archivée sur l'ancien
      // club (idempotent si tick() l'a déjà fait), puis reportée ci-dessous.
      Engine.settleSponsorsAtSeasonEnd(previous.league, i, now);
      Engine.archiveSeasonForTeam(previous.league, i, now);
      if (t.managerLinkToken) prevTokenByName.set(t.name, t.managerLinkToken);
      prevTeamByName.set(t.name, t);
    });
    created.league.teams.forEach(t => {
      if (!t.isHuman) return;
      if (prevTokenByName.has(t.name)) t.managerLinkToken = prevTokenByName.get(t.name);
      const prev = prevTeamByName.get(t.name);
      if (!prev) return;
      // Ce qui appartient au CLUB (pas à la saison) survit au nouveau départ :
      // histoire, records, légendes, trophées, année de fondation, trigramme
      // et nom de salle. L'effectif, lui, est régénéré comme avant.
      t.seasonHistory = Array.isArray(prev.seasonHistory) ? prev.seasonHistory : [];
      t.clubRecords = prev.clubRecords || {};
      t.allTimePlayers = prev.allTimePlayers || {};
      t.hallOfFame = Array.isArray(prev.hallOfFame) ? prev.hallOfFame : [];
      t.trophies = Array.isArray(prev.trophies) ? prev.trophies : [];
      if (prev.foundedYear) t.foundedYear = prev.foundedYear;
      t.trigram = prev.trigram || null;
      t.trigramChangedAt = typeof prev.trigramChangedAt === "number" ? prev.trigramChangedAt : null;
      t.arenaName = prev.arenaName || null;
      // Le manager reste le même : son pseudo aussi.
      t.managerPseudo = prev.managerPseudo || null;
      t.managerPseudoChangedAt = typeof prev.managerPseudoChangedAt === "number" ? prev.managerPseudoChangedAt : null;
      // Sponsors : la réputation et l'historique suivent le club ; les
      // contrats (une saison) viennent d'être réglés, les offres repartent.
      t.sponsorReputation = typeof prev.sponsorReputation === "number" ? prev.sponsorReputation : Engine.SPONSOR_REPUTATION_DEFAULT;
      t.sponsorHistory = Array.isArray(prev.sponsorHistory) ? prev.sponsorHistory : [];
    });
  }
  await store.saveMultiLeague(created.league, multiSavePath);
  return { ok: true, managers: managerLinksFor(created.league, req) };
}

// Fabrique le handler HTTP. `savePath`/`multiSavePath` et `nowFn`
// injectables — indispensable pour tester ce serveur sans dépendre du vrai
// disque/de la vraie horloge (voir server/index_test.js).
function createHandler(savePath = store.defaultSavePath(), nowFn = Date.now, multiSavePath = store.defaultMultiLeaguePath(), accountsPath = store.defaultAccountsPath()) {
  // Messagerie : stockée à côté de la ligue partagée (voir server/messages.js).
  // Messagerie mondiale : championnat d'un correspondant d'ailleurs, lu à la
  // demande (voir server/messages.js, resolveOther).
  const messages = Messages.createService(Messages.messagesPathFor(multiSavePath), {
    loadLeague: async (id) => {
      const world = await World.loadWorld(multiSavePath, Date.now());
      if (!world || !world.leagues.some(e => e.id === id)) return null;
      const lg = await World.loadLeague(world, id, multiSavePath);
      if (lg && !lg.leagueId) lg.leagueId = id;
      return lg;
    },
  });
  // Chat de la ligue (voir server/leagueChat.js) : fin de diffusion de
  // chaque journée (horodatage des résultats) et zones du championnat. Le
  // nom des managers est leur pseudo (Team.managerPseudo), lu dans la ligue.
  const leagueChat = LeagueChat.createService(multiSavePath, {
    systemOpts: (ctx) => ({
      relegations: ctx.world ? World.divisionMovesFor(ctx.world, ctx.leagueId).relegations : 0,
      roundEndAt: (r) => {
        const at = scheduledTimeForLeagueRound(ctx.league, r);
        return typeof at === "number" ? at + Calendar.MATCH_BROADCAST_DURATION_MS : null;
      },
    }),
  });
  leagueChatServices.set(multiSavePath, leagueChat);
  const handleAccountRoutes = AccountRoutes.createAccountRouter({
    sendJson, readJsonBody, getManagerToken, originFor, isAdminAuthorized, multiSavePath, accountsPath,
  });
  return async function handler(req, res) {
    let releaseSaveLock = null;
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

      // Application mobile (voir serveServiceWorker/serveManifest plus haut) :
      // comme "/", aucune sauvegarde touchée.
      if (route.pathname === "/sw.js" && req.method === "GET") {
        serveServiceWorker(res);
        return;
      }
      // /favicon.ico (2026-09-29, retour « le favicon est toujours orange ») :
      // Safari et d'autres navigateurs le demandent d'office et gardent
      // l'ancien en cache tant que cette adresse ne répond rien. On y sert le
      // favicon jaune (PNG, accepté par tous les navigateurs actuels).
      if (route.pathname === "/favicon.ico" && req.method === "GET") {
        fs.readFile(path.join(ASSETS_DIR, "mobile", "favicon-32.png"), (err, data) => {
          if (err) { sendJson(res, 404, { error: "Fichier introuvable" }); return; }
          res.writeHead(200, { "Content-Type": "image/png", "Content-Length": data.length, "Cache-Control": "public, max-age=86400" });
          res.end(data);
        });
        return;
      }
      if (route.pathname === "/manifest.webmanifest" && req.method === "GET") {
        serveManifest(res, route.searchParams ? route.searchParams.get("m") : null);
        return;
      }

      // Assets statiques (visuels de la Salle) — voir serveAsset plus haut ;
      // avant `now`/toute sauvegarde, exactement comme "/", puisque charger
      // une image n'a aucune raison de toucher à une carrière.
      if (route.pathname.startsWith("/assets/") && req.method === "GET") {
        serveAsset(res, route.pathname);
        return;
      }

      // ads.txt (voir server/ads.js) : 404 tant qu'ADSENSE_CLIENT n'est pas défini.
      if (route.pathname === "/ads.txt" && req.method === "GET") {
        const txt = Ads.adsTxt(Ads.adsConfig());
        if (!txt) { sendJson(res, 404, { error: "Aucune pub configurée." }); return; }
        const body = Buffer.from(txt, "utf-8");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": body.length, "Cache-Control": "public, max-age=3600" });
        res.end(body);
        return;
      }

      // Pages publiques de contenu + robots.txt/sitemap.xml (server/site.js).
      if (req.method === "GET") {
        const page = Site.render(route.pathname, { discordInvite: process.env.DISCORD_INVITE_URL || null });
        if (page) {
          const body = Buffer.from(page.body, "utf-8");
          sendBody(res, page.status, { "Content-Type": page.contentType, "Cache-Control": "public, max-age=600" }, body, true);
          return;
        }
      }

      // Page d'accueil / inscription (voir serveSiteHtml).
      if ((route.pathname === "/bienvenue" || route.pathname === "/welcome") && req.method === "GET") {
        serveSiteHtml(res);
        return;
      }

      releaseSaveLock = await acquireSaveLock();
      const now = nowFn();
      if (getManagerToken(req)) await maybeCatchUpWorld(multiSavePath, now, false, accountsPath);

      // Comptes joueurs + Discord (voir server/accountRoutes.js).
      if (await handleAccountRoutes(req, res, route, now)) return;

      // Plus de carrière solo (2026-09-29) : sans jeton manager, seules
      // restent ouvertes /api/health, les routes admin (secret
      // X-Admin-Token) et les comptes (ci-dessus).
      if (route.pathname.startsWith("/api/")
          && route.pathname !== "/api/health" && !route.pathname.startsWith("/api/admin/")
          && !getManagerToken(req)) {
        sendJson(res, 401, { ok: false, code: "login-required", error: "Connexion requise." });
        return;
      }

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

      // Recalibrage des clubs de l'IA des ligues déjà créées (audit moteur
      // 2026-09-29, voir Engine.recalibrateCpuTeams) : les clubs IA générés
      // avant la baisse de niveau (≈63 de moyenne en Division I) sont
      // ramenés au niveau d'un club IA généré aujourd'hui dans la même
      // division (≈42). Body : { dryRun?: true par défaut, leagueId? } —
      // dryRun renvoie le rapport sans rien écrire ; { "dryRun": false }
      // applique. Idempotent : un club déjà au niveau n'est plus touché.
      if (route.pathname === "/api/admin/recalibrate-cpu" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const dryRun = !(body && body.dryRun === false);
        const world = await World.loadWorld(multiSavePath, now);
        if (!world) { sendJson(res, 404, { ok: false, error: "Aucune ligue partagée n'existe encore." }); return; }
        const leagues = [];
        for (const entry of world.leagues) {
          if (body && body.leagueId && entry.id !== body.leagueId) continue;
          const lg = await World.loadLeague(world, entry.id, multiSavePath);
          if (!lg) continue;
          const report = Engine.recalibrateCpuTeams(lg, { dryRun });
          const changed = report.teams.filter(t => t.changed).length;
          if (!dryRun && changed) {
            await store.saveMultiLeague(lg, multiSavePath);
            if (world.summaries) world.summaries[entry.id] = World.leagueSummary(entry, lg);
          }
          leagues.push({ leagueId: entry.id, label: World.divisionLabel(entry.level, entry.group), country: entry.country || null, changed, ...report });
        }
        if (!dryRun) await World.saveWorld(world, multiSavePath);
        sendJson(res, 200, { ok: true, dryRun, clubsChanged: leagues.reduce((s, l) => s + l.changed, 0), leagues });
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

      // Planète Hoop (voir server/world.js) : pays, championnats et clubs du
      // monde, en lecture seule. Réservé aux managers d'une ligue partagée.
      if (route.pathname.startsWith("/api/world/") && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        if (!ctx.world) { sendJson(res, 404, { ok: false, error: "Planète Hoop n'est disponible qu'en ligue partagée." }); return; }
        const world = ctx.world;
        const q = route.searchParams;
        if (route.pathname === "/api/world/overview") {
          const myCountry = ctx.league.country || World.DEFAULT_COUNTRY;
          const country = World.isOpenCountry(q.get("country")) ? q.get("country") : myCountry;
          const countries = World.publicCountries().map(c => {
            const st = (world.countryStats || {})[c.code];
            return { ...c, managers: st ? st.managers : 0, leagueCount: World.leaguesOfCountry(world, c.code).length };
          });
          sendJson(res, 200, { ok: true, myCountry, myLeagueId: ctx.leagueId, country, countries,
            stats: (world.countryStats || {})[country] || null, history: ((world.history || {})[country]) || [] });
          return;
        }
        // Aperçu d'un pays (retour utilisateur 2026-09-30, « comme l'aperçu du
        // pays de BuzzerBeater ») : carte du pays, divisions, Coupe, leaders et
        // meilleures performances de la saison, titres, palmarès, classement
        // des managers du pays. Voir
        // World.countryOverview (registre seulement, aucune ligue rechargée).
        if (route.pathname === "/api/world/country") {
          const myCountry = ctx.league.country || World.DEFAULT_COUNTRY;
          const code = q.get("code") || q.get("country");
          const country = World.isOpenCountry(code) ? code : myCountry;
          const countries = World.publicCountries().map(c => {
            const st = (world.countryStats || {})[c.code];
            return { code: c.code, name: c.name, managers: st ? st.managers : 0, leagueCount: World.leaguesOfCountry(world, c.code).length };
          });
          sendJson(res, 200, { ok: true, myCountry, myLeagueId: ctx.leagueId, myTeamIndex: ctx.teamIndex, countries,
            overview: World.countryOverview(world, country, { myCountry }) });
          return;
        }
        if (route.pathname === "/api/world/managers") {
          // Classement mondial des managers (World.managerRanking). Son propre
          // championnat est relu à l'instant (les résumés ont jusqu'à 10 min).
          if (world.summaries && world.summaries[ctx.leagueId]) {
            const entry = world.leagues.find(e => e.id === ctx.leagueId);
            if (entry) world.summaries[ctx.leagueId] = World.leagueSummary(entry, ctx.league);
          }
          sendJson(res, 200, { ok: true, ...World.managerRanking(world, { leagueId: ctx.leagueId, idx: ctx.teamIndex }) });
          return;
        }
        if (route.pathname === "/api/world/league") {
          const id = q.get("id") || ctx.leagueId;
          const entry = world.leagues.find(e => e.id === id);
          if (!entry) { sendJson(res, 404, { ok: false, error: "Championnat introuvable." }); return; }
          let summary = (world.summaries || {})[id];
          if (!summary) {
            const lg = await World.loadLeague(world, id, multiSavePath);
            summary = lg ? World.leagueSummary(entry, lg) : null;
          }
          if (!summary) { sendJson(res, 404, { ok: false, error: "Championnat introuvable." }); return; }
          sendJson(res, 200, { ok: true, league: summary, mine: id === ctx.leagueId });
          return;
        }
        if (route.pathname === "/api/world/club") {
          const id = q.get("league");
          const idx = Number(q.get("idx"));
          const entry = world.leagues.find(e => e.id === id);
          const lg = entry ? await World.loadLeague(world, id, multiSavePath) : null;
          const roster = lg && Number.isInteger(idx) ? World.clubRoster(lg, idx) : null;
          if (!roster) { sendJson(res, 404, { ok: false, error: "Club introuvable." }); return; }
          sendJson(res, 200, { ok: true, club: { ...roster, leagueId: id, label: World.divisionLabel(entry.level, entry.group) } });
          return;
        }
        // Fiche équipe d'un club d'un AUTRE championnat (retour utilisateur
        // 2026-09-29 : « il faut pouvoir cliquer et ouvrir la page équipe des
        // équipes d'un autre championnat [...] pas l'effectif ») : le
        // championnat entier dans la forme de /api/save, pour que le
        // navigateur réutilise la fiche équipe habituelle (Aperçu,
        // Effectif, Calendrier, Analyse) en lecture seule. Rien de privé :
        // ni jetons, ni notifications, ni tactiques prévues, ni marché,
        // ni directs, ni ligues privées ou amicaux.
        // /api/world/league-page (2026-09-30) : même contenu, pour la vraie page
        // Ligue d'un autre championnat (showForeignLeague) : classement,
        // résultats, feuilles de match, leaders (matchLog), récompenses.
        // /api/world/player-page (2026-09-30, « impossible de cliquer sur le
        // nom des joueurs ») : même contenu + le joueur demandé (?team=&id=),
        // pour la fiche joueur habituelle en lecture seule
        // (showForeignPlayerDetail) : caractéristiques verrouillées comme pour
        // tout adversaire non scouté, stats de matchs publiques.
        if (route.pathname === "/api/world/team-page" || route.pathname === "/api/world/league-page" || route.pathname === "/api/world/player-page") {
          const id = q.get("league");
          const entry = world.leagues.find(e => e.id === id);
          const lg = entry ? await World.loadLeague(world, id, multiSavePath) : null;
          if (!lg) { sendJson(res, 404, { ok: false, error: "Championnat introuvable." }); return; }
          const payload = store.serializeMultiLeague(lg);
          const out = payload.league;
          (out.teams || []).forEach(t => {
            if (!t) return;
            t.managerLinkToken = null; t.pushSubscriptions = []; t.pushKickoffKeys = []; t.pushAuctionKeys = [];
            t.plannedTactics = null; t.tacticPresets = []; t.marketWatchlist = []; t.marketAlerts = [];
          });
          delete out.liveMatches;
          out.liveMatch = null;
          out.coachListings = []; out.analystListings = []; out.recruiterListings = [];
          out.doctorListings = []; out.physioListings = []; out.assistantCoachListings = [];
          out.privateLeagues = []; out.friendlies = []; out.guestTeams = [];
          out.divisionMoves = World.divisionMovesFor(world, id);
          out.leagueId = out.leagueId || id;
          // Rien de caché des joueurs (caractéristiques, potentiel, traits) :
          // voir server/publicPlayers.js. Même pour son propre championnat
          // (« mine ») : le navigateur ouvre alors ses pages habituelles.
          PublicPlayers.sanitizeForeignLeague(out);
          delete out.humanTransferLog;
          let player = null;
          if (route.pathname === "/api/world/player-page") {
            const teamIdx = Number(q.get("team")), playerId = Number(q.get("id"));
            const team = Number.isInteger(teamIdx) ? lg.teams[teamIdx] : null;
            const p = team && (team.players || []).find(x => x.id === playerId);
            if (!p) { sendJson(res, 404, { ok: false, error: "Joueur introuvable." }); return; }
            player = { teamIdx, playerId, name: p.name, teamName: team.name };
          }
          sendJson(res, 200, { ok: true, league: out, label: World.divisionLabel(entry.level, entry.group), mine: id === ctx.leagueId, ...(player ? { player } : {}) });
          return;
        }
        // Coupe nationale (server/nationalCup.js) : parcours du manager + tours,
        // et matchs d'un tour (tableau complet, recherche, pagination).
        if (route.pathname === "/api/world/cup") {
          const country = ctx.league.country || World.DEFAULT_COUNTRY;
          const cup = (world.cups || {})[country] || null;
          if (!cup) { sendJson(res, 200, { ok: true, cup: null }); return; }
          const leagues = new Map([[ctx.leagueId, ctx.league]]);
          const mine = ref => ref && ref.leagueId === ctx.leagueId && ref.idx === ctx.teamIndex;
          for (const r of cup.rounds) {
            const m = r.matches.find(x => !x.resolved && (mine(x.home) || mine(x.away)));
            const opp = m && (mine(m.home) ? m.away : m.home);
            if (opp && !leagues.has(opp.leagueId)) leagues.set(opp.leagueId, await World.loadLeague(world, opp.leagueId, multiSavePath));
          }
          sendJson(res, 200, { ok: true, cup: World.NationalCup.viewForTeam(Engine, cup, leagues, ctx.leagueId, ctx.teamIndex) });
          return;
        }
        if (route.pathname === "/api/world/cup/round") {
          const country = World.isOpenCountry(q.get("country")) ? q.get("country") : (ctx.league.country || World.DEFAULT_COUNTRY);
          const cup = (world.cups || {})[country] || null;
          const data = cup && World.NationalCup.roundMatches(cup, Number(q.get("round") || 0), {
            offset: Number(q.get("offset") || 0), limit: Math.min(100, Number(q.get("limit") || 40)), q: q.get("q") || "",
            pendingOnly: q.get("pending") === "1", first: { leagueId: ctx.leagueId, idx: ctx.teamIndex },
          });
          if (!data) { sendJson(res, 404, { ok: false, error: "Tour introuvable." }); return; }
          sendJson(res, 200, { ok: true, round: data });
          return;
        }
        if (route.pathname === "/api/world/search") {
          sendJson(res, 200, { ok: true, ...World.searchWorld(world, q.get("q") || "") });
          return;
        }
        sendJson(res, 404, { ok: false, error: "Route inconnue." });
        return;
      }

      if (route.pathname === "/api/state" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const { events, changed } = tick(ctx.league, now);
        const pending = takePendingRecapEvents(ctx.league, ctx.teamIndex);
        if (changed || pending.length) await persistContext(ctx);
        sendJson(res, 200, { ...buildStateSnapshot(ctx.league, ctx.teamIndex, now), events: [...pending, ...personalizeEventsForTeam(events, ctx.teamIndex)] });
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
        const payload = store.serializeMultiLeague(ctx.league);
        payload.myTeamIndex = ctx.teamIndex;
        // SÉCURITÉ (2026-09-26, relevé en codant la messagerie) : la
        // sauvegarde complète contenait le jeton privé de TOUS les managers
        // (serializeTeam → managerLinkToken), donc n'importe quel manager
        // pouvait se faire passer pour un autre. Seul SON propre jeton est
        // renvoyé désormais — le navigateur n'utilise jamais ceux des autres.
        if (payload.league && Array.isArray(payload.league.teams)) {
          payload.league.teams.forEach((t, i) => { if (t && i !== ctx.teamIndex) { t.managerLinkToken = null; t.pushSubscriptions = []; } });
        }
        payload.league.liveMatch = LiveMatch.viewLiveMatchForTeam(ctx.league, ctx.teamIndex);
        delete payload.league.liveMatches;
        // Coupe nationale (server/nationalCup.js) : projetée dans la forme de
        // la Coupe interne, avec les clubs invités (adversaires d'un autre
        // championnat) joints à part.
        if (ctx.world && !ctx.league.cup) {
          const national = await nationalCupProjection(ctx, multiSavePath);
          if (national) {
            if (national.cup) payload.league.cup = national.cup;
            payload.league.guestTeams = national.guests;
            payload.league.superCup = national.superCup || null;
          }
        }
        // Amicaux entre championnats (server/worldFriendlies.js).
        if (ctx.world) {
          const fstore = await loadWorldFriendlies(multiSavePath);
          const merged = mergedFriendlies(ctx, fstore, now);
          payload.league.friendlies = merged.friendlies;
          payload.league.guestTeams = (payload.league.guestTeams || []).concat(merged.guests);
        }
        // Marché mondial (server/worldMarket.js) : annonces des autres
        // championnats + enchérisseurs d'ailleurs sur les siennes.
        if (ctx.world) {
          const own = World.WorldMarket.projectOwnForeignBidders(payload.league.transferListings);
          const index = await store.loadWorldAuxRaw("market", multiSavePath);
          const foreign = World.WorldMarket.projectForLeague(index, ctx.leagueId, ctx.teamIndex, now);
          payload.league.transferListings = own.listings.concat(foreign.listings);
          payload.league.guestTeams = (payload.league.guestTeams || []).concat(own.guests, foreign.guests);
        }
        // Enchères automatiques : plafonds des autres clubs secrets.
        MyAuctions.sanitizeAutoBids(payload.league, ctx.teamIndex);
        // Adversaires (et clubs invités) : rien de ce que le jeu ne montre
        // jamais pour un autre club (potentiel, motivation, académie…), voir
        // server/publicPlayers.js.
        PublicPlayers.sanitizeOwnLeagueForViewer(payload.league, ctx.teamIndex);
        (payload.league.guestTeams || []).forEach(g => PublicPlayers.sanitizeOwnLeagueForViewer({ teams: [g], transferListings: payload.league.transferListings }, -1));
        // Zones du classement réellement en jeu (montée / barrage / descentes),
        // voir World.divisionMovesFor. Absent = aucune division autour.
        if (ctx.world) payload.league.divisionMoves = World.divisionMovesFor(ctx.world, ctx.leagueId);
        // Ligues privées : le code d'invitation n'est envoyé qu'aux membres.
        payload.league.privateLeagues = PrivateLeague.sanitizePrivateLeaguesForViewer(payload.league.privateLeagues, ctx.teamIndex);
        // Matchs amicaux : seulement les siens, sans la compo de l'adversaire.
        payload.league.friendlies = Friendlies.sanitizeFriendliesForViewer(payload.league.friendlies, ctx.teamIndex, now);
        sendJson(res, 200, payload);
        return;
      }

      if (route.pathname === "/api/simulate-tick" && req.method === "POST") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const { events, changed } = tick(ctx.league, now);
        const pending = takePendingRecapEvents(ctx.league, ctx.teamIndex);
        if (changed || pending.length) await persistContext(ctx);
        sendJson(res, 200, { events: [...pending, ...personalizeEventsForTeam(events, ctx.teamIndex)], state: buildStateSnapshot(ctx.league, ctx.teamIndex, now) });
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
        sendJson(res, 200, { ok: true, teamName: watchedTeam.name, opponentName: opponent ? opponent.name : (live.guestName || "Club invité"), live });
        return;
      }

      // Scouting Pro — accès (verrouillé/débloqué/périmé, quota de pubs
      // restant) et rapport complet (voir server/scouting.js, le grand
      // commentaire en tête de ce fichier) : ?opponent=<index dans
      // league.teams>. Routes GET pures (aucune mutation, contrairement à
      // ad-ticket/ad-complete/set-premium ci-dessus, gérées par
      // ACTION_ROUTES) — pas de persistContext nécessaire au-delà du tick
      // déjà fait par resolvePlayerContext/tick.
      // Matchs amicaux : jours de repos communs avec un adversaire (et heures
      // encore possibles), pour le formulaire de proposition.
      // Matchs amicaux : liste à jour de MES amicaux (retour d'un joueur
      // 2026-09-27 : "j'ai reçu la notification pour le match amical mais
      // pas d'invitation dans match amical" — la page gardait la liste
      // chargée à l'ouverture du jeu). Lecture seule, sans rattrapage de la
      // ligue (appelée régulièrement, comme la messagerie).
      if (route.pathname === "/api/friendly/list" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const fstore = ctx.world ? await loadWorldFriendlies(multiSavePath) : null;
        const merged = mergedFriendlies(ctx, fstore, now);
        sendJson(res, 200, { ok: true, friendlies: merged.friendlies, guestTeams: merged.guests });
        return;
      }

      // « Mes enchères » à jour (retour utilisateur 2026-09-29 : « si qqun a
      // surenchéri, comment je retrouve rapidement ? ») : les annonces où le
      // club a misé — joueurs de sa ligue et des autres championnats, staff —
      // pour la pastille rouge de Marché et la liste « Mes enchères ».
      // Lecture seule, sans rattrapage (appelée régulièrement, comme la liste
      // des amicaux). Voir server/myAuctions.js.
      if (route.pathname === "/api/auctions/mine" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const index = ctx.world ? await store.loadWorldAuxRaw("market", multiSavePath) : null;
        sendJson(res, 200, { ok: true, now, ...MyAuctions.collect(ctx.league, ctx.teamIndex, now, index ? { index, leagueId: ctx.leagueId } : null) });
        return;
      }

      if (route.pathname === "/api/friendly/days" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const fstore = ctx.world ? await loadWorldFriendlies(multiSavePath) : null;
        if (fstore) attachWorldFriendlyDays(ctx.league, ctx.leagueId, fstore);
        // Adversaire d'un autre championnat : ?league=<id>&club=<index>.
        const otherLeague = route.searchParams.get("league");
        if (ctx.world && otherLeague && otherLeague !== ctx.leagueId) {
          const club = Number(route.searchParams.get("club"));
          const oppLg = ctx.world.leagues.some(e => e.id === otherLeague) ? await World.loadLeague(ctx.world, otherLeague, multiSavePath) : null;
          if (!oppLg || !Number.isInteger(club) || !oppLg.teams[club]) { sendJson(res, 400, { ok: false, error: "Adversaire invalide." }); return; }
          attachWorldFriendlyDays(oppLg, otherLeague, fstore);
          sendJson(res, 200, { ok: true, days: World.WorldFriendlies.availableDays(Engine, ctx.league, ctx.teamIndex, oppLg, club, now) });
          return;
        }
        const opp = Number(route.searchParams.get("opponent"));
        if (!Number.isInteger(opp) || !ctx.league.teams[opp] || opp === ctx.teamIndex) { sendJson(res, 400, { ok: false, error: "Adversaire invalide." }); return; }
        sendJson(res, 200, { ok: true, days: Friendlies.availableDays(Engine, ctx.league, ctx.teamIndex, opp, now) });
        return;
      }

      // Premium « Revoir le direct d'un match déjà joué » (voir
      // LiveMatch.archiveReplay) : ?key=… ou ?round=&competition=&home=&away=
      // (match de la feuille de statistiques). Même vue que le direct (repère
      // du club qui regarde), horaires décalés pour démarrer maintenant.
      // Notifications (Premium, server/push.js / server/webpush.js).
      if (route.pathname === "/api/push/config" && req.method === "GET") {
        const v = WebPush.vapidConfig();
        sendJson(res, 200, { ok: true, enabled: !!v, publicKey: v ? v.publicKey : null });
        return;
      }
      if ((route.pathname === "/api/push/subscribe" || route.pathname === "/api/push/unsubscribe") && req.method === "POST") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const team = ctx.league.teams[ctx.teamIndex];
        if (route.pathname === "/api/push/unsubscribe") {
          Push.removeSubscription(team, body && body.endpoint);
        } else {
          if (!WebPush.vapidConfig()) { sendJson(res, 400, { ok: false, code: "push-disabled", error: "Notifications indisponibles sur ce serveur." }); return; }
          if (!Push.isPremium(team, now)) { sendJson(res, 403, { ok: false, code: "premium-required", error: "Les notifications sont réservées au Premium." }); return; }
          if (!Push.addSubscription(team, body && body.subscription, now)) { sendJson(res, 400, { ok: false, error: "Abonnement invalide." }); return; }
        }
        await store.saveMultiLeague(ctx.league, multiSavePath);
        sendJson(res, 200, { ok: true, devices: (team.pushSubscriptions || []).length });
        return;
      }

      if (route.pathname === "/api/replay" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const team = ctx.league.teams[ctx.teamIndex];
        const data = await store.loadReplays(ctx.leagueId, multiSavePath);
        const q = route.searchParams;
        const mine = e => e.homeIdx === ctx.teamIndex || e.awayIdx === ctx.teamIndex;
        let item = null;
        if (q.get("key")) item = data.list.find(x => x.key === q.get("key")) || null;
        else {
          const round = Number(q.get("round")), home = Number(q.get("home")), away = Number(q.get("away"));
          const comp = q.get("competition") === "cup" ? "cup" : "championship";
          item = data.list.slice().reverse().find(x => x.entry.round === round && (x.entry.competition || "championship") === comp && x.entry.homeIdx === home && x.entry.awayIdx === away) || null;
        }
        if (!item || !mine(item.entry)) { sendJson(res, 404, { ok: false, error: "Ce direct n'est plus disponible." }); return; }
        const premium = typeof team.hasActivePremium === "function" ? team.hasActivePremium(now) : !!team.isPaying;
        if (!premium) { sendJson(res, 403, { ok: false, code: "premium-required", error: "Revoir un direct est réservé au Premium." }); return; }
        const view = LiveMatch.viewLiveMatchForTeam({ liveMatches: { [item.key]: item.entry } }, ctx.teamIndex);
        const delta = now + 2000 - item.entry.kickoffAt;
        view.kickoffAt += delta;
        view.events = view.events.map(ev => (typeof ev.airAt === "number" ? { ...ev, airAt: ev.airAt + delta } : ev));
        view.pauses = (view.pauses || []).map(pz => (typeof pz.airAt === "number" ? { ...pz, airAt: pz.airAt + delta } : pz));
        view.replay = true;
        const guest = item.entry.guest ? { ...item.entry.guest, localIdx: view.opponentIdx } : null;
        sendJson(res, 200, { ok: true, key: item.key, live: view, guest });
        return;
      }

      if (route.pathname === "/api/scouting/access" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        if (ctx.world) await attachNationalCupGuests(ctx, multiSavePath);
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
        if (ctx.world) await attachNationalCupGuests(ctx, multiSavePath);
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

      // -----------------------------------------------------------------
      // Messagerie privée entre managers (voir server/messages.js). Ligue
      // PARTAGÉE uniquement : en solo il n'y a personne à qui écrire
      // (`available: false`, le navigateur masque alors l'onglet). Ces
      // routes ne rattrapent PAS la ligue (pas de tick) et ne la réécrivent
      // jamais : elles sont appelées souvent (compteur de non-lus) et ne
      // doivent pas coûter une simulation ni une sauvegarde de la ligue.
      // -----------------------------------------------------------------
      if (route.pathname.startsWith("/api/messages/")) {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        if (ctx.leagueId && !ctx.league.leagueId) ctx.league.leagueId = ctx.leagueId;
        let out = null;
        try {
          if (req.method === "GET" && route.pathname === "/api/messages/summary") {
            out = await messages.summary(ctx.league, ctx.teamIndex);
          } else if (req.method === "GET" && route.pathname === "/api/messages/thread") {
            out = await messages.thread(ctx.league, ctx.teamIndex, route.searchParams.get("with"));
          } else if (req.method === "POST") {
            let body;
            try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
            if (route.pathname === "/api/messages/send") out = await messages.send(ctx.league, ctx.teamIndex, body, now);
            else if (route.pathname === "/api/messages/read") out = await messages.markRead(ctx.league, ctx.teamIndex, body);
            else if (route.pathname === "/api/messages/block") out = await messages.setBlocked(ctx.league, ctx.teamIndex, body);
            else if (route.pathname === "/api/messages/report") out = await messages.report(ctx.league, ctx.teamIndex, body, now);
          }
        } catch (e) {
          sendJson(res, 503, { ok: false, error: e.message });
          return;
        }
        if (!out) { sendJson(res, 404, { ok: false, error: "Route inconnue", path: route.pathname }); return; }
        sendJson(res, out.status, out.body);
        return;
      }

      // Pseudo du manager (2026-09-30, voir Engine.checkManagerPseudo) :
      // POST { pseudo } — unique dans TOUT le monde, d'où cette route à part
      // (les ACTION_ROUTES ne voient que leur championnat).
      if (route.pathname === "/api/manager/set-pseudo" && req.method === "POST") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const out = await setManagerPseudo(ctx, body, now, multiSavePath);
        if (!out.ok) { sendJson(res, out.status || 400, { ok: false, error: out.error, code: out.code || null }); return; }
        await persistContext(ctx);
        sendJson(res, 200, out);
        return;
      }

      // Chat de la ligue (voir server/leagueChat.js) : GET le fil (?summary=1
      // : seulement le nombre de non-lus), POST /send { text }, POST /react
      // { id, emoji }, POST /read { upTo }. Comme la messagerie, ne
      // rattrape ni ne réécrit la ligue (stockage à part).
      if (route.pathname === "/api/league-chat" || route.pathname.startsWith("/api/league-chat/")) {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        let out = null;
        try {
          if (req.method === "GET" && route.pathname === "/api/league-chat") out = await leagueChat.view(ctx, now, route.searchParams.get("summary") === "1");
          else if (req.method === "POST" && ["/api/league-chat/send", "/api/league-chat/react", "/api/league-chat/read"].includes(route.pathname)) {
            let body;
            try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
            if (route.pathname === "/api/league-chat/send") out = await leagueChat.send(ctx, body, now);
            else if (route.pathname === "/api/league-chat/react") out = await leagueChat.react(ctx, body, now);
            else out = await leagueChat.markRead(ctx, body, now);
          }
        } catch (e) {
          sendJson(res, 503, { ok: false, error: `Chat momentanément indisponible (${e.message}).` });
          return;
        }
        if (!out) { sendJson(res, 404, { ok: false, error: "Route inconnue", path: route.pathname }); return; }
        sendJson(res, out.status, out.body);
        return;
      }

      // Modération de la messagerie (X-Admin-Token, comme les autres routes
      // admin) : GET liste des signalements, POST {id} pour en clore un.
      if (route.pathname === "/api/admin/message-reports") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Accès refusé." }); return; }
        try {
          let out;
          if (req.method === "GET") out = await messages.listReports();
          else if (req.method === "POST") {
            let body;
            try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
            out = await messages.resolveReport(body);
          } else { sendJson(res, 405, { ok: false, error: "Méthode non autorisée." }); return; }
          sendJson(res, out.status, out.body);
        } catch (e) {
          sendJson(res, 503, { ok: false, error: e.message });
        }
        return;
      }

      // Amicaux entre championnats (server/worldFriendlies.js) : proposition
      // à un club d'une autre ligue (opponentRef) ou action sur un amical
      // « monde » (id « w… »).
      const FRIENDLY_ROUTES = ["/api/friendly/propose", "/api/friendly/respond", "/api/friendly/cancel", "/api/friendly/lineup"];
      if (FRIENDLY_ROUTES.includes(route.pathname) && req.method === "POST") {
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        req.__parsedBody = body;
        const isWorld = (route.pathname === "/api/friendly/propose" && body && body.opponentRef) || (body && World.WorldFriendlies.isWorldId(body.id));
        if (isWorld) {
          const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
          if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
          if (!ctx.world) { sendJson(res, 400, { ok: false, error: "Amicaux entre championnats : ligue partagée seulement." }); return; }
          const WF = World.WorldFriendlies;
          const fstore = await loadWorldFriendlies(multiSavePath);
          attachWorldFriendlyDays(ctx.league, ctx.leagueId, fstore);
          const me = { league: ctx.league, idx: ctx.teamIndex, ref: worldRefOf(ctx.world, ctx.leagueId, ctx.league, ctx.teamIndex) };
          // Ligue de l'adversaire (chargée pour les conflits de jours et son fil).
          let oppLeagueId = null, oppIdx = null;
          if (route.pathname === "/api/friendly/propose") {
            oppLeagueId = String(body.opponentRef.leagueId || "");
            oppIdx = Number(body.opponentRef.idx);
          } else {
            const f = fstore.list.find(x => WF.ID_PREFIX + x.id === body.id);
            const side = f && WF.sideOf(f, ctx.leagueId, ctx.teamIndex);
            if (side) { const o = f[side === "home" ? "away" : "home"]; oppLeagueId = o.leagueId; oppIdx = o.idx; }
          }
          const oppLg = oppLeagueId && oppLeagueId !== ctx.leagueId && ctx.world.leagues.some(e => e.id === oppLeagueId)
            ? await World.loadLeague(ctx.world, oppLeagueId, multiSavePath) : null;
          if (oppLg) attachWorldFriendlyDays(oppLg, oppLeagueId, fstore);
          let result;
          if (route.pathname === "/api/friendly/propose") {
            if (!oppLg || !Number.isInteger(oppIdx) || !oppLg.teams[oppIdx]) { sendJson(res, 400, { ok: false, error: "Adversaire introuvable." }); return; }
            result = WF.propose(Engine, fstore, me, { league: oppLg, idx: oppIdx, ref: worldRefOf(ctx.world, oppLeagueId, oppLg, oppIdx) }, body, now);
            if (result.ok) delete result.entry;
          } else if (route.pathname === "/api/friendly/respond") {
            result = WF.respond(Engine, fstore, me, oppLg, body, now);
          } else if (route.pathname === "/api/friendly/cancel") {
            result = WF.cancel(Engine, fstore, me, oppLg, body, now);
          } else {
            result = WF.setLineup(Engine, fstore, me, body, now);
          }
          if (!result.ok) { sendJson(res, 400, result); return; }
          await store.saveWorldAuxRaw("friendlies", fstore, multiSavePath);
          delete ctx.league.worldFriendlyDays;
          if (oppLg) { delete oppLg.worldFriendlyDays; await store.saveMultiLeague(oppLg, multiSavePath); }
          const kick = WF.nextKickoff(fstore, now);
          const cur = nextWorldDeadlineAt.get(multiSavePath);
          if (kick != null && (cur == null || kick < cur)) nextWorldDeadlineAt.set(multiSavePath, kick);
          const merged = mergedFriendlies(ctx, fstore, now);
          sendJson(res, 200, { ...result, friendlies: merged.friendlies, guestTeams: merged.guests, state: buildStateSnapshot(ctx.league, ctx.teamIndex, now) });
          return;
        }
      }

      // Marché mondial : enchère sur l'annonce d'un AUTRE championnat (id
      // négatif = −identifiant global, voir server/worldMarket.js).
      if (route.pathname === "/api/market/bid" && req.method === "POST") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const rawId = body && body.listingId;
        const numId = typeof rawId === "string" && /^-?\d+$/.test(rawId) ? Number(rawId) : rawId;
        if (ctx.world && typeof numId === "number" && numId < 0) {
          if (typeof body.amount !== "number" || !(body.amount > 0)) { sendJson(res, 400, { ok: false, error: "amount doit être un nombre positif." }); return; }
          const index = await store.loadWorldAuxRaw("market", multiSavePath);
          const team = ctx.league.teams[ctx.teamIndex];
          const out = await World.WorldMarket.placeForeignBid({
            index, leagueId: ctx.leagueId, teamIdx: ctx.teamIndex, team, gid: -numId, amount: body.amount, now,
            loadLeague: id => World.loadLeague(ctx.world, id, multiSavePath),
            saveLeague: lg => store.saveMultiLeague(lg, multiSavePath),
            saveIndex: ix => store.saveWorldAuxRaw("market", ix, multiSavePath),
          });
          if (!out.ok) { sendJson(res, 400, { ok: false, error: `Enchère refusée : ${out.reason}${out.minBid ? ` (minimum ${out.minBid})` : ""}.`, reason: out.reason, minBid: out.minBid || null }); return; }
          // Rattrapage du monde dès la clôture (transfert entre championnats).
          const closesAt = out.entry.closesAt;
          const cur = nextWorldDeadlineAt.get(multiSavePath);
          if (cur == null || closesAt + 1000 < cur) nextWorldDeadlineAt.set(multiSavePath, closesAt + 1000);
          sendJson(res, 200, { ok: true, foreign: true, autoOutbid: !!out.autoOutbid, state: buildStateSnapshot(ctx.league, ctx.teamIndex, now) });
          return;
        }
        req.__parsedBody = body;
      }
      // Enchère automatique sur l'annonce d'un AUTRE championnat (id négatif).
      if (route.pathname === "/api/market/auto-bid" && req.method === "POST") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const rawId = body && body.listingId;
        const numId = typeof rawId === "string" && /^-?\d+$/.test(rawId) ? Number(rawId) : rawId;
        if (ctx.world && body && body.market === "transferListings" && typeof numId === "number" && numId < 0) {
          const max = body.max == null ? 0 : body.max;
          if (typeof max !== "number" || max < 0) { sendJson(res, 400, { ok: false, error: "max doit être un nombre positif." }); return; }
          const index = await store.loadWorldAuxRaw("market", multiSavePath);
          const out = await World.WorldMarket.setForeignAutoBid({
            index, leagueId: ctx.leagueId, teamIdx: ctx.teamIndex, team: ctx.league.teams[ctx.teamIndex], gid: -numId, max, now,
            loadLeague: id => World.loadLeague(ctx.world, id, multiSavePath),
            saveLeague: lg => store.saveMultiLeague(lg, multiSavePath),
            saveIndex: ix => store.saveWorldAuxRaw("market", ix, multiSavePath),
          });
          if (!out.ok) { sendJson(res, 400, { ok: false, error: `Enchère automatique refusée : ${out.reason}${out.minBid ? ` (minimum ${out.minBid})` : ""}.`, reason: out.reason, minBid: out.minBid || null }); return; }
          const closesAt = out.entry.closesAt;
          const cur = nextWorldDeadlineAt.get(multiSavePath);
          if (cur == null || closesAt + 1000 < cur) nextWorldDeadlineAt.set(multiSavePath, closesAt + 1000);
          sendJson(res, 200, { ok: true, foreign: true, leading: out.leading, removed: out.removed });
          return;
        }
        req.__parsedBody = body;
      }

      const actionFn = req.method === "POST" ? ACTION_ROUTES[route.pathname] : null;
      if (actionFn) {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }

        let body = req.__parsedBody;
        if (body === undefined) {
          try {
            body = await readJsonBody(req);
          } catch (e) {
            sendJson(res, 400, { ok: false, error: e.message });
            return;
          }
        }

        if (ctx.world && route.pathname.startsWith("/api/scouting/")) await attachNationalCupGuests(ctx, multiSavePath);
        const fstoreForFriendly = ctx.world && route.pathname.startsWith("/api/friendly/") ? await loadWorldFriendlies(multiSavePath) : null;
        if (fstoreForFriendly) attachWorldFriendlyDays(ctx.league, ctx.leagueId, fstoreForFriendly);
        const result = actionFn(ctx.league.teams[ctx.teamIndex], ctx.teamIndex, ctx.league, body, now);
        delete ctx.league.worldFriendlyDays;
        if (fstoreForFriendly && result.ok && Array.isArray(result.friendlies)) {
          const merged = mergedFriendlies(ctx, fstoreForFriendly, now);
          result.friendlies = merged.friendlies;
          result.guestTeams = merged.guests;
        }
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
        // Petit message privé de la part du manager qui agit (invitation à un
        // match amical, voir server/friendlies.js) — ligue partagée seulement ;
        // un échec (destinataire qui a bloqué l'expéditeur...) n'annule rien.
        const notify = result.notify;
        delete result.notify;
        if (notify) {
          try { await messages.send(ctx.league, ctx.teamIndex, notify, now); } catch (e) { /* message facultatif */ }
        }
        sendJson(res, 200, { ...result, state: buildStateSnapshot(ctx.league, ctx.teamIndex, now) });
        return;
      }

      sendJson(res, 404, { error: "Route inconnue", path: route.pathname });
    } catch (e) {
      if (!res.headersSent) sendJson(res, 500, { error: `Erreur serveur inattendue : ${e.message}` });
    } finally {
      if (releaseSaveLock) releaseSaveLock();
    }
  };
}

function startServer(port = DEFAULT_PORT, savePath = store.defaultSavePath(), multiSavePath = store.defaultMultiLeaguePath()) {
  const server = http.createServer(createHandler(savePath, Date.now, multiSavePath));
  // Tâche de fond : les ligues du monde avancent même sans visite.
  const worldTimer = setInterval(async () => {
    const release = await acquireSaveLock();
    // Toutes les minutes : ne fait réellement quelque chose que toutes les
    // 10 minutes, ou dès qu'une échéance de Coupe nationale est passée.
    try { await maybeCatchUpWorld(multiSavePath, Date.now()); } finally { release(); }
  }, 60 * 1000);
  if (worldTimer.unref) worldTimer.unref();
  server.on("close", () => clearInterval(worldTimer));
  server.listen(port, () => {
    console.log(`Serveur basket (calendrier réel) démarré sur http://localhost:${port}`);
    console.log(`Sauvegarde multi-manager : ${multiSavePath}`);
    if (store.upstashConfigured()) {
      console.log(`Sauvegardes sur Upstash, clés « ${store.redisKey("multiLeague")} », « ${store.redisKey("accounts")} »...`);
    }
    console.log(`Connexion Discord : ${AccountRoutes.discordConfigured() ? "activée" : "désactivée (DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET absents)"}.`);
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
  createHandler, buildStateSnapshot, tick, startServer, maybeCatchUpWorld,
  personalizeEventsForTeam, resolvePlayerContext, getManagerToken, mobileManifest,
};
