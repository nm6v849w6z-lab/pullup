"use strict";
// Matchs amicaux internationaux (en cours de développement) : vue vide en
// attendant les demandes, réponses et la programmation.
function viewFor() { return { received: [], sent: [], scheduled: [], played: [], dates: [], opponents: [] }; }
module.exports = { viewFor };
