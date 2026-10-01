'use strict';

const path = require('node:path');
const { decodeXml } = require('./xmlTokenizer');

/**
 * Lê a entrada "mecanismo" gravada pelo Fluig Studio no future.ws.cache.
 * Cada item é um par [descrição exibida, código persistido no .process].
 */
function extractMechanismCatalog(cacheText) {
  const text = String(cacheText ?? '');
  const marker = '<string>mecanismo</string>';
  const start = text.indexOf(marker);
  if (start < 0) return [];
  const nextEntry = text.indexOf('<void method="put">', start + marker.length);
  const block = text.slice(start + marker.length, nextEntry < 0 ? text.length : nextEntry);
  const pairs = [];
  const seen = new Set();
  const pairPattern = /<array class="java\.lang\.Object" length="2">([\s\S]*?)<\/array>/g;
  for (const match of block.matchAll(pairPattern)) {
    const values = [...match[1].matchAll(/<string>([\s\S]*?)<\/string>/g)]
      .map((item) => decodeXml(item[1]).trim());
    const label = values[0] ?? '';
    const value = values[1] ?? '';
    if (!label || !value || seen.has(value)) continue;
    seen.add(value);
    pairs.push({ label, value });
  }
  return pairs;
}

async function discoverMechanismCatalog(vscode, processUri) {
  if (processUri.scheme !== 'file') return [];
  const projectRoot = path.resolve(path.dirname(processUri.fsPath), '..', '..');
  const cacheUri = vscode.Uri.file(path.join(projectRoot, 'workflow', '.resources', 'future.ws.cache'));
  try {
    const bytes = await vscode.workspace.fs.readFile(cacheUri);
    return extractMechanismCatalog(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return [];
  }
}

module.exports = { discoverMechanismCatalog, extractMechanismCatalog };
