import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, isAuthenticationFailure, request } from "../src/lib/device-api.ts";

test("cliente envia token e devolve JSON da API", async () => {
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.example/api/v1/device/configuration");
      assert.equal(init.headers.Authorization, "Bearer device-token");
      return new Response(JSON.stringify({ active: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    assert.deepEqual(
      await request("v1/device/configuration", undefined, "device-token", "https://api.example"),
      { active: true },
    );
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

test("cliente preserva status e mensagem de erro da API", async () => {
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "Dispositivo revogado." }), { status: 401 });
    await assert.rejects(
      request("v1/device/configuration", undefined, "revoked", "https://api.example"),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 401);
        assert.equal(error.message, "Dispositivo revogado.");
        assert.equal(isAuthenticationFailure(error), true);
        return true;
      },
    );
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

test("falha temporária sem JSON não é tratada como revogação", async () => {
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("Service unavailable", { status: 503 });
    await assert.rejects(
      request("v1/device/heartbeat", { method: "POST" }, "device-token", "https://api.example"),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 503);
        assert.equal(error.message, "Não foi possível concluir a operação (503).");
        assert.equal(isAuthenticationFailure(error), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = fetchBefore;
  }
});

test("tempo limite encerra requisição sem tratá-la como revogação", async () => {
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    await assert.rejects(
      request("v1/device/configuration", undefined, "device-token", "https://api.example", 5),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 408);
        assert.equal(isAuthenticationFailure(error), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
