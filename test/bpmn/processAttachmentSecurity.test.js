'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchProcessAttachmentSecurity } = require('../../src/bpmn/processPatcher');
const {
  parseProcessAttachmentSecurity,
  processAttachmentSecurityDefinition,
  serializeProcessAttachmentSecurity
} = require('../../src/bpmn/processAttachmentSecurity');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const eclipseSecurityXml = [
  '<list>',
  '  <org.eclipse.bpmn2.ECMProcessAttachmentSecurityImpl>',
  '    <companyId>1</companyId>',
  '    <processId>toexportbpmnteste</processId>',
  '    <version>1</version>',
  '    <sequence>1</sequence>',
  '    <engineAllocationId>Usuário</engineAllocationId>',
  '    <engineAllocationConfiguration class="org.eclipse.bpmn2.impl.AssignmentControllerColleague">',
  '      <colleagueId>daniel.sales</colleagueId>',
  '      <mechanismName>Usuário</mechanismName>',
  '    </engineAllocationConfiguration>',
  '    <accessLevel>PRMOED</accessLevel>',
  '    <editionMode>true</editionMode>',
  '  </org.eclipse.bpmn2.ECMProcessAttachmentSecurityImpl>',
  '</list>'
].join('\n');

function definition(text, mechanismCatalog = []) {
  const model = parseProcess(text);
  const byId = new Map([...model.elements, ...model.flows].map((element) => [element.id, element]));
  return processAttachmentSecurityDefinition(model.process, byId, ['campox'], mechanismCatalog);
}

test('interpreta a segurança de anexos criada pelo Eclipse', () => {
  const editor = processAttachmentSecurityDefinition({
    tag: 'BpmnProcess',
    attributes: {
      controlsAttachmentsSecurity: 'true',
      processAttachmentSecurity: eclipseSecurityXml
    }
  }, new Map(), ['campox'], [], [
    { value: 'daniel.sales', label: 'Daniel Sales (daniel.sales)' },
    { value: 'suporte', label: 'Suporte Prime Club (suporte)' }
  ], [
    { value: 'analista_sistemas', label: 'Analista de Sistemas (analista_sistemas)' }
  ]);
  assert.equal(editor.controlled, true);
  assert.equal(editor.rules.length, 1);
  assert.equal(editor.rules[0].mechanism, 'Usuário');
  assert.equal(editor.rules[0].mechanismConfiguration.className, 'AssignmentControllerColleague');
  assert.equal(editor.rules[0].mechanismConfiguration.colleagueId, 'daniel.sales');
  assert.deepEqual(editor.userCatalog.map((user) => user.value), ['daniel.sales', 'suporte']);
  assert.deepEqual(editor.roleCatalog.map((role) => role.value), ['analista_sistemas']);
  assert.equal(serializeProcessAttachmentSecurity(editor.rules), eclipseSecurityXml);
  assert.deepEqual(editor.rules[0].permissions, {
    publish: true,
    readOthers: true,
    editOwn: true,
    editOthers: true,
    removeOwn: true,
    removeOthers: true
  });
});

test('grava várias regras, permissões e mecanismos no formato XStream do Eclipse', () => {
  const requested = {
    controlled: true,
    rules: [
      {
        companyId: 1,
        mechanism: 'Usuário',
        mechanismConfiguration: { colleagueId: 'daniel.sales' },
        permissions: { publish: true, readOthers: true, editOwn: true }
      },
      {
        companyId: 1,
        mechanism: 'Grupo',
        mechanismConfiguration: { groupId: 'TODOS' },
        permissions: { editOthers: true, removeOwn: true, removeOthers: true }
      }
    ]
  };
  const result = patchProcessAttachmentSecurity(fixture, 'toexportbpmnteste', requested);
  const process = result.model.process;
  const rules = parseProcessAttachmentSecurity(process.attributes.processAttachmentSecurity);
  assert.equal(result.validation.ok, true);
  assert.equal(process.attributes.controlsAttachmentsSecurity, 'true');
  assert.equal(rules.length, 2);
  assert.equal(rules[0].sequence, 1);
  assert.equal(rules[1].sequence, 2);
  assert.match(process.attributes.processAttachmentSecurity, /<accessLevel>PRM<\/accessLevel>/);
  assert.match(process.attributes.processAttachmentSecurity, /<accessLevel>OED<\/accessLevel>/);
  assert.match(process.attributes.processAttachmentSecurity, /engineAllocationConfiguration class="org\.eclipse\.bpmn2\.impl\.AssignmentControllerGroup"/);
  assert.equal(result.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  assert.equal(patchProcessAttachmentSecurity(result.text, 'toexportbpmnteste', requested).changed, false);
});

test('desativar o controle remove a lista e preserva a estrutura do processo', () => {
  const result = patchProcessAttachmentSecurity(fixture, 'toexportbpmnteste', {
    controlled: false,
    rules: []
  });
  assert.equal(result.model.process.attributes.controlsAttachmentsSecurity, undefined);
  assert.equal(result.model.process.attributes.processAttachmentSecurity, undefined);
  assert.equal(result.validation.ok, true);
});

test('recusa payload desconhecido, lista inválida, mecanismo vazio e elemento incompatível', () => {
  assert.throws(() => parseProcessAttachmentSecurity('<list><desconhecido/></list>'), /elemento desconhecido/);
  assert.throws(
    () => patchProcessAttachmentSecurity(fixture, 'toexportbpmnteste', { controlled: true }),
    /lista de segurança/
  );
  assert.throws(
    () => patchProcessAttachmentSecurity(fixture, 'toexportbpmnteste', {
      controlled: true,
      rules: [{ mechanism: '', permissions: {} }]
    }),
    /Selecione o mecanismo/
  );
  assert.throws(
    () => patchProcessAttachmentSecurity(fixture, 'task5', { controlled: false, rules: [] }),
    /Processo não encontrado/
  );
});
