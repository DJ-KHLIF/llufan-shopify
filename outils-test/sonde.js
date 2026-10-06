/* Sonde : tiroir en AR/FR, + / − / supprimer, et cible réelle sous le doigt (elementFromPoint) */
const { chromium } = require('playwright');
const PORT = process.argv[2]; const B = 'http://localhost:' + PORT;
const P = '/products/nomad-coussin-dallaitement-llufan';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const [l, r] of [['fr', ''], ['ar', '/ar']]) for (const [w, h] of [[390, 844], [1280, 900]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const req = []; p.on('response', (x) => { if (/cart/.test(x.url())) req.push(`${x.request().method()} ${x.url().replace(B, '')} ${x.status()}`); });
    await p.request.get(B + '/__test/reset');
    await p.goto(B + r + P); await p.waitForTimeout(400);
    // cible sous le centre du bouton d'ajout
    const cible = async (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return 'absent'; e.scrollIntoView({ block: 'center' }); const bx = e.getBoundingClientRect(); const t = document.elementFromPoint(bx.left + bx.width / 2, bx.top + bx.height / 2); return t === e || e.contains(t) ? 'ok' : `masqué par ${t && (t.className || t.tagName)}`; }, sel);
    const ajout = await cible('.buy-buttons button[type="submit"]');
    await p.locator('.buy-buttons button[type="submit"]').click({ trial: false }).catch((e) => errs.push('clic ajout: ' + e.message.split('\n')[0]));
    await p.waitForSelector('#cart-drawer.is-open', { timeout: 4000 }).catch(() => errs.push('tiroir non ouvert'));
    const res = { l, w, ajout };
    for (const act of ['plus', 'plus', 'moins']) {
      const sel = `#cart-drawer [data-action="${act}"]`;
      res['cible-' + act] = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return 'absent'; const bx = e.getBoundingClientRect(); const t = document.elementFromPoint(bx.left + bx.width / 2, bx.top + bx.height / 2); return t === e || e.contains(t) ? 'ok' : `masqué par ${t && (t.className && t.className.baseVal === undefined ? t.className : t.tagName)}`; }, sel);
      await p.locator(sel).click().catch((e) => errs.push(`clic ${act}: ` + e.message.split('\n')[0]));
      await p.waitForTimeout(700);
    }
    res.qteTiroir = await p.locator('#cart-drawer .quantity-selector__input').first().innerText().catch(() => '?');
    res.tiroirOuvert = await p.locator('#cart-drawer.is-open').count();
    res.sousTotal = (await p.locator('#cart-drawer .cart-totals__row--total span:last-child').innerText().catch(() => '?')).replace(/\s+/g, ' ');
    res.panier = (await (await p.request.get(B + '/cart.js')).json()).item_count;
    res.retirer = await p.evaluate(() => { const e = document.querySelector('#cart-drawer [data-action="retirer"]'); if (!e) return 'absent'; const bx = e.getBoundingClientRect(); const t = document.elementFromPoint(bx.left + bx.width / 2, bx.top + bx.height / 2); return t === e || e.contains(t) ? 'ok' : 'masqué'; });
    console.log(JSON.stringify(res), '\n   requêtes:', req.join(' | '), errs.length ? '\n   ERREURS: ' + errs.join(' | ') : '');
    await p.context().close();
  }
  await b.close();
})();
