'use strict';

const { attr } = require('./processModel');
const { parseGatewayConditions } = require('./gatewayConditions');

function validateProcess(model) {
  const findings = [];
  if (!model.supported) {
    add(findings, 'error', 'FMT-001', `Formato não suportado: ${model.format}.`);
    return result(findings);
  }

  const businessObjects = [...model.elements, ...model.flows];
  const byId = new Map();
  for (const element of businessObjects) {
    if (!element.id) {
      add(findings, 'error', 'IDS-001', `${element.tag} sem id.`);
      continue;
    }
    if (byId.has(element.id)) add(findings, 'error', 'IDS-002', `Id duplicado: ${element.id}.`, element.id);
    byId.set(element.id, element);
  }

  for (const flow of model.flows) {
    const sourceId = flow.attributes.sourceRef;
    const targetId = flow.attributes.targetRef;
    const source = byId.get(sourceId);
    const target = byId.get(targetId);
    if (!source) add(findings, 'error', 'TRIPLA-001', `Origem inexistente ${sourceId} em ${flow.id}.`, flow.id);
    if (!target) add(findings, 'error', 'TRIPLA-002', `Destino inexistente ${targetId} em ${flow.id}.`, flow.id);
    if (source && !splitRefs(source.attributes.outgoing).includes(flow.id)) {
      add(findings, 'error', 'TRIPLA-003', `${source.id}.outgoing não contém ${flow.id}.`, flow.id);
    }
    if (target && !splitRefs(target.attributes.incoming).includes(flow.id)) {
      add(findings, 'error', 'TRIPLA-004', `${target.id}.incoming não contém ${flow.id}.`, flow.id);
    }
    if (['true', '1'].includes(flow.attributes.defaultLink)
      && !(source?.tag === 'BpmnGateway' && ['120', '121'].includes(String(source.type)))) {
      add(findings, 'error', 'COND-007', `${flow.id} é padrão, mas sua origem não é um gateway exclusivo ou inclusivo.`, flow.id);
    }
    if (!flow.connection) add(findings, 'error', 'LINK-001', `Fluxo ${flow.id} não possui conexão visual.`, flow.id);
    const visualLabel = attr(flow.connection?.labelNode, 'value');
    if (flow.name !== visualLabel) {
      add(findings, 'error', 'LABEL-001', `Nome lógico e label visual divergem em ${flow.id}.`, flow.id);
    }
  }

  validateVisualConnections(model, byId, findings);

  for (const element of model.elements) {
    if (element.tag === 'BpmnProcess') continue;
    if (!element.shape) add(findings, 'warning', 'LINK-002', `${element.id} não possui shape visual.`, element.id);
    if (element.tag === 'BpmnGateway') validateGatewayConditions(element, byId, findings);
    if (element.tag === 'BpmnIntermediateEvent' && element.type === '36') {
      validateIntermediateLink(element, byId, findings);
    }
  }

  if (model.process && model.diagram) {
    const diagramName = attr(model.diagram, 'name');
    if (diagramName !== model.process.id) {
      add(findings, 'error', 'FMT-002', `Diagram@name (${diagramName}) diverge de BpmnProcess@id (${model.process.id}).`);
    }
  }

  return result(findings);
}

function validateIntermediateLink(element, byId, findings) {
  const linkId = String(element.attributes.linkId ?? '').trim();
  if (!linkId || linkId === '0') {
    add(findings, 'warning', 'EVENT-LINK-001', `${element.id} não possui evento receptor de link configurado.`, element.id);
    return;
  }
  const receiver = byId.get(linkId);
  if (receiver?.tag !== 'BpmnIntermediateEvent' || receiver?.type !== '42') {
    add(findings, 'warning', 'EVENT-LINK-002', `${element.id} aponta para um receptor de link inválido: ${linkId}.`, element.id);
  }
}

