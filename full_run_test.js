// Exécute réellement le fichier HTML final dans un DOM simulé (jsdom) pour
// vérifier qu'il n'y a aucune erreur runtime : chargement, préparation, puis
// plusieurs journées résolues automatiquement par le serveur (calendrier réel,
// tâche #21 — plus de vitesse "Instantané" ni de bouton "Verrouiller &
// simuler" à cliquer : une absence simulée via fastForwardCalendar fait
// rattraper les journées et l'entraînement hebdomadaire d'un coup, exactement
// comme un manager qui se reconnecterait après un moment).
const fs = require("fs");
const { startTestServer, openGame, flush, fastForwardCalendar } = require("./test_helpers.js");

const html = fs.readFileSync("moteurbasket3.html", "utf-8");

(async () => {

let errors = [];
for (let run = 0; run < 8; run++) {
  // Un serveur (et une sauvegarde) neuf par run : on veut bien une équipe
  // fraîchement générée à chaque fois, pas l'accumulation d'un run à l'autre.
  const { server, savePath, baseUrl } = await startTestServer();
  let dom = await openGame(html, baseUrl);
  dom.window.onerror = (msg) => errors.push(`run ${run} (avant rattrapage): ${msg}`);
  await flush(dom);
  dom.window.close();

  // Avance le calendrier de 2 journées (1 semaine réelle complète, matchs +
  // entraînement hebdomadaire) et rouvre : une seule requête au serveur
  // rattrape tout d'un coup (voir fastForwardCalendar/catchUpLeague).
  fastForwardCalendar(savePath, 2);
  dom = await openGame(html, baseUrl);
  dom.window.onerror = (msg) => errors.push(`run ${run} (après rattrapage): ${msg}`);
  const { document } = dom.window;

  const catchupVisible = !document.getElementById("catchupSection").classList.contains("hidden");
  if (!catchupVisible) {
    errors.push(`run ${run}: le récapitulatif d'absence devrait s'afficher après 2 journées résolues automatiquement`);
  }
  const catchupText = catchupVisible
    ? document.getElementById("catchupContent").textContent.replace(/\s+/g, " ").trim()
    : "";
  if (catchupVisible) document.getElementById("catchupContinueBtn").click();

  const prepVisible = !document.getElementById("prepSection").classList.contains("hidden");
  if (!prepVisible) {
    errors.push(`run ${run}: l'écran de préparation du match suivant devrait redevenir visible après 'Continuer'`);
  }

  console.log(`Run ${run}: récapitulatif="${catchupText.slice(0, 90)}${catchupText.length > 90 ? "…" : ""}" | écran de préparation visible=${prepVisible}`);
  await flush(dom);
  dom.window.close();
  server.close();
}

if (errors.length) {
  console.log("\n❌ Erreurs détectées:");
  errors.forEach(e => console.log(" -", e));
  process.exit(1);
} else {
  console.log("\n✅ Aucune erreur runtime sur 8 exécutions complètes (chargement → préparation → rattrapage automatique de 2 journées → écran de préparation suivant).");
}

})().catch(e => { console.error(e); process.exit(1); });
