'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { artifactFolderPath, findProjectRoot } = require('../../src/services/projectRoot');

function workspace(t, entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-root-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const entry of entries) {
    const target = path.join(root, entry);
    if (entry.endsWith('/')) fs.mkdirSync(target, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '');
    }
  }
  return root;
}

async function kindOf(candidate) {
  try {
    return fs.statSync(candidate).isDirectory() ? 'directory' : 'file';
  } catch {
    return undefined;
  }
}

test('acha o projeto aninhado pelo .project, mesmo com workflow/ na raiz do workspace', async (t) => {
  const root = workspace(t, ['workflow/', 'forms/', 'Processos/pagamento/.project', 'Processos/pagamento/forms/form_pagamento/form_pagamento.html']);
  const project = path.join(root, 'Processos', 'pagamento');
  assert.equal(await findProjectRoot(path.join(project, 'forms'), root, kindOf), project);
  assert.equal(await findProjectRoot(path.join(project, 'forms', 'form_pagamento', 'form_pagamento.html'), root, kindOf), project);
  assert.equal(await findProjectRoot(path.join(root, 'Processos'), root, kindOf), root);
  assert.equal(await findProjectRoot(path.join(root, 'forms'), root, kindOf), root);
});

test('acha o projeto pela pasta workflow/ ou de dentro dela', async (t) => {
  const root = workspace(t, ['a/b/workflow/diagrams/b.process', 'a/b/datasets/']);
  const project = path.join(root, 'a', 'b');
  assert.equal(await findProjectRoot(path.join(project, 'datasets'), root, kindOf), project);
  assert.equal(await findProjectRoot(path.join(project, 'workflow', 'diagrams', 'b.process'), root, kindOf), project);
  assert.equal(await findProjectRoot(path.join(project, 'workflow'), root, kindOf), project);
});

test('sem marcador ou fora do workspace devolve a raiz do workspace', async (t) => {
  const root = workspace(t, ['x/y/']);
  assert.equal(await findProjectRoot(path.join(root, 'x', 'y'), root, kindOf), root);
  assert.equal(await findProjectRoot(os.tmpdir(), root, kindOf), root);
});

test('pasta do formulário ou widget a partir de um arquivo dentro dela', () => {
  assert.equal(artifactFolderPath('/w/Processos/x/forms/form_x/events/displayFields.js', 'forms'), '/w/Processos/x/forms/form_x');
  assert.equal(artifactFolderPath('/w/forms/form_x', 'forms'), '/w/forms/form_x');
  assert.equal(artifactFolderPath('/w/p/wcm/widget/w_x/src/main/resources/view.ftl', 'widget'), '/w/p/wcm/widget/w_x');
  assert.equal(artifactFolderPath('C:\\w\\forms\\form_x\\form_x.html', 'forms'), 'C:\\w\\forms\\form_x');
  assert.equal(artifactFolderPath('/w/datasets/ds.js', 'forms'), null);
});
