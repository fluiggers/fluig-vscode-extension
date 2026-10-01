'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { deleteSequenceFlow } = require('../../src/bpmn/processPatcher');
const { validateProcess } = require('../../src/bpmn/processValidator');
const { walk } = require('../../src/bpmn/xmlTokenizer');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function directNodes(model, localName) {
  return model.diagram.children.filter((node) => node.localName === localName);
}

function serializedNodes(text, nodes) {
  return nodes.map((node) => text.slice(node.start, node.closeEnd));
}

test('exclui o último fluxo removendo a tripla lógica e a conexão visual', () => {
  const before = parseProcess(fixture);
  const result = deleteSequenceFlow(fixture, 'flow64');
  const source = result.model.elements.find((item) => item.id === 'intermediateevent61');
  const target = result.model.elements.find((item) => item.id === 'intermediateevent63');

  assert.equal(result.removedConnectionIndex, 10);
  assert.equal(result.model.flows.length, before.flows.length - 1);
  assert.equal(result.model.connections.length, before.connections.length - 1);
  assert.equal(result.model.flows.some((item) => item.id === 'flow64'), false);
  assert.equal(result.model.connections.some((item) => item.businessObject === 'flow64'), false);
  assert.equal(source.attributes.outgoing, undefined);
  assert.equal(target.attributes.incoming, undefined);
  assert.equal(result.validation.ok, true);
  assert.equal(validateProcess(result.model).ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(result.model.fingerprint.encoding, 'ASCII');
  assert.equal(result.model.fingerprint.version, before.fingerprint.version);
});

test('exclui fluxo intermediário e recalcula toda a cascata connections.N', () => {
  const before = parseProcess(fixture);
  const stylesBefore = serializedNodes(fixture, directNodes(before, 'styles'));
  const result = deleteSequenceFlow(fixture, 'flow54');
  const shifted = result.model.connections.find((item) => item.businessObject === 'flow56');
  const shiftedIndex = result.model.connections.indexOf(shifted);
  const source = result.model.elements.find((item) => item.id === 'manualtask52');
  const target = result.model.elements.find((item) => item.id === 'task53');

  assert.equal(result.removedConnectionIndex, 5);
  assert.equal(shiftedIndex, 5);
  assert.equal(source.attributes.outgoing, undefined);
  assert.equal(target.attributes.incoming, undefined);
  assert.ok(result.model.diagram.attributeMap.pictogramLinks.value.includes('/0/@connections.5/@link'));
  assert.equal(result.model.diagram.attributeMap.pictogramLinks.value.includes('/0/@connections.11/@link'), false);
  walk(result.model.xml, (node) => {
    for (const attribute of node.attributes) {
      for (const match of attribute.value.matchAll(/\/0\/@connections\.(\d+)/g)) {
        assert.ok(Number(match[1]) < result.model.connections.length, `${attribute.name}: ${match[0]}`);
      }
    }
  });
  assert.deepEqual(serializedNodes(result.text, directNodes(result.model, 'styles')), stylesBefore);
  assert.equal(result.validation.ok, true);
});

test('recusa ramo condicionado, ramo padrão, id ausente e arquivo pré-invalidado', () => {
  assert.throws(() => deleteSequenceFlow(fixture, 'flow48'), /condição que aponta/);
  assert.throws(() => deleteSequenceFlow(fixture, 'flow49'), /ramo padrão/);
  assert.throws(() => deleteSequenceFlow(fixture, 'flow999'), /não encontrado ou duplicado/);

  const broken = fixture.replace('outgoing="flow64"', 'outgoing=""');
  assert.throws(() => deleteSequenceFlow(broken, 'flow64'), /erro\(s\) estrutural\(is\) antes da exclusão/);
});
