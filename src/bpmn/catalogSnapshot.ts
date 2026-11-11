'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { projectRootForProcessPath } = require('./nodeReferenceScanner');

// Catálogos que vêm do servidor Fluig. Os demais (formulários locais, servidores) são lidos do projeto.
const SERVER_CATALOGS = Object.freeze([
  'formFields', 'mechanismCatalog', 'userCatalog', 'roleCatalog', 'groupCatalog',
  'processCatalog', 'expedientCatalog', 'volumeCatalog'
]);

/**
 * Onde o editor guarda os catálogos de um processo para a CLI `fluig-bpmn`, que não consulta o
 * servidor nem lê a senha dele. Fora de workflow/diagrams não há projeto, então não há cache.
 */
function snapshotPath(processPath) {
  const projectRoot = projectRootForProcessPath(processPath);
  if (!projectRoot) return null;
  return path.join(projectRoot, '.fluig-bpmn', 'catalogs', `${path.basename(processPath, path.extname(processPath))}.json`);
}

function readCatalogSnapshot(processPath) {
  const file = snapshotPath(processPath);
  if (!file) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed.catalogs === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Grava os catálogos que o editor acabou de montar. Um catálogo que voltou vazio (servidor fora do
 * ar, busca ainda não feita no painel) mantém o último valor conhecido do mesmo servidor.
 * @returns {boolean} se o arquivo mudou
 */
function writeCatalogSnapshot(processPath, serverId, catalogs, now = new Date()) {
  const file = snapshotPath(processPath);
  if (!file) return false;
  const previous = readCatalogSnapshot(processPath);
  const known = previous?.serverId === serverId ? previous.catalogs : {};
  const merged = {};
  for (const key of SERVER_CATALOGS) {
    merged[key] = catalogs[key]?.length ? catalogs[key] : (known[key] ?? []);
  }
  merged.subProcessFormFieldCatalogs = { ...known.subProcessFormFieldCatalogs };
  for (const [elementId, catalog] of Object.entries(catalogs.subProcessFormFieldCatalogs ?? {})) {
    if (catalog.supported || !merged.subProcessFormFieldCatalogs[elementId]) {
      merged.subProcessFormFieldCatalogs[elementId] = catalog;
    }
  }
  if (previous?.serverId === serverId && JSON.stringify(previous.catalogs) === JSON.stringify(merged)) return false;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A lista de usuários do servidor não deve ir para o repositório do projeto.
  fs.writeFileSync(path.join(path.dirname(file), '.gitignore'), '*\n');
  fs.writeFileSync(file, `${JSON.stringify({ savedAt: now.toISOString(), serverId, catalogs: merged })}\n`);
  return true;
}

/** Catálogos lidos do projeto, completados pelo que o editor guardou do servidor. */
function withSnapshot(localCatalogs, snapshot) {
  if (!snapshot) return localCatalogs;
  const merged = { ...localCatalogs };
  for (const key of SERVER_CATALOGS) {
    if (!merged[key]?.length && snapshot.catalogs[key]?.length) merged[key] = snapshot.catalogs[key];
  }
  merged.subProcessFormFieldCatalogs = {
    ...localCatalogs.subProcessFormFieldCatalogs,
    ...snapshot.catalogs.subProcessFormFieldCatalogs
  };
  return merged;
}

module.exports = { readCatalogSnapshot, snapshotPath, withSnapshot, writeCatalogSnapshot };
