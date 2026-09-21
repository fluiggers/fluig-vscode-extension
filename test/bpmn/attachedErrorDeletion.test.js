'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deleteAttachedErrorEvent } = require('../../src/bpmn/processPatcher');
const { parseProcess } = require('../../src/bpmn/processModel');
const { validateProcess } = require('../../src/bpmn/processValidator');
const { walk } = require('../../src/bpmn/xmlTokenizer');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);

function directChildren(model) {
  return model.diagram.children.filter((node) => node.localName === 'children');
}

test('exclui tratativa de erro e limpa a referência da atividade de serviço', () => {
  const before = parseProcess(fixture);
  const removedIndex = directChildren(before).indexOf(before.shapeById.get('intermediateerror45').node);
  const result = deleteAttachedErrorEvent(fixture, 'intermediateerror45');
  const parent = result.model.elements.find((item) => item.id === 'servicetask44');

  assert.equal(result.parentTaskId, 'servicetask44');
  assert.equal(result.removedChildIndex, removedIndex);
  assert.equal(result.model.elements.some((item) => item.id === 'intermediateerror45'), false);
  assert.equal(result.model.shapes.some((item) => item.businessObject === 'intermediateerror45'), false);
  assert.equal(parent.attributes.attachedEvents, undefined);
  assert.equal(result.model.flows.length, before.flows.length);
  assert.equal(result.model.connections.length, before.connections.length);
  assert.equal(result.validation.ok, true);
  assert.equal(validateProcess(result.model).ok, true);
  assert.equal(result.text.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(result.model.fingerprint.encoding, 'ASCII');
  walk(result.model.xml, (node) => {
    for (const attribute of node.attributes) {
      assert.equal(attribute.value.includes('intermediateerror45'), false, `${node.localName}.${attribute.name}`);
    }
  });
});

test('preserva outros eventos anexados ao limpar apenas a tratativa solicitada', () => {
  const withSecondReference = fixture.replace(
    'attachedEvents="intermediateerror45"',
    'attachedEvents="intermediateerror45 intermediateerror999"'
  ).replace(
    '<bpmn2:BpmnIntermediateEvent id="intermediateerror45"',
    '<bpmn2:BpmnIntermediateEvent id="intermediateerror999" name="Outro" type="43" sequenceAttached="44" signalId="0" parentTask="servicetask44"/>\r\n  <bpmn2:BpmnIntermediateEvent id="intermediateerror45"'
  );
  const result = deleteAttachedErrorEvent(withSecondReference, 'intermediateerror45');
  const parent = result.model.elements.find((item) => item.id === 'servicetask44');
  assert.equal(parent.attributes.attachedEvents, 'intermediateerror999');
  assert.ok(result.model.elements.some((item) => item.id === 'intermediateerror999'));
  assert.equal(result.validation.ok, true);
});

test('recusa evento comum, vínculo divergente, evento conectado e arquivo inválido', () => {
  assert.throws(() => deleteAttachedErrorEvent(fixture, 'intermediateevent22'), /Somente eventos de captura de erro/);
  assert.throws(
    () => deleteAttachedErrorEvent(fixture.replace('attachedEvents="intermediateerror45"', 'attachedEvents=""'), 'intermediateerror45'),
    /não referencia unicamente/
  );
  assert.throws(
    () => deleteAttachedErrorEvent(fixture.replace('sequenceAttached="44"', 'sequenceAttached="999"'), 'intermediateerror45'),
    /sequenceAttached incompatível/
  );
  const connected = fixture.replace(
    '<bpmn2:BpmnIntermediateEvent id="intermediateerror45"',
    '<bpmn2:BpmnIntermediateEvent incoming="flow46" id="intermediateerror45"'
  );
  assert.throws(() => deleteAttachedErrorEvent(connected, 'intermediateerror45'), /fluxo de entrada ou saída|erro\(s\) estrutural\(is\)/);
  const broken = fixture.replace('outgoing="flow64"', 'outgoing=""');
  assert.throws(() => deleteAttachedErrorEvent(broken, 'intermediateerror45'), /erro\(s\) estrutural\(is\) antes da exclusão/);
});
