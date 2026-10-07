/* ==========================================================================
   LLUFAN — comportements et animations du thème

   Les animations reproduisent celles observées sur le site de référence :
   durées, courbes et séquences sont celles relevées dans ses feuilles de
   style et ses scripts publics. Elles ne se déclenchent que si le système
   n'exige pas de mouvement réduit (sauf indication contraire).
   ========================================================================== */
(() => {
  'use strict';

  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const EASING = {
    zoom: 'cubic-bezier(.25,.46,.45,.94)',    // images (zoom lent, diaporama)
    out: 'cubic-bezier(.215,.61,.355,1)',     // entrée des contenus du diaporama
    in: 'cubic-bezier(.55,.055,.675,.19)',    // sortie des contenus du diaporama
    dialog: 'cubic-bezier(.645,.045,.355,1)', // tiroirs, fenêtres, panneaux
  };

  /* ---------------------------------------------------------------------
     Hauteurs du bandeau et de l'en-tête (pilots du CSS collant)
     --------------------------------------------------------------------- */
  // Courbe cubic-bezier évaluée en y pour un x donné (abscisse de progression)
  const easeOut = (x, x1 = 0, y1 = 0, x2 = 0.58, y2 = 1) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const bezierX = (t) => ((ax * t + bx) * t + cx) * t;
    const bezierY = (t) => ((ay * t + by) * t + cy) * t;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const currentX = bezierX(t) - x;
      if (Math.abs(currentX) < 1e-5) break;
      const slope = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(slope) < 1e-6) break;
      t -= currentX / slope;
    }
    return bezierY(Math.min(1, Math.max(0, t)));
  };

  const measureSticky = () => {
    // Le bandeau peut être collant (réglage du marchand) : l'en-tête se place
    // alors juste en dessous. On mesure l'élément réel, que la section soit
    // collante elle-même ou que ce soit son conteneur Shopify.
    const bar = $('.announcement-bar');
    const header = $('.header');
    if (bar) {
      const parent = bar.parentElement;
      // Conteneur Shopify collant s'il y en a un, sinon le bandeau lui-même :
      // on ne mesure jamais « body », dont la hauteur est celle de la page.
      const parentIsSticky = parent && parent !== document.body && getComputedStyle(parent).position === 'sticky';
      const holder = parentIsSticky ? parent : bar;
      const isSticky = parentIsSticky || getComputedStyle(bar).position === 'sticky';
      document.documentElement.style.setProperty(
        '--announcement-bar-height', isSticky ? `${holder.offsetHeight}px` : '0px');
    }
    if (header) document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
  };
  on(window, 'resize', measureSticky);
  on(document, 'DOMContentLoaded', measureSticky);
  measureSticky();

  /* ---------------------------------------------------------------------
     Barre de chargement : démarre sur clic de lien interne ou envoi de
     formulaire, se termine au chargement de la page (durées .25 s)
     --------------------------------------------------------------------- */
  customElements.define('loading-bar', class extends HTMLElement {
    connectedCallback() {
      this.classList.add('is-hidden');
      this.start = this.start.bind(this);
      this.finish = this.finish.bind(this);
      on(document, 'click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link) return;
        const url = new URL(link.href, location.href);
        if (url.origin !== location.origin || link.target === '_blank' || event.metaKey || event.ctrlKey) return;
        if (url.pathname === location.pathname && url.search === location.search) return;
        this.start();
      });
      on(document, 'submit', (event) => { if (!event.target.closest('[data-cart-form]')) this.start(); });
      on(window, 'pageshow', this.finish);
      on(document, 'DOMContentLoaded', this.finish);
    }
    start() {
      this.classList.remove('is-hidden', 'is-complete');
      this.classList.add('is-loading');
    }
    finish() {
      if (!this.classList.contains('is-loading')) return;
      this.classList.remove('is-loading');
      this.classList.add('is-complete');
      setTimeout(() => { this.classList.remove('is-complete'); this.classList.add('is-hidden'); }, 250);
    }
  });

  /* ---------------------------------------------------------------------
     Tiroirs (panier, menu, filtres, recherche) — courbe .3 s de la référence
     --------------------------------------------------------------------- */
  const overlay = $('.page-overlay');
  const openDrawer = (id) => {
    const drawer = document.getElementById(id);
    if (!drawer) return;
    drawer.setAttribute('open', '');
    drawer.classList.add('is-open');
    drawer.removeAttribute('aria-hidden');
    if (drawer.classList.contains('drawer--menu')) {
      drawer.classList.remove('is-animating-out');
      drawer.classList.add('is-animating-in');
      setTimeout(() => drawer.classList.remove('is-animating-in'), 400);
    }
    document.body.classList.add('overflow-hidden');
    overlay && overlay.classList.add('is-active');
    // apparition en cascade des entrées du tiroir
    const stagger = drawer.querySelector('.drawer__stagger');
    if (stagger) {
      stagger.classList.remove('is-animating');
      void stagger.offsetWidth;
      stagger.classList.add('is-animating');
    }
    const focusable = drawer.querySelector('button, [href], input, select, textarea');
    focusable && focusable.focus({ preventScroll: true });
  };
  const closeDrawers = () => {
    $$('.drawer.is-open').forEach((d) => {
      if (d.classList.contains('drawer--menu')) {
        d.classList.remove('is-animating-in');
        d.classList.add('is-animating-out');
        setTimeout(() => d.classList.remove('is-animating-out'), 300);
      }
      d.classList.remove('is-open');
      d.removeAttribute('open');
      d.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('overflow-hidden');
    overlay && overlay.classList.remove('is-active');
  };
  window.LLUFAN = { openDrawer, closeDrawers };

  on(document, 'click', (event) => {
    const opener = event.target.closest('[data-drawer-open]');
    if (opener) { event.preventDefault(); openDrawer(opener.dataset.drawerOpen); return; }
    if (event.target.closest('[data-drawer-close]') || event.target === overlay) closeDrawers();
  });
  on(document, 'keydown', (e) => { if (e.key === 'Escape') closeDrawers(); });

  /* ---------------------------------------------------------------------
     Panier : rafraîchissement du contenu, compteur, pastille
     --------------------------------------------------------------------- */
  const refreshCart = async () => {
    const res = await fetch(`${window.Shopify.routes.root}?section_id=cart-drawer`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const freshDrawer = doc.querySelector('cart-drawer');
    const currentDrawer = $('cart-drawer');
    if (freshDrawer && currentDrawer) {
      /* On remplace le CONTENU du tiroir, pas le tiroir lui-même : il garde
         son état ouvert. Remplacer toute la section le refermait à chaque
         changement de quantité, en laissant le fond grisé et la page bloquée. */
      currentDrawer.innerHTML = freshDrawer.innerHTML;
    } else {
      const fresh = doc.querySelector('#shopify-section-cart-drawer');
      const current = $('#shopify-section-cart-drawer');
      if (fresh && current) current.replaceWith(fresh);
    }
    /* Nombre d'articles : porté par le tiroir lui-même (data-nombre-articles).
       L'ancien code le cherchait dans l'en-tête, absent de cette section : la
       pastille repassait à 0 après chaque ajout. */
    const count = freshDrawer ? freshDrawer.dataset.nombreArticles : undefined;
    if (count === undefined) return;
    $$('[data-cart-count]').forEach((el) => { el.textContent = count; });
    $$('[data-cart-dot]').forEach((el) => el.classList.toggle('is-visible', Number(count) > 0));
  };

  const showQuantitySpinner = (selector, onOff) => {
    const node = typeof selector === 'string' ? $(selector) : selector;
    if (node) node.classList.toggle('is-loading', onOff);
  };

  on(document, 'submit', async (event) => {
    const form = event.target.closest('form[data-cart-form], .shopify-product-form');
    if (!form || form.dataset.preventDrawer === 'true') return;
    event.preventDefault();
    const button = event.submitter || form.querySelector('[type="submit"]');
    const isQuickAdd = button && button.classList.contains('product-card__quick-add-button');
    if (button) button.setAttribute('aria-busy', 'true');
    if (isQuickAdd) button.classList.add('adding-to-cart');

    try {
      const formData = new FormData(form);
      if (button && button.name) formData.append(button.name, button.value);
      const res = await fetch(`${window.Shopify.routes.root}cart/add.js`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        const errorNode = form.querySelector('[data-cart-error]');
        if (errorNode) { errorNode.textContent = err.description || err.message || ''; errorNode.hidden = false; }
        if (isQuickAdd) button.classList.remove('adding-to-cart');
        return;
      }
      await refreshCart();
      if (isQuickAdd) {
        // La coche reste dessinée un court instant avant le retour à l'état normal
        setTimeout(() => button.classList.remove('adding-to-cart'), 1400);
        openDrawer('cart-drawer');
      } else {
        openDrawer('cart-drawer');
      }
    } catch (e) {
      if (isQuickAdd) button.classList.remove('adding-to-cart');
      form.submit();
    } finally {
      if (button) button.removeAttribute('aria-busy');
    }
  });

  on(document, 'click', async (event) => {
    const link = event.target.closest('[data-quantity-change]');
    if (!link) return;
    event.preventDefault();
    const line = link.dataset.line;
    const qty = link.dataset.quantity;
    const label = link.getAttribute('aria-label') || '';
    const dansLeTiroir = Boolean(link.closest('cart-drawer'));
    const selector = link.closest('.quantity-selector');
    showQuantitySpinner(selector, true);
    try {
      await fetch(`${window.Shopify.routes.root}cart/change.js`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line, quantity: Number(qty) }),
      });
      /* Page panier : on recharge la page pour que les lignes, les totaux et
         le formulaire de commande repartent du panier à jour. */
      if (!dansLeTiroir) { window.location.reload(); return; }
      await refreshCart();
      /* Le bouton cliqué a été remplacé : on remet le focus sur son équivalent,
         pour enchaîner « + » / « − » sans rouvrir le panier. */
      const equivalent = $$('cart-drawer [data-quantity-change]')
        .find((el) => el.dataset.line === line && el.getAttribute('aria-label') === label);
      if (equivalent) equivalent.focus({ preventScroll: true });
    } finally {
      showQuantitySpinner(selector, false);
    }
  });

  /* ---------------------------------------------------------------------
     Diaporama (héros) — séquences relevées sur la référence :
     entrée : diapositive en fondu .8 s (courbe « zoom »), image fondu +
     passage de l'échelle 1.2 à 1 en .8 s, contenu en fondu + translation
     30 → 0 px en .6 s à partir de 0,4 s (courbe « out »)
     sortie : contenu en fondu + translation 0 → 20 px en .25 s (courbe « in »),
     image en fondu .2 s à partir de 0,15 s
     --------------------------------------------------------------------- */
  customElements.define('slideshow-carousel', class extends HTMLElement {
    connectedCallback() {
      this.slides = $$(':scope > .slideshow__slide', this);
      if (this.slides.length === 0) return;
      this.index = Math.max(0, this.slides.findIndex((s) => s.classList.contains('is-selected')));
      this.speed = Number(this.dataset.speed || 5) * 1000;
      this.dots = $$(`[data-slideshow-dots="${this.id}"] > *`);

      this.slides.forEach((slide, i) => slide.classList.toggle('is-selected', i === this.index));
      if (this.dataset.autoplay !== 'false' && this.slides.length > 1) this.startAutoplay();
      if (this.hasAttribute('allow-swipe')) this.enableSwipe();
      on(document, 'visibilitychange', () => {
        document.hidden ? this.stopAutoplay() : this.startAutoplay();
      });
    }
    startAutoplay() {
      this.stopAutoplay();
      if (this.dataset.autoplay === 'false' || this.slides.length < 2) return;
      this.timer = setInterval(() => this.goTo(this.index + 1, 'next'), this.speed);
      this.style.setProperty('--slideshow-progress-play-state', 'running');
    }
    stopAutoplay() {
      clearInterval(this.timer);
      this.style.setProperty('--slideshow-progress-play-state', 'paused');
    }
    restartProgress() {
      this.style.setProperty('--slideshow-progress-duration', `${this.speed}ms`);
      this.stopAutoplay();
      this.startAutoplay();
    }
    goTo(index, direction = 'next') {
      const total = this.slides.length;
      const next = (index + total) % total;
      if (next === this.index) return;
      const leaving = this.slides[this.index];
      const entering = this.slides[next];
      this.index = next;
      this.updateDots();

      if (!reduceMotion) {
        // sortie
        const leavingContent = $('.slideshow__slide-content', leaving);
        const leavingImage = $('.slideshow__slide-media', leaving) || $('picture img', leaving);
        if (leavingContent) leavingContent.animate(
          [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(20px)' }],
          { duration: 250, easing: EASING.in, fill: 'forwards' });
        if (leavingImage) leavingImage.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: 200, delay: 150, easing: EASING.in, fill: 'forwards' });
        // entrée
        entering.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 800, easing: EASING.zoom, fill: 'forwards' });
        entering.classList.add('is-selected');
        const enteringImage = $('.slideshow__slide-media', entering) || $('picture img', entering);
        const enteringContent = $('.slideshow__slide-content', entering);
        if (enteringImage) {
          enteringImage.animate(
            [{ opacity: 0, transform: 'scale(1.2)' }, { opacity: 1, transform: 'scale(1)' }],
            { duration: 800, easing: EASING.zoom, fill: 'forwards' });
        }
        if (enteringContent) {
          enteringContent.animate(
            [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 600, delay: 400, easing: EASING.out, fill: 'forwards' });
        }
        setTimeout(() => {
          leaving.classList.remove('is-selected');
          leaving.classList.remove('is-leaving');
        }, 800);
      } else {
        entering.classList.add('is-selected');
        leaving.classList.remove('is-selected');
      }
    }
    updateDots() {
      this.dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === this.index)));
    }
    enableSwipe() {
      let startX = null;
      on(this, 'touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
      on(this, 'touchend', (e) => {
        if (startX === null) return;
        const delta = e.changedTouches[0].clientX - startX;
        if (Math.abs(delta) > 50) this.goTo(this.index + (delta < 0 ? 1 : -1));
        startX = null;
      });
    }
  });

  /* ---------------------------------------------------------------------
     Carrousel d'avis : autoplay 5 s, balayage, points de pagination
     --------------------------------------------------------------------- */
  customElements.define('testimonial-carousel', class extends HTMLElement {
    connectedCallback() {
      this.items = $$('.testimonial', this);
      if (this.items.length < 2) return;
      this.index = Math.max(0, this.items.findIndex((i) => i.classList.contains('is-selected')));
      this.speed = Number(this.dataset.speed || 5) * 1000;
      this.dots = $$(`[data-carousel-dots="${this.id}"] > *`);
      this.show = this.show.bind(this);
      this.dots.forEach((dot, k) => on(dot, 'click', () => { this.show(k); this.restart(); }));
      on(this, 'touchstart', (e) => { this.startX = e.touches[0].clientX; }, { passive: true });
      on(this, 'touchend', (e) => {
        if (this.startX == null) return;
        const delta = e.changedTouches[0].clientX - this.startX;
        if (Math.abs(delta) > 50) { this.show(this.index + (delta < 0 ? 1 : -1)); this.restart(); }
        this.startX = null;
      });
      this.restart();
    }
    show(index) {
      this.index = (index + this.items.length) % this.items.length;
      this.items.forEach((item, k) => item.classList.toggle('is-selected', k === this.index));
      this.dots.forEach((dot, k) => dot.setAttribute('aria-current', String(k === this.index)));
      this.style.setProperty('--slideshow-progress-duration', `${this.speed}ms`);
    }
    restart() {
      clearInterval(this.timer);
      if (this.dataset.autoplay === 'false') return;
      this.timer = setInterval(() => this.show(this.index + 1), this.speed);
    }
  });

  /* ---------------------------------------------------------------------
     Bandeau d'annonce : fondu entre messages (.3 s)
     --------------------------------------------------------------------- */
  customElements.define('announcement-bar-carousel', class extends HTMLElement {
    connectedCallback() {
      const slides = $$(':scope > *', this);
      if (slides.length < 2) return;
      let i = Math.max(0, slides.findIndex((s) => s.classList.contains('is-selected')));
      const go = (n) => {
        i = (n + slides.length) % slides.length;
        slides.forEach((s, k) => s.classList.toggle('is-selected', k === i));
      };
      const speed = Number(this.dataset.speed || 5000);
      if (this.dataset.autoplay !== 'false') setInterval(() => go(i + 1), speed);
      $$('[data-announcement-prev]', this.parentElement).forEach((b) => on(b, 'click', () => go(i - 1)));
      $$('[data-announcement-next]', this.parentElement).forEach((b) => on(b, 'click', () => go(i + 1)));
    }
  });

  /* ---------------------------------------------------------------------
     Apparition des cartes produit au défilement
     paramètres relevés : opacité 0 → 1, translation 20 → 0 px,
     durée .2 s (ease-in-out), décalage de .05 s par carte réparti sur .4 s
     --------------------------------------------------------------------- */
  customElements.define('product-list', class extends HTMLElement {
    connectedCallback() {
      if (reduceMotion || this.dataset.animate === 'false') return;
      const cards = $$('product-card[reveal-on-scroll="true"]', this);
      if (cards.length === 0) return;
      if (!('IntersectionObserver' in window)) { cards.forEach((c) => (c.style.opacity = 1)); return; }
      // Décalage d'apparition relevé dans la référence : start .4 s puis
      // 0.05 s par carte, réparti sur la courbe « ease-out » (cubic-bezier(0,0,.58,1)).
      const span = 0.05 * cards.length;
      const delayOf = (index) => (0.4 + easeOut(index / cards.length) * span) * 1000;
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          cards.forEach((card, index) => {
            const animation = card.animate(
              [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'translateY(0)' }],
              { duration: 200, delay: delayOf(index), easing: 'ease-in-out', fill: 'forwards' });
            animation.finished.then(() => { card.style.opacity = 1; card.style.transform = 'none'; }).catch(() => {});
          });
        });
      }, { rootMargin: '0px 0px -10% 0px' });
      observer.observe(this);
    }
  });

  /* ---------------------------------------------------------------------
     Accordéons : hauteur animée .25 s (ease) + contenu en fondu et
     translation 4 → 0 px en .15 s démarrant 0,1 s avant la fin
     --------------------------------------------------------------------- */
  const animateAccordion = (details, open) => {
    const content = details.querySelector('.accordion__content');
    if (!content || reduceMotion || !details.animate) {
      details.open = open;
      return;
    }
    if (open) {
      details.open = true;
      const from = details.querySelector('summary').clientHeight;
      const to = details.scrollHeight;
      details.style.overflow = 'hidden';
      const grow = details.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 250, easing: 'ease' });
      content.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 150, delay: 100, easing: 'ease' });
      grow.finished.then(() => { details.style.height = null; details.style.overflow = null; }).catch(() => {});
    } else {
      const from = details.clientHeight;
      details.style.overflow = 'hidden';
      content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease' });
      const shrink = details.animate([{ height: `${from}px` }, { height: `${details.querySelector('summary').clientHeight}px` }],
        { duration: 250, delay: 100, easing: 'ease' });
      shrink.finished.then(() => {
        details.open = false;
        details.style.height = null;
        details.style.overflow = null;
      }).catch(() => { details.open = false; });
    }
  };
  on(document, 'click', (event) => {
    const summary = event.target.closest('.accordion > summary');
    if (!summary) return;
    event.preventDefault();
    const details = summary.parentElement;
    animateAccordion(details, !details.open);
  });

  /* ---------------------------------------------------------------------
     Sous-menus de l'en-tête (ordinateur) : ouverture en fondu .25 s puis
     entrées décalées de 0,1 s ; fermeture en fondu .4 s
     --------------------------------------------------------------------- */
  $$('[data-dropdown]').forEach((wrapper) => {
    const button = wrapper.querySelector('[aria-expanded]');
    const panel = wrapper.querySelector('.header__dropdown-menu');
    if (!button || !panel) return;
    let hideTimer;
    const open = () => {
      clearTimeout(hideTimer);
      wrapper.classList.remove('is-closing');
      wrapper.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      if (!wrapper.classList.contains('is-open')) return;
      wrapper.classList.remove('is-open');
      wrapper.classList.add('is-closing');
      button.setAttribute('aria-expanded', 'false');
      hideTimer = setTimeout(() => wrapper.classList.remove('is-closing'), 400);
    };
    on(button, 'click', (e) => { e.preventDefault(); wrapper.classList.contains('is-open') ? close() : open(); });
    if (finePointer) {
      on(wrapper, 'mouseenter', open);
      on(wrapper, 'mouseleave', close);
    }
    on(wrapper, 'keydown', (e) => { if (e.key === 'Escape') { close(); button.focus(); } });
    on(document, 'click', (e) => { if (!wrapper.contains(e.target)) close(); });
  });

  /* ---------------------------------------------------------------------
     En-tête — deux comportements au défilement, au choix du marchand :
     « shadow » (page d'atterrissage) : reste visible, ombre portée dès
     8 px de défilement ; « auto_hide » : se masque au-delà de 100 px vers
     le bas, réapparaît à la remontée, jamais si un menu est ouvert.
     --------------------------------------------------------------------- */
  const header = $('.header');
  if (header) {
    const behavior = header.dataset.headerBehavior || 'shadow';
    if (behavior === 'shadow') {
      const setScrolled = () => header.classList.toggle('is-scrolled', window.pageYOffset > 8);
      on(window, 'scroll', setScrolled, { passive: true });
      setScrolled();
    } else if (behavior === 'auto_hide') {
      let tracking = 0;
      let visible = true;
      const setVisibility = (isVisible) => {
        if (isVisible === visible) return;
        if (!isVisible && document.querySelectorAll('[open], .is-open').length > 0) return;
        visible = isVisible;
        document.documentElement.style.setProperty('--header-is-visible', isVisible ? '1' : '0');
        header.classList.toggle('is-hidden', !isVisible);
      };
      on(window, 'scroll', () => {
        const y = Math.max(0, window.scrollY);
        if (y > tracking && y - tracking > 100) { setVisibility(false); tracking = y; }
        else if (y < tracking) { tracking = y; setVisibility(true); }
      }, { passive: true });
      on(window, 'pointermove', (event) => {
        if (event.clientY < 100 && finePointer) { setVisibility(true); tracking = 0; }
      }, { passive: true });
    }
  }

  /* Sélecteur de langue / pays : la pastille dépliante se referme au clic
     à l'extérieur ou avec Échap (comportement attendu d'un menu) */
  $$('.header__locale').forEach((details) => {
    on(document, 'click', (event) => { if (!details.contains(event.target)) details.removeAttribute('open'); });
    on(details, 'keydown', (event) => { if (event.key === 'Escape') details.removeAttribute('open'); });
  });

  /* ---------------------------------------------------------------------
     Carrousels à défilement aimanté (cartes produit, galerie)
     --------------------------------------------------------------------- */
  customElements.define('scroll-carousel', class extends HTMLElement {
    connectedCallback() {
      this.addEventListener('scroll', () => this.update(), { passive: true });
      this.update();
    }
    update() {
      const max = this.scrollWidth - this.clientWidth;
      const prev = this.parentElement.querySelector('[data-carousel-prev]');
      const next = this.parentElement.querySelector('[data-carousel-next]');
      if (prev) prev.disabled = this.scrollLeft <= 2;
      if (next) next.disabled = this.scrollLeft >= max - 2;
    }
    slide(direction) {
      const card = this.firstElementChild;
      const step = card ? card.getBoundingClientRect().width + 32 : this.clientWidth * 0.8;
      this.scrollBy({ left: step * direction, behavior: 'smooth' });
    }
  });
  on(document, 'click', (e) => {
    const btn = e.target.closest('[data-carousel-prev], [data-carousel-next]');
    if (!btn) return;
    const wrapper = btn.closest('.carousel-wrapper');
    if (!wrapper) return;
    const carousel = wrapper.querySelector('scroll-carousel');
    if (carousel) carousel.slide(btn.hasAttribute('data-carousel-next') ? 1 : -1);
    const slideshow = wrapper.querySelector('slideshow-carousel');
    if (slideshow) slideshow.goTo(slideshow.index + (btn.hasAttribute('data-carousel-next') ? 1 : -1));
  });

  /* ---------------------------------------------------------------------
     Sélecteur de variantes : prix, disponibilité, image et état du bouton
     --------------------------------------------------------------------- */
  customElements.define('variant-picker', class extends HTMLElement {
    connectedCallback() {
      this.productForm = document.querySelector(`#${this.dataset.formId}`);
      if (!this.productForm) return;
      this.variants = JSON.parse(this.querySelector('[data-variant-json]')?.textContent || '[]');
      this.addEventListener('change', () => this.select());
      this.select(true);
    }
    get selectedOptions() {
      return $$('fieldset', this).map((fieldset) => fieldset.querySelector('input:checked')?.value).filter(Boolean);
    }
    select(initial) {
      const options = this.selectedOptions;
      const variant = this.variants.find((v) => [v.option1, v.option2, v.option3].slice(0, options.length).every((o, i) => o === options[i]));
      $$('fieldset', this).forEach((fieldset) => {
        $$('.color-swatch, .variant-picker__value', fieldset).forEach((label) => {
          const input = label.previousElementSibling;
          label.classList.toggle('is-selected', !!input?.checked);
        });
      });
      const idInput = this.productForm.querySelector('[name="id"]');
      const button = this.productForm.querySelector('[type="submit"]');
      const availability = $('[data-variant-availability]');
      const image = $('[data-variant-image-main]');
      if (variant) {
        if (idInput) idInput.value = variant.id;
        $$('[data-variant-price]').forEach((el) => { el.innerHTML = variant.price_formatted; });
        if (availability) {
          availability.textContent = variant.available ? availability.dataset.textInStock : availability.dataset.textOutOfStock;
          availability.hidden = false;
        }
        if (button) {
          button.disabled = !variant.available;
          button.textContent = variant.available ? button.dataset.textAdd : button.dataset.textSoldOut;
        }
        if (variant.featured_image && image) {
          image.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 300, easing: 'ease-in-out' });
          if (image.dataset.src) image.src = variant.featured_image;
        }
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        if (!initial) history.replaceState({}, '', url.toString());
      } else if (button) {
        button.disabled = true;
        button.textContent = button.dataset.textUnavailable || button.dataset.textSoldOut;
      }
    }
  });

  /* ---------------------------------------------------------------------
     Quantité (fiche produit)
     --------------------------------------------------------------------- */
  on(document, 'click', (e) => {
    const btn = e.target.closest('[data-quantity-button]');
    if (!btn) return;
    const wrapper = btn.closest('.quantity-selector');
    const input = wrapper.querySelector('input');
    const step = btn.dataset.quantityButton === 'plus' ? 1 : -1;
    input.value = Math.max(1, Number(input.value || 1) + step);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ---------------------------------------------------------------------
     Filtres, tri et panneaux déroulants
     --------------------------------------------------------------------- */
  on(document, 'submit', (e) => {
    const form = e.target.closest('form[data-facets-form]');
    if (!form) return;
    $$('input[type="checkbox"]', form).forEach((input) => { if (!input.checked) input.disabled = true; });
  });
  on(document, 'change', (e) => {
    const select = e.target.closest('[data-sort-select]');
    if (select) select.form.submit();
  });
  on(document, 'click', (e) => {
    const toggle = e.target.closest('[data-popover-toggle]');
    if (toggle) {
      const panel = document.getElementById(toggle.getAttribute('aria-controls'));
      if (panel) {
        const willOpen = panel.hidden;
        $$('.popover__panel').forEach((p) => { p.hidden = true; });
        panel.hidden = !willOpen;
        toggle.setAttribute('aria-expanded', String(willOpen));
      }
    }
    if (!e.target.closest('.popover')) $$('.popover__panel').forEach((p) => { p.hidden = true; });
  });

  /* ---------------------------------------------------------------------
     Galerie produit : bouton de lecture des vidéos
     Le bouton (rond blanc, comme sur la référence) lance la vidéo et
     s'efface ; il revient dès que la vidéo est en pause ou terminée.
     --------------------------------------------------------------------- */
  on(document, 'click', (e) => {
    const bouton = e.target.closest('[data-lire-video]');
    if (!bouton) return;
    const lecteur = bouton.closest('[data-lecteur]');
    const video = lecteur && lecteur.querySelector('video');
    if (!video) return;
    video.play();
  });
  on(document, 'play', (e) => {
    const video = e.target.closest && e.target.closest('video');
    const lecteur = video && video.closest('[data-lecteur]');
    lecteur && lecteur.classList.add('product-gallery__lecteur--en-lecture');
  }, true);
  on(document, 'pause', (e) => {
    const video = e.target.closest && e.target.closest('video');
    const lecteur = video && video.closest('[data-lecteur]');
    lecteur && lecteur.classList.remove('product-gallery__lecteur--en-lecture');
  }, true);

  /* ---------------------------------------------------------------------
     Galerie produit : synchronisation des vignettes
     --------------------------------------------------------------------- */
  on(document, 'click', (e) => {
    const thumb = e.target.closest('[data-gallery-thumb]');
    if (!thumb) return;
    const gallery = thumb.closest('.product-gallery');
    const index = Number(thumb.dataset.galleryThumb);
    $$('[data-gallery-thumb]', gallery).forEach((t) => t.setAttribute('aria-current', String(t === thumb)));
    const carousel = gallery.querySelector('.product-gallery__carousel');
    const slide = carousel.children[index];
    slide && carousel.scrollTo({ left: slide.offsetLeft - carousel.offsetLeft, behavior: 'smooth' });
  });
  on(document, 'scroll', () => {
    $$('.product-gallery__carousel').forEach((carousel) => {
      const gallery = carousel.closest('.product-gallery');
      const index = Math.round(carousel.scrollLeft / carousel.clientWidth);
      $$('[data-gallery-thumb]', gallery).forEach((t, k) => t.setAttribute('aria-current', String(k === index)));
    });
  }, true);

  /* ---------------------------------------------------------------------
     Pré-bandeau : défilement par glissement au doigt ou à la souris
     (activé sous 750 px de large, comme sur la référence)
     --------------------------------------------------------------------- */
  const preheader = $('[data-preheader]');
  if (preheader && window.innerWidth <= 749) {
    let isDown = false;
    let startX;
    let scrollLeft;
    on(preheader, 'mousedown', (e) => { isDown = true; startX = e.pageX - preheader.offsetLeft; scrollLeft = preheader.scrollLeft; });
    on(preheader, 'mouseleave', () => { isDown = false; });
    on(preheader, 'mouseup', () => { isDown = false; });
    on(preheader, 'mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - preheader.offsetLeft;
      preheader.scrollLeft = scrollLeft - (x - startX) * 1.5;
    });
  }
})();
