// Interface (2026-10-07) : vitrine des sélections (message du staff,
// personnalisation), fonction nationale sur le profil du manager, badge
// « International » de la fiche joueur, badge « Amis » (profil, réglages).
process.env.BASKET_ADMIN_TOKEN = process.env.BASKET_ADMIN_TOKEN || "admintest-showcase";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startTestServer, openGame, flush } = require("./test_helpers.js");
const NationalTeams = require("./server/nationalTeams.js");
const html = require("./test_game_html.js").readGameHtml();
const check = (c, msg) => { if (!c) throw new Error("❌ " + msg); console.log("✅ " + msg); };
const wait = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return; } catch (e) { /* encore */ } await new Promise(r => setTimeout(r, 60)); } throw new Error("❌ attente : " + label); };

(async () => {
  const multi = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "basket-showcase-")), "multi-league.json");
  const { server, baseUrl } = await startTestServer(Date.now, undefined, multi);
  let dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const club = dom.window.eval("teamA.name");
  const res = await fetch(baseUrl.replace(/\/?(\?.*)?$/, "/") + "api/admin/national", { method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Token": process.env.BASKET_ADMIN_TOKEN }, body: JSON.stringify({ action: "appoint", teamId: "fr-A", club }) }).then(r => r.json());
  check(res.ok, "nomination de test : sélectionneur de France A");
  // Un joueur français du club dans la dernière liste FIGÉE des U21.
  const p0 = dom.window.eval("(() => { const p = teamA.players[0]; return { id: p.id, name: p.name }; })()");
  dom.window.close();
  {
    const st = await NationalTeams.loadStore(multi);
    st.convocations = st.convocations || {};
    st.convocations["fr-U21"] = { s1w1: { gid: "s1w1", startAt: Date.now() - 86400000, frozenAt: Date.now() - 4 * 86400000, players: [{ p: p0.id, n: p0.name }] } };
    st.caps = { [`${p0.id}|${p0.name}`]: { n: 3 } };
    await NationalTeams.saveStore(st, multi);
  }
  dom = await openGame(html, baseUrl);
  await dom.window.__gameReady; await flush(dom);
  const win = dom.window, doc = win.document;
  win.eval(`teamA.players[0].nationality = "fr"`);

  // ---- Page de la sélection : message du staff ----
  await win.HM_NATIONAL.openTeam("fr-A");
  const content = () => doc.getElementById("nationalContent");
  check(content().querySelector(".nt-hero[data-nt-banner=night]") && content().querySelector(".nt-hero .nat-flag"), "page de la sélection : bannière et drapeau par défaut");
  check(content().querySelector("[data-nt-visuals]"), "sélectionneur : bouton « Personnaliser »");
  check(/Aucun message pour l'instant/.test(content().querySelector("#ntMsg").textContent) && content().querySelector("[data-nt-msg-edit]"), "sans message : invitation à écrire (staff autorisé)");
  content().querySelector("[data-nt-msg-edit]").click();
  const ta = doc.getElementById("ntMsgInput");
  check(ta && ta.getAttribute("maxlength") === "500", "éditeur : champ limité à 500 caractères");
  ta.value = "Bienvenue sur la page de l'équipe de France !\nObjectif : la phase finale.";
  ta.dispatchEvent(new win.Event("input", { bubbles: true }));
  check(/Objectif : la phase finale/.test(doc.getElementById("ntMsgPreview").textContent) && /\d+ \/ 500/.test(doc.getElementById("ntMsgCount").textContent), "aperçu et compteur en direct avant publication");
  content().querySelector("[data-nt-msg-save]").click();
  await win.__lastNational; await flush(dom);
  const msg = content().querySelector("#ntMsg");
  check(msg && /Bienvenue sur la page/.test(msg.querySelector(".nt-msg-text").textContent) && /modifié le/.test(msg.textContent) && /sélectionneur/.test(msg.textContent), "message publié : texte, auteur, rôle, date de modification");
  check(msg.querySelector("[data-nt-msg-edit]") && /Modifier le message/.test(msg.textContent), "bouton « Modifier le message »");
  // Persistance : rechargement de la page de la sélection.
  await win.HM_NATIONAL.openTeam("fr-A");
  check(/Bienvenue sur la page/.test(content().querySelector("#ntMsg").textContent), "message toujours là après rechargement");
  // Visiteur (sans droits) : message visible, aucun bouton.
  const st = win.HM_NATIONAL.state;
  const saved = JSON.parse(JSON.stringify(st.team.extras));
  st.team.extras.canEditMessage = false; st.team.extras.canEditVisuals = false;
  win.HM_NATIONAL.openTeam && null;
  content().innerHTML = win.HM_NATIONAL.teamHtml();
  check(/Bienvenue/.test(content().querySelector("#ntMsg").textContent) && !content().querySelector("[data-nt-msg-edit]") && !content().querySelector("[data-nt-visuals]"), "visiteur : message visible, aucun bouton de modification ni de personnalisation");
  st.team.extras.message = null;
  content().innerHTML = win.HM_NATIONAL.teamHtml();
  check(!content().querySelector("#ntMsg"), "visiteur, sans message : aucune section vide");
  st.team.extras = saved;
  content().innerHTML = win.HM_NATIONAL.teamHtml();

  // ---- Personnalisation ----
  content().querySelector("[data-nt-visuals]").click();
  const ov = () => doc.getElementById("ntVisualsOverlay");
  check(ov() && ov().classList.contains("upgrade-confirm-overlay") && ov().querySelector(".upgrade-confirm-box"), "fenêtre de personnalisation (bottom sheet sur mobile)");
  check(["Logo", "Bannière", "Maillot", "Terrain"].every(k => ov().textContent.includes(k)), "4 éléments : logo, bannière, maillot, terrain");
  const locked = ov().querySelectorAll(".ntv-opt[disabled]");
  check(locked.length > 0 && [...locked].every(b => b.querySelector(".ntv-need") && b.querySelector(".ntv-lock")), "éléments verrouillés : cadenas et condition de déblocage");
  ov().querySelector('[data-ntv-kind="logo"][data-ntv-id="shield"]').click();
  ov().querySelector('[data-ntv-kind="banner"][data-ntv-id="flag"]').click();
  ov().querySelector('[data-ntv-kind="jersey"][data-ntv-id="rouge"]').click();
  check(ov().querySelector('[data-ntv-id="shield"]').classList.contains("on"), "sélection visible avant enregistrement");
  ov().querySelector("[data-ntv-save]").click();
  await win.__lastNational; await flush(dom);
  check(!ov() && content().querySelector('.nt-hero[data-nt-banner="flag"]') && content().querySelector('[data-nt-logo="shield"]'), "enregistré : bannière drapeau et logo écusson sur la page");
  await win.HM_NATIONAL.openTeam("fr-A");
  check(content().querySelector('[data-nt-logo="shield"]') && content().querySelector('.nt-hero[data-nt-banner="flag"]'), "personnalisation conservée après rechargement");

  // ---- Mode Sélection : vitrine sur le tableau de bord ----
  await win.HM_NATIONAL_COACH.enterMode("fr-A");
  await wait(() => doc.getElementById("ncShowcase"), "vitrine du tableau de bord");
  const sc = () => doc.getElementById("ncShowcase");
  check(/Vitrine publique/.test(sc().textContent) && sc().querySelector("[data-nt-visuals]") && sc().querySelector("[data-nc-public]") && sc().querySelector('[data-nt-logo="shield"]'), "mode Sélection : bloc « Vitrine publique » (aperçu, Personnaliser, page publique)");
  check(/Bienvenue sur la page/.test(sc().textContent) && sc().querySelector("[data-nt-msg-edit]"), "mode Sélection : message actuel et « Modifier le message »");
  sc().querySelector("[data-nt-msg-edit]").click();
  const ta2 = doc.getElementById("ntMsgInput");
  ta2.value = "Message depuis le mode Sélection.";
  ta2.dispatchEvent(new win.Event("input", { bubbles: true }));
  check(/Message depuis le mode/.test(doc.getElementById("ntMsgPreview").textContent), "mode Sélection : aperçu en direct");
  sc().querySelector("[data-nt-msg-save]").click();
  await win.__lastNational; await flush(dom);
  check(sc() && /Message depuis le mode Sélection/.test(sc().querySelector(".nt-msg-text").textContent), "mode Sélection : message publié");
  sc().querySelector("[data-nt-visuals]").click();
  check(doc.getElementById("ntVisualsOverlay"), "mode Sélection : fenêtre de personnalisation");
  doc.querySelector('#ntVisualsOverlay [data-ntv-kind="logo"][data-ntv-id="flag"]').click();
  doc.querySelector("#ntVisualsOverlay [data-ntv-save]").click();
  await win.__lastNational; await flush(dom);
  check(!doc.getElementById("ntVisualsOverlay") && !sc().querySelector('[data-nt-logo="shield"]'), "mode Sélection : personnalisation enregistrée (retour au drapeau)");
  sc().querySelector("[data-nc-public]").click();
  await win.__lastNational; await flush(dom);
  check(!doc.body.classList.contains("nc-mode") && /Message depuis le mode Sélection/.test(content().querySelector("#ntMsg").textContent), "« Voir la page publique » : le message y est visible");

  // ---- Profil du manager : fonction nationale ----
  win.eval("showManagerProfile(myTeamIndex)");
  await win.__lastMpNatRoles; await flush(dom);
  const roles = doc.getElementById("mpNatRoles");
  check(roles && !roles.hidden && /Sélectionneur\s*—\s*France/.test(roles.textContent.replace(/U21/g, "")) && roles.querySelector(".nat-flag"), "profil : « Sélectionneur — France » avec le drapeau");

  // ---- Badge « Amis » ----
  win.eval("teamA.friendsReferrals = 0; showManagerProfile(myTeamIndex)");
  let fr = doc.getElementById("mpFriends");
  check(fr && fr.querySelector('[data-friends-count="0"]') && fr.querySelectorAll(".mp-ftier.is-locked").length === 3 && /Encore 1 ami pour le palier 1/.test(fr.textContent) && fr.querySelector("[data-friends-invite]"), "profil (0 ami) : 3 paliers verrouillés, prochain palier, bouton « Inviter un ami »");
  check(!doc.querySelector(".mp-hero .mp-avatar--f1,.mp-hero .mp-avatar--f2,.mp-hero .mp-avatar--f3"), "sans palier : aucun cadre");
  win.eval("teamA.friendsReferrals = 2; showManagerProfile(myTeamIndex)");
  fr = doc.getElementById("mpFriends");
  check(fr.querySelectorAll(".mp-ftier:not(.is-locked)").length === 2 && doc.querySelector(".mp-hero .mp-avatar--f2") && /Rassembleur/.test(doc.querySelector("[data-friends-title]").textContent), "2 amis : paliers 1-2 obtenus, cadre argent, titre « Rassembleur »");
  win.eval("teamA.friendsReferrals = 3; showManagerProfile(myTeamIndex)");
  check(doc.querySelector(".mp-hero .mp-avatar--f3") && /Ambassadeur/.test(doc.querySelector("[data-friends-title]").textContent) && doc.querySelector("[data-friends-pill]") && /Badge complet/.test(doc.getElementById("mpFriends").textContent), "3 amis : cadre or, titre « Ambassadeur », pastille « Amis », badge complet");
  // Réglages > Compte : section parrainage (sans compte : message d'erreur).
  win.eval("teamA.friendsReferrals = 0; showManagerProfile(myTeamIndex)");
  doc.querySelector("[data-friends-invite]").click();
  await wait(() => doc.getElementById("hmReferral") && !/Chargement/.test(doc.getElementById("settingsAccountBlock").textContent), "section Inviter un ami");
  check(doc.getElementById("settingsModalOverlay") && doc.getElementById("hmReferral"), "« Inviter un ami » : ouvre Réglages > Compte, section parrainage");
  win.eval(`hmReferralState = { ok: true, code: "ABCDEFGH", link: "https://exemple.test/bienvenue?ref=ABCDEFGH", validated: 1, tier: 1, maxTier: 3, next: 2, remaining: 1, pending: 1, maxPending: 10,
    referrals: [{ club: "Bordeaux BC", status: "validated", seasonsDone: 1, active: true }, { club: "Evry BC", status: "pending", seasonsDone: 0, active: true }, { club: "Caen BC", status: "blocked", reason: "same-connection", active: true }] }; renderHmAccountBlock();`);
  const blk = doc.getElementById("settingsAccountBlock");
  check(doc.getElementById("hmRefLink").value.endsWith("?ref=ABCDEFGH") && doc.getElementById("hmRefCopy"), "lien personnel et bouton « Copier le lien »");
  check(/1 ami validé · encore 1 pour le palier 2 · 1 en cours/.test(doc.getElementById("hmRefProgress").textContent), "progression : amis validés, restants, en cours");
  check(/Obtenu/.test(doc.getElementById("hmRefRewards").textContent) && (doc.getElementById("hmRefRewards").textContent.match(/À débloquer/g) || []).length === 2, "récompenses obtenues et à débloquer");
  check(/Validé/.test(blk.textContent) && /En cours : saison complète à terminer/.test(blk.textContent) && /Refusé : même connexion que la tienne/.test(blk.textContent), "invitations : validée, en cours, refusée (raison)");
  win.eval("closeSettingsModal()");

  // ---- Fiche joueur : International ----
  win.eval(`showPlayerDetail(myTeamIndex, ${JSON.stringify(p0.id)})`);
  await win.__lastPdpIntl; await flush(dom);
  const intl = doc.getElementById("pdpIntl");
  check(intl && !intl.hidden && /International/.test(intl.textContent) && /France U21/.test(intl.textContent) && intl.querySelector('[data-intl-cat="U21"] .nat-flag') && /3 sélections/.test(intl.textContent), "fiche joueur : « International · France U21 », drapeau, 3 sélections");
  win.eval(`showPlayerDetail(myTeamIndex, teamA.players[1].id)`);
  await win.__lastPdpIntl; await flush(dom);
  check(doc.getElementById("pdpIntl").hidden, "joueur sans sélection : rien d'affiché");

  dom.window.close(); server.close();
  console.log("\n🏁 national_showcase_ui_test.js : vitrine, profil, International et Amis conformes.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
