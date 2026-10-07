// Avatars joueurs : un seul format dans tout le jeu (règle globale du
// 2026-10-07, bloc « AVATAR JOUEUR : FORMAT UNIQUE » de moteurbasket3.html).
// Référence : fiche Joueur et Effectif — carré aux coins arrondis, rayon =
// 18 % de la largeur, jamais de cercle.
//  1. Statique : aucune règle CSS du jeu ne met en cercle un cadre d'avatar
//     joueur ou .player-avatar (border-radius 50 % / 999px).
//  2. Navigateur réel (Chromium, ordinateur et téléphone 390 px) : toutes les
//     pages et leurs sous-onglets ; pour CHAQUE avatar joueur affiché, la
//     forme visible (intersection des conteneurs qui le recadrent) doit être
//     un carré arrondi à 16-20 % de sa largeur, sans contour (bordure,
//     anneau ou ombre en anneau) ni sur l'avatar ni sur son cadre.
const fs = require("fs");
const WT = __dirname;
const { startTestServer } = require("./test_helpers.js");
const fail = m => { throw new Error("❌ " + m); };

// --- 1. statique ---
const FRAMES = ["tm-av", "tp-avatar", "coh-av", "coh2-spot", "vs-av", "md-av", "mk-cmp-av", "mk-task-av", "mk-avatar", "hc-av", "compare-avatar", "pdp2-avatar", "sp2-token-av", "hs-pav", "player-avatar"];
const files = ["moteurbasket3.html", "assets/vestiaire-ui.js", "assets/medical-ui.js", "assets/live/live.css", "assets/hoop-shows/showPlayer.css", "assets/national.js", "assets/national-coach.js"];
for (const f of files) {
  const css = fs.readFileSync(f, "utf8");
  for (const m of css.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
    if (!/border-radius:\s*(50%|9{2,}px)/.test(m[2])) continue;
    const sel = m[1].trim();
    const hit = FRAMES.find(c => new RegExp("\\." + c + "(?![\\w-])(?![^,]*\\s)").test(sel));
    if (hit) fail(`${f} : « ${sel.slice(-80)} » met un avatar joueur en cercle`);
  }
}
const html = fs.readFileSync("moteurbasket3.html", "utf8");
if (!/AVATAR JOUEUR : FORMAT UNIQUE/.test(html) || !/--player-av-radius:18% \/ 16\.6%/.test(html)) fail("règle globale d'avatar joueur absente de moteurbasket3.html");
if (/class: "c2d-frame"/.test(fs.readFileSync("assets/live/court2d.js", "utf8"))) fail("terrain 2D : cadre coloré autour des avatars");
if (/box-shadow:0 0 0 2px ' \+ ring/.test(fs.readFileSync("assets/vestiaire-ui.js", "utf8"))) fail("Vestiaire : anneau coloré autour des avatars");
console.log("✅ Statique : aucun cadre d'avatar joueur en cercle ni contour coloré, règle commune présente.");

let chromium;
try { chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium; } catch (e) { /* rien */ }
if (!chromium || !fs.existsSync("/opt/pw-browsers/chromium")) { console.log("ℹ️  Chromium absent : vérification navigateur sautée"); process.exit(0); }
(async()=>{const { server, baseUrl, token } = await startTestServer();
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const report = {};
for (const [w,h] of [[1440,900],[390,844]]) {
const p=await (await b.newContext({viewport:{width:w,height:h}, isMobile:w<500, hasTouch:w<500})).newPage();
p.on("pageerror", e => {});
await p.goto(baseUrl+"?m="+token);await p.waitForFunction(()=>window.__gameReady,null,{timeout:30000});
await p.evaluate(()=>{ teamA.trainer={level:4,weeksEmployed:0,baseSalary:1000}; teamA.trainingSlots=teamA.players.slice(0,4).map(x=>({playerId:x.id,program:Object.keys(TRAINING_PROGRAMS)[0],intensity:"normale"})); try{teamA.trainWeek(1,Date.now());}catch(e){} });
const steps = [];
const keys = await p.evaluate(()=>Object.keys(TAB_HANDLERS));
for (const k of keys) steps.push(["tab:"+k, `TAB_HANDLERS[${JSON.stringify(k)}]()`]);
steps.push(["tab:entrainement-bilan", `TAB_HANDLERS.entrainement(); document.querySelector('[data-tm-view="bilan"]').click()`]);
steps.push(["player", `showPlayerDetail(myTeamIndex, teamA.players[0].id)`]);
steps.push(["team", `showTeamDetail(1)`]);
for (const [name, js] of steps) {
  try { await p.evaluate(js); } catch (e) { continue; }
  await p.waitForTimeout(700);
  // sous-onglets / vues internes : on clique chaque bouton de menu .vs-tabs visible
  const tabCount = await p.evaluate(()=>[...document.querySelectorAll(".vs-tabs > button, [data-vs-tab], [data-tm-view], .tq-tab, [data-subview]")].filter(x=>x.offsetParent).length);
  const runs = [null]; for (let i=0;i<Math.min(tabCount,10);i++) runs.push(i);
  for (const ti of runs) {
    if (ti !== null) { try { await p.evaluate(i=>{ const bs=[...document.querySelectorAll(".vs-tabs > button, [data-vs-tab], [data-tm-view], .tq-tab, [data-subview]")].filter(x=>x.offsetParent); bs[i] && bs[i].click(); }, ti); await p.waitForTimeout(400);} catch(e){} }
    const res = await p.evaluate(()=>{
      const out = [];
      const sig = el => { const c=[]; let e=el; for (let i=0;i<3&&e&&e!==document.body;i++){ c.unshift(e.tagName.toLowerCase()+(e.id?"#"+e.id:"")+(e.classList.length?"."+[...e.classList].slice(0,3).join("."):"")); e=e.parentElement;} return c.join(" > "); };
      document.querySelectorAll('svg[viewBox="0 0 120 130"]').forEach(svg => {
        if (/staff/i.test(svg.getAttribute("aria-label")||"")) return;
        const r = svg.getBoundingClientRect(); if (r.width < 4 || !svg.closest("body") ) return;
        let e = svg.parentElement, shape = "sans recadrage", clipper = null, best = -1;
        for (let i=0;i<5 && e && e!==document.body;i++, e=e.parentElement) {
          const cs = getComputedStyle(e); const rr = e.getBoundingClientRect();
          if (rr.width > r.width * 1.8 || rr.height > r.height * 1.8) break;
          const parts = cs.borderTopLeftRadius.split(" "), px = (v, base) => /%$/.test(v) ? parseFloat(v) / 100 * base : parseFloat(v) || 0;
          const radX = px(parts[0], rr.width), radY = px(parts[1] || parts[0], rr.height);
          const rad = Math.min(radX, radY, Math.min(rr.width, rr.height)/2);
          const clips = cs.overflow !== "visible" || cs.clipPath !== "none";
          if (!clips) continue;
          const ratio = rad / Math.min(rr.width, rr.height);
          if (ratio > best) { best = ratio; clipper = e; shape = ratio >= 0.35 ? "CERCLE" : `carré r=${(rad/rr.width*100).toFixed(0)}% ${Math.round(rr.width)}x${Math.round(rr.height)}`; }
        }
        // Contour autour de l'avatar : bordure, anneau (box-shadow) ou outline,
        // sur l'avatar ou un conteneur de sa taille.
        let ring = null; e = svg.parentElement;
        for (let i=0;i<5 && e && e!==document.body;i++, e=e.parentElement) {
          const cs = getComputedStyle(e); const rr = e.getBoundingClientRect();
          if (rr.width > r.width * 1.8 || rr.height > r.height * 1.8) break;
          const bw = parseFloat(cs.borderTopWidth)||0, bc = cs.borderTopColor;
          const hasB = bw > 0 && cs.borderTopStyle !== "none" && !/rgba\(.*, 0\)|transparent/.test(bc);
          const hasS = cs.boxShadow && cs.boxShadow !== "none";
          const hasO = (parseFloat(cs.outlineWidth)||0) > 0 && cs.outlineStyle !== "none";
          if (hasB || hasS || hasO) { ring = (hasB ? "bordure " + bw + "px " + bc : hasS ? "ombre/anneau " + cs.boxShadow.slice(0, 40) : "outline") + " sur " + sig(e); break; }
        }
        // terrain 2D : cadre SVG coloré autour de l'avatar
        const g = svg.closest("g.c2d-p"); if (g && g.querySelector(".c2d-frame")) ring = "cadre SVG c2d-frame";
        // Exception : le petit contour jaune des MVP (match, journée, saison).
        const mvp = svg.closest(".match-mvp-callout, .lg-mvp-id, .hn-award--mvp");
        if (mvp) { const bs = getComputedStyle(svg.closest(".player-avatar")).boxShadow; out.push({ shape: /^rgb\(240, 162, 60\) 0px 0px 0px 2px$/.test(bs) ? "MVP contour jaune ok" : "MVP SANS contour jaune (" + bs + ")", sig: "", vis: r.width > 0 }); ring = null; }
        const vis = !!svg.closest("[class]") && r.width>0 && svg.getClientRects().length>0;
        out.push({ shape, sig: clipper ? sig(clipper) : sig(svg.parentElement), vis });
        if (ring) out.push({ shape: "CONTOUR " + ring, sig: "", vis });
      });
      return out;
    });
    for (const o of res) { if (!o.vis) continue; const key = o.shape + " | " + o.sig; report[key] = report[key] || new Set(); report[key].add(name + "@" + w); }
  }
}
}
const lines = Object.entries(report).sort().map(([k,v])=>k+"   ["+[...v].slice(0,6).join(", ")+(v.size>6?" …":"")+"]");
const bad = lines.filter(l => !/^carré r=(1[6-9]|20)% |^MVP contour jaune ok/.test(l));
console.log(lines.join("\n"));
if (lines.length < 10) fail("trop peu d'avatars trouvés (" + lines.length + " formes) : l'audit ne voit plus les pages");
if (bad.length) fail("avatars joueurs hors format :\n" + bad.join("\n"));
console.log(`\n✅ player_avatar_shape_test.js : ${lines.length} emplacements d'avatar joueur, tous en carré arrondi à 18 %, sans contour (ordinateur et téléphone).`);
await b.close();server.close();process.exit(0);})().catch(e=>{console.error(e);process.exit(1);});
