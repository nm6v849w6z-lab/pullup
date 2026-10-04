// E-mails, notifications et pages publiques en français, anglais et italien
// (retour utilisateur 2026-09-30 : « Les e-mails, les notifications et les
// pages Guide, À propos et FAQ n'existent qu'en français. Traduis »).
// Vérifie :
// 1) le choix de la langue (server/i18n.js) : compte, puis indice de la
//    requête (lang explicite, Accept-Language), puis français ;
// 2) l'email « mot de passe oublié » dans les 3 langues, choisi par le
//    compte ou par la page d'où part la demande (vraie route HTTP, envoi
//    Resend intercepté) ;
// 3) les notifications (coup d'envoi, enchères, entrées du fil) dans la
//    langue de chaque appareil abonné ;
// 4) chaque page publique servie en 3 langues (?lang=, cookie,
//    Accept-Language), sans paragraphe français restant, avec <html lang>,
//    canonical, hreflang, sélecteur de langue, et le sitemap multilingue.
process.env.BASKET_INVITE_CODE = "off";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const Engine = require("./engine.js");
const store = require("./server/store.js");
const Accounts = require("./server/accounts.js");
const I18n = require("./server/i18n.js");
const Mailer = require("./server/mailer.js");
const Push = require("./server/push.js");
const WebPush = require("./server/webpush.js");
const Site = require("./server/site.js");
const { createHandler } = require("./server/index.js");
const ok = m => console.log("✅ " + m);

