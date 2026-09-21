'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { patchTaskJoint } = require('../../src/bpmn/processPatcher');
const { taskJointDefinition } = require('../../src/bpmn/taskJoint');

function fixture() {
  return fs.readFileSync(
    path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
    'ascii'
  );
}

function attributes(result, elementId) {
  return result.model.elements.find((element) => element.id === elementId).attributes;
}

test('interpreta a atividade conjunta configurada pelo Eclipse', () => {
  const task = parseProcess(fixture()).elements.find((element) => element.id === 'task5');
  assert.deepEqual(taskJointDefinition(task), {
    supported: true,
    joint: true,
    consensus: '100',
    neverSelectCollaborators: true
  });
});

test('a configuracao atual do Eclipse e idempotente', () => {
  const text = fixture();
  const task = parseProcess(text).elements.find((element) => element.id === 'task5');
  const result = patchTaskJoint(text, 'task5', taskJointDefinition(task));
  assert.equal(result.changed, false);
  assert.equal(result.text, text);
});

test('grava consenso e os dois modos de selecao de colaboradores', () => {
  const regularSelection = patchTaskJoint(fixture(), 'task53', {
    joint: true,
    consensus: '75',
    neverSelectCollaborators: false
  });
  assert.deepEqual(
    {
      atividadeConjunta: attributes(regularSelection, 'task53').atividadeConjunta,
      consenso: attributes(regularSelection, 'task53').consenso,
      selecionaColaboradores: attributes(regularSelection, 'task53').selecionaColaboradores
    },
    { atividadeConjunta: 'true', consenso: '75', selecionaColaboradores: '1' }
  );
  assert.equal(regularSelection.validation.ok, true);
  assert.equal(regularSelection.text.includes('\r\n'), true);
  assert.equal(/[^\x00-\x7F]/.test(regularSelection.text), false);

  const neverSelect = patchTaskJoint(regularSelection.text, 'task53', {
    joint: false,
    consensus: '60',
    neverSelectCollaborators: true
  });
  assert.deepEqual(
    {
      atividadeConjunta: attributes(neverSelect, 'task53').atividadeConjunta,
      consenso: attributes(neverSelect, 'task53').consenso,
      selecionaColaboradores: attributes(neverSelect, 'task53').selecionaColaboradores
    },
    { atividadeConjunta: 'true', consenso: '60', selecionaColaboradores: '2' }
  );
});

test('desativar atividade conjunta remove as propriedades opcionais', () => {
  const result = patchTaskJoint(fixture(), 'task5', {
    joint: false,
    consensus: '100',
    neverSelectCollaborators: false
  });
  const task = attributes(result, 'task5');
  assert.equal(task.atividadeConjunta, undefined);
  assert.equal(task.consenso, undefined);
  assert.equal(task.selecionaColaboradores, '1');
  assert.equal(result.validation.ok, true);
});

test('recusa consenso invalido, tarefa incompativel e modo desconhecido', () => {
  for (const consensus of ['', '0', '101', '1.5', 'texto']) {
    assert.throws(
      () => patchTaskJoint(fixture(), 'task53', {
        joint: true,
        consensus,
        neverSelectCollaborators: false
      }),
      /consenso deve ser um n.mero inteiro entre 1 e 100/i
    );
  }
  assert.throws(
    () => patchTaskJoint(fixture(), 'servicetask11', {
      joint: true,
      consensus: '50',
      neverSelectCollaborators: false
    }),
    /n.o aceita atividade conjunta/i
  );
  const current = fixture();
  const unknownMode = current.replace(
    'id="task53" name="Atividade" incoming="flow54" type="80" loopType="0" authNotify="true" expediente="" selecionaColaboradores="1"',
    'id="task53" name="Atividade" incoming="flow54" type="80" loopType="0" authNotify="true" expediente="" selecionaColaboradores="9"'
  );
  assert.notEqual(unknownMode, current);
  assert.throws(
    () => patchTaskJoint(unknownMode, 'task53', {
      joint: true,
      consensus: '50',
      neverSelectCollaborators: false
    }),
    /selecionaColaboradores desconhecido: 9/
  );
});
