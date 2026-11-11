'use strict';

const { routeOrthogonal } = require('../../../media/bpmn/flowRouter');
const { connectionShapeSize } = require('../../../media/bpmn/dragGeometry');

// Mesmas dimensões e folgas que o webview usa ao posicionar um elemento novo com o mouse.
const TASK_SIZE = Object.freeze({ width: 106, height: 56 });
const GATEWAY_SIZE = Object.freeze({ width: 60, height: 60, collisionHeight: 102 });
const EVENT_SIZE = Object.freeze({ width: 35, height: 35, collisionWidth: 110, collisionHeight: 65 });
const NODE_SIZES = Object.freeze({
  start: EVENT_SIZE,
  end: EVENT_SIZE,
  intermediate: EVENT_SIZE,
  task: TASK_SIZE,
  subprocess: TASK_SIZE,
  gateway: GATEWAY_SIZE,
  database: { width: 70, height: 141 },
  annotation: { width: 105, height: 55 },
  document: { width: 85, height: 115 }
});
const CONTAINER_TAGS = new Set(['BpmnPool', 'BpmnSwimLane', 'BpmnGroup']);
const GRID = 10;
const GAP = 60;
const ROW_OFFSETS = [0, 80, -80, 160, -160, 240, -240, 320, -320, 400, -400, 480, -480];
const CONTAINER_MARGIN = 6;
const COLUMNS = 8;
const ATTACHED_EVENT_HALF = 15;

/** Posição e rota de um elemento novo ligado à saída de `sourceId`, sem sobrepor nada. */
function placeConnected(data, sourceId, size) {
  const scene = sceneOf(data);
  const source = scene.boundsById.get(sourceId);
  if (!source) throw new Error(`A origem ${sourceId} não possui shape no diagrama.`);
  const container = innermostContainer(scene, source);
  const centerY = scene.visualCenterY.get(sourceId);
  const height = size.collisionHeight ?? size.height;
  const candidates = (bounds) => {
    const positions = new Map();
    for (let column = 0; column < COLUMNS; column += 1) {
      for (const offset of ROW_OFFSETS) {
        const x = snap(source.right + GAP + (column * (size.width + GAP)));
        const row = Math.round(centerY - (size.height / 2) + offset);
        const y = bounds
          ? Math.min(Math.max(row, bounds.top + CONTAINER_MARGIN), bounds.bottom - CONTAINER_MARGIN - height)
          : Math.max(0, row);
        positions.set(`${x},${y}`, { x, y });
      }
    }
    return [...positions.values()];
  };
  const routed = (position) => {
    if (collides(scene, position, size, sourceId)) return null;
    const target = rectangle(position, size);
    if (Math.abs(centerY - ((target.top + target.bottom) / 2)) <= 1 && clearBetween(scene, source, target, [sourceId])) {
      return { ...position, bendpoints: [] };
    }
    const route = routeOrthogonal({
      sourceBounds: source,
      targetBounds: target,
      obstacles: routingObstacles(scene, [sourceId]),
      existingPaths: scene.paths,
      clearance: 16,
      obstacleMargin: 12
    });
    return route ? { ...position, bendpoints: route.bendpoints.map(({ x, y }) => ({ x, y })) } : null;
  };
  if (container) {
    for (const position of candidates(container.bounds)) {
      if (!contains(container.bounds, collisionRectangle(position, size))) continue;
      const placement = routed(position);
      if (placement) return { ...placement, outsideContainerId: '' };
    }
  }
  for (const position of candidates(null)) {
    const placement = routed(position);
    if (placement) return { ...placement, outsideContainerId: container?.id ?? '' };
  }
  throw new Error(`Não há área livre perto de ${sourceId}; informe x e y.`);
}

/** Primeira área livre para um elemento solto: dentro da primeira raia ou pool, se houver. */
function placeIsolated(data, size) {
  const scene = sceneOf(data);
  const container = scene.containers.find((item) => item.tag === 'BpmnSwimLane')
    ?? scene.containers.find((item) => item.tag === 'BpmnPool');
  const area = container
    ? { left: container.bounds.left + 40, top: container.bounds.top + 20, right: container.bounds.right, bottom: container.bounds.bottom }
    : { left: 60, top: 60, right: 60 + (12 * (size.width + GAP)), bottom: 60 + (40 * 90) };
  for (let y = snap(area.top); y + size.height <= area.bottom; y += 30) {
    for (let x = snap(area.left); x + size.width <= area.right; x += 30) {
      if (!collides(scene, { x, y }, size, '')) return { x, y };
    }
  }
  return below(scene);
}

/** Pools e raias independentes entram abaixo de tudo que já existe. */
function placeContainer(data) {
  return below(sceneOf(data));
}

/** Pontos de dobra de um fluxo novo entre dois elementos existentes. */
function routeBetween(data, sourceId, targetId) {
  const scene = sceneOf(data);
  const source = scene.boundsById.get(sourceId);
  const target = scene.boundsById.get(targetId);
  if (!source || !target) return [];
  const aligned = Math.abs(scene.visualCenterY.get(sourceId) - scene.visualCenterY.get(targetId)) <= 1;
  if (aligned && clearBetween(scene, source, target, [sourceId, targetId])) return [];
  const route = routeOrthogonal({
    sourceBounds: source,
    targetBounds: target,
    obstacles: routingObstacles(scene, [sourceId, targetId]),
    existingPaths: scene.paths,
    clearance: 16,
    obstacleMargin: 12
  });
  return route ? route.bendpoints.map(({ x, y }) => ({ x, y })) : [];
}

