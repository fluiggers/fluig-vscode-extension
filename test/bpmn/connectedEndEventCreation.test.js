'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createConnectedEndEvent } = require('../../src/bpmn/processPatcher');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('cria evento final normal e fluxo conectado com ids globais consecutivos', () => {
  const before = parseProcess(fixture);
  const nextNumber = [...before.elements, ...before.flows]
    .filter((item) => item.tag !== 'BpmnProcess')
    .reduce((maximum, item) => Math.max(maximum, Number(String(item.id).match(/(\d+)$/)?.[1] || 0)), 0) + 1;
  const stylesBefore = before.diagram.children.filter((node) => node.localName === 'styles').length;
  const result = createConnectedEndEvent(fixture, {
    sourceId: 'intermediateevent63',
    x: 1040,
    y: 1070,
    bendpoints: [{ x: 940, y: 1087 }]
  });
  const endEvent = result.model.elements.find((item) => item.id === result.eventId);
  const flow = result.model.flows.find((item) => item.id === result.flowId);
  const source = result.model.elements.find((item) => item.id === 'intermediateevent63');
  const shape = result.model.shapeById.get(result.eventId);
  const connection = result.model.connections.find((item) => item.businessObject === result.flowId);
  const stylesAfter = result.model.diagram.children.filter((node) => node.localName === 'styles').length;

  assert.equal(result.eventId, `endevent${nextNumber}`);
  assert.equal(result.flowId, `flow${nextNumber + 1}`);
  assert.equal(endEvent.tag, 'BpmnEndEvent');
  assert.equal(endEvent.type, '60');
  assert.equal(endEvent.name, 'Fim');
  assert.equal(endEvent.attributes.signalId, '0');
  assert.equal(endEvent.attributes.incoming, result.flowId);
  assert.equal(endEvent.attributes.outgoing, undefined);
  assert.ok(source.attributes.outgoing.split(/\s+/).includes(result.flowId));
  assert.equal(flow.attributes.sourceRef, 'intermediateevent63');
  assert.equal(flow.attributes.targetRef, result.eventId);
  assert.deepEqual({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, {
    x: 1040, y: 1070, width: 35, height: 35
  });
  assert.deepEqual(connection.bendpoints, [{ x: 940, y: 1087 }]);
  assert.equal(result.model.shapes.at(-1).businessObject, result.eventId);
  assert.equal(result.model.connections.at(-1).businessObject, result.flowId);
  assert.equal(stylesAfter, stylesBefore);
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
});

test('recusa evento final ligado a elemento que não pode originar fluxo', () => {
  assert.throws(
    () => createConnectedEndEvent(fixture, { sourceId: 'endevent12', x: 500, y: 500 }),
    /origem executável/
  );
});
