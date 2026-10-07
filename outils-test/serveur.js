/* Banc d'essai local du thème LLUFAN : rend les vrais fichiers Liquid avec
   liquidjs et simule les points d'accès panier de Shopify (/cart/add.js,
   /cart/change.js, /cart.js, ?sections=). Aucune requête vers Shopify.
   Usage : node serveur.js <dossier-du-thème> <port> */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Liquid, Drop, Tag, Hash } = require('liquidjs');

const THEME = path.resolve(process.argv[2] || '.');
const PORT = Number(process.argv[3] || 4810);
const lire = (f) => fs.readFileSync(path.join(THEME, f), 'utf8');
const json = (f) => JSON.parse(lire(f).replace(/^\s*\/\*[\s\S]*?\*\/\s*/, ''));
const LOCALES = { fr: json('locales/fr.default.json'), ar: json('locales/ar.json') };
class Couleur extends Drop {
  constructor(hex) { super(); this.hex = hex; const n = parseInt(hex.slice(1), 16); this.red = (n >> 16) & 255; this.green = (n >> 8) & 255; this.blue = n & 255; }
  valueOf() { return this.hex; } toString() { return this.hex; }
}
/* Comme Shopify : un réglage absent de settings_data prend la valeur par défaut du schéma. */
const DEFAUTS = Object.fromEntries(JSON.parse(lire('config/settings_schema.json')).flatMap((g) => g.settings || []).filter((r) => r.id && r.default !== undefined).map((r) => [r.id, r.default]));
const SETTINGS = Object.fromEntries(Object.entries({ ...DEFAUTS, ...json('config/settings_data.json').current, ...(process.env.REGLAGES ? JSON.parse(process.env.REGLAGES) : {}) }).map(([k, v]) => [k, typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? new Couleur(v) : v]));
const manquantes = new Set();

/* ------------------------------------------------------------ données */
class Valeur extends Drop {
  constructor(nom, couleur) { super(); this.name = nom; this.swatch = couleur ? { color: couleur } : null; }
  valueOf() { return this.name; }
  toString() { return this.name; }
}
const PRODUIT = {
  id: 9001, handle: 'nomad-coussin-dallaitement-llufan', title: 'LLUFAN Nomade — Coussin d’allaitement compact',
  description: '<p>Coussin d’allaitement compact, maison et déplacements. 59 × 23 × 17 cm.</p>',
  vendor: 'LLUFAN', available: true, has_only_default_variant: false, media: [], featured_media: null,
  tags: [], compare_at_price: null,
};
const VARIANTES = [
  { id: 47934041358497, title: 'Bleu', option1: 'Bleu', price: 320000, available: true },
  { id: 47934041391265, title: 'Rose', option1: 'Rose', price: 320000, available: true },
  { id: 47934041424033, title: 'Gris', option1: 'Gris', price: 320000, available: true },
].map((v) => ({ ...v, option2: null, option3: null, options: [v.option1], compare_at_price: null }));
let indisponible = null; // id de variante rendue indisponible pour un scénario de test
const variantes = () => VARIANTES.map((v) => ({ ...v, available: v.id !== indisponible }));
/* Traductions arabes RÉELLES relevées par l'API Admin (6 octobre) :
   valeurs d'option et option1 des variantes : Bleu→أزرق, Rose→وردة, Gris→رمادي ;
   option « Coloris » → لون ; titre → نوماد — وسادة الرضاعة من ليلوفان.
   TRAD=incoherent : les valeurs d'option sont servies en arabe mais le texte
   d'option des variantes reste en français (hypothèse à couvrir). */
