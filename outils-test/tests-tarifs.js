/* Tarifs absents : aucun montant inventé, simulation bloquée.
   node tests-tarifs.js <port-normal> <port-sans-fichier> */
const { chromium } = require('playwright');
const [P1, P2] = [process.argv[2] || 4810, process.argv[3] || 4812];
const PRODUIT = '/products/nomad-coussin-dallaitement-llufan';
const norm = (s) => String(s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const res = [];
const test = async (n, f) => { try { await f(); res.push(['✔', n]); } catch (e) { res.push(['✘', n, e.message.split('\n')[0]]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const langue of ['fr', 'ar']) {
    const r = langue === 'ar' ? '/ar' : '';
    await test(`${langue.toUpperCase()} tarif stop-desk manquant pour Alger : frais « à calculer », total « — », simulation refusée`, async () => {
      const p = await (await b.newContext()).newPage();
      const donnees = await (await p.request.get(`http://localhost:${P1}/cdn/assets/llufan-livraison-dz.json`)).json();
      donnees.wilayas.find((w) => w.code === '16').stop_desk = null;
      await p.addInitScript((d) => { window.LLUFAN_LIVRAISON_DATA = d; }, donnees);
      await p.goto(`http://localhost:${P1}${r}${PRODUIT}`);
      await p.waitForFunction(() => document.querySelectorAll('[data-llufan-wilaya] option').length > 60);
      await p.fill('[data-llufan-champ="nom"]', 'Test'); await p.fill('[data-llufan-champ="telephone"]', '0772000000');
      await p.selectOption('[data-llufan-wilaya]', '16 - Alger'); await p.selectOption('[data-llufan-commune]', 'Bab El Oued');
      await p.locator('[data-llufan-type] label').nth(1).click();
      ok(norm(await p.locator('[data-llufan-prix="stop-desk"]').innerText()) === '—', 'prix stop-desk affiché « — »');
      ok(!/\d/.test(await p.locator('[data-llufan-frais]').innerText()), 'frais sans montant');
      ok(norm(await p.locator('[data-llufan-total]').innerText()) === '—', 'total « — »');
      await p.locator('[data-llufan-bouton]').click();
      ok(!(await p.locator('[data-llufan-confirmation]').isVisible()), 'pas de simulation');
      ok(await p.locator('[data-llufan-avertissement]').isVisible(), 'message tarif indisponible');
      await p.context().close();
    });
    await test(`${langue.toUpperCase()} fichier de tarifs inaccessible : message, aucun total, simulation refusée`, async () => {
      const p = await (await b.newContext()).newPage();
      await p.goto(`http://localhost:${P2}${r}${PRODUIT}`);
      await p.waitForTimeout(600);
      ok(await p.locator('[data-llufan-avertissement]').isVisible(), 'message affiché');
      ok(norm(await p.locator('[data-llufan-total]').innerText()) === '—', 'total « — »');
      await p.fill('[data-llufan-champ="nom"]', 'Test');
      ok(await p.locator('[data-llufan-bouton]').getAttribute('aria-disabled') === 'true', 'bouton signalé désactivé');
      await p.locator('form[data-llufan-formulaire]').evaluate((f) => f.requestSubmit());
      ok(!(await p.locator('[data-llufan-confirmation]').isVisible()), 'pas de simulation');
      await p.context().close();
    });
  }
  await b.close();
  console.log(`=== tarifs : ${res.filter((x) => x[0] === '✔').length}/${res.length} ===`);
  res.forEach((x) => console.log(x[0], x[1], x[2] ? '\n    → ' + x[2] : ''));
})();
