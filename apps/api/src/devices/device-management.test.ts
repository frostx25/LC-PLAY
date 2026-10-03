import assert from "node:assert/strict";
import test from "node:test";
import type { ConfigService } from "@nestjs/config";
import { bulkDeviceSchema, createDeviceSchema, issueActivationSchema, renewDeviceSchema } from "@lc-play/contracts";
import { encryptSecret } from "../common/crypto";
import type { PrismaService } from "../prisma/prisma.service";
import { DevicesService } from "./devices.service";
import { deviceRenewal } from "./device-renewal";

const admin = { sub: "admin", tenantId: "tenant-a", email: "test@example.com", role: "OWNER" as const };
const now = new Date("2026-10-01T12:00:00Z");
test("renovação preserva prazo futuro, recupera expirados e não reativa suspensos", () => {
  const device = { status: "ACTIVE" as const, expiresAt: new Date("2026-10-10T12:00:00Z"), deviceTokenHash: "token" };
  assert.equal(deviceRenewal(device, 30, now).expiresAt.toISOString(), "2026-11-09T12:00:00.000Z");
  for (const days of [30, 90, 365] as const) {
    const expired = deviceRenewal({ ...device, status: "EXPIRED", expiresAt: new Date("2026-09-01") }, days, now);
    assert.equal(expired.expiresAt.getTime(), now.getTime() + days * 86_400_000);
    assert.equal(expired.status, "ACTIVE");
  }
  assert.equal(deviceRenewal({ ...device, status: "EXPIRED", deviceTokenHash: null }, 30, now).status, "PENDING");
  assert.equal(deviceRenewal({ ...device, status: "SUSPENDED" }, 90, now).status, "SUSPENDED");
});

test("contratos aceitam cliente automático e recusam contato ambíguo ou lote inválido", () => {
  const input = { label: "TV Sala", platform: "LG_WEBOS" };
  assert.equal(createDeviceSchema.parse(input).customerId, undefined);
  assert.equal(createDeviceSchema.safeParse({ ...input, customerId: "existing", contact: { email: "a@example.com" } }).success, false);
  assert.equal(renewDeviceSchema.safeParse({ days: 31 }).success, false);
  assert.equal(bulkDeviceSchema.safeParse({ action: "SOURCE", deviceIds: ["a"] }).success, false);
  assert.equal(bulkDeviceSchema.safeParse({ action: "SUSPEND", deviceIds: [] }).success, false);
  assert.equal(bulkDeviceSchema.safeParse({ action: "SUSPEND", deviceIds: Array(101).fill("a") }).success, false);
});

test("cadastro automático cria cliente e dispositivo na mesma transação sem juntar homônimos", async () => {
  let customerCount = 0;
  const logs: unknown[] = [];
  const tx = {
    customer: { create: async ({ data }: { data: { name: string } }) => ({ ...data, id: `customer-${++customerCount}` }) },
    device: { create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: `device-${customerCount}`, deviceTokenHash: "hidden" }) },
    auditLog: { create: async (data: unknown) => { logs.push(data); } },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
  const service = new DevicesService(prisma as unknown as PrismaService, {} as ConfigService);
  const first = await service.create(admin, { label: "TV Sala", platform: "LG_WEBOS", contact: { email: "a@example.com" } });
  const second = await service.create(admin, { label: "TV Sala", platform: "ROKU" });
  assert.equal(first.customerId, "customer-1");
  assert.equal(second.customerId, "customer-2");
  assert.equal(first.deviceTokenHash, undefined);
  assert.equal(logs.length, 4);
});

test("lote rejeita dispositivo ou fonte de outra conta antes de qualquer alteração", async () => {
  let updates = 0;
  const device = { id: "owned", tenantId: "tenant-a", status: "ACTIVE", expiresAt: null, deviceTokenHash: "hash" };
  const tx = {
    device: { findMany: async () => [device], update: async () => { updates++; } },
    playlist: { findFirst: async () => null }, auditLog: { create: async () => undefined },
  };
  const service = new DevicesService({ $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) } as unknown as PrismaService, {} as ConfigService);
  await assert.rejects(service.bulk(admin, { action: "SUSPEND", deviceIds: ["owned", "foreign"] }), /dispositivos inválidos/);
  await assert.rejects(service.bulk(admin, { action: "SOURCE", deviceIds: ["owned"], playlistId: "foreign" }), /Fonte inválida/);
  assert.equal(updates, 0);
});

