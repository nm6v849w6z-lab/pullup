// Page du jeu telle que le navigateur la voit : moteurbasket3.html avec la
// feuille de styles du jeu (assets/game.css, extraite le 2026-10-09 pour la
// mise en cache) remise en ligne à la place de son <link>. Les tests qui
// lisent le CSS du jeu ou calculent des styles dans jsdom passent par ici.
const fs = require("fs");
const path = require("path");

function readGameHtml() {
  const html = fs.readFileSync(path.join(__dirname, "moteurbasket3.html"), "utf-8");
  const css = fs.readFileSync(path.join(__dirname, "assets", "game.css"), "utf-8");
  return html.replace(/<link rel="stylesheet" href="assets\/game\.css(?:\?v=[^"]*)?">/, () => `<style>${css}</style>`);
}

module.exports = { readGameHtml };
