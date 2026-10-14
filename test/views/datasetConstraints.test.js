'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildConstraints, buildOrder } = require('../../resources/views/dataset/constraints');

const constraint = (fieldName, initialValue, finalValue, contraintType = 'MUST', likeSearch = 'false') => (
  { fieldName, initialValue, finalValue, contraintType, likeSearch }
);

test('cada condição vira a constraint do Fluig e o limite vira sqlLimit', () => {
  assert.deepEqual(buildConstraints([
    { field: 'status', op: 'eq', value: 'Aberto' },
    { field: 'status', op: 'ne', value: 'Cancelado' },
    { field: 'nome', op: 'contains', value: 'silva' },
    { field: 'nome', op: 'starts', value: 'Jo' },
    { field: 'email', op: 'ends', value: '.br' },
    { field: 'data', op: 'between', value: '2026-01-01', valueTo: '2026-12-31' }
  ], { limit: '100' }), [
    constraint('status', 'Aberto', 'Aberto'),
    constraint('status', 'Cancelado', 'Cancelado', 'MUST_NOT'),
    constraint('nome', '%silva%', '%silva%', 'MUST', 'true'),
    constraint('nome', 'Jo%', 'Jo%', 'MUST', 'true'),
    constraint('email', '%.br', '%.br', 'MUST', 'true'),
    constraint('data', '2026-01-01', '2026-12-31'),
    constraint('sqlLimit', '100', '100')
  ]);
});

test('no modo "qualquer um" as condições positivas vão como SHOULD e "diferente" continua MUST_NOT', () => {
  assert.deepEqual(buildConstraints([
    { field: 'a', op: 'eq', value: '1' },
    { field: 'b', op: 'contains', value: 'x' },
    { field: 'c', op: 'ne', value: '2' }
  ], { mode: 'any', limit: '' }), [
    constraint('a', '1', '1', 'SHOULD'),
    constraint('b', '%x%', '%x%', 'SHOULD', 'true'),
    constraint('c', '2', '2', 'MUST_NOT')
  ]);
});

test('ignora filtro sem campo; limite vazio ou inválido não envia sqlLimit; "entre" sem fim usa o início', () => {
  assert.deepEqual(buildConstraints([{ field: '', op: 'eq', value: 'x' }], { limit: '' }), []);
  assert.deepEqual(buildConstraints([], { limit: 'abc' }), []);
  assert.deepEqual(buildConstraints([], { limit: ' 25 ' }), [constraint('sqlLimit', '25', '25')]);
  assert.deepEqual(buildConstraints([{ field: 'n', op: 'between', value: '5', valueTo: '' }], {}), [constraint('n', '5', '5')]);
});

test('ordem: campo e direção no formato do Fluig', () => {
  assert.deepEqual(buildOrder('', false), []);
  assert.deepEqual(buildOrder('nome', false), ['nome']);
  assert.deepEqual(buildOrder('nome', true), ['nome;desc']);
});
