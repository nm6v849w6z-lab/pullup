"use strict";

// =====================================================================
// NOTIFICATIONS (Premium, liste de la nuit du 2026-09-28 : « notifications
// sur mobile : fin d'enchère, blessure, match qui commence »). Abonnements
// Web Push rangés sur le club (Team.pushSubscriptions, 5 appareils au plus)
// ; à chaque sauvegarde d'un championnat (server/index.js:persistContext,
// server/world.js:catchUpWorld), flushLeague envoie aux clubs Premium :
//  - le coup d'envoi d'un de leurs matchs en direct (15 premières minutes) ;
//  - les nouvelles entrées du fil d'actualité « à notifier » : blessure
//    (injury_…), fin d'enchère proche d'un joueur suivi (mkt_end_…),
//    arrivée ou départ d'un joueur (push: true) ;
//  - les enchères du club, joueurs ET staff (entraîneur, adjoint, analyste,
//    recruteur, médecin, kiné) : fin dans moins d'une heure (en tête ou
//    dépassé), puis résultat (staff remporté, enchère perdue, annulée faute
//    de budget) — retour utilisateur 2026-09-29 ; et « Enchère dépassée »
//    à chaque surenchère d'un autre club (y compris sur une annonce d'un
//    autre championnat), qui ouvre « Mes enchères » (/#encheres).
// Sans clés VAPID (server/webpush.js), rien n'est envoyé ni modifié.
// =====================================================================

const WebPush = require("./webpush.js");

const MAX_SUBSCRIPTIONS = 5;
const KICKOFF_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_FLUSH = 4;

function isPremium(team, now) {
  return typeof team.hasActivePremium === "function" ? team.hasActivePremium(now) : !!team.isPaying;
}

// `lang` (fr / en / it / es / pt / de / pl / el / lt / zh) : langue des notifications de CET appareil (celle
// du compte, sinon celle du jeu dans ce navigateur, voir /api/push/subscribe).
const PUSH_LANGS = ["fr", "en", "it", "es", "pt", "de", "pl", "el", "lt", "zh"];

function addSubscription(team, sub, now, lang = null) {
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  team.pushSubscriptions = (team.pushSubscriptions || []).filter(x => x.endpoint !== sub.endpoint);
  team.pushSubscriptions.push({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, createdAt: now, ...(PUSH_LANGS.includes(lang) ? { lang } : {}) });
  team.pushSubscriptions = team.pushSubscriptions.slice(-MAX_SUBSCRIPTIONS);
  if (typeof team.pushCursor !== "number") team.pushCursor = team.feed ? (team.feed.nextId || 1) - 1 : 0;
  if (typeof team.pushSince !== "number") team.pushSince = now;
  return true;
}

function removeSubscription(team, endpoint) {
  const before = (team.pushSubscriptions || []).length;
  team.pushSubscriptions = (team.pushSubscriptions || []).filter(x => x.endpoint !== endpoint);
  return team.pushSubscriptions.length !== before;
}

// Marché → rôle du staff (null : joueurs). Libellés par langue dans STAFF.
const AUCTION_MARKETS = [
  ["transferListings", null],
  ["coachListings", "coach"],
  ["assistantCoachListings", "assistant"],
  ["analystListings", "analyst"],
  ["recruiterListings", "recruiter"],
  ["doctorListings", "doctor"],
  ["physioListings", "physio"],
];