function validateGatewayConditions(gateway, byId, findings) {
  const parsed = parseGatewayConditions(gateway.attributes.condition);
  if (!parsed.supported) {
    add(findings, 'warning', 'COND-001', `${gateway.id}: ${parsed.reason}`, gateway.id);
    return;
  }
  const outgoingFlowIds = splitRefs(gateway.attributes.outgoing);
  const outgoingFlows = outgoingFlowIds.map((id) => byId.get(id)).filter((item) => item?.tag === 'SequenceFlow');
  const outgoingTargets = new Set(outgoingFlows.map((flow) => flow.attributes.targetRef));
  for (const condition of parsed.conditions) {
    if (!condition.targetTask) {
      add(findings, 'error', 'COND-004', `${gateway.id} possui condição sem targetTask.`, gateway.id);
    } else if (!byId.has(condition.targetTask)) {
      add(findings, 'error', 'COND-003', `${gateway.id} aponta condição para nó inexistente ${condition.targetTask}.`, gateway.id);
    } else if (!outgoingTargets.has(condition.targetTask)) {
      add(findings, 'error', 'COND-002', `${gateway.id} aponta condição para ${condition.targetTask}, que não é uma saída direta.`, gateway.id);
    }
  }
  const defaultFlows = outgoingFlows.filter((flow) => ['true', '1'].includes(flow.attributes.defaultLink));
  if (defaultFlows.length > 1) {
    add(findings, 'error', 'COND-006', `${gateway.id} possui mais de um fluxo padrão.`, gateway.id);
  }
}

function validateVisualConnections(model, byId, findings) {
  if (!model.diagram) return;
  const shapes = model.diagram.children.filter((node) => node.localName === 'children');
  const connections = model.diagram.children.filter((node) => node.localName === 'connections');
  const pictogramLinks = splitRefs(attr(model.diagram, 'pictogramLinks'));
  connections.forEach((connectionNode, connectionIndex) => {
    const link = connectionNode.children.find((node) => node.localName === 'link');
    const flowId = attr(link, 'businessObjects');
    const flow = byId.get(flowId);
    if (!flow || flow.tag !== 'SequenceFlow') {
      add(findings, 'error', 'LINK-003', `Conexão visual ${connectionIndex} aponta para fluxo inexistente ${flowId || '(vazio)'}.`, flowId);
      return;
    }
    const sourceShape = model.shapeById.get(flow.attributes.sourceRef);
    const targetShape = model.shapeById.get(flow.attributes.targetRef);
    const sourceIndex = shapes.indexOf(sourceShape?.node);
    const targetIndex = shapes.indexOf(targetShape?.node);
    const expectedStart = `/0/@children.${sourceIndex}/@anchors.0`;
    const expectedEnd = `/0/@children.${targetIndex}/@anchors.0`;
    if (sourceIndex < 0 || attr(connectionNode, 'start') !== expectedStart) {
      add(findings, 'error', 'POS-001', `Origem visual de ${flowId} não corresponde a ${flow.attributes.sourceRef}.`, flowId);
    }
    if (targetIndex < 0 || attr(connectionNode, 'end') !== expectedEnd) {
      add(findings, 'error', 'POS-002', `Destino visual de ${flowId} não corresponde a ${flow.attributes.targetRef}.`, flowId);
    }
    const connectionRef = `/0/@connections.${connectionIndex}`;
    const sourceAnchor = sourceShape?.node.children.find((node) => node.localName === 'anchors');
    const targetAnchor = targetShape?.node.children.find((node) => node.localName === 'anchors');
    if (!splitRefs(attr(sourceAnchor, 'outgoingConnections')).includes(connectionRef)) {
      add(findings, 'error', 'POS-003', `Anchor de origem de ${flowId} não referencia ${connectionRef}.`, flowId);
    }
    if (!splitRefs(attr(targetAnchor, 'incomingConnections')).includes(connectionRef)) {
      add(findings, 'error', 'POS-004', `Anchor de destino de ${flowId} não referencia ${connectionRef}.`, flowId);
    }
    if (!pictogramLinks.includes(`${connectionRef}/@link`)) {
      add(findings, 'error', 'POS-005', `pictogramLinks não contém o link de ${flowId}.`, flowId);
    }
  });
}

function splitRefs(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

function add(findings, severity, code, message, elementId = '') {
  findings.push({ severity, code, message, elementId });
}

function result(findings) {
  const errors = findings.filter((item) => item.severity === 'error');
  const warnings = findings.filter((item) => item.severity === 'warning');
  const infos = findings.filter((item) => item.severity === 'info');
  return { ok: errors.length === 0, errors, warnings, infos, findings };
}

module.exports = { validateProcess };
