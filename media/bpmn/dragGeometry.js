(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FluigDragGeometry = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function edgeScrollVelocity(pointerPosition, viewportSize, threshold = 56, maximum = 22) {
    if (!Number.isFinite(pointerPosition) || !Number.isFinite(viewportSize) || viewportSize <= 0) return 0;
    if (pointerPosition < threshold) {
      return -Math.ceil(maximum * Math.min(1, (threshold - pointerPosition) / threshold));
    }
    const trailingDistance = viewportSize - pointerPosition;
    if (trailingDistance < threshold) {
      return Math.ceil(maximum * Math.min(1, (threshold - trailingDistance) / threshold));
    }
    return 0;
  }

  function snappedDragDelta({
    startPointer,
    currentPointer,
    startScroll,
    currentScroll,
    zoom,
    anchor,
    minimum,
    grid = 10
  }) {
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const rawX = ((currentPointer.x - startPointer.x) + (currentScroll.x - startScroll.x)) / scale;
    const rawY = ((currentPointer.y - startPointer.y) + (currentScroll.y - startScroll.y)) / scale;
    let x = snap(anchor.x + rawX, grid) - anchor.x;
    let y = snap(anchor.y + rawY, grid) - anchor.y;
    x = Math.max(x, -minimum.x);
    y = Math.max(y, -minimum.y);
    return { x, y };
  }

  function snappedPointDelta({ startPoint, currentPoint, anchor, minimum, grid = 10 }) {
    let x = snap(anchor.x + currentPoint.x - startPoint.x, grid) - anchor.x;
    let y = snap(anchor.y + currentPoint.y - startPoint.y, grid) - anchor.y;
    x = Math.max(x, -minimum.x);
    y = Math.max(y, -minimum.y);
    return { x, y };
  }

  function alignedCenterPositions(items, orientation) {
    if (!Array.isArray(items) || !items.length) return [];
    if (!['horizontal', 'vertical'].includes(orientation)) {
      throw new Error(`Orientacao de alinhamento invalida: ${orientation}.`);
    }
    const normalized = items.map((item) => ({
      id: String(item?.id ?? ''),
      x: finiteNumber(item?.x, 'x'),
      y: finiteNumber(item?.y, 'y'),
      width: finiteDimension(item?.width, 'width'),
      height: finiteDimension(item?.height, 'height')
    }));
    const anchor = normalized[0];
    const center = orientation === 'horizontal'
      ? anchor.y + (anchor.height / 2)
      : anchor.x + (anchor.width / 2);
    return normalized.map((item) => ({
      id: item.id,
      x: orientation === 'vertical' ? Math.round(center - (item.width / 2)) : item.x,
      y: orientation === 'horizontal' ? Math.round(center - (item.height / 2)) : item.y
    }));
  }

  function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Coordenada invalida em ${label}.`);
    return number;
  }

  function finiteDimension(value, label) {
    const number = finiteNumber(value, label);
    if (number < 0) throw new Error(`Dimensao invalida em ${label}.`);
    return number;
  }

  function constrainedAttachedDelta(delta, childBounds, parentBounds) {
    const childWidth = Math.max(0, childBounds.right - childBounds.left);
    const childHeight = Math.max(0, childBounds.bottom - childBounds.top);
    return {
      x: clamp(delta.x, parentBounds.left - childWidth - childBounds.left, parentBounds.right - childBounds.left),
      y: clamp(delta.y, parentBounds.top - childHeight - childBounds.top, parentBounds.bottom - childBounds.top)
    };
  }

  function constrainedInsideDelta(delta, childBounds, parentBounds, insets = {}) {
    const minimumX = parentBounds.left + (Number(insets.left) || 0) - childBounds.left;
    const maximumX = parentBounds.right - (Number(insets.right) || 0) - childBounds.right;
    const minimumY = parentBounds.top + (Number(insets.top) || 0) - childBounds.top;
    const maximumY = parentBounds.bottom - (Number(insets.bottom) || 0) - childBounds.bottom;
    return {
      x: minimumX > maximumX ? 0 : clamp(delta.x, minimumX, maximumX),
      y: minimumY > maximumY ? 0 : clamp(delta.y, minimumY, maximumY)
    };
  }

  function snappedResizeSize({ startSize, startPoint, currentPoint, minimum, grid = 10 }) {
    const width = snap(startSize.width + currentPoint.x - startPoint.x, grid);
    const height = snap(startSize.height + currentPoint.y - startPoint.y, grid);
    return {
      width: Math.max(Math.ceil(minimum.width), width),
      height: Math.max(Math.ceil(minimum.height), height)
    };
  }

  function expandedCanvas(width, height, bounds, margin = 120, step = 200) {
    return {
      width: growDimension(width, bounds.right + margin, step),
      height: growDimension(height, bounds.bottom + margin, step)
    };
  }

  function fittedCanvas(bounds, margin = 120, step = 200, minimumWidth = 1000, minimumHeight = 800) {
    return {
      width: Math.max(minimumWidth, roundDimension(bounds.right + margin, step)),
      height: Math.max(minimumHeight, roundDimension(bounds.bottom + margin, step))
    };
  }

  function canvasViewBox(canvasWidth, canvasHeight, bounds, step = 200) {
    const safeStep = Number.isFinite(step) && step > 0 ? step : 200;
    const left = Number(bounds?.left) || 0;
    const top = Number(bounds?.top) || 0;
    const right = Math.max(0, Number(canvasWidth) || 0, Number(bounds?.right) || 0);
    const bottom = Math.max(0, Number(canvasHeight) || 0, Number(bounds?.bottom) || 0);
    const x = left < 0 ? Math.floor(left / safeStep) * safeStep : 0;
    const y = top < 0 ? Math.floor(top / safeStep) * safeStep : 0;
    return { x, y, width: right - x, height: bottom - y };
  }

  function normalizedRectangle(start, current) {
    const left = Math.min(start.x, current.x);
    const top = Math.min(start.y, current.y);
    const right = Math.max(start.x, current.x);
    const bottom = Math.max(start.y, current.y);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function fullyContained(bounds, rectangle) {
    return bounds.left >= rectangle.left
      && bounds.top >= rectangle.top
      && bounds.right <= rectangle.right
      && bounds.bottom <= rectangle.bottom;
  }

  function zoomedScrollPosition({ scrollLeft, scrollTop, pointerX, pointerY, previousZoom, nextZoom }) {
    const before = Number.isFinite(previousZoom) && previousZoom > 0 ? previousZoom : 1;
    const after = Number.isFinite(nextZoom) && nextZoom > 0 ? nextZoom : before;
    const ratio = after / before;
    return {
      left: Math.max(0, ((Number(scrollLeft) || 0) + (Number(pointerX) || 0)) * ratio - (Number(pointerX) || 0)),
      top: Math.max(0, ((Number(scrollTop) || 0) + (Number(pointerY) || 0)) * ratio - (Number(pointerY) || 0))
    };
  }

  function shapeBoundaryPoint(bounds, toward, kind = 'rectangle', orthogonal = false) {
    const left = Number(bounds?.x) || 0;
    const top = Number(bounds?.y) || 0;
    const width = Math.max(0, Number(bounds?.width) || 0);
    const height = Math.max(0, Number(bounds?.height) || 0);
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const center = { x: left + halfWidth, y: top + halfHeight };
    const dx = (Number(toward?.x) || 0) - center.x;
    const dy = (Number(toward?.y) || 0) - center.y;
    if ((!dx && !dy) || !halfWidth || !halfHeight) return center;
    if (orthogonal) return orthogonalBoundaryPoint(center, halfWidth, halfHeight, toward, kind, dx, dy);

    let scale;
    if (kind === 'ellipse') {
      scale = 1 / Math.sqrt(((dx * dx) / (halfWidth * halfWidth)) + ((dy * dy) / (halfHeight * halfHeight)));
    } else if (kind === 'diamond') {
      scale = 1 / ((Math.abs(dx) / halfWidth) + (Math.abs(dy) / halfHeight));
    } else {
      const horizontal = halfWidth / Math.abs(dx || Number.EPSILON);
      const vertical = halfHeight / Math.abs(dy || Number.EPSILON);
      scale = Math.min(horizontal, vertical);
    }
    return { x: center.x + (dx * scale), y: center.y + (dy * scale) };
  }

  function connectionShapeSize(shape, kind = 'rectangle', visualSize = {}) {
    const visualWidth = positiveDimension(visualSize?.width, shape?.visualWidth, shape?.width);
    const visualHeight = positiveDimension(visualSize?.height, shape?.visualHeight, shape?.height);
    if (kind !== 'gateway') return { width: visualWidth, height: visualHeight };
    return {
      width: positiveDimension(shape?.width, visualWidth),
      height: positiveDimension(shape?.height, visualHeight + 28)
    };
  }

  function directOrthogonalDirections(sourceBounds, targetBounds) {
    const source = normalizedBounds(sourceBounds);
    const target = normalizedBounds(targetBounds);
    const sourceCenter = { x: (source.left + source.right) / 2, y: (source.top + source.bottom) / 2 };
    const targetCenter = { x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2 };
    const overlapTop = Math.max(source.top, target.top);
    const overlapBottom = Math.min(source.bottom, target.bottom);
    if ((source.right <= target.left || target.right <= source.left) && overlapTop <= overlapBottom) {
      const y = clamp((sourceCenter.y + targetCenter.y) / 2, overlapTop, overlapBottom);
      return {
        source: { x: targetCenter.x, y },
        target: { x: sourceCenter.x, y }
      };
    }
    const overlapLeft = Math.max(source.left, target.left);
    const overlapRight = Math.min(source.right, target.right);
    if ((source.bottom <= target.top || target.bottom <= source.top) && overlapLeft <= overlapRight) {
      const x = clamp((sourceCenter.x + targetCenter.x) / 2, overlapLeft, overlapRight);
      return {
        source: { x, y: targetCenter.y },
        target: { x, y: sourceCenter.y }
      };
    }
    return null;
  }

  function normalizedBounds(bounds) {
    const left = Number(bounds?.x ?? bounds?.left) || 0;
    const top = Number(bounds?.y ?? bounds?.top) || 0;
    const width = Math.max(0, Number(bounds?.width) || 0);
    const height = Math.max(0, Number(bounds?.height) || 0);
    return {
      left,
      top,
      right: Number.isFinite(Number(bounds?.right)) ? Number(bounds.right) : left + width,
      bottom: Number.isFinite(Number(bounds?.bottom)) ? Number(bounds.bottom) : top + height
    };
  }

  function orthogonalBoundaryPoint(center, halfWidth, halfHeight, toward, kind, dx, dy) {
    const horizontal = (Math.abs(dx) / halfWidth) >= (Math.abs(dy) / halfHeight);
    if (horizontal) {
      const y = clamp(Number(toward?.y) || center.y, center.y - halfHeight, center.y + halfHeight);
      const offset = boundaryOffset(kind, halfWidth, halfHeight, Math.abs(y - center.y), true);
      return { x: center.x + (dx < 0 ? -offset : offset), y };
    }
    const x = clamp(Number(toward?.x) || center.x, center.x - halfWidth, center.x + halfWidth);
    const offset = boundaryOffset(kind, halfWidth, halfHeight, Math.abs(x - center.x), false);
    return { x, y: center.y + (dy < 0 ? -offset : offset) };
  }

  function boundaryOffset(kind, halfWidth, halfHeight, crossOffset, horizontal) {
    const primary = horizontal ? halfWidth : halfHeight;
    const cross = horizontal ? halfHeight : halfWidth;
    const ratio = cross ? Math.min(1, crossOffset / cross) : 1;
    if (kind === 'ellipse') return primary * Math.sqrt(Math.max(0, 1 - (ratio * ratio)));
    if (kind === 'diamond') return primary * (1 - ratio);
    return primary;
  }

  function bestContextPadPosition({ anchor, panel, obstacles = [], preferredEdge = 'bottom', canvas = {}, gap = 6, margin = 8 }) {
    const panelWidth = Math.max(0, Number(panel?.width) || 0);
    const panelHeight = Math.max(0, Number(panel?.height) || 0);
    const centerX = anchor.left + ((anchor.right - anchor.left - panelWidth) / 2);
    const centerY = anchor.top + ((anchor.bottom - anchor.top - panelHeight) / 2);
    const positions = {
      left: { x: anchor.left - panelWidth - gap, y: centerY },
      right: { x: anchor.right + gap, y: centerY },
      top: { x: centerX, y: anchor.top - panelHeight - gap },
      bottom: { x: centerX, y: anchor.bottom + gap },
      'top-left': { x: anchor.left - panelWidth - gap, y: anchor.top - panelHeight - gap },
      'bottom-left': { x: anchor.left - panelWidth - gap, y: anchor.bottom + gap },
      'top-right': { x: anchor.right + gap, y: anchor.top - panelHeight - gap },
      'bottom-right': { x: anchor.right + gap, y: anchor.bottom + gap }
    };
    const orders = {
      left: ['left', 'top-left', 'bottom-left', 'top', 'bottom', 'right', 'top-right', 'bottom-right'],
      right: ['right', 'top-right', 'bottom-right', 'top', 'bottom', 'left', 'top-left', 'bottom-left'],
      top: ['top', 'top-left', 'top-right', 'left', 'right', 'bottom', 'bottom-left', 'bottom-right'],
      bottom: ['bottom', 'bottom-left', 'bottom-right', 'left', 'right', 'top', 'top-left', 'top-right']
    };
    const order = orders[preferredEdge] || orders.bottom;
    const maximumX = Number.isFinite(canvas.right) ? Math.max(margin, canvas.right - margin - panelWidth) : Infinity;
    const maximumY = Number.isFinite(canvas.bottom) ? Math.max(margin, canvas.bottom - margin - panelHeight) : Infinity;
    let best = null;
    order.forEach((placement, rank) => {
      const raw = positions[placement];
      const x = clamp(raw.x, margin, maximumX);
      const y = clamp(raw.y, margin, maximumY);
      const rectangle = { left: x, top: y, right: x + panelWidth, bottom: y + panelHeight };
      const overlap = obstacles.reduce((total, obstacle) => total + overlapArea(rectangle, obstacle, 4), 0);
      const displacement = Math.abs(x - raw.x) + Math.abs(y - raw.y);
      const score = (overlap * 1000) + (displacement * 100) + rank;
      if (!best || score < best.score) best = { x, y, placement, score };
    });
    return { x: Math.round(best.x), y: Math.round(best.y), placement: best.placement };
  }

  function overlapArea(first, second, clearance = 0) {
    const left = Math.max(first.left, second.left - clearance);
    const top = Math.max(first.top, second.top - clearance);
    const right = Math.min(first.right, second.right + clearance);
    const bottom = Math.min(first.bottom, second.bottom + clearance);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  function growDimension(current, required, step) {
    if (required <= current) return current;
    return Math.ceil(required / step) * step;
  }

  function roundDimension(required, step) {
    if (!Number.isFinite(step) || step <= 0) return Math.ceil(required);
    return Math.ceil(required / step) * step;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function positiveDimension(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return 0;
  }

  function snap(value, grid) {
    if (!Number.isFinite(grid) || grid <= 0) return value;
    return Math.round(value / grid) * grid;
  }

  return {
    alignedCenterPositions,
    bestContextPadPosition,
    canvasViewBox,
    connectionShapeSize,
    constrainedAttachedDelta,
    constrainedInsideDelta,
    directOrthogonalDirections,
    edgeScrollVelocity,
    expandedCanvas,
    fittedCanvas,
    fullyContained,
    normalizedRectangle,
    snappedDragDelta,
    snappedPointDelta,
    snappedResizeSize,
    shapeBoundaryPoint,
    zoomedScrollPosition
  };
}));