// ---------------------------------------------------------------------
// Textes des notifications par langue (2026-09-30 : fr / en / it, puis es / pt / de / pl / el / lt / zh). Chaque
// note garde son texte français (title / body) et sa recette (`msg` : id +
// paramètres) ; localizeNote la réécrit dans la langue de l'appareil
// destinataire (langue enregistrée avec l'abonnement, voir addSubscription).
// Les entrées du fil (blessure, arrivée…) sont traduites par le
// dictionnaire du jeu (server/i18n.js). Vocabulaire : glossaire de
// assets/i18n/it.js (asta, offerta, vice allenatore, osservatore…).
// ---------------------------------------------------------------------
const STAFF = {
  fr: { coach: "l'entraîneur", assistant: "l'entraîneur adjoint", analyst: "l'analyste vidéo", recruiter: "le recruteur", doctor: "le médecin", physio: "le kiné" },
  en: { coach: "the coach", assistant: "the assistant coach", analyst: "the video analyst", recruiter: "the scout", doctor: "the doctor", physio: "the physio" },
  it: { coach: "l'allenatore", assistant: "il vice allenatore", analyst: "il video analista", recruiter: "l'osservatore", doctor: "il medico", physio: "il fisioterapista" },
  es: { coach: "el entrenador", assistant: "el entrenador asistente", analyst: "el analista de vídeo", recruiter: "el ojeador", doctor: "el médico", physio: "el fisioterapeuta" },
  pt: { coach: "o treinador", assistant: "o auxiliar técnico", analyst: "o analista de vídeo", recruiter: "o olheiro", doctor: "o médico", physio: "o fisioterapeuta" },
  de: { coach: "der Trainer", assistant: "der Co-Trainer", analyst: "der Videoanalyst", recruiter: "der Scout", doctor: "der Arzt", physio: "der Physiotherapeut" },
  pl: { coach: "trener", assistant: "asystent trenera", analyst: "analityk wideo", recruiter: "skaut", doctor: "lekarz", physio: "fizjoterapeuta" },
  el: { coach: "ο προπονητής", assistant: "ο βοηθός προπονητή", analyst: "ο αναλυτής βίντεο", recruiter: "ο σκάουτερ", doctor: "ο γιατρός", physio: "ο φυσικοθεραπευτής" },
  lt: { coach: "treneris", assistant: "trenerio asistentas", analyst: "vaizdo analitikas", recruiter: "skautas", doctor: "gydytojas", physio: "kineziterapeutas" },
  zh: { coach: "主教练", assistant: "助理教练", analyst: "视频分析师", recruiter: "球探", doctor: "队医", physio: "理疗师" },
};
const WORDS = {
  fr: { level: "niveau", aPlayer: "un joueur", opponent: "votre adversaire", min: "min", h: "h", d: "j" },
  en: { level: "level", aPlayer: "a player", opponent: "your opponent", min: "min", h: "h", d: "d" },
  it: { level: "livello", aPlayer: "un giocatore", opponent: "il tuo avversario", min: "min", h: "h", d: "g" },
  es: { level: "nivel", aPlayer: "un jugador", opponent: "tu rival", min: "min", h: "h", d: "d" },
  pt: { level: "nível", aPlayer: "um jogador", opponent: "seu adversário", min: "min", h: "h", d: "d" },
  de: { level: "Stufe", aPlayer: "ein Spieler", opponent: "dein Gegner", min: "Min", h: "Std", d: "Tage" },
  pl: { level: "poziom", aPlayer: "zawodnik", opponent: "twój rywal", min: "min", h: "h", d: "dni" },
  el: { level: "επίπεδο", aPlayer: "ένας παίκτης", opponent: "ο αντίπαλός σου", min: "min", h: "h", d: "ημέρες" },
  lt: { level: "lygis", aPlayer: "žaidėjas", opponent: "tavo varžovas", min: "min", h: "h", d: "d" },
  zh: { level: "等级", aPlayer: "一名球员", opponent: "你的对手", min: "分钟", h: "小时", d: "天" },
};
const MESSAGES = {
  kickoff: {
    fr: p => ({ title: "Votre match commence !", body: `${p.team} contre ${p.opp} : c'est parti, en direct.` }),
    en: p => ({ title: "Your game is starting!", body: `${p.team} vs ${p.opp}: tip-off, live now.` }),
    it: p => ({ title: "La tua partita sta per iniziare!", body: `${p.team} contro ${p.opp}: si parte, in diretta.` }),
    es: p => ({ title: "¡Tu partido empieza!", body: `${p.team} contra ${p.opp}: arranca el partido, en directo.` }),
    pt: p => ({ title: "Seu jogo está começando!", body: `${p.team} x ${p.opp}: a bola subiu, ao vivo.` }),
    de: p => ({ title: "Dein Spiel beginnt!", body: `${p.team} gegen ${p.opp}: Anpfiff, jetzt live.` }),
    pl: p => ({ title: "Twój mecz się zaczyna!", body: `${p.team} kontra ${p.opp}: startujemy, na żywo.` }),
    el: p => ({ title: "Ο αγώνας σου ξεκινά!", body: `${p.team} εναντίον ${p.opp}: τζάμπολ, ζωντανά τώρα.` }),
    lt: p => ({ title: "Tavo rungtynės prasideda!", body: `${p.team} prieš ${p.opp}: startas, tiesiogiai.` }),
    zh: p => ({ title: "你的比赛开始了！", body: `${p.team} 对阵 ${p.opp}：比赛开始，正在直播。` }),
  },
  autoOutbid: {
    fr: p => ({ title: `Plafond dépassé : ${p.what}`, body: `Votre enchère automatique (jusqu'à ${p.max}) ne suffit plus : offre à ${p.bid}, clôture dans ${p.left}.` }),
    en: p => ({ title: `Max bid exceeded: ${p.what}`, body: `Your automatic bid (up to ${p.max}) is no longer enough: the offer is at ${p.bid}, closing in ${p.left}.` }),
    it: p => ({ title: `Tetto superato: ${p.what}`, body: `La tua offerta automatica (fino a ${p.max}) non basta più: offerta a ${p.bid}, chiusura tra ${p.left}.` }),
    es: p => ({ title: `Tope superado: ${p.what}`, body: `Tu puja automática (hasta ${p.max}) ya no basta: oferta en ${p.bid}, cierre en ${p.left}.` }),
    pt: p => ({ title: `Limite superado: ${p.what}`, body: `Seu lance automático (até ${p.max}) não é mais suficiente: oferta em ${p.bid}, encerramento em ${p.left}.` }),
    de: p => ({ title: `Höchstgebot überschritten: ${p.what}`, body: `Dein automatisches Gebot (bis ${p.max}) reicht nicht mehr: Angebot bei ${p.bid}, Ende in ${p.left}.` }),
    pl: p => ({ title: `Limit przekroczony: ${p.what}`, body: `Twoja automatyczna oferta (do ${p.max}) już nie wystarcza: oferta ${p.bid}, koniec za ${p.left}.` }),
    el: p => ({ title: `Ξεπεράστηκε το όριο: ${p.what}`, body: `Η αυτόματη προσφορά σου (έως ${p.max}) δεν αρκεί πια: προσφορά στα ${p.bid}, λήξη σε ${p.left}.` }),
    lt: p => ({ title: `Viršyta riba: ${p.what}`, body: `Tavo automatinio statymo (iki ${p.max}) nebeužtenka: pasiūlymas ${p.bid}, pabaiga po ${p.left}.` }),
    zh: p => ({ title: `已超出上限：${p.what}`, body: `你的自动出价（最高 ${p.max}）已不够：当前出价 ${p.bid}，${p.left}后截止。` }),
  },
  outbid: {
    fr: p => ({ title: `Enchère dépassée : ${p.what}`, body: `Nouvelle offre à ${p.bid}, clôture dans ${p.left}. Relancez dès ${p.next}.` }),
    en: p => ({ title: `Outbid: ${p.what}`, body: `New offer at ${p.bid}, closing in ${p.left}. Bid again from ${p.next}.` }),
    it: p => ({ title: `Offerta superata: ${p.what}`, body: `Nuova offerta a ${p.bid}, chiusura tra ${p.left}. Rilancia da ${p.next}.` }),
    es: p => ({ title: `Puja superada: ${p.what}`, body: `Nueva oferta de ${p.bid}, cierre en ${p.left}. Vuelve a pujar desde ${p.next}.` }),
    pt: p => ({ title: `Lance superado: ${p.what}`, body: `Nova oferta de ${p.bid}, encerramento em ${p.left}. Dê um novo lance a partir de ${p.next}.` }),
    de: p => ({ title: `Überboten: ${p.what}`, body: `Neues Gebot: ${p.bid}, Ende in ${p.left}. Biete erneut ab ${p.next}.` }),
    pl: p => ({ title: `Przebito twoją ofertę: ${p.what}`, body: `Nowa oferta ${p.bid}, koniec za ${p.left}. Podbij od ${p.next}.` }),
    el: p => ({ title: `Σε ξεπέρασαν: ${p.what}`, body: `Νέα προσφορά στα ${p.bid}, λήξη σε ${p.left}. Ανέβασε από ${p.next}.` }),
    lt: p => ({ title: `Tavo statymas viršytas: ${p.what}`, body: `Naujas pasiūlymas ${p.bid}, pabaiga po ${p.left}. Statyk vėl nuo ${p.next}.` }),
    zh: p => ({ title: `出价被超越：${p.what}`, body: `新出价 ${p.bid}，${p.left}后截止。可从 ${p.next} 起再次加价。` }),
  },
  ending: {
    fr: p => ({ title: `Fin d'enchère dans moins d'une heure : ${p.what}`, body: p.lead ? `Vous êtes en tête à ${p.bid}.` : `Vous avez été dépassé (${p.bid}). Il est encore temps de surenchérir.` }),
    en: p => ({ title: `Auction ends in less than an hour: ${p.what}`, body: p.lead ? `You're leading at ${p.bid}.` : `You've been outbid (${p.bid}). There's still time to raise your bid.` }),
    it: p => ({ title: `L'asta si chiude tra meno di un'ora: ${p.what}`, body: p.lead ? `Sei in testa a ${p.bid}.` : `Sei stato superato (${p.bid}). Hai ancora tempo per rilanciare.` }),
    es: p => ({ title: `La subasta termina en menos de una hora: ${p.what}`, body: p.lead ? `Vas en cabeza con ${p.bid}.` : `Te han superado (${p.bid}). Aún estás a tiempo de subir tu puja.` }),
    pt: p => ({ title: `O leilão termina em menos de uma hora: ${p.what}`, body: p.lead ? `Você está na frente com ${p.bid}.` : `Seu lance foi superado (${p.bid}). Ainda dá tempo de aumentar o lance.` }),
    de: p => ({ title: `Auktion endet in weniger als einer Stunde: ${p.what}`, body: p.lead ? `Du führst mit ${p.bid}.` : `Du wurdest überboten (${p.bid}). Du kannst noch erhöhen.` }),
    pl: p => ({ title: `Aukcja kończy się za mniej niż godzinę: ${p.what}`, body: p.lead ? `Prowadzisz z ofertą ${p.bid}.` : `Przebito twoją ofertę (${p.bid}). Wciąż możesz ją podbić.` }),
    el: p => ({ title: `Η δημοπρασία λήγει σε λιγότερο από μία ώρα: ${p.what}`, body: p.lead ? `Προηγείσαι με ${p.bid}.` : `Σε ξεπέρασαν (${p.bid}). Έχεις ακόμη χρόνο να ανεβάσεις την προσφορά σου.` }),
    lt: p => ({ title: `Aukcionas baigiasi mažiau nei po valandos: ${p.what}`, body: p.lead ? `Pirmauji su ${p.bid}.` : `Tavo statymas viršytas (${p.bid}). Dar spėsi jį padidinti.` }),
    zh: p => ({ title: `拍卖将在一小时内结束：${p.what}`, body: p.lead ? `你以 ${p.bid} 领先。` : `你的出价已被超越（${p.bid}）。现在加价还来得及。` }),
  },
  cancelled: {
    fr: p => ({ title: `Enchère annulée : ${p.what}`, body: "Budget insuffisant au moment de la clôture." }),
    en: p => ({ title: `Auction cancelled: ${p.what}`, body: "Not enough budget when the auction closed." }),
    it: p => ({ title: `Asta annullata: ${p.what}`, body: "Budget insufficiente al momento della chiusura." }),
    es: p => ({ title: `Subasta anulada: ${p.what}`, body: "Presupuesto insuficiente en el momento del cierre." }),
    pt: p => ({ title: `Leilão cancelado: ${p.what}`, body: "Orçamento insuficiente no momento do encerramento." }),
    de: p => ({ title: `Auktion storniert: ${p.what}`, body: "Nicht genug Budget beim Auktionsende." }),
    pl: p => ({ title: `Aukcja anulowana: ${p.what}`, body: "Niewystarczający budżet w chwili zamknięcia aukcji." }),
    el: p => ({ title: `Η δημοπρασία ακυρώθηκε: ${p.what}`, body: "Ανεπαρκής προϋπολογισμός τη στιγμή της λήξης." }),
    lt: p => ({ title: `Aukcionas atšauktas: ${p.what}`, body: "Aukciono pabaigoje nepakako biudžeto." }),
    zh: p => ({ title: `拍卖已取消：${p.what}`, body: "拍卖截止时预算不足。" }),
  },
  won: {
    fr: p => ({ title: `Enchère remportée : ${p.what}`, body: `Recruté pour ${p.price}.` }),
    en: p => ({ title: `Auction won: ${p.what}`, body: `Signed for ${p.price}.` }),
    it: p => ({ title: `Asta vinta: ${p.what}`, body: `Ingaggiato per ${p.price}.` }),
    es: p => ({ title: `Subasta ganada: ${p.what}`, body: `Fichado por ${p.price}.` }),
    pt: p => ({ title: `Leilão vencido: ${p.what}`, body: `Contratado por ${p.price}.` }),
    de: p => ({ title: `Auktion gewonnen: ${p.what}`, body: `Verpflichtet für ${p.price}.` }),
    pl: p => ({ title: `Aukcja wygrana: ${p.what}`, body: `Pozyskany za ${p.price}.` }),
    el: p => ({ title: `Κέρδισες τη δημοπρασία: ${p.what}`, body: `Αποκτήθηκε για ${p.price}.` }),
    lt: p => ({ title: `Aukcionas laimėtas: ${p.what}`, body: `Įsigytas už ${p.price}.` }),
    zh: p => ({ title: `拍卖成功：${p.what}`, body: `以 ${p.price} 签下。` }),
  },
  lost: {
    fr: p => ({ title: `Enchère perdue : ${p.what}`, body: p.price ? `Parti pour ${p.price}.` : "Un autre club a remporté l'enchère." }),
    en: p => ({ title: `Auction lost: ${p.what}`, body: p.price ? `Gone for ${p.price}.` : "Another club won the auction." }),
    it: p => ({ title: `Asta persa: ${p.what}`, body: p.price ? `Ceduto per ${p.price}.` : "Un altro club si è aggiudicato l'asta." }),
    es: p => ({ title: `Subasta perdida: ${p.what}`, body: p.price ? `Se fue por ${p.price}.` : "Otro club se ha llevado la subasta." }),
    pt: p => ({ title: `Leilão perdido: ${p.what}`, body: p.price ? `Saiu por ${p.price}.` : "Outro clube venceu o leilão." }),
    de: p => ({ title: `Auktion verloren: ${p.what}`, body: p.price ? `Weg für ${p.price}.` : "Ein anderer Verein hat die Auktion gewonnen." }),
    pl: p => ({ title: `Aukcja przegrana: ${p.what}`, body: p.price ? `Odszedł za ${p.price}.` : "Inny klub wygrał aukcję." }),
    el: p => ({ title: `Έχασες τη δημοπρασία: ${p.what}`, body: p.price ? `Έφυγε για ${p.price}.` : "Άλλος σύλλογος κέρδισε τη δημοπρασία." }),
    lt: p => ({ title: `Aukcionas pralaimėtas: ${p.what}`, body: p.price ? `Išėjo už ${p.price}.` : "Aukcioną laimėjo kitas klubas." }),
    zh: p => ({ title: `拍卖失利：${p.what}`, body: p.price ? `以 ${p.price} 被签走。` : "另一家俱乐部赢得了拍卖。" }),
  },
};

