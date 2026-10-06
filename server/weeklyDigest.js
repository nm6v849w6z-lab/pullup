"use strict";

// =====================================================================
// RÉSUMÉ DE LA SEMAINE PAR E-MAIL (demande du 2026-10-01) : chaque lundi,
// après la mise à jour hebdomadaire de la ligue (lundi 6h à Paris pour tous
// les pays, voir Calendar.WEEKLY_RHYTHM_ECONOMY_HOUR et
// AutoSim.runWeeklyEconomyTick), chaque manager humain qui a un compte avec
// une adresse e-mail reçoit UN e-mail récapitulatif de sa semaine :
//   - résultats officiels de la semaine écoulée, classement et points ;
//   - entraînement : joueurs entraînés aux fondamentaux (digestTrainedPlayers) ;
//   - finances : recettes, dépenses et solde de la semaine (Team.financeLedger),
//     budget actuel ;
//   - marché : enchères gagnées / perdues / en cours, surenchères, ventes ;
//   - contrats : joueurs en dernière saison à prolonger, demandes
//     d'augmentation en attente ;
//   - prochains matchs (heure de Paris) ;
//   - bouton vers le jeu, lien de désinscription signé.
//
// Envoi : à partir du lundi DIGEST_HOUR_PARIS h (heure de Paris), pendant
// DIGEST_SEND_WINDOW_MS (passé ce délai — serveur arrêté tout le lundi et le
// mardi —, la semaine est sautée plutôt que d'envoyer un résumé périmé).
// Déclenché depuis server/index.js:maybeCatchUpWorld (minuterie de fond ou
// requête), JAMAIS attendu : scheduleWeeklyDigests repousse le travail
// (setImmediate), le prépare sous le verrou de sauvegarde (lecture des
// ligues, marque `account.lastDigestWeekKey` AVANT l'envoi : jamais deux
// fois la même semaine, même après un redémarrage), puis envoie hors verrou
// par petits lots, erreurs seulement journalisées.
//
// Garde-fous : rien sans fournisseur d'e-mail configuré (Mailer.mailConfigured,
// donc jamais en test/dev) ; comptes sans e-mail ou sans club, désinscrits
// (`account.digestOptOut`), clubs de l'IA et managers absents depuis plus de
// DIGEST_INACTIVE_DAYS jours (Team.lastSeenAt / account.lastLoginAt) ignorés.
// Pas de notion d'e-mail « vérifié » dans les comptes : toute adresse de
// compte est utilisée.
//
// Langue : celle du compte (Accounts.langFor : choix du compte, langue
// détectée, pays du club). Textes ci-dessous (STRINGS) ; noms des
// caractéristiques traduits avec le dictionnaire du jeu (I18n.translate).
// =====================================================================

const crypto = require("crypto");
const Engine = require("../engine.js");
const Calendar = require("./calendar.js");
const Accounts = require("./accounts.js");
const Mailer = require("./mailer.js");
const I18n = require("./i18n.js");

const PARIS = "Europe/Paris";
const DAY_MS = 24 * 3600 * 1000;
const DIGEST_HOUR_PARIS = 9; // lundi 9h : la mise à jour de 6h est passée
const DIGEST_SEND_WINDOW_MS = 2 * DAY_MS;
const DIGEST_INACTIVE_DAYS = 28;
const SEND_BATCH_SIZE = 5;
const SEND_BATCH_PAUSE_MS = 1500;
const MAX_NEXT_MATCHES = 4;
const DEFAULT_SITE_URL = "https://hoop-manager.com";

function siteUrl() {
  return String(process.env.BASKET_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

// ---------------------------------------------------------------------
// Semaine (heure de Paris)
// ---------------------------------------------------------------------
// Lundi 0h (Paris) de la semaine qui contient `now`, et sa clé "AAAA-MM-JJ".
function parisWeekOf(now) {
  const p = Calendar.zonedLocalDateParts(now, PARIS);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = dimanche
  const back = (weekday + 6) % 7;
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - back));
  const y = monday.getUTCFullYear(), m = monday.getUTCMonth() + 1, d = monday.getUTCDate();
  const start = Calendar.zonedEpochForLocalTime(PARIS, y, m, d, 0);
  const prev = new Date(Date.UTC(y, m - 1, d - 7));
  const next = new Date(Date.UTC(y, m - 1, d + 7));
  return {
    key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    start,
    prevStart: Calendar.zonedEpochForLocalTime(PARIS, prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), 0),
    nextStart: Calendar.zonedEpochForLocalTime(PARIS, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0),
    sendAt: Calendar.zonedEpochForLocalTime(PARIS, y, m, d, DIGEST_HOUR_PARIS),
  };
}

function isDigestDue(now) {
  const w = parisWeekOf(now);
  return now >= w.sendAt && now < w.sendAt + DIGEST_SEND_WINDOW_MS;
}

