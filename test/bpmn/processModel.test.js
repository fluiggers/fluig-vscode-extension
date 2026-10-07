'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');

const fixturePath = path.join(
  __dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'
);

test('carrega o processo real do Fluig Studio', () => {
  const text = fs.readFileSync(fixturePath, 'ascii');
  const model = parseProcess(text);
  assert.equal(model.supported, true);
  assert.equal(model.format, 'studio-xmi');
  assert.equal(model.fingerprint.version, '0.13.0');
  assert.equal(model.fingerprint.encoding, 'ASCII');
  assert.equal(model.fingerprint.lineEnding, 'CRLF');
  assert.ok(model.counts.BpmnTask >= 10);
  assert.ok(model.counts.BpmnGateway >= 6);
  assert.ok(model.counts.BpmnIntermediateEvent >= 11);
  assert.equal(model.flows.length, 11);
  assert.ok(model.canvas.width >= 1000);
  assert.ok(model.canvas.height >= 800);
  assert.ok(model.shapes.length >= 38);
  assert.equal(model.shapeById.get('task5').width, 106);
  const poolShape = model.shapeById.get('pool1');
  const nestedLaneShape = model.shapeById.get('swimlane3');
  const standaloneLaneShape = model.shapeById.get('swimlane43');
  assert.deepEqual(
    pickShape(nestedLaneShape),
    {
      x: poolShape.x + 30,
      y: poolShape.y,
      localX: 30,
      localY: 0,
      parentBusinessObject: 'pool1',
      depth: 1
    }
  );
  assert.deepEqual(
    pickShape(standaloneLaneShape),
    {
      x: standaloneLaneShape.localX,
      y: standaloneLaneShape.localY,
      localX: standaloneLaneShape.localX,
      localY: standaloneLaneShape.localY,
      parentBusinessObject: '',
      depth: 0
    }
  );
  assert.equal(model.elements.find((element) => element.id === 'starttimer15').typeLabel, 'Início temporizador');
  assert.equal(model.elements.find((element) => element.id === 'startsignal13').typeLabel, 'Início por sinal');
  assert.equal(model.elements.find((element) => element.id === 'startconditional16').typeLabel, 'Início condicional');
});

function pickShape(shape) {
  return {
    x: shape.x,
    y: shape.y,
    localX: shape.localX,
    localY: shape.localY,
    parentBusinessObject: shape.parentBusinessObject,
    depth: shape.depth
  };
}

test('distingue export da plataforma de XMI Studio', () => {
  const model = parseProcess('<list><ProcessDefinition/></list>');
  assert.equal(model.supported, false);
  assert.equal(model.format, 'platform-export');
});
