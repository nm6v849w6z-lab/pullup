// Vérifie le backend Redis (Upstash) optionnel de server/store.js — voir le
// grand commentaire "BACKEND REDIS" en tête de ce fichier. Aucun appel
// réseau réel : `store._setFetchImplForTests` intercepte tout ce que
// store.js appellerait normalement via le `fetch` global de Node, avec un
// faux client Redis en mémoire (Map) qui imite fidèlement l'API REST
// d'Upstash (GET .../get/<clé> -> {"result": ...}, POST .../set/<clé> avec
// la valeur brute en corps de requête).
//
// Couvre, dans l'ordre :
//  1) Round-trip save/load par-dessus le faux Redis quand les DEUX
//     variables d'environnement sont définies (bonne URL/méthode/en-têtes,
//     bonne clé fixe "pullup:league"/"pullup:multi-league" — PAS dérivée de
//     savePath).
//  2) Sans ces variables (le cas par défaut) : comportement fichier local
//     STRICTEMENT inchangé, même avec le faux fetch en place (jamais
//     appelé) — preuve que la bascule est bien gatée par les variables
//     d'environnement, pas par autre chose.
//  3) Une lecture Redis en échec renvoie `null` proprement (avertissement,
//     jamais un plantage).
//  4) Une écriture Redis en échec avertit sans planter (le process continue,
//     aucune exception ne remonte à l'appelant).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("./store.js");

function tmpSavePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-upstash-test-")), "league.json");
}

const T0 = Date.UTC(2026, 8, 7);

// Faux "Redis" en mémoire + faux `fetch` qui imite l'API REST d'Upstash —
// suffisant pour exercer exactement ce que redisGet/redisSet (store.js)
// appellent, sans dépendre de la forme exacte du client `fetch` du Node
// installé (juste { ok, status, json() }, comme une vraie Response).
function makeFakeUpstash() {
  const kv = new Map();
  const calls = [];
  async function fetchImpl(url, opts = {}) {
    calls.push({ url, opts });
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean); // ["get"|"set", "<clé>"]
    const op = parts[0];
    const key = decodeURIComponent(parts[1]);
    if (op === "get") {
      const result = kv.has(key) ? kv.get(key) : null;
      return { ok: true, status: 200, json: async () => ({ result }) };
    }
    if (op === "set") {
      kv.set(key, opts.body);
      return { ok: true, status: 200, json: async () => ({ result: "OK" }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: "unknown op" }) };
  }
  return { kv, calls, fetchImpl };
}

function withEnv(vars, fn) {
  const previous = {};
  for (const k of Object.keys(vars)) previous[k] = process.env[k];
  Object.assign(process.env, vars);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of Object.keys(vars)) {
        if (previous[k] === undefined) delete process.env[k];
        else process.env[k] = previous[k];
      }
    });
}

