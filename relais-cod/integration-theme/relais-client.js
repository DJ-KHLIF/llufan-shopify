/* Relais COD — côté navigateur. NON ACTIVÉ : ce fichier n'est pas dans le
   thème. À n'intégrer qu'après validation du relais en simulation (voir
   GUIDE-INSTALLATION.md, étape 7).

   Règles :
   - une clé (UUID) par contenu de commande, conservée pendant la session :
     un double clic ou un nouvel essai réutilise la MÊME clé → jamais deux
     commandes ;
   - réponse « incertain » ou réseau coupé : on interroge l'état, on
     n'envoie JAMAIS la cliente vers la caisse Shopify ;
   - événement Meta navigateur seulement si le relais renvoie `eventId`
     (commande créée + consentement), avec ce même identifiant (dédoublonnage).

   Utilisation (dans llufan-livraison.js, à la place de envoyer()) :
     const r = await LLUFAN_RELAIS.commander(URL_RELAIS, donnees, afficher);
   `donnees` = { lignes:[{variante, quantite}], nom, telephone, wilaya, commune,
                 mode, adresse, langue, totalAffiche, antiSpam } */
(() => {
  const empreinte = (d) => JSON.stringify([d.lignes, d.nom, d.telephone, d.wilaya, d.commune, d.mode, d.adresse]);
  const cleDe = (d) => {
    const k = `llufan:relais:${empreinte(d)}`;
    try {
      const existante = sessionStorage.getItem(k);
      if (existante) return existante;
      const nouvelle = crypto.randomUUID();
      sessionStorage.setItem(k, nouvelle);
      return nouvelle;
    } catch (e) {
      return crypto.randomUUID();
    }
  };
  const consentement = () => {
    try { return Boolean(window.Shopify && window.Shopify.customerPrivacy && window.Shopify.customerPrivacy.marketingAllowed()); } catch (e) { return false; }
  };
  const cookie = (nom) => (document.cookie.match(new RegExp(`(?:^|; )${nom}=([^;]*)`)) || [])[1] || '';
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

  const commander = async (urlRelais, donnees, afficher) => {
    const cle = cleDe(donnees);
    const corps = JSON.stringify({ ...donnees, cle, consentementMarketing: consentement(), fbp: cookie('_fbp'), fbc: cookie('_fbc') });
    let r;
    try {
      r = await fetch(`${urlRelais}/commande`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps });
    } catch (e) {
      afficher({ etat: 'verification' });
      return suivre(urlRelais, cle, afficher);
    }
    const d = await r.json().catch(() => ({ etat: 'indisponible' }));
    if (r.status === 201 || d.etat === 'commande_creee' || d.etat === 'alerte_statut_paiement') return confirmer(d, afficher);
    if (r.status === 202) { afficher({ etat: 'verification' }); return suivre(urlRelais, cle, afficher); }
    return afficher(d); // invalide, refuse (total, stock…), anti_spam, trop_de_demandes, indisponible
  };

  /* Interroge l'état jusqu'à 3 minutes ; jamais de renvoi vers la caisse. */
  const suivre = async (urlRelais, cle, afficher) => {
    for (let i = 0; i < 36; i += 1) {
      await pause(5000);
      try {
        const d = await (await fetch(`${urlRelais}/commande/${cle}`)).json();
        if (d.etat === 'commande_creee' || d.etat === 'alerte_statut_paiement') return confirmer(d, afficher);
        if (d.etat === 'a_renvoyer') return afficher({ etat: 'a_renvoyer' }); // rien créé : même bouton, même clé
      } catch (e) { /* on réessaie */ }
    }
    return afficher({ etat: 'incertain_long', cle }); // message : « nous vous appelons pour confirmer »
  };

  const confirmer = (d, afficher) => {
    if (d.eventId && typeof window.fbq === 'function' && consentement()) {
      window.fbq('track', 'Purchase', { value: d.total, currency: 'DZD' }, { eventID: d.eventId });
    }
    return afficher({ etat: 'commande_creee', numero: d.numero, total: d.total });
  };

  window.LLUFAN_RELAIS = { commander };
})();
