'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createPool, createSwimLane, patchLayout } = require('../../src/bpmn/processPatcher');
const { constrainedInsideDelta, snappedResizeSize } = require('../../media/bpmn/dragGeometry');

const fixture = fs.readFileSync(path.join(
  __dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'
), 'ascii');

test('move pool, raia aninhada e atividade sem duplicar o delta local', () => {
  const model = parseProcess(fixture);
  const pool = model.shapeById.get('pool1');
  const lane = model.shapeById.get('swimlane3');
  const task = model.shapeById.get('manualtask32');
  const result = patchLayout(fixture, {
    moves: [
      { id: 'pool1', x: pool.x + 40, y: pool.y + 20 },
      { id: 'swimlane3', x: lane.x + 40, y: lane.y + 20 },
      { id: 'manualtask32', x: task.x + 40, y: task.y + 20 }
    ]
  });
  const movedPool = result.model.shapeById.get('pool1');
  const movedLane = result.model.shapeById.get('swimlane3');
  const movedTask = result.model.shapeById.get('manualtask32');
  assert.deepEqual({ x: movedPool.x, y: movedPool.y }, { x: pool.x + 40, y: pool.y + 20 });
  assert.deepEqual({ x: movedLane.x, y: movedLane.y }, { x: lane.x + 40, y: lane.y + 20 });
  assert.deepEqual({ localX: movedLane.localX, localY: movedLane.localY }, { localX: 30, localY: 0 });
  assert.deepEqual({ x: movedTask.x, y: movedTask.y }, { x: task.x + 40, y: task.y + 20 });
  assert.equal(result.validation.ok, true);
});

test('recusa movimento parcial que deixaria conteudo da pool para tras', () => {
  assert.throws(() => patchLayout(fixture, {
    moves: [{ id: 'pool1', x: 50, y: 30 }]
  }), /deve incluir swimlane3/);
});

test('redimensiona pool de uma raia preservando cabecalho e conteudo', () => {
  const result = patchLayout(fixture, {
    resizes: [{ id: 'pool1', width: 271, height: 310 }]
  });
  const pool = result.model.shapeById.get('pool1');
  const lane = result.model.shapeById.get('swimlane3');
  assert.deepEqual({ width: pool.width, height: pool.height }, { width: 271, height: 310 });
  assert.deepEqual({ width: lane.width, height: lane.height }, { width: 241, height: 310 });
  assert.deepEqual({ localX: lane.localX, localY: lane.localY }, { localX: 30, localY: 0 });
  assert.equal(result.validation.ok, true);
  const repeated = patchLayout(result.text, {
    resizes: [{ id: 'pool1', width: 271, height: 310 }]
  });
  assert.equal(repeated.changed, false);
});

test('sincroniza altura dos rotulos verticais da pool e da raia', () => {
  const result = patchLayout(fixture, {
    resizes: [{ id: 'pool1', width: 271, height: 310 }]
  });
  const poolLabel = directTextGraphics(result.model.shapeById.get('pool1'));
  const laneLabel = directTextGraphics(result.model.shapeById.get('swimlane3'));
  assert.equal(Number(poolLabel?.attributeMap.height?.value), 310);
  assert.equal(Number(laneLabel?.attributeMap.height?.value), 310);
});

test('redimensiona pool distribuindo todas as raias com exatamente a mesma altura', () => {
  const poolResult = createPool(fixture, { x: 570, y: 940 });
  const firstResult = createSwimLane(poolResult.text, { poolId: poolResult.elementId });
  const secondResult = createSwimLane(firstResult.text, { poolId: poolResult.elementId });
  const thirdResult = createSwimLane(secondResult.text, { poolId: poolResult.elementId });
  const result = patchLayout(thirdResult.text, {
    resizes: [{ id: poolResult.elementId, width: 500, height: 350 }]
  });
  const pool = result.model.shapeById.get(poolResult.elementId);
  const lanes = result.model.shapes
    .filter((shape) => shape.parentBusinessObject === poolResult.elementId)
    .sort((left, right) => left.localY - right.localY);

  assert.deepEqual({ width: pool.width, height: pool.height }, { width: 500, height: 351 });
  assert.deepEqual(lanes.map((lane) => ({
    y: lane.localY,
    width: lane.width,
    height: lane.height
  })), [
    { y: 0, width: 470, height: 117 },
    { y: 117, width: 470, height: 117 },
    { y: 234, width: 470, height: 117 }
  ]);
  assert.equal(result.validation.ok, true);
});

test('redimensiona raia independente e recusa encolhimento sobre conteudo', () => {
  const resized = patchLayout(fixture, {
    resizes: [{ id: 'swimlane43', width: 340, height: 180 }]
  });
  assert.deepEqual(
    { width: resized.model.shapeById.get('swimlane43').width, height: resized.model.shapeById.get('swimlane43').height },
    { width: 340, height: 180 }
  );
  assert.throws(() => patchLayout(fixture, {
    resizes: [{ id: 'pool1', width: 150, height: 100 }]
  }), /exige no minimo/);
});

test('limita raia aninhada a area util da pool', () => {
  const pool = { left: 10, top: 10, right: 241, bottom: 300 };
  const fullLane = { left: 40, top: 10, right: 241, bottom: 300 };
  assert.deepEqual(constrainedInsideDelta({ x: 80, y: 60 }, fullLane, pool, { left: 30 }), { x: 0, y: 0 });
  const smallerLane = { left: 40, top: 10, right: 180, bottom: 200 };
  assert.deepEqual(constrainedInsideDelta({ x: 90, y: 120 }, smallerLane, pool, { left: 30 }), { x: 61, y: 100 });
});

test('calcula resize com grid e tamanho minimo', () => {
  assert.deepEqual(snappedResizeSize({
    startSize: { width: 231, height: 290 },
    startPoint: { x: 100, y: 100 },
    currentPoint: { x: 143, y: 116 },
    minimum: { width: 166, height: 100 },
    grid: 10
  }), { width: 270, height: 310 });
  assert.deepEqual(snappedResizeSize({
    startSize: { width: 231, height: 290 },
    startPoint: { x: 100, y: 100 },
    currentPoint: { x: -500, y: -500 },
    minimum: { width: 166, height: 100 },
    grid: 10
  }), { width: 166, height: 100 });
});

function directTextGraphics(shape) {
  return shape.node.children
    .filter((node) => node.localName === 'children')
    .map((node) => node.children.find((child) => child.localName === 'graphicsAlgorithm'))
    .find((node) => ['al:Text', 'al:MultiText'].includes(node?.attributeMap['xsi:type']?.value));
}
