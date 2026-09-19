// Vérifie le serveur HTTP (server/index.js) de bout en bout : de vraies
// requêtes HTTP contre un vrai serveur Node (sur un port éphémère), avec une
// horloge et un fichier de sauvegarde injectés pour rester déterministe.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createHandler } = require("./index.js");
const { DAY_MS, MATCH_BROADCAST_DURATION_MS } = require("./calendar.js");

function tmpSavePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-server-test-")), "league.json");
}

function tmpMultiSavePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-server-test-multi-")), "multi-league.json");
}

function startTestServer(savePath, nowFn, multiSavePath) {
  const server = http.createServer(createHandler(savePath, nowFn, multiSavePath || tmpMultiSavePath()));
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(server, method, urlPath, jsonBody, extraHeaders) {
  const { port } = server.address();
  const payload = jsonBody !== undefined ? JSON.stringify(jsonBody) : null;
  const headers = { ...(extraHeaders || {}) };
  if (payload) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(payload); }
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, path: urlPath, method, headers,
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let body = null;
        try { body = JSON.parse(raw); } catch (e) { /* laissé à null si pas du JSON */ }
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const T0 = Date.UTC(2026, 8, 7);
  let now = T0;
  const nowFn = () => now;

  // -------------------------------------------------------------------
  // 1) /api/health répond, sans toucher à la sauvegarde.
  // -------------------------------------------------------------------
  {
    const savePath = tmpSavePath();
    const server = await startTestServer(savePath, nowFn);
    try {
      const res = await request(server, "GET", "/api/health");
      if (res.statusCode !== 200 || !res.body || res.body.ok !== true) {
        throw new Error(`❌ /api/health devrait répondre 200 {ok:true}, obtenu ${res.statusCode} ${JSON.stringify(res.body)}.`);
      }
      if (fs.existsSync(savePath)) throw new Error("❌ /api/health ne devrait pas créer de sauvegarde.");
      console.log("✅ /api/health répond correctement, sans effet de bord.");
    } finally {
      server.close();
    }
  }

  // -------------------------------------------------------------------
  // 2) /api/state : crée une carrière neuve au premier appel (si aucune
  //    sauvegarde n'existe), renvoie un instantané cohérent.
  // -------------------------------------------------------------------
  {
    const savePath = tmpSavePath();
    const server = await startTestServer(savePath, nowFn);
    try {
      const res = await request(server, "GET", "/api/state");
      if (res.statusCode !== 200) throw new Error(`❌ /api/state devrait répondre 200, obtenu ${res.statusCode}.`);
      const s = res.body;
      if (!s.team || s.team.playersCount !== 15) throw new Error(`❌ Une carrière neuve devrait avoir 15 joueurs, obtenu ${s.team && s.team.playersCount}.`);
      if (!Array.isArray(s.team.players) || s.team.players.length !== 15) throw new Error("❌ La liste détaillée des joueurs (team.players) devrait contenir les 15 joueurs.");
      if (!s.market || !Array.isArray(s.market.listings)) throw new Error("❌ L'instantané devrait inclure un état du marché (market.listings), même vide.");
      if (!s.league || s.league.totalRounds !== 18) throw new Error(`❌ Le championnat devrait compter 18 journées, obtenu ${s.league && s.league.totalRounds}.`);
      if (!s.league.nextMatch) throw new Error("❌ Un prochain match devrait être annoncé pour une carrière neuve.");
      if (typeof s.league.nextMatch.scheduledAt !== "number") throw new Error("❌ Le prochain match devrait avoir un horaire programmé (calendrier réel).");
      if (!fs.existsSync(savePath)) throw new Error("❌ /api/state aurait dû créer le fichier de sauvegarde pour une carrière neuve.");
      console.log("✅ /api/state crée une carrière neuve et renvoie un instantané cohérent (effectif, calendrier, prochain match).");
    } finally {
      server.close();
    }
  }

  // -------------------------------------------------------------------
  // 3) Le temps passe (le manager est parti plusieurs jours) : rappeler
  //    /api/state avec `now` avancé doit avoir fait avancer la ligue TOUTE
  //    SEULE (calendrier réel) — sans passer par /api/simulate-tick.
  // -------------------------------------------------------------------
  {
    const savePath = tmpSavePath();
    let localNow = T0;
    const server = await startTestServer(savePath, () => localNow);
    try {
      const first = await request(server, "GET", "/api/state");
      const roundBefore = first.body.league.round;

      // Avance le temps de 8 jours réels (largement de quoi dépasser les 2
      // matchs de la semaine 0).
      localNow = T0 + 8 * 24 * 60 * 60 * 1000;
      const second = await request(server, "GET", "/api/state");
      if (second.body.league.round <= roundBefore) {
        throw new Error(`❌ Après 8 jours réels écoulés, la ligue aurait dû avancer toute seule (round ${roundBefore} -> plus), obtenu round=${second.body.league.round}.`);
      }
      if (second.body.events.length === 0) {
        throw new Error("❌ /api/state devrait signaler les événements survenus pendant le rattrapage (matchs, entraînement).");
      }
      console.log(`✅ Le simple fait d'appeler /api/state après que le temps a passé fait avancer la ligue automatiquement (round ${roundBefore} → ${second.body.league.round}, ${second.body.events.length} événement(s)).`);
    } finally {
      server.close();
    }
  }

  // -------------------------------------------------------------------
  // 4) /api/simulate-tick : force un rattrapage immédiat (utile pour tester
  //    ou faire une démo sans attendre le vrai temps réel).
  // -------------------------------------------------------------------
  {
    const savePath = tmpSavePath();
    let localNow = T0;
    const server = await startTestServer(savePath, () => localNow);
    try {
      await request(server, "GET", "/api/state"); // crée la carrière
      localNow = T0 + 30 * 24 * 60 * 60 * 1000; // un mois plus tard
      const res = await request(server, "POST", "/api/simulate-tick");
      if (res.statusCode !== 200) throw new Error(`❌ POST /api/simulate-tick devrait répondre 200, obtenu ${res.statusCode}.`);
      if (!Array.isArray(res.body.events) || res.body.events.length === 0) {
        throw new Error("❌ Après un mois écoulé, POST /api/simulate-tick devrait rattraper des événements.");
      }
      console.log(`✅ POST /api/simulate-tick force le rattrapage sur demande (${res.body.events.length} événement(s)).`);
    } finally {
      server.close();
    }
  }

  // -------------------------------------------------------------------
  // 4bis) Actions du manager (/api/lineup, /api/tactics, /api/training,
  //    /api/market/list, /api/market/bid) : préparées à l'avance, elles
  //    doivent persister (survivre à un rechargement depuis le disque) et
  //    être rejetées proprement (400, pas un plantage) si invalides.
  // -------------------------------------------------------------------
  {
    const savePath = tmpSavePath();
    const server = await startTestServer(savePath, nowFn);
    try {
      const state1 = await request(server, "GET", "/api/state");
      const somePlayerId = state1.body.team.players[0].id;

      const training = await request(server, "POST", "/api/training", { trainingSkill: "threePoint", trainingPositions: ["Arrière"] });
      if (training.statusCode !== 200 || !training.body.ok) throw new Error(`❌ POST /api/training valide devrait répondre 200/ok, obtenu ${training.statusCode} ${JSON.stringify(training.body)}.`);
      if (training.body.state.team.trainingSkill !== "threePoint") throw new Error("❌ L'instantané renvoyé après /api/training devrait refléter le nouveau réglage.");

      const tactics = await request(server, "POST", "/api/tactics", { defense: "Zone press", rhythm: "Rapide" });
      if (tactics.statusCode !== 200 || !tactics.body.ok) throw new Error(`❌ POST /api/tactics valide devrait répondre 200/ok, obtenu ${tactics.statusCode}.`);

      const listing = await request(server, "POST", "/api/market/list", { playerId: somePlayerId, price: 3000 });
      if (listing.statusCode !== 200 || !listing.body.ok) throw new Error(`❌ POST /api/market/list valide devrait répondre 200/ok, obtenu ${listing.statusCode} ${JSON.stringify(listing.body)}.`);

      const badTraining = await request(server, "POST", "/api/training", { trainingSkill: "ne-existe-pas" });
      if (badTraining.statusCode !== 400 || badTraining.body.ok) throw new Error(`❌ Une compétence d'entraînement inconnue devrait être rejetée avec 400, obtenu ${badTraining.statusCode}.`);

      const malformedJson = await new Promise((resolve, reject) => {
        const { port } = server.address();
        const req = http.request({ host: "127.0.0.1", port, path: "/api/tactics", method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
          let raw = ""; res.on("data", c => raw += c); res.on("end", () => resolve({ statusCode: res.statusCode, raw }));
        });
        req.on("error", reject);
        req.write("{ceci n'est pas du json");
        req.end();
      });
      if (malformedJson.statusCode !== 400) throw new Error(`❌ Un corps JSON malformé devrait répondre 400 (pas planter le serveur), obtenu ${malformedJson.statusCode}.`);

      // Persistance réelle : recharger l'état depuis un NOUVEAU serveur
      // pointant sur le même fichier doit retrouver les réglages appliqués.
      server.close();
      const server2 = await startTestServer(savePath, nowFn);
      try {
        const reloaded = await request(server2, "GET", "/api/state");
        if (reloaded.body.team.trainingSkill !== "threePoint") throw new Error("❌ Le réglage d'entraînement devrait survivre à un redémarrage du serveur (rechargé depuis le fichier).");
        if (reloaded.body.team.defense !== "Zone press") throw new Error("❌ La tactique appliquée devrait survivre à un redémarrage du serveur.");
        if (!reloaded.body.market.listings.some(l => l.playerId === somePlayerId && l.isMine)) {
          throw new Error("❌ L'annonce de marché créée devrait apparaître dans l'état, y compris après redémarrage.");
        }
        console.log("✅ Les actions du manager (entraînement, tactiques, marché) sont appliquées, rejetées proprement si invalides, et survivent à un redémarrage du serveur.");
      } finally {
        server2.close();
      }
    } finally {
      try { server.close(); } catch (e) { /* déjà fermé plus haut */ }
    }
  }

  // -------------------------------------------------------------------
  // 4quater) GET /api/save, POST /api/save-raw, POST /api/new-career : la
  //    bascule complète navigateur -> serveur (voir moteurbasket3.html,
  //    saveMyTeam/loadMyTeam/resetCareer) repose sur ces trois routes.
  // -------------------------------------------------------------------
  {
    const savePath = tmpSavePath();
    const server = await startTestServer(savePath, nowFn);
    try {
      const saved1 = await request(server, "GET", "/api/save");
      if (saved1.statusCode !== 200) throw new Error(`❌ GET /api/save devrait répondre 200, obtenu ${saved1.statusCode}.`);
      if (!saved1.body.team || !saved1.body.league) throw new Error("❌ GET /api/save devrait renvoyer 'team' et 'league' (forme de store.serialize).");
      if (!Array.isArray(saved1.body.team.players) || saved1.body.team.players.length !== 15) {
        throw new Error("❌ GET /api/save devrait renvoyer un effectif complet (15 joueurs sérialisés), pas un résumé.");
      }
      console.log("✅ GET /api/save renvoie la sauvegarde complète (reconstructible via teamFromSave/leagueFromSave).");

      // Le client modifie sa copie locale (ex. un surnom d'équipe) puis la
      // renvoie intégralement.
      const mutated = JSON.parse(JSON.stringify(saved1.body));
      mutated.team.teamName = "Lyon Renommé"; // voir serializeTeam : le champ sérialisé est 'teamName', pas 'name'.
      mutated.team.budget = 999999;
      const rawSave = await request(server, "POST", "/api/save-raw", mutated);
      if (rawSave.statusCode !== 200 || !rawSave.body.ok) throw new Error(`❌ POST /api/save-raw valide devrait répondre 200/ok, obtenu ${rawSave.statusCode} ${JSON.stringify(rawSave.body)}.`);
      if (rawSave.body.state.team.name !== "Lyon Renommé" || rawSave.body.state.team.budget !== 999999) {
        throw new Error("❌ POST /api/save-raw devrait remplacer intégralement la sauvegarde par celle envoyée.");
      }
      console.log("✅ POST /api/save-raw remplace la sauvegarde par celle du client.");

      // Persiste réellement sur disque (pas juste en mémoire pour cette requête).
      const reReadAfterRaw = await request(server, "GET", "/api/state");
      if (reReadAfterRaw.body.team.name !== "Lyon Renommé") throw new Error("❌ POST /api/save-raw devrait persister sur disque (relu ensuite via /api/state).");
      console.log("✅ La sauvegarde brute persiste sur disque, relisible ensuite.");

      // Corps invalide (pas de 'league') -> 400 propre.
      const badRaw = await request(server, "POST", "/api/save-raw", { team: mutated.team });
      if (badRaw.statusCode !== 400 || badRaw.body.ok) throw new Error(`❌ POST /api/save-raw sans 'league' devrait répondre 400, obtenu ${badRaw.statusCode}.`);
      console.log("✅ POST /api/save-raw rejette un corps incomplet avec 400 (pas un plantage).");

      // Corps structurellement présent mais qui ne désérialise pas -> 400
      // (pas un crash serveur), voir teamFromSave/leagueFromSave.
      const garbageRaw = await request(server, "POST", "/api/save-raw", { team: { not: "valid" }, league: { not: "valid" } });
      if (garbageRaw.statusCode !== 400) throw new Error(`❌ Une sauvegarde brute illisible devrait répondre 400, obtenu ${garbageRaw.statusCode}.`);
      console.log("✅ POST /api/save-raw rejette une sauvegarde illisible avec 400 (pas un plantage).");

      // Nouvelle carrière : écrase par un effectif neuf.
      const fresh = await request(server, "POST", "/api/new-career");
      if (fresh.statusCode !== 200) throw new Error(`❌ POST /api/new-career devrait répondre 200, obtenu ${fresh.statusCode}.`);
      if (fresh.body.team.name === "Lyon Renommé") throw new Error("❌ POST /api/new-career devrait remplacer la carrière précédente par une toute nouvelle.");
      if (!Array.isArray(fresh.body.team.players) || fresh.body.team.players.length !== 15) throw new Error("❌ POST /api/new-career devrait créer un effectif complet de 15 joueurs.");
      const afterReset = await request(server, "GET", "/api/state");
      if (afterReset.body.team.name === "Lyon Renommé" || afterReset.body.team.budget === 999999) {
        throw new Error("❌ POST /api/new-career devrait persister sur disque (l'ancienne carrière ne devrait plus être relue ensuite).");
      }
      console.log("✅ POST /api/new-career remplace la carrière par une toute nouvelle, persistée.");
    } finally {
      server.close();
    }
  }

  // -------------------------------------------------------------------
  // 4ter) GET / sert la page (moteurbasket3.html) elle-même — sans toucher
  //    à la sauvegarde, comme /api/health — pour qu'elle puisse ensuite
  //    faire fetch() vers cette même origine (file:// ne peut pas).
  // -------------------------------------------------------------------
  {
    const savePath = tmpSavePath();
    const server = await startTestServer(savePath, nowFn);
    try {
      const res = await new Promise((resolve, reject) => {
        const { port } = server.address();
        const req = http.request({ host: "127.0.0.1", port, path: "/", method: "GET" }, (r) => {
          let raw = ""; r.on("data", c => raw += c); r.on("end", () => resolve({ statusCode: r.statusCode, contentType: r.headers["content-type"], raw }));
        });
        req.on("error", reject);
        req.end();
      });
      if (res.statusCode !== 200) throw new Error(`❌ GET / devrait répondre 200, obtenu ${res.statusCode}.`);
      if (!res.contentType || !res.contentType.includes("text/html")) throw new Error(`❌ GET / devrait renvoyer du HTML, obtenu Content-Type=${res.contentType}.`);
      if (!res.raw.includes("<html") && !res.raw.includes("<!DOCTYPE")) throw new Error("❌ GET / devrait renvoyer le contenu de moteurbasket3.html.");
      if (fs.existsSync(savePath)) throw new Error("❌ GET / ne devrait pas créer de sauvegarde (comme /api/health).");
      console.log("✅ GET / sert moteurbasket3.html directement, sans effet de bord.");
    } finally {
      server.close();
    }
  }

  // -------------------------------------------------------------------
  // 5) Route inconnue -> 404 propre (pas un plantage).
  // -------------------------------------------------------------------
  {
    const savePath = tmpSavePath();
    const server = await startTestServer(savePath, nowFn);
    try {
      const res = await request(server, "GET", "/api/nawak");
      if (res.statusCode !== 404) throw new Error(`❌ Une route inconnue devrait répondre 404, obtenu ${res.statusCode}.`);
      console.log("✅ Une route inconnue répond 404 proprement.");
    } finally {
      server.close();
    }
  }

  // -------------------------------------------------------------------
  // 6) MULTI-MANAGER — bootstrap/reset admin (protégés par
  //    BASKET_ADMIN_TOKEN) et routage par jeton (X-TipIn-Token) sur les
  //    mêmes routes joueur que ci-dessus (retour utilisateur, 2026-09 :
  //    "jusqu'à 10 vrais managers humains dans une ligue partagée").
  // -------------------------------------------------------------------
  {
    const legacySavePath = tmpSavePath();
    const multiSavePath = tmpMultiSavePath();
    const server = await startTestServer(legacySavePath, nowFn, multiSavePath);
    const prevAdminToken = process.env.BASKET_ADMIN_TOKEN;
    try {
      // --- Sans BASKET_ADMIN_TOKEN défini, toute requête admin est refusée
      // (jamais ouvert par défaut) — quel que soit l'en-tête envoyé.
      delete process.env.BASKET_ADMIN_TOKEN;
      const noAdminEnv = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon M", "Marseille M"] }, { "X-Admin-Token": "peu-importe" });
      if (noAdminEnv.statusCode !== 403) throw new Error(`❌ Sans BASKET_ADMIN_TOKEN défini, /api/admin/new-multi-league devrait répondre 403, obtenu ${noAdminEnv.statusCode}.`);
      console.log("✅ Les routes /api/admin/* sont désactivées (403) quand BASKET_ADMIN_TOKEN n'est pas défini côté serveur.");

      process.env.BASKET_ADMIN_TOKEN = "secret-admin-1";

      // --- Mauvais jeton admin -> 403.
      const wrongAdminToken = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon M", "Marseille M"] }, { "X-Admin-Token": "pas-le-bon" });
      if (wrongAdminToken.statusCode !== 403) throw new Error(`❌ Un mauvais X-Admin-Token devrait répondre 403, obtenu ${wrongAdminToken.statusCode}.`);
      console.log("✅ /api/admin/new-multi-league rejette un mauvais jeton administrateur (403).");

      // --- Corps invalide (pas de teamNames) -> 400.
      const badBody = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: [] }, { "X-Admin-Token": "secret-admin-1" });
      if (badBody.statusCode !== 400) throw new Error(`❌ 'teamNames' vide devrait être rejeté avec 400, obtenu ${badBody.statusCode}.`);
      console.log("✅ /api/admin/new-multi-league rejette un 'teamNames' invalide (400).");

      // --- Bootstrap valide : 3 managers humains + 7 CPU, liens complets.
      const bootstrap = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon M", "Marseille M", "Nice M"] }, { "X-Admin-Token": "secret-admin-1" });
      if (bootstrap.statusCode !== 200 || !bootstrap.body.ok) throw new Error(`❌ Un bootstrap valide devrait répondre 200/ok, obtenu ${bootstrap.statusCode} ${JSON.stringify(bootstrap.body)}.`);
      if (!Array.isArray(bootstrap.body.managers) || bootstrap.body.managers.length !== 3) {
        throw new Error(`❌ Le bootstrap devrait renvoyer exactement 3 managers (autant que de noms fournis), obtenu ${JSON.stringify(bootstrap.body.managers)}.`);
      }
      bootstrap.body.managers.forEach(m => {
        if (!m.token || !m.link || !m.link.includes(`?m=${m.token}`)) throw new Error(`❌ Chaque manager devrait avoir un jeton ET un lien privé complet, obtenu ${JSON.stringify(m)}.`);
      });
      console.log(`✅ /api/admin/new-multi-league crée une ligue à 3 managers humains (+7 CPU) et renvoie un lien privé complet par manager : ${bootstrap.body.managers.map(m => m.name).join(", ")}.`);

      // --- Un second bootstrap alors qu'une ligue existe déjà -> 409.
      const duplicateBootstrap = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Autre"] }, { "X-Admin-Token": "secret-admin-1" });
      if (duplicateBootstrap.statusCode !== 409) throw new Error(`❌ Un second bootstrap alors qu'une ligue partagée existe déjà devrait répondre 409, obtenu ${duplicateBootstrap.statusCode}.`);
      console.log("✅ /api/admin/new-multi-league refuse d'écraser une ligue partagée déjà existante (409) — voir /api/admin/reset-multi-league pour repartir.");

      const managerA = bootstrap.body.managers.find(m => m.name === "Lyon M");
      const managerB = bootstrap.body.managers.find(m => m.name === "Marseille M");

      // --- /api/state SANS jeton : comportement solo historique, totalement
      // indépendant de la ligue partagée (fichier distinct).
      const soloState = await request(server, "GET", "/api/state");
      if (soloState.statusCode !== 200 || soloState.body.team.name === "Lyon M") {
        throw new Error("❌ /api/state sans jeton devrait continuer de servir la carrière solo (fichier distinct), jamais la ligue partagée.");
      }
      console.log("✅ /api/state sans jeton continue de servir la carrière solo, indépendamment de la ligue partagée.");

      // --- /api/state avec un jeton INCONNU -> 401.
      const unknownToken = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": "jeton-inconnu" });
      if (unknownToken.statusCode !== 401) throw new Error(`❌ Un jeton manager inconnu devrait répondre 401, obtenu ${unknownToken.statusCode}.`);
      console.log("✅ /api/state avec un jeton manager inconnu répond 401.");

      // --- /api/state avec le jeton de managerA : reconnu, teamIndex correct.
      const stateA = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": managerA.token });
      if (stateA.statusCode !== 200) throw new Error(`❌ /api/state avec un jeton manager valide devrait répondre 200, obtenu ${stateA.statusCode}.`);
      if (stateA.body.team.name !== "Lyon M") throw new Error(`❌ /api/state devrait résoudre l'équipe DE CE manager (Lyon M), obtenu ${stateA.body.team.name}.`);
      if (stateA.body.myTeamIndex !== managerA.teamIndex) throw new Error(`❌ myTeamIndex devrait valoir ${managerA.teamIndex}, obtenu ${stateA.body.myTeamIndex}.`);
      console.log(`✅ /api/state avec le jeton de Lyon M résout correctement SON équipe (teamIndex=${stateA.body.myTeamIndex}).`);

      // --- Une action (/api/lineup) avec le jeton de managerB s'applique à
      // SON équipe, jamais à celle de managerA ni à un CPU.
      const stateB = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": managerB.token });
      const somePlayerIdB = stateB.body.team.players[0].id;
      const tacticsB = await request(server, "POST", "/api/tactics", { defense: "Zone extérieure" }, { "X-TipIn-Token": managerB.token });
      if (tacticsB.statusCode !== 200 || !tacticsB.body.ok) throw new Error(`❌ POST /api/tactics avec un jeton valide devrait répondre 200/ok, obtenu ${tacticsB.statusCode}.`);
      if (tacticsB.body.state.team.defense !== "Zone extérieure") throw new Error("❌ L'action devrait s'appliquer à l'équipe DE CE manager (Marseille M).");
      const stateAAfter = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": managerA.token });
      if (stateAAfter.body.team.defense === "Zone extérieure") throw new Error("❌ L'action de Marseille M ne devrait JAMAIS avoir touché l'équipe de Lyon M.");
      console.log("✅ Une action (/api/tactics) avec le jeton de Marseille M s'applique STRICTEMENT à son équipe, jamais à celle de Lyon M.");

      // --- /api/plan (retour utilisateur, 2026-09 : "il faut pouvoir préparer
      // sa semaine en avance" + le bug corrigé, préparer une journée future ne
      // survivait pas côté serveur en ligue partagée) — la prochaine journée
      // non encore jouée (league.round) convient pour ce test HTTP, elle a
      // toujours un match programmé pour CE manager (round-robin à nombre pair
      // d'équipes, aucun bye).
      const planRound = stateB.body.league.round;
      const planB = await request(server, "POST", "/api/plan", { round: planRound, patch: { defense: "Zone press" } }, { "X-TipIn-Token": managerB.token });
      if (planB.statusCode !== 200 || !planB.body.ok) throw new Error(`❌ POST /api/plan avec un jeton valide et une journée future valide devrait répondre 200/ok, obtenu ${planB.statusCode} ${JSON.stringify(planB.body)}.`);
      console.log("✅ POST /api/plan enregistre un plan valide pour une journée future (route bien branchée dans ACTION_ROUTES).");

      const planBadRound = await request(server, "POST", "/api/plan", { round: -1, patch: { defense: "Zone press" } }, { "X-TipIn-Token": managerB.token });
      if (planBadRound.statusCode !== 400 || planBadRound.body.ok) throw new Error(`❌ POST /api/plan avec une journée invalide devrait répondre 400, obtenu ${planBadRound.statusCode}.`);
      console.log("✅ POST /api/plan rejette une journée invalide (400), avec la raison remontée par setPlan.");

      // --- /api/staff/fire-trainer (retour utilisateur, 2026-09 : "dès qu'un
      // staff est viré parce que devenu trop cher, il faut qu'il retourne sur
      // le marché avec un salaire baissé de 30%") — aucun entraîneur en poste
      // au départ (effectif fraîchement généré) : reste un no-op propre
      // (ok:true, relisted:false), pas une erreur.
      const fireNoTrainer = await request(server, "POST", "/api/staff/fire-trainer", {}, { "X-TipIn-Token": managerB.token });
      if (fireNoTrainer.statusCode !== 200 || !fireNoTrainer.body.ok || fireNoTrainer.body.relisted !== false) {
        throw new Error(`❌ POST /api/staff/fire-trainer sans entraîneur en poste devrait répondre 200/ok avec relisted:false, obtenu ${fireNoTrainer.statusCode} ${JSON.stringify(fireNoTrainer.body)}.`);
      }
      console.log("✅ POST /api/staff/fire-trainer répond 200/ok avec relisted:false quand aucun entraîneur n'est en poste (route bien branchée dans ACTION_ROUTES).");

      // --- /api/staff/fire-recruiter — TROISIÈME rôle de staff (académie de
      // jeunes), même route/même forme que /api/staff/fire-trainer ci-dessus.
      const fireNoRecruiter = await request(server, "POST", "/api/staff/fire-recruiter", {}, { "X-TipIn-Token": managerB.token });
      if (fireNoRecruiter.statusCode !== 200 || !fireNoRecruiter.body.ok || fireNoRecruiter.body.relisted !== false) {
        throw new Error(`❌ POST /api/staff/fire-recruiter sans recruteur en poste devrait répondre 200/ok avec relisted:false, obtenu ${fireNoRecruiter.statusCode} ${JSON.stringify(fireNoRecruiter.body)}.`);
      }
      console.log("✅ POST /api/staff/fire-recruiter répond 200/ok avec relisted:false quand aucun recruteur n'est en poste (route bien branchée dans ACTION_ROUTES).");

      // --- /api/training-center — Centre de formation (académie de jeunes),
      // même contrat que /api/arena (agrandissement d'un palier, aucun corps
      // de requête attendu).
      const trainingCenterRes = await request(server, "POST", "/api/training-center", {}, { "X-TipIn-Token": managerB.token });
      if (trainingCenterRes.statusCode !== 200 || !trainingCenterRes.body.ok || trainingCenterRes.body.trainingCenterLevel !== 2) {
        throw new Error(`❌ POST /api/training-center avec un budget suffisant devrait répondre 200/ok et faire passer trainingCenterLevel à 2, obtenu ${trainingCenterRes.statusCode} ${JSON.stringify(trainingCenterRes.body)}.`);
      }
      console.log("✅ POST /api/training-center agrandit bien le Centre de formation d'un palier (route bien branchée dans ACTION_ROUTES).");

      // --- /api/save-raw refusé pour un appelant porteur d'un jeton manager.
      const sharedSaveRaw = await request(server, "POST", "/api/save-raw", { team: {}, league: {} }, { "X-TipIn-Token": managerA.token });
      if (sharedSaveRaw.statusCode !== 410) throw new Error(`❌ POST /api/save-raw avec un jeton manager devrait être refusé (410), obtenu ${sharedSaveRaw.statusCode}.`);
      console.log("✅ POST /api/save-raw est bien supprimé pour une ligue partagée (410) — jamais de risque d'écraser l'état de tous les managers.");

      // --- /api/new-career refusé pour un appelant porteur d'un jeton manager.
      const sharedNewCareer = await request(server, "POST", "/api/new-career", undefined, { "X-TipIn-Token": managerA.token });
      if (sharedNewCareer.statusCode !== 403) throw new Error(`❌ POST /api/new-career avec un jeton manager devrait être refusé (403), obtenu ${sharedNewCareer.statusCode}.`);
      console.log("✅ POST /api/new-career est refusé pour un manager individuel d'une ligue partagée (403) — seul /api/admin/reset-multi-league le peut.");

      // --- GET /api/save (multi-manager) : myTeamIndex + liveMatch résolu
      // pour CE manager, jamais liveMatches (le pluriel) exposé.
      const saveA = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": managerA.token });
      if (saveA.statusCode !== 200) throw new Error(`❌ GET /api/save avec un jeton valide devrait répondre 200, obtenu ${saveA.statusCode}.`);
      if (saveA.body.myTeamIndex !== managerA.teamIndex) throw new Error("❌ GET /api/save devrait inclure le bon myTeamIndex.");
      if (saveA.body.league.liveMatches !== undefined) throw new Error("❌ GET /api/save ne devrait JAMAIS exposer league.liveMatches (le pluriel, toutes les diffusions) à un manager donné.");
      if (saveA.body.team) throw new Error("❌ GET /api/save en mode multi-manager ne devrait pas transporter un 'team' séparé (toutes les équipes vivent dans league.teams).");
      console.log("✅ GET /api/save (multi-manager) transporte myTeamIndex et un league.liveMatch résolu pour CE manager, sans jamais exposer les diffusions des autres.");

      // --- Persistance : le fichier solo n'a JAMAIS été touché par tout ce
      // qui précède (garde-fou le plus important de cette section).
      const legacyRaw = JSON.parse(fs.readFileSync(legacySavePath, "utf-8"));
      if (legacyRaw.team.name === "Lyon M" || legacyRaw.team.defense === "Zone extérieure") {
        throw new Error("❌ La sauvegarde solo (fichier distinct) n'aurait jamais dû être modifiée par les actions multi-manager.");
      }
      console.log("✅ Le fichier de sauvegarde solo reste totalement intact après toutes les actions multi-manager ci-dessus (fichiers bien distincts).");

      // --- Reset : régénère la ligue, préserve les jetons par nom de club.
      const reset = await request(server, "POST", "/api/admin/reset-multi-league", { teamNames: ["Lyon M", "Marseille M"] }, { "X-Admin-Token": "secret-admin-1" });
      if (reset.statusCode !== 200 || !reset.body.ok) throw new Error(`❌ Un reset valide devrait répondre 200/ok, obtenu ${reset.statusCode}.`);
      const managerAAfterReset = reset.body.managers.find(m => m.name === "Lyon M");
      if (!managerAAfterReset || managerAAfterReset.token !== managerA.token) {
        throw new Error("❌ /api/admin/reset-multi-league devrait préserver le jeton d'un manager déjà connu (identifié par nom de club).");
      }
      console.log("✅ /api/admin/reset-multi-league régénère la ligue en préservant le jeton privé de chaque manager déjà connu (identifié par nom de club).");

      // L'ancien jeton de managerA doit continuer de fonctionner après reset
      // (préservé) ; managerB (absent des noms fournis au reset) doit avoir
      // disparu de la nouvelle ligue.
      const stateAAfterReset = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": managerA.token });
      if (stateAAfterReset.statusCode !== 200) throw new Error("❌ Le jeton préservé de Lyon M devrait continuer de fonctionner après le reset.");
      console.log("✅ Le jeton privé préservé continue de fonctionner immédiatement après le reset.");

      // ---------------------------------------------------------------
      // CALENDRIER ANCRÉ QUOTIDIEN + COUPE (retour utilisateur, 2026-09 —
      // "la vraie saison de test") : une ligue multi-manager créée via
      // l'API admin est TOUJOURS au calendrier ancré quotidien, avec une
      // coupe fraîche — et /api/admin/reset-multi-league régénère bien les
      // DEUX (nouvelle ligue ET nouveau tirage au sort de coupe), jamais
      // seulement la ligue.
      // ---------------------------------------------------------------
      const saveAfterReset = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": managerA.token });
      if (!saveAfterReset.body.league.calendarDailyAnchored) {
        throw new Error("❌ Une ligue multi-manager créée via l'API admin devrait TOUJOURS être au calendrier ancré quotidien (sans bascule par variable d'environnement).");
      }
      if (!saveAfterReset.body.league.cup || saveAfterReset.body.league.cup.champion !== null || saveAfterReset.body.league.cup.rounds.length !== 1) {
        throw new Error("❌ Une ligue multi-manager fraîchement (re)créée devrait avoir une coupe fraîche (1 tour, pas encore de champion).");
      }
      console.log("✅ Une ligue multi-manager créée/réinitialisée via l'API admin est bien au calendrier ancré quotidien, avec une coupe fraîche (sans variable d'environnement).");

      // Fait avancer le temps de plusieurs jours pour que la coupe progresse
      // réellement (au moins un tour résolu) avant un nouveau reset — sans
      // ça, "la coupe est de nouveau fraîche après reset" serait un test
      // vide (elle l'était déjà avant). 9 jours de marge (pas 3) : le jour 0
      // est désormais ancré sur le prochain MERCREDI (retour utilisateur,
      // 2026-09, voir dailyAnchoredCalendarStartAt dans server/calendar.js),
      // donc jusqu'à 7 jours peuvent s'écouler avant même le tout premier
      // match, contre 1 jour au plus avec l'ancien ancrage "aujourd'hui ou
      // demain".
      now += 9 * DAY_MS + MATCH_BROADCAST_DURATION_MS;
      await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": managerA.token });
      const saveMidCup = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": managerA.token });
      if (saveMidCup.body.league.cup.rounds.length < 2 && saveMidCup.body.league.cup.champion === null) {
        throw new Error("❌ Prérequis du test : la coupe aurait dû progresser d'au moins un tour après plusieurs jours écoulés.");
      }
      console.log("✅ Prérequis vérifié : la coupe a bien progressé (au moins un tour résolu) avant le second reset.");

      const secondReset = await request(server, "POST", "/api/admin/reset-multi-league", { teamNames: ["Lyon M", "Marseille M"] }, { "X-Admin-Token": "secret-admin-1" });
      if (secondReset.statusCode !== 200 || !secondReset.body.ok) throw new Error(`❌ Le second reset devrait aussi répondre 200/ok, obtenu ${secondReset.statusCode}.`);
      const managerAAfterSecondReset = secondReset.body.managers.find(m => m.name === "Lyon M");
      const saveAfterSecondReset = await request(server, "GET", "/api/save", undefined, { "X-TipIn-Token": managerAAfterSecondReset.token });
      const leagueAfterSecondReset = saveAfterSecondReset.body.league;
      if (leagueAfterSecondReset.round !== 0) throw new Error(`❌ Après reset, le championnat devrait repartir de la journée 0, obtenu ${leagueAfterSecondReset.round}.`);
      if (!leagueAfterSecondReset.cup || leagueAfterSecondReset.cup.champion !== null || leagueAfterSecondReset.cup.rounds.length !== 1) {
        throw new Error(`❌ /api/admin/reset-multi-league devrait régénérer une coupe TOUTE FRAÎCHE (1 tour, pas de champion) — obtenu ${JSON.stringify(leagueAfterSecondReset.cup)}.`);
      }
      console.log("✅ /api/admin/reset-multi-league régénère bien à la fois une ligue neuve (journée 0) ET une coupe toute fraîche (nouveau tirage au sort de byes, plus aucune trace de la progression précédente).");
    } finally {
      if (prevAdminToken === undefined) delete process.env.BASKET_ADMIN_TOKEN;
      else process.env.BASKET_ADMIN_TOKEN = prevAdminToken;
      server.close();
    }
  }

  // -------------------------------------------------------------------
  // 7) MULTI-MANAGER — Phase B (2026-09) : "Antony veut pouvoir
  //    réinitialiser la ligue lui-même depuis l'app" — Team.isAdmin
  //    (assigné au bootstrap via 'adminTeamName', par défaut teamNames[0])
  //    et POST /api/reset-multi-league, authentifié par le jeton manager de
  //    L'APPELANT (X-TipIn-Token) plutôt que le secret admin brut, réservé
  //    au SEUL manager isAdmin.
  // -------------------------------------------------------------------
  {
    const prevAdminToken = process.env.BASKET_ADMIN_TOKEN;
    process.env.BASKET_ADMIN_TOKEN = "secret-admin-phaseb";
    try {
      // --- 7a) adminTeamName omis -> retombe sur teamNames[0].
      {
        const legacySavePath = tmpSavePath();
        const multiSavePath = tmpMultiSavePath();
        const server = await startTestServer(legacySavePath, nowFn, multiSavePath);
        try {
          const bootstrap = await request(server, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon B7", "Marseille B7"] }, { "X-Admin-Token": "secret-admin-phaseb" });
          if (bootstrap.statusCode !== 200 || !bootstrap.body.ok) throw new Error(`❌ Bootstrap (7a) devrait répondre 200/ok, obtenu ${bootstrap.statusCode} ${JSON.stringify(bootstrap.body)}.`);
          const lyon = bootstrap.body.managers.find(m => m.name === "Lyon B7");
          const marseille = bootstrap.body.managers.find(m => m.name === "Marseille B7");

          const lyonState = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": lyon.token });
          if (lyonState.body.team.isAdmin !== true) throw new Error("❌ Sans 'adminTeamName', le PREMIER nom de 'teamNames' (Lyon B7) devrait recevoir isAdmin:true.");
          const marseilleState = await request(server, "GET", "/api/state", undefined, { "X-TipIn-Token": marseille.token });
          if (marseilleState.body.team.isAdmin !== false) throw new Error("❌ Un manager qui n'est pas teamNames[0] ne devrait PAS être admin par défaut.");
          console.log("✅ /api/admin/new-multi-league sans 'adminTeamName' assigne isAdmin au tout premier nom de 'teamNames' (Lyon B7), et à lui seul.");
        } finally {
          server.close();
        }
      }

      // --- 7b) 'adminTeamName' explicite honoré (+ rejeté s'il ne
      //     correspond à aucun nom de 'teamNames').
      let server7b, multiSavePath7b, adminManager7b, nonAdminManager7b, thirdManager7b;
      {
        const legacySavePath = tmpSavePath();
        multiSavePath7b = tmpMultiSavePath();
        server7b = await startTestServer(legacySavePath, nowFn, multiSavePath7b);

        const invalidAdminName = await request(server7b, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon B7b", "Marseille B7b", "Nice B7b"], adminTeamName: "Pas Dans La Liste" }, { "X-Admin-Token": "secret-admin-phaseb" });
        if (invalidAdminName.statusCode !== 400) throw new Error(`❌ Un 'adminTeamName' absent de 'teamNames' devrait être rejeté (400), obtenu ${invalidAdminName.statusCode}.`);
        console.log("✅ /api/admin/new-multi-league rejette (400) un 'adminTeamName' qui ne correspond à aucun nom de 'teamNames'.");

        const bootstrap7b = await request(server7b, "POST", "/api/admin/new-multi-league", { teamNames: ["Lyon B7b", "Marseille B7b", "Nice B7b"], adminTeamName: "Marseille B7b" }, { "X-Admin-Token": "secret-admin-phaseb" });
        if (bootstrap7b.statusCode !== 200 || !bootstrap7b.body.ok) throw new Error(`❌ Bootstrap (7b) devrait répondre 200/ok, obtenu ${bootstrap7b.statusCode} ${JSON.stringify(bootstrap7b.body)}.`);
        adminManager7b = bootstrap7b.body.managers.find(m => m.name === "Marseille B7b");
        nonAdminManager7b = bootstrap7b.body.managers.find(m => m.name === "Lyon B7b");
        thirdManager7b = bootstrap7b.body.managers.find(m => m.name === "Nice B7b");

        const adminState7b = await request(server7b, "GET", "/api/state", undefined, { "X-TipIn-Token": adminManager7b.token });
        if (adminState7b.body.team.isAdmin !== true) throw new Error("❌ 'adminTeamName' explicite (Marseille B7b) devrait recevoir isAdmin:true.");
        const nonAdminState7b = await request(server7b, "GET", "/api/state", undefined, { "X-TipIn-Token": nonAdminManager7b.token });
        if (nonAdminState7b.body.team.isAdmin !== false) throw new Error("❌ teamNames[0] (Lyon B7b) ne devrait PAS être admin quand un autre 'adminTeamName' a été fourni explicitement.");
        console.log("✅ /api/admin/new-multi-league honore un 'adminTeamName' explicite (Marseille B7b), différent de teamNames[0].");
      }

      // --- 7c) POST /api/reset-multi-league (jeton manager, PAS le secret
      //     admin) : réservé au manager isAdmin, réinitialise réellement la
      //     ligue (mêmes vérifications que le reset admin historique :
      //     journée 0 + coupe fraîche), et l'admin le reste après reset.
      try {
        // Jeton manquant -> 401 (avant même de vérifier l'existence d'une
        // ligue ou les droits — un appelant anonyme n'a rien à savoir).
        const noToken = await request(server7b, "POST", "/api/reset-multi-league");
        if (noToken.statusCode !== 401) throw new Error(`❌ POST /api/reset-multi-league sans jeton devrait répondre 401, obtenu ${noToken.statusCode}.`);
        console.log("✅ POST /api/reset-multi-league sans jeton manager (X-TipIn-Token) répond 401.");

        // Jeton inconnu -> 401.
        const badToken = await request(server7b, "POST", "/api/reset-multi-league", undefined, { "X-TipIn-Token": "jeton-inconnu-xyz" });
        if (badToken.statusCode !== 401) throw new Error(`❌ POST /api/reset-multi-league avec un jeton inconnu devrait répondre 401, obtenu ${badToken.statusCode}.`);
        console.log("✅ POST /api/reset-multi-league avec un jeton manager inconnu répond 401.");

        // Jeton valide mais manager NON-admin -> 403.
        const nonAdminAttempt = await request(server7b, "POST", "/api/reset-multi-league", undefined, { "X-TipIn-Token": nonAdminManager7b.token });
        if (nonAdminAttempt.statusCode !== 403) throw new Error(`❌ POST /api/reset-multi-league avec le jeton d'un manager NON-admin devrait répondre 403, obtenu ${nonAdminAttempt.statusCode}.`);
        console.log("✅ POST /api/reset-multi-league avec le jeton d'un manager non-admin (Lyon B7b) répond 403 — la ligue n'est pas touchée.");

        // Fait avancer le temps pour que la coupe progresse réellement avant
        // le reset (même prérequis que le test admin historique, même marge
        // de 9 jours pour la même raison : jour 0 ancré sur le prochain
        // mercredi) : sinon "coupe fraîche après reset" serait un test vide.
        now += 9 * DAY_MS + MATCH_BROADCAST_DURATION_MS;
        await request(server7b, "GET", "/api/state", undefined, { "X-TipIn-Token": adminManager7b.token });
        const saveMidCup7b = await request(server7b, "GET", "/api/save", undefined, { "X-TipIn-Token": adminManager7b.token });
        if (saveMidCup7b.body.league.cup.rounds.length < 2 && saveMidCup7b.body.league.cup.champion === null) {
          throw new Error("❌ Prérequis du test 7c : la coupe aurait dû progresser d'au moins un tour avant le reset.");
        }

        // Jeton de l'ADMIN (Marseille B7b) -> 200/ok, reset effectif.
        const adminReset = await request(server7b, "POST", "/api/reset-multi-league", undefined, { "X-TipIn-Token": adminManager7b.token });
        if (adminReset.statusCode !== 200 || !adminReset.body.ok) throw new Error(`❌ POST /api/reset-multi-league avec le jeton de l'admin devrait répondre 200/ok, obtenu ${adminReset.statusCode} ${JSON.stringify(adminReset.body)}.`);
        console.log("✅ POST /api/reset-multi-league avec le jeton du manager admin (Marseille B7b) répond 200/ok.");

        const adminAfterReset = adminReset.body.managers.find(m => m.name === "Marseille B7b");
        if (!adminAfterReset || adminAfterReset.token !== adminManager7b.token) {
          throw new Error("❌ Le jeton privé de l'admin devrait être préservé par ce reset (identifié par nom de club), comme le reset admin historique.");
        }
        const saveAfterReset7c = await request(server7b, "GET", "/api/save", undefined, { "X-TipIn-Token": adminManager7b.token });
        if (saveAfterReset7c.body.league.round !== 0) throw new Error(`❌ Après POST /api/reset-multi-league, le championnat devrait repartir de la journée 0, obtenu ${saveAfterReset7c.body.league.round}.`);
        if (!saveAfterReset7c.body.league.cup || saveAfterReset7c.body.league.cup.champion !== null || saveAfterReset7c.body.league.cup.rounds.length !== 1) {
          throw new Error(`❌ POST /api/reset-multi-league devrait régénérer une coupe TOUTE FRAÎCHE (1 tour, pas de champion) — obtenu ${JSON.stringify(saveAfterReset7c.body.league.cup)}.`);
        }
        console.log("✅ POST /api/reset-multi-league régénère réellement la ligue (journée 0, coupe fraîche) — mêmes garanties que le reset admin historique.");

        // L'admin (identifié par nom de club, Marseille B7b) le RESTE après
        // ce reset — voir performMultiLeagueReset côté server/index.js.
        const adminStateAfterReset = await request(server7b, "GET", "/api/state", undefined, { "X-TipIn-Token": adminAfterReset.token });
        if (adminStateAfterReset.body.team.isAdmin !== true) throw new Error("❌ Le manager qui portait isAdmin (Marseille B7b) devrait le rester après un reset déclenché via /api/reset-multi-league.");
        console.log("✅ Team.isAdmin survit au reset : Marseille B7b reste administrateur de la ligue régénérée.");

        // Un manager anonyme sans ligue existante -> 404 (jeton syntaxiquement
        // présent mais aucune ligue multi-manager créée sur CE serveur).
        const freshServer = await startTestServer(tmpSavePath(), nowFn, tmpMultiSavePath());
        try {
          const noLeague = await request(freshServer, "POST", "/api/reset-multi-league", undefined, { "X-TipIn-Token": "peu-importe" });
          if (noLeague.statusCode !== 404) throw new Error(`❌ POST /api/reset-multi-league sans ligue multi-manager existante devrait répondre 404, obtenu ${noLeague.statusCode}.`);
          console.log("✅ POST /api/reset-multi-league répond 404 quand aucune ligue multi-manager n'existe encore.");
        } finally {
          freshServer.close();
        }

        // --- Reset ADMIN historique (secret brut, sans 'adminTeamName') :
        //     doit AUSSI préserver l'admin actuel (Marseille B7b) — retour
        //     utilisateur : "l'admin le reste après un reset, quelle que
        //     soit la route qui l'a déclenché".
        const adminSecretReset = await request(server7b, "POST", "/api/admin/reset-multi-league", { teamNames: ["Lyon B7b", "Marseille B7b", "Nice B7b"] }, { "X-Admin-Token": "secret-admin-phaseb" });
        if (adminSecretReset.statusCode !== 200 || !adminSecretReset.body.ok) throw new Error(`❌ /api/admin/reset-multi-league (sans adminTeamName) devrait répondre 200/ok, obtenu ${adminSecretReset.statusCode}.`);
        const marseilleAfterSecretReset = adminSecretReset.body.managers.find(m => m.name === "Marseille B7b");
        const marseilleStateAfterSecretReset = await request(server7b, "GET", "/api/state", undefined, { "X-TipIn-Token": marseilleAfterSecretReset.token });
        if (marseilleStateAfterSecretReset.body.team.isAdmin !== true) throw new Error("❌ /api/admin/reset-multi-league (sans adminTeamName) devrait reconduire l'admin actuel (Marseille B7b) plutôt que de retomber sur teamNames[0].");
        const lyonStateAfterSecretReset = await request(server7b, "GET", "/api/state", undefined, { "X-TipIn-Token": adminSecretReset.body.managers.find(m => m.name === "Lyon B7b").token });
        if (lyonStateAfterSecretReset.body.team.isAdmin !== false) throw new Error("❌ Après ce reset, Lyon B7b (teamNames[0]) ne devrait PAS être devenu admin à la place de Marseille B7b.");
        console.log("✅ /api/admin/reset-multi-league (secret brut, sans 'adminTeamName') reconduit l'admin ACTUEL (Marseille B7b) plutôt que de retomber sur teamNames[0].");
      } finally {
        server7b.close();
      }
    } finally {
      if (prevAdminToken === undefined) delete process.env.BASKET_ADMIN_TOKEN;
      else process.env.BASKET_ADMIN_TOKEN = prevAdminToken;
    }
  }

  console.log("\n✅ Serveur HTTP (server/index.js) vérifié de bout en bout : /api/health, /api/state (rattrapage automatique inclus), /api/simulate-tick, 404 propre, et le routage multi-manager par jeton (admin bootstrap/reset, isolation stricte entre managers et avec la carrière solo, droit d'administration Team.isAdmin + POST /api/reset-multi-league en un clic).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
