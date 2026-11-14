'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../../src/bpmn/cli/main');
const { OPERATIONS, UI_ONLY_MESSAGES } = require('../../src/bpmn/cli/operations');
const { parseJsonWithComments, readFluiggersSettings } = require('../../src/bpmn/cli/nodeHost');
const { readCatalogSnapshot, writeCatalogSnapshot } = require('../../src/bpmn/catalogSnapshot');
const { installAgentKit } = require('../../src/bpmn/agentKit');
const { parseProcess } = require('../../src/bpmn/processModel');
const { validateProcess } = require('../../src/bpmn/processValidator');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'), 'utf8');

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fluig-bpmn-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function fixtureProject(t, text = fixture) {
  const root = project(t);
  const file = path.join(root, 'workflow', 'diagrams', 'toexportbpmnteste.process');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(path.join(root, 'workflow', 'scripts'), { recursive: true });
  fs.writeFileSync(file, text);
  return { root, file };
}

// stableProcessFixture.js troca fs.readFileSync de toexportbpmnteste.process pelo fixture estável;
// o arquivo real do projeto temporário só aparece por fs.promises.
function read(file) {
  return fs.promises.readFile(file);
}

async function cli(...argv) {
  return (await run(argv)).output;
}

async function apply(file, operations, ...flags) {
  return cli('apply', file, '--ops', JSON.stringify(operations), ...flags);
}

function backups(root) {
  const directory = path.join(root, '.fluig-bpmn', 'backups');
  return fs.existsSync(directory) ? fs.readdirSync(directory) : [];
}

test('toda mensagem do webview que altera o arquivo tem operação equivalente na CLI', () => {
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  const webviewMessages = new Set([...provider.matchAll(/message\.type === '([A-Za-z]+)'/g)].map((match) => match[1]));
  const covered = new Set(Object.entries(OPERATIONS).flatMap(([type, operation]) => operation.covers ?? [type]));
  assert.ok(webviewMessages.size > 40);
  assert.deepEqual([...webviewMessages].filter((type) => !covered.has(type) && !UI_ONLY_MESSAGES.includes(type)), []);
  assert.deepEqual([...covered].filter((type) => !webviewMessages.has(type)), []);
  assert.deepEqual(UI_ONLY_MESSAGES.filter((type) => !webviewMessages.has(type)), []);
});

test('cria um processo e monta o fluxo inteiro em um lote, sem coordenadas', async (t) => {
  const root = project(t);
  fs.mkdirSync(path.join(root, 'forms', 'pedido'), { recursive: true });
  fs.writeFileSync(path.join(root, 'forms', 'pedido', 'pedido.html'), '<input name="valor">');
  const created = await cli('new', 'compra', '--project', root, '--form', 'pedido');
  assert.equal(created.ok, true);
  assert.equal(fs.existsSync(path.join(root, 'workflow', 'literals', 'compra_pt_BR.properties')), true);

  const result = await apply(created.file, [
    { type: 'updateProperties', elementId: 'task4', changes: { name: 'Solicitar compra' } },
    { type: 'deleteElements', elementIds: ['endevent6'] },
    { type: 'createConnectedGateway', gateway: { sourceId: 'task4' }, properties: { name: 'Valor alto?' }, as: 'gw' },
    { type: 'createConnectedTask', task: { sourceId: '$gw' }, properties: { name: 'Aprovação da diretoria' }, flowProperties: { name: 'Alto' }, as: 'dir' },
    { type: 'createConnectedTask', task: { sourceId: '$gw' }, properties: { name: 'Aprovar gestor' }, as: 'ges' },
    { type: 'createConnectedEndEvent', endEvent: { sourceId: '$dir' }, as: 'fim' },
    { type: 'createConnection', connection: { sourceId: '$ges', targetId: '$fim' } },
    {
      type: 'updateGatewayBranches',
      gatewayId: '$gw',
      configuration: {
        defaultFlowId: '$ges.flow',
        conditions: [{ sourceIndex: '', order: 1, expression: 'hAPI.getCardValue("valor") > 1000', targetId: '$dir' }]
      }
    },
    { type: 'updateTaskAssignment', elementId: '$dir', assignment: { mechanism: 'Papel', mechanismConfiguration: { roleId: 'diretoria' } } }
  ]);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.validation, { ok: true, errors: [], warnings: [] });
  assert.equal(backups(root).length, 1);

  const text = String(await read(created.file));
  assert.equal(/[^\x00-\x7F]/.test(text), false);
  assert.equal(text.includes('\r\n'), true);
  const model = parseProcess(text);
  assert.equal(validateProcess(model).ok, true);
  const byId = new Map(model.elements.map((element) => [element.id, element]));
  const director = byId.get(result.names.dir.elementId);
  assert.equal(director.name, 'Aprovação da diretoria');
  assert.equal(director.attributes.managerMechanism, 'Papel');
  assert.equal(model.flows.find((flow) => flow.id === result.names.ges.flowId).attributes.defaultLink, 'true');
  assert.equal(model.flows.find((flow) => flow.id === result.names.dir.flowId).name, 'Alto');
  assert.deepEqual(byId.get(result.names.fim.elementId).attributes.incoming.split(' ').length, 2);

  const lane = model.shapes.find((shape) => shape.businessObject === 'swimlane2');
  const placed = model.shapes.filter((shape) => [result.names.gw, result.names.dir, result.names.ges, result.names.fim]
    .some((ids) => ids.elementId === shape.businessObject));
  for (const shape of placed) {
    assert.ok(shape.x >= lane.x && shape.y >= lane.y && shape.y + shape.height <= lane.y + lane.height, shape.businessObject);
    for (const other of placed.filter((item) => item !== shape)) {
      const apart = shape.x + shape.width <= other.x || other.x + other.width <= shape.x
        || shape.y + shape.height <= other.y || other.y + other.height <= shape.y;
      assert.ok(apart, `${shape.businessObject} sobre ${other.businessObject}`);
    }
  }

  const overview = await cli('describe', created.file);
  assert.equal(overview.elements.find((element) => element.id === 'task4').name, 'Solicitar compra');
  assert.deepEqual(overview.catalogs.formFields, 1);
  const detail = await cli('describe', created.file, '--element', result.names.gw.elementId);
  assert.equal(detail.elements[0].gatewayConditionEditor.conditions[0].targetId, result.names.dir.elementId);
});

