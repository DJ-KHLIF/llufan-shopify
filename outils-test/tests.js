/* Tests de non-régression LLUFAN — navigateur réel (Chromium / Playwright)
   contre le banc local (serveur.js). Usage : node tests.js <port> [libellé] */
const { chromium } = require('playwright');
const PORT = process.argv[2] || 4810;
const NOM = process.argv[3] || 'branche';
const BASE = `http://localhost:${PORT}`;
const PRODUIT = '/products/nomad-coussin-dallaitement-llufan';
const ID = { Bleu: '47934041358497', Rose: '47934041391265', Gris: '47934041424033' };
const resultats = [];
const norm = (s) => String(s ?? '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();

const test = async (nom, fn) => {
  try { await fn(); resultats.push(['OK', nom]); } catch (e) { resultats.push(['ÉCHEC', nom, String(e.message || e).split('\n')[0].slice(0, 300)]); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const egal = (a, b, msg) => assert(norm(a) === norm(b), `${msg} : obtenu « ${norm(a)} », attendu « ${norm(b)} »`);

(async () => {
  const navigateur = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const nouvellePage = async (largeur = 1280, hauteur = 900) => {
    const ctx = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, locale: 'fr-FR' });
    const p = await ctx.newPage();
    p.erreurs = [];
    p.on('pageerror', (e) => p.erreurs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) p.erreurs.push(m.text()); });
    return p;
  };
  const reset = (p) => p.request.get(`${BASE}/__test/reset`);
  const racine = (langue) => (langue === 'ar' ? '/ar' : '');
  const choisirDestination = async (p, wilaya, commune) => {
    await p.waitForFunction(() => document.querySelectorAll('[data-llufan-wilaya] option').length > 60);
    await p.selectOption('[data-llufan-wilaya]', { value: wilaya });
    await p.selectOption('[data-llufan-commune]', { value: commune });
  };
  const texte = (p, sel) => p.locator(sel).first().innerText();
  const recap = (p) => p.locator('[data-llufan-recap-visible]').innerText();

  for (const langue of ['fr', 'ar']) {
    const L = langue.toUpperCase();
    const devise = langue === 'ar' ? 'د.ج' : 'DA';

    await test(`${L} fiche produit : chargement sans erreur JS, sens d'écriture`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await p.waitForTimeout(300);
      const dir = await p.getAttribute('html', 'dir');
      egal(dir, langue === 'ar' ? 'rtl' : 'ltr', 'dir');
      assert(p.erreurs.length === 0, 'erreurs JS : ' + p.erreurs.join(' | '));
      await p.context().close();
    });

    await test(`${L} sélection Bleu / Rose / Gris : variante, légende, prix`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      for (const c of ['Rose', 'Gris', 'Bleu']) {
        await p.locator('.variant-picker label', { hasText: c }).click();
        egal(await p.inputValue('form.shopify-product-form input[name="id"]'), ID[c], `id variante ${c}`);
        const legende = await p.locator('[data-option-value]').first().innerText().catch(() => '');
        egal(legende, c, 'valeur affichée dans la légende');
        const r = await recap(p);
        assert(norm(r).includes(`1 × LLUFAN Nomade — Coussin d’allaitement compact — ${c}`), `récap variante ${c} : ${norm(r)}`);
      }
      const prix = await texte(p, '[data-variant-price]');
      egal(prix, `3 200 ${devise}`, 'prix fiche');
      await p.context().close();
    });

    await test(`${L} quantités + / − et saisie directe : sous-total immédiat`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await p.locator('.variant-picker label', { hasText: 'Gris' }).click();
      const plus = p.locator('.product-info [data-quantity-button="plus"]');
      const moins = p.locator('.product-info [data-quantity-button="minus"]');
      await plus.click(); await plus.click();
      egal(await texte(p, '[data-llufan-sous-total]'), `9 600 ${devise}`, 'sous-total après + +');
      await moins.click();
      egal(await texte(p, '[data-llufan-sous-total]'), `6 400 ${devise}`, 'sous-total après −');
      const q = p.locator('.product-info input[name="quantity"]');
      await q.fill('5');
      egal(await texte(p, '[data-llufan-sous-total]'), `16 000 ${devise}`, 'sous-total saisie 5');
      await q.fill('0'); await q.press('Tab');
      egal(await q.inputValue(), '1', 'quantité 0 corrigée');
      egal(await texte(p, '[data-llufan-sous-total]'), `3 200 ${devise}`, 'sous-total après correction');
      await q.fill('-4'); await q.press('Tab');
      egal(await q.inputValue(), '1', 'quantité négative corrigée');
      await p.context().close();
    });

    await test(`${L} COD fiche : Alger / Bab El Oued domicile puis stop-desk (3 × 3 200)`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      const q = p.locator('.product-info input[name="quantity"]');
      await q.fill('3');
      await choisirDestination(p, '16 - Alger', 'Bab El Oued');
      egal(await texte(p, '[data-llufan-frais]'), `400 ${devise}`, 'frais domicile');
      egal(await texte(p, '[data-llufan-total]'), `10 000 ${devise}`, 'total domicile');
      await p.locator('[data-llufan-type] label').nth(1).click();
      egal(await texte(p, '[data-llufan-frais]'), `250 ${devise}`, 'frais stop-desk');
      egal(await texte(p, '[data-llufan-total]'), `9 850 ${devise}`, 'total stop-desk');
      egal(await texte(p, '[data-llufan-sticky-total]'), `9 850 ${devise}`, 'barre mobile = total');
      const r = norm(await recap(p));
      assert(r.includes(`9 850 ${devise}`), 'récap total stop-desk : ' + r);
      await p.context().close();
    });

    await test(`${L} adresse : obligatoire à domicile, masquée/désactivée/absente du récap en stop-desk`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      const adresse = p.locator('[data-llufan-adresse]');
      assert(await adresse.isVisible(), 'adresse visible à domicile');
      assert(await adresse.evaluate((e) => e.required && !e.disabled), 'adresse obligatoire à domicile');
      await adresse.fill('12 rue des Oliviers, Bab El Oued');
      await choisirDestination(p, '16 - Alger', 'Bab El Oued');
      assert(norm(await recap(p)).includes('12 rue des Oliviers'), 'adresse dans le récap à domicile');
      await p.locator('[data-llufan-type] label').nth(1).click();
      assert(!(await adresse.isVisible()), 'adresse masquée en stop-desk');
      assert(await adresse.evaluate((e) => e.disabled && !e.required), 'adresse désactivée, non obligatoire');
      assert(!norm(await recap(p)).includes('12 rue des Oliviers'), 'adresse absente du récap en stop-desk');
      const brut = await p.locator('[data-llufan-recapitulatif]').inputValue();
      assert(!brut.includes('12 rue des Oliviers'), 'adresse absente du texte brut');
      await p.locator('[data-llufan-type] label').nth(0).click();
      assert(await adresse.isVisible(), 'adresse réaffichée à domicile');
      await p.context().close();
    });

    await test(`${L} changement de wilaya : commune remise à zéro, frais mis à jour`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await choisirDestination(p, '16 - Alger', 'Bab El Oued');
      await p.selectOption('[data-llufan-wilaya]', { value: '31 - Oran' });
      egal(await p.inputValue('[data-llufan-commune]'), '', 'commune remise à zéro');
      assert(!norm(await recap(p)).includes('Bab El Oued') && !norm(await recap(p)).includes('باب الوادي'), 'ancienne commune absente du récap');
      const frais = await texte(p, '[data-llufan-frais]');
      assert(/\d/.test(frais), 'frais Oran affichés : ' + frais);
      await p.context().close();
    });

    await test(`${L} validation : champs manquants, erreurs dans la langue, aucune simulation`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await p.locator('[data-llufan-bouton]').click();
      assert(await p.locator('[data-llufan-avertissement]').isVisible(), 'message de synthèse');
      const errNom = await texte(p, '[data-llufan-erreur="nom"]');
      assert(langue === 'ar' ? /[؀-ۿ]/.test(errNom) : /nom/i.test(errNom), 'erreur nom dans la langue : ' + errNom);
      assert(await p.locator('[data-llufan-champ="nom"]').evaluate((e) => e === document.activeElement), 'focus sur le premier champ en erreur');
      assert(!(await p.locator('[data-llufan-confirmation]').isVisible()), 'pas de confirmation');
      await p.context().close();
    });

    await test(`${L} simulation : confirmation explicite, aucune requête envoyée`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await p.fill('[data-llufan-champ="nom"]', 'Test Simulation');
      await p.fill('[data-llufan-champ="telephone"]', '0772 00 00 00');
      await choisirDestination(p, '16 - Alger', 'Bab El Oued');
      await p.fill('[data-llufan-adresse]', '12 rue des Oliviers');
      const requetes = [];
      p.on('request', (r) => { if (r.method() !== 'GET') requetes.push(r.method() + ' ' + r.url()); });
      const avantUrl = p.url();
      await p.locator('[data-llufan-bouton]').click();
      await p.waitForTimeout(400);
      assert(await p.locator('[data-llufan-confirmation]').isVisible(), 'confirmation visible');
      const conf = await texte(p, '[data-llufan-confirmation]');
      assert(langue === 'ar' ? conf.includes('محاكاة') : /simulation/i.test(conf), 'confirmation dit « simulation » : ' + conf);
      assert(!/enregistr/i.test(conf), 'jamais « commande enregistrée »');
      assert(requetes.length === 0, 'requêtes envoyées : ' + requetes.join(', '));
      egal(p.url(), avantUrl, 'pas de navigation');
      await p.fill('[data-llufan-champ="nom"]', 'Test Simulation 2');
      assert(!(await p.locator('[data-llufan-confirmation]').isVisible()), 'confirmation masquée après modification');
      await p.context().close();
    });

    await test(`${L} panier multi-articles : 1 Gris + 2 Bleus = 9 600, domicile 10 000, stop-desk 9 850`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await p.locator('.variant-picker label', { hasText: 'Gris' }).click();
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForSelector('#cart-drawer.is-open');
      await p.keyboard.press('Escape');
      await p.locator('.variant-picker label', { hasText: 'Bleu' }).click();
      await p.fill('.product-info input[name="quantity"]', '2');
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForSelector('#cart-drawer.is-open');
      egal((await p.locator('#cart-drawer .line-item').count()), '2', 'deux lignes dans le tiroir');
      egal(await texte(p, '#cart-drawer .cart-totals__row--total span:last-child'), `9 600 ${devise}`, 'sous-total tiroir');
      const lien = await p.locator('#cart-drawer .drawer__footer a.button').getAttribute('href');
      egal(lien, `${racine(langue)}/cart#commander`, 'lien Commander du tiroir (langue conservée)');
      await p.goto(BASE + racine(langue) + '/cart');
      egal(await texte(p, '[data-llufan-sous-total]'), `9 600 ${devise}`, 'sous-total formulaire panier');
      await choisirDestination(p, '16 - Alger', 'Bab El Oued');
      egal(await texte(p, '[data-llufan-total]'), `10 000 ${devise}`, 'total domicile');
      await p.locator('[data-llufan-type] label').nth(1).click();
      egal(await texte(p, '[data-llufan-total]'), `9 850 ${devise}`, 'total stop-desk');
      const r = norm(await recap(p));
      assert(r.includes('1 × LLUFAN Nomade — Coussin d’allaitement compact — Gris') && r.includes('2 × LLUFAN Nomade — Coussin d’allaitement compact — Bleu'), 'deux lignes dans le récap : ' + r);
      await p.context().close();
    });

    await test(`${L} panier : modification, suppression, synchronisation du formulaire, panier vide`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.request.post(`${BASE}/cart/add.js`, { data: { id: ID.Gris, quantity: 1 } });
      await p.request.post(`${BASE}/cart/add.js`, { data: { id: ID.Bleu, quantity: 2 } });
      await p.goto(BASE + racine(langue) + '/cart');
      await choisirDestination(p, '16 - Alger', 'Bab El Oued');
      const ligneGris = p.locator('[data-cart-section] .line-item', { hasText: 'Gris' });
      await ligneGris.locator('[data-action="plus"]').click();
      await p.waitForFunction(() => /12\s?800/.test(document.querySelector('[data-llufan-sous-total]').textContent.replace(/ /g, ' ')));
      egal(await texte(p, '[data-llufan-total]'), `13 200 ${devise}`, 'total après + (domicile)');
      assert(norm(await recap(p)).includes('2 × LLUFAN Nomade — Coussin d’allaitement compact — Gris'), 'récap après +');
      egal(await p.locator('[data-cart-section] .line-item', { hasText: 'Gris' }).locator('.quantity-selector__input').innerText(), '2', 'quantité affichée sur la page panier');
      await p.locator('[data-cart-section] .line-item', { hasText: 'Bleu' }).locator('[data-action="retirer"]').click();
      await p.waitForFunction(() => /6\s?400/.test(document.querySelector('[data-llufan-sous-total]').textContent.replace(/ /g, ' ')));
      assert(!norm(await recap(p)).includes('Bleu'), 'ligne supprimée absente du récap');
      egal(await p.locator('[data-cart-section] .line-item').count(), '1', 'une ligne restante');
      egal(await p.inputValue('[data-llufan-commune]'), 'Bab El Oued', 'destination conservée');
      await p.locator('[data-cart-section] .line-item [data-action="retirer"]').click();
      await p.waitForLoadState('load'); await p.waitForTimeout(500);
      egal(await p.locator('[data-llufan-commande]').count(), '0', 'plus de formulaire (ni ancien récap) sur panier vide');
      assert(await p.locator('.empty-state').isVisible(), 'état panier vide');
      await p.context().close();
    });

    await test(`${L} double clic « Ajouter au panier » : un seul ajout`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await p.locator('.buy-buttons button[type="submit"]').dblclick();
      await p.waitForSelector('#cart-drawer.is-open'); await p.waitForTimeout(400);
      const panier = await (await p.request.get(`${BASE}/cart.js`)).json();
      egal(panier.item_count, '1', 'quantité au panier');
      await p.context().close();
    });

    await test(`${L} variante indisponible : non sélectionnable, simulation bloquée`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.request.get(`${BASE}/__test/indisponible?id=${ID.Rose}`);
      await p.goto(BASE + racine(langue) + PRODUIT);
      assert(await p.locator(`.variant-picker input[value="Rose"]`).isDisabled(), 'Rose désactivée');
      // forcer la sélection (contournement) : la simulation doit refuser
      await p.evaluate(() => { const i = document.querySelector('.variant-picker input[value="Rose"]'); i.disabled = false; i.click(); });
      egal(await p.locator('.buy-buttons button[type="submit"]').isDisabled(), 'true', 'bouton d’ajout désactivé');
      await p.fill('[data-llufan-champ="nom"]', 'Test'); await p.fill('[data-llufan-champ="telephone"]', '0772000000');
      await choisirDestination(p, '16 - Alger', 'Bab El Oued'); await p.fill('[data-llufan-adresse]', '12 rue des Oliviers');
      await p.locator('[data-llufan-bouton]').click();
      assert(!(await p.locator('[data-llufan-confirmation]').isVisible()), 'pas de simulation pour une variante indisponible');
      assert(await p.locator('[data-llufan-avertissement]').isVisible(), 'message variante indisponible');
      await p.request.get(`${BASE}/__test/indisponible`);
      await p.context().close();
    });

    for (const [largeur, hauteur] of [[360, 740], [390, 844]]) {
      await test(`${L} mobile ${largeur}px : aucun débordement horizontal (fiche + panier)`, async () => {
        const p = await nouvellePage(largeur, hauteur); await reset(p);
        await p.request.post(`${BASE}/cart/add.js`, { data: { id: ID.Gris, quantity: 1 } });
        for (const url of [PRODUIT, '/cart']) {
          await p.goto(BASE + racine(langue) + url); await p.waitForTimeout(300);
          if (url === '/cart' || url === PRODUIT) await choisirDestination(p, '16 - Alger', 'Bab El Oued');
          const deb = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          assert(deb <= 1, `${url} déborde de ${deb}px`);
          const coupes = await p.evaluate(() => Array.from(document.querySelectorAll('.commande button, .commande .button, .buy-buttons button')).filter((b) => b.offsetParent && b.getBoundingClientRect().right > window.innerWidth + 1).length);
          assert(coupes === 0, `${url} : ${coupes} bouton(s) coupé(s)`);
        }
        await p.context().close();
      });
    }

    await test(`${L} mobile : « Voir le formulaire » amène un champ visible, non masqué`, async () => {
      const p = await nouvellePage(390, 844); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await p.waitForTimeout(300);
      const barre = p.locator('[data-llufan-sticky]');
      assert(await barre.isVisible(), 'barre mobile visible');
      await barre.click(); await p.waitForTimeout(900);
      const r = await p.evaluate(() => {
        const champ = document.activeElement;
        const box = champ.getBoundingClientRect();
        const entete = document.querySelector('.header');
        const bas = entete ? entete.getBoundingClientRect().bottom : 0;
        const barre = document.querySelector('.commande__barre');
        const haut = barre && getComputedStyle(barre).opacity !== '0' ? barre.getBoundingClientRect().top : window.innerHeight;
        return { tag: champ.tagName, top: box.top, bottom: box.bottom, bas, haut };
      });
      assert(['INPUT', 'SELECT'].includes(r.tag), 'focus sur un champ : ' + r.tag);
      assert(r.top >= r.bas - 1 && r.bottom <= r.haut + 1, `champ masqué (haut ${r.top} / en-tête ${r.bas} / barre ${r.haut})`);
      await p.context().close();
    });

    await test(`${L} liens internes : la langue est conservée`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      const liens = await p.evaluate(() => Array.from(document.querySelectorAll('a[href^="/"]')).map((a) => a.getAttribute('href')));
      const fautifs = langue === 'ar' ? liens.filter((h) => !h.startsWith('/ar') && !h.startsWith('/cdn') && !h.startsWith('/policies')) : [];
      assert(fautifs.length === 0, 'liens sans /ar : ' + [...new Set(fautifs)].join(', '));
      await p.context().close();
    });

    await test(`${L} formulaire : textes dans la langue (pas de mélange FR/AR)`, async () => {
      const p = await nouvellePage(); await reset(p);
      await p.goto(BASE + racine(langue) + PRODUIT);
      await choisirDestination(p, '16 - Alger', 'Bab El Oued');
      const t = await p.locator('[data-llufan-commande]').innerText();
      if (langue === 'ar') {
        const francais = (t.match(/\b(Simulation|Adresse|Récapitulatif|Tester|Voir le formulaire|Livraison|Commune|Wilaya|domicile|Choisir)\b/g) || []);
        assert(francais.length === 0, 'mots français dans le formulaire arabe : ' + francais.join(', '));
        assert(t.includes('الجزائر'), 'wilaya en arabe');
      } else {
        assert(!/[؀-ۿ]/.test(t), 'arabe dans le formulaire français');
      }
      await p.context().close();
    });
  }

  await test('Clés de langue : aucune clé manquante pendant les rendus (FR et AR)', async () => {
    const m = await (await (await navigateur.newContext()).request.get(`${BASE}/__test/manquantes`)).json();
    assert(m.length === 0, 'clés manquantes : ' + m.join(', '));
  });

  await navigateur.close();
  const ok = resultats.filter((r) => r[0] === 'OK').length;
  console.log(`\n=== ${NOM} : ${ok}/${resultats.length} réussis ===`);
  resultats.forEach((r) => console.log(`${r[0] === 'OK' ? '✔' : '✘'} ${r[1]}${r[2] ? '\n    → ' + r[2] : ''}`));
  process.exit(ok === resultats.length ? 0 : 1);
})();
