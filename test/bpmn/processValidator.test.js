'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { validateProcess } = require('../../src/bpmn/processValidator');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

test('validador aprova a referência real', () => {
  const report = validateProcess(parseProcess(fixture));
  assert.equal(report.ok, true);
  assert.equal(report.errors.length, 0);
});

test('validador detecta tripla inconsistente', () => {
  const broken = fixture.replace('outgoing="flow47"', 'outgoing=""');
  const report = validateProcess(parseProcess(broken));
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'TRIPLA-003'));
});

test('validador detecta condição morta e mais de um fluxo padrão', () => {
  const broken = fixture
    .replace('&lt;targetTask>endevent12&lt;/targetTask>', '&lt;targetTask>task5&lt;/targetTask>')
    .replace('id="flow48" name=""', 'id="flow48" name="" defaultLink="true"');
  const report = validateProcess(parseProcess(broken));
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'COND-002'));
  assert.ok(report.errors.some((item) => item.code === 'COND-006'));
});

test('validador recusa fluxo padrão fora de gateway exclusivo ou inclusivo', () => {
  const broken = fixture.replace(
    /(<bpmn2:SequenceFlow id="flow47"[^>]*)(\/>)/,
    '$1 defaultLink="true"$2'
  );
  const report = validateProcess(parseProcess(broken));
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'COND-007'));
});

test('validador sinaliza intermediate link sem receptor ou com destino incompatível', () => {
  const missing = fixture.replace(' linkId="intermediatelinkreceive29"', '');
  const missingReport = validateProcess(parseProcess(missing));
  assert.equal(missingReport.ok, true);
  assert.ok(missingReport.warnings.some((item) => item.code === 'EVENT-LINK-001'));

  const invalid = fixture.replace('linkId="intermediatelinkreceive29"', 'linkId="intermediateevent22"');
  const invalidReport = validateProcess(parseProcess(invalid));
  assert.equal(invalidReport.ok, true);
  assert.ok(invalidReport.warnings.some((item) => item.code === 'EVENT-LINK-002'));
});
