'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchExtendedProperties } = require('../../src/bpmn/processPatcher');
const {
  extendedPropertiesDefinition,
  extendedPropertyValues,
  supportsExtendedProperties
} = require('../../src/bpmn/extendedProperties');

const references = path.join(__dirname, 'fixtures', 'referencias');

function reference(number) {
  const folder = fs.readdirSync(references).find((name) => name.startsWith(`etapa-${number}-`));
  return fs.readFileSync(path.join(references, folder, 'toexportbpmnteste.process'), 'ascii');
}

function model(number) {
  return parseProcess(reference(number));
}

function task(number) {
  return model(number).elements.find((element) => element.id === 'task5');
}

test('interpreta os cinco tipos de atributo dos snapshots Eclipse', () => {
  assert.deepEqual(extendedPropertyValues(task(69).attributes.extendedFields), []);
  assert.deepEqual(extendedPropertyValues(task(75).attributes.extendedFields), [
    { name: 'atributoTeste', type: '0', label: 'Atributo Teste', value: 'Valor Campo 70' },
    { name: 'atributoTexto', type: '1', label: 'Atributo Texto', value: 'Linha 1 Texto 71\r\nLinha 2 Texto 71' },
    { name: 'atributoNumero', type: '2', label: 'Atributo Número', value: '123' },
    { name: 'atributoData', type: '3', label: 'Atributo Data', value: '31/12/2027' },
    { name: 'atributoCheckBox', type: '4', label: 'Atributo CheckBox', value: true }
  ]);
  assert.equal(extendedPropertyValues(task(74).attributes.extendedFields)[4].value, false);
  assert.equal(extendedPropertyValues(task(76).attributes.extendedFields).some((item) => item.type === '2'), false);
  assert.deepEqual(extendedPropertyValues(task(77).attributes.extendedFields), []);
});

test('expõe catálogo dos cinco tipos nos elementos compatíveis', () => {
  const editor = extendedPropertiesDefinition(task(75));
  assert.deepEqual(editor.typeOptions.map((item) => item.value), ['0', '1', '2', '3', '4']);
  assert.equal(editor.properties.length, 5);
  assert.equal(supportsExtendedProperties(model(75).flows.find((flow) => flow.id === 'flow47')), true);
  assert.equal(extendedPropertiesDefinition(model(75).elements.find((element) => element.id === 'pool1')), null);
});

test('snapshots Eclipse são idempotentes e preservam ASCII/CRLF', () => {
  for (let number = 69; number <= 77; number += 1) {
    const text = reference(number);
    const properties = extendedPropertyValues(task(number).attributes.extendedFields);
    const result = patchExtendedProperties(text, 'task5', properties);
    assert.equal(result.changed, false, `etapa ${number}`);
    assert.equal(result.text, text, `texto etapa ${number}`);
    assert.equal(result.validation.ok, true);
    assert.equal(result.text.includes('\r\n'), true);
    assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  }
});

test('cria, altera e esvazia a lista sem tocar na estrutura do processo', () => {
  const created = patchExtendedProperties(reference(69), 'task5', [
    { name: 'campo', type: '0', label: 'Campo', value: 'Valor & teste' },
    { name: 'texto', type: '1', label: 'Texto', value: 'Linha 1\nLinha 2' },
    { name: 'numero', type: '2', label: 'Número', value: '-12.5' },
    { name: 'data', type: '3', label: 'Data', value: '07/09/2026' },
    { name: 'check', type: '4', label: 'CheckBox', value: true }
  ]);
  const values = extendedPropertyValues(created.model.elements.find((item) => item.id === 'task5').attributes.extendedFields);
  assert.equal(values[0].value, 'Valor & teste');
  assert.equal(values[1].value, 'Linha 1\r\nLinha 2');
  assert.equal(values[4].value, true);
  const empty = patchExtendedProperties(created.text, 'task5', []);
  assert.equal(empty.model.elements.find((item) => item.id === 'task5').attributes.extendedFields, '<list/>');
  assert.equal(empty.validation.ok, true);
});

test('recusa metadados, valores e elementos incompatíveis', () => {
  assert.throws(() => patchExtendedProperties(reference(69), 'task5', [{ name: '', type: '0', label: 'X' }]), /Nome\(id\) inválido/);
  assert.throws(() => patchExtendedProperties(reference(69), 'task5', [{ name: 'x', type: '9', label: 'X' }]), /Tipo inválido/);
  assert.throws(() => patchExtendedProperties(reference(69), 'task5', [{ name: 'x', type: '2', label: 'X', value: 'abc' }]), /numérico inválido/);
  assert.throws(() => patchExtendedProperties(reference(69), 'task5', [{ name: 'x', type: '3', label: 'X', value: '31/02/2027' }]), /Data inválida/);
  assert.throws(() => patchExtendedProperties(reference(69), 'task5', [
    { name: 'x', type: '0', label: 'X' }, { name: 'x', type: '1', label: 'Y' }
  ]), /duplicado/);
  assert.throws(() => patchExtendedProperties(reference(69), 'pool1', []), /não aceita atributos de extensão/);
});
