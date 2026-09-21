'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('manifesto registra o editor de arquivos .process', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
  );
  const editor = manifest.contributes.customEditors[0];
  assert.equal(editor.viewType, 'fluigBpmn.processEditor');
  assert.equal(editor.selector[0].filenamePattern, '*.process');
  assert.equal(editor.priority, 'default');
  assert.ok(manifest.activationEvents.includes('onCommand:fluigBpmn.generateTranslations'));
  assert.ok(manifest.contributes.commands.some((item) => item.command === 'fluigBpmn.generateTranslations'));
  assert.ok(manifest.activationEvents.includes('onCommand:fluiggers-fluig-vscode-extension.newWorkflowProcess'));
  assert.ok(manifest.contributes.commands.some((item) => (
    item.command === 'fluiggers-fluig-vscode-extension.newWorkflowProcess'
    && item.title === 'Novo Diagrama de Processo'
  )));
  assert.ok(manifest.contributes.menus['explorer/context'].some((item) => (
    item.command === 'fluiggers-fluig-vscode-extension.newWorkflowProcess'
    && item.when === 'explorerResourceIsFolder'
  )));
});
