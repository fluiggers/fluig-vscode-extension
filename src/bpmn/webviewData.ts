'use strict';

const { BOOLEAN_PROPERTIES, allowedPropertiesFor, messageDataValues } = require('./processPatcher');
const { decodeXml, descendants } = require('./xmlTokenizer');
const { gatewayBranchDefinitions } = require('./gatewayConditions');
const { taskAssignmentDefinition } = require('./taskAssignment');
const { eventTriggerDefinition } = require('./eventTrigger');
const { eventInitializerDefinition } = require('./eventInitializer');
const { taskNotificationsDefinition } = require('./taskNotifications');
const { taskJointDefinition } = require('./taskJoint');
const { taskDeadlineDefinition } = require('./taskDeadline');
const { taskMobileDefinition } = require('./taskMobile');
const { taskAttachmentRulesDefinition } = require('./taskAttachmentRules');
const { extendedPropertiesDefinition } = require('./extendedProperties');
const { taskScriptDefinition } = require('./taskScript');
const { processGeneralDefinition } = require('./processGeneral');
const { processVersionDefinition } = require('./processVersion');
const { processFormDefinition } = require('./processForm');
const { processManagerDefinition } = require('./processManager');
const { processAttachmentSecurityDefinition } = require('./processAttachmentSecurity');
const { subProcessFormMapDefinition } = require('./subProcessFormMap');

function toWebviewData(model, validation, options = {}) {
  const businessById = new Map([...model.elements, ...model.flows].map((element) => [element.id, element]));
  const signalCatalog = signalCatalogFromElements(model.elements);
  const intermediateLinkCatalog = intermediateLinkCatalogFromElements(model.elements);
  const elements = [...model.elements, ...model.flows].map((element) => ({
    id: element.id,
    code: diagramElementCode(element),
    name: element.name,
    tag: element.tag,
    type: element.type,
    typeLabel: element.typeLabel,
    attributes: element.attributes,
    configurationIssues: elementConfigurationIssues(element, businessById),
    editableProperties: editablePropertyDefinitions(
      element,
      options.formFields ?? [],
      signalCatalog,
      options.processCatalog ?? [],
      intermediateLinkCatalog,
      businessById
    ),
    processGeneralEditor: processGeneralDefinition(
      element,
      options.volumeCatalog ?? [],
      options.expedientCatalog ?? [],
      options.serverCatalog ?? []
    ),
    processVersionEditor: processVersionDefinition(element),
    processFormEditor: processFormDefinition(element, options.localFormCatalog ?? []),
    processAttachmentSecurityEditor: processAttachmentSecurityDefinition(
      element,
      businessById,
      options.formFields ?? [],
      options.mechanismCatalog ?? []
    ),
    subProcessFormMapEditor: subProcessFormMapDefinition(
      element,
      options.subProcessFormFieldCatalogs?.[element.id] ?? {}
    ),
    processManagerEditor: processManagerDefinition(
      element,
      businessById,
      options.formFields ?? [],
      options.mechanismCatalog ?? []
    ),
    eventTriggerEditor: eventTriggerDefinition(element),
    eventInitializerEditor: eventInitializerDefinition(element, options.userCatalog ?? []),
    taskNotificationsEditor: taskNotificationsDefinition(element),
    taskDeadlineEditor: taskDeadlineDefinition(
      element,
      options.formFields ?? [],
      options.expedientCatalog ?? []
    ),
    taskJointEditor: taskJointDefinition(element),
    taskMobileEditor: taskMobileDefinition(
      element,
      model.flows,
      businessById,
      options.formFields ?? []
    ),
    taskAttachmentRulesEditor: taskAttachmentRulesDefinition(element, options.formFields ?? []),
    extendedPropertiesEditor: extendedPropertiesDefinition(element),
    taskScriptEditor: taskScriptDefinition(element, model.process?.id),
    gatewayConditionEditor: gatewayBranchDefinitions(
      element,
      model.flows,
      businessById,
      options.formFields ?? [],
      options.mechanismCatalog ?? []
    ),
    taskAssignmentEditor: taskAssignmentDefinition(
      element,
      businessById,
      options.formFields ?? [],
      options.mechanismCatalog ?? []
    )
  }));
  const shapes = model.shapes.map((shape) => {
    const size = visualSize(shape, businessById.get(shape.businessObject));
    return {
      businessObject: shape.businessObject,
      x: shape.x,
      y: shape.y,
      localX: shape.localX,
      localY: shape.localY,
      width: shape.width,
      height: shape.height,
      parentBusinessObject: shape.parentBusinessObject,
      depth: shape.depth,
      visualWidth: size.width,
      visualHeight: size.height,
      graphicsType: shape.graphicsType
    };
  });
  const connections = model.connections.map((connection) => ({
    businessObject: connection.businessObject,
    sourceRef: connection.sourceRef,
    targetRef: connection.targetRef,
    bendpoints: connection.bendpoints,
    ...connectionEndpoints(connection, businessById)
  }));
  return {
    supported: model.supported,
    extensionVersion: String(options.extensionVersion ?? ''),
    userCatalog: [...(options.userCatalog ?? [])],
    roleCatalog: [...(options.roleCatalog ?? [])],
    groupCatalog: [...(options.groupCatalog ?? [])],
    format: model.format,
    fingerprint: model.fingerprint,
    canvas: model.canvas ? { width: model.canvas.width, height: model.canvas.height } : null,
    counts: model.counts,
    elements,
    shapes,
    connections,
    validation
  };
}