test("lote deduplica seleção e registra cada renovação sem alterar credenciais", async () => {
  const changes: Array<Record<string, unknown>> = [], logs: Array<Record<string, unknown>> = [];
  const tx = {
    device: {
      findMany: async () => [{ id: "owned", label: "Sala", expiresAt: null, status: "SUSPENDED", deviceTokenHash: "hash" }],
      update: async ({ data }: { data: Record<string, unknown> }) => { changes.push(data); },
    },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { logs.push(data); } },
  };
  const service = new DevicesService({ $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) } as unknown as PrismaService, {} as ConfigService);
  assert.deepEqual(await service.bulk(admin, { action: "RENEW", deviceIds: ["owned", "owned"], days: 90 }), { updated: 1 });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].status, "SUSPENDED");
  assert.equal(changes[0].deviceTokenHash, undefined);
  assert.equal(logs[0].action, "device.renewed");
});

test("prazo de revisão não altera o limite padrão nem permite valores sem limite", () => {
  assert.equal(issueActivationSchema.parse({}).ttlMinutes, 30);
  assert.equal(issueActivationSchema.parse({}).purpose, "STANDARD");
  assert.equal(issueActivationSchema.safeParse({ ttlMinutes: 1441 }).success, false);
  assert.equal(issueActivationSchema.parse({ purpose: "LG_REVIEW", ttlMinutes: 43_200 }).ttlMinutes, 43_200);
  assert.equal(issueActivationSchema.safeParse({ purpose: "LG_REVIEW", ttlMinutes: 43_201 }).success, false);
});

test("chave de revisão exige OWNER, LG nova e fonte própria; nunca reativa a TV do cliente", async () => {
  let mutations = 0;
  let device: Record<string, unknown> = { id: "qa", platform: "LG_WEBOS", status: "PENDING", label: "LG QA - 1", playlistId: "source", deviceTokenHash: null, platformIdentifierHmac: null };
  let source = "https://lcplay.thxtech.site/playlist.m3u";
  const key = "test-review-encryption";
  const prisma = {
    device: { findFirst: async () => device, update: async () => { mutations++; } },
    playlist: { findFirst: async () => ({ type: "M3U", status: "ACTIVE", sourceUrlEncrypted: encryptSecret(source, key) }) },
    activationCode: { updateMany: async () => { mutations++; }, create: async () => { mutations++; } },
    auditLog: { create: async () => { mutations++; } },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  };
  const service = new DevicesService(prisma as unknown as PrismaService, { getOrThrow: () => key } as unknown as ConfigService);
  const input = { purpose: "LG_REVIEW", ttlMinutes: 43_200 };
  await assert.rejects(service.issueActivation({ ...admin, role: "ADMIN" }, "qa", input), /Somente o responsável/);
  for (const change of [{ platform: "ROKU" }, { status: "ACTIVE" }, { label: "TV Sala" }, { deviceTokenHash: "customer-token" }, { platformIdentifierHmac: "customer-id" }]) {
    const before = device;
    device = { ...device, ...change };
    await assert.rejects(service.issueActivation(admin, "qa", input), /LG QA novo/);
    device = before;
  }
  source = "https://other.example/private-list.m3u";
  await assert.rejects(service.issueActivation(admin, "qa", input), /fonte técnica própria/);
  assert.equal(mutations, 0);
  source = "https://lcplay.thxtech.site/playlist.m3u";
  const issued = await service.issueActivation(admin, "qa", input);
  assert.match(issued.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(Date.parse(issued.expiresAt) > Date.now() + 29 * 86_400_000);
  assert.equal(mutations, 4);
});

test("ativação concorrente não reutiliza código já reivindicado", async () => {
  let writes = 0;
  const activation = { id: "code", status: "PENDING", expiresAt: new Date(Date.now() + 60_000), deviceId: "qa", device: { platform: "LG_WEBOS", expiresAt: null } };
  const tx = {
    activationCode: { updateMany: async () => ({ count: 0 }) },
    device: { update: async () => { writes++; } },
    auditLog: { create: async () => { writes++; } },
  };
  const prisma = { activationCode: { findUnique: async () => activation }, device: { findFirst: async () => null }, $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
  const service = new DevicesService(prisma as unknown as PrismaService, { getOrThrow: () => "pepper" } as unknown as ConfigService);
  await assert.rejects(service.activate({ code: "AAAA-BBBB-CCCC", platform: "LG_WEBOS", platformDeviceId: "test-lg-identifier" }), /já utilizada/);
  assert.equal(writes, 0);
});
