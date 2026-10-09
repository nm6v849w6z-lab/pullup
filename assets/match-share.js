// Partage d'un match / d'une rediffusion (P3, 2026-10-09) : boutons
// « Partager le match » (direct en cours) et « Partager la rediffusion »
// (match terminé) dans la feuille de match, la fenêtre spectateur et l'écran
// du direct de son club. Crée (ou retrouve) le lien public `/m/<code>`
// (POST /api/match/share-link, voir server/matchLinks.js), le copie, et
// ouvre la feuille de partage du téléphone. Ligues privées : pas de bouton
// (matchs réservés aux membres). Script classique : utilise fetchApi,
// copyTextToClipboard et myTeamIndex de moteurbasket3.html.
(function () {
  "use strict";
  const LABEL = { live: "🔗 Partager le match", replay: "🔗 Partager la rediffusion" };

  async function createLink(body) {
    const res = await fetchApi("/api/match/share-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.url) {
      const err = new Error(data.error || "Impossible de créer le lien pour l'instant.");
      err.code = data.code;
      throw err;
    }
    return data.url;
  }

  // Bouton + retour (texte, lien sélectionnable) : jamais de fenêtre
  // flottante (règle UI mobile), tout reste dans le flux.
  function makeButton(kind, body, title) {
    const wrap = document.createElement("span");
    wrap.className = "hm-share";
    wrap.innerHTML = `<button type="button" class="secondary hm-share-btn" data-hm-share="${kind}">${LABEL[kind]}</button><span class="hm-share-fb" role="status"></span>`;
    const btn = wrap.querySelector("button"), fb = wrap.querySelector(".hm-share-fb");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      fb.textContent = "Création du lien…";
      try {
        const url = await createLink(body);
        const copied = await copyTextToClipboard(url);
        fb.innerHTML = `<span>${copied ? "Lien copié" : "Copiez le lien"}</span> <a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, "")}</a>`;
        const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
        if (coarse && typeof navigator.share === "function") {
          try { await navigator.share({ title: title || "Hoop Manager", url }); } catch (e) { /* partage annulé */ }
        }
      } catch (e) {
        fb.innerHTML = e.code === "premium-required"
          ? `${e.message} <a href="#" data-hm-share-premium>Premium</a>`
          : String(e.message || "Impossible de créer le lien.").replace(/</g, "&lt;");
        const p = fb.querySelector("[data-hm-share-premium]");
        if (p) p.addEventListener("click", ev => { ev.preventDefault(); try { if (typeof TAB_HANDLERS !== "undefined" && TAB_HANDLERS.premium) TAB_HANDLERS.premium(); } catch (x) { /* rien */ } });
      } finally { btn.disabled = false; }
    });
    return wrap;
  }

  const officialBody = (live, myIdx) => {
    const home = live.isHome ? myIdx : live.opponentIdx, away = live.isHome ? live.opponentIdx : myIdx;
    return { kind: "official", round: live.round, competition: live.competition || "championship", home, away };
  };
  const kindOf = live => (live && (live.replay || live.ended) ? "replay" : "live");

  window.HM_SHARE = {
    // Feuille de match : à côté de « Revoir le direct » (ctx.replay).
    replayButton(fbEl, replay) {
      if (!fbEl || !replay || replay.lp || fbEl.parentNode.querySelector(".hm-share")) return;
      const body = replay.national ? { kind: "national", id: replay.id } : { kind: "official", round: replay.round, competition: replay.competition, home: replay.home, away: replay.away, key: replay.key };
      fbEl.parentNode.insertBefore(makeButton("replay", body), fbEl);
    },
    // Fenêtre spectateur (direct ou rediffusion d'un autre club, sélections).
    spectate(state) {
      const holder = document.getElementById("spectateSeekHolder");
      if (!holder || !state || !state.live || state.live.forfeit || holder.querySelector(".hm-share")) return;
      const url = String(state.url || "");
      if (/private-league/.test(url) || state.live.privateLeague) return;
      let body;
      if (/national\/live/.test(url) || state.live.intl) {
        const m = /[?&]id=([^&]+)/.exec(url);
        if (!m) return;
        body = { kind: "national", id: decodeURIComponent(m[1]) };
      } else body = officialBody(state.live, state.teamIdx);
      holder.appendChild(makeButton(kindOf(state.live), body, [state.teamName, state.opponentName].filter(Boolean).join(" – ")));
    },
    // Écran du direct de son club.
    own(live) {
      const old = document.getElementById("hmOwnShare");
      if (old) old.remove();
      const root = document.getElementById("hmLiveRoot");
      if (!root || !live || live.forfeit || live.privateLeague || live.intl || typeof myTeamIndex !== "number" || myTeamIndex < 0) return;
      const el = makeButton(kindOf(live), officialBody(live, myTeamIndex));
      el.id = "hmOwnShare";
      root.insertAdjacentElement("beforebegin", el);
    },
  };

  const css = document.createElement("style");
  css.textContent = ".hm-share{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:6px 0}" +
    "#hmOwnShare{display:flex;margin:10px 0 0}" +
    ".hm-share-fb{font-size:13px;color:var(--ink-dim,#9aa8bd);overflow-wrap:anywhere;min-width:0}" +
    ".hm-share-fb a{color:var(--amber,#f0a23c)}";
  document.head.appendChild(css);
})();
