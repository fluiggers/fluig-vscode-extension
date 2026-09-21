'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchEventInitializer } = require('../../src/bpmn/processPatcher');
const {
  eventInitializerDefinition,
  parseInitializerConfiguration
} = require('../../src/bpmn/eventInitializer');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('lê o inicializador dos quatro inícios compatíveis', () => {
  const model = parseProcess(fixture);
  for (const id of ['starttimer15', 'startsignal13', 'startmultiple14']) {
    const definition = eventInitializerDefinition(model.elements.find((element) => element.id === id), []);
    assert.equal(definition.supported, true, id);
    assert.equal(definition.userId, 'daniel.sales', id);
  }
  const emptyConditional = eventInitializerDefinition(
    model.elements.find((element) => element.id === 'startconditional16'),
    []
  );
  assert.equal(emptyConditional.supported, true);
  assert.equal(emptyConditional.userId, '');
  assert.equal(eventInitializerDefinition(model.elements.find((element) => element.id === 'startevent4'), []), null);
});

test('grava e remove inicializador preservando ASCII CRLF e estrutura', () => {
  const changed = patchEventInitializer(fixture, 'starttimer15', { userId: 'fluigapi-post' });
  const event = changed.model.elements.find((element) => element.id === 'starttimer15');
  assert.equal(parseInitializerConfiguration(event.attributes.initializerConfiguration).userId, 'fluigapi-post');
  assert.equal(changed.validation.ok, true);
  assert.equal(changed.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(changed.text), false);

  const removed = patchEventInitializer(changed.text, 'starttimer15', { userId: '' });
  assert.equal(removed.model.elements.find((element) => element.id === 'starttimer15').attributes.initializerConfiguration, undefined);
  assert.equal(removed.validation.ok, true);
});

test('materializa inicializador ausente e recusa subtipo ou configuração incompatível', () => {
  const withoutInitializer = fixture.replace(
    /(<bpmn2:BpmnStartEvent id="starttimer15"[^>]*?) initializerConfiguration="[^"]*"/,
    '$1'
  );
  const created = patchEventInitializer(withoutInitializer, 'starttimer15', { userId: 'daniel.sales' });
  assert.equal(
    parseInitializerConfiguration(created.model.elements.find((element) => element.id === 'starttimer15').attributes.initializerConfiguration).userId,
    'daniel.sales'
  );
  assert.throws(() => patchEventInitializer(fixture, 'startevent4', { userId: 'daniel.sales' }), /não aceita inicializador/);
  assert.throws(() => patchEventInitializer(fixture, 'starttimer15', { userId: 'invalido\nusuario' }), /inválido/);
});