test('um lote com operação recusada não grava nada', async (t) => {
  const { root, file } = fixtureProject(t);
  const before = await read(file);
  const result = await apply(file, [
    { type: 'updateProperties', elementId: 'task5', changes: { name: 'Novo nome' } },
    { type: 'updateProperties', elementId: 'task5', changes: { inexistente: 'x' } }
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.operationIndex, 1);
  assert.match(result.error, /Propriedade inexistente não pode ser editada.*Nada foi gravado/);
  assert.equal(result.passedBefore.length, 1);
  assert.equal(before.equals(await read(file)), true);
  assert.deepEqual(backups(root), []);
});

test('--dry-run valida o lote e mantém o arquivo', async (t) => {
  const { root, file } = fixtureProject(t);
  const before = await read(file);
  const result = await apply(file, [{ type: 'createConnectedTask', task: { sourceId: 'task5' } }], '--dry-run');
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.match(result.operations[0].elementId, /^task\d+$/);
  assert.equal(before.equals(await read(file)), true);
  assert.deepEqual(backups(root), []);
});

test('excluir uma atividade remove o script dela com backup e recusa código citado em outro script', async (t) => {
  const { root, file } = fixtureProject(t);
  const own = path.join(root, 'workflow', 'scripts', 'toexportbpmnteste.businessruletask33.js');
  fs.writeFileSync(own, 'function businessruletask33() {\n}');
  const cited = path.join(root, 'workflow', 'scripts', 'toexportbpmnteste.beforeStateEntry.js');
  fs.writeFileSync(cited, 'function beforeStateEntry(sequenceId) {\n  if (sequenceId == 33) return;\n}');

  const refused = await apply(file, [{ type: 'deleteElements', elementIds: ['businessruletask33'] }]);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /businessruletask33 em workflow\/scripts\/toexportbpmnteste\.beforeStateEntry\.js:2/);
  assert.equal(fs.existsSync(own), true);

  fs.rmSync(cited);
  const removed = await apply(file, [{ type: 'deleteElements', elementIds: ['businessruletask33'] }]);
  assert.equal(removed.ok, true, removed.error);
  assert.equal(fs.existsSync(own), false);
  assert.deepEqual(removed.files, [{ deleted: own }]);
  assert.equal(backups(root).some((name) => name.endsWith('.js')), true);
  assert.equal(parseProcess(String(await read(file))).elements.some((element) => element.id === 'businessruletask33'), false);
});

test('openTaskScript cria o arquivo do script quando ele falta', async (t) => {
  const { root, file } = fixtureProject(t);
  const result = await apply(file, [
    { type: 'convertTask', taskId: 'task5', targetType: '87', as: 'script' },
    { type: 'openTaskScript', elementId: '$script' }
  ]);
  assert.equal(result.ok, true, result.error);
  const script = path.join(root, 'workflow', 'scripts', `toexportbpmnteste.${result.names.script.elementId}.js`);
  assert.equal(fs.readFileSync(script, 'utf8'), `function ${result.names.script.elementId}() {\n}`);
});

