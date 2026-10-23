'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractServerCatalog, extractServerConfigurations, matchesServer, pickCatalogServer } = require('../../src/bpmn/serverCatalog');

test('extrai somente identificacao segura dos servidores cadastrados', () => {
  const source = JSON.stringify({ configurations: [{
    id: 'future-id',
    name: 'Future',
    host: 'primeclub.futurestation.com.br',
    username: 'usuario-secreto',
    password: 'senha-secreta'
  }] });
  const catalog = extractServerCatalog(source);
  assert.ok(catalog.length >= 1);
  assert.deepEqual(catalog[0], {
    value: 'future',
    label: 'Future (primeclub.futurestation.com.br)'
  });
  assert.equal(JSON.stringify(catalog).includes('password'), false);
  assert.equal(JSON.stringify(catalog).includes('username'), false);
  assert.deepEqual(Object.keys(catalog[0]).sort(), ['label', 'value']);
});

test('aceita id explicito, elimina duplicatas e ignora JSON invalido', () => {
  const source = JSON.stringify({ configurations: [
    { name: 'Teste', host: 'teste.local', serverId: 'homologacao', username: 'secret' },
    { name: 'Duplicado', serverId: 'homologacao' }
  ] });
  assert.deepEqual(extractServerCatalog(source), [
    { value: 'homologacao', label: 'Teste (teste.local)' }
  ]);
  assert.deepEqual(extractServerCatalog('{'), []);
});

test('resolve a conexão pelo valor gravado no processo, nome ou id interno', () => {
  const configuration = { id: 'uuid-interno', name: 'Future', host: 'fluig.local' };
  assert.equal(matchesServer(configuration, 'future'), true);
  assert.equal(matchesServer(configuration, 'Future'), true);
  assert.equal(matchesServer(configuration, 'uuid-interno'), true);
  assert.equal(matchesServer(configuration, 'outro'), false);
  assert.equal(extractServerConfigurations('{"configurations":[]}').length, 0);
});

test('catálogos de atribuição usam o único servidor configurado quando o processo não tem serverId', () => {
  const unico = { name: 'Produção', host: 'fluig.local' };
  const outro = { name: 'Homologação', host: 'hml.local' };
  assert.equal(pickCatalogServer([unico], ''), unico);
  assert.equal(pickCatalogServer([unico, outro], ''), null);
  assert.equal(pickCatalogServer([], ''), null);
  assert.equal(pickCatalogServer([unico, outro], 'homologação'), outro);
  assert.equal(pickCatalogServer([unico], 'inexistente'), null);
});
