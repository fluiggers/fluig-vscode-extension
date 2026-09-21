'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchTaskNotifications } = require('../../src/bpmn/processPatcher');
const { taskNotificationsDefinition } = require('../../src/bpmn/taskNotifications');

const references = path.join(__dirname, 'fixtures', 'referencias');

function reference(number) {
  const folder = fs.readdirSync(references).find((name) => name.startsWith(`etapa-${number}-`));
  return fs.readFileSync(path.join(references, folder, 'toexportbpmnteste.process'), 'ascii');
}

function definition(number) {
  const task = parseProcess(reference(number)).elements.find((element) => element.id === 'task5');
  return taskNotificationsDefinition(task);
}

test('interpreta acompanhamento e atraso dos snapshots Eclipse', () => {
  assert.deepEqual(
    [38, 39, 40, 41].map((number) => {
      const item = definition(number);
      return [item.notifyResponsible, item.notifyRequester];
    }),
    [[true, false], [true, true], [false, true], [false, false]]
  );
  const responsible = definition(42);
  assert.equal(responsible.lateResponsible, true);
  assert.equal(responsible.lateRequester, false);
  assert.deepEqual(
    [responsible.lateResponsibleTolerance, responsible.lateResponsibleFrequency, responsible.lateResponsibleExpiration],
    ['002:03', '004:05', '006:07']
  );
  const both = definition(43);
  assert.equal(both.lateRequester, true);
  assert.deepEqual(
    [both.lateRequesterTolerance, both.lateRequesterFrequency, both.lateRequesterExpiration],
    ['008:09', '010:11', '012:13']
  );
  assert.equal(definition(44).lateResponsible, false);
  assert.equal(definition(45).lateRequester, false);
});

test('os oito snapshots Eclipse são idempotentes', () => {
  for (let number = 38; number <= 45; number += 1) {
    const text = reference(number);
    const current = definition(number);
    const result = patchTaskNotifications(text, 'task5', current);
    assert.equal(result.changed, false, `etapa ${number}`);
    assert.equal(result.text, text, `texto da etapa ${number}`);
  }
});

test('grava flags e tempos no formato canônico preservando valores desativados', () => {
  const configured = patchTaskNotifications(reference(41), 'task5', {
    notifyResponsible: true,
    notifyRequester: true,
    lateResponsible: true,
    lateResponsibleTolerance: '002:03',
    lateResponsibleFrequency: '004:05',
    lateResponsibleExpiration: '006:07',
    lateRequester: true,
    lateRequesterTolerance: '008:09',
    lateRequesterFrequency: '010:11',
    lateRequesterExpiration: '012:13'
  });
  const attributes = configured.model.elements.find((element) => element.id === 'task5').attributes;
  assert.equal(attributes.authNotify, 'true');
  assert.equal(attributes.notificaRequisitante, 'true');
  assert.equal(attributes.emAtrasoNotificarResponsavel, undefined);
  assert.equal(attributes.emAtrasoNotificarResponsavelTolerancia, '123.0');
  assert.equal(attributes.emAtrasoNotificarResponsavelFrequencia, '245.0');
  assert.equal(attributes.noticeExpirationAuthorityTime, '367.0');
  assert.equal(attributes.emAtrasoNotificarRequisitante, 'true');
  assert.equal(attributes.emAtrasoNotificarRequisitanteTolerancia, '489.0');
  assert.equal(attributes.emAtrasoNotificarRequisitanteFrequencia, '611.0');
  assert.equal(attributes.noticeExpirationRequisitionerTime, '733.0');
  assert.equal(configured.validation.ok, true);
  assert.equal(configured.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(configured.text), false);

  const disabled = patchTaskNotifications(configured.text, 'task5', {
    notifyResponsible: false,
    notifyRequester: false,
    lateResponsible: false,
    lateResponsibleTolerance: '002:03',
    lateResponsibleFrequency: '004:05',
    lateResponsibleExpiration: '006:07',
    lateRequester: false,
    lateRequesterTolerance: '008:09',
    lateRequesterFrequency: '010:11',
    lateRequesterExpiration: '012:13'
  });
  const disabledAttributes = disabled.model.elements.find((element) => element.id === 'task5').attributes;
  assert.equal(disabledAttributes.authNotify, undefined);
  assert.equal(disabledAttributes.notificaRequisitante, undefined);
  assert.equal(disabledAttributes.emAtrasoNotificarResponsavel, 'false');
  assert.equal(disabledAttributes.emAtrasoNotificarRequisitante, undefined);
  assert.equal(disabledAttributes.emAtrasoNotificarRequisitanteTolerancia, '489.0');
});

test('recusa elemento incompatível e duração inválida', () => {
  const configuration = {
    notifyResponsible: false,
    notifyRequester: false,
    lateResponsible: true,
    lateResponsibleTolerance: 'errado',
    lateResponsibleFrequency: '000:00',
    lateResponsibleExpiration: '000:00',
    lateRequester: false,
    lateRequesterTolerance: '000:00',
    lateRequesterFrequency: '000:00',
    lateRequesterExpiration: '000:00'
  };
  assert.throws(() => patchTaskNotifications(reference(41), 'task5', configuration), /Duração inválida/);
  assert.throws(() => patchTaskNotifications(reference(41), 'startevent4', configuration), /não aceita acompanhamento/);
});
