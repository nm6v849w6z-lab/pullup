// Vérifie que server/index.js active bien le mode accéléré du calendrier
// (voir server/calendar.js:setFastTestMode) quand le serveur démarre avec la
// variable d'environnement BASKET_FAST_CALENDAR=1 — le mécanisme utilisateur
// réel documenté dans README.md/server/README.md pour tester une saison en
// quelques jours plutôt qu'en ~9 semaines. Le reste du comportement du mode
// accéléré (rythme des matchs, calendrier navigateur, héritage entre
// saisons...) est couvert par calendar_test.js (calculs purs) et
// ../fast_calendar_test.js (parcours UI complet) — ce test-ci vérifie
// UNIQUEMENT le branchement de la variable d'environnement elle-même,
// impossible à tester dans le même process que les autres fichiers de test
// (le require("./index.js") qui lit cette variable n'a lieu qu'une seule
// fois, au premier chargement du module — voir index.js).
const { spawnSync } = require("child_process");

function runInSubprocess(envValue) {
  const env = { ...process.env };
  if (envValue === undefined) delete env.BASKET_FAST_CALENDAR;
  else env.BASKET_FAST_CALENDAR = envValue;
  const script = `
    require("./index.js");
    const Calendar = require("./calendar.js");
    console.log(JSON.stringify(Calendar.isFastTestModeEnabled()));
  `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: __dirname, env, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`❌ Sous-process en échec (BASKET_FAST_CALENDAR=${envValue}) : ${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim());
}

if (runInSubprocess(undefined) !== false) {
  throw new Error("❌ Sans BASKET_FAST_CALENDAR, le mode accéléré ne devrait jamais être activé (comportement par défaut).");
}
console.log("✅ Sans BASKET_FAST_CALENDAR, le calendrier reste classique par défaut.");

if (runInSubprocess("1") !== true) {
  throw new Error("❌ Avec BASKET_FAST_CALENDAR=1, server/index.js devrait activer le mode accéléré dès son chargement.");
}
console.log("✅ Avec BASKET_FAST_CALENDAR=1, server/index.js active bien le mode accéléré au démarrage.");

if (runInSubprocess("0") !== false) {
  throw new Error("❌ Avec BASKET_FAST_CALENDAR=0 (toute autre valeur que \"1\"), le mode accéléré ne devrait pas s'activer.");
}
console.log("✅ Seule la valeur \"1\" active le mode accéléré (pas \"0\", ni une variable absente).");

console.log("\n✅ Le démarrage du serveur active bien (ou pas) le mode accéléré du calendrier selon BASKET_FAST_CALENDAR, exactement comme documenté dans README.md.");
