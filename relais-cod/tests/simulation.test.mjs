/* Relais COD — tests en SIMULATION COMPLÈTE : Shopify, Meta et l'anti-spam
   sont simulés en mémoire. Aucune requête réseau, aucune commande réelle.
   Lancer : node --test relais-cod/tests/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerRelais } from '../src/relais.js';
import { stockageMemoire } from '../src/stockage.js';
import { ReponseIncertaine } from '../src/shopify.js';
import { telephoneE164 } from '../src/logique.js';

const donneesLivraison = JSON.parse(readFileSync(new URL('../../assets/llufan-livraison-dz.json', import.meta.url), 'utf8'));
const V = { bleu: '47934041358497', gris: '47934041424033', epuise: '47934041391265' };

/* ---------- Shopify simulé ---------- */
const fauxShopify = (opts = {}) => {
  const s = {
    appels: { creer: 0, finaliser: 0, calculer: 0 },
    brouillons: new Map(),
    numero: 1000,
    variantes: async (ids) => ids.map((id) => ({
      id: `gid://shopify/ProductVariant/${id}`, price: '3200.0', inventoryPolicy: 'DENY',
      inventoryQuantity: id === V.epuise ? 0 : (opts.stock ?? 50), availableForSale: id !== V.epuise,
      product: { status: 'ACTIVE', title: 'Nomad' },
    })),
    calculer: async (input) => {
      s.appels.calculer += 1;
      const sous = input.lineItems.reduce((t, l) => t + 3200 * l.quantity, 0);
      const total = sous + Number(input.shippingLine.priceWithCurrency.amount) + (opts.taxeAjoutee || 0);
      return { calculatedDraftOrder: { totalPriceSet: { shopMoney: { amount: `${total}.0`, currencyCode: 'DZD' } } }, userErrors: [] };
    },
    creer: async (input) => {
      s.appels.creer += 1;
      if (opts.creationPerdueSansEffet) { opts.creationPerdueSansEffet = false; throw new ReponseIncertaine('coupure'); }
      const id = `gid://shopify/DraftOrder/${s.appels.creer}`;
      const total = input.lineItems.reduce((t, l) => t + 3200 * l.quantity, 0) + Number(input.shippingLine.priceWithCurrency.amount);
      s.brouillons.set(id, { id, status: 'OPEN', tags: input.tags, input, total, order: null });
      if (opts.creationPerdueAvecEffet) { opts.creationPerdueAvecEffet = false; throw new ReponseIncertaine('réponse perdue'); }
      return { draftOrder: { id, status: 'OPEN' }, userErrors: [] };
    },
    finaliser: async (id) => {
      s.appels.finaliser += 1;
      const b = s.brouillons.get(id);
      if (b.status === 'COMPLETED') return { draftOrder: null, userErrors: [{ message: 'déjà finalisé' }] };
      s.numero += 1;
      b.status = 'COMPLETED';
      b.order = { id: `gid://shopify/Order/${s.numero}`, legacyResourceId: String(s.numero), name: `#${s.numero}`, displayFinancialStatus: opts.statutPaiement || 'PENDING', totalPriceSet: { shopMoney: { amount: `${b.total}.0` } } };
      if (opts.finalisationPerdue) { opts.finalisationPerdue = false; throw new ReponseIncertaine('réponse perdue'); }
      return { draftOrder: { id, status: 'COMPLETED', order: b.order }, userErrors: [] };
    },
    etat: async (id) => s.brouillons.get(id) || null,
    parEtiquette: async (etiquette) => [...s.brouillons.values()].filter((b) => b.tags.includes(etiquette)),
  };
  return s;
};

