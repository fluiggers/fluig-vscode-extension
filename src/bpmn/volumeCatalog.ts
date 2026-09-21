'use strict';

const { discoverStringArrayCatalog, extractStringArrayCatalog } = require('./cacheStringCatalog');

function extractVolumeCatalog(cacheText) {
  return extractStringArrayCatalog(cacheText, 'volume');
}

function discoverVolumeCatalog(vscode, processUri) {
  return discoverStringArrayCatalog(vscode, processUri, 'volume');
}

module.exports = { discoverVolumeCatalog, extractVolumeCatalog };
