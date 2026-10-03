import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'apps/lg-webos/package.json'));
const { build } = require('esbuild');
await build({ entryPoints: [resolve(root, 'apps/api/src/catalog/m3u.parsers.ts')], outfile: resolve(root, 'apps/lg-webos/service/m3u-parser.bundle.js'), bundle: true, platform: 'node', target: 'node8', format: 'cjs', plugins: [{ name: 'node8-core-module-names', setup(builder) { builder.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path.slice(5), external: true })); } }] });
await build({ entryPoints: [resolve(root, 'apps/lg-webos/service/xmltv-parser.js')], outfile: resolve(root, 'apps/lg-webos/service/xmltv-parser.bundle.js'), bundle: true, platform: 'node', target: 'node8', format: 'cjs' });
