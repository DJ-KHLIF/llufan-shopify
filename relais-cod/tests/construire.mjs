/* Charge worker.js sous Node : l'import JSON (géré par le bundler de
   Cloudflare) est remplacé par le contenu du fichier, le reste est inchangé. */
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const build = async () => {
  const src = new URL('../src/', import.meta.url);
  const dossier = mkdtempSync(join(tmpdir(), 'relais-'));
  cpSync(src, dossier, { recursive: true });
  const donnees = readFileSync(new URL('../../assets/llufan-livraison-dz.json', import.meta.url), 'utf8');
  const w = readFileSync(join(dossier, 'worker.js'), 'utf8')
    .replace("import donneesLivraison from '../../assets/llufan-livraison-dz.json';", `const donneesLivraison = ${donnees};`);
  writeFileSync(join(dossier, 'worker.js'), w);
  writeFileSync(join(dossier, 'package.json'), '{"type":"module"}');
  return (await import(join(dossier, 'worker.js'))).default;
};
