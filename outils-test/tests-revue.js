/* Cas relevés par la revue de code — banc local SIMULÉ (pas Shopify réel). node tests-revue.js <port> */
const { chromium } = require('playwright');
const B = `http://localhost:${process.argv[2] || 4840}`;
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
  const page = async (w = 1280, h = 900) => { const p = await (await nav.newContext({ viewport: { width: w, height: h } })).newPage(); p.erreurs = []; p.on('pageerror', (e) => p.erreurs.push(e.message)); return p; };
  const get = (p, u) => p.request.get(B + u);
  const panne = (p, m) => get(p, `/__test/panne?modes=${m}`);
  const panier = async (p) => (await (await get(p, '/cart.js')).json());
  const mutations = async (p) => (await (await get(p, '/__test/mutations')).json());
  const messages = (p) => p.evaluate(() => Array.from(document.querySelectorAll('[data-cart-alerte]:not([hidden]), [data-cart-error]:not([hidden])')).map((e) => e.innerText).join(' | '));
  for (const langue of ['fr', 'ar']) {
    const L = langue.toUpperCase(); const r = langue === 'ar' ? '/ar' : '';
    const reseau = langue === 'ar' ? 'تعذّر تأكيد العملية' : 'impossible de confirmer';
    const misAJour = langue === 'ar' ? 'تم تحديث سلتك' : 'bien été mis à jour';

    await test(`${L} [revue 1] ajout appliqué puis 502, rendu OK : « impossible de confirmer » reste affiché`, async () => {
      const p = await page(); await get(p, '/__test/reset');
      await p.goto(B + r + PRODUIT); await p.waitForTimeout(300);
      await panne(p, 'add-reponse-perdue');
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForTimeout(1500);
      const m = await messages(p);
      ok(m.includes(reseau), 'message « impossible de confirmer » visible : ' + m);
      ok(!m.includes(misAJour), 'jamais « mis à jour » : ' + m);
      eq((await mutations(p)).add, 1, 'add.js'); eq((await panier(p)).item_count, 1, 'articles');
      await p.context().close();
    });

    await test(`${L} [revue 2] modification appliquée puis 502, rendu en échec : pas de « mis à jour », affichage = état réel`, async () => {
      const p = await page(); await get(p, '/__test/reset');
      await p.request.post(`${B}/cart/add.js`, { data: { id: ID.Gris, quantity: 1 } });
      await p.goto(B + r + '/cart'); await p.waitForTimeout(500);
      await panne(p, 'change-502-apres,sections-500');
      await p.locator('[data-cart-section] .line-item [data-action="plus"]').click();
      await p.waitForTimeout(1500);
      const m = await messages(p);
      ok(m.includes(reseau) && !m.includes(misAJour), 'message : ' + m);
      eq(await p.locator('[data-cart-section] .line-item .quantity-selector__input').innerText(), 2, 'quantité affichée = état réel (2)');
      eq((await mutations(p)).change, 1, 'pas de relance');
      await p.context().close();
    });

    await test(`${L} [revue 3] panier vide + ajout, rendu en échec : le tiroir n'affiche plus « panier vide » mais un lien vers le panier`, async () => {
      const p = await page(); await get(p, '/__test/reset');
      await p.goto(B + r + PRODUIT); await p.waitForTimeout(300);
      await panne(p, 'sections-500');
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForSelector('#cart-drawer.is-open'); await p.waitForTimeout(500);
      eq(await p.locator('#cart-drawer .drawer__empty').count(), 0, 'état « panier vide » retiré');
      eq(await p.locator('#cart-drawer .drawer__desynchro a').getAttribute('href'), `${r}/cart`, 'lien vers le panier (langue conservée)');
      ok(await p.locator('#cart-drawer [data-cart-alerte]').isVisible(), 'message dans le tiroir');
      eq(await p.locator('[data-cart-count]').first().innerText(), 1, 'compteur');
      await p.context().close();
    });

    await test(`${L} [revue 3] tiroir : suppression du dernier article, rendu en échec → pied du tiroir masqué`, async () => {
      const p = await page(); await get(p, '/__test/reset');
      await p.goto(B + r + PRODUIT); await p.waitForTimeout(300);
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForSelector('#cart-drawer.is-open');
      await panne(p, 'sections-null');
      await p.locator('#cart-drawer [data-action="retirer"]').click();
      await p.waitForTimeout(1000);
      eq(await p.locator('#cart-drawer .line-item').count(), 0, 'ligne retirée');
      ok(!(await p.locator('#cart-drawer .drawer__footer').isVisible()), 'pied (sous-total, Commander) masqué');
      eq(await p.locator('[data-cart-count]').first().innerText(), 0, 'compteur');
      await p.context().close();
    });

    await test(`${L} [revue 4] réponse 200 illisible : modification constatée, pas de message d'échec, pas de relance`, async () => {
      const p = await page(); await get(p, '/__test/reset');
      await p.request.post(`${B}/cart/add.js`, { data: { id: ID.Gris, quantity: 1 } });
      await p.goto(B + r + '/cart'); await p.waitForTimeout(500);
      await panne(p, 'change-json-casse');
      await p.locator('[data-cart-section] .line-item [data-action="plus"]').click();
      await p.waitForTimeout(1500);
      const m = await messages(p);
      ok(!/pas été prise en compte|لم يتم تطبيق/.test(m), 'pas de message « non prise en compte » : ' + m);
      eq(await p.locator('[data-cart-section] .line-item .quantity-selector__input').innerText(), 2, 'quantité affichée');
      eq((await mutations(p)).change, 1, 'pas de relance');
      await p.context().close();
    });

    await test(`${L} [revue 5] « + » lent dans le tiroir puis ajout immédiat : ordre respecté, état final exact`, async () => {
      const p = await page(); await get(p, '/__test/reset');
      await p.goto(B + r + PRODUIT); await p.waitForTimeout(300);
      await p.locator('.variant-picker label', { hasText: COULEUR[langue].Gris }).click();
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForSelector('#cart-drawer.is-open'); await p.waitForTimeout(300);
      await panne(p, 'change-lent');
      await p.locator('#cart-drawer [data-action="plus"]').click();
      await p.evaluate((c) => { document.querySelector(`.variant-picker label[for]`) && Array.from(document.querySelectorAll('.variant-picker label')).find((l) => l.textContent.trim() === c).click(); document.querySelector('form.shopify-product-form').requestSubmit(); }, COULEUR[langue].Bleu);
      await p.waitForTimeout(2500);
      const c = await panier(p);
      eq(c.item_count, 3, 'panier réel (2 Gris + 1 Bleu)');
      eq(await p.locator('[data-cart-count]').first().innerText(), 3, 'compteur affiché');
      eq(await p.locator('#cart-drawer .line-item').count(), 2, 'deux lignes dans le tiroir');
      await p.context().close();
    });

    await test(`${L} [revue 6] page panier : panier vidé ailleurs puis refus 400 → page relue en « panier vide »`, async () => {
      const p = await page(); await get(p, '/__test/reset');
      await p.request.post(`${B}/cart/add.js`, { data: { id: ID.Gris, quantity: 1 } });
      await p.goto(B + r + '/cart'); await p.waitForTimeout(500);
      await panne(p, 'change-400-vide');
      await p.locator('[data-cart-section] .line-item [data-action="plus"]').click();
      await p.waitForSelector('.empty-state', { timeout: 6000 });
      eq(await p.locator('[data-llufan-commande]').count(), 0, 'plus de formulaire');
      eq((await mutations(p)).change, 1, 'pas de relance');
      await p.context().close();
    });

    await test(`${L} [revue 10] message : bouton × dans la boîte en RTL/LTR, message non recouvert (tiroir ouvert)`, async () => {
      const p = await page(390, 844); await get(p, '/__test/reset');
      await p.goto(B + r + PRODUIT); await p.waitForTimeout(300);
      await p.locator('.buy-buttons button[type="submit"]').click();
      await p.waitForSelector('#cart-drawer.is-open');
      await panne(p, 'sections-500');
      await p.locator('#cart-drawer [data-action="plus"]').click(); await p.waitForTimeout(1000);
      const g = await p.evaluate(() => {
        const a = document.querySelector('[data-cart-alerte]'); const x = a.querySelector('.cart-alerte__fermer');
        const ra = a.getBoundingClientRect(); const rx = x.getBoundingClientRect();
        const plus = document.querySelector('#cart-drawer [data-action="plus"]').getBoundingClientRect();
        const cible = document.elementFromPoint(plus.left + plus.width / 2, plus.top + plus.height / 2);
        return { dedans: rx.left >= ra.left - 1 && rx.right <= ra.right + 1, plusLibre: !!cible && !!cible.closest('[data-action="plus"]') };
      });
      ok(g.dedans, 'bouton × dans la boîte'); ok(g.plusLibre, 'bouton + du tiroir non recouvert');
      await p.context().close();
    });
  }
  await nav.close();
  console.log(`=== revue (simulé) : ${res.filter((x) => x[0] === '✔').length}/${res.length} ===`);
  res.forEach((x) => console.log(x[0], x[1], x[2] ? '\n    → ' + x[2] : ''));
})();
