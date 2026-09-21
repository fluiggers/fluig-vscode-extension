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

module.exports = { findLikelyNodeReferences, projectRootForProcessPath };