// Paramètres bruts → textes dans la langue : { money: n } → montant,
// { ms: n } → durée restante, { staff, level } / { player } → objet de
// l'enchère ; le reste tel quel.
function renderParams(params, lang) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v && typeof v === "object" && "money" in v) out[k] = v.money == null ? null : euros(v.money, lang);
    else if (v && typeof v === "object" && "ms" in v) out[k] = leftLabel(v.ms, lang);
    else if (v && typeof v === "object" && "staff" in v) out[k] = `${STAFF[lang][v.staff]} (${WORDS[lang].level} ${v.level})`;
    else if (v && typeof v === "object" && "player" in v) out[k] = v.player || WORDS[lang].aPlayer;
    else if (v && typeof v === "object" && "opp" in v) out[k] = v.opp || WORDS[lang].opponent;
    else out[k] = v;
  });
  return out;
}

// Note structurée : texte français + recette pour les autres langues.
function mkNote(id, params, extra) {
  const fr = MESSAGES[id].fr(renderParams(params, "fr"));
  return Object.assign({ title: fr.title, body: fr.body }, extra, { msg: { id, params } });
}

function pickLang(l) { return PUSH_LANGS.includes(l) ? l : "fr"; }
function pickLangOrNull(l) { return PUSH_LANGS.includes(l) ? l : null; }

