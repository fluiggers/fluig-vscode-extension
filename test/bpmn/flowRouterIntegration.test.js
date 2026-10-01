'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchLayout } = require('../../src/bpmn/processPatcher');
const { getWebviewHtml } = require('../../src/bpmn/webviewHtml');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'),
  'ascii'
);
const editorScript = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');

test('adiciona substitui e remove bendpoints sem alterar a semantica do fluxo', () => {
  const layout = {
    moves: [],
    canvas: { width: 1600, height: 1000 },
    connections: [{ id: 'flow47', bendpoints: [{ x: 700, y: 80 }, { x: 700, y: 140 }] }]
  };
  const added = patchLayout(fixture, layout);
  const connection = added.model.connections.find((item) => item.businessObject === 'flow47');
  const semanticFlow = added.model.flows.find((item) => item.id === 'flow47');
  assert.deepEqual(connection.bendpoints, layout.connections[0].bendpoints);
  assert.equal(semanticFlow.attributes.sourceRef, 'task5');
  assert.equal(semanticFlow.attributes.targetRef, 'exclusivegateway39');
  assert.equal(added.validation.ok, true);

  const repeated = patchLayout(added.text, layout);
  assert.equal(repeated.changed, false);

  const partiallyRemoved = patchLayout(added.text, {
    moves: [],
    canvas: layout.canvas,
    connections: [{ id: 'flow47', bendpoints: [layout.connections[0].bendpoints[1]] }]
  });
  assert.deepEqual(
    partiallyRemoved.model.connections.find((item) => item.businessObject === 'flow47').bendpoints,
    [layout.connections[0].bendpoints[1]]
  );
  assert.equal(partiallyRemoved.validation.ok, true);

  const removed = patchLayout(partiallyRemoved.text, {
    moves: [],
    canvas: layout.canvas,
    connections: [{ id: 'flow47', bendpoints: [] }]
  });
  assert.deepEqual(removed.model.connections.find((item) => item.businessObject === 'flow47').bendpoints, []);
  assert.equal(removed.validation.ok, true);
});

test('webview oferece o comando Ajustar fluxos e carrega o roteador', () => {
  const html = getWebviewHtml(
    { cspSource: 'vscode-resource:' },
    'editor.js',
    'editor.css',
    'nonce',
    'dragGeometry.js',
    'flowRouter.js'
  );
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(html, /id="routeFlows"/);
  assert.match(html, /src="flowRouter\.js"/);
  assert.match(source, /async function adjustFlows/);
  assert.match(source, /connections: \[\.\.\.routed\]/);
  assert.match(source, /routeConnectionsAsync/);
  assert.match(source, /findOrthogonalCrossings/);
});

test('fluxo selecionado oferece alcas para mover bendpoints e segmentos manualmente', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(editorScript, /function renderFlowEditOverlay/);
  assert.match(editorScript, /function beginFlowEditInteraction/);
  assert.match(editorScript, /function shiftedFlowSegment/);
  assert.match(editorScript, /Gravando o ajuste manual do fluxo/);
  assert.match(editorScript, /connections: \[\{ id: interaction\.connectionId, bendpoints:/);
  assert.match(styles, /\.flow-bendpoint-handle/);
  assert.match(styles, /\.flow-segment-handle/);
});

test('ponto azul do fluxo exibe lixeira e persiste a rota redesenhada sem o bendpoint', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  assert.match(editorScript, /class: 'flow-bendpoint-control'/);
  assert.match(editorScript, /class: 'flow-bendpoint-delete'/);
  assert.match(editorScript, /aria-label': 'Excluir ponto do fluxo'/);
  assert.match(editorScript, /function deleteFlowBendpoint/);
  assert.match(editorScript, /candidateIndex !== index/);
  assert.match(editorScript, /Gravando a remocao do ponto e redesenhando o fluxo/);
  assert.match(styles, /\.flow-bendpoint-control:hover \.flow-bendpoint-delete/);
  assert.match(styles, /\.flow-bendpoint-delete-body/);
  assert.match(styles, /\.flow-bendpoint-delete-icon/);
});

test('fluxo selecionado permite reconectar origem e destino por alças próprias', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  const provider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'bpmn', 'FluigProcessEditorProvider.ts'), 'utf8');
  assert.match(editorScript, /flow-endpoint-handle/);
  assert.match(editorScript, /function canReconnectFlowEndpoint/);
  assert.match(editorScript, /type: 'reconnectSequenceFlow'/);
  assert.match(editorScript, /endpoint: interaction\.kind/);
  assert.match(styles, /\.flow-endpoint-handle/);
  assert.match(provider, /message\.type === 'reconnectSequenceFlow'/);
  assert.match(provider, /applySequenceFlowReconnection/);
});

test('webview oferece geração dos arquivos de tradução', () => {
  const html = getWebviewHtml({ cspSource: 'test' }, 'editor.js', 'editor.css', 'nonce');
  assert.match(html, /id="generateTranslations"/);
  assert.match(editorScript, /type: 'generateTranslations'/);
});

test('pontas das setas usam proporcao visual reduzida em todos os tipos de fluxo', () => {
  const html = getWebviewHtml(
    { cspSource: 'vscode-resource:' },
    'editor.js',
    'editor.css',
    'nonce'
  );
  assert.equal((html.match(/markerWidth="7" markerHeight="7"/g) ?? []).length, 3);
  assert.equal((html.match(/M0,0 L0,5 L6\.5,2\.5 z/g) ?? []).length, 3);
});

test('fluxos usam as cores semanticas do Fluig inclusive nas setas e rotulos', () => {
  const styles = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.css'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'media', 'bpmn', 'editor.js'), 'utf8');
  assert.match(styles, /\.flow \{[^}]*stroke: #000;/);
  assert.match(styles, /\.flow\.return-flow \{ stroke: #e53935;/);
  assert.match(styles, /\.flow\.automatic-flow \{ stroke: #2da44e;/);
  assert.match(styles, /\.flow-label \{ fill: #000;/);
  assert.match(styles, /\.return-arrow-head \{ fill: #e53935; \}/);
  assert.match(styles, /\.automatic-arrow-head \{ fill: #2da44e; \}/);
  assert.match(source, /const marker = documentaryAssociation \? '' : \(automatic \? 'url\(#arrowAutomatic\)' : permitsReturn \? 'url\(#arrowReturn\)' : 'url\(#arrow\)'\)/);
  assert.match(styles, /\.flow\.documentary-association \{[^}]*stroke-dasharray: 6 5;/);
});