// ---------------------------------------------------------------------
// Lien de désinscription signé (HMAC de l'id du compte, jamais exposé au
// navigateur). Secret : EMAIL_LINK_SECRET, sinon un secret serveur existant.
// ---------------------------------------------------------------------
function linkSecret() {
  return process.env.EMAIL_LINK_SECRET || process.env.BASKET_ADMIN_TOKEN || process.env.ANTI_CHEAT_SALT || "hoop-manager-digest";
}
function signDigestToken(accountId) {
  const sig = crypto.createHmac("sha256", linkSecret()).update(`digest:${accountId}`).digest("base64url").slice(0, 32);
  return `${accountId}.${sig}`;
}
function verifyDigestToken(token) {
  if (typeof token !== "string" || token.length > 200) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const expected = signDigestToken(id);
  const a = Buffer.from(expected), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

// ---------------------------------------------------------------------
// Textes (français d'origine, puis en / it / es / pt / de / pl / el / lt /
// zh). Tutoiement comme le reste du jeu.
// ---------------------------------------------------------------------
const STRINGS = {
  fr: {
    locale: "fr-FR",
    subject: "Hoop Manager : la semaine de {club}",
    title: "Résumé de la semaine",
    hello: "Bonjour {name},", helloAnon: "Bonjour,",
    intro: "Voici ce qui s'est passé cette semaine pour {club}.",
    results: "Résultats de la semaine", noResults: "Aucun match officiel cette semaine.",
    standing: "Classement", standingLine: "{pos}/{n} · {points} pts ({w} V – {l} D)",
    win: "V", loss: "D", home: "dom.", away: "ext.",
    comp: { league: "Championnat", playoffs: "Play-offs", cup: "Coupe nationale" },
    training: "Entraînement", noTraining: "Aucun joueur entraîné aux fondamentaux cette semaine.", noUps: "Aucune progression visible cette semaine pour les joueurs entraînés.", program: "Programme",
    finances: "Finances", income: "Recettes", expenses: "Dépenses", net: "Solde de la semaine", budget: "Budget actuel",
    market: "Marché des transferts", noMarket: "Aucune activité sur le marché cette semaine.",
    won: "Enchère remportée", lost: "Enchère perdue", ongoing: "Enchère en cours", outbid: "Tu as été surenchéri", leading: "Tu mènes", sold: "Joueur vendu", unsold: "Invendu",
    contracts: "Contrats", noContracts: "Rien à signaler sur les contrats.",
    extension: "Dernière saison de contrat : prolongation à négocier",
    raise: "Demande une augmentation : {asked}/sem. (actuellement {salary})",
    next: "Prochains matchs", noNext: "Aucun match officiel programmé cette semaine.", parisTime: "heure de Paris",
    cta: "Ouvrir Hoop Manager",
    footer: "Tu reçois ce résumé chaque lundi parce que tu as un compte Hoop Manager.",
    unsubscribe: "Ne plus recevoir ce résumé",
    unsubTitle: "Désinscription confirmée", unsubBody: "Tu ne recevras plus le résumé de la semaine par e-mail.",
    resub: "Me réinscrire", resubTitle: "Réinscription confirmée", resubBody: "Tu recevras de nouveau le résumé de la semaine chaque lundi.",
    invalid: "Lien invalide ou expiré.", back: "Retour au jeu",
  },
  en: {
    locale: "en-GB",
    subject: "Hoop Manager: {club}'s week",
    title: "Your weekly summary",
    hello: "Hi {name},", helloAnon: "Hi,",
    intro: "Here is what happened this week at {club}.",
    results: "This week's results", noResults: "No official games this week.",
    standing: "Standings", standingLine: "{pos}/{n} · {points} pts ({w} W – {l} L)",
    win: "W", loss: "L", home: "home", away: "away",
    comp: { league: "League", playoffs: "Playoffs", cup: "National Cup" },
    training: "Training", noTraining: "No player was trained in fundamentals this week.", noUps: "No visible progress this week for the trained players.", program: "Program",
    finances: "Finances", income: "Income", expenses: "Expenses", net: "Weekly balance", budget: "Current budget",
    market: "Transfer market", noMarket: "No market activity this week.",
    won: "Auction won", lost: "Auction lost", ongoing: "Auction in progress", outbid: "You've been outbid", leading: "You're leading", sold: "Player sold", unsold: "Unsold",
    contracts: "Contracts", noContracts: "Nothing to report on contracts.",
    extension: "Final contract season: extension to negotiate",
    raise: "Asks for a raise: {asked}/wk (currently {salary})",
    next: "Upcoming games", noNext: "No official games scheduled this week.", parisTime: "Paris time",
    cta: "Open Hoop Manager",
    footer: "You get this summary every Monday because you have a Hoop Manager account.",
    unsubscribe: "Stop receiving this summary",
    unsubTitle: "Unsubscribed", unsubBody: "You will no longer receive the weekly summary e-mail.",
    resub: "Subscribe again", resubTitle: "Subscribed again", resubBody: "You will receive the weekly summary every Monday again.",
    invalid: "Invalid or expired link.", back: "Back to the game",
  },
  it: {
    locale: "it-IT",
    subject: "Hoop Manager: la settimana di {club}",
    title: "Riepilogo della settimana",
    hello: "Ciao {name},", helloAnon: "Ciao,",
    intro: "Ecco cosa è successo questa settimana a {club}.",
    results: "Risultati della settimana", noResults: "Nessuna partita ufficiale questa settimana.",
    standing: "Classifica", standingLine: "{pos}/{n} · {points} pt ({w} V – {l} S)",
    win: "V", loss: "S", home: "casa", away: "trasf.",
    comp: { league: "Campionato", playoffs: "Play-off", cup: "Coppa nazionale" },
    training: "Allenamento", noTraining: "Nessun giocatore allenato nei fondamentali questa settimana.", noUps: "Nessun progresso visibile questa settimana per i giocatori allenati.", program: "Programma",
    finances: "Finanze", income: "Entrate", expenses: "Uscite", net: "Saldo della settimana", budget: "Budget attuale",
    market: "Mercato dei trasferimenti", noMarket: "Nessuna attività sul mercato questa settimana.",
    won: "Asta vinta", lost: "Asta persa", ongoing: "Asta in corso", outbid: "Sei stato superato", leading: "Sei in testa", sold: "Giocatore venduto", unsold: "Invenduto",
    contracts: "Contratti", noContracts: "Niente da segnalare sui contratti.",
    extension: "Ultima stagione di contratto: rinnovo da negoziare",
    raise: "Chiede un aumento: {asked}/sett. (ora {salary})",
    next: "Prossime partite", noNext: "Nessuna partita ufficiale in programma questa settimana.", parisTime: "ora di Parigi",
    cta: "Apri Hoop Manager",
    footer: "Ricevi questo riepilogo ogni lunedì perché hai un account Hoop Manager.",
    unsubscribe: "Non ricevere più questo riepilogo",
    unsubTitle: "Disiscrizione confermata", unsubBody: "Non riceverai più il riepilogo settimanale via e-mail.",
    resub: "Iscrivimi di nuovo", resubTitle: "Iscrizione confermata", resubBody: "Riceverai di nuovo il riepilogo ogni lunedì.",
    invalid: "Link non valido o scaduto.", back: "Torna al gioco",
  },
  es: {
    locale: "es-ES",
    subject: "Hoop Manager: la semana de {club}",
    title: "Resumen de la semana",
    hello: "Hola, {name}:", helloAnon: "Hola:",
    intro: "Esto es lo que ha pasado esta semana en {club}.",
    results: "Resultados de la semana", noResults: "Ningún partido oficial esta semana.",
    standing: "Clasificación", standingLine: "{pos}/{n} · {points} pts ({w} V – {l} D)",
    win: "V", loss: "D", home: "local", away: "visit.",
    comp: { league: "Liga", playoffs: "Play-offs", cup: "Copa nacional" },
    training: "Entrenamiento", noTraining: "Ningún jugador ha entrenado fundamentos esta semana.", noUps: "Ningún progreso visible esta semana para los jugadores entrenados.", program: "Programa",
    finances: "Finanzas", income: "Ingresos", expenses: "Gastos", net: "Saldo de la semana", budget: "Presupuesto actual",
    market: "Mercado de fichajes", noMarket: "Ninguna actividad en el mercado esta semana.",
    won: "Subasta ganada", lost: "Subasta perdida", ongoing: "Subasta en curso", outbid: "Te han superado la puja", leading: "Vas en cabeza", sold: "Jugador vendido", unsold: "Sin vender",
    contracts: "Contratos", noContracts: "Nada que señalar sobre los contratos.",
    extension: "Última temporada de contrato: renovación por negociar",
    raise: "Pide un aumento: {asked}/sem. (ahora {salary})",
    next: "Próximos partidos", noNext: "Ningún partido oficial programado esta semana.", parisTime: "hora de París",
    cta: "Abrir Hoop Manager",
    footer: "Recibes este resumen cada lunes porque tienes una cuenta de Hoop Manager.",
    unsubscribe: "No recibir más este resumen",
    unsubTitle: "Baja confirmada", unsubBody: "Ya no recibirás el resumen semanal por correo.",
    resub: "Volver a suscribirme", resubTitle: "Suscripción confirmada", resubBody: "Volverás a recibir el resumen cada lunes.",
    invalid: "Enlace no válido o caducado.", back: "Volver al juego",
  },
  pt: {
    locale: "pt-BR",
    subject: "Hoop Manager: a semana do {club}",
    title: "Resumo da semana",
    hello: "Olá, {name},", helloAnon: "Olá,",
    intro: "Veja o que aconteceu esta semana no {club}.",
    results: "Resultados da semana", noResults: "Nenhum jogo oficial esta semana.",
    standing: "Classificação", standingLine: "{pos}/{n} · {points} pts ({w} V – {l} D)",
    win: "V", loss: "D", home: "casa", away: "fora",
    comp: { league: "Campeonato", playoffs: "Playoffs", cup: "Copa nacional" },
    training: "Treino", noTraining: "Nenhum jogador treinou fundamentos esta semana.", noUps: "Nenhuma evolução visível esta semana para os jogadores treinados.", program: "Programa",
    finances: "Finanças", income: "Receitas", expenses: "Despesas", net: "Saldo da semana", budget: "Orçamento atual",
    market: "Mercado de transferências", noMarket: "Nenhuma atividade no mercado esta semana.",
    won: "Leilão vencido", lost: "Leilão perdido", ongoing: "Leilão em andamento", outbid: "Seu lance foi superado", leading: "Você está na frente", sold: "Jogador vendido", unsold: "Não vendido",
    contracts: "Contratos", noContracts: "Nada a relatar sobre contratos.",
    extension: "Última temporada de contrato: renovação a negociar",
    raise: "Pede aumento: {asked}/sem. (hoje {salary})",
    next: "Próximos jogos", noNext: "Nenhum jogo oficial marcado esta semana.", parisTime: "horário de Paris",
    cta: "Abrir o Hoop Manager",
    footer: "Você recebe este resumo toda segunda-feira porque tem uma conta no Hoop Manager.",
    unsubscribe: "Não receber mais este resumo",
    unsubTitle: "Inscrição cancelada", unsubBody: "Você não receberá mais o resumo semanal por e-mail.",
    resub: "Inscrever-me de novo", resubTitle: "Inscrição confirmada", resubBody: "Você voltará a receber o resumo toda segunda-feira.",
    invalid: "Link inválido ou expirado.", back: "Voltar ao jogo",
  },
  de: {
    locale: "de-DE",
    subject: "Hoop Manager: die Woche von {club}",
    title: "Dein Wochenrückblick",
    hello: "Hallo {name},", helloAnon: "Hallo,",
    intro: "Das ist diese Woche bei {club} passiert.",
    results: "Ergebnisse der Woche", noResults: "Diese Woche keine Pflichtspiele.",
    standing: "Tabelle", standingLine: "{pos}/{n} · {points} Pkt. ({w} S – {l} N)",
    win: "S", loss: "N", home: "Heim", away: "ausw.",
    comp: { league: "Liga", playoffs: "Playoffs", cup: "Landespokal" },
    training: "Training", noTraining: "Diese Woche wurde kein Spieler in den Grundlagen trainiert.", noUps: "Diese Woche keine sichtbaren Fortschritte bei den trainierten Spielern.", program: "Programm",
    finances: "Finanzen", income: "Einnahmen", expenses: "Ausgaben", net: "Wochensaldo", budget: "Aktuelles Budget",
    market: "Transfermarkt", noMarket: "Diese Woche keine Aktivität auf dem Markt.",
    won: "Auktion gewonnen", lost: "Auktion verloren", ongoing: "Laufende Auktion", outbid: "Du wurdest überboten", leading: "Du führst", sold: "Spieler verkauft", unsold: "Nicht verkauft",
    contracts: "Verträge", noContracts: "Nichts Neues bei den Verträgen.",
    extension: "Letzte Vertragssaison: Verlängerung verhandeln",
    raise: "Fordert eine Gehaltserhöhung: {asked}/Wo. (aktuell {salary})",
    next: "Nächste Spiele", noNext: "Diese Woche sind keine Pflichtspiele angesetzt.", parisTime: "Pariser Zeit",
    cta: "Hoop Manager öffnen",
    footer: "Du bekommst diesen Rückblick jeden Montag, weil du ein Hoop-Manager-Konto hast.",
    unsubscribe: "Diesen Rückblick abbestellen",
    unsubTitle: "Abmeldung bestätigt", unsubBody: "Du bekommst den Wochenrückblick nicht mehr per E-Mail.",
    resub: "Wieder anmelden", resubTitle: "Anmeldung bestätigt", resubBody: "Du bekommst den Wochenrückblick wieder jeden Montag.",
    invalid: "Ungültiger oder abgelaufener Link.", back: "Zurück zum Spiel",
  },
  pl: {
    locale: "pl-PL",
    subject: "Hoop Manager: tydzień klubu {club}",
    title: "Podsumowanie tygodnia",
    hello: "Cześć {name},", helloAnon: "Cześć,",
    intro: "Oto co wydarzyło się w tym tygodniu w klubie {club}.",
    results: "Wyniki tygodnia", noResults: "Brak meczów o stawkę w tym tygodniu.",
    standing: "Tabela", standingLine: "{pos}/{n} · {points} pkt ({w} W – {l} P)",
    win: "W", loss: "P", home: "dom", away: "wyjazd",
    comp: { league: "Liga", playoffs: "Play-offy", cup: "Puchar kraju" },
    training: "Trening", noTraining: "W tym tygodniu żaden zawodnik nie trenował podstaw.", noUps: "W tym tygodniu brak widocznych postępów u trenowanych zawodników.", program: "Program",
    finances: "Finanse", income: "Przychody", expenses: "Wydatki", net: "Bilans tygodnia", budget: "Obecny budżet",
    market: "Rynek transferowy", noMarket: "Brak aktywności na rynku w tym tygodniu.",
    won: "Wygrana aukcja", lost: "Przegrana aukcja", ongoing: "Trwająca aukcja", outbid: "Twoja oferta została przebita", leading: "Prowadzisz", sold: "Zawodnik sprzedany", unsold: "Niesprzedany",
    contracts: "Kontrakty", noContracts: "Nic nowego w sprawie kontraktów.",
    extension: "Ostatni sezon kontraktu: przedłużenie do negocjacji",
    raise: "Prosi o podwyżkę: {asked}/tydz. (obecnie {salary})",
    next: "Najbliższe mecze", noNext: "Brak zaplanowanych meczów o stawkę w tym tygodniu.", parisTime: "czas paryski",
    cta: "Otwórz Hoop Manager",
    footer: "Otrzymujesz to podsumowanie w każdy poniedziałek, bo masz konto w Hoop Manager.",
    unsubscribe: "Nie wysyłaj mi tego podsumowania",
    unsubTitle: "Wypisano z listy", unsubBody: "Nie będziesz już otrzymywać cotygodniowego podsumowania e-mailem.",
    resub: "Zapisz mnie ponownie", resubTitle: "Zapisano ponownie", resubBody: "Znów będziesz otrzymywać podsumowanie w każdy poniedziałek.",
    invalid: "Nieprawidłowy lub wygasły link.", back: "Wróć do gry",
  },
  el: {
    locale: "el-GR",
    subject: "Hoop Manager: η εβδομάδα της {club}",
    title: "Σύνοψη της εβδομάδας",
    hello: "Γεια σου {name},", helloAnon: "Γεια σου,",
    intro: "Δες τι έγινε αυτή την εβδομάδα στην {club}.",
    results: "Αποτελέσματα της εβδομάδας", noResults: "Κανένας επίσημος αγώνας αυτή την εβδομάδα.",
    standing: "Βαθμολογία", standingLine: "{pos}/{n} · {points} β. ({w} Ν – {l} Η)",
    win: "Ν", loss: "Η", home: "έδρα", away: "εκτός",
    comp: { league: "Πρωτάθλημα", playoffs: "Πλέι οφ", cup: "Εθνικό Κύπελλο" },
    training: "Προπόνηση", noTraining: "Κανένας παίκτης δεν προπονήθηκε στα βασικά αυτή την εβδομάδα.", noUps: "Καμία ορατή πρόοδος αυτή την εβδομάδα για τους παίκτες που προπονήθηκαν.", program: "Πρόγραμμα",
    finances: "Οικονομικά", income: "Έσοδα", expenses: "Έξοδα", net: "Ισοζύγιο εβδομάδας", budget: "Τρέχων προϋπολογισμός",
    market: "Μεταγραφική αγορά", noMarket: "Καμία κίνηση στην αγορά αυτή την εβδομάδα.",
    won: "Κέρδισες τη δημοπρασία", lost: "Έχασες τη δημοπρασία", ongoing: "Δημοπρασία σε εξέλιξη", outbid: "Η προσφορά σου ξεπεράστηκε", leading: "Προηγείσαι", sold: "Ο παίκτης πουλήθηκε", unsold: "Απούλητος",
    contracts: "Συμβόλαια", noContracts: "Τίποτα νέο στα συμβόλαια.",
    extension: "Τελευταία σεζόν συμβολαίου: ανανέωση προς διαπραγμάτευση",
    raise: "Ζητά αύξηση: {asked}/εβδ. (τώρα {salary})",
    next: "Επόμενοι αγώνες", noNext: "Κανένας επίσημος αγώνας αυτή την εβδομάδα.", parisTime: "ώρα Παρισιού",
    cta: "Άνοιξε το Hoop Manager",
    footer: "Λαμβάνεις αυτή τη σύνοψη κάθε Δευτέρα επειδή έχεις λογαριασμό στο Hoop Manager.",
    unsubscribe: "Να μη λαμβάνω πια αυτή τη σύνοψη",
    unsubTitle: "Η διαγραφή επιβεβαιώθηκε", unsubBody: "Δεν θα λαμβάνεις πια την εβδομαδιαία σύνοψη με email.",
    resub: "Εγγραφή ξανά", resubTitle: "Η εγγραφή επιβεβαιώθηκε", resubBody: "Θα λαμβάνεις ξανά τη σύνοψη κάθε Δευτέρα.",
    invalid: "Μη έγκυρος ή ληγμένος σύνδεσμος.", back: "Επιστροφή στο παιχνίδι",
  },
  lt: {
    locale: "lt-LT",
    subject: "Hoop Manager: {club} savaitė",
    title: "Savaitės apžvalga",
    hello: "Sveiki, {name},", helloAnon: "Sveiki,",
    intro: "Štai kas šią savaitę nutiko klube {club}.",
    results: "Savaitės rezultatai", noResults: "Šią savaitę oficialių rungtynių nebuvo.",
    standing: "Turnyrinė lentelė", standingLine: "{pos}/{n} · {points} tšk. ({w} P – {l} L)",
    win: "P", loss: "L", home: "namie", away: "svečiuose",
    comp: { league: "Lyga", playoffs: "Atkrintamosios", cup: "Nacionalinė taurė" },
    training: "Treniruotės", noTraining: "Šią savaitę nė vienas žaidėjas netreniravo pagrindų.", noUps: "Šią savaitę treniruotų žaidėjų pažanga nepastebima.", program: "Programa",
    finances: "Finansai", income: "Pajamos", expenses: "Išlaidos", net: "Savaitės balansas", budget: "Dabartinis biudžetas",
    market: "Perėjimų rinka", noMarket: "Šią savaitę rinkoje veiklos nebuvo.",
    won: "Aukcionas laimėtas", lost: "Aukcionas pralaimėtas", ongoing: "Vykstantis aukcionas", outbid: "Tavo statymas viršytas", leading: "Tu pirmauji", sold: "Žaidėjas parduotas", unsold: "Neparduotas",
    contracts: "Sutartys", noContracts: "Sutarčių naujienų nėra.",
    extension: "Paskutinis sutarties sezonas: reikia derėtis dėl pratęsimo",
    raise: "Prašo didesnio atlyginimo: {asked}/sav. (dabar {salary})",
    next: "Artimiausios rungtynės", noNext: "Šią savaitę oficialių rungtynių nesuplanuota.", parisTime: "Paryžiaus laiku",
    cta: "Atidaryti Hoop Manager",
    footer: "Šią apžvalgą gauni kiekvieną pirmadienį, nes turi Hoop Manager paskyrą.",
    unsubscribe: "Nebegauti šios apžvalgos",
    unsubTitle: "Prenumerata atšaukta", unsubBody: "Savaitės apžvalgos el. paštu nebegausi.",
    resub: "Vėl užsiprenumeruoti", resubTitle: "Prenumerata atnaujinta", resubBody: "Vėl gausi apžvalgą kiekvieną pirmadienį.",
    invalid: "Netinkama arba nebegaliojanti nuoroda.", back: "Grįžti į žaidimą",
  },
  zh: {
    locale: "zh-CN",
    subject: "Hoop Manager：{club} 的本周回顾",
    title: "本周回顾",
    hello: "{name}，你好：", helloAnon: "你好：",
    intro: "以下是 {club} 本周发生的事情。",
    results: "本周赛果", noResults: "本周没有正式比赛。",
    standing: "排名", standingLine: "第 {pos}/{n} 名 · {points} 分（{w} 胜 – {l} 负）",
    win: "胜", loss: "负", home: "主场", away: "客场",
    comp: { league: "联赛", playoffs: "季后赛", cup: "国家杯" },
    training: "训练", noTraining: "本周没有球员进行基本功训练。", noUps: "本周受训球员没有可见的进步。", program: "训练项目",
    finances: "财务", income: "收入", expenses: "支出", net: "本周结余", budget: "当前预算",
    market: "转会市场", noMarket: "本周市场没有动态。",
    won: "竞拍成功", lost: "竞拍失败", ongoing: "竞拍进行中", outbid: "你的出价已被超过", leading: "你暂时领先", sold: "球员已售出", unsold: "未售出",
    contracts: "合同", noContracts: "合同方面没有需要处理的事项。",
    extension: "合同最后一个赛季：需要商谈续约",
    raise: "要求加薪：{asked}/周（目前 {salary}）",
    next: "接下来的比赛", noNext: "本周没有安排正式比赛。", parisTime: "巴黎时间",
    cta: "打开 Hoop Manager",
    footer: "你每周一都会收到这份回顾，因为你拥有 Hoop Manager 账号。",
    unsubscribe: "不再接收此回顾",
    unsubTitle: "已退订", unsubBody: "你将不再收到每周回顾邮件。",
    resub: "重新订阅", resubTitle: "已重新订阅", resubBody: "你将在每周一重新收到回顾。",
    invalid: "链接无效或已过期。", back: "返回游戏",
  },
};

function stringsFor(lang) { return STRINGS[lang] || STRINGS.fr; }
function fill(tpl, vars) { return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k]))); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------
// Données du résumé (indépendantes de la langue)
// ---------------------------------------------------------------------
// Nom du joueur d'une annonce, même parti du club (vendu, autre
// championnat) : annonce elle-même, effectifs et agents libres de la ligue,
// actualité des transferts (par annonce puis par joueur), historique des
// ventes du vendeur. `null` si vraiment inconnu (le rendu affiche alors
// « Joueur vendu » / « Enchère … » sans nom, jamais « ? »).
function playerNameIn(league, playerId, listing = null) {
  if (listing) {
    if (typeof listing.playerName === "string" && listing.playerName) return listing.playerName;
    if (listing.player && listing.player.name) return listing.player.name;
  }
  if (playerId != null) {
    if (typeof league.playerById === "function") {
      try { const p = league.playerById(playerId); if (p && p.name) return p.name; } catch (e) { /* facultatif */ }
    }
    for (const t of league.teams || []) {
      const p = (t.players || []).find(x => x.id === playerId) || (t.youthPlayers || []).find(x => x.id === playerId);
      if (p) return p.name;
    }
    const fa = (league.freeAgents || []).find(x => x.id === playerId);
    if (fa) return fa.name;
  }
  const news = league.transferNews || [];
  const byListing = listing && listing.id != null ? news.find(n => n && n.id === listing.id && n.playerName) : null;
  if (byListing) return byListing.playerName;
  const byPlayer = playerId != null ? news.find(n => n && n.playerId === playerId && n.playerName) : null;
  if (byPlayer) return byPlayer.playerName;
  // Vente : « Vente de <nom> (enchères) » au prix final, chez le vendeur.
  const seller = listing && listing.sellerIdx != null ? (league.teams || [])[listing.sellerIdx] : null;
  const price = listing && (listing.finalPrice || listing.currentBid);
  if (seller && price) {
    const tx = (seller.transactions || []).find(t => t && t.amount === Math.round(price) && /^Vente de .+ \(enchères\)$/.test(t.label || ""));
    if (tx) return tx.label.replace(/^Vente de /, "").replace(/ \(enchères\)$/, "");
  }
  return null;
}

