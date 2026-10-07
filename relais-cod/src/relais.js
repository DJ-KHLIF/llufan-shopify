/* Relais COD LLUFAN — enchaînement d'une commande.
   Indépendant de Cloudflare : toutes les dépendances sont injectées, ce qui
   permet de le tester en simulation complète (tests/simulation.test.mjs).

   Garanties :
   1. Une clé = au plus UNE commande (base persistante + étiquette Shopify).
   2. Le serveur recalcule tout : variantes, prix, disponibilités, destination,
      livraison (tarif unique), total ; Shopify recalcule taxes et total
      (draftOrderCalculate) et le moindre écart arrête tout AVANT création.
   3. Paiement en attente uniquement : statut ≠ PENDING → alerte, jamais
      « payée » par le relais.
   4. Réponse Shopify perdue → état « incertain », vérifié avant toute autre
      action ; jamais de nouveau brouillon pour la même clé, jamais de renvoi
      automatique vers la caisse.
   5. Mode simulation (par défaut) : aucune écriture dans Shopify. */
import { ETATS, valider, empreinte, controlerVariantes, brouillon, totalAttendu, centimes } from './logique.js';
import { ReponseIncertaine } from './shopify.js';
import { envoyerAchat, identifiantEvenement } from './meta.js';

const reponse = (statut, corps) => ({ statut, corps });

/* Résultat présentable au navigateur pour une ligne de la base. */
const vue = (l, extra = {}) => {
  const base = { cle: l.cle, etat: l.etat };
  if (l.etat === ETATS.COMMANDE || l.etat === ETATS.ALERTE) Object.assign(base, { numero: l.numero, total: l.total_centimes / 100 });
  if (l.etat === ETATS.SIMULATION) Object.assign(base, { total: l.total_centimes / 100 });
  if (l.etat === ETATS.REFUSE) Object.assign(base, { motif: l.motif });
  return { ...base, ...extra };
};

/* Lecture d'une commande finalisée : vérifie le statut de paiement. */
const lireCommande = (order) => ({
  commandeId: order.id,
  commandeIdLegacy: String(order.legacyResourceId),
  numero: order.name,
  totalCentimes: centimes(order.totalPriceSet.shopMoney.amount),
  enAttente: order.displayFinancialStatus === 'PENDING',
});

