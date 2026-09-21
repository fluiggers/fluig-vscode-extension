'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchProcessVersion } = require('../../src/bpmn/processPatcher');
const { processVersionDefinition } = require('../../src/bpmn/processVersion');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('expõe a categoria Versão com os mesmos campos do Eclipse', () => {
  const process = parseProcess(fixture).process;
  assert.deepEqual(processVersionDefinition(process), {
    supported: true,
    version: '1',
    instructions: '',
    updateAttachment: false,
    confirmPassword: false,
    mobileProcess: false
  });
});

test('grava instruções e opções da versão preservando ASCII, CRLF e estrutura', () => {
  const process = parseProcess(fixture).process;
  const result = patchProcessVersion(fixture, process.id, {
    instructions: 'Linha 1\nLinha 2',
    updateAttachment: true,
    confirmPassword: true,
    mobileProcess: true
  });
  assert.equal(result.validation.ok, true);
  assert.equal(result.model.process.attributes.descriptionVersion, 'Linha 1\r\nLinha 2');
  assert.equal(result.model.process.attributes.updateAttachment, 'true');
  assert.equal(result.model.process.attributes.counterSign, 'true');
  assert.equal(result.model.process.attributes.mobileReady, 'true');
  assert.equal(result.model.process.attributes.version, '1');
  assert.equal(result.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(result.text), false);
});

test('remove opções desmarcadas e é idempotente', () => {
  const configured = patchProcessVersion(fixture, 'toexportbpmnteste', {
    instructions: 'Teste',
    updateAttachment: true,
    confirmPassword: true,
    mobileProcess: true
  }).text;
  const result = patchProcessVersion(configured, 'toexportbpmnteste', {
    instructions: '',
    updateAttachment: false,
    confirmPassword: false,
    mobileProcess: false
  });
  assert.equal(result.model.process.attributes.descriptionVersion, '');
  assert.equal(result.model.process.attributes.updateAttachment, undefined);
  assert.equal(result.model.process.attributes.counterSign, undefined);
  assert.equal(result.model.process.attributes.mobileReady, undefined);
  assert.equal(patchProcessVersion(result.text, 'toexportbpmnteste', {
    instructions: '',
    updateAttachment: false,
    confirmPassword: false,
    mobileProcess: false
  }).changed, false);
});

test('recusa elemento que não é o processo', () => {
  assert.throws(
    () => patchProcessVersion(fixture, 'task5', {}),
    /Processo não encontrado/
  );
});
