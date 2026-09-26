// Présentateur des émissions en costume (retour utilisateur, 2026-09-26 :
// « utilise la tete de l'avatar mais mets lui un costume quand meme »).
const fs = require("fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync(__dirname + "/moteurbasket3.html", "utf8");
const start = html.indexOf("const AvatarGen = (function () {");
const end = html.indexOf("})();", start) + 5;
const dom = new JSDOM("<!doctype html>", { runScripts: "outside-only" });
dom.window.eval(html.slice(start, end) + ";window.AvatarGen = AvatarGen;");
const AG = dom.window.AvatarGen;
const colors = ["#1F2A40", "#F5A13A"];
const jersey = AG.generateAvatar(2441, { teamColors: colors });
const suit = AG.generateAvatar(2441, { teamColors: colors, outfit: "suit", suitColors: colors });
if (suit === jersey) throw new Error("❌ L'option costume devrait changer la tenue.");
if (!suit.includes('fill="#e9eef5"')) throw new Error("❌ Chemise blanche attendue sous la veste.");
// Même tête : les éléments du visage (yeux, sourcils…) restent identiques.
// Identifiants SVG numérotés (compteur global) neutralisés avant comparaison.
const face = (s) => s.replace(/(["#(])([a-z]+)\d+/g, "$1$2");
const tail = (s) => face(s).split("</defs>").pop().slice(-1500);
if (tail(suit) !== tail(jersey)) throw new Error("❌ La tête de l'avatar doit rester la même en costume.");
// Les avatars des joueurs gardent leur maillot.
if (AG.generateAvatar(2441, { teamColors: colors }).includes('fill="#e9eef5"')) throw new Error("❌ Les joueurs ne doivent pas être en costume.");
console.log("✅ Présentateur : même tête qu'un avatar joueur, en costume ; joueurs inchangés.");
