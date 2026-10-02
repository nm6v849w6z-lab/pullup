"use strict";
// Client Redis minimal (protocole RESP2) sans dépendance, pour Render Key
// Value (bascule décidée le 2026-10-02 : base à côté du serveur, prix fixe,
// plus de quota de volume comme chez Upstash). Adresse lue dans REDIS_URL :
// redis://[utilisateur:motdepasse@]hôte:port[/base] ou rediss:// (TLS).
// Une seule connexion, commandes en file (pipeline), reconnexion
// automatique à la commande suivante si la connexion tombe.

const net = require("net");
const tls = require("tls");

const COMMAND_TIMEOUT_MS = 15000;
const CONNECT_TIMEOUT_MS = 10000;

function encodeCommand(args) {
  const parts = [`*${args.length}\r\n`];
  const bufs = [];
  for (const a of args) {
    const b = Buffer.isBuffer(a) ? a : Buffer.from(String(a), "utf-8");
    bufs.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from("\r\n"));
  }
  return Buffer.concat([Buffer.from(parts[0]), ...bufs]);
}

// Lit une réponse RESP complète à partir de `buf[pos]`. Renvoie
// { value, pos } ou null si les données sont incomplètes.
function parseReply(buf, pos) {
  if (pos >= buf.length) return null;
  const type = String.fromCharCode(buf[pos]);
  const eol = buf.indexOf("\r\n", pos);
  if (eol === -1) return null;
  const line = buf.toString("utf-8", pos + 1, eol);
  const next = eol + 2;
  if (type === "+") return { value: line, pos: next };
  if (type === "-") { const err = new Error(line); err.redisError = true; return { value: err, pos: next }; }
  if (type === ":") return { value: Number(line), pos: next };
  if (type === "$") {
    const len = Number(line);
    if (len === -1) return { value: null, pos: next };
    if (buf.length < next + len + 2) return null;
    return { value: buf.toString("utf-8", next, next + len), pos: next + len + 2 };
  }
  if (type === "*") {
    const n = Number(line);
    if (n === -1) return { value: null, pos: next };
    const arr = [];
    let p = next;
    for (let i = 0; i < n; i++) {
      const r = parseReply(buf, p);
      if (!r) return null;
      arr.push(r.value);
      p = r.pos;
    }
    return { value: arr, pos: p };
  }
  throw new Error(`Réponse Redis inattendue (${type}).`);
}

function createClient(redisUrl) {
  const u = new URL(redisUrl);
  const useTls = u.protocol === "rediss:";
  const host = u.hostname;
  const port = Number(u.port) || 6379;
  const username = u.username ? decodeURIComponent(u.username) : "";
  const password = u.password ? decodeURIComponent(u.password) : "";
  const db = u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0;

  let socket = null;
  let ready = null;          // promesse de connexion en cours
  let buffer = Buffer.alloc(0);
  const pending = [];        // { resolve, reject, timer }

  function failAll(err) {
    while (pending.length) {
      const p = pending.shift();
      clearTimeout(p.timer);
      p.reject(err);
    }
  }

  function onData(chunk) {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    let pos = 0;
    for (;;) {
      let r;
      try { r = parseReply(buffer, pos); } catch (e) { teardown(e); return; }
      if (!r) break;
      pos = r.pos;
      const p = pending.shift();
      if (!p) continue;
      clearTimeout(p.timer);
      if (r.value instanceof Error) p.reject(r.value); else p.resolve(r.value);
    }
    buffer = pos >= buffer.length ? Buffer.alloc(0) : buffer.subarray(pos);
  }

  function teardown(err) {
    if (socket) { socket.removeAllListeners(); socket.destroy(); }
    socket = null;
    ready = null;
    buffer = Buffer.alloc(0);
    failAll(err || new Error("Connexion Redis fermée."));
  }

  function rawSend(args) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => teardown(new Error(`Redis : pas de réponse à ${args[0]} sous ${COMMAND_TIMEOUT_MS / 1000} s.`)), COMMAND_TIMEOUT_MS);
      pending.push({ resolve, reject, timer });
      socket.write(encodeCommand(args));
    });
  }

  function connect() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      const opts = { host, port };
      const s = useTls ? tls.connect({ ...opts, servername: host }) : net.connect(opts);
      socket = s;
      const timer = setTimeout(() => { teardown(new Error("Redis : connexion impossible (délai dépassé).")); reject(new Error("Redis : connexion impossible (délai dépassé).")); }, CONNECT_TIMEOUT_MS);
      s.setNoDelay(true);
      s.on("data", onData);
      s.on("error", (e) => { clearTimeout(timer); teardown(e); reject(e); });
      s.on("close", () => { clearTimeout(timer); if (socket === s) teardown(); });
      s.once(useTls ? "secureConnect" : "connect", async () => {
        clearTimeout(timer);
        try {
          if (password) await rawSend(username ? ["AUTH", username, password] : ["AUTH", password]);
          if (db) await rawSend(["SELECT", db]);
          resolve();
        } catch (e) { teardown(e); reject(e); }
      });
    });
    // Évite un rejet non suivi si personne n'attend cette promesse.
    ready.catch(() => {});
    return ready;
  }

  async function command(...args) {
    await connect();
    if (!socket) throw new Error("Connexion Redis fermée.");
    return rawSend(args);
  }

  function quit() {
    if (socket) { try { socket.end(); } catch (e) { /* rien */ } }
    teardown(new Error("Client Redis fermé."));
  }

  return { command, quit };
}

module.exports = { createClient, encodeCommand, parseReply };
