'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { findLikelyNodeReferences, projectRootForProcessPath, referenceScanFilter } = require('../../src/bpmn/nodeReferenceScanner');

test('localiza raiz do projeto a partir de workflow/diagrams', () => {
  const project = path.resolve('C:\\workspace\\projeto');
  const file = path.join(project, 'workflow', 'diagrams', 'teste.process');
  assert.equal(projectRootForProcessPath(file), project);
  assert.equal(projectRootForProcessPath(path.join(project, 'teste.process')), null);
});

test('detecta id e referências usuais ao WKNumState sem confundir números soltos', () => {
  const source = [
    'if (getValue("WKNumState") == 65) { return true; }',
    'switch (state) { case 65: return false; }',
    'var target = "endevent65";',
    'var unrelated = 65;'
  ].join('\n');
  const findings = findLikelyNodeReferences(source, 'endevent65', '65');
  assert.deepEqual(findings.map((item) => [item.kind, item.line]), [
    ['WKNumState', 1],
    ['WKNumState', 2],
    ['id', 3]
  ]);
});

test('não encontra referência quando id e código não estão em contexto de atividade', () => {
  assert.deepEqual(findLikelyNodeReferences('var prazo = 65;\nvar nome = "outro";', 'endevent65', '65'), []);
});

test('artefato usa somente o id exato e não trata seu sufixo como WKNumState', () => {
  const text = [
    'if (WKNumState == 37) return;',
    'var visual = "databasetask37";'
  ].join('\n');
  const findings = findLikelyNodeReferences(text, 'databasetask37', '');
  assert.deepEqual(findings, [{ kind: 'id', line: 2, excerpt: 'var visual = "databasetask37";' }]);
});

test('verifica só os scripts do próprio processo', () => {
  const relevant = referenceScanFilter('pagamento', '', []);
  assert.equal(relevant('workflow/scripts/pagamento.beforeTaskSave.js'), true);
  assert.equal(relevant('workflow/scripts/chamados.beforeTaskSave.js'), false);
  assert.equal(relevant('workflow/scripts/pagamentoAntigo.beforeTaskSave.js'), false);
});

test('verifica só os eventos do formulário vinculado pelo cardIndex', () => {
  const folders = ['1234 - form_compras', 'form_viagem2', 'reembolso'];
  const event = (folder) => `forms/${folder}/events/displayFields.js`;
  assert.deepEqual(folders.filter((folder) => referenceScanFilter('p', '', folders)(event(folder))), []);
  assert.deepEqual(folders.filter((folder) => referenceScanFilter('p', '1234', folders)(event(folder))), ['1234 - form_compras']);
  assert.deepEqual(folders.filter((folder) => referenceScanFilter('p', '5678 - form_viagem2', folders)(event(folder))), ['form_viagem2']);
  assert.deepEqual(folders.filter((folder) => referenceScanFilter('p', 'reembolso', folders)(event(folder))), ['reembolso']);
  assert.deepEqual(folders.filter((folder) => referenceScanFilter('p', '555', folders)(event(folder))), folders);
});
