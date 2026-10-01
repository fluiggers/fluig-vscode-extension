(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FluigFlowRouter = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DIRECTIONS = ['left', 'right', 'top', 'bottom'];

  function roundedPathData(points, radius = 12) {
    return roundedBridgedPathData(points, [], radius);
  }

  function roundedBridgedPathData(points, crossings = [], radius = 12, bridgeRadius = 6) {
    if (!Array.isArray(points) || !points.length) return '';
    if (points.length === 1) return `M ${precise(points[0].x)} ${precise(points[0].y)}`;

    const corners = points.map((_point, index) => roundedCorner(points, index, radius));
    const crossingsBySegment = new Map();
    for (const crossing of crossings) {
      const values = crossingsBySegment.get(crossing.segmentIndex) ?? [];
      values.push(crossing.point);
      crossingsBySegment.set(crossing.segmentIndex, values);
    }

    let data = `M ${precise(points[0].x)} ${precise(points[0].y)}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      const segmentStart = corners[index]?.exit ?? from;
      const segmentEnd = corners[index + 1]?.entry ?? to;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy);
      const unitX = length ? dx / length : 0;
      const unitY = length ? dy / length : 0;
      let normalX = -unitY;
      let normalY = unitX;
      const flipNormal = Math.abs(normalY) > 0.1 ? normalY > 0 : normalX < 0;
      if (flipNormal) {
        normalX *= -1;
        normalY *= -1;
      }
      const startDistance = distanceAlong(from, segmentStart, unitX, unitY);
      const endDistance = distanceAlong(from, segmentEnd, unitX, unitY);
      const orderedCrossings = [...(crossingsBySegment.get(index) ?? [])]
        .map((point) => ({ point, distance: distanceAlong(from, point, unitX, unitY) }))
        .filter((item) => (
          item.distance - bridgeRadius > startDistance
          && item.distance + bridgeRadius < endDistance
        ))
        .sort((left, right) => left.distance - right.distance);

      for (const { point } of orderedCrossings) {
        data += ` L ${precise(point.x - (unitX * bridgeRadius))} ${precise(point.y - (unitY * bridgeRadius))}`;
        data += ` Q ${precise(point.x + (normalX * bridgeRadius))} ${precise(point.y + (normalY * bridgeRadius))}`;
        data += ` ${precise(point.x + (unitX * bridgeRadius))} ${precise(point.y + (unitY * bridgeRadius))}`;
      }
      data += ` L ${precise(segmentEnd.x)} ${precise(segmentEnd.y)}`;
      const corner = corners[index + 1];
      if (corner) {
        data += ` Q ${precise(to.x)} ${precise(to.y)} ${precise(corner.exit.x)} ${precise(corner.exit.y)}`;
      }
    }
    return data;
  }

  function roundedCorner(points, index, radius) {
    if (index <= 0 || index >= points.length - 1 || radius <= 0) return null;
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incoming = { x: current.x - previous.x, y: current.y - previous.y };
    const outgoing = { x: next.x - current.x, y: next.y - current.y };
    const incomingLength = Math.hypot(incoming.x, incoming.y);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
    if (incomingLength < 0.001 || outgoingLength < 0.001) return null;
    const incomingUnit = { x: incoming.x / incomingLength, y: incoming.y / incomingLength };
    const outgoingUnit = { x: outgoing.x / outgoingLength, y: outgoing.y / outgoingLength };
    const directionCross = cross(incomingUnit, outgoingUnit);
    const directionDot = (incomingUnit.x * outgoingUnit.x) + (incomingUnit.y * outgoingUnit.y);
    if (Math.abs(directionCross) < 0.001 || directionDot < -0.999) return null;
    const cut = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    return {
      entry: {
        x: current.x - (incomingUnit.x * cut),
        y: current.y - (incomingUnit.y * cut)
      },
      exit: {
        x: current.x + (outgoingUnit.x * cut),
        y: current.y + (outgoingUnit.y * cut)
      }
    };
  }

  function distanceAlong(origin, point, unitX, unitY) {
    return ((point.x - origin.x) * unitX) + ((point.y - origin.y) * unitY);
  }

  function defaultFlowMarkerSegment(points, along = 10, halfSize = 5) {
    const source = points?.[0];
    if (!source) return null;
    for (let index = 1; index < points.length; index += 1) {
      const target = points[index];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.001) continue;
      const tangentX = dx / length;
      const tangentY = dy / length;
      const normalX = -tangentY;
      const normalY = tangentX;
      return {
        start: {
          x: precise(source.x + (tangentX * (along - halfSize)) + (normalX * halfSize)),
          y: precise(source.y + (tangentY * (along - halfSize)) + (normalY * halfSize))
        },
        end: {
          x: precise(source.x + (tangentX * (along + halfSize)) - (normalX * halfSize)),
          y: precise(source.y + (tangentY * (along + halfSize)) - (normalY * halfSize))
        }
      };
    }
    return null;
  }

  function routeOrthogonal(options) {
    const source = normalizeBounds(options.sourceBounds);
    const target = normalizeBounds(options.targetBounds);
    const clearance = finite(options.clearance, 16);
    const obstacleMargin = finite(options.obstacleMargin, 12);
    const obstacles = (options.obstacles ?? []).map((item) => inflate(normalizeBounds(item), obstacleMargin));
    const existingSegments = (options.existingPaths ?? []).flatMap(polylineSegments);
    let best = null;

    for (const sourcePort of sidePorts(source, clearance)) {
      for (const targetPort of sidePorts(target, clearance)) {
        const search = shortestPath(sourcePort.outward, targetPort.outward, obstacles, existingSegments, clearance);
        if (!search) continue;
        const points = simplifyPolyline([
          sourcePort.boundary,
          sourcePort.outward,
          ...search.points.slice(1, -1),
          targetPort.outward,
          targetPort.boundary
        ]);
        const cost = search.cost
          + portBias(sourcePort.side, source, target)
          + portBias(targetPort.side, target, source)
          + (Math.max(0, points.length - 2) * 18);
        if (!best || cost < best.cost || (cost === best.cost && pointKey(points) < pointKey(best.points))) {
          best = { cost, points, bendpoints: points.slice(1, -1) };
        }
      }
    }
    return best;
  }

  function shortestPath(start, end, obstacles, existingSegments, clearance) {
    const xValues = coordinateSet(start.x, end.x, [
      ...obstacles.flatMap((item) => [item.left, item.right]),
      ...existingSegments.flatMap((item) => [item.a.x, item.b.x])
    ], clearance);
    const yValues = coordinateSet(start.y, end.y, [
      ...obstacles.flatMap((item) => [item.top, item.bottom]),
      ...existingSegments.flatMap((item) => [item.a.y, item.b.y])
    ], clearance);
    const nodes = [];
    const byCoordinate = new Map();
    const rows = new Map();
    const columns = new Map();

    for (const x of xValues) {
      for (const y of yValues) {
        const point = { x, y };
        if (obstacles.some((obstacle) => pointInside(point, obstacle))) continue;
        const index = nodes.push(point) - 1;
        byCoordinate.set(coordinateKey(point), index);
        appendMap(rows, y, index);
        appendMap(columns, x, index);
      }
    }
    const startIndex = byCoordinate.get(coordinateKey(start));
    const endIndex = byCoordinate.get(coordinateKey(end));
    if (startIndex === undefined || endIndex === undefined) return null;

    const adjacency = Array.from({ length: nodes.length }, () => []);
    connectLines(rows, nodes, adjacency, obstacles, 'x');
    connectLines(columns, nodes, adjacency, obstacles, 'y');

    const heap = new MinHeap();
    const distance = new Map();
    const previous = new Map();
    const initialKey = stateKey(startIndex, 'N');
    distance.set(initialKey, 0);
    heap.push({ key: initialKey, node: startIndex, direction: 'N', cost: 0 });
    let final = null;

    while (heap.size) {
      const current = heap.pop();
      if (current.cost !== distance.get(current.key)) continue;
      if (current.node === endIndex) {
        final = current;
        break;
      }
      for (const edge of adjacency[current.node]) {
        const a = nodes[current.node];
        const b = nodes[edge.node];
        const direction = a.x === b.x ? 'V' : 'H';
        const bendCost = current.direction !== 'N' && current.direction !== direction ? 34 : 0;
        const crossingCost = segmentCrossingScore({ a, b }, existingSegments);
        const cost = current.cost + edge.length + bendCost + crossingCost;
        const key = stateKey(edge.node, direction);
        if (cost >= (distance.get(key) ?? Number.POSITIVE_INFINITY)) continue;
        distance.set(key, cost);
        previous.set(key, current.key);
        heap.push({ key, node: edge.node, direction, cost });
      }
    }
    if (!final) return null;

    const indexes = [];
    let cursor = final.key;
    while (cursor) {
      indexes.push(Number(cursor.split('|')[0]));
      cursor = previous.get(cursor);
    }
    indexes.reverse();
    return { cost: final.cost, points: simplifyPolyline(indexes.map((index) => nodes[index])) };
  }

  function connectLines(lines, nodes, adjacency, obstacles, axis) {
    for (const indexes of lines.values()) {
      indexes.sort((left, right) => nodes[left][axis] - nodes[right][axis]);
      for (let index = 1; index < indexes.length; index += 1) {
        const from = indexes[index - 1];
        const to = indexes[index];
        const a = nodes[from];
        const b = nodes[to];
        if (!segmentClear(a, b, obstacles)) continue;
        const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        adjacency[from].push({ node: to, length });
        adjacency[to].push({ node: from, length });
      }
    }
  }

  function findOrthogonalCrossings(routes, minimumDistance = 11) {
    const result = new Map();
    const entries = routes.map((route) => ({ ...route, segments: polylineSegments(route.points) }));
    for (let rightIndex = 1; rightIndex < entries.length; rightIndex += 1) {
      const over = entries[rightIndex];
      for (let leftIndex = 0; leftIndex < rightIndex; leftIndex += 1) {
        const under = entries[leftIndex];
        over.segments.forEach((first, segmentIndex) => {
          under.segments.forEach((second) => {
            const point = segmentIntersection(first, second);
            if (!point || nearSegmentEnd(first, point, minimumDistance) || nearSegmentEnd(second, point, minimumDistance)) return;
            const crossings = result.get(over.id) ?? [];
            if (!crossings.some((item) => item.segmentIndex === segmentIndex && samePoint(item.point, point))) {
              crossings.push({ segmentIndex, point });
              result.set(over.id, crossings);
            }
          });
        });
      }
    }
    return result;
  }

  function simplifyPolyline(points) {
    const unique = [];
    for (const point of points) {
      const normalized = { x: round(point.x), y: round(point.y) };
      if (!unique.length || !samePoint(unique.at(-1), normalized)) unique.push(normalized);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 1; index < unique.length - 1; index += 1) {
        const previous = unique[index - 1];
        const current = unique[index];
        const next = unique[index + 1];
        if ((previous.x === current.x && current.x === next.x) || (previous.y === current.y && current.y === next.y)) {
          unique.splice(index, 1);
          changed = true;
          break;
        }
      }
    }
    return unique;
  }

  function polylineSegments(points) {
    const segments = [];
    for (let index = 1; index < (points?.length ?? 0); index += 1) {
      const a = points[index - 1];
      const b = points[index];
      if (!samePoint(a, b)) segments.push({ a, b });
    }
    return segments;
  }

  function sidePorts(bounds, clearance) {
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    return [
      { side: 'left', boundary: { x: bounds.left, y: centerY }, outward: { x: bounds.left - clearance, y: centerY } },
      { side: 'right', boundary: { x: bounds.right, y: centerY }, outward: { x: bounds.right + clearance, y: centerY } },
      { side: 'top', boundary: { x: centerX, y: bounds.top }, outward: { x: centerX, y: bounds.top - clearance } },
      { side: 'bottom', boundary: { x: centerX, y: bounds.bottom }, outward: { x: centerX, y: bounds.bottom + clearance } }
    ].filter((port) => port.outward.x >= 0 && port.outward.y >= 0);
  }

  function coordinateSet(start, end, values, clearance) {
    const all = [start, end, ...values].filter(Number.isFinite);
    const minimum = Math.max(0, Math.min(...all) - clearance);
    const maximum = Math.max(...all) + clearance;
    return [...new Set([...all, minimum, maximum].map(round))].sort((a, b) => a - b);
  }

  function segmentClear(a, b, obstacles) {
    if (a.x !== b.x && a.y !== b.y) return false;
    return !obstacles.some((obstacle) => segmentCutsInterior(a, b, obstacle));
  }

  function segmentCutsInterior(a, b, obstacle) {
    if (a.y === b.y) {
      if (!(a.y > obstacle.top && a.y < obstacle.bottom)) return false;
      return intervalsOverlapInterior(a.x, b.x, obstacle.left, obstacle.right);
    }
    if (!(a.x > obstacle.left && a.x < obstacle.right)) return false;
    return intervalsOverlapInterior(a.y, b.y, obstacle.top, obstacle.bottom);
  }

  function segmentCrossingScore(segment, existingSegments) {
    let score = 0;
    for (const existing of existingSegments) {
      if (perpendicularIntersectionInclusive(segment, existing)) score += 1000;
      else if (collinearOverlap(segment, existing)) score += 1600;
    }
    return score;
  }

  function perpendicularIntersection(first, second) {
    const firstHorizontal = first.a.y === first.b.y;
    const secondHorizontal = second.a.y === second.b.y;
    if (firstHorizontal === secondHorizontal) return null;
    const horizontal = firstHorizontal ? first : second;
    const vertical = firstHorizontal ? second : first;
    const x = vertical.a.x;
    const y = horizontal.a.y;
    if (!betweenStrict(x, horizontal.a.x, horizontal.b.x) || !betweenStrict(y, vertical.a.y, vertical.b.y)) return null;
    return { x: round(x), y: round(y) };
  }

  function segmentIntersection(first, second) {
    const r = { x: first.b.x - first.a.x, y: first.b.y - first.a.y };
    const s = { x: second.b.x - second.a.x, y: second.b.y - second.a.y };
    const denominator = cross(r, s);
    if (Math.abs(denominator) < 0.000001) return null;
    const offset = { x: second.a.x - first.a.x, y: second.a.y - first.a.y };
    const firstRatio = cross(offset, s) / denominator;
    const secondRatio = cross(offset, r) / denominator;
    if (firstRatio <= 0 || firstRatio >= 1 || secondRatio <= 0 || secondRatio >= 1) return null;
    return {
      x: precise(first.a.x + (firstRatio * r.x)),
      y: precise(first.a.y + (firstRatio * r.y))
    };
  }

  function perpendicularIntersectionInclusive(first, second) {
    const firstHorizontal = first.a.y === first.b.y;
    const secondHorizontal = second.a.y === second.b.y;
    if (firstHorizontal === secondHorizontal) return null;
    const horizontal = firstHorizontal ? first : second;
    const vertical = firstHorizontal ? second : first;
    const x = vertical.a.x;
    const y = horizontal.a.y;
    if (!betweenInclusive(x, horizontal.a.x, horizontal.b.x) || !betweenInclusive(y, vertical.a.y, vertical.b.y)) return null;
    return { x: round(x), y: round(y) };
  }

  function collinearOverlap(first, second) {
    if (first.a.y === first.b.y && second.a.y === second.b.y && first.a.y === second.a.y) {
      return intervalsOverlapInterior(first.a.x, first.b.x, second.a.x, second.b.x);
    }
    if (first.a.x === first.b.x && second.a.x === second.b.x && first.a.x === second.a.x) {
      return intervalsOverlapInterior(first.a.y, first.b.y, second.a.y, second.b.y);
    }
    return false;
  }

  function portBias(side, from, toward) {
    const dx = ((toward.left + toward.right) - (from.left + from.right)) / 2;
    const dy = ((toward.top + toward.bottom) - (from.top + from.bottom)) / 2;
    const preferred = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
    if (side === preferred) return 0;
    if ((side === 'left' && preferred === 'right') || (side === 'right' && preferred === 'left')
      || (side === 'top' && preferred === 'bottom') || (side === 'bottom' && preferred === 'top')) return 90;
    return 24;
  }

  function normalizeBounds(bounds) {
    return {
      left: Math.min(bounds.left, bounds.right),
      top: Math.min(bounds.top, bounds.bottom),
      right: Math.max(bounds.left, bounds.right),
      bottom: Math.max(bounds.top, bounds.bottom)
    };
  }

  function inflate(bounds, margin) {
    return { left: bounds.left - margin, top: bounds.top - margin, right: bounds.right + margin, bottom: bounds.bottom + margin };
  }

  function pointInside(point, bounds) {
    return point.x > bounds.left && point.x < bounds.right && point.y > bounds.top && point.y < bounds.bottom;
  }

  function intervalsOverlapInterior(a1, a2, b1, b2) {
    return Math.max(Math.min(a1, a2), Math.min(b1, b2)) < Math.min(Math.max(a1, a2), Math.max(b1, b2));
  }

  function betweenStrict(value, first, second) {
    return value > Math.min(first, second) && value < Math.max(first, second);
  }

  function betweenInclusive(value, first, second) {
    return value >= Math.min(first, second) && value <= Math.max(first, second);
  }

  function nearSegmentEnd(segment, point, distance) {
    return manhattan(segment.a, point) < distance || manhattan(segment.b, point) < distance;
  }

  function appendMap(map, key, value) {
    const values = map.get(key) ?? [];
    values.push(value);
    map.set(key, values);
  }

  function stateKey(node, direction) { return `${node}|${direction}`; }
  function coordinateKey(point) { return `${round(point.x)},${round(point.y)}`; }
  function pointKey(points) { return points.map(coordinateKey).join(';'); }
  function samePoint(a, b) { return round(a.x) === round(b.x) && round(a.y) === round(b.y); }
  function cross(a, b) { return (a.x * b.y) - (a.y * b.x); }
  function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
  function precise(value) { return Math.round(value * 100) / 100; }
  function round(value) { return Math.round(value); }

  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(item) {
      this.items.push(item);
      let index = this.items.length - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (this.items[parent].cost <= item.cost) break;
        this.items[index] = this.items[parent];
        index = parent;
      }
      this.items[index] = item;
    }
    pop() {
      const root = this.items[0];
      const tail = this.items.pop();
      if (!this.items.length) return root;
      let index = 0;
      while (true) {
        const left = (index * 2) + 1;
        const right = left + 1;
        if (left >= this.items.length) break;
        const child = right < this.items.length && this.items[right].cost < this.items[left].cost ? right : left;
        if (this.items[child].cost >= tail.cost) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = tail;
      return root;
    }
  }

  return {
    DIRECTIONS,
    defaultFlowMarkerSegment,
    findOrthogonalCrossings,
    polylineSegments,
    roundedBridgedPathData,
    roundedPathData,
    routeOrthogonal,
    simplifyPolyline
  };
}));
