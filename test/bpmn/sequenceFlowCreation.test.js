'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { createSequenceFlow } = require('../../src/bpmn/processPatcher');
const { validateProcess } = require('../../src/bpmn/processValidator');
const { toWebviewData } = require('../../src/bpmn/webviewData');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const initialModel = parseProcess(fixture);
const expectedFlowNumber = [...initialModel.elements, ...initialModel.flows]
  .filter((item) => item.tag !== 'BpmnProcess')
  .reduce((maximum, item) => Math.max(maximum, Number(String(item.id).match(/(\d+)$/)?.[1] || 0)), 0) + 1;

test('cria fluxo append-only com tripla BPMN e referências Graphiti completas', () => {
  const result = createSequenceFlow(fixture, {
    sourceId: 'servicetask11',
    targetId: 'manualtask52',
    bendpoints: [{ x: 710, y: 210 }, { x: 710, y: 310 }]
  });
  const flow = result.model.flows.find((item) => item.id === result.flowId);
  const source = result.model.elements.find((item) => item.id === 'servicetask11');
  const target = result.model.elements.find((item) => item.id === 'manualtask52');
  const connection = result.model.connections.find((item) => item.businessObject === result.flowId);

  assert.equal(result.flowId, `flow${expectedFlowNumber}`);
  assert.equal(flow.attributes.sourceRef, 'servicetask11');
  assert.equal(flow.attributes.targetRef, 'manualtask52');
  assert.ok(source.attributes.outgoing.split(/\s+/).includes(result.flowId));
  assert.ok(target.attributes.incoming.split(/\s+/).includes(result.flowId));
  assert.deepEqual(connection.bendpoints, [{ x: 710, y: 210 }, { x: 710, y: 310 }]);
  assert.equal(result.model.connections.length, parseProcess(fixture).connections.length + 1);
  const createdConnectionIndex = result.model.connections.findIndex((item) => item.businessObject === result.flowId);
  assert.ok(result.model.diagram.attributeMap.pictogramLinks.value.includes(
    `/0/@connections.${createdConnectionIndex}/@link`
  ));
  assert.equal(result.validation.ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
});

test('recusa fluxo duplicado e extremidades semanticamente inválidas', () => {
  assert.throws(
    () => createSequenceFlow(fixture, { sourceId: 'task5', targetId: 'exclusivegateway39' }),
    /Já existe/
  );
  assert.throws(
    () => createSequenceFlow(fixture, { sourceId: 'endevent12', targetId: 'manualtask52' }),
    /não pode iniciar/
  );
  assert.throws(
    () => createSequenceFlow(fixture, { sourceId: 'servicetask11', targetId: 'startevent4' }),
    /não pode receber/
  );
});

test('cria associação documental pontilhada usando a tripla compatível com o Studio', () => {
  const result = createSequenceFlow(fixture, {
    sourceId: 'annotationtask7',
    targetId: 'mailtask31',
    bendpoints: [{ x: 610, y: 420 }]
  });
  const flow = result.model.flows.find((item) => item.id === result.flowId);
  const source = result.model.elements.find((item) => item.id === 'annotationtask7');
  const target = result.model.elements.find((item) => item.id === 'mailtask31');
  const view = toWebviewData(result.model, result.validation);
  const visualFlow = view.elements.find((item) => item.id === result.flowId);
  const visualTarget = view.elements.find((item) => item.id === 'mailtask31');

  assert.equal(result.documentaryAssociation, true);
  assert.equal(flow.attributes.sourceRef, 'annotationtask7');
  assert.equal(flow.attributes.targetRef, 'mailtask31');
  assert.ok(source.attributes.outgoing.split(/\s+/).includes(result.flowId));
  assert.ok(target.attributes.incoming.split(/\s+/).includes(result.flowId));
  assert.deepEqual(visualFlow.editableProperties.map((property) => property.name), ['name']);
  assert.ok(visualTarget.configurationIssues.includes('Elemento sem fluxo de entrada.'));
  assert.equal(result.validation.ok, true);
  assert.throws(
    () => createSequenceFlow(fixture, { sourceId: 'annotationtask7', targetId: 'exclusivegateway39' }),
    /somente pode criar uma associação visual/
  );
});

test('validador detecta referência posicional ausente no anchor Graphiti', () => {
  const created = createSequenceFlow(fixture, {
    sourceId: 'servicetask11',
    targetId: 'manualtask52'
  });
  const connectionIndex = created.model.connections.findIndex((item) => item.businessObject === created.flowId);
  const connectionRef = `/0/@connections.${connectionIndex}`;
  const escapedConnectionRef = connectionRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const broken = created.text.replace(
    new RegExp(`(outgoingConnections="[^"]*)${escapedConnectionRef}`),
    '$1'
  );
  const report = validateProcess(parseProcess(broken));
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((item) => item.code === 'POS-003'));
});
