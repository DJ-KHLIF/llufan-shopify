/* Worker complet en SIMULATION : vraie base SQLite (même moteur que D1, via
   node:sqlite) avec schema.sql, réseau entièrement simulé (fetch remplacé).
   Vérifie les routes, l'origine, les limites, et qu'AUCUNE écriture
   (draftOrderCreate / draftOrderComplete) n'est envoyée à Shopify. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from './construire.mjs';

/* Adaptateur D1 minimal au-dessus de SQLite. */
const d1 = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    db,
    prepare(sql) {
      const st = db.prepare(sql);
      let params = [];
      const o = {
        bind(...p) { params = p; return o; },
        async run() { const r = st.run(...params); return { meta: { changes: Number(r.changes) } }; },
        async first() { return st.get(...params) ?? null; },
      };
      return o;
    },
  };
};

const ORIGINE = 'https://llufan.com';
const env = (extra = {}) => ({
  MODE: 'simulation', COMMANDES_REELLES: 'non', SHOPIFY_BOUTIQUE: 'boutique-test.myshopify.com',
  SHOPIFY_CLIENT_ID: 'id', SHOPIFY_CLIENT_SECRET: 'secret', TURNSTILE_SECRET: 'turnstile', SEL_IP: 'sel',
  ORIGINES_AUTORISEES: `${ORIGINE},https://www.llufan.com`, DB: d1(), ...extra,
});

/* Réseau simulé : jeton, GraphQL (lecture + calcul), Turnstile. */
const requetes = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const corps = typeof init.body === 'string' ? init.body : String(init.body || '');
  requetes.push({ u, corps });
  const rep = (d) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.includes('/admin/oauth/access_token')) return rep({ access_token: 'jeton-temporaire', expires_in: 86399 });
  if (u.includes('turnstile')) return rep({ success: new URLSearchParams(corps).get('response') === 'ok' });
  if (u.includes('/graphql.json')) {
    const q = JSON.parse(corps).query;
    if (q.includes('nodes(ids')) return rep({ data: { nodes: JSON.parse(corps).variables.ids.map((id) => ({ id, price: '3200.0', availableForSale: true, inventoryPolicy: 'DENY', inventoryQuantity: 20, product: { status: 'ACTIVE' } })) } });
    if (q.includes('draftOrderCalculate')) {
      const inp = JSON.parse(corps).variables.input;
      const t = inp.lineItems.reduce((s, l) => s + 3200 * l.quantity, 0) + Number(inp.shippingLine.priceWithCurrency.amount);
      return rep({ data: { draftOrderCalculate: { calculatedDraftOrder: { totalPriceSet: { shopMoney: { amount: `${t}.0`, currencyCode: 'DZD' } } }, userErrors: [] } } });
    }
    return rep({ data: {} });
  }
  throw new Error(`requête réseau inattendue : ${u}`);
};

const worker = await build();
const appel = (e, { methode = 'POST', chemin = '/commande', origine = ORIGINE, corps, type = 'application/json' } = {}) =>
  worker.fetch(new Request(`https://relais.exemple${chemin}`, {
    method: methode,
    headers: { Origin: origine, 'Content-Type': type, 'CF-Connecting-IP': '198.51.100.7' },
    body: methode === 'POST' ? (typeof corps === 'string' ? corps : JSON.stringify(corps)) : undefined,
  }), e);
const demande = (x = {}) => ({
  cle: '11111111-1111-4111-8111-111111111111', lignes: [{ variante: '47934041424033', quantite: 3 }],
  nom: 'Test Simulation', telephone: '0555123456', wilaya: '16 - Alger', commune: 'Bab El Oued',
  mode: 'domicile', adresse: 'Rue de test', totalAffiche: 10300, antiSpam: 'ok', ...x,
});

test('origine non autorisée → 403', async () => {
  assert.equal((await appel(env(), { origine: 'https://pirate.exemple', corps: demande() })).status, 403);
});
test('type de contenu ou taille invalides → 415 / 413', async () => {
  assert.equal((await appel(env(), { type: 'text/plain', corps: demande() })).status, 415);
  assert.equal((await appel(env(), { corps: JSON.stringify({ ...demande(), bourrage: 'x'.repeat(9000) }) })).status, 413);
});
test('anti-spam refusé → 403', async () => {
  assert.equal((await appel(env(), { corps: demande({ antiSpam: 'faux' }) })).status, 403);
});
test('simulation de bout en bout : 10 300 DA calculés, aucune écriture envoyée à Shopify, base sans donnée personnelle', async () => {
  requetes.length = 0;
  const e = env();
  const r = await appel(e, { corps: demande() });
  const d = await r.json();
  assert.equal(r.status, 200); assert.equal(d.etat, 'simulation'); assert.equal(d.total, 10300);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGINE);
  const ecritures = requetes.filter((q) => /draftOrderCreate|draftOrderComplete/.test(q.corps));
  assert.equal(ecritures.length, 0, 'écriture envoyée en simulation');
  const lignes = e.DB.db.prepare('SELECT * FROM demandes').all();
  assert.equal(lignes.length, 1); assert.equal(lignes[0].etat, 'simulation');
  assert.ok(!JSON.stringify(lignes).includes('555'), 'téléphone stocké');
  const debit = e.DB.db.prepare('SELECT * FROM debit').all();
  assert.ok(!JSON.stringify(debit).includes('198.51.100.7'), 'IP stockée en clair');
  const statut = await (await appel(e, { methode: 'GET', chemin: `/commande/${demande().cle}` })).json();
  assert.equal(statut.etat, 'simulation');
});
test('même en MODE=production, sans COMMANDES_REELLES=oui → simulation, aucune écriture', async () => {
  requetes.length = 0;
  const r = await appel(env({ MODE: 'production' }), { corps: demande({ cle: '22222222-2222-4222-8222-222222222222' }) });
  assert.equal((await r.json()).etat, 'simulation');
  assert.equal(requetes.filter((q) => /draftOrderCreate|draftOrderComplete/.test(q.corps)).length, 0);
});
test('purge planifiée : SQL valide sur le schéma', async () => {
  const e = env();
  await worker.scheduled({}, e);
});
