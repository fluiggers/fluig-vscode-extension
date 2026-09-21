'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  assertDistinctProcessCode,
  normalizeProcessCode,
  processCodeFromFilePath,
  renamedArtifactName
} = require('../../src/bpmn/processIdentity');

test('valida codigo portavel e extrai a identidade do nome do .process', () => {
  assert.equal(normalizeProcessCode('viagem_nacional-2.0'), 'viagem_nacional-2.0');
  assert.equal(normalizeProcessCode('109'), '109');
  assert.equal(processCodeFromFilePath(path.join('projeto', 'workflow', 'diagrams', '120.process')), '120');
  assert.equal(processCodeFromFilePath(path.join('projeto', 'workflow', 'diagrams', 'viagem_nacional.process')), 'viagem_nacional');
  assert.throws(() => normalizeProcessCode('123 processo'), /codigo de processo valido/);
  assert.throws(() => processCodeFromFilePath('viagem.xml'), /extensao .process/);
});

test('bloqueia renomeacao que altera somente maiusculas e minusculas', () => {
  assert.equal(assertDistinctProcessCode('processoAtual', 'processo_novo'), 'processo_novo');
  assert.throws(() => assertDistinctProcessCode('Processo', 'processo'), /maiusculas e minusculas/);
});

test('renomeia somente scripts, literais e artefatos diretos pertencentes ao processo', () => {
  assert.equal(
    renamedArtifactName('scripts', 'processo.servicetask11.js', 'processo', 'novo'),
    'novo.servicetask11.js'
  );
  assert.equal(
    renamedArtifactName('literals', 'processo_pt_BR.properties', 'processo', 'novo'),
    'novo_pt_BR.properties'
  );
  assert.equal(
    renamedArtifactName('resources', 'processo.ecm30.xml', 'processo', 'novo'),
    'novo.ecm30.xml'
  );
  assert.equal(renamedArtifactName('resources', 'processo.png', 'processo', 'novo'), 'novo.png');
  assert.equal(renamedArtifactName('scripts', 'outro.servicetask11.js', 'processo', 'novo'), null);
  assert.equal(renamedArtifactName('literals', 'processo_backup.txt', 'processo', 'novo'), null);
  assert.equal(renamedArtifactName('resources', 'processo.cache', 'processo', 'novo'), null);
});
