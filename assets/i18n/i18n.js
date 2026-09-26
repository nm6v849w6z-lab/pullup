/* Langue du jeu (Paramètres → Langue). 2026-09-26, retour utilisateur :
   « il faut maintenant traduire le jeu en anglais, on pourra activer
   l'anglais en allant paramètre dans le tableau de bord ».

   Le jeu est écrit en français d'un bout à l'autre (interface, moteur,
   serveur, émissions). Plutôt que de passer chaque texte par une fonction
   t() dans ~50 000 lignes, cette couche traduit ce qui S'AFFICHE : un
   MutationObserver repasse sur chaque nœud texte / attribut visible inséré
   ou modifié dans la page et le remplace par sa version anglaise, trouvée
   dans le dictionnaire assets/i18n/en.js (window.HM_I18N_EN, FR → EN) :
   - correspondance exacte (texte entier, espaces normalisés) ;
   - sinon gabarits : une clé contenant {0}/{1}/{player}… est une phrase à
     trous ; les trous sont capturés puis eux-mêmes traduits s'ils sont
     dans le dictionnaire (ex. « Poste : {0} » + « Meneur ») ;
   - sinon le texte reste tel quel (noms de joueurs, de clubs, nombres).
   En français, rien ne se passe (aucun observateur installé).

   La préférence vit dans CE navigateur (localStorage "hm-lang"), comme le
   thème ; changer de langue recharge la page (plus simple et plus sûr que
   de re-traduire à l'envers). Mode debug : localStorage "hm-i18n-debug" =
   "1" → window.hmI18n.missing liste les textes français non traduits vus. */
