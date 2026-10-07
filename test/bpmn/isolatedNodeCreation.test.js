'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createAttachedErrorEvent, createIsolatedNode, deleteIsolatedSubProcess, patchProcess } = require('../../src/bpmn/processPatcher');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('cria isoladamente todos os elementos posicionáveis da paleta sem inventar fluxos', () => {
  const before = parseProcess(fixture);
  const cases = [
    ['start', 'BpmnStartEvent', 'startevent'],
    ['end', 'BpmnEndEvent', 'endevent'],
    ['intermediate', 'BpmnIntermediateEvent', 'intermediateevent'],
    ['task', 'BpmnTask', 'task'],
    ['subprocess', 'BpmnSubProcess', 'subprocess'],
    ['gateway', 'BpmnGateway', 'exclusivegateway'],
    ['database', 'BpmnDatabase', 'databasetask'],
    ['annotation', 'BpmnAnnotation', 'annotationtask'],
    ['document', 'BpmnDocument', 'documenttask']
  ];

  for (const [kind, tag, prefix] of cases) {
    const result = createIsolatedNode(fixture, { kind, x: 1500, y: 1000 });
    const shape = result.model.shapeById.get(result.elementId);
    assert.match(result.elementId, new RegExp(`^${prefix}\\d+$`));
    assert.equal(result.elementTag, tag);
    assert.deepEqual({ x: shape.x, y: shape.y }, { x: 1500, y: 1000 });
    assert.equal(result.model.elements.length, before.elements.length + 1);
    assert.equal(result.model.shapes.length, before.shapes.length + 1);
    assert.equal(result.model.flows.length, before.flows.length);
    assert.equal(result.model.connections.length, before.connections.length);
    assert.equal(result.validation.ok, true);
    assert.equal(result.model.fingerprint.encoding, 'ASCII');
    assert.equal(result.model.fingerprint.lineEnding, 'CRLF');
  }
});

test('altera cor lógica e visual da raia reutilizando ou anexando colors como o Eclipse', () => {
  const before = parseProcess(fixture);
  const existingRedCount = before.diagram.children.filter((node) => node.localName === 'colors').length;
  const reused = patchProcess(fixture, 'swimlane66', { cores: '#ff0000' });
  assert.equal(reused.model.elements.find((item) => item.id === 'swimlane66').attributes.cores, 'FF0000');
  assert.equal(reused.model.shapeById.get('swimlane66').graphicsNode.attributeMap.background.value, '/0/@colors.21');
  assert.equal(reused.model.diagram.children.filter((node) => node.localName === 'colors').length, existingRedCount);

  const appended = patchProcess(fixture, 'swimlane66', { cores: '0000FF' });
  const colors = appended.model.diagram.children.filter((node) => node.localName === 'colors');
  assert.equal(appended.model.elements.find((item) => item.id === 'swimlane66').attributes.cores, '0000FF');
  assert.equal(appended.model.shapeById.get('swimlane66').graphicsNode.attributeMap.background.value, `/0/@colors.${existingRedCount}`);
  assert.equal(colors.length, existingRedCount + 1);
  assert.equal(colors.at(-1).attributeMap.red, undefined);
  assert.equal(colors.at(-1).attributeMap.green, undefined);
  assert.equal(colors.at(-1).attributeMap.blue.value, '255');
  assert.equal(appended.validation.ok, true);
  assert.throws(() => patchProcess(fixture, 'swimlane66', { cores: 'azul' }), /Cor inválida/);
});

