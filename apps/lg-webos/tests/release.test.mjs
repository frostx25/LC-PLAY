import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { APP_VERSION } from "../src/lib/release.ts";

test("versão do player coincide com manifesto e pacote", async () => {
  const [manifest, packageJson] = await Promise.all([
    readFile(new URL("../public/appinfo.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  assert.equal(APP_VERSION, manifest.version);
  assert.equal(APP_VERSION, packageJson.version);
});
