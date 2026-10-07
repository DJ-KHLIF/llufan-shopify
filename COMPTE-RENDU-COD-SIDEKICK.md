# Compte rendu pour Sidekick — parcours COD, 700 DA, téléphone (2026-10-07)

Destinataire : Sidekick (agent Shopify de la boutique Llufan).
Rien n'a été publié, aucun thème n'a été remplacé, aucun réglage de la
boutique n'a été modifié, aucune commande n'a été créée.

## 1. État réel récupéré (lecture seule)

- **Boutique :** Llufan, `vawqkk-ww.myshopify.com`, DZD.
- **Thème actif :** `154641760417` « llufan-boutique/main ». **Non touché.**
- **Thème de travail :** `154721583265` « Llufan — Priorité 1 (commande réelle) », non publié, 104 fichiers.
- **Dépôt :** `DJ-KHLIF/llufan-shopify`, branche `llufan-refonte-test`.
  - Le thème correspond au commit `af32d51` pour 93 fichiers.
  - **11 fichiers avaient été modifiés directement dans Shopify :** `theme.js`, `cart-drawer`, `forme-commande`, `llufan-livraison.js`, `locales fr/ar`, `settings_data`, `header-group`, `index`/`collection`/`product.json`.
  - Les commits `9e6fd70` → `d6dfd27` de la branche **n'étaient pas dans ce thème**.
  - Les 104 fichiers ont été récupérés et contrôlés (MD5 Shopify : 104/104), puis enregistrés tels quels (commit `1a48e09`).
- **Expédition** (lue) : zone « Domestic » (DZ), une seule méthode « Standard », **700 DZD**, sans condition.
- **Taxes** (lues) : `taxesIncluded: true` et `taxShipping: false`. Aucun changement.
- **La modification « 700 DA » proposée par Sidekick n'était PAS appliquée.** Le formulaire affichait encore les tarifs par wilaya, de 250 à 800 DA (Alger : 400 / 250). Exemple : 10 000 DA affichés, puis 10 300 DA en caisse.
- **Téléphone :** il n'était transmis que dans `checkout[shipping_address][phone]`. Aucun e-mail envoyé.

## 2. Corrections (commit `3f6ec0b`)

| Fichier | Changement |
|---|---|
| `config/settings_schema.json` | Nouveau groupe « Livraison » : **Tarif de livraison unique (DA)**, 700 par défaut. Vide = retour aux tarifs par wilaya. Ajout d'une option « Jeton public de l'API Storefront », vide par défaut |
| `snippets/forme-commande.liquid` | 700 DA affichés pour les 2 modes dès le chargement. Note « montant fixe, taxes incluses » au lieu de « estimation » |
| `assets/llufan-livraison.js` | Le tarif unique remplace le tarif par wilaya. Total = articles + 700. Option Storefront ajoutée (voir §3) |
| `locales/fr.default.json`, `locales/ar.json` | Nouvelle clé `commande.frais_fixes` (FR et AR) |
| `templates/product.json`, `collection.json`, `page.faq.json`, `page.livraison.json` | Les textes « les frais dépendent de la wilaya » deviennent « 700 DA partout en Algérie, à domicile comme en stop-desk » |

**Conservé à l'identique :**

- le panier : `theme.js`, `cart-drawer`, `cart-line-item`, `main-cart` (variantes, quantités, recalculs, tiroir maintenu ouvert) ;
- les 69 wilayas et les 1 541 communes (`llufan-livraison-dz.json`) ;
- l'adresse conditionnelle (obligatoire à domicile, masquée en stop-desk) ;
- le lien de panier vers la caisse.

**Résultat de theme-check :** identique avant et après. Il reste 1 point mineur, déjà présent avant : `main-list-collections.liquid:13`, image sans dimensions.

## 3. Téléphone de contact : documentation, hypothèse, test

- **Documentation, liens de panier :** les paramètres documentés sont `checkout[email]` et `checkout[shipping_address][…]`. **Aucun paramètre pour le téléphone de contact.** Aucun paramètre inventé n'a été testé.
- **Documentation, API Storefront :** `cartCreate` accepte `buyerIdentity.phone`, décrit comme information de contact, puis on envoie la cliente sur `checkoutUrl`. Mise en place en **option désactivée** :
  - elle ne s'active que si un **jeton public** Storefront est saisi dans les réglages du thème ;
  - le numéro est converti au format +213… ;
  - en cas d'erreur, de délai de plus de 8 s ou de numéro non algérien, le lien de panier habituel reprend la main.
