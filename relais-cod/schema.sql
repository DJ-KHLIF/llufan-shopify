-- Relais COD LLUFAN — base Cloudflare D1
-- Aucune donnée personnelle : la commande Shopify est la seule à contenir nom,
-- téléphone et adresse.

CREATE TABLE IF NOT EXISTS demandes (
  cle            TEXT PRIMARY KEY,          -- UUID généré par le navigateur, réutilisé à chaque nouvel essai
  empreinte      TEXT NOT NULL,             -- SHA-256 de la demande normalisée
  etat           TEXT NOT NULL,             -- recu | simulation | brouillon_cree | incertain | commande_creee | alerte_statut_paiement | refuse
  motif          TEXT,                      -- motif de refus ou d'incertitude (sans donnée personnelle)
  brouillon_id   TEXT,
  commande_id    TEXT,
  numero         TEXT,                      -- ex. #1001
  total_centimes INTEGER,
  meta_envoye    INTEGER NOT NULL DEFAULT 0,
  verrou_jusqua  INTEGER NOT NULL,          -- empêche deux traitements simultanés de la même clé
  cree_le        INTEGER NOT NULL,
  maj_le         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS demandes_maj ON demandes (maj_le);

CREATE TABLE IF NOT EXISTS debit (
  ip_hache  TEXT NOT NULL,                  -- SHA-256(IP + sel secret), jamais l'IP en clair
  fenetre   INTEGER NOT NULL,               -- tranche de 10 minutes
  compte    INTEGER NOT NULL,
  expire_le INTEGER NOT NULL,               -- effacé après 24 h
  PRIMARY KEY (ip_hache, fenetre)
);
