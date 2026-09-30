"use strict";

// =====================================================================
// PAGES PUBLIQUES EN ANGLAIS ET EN ITALIEN (2026-09-30, retour
// utilisateur : « Les e-mails, les notifications et les pages Guide, À
// propos et FAQ n'existent qu'en français. Traduis »).
//
// Les textes français restent dans server/site.js (pageLeJeu, FAQ…) ; ici,
// leurs versions anglaise et italienne, rédigées à la main, avec le même
// vocabulaire que le jeu (assets/i18n/en.js, glossaire en tête de
// assets/i18n/it.js). Le Guide, lui, n'est jamais recopié : il est traduit
// à la volée avec le dictionnaire du jeu (server/i18n.js).
//
// Toute modification d'une page française doit être reportée ici (le test
// site_i18n_test.js vérifie qu'aucun paragraphe français ne subsiste).
//
// Langues ajoutées ensuite (es, pt, de, pl, el, lt, zh, 2026-09-30) :
// seuls LANDING (titre / description de /bienvenue) existe dans ces
// langues ; les pages de contenu leur sont servies en anglais (voir
// server/site.js:contentLang).
// =====================================================================

// Textes communs de la mise en page (en-tête, pied, appel à s'inscrire).
const UI = {
  fr: {
    nav: { "/le-jeu": "Le jeu", "/guide": "Guide", "/faq": "FAQ", "/a-propos": "À propos", "/contact": "Contact", "/confidentialite": "Confidentialité", "/mentions-legales": "Mentions légales" },
    play: "Jouer gratuitement", home: "Hoop Manager, accueil", mainNav: "Navigation principale", siteNav: "Pages du site", langNav: "Langue",
    cta: "Envie de diriger ton propre club ? L'inscription prend une minute.", ctaBtn: "Créer mon club",
    guideTitle: "Guide du jeu",
    guideDesc: "Le guide complet de Hoop Manager : premiers pas, effectif, caractéristiques, ordres et tactiques, match en direct, compétitions, marché, économie, salle et académie.",
    guideLead: "Tout ce qu'il faut savoir pour diriger ton club : de la préparation d'un match à la gestion des finances. Ce guide est le même que celui qu'on retrouve dans le jeu.",
    guideCrumb: "Guide",
  },
  en: {
    nav: { "/le-jeu": "The game", "/guide": "Guide", "/faq": "FAQ", "/a-propos": "About", "/contact": "Contact", "/confidentialite": "Privacy", "/mentions-legales": "Legal notice" },
    play: "Play for free", home: "Hoop Manager, home", mainNav: "Main navigation", siteNav: "Site pages", langNav: "Language",
    cta: "Fancy running your own club? Signing up takes a minute.", ctaBtn: "Create my club",
    guideTitle: "Game guide",
    guideDesc: "The complete Hoop Manager guide: first steps, squad, attributes, orders and tactics, live matches, competitions, market, finances, arena and academy.",
    guideLead: "Everything you need to know to run your club, from preparing a match to managing the finances. This is the same guide you'll find in the game.",
    guideCrumb: "Guide",
  },
  it: {
    nav: { "/le-jeu": "Il gioco", "/guide": "Guida", "/faq": "FAQ", "/a-propos": "Chi siamo", "/contact": "Contatti", "/confidentialite": "Privacy", "/mentions-legales": "Note legali" },
    play: "Gioca gratis", home: "Hoop Manager, home", mainNav: "Navigazione principale", siteNav: "Pagine del sito", langNav: "Lingua",
    cta: "Hai voglia di guidare il tuo club? L'iscrizione richiede un minuto.", ctaBtn: "Crea il mio club",
    guideTitle: "Guida del gioco",
    guideDesc: "La guida completa di Hoop Manager: primi passi, rosa, caratteristiche, ordini e tattiche, partite in diretta, competizioni, mercato, economia, palazzetto e vivaio.",
    guideLead: "Tutto quello che devi sapere per guidare il tuo club, dalla preparazione di una partita alla gestione delle finanze. È la stessa guida che trovi nel gioco.",
    guideCrumb: "Guida",
  },
};

