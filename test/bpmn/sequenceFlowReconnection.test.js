'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { attr, parseProcess } = require('../../src/bpmn/processModel');
const { reconnectSequenceFlow } = require('../../src/bpmn/processPatcher');
const { validateProcess } = require('../../src/bpmn/processValidator');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function refs(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

function anchor(model, elementId) {
  return model.shapeById.get(elementId).node.children.find((node) => node.localName === 'anchors');
}

test('reconecta destino preservando o fluxo e atualizando a tripla e o Graphiti', () => {
  const before = parseProcess(fixture);
  const beforeFlowCount = before.flows.length;
  const result = reconnectSequenceFlow(fixture, {
    flowId: 'flow47',
    endpoint: 'target',
    newElementId: 'manualtask52',
    bendpoints: [{ x: 700, y: 210 }, { x: 700, y: 390 }]
  });
  const model = result.model;
  const flow = model.flows.find((item) => item.id === 'flow47');
  const connection = model.connections.find((item) => item.businessObject === 'flow47');
  const connectionIndex = model.connections.indexOf(connection);
  const shapeIndex = model.diagram.children.filter((node) => node.localName === 'children')
    .indexOf(model.shapeById.get('manualtask52').node);
  const connectionRef = `/0/@connections.${connectionIndex}`;

  assert.equal(model.flows.length, beforeFlowCount);
  assert.equal(flow.attributes.sourceRef, 'task5');
  assert.equal(flow.attributes.targetRef, 'manualtask52');
  assert.ok(!refs(model.elements.find((item) => item.id === 'exclusivegateway39').attributes.incoming).includes('flow47'));
  assert.ok(refs(model.elements.find((item) => item.id === 'manualtask52').attributes.incoming).includes('flow47'));
  assert.equal(attr(connection.node, 'end'), `/0/@children.${shapeIndex}/@anchors.0`);
  assert.ok(!refs(attr(anchor(model, 'exclusivegateway39'), 'incomingConnections')).includes(connectionRef));
  assert.ok(refs(attr(anchor(model, 'manualtask52'), 'incomingConnections')).includes(connectionRef));
  assert.deepEqual(connection.bendpoints, [{ x: 700, y: 210 }, { x: 700, y: 390 }]);
  assert.equal(validateProcess(model).ok, true);
});

test('reconecta origem preservando ids e atualizando outgoing e start', () => {
  const result = reconnectSequenceFlow(fixture, {
    flowId: 'flow47',
    endpoint: 'source',
    newElementId: 'servicetask11'
  });
  const model = result.model;
  const flow = model.flows.find((item) => item.id === 'flow47');
  const connection = model.connections.find((item) => item.businessObject === 'flow47');
  const connectionIndex = model.connections.indexOf(connection);
  const shapeIndex = model.diagram.children.filter((node) => node.localName === 'children')
    .indexOf(model.shapeById.get('servicetask11').node);
  const connectionRef = `/0/@connections.${connectionIndex}`;

  assert.equal(flow.attributes.sourceRef, 'servicetask11');
  assert.equal(flow.attributes.targetRef, 'exclusivegateway39');
  assert.ok(!refs(model.elements.find((item) => item.id === 'task5').attributes.outgoing).includes('flow47'));
  assert.ok(refs(model.elements.find((item) => item.id === 'servicetask11').attributes.outgoing).includes('flow47'));
  assert.equal(attr(connection.node, 'start'), `/0/@children.${shapeIndex}/@anchors.0`);
  assert.ok(!refs(attr(anchor(model, 'task5'), 'outgoingConnections')).includes(connectionRef));
  assert.ok(refs(attr(anchor(model, 'servicetask11'), 'outgoingConnections')).includes(connectionRef));
  assert.equal(result.validation.ok, true);
});

test('ao mudar destino de ramo condicionado atualiza targetTask da condição', () => {
  const result = reconnectSequenceFlow(fixture, {
    flowId: 'flow48', endpoint: 'target', newElementId: 'manualtask52'
  });
  const gateway = result.model.elements.find((item) => item.id === 'exclusivegateway39');
  assert.match(gateway.attributes.condition, /<targetTask>manualtask52<\/targetTask>/);
  assert.doesNotMatch(gateway.attributes.condition, /<targetTask>endevent12<\/targetTask>/);
  assert.equal(result.validation.ok, true);
});

test('recusa autoenlace, duplicidade e troca de origem com semântica de gateway', () => {
  assert.throws(
    () => reconnectSequenceFlow(fixture, { flowId: 'flow47', endpoint: 'target', newElementId: 'task5' }),
    /ele mesmo/
  );
  assert.throws(
    () => reconnectSequenceFlow(fixture, { flowId: 'flow47', endpoint: 'target', newElementId: 'startevent4' }),
    /não pode receber/
  );
  assert.throws(
    () => reconnectSequenceFlow(fixture, { flowId: 'flow48', endpoint: 'source', newElementId: 'task5' }),
    /condição associada/
  );
  assert.throws(
    () => reconnectSequenceFlow(fixture, { flowId: 'flow49', endpoint: 'source', newElementId: 'task5' }),
    /ramo padrão/
  );
  assert.throws(
    () => reconnectSequenceFlow(fixture, { flowId: 'flow47', endpoint: 'target', newElementId: 'exclusivegateway39' }),
    /diferente do atual/
  );
});
