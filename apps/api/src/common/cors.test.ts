import assert from "node:assert/strict";
import test from "node:test";
import { allowedWebOrigins } from "./cors";

test("TV origins are opt-in and do not enable wildcard CORS", () => {
  const origins = allowedWebOrigins("http://localhost:3000");
  assert.ok(origins.includes("http://localhost:5173"));
  assert.ok(!origins.includes("null"));
  assert.ok(!origins.includes("*"));
});

test("explicit TV and LAN origins are trimmed and deduplicated", () => {
  const origins = allowedWebOrigins("http://localhost:3000", " null, file://com.lcplay.tv, http://192.168.15.8:5173, null, ");
  assert.equal(origins.filter((origin) => origin === "null").length, 1);
  assert.ok(origins.includes("file://com.lcplay.tv"));
  assert.ok(origins.includes("http://192.168.15.8:5173"));
  assert.ok(!origins.includes(""));
});
