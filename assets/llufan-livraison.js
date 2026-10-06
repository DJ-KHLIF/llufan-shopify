/* ---------------------------------------------------------------------------
   LLUFAN — formulaire de commande, paiement à la livraison (SIMULATION)

   ⚠ Version de test : aucune commande Shopify n'est créée, rien n'est envoyé.
   L'envoi du formulaire est toujours intercepté ; après vérification des
   champs, le script affiche le récapitulatif et un message de simulation.

   Ce que fait le script :
   • wilaya → liste des communes (noms arabes quand la page est en arabe ;
     la valeur gardée reste le nom latin, repère administratif) ;
   • domicile / stop-desk → tarif de la wilaya, frais et total ;
   • adresse : visible et obligatoire à domicile ; masquée, désactivée et
     absente du récapitulatif en stop-desk ;
   • fiche produit : sous-total = prix de la variante choisie × quantité,
     recalculé à chaque changement (événement « variant:change » émis par le
     sélecteur de variantes, champ quantité) ; une variante indisponible
     bloque la simulation ;
   • page panier : sous-total et lignes repris du panier, mis à jour après
     chaque modification (événement « llufan:panier-maj » émis par theme.js) ;
   • destination incomplète ou tarif absent : aucun montant n'est inventé,
     les frais restent « à calculer » et la simulation est bloquée.

   Données : assets/llufan-livraison-dz.json (wilayas, communes, tarifs en DA).
   Textes : fichiers de langue, transmis par le bloc JSON du formulaire.
   --------------------------------------------------------------------------- */
