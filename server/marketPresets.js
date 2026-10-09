// Configurations de recherche du marché (demande du 2026-10-09) : jeux de
// filtres nommés, enregistrés sur le COMPTE (gardés d'une session et d'un
// appareil à l'autre). Format versionné et tolérant :
//   { id, name, v: 1, filters: { pos, q, origin, ageMin, ageMax, potMin,
//     potMax, priceMin, priceMax, budget, hideMine, watched, sort,
//     crit: [{ key, min, max }] }, createdAt, updatedAt }
// Champ absent = valeur par défaut ; champ inconnu = ignoré (ajout de
// nouveaux critères sans casser les anciennes configurations) ; une
// caractéristique qui n'existerait plus est écartée au chargement côté
// client (assets/market-presets.js). Purement cosmétique : aucun effet
// sur le marché lui-même.
"use strict";

const VERSION = 1;
const MAX_PRESETS = 20;
const NAME_MAX = 40;
const CRIT_MAX = 5;
const POS = ["all", "Meneur", "Arrière", "Ailier shooteur", "Ailier fort", "Pivot"];
const SORTS = ["ends", "ovr", "fit", "pot", "price", "age"];

const num = (v, lo, hi) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.max(lo, Math.min(hi, Math.round(Number(v)))));
function cleanName(raw) {
  const s = String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s.slice(0, NAME_MAX);
}
// Filtres nettoyés (bornes, types, listes connues) ; null si l'objet est inutilisable.
function cleanFilters(f) {
  if (!f || typeof f !== "object") return null;
  const out = {
    pos: POS.includes(f.pos) ? f.pos : "all",
    q: String(f.q == null ? "" : f.q).slice(0, 60),
    origin: typeof f.origin === "string" && /^(all|league|[a-z]{2,3})$/.test(f.origin) ? f.origin : "all",
    ageMin: num(f.ageMin, 0, 99), ageMax: num(f.ageMax, 0, 99),
    potMin: num(f.potMin, 0, 20), potMax: num(f.potMax, 0, 20),
    priceMin: num(f.priceMin, 0, 1e12), priceMax: num(f.priceMax, 0, 1e12),
    budget: !!f.budget, hideMine: !!f.hideMine, watched: !!f.watched,
    sort: SORTS.includes(f.sort) ? f.sort : "ends",
    crit: [],
  };
  if (out.ageMin != null && out.ageMax != null && out.ageMin > out.ageMax) [out.ageMin, out.ageMax] = [out.ageMax, out.ageMin];
  if (out.potMin != null && out.potMax != null && out.potMin > out.potMax) [out.potMin, out.potMax] = [out.potMax, out.potMin];
  if (out.priceMin != null && out.priceMax != null && out.priceMin > out.priceMax) [out.priceMin, out.priceMax] = [out.priceMax, out.priceMin];
  const seen = new Set();
  for (const c of Array.isArray(f.crit) ? f.crit : []) {
    if (!c || typeof c.key !== "string" || !/^[A-Za-z][A-Za-z0-9_]{1,31}$/.test(c.key) || seen.has(c.key)) continue;
    seen.add(c.key);
    out.crit.push({ key: c.key, min: num(c.min, 0, 100), max: num(c.max, 0, 100) });
    if (out.crit.length >= CRIT_MAX) break;
  }
  return out;
}
function list(account) {
  const arr = Array.isArray(account && account.marketPresets) ? account.marketPresets : [];
  return arr.filter(p => p && p.id && p.name && p.filters).map(p => ({ id: p.id, name: p.name, v: p.v || 1, filters: cleanFilters(p.filters) || cleanFilters({}), createdAt: p.createdAt || 0, updatedAt: p.updatedAt || 0 }));
}
const sameName = (a, b) => a.toLocaleLowerCase("fr") === b.toLocaleLowerCase("fr");
// Une action : save (nouvelle, ou remplace celle du même nom seulement si
// overwrite), update (nouveaux filtres d'une configuration), rename, delete.
function apply(account, body, now = Date.now()) {
  const presets = list(account);
  const action = body && body.action;
  const fail = (code, error, status = 400) => ({ ok: false, status, code, error });
  if (action === "save") {
    const name = cleanName(body.name);
    if (!name) return fail("name-required", "Donnez un nom à la configuration.");
    const filters = cleanFilters(body.filters);
    if (!filters) return fail("filters-invalid", "Critères invalides.");
    const dup = presets.find(p => sameName(p.name, name));
    if (dup && !body.overwrite) return fail("name-taken", `Une configuration « ${dup.name} » existe déjà.`, 409);
    if (dup) { dup.filters = filters; dup.updatedAt = now; dup.v = VERSION; }
    else {
      if (presets.length >= MAX_PRESETS) return fail("too-many", `${MAX_PRESETS} configurations au maximum.`);
      presets.push({ id: "mp_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 7), name, v: VERSION, filters, createdAt: now, updatedAt: now });
    }
  } else if (action === "update" || action === "rename" || action === "delete") {
    const p = presets.find(x => x.id === body.id);
    if (!p) return fail("not-found", "Configuration introuvable.", 404);
    if (action === "delete") presets.splice(presets.indexOf(p), 1);
    else if (action === "update") { const filters = cleanFilters(body.filters); if (!filters) return fail("filters-invalid", "Critères invalides."); p.filters = filters; p.updatedAt = now; p.v = VERSION; }
    else {
      const name = cleanName(body.name);
      if (!name) return fail("name-required", "Donnez un nom à la configuration.");
      if (presets.some(x => x !== p && sameName(x.name, name))) return fail("name-taken", `Une configuration « ${name} » existe déjà.`, 409);
      p.name = name; p.updatedAt = now;
    }
  } else return fail("action-invalid", "Action inconnue.");
  account.marketPresets = presets;
  return { ok: true, presets };
}
module.exports = { VERSION, MAX_PRESETS, NAME_MAX, CRIT_MAX, cleanFilters, cleanName, list, apply };
