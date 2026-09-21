'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const { parseProcess } = require('../../src/bpmn/processModel.ts');
const {
  createConnectedTask,
  createIsolatedNode,
  createPool,
  createSequenceFlow,
  createSwimLane
} = require('../../src/bpmn/processPatcher.ts');

const fixturePath = path.join(__dirname, 'fixtures', 'toexportbpmnteste.process.gz.b64');
const templateText = zlib.gunzipSync(
  Buffer.from(fs.readFileSync(fixturePath, 'utf8').trim(), 'base64')
).toString('utf8');

function emptyDiagram(text) {
  const model = parseProcess(text);
  const xmiRoot = model.xml.children.find((node) => node.name === 'xmi:XMI');
  const nodes = [
    ...model.diagram.children.filter((node) => ['children', 'connections'].includes(node.localName)),
    ...xmiRoot.children.filter((node) => node.name.startsWith('bpmn2:') && node.localName !== 'BpmnProcess')
  ];
  let result = text;
  for (const node of nodes.sort((left, right) => right.start - left.start)) {
    let start = result.lastIndexOf('\n', node.start - 1) + 1;
    let end = node.closeEnd;
    if (result.startsWith('\r\n', end)) end += 2;
    else if (result[end] === '\n') end += 1;
    result = result.slice(0, start) + result.slice(end);
  }
  return result.replace(/\s+pictogramLinks="[^"]*"/, '');
}

test('cria o primeiro elemento em um processo sem shapes usando o catálogo interno', () => {
  const empty = emptyDiagram(templateText);
  const before = parseProcess(empty);
  assert.equal(before.shapes.length, 0);
  assert.equal(before.connections.length, 0);

  const created = createIsolatedNode(empty, {
    kind: 'start',
    subtype: '10',
    x: 100,
    y: 100,
    templateText
  });
  assert.equal(created.validation.ok, true);
  assert.equal(created.model.shapes.length, 1);
  assert.equal(created.model.elements.filter((item) => item.tag === 'BpmnStartEvent').length, 1);
});

test('cria o primeiro fluxo quando o processo ainda não possui conexão visual', () => {
  const empty = emptyDiagram(templateText);
  const start = createIsolatedNode(empty, {
    kind: 'start', subtype: '10', x: 100, y: 100, templateText
  });
  const startId = start.model.elements.find((item) => item.tag === 'BpmnStartEvent').id;
  const task = createConnectedTask(start.text, {
    sourceId: startId, x: 260, y: 100, templateText
  });
  assert.equal(task.validation.ok, true);
  assert.equal(task.model.connections.length, 1);
  assert.equal(task.model.flows.length, 1);
});

test('liga dois elementos existentes quando ainda não existe fluxo para servir de molde', () => {
  const empty = emptyDiagram(templateText);
  const start = createIsolatedNode(empty, {
    kind: 'start', subtype: '10', x: 100, y: 100, templateText
  });
  const task = createIsolatedNode(start.text, {
    kind: 'task', subtype: '80', x: 260, y: 100, templateText
  });
  const model = parseProcess(task.text);
  const sourceId = model.elements.find((item) => item.tag === 'BpmnStartEvent').id;
  const targetId = model.elements.find((item) => item.tag === 'BpmnTask').id;
  const flow = createSequenceFlow(task.text, { sourceId, targetId, templateText });

  assert.equal(flow.validation.ok, true);
  assert.equal(flow.model.connections.length, 1);
  assert.equal(flow.model.flows.length, 1);
});

test('cria pool e raia independente em processo sem shapes', () => {
  const empty = emptyDiagram(templateText);
  const pool = createPool(empty, { x: 40, y: 40, templateText });
  const lane = createSwimLane(empty, { x: 40, y: 40, templateText });
  assert.equal(pool.validation.ok, true);
  assert.equal(lane.validation.ok, true);
  assert.equal(pool.model.elements.some((item) => item.tag === 'BpmnPool'), true);
  assert.equal(lane.model.elements.some((item) => item.tag === 'BpmnSwimLane'), true);
});
