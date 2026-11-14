'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../processModel');
const { triggerScriptConditionFileName } = require('../eventTrigger');
const { findLikelyNodeReferences, projectRootForProcessPath, referenceScanFilter } = require('../nodeReferenceScanner');

const REFERENCE_SENSITIVE_TAGS = new Set([
  'BpmnTask', 'BpmnSubProcess', 'BpmnGateway',
  'BpmnStartEvent', 'BpmnEndEvent', 'BpmnIntermediateEvent'
]);

/**
 * Scripts do processo e eventos do formulário vinculado que citam um nó, como o editor verifica
 * antes de excluir: o código/WKNumState some junto com o elemento.
 */
async function findProjectNodeReferences(processPath, text, elementId, activityCode) {
  const projectRoot = requireProjectRoot(processPath);
  const processId = path.basename(processPath, path.extname(processPath));
  const cardIndex = parseProcess(text).process?.attributes?.cardIndex;
  const formFolders = (await listDirectory(path.join(projectRoot, 'forms')))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const relevant = referenceScanFilter(processId, cardIndex, formFolders);
  const files = [
    ...await javascriptFiles(path.join(projectRoot, 'workflow', 'scripts')),
    ...(await javascriptFiles(path.join(projectRoot, 'forms')))
      .filter((file) => path.relative(projectRoot, file).split(path.sep).includes('events'))
  ].filter((file) => relevant(path.relative(projectRoot, file)));
  const findings = [];
  for (const file of files) {
    const relativePath = path.relative(projectRoot, file).split(path.sep).join('/');
    if (path.basename(file).split('.').includes(elementId)) {
      findings.push({ kind: 'fileName', line: 1, excerpt: path.basename(file), file, relativePath });
    }
    let content;
    try {
      content = await fs.promises.readFile(file, 'utf8');
    } catch (error) {
      throw new Error(`Não foi possível verificar referências em ${file}: ${error.message}`);
    }
    for (const finding of findLikelyNodeReferences(content, elementId, activityCode)) {
      findings.push({ ...finding, file, relativePath });
    }
  }
  return findings;
}

/** Scripts que pertencem aos elementos (tarefa ou evento condicional) e saem junto com eles. */
async function linkedScripts(processPath, text, elementIds) {
  const requested = new Set(elementIds);
  const scripts = new Map();
  for (const element of parseProcess(text).elements.filter((item) => requested.has(item.id))) {
    const conditional = (element.tag === 'BpmnStartEvent' && element.type === '13')
      || (element.tag === 'BpmnIntermediateEvent' && element.type === '35');
    let fileName = '';
    if (element.tag === 'BpmnTask') fileName = String(element.attributes.scriptFileName ?? '').trim();
    else if (conditional) fileName = triggerScriptConditionFileName(element.attributes.trigger);
    if (!fileName) continue;
    const file = scriptPath(processPath, fileName, element.tag === 'BpmnTask' ? 'atividade' : 'evento');
    scripts.set(file, { file, exists: fs.existsSync(file) });
  }
  return [...scripts.values()];
}

function scriptPath(processPath, fileName, ownerLabel) {
  if (path.basename(fileName) !== fileName || !/^[\p{L}\p{N}._ -]+\.js$/iu.test(fileName)) {
    throw new Error(`Referência de script da ${ownerLabel} insegura: ${fileName}.`);
  }
  return path.join(requireProjectRoot(processPath), 'workflow', 'scripts', fileName);
}

function requireProjectRoot(processPath) {
  const projectRoot = projectRootForProcessPath(processPath);
  if (!projectRoot) throw new Error('Não foi possível localizar a raiz do projeto a partir de workflow/diagrams.');
  return projectRoot;
}

async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await listDirectory(directory)) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') files.push(...await javascriptFiles(entryPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

async function listDirectory(directory) {
  try {
    return await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

module.exports = { REFERENCE_SENSITIVE_TAGS, findProjectNodeReferences, linkedScripts, scriptPath };
