'use strict';

var Service = require('webos-service');
var network = require('./network');
var service = new Service('com.lcplay.networktest.service');
var busy = false;

service.register('guideDiagnostic', function (message) {
  if (busy) return message.respond({ returnValue: false, errorText: 'Um teste ja esta em andamento.' });
  if (!message.payload || typeof message.payload.url !== 'string') return message.respond({ returnValue: false, errorText: 'Fonte ausente.' });
  busy = true;
  network.guideDiagnostic(message.payload).then(function (result) {
    busy = false;
    result.returnValue = true;
    message.respond(result);
  }, function () {
    busy = false;
    message.respond({ returnValue: false, errorText: 'Falha no diagnostico da programacao.' });
  });
});

service.register('runtime', function (message) {
  message.respond({ returnValue: true, nodeVersion: process.version });
});

service.register('probeEpg', function (message) {
  if (busy) return message.respond({ returnValue: false, errorText: 'Um teste ja esta em andamento.' });
  if (!message.payload || typeof message.payload.url !== 'string') return message.respond({ returnValue: false, errorText: 'EPG ausente.' });
  busy = true;
  network.download(message.payload.url, { full: true, kind: 'EPG', timeoutMs: 90000, maxBytes: 80 * 1024 * 1024 }).then(function (result) {
    busy = false;
    message.respond({ returnValue: true, epg: result, nodeVersion: process.version });
  }, function () {
    busy = false;
    message.respond({ returnValue: false, errorText: 'Falha no diagnostico do EPG.' });
  });
});

service.register('probe', function (message) {
  if (busy) return message.respond({ returnValue: false, errorText: 'Um teste ja esta em andamento.' });
  if (!message.payload || typeof message.payload.url !== 'string') return message.respond({ returnValue: false, errorText: 'Fonte ausente.' });
  busy = true;
  network.probe(message.payload).then(function (result) {
    busy = false;
    result.returnValue = true;
    message.respond(result);
  }, function () {
    busy = false;
    message.respond({ returnValue: false, errorText: 'Falha no diagnostico de rede.' });
  });
});
