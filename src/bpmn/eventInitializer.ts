'use strict';

const { decodeXml, descendants, tokenizeXml } = require('./xmlTokenizer');

const INITIALIZER_ROOT = 'org.eclipse.bpmn2.impl.AssignmentControllerColleague';
const SUPPORTED_INITIALIZERS = new Set([
  'BpmnStartEvent:12',
  'BpmnStartEvent:13',
  'BpmnStartEvent:14',
  'BpmnStartEvent:16'
]);

function supportsEventInitializer(element) {
  return SUPPORTED_INITIALIZERS.has(`${element?.tag}:${element?.type}`);
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

function eventInitializerDefinition(element, userCatalog = []) {
  if (!supportsEventInitializer(element)) return null;
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
  supportsEventInitializer
};