test('apply corrige o nome do diagrama antes de editar, como o editor ao abrir', async (t) => {
  const { file } = fixtureProject(t, fixture.replace(/(<pi:Diagram\b[^>]*\bname=")toexportbpmnteste"/, '$1outro"'));
  assert.equal((await cli('validate', file)).errors[0].code, 'FMT-002');
  const result = await apply(file, [{ type: 'updateProperties', elementId: 'task5', changes: { name: 'Renomeada' } }]);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.repairs.length, 1);
  assert.equal((await cli('validate', file)).ok, true);
});

test('o código do processo não muda pela CLI', async (t) => {
  const { file } = fixtureProject(t);
  const result = await apply(file, [{
    type: 'updateProcessGeneral',
    configuration: { code: 'novo_codigo', description: 'x', volume: '', expedient: '', deadlineTime: '000:00', warningTime: '000:00' }
  }]);
  assert.equal(result.ok, false);
});

test('validate aponta edição manual que o validador estrutural deixa passar', async (t) => {
  const model = parseProcess(fixture);
  const shapeCount = model.diagram.children.filter((node) => node.localName === 'children').length;
  const corrupted = fixture
    .replace(/pictogramLinks="/, `pictogramLinks="/0/@children.${shapeCount + 7}/@link `)
    .replace('name="Atividade de teste eclipse"', 'name="Aprovação"');
  assert.equal(validateProcess(parseProcess(corrupted)).errors.some((item) => /REF|ASCII/.test(item.code)), false);
  const { file } = fixtureProject(t, corrupted);
  const result = await run(['validate', file]);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.output.errors.map((item) => item.code).sort(), ['ASCII-001', 'REF-001']);

  const clean = fixtureProject(t);
  assert.deepEqual((await cli('validate', clean.file)).errors, []);
});

test('lê settings.json com comentários, e o do projeto vence o do usuário', (t) => {
  assert.deepEqual(parseJsonWithComments('{\n  // nota\n  "a": "http://x", /* b */ "c": [1, 2,],\n}'), { a: 'http://x', c: [1, 2] });
  const root = project(t);
  const data = path.join(root, 'Code');
  fs.mkdirSync(path.join(data, 'User'), { recursive: true });
  fs.writeFileSync(path.join(data, 'User', 'settings.json'), '{ "fluiggers.bpmnBackupDirectory": "user", "editor.fontSize": 12 }');
  fs.mkdirSync(path.join(root, '.vscode'));
  fs.writeFileSync(path.join(root, '.vscode', 'settings.json'), '{ "fluiggers.bpmnBackupDirectory": "copias", }');
  assert.deepEqual(readFluiggersSettings(root, [data]), { 'fluiggers.bpmnBackupDirectory': 'copias' });
});

test('os catálogos do servidor vêm do cache que o editor grava, sem consultar o servidor', async (t) => {
  const { root, file } = fixtureProject(t);
  const missing = await cli('catalog', file);
  assert.equal(missing.catalogs.users, 0);
  assert.match(missing.warnings[0].message, /Abra este processo no editor visual/);

  const users = [{ value: 'ana.lima', label: 'Ana Lima (ana.lima)' }, { value: 'joao', label: 'João (joao)' }];
  const fromEditor = {
    userCatalog: users,
    roleCatalog: [{ value: 'diretoria', label: 'Diretoria' }],
    groupCatalog: [],
    mechanismCatalog: [],
    processCatalog: [],
    expedientCatalog: [{ value: 'Default', label: 'Default' }],
    volumeCatalog: [],
    formFields: [],
    subProcessFormFieldCatalogs: {}
  };
  assert.equal(writeCatalogSnapshot(file, 'future', fromEditor, new Date('2026-11-11T12:00:00Z')), true);
  assert.equal(writeCatalogSnapshot(file, 'future', fromEditor), false);
  assert.equal(fs.readFileSync(path.join(root, '.fluig-bpmn', 'catalogs', '.gitignore'), 'utf8'), '*\n');

  const counts = await cli('catalog', file);
  assert.deepEqual([counts.catalogs.users, counts.catalogs.roles, counts.catalogs.expedients], [2, 1, 1]);
  assert.equal(counts.serverCatalogsSavedAt, '2026-11-11T12:00:00.000Z');
  assert.deepEqual(counts.warnings, []);
  assert.deepEqual((await cli('catalog', file, 'users', '--search', 'ana')).items, [users[0]]);

  const deadline = await apply(file, [{
    type: 'updateTaskDeadline',
    elementId: 'task5',
    configuration: { expedient: 'Default', mode: 'fixed', fixedDuration: '048:00', deadlineFieldName: '' }
  }]);
  assert.equal(deadline.ok, true, deadline.error);

  // Servidor fora do ar no editor: o catálogo vazio não apaga o último valor conhecido.
  writeCatalogSnapshot(file, 'future', { ...fromEditor, userCatalog: [] });
  assert.equal(readCatalogSnapshot(file).catalogs.userCatalog.length, 2);
  writeCatalogSnapshot(file, 'outro', { ...fromEditor, userCatalog: [] });
  assert.equal(readCatalogSnapshot(file).catalogs.userCatalog.length, 0);
  assert.match((await cli('catalog', file)).warnings[0].message, /servidor "outro"/);
});

test('instala no projeto a skill, o bloco do AGENTS.md e um atalho que roda a CLI', async (t) => {
  const { root, file } = fixtureProject(t);
  const bundle = path.join(__dirname, '..', '..', 'dist', 'fluig-bpmn.js');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Projeto\n\nRegras da equipe.\n');
  assert.deepEqual(installAgentKit(root, bundle).sort(), [
    '.claude/skills/fluig-bpmn/SKILL.md', '.fluig-bpmn/bin/.gitignore', '.fluig-bpmn/bin/fluig-bpmn.js', 'AGENTS.md'
  ]);
  assert.deepEqual(installAgentKit(root, bundle), []);
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^# Projeto\n\nRegras da equipe\.\n\n<!-- fluig-bpmn:start -->/);
  assert.match(fs.readFileSync(path.join(root, '.claude', 'skills', 'fluig-bpmn', 'SKILL.md'), 'utf8'), /^---\nname: fluig-bpmn\ndescription: /);

  fs.writeFileSync(path.join(root, 'AGENTS.md'), `${agents}\nDepois do bloco.\n`);
  assert.deepEqual(installAgentKit(root, `${bundle}.novo`), ['.fluig-bpmn/bin/fluig-bpmn.js']);
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /<!-- fluig-bpmn:end -->\n\nDepois do bloco\.\n$/);

  if (!fs.existsSync(bundle)) return t.diagnostic('dist/fluig-bpmn.js ausente: rode npm run compile para testar o atalho.');
  installAgentKit(root, bundle);
  const { execFileSync } = require('node:child_process');
  const output = JSON.parse(execFileSync('node', ['.fluig-bpmn/bin/fluig-bpmn.js', 'validate', path.relative(root, file)], { cwd: root, encoding: 'utf8' }));
  assert.equal(output.ok, true);
});

test('render desenha o processo com os ids e apply --render mostra o resultado sem gravar', async (t) => {
  const { root, file } = fixtureProject(t);
  const { previewSvg } = require('../../src/bpmn/cli/render');
  const preview = previewSvg(fixture);
  assert.ok(preview.width > 500 && preview.height > 300);
  assert.match(preview.svg, />task5<\/text>/);
  assert.match(preview.svg, />flow46<\/text>/);
  assert.equal(previewSvg(fixture, { ids: false }).svg.includes('>task5</text>'), false);

  const before = await read(file);
  const result = await apply(file, [{ type: 'createConnectedTask', task: { sourceId: 'task5' }, as: 'nova' }], '--dry-run', '--render');
  assert.equal(result.ok, true, result.error);
  assert.equal(before.equals(await read(file)), true);
  assert.equal(result.preview.svg, path.join(root, '.fluig-bpmn', 'preview', 'toexportbpmnteste.svg'));
  assert.match(fs.readFileSync(result.preview.svg, 'utf8'), new RegExp(`>${result.names.nova.elementId}</text>`));
  assert.ok(result.preview.png ? fs.statSync(result.preview.png).size > 0 : result.preview.hint);
  assert.equal(fs.readFileSync(path.join(root, '.fluig-bpmn', 'preview', '.gitignore'), 'utf8'), '*\n');
});

test('cada operação documenta um exemplo aplicável e erros de uso voltam como JSON', async () => {
  for (const [type, operation] of Object.entries(OPERATIONS)) {
    assert.ok(operation.summary.length > 20, type);
    assert.equal(typeof operation.example, 'object', type);
    assert.equal((await cli('ops', type)).example.type, type);
  }
  assert.equal((await cli('ops')).operations.createConnectedTask, OPERATIONS.createConnectedTask.summary);
  assert.equal((await run(['apply'])).exitCode, 1);
  assert.match((await cli('describe', 'x.process', '--nope')).error, /Opção desconhecida/);
  assert.match((await run(['help'])).output, /fluig-bpmn apply/);
});