/* ---------- Banc ---------- */
const banc = ({ mode = 'production', reelles = true, antiSpam = true, shopify = {}, meta = true } = {}) => {
  let maintenant = Date.UTC(2026, 9, 7, 12);
  const sh = fauxShopify(shopify);
  const stockage = stockageMemoire();
  const metaEnvois = [];
  const journal = [];
  const relais = creerRelais({
    config: {
      mode, commandesReelles: reelles, donneesLivraison, tarifLivraison: 700, devise: 'DZD',
      libelleDomicile: 'Livraison à domicile', libelleStopDesk: 'Livraison en stop-desk', etiquette: 'cod-relais',
      conditionsPaiementId: 'gid://shopify/PaymentTermsTemplate/9', maxLignes: 10, maxQuantite: 10, maxParFenetre: 8,
      verrouMs: 60000, delaiRechercheMs: 120000,
      metaPixelId: meta ? 'PIXEL' : '', metaJeton: meta ? 'JETON' : '', metaVersion: 'v23.0', metaCodeTest: '',
    },
    shopify: sh, stockage,
    verifierAntiSpam: async () => antiSpam,
    horloge: () => maintenant,
    journal: (t, d) => journal.push({ t, ...d }),
    envoyerMeta: async ({ commande, resultat }) => { metaEnvois.push({ commande, resultat }); return 'x'; },
  });
  return { relais, sh, stockage, metaEnvois, journal, avancer: (ms) => { maintenant += ms; } };
};
const ctx = { ipHache: 'ip1' };
let n = 0;
const cle = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const demande = (extra = {}) => ({
  cle: cle(), lignes: [{ variante: V.gris, quantite: 3 }], nom: 'Test Simulation', telephone: '0555 12 34 56',
  wilaya: '16 - Alger', commune: 'Bab El Oued', mode: 'domicile', adresse: 'Rue de test, cité exemple',
  langue: 'fr', totalAffiche: 10300, consentementMarketing: false, antiSpam: 'ok', ...extra,
});

/* ---------- Validation ---------- */
test('téléphone : formats algériens acceptés, autres refusés', () => {
  assert.equal(telephoneE164('0555 12 34 56'), '+213555123456');
  assert.equal(telephoneE164('00213 661 23 45 67'), '+213661234567');
  assert.equal(telephoneE164('+213 21 23 45 67'), '+21321234567');
  assert.equal(telephoneE164('+33 6 12 34 56 78'), null);
  assert.equal(telephoneE164('0812345678'), null);
});

test('domicile sans adresse → refus 400, rien créé', async () => {
  const b = banc();
  const r = await b.relais.traiter(demande({ adresse: '' }), ctx);
  assert.equal(r.statut, 400); assert.deepEqual(r.corps.champs, ['adresse']); assert.equal(b.sh.appels.creer, 0);
});

test('wilaya ou commune inconnue → refus 400', async () => {
  const b = banc();
  assert.deepEqual((await b.relais.traiter(demande({ wilaya: '99 - Inventée' }), ctx)).corps.champs, ['wilaya']);
  assert.deepEqual((await b.relais.traiter(demande({ commune: 'Inventée' }), ctx)).corps.champs, ['commune']);
});

/* ---------- Simulation ---------- */
test('mode simulation : total 9 600 + 700 = 10 300, AUCUNE écriture Shopify', async () => {
  const b = banc({ mode: 'simulation' });
  const r = await b.relais.traiter(demande(), ctx);
  assert.equal(r.statut, 200); assert.equal(r.corps.etat, 'simulation'); assert.equal(r.corps.total, 10300);
  assert.equal(b.sh.appels.creer, 0); assert.equal(b.sh.appels.finaliser, 0);
  const p = r.corps.brouillonPrevu;
  assert.equal(p.shippingLine.priceWithCurrency.amount, '700.00');
  assert.equal(p.paymentTerms.paymentTermsTemplateId, 'gid://shopify/PaymentTermsTemplate/9');
  assert.equal(p.phone, '+213555123456'); assert.equal(p.shippingAddress.phone, '+213555123456');
  assert.ok(!('email' in p), 'aucun e-mail');
});
test('production SANS le 2e verrou (COMMANDES_REELLES ≠ oui) → reste en simulation', async () => {
  const b = banc({ mode: 'production', reelles: false });
  const r = await b.relais.traiter(demande(), ctx);
  assert.equal(r.corps.etat, 'simulation'); assert.equal(b.sh.appels.creer, 0);
});
test('stop-desk : adresse non exigée, non transmise, aucune agence inventée', async () => {
  const b = banc({ mode: 'simulation' });
  const r = await b.relais.traiter(demande({ mode: 'stop-desk', adresse: '' }), ctx);
  const p = r.corps.brouillonPrevu;
  assert.equal(p.shippingAddress.address1, 'Stop-desk — Bab El Oued');
  assert.ok(!p.customAttributes.some((a) => a.key === 'Adresse'));
  assert.equal(p.shippingLine.priceWithCurrency.amount, '700.00');
});