(() => {
  'use strict';

  const ESPACE = ' '; // espace insécable, comme le snippet « montant »

  /* « 9 600 » — même écriture que snippets/montant.liquid (centimes → texte) */
  const chiffres = (centimes) => {
    const valeur = Math.round(Number(centimes) || 0);
    const signe = valeur < 0 ? '−' : '';
    const absolu = Math.abs(valeur);
    const entier = String(Math.floor(absolu / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE);
    const reste = absolu % 100;
    return signe + entier + (reste ? ',' + String(reste).padStart(2, '0') : '');
  };

  /* Chargement unique du fichier des tarifs, partagé entre les formulaires */
  let promesseDonnees = null;
  const chargerTarifs = (adresse) => {
    if (window.LLUFAN_LIVRAISON_DATA) return Promise.resolve(window.LLUFAN_LIVRAISON_DATA);
    if (!promesseDonnees) {
      promesseDonnees = fetch(adresse, { credentials: 'same-origin' }).then((reponse) => {
        if (!reponse.ok) throw new Error('tarifs de livraison indisponibles');
        return reponse.json();
      });
    }
    return promesseDonnees;
  };

  const initialiser = (racine) => {
    if (!racine || racine.dataset.llufanPret === 'true') return;
    racine.dataset.llufanPret = 'true';

    const config = JSON.parse((racine.querySelector('[data-llufan-donnees]') || {}).textContent || '{}');
    const T = config.textes || {};
    const devise = config.devise || 'DA';
    const enArabe = String(config.langue || document.documentElement.lang || '').toLowerCase().indexOf('ar') === 0;

    const $ = (selecteur) => racine.querySelector(selecteur);
    const formulaire = $('[data-llufan-formulaire]');
    if (!formulaire) return;
    const wilayaSelect = $('[data-llufan-wilaya]');
    const communeSelect = $('[data-llufan-commune]');
    const radios = Array.from(racine.querySelectorAll('[data-llufan-type] input[type="radio"]'));
    const blocAdresse = $('[data-llufan-adresse-bloc]');
    const champAdresse = $('[data-llufan-adresse]');
    const sortieSousTotal = $('[data-llufan-sous-total]');
    const sortieFrais = $('[data-llufan-frais]');
    const sortieTotal = $('[data-llufan-total]');
    const sortieSticky = $('[data-llufan-sticky-total]');
    const champRecapitulatif = $('[data-llufan-recapitulatif]');
    const recapVisible = $('[data-llufan-recap-visible]');
    const confirmation = $('[data-llufan-confirmation]');
    const avertissement = $('[data-llufan-avertissement]');
    const bouton = $('[data-llufan-bouton]');

    /* ------------------------------------------------------------------ état */
    let tarifs = null;            // contenu de llufan-livraison-dz.json
    let tarifsIndisponibles = false;
    let sousTotal = 0;            // en centimes
    let lignes = [];              // [{ texte, centimes }]
    let varianteValide = true;    // fiche produit : variante existante et disponible

    /* --------------------------------------------------------- affichage */
    const montantNoeud = (centimes) => {
      const conteneur = document.createElement('span');
      conteneur.className = 'montant';
      const nombre = document.createElement('bdi');
      nombre.dir = 'ltr';
      nombre.textContent = chiffres(centimes);
      conteneur.append(nombre, document.createTextNode(' ' + devise));
      return conteneur;
    };
    const montantTexte = (centimes) => chiffres(centimes) + ' ' + devise;
    const ecrireMontant = (noeud, centimes) => { if (noeud) noeud.replaceChildren(montantNoeud(centimes)); };
    const ecrireTexte = (noeud, texte) => { if (noeud) noeud.textContent = texte; };

    /* ----------------------------------------------------- wilaya / tarif */
    const wilayaCourante = () => {
      if (!tarifs || !wilayaSelect || !wilayaSelect.value) return null;
      return tarifs.wilayas.find((w) => `${w.code} - ${w.nom}` === wilayaSelect.value) || null;
    };
    const nomWilaya = (wilaya) => (enArabe && wilaya.nom_ar ? wilaya.nom_ar : wilaya.nom);
    /* Commune : nom arabe en page arabe s'il existe (même indice que la liste
       latine), sinon le nom latin — jamais un nom approximatif. */
    const nomCommune = (wilaya, index) => {
      const latin = wilaya.communes[index].replace('*', '');
      if (!enArabe || !wilaya.communes_ar) return latin;
      return wilaya.communes_ar[index] || latin;
    };
    const typeCourant = () => {
      const choisi = radios.find((r) => r.checked);
      return choisi ? choisi.value : 'domicile';
    };
    const tarifPour = (wilaya, type) => {
      if (!wilaya) return null;
      const valeur = type === 'domicile' ? wilaya.domicile : wilaya.stop_desk;
      return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
    };
    /* Frais en centimes (le tarif dépend de la wilaya et du mode), ou null si
       aucune wilaya n'est choisie ou si le tarif est absent du fichier. La
       commune reste obligatoire pour la simulation (voir verifier()). */
    const fraisCourants = () => {
      const wilaya = wilayaCourante();
      if (!wilaya) return null;
      const tarif = tarifPour(wilaya, typeCourant());
      return tarif === null ? null : tarif * 100;
    };

    const majTarifsAffiches = () => {
      const wilaya = wilayaCourante();
      radios.forEach((radio) => {
        const tarif = tarifPour(wilaya, radio.value);
        const sortie = racine.querySelector(`[data-llufan-prix="${radio.value}"]`);
        if (sortie) {
          if (tarif === null) ecrireTexte(sortie, '—');
          else ecrireMontant(sortie, tarif * 100);
        }
      });
    };

    const majPastilles = () => radios.forEach((radio) => {
      const pastille = radio.closest('[data-llufan-type-item]');
      if (pastille) pastille.classList.toggle('is-selected', radio.checked);
    });

    /* Adresse : seulement à domicile */
    const majAdresse = () => {
      if (!champAdresse || !blocAdresse) return;
      const domicile = typeCourant() === 'domicile';
      blocAdresse.hidden = !domicile;
      champAdresse.disabled = !domicile;
      champAdresse.required = domicile;
      champAdresse.setAttribute('aria-required', String(domicile));
      if (!domicile) effacerErreur('adresse');
    };

    const remplirCommunes = () => {
      if (!communeSelect) return;
      const wilaya = wilayaCourante();
      const vide = document.createElement('option');
      vide.value = '';
      vide.textContent = wilaya ? T.choisir : T.wilayaDabord;
      communeSelect.replaceChildren(vide);
      communeSelect.disabled = !wilaya;
      if (!wilaya) return;
      wilaya.communes.forEach((commune, index) => {
        const option = document.createElement('option');
        option.value = commune.replace('*', '');
        option.textContent = nomCommune(wilaya, index);
        communeSelect.appendChild(option);
      });
    };

    /* -------------------------------------------------------- récapitulatif */
    const champValeur = (nom) => {
      const champ = racine.querySelector(`[data-llufan-champ="${nom}"]`);
      return champ && !champ.disabled ? champ.value.trim().replace(/\s+/g, ' ') : '';
    };

    /* Lignes du récapitulatif : [libellé, valeur, nature] — la nature sert à
       isoler les chiffres (montant, téléphone) dans une page en arabe. */
    const lignesRecap = (frais, total) => {
      const wilaya = wilayaCourante();
      const commune = communeSelect && communeSelect.selectedIndex > 0
        ? communeSelect.options[communeSelect.selectedIndex].textContent : '';
      const domicile = typeCourant() === 'domicile';
      const sortie = lignes.map((ligne) => [ligne.texte, ligne.centimes, 'montant']);
      sortie.push(null);
      sortie.push([T.recapNom, champValeur('nom'), 'texte']);
      sortie.push([T.recapTelephone, champValeur('telephone'), 'ltr']);
      sortie.push([T.recapWilaya, wilaya ? `${wilaya.code} - ${nomWilaya(wilaya)}` : '', 'texte']);
      sortie.push([T.recapCommune, commune, 'texte']);
      sortie.push([T.recapType, domicile ? T.domicile : T.stopDesk, 'texte']);
      if (domicile && champValeur('adresse')) sortie.push([T.recapAdresse, champValeur('adresse'), 'texte']);
      sortie.push(null);
      sortie.push([T.recapSousTotal, sousTotal, 'montant']);
      sortie.push([T.recapFrais, frais === null ? T.aCalculer : frais, frais === null ? 'texte' : 'montant']);
      sortie.push([T.recapTotal, total === null ? '—' : total, total === null ? 'texte' : 'montant', 'total']);
      return sortie;
    };

    const remplirRecapitulatif = (frais, total) => {
      const entrees = lignesRecap(frais, total);
      if (champRecapitulatif) {
        champRecapitulatif.value = entrees
          .map((e) => (e ? `${e[0]} : ${e[2] === 'montant' ? montantTexte(e[1]) : e[1]}` : ''))
          .join('\n').replace(/\n{3,}/g, '\n\n').trim();
      }
      if (!recapVisible) return;
      const fragment = document.createDocumentFragment();
      entrees.forEach((entree) => {
        if (!entree) return;
        const [libelle, valeur, nature, role] = entree;
        if (nature !== 'montant' && !valeur) return; // champ encore vide : rien à montrer
        const rangee = document.createElement('div');
        rangee.className = 'commande__recap-ligne' + (role === 'total' ? ' commande__recap-ligne--total' : '');
        const etiquette = document.createElement('bdi');
        etiquette.className = 'commande__recap-libelle';
        etiquette.textContent = libelle;
        let contenu;
        if (nature === 'montant') {
          contenu = montantNoeud(valeur);
        } else {
          contenu = document.createElement('bdi');
          contenu.dir = nature === 'ltr' ? 'ltr' : 'auto';
          contenu.textContent = valeur;
        }
        contenu.classList.add('commande__recap-valeur');
        rangee.append(etiquette, contenu);
        fragment.appendChild(rangee);
      });
      recapVisible.replaceChildren(fragment);
    };

    /* ------------------------------------------------------------ calcul */
    const recalculer = () => {
      const frais = fraisCourants();
      const total = frais === null ? null : sousTotal + frais;
      ecrireMontant(sortieSousTotal, sousTotal);
      if (frais === null) ecrireTexte(sortieFrais, T.aCalculer); else ecrireMontant(sortieFrais, frais);
      if (total === null) ecrireTexte(sortieTotal, '—'); else ecrireMontant(sortieTotal, total);
      ecrireMontant(sortieSticky, total === null ? sousTotal : total);
      remplirRecapitulatif(frais, total);
    };

    /* La simulation affichée ne doit jamais rester visible après un changement */
    const masquerConfirmation = () => { if (confirmation) confirmation.hidden = true; };

    /* ------------------------------------------------------------ erreurs */
    const champ = (nom) => racine.querySelector(`[data-llufan-champ="${nom}"]`);
    const noeudErreur = (nom) => racine.querySelector(`[data-llufan-erreur="${nom}"]`);
    function effacerErreur(nom) {
      const c = champ(nom);
      const e = noeudErreur(nom);
      if (c) c.removeAttribute('aria-invalid');
      if (e) { e.textContent = ''; e.hidden = true; }
    }
    const signalerErreur = (nom, message) => {
      const c = champ(nom);
      const e = noeudErreur(nom);
      if (c) c.setAttribute('aria-invalid', 'true');
      if (e) { e.textContent = message; e.hidden = false; }
    };
    const avertir = (message) => {
      if (!avertissement) return;
      avertissement.textContent = message;
      avertissement.hidden = !message;
    };

    const verifier = () => {
      const erreurs = [];
      const nom = champValeur('nom');
      if (!nom) erreurs.push(['nom', T.erreurNom]);
      const telephone = champ('telephone');
      if (telephone && (!telephone.value.trim() || !telephone.checkValidity())) erreurs.push(['telephone', T.erreurTelephone]);
      if (!wilayaCourante()) erreurs.push(['wilaya', T.erreurWilaya]);
      else if (!communeSelect || !communeSelect.value) erreurs.push(['commune', T.erreurCommune]);
      if (typeCourant() === 'domicile' && champAdresse && champAdresse.value.trim().length < 5) erreurs.push(['adresse', T.erreurAdresse]);
      ['nom', 'telephone', 'wilaya', 'commune', 'adresse'].forEach(effacerErreur);
      erreurs.forEach(([nomChamp, message]) => signalerErreur(nomChamp, message));
      return erreurs;
    };

    /* ----------------------------------------------- fiche produit / panier */
    if (config.mode === 'produit') {
      const variantes = Array.isArray(config.variantes) ? config.variantes : [];
      const idFormulaire = config.formulaireProduit;
      const formulaireProduit = idFormulaire ? document.getElementById(idFormulaire) : null;
      const champQuantite = () => (idFormulaire
        ? document.querySelector(`input[name="quantity"][form="${idFormulaire}"]`)
        : null) || (formulaireProduit ? formulaireProduit.querySelector('input[name="quantity"]') : null);
      let varianteId = config.varianteInitiale;

      const majProduit = () => {
        const variante = variantes.find((v) => String(v.id) === String(varianteId)) || null;
        const saisie = champQuantite();
        const quantite = Math.max(1, parseInt(saisie && saisie.value, 10) || 1);
        varianteValide = !!(variante && variante.dispo);
        if (!variante) {
          sousTotal = 0;
          lignes = [];
        } else {
          sousTotal = variante.prix * quantite;
          const precision = variante.titre ? ` — ${variante.titre}` : '';
          lignes = [{ texte: `${quantite} × ${config.produit}${precision}`, centimes: sousTotal }];
        }
        masquerConfirmation();
        recalculer();
      };

      /* Variante : événement émis par le sélecteur de variantes (theme.js) */
      document.addEventListener('variant:change', (evenement) => {
        const detail = evenement.detail || {};
        if (idFormulaire && detail.formId && detail.formId !== idFormulaire) return;
        varianteId = detail.variant ? detail.variant.id : null;
        majProduit();
      });
      /* Quantité : boutons + / − (qui émettent « change ») et saisie directe */
      document.addEventListener('input', (evenement) => { if (evenement.target === champQuantite()) majProduit(); });
      document.addEventListener('change', (evenement) => { if (evenement.target === champQuantite()) majProduit(); });

      const idCourant = formulaireProduit && formulaireProduit.querySelector('input[name="id"]');
      if (idCourant && idCourant.value) varianteId = idCourant.value;
      majProduit();
    } else {
      const appliquerPanier = (total, lignesPanier) => {
        sousTotal = Number(total) || 0;
        lignes = (lignesPanier || []).map((ligne) => ({
          texte: `${ligne.quantite} × ${ligne.produit}${ligne.variante ? ` — ${ligne.variante}` : ''}`,
          centimes: ligne.total,
        }));
        masquerConfirmation();
        recalculer();
      };
      appliquerPanier(config.total, config.lignes);
      /* Panier modifié ailleurs dans la page (quantités, suppression) */
      document.addEventListener('llufan:panier-maj', (evenement) => {
        const panier = evenement.detail && evenement.detail.cart;
        if (!panier) return;
        if (!panier.item_count) { racine.hidden = true; return; }
        appliquerPanier(panier.total_price, (panier.items || []).map((item) => ({
          quantite: item.quantity,
          produit: item.product_title,
          variante: item.product_has_only_default_variant ? null : item.variant_title,
          total: item.final_line_price,
        })));
      });
    }

    /* ----------------------------------------------------------- écouteurs */
    if (wilayaSelect) wilayaSelect.addEventListener('change', () => {
      remplirCommunes();          // la commune précédente n'existe plus : remise à zéro
      majTarifsAffiches();
      effacerErreur('wilaya');
      effacerErreur('commune');
      avertir('');
      masquerConfirmation();
      recalculer();
    });
    if (communeSelect) communeSelect.addEventListener('change', () => {
      effacerErreur('commune');
      avertir('');
      masquerConfirmation();
      recalculer();
    });
    radios.forEach((radio) => radio.addEventListener('change', () => {
      majPastilles();
      majAdresse();
      avertir('');
      masquerConfirmation();
      recalculer();
    }));
    ['nom', 'telephone', 'adresse'].forEach((nom) => {
      const c = champ(nom);
      if (c) c.addEventListener('input', () => {
        if (c.getAttribute('aria-invalid') === 'true') effacerErreur(nom);
        masquerConfirmation();
        recalculer();
      });
    });

    formulaire.addEventListener('submit', (evenement) => {
      evenement.preventDefault();   // simulation : rien n'est jamais envoyé
      masquerConfirmation();
      if (tarifsIndisponibles) { avertir(T.erreurTarifsCharges); return; }
      if (config.mode === 'produit' && !varianteValide) {
        avertir(T.erreurVariante);
        if (avertissement) avertissement.focus({ preventScroll: false });
        return;
      }
      const erreurs = verifier();
      if (erreurs.length) {
        avertir(T.erreurResume);
        const premier = champ(erreurs[0][0]);
        if (premier) premier.focus();
        return;
      }
      const frais = fraisCourants();
      if (frais === null) {
        avertir(T.erreurTarif);
        if (avertissement) avertissement.focus();
        return;
      }
      avertir('');
      recalculer();
      if (confirmation) {
        confirmation.hidden = false;
        confirmation.focus({ preventScroll: true });
        confirmation.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    /* Barre mobile : amène au formulaire, puis au premier champ à remplir */
    const raccourci = $('[data-llufan-sticky]');
    const barreMobile = raccourci ? raccourci.closest('.commande__barre') : null;
    if (raccourci) raccourci.addEventListener('click', (evenement) => {
      evenement.preventDefault();
      /* Défilement centré sur le champ à remplir : il ne passe ni sous
         l'en-tête collant (en haut) ni sous la barre (en bas). */
      const aRemplir = ['nom', 'telephone', 'wilaya'].map(champ).find((c) => c && !c.value);
      const cible = aRemplir || bouton || formulaire;
      cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (aRemplir) aRemplir.focus({ preventScroll: true });
    });
    /* … et s'efface quand le formulaire est à l'écran (pas de doublon, pas de champ masqué) */
    if (barreMobile && 'IntersectionObserver' in window) {
      new IntersectionObserver((entrees) => {
        entrees.forEach((entree) => barreMobile.classList.toggle('commande__barre--masquee', entree.isIntersecting));
      }, { threshold: 0 }).observe(formulaire);
    }

    /* --------------------------------------------------------- démarrage */
    majPastilles();
    majAdresse();
    recalculer();
    chargerTarifs(racine.dataset.src).then((donnees) => {
      tarifs = donnees;
      if (wilayaSelect) {
        const fragment = document.createDocumentFragment();
        tarifs.wilayas.forEach((wilaya) => {
          const option = document.createElement('option');
          option.value = `${wilaya.code} - ${wilaya.nom}`;
          option.textContent = `${wilaya.code} - ${nomWilaya(wilaya)}`;
          fragment.appendChild(option);
        });
        wilayaSelect.appendChild(fragment);
      }
      majTarifsAffiches();
      recalculer();
    }).catch(() => {
      /* Sans fichier de tarifs : les frais restent « à calculer » et la
         simulation est bloquée avec un message, plutôt qu'un total inventé. */
      tarifsIndisponibles = true;
      if (bouton) bouton.setAttribute('aria-disabled', 'true');
      avertir(T.erreurTarifsCharges);
    });
  };

  const tout = (contexte) => contexte.querySelectorAll('[data-llufan-commande]').forEach(initialiser);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tout(document));
  else tout(document);
  /* Éditeur de thème : une section rechargée reçoit un nouveau formulaire */
  document.addEventListener('shopify:section:load', (evenement) => tout(evenement.target));
})();
