'use strict';

const { decodeXml, descendants, tokenizeXml } = require('./xmlTokenizer');
const { availableMechanisms, parseAssignmentController } = require('./gatewayConditions');

const INITIALIZER_ROOT = 'org.eclipse.bpmn2.impl.AssignmentControllerColleague';
const SUPPORTED_INITIALIZERS = new Set([
  'BpmnStartEvent:12',
  'BpmnStartEvent:13',
  'BpmnStartEvent:14',
  'BpmnStartEvent:16'
]);

function supportsEventInitializer(element) {
  return SUPPORTED_INITIALIZERS.has(`${element?.tag}:${element?.type}`) || supportsInitializerMechanism(element);
}

// Plain start events store a full assignment mechanism (who may start the process) in initializerConfiguration.
function supportsInitializerMechanism(element) {
  return element?.tag === 'BpmnStartEvent' && String(element.type) === '10';
}

function initializerMechanismDefinition(element, businessById, formFields, mechanismCatalog) {
  const configuration = element.attributes?.initializerConfiguration;
  const mechanism = decodeXml(
    String(configuration ?? '').match(/<mechanismName>([\s\S]*?)<\/mechanismName>/)?.[1] ?? ''
  ).trim();
  return {
    supported: true,
    mechanisms: availableMechanisms(mechanism ? [{ mechanism }] : [], businessById, mechanismCatalog),
    formFields: [...formFields],
    executorNodes: [...businessById.values()]
      .filter((item) => ['BpmnStartEvent', 'BpmnTask', 'BpmnSubProcess'].includes(item.tag))
      .map((item) => ({ id: item.id, name: item.name || item.typeLabel || item.id })),
    mechanism,
    mechanismConfiguration: parseAssignmentController(configuration)
  };
}

function parseInitializerConfiguration(configuration) {
  if (!configuration) return { userId: '' };
  let document;
  try {
    document = tokenizeXml(String(configuration));
  } catch (error) {
    throw new Error(`Inicializador inválido: ${error.message}`);
  }
  const root = document.children[0];
  if (!root || root.name !== INITIALIZER_ROOT) {
    throw new Error('Inicializador incompatível: classe XStream desconhecida.');
  }
  const value = (tag) => {
    const nodes = descendants(root, (node) => node.name === tag);
    if (nodes.length !== 1 || nodes[0].selfClosing || nodes[0].children.length) {
      throw new Error(`Inicializador incompatível: campo <${tag}> ausente ou complexo.`);
    }
    return decodeXml(String(configuration).slice(nodes[0].openEnd, nodes[0].closeStart)).trim();
  };
  const mechanism = value('mechanismName');
  if (mechanism !== 'Usuário') throw new Error(`Inicializador incompatível: mecanismo ${mechanism || '(vazio)'}.`);
  return { userId: value('colleagueId') };
}

function eventInitializerDefinition(element, userCatalog = [], businessById = new Map(), formFields = [], mechanismCatalog = []) {
  if (!supportsEventInitializer(element)) return null;
  if (supportsInitializerMechanism(element)) {
    return initializerMechanismDefinition(element, businessById, formFields, mechanismCatalog);
  }
  try {
    const { userId } = parseInitializerConfiguration(element.attributes?.initializerConfiguration);
    const options = [...userCatalog];
    if (userId && !options.some((option) => option.value === userId)) {
      options.unshift({ value: userId, label: `${userId} (atual; não encontrado no cache)` });
    }
    return { supported: true, userId, options };
  } catch (error) {
    return { supported: false, reason: error.message, options: [] };
  }
}

function serializeInitializerConfiguration(userId) {
  const value = String(userId ?? '').trim();
  if (!value || /[\r\n<>]/.test(value)) throw new Error('Código de usuário inicializador inválido.');
  return [
    `<${INITIALIZER_ROOT}>`,
    `  <colleagueId>${encodeXmlText(value)}</colleagueId>`,
    '  <mechanismName>Usuário</mechanismName>',
    `</${INITIALIZER_ROOT}>`
  ].join('\n');
}

function encodeXmlText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

module.exports = {
  eventInitializerDefinition,
  parseInitializerConfiguration,
  serializeInitializerConfiguration,
  supportsEventInitializer,
  supportsInitializerMechanism
};
