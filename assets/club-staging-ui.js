// Interface Personnalisation du coach et de la mascotte (2026-10-08), sortie
// de moteurbasket3.html (limite de 4 Mo de la page, load_size_test) : script
// classique chargé en `defer`, même portée globale que la page. Utilise
// coachSeedFor / coachAvatarFor, normalizeCoachLook / normalizeMascot,
// mascotFor, teamA, fetchApi… définis dans la page.
const COACH_LABELS = {
  hairStyles: { short: "Court", sidepart: "Raie sur le côté", slick: "Plaqué", buzz: "Rasé court", fade: "Dégradé", wavy: "Ondulé", receding: "Dégarni", undercut: "Undercut", curlytop: "Bouclé", afro: "Afro", bald: "Chauve" },
  beards: { none: "Sans", stubble: "3 jours", short: "Courte", goatee: "Bouc", boxed: "Taillée", full: "Fournie", circle: "Collier", mustache: "Moustache" },
  outfits: { suit: "Costume", tracksuit: "Survêtement", polo: "Polo du club" },
  accessories: { none: "Aucun", glasses: "Lunettes", cap: "Casquette", clipboard: "Clipboard", tablet: "Tablette" },
};
let persoCoachDraft = null;
function persoCoachCurrent() {
  if (persoCoachDraft) return persoCoachDraft;
  const saved = normalizeCoachLook(teamA.coachLook);
  if (saved) return saved;
  // Point de départ = le coach par défaut du club (valeurs explicites).
  const a = AvatarGen.coachSpec(coachSeedFor(teamA), null);
  return normalizeCoachLook({ skin: a.skinIndex, face: a.faceShape, eyes: a.eyeShape,
    hairStyle: COACH_LOOK_OPTIONS.hairStyles.includes(a.hairStyle) ? a.hairStyle : "short",
    hairColor: Math.max(0, AvatarGen.HAIR_COLORS.indexOf(a.hairColor)),
    beard: COACH_LOOK_OPTIONS.beards.includes(a.beard) ? a.beard : "stubble", outfit: "suit", accessory: "none" });
}
function renderPersoCoach() {
  const holder = document.getElementById("persoCoachHolder");
  if (!holder || !teamA) return;
  const cur = persoCoachCurrent();
  const saved = normalizeCoachLook(teamA.coachLook);
  const chips = (attr, list, labels, value) => `<div class="pz-arena-chips">` + list.map(k =>
    `<button type="button" class="pz-arena-chip${value === k ? " on" : ""}" ${attr}="${k}" aria-pressed="${value === k}">${escapeHtml(labels[k] || k)}</button>`).join("") + `</div>`;
  const nums = (attr, n, value, label, color) => `<div class="pz-arena-swatches">` + Array.from({ length: n }, (_, i) =>
    `<button type="button" class="pz-arena-sw${value === i ? " on" : ""}" ${attr}="${i}" aria-label="${label} ${i + 1}" aria-pressed="${value === i}" style="${color ? `background:${color(i)}` : ""}">${color ? "" : `<span>${i + 1}</span>`}</button>`).join("") + `</div>`;
  const SK = ["#F7DCC8", "#F0CBAE", "#E6B894", "#D9A47C", "#C98E62", "#B77A50", "#A0663F", "#855032", "#6B3E26", "#4E2D1C"];
  let html = `<div class="pz-arena-layout pz-coach-layout"><div class="pz-coach-preview" role="img" aria-label="Aperçu du coach">${coachAvatarFor(teamA, cur)}</div>`;
  html += `<div class="pz-arena-controls"><h4 class="pz-subtitle">Votre coach</h4>`;
  html += `<p class="pz-note" style="margin:0 0 4px">Il se tient devant votre banc pendant les matchs en direct, et vos adversaires le voient aussi.</p>`;
  html += `<p class="pz-label">Teint</p>` + nums("data-coach-skin", 10, cur.skin, "Teint", i => SK[i]);
  html += `<p class="pz-label">Visage</p>` + nums("data-coach-face", 5, cur.face, "Visage");
  html += `<p class="pz-label">Yeux</p>` + nums("data-coach-eyes", 5, cur.eyes, "Yeux");
  html += `<p class="pz-label">Coiffure</p>` + chips("data-coach-hair", COACH_LOOK_OPTIONS.hairStyles, COACH_LABELS.hairStyles, cur.hairStyle);
  html += `<p class="pz-label">Couleur des cheveux</p>` + nums("data-coach-haircolor", 10, cur.hairColor, "Couleur", i => AvatarGen.HAIR_COLORS[i]);
  html += `<p class="pz-label">Pilosité</p>` + chips("data-coach-beard", COACH_LOOK_OPTIONS.beards, COACH_LABELS.beards, cur.beard);
  html += `<p class="pz-label">Tenue</p>` + chips("data-coach-outfit", COACH_LOOK_OPTIONS.outfits, COACH_LABELS.outfits, cur.outfit);
  html += `<p class="pz-label">Accessoire</p>` + chips("data-coach-acc", COACH_LOOK_OPTIONS.accessories, COACH_LABELS.accessories, cur.accessory);
  const dirty = !!persoCoachDraft && JSON.stringify(normalizeCoachLook(persoCoachDraft)) !== JSON.stringify(saved);
  html += `<div class="sl-court-actions"><button type="button" class="pz-btn" id="persoCoachSaveBtn"${dirty ? "" : " disabled"}>Enregistrer le coach</button>` +
    (saved ? `<button type="button" class="pz-btn pz-btn--ghost" id="persoCoachResetBtn">Coach par défaut</button>` : "") +
    `<span class="sub" id="persoCoachFeedback" role="status"></span></div>`;
  html += `</div></div>`;
  holder.innerHTML = html;
}
async function persoCoachSave(look) {
  const fb = () => document.getElementById("persoCoachFeedback");
  try {
    const res = await fetchApi("/api/club/set-coach-look", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coachLook: look }) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || `Erreur serveur (${res.status}).`);
    teamA.coachLook = data.coachLook;
    persoCoachDraft = null;
    renderPersoCoach();
    if (fb()) fb().textContent = look ? "Coach enregistré : visible devant votre banc en direct." : "Coach par défaut rétabli.";
  } catch (err) {
    if (fb()) fb().textContent = err.message || "Enregistrement impossible.";
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-coach-skin], [data-coach-face], [data-coach-eyes], [data-coach-hair], [data-coach-haircolor], [data-coach-beard], [data-coach-outfit], [data-coach-acc]");
  if (b && b.closest("#persoCoachHolder")) {
    const next = { ...persoCoachCurrent() };
    const d = b.dataset;
    if (d.coachSkin != null) next.skin = +d.coachSkin;
    else if (d.coachFace != null) next.face = +d.coachFace;
    else if (d.coachEyes != null) next.eyes = +d.coachEyes;
    else if (d.coachHair) next.hairStyle = d.coachHair;
    else if (d.coachHaircolor != null) next.hairColor = +d.coachHaircolor;
    else if (d.coachBeard) next.beard = d.coachBeard;
    else if (d.coachOutfit) next.outfit = d.coachOutfit;
    else if (d.coachAcc) next.accessory = d.coachAcc;
    persoCoachDraft = normalizeCoachLook(next);
    renderPersoCoach();
    return;
  }
  if (e.target.closest("#persoCoachSaveBtn")) { persoCoachSave(normalizeCoachLook(persoCoachCurrent())); return; }
  if (e.target.closest("#persoCoachResetBtn")) { persoCoachDraft = null; persoCoachSave(null); }
});
// ---------------------------------------------------------------------
// Mascotte du club (Premium, 2026-10-08) : elle fait le show de fin de 1er
// quart-temps quand le club reçoit (dunk sur trampoline). Sans Premium :
// mascotte par défaut tirée du sigle (KRA → kraken) et des couleurs ; une
// mascotte enregistrée est GARDÉE si le Premium expire (simplement ignorée
// par mascotFor) et revient si le club redevient Premium. Dessin : module
// assets/live/characters.js (version détaillée), chargé à la demande.
// ---------------------------------------------------------------------
let persoMascotDraft = null, hmCharactersMod = null, hmCharactersPromise = null;
function hmLoadCharacters() {
  if (!hmCharactersPromise) hmCharactersPromise = import(new URL("assets/live/characters.js?v=" + HM_LIVE_ASSET_VERSION, document.baseURI).href).then(m => (hmCharactersMod = m)).catch(() => null);
  return hmCharactersPromise;
}
const MASCOT_LABELS = {
  species: { kraken: "Kraken", ours: "Ours", aigle: "Aigle", dragon: "Dragon", loup: "Loup", taureau: "Taureau" },
  accessories: { none: "Aucun", bandeau: "Bandeau", lunettes: "Lunettes", casquette: "Casquette", couronne: "Couronne" },
  celebrations: { salto: "Salto", dab: "Dab", danse: "Danse" },
};
function persoMascotCurrent() {
  if (persoMascotDraft) return persoMascotDraft;
  const saved = normalizeMascot(teamA.mascot);
  if (saved) return saved;
  const [p, q] = teamAvatarColors(teamA);
  const d = hmCharactersMod ? hmCharactersMod.defaultMascot(teamTrigram(teamA), [p, q]) : { species: "kraken", accessory: "bandeau", celebration: "salto", number: 8 };
  return normalizeMascot({ ...d, primary: null, secondary: null, name: "" });
}
function renderPersoMascot() {
  const holder = document.getElementById("persoMascotHolder");
  if (!holder || !teamA) return;
  if (!hmCharactersMod) { holder.innerHTML = `<p class="pz-note">Chargement…</p>`; hmLoadCharacters().then(m => { if (m) renderPersoMascot(); }); return; }
  const premium = teamIsPremium(teamA);
  const cur = persoMascotCurrent();
  const saved = normalizeMascot(teamA.mascot);
  const [clubA, clubB] = teamAvatarColors(teamA);
  const cfg = { ...cur, primary: cur.primary || clubA, secondary: cur.secondary || clubB };
  const art = `<svg viewBox="-34 -62 68 70" aria-hidden="true">${hmCharactersMod.mascot(cfg, { detail: true })}</svg>`;
  const chips = (attr, list, labels, value) => `<div class="pz-arena-chips">` + list.map(k =>
    `<button type="button" class="pz-arena-chip${value === k ? " on" : ""}" ${attr}="${k}" aria-pressed="${value === k}"${premium ? "" : " disabled"}>${escapeHtml(labels[k] || k)}</button>`).join("") + `</div>`;
  let html = `<div class="pz-arena-layout pz-coach-layout"><div class="pz-coach-preview pz-mascot-preview${premium ? "" : " is-locked"}" role="img" aria-label="Aperçu de la mascotte">${art}` +
    (premium ? "" : `<span class="pz-arena-lock"><span class="prm-tag">Premium</span> Mascotte par défaut</span>`) + `</div>`;
  html += `<div class="pz-arena-controls"><h4 class="pz-subtitle">${escapeHtml(cur.name || "Votre mascotte")}${premium ? "" : ` <span class="prm-tag">Premium</span>`}</h4>`;
  html += `<p class="pz-note" style="margin:0 0 4px">${premium
    ? "Elle fait le show de fin de 1er quart-temps quand vous recevez : vos adversaires la voient aussi."
    : "Votre club a une mascotte par défaut, tirée de son sigle. Avec Premium, choisissez son espèce, son nom, ses couleurs, son numéro, un accessoire et sa célébration."}</p>`;
  if (premium) {
    html += `<p class="pz-label">Espèce</p>` + chips("data-mascot-species", MASCOT_OPTIONS.species, MASCOT_LABELS.species, cur.species);
    html += `<p class="pz-label">Nom</p><input type="text" class="pz-input" id="persoMascotName" maxlength="20" value="${escapeHtml(cur.name || "")}" placeholder="Nom de la mascotte">`;
    html += `<p class="pz-label">Couleur principale</p>` + freeColorCtlHtml("mascot-primary", cur.primary || clubA, "Couleur principale", !!cur.primary);
    html += `<p class="pz-label">Couleur secondaire</p>` + freeColorCtlHtml("mascot-secondary", cur.secondary || clubB, "Couleur secondaire", !!cur.secondary);
    html += `<p class="pz-label">Numéro</p><input type="number" class="pz-input pz-input--num" id="persoMascotNumber" min="0" max="99" value="${cur.number ?? 8}">`;
    html += `<p class="pz-label">Accessoire</p>` + chips("data-mascot-acc", MASCOT_OPTIONS.accessories, MASCOT_LABELS.accessories, cur.accessory);
    html += `<p class="pz-label">Célébration</p>` + chips("data-mascot-celebration", MASCOT_OPTIONS.celebrations, MASCOT_LABELS.celebrations, cur.celebration);
    const dirty = !!persoMascotDraft && JSON.stringify(normalizeMascot(persoMascotDraft)) !== JSON.stringify(saved);
    html += `<div class="sl-court-actions"><button type="button" class="pz-btn" id="persoMascotSaveBtn"${dirty ? "" : " disabled"}>Enregistrer la mascotte</button>` +
      (saved ? `<button type="button" class="pz-btn pz-btn--ghost" id="persoMascotResetBtn">Mascotte par défaut</button>` : "") +
      `<span class="sub" id="persoMascotFeedback" role="status"></span></div>`;
  } else {
    if (saved) html += `<p class="pz-note">Votre mascotte personnalisée est conservée : elle revient dès que le club repasse Premium.</p>`;
    html += `<div class="sl-court-actions">${premiumLinkHtml("Passer Premium")}</div>`;
  }
  html += `</div></div>`;
  holder.innerHTML = html;
}
function persoMascotSet(patch) { persoMascotDraft = normalizeMascot({ ...persoMascotCurrent(), ...patch }); renderPersoMascot(); }
async function persoMascotSave(m) {
  const fb = () => document.getElementById("persoMascotFeedback");
  try {
    const res = await fetchApi("/api/club/set-mascot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mascot: m }) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || `Erreur serveur (${res.status}).`);
    teamA.mascot = data.mascot;
    persoMascotDraft = null;
    renderPersoMascot();
    if (fb()) fb().textContent = m ? "Mascotte enregistrée : elle fera le show à domicile." : "Mascotte par défaut rétablie.";
  } catch (err) {
    if (fb()) fb().textContent = err.message || "Enregistrement impossible.";
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-mascot-species], [data-mascot-acc], [data-mascot-celebration]");
  if (b && b.closest("#persoMascotHolder")) {
    const d = b.dataset;
    persoMascotSet(d.mascotSpecies ? { species: d.mascotSpecies } : d.mascotAcc ? { accessory: d.mascotAcc } : { celebration: d.mascotCelebration });
    return;
  }
  if (e.target.closest("#persoMascotSaveBtn")) { persoMascotSave(normalizeMascot(persoMascotCurrent())); return; }
  if (e.target.closest("#persoMascotResetBtn")) { persoMascotDraft = null; persoMascotSave(null); }
});
document.addEventListener("change", (e) => {
  if (!e.target.closest || !e.target.closest("#persoMascotHolder")) return;
  if (e.target.id === "persoMascotName") persoMascotSet({ name: e.target.value });
  else if (e.target.id === "persoMascotNumber") persoMascotSet({ number: Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) });
});
