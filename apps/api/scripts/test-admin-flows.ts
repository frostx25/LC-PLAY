import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { hashPassword } from "../src/common/crypto";

async function main() {
process.loadEnvFile(".env");
if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Este teste exige banco local.");
const prisma = new PrismaClient();
const slug = `admin-flow-${randomUUID()}`;
const tenantIds: string[] = [];
const server = createServer((request, response) => {
  if (request.url === "/bad") { response.writeHead(403); response.end("denied"); return; }
  response.setHeader("content-type", "text/plain");
  response.end(request.url === "/epg"
    ? '<tv><programme channel="canal" start="20990101000000 +0000" stop="20990101010000 +0000"><title>Programa</title></programme></tv>'
    : '#EXTM3U\n#EXTINF:-1 tvg-id="canal" group-title="Canais",Canal de teste\nhttps://example.com/live.ts\n');
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const fixtureUrl = `http://127.0.0.1:${address.port}`;
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
let token = "";
async function call(path: string, method = "GET", body?: unknown, expected = 200) {
  const response = await fetch(`http://localhost:4100/api/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(150_000),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
try {
  const passwordHash = await hashPassword(randomUUID());
  for (const suffix of ["a", "b"]) {
    const tenant = await prisma.tenant.create({ data: { name: "Teste isolado", slug: `${slug}-${suffix}` } });
    tenantIds.push(tenant.id);
    const admin = await prisma.adminUser.create({ data: { tenantId: tenant.id, name: "Teste", email: `${slug}-${suffix}@example.invalid`, passwordHash, role: "OWNER" } });
    if (suffix === "a") token = await jwt.signAsync({ sub: admin.id, tenantId: tenant.id, email: admin.email, role: admin.role }, { expiresIn: "10m" });
  }
  const foreignCustomer = await prisma.customer.create({ data: { tenantId: tenantIds[1], name: "Outra conta" } });
  const foreignDevice = await prisma.device.create({ data: { tenantId: tenantIds[1], customerId: foreignCustomer.id, label: "Outra TV", platform: "ROKU" } });
  const first = await call("admin/devices", "POST", { label: "TV automática", platform: "LG_WEBOS", contact: { email: "contact@example.invalid", phone: "11900000000" } }, 201);
  assert.equal(first.customer.name, first.label); assert.equal(first.customer.email, "contact@example.invalid");
  assert.equal(first.deviceTokenHash, undefined);
  const second = await call("admin/devices", "POST", { label: "Segunda TV", platform: "ROKU", customerId: first.customer.id }, 201);
  await call(`admin/devices/${first.id}`, "PATCH", { label: "TV editada", contact: { email: "updated@example.invalid", phone: "" }, expiresAt: "2099-01-01T00:00:00Z" });
  const details = await call(`admin/devices/${second.id}`);
  assert.equal(details.device.customer.email, "updated@example.invalid");
  assert.ok(details.history.some((log: { action: string }) => log.action === "customer.updated"));
  await call(`admin/devices/${first.id}/renew`, "POST", { days: 30 }, 201);
  assert.equal((await call(`admin/devices/${first.id}`)).device.expiresAt, "2099-01-31T00:00:00.000Z");
  await call("admin/devices/bulk", "POST", { action: "SUSPEND", deviceIds: [first.id, foreignDevice.id] }, 400);
  assert.equal((await call(`admin/devices/${first.id}`)).device.status, "PENDING");
  await call(`admin/devices/${foreignDevice.id}`, "GET", undefined, 404);
  await call("admin/devices", "POST", { label: "Recusada", platform: "LG_WEBOS", customerId: foreignCustomer.id }, 400);
  const source = await call("admin/playlists", "POST", { name: "Fonte fixture", type: "M3U", sourceUrl: `${fixtureUrl}/m3u`, epgUrl: `${fixtureUrl}/epg` }, 201);
  await call("admin/devices/bulk", "POST", { action: "SOURCE", deviceIds: [first.id, second.id], playlistId: source.id }, 201);
  assert.equal((await call(`admin/devices/${first.id}`)).device.playlist.id, source.id);
  await call("admin/devices/bulk", "POST", { action: "SUSPEND", deviceIds: [first.id, second.id] }, 201);
  await call("admin/devices/bulk", "POST", { action: "RENEW", deviceIds: [first.id, second.id], days: 90 }, 201);
  assert.equal((await call(`admin/devices/${second.id}`)).device.status, "SUSPENDED");
  const diagnostic = await call(`admin/playlists/${source.id}/diagnostic`, "POST", {}, 201);
  assert.equal(diagnostic.m3u.status, "OK"); assert.equal(diagnostic.epg.status, "OK");
  assert.equal((await call(`admin/playlists/${source.id}/diagnostic`)).m3u.count, 1);
  await call(`admin/playlists/${source.id}`, "PATCH", { sourceUrl: `${fixtureUrl}/bad`, status: "PAUSED" });
  const failed = await call(`admin/playlists/${source.id}/diagnostic`, "POST", {}, 201);
  assert.equal(failed.m3u.status, "ERROR");
  const sources = await call("admin/playlists");
  assert.equal(sources[0].status, "PAUSED"); assert.match(sources[0].lastError, /403/);
  const history = await call(`admin/devices/${first.id}`);
  for (const action of ["device.created", "device.updated", "device.renewed", "device.suspended", "device.source_changed"]) assert.ok(history.history.some((log: { action: string }) => log.action === action));
  await prisma.device.update({ where: { id: second.id }, data: { status: "EXPIRED" } });
  await call(`admin/devices/${second.id}`, "PATCH", { expiresAt: "2099-01-01T00:00:00Z" });
  assert.equal((await call(`admin/devices/${second.id}`)).device.status, "PENDING");
  console.log("OK: cadastro, contato compartilhado, edição, renovação, lote, isolamento de contas, diagnóstico M3U/EPG, falhas e histórico.");
} finally {
  // Only disposable tenants created by this run are removed; no user data is touched.
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds }, slug: { startsWith: slug } } });
  await prisma.$disconnect();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