function weekResults(league, teamIdx, from, to) {
  const team = league.teams[teamIdx];
  const out = [];
  const totalRounds = typeof league.totalRounds === "number" ? league.totalRounds : (league.schedule || []).length;
  // Championnat : league.results (forfaits compris), date = horaire programmé.
  (league.results || []).forEach(r => {
    if (r.home !== teamIdx && r.away !== teamIdx) return;
    const at = Calendar.scheduledTimeForLeagueRound(league, r.round);
    if (typeof at !== "number" || at < from || at >= to) return;
    const isHome = r.home === teamIdx;
    const opp = league.teams[isHome ? r.away : r.home];
    out.push({ at, competition: "league", isHome, opponent: opp ? opp.name : "?",
      scoreFor: isHome ? r.scoreHome : r.scoreAway, scoreAgainst: isHome ? r.scoreAway : r.scoreHome });
  });
  // Play-offs et Coupe : historique des ordres du club (Team.ordersHistory,
  // un match officiel par entrée, avec score et adversaire).
  (team.ordersHistory || []).forEach(h => {
    if (!h || typeof h.at !== "number" || h.at < from || h.at >= to) return;
    if (h.scoreFor == null || h.scoreAgainst == null) return;
    let competition = null;
    if (h.competition === "cup") competition = "cup";
    else if (h.competition === "championship" && h.round >= totalRounds) competition = "playoffs";
    if (!competition) return;
    out.push({ at: h.at, competition, isHome: !!h.isHome, opponent: h.opponentName || "?", scoreFor: h.scoreFor, scoreAgainst: h.scoreAgainst });
  });
  return out.sort((a, b) => a.at - b.at);
}