/* ---------- Contrôles serveur ---------- */
test('total affiché faux (prix modifié dans le navigateur) → refus, total serveur renvoyé', async () => {
  const b = banc();
  const r = await b.relais.traiter(demande({ totalAffiche: 1000 }), ctx);
  assert.equal(r.statut, 409); assert.equal(r.corps.motif, 'total_affiche_different'); assert.equal(r.corps.total, 10300);
  assert.equal(b.sh.appels.creer, 0);
});
test('variante épuisée → refus, rien créé', async () => {
  const b = banc();
  const r = await b.relais.traiter(demande({ lignes: [{ variante: V.epuise, quantite: 1 }], totalAffiche: null }), ctx);
  assert.equal(r.statut, 409); assert.equal(r.corps.details[0].motif, 'indisponible'); assert.equal(b.sh.appels.creer, 0);
});
test('stock insuffisant → refus avec quantité disponible', async () => {
  const b = banc({ shopify: { stock: 2 } });
  const r = await b.relais.traiter(demande(), ctx);
  assert.equal(r.corps.details[0].motif, 'stock_insuffisant'); assert.equal(r.corps.details[0].disponible, 2);
});
test('total recalculé par Shopify différent (ex. taxe ajoutée) → refus AVANT création', async () => {
  const b = banc({ shopify: { taxeAjoutee: 150 } });
  const r = await b.relais.traiter(demande(), ctx);
  assert.equal(r.corps.motif, 'total_shopify_different'); assert.equal(b.sh.appels.creer, 0);
  assert.ok(b.journal.some((j) => j.t === 'ECART_TOTAL'));
});

/* ---------- Création, doublons ---------- */
test('production : une commande, paiement en attente, numéro renvoyé', async () => {
  const b = banc();
  const r = await b.relais.traiter(demande(), ctx);
  assert.equal(r.statut, 201); assert.equal(r.corps.etat, 'commande_creee'); assert.equal(r.corps.numero, '#1001'); assert.equal(r.corps.total, 10300);
  assert.equal(b.sh.appels.creer, 1); assert.equal(b.sh.appels.finaliser, 1);
});
test('même clé renvoyée (double clic, nouvel essai) → même commande, aucune nouvelle création', async () => {
  const b = banc(); const d = demande();
  const r1 = await b.relais.traiter(d, ctx); const r2 = await b.relais.traiter(d, ctx);
  assert.equal(r1.corps.numero, r2.corps.numero); assert.equal(b.sh.appels.creer, 1);
});
test('deux envois simultanés de la même clé → une seule création', async () => {
  const b = banc(); const d = demande();
  const [r1, r2] = await Promise.all([b.relais.traiter(d, ctx), b.relais.traiter(d, ctx)]);
  assert.equal(b.sh.appels.creer, 1);
  assert.ok([r1.corps.etat, r2.corps.etat].includes('commande_creee'));
});
test('même clé, contenu différent → refus 409', async () => {
  const b = banc(); const d = demande();
  await b.relais.traiter(d, ctx);
  const r = await b.relais.traiter({ ...d, lignes: [{ variante: V.bleu, quantite: 1 }], totalAffiche: 3900 }, ctx);
  assert.equal(r.statut, 409); assert.equal(r.corps.etat, 'cle_deja_utilisee');
});

