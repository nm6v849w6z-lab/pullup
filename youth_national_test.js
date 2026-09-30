// Centre de formation 100 % national (retour utilisateur 2026-09-30) :
// chaque candidat généré par generateYouthCandidate a la nationalité du pays
// du club, quel que soit le pays et le niveau du recruteur.
const Engine = require("./engine.js");

let n = 0;
for (const country of ["fr", "us"]) {
  for (let level = 0; level <= 5; level++) {
    for (let i = 0; i < 200; i++) {
      const c = Engine.generateYouthCandidate(Date.now(), level, country);
      const nat = c.nationality || (c.player && c.player.nationality);
      if (nat !== country) throw new Error(`❌ Candidat ${country} (recruteur ${level}) de nationalité ${nat}.`);
      n++;
    }
  }
}
console.log(`✅ ${n} candidats du centre de formation, tous de la nationalité de leur club.`);
