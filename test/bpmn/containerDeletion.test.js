'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createPool,
  createSwimLane,
  deleteDiagramContainer,
  deleteDiagramElements
} = require('../../src/bpmn/processPatcher');
const { parseProcess } = require('../../src/bpmn/processModel');

const fixture = fs.readFileSync(path.join(
  __dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'
), 'ascii');
const fixtureModel = parseProcess(fixture);

test('exclui raia independente sem alterar atividades ou fluxos', () => {
  const result = deleteDiagramContainer(fixture, 'swimlane43');
  assert.equal(result.model.elements.some((item) => item.id === 'swimlane43'), false);
  assert.equal(result.model.shapes.some((item) => item.businessObject === 'swimlane43'), false);
  assert.ok(result.model.elements.some((item) => item.id === 'manualtask32'));
  assert.equal(result.model.flows.length, fixtureModel.flows.length);
  assert.equal(result.model.connections.length, fixtureModel.connections.length);
  assert.equal(result.validation.ok, true);
});

test('exclui raia aninhada e reparte igualmente as raias restantes', () => {
  const pool = createPool(fixture, { x: 570, y: 940 });
  const first = createSwimLane(pool.text, { poolId: pool.elementId });
  const second = createSwimLane(first.text, { poolId: pool.elementId });
  const third = createSwimLane(second.text, { poolId: pool.elementId });
  const result = deleteDiagramContainer(third.text, second.elementId);
  const poolShape = result.model.shapeById.get(pool.elementId);
  const lanes = result.model.shapes
    .filter((shape) => shape.parentBusinessObject === pool.elementId)
    .sort((left, right) => left.localY - right.localY);

  assert.equal(lanes.length, 2);
  assert.equal(lanes[0].height, lanes[1].height);
  assert.deepEqual(lanes.map((lane) => lane.localY), [0, lanes[0].height]);
  assert.equal(poolShape.height, lanes[0].height * 2);
  assert.equal(result.validation.ok, true);
});

test('exclui pool e suas raias internas preservando o conteudo do processo', () => {
  const result = deleteDiagramContainer(fixture, 'pool65');
  assert.deepEqual(new Set(result.removedContainerIds), new Set(['pool65', 'swimlane66', 'swimlane67']));
  for (const id of result.removedContainerIds) {
    assert.equal(result.model.elements.some((item) => item.id === id), false);
    assert.equal(result.model.shapes.some((item) => item.businessObject === id), false);
  }
  assert.ok(result.model.elements.some((item) => item.id === 'manualtask32'));
  assert.equal(result.model.flows.length, fixtureModel.flows.length);
  assert.equal(result.validation.ok, true);
});

test('aceita pool e raia na exclusao multipla', () => {
  const result = deleteDiagramElements(fixture, ['pool65', 'swimlane43']);
  assert.equal(result.model.elements.some((item) => item.id === 'pool65'), false);
  assert.equal(result.model.elements.some((item) => item.id === 'swimlane43'), false);
  assert.equal(result.model.elements.some((item) => item.id === 'swimlane66'), false);
  assert.equal(result.model.elements.some((item) => item.id === 'swimlane67'), false);
  assert.equal(result.validation.ok, true);
});
