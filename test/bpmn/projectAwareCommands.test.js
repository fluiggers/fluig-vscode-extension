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

test('comandos Novo e importações gravam no projeto do recurso clicado ou do editor ativo', () => {
  const expectations = {
    'src/extensions/FormExtension.ts': [/createForm\(resourceUri\?: vscode\.Uri\)/, /getProjectUri\(resourceUri\)/],
    'src/extensions/DatasetExtension.ts': [/createDataset\(resourceUri\?: vscode\.Uri\)/, /getProjectUri\(resourceUri\)/, /getProjectUri\(\), "datasets"/],
    'src/extensions/GlobalEventExtension.ts': [/createGlobalEvent\(resourceUri\?: vscode\.Uri\)/, /getProjectUri\(resourceUri\)/],
    'src/extensions/WorkflowExtension.ts': [/createMechanism\(resourceUri\?: vscode\.Uri\)/, /getProjectUri\(resourceUri\)/, /getProjectUri\(folderUri\)/],
    'src/services/WidgetService.ts': [/create\(resourceUri\?: Uri\)/, /import\(resourceUri\?: Uri\)/, /getProjectUri\(resourceUri\)/],
    'src/services/FormService.ts': [/import\(resourceUri\?: Uri\)/, /importMany\(resourceUri\?: Uri\)/, /getProjectUri\(resourceUri\)/],
    'src/services/DatasetService.ts': [/import\(resourceUri\?: Uri\)/, /importMany\(resourceUri\?: Uri\)/, /saveFile\(datasetsUri: Uri,/],
    'src/services/GlobalEventService.ts': [/import\(resourceUri\?: Uri\)/, /importMany\(resourceUri\?: Uri\)/, /saveFile\(projectUri: Uri,/],
    'src/services/AttributionMechanismService.ts': [/import\(resourceUri\?: Uri\)/, /importMany\(resourceUri\?: Uri\)/, /saveFile\(projectUri: Uri,/]
  };
  for (const [file, patterns] of Object.entries(expectations)) {
    const source = read(file);
    for (const pattern of patterns) assert.match(source, pattern, `${file}: ${pattern}`);
  }
});

function sources(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sources(relative);
    return /\.(ts|js)$/.test(entry.name) ? [relative] : [];
  });
}

test('exports e eventos de formulário usam a pasta real do artefato', () => {
  assert.match(read('src/services/FormService.ts'), /artifactFolderPath\(fileUri\.path, "forms"\)/);
  assert.match(read('src/extensions/FormExtension.ts'), /artifactFolderPath\(folderUri\.path, "forms"\)/);
  assert.match(read('src/services/WidgetService.ts'), /artifactFolderPath\(fileUri\.path, "widget"\)/);
  assert.match(read('src/services/WorkflowService.ts'), /getEventsToUpdate\(processId, Uri\.joinPath\(eventUri, "\.\."\)\)/);
});

test('só servidores, bibliotecas de tipos e o próprio UtilsService usam a raiz do workspace', () => {
  const users = sources('src').filter((file) => read(file).includes('getWorkspaceUri()')).sort();
  assert.deepEqual(users, [
    'src/extensions/LibraryExtension.ts',
    'src/services/FluigProjectService.ts',
    'src/services/ServerService.ts',
    'src/services/UtilsService.ts'
  ]);
});
