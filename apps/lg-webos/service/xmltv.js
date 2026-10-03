'use strict';
var crypto = require('crypto');
var StringDecoder = require('string_decoder').StringDecoder;
var network = require('./network');
var parser = require('./xmltv-parser.bundle');
var cache = new Map();
var pending = new Map();

function load(address) {
  var key = crypto.createHash('sha256').update(address).digest('hex');
  var cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.index);
  if (pending.has(key)) return pending.get(key);
  var decoder = new StringDecoder('utf8');
  var xml = parser.createIndex();
  var operation = network.download(address, { full: true, kind: 'EPG', maxBytes: 80 * 1024 * 1024, timeoutMs: 20000, onData: function (chunk) { xml.write(decoder.write(chunk)); } }).then(function (result) {
    var index = new Map();
    if (!result.error && result.complete) { xml.write(decoder.end()); index = xml.finish(); }
    if (cache.size >= 2) cache.delete(cache.keys().next().value);
    cache.set(key, { index: index, expiresAt: Date.now() + (index.size ? 5 * 60000 : 30000) });
    return index;
  }).then(function (index) { pending.delete(key); return index; }, function () { pending.delete(key); return new Map(); });
  pending.set(key, operation); return operation;
}
function channelGuide(address, channel) {
  return load(address).then(function (index) {
    var now = Date.now();
    var programmes = (index.get(String(channel || '').trim().toLowerCase()) || []).filter(function (entry) { return Date.parse(entry.endsAt) > now; });
    return { status: programmes.length ? 'AVAILABLE' : 'UNAVAILABLE', now: programmes.find(function (entry) { return Date.parse(entry.startsAt) <= now; }) || null, next: programmes.find(function (entry) { return Date.parse(entry.startsAt) > now; }) || null, programmes: programmes };
  });
}
module.exports = { channelGuide: channelGuide };