// Montants du fil (« 120 000 € ») à la façon de la langue (comme le jeu :
// 120,000 € en anglais / chinois, 120.000 € en italien, espagnol,
// portugais, allemand, grec ; espace insécable en polonais / lituanien).
const GROUP_SEP = { en: ",", zh: ",", pl: "\u00a0", lt: "\u00a0" };
function localizeAmounts(s, lang) {
  if (lang === "fr" || typeof s !== "string") return s;
  return s.replace(/(\d{1,3}(?:[\s  ]\d{3})+)(?=\s?€)/g, m => m.replace(/[\s  ]/g, GROUP_SEP[lang] || "."));
}

// Note prête à envoyer dans la langue voulue ({ title, body, url, tag }).
function localizeNote(note, lang) {
  lang = pickLang(lang);
  const base = { title: note.title, body: note.body, url: note.url, tag: note.tag };
  if (lang === "fr") return base;
  if (note.msg && MESSAGES[note.msg.id]) return Object.assign(base, MESSAGES[note.msg.id][lang](renderParams(note.msg.params, lang)));
  if (note.feed) {
    const I18n = require("./i18n.js");
    return Object.assign(base, {
      title: localizeAmounts(I18n.translate(lang, note.title), lang),
      body: localizeAmounts(I18n.translate(lang, note.body), lang),
    });
  }
  return base;
}

