'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createPool, createSwimLane } = require('../../src/bpmn/processPatcher');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function countDiagramNodes(model, localName) {
  return model.diagram.children.filter((node) => node.localName === localName).length;
}

function directShapeOrder(model) {
  return model.diagram.children
    .filter((node) => node.localName === 'children')
    .map((node) => node.children.find((child) => child.localName === 'link')?.attributeMap.businessObjects?.value ?? '');
}

function nextGlobalNumber(model) {
  return Math.max(...[...model.elements, ...model.flows]
    .filter((element) => element.tag !== 'BpmnProcess')
    .map((element) => Number(element.id.match(/(\d+)$/)?.[1] ?? 0))) + 1;
}

test('cria pool vazia no fundo e remapeia todos os fragment paths diretos', () => {
  const before = parseProcess(fixture);
  const beforeGeometry = new Map(before.shapes.map((shape) => [shape.businessObject, {
    x: shape.x, y: shape.y, width: shape.width, height: shape.height, parent: shape.parentBusinessObject
  }]));
  const result = createPool(fixture, { x: 570, y: 940 });
  const pool = result.model.elements.find((element) => element.id === result.elementId);
  const shape = result.model.shapeById.get(result.elementId);

  assert.equal(result.elementId, `pool${nextGlobalNumber(before)}`);
  assert.equal(pool.tag, 'BpmnPool');
  assert.equal(pool.attributes.cores, 'FFFFFF');
  assert.deepEqual({ x: shape.x, y: shape.y, width: shape.width, height: shape.height, parent: shape.parentBusinessObject }, {
    x: 570, y: 940, width: 430, height: 290, parent: ''
  });
  assert.equal(directShapeOrder(result.model)[0], result.elementId);
  assert.equal(countDiagramNodes(result.model, 'styles'), countDiagramNodes(before, 'styles') + 2);
  assert.equal(countDiagramNodes(result.model, 'colors'), countDiagramNodes(before, 'colors') + 1);
  assert.equal(result.model.flows.length, before.flows.length);
  assert.equal(result.model.connections.length, before.connections.length);
  for (const [id, geometry] of beforeGeometry) {
    const current = result.model.shapeById.get(id);
    assert.deepEqual({ x: current.x, y: current.y, width: current.width, height: current.height, parent: current.parentBusinessObject }, geometry, id);
  }
  assert.match(result.model.diagram.attributeMap.pictogramLinks.value, /\/0\/@children\.0\/@link$/);
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
});

test('primeira raia ocupa toda a área útil da pool e mantém bijeção visual', () => {
  const pool = createPool(fixture, { x: 570, y: 940 });
  const before = pool.model;
  const result = createSwimLane(pool.text, { poolId: pool.elementId });
  const lane = result.model.elements.find((element) => element.id === result.elementId);
  const shape = result.model.shapeById.get(result.elementId);

  assert.equal(result.elementId, `swimlane${Number(pool.elementId.match(/(\d+)$/)[1]) + 1}`);
  assert.equal(lane.attributes.cores, 'adc9ac');
  assert.deepEqual({ x: shape.x, y: shape.y, localX: shape.localX, localY: shape.localY, width: shape.width, height: shape.height, parent: shape.parentBusinessObject }, {
    x: 600, y: 940, localX: 30, localY: 0, width: 400, height: 290, parent: pool.elementId
  });
  assert.equal(countDiagramNodes(result.model, 'styles'), countDiagramNodes(before, 'styles') + 2);
  assert.equal(countDiagramNodes(result.model, 'colors'), countDiagramNodes(before, 'colors'));
  assert.equal(result.validation.ok, true);
});

test('raias adicionais dividem a altura igualmente e deixam o resto na faixa inferior', () => {
  const pool = createPool(fixture, { x: 570, y: 940 });
  const first = createSwimLane(pool.text, { poolId: pool.elementId });
  const second = createSwimLane(first.text, { poolId: pool.elementId });
  const third = createSwimLane(second.text, { poolId: pool.elementId });
  const lanes = third.model.shapes
    .filter((shape) => shape.parentBusinessObject === pool.elementId)
    .sort((left, right) => left.localY - right.localY);

  assert.deepEqual(lanes.map((shape) => ({ id: shape.businessObject, y: shape.localY, height: shape.height })), [
    { id: first.elementId, y: 0, height: 96 },
    { id: second.elementId, y: 96, height: 96 },
    { id: third.elementId, y: 192, height: 98 }
  ]);
  assert.equal(lanes.reduce((sum, shape) => sum + shape.height, 0), 290);
  assert.equal(third.validation.ok, true);
});

test('cria raia independente no fundo sem alterar fluxos existentes', () => {
  const before = parseProcess(fixture);
  const result = createSwimLane(fixture, { x: 1080, y: 940 });
  const shape = result.model.shapeById.get(result.elementId);

  assert.equal(result.elementId, `swimlane${nextGlobalNumber(before)}`);
  assert.deepEqual({ x: shape.x, y: shape.y, width: shape.width, height: shape.height, parent: shape.parentBusinessObject }, {
    x: 1080, y: 940, width: 301, height: 145, parent: ''
  });
  assert.equal(directShapeOrder(result.model)[0], result.elementId);
  assert.equal(result.model.flows.length, before.flows.length);
  assert.equal(result.model.connections.length, before.connections.length);
  assert.equal(result.validation.ok, true);
});

test('recusa raia interna quando o destino não é uma pool direta', () => {
  assert.throws(() => createSwimLane(fixture, { poolId: 'task5' }), /pool direta/);
});
