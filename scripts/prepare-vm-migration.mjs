import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const credentials = JSON.parse(readFileSync(0, 'utf8'));
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email || '') || typeof credentials.password !== 'string' || credentials.password.length < 12) {
  throw new Error('A valid admin email and a password of at least 12 characters are required.');
}
process.loadEnvFile(resolve(root, 'apps/api/.env'));
const output = resolve(root, 'artifacts/deployment');
mkdirSync(output, { recursive: true });
const env = {
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
  JWT_SECRET: randomBytes(48).toString('base64url'),
  DEVICE_ID_PEPPER: process.env.DEVICE_ID_PEPPER,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY,
  SEED_ADMIN_NAME: 'Leonardo Pereira',
  SEED_ADMIN_EMAIL: credentials.email.toLowerCase(),
  SEED_ADMIN_PASSWORD: credentials.password,
};
for (const [key, value] of Object.entries(env)) {
  if (typeof value !== 'string' || /[\r\n']/.test(value) || !value) throw new Error(`Invalid production environment value: ${key}`);
}
writeFileSync(resolve(output, 'vm30.env'), Object.entries(env).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
const backup = spawnSync('docker', ['exec', 'lc-play-postgres', 'pg_dump', '--no-owner', '--no-acl', '--format=custom', '--username=lc_play', 'lc_play'], { maxBuffer: 128 * 1024 * 1024 });
if (backup.status !== 0 || backup.stdout?.subarray(0, 5).toString() !== 'PGDMP') throw new Error('Local database backup failed; production credentials were not printed.');
writeFileSync(resolve(output, 'lc-play-local.dump'), backup.stdout, { mode: 0o600, flag: 'wx' });
console.log('Production environment and local database backup prepared in artifacts/deployment, excluded from Git.');
