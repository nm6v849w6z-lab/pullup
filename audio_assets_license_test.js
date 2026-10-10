// Ressources audio du direct : chaque fichier déclaré dans
// assets/audio/sfx/manifest.json existe, n'est pas vide, et figure dans le
// registre des licences AUDIO_LICENSES.md (source, licence, date).
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "assets/audio/sfx");
const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const reg = fs.readFileSync(path.join(__dirname, "AUDIO_LICENSES.md"), "utf8");
const fail = m => { console.error("❌ " + m); process.exit(1); };
if (!Number.isInteger(man.version) || !man.files || typeof man.files !== "object") fail("manifest.json : { version, files } attendu");
for (const [key, file] of Object.entries(man.files)) {
  if (!/^[a-z_]+$/.test(key) || !/^[a-z0-9_]+\.(mp3|ogg|m4a|wav)$/.test(file)) fail(`nom invalide : ${key} → ${file}`);
  const p = path.join(dir, file);
  if (!fs.existsSync(p) || fs.statSync(p).size < 1000) fail(`fichier manquant ou vide : ${file}`);
  if (fs.statSync(p).size > 3e6) fail(`fichier trop lourd pour le direct (> 3 Mo) : ${file}`);
  const sec = reg.split(/^## /m).find(s => s.startsWith(file));
  if (!sec) fail(`${file} absent de AUDIO_LICENSES.md`);
  for (const f of ["Source", "Licence", "Conditions", "Vérifiée le", "Attribution requise", "Modifications"]) if (!new RegExp("\\| " + f + " \\|").test(sec)) fail(`${file} : champ « ${f} » manquant dans AUDIO_LICENSES.md`);
  console.log(`✅ ${key} → ${file} (${(fs.statSync(p).size / 1e6).toFixed(2)} Mo), licence enregistrée`);
}
console.log("\n🏁 audio_assets_license_test.js : ressources audio présentes et licences enregistrées.");
