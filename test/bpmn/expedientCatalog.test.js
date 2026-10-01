'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { discoverExpedientCatalog, extractExpedientCatalog } = require('../../src/bpmn/expedientCatalog');

const cachePath = path.join(__dirname, 'fixtures', 'project', 'workflow', '.resources', 'future.ws.cache');

test('extrai expedientes do cache do Fluig Studio', () => {
  assert.deepEqual(extractExpedientCatalog(fs.readFileSync(cachePath, 'utf8')), [
    { value: 'Default', label: 'Default' }
  ]);
});

test('remove duplicados e decodifica entidades no catálogo de expedientes', () => {
  const cache = '<string>expediente</string><array class="java.lang.String" length="3">'
    + '<void index="0"><string>Padr&#xe3;o</string></void>'
    + '<void index="1"><string>Padr&#xe3;o</string></void>'
    + '<void index="2"><string>24x7</string></void></array><void method="put">';
  assert.deepEqual(extractExpedientCatalog(cache), [
    { value: 'Padrão', label: 'Padrão' },
    { value: '24x7', label: '24x7' }
  ]);
});

test('descobre expedientes relativos à raiz do projeto', async () => {
  const vscode = {
    Uri: { file: (fsPath) => ({ fsPath }) },
    workspace: { fs: { readFile: async (uri) => fs.promises.readFile(uri.fsPath) } }
  };
  const processUri = {
    scheme: 'file',
    fsPath: path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process')
  };
  assert.deepEqual(await discoverExpedientCatalog(vscode, processUri), [
    { value: 'Default', label: 'Default' }
  ]);
});