// Langue d'un appareil abonné : celle enregistrée avec l'abonnement, sinon
// celle du club (team.lang, si elle est un jour recopiée du compte), sinon
// le français.
function subscriptionLang(team, sub) {
  return pickLang((sub && sub.lang) || (team && team.lang));
}
const AUCTION_ENDING_MS = 60 * 60 * 1000;
const AUCTION_RESULT_WINDOW_MS = 24 * 3600 * 1000;
const AUCTION_KEYS_KEPT = 100;
// Chargé à la demande (engine.js est volumineux, et ce module est aussi
// utilisé seul par les tests).
let engineMod = null;
function Engine() { if (!engineMod) engineMod = require("../engine.js"); return engineMod; }

const NUM_LOCALE = { fr: "fr-FR", en: "en-GB", it: "it-IT", es: "es-ES", pt: "pt-BR", de: "de-DE", pl: "pl-PL", el: "el-GR", lt: "lt-LT", zh: "zh-CN" };
function euros(n, lang = "fr") { return `${Math.round(n || 0).toLocaleString(NUM_LOCALE[lang] || "fr-FR")} €`; }

function leftLabel(ms, lang = "fr") {
  const w = WORDS[lang] || WORDS.fr;
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} ${w.min}`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ${w.h}`;
  return `${Math.round(h / 24)} ${w.d}`;
}

