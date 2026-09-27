// =====================================================================
// VRAIES PUBS — Google H5 Games Ads (AdSense pour les jeux web, « Ad
// Placement API » : adBreak/adConfig). Demande utilisateur (2026-09-27) :
// "ajouter les pubs aux endroits prévus". Emplacements branchés côté client
// (moteurbasket3.html, voir hmAds*) : pub récompensée du Scouting Pro,
// coupures pub avant-match et mi-temps des Hoop Shows.
//
// Configuration (Render) — sans ADSENSE_CLIENT, RIEN n'est injecté et le jeu
// garde ses écrans gris factices :
//   ADSENSE_CLIENT = ca-pub-XXXXXXXXXXXXXXXX  (ID éditeur AdSense)
//   ADSENSE_TEST   = 1  → data-adbreak-test="on" (pubs de test Google, à
//                        utiliser tant que le compte n'est pas validé)
// Le consentement RGPD (CMP) est géré par AdSense lui-même (« Confidentialité
// et messages » dans la console AdSense), rien à coder ici.
// =====================================================================

const CLIENT_RE = /^ca-pub-\d{10,20}$/;

function adsConfig(env = process.env) {
  const client = String(env.ADSENSE_CLIENT || "").trim();
  if (!CLIENT_RE.test(client)) return null;
  const test = /^(1|true|on|yes)$/i.test(String(env.ADSENSE_TEST || "").trim());
  return { client, test };
}

// Balises à placer dans <head>. `withApi` : ajoute la config lue par le jeu
// (window.HM_ADS) + le shim adBreak/adConfig recommandé par Google. La page
// d'accueil n'a besoin que du script (vérification du site par AdSense).
// `?client=` dans l'URL = forme exacte donnée par la console AdSense pour
// valider le site ; data-ad-client = forme lue par H5 Games Ads.
function headSnippet(config, { withApi = true } = {}) {
  if (!config) return "";
  const testAttr = config.test ? ` data-adbreak-test="on"` : "";
  const script = `<script async data-ad-client="${config.client}"${testAttr} data-ad-frequency-hint="120s" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.client}" crossorigin="anonymous"></script>`;
  if (!withApi) return script;
  const api = `<script>window.HM_ADS=${JSON.stringify({ client: config.client, test: config.test })};` +
    `window.adsbygoogle=window.adsbygoogle||[];window.adBreak=window.adConfig=function(o){window.adsbygoogle.push(o);};</script>`;
  return api + script;
}

function injectHead(html, config, opts) {
  const snippet = headSnippet(config, opts);
  if (!snippet) return html;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${snippet}</head>`) : snippet + html;
}

// Contenu de /ads.txt (null = pas de pub configurée → 404).
function adsTxt(config) {
  if (!config) return null;
  return `google.com, ${config.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`;
}

module.exports = { adsConfig, headSnippet, injectHead, adsTxt };
