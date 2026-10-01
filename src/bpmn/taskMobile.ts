'use strict';

const { decodeXml, descendants, tokenizeXml } = require('./xmlTokenizer');

const SUPPORTED_TASK_TYPES = new Set(['80', '81']);
const FIELD_ORDER = ['title', 'description', 'highlight', 'approve', 'reject'];
const TEXT_LIMITS = Object.freeze({ title: 28, highlight: 30, description: 140 });

function supportsTaskMobile(element) {
  return element?.tag === 'BpmnTask' && SUPPORTED_TASK_TYPES.has(String(element.type));
}

function taskMobileDefinition(element, flows = [], businessById = new Map(), formFields = []) {
  if (!supportsTaskMobile(element)) return null;
  const values = taskMobileValues(element.attributes?.appsConfiguration);
  const actionOptions = taskMobileActionOptions(element, flows, businessById);
  for (const current of [values.approve, values.reject]) {
    if (current && !actionOptions.some((option) => option.value === current)) {
      actionOptions.push({ value: current, label: `Destino configurado (${current})` });
    }
  }
  return {
    ...values,
    actionOptions,
    formFields: [...formFields],
    limits: { ...TEXT_LIMITS }
  };
}

function taskMobileValues(appsConfiguration) {
  const values = Object.fromEntries(FIELD_ORDER.map((field) => [field, '']));
  if (!appsConfiguration) return values;
  const fields = mobileFieldNodes(appsConfiguration);
  for (const field of FIELD_ORDER) {
    const node = fields.get(field);
    if (node) values[field] = decodeXml(appsConfiguration.slice(node.openEnd, node.closeStart));
  }
  return values;
}

function taskMobileActionOptions(element, flows, businessById) {
  const options = [];
  const seen = new Set();
  const add = (targetId, label) => {
    const value = numericSuffix(targetId);
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({ value, label: `${label || targetId} (${value})` });
  };

  for (const flowId of splitReferences(element.attributes?.outgoing)) {
    const flow = flows.find((item) => item.id === flowId);
    const targetId = flow?.attributes?.targetRef;
    const target = businessById.get(targetId);
    if (targetId) add(targetId, target?.name || target?.typeLabel);
  }
  for (const flowId of splitReferences(element.attributes?.incoming)) {
    const flow = flows.find((item) => item.id === flowId);
    if (flow?.attributes?.permiteRetorno !== 'true') continue;
    const sourceId = flow.attributes.sourceRef;
    const source = businessById.get(sourceId);
    add(sourceId, flow.attributes.atividadeRetorno || source?.name || source?.typeLabel);
  }
  return options;
}

function normalizeTaskMobileConfiguration(requested, actionOptions) {
  const normalized = {
    title: normalizedText(requested?.title, 'Título', TEXT_LIMITS.title),
    description: normalizedText(requested?.description, 'Descrição', TEXT_LIMITS.description),
    highlight: normalizedText(requested?.highlight, 'Destaque', TEXT_LIMITS.highlight),
    approve: normalizedAction(requested?.approve, 'Aprovar', actionOptions),
    reject: normalizedAction(requested?.reject, 'Rejeitar', actionOptions)
  };
  return normalized;
}

function serializeTaskMobileConfiguration(configuration) {
  const lines = ['<map>', '  <entry>', '    <string>approval</string>', '    <list>'];
  for (const field of FIELD_ORDER) {
    lines.push(
      '      <org.eclipse.bpmn2.documentacional.BpmnProcessAppConfiguration>',
      `        <appField>${field}</appField>`,
      `        <description>${encodeEmbeddedText(configuration[field])}</description>`,
      '      </org.eclipse.bpmn2.documentacional.BpmnProcessAppConfiguration>'
    );
  }
  lines.push('    </list>', '  </entry>', '</map>');
  return lines.join('\n');
}

function patchTaskMobileConfiguration(appsConfiguration, configuration) {
  const fields = mobileFieldNodes(appsConfiguration, true);
  const patches = FIELD_ORDER.map((field) => {
    const node = fields.get(field);
    return {
      start: node.openEnd,
      end: node.closeStart,
      value: encodeEmbeddedText(configuration[field])
    };
  });
  let output = appsConfiguration;
  for (const patch of patches.sort((left, right) => right.start - left.start)) {
    output = output.slice(0, patch.start) + patch.value + output.slice(patch.end);
  }
  return output;
}

function mobileFieldNodes(appsConfiguration, requireAll = false) {
  let document;
  try {
    document = tokenizeXml(appsConfiguration);
  } catch (error) {
    throw new Error(`Bloco appsConfiguration inválido: ${error.message}`);
  }
  const root = document.children[0];
  if (!root || root.name !== 'map') throw new Error('Bloco appsConfiguration inválido: raiz <map> esperada.');
  const configurations = descendants(root, (node) => (
    node.name === 'org.eclipse.bpmn2.documentacional.BpmnProcessAppConfiguration'
  ));
  const result = new Map();
  for (const configuration of configurations) {
    const appField = directSimpleChild(configuration, 'appField', appsConfiguration);
    const description = directSimpleChild(configuration, 'description', appsConfiguration);
    const name = decodeXml(appsConfiguration.slice(appField.openEnd, appField.closeStart));
    if (!FIELD_ORDER.includes(name)) continue;
    if (result.has(name)) throw new Error(`Bloco appsConfiguration inválido: campo ${name} duplicado.`);
    result.set(name, description);
  }
  if (requireAll) {
    const missing = FIELD_ORDER.filter((field) => !result.has(field));
    if (missing.length) throw new Error(`Bloco appsConfiguration incompleto: faltam ${missing.join(', ')}.`);
  }
  return result;
}

function directSimpleChild(node, name, source) {
  const matches = node.children.filter((child) => child.name === name);
  if (matches.length !== 1 || matches[0].selfClosing || matches[0].children.length) {
    throw new Error(`Bloco appsConfiguration sem o campo simples <${name}> esperado.`);
  }
  return matches[0];
}

function normalizedText(value, label, maximum) {
  const normalized = String(value ?? '').replace(/\r\n|\r|\n/g, '\n');
  const literalLength = normalized.replace(/@\[form:[^\]]+\]/g, '').length;
  if (literalLength > maximum) throw new Error(`${label} excede o limite de ${maximum} caracteres de texto.`);
  return normalized;
}

function normalizedAction(value, label, actionOptions) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (!/^\d+$/.test(normalized)) throw new Error(`Ação ${label} inválida.`);
  if (!actionOptions.some((option) => option.value === normalized)) {
    throw new Error(`Ação ${label} aponta para uma atividade que não está disponível neste elemento.`);
  }
  return normalized;
}

function encodeEmbeddedText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#xd;');
}

function splitReferences(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

function numericSuffix(value) {
  return String(value ?? '').match(/(\d+)$/)?.[1] ?? '';
}

module.exports = {
  FIELD_ORDER,
  TEXT_LIMITS,
  normalizeTaskMobileConfiguration,
  patchTaskMobileConfiguration,
  serializeTaskMobileConfiguration,
  supportsTaskMobile,
  taskMobileActionOptions,
  taskMobileDefinition,
  taskMobileValues
};
