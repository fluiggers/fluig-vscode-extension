'use strict';

const { discoverStringArrayCatalog, extractStringArrayCatalog } = require('./cacheStringCatalog');

function extractExpedientCatalog(cacheText) {
  return extractStringArrayCatalog(cacheText, 'expediente');
}

function discoverExpedientCatalog(vscode, processUri) {
  return discoverStringArrayCatalog(vscode, processUri, 'expediente');
}

module.exports = { discoverExpedientCatalog, extractExpedientCatalog };
