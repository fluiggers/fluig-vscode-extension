'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchProcessManager } = require('../../src/bpmn/processPatcher');
const { processManagerDefinition } = require('../../src/bpmn/processManager');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function definition(text, mechanismCatalog = []) {
  const model = parseProcess(text);
  const byId = new Map([...model.elements, ...model.flows].map((item) => [item.id, item]));
  return processManagerDefinition(model.process, byId, ['campox'], mechanismCatalog);
}

test('gestor usa os mecanismos padrao e deixa customizados no final', () => {
  const editor = definition(fixture, [{ value: 'mecCustom', label: 'Mecanismo customizado' }]);
  assert.deepEqual(editor.mechanisms.slice(0, 10).map((item) => item.value), [
    '', 'Associado', 'Campo Formulário', 'Executor Atividade', 'Grupo',
    'Grupos Colaborador', 'Papel', 'Pool Grupo', 'Pool Papel', 'Usuário'
  ]);
  assert.equal(editor.mechanisms.at(-1).value, 'mecCustom');
  assert.equal(editor.mechanisms.at(-1).kind, 'custom');
});

test('grava e remove gestor no atributo XStream proprio do processo', () => {
  const role = patchProcessManager(fixture, 'toexportbpmnteste', {
    mechanism: 'Papel',
    mechanismConfiguration: { roleId: 'admin' }
  });
  assert.equal(role.validation.ok, true);
  assert.equal(role.model.process.attributes.managerMechanism, 'Papel');
  assert.match(role.model.process.attributes.managerAssignmentController, /AssignmentControllerRole/);
  assert.match(role.model.process.attributes.managerAssignmentController, /<roleId>admin<\/roleId>/);
  assert.equal(role.model.process.attributes.managerAssignmentControllerString, undefined);
  assert.equal(definition(role.text).mechanismConfiguration.roleId, 'admin');

  const custom = patchProcessManager(role.text, 'toexportbpmnteste', {
    mechanism: 'mecCustom',
    mechanismConfiguration: {}
  });
  assert.match(custom.model.process.attributes.managerAssignmentController, /AssignmentControllerCustom/);

  const cleared = patchProcessManager(custom.text, 'toexportbpmnteste', {
    mechanism: '',
    mechanismConfiguration: null
  });
  assert.equal(cleared.model.process.attributes.managerMechanism, '');
  assert.equal(cleared.model.process.attributes.managerAssignmentController, undefined);
});
