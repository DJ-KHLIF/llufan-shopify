/* Relais COD LLUFAN — point d'entrée Cloudflare Workers.
   Routes :
     POST /commande          corps JSON (≤ 8 Ko) → création (ou simulation)
     GET  /commande/<clé>    état d'une demande (reprise après réponse perdue)
   Secrets (wrangler secret put) : SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET,
   TURNSTILE_SECRET, SEL_IP, et en option META_PIXEL_ID, META_JETON.
   Écritures dans Shopify UNIQUEMENT si MODE = "production" ET
   COMMANDES_REELLES = "oui". Toute autre valeur = simulation. */
import donneesLivraison from '../../assets/llufan-livraison-dz.json';
import { creerRelais } from './relais.js';
import { clientShopify } from './shopify.js';
import { stockageD1 } from './stockage.js';

const configDe = (env) => ({
  mode: env.MODE === 'production' ? 'production' : 'simulation',
  commandesReelles: env.COMMANDES_REELLES === 'oui',
  donneesLivraison,
  tarifLivraison: Number(env.TARIF_LIVRAISON || 700),
  devise: 'DZD',
  libelleDomicile: env.LIBELLE_DOMICILE || 'Livraison à domicile',
  libelleStopDesk: env.LIBELLE_STOP_DESK || 'Livraison en stop-desk',
  etiquette: 'cod-relais',
  conditionsPaiementId: env.CONDITIONS_PAIEMENT_ID || 'gid://shopify/PaymentTermsTemplate/9', // « Paiement à l'expédition » (lu sur la boutique le 2026-10-07)
  maxLignes: 10,
  maxQuantite: 10,
  maxParFenetre: Number(env.MAX_PAR_10_MIN || 8),
  verrouMs: 60 * 1000,
  delaiRechercheMs: 2 * 60 * 1000,
  metaPixelId: env.META_PIXEL_ID || '',
  metaJeton: env.META_JETON || '',
  metaVersion: env.META_API_VERSION || 'v23.0',
  metaCodeTest: env.META_CODE_TEST || '',
});

const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

const verifierTurnstile = (env) => async (jeton, contexte) => {
  if (!env.TURNSTILE_SECRET) return false; // pas de secret = refus (jamais d'ouverture par défaut)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(jeton || ''), remoteip: contexte.ip }),
  });
  const d = await r.json().catch(() => ({}));
  return d.success === true;
};

export default {
  async fetch(requete, env) {
    const origines = String(env.ORIGINES_AUTORISEES || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origine = requete.headers.get('Origin') || '';
    const cors = origines.includes(origine) ? { 'Access-Control-Allow-Origin': origine, Vary: 'Origin' } : {};
    const json = (statut, corps) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });

    if (requete.method === 'OPTIONS') {
      return new Response(null, { status: origines.includes(origine) ? 204 : 403, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } });
    }
    if (!origines.includes(origine)) return json(403, { etat: 'origine_refusee' });

    const config = configDe(env);
    const ip = requete.headers.get('CF-Connecting-IP') || '';
    const relais = creerRelais({
      config,
      shopify: clientShopify({ boutique: env.SHOPIFY_BOUTIQUE, clientId: env.SHOPIFY_CLIENT_ID, clientSecret: env.SHOPIFY_CLIENT_SECRET, versionApi: env.SHOPIFY_API_VERSION || '2026-07' }),
      stockage: stockageD1(env.DB),
      verifierAntiSpam: verifierTurnstile(env),
      journal: (type, donnees) => console.log(JSON.stringify({ type, ...donnees })), // jamais de nom, téléphone ou adresse
    });

    const url = new URL(requete.url);
    if (requete.method === 'GET' && url.pathname.startsWith('/commande/')) {
      const r = await relais.statut(url.pathname.split('/')[2]);
      return json(r.statut, r.corps);
    }
    if (requete.method === 'POST' && url.pathname === '/commande') {
      if (!(requete.headers.get('Content-Type') || '').startsWith('application/json')) return json(415, { etat: 'format' });
      const brut = await requete.text();
      if (brut.length > 8192) return json(413, { etat: 'trop_long' });
      let corps;
      try { corps = JSON.parse(brut); } catch (e) { return json(400, { etat: 'invalide', champs: ['json'] }); }
      const contexte = {
        ip,
        ipHache: await sha256(`${ip}|${env.SEL_IP || ''}`),
        userAgent: corps.consentementMarketing === true ? (requete.headers.get('User-Agent') || '') : '',
        fbp: corps.consentementMarketing === true ? String(corps.fbp || '').slice(0, 200) : '',
        fbc: corps.consentementMarketing === true ? String(corps.fbc || '').slice(0, 200) : '',
        url: origine,
      };
      const r = await relais.traiter(corps, contexte);
      return json(r.statut, r.corps);
    }
    return json(404, { etat: 'route_inconnue' });
  },

  /* Purge quotidienne : demandes de plus de 30 jours, compteurs de plus de 24 h. */
  async scheduled(_evenement, env) {
    await stockageD1(env.DB).purger(Date.now(), 30 * 24 * 3600 * 1000);
  },
};