- **Hypothèse non vérifiée :** que la caisse affiche bien ce téléphone dans le champ « E-mail ou téléphone ». **À tester en réel** (§5, test C).
- **Limite de l'option :** le panier Storefront est distinct du panier du site. Depuis la page panier, les articles peuvent rester dans le panier du site après la commande.
- **Même si ce préremplissage fonctionne, il reste une étape :** la caisse Shopify doit être validée par la cliente. Aucun paramètre ne permet de la passer. Un parcours en un seul formulaire, sans 2e étape, exige un **relais serveur** qui crée la commande.

## 4. Relais serveur (prototype, NON activé)

Dossier `relais-cod/`, avec son guide `relais-cod/GUIDE-INSTALLATION.md`.

- **Technique :** Cloudflare Worker + D1, application Dev Dashboard avec les droits `read_products`, `write_draft_orders` et `read_orders`.
- **Double verrou :** sans `MODE=production` **et** `COMMANDES_REELLES=oui`, aucune écriture dans Shopify.
- **Commande :**
  - brouillon recalculé par Shopify, total exact obligatoire, puis finalisation ;
  - conditions de paiement « Paiement à l'expédition » (modèle `PaymentTermsTemplate/9`, lu sur la boutique) → paiement **en attente** ;
  - tout statut différent de `PENDING` → alerte ; la commande n'est jamais marquée payée.
- **Doublons :** anti-doublon persistant (clé, empreinte, verrou) ; réponse perdue → « incertain » → vérification par étiquette `relais-<clé>`. Jamais de renvoi automatique vers la caisse.
- **Anti-spam :** Turnstile, limite de débit par IP hachée.
- **Données :** aucune donnée personnelle dans la base du relais.
- **Meta :** « Purchase » envoyé une seule fois, après création confirmée, avec consentement.
- **Tests :** 30 tests simulés, sans aucun appel réseau.

## 5. Tests

### Simulés (banc local, aucune requête vers Shopify)

- `outils-test/lancer-banc.sh` : **21/21** — panier FR/AR, 700 DA, 9 600 + 700 = 10 300, lien de caisse, stop-desk, option Storefront et ses replis, retour aux tarifs par wilaya.
- `relais-cod` : `npm test` → **30/30**.

### Réels : impossibles depuis cette session

L'accès à `llufan.com` et à `vawqkk-ww.myshopify.com` est bloqué par le réseau de l'environnement. **Aucun test réel n'a donc été fait.** À faire par le marchand, sur le thème importé depuis `LLUFAN-theme-priorite1-700DA.zip`, **non publié** :

**A. Panier FR et AR** (non modifié, à revérifier)
1. Choisir une couleur, puis « Ajouter au panier » : le tiroir s'ouvre avec la bonne variante.
2. Cliquer sur +, puis −, puis la corbeille : le tiroir reste ouvert et les totaux se recalculent.
3. Page panier : le bouton + recharge la page avec la bonne quantité.

**B. Formulaire et caisse**
1. Fiche produit : 700 DA affichés pour « À domicile » et pour « Stop-desk », avant même de choisir la wilaya.
2. Choisir 3 articles à 3 200 DA : total affiché 10 300 DA.
3. Stop-desk : le champ adresse disparaît.
4. Envoyer le formulaire : en caisse, le total doit être **10 300 DA**, avec 700 DA de livraison et sans supplément. Le téléphone figure dans l'adresse de livraison, et aucun e-mail n'est prérempli.
5. **Ne pas valider la caisse.**

**C. Option Storefront** (facultatif, sans commande)
1. Créer un **jeton public** (canal Headless) avec le droit d'écriture des paniers.
2. Le coller dans *Réglages du thème > Livraison* du thème de test.
3. Refaire le test B, puis noter si le champ de contact de la caisse contient le téléphone.
4. **Ne pas valider la caisse.**

## 6. Limites restantes

- **Problème antérieur, hors sujet COD, non corrigé :** dans `sections/main-product.liquid` (ligne 9), l'attribut `data-product-info` est écrit **deux fois**. Le script « Vus récemment » échoue (« Unexpected end of JSON input »). Le panier et le formulaire ne sont pas touchés.
- **La fiche produit propose deux chemins :** « Ajouter au panier » et le formulaire de commande.
- **Montant écrit en dur :** 700 DA apparaît aussi dans les textes (FAQ, page Livraison). Avec les tarifs ZR Express, il faudra modifier ensemble : le tarif Shopify, le réglage du thème et ces textes.
- **Commits non poussés :** le droit d'écriture sur `llufan-shopify` a été refusé à cette session. Les commits sont prêts localement et fournis en fichier bundle.
