#!/bin/bash
cd "$(dirname "$0")"
echo "Démarrage du serveur Pull Up..."
echo "Une fois 'démarré sur http://localhost:4000' affiché, ouvre ce lien dans ton navigateur."
echo "Laisse cette fenêtre ouverte tant que tu joues. Ctrl+C pour arrêter."
echo ""
BASKET_FAST_CALENDAR=1 node server/index.js
