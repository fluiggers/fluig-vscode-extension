'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchEventTrigger } = require('../../src/bpmn/processPatcher');
const {
  eventTriggerDefinition,
  normalizeEventTriggerRequest,
  parseEventTriggerData,
  triggerScriptConditionFileName
} = require('../../src/bpmn/eventTrigger');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('lê a agenda Quartz dos cinco subtipos compatíveis', () => {
  const model = parseProcess(fixture);
  for (const id of ['startmultiple14', 'starttimer15', 'startconditional16', 'intermediatetimer23', 'intermediateconditional24']) {
    const definition = eventTriggerDefinition(model.elements.find((element) => element.id === id));
    assert.equal(definition.supported, true, id);
    assert.ok(definition.runTypes.some((item) => item.value === definition.runType), id);
    assert.match(definition.time, /^\d{2}:\d{2}:\d{2}$/, id);
  }
  assert.equal(eventTriggerDefinition(model.elements.find((element) => element.id === 'startevent4')), null);
});

test('grava semana do mês e adiciona diaSemana sem reconstruir o processo', () => {
  const result = patchEventTrigger(fixture, 'starttimer15', {
    runType: 'WEEK_MONTH',
    time: '16:37:29',
    frequency: 'Ult.',
    dayOfWeek: 'THU',
    weekdays: []
  });
  const event = result.model.elements.find((element) => element.id === 'starttimer15');
  assert.deepEqual(parseEventTriggerData(event.attributes.trigger), {
    runType: 'WEEK_MONTH',
    time: '16:37:29',
    frequency: 'Ult.',
    dayOfWeek: 'THU',
    weekdays: [],
    scriptCondition: '',
    isCondition: 'false'
  });
  assert.equal(result.validation.ok, true);
  assert.equal(result.patches.length, 1);
  assert.equal(result.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
});

test('grava dias da semana em ordem canônica e preserva script condicional', () => {
  const before = parseProcess(fixture).elements.find((element) => element.id === 'startconditional16');
  const originalScript = parseEventTriggerData(before.attributes.trigger).scriptCondition;
  const result = patchEventTrigger(fixture, 'startconditional16', {
    runType: 'WEEK_DAY',
    time: '07:28:46',
    frequency: '01',
    dayOfWeek: '',
    weekdays: ['SAT', 'MON', 'WED']
  });
  const parsed = parseEventTriggerData(
    result.model.elements.find((element) => element.id === 'startconditional16').attributes.trigger
  );
  assert.equal(parsed.frequency, 'MON,WED,SAT');
  assert.deepEqual(parsed.weekdays, ['MON', 'WED', 'SAT']);
  assert.equal(parsed.dayOfWeek, '');
  assert.equal(parsed.scriptCondition, originalScript);
});

test('valida limites e campos obrigatórios de cada recorrência', () => {
  const minute = normalizeEventTriggerRequest({
    runType: 'MINUTE', time: '05:19:41', frequency: '7'
  });
  assert.equal(minute.frequency, '07');
  assert.equal(minute.time, '0:0:0');
  const hour = normalizeEventTriggerRequest({
    runType: 'HOUR', time: '18:22:33', frequency: '23'
  });
  assert.equal(hour.frequency, '23');
  assert.equal(hour.time, '0:0:0');
  assert.throws(() => normalizeEventTriggerRequest({
    runType: 'MINUTE', time: '00:00:00', frequency: '60'
  }), /frequência inválido/);
  assert.throws(() => normalizeEventTriggerRequest({
    runType: 'WEEK_DAY', time: '08:00:00', weekdays: []
  }), /ao menos um dia/);
  assert.throws(() => normalizeEventTriggerRequest({
    runType: 'WEEK_MONTH', time: '08:00:00', frequency: '5o.', dayOfWeek: 'MON'
  }), /Semana do mês inválida/);
});

test('normaliza horário oculto de minuto e hora como o Eclipse', () => {
  const legacyMinute = fixture.replace(
    '<timeTrigger>0:0:0</timeTrigger>',
    '<timeTrigger>5:19:41</timeTrigger>'
  );
  const minuteResult = patchEventTrigger(legacyMinute, 'starttimer15', {
    runType: 'MINUTE', time: '05:19:41', frequency: '15'
  });
  const minute = parseEventTriggerData(
    minuteResult.model.elements.find((element) => element.id === 'starttimer15').attributes.trigger
  );
  assert.equal(minute.time, '00:00:00');
  assert.equal(minute.frequency, '15');

  const hourResult = patchEventTrigger(fixture, 'starttimer15', {
    runType: 'HOUR', time: '18:22:33', frequency: '06'
  });
  const hour = parseEventTriggerData(
    hourResult.model.elements.find((element) => element.id === 'starttimer15').attributes.trigger
  );
  assert.equal(hour.time, '00:00:00');
  assert.equal(hour.frequency, '06');
});

test('recusa agenda em subtipo incompatível e trigger corrompido', () => {
  assert.throws(
    () => patchEventTrigger(fixture, 'startevent4', {
      runType: 'MINUTE', time: '00:00:00', frequency: '01'
    }),
    /não aceita agenda Quartz/
  );
  const broken = fixture.replace(
    /(<bpmn2:BpmnStartEvent id="starttimer15"[^>]*?) trigger="[^"]*"/,
    '$1 trigger="&lt;invalido/>"'
  );
  assert.throws(
    () => patchEventTrigger(broken, 'starttimer15', {
      runType: 'MINUTE', time: '00:00:00', frequency: '01'
    }),
    /Bloco trigger inválido/
  );
});

test('localiza script condicional sem bloquear eventos sem trigger ou com trigger corrompido', () => {
  const conditional = parseProcess(fixture).elements.find((element) => element.id === 'startconditional16');
  assert.equal(
    triggerScriptConditionFileName(conditional.attributes.trigger),
    parseEventTriggerData(conditional.attributes.trigger).scriptCondition.trim()
  );
  assert.equal(triggerScriptConditionFileName(undefined), '');
  assert.equal(triggerScriptConditionFileName(''), '');
  assert.equal(triggerScriptConditionFileName('<outraRaiz/>'), '');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(provider, /triggerScriptConditionFileName\(element\.attributes\.trigger\)/);
});

test('cria o bloco trigger ao configurar evento novo sem agenda materializada', () => {
  const withoutTrigger = fixture.replace(
    /(<bpmn2:BpmnStartEvent id="starttimer15"[^>]*?) trigger="[^"]*"/,
    '$1'
  );
  const result = patchEventTrigger(withoutTrigger, 'starttimer15', {
    runType: 'MINUTE', time: '00:00:00', frequency: '05'
  });
  const event = result.model.elements.find((element) => element.id === 'starttimer15');
  assert.equal(parseEventTriggerData(event.attributes.trigger).frequency, '05');
  assert.equal(eventTriggerDefinition(event).supported, true);
  assert.equal(result.validation.ok, true);
});
