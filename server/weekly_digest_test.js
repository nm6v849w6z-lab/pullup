"use strict";
// Résumé de la semaine par e-mail (demande du 2026-10-01, voir
// server/weeklyDigest.js) : contenu (toutes les rubriques, états vides),
// langue du compte, une seule fois par semaine, désinscription par lien
// signé, clubs de l'IA et managers inactifs ignorés, aucun envoi sans
// fournisseur d'e-mail.
process.env.BASKET_INVITE_CODE = "off";
delete process.env.RESEND_API_KEY;
delete process.env.MAIL_FROM;
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const store = require("./store.js");
const World = require("./world.js");
const Accounts = require("./accounts.js");
const AutoSim = require("./autoSim.js");
const Calendar = require("./calendar.js");
const Digest = require("./weeklyDigest.js");
const Engine = require("../engine.js");
const { createHandler, maybeCatchUpWorld } = require("./index.js");

const D = 24 * 3600 * 1000;
const ok = m => console.log("✅ " + m);
// Lundi 28/09/2026 8h UTC (10h Paris) : création ; lundi 05/10 9h30 Paris :
// premier résumé (après la mise à jour de 6h).
const CREATED = Date.UTC(2026, 8, 28, 8);
const MONDAY = Date.UTC(2026, 9, 5, 7, 30);

