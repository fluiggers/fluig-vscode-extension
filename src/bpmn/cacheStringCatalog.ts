'use strict';

const path = require('node:path');
const { decodeXml } = require('./xmlTokenizer');

function extractStringArrayCatalog(cacheText, key) {
  const catalogKey = String(key ?? '').trim();
  if (!catalogKey || /[<>]/.test(catalogKey)) return [];
  const text = String(cacheText ?? '');
  const marker = `<string>${catalogKey}</string>`;
  const start = text.indexOf(marker);
  if (start < 0) return [];
  const nextEntry = text.indexOf('<void method="put">', start + marker.length);
  const block = text.slice(start + marker.length, nextEntry < 0 ? text.length : nextEntry);
  const values = [];
  const seen = new Set();
  for (const match of block.matchAll(/<string>([\s\S]*?)<\/string>/g)) {
    const value = decodeXml(match[1]).trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push({ value, label: value });
  }
  return values;
}

async function discoverStringArrayCatalog(vscode, processUri, key) {
  if (processUri.scheme !== 'file') return [];
  const projectRoot = path.resolve(path.dirname(processUri.fsPath), '..', '..');
  const cacheUri = vscode.Uri.file(path.join(projectRoot, 'workflow', '.resources', 'future.ws.cache'));
  try {
    const bytes = await vscode.workspace.fs.readFile(cacheUri);
    return extractStringArrayCatalog(new TextDecoder('utf-8').decode(bytes), key);
  } catch {
    return [];
  }
}

module.exports = { discoverStringArrayCatalog, extractStringArrayCatalog };
