'use strict';

const { descendants, tokenizeXml } = require('./xmlTokenizer');

const BUSINESS_TAGS = new Set([
  'BpmnProcess', 'BpmnPool', 'BpmnSwimLane', 'BpmnTask', 'BpmnGateway',
  'BpmnStartEvent', 'BpmnEndEvent', 'BpmnIntermediateEvent', 'BpmnSubProcess',
  'BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument', 'BpmnGroup', 'SequenceFlow'
]);

const TYPE_LABELS = {
  BpmnTask: {
    '80': 'Atividade', '81': 'Atividade de usuário', '82': 'Atividade de serviço',
    '84': 'Envio de e-mail', '85': 'Atividade manual', '86': 'Regra de negócio', '87': 'Atividade de script'
  },
  BpmnGateway: {
    '120': 'Gateway exclusivo', '121': 'Gateway inclusivo', '126': 'Gateway paralelo', '127': 'Gateway join'
  },
  BpmnStartEvent: {
    '10': 'Início simples', '12': 'Início temporizador', '13': 'Início condicional',
    '14': 'Início por sinal', '16': 'Início múltiplo'
  },
  BpmnEndEvent: {
    '60': 'Fim simples', '63': 'Fim com erro', '64': 'Fim com sinal', '65': 'Fim cancelado',
    '66': 'Fim múltiplo', '68': 'Terminação imediata'
  },
  BpmnIntermediateEvent: {
    '30': 'Intermediário', '32': 'Timer intermediário', '35': 'Condicional intermediário',
    '36': 'Link intermediário', '37': 'Sinal intermediário', '39': 'Múltiplo intermediário',
    '41': 'Recebimento de sinal', '42': 'Recebimento de link', '43': 'Erro de borda'
  },
  BpmnSubProcess: { '100': 'Subprocesso', '101': 'Subprocesso ad-hoc' }
};

function parseProcess(text) {
  const xml = tokenizeXml(text);
  const roots = xml.children;
  const rootNames = roots.map((node) => node.name);
  const xmiRoot = roots.find((node) => node.name === 'xmi:XMI');
  const platformExport = roots.find((node) => node.localName === 'list');
  const pureDiagram = roots.find((node) => node.name === 'pi:Diagram');

  let format = 'unknown';
  if (xmiRoot) format = 'studio-xmi';
  else if (platformExport) format = 'platform-export';
  else if (pureDiagram) format = 'graphiti-shell';

  if (format !== 'studio-xmi') {
    return {
      format,
      supported: false,
      rootNames,
      xml,
      fingerprint: { format },
      elements: [],
      flows: [],
      shapes: [],
      connections: []
    };
  }

  const diagram = xmiRoot.children.find((node) => node.name === 'pi:Diagram');
  const bpmnNodes = xmiRoot.children.filter((node) => BUSINESS_TAGS.has(node.localName));
  const elements = bpmnNodes
    .filter((node) => node.localName !== 'SequenceFlow')
    .map(toBusinessElement);
  const flows = bpmnNodes
    .filter((node) => node.localName === 'SequenceFlow')
    .map(toBusinessElement);
  const shapes = diagram ? extractShapes(diagram) : [];
  const canvasNode = diagram?.children.find((node) => node.localName === 'graphicsAlgorithm') ?? null;
  const canvas = canvasNode ? {
    width: numberAttr(canvasNode, 'width'),
    height: numberAttr(canvasNode, 'height'),
    node: canvasNode
  } : null;
  const shapeById = new Map(shapes.map((shape) => [shape.businessObject, shape]));
  const connections = diagram ? extractConnections(diagram, flows, shapeById) : [];
  const process = elements.find((element) => element.tag === 'BpmnProcess');
  const encodingMatch = text.slice(0, 200).match(/encoding\s*=\s*["']([^"']+)["']/i);

  for (const element of elements) element.shape = shapeById.get(element.id) ?? null;
  for (const flow of flows) flow.connection = connections.find((item) => item.businessObject === flow.id) ?? null;

  return {
    format,
    supported: true,
    rootNames,
    xml,
    diagram,
    canvas,
    process,
    elements,
    flows,
    shapes,
    shapeById,
    connections,
    fingerprint: {
      format,
      version: attr(diagram, 'version') || '',
      encoding: encodingMatch?.[1] ?? 'unknown',
      serializerStyle: /&#x[0-9a-f]+;/i.test(text) ? 'metamodel-hex' : 'plain-or-decimal',
      lineEnding: text.includes('\r\n') ? 'CRLF' : 'LF'
    },
    counts: countElements(elements, flows)
  };
}

