var xmlNodes = require('xml-nodes');
var xmlObjects = require('xml-objects');
var pumpify = require('pumpify');

module.exports = function(nodeFilter) {
  var nodes = xmlNodes(nodeFilter);
  var objects = xmlObjects({ explicitRoot: false, explicitArray: false, mergeAttrs: true });
  return pumpify.obj(nodes, objects)
};
