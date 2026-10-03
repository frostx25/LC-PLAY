import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { StringDecoder } from 'node:string_decoder';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { createIndex, date } = require('../service/xmltv-parser.bundle.js');
const network = require('../service/network.js');
const { channelGuide } = require('../service/xmltv.js');

test('native XMLTV handles split UTF-8, CDATA, timezone and all channels without retaining old programmes', () => {
  const now = Date.parse('2026-10-03T15:30:00Z');
  const entries = Array.from({ length: 12 }, (_, hour) => `<programme channel="Canal.A" start="20261003${String(hour + 9).padStart(2, '0')}0000 -0300" stop="20261003${String(hour + 10).padStart(2, '0')}0000 -0300"><title>Programa ${hour} &amp; ação</title><desc><![CDATA[Descrição e notícias]]></desc></programme>`);
  const bytes = Buffer.from(`<?xml version="1.0"?><tv>${entries.join('')}<programme channel="B" start="20261003150000Z" stop="20261003160000Z"><title>Canal B</title></programme></tv>`);
  const index = createIndex(now);
  const decoder = new StringDecoder('utf8');
  for (let offset = 0; offset < bytes.length; offset += 7) index.write(decoder.write(bytes.subarray(offset, offset + 7)));
  index.write(decoder.end());
  const channels = index.finish();
  assert.equal(channels.size, 2);
  assert.equal(channels.get('canal.a').length, 8);
  assert.equal(channels.get('canal.a')[0].title, 'Programa 3 & ação');
  assert.equal(channels.get('canal.a')[0].description, 'Descrição e notícias');
  assert.equal(channels.get('canal.a')[0].startsAt, '2026-10-03T15:00:00.000Z');
  assert.equal(date('invalid'), null);
  assert.equal(date('202610031230 -0300').toISOString(), '2026-10-03T15:30:00.000Z');
});

test('malformed XMLTV and external entity expansion are rejected', () => {
  const index = createIndex();
  assert.throws(() => { index.write('<tv><programme></tv>'); index.finish(); }, /INVALID_XMLTV/);
  const entity = createIndex();
  assert.throws(() => {
    entity.write('<!DOCTYPE tv [<!ENTITY remote SYSTEM "file:///private">]><tv><programme><title>&remote;</title></programme></tv>');
    entity.finish();
  }, /INVALID_XMLTV/);
});

test('native XMLTV shares one download and returns current and next without browser fetch', async (context) => {
  let downloads = 0;
  context.mock.method(network, 'download', async (_address, options) => {
    downloads++;
    const timestamp = (value) => new Date(value).toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';
    const now = Date.now();
    options.onData(Buffer.from(`<tv><programme channel="qa" start="${timestamp(now - 60000)}" stop="${timestamp(now + 600000)}"><title>Agora</title></programme><programme channel="qa" start="${timestamp(now + 600000)}" stop="${timestamp(now + 1200000)}"><title>Depois</title></programme></tv>`));
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { complete: true };
  });
  const [first, second] = await Promise.all([channelGuide('https://example.com/qa.xml', 'QA'), channelGuide('https://example.com/qa.xml', 'qa')]);
  assert.equal(downloads, 1);
  assert.deepEqual(first, second);
  assert.equal(first.now.title, 'Agora');
  assert.equal(first.next.title, 'Depois');
  assert.equal(first.status, 'AVAILABLE');
});
