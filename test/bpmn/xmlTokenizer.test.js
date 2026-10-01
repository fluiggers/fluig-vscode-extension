'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeXml, encodeXmlAttribute, tokenizeXml } = require('../../src/bpmn/xmlTokenizer');

test('tokenizer preserva offsets e árvore', () => {
  const xml = '<?xml version="1.0"?><root><item id="x" name="A&#xe7;&#xe3;o"/></root>';
  const document = tokenizeXml(xml);
  const root = document.children[0];
  const item = root.children[0];
  assert.equal(root.name, 'root');
  assert.equal(item.attributeMap.id.value, 'x');
  assert.equal(item.attributeMap.name.value, 'Ação');
  assert.equal(xml.slice(item.start, item.openEnd), '<item id="x" name="A&#xe7;&#xe3;o"/>');
});

test('codec mantém saída ASCII e quebras explícitas', () => {
  const encoded = encodeXmlAttribute('Título\r\nDescrição & "x"');
  assert.equal(encoded, 'T&#xed;tulo&#xD;&#xA;Descri&#xe7;&#xe3;o &amp; &quot;x&quot;');
  assert.equal(decodeXml(encoded), 'Título\r\nDescrição & "x"');
});