const AR = { Bleu: 'أزرق', Rose: 'وردة', Gris: 'رمادي' };
const TRAD = process.env.TRAD || 'coherent';
const produit = (selectionId, langue = 'fr') => {
  const ar = langue === 'ar';
  const nomValeur = (n) => (ar ? AR[n] : n);
  const nomVariante = (n) => (ar && TRAD === 'coherent' ? AR[n] : n);
  const vs = variantes().map((v) => ({ ...v, title: nomVariante(v.title), option1: nomVariante(v.option1), options: [nomVariante(v.option1)] }));
  const brutes = variantes();
  const idx = brutes.findIndex((v) => String(v.id) === String(selectionId));
  const iChoisie = idx >= 0 ? idx : Math.max(0, brutes.findIndex((v) => v.available));
  const choisie = vs[iChoisie];
  const valeurs = brutes.map((v, i) => Object.assign(new Valeur(nomValeur(v.option1)), { id: 600 + i, available: v.available, selected: i === iChoisie, variant: vs[i] }));
  return {
    ...PRODUIT, title: ar ? 'نوماد — وسادة الرضاعة من ليلوفان' : PRODUIT.title, variants: vs, price: choisie.price, url: (ar ? '/ar' : '') + '/products/' + PRODUIT.handle,
    selected_or_first_available_variant: choisie, options: [ar ? 'لون' : 'Coloris'],
    options_with_values: [{ name: ar ? 'لون' : 'Coloris', position: 1, selected_value: valeurs[iChoisie], values: valeurs }],
  };
};

let panier = []; // [{ key, variant_id, quantity }]
const vueLigne = (l, i, url, langue = 'fr') => {
  const v0 = VARIANTES.find((x) => x.id === l.variant_id);
  const ar = langue === 'ar';
  const v = { ...v0, title: ar ? AR[v0.title] : v0.title };
  const PRODUIT_L = { ...PRODUIT, title: ar ? 'نوماد — وسادة الرضاعة من ليلوفان' : PRODUIT.title };
  return {
    key: l.key, id: v.id, variant_id: v.id, quantity: l.quantity, title: `${PRODUIT_L.title} - ${v.title}`,
    product: { title: PRODUIT_L.title, has_only_default_variant: false }, variant: { title: v.title },
    product_title: PRODUIT_L.title, variant_title: v.title, product_has_only_default_variant: false,
    final_line_price: v.price * l.quantity, final_price: v.price, price: v.price, line_price: v.price * l.quantity,
    url: url + '?variant=' + v.id, image: null, properties: l.properties || {},
  };
};
const vuePanier = (racine = '') => {
  const items = panier.map((l, i) => vueLigne(l, i, racine + '/products/' + PRODUIT.handle, racine === '/ar' ? 'ar' : 'fr'));
  return { items, item_count: items.reduce((s, x) => s + x.quantity, 0), total_price: items.reduce((s, x) => s + x.final_line_price, 0), note: '' };
};

