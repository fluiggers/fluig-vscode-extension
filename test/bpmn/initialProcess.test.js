'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const { deleteDiagramElements } = require('../../src/bpmn/processPatcher.ts');
const { buildInitialProcess } = require('../../src/bpmn/processScaffold.ts');

const templatePath = path.join(__dirname, '..', '..', 'runtime', 'bpmn', 'creation-template.process.gz.b64');
const templateText = zlib.gunzipSync(
  Buffer.from(fs.readFileSync(templatePath, 'ascii').replace(/\s+/g, ''), 'base64')
).toString('utf8');

const only = (model, tag) => {
  const elements = model.elements.filter((element) => element.tag === tag);
  assert.equal(elements.length, 1, tag);
  return elements[0];
};

test('processo inicial traz pool com o nome pedido, uma raia e início → atividade → fim dentro dela', () => {
  const result = buildInitialProcess(templateText, 'pagamento', { poolName: 'Financeiro' });
  assert.equal(result.validation.ok, true);
  assert.equal(result.model.process.id, 'pagamento');
  const pool = only(result.model, 'BpmnPool');
  const lane = only(result.model, 'BpmnSwimLane');
  const start = only(result.model, 'BpmnStartEvent');
  const task = only(result.model, 'BpmnTask');
  const end = only(result.model, 'BpmnEndEvent');
  assert.equal(pool.name, 'Financeiro');
  assert.equal(lane.shape.parentBusinessObject, pool.id);
  assert.deepEqual(
    result.model.flows.map((flow) => [flow.attributes.sourceRef, flow.attributes.targetRef]),
    [[start.id, task.id], [task.id, end.id]]
  );
  for (const element of [start, task, end]) {
    assert.ok(element.shape.x >= lane.shape.x && element.shape.x + element.shape.width <= lane.shape.x + lane.shape.width, element.id);
    assert.ok(element.shape.y >= lane.shape.y && element.shape.y + element.shape.height <= lane.shape.y + lane.shape.height, element.id);
  }
  assert.deepEqual([...result.translationPlan.files.keys()].sort(), ['en_US', 'es', 'pt_BR']);
});

test('sem poolName a pool leva o código do processo e sem form o processo fica sem formulário', () => {
  const result = buildInitialProcess(templateText, 'pagamento');
  assert.equal(only(result.model, 'BpmnPool').name, 'pagamento');
  assert.equal(result.model.process.attributes.cardIndex, undefined);
  assert.equal(result.model.process.attributes.formSource, undefined);
});

test('pool aceita nome de pasta com espaço e acento', () => {
  const result = buildInitialProcess(templateText, 'agenda', { poolName: 'Agenda de Orçamentos' });
  assert.equal(result.validation.ok, true);
  assert.equal(only(result.model, 'BpmnPool').name, 'Agenda de Orçamentos');
  assert.doesNotMatch(result.text, /[^\x00-\x7F]/);
});

test('com form o processo fica ligado ao formulário local', () => {
  const result = buildInitialProcess(templateText, 'pagamento', { poolName: 'pagamento', form: 'form_pagamento' });
  assert.equal(result.model.process.attributes.formSource, 'local');
  assert.equal(result.model.process.attributes.cardIndex, 'form_pagamento');
});

test('pool e raia iniciais entram no pictogramLinks e a atividade pode ser excluída', () => {
  const result = buildInitialProcess(templateText, 'pagamento');
  const links = String(result.model.diagram.attributeMap.pictogramLinks?.value ?? '').split(/\s+/);
  assert.ok(links.includes('/0/@children.0/@link'));
  assert.ok(links.includes('/0/@children.0/@children.0/@link'));
  const task = only(result.model, 'BpmnTask');
  const end = only(result.model, 'BpmnEndEvent');
  assert.equal(deleteDiagramElements(result.text, [task.id, end.id]).validation.ok, true);
});
