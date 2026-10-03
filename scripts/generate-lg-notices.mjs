import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const root = resolve(import.meta.dirname, '..');
const app = createRequire(resolve(root, 'apps/lg-webos/package.json'));
const reactDom = createRequire(app.resolve('react-dom/package.json'));
const entries = [];
for (const name of ['react', 'react-dom', 'scheduler', 'hls.js', 'lucide-react', 'sax']) {
  const path = (name === 'scheduler' ? reactDom : app).resolve(name + '/package.json');
  const metadata = JSON.parse(await readFile(path, 'utf8'));
  const files = (await readdir(dirname(path))).filter((file) => /^(LICENSE|NOTICE|COPYING)(\..*)?$/i.test(file)).sort();
  if (!files.length) throw new Error('License file missing: ' + name);
  const notices = [];
  for (const file of files) notices.push(`${file}\n${(await readFile(resolve(dirname(path), file), 'utf8')).trim()}`);
  entries.push(`${metadata.name} ${metadata.version} (${metadata.license})\n${notices.join('\n\n')}`);
}
const sdk = await readFile(resolve(root, 'apps/lg-webos/public/vendor/webOSTV.js'), 'utf8');
const version = /(?:Version|VERSION)\s*:\s*([\d.]+)/i.exec(sdk)?.[1] || '1.2.13';
const commentEnd = sdk.indexOf('*/');
const header = sdk.trimStart().startsWith('/*') && commentEnd >= 0 ? sdk.slice(0, commentEnd + 2).trim() : '';
entries.push(`webOSTV.js ${version} (Apache-2.0)\n${header}\n\n${(await readFile(resolve(root, 'apps/lg-webos/public/vendor/LICENSE-2.0.txt'), 'utf8')).trim()}`);
const text = `LC PLAY - Third-Party Notices\n\nDistributed client libraries and bundled XMLTV parser. Development tools and server-only dependencies are not part of the TV package. System fonts are referenced, not distributed.\n\n${entries.join('\n\n' + '='.repeat(72) + '\n\n')}\n`;
await writeFile(resolve(root, 'apps/lg-webos/public/THIRD-PARTY-NOTICES.txt'), text);
console.log('Generated seven library notices from installed license files.');