test('cria todos os subtipos expansíveis da paleta com tipo e prefixo corretos', () => {
  const catalogs = {
    start: [['10', 'startevent'], ['12', 'starttimer'], ['13', 'startconditional'], ['14', 'startsignal'], ['16', 'startmultiple']],
    end: [['60', 'endevent'], ['63', 'enderror'], ['64', 'endsignal'], ['65', 'endcancel'], ['66', 'endmultiple'], ['68', 'endterminate']],
    intermediate: [['30', 'intermediateevent'], ['32', 'intermediatetimer'], ['35', 'intermediateconditional'], ['36', 'intermediatelink'], ['37', 'intermediatesignal'], ['39', 'intermediatemultiple'], ['41', 'intermediatesignalreceive'], ['42', 'intermediatelinkreceive']],
    task: [['80', 'task'], ['81', 'usertask'], ['82', 'servicetask'], ['84', 'mailtask'], ['85', 'manualtask'], ['86', 'businessruletask'], ['87', 'scripttask']],
    subprocess: [['100', 'subprocess'], ['101', 'adhocsubprocess']],
    gateway: [['120', 'exclusivegateway'], ['121', 'inclusivegateway'], ['126', 'parallelgateway'], ['127', 'joingateway']]
  };
  for (const [kind, subtypes] of Object.entries(catalogs)) {
    for (const [subtype, prefix] of subtypes) {
      const result = createIsolatedNode(fixture, { kind, subtype, x: 1600, y: 1100 });
      const element = result.model.elements.find((item) => item.id === result.elementId);
      assert.match(result.elementId, new RegExp(`^${prefix}\\d+$`));
      assert.equal(element.type, subtype);
      assert.equal(result.validation.ok, true);
      assert.equal(result.model.flows.length, parseProcess(fixture).flows.length);
    }
  }
});

test('cria subprocesso comum usando o template ad-hoc quando o template comum não existe', () => {
  const withoutCommon = deleteIsolatedSubProcess(fixture, 'subprocess35').text;
  const result = createIsolatedNode(withoutCommon, { kind: 'subprocess', subtype: '100', x: 1600, y: 1100 });
  const element = result.model.elements.find((item) => item.id === result.elementId);
  assert.match(result.elementId, /^subprocess\d+$/);
  assert.equal(element.tag, 'BpmnSubProcess');
  assert.equal(element.type, '100');
  assert.equal(element.attributes.process, '');
  assert.equal(result.validation.ok, true);
});

test('recusa tipo de paleta desconhecido sem alterar o processo', () => {
  assert.throws(() => createIsolatedNode(fixture, { kind: 'inexistente', x: 10, y: 10 }), /não suportado/);
  assert.throws(() => createIsolatedNode(fixture, { kind: 'start', subtype: '999', x: 10, y: 10 }), /Subtipo 999 não suportado/);
});

test('cria captura de erro somente em atividade de serviço automatizada', () => {
  const automatedText = patchProcess(fixture, 'servicetask11', { executionType: '1' }).text;
  const before = parseProcess(automatedText);
  const result = createAttachedErrorEvent(automatedText, {
    taskId: 'servicetask11',
    x: 590,
    y: 150
  });
  const event = result.model.elements.find((item) => item.id === result.elementId);
  const task = result.model.elements.find((item) => item.id === 'servicetask11');
  const shape = result.model.shapeById.get(result.elementId);
  assert.match(result.elementId, /^intermediateerror\d+$/);
  assert.equal(event.type, '43');
  assert.equal(event.attributes.parentTask, 'servicetask11');
  assert.equal(event.attributes.sequenceAttached, '11');
  assert.equal(task.attributes.attachedEvents, result.elementId);
  assert.deepEqual({ x: shape.x, y: shape.y }, { x: 590, y: 150 });
  assert.equal(result.model.flows.length, before.flows.length);
  assert.equal(result.model.connections.length, before.connections.length);
  assert.equal(result.validation.ok, true);

  assert.throws(
    () => createAttachedErrorEvent(fixture, { taskId: 'servicetask11', x: 590, y: 150 }),
    /serviço automatizada/
  );
  assert.throws(
    () => createAttachedErrorEvent(fixture, { taskId: 'task5', x: 590, y: 150 }),
    /atividade de serviço/
  );
  assert.throws(
    () => createAttachedErrorEvent(fixture, { taskId: 'servicetask44', x: 590, y: 150 }),
    /já possui uma tratativa/
  );
});
