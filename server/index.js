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
// Fonctionnalités activables club par club via /api/admin/beta-feature.
// liveShows (2026-10-08) : mise en scène du direct 2D (coach, entrée des
// joueurs, shows) — voir aussi server/featureFlags.js (mode global).
const BETA_FEATURES = ["live2d", "liveShows"];
const FeatureFlags = require("./featureFlags.js");
const AdsStats = FeatureFlags.AdsStats;
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
const I18n = require("./i18n.js");
const Push = require("./push.js");
const PublicPlayers = require("./publicPlayers.js");
const Bookmarks = require("./bookmarks.js");
const NationalTeams = require("./nationalTeams.js");
const MyAuctions = require("./myAuctions.js");
const WebPush = require("./webpush.js");
const Ads = require("./ads.js");
const Site = require("./site.js");
const PlayerLinks = require("./playerLinks.js");
const PlayerPage = require("./playerPage.js");
const WeeklyDigest = require("./weeklyDigest.js");
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
  if (compressible) out["Vary"] = out["Vary"] ? `${out["Vary"]}, Accept-Encoding` : "Accept-Encoding";
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
      { src: "/assets/mobile/icon-192.png?v=4", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/mobile/icon-512.png?v=4", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/assets/mobile/icon-maskable-512.png?v=4", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
function serveSiteHtml(res, queryLang = null) {
  let body;
  try {
    // Plus de script AdSense ici (écran d'inscription = pas de contenu
    // d'éditeur, refus AdSense du 2026-09-28) : voir server/site.js.
    // Versions EN / IT (?lang=) : <html lang>, titre, description,
    // canonical et hreflang pour les moteurs de recherche (Site.localizeLanding).
    body = Site.localizeLanding(fs.readFileSync(SITE_HTML_PATH, "utf-8"), I18n.normLang(queryLang) || "fr");
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
    const events = await World.catchUpWorld(multiSavePath, now, {
      tickLeague: (lg, t) => { const evs = tick(lg, t).events; stashRecapEvents(lg, evs); return evs; },
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
    // Résumé de la semaine par e-mail (server/weeklyDigest.js) : le lundi
    // après la mise à jour hebdomadaire. Jamais attendu ici (préparé plus
    // tard sous le verrou, envoyé hors verrou) ; ne fait rien sans
    // fournisseur d'e-mail configuré.
    WeeklyDigest.scheduleWeeklyDigests({ multiSavePath, accountsPath, now, acquireLock: acquireSaveLock });
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
  const found = await World.findTeamByToken(world, token, multiSavePath, { reportUnavailable: true });
  if (found && found.unavailable) {
    return { ok: false, status: 404, error: "Championnat momentanément illisible, réessayez dans quelques minutes." };
  }
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
  // Ligues privées « monde » (server/privateLeague.js) : stock chargé une
  // fois par requête (null = lecture en échec : fonctions de ligue privée
  // momentanément indisponibles, rien n'est réécrit), anciennes ligues de
  // ce championnat migrées au passage, vendredis de ligue privée posés sur
  // la ligue (jours de match, voir Friendlies.officialMatchTimesFor).
  const lpStore = await PrivateLeague.loadStore(multiSavePath);
  if (lpStore) {
    const label = World.divisionLabelOf(world, found.leagueId);
    const cleared = await PrivateLeague.migrateAndSave(lpStore, [{
      leagueId: found.leagueId, league: found.league, refOf: idx => PrivateLeague.refFor(found.leagueId, found.league, idx, label),
    }], multiSavePath);
    if (cleared.length) await store.saveMultiLeague(found.league, multiSavePath);
    found.league.worldPrivateLeagueTimes = PrivateLeague.busyTimesByIdx(lpStore, found.leagueId);
  }
  return { ok: true, league: found.league, teamIndex: found.teamIndex, isMulti: true, savePath: multiSavePath, world, leagueId: found.leagueId, lpStore };
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

// Adversaire de ligue privée venu d'un autre championnat (index local
// ≥ PRIVATE_LEAGUE_GUEST_IDX, voir PrivateLeague.projectForViewer) : rangé
// comme un club invité de la Coupe nationale (guestTeamsByIdx, guestLeague)
// pour que l'analyse d'équipe le trouve (retour utilisateur 2026-10-03 :
// « je suis premium et ça me met ce message » — l'accès échouait, l'écran
// de déblocage s'affichait même en Premium).
async function attachPrivateLeagueScoutingGuest(ctx, opponentIdx, multiSavePath, now) {
  if (!ctx.world || !ctx.lpStore || !Number.isInteger(opponentIdx) || opponentIdx < PrivateLeague.PRIVATE_LEAGUE_GUEST_IDX) return;
  const w = PrivateLeague.projectForViewer(ctx.lpStore, ctx.leagueId, ctx.teamIndex, now);
  const g = w.guests.find(x => x.localIdx === opponentIdx);
  if (!g || !ctx.world.leagues.some(e => e.id === g.leagueId)) return;
  const lg = await World.loadLeague(ctx.world, g.leagueId, multiSavePath);
  const team = lg && lg.teams[g.idx];
  if (!team) return;
  team.guestLeague = lg;
  team.guestIdx = g.idx;
  const map = ctx.league.guestTeamsByIdx instanceof Map ? ctx.league.guestTeamsByIdx : new Map();
  map.set(opponentIdx, team);
  ctx.league.guestTeamsByIdx = map;
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
  // Recherche d'un manager (barre du haut) : le nouveau pseudo est trouvable
  // tout de suite par les autres championnats (résumé du monde rafraîchi).
  try {
    const entry = ctx.world && ctx.world.leagues && ctx.world.leagues.find(e => e.id === ctx.leagueId);
    if (entry && ctx.world.summaries) ctx.world.summaries[ctx.leagueId] = World.leagueSummary(entry, ctx.league);
  } catch (e) { /* résumé rafraîchi au prochain passage du monde */ }
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
        playerName: (league.listingPlayer ? league.listingPlayer(l) : null)?.name || null,
        sellerIdx: l.sellerIdx,
        sellerName: l.freeAgent ? null : ((league.teams[l.sellerIdx] || {}).name || null),
        freeAgent: !!l.freeAgent,
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
// Ligues privées (voir server/privateLeague.js) : rangées au niveau du
// monde (membres de n'importe quel championnat), donc traitées à part
// (PRIVATE_LEAGUE_ACTIONS, plus bas dans createHandler) ; chaque réponse
// renvoie AUSSI les ligues privées de ce manager dans le repère de sa ligue
// (privateLeaguesForViewer) et les clubs invités des autres championnats.
const PRIVATE_LEAGUE_ACTIONS = {
  "/api/private-league/create": PrivateLeague.createPrivateLeague,
  "/api/private-league/join": PrivateLeague.joinPrivateLeague,
  "/api/private-league/leave": PrivateLeague.leavePrivateLeague,
  "/api/private-league/start": PrivateLeague.startPrivateLeague,
  "/api/private-league/orders": PrivateLeague.setPrivateLeagueOrders,
};
// Ligues privées vues par CE manager : les siennes au niveau du monde (code
// compris), plus, tant qu'elles n'ont pas pu être migrées (stockage du monde
// illisible), les anciennes ligues de son championnat.
function privateLeaguesForViewer(ctx, now) {
  const legacy = PrivateLeague.sanitizePrivateLeaguesForViewer(ctx.league.privateLeagues, ctx.teamIndex, now);
  if (!ctx.lpStore) return { privateLeagues: legacy, guests: [] };
  const w = PrivateLeague.projectForViewer(ctx.lpStore, ctx.leagueId, ctx.teamIndex, now);
  return { privateLeagues: w.privateLeagues.concat(legacy), guests: w.guests };
}
// Ligue privée « monde » dont ce manager est membre (id), avec son repère
// local (place → index local, clubs invités) ; null sinon.
function memberPrivateLeague(ctx, id) {
  const lp = ctx.lpStore ? PrivateLeague.findById(ctx.lpStore, id) : null;
  if (!lp || PrivateLeague.memberSlot(lp, ctx.leagueId, ctx.teamIndex) < 0) return null;
  const map = PrivateLeague.localIndexMap(ctx.lpStore, lp, ctx.leagueId, ctx.teamIndex);
  return map ? { lp, ...map } : null;
}
// Vrai club derrière une place d'une ligue privée « monde » (sa ligue est
// chargée au besoin, `cache` : Map leagueId → League) — null si introuvable.
async function privateLeagueMemberTeam(ctx, lp, slot, cache, multiSavePath) {
  const ref = lp.members[slot];
  if (!ref) return null;
  if (!cache.has(ref.leagueId)) {
    cache.set(ref.leagueId, ref.leagueId === ctx.leagueId ? ctx.league
      : (ctx.world.leagues.some(e => e.id === ref.leagueId) ? await World.loadLeague(ctx.world, ref.leagueId, multiSavePath) : null));
  }
  const lg = cache.get(ref.leagueId);
  const t = lg && lg.teams[ref.idx];
  return t && t.name === ref.name ? t : null;
}
// Directs d'une ligue privée « monde » pour une journée (et un match
// précis si `slots` est donné), entrées recopiées dans le repère local
// (homeIdx/awayIdx). Ligue migrée : directs d'avant la migration cherchés
// sous leur ancienne clé, dans les directs du championnat d'origine.
async function privateLeagueLiveEntries(lp, roundIndex, slotToLocal, multiSavePath, slots = null) {
  const round = lp.rounds[roundIndex];
  if (!round) return [];
  const matches = round.matches.filter(m => !slots || (m.home === slots.home && m.away === slots.away));
  const data = await store.loadLpReplays(lp.id, multiSavePath);
  let legacy = null;
  const out = [];
  for (const m of matches) {
    const suffix = PrivateLeague.lpLiveKey(lp, roundIndex, m.home, m.away);
    let item = data.list.slice().reverse().find(x => x.key === suffix || x.key.endsWith(":" + suffix));
    if (!item && m.legacyKey && lp.legacy && lp.legacy.leagueId) {
      if (!legacy) legacy = await store.loadReplays(lp.legacy.leagueId, multiSavePath, "lp");
      item = legacy.list.slice().reverse().find(x => x.key.endsWith(":" + m.legacyKey));
    }
    if (!item) continue;
    out.push({ match: m, item, entry: { ...item.entry, homeIdx: slotToLocal[m.home], awayIdx: slotToLocal[m.away] } });
  }
  return out;
}
// Ligue « factice » pour les émissions d'un match de ligue privée
// (server/shows.js:getLpPrematchShow/getLpHalftimeShow lisent
// league.teams[idx] et league.results) : vrais clubs aux index locaux
// (`full` : places dont l'effectif est utile), simple nom ailleurs ;
// résultats = matchs déjà joués de la ligue privée (forme récente).
async function privateLeagueShowLeague(ctx, lp, slotToLocal, fullSlots, multiSavePath, now) {
  const teams = [];
  const cache = new Map();
  for (let slot = 0; slot < lp.members.length; slot++) {
    const local = slotToLocal[slot];
    const real = fullSlots.includes(slot) ? await privateLeagueMemberTeam(ctx, lp, slot, cache, multiSavePath) : null;
    teams[local] = real || { name: lp.members[slot].name, players: [], lineup: { starters: {} } };
  }
  const results = [];
  lp.rounds.forEach(r => r.matches.forEach(m => {
    if (m.played && !(typeof m.liveUntil === "number" && m.liveUntil > now)) {
      results.push({ round: r.index, home: slotToLocal[m.home], away: slotToLocal[m.away], scoreHome: m.scoreHome, scoreAway: m.scoreAway });
    }
  }));
  return { teams, results };
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
  "/api/tactics": actions.setTactics,
  "/api/training": actions.setTraining,
  "/api/plan": actions.setPlan,
  "/api/tactic-presets": actions.setTacticPresets,
  "/api/achievements/seen": actions.markAchievementsSeen,
  "/api/market/list": actions.listPlayer,
  "/api/roster/sell-listed": actions.sellListedPlayer,
  "/api/market/bid": actions.bidOnListing,
  "/api/market/coach-bid": actions.bidOnCoachListing,
  // Enchère automatique (plafond), tous marchés — voir actions.setAutoBid.
  "/api/market/auto-bid": actions.setAutoBid,
  "/api/market/negotiate": actions.negotiateTransfer,
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
  "/api/locker/talk": actions.lockerTalk,
  // Retraite : convaincre un joueur de repousser sa retraite d'un an (voir
  // server/actions.js et RETIREMENT_ANNOUNCE_CHANCE_BY_AGE côté moteur).
  "/api/player/retirement-talk": actions.talkRetirement,
  // Contrats (demande du 2026-10-01) : prolongation et augmentation.
  "/api/player/contract-extension": actions.offerContractExtension,
  "/api/player/raise-response": actions.respondToRaiseRequest,
  "/api/player/release": actions.releasePlayer,
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
  "/api/club/set-arena-style": actions.setTeamArenaStyle,
  "/api/club/set-coach-look": actions.setTeamCoachLook,
  "/api/club/set-mascot": actions.setTeamMascot,
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
  // Notifications dans la langue du compte du club (Accounts.langFor, voir
  // server/push.js:setLangResolver). Comptes relus au plus une fois par
  // minute, et seulement quand une notification part.
  {
    let cache = { at: 0, data: null };
    Push.setLangResolver(async team => {
      if (!team) return null;
      if (!team.managerLinkToken) return Accounts.countryLang(team.country);
      if (!cache.data || Date.now() - cache.at > 60 * 1000) cache = { at: Date.now(), data: await Accounts.loadAccounts(accountsPath) };
      const account = Accounts.findByManagerToken(cache.data, team.managerLinkToken);
      return Accounts.langFor(account, { country: team.country });
    });
  }
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
  // Chat de la ligue (voir server/leagueChat.js) : messages des managers
  // uniquement. Le nom des managers est leur pseudo (Team.managerPseudo).
  const leagueChat = LeagueChat.createService(multiSavePath);
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
      // Icônes cherchées d'office à la racine par Safari / iOS (retour
      // 2026-10-03 : « j'ai toujours l'ancien logo orange foncé ») : sans
      // réponse, Safari garde l'ancienne icône en cache. Nouvelle icône jaune.
      if ((route.pathname === "/apple-touch-icon.png" || route.pathname === "/apple-touch-icon-precomposed.png") && req.method === "GET") {
        fs.readFile(path.join(ASSETS_DIR, "mobile", "apple-touch-icon.png"), (err, data) => {
          if (err) { sendJson(res, 404, { error: "Fichier introuvable" }); return; }
          res.writeHead(200, { "Content-Type": "image/png", "Content-Length": data.length, "Cache-Control": "public, max-age=86400" });
          res.end(data);
        });
        return;
      }
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
        // Langue : ?lang=, cookie « hm-lang », Accept-Language, français
        // (server/i18n.js:siteLang).
        const qLang = I18n.normLang(route.searchParams.get("lang"));
        const lang = I18n.siteLang({ query: qLang, cookie: req.headers.cookie, acceptLanguage: req.headers["accept-language"] });
        const page = Site.render(route.pathname, { discordInvite: process.env.DISCORD_INVITE_URL || null, lang, explicit: !!qLang });
        if (page) {
          const body = Buffer.from(page.body, "utf-8");
          // Contenu qui dépend de la langue du visiteur : pas de cache partagé.
          const cache = page.headers ? "private, max-age=600" : "public, max-age=600";
          sendBody(res, page.status, { "Content-Type": page.contentType, "Cache-Control": cache, ...(page.headers || {}) }, body, true);
          return;
        }
      }

      // Page d'accueil / inscription (voir serveSiteHtml).
      if ((route.pathname === "/bienvenue" || route.pathname === "/welcome") && req.method === "GET") {
        serveSiteHtml(res, route.searchParams.get("lang"));
        return;
      }

      releaseSaveLock = await acquireSaveLock();
      const now = nowFn();
      if (getManagerToken(req)) await maybeCatchUpWorld(multiSavePath, now, false, accountsPath);

      // Comptes joueurs + Discord (voir server/accountRoutes.js).
      if (await handleAccountRoutes(req, res, route, now)) return;
      // Désinscription / réinscription au résumé de la semaine (lien signé
      // de l'e-mail, voir server/weeklyDigest.js).
      if (await WeeklyDigest.handleDigestRoutes(req, res, route, {
        accountsPath,
        siteLangFor: r => I18n.siteLang({ query: route.searchParams.get("lang"), cookie: r.headers.cookie, acceptLanguage: r.headers["accept-language"] }),
      })) return;

      // Page publique d'un joueur partagé (`/j/<code>`, server/playerLinks.js
      // et server/playerPage.js) : sans connexion. Lien inconnu, coupé, ou
      // joueur parti de son club : page « Lien expiré ou introuvable » (404).
      if (req.method === "GET" && /^\/j\/[^/]*\/?$/.test(route.pathname)) {
        let code = "";
        try { code = decodeURIComponent(route.pathname.slice(3).replace(/\/$/, "")); } catch (e) { code = ""; }
        const qLang = I18n.normLang(route.searchParams.get("lang"));
        const lang = I18n.siteLang({ query: qLang, cookie: req.headers.cookie, acceptLanguage: req.headers["accept-language"] });
        const origin = originFor(req);
        let page = null;
        try {
          const world = await World.loadWorld(multiSavePath, now);
          let entry = null;
          const resolved = world ? await PlayerLinks.resolveLink(multiSavePath, code, async (id) => {
            entry = world.leagues.find(e => e.id === id) || null;
            return entry ? World.loadLeague(world, id, multiSavePath) : null;
          }) : null;
          if (resolved) {
            // Sélection nationale actuelle (2026-10-07) : facultative, la
            // page s'affiche sans si le registre des sélections est indisponible.
            let international = null;
            try {
              const natStore = await NationalTeams.loadStore(multiSavePath);
              if (natStore) international = require("./nationalExtras.js").playerSelection(natStore, resolved.player.id, resolved.player.name, resolved.player.nationality);
            } catch (e) { international = null; }
            page = PlayerPage.renderPlayerPage({
              player: resolved.player, team: resolved.team, league: resolved.league,
              divisionLabel: entry ? World.divisionLabel(entry.level, entry.group) : "", origin, code, lang, international,
            });
          }
        } catch (e) {
          console.warn("[permalien joueur]", e.message);
        }
        const body = Buffer.from(page || PlayerPage.renderNotFoundPage({ lang, origin }), "utf-8");
        sendBody(res, page ? 200 : 404, {
          "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache",
          "Content-Language": lang, Vary: "Accept-Language, Cookie", "X-Robots-Tag": "noindex",
        }, body, true);
        return;
      }

      // Plus de carrière solo (2026-09-29) : sans jeton manager, seules
      // restent ouvertes /api/health, les routes admin (secret
      // X-Admin-Token) et les comptes (ci-dessus).
      if (route.pathname.startsWith("/api/")
          && !route.pathname.startsWith("/api/health") && !route.pathname.startsWith("/api/admin/")
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
      // Lecture d'un club pour diagnostic (retour utilisateur 2026-10-03 :
      // « c'est pour un bug ») : GET /api/admin/team?name=… — effectif
      // complet, caractéristiques comprises. LECTURE SEULE, même
      // authentification que les autres routes admin (X-Admin-Token) ;
      // club cherché par nom exact (sans majuscules) dans tout le monde.
      if (route.pathname === "/api/admin/team" && req.method === "GET") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        const wanted = String(route.searchParams.get("name") || "").trim().toLowerCase();
        if (!wanted) { sendJson(res, 400, { ok: false, error: "'name' requis (?name=…)." }); return; }
        let hostLeague = null, team = null;
        const world = await World.loadWorld(multiSavePath, now);
        for (const entry of (world ? world.leagues : [])) {
          const lg = await World.loadLeague(world, entry.id, multiSavePath);
          const t = lg && lg.teams.find(x => String(x.name || "").trim().toLowerCase() === wanted);
          if (t) { hostLeague = lg; team = t; break; }
        }
        if (!team) {
          const multi = await store.loadMultiLeague(multiSavePath);
          team = multi ? (multi.league.teams.find(t => String(t.name || "").trim().toLowerCase() === wanted) || null) : null;
          hostLeague = team ? multi.league : null;
        }
        if (!team) { sendJson(res, 404, { ok: false, error: `Aucune équipe nommée "${route.searchParams.get("name")}" dans le monde.` }); return; }
        const view = p => ({
          id: p.id, name: p.name, position: p.position, age: p.age, height: p.height, nationality: p.nationality || null,
          overall: typeof p.overall === "function" ? p.overall() : null, potential: p.potential, form: p.form,
          salary: p.salary, contractUntilSeason: p.contractUntilSeason == null ? null : p.contractUntilSeason,
          injuryUntil: p.injuryUntil || null, attrs: { ...(p.attrs || {}) },
        });
        // Diagnostic des ordres (bug « ordres perdus », 2026-10-03) : qui est
        // titulaire selon chaque source — ordres du club, plans préparés,
        // ordres de ligue privée, derniers matchs joués.
        const nameOf = id => { const p = (team.players || []).concat(team.youthPlayers || []).find(x => String(x.id) === String(id)); return p ? p.name : (id == null ? null : `#${id}`); };
        const fiveOf = lineup => (lineup && lineup.starters ? Object.fromEntries(Object.entries(lineup.starters).map(([pos, id]) => [pos, nameOf(id)])) : null);
        const idx = hostLeague.teams.indexOf(team);
        let lpOrders = [];
        try {
          const lpStore = await PrivateLeague.loadStore(multiSavePath);
          for (const lp of (lpStore && lpStore.list) || []) {
            const m = (lp.members || []).find(x => x && x.leagueId === hostLeague.leagueId && x.idx === idx);
            if (m) lpOrders.push({ lp: lp.name, status: lp.status || null, starters: m.orders ? fiveOf(m.orders.lineup) : "ordres du club" });
          }
        } catch (e) { lpOrders = { error: e.message }; }
        sendJson(res, 200, {
          ok: true, teamName: team.name, leagueId: hostLeague.leagueId || null, isHuman: !!team.isHuman,
          lineup: team.lineup || null, players: (team.players || []).map(view), youthPlayers: (team.youthPlayers || []).map(view),
          diagnostic: {
            clubStarters: fiveOf(team.lineup),
            ordresValidatedRound: team.ordresValidatedRound == null ? null : team.ordresValidatedRound,
            plans: Object.entries(team.plannedTactics || {}).map(([key, plan]) => ({ key, starters: fiveOf(plan && plan.lineup) })),
            lpOrders,
            lastMatches: (team.ordersHistory || []).slice(0, 8).map(h => ({ competition: h.competition, round: h.round, at: h.at ? new Date(h.at).toISOString() : null, opponent: h.opponentName || null, score: h.scoreFor != null ? `${h.scoreFor}-${h.scoreAgainst}` : null, starters: fiveOf(h.orders && h.orders.lineup) })),
          },
        });
        return;
      }

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
        // Club cherché dans TOUS les championnats du monde (2026-10-02 : le
        // club visé n'était pas dans le championnat historique), nom exact
        // sans tenir compte des majuscules.
        const wanted = body.teamName.trim().toLowerCase();
        let hostLeague = null, team = null;
        const world = await World.loadWorld(multiSavePath, now);
        for (const entry of (world ? world.leagues : [])) {
          const lg = await World.loadLeague(world, entry.id, multiSavePath);
          const t = lg && lg.teams.find(x => String(x.name || "").trim().toLowerCase() === wanted);
          if (t) { hostLeague = lg; team = t; break; }
        }
        if (!team) {
          team = multi.league.teams.find(t => String(t.name || "").trim().toLowerCase() === wanted) || null;
          hostLeague = team ? multi.league : null;
        }
        if (!team) { sendJson(res, 404, { ok: false, error: `Aucune équipe nommée "${body.teamName}" dans le monde.` }); return; }
        const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "Ajustement manuel (support)";
        team.recordTransaction(label, body.amount);
        await store.saveMultiLeague(hostLeague, multiSavePath);
        sendJson(res, 200, { ok: true, teamName: team.name, leagueId: hostLeague.leagueId || null, amount: body.amount, budget: team.budget });
        return;
      }

      // Drapeaux globaux (2026-10-08) : body = correctif partiel, ex.
      // { "liveShows": { "mode": "all" } } pour sortir la mise en scène de
      // bêta, { "liveShows": { "clubs": ["Gotham Knights","BC Dia"] } } pour
      // la liste, { "liveShows": { "shows": false } } pour couper une brique.
      if (route.pathname === "/api/admin/feature-flags" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        if (!body || typeof body !== "object") { sendJson(res, 400, { ok: false, error: "Corps JSON attendu." }); return; }
        if (body.liveShows && body.liveShows.mode != null && !FeatureFlags.MODES.includes(body.liveShows.mode)) { sendJson(res, 400, { ok: false, error: `'liveShows.mode' doit être l'un de : ${FeatureFlags.MODES.join(", ")}.` }); return; }
        const flags = await FeatureFlags.update(store, multiSavePath, body);
        sendJson(res, 200, { ok: true, ...flags });
        return;
      }

      // Bêta par club (2026-10-07) : active ou retire une fonctionnalité pour
      // UN club de la ligue partagée (toutes divisions, tous pays), pour la
      // faire tester à un seul manager avant le passage en prod complet.
      // Body : { teamName, feature: "live2d", enabled: true|false }.
      // Fonctionnalités connues : live2d (terrain animé du direct).
      if (route.pathname === "/api/admin/beta-feature" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        if (!body || typeof body.teamName !== "string" || !body.teamName.trim()) { sendJson(res, 400, { ok: false, error: "'teamName' (chaîne non vide) requis." }); return; }
        if (!BETA_FEATURES.includes(body.feature)) { sendJson(res, 400, { ok: false, error: `'feature' doit être l'une de : ${BETA_FEATURES.join(", ")}.` }); return; }
        const enabled = body.enabled !== false;
        const world = await World.loadWorld(multiSavePath, now);
        if (!world) { sendJson(res, 404, { ok: false, error: "Aucune ligue partagée n'existe encore." }); return; }
        const wanted = body.teamName.trim();
        for (const entry of world.leagues) {
          const lg = await World.loadLeague(world, entry.id, multiSavePath);
          const team = lg && lg.teams.find(t => t.name === wanted);
          if (!team) continue;
          const list = team.setBetaFeature(body.feature, enabled);
          await store.saveMultiLeague(lg, multiSavePath);
          sendJson(res, 200, { ok: true, teamName: team.name, leagueId: entry.id, feature: body.feature, enabled, betaFeatures: list });
          return;
        }
        sendJson(res, 404, { ok: false, error: `Aucune équipe nommée "${wanted}" dans la ligue partagée.` });
        return;
      }

      // Recalibrage des clubs de l'IA des ligues déjà créées (audit moteur
      // 2026-09-29, voir Engine.recalibrateCpuTeams) : les clubs IA générés
      // avant la baisse de niveau (≈63 de moyenne en Division I) sont
      // ramenés au niveau d'un club IA généré aujourd'hui dans la même
      // division (≈42). Body : { dryRun?: true par défaut, leagueId? } —
      // dryRun renvoie le rapport sans rien écrire ; { "dryRun": false }
      // applique. Idempotent : un club déjà au niveau n'est plus touché.
      // Ligue privée SPÉCIALE (retour utilisateur 2026-10-02) : body
      // { name, teams: ["Gotham Knights", "BC Dia", …], hours?: [10,12,…],
      //   days?: 5, startDate?: "AAAA-MM-JJ" (défaut : demain, heure de
      //   Paris) }. Clubs cherchés par nom exact dans tout le monde.
      // Sélections nationales (administration) : body { action: "dismiss",
      // teamId } | { action: "cancel-election", electionId } | { action:
      // "config", config: { voterRules?, candidateRules?, tieBreak?, … } }.
      if (route.pathname === "/api/admin/national" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const natStore = await NationalTeams.loadStore(multiSavePath);
        if (!natStore) { sendJson(res, 503, { ok: false, error: "Stock indisponible." }); return; }
        let out;
        if (body && body.action === "dismiss") out = NationalTeams.adminDismiss(natStore, body.teamId, now, null);
        else if (body && body.action === "cancel-election") out = NationalTeams.adminCancelElection(natStore, body.electionId, now);
        // Nommer un sélectionneur sans élection (essais) : body { action:
        // "appoint", teamId: "fr-A", club: "Nom exact du club" }. Le club
        // doit avoir un manager ; son vivier est calculé tout de suite.
        else if (body && body.action === "appoint") {
          const NationalCoach = require("./nationalCoach.js");
          const world = await World.loadWorld(multiSavePath, now);
          if (!world) { sendJson(res, 404, { ok: false, error: "Aucune ligue partagée." }); return; }
          const leagues = new Map();
          let me = null, season = 1;
          const wanted = String((body && body.club) || "").trim().toLowerCase();
          for (const entry of world.leagues) {
            const lg = await World.loadLeague(world, entry.id, multiSavePath);
            if (!lg) continue;
            leagues.set(entry.id, lg);
            const idx = lg.teams.findIndex(t => t && t.isHuman && String(t.name || "").trim().toLowerCase() === wanted);
            if (idx >= 0 && !me) { me = NationalTeams.managerOf(entry.id, lg, idx, world); season = lg.seasonNumber || 1; }
          }
          out = NationalCoach.adminAppoint(natStore, body.teamId, me, season, now, null);
          if (out.ok) {
            const team = natStore.teams[body.teamId];
            const pool = NationalCoach.buildPool(natStore, team, leagues, world, now);
            await NationalCoach.savePool(body.teamId, pool, multiSavePath);
            natStore.poolAt = natStore.poolAt || {};
            natStore.poolAt[body.teamId] = now;
            out.eligible = pool.eligible;
          }
        }
        else if (body && body.action === "config" && body.config && typeof body.config === "object") {
          const allowed = Object.keys(NationalTeams.DEFAULT_CONFIG);
          const patch = {};
          Object.keys(body.config).forEach(k => { if (allowed.includes(k)) patch[k] = body.config[k]; });
          natStore.config = { ...(natStore.config || {}), ...patch };
          out = { ok: true, config: NationalTeams.configOf(natStore) };
        } else out = { ok: false, error: "action : dismiss | cancel-election | config | appoint." };
        if (!out.ok) { sendJson(res, out.status || 400, out); return; }
        await NationalTeams.saveStore(natStore, multiSavePath);
        sendJson(res, 200, out);
        return;
      }
      if (route.pathname === "/api/admin/special-private-league" && req.method === "POST") {
        if (!isAdminAuthorized(req)) { sendJson(res, 403, { ok: false, error: "Jeton administrateur invalide ou manquant (X-Admin-Token)." }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const names = Array.isArray(body && body.teams) ? body.teams.map(n => String(n || "").trim()).filter(Boolean) : [];
        if (names.length < 2 || new Set(names.map(n => n.toLowerCase())).size !== names.length) {
          sendJson(res, 400, { ok: false, error: "'teams' : au moins 2 noms de clubs différents." }); return;
        }
        const world = await World.loadWorld(multiSavePath, now);
        if (!world) { sendJson(res, 404, { ok: false, error: "Aucune ligue partagée n'existe encore." }); return; }
        const refs = new Array(names.length).fill(null);
        for (const entry of world.leagues) {
          const lg = await World.loadLeague(world, entry.id, multiSavePath);
          if (!lg) continue;
          lg.teams.forEach((t, idx) => {
            const k = names.findIndex(n => n.toLowerCase() === String(t.name || "").trim().toLowerCase());
            if (k >= 0 && !refs[k]) refs[k] = PrivateLeague.refFor(entry.id, lg, idx, World.divisionLabel(entry.level, entry.group));
          });
        }
        const missing = names.filter((n, k) => !refs[k]);
        if (missing.length) { sendJson(res, 404, { ok: false, error: `Club(s) introuvable(s) : ${missing.join(", ")}.` }); return; }
        let startDay;
        const m = typeof (body && body.startDate) === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.startDate);
        if (m) startDay = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
        else startDay = Calendar.addParisCalendarDays(Calendar.parisLocalDateParts(now), 1);
        const lpStore = await PrivateLeague.loadStore(multiSavePath);
        if (!lpStore) { sendJson(res, 503, { ok: false, error: "Ligues privées momentanément illisibles, réessayez." }); return; }
        const result = PrivateLeague.createSpecialPrivateLeague(Engine, lpStore, refs, {
          name: body.name || "Ligue spéciale",
          hours: Array.isArray(body.hours) && body.hours.length ? body.hours.map(Number) : [10, 12, 14, 16, 18, 20],
          days: body.days != null ? Number(body.days) : 5,
          startDay,
        }, now);
        if (!result.ok) { sendJson(res, 400, result); return; }
        await PrivateLeague.saveStore(lpStore, multiSavePath);
        // Premier coup d'envoi : rattrapage du monde à l'heure pile.
        const cur = nextWorldDeadlineAt.get(multiSavePath);
        if (cur == null || result.firstAt < cur) nextWorldDeadlineAt.set(multiSavePath, result.firstAt);
        sendJson(res, 200, { ...result, teams: refs.map(r => ({ name: r.name, leagueId: r.leagueId, label: r.label })) });
        return;
      }

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
        // Classements du joueur (retour utilisateur 2026-10-03) : son
        // championnat, sa division, son pays et le monde, ramenés à 40 min.
        if (route.pathname === "/api/world/player-ranks") {
          const id = q.get("league") || ctx.leagueId;
          const entry = world.leagues.find(e => e.id === id);
          const lg = !entry ? null : id === ctx.leagueId ? ctx.league : await World.loadLeague(world, id, multiSavePath);
          const out = lg ? World.playerRankings(world, entry, lg, Number(q.get("team")), Number(q.get("id"))) : null;
          if (!out) { sendJson(res, 404, { ok: false, error: "Joueur introuvable." }); return; }
          sendJson(res, 200, { ok: true, ...out });
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
            t.plannedTactics = null; t.tacticPresets = []; t.marketWatchlist = []; t.marketAlerts = []; t.bookmarks = [];
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

      // Archives de saison (feuilles de match des saisons précédentes, voir
      // engine.js:buildSeasonArchive) : sans `season`, les saisons archivées
      // où le club a joué ; avec `season`, SES matchs de cette saison-là
      // (le club a pu changer de division entre-temps : retrouvé par son nom
      // dans l'index de son pays).
      if (route.pathname === "/api/season-archive" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const me = ctx.league.teams[ctx.teamIndex];
        const entry = ctx.world && (ctx.world.leagues || []).find(x => x.id === ctx.leagueId);
        const byCountry = (ctx.world && ctx.world.seasonArchives && entry && ctx.world.seasonArchives[entry.country]) || {};
        const leagueOf = season => Object.entries(byCountry[season] || {}).find(([, names]) => (names || []).includes(me.name));
        const seasonParam = route.searchParams.get("season");
        if (seasonParam == null) {
          const seasons = Object.keys(byCountry).map(Number).filter(n => leagueOf(n)).sort((a, b) => b - a);
          sendJson(res, 200, { ok: true, seasons, current: ctx.league.seasonNumber || 1 });
          return;
        }
        const season = Number(seasonParam);
        const found = Number.isInteger(season) ? leagueOf(season) : null;
        if (!found) { sendJson(res, 404, { ok: false, error: "Aucune archive pour cette saison." }); return; }
        const data = await store.loadSeasonArchive(found[0], season, multiSavePath);
        if (!data) { sendJson(res, 404, { ok: false, error: "Archive illisible ou absente." }); return; }
        sendJson(res, 200, {
          ok: true, season, leagueId: found[0], label: data.label, totalRounds: data.totalRounds, cols: data.cols, team: me.name,
          matches: (data.matches || []).filter(m => m.home.team === me.name || m.away.team === me.name),
        });
        return;
      }
      // Mémoire historique (assets/history.js) : journal d'un club (le sien
      // par défaut, `club` = nom d'un autre club). L'histoire est publique.
      if (route.pathname === "/api/history/club" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const me = ctx.league.teams[ctx.teamIndex];
        const club = String(route.searchParams.get("club") || (me && me.name) || "").slice(0, 80);
        if (!club) { sendJson(res, 400, { ok: false, error: "Club manquant." }); return; }
        await store.flushHistoryQueue(multiSavePath);
        const events = await store.loadClubHistory(club, multiSavePath);
        sendJson(res, 200, { ok: true, club, events: (events || []).slice().reverse() });
        return;
      }
      // Managers connectés (barre du haut) : uniquement un nombre, aucune
      // donnée personnelle. La présence vient des requêtes authentifiées
      // (resolvePlayerContext) : un jeton non vérifié ne compte jamais.
      // Drapeaux globaux (server/featureFlags.js), lus par le client au
      // démarrage : mode de la mise en scène du direct, sous-drapeaux, pub.
      if (route.pathname === "/api/features" && req.method === "GET") {
        const flags = await FeatureFlags.load(store, multiSavePath);
        sendJson(res, 200, { ok: true, ...flags });
        return;
      }
      // Suivi des pubs (2026-10-08, pub des non-premium pendant les shows du
      // direct) : compteurs du jour par événement, cumulés en mémoire et
      // enregistrés au plus une fois par minute (store « adsstats »).
      if (route.pathname === "/api/ads/track" && req.method === "POST") {
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false }); return; }
        const ev = body && typeof body.event === "string" ? body.event : "";
        if (!["request", "impression", "click", "dismissed", "failure"].includes(ev)) { sendJson(res, 400, { ok: false, error: "Événement inconnu." }); return; }
        AdsStats.count(ev, typeof body.placement === "string" ? body.placement.slice(0, 24) : "unknown", typeof body.show === "string" ? body.show.slice(0, 16) : "");
        AdsStats.scheduleFlush(store, multiSavePath);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (route.pathname === "/api/online" && req.method === "GET") {
        sendJson(res, 200, { online: Math.max(1, LeagueChat.onlineCount(now)) });
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
      // Diagnostic public du stockage (incident 2026-10-02) : ouvrir
      // https://hoop-manager.com/api/health/storage dans un navigateur.
      if (route.pathname === "/api/health/storage" && req.method === "GET") {
        const h = await store.storageHealth(multiSavePath);
        sendJson(res, h.ok ? 200 : 503, h);
        return;
      }
      if (route.pathname === "/api/save" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const payload = store.serializeMultiLeague(ctx.league);
        payload.myTeamIndex = ctx.teamIndex;
        // Jours de match officiel de CE club (championnat, coupe, play-offs ;
        // PAS les ligues privées, qui n'empêchent pas l'entraînement), mêmes que la validation de /api/training : la page
        // Entraînement les bloque aussi sur les semaines à venir, même quand
        // l'adversaire de coupe n'est pas encore connu.
        payload.myOfficialDays = [...Friendlies.officialDaysFor(Engine, ctx.league, ctx.teamIndex)];
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
        // Caractéristiques des adversaires : seulement celles révélées par
        // le scouting (joueurs sur le marché : toutes) ; niveau de chaque club
        // et estimations de vente calculés ici. Voir server/publicPlayers.js.
        {
          // Brouillard de guerre (assets/scouting-fog.js) : notes réelles
          // pour la fourchette des joueurs jamais analysés, jamais envoyées.
          const ovrById = {};
          ctx.league.teams.forEach(t => (t.players || []).forEach(p => { ovrById[p.id] = p.overall(); }));
          (payload.league.guestTeams || []).forEach(g => {
            if (!g || !g.team) return;
            try { Engine.teamFromSave(g.team).players.forEach(p => { ovrById[p.id] = p.overall(); }); } catch (e) { /* invité illisible */ }
          });
          const me = ctx.league.teams[ctx.teamIndex];
          const valuations = {};
          if (me) me.players.forEach(p => { valuations[p.id] = PublicPlayers.comparableSalesValuation(ctx.league, p, now); });
          payload.league.saleValuations = valuations;
          PublicPlayers.sanitizeOwnLeagueForViewer(payload.league, ctx.teamIndex, {
            viewer: me || null, season: ctx.league.seasonNumber || 1, ovrById,
          });
        }
        // Zones du classement réellement en jeu (montée / barrage / descentes),
        // voir World.divisionMovesFor. Absent = aucune division autour.
        if (ctx.world) payload.league.divisionMoves = World.divisionMovesFor(ctx.world, ctx.leagueId);
        // Ligues privées « monde » de ce manager (code compris), clubs des
        // autres championnats en invités légers (server/privateLeague.js).
        {
          const lpv = privateLeaguesForViewer(ctx, now);
          payload.league.privateLeagues = lpv.privateLeagues;
          payload.league.guestTeams = (payload.league.guestTeams || []).concat(lpv.guests);
        }
        // Matchs amicaux : seulement les siens, sans la compo de l'adversaire.
        payload.league.friendlies = Friendlies.sanitizeFriendliesForViewer(payload.league.friendlies, ctx.teamIndex, now);
        // Permaliens actifs de ses joueurs { playerId: code } (fiche joueur,
        // bouton « Partager », voir server/playerLinks.js).
        try {
          payload.playerShareLinks = await PlayerLinks.linksForTeam(multiSavePath, ctx.leagueId, ctx.teamIndex, ctx.league);
        } catch (e) { payload.playerShareLinks = {}; }
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
          // Langue des notifications de cet appareil : préférence du compte,
          // sinon langue du jeu dans ce navigateur (`lang`), sinon
          // Accept-Language, sinon pays du club, sinon anglais (server/i18n.js:langFor).
          let account = null;
          try { account = Accounts.findByManagerToken(await Accounts.loadAccounts(accountsPath), getManagerToken(req)); } catch (e) { /* sans compte */ }
          const pushLang = I18n.langFor(account, I18n.hintFromRequest(req, body && body.lang), team.country);
          if (!Push.addSubscription(team, body && body.subscription, now, pushLang)) { sendJson(res, 400, { ok: false, error: "Abonnement invalide." }); return; }
        }
        await store.saveMultiLeague(ctx.league, multiSavePath);
        sendJson(res, 200, { ok: true, devices: (team.pushSubscriptions || []).length });
        return;
      }

      // Direct d'un match de ligue privée (voir server/privateLeague.js,
      // lpLiveKey) : réservé aux membres de la ligue. En cours : horaires
      // réels (on rejoint le match là où il en est) ; terminé : « Revoir le
      // direct », horaires recalés pour démarrer maintenant. Vu depuis son
      // club s'il joue ce match, sinon depuis l'équipe à domicile (`watchIdx`).
      if (route.pathname === "/api/private-league/live" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const q = route.searchParams;
        const mine = memberPrivateLeague(ctx, q.get("lp"));
        if (!mine) { sendJson(res, 404, { ok: false, error: "Ligue privée introuvable." }); return; }
        const { lp, slotToLocal } = mine;
        const roundIndex = Number(q.get("round")), home = Number(q.get("home")), away = Number(q.get("away"));
        const round = lp.rounds[roundIndex];
        const match = round && round.matches.find(m => slotToLocal[m.home] === home && slotToLocal[m.away] === away);
        if (!match || !match.played || typeof match.liveUntil !== "number") { sendJson(res, 404, { ok: false, error: "Pas de direct pour ce match." }); return; }
        const found = (await privateLeagueLiveEntries(lp, roundIndex, slotToLocal, multiSavePath, { home: match.home, away: match.away }))[0];
        if (!found) { sendJson(res, 404, { ok: false, error: "Ce direct n'est plus disponible." }); return; }
        const entry = found.entry;
        const watchIdx = entry.homeIdx === ctx.teamIndex || entry.awayIdx === ctx.teamIndex ? ctx.teamIndex : entry.homeIdx;
        const view = LiveMatch.viewLiveMatchForTeam({ liveMatches: { [found.item.key]: entry } }, watchIdx);
        view.privateLeague = entry.privateLeague;
        const ended = now >= match.liveUntil;
        if (ended) {
          const delta = now + 2000 - entry.kickoffAt;
          view.kickoffAt += delta;
          view.events = view.events.map(ev => (typeof ev.airAt === "number" ? { ...ev, airAt: ev.airAt + delta } : ev));
          view.pauses = (view.pauses || []).map(pz => (typeof pz.airAt === "number" ? { ...pz, airAt: pz.airAt + delta } : pz));
          view.replay = true;
        }
        // Clubs d'un autre championnat dans ce match : effectif complet (le
        // direct affiche leurs joueurs), comme les invités de la Coupe nationale.
        const guestTeams = [];
        const cache = new Map();
        for (const slot of [match.home, match.away]) {
          const ref = lp.members[slot];
          if (!ref || ref.leagueId === ctx.leagueId) continue;
          const team = await privateLeagueMemberTeam(ctx, lp, slot, cache, multiSavePath);
          if (team) guestTeams.push({ ...World.NationalCup.guestForTeam(Engine, team, ref), localIdx: slotToLocal[slot] });
        }
        const nameOf = idx => { const s2 = slotToLocal.indexOf(idx); return s2 >= 0 ? lp.members[s2].name : ""; };
        sendJson(res, 200, { ok: true, live: view, watchIdx, mine: watchIdx === ctx.teamIndex, ended, guestTeams,
          teamName: nameOf(watchIdx), opponentName: nameOf(view.opponentIdx) });
        return;
      }

      if (route.pathname === "/api/replay" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const team = ctx.league.teams[ctx.teamIndex];
        const data = await store.loadReplays(ctx.leagueId, multiSavePath);
        const q = route.searchParams;
        // Recherche : `key` (clé de diffusion sans la saison : « ncup:… »,
        // « scup:… », « cup:… » ou « J:dom:ext ») quand le navigateur la
        // connaît — fiable même pour un club invité de la Coupe nationale —,
        // sinon journée + compétition + clubs.
        const comp = q.get("competition") === "cup" ? "cup" : "championship";
        const round = Number(q.get("round")), home = Number(q.get("home")), away = Number(q.get("away"));
        const key = q.get("key");
        const byKey = x => x.key === key || x.key.endsWith(":" + key);
        const byFields = x => x.entry.round === round && (x.entry.competition || "championship") === comp && x.entry.homeIdx === home && x.entry.awayIdx === away;
        const list = data.list.slice().reverse();
        const item = (key && list.find(byKey)) || (Number.isInteger(round) && list.find(byFields)) || null;
        if (!item) { sendJson(res, 404, { ok: false, error: "Ce direct n'est plus disponible." }); return; }
        const premium = typeof team.hasActivePremium === "function" ? team.hasActivePremium(now) : !!team.isPaying;
        if (!premium) { sendJson(res, 403, { ok: false, code: "premium-required", error: "Revoir un direct est réservé au Premium." }); return; }
        // Tous les matchs diffusés se revoient (retour utilisateur 2026-10-01 :
        // « il faudrait pouvoir revoir les matchs de tout le monde ») : vu
        // depuis son club s'il a joué ce match, sinon depuis le club à
        // domicile (`watchIdx`, fenêtre spectateur côté navigateur).
        const mine = item.entry.homeIdx === ctx.teamIndex || item.entry.awayIdx === ctx.teamIndex;
        // (club invité de la Coupe nationale à domicile : on suit le club local)
        const watchIdx = mine ? ctx.teamIndex : (ctx.league.teams[item.entry.homeIdx] ? item.entry.homeIdx : item.entry.awayIdx);
        const view = LiveMatch.viewLiveMatchForTeam({ liveMatches: { [item.key]: item.entry } }, watchIdx);
        const delta = now + 2000 - item.entry.kickoffAt;
        view.kickoffAt += delta;
        view.events = view.events.map(ev => (typeof ev.airAt === "number" ? { ...ev, airAt: ev.airAt + delta } : ev));
        view.pauses = (view.pauses || []).map(pz => (typeof pz.airAt === "number" ? { ...pz, airAt: pz.airAt + delta } : pz));
        view.replay = true;
        const guest = item.entry.guest ? { ...item.entry.guest, localIdx: view.opponentIdx } : null;
        const nameOf = idx => (ctx.league.teams[idx] || {}).name || (guest && guest.team && idx === view.opponentIdx ? guest.team.name : "");
        sendJson(res, 200, { ok: true, key: item.key, live: view, guest, mine, watchIdx, teamName: nameOf(watchIdx), opponentName: nameOf(view.opponentIdx) });
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
        await attachPrivateLeagueScoutingGuest(ctx, opponentIdx, multiSavePath, now);
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
        await attachPrivateLeagueScoutingGuest(ctx, opponentIdx, multiSavePath, now);
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

      // Émissions d'un match de ligue privée (sans pronostics, voir
      // Shows.getLpPrematchShow) : ?lp=&round=, pour son propre match.
      if ((route.pathname === "/api/shows/lp/prematch" || route.pathname === "/api/shows/lp/halftime") && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const { changed } = tick(ctx.league, now);
        if (changed) await persistContext(ctx);
        const mine = memberPrivateLeague(ctx, route.searchParams.get("lp"));
        const roundIndex = Number(route.searchParams.get("round"));
        if (!mine || !mine.lp.rounds[roundIndex]) { sendJson(res, 404, { ok: false, error: "Aucune émission disponible." }); return; }
        const { lp, slotToLocal } = mine;
        const lpView = privateLeaguesForViewer(ctx, now).privateLeagues.find(x => x.id === lp.id);
        const mySlot = PrivateLeague.memberSlot(lp, ctx.leagueId, ctx.teamIndex);
        const myMatch = lp.rounds[roundIndex].matches.find(m => m.home === mySlot || m.away === mySlot);
        let show = null;
        if (route.pathname.endsWith("/prematch")) {
          const showLeague = await privateLeagueShowLeague(ctx, lp, slotToLocal, myMatch ? [myMatch.home, myMatch.away] : [], multiSavePath, now);
          show = Shows.getLpPrematchShow(showLeague, lpView, roundIndex, ctx.teamIndex, now);
        } else {
          const found = await privateLeagueLiveEntries(lp, roundIndex, slotToLocal, multiSavePath);
          const slots = [];
          found.forEach(f => slots.push(f.match.home, f.match.away));
          const showLeague = await privateLeagueShowLeague(ctx, lp, slotToLocal, slots, multiSavePath, now);
          show = Shows.getLpHalftimeShow(showLeague, lpView, roundIndex, ctx.teamIndex, found.map(f => f.entry), now);
        }
        if (!show) { sendJson(res, 404, { ok: false, error: "Émission pas encore ouverte." }); return; }
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

      // Permalien d'un joueur de son club (server/playerLinks.js) :
      // POST /api/player/share-link { playerId } crée (ou renvoie) le code,
      // POST /api/player/share-link/revoke { playerId } le coupe. Réservé au
      // manager du club (jeton) ; stockage à part, la ligue n'est pas réécrite.
      if ((route.pathname === "/api/player/share-link" || route.pathname === "/api/player/share-link/revoke") && req.method === "POST") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const playerId = body && body.playerId;
        const out = route.pathname.endsWith("/revoke")
          ? await PlayerLinks.revokeLink(multiSavePath, ctx, playerId)
          : await PlayerLinks.createLink(multiSavePath, ctx, playerId, now);
        if (!out.ok) { sendJson(res, out.status || 400, out); return; }
        if (out.code) out.url = `${originFor(req)}/j/${out.code}`;
        sendJson(res, 200, out);
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
            seasons: body.seasons == null ? null : Engine.normalizeContractSeasons(body.seasons),
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
      // Négociation de contrat sur l'annonce d'un AUTRE championnat (id négatif).
      if (route.pathname === "/api/market/negotiate" && req.method === "POST") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        let body;
        try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const rawId = body && body.listingId;
        const numId = typeof rawId === "string" && /^-?\d+$/.test(rawId) ? Number(rawId) : rawId;
        if (ctx.world && typeof numId === "number" && numId < 0) {
          const index = await store.loadWorldAuxRaw("market", multiSavePath);
          const out = await World.WorldMarket.negotiateForeign({
            index, leagueId: ctx.leagueId, teamIdx: ctx.teamIndex, team: ctx.league.teams[ctx.teamIndex], gid: -numId,
            offer: { salary: body.salary, seasons: body.seasons }, now,
            loadLeague: id => World.loadLeague(ctx.world, id, multiSavePath),
            saveLeague: lg => store.saveMultiLeague(lg, multiSavePath),
            saveIndex: ix => store.saveWorldAuxRaw("market", ix, multiSavePath),
          });
          if (!out.ok) {
            const msg = out.reason === "invalid-salary"
              ? (out.floor != null && out.floor === out.demand ? `Après trois refus, il ne signe qu'au salaire demandé (${Math.round(out.demand).toLocaleString("fr-FR")} $).` : "Offre trop basse : il refuse même de l'étudier. Rapprochez-vous de sa demande.")
              : out.reason === "already-agreed" ? "Accord déjà conclu avec ce joueur." : out.reason === "former-club" ? "Votre ancien joueur ne veut pas revenir." : "Négociation impossible.";
            sendJson(res, 400, { ok: false, error: msg, reason: out.reason }); return;
          }
          sendJson(res, 200, { ok: true, foreign: true, ...out });
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
            seasons: body.seasons == null ? null : Engine.normalizeContractSeasons(body.seasons),
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

      // Ligues privées « monde » (server/privateLeague.js) : création,
      // adhésion par code depuis n'importe quel championnat, départ, lancement.
      if (req.method === "POST" && PRIVATE_LEAGUE_ACTIONS[route.pathname]) {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        let body = req.__parsedBody;
        if (body === undefined) {
          try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        }
        if (!ctx.lpStore) { sendJson(res, 503, { ok: false, error: "Ligues privées momentanément indisponibles, réessayez dans quelques minutes." }); return; }
        const label = World.divisionLabelOf(ctx.world, ctx.leagueId);
        const me = { league: ctx.league, idx: ctx.teamIndex, ref: PrivateLeague.refFor(ctx.leagueId, ctx.league, ctx.teamIndex, label) };
        const result = PRIVATE_LEAGUE_ACTIONS[route.pathname](Engine, ctx.lpStore, me, body, now);
        if (!result.ok) { sendJson(res, 400, result); return; }
        try {
          await PrivateLeague.saveStore(ctx.lpStore, multiSavePath);
        } catch (e) {
          sendJson(res, 503, { ok: false, error: "Ligues privées momentanément indisponibles, réessayez dans quelques minutes." });
          return;
        }
        // Lancement : premier vendredi = échéance du rattrapage du monde.
        const lpNext = PrivateLeague.nextDeadline(ctx.lpStore, now);
        const cur = nextWorldDeadlineAt.get(multiSavePath);
        if (lpNext != null && (cur == null || lpNext < cur)) nextWorldDeadlineAt.set(multiSavePath, lpNext);
        ctx.league.worldPrivateLeagueTimes = PrivateLeague.busyTimesByIdx(ctx.lpStore, ctx.leagueId);
        const lpv = privateLeaguesForViewer(ctx, now);
        sendJson(res, 200, { ...result, privateLeagues: lpv.privateLeagues, guestTeams: lpv.guests, state: buildStateSnapshot(ctx.league, ctx.teamIndex, now) });
        return;
      }

      // Où est ce joueur aujourd'hui ? (historique des transferts, 2026-10-05 :
      // un nom de joueur ouvre sa fiche, même s'il a changé de club ou de
      // championnat depuis). GET ?id=&hint=<leagueId> → { leagueId, teamIdx,
      // status: club|youth|fa } ou found:false (retiré du jeu). Même
      // recherche que les signets (championnat indiqué, le sien, puis le monde).
      if (route.pathname === "/api/world/locate-player" && req.method === "GET") {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const q = route.searchParams;
        const rawId = q.get("id");
        const id = rawId != null && /^-?\d+$/.test(rawId) ? Number(rawId) : rawId;
        const hint = q.get("hint") || null;
        const own = ctx.leagueId || null;
        const tryIn = async lid => {
          const lg = !lid || lid === own ? ctx.league : await World.loadLeague(ctx.world, lid, multiSavePath).catch(() => null);
          const r = Bookmarks.locatePlayer(lg, id);
          return r ? { leagueId: lid || own, teamIdx: r.teamIdx, status: r.status } : null;
        };
        let hit = (hint && ctx.world && (ctx.world.leagues || []).some(e => e.id === hint) ? await tryIn(hint) : null) || await tryIn(own);
        if (!hit && ctx.world) for (const e of ctx.world.leagues || []) { if (e.id === own || e.id === hint) continue; hit = await tryIn(e.id); if (hit) break; }
        // Joueur de l'académie d'un AUTRE club : jamais révélé.
        if (hit && hit.status === "youth" && !(hit.leagueId === own && hit.teamIdx === ctx.teamIndex)) hit = { ...hit, status: "club-hidden" };
        sendJson(res, 200, hit ? { ok: true, found: true, mine: hit.leagueId === own, ...hit } : { ok: true, found: false });
        return;
      }

      // Sélections nationales (phase A, voir server/nationalTeams.js) :
      // GET /api/national/overview, GET /api/national/election?id=,
      // GET /api/national/team?id=,
      // POST /api/national/{candidacy,withdraw,vote,resign}.
      if (route.pathname.startsWith("/api/national/")) {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        if (!ctx.world) { sendJson(res, 400, { ok: false, error: "Sélections nationales : réservé au monde partagé." }); return; }
        const natStore = await NationalTeams.loadStore(multiSavePath);
        if (!natStore) { sendJson(res, 503, { ok: false, error: "Sélections nationales momentanément indisponibles, réessayez dans quelques minutes." }); return; }
        const me = NationalTeams.managerOf(ctx.leagueId, ctx.league, ctx.teamIndex, ctx.world);
        const season = ctx.league.seasonNumber || 1;
        // Mode Sélectionneur (phase E) : mandats en cours du manager (bouton
        // de bascule dans la barre du haut), sans le reste de la page.
        if (req.method === "GET" && route.pathname === "/api/national/me") {
          const mine = me ? NationalTeams.mandatesOfKey(natStore, me.key).map(m => ({ teamId: m.teamId, label: NationalTeams.teamLabel(m.teamId), country: natStore.teams[m.teamId].country, cat: natStore.teams[m.teamId].cat, fromSeason: m.fromSeason, toSeason: m.toSeason, role: "coach", unread: Math.max(0, (m.feedSeq || 0) - (m.feedSeenId || 0)) })) : [];
          // Staff (staff NT et DTN) : accès au mode Sélectionneur, menu
          // filtré selon le rôle ; invitations en attente.
          const staff = me ? require("./nationalCoach.js").staffOf(natStore, me.key) : { staffRoles: [], staffInvites: [] };
          sendJson(res, 200, { ok: true, mandates: mine, staffRoles: staff.staffRoles, staffInvites: staff.staffInvites });
          return;
        }
        if (req.method === "GET" && route.pathname === "/api/national/overview") {
          sendJson(res, 200, NationalTeams.overview(natStore, me, season, now));
          return;
        }
        // Page équipe d'une sélection : groupe, calendrier, sélectionneurs.
        if (req.method === "GET" && route.pathname === "/api/national/team") {
          const view = NationalTeams.teamView(natStore, route.searchParams.get("id"), me, season, now, ctx.league.calendarStartAt);
          if (!view) { sendJson(res, 404, { ok: false, error: "Sélection inconnue." }); return; }
          sendJson(res, 200, view);
          return;
        }
        if (req.method === "GET" && route.pathname === "/api/national/election") {
          const el = natStore.elections.find(e => e.id === route.searchParams.get("id"));
          if (!el) { sendJson(res, 404, { ok: false, error: "Élection introuvable." }); return; }
          sendJson(res, 200, { ok: true, election: NationalTeams.publicElection(natStore, el, me, true), coach: NationalTeams.publicMandate(NationalTeams.activeMandate(natStore, el.teamId)) });
          return;
        }
        // Phase C : feuille d'un match international (public).
        if (req.method === "GET" && route.pathname === "/api/national/match") {
          const md = require("./nationalMatches.js").matchDetail(natStore, route.searchParams.get("id"), now);
          if (!md) { sendJson(res, 404, { ok: false, error: "Match introuvable." }); return; }
          sendJson(res, 200, { ok: true, match: md });
          return;
        }
        // Direct d'un match international (public), calqué sur
        // /api/private-league/live : entrée rangée à part (store.loadNationalLive),
        // vue construite par LiveMatch.viewLiveMatchForTeam depuis l'équipe à
        // domicile ; les deux sélections sont des invités (index locaux
        // NationalMatches.LIVE_GUEST_IDX…). Terminé : « Revoir le direct »,
        // horaires recalés pour démarrer maintenant.
        if (req.method === "GET" && route.pathname === "/api/national/live") {
          const NationalMatches = require("./nationalMatches.js");
          const hit = NationalMatches.findMatch(natStore, route.searchParams.get("id"));
          if (!hit || hit.m.status !== "played") { sendJson(res, 404, { ok: false, error: "Le direct commence au coup d'envoi." }); return; }
          const match = hit.m;
          if (typeof match.liveUntil !== "number") { sendJson(res, 404, { ok: false, error: "Pas de direct pour ce match." }); return; }
          const saved = await store.loadNationalLive(match.id, multiSavePath);
          if (!saved || !saved.entry || !saved.teams) { sendJson(res, 404, { ok: false, error: "Ce direct n'est plus disponible." }); return; }
          const entry = saved.entry;
          const watchIdx = entry.homeIdx;
          const view = LiveMatch.viewLiveMatchForTeam({ liveMatches: { [match.id]: entry } }, watchIdx);
          view.intl = entry.intl || null;
          const ended = now >= match.liveUntil;
          if (ended) {
            const delta = now + 2000 - entry.kickoffAt;
            view.kickoffAt += delta;
            view.events = view.events.map(ev => (typeof ev.airAt === "number" ? { ...ev, airAt: ev.airAt + delta } : ev));
            view.pauses = (view.pauses || []).map(pz => (typeof pz.airAt === "number" ? { ...pz, airAt: pz.airAt + delta } : pz));
            view.replay = true;
          }
          const guestTeams = [
            { leagueId: null, idx: null, level: null, team: saved.teams.home, localIdx: entry.homeIdx },
            { leagueId: null, idx: null, level: null, team: saved.teams.away, localIdx: entry.awayIdx },
          ];
          sendJson(res, 200, { ok: true, live: view, watchIdx, mine: false, ended, guestTeams,
            teamName: NationalTeams.teamLabel(match.home), opponentName: NationalTeams.teamLabel(match.away) });
          return;
        }
        // Analyse Premium du Mode Sélectionneur (2026-10-06) : matchs
        // internationaux (saison en cours et précédente) d'une sélection en
        // « équipe virtuelle » pour le rapport Scouting Pro des clubs.
        // GET /api/national/coach/analysis-data?teamId=&opp= (opp absent =
        // sa propre sélection) ; staff ayant le droit "analysis".
        if (req.method === "GET" && route.pathname === "/api/national/coach/analysis-data") {
          const NationalCoach = require("./nationalCoach.js");
          const teamId = route.searchParams.get("teamId") || route.searchParams.get("id");
          const opp = route.searchParams.get("opp") || null;
          const own = !opp || opp === teamId;
          const pool = own && natStore.teams[teamId] ? await NationalCoach.loadPool(teamId, multiSavePath) : null;
          const outA = NationalCoach.analysisData(natStore, me, teamId, own ? null : opp, now, { season, pool });
          sendJson(res, outA.ok ? 200 : (outA.status || 400), outA);
          return;
        }
        // Phase B (server/nationalCoach.js) : espace du sélectionneur.
        // GET /api/national/coach?id= ; POST /api/national/coach/{list,
        // convocation,replace,tactics} — réservés au sélectionneur en poste.
        if (route.pathname === "/api/national/coach" || route.pathname.startsWith("/api/national/coach/")) {
          const NationalCoach = require("./nationalCoach.js");
          let body = null;
          if (req.method === "POST") {
            try { body = req.__parsedBody !== undefined ? req.__parsedBody : await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
          }
          const teamId = req.method === "GET" ? route.searchParams.get("id") : body && body.teamId;
          const coachCtx = { pool: await NationalCoach.loadPool(teamId, multiSavePath), season, calendarStartAt: ctx.league.calendarStartAt, opp: req.method === "GET" ? route.searchParams.get("opp") : (body && body.opp) || null };
          let outC = null;
          if (req.method === "POST") {
            // Droits vérifiés dans chaque action (nationalCoach.PERMS et
            // APPOINT) : staff NT (sélectionneur, adjoints, personnes
            // aidantes) et DTN (recruteurs, scouts).
            const NationalFriendlies = require("./nationalFriendlies.js");
            const COACH_ACTIONS = {
              "/api/national/coach/list": NationalCoach.setListMember,
              "/api/national/coach/convocation": NationalCoach.setConvocation,
              "/api/national/coach/replace": NationalCoach.replaceConvoked,
              "/api/national/coach/tactics": NationalCoach.setTactics,
              "/api/national/coach/seen": NationalCoach.markSeen,
              // Staff : nomination (par mid de l'annuaire, selon APPOINT),
              // réponse de l'invité, retrait (même règle) ou départ
              // volontaire, joueurs attribués aux scouts.
              "/api/national/coach/staff/invite": NationalCoach.staffInvite,
              "/api/national/coach/staff/respond": NationalCoach.staffRespond,
              "/api/national/coach/staff/remove": NationalCoach.staffRemove,
              "/api/national/coach/staff/assign": NationalCoach.staffAssign,
              // Notes privées du staff sur un joueur (ajout, suppression).
              "/api/national/coach/note": NationalCoach.setNote,
              // Matchs amicaux internationaux (sélectionneur et adjoints).
              "/api/national/coach/friendly/request": NationalFriendlies.request,
              "/api/national/coach/friendly/respond": NationalFriendlies.respond,
              "/api/national/coach/friendly/cancel": NationalFriendlies.cancel,
            };
            const fnC = COACH_ACTIONS[route.pathname];
            if (!fnC) { sendJson(res, 404, { ok: false, error: "Route inconnue." }); return; }
            outC = fnC(natStore, me, body || {}, now, coachCtx);
            if (!outC.ok) { sendJson(res, outC.status || 400, { ok: false, error: outC.error }); return; }
            try { await NationalTeams.saveStore(natStore, multiSavePath); } catch (e) { sendJson(res, 503, { ok: false, error: "Enregistrement impossible, réessayez." }); return; }
            // Proposition de poste : message dans la messagerie interne (de
            // celui qui nomme à l'invité), avec « Accepter le poste ».
            if (outC.message && outC.message.to) {
              const msg = outC.message;
              delete outC.message;
              try {
                if (ctx.leagueId && !ctx.league.leagueId) ctx.league.leagueId = ctx.leagueId;
                await messages.send(ctx.league, ctx.teamIndex, { to: `${msg.to.leagueId}:${msg.to.idx}`, text: msg.text }, now, { meta: msg.meta });
              } catch (e) { /* confort : la notification du club suffit */ }
            }
            // Notifications en attente : envoyées au prochain passage du monde.
            // Amical accepté : le monde doit repasser à son heure (gel, match).
            if ((Array.isArray(natStore.outbox) && natStore.outbox.length) || route.pathname.startsWith("/api/national/coach/friendly/")) {
              const cur = nextWorldDeadlineAt.get(multiSavePath);
              if (cur == null || now + 1000 < cur) nextWorldDeadlineAt.set(multiSavePath, now + 1000);
            }
          } else if (req.method !== "GET" || route.pathname !== "/api/national/coach") { sendJson(res, 404, { ok: false, error: "Route inconnue." }); return; }
          const view = NationalCoach.coachView(natStore, me, teamId, now, coachCtx);
          // Invité qui refuse, membre qui quitte le staff : plus d'accès à
          // la vue, on renvoie le résultat de l'action.
          if (!view.ok && outC) { sendJson(res, 200, outC); return; }
          sendJson(res, view.ok ? 200 : (view.status || 400), view);
          return;
        }
        // Fonctions nationales en cours d'un manager (profil public) et
        // sélection actuelle d'un joueur (fiche joueur), 2026-10-07.
        if (req.method === "GET" && route.pathname === "/api/national/roles") {
          const roles = require("./nationalExtras.js").rolesOf(natStore, route.searchParams.get("league") || ctx.leagueId, Number(route.searchParams.get("idx")));
          sendJson(res, 200, { ok: true, roles });
          return;
        }
        if (req.method === "GET" && route.pathname === "/api/national/player") {
          const pid = Number(route.searchParams.get("id"));
          const pname = String(route.searchParams.get("name") || "").slice(0, 80);
          const nat = String(route.searchParams.get("nat") || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
          sendJson(res, 200, require("./nationalExtras.js").playerSelection(natStore, pid, pname, nat));
          return;
        }
        const NAT_ACTIONS = {
          // Vitrine de la sélection (2026-10-07) : message (sélectionneur et
          // adjoints), personnalisation visuelle (sélectionneur).
          "/api/national/message": require("./nationalExtras.js").setMessage,
          "/api/national/visuals": require("./nationalExtras.js").setVisuals,
          "/api/national/candidacy": NationalTeams.runForElection,
          "/api/national/withdraw": NationalTeams.withdrawCandidacy,
          "/api/national/vote": NationalTeams.castVote,
          "/api/national/resign": NationalTeams.resign,
        };
        const fn = req.method === "POST" ? NAT_ACTIONS[route.pathname] : null;
        if (!fn) { sendJson(res, 404, { ok: false, error: "Route inconnue." }); return; }
        let body;
        try { body = req.__parsedBody !== undefined ? req.__parsedBody : await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const leaguesForNotify = new Map([[ctx.leagueId, ctx.league]]);
        const out = fn(natStore, me, body || {}, now, leaguesForNotify);
        if (!out.ok) { sendJson(res, out.status || 400, { ok: false, error: out.error }); return; }
        try { await NationalTeams.saveStore(natStore, multiSavePath); } catch (e) { sendJson(res, 503, { ok: false, error: "Enregistrement impossible, réessayez." }); return; }
        if (route.pathname === "/api/national/resign") await persistContext(ctx);
        if (route.pathname === "/api/national/message" || route.pathname === "/api/national/visuals") {
          sendJson(res, 200, { ...out, team: NationalTeams.teamView(natStore, body.teamId, me, season, now, ctx.league.calendarStartAt) });
          return;
        }
        sendJson(res, 200, { ...out, overview: NationalTeams.overview(natStore, me, season, now) });
        return;
      }

      // Signets du manager (2026-10-04, voir server/bookmarks.js) : GET =
      // liste résolue (position actuelle de chaque joueur, même transféré
      // dans un autre championnat), POST { playerId, on, leagueId? }.
      if (route.pathname === "/api/bookmarks" && (req.method === "GET" || req.method === "POST")) {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        const opts = {
          Engine, world: ctx.world || null,
          loadLeague: id => World.loadLeague(ctx.world, id, multiSavePath),
          labelOf: e => World.divisionLabel(e.level, e.group),
        };
        if (req.method === "GET") {
          const out = await Bookmarks.resolveBookmarks(ctx, opts);
          if (out.changed) await persistContext(ctx);
          sendJson(res, 200, { ok: true, items: out.items, removed: out.removed, bookmarks: ctx.league.teams[ctx.teamIndex].bookmarks });
          return;
        }
        let body;
        try { body = req.__parsedBody !== undefined ? req.__parsedBody : await readJsonBody(req); } catch (e) { sendJson(res, 400, { ok: false, error: e.message }); return; }
        const out = await Bookmarks.toggleBookmark(ctx, body, opts, now);
        if (!out.ok) { sendJson(res, out.status || 400, { ok: false, error: out.error }); return; }
        await persistContext(ctx);
        sendJson(res, 200, out);
        return;
      }

      const actionFn = req.method === "POST" ? ACTION_ROUTES[route.pathname] : null;
      if (actionFn) {
        const ctx = await resolvePlayerContext(req, savePath, multiSavePath, now);
        if (!ctx.ok) { sendJson(res, ctx.status, { ok: false, error: ctx.error }); return; }
        // Enchères en tête réservées : non dépensables (Team.spendableBudget).
        if (ctx.league && typeof ctx.league.syncReservedBids === "function") ctx.league.syncReservedBids();

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
        if (ctx.world && route.pathname.startsWith("/api/scouting/") && body) await attachPrivateLeagueScoutingGuest(ctx, body.opponent, multiSavePath, now);
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
          try {
            // Écrit dans la langue du compte du club destinataire.
            if (typeof notify.textFor === "function") {
              const lang = await Push.langForTeam(ctx.league.teams[notify.to]).catch(() => null);
              if (lang && lang !== "fr") notify.text = notify.textFor(lang);
              delete notify.textFor;
            }
            await messages.send(ctx.league, ctx.teamIndex, notify, now);
          } catch (e) { /* message facultatif */ }
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
  // IDs de joueurs à 10 chiffres (2026-10-06) : migration unique des joueurs
  // existants, sous le verrou de sauvegarde (aucune requête ni simulation
  // avant la fin). Voir server/playerIdMigration.js.
  (async () => {
    const release = await acquireSaveLock();
    try { await require("./playerIdMigration.js").runIfNeeded(multiSavePath); } catch (e) { console.error("[ids joueurs] migration échouée :", e); } finally { release(); }
  })();
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
      console.log(`Sauvegardes sur ${store.storageBackendName() === "redis" ? "Redis (REDIS_URL)" : "Upstash"}, clés « ${store.redisKey("multiLeague")} », « ${store.redisKey("accounts")} »...`);
    }
    console.log(`Connexion Discord : ${AccountRoutes.discordConfigured() ? "activée" : "désactivée (DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET absents)"}.`);
    if (!process.env.BASKET_ADMIN_TOKEN) {
      console.log("BASKET_ADMIN_TOKEN non défini : les routes /api/admin/* sont désactivées (toute requête sera refusée).");
    }
    if (Calendar.isFastTestModeEnabled()) {
      console.log("MODE ACCÉLÉRÉ (TEST) ACTIVÉ (BASKET_FAST_CALENDAR=1) : un match toutes les 5h, entraînement + semaine économique tous les 2 matchs : les nouvelles carrières/ligues démarrées à partir de maintenant en profitent ; une ligue déjà en cours garde son rythme actuel.");
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
