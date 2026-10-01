'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bestContextPadPosition, canvasViewBox, connectionShapeSize, constrainedAttachedDelta, directOrthogonalDirections, edgeScrollVelocity, expandedCanvas, fittedCanvas, fullyContained,
  normalizedRectangle, shapeBoundaryPoint, snappedDragDelta, snappedPointDelta, zoomedScrollPosition
} = require('../../media/bpmn/dragGeometry');

test('posiciona o menu do evento anexado para fora da atividade proprietaria', () => {
  const position = bestContextPadPosition({
    anchor: { left: 100, top: 130, right: 135, bottom: 165 },
    panel: { width: 96, height: 24 },
    preferredEdge: 'left',
    obstacles: [{ left: 118, top: 90, right: 224, bottom: 174 }],
    canvas: { right: 1000, bottom: 800 }
  });
  assert.deepEqual(position, { x: 8, y: 136, placement: 'left' });
});

test('desvia o menu contextual de outro elemento proximo', () => {
  const position = bestContextPadPosition({
    anchor: { left: 180, top: 130, right: 215, bottom: 165 },
    panel: { width: 96, height: 24 },
    preferredEdge: 'left',
    obstacles: [
      { left: 198, top: 90, right: 304, bottom: 174 },
      { left: 70, top: 120, right: 178, bottom: 180 }
    ],
    canvas: { right: 1000, bottom: 800 }
  });
  assert.equal(position.placement, 'bottom-right');
  assert.deepEqual({ x: position.x, y: position.y }, { x: 221, y: 171 });
});

test('calcula auto-rolagem progressiva nas quatro bordas', () => {
  assert.equal(edgeScrollVelocity(100, 500), 0);
  assert.ok(edgeScrollVelocity(40, 500) < 0);
  assert.ok(edgeScrollVelocity(4, 500) < edgeScrollVelocity(40, 500));
  assert.ok(edgeScrollVelocity(470, 500) > 0);
  assert.ok(edgeScrollVelocity(499, 500) > edgeScrollVelocity(470, 500));
});

test('converte ponteiro e scroll pelo zoom, aplica grid e protege a origem', () => {
  const delta = snappedDragDelta({
    startPointer: { x: 100, y: 100 },
    currentPointer: { x: 140, y: 40 },
    startScroll: { x: 20, y: 10 },
    currentScroll: { x: 40, y: 30 },
    zoom: 2,
    anchor: { x: 103, y: 52 },
    minimum: { x: 13, y: 12 },
    grid: 10
  });
  assert.deepEqual(delta, { x: 27, y: -12 });
});

test('calcula o arraste por coordenadas SVG reais sem deslocar a pega do mouse', () => {
  const delta = snappedPointDelta({
    startPoint: { x: 240, y: 120 },
    currentPoint: { x: 273, y: 146 },
    anchor: { x: 601, y: 390 },
    minimum: { x: 100, y: 100 },
    grid: 10
  });
  assert.deepEqual(delta, { x: 29, y: 30 });
});

test('limita evento de erro anexado à atividade e à faixa externa do próprio tamanho', () => {
  const child = { left: 690, top: 130, right: 725, bottom: 165 };
  const parent = { left: 600, top: 100, right: 706, bottom: 184 };
  assert.deepEqual(constrainedAttachedDelta({ x: 100, y: -100 }, child, parent), { x: 16, y: -65 });
  assert.deepEqual(constrainedAttachedDelta({ x: -200, y: 200 }, child, parent), { x: -125, y: 54 });
});

test('expande o canvas em blocos e nunca reduz dimensões existentes', () => {
  assert.deepEqual(expandedCanvas(1000, 800, { right: 930, bottom: 610 }), { width: 1200, height: 800 });
  assert.deepEqual(expandedCanvas(1400, 1000, { right: 600, bottom: 500 }), { width: 1400, height: 1000 });
});

test('reajusta o canvas ao conteúdo e remove expansão temporária sem objetos', () => {
  assert.deepEqual(fittedCanvas({ right: 1457, bottom: 824 }), { width: 1600, height: 1000 });
  assert.deepEqual(fittedCanvas({ right: 600, bottom: 500 }), { width: 1000, height: 800 });
});