function toBusinessElement(node) {
  const attributes = Object.fromEntries(node.attributes.map((item) => [item.name, item.value]));
  const tag = node.localName;
  const type = attributes.type ?? '';
  return {
    id: attributes.id ?? '',
    name: attributes.name ?? '',
    tag,
    type,
    typeLabel: TYPE_LABELS[tag]?.[type] ?? defaultTypeLabel(tag),
    attributes,
    node
  };
}

function defaultTypeLabel(tag) {
  return {
    BpmnProcess: 'Processo', BpmnPool: 'Pool', BpmnSwimLane: 'Raia',
    BpmnAnnotation: 'Anotação', BpmnDatabase: 'Database', BpmnDocument: 'Documento',
    BpmnGroup: 'Grupo', SequenceFlow: 'Fluxo'
  }[tag] ?? tag;
}

function extractShapes(diagram) {
  const shapes = [];
  visitVisualChildren(diagram, 0, 0, shapes, '', 0);
  return shapes;
}

function visitVisualChildren(parent, offsetX, offsetY, shapes, parentBusinessObject, depth) {
  const visualChildren = parent.children.filter((node) => node.localName === 'children');
  for (const child of visualChildren) {
    const ga = child.children.find((node) => node.localName === 'graphicsAlgorithm');
    const link = child.children.find((node) => node.localName === 'link');
    const x = numberAttr(ga, 'x');
    const y = numberAttr(ga, 'y');
    const absoluteX = offsetX + x;
    const absoluteY = offsetY + y;
    const businessObject = attr(link, 'businessObjects');
    if (businessObject) {
      shapes.push({
        businessObject,
        x: absoluteX,
        y: absoluteY,
        localX: x,
        localY: y,
        width: numberAttr(ga, 'width'),
        height: numberAttr(ga, 'height'),
        parentBusinessObject,
        depth,
        graphicsType: attr(ga, 'xsi:type') || ga?.name || '',
        node: child,
        graphicsNode: ga,
        linkNode: link
      });
    }
    visitVisualChildren(
      child,
      absoluteX,
      absoluteY,
      shapes,
      businessObject || parentBusinessObject,
      depth + (businessObject ? 1 : 0)
    );
  }
}

function extractConnections(diagram, flows, shapeById) {
  const flowById = new Map(flows.map((flow) => [flow.id, flow]));
  return diagram.children
    .filter((node) => node.localName === 'connections')
    .map((node) => {
      const link = node.children.find((child) => child.localName === 'link');
      const businessObject = attr(link, 'businessObjects');
      const flow = flowById.get(businessObject);
      const bendpoints = node.children
        .filter((child) => child.localName === 'bendpoints')
        .map((point) => ({ x: numberAttr(point, 'x'), y: numberAttr(point, 'y') }));
      const bendpointNodes = node.children.filter((child) => child.localName === 'bendpoints');
      const sourceShape = flow ? shapeById.get(flow.attributes.sourceRef) : null;
      const targetShape = flow ? shapeById.get(flow.attributes.targetRef) : null;
      return {
        businessObject,
        sourceRef: flow?.attributes.sourceRef ?? '',
        targetRef: flow?.attributes.targetRef ?? '',
        sourceShape,
        targetShape,
        bendpoints,
        bendpointNodes,
        node,
        labelNode: findConnectionLabel(node)
      };
    })
    .filter((connection) => connection.businessObject);
}

function findConnectionLabel(connectionNode) {
  const decorators = connectionNode.children.filter((node) => node.localName === 'connectionDecorators');
  for (const decorator of decorators) {
    if (attr(decorator, 'location') !== '0.5') continue;
    const label = descendants(decorator, (node) => node.localName === 'graphicsAlgorithm')
      .find((node) => attr(node, 'xsi:type') === 'al:Text' || node.name === 'al:Text');
    if (label) return label;
  }
  return null;
}

function countElements(elements, flows) {
  const diagramElements = elements.filter((element) => !['BpmnProcess', 'BpmnPool', 'BpmnSwimLane'].includes(element.tag)).length;
  const counts = { flows: flows.length, diagramElements, totalBusinessObjects: elements.length + flows.length };
  for (const element of elements) {
    counts[element.tag] = (counts[element.tag] ?? 0) + 1;
  }
  return counts;
}

function attr(node, name) {
  return node?.attributeMap?.[name]?.value ?? '';
}

function numberAttr(node, name) {
  const value = Number.parseFloat(attr(node, name));
  return Number.isFinite(value) ? value : 0;
}

module.exports = { BUSINESS_TAGS, TYPE_LABELS, attr, parseProcess };
