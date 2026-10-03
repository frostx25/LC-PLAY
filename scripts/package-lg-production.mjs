import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = resolve(root, 'apps/lg-webos');
const require = createRequire(import.meta.url);
const cli = dirname(require.resolve('@webos-tools/cli/package.json'));
const address = new URL(process.env.LC_PLAY_API_URL || 'https://api-lcplay.thxtech.site');
if (address.protocol !== 'https:' || address.username || address.password || address.pathname !== '/' || address.search || address.hash || /^(localhost|127\.|192\.168\.|10\.)/.test(address.hostname)) {
  throw new Error('Production API must be a public HTTPS origin, without credentials or an /api suffix.');
}
const env = { ...process.env, VITE_API_URL: address.origin, LC_PLAY_TV_OUTPUT_DIR: 'dist-tv-production' };
async function run(command, args, cwd) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? done() : reject(new Error(`Build failed with exit code ${code}`)));
  });
}
await run(process.execPath, [resolve(root, 'scripts/build-lg-service.mjs')], root);
await run(process.execPath, [resolve(root, 'scripts/generate-lg-notices.mjs')], root);
const compiler = createRequire(resolve(app, 'package.json'));
await run(process.execPath, [compiler.resolve('typescript/bin/tsc'), '-b'], app);
const vite = resolve(dirname(compiler.resolve('vite/package.json')), 'bin/vite.js');
await run(process.execPath, [vite, 'build', '--config', 'vite.tv.config.ts'], app);
await run(process.execPath, [resolve(cli, 'bin/ares-package.js'), '--no-minify', 'dist-tv-production', 'service', '--outdir', 'artifacts/production'], app);
console.log(`Production API: ${address.origin}`);
console.log(`TV package: ${resolve(app, 'artifacts/production/com.lcplay.tv_0.1.0_all.ipk')}`);
