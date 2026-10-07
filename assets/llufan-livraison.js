/* ---------------------------------------------------------------------------
   LLUFAN — commande avec paiement à la livraison
   Reprend la logique du prototype LLUFAN : la wilaya choisie détermine les
   communes proposées, le tarif de livraison (à domicile ou en stop-desk) puis
   le total (sous-total du panier + frais de livraison).

   Aucune donnée n'est inventée : wilayas, communes et tarifs proviennent du
   fichier `llufan-livraison-dz.json` livré avec le thème, lui-même extrait du
   prototype LLUFAN.

   À l'envoi, la cliente part vers la caisse Shopify par un lien de panier
   (https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks) :
   articles, informations de livraison (propriétés de ligne sur la fiche
   produit, attributs de commande depuis le panier) et adresse pré-remplie.
   --------------------------------------------------------------------------- */
(() => {
  const racine = document.querySelector('[data-llufan-commande]');
  if (!racine) return;

  const $ = (sel, ctx = racine) => ctx.querySelector(sel);

  const wilayaSelect = $('[data-llufan-wilaya]');
  const communeSelect = $('[data-llufan-commune]');
  const radios = Array.from(racine.querySelectorAll('[data-llufan-type] input[type="radio"]'));
  const sortieSousTotal = $('[data-llufan-sous-total]');
  const sortieFrais = $('[data-llufan-frais]');
  const sortieTotal = $('[data-llufan-total]');
  const sortieSticky = document.querySelector('[data-llufan-sticky-total]');
  const champRecapitulatif = $('[data-llufan-recapitulatif]');
  const avertissement = $('[data-llufan-avertissement]');
  const formulaire = $('form.commande') || $('form');
  const champNom = $('[data-llufan-nom]');
  const champTelephone = $('[data-llufan-telephone]');
  const champAdresse = $('[data-llufan-adresse]');
  const blocAdresse = $('[data-llufan-adresse-bloc]');
  const boutonEnvoi = $('[data-llufan-bouton]');

  const devise = (racine.dataset.devise || 'DA').trim();
  const modeSection = racine.dataset.modeSection || 'panier';
  let sousTotal = Number(racine.dataset.sousTotal || 0) / 100; // centimes → unité
  let lignesDuPanier = (racine.dataset.lignes || '').trim();
  /* Fiche produit : variante et quantité en cours (mises à jour par majProduit). */
  let varianteCourante = null;
  let quantiteCourante = 1;
  /* Langue de la page : les noms de wilayas s'affichent en arabe quand la page
     est en arabe. La valeur enregistrée dans la commande, elle, ne change pas. */
  const enArabe = (document.documentElement.lang || '').toLowerCase().indexOf('ar') === 0;
  const libelle = (cle, defaut) => (racine.dataset[cle] || '').trim() || defaut;
  const libelles = {
    domicile: racine.dataset.libelleDomicile || 'À domicile',
    stopDesk: racine.dataset.libelleStopDesk || 'Stop-desk',
    aCalculer: libelle('libelleACalculer', 'À calculer'),
    choix: libelle('libelleChoisir', 'Choisir…'),
    choixIncomplet: libelle('libelleChoixIncomplet', 'Veuillez choisir la wilaya et la commune.'),
    recapNom: libelle('libelleRecapNom', 'Nom complet'),
    recapTelephone: libelle('libelleRecapTelephone', 'Téléphone'),
    recapWilaya: libelle('libelleRecapWilaya', 'Wilaya'),
    recapCommune: libelle('libelleRecapCommune', 'Commune'),
    recapType: libelle('libelleRecapType', 'Type de livraison'),
    recapSousTotal: libelle('libelleRecapSousTotal', 'Sous-total'),
    recapFrais: libelle('libelleRecapFrais', 'Frais de livraison'),
    recapTotal: libelle('libelleRecapTotal', 'TOTAL'),
  };
  const nomWilaya = (wilaya) => (enArabe && wilaya.nom_ar ? wilaya.nom_ar : wilaya.nom);
  /* Nom de la commune : arabe quand la page est en arabe, sinon le nom latin.
     Si la commune n'a pas de nom arabe connu, on affiche le nom latin plutôt
     qu'un nom approximatif (7 communes sont dans ce cas — voir README §26.4).
     L'ORDRE est le même que la liste « communes » : on se repère par l'indice. */
  const nomCommune = (wilaya, index) => {
    const latin = wilaya.communes[index].replace('*', '');
    if (!enArabe || !wilaya.communes_ar) return latin;
    return wilaya.communes_ar[index] || latin;
  };

  let donnees = null;

  /* 12 345 DA — séparateur de milliers à la française, comme le prototype */
  const montant = (nombre) =>
    Math.round(nombre)
      .toLocaleString('fr-FR')
      .replace(/[  ]/g, ' ')
      .replace(/(\d)[\s ](\d{3})/g, '$1 $2') + ' ' + devise;

  const chargerDonnees = async () => {
    if (window.LLUFAN_LIVRAISON_DATA) return window.LLUFAN_LIVRAISON_DATA;
    const reponse = await fetch(racine.dataset.src, { credentials: 'same-origin' });
    if (!reponse.ok) throw new Error('tarifs de livraison indisponibles');
    return reponse.json();
  };

  const wilayaCourante = () => {
    if (!donnees || !wilayaSelect.value) return null;
    return donnees.wilayas.find((w) => `${w.code} - ${w.nom}` === wilayaSelect.value) || null;
  };

  const typeCourant = () => {
    const choisi = radios.find((r) => r.checked);
    return choisi ? choisi.value : 'domicile';
  };

  const fraisCourants = () => {
    const wilaya = wilayaCourante();
    if (!wilaya) return null;
    const tarif = typeCourant() === 'domicile' ? wilaya.domicile : wilaya.stop_desk;
    return typeof tarif === 'number' ? tarif : null;
  };

  const majTarifs = () => {
    const wilaya = wilayaCourante();
    radios.forEach((radio) => {
      const quoi = radio.value === 'domicile' ? 'domicile' : 'stop_desk';
      const tarif = wilaya && typeof wilaya[quoi] === 'number' ? wilaya[quoi] : null;
      const sortie = $(`[data-llufan-prix-${radio.value}]`);
      if (sortie) sortie.textContent = tarif === null ? '—' : montant(tarif);
    });
  };

  const recalculer = () => {
    const frais = fraisCourants();
    const total = frais === null ? null : sousTotal + frais;
    if (sortieSousTotal) sortieSousTotal.textContent = montant(sousTotal);
    if (sortieFrais) sortieFrais.textContent = frais === null ? libelles.aCalculer : montant(frais);
    if (sortieTotal) sortieTotal.textContent = total === null ? '—' : montant(total);
    if (sortieSticky) sortieSticky.textContent = montant(frais === null ? sousTotal : total);
    remplirRecapitulatif(frais, total);
  };

  const remplirRecapitulatif = (frais, total) => {
    if (!champRecapitulatif) return;
    const wilaya = wilayaCourante();
    const lignes = [
      lignesDuPanier,
      '',
      libelles.recapNom + ' : ' + ((champNom || {}).value || ''),
      libelles.recapTelephone + ' : ' + ((champTelephone || {}).value || ''),
      /* Le récapitulatif est un texte lu par la cliente et par vous : il suit
         donc la langue de la page. Les valeurs que Shopify enregistre dans la
         commande, elles, restent les champs du formulaire (et ils ne changent
         pas : le nom latin y est conservé). */
      libelles.recapWilaya + ' : ' + (wilaya ? `${wilaya.code} - ${nomWilaya(wilaya)}` : ''),
      libelles.recapCommune + ' : ' + (communeSelect && communeSelect.selectedIndex > 0
        ? communeSelect.options[communeSelect.selectedIndex].textContent : ''),
      libelles.recapType + ' : ' + (typeCourant() === 'domicile' ? libelles.domicile : libelles.stopDesk),
      '',
      libelles.recapSousTotal + ' : ' + montant(sousTotal),
      libelles.recapFrais + ' : ' + (frais === null ? libelles.aCalculer : montant(frais)),
      libelles.recapTotal + ' : ' + (total === null ? '—' : montant(total)),
    ];
    champRecapitulatif.value = lignes.filter((l) => l !== undefined).join('\n').trim();
  };

  const remplirCommunes = () => {
    if (!communeSelect) return;
    const wilaya = wilayaCourante();
    communeSelect.innerHTML = '';
    const vide = document.createElement('option');
    vide.value = '';
    vide.textContent = libelles.choix;
    communeSelect.appendChild(vide);
    communeSelect.disabled = !wilaya;
    if (!wilaya) {
      communeSelect.insertAdjacentHTML('beforebegin', '');
      return;
    }
    wilaya.communes.forEach((commune, index) => {
      const option = document.createElement('option');
      /* la valeur envoyée à Shopify reste le nom latin : c'est le repère
         administratif que le marchand lit dans la commande */
      option.value = commune.replace('*', '');
      option.textContent = nomCommune(wilaya, index);
      communeSelect.appendChild(option);
    });
  };

  const signaler = (message) => {
    if (!avertissement) return;
    avertissement.textContent = message;
    avertissement.hidden = false;
  };

  /* L'adresse précise n'est demandée qu'en livraison à domicile : en stop-desk,
     le colis est retiré à l'agence de la commune choisie. */
  const majAdresse = () => {
    if (!champAdresse) return;
    const domicile = typeCourant() === 'domicile';
    /* `hidden` ne suffit pas : la classe .field impose display: grid. */
    if (blocAdresse) blocAdresse.style.display = domicile ? '' : 'none';
    champAdresse.disabled = !domicile;
    champAdresse.required = domicile;
  };

  /* Lien de panier vers la caisse Shopify (articles + informations + adresse). */
  const lienCaisse = (articlesPanier) => {
    const wilaya = wilayaCourante();
    const commune = communeSelect ? communeSelect.value : '';
    const domicile = typeCourant() === 'domicile';
    const nom = ((champNom || {}).value || '').trim().replace(/\s+/g, ' ');
    const telephone = ((champTelephone || {}).value || '').trim();
    const adresse = domicile ? ((champAdresse || {}).value || '').trim().replace(/\s+/g, ' ') : '';
    const infos = {
      'Nom complet': nom,
      'Téléphone': telephone,
      'Wilaya': wilaya ? `${wilaya.code} - ${wilaya.nom}` : '',
      'Commune': commune,
      'Type de livraison': domicile ? 'Domicile' : 'Stop-desk',
    };
    if (adresse) infos['Adresse'] = adresse;

    let articles = '';
    const parametres = new URLSearchParams();
    if (modeSection === 'produit') {
      if (!varianteCourante) return null;
      articles = `${varianteCourante.id}:${quantiteCourante}`;
      /* Propriétés de ligne : JSON encodé en Base64 (UTF-8, pour l'arabe). */
      const json = JSON.stringify(infos);
      parametres.set('properties', btoa(unescape(encodeURIComponent(json))));
    } else {
      articles = (articlesPanier || racine.dataset.articles || '').trim();
      Object.keys(infos).forEach((cle) => parametres.set(`attributes[${cle}]`, infos[cle]));
    }
    if (!articles) return null;

    /* Pré-remplissage de l'adresse de livraison de la caisse. */
    const [prenom, ...reste] = nom.split(' ');
    parametres.set('checkout[shipping_address][first_name]', prenom || '');
    parametres.set('checkout[shipping_address][last_name]', reste.join(' ') || prenom || '');
    parametres.set('checkout[shipping_address][address1]', adresse || `Stop-desk — ${commune}`);
    parametres.set('checkout[shipping_address][address2]', wilaya ? `${wilaya.code} - ${wilaya.nom}` : '');
    parametres.set('checkout[shipping_address][city]', commune);
    parametres.set('checkout[shipping_address][country]', 'DZ');
    parametres.set('checkout[shipping_address][phone]', telephone);
    const langue = (racine.dataset.langue || '').trim();
    if (langue) parametres.set('locale', langue);
    return `/cart/${articles}?${parametres.toString()}`;
  };

  /* Panier : les articles sont relus au moment de l'envoi (`/cart.js`), car la
     cliente a pu changer une quantité sur la page sans la recharger. */
  const articlesDuPanier = async () => {
    try {
      const racineRoutes = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      const reponse = await fetch(`${racineRoutes}cart.js`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!reponse.ok) return null;
      const panier = await reponse.json();
      return (panier.items || []).map((article) => `${article.variant_id}:${article.quantity}`).join(',');
    } catch (erreur) {
      return null;
    }
  };

  const envoyer = async () => {
    const articles = modeSection === 'produit' ? null : await articlesDuPanier();
    const lien = modeSection === 'produit' || articles ? lienCaisse(articles) : null;
    /* Sans lien (panier illisible ou vide), l'envoi classique prend le relais. */
    if (lien) window.location.assign(lien);
    else HTMLFormElement.prototype.submit.call(formulaire);
  };

  const demarrer = async () => {
    try {
      donnees = await chargerDonnees();
    } catch (erreur) {
      return; // sans tarifs, la section reste utilisable : les totaux restent « à calculer »
    }

    if (wilayaSelect) {
      donnees.wilayas.forEach((wilaya) => {
        const option = document.createElement('option');
        /* `value` reste le repère administratif (code + nom latin) : c'est ce
           qu'on retrouve dans la commande. Seul l'affichage suit la langue. */
        option.value = `${wilaya.code} - ${wilaya.nom}`;
        option.textContent = `${wilaya.code} - ${nomWilaya(wilaya)}`;
        wilayaSelect.appendChild(option);
      });
      wilayaSelect.addEventListener('change', () => {
        if (avertissement) avertissement.hidden = true;
        remplirCommunes();
        majTarifs();
        recalculer();
      });
    }

    if (communeSelect) communeSelect.addEventListener('change', () => {
      if (avertissement) avertissement.hidden = true;
      recalculer();
    });

    const majSelection = () => radios.forEach((radio) => {
      const pastille = radio.closest('[data-llufan-type-item]');
      if (pastille) pastille.classList.toggle('is-selected', radio.checked);
    });
    majSelection();   /* l'option cochée au chargement est mise en évidence tout de suite */
    majAdresse();
    radios.forEach((radio) => radio.addEventListener('change', () => {
      majSelection();
      majAdresse();
      recalculer();
    }));

    [champNom, champTelephone].forEach((champ) => {
      if (champ) champ.addEventListener('input', () => remplirRecapitulatif(fraisCourants(), fraisCourants() === null ? null : sousTotal + fraisCourants()));
    });

    /* --- Fiche produit : sous-total = prix de la variante × quantité choisies --- */
    if (modeSection === 'produit') {
      const variantes = JSON.parse((document.querySelector('[data-llufan-variantes]') || {}).textContent || '[]');
      const formulaireProduit = document.querySelector('form.shopify-product-form');
      const champQuantite = formulaireProduit
  ? formulaireProduit.elements.namedItem('quantity')
  : null;
      const titreProduit = racine.dataset.produit || '';

      const majProduit = () => {
        const idChoisi = formulaireProduit ? (formulaireProduit.querySelector('input[name="id"]') || {}).value : null;
        const variante = variantes.find((v) => String(v.id) === String(idChoisi)) || variantes[0];
        if (!variante) return;
        const quantite = Math.max(1, parseInt((champQuantite || {}).value, 10) || 1);
        varianteCourante = variante;
        quantiteCourante = quantite;
        /* Le formulaire de commande suit la variante et la quantité de la fiche. */
        const champId = $('[data-llufan-id]');
        const champQte = $('[data-llufan-quantite]');
        if (champId) champId.value = variante.id;
        if (champQte) champQte.value = quantite;
        if (boutonEnvoi) boutonEnvoi.disabled = variante.dispo === false;
        sousTotal = (variante.prix * quantite) / 100;
        const couleur = variante.titre && variante.titre !== 'Default Title' ? ` — ${variante.titre}` : '';
        lignesDuPanier = `${quantite} × ${titreProduit}${couleur} : ${montant(sousTotal)}`;
        recalculer();
      };

      majProduit();
      if (champQuantite) {
  champQuantite.addEventListener('input', majProduit);
  champQuantite.addEventListener('change', majProduit);

  const selecteurQuantite = champQuantite.closest('.quantity-selector');

  if (selecteurQuantite) {
    selecteurQuantite.addEventListener('click', (evenement) => {
      if (evenement.target.closest('[data-quantity-button]')) {
        setTimeout(majProduit, 0);
      }
    });
  }
}
      if (formulaireProduit) {
        formulaireProduit.addEventListener('change', majProduit);
        formulaireProduit.addEventListener('input', majProduit);
        formulaireProduit.addEventListener('click', (evenement) => {
          if (evenement.target.closest('[data-quantity-button]')) setTimeout(majProduit, 0);
        });
      }
      const selecteurVariante = document.querySelector('variant-picker');
      if (selecteurVariante) {
        selecteurVariante.addEventListener('change', majProduit);
        selecteurVariante.addEventListener('click', () => setTimeout(majProduit, 0));
      }
    }

    majTarifs();
    recalculer();

    /* Barre mobile « Commander » : amène au formulaire puis à son bouton */
    const raccourci = document.querySelector('[data-llufan-sticky]');
    if (raccourci) raccourci.addEventListener('click', (evenement) => {
      evenement.preventDefault();
      const ancre = $('[data-llufan-bouton]') || formulaire;
      if (ancre) ancre.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (wilayaSelect && !wilayaSelect.value) wilayaSelect.focus({ preventScroll: true });
    });

    /* La barre mobile s'efface quand le bouton du formulaire est déjà à l'écran (évite le doublon) */
    const barreMobile = $('[data-llufan-sticky]') ? $('[data-llufan-sticky]').closest('.commande__barre') : null;
    const boutonPrincipal = $('[data-llufan-bouton]');
  if (barreMobile && formulaire && 'IntersectionObserver' in window) {
  new IntersectionObserver((entrees) => {
    entrees.forEach((entree) => {
      barreMobile.classList.toggle(
        'commande__barre--masquee',
        entree.isIntersecting
      );
    });
  }, { threshold: 0 }).observe(formulaire);
}
    if (formulaire) formulaire.addEventListener('submit', (evenement) => {
      const wilaya = wilayaCourante();
      const commune = communeSelect ? communeSelect.value : '';
      if (!formulaire.checkValidity()) {
        evenement.preventDefault();
        formulaire.reportValidity();
        return;
      }
      if (!wilaya || !commune) {
        evenement.preventDefault();
        signaler(libelles.choixIncomplet);
        if (!wilaya && wilayaSelect) wilayaSelect.focus();
        else if (communeSelect) communeSelect.focus();
        return;
      }
      remplirRecapitulatif(fraisCourants(), sousTotal + (fraisCourants() || 0));
      /* Sans lien calculable, l'envoi classique du formulaire prend le relais
         (ajout au panier ou mise à jour du panier, puis caisse). */
      if (modeSection === 'produit' && !lienCaisse()) return;
      evenement.preventDefault();
      if (boutonEnvoi) {
        boutonEnvoi.disabled = true;
        boutonEnvoi.setAttribute('aria-busy', 'true');
        if (libelle('libelleEnvoi', '')) boutonEnvoi.textContent = libelle('libelleEnvoi', '');
      }
      envoyer();
    });

    /* Retour arrière depuis la caisse : la page peut revenir du cache du
       navigateur avec le bouton encore désactivé. */
    window.addEventListener('pageshow', () => {
      if (boutonEnvoi && boutonEnvoi.getAttribute('aria-busy') === 'true') window.location.reload();
    });
  };

  demarrer();
})();
