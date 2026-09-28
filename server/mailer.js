"use strict";

// =====================================================================
// ENVOI D'EMAILS (mot de passe oublié, liste de la nuit du 2026-09-28).
// Fournisseur : Resend (API HTTP, aucune dépendance) si RESEND_API_KEY et
// MAIL_FROM sont définis (ex. MAIL_FROM="Hoop Manager <noreply@hoop-manager.com>",
// domaine à vérifier chez Resend). Sans configuration : aucun envoi, le
// lien est écrit dans les journaux du serveur et l'administrateur peut en
// générer un (/api/admin/accounts/password-reset-link) — le site affiche
// alors « écris-nous sur Discord ».
// =====================================================================

function mailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

// Envoie un email. Renvoie { ok, error? }. Ne lève jamais.
async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) return { ok: false, error: "mail-disabled" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { mailConfigured, sendMail };
