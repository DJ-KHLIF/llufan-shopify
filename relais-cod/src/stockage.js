/* Stockage persistant (Cloudflare D1) : anti-doublon et limitation de débit.
   AUCUNE donnée personnelle ici : ni nom, ni téléphone, ni adresse, ni IP en
   clair (IP hachée avec un sel secret, conservée 24 h). Les données de la
   cliente vivent uniquement dans la commande Shopify. */

export const stockageD1 = (db) => ({
  /* Réserve la clé ; renvoie la ligne existante si elle l'était déjà. */
  async reserver(cle, emp, maintenant, verrouMs) {
    const r = await db.prepare(
      `INSERT INTO demandes (cle, empreinte, etat, verrou_jusqua, cree_le, maj_le)
       VALUES (?1, ?2, 'recu', ?3, ?4, ?4) ON CONFLICT(cle) DO NOTHING`,
    ).bind(cle, emp, maintenant + verrouMs, maintenant).run();
    if (r.meta.changes === 1) return { nouvelle: true };
    return { nouvelle: false, ligne: await this.lire(cle) };
  },
  async lire(cle) {
    return db.prepare('SELECT * FROM demandes WHERE cle = ?1').bind(cle).first();
  },
  /* Reprend le verrou d'une demande « recu » abandonnée (verrou expiré). */
  async reprendre(cle, maintenant, verrouMs) {
    const r = await db.prepare(
      `UPDATE demandes SET verrou_jusqua = ?2, maj_le = ?3 WHERE cle = ?1 AND etat = 'recu' AND verrou_jusqua < ?3`,
    ).bind(cle, maintenant + verrouMs, maintenant).run();
    return r.meta.changes === 1;
  },
  async maj(cle, champs, maintenant) {
    const noms = Object.keys(champs);
    const sql = `UPDATE demandes SET ${noms.map((n, i) => `${n} = ?${i + 2}`).join(', ')}, maj_le = ?${noms.length + 2} WHERE cle = ?1`;
    await db.prepare(sql).bind(cle, ...noms.map((n) => champs[n]), maintenant).run();
  },
  /* Envoi Meta : une seule fois par clé, même en cas d'appels concurrents. */
  async marquerMeta(cle, maintenant) {
    const r = await db.prepare('UPDATE demandes SET meta_envoye = 1, maj_le = ?2 WHERE cle = ?1 AND meta_envoye = 0').bind(cle, maintenant).run();
    return r.meta.changes === 1;
  },
  async compter(ipHache, fenetre, maintenant) {
    await db.prepare(
      `INSERT INTO debit (ip_hache, fenetre, compte, expire_le) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(ip_hache, fenetre) DO UPDATE SET compte = compte + 1`,
    ).bind(ipHache, fenetre, maintenant + 24 * 3600 * 1000).run();
    const l = await db.prepare('SELECT compte FROM debit WHERE ip_hache = ?1 AND fenetre = ?2').bind(ipHache, fenetre).first();
    return l ? l.compte : 1;
  },
  async purger(maintenant, conservationMs) {
    await db.prepare('DELETE FROM debit WHERE expire_le < ?1').bind(maintenant).run();
    await db.prepare(`DELETE FROM demandes WHERE maj_le < ?1 AND etat IN ('commande_creee','refuse','simulation','recu')`).bind(maintenant - conservationMs).run();
  },
});

/* Même interface, en mémoire : tests et simulation locale uniquement. */
export const stockageMemoire = () => {
  const demandes = new Map();
  const debit = new Map();
  return {
    demandes,
    async reserver(cle, emp, maintenant, verrouMs) {
      if (demandes.has(cle)) return { nouvelle: false, ligne: { ...demandes.get(cle) } };
      demandes.set(cle, { cle, empreinte: emp, etat: 'recu', verrou_jusqua: maintenant + verrouMs, meta_envoye: 0, cree_le: maintenant, maj_le: maintenant });
      return { nouvelle: true };
    },
    async lire(cle) { return demandes.has(cle) ? { ...demandes.get(cle) } : null; },
    async reprendre(cle, maintenant, verrouMs) {
      const l = demandes.get(cle);
      if (!l || l.etat !== 'recu' || l.verrou_jusqua >= maintenant) return false;
      l.verrou_jusqua = maintenant + verrouMs; return true;
    },
    async maj(cle, champs, maintenant) { Object.assign(demandes.get(cle), champs, { maj_le: maintenant }); },
    async marquerMeta(cle) { const l = demandes.get(cle); if (!l || l.meta_envoye) return false; l.meta_envoye = 1; return true; },
    async compter(ipHache, fenetre) { const k = `${ipHache}|${fenetre}`; debit.set(k, (debit.get(k) || 0) + 1); return debit.get(k); },
    async purger() {},
  };
};
