import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Kopiera bara granskad Git-källa. Sites eget Worker-bygglager och identitet bevaras.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = process.argv[2] && path.resolve(process.argv[2]);
if (!destination || destination === root || !fs.existsSync(path.join(destination, '.openai/hosting.json'))) {
  throw new Error('Ange sökvägen till ett öppnat befintligt Sites-projekt med .openai/hosting.json.');
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const sha = git('rev-parse', process.argv[3] || 'origin/main').trim();
// Ursprunglig main måste innehålla den version som publiceras.
git('merge-base', '--is-ancestor', sha, 'origin/main');
const files = git('ls-tree', '-r', '--name-only', sha).trim().split('\n');
// Borttagen V4.2-kod får inte leva kvar i Sites arbetskopia när SDK:t avvecklas.
for (const relative of ['src/app/api/stripe/webhook/route.ts', 'src/lib/checkout.ts']) {
  if (!files.includes(`apps/web/${relative}`)) fs.rmSync(path.join(destination, relative), { force: true });
}
let copiedFiles = 0;
for (const file of files) {
  let relative = file.startsWith('apps/web/src/') || file.startsWith('apps/web/public/')
    ? file.slice('apps/web/'.length)
    : /^(packages\/|supabase\/migrations\/|docs\/|tests\/)/.test(file) ? file : null;
  if (file === 'apps/web/.env.example') relative = '.env.example';
  if (!relative) continue;
  const target = path.join(destination, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let content = execFileSync('git', ['show', `${sha}:${file}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
  if (file.startsWith('tests/')) {
    content = Buffer.from(content.toString('utf8').replaceAll('../apps/web/src/', '../src/')
      .replaceAll("path.join(root,'apps/web')", 'root'));
  }
  fs.writeFileSync(target, content);
  copiedFiles++;
}
const manifestPath = path.join(destination, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = JSON.parse(git('show', `${sha}:package.json`)).version;
manifest.workspaces = ['packages/*'];
const webManifest = JSON.parse(git('show', `${sha}:apps/web/package.json`));
manifest.dependencies['@yehabibi/shared'] = webManifest.dependencies['@yehabibi/shared'];
manifest.dependencies['@yehabibi/api-client'] = webManifest.dependencies['@yehabibi/api-client'];
if (!webManifest.dependencies.stripe) delete manifest.dependencies.stripe;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(destination, 'README.md'), `# Yehabibi ${manifest.version} – Sites\n\nSynkroniserad från verifierad GitHub-main: ${sha}.\n\nSamma src/public, shared och api-client som Next.js/Expo. Sites bevarar sitt befintliga Vinext/Worker-bygglager och sin identitet. Kör npm run verify innan paketering via Sites source-helper. Native PostgreSQL/API-integration körs i GitHub-repot.\n\nFöretagets externa tjänster är inte verifierade. ORDERS_ENABLED=false och PAYMENTS_ENABLED=false ska bevaras. Inga hemliga miljöfiler, kunddata eller mobilbyggen kopieras. Läs docs/UNIFIED_ARCHITECTURE_V4_2.md.\n`);
console.log(JSON.stringify({ sourceMain: sha, destination, copiedFiles, version: manifest.version }));
