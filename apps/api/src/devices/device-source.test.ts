import assert from "node:assert/strict";
import test from "node:test";
import { createDeviceSchema, updateDeviceSchema } from "@lc-play/contracts";

const device = { label: "TV de teste", platform: "LG_WEBOS", customerId: "cliente-teste" };
const playlist = { name: "Fonte da TV", type: "M3U", sourceUrl: "https://example.invalid/list.m3u", epgUrl: "https://example.invalid/epg.xml" };

test("aceita fonte direta e mantém cadastro com fonte existente ou sem fonte", () => {
  assert.equal(createDeviceSchema.parse({ ...device, playlist }).playlist?.type, "M3U");
  assert.equal(createDeviceSchema.parse({ ...device, playlistId: "fonte-existente" }).playlistId, "fonte-existente");
  assert.equal(createDeviceSchema.parse({ ...device, playlistId: null }).playlistId, null);
  assert.equal(updateDeviceSchema.parse({ playlist }).playlist?.epgUrl, playlist.epgUrl);
});

test("rejeita vínculo ambíguo sem escolher uma das duas fontes", () => {
  assert.equal(createDeviceSchema.safeParse({ ...device, playlist, playlistId: "existente" }).success, false);
  assert.equal(updateDeviceSchema.safeParse({ playlist, playlistId: "existente" }).success, false);
  assert.equal(updateDeviceSchema.safeParse({ playlist, playlistId: null }).success, false);
});

test("fonte direta exige URL válida e credenciais Xtream completas", () => {
  assert.equal(createDeviceSchema.safeParse({ ...device, playlist: { ...playlist, sourceUrl: "inválida" } }).success, false);
  assert.equal(updateDeviceSchema.safeParse({ playlist: { ...playlist, type: "XTREAM" } }).success, false);
  assert.equal(updateDeviceSchema.safeParse({ playlist: { ...playlist, type: "XTREAM", username: "teste", password: "senha-teste" } }).success, true);
});
