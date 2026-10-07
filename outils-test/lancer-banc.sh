#!/bin/sh
# Lance les 3 bancs nécessaires à tests-parcours-cod.js puis les tests (SIMULATION).
cd "$(dirname "$0")"
node serveur.js .. 4810 & A=$!
REGLAGES='{"storefront_jeton_public":"jeton-public-factice"}' node serveur.js .. 4811 & B=$!
REGLAGES='{"livraison_tarif_unique":null}' node serveur.js .. 4812 & C=$!
sleep 2
node tests-parcours-cod.js 4810 4811 4812; R=$?
kill $A $B $C
exit $R
