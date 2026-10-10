// Mission live 2026-10-10 — moteur : fautes, and-one, pertes de balle.
//  A1. and-one : la faute porte foulType "andOne" + le joueur fauté, et UN
//      SEUL lancer suit (of = 1), même si la faute est requalifiée en
//      antisportive (avant : 1 + 2 lancers pour un seul contact) ;
//  A2. faute sur tir manqué : foulType "shooting" explicite, 2 ou 3 lancers
//      selon la zone, une seule série ;
//  A3. un contre n'emporte plus le défenseur du contexte de possession (lu
//      comme une faute sur tir par les clients : faute d'équipe fantôme) ;
//  B1. une passe mal contrôlée (fumble) est la perte du RECEVEUR, celui que
//      le fil nomme ; les autres pertes restent au porteur.
const assert = require("assert");
const E = require("./engine.js");
const ok = m => console.log("✅ " + m);

const a = E.generateStartingRoster("Fautes A"), b = E.generateStartingRoster("Fautes B");
// Discipline basse chez B : provoque des fautes antisportives sur and-one.
b.players.forEach(p => { p.attrs.discipline = 5; });
let andOnes = 0, unsOnContact = 0, shootingFouls = 0, blocks = 0, fumbles = 0, ftSeries = 0;
for (let g = 0; g < 60; g++) {
  const eng = new E.MatchEngine(a, b, { seed: 1000 + g });
  const ev = eng.simulate(Date.UTC(2026, 9, 10)).events;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.type === "foul" && e.foulType === "andOne") {
      andOnes++;
      assert.ok(e.playerId != null && e.defenderId != null, "and-one : fauté et fautif identifiés");
      const prev = ev.slice(0, i).reverse().find(x => x.type === "shot");
      assert.ok(prev && prev.made && prev.shooterId === e.playerId, "and-one : suit le panier du joueur fauté");
      let j = i + 1;
      if (ev[j] && (ev[j].type === "unsportsmanlikeFoul" || (ev[j].type === "technicalEjection" && ev[j].playerId === e.defenderId))) { unsOnContact++; j++; }
      while (ev[j] && (ev[j].type === "substitution" || ev[j].type === "foulOut" || ev[j].type === "shortHanded")) j++;
      assert.ok(ev[j] && ev[j].type === "freeThrow" && ev[j].shooterId === e.playerId && ev[j].of === 1 && ev[j].attempt === 1,
        `and-one : un seul lancer (1/1) pour ${e.player}, vu ${ev[j] && ev[j].text}`);
      assert.ok(!(ev[j + 1] && ev[j + 1].type === "freeThrow" && ev[j + 1].attempt === 2), "and-one : jamais de 2e lancer dans la même série");
    }
    if (e.type === "shot" && !e.made && e.foulType === "shooting" && !e.blocked) {
      shootingFouls++;
      assert.ok(e.fouled && e.defenderId != null, "faute sur tir : défenseur identifié");
      let j = i + 1;
      if (ev[j] && (ev[j].type === "unsportsmanlikeFoul" || ev[j].type === "technicalEjection")) j++;
      while (ev[j] && (ev[j].type === "substitution" || ev[j].type === "foulOut" || ev[j].type === "shortHanded")) j++;
      const n = e.zone === "three" ? 3 : 2;
      assert.ok(ev[j] && ev[j].type === "freeThrow" && ev[j].of === n && ev[j].shooterId === e.shooterId, `faute sur tir : ${n} lancers pour le tireur`);
      ftSeries++;
    }
    if (e.type === "shot" && e.blocked) {
      blocks++;
      assert.ok(e.defender == null && e.defenderId == null && e.foulType == null, "contre : aucun défenseur « fautif » transporté");
    }
    if (e.type === "turnover" && e.tovKind === "fumble") {
      fumbles++;
      assert.strictEqual(e.playerId, e.receiverId, "fumble : perte au receveur");
      assert.strictEqual(e.passerId != null, true, "fumble : passeur indiqué");
      const d = e.delta && e.delta[e.team] || {};
      assert.ok(d[e.receiverId] && d[e.receiverId].tov === 1, "fumble : la statistique suit le receveur");
      assert.ok(!(d[e.passerId] && d[e.passerId].tov), "fumble : rien au passeur");
    }
    if (e.type === "turnover" && e.tovKind !== "fumble") {
      const d = e.delta && e.delta[e.team] || {};
      assert.ok(d[e.playerId] && d[e.playerId].tov === 1, `perte ${e.tovKind} : créditée au joueur nommé`);
    }
  }
}
assert.ok(andOnes > 50 && shootingFouls > 50 && blocks > 50 && fumbles > 10, "échantillon suffisant");
ok(`${andOnes} and-one : un seul lancer chacun (${unsOnContact} requalifiés en antisportive sans lancers en plus).`);
ok(`${shootingFouls} fautes sur tir manqué : foulType explicite, 2 ou 3 lancers, une série.`);
ok(`${blocks} contres : plus aucune faute fantôme.`);
ok(`${fumbles} passes mal contrôlées : perte au receveur ; autres pertes au joueur nommé.`);
console.log("\n🏁 live_engine_fouls_test.js");
