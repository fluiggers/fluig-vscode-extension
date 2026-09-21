'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchTaskMobile } = require('../../src/bpmn/processPatcher');
const { taskMobileDefinition, taskMobileValues } = require('../../src/bpmn/taskMobile');

const references = path.join(__dirname, 'fixtures', 'referencias');

function reference(number) {
  const folder = fs.readdirSync(references).find((name) => name.startsWith(`etapa-${number}-`));
  return fs.readFileSync(path.join(references, folder, 'toexportbpmnteste.process'), 'ascii');
}

function definition(number) {
  const model = parseProcess(reference(number));
  const task = model.elements.find((element) => element.id === 'task5');
  const businessById = new Map([...model.elements, ...model.flows].map((element) => [element.id, element]));
  return taskMobileDefinition(task, model.flows, businessById, ['campox', 'aprovador']);
}

test('interpreta os oito snapshots Mobile produzidos pelo Eclipse', () => {
  assert.deepEqual(taskMobileValues(parseProcess(reference(49)).elements.find((item) => item.id === 'task5').attributes.appsConfiguration), {
    title: '', description: '', highlight: '', approve: '', reject: ''
  });
  assert.equal(definition(50).title, 'Titulo Mobile 50');
  assert.equal(definition(51).title, '@[form:campox]');
  assert.equal(definition(52).highlight, 'Destaque Mobile 52');
  assert.equal(definition(53).highlight, 'Destaque Mobile 53 @[form:campox]');
  assert.equal(definition(54).description, 'Descricao Mobile 54');
  assert.equal(definition(55).reject, '4');
  assert.equal(definition(56).approve, '39');
  assert.equal(definition(57).approve, '');
  assert.equal(definition(57).reject, '4');
});

test('oferece destinos de avanço e retorno habilitado com códigos do Fluig', () => {
  assert.deepEqual(definition(57).actionOptions, [
    { value: '39', label: 'Exclusivo (39)' },
    { value: '4', label: 'VOLTAR_PARA_INICIO (4)' }
  ]);
  assert.deepEqual(definition(57).formFields, ['campox', 'aprovador']);
  assert.deepEqual(definition(57).limits, { title: 28, highlight: 30, description: 140 });
});

test('snapshots Mobile do Eclipse são idempotentes', () => {
  for (let number = 50; number <= 57; number += 1) {
    const text = reference(number);
    const current = definition(number);
    const result = patchTaskMobile(text, 'task5', current);
    assert.equal(result.changed, false, `etapa ${number}`);
    assert.equal(result.text, text, `texto da etapa ${number}`);
  }
});

test('materializa configuração Mobile ausente no formato canônico e preserva estrutura', () => {
  const requested = {
    title: '@[form:campox]', highlight: 'Valor & destaque', description: 'Linha 1\nLinha 2', approve: '39', reject: '4'
  };
  const result = patchTaskMobile(reference(49), 'task5', requested);
  const task = result.model.elements.find((element) => element.id === 'task5');
  assert.deepEqual(taskMobileValues(task.attributes.appsConfiguration), {
    title: '@[form:campox]', description: 'Linha 1\nLinha 2', highlight: 'Valor & destaque', approve: '39', reject: '4'
  });
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  assert.equal(patchTaskMobile(result.text, 'task5', requested).changed, false);
});

test('recusa limites, destino e elemento incompatíveis', () => {
  const valid = { title: '', highlight: '', description: '', approve: '', reject: '' };
  assert.throws(() => patchTaskMobile(reference(57), 'task5', { ...valid, title: 'x'.repeat(29) }), /28 caracteres/);
  assert.throws(() => patchTaskMobile(reference(57), 'task5', { ...valid, highlight: 'x'.repeat(31) }), /30 caracteres/);
  assert.throws(() => patchTaskMobile(reference(57), 'task5', { ...valid, description: 'x'.repeat(141) }), /140 caracteres/);
  assert.throws(() => patchTaskMobile(reference(57), 'task5', { ...valid, approve: '999' }), /não está disponível/);
  assert.throws(() => patchTaskMobile(reference(57), 'servicetask11', valid), /não aceita configuração Mobile/);
  const malformed = reference(57).replace('&lt;appField>title&lt;/appField>', '&lt;appField>unknown&lt;/appField>');
  assert.throws(() => patchTaskMobile(malformed, 'task5', valid), /appsConfiguration incompleto/);
});
