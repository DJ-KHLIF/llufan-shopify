# Relais COD LLUFAN — prototype et guide d'installation

> **Statut au 2026-10-07 : prototype en SIMULATION, non installé, non activé.**
> Il ne crée aucune commande tant que les deux verrous ne sont pas ouverts
> (`MODE = "production"` **et** `COMMANDES_REELLES = "oui"`), ce qui ne doit
> se faire qu'après l'accord écrit du marchand.

## 1. Pourquoi un relais

Le but : **un seul formulaire** sur le site (nom, téléphone, wilaya, commune,
mode, adresse si domicile), puis une **vraie commande Shopify**, sans étape
« caisse ».

- **Documentation Shopify :** la caisse est une page Shopify distincte. Même
  pré-remplie, la cliente doit la valider elle-même. Aucun paramètre ne permet
  de la passer.
- **Conséquence :** sans relais, le meilleur parcours possible = formulaire,
  puis **un clic de validation dans la caisse**. Le téléphone peut y être
  pré-rempli par l'option Storefront du thème (voir §9).
- **Avec le relais :** le formulaire envoie la commande au serveur, qui la crée
  dans Shopify. La cliente voit directement « Commande n° #1001 enregistrée »
  sur le site.

## 2. Ce qui est documenté, supposé ou testé

| Point | Statut | Source / preuve |
|---|---|---|
| `draftOrderCreate`, `draftOrderCalculate`, `draftOrderComplete`, lecture des variantes | **Documenté** + requêtes **validées** contre le schéma Admin | shopify.dev (Admin GraphQL) |
| Droits nécessaires : `read_products`, `write_draft_orders`, `read_orders` | **Documenté** (outil de validation Shopify) | — |
| Condition de paiement « Paiement à l'expédition » (`PaymentTermsTemplate/9`) → paiement en attente | Modèle **lu sur la boutique** ; effet « en attente » **documenté**, à **vérifier en test réel** | `paymentTermsTemplates` (lecture du 2026-10-07) |
| Statut attendu `PENDING` (« moyens de paiement manuels ») | **Documenté** (énumération `OrderDisplayFinancialStatus`) | — |
| Pas de clé d'idempotence pour les brouillons | **Documenté** : `@idempotent` n'est pas proposé pour ces mutations → anti-doublon fait par le relais | Schéma Admin |
| La finalisation réserve le stock | **Documenté** (note de `draftOrderComplete`) | — |
| Jeton « client credentials », valable 24 h ; app et boutique dans la **même organisation** Shopify | **Documenté** | shopify.dev, « Authenticate an app for stores in your organization » |
| Notifications client / équipe à la création | **Hypothèse** — à vérifier en test réel (voir §6) | — |
| Coûts d'hébergement | **Documenté** par Cloudflare (voir §8), à revérifier le jour de l'installation | developers.cloudflare.com |
| Logique du relais (doublons, réponses perdues, contrôles, Meta, données) | **Testée en simulation** : 30 tests, aucun appel réseau réel | `npm test` |
| Fonctionnement réel avec Shopify | **Non testé** (aucune commande créée, conformément à la consigne) | — |

## 3. Fonctionnement

```
Navigateur (formulaire)                 Relais (Cloudflare Worker)                 Shopify
  clé UUID + données  ── POST /commande ─▶ 1. validation (wilaya, commune, mode, adresse, tél.)
                                          2. limite de débit (IP hachée) + Turnstile
                                          3. clé réservée en base (anti-doublon)
                                          4. variantes : prix, actif, dispo, stock ── lecture ──▶
                                          5. total = articles + 700 ; doit = total affiché
                                          6. draftOrderCalculate : total Shopify = total attendu ─▶
                                          [simulation : arrêt ici, rien n'est créé]
                                          7. draftOrderCreate (étiquette relais-<clé>) ──────────▶
                                          8. draftOrderComplete → commande, statut PENDING ─────▶
                                          9. Meta « Purchase » (si consentement), une seule fois
  « Commande #1001 » ◀── 201 ────────────
  réponse perdue    ◀── 202 « incertain » → le navigateur interroge GET /commande/<clé>
```

**Règles qui ne changent pas :**

- Le navigateur n'envoie **aucun prix** pris en compte. Le serveur relit tout dans Shopify.
- Le stop-desk n'exige **pas d'adresse** et **n'invente aucune agence**. L'adresse de livraison devient « Stop-desk — <commune> », et l'agence est confirmée par téléphone.
- Le domicile exige une adresse de 5 à 250 caractères.
- La livraison coûte **700 DA** dans les deux modes (`TARIF_LIVRAISON`). Elle doit rester égale au tarif Shopify et au réglage du thème.
- Les taxes sont incluses dans les prix (réglage boutique `taxesIncluded: true`). Shopify recalcule tout, et le moindre écart arrête la commande **avant** sa création.
- **Aucun e-mail**, ni demandé ni inventé. Le contact se fait par téléphone (format +213…).
- Le relais ne marque **jamais** une commande comme payée. Si Shopify renvoie un autre statut que `PENDING`, l'état passe en `alerte_statut_paiement` et une alerte est journalisée.

