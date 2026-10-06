# Llufan — parcours arabe (ajout au panier, quantités, montants) : compte rendu pour Sidekick

**Boutique** : Llufan (llufan.com, `vawqkk-ww.myshopify.com`).
**Thème testé par le marchand** : `154695794849` « llufan-refonte-test-1fbb997 » (non publié).
**Thème actif** `154641760417` : non modifié (dernière modification 12:34, avant ce travail).
**Branche** : `llufan-refonte-test`. Rien n'a été poussé sur `main`, rien n'a été fusionné ni publié.

> ⚠️ **Aucun test n'a été fait sur l'aperçu Shopify réel.** La politique réseau de l'environnement
> de travail bloque `llufan.com` et `vawqkk-ww.myshopify.com`. Tous les tests ci-dessous sont
> **simulés** (banc local), sauf les lectures de données faites par l'API Admin. Le problème
> n'est **pas déclaré résolu** : il reste à confirmer sur l'aperçu réel (§6).

## 1. Problèmes signalés et étapes de reproduction

Problèmes signalés par le marchand en test réel, en arabe seulement : ajout au panier, modification des quantités dans le panier, recalcul des montants.

Étapes à suivre sur l'aperçu :
1. `https://llufan.com/ar/products/nomad-coussin-dallaitement-llufan?preview_theme_id=<thème>`
2. Choisir « رمادي » (Gris), quantité 1, « أضف إلى السلة ».
3. Choisir « أزرق » (Bleu), quantité 2, « أضف إلى السلة ».
4. Ouvrir `/ar/cart` et utiliser + / − / supprimer.
5. Choisir Alger / Bab El Oued, puis domicile et stop-desk.

Attendu : 9 600 د.ج, puis 10 000 د.ج (domicile) et 9 850 د.ج (stop-desk).

**Non reproduits en conditions réelles** : l'aperçu est inaccessible depuis l'environnement de travail.

## 2. Cause identifiée, preuves et incertitudes

**Cause la plus probable : le choix de la variante dépendait de textes d'option traduits.**

Preuves sur les données réelles (API Admin, lecture seule) :
- valeurs d'option traduites en arabe : Bleu → أزرق, Rose → وردة, Gris → رمادي ; option « Coloris » → لون ;
- les variantes ont **en plus** leur propre traduction `option1` (أزرق / وردة / رمادي) ;
- le titre du produit est traduit (نوماد — وسادة الرضاعة من ليلوفان).