// Titre / description de la page d'accueil (/bienvenue), servis dans la
// langue de ?lang= pour les versions indexées (le reste de la page est
// traduit par son propre script, TEXTS dans assets/site/index.html).
const LANDING = {
  fr: { title: "Hoop Manager · Jeu de gestion de basket en ligne", description: "Dirige ton club de basket en ligne : matchs diffusés en direct, ligue de 10 managers, entraînement, transferts aux enchères. Gratuit, dans le navigateur." },
  en: { title: "Hoop Manager · Online basketball management game", description: "Run your own basketball club online: matches broadcast live, a league of 10 managers, training, transfer auctions. Free, in your browser." },
  it: { title: "Hoop Manager · Gioco manageriale di basket online", description: "Guida il tuo club di basket online: partite trasmesse in diretta, una lega di 10 manager, allenamento, aste di mercato. Gratis, nel browser." },
  es: { title: "Hoop Manager · Juego de gestión de baloncesto online", description: "Dirige tu club de baloncesto online: partidos retransmitidos en directo, una liga de 10 mánagers, entrenamiento, fichajes por subasta. Gratis, en el navegador." },
  pt: { title: "Hoop Manager · Jogo de gestão de basquete online", description: "Comande seu clube de basquete online: jogos transmitidos ao vivo, uma liga de 10 managers, treinos, contratações em leilão. Grátis, no navegador." },
  de: { title: "Hoop Manager · Online-Basketball-Managerspiel", description: "Führe deinen eigenen Basketballverein online: Spiele live übertragen, eine Liga mit 10 Managern, Training, Transfers per Auktion. Kostenlos, im Browser." },
  pl: { title: "Hoop Manager · Menedżer koszykówki online", description: "Poprowadź swój klub koszykarski online: mecze transmitowane na żywo, liga 10 menedżerów, treningi, transfery na aukcjach. Za darmo, w przeglądarce." },
  el: { title: "Hoop Manager · Online παιχνίδι μάνατζερ μπάσκετ", description: "Διοίκησε τη δική σου ομάδα μπάσκετ online: αγώνες σε ζωντανή μετάδοση, λίγκα 10 μάνατζερ, προπονήσεις, μεταγραφές με δημοπρασίες. Δωρεάν, στον browser." },
  lt: { title: "Hoop Manager · Internetinis krepšinio vadybos žaidimas", description: "Vadovauk savo krepšinio klubui internete: rungtynės tiesiogiai, 10 vadybininkų lyga, treniruotės, perėjimai aukcionuose. Nemokamai, naršyklėje." },
  zh: { title: "Hoop Manager · 在线篮球经理游戏", description: "在线经营你的篮球俱乐部：比赛实时直播，10 位经理同场竞技的联赛，训练，拍卖转会。免费，浏览器即可游玩。" },
};

