'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackupName, normalizeRelativeDirectory } = require('../../src/bpmn/backupService');

test('nome de backup é determinístico e seguro', () => {
  const date = new Date(2026, 7, 27, 23, 45, 6, 7);
  const name = createBackupName('Meu Processo.process', Buffer.from('abc'), date);
  assert.match(name, /^Meu_Processo\.20260827-234506-007\.ba7816bf8f\.process$/);
});

test('backup preserves the properties file extension', () => {
  const date = new Date(2026, 7, 27, 23, 45, 6, 7);
  const name = createBackupName('processo_pt_BR.properties', Buffer.from('abc'), date);
  assert.match(name, /^processo_pt_BR\.20260827-234506-007\.ba7816bf8f\.properties$/);
});

test('backup preserva a extensão do script condicional removido', () => {
  const date = new Date(2026, 7, 27, 23, 45, 6, 7);
  const name = createBackupName('processo.startconditional16.js', Buffer.from('abc'), date);
  assert.match(name, /^processo\.startconditional16\.20260827-234506-007\.ba7816bf8f\.js$/);
});

test('diretório de backup não pode escapar do workspace', () => {
  assert.deepEqual(normalizeRelativeDirectory('.fluig-bpmn/backups'), ['.fluig-bpmn', 'backups']);
  assert.throws(() => normalizeRelativeDirectory('../fora'), /dentro do workspace/);
});
