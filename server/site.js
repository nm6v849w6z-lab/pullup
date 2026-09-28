// =====================================================================
// PAGES PUBLIQUES DU SITE (2026-09-28) — AdSense a refusé hoop-manager.com :
// « Annonces Google diffusées sur des pages ou écrans sans contenu
// d'éditeur ». Un visiteur sans compte ne voyait que l'écran d'inscription
// (/bienvenue) et la coquille du jeu. Ces pages donnent au site un vrai
// contenu lisible sans compte : présentation, guide (repris tel quel du
// Guide du jeu, voir moteurbasket3.html #guideSection — une seule source,
// jamais recopié à la main), FAQ, à propos, contact, confidentialité,
// mentions légales, plus robots.txt et sitemap.xml.
//
// Le script AdSense (server/ads.js) n'est posé QUE sur ces pages de contenu
// (et chargé dans le jeu une fois le manager connecté), plus jamais sur
// l'écran d'inscription ni sur la coquille du jeu.
// =====================================================================
const fs = require("fs");
const path = require("path");
const Ads = require("./ads.js");

const SITE_URL = "https://hoop-manager.com";
const CONTACT_EMAIL = "contact@hoop-manager.com";
const PUBLISHER_NAME = "Antony Szatmari";
const GAME_HTML_PATH = path.join(__dirname, "..", "moteurbasket3.html");

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------------------------------------------------------------------
// Guide : lu dans moteurbasket3.html (cache invalidé si le fichier change).
// Entrées remplies dynamiquement par le jeu (div vide) ou réservées aux
// tests (« outils ») écartées. HTML réduit à une liste blanche de balises ;
// les liens internes du guide (button.gd-link data-guide-goto) deviennent
// de vrais liens /guide/<id>.
// ---------------------------------------------------------------------
const GUIDE_SKIP = new Set(["outils"]);
let guideCache = { mtimeMs: -1, entries: [] };

function cleanGuideHtml(body) {
  let h = body.replace(/<h3[^>]*>[\s\S]*?<\/h3>/, "");
  h = h.replace(/<button[^>]*data-guide-goto="([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/button>/g, (m, id, txt) => `<a href="/guide/${id}">${txt}</a>`);
  h = h.replace(/<button[\s\S]*?<\/button>/g, "");
  h = h.replace(/<div[^>]*><\/div>/g, "");
  h = h.replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (m, slash, tag, attrs) => {
    tag = tag.toLowerCase();
    if (tag === "a") return m;
    if (["p", "b", "strong", "i", "em", "ul", "ol", "li", "br", "h4", "table", "thead", "tbody", "tr", "td", "th"].includes(tag)) return `<${slash}${tag}>`;
    return "";
  });
  return h.replace(/\n\s+/g, "\n").trim();
}

function guideEntries() {
  let st;
  try { st = fs.statSync(GAME_HTML_PATH); } catch (e) { return []; }
  if (st.mtimeMs === guideCache.mtimeMs) return guideCache.entries;
  const src = fs.readFileSync(GAME_HTML_PATH, "utf-8");
  const re = /<div class="guide-entry" data-guide-id="([^"]+)" data-guide-group="([^"]+)"[^>]*>([\s\S]*?)\n\s{6}<\/div>/g;
  const entries = [];
  let m;
  while ((m = re.exec(src))) {
    const [, id, group, body] = m;
    if (GUIDE_SKIP.has(id)) continue;
    const titleMatch = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    const html = cleanGuideHtml(body);
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.split(" ").length < 30) continue;
    entries.push({ id, group: group.replace(/&amp;/g, "&"), title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim() : id, html, text });
  }
  guideCache = { mtimeMs: st.mtimeMs, entries };
  return entries;
}

// ---------------------------------------------------------------------
// Mise en page commune (mêmes couleurs et polices que /bienvenue).
// ---------------------------------------------------------------------
const NAV = [
  ["/le-jeu", "Le jeu"], ["/guide", "Guide"], ["/faq", "FAQ"], ["/a-propos", "À propos"],
];

