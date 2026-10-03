'use strict';

var url = require('url');
var crypto = require('crypto');
var network = require('./network');
var cache = new Map();
var pending = new Map();
var indexes = new Map();
var indexPending = new Map();

function channelKey(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function providerStreamId(parameters, parsed) {
  if (!parameters.channelName && !parameters.tvgId) return Promise.resolve(parameters.streamId);
  var key = crypto.createHash('sha256').update(parameters.providerApiUrl + ':' + parameters.revision).digest('hex');
  var cached = indexes.get(key);
  var operation;
  if (cached && cached.expiresAt > Date.now()) operation = Promise.resolve(cached.channels);
  else if (indexPending.has(key)) operation = indexPending.get(key);
  else {
    var target = url.parse(url.format(parsed), true);
    target.search = null;
    target.query.action = 'get_live_streams';
    delete target.query.stream_id;
    delete target.query.limit;
    operation = network.readJson(url.format(target), 10000).then(function (response) {
      var channels = Array.isArray(response.data) ? response.data : [];
      if (indexes.size >= 4) indexes.delete(indexes.keys().next().value);
      indexes.set(key, { channels: channels, expiresAt: Date.now() + (channels.length ? 5 * 60000 : 30000) });
      indexPending.delete(key);
      return channels;
    }, function () { indexPending.delete(key); return []; });
    indexPending.set(key, operation);
  }
  return operation.then(function (channels) {
    var name = channelKey(parameters.channelName);
    var epgId = channelKey(parameters.tvgId);
    var match = name && channels.find(function (channel) { return channelKey(channel.name) === name; });
    if (!match && epgId) match = channels.find(function (channel) { return channelKey(channel.epg_channel_id) === epgId; });
    return match && /^\d{1,12}$/.test(String(match.stream_id)) ? String(match.stream_id) : parameters.streamId;
  });
}

function decodeText(value) {
  if (typeof value !== 'string') return null;
  var text = value.trim();
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(text) && text.length % 4 === 0) {
    var decoded = Buffer.from(text, 'base64').toString('utf8');
    var invalid = decoded.split('').some(function (character) { var code = character.charCodeAt(0); return code === 65533 || code < 9 || (code > 13 && code < 32); });
    if (decoded && !invalid) text = decoded;
  }
  return text.slice(0, 4000) || null;
}

function timestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  var number = Number(value);
  if (!isFinite(number) || number <= 0) return null;
  var date = new Date(number * 1000);
  return isNaN(date.getTime()) ? null : date;
}

function normalizeGuide(data, currentTime) {
  currentTime = currentTime === undefined ? Date.now() : currentTime;
  var entries = data && Array.isArray(data.epg_listings) ? data.epg_listings : [];
  var programmes = [];
  entries.slice(0, 100).forEach(function (entry) {
    var startsAt = timestamp(entry.start_timestamp);
    var endsAt = timestamp(entry.stop_timestamp || entry.end_timestamp);
    var title = decodeText(entry.title);
    if (!startsAt || !endsAt || !title || endsAt <= startsAt || endsAt.getTime() <= currentTime) return;
    programmes.push({ title: title.slice(0, 500), description: decodeText(entry.description), category: decodeText(entry.category), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  });
  programmes.sort(function (a, b) { return Date.parse(a.startsAt) - Date.parse(b.startsAt); });
  var now = programmes.find(function (entry) { return Date.parse(entry.startsAt) <= currentTime && Date.parse(entry.endsAt) > currentTime; }) || null;
  var next = programmes.find(function (entry) { return Date.parse(entry.startsAt) > currentTime; }) || null;
  return { status: programmes.length ? 'AVAILABLE' : 'UNAVAILABLE', now: now, next: next, programmes: programmes };
}

function providerGuide(parameters) {
  if (!parameters || typeof parameters.providerApiUrl !== 'string' || !/^\d{1,12}$/.test(String(parameters.streamId))) {
    return Promise.resolve({ status: 'UNAVAILABLE', now: null, next: null, programmes: [] });
  }
  var parsed = url.parse(parameters.providerApiUrl, true);
  if (!/^https?:$/.test(parsed.protocol || '') || !parsed.pathname.endsWith('/player_api.php') || !parsed.query.username || !parsed.query.password) {
    return Promise.resolve({ status: 'UNAVAILABLE', now: null, next: null, programmes: [] });
  }
  var key = crypto.createHash('sha256').update([parameters.sourceId, parameters.revision, parameters.providerApiUrl, parameters.streamId, parameters.channelName, parameters.tvgId].join(':')).digest('hex');
  var cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.guide);
  if (pending.has(key)) return pending.get(key);
  parsed.search = null;
  parsed.query.action = 'get_short_epg';
  parsed.query.stream_id = parameters.streamId;
  parsed.query.limit = 8;
  var operation = providerStreamId(parameters, parsed).then(function (streamId) {
    parsed.query.stream_id = streamId;
    var address = url.format(parsed);
    return network.readJson(address, 10000).then(function (response) {
      if (!response.diagnostic.error || [401, 403, 404].indexOf(response.diagnostic.http) !== -1) return response;
      return new Promise(function (resolve) { setTimeout(resolve, 300); }).then(function () { return network.readJson(address, 10000); });
    });
  }).then(function (response) {
    var guide = response.diagnostic.error ? { status: 'ERROR', now: null, next: null, programmes: [], diagnostic: { http: response.diagnostic.http, code: response.diagnostic.error } } : normalizeGuide(response.data);
    var ttl = guide.status === 'AVAILABLE' ? 5 * 60000 : 30000;
    if (guide.now) ttl = Math.min(ttl, Math.max(1000, Date.parse(guide.now.endsAt) - Date.now()));
    if (guide.next) ttl = Math.min(ttl, Math.max(1000, Date.parse(guide.next.startsAt) - Date.now()));
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, { guide: guide, expiresAt: Date.now() + ttl });
    return guide;
  }).then(function (guide) { pending.delete(key); return guide; }, function () {
    pending.delete(key);
    return { status: 'ERROR', now: null, next: null, programmes: [] };
  });
  pending.set(key, operation);
  return operation;
}

function loadGuide(parameters) {
  if (!parameters || !parameters.catalogId) return providerGuide(parameters);
  return require('./catalog').snapshot(parameters.catalogId).then(function (snapshot) {
    if (snapshot.catalog.source.id !== parameters.sourceId || snapshot.revision !== parameters.revision) return { status: 'UNAVAILABLE', now: null, next: null, programmes: [] };
    return providerGuide(parameters).then(function (guide) {
      if (guide.status === 'AVAILABLE' || !snapshot.epgUrl || !parameters.tvgId) return guide;
      return require('./xmltv').channelGuide(snapshot.epgUrl, parameters.tvgId);
    });
  });
}
module.exports = { normalizeGuide: normalizeGuide, loadGuide: loadGuide };
