/* Service worker de Hoop Manager (application mobile / PWA, 2026-09-25).
   Servi à la racine (/sw.js, voir server/index.js) pour contrôler toute
   l'appli. Stratégie volontairement prudente, le jeu étant entièrement
   piloté par le serveur (calendrier réel, direct) :
   - /api/* : JAMAIS mis en cache (toujours le réseau) ;
   - la page "/" : réseau d'abord, copie de secours en cache si hors ligne ;
   - /assets/*.js et .css : réseau d'abord, cache seulement hors ligne
     (2026-09-26 : en « cache d'abord », une mise à jour de la page live
     restait invisible au premier chargement après un déploiement) ;
   - autres /assets/* (images, polices) : cache d'abord, rafraîchis en fond.
   Changer CACHE_VERSION invalide les anciens caches au prochain passage. */
const CACHE_VERSION = "hoop-v2";
const PRECACHE = [
  "/assets/mobile/mobile.css",
  "/assets/mobile/mobile.js",
  "/assets/mobile/icon-192.png",
];

const OFFLINE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Hoop Manager · hors ligne</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d131d;color:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:20px;margin:16px 0 8px}p{color:#9aa8bd;font-size:15px;margin:0 0 20px}button{background:#f0a23c;color:#3a2506;border:0;border-radius:999px;padding:12px 22px;font-weight:800;font-size:15px}</style></head>
<body><div><img src="/assets/mobile/icon-192.png" width="96" height="96" alt="" style="border-radius:22px"><h1>Pas de connexion</h1><p>Hoop Manager a besoin d'internet pour suivre ton club en temps réel.</p><button onclick="location.reload()">Réessayer</button></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // toujours le réseau

  if (req.mode === "navigate" || url.pathname === "/") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put("/", copy)); }
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") && /\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); } return res; })
        .catch(() => caches.match(req).then((hit) => hit || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
  }
});