## 4. Doublons et réponses perdues

| Situation | Comportement |
|---|---|
| Double clic, nouvel essai, deux onglets | Même clé → même résultat, **une seule** création (verrou en base) |
| Même clé, contenu modifié | Refus 409 |
| Création partie, réponse perdue | État `incertain`. Le relais **attend 2 min** (la recherche Shopify peut avoir du retard), puis cherche le brouillon par l'étiquette `relais-<clé>`. Trouvé : il le finalise. Absent : `a_renvoyer`, et la cliente renvoie avec la **même clé** |
| Finalisation partie, réponse perdue | `incertain` → l'état du brouillon est relu. Un brouillon ne donne **qu'une** commande |
| Résultat incertain | Le navigateur affiche « Nous vérifions votre commande » et interroge l'état. **Jamais de renvoi automatique vers la caisse** |

**Risque restant (documenté) :** si la recherche Shopify par étiquette prend plus de 2 min, un doublon reste possible dans le cas « création perdue ». Il est détecté (`ALERTE_DOUBLON` si 2 brouillons ont la même étiquette) mais pas empêché. Le délai se règle dans `delaiRechercheMs`.

## 5. Anti-spam et données personnelles

- **Origine :** seuls `llufan.com`, `www.llufan.com` et `vawqkk-ww.myshopify.com` sont acceptés.
- **Requêtes :** JSON uniquement, 8 Ko au maximum, 10 lignes et 10 unités par ligne au maximum.
- **Débit :** 8 demandes par 10 minutes par adresse IP. L'IP est **hachée avec un sel secret**, jamais stockée en clair, et effacée après 24 h.
- **Turnstile (Cloudflare) :** vérifié côté serveur. Sans secret, le relais refuse tout. ⚠️ **Tiers :** le widget Turnstile fait voir à Cloudflare l'IP et des signaux du navigateur de la visiteuse. À accepter explicitement, ou à remplacer par un autre contrôle.
- **Base du relais :** clé, empreinte, état, identifiants Shopify, total. **Aucun nom, téléphone, adresse ou IP en clair.** Purge automatique après 30 jours.
- **Journaux :** clé, état, motif. Jamais de donnée de la cliente.
- **Shopify :** seule la commande Shopify contient les données de la cliente.
- **Loi algérienne 18-07** (protection des données personnelles) : faire vérifier par un conseil les mentions d'information et la déclaration éventuelle. Ce guide ne remplace pas cet avis.

## 6. Stock et notifications (à vérifier en test réel)

- **Stock** (documenté) : la finalisation du brouillon réserve le stock. Le relais refuse aussi une quantité supérieure au stock quand la politique de la variante est « ne pas vendre en rupture ».
- **Notification à la cliente** (hypothèse) : sans e-mail, Shopify n'envoie probablement **aucune** confirmation. La confirmation est l'écran du site avec le numéro, puis l'appel de confirmation habituel en COD.
- **Notification à l'équipe** (hypothèse) : la notification « Nouvelle commande » de l'admin devrait se déclencher. À vérifier au premier test réel.
- **Client Shopify** (hypothèse) : une fiche client peut être créée ou associée à partir du téléphone. À vérifier.

## 7. Installation (à faire par le marchand, dans cet ordre)

> Les étapes 1 à 6 laissent le relais **en simulation** : aucune commande n'est possible.

1. **Application Shopify** (Dev Dashboard, dans la **même organisation** que la boutique) :
   - Créer l'app « LLUFAN relais COD ».
   - Version de l'app : droits `read_products`, `write_draft_orders`, `read_orders`, **rien d'autre**.
   - Installer l'app sur la boutique.
   - Noter le *Client ID* et le *Client secret*. Le secret reste côté serveur, jamais dans le thème ni dans Git.
2. **Compte Cloudflare** (offre gratuite) : installer `wrangler` sur un ordinateur, puis lancer `wrangler login`.
3. **Base de données :**
   - `wrangler d1 create llufan-relais-cod`
   - Copier l'identifiant dans `wrangler.toml`, à partir de `wrangler.toml.exemple`.
   - `wrangler d1 execute llufan-relais-cod --remote --file=schema.sql`
4. **Turnstile :** créer un widget pour `llufan.com` (mode « Managed »). Noter la clé de site (publique) et le secret.
5. **Secrets :**
   - `wrangler secret put SHOPIFY_CLIENT_ID`
   - `wrangler secret put SHOPIFY_CLIENT_SECRET`
   - `wrangler secret put TURNSTILE_SECRET`
   - `wrangler secret put SEL_IP` (une longue chaîne aléatoire)
   - En option : `META_PIXEL_ID`, `META_JETON`, `META_CODE_TEST`.
