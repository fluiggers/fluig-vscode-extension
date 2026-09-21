'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TranslationPreviewProvider } = require('../../src/bpmn/translationPreviewProvider');

test('prévia de tradução usa URI virtual somente leitura em vez de documento untitled', () => {
  const provider = new TranslationPreviewProvider();
  const vscode = {
    Uri: {
      from(parts) {
        return {
          ...parts,
          toString() { return `${parts.scheme}:${parts.path}?${parts.query}`; }
        };
      }
    }
  };
  const uri = provider.createUri(vscode, 'processo_en_US.properties', 'process.description=Test\r\n');
  assert.equal(uri.scheme, 'fluig-bpmn-preview');
  assert.match(uri.path, /processo_en_US\.properties$/);
  assert.equal(provider.provideTextDocumentContent(uri), 'process.description=Test\r\n');
});
