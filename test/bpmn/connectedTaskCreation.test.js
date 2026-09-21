'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createConnectedTask } = require('../../src/bpmn/processPatcher');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('cria atividade posicionável e fluxo conectado com ids globais consecutivos', () => {
  const before = parseProcess(fixture);
  const nextNumber = [...before.elements, ...before.flows]
    .filter((item) => item.tag !== 'BpmnProcess')
    .reduce((maximum, item) => Math.max(maximum, Number(String(item.id).match(/(\d+)$/)?.[1] || 0)), 0) + 1;
  const stylesBefore = before.diagram.children.filter((node) => node.localName === 'styles').length;
  const result = createConnectedTask(fixture, {
    sourceId: 'task5',
    x: 880,
    y: 560,
    bendpoints: [{ x: 810, y: 180 }, { x: 810, y: 587 }]
  });
  const task = result.model.elements.find((item) => item.id === result.taskId);
  const flow = result.model.flows.find((item) => item.id === result.flowId);
  const source = result.model.elements.find((item) => item.id === 'task5');
  const shape = result.model.shapeById.get(result.taskId);
  const connection = result.model.connections.find((item) => item.businessObject === result.flowId);
  const stylesAfter = result.model.diagram.children.filter((node) => node.localName === 'styles').length;

  assert.equal(result.taskId, `task${nextNumber}`);
  assert.equal(result.flowId, `flow${nextNumber + 1}`);
  assert.equal(task.type, '80');
  assert.equal(task.name, 'Atividade');
  assert.equal(task.attributes.incoming, result.flowId);
  assert.ok(source.attributes.outgoing.split(/\s+/).includes(result.flowId));
  assert.equal(flow.attributes.sourceRef, 'task5');
  assert.equal(flow.attributes.targetRef, result.taskId);
  assert.deepEqual({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, {
    x: 880, y: 560, width: 106, height: 56
  });
  assert.deepEqual(connection.bendpoints, [{ x: 810, y: 180 }, { x: 810, y: 587 }]);
  assert.equal(result.model.shapes.at(-1).businessObject, result.taskId);
  assert.equal(result.model.connections.at(-1).businessObject, result.flowId);
  assert.equal(stylesAfter, stylesBefore);
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
});

test('recusa criação ligada a elemento que não pode originar fluxo', () => {
  assert.throws(
    () => createConnectedTask(fixture, { sourceId: 'endevent12', x: 500, y: 500 }),
    /origem executável/
  );
});
