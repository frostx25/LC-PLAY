'use strict';

var Service = require('webos-service');
var guide = require('./guide');
var catalog = require('./catalog');
var service = new Service('com.lcplay.tv.guide');

service.register('loadGuide', function (message) {
  guide.loadGuide(message.payload).then(function (result) {
    result.returnValue = true;
    message.respond(result);
  }, function () {
    message.respond({ returnValue: false, errorText: 'Nao foi possivel atualizar a programacao.' });
  });
});

['loadCatalog', 'progress', 'page', 'episodes', 'clear'].forEach(function (method) {
  service.register(method === 'progress' ? 'catalogProgress' : method === 'page' ? 'catalogPage' : method === 'episodes' ? 'seriesEpisodes' : method === 'clear' ? 'clearCatalog' : method, function (message) {
    Promise.resolve().then(function () { return catalog[method](message.payload); }).then(function (result) { result.returnValue = true; message.respond(result); }, function (error) {
      var code = error && /^[A-Z_0-9]+$/.test(error.code || error.message) ? error.code || error.message : 'CATALOG_ERROR';
      message.respond({ returnValue: false, errorCode: code, errorText: 'Nao foi possivel carregar o catalogo no aparelho.' });
    });
  });
});
