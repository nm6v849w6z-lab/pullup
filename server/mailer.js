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

// ---------------------------------------------------------------------
// Modèles d'emails par langue (fr / en / it, 2026-09-30). La langue est
// celle du destinataire : voir server/i18n.js (langFor : préférence du
// compte, sinon langue envoyée par le navigateur, sinon français).
// Tutoiement comme sur le site ; en anglais / italien, même ton.
// ---------------------------------------------------------------------
const TEMPLATES = {
  passwordReset: {
    fr: ({ link }) => ({
      subject: "Hoop Manager : réinitialiser ton mot de passe",
      text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvre ce lien (valable 1 heure) :\n${link}\n\nSi tu n'as rien demandé, ignore cet email : ton mot de passe ne change pas.\n\nHoop Manager`,
    }),
    en: ({ link }) => ({
      subject: "Hoop Manager: reset your password",
      text: `Hi,\n\nTo choose a new password, open this link (valid for 1 hour):\n${link}\n\nIf you didn't ask for this, just ignore this email: your password stays the same.\n\nHoop Manager`,
    }),
    it: ({ link }) => ({
      subject: "Hoop Manager: reimposta la tua password",
      text: `Ciao,\n\nPer scegliere una nuova password, apri questo link (valido 1 ora):\n${link}\n\nSe non hai chiesto nulla, ignora questa email: la tua password non cambia.\n\nHoop Manager`,
    }),
  },
};

// Contenu d'un email ({ subject, text }) dans la langue voulue (français
// si la langue ou le modèle n'existe pas).
function compose(kind, lang, vars = {}) {
  const t = TEMPLATES[kind];
  if (!t) throw new Error(`modèle d'email inconnu : ${kind}`);
  return (t[lang] || t.fr)(vars);
}

module.exports = { mailConfigured, sendMail, compose, TEMPLATES };