// ---------------------------------------------------------------------
// Anglais
// ---------------------------------------------------------------------
const en = {
  leJeu: ({ cta }) => ({
    title: "The game: online basketball manager",
    description: "Hoop Manager is a free basketball club management game in your browser: matches broadcast live, a league of managers, training, tactics, transfer auctions.",
    body: `<article class="page">
<h1>A basketball club to run, in real time</h1>
<p class="lead">Hoop Manager is a free basketball management game you play in your browser, on a computer or on your phone. You don't control the players: you're the manager. You build the squad, prepare the matches, handle the club's money… then watch your team play, live, against the other managers' teams.</p>

<h2>A real calendar, matches at fixed times</h2>
<p>The game never stops: matches are played at their scheduled time, whether you're online or not. A season lasts eleven weeks. The league takes up the first nine, with two matchdays a week, on Tuesday and Saturday at 8 pm. The top four then meet in the playoffs for two weeks (semi-finals then final, best of three), on Tuesday, Thursday and Saturday, while the bottom teams fight to avoid relegation. Alongside, a knockout cup is played every Thursday. Every Sunday night, the club collects its revenue, pays its wages and the players improve thanks to training.</p>
<p>This slow pace is deliberate: a few minutes a day are enough to run your club well, and every match really counts.</p>

<h2>Matches are watched live</h2>
<p>Every game is simulated play by play and broadcast in real time: scoreboard, play-by-play, shot chart, each player's stats and the full box score. A pre-game show presents the matchup a few minutes before tip-off, and a halftime show sums things up at the break. You can join a game in progress, but never speed it up or replay it: just like real basketball, the result comes in only once.</p>

<h2>Preparing every match</h2>
<p>Before each matchday, you give your <a href="/guide/ordres">orders</a>: the starting five, the rotation and everyone's minutes, the offensive system, the defense (man-to-man, zone, press…), the pace and the opposing players to keep an eye on. You can prepare several matchdays in advance and save up to three complete <a href="/guide/tactiques">tactics</a> to apply them in one click. The more your team runs a system, the better it masters it: that's <a href="/guide/connaissance">tactical knowledge</a>.</p>
<p>To prepare a match properly, <a href="/guide/scoutisme">scouting</a> analyzes the opponent: its usual strategies, its shooting zones, its key players and the best way to beat it.</p>

<h2>Developing your players</h2>
<p>Every player has <a href="/guide/caracs">attributes</a> rated from 0 to 99 (outside shooting, passing, rebounding, defense, athleticism…) and a <a href="/guide/potentiel">potential</a> that sets how far he can go. Weekly training, playing time and age make these ratings change. You also need to watch <a href="/guide/forme">fitness, motivation and injuries</a>, and the group's <a href="/guide/alchimie">chemistry</a>: a five that plays together often ends up finding each other better.</p>

<h2>Running a club, not just a team</h2>
<p>Success on the court also depends on what happens behind the scenes. The <a href="/guide/marche">transfer market</a> works through real-time auctions against the other managers. The staff (assistant coaches, doctor, physio, scouts) brings valuable bonuses. The <a href="/guide/academie">academy</a> lets you spot youngsters aged 15 to 17 and turn them into tomorrow's stars. On the financial side, the <a href="/guide/salle">arena</a> and ticket prices, <a href="/guide/sponsors">sponsors</a>, the shop and the <a href="/guide/humeur">fans' mood</a> determine the budget available for signings.</p>

<h2>A real league of managers</h2>
<p>Each league brings together up to ten human managers, completed by clubs run by the computer. Standings, playoffs, promotion and relegation: the league lives to the rhythm of all its participants. You can also set up <a href="/guide/amicaux">friendlies</a> on rest days and create <a href="/guide/lp">private leagues</a> with friends. A Discord server lets you chat with the other managers.</p>

<h2>Free, nothing to install</h2>
<p>Hoop Manager is played entirely in the browser. It can also be installed like an app on your phone's home screen. The game is free; some convenience features are offered in a <a href="/guide/premium">Premium</a> plan, with no sporting advantage whatsoever, and a few optional bonuses can be unlocked by watching an ad.</p>
${cta()}
</article>`,
  }),

  faq: ({ CONTACT_EMAIL }) => [
    ["Is Hoop Manager free?", "Yes. The game is entirely playable for free. An optional Premium plan adds convenience (six saved tactics instead of three, unlimited Scouting Pro, private leagues, custom jerseys, no ads…), with no sporting advantage whatsoever: no faster progression, no money, no extra staff."],
    ["Do I need to install anything?", "No, everything happens in the browser, on a computer, tablet or phone. On a phone, you can add the game to your home screen to open it like an app."],
    ["Do I need to be online during matches?", "No. Matches are played at their scheduled time, whether you're there or not, with the orders you confirmed. If you haven't prepared anything, the team plays with your latest settings."],
    ["How much time does it take?", "A few minutes a day are enough: check your players' fitness, prepare the orders for the next match, keep an eye on the market. Enthusiasts can spend much more time on it, especially watching matches live."],
    ["When are the matches played?", "The league is played on Tuesday and Saturday at 8 pm for nine weeks, followed by two weeks of playoffs (Tuesday, Thursday and Saturday). The cup is played on Thursday. Times are given in Paris time."],
    ["Who do I play against?", "Each league has up to ten human managers, completed by clubs run by the computer. You can also offer friendlies to any club on rest days, or create a private league with your friends."],
    ["How do I sign new players?", "Through the transfer market, where every player up for sale is fought over in real-time auctions, or through the youth academy, which brings in prospects aged 15 to 17 thanks to your scouts."],
    ["What happens if my club runs out of money?", "A budget that stays below the warning threshold for too long ends up putting the whole squad up for forced sale: the game warns you beforehand, and the Finances tab lets you keep an eye on the wage bill. Revenue comes from ticketing, TV rights, sponsors and the shop."],
    ["Why are there ads?", "Ads pay for the game's hosting. They only appear in a few specific places: a short break during the pre-game and halftime shows, and an optional ad you can watch to unlock a scouting report. They never interrupt the action of a match, and Premium subscribers see none at all."],
    ["I forgot my password, what should I do?", `On the home page, "Log in" tab, click "Forgot your password?": a link to choose a new one is sent to your account's address (valid for 1 hour). Didn't get it? Write to us on the game's Discord server or at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from your account's address.`],
    ["How do I delete my account?", "In the game: Settings → My account → \"Delete my account\". Your account is erased and your club is handed over to the AI."],
    ["Is the game available in other languages?", "Yes: the game, emails and notifications are available in French, English, Italian, Spanish, Portuguese, German, Polish, Greek, Lithuanian and Chinese (this site too, with long pages like this one in English for the last seven). Change the language in the game's Settings or with the language menu at the top of the site."],
  ],
  faqPage: ({ list, cta }) => ({
    title: "Frequently asked questions",
    description: "Answers to the most frequently asked questions about Hoop Manager: price, match times, time commitment, signings, ads, account.",
    body: `<div class="page"><h1>Frequently asked questions</h1>
<p class="lead">Answers to the questions we're asked most often. Missing an answer? <a href="/contact">Write to us</a>.</p>
${list}
${cta()}</div>`,
  }),

  aPropos: ({ CONTACT_EMAIL, cta }) => ({
    title: "About",
    description: "Hoop Manager is an independent basketball management game, developed in France by an enthusiast, with the help of its community of managers.",
    body: `<article class="page"><h1>About Hoop Manager</h1>
<p class="lead">Hoop Manager is an independent game, developed in France by a basketball fan, for basketball fans.</p>
<h2>Why this game</h2>
<p>The idea came from a simple wish: to rediscover the fun of the sports management games of the past, where every decision matters and you can't wait for the next match, but with matches you can watch live and a league shared with real opponents.</p>
<p>The match engine simulates every possession, taking into account the players' attributes, their fitness, the chosen tactics and how well the team masters its system. The result is never written in advance: a good game plan can topple an opponent that looks stronger on paper.</p>
<h2>A game built with its community</h2>
<p>Hoop Manager is constantly evolving. Many of the new features (friendlies, sponsors, saved tactics, pre-game shows…) come straight from the ideas and feedback of the managers on the game's Discord server. New features are presented in the <a href="/guide">guide</a>.</p>
<h2>Contact us</h2>
<p>A question, a bug, an idea? Write to us at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> or find us on Discord. See also the <a href="/contact">Contact</a> page.</p>
${cta()}</article>`,
  }),

  contact: ({ CONTACT_EMAIL, discordInvite, esc }) => ({
    title: "Contact",
    description: "Contact the Hoop Manager team: email and Discord server.",
    body: `<article class="page"><h1>Contact</h1>
<p class="lead">A question about the game, a bug to report, an account problem or an idea for an improvement: we read everything.</p>
<h2>By email</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. For a question about your account, write from the address you signed up with and include your club's name.</p>
<h2>On Discord</h2>
<p>${discordInvite ? `The <a href="${esc(discordInvite)}" rel="noopener">Hoop Manager Discord server</a>` : "The Hoop Manager Discord server"} is the quickest way to get help: other managers share their tips there, and new features are announced there first.</p>
<h2>Before writing</h2>
<p>The answer may already be in the <a href="/faq">FAQ</a> or in the <a href="/guide">game guide</a>.</p>
</article>`,
  }),

  confidentialite: ({ CONTACT_EMAIL, PUBLISHER_NAME }) => ({
    title: "Privacy policy",
    description: "What data Hoop Manager collects, why, for how long, and how to exercise your rights. Information about advertising and cookies.",
    body: `<article class="page"><h1>Privacy policy</h1>
<p class="lead">Last updated: 28 September 2026. This is a translation; the French version is the reference.</p>
<h2>Data controller</h2>
<p>The hoop-manager.com site and the Hoop Manager game are published by ${PUBLISHER_NAME}, who can be reached at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<h2>Data collected</h2>
<ul>
<li><b>Account</b>: email address and password (only ever stored in encrypted form, never in plain text), or Discord ID and username if you sign up with Discord; the name of the club you chose; creation and last login dates.</li>
<li><b>Game data</b>: everything you do in the game (orders, transfers, messages sent to other managers…), required for it to work.</li>
<li><b>Browser local storage</b>: a login token and your preferences (language, theme) are saved in your browser to keep you logged in. A "hm-lang" cookie remembers the language of the site's pages.</li>
<li><b>Technical logs</b>: the host records requests (IP address, date, page requested) for security and for the service to run properly.</li>
<li><b>Anti-cheating</b>: an encrypted fingerprint of the IP address (never the address itself) is kept with the account's last 5 logins, to spot multiple accounts; transfers between managers' clubs are logged (price, estimated value of the player) to spot rigged sales.</li>
</ul>
<h2>Why</h2>
<p>This data is used only to run the game (logging you in, saving your club, playing the matches) and to reply to you when you write to us. Legal basis: performance of the service you requested by creating an account. Your email address is never sold or used for marketing.</p>
<h2>Advertising and cookies</h2>
<p>The site displays ads provided by <b>Google AdSense</b>. Google and its partners may use cookies or similar identifiers to serve ads, measure their effectiveness and, with your consent, personalize them based on your visits to this site and other sites. On your first visit from the European Economic Area, the United Kingdom or Switzerland, a message lets you accept, refuse or choose these uses; refusing does not stop you from playing. You can change your choice at any time via the consent management link offered by that message.</p>
<p>To find out more about how Google uses this data: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">policies.google.com/technologies/partner-sites</a>. You can also turn off personalized advertising in <a href="https://adssettings.google.com" rel="noopener">Google's ad settings</a>.</p>
<h2>Recipients and hosting</h2>
<p>The data is hosted by Render Services, Inc. (game servers) and Upstash, Inc. (database), and may therefore be processed outside the European Union, under the safeguards provided by these providers (standard contractual clauses). Discord receives the necessary information if you choose to log in with Discord. Google receives the data described above for advertising.</p>
<h2>Retention period</h2>
<p>You can delete your account yourself at any time in the game (Settings → My account → Delete my account): the account is erased and the club is handed over to the AI. After 45 days without any visit, the club is handed over to the AI; it will be given back to you on your next login if no other manager has taken it over. For a forgotten password, a reset link valid for 1 hour is sent to the account's address (email service: Resend, Inc.).</p>
<p>Account and club data is kept for as long as the account exists. A deleted account is erased along with the data attached to it, except for sporting results already included in the league's history (scores, standings), which do not directly identify you.</p>
<h2>Your rights</h2>
<p>You have the right to access, rectify, erase, restrict, object to and port your data. To exercise these rights, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from your account's address. If you believe your rights are not being respected, you can lodge a complaint with the CNIL, the French data protection authority (<a href="https://www.cnil.fr" rel="noopener">cnil.fr</a>).</p>
<h2>Minors</h2>
<p>The game is open to everyone. If you are under 15, ask a parent for permission before creating an account.</p>
</article>`,
  }),

  mentions: ({ CONTACT_EMAIL, PUBLISHER_NAME }) => ({
    title: "Legal notice",
    description: "Legal notice for the hoop-manager.com site: publisher, host, intellectual property.",
    body: `<article class="page"><h1>Legal notice</h1>
<h2>Site publisher</h2>
<p>${PUBLISHER_NAME}<br>Email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br>Publication director: ${PUBLISHER_NAME}</p>
<h2>Hosting</h2>
<p>Render Services, Inc., San Francisco, California, United States. Website: <a href="https://render.com" rel="noopener">render.com</a>.<br>Database: Upstash, Inc. Website: <a href="https://upstash.com" rel="noopener">upstash.com</a>.</p>
<h2>Intellectual property</h2>
<p>The Hoop Manager game, its name, logo, texts and visuals are protected. Any reproduction without permission is prohibited. The clubs, players and competitions in the game are fictional: any resemblance to real people or clubs is purely coincidental.</p>
<h2>Personal data</h2>
<p>See the <a href="/confidentialite">privacy policy</a>.</p>
</article>`,
  }),
};

