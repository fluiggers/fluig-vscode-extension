'use strict';

const { parseProcess } = require('./processModel');
const { toWebviewData } = require('./webviewData');
const { roundedPathData } = require('../../media/bpmn/flowRouter');

const MARGIN = 20;
const FONT_SIZE = 11;
const LINE_HEIGHT = 13;
const CHAR_WIDTH = 6;
const STROKE = '#404040';
const CONTAINER_TAGS = new Set(['BpmnPool', 'BpmnSwimLane']);

/**
 * Renders the process drawing sent to Fluig as "<processId>.processimage.svg".
 * Plain and deterministic: it reuses the editor geometry and does not try to be pixel-perfect.
 * @param {string|object} source .process text or a model returned by parseProcess
 */
function renderProcessImageSvg(source) {
  const model = typeof source === 'string' ? parseProcess(source) : source;
  if (!model?.supported) {
    throw new Error('Nao foi possivel gerar a imagem do processo: o arquivo .process nao esta no formato do Fluig Studio.');
  }
  const data = toWebviewData(model, null);
  const elementsById = new Map(data.elements.map((element) => [element.id, element]));
  const shapes = data.shapes
    .map((shape, index) => ({ shape, element: elementsById.get(shape.businessObject), index }))
    .filter((item) => item.element);
  const layer = (item) => {
    if (CONTAINER_TAGS.has(item.element.tag)) {
      return 0;
    }
    return item.element.tag === 'BpmnGroup' ? 1 : 2;
  };
  shapes.sort((left, right) => (
    layer(left) - layer(right)
    || (layer(left) === 0 ? left.shape.depth - right.shape.depth : 0)
    || left.index - right.index
  ));
  const connections = data.connections
    .filter((connection) => connection.source && connection.target)
    .map((connection) => ({
      connection,
      element: elementsById.get(connection.businessObject),
      points: [connection.source, ...connection.bendpoints, connection.target]
    }));

  const xs = [];
  const ys = [];
  for (const { shape } of shapes) {
    xs.push(shape.x, shape.x + shape.visualWidth);
    ys.push(shape.y, shape.y + shape.visualHeight + labelBelowHeight(elementsById.get(shape.businessObject)));
  }
  for (const { points } of connections) {
    for (const point of points) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }
  const minX = Math.min(0, Math.floor(Math.min(...xs, 0) - MARGIN));
  const minY = Math.min(0, Math.floor(Math.min(...ys, 0) - MARGIN));
  const width = Math.ceil(Math.max(...xs, 0) + MARGIN) - minX;
  const height = Math.ceil(Math.max(...ys, 0) + MARGIN) - minY;
  const translateX = -minX;
  const translateY = -minY;

  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `
      + `width="${width}" height="${height}" version="1.0" `
      + 'contentScriptType="text/ecmascript" contentStyleType="text/css" '
      + 'preserveAspectRatio="xMidYMid meet" zoomAndPan="magnify" '
      + 'style="stroke-dasharray:none; shape-rendering:auto; font-family:\'Arial\'; text-rendering:auto; '
      + 'fill-opacity:1; color-interpolation:auto; color-rendering:auto; font-size:12; fill:black; stroke:black; '
      + 'image-rendering:auto; stroke-miterlimit:10; stroke-linecap:square; stroke-linejoin:miter; font-style:normal; '
      + 'stroke-width:1; stroke-dashoffset:0; font-weight:normal; stroke-opacity:1;">',
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF" stroke="none"/>`,
    `<g transform="translate(${n(translateX)} ${n(translateY)})">`
  ];
  for (const { shape, element } of shapes) {
    parts.push(renderShape(shape, element));
  }
  for (const item of connections) {
    parts.push(renderConnection(item));
  }
  parts.push('</g>', '</svg>', '');
  return parts.join('\n');
}

