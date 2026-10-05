# LLUFAN — boutique Shopify (thème en clair)

**Thème complet de la boutique LLUFAN** — maternité · allaitement · confort mère-bébé (Algérie) — **en français et en arabe**, entièrement réglable dans l'éditeur Shopify.

Les fichiers du thème sont **ici, en clair** : chaque section, chaque modèle, chaque réglage est consultable et modifiable directement dans GitHub.

---

## ⬇️ Télécharger la version prête à importer dans Shopify

**2,0 Mo · 104 fichiers · française + arabe**

| Lien | Usage |
|---|---|
| [`LLUFAN-theme-Shopify.zip`](https://github.com/DJ-KHLIF/llufan-shopify/releases/download/v1/LLUFAN-theme-Shopify.zip) | la version publiée (Releases) |
| [`LLUFAN-theme-Shopify.zip`](https://github.com/DJ-KHLIF/llufan-shopify/raw/main/LLUFAN-theme-Shopify.zip) | le fichier à la racine de ce dépôt |

Puis dans Shopify : **Boutique en ligne → Thèmes → Ajouter un thème → Importer un fichier ZIP**.

> ⚠️ Le bouton « **Code → Download ZIP** » de GitHub ne convient **pas** à Shopify : GitHub glisse un dossier à la racine de l'archive, que Shopify refuse. Utilisez l'un des deux liens ci-dessus, qui donnent l'archive exacte.

---

## Voir la boutique remplie (83 pages)

**https://dj-khlif.github.io/llufan.com/** — accueil, collections, fiches produits, panier, Club Maman, version arabe, et la vue d'ensemble des 81 pages.

Le thème est la décoration ; **le contenu vit dans Shopify**. Après l'import, la liste exacte de ce qu'il faut créer (10 pages, 5 collections, le menu) est dans [`SHOPIFY-A-REMPLIR.txt`](SHOPIFY-A-REMPLIR.txt).

---

## Ce que contient le dépôt

| Dossier | Rôle | Fichiers |
|---|---|---|
| `assets/` | images, styles et **polices arabes** | 25 |
| `sections/` | les sections réglables une par une dans l'éditeur | 31 |
| `templates/` | les modèles : accueil, produit, collection, panier, page, article… | 29 |
| `snippets/` | morceaux réutilisables (dont le référencement et le partage) | 14 |
| `locales/` | français (`fr.default.json`) et arabe (`ar.json`) | 2 |
| `config/` | les réglages du thème et leurs valeurs par défaut | 2 |
| `layout/` | l'ossature commune à toutes les pages | 1 |

**Total : 104 fichiers.**

---

## Ce qui a été vérifié (5 octobre 2026)

- **Import Shopify** : 19 points conformes · 0 avertissement · 0 bloquant → *« le thème peut être importé sans réserve bloquante »* ;
- **Deux langues** : 123 clés de traduction, toutes présentes ;
- **Affichage** : ordinateur, tablette et 9 largeurs de téléphone (320 → 480 px) sur 81 pages — 0 débordement, 0 zone tactile trop petite ;
- **Arabe** : 82/82 pages en écriture de droite à gauche, aucune page mélangée ;
- **Empreinte du fichier** : `696f3dd293513024714a89b04f6d37d3a9ba9555cad029a3a004803400d51068` (2 056 081 octets) — la même que celle contrôlée après téléchargement.

---

## Connecter Shopify à ce dépôt (facultatif)

Comme les fichiers sont à la racine, Shopify peut suivre ce dépôt :

1. Shopify → **Boutique en ligne → Thèmes → Ajouter un thème → Connecter à GitHub** *(l'option dépend du plan et du compte)* ;
2. autorisez l'application Shopify, choisissez le compte **DJ-KHLIF**, le dépôt **llufan-shopify**, la branche **main** ;
3. ensuite, chaque modification peut être publiée comme version du thème, et l'éditeur peut créer des branches d'essai.

Ce n'est pas obligatoire : l'import du fichier ZIP ci-dessus suffit.

---

## Les autres dépôts LLUFAN

| Dépôt | Contenu |
|---|---|
| [`llufan.com`](https://github.com/DJ-KHLIF/llufan.com) | la démonstration complète (83 pages), les contenus CSV, les documents |
| `llufan-shopify` *(ici)* | le thème, en clair et en archive, prêt à importer |
