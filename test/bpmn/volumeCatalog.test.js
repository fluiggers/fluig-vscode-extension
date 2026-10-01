'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { discoverVolumeCatalog, extractVolumeCatalog } = require('../../src/bpmn/volumeCatalog');

const cacheFixture = '<string>volume</string><array class="java.lang.String" length="1">'
  + '<void index="0"><string>Default</string></void></array><void method="put">';

test('extrai volumes do cache do Fluig Studio', () => {
  assert.deepEqual(extractVolumeCatalog(cacheFixture), [
    { value: 'Default', label: 'Default' }
  ]);
});

test('remove duplicados e limita a leitura ao bloco de volume', () => {
  const cache = '<string>volume</string><array class="java.lang.String" length="3">'
    + '<void index="0"><string>Padr&#xe3;o</string></void>'
    + '<void index="1"><string>Padr&#xe3;o</string></void>'
    + '<void index="2"><string>Volume GED</string></void></array><void method="put">'
    + '<string>expediente</string><array><string>Nao incluir</string></array>';
  assert.deepEqual(extractVolumeCatalog(cache), [
    { value: 'Padrão', label: 'Padrão' },
    { value: 'Volume GED', label: 'Volume GED' }
  ]);
});

test('descobre volumes relativos à raiz do projeto', async () => {
  let requestedPath = '';
  const vscode = {
    Uri: { file: (fsPath) => ({ fsPath }) },
    workspace: { fs: { readFile: async (uri) => {
      requestedPath = uri.fsPath;
      return Buffer.from(cacheFixture, 'utf8');
    } } }
  };
  const processUri = {
    scheme: 'file',
    fsPath: path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process')
  };
  assert.deepEqual(await discoverVolumeCatalog(vscode, processUri), [
    { value: 'Default', label: 'Default' }
  ]);
  assert.match(requestedPath, /workflow[\\/]\.resources[\\/]future\.ws\.cache$/);
});
