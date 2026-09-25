/* Hoop Manager — couche "application mobile" (PWA, 2026-09-25).
   Retour utilisateur : "réfléchis à l'application mobile et prépare le
   code" (choix : PWA + Capacitor, écrans du quotidien d'abord).
   Tout le mobile vit ici et dans mobile.css, à part de moteurbasket3.html,
   pour ne pas se mélanger au reste du jeu :
   - barre d'onglets en bas (Accueil, Ordres, Calendrier, Économie, Menu) :
     de VRAIS .tab-btn[data-tab], donc la navigation existante (délégation
     [data-tab] sur document + setActiveTab) les gère sans rien de plus ;
   - le menu latéral devient un tiroir (bouton Menu, fond cliquable, Échap) ;
   - bouton loupe dans l'en-tête pour afficher la recherche ;
   - manifest recopiant le jeton manager (?m=) + enregistrement du service
     worker (/sw.js), pour l'installation sur l'écran d'accueil.
   Aucune logique de jeu ici : uniquement de la mise en page/navigation. */
(function () {
  "use strict";

  var MOBILE_QUERY = "(max-width: 768px)";
  var TOKEN_KEY = "tipinManagerToken_v1"; // même clé que MANAGER_TOKEN_STORAGE_KEY (moteurbasket3.html)

  function svg(path) {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"></path></svg>';
  }
  var ICONS = {
    club: "M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6",
    ordres: "M9 5h10 M9 12h10 M9 19h10 M4.5 5h.01 M4.5 12h.01 M4.5 19h.01",
    calendrier: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
    economie: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v10 M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5",
    menu: "M4 7h16 M4 12h16 M4 17h16",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4",
    close: "M6 6l12 12 M18 6L6 18",
  };

  function readToken() {
    try {
      var fromUrl = new URLSearchParams(window.location.search).get("m");
      if (fromUrl) return fromUrl;
    } catch (e) { /* navigateur ancien */ }
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  // Manifest : start_url avec le jeton, voir serveManifest côté serveur.
  function syncManifest() {
    var link = document.querySelector('link[rel="manifest"]');
    var token = readToken();
    if (link && token && /^[A-Za-z0-9_-]{1,128}$/.test(token)) {
      link.setAttribute("href", "/manifest.webmanifest?m=" + encodeURIComponent(token));
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    var secure = window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!secure) return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () { /* sans service worker, le jeu marche quand même */ });
    });
  }

  function setDrawer(open) {
    document.body.classList.toggle("m-drawer-open", open);
    var btn = document.getElementById("mTabMenu");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function buildTabbar() {
    if (document.getElementById("mTabbar")) return;
    var tabs = [
      ["club", "Accueil"],
      ["ordres", "Ordres"],
      ["calendrier", "Calendrier"],
      ["economie", "Économie"],
    ];
    var nav = document.createElement("nav");
    nav.id = "mTabbar";
    nav.className = "m-tabbar";
    nav.setAttribute("aria-label", "Navigation principale (mobile)");
    var html = "";
    tabs.forEach(function (t) {
      html += '<button type="button" class="tab-btn m-tab" data-tab="' + t[0] + '">' + svg(ICONS[t[0]]) + "<span>" + t[1] + "</span></button>";
    });
    html += '<button type="button" class="m-tab m-tab-menu" id="mTabMenu" aria-expanded="false" aria-controls="sidebar">' + svg(ICONS.menu) + "<span>Menu</span></button>";
    nav.innerHTML = html;
    document.body.appendChild(nav);

    var backdrop = document.createElement("div");
    backdrop.className = "m-drawer-backdrop";
    backdrop.id = "mDrawerBackdrop";
    document.body.appendChild(backdrop);

    // L'onglet actif est recalé sur celui de la barre latérale au démarrage
    // (setActiveTab n'a peut-être déjà plus rien à rappeler).
    var active = document.querySelector(".sidebar .tab-btn.active");
    if (active) {
      nav.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === active.dataset.tab); });
    }

    document.getElementById("mTabMenu").addEventListener("click", function () {
      setDrawer(!document.body.classList.contains("m-drawer-open"));
    });
    backdrop.addEventListener("click", function () { setDrawer(false); });
  }

  function buildSearchToggle() {
    var right = document.querySelector(".topbar-right");
    var searchWrap = document.getElementById("topbarSearchWrap");
    if (!right || !searchWrap || document.getElementById("mSearchToggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "mSearchToggle";
    btn.className = "m-search-toggle";
    btn.setAttribute("aria-label", "Rechercher une équipe ou un joueur");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = svg(ICONS.search);
    right.insertBefore(btn, right.firstChild);
    btn.addEventListener("click", function () {
      var open = !document.body.classList.contains("m-search-open");
      document.body.classList.toggle("m-search-open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.innerHTML = svg(open ? ICONS.close : ICONS.search);
      if (open) {
        var input = document.getElementById("topbarSearchInput");
        if (input) input.focus();
      }
    });
  }

  function closeOverlays() {
    setDrawer(false);
    if (document.body.classList.contains("m-search-open")) {
      var btn = document.getElementById("mSearchToggle");
      if (btn) btn.click();
    }
  }

  function init() {
    syncManifest();
    buildTabbar();
    buildSearchToggle();
    var mq = window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;
    var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
    document.documentElement.classList.toggle("m-standalone", !!standalone);

    // Tout changement d'onglet (barre du bas, tiroir, liens internes) ferme
    // le tiroir et la recherche, et remonte en haut de la page sur mobile.
    document.addEventListener("click", function (e) {
      var tab = e.target.closest && e.target.closest("[data-tab]");
      if (!tab) return;
      closeOverlays();
      if (mq && mq.matches) window.scrollTo(0, 0);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeOverlays();
    });
    if (mq && mq.addEventListener) {
      mq.addEventListener("change", function (ev) { if (!ev.matches) closeOverlays(); });
    }
  }

  registerServiceWorker();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
