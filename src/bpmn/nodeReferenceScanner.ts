'use strict';

const path = require('node:path');

const ACTIVITY_CONTEXT = '(?:WKNumState|WKCurrentState|nextSequenceId|numState|nextState|sequenceId|atividade|destino|origem)';

function projectRootForProcessPath(filePath) {
  const diagrams = path.dirname(path.resolve(String(filePath ?? '')));
  const workflow = path.dirname(diagrams);
  if (path.basename(diagrams).toLowerCase() !== 'diagrams' || path.basename(workflow).toLowerCase() !== 'workflow') {
    return null;
  }
  return path.dirname(workflow);
}

/**
 * Arquivos que podem citar estados do processo: os scripts dele (<processo>.*.js) e os eventos
 * do formulário vinculado pelo cardIndex ("1234", "1234 - nome" ou "nome"). Sem cardIndex
 * nenhum formulário roda no processo; cardIndex sem pasta correspondente mantém todos.
 */
function referenceScanFilter(processId, cardIndex, formFolders) {
  const index = String(cardIndex ?? '').trim();
  const id = index.match(/^(\d+)(?: - |$)/)?.[1];
  const name = index.replace(/^\d+ - /, '');
  const linked = formFolders.filter((folder) => folder.replace(/^\d+ - /, '') === name
    || (id && folder.startsWith(`${id} - `)));
  const forms = new Set(!index ? [] : linked.length ? linked : formFolders);
  return (relativePath) => {
    const parts = String(relativePath).split(/[\\/]/);
    return parts[0] === 'workflow' ? parts[parts.length - 1].startsWith(`${processId}.`) : forms.has(parts[1]);
  };
}

function findLikelyNodeReferences(text, elementId, activityCode) {
  const id = String(elementId ?? '');
  const code = String(activityCode ?? '');
  if (!id) return [];
  const escapedId = escapeRegExp(id);
  const idPattern = new RegExp(`(^|[^A-Za-z0-9_.-])${escapedId}(?=$|[^A-Za-z0-9_.-])`);
  const codePattern = /^\d+$/.test(code) ? escapeRegExp(code) : '';
  const forwardPattern = codePattern
    ? new RegExp(`\\b${ACTIVITY_CONTEXT}\\b[^\\r\\n]{0,100}\\b${codePattern}\\b`, 'i')
    : null;
  const reversePattern = codePattern
    ? new RegExp(`\\b${codePattern}\\b[^\\r\\n]{0,60}\\b${ACTIVITY_CONTEXT}\\b`, 'i')
    : null;
  const casePattern = codePattern ? new RegExp(`\\bcase\\s+${codePattern}\\s*:`, 'i') : null;
  const findings = [];
  String(text ?? '').split(/\r?\n/).forEach((line, index) => {
    const kinds = [];
    if (idPattern.test(line)) kinds.push('id');
    if (forwardPattern?.test(line) || reversePattern?.test(line) || casePattern?.test(line)) kinds.push('WKNumState');
    for (const kind of kinds) {
      findings.push({ kind, line: index + 1, excerpt: line.trim().slice(0, 180) });
    }
  });
  return findings;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { findLikelyNodeReferences, projectRootForProcessPath, referenceScanFilter };