/* ---------- Réponses perdues ---------- */
test('création appliquée mais réponse perdue → « incertain », attente, puis brouillon retrouvé et finalisé UNE fois', async () => {
  const b = banc({ shopify: { creationPerdueAvecEffet: true } }); const d = demande();
  const r1 = await b.relais.traiter(d, ctx);
  assert.equal(r1.statut, 202); assert.equal(r1.corps.etat, 'incertain');
  assert.equal((await b.relais.statut(d.cle)).corps.etat, 'incertain', 'pas de conclusion avant le délai de recherche');
  assert.equal((await b.relais.traiter(d, ctx)).corps.etat, 'incertain', 'un nouvel essai ne recrée rien');
  b.avancer(121000);
  const r2 = await b.relais.statut(d.cle);
  assert.equal(r2.corps.etat, 'commande_creee'); assert.equal(b.sh.appels.creer, 1); assert.equal(b.sh.appels.finaliser, 1);
});
test('création NON appliquée et réponse perdue → après le délai, « a_renvoyer », puis une seule commande', async () => {
  const b = banc({ shopify: { creationPerdueSansEffet: true } }); const d = demande();
  assert.equal((await b.relais.traiter(d, ctx)).corps.etat, 'incertain');
  b.avancer(121000);
  assert.equal((await b.relais.statut(d.cle)).corps.etat, 'a_renvoyer');
  const r = await b.relais.traiter(d, ctx);
  assert.equal(r.corps.etat, 'commande_creee'); assert.equal(b.sh.brouillons.size, 1);
});
test('finalisation appliquée mais réponse perdue → « incertain », puis commande retrouvée sans 2e finalisation', async () => {
  const b = banc({ shopify: { finalisationPerdue: true } }); const d = demande();
  assert.equal((await b.relais.traiter(d, ctx)).corps.etat, 'incertain');
  const r = await b.relais.statut(d.cle);
  assert.equal(r.corps.etat, 'commande_creee'); assert.equal(r.corps.numero, '#1001'); assert.equal(b.sh.appels.finaliser, 1);
});

/* ---------- Paiement ---------- */
test('statut de paiement ≠ PENDING (ex. PAID) → état d\'alerte, journalisé, pas d\'événement Meta', async () => {
  const b = banc({ shopify: { statutPaiement: 'PAID' } });
  const r = await b.relais.traiter(demande({ consentementMarketing: true }), ctx);
  assert.equal(r.corps.etat, 'alerte_statut_paiement'); assert.equal(b.metaEnvois.length, 0);
  assert.ok(b.journal.some((j) => j.t === 'ALERTE'));
});

/* ---------- Meta ---------- */
test('Meta : rien sans consentement', async () => {
  const b = banc(); await b.relais.traiter(demande({ consentementMarketing: false }), ctx);
  assert.equal(b.metaEnvois.length, 0);
});
test('Meta : un seul envoi après création confirmée, même si la clé est renvoyée ; eventId renvoyé au navigateur', async () => {
  const b = banc(); const d = demande({ consentementMarketing: true });
  const r = await b.relais.traiter(d, ctx); await b.relais.traiter(d, ctx);
  assert.equal(b.metaEnvois.length, 1); assert.equal(r.corps.eventId, 'llufan-commande-1001');
});
test('Meta : rien en simulation', async () => {
  const b = banc({ mode: 'simulation' }); await b.relais.traiter(demande({ consentementMarketing: true }), ctx);
  assert.equal(b.metaEnvois.length, 0);
});

/* ---------- Anti-spam, débit, données ---------- */
test('anti-spam refusé → 403, aucune clé réservée', async () => {
  const b = banc({ antiSpam: false });
  const r = await b.relais.traiter(demande(), ctx);
  assert.equal(r.statut, 403); assert.equal(b.stockage.demandes.size, 0);
});
test('plus de 8 demandes en 10 min depuis la même IP → 429', async () => {
  const b = banc({ mode: 'simulation' });
  for (let i = 0; i < 8; i += 1) await b.relais.traiter(demande(), ctx);
  assert.equal((await b.relais.traiter(demande(), ctx)).statut, 429);
});
test('base du relais : aucune donnée personnelle (ni nom, ni téléphone, ni adresse)', async () => {
  const b = banc(); await b.relais.traiter(demande(), ctx);
  const brut = JSON.stringify([...b.stockage.demandes.values()]);
  for (const interdit of ['Test Simulation', '555', 'Rue de test', 'Bab El Oued']) assert.ok(!brut.includes(interdit), interdit);
});
