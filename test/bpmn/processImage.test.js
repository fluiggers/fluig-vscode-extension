'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseProcess } = require('../../src/bpmn/processModel');
const { toWebviewData } = require('../../src/bpmn/webviewData');
const { decodeXml, descendants, tokenizeXml } = require('../../src/bpmn/xmlTokenizer');
const { renderProcessImageSvg } = require('../../src/bpmn/processImage');

function fixtureText() {
  return fs.readFileSync(path.join(__dirname, 'fixtures', 'project', 'workflow', 'diagrams', 'toexportbpmnteste.process'), 'utf8');
}

function attribute(node, name) {
  return node?.attributeMap?.[name]?.value;
}

test('desenha a imagem do processo em SVG a partir da geometria do diagrama', () => {
  const text = fixtureText();
  const svg = renderProcessImageSvg(text);
  const data = toWebviewData(parseProcess(text), null);
  const elementsById = new Map(data.elements.map((element) => [element.id, element]));

  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\r?\n<svg /);
  assert.equal(renderProcessImageSvg(text), svg);

  const xml = tokenizeXml(svg);
  assert.equal(xml.children.length, 1);
  const root = xml.children[0];
  assert.equal(root.name, 'svg');
  assert.equal(attribute(root, 'xmlns'), 'http://www.w3.org/2000/svg');
  assert.equal(attribute(root, 'xmlns:xlink'), 'http://www.w3.org/1999/xlink');
  assert.equal(attribute(root, 'version'), '1.0');
  assert.equal(attribute(root, 'contentScriptType'), 'text/ecmascript');
  assert.equal(attribute(root, 'contentStyleType'), 'text/css');
  assert.equal(attribute(root, 'preserveAspectRatio'), 'xMidYMid meet');
  assert.equal(attribute(root, 'zoomAndPan'), 'magnify');
  assert.equal(attribute(root, 'viewBox'), undefined);
  const width = Number(attribute(root, 'width'));
  const height = Number(attribute(root, 'height'));
  assert.ok(Number.isInteger(width) && width > 0);
  assert.ok(Number.isInteger(height) && height > 0);
  const translatedDiagram = descendants(root, (node) => node.name === 'g' && /^translate\(/.test(attribute(node, 'transform') || ''))[0];
  assert.ok(translatedDiagram, 'conteudo do diagrama deve ser deslocado para coordenadas positivas');
  for (const shape of data.shapes) {
    assert.ok(shape.x + shape.visualWidth <= width, `${shape.businessObject} fora da largura`);
    assert.ok(shape.y + shape.visualHeight <= height, `${shape.businessObject} fora da altura`);
  }

  const groupsById = new Map(descendants(root, (node) => node.name === 'g' && attribute(node, 'id'))
    .map((node) => [attribute(node, 'id'), node]));
  for (const shape of data.shapes) {
    const group = groupsById.get(shape.businessObject);
    assert.ok(group, `forma ausente: ${shape.businessObject}`);
    const element = elementsById.get(shape.businessObject);
    const drawn = descendants(group, (node) => ['rect', 'ellipse', 'polygon'].includes(node.name));
    assert.ok(drawn.length >= 1, `forma sem desenho: ${shape.businessObject}`);
    if (element.code) assert.equal(attribute(group, 'sequence'), element.code);
  }
  const startEllipse = descendants(groupsById.get('startevent4'), (node) => node.name === 'ellipse')[0];
  const intermediateEllipses = descendants(groupsById.get('intermediatelink26'), (node) => node.name === 'ellipse');
  const endEllipse = descendants(groupsById.get('endevent12'), (node) => node.name === 'ellipse')[0];
  assert.equal(descendants(groupsById.get('startevent4'), (node) => node.name === 'ellipse').length, 1);
  assert.equal(attribute(startEllipse, 'fill'), '#80FF80');
  assert.equal(attribute(intermediateEllipses[0], 'fill'), '#FFFF83');
  assert.equal(attribute(endEllipse, 'fill'), '#DC6468');
  assert.equal(descendants(groupsById.get('intermediatelink26'), (node) => node.name === 'path').length, 1);
  assert.equal(descendants(groupsById.get('exclusivegateway39'), (node) => node.name === 'polygon').length, 1);
  assert.equal(descendants(groupsById.get('exclusivegateway39'), (node) => node.name === 'path').length, 0);
  const endStroke = attribute(endEllipse, 'stroke-width');
  const startStroke = attribute(startEllipse, 'stroke-width');
  assert.ok(Number(endStroke) > Number(startStroke));

  const texts = descendants(root, (node) => node.name === 'tspan')
    .map((node) => decodeXml(svg.slice(node.openEnd, node.closeStart)));
  const joined = texts.join(' ');
  for (const task of data.elements.filter((element) => element.tag === 'BpmnTask')) {
    for (const word of task.name.split(/\s+/)) assert.ok(joined.includes(word), `texto ausente: ${task.name}`);
  }

  const flows = data.elements.filter((element) => element.tag === 'SequenceFlow');
  for (const flow of flows) {
    const group = groupsById.get(flow.id);
    assert.ok(group, `fluxo ausente: ${flow.id}`);
    const paths = descendants(group, (node) => node.name === 'path');
    assert.equal(paths.length, 1);
    assert.equal(attribute(paths[0], 'stroke-linejoin'), 'round');
    assert.equal(descendants(group, (node) => node.name === 'polygon').length, 1, `seta ausente: ${flow.id}`);
  }
  assert.match(svg, /<path d="[^"]* Q [^"]*" fill="none" stroke="#404040"/);
  assert.ok(texts.includes('INICIO_PARA_ATIVIDADE'));
});

test('escapa nomes com caracteres especiais de XML', () => {
  const text = fixtureText().replace('name="Atividade de teste eclipse"', 'name="A &amp; B &lt;C&gt; &quot;q&quot; &apos;s&apos;"');
  const svg = renderProcessImageSvg(text);
  const root = tokenizeXml(svg).children[0];
  const texts = descendants(root, (node) => node.name === 'tspan')
    .map((node) => decodeXml(svg.slice(node.openEnd, node.closeStart)));

  assert.ok(texts.join(' ').includes('A & B <C> "q" \'s\''));
  assert.ok(svg.includes('A &amp; B &lt;C&gt;'));
});
