'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createConnectedIntermediateEvent } = require('../../src/bpmn/processPatcher');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('cria evento intermediário normal e fluxo conectado com ids globais consecutivos', () => {
  const before = parseProcess(fixture);
  const nextNumber = [...before.elements, ...before.flows]
    .filter((item) => item.tag !== 'BpmnProcess')
    .reduce((maximum, item) => Math.max(maximum, Number(String(item.id).match(/(\d+)$/)?.[1] || 0)), 0) + 1;
  const stylesBefore = before.diagram.children.filter((node) => node.localName === 'styles').length;
  const result = createConnectedIntermediateEvent(fixture, {
    sourceId: 'task53',
    x: 920,
    y: 640,
    bendpoints: [{ x: 850, y: 250 }, { x: 850, y: 657 }]
  });
  const intermediateEvent = result.model.elements.find((item) => item.id === result.eventId);
  const flow = result.model.flows.find((item) => item.id === result.flowId);
  const source = result.model.elements.find((item) => item.id === 'task53');
  const shape = result.model.shapeById.get(result.eventId);
  const connection = result.model.connections.find((item) => item.businessObject === result.flowId);
  const stylesAfter = result.model.diagram.children.filter((node) => node.localName === 'styles').length;

  assert.equal(result.eventId, `intermediateevent${nextNumber}`);
  assert.equal(result.flowId, `flow${nextNumber + 1}`);
  assert.equal(intermediateEvent.tag, 'BpmnIntermediateEvent');
  assert.equal(intermediateEvent.type, '30');
  assert.equal(intermediateEvent.name, 'Intermediário');
  assert.equal(intermediateEvent.attributes.sequenceAttached, '0');
  assert.equal(intermediateEvent.attributes.signalId, '0');
  assert.equal(intermediateEvent.attributes.incoming, result.flowId);
  assert.ok(source.attributes.outgoing.split(/\s+/).includes(result.flowId));
  assert.equal(flow.attributes.sourceRef, 'task53');
  assert.equal(flow.attributes.targetRef, result.eventId);
  assert.deepEqual({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, {
    x: 920, y: 640, width: 35, height: 35
  });
  assert.deepEqual(connection.bendpoints, [{ x: 850, y: 250 }, { x: 850, y: 657 }]);
  assert.equal(result.model.shapes.at(-1).businessObject, result.eventId);
  assert.equal(result.model.connections.at(-1).businessObject, result.flowId);
  assert.equal(stylesAfter, stylesBefore);
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
});

test('recusa evento intermediário ligado a elemento que não pode originar fluxo', () => {
  assert.throws(
    () => createConnectedIntermediateEvent(fixture, { sourceId: 'endevent12', x: 500, y: 500 }),
    /origem executável/
  );
});
