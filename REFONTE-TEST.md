# LLUFAN — refonte test (branche `llufan-refonte-test`)

> **Thème de test non publié.** Rien n'a été fusionné ni publié. `main`, le thème
> actif et les connexions GitHub–Shopify n'ont pas été touchés.

## 1. Références

| | |
|---|---|
| Boutique | **Llufan** — domaine public llufan.com (identifiant Shopify `vawqkk-ww.myshopify.com`), devise DZD, langues FR (principale) + AR (publiée) |
| Thème actif (non modifié) | `154641760417` « llufan-boutique/main » (rôle MAIN) |
| Thème source (non modifié) | `154682130593` « Copie de llufan-shopify/main » (non publié) |
| Dépôt / branche d'origine | `DJ-KHLIF/llufan-shopify`, branche `main` (commit `79008d4`, non modifiée) |
| Branche de travail | `llufan-refonte-test` |
| **Nouveau thème de test** | **`154694680737`** « LLUFAN refonte test (llufan-refonte-test 1fbb997) », **non publié** |
| Aperçu | https://llufan.com/?preview_theme_id=154694680737 |
| Fiche Nomade (FR / AR) | https://llufan.com/products/nomad-coussin-dallaitement-llufan?preview_theme_id=154694680737 — https://llufan.com/ar/products/nomad-coussin-dallaitement-llufan?preview_theme_id=154694680737 |
| Éditeur | https://admin.shopify.com/store/vawqkk-ww/themes/154694680737/editor |

Shopify CLI n'est pas installé dans l'environnement de travail et aucun identifiant CLI n'y est présent.
La copie a été récupérée en **lecture seule** par l'API Admin (connecteur Shopify autorisé) :
103 fichiers, dont 99 identiques **octet pour octet** au MD5 fourni par Shopify, et 5 JSON
normalisés par Shopify, au contenu strictement identique (comparaison champ par champ).
La sauvegarde intacte de la copie est conservée hors dépôt (archive en lecture seule).
Le commit `af32d51` de la branche est exactement cette copie.