function layout({ pathName, title, description, body }) {
  const nav = NAV.map(([href, label]) =>
    `<a href="${href}"${pathName === href || (href !== "/" && pathName.startsWith(href + "/")) ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · Hoop Manager</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE_URL}${pathName}">
<meta name="theme-color" content="#0d131d">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/mobile/favicon-32.png?v=2">
<link rel="apple-touch-icon" href="/assets/mobile/apple-touch-icon.png?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0d131d;--panel:#141c29;--line:#26334a;--line-soft:#1e2939;--ink:#eef2f7;--ink-dim:#9aa8bd;--ink-faint:#6b7a92;--amber:#f0a23c;--amber-hi:#ffb85a;--amber-ink:#2a1a04}
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:var(--bg);color:var(--ink);font-family:"DM Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden}
  a{color:var(--amber)}
  a:hover{color:var(--amber-hi)}
  .wrap{max-width:1120px;margin:0 auto;padding:0 16px}
  h1,h2,h3{font-family:"Barlow Condensed","DM Sans",sans-serif;letter-spacing:.2px;line-height:1.15}
  header{position:sticky;top:0;z-index:10;background:rgba(13,19,29,.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--line-soft)}
  header .wrap{display:flex;align-items:center;gap:18px;min-height:64px;flex-wrap:wrap}
  .brand{margin-right:auto;display:flex;align-items:center}
  .brand img{height:36px;width:auto;display:block}
  nav.top{display:flex;gap:16px;flex-wrap:wrap}
  nav.top a{color:var(--ink-dim);text-decoration:none;font-weight:500;font-size:15px}
  nav.top a[aria-current="page"],nav.top a:hover{color:var(--ink)}
  .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:10px;font:700 15px/1 "DM Sans",sans-serif;padding:12px 16px;text-decoration:none;background:var(--amber);color:var(--amber-ink)}
  .btn:hover{background:var(--amber-hi);color:var(--amber-ink)}
  .btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
  .btn-ghost:hover{background:transparent;color:var(--ink);border-color:var(--ink-faint)}
  main{padding:40px 0 56px}
  .page{max-width:760px}
  .page h1{font-size:44px;margin:0 0 12px}
  .page h2{font-size:28px;margin:40px 0 10px}
  .page h3{font-size:21px;margin:28px 0 6px}
  .lead{font-size:18px;color:var(--ink-dim);margin:0 0 28px}
  .crumbs{font-size:14px;color:var(--ink-faint);margin:0 0 14px}
  .crumbs a{color:var(--ink-dim)}
  table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14px;display:block;overflow-x:auto}
  th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
  th{background:var(--panel)}
  .guide-toc{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;margin:24px 0}
  .guide-toc section{background:var(--panel);border:1px solid var(--line-soft);border-radius:14px;padding:16px 18px}
  .guide-toc h2{font-size:20px;margin:0 0 8px}
  .guide-toc ul{margin:0;padding-left:18px}
  .guide-toc li{margin:4px 0}
  .pager{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:40px;padding-top:20px;border-top:1px solid var(--line-soft)}
  .cta{margin:40px 0 0;padding:22px;background:var(--panel);border:1px solid var(--line-soft);border-radius:14px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .cta p{margin:0;font-weight:500}
  details{border-bottom:1px solid var(--line-soft);padding:14px 0}
  summary{cursor:pointer;font-weight:700;font-size:17px}
  details p{margin:10px 0 0;color:var(--ink-dim)}
  footer{border-top:1px solid var(--line-soft);padding:26px 0 40px;color:var(--ink-faint);font-size:14px}
  footer .wrap{display:flex;gap:10px 22px;flex-wrap:wrap;justify-content:space-between}
  footer nav{display:flex;gap:10px 18px;flex-wrap:wrap}
  footer a{color:var(--ink-dim);text-decoration:none}
  footer a:hover{color:var(--ink)}
  @media (max-width:640px){.page h1{font-size:34px}nav.top{order:3;width:100%;padding-bottom:10px;gap:14px}header .btn{padding:10px 12px;font-size:14px}}
</style>
</head>
<body>
<header><div class="wrap">
  <a class="brand" href="/bienvenue" aria-label="Hoop Manager, accueil"><img src="/assets/brand/logo-hoop-manager.png" alt="Hoop Manager"></a>
  <nav class="top" aria-label="Navigation principale">${nav}</nav>
  <a class="btn" href="/bienvenue">Jouer gratuitement</a>
</div></header>
<main><div class="wrap">${body}</div></main>
<footer><div class="wrap">
  <span>© ${new Date().getFullYear()} Hoop Manager</span>
  <nav aria-label="Pages du site">
    <a href="/le-jeu">Le jeu</a><a href="/guide">Guide</a><a href="/faq">FAQ</a><a href="/a-propos">À propos</a>
    <a href="/contact">Contact</a><a href="/confidentialite">Confidentialité</a><a href="/mentions-legales">Mentions légales</a>
  </nav>
</div></footer>
</body>
</html>`;
  // Script AdSense seul (sans API de jeu) : pages de contenu uniquement.
  return Ads.injectHead(html, Ads.adsConfig(), { withApi: false });
}

function cta(text = "Envie de diriger ton propre club ? L'inscription prend une minute.") {
  return `<div class="cta"><p>${text}</p><a class="btn" href="/bienvenue">Créer mon club</a></div>`;
}

// ---------------------------------------------------------------------
// Contenus
// ---------------------------------------------------------------------
function pageLeJeu() {
  return {
    title: "Le jeu : manager de basket en ligne",
    description: "Hoop Manager est un jeu de gestion de club de basket gratuit, dans le navigateur : matchs diffusés en direct, ligue de managers, entraînement, tactique, transferts aux enchères.",
    body: `<article class="page">
<h1>Un club de basket à diriger, en temps réel</h1>
<p class="lead">Hoop Manager est un jeu de gestion de basket gratuit qui se joue dans le navigateur, sur ordinateur comme sur téléphone. Tu n'incarnes pas les joueurs : tu es le manager. Tu composes l'effectif, tu prépares les matchs, tu gères l'argent du club… puis tu regardes ton équipe jouer, en direct, contre celles des autres managers.</p>

<h2>Un calendrier réel, des matchs à heure fixe</h2>
<p>Le jeu ne s'arrête jamais : les matchs se jouent à l'heure prévue, que tu sois connecté ou non. Une saison dure onze semaines. Le championnat occupe les neuf premières, avec deux journées par semaine, le mardi et le samedi à 20 h. Les quatre premiers se retrouvent ensuite en play-offs pendant deux semaines (demi-finales puis finale, en deux matchs gagnants), le mardi, le jeudi et le samedi, tandis que les derniers luttent pour éviter la relégation. En parallèle, une coupe à élimination directe se dispute chaque jeudi. Chaque nuit du dimanche au lundi, le club encaisse ses recettes, paie ses salaires et les joueurs progressent grâce à l'entraînement.</p>
<p>Ce rythme lent est voulu : quelques minutes par jour suffisent pour bien gérer son club, et chaque match compte vraiment.</p>

<h2>Les matchs se regardent en direct</h2>
<p>Chaque rencontre est simulée action par action et diffusée en temps réel : tableau d'affichage, fil du match, carte des tirs, statistiques de chaque joueur et feuille de match complète. Une émission d'avant-match présente l'affiche quelques minutes avant le coup d'envoi, et une émission de mi-temps fait le point à la pause. On peut rejoindre un match en cours, mais jamais l'accélérer ni le rejouer : comme au vrai basket, le résultat tombe une seule fois.</p>

<h2>Préparer chaque match</h2>
<p>Avant chaque journée, tu donnes tes <a href="/guide/ordres">ordres</a> : le cinq de départ, la rotation et le temps de jeu de chacun, le système offensif, la défense (individuelle, zone, presse…), le rythme et les joueurs adverses à surveiller. Tu peux préparer plusieurs journées à l'avance et enregistrer jusqu'à trois <a href="/guide/tactiques">tactiques</a> complètes pour les appliquer en un clic. Plus ton équipe répète un système, mieux elle le maîtrise : c'est la <a href="/guide/connaissance">connaissance tactique</a>.</p>
<p>Pour bien préparer un match, le <a href="/guide/scoutisme">scoutisme</a> analyse l'adversaire : ses stratégies habituelles, ses zones de tir, ses joueurs clés et la meilleure façon de le battre.</p>

<h2>Faire progresser ses joueurs</h2>
<p>Chaque joueur a des <a href="/guide/caracs">caractéristiques</a> notées de 0 à 99 (tir extérieur, passe, rebond, défense, athlétisme…) et un <a href="/guide/potentiel">potentiel</a> qui fixe jusqu'où il peut monter. L'entraînement hebdomadaire, le temps de jeu et l'âge font évoluer ces notes. Il faut aussi surveiller la <a href="/guide/forme">forme, la motivation et les blessures</a>, et l'<a href="/guide/alchimie">alchimie</a> du groupe : un cinq qui joue souvent ensemble finit par mieux se trouver.</p>

<h2>Gérer un club, pas seulement une équipe</h2>
<p>Le succès sportif dépend aussi des coulisses. Le <a href="/guide/marche">marché des transferts</a> fonctionne aux enchères en temps réel face aux autres managers. Le staff (entraîneurs adjoints, médecin, kiné, recruteurs) apporte des bonus précieux. L'<a href="/guide/academie">académie</a> permet de repérer des jeunes de 15 à 17 ans et d'en faire les stars de demain. Côté finances, la <a href="/guide/salle">salle</a> et le prix des billets, les <a href="/guide/sponsors">sponsors</a>, la boutique et l'<a href="/guide/humeur">humeur des supporters</a> déterminent le budget disponible pour recruter.</p>

<h2>Une vraie ligue de managers</h2>
<p>Chaque ligue réunit jusqu'à dix managers humains, complétés par des clubs gérés par l'ordinateur. Classement, play-offs, montées et descentes : le championnat vit au rythme de tous les participants. On peut aussi organiser des <a href="/guide/amicaux">matchs amicaux</a> les jours de repos et créer des <a href="/guide/lp">ligues privées</a> entre amis. Un serveur Discord permet d'échanger avec les autres managers.</p>

<h2>Gratuit, sans installation</h2>
<p>Hoop Manager se joue entièrement dans le navigateur. Il s'installe aussi comme une application sur l'écran d'accueil du téléphone. Le jeu est gratuit ; certaines fonctions de confort sont proposées dans une formule <a href="/guide/premium">Premium</a>, sans aucun avantage sportif, et quelques bonus facultatifs se débloquent en regardant une publicité.</p>
${cta()}
</article>`,
  };
}

function pageGuideIndex(entries) {
  const groups = [];
  entries.forEach(e => {
    let g = groups.find(x => x.name === e.group);
    if (!g) { g = { name: e.group, items: [] }; groups.push(g); }
    g.items.push(e);
  });
  const toc = groups.map(g => `<section><h2>${esc(g.name)}</h2><ul>${g.items.map(e => `<li><a href="/guide/${e.id}">${esc(e.title)}</a></li>`).join("")}</ul></section>`).join("");
  return {
    title: "Guide du jeu",
    description: "Le guide complet de Hoop Manager : premiers pas, effectif, caractéristiques, ordres et tactiques, match en direct, compétitions, marché, économie, salle et académie.",
    body: `<div class="page"><h1>Guide du jeu</h1>
<p class="lead">Tout ce qu'il faut savoir pour diriger ton club : de la préparation d'un match à la gestion des finances. Ce guide est le même que celui qu'on retrouve dans le jeu.</p></div>
<div class="guide-toc">${toc}</div>`,
  };
}

function pageGuideEntry(entries, idx) {
  const e = entries[idx];
  const prev = entries[idx - 1], next = entries[idx + 1];
  return {
    title: `${e.title} · Guide`,
    description: e.text.slice(0, 155).replace(/\s+\S*$/, "") + "…",
    body: `<article class="page">
<p class="crumbs"><a href="/guide">Guide</a> › ${esc(e.group)}</p>
<h1>${esc(e.title)}</h1>
${e.html}
<div class="pager">${prev ? `<a class="btn btn-ghost" href="/guide/${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a class="btn btn-ghost" href="/guide/${next.id}">${esc(next.title)} →</a>` : ""}</div>
${cta()}
</article>`,
  };
}

const FAQ = [
  ["Hoop Manager est-il gratuit ?", "Oui. Le jeu est entièrement jouable gratuitement. Une formule Premium facultative apporte du confort (six tactiques enregistrées au lieu de trois, Scouting Pro illimité, ligues privées, maillots personnalisés, aucune publicité…), sans aucun avantage sportif : ni progression plus rapide, ni argent, ni staff en plus."],
  ["Faut-il installer quelque chose ?", "Non, tout se passe dans le navigateur, sur ordinateur, tablette ou téléphone. Sur téléphone, tu peux ajouter le jeu à l'écran d'accueil pour l'ouvrir comme une application."],
  ["Dois-je être connecté pendant les matchs ?", "Non. Les matchs se jouent à l'heure prévue, que tu sois là ou non, avec les ordres que tu as validés. Si tu n'as rien préparé, l'équipe joue avec tes derniers réglages."],
  ["Combien de temps faut-il y consacrer ?", "Quelques minutes par jour suffisent : vérifier la forme des joueurs, préparer les ordres du prochain match, suivre le marché. Les passionnés peuvent y passer bien plus de temps, notamment en regardant les matchs en direct."],
  ["Quand ont lieu les matchs ?", "Le championnat se joue le mardi et le samedi à 20 h pendant neuf semaines, puis viennent deux semaines de play-offs (mardi, jeudi et samedi). La coupe se dispute le jeudi. Les horaires sont donnés à l'heure de Paris."],
  ["Contre qui je joue ?", "Chaque ligue compte jusqu'à dix managers humains, complétés par des clubs gérés par l'ordinateur. Tu peux aussi proposer des matchs amicaux à n'importe quel club les jours de repos, ou créer une ligue privée avec tes amis."],
  ["Comment recruter de nouveaux joueurs ?", "Par le marché des transferts, où tous les joueurs mis en vente sont disputés aux enchères en temps réel, ou par l'académie de jeunes, qui fait remonter des prospects de 15 à 17 ans grâce à tes recruteurs."],
  ["Que se passe-t-il si mon club n'a plus d'argent ?", "Un budget durablement sous le seuil d'alerte finit par mettre tout l'effectif en vente forcée : le jeu te prévient avant, et l'onglet Économie permet de surveiller la masse salariale. Les recettes viennent de la billetterie, des droits TV, des sponsors et de la boutique."],
  ["Pourquoi y a-t-il des publicités ?", "Les publicités financent l'hébergement du jeu. Elles n'apparaissent qu'à quelques endroits précis : une courte coupure pendant les émissions d'avant-match et de mi-temps, et une publicité facultative à regarder pour débloquer un rapport de scoutisme. Elles n'interrompent jamais l'action d'un match, et les abonnés Premium n'en voient aucune."],
  ["J'ai oublié mon mot de passe, que faire ?", `Écris-nous sur le serveur Discord du jeu ou à <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> depuis l'adresse de ton compte : nous réinitialiserons ton mot de passe.`],
  ["Comment supprimer mon compte ?", `Envoie un message à <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> depuis l'adresse de ton compte (ou sur Discord pour un compte Discord). Ton compte et les données associées seront supprimés.`],
  ["Le jeu existe-t-il en anglais ?", "Oui, l'interface du jeu est disponible en français et en anglais."],
];

function pageFaq() {
  return {
    title: "Questions fréquentes",
    description: "Les réponses aux questions les plus fréquentes sur Hoop Manager : prix, horaires des matchs, temps de jeu, recrutement, publicité, compte.",
    body: `<div class="page"><h1>Questions fréquentes</h1>
<p class="lead">Les réponses aux questions qu'on nous pose le plus souvent. Il te manque une réponse ? <a href="/contact">Écris-nous</a>.</p>
${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join("")}
${cta()}</div>`,
  };
}

function pageAPropos() {
  return {
    title: "À propos",
    description: "Hoop Manager est un jeu de gestion de basket indépendant, développé en France par un passionné, avec l'aide de sa communauté de managers.",
    body: `<article class="page"><h1>À propos de Hoop Manager</h1>
<p class="lead">Hoop Manager est un jeu indépendant, développé en France par un fan de basket, pour les fans de basket.</p>
<h2>Pourquoi ce jeu</h2>
<p>L'idée est née d'une envie simple : retrouver le plaisir des jeux de gestion sportive d'autrefois, où chaque décision compte et où l'on attend le prochain match avec impatience, mais avec des matchs qu'on peut regarder en direct et une ligue partagée avec de vrais adversaires.</p>
<p>Le moteur de match simule chaque possession en tenant compte des caractéristiques des joueurs, de leur forme, de la tactique choisie et de la façon dont l'équipe maîtrise son système. Le résultat n'est jamais écrit d'avance : un bon plan de jeu peut renverser un adversaire plus fort sur le papier.</p>
<h2>Un jeu construit avec sa communauté</h2>
<p>Hoop Manager évolue en permanence. Une grande partie des nouveautés (matchs amicaux, sponsors, tactiques enregistrées, émissions d'avant-match…) viennent directement des idées et des retours des managers sur le serveur Discord du jeu. Les nouveautés sont présentées dans le <a href="/guide">guide</a>.</p>
<h2>Nous contacter</h2>
<p>Une question, un bug, une idée ? Écris-nous à <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> ou retrouve-nous sur Discord. Voir aussi la page <a href="/contact">Contact</a>.</p>
${cta()}</article>`,
  };
}

function pageContact(discordInvite) {
  return {
    title: "Contact",
    description: "Contacter l'équipe de Hoop Manager : email et serveur Discord.",
    body: `<article class="page"><h1>Contact</h1>
<p class="lead">Une question sur le jeu, un bug à signaler, un problème de compte ou une idée d'amélioration : nous lisons tout.</p>
<h2>Par email</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Pour une question sur ton compte, écris depuis l'adresse utilisée à l'inscription et indique le nom de ton club.</p>
<h2>Sur Discord</h2>
<p>${discordInvite ? `Le <a href="${esc(discordInvite)}" rel="noopener">serveur Discord de Hoop Manager</a>` : "Le serveur Discord de Hoop Manager"} est le moyen le plus rapide d'obtenir de l'aide : les autres managers y partagent leurs conseils, et les nouveautés y sont annoncées en premier.</p>
<h2>Avant d'écrire</h2>
<p>La réponse se trouve peut-être déjà dans la <a href="/faq">FAQ</a> ou dans le <a href="/guide">guide du jeu</a>.</p>
</article>`,
  };
}

function pageConfidentialite() {
  return {
    title: "Politique de confidentialité",
    description: "Quelles données Hoop Manager collecte, pourquoi, combien de temps, et comment exercer vos droits. Informations sur la publicité et les cookies.",
    body: `<article class="page"><h1>Politique de confidentialité</h1>
<p class="lead">Dernière mise à jour : 28 septembre 2026.</p>
<h2>Responsable du traitement</h2>
<p>Le site hoop-manager.com et le jeu Hoop Manager sont édités par ${PUBLISHER_NAME}, joignable à <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<h2>Données collectées</h2>
<ul>
<li><b>Compte</b> : adresse email et mot de passe (conservé uniquement sous forme chiffrée, jamais en clair), ou identifiant et nom d'utilisateur Discord si vous vous inscrivez avec Discord ; nom du club choisi ; dates de création et de dernière connexion.</li>
<li><b>Données de jeu</b> : tout ce que vous faites dans le jeu (ordres, transferts, messages envoyés aux autres managers…), nécessaire à son fonctionnement.</li>
<li><b>Stockage local du navigateur</b> : un jeton de connexion et vos préférences (langue, thème) sont enregistrés dans votre navigateur pour vous garder connecté.</li>
<li><b>Journaux techniques</b> : l'hébergeur enregistre les requêtes (adresse IP, date, page demandée) pour la sécurité et le bon fonctionnement du service.</li>
</ul>
<h2>Pourquoi</h2>
<p>Ces données servent uniquement à faire fonctionner le jeu (vous connecter, sauvegarder votre club, faire jouer les matchs) et à vous répondre lorsque vous nous écrivez. Base légale : l'exécution du service que vous avez demandé en créant un compte. Votre adresse email n'est jamais vendue ni utilisée pour de la prospection commerciale.</p>
<h2>Publicité et cookies</h2>
<p>Le site affiche des publicités fournies par <b>Google AdSense</b>. Google et ses partenaires peuvent utiliser des cookies ou des identifiants similaires pour diffuser les annonces, en mesurer l'efficacité et, avec votre accord, les personnaliser en fonction de vos visites sur ce site et sur d'autres sites. Lors de votre première visite depuis l'Espace économique européen, le Royaume-Uni ou la Suisse, un message vous permet d'accepter, de refuser ou de choisir ces usages ; refuser n'empêche pas de jouer. Vous pouvez modifier votre choix à tout moment via le lien de gestion du consentement proposé par ce message.</p>
<p>Pour en savoir plus sur la façon dont Google utilise ces données : <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">policies.google.com/technologies/partner-sites</a>. Vous pouvez aussi désactiver la publicité personnalisée dans les <a href="https://adssettings.google.com" rel="noopener">paramètres des annonces Google</a>.</p>
<h2>Destinataires et hébergement</h2>
<p>Les données sont hébergées par Render Services, Inc. (serveurs du jeu) et Upstash, Inc. (base de données), et peuvent donc être traitées hors de l'Union européenne, dans le cadre des garanties prévues par ces prestataires (clauses contractuelles types). Discord reçoit les informations nécessaires si vous choisissez la connexion par Discord. Google reçoit les données décrites ci-dessus pour la publicité.</p>
<h2>Durée de conservation</h2>
<p>Les données du compte et du club sont conservées tant que le compte existe. Un compte supprimé est effacé avec les données qui lui sont rattachées, sauf les résultats sportifs déjà intégrés à l'historique de la ligue (scores, classements), qui ne permettent pas de vous identifier directement.</p>
<h2>Vos droits</h2>
<p>Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données. Pour les exercer, écrivez à <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> depuis l'adresse de votre compte. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (<a href="https://www.cnil.fr" rel="noopener">cnil.fr</a>).</p>
<h2>Mineurs</h2>
<p>Le jeu est ouvert à tous. Si vous avez moins de 15 ans, demandez l'accord d'un parent avant de créer un compte.</p>
</article>`,
  };
}

function pageMentions() {
  return {
    title: "Mentions légales",
    description: "Mentions légales du site hoop-manager.com : éditeur, hébergeur, propriété intellectuelle.",
    body: `<article class="page"><h1>Mentions légales</h1>
<h2>Éditeur du site</h2>
<p>${PUBLISHER_NAME}<br>Email : <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br>Directeur de la publication : ${PUBLISHER_NAME}</p>
<h2>Hébergement</h2>
<p>Render Services, Inc., San Francisco, Californie, États-Unis. Site : <a href="https://render.com" rel="noopener">render.com</a>.<br>Base de données : Upstash, Inc. Site : <a href="https://upstash.com" rel="noopener">upstash.com</a>.</p>
<h2>Propriété intellectuelle</h2>
<p>Le jeu Hoop Manager, son nom, son logo, ses textes et ses visuels sont protégés. Toute reproduction sans autorisation est interdite. Les clubs, joueurs et compétitions du jeu sont fictifs : toute ressemblance avec des personnes ou des clubs réels serait fortuite.</p>
<h2>Données personnelles</h2>
<p>Voir la <a href="/confidentialite">politique de confidentialité</a>.</p>
</article>`,
  };
}

// ---------------------------------------------------------------------
// Routage
// ---------------------------------------------------------------------
const STATIC_PAGES = {
  "/le-jeu": pageLeJeu,
  "/faq": pageFaq,
  "/a-propos": pageAPropos,
  "/confidentialite": pageConfidentialite,
  "/mentions-legales": pageMentions,
};

function allPaths() {
  return ["/bienvenue", "/le-jeu", "/guide", ...guideEntries().map(e => `/guide/${e.id}`), "/faq", "/a-propos", "/contact", "/confidentialite", "/mentions-legales"];
}

// Renvoie { status, contentType, body } ou null si la route n'est pas une
// page publique.
function render(pathName, { discordInvite = null } = {}) {
  const p = pathName.length > 1 ? pathName.replace(/\/+$/, "") : pathName;
  let page = null;
  if (STATIC_PAGES[p]) page = STATIC_PAGES[p]();
  else if (p === "/contact") page = pageContact(discordInvite);
  else if (p === "/guide") page = pageGuideIndex(guideEntries());
  else if (p.startsWith("/guide/")) {
    const entries = guideEntries();
    const idx = entries.findIndex(e => `/guide/${e.id}` === p);
    if (idx < 0) return null;
    page = pageGuideEntry(entries, idx);
  } else if (p === "/robots.txt") {
    return { status: 200, contentType: "text/plain; charset=utf-8", body: `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n` };
  } else if (p === "/sitemap.xml") {
    const urls = allPaths().map(u => `<url><loc>${SITE_URL}${u}</loc></url>`).join("");
    return { status: 200, contentType: "application/xml; charset=utf-8", body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n` };
  }
  if (!page) return null;
  return { status: 200, contentType: "text/html; charset=utf-8", body: layout({ pathName: p, ...page }) };
}

module.exports = { render, guideEntries, allPaths, CONTACT_EMAIL };