// ---------------------------------------------------------------------
// Italien (tutoiement, comme la page d'accueil ; glossaire de it.js)
// ---------------------------------------------------------------------
const it = {
  leJeu: ({ cta }) => ({
    title: "Il gioco: manager di basket online",
    description: "Hoop Manager è un gioco gratuito di gestione di un club di basket, nel browser: partite trasmesse in diretta, lega di manager, allenamento, tattica, aste di mercato.",
    body: `<article class="page">
<h1>Un club di basket da guidare, in tempo reale</h1>
<p class="lead">Hoop Manager è un gioco manageriale di basket gratuito che si gioca nel browser, sul computer come sul telefono. Non controlli i giocatori: sei il manager. Costruisci la rosa, prepari le partite, gestisci i soldi del club… e poi guardi la tua squadra giocare, in diretta, contro quelle degli altri manager.</p>

<h2>Un calendario reale, partite a orario fisso</h2>
<p>Il gioco non si ferma mai: le partite si giocano all'ora prevista, che tu sia connesso o no. Una stagione dura undici settimane. Il campionato occupa le prime nove, con due giornate a settimana, il martedì e il sabato alle 20. Le prime quattro si ritrovano poi nei playoff per due settimane (semifinali e finale, al meglio delle tre partite), il martedì, il giovedì e il sabato, mentre le ultime lottano per la salvezza. In parallelo, ogni giovedì si gioca una coppa a eliminazione diretta. Ogni notte tra domenica e lunedì il club incassa le entrate, paga gli stipendi e i giocatori migliorano grazie all'allenamento.</p>
<p>Questo ritmo lento è voluto: bastano pochi minuti al giorno per gestire bene il tuo club, e ogni partita conta davvero.</p>

<h2>Le partite si guardano in diretta</h2>
<p>Ogni partita è simulata azione per azione e trasmessa in tempo reale: tabellone, cronaca, mappa dei tiri, statistiche di ogni giocatore e tabellino completo. Una trasmissione pre-partita presenta la sfida qualche minuto prima della palla a due, e una trasmissione all'intervallo fa il punto a metà gara. Puoi entrare in una partita già iniziata, ma mai accelerarla né rigiocarla: come nel basket vero, il risultato arriva una volta sola.</p>

<h2>Preparare ogni partita</h2>
<p>Prima di ogni giornata dai i tuoi <a href="/guide/ordres">ordini</a>: il quintetto iniziale, le rotazioni e il minutaggio di ciascuno, il sistema offensivo, la difesa (a uomo, a zona, pressing…), il ritmo e i giocatori avversari da tenere d'occhio. Puoi preparare più giornate in anticipo e salvare fino a tre <a href="/guide/tactiques">tattiche</a> complete da applicare con un clic. Più la tua squadra ripete un sistema, meglio lo padroneggia: è la <a href="/guide/connaissance">conoscenza tattica</a>.</p>
<p>Per preparare bene una partita, lo <a href="/guide/scoutisme">scouting</a> analizza l'avversario: le sue strategie abituali, le sue zone di tiro, i suoi giocatori chiave e il modo migliore per batterlo.</p>

<h2>Far crescere i tuoi giocatori</h2>
<p>Ogni giocatore ha delle <a href="/guide/caracs">caratteristiche</a> valutate da 0 a 99 (tiro da fuori, passaggio, rimbalzo, difesa, atletismo…) e un <a href="/guide/potentiel">potenziale</a> che fissa fin dove può arrivare. L'allenamento settimanale, il minutaggio e l'età fanno evolvere questi valori. Devi anche tenere d'occhio <a href="/guide/forme">condizione fisica, motivazione e infortuni</a>, e l'<a href="/guide/alchimie">intesa</a> del gruppo: un quintetto che gioca spesso insieme finisce per trovarsi meglio.</p>

<h2>Gestire un club, non solo una squadra</h2>
<p>Il successo sportivo dipende anche da ciò che succede dietro le quinte. Il <a href="/guide/marche">mercato</a> funziona con aste in tempo reale contro gli altri manager. Lo staff (vice allenatori, medico, fisioterapista, osservatori) porta bonus preziosi. Il <a href="/guide/academie">vivaio</a> ti permette di scoprire ragazzi dai 15 ai 17 anni e farne le stelle di domani. Sul fronte finanziario, il <a href="/guide/salle">palazzetto</a> e il prezzo dei biglietti, gli <a href="/guide/sponsors">sponsor</a>, il negozio e l'<a href="/guide/humeur">umore dei tifosi</a> determinano il budget disponibile per il mercato.</p>

<h2>Una vera lega di manager</h2>
<p>Ogni lega riunisce fino a dieci manager umani, completati da club gestiti dal computer. Classifica, playoff, promozioni e retrocessioni: il campionato vive al ritmo di tutti i partecipanti. Puoi anche organizzare <a href="/guide/amicaux">amichevoli</a> nei giorni di riposo e creare <a href="/guide/lp">leghe private</a> con gli amici. Un server Discord ti permette di confrontarti con gli altri manager.</p>

<h2>Gratis, senza installazione</h2>
<p>Hoop Manager si gioca interamente nel browser. Si installa anche come un'app sulla schermata Home del telefono. Il gioco è gratuito; alcune funzioni di comodità sono proposte in un piano <a href="/guide/premium">Premium</a>, senza alcun vantaggio sportivo, e alcuni bonus facoltativi si sbloccano guardando una pubblicità.</p>
${cta()}
</article>`,
  }),

  faq: ({ CONTACT_EMAIL }) => [
    ["Hoop Manager è gratuito?", "Sì. Il gioco si può giocare interamente gratis. Un piano Premium facoltativo aggiunge comodità (sei tattiche salvate invece di tre, Scouting Pro illimitato, leghe private, maglie personalizzate, nessuna pubblicità…), senza alcun vantaggio sportivo: niente progressi più rapidi, niente soldi, niente staff in più."],
    ["Bisogna installare qualcosa?", "No, tutto avviene nel browser, su computer, tablet o telefono. Sul telefono puoi aggiungere il gioco alla schermata Home per aprirlo come un'app."],
    ["Devo essere connesso durante le partite?", "No. Le partite si giocano all'ora prevista, che tu ci sia o no, con gli ordini che hai confermato. Se non hai preparato nulla, la squadra gioca con le tue ultime impostazioni."],
    ["Quanto tempo bisogna dedicarci?", "Bastano pochi minuti al giorno: controllare la condizione fisica dei giocatori, preparare gli ordini della prossima partita, seguire il mercato. Gli appassionati possono passarci molto più tempo, soprattutto guardando le partite in diretta."],
    ["Quando si giocano le partite?", "Il campionato si gioca il martedì e il sabato alle 20 per nove settimane, poi arrivano due settimane di playoff (martedì, giovedì e sabato). La coppa si gioca il giovedì. Gli orari sono indicati all'ora di Parigi (la stessa dell'Italia)."],
    ["Contro chi gioco?", "Ogni lega conta fino a dieci manager umani, completati da club gestiti dal computer. Puoi anche proporre amichevoli a qualsiasi club nei giorni di riposo, o creare una lega privata con i tuoi amici."],
    ["Come si ingaggiano nuovi giocatori?", "Sul mercato, dove tutti i giocatori messi in vendita si contendono con aste in tempo reale, oppure con il settore giovanile, che fa emergere promesse dai 15 ai 17 anni grazie ai tuoi osservatori."],
    ["Cosa succede se il mio club resta senza soldi?", "Un budget che resta troppo a lungo sotto la soglia di allerta finisce per mettere tutta la rosa in vendita forzata: il gioco ti avvisa prima, e la scheda Economia permette di tenere d'occhio il monte ingaggi. Le entrate arrivano da biglietteria, diritti TV, sponsor e negozio."],
    ["Perché ci sono pubblicità?", "Le pubblicità pagano l'hosting del gioco. Compaiono solo in pochi punti precisi: una breve pausa durante le trasmissioni pre-partita e dell'intervallo, e una pubblicità facoltativa da guardare per sbloccare un rapporto di scouting. Non interrompono mai l'azione di una partita, e gli abbonati Premium non ne vedono nessuna."],
    ["Ho dimenticato la password, cosa faccio?", `Nella pagina iniziale, scheda « Accedi », clicca su « Password dimenticata? »: un link per sceglierne una nuova viene inviato all'indirizzo del tuo account (valido 1 ora). Non l'hai ricevuto? Scrivici sul server Discord del gioco o a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> dall'indirizzo del tuo account.`],
    ["Come elimino il mio account?", "Nel gioco: Impostazioni → Il mio account → « Elimina il mio account ». Il tuo account viene cancellato e il tuo club viene affidato all'IA."],
    ["Il gioco esiste in altre lingue?", "Sì: il gioco, le email e le notifiche sono disponibili in francese, inglese, italiano, spagnolo, portoghese, tedesco, polacco, greco, lituano e cinese (anche questo sito, con le pagine lunghe come questa in inglese per le ultime sette). Cambia lingua nelle Impostazioni del gioco o con il menu delle lingue in alto nel sito."],
  ],
  faqPage: ({ list, cta }) => ({
    title: "Domande frequenti",
    description: "Le risposte alle domande più frequenti su Hoop Manager: prezzo, orari delle partite, tempo da dedicare, mercato, pubblicità, account.",
    body: `<div class="page"><h1>Domande frequenti</h1>
<p class="lead">Le risposte alle domande che ci fanno più spesso. Ti manca una risposta? <a href="/contact">Scrivici</a>.</p>
${list}
${cta()}</div>`,
  }),

  aPropos: ({ CONTACT_EMAIL, cta }) => ({
    title: "Chi siamo",
    description: "Hoop Manager è un gioco manageriale di basket indipendente, sviluppato in Francia da un appassionato, con l'aiuto della sua comunità di manager.",
    body: `<article class="page"><h1>Chi siamo: Hoop Manager</h1>
<p class="lead">Hoop Manager è un gioco indipendente, sviluppato in Francia da un appassionato di basket, per gli appassionati di basket.</p>
<h2>Perché questo gioco</h2>
<p>L'idea nasce da un desiderio semplice: ritrovare il piacere dei giochi manageriali sportivi di una volta, dove ogni decisione conta e si aspetta la partita successiva con impazienza, ma con partite da guardare in diretta e una lega condivisa con avversari veri.</p>
<p>Il motore di gioco simula ogni possesso tenendo conto delle caratteristiche dei giocatori, della loro condizione fisica, della tattica scelta e di quanto la squadra padroneggia il suo sistema. Il risultato non è mai scritto in anticipo: un buon piano partita può ribaltare un avversario più forte sulla carta.</p>
<h2>Un gioco costruito con la sua comunità</h2>
<p>Hoop Manager si evolve continuamente. Gran parte delle novità (amichevoli, sponsor, tattiche salvate, trasmissioni pre-partita…) nasce direttamente dalle idee e dai commenti dei manager sul server Discord del gioco. Le novità sono presentate nella <a href="/guide">guida</a>.</p>
<h2>Contattaci</h2>
<p>Una domanda, un bug, un'idea? Scrivici a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> o trovaci su Discord. Vedi anche la pagina <a href="/contact">Contatti</a>.</p>
${cta()}</article>`,
  }),

  contact: ({ CONTACT_EMAIL, discordInvite, esc }) => ({
    title: "Contatti",
    description: "Contatta la squadra di Hoop Manager: email e server Discord.",
    body: `<article class="page"><h1>Contatti</h1>
<p class="lead">Una domanda sul gioco, un bug da segnalare, un problema con l'account o un'idea per migliorare: leggiamo tutto.</p>
<h2>Per email</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Per una domanda sul tuo account, scrivi dall'indirizzo usato all'iscrizione e indica il nome del tuo club.</p>
<h2>Su Discord</h2>
<p>${discordInvite ? `Il <a href="${esc(discordInvite)}" rel="noopener">server Discord di Hoop Manager</a>` : "Il server Discord di Hoop Manager"} è il modo più rapido per ricevere aiuto: gli altri manager ci condividono i loro consigli, e le novità vengono annunciate lì per prime.</p>
<h2>Prima di scrivere</h2>
<p>La risposta forse si trova già nelle <a href="/faq">FAQ</a> o nella <a href="/guide">guida del gioco</a>.</p>
</article>`,
  }),

  confidentialite: ({ CONTACT_EMAIL, PUBLISHER_NAME }) => ({
    title: "Informativa sulla privacy",
    description: "Quali dati raccoglie Hoop Manager, perché, per quanto tempo e come esercitare i tuoi diritti. Informazioni su pubblicità e cookie.",
    body: `<article class="page"><h1>Informativa sulla privacy</h1>
<p class="lead">Ultimo aggiornamento: 28 settembre 2026. Questa è una traduzione; fa fede la versione francese.</p>
<h2>Titolare del trattamento</h2>
<p>Il sito hoop-manager.com e il gioco Hoop Manager sono pubblicati da ${PUBLISHER_NAME}, raggiungibile all'indirizzo <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<h2>Dati raccolti</h2>
<ul>
<li><b>Account</b>: indirizzo email e password (conservata solo in forma cifrata, mai in chiaro), oppure ID e nome utente Discord se ti iscrivi con Discord; nome del club scelto; date di creazione e dell'ultimo accesso.</li>
<li><b>Dati di gioco</b>: tutto ciò che fai nel gioco (ordini, trasferimenti, messaggi inviati agli altri manager…), necessario al suo funzionamento.</li>
<li><b>Memoria locale del browser</b>: un token di accesso e le tue preferenze (lingua, tema) sono salvati nel tuo browser per mantenerti connesso. Un cookie « hm-lang » ricorda la lingua delle pagine del sito.</li>
<li><b>Log tecnici</b>: l'hosting registra le richieste (indirizzo IP, data, pagina richiesta) per la sicurezza e il buon funzionamento del servizio.</li>
<li><b>Lotta contro gli imbrogli</b>: un'impronta cifrata dell'indirizzo IP (mai l'indirizzo stesso) viene conservata con gli ultimi 5 accessi dell'account, per individuare gli account multipli; i trasferimenti tra club di manager sono registrati (prezzo, valore stimato del giocatore) per individuare le vendite combinate.</li>
</ul>
<h2>Perché</h2>
<p>Questi dati servono unicamente a far funzionare il gioco (farti accedere, salvare il tuo club, far giocare le partite) e a risponderti quando ci scrivi. Base giuridica: l'esecuzione del servizio che hai richiesto creando un account. Il tuo indirizzo email non viene mai venduto né usato per scopi commerciali.</p>
<h2>Pubblicità e cookie</h2>
<p>Il sito mostra pubblicità fornite da <b>Google AdSense</b>. Google e i suoi partner possono usare cookie o identificatori simili per mostrare gli annunci, misurarne l'efficacia e, con il tuo consenso, personalizzarli in base alle tue visite a questo sito e ad altri siti. Alla prima visita dallo Spazio economico europeo, dal Regno Unito o dalla Svizzera, un messaggio ti permette di accettare, rifiutare o scegliere questi utilizzi; rifiutare non ti impedisce di giocare. Puoi cambiare la tua scelta in qualsiasi momento tramite il link di gestione del consenso proposto da quel messaggio.</p>
<p>Per saperne di più su come Google usa questi dati: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener">policies.google.com/technologies/partner-sites</a>. Puoi anche disattivare la pubblicità personalizzata nelle <a href="https://adssettings.google.com" rel="noopener">impostazioni degli annunci Google</a>.</p>
<h2>Destinatari e hosting</h2>
<p>I dati sono ospitati da Render Services, Inc. (server del gioco) e Upstash, Inc. (database), e possono quindi essere trattati al di fuori dell'Unione europea, con le garanzie previste da questi fornitori (clausole contrattuali tipo). Discord riceve le informazioni necessarie se scegli l'accesso con Discord. Google riceve i dati descritti sopra per la pubblicità.</p>
<h2>Periodo di conservazione</h2>
<p>Puoi eliminare il tuo account da solo in qualsiasi momento nel gioco (Impostazioni → Il mio account → Elimina il mio account): l'account viene cancellato e il club affidato all'IA. Dopo 45 giorni senza alcuna visita, il club viene affidato all'IA; ti verrà restituito al prossimo accesso se nel frattempo nessun altro manager l'ha preso. Per una password dimenticata, un link di reimpostazione valido 1 ora viene inviato all'indirizzo dell'account (servizio di invio: Resend, Inc.).</p>
<p>I dati dell'account e del club sono conservati finché l'account esiste. Un account eliminato viene cancellato insieme ai dati collegati, tranne i risultati sportivi già inseriti nella storia della lega (punteggi, classifiche), che non permettono di identificarti direttamente.</p>
<h2>I tuoi diritti</h2>
<p>Hai diritto di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità dei tuoi dati. Per esercitarli, scrivi a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> dall'indirizzo del tuo account. Se ritieni che i tuoi diritti non siano rispettati, puoi rivolgerti alla CNIL, l'autorità francese per la protezione dei dati (<a href="https://www.cnil.fr" rel="noopener">cnil.fr</a>), o al Garante per la protezione dei dati personali.</p>
<h2>Minori</h2>
<p>Il gioco è aperto a tutti. Se hai meno di 15 anni, chiedi il permesso a un genitore prima di creare un account.</p>
</article>`,
  }),

  mentions: ({ CONTACT_EMAIL, PUBLISHER_NAME }) => ({
    title: "Note legali",
    description: "Note legali del sito hoop-manager.com: editore, hosting, proprietà intellettuale.",
    body: `<article class="page"><h1>Note legali</h1>
<h2>Editore del sito</h2>
<p>${PUBLISHER_NAME}<br>Email: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a><br>Direttore della pubblicazione: ${PUBLISHER_NAME}</p>
<h2>Hosting</h2>
<p>Render Services, Inc., San Francisco, California, Stati Uniti. Sito: <a href="https://render.com" rel="noopener">render.com</a>.<br>Database: Upstash, Inc. Sito: <a href="https://upstash.com" rel="noopener">upstash.com</a>.</p>
<h2>Proprietà intellettuale</h2>
<p>Il gioco Hoop Manager, il suo nome, il logo, i testi e le immagini sono protetti. È vietata qualsiasi riproduzione senza autorizzazione. I club, i giocatori e le competizioni del gioco sono immaginari: qualsiasi somiglianza con persone o club reali è puramente casuale.</p>
<h2>Dati personali</h2>
<p>Vedi l'<a href="/confidentialite">informativa sulla privacy</a>.</p>
</article>`,
  }),
};

module.exports = { UI, LANDING, PAGES: { en, it } };
