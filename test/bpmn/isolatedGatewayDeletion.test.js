'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const {
  createConnectedGateway,
  createSequenceFlow,
  deleteIsolatedGateway
} = require('../../src/bpmn/processPatcher');
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

function references(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

test('exclui gateways isolados dos quatro tipos sem alterar fluxos', () => {
  const cases = [
    { text: fixture, id: 'inclusivegateway40', type: '121' },
    { text: fixture, id: 'parallelgateway41', type: '126' },
    { text: fixture, id: 'joingateway42', type: '127' },
    { text: fixture, id: 'exclusivegateway69', type: '120' }
  ];

  for (const entry of cases) {
    const before = parseProcess(entry.text);
    const result = deleteIsolatedGateway(entry.text, entry.id);
    assert.equal(result.elementTag, 'BpmnGateway');
    assert.equal(result.elementType, entry.type);
    assert.equal(result.model.elements.length, before.elements.length - 1);
    assert.equal(result.model.shapes.length, before.shapes.length - 1);
    assert.equal(result.model.flows.length, before.flows.length);
    assert.equal(result.model.connections.length, before.connections.length);
    assert.equal(result.model.elements.some((item) => item.id === entry.id), false);
    assert.equal(result.model.shapes.some((item) => item.businessObject === entry.id), false);
    assert.equal(result.text.includes(entry.id), false);
    assert.equal(result.validation.ok, true);
    assert.equal(validateProcess(result.model).ok, true);
    assert.equal(result.model.fingerprint.encoding, 'ASCII');
    assert.equal(result.model.fingerprint.lineEnding, 'CRLF');
    assert.equal(result.model.fingerprint.version, before.fingerprint.version);
  }
});

test('exclui gateway intermediário e recalcula toda a cascata children.N', () => {
  const before = parseProcess(fixture);
  const stylesBefore = serializedNodes(fixture, directNodes(before, 'styles'));
  const colorsBefore = serializedNodes(fixture, directNodes(before, 'colors'));
  const fontsBefore = serializedNodes(fixture, directNodes(before, 'fonts'));
  const result = deleteIsolatedGateway(fixture, 'inclusivegateway40');
  const shiftedShape = result.model.shapeById.get('parallelgateway41');
  const shiftedIndex = directNodes(result.model, 'children').indexOf(shiftedShape.node);
  const removedIndex = directNodes(before, 'children').indexOf(before.shapeById.get('inclusivegateway40').node);

  assert.equal(result.removedChildIndex, removedIndex);
  assert.equal(shiftedIndex, removedIndex);
  assert.ok(shiftedShape.node.children.some((node) => (
    node.localName === 'anchors'
      && node.attributeMap.referencedGraphicsAlgorithm?.value.startsWith(`/0/@children.${removedIndex}/`)
  )));
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
  assert.equal(result.validation.ok, true);
});

test('exclui gateway conectado e remove atomicamente os fluxos de entrada e saída', () => {
  const createdGateway = createConnectedGateway(fixture, {
    sourceId: 'task53',
    x: 880,
    y: 600
  });
  const connected = createSequenceFlow(createdGateway.text, {
    sourceId: createdGateway.gatewayId,
    targetId: 'intermediateevent61'
  });
  const before = connected.model;
  const outgoingFlowId = connected.flowId;
  const expectedSourceOutgoing = references(before.elements.find((item) => item.id === 'task53').attributes.outgoing)
    .filter((id) => id !== createdGateway.flowId);
  const expectedTargetIncoming = references(before.elements.find((item) => item.id === 'intermediateevent61').attributes.incoming)
    .filter((id) => id !== outgoingFlowId);
  const result = deleteIsolatedGateway(connected.text, createdGateway.gatewayId);

  assert.deepEqual(new Set(result.removedFlowIds), new Set([createdGateway.flowId, outgoingFlowId]));
  assert.equal(result.model.elements.length, before.elements.length - 1);
  assert.equal(result.model.shapes.length, before.shapes.length - 1);
  assert.equal(result.model.flows.length, before.flows.length - 2);
  assert.equal(result.model.connections.length, before.connections.length - 2);
  assert.equal(result.model.elements.some((item) => item.id === createdGateway.gatewayId), false);
  assert.equal(result.model.elements.some((item) => result.removedFlowIds.includes(item.id)), false);
  assert.equal(result.model.shapeById.has(createdGateway.gatewayId), false);
  assert.equal(result.model.connections.some((item) => result.removedFlowIds.includes(item.businessObject)), false);
  assert.deepEqual(references(result.model.elements.find((item) => item.id === 'task53').attributes.outgoing), expectedSourceOutgoing);
  assert.deepEqual(references(result.model.elements.find((item) => item.id === 'intermediateevent61').attributes.incoming), expectedTargetIncoming);
  assert.equal(result.validation.ok, true);
  assert.equal(validateProcess(result.model).ok, true);
  assert.equal(result.model.fingerprint.encoding, 'ASCII');
  assert.equal(result.model.fingerprint.lineEnding, 'CRLF');
});

test('recusa gateway condicionado, ramo padrão, condição não canônica, referência externa, tipo inválido e arquivo inválido', () => {
  assert.throws(() => deleteIsolatedGateway(fixture, 'exclusivegateway39'), /condição ou configuração não vazia/);
  assert.throws(() => deleteIsolatedGateway(fixture, 'intermediateevent22'), /somente gateways exclusivos/);
  assert.throws(() => deleteIsolatedGateway(fixture, 'gateway999'), /não encontrado ou duplicado/);

  const createdGateway = createConnectedGateway(fixture, { sourceId: 'task53', x: 880, y: 600 });
  const connected = createSequenceFlow(createdGateway.text, {
    sourceId: createdGateway.gatewayId,
    targetId: 'intermediateevent61'
  });
  const defaultFlowText = connected.text.replace(
    new RegExp(`(<bpmn2:SequenceFlow id="${connected.flowId}"[^>]*)(/>)`),
    '$1 defaultLink="true"$2'
  );
  assert.notEqual(defaultFlowText, connected.text);
  assert.throws(() => deleteIsolatedGateway(defaultFlowText, createdGateway.gatewayId), /ramo padrão/);

  const nonCanonicalCondition = fixture.replace(
    '<bpmn2:BpmnGateway id="inclusivegateway40" name="Inclusivo" type="121" condition="&lt;list/>"/>',
    '<bpmn2:BpmnGateway id="inclusivegateway40" name="Inclusivo" type="121" condition="&lt;list>&lt;/list>"/>'
  );
  assert.notEqual(nonCanonicalCondition, fixture);
  assert.throws(() => deleteIsolatedGateway(nonCanonicalCondition, 'inclusivegateway40'), /condição ou configuração não vazia/);

  const referenced = fixture.replace(
    '<bpmn2:BpmnProcess ',
    '<bpmn2:BpmnProcess instruction="inclusivegateway40" '
  );
  assert.throws(() => deleteIsolatedGateway(referenced, 'inclusivegateway40'), /ainda é referenciado/);

  const broken = fixture.replace('sourceRef="task5"', 'sourceRef="missingtask999"');
  assert.notEqual(broken, fixture);
  assert.throws(() => deleteIsolatedGateway(broken, 'inclusivegateway40'), /erro\(s\) estrutural\(is\) antes da exclusão/);
});