**Comparaison copie / `main`** : la copie mêle des versions. `theme.css` et `ar.json` sont ceux de `main`.
7 fichiers Liquid (en-tête, héros, cartes…) précèdent le dernier audit de `main` (`4cc5a4e`).
Les vraies corrections propres à la copie, toutes conservées, sont :
`main-product.liquid` (index d'option `option.position | minus: 1`, accordéons AR, titre de commande AR),
`forme-commande.liquid` (simulation, adresse conditionnelle, récapitulatif FR/AR) et
`llufan-livraison.js` (quantité liée au formulaire par l'attribut `form`, recalcul).
L'en-tête de la copie (bouton qui affiche la **langue cible**) est conservé.
Le sélecteur « Français | العربية » de `main` n'a **pas** été repris.

## 2. Changements (commits de `af32d51` à `1fbb997`)

| Fichier | Rôle du changement |
|---|---|
| `snippets/forme-commande.liquid` | Formulaire COD : mêmes champs (wilaya, commune, domicile / stop-desk, adresse). Textes en clés de langue, plus aucune condition `if ar` en dur. Libellés reliés aux champs (`for` / `id` uniques), erreurs par champ en FR/AR. Bandeau et message « simulation ». Plus de script en ligne. |
| `assets/llufan-livraison.js` | Réécrit en un seul composant, sans minuteries : adresse visible et obligatoire à domicile, masquée, désactivée et absente du récapitulatif en stop-desk. Commune remise à zéro quand la wilaya change. **Aucun total inventé** si le tarif manque, et simulation refusée. Variante indisponible refusée. Confirmation cachée dès qu'un champ change. Récapitulatif avec chiffres isolés en arabe. **Rien n'est jamais envoyé.** |
| `assets/theme.js` | Événement `variant:change`. Saisie de quantité ramenée à un entier ≥ 1. Pas de double ajout au panier. Panier modifié **par clé d'article**, une demande à la fois. Le tiroir reste ouvert, la page panier et le formulaire sont resynchronisés (`llufan:panier-maj`), et la page est rechargée quand le panier se vide. |
| `sections/main-product.liquid` | Prix de la variante choisie. Valeur choisie affichée (« Coloris : Gris »). Pastille de couleur seulement si Shopify connaît la nuance (sinon le nom, lisible). Titres d'accordéon standard traduits par le thème. Formulaire relié au bon formulaire produit. **Correctif `option.position | minus: 1` conservé.** |
| `snippets/cart-line-item.liquid`, `sections/main-cart.liquid`, `sections/cart-drawer.liquid` | Boutons par clé d'article, libellés accessibles, montants unifiés. Bouton « Commander » du tiroir traduit. |
| `snippets/montant.liquid` (nouveau), `snippets/price.liquid` | Un seul format : « 9 600 DA » / « 9 600 د.ج ». Auparavant, la même page affichait « DA 3,200.00 » et « 3 200 DA ». |
| `snippets/lien.liquid` | Liens « /pages/… », « /collections/… », « /products/… » vérifiés (cible absente → repli prévu par la section) et **préfixés par la langue** (`/ar/…`) : la visiteuse arabophone reste en arabe. |
| `locales/fr.default.json`, `locales/ar.json` | Nouvelles clés (formulaire, erreurs, devise, accordéons). Clé « Commande enregistrée » supprimée (affirmation fausse). Stop-desk harmonisé « الاستلام من المكتب ». Chiffres latins en arabe. |
| `config/settings_data.json` | Palette « Ivoire & Nuit » : fond #FAF6F0, nuit #1B3462, sable #EDE4D8, accent terracotta #9E5540 (texte blanc : contraste 5,5:1, contre 2,9:1 avec l'ancien corail). Modifiable dans l'éditeur. |
| `assets/theme.css` | Compléments : formulaire, récapitulatif, montants, champs bien bordés, focus visible, champs jamais masqués par l'en-tête, cibles tactiles de 44 px, champs en 16 px sur mobile. |
| `templates/index.json` | Lien du héros vers le vrai produit (`/products/nomad-coussin-dallaitement-llufan` ; l'ancien menait à une 404). **Avis de démonstration masqués**. |
| `templates/product.json` | Titre de commande vide (donc traduit). Accordéons en titre standard. Consignes de lavage non validées remplacées par « à préciser par LLUFAN ». |
| `sections/recently-viewed.liquid`, `snippets/product-card.liquid`, `sections/main-list-collections.liquid` | JSON robuste et textes échappés, texte alternatif des images, dimensions d'image. |
| `outils-test/` | Banc de test local (hors thème, ignoré par Shopify). |

Inchangés : prix, stocks, photos, tarifs de livraison (`llufan-livraison-dz.json` identique), réglages
de livraison Shopify, polices, héros mobile, bouton CLUB MAMAN.

## 3. Tests

### Exécutés (banc local : vrais fichiers du thème rendus avec liquidjs, API panier simulée, Chromium)
**39 / 39 réussis** sur l'état final, en FR et en AR :
- sélection Bleu / Rose / Gris : variante envoyée, légende, prix, récapitulatif ;
- quantités + / −, saisie directe, valeurs 0 et négatives corrigées ;
- **1 Gris + 2 Bleus = 9 600** ; Alger / Bab El Oued : **domicile 400 → 10 000**, **stop-desk 250 → 9 850** (formulaire, récapitulatif et barre mobile concordants) ;
- panier multi-articles, modification, suppression, panier vide (plus d'ancien récapitulatif), double clic sans double ajout ;
- domicile / stop-desk (adresse), changement de wilaya, champs manquants, erreurs dans la langue de la page ;
- tarif stop-desk absent et fichier de tarifs inaccessible : aucun montant inventé, simulation refusée ;
- confirmation « simulation », **aucune requête envoyée**, jamais « commande enregistrée » ;
- variante indisponible : non sélectionnable, simulation refusée ;
- 360 px et 390 px : aucun débordement, aucun bouton coupé, champ jamais masqué par l'en-tête ni par la barre ;
- liens internes en arabe : préfixe `/ar` conservé ; aucune clé de langue manquante.

Theme Check (analyseur officiel Shopify) : mêmes 8 avertissements qu'avant, tous déjà présents dans la copie. Aucune erreur nouvelle.

Défauts constatés **sur la copie d'origine** avec le même banc, puis corrigés :
- sur la page panier, après « + », le formulaire affichait 9 600 DA alors que le panier valait 12 800 DA ;
- un tarif absent donnait quand même une simulation acceptée, avec un total égal au sous-total ;
- les prix s'écrivaient de deux façons sur la même page.

### Non exécutés (à faire sur l'aperçu)
- Rien n'a été testé sur llufan.com : l'aperçu n'est pas joignable depuis l'environnement de travail.
- Le rendu réel par Shopify et l'API panier réelle n'ont pas été testés : le banc les imite.
- Le rechargement des sections dans l'éditeur Shopify est prévu dans le code (`shopify:section:load`) mais non testé.
- Safari iOS, Android réel, lecteur d'écran (VoiceOver / TalkBack), zoom 200 % et mesure Lighthouse n'ont pas été testés.
- Pages collection, recherche, Club Maman et pages légales ont seulement été relues, sans test automatisé.

## 4. Traductions restant à appliquer (hors fichiers du thème)

Le thème de test, dupliqué de la copie, n'a **aucune** traduction de contenu (Translate & Adapt).
En arabe, le bandeau, le pré-en-tête, la FAQ, le pied de page et les pages s'affichent donc en français.
La liste à saisir, avec les corrections, est dans **`TRADUCTIONS-AR-A-APPLIQUER.csv`**.
Erreurs relevées dans les traductions du thème actif, **non modifiées** :
« مقابلة » (interview) pour « Entretien », « قائد » (chef) pour « Commander », « لوفان / للوفان » pour LLUFAN, et 58 / 69 wilayas mélangés.
Le titre du produit et les valeurs « Coloris » sont des données boutique partagées avec le site actif : elles ne seront traduites qu'avec votre accord.

## 5. Décisions du marchand
1. **58 ou 69 wilayas ?** Le fichier de tarifs contient 69 wilayas (loi 26-06 de 2026). Les textes FR disent 69. Plusieurs traductions arabes et la page Livraison disent 58.
2. **Tarifs** : ceux du formulaire (ex. Alger 400 / 250 DA, 11 nouvelles wilayas en tarif provisoire) ne sont pas ceux du checkout Shopify. Ils restent à valider avec le transporteur.
3. **Délais** « 2 à 5 jours ouvrés » et promesse « Commande protégée » : à confirmer ou à retirer.
4. **Avis** : section masquée. À réactiver seulement avec de vrais avis clients.
5. **Liens morts** dans les réglages : `/collections/bebe`, `/collections/accessoires`, `/pages/livraison` et `/pages/paiement` n'existent pas. `club-maman` n'est pas publiée. Les entrées du menu principal mènent toutes à `/collections/all`. `lien.liquid` masque désormais ces liens au lieu de mener à une 404 ; il faut créer les pages ou corriger les réglages.
6. **Nom du produit** : « Nomad » (accueil) ou « Nomade » (fiche). La variante de la « Housse de rechange » s'appelle « Color ».
7. **Polices** : Fraunces est présente, mais pas **DM Sans** ni **Tajawal** (le thème utilise Jost, IBM Plex Sans Arabic et Noto Naskh Arabic). Aucun remplacement fait : à décider avant ajout.
8. **Fiche Nomade** : les caractéristiques validées (59 × 23 × 17 cm, housse coton, fermeture enveloppe à rabat intérieur, sans fermeture éclair ni boutons visibles) sont à saisir dans la description du produit, qui est une donnée Shopify et non du thème.
9. **Mentions légales** : raison sociale, adresse, registre de commerce, hébergeur, durée de conservation des données, conditions de retour. Les pages actuelles sont des modèles marqués « démonstration ».

## 6. Commandes réelles — chantier séparé (non réalisé)
Proposition : une **application Shopify privée** (ou une fonction serveur) qui reçoit le formulaire
et recalcule tout côté serveur :
- variantes et disponibilité, quantités, destination (wilaya et commune), frais selon la table validée ;
- puis crée une **commande brouillon** (`draftOrderCreate`), finalisée en commande « paiement à la livraison ».

Elle doit aussi :
- éviter les doublons (clé d'idempotence, par exemple un hachage du panier et du téléphone sur quelques minutes) ;
- gérer les erreurs (message clair, aucune confirmation en cas d'échec) ;
- garder le jeton dans l'application, **jamais dans le thème**.

Le message du thème ne deviendra une confirmation qu'après réponse « commande créée » du serveur.
**Aucune commande, même de test, n'a été créée.**

## 7. Tester et revenir en arrière
- **Tester** : ouvrir les liens d'aperçu du §1 (FR puis AR), sur téléphone et sur ordinateur, et suivre les scénarios du §3.
  En local : `cd outils-test && npm install && node serveur.js .. 4810 & node tests.js 4810`.
- **Revenir en arrière** : le thème actif n'a jamais été modifié. Il suffit de supprimer le thème `154694680737`
  (Boutique en ligne → Thèmes → ⋯ → Supprimer), ou de l'ignorer. Côté code, la branche `llufan-refonte-test`
  n'est pas fusionnée et peut être supprimée. `git revert` permet d'annuler un commit précis :
  - `9e6fd70` : formulaire, panier, variantes ;
  - `14ba028` : barre mobile ;
  - `cd460d9` : accessibilité ;
  - `1fbb997` : chiffres arabes.

  Le commit `af32d51` correspond exactement à la copie d'origine.
- **Fusion ou publication** : seulement après votre accord explicite.
