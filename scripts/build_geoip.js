#!/usr/bin/env node
/* Table IP → pays (2026-10-01, retour utilisateur : « mets en place la
   proposition de pays basée sur l'ip »), lue par server/geoip.js.

   Source : paquet npm @ip-location-db/geo-whois-asn-country (données
   d'attribution des registres Internet, NRO, licence CC BY 4.0 — attribution
   dans server/geodata/GEOIP_LICENSE.txt et la page Confidentialité). Seuls les
   pays OUVERTS dans le jeu sont gardés ; tout le reste devient « inconnu »
   (0), ce qui permet de fusionner les plages voisines.

   Usage (à relancer de temps en temps, les attributions bougent peu) :
     npm pack @ip-location-db/geo-whois-asn-country && tar xzf ip-location-db-*.tgz
     node scripts/build_geoip.js package/   → server/geodata/geoip.bin

   Format (gros-boutiste) : "HMGEO1", u8 nb de pays, codes (2 octets chacun),
   puis IPv4 : u32 n, n × u32 début de plage, n × u8 pays (0 = inconnu, sinon
   indice + 1) ; puis IPv6 (64 premiers bits seulement) : u32 n, n × u64
   début, n × u8 pays. Chaque plage court jusqu'au début de la suivante. */
"use strict";
const fs = require("fs");
const path = require("path");
const Engine = require("../engine.js");

const src = process.argv[2];
if (!src) { console.error("usage : node scripts/build_geoip.js <dossier du paquet>"); process.exit(1); }
const COUNTRIES = Object.keys(Engine.WORLD_COUNTRIES);
const idx = cc => COUNTRIES.indexOf(cc.toLowerCase()) + 1;

function table(file, shift) {
  const rows = fs.readFileSync(path.join(src, file), "utf8").trim().split("\n").map(l => l.split(","));
  const pts = [];
  let prevEnd = -1n;
  for (const r of rows) {
    const s = BigInt(r[0]) >> shift, e = BigInt(r[1]) >> shift;
    if (s > prevEnd + 1n) pts.push([prevEnd + 1n, 0]);
    pts.push([s, idx(r[2])]);
    if (e > prevEnd) prevEnd = e;
  }
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0]) { last[1] = p[1]; continue; }
    if (last && last[1] === p[1]) continue;
    out.push(p);
  }
  return out;
}

const v4 = table("geo-whois-asn-country-ipv4-num.csv", 0n);
const v6 = table("geo-whois-asn-country-ipv6-num.csv", 64n);
const parts = [Buffer.from("HMGEO1"), Buffer.from([COUNTRIES.length]), Buffer.from(COUNTRIES.join(""), "ascii")];
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
parts.push(u32(v4.length));
const s4 = Buffer.alloc(v4.length * 4); v4.forEach((p, i) => s4.writeUInt32BE(Number(p[0]), i * 4));
parts.push(s4, Buffer.from(v4.map(p => p[1])));
parts.push(u32(v6.length));
const s6 = Buffer.alloc(v6.length * 8); v6.forEach((p, i) => s6.writeBigUInt64BE(p[0], i * 8));
parts.push(s6, Buffer.from(v6.map(p => p[1])));
const outPath = path.join(__dirname, "..", "server", "geodata", "geoip.bin");
fs.writeFileSync(outPath, Buffer.concat(parts));
console.log(`${outPath} : ${COUNTRIES.length} pays, ${v4.length} plages IPv4, ${v6.length} plages IPv6, ${fs.statSync(outPath).size} octets`);
