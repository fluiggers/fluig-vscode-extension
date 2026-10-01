'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const {
  createConnectedEndEvent,
  deleteIsolatedEvent,
  deleteSequenceFlow
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

function createdIsolatedEndEvent() {
  const created = createConnectedEndEvent(fixture, {
    sourceId: 'intermediateevent63',
    x: 1180,
    y: 1070,
    bendpoints: []
  });
  const disconnected = deleteSequenceFlow(created.text, created.flowId);
  return { text: disconnected.text, eventId: created.eventId };
}

test('exclui o último evento isolado sem alterar fluxos', () => {
  const isolated = createdIsolatedEndEvent();
  const before = parseProcess(isolated.text);
  const result = deleteIsolatedEvent(isolated.text, isolated.eventId);

  assert.equal(result.removedChildIndex, directNodes(before, 'children').length - 1);
  assert.equal(result.model.elements.length, before.elements.length - 1);
  assert.equal(result.model.shapes.length, before.shapes.length - 1);
  assert.equal(result.model.flows.length, before.flows.length);
  assert.equal(result.model.connections.length, before.connections.length);
  assert.equal(result.model.elements.some((item) => item.id === isolated.eventId), false);
  assert.equal(result.model.shapes.some((item) => item.businessObject === isolated.eventId), false);
  assert.equal(result.text.includes(isolated.eventId), false);
  assert.equal(result.validation.ok, true);
  assert.equal(validateProcess(result.model).ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(result.model.fingerprint.encoding, 'ASCII');
  assert.equal(result.model.fingerprint.version, before.fingerprint.version);
});

test('exclui evento intermediário e recalcula toda a cascata children.N', () => {
  const before = parseProcess(fixture);
  const stylesBefore = serializedNodes(fixture, directNodes(before, 'styles'));
  const colorsBefore = serializedNodes(fixture, directNodes(before, 'colors'));
  const fontsBefore = serializedNodes(fixture, directNodes(before, 'fonts'));
  const result = deleteIsolatedEvent(fixture, 'intermediateevent22');
  const shiftedShape = result.model.shapeById.get('intermediatetimer23');
  const shiftedIndex = directNodes(result.model, 'children').indexOf(shiftedShape.node);
  const removedIndex = directNodes(before, 'children').indexOf(before.shapeById.get('intermediateevent22').node);

  assert.equal(result.removedChildIndex, removedIndex);
  assert.equal(shiftedIndex, removedIndex);
  assert.ok(shiftedShape.node.children.some((node) => (
    node.localName === 'anchors'
      && node.attributeMap.referencedGraphicsAlgorithm?.value.startsWith(`/0/@children.${removedIndex}/`)
  )));
  const obsoleteLastRef = `/0/@children.${directNodes(before, 'children').length - 1}/@link`;
  assert.equal(result.model.diagram.attributeMap.pictogramLinks.value.includes(obsoleteLastRef), false);
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
  assert.equal(result.validation.ok, true);
});

test('exclui eventos especiais isolados preservando fluxos e estrutura', () => {
  for (const eventId of [
    'startsignal13', 'startmultiple14', 'starttimer15', 'startconditional16',
    'endcancel18', 'endsignal19', 'endmultiple20', 'endterminate21',
    'intermediatetimer23', 'intermediateconditional24', 'intermediatesignal25',
    'intermediatemultiple27', 'intermediatesignalreceive28'
  ]) {
    const before = parseProcess(fixture);
    const result = deleteIsolatedEvent(fixture, eventId);
    assert.equal(result.model.elements.some((item) => item.id === eventId), false, eventId);
    assert.equal(result.model.shapes.some((item) => item.businessObject === eventId), false, eventId);
    assert.equal(result.model.flows.length, before.flows.length, eventId);
    assert.equal(result.model.connections.length, before.connections.length, eventId);
    assert.equal(result.validation.ok, true, eventId);
  }
});

test('exclui evento conectado e seu fluxo incidente na mesma operação', () => {
  const before = parseProcess(fixture);
  const result = deleteIsolatedEvent(fixture, 'intermediateevent63');
  assert.deepEqual(result.removedFlowIds, ['flow64']);
  assert.equal(result.model.elements.some((item) => item.id === 'intermediateevent63'), false);
  assert.equal(result.model.shapes.some((item) => item.businessObject === 'intermediateevent63'), false);
  assert.equal(result.model.flows.some((item) => item.id === 'flow64'), false);
  assert.equal(result.model.connections.some((item) => item.businessObject === 'flow64'), false);
  assert.equal(result.model.flows.length, before.flows.length - 1);
  assert.equal(result.model.connections.length, before.connections.length - 1);
  assert.equal(result.validation.ok, true);
});

test('exclui evento inicial conectado e limpa a entrada da atividade destino', () => {
  const before = parseProcess(fixture);
  const result = deleteIsolatedEvent(fixture, 'startevent4');
  const destination = result.model.elements.find((item) => item.id === 'task5');

  assert.deepEqual(result.removedFlowIds, ['flow46']);
  assert.equal(result.model.elements.some((item) => item.id === 'startevent4'), false);
  assert.equal(result.model.flows.some((item) => item.id === 'flow46'), false);
  assert.equal(result.model.connections.some((item) => item.businessObject === 'flow46'), false);
  assert.equal(destination.attributes.incoming, undefined);
  assert.equal(result.model.flows.length, before.flows.length - 1);
  assert.equal(result.model.connections.length, before.connections.length - 1);
  assert.equal(result.validation.ok, true);
});

test('exclui evento intermediário com entrada e saída e remapeia duas conexões', () => {
  const before = parseProcess(fixture);
  const stylesBefore = serializedNodes(fixture, directNodes(before, 'styles'));
  const result = deleteIsolatedEvent(fixture, 'intermediateevent61');
  const source = result.model.elements.find((item) => item.id === 'exclusivegateway59');
  const destination = result.model.elements.find((item) => item.id === 'intermediateevent63');

  assert.deepEqual(result.removedFlowIds, ['flow62', 'flow64']);
  assert.equal(result.removedConnectionIndices.length, 2);
  assert.equal(result.model.elements.some((item) => item.id === 'intermediateevent61'), false);
  assert.equal(result.model.flows.some((item) => ['flow62', 'flow64'].includes(item.id)), false);
  assert.equal(result.model.connections.some((item) => ['flow62', 'flow64'].includes(item.businessObject)), false);
  assert.equal(source.attributes.outgoing, undefined);
  assert.equal(destination.attributes.incoming, undefined);
  assert.equal(result.model.flows.length, before.flows.length - 2);
  assert.equal(result.model.connections.length, before.connections.length - 2);
  assert.deepEqual(serializedNodes(result.text, directNodes(result.model, 'styles')), stylesBefore);
  walk(result.model.xml, (node) => {
    for (const attribute of node.attributes) {
      for (const match of attribute.value.matchAll(/\/0\/@connections\.(\d+)/g)) {
        assert.ok(Number(match[1]) < result.model.connections.length, `${attribute.name}: ${match[0]}`);
      }
    }
  });
  assert.equal(result.validation.ok, true);
});

test('recusa ramo condicionado, erro anexado, link vinculado, referência externa, id ausente e arquivo inválido', () => {
  assert.throws(() => deleteIsolatedEvent(fixture, 'endevent12'), /possui uma condição/);
  assert.throws(() => deleteIsolatedEvent(fixture, 'intermediateerror45'), /Somente eventos de início/);
  assert.throws(() => deleteIsolatedEvent(fixture, 'intermediatelink26'), /vínculo de envio de link/);
  assert.throws(() => deleteIsolatedEvent(fixture, 'intermediatelinkreceive29'), /ainda é referenciado/);
  assert.throws(() => deleteIsolatedEvent(fixture, 'evento999'), /não encontrado ou duplicado/);

  const isolated = createdIsolatedEndEvent();
  const referenced = isolated.text.replace(
    '<bpmn2:BpmnProcess ',
    `<bpmn2:BpmnProcess instruction="${isolated.eventId}" `
  );
  assert.throws(() => deleteIsolatedEvent(referenced, isolated.eventId), /ainda é referenciado/);

  const broken = isolated.text.replace('outgoing="flow64"', 'outgoing=""');
  assert.throws(() => deleteIsolatedEvent(broken, isolated.eventId), /erro\(s\) estrutural\(is\) antes da exclusão/);
});
