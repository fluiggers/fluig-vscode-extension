'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { parseProcess } = require('../processModel');
const { validateProcess } = require('../processValidator');
const { toWebviewData } = require('../webviewData');
const { EditorCatalogs } = require('../editorCatalogs');
const { RemoteFormCatalogService } = require('../remoteFormCatalog');
const { readCatalogSnapshot, withSnapshot } = require('../catalogSnapshot');
const { projectRootForProcessPath } = require('../nodeReferenceScanner');
const { createNodeHost, readFluiggersSettings } = require('./nodeHost');

/**
 * Um arquivo .process aberto pela CLI. A CLI nunca fala com o servidor Fluig: lê do projeto o que o
 * editor também lê do disco e, do cache que o editor grava, o que ele buscou no servidor.
 * @param {string} processPath
 */
async function openSession(processPath) {
  const filePath = path.resolve(processPath);
  if (path.extname(filePath).toLowerCase() !== '.process') {
    throw new Error(`Informe um arquivo .process: ${processPath}`);
  }
  const text = await fs.promises.readFile(filePath, 'utf8');
  const projectRoot = projectRootForProcessPath(filePath) ?? path.dirname(filePath);
  const host = createNodeHost({ workspaceRoot: projectRoot, settings: readFluiggersSettings(projectRoot) });
  return {
    filePath,
    host,
    uri: host.Uri.file(filePath),
    text,
    originalText: text,
    localCatalogs: new EditorCatalogs(host, new RemoteFormCatalogService(serverUnavailable)),
    warnings: []
  };
}

function serverUnavailable() {
  return Promise.reject(new Error('A CLI não consulta o servidor Fluig.'));
}

/** As opções de catálogo que `toWebviewData` e os patchers recebem no editor. */
async function loadCatalogs(session, model) {
  const local = await session.localCatalogs.all(session.uri, model);
  const snapshot = readCatalogSnapshot(session.filePath);
  const serverId = String(model.process?.attributes?.serverId ?? '');
  const warn = (message) => {
    if (!session.warnings.some((warning) => warning.message === message)) session.warnings.push({ catalog: 'server', message });
  };
  if (!snapshot) {
    warn('Sem cache de catálogos do servidor (usuários, papéis, grupos, mecanismos). Abra este processo no editor visual do VS Code uma vez para gravá-lo.');
    return local;
  }
  if (snapshot.serverId !== serverId) {
    warn(`O cache de catálogos é do servidor "${snapshot.serverId}", e o processo agora usa "${serverId}". Reabra o processo no editor visual para atualizá-lo.`);
    return local;
  }
  return withSnapshot(local, snapshot);
}

/** O modelo que o webview recebe: elementos, definições de cada painel, catálogos e validação. */
async function editorData(session) {
  const model = parseProcess(session.text);
  const validation = validateProcess(model);
  const catalogs = await loadCatalogs(session, model);
  return {
    model,
    validation,
    catalogs,
    catalogsSavedAt: readCatalogSnapshot(session.filePath)?.savedAt,
    data: toWebviewData(model, validation, catalogs)
  };
}

let creationTemplate;

/** Catálogo visual empacotado de onde saem os shapes dos elementos novos. */
function creationTemplateText() {
  if (creationTemplate) return creationTemplate;
  const relativeCandidates = [
    ['runtime', 'bpmn', 'creation-template.process.gz.b64'],
    ['test', 'bpmn', 'fixtures', 'toexportbpmnteste.process.gz.b64']
  ];
  for (let directory = __dirname, depth = 0; depth < 5; directory = path.dirname(directory), depth += 1) {
    for (const segments of relativeCandidates) {
      try {
        const encoded = fs.readFileSync(path.join(directory, ...segments), 'ascii').replace(/\s+/g, '');
        if (encoded) {
          creationTemplate = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
          return creationTemplate;
        }
      } catch {
        // Tenta a proxima localizacao (runtime empacotado ou arvore de desenvolvimento).
      }
    }
  }
  throw new Error('O catálogo visual interno para criação de elementos não foi encontrado.');
}

module.exports = { creationTemplateText, editorData, loadCatalogs, openSession };