/* ------------------------------------------------------------ moteur */
const moteur = new Liquid({ root: [path.join(THEME, 'snippets')], extname: '.liquid', strictFilters: false, strictVariables: false, jsTruthy: false });
const ignorer = (nom) => moteur.registerTag(nom, class extends Tag {
  constructor(tok, rest, liquid) {
    super(tok, rest, liquid);
    while (rest.length) { const t = rest.shift(); if (t.name === 'end' + nom) break; }
  }
  * render() { return ''; }
});
['schema', 'javascript', 'stylesheet'].forEach(ignorer);
moteur.registerTag('style', class extends Tag {
  constructor(tok, rest, liquid) { super(tok, rest, liquid); this.tpl = []; const st = liquid.parser.parseStream(rest).on('tag:endstyle', () => st.stop()).on('template', (t) => this.tpl.push(t)).on('end', () => { throw new Error('endstyle'); }); st.start(); }
  * render(ctx, emitter) { emitter.write('<style>'); yield this.liquid.renderer.renderTemplates(this.tpl, ctx, emitter); emitter.write('</style>'); }
});
moteur.registerTag('form', class extends Tag {
  constructor(tok, rest, liquid) {
    super(tok, rest, liquid);
    const m = tok.args.match(/^\s*'([^']+)'\s*(?:,\s*([a-z_]+)\s*)?(.*)$/);
    this.kind = m[1];
    this.hash = new Hash((m[3] || '').replace(/^\s*,/, ''));
    this.tpl = [];
    const st = liquid.parser.parseStream(rest).on('tag:endform', () => st.stop()).on('template', (t) => this.tpl.push(t)).on('end', () => { throw new Error('endform'); });
    st.start();
  }
  * render(ctx, emitter) {
    const attrs = yield this.hash.render(ctx);
    const action = this.kind === 'product' ? '/cart/add' : this.kind === 'localization' ? '/localization' : '/' + this.kind;
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    emitter.write(`<form method="post" action="${action}" accept-charset="UTF-8" ${a}>`);
    yield this.liquid.renderer.renderTemplates(this.tpl, ctx, emitter);
    emitter.write('</form>');
  }
});
const traduire = (langue) => function (cle) {
  const v = String(cle).split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), LOCALES[langue]);
  if (v === undefined || typeof v === 'object') { manquantes.add(`${langue}:${cle}`); return `translation missing: ${langue}.${cle}`; }
  return v;
};
/* Comme Shopify : `| t: nom: valeur` remplace {{ nom }} dans la traduction. */
moteur.registerFilter('t', function (cle, ...args) {
  let texte = traduire(this.context.getSync(['request', 'locale', 'iso_code']) || 'fr')(cle);
  args.filter(Array.isArray).forEach(([nom, valeur]) => { texte = String(texte).split(`{{ ${nom} }}`).join(valeur); });
  return texte;
});
moteur.registerFilter('json', (v) => JSON.stringify(v && v.valueOf ? v.valueOf() : v));
moteur.registerFilter('asset_url', (f) => '/cdn/assets/' + f);
moteur.registerFilter('asset_img_url', (f) => '/cdn/assets/' + f);
moteur.registerFilter('stylesheet_tag', (u) => `<link rel="stylesheet" href="${u}">`);
moteur.registerFilter('image_url', (i) => (i && i.src) || '');
moteur.registerFilter('image_tag', (u) => (u ? `<img src="${u}" alt="">` : ''));
moteur.registerFilter('placeholder_svg_tag', () => '<svg class="placeholder" viewBox="0 0 10 10"></svg>');
moteur.registerFilter('money', (c) => 'DA ' + (Number(c) / 100).toFixed(2));
moteur.registerFilter('money_without_currency', (c) => (Number(c) / 100).toFixed(2));
moteur.registerFilter('handle', (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
moteur.registerFilter('abs', (n) => Math.abs(Number(n)));
moteur.registerFilter('video_tag', () => '');
moteur.registerFilter('external_video_tag', () => '');
moteur.registerFilter('payment_type_svg_tag', () => '');
moteur.registerFilter('within', (u) => u);
moteur.registerFilter('default_pagination', () => '');
moteur.registerFilter('standard_event_data', () => '');

/* Valeurs par défaut des réglages, lues dans le {% schema %} de chaque section */
const schemaDe = (fichier) => {
  const m = lire(fichier).match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/);
  return m ? JSON.parse(m[1]) : {};
};
const defauts = (liste = []) => Object.fromEntries(liste.filter((s) => s.id).map((s) => [s.id, s.default === undefined ? null : s.default]));
const construireSection = (id, type, donnees = {}) => {
  const schema = schemaDe(`sections/${type}.liquid`);
  const blocsSchema = Object.fromEntries((schema.blocks || []).map((b) => [b.type, b]));
  const ordre = donnees.block_order || Object.keys(donnees.blocks || {});
  const blocks = ordre.map((bid) => {
    const b = donnees.blocks[bid];
    return { id: bid, type: b.type, shopify_attributes: '', settings: { ...defauts((blocsSchema[b.type] || {}).settings), ...b.settings } };
  });
  return { id, type, settings: { ...defauts(schema.settings), ...(donnees.settings || {}) }, blocks };
};

const contexte = (langue, gabarit, extra = {}) => {
  const racine = langue === 'ar' ? '/ar' : '';
  return {
    settings: SETTINGS, shop: { name: 'Llufan', url: 'https://llufan.com' },
    request: { locale: { iso_code: langue, primary: langue === 'fr', root_url: racine || '/' }, page_type: gabarit, path: racine + '/' },
    localization: {
      language: { iso_code: langue },
      available_languages: [{ iso_code: 'fr', endonym_name: 'français', root_url: '/' }, { iso_code: 'ar', endonym_name: 'العربية', root_url: '/ar' }],
      available_countries: [], country: { iso_code: 'DZ', name: 'Algérie', currency: { iso_code: 'DZD' } },
    },
    routes: { product_recommendations_url: racine + '/recommendations/products', root_url: racine || '/', cart_url: racine + '/cart', account_url: racine + '/account', all_products_collection_url: racine + '/collections/all', search_url: racine + '/search' },
    cart: vuePanier(racine), template: { name: gabarit }, page_title: 'Test', canonical_url: '/',
    pages: { faq: { url: racine + '/pages/faq', title: 'FAQ' }, contact: { url: racine + '/pages/contact' }, 'la-marque': { url: racine + '/pages/la-marque' } },
    collections: { all: { url: racine + '/collections/all', products: [] }, maternite: { url: racine + '/collections/maternite', title: 'Maternité' }, allaitement: { url: racine + '/collections/allaitement', title: 'Allaitement' } },
    all_products: { [PRODUIT.handle]: { url: racine + '/products/' + PRODUIT.handle } },
    linklists: {}, blogs: {},
    ...extra,
  };
};

const rendreSection = async (id, type, donnees, ctx) => {
  const section = construireSection(id, type, donnees);
  const html = await moteur.parseAndRender(lire(`sections/${type}.liquid`), { ...ctx, section }, { globals: ctx });
  return `<div id="shopify-section-${id}" class="shopify-section">${html}</div>`;
};
const rendreGroupe = async (fichier, ctx) => {
  const g = json(fichier);
  const morceaux = [];
  for (const id of g.order) morceaux.push(await rendreSection(id, g.sections[id].type, g.sections[id], ctx));
  return morceaux.join('\n');
};
const rendreGabarit = async (gabarit, ctx) => {
  const t = json(`templates/${gabarit}.json`);
  const morceaux = [];
  for (const id of t.order) {
    if (t.sections[id].disabled) continue;
    morceaux.push(await rendreSection(`template--1__${id}`, t.sections[id].type, t.sections[id], ctx));
  }
  return morceaux.join('\n');
};
const page = async (langue, gabarit, ctx) => {
  let layout = lire('layout/theme.liquid');
  const entete = await rendreGroupe('sections/header-group.json', ctx);
  const pied = await rendreGroupe('sections/footer-group.json', ctx);
  const tiroir = await rendreSection('cart-drawer', 'cart-drawer', {}, ctx);
  layout = layout.replace(/{%-?\s*sections 'header-group'\s*-?%}/, '{{ __entete }}')
    .replace(/{%-?\s*sections 'footer-group'\s*-?%}/, '{{ __pied }}')
    .replace(/{%-?\s*section 'cart-drawer'\s*-?%}/, '{{ __tiroir }}');
  const contenu = await rendreGabarit(gabarit, ctx);
  const html = await moteur.parseAndRender(layout, { ...ctx, content_for_header: '<script>window.Shopify={routes:{root:' + JSON.stringify(ctx.routes.root_url === '/' ? '/' : ctx.routes.root_url + '/') + '}};</script>', content_for_layout: contenu, __entete: entete, __pied: pied, __tiroir: tiroir }, { globals: ctx });
  return html;
};

/* ------------------------------------------------------------ serveur */
const corps = (req) => new Promise((ok) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => ok(d)); });
const envoyer = (res, code, type, data) => { res.writeHead(code, { 'Content-Type': type }); res.end(data); };
let compteurCle = 0;
/* Pannes simulées (tests) : sections-500 | sections-null | sections-absente |
   sections-coupee | change-500 | add-reponse-perdue | cartjs-500 |
   section-id-coupee (rendu du tiroir par theme.js : /?section_id=cart-drawer) */
