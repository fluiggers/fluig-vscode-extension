'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const {
  CANONICAL_KEYS,
  LOCALES,
  buildTranslationPlan,
  parseProperties,
  serializeProperties,
  validateTranslationPlan
} = require('../../src/bpmn/translationService');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const model = parseProcess(fixture);
const fixedDate = new Date(2026, 7, 25, 17, 11, 33);

test('gera os três arquivos com chaves canônicas, paridade e CRLF', () => {
  const plan = buildTranslationPlan(model, {}, { date: fixedDate });
  assert.equal(plan.processId, 'toexportbpmnteste');
  assert.deepEqual([...plan.files.keys()], LOCALES);
  for (const file of plan.files.values()) {
    assert.equal(file.existed, false);
    assert.equal(file.changed, true);
    assert.deepEqual([...parseProperties(file.content).values.keys()], CANONICAL_KEYS);
    assert.equal(parseProperties(file.content).values.get('process.description'), 'toexportbpmnteste');
    assert.match(file.content, /\r\n/);
    assert.doesNotMatch(file.content.replaceAll('\r\n', ''), /\n/);
  }
});

test('validador rejeita locale com conjunto de chaves divergente', () => {
  const plan = buildTranslationPlan(model, {}, { date: fixedDate });
  plan.files.get('es').content = '#quebrado\r\nprocess.description=teste\r\n';
  const validation = validateTranslationPlan(plan);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(' '), /es/);
});

test('preserva traduções, completa chaves ausentes e propaga órfãs entre idiomas', () => {
  const existing = {
    pt_BR: '#antigo\r\nprocess.description=Descri\\u00e7\\u00e3o\r\nchave.legada=valor local\r\n',
    en_US: '#old\r\nprocess.category=Finance\r\nprocess.description=Description\r\nprocess.instructions=Read me\r\n',
    es: '#viejo\r\nprocess.category=Finanzas\r\nprocess.description=Descripci\\u00f3n\r\nprocess.instructions=Leer\r\n'
  };
  const plan = buildTranslationPlan(model, existing, { date: fixedDate });
  const pt = parseProperties(plan.files.get('pt_BR').content).values;
  const en = parseProperties(plan.files.get('en_US').content).values;
  assert.equal(pt.get('process.description'), 'Descrição');
  assert.equal(en.get('process.description'), 'Description');
  assert.equal(pt.get('chave.legada'), 'valor local');
  assert.equal(en.get('chave.legada'), '');
  assert.deepEqual(plan.orphanKeys, ['chave.legada']);
  for (const file of plan.files.values()) {
    assert.deepEqual([...parseProperties(file.content).values.keys()], [...CANONICAL_KEYS, 'chave.legada']);
  }
});

test('segunda geração é idempotente e não troca o cabeçalho de data', () => {
  const first = buildTranslationPlan(model, {}, { date: fixedDate });
  const existing = Object.fromEntries(LOCALES.map((locale) => [locale, first.files.get(locale).content]));
  const second = buildTranslationPlan(model, existing, { date: new Date(2027, 0, 2, 3, 4, 5) });
  for (const locale of LOCALES) {
    assert.equal(second.files.get(locale).changed, false);
    assert.equal(second.files.get(locale).content, existing[locale]);
  }
});

test('serialização Java Properties preserva acentos e caracteres especiais no round-trip', () => {
  const values = new Map([
    ['chave com espaço', 'Ação: aprovação = sim'],
    ['multilinha', 'linha 1\nlinha 2']
  ]);
  const content = serializeProperties(values, { date: fixedDate });
  const parsed = parseProperties(content).values;
  assert.match(content, /chave\\ com\\ espa\\u00e7o=/);
  assert.match(content, /A\\u00e7\\u00e3o/);
  assert.equal(parsed.get('chave com espaço'), 'Ação: aprovação = sim');
  assert.equal(parsed.get('multilinha'), 'linha 1\nlinha 2');
});