function diagramElementCode(element) {
  if (['BpmnProcess', 'BpmnPool', 'BpmnSwimLane', 'BpmnAnnotation', 'BpmnGroup', 'SequenceFlow'].includes(element.tag)) {
    return '';
  }
  return element.id.match(/(\d+)$/)?.[1] ?? '';
}

function editablePropertyDefinitions(element, formFields, signalCatalog, processCatalog, intermediateLinkCatalog, businessById) {
  const syntheticValues = element.tag === 'BpmnTask' && element.type === '84'
    ? messageDataValues(element.attributes.messageData)
    : {};
  const propertyNames = isDocumentaryAssociation(element, businessById)
    ? [...allowedPropertiesFor(element)].filter((name) => name === 'name')
    : [...allowedPropertiesFor(element)];
  return propertyNames.map((name) => (
    propertyDefinition(
      name,
      Object.hasOwn(syntheticValues, name) ? syntheticValues[name] : element.attributes[name],
      { formFields, signalCatalog, processCatalog, intermediateLinkCatalog }
    )
  ));
}

function intermediateLinkCatalogFromElements(elements) {
  return elements
    .filter((element) => element.tag === 'BpmnIntermediateEvent' && element.type === '42')
    .map((element) => ({
      value: element.id,
      label: `${element.id} - ${element.name || element.typeLabel}`
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
}

function signalCatalogFromElements(elements) {
  const signals = new Map();
  for (const element of elements) {
    const triggers = String(element.attributes?.triggers ?? '');
    const blocks = triggers.match(/<org\.eclipse\.bpmn2\.documentacional\.BpmnSignalData>[\s\S]*?<\/org\.eclipse\.bpmn2\.documentacional\.BpmnSignalData>/g) ?? [];
    for (const block of blocks) {
      const id = decodeXml(block.match(/<signalId>([^<]*)<\/signalId>/)?.[1] ?? '').trim();
      const value = decodeXml(block.match(/<value>([\s\S]*?)<\/value>/)?.[1] ?? '').trim();
      if (/^[1-9]\d*$/.test(id)) signals.set(id, value || `Sinal ${id}`);
    }
  }
  for (const element of elements) {
    if (!supportsDirectSignal(element)) continue;
    const id = String(element.attributes?.signalId ?? '').trim();
    if (/^[1-9]\d*$/.test(id) && !signals.has(id)) signals.set(id, `Sinal ${id}`);
  }
  return [...signals]
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([value, label]) => ({ value, label }));
}

function supportsDirectSignal(element) {
  return [
    'BpmnStartEvent:14',
    'BpmnEndEvent:64',
    'BpmnIntermediateEvent:37',
    'BpmnIntermediateEvent:41'
  ].includes(`${element.tag}:${element.type}`);
}

function center(shape, element) {
  const size = visualSize(shape, element);
  return { x: shape.x + size.width / 2, y: shape.y + size.height / 2 };
}

function connectionEndpoints(connection, businessById) {
  if (!connection.sourceShape || !connection.targetShape) return { source: null, target: null };
  const sourceElement = businessById.get(connection.sourceRef);
  const targetElement = businessById.get(connection.targetRef);
  const sourceCenter = center(connection.sourceShape, sourceElement);
  const targetCenter = center(connection.targetShape, targetElement);
  const firstDirection = connection.bendpoints[0] ?? targetCenter;
  const lastDirection = connection.bendpoints.at(-1) ?? sourceCenter;
  return {
    source: boundaryPoint(connection.sourceShape, sourceElement, firstDirection),
    target: boundaryPoint(connection.targetShape, targetElement, lastDirection)
  };
}

function boundaryPoint(shape, element, toward) {
  const size = visualSize(shape, element);
  const origin = center(shape, element);
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  if (dx === 0 && dy === 0) return origin;
  let scale;
  if (element?.tag?.includes('Event')) {
    const radius = Math.min(size.width, size.height) / 2;
    scale = radius / Math.hypot(dx, dy);
  } else if (element?.tag === 'BpmnGateway') {
    scale = 1 / ((Math.abs(dx) / (size.width / 2)) + (Math.abs(dy) / (size.height / 2)));
  } else {
    const horizontal = dx === 0 ? Number.POSITIVE_INFINITY : (size.width / 2) / Math.abs(dx);
    const vertical = dy === 0 ? Number.POSITIVE_INFINITY : (size.height / 2) / Math.abs(dy);
    scale = Math.min(horizontal, vertical);
  }
  return { x: origin.x + (dx * scale), y: origin.y + (dy * scale) };
}

function visualSize(shape, element) {
  if (element?.tag === 'BpmnGateway') return { width: 60, height: 60 };
  if (element?.tag?.includes('Event')) return { width: 35, height: 35 };
  if (element?.tag === 'BpmnDatabase' || element?.tag === 'BpmnDocument') {
    return artifactBodySize(shape);
  }
  return { width: shape.width, height: shape.height };
}

function artifactBodySize(shape) {
  const graphics = descendants(shape.node, (node) => node.localName === 'graphicsAlgorithm');
  const labelTops = graphics
    .filter((node) => ['al:Text', 'al:MultiText'].includes(xmlAttribute(node, 'xsi:type')))
    .map((node) => numericXmlAttribute(node, 'y'))
    .filter((value) => value > 0);
  const labelTop = labelTops.length ? Math.min(...labelTops) : shape.height;
  const geometry = graphics.filter((node) => {
    if (node === shape.graphicsNode) return false;
    if (['al:Text', 'al:MultiText'].includes(xmlAttribute(node, 'xsi:type'))) return false;
    return numericXmlAttribute(node, 'width') > 0 && numericXmlAttribute(node, 'height') > 0;
  });
  const geometryWidth = geometry.length
    ? Math.max(...geometry.map((node) => numericXmlAttribute(node, 'x') + numericXmlAttribute(node, 'width')))
    : shape.width;
  const geometryHeight = geometry.length
    ? Math.max(...geometry.map((node) => numericXmlAttribute(node, 'y') + numericXmlAttribute(node, 'height')))
    : labelTop;
  return {
    width: Math.min(shape.width, geometryWidth || shape.width),
    height: Math.min(shape.height, geometryHeight || labelTop || shape.height)
  };
}

function xmlAttribute(node, name) {
  return node?.attributeMap?.[name]?.value ?? '';
}

function numericXmlAttribute(node, name) {
  const value = Number.parseFloat(xmlAttribute(node, name));
  return Number.isFinite(value) ? value : 0;
}

function elementConfigurationIssues(element, businessById = new Map()) {
  const incoming = splitReferences(element.attributes.incoming)
    .filter((flowId) => !isDocumentaryAssociation(businessById.get(flowId), businessById));
  const outgoing = splitReferences(element.attributes.outgoing)
    .filter((flowId) => !isDocumentaryAssociation(businessById.get(flowId), businessById));
  const issues = [];
  if (element.tag === 'BpmnStartEvent') {
    if (!outgoing.length) issues.push('Evento inicial sem fluxo de saída.');
  } else if (element.tag === 'BpmnEndEvent') {
    if (!incoming.length) issues.push('Evento final sem fluxo de entrada.');
  } else if (['BpmnTask', 'BpmnSubProcess', 'BpmnIntermediateEvent', 'BpmnGateway'].includes(element.tag)) {
    if (!incoming.length) issues.push('Elemento sem fluxo de entrada.');
    if (!outgoing.length) issues.push('Elemento sem fluxo de saída.');
  }
  if (element.tag === 'BpmnIntermediateEvent' && element.type === '36') {
    const linkId = String(element.attributes?.linkId ?? '').trim();
    const receiver = businessById.get(linkId);
    if (!linkId || linkId === '0') {
      issues.push('Evento de envio de link sem evento receptor configurado.');
    } else if (receiver?.tag !== 'BpmnIntermediateEvent' || receiver?.type !== '42') {
      issues.push(`Evento receptor de link inválido: ${linkId}.`);
    }
  }
  if (element.tag === 'BpmnGateway') issues.push(...gatewayConfigurationIssues(element));
  return issues;
}

function isDocumentaryAssociation(flow, businessById) {
  if (flow?.tag !== 'SequenceFlow') return false;
  const artifactTags = new Set(['BpmnAnnotation', 'BpmnDatabase', 'BpmnDocument']);
  return artifactTags.has(businessById.get(flow.attributes.sourceRef)?.tag)
    || artifactTags.has(businessById.get(flow.attributes.targetRef)?.tag);
}

function gatewayConfigurationIssues(element) {
  if (!['120', '121'].includes(element.type)) return [];
  const standardMechanisms = new Set([
      'Associado', 'Campo Formulário', 'Executor Atividade', 'Grupo', 'Grupos Colaborador',
    'Papel', 'Pool Grupo', 'Pool Papel', 'Usuário'
  ]);
  const conditionXml = String(element.attributes.condition ?? '');
  const blocks = conditionXml.match(/<org\.eclipse\.bpmn2\.impl\.ConditionImpl>[\s\S]*?<\/org\.eclipse\.bpmn2\.impl\.ConditionImpl>/g) ?? [];
  const incomplete = blocks.some((block) => {
    const mechanism = block.match(/<mechanism>([^<]*)<\/mechanism>/)?.[1]?.trim() ?? '';
    return standardMechanisms.has(mechanism) && !/<mecanismoAtribuicaoConfiguracao\b/.test(block);
  });
  return incomplete ? ['Condição do gateway com mecanismo padrão não configurado.'] : [];
}

function splitReferences(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

function multilineProperty(name) {
  return ['instrucoes', 'instructions', 'messageContent', 'movementDescription'].includes(name);
}

function propertyDefinition(name, rawValue, options = {}) {
  if (BOOLEAN_PROPERTIES.has(name)) return { name, kind: 'boolean', value: rawValue === 'true' };
  if (name === 'cores') return { name, kind: 'color', value: String(rawValue ?? 'FFFFFF').replace(/^#/, '').toUpperCase() };
  if (['prazoConclusao', 'esforcoPrevisto'].includes(name)) {
    return { name, kind: 'duration', value: minutesToDuration(rawValue) };
  }
  if (name === 'esforcoCalculo') {
    return {
      name,
      kind: 'select',
      value: rawValue ?? '0',
      options: [
        { value: '0', label: 'Não controlar esforço' },
        { value: '1', label: 'Baseado no esforço estimado' },
        { value: '2', label: 'Baseado no apontamento de horas' },
        { value: '3', label: 'Baseado no tempo de conclusão' }
      ]
    };
  }
  if (name === 'executionType') {
    return {
      name,
      kind: 'select',
      value: rawValue ?? '',
      options: [
        { value: '1', label: 'Automatizada' },
        { value: '2', label: 'Imediata' },
        { value: '', label: 'Manual' }
      ]
    };
  }
  if (name === 'messageType') {
    return {
      name,
      kind: 'select',
      value: rawValue ?? '1',
      options: [
        { value: '1', label: 'Texto' },
        { value: '2', label: 'Campo do formulário' }
      ]
    };
  }
  if (name === 'signalId') {
    const current = String(rawValue ?? '0');
    const catalog = [...(options.signalCatalog ?? [])];
    if (current !== '0' && !catalog.some((signal) => signal.value === current)) {
      catalog.push({ value: current, label: `Sinal ${current}` });
    }
    return {
      name,
      kind: 'select',
      value: current,
      options: [
        { value: '0', label: 'Selecione um sinal' },
        ...catalog.map((signal) => ({ value: signal.value, label: signal.label }))
      ]
    };
  }
  if (name === 'linkId') {
    const current = String(rawValue ?? '').trim();
    const catalog = [...(options.intermediateLinkCatalog ?? [])];
    if (current && !catalog.some((item) => item.value === current)) {
      catalog.unshift({ value: current, label: `${current} (valor atual não encontrado)` });
    }
    return {
      name,
      kind: 'select',
      value: current,
      options: [
        {
          value: '',
          label: catalog.length
            ? 'Selecione um evento de recebimento de link'
            : 'Nenhum evento de recebimento de link encontrado'
        },
        ...catalog
      ]
    };
  }
  if (name === 'messageReceiver') {
    return {
      name,
      kind: 'recipient',
      value: rawValue ?? '',
      options: options.formFields.map((field) => ({ value: field, label: field }))
    };
  }
  if (name === 'process') {
    const current = String(rawValue ?? '');
    const catalog = [...(options.processCatalog ?? [])];
    if (current && !catalog.some((item) => item.value === current)) {
      catalog.unshift({ value: current, label: `${current} (valor atual)` });
    }
    return {
      name,
      kind: 'select',
      value: current,
      options: [
        { value: '', label: catalog.length ? 'Selecione um subprocesso' : 'Nenhum processo encontrado no servidor' },
        ...catalog
      ]
    };
  }
  if (name === 'frequencyType') {
    return {
      name,
      kind: 'select',
      value: rawValue ?? '0',
      options: [
        { value: '0', label: 'Minuto' },
        { value: '1', label: 'Hora' },
        { value: '2', label: 'Dia' }
      ]
    };
  }
  if (['executionAttempts', 'frequency'].includes(name)) {
    return { name, kind: 'number', value: rawValue ?? '0', min: 0, step: 1 };
  }
  return { name, kind: multilineProperty(name) ? 'multiline' : 'text', value: rawValue ?? '' };
}

function minutesToDuration(rawValue) {
  const total = Number.parseFloat(rawValue ?? '0');
  if (!Number.isFinite(total) || total < 0) return '000:00';
  const minutes = Math.round(total);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(3, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

module.exports = {
  boundaryPoint,
  diagramElementCode,
  elementConfigurationIssues,
  intermediateLinkCatalogFromElements,
  minutesToDuration,
  signalCatalogFromElements,
  toWebviewData
};
