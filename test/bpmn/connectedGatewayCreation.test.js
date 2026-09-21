'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createConnectedGateway } = require('../../src/bpmn/processPatcher');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('cria gateway exclusivo posicionável e fluxo conectado com ids globais consecutivos', () => {
  const before = parseProcess(fixture);
  const nextNumber = [...before.elements, ...before.flows]
    .filter((item) => item.tag !== 'BpmnProcess')
    .reduce((maximum, item) => Math.max(maximum, Number(String(item.id).match(/(\d+)$/)?.[1] || 0)), 0) + 1;
  const stylesBefore = before.diagram.children.filter((node) => node.localName === 'styles').length;
  const result = createConnectedGateway(fixture, {
    sourceId: 'task53',
    x: 880,
    y: 600,
    bendpoints: [{ x: 810, y: 250 }, { x: 810, y: 630 }]
  });
  const gateway = result.model.elements.find((item) => item.id === result.gatewayId);
  const flow = result.model.flows.find((item) => item.id === result.flowId);
  const source = result.model.elements.find((item) => item.id === 'task53');
  const shape = result.model.shapeById.get(result.gatewayId);
  const connection = result.model.connections.find((item) => item.businessObject === result.flowId);
  const stylesAfter = result.model.diagram.children.filter((node) => node.localName === 'styles').length;

  assert.equal(result.gatewayId, `exclusivegateway${nextNumber}`);
  assert.equal(result.flowId, `flow${nextNumber + 1}`);
  assert.equal(gateway.type, '120');
  assert.equal(gateway.name, 'Exclusivo');
  assert.equal(gateway.attributes.condition, '<list/>');
  assert.equal(gateway.attributes.incoming, result.flowId);
  assert.ok(source.attributes.outgoing.split(/\s+/).includes(result.flowId));
  assert.equal(flow.attributes.sourceRef, 'task53');
  assert.equal(flow.attributes.targetRef, result.gatewayId);
  assert.deepEqual({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, {
    x: 880, y: 600, width: 60, height: 102
  });
  assert.deepEqual(connection.bendpoints, [{ x: 810, y: 250 }, { x: 810, y: 630 }]);
  assert.equal(result.model.shapes.at(-1).businessObject, result.gatewayId);
  assert.equal(result.model.connections.at(-1).businessObject, result.flowId);
  assert.equal(stylesAfter, stylesBefore);
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
});

test('recusa gateway ligado a elemento que não pode originar fluxo', () => {
  assert.throws(
    () => createConnectedGateway(fixture, { sourceId: 'endevent12', x: 500, y: 500 }),
    /origem executável/
  );
});
