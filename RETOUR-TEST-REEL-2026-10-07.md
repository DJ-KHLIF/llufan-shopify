# Retour du test réel — thème 154731577505 « Llufan — Priorité 1 700 DA (3bcfc62) »

Date : 2026-10-07. Aucune donnée personnelle des captures n'est reprise ici.
Rien n'a été publié ; aucun thème ni réglage Shopify n'a été modifié.

## Confirmé en réel (par le marchand)

- Caisse : livraison 700 DA ; 9 600 DA d'articles → total 10 300 DA.
- Taxes incluses, aucun supplément fiscal ; paiement à la livraison proposé.

Ces points ne sont pas touchés par les correctifs ci-dessous (banc `lancer-banc.sh` : 21/21).

## Corrigé dans cette branche (vérifié en SIMULATION seulement)

| Constat | Cause dans le code | Correctif |
|---|---|---|
| Informations personnelles visibles dans une ligne du tiroir | `snippets/cart-line-item.liquid` affichait toutes les propriétés de ligne | Les 6 champs du formulaire (et les clés `_…`) ne s'affichent plus dans le tiroir ni sur la page panier. Ils restent dans la ligne, donc dans la commande |
| Ajout possible en double | `assets/theme.js` : en cas d'erreur après un ajout enregistré (réponse 502 non JSON, rendu du tiroir en échec), le `catch` faisait `form.submit()` → 2e ajout | Plus de renvoi : message « ajout non confirmé » + relecture du panier |
| Double clic sur « Ajouter au panier » → 2 unités | Aucun verrou pendant l'envoi | Un seul ajout à la fois par formulaire |

Tests : `outils-test/tests-tiroir-cod.js` — 4/8 avant, 8/8 après.

## Non résolu : téléphone de contact

- Le lien de panier (méthode actuelle) n'a **aucun paramètre documenté** pour le contact ;
  le téléphone ne peut aller que dans `checkout[shipping_address][phone]`. C'est ce qui a été observé.
- Seule voie documentée : API Storefront, `cartCreate` avec `buyerIdentity.phone`, puis `checkoutUrl`.
  Déjà présente dans le thème, **inactive** tant qu'aucun jeton public Storefront n'est saisi
  (Réglages du thème › Livraison). Créer ce jeton = action dans Shopify, à faire ou à autoriser par le marchand.
- Que la caisse place ce numéro dans le champ « E-mail ou téléphone » reste **à vérifier en réel**.
- Aucun e-mail n'est imposé ni prérempli.

## À reproduire avant de conclure : 2 unités au tiroir, 3 en caisse

Le thème n'ajoute rien au panier du site quand on envoie le formulaire : il ouvre un lien
`/cart/<variante>:<quantité>` avec la quantité de la fiche (simulation : Gris × 1 → `Gris:1`,
Gris × 3 → `Gris:3`). Deux explications restent possibles :

- **A.** La quantité de la fiche était 3 (protocole « Gris × 3 » du test B) ; le lien a remplacé le panier.
- **B.** Shopify ajoute le contenu du lien au panier déjà ouvert (comportement non précisé par la documentation).

La ligne avec propriétés vue dans le tiroir vient d'un envoi du formulaire (lien de panier ou envoi
sans JavaScript), et non de « Ajouter au panier ».

### Protocole (thème de test, non publié, sans valider la caisse)

Données fictives uniquement (ex. « Test Llufan », 0500 00 00 00).

1. Fenêtre de navigation privée neuve. Vérifier que le panier est vide.
2. Fiche produit : Gris, quantité **1**, « Ajouter au panier ». Noter : tiroir = 1 ligne, 1 unité.
3. Fermer le tiroir. Quantité de la fiche : **1**. Remplir le formulaire, envoyer.
4. En caisse, noter le nombre d'unités et de lignes, **sans valider**.
   - 1 unité → le lien **remplace** le panier (explication A probable pour le test initial).
   - 2 unités → le lien **s'ajoute** au panier (explication B) : il faudra vider le panier avant le lien.
5. Revenir en arrière vers la boutique, ouvrir le tiroir. Noter : nombre de lignes, et si une ligne
   montre des informations du formulaire (attendu après correctif : aucune).
6. Recommencer l'étape 3 une seconde fois, puis l'étape 4. Noter les unités en caisse.