function standingOf(league, teamIdx, divisionLabel) {
  if (typeof league.standings !== "function") return null;
  const table = league.standings();
  const pos = table.findIndex(s => s.idx === teamIdx);
  if (pos === -1) return null;
  const s = table[pos];
  return { pos: pos + 1, n: table.length, points: s.points, wins: s.wins, losses: s.losses, played: s.played, division: divisionLabel || null };
}

// Joueurs RÉELLEMENT entraînés aux fondamentaux la semaine écoulée (retour
// du propriétaire 2026-10-01 : tous ceux-là et eux seuls ; jamais la
// croissance naturelle du physique/mental ; seulement les « montées »).
// Source actuelle : Team.lastTrainingReport (écrit par Team.trainWeek au
// lundi) — une entrée `players[id]` existe pour CHAQUE joueur de l'effectif ;
// seul `program` (ou l'ancien `effectiveFocus`, = clé du programme, posé quand le joueur a joué
// au(x) poste(s) entraîné(s), voir Team.trainingPreviewFor) avec des
// secondes et une présence > 0 signale un vrai entraînement des
// fondamentaux. Gains filtrés sur les caractéristiques DU PROGRAMME
// (fondamentales, Engine.FUNDAMENTAL_ATTRS ; ni synergies, ni physique/
// mental) et gardés seulement s'ils font au moins +1 point entier (une
// « montée » ; la progression fractionnaire en cours n'est pas montrée).
// Renvoie TOUS les joueurs entraînés : [{ name, program, programLabel,
// skills: [{ attr, before, after, gain }], total }] (skills vide = entraîné
// sans montée cette semaine ; trainingOf ne garde que ceux qui ont monté).
// NOUVEAU SYSTÈME (plans individuels, « slots » de 0 à 5 joueurs selon
// l'entraîneur, team.trainingPlans ou équivalent) : il suffira de remplacer
// le choix des joueurs et de leur programme ci-dessous (une entrée par slot
// occupé : joueur + programme du slot, gains lus dans le rapport) ; la forme
// renvoyée et le rendu ne changent pas.
function digestTrainedPlayers(team) {
  const report = team && team.lastTrainingReport && team.lastTrainingReport.players;
  if (!report || typeof report !== "object") return [];
  const programs = Engine.TRAINING_PROGRAMS || {};
  const fundamentals = new Set(Engine.FUNDAMENTAL_ATTRS || []);
  // Programmes individuels (créneaux) : variations exactes dans `slots`.
  const slotChanges = new Map(((team.lastTrainingReport.slots) || []).map(sl => [String(sl.playerId), sl.changes || []]));
  const out = [];
  Object.entries(report).forEach(([id, e]) => {
    if (!e) return;
    const program = e.program || e.effectiveFocus || null;
    const def = program ? programs[program] : null;
    if (!def || !(e.secondsPlayed > 0) || e.attendanceFactor === 0) return;
    const p = (team.players || []).find(x => String(x.id) === String(id));
    const attrs = (def.attrs || []).map(a => a.attr).filter(a => fundamentals.size === 0 || fundamentals.has(a));
    const gains = slotChanges.get(String(id)) || (Array.isArray(e.gains) ? e.gains : []);
    const skills = [];
    attrs.forEach(attr => {
      const g = gains.find(x => x && x.attr === attr && typeof x.before === "number" && typeof x.after === "number");
      if (g && g.after - g.before >= 1) skills.push({ attr, before: g.before, after: g.after, gain: g.after - g.before });
    });
    out.push({ name: e.name || (p && p.name) || "?", program, programLabel: def.label || program, skills,
      total: skills.reduce((a, x) => a + x.gain, 0) });
  });
  return out.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

// { trained: nombre de joueurs entraînés, players: ceux qui ont monté }.
function trainingOf(team) {
  const all = digestTrainedPlayers(team);
  return { trained: all.length, players: all.filter(x => x.skills.length) };
}

function financesOf(team) {
  const ledger = team.financeLedger && typeof team.financeLedger === "object" ? team.financeLedger : {};
  const season = (team.seasonHistory || []).length + 1;
  // Semaine qui vient de s'achever (team.week a avancé au lundi) ; repli sur
  // la dernière semaine connue (changement de saison).
  let row = ledger[`${season}:${(team.week || 1) - 1}`];
  if (!row) {
    const keys = Object.keys(ledger).filter(k => k !== `${season}:${team.week || 1}`);
    row = keys.length ? ledger[keys[keys.length - 1]] : null;
  }
  let income = 0, expenses = 0;
  if (row) Object.values(row).forEach(v => { if (typeof v !== "number") return; if (v >= 0) income += v; else expenses += v; });
  return { hasWeek: !!row, income: Math.round(income), expenses: Math.round(expenses), net: Math.round(income + expenses), budget: Math.round(team.budget || 0) };
}

function marketOf(league, teamIdx, from, now) {
  const won = [], lost = [], ongoing = [], sold = [];
  const bidOn = l => l.currentBidderIdx === teamIdx || (l.bids || []).some(b => b.bidderIdx === teamIdx)
    || (l.autoBids || []).some(a => a.bidderIdx === teamIdx);
  const myMax = l => Math.max(0, ...(l.bids || []).filter(b => b.bidderIdx === teamIdx).map(b => b.amount || 0));
  (league.transferListings || []).forEach(l => {
    if (!l) return;
    const name = playerNameIn(league, l.playerId, l);
    if (l.sellerIdx === teamIdx) {
      if (l.status !== "open" && l.result === "sold" && typeof l.closesAt === "number" && l.closesAt >= from && l.closesAt <= now) {
        sold.push({ player: name, price: l.finalPrice || l.currentBid || 0 });
      }
      return;
    }
    if (!bidOn(l)) return;
    if (l.status === "open") {
      ongoing.push({ player: name, price: l.currentBid || l.startPrice || 0, leading: l.currentBidderIdx === teamIdx, myBid: myMax(l) || null, closesAt: l.closesAt });
      return;
    }
    if (typeof l.closesAt !== "number" || l.closesAt < from || l.closesAt > now) return;
    if (l.result === "sold" && l.currentBidderIdx === teamIdx) won.push({ player: name, price: l.finalPrice || l.currentBid || 0 });
    else if (l.currentBidderIdx !== teamIdx) lost.push({ player: name, price: l.finalPrice || l.currentBid || 0, myBid: myMax(l) || null });
  });
  ongoing.sort((a, b) => (a.closesAt || 0) - (b.closesAt || 0));
  return { won, lost, ongoing, sold };
}

function contractsOf(league, team) {
  const season = typeof league.contractSeason === "function" ? league.contractSeason() : (league.seasonNumber || 1);
  const extensions = [], raises = [];
  (team.players || []).forEach(p => {
    if (typeof p.contractUntilSeason === "number" && p.contractUntilSeason - season + 1 === 1 && !p.retiringAfterSeason) {
      extensions.push({ player: p.name, salary: p.salary || 0 });
    }
    if (p.raiseRequest && typeof p.raiseRequest.asked === "number") raises.push({ player: p.name, asked: p.raiseRequest.asked, salary: p.salary || 0 });
  });
  return { extensions, raises };
}

function nextMatchesOf(league, teamIdx, now, to, nationalCup) {
  const out = [];
  // Championnat (et barrage/play-offs : même compteur de journées).
  if (!league.isRegularSeasonDone || !league.isRegularSeasonDone()) {
    for (let r = league.round || 0; r < (league.totalRounds || 0); r++) {
      const at = Calendar.scheduledTimeForLeagueRound(league, r);
      if (typeof at !== "number") continue;
      if (at >= to) break;
      if (at < now) continue;
      const m = (league.schedule[r] || []).find(x => x.home === teamIdx || x.away === teamIdx);
      if (!m) continue;
      const played = (league.results || []).some(x => x.round === r && (x.home === teamIdx || x.away === teamIdx));
      if (played) continue;
      const isHome = m.home === teamIdx;
      out.push({ at, competition: "league", isHome, opponent: (league.teams[isHome ? m.away : m.home] || {}).name || "?" });
    }
  } else if (league.playoffs && typeof league.nextUserPlayoffMatch === "function") {
    const m = league.nextUserPlayoffMatch(teamIdx);
    const at = m ? Calendar.scheduledTimeForLeagueRound(league, m.round) : null;
    if (m && typeof at === "number" && at >= now && at < to) out.push({ at, competition: "playoffs", isHome: m.isHome, opponent: (league.teams[m.opponent] || {}).name || "?" });
  }
  if (nationalCup && typeof nationalCup.at === "number" && nationalCup.at >= now && nationalCup.at < to) out.push({ ...nationalCup, competition: "cup" });
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_NEXT_MATCHES);
}