let panne = new Set();
const mutations = { add: 0, change: 0, ajoutNatif: 0 };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let chemin = url.pathname;
    const langue = chemin.startsWith('/ar/') || chemin === '/ar' ? 'ar' : 'fr';
    if (langue === 'ar') chemin = chemin.slice(3) || '/';
    const ctxDe = (gabarit, extra) => contexte(langue, gabarit, extra);

    if (chemin.startsWith('/cdn/assets/')) {
      const f = path.join(THEME, 'assets', path.basename(chemin));
      if (!fs.existsSync(f)) return envoyer(res, 404, 'text/plain', 'absent');
      if (process.env.TARIFS_ABSENTS && f.endsWith('.json')) return envoyer(res, 500, 'text/plain', 'erreur');
      const types = { '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
      return envoyer(res, 200, types[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f));
    }
    if (chemin === '/__test/reset') { panier = []; indisponible = null; panne = new Set(); mutations.add = 0; mutations.change = 0; mutations.ajoutNatif = 0; return envoyer(res, 200, 'text/plain', 'ok'); }
    if (chemin === '/__test/panne') { panne = new Set((url.searchParams.get('modes') || '').split(',').filter(Boolean)); return envoyer(res, 200, 'text/plain', [...panne].join(',')); }
    if (chemin === '/__test/mutations') return envoyer(res, 200, 'application/json', JSON.stringify(mutations));
    if (chemin === '/cart/add' && req.method === 'POST') { mutations.ajoutNatif += 1; return envoyer(res, 404, 'text/html', 'envoi natif'); }
    if (chemin === '/__test/indisponible') { indisponible = Number(url.searchParams.get('id')) || null; return envoyer(res, 200, 'text/plain', 'ok'); }
    if (chemin === '/__test/manquantes') return envoyer(res, 200, 'application/json', JSON.stringify([...manquantes]));

    if (chemin === '/cart/add.js' && req.method === 'POST') {
      mutations.add += 1;
      const brut = await corps(req);
      const ct = req.headers['content-type'] || '';
      let id; let q;
      let props = {};
      if (ct.includes('json')) { const d = JSON.parse(brut); id = d.id; q = d.quantity; props = d.properties || {}; } else {
        const m = brut.match(/name="id"\r?\n\r?\n(\d+)/); const n = brut.match(/name="quantity"\r?\n\r?\n(\d+)/);
        id = m && m[1]; q = n ? n[1] : 1;
      }
      const v = variantes().find((x) => String(x.id) === String(id));
      if (!v || !v.available) return envoyer(res, 422, 'application/json', JSON.stringify({ status: 422, description: 'Variante indisponible' }));
      await new Promise((ok) => setTimeout(ok, 150)); // latence réaliste
      /* Comme Shopify : même variante avec d'autres propriétés = ligne séparée */
      const memes = (l) => l.variant_id === v.id && JSON.stringify(l.properties || {}) === JSON.stringify(props);
      const exist = panier.find(memes);
      if (exist) exist.quantity += Number(q); else panier.push({ key: `${v.id}:k${++compteurCle}`, variant_id: v.id, quantity: Number(q), properties: props });
      if (panne.has('add-reponse-perdue')) return envoyer(res, 502, 'text/html', 'Bad Gateway'); // ajout fait, puis erreur passerelle
      return envoyer(res, 200, 'application/json', JSON.stringify(vueLigne(panier.find(memes), 0, '')));
    }
    if (chemin === '/cart/change.js' && req.method === 'POST') {
      mutations.change += 1;
      const d = JSON.parse(await corps(req));
      if (panne.has('change-500')) return envoyer(res, 500, 'application/json', JSON.stringify({ status: 500, description: 'erreur simulée' }));
      if (panne.has('change-400-vide')) { panier = []; return envoyer(res, 400, 'application/json', JSON.stringify({ status: 400, description: 'ligne introuvable' })); }
      if (panne.has('change-lent')) await new Promise((ok) => setTimeout(ok, 900));
      const l = d.id ? panier.find((x) => x.key === d.id) : panier[Number(d.line) - 1];
      if (l) { l.quantity = Number(d.quantity); panier = panier.filter((x) => x.quantity > 0); }
      if (panne.has('change-502-apres')) return envoyer(res, 502, 'text/html', 'Bad Gateway');   // appliquée, non confirmée
      if (panne.has('change-json-casse')) return envoyer(res, 200, 'application/json', '{"items":[');  // appliquée, réponse illisible
      await new Promise((ok) => setTimeout(ok, 100));
      return envoyer(res, 200, 'application/json', JSON.stringify(vuePanier(langue === 'ar' ? '/ar' : '')));
    }
    if (chemin === '/cart.js' && panne.has('cartjs-500')) return envoyer(res, 500, 'application/json', '{}');
    if (chemin === '/cart.js') return envoyer(res, 200, 'application/json', JSON.stringify(vuePanier(langue === 'ar' ? '/ar' : '')));
    if (chemin === '/cart' && url.searchParams.get('sections')) {
      if (panne.has('sections-500')) return envoyer(res, 500, 'text/html', 'erreur simulée');
      if (panne.has('sections-coupee')) { req.socket.destroy(); return; }
      const ctx = ctxDe('cart');
      const sortie = {};
      const tpl = json('templates/cart.json');
      for (const id of url.searchParams.get('sections').split(',')) {
        if (id === 'cart-drawer') sortie[id] = await rendreSection('cart-drawer', 'cart-drawer', {}, ctx);
        else { const cle = id.replace('template--1__', ''); if (tpl.sections[cle]) sortie[id] = await rendreSection(id, tpl.sections[cle].type, tpl.sections[cle], ctx); }
      }
      if (panne.has('sections-null')) Object.keys(sortie).forEach((k) => { sortie[k] = null; });
      if (panne.has('sections-absente')) Object.keys(sortie).forEach((k) => { delete sortie[k]; });
      return envoyer(res, 200, 'application/json', JSON.stringify(sortie));
    }
    /* Rendu de section utilisé par theme.js (refreshCart) : /?section_id=cart-drawer */
    if (url.searchParams.get('section_id') === 'cart-drawer' && panne.has('section-id-coupee')) { req.socket.destroy(); return; }
    if (url.searchParams.get('section_id') === 'cart-drawer') return envoyer(res, 200, 'text/html; charset=utf-8', await rendreSection('cart-drawer', 'cart-drawer', {}, ctxDe('cart')));
    if (chemin === '/cart') return envoyer(res, 200, 'text/html; charset=utf-8', await page(langue, 'cart', ctxDe('cart')));
    if (chemin.startsWith('/recommendations/')) return envoyer(res, 200, 'text/html', '<div></div>');
    if (chemin.startsWith('/products/') && chemin !== '/products/' + PRODUIT.handle) return envoyer(res, 404, 'text/html', '<p>404</p>');
    if (chemin.startsWith('/products/')) {
      const ctx = ctxDe('product', { product: produit(url.searchParams.get('variant'), langue) });
      return envoyer(res, 200, 'text/html; charset=utf-8', await page(langue, 'product', ctx));
    }
    if (chemin === '/localization' && req.method === 'POST') {
      const d = new URLSearchParams(await corps(req));
      res.writeHead(302, { Location: d.get('language_code') === 'ar' ? '/ar/products/' + PRODUIT.handle : '/products/' + PRODUIT.handle }); return res.end();
    }
    return envoyer(res, 404, 'text/html', '<p>404</p>');
  } catch (e) {
    console.error(e);
    envoyer(res, 500, 'text/plain', String(e && e.stack || e));
  }
}).listen(PORT, () => console.log('banc LLUFAN sur', PORT, THEME));
