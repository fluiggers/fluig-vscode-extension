'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchTaskAssignment } = require('../../src/bpmn/processPatcher');
const { taskAssignmentDefinition } = require('../../src/bpmn/taskAssignment');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function definition(text, elementId, mechanismCatalog = []) {
  const model = parseProcess(text);
  const element = model.elements.find((item) => item.id === elementId);
  const byId = new Map([...model.elements, ...model.flows].map((item) => [item.id, item]));
  return taskAssignmentDefinition(element, byId, ['campox'], mechanismCatalog);
}

test('expõe atribuição nas atividades compatíveis e respeita o modo da atividade de serviço', () => {
  assert.equal(definition(fixture, 'task5').mechanism, 'Grupo');
  assert.equal(definition(fixture, 'task5').mechanismConfiguration.groupId, 'TODOS');
  assert.ok(definition(fixture, 'businessruletask33'));
  assert.ok(definition(fixture, 'scripttask34'));
  assert.ok(definition(fixture, 'adhocsubprocess36'));
  assert.ok(definition(fixture, 'servicetask11'));
  assert.equal(definition(fixture, 'mailtask31'), null);
  assert.equal(definition(fixture, 'manualtask32'), null);
  assert.equal(definition(fixture, 'subprocess35'), null);

  const automaticService = fixture.replace(
    /(<bpmn2:BpmnTask id="servicetask11"[^>]*?)(\/?>)/,
    '$1 executionType="1"$2'
  );
  assert.equal(definition(automaticService, 'servicetask11'), null);
});

test('mantém mecanismos padrão primeiro e mecanismos customizados no fim da atividade', () => {
  const editor = definition(fixture, 'task5', [
    { label: 'Atribuição por Grupo HelpDesk', value: 'atrib_tratar_chamado' },
    { label: 'mecBuscaAprovadorTP', value: 'mecBuscaAprovadorTP' }
  ]);
  assert.deepEqual(editor.mechanisms.slice(0, 10).map((item) => item.value), [
    '', 'Associado', 'Campo Formulário', 'Executor Atividade', 'Grupo',
    'Grupos Colaborador', 'Papel', 'Pool Grupo', 'Pool Papel', 'Usuário'
  ]);
  assert.deepEqual(editor.mechanisms.slice(-2).map((item) => item.value), [
    'atrib_tratar_chamado', 'mecBuscaAprovadorTP'
  ]);
  assert.equal(editor.mechanisms.at(-1).kind, 'custom');
});

test('grava mecanismo padrão, customizado e remoção no atributo XStream da atividade', () => {
  const user = patchTaskAssignment(fixture, 'task5', {
    mechanism: 'Usuário',
    mechanismConfiguration: { colleagueId: 'daniel.sales' }
  });
  let task = user.model.elements.find((item) => item.id === 'task5');
  assert.equal(user.validation.ok, true);
  assert.equal(task.attributes.managerMechanism, 'Usuário');
  assert.match(task.attributes.managerAssignmentControllerString, /^<org\.eclipse\.bpmn2\.impl\.AssignmentControllerColleague>/);
  assert.match(task.attributes.managerAssignmentControllerString, /<colleagueId>daniel\.sales<\/colleagueId>/);

  const custom = patchTaskAssignment(user.text, 'task5', {
    mechanism: 'mecBuscaAprovadorTP',
    mechanismConfiguration: {}
  });
  task = custom.model.elements.find((item) => item.id === 'task5');
  assert.equal(task.attributes.managerMechanism, 'mecBuscaAprovadorTP');
  assert.match(task.attributes.managerAssignmentControllerString, /AssignmentControllerCustom/);
  assert.match(task.attributes.managerAssignmentControllerString, /<mechanismName>mecBuscaAprovadorTP<\/mechanismName>/);

  const cleared = patchTaskAssignment(custom.text, 'task5', {
    mechanism: '',
    mechanismConfiguration: null
  });
  task = cleared.model.elements.find((item) => item.id === 'task5');
  assert.equal(task.attributes.managerMechanism, '');
  assert.equal(task.attributes.managerAssignmentControllerString, undefined);
  assert.equal(cleared.validation.ok, true);
});

test('grava associação completa e recusa atividade sem atribuição', () => {
  const result = patchTaskAssignment(fixture, 'task5', {
    mechanism: 'Associado',
    mechanismConfiguration: {
      associationType: 'AND',
      controllers: [
        { kind: 'colleague', value: 'daniel.sales' },
        { kind: 'group', value: 'TODOS' }
      ]
    }
  });
  const task = result.model.elements.find((item) => item.id === 'task5');
  const configuration = definition(result.text, 'task5').mechanismConfiguration;
  assert.match(task.attributes.managerAssignmentControllerString, /AssignmentControllerAssociated/);
  assert.equal(configuration.associationType, 'AND');
  assert.deepEqual(configuration.controllers, [
    { kind: 'colleague', value: 'daniel.sales' },
    { kind: 'group', value: 'TODOS' }
  ]);
  assert.throws(
    () => patchTaskAssignment(fixture, 'mailtask31', { mechanism: 'Grupo', mechanismConfiguration: { groupId: 'TODOS' } }),
    /não aceita mecanismo/
  );
});
