'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchProcessGeneral, patchProcessIdentity, patchProcess } = require('../../src/bpmn/processPatcher');
const { processGeneralDefinition } = require('../../src/bpmn/processGeneral');
const { triggerScriptConditionFileName } = require('../../src/bpmn/eventTrigger');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const catalogs = {
  volumeCatalog: [{ value: 'Default', label: 'Default' }, { value: 'GED', label: 'GED' }],
  expedientCatalog: [{ value: 'Default', label: 'Default' }, { value: '24x7', label: '24x7' }],
  serverCatalog: [{ value: 'future', label: 'Future' }, { value: 'homologacao', label: 'Homologação' }]
};

test('define o editor geral com identificadores e catálogos', () => {
  const process = parseProcess(fixture).process;
  const editor = processGeneralDefinition(process, catalogs.volumeCatalog, catalogs.expedientCatalog, catalogs.serverCatalog);
  assert.equal(editor.code, 'toexportbpmnteste');
  assert.equal(editor.serverId, 'future');
  assert.equal(editor.version, '1');
  assert.equal(editor.description, 'toexportbpmnteste');
  assert.equal(editor.volume, 'Default');
  assert.equal(editor.expedient, 'Default');
  assert.equal(editor.deadlineTime, '000:00');
  assert.equal(editor.warningTime, '000:00');
  assert.equal(editor.active, true);
  assert.equal(editor.publicProcess, false);
  assert.equal(editor.activeProcessLegacy, '');
  assert.equal(editor.publicProcessLegacy, '');
  assert.deepEqual(editor.complements, {
    enabled: true,
    level: '1',
    legacyLevel: '',
    notifyResponsible: true,
    notifyRequisitioner: true,
    notifyManager: false
  });
  assert.deepEqual(editor.volumeOptions, catalogs.volumeCatalog);
  assert.deepEqual(editor.expedientOptions, catalogs.expedientCatalog);
  assert.deepEqual(editor.serverOptions, catalogs.serverCatalog);
});

