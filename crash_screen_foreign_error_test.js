// Écran de secours (FILET DE SÉCURITÉ GÉNÉRIQUE de moteurbasket3.html) :
// une erreur d'un script externe (« Script error. » masqué par le
// navigateur, régie publicitaire, extension) ne doit plus bloquer le jeu
// (retour Discord 2026-10-05) ; une vraie erreur du jeu l'affiche toujours.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf8");
const m = /\/\/ FILET DE SÉCURITÉ GÉNÉRIQUE[\s\S]*?let crashScreenShown = false;([\s\S]*?)\n\/\/ =====/.exec(html);
assert.ok(m, "bloc du filet de sécurité trouvé");
const fire = (init) => {
  const dom = new JSDOM(`<body><p id="game">jeu</p></body>`, { url: "https://hoop-manager.com/", runScripts: "outside-only" });
  const w = dom.window;
  w.console.warn = () => {};
  w.eval("let crashScreenShown = false;" + m[1]);
  w.dispatchEvent(new w.ErrorEvent("error", init));
  return !!w.document.getElementById("game");
};
assert.ok(fire({ message: "Script error.", filename: "", lineno: 0 }), "« Script error. » sans détail : jeu intact");
assert.ok(fire({ message: "TypeError: x", filename: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" }), "erreur de la régie Google : jeu intact");
assert.ok(fire({ message: "oops", filename: "safari-web-extension://abc/content.js" }), "erreur d'une extension Safari : jeu intact");
assert.ok(fire({ message: "oops", filename: "chrome-extension://abc/content.js" }), "erreur d'une extension Chrome : jeu intact");
assert.ok(!fire({ message: "TypeError: boom", filename: "https://hoop-manager.com/", error: new Error("boom") }), "vraie erreur du jeu : écran de secours");
assert.ok(!fire({ message: "TypeError: boom", filename: "", error: new Error("boom") }), "erreur du jeu sans fichier : écran de secours");
console.log("🏁 crash_screen_foreign_error_test.js : erreurs externes ignorées, vraies erreurs affichées.");
