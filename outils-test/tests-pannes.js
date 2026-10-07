/* Pannes de rendu après une mutation réussie — banc local SIMULÉ (pas Shopify réel).
   node tests-pannes.js <port> */
const { chromium } = require('playwright');
const PORT = process.argv[2] || 4840;
const B = `http://localhost:${PORT}`;
const PRODUIT = '/products/nomad-coussin-dallaitement-llufan';
const ID = { Bleu: '47934041358497', Gris: '47934041424033' };
const COULEUR = { fr: { Bleu: 'Bleu', Gris: 'Gris' }, ar: { Bleu: 'أزرق', Gris: 'رمادي' } };
const norm = (s) => String(s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const res = [];
const test = async (n, f) => { try { await f(); res.push(['✔', n]); } catch (e) { res.push(['✘', n, String(e.message).split('\n')[0].slice(0, 260)]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => ok(norm(a) === norm(b), `${m} : obtenu « ${norm(a)} », attendu « ${norm(b)} »`);

(async () => {
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = async (w = 1280, h = 900) => {
    const p = await (await nav.newContext({ viewport: { width: w, height: h } })).newPage();
    p.erreurs = []; p.on('pageerror', (e) => p.erreurs.push(e.message));
    return p;
  };
  const get = (p, u) => p.request.get(B + u);
  const panne = (p, modes) => get(p, `/__test/panne?modes=${modes}`);
  const panier = async (p) => (await (await get(p, '/cart.js')).json());
  const mutations = async (p) => (await (await get(p, '/__test/mutations')).json());
  const alerte = (p) => p.locator('[data-cart-alerte]');
  const ligne = (p, langue, c) => p.locator('[data-cart-section] .line-item', { hasText: COULEUR[langue][c] });
  const preparerPanier = async (p) => {
    await get(p, '/__test/reset');
    await p.request.post(`${B}/cart/add.js`, { data: { id: ID.Gris, quantity: 1 } });
    await p.request.post(`${B}/cart/add.js`, { data: { id: ID.Bleu, quantity: 2 } });
  };
  const destination = async (p) => {
    await p.waitForFunction(() => document.querySelectorAll('[data-llufan-wilaya] option').length > 60);
    await p.selectOption('[data-llufan-wilaya]', '16 - Alger');
    await p.selectOption('[data-llufan-commune]', 'Bab El Oued');
  };
  const t = (p, s) => p.locator(s).first().innerText();

  for (const langue of ['fr', 'ar']) {
    const L = langue.toUpperCase(); const r = langue === 'ar' ? '/ar' : '';
    const dev = langue === 'ar' ? 'د.ج' : 'DA';
    const estArabe = (s) => /[؀-ۿ]/.test(s);

    for (const mode of ['sections-500', 'sections-null', 'sections-absente', 'sections-coupee']) {
      await test(`${L} ajout réussi, rendu ${mode} : un seul ajout, compteur juste, message clair`, async () => {
        const p = await page(); await get(p, '/__test/reset');
        await p.goto(B + r + PRODUIT); await p.waitForTimeout(300);
        await panne(p, mode);
        await p.locator('.buy-buttons button[type="submit"]').click();
        await p.waitForTimeout(1200);
        const m = await mutations(p);
        eq(m.add, 1, 'requêtes add.js'); eq(m.ajoutNatif, 0, 'envois natifs /cart/add (form.submit)');
        eq((await panier(p)).item_count, 1, 'articles au panier');
        eq(await t(p, '[data-cart-count]'), 1, 'compteur de l’en-tête');
        ok(await alerte(p).isVisible(), 'message d’erreur visible');
        const msg = await alerte(p).innerText();
        ok(langue === 'ar' ? estArabe(msg) : /mis à jour/.test(msg), 'message dans la langue : ' + msg);
        ok(p.erreurs.length === 0, 'erreurs JS : ' + p.erreurs.join(' | '));
        await p.context().close();
      });
    }

    await test(`${L} ajout : ajout réel puis erreur 502 → aucun renvoi, message « impossible de confirmer »`, async () => {
      const p = await page(); await get(p, '/__test/reset');
      await p.goto(B + r + PRODUIT); await p.waitForTimeout(300);
      await panne(p, 'add-reponse-perdue');
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForTimeout(1500);
      const m = await mutations(p);
      eq(m.add, 1, 'requêtes add.js'); eq(m.ajoutNatif, 0, 'envois natifs /cart/add');
      eq((await panier(p)).item_count, 1, 'articles au panier (pas de doublon)');
      const err = await t(p, '[data-cart-error]');
      ok(langue === 'ar' ? estArabe(err) : /Connexion interrompue/.test(err), 'message réseau : ' + err);
      eq(await t(p, '[data-cart-count]'), 1, 'compteur resynchronisé par lecture du panier');
      await p.context().close();
    });

    for (const mode of ['sections-null', 'sections-500', 'sections-absente', 'sections-coupee']) {
      await test(`${L} page panier, « + » avec rendu ${mode} : formulaire, boutons et montants resynchronisés`, async () => {
        const p = await page(); await preparerPanier(p);
        await p.goto(B + r + '/cart'); await destination(p);
        await panne(p, mode);
        await ligne(p, langue, 'Gris').locator('[data-action="plus"]').click();
        await p.waitForFunction(() => /12\s?800/.test(document.querySelector('[data-llufan-sous-total]').textContent.replace(/ /g, ' ')), null, { timeout: 5000 });
        eq(await t(p, '[data-llufan-total]'), `13 200 ${dev}`, 'total formulaire (domicile)');
        await alerte(p).waitFor({ state: 'visible', timeout: 8000 });
        const g = ligne(p, langue, 'Gris');
        eq(await g.locator('.quantity-selector__input').innerText(), 2, 'quantité affichée');
        eq(await g.locator('[data-action="moins"]').getAttribute('data-quantity'), 1, 'data-quantity du bouton −');
        eq(await g.locator('[data-action="plus"]').getAttribute('data-quantity'), 3, 'data-quantity du bouton +');
        eq(await g.locator('.line-item__price').innerText(), `6 400 ${dev}`, 'prix de ligne');
        if (await p.locator('[data-cart-section] [data-cart-total]').count()) eq(await t(p, '[data-cart-section] [data-cart-total]'), `12 800 ${dev}`, 'sous-total page panier (si affiché)');
        ok(await alerte(p).isVisible(), 'message d’erreur visible');
        // second « + » : part de la bonne quantité (3), sans rejouer la première
        await g.locator('[data-action="plus"]').click();
        await p.waitForFunction(() => /16\s?000/.test(document.querySelector('[data-llufan-sous-total]').textContent.replace(/ /g, ' ')), null, { timeout: 5000 });
        const c = await panier(p);
        eq(c.items.find((i) => String(i.id) === ID.Gris).quantity, 3, 'Gris au panier après deux « + »');
        eq((await mutations(p)).change, 2, 'requêtes change.js');
        ok(p.erreurs.length === 0, 'erreurs JS : ' + p.erreurs.join(' | '));
        await p.context().close();
      });
    }

    await test(`${L} page panier, suppression avec rendu null : ligne retirée, formulaire à 3 200`, async () => {
      const p = await page(); await preparerPanier(p);
      await p.goto(B + r + '/cart'); await destination(p);
      await panne(p, 'sections-null');
      await ligne(p, langue, 'Bleu').locator('[data-action="retirer"]').click();
      await p.waitForFunction(() => /^3\s?200/.test(document.querySelector('[data-llufan-sous-total]').textContent.trim().replace(/ /g, ' ')), null, { timeout: 5000 });
      await alerte(p).waitFor({ state: 'visible', timeout: 8000 });
      eq(await ligne(p, langue, 'Bleu').count(), 0, 'ligne Bleu retirée');
      ok(!norm(await t(p, '[data-llufan-recap-visible]')).includes(COULEUR[langue].Bleu), 'Bleu absent du récapitulatif');
      eq(await t(p, '[data-llufan-total]'), `3 600 ${dev}`, 'total formulaire');
      await p.context().close();
    });

    await test(`${L} page panier, modification refusée (change 500) : panier et affichage inchangés, message`, async () => {
      const p = await page(); await preparerPanier(p);
      await p.goto(B + r + '/cart'); await destination(p);
      await panne(p, 'change-500');
      await ligne(p, langue, 'Gris').locator('[data-action="plus"]').click();
      await p.waitForTimeout(1000);
      eq((await panier(p)).total_price, 960000, 'panier réel inchangé');
      eq(await ligne(p, langue, 'Gris').locator('.quantity-selector__input').innerText(), 1, 'quantité affichée inchangée');
      eq(await t(p, '[data-llufan-sous-total]'), `9 600 ${dev}`, 'sous-total formulaire inchangé');
      ok(await alerte(p).isVisible(), 'message visible');
      eq((await mutations(p)).change, 1, 'une seule tentative, pas de relance');
      await p.context().close();
    });

    await test(`${L} tiroir ouvert, « + » avec rendu 500 : tiroir resynchronisé, reste ouvert, message au-dessus`, async () => {
      const p = await page(390, 844); await get(p, '/__test/reset');
      await p.goto(B + r + PRODUIT); await p.waitForTimeout(300);
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForSelector('#cart-drawer.is-open');
      await panne(p, 'sections-500');
      await p.locator('#cart-drawer [data-action="plus"]').click();
      await p.waitForTimeout(1000);
      eq(await p.locator('#cart-drawer .quantity-selector__input').innerText(), 2, 'quantité dans le tiroir');
      eq(await p.locator('#cart-drawer [data-action="plus"]').getAttribute('data-quantity'), 3, 'data-quantity du +');
      eq(await t(p, '#cart-drawer [data-cart-total]'), `6 400 ${dev}`, 'sous-total du tiroir');
      eq(await p.locator('#cart-drawer.is-open').count(), 1, 'tiroir ouvert');
      const dessus = await p.evaluate(() => { const a = document.querySelector('[data-cart-alerte]'); const b = a.getBoundingClientRect(); const e = document.elementFromPoint(b.left + 10, b.top + b.height / 2); return a.contains(e); });
      ok(dessus, 'message non recouvert par le tiroir');
      await p.context().close();
    });

    await test(`${L} retour à la normale : après une panne, la modification suivante re-rend et efface le message`, async () => {
      const p = await page(); await preparerPanier(p);
      await p.goto(B + r + '/cart'); await destination(p);
      await panne(p, 'sections-null');
      await ligne(p, langue, 'Gris').locator('[data-action="plus"]').click();
      await alerte(p).waitFor({ state: 'visible', timeout: 8000 });
      await panne(p, '');
      await ligne(p, langue, 'Gris').locator('[data-action="plus"]').click();
      await p.waitForFunction(() => /16\s?000/.test(document.querySelector('[data-llufan-sous-total]').textContent.replace(/ /g, ' ')), null, { timeout: 5000 });
      await alerte(p).waitFor({ state: 'hidden', timeout: 8000 });
      eq(await ligne(p, langue, 'Gris').locator('.quantity-selector__input').innerText(), 3, 'quantité re-rendue');
      await p.context().close();
    });
  }
  await nav.close();
  console.log(`=== pannes (simulé) : ${res.filter((x) => x[0] === '✔').length}/${res.length} ===`);
  res.forEach((x) => console.log(x[0], x[1], x[2] ? '\n    → ' + x[2] : ''));
})();