export const creerRelais = (deps) => {
  const { config, shopify, stockage, verifierAntiSpam, horloge = () => Date.now(), journal = () => {}, envoyerMeta = envoyerAchat } = deps;
  const ecrituresAutorisees = config.mode === 'production' && config.commandesReelles === true;

  /* Enregistre une commande finalisée (ou en alerte) et déclenche Meta si permis. */
  const enregistrerCommande = async (cle, order, commande, consentement, contexte) => {
    const c = lireCommande(order);
    const etat = c.enAttente ? ETATS.COMMANDE : ETATS.ALERTE;
    if (!c.enAttente) journal('ALERTE', { cle, numero: c.numero, statut: order.displayFinancialStatus });
    await stockage.maj(cle, { etat, commande_id: c.commandeId, numero: c.numero, total_centimes: c.totalCentimes, motif: c.enAttente ? null : `statut_${order.displayFinancialStatus}` }, horloge());
    let eventId = null;
    if (etat === ETATS.COMMANDE && consentement && config.metaPixelId && config.metaJeton && commande) {
      eventId = identifiantEvenement(c.commandeIdLegacy);
      if (await stockage.marquerMeta(cle, horloge())) {
        try { await envoyerMeta({ config, commande, resultat: c, contexte }); } catch (e) { journal('META_ECHEC', { cle, message: e.message }); }
      }
    }
    return reponse(201, vue(await stockage.lire(cle), eventId ? { eventId } : {}));
  };

  /* Reprise d'une clé déjà connue : on vérifie dans Shopify avant toute action. */
  const reconcilier = async (ligne) => {
    const cle = ligne.cle;
    if ([ETATS.COMMANDE, ETATS.ALERTE, ETATS.SIMULATION, ETATS.REFUSE].includes(ligne.etat)) return reponse(200, vue(ligne));
    if (!ecrituresAutorisees) return reponse(200, vue(ligne));
    let brouillonId = ligne.brouillon_id;
    if (!brouillonId && ligne.etat === ETATS.RECU && ligne.verrou_jusqua > horloge()) return reponse(202, vue(ligne, { etat: 'en_cours' }));
    /* Création sans réponse : la recherche Shopify par étiquette peut avoir du
       retard. On attend `delaiRechercheMs` avant de conclure « aucun brouillon ». */
    if (!brouillonId && ligne.etat === ETATS.INCERTAIN && ligne.verrou_jusqua > horloge()) return reponse(202, vue(ligne));
    if (!brouillonId) {
      /* Brouillon peut-être créé sans réponse reçue : recherche par étiquette. */
      const trouves = await shopify.parEtiquette(`relais-${cle}`);
      if (trouves.length > 1) { journal('ALERTE_DOUBLON', { cle, brouillons: trouves.map((t) => t.id) }); }
      if (trouves.length === 0) {
        /* Aucun brouillon : la clé peut être retentée (même clé, même contenu). */
        await stockage.maj(cle, { etat: ETATS.RECU, motif: null, verrou_jusqua: 0 }, horloge());
        return reponse(200, vue(await stockage.lire(cle), { etat: 'a_renvoyer' }));
      }
      brouillonId = trouves[0].id;
      await stockage.maj(cle, { brouillon_id: brouillonId, etat: ETATS.BROUILLON }, horloge());
    }
    const d = await shopify.etat(brouillonId);
    if (d && d.order) return enregistrerCommande(cle, d.order, null, false, {});
    if (d && d.status === 'OPEN') {
      /* Brouillon ouvert : on le finalise (un brouillon ne donne qu'une commande). */
      try {
        const fin = await shopify.finaliser(brouillonId);
        if (fin.userErrors && fin.userErrors.length) throw new Error(fin.userErrors.map((e) => e.message).join(' ; '));
        return enregistrerCommande(cle, fin.draftOrder.order, null, false, {});
      } catch (e) {
        await stockage.maj(cle, { etat: ETATS.INCERTAIN, motif: e instanceof ReponseIncertaine ? 'finalisation_sans_reponse' : 'finalisation_refusee' }, horloge());
        return reponse(202, vue(await stockage.lire(cle)));
      }
    }
    return reponse(202, vue(ligne));
  };

  const traiter = async (corps, contexte) => {
    /* 1. Validation et normalisation */
    const v = valider(corps, config.donneesLivraison, config);
    if (!v.ok) return reponse(400, { etat: 'invalide', champs: v.erreurs });
    const { commande, totalAffiche, consentementMarketing } = v;

    /* 2. Limitation de débit puis anti-spam */
    const fenetre = Math.floor(horloge() / (10 * 60 * 1000));
    if ((await stockage.compter(contexte.ipHache, fenetre, horloge())) > config.maxParFenetre) return reponse(429, { etat: 'trop_de_demandes' });
    if (!(await verifierAntiSpam(corps.antiSpam, contexte))) return reponse(403, { etat: 'anti_spam' });

    /* 3. Anti-doublon persistant */
    const emp = await empreinte(commande);
    const r = await stockage.reserver(commande.cle, emp, horloge(), config.verrouMs);
    if (!r.nouvelle) {
      if (r.ligne.empreinte !== emp) return reponse(409, { etat: 'cle_deja_utilisee' });
      if (r.ligne.etat !== ETATS.RECU || r.ligne.verrou_jusqua > horloge()) return reconcilier(r.ligne);
      if (ecrituresAutorisees) {
        const rec = await reconcilier(r.ligne);           // brouillon éventuel retrouvé ?
        if (rec.corps.etat !== 'a_renvoyer') return rec;
      }
      if (!(await stockage.reprendre(commande.cle, horloge(), config.verrouMs))) return reconcilier(await stockage.lire(commande.cle));
    }

    try {
      /* 4. Contrôle serveur : variantes, prix, disponibilités */
      const noeuds = await shopify.variantes(commande.lignes.map((l) => l.variante));
      const { problemes, sousTotal } = controlerVariantes(commande.lignes, noeuds);
      if (problemes.length) {
        await stockage.maj(commande.cle, { etat: ETATS.REFUSE, motif: 'variantes' }, horloge());
        return reponse(409, { etat: 'refuse', motif: 'variantes', details: problemes });
      }
      const attendu = totalAttendu(sousTotal, config);
      if (totalAffiche !== null && Math.round(totalAffiche * 100) !== attendu) {
        await stockage.maj(commande.cle, { etat: ETATS.REFUSE, motif: 'total_affiche_different' }, horloge());
        return reponse(409, { etat: 'refuse', motif: 'total_affiche_different', total: attendu / 100 });
      }

      /* 5. Shopify recalcule (taxes incluses, livraison) : le total doit être identique */
      const input = brouillon(commande, config);
      const calcul = await shopify.calculer(input);
      if (calcul.userErrors && calcul.userErrors.length) throw new Error(`calcul : ${calcul.userErrors.map((e) => e.message).join(' ; ')}`);
      const totalShopify = centimes(calcul.calculatedDraftOrder.totalPriceSet.shopMoney.amount);
      if (totalShopify !== attendu) {
        journal('ECART_TOTAL', { cle: commande.cle, attendu, totalShopify });
        await stockage.maj(commande.cle, { etat: ETATS.REFUSE, motif: 'total_shopify_different' }, horloge());
        return reponse(409, { etat: 'refuse', motif: 'total_shopify_different', total: attendu / 100 });
      }

      /* 6. Simulation : on s'arrête ici, rien n'est créé */
      if (!ecrituresAutorisees) {
        await stockage.maj(commande.cle, { etat: ETATS.SIMULATION, total_centimes: attendu }, horloge());
        return reponse(200, { ...vue(await stockage.lire(commande.cle)), brouillonPrevu: input });
      }

      /* 7. Création du brouillon (étiquette relais-<clé> pour le retrouver) */
      let creation;
      try {
        creation = await shopify.creer(input);
      } catch (e) {
        if (e instanceof ReponseIncertaine) {
          await stockage.maj(commande.cle, { etat: ETATS.INCERTAIN, motif: 'creation_sans_reponse', verrou_jusqua: horloge() + config.delaiRechercheMs }, horloge());
          return reponse(202, vue(await stockage.lire(commande.cle)));
        }
        throw e;
      }
      if (creation.userErrors && creation.userErrors.length) {
        await stockage.maj(commande.cle, { etat: ETATS.REFUSE, motif: 'creation_refusee' }, horloge());
        journal('CREATION_REFUSEE', { cle: commande.cle, erreurs: creation.userErrors.map((e) => e.message) });
        return reponse(502, { etat: 'refuse', motif: 'creation_refusee' });
      }
      const brouillonId = creation.draftOrder.id;
      await stockage.maj(commande.cle, { etat: ETATS.BROUILLON, brouillon_id: brouillonId }, horloge());

      /* 8. Finalisation → commande (paiement en attente) */
      let fin;
      try {
        fin = await shopify.finaliser(brouillonId);
      } catch (e) {
        if (e instanceof ReponseIncertaine) {
          await stockage.maj(commande.cle, { etat: ETATS.INCERTAIN, motif: 'finalisation_sans_reponse' }, horloge());
          return reponse(202, vue(await stockage.lire(commande.cle)));
        }
        throw e;
      }
      if (fin.userErrors && fin.userErrors.length) {
        await stockage.maj(commande.cle, { etat: ETATS.INCERTAIN, motif: 'finalisation_refusee' }, horloge());
        journal('FINALISATION_REFUSEE', { cle: commande.cle, erreurs: fin.userErrors.map((e) => e.message) });
        return reponse(202, vue(await stockage.lire(commande.cle)));
      }
      return enregistrerCommande(commande.cle, fin.draftOrder.order, commande, consentementMarketing, contexte);
    } catch (e) {
      /* Erreur avant toute écriture : la clé redevient libre pour un nouvel essai. */
      const l = await stockage.lire(commande.cle);
      if (l && l.etat === ETATS.RECU) await stockage.maj(commande.cle, { verrou_jusqua: 0 }, horloge());
      journal('ERREUR', { cle: commande.cle, message: e.message });
      return reponse(503, { etat: 'indisponible' });
    }
  };

  const statut = async (cle) => {
    const l = await stockage.lire(String(cle || '').toLowerCase());
    if (!l) return reponse(404, { etat: 'inconnue' });
    return reconcilier(l);
  };

  return { traiter, statut };
};
