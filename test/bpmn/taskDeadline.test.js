'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { validateProcess } = require('../../src/bpmn/processValidator');
const { patchTaskDeadline } = require('../../src/bpmn/processPatcher');
const {
  durationToMinutes,
  minutesToDuration,
  taskDeadlineDefinition
} = require('../../src/bpmn/taskDeadline');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const catalogs = {
  formFields: ['campox', 'aprovador'],
  expedientCatalog: [{ value: 'Default', label: 'Default' }]
};

test('expõe valor fixo e catálogos no formato visual', () => {
  const task = parseProcess(fixture).elements.find((item) => item.id === 'task5');
  assert.deepEqual(taskDeadlineDefinition(task, catalogs.formFields, catalogs.expedientCatalog), {
    supported: true,
    expedient: 'Default',
    mode: 'fixed',
    fixedDuration: '024:00',
    deadlineFieldName: '',
    expedientOptions: [{ value: 'Default', label: 'Default' }],
    formFieldOptions: [
      { value: 'campox', label: 'campox' },
      { value: 'aprovador', label: 'aprovador' }
    ]
  });
  assert.equal(durationToMinutes('012:30'), '750.0');
  assert.equal(minutesToDuration('750.0'), '012:30');
});

test('mantém edição idempotente no modo fixo', () => {
  const result = patchTaskDeadline(fixture, 'task5', {
    expedient: 'Default', mode: 'fixed', fixedDuration: '024:00', deadlineFieldName: ''
  }, catalogs);
  assert.equal(result.changed, false);
  assert.equal(result.text, fixture);
});

test('alterna atomicamente entre prazo fixo e campo do formulário', () => {
  const formResult = patchTaskDeadline(fixture, 'task5', {
    expedient: 'Default', mode: 'form', fixedDuration: '024:00', deadlineFieldName: 'campox'
  }, catalogs);
  const formTask = formResult.model.elements.find((item) => item.id === 'task5');
  assert.equal(formTask.attributes.deadlineFieldName, 'campox');
  assert.equal(formTask.attributes.prazoConclusao, undefined);
  assert.equal(validateProcess(formResult.model).ok, true);
  assert.equal(taskDeadlineDefinition(formTask, catalogs.formFields, catalogs.expedientCatalog).mode, 'form');
  const repeatedForm = patchTaskDeadline(formResult.text, 'task5', {
    expedient: 'Default', mode: 'form', fixedDuration: '024:00', deadlineFieldName: 'campox'
  }, catalogs);
  assert.equal(repeatedForm.changed, false);

  const fixedResult = patchTaskDeadline(formResult.text, 'task5', {
    expedient: 'Default', mode: 'fixed', fixedDuration: '012:30', deadlineFieldName: 'campox'
  }, catalogs);
  const fixedTask = fixedResult.model.elements.find((item) => item.id === 'task5');
  assert.equal(fixedTask.attributes.deadlineFieldName, undefined);
  assert.equal(fixedTask.attributes.prazoConclusao, '750.0');
  assert.equal(/[^\x00-\x7F]/.test(fixedResult.text), false);
  assert.equal(fixedResult.text.includes('\r\n'), true);
});

test('representa zero sem atributo prazoConclusao', () => {
  const result = patchTaskDeadline(fixture, 'task5', {
    expedient: 'Default', mode: 'fixed', fixedDuration: '000:00'
  }, catalogs);
  assert.equal(result.model.elements.find((item) => item.id === 'task5').attributes.prazoConclusao, undefined);
});

test('preserva valor legado atual, mas recusa referências novas desconhecidas', () => {
  const legacy = fixture.replace('expediente="Default"', 'expediente="Legado"');
  assert.doesNotThrow(() => patchTaskDeadline(legacy, 'task5', {
    expedient: 'Legado', mode: 'fixed', fixedDuration: '024:00'
  }, catalogs));
  assert.throws(() => patchTaskDeadline(fixture, 'task5', {
    expedient: 'Inexistente', mode: 'fixed', fixedDuration: '024:00'
  }, catalogs), /não foi encontrado/);
  assert.throws(() => patchTaskDeadline(fixture, 'task5', {
    expedient: 'Default', mode: 'form', deadlineFieldName: 'inexistente'
  }, catalogs), /não foi encontrado/);
});

test('recusa duração inválida, elemento incompatível e configuração contraditória', () => {
  assert.throws(() => patchTaskDeadline(fixture, 'task5', {
    expedient: 'Default', mode: 'fixed', fixedDuration: '24 horas'
  }, catalogs), /Duração inválida/);
  assert.throws(() => patchTaskDeadline(fixture, 'servicetask11', {
    expedient: 'Default', mode: 'fixed', fixedDuration: '001:00'
  }, catalogs), /não aceita expediente/);
  const contradictory = fixture.replace(
    'prazoConclusao="1440.0"',
    'prazoConclusao="1440.0" deadlineFieldName="campox"'
  );
  assert.throws(() => patchTaskDeadline(contradictory, 'task5', {
    expedient: 'Default', mode: 'form', deadlineFieldName: 'campox'
  }, catalogs), /ao mesmo tempo/);
});

test('aceita expediente e prazo no evento inicial simples', () => {
  const result = patchTaskDeadline(fixture, 'startevent4', {
    expedient: 'Default', mode: 'fixed', fixedDuration: '001:15'
  }, catalogs);
  const start = result.model.elements.find((item) => item.id === 'startevent4');
  assert.equal(start.attributes.expediente, 'Default');
  assert.equal(start.attributes.prazoConclusao, '75.0');
});
