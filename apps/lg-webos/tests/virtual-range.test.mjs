import assert from "node:assert/strict";
import test from "node:test";
import { CHANNEL_ROW_HEIGHT, virtualChannelRange } from "../src/lib/virtual-range.ts";

test("lista grande monta apenas a janela e preserva a altura de rolagem", () => {
  for (const scrollTop of [0, 65 * 50, 65 * 1999, 999999]) {
    const range = virtualChannelRange(2000, scrollTop, 520);
    assert.ok(range.end - range.start <= 16);
    assert.ok(range.start >= 0 && range.end <= 2000);
    assert.equal(range.top + (range.end - range.start) * CHANNEL_ROW_HEIGHT + range.bottom, 2000 * CHANNEL_ROW_HEIGHT);
  }
  assert.equal(virtualChannelRange(2000, 65 * 1999, 520).end, 2000);
});

test("busca curta e lista vazia não deixam espaços de canais anteriores", () => {
  assert.deepEqual(virtualChannelRange(0, 999999, 520), { start: 0, end: 0, top: 0, bottom: 0 });
  assert.deepEqual(virtualChannelRange(3, 999999, 520), { start: 0, end: 3, top: 0, bottom: 0 });
  assert.equal(virtualChannelRange(2000, 0, 520).start, 0);
});
