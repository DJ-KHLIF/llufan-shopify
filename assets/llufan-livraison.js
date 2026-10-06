/* ---------------------------------------------------------------------------
   LLUFAN — commande avec paiement à la livraison
   Reprend la logique du prototype LLUFAN : la wilaya choisie détermine les
   communes proposées, le tarif de livraison (à domicile ou en stop-desk) puis
   le total (sous-total du panier + frais de livraison).

   Aucune donnée n'est inventée : wilayas, communes et tarifs proviennent du
   fichier `llufan-livraison-dz.json` livré avec le thème, lui-même extrait du
   prototype LLUFAN.
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
  const confirmation = $('[data-llufan-confirmation]');
  const avertissement = $('[data-llufan-avertissement]');
  const formulaire = $('form.commande') || $('form');

  const devise = (racine.dataset.devise || 'DA').trim();
  const modeSection = racine.dataset.modeSection || 'panier';
  const mode = racine.dataset.mode || '';
  let sousTotal = Number(racine.dataset.sousTotal || 0) / 100; // centimes → unité
  let lignesDuPanier = (racine.dataset.lignes || '').trim();
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
      .replace(/[\u202f\u00a0]/g, ' ')
      .replace(/(\d)[\s\u2009](\d{3})/g, '$1 $2') + ' ' + devise;

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
      libelles.recapNom + ' : ' + (($('[name="contact[Nom complet]"]') || {}).value || ''),
      libelles.recapTelephone + ' : ' + (($('[name="contact[Téléphone]"]') || {}).value || ''),
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
    radios.forEach((radio) => radio.addEventListener('change', () => {
      majSelection();
      recalculer();
    }));

    ['contact[Nom complet]', 'contact[Téléphone]'].forEach((nom) => {
      const champ = $(`[name="${nom}"]`);
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
      if (mode === 'apercu') {
        evenement.preventDefault();
        if (confirmation) {
          confirmation.hidden = false;
          confirmation.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });

    if (confirmation && !confirmation.hidden) {
      confirmation.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  demarrer();
})();