/** Captura de erro centrada na borda inferior da atividade de serviço. */
function attachedErrorPosition(data, taskId) {
  const bounds = sceneOf(data).boundsById.get(taskId);
  if (!bounds) throw new Error(`A atividade ${taskId} não possui shape no diagrama.`);
  return {
    x: Math.round((((bounds.left + bounds.right) / 2) - ATTACHED_EVENT_HALF) / 5) * 5,
    y: Math.round((bounds.bottom - ATTACHED_EVENT_HALF) / 5) * 5
  };
}

function sceneOf(data) {
  const elementById = new Map(data.elements.map((element) => [element.id, element]));
  const boundsById = new Map();
  const visualCenterY = new Map();
  const nodes = [];
  const containers = [];
  for (const shape of data.shapes) {
    const element = elementById.get(shape.businessObject);
    if (!element) continue;
    const size = connectionShapeSize(shape, element.tag === 'BpmnGateway' ? 'gateway' : 'rectangle');
    const bounds = { left: shape.x, top: shape.y, right: shape.x + size.width, bottom: shape.y + size.height };
    boundsById.set(element.id, bounds);
    // O rótulo de gateways fica abaixo do losango: alinhar pelo desenho mantém o fluxo reto.
    visualCenterY.set(element.id, shape.y + ((shape.visualHeight || size.height) / 2));
    if (CONTAINER_TAGS.has(element.tag)) containers.push({ id: element.id, tag: element.tag, bounds });
    else nodes.push({ id: element.id, element, bounds });
  }
  const paths = data.connections
    .filter((connection) => connection.source && connection.target)
    .map((connection) => [connection.source, ...connection.bendpoints, connection.target]);
  return { boundsById, visualCenterY, nodes, containers, paths };
}

function routingObstacles(scene, excludedIds) {
  return scene.nodes
    .filter((node) => !excludedIds.includes(node.id))
    .map(({ element, bounds }) => {
      const attached = element.tag === 'BpmnIntermediateEvent' && element.type === '43' && element.attributes.parentTask;
      const labelBelow = (element.tag.includes('Event') && !attached)
        || element.tag === 'BpmnDatabase' || element.tag === 'BpmnDocument';
      return labelBelow ? { ...bounds, bottom: bounds.bottom + 28 } : bounds;
    });
}

/** Dois elementos lado a lado na mesma altura, sem nada no meio: o fluxo sai reto, sem dobras. */
function clearBetween(scene, first, second, excludedIds) {
  const [left, right] = first.right <= second.left ? [first, second] : [second, first];
  if (left.right > right.left) return false;
  const corridor = {
    left: left.right,
    right: right.left,
    top: Math.max(left.top, right.top),
    bottom: Math.min(left.bottom, right.bottom)
  };
  return !routingObstacles(scene, excludedIds).some((bounds) => (
    corridor.left < bounds.right && corridor.right > bounds.left
    && corridor.top < bounds.bottom && corridor.bottom > bounds.top
  ));
}

function collides(scene, position, size, sourceId) {
  const candidate = collisionRectangle(position, size);
  return scene.nodes.some(({ id, bounds }) => id !== sourceId
    && candidate.left < bounds.right
    && candidate.right > bounds.left
    && candidate.top < bounds.bottom
    && candidate.bottom > bounds.top);
}

function collisionRectangle(position, size) {
  const horizontalOffset = ((size.collisionWidth ?? size.width) - size.width) / 2;
  return {
    left: position.x - horizontalOffset,
    top: position.y,
    right: position.x + size.width + horizontalOffset,
    bottom: position.y + (size.collisionHeight ?? size.height)
  };
}

function rectangle(position, size) {
  return { left: position.x, top: position.y, right: position.x + size.width, bottom: position.y + size.height };
}

function innermostContainer(scene, bounds) {
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  return scene.containers
    .filter((item) => item.tag !== 'BpmnGroup'
      && center.x >= item.bounds.left && center.x <= item.bounds.right
      && center.y >= item.bounds.top && center.y <= item.bounds.bottom)
    .sort((left, right) => area(left.bounds) - area(right.bounds))[0] ?? null;
}

function contains(outer, inner) {
  return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
}

function area(bounds) {
  return (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
}

function below(scene) {
  const bottoms = [...scene.boundsById.values()].map((bounds) => bounds.bottom);
  return { x: 40, y: snap((bottoms.length ? Math.max(...bottoms) : 0) + 40) };
}

function snap(value) {
  return Math.max(0, Math.round(value / GRID) * GRID);
}

module.exports = {
  EVENT_SIZE,
  GATEWAY_SIZE,
  NODE_SIZES,
  TASK_SIZE,
  attachedErrorPosition,
  placeConnected,
  placeContainer,
  placeIsolated,
  routeBetween
};