// Prochain match de Coupe nationale du club (tour en attente), ou null.
function nationalCupNext(world, leagueId, teamIdx, refLeague) {
  try {
    const cup = world && (world.cups || {})[refLeague.country || "fr"];
    if (!cup || cup.champion) return null;
    const r = cup.rounds[cup.rounds.length - 1];
    if (!r || r.resolved) return null;
    const mine = ref => ref && ref.leagueId === leagueId && ref.idx === teamIdx;
    const m = r.matches.find(x => mine(x.home) || mine(x.away));
    if (!m || m.bye || m.resolved || m.started || !m.home || !m.away) return null;
    const isHome = mine(m.home);
    const opp = isHome ? m.away : m.home;
    const at = Calendar.scheduledTimeForLeagueCupRound(refLeague, r.index);
    return typeof at === "number" ? { at, isHome, opponent: opp.name || "?" } : null;
  } catch (e) { return null; }
}

// Données complètes d'un club pour la semaine `week` (voir parisWeekOf).
function buildDigestData({ league, teamIdx, now, week = parisWeekOf(now), divisionLabel = null, world = null, leagueId = null }) {
  const team = league.teams[teamIdx];
  const cupNext = world ? nationalCupNext(world, leagueId || league.leagueId, teamIdx, league) : null;
  return {
    weekKey: week.key,
    club: team.name,
    manager: (Engine.managerPseudoOf && Engine.managerPseudoOf(team)) || null,
    results: weekResults(league, teamIdx, week.prevStart, week.start),
    standing: standingOf(league, teamIdx, divisionLabel),
    training: trainingOf(team),
    finances: financesOf(team),
    market: marketOf(league, teamIdx, week.prevStart, now),
    contracts: contractsOf(league, team),
    next: nextMatchesOf(league, teamIdx, now, week.nextStart, cupNext),
  };
}

