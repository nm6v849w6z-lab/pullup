// Amicaux entre championnats et entre pays (liste de la nuit du
// 2026-09-28) : un manager de France invite un manager des USA (invitation,
// acceptation), le jour est bloqué pour les autres amicaux, le match se
// joue au rattrapage du monde (résultat des deux côtés) ; depuis le
// navigateur, la recherche d'adversaire propose les clubs des autres
// championnats. Voir server/worldFriendlies.js, server/world.js,
// server/index.js (routes /api/friendly/*) et moteurbasket3.html.
const assert = require("assert");
const fs = require("fs");
const store = require("./server/store.js");
const World = require("./server/world.js");
const { startTestServer, openGame, patchDateNow } = require("./test_helpers.js");
const html = require("./test_game_html.js").readGameHtml();
const ok = m => console.log("✅ " + m);
const wait = async (cond, what) => { for (let i = 0; i < 100; i++) { if (await cond()) return; await new Promise(r => setTimeout(r, 50)); } throw new Error(`délai dépassé : ${what}`); };

(async () => {
  const t0 = Date.now();
  const clock = { now: Date.now() };
  const { server, multiSavePath, baseUrl } = await startTestServer(() => clock.now);
  const career = store.createMultiManagerCareer(["Lyon Amis", "Paris Amis"], clock.now - 2 * 24 * 3600 * 1000, "Lyon Amis");
  await store.saveMultiLeague(career.league, multiSavePath);
  await World.catchUpWorld(multiSavePath, clock.now);
  const w = await World.loadWorld(multiSavePath, clock.now);
  const boston = await World.assignClub(w, multiSavePath, { country: "us", clubName: "Boston Amis", now: clock.now });
  assert.strictEqual(boston.leagueId, "us-1");
  const lyon = career.league.teams[0];
  const api = async (path, token, init = {}) => {
    const res = await fetch(new URL(path, baseUrl), { ...init, headers: { "Content-Type": "application/json", "X-TipIn-Token": token } });
    return { status: res.status, body: await res.json() };
  };

  // 1) Jours communs avec un club des USA, invitation.
  const days = await api(`/api/friendly/days?league=us-1&club=${boston.teamIndex}`, lyon.managerLinkToken);
  assert.strictEqual(days.status, 200);
  assert.ok(days.body.days.length > 0, "jours de repos communs");
  const day = days.body.days[1] || days.body.days[0];
  const prop = await api("/api/friendly/propose", lyon.managerLinkToken, { method: "POST", body: JSON.stringify({ opponentRef: { leagueId: "us-1", idx: boston.teamIndex }, day: day.day, time: "20:00", venue: "home" }) });
  assert.strictEqual(prop.status, 200, JSON.stringify(prop.body));
  assert.strictEqual(prop.body.status, "pending");
  const fid = prop.body.friendlyId;
  assert.ok(/^w/.test(fid));
  const mine = prop.body.friendlies.find(f => f.id === fid);
  assert.ok(mine && mine.remote && mine.remote.leagueId === "us-1" && mine.homeIdx === 0);
  const g = prop.body.guestTeams.find(x => x.localIdx === mine.awayIdx);
  assert.strictEqual(g.light.name, "Boston Amis");
  ok(`Lyon (France) invite Boston (USA) le ${day.label} à 20h00 : invitation en attente, adversaire en club invité`);

  // 2) Boston reçoit l'invitation (liste + fil), accepte.
  const list = await api("/api/friendly/list", boston.token);
  const inv = list.body.friendlies.find(f => f.id === fid);
  assert.ok(inv && inv.status === "pending" && inv.awayIdx === boston.teamIndex && inv.proposerIdx !== boston.teamIndex);
  assert.strictEqual(list.body.guestTeams.find(x => x.localIdx === inv.homeIdx).light.name, "Lyon Amis");
  const wb = await World.loadWorld(multiSavePath, clock.now);
  const usLg = await World.loadLeague(wb, "us-1", multiSavePath);
  assert.ok(usLg.teams[boston.teamIndex].feed.entries.some(e => /Invitation à un match amical de Lyon Amis/.test(e.title)), "fil d'actualité de Boston");
  const acc = await api("/api/friendly/respond", boston.token, { method: "POST", body: JSON.stringify({ id: fid, accept: true }) });
  assert.strictEqual(acc.status, 200, JSON.stringify(acc.body).slice(0, 300));
  assert.strictEqual(acc.body.status, "accepted");
  ok("Boston voit l'invitation (liste + fil d'actualité) et l'accepte");

  // 3) Le jour est pris : plus d'amical interne ce jour-là pour Lyon.
  const daysIntra = await api("/api/friendly/days?opponent=1", lyon.managerLinkToken);
  assert.ok(!daysIntra.body.days.some(d => d.day === day.day), "jour déjà pris par l'amical contre Boston");
  const clash = await api("/api/friendly/propose", lyon.managerLinkToken, { method: "POST", body: JSON.stringify({ opponent: 2, day: day.day, time: "15:00", venue: "home" }) });
  assert.strictEqual(clash.status, 400);
  ok("un amical par jour : le jour de l'amical contre Boston est refusé pour un amical interne");

  // 4) Le match : joué au rattrapage du monde, résultat des deux côtés.
  const f0 = (await store.loadWorldAuxRaw("friendlies", multiSavePath)).list.find(x => "w" + x.id === fid);
  clock.now = f0.at + 60 * 1000;
  const evs = await World.catchUpWorld(multiSavePath, clock.now);
  assert.ok(evs.some(e => e.type === "world-friendly" && e.home === "Lyon Amis" && e.away === "Boston Amis"));
  const played = (await store.loadWorldAuxRaw("friendlies", multiSavePath)).list.find(x => "w" + x.id === fid);
  assert.strictEqual(played.status, "played");
  assert.ok(played.result && (played.result.forfeit || (played.result.boxScoreHome.length && played.result.boxScoreAway.length)));
  // Huis clos : score caché aux managers pendant la durée d'un match officiel.
  const during = (await api("/api/save", lyon.managerLinkToken)).body.league.friendlies.find(f => f.id === fid);
  assert.ok(during && during.status === "accepted" && during.result === null, "score caché pendant 1h30");
  clock.now = f0.at + 91 * 60 * 1000;
  await World.catchUpWorld(multiSavePath, clock.now);
  const saveL = (await api("/api/save", lyon.managerLinkToken)).body;
  const pL = saveL.league.friendlies.find(f => f.id === fid);
  assert.ok(pL && pL.status === "played" && pL.result.scoreHome === played.result.scoreHome);
  const wc = await World.loadWorld(multiSavePath, clock.now);
  const us2 = await World.loadLeague(wc, "us-1", multiSavePath);
  assert.ok(us2.teams[boston.teamIndex].feed.entries.some(e => /^Amical : /.test(e.title)), "résultat au fil de Boston");
  ok(`match joué : Lyon ${played.result.scoreHome}-${played.result.scoreAway} Boston, résultat dans les deux championnats`);

  // 5) Navigateur : la recherche d'adversaire propose un club d'un autre pays.
  clock.now += 3600 * 1000;
  const dom = await openGame(html, `${baseUrl}?m=${lyon.managerLinkToken}`, win => patchDateNow(win, () => clock.now));
  const win = dom.window, doc = win.document;
  if (win.eval("currentVisiblePageId()") === "catchupSection") doc.getElementById("catchupContinueBtn").click();
  win.eval("TAB_HANDLERS.amicaux()");
  const past = doc.getElementById("amicauxContent").textContent;
  assert.ok(/Boston Amis/.test(past), "amical contre Boston dans « Derniers amicaux »");
  const target = usLg.teams.find((t, i) => !t.isHuman && i !== boston.teamIndex);
  const input = doc.getElementById("frOpponentSearch");
  input.value = target.name.slice(0, 5);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  await wait(() => doc.querySelector(`[data-fr-opp-world="us-1"]`), "clubs des USA dans la recherche");
  const opt = [...doc.querySelectorAll("[data-fr-opp-world]")].find(b => b.dataset.frOppName === target.name);
  assert.ok(opt, `${target.name} proposé`);
  opt.click();
  await wait(() => { const sel = doc.getElementById("frDaySelect"); return sel && !sel.disabled && sel.options.length > 0; }, "jours communs chargés");
  doc.getElementById("frProposeBtn").click();
  await wait(async () => { const st = await store.loadWorldAuxRaw("friendlies", multiSavePath); return st.list.some(x => x.away.name === target.name || x.home.name === target.name); }, "amical programmé contre le club américain");
  const st = await store.loadWorldAuxRaw("friendlies", multiSavePath);
  assert.strictEqual(st.list.find(x => x.home.name === target.name || x.away.name === target.name).status, "accepted", "club CPU : accepté d'office");
  await wait(() => /Amical programmé/.test(doc.getElementById("amicauxContent").textContent), "message de confirmation");
  ok(`navigateur : ${target.name} (USA) trouvé par la recherche d'adversaire, amical programmé d'office (club CPU)`);
  dom.window.close();

  server.close();
  console.log(`\n🏁 world_friendly_test.js : tout est vert (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(0);
})().catch(e => { console.error("❌", e); process.exit(1); });
