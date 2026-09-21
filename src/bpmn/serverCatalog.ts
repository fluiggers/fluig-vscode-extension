'use strict';

const path = require('node:path');
const { projectRootForProcessPath } = require('./nodeReferenceScanner');

function extractServerCatalog(jsonText) {
  const configurations = extractServerConfigurations(jsonText);
  const output = [];
  const seen = new Set();
  for (const configuration of configurations) {
    const name = String(configuration?.name ?? '').trim();
    const explicitId = String(configuration?.serverId ?? configuration?.code ?? '').trim();
    const value = explicitId || name.toLocaleLowerCase('pt-BR');
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const host = String(configuration?.host ?? '').trim();
    output.push({ value, label: host ? `${name || value} (${host})` : (name || value) });
  }
  return output;
}

function extractServerConfigurations(jsonText) {
  try {
    const parsed = JSON.parse(String(jsonText ?? ''));
    return Array.isArray(parsed?.configurations) ? parsed.configurations : [];
  } catch {
    return [];
  }
}

function serverCatalogValue(configuration) {
  const name = String(configuration?.name ?? '').trim();
  const explicitId = String(configuration?.serverId ?? configuration?.code ?? '').trim();
  return explicitId || name.toLocaleLowerCase('pt-BR');
}

function matchesServer(configuration, requestedValue) {
  const requested = String(requestedValue ?? '').trim().toLocaleLowerCase('pt-BR');
  if (!requested) return false;
  return [
    serverCatalogValue(configuration),
    configuration?.id,
    configuration?.serverId,
    configuration?.code,
    configuration?.name
  ].some((value) => String(value ?? '').trim().toLocaleLowerCase('pt-BR') === requested);
}

function configuredServerPath(vscode, processUri, projectRoot) {
  try {
    const configured = String(vscode.workspace.getConfiguration('fluiggers', processUri).get('serverConfigPath', '') ?? '').trim();
    if (!configured) return '';
    const expanded = configured.replace(/\$\{workspaceFolder\}/g, projectRoot);
    return path.isAbsolute(expanded) ? expanded : path.resolve(projectRoot, expanded);
  } catch {
    return '';
  }
}

async function readServerConfiguration(vscode, processUri) {
  if (processUri.scheme !== 'file') return { configurations: [], source: '' };
  const projectRoot = projectRootForProcessPath(processUri.fsPath);
  if (!projectRoot) return { configurations: [], source: '' };
  const customPath = configuredServerPath(vscode, processUri, projectRoot);
  const candidates = customPath
    ? [customPath]
    : ['servers.json', 'server.json'].map((fileName) => path.join(projectRoot, '.vscode', fileName));
  for (const filePath of candidates) {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      const configurations = extractServerConfigurations(new TextDecoder('utf-8').decode(bytes));
      return { configurations, source: filePath };
    } catch {
      // Tenta o nome alternativo sem expor dados ou erros do arquivo de conexao.
    }
  }
  return { configurations: [], source: '' };
}

async function discoverServerCatalog(vscode, processUri) {
  const { configurations } = await readServerConfiguration(vscode, processUri);
  return extractServerCatalog(JSON.stringify({ configurations }));
}

async function resolveServerConfiguration(vscode, processUri, requestedValue) {
  const { configurations } = await readServerConfiguration(vscode, processUri);
  return configurations.find((configuration) => matchesServer(configuration, requestedValue)) ?? null;
}

module.exports = {
  discoverServerCatalog,
  extractServerCatalog,
  extractServerConfigurations,
  matchesServer,
  resolveServerConfiguration,
  serverCatalogValue
};