test('inclui coordenadas negativas no viewBox sem alterar o tamanho lógico do canvas', () => {
  assert.deepEqual(
    canvasViewBox(1800, 1400, { left: -313, top: 46, right: 1604, bottom: 1261 }),
    { x: -400, y: 0, width: 2200, height: 1400 }
  );
  assert.deepEqual(
    canvasViewBox(1000, 800, { left: 40, top: 30, right: 600, bottom: 500 }),
    { x: 0, y: 0, width: 1000, height: 800 }
  );
});

test('normaliza o retângulo de seleção em qualquer direção', () => {
  assert.deepEqual(
    normalizedRectangle({ x: 90, y: 70 }, { x: 20, y: 10 }),
    { left: 20, top: 10, right: 90, bottom: 70, width: 70, height: 60 }
  );
});

test('seleciona somente objetos cem por cento contidos no retângulo', () => {
  const rectangle = normalizedRectangle({ x: 10, y: 10 }, { x: 100, y: 100 });
  assert.equal(fullyContained({ left: 10, top: 10, right: 100, bottom: 100 }, rectangle), true);
  assert.equal(fullyContained({ left: 9, top: 20, right: 80, bottom: 80 }, rectangle), false);
  assert.equal(fullyContained({ left: 20, top: 20, right: 101, bottom: 80 }, rectangle), false);
});

test('mantém o ponto sob o cursor ao aplicar zoom com a roda do mouse', () => {
  assert.deepEqual(
    zoomedScrollPosition({
      scrollLeft: 300,
      scrollTop: 180,
      pointerX: 200,
      pointerY: 120,
      previousZoom: 1,
      nextZoom: 1.2
    }),
    { left: 400, top: 240 }
  );
  assert.deepEqual(
    zoomedScrollPosition({
      scrollLeft: 10,
      scrollTop: 5,
      pointerX: 100,
      pointerY: 80,
      previousZoom: 1,
      nextZoom: 0.2
    }),
    { left: 0, top: 0 }
  );
});

test('projeta conexões ortogonais na borda real do losango', () => {
  const bounds = { x: 450, y: 230, width: 60, height: 60 };
  assert.deepEqual(
    shapeBoundaryPoint(bounds, { x: -217, y: 281 }, 'diamond', true),
    { x: 471, y: 281 }
  );
  assert.deepEqual(
    shapeBoundaryPoint(bounds, { x: 479, y: 577 }, 'diamond', true),
    { x: 479, y: 289 }
  );
});

test('mantém o último segmento ortogonal ao recortar eventos', () => {
  const point = shapeBoundaryPoint(
    { x: 952.5, y: 42.5, width: 35, height: 35 },
    { x: 991, y: 48 },
    'ellipse',
    true
  );
  assert.equal(point.y, 48);
  assert.ok(point.x > 980 && point.x < 988);
});

test('usa o retangulo vertical completo do gateway para conectar como o Eclipse', () => {
  const first = { x: 125, y: 949, width: 60, height: 102 };
  const second = { x: 335, y: 956, width: 60, height: 88 };
  const firstSize = connectionShapeSize(first, 'gateway', { width: 60, height: 60 });
  const secondSize = connectionShapeSize(second, 'gateway', { width: 60, height: 60 });
  const firstCenter = { x: first.x + firstSize.width / 2, y: first.y + firstSize.height / 2 };
  const secondCenter = { x: second.x + secondSize.width / 2, y: second.y + secondSize.height / 2 };

  assert.deepEqual(firstSize, { width: 60, height: 102 });
  assert.deepEqual(secondSize, { width: 60, height: 88 });
  assert.equal(firstCenter.y, secondCenter.y);
  assert.deepEqual(
    shapeBoundaryPoint({ ...first, ...firstSize }, secondCenter, 'rectangle'),
    { x: 185, y: 1000 }
  );
  assert.deepEqual(
    shapeBoundaryPoint({ ...second, ...secondSize }, firstCenter, 'rectangle'),
    { x: 335, y: 1000 }
  );
  assert.deepEqual(
    directOrthogonalDirections(
      { x: 533, y: 949, width: 60, height: 102 },
      { x: 691, y: 950, width: 60, height: 102 }
    ),
    {
      source: { x: 721, y: 1000.5 },
      target: { x: 563, y: 1000.5 }
    }
  );
});
