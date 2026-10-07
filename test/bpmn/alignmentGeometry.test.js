'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { alignedCenterPositions } = require('../../media/bpmn/dragGeometry');

test('alinha horizontalmente pelos centros usando o primeiro elemento como referencia', () => {
  const result = alignedCenterPositions([
    { id: 'task1', x: 100, y: 80, width: 106, height: 70 },
    { id: 'gateway2', x: 280, y: 210, width: 60, height: 60 },
    { id: 'event3', x: 420, y: 330, width: 35, height: 35 }
  ], 'horizontal');

  assert.deepEqual(result, [
    { id: 'task1', x: 100, y: 80 },
    { id: 'gateway2', x: 280, y: 85 },
    { id: 'event3', x: 420, y: 98 }
  ]);
});

test('alinha verticalmente pelos centros e preserva a coordenada y', () => {
  const result = alignedCenterPositions([
    { id: 'task1', x: 100, y: 80, width: 106, height: 70 },
    { id: 'gateway2', x: 280, y: 210, width: 60, height: 60 },
    { id: 'event3', x: 420, y: 330, width: 35, height: 35 }
  ], 'vertical');

  assert.deepEqual(result, [
    { id: 'task1', x: 100, y: 80 },
    { id: 'gateway2', x: 123, y: 210 },
    { id: 'event3', x: 136, y: 330 }
  ]);
});

test('recusa orientacao desconhecida e geometria invalida', () => {
  assert.throws(() => alignedCenterPositions([{ id: 'task1', x: 0, y: 0, width: 10, height: 10 }], 'diagonal'));
  assert.throws(() => alignedCenterPositions([{ id: 'task1', x: 0, y: 0, width: -1, height: 10 }], 'horizontal'));
});