// Lien des notifications d'enchère : la page Marché ouverte sur « Mes
// enchères » (voir mkGotoMine côté navigateur, #encheres).
const AUCTIONS_URL = "/#encheres";

// Enchères du club : dépassé (une note par surenchère), fin proche, puis
// résultat (voir l'en-tête). `opts.leagueId` + `opts.leagues` (Map id →
// League, server/world.js:catchUpWorld) : aussi les enchères du club sur les
// annonces des AUTRES championnats (marché mondial, enchérisseur rangé en
// FOREIGN_BIDDER_IDX + bidderRef dans la ligue du vendeur).
function auctionNotes(league, teamIdx, now, opts = {}) {
  const team = league.teams[teamIdx];
  const out = [];
  const since = typeof team.pushSince === "number" ? team.pushSince : 0;
  const seen = new Set(team.pushAuctionKeys || []);
  const mark = key => { seen.add(key); team.pushAuctionKeys = [...seen].slice(-AUCTION_KEYS_KEPT); };
  const watched = new Set((team.marketWatchlist || []).map(w => String(w.playerId)));
  const scan = (field, staffLabel, listings, isMe, playerOf) => (listings || []).forEach(l => {
    if (!l || !(l.bids || []).some(isMe)) return;
    if (l.closesAt < since) return;
    const player = !staffLabel ? playerOf(l) : null;
    const what = staffLabel ? { staff: staffLabel, level: l.level } : { player: player ? player.name : null };
    const lead = isMe({ bidderIdx: l.currentBidderIdx, bidderRef: l.currentBidderRef });
    if (l.status === "open") {
      if (l.closesAt <= now) return;
      // Dépassé (retour utilisateur 2026-09-29 : « si qqun a surenchéri,
      // comment je retrouve rapidement ? ») : une note par nouvelle offre
      // d'un autre club (clé = nombre d'offres), même étiquette pour une
      // annonce donnée (la plus récente remplace l'ancienne sur l'appareil).
      const last = (l.bids || [])[l.bids.length - 1];
      if (!lead && last && !isMe(last) && (last.at || 0) >= since) {
        const key = `out:${field}:${l.id}:${l.bids.length}`;
        if (!seen.has(key)) {
          mark(key);
          // Enchère automatique du club dépassée : son plafond ne suffit plus.
          const auto = (l.autoBids || []).find(isMe);
          const extra = { url: AUCTIONS_URL, tag: `out:${field}:${l.id}` };
          out.push(auto
            ? mkNote("autoOutbid", { what, max: { money: auto.max }, bid: { money: l.currentBid }, left: { ms: l.closesAt - now } }, extra)
            : mkNote("outbid", { what, bid: { money: l.currentBid }, left: { ms: l.closesAt - now }, next: { money: Engine().minNextBidFor(l) } }, extra));
        }
      }
      if (l.closesAt - now > AUCTION_ENDING_MS) return;
      if (!staffLabel && watched.has(String(l.playerId))) return; // déjà prévenu (joueur suivi, mkt_end_)
      const key = `end:${field}:${l.id}`;
      if (seen.has(key)) return;
      mark(key);
      out.push(mkNote("ending", { what, lead: !!lead, bid: { money: l.currentBid } }, { url: AUCTIONS_URL, tag: key }));
      return;
    }
    if (now - l.closesAt > AUCTION_RESULT_WINDOW_MS) return;
    const key = `res:${field}:${l.id}`;
    if (seen.has(key)) return;
    mark(key);
    const won = lead && (l.result === "sold");
    if (won && !staffLabel) return; // arrivée du joueur : déjà notifiée (fil, push: true)
    if (lead && l.result === "buyer-failed") {
      out.push(mkNote("cancelled", { what }, { url: "/", tag: key }));
    } else if (won) {
      out.push(mkNote("won", { what, price: { money: l.finalPrice } }, { url: "/", tag: key }));
    } else if (!lead) {
      out.push(mkNote("lost", { what, price: { money: l.finalPrice ? l.finalPrice : null } }, { url: "/", tag: key }));
    }
  });
  const isLocalMe = b => b && b.bidderIdx === teamIdx;
  const localPlayer = l => (typeof league.playerById === "function" ? league.playerById(l.playerId) : null);
  AUCTION_MARKETS.forEach(([field, staffLabel]) => scan(field, staffLabel, league[field], isLocalMe, localPlayer));
  if (opts.leagueId && opts.leagues) {
    const FOREIGN = Engine().FOREIGN_BIDDER_IDX;
    const isRemoteMe = b => !!(b && b.bidderIdx === FOREIGN && b.bidderRef && b.bidderRef.leagueId === opts.leagueId && b.bidderRef.idx === teamIdx);
    for (const [oid, olg] of opts.leagues) {
      if (oid === opts.leagueId || !olg) continue;
      const playerOf = l => {
        if (typeof olg.listingPlayer === "function") return olg.listingPlayer(l);
        const s = olg.teams[l.sellerIdx]; return (s && s.players.find(p => p.id === l.playerId)) || null;
      };
      scan(`world:${oid}`, null, olg.transferListings, isRemoteMe, playerOf);
    }
  }
  return out;
}

