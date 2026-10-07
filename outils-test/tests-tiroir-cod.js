/* Retours du test réel du thème 154731577505 (2026-10-07) — banc local SIMULÉ,
   aucune requête vers Shopify. Valeurs du formulaire FICTIVES uniquement.
     1. Tiroir : deux lignes Gris, dont une avec les champs du formulaire →
        les informations personnelles ne doivent pas s'afficher.
     2. « Ajouter au panier » : un ajout enregistré ne doit jamais être renvoyé
        (form.submit() dans le catch de theme.js), même si la réponse ou le
        rendu du tiroir échoue.
     3. Envoi du formulaire de commande avec un panier non vide : le thème ne
        transmet que la variante × la quantité de la fiche, sans toucher au
        panier du site. Ce que Shopify fait ensuite du panier existant (lien de
        panier) ne peut PAS être vérifié ici : test réel requis.
   node tests-tiroir-cod.js <port> */
const { chromium } = require('playwright');
const PORT = process.argv[2] || 4813;
const B = `http://localhost:${PORT}`;
const PRODUIT = '/products/nomad-coussin-dallaitement-llufan';
const ID = { Bleu: '47934041358497', Gris: '47934041424033' };
const AR_GRIS = 'رمادي';
/* Champs du formulaire, valeurs fictives (aucune donnée réelle) */
const CHAMPS_FICTIFS = {
  'Nom complet': 'Cliente Fictive',
  'Téléphone': '0500 00 00 00',
  'Wilaya': '16 - Alger',
  'Commune': 'Bab El Oued',
  'Type de livraison': 'Domicile',
  'Adresse': 'Rue Fictive 1',
};
const norm = (s) => String(s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const res = [];
const test = async (n, f) => { try { await f(); res.push(['✔', n]); } catch (e) { res.push(['✘', n, String(e.message).split('\n')[0].slice(0, 260)]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => ok(norm(a) === norm(b), `${m} : obtenu « ${norm(a)} », attendu « ${norm(b)} »`);

(async () => {
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ouvrir = async (chemin) => {
    const p = await (await nav.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    /* Erreur connue, antérieure et hors sujet (data-product-info en double) */
    p.erreurs = []; p.on('pageerror', (e) => { if (!/Unexpected end of JSON input/.test(e.message)) p.erreurs.push(e.message); });
    p.caisse = [];
    await p.route(/\/cart\/\d+:\d+|\/checkouts\//, (route) => { p.caisse.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/html', body: '<p>caisse simulée</p>' }); });
    await p.request.get(B + '/__test/reset');
    if (chemin) { await p.goto(B + chemin); await p.waitForTimeout(300); }
    return p;
  };
  const get = (p, u) => p.request.get(B + u);
  const panier = async (p) => (await (await get(p, '/cart.js')).json());
  const mutations = async (p) => (await (await get(p, '/__test/mutations')).json());
  /* État observé : une ligne Gris issue du formulaire + une ligne Gris ajoutée au panier */
  const etatObserve = async (p) => {
    await p.request.post(`${B}/cart/add.js`, { data: { id: ID.Gris, quantity: 1, properties: CHAMPS_FICTIFS } });
    await p.request.post(`${B}/cart/add.js`, { data: { id: ID.Gris, quantity: 1 } });
  };

  /* ---------------- 1. Informations personnelles dans le tiroir ---------------- */
  for (const [langue, racine] of [['fr', ''], ['ar', '/ar']]) {
    await test(`[${langue}] tiroir : 2 lignes Gris (dont une du formulaire), aucune donnée du formulaire affichée`, async () => {
      const p = await ouvrir(null);
      await etatObserve(p);
      await p.request.post(`${B}/cart/add.js`, { data: { id: ID.Bleu, quantity: 1, properties: { Gravure: 'Exemple', _interne: 'cache' } } });
      await p.goto(B + racine + PRODUIT); await p.waitForTimeout(300);
      await p.evaluate(() => { const d = document.querySelector('#cart-drawer'); d.classList.add('is-open'); d.removeAttribute('aria-hidden'); });
      const lignes = p.locator('#cart-drawer .line-item');
      eq(await lignes.count(), 3, 'lignes dans le tiroir');
      const contenu = (await p.locator('#cart-drawer .line-item').allInnerTexts()).join('\n');
      for (const [cle, valeur] of Object.entries(CHAMPS_FICTIFS)) {
        ok(!contenu.includes(valeur), `valeur du champ « ${cle} » affichée dans le tiroir`);
      }
      ok(!contenu.includes('cache'), 'propriété « _ » affichée');
      ok(contenu.includes('Gravure : Exemple'), 'propriété ordinaire masquée à tort');
      ok(contenu.includes(langue === 'ar' ? AR_GRIS : 'Gris'), 'variante absente');
      /* Page panier : même rendu de ligne */
      await p.goto(B + racine + '/cart'); await p.waitForTimeout(300);
      const page = (await p.locator('main .line-item').allInnerTexts()).join('\n');
      ok(page.includes(langue === 'ar' ? AR_GRIS : 'Gris'), 'lignes absentes de la page panier');
      for (const valeur of Object.values(CHAMPS_FICTIFS)) ok(!page.includes(valeur), `valeur « ${valeur} » affichée sur la page panier`);
      eq((await panier(p)).item_count, 3, 'articles au panier (inchangé)');
      ok(p.erreurs.length === 0, 'erreurs JS : ' + p.erreurs.join(' | '));
      await p.context().close();
    });
  }

  /* ---------------- 2. Aucun ajout rejoué par « Ajouter au panier » ---------------- */
  for (const mode of ['add-reponse-perdue', 'section-id-coupee']) {
    await test(`[fr] ajouter au panier, panne « ${mode} » : un seul ajout, aucun envoi natif`, async () => {
      const p = await ouvrir(PRODUIT);
      await p.locator('variant-picker label', { hasText: 'Gris' }).first().click();
      await get(p, `/__test/panne?modes=${mode}`);
      await p.click('.shopify-product-form [type="submit"]');
      await p.waitForTimeout(1500);
      const m = await mutations(p);
      eq(m.add, 1, 'requêtes /cart/add.js');
      eq(m.ajoutNatif, 0, 'envois natifs /cart/add (form.submit rejoué)');
      eq((await panier(p)).item_count, 1, 'articles au panier');
      ok(p.erreurs.length === 0, 'erreurs JS : ' + p.erreurs.join(' | '));
      await p.context().close();
    });
  }

  for (const [langue, racine] of [['fr', ''], ['ar', '/ar']]) {
    await test(`[${langue}] double clic « Ajouter au panier » : un seul ajout`, async () => {
      const p = await ouvrir(racine + PRODUIT);
      await p.locator('.shopify-product-form [type="submit"]').dblclick();
      await p.waitForSelector('#cart-drawer.is-open', { timeout: 4000 }); await p.waitForTimeout(400);
      eq((await panier(p)).item_count, 1, 'articles au panier');
      eq((await mutations(p)).add, 1, 'requêtes /cart/add.js');
      await p.context().close();
    });
  }

  /* ---------------- 3. Formulaire avec un panier déjà rempli ---------------- */
  for (const qte of [1, 3]) {
    await test(`[fr] panier à 2 Gris, formulaire Gris × ${qte} : lien de caisse = Gris:${qte} seulement, panier du site intact`, async () => {
      const p = await ouvrir(null);
      await etatObserve(p);
      await p.goto(B + PRODUIT); await p.waitForTimeout(300);
      await p.locator('variant-picker label', { hasText: 'Gris' }).first().click();
      for (let i = 1; i < qte; i += 1) await p.locator('main .quantity-selector [data-quantity-button="plus"]').click();
      await p.waitForTimeout(200);
      const avant = await mutations(p);
      await p.fill('[data-llufan-nom]', CHAMPS_FICTIFS['Nom complet']);
      await p.fill('[data-llufan-telephone]', CHAMPS_FICTIFS['Téléphone']);
      await p.waitForFunction(() => document.querySelectorAll('[data-llufan-wilaya] option').length > 60);
      await p.selectOption('[data-llufan-wilaya]', '16 - Alger');
      await p.selectOption('[data-llufan-commune]', 'Bab El Oued');
      await p.fill('[data-llufan-adresse]', CHAMPS_FICTIFS.Adresse);
      await p.click('[data-llufan-bouton]'); await p.waitForTimeout(1500);
      ok(p.caisse.length === 1, `caisse demandée ${p.caisse.length} fois`);
      eq(new URL(p.caisse[0]).pathname, `/cart/${ID.Gris}:${qte}`, 'articles du lien de caisse');
      const apres = await mutations(p);
      eq(apres.add - avant.add, 0, 'ajouts /cart/add.js pendant l’envoi');
      eq(apres.ajoutNatif - avant.ajoutNatif, 0, 'envois natifs pendant l’envoi');
      eq((await panier(p)).item_count, 2, 'panier du site (inchangé)');
      await p.context().close();
    });
  }

  await nav.close();
  res.forEach((r) => console.log(r[0], r[1], r[2] || ''));
  const echecs = res.filter((r) => r[0] === '✘').length;
  console.log(`\n${res.length - echecs}/${res.length} scénarios réussis (SIMULATION locale, pas Shopify réel)`);
  process.exit(echecs ? 1 : 0);
})();