function renderShape(shape, element) {
  const x = shape.x;
  const y = shape.y;
  const width = shape.visualWidth;
  const height = shape.visualHeight;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const sequence = element.code ? ` sequence="${element.code}"` : '';
  const labelSequence = element.id.match(/(\d+)$/)?.[1];
  const open = `<g id="${escapeXml(element.id)}"${sequence}>`;
  const label = (content) => (content
    ? `<g${labelSequence ? ` componentSequence="${labelSequence}"` : ''}>${content}</g>`
    : '');

  if (CONTAINER_TAGS.has(element.tag)) {
    const header = Math.min(30, width);
    const fill = colorAttribute(element.attributes?.cores, '#FFFFFF');
    const labelX = x + header / 2;
    return `${open}<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="${fill}" stroke="${STROKE}"/>`
      + `<line x1="${n(x + header)}" y1="${n(y)}" x2="${n(x + header)}" y2="${n(y + height)}" stroke="${STROKE}"/></g>`
      + label(textBlock([element.name], labelX, cy, 'bold', `rotate(-90 ${n(labelX)} ${n(cy)})`));
  }
  if (element.tag === 'BpmnGroup') {
    return `${open}<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="5" ry="5" fill="none" stroke="${STROKE}" stroke-dasharray="6 3"/></g>`
      + label(textBlock(wrapText(element.name, width - 10), cx, y + 4 + LINE_HEIGHT / 2));
  }
  if (element.tag.includes('Event')) {
    const radius = Math.min(width, height) / 2;
    const strokeWidth = element.tag === 'BpmnEndEvent' ? 3 : 1;
    const colors = eventColors(element.tag);
    const inner = element.tag === 'BpmnIntermediateEvent'
      ? `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius - 3)}" fill="none" stroke="${colors.stroke}"/>`
      : '';
    return `${open}<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(radius)}" ry="${n(radius)}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="${strokeWidth}"/>${inner}${eventMarker(element, cx, cy, colors.marker)}</g>`
      + label(textBelow(element.name, cx, y + height, width));
  }
  if (element.tag === 'BpmnGateway') {
    const diamond = [[cx, y], [x + width, cy], [cx, y + height], [x, cy]];
    return `${open}<polygon points="${points(diamond)}" fill="#FFFFE1" stroke="${STROKE}"/>${gatewayMarker(element.type, cx, cy)}</g>`
      + label(textBelow(element.name, cx, y + height, width));
  }
  if (element.tag === 'BpmnDocument') {
    const fold = Math.min(12, width / 3, height / 3);
    const outline = [[x, y], [x + width - fold, y], [x + width, y + fold], [x + width, y + height], [x, y + height]];
    return `${open}<polygon points="${points(outline)}" fill="#FFFFFF" stroke="${STROKE}"/></g>`
      + label(textBelow(element.name, cx, y + height, width));
  }
  if (element.tag === 'BpmnDatabase') {
    const lid = Math.min(10, height / 4);
    return `${open}<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="${n(width / 2)}" ry="${n(lid)}" fill="#FFFFFF" stroke="${STROKE}"/>`
      + `<path d="M ${n(x)} ${n(y + lid)} Q ${n(cx)} ${n(y + lid * 3)} ${n(x + width)} ${n(y + lid)}" fill="none" stroke="${STROKE}"/></g>`
      + label(textBelow(element.name, cx, y + height, width));
  }
  if (element.tag === 'BpmnAnnotation') {
    return `${open}<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="#FFFFFF" stroke="${STROKE}" stroke-dasharray="3 3"/></g>`
      + label(textBlock(wrapText(element.name, width - 8), cx, cy));
  }

  const strokeWidth = element.tag === 'BpmnSubProcess' ? 2 : 1;
  const marker = element.tag === 'BpmnSubProcess'
    ? `<rect x="${n(cx - 6)}" y="${n(y + height - 14)}" width="12" height="12" fill="none" stroke="${STROKE}"/>`
      + `<path d="M ${n(cx - 4)} ${n(y + height - 8)} H ${n(cx + 4)} M ${n(cx)} ${n(y + height - 12)} V ${n(y + height - 4)}" stroke="${STROKE}"/>`
    : '';
  return `${open}<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="8" ry="8" fill="#EDF5FF" stroke="#172080" stroke-width="${strokeWidth}"/>${marker}</g>`
    + label(textBlock(wrapText(element.name, width - 8), cx, cy));
}

