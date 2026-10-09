'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { forbidsDefaultFlow, validateProcess } = require('../../src/bpmn/processValidator');

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

function withDefaultLink(text, flowId) {
  const opening = `<bpmn2:SequenceFlow id="${flowId}"`;
  assert.ok(text.includes(opening), `fixture sem ${flowId}`);
  return text.replace(opening, `${opening} defaultLink="true"`);
}

test('validador aceita sem aviso fluxo padrão nas origens que o Fluig Studio aceita', () => {
  for (const flowId of ['flow46', 'flow47']) { // início 10 e tarefa 80
    const report = validateProcess(parseProcess(withDefaultLink(fixture, flowId)));
    assert.equal(report.findings.some((item) => item.code === 'COND-007'), false, flowId);
  }
});

test('validador alerta sem bloquear fluxo padrão saindo de tipo que o Fluig Studio bloqueia', () => {
  const report = validateProcess(parseProcess(withDefaultLink(fixture, 'flow64'))); // intermediário 30
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((item) => item.code === 'COND-007' && item.elementId === 'flow64'));
});

test('fluxo padrão com origem inexistente acusa só a tripla, sem COND-007', () => {
  const orphan = withDefaultLink(fixture, 'flow46').replace(
    '<bpmn2:SequenceFlow id="flow46" defaultLink="true" name="INICIO_PARA_ATIVIDADE" sourceRef="startevent4"',
    '<bpmn2:SequenceFlow id="flow46" defaultLink="true" name="INICIO_PARA_ATIVIDADE" sourceRef="naoexiste"'
  );
  assert.ok(orphan.includes('sourceRef="naoexiste"'));
  const report = validateProcess(parseProcess(orphan));
  assert.ok(report.errors.some((item) => item.code === 'TRIPLA-001' && item.elementId === 'flow46'));
  assert.equal(report.findings.some((item) => item.code === 'COND-007'), false);
});

test('tipos que bloqueiam fluxo padrão seguem o Fluig Studio', () => {
  for (const type of ['10', '11', '36', '42', '80', '87', '100', '101', '120', '121', '125']) {
    assert.equal(forbidsDefaultFlow(type), false, type);
  }
  for (const type of ['12', '16', '30', '35', '37', '41', '43', '60', '68', '122', '124', '126', '127', '140', '142']) {
    assert.equal(forbidsDefaultFlow(type), true, type);
  }
  assert.equal(forbidsDefaultFlow(undefined), false); // anotação, documento: sem tipo
  assert.equal(forbidsDefaultFlow(''), false);
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
