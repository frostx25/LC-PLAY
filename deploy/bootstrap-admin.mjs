import { createRequire } from 'node:module';
import { resolve } from 'node:path';

if (process.env.NODE_ENV !== 'production') throw new Error('Run this migration only in the production API container.');
const require = createRequire(resolve('/app/apps/api/package.json'));
const { PrismaClient } = require('@prisma/client');
const { hashPassword, decryptSecret } = require('/app/apps/api/dist/common/crypto.js');
const prisma = new PrismaClient();
const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password || password.length < 12) throw new Error('Production admin credentials are missing.');
try {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'lc-play' } });
  if (!tenant) throw new Error('Restore the LC PLAY database before configuring the admin.');
  const playlists = await prisma.playlist.findMany({ where: { tenantId: tenant.id } });
  for (const source of playlists) {
    for (const value of [source.sourceUrlEncrypted, source.epgUrlEncrypted, source.usernameEncrypted, source.passwordEncrypted].filter(Boolean)) {
      decryptSecret(value, process.env.DATA_ENCRYPTION_KEY);
    }
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.adminUser.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } });
    const owners = await tx.adminUser.findMany({ where: { tenantId: tenant.id, role: 'OWNER', active: true } });
    const previous = existing ?? (owners.length === 1 && owners[0].email.endsWith('.local') ? owners[0] : null);
    const data = { email, name: process.env.SEED_ADMIN_NAME || 'Leonardo Pereira', passwordHash, active: true, role: 'OWNER' };
    if (previous) await tx.adminUser.update({ where: { id: previous.id }, data });
    else await tx.adminUser.create({ data: { ...data, tenantId: tenant.id } });
    await tx.adminUser.updateMany({ where: { tenantId: tenant.id, email: { endsWith: '.local' }, active: true }, data: { active: false } });
  });
  const devices = await prisma.device.count({ where: { tenantId: tenant.id } });
  console.log(JSON.stringify({ admin: email, devices, sources: playlists.length, sourceDecryptionVerified: true }));
} finally { await prisma.$disconnect(); }
