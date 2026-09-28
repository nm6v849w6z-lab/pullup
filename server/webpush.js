"use strict";

// =====================================================================
// WEB PUSH (Premium « notifications sur mobile », liste de la nuit du
// 2026-09-28) sans dépendance : chiffrement RFC 8291 (aes128gcm) et
// authentification VAPID RFC 8292 (JWT ES256), avec le module `crypto`.
//
// Configuration (variables d'environnement, voir DEV_NOTES) :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY : paire générée une fois par
//     `node server/webpush.js --generate` (base64url) ;
//   VAPID_SUBJECT : « mailto:contact@… » ou l'URL du site.
// Sans ces variables, les notifications sont simplement désactivées.
// =====================================================================

const crypto = require("crypto");

function b64u(buf) { return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64u(s) { return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64"); }

function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:contact@hoop-manager.com" };
}

function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
  void publicKey;
  return { publicKey: b64u(pub), privateKey: jwk.d };
}

function privateKeyObject(publicKeyB64u, privateKeyB64u) {
  const pub = unb64u(publicKeyB64u);
  return crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: privateKeyB64u, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
}

// En-tête Authorization VAPID pour un point d'envoi donné.
function vapidAuthorization(endpoint, vapid, nowSec = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: vapid.subject }));
  const data = `${header}.${claims}`;
  const sig = crypto.sign("sha256", Buffer.from(data), { key: privateKeyObject(vapid.publicKey, vapid.privateKey), dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64u(sig)}, k=${vapid.publicKey}`;
}

function hmac(key, data) { return crypto.createHmac("sha256", key).update(data).digest(); }

// Chiffre `payload` (texte) pour un abonnement { keys: { p256dh, auth } }.
function encryptPayload(subscription, payload, { salt = crypto.randomBytes(16), ephemeral = null } = {}) {
  const uaPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  const ecdh = ephemeral || crypto.createECDH("prime256v1");
  if (!ephemeral) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])])).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const plain = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

let fetchImpl = (...a) => fetch(...a);
function _setFetchForTests(fn) { fetchImpl = fn; }

// Envoie une notification. Renvoie { ok, status, gone } (gone : abonnement
// expiré, à supprimer).
async function sendPush(subscription, payloadObj, { vapid = vapidConfig(), ttl = 3600 } = {}) {
  if (!vapid) return { ok: false, status: 0, error: "push-disabled" };
  try {
    const body = encryptPayload(subscription, JSON.stringify(payloadObj));
    const res = await fetchImpl(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl),
        Authorization: vapidAuthorization(subscription.endpoint, vapid), Urgency: "normal",
      },
      body,
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

if (require.main === module && process.argv.includes("--generate")) {
  const k = generateVapidKeys();
  console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`);
}

module.exports = { b64u, unb64u, vapidConfig, generateVapidKeys, vapidAuthorization, encryptPayload, sendPush, _setFetchForTests };
