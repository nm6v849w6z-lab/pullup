#!/usr/bin/env node
/* Clés de traduction manquantes (2026-09-30, ajout de l'italien).

   en.js est le dictionnaire de référence (FR → EN) : chaque nouveau texte
   français de l'interface y est ajouté. Ce script liste, pour une autre
   langue (it par défaut), les clés présentes dans en.js mais absentes de
   assets/i18n/<lang>.js, et inversement les clés en trop (texte français
   retiré ou reformulé depuis).

   Usage :
     node scripts/i18n_missing.js            # italien
     node scripts/i18n_missing.js it --json  # lignes prêtes à coller dans
                                             # it.js (valeur = anglais, À TRADUIRE)
   Code de sortie 1 s'il manque des clés (utilisable en CI). */
"use strict";
const path = require("path");

const args = process.argv.slice(2);
const lang = (args.find(a => !a.startsWith("--")) || "it").toLowerCase();
const asJson = args.includes("--json");
const dir = path.join(__dirname, "..", "assets", "i18n");

function load(file, varName) {
  const sandbox = {};
  global.window = sandbox;
  delete require.cache[require.resolve(file)];
  require(file);
  delete global.window;
  const dict = sandbox[varName];
  if (!dict) throw new Error(`${file} ne définit pas window.${varName}`);
  return dict;
}

const en = load(path.join(dir, "en.js"), "HM_I18N_EN");
const other = load(path.join(dir, `${lang}.js`), `HM_I18N_${lang.toUpperCase()}`);

const missing = Object.keys(en).filter(k => !Object.prototype.hasOwnProperty.call(other, k));
const extra = Object.keys(other).filter(k => !Object.prototype.hasOwnProperty.call(en, k));

if (asJson) {
  for (const k of missing) console.log(`  ${JSON.stringify(k)}: ${JSON.stringify(en[k])}, // À TRADUIRE`);
} else {
  console.log(`${lang}.js : ${Object.keys(other).length} clés, en.js : ${Object.keys(en).length} clés.`);
  console.log(`Manquantes dans ${lang}.js : ${missing.length}`);
  for (const k of missing) console.log(`  - ${JSON.stringify(k)}  (en : ${JSON.stringify(en[k])})`);
  if (extra.length) {
    console.log(`En trop dans ${lang}.js (absentes de en.js) : ${extra.length}`);
    for (const k of extra) console.log(`  + ${JSON.stringify(k)}`);
  }
}
process.exit(missing.length ? 1 : 0);
