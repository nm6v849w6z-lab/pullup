// Bug du 2026-10-06 : « Dragan Jankovic de chez BC DIA a été mis aux
// enchères sans raison » (club de manager). Cause : deux joueurs d'une même
// ligue portaient le même id (compteur d'ids reparti trop bas après un
// redémarrage, puis transfert entre championnats) ; l'annonce d'un club IA
// était rattachée au joueur du manager par playerById.
const E = require("./engine.js");
const store = require("./server/store.js");
const check = (c, m) => { if (!c) throw new Error("❌ " + m); console.log("✅ " + m); };

check(E.uid() > E.clockUidFloor(Date.UTC(2026, 9, 1)), "ids serveur au-dessus du plancher d'horloge (jamais un id déjà émis avant un redémarrage)");

const { league } = store.createMultiManagerCareer(["BC DIA", "Autre Club"], Date.now());
const human = league.teams.findIndex(t => t.name === "BC DIA");
const cpu = league.teams.findIndex(t => !t.isHuman);
check(league.teams[human].isHuman && cpu >= 0, "un club de manager et un club IA");
const mine = league.teams[human].players[0];
const theirs = league.teams[cpu].players[0];
theirs.id = mine.id; // doublon
const now = Date.now();
const listing = league.listPlayerForSale(cpu, theirs.id, 1, now);
check(listing && league.listingPlayer(listing) === theirs, "l'annonce du club IA désigne SON joueur, pas celui du manager");
check(!!league.listPlayerForSale(human, mine.id, 1000, now), "le manager peut encore vendre son joueur malgré l'annonce de même id");
league.transferListings = league.transferListings.filter(l => l === listing);

// Réparation au chargement : le joueur du manager garde son id.
const data = JSON.parse(JSON.stringify(store.serializeMultiLeague(league)));
const { league: re } = store.deserializeMultiLeague(data);
const mine2 = re.teams[human].players.find(p => p.name === mine.name);
const theirs2 = re.teams[cpu].players.find(p => p.name === theirs.name);
check(mine2.id === mine.id && theirs2.id !== mine.id, "rechargement : le joueur du manager garde son id, l'autre en reçoit un nouveau");
const l2 = re.transferListings.find(l => l.sellerIdx === cpu);
check(l2 && l2.playerId === theirs2.id && re.listingPlayer(l2) === theirs2, "rechargement : l'annonce suit le joueur du club IA");
const ids = re.teams.flatMap(t => t.players.map(p => p.id));
check(new Set(ids).size === ids.length, "plus aucun id en double dans la ligue");
console.log("\n🏁 duplicate_player_id_test.js : tout est vert");
