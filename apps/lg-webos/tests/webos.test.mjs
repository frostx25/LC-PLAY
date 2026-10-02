import assert from "node:assert/strict";
import test from "node:test";
import { getLgDeviceIdentity } from "../src/lib/webos.ts";

test("biblioteca carregada no navegador preserva identidade de preview", async () => {
  const windowBefore = globalThis.window;
  const storageBefore = globalThis.localStorage;
  try {
    globalThis.window = { webOS: { platform: { unknown: true }, service: { request() { throw new Error("Não deveria chamar Luna no navegador"); } } } };
    globalThis.localStorage = { getItem() { return "preview-lg-test"; } };
    assert.deepEqual(await getLgDeviceIdentity(), { id: "preview-lg-test", model: "Navegador local", osVersion: "Preview" });
  } finally {
    globalThis.window = windowBefore;
    globalThis.localStorage = storageBefore;
  }
});

test("TV usa LGUDID e versão SDK sem gerar identidade de preview", async () => {
  const windowBefore = globalThis.window;
  try {
    globalThis.window = {
      webOS: {
        platform: { tv: true },
        deviceInfo(callback) { callback({ modelName: "OLED55C1PSA", sdkVersion: "6.5.3", version: "03.53.45" }); },
        service: { request(uri, options) {
          assert.equal(uri, "luna://com.webos.service.sm");
          assert.equal(options.method, "deviceid/getIDs");
          options.onSuccess({ idList: [{ idType: "LGUDID", idValue: "lg-device-test" }] });
        } },
      },
    };
    assert.deepEqual(await getLgDeviceIdentity(), { id: "lg-device-test", model: "OLED55C1PSA", osVersion: "6.5.3" });
  } finally {
    globalThis.window = windowBefore;
  }
});

test("TV sem biblioteca ou sem LGUDID não recebe identificador inventado", async () => {
  const windowBefore = globalThis.window;
  try {
    globalThis.window = { PalmServiceBridge: {} };
    await assert.rejects(getLgDeviceIdentity(), /Biblioteca webOS indisponível/);
    globalThis.window = { webOS: { platform: { tv: true }, service: { request(uri, options) { options.onSuccess({ idList: [] }); } } } };
    await assert.rejects(getLgDeviceIdentity(), /LGUDID indisponível/);
  } finally {
    globalThis.window = windowBefore;
  }
});
