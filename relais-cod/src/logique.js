/* Relais COD LLUFAN — règles pures (sans réseau), testables hors Cloudflare.
   Toute valeur venant du navigateur est considérée comme non fiable : le
   serveur recalcule variantes, prix, livraison, total et refuse ce qui ne
   correspond pas. */

export const ETATS = Object.freeze({
  RECU: 'recu',                       // clé réservée, rien créé dans Shopify
  SIMULATION: 'simulation',           // mode simulation : rien créé, résultat calculé
  BROUILLON: 'brouillon_cree',        // brouillon créé, pas encore finalisé
  INCERTAIN: 'incertain',             // réponse Shopify perdue : à vérifier
  COMMANDE: 'commande_creee',         // commande créée et vérifiée (paiement en attente)
  ALERTE: 'alerte_statut_paiement',   // commande créée mais statut ≠ PENDING : à examiner
  REFUSE: 'refuse',                   // refus métier (stock, total…) : rien créé
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_VARIANTE = /^\d{6,20}$/;

/* Numéro algérien → format E.164 exigé par Shopify (+213…).
   Mobiles : 05/06/07 + 8 chiffres ; fixes : 0 + 8 chiffres. */
export const telephoneE164 = (brut) => {
  const s = String(brut || '').replace(/[\s.()-]/g, '');
  if (/^\+213([5-7]\d{8}|[1-4]\d{7})$/.test(s)) return s;
  if (/^00213([5-7]\d{8}|[1-4]\d{7})$/.test(s)) return `+${s.slice(2)}`;
  if (/^0([5-7]\d{8}|[1-4]\d{7})$/.test(s)) return `+213${s.slice(1)}`;
  return null;
};

const texte = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/* Validation et normalisation de la demande.
   `donnees` = llufan-livraison-dz.json (même fichier que le thème). */
export const valider = (corps, donnees, config) => {
  const erreurs = [];
  const c = corps && typeof corps === 'object' ? corps : {};
  if (!UUID.test(String(c.cle || ''))) erreurs.push('cle');

  const lignesBrutes = Array.isArray(c.lignes) ? c.lignes : [];
  if (lignesBrutes.length < 1 || lignesBrutes.length > config.maxLignes) erreurs.push('lignes');
  const parVariante = new Map();
  for (const l of lignesBrutes.slice(0, config.maxLignes)) {
    const id = String(l && l.variante || '');
    const q = Number(l && l.quantite);
    if (!ID_VARIANTE.test(id) || !Number.isInteger(q) || q < 1 || q > config.maxQuantite) { erreurs.push('lignes'); break; }
    parVariante.set(id, (parVariante.get(id) || 0) + q);
  }
  const lignes = [...parVariante].map(([variante, quantite]) => ({ variante, quantite }))
    .sort((a, b) => a.variante.localeCompare(b.variante));
  if (lignes.some((l) => l.quantite > config.maxQuantite)) erreurs.push('lignes');

  const nom = texte(c.nom, 80);
  if (nom.length < 2) erreurs.push('nom');
  const telephone = telephoneE164(c.telephone);
  if (!telephone) erreurs.push('telephone');

  const wilaya = donnees.wilayas.find((w) => `${w.code} - ${w.nom}` === String(c.wilaya || ''));
  if (!wilaya) erreurs.push('wilaya');
  const commune = wilaya ? wilaya.communes.map((x) => x.replace('*', '')).find((x) => x === String(c.commune || '')) : null;
  if (wilaya && !commune) erreurs.push('commune');

  const mode = c.mode === 'domicile' || c.mode === 'stop-desk' ? c.mode : null;
  if (!mode) erreurs.push('mode');
  /* Adresse : obligatoire à domicile, ignorée en stop-desk (aucune agence n'est
     inventée : le colis est retiré à l'agence de la commune choisie, que le
     marchand confirme par téléphone). */
  const adresse = mode === 'domicile' ? texte(c.adresse, 250) : '';
  if (mode === 'domicile' && adresse.length < 5) erreurs.push('adresse');

  const langue = c.langue === 'ar' ? 'ar' : 'fr';
  const totalAffiche = Number.isFinite(Number(c.totalAffiche)) ? Math.round(Number(c.totalAffiche)) : null;

  if (erreurs.length) return { ok: false, erreurs: [...new Set(erreurs)] };
  return {
    ok: true,
    commande: {
      cle: String(c.cle).toLowerCase(), lignes, nom, telephone,
      wilaya: `${wilaya.code} - ${wilaya.nom}`, commune, mode, adresse, langue,
    },
    totalAffiche,
    consentementMarketing: c.consentementMarketing === true,
  };
};

/* Empreinte de la demande : la même clé avec un contenu différent est refusée. */
export const empreinte = async (commande) => {
  const octets = new TextEncoder().encode(JSON.stringify(commande));
  const h = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/* Montants : Shopify renvoie des chaînes décimales (« 3200.0 ») → centimes entiers. */
export const centimes = (montant) => Math.round(Number(montant) * 100);

/* Contrôle serveur des variantes : existence, produit actif, disponibilité, stock. */
export const controlerVariantes = (lignes, noeuds) => {
  const parId = new Map((noeuds || []).filter(Boolean).map((n) => [String(n.id).split('/').pop(), n]));
  const problemes = [];
  let sousTotal = 0;
  for (const l of lignes) {
    const v = parId.get(l.variante);
    if (!v) { problemes.push({ variante: l.variante, motif: 'inconnue' }); continue; }
    if (!v.product || v.product.status !== 'ACTIVE') { problemes.push({ variante: l.variante, motif: 'produit_inactif' }); continue; }
    if (!v.availableForSale) { problemes.push({ variante: l.variante, motif: 'indisponible' }); continue; }
    if (v.inventoryPolicy === 'DENY' && typeof v.inventoryQuantity === 'number' && v.inventoryQuantity < l.quantite) {
      problemes.push({ variante: l.variante, motif: 'stock_insuffisant', disponible: Math.max(0, v.inventoryQuantity) });
      continue;
    }
    sousTotal += centimes(v.price) * l.quantite;
  }
  return { problemes, sousTotal };
};

/* Brouillon de commande Shopify (draftOrderCreate / draftOrderCalculate).
   - prix : ceux de Shopify (aucun prix envoyé par le navigateur n'est utilisé) ;
   - livraison : tarif provisoire unique, le même pour les deux modes ;
   - paiement : conditions « Paiement à l'expédition » → commande en attente de
     paiement, jamais marquée payée ;
   - aucun e-mail : le téléphone sert de contact. */
export const brouillon = (commande, config) => {
  const [prenom, ...reste] = commande.nom.split(' ');
  const domicile = commande.mode === 'domicile';
  return {
    lineItems: commande.lignes.map((l) => ({ variantId: `gid://shopify/ProductVariant/${l.variante}`, quantity: l.quantite })),
    phone: commande.telephone,
    shippingAddress: {
      firstName: prenom,
      lastName: reste.join(' ') || prenom,
      address1: domicile ? commande.adresse : `Stop-desk — ${commande.commune}`,
      address2: commande.wilaya,
      city: commande.commune,
      countryCode: 'DZ',
      phone: commande.telephone,
    },
    shippingLine: {
      title: domicile ? config.libelleDomicile : config.libelleStopDesk,
      priceWithCurrency: { amount: (config.tarifLivraison).toFixed(2), currencyCode: config.devise },
    },
    customAttributes: [
      { key: 'Nom complet', value: commande.nom },
      { key: 'Téléphone', value: commande.telephone },
      { key: 'Wilaya', value: commande.wilaya },
      { key: 'Commune', value: commande.commune },
      { key: 'Type de livraison', value: domicile ? 'Domicile' : 'Stop-desk' },
      ...(domicile ? [{ key: 'Adresse', value: commande.adresse }] : []),
      { key: 'Langue', value: commande.langue },
    ],
    tags: [config.etiquette, `relais-${commande.cle}`],
    paymentTerms: { paymentTermsTemplateId: config.conditionsPaiementId },
    presentmentCurrencyCode: config.devise,
    acceptAutomaticDiscounts: false,
  };
};

export const totalAttendu = (sousTotalCentimes, config) => sousTotalCentimes + Math.round(config.tarifLivraison * 100);