function entryNumber(e) { const m = /^evt_(\d+)$/.exec(e.id || ""); return m ? Number(m[1]) : 0; }

// Notifications dues pour un club (et mise à jour de ses curseurs).
function collect(league, teamIdx, now, opts = {}) {
  const team = league.teams[teamIdx];
  const out = [];
  Object.entries(league.liveMatches || {}).forEach(([key, m]) => {
    if (m.homeIdx !== teamIdx && m.awayIdx !== teamIdx) return;
    if (now < m.kickoffAt || now > m.kickoffAt + KICKOFF_WINDOW_MS) return;
    team.pushKickoffKeys = team.pushKickoffKeys || [];
    if (team.pushKickoffKeys.includes(key)) return;
    team.pushKickoffKeys = team.pushKickoffKeys.concat([key]).slice(-10);
    const oppIdx = m.homeIdx === teamIdx ? m.awayIdx : m.homeIdx;
    const opp = league.teams[oppIdx] || (m.guest && m.guest.team ? { name: m.guest.team.teamName } : null);
    out.push(mkNote("kickoff", { team: team.name, opp: { opp: opp ? opp.name : null } }, { url: "/", tag: `kickoff-${key}` }));
  });
  auctionNotes(league, teamIdx, now, opts).forEach(n => out.push(n));
  const cursor = typeof team.pushCursor === "number" ? team.pushCursor : 0;
  const fresh = ((team.feed && team.feed.entries) || []).filter(e => entryNumber(e) > cursor)
    .filter(e => e.push === true || /^injury_|^mkt_end_/.test(e.key || ""))
    .sort((a, b) => entryNumber(a) - entryNumber(b));
  fresh.forEach(e => out.push({ title: e.title, body: e.text || "", url: "/", tag: e.key || e.id, feed: true }));
  if (team.feed) team.pushCursor = (team.feed.nextId || 1) - 1;
  return out;
}

