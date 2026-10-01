import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/common/crypto";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "lc-play" },
    update: { name: "LC PLAY" },
    create: { name: "LC PLAY", slug: "lc-play" },
  });

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@lcplay.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "troque-esta-senha";
  const passwordHash = await hashPassword(password);

  await prisma.adminUser.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email,
      },
    },
    update: {
      name: process.env.SEED_ADMIN_NAME ?? "Leonardo Cali",
      passwordHash,
      active: true,
      role: "OWNER",
    },
    create: {
      tenantId: tenant.id,
      name: process.env.SEED_ADMIN_NAME ?? "Leonardo Cali",
      email,
      passwordHash,
      role: "OWNER",
    },
  });

  const customerCount = await prisma.customer.count({ where: { tenantId: tenant.id } });
  if (customerCount === 0) {
    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        name: "Dispositivo de teste",
        notes: "Cliente local criado para validar o fluxo de ativação.",
      },
    });
  }

  console.log(`LC PLAY pronto. Administrador local: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

