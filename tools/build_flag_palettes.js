// Palettes des drapeaux (2026-10-09) : couleurs dominantes de chaque
// drapeau de assets/flags/*.png (les images du jeu), calculées dans un
// navigateur (canvas) → assets/flags/palette.json { "de": ["#…", …] }.
// Générique : aucun pays codé à la main. À relancer si un drapeau change :
//   node tools/build_flag_palettes.js
const fs = require("fs");
const path = require("path");
const chromium = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright").chromium;
const DIR = path.join(__dirname, "..", "assets", "flags");
(async () => {
  const files = fs.readdirSync(DIR).filter(f => /^[a-z]{2,3}\.png$/.test(f));
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage();
  const out = {};
  for (const f of files) {
    const data = "data:image/png;base64," + fs.readFileSync(path.join(DIR, f)).toString("base64");
    out[f.slice(0, -4)] = await p.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height;
      // Regroupement par seaux de 24 niveaux, puis fusion des seaux proches.
      const buckets = new Map();
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 200) continue;
        const k = (px[i] / 24 | 0) + "," + (px[i + 1] / 24 | 0) + "," + (px[i + 2] / 24 | 0);
        const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
        e.n++; e.r += px[i]; e.g += px[i + 1]; e.b += px[i + 2]; buckets.set(k, e);
      }
      const list = [...buckets.values()].map(e => ({ n: e.n, c: [e.r / e.n, e.g / e.n, e.b / e.n] })).sort((a, b) => b.n - a.n);
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const merged = [];
      for (const e of list) {
        const m = merged.find(x => dist(x.c, e.c) < 70);
        if (m) { const t = m.n + e.n; m.c = m.c.map((v, i) => (v * m.n + e.c[i] * e.n) / t); m.n = t; } else merged.push({ n: e.n, c: e.c.slice() });
      }
      merged.sort((a, b) => b.n - a.n);
      const hex = c => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
      // Couleurs qui couvrent au moins 5 % du drapeau (3 au plus) ; drapeau
      // presque uni (Chine, Maroc…) : on garde aussi l'emblème (≥ 0,8 %).
      let sel = merged.filter(x => x.n / n >= 0.05).slice(0, 3);
      if (sel.length < 2) sel = merged.filter(x => x.n / n >= 0.008).slice(0, 2);
      return sel.map(x => hex(x.c));
    }, data);
  }
  await b.close();
  const sorted = Object.fromEntries(Object.keys(out).sort().map(k => [k, out[k]]));
  fs.writeFileSync(path.join(DIR, "palette.json"), JSON.stringify(sorted) + "\n");
  console.log(Object.keys(sorted).length + " palettes → assets/flags/palette.json");
  for (const k of ["de", "fr", "it", "es", "br", "jp", "us", "gr", "lt"]) if (sorted[k]) console.log(k, sorted[k].join(" "));
})().catch(e => { console.error(e); process.exit(1); });
