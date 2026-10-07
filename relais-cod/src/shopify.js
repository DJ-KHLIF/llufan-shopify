/* Accès à l'API Admin de Shopify (côté serveur uniquement).
   Jeton : « client credentials » d'une application créée dans le Dev Dashboard
   (jeton valable 24 h, renouvelé ici automatiquement). Le secret ne quitte
   jamais le serveur. Droits minimums : read_products, write_draft_orders,
   read_orders. */

const OPERATIONS = {
  variantes: `query Variantes($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id title price availableForSale inventoryPolicy inventoryQuantity product { id title status } } } }`,
  calculer: `mutation Calculer($input: DraftOrderInput!) { draftOrderCalculate(input: $input) { calculatedDraftOrder { totalPriceSet { shopMoney { amount currencyCode } } subtotalPriceSet { shopMoney { amount } } totalShippingPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } taxesIncluded } userErrors { field message } } }`,
  creer: `mutation Creer($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name status totalPriceSet { shopMoney { amount currencyCode } } } userErrors { field message } } }`,
  finaliser: `mutation Finaliser($id: ID!) { draftOrderComplete(id: $id) { draftOrder { id status order { id name legacyResourceId displayFinancialStatus totalPriceSet { shopMoney { amount currencyCode } } } } userErrors { field message } } }`,
  etat: `query Etat($id: ID!) { draftOrder(id: $id) { id status order { id name legacyResourceId displayFinancialStatus totalPriceSet { shopMoney { amount } } } } }`,
  parEtiquette: `query ParEtiquette($q: String!) { draftOrders(first: 5, query: $q) { nodes { id status tags order { id name legacyResourceId displayFinancialStatus totalPriceSet { shopMoney { amount } } } } } }`,
};

/* Erreur dont on ignore si Shopify a appliqué l'opération (délai, coupure). */
export class ReponseIncertaine extends Error {}

export const clientShopify = ({ boutique, clientId, clientSecret, versionApi, delaiMs = 10000, fetch: f = fetch }) => {
  let jeton = null;
  let expire = 0;

  const obtenirJeton = async () => {
    if (jeton && Date.now() < expire - 5 * 60 * 1000) return jeton;
    const r = await f(`https://${boutique}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    if (!r.ok) throw new Error(`jeton refusé (${r.status})`);
    const d = await r.json();
    jeton = d.access_token;
    expire = Date.now() + (Number(d.expires_in) || 86399) * 1000;
    return jeton;
  };

  const appeler = async (nom, variables, { ecriture = false } = {}) => {
    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(), delaiMs);
    let r;
    try {
      r = await f(`https://${boutique}/admin/api/${versionApi}/graphql.json`, {
        method: 'POST',
        signal: controle.signal,
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await obtenirJeton() },
        body: JSON.stringify({ query: OPERATIONS[nom], variables }),
      });
    } catch (e) {
      /* Écriture partie mais réponse jamais reçue : on ne sait pas si elle a eu lieu. */
      if (ecriture) throw new ReponseIncertaine(`${nom} : ${e.message}`);
      throw e;
    } finally {
      clearTimeout(minuterie);
    }
    if (r.status >= 500 && ecriture) throw new ReponseIncertaine(`${nom} : HTTP ${r.status}`);
    if (!r.ok) throw new Error(`${nom} : HTTP ${r.status}`);
    const d = await r.json();
    if (d.errors && d.errors.length) throw new Error(`${nom} : ${d.errors.map((e) => e.message).join(' ; ')}`);
    return d.data;
  };

  return {
    variantes: async (ids) => (await appeler('variantes', { ids: ids.map((id) => `gid://shopify/ProductVariant/${id}`) })).nodes,
    calculer: async (input) => (await appeler('calculer', { input })).draftOrderCalculate,
    creer: async (input) => (await appeler('creer', { input }, { ecriture: true })).draftOrderCreate,
    finaliser: async (id) => (await appeler('finaliser', { id }, { ecriture: true })).draftOrderComplete,
    etat: async (id) => (await appeler('etat', { id })).draftOrder,
    parEtiquette: async (etiquette) => (await appeler('parEtiquette', { q: `tag:'${etiquette}'` })).draftOrders.nodes,
  };
};
