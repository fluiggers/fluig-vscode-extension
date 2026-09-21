'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const { createIsolatedNode } = require('../../src/bpmn/processPatcher.ts');
const { buildProcessScaffold } = require('../../src/bpmn/processScaffold.ts');
const { parseProperties, LOCALES } = require('../../src/bpmn/translationService.ts');

const fixturePath = path.join(__dirname, 'fixtures', 'toexportbpmnteste.process.gz.b64');
const templateText = zlib.gunzipSync(
  Buffer.from(fs.readFileSync(fixturePath, 'utf8').trim(), 'base64')
).toString('utf8');

test('cria processo vazio valido e tres traducoes canonicas a partir do template', () => {
  const result = buildProcessScaffold(templateText, 'novo_processo', {
    translationOptions: { date: new Date(2026, 7, 29, 13, 46, 22) }
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.model.diagram.attributeMap.name.value, 'novo_processo');
  assert.equal(result.model.process.id, 'novo_processo');
  assert.equal(result.model.process.name, 'novo_processo');
  assert.equal(result.model.process.attributes.version, '1');
  assert.equal(result.model.process.attributes.serverId, undefined);
  assert.equal(result.model.process.attributes.cardIndex, undefined);
  assert.equal(result.model.process.attributes.formSource, undefined);
  assert.equal(result.model.elements.length, 1);
  assert.equal(result.model.shapes.length, 0);
  assert.equal(result.model.connections.length, 0);
  assert.equal(result.model.flows.length, 0);
  assert.match(result.text, /^<\?xml version="1\.0" encoding="ASCII"\?>\r\n/);
  assert.doesNotMatch(result.text, /\spictogramLinks="/);

  assert.deepEqual([...result.translationPlan.files.keys()], LOCALES);
  for (const locale of LOCALES) {
    const file = result.translationPlan.files.get(locale);
    const values = parseProperties(file.content).values;
    assert.equal(values.get('process.category'), '');
    assert.equal(values.get('process.description'), 'novo_processo');
    assert.equal(values.get('process.instructions'), '');
    assert.ok(file.content.endsWith('\r\n'));
  }
});

test('processo novo aceita o primeiro elemento usando o catalogo visual empacotado', () => {
  const scaffold = buildProcessScaffold(templateText, 'primeiro_fluxo');
  const created = createIsolatedNode(scaffold.text, {
    kind: 'start', subtype: '10', x: 100, y: 100, templateText
  });
  assert.equal(created.validation.ok, true);
  assert.equal(created.model.shapes.length, 1);
  assert.equal(created.model.elements.some((item) => item.tag === 'BpmnStartEvent'), true);
});

test('recusa codigo inseguro antes de gerar qualquer arquivo', () => {
  assert.throws(
    () => buildProcessScaffold(templateText, '../processo'),
    /codigo de processo valido/
  );
});
