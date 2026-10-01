'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchTaskAttachmentRules } = require('../../src/bpmn/processPatcher');
const { attachmentRuleValues, taskAttachmentRulesDefinition } = require('../../src/bpmn/taskAttachmentRules');

const references = path.join(__dirname, 'fixtures', 'referencias');

function reference(number) {
  const folder = fs.readdirSync(references).find((name) => name.startsWith(`etapa-${number}-`));
  return fs.readFileSync(path.join(references, folder, 'toexportbpmnteste.process'), 'ascii');
}

function task(number) {
  return parseProcess(reference(number)).elements.find((element) => element.id === 'task5');
}

test('interpreta operadores e múltiplas regras dos snapshots Eclipse', () => {
  assert.deepEqual(attachmentRuleValues(task(57).attributes.attachmentRules), []);
  for (const [number, operator, amount, name] of [
    [58, '1', 2, '*.pdf'], [59, '2', 2, '*.pdf'], [60, '2', 2, 'nome.pdf'],
    [61, '3', 2, 'nome.pdf'], [62, '4', 2, 'nome.pdf'], [63, '5', 2, 'nome.pdf'],
    [64, '6', 0, 'nome.pdf'], [65, '0', 0, 'nome.pdf']
  ]) {
    const [rule] = attachmentRuleValues(task(number).attributes.attachmentRules);
    assert.deepEqual([rule.operator, rule.amount, rule.name], [operator, amount, name], `etapa ${number}`);
  }
  const two = attachmentRuleValues(task(67).attributes.attachmentRules);
  assert.equal(two.length, 2);
  assert.equal(two[1].message, 'Segunda regra de anexo');
  assert.deepEqual(attachmentRuleValues(task(68).attributes.attachmentRules), [
    { operator: '3', amount: 1, name: 'segundo.pdf', message: 'Segunda regra de anexo' }
  ]);
  assert.equal(task(69).attributes.attachmentRules, undefined);
  // Fluig Studio also saves rules with id 0 (not renumbered), which must still open.
  const studioIds = task(67).attributes.attachmentRules.replace('<id>1</id>', '<id>0</id>');
  assert.equal(attachmentRuleValues(studioIds).length, 2);
});

test('expõe catálogo dos sete operadores e campos do formulário', () => {
  const editor = taskAttachmentRulesDefinition(task(67), ['campox', 'aprovador']);
  assert.equal(editor.operatorOptions.length, 7);
  assert.deepEqual(editor.operatorOptions.map((item) => item.value), ['0', '1', '2', '3', '4', '5', '6']);
  assert.deepEqual(editor.formFields, ['campox', 'aprovador']);
  assert.equal(taskAttachmentRulesDefinition({ tag: 'BpmnTask', type: '81' }, ['campox']), null);
});

test('snapshots Eclipse são idempotentes e preservam ASCII/CRLF', () => {
  for (let number = 58; number <= 69; number += 1) {
    const text = reference(number);
    const rules = attachmentRuleValues(task(number).attributes.attachmentRules);
    const result = patchTaskAttachmentRules(text, 'task5', rules);
    assert.equal(result.changed, false, `etapa ${number}`);
    assert.equal(result.text, text, `texto etapa ${number}`);
    assert.equal(result.validation.ok, true);
    assert.equal(result.text.includes('\r\n'), true);
    assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  }
});

test('cria, renumera e remove regras sem alterar a estrutura do processo', () => {
  const created = patchTaskAttachmentRules(reference(57), 'task5', [
    { operator: '1', amount: 2, name: '@[form:campox]', message: 'Anexe & confira' },
    { operator: '6', amount: 99, name: '*.xml', message: '' }
  ]);
  assert.deepEqual(attachmentRuleValues(created.model.elements.find((item) => item.id === 'task5').attributes.attachmentRules), [
    { operator: '1', amount: 2, name: '@[form:campox]', message: 'Anexe & confira' },
    { operator: '6', amount: 0, name: '*.xml', message: '' }
  ]);
  const removed = patchTaskAttachmentRules(created.text, 'task5', [
    { operator: '6', amount: 0, name: '*.xml', message: '' }
  ]);
  assert.match(removed.model.elements.find((item) => item.id === 'task5').attributes.attachmentRules, /<id>1<\/id>/);
  const empty = patchTaskAttachmentRules(removed.text, 'task5', []);
  assert.equal(empty.model.elements.find((item) => item.id === 'task5').attributes.attachmentRules, undefined);
  assert.equal(empty.validation.ok, true);
});

test('recusa quantidade, operador, estrutura e elemento incompatíveis', () => {
  assert.throws(() => patchTaskAttachmentRules(reference(57), 'task5', [{ operator: '1', amount: '-1' }]), /Quantidade inválida/);
  assert.throws(() => patchTaskAttachmentRules(reference(57), 'task5', [{ operator: '9', amount: '1' }]), /Operador inválido/);
  assert.throws(() => patchTaskAttachmentRules(reference(58).replace('&lt;id>1&lt;/id>', '&lt;id>x&lt;/id>'), 'task5', []), /id inválido/);
  assert.throws(() => patchTaskAttachmentRules(reference(58), 'servicetask11', []), /não aceita regras de anexo/);
  assert.throws(() => patchTaskAttachmentRules(reference(58), 'usertask30', []), /não aceita regras de anexo/);
});
