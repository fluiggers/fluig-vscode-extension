'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { discoverFormFields, discoverLocalFormCatalog, extractFormFields } = require('../../src/bpmn/formFields');
const { parseProcess } = require('../../src/bpmn/processModel');

test('extrai e deduplica campos editáveis do HTML do formulário', () => {
  assert.deepEqual(extractFormFields(`
    <form name="form">
      <input name="codigo">
      <input name='codigo'>
      <select name="aprovador"></select>
      <textarea name=observacao></textarea>
      <input name="campo___1">
      <input name="${'${campoDinamico}'}">
    </form>
  `), ['codigo', 'aprovador', 'observacao', 'campo___1']);
});

test('localiza os campos do formulário local associado pelo cardIndex', async () => {
  const processPath = path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process');
  const model = parseProcess(fs.readFileSync(processPath, 'ascii'));
  const vscode = {
    FileType: { File: 1 },
    Uri: {
      file: (fsPath) => ({ scheme: 'file', fsPath }),
      joinPath: (uri, name) => ({ scheme: 'file', fsPath: path.join(uri.fsPath, name) })
    },
    workspace: {
      fs: {
        readFile: async (uri) => fs.promises.readFile(uri.fsPath),
        readDirectory: async (uri) => (await fs.promises.readdir(uri.fsPath, { withFileTypes: true }))
          .map((entry) => [entry.name, entry.isFile() ? 1 : 2])
      }
    }
  };
  const fields = await discoverFormFields(vscode, { scheme: 'file', fsPath: processPath }, model);
  assert.deepEqual(fields, ['campox']);
});

test('descobre formulários locais e seus campos para a aba do processo', async () => {
  const processPath = path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process');
  const vscode = {
    FileType: { File: 1, Directory: 2 },
    Uri: {
      file: (fsPath) => ({ scheme: 'file', fsPath }),
      joinPath: (uri, name) => ({ scheme: 'file', fsPath: path.join(uri.fsPath, name) })
    },
    workspace: {
      fs: {
        readFile: async (uri) => fs.promises.readFile(uri.fsPath),
        readDirectory: async (uri) => (await fs.promises.readdir(uri.fsPath, { withFileTypes: true }))
          .map((entry) => [entry.name, entry.isFile() ? 1 : 2])
      }
    }
  };
  const catalog = await discoverLocalFormCatalog(vscode, { scheme: 'file', fsPath: processPath });
  assert.ok(catalog.some((form) => form.value === 't123' && form.fields.includes('campox')));
});
