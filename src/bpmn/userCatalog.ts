'use strict';

const path = require('node:path');
const { decodeXml } = require('./xmlTokenizer');

function extractUserCatalog(cacheText) {
  const users = [];
  const seen = new Set();
  const blocks = String(cacheText ?? '').match(
    /<object class="com\.totvs\.tds\.ecm\.foundation\.ws\.ColleagueDtoLite">[\s\S]*?<\/object>/g
  ) ?? [];
  for (const block of blocks) {
    const id = propertyValue(block, 'colleagueId');
    const name = propertyValue(block, 'colleagueName');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    users.push({ value: id, label: name ? `${name} (${id})` : id });
  }
  return users;
}

function propertyValue(block, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`<void property="${escaped}">\\s*<string>([\\s\\S]*?)<\\/string>\\s*<\\/void>`));
  return decodeXml(match?.[1] ?? '').trim();
}

async function discoverUserCatalog(vscode, processUri) {
  if (processUri.scheme !== 'file') return [];
  const projectRoot = path.resolve(path.dirname(processUri.fsPath), '..', '..');
  const cacheUri = vscode.Uri.file(path.join(projectRoot, 'workflow', '.resources', 'future.ws.cache'));
  try {
    const bytes = await vscode.workspace.fs.readFile(cacheUri);
    return extractUserCatalog(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return [];
  }
}

module.exports = { discoverUserCatalog, extractUserCatalog };
