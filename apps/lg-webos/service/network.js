'use strict';

var http = require('http');
var https = require('https');
var url = require('url');
var zlib = require('zlib');

function safeCode(error) {
  return error && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'NETWORK_ERROR';
}

function download(address, options) {
  options = options || {};
  var started = Date.now();
  var timeoutMs = options.timeoutMs || 90000;
  var maxBytes = options.maxBytes || 150 * 1024 * 1024;
  var sampleBytes = options.full ? Infinity : 256 * 1024;
  return new Promise(function (resolve) {
    var request, response, decoded, timer;
    var settled = false;
    var pendingData = 0;
    var ended = false;
    var result = { http: null, bytes: 0, complete: false, headerValid: false, redirects: 0 };
    var prefix = Buffer.alloc(0);
    function finish(error, complete) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) result.error = error;
      result.complete = Boolean(complete);
      result.durationMs = Date.now() - started;
      var text = prefix.toString('utf8').replace(/^\uFEFF/, '').trim();
      result.headerValid = options.kind === 'JSON' ? text[0] === '[' || text[0] === '{' : options.kind === 'EPG' ? /^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<tv(?:\s|>)/i.test(text) : text.indexOf('#EXTM3U') === 0;
      if (!result.error && !result.headerValid) result.error = result.bytes === 0 ? 'EMPTY_BODY' : 'INVALID_HEADER';
      if (options.kind !== 'EPG') {
        var header = text.split(/\r?\n/, 1)[0];
        var epg = /(?:x-tvg-url|url-tvg)\s*=\s*"([^"]+)"/i.exec(header);
        if (epg) result.embeddedEpgUrl = epg[1].split(',')[0].trim();
      }
      // Keep credentials and provider response bodies out of service replies and logs.
      if (request) request.destroy();
      if (response) response.destroy();
      if (decoded && decoded !== response) decoded.destroy();
      resolve(result);
    }
    function visit(target) {
      var parsed;
      try { parsed = url.parse(target); } catch (error) { return finish(safeCode(error)); }
      if (!/^https?:$/.test(parsed.protocol || '') || !parsed.hostname || parsed.auth) return finish('INVALID_URL');
      if (!options.allowLoopback && /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i.test(parsed.hostname)) return finish('PRIVATE_ADDRESS');
      result.host = parsed.hostname;
      var transport = parsed.protocol === 'https:' ? https : http;
      try {
        parsed.headers = { 'User-Agent': 'LC-PLAY/0.1', 'Accept-Encoding': 'gzip, deflate' };
        request = transport.get(parsed, function (incoming) {
          if (settled) return incoming.destroy();
          response = incoming;
          result.http = incoming.statusCode;
          result.firstByteMs = Date.now() - started;
          if ([301, 302, 303, 307, 308].indexOf(incoming.statusCode) !== -1 && incoming.headers.location) {
            if (result.redirects++ >= 3) return finish('TOO_MANY_REDIRECTS');
            incoming.destroy();
            return visit(url.resolve(target, incoming.headers.location));
          }
          if (incoming.statusCode !== 200) return finish('HTTP_' + incoming.statusCode);
          var encoding = (incoming.headers['content-encoding'] || '').toLowerCase();
          decoded = incoming;
          if (encoding === 'gzip') decoded = incoming.pipe(zlib.createGunzip());
          else if (encoding === 'deflate') decoded = incoming.pipe(zlib.createInflate());
          else if (encoding && encoding !== 'identity') return finish('UNSUPPORTED_ENCODING');
          result.contentEncoding = encoding || 'identity';
          incoming.on('error', function (error) { finish(safeCode(error)); });
          incoming.on('aborted', function () { finish('ABORTED'); });
          decoded.on('error', function (error) { finish(safeCode(error)); });
          decoded.on('data', function (chunk) {
            if (settled) return;
            result.bytes += chunk.length;
            if (prefix.length < 16384) prefix = Buffer.concat([prefix, chunk.slice(0, 16384 - prefix.length)]);
            if (result.bytes > maxBytes) return finish('SIZE_LIMIT');
            if (options.onData) {
              try {
                var operation = options.onData(chunk);
                if (operation && typeof operation.then === 'function') {
                  pendingData++;
                  decoded.pause();
                  operation.then(function () {
                    pendingData--;
                    if (settled) return;
                    if (ended && !pendingData) finish(null, true);
                    else if (!ended) decoded.resume();
                  }, function (error) { finish(safeCode(error)); });
                }
              } catch (error) { return finish(safeCode(error)); }
            }
            if (result.bytes >= sampleBytes) finish(null, false);
          });
          decoded.on('end', function () { ended = true; if (!pendingData) finish(null, true); });
        });
        request.on('error', function (error) { finish(safeCode(error)); });
      } catch (error) { finish(safeCode(error)); }
    }
    timer = setTimeout(function () { finish('TIMEOUT'); }, timeoutMs);
    visit(address);
  });
}

