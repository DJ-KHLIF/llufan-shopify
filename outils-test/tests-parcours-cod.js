/* Parcours COD du thème « Priorité 1 » (154721583265) — banc local SIMULÉ.
   Rien n'est envoyé à Shopify : le panier est simulé par serveur.js, la caisse
   et l'API Storefront sont interceptées dans le navigateur.
   Usage : node tests-parcours-cod.js <port-normal> <port-avec-jeton> <port-sans-tarif-unique> */
const { chromium } = require('playwright');
const [P1, P2, P3] = process.argv.slice(2).map(Number);
const PRODUIT = '/products/nomad-coussin-dallaitement-llufan';
const ID = { Bleu: '47934041358497', Rose: '47934041391265', Gris: '47934041424033' };
const AR = { Bleu: 'أزرق', Gris: 'رمادي' };
const norm = (s) => String(s ?? '').replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
const res = [];
const test = async (nom, f) => { try { await f(); res.push(['✔', nom]); } catch (e) { res.push(['✘', nom, String(e.message).split('\n')[0].slice(0, 300)]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => ok(norm(a) === norm(b), `${m} : obtenu « ${norm(a)} », attendu « ${norm(b)} »`);

(async () => {
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ouvrir = async (port, chemin, { w = 1280, h = 900 } = {}) => {
    const p = await (await nav.newContext({ viewport: { width: w, height: h } })).newPage();
    p.base = `http://localhost:${port}`;
    /* Erreur connue, antérieure et hors parcours COD : attribut data-product-info
       en double dans main-product.liquid (ligne 9) → « Vus récemment » échoue. */
    p.erreurs = []; p.on('pageerror', (e) => { if (!/Unexpected end of JSON input/.test(e.message) || !/recently|productInfo|JSON\.parse/.test(String(e.stack))) p.erreurs.push(e.message); });
    p.caisse = []; p.storefront = [];
    /* La caisse Shopify (lien de panier ou checkoutUrl) est interceptée : on
       relève l'adresse demandée, sans jamais la charger. */
    await p.route(/\/cart\/\d+:\d+|\/checkouts\//, (route) => { p.caisse.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/html', body: '<p>caisse simulée</p>' }); });
    await p.route(/\/api\/[0-9-]+\/graphql\.json/, (route) => {
      const corps = JSON.parse(route.request().postData() || '{}');
      p.storefront.push({ entetes: route.request().headers(), corps });
      const r = p.reponseStorefront || { data: { cartCreate: { cart: { id: 'gid://shopify/Cart/simule', checkoutUrl: 'https://llufan.com/checkouts/cn/SIMULE' }, userErrors: [] } } };
      if (r === 'lent') return; // jamais de réponse : le délai de 8 s doit jouer
      if (r === '500') return route.fulfill({ status: 500, body: 'erreur' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
    });
    await p.request.get(p.base + '/__test/reset');
    await p.goto(p.base + chemin);
    await p.waitForTimeout(300);
    return p;
  };
  const panier = async (p) => (await (await p.request.get(p.base + '/cart.js')).json());
  const destination = async (p, commune = 'Bab El Oued') => {
    await p.waitForFunction(() => document.querySelectorAll('[data-llufan-wilaya] option').length > 60);
    await p.selectOption('[data-llufan-wilaya]', '16 - Alger');
    await p.selectOption('[data-llufan-commune]', commune);
  };
  const remplir = async (p, tel = '0555 12 34 56') => {
    await p.fill('[data-llufan-nom]', 'Test Simulation');
    await p.fill('[data-llufan-telephone]', tel);
    await destination(p);
    if (await p.locator('[data-llufan-adresse]').isEnabled()) await p.fill('[data-llufan-adresse]', 'Rue de test, cité exemple');
  };
  const envoyer = async (p, attente = 1500) => { await p.click('[data-llufan-bouton]'); await p.waitForTimeout(attente); };
  const texte = (p, s) => p.locator(s).first().innerText();

  /* ======================= 1. Panier FR / AR (à préserver) ======================= */
  for (const [langue, racine] of [['fr', ''], ['ar', '/ar']]) {
    await test(`[${langue}] ajout au panier : tiroir ouvert, compteur, variante choisie (Gris)`, async () => {
      const p = await ouvrir(P1, racine + PRODUIT);
      const gris = langue === 'ar' ? AR.Gris : 'Gris';
      await p.locator('variant-picker label', { hasText: gris }).first().click();
      await p.click('.shopify-product-form [type="submit"]');
      await p.waitForSelector('#cart-drawer.is-open', { timeout: 4000 });
      const c = await panier(p);
      eq(c.items.map((i) => `${i.variant_id}:${i.quantity}`).join(','), `${ID.Gris}:1`, 'panier');
      ok(p.erreurs.length === 0, 'erreurs JS : ' + p.erreurs.join(' | '));
    });
    await test(`[${langue}] tiroir : + puis − puis suppression, tiroir maintenu ouvert, totaux recalculés`, async () => {
      const p = await ouvrir(P1, racine + PRODUIT);
      await p.click('.shopify-product-form [type="submit"]');
      await p.waitForSelector('#cart-drawer.is-open');
      const plus = () => p.locator('#cart-drawer .quantity-selector [data-quantity-change]').nth(1);
      const moins = () => p.locator('#cart-drawer .quantity-selector [data-quantity-change]').nth(0);
      await plus().click(); await p.waitForTimeout(500);
      eq(await texte(p, '#cart-drawer .quantity-selector__input'), '2', 'quantité après +');
      eq(await texte(p, '#cart-drawer .cart-totals__row--total span:last-child'), 'DA 6400.00', 'sous-total après +');
      ok(await p.locator('#cart-drawer.is-open').count() === 1, 'tiroir refermé après +');
      await moins().click(); await p.waitForTimeout(500);
      eq(await texte(p, '#cart-drawer .quantity-selector__input'), '1', 'quantité après −');
      await p.locator('#cart-drawer .line-item > [data-quantity-change]').click(); await p.waitForTimeout(500);
      ok((await panier(p)).item_count === 0, 'panier non vidé');
      ok(await p.locator('#cart-drawer.is-open').count() === 1, 'tiroir refermé après suppression');
      ok(await p.locator('#cart-drawer .drawer__empty').count() === 1, 'état vide absent');
      ok(p.erreurs.length === 0, 'erreurs JS : ' + p.erreurs.join(' | '));
    });
    await test(`[${langue}] page panier : + recharge la page avec la bonne quantité`, async () => {
      const p = await ouvrir(P1, racine + PRODUIT);
      await p.request.post(p.base + '/cart/add.js', { data: { id: ID.Bleu, quantity: 1 } });
      await p.goto(p.base + racine + '/cart');
      await Promise.all([p.waitForNavigation(), p.locator('main .quantity-selector [data-quantity-change]').nth(1).click()]);
      eq(await texte(p, 'main .quantity-selector__input'), '2', 'quantité page panier');
      eq((await panier(p)).item_count, '2', 'panier');
    });
  }

  /* ======================= 2. Formulaire : 700 DA ======================= */
  for (const [langue, racine] of [['fr', ''], ['ar', '/ar']]) {
    await test(`[${langue}] fiche produit : 700 DA pour les deux modes, total = articles + 700`, async () => {
      const p = await ouvrir(P1, racine + PRODUIT);
      await p.waitForFunction(() => document.querySelectorAll('[data-llufan-wilaya] option').length > 60);
      eq(await texte(p, '[data-llufan-prix-domicile]'), '700 DA', 'prix domicile');
      eq(await texte(p, '[data-llufan-prix-stop-desk]'), '700 DA', 'prix stop-desk');
      eq(await texte(p, '[data-llufan-frais]'), '700 DA', 'frais avant wilaya');
      eq(await texte(p, '[data-llufan-total]'), '3 900 DA', 'total avant wilaya (3 200 + 700)');
      await destination(p);
      eq(await texte(p, '[data-llufan-frais]'), '700 DA', 'frais Alger domicile (ancien tarif : 400)');
      await p.check('input[value="stop-desk"]');
      eq(await texte(p, '[data-llufan-frais]'), '700 DA', 'frais Alger stop-desk (ancien tarif : 250)');
      eq(await texte(p, '[data-llufan-total]'), '3 900 DA', 'total stop-desk');
      ok(!(await p.locator('[data-llufan-adresse-bloc]').isVisible()), 'adresse visible en stop-desk');
      ok(await p.locator('[data-llufan-adresse]').evaluate((e) => !e.required && e.disabled), 'adresse exigée en stop-desk');
      await p.check('input[value="domicile"]');
      ok(await p.locator('[data-llufan-adresse]').evaluate((e) => e.required && !e.disabled), 'adresse non exigée à domicile');
      ok(p.erreurs.length === 0, 'erreurs JS : ' + p.erreurs.join(' | '));
    });
    await test(`[${langue}] fiche produit : Gris × 3 → total 9 600 + 700 = 10 300 DA (cas observé en caisse)`, async () => {
      const p = await ouvrir(P1, racine + PRODUIT);
      await p.locator('variant-picker label', { hasText: langue === 'ar' ? AR.Gris : 'Gris' }).first().click();
      const qte = p.locator('main .quantity-selector [data-quantity-button="plus"]');
      await qte.click(); await qte.click(); await p.waitForTimeout(200);
      await destination(p);
      eq(await texte(p, '[data-llufan-sous-total]'), '9 600 DA', 'sous-total');
      eq(await texte(p, '[data-llufan-total]'), '10 300 DA', 'total');
    });
  }

  /* ======================= 3. Envoi vers la caisse (sans jeton) ======================= */
  await test('[fr] produit : lien de panier = variante × quantité, téléphone dans l\'adresse, aucun e-mail', async () => {
    const p = await ouvrir(P1, PRODUIT);
    await p.locator('variant-picker label', { hasText: 'Gris' }).first().click();
    await p.locator('main .quantity-selector [data-quantity-button="plus"]').click();
    await remplir(p);
    await envoyer(p);
    ok(p.storefront.length === 0, 'API Storefront appelée sans jeton');
    ok(p.caisse.length === 1, `caisse demandée ${p.caisse.length} fois`);
    const u = new URL(p.caisse[0]);
    eq(u.pathname, `/cart/${ID.Gris}:2`, 'articles');
    eq(u.searchParams.get('checkout[shipping_address][phone]'), '0555 12 34 56', 'téléphone (adresse)');
    ok(![...u.searchParams.keys()].some((k) => /email/i.test(k)), 'un paramètre e-mail est envoyé');
    const props = JSON.parse(Buffer.from(u.searchParams.get('properties'), 'base64').toString('utf8'));
    eq(props['Type de livraison'], 'Domicile', 'type'); eq(props.Wilaya, '16 - Alger', 'wilaya');
  });
  await test('[fr] produit stop-desk : adresse non transmise, aucune agence inventée', async () => {
    const p = await ouvrir(P1, PRODUIT);
    await p.check('input[value="stop-desk"]');
    await remplir(p);
    await envoyer(p);
    const u = new URL(p.caisse[0]);
    const props = JSON.parse(Buffer.from(u.searchParams.get('properties'), 'base64').toString('utf8'));
    ok(!('Adresse' in props), 'adresse transmise en stop-desk');
    eq(u.searchParams.get('checkout[shipping_address][address1]'), 'Stop-desk — Bab El Oued', 'address1 (commune choisie seulement)');
  });
  await test('[fr] page panier : tous les articles du panier relus au moment de l\'envoi', async () => {
    const p = await ouvrir(P1, PRODUIT);
    await p.request.post(p.base + '/cart/add.js', { data: { id: ID.Gris, quantity: 1 } });
    await p.request.post(p.base + '/cart/add.js', { data: { id: ID.Bleu, quantity: 2 } });
    await p.goto(p.base + '/cart'); await p.waitForTimeout(300);
    eq(await texte(p, '[data-llufan-total]'), '10 300 DA', 'total panier (9 600 + 700)');
    await remplir(p);
    await envoyer(p);
    const u = new URL(p.caisse[0]);
    eq(u.pathname, `/cart/${ID.Gris}:1,${ID.Bleu}:2`, 'articles');
    eq(u.searchParams.get('attributes[Commune]'), 'Bab El Oued', 'attribut commune');
  });

  /* ======================= 4. Option Storefront (jeton saisi) ======================= */
  for (const [langue, racine] of [['fr', ''], ['ar', '/ar']]) {
    await test(`[${langue}] jeton : cartCreate avec téléphone +213, puis checkoutUrl`, async () => {
      const p = await ouvrir(P2, racine + PRODUIT);
      await remplir(p);
      await envoyer(p);
      ok(p.storefront.length === 1, `appels Storefront : ${p.storefront.length}`);
      const { entetes, corps } = p.storefront[0];
      eq(entetes['x-shopify-storefront-access-token'], 'jeton-public-factice', 'jeton');
      const input = corps.variables.input;
      eq(input.buyerIdentity.phone, '+213555123456', 'téléphone de contact');
      eq(input.buyerIdentity.countryCode, 'DZ', 'pays');
      ok(!('email' in input.buyerIdentity), 'e-mail envoyé');
      eq(corps.variables.langue, langue === 'ar' ? 'AR' : 'FR', 'langue de la caisse');
      eq(input.lines[0].merchandiseId, `gid://shopify/ProductVariant/${ID.Bleu}`, 'variante');
      eq(input.delivery.addresses[0].address.deliveryAddress.city, 'Bab El Oued', 'commune');
      eq(p.caisse.join(), 'https://llufan.com/checkouts/cn/SIMULE', 'redirection');
    });
  }
  await test('[fr] jeton : erreur de l\'API (userErrors) → lien de panier habituel', async () => {
    const p = await ouvrir(P2, PRODUIT);
    p.reponseStorefront = { data: { cartCreate: { cart: null, userErrors: [{ field: ['buyerIdentity', 'phone'], message: 'invalide', code: 'INVALID' }] } } };
    await remplir(p); await envoyer(p);
    ok(p.caisse.length === 1 && /\/cart\/\d+:1\?/.test(p.caisse[0]), 'pas de repli : ' + p.caisse.join());
  });
  await test('[fr] jeton : API en panne (500) → lien de panier habituel', async () => {
    const p = await ouvrir(P2, PRODUIT);
    p.reponseStorefront = '500';
    await remplir(p); await envoyer(p);
    ok(p.caisse.length === 1 && /\/cart\/\d+:1\?/.test(p.caisse[0]), 'pas de repli : ' + p.caisse.join());
  });
  await test('[fr] jeton : API sans réponse → repli après 8 s', async () => {
    const p = await ouvrir(P2, PRODUIT);
    p.reponseStorefront = 'lent';
    await remplir(p); await envoyer(p, 9500);
    ok(p.caisse.length === 1 && /\/cart\/\d+:1\?/.test(p.caisse[0]), 'pas de repli : ' + p.caisse.join());
  });
  await test('[fr] jeton : numéro non algérien → pas d\'appel Storefront, lien habituel', async () => {
    const p = await ouvrir(P2, PRODUIT);
    await remplir(p, '+33 6 12 34 56 78'); await envoyer(p);
    ok(p.storefront.length === 0, 'appel Storefront avec un numéro non reconnu');
    ok(p.caisse.length === 1 && /\/cart\/\d+:1\?/.test(p.caisse[0]), 'caisse : ' + p.caisse.join());
  });
  await test('[fr] jeton, page panier : lignes du panier + attributs + note', async () => {
    const p = await ouvrir(P2, PRODUIT);
    await p.request.post(p.base + '/cart/add.js', { data: { id: ID.Gris, quantity: 1 } });
    await p.request.post(p.base + '/cart/add.js', { data: { id: ID.Bleu, quantity: 2 } });
    await p.goto(p.base + '/cart'); await p.waitForTimeout(300);
    await remplir(p); await envoyer(p);
    const input = p.storefront[0].corps.variables.input;
    eq(input.lines.map((l) => `${l.merchandiseId.split('/').pop()}:${l.quantity}`).join(','), `${ID.Gris}:1,${ID.Bleu}:2`, 'lignes');
    eq(input.attributes.find((a) => a.key === 'Wilaya').value, '16 - Alger', 'attribut wilaya');
  });

  /* ======================= 5. Tarifs par wilaya conservés ======================= */
  await test('[fr] réglage « tarif unique » vidé → retour aux tarifs par wilaya (Alger 400 / 250)', async () => {
    const p = await ouvrir(P3, PRODUIT);
    await destination(p);
    eq(await texte(p, '[data-llufan-prix-domicile]'), '400 DA', 'domicile');
    eq(await texte(p, '[data-llufan-prix-stop-desk]'), '250 DA', 'stop-desk');
    eq(await p.locator('[data-llufan-commune] option').count(), String(1 + 57), 'communes d\'Alger (57 + « Choisir »)');
  });

  await nav.close();
  for (const r of res) console.log(r[0], r[1], r[2] ? `\n    → ${r[2]}` : '');
  const echecs = res.filter((r) => r[0] === '✘').length;
  console.log(`\n${res.length - echecs}/${res.length} scénarios réussis (SIMULATION locale, pas Shopify réel)`);
  process.exit(echecs ? 1 : 0);
})();
