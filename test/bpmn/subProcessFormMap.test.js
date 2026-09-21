'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchSubProcessFormMaps } = require('../../src/bpmn/processPatcher');
const {
  normalizeSubProcessFormMaps,
  parseSubProcessFormMaps,
  serializeSubProcessFormMaps,
  subProcessFormMapDefinition
} = require('../../src/bpmn/subProcessFormMap');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

const maps = [
  { processField: 'solicitante', subProcessField: 'requisitante', mapFlow: '2' },
  { processField: 'resultado', subProcessField: 'retorno', mapFlow: '0' },
  { processField: 'codigo', subProcessField: 'codigo', mapFlow: '1' }
];

test('le e serializa formMaps XStream com as tres direcoes do Eclipse', () => {
  const serialized = serializeSubProcessFormMaps(maps);
  assert.match(serialized, /org\.eclipse\.bpmn2\.impl\.BpmnProcessFormMap/);
  assert.deepEqual(parseSubProcessFormMaps(serialized), maps);
});

test('grava e remove formMaps por patch cirurgico', () => {
  const before = parseProcess(fixture);
  const catalogs = {
    parentFields: ['solicitante', 'resultado', 'codigo'],
    childFields: ['requisitante', 'retorno', 'codigo']
  };
  const result = patchSubProcessFormMaps(fixture, 'subprocess35', maps, catalogs);
  const child = result.model.elements.find((element) => element.id === 'subprocess35');
  assert.equal(result.validation.ok, true);
  assert.deepEqual(parseSubProcessFormMaps(child.attributes.formMaps), maps);
  assert.deepEqual(result.model.flows.map((flow) => flow.id), before.flows.map((flow) => flow.id));
  assert.match(result.text, /formMaps="&lt;list&gt;&#xA;/);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  const repeated = patchSubProcessFormMaps(result.text, 'subprocess35', maps, catalogs);
  assert.equal(repeated.changed, false);
  const removed = patchSubProcessFormMaps(result.text, 'subprocess35', [], catalogs);
  assert.equal(removed.model.elements.find((element) => element.id === 'subprocess35').attributes.formMaps, undefined);
});

test('recusa catalogos, direcoes e conflitos invalidos', () => {
  assert.throws(() => normalizeSubProcessFormMaps(maps, [], ['codigo']), /processo pai/);
  assert.throws(() => normalizeSubProcessFormMaps([
    { processField: 'codigo', subProcessField: 'codigo', mapFlow: '9' }
  ], ['codigo'], ['codigo']), /Direcao/);
  assert.throws(() => normalizeSubProcessFormMaps([
    { processField: 'codigo', subProcessField: 'codigo', mapFlow: '1' },
    { processField: 'codigo', subProcessField: 'retorno', mapFlow: '2' }
  ], ['codigo'], ['codigo', 'retorno']), /mesma direcao/);
});

test('mantem formMaps legado desconhecido em modo somente leitura', () => {
  const element = parseProcess(fixture).elements.find((item) => item.id === 'subprocess35');
  element.attributes.formMaps = '<list><legacy/></list>';
  const editor = subProcessFormMapDefinition(element, {
    supported: true,
    parentFields: ['codigo'],
    childFields: ['codigo']
  });
  assert.equal(editor.supported, false);
  assert.match(editor.reason, /desconhecido/);
});

test('mantem os campos dos mapeamentos salvos quando o catalogo remoto volta vazio', () => {
  const element = parseProcess(fixture).elements.find((item) => item.id === 'subprocess35');
  element.attributes.formMaps = serializeSubProcessFormMaps(maps.slice(0, 1));
  const editor = subProcessFormMapDefinition(element, {
    supported: true,
    parentFields: [],
    childFields: []
  });
  assert.deepEqual(editor.parentFields, ['solicitante']);
  assert.deepEqual(editor.childFields, ['requisitante']);
  assert.deepEqual(editor.maps, maps.slice(0, 1));
});