(async () => {
  // -------------------------------------------------------------------
  // Semaine et échéance (heure de Paris)
  // -------------------------------------------------------------------
  const w = Digest.parisWeekOf(MONDAY);
  assert.strictEqual(w.key, "2026-10-05");
  assert.strictEqual(w.start, Date.UTC(2026, 9, 4, 22), "lundi 0h Paris (UTC+2)");
  assert.strictEqual(w.prevStart, w.start - 7 * D);
  assert.strictEqual(Digest.parisWeekOf(Date.UTC(2026, 9, 11, 21)).key, "2026-10-05", "dimanche 23h Paris : même semaine");
  assert.strictEqual(Digest.parisWeekOf(Date.UTC(2026, 9, 11, 22, 30)).key, "2026-10-12", "lundi 0h30 Paris : semaine suivante");
  assert.ok(!Digest.isDigestDue(Date.UTC(2026, 9, 5, 6, 59)), "lundi 8h59 Paris : trop tôt");
  assert.ok(Digest.isDigestDue(Date.UTC(2026, 9, 5, 7, 0)), "lundi 9h Paris : dû");
  assert.ok(Digest.isDigestDue(Date.UTC(2026, 9, 6, 20)), "mardi soir : encore dû (rattrapage)");
  assert.ok(!Digest.isDigestDue(Date.UTC(2026, 9, 7, 7, 0)), "mercredi 9h : semaine sautée");
  ok("semaine de Paris et fenêtre d'envoi (lundi 9h → mercredi 9h)");

  // -------------------------------------------------------------------
  // Contenu : toutes les rubriques
  // -------------------------------------------------------------------
  const { league } = store.createMultiManagerCareer(["Lyon Digest", "Paris Digest"], CREATED);
  World.useLeagueTimeZone(league);
  {
    // Programme de fondamentaux aux postes de l'effectif : entraînement réel.
    const T = league.teams.find(t => t.name === "Lyon Digest");
    // Sans entraîneur, aucun travail des fondamentaux (règle du 2026-10-01).
    if (!T.trainer) T.hireTrainer(3, 3000);
    // Programmes individuels : un créneau par joueur (dans la limite de l'entraîneur).
    T.trainingSlots = T.players.slice(0, T.trainingSlotsMax()).map(p => ({ playerId: p.id, program: "threePoint", intensity: "normale" }));
  }
  AutoSim.catchUpLeague(league, MONDAY);
  const idx = league.teams.findIndex(t => t.name === "Lyon Digest");
  const team = league.teams[idx];
  team.managerPseudo = "CoachTest";
  assert.ok(league.results.filter(r => r.home === idx || r.away === idx).length >= 2, "deux journées jouées");
  assert.ok(team.lastTrainingReport, "mise à jour du lundi passée");
  // Entraînement : rapport RÉEL du moteur d'abord (seuls les joueurs dont
  // le programme a vraiment porté, gains limités aux fondamentaux).
  {
    const real = Digest.digestTrainedPlayers(team);
    const report = team.lastTrainingReport.players;
    const expected = Object.values(report).filter(e => (e.program || e.effectiveFocus) && e.secondsPlayed > 0 && e.attendanceFactor !== 0).length;
    assert.strictEqual(real.length, expected, "rapport réel : exactement les joueurs entraînés");
    assert.ok(real.every(x => x.skills.every(k => Engine.FUNDAMENTAL_ATTRS.includes(k.attr))), "rapport réel : fondamentaux seulement");
    assert.ok(real.length >= 1, "au moins un joueur réellement entraîné");
    assert.ok(real.every(x => x.skills.every(k => k.gain >= 1)), "rapport réel : montées d'au moins 1 point seulement");
    const data0 = Digest.buildDigestData({ league, teamIdx: idx, now: MONDAY });
    assert.strictEqual(data0.training.trained, real.length);
    assert.deepStrictEqual(data0.training.players.map(x => x.name), real.filter(x => x.skills.length).map(x => x.name), "seuls les entraînés qui ont monté sont listés");
  }
  // Rapport maîtrisé (indépendant du moteur).
  const [pA, pB, pC, pD, pE] = team.players;
  const multi = Object.keys(Engine.TRAINING_PROGRAMS).find(k => Engine.TRAINING_PROGRAMS[k].attrs.length >= 2);
  const [m1, m2] = Engine.TRAINING_PROGRAMS[multi].attrs.map(a => a.attr);
  const synergy = Engine.FUNDAMENTAL_ATTRS.find(a => !Engine.TRAINING_PROGRAMS[multi].attrs.some(x => x.attr === a));
  pB.attrs.threePoint = 33;
  team.lastTrainingReport = { players: {
    // Entraîné, gain au tir à 3 points + croissance physique naturelle (exclue).
    [pA.id]: { name: pA.name, effectiveFocus: "threePoint", secondsPlayed: 1200, attendanceFactor: 1,
      gains: [{ attr: "threePoint", before: 40, after: 42 }, { attr: "speed", before: 30, after: 31 }] },
    // Entraîné sans point entier gagné : pas listé.
    [pB.id]: { name: pB.name, effectiveFocus: "threePoint", secondsPlayed: 600, attendanceFactor: 0.5, gains: [] },
    // Pas entraîné (n'a pas joué au poste) : croissance naturelle seulement.
    [pC.id]: { name: pC.name, effectiveFocus: null, secondsPlayed: 0, attendanceFactor: 0,
      gains: [{ attr: "strength", before: 20, after: 21 }, { attr: "decision", before: 30, after: 31 }] },
    // Programme choisi mais aucune minute : pas entraîné.
    [pD.id]: { name: pD.name, effectiveFocus: "threePoint", secondsPlayed: 0, attendanceFactor: 0, gains: [] },
    // Programme à plusieurs fondamentaux + synergie (exclue).
    [pE.id]: { name: pE.name, effectiveFocus: multi, secondsPlayed: 2400, attendanceFactor: 1,
      gains: [{ attr: m1, before: 50, after: 51 }, { attr: synergy, before: 10, after: 11 }] },
  } };
  // Play-offs et Coupe via l'historique des ordres.  // Play-offs et Coupe via l'historique des ordres.
  team.ordersHistory = [
    { round: 1, competition: "cup", at: w.start - 3 * D, opponentName: "Nantes Coupe", isHome: false, scoreFor: 80, scoreAgainst: 70 },
    { round: 0, competition: "friendly", at: w.start - 2 * D, opponentName: "Amical", isHome: true, scoreFor: 1, scoreAgainst: 2 },
    { round: 1, competition: "cup", at: w.prevStart - D, opponentName: "Trop vieux", isHome: true, scoreFor: 1, scoreAgainst: 2 },
  ];
  // Marché.
  const otherIdx = league.teams.findIndex((t, i) => i !== idx && !t.isHuman);
  const other = league.teams[otherIdx];
  const thirdIdx = league.teams.findIndex((t, i) => i !== idx && i !== otherIdx);
  let lid = 1;
  const mk = o => Object.assign({ id: 77000 + lid++, bids: [], status: "closed", startPrice: 1000, currentBid: null, currentBidderIdx: null, closesAt: MONDAY - 2 * D }, o);
  const mine = team.players[team.players.length - 1];
  league.transferListings.push(
    mk({ playerId: other.players[0].id, sellerIdx: otherIdx, result: "sold", finalPrice: 42000, currentBid: 42000, currentBidderIdx: idx, bids: [{ bidderIdx: idx, amount: 42000 }] }),
    mk({ playerId: other.players[1].id, sellerIdx: otherIdx, result: "sold", finalPrice: 61000, currentBid: 61000, currentBidderIdx: thirdIdx, bids: [{ bidderIdx: idx, amount: 55000 }, { bidderIdx: thirdIdx, amount: 61000 }] }),
    mk({ playerId: other.players[2].id, sellerIdx: otherIdx, status: "open", result: null, currentBid: 38000, currentBidderIdx: thirdIdx, closesAt: MONDAY + D, bids: [{ bidderIdx: idx, amount: 35000 }, { bidderIdx: thirdIdx, amount: 38000 }] }),
    mk({ playerId: other.players[3].id, sellerIdx: otherIdx, status: "open", result: null, currentBid: 12000, currentBidderIdx: idx, closesAt: MONDAY + D, bids: [{ bidderIdx: idx, amount: 12000 }] }),
    mk({ playerId: mine.id, sellerIdx: idx, result: "sold", finalPrice: 27500, currentBid: 27500, currentBidderIdx: otherIdx }),
    mk({ playerId: other.players[4].id, sellerIdx: otherIdx, result: "sold", finalPrice: 9000, currentBid: 9000, currentBidderIdx: idx, closesAt: w.prevStart - D }),
    // Joueurs partis de la ligue (autre championnat) : nom par l'actualité
    // des transferts, par l'historique des ventes, ou inconnu.
    mk({ id: 88001, playerId: 990001, sellerIdx: idx, result: "sold", finalPrice: 15000, currentBid: 15000, currentBidderIdx: otherIdx }),
    mk({ id: 88002, playerId: 990002, sellerIdx: idx, result: "sold", finalPrice: 16000, currentBid: 16000, currentBidderIdx: otherIdx }),
    mk({ id: 88003, playerId: 990003, sellerIdx: idx, result: "sold", finalPrice: 17000, currentBid: 17000, currentBidderIdx: otherIdx }),
  );
  league.transferNews = (league.transferNews || []).concat([{ id: 88001, playerId: 990001, playerName: "Parti Actu", at: MONDAY - 2 * D }]);
  team.transactions = [{ week: team.week - 1, label: "Vente de Parti Compta (enchères)", amount: 16000 }].concat(team.transactions || []);
  // Contrats.
  const season = league.contractSeason();
  team.players.forEach(p => { p.contractUntilSeason = season + 2; p.raiseRequest = null; p.retiringAfterSeason = false; });
  team.players[1].contractUntilSeason = season;
  team.players[3].contractUntilSeason = season; team.players[3].retiringAfterSeason = true;
  team.players[2].raiseRequest = { asked: 9999, at: MONDAY, season };

  const data = Digest.buildDigestData({ league, teamIdx: idx, now: MONDAY, divisionLabel: "Division I" });
  World.useLeagueTimeZone(null);
  assert.strictEqual(data.club, "Lyon Digest");
  assert.strictEqual(data.manager, "CoachTest");
  const champ = data.results.filter(r => r.competition === "league");
  assert.strictEqual(champ.length, 2, "deux matchs de championnat dans la semaine");
  assert.ok(champ.every(r => typeof r.scoreFor === "number" && r.opponent), "score et adversaire");
  const cup = data.results.filter(r => r.competition === "cup");
  assert.deepStrictEqual(cup.map(r => r.opponent), ["Nantes Coupe"], "Coupe de la semaine seulement, jamais les amicaux");
  assert.ok(data.results.every((r, i, a) => !i || a[i - 1].at <= r.at), "résultats dans l'ordre");
  assert.ok(data.standing && data.standing.pos >= 1 && data.standing.n === 10 && data.standing.played === 2, "classement");
  const tr = data.training.players;
  assert.strictEqual(data.training.trained, 3, "3 joueurs entraînés (pA, pB, pE), pas les autres");
  assert.deepStrictEqual(tr.map(x => x.name).sort(), [pA.name, pE.name].sort(), "listés : les entraînés qui ont monté (pB sans montée absent)");
  const tA = tr.find(x => x.name === pA.name), tE = tr.find(x => x.name === pE.name);
  assert.deepStrictEqual(tA, { name: pA.name, program: "threePoint", programLabel: "Tir à 3 points", skills: [{ attr: "threePoint", before: 40, after: 42, gain: 2 }], total: 2 }, "programme + fondamental entraîné seulement (pas la vitesse)");
  assert.strictEqual(tE.program, multi);
  assert.deepStrictEqual(tE.skills.map(k => [k.attr, k.gain]), [[m1, 1]], "seulement les montées du programme (pas +0, pas la synergie)");
  assert.ok(!tE.skills.some(k => k.attr === m2));
  assert.strictEqual(tr[0].name, pA.name, "plus gros gain en premier");
  assert.ok(data.finances.hasWeek && data.finances.budget === Math.round(team.budget), "finances de la semaine");
  assert.strictEqual(data.finances.net, data.finances.income + data.finances.expenses);
  assert.deepStrictEqual(data.market.won.map(x => x.price), [42000], "enchère gagnée (celle d'avant la semaine exclue)");
  assert.deepStrictEqual(data.market.lost.map(x => x.myBid), [55000], "enchère perdue");
  assert.deepStrictEqual(data.market.ongoing.map(x => x.leading).sort(), [false, true], "enchères en cours (surenchéri / en tête)");
  assert.deepStrictEqual(data.market.sold.map(x => x.player), [mine.name, "Parti Actu", "Parti Compta", null], "ventes : nom retrouvé même parti (effectifs, actualité, historique), sinon inconnu");
  assert.deepStrictEqual(data.contracts.extensions.map(x => x.player), [team.players[1].name], "prolongation (pas le joueur qui prend sa retraite)");
  assert.deepStrictEqual(data.contracts.raises.map(x => x.asked), [9999], "augmentation demandée");
  assert.ok(data.next.length >= 2 && data.next.every(m => m.at > MONDAY && m.at < w.nextStart && m.opponent), "prochains matchs de la semaine");
  ok("données : résultats (championnat + Coupe), classement, entraînement, finances, marché, contrats, prochains matchs");

  const fr = Digest.renderDigest(data, "fr", { unsubscribeUrl: "https://x.test/api/email/unsubscribe-digest?token=abc", gameUrl: "https://x.test/" });
  assert.ok(/Lyon Digest/.test(fr.subject));
  for (const s of ["Résultats de la semaine", "Classement", "Entraînement", "Tir à 3 points 40 → <b", "42</b>", "(+2)", "Programme : <span", "Finances", "Budget actuel", "Enchère remportée", "Enchère perdue", "Tu as été surenchéri", "Tu mènes", "Joueur vendu",
    "Dernière saison de contrat", "Demande une augmentation", "Prochains matchs", "heure de Paris", "Ouvrir Hoop Manager", "https://x.test/", "Ne plus recevoir ce résumé", "Nantes Coupe", "Coupe nationale", "Bonjour CoachTest"]) {
    assert.ok(fr.html.includes(s), `HTML : « ${s} »`);
  }
  assert.ok(/Programme : Tir à 3 points — Tir à 3 points 40 -> 42 \(\+2\)/.test(fr.text) && /Ne plus recevoir ce résumé : https:\/\/x\.test/.test(fr.text), "version texte");
  assert.ok(!/font:[^;"]*"Segoe/.test(fr.html) && /font:[^;"]*'Segoe UI'/.test(fr.html), "attributs style bien fermés (police entre guillemets simples)");
  {
    const market = fr.html.slice(fr.html.indexOf("Marché des transferts"), fr.html.indexOf("Contrats"));
    assert.ok(!/>\?</.test(market) && !market.includes("<b>?</b>"), "jamais « ? » comme nom");
    assert.ok(market.includes("<b>Joueur vendu</b>"), "nom inconnu : « Joueur vendu » seul");
    assert.ok(market.includes("Parti Actu") && market.includes("Parti Compta"));
    assert.ok(/- Joueur vendu \(17/.test(fr.text), "texte : « Joueur vendu » sans nom");
  }
  const trainingHtml = fr.html.slice(fr.html.indexOf(">Entraînement<"), fr.html.indexOf(">Finances<"));
  assert.ok(!trainingHtml.includes(pB.name) && !/\(\+0\)/.test(fr.html) && !/,\d \(\+/.test(fr.text), "ni +0, ni décimales");
  // Entraînés mais aucune montée : ligne dédiée (≠ personne d'entraîné).
  {
    const d2 = { ...data, training: { trained: 2, players: [] } };
    const h = Digest.renderDigest(d2, "fr", {}).html;
    assert.ok(h.includes("Aucune progression visible cette semaine pour les joueurs entraînés.") && !h.includes("Aucun joueur entraîné aux fondamentaux"), "entraînés sans montée");
    const h0 = Digest.renderDigest({ ...data, training: { trained: 0, players: [] } }, "fr", {}).html;
    assert.ok(h0.includes("Aucun joueur entraîné aux fondamentaux cette semaine.") && !h0.includes("Aucune progression visible"), "personne d'entraîné");
  }
  ok("rendu français (HTML + texte) : chaque rubrique, bouton et lien de désinscription");

  // États vides.
  const fresh = store.createMultiManagerCareer(["Nice Vide"], CREATED).league;
  World.useLeagueTimeZone(fresh);
  const emptyData = Digest.buildDigestData({ league: fresh, teamIdx: 0, now: CREATED + 3600e3 });
  World.useLeagueTimeZone(null);
  assert.deepStrictEqual([emptyData.results.length, emptyData.training.players.length, emptyData.market.won.length + emptyData.market.lost.length + emptyData.market.ongoing.length + emptyData.market.sold.length], [0, 0, 0]);
  emptyData.next = [];
  emptyData.contracts = { extensions: [], raises: [] };
  const emptyFr = Digest.renderDigest(emptyData, "fr", {});
  for (const s of ["Aucun match officiel cette semaine.", "Aucun joueur entraîné aux fondamentaux cette semaine.", "Aucune activité sur le marché cette semaine.", "Rien à signaler sur les contrats.", "Aucun match officiel programmé cette semaine.", "Budget actuel", "Bonjour,"]) {
    assert.ok(emptyFr.html.includes(s), `vide : « ${s} »`);
  }
  assert.ok(!emptyFr.html.includes("Ne plus recevoir"), "pas de lien de désinscription sans URL");
  ok("états vides de chaque rubrique");

  // -------------------------------------------------------------------
  // Langues
  // -------------------------------------------------------------------
  const keys = Object.keys(Digest.STRINGS.fr).sort();
  for (const lang of ["en", "it", "es", "pt", "de", "pl", "el", "lt", "zh"]) {
    assert.deepStrictEqual(Object.keys(Digest.STRINGS[lang]).sort(), keys, `${lang} : toutes les clés`);
    assert.deepStrictEqual(Object.keys(Digest.STRINGS[lang].comp).sort(), Object.keys(Digest.STRINGS.fr.comp).sort());
    const m = Digest.renderDigest(data, lang, { unsubscribeUrl: "https://x.test/u" });
    const S = Digest.STRINGS[lang];
    assert.ok(m.html.includes(`lang="${lang}"`) && m.subject.includes("Lyon Digest"), `${lang} : langue et objet`);
    for (const k of ["results", "training", "finances", "market", "contracts", "cta", "unsubscribe"]) assert.ok(m.html.includes(S[k].replace(/'/g, "&#39;")), `${lang} : ${k}`);
    assert.ok(!m.html.includes("Résultats de la semaine"), `${lang} : rien en français`);
    const e = Digest.renderDigest({ ...emptyData }, lang, {});
    assert.ok(e.html.includes(S.noTraining.replace(/'/g, "&#39;")) && S.noTraining !== Digest.STRINGS.fr.noTraining, `${lang} : aucun joueur entraîné (traduit)`);
    const u = Digest.renderDigest({ ...emptyData, training: { trained: 1, players: [] } }, lang, {});
    assert.ok(u.html.includes(S.noUps.replace(/'/g, "&#39;")) && S.noUps !== Digest.STRINGS.fr.noUps, `${lang} : aucune progression visible (traduit)`);
  }
  const en = Digest.renderDigest(data, "en", {});
  assert.ok(en.html.includes("3-point shot 40 → <b"), "caractéristiques traduites par le dictionnaire du jeu");
  assert.ok(/€42,000/.test(en.html), "montants au format de la langue");
  assert.ok(Digest.renderDigest(data, "xx", {}).html.includes("Résultats de la semaine"), "langue inconnue : français");
  // Langue du compte (Accounts.langFor).
  assert.strictEqual(Accounts.langFor({ lang: "de" }, { country: "fr" }), "de");
  assert.strictEqual(Accounts.langFor({ detectedLang: "it" }, { country: "fr" }), "it");
  ok("10 langues complètes, langue du compte appliquée");

  // -------------------------------------------------------------------
  // Lien signé
  // -------------------------------------------------------------------
  const tok = Digest.signDigestToken("abc123");
  assert.strictEqual(Digest.verifyDigestToken(tok), "abc123");
  assert.strictEqual(Digest.verifyDigestToken(tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A")), null);
  assert.strictEqual(Digest.verifyDigestToken("autre." + tok.split(".")[1]), null);
  assert.strictEqual(Digest.verifyDigestToken(null), null);
  ok("jeton de désinscription signé (falsification refusée)");

  // -------------------------------------------------------------------
  // Préparation sur un vrai monde : garde-fous et une fois par semaine
  // -------------------------------------------------------------------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-"));
  const paths = { solo: path.join(dir, "solo.json"), multi: path.join(dir, "multi.json"), accounts: path.join(dir, "accounts.json") };
  const career = store.createMultiManagerCareer(["Lyon Mail", "Paris Mail", "Nice Mail", "Brest Mail"], CREATED);
  const humans = career.league.teams.filter(t => t.isHuman);
  humans.forEach(t => { t.lastSeenAt = MONDAY - D; });
  humans[2].lastSeenAt = MONDAY - 40 * D; // inactif
  await store.saveMultiLeague(career.league, paths.multi);
  const accData = { version: 1, accounts: [] };
  const acc = (fields) => Accounts.createAccount(accData, fields, CREATED);
  const a1 = acc({ email: "lyon@test.fr", managerToken: humans[0].managerLinkToken, lang: "en" });
  const a2 = acc({ email: "paris@test.fr", managerToken: humans[1].managerLinkToken }); a2.digestOptOut = true;
  const a3 = acc({ email: "nice@test.fr", managerToken: humans[2].managerLinkToken }); a3.lastLoginAt = CREATED - 60 * D;
  const a4 = acc({ email: "brest@test.fr", managerToken: humans[3].managerLinkToken });
  acc({ discordId: "d1", managerToken: humans[1].managerLinkToken }); // sans e-mail
  acc({ email: "attente@test.fr" }); // liste d'attente
  await Accounts.saveAccounts(accData, paths.accounts);
  // Monde rattrapé jusqu'au lundi (mail désactivé : aucun résumé ici).
  await maybeCatchUpWorld(paths.multi, MONDAY, true, paths.accounts);
  assert.ok(!(await Accounts.loadAccounts(paths.accounts)).accounts.some(a => a.lastDigestWeekKey), "sans fournisseur d'e-mail : rien n'est préparé");
  // Un club repassé à l'IA dont le jeton traîne encore (registre du monde,
  // compte) : jamais de résumé.
  {
    const wld = await World.loadWorld(paths.multi, MONDAY);
    const lg = await World.loadLeague(wld, store.HISTORIC_LEAGUE_ID, paths.multi);
    lg.teams.find(t => t.managerLinkToken === humans[3].managerLinkToken).isHuman = false;
    await store.saveMultiLeague(lg, paths.multi);
  }
  ok("maybeCatchUpWorld un lundi sans fournisseur d'e-mail : aucun résumé");

  const prep = await Digest.prepareWeeklyDigests({ multiSavePath: paths.multi, accountsPath: paths.accounts, now: MONDAY });
  assert.strictEqual(prep.jobs.length, 1, "un seul résumé");
  assert.strictEqual(prep.jobs[0].to, "lyon@test.fr");
  assert.strictEqual(prep.jobs[0].lang, "en", "langue du compte");
  assert.ok(/Lyon Mail/.test(prep.jobs[0].subject) && prep.jobs[0].html.includes("This week&#39;s results"));
  assert.ok(prep.jobs[0].html.includes("/api/email/unsubscribe-digest?token="), "lien de désinscription");
  assert.strictEqual(prep.skipped.optOut, 1, "désinscrit ignoré");
  assert.strictEqual(prep.skipped.inactive, 1, "inactif (> 4 semaines) ignoré");
  assert.strictEqual(prep.skipped.cpu, 1, "club de l'IA ignoré");
  assert.strictEqual(prep.skipped.noEmail, 1, "compte sans e-mail ignoré");
  assert.strictEqual(prep.skipped.noClub, 1, "compte sans club ignoré");
  let saved = await Accounts.loadAccounts(paths.accounts);
  assert.strictEqual(saved.accounts.find(a => a.id === a1.id).lastDigestWeekKey, "2026-10-05", "semaine notée avant l'envoi");
  const again = await Digest.prepareWeeklyDigests({ multiSavePath: paths.multi, accountsPath: paths.accounts, now: MONDAY + 3600e3 });
  assert.strictEqual(again.jobs.length, 0, "jamais deux fois la même semaine");
  assert.strictEqual(again.skipped.already, 1);
  ok("préparation : désinscrits, inactifs, clubs de l'IA, comptes sans e-mail/club ignorés ; une fois par semaine");

  // Envoi planifié (fournisseur simulé) : jamais bloquant, petits lots.
  Digest._resetForTests();
  const sent = [];
  const fakeSend = async m => { sent.push(m); return { ok: true }; };
  assert.strictEqual(Digest.scheduleWeeklyDigests({ multiSavePath: paths.multi, accountsPath: paths.accounts, now: MONDAY + 7 * D, send: fakeSend }), null, "sans fournisseur : rien");
  const notDue = Digest.scheduleWeeklyDigests({ multiSavePath: paths.multi, accountsPath: paths.accounts, now: MONDAY + 7 * D - 3 * 3600e3, send: fakeSend, mailConfigured: () => true });
  assert.strictEqual(notDue, null, "lundi avant 9h : rien");
  // Semaine suivante : le monde est rattrapé, puis envoi.
  const NEXT = MONDAY + 7 * D;
  await maybeCatchUpWorld(paths.multi, NEXT, true, paths.accounts);
  // Le manager est revenu entre-temps (sinon inactif au bout de 4 semaines).
  {
    const wld = await World.loadWorld(paths.multi, NEXT);
    const f = await World.findTeamByToken(wld, a1.managerToken, paths.multi);
    assert.ok(f, "club retrouvé");
  }
  let order = [];
  const lock = async () => { order.push("lock"); return () => order.push("unlock"); };
  const p = Digest.scheduleWeeklyDigests({ multiSavePath: paths.multi, accountsPath: paths.accounts, now: NEXT, send: async m => { order.push("send"); return fakeSend(m); }, acquireLock: lock, mailConfigured: () => true });
  assert.ok(p && typeof p.then === "function" && order.length === 0, "rend la main tout de suite (travail repoussé)");
  assert.strictEqual(Digest.scheduleWeeklyDigests({ multiSavePath: paths.multi, accountsPath: paths.accounts, now: NEXT, send: fakeSend, mailConfigured: () => true }), null, "une seule tentative à la fois");
  const res = await p;
  assert.strictEqual(res.jobs.length, 1);
  assert.deepStrictEqual(order, ["lock", "unlock", "send"], "préparé sous le verrou, envoyé hors verrou");
  assert.strictEqual(sent.length, 1);
  assert.ok(sent[0].html && sent[0].text && sent[0].subject && sent[0].to === "lyon@test.fr");
  assert.strictEqual(Digest.scheduleWeeklyDigests({ multiSavePath: paths.multi, accountsPath: paths.accounts, now: NEXT + 600e3, send: fakeSend, mailConfigured: () => true }), null, "semaine déjà faite par ce processus");
  saved = await Accounts.loadAccounts(paths.accounts);
  assert.strictEqual(saved.accounts.find(a => a.id === a1.id).lastDigestWeekKey, "2026-10-12");
  ok("envoi planifié : non bloquant, sous verrou pour la préparation, une fois par semaine");

  // Échecs d'envoi : journalisés, jamais levés.
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  const r = await Digest.sendJobs([{ to: "a@b.c", subject: "s", text: "t", html: "h", accountId: "x" }, { to: "d@e.f", subject: "s", text: "t", html: "h", accountId: "y" }],
    { send: async m => { if (m.to === "a@b.c") throw new Error("boom"); return { ok: false, error: "HTTP 500" }; }, pauseMs: 0 });
  console.warn = warn;
  assert.deepStrictEqual(r, { ok: 0, failed: 2 });
  assert.strictEqual(warned, 2);
  // Fournisseur non configuré : Mailer.sendMail renvoie une erreur sans lever.
  const r2 = await Digest.sendJobs([{ to: "a@b.c", subject: "s", text: "t", html: "h", accountId: "x" }], { pauseMs: 0 });
  assert.deepStrictEqual(r2, { ok: 0, failed: 1 });
  ok("échecs d'envoi et fournisseur absent : journalisés, jamais d'exception");

  // -------------------------------------------------------------------
  // Routes de désinscription / réinscription
  // -------------------------------------------------------------------
  const server = http.createServer(createHandler(paths.solo, () => NEXT, paths.multi, paths.accounts));
  await new Promise(rs => server.listen(0, "127.0.0.1", rs));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async u => { const res = await fetch(base + u, { headers: { Connection: "close" } }); return { status: res.status, body: await res.text(), type: res.headers.get("content-type") }; };
  const t1 = Digest.signDigestToken(a1.id);
  let g = await get(`/api/email/unsubscribe-digest?token=${encodeURIComponent(t1)}`);
  assert.strictEqual(g.status, 200);
  assert.ok(/text\/html/.test(g.type) && g.body.includes("Unsubscribed") && g.body.includes("resubscribe-digest"), "page de confirmation (langue du compte) + lien de réinscription");
  saved = await Accounts.loadAccounts(paths.accounts);
  assert.strictEqual(saved.accounts.find(a => a.id === a1.id).digestOptOut, true, "désinscrit");
  const afterOut = await Digest.prepareWeeklyDigests({ multiSavePath: paths.multi, accountsPath: paths.accounts, now: NEXT + 7 * D });
  assert.ok(!afterOut.jobs.some(j => j.to === "lyon@test.fr"), "plus de résumé après désinscription");
  g = await get(`/api/email/resubscribe-digest?token=${encodeURIComponent(t1)}`);
  assert.strictEqual(g.status, 200);
  assert.ok(g.body.includes("Subscribed again"));
  saved = await Accounts.loadAccounts(paths.accounts);
  assert.strictEqual(saved.accounts.find(a => a.id === a1.id).digestOptOut, false, "réinscrit");
  g = await get(`/api/email/unsubscribe-digest?token=faux.jeton`);
  assert.strictEqual(g.status, 400);
  assert.ok(g.body.includes("Lien invalide"));
  g = await get(`/api/email/unsubscribe-digest`);
  assert.strictEqual(g.status, 400);
  server.close();
  ok("routes GET de désinscription / réinscription (jeton signé, page de confirmation)");

  console.log("\n🏁 weekly_digest_test.js : tout est vert");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