// Langue du COMPTE du club (Accounts.langFor), fournie par le serveur
// (server/index.js:createHandler → setLangResolver) : async team → "fr" |
// "en" | "it" | "es" | … | null (club sans compte). Elle l'emporte sur la langue
// rangée avec l'abonnement : changer de langue dans Paramètres change aussi
// celle des notifications, sur tous les appareils.
let langResolver = null;
function setLangResolver(fn) { langResolver = typeof fn === "function" ? fn : null; }
// Langue du compte d'un club (même résolution que les notifications).
async function langForTeam(team) { return langResolver && team ? langResolver(team) : null; }

async function flushLeague(league, now, { send = WebPush.sendPush, leagueId = null, leagues = null, langOf = langResolver } = {}) {
  if (!WebPush.vapidConfig() || !league) return 0;
  let sent = 0;
  for (let idx = 0; idx < league.teams.length; idx++) {
    const team = league.teams[idx];
    if (!team || !team.isHuman || !(team.pushSubscriptions || []).length || !isPremium(team, now)) continue;
    const notes = collect(league, idx, now, { leagueId, leagues }).slice(-MAX_PER_FLUSH);
    if (!notes.length) continue;
    let accountLang = null;
    if (langOf) { try { accountLang = pickLangOrNull(await langOf(team)); } catch (e) { /* langue de l'abonnement */ } }
    for (const note of notes) {
      for (const sub of team.pushSubscriptions.slice()) {
        const r = await send(sub, localizeNote(note, accountLang || subscriptionLang(team, sub)));
        if (r.ok) sent++;
        if (r.gone) removeSubscription(team, sub.endpoint);
      }
    }
  }
  return sent;
}

module.exports = { localizeNote, subscriptionLang, setLangResolver, langForTeam, MESSAGES, auctionNotes, MAX_SUBSCRIPTIONS, addSubscription, removeSubscription, collect, flushLeague, isPremium };
