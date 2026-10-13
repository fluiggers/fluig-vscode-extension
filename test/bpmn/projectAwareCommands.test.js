'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Novo Diagrama de Processo usa o localizador comum de projeto', () => {
  const source = read('src/services/WorkflowProcessScaffoldService.ts');
  assert.match(source, /UtilsService\.getProjectUri\(resourceUri\)/);
  assert.doesNotMatch(source, /resolveProjectRoot|isInside/);
});