// ---------------------------------------------------------------------
// Mise en forme (HTML + texte)
// ---------------------------------------------------------------------
const C = { bg: "#0d131d", panel: "#141c29", panel2: "#1a2433", line: "#26334a", ink: "#eef2f7", dim: "#9aa8bd", faint: "#6b7a92", amber: "#f0a23c", amberInk: "#2a1a04", ok: "#33b4a1", danger: "#e2694f" };
// Guillemets simples : la police est écrite dans des attributs style="…".
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function money(n, S) {
  try { return new Intl.NumberFormat(S.locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n); }
  catch (e) { return `${Math.round(n)} €`; }
}
function signedMoney(n, S) { return (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n), S); }
function dateTime(at, S) {
  try {
    return new Intl.DateTimeFormat(S.locale, { timeZone: PARIS, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
  } catch (e) { return new Date(at).toISOString(); }
}
function shortDate(at, S) {
  try { return new Intl.DateTimeFormat(S.locale, { timeZone: PARIS, weekday: "short", day: "numeric", month: "short" }).format(new Date(at)); }
  catch (e) { return ""; }
}
function attrLabel(attr, lang) {
  const fr = (Engine.TRAINING_LABELS || {})[attr] || attr;
  try { return I18n.translate(lang, fr); } catch (e) { return fr; }
}

function section(title, inner) {
  return `<tr><td style="padding:0 24px 18px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.panel};border:1px solid ${C.line};border-radius:12px;border-collapse:separate">`
    + `<tr><td style="padding:14px 18px 6px;font:700 12px/1.2 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:${C.amber}">${esc(title)}</td></tr>`
    + `<tr><td style="padding:4px 18px 14px">${inner}</td></tr></table></td></tr>`;
}
function rowsTable(rows) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
}
function row(left, right, opts = {}) {
  const border = opts.last ? "" : `border-bottom:1px solid ${C.line};`;
  return `<tr><td style="${border}padding:8px 0;font:400 14px/1.4 ${FONT};color:${C.ink}">${left}</td>`
    + `<td align="right" style="${border}padding:8px 0 8px 12px;font:600 14px/1.4 ${FONT};color:${opts.color || C.ink};white-space:nowrap">${right}</td></tr>`;
}
function empty(text) { return `<p style="margin:6px 0 2px;font:400 14px/1.5 ${FONT};color:${C.dim}">${esc(text)}</p>`; }
function sub(text) { return `<div style="font:400 12px/1.4 ${FONT};color:${C.dim};margin-top:2px">${text}</div>`; }
function badge(text, color) {
  return `<span style="display:inline-block;min-width:18px;padding:2px 6px;margin-right:8px;border-radius:6px;background:${color};color:${C.bg};font:700 12px/1.3 ${FONT};text-align:center">${esc(text)}</span>`;
}
function markRows(rowsArr) { if (rowsArr.length) rowsArr[rowsArr.length - 1] = rowsArr[rowsArr.length - 1].replace(/border-bottom:1px solid [^;]+;/g, ""); return rowsArr; }

function renderDigest(data, lang, { gameUrl = `${siteUrl()}/`, unsubscribeUrl = null, logoUrl = `${siteUrl()}/assets/brand/logo-hoop-manager.png` } = {}) {
  lang = I18n.normLang(lang) || "fr";
  const S = stringsFor(lang);
  const text = [];
  const blocks = [];
  // Deux-points : espace avant en français seulement.
  const CO = lang === "fr" ? " : " : lang === "zh" ? "：" : ": ";
  const compLabel = c => S.comp[c] || S.comp.league;
  const homeAway = h => (h ? S.home : S.away);

  text.push(S.title.toUpperCase(), "");
  text.push(data.manager ? fill(S.hello, { name: data.manager }) : S.helloAnon);
  text.push(fill(S.intro, { club: data.club }), "");

  // Résultats + classement
  {
    const r = data.results.map(m => {
      const won = m.scoreFor > m.scoreAgainst;
      return row(`${badge(won ? S.win : S.loss, won ? C.ok : C.danger)}${esc(m.opponent)} <span style="color:${C.dim}">(${esc(homeAway(m.isHome))})</span>${sub(`${esc(compLabel(m.competition))} · ${esc(shortDate(m.at, S))}`)}`,
        `${m.scoreFor} – ${m.scoreAgainst}`);
    });
    let inner = r.length ? rowsTable(markRows(r)) : empty(S.noResults);
    text.push(`== ${S.results} ==`);
    if (data.results.length) data.results.forEach(m => text.push(`- ${m.scoreFor > m.scoreAgainst ? S.win : S.loss} ${m.scoreFor}-${m.scoreAgainst} ${m.opponent} (${homeAway(m.isHome)}, ${compLabel(m.competition)})`));
    else text.push(S.noResults);
    if (data.standing) {
      const st = data.standing;
      const line = (st.division ? `${I18n.translate(lang, st.division)} · ` : "") + fill(S.standingLine, { pos: st.pos, n: st.n, points: st.points, w: st.wins, l: st.losses });
      inner += `<div style="margin-top:10px;padding:10px 12px;background:${C.panel2};border-radius:8px;font:400 14px/1.4 ${FONT};color:${C.ink}"><span style="color:${C.dim}">${esc(S.standing)} · </span><b style="color:${C.amber}">${esc(line)}</b></div>`;
      text.push(`${S.standing}${CO}${line}`);
    }
    text.push("");
    blocks.push(section(S.results, inner));
  }

  // Entraînement (fondamentaux, voir digestTrainedPlayers)
  {
    const ps = data.training.players;
    text.push(`== ${S.training} ==`);
    let inner;
    if (!ps.length) {
      const msg = data.training.trained ? S.noUps : S.noTraining;
      inner = empty(msg); text.push(msg);
    } else {
      const prog = p => I18n.translate(lang, p.programLabel || p.program || "");
      inner = rowsTable(markRows(ps.map(p => {
        const skills = p.skills.map(k => `${esc(attrLabel(k.attr, lang))} ${k.before} → <b style="color:${C.ok}">${k.after}</b> <span style="color:${C.ok}">(+${k.gain})</span>`).join("<br>");
        text.push(`- ${p.name} · ${S.program}${CO}${prog(p)} · ${p.skills.map(k => `${attrLabel(k.attr, lang)} ${k.before} -> ${k.after} (+${k.gain})`).join(", ")}`);
        return row(`<b>${esc(p.name)}</b>${sub(`${esc(S.program)}${CO}<span style="color:${C.amber}">${esc(prog(p))}</span>`)}<div style="font:400 13px/1.5 ${FONT};color:${C.ink};margin-top:4px">${skills}</div>`,
          `+${p.total}`, { color: C.ok });
      })));
    }
    text.push("");
    blocks.push(section(S.training, inner));
  }

  // Finances
  {
    const f = data.finances;
    const rowsArr = [];
    if (f.hasWeek) {
      rowsArr.push(row(esc(S.income), signedMoney(f.income, S), { color: C.ok }));
      rowsArr.push(row(esc(S.expenses), signedMoney(f.expenses, S), { color: C.danger }));
      rowsArr.push(row(`<b>${esc(S.net)}</b>`, signedMoney(f.net, S), { color: f.net >= 0 ? C.ok : C.danger }));
    }
    rowsArr.push(row(`<b>${esc(S.budget)}</b>`, money(f.budget, S), { color: C.amber }));
    text.push(`== ${S.finances} ==`);
    if (f.hasWeek) text.push(`${S.income}${CO}${signedMoney(f.income, S)}`, `${S.expenses}${CO}${signedMoney(f.expenses, S)}`, `${S.net}${CO}${signedMoney(f.net, S)}`);
    text.push(`${S.budget}${CO}${money(f.budget, S)}`, "");
    blocks.push(section(S.finances, rowsTable(markRows(rowsArr))));
  }

  // Marché
  {
    const m = data.market;
    const rowsArr = [];
    text.push(`== ${S.market} ==`);
    // Nom inconnu : la ligne porte seulement son libellé (jamais « ? »).
    const who = (x, label, extraSub = "") => x.player
      ? `<b>${esc(x.player)}</b>${sub(esc(label) + extraSub)}`
      : `<b>${esc(label)}</b>${extraSub ? sub(extraSub.replace(/^ · /, "")) : ""}`;
    const whoTxt = (x, label) => (x.player ? `${label}${CO}${x.player}` : label);
    m.won.forEach(x => { rowsArr.push(row(`${badge("✓", C.ok)}${who(x, S.won)}`, money(x.price, S), { color: C.ok })); text.push(`- ${whoTxt(x, S.won)} (${money(x.price, S)})`); });
    m.sold.forEach(x => { rowsArr.push(row(`${badge("€", C.amber)}${who(x, S.sold)}`, money(x.price, S), { color: C.amber })); text.push(`- ${whoTxt(x, S.sold)} (${money(x.price, S)})`); });
    m.ongoing.forEach(x => {
      const st = x.leading ? S.leading : S.outbid;
      rowsArr.push(row(`${badge(x.leading ? "↑" : "!", x.leading ? C.ok : C.danger)}${who(x, S.ongoing, ` · <span style="color:${x.leading ? C.ok : C.danger}">${esc(st)}</span>`)}`, money(x.price, S)));
      text.push(`- ${whoTxt(x, S.ongoing)} (${money(x.price, S)}) · ${st}`);
    });
    m.lost.forEach(x => { rowsArr.push(row(`${badge("✕", C.faint)}${who(x, S.lost)}`, money(x.price, S), { color: C.dim })); text.push(`- ${whoTxt(x, S.lost)} (${money(x.price, S)})`); });
    if (!rowsArr.length) text.push(S.noMarket);
    text.push("");
    blocks.push(section(S.market, rowsArr.length ? rowsTable(markRows(rowsArr)) : empty(S.noMarket)));
  }

  // Contrats
  {
    const c = data.contracts;
    const rowsArr = [];
    text.push(`== ${S.contracts} ==`);
    c.extensions.forEach(x => { rowsArr.push(row(`${badge("!", C.amber)}<b>${esc(x.player)}</b>${sub(esc(S.extension))}`, "")); text.push(`- ${x.player}${CO}${S.extension}`); });
    c.raises.forEach(x => {
      const t = fill(S.raise, { asked: money(x.asked, S), salary: money(x.salary, S) });
      rowsArr.push(row(`${badge("€", C.amber)}<b>${esc(x.player)}</b>${sub(esc(t))}`, ""));
      text.push(`- ${x.player}${CO}${t}`);
    });
    if (!rowsArr.length) text.push(S.noContracts);
    text.push("");
    blocks.push(section(S.contracts, rowsArr.length ? rowsTable(markRows(rowsArr)) : empty(S.noContracts)));
  }

  // Prochains matchs
  {
    const rowsArr = data.next.map(m => row(`<b>${esc(m.opponent)}</b> <span style="color:${C.dim}">(${esc(homeAway(m.isHome))})</span>${sub(esc(compLabel(m.competition)))}`, esc(dateTime(m.at, S)), { color: C.amber }));
    text.push(`== ${S.next} (${S.parisTime}) ==`);
    if (data.next.length) data.next.forEach(m => text.push(`- ${dateTime(m.at, S)}${CO}${m.opponent} (${homeAway(m.isHome)}, ${compLabel(m.competition)})`));
    else text.push(S.noNext);
    text.push("");
    blocks.push(section(`${S.next} · ${S.parisTime}`, rowsArr.length ? rowsTable(markRows(rowsArr)) : empty(S.noNext)));
  }

  text.push(`${S.cta}${CO}${gameUrl}`, "", S.footer);
  if (unsubscribeUrl) text.push(`${S.unsubscribe}${CO}${unsubscribeUrl}`);
  text.push("", "Hoop Manager");

  const greeting = data.manager ? fill(S.hello, { name: data.manager }) : S.helloAnon;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(S.title)}</title></head>`
    + `<body style="margin:0;padding:0;background:${C.bg};color:${C.ink}">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.bg}">`
    + `<tr><td align="center" style="padding:8px 24px 4px"><a href="${esc(gameUrl)}"><img src="${esc(logoUrl)}" width="140" alt="Hoop Manager" style="display:block;width:140px;height:auto;border:0"></a></td></tr>`
    + `<tr><td style="padding:8px 24px 4px;font:800 24px/1.25 ${FONT};color:${C.ink}">${esc(S.title)}</td></tr>`
    + `<tr><td style="padding:2px 24px 18px;font:400 15px/1.55 ${FONT};color:${C.dim}">${esc(greeting)}<br>${esc(fill(S.intro, { club: data.club }))}</td></tr>`
    + blocks.join("")
    + `<tr><td align="center" style="padding:6px 24px 26px"><a href="${esc(gameUrl)}" style="display:inline-block;background:${C.amber};color:${C.amberInk};font:700 16px/1 ${FONT};text-decoration:none;padding:15px 28px;border-radius:10px">${esc(S.cta)}</a></td></tr>`
    + `<tr><td align="center" style="padding:0 24px 24px;border-top:1px solid ${C.line}"><p style="margin:16px 0 6px;font:400 12px/1.5 ${FONT};color:${C.faint}">${esc(S.footer)}</p>`
    + (unsubscribeUrl ? `<p style="margin:0;font:400 12px/1.5 ${FONT}"><a href="${esc(unsubscribeUrl)}" style="color:${C.dim};text-decoration:underline">${esc(S.unsubscribe)}</a></p>` : "")
    + `</td></tr></table></td></tr></table></body></html>`;

  return { subject: fill(S.subject, { club: data.club }), text: text.join("\n"), html };
}

