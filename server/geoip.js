"use strict";
// =====================================================================
// PAYS PROPOSÉ D'APRÈS L'ADRESSE IP (2026-10-01, retour utilisateur :
// « mets en place la proposition de pays basée sur l'ip »).
//
// Simple proposition à l'inscription (le manager choisit toujours son
// pays) : rien n'est enregistré, l'adresse n'est lue que le temps de la
// requête. Table locale server/geodata/geoip.bin (scripts/build_geoip.js,
// données NRO, CC BY 4.0) : aucun service extérieur appelé. Seuls les pays
// ouverts dans le jeu y figurent ; ailleurs, null (le site se rabat alors
// sur la langue du navigateur).
//
// countryFromRequest(req) : en-tête de pays posé par un CDN s'il y en a un
// (Cloudflare, Vercel…), sinon l'IP du client (X-Forwarded-For de Render,
// sinon la socket).
// =====================================================================
const fs = require("fs");
const path = require("path");
const net = require("net");

const DATA_PATH = path.join(__dirname, "geodata", "geoip.bin");
let table = null;

function load() {
  if (table) return table;
  try {
    const b = fs.readFileSync(DATA_PATH);
    if (b.toString("ascii", 0, 6) !== "HMGEO1") throw new Error("format");
    let o = 6;
    const nc = b[o++];
    const codes = [];
    for (let i = 0; i < nc; i++, o += 2) codes.push(b.toString("ascii", o, o + 2));
    const n4 = b.readUInt32BE(o); o += 4;
    const s4 = new Uint32Array(n4);
    for (let i = 0; i < n4; i++, o += 4) s4[i] = b.readUInt32BE(o);
    const c4 = b.subarray(o, o + n4); o += n4;
    const n6 = b.readUInt32BE(o); o += 4;
    const s6 = new BigUint64Array(n6);
    for (let i = 0; i < n6; i++, o += 8) s6[i] = b.readBigUInt64BE(o);
    const c6 = b.subarray(o, o + n6);
    table = { codes, s4, c4, s6, c6 };
  } catch (e) {
    table = { codes: [], s4: new Uint32Array(0), c4: new Uint8Array(0), s6: new BigUint64Array(0), c6: new Uint8Array(0) };
  }
  return table;
}

// Dernière plage dont le début est <= v.
function find(starts, v) {
  let lo = 0, hi = starts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= v) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

function ipv4ToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

// 64 premiers bits d'une IPv6.
function ipv6Prefix(ip) {
  let [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : null;
  const groups = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  let v = 0n;
  for (let i = 0; i < 4; i++) v = (v << 16n) + BigInt(parseInt(groups[i] || "0", 16) || 0);
  return v;
}

function countryForIp(raw) {
  if (typeof raw !== "string") return null;
  let ip = raw.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  const t = load();
  const kind = net.isIP(ip);
  let c = 0;
  if (kind === 4) { const i = find(t.s4, ipv4ToInt(ip)); c = i >= 0 ? t.c4[i] : 0; }
  else if (kind === 6) { const i = find(t.s6, ipv6Prefix(ip)); c = i >= 0 ? t.c6[i] : 0; }
  return c ? t.codes[c - 1] : null;
}

const CDN_HEADERS = ["cf-ipcountry", "x-vercel-ip-country", "x-country-code", "cloudfront-viewer-country"];

// Adresses candidates du client, de la plus sûre à la moins sûre : en-têtes
// « IP du client » des proxys (Render passe par Cloudflare : True-Client-IP /
// CF-Connecting-IP), puis chaque adresse de X-Forwarded-For dans l'ordre, puis
// la socket. La première qui tombe dans un pays connu l'emporte (une adresse
// privée ou interne au proxy est simplement sautée).
function candidateIps(req) {
  const h = (req && req.headers) || {};
  const out = [];
  for (const k of ["true-client-ip", "cf-connecting-ip", "x-real-ip", "fly-client-ip"]) {
    if (typeof h[k] === "string" && h[k].trim()) out.push(h[k].trim());
  }
  const fwd = h["x-forwarded-for"];
  if (typeof fwd === "string") fwd.split(",").map(x => x.trim()).filter(Boolean).forEach(x => out.push(x));
  if (req && req.socket && req.socket.remoteAddress) out.push(req.socket.remoteAddress);
  return out;
}

// Code pays (minuscules, ex. "de") pour une requête, ou null.
function countryFromRequest(req) {
  for (const h of CDN_HEADERS) {
    const v = req && req.headers && req.headers[h];
    if (typeof v === "string" && /^[a-z]{2}$/i.test(v.trim()) && !/^(xx|t1)$/i.test(v.trim())) return v.trim().toLowerCase();
  }
  for (const ip of candidateIps(req)) {
    const c = countryForIp(ip);
    if (c) return c;
  }
  return null;
}

module.exports = { countryForIp, countryFromRequest };
