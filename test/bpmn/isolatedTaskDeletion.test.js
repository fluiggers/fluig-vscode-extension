'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const {
  createConnectedGateway,
  createConnectedTask,
  createSequenceFlow,
  deleteDiagramElements,
  deleteIsolatedTask,
  patchGatewayBranches
} = require('../../src/bpmn/processPatcher');
const { validateProcess } = require('../../src/bpmn/processValidator');
const { walk } = require('../../src/bpmn/xmlTokenizer');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function directNodes(model, localName) {
  return model.diagram.children.filter((node) => node.localName === localName);
}

function serializedNodes(text, nodes) {
  return nodes.map((node) => text.slice(node.start, node.closeEnd));
}

function references(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

function isolatedTask(type, prefix) {
  const id = `${prefix}31`;
  const renamed = fixture.replaceAll('mailtask31', id);
  const text = renamed.replace(
    new RegExp(`(<bpmn2:BpmnTask id="${id}"[^>]* type=")84("[^>]*>)`),
    `$1${type}$2`
  );
  assert.match(text, new RegExp(`<bpmn2:BpmnTask id="${id}"[^>]* type="${type}"`));
  return { text, id };
}

test('exclui atividades isoladas dos sete tipos sem alterar fluxos', () => {
  const cases = [
    ['80', 'task'],
    ['81', 'usertask'],
    ['82', 'servicetask'],
    ['84', 'mailtask'],
    ['85', 'manualtask'],
    ['86', 'businessruletask'],
    ['87', 'scripttask']
  ];

  for (const [type, prefix] of cases) {
    const entry = isolatedTask(type, prefix);
    const before = parseProcess(entry.text);
    const result = deleteIsolatedTask(entry.text, entry.id);
    assert.equal(result.elementTag, 'BpmnTask');
    assert.equal(result.elementType, type);
    assert.equal(result.model.elements.length, before.elements.length - 1);
    assert.equal(result.model.shapes.length, before.shapes.length - 1);
    assert.equal(result.model.flows.length, before.flows.length);
    assert.equal(result.model.connections.length, before.connections.length);
    assert.equal(result.model.elements.some((item) => item.id === entry.id), false);
    assert.equal(result.model.shapes.some((item) => item.businessObject === entry.id), false);
    assert.equal(result.text.includes(entry.id), false);
    assert.equal(result.validation.ok, true);
    assert.equal(validateProcess(result.model).ok, true);
    assert.equal(result.model.fingerprint.encoding, 'ASCII');
    assert.equal(result.model.fingerprint.lineEnding, 'CRLF');
    assert.equal(result.model.fingerprint.version, before.fingerprint.version);
  }
});

test('exclui atividade intermediária e recalcula toda a cascata children.N', () => {
  const before = parseProcess(fixture);
  const stylesBefore = serializedNodes(fixture, directNodes(before, 'styles'));
  const colorsBefore = serializedNodes(fixture, directNodes(before, 'colors'));
  const fontsBefore = serializedNodes(fixture, directNodes(before, 'fonts'));
  const result = deleteIsolatedTask(fixture, 'mailtask31');
  const shiftedShape = result.model.shapeById.get('manualtask32');
  const shiftedIndex = directNodes(result.model, 'children').indexOf(shiftedShape.node);
  const removedIndex = directNodes(before, 'children').indexOf(before.shapeById.get('mailtask31').node);

  assert.equal(result.removedChildIndex, removedIndex);
  assert.equal(shiftedIndex, removedIndex);
  walk(result.model.xml, (node) => {
    for (const attribute of node.attributes) {
      for (const match of attribute.value.matchAll(/\/0\/@children\.(\d+)/g)) {
        assert.ok(Number(match[1]) < directNodes(result.model, 'children').length, `${attribute.name}: ${match[0]}`);
      }
    }
  });
  assert.deepEqual(serializedNodes(result.text, directNodes(result.model, 'styles')), stylesBefore);
  assert.deepEqual(serializedNodes(result.text, directNodes(result.model, 'colors')), colorsBefore);
  assert.deepEqual(serializedNodes(result.text, directNodes(result.model, 'fonts')), fontsBefore);
  assert.equal(result.model.flows.length, before.flows.length);
  assert.equal(result.model.connections.length, before.connections.length);
  assert.equal(result.validation.ok, true);
});

test('exclui atividade conectada e remove atomicamente os fluxos de entrada e saída', () => {
  const createdTask = createConnectedTask(fixture, {
    sourceId: 'startsignal13',
    x: 880,
    y: 600
  });
  const connected = createSequenceFlow(createdTask.text, {
    sourceId: createdTask.taskId,
    targetId: 'intermediateevent70'
  });
  const before = connected.model;
  const expectedSourceOutgoing = references(before.elements.find((item) => item.id === 'startsignal13').attributes.outgoing)
    .filter((id) => id !== createdTask.flowId);
  const expectedTargetIncoming = references(before.elements.find((item) => item.id === 'intermediateevent70').attributes.incoming)
    .filter((id) => id !== connected.flowId);
  const result = deleteIsolatedTask(connected.text, createdTask.taskId);

  assert.deepEqual(new Set(result.removedFlowIds), new Set([createdTask.flowId, connected.flowId]));
  assert.equal(result.model.elements.length, before.elements.length - 1);
  assert.equal(result.model.shapes.length, before.shapes.length - 1);
  assert.equal(result.model.flows.length, before.flows.length - 2);
  assert.equal(result.model.connections.length, before.connections.length - 2);
  assert.equal(result.model.elements.some((item) => item.id === createdTask.taskId), false);
  assert.equal(result.model.shapeById.has(createdTask.taskId), false);
  assert.equal(result.model.flows.some((item) => result.removedFlowIds.includes(item.id)), false);
  assert.equal(result.model.connections.some((item) => result.removedFlowIds.includes(item.businessObject)), false);
  assert.deepEqual(references(result.model.elements.find((item) => item.id === 'startsignal13').attributes.outgoing), expectedSourceOutgoing);
  assert.deepEqual(references(result.model.elements.find((item) => item.id === 'intermediateevent70').attributes.incoming), expectedTargetIncoming);
  assert.equal(result.validation.ok, true);
  assert.equal(validateProcess(result.model).ok, true);
  assert.equal(result.model.fingerprint.encoding, 'ASCII');
  assert.equal(result.model.fingerprint.lineEnding, 'CRLF');
});

test('exclui atividade com scriptFileName e informa o script vinculado', () => {
  const entry = isolatedTask('87', 'scripttask');
  const scripted = entry.text.replace(
    `<bpmn2:BpmnTask id="${entry.id}"`,
    `<bpmn2:BpmnTask id="${entry.id}" scriptFileName="toexportbpmnteste.${entry.id}.js"`
  );
  const result = deleteIsolatedTask(scripted, entry.id);
  assert.equal(result.scriptFileName, `toexportbpmnteste.${entry.id}.js`);
  assert.equal(result.model.elements.some((item) => item.id === entry.id), false);
  assert.equal(result.validation.ok, true);
});

test('exclui múltiplos elementos e seus fluxos incidentes em uma única transformação', () => {
  const created = createConnectedTask(fixture, { sourceId: 'startsignal13', x: 900, y: 620 });
  const result = deleteDiagramElements(created.text, ['mailtask31', created.taskId]);
  assert.deepEqual(new Set(result.elementIds), new Set(['mailtask31', created.taskId]));
  assert.equal(result.model.elements.some((item) => item.id === 'mailtask31'), false);
  assert.equal(result.model.elements.some((item) => item.id === created.taskId), false);
  assert.ok(result.removedFlowIds.includes(created.flowId));
  assert.equal(result.patches.length, 1);
  assert.equal(result.validation.ok, true);
});

test('recusa atividade condicionada, ramo padrão, evento, script compartilhado, referência externa, tipo inválido e arquivo inválido', () => {
  assert.throws(() => deleteIsolatedTask(fixture, 'task5'), /ainda é referenciado/);
  assert.throws(() => deleteIsolatedTask(fixture, 'servicetask44'), /possui evento anexado/);
  assert.throws(() => deleteIsolatedTask(fixture, 'scripttask34'), /ainda é referenciado/);
  assert.throws(() => deleteIsolatedTask(fixture, 'intermediateevent22'), /somente atividades comuns/);
  assert.throws(() => deleteIsolatedTask(fixture, 'task999'), /não encontrado ou duplicado/);

  const createdGateway = createConnectedGateway(fixture, { sourceId: 'startsignal13', x: 820, y: 600 });
  const createdTask = createConnectedTask(createdGateway.text, {
    sourceId: createdGateway.gatewayId,
    x: 940,
    y: 600
  });
  const conditioned = patchGatewayBranches(createdTask.text, createdGateway.gatewayId, {
    defaultFlowId: '',
    conditions: [{ sourceIndex: '', order: 1, expression: 'true', targetId: createdTask.taskId }]
  });
  assert.throws(() => deleteIsolatedTask(conditioned.text, createdTask.taskId), /condição que aponta/);

  const defaultBranch = patchGatewayBranches(createdTask.text, createdGateway.gatewayId, {
    defaultFlowId: createdTask.flowId,
    conditions: []
  });
  assert.throws(() => deleteIsolatedTask(defaultBranch.text, createdTask.taskId), /ramo padrão/);

  const entry = isolatedTask('80', 'task');
  const referenced = entry.text.replace(
    '<bpmn2:BpmnProcess ',
    `<bpmn2:BpmnProcess instruction="process.${entry.id}.js" `
  );
  assert.throws(() => deleteIsolatedTask(referenced, entry.id), /ainda é referenciado/);

  const broken = fixture.replace('sourceRef="task5"', 'sourceRef="missingtask999"');
  assert.notEqual(broken, fixture);
  assert.throws(() => deleteIsolatedTask(broken, 'mailtask31'), /erro\(s\) estrutural\(is\) antes da exclusão/);
});