6. **Déploiement en simulation :** `wrangler deploy` (avec `MODE = "simulation"`), puis lancer les tests du §10.
7. **Intégration au thème** (sur un thème **de test**, non publié) :
   - Ajouter `integration-theme/relais-client.js` et le widget Turnstile.
   - Remplacer l'envoi vers la caisse par `LLUFAN_RELAIS.commander(...)`.
   - Garder le lien de panier actuel comme solution de repli **uniquement** quand le relais est hors service *avant* tout envoi. Jamais après un résultat incertain.
8. **Activation** (après **accord écrit** du marchand) : `MODE = "production"`, `COMMANDES_REELLES = "oui"`, `wrangler deploy`, puis une première commande test annoncée et annulée ensuite.

**Retour arrière** (immédiat) : remettre `MODE = "simulation"` et `wrangler deploy`. Le thème peut revenir au lien de panier.

## 8. Coûts et limites (vérifiés le 2026-10-07, à revérifier)

| Service | Offre | Limites utiles | Coût |
|---|---|---|---|
| Cloudflare Workers | Gratuite | 100 000 requêtes/jour, **10 ms de CPU par requête** | 0 $ |
| Cloudflare Workers | Payante | 10 M requêtes/mois incluses, 30 M ms CPU | **5 $/mois minimum** |
| Cloudflare D1 | Gratuite | 5 Go, 5 M lignes lues/jour, 100 000 lignes écrites/jour | 0 $ |
| Turnstile | Gratuite | Une source tierce cite 1 M de vérifications/mois | 0 $ |
| App Shopify (Dev Dashboard) | Incluse au plan Basic | Jeton renouvelé toutes les 24 h (fait par le relais) | 0 $ |

- **Volume estimé :** une commande ≈ 6 écritures et 4 lectures en base, plus 5 appels Shopify. Même 1 000 commandes par jour restent très loin des limites gratuites. Le temps d'attente réseau ne compte pas dans le CPU.
- **Risque :** la limite de **10 ms de CPU** de l'offre gratuite (lecture du fichier des 69 wilayas, hachages). Si des erreurs « CPU exceeded » (1102) apparaissent, passer à l'offre payante, soit 5 $/mois.
- **Stockage :** < 1 Mo par an au rythme prévu.

Sources : [Tarifs Workers](https://developers.cloudflare.com/workers/platform/pricing/) · [Turnstile](https://developers.cloudflare.com/use-cases/solutions/protect-sensitive-forms-fraud-abuse/) · [Jeton client credentials](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant) · [Dédoublonnage Meta](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)

## 9. Événement Meta « Purchase »

- **Envoi :** uniquement après une commande **créée et vérifiée** (`PENDING`), et uniquement si `Shopify.customerPrivacy.marketingAllowed()` est vrai dans le navigateur.
- **Un seul envoi** par commande (drapeau en base). Identifiant : `llufan-commande-<id>`.
- **Dédoublonnage :** le même identifiant est rendu au navigateur pour le pixel (`eventID`). Meta ne compte alors qu'un seul achat (fenêtre de 48 h).
- **Données envoyées :** téléphone et pays hachés (SHA-256), montant, devise, variantes. User-agent, `_fbp` et `_fbc` seulement avec consentement. Ni nom ni adresse.
- **À vérifier avant activation :** le canal Shopify « Facebook & Instagram » envoie peut-être déjà un « Purchase » pour les commandes. Si c'est le cas, **ne garder qu'une source**, sinon l'achat est compté deux fois (identifiants différents).
- **Commandes retrouvées après une réponse perdue :** pas d'envoi Meta (le relais ne conserve pas le téléphone).

## 10. Tests

- **Simulés** (ce dépôt) : `cd relais-cod && npm test`
  - 24 tests de logique (Shopify simulé en mémoire) ;
  - 6 tests du Worker complet (base SQLite réelle avec `schema.sql`, réseau simulé).
  - Ils vérifient notamment qu'**aucune écriture** n'est envoyée à Shopify en simulation.
- **Réels, en simulation, après l'étape 6** (aucune commande créée) :
  1. Envoyer une demande valide depuis le thème de test : la réponse doit être `simulation`, avec un total de 10 300 DA pour 3 × 3 200 DA.
  2. Modifier le total affiché dans les outils du navigateur : refus `total_affiche_different`.
  3. Choisir une variante épuisée : refus `variantes`.
  4. Stop-desk sans adresse : accepté. Domicile sans adresse : refus `adresse`.
  5. Neuf envois en 10 minutes : refus 429.
- **Réels, en production** (après accord écrit) : une commande test annoncée. Vérifier dans l'admin :
  - statut « Paiement en attente » ;
  - total ;
  - livraison à 700 DA ;
  - téléphone ;
  - attributs ;
  - stock ;
  - notifications.

  Puis l'annuler.
