/* Événement Meta « Purchase » (API Conversions), côté serveur.
   Conditions, toutes obligatoires :
   - commande Shopify créée ET vérifiée (état commande_creee) ;
   - consentement marketing donné dans la boutique (API Customer Privacy de
     Shopify, lu par le navigateur et transmis avec la commande) ;
   - configuration Meta présente (identifiant du pixel + jeton, secrets serveur).
   Un seul envoi par commande (drapeau en base). L'identifiant d'événement est
   renvoyé au navigateur pour que le pixel, s'il envoie aussi « Purchase »,
   utilise le même `eventID` : Meta n'en compte alors qu'un (48 h).
   Données envoyées : téléphone et pays hachés (SHA-256), montant, devise,
   identifiants de variantes. Ni nom ni adresse. */

const sha256 = async (s) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const identifiantEvenement = (commandeIdLegacy) => `llufan-commande-${commandeIdLegacy}`;

export const envoyerAchat = async ({ config, commande, resultat, contexte, fetch: f = fetch }) => {
  const telephone = commande.telephone.replace(/^\+/, ''); // format attendu : chiffres avec indicatif
  const evenement = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: identifiantEvenement(resultat.commandeIdLegacy),
    action_source: 'website',
    event_source_url: contexte.url || undefined,
    user_data: {
      ph: [await sha256(telephone)],
      country: [await sha256('dz')],
      client_user_agent: contexte.userAgent || undefined,
      fbp: contexte.fbp || undefined,
      fbc: contexte.fbc || undefined,
    },
    custom_data: {
      currency: config.devise,
      value: resultat.totalCentimes / 100,
      content_type: 'product',
      content_ids: commande.lignes.map((l) => l.variante),
      num_items: commande.lignes.reduce((s, l) => s + l.quantite, 0),
      order_id: resultat.numero,
    },
  };
  const corps = { data: [evenement] };
  if (config.metaCodeTest) corps.test_event_code = config.metaCodeTest;
  const r = await f(`https://graph.facebook.com/${config.metaVersion}/${config.metaPixelId}/events?access_token=${encodeURIComponent(config.metaJeton)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`Meta : HTTP ${r.status}`);
  return evenement.event_id;
};