// Paragraphe resté en français : au moins deux mots-outils français qui
// n'existent ni en anglais ni en italien.
const FR_WORDS = /(?<![\wÀ-ÿ'’])(les|des|du|est|pour|avec|dans|une|vous|votre|sont|aux|pas|leur|cette|très|joueurs|équipe|être|où|chaque|ton|tes)(?![\wÀ-ÿ])/gi;
function frenchBlocks(html) {
  const main = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
  return main.split(/<\/?(?:p|li|h1|h2|h3|h4|summary|td|th|a)[^>]*>/)
    .map(s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean)
    .filter(b => new Set((b.match(FR_WORDS) || []).map(x => x.toLowerCase())).size >= 2);
}

(async () => {
  // ------------------------------------------------------------------
  // 1) Choix de la langue
  // ------------------------------------------------------------------
  assert.strictEqual(I18n.fromAcceptLanguage("it-IT,it;q=0.9,en;q=0.8"), "it");
  assert.strictEqual(I18n.fromAcceptLanguage("de-DE,en;q=0.5"), "de", "allemand géré depuis 2026-09-30");
  assert.strictEqual(I18n.fromAcceptLanguage("ja-JP"), "en", "langue non gérée : anglais (comme la page d'accueil)");
  assert.strictEqual(I18n.fromAcceptLanguage("*"), null);
  assert.strictEqual(I18n.fromAcceptLanguage(""), null);
  assert.strictEqual(I18n.langFor({ lang: "it" }, "en"), "it", "préférence du compte d'abord");
  assert.strictEqual(I18n.langFor({}, "en"), "en", "compte sans langue : l'indice de la requête");
  assert.strictEqual(I18n.langFor({ detectedLang: "it" }, "en"), "it", "langue détectée du navigateur avant l'indice");
  assert.strictEqual(I18n.langFor({}, null, "it"), "it", "sinon la langue du pays du club");
  assert.strictEqual(I18n.langFor(null, "en"), "en", "sans compte : l'indice de la requête");
  assert.strictEqual(I18n.langFor(null, null), "en", "sinon anglais");
  assert.strictEqual(I18n.hintFromRequest({ headers: { "accept-language": "it" } }, "en"), "en", "lang explicite avant Accept-Language");
  assert.strictEqual(I18n.hintFromRequest({ headers: { "accept-language": "it" } }, null), "it");
  assert.strictEqual(I18n.siteLang({ query: "it", cookie: "hm-lang=en", acceptLanguage: "fr" }), "it");
  assert.strictEqual(I18n.siteLang({ cookie: "a=1; hm-lang=en", acceptLanguage: "it" }), "en");
  assert.strictEqual(I18n.siteLang({ acceptLanguage: "it-CH" }), "it");
  assert.strictEqual(I18n.siteLang({}), "fr");
  ok("langue : compte → langue détectée → lang explicite / Accept-Language → pays du club → anglais ; pages : ?lang → cookie → Accept-Language");

  // ------------------------------------------------------------------
  // 2) Emails
  // ------------------------------------------------------------------
  const link = "https://hoop-manager.com/bienvenue#reinit=abc";
  const mails = { fr: Mailer.compose("passwordReset", "fr", { link }), en: Mailer.compose("passwordReset", "en", { link }), it: Mailer.compose("passwordReset", "it", { link }) };
  assert.ok(/réinitialiser ton mot de passe/.test(mails.fr.subject) && /valable 1 heure/.test(mails.fr.text));
  assert.ok(/reset your password/.test(mails.en.subject) && /valid for 1 hour/.test(mails.en.text) && !/mot de passe/.test(mails.en.text));
  assert.ok(/reimposta la tua password/.test(mails.it.subject) && /valido 1 ora/.test(mails.it.text) && !/mot de passe/.test(mails.it.text));
  assert.ok(Object.values(mails).every(m => m.text.includes(link)), "le lien dans chaque langue");
  assert.strictEqual(Mailer.compose("passwordReset", "ja", { link }).subject, mails.fr.subject, "langue inconnue : français");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-i18n-"));
  const paths = { solo: path.join(dir, "solo.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const server = http.createServer(createHandler(paths.solo, Date.now, paths.multi, paths.accounts));
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const career = store.createMultiManagerCareer(["Lyon Lang", "Paris Lang", "Roma Lang", "Leeds Lang"], Date.now() - 86400000, "Lyon Lang");
    await store.saveMultiLeague(career.league, paths.multi);
    const post = (p, b, headers = {}) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(b) });
    for (const [email, club, lang] of [["fr@test.fr", "Annecy Lang"], ["it@test.it", "Roma Club"], ["en@test.uk", "Leeds Club"], ["old@test.it", "Bari Club"], ["sig@test.it", "Siena Club", "it"]]) {
      const su = await (await post("/api/account/signup", { email, password: "motdepasse123", clubName: club, ...(lang ? { lang } : {}) })).json();
      assert.strictEqual(su.status, "active", JSON.stringify(su));
    }
    // Préférence de compte (ajoutée par ailleurs : champ `lang`).
    const data = await Accounts.loadAccounts(paths.accounts);
    Accounts.findByEmail(data, "it@test.it").lang = "it";
    Accounts.findByEmail(data, "en@test.uk").lang = "en";
    await Accounts.saveAccounts(data, paths.accounts);

    // Envoi Resend intercepté.
    process.env.RESEND_API_KEY = "test"; process.env.MAIL_FROM = "Hoop Manager <noreply@hoop-manager.com>";
    const sent = [];
    const realFetch = global.fetch;
    global.fetch = async (url, init) => {
      if (String(url).startsWith("https://api.resend.com/")) { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; }
      return realFetch(url, init);
    };
    const forgot = async (email, extra = {}, headers = {}) => {
      const r = await (await post("/api/account/password-forgot", { email, ...extra }, headers)).json();
      assert.ok(r.ok && r.byMail, JSON.stringify(r));
      return sent[sent.length - 1];
    };
    let m = await forgot("fr@test.fr");
    assert.ok(/réinitialiser/.test(m.subject) && /\/bienvenue#reinit=/.test(m.text), "sans préférence ni indice : langue du pays du club (France), lien sans ?lang");
    m = await forgot("it@test.it", { lang: "en" }, { "Accept-Language": "fr" });
    assert.ok(/reimposta/.test(m.subject) && /Ciao/.test(m.text) && /\/bienvenue\?lang=it#reinit=/.test(m.text), "compte italien : email en italien (la préférence du compte l'emporte)");
    m = await forgot("en@test.uk");
    assert.ok(/reset your password/.test(m.subject) && /\?lang=en#reinit=/.test(m.text), "compte anglais : email en anglais");
    m = await forgot("sig@test.it", {}, { "Accept-Language": "fr" });
    assert.ok(/reimposta/.test(m.subject), "langue envoyée à l'inscription (rangée sur le compte) : italien");
    m = await forgot("old@test.it", { lang: "it" }, { "Accept-Language": "en-US,en;q=0.9" });
    assert.ok(/reimposta/.test(m.subject), "compte sans langue enregistrée : langue de la page d'où part la demande");
    global.fetch = realFetch;
    delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM;
    const landing = fs.readFileSync("assets/site/index.html", "utf-8");
    assert.ok(/password-forgot", \{ email: email, lang: lang \}/.test(landing), "la page d'accueil envoie sa langue avec la demande");
    ok("email « mot de passe oublié » en français / anglais / italien selon la langue du compte (Accounts.langFor)");

    // ------------------------------------------------------------------
    // 3) Notifications
    // ------------------------------------------------------------------
    {
      const kick = { title: "Votre match commence !", body: "", url: "/", tag: "k", msg: { id: "kickoff", params: { team: "Lyon", opp: { opp: "Paris" } } } };
      assert.strictEqual(Push.localizeNote(kick, "en").title, "Your game is starting!");
      assert.strictEqual(Push.localizeNote(kick, "it").body, "Lyon contro Paris: si parte, in diretta.");
      assert.strictEqual(Push.localizeNote(kick, "fr").title, "Votre match commence !");
      const staff = { msg: { id: "outbid", params: { what: { staff: "recruiter", level: 3 }, bid: { money: 125000 }, left: { ms: 3 * 3600e3 }, next: { money: 130000 } } } };
      const en = Push.localizeNote(staff, "en"), it = Push.localizeNote(staff, "it");
      assert.strictEqual(en.title, "Outbid: the scout (level 3)");
      assert.ok(/New offer at \$125,000, closing in 3 h\. Bid again from \$130,000\./.test(en.body), en.body);
      assert.strictEqual(it.title, "Offerta superata: l'osservatore (livello 3)");
      assert.ok(/Nuova offerta a 125\.000 \$, chiusura tra 3 h\. Rilancia da 130\.000 \$\./.test(it.body), it.body);
      const lost = { msg: { id: "lost", params: { what: { player: null }, price: { money: null } } } };
      assert.strictEqual(Push.localizeNote(lost, "it").title, "Asta persa: un giocatore");
      assert.strictEqual(Push.localizeNote(lost, "en").body, "Another club won the auction.");
      ["en", "it"].forEach(l => Object.keys(Push.MESSAGES).forEach(id => assert.ok(Push.MESSAGES[id][l], `${id} en ${l}`)));
    }
    {
      const vapid = WebPush.generateVapidKeys();
      process.env.VAPID_PUBLIC_KEY = vapid.publicKey; process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
      const league = store.createMultiManagerCareer(["Lyon Push", "Paris Push"], Date.now() - 2 * 86400e3, "Lyon Push").league;
      const lyon = league.teams[0];
      lyon.setPaying(true);
      const mk = (id, lang) => Push.addSubscription(lyon, { endpoint: `https://push.example.test/${id}`, keys: { p256dh: "p", auth: "a" } }, Date.now(), lang);
      assert.ok(mk("fr", "fr") && mk("en", "en") && mk("it", "it") && mk("old", null));
      assert.strictEqual(lyon.pushSubscriptions.find(s => s.endpoint.endsWith("/it")).lang, "it", "langue rangée avec l'abonnement");
      const now = Date.now();
      league.liveMatches = { "0:0:1": { homeIdx: 0, awayIdx: 1, kickoffAt: now - 60000, events: [], round: 0 } };
      Engine.handleGameEvent(lyon.feed, { type: "injury", week: 1, playerId: lyon.players[0].id, playerName: "Léo Martin", weeks: 3 }, { clubName: lyon.name });
      Engine.handleGameEvent(lyon.feed, { type: "transfer_in", week: 1, playerId: 99, playerName: "Nouveau Venu", from: "Paris Push", fee: 120000 }, { clubName: lyon.name });
      const got = {};
      await Push.flushLeague(league, now, { langOf: null, send: async (s, note) => { const k = s.endpoint.split("/").pop(); (got[k] = got[k] || []).push(note); return { ok: true }; } });
      assert.strictEqual(got.fr.length, 3); assert.strictEqual(got.en.length, 3); assert.strictEqual(got.it.length, 3);
      assert.strictEqual(got.fr[0].title, "Votre match commence !");
      assert.strictEqual(got.old[0].title, "Votre match commence !", "abonnement sans langue (ancien) : français");
      assert.strictEqual(got.en[0].title, "Your game is starting!");
      assert.strictEqual(got.it[0].title, "La tua partita sta per iniziare!");
      assert.ok(got.en.every(n => !("msg" in n) && !("feed" in n)), "rien d'interne dans la charge envoyée");
      const text = l => got[l].slice(1).map(n => `${n.title} | ${n.body}`).join(" / ");
      assert.ok(/Léo Martin (injured|sidelined)/.test(text("en")) && /week\(s\)/.test(text("en")), text("en"));
      assert.ok(/Nouveau Venu/.test(text("en")) && /\$120,000/.test(text("en")) && !/semaine|blessé|Arrivée|Transfert/.test(text("en")), text("en"));
      assert.ok(/Léo Martin (infortunato|in infermeria)/.test(text("it")) && /settiman/.test(text("it")) && /120\.000 \$/.test(text("it")), text("it"));
      assert.ok(/blessé|infirmerie/.test(text("fr")), text("fr"));
      // Langue du compte du club (Accounts.langFor, via setLangResolver) : elle
      // l'emporte sur celle de chaque appareil.
      Engine.handleGameEvent(lyon.feed, { type: "transfer_out", week: 1, playerName: "Parti Loin", to: "Paris Push", fee: 5000 }, { clubName: lyon.name });
      const got2 = [];
      await Push.flushLeague(league, now + 1000, { langOf: async t => (t === lyon ? "it" : null), send: async (s, note) => { got2.push(note); return { ok: true }; } });
      assert.strictEqual(got2.length, 4);
      assert.ok(got2.every(n => /Parti Loin/.test(n.title + n.body) && !/Transfert|quitte|Départ/.test(n.title + n.body)), JSON.stringify(got2));
      delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
    }
    ok("notifications : coup d'envoi, enchères (joueurs / staff, montants, délais) et fil (blessure, arrivée) dans la langue de chaque appareil");

    // ------------------------------------------------------------------
    // 4) Pages publiques
    // ------------------------------------------------------------------
    const get = (p, headers = {}) => fetch(base + p, { headers });
    const pages = Site.allPaths().filter(p => p !== "/bienvenue");
    let checked = 0;
    for (const p of pages) {
      for (const lang of ["en", "it"]) {
        const res = await get(`${p}?lang=${lang}`);
        assert.strictEqual(res.status, 200, `${p}?lang=${lang}`);
        const html = await res.text();
        assert.ok(html.includes(`<html lang="${lang}">`), `${p} (${lang}) : <html lang>`);
        assert.ok(html.includes(`<link rel="canonical" href="https://hoop-manager.com${p}?lang=${lang}">`), `${p} (${lang}) : canonical`);
        for (const l of ["fr", "en", "it"]) assert.ok(html.includes(`hreflang="${l}" href="https://hoop-manager.com${l === "fr" ? p : `${p}?lang=${l}`}"`), `${p} (${lang}) : hreflang ${l}`);
        assert.ok(html.includes(`hreflang="x-default" href="https://hoop-manager.com${p}"`), `${p} : x-default`);
        const bad = frenchBlocks(html);
        assert.deepStrictEqual(bad, [], `${p} (${lang}) : paragraphes restés en français`);
        assert.ok(/Set-Cookie|hm-lang=/i.test(res.headers.get("set-cookie") || ""), `${p} (${lang}) : choix mémorisé (cookie)`);
        assert.ok(!/href="\/(le-jeu|guide|faq|a-propos|contact|confidentialite|mentions-legales)[^"?]*"/.test(html.replace(/<nav class="langs"[\s\S]*?<\/nav>/, "")), `${p} (${lang}) : liens internes dans la langue`);
        checked++;
      }
      const fr = await (await get(p)).text();
      assert.ok(fr.includes('<html lang="fr">') && fr.includes(`<link rel="canonical" href="https://hoop-manager.com${p}">`), `${p} : français par défaut`);
      assert.ok(/<nav class="langs"[^>]*>.*\?lang=fr.*\?lang=en.*\?lang=it/.test(fr), `${p} : sélecteur FR / EN / IT`);
    }
    ok(`${pages.length} pages publiques (Guide, FAQ, À propos, Le jeu, Contact, Confidentialité, Mentions légales) en anglais et en italien, sans paragraphe français (${checked} versions)`);

    const faqEn = await (await get("/faq?lang=en")).text();
    assert.ok(/Frequently asked questions/.test(faqEn) && /Is Hoop Manager free\?/.test(faqEn));
    const faqIt = await (await get("/faq?lang=it")).text();
    assert.ok(/Domande frequenti/.test(faqIt) && /Hoop Manager è gratuito\?/.test(faqIt));
    const aboutIt = await (await get("/a-propos", { cookie: "hm-lang=it" })).text();
    assert.ok(aboutIt.includes('<html lang="it">') && /Chi siamo/.test(aboutIt), "cookie hm-lang=it : À propos en italien");
    const guideEn = await (await get("/guide", { "Accept-Language": "en-GB,en;q=0.9" })).text();
    assert.ok(guideEn.includes('<html lang="en">') && /Game guide/.test(guideEn), "Accept-Language anglais : Guide en anglais");
    const guideOrders = await (await get("/guide/ordres?lang=it")).text();
    assert.ok(/Ordini e tattiche/.test(guideOrders) && /quintetto|Tabellino/.test(guideOrders), "entrée du Guide en italien (glossaire du jeu)");
    const qBeatsCookie = await (await get("/faq?lang=fr", { cookie: "hm-lang=it" })).text();
    assert.ok(qBeatsCookie.includes('<html lang="fr">'), "?lang= l'emporte sur le cookie");
    ok("langue choisie par ?lang=, puis cookie, puis Accept-Language");

    const sitemap = await (await get("/sitemap.xml")).text();
    assert.ok(sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
    for (const p of Site.allPaths()) {
      for (const l of ["fr", "en", "it"]) assert.ok(sitemap.includes(`<loc>https://hoop-manager.com${l === "fr" ? p : `${p}?lang=${l}`}</loc>`), `sitemap : ${p} ${l}`);
    }
    assert.ok(sitemap.includes('<xhtml:link rel="alternate" hreflang="it" href="https://hoop-manager.com/faq?lang=it"/>'), "sitemap : variantes hreflang");
    const home = await (await get("/bienvenue?lang=it")).text();
    assert.ok(home.includes('<html lang="it">') && home.includes('<link rel="canonical" href="https://hoop-manager.com/bienvenue?lang=it">') && home.includes('hreflang="en" href="https://hoop-manager.com/bienvenue?lang=en"'), "accueil ?lang=it : lang, canonical, hreflang");
    assert.ok(/<title>Hoop Manager · Gioco manageriale di basket online<\/title>/.test(home), "accueil : titre italien");
    const homeFr = await (await get("/bienvenue")).text();
    assert.ok(homeFr.includes('<html lang="fr">') && homeFr.includes('<link rel="canonical" href="https://hoop-manager.com/bienvenue">'), "accueil : français par défaut");
    ok("sitemap multilingue (xhtml:link) et page d'accueil indexable en 3 langues");

    // Langues sans pages traduites (es, pt, de, pl, el, lt, zh) : version
    // anglaise des pages, mais langue choisie gardée (cookie, liens,
    // sélecteur) ; page d'accueil dans la langue.
    for (const l of ["es", "pt", "de", "pl", "el", "lt", "zh"]) {
      const res = await get(`/faq?lang=${l}`);
      const html = await res.text();
      assert.strictEqual(res.status, 200, `/faq?lang=${l}`);
      assert.ok(html.includes('<html lang="en">') && /Frequently asked questions/.test(html), `/faq?lang=${l} : version anglaise`);
      assert.ok(html.includes('<link rel="canonical" href="https://hoop-manager.com/faq?lang=en">'), `/faq?lang=${l} : canonical anglais`);
      assert.ok((res.headers.get("set-cookie") || "").includes(`hm-lang=${l}`), `/faq?lang=${l} : cookie`);
      assert.ok(html.includes(`href="/bienvenue?lang=${l}"`) && html.includes(`<a href="/faq?lang=${l}" lang="${l}"`), `/faq?lang=${l} : liens et sélecteur`);
      const cookieGuide = await (await get("/guide/ordres", { cookie: `hm-lang=${l}` })).text();
      assert.ok(cookieGuide.includes('<html lang="en">'), `cookie hm-lang=${l} : Guide en anglais`);
      const h = await (await get(`/bienvenue?lang=${l}`)).text();
      assert.ok(h.includes(`<html lang="${l}">`) && h.includes(`hreflang="${l}" href="https://hoop-manager.com/bienvenue?lang=${l}"`), `accueil ?lang=${l}`);
    }
    assert.ok(!sitemap.includes("/faq?lang=de") && sitemap.includes("<loc>https://hoop-manager.com/bienvenue?lang=de</loc>"), "sitemap : nouvelles langues pour l'accueil seulement");
    ok("nouvelles langues : accueil traduit, pages de contenu servies en anglais");
  } finally {
    server.close();
  }
  console.log("\n🏁 site_i18n_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
