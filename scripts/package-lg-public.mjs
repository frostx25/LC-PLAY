import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/lg-public');
const files = [
  ['deploy/Dockerfile.lg-public', 'Dockerfile'],
  ...['lg-public-server.mjs', 'lg-review-server.mjs', 'lg-review-fixture.mjs'].map((name) => [`scripts/${name}`, `scripts/${name}`]),
  ...['index.html', 'privacidade.html', 'termos.html', 'styles.css'].map((name) => [`docs/publicacao-lg/public-site/${name}`, `docs/publicacao-lg/public-site/${name}`]),
  ...['store-icon-400.png', 'splash-candidate-1920.png', 'poster-live.png', 'poster-movie.png', 'poster-series.png'].map((name) => [`artifacts/lg-store/assets/${name}`, `artifacts/lg-store/assets/${name}`]),
  ...['sample.mp4', 'clip.m3u8', ...Array.from({ length: 4 }, (_, i) => `segment-${String(i).padStart(3, '0')}.ts`)].map((name) => [`artifacts/lg-store/media/${name}`, `artifacts/lg-store/media/${name}`]),
];
const permitted = new Set(['manifest.json', ...files.map(([, destination]) => destination)]);
async function checkExisting(directory, prefix = '') {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) await checkExisting(resolve(directory, entry.name), name + '/');
    else if (!entry.isFile() || !permitted.has(name)) throw new Error(`Unexpected public build context entry: ${name}. Nothing was deleted; inspect it before packaging.`);
  }
}
await checkExisting(output);
const manifest = [];
for (const [source, destination] of files) {
  const from = resolve(root, source);
  const to = resolve(output, destination);
  const data = await readFile(from);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  manifest.push({ file: destination, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2) + '\n');
console.log(`Public LG build context ready: ${output}. Not deployed. Only legal pages and owned QA assets.`);
