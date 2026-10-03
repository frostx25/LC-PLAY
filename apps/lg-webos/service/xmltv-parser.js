'use strict';
var sax = require('sax');

function date(value) {
  var match = String(value || '').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\s*([+-]\d{4}|Z))?/);
  if (!match) return null;
  var zone = match[7] && match[7] !== 'Z' ? match[7].slice(0, 3) + ':' + match[7].slice(3) : 'Z';
  var result = new Date(match[1] + '-' + match[2] + '-' + match[3] + 'T' + match[4] + ':' + match[5] + ':' + (match[6] || '00') + zone);
  return isNaN(result.getTime()) ? null : result;
}

function createIndex(currentTime) {
  currentTime = currentTime === undefined ? Date.now() : currentTime;
  var parser = sax.parser(true, { trim: true });
  var index = new Map();
  var current = null;
  var field = null;
  var depth = 0;
  var programmeDepth = 0;
  var error = null;
  parser.onopentag = function (node) {
    depth++;
    if (node.name === 'programme') { current = { channel: String(node.attributes.channel || '').toLowerCase(), startsAt: date(node.attributes.start), endsAt: date(node.attributes.stop), title: '', description: '', category: '' }; programmeDepth = depth; }
    else if (current && depth === programmeDepth + 1) field = node.name === 'title' ? 'title' : node.name === 'desc' ? 'description' : node.name === 'category' ? 'category' : null;
  };
  function text(value) { if (current && field) current[field] = (current[field] + value).slice(0, field === 'title' ? 500 : 4000); }
  parser.ontext = text; parser.oncdata = text;
  parser.onclosetag = function (name) {
    if (current && name === 'programme' && depth === programmeDepth) {
      if (current.channel && current.startsAt && current.endsAt && current.title && current.endsAt > current.startsAt && current.endsAt.getTime() > currentTime) {
        var programmes = index.get(current.channel) || [];
        programmes.push({ title: current.title, description: current.description || null, category: current.category || null, startsAt: current.startsAt.toISOString(), endsAt: current.endsAt.toISOString() });
        programmes.sort(function (a, b) { return Date.parse(a.startsAt) - Date.parse(b.startsAt); });
        if (programmes.length > 8) programmes.length = 8;
        index.set(current.channel, programmes);
      }
      current = null;
    }
    if (depth === programmeDepth + 1) field = null;
    depth--;
  };
  parser.onerror = function () { error = new Error('INVALID_XMLTV'); };
  return { write: function (value) { parser.write(value); if (error) throw error; }, finish: function () { parser.close(); if (error) throw error; return index; } };
}
module.exports = { createIndex: createIndex, date: date };