(async () => {

// ---------------------------------------------------------------------
// 0) Prérequis : au tout début de ce test, les variables Upstash ne
//    devraient pas déjà traîner dans l'environnement (sinon les scénarios
//    "sans variables" ci-dessous ne testeraient rien du tout).
// ---------------------------------------------------------------------
{
  if (store.upstashConfigured()) {
    throw new Error("❌ Prérequis de ce test : UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN ne devraient pas être définies avant qu'on les pose nous-mêmes.");
  }
  console.log("✅ Prérequis : backend Redis inactif par défaut (aucune variable d'environnement Upstash définie).");
}

// ---------------------------------------------------------------------
// 1) Variables définies : save()/load() (carrière solo) passent bien par le
//    faux Redis — bonne URL/méthode/en-tête d'autorisation, bonne clé fixe
//    ("pullup:league", jamais dérivée de savePath), round-trip fidèle.
// ---------------------------------------------------------------------
await withEnv({ UPSTASH_REDIS_REST_URL: "https://fake-upstash.example", UPSTASH_REDIS_REST_TOKEN: "secret-token-123" }, async () => {
  const fake = makeFakeUpstash();
  store._setFetchImplForTests(fake.fetchImpl);
  try {
    if (!store.upstashConfigured()) throw new Error("❌ upstashConfigured() devrait être vrai une fois les deux variables définies.");

    const { team, league } = store.createNewCareer(T0);
    team.budget = 13579;
    // savePath toujours accepté (compatibilité), mais doit être IGNORÉ tant
    // que Redis est actif : passer un chemin qui n'existe pas/n'est jamais
    // écrit prouve qu'on ne retombe pas silencieusement sur le fichier.
    const ignoredSavePath = tmpSavePath();
    await store.save(team, league, ignoredSavePath);

    if (fs.existsSync(ignoredSavePath)) throw new Error("❌ save() ne devrait écrire AUCUN fichier local quand le backend Redis est actif.");
    if (!fake.kv.has(store.REDIS_KEYS.league)) throw new Error(`❌ save() aurait dû écrire sous la clé fixe '${store.REDIS_KEYS.league}'.`);

    const setCall = fake.calls.find(c => c.url.includes("/set/"));
    if (!setCall) throw new Error("❌ save() aurait dû appeler l'endpoint Upstash /set/.");
    if (setCall.opts.method !== "POST") throw new Error(`❌ L'écriture Upstash devrait être un POST, obtenu ${setCall.opts.method}.`);
    if (setCall.opts.headers.Authorization !== "Bearer secret-token-123") throw new Error(`❌ L'écriture Upstash devrait porter 'Authorization: Bearer <token>', obtenu '${setCall.opts.headers.Authorization}'.`);
    if (!setCall.url.startsWith("https://fake-upstash.example/set/")) throw new Error(`❌ L'URL d'écriture devrait être construite à partir de UPSTASH_REDIS_REST_URL, obtenu '${setCall.url}'.`);
    if (!setCall.url.includes(encodeURIComponent(store.REDIS_KEYS.league))) throw new Error("❌ L'URL d'écriture devrait porter la clé fixe 'pullup:league', jamais dérivée de savePath.");

    const loaded = await store.load(ignoredSavePath);
    if (!loaded) throw new Error("❌ load() devrait relire la sauvegarde qu'on vient d'écrire sur le faux Redis.");
    if (loaded.team.budget !== 13579) throw new Error(`❌ Le budget devrait survivre au round-trip Redis, obtenu ${loaded.team.budget}.`);

    const getCall = fake.calls.find(c => c.url.includes("/get/"));
    if (!getCall) throw new Error("❌ load() aurait dû appeler l'endpoint Upstash /get/.");
    if (getCall.opts.headers.Authorization !== "Bearer secret-token-123") throw new Error("❌ La lecture Upstash devrait aussi porter 'Authorization: Bearer <token>'.");

    console.log("✅ save()/load() (solo) : round-trip fidèle par-dessus le faux Redis, bonne URL/méthode/en-tête, clé fixe 'pullup:league' jamais dérivée de savePath.");
  } finally {
    store._setFetchImplForTests(null);
  }
});

// ---------------------------------------------------------------------
// 2) Variables définies : saveMultiLeague()/loadMultiLeague() passent bien
//    par la clé fixe DISTINCTE 'pullup:multi-league'.
// ---------------------------------------------------------------------
await withEnv({ UPSTASH_REDIS_REST_URL: "https://fake-upstash.example", UPSTASH_REDIS_REST_TOKEN: "secret-token-123" }, async () => {
  const fake = makeFakeUpstash();
  store._setFetchImplForTests(fake.fetchImpl);
  try {
    const { league } = store.createMultiManagerCareer(["Lyon Redis", "Marseille Redis"], T0);
    await store.saveMultiLeague(league, tmpSavePath());
    if (!fake.kv.has(store.REDIS_KEYS.multiLeague)) throw new Error(`❌ saveMultiLeague() aurait dû écrire sous la clé fixe '${store.REDIS_KEYS.multiLeague}'.`);
    if (fake.kv.has(store.REDIS_KEYS.league)) throw new Error("❌ saveMultiLeague() ne devrait JAMAIS toucher à la clé solo 'pullup:league'.");

    const reloaded = await store.loadMultiLeague(tmpSavePath());
    if (!reloaded) throw new Error("❌ loadMultiLeague() devrait relire la ligue qu'on vient d'écrire sur le faux Redis.");
    if (reloaded.league.teams.filter(t => t.isHuman).length !== 2) throw new Error("❌ Les 2 managers humains devraient survivre au round-trip Redis.");
    console.log("✅ saveMultiLeague()/loadMultiLeague() : round-trip fidèle sur sa propre clé fixe 'pullup:multi-league', distincte de la clé solo.");
  } finally {
    store._setFetchImplForTests(null);
  }
});

// ---------------------------------------------------------------------
// 3) SANS variables d'environnement (le cas par défaut) : comportement
//    fichier local strictement inchangé, même avec un faux fetch en place
//    qui ferait planter le test s'il était appelé par erreur (URL
//    volontairement invalide) — preuve que la bascule est bien gatée par
//    les deux variables d'environnement, jamais empruntée par erreur.
// ---------------------------------------------------------------------
{
  if (store.upstashConfigured()) throw new Error("❌ Prérequis : les variables Upstash ne devraient plus être définies à ce stade (restaurées par withEnv ci-dessus).");
  let fetchCalled = false;
  store._setFetchImplForTests(async () => { fetchCalled = true; throw new Error("ne devrait jamais être appelé sans variables Upstash définies"); });
  try {
    const savePath = tmpSavePath();
    const { team, league } = store.createNewCareer(T0);
    team.budget = 24680;
    await store.save(team, league, savePath);
    if (fetchCalled) throw new Error("❌ save() n'aurait jamais dû appeler fetch sans les variables d'environnement Upstash.");
    if (!fs.existsSync(savePath)) throw new Error("❌ save() aurait dû écrire le fichier local, exactement comme avant ce chantier.");

    const loaded = await store.load(savePath);
    if (!loaded || loaded.team.budget !== 24680) throw new Error("❌ load() aurait dû relire le fichier local, exactement comme avant ce chantier.");
    if (fetchCalled) throw new Error("❌ load() n'aurait jamais dû appeler fetch sans les variables d'environnement Upstash.");
    console.log("✅ Sans variables d'environnement Upstash : comportement fichier local strictement inchangé (fetch jamais appelé).");
  } finally {
    store._setFetchImplForTests(null);
  }
}

// ---------------------------------------------------------------------
// 4) Lecture Redis en échec (erreur réseau/HTTP) : load()/loadMultiLeague()
//    renvoient `null` proprement (comme une sauvegarde absente/illisible),
//    ne plantent jamais.
// ---------------------------------------------------------------------
await withEnv({ UPSTASH_REDIS_REST_URL: "https://fake-upstash.example", UPSTASH_REDIS_REST_TOKEN: "secret-token-123" }, async () => {
  const originalWarn = console.warn;
  let warned = false;
  console.warn = (...args) => { warned = true; };
  store._setFetchImplForTests(async () => { throw new Error("panne réseau simulée"); });
  try {
    const loaded = await store.load(tmpSavePath());
    if (loaded !== null) throw new Error("❌ load() devrait renvoyer null quand la lecture Redis échoue, jamais planter.");
    if (!warned) throw new Error("❌ load() devrait journaliser un avertissement (console.warn) quand la lecture Redis échoue.");

    warned = false;
    const loadedMulti = await store.loadMultiLeague(tmpSavePath());
    if (loadedMulti !== null) throw new Error("❌ loadMultiLeague() devrait renvoyer null quand la lecture Redis échoue, jamais planter.");
    if (!warned) throw new Error("❌ loadMultiLeague() devrait journaliser un avertissement (console.warn) quand la lecture Redis échoue.");
    console.log("✅ Une lecture Redis en échec renvoie null proprement (avertissement journalisé, jamais de plantage) pour load() et loadMultiLeague().");
  } finally {
    console.warn = originalWarn;
    store._setFetchImplForTests(null);
  }
});

// ---------------------------------------------------------------------
// 5) Écriture Redis en échec : save()/saveMultiLeague() avertissent sans
//    jamais faire planter l'appelant — un échec d'écriture PASSAGER ne doit
//    jamais faire tomber tout le serveur pour une seule requête.
// ---------------------------------------------------------------------
await withEnv({ UPSTASH_REDIS_REST_URL: "https://fake-upstash.example", UPSTASH_REDIS_REST_TOKEN: "secret-token-123" }, async () => {
  const originalWarn = console.warn;
  let warned = false;
  console.warn = (...args) => { warned = true; };
  store._setFetchImplForTests(async () => ({ ok: false, status: 500, json: async () => ({ error: "boom" }) }));
  try {
    const { team, league } = store.createNewCareer(T0);
    await store.save(team, league, tmpSavePath()); // ne doit pas lancer
    if (!warned) throw new Error("❌ save() devrait journaliser un avertissement (console.warn) quand l'écriture Redis échoue.");

    warned = false;
    const { league: multiLeague } = store.createMultiManagerCareer(["Lyon Panne"], T0);
    await store.saveMultiLeague(multiLeague, tmpSavePath()); // ne doit pas lancer
    if (!warned) throw new Error("❌ saveMultiLeague() devrait journaliser un avertissement (console.warn) quand l'écriture Redis échoue.");
    console.log("✅ Une écriture Redis en échec avertit (console.warn) sans jamais planter, pour save() et saveMultiLeague().");
  } finally {
    console.warn = originalWarn;
    store._setFetchImplForTests(null);
  }
});

console.log("\n✅ Backend Redis (Upstash) de server/store.js vérifié : round-trip save/load fidèle (bonne URL/méthode/en-têtes/clés fixes) quand activé par variables d'environnement, comportement fichier local strictement inchangé sinon, et dégradation propre (avertissement, jamais de plantage) sur un échec réseau en lecture comme en écriture.");

})().catch(e => { console.error(e); process.exit(1); });
