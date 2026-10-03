'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');
var StringDecoder = require('string_decoder').StringDecoder;
var network = require('./network');
var parser = require('./m3u-parser.bundle');
var root = path.join(os.tmpdir(), 'com.lcplay.tv.catalog');
var loaded = new Map();
var pending = new Map();
var working = new Set();
var epoch = 0;
var PAGE_SIZE = 250;
var filenames = ['LIVE.jsonl', 'MOVIE.jsonl', 'EPISODES.jsonl', 'SERIES.jsonl', 'manifest.json', 'RAW.m3u'];

function io(method, args) {
  return new Promise(function (resolve, reject) { fs[method].apply(fs, args.concat(function (error, value) { if (error) reject(error); else resolve(value); })); });
}
function fail(code) { var error = new Error(code); error.code = code; throw error; }
function directory(id) { if (!/^[a-f0-9]{64}$/.test(id || '')) fail('INVALID_CATALOG'); return path.join(root, id); }
function write(filename, value) { return io('writeFile', [filename, value, { mode: 384 }]); }
function mkdir(filename) { return io('mkdir', [filename, { mode: 448 }]).catch(function (error) { if (error.code !== 'EEXIST') throw error; }); }
function normalized(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function cleanGroup(value) { return value.replace(/^(canais?|filmes?|movies?|s[eé]ries?)\s*[|/:-]\s*/i, '').replace(/\s+/g, ' ').trim() || 'Outros'; }
function remove(id) {
  var dir = directory(id);
  loaded.delete(id);
  return filenames.reduce(function (promise, name) { return promise.then(function () { return io('unlink', [path.join(dir, name)]).catch(function (error) { if (error.code !== 'ENOENT') throw error; }); }); }, Promise.resolve())
    .then(function () { return io('rmdir', [dir]).catch(function (error) { if (error.code !== 'ENOENT') throw error; }); });
}
function prune(keep) {
  return io('readdir', [root]).then(function (names) {
    return names.filter(function (name) { return /^[a-f0-9]{64}$/.test(name) && keep.indexOf(name) === -1 && !working.has(name); })
      .reduce(function (promise, name) { return promise.then(function () { return remove(name); }); }, Promise.resolve());
  });
}
function snapshot(id) {
  if (!/^[a-f0-9]{64}$/.test(id || '')) return Promise.reject(new Error('INVALID_CATALOG'));
  if (loaded.has(id)) return Promise.resolve(loaded.get(id));
  return io('readFile', [path.join(directory(id), 'manifest.json'), 'utf8']).then(function (text) {
    var value = JSON.parse(text);
    if (value.catalogId !== id) fail('INVALID_CATALOG');
    loaded.set(id, value);
    if (loaded.size > 2) loaded.delete(loaded.keys().next().value);
    return value;
  }).catch(function () { fail('CATALOG_EXPIRED'); });
}
function publicSnapshot(value) { return { catalogId: value.catalogId, catalog: value.catalog, revision: value.revision, diagnostic: value.diagnostic }; }

function importCatalog(parameters, id) {
  var started = Date.now();
  var generation = epoch;
  var dir = directory(id);
  var decoder = new StringDecoder('utf8');
  var carry = '';
  var header = '#EXTM3U';
  var batch = [];
  var entries = 0;
  var seen = new Set();
  var series = new Map();
  var groups = new Map();
  var summary = { total: 0, live: 0, movies: 0, series: 0, seriesTitles: 0 };
  var files = {};
  var epgUrl = parameters.epgUrl || null;
  ['LIVE', 'MOVIE', 'EPISODES', 'SERIES'].forEach(function (kind) { files[kind] = { total: 0, size: 0, points: [] }; });
  var peakRss = process.memoryUsage().rss;

  function append(kind, record, buffers) {
    var file = files[kind];
    var offset = file.size;
    var line = JSON.stringify(record) + '\n';
    var size = Buffer.byteLength(line);
    if (size > 64 * 1024) fail('RECORD_TOO_LARGE');
    if (file.total % PAGE_SIZE === 0) file.points.push(offset);
    file.total++; file.size += size; buffers[kind].push(line);
    return { start: offset, end: file.size };
  }
  function persist(buffers) {
    return Object.keys(buffers).reduce(function (promise, kind) {
      return promise.then(function () { return buffers[kind].length ? io('appendFile', [path.join(dir, kind + '.jsonl'), buffers[kind].join('')]) : null; });
    }, Promise.resolve());
  }
  function flush() {
    if (!entries) { batch = []; return Promise.resolve(); }
    var parsed = parser.parseM3uCatalog(header + '\n' + batch.join('\n'), parameters.source.id);
    epgUrl = epgUrl || parsed.embeddedEpgUrl;
    var buffers = { LIVE: [], MOVIE: [], EPISODES: [], SERIES: [] };
    parsed.items.forEach(function (seed) {
      if (seen.has(seed.id)) return;
      seen.add(seed.id);
      var item = Object.assign({}, seed, { now: null, next: null });
      summary.total++;
      summary[item.kind === 'LIVE' ? 'live' : item.kind === 'MOVIE' ? 'movies' : 'series']++;
      groups.set(item.group, (groups.get(item.group) || 0) + 1);
      if (item.kind !== 'SERIES') { append(item.kind, item, buffers); return; }
      var range = append('EPISODES', item, buffers);
      var title = item.series ? item.series.title : item.name;
      var group = cleanGroup(item.group);
      var key = normalized(group + ':' + title);
      var collection = series.get(key);
      if (!collection) { collection = { id: item.id, title: title, group: group, logo: item.logo, episodeCount: 0, ranges: [] }; series.set(key, collection); }
      collection.episodeCount++;
      collection.logo = collection.logo || item.logo;
      var last = collection.ranges[collection.ranges.length - 1];
      if (last && last.end === range.start) { last.end = range.end; last.count++; }
      else collection.ranges.push({ start: range.start, end: range.end, count: 1 });
    });
    batch = []; entries = 0;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    return persist(buffers);
  }
  function consume(text) {
    carry += text;
    if (carry.length > 512 * 1024 && carry.indexOf('\n') === -1) fail('LINE_TOO_LARGE');
    var lines = carry.split(/\r?\n/);
    carry = lines.pop();
    var index = 0;
    function next() {
      if (generation !== epoch) fail('SOURCE_REVOKED');
      while (index < lines.length) {
        var line = lines[index++].replace(/^\uFEFF/, '');
        if (line.length > 64 * 1024) fail('LINE_TOO_LARGE');
        if (line.indexOf('#EXTM3U') === 0) { header = line; continue; }
        batch.push(line);
        if (/^https?:\/\//i.test(line.trim())) entries++;
        if (batch.length > 2500) fail('INVALID_PLAYLIST');
        if (entries >= 500) return flush().then(next);
      }
      return Promise.resolve();
    }
    return next();
  }
  return mkdir(root).then(function () { return mkdir(dir); }).then(function () {
    return ['LIVE', 'MOVIE', 'EPISODES', 'SERIES'].reduce(function (promise, kind) { return promise.then(function () { return write(path.join(dir, kind + '.jsonl'), ''); }); }, Promise.resolve());
  }).then(function () {
    return write(path.join(dir, 'RAW.m3u'), '').then(function () {
      return network.download(parameters.sourceUrl, { full: true, kind: 'M3U', timeoutMs: 90000, allowLoopback: parameters.allowLoopback === true, onData: function (chunk) { return io('appendFile', [path.join(dir, 'RAW.m3u'), chunk]); } });
    });
  }).then(function (result) {
    if (result.error || !result.complete) fail(result.error || 'INCOMPLETE_DOWNLOAD');
    return new Promise(function (resolve, reject) {
      var input = fs.createReadStream(path.join(dir, 'RAW.m3u'), { highWaterMark: 256 * 1024 });
      var operation = Promise.resolve();
      input.on('error', reject);
      input.on('data', function (chunk) {
        input.pause();
        operation = operation.then(function () { return consume(decoder.write(chunk)); });
        operation.then(function () { input.resume(); }, function (error) { input.destroy(); reject(error); });
      });
      input.on('end', function () { operation.then(function () { return consume(decoder.end() + '\n'); }).then(flush).then(resolve, reject); });
    }).then(function () {
      if (!summary.total) fail('EMPTY_PLAYLIST');
      if (generation !== epoch) fail('SOURCE_REVOKED');
      summary.seriesTitles = series.size;
      var index = {};
      var buffers = { SERIES: [] };
      series.forEach(function (collection) {
        index[collection.id] = { ranges: collection.ranges, episodeCount: collection.episodeCount };
        append('SERIES', { id: collection.id, title: collection.title, group: collection.group, logo: collection.logo, episodeCount: collection.episodeCount }, buffers);
      });
      var value = { catalogId: id, revision: parameters.revision, files: files, series: index, epgUrl: epgUrl,
        catalog: { source: parameters.source, summary: summary, groups: Array.from(groups, function (entry) { return { name: entry[0], count: entry[1] }; }), truncated: false, refreshedAt: new Date().toISOString(), epg: { status: 'UNAVAILABLE', programmes: 0 } },
        diagnostic: { bytes: result.bytes, durationMs: Date.now() - started, peakRss: peakRss, diskBytes: Object.keys(files).reduce(function (total, kind) { return total + files[kind].size; }, 0) } };
      return persist(buffers).then(function () { return write(path.join(dir, 'manifest.json'), JSON.stringify(value)); }).then(function () { return io('unlink', [path.join(dir, 'RAW.m3u')]); }).then(function () { return value; });
    });
  }).catch(function (error) { return remove(id).catch(function () {}).then(function () { throw error; }); });
}

function loadCatalog(parameters) {
  if (!parameters || !parameters.source || parameters.source.id !== parameters.sourceId || parameters.source.type !== 'M3U' || typeof parameters.sourceUrl !== 'string' || typeof parameters.revision !== 'string') return Promise.reject(new Error('INVALID_SOURCE'));
  var key = crypto.createHash('sha256').update(parameters.sourceId + ':' + parameters.revision).digest('hex');
  if (pending.has(key)) return pending.get(key);
  var previousId;
  var operation = mkdir(root).then(function () { return io('readFile', [path.join(root, 'active.json'), 'utf8']); }).then(function (text) {
    var active = JSON.parse(text); previousId = active.catalogId;
    if (active.key !== key || parameters.force) return null;
    return snapshot(active.catalogId).then(function (value) { return Date.now() - Date.parse(value.catalog.refreshedAt) < 5 * 60000 ? value : null; });
  }).catch(function () { return null; }).then(function (cached) {
    if (cached) return cached;
    var id = crypto.createHash('sha256').update(key + crypto.randomBytes(16).toString('hex')).digest('hex');
    working.add(id);
    return importCatalog(parameters, id).then(function (value) {
      loaded.set(id, value);
      return write(path.join(root, id + '.active.tmp'), JSON.stringify({ key: key, catalogId: id })).then(function () { return io('rename', [path.join(root, id + '.active.tmp'), path.join(root, 'active.json')]); })
        .then(function () { return prune([id, previousId]); }).then(function () { working.delete(id); return value; });
    }, function (error) { working.delete(id); throw error; });
  }).then(function (value) { pending.delete(key); return publicSnapshot(value); }, function (error) { pending.delete(key); throw error; });
  pending.set(key, operation);
  return operation;
}

function readRecords(filename, start, end, skip, limit) {
  return new Promise(function (resolve, reject) {
    var input = fs.createReadStream(filename, { start: start, end: end === undefined ? undefined : end - 1 });
    var decoder = new StringDecoder('utf8');
    var carry = '';
    var items = [];
    var bytes = 0;
    var settled = false;
    function finish(error) { if (settled) return; settled = true; input.destroy(); if (error) reject(error); else resolve(items); }
    input.on('error', finish);
    input.on('data', function (chunk) {
      try {
        carry += decoder.write(chunk);
        var lines = carry.split('\n'); carry = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          if (skip-- > 0) continue;
          var size = Buffer.byteLength(lines[i]);
          if (items.length && bytes + size > 384 * 1024) return finish();
          bytes += size; items.push(JSON.parse(lines[i]));
          if (items.length >= limit) return finish();
        }
      } catch (error) { finish(error); }
    });
    input.on('end', function () { finish(); });
  });
}
function page(parameters) {
  var offset = parameters.offset === undefined ? 0 : parameters.offset;
  if (!Number.isSafeInteger(offset) || offset < 0 || ['LIVE', 'MOVIE', 'SERIES'].indexOf(parameters.kind) === -1) return Promise.reject(new Error('INVALID_PAGE'));
  return snapshot(parameters.catalogId).then(function (value) {
    if (value.catalog.source.id !== parameters.sourceId || value.revision !== parameters.revision) fail('SOURCE_MISMATCH');
    var file = value.files[parameters.kind];
    if (offset >= file.total) return { items: [], seriesCollections: parameters.kind === 'SERIES' ? [] : undefined, nextOffset: null };
    var checkpoint = Math.floor(offset / PAGE_SIZE);
    return readRecords(path.join(directory(value.catalogId), parameters.kind + '.jsonl'), file.points[checkpoint], undefined, offset % PAGE_SIZE, PAGE_SIZE).then(function (items) {
      return { items: parameters.kind === 'SERIES' ? [] : items, seriesCollections: parameters.kind === 'SERIES' ? items : undefined, nextOffset: offset + items.length < file.total ? offset + items.length : null };
    });
  });
}
function episodes(parameters) {
  var offset = parameters.offset === undefined ? 0 : parameters.offset;
  if (!Number.isSafeInteger(offset) || offset < 0 || !/^[a-f0-9]{24}$/.test(parameters.seriesId || '')) return Promise.reject(new Error('INVALID_PAGE'));
  return snapshot(parameters.catalogId).then(function (value) {
    if (value.catalog.source.id !== parameters.sourceId || value.revision !== parameters.revision) fail('SOURCE_MISMATCH');
    var collection = value.series[parameters.seriesId];
    if (!collection) fail('SERIES_NOT_FOUND');
    var skip = offset;
    var items = [];
    var index = 0;
    function next() {
      while (index < collection.ranges.length && skip >= collection.ranges[index].count) skip -= collection.ranges[index++].count;
      if (index >= collection.ranges.length || items.length >= PAGE_SIZE) return Promise.resolve({ items: items, nextOffset: offset + items.length < collection.episodeCount ? offset + items.length : null });
      var range = collection.ranges[index++];
      var remaining = range.count - skip;
      return readRecords(path.join(directory(value.catalogId), 'EPISODES.jsonl'), range.start, range.end, skip, PAGE_SIZE - items.length).then(function (entries) {
        items = items.concat(entries); skip = 0;
        if (entries.length < remaining) return { items: items, nextOffset: offset + items.length < collection.episodeCount ? offset + items.length : null };
        return next();
      });
    }
    return next();
  });
}
function clear() {
  epoch++; loaded.clear();
  return mkdir(root).then(function () { return io('unlink', [path.join(root, 'active.json')]).catch(function (error) { if (error.code !== 'ENOENT') throw error; }); }).then(function () { return prune([]); }).then(function () { return { cleared: true }; });
}

module.exports = { loadCatalog: loadCatalog, page: page, episodes: episodes, clear: clear, snapshot: snapshot };
