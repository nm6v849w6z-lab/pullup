"use strict";

// =====================================================================
// LANGUE CÔTÉ SERVEUR (2026-09-30, retour utilisateur : « Les e-mails, les
// notifications et les pages Guide, À propos et FAQ n'existent qu'en
// français. Traduis »).
//
// 1) Choix de la langue (fr / en / it) :
//    - d'un destinataire (email, notification) : langFor(account, hint) =
//      langue du compte (Accounts.langFor) ; sans compte seulement,
//      l'indice envoyé avec la requête (`lang` explicite du client, puis
//      Accept-Language), sinon le français ;
//    - d'une page publique : siteLang(req) = `?lang=`, puis le cookie
//      « hm-lang » (posé par la page d'accueil et par le sélecteur de
//      langue, même préférence que localStorage "hm-lang" du jeu), puis
//      Accept-Language, sinon le français.
// 2) Traduction d'un texte français du jeu (entrées du fil reprises dans
//    les notifications, Guide public) : MÊME dictionnaire et MÊME moteur
//    que le navigateur (assets/i18n/i18n.js + en.js / it.js), exécutés une
//    fois dans un bac à sable Node (DOM factice). Une seule source : ce qui
//    est traduit dans le jeu l'est aussi ici. translate(lang, texte) rend le
//    texte d'origine quand rien ne correspond.
// =====================================================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LANGS = ["fr", "en", "it"];
const I18N_DIR = path.join(__dirname, "..", "assets", "i18n");

function normLang(x) {
  if (typeof x !== "string") return null;
  const l = x.trim().toLowerCase().slice(0, 2);
  return LANGS.includes(l) ? l : null;
}

// Accept-Language : première langue prise en charge par ordre de préférence
// (q=). Un navigateur qui ne demande ni fr, ni en, ni it reçoit l'anglais
// (comme la page d'accueil) ; sans en-tête : null.
function fromAcceptLanguage(header) {
  if (!header || typeof header !== "string") return null;
  const items = header.split(",").map((part, i) => {
    const [tag, ...params] = part.trim().split(";");
    const q = params.map(p => /^\s*q=([\d.]+)/.exec(p)).find(Boolean);
    return { tag: tag.trim(), q: q ? parseFloat(q[1]) : 1, i };
  }).filter(x => x.tag && x.tag !== "*" && x.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  if (!items.length) return null;
  for (const it of items) { const l = normLang(it.tag); if (l) return l; }
  return "en";
}

function cookieLang(cookieHeader) {
  const m = /(?:^|;\s*)hm-lang=([a-z]{2})/i.exec(cookieHeader || "");
  return m ? normLang(m[1]) : null;
}

// Indice de langue d'une requête (hors compte) : `lang` explicite (corps ou
// paramètre), puis Accept-Language.
function hintFromRequest(req, explicit) {
  return normLang(explicit) || fromAcceptLanguage(req && req.headers && req.headers["accept-language"]);
}

// Langue d'un destinataire : avec un compte, TOUJOURS sa langue
// (Accounts.langFor : choisie dans Paramètres › Langue ou à l'inscription,
// « fr » par défaut) ; l'indice de la requête ne sert que sans compte.
function langFor(account, hint) {
  if (account) return require("./accounts.js").langFor(account);
  return normLang(hint) || "fr";
}

// Langue d'une page publique : ?lang=, cookie, Accept-Language, français.
function siteLang({ query = null, cookie = "", acceptLanguage = "" } = {}) {
  return normLang(query) || cookieLang(cookie) || fromAcceptLanguage(acceptLanguage) || "fr";
}

// ---------------------------------------------------------------------
// Traducteur (dictionnaire du jeu), chargé à la demande par langue.
// ---------------------------------------------------------------------
const translators = {};

function fakeNode() {
  return {
    nodeType: 1, nodeName: "HTML", parentNode: null,
    setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false }, appendChild() {},
  };
}

function loadTranslator(lang) {
  if (translators[lang]) return translators[lang];
  const root = fakeNode();
  const sandbox = {
    console,
    MutationObserver: function () { this.observe = () => {}; },
    document: {
      documentElement: root, head: root, currentScript: null,
      createElement: () => fakeNode(),
      createTreeWalker: () => ({ nextNode: () => null }),
      addEventListener() {},
    },
    localStorage: { getItem: k => (k === "hm-lang" ? lang : null), setItem() {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(I18N_DIR, `${lang}.js`), "utf-8"), ctx, { filename: `${lang}.js` });
  vm.runInContext(fs.readFileSync(path.join(I18N_DIR, "i18n.js"), "utf-8"), ctx, { filename: "i18n.js" });
  const t = sandbox.hmI18n && sandbox.hmI18n.t;
  translators[lang] = typeof t === "function" ? t : (s => s);
  return translators[lang];
}

// Traduit un texte français (rend l'original si rien ne correspond).
function translate(lang, text) {
  lang = normLang(lang) || "fr";
  if (lang === "fr" || text == null || text === "") return text;
  return loadTranslator(lang)(String(text));
}

// Vrai si le texte a une version dans la langue (sinon il resterait en français).
function canTranslate(lang, text) {
  lang = normLang(lang) || "fr";
  if (lang === "fr") return true;
  return translate(lang, text) !== text;
}

module.exports = { LANGS, normLang, fromAcceptLanguage, cookieLang, hintFromRequest, langFor, siteLang, translate, canTranslate };
