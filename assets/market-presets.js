// =====================================================================
// MARCHÉ — CONFIGURATIONS DE RECHERCHE (demande du 2026-10-09) : enregistrer
// les critères du marché des joueurs sous un nom, les recharger d'un clic,
// les mettre à jour, renommer, supprimer. Stockées sur le COMPTE
// (/api/account/market-presets, server/marketPresets.js : mêmes règles de
// nettoyage, 20 au plus, noms uniques) ; sans compte, dans ce navigateur
// (localStorage, même format). Charger une configuration est toujours une
// action explicite : la recherche en cours n'est jamais remplacée seule.
// Branché sur le rendu du marché (renderMarketListings) sans le modifier.
// Fenêtres : .upgrade-confirm-overlay (bottom sheet sur téléphone).
// =====================================================================
(function () {
  "use strict";
  if (typeof window === "undefined" || window.HM_MARKET_PRESETS) return;
  var LS = "hm-market-presets", MAX = 20, NAME_MAX = 40;
  var st = { presets: null, persisted: null, loading: null, err: "" };
  var KEYS = ["pos", "q", "origin", "ageMin", "ageMax", "potMin", "potMax", "priceMin", "priceMax", "budget", "hideMine", "watched", "sort"];
  var DEF = { pos: "all", q: "", origin: "all", ageMin: null, ageMax: null, potMin: null, potMax: null, priceMin: null, priceMax: null, budget: false, hideMine: false, watched: false, sort: "ends", crit: [] };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function mu() { try { return typeof marketUi !== "undefined" ? marketUi : null; } catch (e) { return null; } }
  // Caractéristiques encore proposées par le marché (MK_GROUPS) : une
  // configuration ancienne n'en ramène jamais une qui n'existe plus.
  function critKeys() { try { return typeof MK_GROUPS !== "undefined" ? MK_GROUPS.reduce(function (a, g) { return a.concat(g.keys); }, []) : null; } catch (e) { return null; } }
  function critMax() { try { return typeof MK_CRIT_MAX !== "undefined" ? MK_CRIT_MAX : 5; } catch (e) { return 5; } }
  function current() {
    var u = mu(), f = {};
    if (!u) return null;
    KEYS.forEach(function (k) { f[k] = u[k] == null ? DEF[k] : u[k]; });
    f.crit = (u.crit || []).filter(function (c) { return c && c.key; }).map(function (c) { return { key: c.key, min: c.min == null ? null : c.min, max: c.max == null ? null : c.max }; });
    return f;
  }
  function norm(f) { var o = {}; KEYS.forEach(function (k) { o[k] = f && f[k] != null ? f[k] : DEF[k]; }); o.crit = ((f && f.crit) || []).map(function (c) { return { key: c.key, min: c.min == null ? null : c.min, max: c.max == null ? null : c.max }; }); return JSON.stringify(o); }
  function isDefault(f) { return norm(f) === norm(DEF); }
  function token() { try { return typeof managerToken !== "undefined" ? managerToken : null; } catch (e) { return null; } }
  function call(method, body) {
    var f = window.fetchApi;
    if (typeof f !== "function" || !token()) return Promise.resolve({ ok: true, presets: [], persisted: false });
    return f("/api/account/market-presets", method === "GET" ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (d) { d.status = r.status; return d; }); });
  }
  // Sans compte : même format, dans ce navigateur.
  function localGet() { try { var a = JSON.parse(localStorage.getItem(LS) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function localSet(a) { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) { /* navigation privée */ } }
  function localApply(b) {
    var a = localGet(), now = Date.now(), same = function (x, y) { return x.toLocaleLowerCase("fr") === y.toLocaleLowerCase("fr"); };
    var name = String(b.name || "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    if (b.action === "save") {
      if (!name) return { ok: false, error: "Donnez un nom à la configuration." };
      var dup = a.filter(function (p) { return same(p.name, name); })[0];
      if (dup && !b.overwrite) return { ok: false, status: 409, error: "Une configuration « " + dup.name + " » existe déjà." };
      if (dup) { dup.filters = b.filters; dup.updatedAt = now; }
      else { if (a.length >= MAX) return { ok: false, error: MAX + " configurations au maximum." }; a.push({ id: "mp_" + now.toString(36), name: name, v: 1, filters: b.filters, createdAt: now, updatedAt: now }); }
    } else {
      var p = a.filter(function (x) { return x.id === b.id; })[0];
      if (!p) return { ok: false, error: "Configuration introuvable." };
      if (b.action === "delete") a.splice(a.indexOf(p), 1);
      else if (b.action === "update") { p.filters = b.filters; p.updatedAt = now; }
      else { if (!name) return { ok: false, error: "Donnez un nom à la configuration." }; if (a.some(function (x) { return x !== p && same(x.name, name); })) return { ok: false, status: 409, error: "Une configuration « " + name + " » existe déjà." }; p.name = name; }
    }
    localSet(a);
    return { ok: true, presets: a, persisted: false };
  }
  function load() {
    if (st.presets) return Promise.resolve(st.presets);
    if (!st.loading) st.loading = call("GET").then(function (d) {
      st.persisted = !!(d && d.persisted);
      st.presets = st.persisted && Array.isArray(d.presets) ? d.presets : localGet();
      render();
      return st.presets;
    }).catch(function () { st.persisted = false; st.presets = localGet(); render(); return st.presets; });
    return st.loading;
  }
  function act(body) {
    if (body.filters === undefined && (body.action === "save" || body.action === "update")) body.filters = current();
    var p = st.persisted ? call("POST", body) : Promise.resolve(localApply(body));
    return p.then(function (d) {
      if (d && d.ok) { st.presets = d.presets || []; st.err = ""; render(); }
      return d;
    });
  }
  // Charger : filtres de la configuration (champs absents = par défaut,
  // caractéristiques disparues écartées), puis le rendu habituel du marché.
  function applyPreset(p) {
    var u = mu();
    if (!u || !p) return;
    var f = p.filters || {}, keys = critKeys();
    KEYS.forEach(function (k) { u[k] = f[k] == null ? DEF[k] : f[k]; });
    u.crit = (f.crit || []).filter(function (c) { return c && c.key && (!keys || keys.indexOf(c.key) >= 0); }).slice(0, critMax()).map(function (c) { return { key: c.key, min: c.min == null ? 0 : c.min, max: c.max == null ? 99 : c.max }; });   // bornes par défaut du marché
    u.critOpen = false;
    if (u.mode !== "players") { u.mode = "players"; if (typeof window.renderMarcheSection === "function") window.renderMarcheSection(); }
    var s = document.getElementById("marketSearch"); if (s) s.value = u.q || "";
    if (typeof window.renderMarketCritPanel === "function") window.renderMarketCritPanel();
    if (typeof window.renderMarketListings === "function") window.renderMarketListings();
    toast("Recherche « " + p.name + " » chargée.");
  }
  function toast(m) { if (typeof window.showToast === "function") window.showToast(m); }

  // --- Barre « Mes recherches » ---------------------------------------
  function bar() {
    var b = document.getElementById("marketPresetsBar");
    if (b) return b;
    var anchor = document.getElementById("marketAlertsBar") || document.getElementById("marketResCount");
    if (!anchor || !anchor.parentNode) return null;
    b = document.createElement("div");
    b.id = "marketPresetsBar"; b.className = "mk-presets";
    anchor.parentNode.insertBefore(b, anchor);
    b.addEventListener("click", onBarClick);
    return b;
  }
  function render() {
    var u = mu(), b = bar();
    if (!b || !u) return;
    if (u.mode !== "players") { b.hidden = true; return; }
    b.hidden = false;
    if (!st.presets) { load(); b.innerHTML = '<span class="mk-presets-lbl">Mes recherches</span><span class="mk-presets-empty">Chargement…</span>'; return; }
    var cur = norm(current());
    var chips = st.presets.map(function (p) {
      var on = norm(p.filters) === cur;
      return '<span class="mk-preset' + (on ? " on" : "") + '"><button type="button" class="mk-preset-load" data-mkp-load="' + esc(p.id) + '" aria-pressed="' + on + '" title="Charger cette recherche">' + esc(p.name) + "</button>" +
        '<button type="button" class="mk-preset-more" data-mkp-more="' + esc(p.id) + '" aria-label="Gérer « ' + esc(p.name) + ' »">⋯</button></span>';
    }).join("");
    var canSave = !isDefault(current());
    b.innerHTML = '<span class="mk-presets-lbl">Mes recherches</span>' + (chips || '<span class="mk-presets-empty">Aucune configuration enregistrée.</span>') +
      '<button type="button" class="mk-linkbtn" data-mkp-save' + (canSave ? "" : ' disabled title="Choisissez d\'abord des critères"') + ">💾 Enregistrer cette recherche</button>" +
      (st.persisted === false && token() ? '<span class="mk-presets-note">Enregistrées dans ce navigateur (créez un compte pour les retrouver partout).</span>' : "");
  }
  function onBarClick(e) {
    var t = e.target.closest ? e.target.closest("button") : null;
    if (!t) return;
    if (t.dataset.mkpLoad) { applyPreset(find(t.dataset.mkpLoad)); return; }
    if (t.dataset.mkpMore) { openManage(find(t.dataset.mkpMore)); return; }
    if (t.dataset.mkpSave !== undefined && !t.disabled) openSave();
  }
  function find(id) { return (st.presets || []).filter(function (p) { return p.id === id; })[0] || null; }

  // --- Fenêtres (bottom sheet sur téléphone, règle UI du projet) ----------
  function close() { var o = document.getElementById("mkPresetOverlay"); if (o) o.remove(); }
  function sheet(inner, onClick) {
    close();
    var o = document.createElement("div");
    o.className = "upgrade-confirm-overlay"; o.id = "mkPresetOverlay";
    o.innerHTML = '<div class="upgrade-confirm-box mk-preset-box" role="dialog" aria-modal="true">' + inner + "</div>";
    o.addEventListener("click", function (e) { if (e.target === o || (e.target.closest && e.target.closest("[data-mkp-cancel]"))) { close(); return; } onClick(e, o); });
    document.body.appendChild(o);
    var inp = o.querySelector("input"); if (inp) { try { inp.focus(); inp.select(); } catch (e) { /* rien */ } }
    return o;
  }
  function errHtml(m) { return '<p class="mk-preset-err" role="alert"' + (m ? "" : " hidden") + ">" + esc(m || "") + "</p>"; }
  function openSave(prefill, overwrite) {
    var o = sheet('<h3>Enregistrer la recherche</h3><p class="mk-preset-sub">Les critères actuels (poste, âge, potentiel, prix, origine, caractéristiques, tri…) sous un nom, pour les recharger d\'un clic.</p>' +
      '<label class="mk-preset-lbl" for="mkPresetName">Nom</label><input id="mkPresetName" class="mk-preset-in" maxlength="' + NAME_MAX + '" value="' + esc(prefill || "") + '" placeholder="Ex. : Pivots jeunes à potentiel">' + errHtml("") +
      '<div class="mk-preset-actions"><button type="button" class="tq-btn" data-mkp-cancel>Annuler</button><button type="button" class="cal-next-btn" data-mkp-ok>Enregistrer</button></div>', function (e, ov) {
      if (!(e.target.closest && e.target.closest("[data-mkp-ok]"))) return;
      submitSave(ov, !!overwrite);
    });
    o.querySelector("input").addEventListener("keydown", function (e) { if (e.key === "Enter") submitSave(o, !!overwrite); });
  }
  function submitSave(o, overwrite) {
    var name = o.querySelector("#mkPresetName").value;
    act({ action: "save", name: name, overwrite: overwrite }).then(function (d) {
      if (d && d.ok) { close(); toast("Recherche « " + name.trim() + " » enregistrée."); return; }
      if (d && (d.status === 409 || d.code === "name-taken")) {
        // Doublon : jamais d'écrasement sans le dire.
        var err = o.querySelector(".mk-preset-err");
        err.hidden = false; err.innerHTML = esc(d.error || "Ce nom existe déjà.") + ' <button type="button" class="mk-linkbtn amber" data-mkp-over>Remplacer ses critères</button>';
        err.querySelector("[data-mkp-over]").addEventListener("click", function () { act({ action: "save", name: name, overwrite: true }).then(function (d2) { if (d2 && d2.ok) { close(); toast("Recherche « " + name.trim() + " » mise à jour."); } }); });
        return;
      }
      var e2 = o.querySelector(".mk-preset-err"); e2.hidden = false; e2.textContent = (d && d.error) || "Enregistrement impossible.";
    });
  }
  function openManage(p) {
    if (!p) return;
    var o = sheet('<h3>' + esc(p.name) + '</h3><p class="mk-preset-sub">' + esc(summary(p.filters)) + "</p>" +
      '<div class="mk-preset-list"><button type="button" class="cal-next-btn" data-mkp-do="load">Charger cette recherche</button>' +
      '<button type="button" class="tq-btn" data-mkp-do="update"' + (isDefault(current()) ? " disabled" : "") + '>Remplacer par les critères actuels</button></div>' +
      '<label class="mk-preset-lbl" for="mkPresetName">Renommer</label><div class="mk-preset-row"><input id="mkPresetName" class="mk-preset-in" maxlength="' + NAME_MAX + '" value="' + esc(p.name) + '"><button type="button" class="tq-btn" data-mkp-do="rename">Renommer</button></div>' +
      errHtml("") + '<div class="mk-preset-actions"><button type="button" class="tq-btn mk-preset-del" data-mkp-do="delete">Supprimer</button><button type="button" class="tq-btn" data-mkp-cancel>Fermer</button></div>', function (e, ov) {
      var b = e.target.closest && e.target.closest("[data-mkp-do]");
      if (!b || b.disabled) return;
      var what = b.dataset.mkpDo, show = function (d) { var er = ov.querySelector(".mk-preset-err"); er.hidden = false; er.textContent = (d && d.error) || "Action impossible."; };
      if (what === "load") { close(); applyPreset(p); return; }
      if (what === "delete") {
        if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Confirmer la suppression"; return; }
        act({ action: "delete", id: p.id }).then(function (d) { if (d && d.ok) { close(); toast("Configuration supprimée."); } else show(d); });
        return;
      }
      if (what === "update") act({ action: "update", id: p.id }).then(function (d) { if (d && d.ok) { close(); toast("« " + p.name + " » mise à jour."); } else show(d); });
      if (what === "rename") act({ action: "rename", id: p.id, name: ov.querySelector("#mkPresetName").value }).then(function (d) { if (d && d.ok) { close(); toast("Configuration renommée."); } else show(d); });
    });
    return o;
  }
  function summary(f) {
    f = f || {};
    var parts = [];
    if (f.pos && f.pos !== "all") parts.push(f.pos);
    if (f.ageMin != null || f.ageMax != null) parts.push("Âge " + (f.ageMin != null ? f.ageMin : "…") + "–" + (f.ageMax != null ? f.ageMax : "…"));
    if (f.potMin != null || f.potMax != null) parts.push("Potentiel " + (f.potMin != null ? f.potMin : "…") + "–" + (f.potMax != null ? f.potMax : "…"));
    if (f.priceMax != null) parts.push("Prix ≤ " + f.priceMax);
    if (f.budget) parts.push("Dans mon budget");
    if (f.origin && f.origin !== "all") parts.push(f.origin === "league" ? "Mon championnat" : String(f.origin).toUpperCase());
    if (f.q) parts.push("« " + f.q + " »");
    if ((f.crit || []).length) parts.push((f.crit || []).length + " caractéristique(s)");
    return parts.join(" · ") || "Tous les joueurs";
  }
  var CSS = ".mk-presets{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}.mk-presets[hidden]{display:none}" +
    ".mk-presets-lbl{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint)}.mk-presets-empty,.mk-presets-note{font-size:12.5px;color:var(--ink-dim)}" +
    ".mk-preset{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;background:var(--panel-2);overflow:hidden}.mk-preset.on{border-color:var(--amber);background:rgba(240,162,60,.12)}" +
    ".mk-preset button{background:none;border:0;color:var(--ink);font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:6px 10px}.mk-preset .mk-preset-more{padding:6px 10px 6px 4px;color:var(--ink-dim)}" +
    ".mk-preset-box{max-width:460px}.mk-preset-box h3{margin:0 0 6px}.mk-preset-sub{margin:0 0 12px;color:var(--ink-dim);font-size:13.5px}.mk-preset-lbl{display:block;font-size:12.5px;font-weight:700;margin:10px 0 6px}" +
    ".mk-preset-in{width:100%;box-sizing:border-box;height:42px;border-radius:10px;border:1px solid var(--line);background:var(--panel-2);color:var(--ink);font:inherit;padding:0 12px}" +
    ".mk-preset-row{display:flex;gap:8px}.mk-preset-list{display:flex;flex-direction:column;gap:8px}.mk-preset-actions{display:flex;justify-content:space-between;gap:8px;margin-top:14px}.mk-preset-err{color:var(--danger);font-size:13px;margin:8px 0 0}.mk-preset-del{color:var(--danger)}";
  function ensureCss() { if (document.getElementById("mkPresetCss")) return; var s = document.createElement("style"); s.id = "mkPresetCss"; s.textContent = CSS; document.head.appendChild(s); }
  // Branchement : après chaque rendu de la liste du marché.
  function hook() {
    var orig = window.renderMarketListings;
    if (typeof orig !== "function" || orig.__mkp) return false;
    var wrapped = function () { var r = orig.apply(this, arguments); try { ensureCss(); render(); } catch (e) { /* jamais bloquant */ } return r; };
    wrapped.__mkp = true;
    window.renderMarketListings = wrapped;
    return true;
  }
  if (!hook()) document.addEventListener("DOMContentLoaded", hook);
  window.HM_MARKET_PRESETS = { load: load, render: render, apply: applyPreset, act: act, current: current, summary: summary, get state() { return st; }, _reset: function () { st.presets = null; st.persisted = null; st.loading = null; } };
})();