Preuves dans le code (version importée `1fbb997`) :
- `sections/main-product.liquid` : la disponibilité de chaque couleur se calculait par
  `variant.options[option_index] == value`, et la valeur cochée par `option.selected_value == value`.
  Ces textes viennent de deux sources traduites séparément (variante / valeur d'option).
- `assets/theme.js` (`variant-picker.select`) : la variante choisie se déduisait en comparant
  `option1` (JSON de la variante) au `value` du bouton coché.
- Le français n'est pas concerné : les deux sources sont alors le texte d'origine, identique.

Reproduction simulée : le banc rend les vrais fichiers du thème avec les traductions arabes réelles.
- Si les deux sources arabes concordent : **35/35**.
- Si Shopify sert les valeurs d'option en arabe mais le texte d'option des variantes en français : **4 échecs, tous en arabe**.
  - Toutes les couleurs sont désactivées.
  - Le bouton d'ajout passe en « épuisé ».
  - Le formulaire reçoit « aucune variante » : sous-total 0 et simulation refusée.

  Le français reste à 35/35. Ce comportement correspond aux trois symptômes signalés.

**Incertitude principale** : je n'ai pas pu vérifier ce que Shopify sert réellement dans le HTML arabe de l'aperçu.
Je ne sais donc pas si les deux sources divergent vraiment.

Les autres pistes ont été vérifiées et écartées dans le banc :
- **URL des requêtes en `/ar/`** : `/ar/cart/add.js`, `/ar/cart/change.js`, `/ar/cart.js` et `/ar/cart?sections=…` sont toutes construites depuis `Shopify.routes.root`, et répondent 200.
- **Panier** : modification par clé d'article, resynchronisation du tiroir, de la page panier et du formulaire, écouteurs délégués conservés après remplacement du contenu.
- **Calculs** : sur des centimes numériques (`variant.price`, `final_line_price`, `total_price`), jamais sur les montants affichés.
- **Boutons en RTL** : non recouverts, sur mobile comme sur ordinateur.

Si la cause réelle est autre (§6), ces points n'auront pas été reproduits.

## 3. Fichiers et passages corrigés (commit `46aed99`)

- `sections/main-product.liquid`, sélecteur de variantes :
  - disponibilité via `value.available` ;
  - valeur cochée via `value.selected` ;
  - chaque bouton porte `data-variant-id="{{ value.variant.id }}"` (produits à une option, comme le Nomade) ;
  - l'ancienne comparaison reste en repli, avec l'index corrigé `option.position | minus: 1`.
- `assets/theme.js`, `variant-picker` :
  - nouvelle méthode `findVariant()` : variante prise par identifiant (`data-variant-id`) ;
  - sinon, comparaison normalisée (Unicode NFC, espaces) ;
  - si aucune valeur n'est cochée, la variante du formulaire fait foi ;
  - message console `[LLUFAN] variante introuvable …` pour le diagnostic réel.

Rien d'autre n'a changé : textes, prix, stocks, photos, tarifs et simulation sont inchangés (2 fichiers modifiés, +46 / −13 lignes).

## 4. Tests Shopify réels (FR/AR)

**Aucun.** L'aperçu n'est pas joignable depuis l'environnement de travail.
Seules lectures réelles faites, par l'API Admin :
- correspondance du thème `154695794849` avec le commit `1fbb997` (empreintes MD5) ;
- traductions arabes du produit et des options ;
- rôles des thèmes (thème actif inchangé).

## 5. Tests simulés (banc local : liquidjs + Chromium, API panier imitée, traductions arabes réelles)

Version corrigée `46aed99` :

| Scénario | FR | AR, traductions cohérentes | AR, traductions divergentes |
|---|---|---|---|
| Choix Bleu / Rose / Gris, prix, légende | ✔ | ✔ | ✔ variante, ✘ libellé* |
| Quantités + / − et saisie directe | ✔ | ✔ | ✔ |
| 1 Gris + 2 Bleus = 9 600 ; domicile 10 000 ; stop-desk 9 850 | ✔ | ✔ | ✔ |
| Panier : +, −, suppression, panier vide, formulaire resynchronisé | ✔ | ✔ | ✔ |
| Double clic : un seul ajout | ✔ | ✔ | ✔ |
| Tiroir : + / − / supprimer (mobile 390 px et ordinateur) | ✔ | ✔ | ✔ |
| Domicile / stop-desk, validation, tarif absent, simulation sans envoi | ✔ | ✔ | ✔ |
| Langue conservée (`/ar/…`), 360 / 390 px sans débordement | ✔ | ✔ | ✔ |

\* Dans ce scénario hypothétique, le récapitulatif affiche le titre de variante fourni par Shopify (« Rose », servi en français). Le test attendait l'arabe. Ce n'est pas un défaut du thème.

Totaux :
- **35/35** (cohérentes) ; **34/35** (divergentes, l'écart * ci-dessus) ;
- tarifs absents **4/4** ;
- version importée `1fbb997` dans le scénario divergent : **31/35** (les 4 échecs arabes décrits au §2).

Theme Check : aucune erreur, 7 avertissements, tous déjà présents.

## 6. Points non vérifiés, et éléments à fournir pour conclure
Sur l'aperçu réel, en arabe, avec le thème `154695794849` (ancien) puis le nouveau :
1. **Code source de la fiche** (clic droit → Afficher le code source) :
   - le bloc `<script type="application/json" data-variant-json>` ;
   - les trois `<input … name="option-1" …>` (valeurs et attribut `disabled`).
2. **Console** (F12 → Console) après chargement et après le clic « أضف إلى السلة » : erreurs rouges, et pour le nouveau thème toute ligne `[LLUFAN] variante introuvable`.
3. **Réseau** (F12 → Réseau, filtre `cart`) pendant l'ajout puis un « + » dans le panier :
   - pour chaque requête : URL, statut, corps envoyé (`id`, `quantity`) et réponse ;
   - en particulier `/ar/cart/add.js`, `/ar/cart/change.js` et `/ar/cart?sections=…`.
4. **Captures** : la fiche en arabe (couleurs et bouton d'ajout), le tiroir après ajout, puis la page `/ar/cart` après un « + ».
5. **Comparaison** : les mêmes captures en français.

Non vérifiés également :
- éditeur de thème ;
- Safari iOS et Android réels ;
- comportement du cache de prévisualisation de Shopify.

## 7. ZIP final et commit
**`LLUFAN-refonte-test-46aed99.zip`**, commit **`46aed99`** de la branche `llufan-refonte-test`.
- 105 fichiers, tous identiques au commit, archive intègre ;
- dossiers du thème à la racine ;
- MD5 de l'archive : `35568b7fbaea28c079fdc9723b7441c1`.

Import : Boutique en ligne → Thèmes → Ajouter un thème → Importer un fichier ZIP. Le thème arrive non publié.

## 8. Nouveau thème
**Non importé par moi** : aucun identifiant ni lien d'aperçu à fournir. Après import, le lien d'aperçu
sera `https://llufan.com/ar/products/nomad-coussin-dallaitement-llufan?preview_theme_id=<identifiant>`.