// Petite page de confirmation (désinscription / réinscription).
function renderConfirmPage(lang, { title, body, linkUrl = null, linkLabel = null }) {
  const S = stringsFor(lang);
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Hoop Manager</title>`
    + `<style>body{margin:0;background:${C.bg};color:${C.ink};font:400 16px/1.6 ${FONT};display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}`
    + `.card{max-width:440px;width:100%;background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:28px 24px;text-align:center}`
    + `h1{font-size:22px;margin:0 0 8px}p{color:${C.dim};margin:0 0 18px}a.btn{display:inline-block;background:${C.amber};color:${C.amberInk};font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px}a.alt{display:block;margin-top:14px;color:${C.dim};font-size:14px}</style></head>`
    + `<body><div class="card"><h1>${esc(title)}</h1><p>${esc(body)}</p><a class="btn" href="/">${esc(S.back)}</a>`
    + (linkUrl ? `<a class="alt" href="${esc(linkUrl)}">${esc(linkLabel)}</a>` : "")
    + `</div></body></html>`;
}

// ---------------------------------------------------------------------
// Préparation et envoi
// ---------------------------------------------------------------------
function unsubscribeUrlFor(account) {
  return `${siteUrl()}/api/email/unsubscribe-digest?token=${encodeURIComponent(signDigestToken(account.id))}`;
}

// Prépare les e-mails de la semaine et marque les comptes (sauvegardés AVANT
// tout envoi). À appeler sous le verrou de sauvegarde. Renvoie
// { weekKey, jobs: [{ to, subject, text, html, accountId }], skipped: {...} }.
async function prepareWeeklyDigests({ multiSavePath, accountsPath, now }) {
  const World = require("./world.js");
  const week = parisWeekOf(now);
  const result = { weekKey: week.key, jobs: [], skipped: { optOut: 0, noEmail: 0, noClub: 0, cpu: 0, inactive: 0, notUpdated: 0, already: 0 } };
  const data = await Accounts.loadAccounts(accountsPath);
  const candidates = [];
  data.accounts.forEach(a => {
    if (!a.email) { result.skipped.noEmail++; return; }
    if (a.digestOptOut) { result.skipped.optOut++; return; }
    if (!a.managerToken) { result.skipped.noClub++; return; }
    if (a.lastDigestWeekKey === week.key) { result.skipped.already++; return; }
    candidates.push(a);
  });
  if (!candidates.length) return result;
  const world = await World.loadWorld(multiSavePath, now);
  if (!world) return result;
  const leagues = new Map();
  const loadLeague = async id => {
    if (!leagues.has(id)) leagues.set(id, await World.loadLeague(world, id, multiSavePath));
    return leagues.get(id);
  };
  const inactiveMs = DIGEST_INACTIVE_DAYS * DAY_MS;
  const marked = [];
  for (const account of candidates) {
    try {
      const leagueId = world.tokens[account.managerToken];
      const league = leagueId ? await loadLeague(leagueId) : null;
      const teamIndex = league ? league.teams.findIndex(t => t && t.managerLinkToken === account.managerToken) : -1;
      if (teamIndex === -1) { result.skipped.noClub++; continue; }
      const team = league.teams[teamIndex];
      const found = { team, teamIndex };
      if (!team.isHuman) { result.skipped.cpu++; continue; }
      const lastSeen = Math.max(typeof team.lastSeenAt === "number" ? team.lastSeenAt : 0, typeof account.lastLoginAt === "number" ? account.lastLoginAt : 0);
      if (!lastSeen || now - lastSeen > inactiveMs) { result.skipped.inactive++; continue; }
      // Mise à jour du lundi pas encore appliquée à cette ligue (rattrapage
      // en retard) : on réessaiera au prochain passage.
      const nextEco = Calendar.scheduledTimeForLeagueEconomyTick(league, (league.lastEconomyTick || 0) + 1);
      if (typeof nextEco === "number" && nextEco <= now) { result.skipped.notUpdated++; continue; }
      const entry = world.leagues.find(e => e.id === leagueId);
      World.useLeagueTimeZone(league);
      let digest;
      try {
        digest = buildDigestData({ league, teamIdx: found.teamIndex, now, week, world, leagueId, divisionLabel: entry ? World.divisionLabel(entry.level, entry.group) : null });
      } finally { World.useLeagueTimeZone(null); }
      const lang = Accounts.langFor(account, { country: league.country || team.country || null });
      const mail = renderDigest(digest, lang, { unsubscribeUrl: unsubscribeUrlFor(account) });
      result.jobs.push({ to: account.email, accountId: account.id, lang, ...mail });
      account.lastDigestWeekKey = week.key;
      account.lastDigestAt = now;
      marked.push(account);
    } catch (e) {
      console.warn(`[résumé hebdo] compte ${account.id} ignoré :`, e.message);
    }
  }
  if (marked.length) await Accounts.saveAccounts(data, accountsPath);
  return result;
}

// Envoi par petits lots, sans jamais lever.
async function sendJobs(jobs, { send = Mailer.sendMail, batchSize = SEND_BATCH_SIZE, pauseMs = SEND_BATCH_PAUSE_MS } = {}) {
  let ok = 0, failed = 0;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(j => Promise.resolve()
      .then(() => send({ to: j.to, subject: j.subject, text: j.text, html: j.html }))
      .catch(e => ({ ok: false, error: e.message }))));
    res.forEach((r, k) => {
      if (r && r.ok) ok++;
      else { failed++; console.warn(`[résumé hebdo] envoi échoué (compte ${batch[k].accountId}) :`, (r && r.error) || "?"); }
    });
    if (pauseMs && i + batchSize < jobs.length) await new Promise(r => setTimeout(r, pauseMs));
  }
  return { ok, failed };
}

// Point d'entrée appelé par server/index.js:maybeCatchUpWorld : ne bloque
// jamais l'appelant (renvoie tout de suite), ne lève jamais. `acquireLock` :
// verrou de sauvegarde du serveur (comptes et ligues lus sans s'entrelacer
// avec une requête). Une seule tentative en cours à la fois par fichier ;
// une tentative réussie par semaine et par processus (les comptes gardent en
// plus `lastDigestWeekKey`, qui survit aux redémarrages).
const runState = new Map(); // multiSavePath -> { running, doneWeekKey }
function scheduleWeeklyDigests({ multiSavePath, accountsPath, now, acquireLock = null, send = null, mailConfigured = Mailer.mailConfigured }) {
  try {
    if (!mailConfigured()) return null;
    if (!isDigestDue(now)) return null;
    const weekKey = parisWeekOf(now).key;
    const st = runState.get(multiSavePath) || {};
    if (st.running || st.doneWeekKey === weekKey) return null;
    st.running = true;
    runState.set(multiSavePath, st);
    return new Promise(resolve => setImmediate(resolve)).then(async () => {
      let prepared = null;
      const release = acquireLock ? await acquireLock() : null;
      try {
        prepared = await prepareWeeklyDigests({ multiSavePath, accountsPath, now });
        // Comptes « pas encore à jour » : on retentera au prochain passage.
        if (!prepared.skipped.notUpdated) st.doneWeekKey = weekKey;
      } finally { if (release) release(); }
      if (prepared.jobs.length) {
        const r = await sendJobs(prepared.jobs, send ? { send } : {});
        console.log(`[résumé hebdo] semaine ${weekKey} : ${r.ok} envoyé(s), ${r.failed} échec(s).`);
      }
      return prepared;
    }).catch(e => {
      console.warn("[résumé hebdo] échec :", e.message);
      return null;
    }).finally(() => { st.running = false; });
  } catch (e) {
    console.warn("[résumé hebdo] échec :", e.message);
    return null;
  }
}
function _resetForTests() { runState.clear(); }

// ---------------------------------------------------------------------
// Routes : GET /api/email/unsubscribe-digest?token=… et
//          GET /api/email/resubscribe-digest?token=…
// Renvoie true si la route a été traitée. Pages HTML minimales.
// ---------------------------------------------------------------------
async function handleDigestRoutes(req, res, route, { accountsPath, siteLangFor = null }) {
  const p = route.pathname;
  const unsub = p === "/api/email/unsubscribe-digest";
  const resub = p === "/api/email/resubscribe-digest";
  if (!unsub && !resub) return false;
  const send = (status, html) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
    res.end(html);
  };
  const fallbackLang = (siteLangFor && siteLangFor(req)) || "fr";
  if (req.method !== "GET") { send(405, renderConfirmPage(fallbackLang, { title: stringsFor(fallbackLang).invalid, body: "" })); return true; }
  const token = route.searchParams.get("token");
  const id = verifyDigestToken(token);
  let data = null, account = null;
  if (id) {
    data = await Accounts.loadAccounts(accountsPath);
    account = data.accounts.find(a => a.id === id) || null;
  }
  if (!account) {
    const S = stringsFor(fallbackLang);
    send(400, renderConfirmPage(fallbackLang, { title: S.invalid, body: "" }));
    return true;
  }
  const lang = Accounts.langFor(account, { hint: fallbackLang });
  const S = stringsFor(lang);
  const want = !!unsub;
  if (!!account.digestOptOut !== want) {
    account.digestOptOut = want;
    account.digestOptOutAt = Date.now();
    await Accounts.saveAccounts(data, accountsPath);
  }
  const q = `?token=${encodeURIComponent(token)}`;
  send(200, unsub
    ? renderConfirmPage(lang, { title: S.unsubTitle, body: S.unsubBody, linkUrl: `/api/email/resubscribe-digest${q}`, linkLabel: S.resub })
    : renderConfirmPage(lang, { title: S.resubTitle, body: S.resubBody, linkUrl: `/api/email/unsubscribe-digest${q}`, linkLabel: S.unsubscribe }));
  return true;
}

module.exports = {
  STRINGS, DIGEST_HOUR_PARIS, DIGEST_SEND_WINDOW_MS, DIGEST_INACTIVE_DAYS,
  parisWeekOf, isDigestDue, signDigestToken, verifyDigestToken,
  buildDigestData, digestTrainedPlayers, renderDigest, renderConfirmPage, prepareWeeklyDigests, sendJobs,
  scheduleWeeklyDigests, handleDigestRoutes, unsubscribeUrlFor, siteUrl, _resetForTests,
};
