// Pages publiques du site (server/site.js) — refus AdSense du 2026-09-28
// (« pages sans contenu d'éditeur ») : chaque page du sitemap répond 200
// avec un vrai contenu, aucun lien interne cassé, guide repris du jeu,
// robots.txt/sitemap.xml, et les pages publiques restent accessibles en
// site public (BASKET_PUBLIC_SITE=1) sans compte.
const http = require("http");
const Site = require("./server/site.js");
const { startTestServer } = require("./test_helpers.js");
function assertTrue(c, l) { if (!c) throw new Error(`❌ ${l}`); }

(async () => {
  const prevPublic = process.env.BASKET_PUBLIC_SITE;
  process.env.BASKET_PUBLIC_SITE = "1";
  const { server, baseUrl } = await startTestServer();
  try {
    const guide = Site.guideEntries();
    assertTrue(guide.length >= 15, `guide : au moins 15 entrées (${guide.length})`);
    assertTrue(!guide.some(e => e.id === "outils"), "guide : outils de test exclus");
    assertTrue(guide.every(e => !/<button|style=|class=/.test(e.html)), "guide : HTML nettoyé");

    const paths = Site.allPaths();
    const links = new Set();
    let totalWords = 0;
    for (const p of paths) {
      const res = await fetch(new URL(p, baseUrl), { redirect: "manual" });
      assertTrue(res.status === 200, `${p} : 200 (reçu ${res.status})`);
      const html = await res.text();
      if (p === "/bienvenue") continue;
      assertTrue(/<title>[^<]+· Hoop Manager<\/title>/.test(html) && /<meta name="description" content="[^"]{40,}">/.test(html), `${p} : titre + description`);
      assertTrue(html.includes('href="/confidentialite"') && html.includes('href="/mentions-legales"'), `${p} : liens légaux dans le pied de page`);
      const main = html.slice(html.indexOf("<main>"), html.indexOf("</main>")).replace(/<[^>]+>/g, " ");
      const words = main.split(/\s+/).filter(Boolean).length;
      totalWords += words;
      assertTrue(words >= 50, `${p} : au moins 50 mots (${words})`);
      for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) links.add(m[1]);
    }
    for (const l of links) {
      if (l.startsWith("/assets/")) continue;
      const res = await fetch(new URL(l, baseUrl), { redirect: "manual" });
      assertTrue(res.status === 200, `lien interne ${l} : 200 (reçu ${res.status})`);
    }
    assertTrue(totalWords > 6000, `contenu total conséquent (${totalWords} mots)`);

    const robots = await (await fetch(new URL("/robots.txt", baseUrl))).text();
    assertTrue(/Disallow: \/api\//.test(robots) && /Sitemap: https:\/\/hoop-manager\.com\/sitemap\.xml/.test(robots), "robots.txt");
    const sitemap = await (await fetch(new URL("/sitemap.xml", baseUrl))).text();
    assertTrue(paths.every(p => sitemap.includes(`<loc>https://hoop-manager.com${p}</loc>`)), "sitemap.xml complet");
    assertTrue((await fetch(new URL("/guide/nexiste-pas", baseUrl))).status !== 200, "entrée de guide inconnue : pas une page");

    const home = await (await fetch(new URL("/bienvenue", baseUrl))).text();
    assertTrue(home.includes('href="/le-jeu"') && home.includes('href="/guide"') && home.includes('href="/faq"'), "accueil : liens vers les pages de contenu");
    assertTrue(!/Aucune publicité/.test(home), "accueil : plus de « Aucune publicité »");
    console.log(`✅ site_pages_test.js : ${paths.length} pages, ${links.size} liens internes, ${totalWords} mots`);
  } finally {
    server.close();
    if (prevPublic === undefined) delete process.env.BASKET_PUBLIC_SITE; else process.env.BASKET_PUBLIC_SITE = prevPublic;
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
