'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { fluigProjectEntries } = require('../../src/services/fluigProject');

test('projeto novo segue a estrutura do Studio, com processo, literais e formulário form_<nome>', () => {
  const entries = fluigProjectEntries('pagamento', {
    processText: '<process/>',
    literals: new Map([['pt_BR', 'pt'], ['en_US', 'en'], ['es', 'es']]),
    formHtml: '<html/>'
  });
  assert.deepEqual(entries.map((entry) => entry.path), [
    '.project',
    'datasets/',
    'events/',
    'mechanisms/',
    'wcm/widget/',
    'forms/form_pagamento/form_pagamento.html',
    'forms/form_pagamento/events/',
    'workflow/diagrams/pagamento.process',
    'workflow/literals/pagamento_pt_BR.properties',
    'workflow/literals/pagamento_en_US.properties',
    'workflow/literals/pagamento_es.properties',
    'workflow/scripts/'
  ]);
  const content = new Map(entries.map((entry) => [entry.path, entry.content]));
  assert.equal(content.get('workflow/diagrams/pagamento.process'), '<process/>');
  assert.equal(content.get('workflow/literals/pagamento_en_US.properties'), 'en');
  assert.equal(content.get('forms/form_pagamento/form_pagamento.html'), '<html/>');
  assert.equal(content.get('datasets/'), undefined);
});

test('.project igual ao do Fluig Studio, com o nome do projeto', () => {
  const [project] = fluigProjectEntries('pagamento', { processText: '', literals: new Map(), formHtml: '' });
  assert.equal(project.content, fs.readFileSync(path.join(__dirname, 'fixtures', 'studio.project'), 'utf8'));
});
