'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TYPE_LABELS, attr } = require('../processModel');
const { projectRootForProcessPath } = require('../nodeReferenceScanner');

/**
 * Invariantes que o editor garante por construção e o validador estrutural não confere. Um .process
 * editado à mão pode quebrá-las e ainda passar em `validateProcess`.
 * @param {string} text
 * @param {ReturnType<import('../processModel').parseProcess>} model
 * @param {string} processPath
 */
function lintProcess(text, model, processPath) {
  const findings = [];
  if (!model.supported || !model.diagram) return findings;
  const add = (severity, code, message, elementId = '') => findings.push({ severity, code, message, elementId });

  if (String(model.fingerprint.encoding).toUpperCase() === 'ASCII') {
    const index = text.search(/[^\x00-\x7F]/);
    if (index >= 0) {
      const line = text.slice(0, index).split('\n').length;
      add('error', 'ASCII-001', `Caractere não ASCII na linha ${line}: o arquivo declara ASCII e exige entidades como &#xE7;.`);
    }
  }

  const shapeNodes = model.diagram.children.filter((node) => node.localName === 'children');
  const connectionNodes = model.diagram.children.filter((node) => node.localName === 'connections');
  const diagramText = text.slice(model.diagram.start, model.diagram.closeEnd);
  const outOfRange = new Set();
  for (const [reference, kind, index] of diagramText.matchAll(/\/0\/@(children|connections)\.(\d+)/g)) {
    const limit = kind === 'children' ? shapeNodes.length : connectionNodes.length;
    if (Number(index) >= limit) outOfRange.add(reference);
  }
  for (const reference of outOfRange) {
    add('error', 'REF-001', `Referência posicional ${reference} aponta para fora do diagrama.`);
  }

  const businessIds = new Set([...model.elements, ...model.flows].map((element) => element.id));
  const pictogramLinks = new Set(String(attr(model.diagram, 'pictogramLinks')).trim().split(/\s+/).filter(Boolean));
  for (const shape of model.shapes) {
    if (!businessIds.has(shape.businessObject)) {
      add('error', 'LINK-004', `Shape visual aponta para o elemento inexistente ${shape.businessObject}.`, shape.businessObject);
    }
    const linkPath = `${visualPath(model.diagram, shape.node)}/@link`;
    if (!pictogramLinks.has(linkPath)) {
      add('warning', 'LINK-005', `pictogramLinks não contém ${linkPath}, o link do shape de ${shape.businessObject}.`, shape.businessObject);
    }
  }

  for (const element of [...model.elements, ...model.flows]) {
    if (element.tag !== 'BpmnProcess' && !/\d+$/.test(element.id)) {
      add('warning', 'IDS-003', `${element.id} não termina em número: a exportação para o Fluig deriva o código do elemento desse número.`, element.id);
    }
    const knownTypes = TYPE_LABELS[element.tag];
    if (knownTypes && !Object.hasOwn(knownTypes, element.type)) {
      add('warning', 'TYPE-001', `${element.id} usa o tipo ${element.type || '(vazio)'}, desconhecido para ${element.tag}.`, element.id);
    }
  }

  const projectRoot = projectRootForProcessPath(processPath);
  if (projectRoot) {
    for (const element of model.elements) {
      const fileName = String(element.attributes.scriptFileName ?? '').trim();
      if (fileName && !fs.existsSync(path.join(projectRoot, 'workflow', 'scripts', path.basename(fileName)))) {
        add('warning', 'SCRIPT-001', `${element.id} referencia workflow/scripts/${fileName}, que não existe.`, element.id);
      }
    }
  }
  return findings;
}

/** Caminho EMF de um shape (`/0/@children.2/@children.0`), como o Graphiti o grava em pictogramLinks. */
function visualPath(diagram, shapeNode) {
  const segments = [];
  const visit = (parent) => {
    const children = parent.children.filter((node) => node.localName === 'children');
    for (const [index, child] of children.entries()) {
      segments.push(`@children.${index}`);
      if (child === shapeNode || visit(child)) return true;
      segments.pop();
    }
    return false;
  };
  return visit(diagram) ? `/0/${segments.join('/')}` : '';
}

module.exports = { lintProcess };