function gatewayMarker(type, cx, cy) {
  if (type === '120') return '';
  if (type === '121') {
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="10" fill="none" stroke="${STROKE}" stroke-width="3"/>`;
  }
  return `<path d="M ${n(cx - 10)} ${n(cy)} H ${n(cx + 10)} M ${n(cx)} ${n(cy - 10)} V ${n(cy + 10)}" stroke="${STROKE}" stroke-width="3"/>`;
}

function eventColors(tag) {
  if (tag === 'BpmnStartEvent') return { fill: '#80FF80', stroke: '#16873C', marker: '#137535' };
  if (tag === 'BpmnIntermediateEvent') return { fill: '#FFFF83', stroke: '#AFA900', marker: '#6B6500' };
  return { fill: '#DC6468', stroke: '#8E2930', marker: '#701E23' };
}

function eventMarker(element, cx, cy, color) {
  const key = `${element.tag}:${element.type}`;
  const stroke = `stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;
  if (['BpmnStartEvent:12', 'BpmnIntermediateEvent:32'].includes(key)) {
    const ticks = [[0, -8, 0, -6], [8, 0, 6, 0], [0, 8, 0, 6], [-8, 0, -6, 0]]
      .map(([x1, y1, x2, y2]) => `<line x1="${n(cx + x1)}" y1="${n(cy + y1)}" x2="${n(cx + x2)}" y2="${n(cy + y2)}" ${stroke}/>`)
      .join('');
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="8" fill="none" ${stroke}/>`
      + `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(cx)}" y2="${n(cy - 5)}" ${stroke}/>`
      + `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(cx + 4)}" y2="${n(cy + 2)}" ${stroke}/>${ticks}`;
  }
  if (['BpmnStartEvent:13', 'BpmnIntermediateEvent:35'].includes(key)) {
    const lines = [-4, 0, 4]
      .map((offset) => `<line x1="${n(cx - 4)}" y1="${n(cy + offset)}" x2="${n(cx + 4)}" y2="${n(cy + offset)}" ${stroke}/>`)
      .join('');
    return `<rect x="${n(cx - 7)}" y="${n(cy - 9)}" width="14" height="18" rx="1" fill="none" ${stroke}/>${lines}`;
  }
  if (['BpmnStartEvent:14', 'BpmnEndEvent:64', 'BpmnIntermediateEvent:37', 'BpmnIntermediateEvent:41'].includes(key)) {
    const filled = ['BpmnEndEvent:64', 'BpmnIntermediateEvent:37'].includes(key);
    return `<polygon points="${points([[cx, cy - 9], [cx + 9, cy + 7], [cx - 9, cy + 7]])}" fill="${filled ? color : 'none'}" ${stroke}/>`;
  }
  if (['BpmnStartEvent:16', 'BpmnEndEvent:66', 'BpmnIntermediateEvent:39'].includes(key)) {
    const polygon = Array.from({ length: 5 }, (_, index) => {
      const angle = (-90 + (index * 72)) * Math.PI / 180;
      return [cx + Math.cos(angle) * 9, cy + Math.sin(angle) * 9];
    });
    return `<polygon points="${points(polygon)}" fill="${key === 'BpmnStartEvent:16' ? 'none' : color}" ${stroke}/>`;
  }
  if (['BpmnEndEvent:63', 'BpmnIntermediateEvent:43'].includes(key)) {
    return `<polyline points="${points([[cx + 3, cy - 10], [cx - 4, cy - 1], [cx + 1, cy + 1], [cx - 3, cy + 10], [cx + 6, cy - 2], [cx + 1, cy - 3]])}" fill="none" ${stroke}/>`;
  }
  if (key === 'BpmnEndEvent:65') {
    return `<path d="M ${n(cx - 7)} ${n(cy - 7)} L ${n(cx + 7)} ${n(cy + 7)} M ${n(cx + 7)} ${n(cy - 7)} L ${n(cx - 7)} ${n(cy + 7)}" fill="none" ${stroke}/>`;
  }
  if (key === 'BpmnEndEvent:68') {
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="9" fill="${color}" stroke="${color}"/>`;
  }
  if (['BpmnIntermediateEvent:36', 'BpmnIntermediateEvent:42'].includes(key)) {
    const forward = key.endsWith(':36');
    const d = forward
      ? `M ${n(cx - 9)} ${n(cy - 5)} H ${n(cx + 1)} V ${n(cy - 9)} L ${n(cx + 10)} ${n(cy)} L ${n(cx + 1)} ${n(cy + 9)} V ${n(cy + 5)} H ${n(cx - 9)} Z`
      : `M ${n(cx + 9)} ${n(cy - 5)} H ${n(cx - 1)} V ${n(cy - 9)} L ${n(cx - 10)} ${n(cy)} L ${n(cx - 1)} ${n(cy + 9)} V ${n(cy + 5)} H ${n(cx + 9)} Z`;
    return `<path d="${d}" fill="${color}" stroke="${color}"/>`;
  }
  return '';
}

function renderConnection({ connection, element, points: path }) {
  const target = path[path.length - 1];
  const previous = [...path].reverse().find((point) => point.x !== target.x || point.y !== target.y) ?? path[0];
  const length = Math.hypot(target.x - previous.x, target.y - previous.y) || 1;
  const ux = (target.x - previous.x) / length;
  const uy = (target.y - previous.y) / length;
  const arrow = [
    [target.x, target.y],
    [target.x - ux * 10 - uy * 4, target.y - uy * 10 + ux * 4],
    [target.x - ux * 10 + uy * 4, target.y - uy * 10 - ux * 4]
  ];
  let label = '';
  if (element?.name) {
    const segment = Math.floor((path.length - 1) / 2);
    const middle = {
      x: (path[segment].x + path[segment + 1].x) / 2,
      y: (path[segment].y + path[segment + 1].y) / 2
    };
    label = textBlock([element.name], middle.x, middle.y - LINE_HEIGHT / 2 - 2);
  }
  return `<g id="${escapeXml(connection.businessObject)}">`
    + `<path d="${roundedPathData(path)}" fill="none" stroke="${STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<polygon points="${points(arrow)}" fill="${STROKE}" stroke="${STROKE}"/></g>`
    + label;
}

function labelBelowHeight(element) {
  if (!element || !hasLabelBelow(element)) {
    return 0;
  }
  return 4 + wrapText(element.name, 120).length * LINE_HEIGHT;
}

function hasLabelBelow(element) {
  return element.tag.includes('Event') || ['BpmnGateway', 'BpmnDocument', 'BpmnDatabase'].includes(element.tag);
}

function textBelow(name, cx, bottom, width) {
  const lines = wrapText(name, Math.max(width, 120));
  return textBlock(lines, cx, bottom + 4 + (lines.length * LINE_HEIGHT) / 2);
}

function textBlock(lines, cx, cy, weight = 'normal', transform = '') {
  const visible = lines.filter((line) => line !== '');
  if (!visible.length) {
    return '';
  }
  const top = cy - (visible.length * LINE_HEIGHT) / 2 + LINE_HEIGHT - 3;
  const spans = visible
    .map((line, index) => `<tspan x="${n(cx)}" y="${n(top + index * LINE_HEIGHT)}">${escapeXml(line)}</tspan>`)
    .join('');
  const rotation = transform ? ` transform="${transform}"` : '';
  return `<text text-anchor="middle" font-weight="${weight}" stroke="none" fill="#202020"${rotation}>${spans}</text>`;
}

function wrapText(value, maxWidth) {
  const maxChars = Math.max(4, Math.floor(maxWidth / CHAR_WIDTH));
  const lines = [];
  for (const paragraph of String(value ?? '').split(/\r\n|\r|\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

function colorAttribute(value, fallback) {
  const color = String(value ?? '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(color) ? `#${color.toUpperCase()}` : fallback;
}

function points(list) {
  return list.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
}

function n(value) {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function escapeXml(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = { renderProcessImageSvg };
