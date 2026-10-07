'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createSequenceFlow, deleteIsolatedArtifact } = require('../../src/bpmn/processPatcher');
const { validateProcess } = require('../../src/bpmn/processValidator');
const { walk } = require('../../src/bpmn/xmlTokenizer');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function directNodes(model, localName) {
  return model.diagram.children.filter((node) => node.localName === localName);
}

function serializedNodes(text, nodes) {
  return nodes.map((node) => text.slice(node.start, node.closeEnd));
}

function connectedArtifactFixture() {
  return createSequenceFlow(fixture, {
    sourceId: 'annotationtask7',
    targetId: 'mailtask31',
    bendpoints: [{ x: 640, y: 410 }]
  });
}

test('exclui os quatro artefatos isolados sem alterar fluxos ou recursos externos', () => {
  const cases = [
    ['annotationtask7', 'BpmnAnnotation', ''],
    ['databasetask37', 'BpmnDatabase', ''],
    ['documenttask38', 'BpmnDocument', '100'],
    ['grupo50', 'BpmnGroup', '']
  ];

  for (const [id, tag, documentId] of cases) {
    const before = parseProcess(fixture);
    const result = deleteIsolatedArtifact(fixture, id);
    assert.equal(result.elementTag, tag);
    assert.equal(result.documentId, documentId);
    assert.equal(result.model.elements.length, before.elements.length - 1);
    assert.equal(result.model.shapes.length, before.shapes.length - 1);
    assert.equal(result.model.flows.length, before.flows.length);
    assert.equal(result.model.connections.length, before.connections.length);
    assert.equal(result.model.elements.some((item) => item.id === id), false);
    assert.equal(result.model.shapes.some((item) => item.businessObject === id), false);
    assert.equal(result.text.includes(id), false);
    assert.equal(result.validation.ok, true);
    assert.equal(validateProcess(result.model).ok, true);
    assert.equal(result.model.fingerprint.encoding, 'ASCII');
    assert.equal(result.model.fingerprint.lineEnding, 'CRLF');
    assert.equal(result.model.fingerprint.version, before.fingerprint.version);
  }
});

test('exclui grupo inicial e recalcula children.N preservando elementos e paletas', () => {
  const before = parseProcess(fixture);
  const positionsBefore = new Map(before.shapes.map((shape) => [
    shape.businessObject,
    { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
  ]));
  const stylesBefore = serializedNodes(fixture, directNodes(before, 'styles'));
  const colorsBefore = serializedNodes(fixture, directNodes(before, 'colors'));
  const fontsBefore = serializedNodes(fixture, directNodes(before, 'fonts'));
  const result = deleteIsolatedArtifact(fixture, 'grupo50');

  const removedIndex = directNodes(before, 'children').indexOf(before.shapeById.get('grupo50').node);

  assert.equal(result.removedChildIndex, removedIndex);
  for (const shape of result.model.shapes) {
    assert.deepEqual(
      { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
      positionsBefore.get(shape.businessObject),
      shape.businessObject
    );
  }
  walk(result.model.xml, (node) => {
    for (const attribute of node.attributes) {
      for (const match of attribute.value.matchAll(/\/0\/@children\.(\d+)/g)) {
        assert.ok(Number(match[1]) < directNodes(result.model, 'children').length, `${attribute.name}: ${match[0]}`);
      }
    }
  });
  assert.deepEqual(serializedNodes(result.text, directNodes(result.model, 'styles')), stylesBefore);
  assert.deepEqual(serializedNodes(result.text, directNodes(result.model, 'colors')), colorsBefore);
  assert.deepEqual(serializedNodes(result.text, directNodes(result.model, 'fonts')), fontsBefore);
  assert.equal(result.model.elements.some((item) => item.id === 'task53'), true);
  assert.equal(result.model.flows.length, before.flows.length);
  assert.equal(result.model.connections.length, before.connections.length);
  assert.equal(result.validation.ok, true);
});

test('exclui artefato conectado e sua associação visual', () => {
  const connected = connectedArtifactFixture();
  const result = deleteIsolatedArtifact(connected.text, 'annotationtask7');
  assert.deepEqual(result.removedFlowIds, [connected.flowId]);
  assert.equal(result.model.elements.some((item) => item.id === 'annotationtask7'), false);
  assert.equal(result.model.flows.some((item) => item.id === connected.flowId), false);
  assert.equal(result.validation.ok, true);
});

test('recusa artefato referenciado, tipo inválido e arquivo inválido', () => {
  assert.throws(() => deleteIsolatedArtifact(fixture, 'task5'), /somente anotações, databases, documentos e grupos/);
  assert.throws(() => deleteIsolatedArtifact(fixture, 'annotationtask999'), /não encontrado ou duplicado/);

  const referenced = fixture.replace(
    '<bpmn2:BpmnProcess ',
    '<bpmn2:BpmnProcess instruction="process.annotationtask7.js" '
  );
  assert.throws(() => deleteIsolatedArtifact(referenced, 'annotationtask7'), /ainda é referenciado/);

  const broken = fixture.replace('outgoing="flow64"', 'outgoing=""');
  assert.throws(() => deleteIsolatedArtifact(broken, 'grupo50'), /erro\(s\) estrutural\(is\) antes da exclusão/);
});