test('edita codigo, servidor e propriedades gerais sem alterar fluxos, ASCII ou CRLF', () => {
  const before = parseProcess(fixture);
  const result = patchProcessGeneral(fixture, before.process.id, {
    code: 'processo_viagem',
    serverId: 'homologacao',
    description: 'Processo de ação',
    instruction: 'Linha 1\nLinha 2',
    category: 'Viagens',
    volume: 'GED',
    expedient: '24x7',
    deadlineTime: '045:00',
    warningTime: '036:00'
  }, catalogs);
  const process = result.model.process;
  assert.equal(process.attributes.name, 'Processo de ação');
  assert.equal(process.attributes.instruction, 'Linha 1\r\nLinha 2');
  assert.equal(process.attributes.category, 'Viagens');
  assert.equal(process.attributes.volume, 'GED');
  assert.equal(process.attributes.expedient, '24x7');
  assert.equal(process.attributes.id, 'processo_viagem');
  assert.equal(process.attributes.serverId, 'homologacao');
  assert.equal(process.attributes.deadlineTime, '2700.0');
  assert.equal(process.attributes.warningTime, '2160.0');
  assert.equal(process.attributes.version, before.process.attributes.version);
  assert.deepEqual(result.model.flows.map((flow) => flow.id), before.flows.map((flow) => flow.id));
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  assert.match(result.text, /Processo de a&#xe7;&#xe3;o/);
});

test('renomeia somente a identidade interna e mantem o diagrama estruturalmente valido', () => {
  const result = patchProcessIdentity(fixture, 'toexportbpmnteste', 'processo_viagem');
  assert.equal(result.model.process.id, 'processo_viagem');
  assert.equal(result.model.diagram.attributeMap.name.value, 'processo_viagem');
  assert.equal(result.validation.ok, true);
  assert.equal(result.model.flows.length, parseProcess(fixture).flows.length);
  // Like Fluig Studio, script references inside the .process follow the renamed script files.
  const renamed = new Map(result.model.elements.map((element) => [element.id, element]));
  assert.equal(renamed.get('servicetask11').attributes.scriptFileName, 'processo_viagem.servicetask11.js');
  assert.equal(renamed.get('businessruletask33').attributes.scriptFileName, 'processo_viagem.businessruletask33.js');
  assert.equal(renamed.get('scripttask34').attributes.scriptFileName, 'processo_viagem.scripttask34.js');
  assert.equal(triggerScriptConditionFileName(renamed.get('startconditional16').attributes.trigger), 'processo_viagem.startconditional16.js');
  assert.equal(triggerScriptConditionFileName(renamed.get('intermediateconditional24').attributes.trigger), 'processo_viagem.intermediateconditional24.js');
  assert.doesNotMatch(result.text, /toexportbpmnteste\.\w+\.js/);
  assert.equal(patchProcessIdentity(result.text, 'processo_viagem', 'processo_viagem').changed, false);
  assert.throws(
    () => patchProcessIdentity(fixture, 'toexportbpmnteste', 'TOEXPORTBPMNTESTE'),
    /maiusculas e minusculas/
  );
});

test('remove prazos zerados e recusa duracao invalida', () => {
  const configured = fixture.replace(
    '<bpmn2:BpmnProcess ',
    '<bpmn2:BpmnProcess deadlineTime="2700.0" warningTime="2160.0" '
  );
  const result = patchProcessGeneral(configured, 'toexportbpmnteste', {
    description: 'toexportbpmnteste',
    volume: 'Default',
    expedient: 'Default',
    deadlineTime: '000:00',
    warningTime: '000:00'
  }, catalogs);
  assert.equal(result.model.process.attributes.deadlineTime, undefined);
  assert.equal(result.model.process.attributes.warningTime, undefined);
  assert.throws(() => patchProcessGeneral(fixture, 'toexportbpmnteste', {
    description: 'Teste', volume: 'Default', expedient: 'Default', deadlineTime: '1:99', warningTime: '000:00'
  }, catalogs), /formato HHH:mm/);
});

test('configura complementos com os atributos exatos do Fluig Studio', () => {
  const result = patchProcessGeneral(fixture, 'toexportbpmnteste', {
    description: 'toexportbpmnteste',
    volume: 'Default',
    expedient: 'Default',
    complements: {
      enabled: true,
      level: '2',
      notifyResponsible: true,
      notifyRequisitioner: false,
      notifyManager: true
    }
  }, catalogs);
  const attributes = result.model.process.attributes;
  assert.equal(attributes.complementsLevel, '2');
  assert.equal(attributes.notifyResponsibleComplements, 'true');
  assert.equal(attributes.notifyRequisitionerComplements, undefined);
  assert.equal(attributes.notifyManagerComplements, 'true');
  assert.equal(result.validation.ok, true);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
  assert.equal(patchProcessGeneral(result.text, 'toexportbpmnteste', {
    description: 'toexportbpmnteste',
    volume: 'Default',
    expedient: 'Default',
    complements: {
      enabled: true,
      level: '2',
      notifyResponsible: true,
      notifyRequisitioner: false,
      notifyManager: true
    }
  }, catalogs).changed, false);
});

test('desabilita complementos sem apagar preferencias ocultas e preserva nivel legado', () => {
  const disabled = patchProcessGeneral(fixture, 'toexportbpmnteste', {
    description: 'toexportbpmnteste',
    volume: 'Default',
    expedient: 'Default',
    complements: {
      enabled: false,
      level: '1',
      notifyResponsible: false,
      notifyRequisitioner: false,
      notifyManager: false
    }
  }, catalogs);
  assert.equal(disabled.model.process.attributes.complementsLevel, undefined);
  assert.equal(disabled.model.process.attributes.notifyResponsibleComplements, 'true');
  assert.equal(disabled.model.process.attributes.notifyRequisitionerComplements, 'true');
  assert.equal(disabled.model.process.attributes.notifyManagerComplements, undefined);

  const legacyText = fixture.replace('complementsLevel="1"', 'complementsLevel="9"');
  const legacy = processGeneralDefinition(parseProcess(legacyText).process);
  assert.equal(legacy.complements.legacyLevel, '9');
  assert.equal(patchProcessGeneral(legacyText, 'toexportbpmnteste', {
    description: 'toexportbpmnteste',
    volume: 'Default',
    expedient: 'Default',
    complements: {
      enabled: true,
      level: '9',
      notifyResponsible: true,
      notifyRequisitioner: true,
      notifyManager: false
    }
  }, catalogs).changed, false);
});

test('serializa ativo e publico exatamente como o Fluig Studio', () => {
  const before = parseProcess(fixture);
  const inactivePublic = patchProcessGeneral(fixture, 'toexportbpmnteste', {
    description: 'toexportbpmnteste',
    volume: 'Default',
    expedient: 'Default',
    active: false,
    activeTouched: true,
    publicProcess: true,
    publicTouched: true
  }, catalogs);
  assert.equal(inactivePublic.model.process.attributes.activeProcess, 'false');
  assert.equal(inactivePublic.model.process.attributes.publicProcess, 'true');
  assert.equal(inactivePublic.validation.ok, true);
  assert.deepEqual(inactivePublic.model.flows.map((flow) => flow.id), before.flows.map((flow) => flow.id));
  assert.equal(inactivePublic.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(inactivePublic.text), false);

  const defaults = patchProcessGeneral(inactivePublic.text, 'toexportbpmnteste', {
    description: 'toexportbpmnteste',
    volume: 'Default',
    expedient: 'Default',
    active: true,
    activeTouched: true,
    publicProcess: false,
    publicTouched: true
  }, catalogs);
  assert.equal(defaults.model.process.attributes.activeProcess, undefined);
  assert.equal(defaults.model.process.attributes.publicProcess, undefined);
  assert.equal(defaults.validation.ok, true);
  assert.equal(patchProcessGeneral(defaults.text, 'toexportbpmnteste', {
    description: 'toexportbpmnteste',
    volume: 'Default',
    expedient: 'Default',
    active: true,
    activeTouched: true,
    publicProcess: false,
    publicTouched: true
  }, catalogs).changed, false);
});

test('preserva estados legados de ativo e publico ate alteracao humana', () => {
  const legacyText = fixture.replace(
    '<bpmn2:BpmnProcess ',
    '<bpmn2:BpmnProcess activeProcess="true" publicProcess="false" '
  );
  const legacyProcess = parseProcess(legacyText).process;
  const editor = processGeneralDefinition(legacyProcess);
  assert.equal(editor.active, true);
  assert.equal(editor.publicProcess, false);
  assert.equal(editor.activeProcessLegacy, 'true');
  assert.equal(editor.publicProcessLegacy, 'false');

  const untouched = patchProcessGeneral(legacyText, legacyProcess.id, {
    description: legacyProcess.name,
    volume: legacyProcess.attributes.volume,
    expedient: legacyProcess.attributes.expedient,
    category: 'Categoria alterada',
    active: true,
    activeTouched: false,
    publicProcess: false,
    publicTouched: false
  });
  assert.equal(untouched.model.process.attributes.activeProcess, 'true');
  assert.equal(untouched.model.process.attributes.publicProcess, 'false');

  const touched = patchProcessGeneral(untouched.text, legacyProcess.id, {
    description: legacyProcess.name,
    volume: legacyProcess.attributes.volume,
    expedient: legacyProcess.attributes.expedient,
    category: 'Categoria alterada',
    active: true,
    activeTouched: true,
    publicProcess: false,
    publicTouched: true
  });
  assert.equal(touched.model.process.attributes.activeProcess, undefined);
  assert.equal(touched.model.process.attributes.publicProcess, undefined);
});

test('preserva valor legado atual, recusa valor desconhecido novo e descrição vazia', () => {
  const legacyText = fixture.replace('volume="Default"', 'volume="Legado"');
  const legacyProcess = parseProcess(legacyText).process;
  const definition = processGeneralDefinition(legacyProcess, catalogs.volumeCatalog, catalogs.expedientCatalog);
  assert.deepEqual(definition.volumeOptions.at(-1), { value: 'Legado', label: 'Legado (valor atual)' });
  assert.equal(patchProcessGeneral(legacyText, legacyProcess.id, {
    description: legacyProcess.name,
    instruction: legacyProcess.attributes.instruction,
    category: legacyProcess.attributes.category,
    volume: 'Legado',
    expedient: 'Default'
  }, catalogs).changed, false);
  assert.throws(() => patchProcessGeneral(fixture, 'toexportbpmnteste', {
    description: 'Teste', volume: 'Inexistente', expedient: 'Default'
  }, catalogs), /não foi encontrado/);
  assert.throws(() => patchProcessGeneral(fixture, 'toexportbpmnteste', {
    description: ' ', volume: 'Default', expedient: 'Default'
  }, catalogs), /descrição/);
});

test('não permite mais editar a descrição do processo pelo editor genérico', () => {
  assert.throws(
    () => patchProcess(fixture, 'toexportbpmnteste', { name: 'Duplicado' }),
    /não pode ser editada/
  );
});
