#!/usr/bin/env node
"use strict";
// Copie TOUTES les clés d'Upstash vers la base Redis de Render (bascule du
// 2026-10-02). Les valeurs sont copiées telles quelles (déjà compressées
// « gz1: » ou en JSON clair), puis relues sur Render pour vérification.
// Upstash n'est jamais modifié : il reste une copie de secours.
//
// Utilisation (depuis le Shell du service Render, ou en local) :
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//   REDIS_URL=redis://... node scripts/migrate_upstash_to_redis.js
// Option --dry-run : liste les clés sans rien écrire.

const { createClient } = require("../server/redisClient.js");

async function upstash(fetchImpl, base, token, parts) {
  const url = `${base.replace(/\/$/, "")}/${parts.map(p => encodeURIComponent(String(p))).join("/")}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Upstash ${parts[0]} : HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(`Upstash ${parts[0]} : ${data.error}`);
  return data.result;
}

async function migrate({ upstashUrl, upstashToken, redisUrl, dryRun = false, fetchImpl = fetch, log = console.log }) {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await upstash(fetchImpl, upstashUrl, upstashToken, ["scan", cursor, "count", 200]);
    keys.push(...batch);
    cursor = String(next);
  } while (cursor !== "0");
  const unique = [...new Set(keys)].sort();
  log(`${unique.length} clés trouvées sur Upstash.`);
  if (dryRun) { unique.forEach(k => log(`  ${k}`)); return { keys: unique.length, copied: 0, skipped: [] }; }

  const target = createClient(redisUrl);
  const skipped = [];
  let copied = 0, bytes = 0;
  try {
    for (const key of unique) {
      const type = await upstash(fetchImpl, upstashUrl, upstashToken, ["type", key]);
      if (type !== "string") { skipped.push(`${key} (type ${type})`); continue; }
      const value = await upstash(fetchImpl, upstashUrl, upstashToken, ["get", key]);
      if (typeof value !== "string") { skipped.push(`${key} (disparue)`); continue; }
      await target.command("SET", key, value);
      const check = await target.command("GET", key);
      if (check !== value) throw new Error(`Vérification échouée pour ${key}.`);
      copied++;
      bytes += Buffer.byteLength(value);
      log(`  ✓ ${key} (${Math.round(Buffer.byteLength(value) / 1024)} Ko)`);
    }
    const total = await target.command("DBSIZE");
    log(`${copied} clés copiées et vérifiées (${(bytes / 1024 / 1024).toFixed(1)} Mo). Clés sur Render : ${total}.`);
    if (skipped.length) log(`Ignorées : ${skipped.join(", ")}`);
  } finally {
    target.quit();
  }
  return { keys: unique.length, copied, skipped };
}

module.exports = { migrate };

if (require.main === module) {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, REDIS_URL } = process.env;
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN || !REDIS_URL) {
    console.error("Il faut UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN et REDIS_URL.");
    process.exit(1);
  }
  migrate({
    upstashUrl: UPSTASH_REDIS_REST_URL, upstashToken: UPSTASH_REDIS_REST_TOKEN, redisUrl: REDIS_URL,
    dryRun: process.argv.includes("--dry-run"),
  }).then(() => process.exit(0), (e) => { console.error("Échec :", e.message); process.exit(1); });
}
