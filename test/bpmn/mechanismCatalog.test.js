'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { discoverMechanismCatalog, extractMechanismCatalog } = require('../../src/bpmn/mechanismCatalog');

const cachePath = path.join(__dirname, 'fixtures', 'project', 'workflow', '.resources', 'future.ws.cache');

test('extrai descrição e código dos mecanismos na ordem do cache do Fluig Studio', () => {
  const catalog = extractMechanismCatalog(fs.readFileSync(cachePath, 'utf8'));
  assert.deepEqual(catalog.slice(0, 3), [
    { label: 'Atribuição por Associação', value: 'Associado' },
    { label: 'Atribuição por Grupo HelpDesk', value: 'atrib_tratar_chamado' },
    { label: 'Atribuição por Campo de Formulário', value: 'Campo Formulário' }
  ]);
  assert.ok(catalog.some((item) => item.value === 'mecBuscaAprovadorTP'));
});

test('descobre o catálogo relativo à raiz do projeto', async () => {
  const vscode = {
    Uri: { file: (fsPath) => ({ fsPath }) },
    workspace: { fs: { readFile: async (uri) => fs.promises.readFile(uri.fsPath) } }
  };
  const processUri = {
    scheme: 'file',
    fsPath: path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process')
  };
  const catalog = await discoverMechanismCatalog(vscode, processUri);
  assert.equal(catalog.find((item) => item.value === 'atrib_tratar_chamado').label, 'Atribuição por Grupo HelpDesk');
});
