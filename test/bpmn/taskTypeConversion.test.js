'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { descendants } = require('../../src/bpmn/xmlTokenizer');
const { parseProcess } = require('../../src/bpmn/processModel');
const { convertTaskType, TASK_TYPE_CONVERSIONS } = require('../../src/bpmn/processPatcher');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function imageId(model, taskId) {
  const shape = model.shapeById.get(taskId);
  return descendants(shape.node, (node) => (
    node.localName === 'graphicsAlgorithm' && node.attributeMap['xsi:type']?.value === 'al:Image'
  ))[0]?.attributeMap.id?.value ?? '';
}

test('converte atividade como o Eclipse e reescreve id, fluxos e referências internas', () => {
  const result = convertTaskType(fixture, 'task5', '85');
  const task = result.model.elements.find((item) => item.id === result.newId);
  const incoming = result.model.flows.find((item) => item.id === 'flow46');
  const outgoing = result.model.flows.find((item) => item.id === 'flow47');
  const gateway = result.model.elements.find((item) => item.id === 'exclusivegateway39');

  assert.match(result.newId, /^manualtask\d+$/);
  assert.equal(task.type, '85');
  assert.equal(task.attributes.incoming, 'flow46');
  assert.equal(task.attributes.outgoing, 'flow47');
  assert.equal(task.attributes.managerMechanism, '');
  assert.equal(task.attributes.managerAssignmentControllerString, undefined);
  assert.equal(incoming.attributes.targetRef, result.newId);
  assert.equal(outgoing.attributes.sourceRef, result.newId);
  assert.match(gateway.attributes.condition, new RegExp(`>${result.newId}<`));
  assert.equal(result.model.elements.some((item) => item.id === 'task5'), false);
  assert.equal(imageId(result.model, result.newId), TASK_TYPE_CONVERSIONS['85'].imageId);
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
});

test('conversão preserva e religa evento de erro anexado', () => {
  const result = convertTaskType(fixture, 'servicetask44', '85');
  const boundary = result.model.elements.find((item) => item.id === 'intermediateerror45');
  assert.equal(boundary.attributes.parentTask, result.newId);
  assert.equal(boundary.attributes.sequenceAttached, result.newActivityId);
  assert.equal(result.validation.ok, true);
});

test('todos os sete tipos recebem prefixo, type e imagem compatíveis', () => {
  for (const [type, definition] of Object.entries(TASK_TYPE_CONVERSIONS)) {
    const sourceId = type === '80' ? 'manualtask52' : 'task5';
    const result = convertTaskType(fixture, sourceId, type);
    assert.match(result.newId, new RegExp(`^${definition.prefix}\\d+$`));
    assert.equal(result.model.elements.find((item) => item.id === result.newId).type, type);
    assert.equal(imageId(result.model, result.newId), definition.imageId);
    assert.equal(result.validation.ok, true);
  }
});

test('remove script antigo e recusa tipo ou elemento inválido', () => {
  const converted = convertTaskType(fixture, 'servicetask11', '81');
  const task = converted.model.elements.find((item) => item.id === converted.newId);
  assert.equal(task.attributes.scriptFileName, undefined);
  assert.throws(() => convertTaskType(fixture, 'task5', '999'), /não suportado/);
  assert.throws(() => convertTaskType(fixture, 'startevent4', '85'), /atividade BPMN/);
});
