'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { attr, parseProcess } = require('../../src/bpmn/processModel');
const { createConnectedTask, createSequenceFlow, reconnectSequenceFlow } = require('../../src/bpmn/processPatcher');
const { validateProcess } = require('../../src/bpmn/processValidator');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

// Fluig Studio writes subprocess shapes with a BoxRelativeAnchor before the ChopboxAnchor,
// so connections reference `@anchors.1` instead of `@anchors.0`.
function withChopboxAtSecondAnchor(text, elementId) {
  const model = parseProcess(text);
  const shapes = model.diagram.children.filter((node) => node.localName === 'children');
  const shapeIndex = shapes.indexOf(model.shapeById.get(elementId).node);
  const block = new RegExp(`(<link businessObjects="${elementId}"/>\\s*)(<anchors xsi:type="pi:ChopboxAnchor")`);
  assert.match(text, block);
  return text
    .replace(block, '$1<anchors xsi:type="pi:BoxRelativeAnchor" visible="true" active="true" relativeWidth="1.0" relativeHeight="0.51"/>\n      $2')
    .split(`/0/@children.${shapeIndex}/@anchors.0"`).join(`/0/@children.${shapeIndex}/@anchors.1"`);
}

function shapeIndex(model, elementId) {
  return model.diagram.children.filter((node) => node.localName === 'children')
    .indexOf(model.shapeById.get(elementId).node);
}

test('aceita e edita shapes com ChopboxAnchor fora da primeira posição (layout do Fluig Studio)', () => {
  const studio = withChopboxAtSecondAnchor(fixture, 'task5');
  assert.equal(validateProcess(parseProcess(studio)).ok, true);

  const created = createSequenceFlow(studio, { sourceId: 'task5', targetId: 'manualtask52' });
  const newFlow = created.model.flows.find((flow) => flow.attributes.sourceRef === 'task5'
    && flow.attributes.targetRef === 'manualtask52');
  const newConnection = created.model.connections.find((item) => item.businessObject === newFlow.id);
  assert.equal(attr(newConnection.node, 'start'), `/0/@children.${shapeIndex(created.model, 'task5')}/@anchors.1`);
  assert.equal(created.validation.ok, true);

  const awayFromStudioShape = reconnectSequenceFlow(studio, { flowId: 'flow47', endpoint: 'source', newElementId: 'servicetask11' });
  assert.equal(awayFromStudioShape.validation.ok, true);
  const backToStudioShape = reconnectSequenceFlow(awayFromStudioShape.text, { flowId: 'flow47', endpoint: 'source', newElementId: 'task5' });
  const backConnection = backToStudioShape.model.connections.find((item) => item.businessObject === 'flow47');
  assert.equal(attr(backConnection.node, 'start'), `/0/@children.${shapeIndex(backToStudioShape.model, 'task5')}/@anchors.1`);
  assert.equal(backToStudioShape.validation.ok, true);

  const connected = createConnectedTask(studio, { sourceId: 'task5', x: 900, y: 600 });
  const connectedFlow = connected.model.flows.at(-1);
  const connectedConnection = connected.model.connections.find((item) => item.businessObject === connectedFlow.id);
  assert.equal(attr(connectedConnection.node, 'start'), `/0/@children.${shapeIndex(connected.model, 'task5')}/@anchors.1`);
  assert.equal(connected.validation.ok, true);
});
