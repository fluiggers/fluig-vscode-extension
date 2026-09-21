'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchTaskScriptReference } = require('../../src/bpmn/processPatcher');
const {
  expectedTaskScriptFileName,
  supportsTaskScript,
  taskScriptDefinition,
  taskScriptTemplate
} = require('../../src/bpmn/taskScript');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'), 'utf8');

function model(text = fixture) {
  return parseProcess(text);
}

function element(id, text = fixture) {
  return model(text).elements.find((item) => item.id === id);
}

test('expõe scripts somente nas três atividades compatíveis', () => {
  const processId = model().process.id;
  for (const id of ['servicetask11', 'businessruletask33', 'scripttask34']) {
    const task = element(id);
    assert.equal(supportsTaskScript(task), true);
    assert.equal(taskScriptDefinition(task, processId).fileName, `toexportbpmnteste.${id}.js`);
  }
  assert.equal(supportsTaskScript(element('usertask30')), false);
  assert.equal(taskScriptDefinition(element('usertask30'), processId), null);
});

test('gera nomes e assinaturas iguais aos arquivos criados pelo Eclipse', () => {
  assert.equal(expectedTaskScriptFileName('toexportbpmnteste', 'servicetask11'), 'toexportbpmnteste.servicetask11.js');
  assert.equal(expectedTaskScriptFileName('109', 'servicetask11'), '109.servicetask11.js');
  assert.equal(expectedTaskScriptFileName('120', 'scripttask34'), '120.scripttask34.js');
  assert.equal(taskScriptTemplate(element('servicetask11')), 'function servicetask11(attempt, message) {\n}');
  assert.equal(taskScriptTemplate(element('businessruletask33')), 'function businessruletask33() {\n}');
  assert.equal(taskScriptTemplate(element('scripttask34')), 'function scripttask34() {\n}');
});

test('mantém referência existente e materializa somente scriptFileName quando ausente', () => {
  const unchanged = patchTaskScriptReference(fixture, 'servicetask11');
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.patches.length, 0);

  const withoutReference = fixture.replace(/(<bpmn2:BpmnTask id="servicetask11"[^>]*?) scriptFileName="[^"]*"/, '$1');
  const changed = patchTaskScriptReference(withoutReference, 'servicetask11');
  assert.equal(changed.changed, true);
  assert.equal(changed.validation.errors.length, 0);
  assert.equal(changed.model.elements.find((item) => item.id === 'servicetask11').attributes.scriptFileName,
    'toexportbpmnteste.servicetask11.js');
  assert.equal(changed.text.replace(' scriptFileName="toexportbpmnteste.servicetask11.js"', ''), withoutReference);
});

test('recusa tipo incompatível, referência divergente e identificador inseguro', () => {
  assert.throws(() => patchTaskScriptReference(fixture, 'usertask30'), /não aceita script/);
  const divergent = fixture.replace(
    'scriptFileName="toexportbpmnteste.servicetask11.js"',
    'scriptFileName="outro.js"'
  );
  assert.throws(() => patchTaskScriptReference(divergent, 'servicetask11'), /diverge do padrão seguro/);
  assert.throws(() => expectedTaskScriptFileName('../processo', 'servicetask11'), /código do processo inválido/);
});
