/* ---------------------------------------------------------------------------
   LLUFAN — choix de la langue.

   Objectif : une visiteuse qui arrive avec un système en arabe voit la boutique
   en arabe, sans rien faire ; une visiteuse francophone voit le français. Si
   elle a déjà choisi sa langue à la main, ce choix prime et n'est plus remis
   en cause.

   Règles de prudence :
     • un choix explicite (sélecteur de langue) est mémorisé et respecté ;
     • une seule redirection par session, pour ne jamais boucler ;
     • les robots des moteurs de recherche ne sont pas redirigés (le référencement
       passe par les liens `hreflang` du layout) ;
     • si la langue du navigateur n'est pas proposée par la boutique, on ne
       touche à rien.
   --------------------------------------------------------------------------- */
(() => {
  const LANGUES = window.LLUFAN_LANGUES || {};
  const ACTUELLE = (window.LLUFAN_LANGUE_ACTUELLE || document.documentElement.lang || 'fr').toLowerCase();
  const CLE_CHOIX = 'llufan_langue_choisie';
  const CLE_SESSION = 'llufan_langue_verifiee';

  const memoriser = (valeur) => { try { localStorage.setItem(CLE_CHOIX, valeur); } catch (e) {} };
  const choisie = () => { try { return localStorage.getItem(CLE_CHOIX); } catch (e) { return null; } };
  const dejaVerifie = () => { try { return sessionStorage.getItem(CLE_SESSION) === '1'; } catch (e) { return false; } };
  const marquer = () => { try { sessionStorage.setItem(CLE_SESSION, '1'); } catch (e) {} };

  /* Le sélecteur de langue du thème : mémorise le choix explicite. */
  document.querySelectorAll('form[action*="/localization"], [data-langue-choix]').forEach((formulaire) => {
    formulaire.addEventListener('submit', () => {
      const champ = formulaire.querySelector('[name="language_code"], [name="locale_code"]');
      if (champ && champ.value) memoriser(champ.value.toLowerCase());
    });
  });

  if (dejaVerifie()) return;

  /* Robots et aperçus : on ne redirige pas. */
  if (/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|lighthouse/i.test(navigator.userAgent)) return;

  if (choisie()) return;                       // choix explicite : on respecte
  if (ACTUELLE !== 'fr') { marquer(); return; } // déjà dans une autre langue

  /* Langue(s) préférée(s) du système, dans l'ordre. */
  const preferees = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''])
    .map((l) => String(l).toLowerCase());

  /* Première langue du système proposée par la boutique (hors français). */
  const cible = preferees
    .map((l) => l.split('-')[0])
    .find((l) => l && l !== 'fr' && LANGUES[l]);

  marquer();
  if (!cible) return;                          // système francophone : rien à faire

  const adresse = LANGUES[cible];
  if (!adresse) return;
  /* On conserve la page consultée quand elle existe dans l'autre langue. */
  const chemin = window.location.pathname.replace(LANGUES.fr.replace(/\/$/, ''), '') || '/';
  const destination = adresse.replace(/\/$/, '') + (chemin === '/' ? '/' : chemin) + window.location.search;
  if (destination !== window.location.pathname + window.location.search) {
    window.location.replace(destination);
  }
})();
