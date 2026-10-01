'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  defaultFlowMarkerSegment,
  findOrthogonalCrossings,
  polylineSegments,
  roundedBridgedPathData,
  roundedPathData,
  routeOrthogonal
} = require('../../media/bpmn/flowRouter');

const sourceBounds = { left: 0, top: 40, right: 40, bottom: 80 };
const targetBounds = { left: 240, top: 40, right: 280, bottom: 80 };

test('posiciona o traço do fluxo padrão junto à origem em qualquer direção', () => {
  assert.deepEqual(
    defaultFlowMarkerSegment([{ x: 40, y: 60 }, { x: 240, y: 60 }]),
    { start: { x: 45, y: 65 }, end: { x: 55, y: 55 } }
  );
  assert.deepEqual(
    defaultFlowMarkerSegment([{ x: 100, y: 100 }, { x: 100, y: 40 }]),
    { start: { x: 105, y: 95 }, end: { x: 95, y: 85 } }
  );
  assert.equal(defaultFlowMarkerSegment([{ x: 10, y: 10 }]), null);
});

test('usa linha direta quando origem e destino estao alinhados e livres', () => {
  const route = routeOrthogonal({ sourceBounds, targetBounds });
  assert.deepEqual(route.points, [{ x: 40, y: 60 }, { x: 240, y: 60 }]);
  assert.deepEqual(route.bendpoints, []);
});

test('desvia de componentes com margem e produz rota ortogonal deterministica', () => {
  const obstacle = { left: 100, top: 20, right: 160, bottom: 100 };
  const first = routeOrthogonal({ sourceBounds, targetBounds, obstacles: [obstacle] });
  const second = routeOrthogonal({ sourceBounds, targetBounds, obstacles: [obstacle] });
  assert.deepEqual(first, second);
  assert.ok(first.bendpoints.length >= 2);
  for (const segment of polylineSegments(first.points)) {
    assert.equal(cutsRectangleInterior(segment, inflate(obstacle, 12)), false);
  }
});

test('prefere contornar um fluxo existente quando o cruzamento e evitavel', () => {
  const existing = [[{ x: 120, y: 0 }, { x: 120, y: 120 }]];
  const route = routeOrthogonal({ sourceBounds, targetBounds, existingPaths: existing });
  assert.ok(route.points.some((point) => point.y > 120));
});

test('identifica o fluxo superior para desenhar ponte em cruzamento inevitavel', () => {
  const crossings = findOrthogonalCrossings([
    { id: 'horizontal', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
    { id: 'vertical', points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] }
  ]);
  assert.deepEqual(crossings.get('vertical'), [{ segmentIndex: 0, point: { x: 50, y: 50 } }]);
  assert.equal(crossings.has('horizontal'), false);
});

test('identifica cruzamentos diagonais e nao ignora rotas que compartilham outra extremidade', () => {
  const crossings = findOrthogonalCrossings([
    { id: 'ascending', points: [{ x: 0, y: 100 }, { x: 100, y: 0 }, { x: 160, y: 0 }] },
    { id: 'descending', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 160, y: 0 }] }
  ]);
  assert.deepEqual(crossings.get('descending'), [{ segmentIndex: 0, point: { x: 50, y: 50 } }]);
});

test('arredonda os cotovelos sem alterar as extremidades do fluxo', () => {
  assert.equal(
    roundedPathData([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }]),
    'M 0 0 L 88 0 Q 100 0 100 12 L 100 80'
  );
  assert.equal(
    roundedPathData([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }]),
    'M 0 0 L 6 0 Q 10 0 10 4 L 10 8'
  );
  assert.equal(roundedPathData([{ x: 0, y: 0 }, { x: 100, y: 0 }]), 'M 0 0 L 100 0');
});

test('preserva pontes de cruzamento junto aos cantos arredondados', () => {
  const path = roundedBridgedPathData(
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }],
    [{ segmentIndex: 0, point: { x: 50, y: 0 } }]
  );
  assert.equal(path, 'M 0 0 L 44 0 Q 50 -6 56 0 L 88 0 Q 100 0 100 12 L 100 80');
});

function inflate(bounds, margin) {
  return { left: bounds.left - margin, top: bounds.top - margin, right: bounds.right + margin, bottom: bounds.bottom + margin };
}

function cutsRectangleInterior(segment, bounds) {
  if (segment.a.y === segment.b.y) {
    return segment.a.y > bounds.top && segment.a.y < bounds.bottom
      && Math.max(Math.min(segment.a.x, segment.b.x), bounds.left) < Math.min(Math.max(segment.a.x, segment.b.x), bounds.right);
  }
  return segment.a.x > bounds.left && segment.a.x < bounds.right
    && Math.max(Math.min(segment.a.y, segment.b.y), bounds.top) < Math.min(Math.max(segment.a.y, segment.b.y), bounds.bottom);
}
