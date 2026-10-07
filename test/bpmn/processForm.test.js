'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchProcessForm } = require('../../src/bpmn/processPatcher');
const {
  MAX_DESCRIPTOR_FIELDS,
  descriptorFieldValues,
  processFormDefinition,
  serializeDescriptorFields
} = require('../../src/bpmn/processForm');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const localForms = [{ value: 't123', label: 't123', fields: ['campox', 'aprovador', 'observacao'] }];

test('lê e serializa campos descritores no formato XStream do Eclipse', () => {
  const descriptors = [{ id: 'campox', label: 'Campo X', cardIndex: 't123' }];
  const serialized = serializeDescriptorFields(descriptors);
  assert.equal(serialized, [
    '<list>',
    '  <org.eclipse.bpmn2.impl.BpmnProcessFormField>',
    '    <id>campox</id>',
    '    <label>Campo X</label>',
    '    <cardIndex>t123</cardIndex>',
    '  </org.eclipse.bpmn2.impl.BpmnProcessFormField>',
    '</list>'
  ].join('\n'));
  assert.deepEqual(descriptorFieldValues(serialized), descriptors);
});

test('define a aba de formulário e expõe o limite Fluig de 15 descritores', () => {
  const editor = processFormDefinition(parseProcess(fixture).process, localForms);
  assert.equal(editor.source, 'local');
  assert.equal(editor.cardIndex, 't123');
  assert.equal(editor.maxDescriptorFields, 15);
  assert.deepEqual(editor.localForms, localForms);
  // An unknown stored formSource must not block opening the process; it is shown as local.
  const unknownSource = parseProcess(fixture).process;
  unknownSource.attributes = { ...unknownSource.attributes, formSource: 'form_exemplo' };
  assert.equal(processFormDefinition(unknownSource, localForms).source, 'local');
});

test('grava formulário local, flags e descritores sem alterar a estrutura BPMN', () => {
  const before = parseProcess(fixture);
  const result = patchProcessForm(fixture, before.process.id, {
    source: 'local',
    cardIndex: 't123',
    uniqueCardVersion: true,
    inheritFormSecurity: true,
    descriptorFields: [
      { id: 'campox', label: 'Campo X' },
      { id: 'aprovador', label: 'Aprovador' }
    ]
  }, { localForms });
  assert.equal(result.validation.ok, true);
  assert.equal(result.model.process.attributes.formSource, 'local');
  assert.equal(result.model.process.attributes.cardIndex, 't123');
  assert.equal(result.model.process.attributes.uniquecardversion, 'true');
  assert.equal(result.model.process.attributes.inheritFormSecurity, 'true');
  assert.deepEqual(descriptorFieldValues(result.model.process.attributes.descriptorFields), [
    { id: 'campox', label: 'Campo X', cardIndex: 't123' },
    { id: 'aprovador', label: 'Aprovador', cardIndex: 't123' }
  ]);
  assert.deepEqual(result.model.flows.map((flow) => flow.id), before.flows.map((flow) => flow.id));
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  assert.match(result.text, /descriptorFields="&lt;list>&#xA;/);
  const second = patchProcessForm(result.text, 'toexportbpmnteste', {
    source: 'local', cardIndex: 't123', uniqueCardVersion: true, inheritFormSecurity: true,
    descriptorFields: [
      { id: 'campox', label: 'Campo X', cardIndex: 't123' },
      { id: 'aprovador', label: 'Aprovador', cardIndex: 't123' }
    ]
  }, { localForms });
  assert.equal(second.changed, false);
});

test('remove flags falsas e descriptorFields vazio', () => {
  const configured = patchProcessForm(fixture, 'toexportbpmnteste', {
    source: 'local', cardIndex: 't123', uniqueCardVersion: true, inheritFormSecurity: true,
    descriptorFields: [{ id: 'campox', label: 'campox' }]
  }, { localForms }).text;
  const result = patchProcessForm(configured, 'toexportbpmnteste', {
    source: 'local', cardIndex: 't123', uniqueCardVersion: false, inheritFormSecurity: false,
    descriptorFields: []
  }, { localForms });
  assert.equal(result.model.process.attributes.uniquecardversion, undefined);
  assert.equal(result.model.process.attributes.inheritFormSecurity, undefined);
  assert.equal(result.model.process.attributes.descriptorFields, undefined);
});

test('aceita formulário de servidor e preserva cardIndex próprio do descritor', () => {
  const result = patchProcessForm(fixture, 'toexportbpmnteste', {
    source: 'server',
    cardIndex: '25110',
    uniqueCardVersion: false,
    inheritFormSecurity: false,
    descriptorFields: [{ id: 'matricula', label: 'Matrícula', cardIndex: '25110 - cadastro' }]
  });
  assert.equal(result.model.process.attributes.formSource, 'server');
  assert.equal(result.model.process.attributes.cardIndex, '25110');
  assert.deepEqual(descriptorFieldValues(result.model.process.attributes.descriptorFields), [
    { id: 'matricula', label: 'Matrícula', cardIndex: '25110 - cadastro' }
  ]);
});

test('recusa mais de 15 descritores, duplicados e campos fora do formulário local', () => {
  const base = { source: 'local', cardIndex: 't123', uniqueCardVersion: false, inheritFormSecurity: false };
  const tooMany = Array.from({ length: MAX_DESCRIPTOR_FIELDS + 1 }, (_, index) => ({ id: `campo${index}`, label: `Campo ${index}` }));
  const maximum = tooMany.slice(0, MAX_DESCRIPTOR_FIELDS);
  assert.equal(patchProcessForm(fixture, 'toexportbpmnteste', {
    source: 'server', cardIndex: '100', uniqueCardVersion: false, inheritFormSecurity: false, descriptorFields: maximum
  }).model.process.attributes.formSource, 'server');
  assert.throws(
    () => patchProcessForm(fixture, 'toexportbpmnteste', { ...base, descriptorFields: tooMany }, { localForms }),
    /no máximo 15/
  );
  assert.throws(
    () => patchProcessForm(fixture, 'toexportbpmnteste', { ...base, descriptorFields: [{ id: 'campox' }, { id: 'campox' }] }, { localForms }),
    /duplicado/
  );
  assert.throws(
    () => patchProcessForm(fixture, 'toexportbpmnteste', { ...base, descriptorFields: [{ id: 'inexistente' }] }, { localForms }),
    /não pertence/
  );
});

test('recusa estrutura XStream desconhecida antes de reserializar', () => {
  const malformed = fixture.replace('extendedFields="&lt;list/>"', 'extendedFields="&lt;list/>" descriptorFields="&lt;list>&lt;outro/>&lt;/list>"');
  assert.throws(() => patchProcessForm(malformed, 'toexportbpmnteste', {
    source: 'local', cardIndex: 't123', uniqueCardVersion: false, inheritFormSecurity: false, descriptorFields: []
  }, { localForms }), /elemento desconhecido/);
});