function readJson(address, timeoutMs) {
  var chunks = [];
  return download(address, { full: true, kind: 'JSON', maxBytes: 10 * 1024 * 1024, timeoutMs: timeoutMs || 30000, onData: function (chunk) { chunks.push(chunk); } }).then(function (result) {
    if (result.error) return { diagnostic: result, data: null };
    try { return { diagnostic: result, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; }
    catch (error) { result.error = error instanceof SyntaxError ? 'INVALID_JSON' : safeCode(error); return { diagnostic: result, data: null }; }
  });
}

function guideDiagnostic(parameters) {
  var parsed = url.parse(parameters.url, true);
  if (!parsed.query.username || !parsed.query.password) return Promise.resolve({ error: 'ACCOUNT_PARAMETERS_MISSING' });
  var base = url.resolve(parameters.url, '/player_api.php');
  function endpoint(action, streamId) {
    var target = url.parse(base);
    target.query = { username: parsed.query.username, password: parsed.query.password, action: action };
    if (streamId) { target.query.stream_id = streamId; target.query.limit = 4; }
    return url.format(target);
  }
  return readJson(endpoint('get_live_streams')).then(function (streams) {
    var channels = Array.isArray(streams.data) ? streams.data : [];
    var selected = channels.filter(function (channel) { return channel.epg_channel_id; }).slice(0, 3);
    if (!selected.length) selected = channels.slice(0, 3);
    var result = { live: streams.diagnostic, channelCount: channels.length, channelsWithEpgId: channels.filter(function (channel) { return channel.epg_channel_id; }).length, checks: [] };
    return selected.reduce(function (previous, channel) {
      return previous.then(function () {
        return readJson(endpoint('get_short_epg', channel.stream_id)).then(function (guide) {
          var entries = guide.data && Array.isArray(guide.data.epg_listings) ? guide.data.epg_listings : [];
          result.checks.push({ channel: String(channel.name || '').slice(0, 100), epgId: String(channel.epg_channel_id || '').slice(0, 120), diagnostic: guide.diagnostic, programmes: entries.length, guide: require('./guide').normalizeGuide(guide.data) });
        });
      });
    }, Promise.resolve()).then(function () { return result; });
  });
}

function probe(parameters) {
  var before = process.memoryUsage();
  var m3uOptions = { full: parameters.full === true, kind: 'M3U' };
  return download(parameters.url, m3uOptions).then(function (m3u) {
    var epgUrl = parameters.epgUrl || m3u.embeddedEpgUrl;
    delete m3u.embeddedEpgUrl;
    var result = { source: String(parameters.name || 'Fonte').slice(0, 80), nodeVersion: process.version, m3u: m3u };
    var epg = epgUrl && m3u.headerValid && !m3u.error
      ? download(url.resolve(parameters.url, epgUrl), { full: parameters.full === true, kind: 'EPG', timeoutMs: 90000, maxBytes: 80 * 1024 * 1024 })
      : Promise.resolve(null);
    return epg.then(function (value) {
      result.epg = value;
      result.memory = { rssBefore: before.rss, rssAfter: process.memoryUsage().rss, heapAfter: process.memoryUsage().heapUsed };
      return result;
    });
  });
}

module.exports = { download: download, probe: probe, guideDiagnostic: guideDiagnostic, readJson: readJson };
