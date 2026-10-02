import assert from "node:assert/strict";
import test from "node:test";
import { emptyDeviceFilters, effectiveStatus, matchesDevice } from "../src/lib/device-filters.ts";
const now = Date.parse("2026-10-01T12:00:00Z");
const device = { label: "Televisão Sala", platform: "LG_WEBOS", status: "ACTIVE", expiresAt: "2026-10-05T12:00:00Z", customer: { id: "a", name: "João", email: "a@example.com", phone: "11999999999" } };
test("busca ignora acentos e encontra dispositivo, cliente e contato", () => {
  for (const query of ["televisao", "JOAO", "a@example.com", "119999"]) assert.equal(matchesDevice(device, { ...emptyDeviceFilters, query }, now), true);
  assert.equal(matchesDevice(device, { ...emptyDeviceFilters, query: "inexistente" }, now), false);
});
test("filtros combinados respeitam cliente, plataforma, status e validade", () => {
  assert.equal(matchesDevice(device, { ...emptyDeviceFilters, customerId: "a", platform: "LG_WEBOS", status: "ACTIVE", validity: "7" }, now), true);
  assert.equal(matchesDevice(device, { ...emptyDeviceFilters, customerId: "b" }, now), false);
  assert.equal(matchesDevice(device, { ...emptyDeviceFilters, platform: "ROKU" }, now), false);
  assert.equal(matchesDevice(device, { ...emptyDeviceFilters, validity: "expired" }, now), false);
  assert.equal(matchesDevice({ ...device, expiresAt: null }, { ...emptyDeviceFilters, validity: "unlimited" }, now), true);
});
test("prazo expirado é visível antes do próximo heartbeat sem ocultar suspensão", () => {
  const expired = { ...device, expiresAt: "2026-09-01T00:00:00Z" };
  assert.equal(effectiveStatus(expired, now), "EXPIRED");
  assert.equal(matchesDevice(expired, { ...emptyDeviceFilters, status: "EXPIRED" }, now), true);
  assert.equal(effectiveStatus({ ...expired, status: "SUSPENDED" }, now), "SUSPENDED");
});
