'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createSequenceFlow, deleteIsolatedSubProcess } = require('../../src/bpmn/processPatcher');
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

function connectedSubProcessFixture() {
  return fixture
    .replaceAll('task5', 'subprocess5')
    .replace('<bpmn2:BpmnTask id="subprocess5"', '<bpmn2:BpmnSubProcess id="subprocess5"')
    .replace('id="subprocess5" name="Atividade de teste eclipse" incoming="flow46" outgoing="flow47" type="80"',
      'id="subprocess5" name="Subprocesso conectado" incoming="flow46" outgoing="flow47" type="100"');
}

test('exclui subprocessos comuns e ad-hoc isolados sem alterar fluxos ou processo filho', () => {
  const cases = [
    ['subprocess35', '100', 'DadosDoCandidato'],
    ['adhocsubprocess36', '101', '']
  ];

  for (const [id, type, childProcessId] of cases) {
    const before = parseProcess(fixture);
    const result = deleteIsolatedSubProcess(fixture, id);
    assert.equal(result.elementTag, 'BpmnSubProcess');
    assert.equal(result.elementType, type);
    assert.equal(result.childProcessId, childProcessId);
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

test('exclui subprocesso intermediário e recalcula toda a cascata children.N', () => {
  const before = parseProcess(fixture);
  const stylesBefore = serializedNodes(fixture, directNodes(before, 'styles'));
  const colorsBefore = serializedNodes(fixture, directNodes(before, 'colors'));
  const fontsBefore = serializedNodes(fixture, directNodes(before, 'fonts'));
  const result = deleteIsolatedSubProcess(fixture, 'subprocess35');
  const shiftedShape = result.model.shapeById.get('adhocsubprocess36');
  const shiftedIndex = directNodes(result.model, 'children').indexOf(shiftedShape.node);
  const removedIndex = directNodes(before, 'children').indexOf(before.shapeById.get('subprocess35').node);

  assert.equal(result.removedChildIndex, removedIndex);
  assert.equal(shiftedIndex, removedIndex);
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
  assert.equal(result.model.flows.length, before.flows.length);
  assert.equal(result.model.connections.length, before.connections.length);
  assert.equal(result.validation.ok, true);
});

test('exclui subprocesso conectado e seus fluxos sem alterar o processo filho', () => {
  const first = createSequenceFlow(fixture, { sourceId: 'startsignal13', targetId: 'adhocsubprocess36' });
  const second = createSequenceFlow(first.text, { sourceId: 'adhocsubprocess36', targetId: 'intermediateevent70' });
  const before = parseProcess(second.text);
  const result = deleteIsolatedSubProcess(second.text, 'adhocsubprocess36');

  assert.equal(result.childProcessId, '');
  assert.deepEqual(new Set(result.removedFlowIds), new Set([first.flowId, second.flowId]));
  assert.equal(result.model.elements.length, before.elements.length - 1);
  assert.equal(result.model.shapes.length, before.shapes.length - 1);
  assert.equal(result.model.flows.length, before.flows.length - 2);
  assert.equal(result.model.connections.length, before.connections.length - 2);
  assert.equal(result.model.elements.some((item) => item.id === 'adhocsubprocess36'), false);
  assert.equal(result.validation.ok, true);
  assert.equal(result.model.fingerprint.encoding, 'ASCII');
  assert.equal(result.model.fingerprint.lineEnding, 'CRLF');
});

test('recusa subprocesso condicionado, com evento, referência externa, tipo inválido e arquivo inválido', () => {
  assert.throws(() => deleteIsolatedSubProcess(connectedSubProcessFixture(), 'subprocess5'), /condição que aponta|referenciado por BpmnGateway\.condition/);

  const attached = fixture.replace(
    '<bpmn2:BpmnSubProcess id="subprocess35"',
    '<bpmn2:BpmnSubProcess id="subprocess35" attachedEvents="intermediateerror45"'
  );
  assert.throws(() => deleteIsolatedSubProcess(attached, 'subprocess35'), /possui evento anexado/);
  assert.throws(() => deleteIsolatedSubProcess(fixture, 'task5'), /somente subprocessos comuns e ad-hoc/);
  assert.throws(() => deleteIsolatedSubProcess(fixture, 'subprocess999'), /não encontrado ou duplicado/);

  const referenced = fixture.replace(
    '<bpmn2:BpmnProcess ',
    '<bpmn2:BpmnProcess instruction="process.subprocess35.js" '
  );
  assert.throws(() => deleteIsolatedSubProcess(referenced, 'subprocess35'), /ainda é referenciado/);

  const broken = fixture.replace('sourceRef="task5"', 'sourceRef="missingtask999"');
  assert.notEqual(broken, fixture);
  assert.throws(() => deleteIsolatedSubProcess(broken, 'subprocess35'), /erro\(s\) estrutural\(is\) antes da exclusão/);
});