(function () {
  "use strict";
  var LANG_KEY = "hm-lang";
  var lang = "fr";
  try { lang = window.localStorage.getItem(LANG_KEY) === "en" ? "en" : "fr"; } catch (e) { /* navigation privée */ }

  var api = window.hmI18n = {
    lang: lang,
    getLang: function () { return lang; },
    setLang: function (l) {
      try { window.localStorage.setItem(LANG_KEY, l === "en" ? "en" : "fr"); } catch (e) { /* rien */ }
      if ((l === "en" ? "en" : "fr") !== lang) window.location.reload();
    },
    // Traduit une chaîne (renvoie la chaîne d'origine si rien ne correspond).
    t: function (s) { return s; },
    missing: null,
  };
  try { document.documentElement.setAttribute("lang", lang); } catch (e) { /* rien */ }
  if (lang !== "en") return;

  // Le dictionnaire (~240 Ko) n'est chargé qu'en anglais. Ce fichier est en
  // `defer` (comme showPlayer.js : un script externe bloquant retarderait le
  // dernier script inline de la page, voir le commentaire au-dessus de
  // showPlayer.js) : la page est donc déjà rendue (derrière l'écran de
  // chargement) quand on arrive ici ; start() la parcourt une fois puis
  // suit chaque changement.
  if (window.HM_I18N_EN) start();
  else {
    var sc = document.createElement("script");
    var me = document.currentScript && document.currentScript.src;
    sc.src = me ? me.replace(/i18n\.js(\?.*)?$/, "en.js$1") : "assets/i18n/en.js";
    sc.onload = start;
    (document.head || document.documentElement).appendChild(sc);
  }

  function start() {
    var DICT = window.HM_I18N_EN || {};
    var exact = new Map();
    var patterns = [];
    var PH = /\{(\w+)\}/g;
    var norm = function (s) { return s.replace(/[\s\u00a0\u202f]+/g, " ").replace(/[’‘]/g, "'").trim(); };
    var escRe = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); };

    Object.keys(DICT).forEach(function (fr) {
      var en = DICT[fr];
      if (typeof en !== "string") return;
      var key = norm(fr);
      if (!key) return;
      if (!/\{\w+\}/.test(key)) { if (!exact.has(key)) exact.set(key, en); return; }
      // Gabarit : littéraux échappés, trous → groupes nommés par ordre.
      var names = [];
      var literals = [];
      var last = 0;
      var src = "^";
      var m;
      PH.lastIndex = 0;
      while ((m = PH.exec(key))) {
        var lit = key.slice(last, m.index);
        // Trou collé à une lettre (accord : joueur{1}) : peut être vide.
        var prev = key.charAt(m.index - 1);
        var glued = /[A-Za-zÀ-ÿ]/.test(prev);
        // Élision faite par le jeu (voir elideDe) : « de {x} » s'affiche
        // « d'Yanis », « le {x} » → « l'Aigle »…
        var eli = !glued && /(^|[\s(])(de|De|le|Le|la|La|que|Que) $/.exec(lit);
        if (eli) {
          var w = eli[2];
          var short = w.slice(0, w.length === 3 ? 2 : 1);
          lit = lit.slice(0, lit.length - w.length - 1);
          literals.push(lit);
          src += escRe(lit) + "(?:" + w + " |" + short + "['’])";
        } else {
          literals.push(lit);
          src += escRe(lit);
        }
        // Deux trous collés (« {score}{lieu} ») : le premier est un seul
        // « mot » (70-78), le second prend la suite (« à domicile »).
        var nextIsPh = key.charAt(m.index + m[0].length) === "{";
        src += glued ? "([^ ]*?)" : nextIsPh ? "([^ ]+)" : "(.+?)";
        names.push(m[1]);
        last = m.index + m[0].length;
      }
      var tail = key.slice(last);
      literals.push(tail);
      src += escRe(tail) + "$";
      var litLen = literals.join("").replace(/\s/g, "").length;
      if (litLen < 2) return; // « {0} {1} » : trop vague, correspondrait à tout
      var anchors = literals.map(function (l) { return l.trim(); }).filter(Boolean);
      var re;
      try { re = new RegExp(src); } catch (e) { return; }
      patterns.push({ re: re, names: names, en: en, anchors: anchors, litLen: litLen });
    });
    // Les gabarits les plus précis (le plus de texte fixe) passent en premier.
    patterns.sort(function (a, b) { return b.litLen - a.litLen; });

    // Règles dédiées, là où un dictionnaire ne suffit pas.
    var DAYS = { lundi: "Monday", mardi: "Tuesday", mercredi: "Wednesday", jeudi: "Thursday", vendredi: "Friday", samedi: "Saturday", dimanche: "Sunday",
      "lun.": "Mon", "mar.": "Tue", "mer.": "Wed", "jeu.": "Thu", "ven.": "Fri", "sam.": "Sat", "dim.": "Sun" };
    var MONTHS = { janvier: "January", "février": "February", mars: "March", avril: "April", mai: "May", juin: "June", juillet: "July", "août": "August",
      septembre: "September", octobre: "October", novembre: "November", "décembre": "December",
      "janv.": "Jan", "févr.": "Feb", "avr.": "Apr", "juil.": "Jul", "sept.": "Sep", "oct.": "Oct", "nov.": "Nov", "déc.": "Dec" };
    var DATE_WORDS = { "à": "at", "h": "h" };
    function dateWord(w) {
      var l = w.toLowerCase();
      var r = DAYS[l] || MONTHS[l] || DATE_WORDS[l];
      if (!r && !/\.$/.test(l)) r = DAYS[l + "."] || MONTHS[l + "."];
      return r || null;
    }
    function ordinal(n) {
      var v = n % 100;
      return n + (v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
    }
    function rules(core) {
      var m;
      // Dates écrites par le jeu en français (« Lundi 28 septembre · 10:30 »)
      if (/[a-zà-ÿ]/i.test(core) && core.length < 60) {
        var toks = core.match(/[A-Za-zÀ-ÿ]+\.?|[^A-Za-zÀ-ÿ]+/g) || [];
        var hasDate = false, ok = true;
        var outT = toks.map(function (t) {
          if (!/^[A-Za-zÀ-ÿ]/.test(t)) return t;
          var r = dateWord(t);
          if (!r) { ok = false; return t; }
          if (r !== "at" && r !== "h") hasDate = true;
          return /\.$/.test(t) && !/\.$/.test(r) && !(t.toLowerCase() in DAYS) && !(t.toLowerCase() in MONTHS) ? r + "." : r;
        });
        if (ok && hasDate) return outT.join("");
      }
      // Ordinaux et bilans : « 3e », « 1er », « 12V », « 4D »
      if ((m = /^(\d+)(?:e|er|re|ème|ère)$/.exec(core))) return ordinal(+m[1]);
      if ((m = /^J(\d+)( .*)?$/.exec(core))) return "MD" + m[1] + (m[2] ? " " + (translateCore(m[2].trim(), 1) || m[2].trim()) : "");
      if ((m = /^(\d+) ?j (\d+) ?h$/.exec(core))) return m[1] + "d " + m[2] + "h";
      if ((m = /^(\d+)V$/.exec(core))) return m[1] + "W";
      if ((m = /^(\d+)D$/.exec(core))) return m[1] + "L";
      if ((m = /^(\d+)V\s*[–-]\s*(\d+)D$/.exec(core))) return m[1] + "W – " + m[2] + "L";
      return null;
    }
    var POS_EN = { M: "PG", A: "SG", AS: "SF", AF: "PF", P: "C" };
    var cache = new Map();
    var produced = new Set(); // textes anglais déjà écrits : ne pas les repasser
    var FRENCH = /[A-Za-zÀ-ÿ]{2,}/;

    function enNumber(g) {
      // 1 234 → 1,234 ; 12,5 → 12.5 (nombres seuls capturés dans un trou)
      if (/^-?\d{1,3}(?:\.\d{3})+$/.test(g)) return g.replace(/\./g, ","); // 5.000 → 5,000
      var m = /^(-?\d{1,3}(?: \d{3})*|-?\d+)(?:,(\d+))?$/.exec(g);
      if (!m) return g;
      return m[1].replace(/ /g, ",") + (m[2] != null ? "." + m[2] : "");
    }

    // Phrase française (plusieurs mots en minuscules, ou mots-outils) plutôt
    // qu'un nom propre / un nombre / un nom de club.
    var FR_WORD = /(^|[\s'’(])(le|la|les|des|du|de|un|une|et|est|pas|pour|avec|sur|dans|au|aux|ton|ta|tes|votre|vos|son|sa|ses|ce|cette|qui|que|en|il|elle|on|à|d|l|qu)(?=[\s'’]|$)/i;
    function isProse(g) {
      var words = g.trim().split(/\s+/);
      var lower = words.filter(function (w) { return /^[a-zà-ÿ'’-]{2,}$/.test(w); }).length;
      if (lower >= 3) return true;
      return words.length >= 2 && FR_WORD.test(g) && /[a-zà-ÿ]{3}/.test(g) && lower >= 2;
    }

    function translateCore(core, depth) {
      if (cache.has(core)) return cache.get(core);
      var out = null;
      if (exact.has(core)) out = exact.get(core);
      else if ((out = rules(core)) !== null) { /* règle dédiée (dates, ordinaux, bilans) */ }
      else {
        for (var i = 0; i < patterns.length && out === null; i++) {
          var p = patterns[i];
          var ok = true;
          for (var j = 0; j < p.anchors.length; j++) if (core.indexOf(p.anchors[j]) === -1) { ok = false; break; }
          if (!ok) continue;
          var m = p.re.exec(core);
          if (!m) continue;
          var vals = {};
          var bad = false;
          for (var k = 0; k < p.names.length; k++) {
            var g = m[k + 1];
            var tg = depth < 3 && FRENCH.test(g) ? translateCore(norm(g), depth + 1) : null;
            // Un trou qui a capturé une vraie phrase française non traduite :
            // ce gabarit n'était pas le bon (ex. « {0} et {1} » sur un
            // paragraphe) → on ne rend pas un texte à moitié anglais.
            if (tg === null && isProse(g)) { bad = true; break; }
            vals[p.names[k]] = tg !== null ? /^\s*/.exec(g)[0] + tg + /\s*$/.exec(g)[0] : enNumber(g);
          }
          if (bad) continue;
          out = p.en.replace(PH, function (m0, n) { return vals[n] != null ? vals[n] : m0; });
        }
        // Ponctuation autour : « Budget : » → « Budget: », « (blessé) » → « (injured) »
        if (out === null) {
          var mm = /^([(«“"'\[•·—–-]*\s*)(.*?)(\s*[:)»”"'\].!?…·—–-]*)$/.exec(core);
          if (mm && (mm[1] || mm[3]) && mm[2] && mm[2] !== core) {
            var inner = translateCore(mm[2], depth + 1);
            if (inner !== null) out = mm[1].replace("«", "“") + inner + mm[3].replace(/^\s+:/, ":").replace("»", "”");
          }
        }
        // Casse : « pénétration » dans une liste → « Pénétration » du dictionnaire.
        if (out === null && depth < 4) {
          var c0 = core.charAt(0);
          var flip = c0 === c0.toLowerCase() ? c0.toUpperCase() + core.slice(1) : c0.toLowerCase() + core.slice(1);
          if (flip !== core && exact.has(flip)) {
            var f = exact.get(flip);
            out = c0 === c0.toLowerCase() && !/^[A-Z]{2}/.test(f) ? f.charAt(0).toLowerCase() + f.slice(1) : f.charAt(0).toUpperCase() + f.slice(1);
          }
        }
        // Assemblages : « 50/100 · Cohésion correcte », « Scoreur créatif
        // (Création de tir + Dribble) », « Points forts : passe, dribble » →
        // chaque morceau traduit séparément ; accepté si tout ce qui reste en
        // français n'est que noms / nombres.
        if (out === null && depth < 3) {
          var parts = core.split(/(\s[·•|–—+\/&→]\s|\s?:\s|,\s|\.\s|\s?\(|\)\s?|\s-\s|\s\/|\/\s)/);
          if (parts.length > 1) {
            var any = false, fail = false;
            var res = parts.map(function (seg, idx) {
              if (idx % 2 === 1) return /:\s$/.test(seg) ? seg.replace(/^\s/, "") : seg; // séparateur (« : » → « : » anglais)
              var tseg = seg.trim();
              if (!tseg || !FRENCH.test(tseg)) return seg;
              var r = translateCore(tseg, depth + 1);
              if (r !== null) { any = true; return seg.replace(tseg, r); }
              if (isProse(tseg) || FR_WORD.test(tseg) && /\s/.test(tseg)) fail = true;
              else if (missing && /[a-zà-ÿ]{3}/.test(tseg)) missing.add(tseg);
              return seg;
            });
            if (any && !fail) out = res.join("");
          }
        }
      }
      cache.set(core, out);
      return out;
    }

    var missing = null;
    try { if (window.localStorage.getItem("hm-i18n-debug") === "1") missing = new Set(); } catch (e) { /* rien */ }
    api.missing = missing;

    function tr(s) {
      if (s == null) return s;
      s = String(s);
      if (!FRENCH.test(s)) return s;
      var core = norm(s);
      if (produced.has(core)) return s;
      var out = translateCore(core, 0);
      // Postes abrégés du jeu (POS_SHORT : M, A, AS, AF, P) : « Léo Martin (P, 29) »
      var base = out === null ? core : out;
      if (/\((M|A|AS|AF|P)[,)]/.test(base)) out = base.replace(/\((M|A|AS|AF|P)(?=[,)])/g, function (m0, p) { return "(" + POS_EN[p]; });
      if (out === null) {
        if (missing && /[a-zà-ÿ]/i.test(core)) missing.add(core);
        return s;
      }
      // Typographie anglaise : pas d'espace avant « : ; ! ? » ; un fragment
      // français élidé (« régler l' » + <b>Entraînement</b>) garde son espace.
      out = out.replace(/(\S)[ \u00a0\u202f]+([:;!?])(?=\s|$)/g, "$1$2");
      if (/'$/.test(core) && /[A-Za-z]$/.test(out)) out += " ";
      produced.add(norm(out));
      // garder les espaces de bord (mise en page du HTML)
      var lead = /^[\s ]*/.exec(s)[0];
      var trail = /[\s ]*$/.exec(s)[0];
      return lead + out + trail;
    }
    api.t = tr;

    var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1, PRE: 1 };
    var ATTRS = ["title", "placeholder", "aria-label", "alt", "data-tip", "data-label"];
    function skipEl(el) {
      for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
        if (SKIP[e.nodeName]) return true;
        if (e.isContentEditable) return true;
        if (e.hasAttribute("data-no-i18n")) return true;
      }
      return false;
    }
    // Postes abrégés : la table du jeu est passée en anglais pour les
    // prochains rendus ; ceux déjà affichés seuls dans une case (« AF »,
    // « P ») sont repris ici.
    try {
      /* global POS_SHORT */
      if (typeof POS_SHORT === "object" && POS_SHORT) {
        var POS_FULL = { "Meneur": "PG", "Arrière": "SG", "Ailier shooteur": "SF", "Ailier fort": "PF", "Pivot": "C" };
        Object.keys(POS_FULL).forEach(function (k) { POS_SHORT[k] = POS_FULL[k]; });
      }
    } catch (e) { /* page sans cette table */ }
    // Lettres seules des tableaux : J(oués)/V(ictoires)/D(éfaites) en tête de
    // colonne, pastilles de forme V/D ; exposant d'un rang (« 10<sup>e</sup> »).
    var LETTERS = { J: "GP", V: "W", D: "L" };
    function posCell(v, p) {
      var c = v.trim();
      if (p.nodeName === "SUP" && /^(e|er|re|ère|ème)$/.test(c)) {
        var prev = p.previousSibling && p.previousSibling.nodeValue || "";
        var num = /(\d+)\s*$/.exec(prev);
        if (num) return ordinal(+num[1]).replace(num[1], "");
      }
      if (LETTERS.hasOwnProperty(c)) {
        var pc = (p.getAttribute("class") || "");
        return p.nodeName === "TH" || /(^|\s)(lg-f|form|wl|res)/.test(pc) ? LETTERS[c] : null;
      }
      if (!POS_EN.hasOwnProperty(c)) return null;
      if (c.length === 2) return POS_EN[c];
      var cls = (p.getAttribute("class") || "") + " " + ((p.parentNode && p.parentNode.getAttribute && p.parentNode.getAttribute("class")) || "");
      return p.nodeName === "TD" || /pos/i.test(cls) ? POS_EN[c] : null;
    }
    function doText(node) {
      var v = node.nodeValue;
      if (!v) return;
      var p = node.parentNode;
      if (!p || p.nodeType !== 1) return;
      if (v.length <= 3) { var pc = posCell(v, p); if (pc) { node.nodeValue = v.replace(v.trim(), pc); return; } }
      if (!FRENCH.test(v)) return;
      if (skipEl(p)) return;
      var t = tr(v);
      if (t !== v) node.nodeValue = t;
    }
    function doAttrs(el) {
      for (var i = 0; i < ATTRS.length; i++) {
        var a = ATTRS[i];
        if (!el.hasAttribute(a)) continue;
        var v = el.getAttribute(a);
        var t = tr(v);
        if (t !== v) el.setAttribute(a, t);
      }
      if (el.nodeName === "INPUT" && /^(button|submit|reset)$/i.test(el.type) && el.value) {
        var t2 = tr(el.value);
        if (t2 !== el.value) el.value = t2;
      }
      if (el.nodeName === "META" && /^(description|apple-mobile-web-app-title)$/.test(el.getAttribute("name") || "")) {
        var c = el.getAttribute("content"); var t3 = tr(c); if (t3 !== c) el.setAttribute("content", t3);
      }
    }
    function doTree(root) {
      if (root.nodeType === 3) { doText(root); return; }
      if (root.nodeType !== 1 && root.nodeType !== 11) return;
      if (root.nodeType === 1) { if (skipEl(root)) return; doAttrs(root); }
      var walker = document.createTreeWalker(root, 1 | 4, null);
      var n;
      while ((n = walker.nextNode())) {
        if (n.nodeType === 3) doText(n);
        else if (SKIP[n.nodeName] || n.hasAttribute("data-no-i18n")) { /* le texte dedans est ignoré par doText */ }
        else doAttrs(n);
      }
    }
    api.translateTree = doTree;

    // Textes posés en CSS (content:"…") : repris ici plutôt que dans les
    // feuilles de style.
    try {
      var st = document.createElement("style");
      st.textContent = '.scouting-ad-gray-block::after{content:"Advertisement (placeholder)" !important;}' +
        '.hm-live .tname.mine::after{content:"My club" !important;}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { /* rien */ }

    var obs = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === "characterData") doText(r.target);
        else if (r.type === "attributes") { if (r.target.nodeType === 1 && !skipEl(r.target)) doAttrs(r.target); }
        else for (var j = 0; j < r.addedNodes.length; j++) doTree(r.addedNodes[j]);
      }
    });
    obs.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS.concat(["value", "content"]),
    });
    doTree(document.documentElement);
    document.addEventListener("DOMContentLoaded", function () { doTree(document.documentElement); });

    // Boîtes natives (quelques confirmations du jeu)
    ["alert", "confirm", "prompt"].forEach(function (fn) {
      var orig = window[fn];
      if (typeof orig !== "function") return;
      window[fn] = function (msg) {
        var args = Array.prototype.slice.call(arguments);
        if (typeof msg === "string") args[0] = msg.split("\n").map(tr).join("\n");
        return orig.apply(window, args);
      };
    });
  }
})();
